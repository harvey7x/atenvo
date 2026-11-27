import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useOrg } from '@/context/OrgContext';

/* ------------------------------------------------------------------
   IMPORTAÇÃO DO SISTEMA ANTERIOR (26/11, dono: "já pega todo o Kanban deles e integra no nosso… para quando eles chegarem
   já estiver pronto, eles só precisem conectar algumas coisas"). O Kanban veio do arquivo oficial de exportação do sistema
   que a Reviza usava antes: cada cliente virou contato + card na MESMA etapa. Aqui o administrador vê o que veio e, quando
   a equipe tiver login, passa os cards de cada responsável de lá para a pessoa daqui (pelo nome, ou escolhendo).
   Servidor: migration 117 (atd_guimoo_estado + atd_guimoo_ligar_responsaveis). Recurso 'importacao'.
   DEMO É O CONTRATO: sem backend, os mesmos hooks guardam no navegador.
   ------------------------------------------------------------------ */

export const IMPORTACAO_REAL: boolean = isSupabaseConfigured && !!supabase;

export interface RespDeLa { nome: string; qtd: number; abertos: number; ligadoA: string | null; ligadoNome: string | null }
export interface EstadoImportacao {
  linhas: number;
  contatos: number;
  lidoEm: string | null;
  aplicadoEm: string | null;
  porEtapa: { etapa: string; qtd: number }[];
  porStatus: { abertos: number; vendas: number; descartados: number };
  responsaveis: RespDeLa[];
  equipe: { id: string; nome: string }[];
  mensagens: number;
}

export const SEM_RESPONSAVEL = 'Sem responsável';

/** "sem acento, sem maiúscula" — o mesmo critério do servidor para achar a pessoa pelo nome */
export const nomeChave = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
/** quem da equipe tem o mesmo nome do responsável de lá (o "Ligar pelo nome" faria isso) */
export function mesmoNome(resp: RespDeLa, equipe: { id: string; nome: string }[]) {
  return resp.nome === SEM_RESPONSAVEL ? null : equipe.find((p) => nomeChave(p.nome) === nomeChave(resp.nome)) ?? null;
}

export function deEstado(j: Record<string, unknown>): EstadoImportacao {
  const st = (j.por_status as Record<string, number>) ?? {};
  return {
    linhas: Number(j.linhas) || 0,
    contatos: Number(j.contatos) || 0,
    lidoEm: (j.lido_em as string) ?? null,
    aplicadoEm: (j.aplicado_em as string) ?? null,
    porEtapa: ((j.por_etapa as { etapa: string; qtd: number }[]) ?? []).map((e) => ({ etapa: e.etapa, qtd: Number(e.qtd) || 0 })),
    porStatus: { abertos: Number(st.em_andamento) || 0, vendas: Number(st.ganho) || 0, descartados: Number(st.perdido) || 0 },
    responsaveis: ((j.responsaveis as Record<string, unknown>[]) ?? []).map((r) => ({
      nome: String(r.nome), qtd: Number(r.qtd) || 0, abertos: Number(r.abertos) || 0,
      ligadoA: (r.ligado_a as string) ?? null, ligadoNome: (r.ligado_nome as string) ?? null,
    })),
    equipe: ((j.equipe as { id: string; nome: string }[]) ?? []).map((p) => ({ id: p.id, nome: p.nome || 'Sem nome' })),
    mensagens: Number(j.mensagens) || 0,
  };
}

