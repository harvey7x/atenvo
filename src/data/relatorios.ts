import { useQuery } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useOrg } from '@/context/OrgContext';

export const REL_REAL = isSupabaseConfigured && !!supabase;
const TZ = 'America/Sao_Paulo';

/* ====================== Período (America/Sao_Paulo) ====================== */
export type Preset = 'hoje' | 'ontem' | '7d' | '30d' | 'mes_atual' | 'mes_anterior' | 'custom';
export const PRESETS: { id: Preset; label: string }[] = [
  { id: 'hoje', label: 'Hoje' }, { id: 'ontem', label: 'Ontem' },
  { id: '7d', label: 'Últimos 7 dias' }, { id: '30d', label: 'Últimos 30 dias' },
  { id: 'mes_atual', label: 'Mês atual' }, { id: 'mes_anterior', label: 'Mês anterior' },
  { id: 'custom', label: 'Personalizado' },
];

/** YYYY-MM-DD no fuso de São Paulo. */
export function spHoje(): string { return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
export function addDias(dateStr: string, n: number): string { const d = new Date(dateStr + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function primeiroDoMes(dateStr: string): string { return dateStr.slice(0, 8) + '01'; }
function instante(dateStr: string): string { return dateStr + 'T00:00:00-03:00'; } // SP = UTC-3 (sem DST)
function difDias(aIso: string, bIso: string): number { return Math.round((new Date(bIso).getTime() - new Date(aIso).getTime()) / 86400000); }
const fmtBR = (d: string) => d.split('-').reverse().join('/');

export interface Periodo {
  iniDate: string; fimDate: string;          // datas SP (fim EXCLUSIVO)
  iniISO: string; fimISO: string;            // instantes (início inclusivo, fim exclusivo)
  prevIniDate: string; prevIniISO: string;   // início do período anterior (fim = iniISO)
  dias: number; label: string; prevLabel: string;
}
export function resolvePeriodo(preset: Preset, ini?: string, fim?: string): Periodo {
  const hoje = spHoje();
  let di = hoje, df = addDias(hoje, 1); // df exclusivo
  if (preset === 'hoje') { di = hoje; df = addDias(hoje, 1); }
  else if (preset === 'ontem') { di = addDias(hoje, -1); df = hoje; }
  else if (preset === '7d') { di = addDias(hoje, -6); df = addDias(hoje, 1); }
  else if (preset === '30d') { di = addDias(hoje, -29); df = addDias(hoje, 1); }
  else if (preset === 'mes_atual') { di = primeiroDoMes(hoje); df = addDias(hoje, 1); }
  else if (preset === 'mes_anterior') { const p = primeiroDoMes(hoje); di = primeiroDoMes(addDias(p, -1)); df = p; }
  else if (preset === 'custom' && ini && fim) { di = ini <= fim ? ini : fim; df = addDias(ini <= fim ? fim : ini, 1); }
  const iniISO = instante(di), fimISO = instante(df);
  const dias = Math.max(1, difDias(iniISO, fimISO)); // período anterior tem a MESMA duração
  const prevIniDate = addDias(di, -dias), prevIniISO = instante(prevIniDate);
  const ultimo = addDias(df, -1);
  const label = di === ultimo ? fmtBR(di) : `${fmtBR(di)} – ${fmtBR(ultimo)}`;
  const prevUlt = addDias(di, -1);
  const prevLabel = prevIniDate === prevUlt ? fmtBR(prevIniDate) : `${fmtBR(prevIniDate)} – ${fmtBR(prevUlt)}`;
  return { iniDate: di, fimDate: df, iniISO, fimISO, prevIniDate, prevIniISO, dias, label, prevLabel };
}

/* ====================== Filtros ====================== */
export interface RelFiltros { preset: Preset; ini?: string; fim?: string; canal?: string; origem?: string; responsavel?: string; coluna?: string; status?: string; }
export const FILTROS_PADRAO: RelFiltros = { preset: '30d' };

/* ====================== Funções puras (testáveis) ====================== */
export interface Kpi { atual: number; anterior: number; deltaAbs: number; deltaPct: number | null; }
/** deltaPct = null quando o denominador anterior é zero e há valor atual (evita 100%/Infinity enganosos). */
export function kpi(atual: number, anterior: number): Kpi {
  const deltaAbs = atual - anterior;
  const deltaPct = anterior === 0 ? (atual === 0 ? 0 : null) : (deltaAbs / anterior) * 100;
  return { atual, anterior, deltaAbs, deltaPct };
}

export interface ParcelaLite { status: string; valor: number; valor_pago: number | null; data_prevista: string | null; data_pagamento: string | null; }
export interface FinAgg { recebida: number; prevista: number; pendente: number; vencida: number; cancelada: number; vencTotalQtd: number; vencPagasQtd: number; inadimplencia: number; taxaRecebimento: number; }
/** di inclusivo, df exclusivo (datas YYYY-MM-DD); hoje em SP. */
export function agregaFinanceiro(par: ParcelaLite[], di: string, df: string, hoje: string): FinAgg {
  const inR = (d: string | null) => !!d && d >= di && d < df;
  const recebida = par.filter((p) => p.status === 'paga' && inR(p.data_pagamento)).reduce((s, p) => s + (p.valor_pago || 0), 0);
  const prevista = par.filter((p) => p.status !== 'cancelada' && inR(p.data_prevista)).reduce((s, p) => s + (p.valor || 0), 0);
  const pendente = par.filter((p) => p.status === 'prevista' && p.data_prevista && p.data_prevista >= hoje).reduce((s, p) => s + (p.valor || 0), 0);
  const vencida = par.filter((p) => p.status !== 'cancelada' && p.status !== 'paga' && p.data_prevista && p.data_prevista < hoje).reduce((s, p) => s + (p.valor || 0), 0);
  const cancelada = par.filter((p) => p.status === 'cancelada').reduce((s, p) => s + (p.valor || 0), 0);
  const vencTotal = par.filter((p) => p.status !== 'cancelada' && p.data_prevista && p.data_prevista < hoje);
  const vencPagas = vencTotal.filter((p) => p.status === 'paga');
  return {
    recebida, prevista, pendente, vencida, cancelada,
    vencTotalQtd: vencTotal.length, vencPagasQtd: vencPagas.length,
    inadimplencia: vencTotal.length === 0 ? 0 : ((vencTotal.length - vencPagas.length) / vencTotal.length) * 100,
    taxaRecebimento: vencTotal.length === 0 ? 0 : (vencPagas.length / vencTotal.length) * 100,
  };
}

/** Tempo médio (min) entre 1ª entrada e 1ª resposta posterior, por conversa. Ignora resposta anterior à entrada. */
export function tempoMedioPrimeiraResposta(entradas: { c: string; t: number }[], respostas: { c: string; t: number }[]): number | null {
  const fin = new Map<string, number>(), fout = new Map<string, number>();
  for (const e of entradas) if (e.t && (!fin.has(e.c) || e.t < fin.get(e.c)!)) fin.set(e.c, e.t);
  for (const r of respostas) if (r.t && (!fout.has(r.c) || r.t < fout.get(r.c)!)) fout.set(r.c, r.t);
  const difs: number[] = [];
  for (const [c, tin] of fin) { const o = fout.get(c); if (o && o > tin) difs.push((o - tin) / 60000); }
  return difs.length ? difs.reduce((a, b) => a + b, 0) / difs.length : null;
}

export interface OppLite { status: string; responsavel_id?: string | null; coluna_id?: string | null; origem?: string | null; }
export function conversao(opps: { status: string }[]): { criadas: number; ganhas: number; perdidas: number; taxa: number } {
  const criadas = opps.length;
  const ganhas = opps.filter((o) => o.status === 'ganho').length;
  const perdidas = opps.filter((o) => o.status === 'perdido').length;
  return { criadas, ganhas, perdidas, taxa: criadas === 0 ? 0 : (ganhas / criadas) * 100 };
}
/** Semântica canônica do filtro de oportunidades (mesma aplicada via PostgREST). */
export function passaOpp(o: OppLite, f: RelFiltros): boolean {
  if (f.responsavel && o.responsavel_id !== f.responsavel) return false;
  if (f.coluna && o.coluna_id !== f.coluna) return false;
  if (f.status && o.status !== f.status) return false;
  if (f.origem && o.origem !== f.origem) return false;
  return true;
}

/* ====================== Utilidades internas ====================== */
type Row = Record<string, unknown>;
const one = (v: unknown): Row | null => (Array.isArray(v) ? ((v[0] as Row) ?? null) : ((v as Row) ?? null));
const num = (v: unknown) => (v == null ? 0 : Number(v) || 0);
const tms = (r: Row, ...f: string[]) => { for (const k of f) { const v = r[k]; if (v) return new Date(v as string).getTime(); } return 0; };
function particao<T extends Row>(rows: T[], campo: string, p: Periodo): { atual: T[]; anterior: T[] } {
  const ini = new Date(p.iniISO).getTime();
  const atual: T[] = [], anterior: T[] = [];
  for (const r of rows) { const t = tms(r, campo); if (t >= ini) atual.push(r); else anterior.push(r); }
  return { atual, anterior };
}
const chaveFiltros = (f: RelFiltros) => JSON.stringify([f.preset, f.ini, f.fim, f.canal, f.origem, f.responsavel, f.coluna, f.status]);
const toParcela = (r: Row): ParcelaLite => ({ status: r.status as string, valor: num(r.valor), valor_pago: r.valor_pago == null ? null : num(r.valor_pago), data_prevista: (r.data_prevista as string) ?? null, data_pagamento: (r.data_pagamento as string) ?? null });

/* ====================== Opções de filtro ====================== */
export interface RelOpcoes { responsaveis: { id: string; nome: string }[]; origens: string[]; colunas: { id: string; nome: string; ordem: number }[]; }
export function useRelatorioOpcoes() {
  const { currentOrg } = useOrg(); const org = currentOrg.id;
  return useQuery({
    queryKey: ['rel-opcoes', org], enabled: REL_REAL, staleTime: 5 * 60_000,
    queryFn: async (): Promise<RelOpcoes> => {
      const [us, fo, co, op] = await Promise.all([
        supabase!.from('organizacao_usuarios').select('usuarios(id, nome)').eq('organizacao_id', org).eq('status', 'ativo'),
        supabase!.from('fontes_aquisicao').select('nome').eq('organizacao_id', org).eq('ativo', true),
        supabase!.from('funil_colunas').select('id, nome, ordem').eq('organizacao_id', org).eq('arquivada', false).order('ordem'),
        supabase!.from('oportunidades').select('origem').eq('organizacao_id', org).not('origem', 'is', null).limit(2000),
      ]);
      const responsaveis = ((us.data as Row[]) ?? []).map((r) => { const u = one(r.usuarios); return u ? { id: u.id as string, nome: u.nome as string } : null; }).filter(Boolean) as { id: string; nome: string }[];
      responsaveis.sort((a, b) => a.nome.localeCompare(b.nome));
      const origensSet = new Set<string>();
      ((fo.data as Row[]) ?? []).forEach((r) => r.nome && origensSet.add(r.nome as string));
      ((op.data as Row[]) ?? []).forEach((r) => r.origem && origensSet.add(r.origem as string));
      const colunas = ((co.data as Row[]) ?? []).map((r) => ({ id: r.id as string, nome: r.nome as string, ordem: num(r.ordem) }));
      return { responsaveis, origens: [...origensSet].sort((a, b) => a.localeCompare(b)), colunas };
    },
  });
}

/* ====================== Resumo executivo ====================== */
export interface ResumoData {
  novosContatos: Kpi; novasConversas: Kpi; conversasAtendidas: Kpi; taxaAtendimento: Kpi;
  oportunidadesCriadas: Kpi; oportunidadesFechadas: Kpi; conversaoComercial: Kpi;
  receitaRecebida: Kpi; receitaPrevista: Kpi; ticketMedio: Kpi; parcelasAtraso: number; taxaInadimplencia: Kpi;
  economiaGerada: Kpi | null; economiaPreenchida: boolean;
}
export function useResumo(f: RelFiltros) {
  const { currentOrg } = useOrg(); const org = currentOrg.id; const p = resolvePeriodo(f.preset, f.ini, f.fim);
  return useQuery({
    queryKey: ['rel-resumo', org, chaveFiltros(f)], enabled: REL_REAL, staleTime: 60_000,
    queryFn: async ({ signal }): Promise<ResumoData> => {
      let qContatos = supabase!.from('contatos').select('id, criado_em, origem, responsavel_id').eq('organizacao_id', org).gte('criado_em', p.prevIniISO).lt('criado_em', p.fimISO).abortSignal(signal!);
      if (f.responsavel) qContatos = qContatos.eq('responsavel_id', f.responsavel);
      if (f.origem) qContatos = qContatos.eq('origem', f.origem);
      let qOpp = supabase!.from('oportunidades').select('id, status, criado_em, responsavel_id, origem, coluna_id').eq('organizacao_id', org).gte('criado_em', p.prevIniISO).lt('criado_em', p.fimISO).abortSignal(signal!);
      if (f.responsavel) qOpp = qOpp.eq('responsavel_id', f.responsavel);
      if (f.coluna) qOpp = qOpp.eq('coluna_id', f.coluna);
      if (f.status) qOpp = qOpp.eq('status', f.status);
      if (f.origem) qOpp = qOpp.eq('origem', f.origem);
      let qConv = supabase!.from('conversas').select('id, criado_em').eq('organizacao_id', org).gte('criado_em', p.prevIniISO).lt('criado_em', p.fimISO).abortSignal(signal!);
      if (f.canal) qConv = qConv.eq('ultimo_provider', f.canal); // canal só afeta conversas (atendimento)
      // resposta humana = saída com autor_id (operador via app); telefone sincronizado fica de fora
      const qResp = supabase!.from('mensagens').select('conversa_id, criado_em').eq('organizacao_id', org).eq('direcao', 'saida').not('autor_id', 'is', null).gte('criado_em', p.prevIniISO).lt('criado_em', p.fimISO).abortSignal(signal!);
      const qPag = supabase!.from('cobranca_pagamentos').select('status, valor, valor_pago, data_prevista, data_pagamento, cobranca_id').eq('organizacao_id', org).abortSignal(signal!);
      const qCob = supabase!.from('cobrancas').select('id, valor_mensal, status, valor_economizado, responsavel_id, criado_em').eq('organizacao_id', org).abortSignal(signal!);
      const [c, o, cv, resp, pag, cob] = await Promise.all([qContatos, qOpp, qConv, qResp, qPag, qCob]);
      for (const r of [c, o, cv, resp, pag, cob]) if (r.error) throw new Error(r.error.message);

      const C = particao((c.data as Row[]) ?? [], 'criado_em', p);
      const O = particao((o.data as Row[]) ?? [], 'criado_em', p);
      const V = particao((cv.data as Row[]) ?? [], 'criado_em', p);
      const respondidas = new Set(((resp.data as Row[]) ?? []).map((r) => r.conversa_id as string));
      const atendidas = (convs: Row[]) => convs.filter((r) => respondidas.has(r.id as string)).length;
      const convAtA = atendidas(V.atual), convAtP = atendidas(V.anterior);
      const convo = conversao(O.atual.map((r) => ({ status: r.status as string })));
      const convoP = conversao(O.anterior.map((r) => ({ status: r.status as string })));

      // financeiro (escopado por responsável via cobrança quando aplicável)
      let cobRows = (cob.data as Row[]) ?? [];
      if (f.responsavel) cobRows = cobRows.filter((r) => (r.responsavel_id as string) === f.responsavel);
      const cobIds = new Set(cobRows.map((r) => r.id as string));
      const pagRows = (((pag.data as Row[]) ?? []).filter((r) => !f.responsavel || cobIds.has(r.cobranca_id as string))).map(toParcela);
      const hoje = spHoje();
      const finA = agregaFinanceiro(pagRows, p.iniDate, p.fimDate, hoje);
      const finP = agregaFinanceiro(pagRows, p.prevIniDate, p.iniDate, hoje);
      const atraso = pagRows.filter((r) => r.status === 'prevista' && r.data_prevista && r.data_prevista < hoje).length;
      const Cob = particao(cobRows, 'criado_em', p);
      const ticket = (rows: Row[]) => { const a = rows.filter((r) => r.status !== 'cancelado'); return a.length === 0 ? 0 : a.reduce((s, r) => s + num(r.valor_mensal), 0) / a.length; };
      const economiaPreenchida = cobRows.some((r) => r.valor_economizado != null);
      const econ = (rows: Row[]) => rows.reduce((s, r) => s + num(r.valor_economizado), 0);

      return {
        novosContatos: kpi(C.atual.length, C.anterior.length),
        novasConversas: kpi(V.atual.length, V.anterior.length),
        conversasAtendidas: kpi(convAtA, convAtP),
        taxaAtendimento: kpi(V.atual.length ? (convAtA / V.atual.length) * 100 : 0, V.anterior.length ? (convAtP / V.anterior.length) * 100 : 0),
        oportunidadesCriadas: kpi(convo.criadas, convoP.criadas),
        oportunidadesFechadas: kpi(convo.ganhas, convoP.ganhas),
        conversaoComercial: kpi(convo.taxa, convoP.taxa),
        receitaRecebida: kpi(finA.recebida, finP.recebida),
        receitaPrevista: kpi(finA.prevista, finP.prevista),
        ticketMedio: kpi(ticket(Cob.atual), ticket(Cob.anterior)),
        parcelasAtraso: atraso,
        taxaInadimplencia: kpi(finA.inadimplencia, finP.inadimplencia),
        economiaGerada: economiaPreenchida ? kpi(econ(Cob.atual), econ(Cob.anterior)) : null,
        economiaPreenchida,
      };
    },
  });
}

/* ====================== Comercial / Funil ====================== */
export interface FunilColuna { id: string; nome: string; ordem: number; total: number }
export interface ComercialData { leadsSerie: { label: string; v: number }[]; funil: FunilColuna[]; porStatus: { status: string; total: number }[]; taxaConversao: number; taxaFechamento: number; perdidos: number; paradasMais7d: number; totalOpp: number; }
export function useComercial(f: RelFiltros, enabled: boolean) {
  const { currentOrg } = useOrg(); const org = currentOrg.id; const p = resolvePeriodo(f.preset, f.ini, f.fim);
  return useQuery({
    queryKey: ['rel-comercial', org, chaveFiltros(f)], enabled: REL_REAL && enabled, staleTime: 60_000,
    queryFn: async ({ signal }): Promise<ComercialData> => {
      let qOpp = supabase!.from('oportunidades').select('id, status, criado_em, atualizado_em, coluna_id, funil_colunas(nome, ordem)').eq('organizacao_id', org).gte('criado_em', p.iniISO).lt('criado_em', p.fimISO).abortSignal(signal!);
      if (f.responsavel) qOpp = qOpp.eq('responsavel_id', f.responsavel);
      if (f.coluna) qOpp = qOpp.eq('coluna_id', f.coluna);
      if (f.origem) qOpp = qOpp.eq('origem', f.origem);
      if (f.status) qOpp = qOpp.eq('status', f.status);
      const { data, error } = await qOpp;
      if (error) throw new Error(error.message);
      const rows = (data as Row[]) ?? [];
      const cv = conversao(rows.map((r) => ({ status: r.status as string })));
      const fechadasNoFunil = cv.ganhas + cv.perdidas;
      const colMap = new Map<string, FunilColuna>();
      for (const r of rows) { const c = one(r.funil_colunas); const id = (r.coluna_id as string) || 'sem'; const cur = colMap.get(id) || { id, nome: (c?.nome as string) || 'Sem etapa', ordem: num(c?.ordem), total: 0 }; cur.total += 1; colMap.set(id, cur); }
      const funil = [...colMap.values()].sort((a, b) => a.ordem - b.ordem);
      const serieMap = new Map<string, number>();
      const fmtKey = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, month: '2-digit', day: '2-digit' });
      for (const r of rows) serieMap.set(fmtKey.format(new Date(r.criado_em as string)), (serieMap.get(fmtKey.format(new Date(r.criado_em as string))) || 0) + 1);
      const leadsSerie = [...serieMap.entries()].sort().map(([label, v]) => ({ label: label.split('-').reverse().join('/'), v }));
      const agora = Date.now(); const seteDias = 7 * 86400000;
      const paradasMais7d = rows.filter((r) => r.status === 'em_andamento' && agora - tms(r, 'atualizado_em', 'criado_em') > seteDias).length;
      const porStatusMap = new Map<string, number>();
      for (const r of rows) porStatusMap.set(r.status as string, (porStatusMap.get(r.status as string) || 0) + 1);
      return { leadsSerie, funil, porStatus: [...porStatusMap.entries()].map(([status, total]) => ({ status, total })), taxaConversao: cv.taxa, taxaFechamento: fechadasNoFunil === 0 ? 0 : (cv.ganhas / fechadasNoFunil) * 100, perdidos: cv.perdidas, paradasMais7d, totalOpp: cv.criadas };
    },
  });
}

/* ====================== Atendimento ====================== */
export interface AtendimentoData {
  totalConversas: number; abertas: number; resolvidas: number; semResposta: number;
  msgRecebidas: number; msgEnviadas: number; mediaMsgConversa: number;
  primeiraRespostaMin: number | null; taxaAtendimento: number;
  porCanal: { canal: string; total: number }[]; porHora: number[]; porDiaSemana: number[];
}
export function useAtendimento(f: RelFiltros, enabled: boolean) {
  const { currentOrg } = useOrg(); const org = currentOrg.id; const p = resolvePeriodo(f.preset, f.ini, f.fim);
  return useQuery({
    queryKey: ['rel-atend', org, chaveFiltros(f)], enabled: REL_REAL && enabled, staleTime: 60_000,
    queryFn: async ({ signal }): Promise<AtendimentoData> => {
      // conversas da org (todas, p/ mapear canal de mensagens antigas); filtra por canal quando aplicável
      let qConv = supabase!.from('conversas').select('id, status, criado_em, ultimo_provider').eq('organizacao_id', org).abortSignal(signal!);
      if (f.canal) qConv = qConv.eq('ultimo_provider', f.canal);
      const qMsg = supabase!.from('mensagens').select('conversa_id, direcao, tipo, autor_id, criado_em, enviada_em, recebida_em').eq('organizacao_id', org).gte('criado_em', p.iniISO).lt('criado_em', p.fimISO).abortSignal(signal!);
      const [cv, m] = await Promise.all([qConv, qMsg]);
      if (cv.error) throw new Error(cv.error.message); if (m.error) throw new Error(m.error.message);
      const convAll = (cv.data as Row[]) ?? [];
      const convSet = new Set(convAll.map((r) => r.id as string)); // conjunto do canal selecionado
      const convPeriodo = convAll.filter((r) => { const t = tms(r, 'criado_em'); return t >= new Date(p.iniISO).getTime() && t < new Date(p.fimISO).getTime(); });
      let msgs = (m.data as Row[]) ?? [];
      if (f.canal) msgs = msgs.filter((r) => convSet.has(r.conversa_id as string)); // canal restringe mensagens
      const recebidas = msgs.filter((r) => r.direcao === 'entrada');
      const enviadas = msgs.filter((r) => r.direcao === 'saida' && r.tipo !== 'sistema' && r.tipo !== 'nota_interna');
      const respHumanas = enviadas.filter((r) => r.autor_id != null); // evidência de autoria humana
      const respSet = new Set(respHumanas.map((r) => r.conversa_id as string));
      const periodoIds = new Set(convPeriodo.map((r) => r.id as string));
      const comEntrada = new Set(recebidas.filter((r) => periodoIds.has(r.conversa_id as string)).map((r) => r.conversa_id as string));
      const atendidasPeriodo = [...comEntrada].filter((id) => respSet.has(id)).length;
      const semResposta = [...comEntrada].filter((id) => !respSet.has(id)).length;
      const primeiraRespostaMin = tempoMedioPrimeiraResposta(
        recebidas.map((r) => ({ c: r.conversa_id as string, t: tms(r, 'recebida_em', 'criado_em') })),
        respHumanas.map((r) => ({ c: r.conversa_id as string, t: tms(r, 'enviada_em', 'criado_em') })),
      );
      const porHora = Array(24).fill(0) as number[]; const porDiaSemana = Array(7).fill(0) as number[];
      const fmtH = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, hour: '2-digit', hour12: false });
      const fmtD = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' });
      const diaIdx: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
      for (const r of msgs) { const d = new Date(r.criado_em as string); porHora[parseInt(fmtH.format(d), 10) % 24] += 1; porDiaSemana[diaIdx[fmtD.format(d)] ?? 0] += 1; }
      const canalMap = new Map<string, number>();
      for (const r of convPeriodo) { const k = (r.ultimo_provider as string) || 'outros'; canalMap.set(k, (canalMap.get(k) || 0) + 1); }
      return {
        totalConversas: convPeriodo.length, abertas: convPeriodo.filter((r) => r.status === 'aberta').length,
        resolvidas: convPeriodo.filter((r) => r.status === 'resolvida' || r.status === 'fechada').length, semResposta,
        msgRecebidas: recebidas.length, msgEnviadas: enviadas.length,
        mediaMsgConversa: convPeriodo.length === 0 ? 0 : msgs.length / convPeriodo.length,
        primeiraRespostaMin,
        taxaAtendimento: comEntrada.size === 0 ? 0 : (atendidasPeriodo / comEntrada.size) * 100,
        porCanal: [...canalMap.entries()].map(([canal, total]) => ({ canal, total })), porHora, porDiaSemana,
      };
    },
  });
}

