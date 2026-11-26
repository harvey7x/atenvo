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
  mensagens: 0,
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
