import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useOrg } from '@/context/OrgContext';
import { spHoje, type Periodo } from '@/data/relatorios';
import { janelaMapaV5 } from '@/data/dashboardV5.periodo';

/* ------------------------------------------------------------------
   ANÚNCIOS DO FACEBOOK no Atendimento (dono 25/11: "ele falou que tem como conectar o Facebook
   para ele conseguir ver qual campanha tá rodando melhor" — a Reviza usava isso no sistema antigo).
   Duas pontas que se encontram pelo ID do anúncio:
   · o QUE A META COBROU: a conta de anúncios conectada (token do usuário do sistema, guardado só no
     servidor) → gasto, impressões e cliques por anúncio e por dia (função meta-anuncios, tabela
     atd_meta_gasto);
   · QUEM CHEGOU: a conversa que começou pelo botão "Enviar mensagem" do anúncio traz o ID do anúncio
     (o WhatsApp manda junto) → atd_anuncio_origem, gravada pelo webhook na primeira mensagem.
   A RPC dash_anuncios cruza as duas no período do Dashboard: investido, leads, custo por lead,
   fechados e custo por fechado — por campanha, por anúncio e por dia — e o rastreio lead a lead.
   DEMO É O CONTRATO: sem backend o mesmo hook devolve a fixture abaixo, com os mesmos tipos.
   ------------------------------------------------------------------ */

export const ANUNCIOS_REAL: boolean = isSupabaseConfigured && !!supabase;

export interface TotaisAnuncios { investido: number; impressoes: number; cliques: number; leads: number; fechados: number }
export interface CampanhaAnuncio extends TotaisAnuncios { id: string; nome: string; situacao: 'ativa' | 'pausada' | 'encerrada'; anuncios: number }
export interface AnuncioItem extends TotaisAnuncios { id: string; nome: string; campanhaId: string; campanha: string }
export interface DiaAnuncios { dia: string; investido: number; leads: number; fechados: number; cliques: number; porCampanha: Record<string, number> }
export interface LeadAnuncio {
  conversaId: string; contato: string; telefone: string | null; entrouEm: string;
  anuncio: string; campanha: string | null; campanhaId: string | null;
  etapa: string | null; responsavel: string | null; fechado: boolean;
}
export interface DashAnuncios {
  conectado: boolean;
  conta: { id: string; nome: string; moeda: string } | null;
  sincronizadoEm: string | null;
  totais: TotaisAnuncios;
  anterior: TotaisAnuncios | null;
  /** a série dia a dia dos gráficos: o período, ou os últimos 7 dias quando ele é mais curto (Hoje, 3 dias)
   *  — a mesma régua dos cartões da Visão geral; os totais são SEMPRE só do período */
  porDia: DiaAnuncios[];
  campanhas: CampanhaAnuncio[];
  anuncios: AnuncioItem[];
  leads: LeadAnuncio[];
  /** chegaram com o texto do anúncio mas sem o ID (formulário, cópia do texto) — contados à parte */
  semId: number;
  geradoEm: string;
}

/* ---------------- contas derivadas (puras, testadas) ---------------- */
export const custoPor = (investido: number, n: number): number | null => (n > 0 && investido > 0 ? investido / n : null);
export const taxa = (parte: number, todo: number): number | null => (todo > 0 ? parte / todo : null);
/** a campanha que "está rodando melhor": entre as ATIVAS (pausada não está rodando) que trouxeram ao
 *  menos `minimo` leads (custo baixo com 2 leads é sorte, não campanha boa), a de menor custo por lead;
 *  empate → mais fechados */
export function melhorCampanha(cs: CampanhaAnuncio[], minimo = 10): CampanhaAnuncio | null {
  const elegiveis = cs.filter((c) => c.situacao === 'ativa' && c.leads >= minimo && c.investido > 0);
  if (!elegiveis.length) return null;
  return [...elegiveis].sort((a, b) => (custoPor(a.investido, a.leads)! - custoPor(b.investido, b.leads)!) || b.fechados - a.fechados)[0];
}
export const fmtReais = (v: number | null | undefined, casas?: number): string => {
  if (v == null || !Number.isFinite(v)) return '—';
  const c = casas ?? (Math.abs(v) >= 1000 ? 0 : 2);
  return 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c });
};

