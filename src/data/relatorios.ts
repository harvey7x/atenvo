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
function addDias(dateStr: string, n: number): string { const d = new Date(dateStr + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function primeiroDoMes(dateStr: string): string { return dateStr.slice(0, 8) + '01'; }
function instante(dateStr: string): string { return dateStr + 'T00:00:00-03:00'; } // SP = UTC-3 (sem DST)
function difDias(aIso: string, bIso: string): number { return Math.round((new Date(bIso).getTime() - new Date(aIso).getTime()) / 86400000); }

export interface Periodo {
  iniDate: string; fimDate: string;          // datas SP (fim EXCLUSIVO)
  iniISO: string; fimISO: string;            // instantes (fim exclusivo)
  prevIniDate: string; prevIniISO: string;   // início do período anterior (fim = iniISO)
  dias: number; label: string; prevLabel: string;
}
const fmtBR = (d: string) => d.split('-').reverse().join('/');

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
  const dias = Math.max(1, difDias(iniISO, fimISO));
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

/* ====================== KPI helper ====================== */
export interface Kpi { atual: number; anterior: number; deltaAbs: number; deltaPct: number | null; }
export function kpi(atual: number, anterior: number): Kpi {
  const deltaAbs = atual - anterior;
  const deltaPct = anterior === 0 ? (atual === 0 ? 0 : null) : (deltaAbs / anterior) * 100;
  return { atual, anterior, deltaAbs, deltaPct };
}

/* ====================== Utilidades ====================== */
type Row = Record<string, unknown>;
const one = (v: unknown): Row | null => (Array.isArray(v) ? ((v[0] as Row) ?? null) : ((v as Row) ?? null));
const num = (v: unknown) => (v == null ? 0 : Number(v) || 0);
const ts = (r: Row, ...f: string[]) => { for (const k of f) { const v = r[k]; if (v) return new Date(v as string).getTime(); } return 0; };
function partição<T extends Row>(rows: T[], campo: string, p: Periodo): { atual: T[]; anterior: T[] } {
  const ini = new Date(p.iniISO).getTime();
  const atual: T[] = [], anterior: T[] = [];
  for (const r of rows) { const t = ts(r, campo); if (t >= ini) atual.push(r); else anterior.push(r); }
  return { atual, anterior };
}
const chaveFiltros = (f: RelFiltros) => JSON.stringify([f.preset, f.ini, f.fim, f.canal, f.origem, f.responsavel, f.coluna, f.status]);

/* ====================== Opções de filtro ====================== */
export interface RelOpcoes { responsaveis: { id: string; nome: string }[]; origens: string[]; colunas: { id: string; nome: string; ordem: number }[]; canais: { id: string; rotulo: string }[]; }
export function useRelatorioOpcoes() {
  const { currentOrg } = useOrg(); const org = currentOrg.id;
  return useQuery({
    queryKey: ['rel-opcoes', org], enabled: REL_REAL, staleTime: 5 * 60_000,
    queryFn: async (): Promise<RelOpcoes> => {
      const [us, fo, co, ca] = await Promise.all([
        supabase!.from('organizacao_usuarios').select('papel, usuarios(id, nome)').eq('organizacao_id', org).eq('status', 'ativo'),
        supabase!.from('fontes_aquisicao').select('nome, slug').eq('organizacao_id', org).eq('ativo', true),
        supabase!.from('funil_colunas').select('id, nome, ordem, funil_id, entrada').eq('organizacao_id', org).eq('arquivada', false).order('ordem'),
        supabase!.from('canais').select('id, nome_interno, tipo').eq('organizacao_id', org).neq('status_integracao', 'removido'),
      ]);
      const responsaveis = ((us.data as Row[]) ?? []).map((r) => { const u = one(r.usuarios as Row); return u ? { id: u.id as string, nome: u.nome as string } : null; }).filter(Boolean) as { id: string; nome: string }[];
      const origens = ((fo.data as Row[]) ?? []).map((r) => (r.nome as string)).filter(Boolean).sort((a, b) => a.localeCompare(b));
      const colunas = ((co.data as Row[]) ?? []).map((r) => ({ id: r.id as string, nome: r.nome as string, ordem: num(r.ordem) }));
      const canais = ((ca.data as Row[]) ?? []).map((r) => ({ id: r.id as string, rotulo: `${r.nome_interno as string}` }));
      responsaveis.sort((a, b) => a.nome.localeCompare(b.nome));
      return { responsaveis, origens, colunas, canais };
    },
  });
}

/* ====================== Resumo executivo ====================== */
export interface ResumoData {
  novosContatos: Kpi; leadsRecebidos: Kpi; leadsAtendidos: Kpi; oportunidadesAbertas: Kpi; clientesFechados: Kpi;
  taxaConversao: Kpi; receitaRecebida: Kpi; receitaPrevista: Kpi; ticketMedio: Kpi; parcelasAtraso: Kpi; taxaInadimplencia: Kpi;
  economiaGerada: Kpi | null; // null => indisponível (sem dados)
}
export function useResumo(f: RelFiltros) {
  const { currentOrg } = useOrg(); const org = currentOrg.id; const p = resolvePeriodo(f.preset, f.ini, f.fim);
  return useQuery({
    queryKey: ['rel-resumo', org, chaveFiltros(f)], enabled: REL_REAL, staleTime: 60_000,
    queryFn: async ({ signal }): Promise<ResumoData> => {
      let qContatos = supabase!.from('contatos').select('id, criado_em, origem, responsavel_id').eq('organizacao_id', org).gte('criado_em', p.prevIniISO).lt('criado_em', p.fimISO).abortSignal(signal!);
      if (f.responsavel) qContatos = qContatos.eq('responsavel_id', f.responsavel);
      if (f.origem) qContatos = qContatos.eq('origem', f.origem);
      let qOpp = supabase!.from('oportunidades').select('id, status, criado_em, fechado_em, responsavel_id, origem, coluna_id').eq('organizacao_id', org).gte('criado_em', p.prevIniISO).lt('criado_em', p.fimISO).abortSignal(signal!);
      if (f.responsavel) qOpp = qOpp.eq('responsavel_id', f.responsavel);
      if (f.coluna) qOpp = qOpp.eq('coluna_id', f.coluna);
      if (f.status) qOpp = qOpp.eq('status', f.status);
      const qConv = supabase!.from('conversas').select('id, criado_em, status').eq('organizacao_id', org).gte('criado_em', p.prevIniISO).lt('criado_em', p.fimISO).abortSignal(signal!);
      const qMsg = supabase!.from('mensagens').select('conversa_id, direcao, tipo, criado_em').eq('organizacao_id', org).eq('direcao', 'saida').gte('criado_em', p.prevIniISO).lt('criado_em', p.fimISO).abortSignal(signal!);
      // parcelas por data_pagamento (recebida) e data_prevista (prevista) no range combinado
      const qPag = supabase!.from('cobranca_pagamentos').select('status, valor, valor_pago, data_prevista, data_pagamento').eq('organizacao_id', org).abortSignal(signal!);
      const qCob = supabase!.from('cobrancas').select('valor_mensal, status, valor_economizado, criado_em').eq('organizacao_id', org).abortSignal(signal!);
      const [c, o, cv, m, pag, cob] = await Promise.all([qContatos, qOpp, qConv, qMsg, qPag, qCob]);
      for (const r of [c, o, cv, m, pag, cob]) if (r.error) throw new Error(r.error.message);
      const C = partição((c.data as Row[]) ?? [], 'criado_em', p);
      const O = partição((o.data as Row[]) ?? [], 'criado_em', p);
      void cv; // conversas reservadas p/ futuras métricas do resumo
      // leads atendidos = conversas distintas com saída no período
      const msgs = (m.data as Row[]) ?? [];
      const convComSaida = (rows: Row[]) => new Set(rows.map((r) => r.conversa_id as string));
      const Mp = partição(msgs, 'criado_em', p);
      const ganhos = (rows: Row[]) => rows.filter((r) => r.status === 'ganho').length;
      const abertas = (rows: Row[]) => rows.filter((r) => r.status === 'em_andamento').length;
      const convFmt = (n: number, d: number) => (d === 0 ? 0 : (n / d) * 100);
      // financeiro
      const pagRows = (pag.data as Row[]) ?? [];
      const hoje = spHoje();
      const recebidaRange = (di: string, df: string) => pagRows.filter((r) => r.status === 'paga' && r.data_pagamento && (r.data_pagamento as string) >= di && (r.data_pagamento as string) < df).reduce((s, r) => s + num(r.valor_pago), 0);
      const previstaRange = (di: string, df: string) => pagRows.filter((r) => r.status !== 'cancelada' && r.data_prevista && (r.data_prevista as string) >= di && (r.data_prevista as string) < df).reduce((s, r) => s + num(r.valor), 0);
      const atrasoRange = (di: string, df: string) => pagRows.filter((r) => r.status === 'prevista' && r.data_prevista && (r.data_prevista as string) < hoje && (r.data_prevista as string) >= di && (r.data_prevista as string) < df).length;
      const vencRange = (di: string, df: string) => pagRows.filter((r) => (r.data_prevista as string) >= di && (r.data_prevista as string) < df && (r.data_prevista as string) < hoje && r.status !== 'cancelada');
      const inadRange = (di: string, df: string) => { const v = vencRange(di, df); const naoPg = v.filter((r) => r.status !== 'paga').length; return v.length === 0 ? 0 : (naoPg / v.length) * 100; };
      const cobRows = (cob.data as Row[]) ?? [];
      const Cob = partição(cobRows, 'criado_em', p);
      const ticket = (rows: Row[]) => { const a = rows.filter((r) => r.status !== 'cancelado'); return a.length === 0 ? 0 : a.reduce((s, r) => s + num(r.valor_mensal), 0) / a.length; };
      const economiaTotal = cobRows.reduce((s, r) => s + num(r.valor_economizado), 0);

      const leadsAt = (mp: Row[]) => convComSaida(mp).size;
      const data: ResumoData = {
        novosContatos: kpi(C.atual.length, C.anterior.length),
        leadsRecebidos: kpi(O.atual.length, O.anterior.length),
        leadsAtendidos: kpi(leadsAt(Mp.atual), leadsAt(Mp.anterior)),
        oportunidadesAbertas: kpi(abertas(O.atual), abertas(O.anterior)),
        clientesFechados: kpi(ganhos(O.atual), ganhos(O.anterior)),
        taxaConversao: kpi(convFmt(ganhos(O.atual), O.atual.length), convFmt(ganhos(O.anterior), O.anterior.length)),
        receitaRecebida: kpi(recebidaRange(p.iniDate, p.fimDate), recebidaRange(p.prevIniDate, p.iniDate)),
        receitaPrevista: kpi(previstaRange(p.iniDate, p.fimDate), previstaRange(p.prevIniDate, p.iniDate)),
        ticketMedio: kpi(ticket(Cob.atual), ticket(Cob.anterior)),
        parcelasAtraso: kpi(atrasoRange(p.prevIniDate, p.fimDate), 0),
        taxaInadimplencia: kpi(inadRange(p.iniDate, p.fimDate), inadRange(p.prevIniDate, p.iniDate)),
        economiaGerada: economiaTotal > 0 ? kpi(Cob.atual.reduce((s, r) => s + num(r.valor_economizado), 0), Cob.anterior.reduce((s, r) => s + num(r.valor_economizado), 0)) : null,
      };
      return data;
    },
  });
}

/* ====================== Comercial / Funil ====================== */
export interface FunilColuna { id: string; nome: string; ordem: number; total: number }
export interface ComercialData {
  leadsSerie: { label: string; v: number }[];
  funil: FunilColuna[];
  porStatus: { status: string; total: number }[];
  taxaConversao: number; taxaFechamento: number; perdidos: number; semMov: number; paradasMais7d: number;
  totalOpp: number;
}
export function useComercial(f: RelFiltros, enabled: boolean) {
  const { currentOrg } = useOrg(); const org = currentOrg.id; const p = resolvePeriodo(f.preset, f.ini, f.fim);
  return useQuery({
    queryKey: ['rel-comercial', org, chaveFiltros(f)], enabled: REL_REAL && enabled, staleTime: 60_000,
    queryFn: async ({ signal }): Promise<ComercialData> => {
      let qOpp = supabase!.from('oportunidades').select('id, status, criado_em, atualizado_em, fechado_em, responsavel_id, origem, coluna_id, funil_colunas(nome, ordem)').eq('organizacao_id', org).gte('criado_em', p.iniISO).lt('criado_em', p.fimISO).abortSignal(signal!);
      if (f.responsavel) qOpp = qOpp.eq('responsavel_id', f.responsavel);
      if (f.coluna) qOpp = qOpp.eq('coluna_id', f.coluna);
      if (f.origem) qOpp = qOpp.eq('origem', f.origem);
      const { data, error } = await qOpp;
      if (error) throw new Error(error.message);
      const rows = (data as Row[]) ?? [];
      const total = rows.length;
      const ganho = rows.filter((r) => r.status === 'ganho').length;
      const perdido = rows.filter((r) => r.status === 'perdido').length;
      const fechadasNoFunil = ganho + perdido;
      // funil por coluna real (configurável)
      const colMap = new Map<string, FunilColuna>();
      for (const r of rows) {
        const c = one(r.funil_colunas as Row); const id = (r.coluna_id as string) || 'sem';
        const nome = (c?.nome as string) || 'Sem etapa'; const ordem = num(c?.ordem);
        const cur = colMap.get(id) || { id, nome, ordem, total: 0 }; cur.total += 1; colMap.set(id, cur);
      }
      const funil = [...colMap.values()].sort((a, b) => a.ordem - b.ordem);
      // série diária de leads
      const serieMap = new Map<string, number>();
      for (const r of rows) { const d = new Date(r.criado_em as string); const key = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, month: '2-digit', day: '2-digit' }).format(d); serieMap.set(key, (serieMap.get(key) || 0) + 1); }
      const leadsSerie = [...serieMap.entries()].sort().map(([label, v]) => ({ label: label.split('-').reverse().join('/'), v }));
      // paradas/sem movimentação
      const agora = Date.now(); const seteDias = 7 * 86400000;
      const emAnd = rows.filter((r) => r.status === 'em_andamento');
      const paradasMais7d = emAnd.filter((r) => agora - ts(r, 'atualizado_em', 'criado_em') > seteDias).length;
      const porStatusMap = new Map<string, number>();
      for (const r of rows) porStatusMap.set(r.status as string, (porStatusMap.get(r.status as string) || 0) + 1);
      return {
        leadsSerie, funil,
        porStatus: [...porStatusMap.entries()].map(([status, total]) => ({ status, total })),
        taxaConversao: total === 0 ? 0 : (ganho / total) * 100,
        taxaFechamento: fechadasNoFunil === 0 ? 0 : (ganho / fechadasNoFunil) * 100,
        perdidos: perdido, semMov: paradasMais7d, paradasMais7d, totalOpp: total,
      };
    },
  });
}

