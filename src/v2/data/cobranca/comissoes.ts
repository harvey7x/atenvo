/* Comissões por comercial — regra do dono (14/09): a empresa recebe a MENSALIDADE
   (metade da parcela, valor/2); o comercial recebe uma % da mensalidade, padrão
   50% ("metade da metade"). A % de cada comercial é definida pelo administrador.
   Chave = NOME do comercial (caixa alta, igual à carteira/leads.comercial).
   Reviza: tabela `comissoes` (RLS: comercial só vê a própria %; financeiro+ vê
   todas; edição gestor/admin). Demo: localStorage próprio (padrão dos Avisos). */
import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isRevizaMode, supabase } from '@/lib/supabase';
import { registrarDesfazer } from '../desfazer';
import { gsCarregar, gsSalvar } from './demoStore';
import { chavesCobranca } from './keys';

export const PCT_PADRAO = 50;   // % da mensalidade quando o comercial não tem % configurada

const LS = 'alfa_comissoes_v1';
const LS_HIST = 'alfa_comissoes_hist_v1';
const K = ['reviza', 'comissoes'] as const;
const KH = ['reviza', 'comissoes', 'hist'] as const;

/** histórico da % (mig 62): NOME (caixa alta) → pontos de mudança {desde 'AAAA-MM', pct}, em ordem */
export type HistComissao = Record<string, { desde: string; pct: number }[]>;
const lerHistLS = (): HistComissao => {
  try { const m = JSON.parse(localStorage.getItem(LS_HIST) ?? '{}'); return m && typeof m === 'object' ? m : {}; }
  catch { return {}; }
};
const ordenar = (h: HistComissao): HistComissao =>
  Object.fromEntries(Object.entries(h).map(([k, v]) => [k, [...v].sort((a, b) => a.desde.localeCompare(b.desde))]));
/** competência do mês corrente ('AAAA-MM') no relógio local */
export const compAtualComissao = (): string => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };

/** a % que valia no mês `comp` (o mês pago usa a % da ÉPOCA); sem histórico = a % atual/padrão */
export function pctNoMes(hist: HistComissao | undefined, pcts: Record<string, number> | undefined, comercial: string, comp: string): number {
  const pts = hist?.[comercial.trim().toUpperCase()];
  if (pts?.length) {
    let v: number | null = null;
    for (const p of pts) { if (p.desde <= comp) v = p.pct; else break; }
    if (v != null) return v;
  }
  return pctDe(pcts, comercial);
}

export function useComissoesHist() {
  return useQuery<HistComissao>({
    queryKey: KH,
    queryFn: async () => {
      if (!isRevizaMode || !supabase) return ordenar(lerHistLS());
      const { data, error } = await supabase.from('comissoes_hist').select('comercial, desde, pct');
      if (error) throw new Error(error.message);
      const m: HistComissao = {};
      for (const r of data ?? []) (m[String(r.comercial).trim().toUpperCase()] ??= []).push({ desde: String(r.desde), pct: Number(r.pct) });
      return ordenar(m);
    },
  });
}

const lerLS = (): Record<string, number> => {
  try { const m = JSON.parse(localStorage.getItem(LS) ?? '{}'); return m && typeof m === 'object' ? m : {}; }
  catch { return {}; }
};

/** mapa NOME (caixa alta) → % configurada; nome ausente = PCT_PADRAO no cálculo */
export function useComissoes() {
  return useQuery<Record<string, number>>({
    queryKey: K,
    queryFn: async () => {
      if (!isRevizaMode || !supabase) return lerLS();
      const { data, error } = await supabase.from('comissoes').select('comercial, pct');
      if (error) throw new Error(error.message);
      const m: Record<string, number> = {};
      for (const r of data ?? []) m[String(r.comercial).trim().toUpperCase()] = Number(r.pct);
      return m;
    },
  });
}

/** Divisão de cada pagamento (dono, áudio 29/09): o que se lança na planilha é o LÍQUIDO DO ESCRITÓRIO;
    "desse mesmo valor existe uma parte igual que vai pro comercial". Com a % do comercial sobre a
    mensalidade (o que o cliente paga), o escritório fica com o resto (100 − %). Então, a partir da célula:
      parte do comercial = líquido do escritório × % ÷ (100 − %)
      o cliente pagou    = líquido do escritório + parte do comercial
    50% → a parte do comercial é IGUAL à célula (cliente pagou 100 → 50 do escritório e 50 do comercial).
    Confere com os dados reais (29/09): 50% → célula = ¼ da parcela; Alexandra 40% → 30%; Rafael 30% → 35%. */
export function parteDoComercial(liquidoEscritorio: number, pct: number): number {
  if (!(liquidoEscritorio > 0) || !(pct > 0)) return 0;
  if (pct >= 100) return liquidoEscritorio;   // sem sobra pro escritório não dá pra inferir — trata como igual
  return Math.round(((liquidoEscritorio * pct) / (100 - pct)) * 100) / 100;
}
/** visão do COMERCIAL (dono 27/10: "pro atendente mostra a porcentagem dele"): (comercial, mês, líquido
    da célula) → a parte dele, com a % daquele mês. undefined = não converte (admin/financeiro veem o
    líquido) ou a % ainda não chegou (não dá pra adivinhar 50%) */