/* ====================== Equipe (atendimento × comercial) ====================== */
export interface LinhaComercial { id: string; nome: string; leads: number; oppAndamento: number; oppGanho: number; oppPerdido: number; taxaConversao: number; receitaContratada: number; receitaRecebida: number; }
export interface LinhaAtend { id: string; nome: string; conversasRespondidas: number; mensagensEnviadas: number; }
export interface EquipeData { comercial: LinhaComercial[]; atendimento: LinhaAtend[]; atendimentoAtribuivel: boolean; }
export function useEquipe(f: RelFiltros, enabled: boolean) {
  const { currentOrg } = useOrg(); const org = currentOrg.id; const p = resolvePeriodo(f.preset, f.ini, f.fim);
  return useQuery({
    queryKey: ['rel-equipe', org, chaveFiltros(f)], enabled: REL_REAL && enabled, staleTime: 60_000,
    queryFn: async ({ signal }): Promise<EquipeData> => {
      let qCt = supabase!.from('contatos').select('responsavel_id, criado_em, origem').eq('organizacao_id', org).gte('criado_em', p.iniISO).lt('criado_em', p.fimISO).abortSignal(signal!);
      if (f.origem) qCt = qCt.eq('origem', f.origem);
      let qOp = supabase!.from('oportunidades').select('responsavel_id, status, criado_em, coluna_id, origem').eq('organizacao_id', org).gte('criado_em', p.iniISO).lt('criado_em', p.fimISO).abortSignal(signal!);
      if (f.coluna) qOp = qOp.eq('coluna_id', f.coluna);
      if (f.origem) qOp = qOp.eq('origem', f.origem);
      if (f.status) qOp = qOp.eq('status', f.status);
      const [us, ct, op, cb, ms] = await Promise.all([
        supabase!.from('organizacao_usuarios').select('usuarios(id, nome)').eq('organizacao_id', org).eq('status', 'ativo').abortSignal(signal!),
        qCt, qOp,
        supabase!.from('cobrancas').select('id, responsavel_id, criado_por, valor_mensal, ciclos_totais, status').eq('organizacao_id', org).abortSignal(signal!),
        supabase!.from('mensagens').select('autor_id, conversa_id').eq('organizacao_id', org).eq('direcao', 'saida').not('autor_id', 'is', null).gte('criado_em', p.iniISO).lt('criado_em', p.fimISO).abortSignal(signal!),
      ]);
      for (const r of [us, ct, op, cb, ms]) if (r.error) throw new Error(r.error.message);
      const com = new Map<string, LinhaComercial>(); const at = new Map<string, LinhaAtend>();
      for (const r of (us.data as Row[]) ?? []) { const u = one(r.usuarios); if (!u) continue; const id = u.id as string, nome = u.nome as string; com.set(id, { id, nome, leads: 0, oppAndamento: 0, oppGanho: 0, oppPerdido: 0, taxaConversao: 0, receitaContratada: 0, receitaRecebida: 0 }); at.set(id, { id, nome, conversasRespondidas: 0, mensagensEnviadas: 0 }); }
      const getC = (id: string | null) => (id ? com.get(id) ?? null : null);
      for (const r of (ct.data as Row[]) ?? []) { const l = getC(r.responsavel_id as string); if (l) l.leads += 1; }
      for (const r of (op.data as Row[]) ?? []) { const l = getC(r.responsavel_id as string); if (!l) continue; if (r.status === 'em_andamento') l.oppAndamento += 1; else if (r.status === 'ganho') l.oppGanho += 1; else if (r.status === 'perdido') l.oppPerdido += 1; }
      for (const r of (cb.data as Row[]) ?? []) { const l = getC((r.responsavel_id as string) || (r.criado_por as string)); if (l && r.status !== 'cancelado') l.receitaContratada += num(r.valor_mensal) * num(r.ciclos_totais); }
      // atendimento real por autor_id
      const msgs = (ms.data as Row[]) ?? [];
      const convPorAutor = new Map<string, Set<string>>();
      for (const r of msgs) { const a = r.autor_id as string; const l = at.get(a); if (!l) continue; l.mensagensEnviadas += 1; const set = convPorAutor.get(a) || new Set<string>(); set.add(r.conversa_id as string); convPorAutor.set(a, set); }
      for (const [a, set] of convPorAutor) { const l = at.get(a); if (l) l.conversasRespondidas = set.size; }
      const atendimentoAtribuivel = msgs.length > 0;
      // receita recebida por responsável (parcelas pagas no período)
      const cobRows = (cb.data as Row[]) ?? [];
      const respByCob = new Map<string, string | null>(); cobRows.forEach((r) => respByCob.set(r.id as string, (r.responsavel_id as string) || (r.criado_por as string) || null));
      const { data: pg, error: epg } = await supabase!.from('cobranca_pagamentos').select('cobranca_id, valor_pago').eq('organizacao_id', org).eq('status', 'paga').gte('data_pagamento', p.iniDate).lt('data_pagamento', p.fimDate).abortSignal(signal!);
      if (epg) throw new Error(epg.message);
      for (const r of (pg as Row[]) ?? []) { const l = getC(respByCob.get(r.cobranca_id as string) || null); if (l) l.receitaRecebida += num(r.valor_pago); }
      for (const l of com.values()) { const fech = l.oppGanho + l.oppPerdido; l.taxaConversao = fech === 0 ? 0 : (l.oppGanho / fech) * 100; }
      const filtroResp = (id: string) => !f.responsavel || f.responsavel === id;
      return { comercial: [...com.values()].filter((l) => filtroResp(l.id)), atendimento: [...at.values()].filter((l) => filtroResp(l.id)), atendimentoAtribuivel };
    },
  });
}

