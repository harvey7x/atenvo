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
export interface RelFiltros { preset: Preset; ini?: string; fim?: string; canal?: string; origem?: string; responsavel?: string; coluna?: string; status?: string; conexao?: string; }
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

/** Página do PostgREST/Supabase: cada resposta é limitada a ~1000 linhas. */
const PAGE_SIZE = 1000;
type Rangeable = { range: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }> };
/** Busca TODAS as linhas paginando por .range(). Sem isto, períodos grandes (ex.: mensagens
 *  em 30 dias) vinham TRUNCADOS em 1000 linhas arbitrárias, quebrando a invariante
 *  "30 dias >= 7 dias" (7d podia mostrar mais que 30d). `make` deve devolver uma query nova a cada chamada. */
async function fetchAll(make: () => Rangeable): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await make().range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const rows = (data as Row[]) ?? [];
    out.push(...rows);
    if (rows.length < PAGE_SIZE) break;
  }
  return out;
}
/** Embrulha linhas paginadas no formato { data, error } p/ manter o código a jusante inalterado. */
const wrapRows = (rows: Row[]) => ({ data: rows, error: null as { message: string } | null });

const one = (v: unknown): Row | null => (Array.isArray(v) ? ((v[0] as Row) ?? null) : ((v as Row) ?? null));
const num = (v: unknown) => (v == null ? 0 : Number(v) || 0);
const tms = (r: Row, ...f: string[]) => { for (const k of f) { const v = r[k]; if (v) return new Date(v as string).getTime(); } return 0; };
function particao<T extends Row>(rows: T[], campo: string, p: Periodo): { atual: T[]; anterior: T[] } {
  const ini = new Date(p.iniISO).getTime();
  const atual: T[] = [], anterior: T[] = [];
  for (const r of rows) { const t = tms(r, campo); if (t >= ini) atual.push(r); else anterior.push(r); }
  return { atual, anterior };
}
const chaveFiltros = (f: RelFiltros) => JSON.stringify([f.preset, f.ini, f.fim, f.canal, f.origem, f.responsavel, f.coluna, f.status, f.conexao]);
/** chave de agrupamento por conexão de aquisição (id atual, snapshot p/ removida, ou 'sem'). */
export function chaveConexao(canalOrigemId: string | null | undefined, snapshot: Record<string, unknown> | null | undefined): string {
  if (canalOrigemId) return canalOrigemId;
  if (snapshot && (snapshot.numero || snapshot.nome)) return 'snap:' + String(snapshot.numero || snapshot.nome);
  return 'sem';
}
const toParcela = (r: Row): ParcelaLite => ({ status: r.status as string, valor: num(r.valor), valor_pago: r.valor_pago == null ? null : num(r.valor_pago), data_prevista: (r.data_prevista as string) ?? null, data_pagamento: (r.data_pagamento as string) ?? null });
/** Contatos cuja conexão de aquisição = chip (para filtrar domínios ligados ao contato em 1 hop). */
async function cidsConexao(org: string, conexao: string | undefined, signal: AbortSignal): Promise<Set<string> | null> {
  if (!conexao) return null;
  const { data } = await supabase!.from('contatos').select('id').eq('organizacao_id', org).eq('canal_origem_id', conexao).is('mesclado_em', null).abortSignal(signal);
  return new Set(((data as Row[]) ?? []).map((r) => r.id as string));
}

/* ====================== Opções de filtro ====================== */
export interface RelOpcoes { responsaveis: { id: string; nome: string }[]; origens: string[]; colunas: { id: string; nome: string; ordem: number }[]; conexoes: { id: string; nome: string; numero: string }[]; }
export function useRelatorioOpcoes() {
  const { currentOrg } = useOrg(); const org = currentOrg.id;
  return useQuery({
    queryKey: ['rel-opcoes', org], enabled: REL_REAL, staleTime: 5 * 60_000,
    queryFn: async (): Promise<RelOpcoes> => {
      const [us, fo, co, op, cx] = await Promise.all([
        supabase!.from('organizacao_usuarios').select('usuarios(id, nome)').eq('organizacao_id', org).eq('status', 'ativo'),
        supabase!.from('fontes_aquisicao').select('nome').eq('organizacao_id', org).eq('ativo', true),
        supabase!.from('funil_colunas').select('id, nome, ordem').eq('organizacao_id', org).eq('arquivada', false).order('ordem'),
        supabase!.from('oportunidades').select('origem').eq('organizacao_id', org).not('origem', 'is', null).limit(2000),
        supabase!.from('canais').select('id, nome_interno, numero_conectado').eq('organizacao_id', org).eq('tipo', 'whatsapp').neq('status_integracao', 'removido').order('nome_interno'),
      ]);
      const responsaveis = ((us.data as Row[]) ?? []).map((r) => { const u = one(r.usuarios); return u ? { id: u.id as string, nome: u.nome as string } : null; }).filter(Boolean) as { id: string; nome: string }[];
      responsaveis.sort((a, b) => a.nome.localeCompare(b.nome));
      const origensSet = new Set<string>();
      ((fo.data as Row[]) ?? []).forEach((r) => r.nome && origensSet.add(r.nome as string));
      ((op.data as Row[]) ?? []).forEach((r) => r.origem && origensSet.add(r.origem as string));
      const colunas = ((co.data as Row[]) ?? []).map((r) => ({ id: r.id as string, nome: r.nome as string, ordem: num(r.ordem) }));
      const conexoes = ((cx.data as Row[]) ?? []).map((r) => ({ id: r.id as string, nome: (r.nome_interno as string) || 'WhatsApp', numero: (r.numero_conectado as string) || '' }));
      return { responsaveis, origens: [...origensSet].sort((a, b) => a.localeCompare(b)), colunas, conexoes };
    },
  });
}