export function useParteDoComercial(ativo: boolean) {
  const pq = useComissoes(); const hq = useComissoesHist();
  const pronto = pq.data !== undefined && hq.data !== undefined;   // recarga falhando mantém o cache
  return useMemo(() => {
    if (!ativo || !pronto) return undefined;
    return (comercial: string, comp: string, liquido: number): number | null => {
      const c = (comercial ?? '').trim();
      if (!c || c === '—') return null;
      return parteDoComercial(liquido, pctNoMes(hq.data, pq.data, c, comp));
    };
  }, [ativo, pronto, pq.data, hq.data]);
}
/** 50 → "50", 33.5 → "33,5" (texto de interface) */
export const fmtPct = (p: number): string => p.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
export const totalPagoPeloCliente = (liquidoEscritorio: number, pct: number): number =>
  Math.round((liquidoEscritorio + parteDoComercial(liquidoEscritorio, pct)) * 100) / 100;
/** o inverso (dono 27/10: no "Informar pagamento" se digita o que o CLIENTE pagou — 116 → 58 do
    escritório com 50%). A célula continua guardando o líquido do escritório. Entre os vizinhos de
    centavo, fica o que volta exato no total digitado QUANDO existe (com 50% e centavo ímpar não
    existe: 116,01 → 58,01, que volta 116,02 — a janela avisa o total que fica registrado) */
export function liquidoDoTotal(totalCliente: number, pct: number): number {
  const t = Math.round(totalCliente * 100) / 100;
  if (!(t > 0) || !(pct > 0) || pct >= 100) return t;
  const base = Math.round(((t * (100 - pct)) / 100) * 100) / 100;
  for (const d of [0, -0.01, 0.01]) {
    const e = Math.round((base + d) * 100) / 100;
    if (e > 0 && totalPagoPeloCliente(e, pct) === t) return e;
  }
  return base;
}

export const pctDe = (pcts: Record<string, number> | undefined, comercial: string): number => {
  const v = pcts?.[comercial.trim().toUpperCase()];
  return v != null && Number.isFinite(v) ? v : PCT_PADRAO;
};

export function useSalvarComissao() {
  const qc = useQueryClient();
  /* a % vale de `desde` ('AAAA-MM') EM DIANTE e os valores JÁ LANÇADOS desses meses são refeitos
     (dono 29/09: "tem que atualizar lá os valores"): o cliente pagou o mesmo, muda quanto fica pro
     escritório — líquido novo = líquido × (100 − nova) ÷ (100 − a que valia no mês). Meses antes de
     `desde` não mudam. '2000-01' = todos os meses. Reviza: RPC comissao_aplicar (mig 63, uma
     transação; devolve o que mudou pro Desfazer). Demo: mesma conta no localStorage. */
  return useMutation({
    mutationFn: async (a: { comercial: string; pct: number; desde?: string }): Promise<ResultadoAplicar> => {
      const nome = a.comercial.trim().toUpperCase();
      const pct = Math.max(0, Math.min(99.99, Math.round(a.pct * 100) / 100));
      const desde = a.desde && /^\d{4}-(0[1-9]|1[0-2])$/.test(a.desde) ? a.desde : compAtualComissao();
      if (!nome) throw new Error('comercial sem nome');
      if (!(a.pct < 100)) throw new Error('A porcentagem precisa ser menor que 100% — senão não sobra nada pro escritório.');
      if (!isRevizaMode || !supabase) return aplicarDemo(nome, pct, desde);
      const { data, error } = await supabase.rpc('comissao_aplicar', { p_comercial: nome, p_pct: pct, p_desde: desde });
      if (error) throw new Error(error.message);
      const r = (data ?? {}) as ResultadoAplicar;
      return { ...r, n: Number(r.n ?? 0), n_lixeira: Number(r.n_lixeira ?? 0), pagamentos: r.pagamentos ?? [], entradas: r.entradas ?? [] };
    },
    onSuccess: (res, a) => {
      const relerTudo = () => {
        void qc.invalidateQueries({ queryKey: K });
        void qc.invalidateQueries({ queryKey: chavesCobranca.dados });          // valores da Gestão/painéis
        void qc.invalidateQueries({ queryKey: ['cobranca', 'planilha'] });      // células da planilha
      };
      relerTudo();
      void qc.invalidateQueries({ queryKey: ['reviza', 'registros'] }); // auditoria
      const nome = a.comercial.trim().toUpperCase();
      /* o Desfazer usa o estado ANTERIOR que o banco devolveu (não o cache do navegador) e é
         tudo-ou-nada: se algo do comercial mudou depois, o banco recusa com o motivo (mig 64) */
      registrarDesfazer({
        rotulo: `comissão de ${nome}${res.n ? ` (${res.n} pagamento${res.n === 1 ? '' : 's'})` : ''}`,
        inverso: async () => {
          if (!isRevizaMode || !supabase) {
            desfazerDemo(nome, res);
          } else {
            const { error } = await supabase.rpc('comissao_desfazer_aplicar', { p_comercial: nome, p_aplicacao: res });
            if (error) throw new Error(error.message);
          }
          relerTudo();
        },
      });
    },
  });
}