/* ====================== Financeiro ====================== */
export interface FinanceiroData extends FinAgg {
  cobAtivas: number; cobFinalizadas: number; cobCanceladas: number;
  parPrevistas: number; parPagas: number; parNaoPagas: number; parCanceladas: number; ticketMensal: number;
  previsao6m: { mes: string; previsto: number; recebido: number }[]; evolucao: { mes: string; recebido: number }[]; porServico: { nome: string; total: number }[];
}
export function useFinanceiro(f: RelFiltros, enabled: boolean) {
  const { currentOrg } = useOrg(); const org = currentOrg.id; const p = resolvePeriodo(f.preset, f.ini, f.fim);
  return useQuery({
    queryKey: ['rel-fin', org, chaveFiltros(f)], enabled: REL_REAL && enabled, staleTime: 60_000,
    queryFn: async ({ signal }): Promise<FinanceiroData> => {
      const [pg, cb] = await Promise.all([
        supabase!.from('cobranca_pagamentos').select('status, valor, valor_pago, data_prevista, data_pagamento, cobranca_id').eq('organizacao_id', org).abortSignal(signal!),
        supabase!.from('cobrancas').select('id, status, valor_mensal, servico, responsavel_id').eq('organizacao_id', org).abortSignal(signal!),
      ]);
      if (pg.error) throw new Error(pg.error.message); if (cb.error) throw new Error(cb.error.message);
      let cob = (cb.data as Row[]) ?? [];
      if (f.responsavel) cob = cob.filter((r) => (r.responsavel_id as string) === f.responsavel); // único filtro válido p/ financeiro
      const cobIds = new Set(cob.map((r) => r.id as string));
      const parRows = (((pg.data as Row[]) ?? []).filter((r) => !f.responsavel || cobIds.has(r.cobranca_id as string)));
      const par = parRows.map(toParcela);
      const hoje = spHoje();
      const agg = agregaFinanceiro(par, p.iniDate, p.fimDate, hoje);
      const base = hoje.slice(0, 7);
      const mesKey = (offset: number) => { const [y, mo] = base.split('-').map(Number); return new Date(Date.UTC(y, mo - 1 + offset, 1)).toISOString().slice(0, 7); };
      const somaPrev = (k: string) => par.filter((r) => r.status !== 'cancelada' && r.data_prevista?.slice(0, 7) === k).reduce((s, r) => s + (r.valor || 0), 0);
      const somaReceb = (k: string) => par.filter((r) => r.status === 'paga' && r.data_pagamento?.slice(0, 7) === k).reduce((s, r) => s + (r.valor_pago || 0), 0);
      const previsao6m = Array.from({ length: 6 }, (_, i) => { const k = mesKey(i); return { mes: k, previsto: somaPrev(k), recebido: somaReceb(k) }; });
      const evolucao = Array.from({ length: 6 }, (_, i) => { const k = mesKey(-(5 - i)); return { mes: k, recebido: somaReceb(k) }; });
      const servMap = new Map<string, number>();
      for (const r of cob) { if (r.status === 'cancelado') continue; const k = (r.servico as string) || 'Sem serviço'; servMap.set(k, (servMap.get(k) || 0) + num(r.valor_mensal)); }
      const ativas = cob.filter((r) => !['finalizado', 'cancelado'].includes(r.status as string));
      return {
        ...agg,
        cobAtivas: ativas.length, cobFinalizadas: cob.filter((r) => r.status === 'finalizado').length, cobCanceladas: cob.filter((r) => r.status === 'cancelado').length,
        parPrevistas: par.filter((r) => r.status === 'prevista').length, parPagas: par.filter((r) => r.status === 'paga').length, parNaoPagas: par.filter((r) => r.status === 'nao_paga').length, parCanceladas: par.filter((r) => r.status === 'cancelada').length,
        ticketMensal: ativas.length === 0 ? 0 : ativas.reduce((s, r) => s + num(r.valor_mensal), 0) / ativas.length,
        previsao6m, evolucao, porServico: [...servMap.entries()].map(([nome, total]) => ({ nome, total })).sort((a, b) => b.total - a.total),
      };
    },
  });
}