/* ====================== Resumo executivo ====================== */
export interface ResumoData {
  novosContatos: Kpi; novasConversas: Kpi; conversasAtendidas: Kpi; taxaAtendimento: Kpi;
  // oportunidadesFechadas = CLIENTES distintos fechados no período (por fechado_em, P2/P4); negociosFechados = oportunidades ganhas
  oportunidadesCriadas: Kpi; oportunidadesFechadas: Kpi; negociosFechados: Kpi; conversaoComercial: Kpi;
  receitaRecebida: Kpi; receitaPrevista: Kpi; ticketMedio: Kpi; parcelasAtraso: number; taxaInadimplencia: Kpi;
  economiaGerada: Kpi | null; economiaPreenchida: boolean;
}
export function useResumo(f: RelFiltros) {
  const { currentOrg } = useOrg(); const org = currentOrg.id; const p = resolvePeriodo(f.preset, f.ini, f.fim);
  return useQuery({
    queryKey: ['rel-resumo', org, chaveFiltros(f)], enabled: REL_REAL, staleTime: 60_000,
    queryFn: async ({ signal }): Promise<ResumoData> => {
      let qContatos = supabase!.from('contatos').select('id, criado_em, origem, responsavel_id').eq('organizacao_id', org).is('mesclado_em', null).gte('criado_em', p.prevIniISO).lt('criado_em', p.fimISO).abortSignal(signal!);
      if (f.responsavel) qContatos = qContatos.eq('responsavel_id', f.responsavel);
      if (f.origem) qContatos = qContatos.eq('origem', f.origem);
      if (f.conexao) qContatos = qContatos.eq('canal_origem_id', f.conexao);
      let qOpp = supabase!.from('oportunidades').select('id, status, criado_em, responsavel_id, origem, coluna_id').eq('organizacao_id', org).gte('criado_em', p.prevIniISO).lt('criado_em', p.fimISO).abortSignal(signal!);
      if (f.responsavel) qOpp = qOpp.eq('responsavel_id', f.responsavel);
      if (f.coluna) qOpp = qOpp.eq('coluna_id', f.coluna);
      if (f.status) qOpp = qOpp.eq('status', f.status);
      if (f.origem) qOpp = qOpp.eq('origem', f.origem);
      if (f.conexao) qOpp = qOpp.eq('canal_origem_id', f.conexao);
      // P2: oportunidades GANHAS fechadas no período (por fechado_em) → clientes distintos + negócios
      let qOppFech = supabase!.from('oportunidades').select('contato_id, fechado_em').eq('organizacao_id', org).eq('status', 'ganho').gte('fechado_em', p.prevIniISO).lt('fechado_em', p.fimISO).abortSignal(signal!);
      if (f.responsavel) qOppFech = qOppFech.eq('responsavel_id', f.responsavel);
      if (f.coluna) qOppFech = qOppFech.eq('coluna_id', f.coluna);
      if (f.origem) qOppFech = qOppFech.eq('origem', f.origem);
      if (f.conexao) qOppFech = qOppFech.eq('canal_origem_id', f.conexao);
      let qConv = supabase!.from('conversas').select('id, criado_em, contato_id').eq('organizacao_id', org).gte('criado_em', p.prevIniISO).lt('criado_em', p.fimISO).abortSignal(signal!);
      if (f.canal) qConv = qConv.eq('ultimo_provider', f.canal); // canal só afeta conversas (atendimento)
      // resposta humana = saída com autor_id (operador via app); telefone sincronizado fica de fora
      const qResp = fetchAll(() => supabase!.from('mensagens').select('conversa_id, criado_em').eq('organizacao_id', org).eq('direcao', 'saida').not('autor_id', 'is', null).gte('criado_em', p.prevIniISO).lt('criado_em', p.fimISO).abortSignal(signal!)).then(wrapRows);
      const qPag = supabase!.from('cobranca_pagamentos').select('status, valor, valor_pago, data_prevista, data_pagamento, cobranca_id').eq('organizacao_id', org).abortSignal(signal!);
      const qCob = supabase!.from('cobrancas').select('id, valor_mensal, status, valor_economizado, responsavel_id, contato_id, criado_em').eq('organizacao_id', org).abortSignal(signal!);
      const [c, o, of_, cv, resp, pag, cob, cids] = await Promise.all([qContatos, qOpp, qOppFech, qConv, qResp, qPag, qCob, cidsConexao(org, f.conexao, signal!)]);
      for (const r of [c, o, of_, cv, resp, pag, cob]) if (r.error) throw new Error(r.error.message);

      const C = particao((c.data as Row[]) ?? [], 'criado_em', p);
      const O = particao((o.data as Row[]) ?? [], 'criado_em', p);
      // P2/P4: clientes distintos (por contato) e negócios (por oportunidade) fechados no período, por fechado_em
      const OF = particao((of_.data as Row[]) ?? [], 'fechado_em', p);
      const clientesFech = (rows: Row[]) => new Set(rows.map((r) => r.contato_id as string).filter(Boolean)).size;
      // conexão afeta conversas em 1 hop (via contato de aquisição)
      const cvRows = ((cv.data as Row[]) ?? []).filter((r) => !cids || cids.has(r.contato_id as string));
      const V = particao(cvRows, 'criado_em', p);
      const respondidas = new Set(((resp.data as Row[]) ?? []).map((r) => r.conversa_id as string));
      const atendidas = (convs: Row[]) => convs.filter((r) => respondidas.has(r.id as string)).length;
      const convAtA = atendidas(V.atual), convAtP = atendidas(V.anterior);
      const convo = conversao(O.atual.map((r) => ({ status: r.status as string })));
      const convoP = conversao(O.anterior.map((r) => ({ status: r.status as string })));

      // financeiro (escopado por responsável e/ou conexão de aquisição via cobrança→contato)
      let cobRows = (cob.data as Row[]) ?? [];
      if (f.responsavel) cobRows = cobRows.filter((r) => (r.responsavel_id as string) === f.responsavel);
      if (cids) cobRows = cobRows.filter((r) => cids.has(r.contato_id as string));
      const escopaPag = !!f.responsavel || !!cids;
      const cobIds = new Set(cobRows.map((r) => r.id as string));
      const pagRows = (((pag.data as Row[]) ?? []).filter((r) => !escopaPag || cobIds.has(r.cobranca_id as string))).map(toParcela);
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
        oportunidadesFechadas: kpi(clientesFech(OF.atual), clientesFech(OF.anterior)), // CLIENTES distintos (fechado_em)
        negociosFechados: kpi(OF.atual.length, OF.anterior.length),                    // oportunidades ganhas (fechado_em)
        conversaoComercial: kpi(convo.taxa, convoP.taxa),                              // conversão de OPORTUNIDADES (ganhas/criadas) — detalhe
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
      if (f.conexao) qOpp = qOpp.eq('canal_origem_id', f.conexao);
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
      const qConv = fetchAll(() => { let q = supabase!.from('conversas').select('id, status, criado_em, ultimo_provider, contato_id').eq('organizacao_id', org).abortSignal(signal!); if (f.canal) q = q.eq('ultimo_provider', f.canal); return q; }).then(wrapRows);
      const qMsg = fetchAll(() => supabase!.from('mensagens').select('conversa_id, direcao, tipo, autor_id, criado_em, enviada_em, recebida_em').eq('organizacao_id', org).gte('criado_em', p.iniISO).lt('criado_em', p.fimISO).abortSignal(signal!)).then(wrapRows);
      const [cv, m, cids] = await Promise.all([qConv, qMsg, cidsConexao(org, f.conexao, signal!)]);
      if (cv.error) throw new Error(cv.error.message); if (m.error) throw new Error(m.error.message);
      // conexão de aquisição restringe via contato (1 hop)
      const convAll = ((cv.data as Row[]) ?? []).filter((r) => !cids || cids.has(r.contato_id as string));
      const convSet = new Set(convAll.map((r) => r.id as string)); // canal + conexão selecionados
      const convPeriodo = convAll.filter((r) => { const t = tms(r, 'criado_em'); return t >= new Date(p.iniISO).getTime() && t < new Date(p.fimISO).getTime(); });
      let msgs = (m.data as Row[]) ?? [];
      if (f.canal || cids) msgs = msgs.filter((r) => convSet.has(r.conversa_id as string)); // canal/conexão restringe mensagens
      const recebidas = msgs.filter((r) => r.direcao === 'entrada');
      const enviadas = msgs.filter((r) => r.direcao === 'saida' && r.tipo !== 'sistema' && r.tipo !== 'nota_interna');
      const respHumanas = enviadas.filter((r) => r.autor_id != null); // evidência de autoria humana
      const respSet = new Set(respHumanas.map((r) => r.conversa_id as string));
      // P1: conversa com inbound NO PERÍODO (por mensagem), independentemente da data de criação da conversa
      const comEntrada = new Set(recebidas.map((r) => r.conversa_id as string));
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
export interface LinhaComercial { id: string; nome: string; leads: number; oppAndamento: number; oppGanho: number; oppPerdido: number; clientesFechados: number; negociosFechados: number; taxaConversao: number; receitaContratada: number; receitaRecebida: number; }
export interface LinhaAtend { id: string; nome: string; conversasRespondidas: number; mensagensEnviadas: number; conversasSemResposta: number; }
export interface EquipeData { comercial: LinhaComercial[]; atendimento: LinhaAtend[]; atendimentoAtribuivel: boolean; }
export function useEquipe(f: RelFiltros, enabled: boolean) {
  const { currentOrg } = useOrg(); const org = currentOrg.id; const p = resolvePeriodo(f.preset, f.ini, f.fim);
  return useQuery({
    queryKey: ['rel-equipe', org, chaveFiltros(f)], enabled: REL_REAL && enabled, staleTime: 60_000,
    queryFn: async ({ signal }): Promise<EquipeData> => {
      let qCt = supabase!.from('contatos').select('responsavel_id, criado_em, origem').eq('organizacao_id', org).is('mesclado_em', null).gte('criado_em', p.iniISO).lt('criado_em', p.fimISO).abortSignal(signal!);
      if (f.origem) qCt = qCt.eq('origem', f.origem);
      if (f.conexao) qCt = qCt.eq('canal_origem_id', f.conexao);
      let qOp = supabase!.from('oportunidades').select('responsavel_id, status, criado_em, coluna_id, origem').eq('organizacao_id', org).gte('criado_em', p.iniISO).lt('criado_em', p.fimISO).abortSignal(signal!);
      if (f.coluna) qOp = qOp.eq('coluna_id', f.coluna);
      if (f.origem) qOp = qOp.eq('origem', f.origem);
      if (f.status) qOp = qOp.eq('status', f.status);
      if (f.conexao) qOp = qOp.eq('canal_origem_id', f.conexao);
      // P2/P5: oportunidades GANHAS fechadas no período (por fechado_em) + responsável da opp e do contato (p/ fallback)
      let qOpFech = supabase!.from('oportunidades').select('contato_id, responsavel_id, contato:contatos(responsavel_id)').eq('organizacao_id', org).eq('status', 'ganho').gte('fechado_em', p.iniISO).lt('fechado_em', p.fimISO).abortSignal(signal!);
      if (f.coluna) qOpFech = qOpFech.eq('coluna_id', f.coluna);
      if (f.origem) qOpFech = qOpFech.eq('origem', f.origem);
      if (f.conexao) qOpFech = qOpFech.eq('canal_origem_id', f.conexao);
      const [us, ct, op, opf, cb, ms, cvv, mi] = await Promise.all([
        supabase!.from('organizacao_usuarios').select('usuarios(id, nome)').eq('organizacao_id', org).eq('status', 'ativo').abortSignal(signal!),
        qCt, qOp, fetchAll(() => qOpFech).then(wrapRows),
        supabase!.from('cobrancas').select('id, responsavel_id, criado_por, valor_mensal, ciclos_totais, status').eq('organizacao_id', org).abortSignal(signal!),
        fetchAll(() => supabase!.from('mensagens').select('autor_id, conversa_id').eq('organizacao_id', org).eq('direcao', 'saida').not('autor_id', 'is', null).gte('criado_em', p.iniISO).lt('criado_em', p.fimISO).abortSignal(signal!)).then(wrapRows),
        // P1: TODAS as conversas + responsável do contato (mapear "sem resposta" independentemente da criação da conversa)
        fetchAll(() => supabase!.from('conversas').select('id, contato:contatos(responsavel_id)').eq('organizacao_id', org).abortSignal(signal!)).then(wrapRows),
        fetchAll(() => supabase!.from('mensagens').select('conversa_id').eq('organizacao_id', org).eq('direcao', 'entrada').gte('criado_em', p.iniISO).lt('criado_em', p.fimISO).abortSignal(signal!)).then(wrapRows),
      ]);
      for (const r of [us, ct, op, opf, cb, ms, cvv, mi]) if (r.error) throw new Error(r.error.message);
      const com = new Map<string, LinhaComercial>(); const at = new Map<string, LinhaAtend>();
      for (const r of (us.data as Row[]) ?? []) { const u = one(r.usuarios); if (!u) continue; const id = u.id as string, nome = u.nome as string; com.set(id, { id, nome, leads: 0, oppAndamento: 0, oppGanho: 0, oppPerdido: 0, clientesFechados: 0, negociosFechados: 0, taxaConversao: 0, receitaContratada: 0, receitaRecebida: 0 }); at.set(id, { id, nome, conversasRespondidas: 0, mensagensEnviadas: 0, conversasSemResposta: 0 }); }
      const getC = (id: string | null) => (id ? com.get(id) ?? null : null);
      for (const r of (ct.data as Row[]) ?? []) { const l = getC(r.responsavel_id as string); if (l) l.leads += 1; }
      for (const r of (op.data as Row[]) ?? []) { const l = getC(r.responsavel_id as string); if (!l) continue; if (r.status === 'em_andamento') l.oppAndamento += 1; else if (r.status === 'ganho') l.oppGanho += 1; else if (r.status === 'perdido') l.oppPerdido += 1; }
      for (const r of (cb.data as Row[]) ?? []) { const l = getC((r.responsavel_id as string) || (r.criado_por as string)); if (l && r.status !== 'cancelado') l.receitaContratada += num(r.valor_mensal) * num(r.ciclos_totais); }
      // atendimento real por autor_id
      const msgs = (ms.data as Row[]) ?? [];
      const convPorAutor = new Map<string, Set<string>>();
      for (const r of msgs) { const a = r.autor_id as string; const l = at.get(a); if (!l) continue; l.mensagensEnviadas += 1; const set = convPorAutor.get(a) || new Set<string>(); set.add(r.conversa_id as string); convPorAutor.set(a, set); }
      for (const [a, set] of convPorAutor) { const l = at.get(a); if (l) l.conversasRespondidas = set.size; }
      // conversa → responsável do contato (TODAS as conversas — P1, independe da criação da conversa)
      const convResp = new Map<string, string | null>();
      for (const r of (cvv.data as Row[]) ?? []) { const cont = one(r.contato) as { responsavel_id?: string | null } | null; convResp.set(r.id as string, cont?.responsavel_id ?? null); }
      // conversas sem resposta por atendente: conversa com inbound NO PERÍODO e sem resposta humana, atribuída ao responsável do contato
      const respondidas = new Set(msgs.map((r) => r.conversa_id as string));
      const comEntrada = new Set(((mi.data as Row[]) ?? []).map((r) => r.conversa_id as string));
      for (const id of comEntrada) {
        if (respondidas.has(id)) continue;
        const l = getC(convResp.get(id) ?? null);
        if (l) at.get(l.id)!.conversasSemResposta += 1;
      }
      // P5: clientes/negócios fechados por atendente (fechado_em) com fallback opp.responsavel → contato.responsavel (≡ conversa.atendente via trigger de sync)
      const NAO_ATRIB = '__nao_atribuido__';
      const fechClientes = new Map<string, Set<string>>(); const fechNegocios = new Map<string, number>();
      for (const r of (opf.data as Row[]) ?? []) {
        const cont = one(r.contato) as { responsavel_id?: string | null } | null;
        const resp = (r.responsavel_id as string) || (cont?.responsavel_id ?? null);
        const key = resp && com.has(resp) ? resp : NAO_ATRIB;
        const cid = r.contato_id as string;
        if (!fechClientes.has(key)) fechClientes.set(key, new Set());
        if (cid) fechClientes.get(key)!.add(cid);
        fechNegocios.set(key, (fechNegocios.get(key) || 0) + 1);
      }
      for (const [id, l] of com) { l.clientesFechados = fechClientes.get(id)?.size ?? 0; l.negociosFechados = fechNegocios.get(id) ?? 0; }
      const atendimentoAtribuivel = msgs.length > 0;
      // receita recebida por responsável (parcelas pagas no período)
      const cobRows = (cb.data as Row[]) ?? [];
      const respByCob = new Map<string, string | null>(); cobRows.forEach((r) => respByCob.set(r.id as string, (r.responsavel_id as string) || (r.criado_por as string) || null));
      const { data: pg, error: epg } = await supabase!.from('cobranca_pagamentos').select('cobranca_id, valor_pago').eq('organizacao_id', org).eq('status', 'paga').gte('data_pagamento', p.iniDate).lt('data_pagamento', p.fimDate).abortSignal(signal!);
      if (epg) throw new Error(epg.message);
      for (const r of (pg as Row[]) ?? []) { const l = getC(respByCob.get(r.cobranca_id as string) || null); if (l) l.receitaRecebida += num(r.valor_pago); }
      // P3: taxa por atendente = clientes fechados ÷ contatos atribuídos
      for (const l of com.values()) { l.taxaConversao = l.leads === 0 ? 0 : (l.clientesFechados / l.leads) * 100; }
      const filtroResp = (id: string) => !f.responsavel || f.responsavel === id;
      const comercial = [...com.values()].filter((l) => filtroResp(l.id));
      // linha "Não atribuído" p/ reconciliar fechamentos sem responsável (só na visão geral)
      if (!f.responsavel && ((fechClientes.get(NAO_ATRIB)?.size ?? 0) > 0 || (fechNegocios.get(NAO_ATRIB) ?? 0) > 0)) {
        comercial.push({ id: NAO_ATRIB, nome: 'Não atribuído', leads: 0, oppAndamento: 0, oppGanho: 0, oppPerdido: 0, clientesFechados: fechClientes.get(NAO_ATRIB)?.size ?? 0, negociosFechados: fechNegocios.get(NAO_ATRIB) ?? 0, taxaConversao: 0, receitaContratada: 0, receitaRecebida: 0 });
      }
      return { comercial, atendimento: [...at.values()].filter((l) => filtroResp(l.id)), atendimentoAtribuivel };
    },
  });
}

/* ===== FONTE ÚNICA das métricas por atendente (consumida por Resumo/Atendimento/Detalhamento) =====
   Todas as abas devem usar montaLinhasEquipe — nenhuma pode recalcular "fechados" por conta própria. */
export interface LinhaEquipe {
  id: string; nome: string;
  contatos: number;            // contatos atribuídos/atendidos (carteira do período)
  oppTrabalhadas: number;      // oportunidades trabalhadas (andamento + ganho + perdido, por criação)
  oppAndamento: number; oppPerdido: number;
  clientesFechados: number;    // OFICIAL: contatos distintos com ganho por fechado_em (fallback de responsável)
  negociosFechados: number;    // OFICIAL: oportunidades ganhas por fechado_em (fallback de responsável)
  taxaOperacional: number;     // clientes fechados ÷ contatos atribuídos (pode passar de 100% em janela curta)
  mensagensEnviadas: number; conversasSemResposta: number;
  receitaContratada: number; receitaRecebida: number;
}
export function montaLinhasEquipe(eq: EquipeData): LinhaEquipe[] {
  const atMap = new Map(eq.atendimento.map((a) => [a.id, a]));
  return eq.comercial.map((c) => ({
    id: c.id, nome: c.nome, contatos: c.leads,
    oppTrabalhadas: c.oppAndamento + c.oppGanho + c.oppPerdido,
    oppAndamento: c.oppAndamento, oppPerdido: c.oppPerdido,
    clientesFechados: c.clientesFechados, negociosFechados: c.negociosFechados,
    taxaOperacional: c.taxaConversao, // useEquipe já calcula clientes ÷ contatos
    mensagensEnviadas: atMap.get(c.id)?.mensagensEnviadas ?? 0,
    conversasSemResposta: atMap.get(c.id)?.conversasSemResposta ?? 0,
    receitaContratada: c.receitaContratada, receitaRecebida: c.receitaRecebida,
  })).sort((a, b) => b.clientesFechados - a.clientesFechados || b.negociosFechados - a.negociosFechados || b.contatos - a.contatos);
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
      const [pg, cb, cids] = await Promise.all([
        supabase!.from('cobranca_pagamentos').select('status, valor, valor_pago, data_prevista, data_pagamento, cobranca_id').eq('organizacao_id', org).abortSignal(signal!),
        supabase!.from('cobrancas').select('id, status, valor_mensal, servico, responsavel_id, contato_id').eq('organizacao_id', org).abortSignal(signal!),
        cidsConexao(org, f.conexao, signal!),
      ]);
      if (pg.error) throw new Error(pg.error.message); if (cb.error) throw new Error(cb.error.message);
      let cob = (cb.data as Row[]) ?? [];
      if (f.responsavel) cob = cob.filter((r) => (r.responsavel_id as string) === f.responsavel); // responsável: filtro válido p/ financeiro
      if (cids) cob = cob.filter((r) => cids.has(r.contato_id as string)); // conexão de aquisição via contato
      const escopa = !!f.responsavel || !!cids;
      const cobIds = new Set(cob.map((r) => r.id as string));
      const parRows = (((pg.data as Row[]) ?? []).filter((r) => !escopa || cobIds.has(r.cobranca_id as string)));
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
      if (f.conexao) q = q.eq('canal_origem_id', f.conexao);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      const map = new Map<string, LinhaOrigem>();
      for (const r of (data as Row[]) ?? []) { const k = (r.origem as string) || (r.fonte_aquisicao as string) || 'Não informado'; const cur = map.get(k) || { origem: k, leads: 0, fechados: 0, taxaConversao: 0 }; cur.leads += 1; if (r.status === 'ganho') cur.fechados += 1; map.set(k, cur); }
      const lista = [...map.values()]; for (const l of lista) l.taxaConversao = l.leads === 0 ? 0 : (l.fechados / l.leads) * 100;
      return lista.sort((a, b) => b.leads - a.leads);
    },
  });
}

/* ====================== Desempenho por conexão (chip) ====================== */

/** Chave canônica de telefone para DEDUP de pessoas: DDD + 8 dígitos finais,
 *  ignorando o DDI 55 e o 9º dígito de celular (mesma pessoa vinda com e sem o 9
 *  colapsa numa chave só). Fora do padrão BR, cai no número normalizado como veio.
 *  Retorna null quando não há dígitos (contato sem telefone / LID puro). */
export function chaveCanonicaTelefone(raw: string | null | undefined): string | null {
  const d = (raw || '').replace(/\D/g, '');
  if (!d) return null;
  // remove DDI 55 só quando o restante fica com 10 (DDD+8) ou 11 (DDD+9+8) dígitos
  const core = d.startsWith('55') && (d.length - 2 === 10 || d.length - 2 === 11) ? d.slice(2) : d;
  if (core.length === 10 || core.length === 11) return core.slice(0, 2) + core.slice(-8); // DDD + 8 finais
  return d; // número fora do padrão BR: mantém como veio (não arrisca colisão)
}

export interface ConexaoIdent { nome: string; numero: string; tipo: string; gestor: string; fonte: string; campanha: string; removida: boolean; }
export interface ConexaoLinha extends ConexaoIdent {
  chave: string; novosContatos: number; leadsRecebidos: number; leadsAnterior: number; conversas: number; conversasAtendidas: number; semResposta: number;
  // Métricas separadas (Etapa 1): pessoas reais que chamaram vs contatos criados (podem incluir outbound-only/duplicados).
  pessoasQueChamaram: number; contatosCriados: number; conversasRecebidas: number; msgsInbound: number; msgsOutbound: number; difContatosPessoas: number;
  // fechados = CLIENTES distintos fechados no período (por fechado_em); negociosFechados = oportunidades ganhas (por fechado_em)
  oportunidades: number; qualificados: number; fechados: number; negociosFechados: number; perdidos: number; qualifFechados: number;
  taxaAtendimento: number; taxaQualificacao: number; taxaConversao: number; conversaoOportunidades: number; convQualificados: number;
  primeiraRespostaMin: number | null; tempoAteFechamentoDias: number | null;
  receitaPrevista: number; receitaRecebida: number; valoresAtraso: number; economia: number; economiaPreenchida: boolean; clientesPagantes: number; ticketMedio: number;
}
export interface ConexaoInput {
  contatos: { id: string; chip: string; criadoEm: string; tel: string | null }[];
  identidade: Record<string, ConexaoIdent>;
  conversas: { id: string; chip: string; criadoEm: string }[];
  comEntrada: Set<string>; resp: Set<string>;
  contatosComInbound: Set<string>; // contatos com ≥1 mensagem direcao='entrada' no período
  firstIn: { conversa: string; chip: string; t: number }[]; firstResp: { conversa: string; chip: string; t: number }[];
  outbound: { chip: string }[]; // toda mensagem direcao='saida' no período (p/ contagem por chip)
  opps: { chip: string; status: string; qualificada: boolean; tempoFechDias: number | null }[]; // oportunidades CRIADAS no período (criado_em)
  fechamentos: { chip: string; contato: string }[]; // oportunidades GANHAS fechadas no período (fechado_em) — P2/P4
  parcelas: { chip: string; contato: string; status: string; valor: number; valorPago: number | null; dataPrevista: string | null; dataPagamento: string | null }[];
  economiaPorChip: Record<string, { total: number; preenchida: boolean }>;
  iniDate: string; fimDate: string; prevIniDate: string; hoje: string;
}
const r1 = (n: number, d: number) => (d === 0 ? 0 : (n / d) * 100);
export function montaLinhasConexao(inp: ConexaoInput): ConexaoLinha[] {
  const chaves = new Set<string>();
  inp.contatos.forEach((c) => chaves.add(c.chip));
  inp.conversas.forEach((c) => chaves.add(c.chip));
  inp.opps.forEach((o) => chaves.add(o.chip));
  inp.parcelas.forEach((p) => chaves.add(p.chip));
  const inRange = (d: string, a: string, b: string) => d >= a && d < b; // datas YYYY-MM-DD (parcelas)
  const iniMs = new Date(inp.iniDate + 'T00:00:00-03:00').getTime();
  const fimMs = new Date(inp.fimDate + 'T00:00:00-03:00').getTime();
  const prevMs = new Date(inp.prevIniDate + 'T00:00:00-03:00').getTime();
  const linhas: ConexaoLinha[] = [];
  for (const chave of chaves) {
    const id = inp.identidade[chave] || { nome: chave === 'sem' ? 'Sem conexão' : 'Conexão', numero: '', tipo: '', gestor: '', fonte: '', campanha: '', removida: false };
    const ct = inp.contatos.filter((c) => c.chip === chave);
    const novos = ct.filter((c) => { const t = new Date(c.criadoEm).getTime(); return t >= iniMs && t < fimMs; }).length;
    const leadsAnt = ct.filter((c) => { const t = new Date(c.criadoEm).getTime(); return t >= prevMs && t < iniMs; }).length;
    const convs = inp.conversas.filter((c) => c.chip === chave);
    const conversas = convs.length;
    const atendidas = convs.filter((c) => inp.resp.has(c.id)).length;
    const comEnt = convs.filter((c) => inp.comEntrada.has(c.id));
    const semResp = comEnt.filter((c) => !inp.resp.has(c.id)).length;
    // Pessoas que chamaram: contatos do chip com inbound real, deduplicados por chave canônica
    // (9º dígito/DDI colapsam); sem telefone (LID puro) conta como 1 via fallback por contato.
    const pessoasSet = new Set<string>();
    for (const c of ct) if (inp.contatosComInbound.has(c.id)) pessoasSet.add(chaveCanonicaTelefone(c.tel) ?? ('noid:' + c.id));
    const pessoasQueChamaram = pessoasSet.size;
    const conversasRecebidas = comEnt.length;                                   // conversas com inbound no período
    const msgsInbound = inp.firstIn.filter((x) => x.chip === chave).length;     // mensagens de entrada no período
    const msgsOutbound = inp.outbound.filter((x) => x.chip === chave).length;   // mensagens de saída no período
    const prMin = tempoMedioPrimeiraResposta(inp.firstIn.filter((x) => x.chip === chave).map((x) => ({ c: x.conversa, t: x.t })), inp.firstResp.filter((x) => x.chip === chave).map((x) => ({ c: x.conversa, t: x.t })));
    const ops = inp.opps.filter((o) => o.chip === chave);
    const oportunidades = ops.length;
    const oppsGanhasCriadas = ops.filter((o) => o.status === 'ganho').length; // p/ "Conversão de oportunidades" (detalhe)
    const perdidos = ops.filter((o) => o.status === 'perdido').length;
    const qualificados = ops.filter((o) => o.qualificada).length;
    const qualifFechados = ops.filter((o) => o.qualificada && o.status === 'ganho').length;
    const tf = ops.map((o) => o.tempoFechDias).filter((v): v is number => v != null);
    // Clientes fechados (P2/P4): oportunidades GANHAS fechadas no período (fechado_em); cliente distinto vs negócio
    const fech = inp.fechamentos.filter((o) => o.chip === chave);
    const negociosFechados = fech.length;
    const fechados = new Set(fech.map((o) => o.contato)).size; // CLIENTES distintos
    const par = inp.parcelas.filter((p) => p.chip === chave);
    const receitaRecebida = par.filter((p) => p.status === 'paga' && p.dataPagamento && inRange(p.dataPagamento, inp.iniDate, inp.fimDate)).reduce((s, p) => s + (p.valorPago || 0), 0);
    const receitaPrevista = par.filter((p) => p.status !== 'cancelada' && p.dataPrevista && inRange(p.dataPrevista, inp.iniDate, inp.fimDate)).reduce((s, p) => s + (p.valor || 0), 0);
    const valoresAtraso = par.filter((p) => p.status !== 'cancelada' && p.status !== 'paga' && p.dataPrevista && p.dataPrevista < inp.hoje).reduce((s, p) => s + (p.valor || 0), 0);
    const pagantes = new Set(par.filter((p) => p.status === 'paga' && p.dataPagamento && inRange(p.dataPagamento, inp.iniDate, inp.fimDate)).map((p) => p.contato));
    const ec = inp.economiaPorChip[chave] || { total: 0, preenchida: false };
    linhas.push({
      chave, ...id,
      novosContatos: novos, leadsRecebidos: novos, leadsAnterior: leadsAnt,
      pessoasQueChamaram, contatosCriados: novos, conversasRecebidas, msgsInbound, msgsOutbound, difContatosPessoas: novos - pessoasQueChamaram,
      conversas, conversasAtendidas: atendidas, semResposta: semResp,
      oportunidades, qualificados, fechados, negociosFechados, perdidos, qualifFechados,
      // P3: taxa principal = clientes fechados ÷ pessoas que chamaram; conversão de oportunidades fica separada (detalhe)
      taxaAtendimento: r1(atendidas, comEnt.length), taxaQualificacao: r1(qualificados, oportunidades), taxaConversao: r1(fechados, pessoasQueChamaram), conversaoOportunidades: r1(oppsGanhasCriadas, oportunidades), convQualificados: r1(qualifFechados, qualificados),
      primeiraRespostaMin: prMin, tempoAteFechamentoDias: tf.length ? tf.reduce((a, b) => a + b, 0) / tf.length : null,
      receitaPrevista, receitaRecebida, valoresAtraso, economia: ec.total, economiaPreenchida: ec.preenchida,
      clientesPagantes: pagantes.size, ticketMedio: pagantes.size ? receitaRecebida / pagantes.size : 0,
    });
  }
  return linhas.sort((a, b) => b.pessoasQueChamaram - a.pessoasQueChamaram || b.contatosCriados - a.contatosCriados || b.receitaRecebida - a.receitaRecebida);
}
export function melhorConexao(linhas: ConexaoLinha[]): ConexaoLinha | null {
  const reais = linhas.filter((l) => l.chave !== 'sem');
  if (!reais.length) return null;
  return reais.slice().sort((a, b) => b.pessoasQueChamaram - a.pessoasQueChamaram || b.fechados - a.fechados)[0];
}

export function useConexoes(f: RelFiltros, enabled: boolean) {
  const { currentOrg } = useOrg(); const org = currentOrg.id; const p = resolvePeriodo(f.preset, f.ini, f.fim);
  return useQuery({
    queryKey: ['rel-conexoes', org, chaveFiltros(f)], enabled: REL_REAL && enabled, staleTime: 60_000,
    queryFn: async ({ signal }): Promise<ConexaoLinha[]> => {
      const [ct, cv, m, op, opFech, cb, pg, fc, cx] = await Promise.all([
        fetchAll(() => supabase!.from('contatos').select('id, canal_origem_id, canal_origem_snapshot, criado_em, telefone').eq('organizacao_id', org).is('mesclado_em', null).abortSignal(signal!)).then(wrapRows),
        // P1: TODAS as conversas da org (sem filtro de período) p/ mapear qualquer mensagem do período à sua conversa/contato
        fetchAll(() => supabase!.from('conversas').select('id, contato_id').eq('organizacao_id', org).abortSignal(signal!)).then(wrapRows),
        fetchAll(() => supabase!.from('mensagens').select('conversa_id, direcao, tipo, autor_id, criado_em, enviada_em, recebida_em').eq('organizacao_id', org).gte('criado_em', p.iniISO).lt('criado_em', p.fimISO).abortSignal(signal!)).then(wrapRows),
        fetchAll(() => supabase!.from('oportunidades').select('contato_id, status, coluna_id, criado_em, fechado_em').eq('organizacao_id', org).gte('criado_em', p.iniISO).lt('criado_em', p.fimISO).abortSignal(signal!)).then(wrapRows),
        // P2: oportunidades GANHAS fechadas no período (por fechado_em) → clientes/negócios fechados
        fetchAll(() => supabase!.from('oportunidades').select('contato_id, fechado_em, criado_em').eq('organizacao_id', org).eq('status', 'ganho').gte('fechado_em', p.iniISO).lt('fechado_em', p.fimISO).abortSignal(signal!)).then(wrapRows),
        fetchAll(() => supabase!.from('cobrancas').select('id, contato_id, status, valor_economizado').eq('organizacao_id', org).abortSignal(signal!)).then(wrapRows),
        fetchAll(() => supabase!.from('cobranca_pagamentos').select('cobranca_id, status, valor, valor_pago, data_prevista, data_pagamento').eq('organizacao_id', org).abortSignal(signal!)).then(wrapRows),
        supabase!.from('funil_colunas').select('id, entrada').eq('organizacao_id', org),
        supabase!.from('canais').select('id, nome_interno, numero_conectado, origem_tipo, campanha, provider, gestor:usuarios(nome), fonte:fontes_aquisicao(nome)').eq('organizacao_id', org),
      ]);
      for (const r of [ct, cv, m, op, opFech, cb, pg, fc, cx]) if (r.error) throw new Error(r.error.message);
      const canalIdent = new Map<string, ConexaoIdent>(); const evolutionIds = new Set<string>();
      for (const r of (cx.data as Row[]) ?? []) {
        const g = one(r.gestor), ft = one(r.fonte);
        canalIdent.set(r.id as string, { nome: (r.nome_interno as string) || 'WhatsApp', numero: (r.numero_conectado as string) || '', tipo: (r.origem_tipo as string) || '', gestor: (g?.nome as string) || '', fonte: (ft?.nome as string) || '', campanha: (r.campanha as string) || '', removida: false });
        if (r.provider === 'evolution') evolutionIds.add(r.id as string);
      }
      const entradaIds = new Set(((fc.data as Row[]) ?? []).filter((r) => r.entrada).map((r) => r.id as string));
      // contato → chip + identidade (SOMENTE conexões WhatsApp = provider evolution; Facebook fica fora da seção de chips)
      const contatoChip = new Map<string, string>(); const identidade: Record<string, ConexaoIdent> = {};
      const contatos = (((ct.data as Row[]) ?? []).filter((r) => !f.conexao || (r.canal_origem_id as string) === f.conexao).map((r) => {
        const snap = r.canal_origem_snapshot as Record<string, unknown> | null;
        const cid = (r.canal_origem_id as string) || null;
        if (cid && !evolutionIds.has(cid)) return null;                 // aquisição por canal não-WhatsApp → fora
        if (!cid && snap && snap.provider && snap.provider !== 'evolution') return null; // removido não-WhatsApp → fora
        const chip = chaveConexao(cid, snap);
        contatoChip.set(r.id as string, chip);
        if (!identidade[chip]) {
          if (cid && canalIdent.has(cid)) identidade[chip] = canalIdent.get(cid)!;
          else if (snap) identidade[chip] = { nome: (snap.nome as string) || 'Conexão removida', numero: (snap.numero as string) || '', tipo: (snap.tipo as string) || '', gestor: (snap.gestor_nome as string) || '', fonte: (snap.fonte_nome as string) || '', campanha: (snap.campanha as string) || '', removida: true };
          else identidade[chip] = { nome: 'Sem conexão', numero: '', tipo: '', gestor: '', fonte: '', campanha: '', removida: false };
        }
        return { id: r.id as string, chip, criadoEm: r.criado_em as string, tel: (r.telefone as string) ?? null };
      }).filter(Boolean)) as { id: string; chip: string; criadoEm: string; tel: string | null }[];
      // mapa conversa → chip/contato de TODAS as conversas (P1: independe da data de criação da conversa)
      const convChip = new Map<string, string>(); const convContato = new Map<string, string>();
      for (const r of (cv.data as Row[]) ?? []) { const chip = contatoChip.get(r.contato_id as string); if (!chip) continue; convChip.set(r.id as string, chip); convContato.set(r.id as string, r.contato_id as string); }
      // P1: mensagens são filtradas SÓ por mensagens.criado_em no período (já na query); mapeiam-se à conversa/contato via os mapas acima
      const msgs = (m.data as Row[]) ?? [];
      const recebidas = msgs.filter((r) => r.direcao === 'entrada' && convChip.has(r.conversa_id as string));
      const respHumanas = msgs.filter((r) => r.direcao === 'saida' && r.tipo !== 'sistema' && r.tipo !== 'nota_interna' && r.autor_id != null && convChip.has(r.conversa_id as string));
      const saidas = msgs.filter((r) => r.direcao === 'saida' && r.tipo !== 'sistema' && r.tipo !== 'nota_interna' && convChip.has(r.conversa_id as string));
      const outbound = saidas.map((r) => ({ chip: convChip.get(r.conversa_id as string)! }));
      // conversas com inbound NO PERÍODO (distintas) — base das métricas de conversa
      const convComInbound = new Map<string, string>();
      for (const r of recebidas) convComInbound.set(r.conversa_id as string, convChip.get(r.conversa_id as string)!);
      const conversas = [...convComInbound].map(([id, chip]) => ({ id, chip, criadoEm: '' }));
      const comEntrada = new Set(convComInbound.keys());
      // contatos com ≥1 inbound real no período (via conversa → contato), independentemente da criação da conversa
      const contatosComInbound = new Set<string>();
      for (const r of recebidas) { const cid = convContato.get(r.conversa_id as string); if (cid) contatosComInbound.add(cid); }
      const resp = new Set(respHumanas.map((r) => r.conversa_id as string));
      const firstIn = recebidas.map((r) => ({ conversa: r.conversa_id as string, chip: convChip.get(r.conversa_id as string)!, t: tms(r, 'recebida_em', 'criado_em') }));
      const firstResp = respHumanas.map((r) => ({ conversa: r.conversa_id as string, chip: convChip.get(r.conversa_id as string)!, t: tms(r, 'enviada_em', 'criado_em') }));
      // P2: fechamentos (ganho por fechado_em) mapeados ao chip via contato; contatos mesclados/não-WhatsApp ficam de fora (sem chip)
      const fechamentos = (((opFech.data as Row[]) ?? []).map((r) => { const chip = contatoChip.get(r.contato_id as string); return chip ? { chip, contato: r.contato_id as string } : null; }).filter(Boolean)) as { chip: string; contato: string }[];
      const opps = (((op.data as Row[]) ?? []).map((r) => {
        const chip = contatoChip.get(r.contato_id as string); if (!chip) return null;
        const col = r.coluna_id as string | null;
        const qualificada = r.status !== 'cancelado' && !!col && !entradaIds.has(col);
        const tempoFechDias = r.status === 'ganho' && r.fechado_em ? (new Date(r.fechado_em as string).getTime() - new Date(r.criado_em as string).getTime()) / 86400000 : null;
        return { chip, status: r.status as string, qualificada, tempoFechDias };
      }).filter(Boolean)) as { chip: string; status: string; qualificada: boolean; tempoFechDias: number | null }[];
      const cobChip = new Map<string, string>(); const economiaPorChip: Record<string, { total: number; preenchida: boolean }> = {};
      for (const r of (cb.data as Row[]) ?? []) { const chip = contatoChip.get(r.contato_id as string); if (!chip) continue; cobChip.set(r.id as string, chip); const cur = economiaPorChip[chip] || { total: 0, preenchida: false }; if (r.valor_economizado != null) { cur.preenchida = true; cur.total += num(r.valor_economizado); } economiaPorChip[chip] = cur; }
      const parcelas = ((pg.data as Row[]) ?? []).map((r) => { const chip = cobChip.get(r.cobranca_id as string); return chip ? { chip, contato: r.cobranca_id as string, status: r.status as string, valor: num(r.valor), valorPago: r.valor_pago == null ? null : num(r.valor_pago), dataPrevista: (r.data_prevista as string) ?? null, dataPagamento: (r.data_pagamento as string) ?? null } : null; }).filter(Boolean) as ConexaoInput['parcelas'];
      return montaLinhasConexao({ contatos, identidade, conversas, comEntrada, resp, contatosComInbound, firstIn, firstResp, outbound, opps, fechamentos, parcelas, economiaPorChip, iniDate: p.iniDate, fimDate: p.fimDate, prevIniDate: p.prevIniDate, hoje: spHoje() });
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
