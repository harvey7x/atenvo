import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useOrg } from '@/context/OrgContext';

/* ------------------------------------------------------------------
   AVISOS PARA A EQUIPE (26/11, "igual" ao sistema que a Reviza usava antes: 7 avisos nos momentos que importam — novo
   lead, lead qualificado, lead desqualificado, contrato enviado, contrato assinado, reunião agendada e lead que já é
   cliente do escritório — com quem recebe cada um e um relatório).
   Aqui o aviso chega no SINO de cada pessoa escolhida, com o link da conversa: nenhuma mensagem de WhatsApp sai.
   Chegam como lá: ligados e SEM destinatários (ninguém recebe até o administrador escolher).
   Servidor: migration 114 (recurso 'avisos-equipe'). DEMO É O CONTRATO: sem backend, os mesmos hooks no navegador.
   ------------------------------------------------------------------ */

export const AVISOS_REAL: boolean = isSupabaseConfigured && !!supabase;

export type Gatilho = 'lead_novo' | 'etapa' | 'venda' | 'descartado' | 'reuniao' | 'cliente_carteira';
export const GATILHOS: { valor: Gatilho; rotulo: string; dica: string }[] = [
  { valor: 'lead_novo', rotulo: 'Quando chega um lead novo', dica: 'O card nasceu no Kanban.' },
  { valor: 'etapa', rotulo: 'Quando o card entra numa etapa', dica: 'Escolha a etapa do funil.' },
  { valor: 'venda', rotulo: 'Quando a venda é marcada', dica: 'Quando alguém usa o botão de venda (o "Contrato fechado").' },
  { valor: 'descartado', rotulo: 'Quando o lead é descartado', dica: 'O card foi para uma etapa de perda.' },
  { valor: 'reuniao', rotulo: 'Quando marcam uma reunião', dica: 'Reunião, ligação ou retorno marcado na Agenda.' },
  { valor: 'cliente_carteira', rotulo: 'Quando o lead já é cliente', dica: 'O telefone já está na carteira de cobranças (mesmo DDD e número).' },
];
export const ROTULO_GATILHO = Object.fromEntries(GATILHOS.map((g) => [g.valor, g.rotulo])) as Record<Gatilho, string>;
export const VARIAVEIS = [
  { chave: '{{nome}}', rotulo: 'nome do cliente' },
  { chave: '{{telefone}}', rotulo: 'telefone (mascarado)' },
  { chave: '{{resumo}}', rotulo: 'o que aconteceu' },
  { chave: '{{etapa}}', rotulo: 'etapa do card' },
];

export interface AvisoEquipe { id: string; chave: string; nome: string; modelo: string; gatilho: Gatilho; colunaId: string | null; destinatarios: string[]; ativo: boolean; ordem: number }
export interface Pessoa { id: string; nome: string }
export interface Etapa { id: string; nome: string; resultado: string | null }
export interface RelatorioAvisos { dias: number; total: number; porAviso: { avisoId: string; nome: string; qtd: number; pessoas: number }[]; recentes: { quando: string; aviso: string; pessoas: number; contato: string; conversaId: string | null }[] }

/** o "{{resumo}}" de exemplo de cada momento (o servidor escreve o de verdade, na migration 114) */
const RESUMO_EXEMPLO: Record<Gatilho, (etapa?: string | null) => string> = {
  lead_novo: () => 'anúncio',
  etapa: (e) => `entrou em ${e ?? 'Documentação'}`,
  venda: () => 'venda marcada por Juliana',
  descartado: () => 'sem perfil (não elegível)',
  reuniao: () => 'Explicar a revisão · 27/11 às 14:30',
  cliente_carteira: () => 'já está na carteira de cobranças (comercial Eduardo)',
};
/** como o aviso aparece no sino, com os dados de exemplo */
export function previaDoAviso(modelo: string, gatilho: Gatilho, etapa?: string | null): string {
  return modelo.replace(/\{\{nome\}\}/g, 'Maria Aparecida Souza').replace(/\{\{telefone\}\}/g, '(51) •••••-4407')
    .replace(/\{\{resumo\}\}/g, RESUMO_EXEMPLO[gatilho](etapa)).replace(/\{\{etapa\}\}/g, etapa ?? 'Documentação').replace(/\{\{link\}\}/g, 'abra pelo aviso');
}
export function validarAviso(a: Pick<AvisoEquipe, 'nome' | 'modelo' | 'gatilho' | 'colunaId'>): string | null {
  if (!a.nome.trim()) return 'Dê um nome ao aviso.';
  if (a.nome.trim().length > 60) return 'O nome vai até 60 letras.';
  if (!a.modelo.trim()) return 'Escreva o texto do aviso.';
  if (a.modelo.trim().length > 600) return 'O texto vai até 600 letras.';
  return null;
}

