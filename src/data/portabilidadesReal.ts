/* Portabilidades — camada de dados REAL (Supabase).
   Devolve os MESMOS tipos da demonstração (src/data/portabilidades.ts): a tela é uma só
   ("demo é o contrato"). Escrita só por RPC (migration 20261013170000_portabilidades.sql);
   leitura direta com RLS por org. A divisão vem gravada na linha (calculada no banco). */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useOrg } from '@/context/OrgContext';
import { useAuth } from '@/context/AuthContext';
import { useVisibilidade } from '@/lib/visibilidade';
import { buscarKeyset } from './paginacao';
import { telefoneTela } from './pendencias';
import type { Aceite, Atendente, ClientePort, EstadoLink, EventoPort, Portabilidade } from './portabilidades';

type Row = Record<string, unknown>;
const primeiro = (n: string) => (n ?? '').trim().split(/\s+/)[0] || '—';
const opc = (v: unknown) => (v ? String(v) : undefined);

const COLUNAS = 'id, contato_id, atendente_id, valor_cliente, valor_escritorio, valor_atendente, aceite, aceite_em, desbloqueado_em, '
  + 'link_enviado_em, link_feito_em, concluida_em, criado_em, atualizado_em, '
  + 'contatos(id, nome, telefone, responsavel_id), portabilidades_eventos(id, quando, tipo, texto, autor_id)';

export interface DadosPort {
  portabilidades: Portabilidade[];
  clientes: ClientePort[];
  /** quem pode receber portabilidade (membros ativos) */
  atendentes: Atendente[];
  /** todos os usuários da org (nomes do histórico, inclusive inativos) */
  nomes: Record<string, string>;
}

export function usePortReal() {
  const { currentOrg } = useOrg();
  const org = currentOrg?.id;
  const { user } = useAuth();
  // visibilidade (22/10): quem não vê todos recebe só as portabilidades DELE (atendente_id)
  const vis = useVisibilidade();
  const soDe = vis.veTodos ? null : vis.uid;
  const q = useQuery({
    queryKey: ['portabilidades', org, soDe ?? 'todos'],
    enabled: !!supabase && !!org && (vis.veTodos || !!soDe),
    refetchInterval: 30_000,
    queryFn: async (): Promise<DadosPort> => {
      const sb = supabase!;
      const [linhas, ur] = await Promise.all([
        /* teto de 1000 do PostgREST: pagina por id (ver paginacao.ts) */
        buscarKeyset<Row>(
          (cursor, tamanho) => {
            let b = sb.from('portabilidades').select(COLUNAS).eq('organizacao_id', org!).is('excluida_em', null)
              .order('id', { ascending: false }).limit(tamanho);
            if (soDe) b = b.eq('atendente_id', soDe);
            if (cursor) b = b.lt('id', cursor);
            return b as unknown as PromiseLike<{ data: Row[] | null; error: { message?: string } | null }>;
          },
          (r) => String(r.id),
          { rotulo: 'portabilidades' },
        ),
        sb.from('organizacao_usuarios').select('status, usuarios(id, nome)').eq('organizacao_id', org!),
      ]);
      if (ur.error) throw new Error(ur.error.message);

      const nomes: Record<string, string> = {};
      const atendentes: Atendente[] = [];
      for (const r of (ur.data as Row[]) ?? []) {
        const u = r.usuarios as Row | null;
        if (!u?.id) continue;
        nomes[u.id as string] = primeiro(u.nome as string);
        if (r.status === 'ativo') atendentes.push({ id: u.id as string, nome: primeiro(u.nome as string) });
      }
      atendentes.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

      const clientes = new Map<string, ClientePort>();
      const portabilidades = linhas.map((r): Portabilidade => {
        const c = r.contatos as Row | null;
        if (c?.id && !clientes.has(c.id as string)) {
          clientes.set(c.id as string, {
            id: c.id as string, nome: ((c.nome as string) || 'Cliente').toUpperCase(), telefone: telefoneTela((c.telefone as string) || ''),
            responsavelId: opc(c.responsavel_id), responsavel: c.responsavel_id ? nomes[c.responsavel_id as string] ?? '—' : '—',
          });
        }
        const vc = Number(r.valor_cliente); const ve = Number(r.valor_escritorio); const va = Number(r.valor_atendente);
        const eventos = ((r.portabilidades_eventos as Row[]) ?? [])
          .map((e): EventoPort => ({
            id: String(e.id), quando: e.quando as string, texto: e.texto as string, tipo: e.tipo as EventoPort['tipo'],
            autor: e.autor_id ? nomes[e.autor_id as string] ?? '—' : 'Sistema',
          }))
          .sort((a, b) => new Date(a.quando).getTime() - new Date(b.quando).getTime() || Number(a.id) - Number(b.id));
        return {
          id: r.id as string, clienteId: r.contato_id as string, atendenteId: r.atendente_id as string,
          valorTotal: vc, divisao: { cliente: vc - ve, escritorio: ve, atendente: va, escritorioLiquido: ve - va },
          aceite: r.aceite as Aceite, aceiteEm: opc(r.aceite_em), desbloqueadoEm: opc(r.desbloqueado_em),
          linkEnviadoEm: opc(r.link_enviado_em), linkFeitoEm: opc(r.link_feito_em), concluidaEm: opc(r.concluida_em),
          criadaEm: r.criado_em as string, atualizadaEm: r.atualizado_em as string, eventos,
        };
      });
      return { portabilidades, clientes: [...clientes.values()], atendentes, nomes };
    },
  });
  const recarregar = async () => { await q.refetch(); };
  return { ...q, org, usuario: { id: user?.id ?? '', nome: primeiro(user?.name ?? ''), veTodos: vis.veTodos }, recarregar };
}