/* ====================== Atendimento ====================== */
export interface AtendimentoData {
  totalConversas: number; novas: number; abertas: number; resolvidas: number; semResposta: number;
  msgRecebidas: number; msgEnviadas: number; mediaMsgConversa: number;
  primeiraRespostaMin: number | null; taxaResposta: number;
  porCanal: { canal: string; total: number }[]; porHora: number[]; porDiaSemana: number[];
}
export function useAtendimento(f: RelFiltros, enabled: boolean) {
  const { currentOrg } = useOrg(); const org = currentOrg.id; const p = resolvePeriodo(f.preset, f.ini, f.fim);
  return useQuery({
    queryKey: ['rel-atend', org, chaveFiltros(f)], enabled: REL_REAL && enabled, staleTime: 60_000,
    queryFn: async ({ signal }): Promise<AtendimentoData> => {
      let qConv = supabase!.from('conversas').select('id, status, criado_em, ultimo_provider').eq('organizacao_id', org).gte('criado_em', p.iniISO).lt('criado_em', p.fimISO).abortSignal(signal!);
      if (f.canal) qConv = qConv.eq('ultimo_provider', f.canal);
      if (f.status) qConv = qConv.eq('status', f.status);
      const qMsg = supabase!.from('mensagens').select('conversa_id, direcao, tipo, criado_em, enviada_em, recebida_em').eq('organizacao_id', org).gte('criado_em', p.iniISO).lt('criado_em', p.fimISO).abortSignal(signal!);
      const [cv, m] = await Promise.all([qConv, qMsg]);
      if (cv.error) throw new Error(cv.error.message); if (m.error) throw new Error(m.error.message);
      const conv = (cv.data as Row[]) ?? []; const msgs = (m.data as Row[]) ?? [];
      const recebidas = msgs.filter((r) => r.direcao === 'entrada');
      const enviadas = msgs.filter((r) => r.direcao === 'saida' && r.tipo !== 'sistema' && r.tipo !== 'nota_interna');
      const convComSaida = new Set(enviadas.map((r) => r.conversa_id as string));
      const convComEntrada = new Set(recebidas.map((r) => r.conversa_id as string));
      const semResposta = [...convComEntrada].filter((id) => !convComSaida.has(id)).length;
      // primeira resposta por conversa (1ª saída - 1ª entrada)
      const firstIn = new Map<string, number>(); const firstOut = new Map<string, number>();
      for (const r of recebidas) { const id = r.conversa_id as string; const t = ts(r, 'recebida_em', 'criado_em'); if (t && (!firstIn.has(id) || t < firstIn.get(id)!)) firstIn.set(id, t); }
      for (const r of enviadas) { const id = r.conversa_id as string; const t = ts(r, 'enviada_em', 'criado_em'); if (t && (!firstOut.has(id) || t < firstOut.get(id)!)) firstOut.set(id, t); }
      const difs: number[] = [];
      for (const [id, tin] of firstIn) { const out = firstOut.get(id); if (out && out > tin) difs.push((out - tin) / 60000); }
      const primeiraRespostaMin = difs.length ? difs.reduce((a, b) => a + b, 0) / difs.length : null;
      const porHora = Array(24).fill(0) as number[]; const porDiaSemana = Array(7).fill(0) as number[];
      const fmtH = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, hour: '2-digit', hour12: false });
      const fmtD = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' });
      const diaIdx: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
      for (const r of msgs) { const d = new Date(r.criado_em as string); const h = parseInt(fmtH.format(d), 10) % 24; porHora[h] += 1; porDiaSemana[diaIdx[fmtD.format(d)] ?? 0] += 1; }
      const canalMap = new Map<string, number>();
      for (const r of conv) { const k = (r.ultimo_provider as string) || 'outros'; canalMap.set(k, (canalMap.get(k) || 0) + 1); }
      return {
        totalConversas: conv.length, novas: conv.length, abertas: conv.filter((r) => r.status === 'aberta').length,
        resolvidas: conv.filter((r) => r.status === 'resolvida' || r.status === 'fechada').length, semResposta,
        msgRecebidas: recebidas.length, msgEnviadas: enviadas.length,
        mediaMsgConversa: conv.length === 0 ? 0 : msgs.length / conv.length,
        primeiraRespostaMin, taxaResposta: convComEntrada.size === 0 ? 0 : (([...convComEntrada].filter((id) => convComSaida.has(id)).length) / convComEntrada.size) * 100,
        porCanal: [...canalMap.entries()].map(([canal, total]) => ({ canal, total })),
        porHora, porDiaSemana,
      };
    },
  });
}

