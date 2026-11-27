import { useQuery } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useOrg } from '@/context/OrgContext';

/* ------------------------------------------------------------------
   DASHBOARD › CRM (26/11, "igual" ao Dashboard do sistema que a Reviza usava antes): de que estado são os clientes,
   o funil por etapa (e quantos viraram venda), as etiquetas mais usadas, as próximas reuniões e o resumo das tarefas.
   Os números são dos cards que ENTRARAM no período. Servidor: migration 120 (atd_dashboard_crm). Recurso 'crm-extra'.
   DEMO É O CONTRATO: sem backend, um exemplo fixo com a mesma forma.
   ------------------------------------------------------------------ */

export const CRM_REAL: boolean = isSupabaseConfigured && !!supabase;

export interface DashboardCrm {
  dias: number;
  cards: number;
  vendas: number;
  perdidos: number;
  porUf: { uf: string; qtd: number }[];
  funil: { etapa: string; resultado: string; cor: string | null; qtd: number }[];
  etiquetas: { nome: string; qtd: number; cor: string | null }[];
  reunioes: { id: string; titulo: string; tipo: string; inicio: string; cliente: string | null; responsavel: string | null; conversaId: string | null }[];
  reunioes7d: number;
  tarefas: {
    pendentes: number; andamento: number; atrasadas: number; concluidas: number; criadas: number;
    porPrioridade: Record<string, number>;
    porPessoa: { nome: string; abertas: number; concluidas: number; atrasadas: number }[];
  };
}

const n = (v: unknown) => Number(v) || 0;
export function deCrm(j: Record<string, unknown>): DashboardCrm {
  const t = (j.tarefas as Record<string, unknown>) ?? {};
  return {
    dias: n(j.dias), cards: n(j.cards), vendas: n(j.vendas), perdidos: n(j.perdidos),
    porUf: ((j.por_uf as { uf: string; qtd: number }[]) ?? []).map((x) => ({ uf: String(x.uf), qtd: n(x.qtd) })),
    funil: ((j.funil as Record<string, unknown>[]) ?? []).map((x) => ({ etapa: String(x.etapa), resultado: String(x.resultado ?? 'neutro'), cor: (x.cor as string) ?? null, qtd: n(x.qtd) })),
    etiquetas: ((j.etiquetas as Record<string, unknown>[]) ?? []).map((x) => ({ nome: String(x.nome), qtd: n(x.qtd), cor: (x.cor as string) ?? null })),
    reunioes: ((j.reunioes as Record<string, unknown>[]) ?? []).map((x) => ({
      id: String(x.id), titulo: String(x.titulo ?? 'Reunião'), tipo: String(x.tipo ?? 'reuniao'), inicio: String(x.inicio),
      cliente: (x.cliente as string) ?? null, responsavel: (x.responsavel as string) ?? null, conversaId: (x.conversa_id as string) ?? null,
    })),
    reunioes7d: n(j.reunioes_7d),
    tarefas: {
      pendentes: n(t.pendentes), andamento: n(t.andamento), atrasadas: n(t.atrasadas), concluidas: n(t.concluidas), criadas: n(t.criadas),
      porPrioridade: Object.fromEntries(Object.entries((t.por_prioridade as Record<string, number>) ?? {}).map(([k, v]) => [k, n(v)])),
      porPessoa: ((t.por_pessoa as Record<string, unknown>[]) ?? []).map((x) => ({ nome: String(x.nome), abertas: n(x.abertas), concluidas: n(x.concluidas), atrasadas: n(x.atrasadas) })),
    },
  };
}

/** a taxa de venda do período: vendas ÷ cards que entraram (0 quando não entrou nenhum) */
export const taxaVenda = (d: Pick<DashboardCrm, 'cards' | 'vendas'>) => (d.cards > 0 ? d.vendas / d.cards : 0);