/* ---------------- normalização defensiva (jsonb → tipos) ---------------- */
type B = Record<string, unknown>;
const o = (v: unknown): B => (v && typeof v === 'object' && !Array.isArray(v) ? (v as B) : {});
const a = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const n = (v: unknown): number => { const x = typeof v === 'number' ? v : Number(v); return Number.isFinite(x) ? x : 0; };
const t = (v: unknown, p = ''): string => (typeof v === 'string' ? v : v == null ? p : String(v));
const totais = (v: unknown): TotaisAnuncios => { const r = o(v); return { investido: n(r.investido), impressoes: n(r.impressoes), cliques: n(r.cliques), leads: n(r.leads), fechados: n(r.fechados) }; };
export function normalizarDashAnuncios(v: unknown): DashAnuncios {
  const r = o(v); const conta = o(r.conta);
  return {
    conectado: !!r.conectado,
    conta: conta.id ? { id: t(conta.id), nome: t(conta.nome, 'Conta de anúncios'), moeda: t(conta.moeda, 'BRL') } : null,
    sincronizadoEm: t(r.sincronizado_em) || null,
    totais: totais(r.totais),
    anterior: r.anterior ? totais(r.anterior) : null,
    porDia: a(r.por_dia).map((x) => { const d = o(x); const pc: Record<string, number> = {}; for (const [k, q] of Object.entries(o(d.por_campanha))) pc[k] = n(q); return { dia: t(d.dia).slice(0, 10), investido: n(d.investido), leads: n(d.leads), fechados: n(d.fechados), cliques: n(d.cliques), porCampanha: pc }; }),
    campanhas: a(r.campanhas).map((x) => { const c = o(x); const s = t(c.situacao); return { ...totais(c), id: t(c.id), nome: t(c.nome, 'Campanha sem nome'), situacao: (s === 'pausada' || s === 'encerrada' ? s : 'ativa') as CampanhaAnuncio['situacao'], anuncios: n(c.anuncios) }; }),
    anuncios: a(r.anuncios).map((x) => { const c = o(x); return { ...totais(c), id: t(c.id), nome: t(c.nome, 'Anúncio sem nome'), campanhaId: t(c.campanha_id), campanha: t(c.campanha) }; }),
    leads: a(r.leads).map((x) => { const l = o(x); return { conversaId: t(l.conversa_id), contato: t(l.contato, 'Sem nome'), telefone: t(l.telefone) || null, entrouEm: t(l.entrou_em), anuncio: t(l.anuncio, 'Anúncio'), campanha: t(l.campanha) || null, campanhaId: t(l.campanha_id) || null, etapa: t(l.etapa) || null, responsavel: t(l.responsavel) || null, fechado: !!l.fechado }; }),
    semId: n(r.sem_id),
    geradoEm: t(r.gerado_em) || new Date().toISOString(),
  };
}