/* ====================== Origens ====================== */
export interface LinhaOrigem { origem: string; leads: number; fechados: number; taxaConversao: number; }
export function useOrigens(f: RelFiltros, enabled: boolean) {
  const { currentOrg } = useOrg(); const org = currentOrg.id; const p = resolvePeriodo(f.preset, f.ini, f.fim);
  return useQuery({
    queryKey: ['rel-origens', org, chaveFiltros(f)], enabled: REL_REAL && enabled, staleTime: 60_000,
    queryFn: async ({ signal }): Promise<LinhaOrigem[]> => {
      let q = supabase!.from('oportunidades').select('origem, fonte_aquisicao, status').eq('organizacao_id', org).gte('criado_em', p.iniISO).lt('criado_em', p.fimISO).abortSignal(signal!);
      if (f.responsavel) q = q.eq('responsavel_id', f.responsavel);
      if (f.coluna) q = q.eq('coluna_id', f.coluna);
      if (f.status) q = q.eq('status', f.status);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      const map = new Map<string, LinhaOrigem>();
      for (const r of (data as Row[]) ?? []) { const k = (r.origem as string) || (r.fonte_aquisicao as string) || 'Não informado'; const cur = map.get(k) || { origem: k, leads: 0, fechados: 0, taxaConversao: 0 }; cur.leads += 1; if (r.status === 'ganho') cur.fechados += 1; map.set(k, cur); }
      const lista = [...map.values()]; for (const l of lista) l.taxaConversao = l.leads === 0 ? 0 : (l.fechados / l.leads) * 100;
      return lista.sort((a, b) => b.leads - a.leads);
    },
  });
}

/* ====================== Export CSV ====================== */
export function exportarCSV(nome: string, cabecalho: string[], linhas: (string | number)[][], meta: string[]) {
  const esc = (v: string | number) => { const s = String(v ?? ''); return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const corpo = [...meta.map((m) => [m]), [], cabecalho, ...linhas].map((row) => row.map(esc).join(';')).join('\r\n');
  const blob = new Blob(['﻿' + corpo], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob); const a = document.createElement('a');
  a.href = url; a.download = `${nome}.csv`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}