/* ---------------- demonstração ---------------- */
const G = 'previa-avisos-equipe', G_LOG = 'previa-avisos-equipe-log';
const ler = <T,>(k: string, p: T): T => { try { const v = JSON.parse(localStorage.getItem(k) ?? 'null'); return v ?? p; } catch { return p; } };
const gravar = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* aba privada */ } };
const espera = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
const hAtras = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
export const ETAPAS_DEMO: Etapa[] = ['LEAD NOVO', 'ATENDIMENTO IA', 'DOCUMENTAÇÃO', 'EM NEGOCIACAO', 'FECHADOS', 'LEAD DESCARTADO', 'CLT', 'REPRESENTANTE LEGAL', 'CREFAZ']
  .map((nome, i) => ({ id: `et-${i}`, nome, resultado: nome === 'FECHADOS' ? 'ganho' : nome === 'LEAD DESCARTADO' ? 'perdido' : 'neutro' }));
const PESSOAS_DEMO: Pessoa[] = ['Alexandra', 'Eduardo', 'Emillyn', 'Juliana', 'Matheo', 'Rafael'].map((nome) => ({ id: `p-${nome.toLowerCase()}`, nome }));
const A = (chave: string, nome: string, modelo: string, gatilho: Gatilho, colunaId: string | null, ordem: number): AvisoEquipe => ({ id: `av-${chave}`, chave, nome, modelo, gatilho, colunaId, destinatarios: [], ativo: true, ordem });
const AVISOS_DEMO: AvisoEquipe[] = [
  A('lead_novo', 'Novo lead recebido', 'Novo lead: {{nome}} · {{telefone}} · {{resumo}}', 'lead_novo', null, 0),
  A('lead_qualificado', 'Lead qualificado', 'Lead qualificado: {{nome}} · {{telefone}} · {{resumo}}', 'etapa', 'et-2', 1),
  A('lead_desqualificado', 'Lead desqualificado', 'Lead desqualificado: {{nome}} · {{telefone}} · motivo: {{resumo}}', 'descartado', null, 2),
  A('contrato_enviado', 'Contrato enviado', 'Contrato enviado: {{nome}} · {{telefone}} · aguardando a assinatura', 'etapa', null, 3),
  A('contrato_assinado', 'Contrato assinado', 'Contrato assinado: {{nome}} · {{telefone}} · {{resumo}}', 'venda', null, 4),
  A('reuniao_agendada', 'Reunião agendada', 'Reunião agendada com {{nome}} · {{telefone}} · {{resumo}}', 'reuniao', null, 5),
  A('cliente_escritorio', 'Lead já é cliente do escritório', 'Atenção, cliente da casa: {{nome}} · {{telefone}} · {{resumo}}. Atender com prioridade.', 'cliente_carteira', null, 6),
];
const LOG_DEMO = [
  { quando: hAtras(0.3), aviso: 'Novo lead recebido', pessoas: 2, contato: 'Pedro Henrique Dias', conversaId: 'wa-pedro' },
  { quando: hAtras(1.1), aviso: 'Lead já é cliente do escritório', pessoas: 2, contato: 'Neusa Trindade', conversaId: 'wa-neusa' },
  { quando: hAtras(3), aviso: 'Lead qualificado', pessoas: 1, contato: 'Maria Aparecida Souza', conversaId: 'wa-maria' },
  { quando: hAtras(26), aviso: 'Contrato assinado', pessoas: 3, contato: 'José Carlos Ferreira', conversaId: 'wa-jose' },
];