/* ====================== Equipe (por responsável) ====================== */
export interface LinhaAtendente { id: string; nome: string; leads: number; oppAndamento: number; oppGanho: number; oppPerdido: number; taxaConversao: number; receitaContratada: number; receitaRecebida: number; }
export function useEquipe(f: RelFiltros, enabled: boolean) {
  const { currentOrg } = useOrg(); const org = currentOrg.id; const p = resolvePeriodo(f.preset, f.ini, f.fim);
  return useQuery({
    queryKey: ['rel-equipe', org, chaveFiltros(f)], enabled: REL_REAL && enabled, staleTime: 60_000,
    queryFn: async ({ signal }): Promise<LinhaAtendente[]> => {
      const [us, ct, op, cb] = await Promise.all([
        supabase!.from('organizacao_usuarios').select('usuarios(id, nome)').eq('organizacao_id', org).eq('status', 'ativo').abortSignal(signal!),
        supabase!.from('contatos').select('responsavel_id, criado_em').eq('organizacao_id', org).gte('criado_em', p.iniISO).lt('criado_em', p.fimISO).abortSignal(signal!),
        supabase!.from('oportunidades').select('responsavel_id, status, criado_em').eq('organizacao_id', org).gte('criado_em', p.iniISO).lt('criado_em', p.fimISO).abortSignal(signal!),
        supabase!.from('cobrancas').select('id, responsavel_id, criado_por, valor_mensal, ciclos_totais, status, criado_em').eq('organizacao_id', org).abortSignal(signal!),
      ]);
      for (const r of [us, ct, op, cb]) if (r.error) throw new Error(r.error.message);
      const linhas = new Map<string, LinhaAtendente>();
      for (const r of (us.data as Row[]) ?? []) { const u = one(r.usuarios as Row); if (u) linhas.set(u.id as string, { id: u.id as string, nome: u.nome as string, leads: 0, oppAndamento: 0, oppGanho: 0, oppPerdido: 0, taxaConversao: 0, receitaContratada: 0, receitaRecebida: 0 }); }
      const get = (id: string | null) => (id && linhas.get(id)) || null;
      for (const r of (ct.data as Row[]) ?? []) { const l = get(r.responsavel_id as string); if (l) l.leads += 1; }
      for (const r of (op.data as Row[]) ?? []) { const l = get(r.responsavel_id as string); if (!l) continue; if (r.status === 'em_andamento') l.oppAndamento += 1; else if (r.status === 'ganho') l.oppGanho += 1; else if (r.status === 'perdido') l.oppPerdido += 1; }
      for (const r of (cb.data as Row[]) ?? []) { const l = get((r.responsavel_id as string) || (r.criado_por as string)); if (!l) continue; if (r.status !== 'cancelado') l.receitaContratada += num(r.valor_mensal) * num(r.ciclos_totais); }
      // receita recebida por responsável: via parcelas pagas join cobrança
      const cobIds = ((cb.data as Row[]) ?? []).map((r) => r.id as string);
      if (cobIds.length) {
        const respByCob = new Map<string, string | null>(); for (const r of (cb.data as Row[]) ?? []) respByCob.set(r.id as string, (r.responsavel_id as string) || (r.criado_por as string) || null);
        const { data: pg } = await supabase!.from('cobranca_pagamentos').select('cobranca_id, valor_pago, data_pagamento, status').eq('organizacao_id', org).eq('status', 'paga').gte('data_pagamento', p.iniDate).lt('data_pagamento', p.fimDate).abortSignal(signal!);
        for (const r of (pg as Row[]) ?? []) { const l = get(respByCob.get(r.cobranca_id as string) || null); if (l) l.receitaRecebida += num(r.valor_pago); }
      }
      for (const l of linhas.values()) { const fech = l.oppGanho + l.oppPerdido; l.taxaConversao = fech === 0 ? 0 : (l.oppGanho / fech) * 100; }
      return [...linhas.values()];
    },
  });
}