/* ---------- aplicar a % (refaz os valores lançados) — tipos e a versão DEMO ---------- */
export interface ResultadoAplicar {
  /** pagamentos refeitos */
  n: number;
  /** {l: lead, c: comp, a: antes, d: depois} */
  pagamentos: { l: string; c: string; a: number; d: number }[];
  entradas: { id: string; a: number; d: number }[];
  /** clientes do comercial na Lixeira com pagamentos refeitos (volta refeito se restaurar) */
  lixeira?: unknown[]; n_lixeira?: number;
  /** o que o Desfazer precisa (vem do banco): mês, quando, % e histórico antes/depois */
  desde?: string; em?: string; pct?: number;
  hist_antes?: { desde: string; pct: number }[]; pct_antes?: number | null; hist_depois?: { desde: string; pct: number }[];
}
const valorCel = (t: string | undefined): number | null => {
  const s = (t ?? '').trim(); if (!/^\d+([.,]\d+)?$/.test(s)) return null;
  const v = Number(s.replace(',', '.')); return v > 0 ? v : null;
};
// sem separador de milhar: "1.401,4" deixaria de ser número na célula
const textoValor = (v: number) => (Number.isInteger(v) ? String(v) : v.toLocaleString('pt-BR', { maximumFractionDigits: 2, useGrouping: false }));
const r2 = (v: number) => Math.round(v * 100) / 100;

/** demo: a mesma conta do comissao_aplicar no store da Gestão demo (a planilha demo se reconcilia ao ler) */
export function aplicarDemo(nome: string, pct: number, desde: string): ResultadoAplicar {
  const m = lerLS(); const h = ordenar(lerHistLS());
  const histAntes = h[nome] ? [...h[nome]] : []; const pctAntes = m[nome] ?? null;
  const d = gsCarregar();
  const pagamentos: ResultadoAplicar['pagamentos'] = [];
  const entradas: ResultadoAplicar['entradas'] = [];
  for (const l of d.linhas) {
    if ((l.comercial ?? '').trim().toUpperCase() !== nome) continue;
    d.comps.forEach((comp, k) => {
      if (comp < desde) return;
      const v = valorCel(l.celulas[k]); if (v == null) return;
      const velha = pctNoMes(h, m, nome, comp); if (velha >= 100) return;
      const novo = r2((v * (100 - pct)) / (100 - velha));
      if (novo > 0 && novo !== v) { l.celulas[k] = textoValor(novo); pagamentos.push({ l: l.id, c: comp, a: v, d: novo }); }
    });
  }
  const leads = new Set(d.linhas.filter((l) => (l.comercial ?? '').trim().toUpperCase() === nome).map((l) => l.id));
  for (const e of d.pendentes) {
    if (!leads.has(e.leadId) || e.comp < desde || !(e.valor > 0)) continue;
    const velha = pctNoMes(h, m, nome, e.comp); if (velha >= 100) continue;
    const novo = r2((e.valor * (100 - pct)) / (100 - velha));
    if (novo > 0 && novo !== e.valor) { entradas.push({ id: e.id, a: e.valor, d: novo }); e.valor = novo; }
  }
  gsSalvar(d);
  if (!h[nome]?.length) h[nome] = [{ desde: '2000-01', pct: m[nome] ?? PCT_PADRAO }];
  h[nome] = [...h[nome].filter((p) => p.desde < desde), { desde, pct }];
  m[nome] = pct;
  localStorage.setItem(LS, JSON.stringify(m)); localStorage.setItem(LS_HIST, JSON.stringify(h));
  return { n: pagamentos.length, pagamentos, entradas, desde, pct, hist_antes: histAntes, pct_antes: pctAntes, hist_depois: h[nome] };
}
export function desfazerDemo(nome: string, res: ResultadoAplicar) {
  const antes = res.pct_antes ?? undefined; const histAntes = res.hist_antes ?? [];
  const d = gsCarregar();
  const porLead = new Map(d.linhas.map((l) => [l.id, l]));
  for (const p of res.pagamentos) {
    const l = porLead.get(p.l); const k = d.comps.indexOf(p.c);
    if (l && k >= 0 && valorCel(l.celulas[k]) === p.d) l.celulas[k] = textoValor(p.a);
  }
  for (const x of res.entradas) { const e = d.pendentes.find((y) => y.id === x.id); if (e && e.valor === x.d) e.valor = x.a; }
  gsSalvar(d);
  const m = lerLS(); if (antes == null) delete m[nome]; else m[nome] = antes; localStorage.setItem(LS, JSON.stringify(m));
  const h = lerHistLS(); if (histAntes.length) h[nome] = histAntes; else delete h[nome]; localStorage.setItem(LS_HIST, JSON.stringify(h));
}