/* ---------------- demonstração (dados inventados, nada de cliente) ---------------- */
const CAMP_DEMO = [
  { id: 'c1', nome: 'Consignado aposentados RS', situacao: 'ativa' as const, peso: 0.38, cpl: 9.4, fech: 0.085, anuncios: ['Vídeo da simulação', 'Foto escritório Porto Alegre', 'Depoimento cliente'] },
  { id: 'c2', nome: 'Revisão de juros Agibank e BMG', situacao: 'ativa' as const, peso: 0.27, cpl: 12.8, fech: 0.11, anuncios: ['Carrossel juros abusivos', 'Vídeo do advogado'] },
  { id: 'c3', nome: 'Portabilidade INSS', situacao: 'ativa' as const, peso: 0.21, cpl: 16.9, fech: 0.05, anuncios: ['Arte parcela menor', 'Vídeo passo a passo'] },
  { id: 'c4', nome: 'Remarketing 30 dias', situacao: 'pausada' as const, peso: 0.14, cpl: 6.2, fech: 0.035, anuncios: ['Lembrete simulação grátis'] },
];
const NOMES_DEMO = ['Iracema S.', 'Valdir M.', 'Neusa T.', 'Arlindo P.', 'Cleonice R.', 'Jurema F.', 'Osvaldo L.', 'Dalva C.', 'Ernesto B.', 'Zilda A.', 'Lourival G.', 'Marlene K.', 'Aparício D.', 'Ivone H.', 'Rubens N.', 'Celina V.'];
const ETAPAS_DEMO = ['Lead novo', 'Atendimento IA', 'Documentação', 'Em negociação', 'Fechado'];
const ATEND_DEMO = ['Alexandra', 'Guilherme', 'Raissa', 'Felipe', 'Emillyn', null];
function rnd(seed: number) { let s = seed; return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; }; }
export function demoDashAnuncios(p: Periodo, conectado: boolean, hoje = spHoje()): DashAnuncios {
  const dias: string[] = [];
  const ini = janelaMapaV5(p, hoje).iniDate; // série com pelo menos 7 dias; os totais só do período
  for (let d = ini; d < p.fimDate && d <= hoje; ) { dias.push(d); const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + 1); d = x.toISOString().slice(0, 10); }
  const noPeriodo = (dia: string) => dia >= p.iniDate;
  const r = rnd(dias.length * 7919 + Number(p.iniDate.replace(/-/g, '')) % 1000);
  const camp = CAMP_DEMO.map((c) => ({ ...c, investido: 0, impressoes: 0, cliques: 0, leads: 0, fechados: 0 }));
  const anunc = CAMP_DEMO.flatMap((c) => c.anuncios.map((nome, i) => ({ id: `${c.id}-a${i}`, nome, campanhaId: c.id, campanha: c.nome, investido: 0, impressoes: 0, cliques: 0, leads: 0, fechados: 0 })));
  const porDia: DiaAnuncios[] = [];
  const leads: LeadAnuncio[] = [];
  dias.forEach((dia, di) => {
    const fimDeSemana = [0, 6].includes(new Date(dia + 'T12:00:00Z').getUTCDay());
    const base = (fimDeSemana ? 850 : 1250) * (0.85 + r() * 0.3);
    const d: DiaAnuncios = { dia, investido: 0, leads: 0, fechados: 0, cliques: 0, porCampanha: {} };
    camp.forEach((c) => {
      if (c.situacao === 'pausada' && di > dias.length / 2) return; // pausada no meio do período
      const inv = base * c.peso; const ld = Math.max(0, Math.round(inv / (c.cpl * (0.8 + r() * 0.4))));
      const fc = Math.round(ld * c.fech * (0.6 + r() * 0.8)); const imp = Math.round(inv * (38 + r() * 12)); const cl = Math.round(imp * (0.018 + r() * 0.01));
      d.investido += inv; d.leads += ld; d.fechados += fc; d.cliques += cl; d.porCampanha[c.id] = ld;
      if (!noPeriodo(dia)) return; // dia só da série (antes do período): não entra nos totais
      c.investido += inv; c.leads += ld; c.fechados += fc; c.impressoes += imp; c.cliques += cl;
      const meus = anunc.filter((x) => x.campanhaId === c.id);
      meus.forEach((x, i) => { const parte = i === 0 ? 0.55 : (0.45 / (meus.length - 1 || 1)); x.investido += inv * parte; x.leads += Math.round(ld * parte); x.fechados += Math.round(fc * parte); x.impressoes += Math.round(imp * parte); x.cliques += Math.round(cl * parte); });
      for (let k = 0; k < Math.min(ld, 3); k++) {
        const etapa = ETAPAS_DEMO[Math.floor(r() * ETAPAS_DEMO.length)];
        leads.push({ conversaId: `demo-${dia}-${c.id}-${k}`, contato: NOMES_DEMO[Math.floor(r() * NOMES_DEMO.length)], telefone: null,
          entrouEm: `${dia}T${String(Math.min(8 + Math.floor(r() * 12), dia === hoje ? Math.max(8, Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hourCycle: 'h23' }).format(new Date())) - 1) : 23)).padStart(2, '0')}:${String(Math.floor(r() * 60)).padStart(2, '0')}:00-03:00`, // hoje: nunca depois de agora
          anuncio: meus[Math.floor(r() * meus.length)].nome, campanha: c.nome, campanhaId: c.id, etapa, responsavel: ATEND_DEMO[Math.floor(r() * ATEND_DEMO.length)], fechado: etapa === 'Fechado' });
      }
    });
    porDia.push(d);
  });
  const soma = (xs: TotaisAnuncios[]): TotaisAnuncios => xs.reduce((s, x) => ({ investido: s.investido + x.investido, impressoes: s.impressoes + x.impressoes, cliques: s.cliques + x.cliques, leads: s.leads + x.leads, fechados: s.fechados + x.fechados }), { investido: 0, impressoes: 0, cliques: 0, leads: 0, fechados: 0 });
  const tot = soma(camp);
  const semConta = (x: TotaisAnuncios) => (conectado ? x : { ...x, investido: 0, impressoes: 0, cliques: 0 });
  leads.sort((x, y) => y.entrouEm.localeCompare(x.entrouEm));
  return {
    conectado,
    conta: conectado ? { id: 'act_000000000000', nome: 'Reviza Assessoria (exemplo)', moeda: 'BRL' } : null,
    sincronizadoEm: conectado ? new Date(Date.now() - 23 * 60_000).toISOString() : null,
    totais: semConta(tot),
    anterior: semConta({ investido: tot.investido * 0.92, impressoes: tot.impressoes * 0.95, cliques: tot.cliques * 0.9, leads: Math.round(tot.leads * 0.86), fechados: Math.round(tot.fechados * 1.08) }),
    porDia: porDia.map((d) => ({ ...d, investido: conectado ? d.investido : 0, cliques: conectado ? d.cliques : 0 })),
    campanhas: camp.map(({ id, nome, situacao, anuncios, ...x }) => ({ id, nome, situacao, anuncios: anuncios.length, ...semConta({ investido: x.investido, impressoes: x.impressoes, cliques: x.cliques, leads: x.leads, fechados: x.fechados }) })).sort((x, y) => y.leads - x.leads),
    anuncios: anunc.map((x) => ({ ...x, ...semConta(x) })).sort((x, y) => y.leads - x.leads),
    leads: leads.slice(0, 120),
    semId: Math.round(tot.leads * 0.06),
    geradoEm: new Date().toISOString(),
  };
}

