import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useOrg } from '@/context/OrgContext';

/* ------------------------------------------------------------------
   RESUMO DO DIA PARA O GESTOR (25/11, "algo melhor que" o sistema que a Reviza usava antes). Dashboard › Resumo do
   dia: o dia da equipe numa tela só — quantos clientes escreveram, quantas conversas a equipe e a IA atenderam,
   documentos que chegaram, conversas fechadas e por quê, leads novos/ganhos/perdidos, quem esperou além da meta e
   cada atendente. E o aviso no sino no fim da tarde, se o administrador ligar (chega DESLIGADO).
   Servidor: migration 108 (atd_resumo_dia, atd_resumo_dia_config + o agendador a cada 10 min). Só administrador.
   DEMO É O CONTRATO: sem backend, um dia de exemplo com os nomes da demonstração.
   ------------------------------------------------------------------ */

export const RESUMO_REAL: boolean = isSupabaseConfigured && !!supabase;

export interface ResumoDia {
  dia: string;
  clientesEscreveram: number; recebidas: number; conversasNovas: number;
  atendidasEquipe: number; enviadasEquipe: number; peloCelular: number;
  atendidasIa: number; enviadasIa: number; falharam: number; docsRecebidos: number;
  fechadas: number; motivos: { motivo: string; n: number }[];
  leadsNovos: number; ganhos: number; perdidos: number;
  esperaramMeta: number; esperaram: { conversaId: string; contato: string; responsavel: string | null; quando: string | null }[];
  atendentes: { id: string; nome: string; conversas: number; mensagens: number; fechadas: number }[];
  geradoEm: string | null;
}
export interface ConfigResumoDia { ativo: boolean; hora: string; dias: number[] }
export const RESUMO_CONFIG_PADRAO: ConfigResumoDia = { ativo: false, hora: '18:30', dias: [1, 2, 3, 4, 5] };
export const HORAS_RESUMO = ['16:00', '17:00', '17:30', '18:00', '18:30', '19:00', '20:00', '21:00'];
/** até quantos dias para trás a tela abre (o mesmo teto do servidor) */
export const DIAS_PARA_TRAS = 62;

const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const s = (v: unknown) => (typeof v === 'string' && v ? v : null);
const arr = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v as Record<string, unknown>[] : []);
export function normalizarResumo(r: Record<string, unknown>): ResumoDia {
  return {
    dia: String(r.dia ?? '').slice(0, 10),
    clientesEscreveram: n(r.clientes_escreveram), recebidas: n(r.recebidas), conversasNovas: n(r.conversas_novas),
    atendidasEquipe: n(r.atendidas_equipe), enviadasEquipe: n(r.enviadas_equipe), peloCelular: n(r.pelo_celular),
    atendidasIa: n(r.atendidas_ia), enviadasIa: n(r.enviadas_ia), falharam: n(r.falharam), docsRecebidos: n(r.docs_recebidos),
    fechadas: n(r.fechadas), motivos: arr(r.motivos).map((x) => ({ motivo: String(x.motivo ?? 'Sem motivo'), n: n(x.n) })),
    leadsNovos: n(r.leads_novos), ganhos: n(r.ganhos), perdidos: n(r.perdidos),
    esperaramMeta: n(r.esperaram_meta),
    esperaram: arr(r.esperaram).map((x) => ({ conversaId: String(x.conversa_id ?? ''), contato: String(x.contato ?? 'Cliente sem nome'), responsavel: s(x.responsavel), quando: s(x.quando) })),
    atendentes: arr(r.atendentes).map((x) => ({ id: String(x.id ?? ''), nome: String(x.nome ?? 'Sem nome'), conversas: n(x.conversas), mensagens: n(x.mensagens), fechadas: n(x.fechadas) })),
    geradoEm: s(r.gerado_em),
  };
}

/** a frase do aviso no sino — a mesma do agendador (migration 108) */
export const qtd = (v: number, um: string, varios: string) => `${v} ${v === 1 ? um : varios}`;
export function fraseDoResumo(r: Pick<ResumoDia, 'clientesEscreveram' | 'atendidasEquipe' | 'fechadas' | 'leadsNovos' | 'esperaramMeta'>): string {
  return [
    qtd(r.clientesEscreveram, 'cliente escreveu', 'clientes escreveram'),
    qtd(r.atendidasEquipe, 'atendido pela equipe', 'atendidos pela equipe'),
    qtd(r.fechadas, 'conversa fechada', 'conversas fechadas'),
    qtd(r.leadsNovos, 'lead novo', 'leads novos'),
    ...(r.esperaramMeta > 0 ? [qtd(r.esperaramMeta, 'esperou além da meta', 'esperaram além da meta')] : []),
  ].join(' · ') + '.';
}