/* ---------------- demonstração ---------------- */
const G = 'previa-importacao-anterior';
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));
const EQUIPE_DEMO = [{ id: 'demo-u-1', nome: 'Carla Menezes' }, { id: 'demo-u-2', nome: 'Rodrigo' }, { id: 'demo-u-3', nome: 'Juliana Prates' }];
const DEMO: EstadoImportacao = {
  linhas: 1240, contatos: 1236, lidoEm: '2026-11-26T14:58:00-03:00', aplicadoEm: '2026-11-26T15:02:00-03:00',
  porEtapa: [{ etapa: 'ATENDIMENTO IA', qtd: 980 }, { etapa: 'FECHADOS', qtd: 121 }, { etapa: 'DOCUMENTAÇÃO', qtd: 64 }, { etapa: 'EM NEGOCIACAO', qtd: 38 }, { etapa: 'LEAD NOVO', qtd: 22 }, { etapa: 'LEAD DESCARTADO', qtd: 15 }],
  porStatus: { abertos: 1104, vendas: 121, descartados: 15 },
  responsaveis: [
    { nome: SEM_RESPONSAVEL, qtd: 702, abertos: 690, ligadoA: null, ligadoNome: null },
    { nome: 'Carla Menezes', qtd: 214, abertos: 180, ligadoA: null, ligadoNome: null },
    { nome: 'RODRIGO', qtd: 166, abertos: 140, ligadoA: null, ligadoNome: null },
    { nome: 'Juliana', qtd: 98, abertos: 61, ligadoA: null, ligadoNome: null },
    { nome: '#4821', qtd: 60, abertos: 33, ligadoA: null, ligadoNome: null },
  ],
  equipe: EQUIPE_DEMO,
  mensagens: 16240,
};
function lerDemo(): EstadoImportacao {
  try { const s = localStorage.getItem(G); if (s) return JSON.parse(s) as EstadoImportacao; } catch { /* sem navegador */ }
  return structuredClone(DEMO);
}
function gravarDemo(e: EstadoImportacao) { try { localStorage.setItem(G, JSON.stringify(e)); } catch { /* sem navegador */ } }

const C = 'atd-importacao-anterior';

export function useEstadoImportacao() {
  const { currentOrg } = useOrg();
  return useQuery({
    queryKey: [C, currentOrg.id],
    enabled: !!currentOrg.id,
    queryFn: async (): Promise<EstadoImportacao> => {
      if (!IMPORTACAO_REAL) { await espera(120); return lerDemo(); }
      const { data, error } = await supabase!.rpc('atd_guimoo_estado');
      if (error) throw new Error(error.message);
      return deEstado((data ?? {}) as Record<string, unknown>);
    },
  });
}

const MSG: Record<string, string> = {
  sem_permissao: 'Só o administrador passa os cards.',
  pessoa_invalida: 'Essa pessoa não está ativa na equipe.',
};
const erroLegivel = (m: string) => MSG[Object.keys(MSG).find((k) => m.includes(k)) ?? ''] ?? m;

/** sem nome: liga sozinho quem tem o mesmo nome; com nome + pessoa: passa os cards; com nome e pessoa vazia: desfaz */
export function useLigarResponsaveis() {
  const { currentOrg } = useOrg();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (a: { nome?: string; pessoaId?: string | null }): Promise<number> => {
      if (!IMPORTACAO_REAL) {
        await espera(200);
        const e = lerDemo(); let n = 0;
        for (const r of e.responsaveis) {
          if (a.nome !== undefined && r.nome !== a.nome) continue;
          const p = a.nome === undefined ? mesmoNome(r, e.equipe) : e.equipe.find((x) => x.id === a.pessoaId) ?? null;
          if (a.nome === undefined && !p) continue;
          if ((p?.id ?? null) === r.ligadoA) continue;
          r.ligadoA = p?.id ?? null; r.ligadoNome = p?.nome ?? null; n += r.qtd;
        }
        gravarDemo(e); return n;
      }
      const { data, error } = await supabase!.rpc('atd_guimoo_ligar_responsaveis', a.nome === undefined ? {} : { p_nome: a.nome, p_usuario: a.pessoaId ?? null });
      if (error) throw new Error(erroLegivel(error.message));
      return Number((data as { cards?: number } | null)?.cards) || 0;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [C, currentOrg.id] });
      qc.invalidateQueries({ queryKey: ['kanban-leads', currentOrg.id] });
    },
  });
}

/* ---------------- as conversas (migrations 118, 119 e 122) ---------------- */
export interface ConexaoDeLa { conexao: string; conversas: number; abertas: number; semNumero: number; canalId: string | null; canalNome: string | null }
export interface NumeroDaqui { id: string; nome: string; numero: string | null; ativo: boolean }
export interface ConversasImportadas {
  contatosLa: number; baixados: number; mensagensBaixadas: number; aplicados: number; conversas: number; mensagens: number; ultimaBaixa: string | null;
  conexoes: ConexaoDeLa[]; numeros: NumeroDaqui[];
}
export const SEM_CONEXAO = 'Sem conexão lá';
export const nomeConexao = (c: string) => (c ? c : SEM_CONEXAO);