const C = 'atd-avisos-equipe';
const deLinha = (r: Record<string, unknown>): AvisoEquipe => ({
  id: String(r.id), chave: String(r.chave), nome: String(r.nome), modelo: String(r.modelo), gatilho: r.gatilho as Gatilho, colunaId: (r.coluna_id as string) ?? null,
  destinatarios: Array.isArray(r.destinatarios) ? (r.destinatarios as string[]) : [], ativo: r.ativo !== false, ordem: Number(r.ordem) || 0,
});

export function useAvisosEquipe() {
  const { currentOrg } = useOrg();
  return useQuery({
    queryKey: [C, currentOrg.id],
    enabled: !!currentOrg.id,
    queryFn: async (): Promise<AvisoEquipe[]> => {
      if (!AVISOS_REAL) { await espera(120); return [...ler(G, AVISOS_DEMO)].sort((a, b) => a.ordem - b.ordem); }
      const { data, error } = await supabase!.from('atd_avisos_equipe').select('id, chave, nome, modelo, gatilho, coluna_id, destinatarios, ativo, ordem').eq('organizacao_id', currentOrg.id).order('ordem').order('nome');
      if (error) throw new Error(error.message);
      return (data ?? []).map((r) => deLinha(r as Record<string, unknown>));
    },
  });
}

/** quem pode receber: as pessoas ativas do Atendimento; e as etapas do funil padrão */
export function usePessoasEEtapas() {
  const { currentOrg } = useOrg();
  return useQuery({
    queryKey: [C, currentOrg.id, 'pessoas-etapas'],
    enabled: !!currentOrg.id,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<{ pessoas: Pessoa[]; etapas: Etapa[] }> => {
      if (!AVISOS_REAL) return { pessoas: PESSOAS_DEMO, etapas: ETAPAS_DEMO };
      const [p, e] = await Promise.all([
        supabase!.from('organizacao_usuarios').select('usuarios(id, nome)').eq('organizacao_id', currentOrg.id).eq('status', 'ativo'),
        supabase!.from('funil_colunas').select('id, nome, resultado, ordem, funis!inner(padrao)').eq('organizacao_id', currentOrg.id).eq('funis.padrao', true).eq('arquivada', false).order('ordem'),
      ]);
      if (p.error) throw new Error(p.error.message);
      if (e.error) throw new Error(e.error.message);
      type U = { usuarios: { id: string; nome: string } | { id: string; nome: string }[] | null };
      const pessoas = ((p.data as unknown as U[]) ?? []).map((r) => (Array.isArray(r.usuarios) ? r.usuarios[0] : r.usuarios)).filter((u): u is { id: string; nome: string } => !!u)
        .map((u) => ({ id: u.id, nome: u.nome || 'Sem nome' })).sort((a, b) => a.nome.localeCompare(b.nome));
      return { pessoas, etapas: (e.data ?? []).map((r) => ({ id: String(r.id), nome: String(r.nome), resultado: (r.resultado as string) ?? null })) };
    },
  });
}

export function useSalvarAviso() {
  const { currentOrg } = useOrg();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (a: Omit<AvisoEquipe, 'id' | 'chave'> & { id?: string; chave?: string }) => {
      const linha = { nome: a.nome.trim(), modelo: a.modelo.trim(), gatilho: a.gatilho, coluna_id: a.gatilho === 'etapa' ? a.colunaId : null, destinatarios: a.destinatarios, ativo: a.ativo, ordem: a.ordem };
      if (!AVISOS_REAL) {
        await espera(120); const l = ler(G, AVISOS_DEMO);
        const novo: AvisoEquipe = { id: a.id ?? `av-${Date.now()}`, chave: a.chave ?? `proprio-${Date.now()}`, nome: linha.nome, modelo: linha.modelo, gatilho: a.gatilho, colunaId: linha.coluna_id, destinatarios: a.destinatarios, ativo: a.ativo, ordem: a.ordem };
        gravar(G, a.id ? l.map((x) => (x.id === a.id ? novo : x)) : [...l, novo]);
        return;
      }
      const { error } = a.id
        ? await supabase!.from('atd_avisos_equipe').update(linha).eq('id', a.id)
        : await supabase!.from('atd_avisos_equipe').insert({ ...linha, organizacao_id: currentOrg.id, chave: a.chave ?? `proprio-${Date.now()}` });
      if (error) throw new Error(/etapa_de_outra/.test(error.message) ? 'Essa etapa não é do funil desta empresa.' : error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [C] }),
  });
}