/* ---------------- demonstração ---------------- */
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));
const emDias = (d: number, h: number) => { const x = new Date(); x.setDate(x.getDate() + d); x.setHours(h, 0, 0, 0); return x.toISOString(); };
function demo(dias: number): DashboardCrm {
  const f = Math.max(1, Math.round(dias / 30));
  return {
    dias, cards: 412 * f, vendas: 41 * f, perdidos: 9 * f,
    porUf: [{ uf: 'RS', qtd: 251 * f }, { uf: 'SP', qtd: 47 * f }, { uf: 'BA', qtd: 29 * f }, { uf: 'RJ', qtd: 14 * f }, { uf: 'SC', qtd: 11 * f }, { uf: 'MG', qtd: 10 * f }, { uf: 'PR', qtd: 7 * f }],
    funil: [
      { etapa: 'LEAD NOVO', resultado: 'neutro', cor: '#64748b', qtd: 18 * f }, { etapa: 'ATENDIMENTO IA', resultado: 'neutro', cor: '#3b82f6', qtd: 287 * f },
      { etapa: 'DOCUMENTAÇÃO', resultado: 'neutro', cor: '#f59e0b', qtd: 33 * f }, { etapa: 'EM NEGOCIACAO', resultado: 'neutro', cor: '#8b5cf6', qtd: 12 * f },
      { etapa: 'FECHADOS', resultado: 'ganho', cor: '#19C37D', qtd: 41 * f }, { etapa: 'LEAD DESCARTADO', resultado: 'perdido', cor: '#e11d48', qtd: 9 * f },
      { etapa: 'CLT', resultado: 'neutro', cor: '#0ea5e9', qtd: 12 * f },
    ],
    etiquetas: [{ nome: 'NEGOCIAÇÃO', qtd: 46 * f, cor: '#f59e0b' }, { nome: 'BENEFÍCIO', qtd: 29 * f, cor: '#0ea5e9' }, { nome: 'EMPRÉSTIMO PESSOAL', qtd: 12 * f, cor: '#8b5cf6' }, { nome: 'RG', qtd: 11 * f, cor: '#0d9488' }, { nome: 'FECHADO', qtd: 9 * f, cor: '#19C37D' }],
    reunioes: [
      { id: 'r1', titulo: 'Assinatura do contrato', tipo: 'reuniao', inicio: emDias(0, 15), cliente: 'Maria Aparecida Souza', responsavel: 'Juliana', conversaId: 'wa-maria' },
      { id: 'r2', titulo: 'Retorno sobre o extrato', tipo: 'ligacao', inicio: emDias(1, 10), cliente: 'José Carlos Ferreira', responsavel: 'Eduardo', conversaId: 'wa-jose' },
      { id: 'r3', titulo: 'Conferir documentos', tipo: 'videochamada', inicio: emDias(3, 14), cliente: 'Ivone F. Cardoso', responsavel: 'Carla', conversaId: null },
    ],
    reunioes7d: 3,
    tarefas: { pendentes: 7, andamento: 3, atrasadas: 2, concluidas: 12 * f, criadas: 15 * f, porPrioridade: { alta: 3, media: 5, baixa: 2 },
      porPessoa: [{ nome: 'Juliana', abertas: 4, concluidas: 6 * f, atrasadas: 1 }, { nome: 'Eduardo', abertas: 3, concluidas: 4 * f, atrasadas: 1 }, { nome: 'Carla', abertas: 3, concluidas: 2 * f, atrasadas: 0 }] },
  };
}

export function useDashboardCrm(dias: number) {
  const { currentOrg } = useOrg();
  return useQuery({
    queryKey: ['atd-dashboard-crm', currentOrg.id, dias],
    enabled: !!currentOrg.id,
    staleTime: 60_000,
    queryFn: async (): Promise<DashboardCrm> => {
      if (!CRM_REAL) { await espera(150); return demo(dias); }
      const { data, error } = await supabase!.rpc('atd_dashboard_crm', { p_dias: dias });
      if (error) throw new Error(error.message.includes('sem_permissao') ? 'Só o administrador e o supervisor veem o Dashboard.' : error.message);
      return deCrm((data ?? {}) as Record<string, unknown>);
    },
  });
}