/* ====================== Financeiro ====================== */
export interface FinanceiroData {
  recebida: number; prevista: number; pendente: number; vencida: number; cancelada: number;
  cobAtivas: number; cobFinalizadas: number; cobCanceladas: number;
  parPrevistas: number; parPagas: number; parNaoPagas: number; parCanceladas: number;
  inadimplencia: number; taxaRecebimento: number; ticketMensal: number;
  previsao6m: { mes: string; previsto: number; recebido: number }[];
  evolucao: { mes: string; recebido: number }[];
  porServico: { nome: string; total: number }[];
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
      const par = (pg.data as Row[]) ?? []; const cob = (cb.data as Row[]) ?? [];
      const hoje = spHoje(); const di = p.iniDate, df = p.fimDate;
      const inRange = (d: unknown) => d && (d as string) >= di && (d as string) < df;
      const recebida = par.filter((r) => r.status === 'paga' && inRange(r.data_pagamento)).reduce((s, r) => s + num(r.valor_pago), 0);
      const prevista = par.filter((r) => r.status !== 'cancelada' && inRange(r.data_prevista)).reduce((s, r) => s + num(r.valor), 0);
      const pendente = par.filter((r) => r.status === 'prevista' && r.data_prevista && (r.data_prevista as string) >= hoje).reduce((s, r) => s + num(r.valor), 0);
      const vencidas = par.filter((r) => r.status !== 'cancelada' && r.status !== 'paga' && r.data_prevista && (r.data_prevista as string) < hoje);
      const vencida = vencidas.reduce((s, r) => s + num(r.valor), 0);
      const cancelada = par.filter((r) => r.status === 'cancelada').reduce((s, r) => s + num(r.valor), 0);
      const vencTotal = par.filter((r) => r.status !== 'cancelada' && r.data_prevista && (r.data_prevista as string) < hoje);
      const vencPagas = vencTotal.filter((r) => r.status === 'paga');
      // previsão 6 meses a partir do mês atual (SP)
      const prev6: { mes: string; previsto: number; recebido: number }[] = [];
      const base = hoje.slice(0, 7);
      for (let i = 0; i < 6; i++) { const [y, mo] = base.split('-').map(Number); const d = new Date(Date.UTC(y, mo - 1 + i, 1)); const k = d.toISOString().slice(0, 7); prev6.push({ mes: k, previsto: par.filter((r) => r.status !== 'cancelada' && (r.data_prevista as string)?.slice(0, 7) === k).reduce((s, r) => s + num(r.valor), 0), recebido: par.filter((r) => r.status === 'paga' && (r.data_pagamento as string)?.slice(0, 7) === k).reduce((s, r) => s + num(r.valor_pago), 0) }); }
      // evolução 6 meses anteriores de recebimento
      const evol: { mes: string; recebido: number }[] = [];
      for (let i = 5; i >= 0; i--) { const [y, mo] = base.split('-').map(Number); const d = new Date(Date.UTC(y, mo - 1 - i, 1)); const k = d.toISOString().slice(0, 7); evol.push({ mes: k, recebido: par.filter((r) => r.status === 'paga' && (r.data_pagamento as string)?.slice(0, 7) === k).reduce((s, r) => s + num(r.valor_pago), 0) }); }
      const servMap = new Map<string, number>();
      for (const r of cob) { if (r.status === 'cancelado') continue; const k = (r.servico as string) || 'Sem serviço'; servMap.set(k, (servMap.get(k) || 0) + num(r.valor_mensal)); }
      const ativas = cob.filter((r) => !['finalizado', 'cancelado'].includes(r.status as string));
      return {
        recebida, prevista, pendente, vencida, cancelada,
        cobAtivas: ativas.length, cobFinalizadas: cob.filter((r) => r.status === 'finalizado').length, cobCanceladas: cob.filter((r) => r.status === 'cancelado').length,
        parPrevistas: par.filter((r) => r.status === 'prevista').length, parPagas: par.filter((r) => r.status === 'paga').length, parNaoPagas: par.filter((r) => r.status === 'nao_paga').length, parCanceladas: par.filter((r) => r.status === 'cancelada').length,
        inadimplencia: vencTotal.length === 0 ? 0 : ((vencTotal.length - vencPagas.length) / vencTotal.length) * 100,
        taxaRecebimento: vencTotal.length === 0 ? 0 : (vencPagas.length / vencTotal.length) * 100,
        ticketMensal: ativas.length === 0 ? 0 : ativas.reduce((s, r) => s + num(r.valor_mensal), 0) / ativas.length,
        previsao6m: prev6, evolucao: evol,
        porServico: [...servMap.entries()].map(([nome, total]) => ({ nome, total })).sort((a, b) => b.total - a.total),
      };
    },
  });
}