/* ---------------- demonstração ---------------- */
const espera = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
export function resumoDemo(dia: string): ResumoDia {
  // o mesmo dia sempre dá os mesmos números (uma "semente" pelo dia), hoje um pouco menos que um dia cheio
  const sem = [...dia].reduce((t, c) => t + c.charCodeAt(0), 0);
  const k = 0.75 + (sem % 7) / 20;
  const r = (v: number) => Math.max(0, Math.round(v * k));
  return {
    dia, clientesEscreveram: r(48), recebidas: r(312), conversasNovas: r(19),
    atendidasEquipe: r(37), enviadasEquipe: r(284), peloCelular: r(22), atendidasIa: r(14), enviadasIa: r(61), falharam: r(3), docsRecebidos: r(27),
    fechadas: r(9), motivos: [
      { motivo: 'Atendimento concluído', n: r(4) }, { motivo: 'Cliente não respondeu', n: r(3) }, { motivo: 'Não tem direito (não elegível)', n: r(2) },
    ].filter((m) => m.n > 0),
    leadsNovos: r(16), ganhos: r(3), perdidos: r(2),
    esperaramMeta: 2, esperaram: [
      { conversaId: 'wa-jose', contato: 'José Carlos Ferreira', responsavel: null, quando: null },
      { conversaId: 'wa-terezinha', contato: 'Terezinha M. Alves', responsavel: 'Juliana', quando: null },
    ],
    atendentes: [
      { id: 'u-henrique', nome: 'Henrique', conversas: r(14), mensagens: r(108), fechadas: r(4) },
      { id: 'u-juliana', nome: 'Juliana', conversas: r(12), mensagens: r(96), fechadas: r(3) },
      { id: 'u-matheo', nome: 'Matheo', conversas: r(8), mensagens: r(57), fechadas: r(2) },
      { id: 'u-murilo', nome: 'Murilo', conversas: r(3), mensagens: r(23), fechadas: 0 },
    ],
    geradoEm: new Date().toISOString(),
  };
}
const GUARDA = 'previa-resumo-dia-config';
const lerCfgDemo = (): ConfigResumoDia => { try { const v = JSON.parse(localStorage.getItem(GUARDA) ?? 'null'); return v ? { ...RESUMO_CONFIG_PADRAO, ...v } : RESUMO_CONFIG_PADRAO; } catch { return RESUMO_CONFIG_PADRAO; } };

const CHAVE = 'resumo-dia';
export function useResumoDia(dia: string, ativo = true) {
  const { currentOrg } = useOrg();
  return useQuery({
    queryKey: [CHAVE, currentOrg.id, dia],
    enabled: ativo && !!dia,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    placeholderData: (ant) => ant,
    queryFn: async (): Promise<ResumoDia> => {
      if (!RESUMO_REAL) { await espera(300); return resumoDemo(dia); }
      const { data, error } = await supabase!.rpc('atd_resumo_dia', { p_dia: dia });
      if (error) throw new Error(/sem_permissao/.test(error.message) ? 'Só o administrador vê o resumo do dia.' : /dia_invalido/.test(error.message) ? 'Escolha um dia dos últimos dois meses.' : 'Não deu para montar o resumo agora.');
      return normalizarResumo((data ?? {}) as Record<string, unknown>);
    },
  });
}
export function useResumoDiaConfig() {
  const { currentOrg } = useOrg();
  return useQuery({
    queryKey: [CHAVE, 'config', currentOrg.id],
    queryFn: async (): Promise<ConfigResumoDia> => {
      if (!RESUMO_REAL) return lerCfgDemo();
      const { data, error } = await supabase!.from('atd_resumo_dia_config').select('ativo, hora, dias').eq('organizacao_id', currentOrg.id).maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return RESUMO_CONFIG_PADRAO;
      return { ativo: data.ativo === true, hora: String(data.hora ?? '18:30').slice(0, 5), dias: Array.isArray(data.dias) ? (data.dias as number[]) : RESUMO_CONFIG_PADRAO.dias };
    },
  });
}
export function useSalvarResumoDiaConfig() {
  const { currentOrg } = useOrg();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (c: ConfigResumoDia) => {
      if (!c.dias.length) throw new Error('Escolha pelo menos um dia da semana.');
      if (!RESUMO_REAL) { await espera(350); try { localStorage.setItem(GUARDA, JSON.stringify(c)); } catch { /* privado */ } return; }
      const { error } = await supabase!.from('atd_resumo_dia_config').upsert({ organizacao_id: currentOrg.id, ativo: c.ativo, hora: c.hora, dias: [...c.dias].sort((a, b) => a - b) }, { onConflict: 'organizacao_id' });
      if (error) throw new Error(/permission|policy|row-level/i.test(error.message) ? 'Só o administrador muda o aviso do resumo.' : 'Não deu para salvar agora. Tente de novo.');
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [CHAVE, 'config'] }),
  });
}