const G_CONV = 'previa-importacao-conversas';
const CONV_DEMO: ConversasImportadas = {
  contatosLa: 1480, baixados: 1480, mensagensBaixadas: 16240, aplicados: 1480, conversas: 1105, mensagens: 16240, ultimaBaixa: '2026-11-26T15:40:00-03:00',
  conexoes: [
    { conexao: 'WhatsApp 4', conversas: 420, abertas: 160, semNumero: 420, canalId: null, canalNome: null },
    { conexao: 'WhatsApp 6', conversas: 318, abertas: 64, semNumero: 318, canalId: null, canalNome: null },
    { conexao: 'Atendimento Reviza', conversas: 52, abertas: 9, semNumero: 52, canalId: null, canalNome: null },
    { conexao: '', conversas: 315, abertas: 40, semNumero: 315, canalId: null, canalNome: null },
  ],
  numeros: [{ id: 'demo-chip-1', nome: 'Chip 1', numero: '5551900000001', ativo: true }, { id: 'demo-chip-2', nome: 'Comercial', numero: '5551900000002', ativo: true }],
};
function lerConvDemo(): ConversasImportadas {
  try { const s = localStorage.getItem(G_CONV); if (s) return JSON.parse(s) as ConversasImportadas; } catch { /* sem navegador */ }
  return structuredClone(CONV_DEMO);
}

export function useConversasImportadas() {
  const { currentOrg } = useOrg();
  return useQuery({
    queryKey: [C, currentOrg.id, 'conversas'],
    enabled: !!currentOrg.id,
    queryFn: async (): Promise<ConversasImportadas> => {
      if (!IMPORTACAO_REAL) { await espera(120); return lerConvDemo(); }
      const [a, b] = await Promise.all([supabase!.rpc('atd_guimoo_mensagens_estado'), supabase!.rpc('atd_guimoo_conexoes')]);
      if (a.error) throw new Error(a.error.message);
      if (b.error) throw new Error(b.error.message);
      const m = (a.data ?? {}) as Record<string, unknown>; const c = (b.data ?? {}) as Record<string, unknown>;
      return {
        contatosLa: Number(m.contatos_la) || 0, baixados: Number(m.baixados) || 0, mensagensBaixadas: Number(m.mensagens_baixadas) || 0,
        aplicados: Number(m.aplicados) || 0, conversas: Number(m.conversas) || 0, mensagens: Number(m.mensagens) || 0, ultimaBaixa: (m.ultima_baixa as string) ?? null,
        conexoes: ((c.conexoes as Record<string, unknown>[]) ?? []).map((x) => ({
          conexao: String(x.conexao ?? ''), conversas: Number(x.conversas) || 0, abertas: Number(x.abertas) || 0, semNumero: Number(x.sem_numero) || 0,
          canalId: (x.canal_id as string) ?? null, canalNome: (x.canal_nome as string) ?? null,
        })),
        numeros: ((c.numeros as Record<string, unknown>[]) ?? []).map((x) => ({ id: String(x.id), nome: String(x.nome ?? 'Número'), numero: (x.numero as string) ?? null, ativo: x.ativo !== false })),
      };
    },
  });
}

export function useLigarConexao() {
  const { currentOrg } = useOrg();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ conexao, canalId }: { conexao: string; canalId: string }): Promise<number> => {
      if (!IMPORTACAO_REAL) {
        await espera(200);
        const e = lerConvDemo(); const x = e.conexoes.find((c) => c.conexao === conexao); const n = e.numeros.find((p) => p.id === canalId);
        if (!x || !n) return 0;
        const movidas = x.semNumero + (x.canalId && x.canalId !== canalId ? x.conversas - x.semNumero : 0);
        x.canalId = n.id; x.canalNome = n.nome; x.semNumero = 0;
        try { localStorage.setItem(G_CONV, JSON.stringify(e)); } catch { /* sem navegador */ }
        return movidas;
      }
      const { data, error } = await supabase!.rpc('atd_guimoo_ligar_conexao', { p_conexao: conexao, p_canal: canalId });
      if (error) throw new Error(error.message.includes('numero_invalido') ? 'Esse número não é um WhatsApp desta empresa.' : erroLegivel(error.message));
      return Number((data as { conversas?: number } | null)?.conversas) || 0;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [C, currentOrg.id] });
      qc.invalidateQueries({ queryKey: ['wa-conversas', currentOrg.id] });
    },
  });
}