/* ---------------- conta de anúncios (Integrações) ---------------- */
export interface ContaAnuncios { conectada: boolean; contaId: string | null; nome: string | null; moeda: string | null; sincronizadoEm: string | null; erro: string | null; conectadoPor: string | null }
const CONTA_VAZIA: ContaAnuncios = { conectada: false, contaId: null, nome: null, moeda: null, sincronizadoEm: null, erro: null, conectadoPor: null };
const GUARDA_DEMO = 'previa-anuncios-conta';
function contaDemo(): ContaAnuncios { try { return { ...CONTA_VAZIA, ...(JSON.parse(localStorage.getItem(GUARDA_DEMO) ?? 'null') ?? {}) }; } catch { return CONTA_VAZIA; } }
function guardarDemo(c: ContaAnuncios | null) { try { if (c) localStorage.setItem(GUARDA_DEMO, JSON.stringify(c)); else localStorage.removeItem(GUARDA_DEMO); } catch { /* privado */ } }
export const CONTAS_DEMO = [
  { id: 'act_000000000000', nome: 'Reviza Assessoria (exemplo)', moeda: 'BRL' },
  { id: 'act_111111111111', nome: 'Reviza — campanhas antigas (exemplo)', moeda: 'BRL' },
];

const MSG: Record<string, string> = {
  token_invalido: 'A Meta não aceitou este código de acesso. Gere um novo no Gerenciador de Negócios e cole de novo.',
  sem_permissao_ads: 'Este código não tem a permissão de ler anúncios (ads_read). Gere o código marcando "ads_read".',
  sem_contas: 'Este código não enxerga nenhuma conta de anúncios. Dê acesso à conta para o usuário do sistema.',
  conta_nao_encontrada: 'Essa conta de anúncios não apareceu para este código.',
  so_admin: 'Só o administrador conecta a conta de anúncios.',
};
const traduz = (e: unknown) => { const m = (e as Error)?.message || String(e); return MSG[m] ?? (m || 'Não foi possível falar com a Meta agora.'); };
async function chamar(corpo: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { data, error } = await supabase!.functions.invoke('meta-anuncios', { body: corpo });
  if (error) { let cod = ''; try { cod = (await (error as { context?: Response }).context?.json())?.erro ?? ''; } catch { /* corpo vazio */ } throw new Error(cod || error.message); }
  const r = o(data); if (r.erro) throw new Error(t(r.erro));
  return r;
}