/** a mesma pessoa em vários avisos de uma vez (como lá: "pôr a mesma pessoa em várias notificações") */
export function useMesmaPessoaEmVarios() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { pessoaId: string; avisos: AvisoEquipe[]; marcar: Set<string> }) => {
      const mudam = v.avisos.filter((a) => a.destinatarios.includes(v.pessoaId) !== v.marcar.has(a.id));
      const com = (a: AvisoEquipe) => (v.marcar.has(a.id) ? [...new Set([...a.destinatarios, v.pessoaId])] : a.destinatarios.filter((d) => d !== v.pessoaId));
      if (!AVISOS_REAL) { const l = ler(G, AVISOS_DEMO); gravar(G, l.map((a) => (mudam.some((m) => m.id === a.id) ? { ...a, destinatarios: com(a) } : a))); return mudam.length; }
      for (const a of mudam) {
        const { error } = await supabase!.from('atd_avisos_equipe').update({ destinatarios: com(a) }).eq('id', a.id);
        if (error) throw new Error(error.message);
      }
      return mudam.length;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [C] }),
  });
}

export function useApagarAviso() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      if (!AVISOS_REAL) { gravar(G, ler(G, AVISOS_DEMO).filter((a) => a.id !== id)); return; }
      const { error } = await supabase!.from('atd_avisos_equipe').delete().eq('id', id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [C] }),
  });
}

export function useRelatorioAvisos(dias: number) {
  const { currentOrg } = useOrg();
  return useQuery({
    queryKey: [C, currentOrg.id, 'relatorio', dias],
    enabled: !!currentOrg.id,
    queryFn: async (): Promise<RelatorioAvisos> => {
      if (!AVISOS_REAL) {
        await espera(120);
        const desde = Date.now() - dias * 86_400_000;
        const recentes = ler(G_LOG, LOG_DEMO).filter((x) => new Date(x.quando).getTime() >= desde);
        const por = Object.entries(recentes.reduce<Record<string, { qtd: number; pessoas: number }>>((m, x) => { const o = (m[x.aviso] ??= { qtd: 0, pessoas: 0 }); o.qtd += 1; o.pessoas += x.pessoas; return m; }, {}))
          .map(([nome, o]) => ({ avisoId: nome, nome, ...o })).sort((a, b) => b.qtd - a.qtd);
        return { dias, total: recentes.length, porAviso: por, recentes };
      }
      const { data, error } = await supabase!.rpc('atd_avisos_equipe_relatorio', { p_dias: dias });
      if (error) throw new Error(/sem_permissao/.test(error.message) ? 'Só o administrador vê o relatório dos avisos.' : error.message);
      const j = (data ?? {}) as Record<string, unknown>;
      const arr = (v: unknown) => (Array.isArray(v) ? v as Record<string, unknown>[] : []);
      return {
        dias: Number(j.dias) || dias, total: Number(j.total) || 0,
        porAviso: arr(j.por_aviso).map((x) => ({ avisoId: String(x.aviso_id), nome: String(x.nome), qtd: Number(x.qtd) || 0, pessoas: Number(x.pessoas) || 0 })),
        recentes: arr(j.recentes).map((x) => ({ quando: String(x.quando), aviso: String(x.aviso), pessoas: Number(x.pessoas) || 0, contato: String(x.contato ?? ''), conversaId: (x.conversa_id as string) ?? null })),
      };
    },
  });
}