/** Nova portabilidade: qualquer contato da org por nome ou telefone (sem busca = os mexidos por último) */
export function useBuscaClientesReal(busca: string) {
  const { currentOrg } = useOrg();
  const org = currentOrg?.id;
  const vis = useVisibilidade();
  const soDe = vis.veTodos ? null : vis.uid;
  return useQuery({
    queryKey: ['port-busca', org, busca.trim(), soDe ?? 'todos'],
    enabled: !!supabase && !!org && (vis.veTodos || !!soDe),
    staleTime: 20_000,
    placeholderData: (anterior) => anterior,
    queryFn: async (): Promise<(ClientePort & { abertas: number })[]> => {
      const { data, error } = await supabase!.rpc('portabilidades_buscar_clientes', { p_org: org, p_busca: busca.trim() || null, p_limite: 8 });
      if (error) throw new Error(error.message);
      // visibilidade (22/10): só os clientes de que o usuário é o responsável
      return ((data as Row[]) ?? []).filter((r) => !soDe || r.responsavel_id === soDe).map((r) => ({
        id: r.contato_id as string, nome: ((r.nome as string) || 'Cliente').toUpperCase(), telefone: telefoneTela((r.telefone as string) || ''),
        responsavelId: opc(r.responsavel_id), responsavel: r.responsavel_nome ? primeiro(r.responsavel_nome as string) : '—',
        abertas: Number(r.abertas ?? 0),
      }));
    },
  });
}

async function rpc(nome: string, args: Record<string, unknown>) {
  const { data, error } = await supabase!.rpc(nome, args);
  if (error) throw new Error(error.message);
  return data;
}

export const rpcPort = {
  criar: async (d: { clienteId: string; valorTotal: number; atendenteId: string }) =>
    String(await rpc('portabilidade_criar', { p_contato: d.clienteId, p_valor: d.valorTotal, p_atendente: d.atendenteId })),
  aceite: async (id: string, a: Aceite) => { await rpc('portabilidade_aceite', { p_id: id, p_aceite: a }); },
  desbloqueio: async (id: string, feito: boolean) => { await rpc('portabilidade_desbloqueio', { p_id: id, p_feito: feito }); },
  link: async (id: string, l: EstadoLink) => { await rpc('portabilidade_link', { p_id: id, p_estado: l }); },
  concluir: async (id: string) => { await rpc('portabilidade_concluir', { p_id: id }); },
  reabrir: async (id: string) => { await rpc('portabilidade_reabrir', { p_id: id }); },
  valor: async (id: string, total: number) => { await rpc('portabilidade_valor', { p_id: id, p_valor: total }); },
  trocarAtendente: async (id: string, atendenteId: string) => { await rpc('portabilidade_atendente', { p_id: id, p_atendente: atendenteId }); },
  anotar: async (id: string, texto: string) => { await rpc('portabilidade_anotar', { p_id: id, p_texto: texto }); },
  excluir: async (id: string) => { await rpc('portabilidade_excluir', { p_id: id }); },
};

/** a conversa do cliente para o "Abrir conversa" (a mais recente; null = ainda não tem) */
export async function conversaDoContato(contatoId: string): Promise<string | null> {
  const { data, error } = await supabase!.from('conversas').select('id')
    .eq('contato_id', contatoId).order('ultima_interacao_em', { ascending: false, nullsFirst: false }).limit(1);
  if (error) throw new Error(error.message);
  return ((data as Row[]) ?? [])[0]?.id as string ?? null;
}