export function useContaAnuncios() {
  const { currentOrg } = useOrg();
  return useQuery({
    queryKey: ['anuncios-conta', currentOrg.id],
    queryFn: async (): Promise<ContaAnuncios> => {
      if (!ANUNCIOS_REAL) return contaDemo();
      const r = await chamar({ acao: 'estado' });
      return { conectada: !!r.conectada, contaId: t(r.conta_id) || null, nome: t(r.nome) || null, moeda: t(r.moeda) || null, sincronizadoEm: t(r.sincronizado_em) || null, erro: t(r.erro_sync) || null, conectadoPor: t(r.conectado_por) || null };
    },
  });
}
/** passo 1: o código de acesso → as contas de anúncios que ele enxerga (nada é gravado ainda) */
export function useBuscarContasAnuncios() {
  return useMutation({
    mutationFn: async (token: string): Promise<{ sessao: string; contas: { id: string; nome: string; moeda: string }[] }> => {
      if (!ANUNCIOS_REAL) {
        await new Promise((ok) => setTimeout(ok, 700));
        if (token.trim().length < 20) throw new Error(MSG.token_invalido);
        return { sessao: 'demo', contas: CONTAS_DEMO };
      }
      const r = await chamar({ acao: 'buscar_contas', token: token.trim() }).catch((e) => { throw new Error(traduz(e)); });
      return { sessao: t(r.sessao), contas: a(r.contas).map((x) => ({ id: t(o(x).id), nome: t(o(x).nome), moeda: t(o(x).moeda, 'BRL') })) };
    },
  });
}
export function useConectarAnuncios() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { sessao: string; contaId: string }) => {
      if (!ANUNCIOS_REAL) {
        await new Promise((ok) => setTimeout(ok, 900));
        const c = CONTAS_DEMO.find((x) => x.id === v.contaId);
        guardarDemo({ conectada: true, contaId: v.contaId, nome: c?.nome ?? null, moeda: c?.moeda ?? 'BRL', sincronizadoEm: new Date().toISOString(), erro: null, conectadoPor: 'Você' });
        return;
      }
      await chamar({ acao: 'conectar', sessao: v.sessao, conta_id: v.contaId }).catch((e) => { throw new Error(traduz(e)); });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['anuncios-conta'] }); qc.invalidateQueries({ queryKey: ['dash-anuncios'] }); },
  });
}
export function useSincronizarAnuncios() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!ANUNCIOS_REAL) { await new Promise((ok) => setTimeout(ok, 1100)); const c = contaDemo(); guardarDemo({ ...c, sincronizadoEm: new Date().toISOString() }); return; }
      await chamar({ acao: 'sincronizar' }).catch((e) => { throw new Error(traduz(e)); });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['anuncios-conta'] }); qc.invalidateQueries({ queryKey: ['dash-anuncios'] }); },
  });
}
export function useDesconectarAnuncios() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!ANUNCIOS_REAL) { guardarDemo(null); return; }
      await chamar({ acao: 'desconectar' }).catch((e) => { throw new Error(traduz(e)); });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['anuncios-conta'] }); qc.invalidateQueries({ queryKey: ['dash-anuncios'] }); },
  });
}

/* ---------------- a aba do Dashboard ---------------- */
export function useDashAnuncios(p: Periodo, ativo: boolean) {
  const { currentOrg } = useOrg();
  const conta = useContaAnuncios();
  return useQuery({
    queryKey: ['dash-anuncios', currentOrg.id, p.iniDate, p.fimDate, ANUNCIOS_REAL ? '' : String(!!conta.data?.conectada)],
    enabled: ativo && (ANUNCIOS_REAL || conta.isSuccess),
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<DashAnuncios> => {
      if (!ANUNCIOS_REAL) { await new Promise((ok) => setTimeout(ok, 350)); return demoDashAnuncios(p, !!conta.data?.conectada); }
      const { data, error } = await supabase!.rpc('dash_anuncios', { p_ini: p.iniDate, p_fim: p.fimDate, p_prev_ini: p.prevIniDate, p_serie_ini: janelaMapaV5(p, spHoje()).iniDate });
      if (error) throw new Error(error.message);
      return normalizarDashAnuncios(data);
    },
  });
}