/* ====================== Origens ====================== */
export interface LinhaOrigem { origem: string; leads: number; fechados: number; taxaConversao: number; receita: number; }
export function useOrigens(f: RelFiltros, enabled: boolean) {
  const { currentOrg } = useOrg(); const org = currentOrg.id; const p = resolvePeriodo(f.preset, f.ini, f.fim);
  return useQuery({
    queryKey: ['rel-origens', org, chaveFiltros(f)], enabled: REL_REAL && enabled, staleTime: 60_000,
    queryFn: async ({ signal }): Promise<LinhaOrigem[]> => {
      const { data, error } = await supabase!.from('oportunidades').select('origem, fonte_aquisicao, status').eq('organizacao_id', org).gte('criado_em', p.iniISO).lt('criado_em', p.fimISO).abortSignal(signal!);
      if (error) throw new Error(error.message);
      const rows = (data as Row[]) ?? [];
      const map = new Map<string, LinhaOrigem>();
      for (const r of rows) { const k = (r.origem as string) || (r.fonte_aquisicao as string) || 'Não informado'; const cur = map.get(k) || { origem: k, leads: 0, fechados: 0, taxaConversao: 0, receita: 0 }; cur.leads += 1; if (r.status === 'ganho') cur.fechados += 1; map.set(k, cur); }
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
