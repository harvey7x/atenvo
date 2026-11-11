/* ============================================================
   CONFIGURAÇÃO INICIAL OBRIGATÓRIA (Reviza) — camada de dados.
   Três etapas liberam o acesso da equipe: Planilha de clientes,
   WhatsApp da cobrança e Mensalidade da plataforma.

   CONTRATO (o que as telas consomem — o backend liga depois):
   · useConfiguracao()          → EstadoConfiguracao (status + etapas)
   · useConfiguracaoPendente()  → boolean (o shell suprime o LicencaGate)
   · useSessaoConfig()          → papel / isento / erro de quem está logado
   · useConcluirEtapa()         → mutation(etapa) — a Etapa 1 chama no aoConcluir
   · useCoberturaWhatsapp()     → comerciais em cobrança × números
   · useConexaoWhatsapp()       → iniciar(alvo) / consultar(sessão) — QR → conectado
   · useSalvarWhatsapp()        → mutation(EscolhaWhatsapp) — conclui a etapa 2
   · useMensalidadeConfig()     → MensalidadeConfig (fatura em aberto + Pix)
   · useConfirmarPagamento()    → mutation() "Já paguei" — conclui a etapa 3
   · useFinalizarConfiguracao() → mutation() "Entrar no sistema"

   IMPLEMENTAÇÃO HOJE:
   (1) PRÉVIA por querystring — só em DEV (import.meta.env.DEV) ou no modo
       demo: ?config=equipe|admin|admin-planilha-ok|admin-whats-ok|admin-pago|concluida
       (+ &papel=admin|gestor|financeiro|cadastro|comercial, &isento=1,
       &pix=indisponivel|nao-caiu, &wa=erro). Dados de exemplo plausíveis,
       ações simuladas em memória (recarregar a página volta ao cenário).
       NADA vai ao banco, NADA vai ao WhatsApp.
   (2) REAL (modo reviza sem prévia): RPCs do banco (configuracao_estado,
       configuracao_concluir_etapa, configuracao_whatsapp_salvar,
       configuracao_cobertura_whatsapp, licenca_estado) + edge
       reviza-wa-instancia (create/status). Com o master switch desligado
       (configuracao_sistema.gate_ativo=false) o estado vem 'inativo' e o
       gate não renderiza nada — ligar é decisão do dono, depois dos tokens.
   ============================================================ */
import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isDemoMode, isRevizaMode, supabase } from '@/lib/supabase';
import { usePapel } from './sessao';
import type { Papel } from './types';
import {
  apresentarLicenca, COPIA_COLA_EXEMPLO, dataBRT, diasAte, fmtReais, verificarPagamento,
  type LicencaApresentada, type LicencaRpc,
} from './licenca';

/* ------------------------------------------------------------------
   Tipos do contrato
   ------------------------------------------------------------------ */
export type EtapaId = 'planilha' | 'whatsapp' | 'mensalidade';
export const ETAPAS: readonly EtapaId[] = ['planilha', 'whatsapp', 'mensalidade'];

/** 'inativo' = backend da configuração ainda não existe (gate desligado) */
export type StatusConfiguracao = 'inativo' | 'pendente' | 'concluida';
export type ModoWhatsapp = 'por-atendente' | 'unico';

export interface EstadoConfiguracao {
  status: StatusConfiguracao;
  /** etapa concluída? */
  etapas: Record<EtapaId, boolean>;
  whatsapp: { modo: ModoWhatsapp | null; numeroUnicoId: string | null };
  concluidaEm: string | null;
}

export type StatusNumeroCfg = 'conectado' | 'sem-numero' | 'desconectado';
/** comercial com clientes EM COBRANÇA (a régua manda pelo número dele) */
export interface ComercialWhats {
  usuarioId: string;
  nome: string;
  clientes: number;
  status: StatusNumeroCfg;
  /** número já formatado (+55 51 99812-4407) quando conectado */
  numero: string | null;
}
/** número de WhatsApp conectado (ou que já foi) na instância */
export interface NumeroWhats {
  id: string;
  /** "Bruno Teixeira" | "Número da cobrança" */
  nome: string;
  numero: string | null;
  conectado: boolean;
  donoId: string | null;
}
export interface CoberturaWhatsapp { comerciais: ComercialWhats[]; numeros: NumeroWhats[] }

/** a quem o número vai pertencer (usuarioId null = número único da cobrança) */
export interface AlvoConexao { usuarioId: string | null; nome: string }
export interface SessaoConexao { id: string; alvo: AlvoConexao; qrSrc: string | null; iniciadaEm: number }
export type EstadoConexao =
  | { estado: 'aguardando' }
  | { estado: 'conectado'; numero: string; numeroId: string }
  | { estado: 'expirado' };

export interface EscolhaWhatsapp {
  modo: ModoWhatsapp;
  /** modo 'unico': o número que fará todos os envios */
  numeroUnicoId: string | null;
}

export interface MensalidadeConfig {
  /** false = cobrança indisponível (PushinPay fora / Pix não gerado) */
  disponivel: boolean;
  /** pronto para o PixLicenca (QR + copia e cola) */
  lic: LicencaApresentada | null;
  /** 'R$ 100,00' */
  valor: string;
  /** 'outubro/2026' */
  referencia: string | null;
  /** '05/10/2026' */
  vencimento: string | null;
  /** já passou do vencimento (destaque de atraso) */
  vencida: boolean;
  proxima: { valor: string; data: string } | null;
  /** ISO do pagamento confirmado (etapa concluída) */
  pagoEm: string | null;
}

/* ------------------------------------------------------------------
   Chaves react-query
   ------------------------------------------------------------------ */
export const chavesConfig = {
  estado: ['reviza', 'configuracao', 'estado'] as const,
  whats: ['reviza', 'configuracao', 'whatsapp'] as const,
  mensalidade: ['reviza', 'configuracao', 'mensalidade'] as const,
};

/* ------------------------------------------------------------------
   PRÉVIA — leitura da querystring (função PURA, testada)
   ------------------------------------------------------------------ */
export const CENARIOS_PREVIA = ['equipe', 'admin', 'admin-planilha-ok', 'admin-whats-ok', 'admin-pago', 'concluida'] as const;
export type CenarioPrevia = (typeof CENARIOS_PREVIA)[number];
const PAPEIS: readonly Papel[] = ['admin', 'gestor', 'comercial', 'financeiro', 'cadastro'];

export interface PreviaConfig {
  cenario: CenarioPrevia;
  /** ?papel= ou o padrão do cenário (equipe → comercial; demais → admin) */
  papel: Papel;
  isento: boolean;
  pix: 'ok' | 'indisponivel' | 'nao-caiu';
  /** a 1ª tentativa de gerar o QR do WhatsApp falha (mostra o estado de erro) */
  waErro: boolean;
}

/** junta os parâmetros da querystring E do hash (HashRouter: "#/rota?config=…").
    Exportado p/ a prévia da planilha (planilhaSync.ts) ler a URL do MESMO jeito. */
export function parametrosPrevia(qs: string): URLSearchParams {
  const p = new URLSearchParams();
  for (const parte of qs.split(/[?#&]/)) {
    const i = parte.indexOf('=');
    if (i <= 0) continue;
    try { p.set(decodeURIComponent(parte.slice(0, i)), decodeURIComponent(parte.slice(i + 1))); } catch { /* par malformado: ignora */ }
  }
  return p;
}

/** querystring → prévia (null = sem prévia, ou prévia não liberada neste build) */
export function lerPreviaConfig(qs: string, liberada: boolean): PreviaConfig | null {
  if (!liberada) return null;
  const p = parametrosPrevia(qs);
  const c = p.get('config');
  if (!c || !(CENARIOS_PREVIA as readonly string[]).includes(c)) return null;
  const cenario = c as CenarioPrevia;
  const pp = p.get('papel');
  const papel: Papel = pp && (PAPEIS as readonly string[]).includes(pp) ? (pp as Papel) : cenario === 'equipe' ? 'comercial' : 'admin';
  const pix = p.get('pix');
  return {
    cenario,
    papel,
    isento: p.get('isento') === '1',
    pix: pix === 'indisponivel' || pix === 'nao-caiu' ? pix : 'ok',
    waErro: p.get('wa') === 'erro',
  };
}

/** prévia só existe em DEV ou no modo demo — o build de produção da Reviza nunca a liga */
const PREVIA_LIBERADA = import.meta.env.DEV || isDemoMode;
/* URL de quando o app abriu: um <Navigate replace> (ex.: /cobrancas → /cobrancas/painel)
   descarta a querystring — a prévia continua valendo pela URL inicial */
const URL_INICIAL = typeof window === 'undefined' ? '' : window.location.search + window.location.hash;
/** a URL (search + hash) de quando o app abriu — a prévia da planilha usa a mesma
    (este módulo carrega com o shell, ANTES do redirect /cobrancas → /cobrancas/painel) */
export const urlInicialPrevia = (): string => URL_INICIAL;

let previaMemo: { url: string; valor: PreviaConfig | null } | null = null;
function previaAtual(): PreviaConfig | null {
  if (!PREVIA_LIBERADA || typeof window === 'undefined') return null;
  const url = window.location.search + window.location.hash;
  if (previaMemo && previaMemo.url === url) return previaMemo.valor;
  const valor = lerPreviaConfig(url, true) ?? lerPreviaConfig(URL_INICIAL, true);
  previaMemo = { url, valor };
  return valor;
}

/** a prévia ativa (ou null) — estável durante a sessão */
export function usePreviaConfig(): PreviaConfig | null {
  return previaAtual();
}

/* ------------------------------------------------------------------
   Contas de suporte isentas — entram com aviso discreto em vez do
   bloqueio. A VERDADE é a flag profiles.suporte (mig 70) do próprio
   usuário; a lista de nomes fica como FALLBACK para quando a leitura
   falha (ex.: instância ainda sem a migration).
   ------------------------------------------------------------------ */
const SUPORTE = ['matheus', 'teste (verificacao)'];
const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
export function ehContaSuporte(nome: string | null | undefined): boolean {
  return !!nome && SUPORTE.includes(normalizar(nome));
}

/** profiles.suporte do PRÓPRIO usuário (a policy profiles_sel permite a própria linha).
    null = sem leitura (carregando, erro ou coluna ausente) → fallback por nome decide. */
function useSuporteProprio(uid: string | null | undefined): boolean | null {
  const q = useQuery<boolean | null>({
    queryKey: ['reviza', 'configuracao', 'suporte', uid ?? ''],
    enabled: isRevizaMode && !!supabase && !!uid,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase!.from('profiles').select('suporte').eq('id', uid as string).maybeSingle();
      if (error) return null; // coluna nova: sem a mig 70 o select falha — o nome decide
      const s = (data as { suporte?: boolean | null } | null)?.suporte;
      return typeof s === 'boolean' ? s : null;
    },
  });
  return q.data ?? null;
}

/** papel (undefined = carregando; null = sem papel ativo), isento e erro de leitura */
export function useSessaoConfig(): { papel: Papel | null | undefined; isento: boolean; erro: boolean } {
  const previa = usePreviaConfig();
  const q = usePapel();
  const suporte = useSuporteProprio(previa ? null : q.data?.id);
  if (previa) return { papel: previa.papel, isento: previa.isento, erro: false };
  if (q.isError) return { papel: undefined, isento: false, erro: true };
  return { papel: q.isLoading ? undefined : (q.data?.papel ?? null), isento: suporte ?? ehContaSuporte(q.data?.nome), erro: false };
}

/* ------------------------------------------------------------------
   PRÉVIA — dados de exemplo + store em memória
   ------------------------------------------------------------------ */
const espera = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));

/** QR "de mentira" com cara de QR (25×25, 3 marcadores) — só para a prévia */
function qrExemploSvg(semente: number): string {
  const N = 25;
  let s = semente >>> 0;
  const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  const marc = (r: number, c: number) => (r < 8 && c < 8) || (r < 8 && c >= N - 8) || (r >= N - 8 && c < 8);
  let d = '';
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      let escuro: boolean;
      if (marc(r, c)) {
        const rr = r < 8 ? r : r - (N - 7);
        const cc = c < 8 ? c : c - (N - 7);
        const anel = rr >= 0 && rr <= 6 && cc >= 0 && cc <= 6 && (rr === 0 || rr === 6 || cc === 0 || cc === 6);
        const miolo = rr >= 2 && rr <= 4 && cc >= 2 && cc <= 4;
        escuro = anel || miolo;
      } else if (r === 6 || c === 6) {
        escuro = (r + c) % 2 === 0;
      } else {
        escuro = rnd() < 0.48;
      }
      if (escuro) d += `M${c} ${r}h1v1h-1z`;
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-2 -2 ${N + 4} ${N + 4}" shape-rendering="crispEdges">`
    + `<rect x="-2" y="-2" width="${N + 4}" height="${N + 4}" fill="#fff"/><path fill="#111" d="${d}"/></svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

const COMERCIAIS_EXEMPLO: Omit<ComercialWhats, 'status' | 'numero'>[] = [
  { usuarioId: 'u-bruno', nome: 'Bruno Teixeira', clientes: 214 },
  { usuarioId: 'u-ana', nome: 'Ana Paula Ribeiro', clientes: 187 },
  { usuarioId: 'u-carla', nome: 'Carla Menezes', clientes: 156 },
  { usuarioId: 'u-diego', nome: 'Diego Fontana', clientes: 132 },
  { usuarioId: 'u-fernanda', nome: 'Fernanda Lopes', clientes: 113 },
];
const TELEFONES_EXEMPLO = ['+55 51 99812-4407', '+55 51 99637-1182', '+55 51 98455-9031', '+55 51 99204-6618', '+55 51 98127-3345', '+55 51 99780-2254'];

interface StorePrevia {
  estado: EstadoConfiguracao;
  whats: CoberturaWhatsapp;
  mensalidade: MensalidadeConfig;
  tentativasWa: number;
  tentativasPix: number;
  telefones: number;
}
let store: StorePrevia | null = null;

function etapasDoCenario(c: CenarioPrevia): Record<EtapaId, boolean> {
  const ok = (n: number) => ({ planilha: n >= 1, whatsapp: n >= 2, mensalidade: n >= 3 });
  switch (c) {
    case 'admin-planilha-ok': return ok(1);
    case 'admin-whats-ok': return ok(2);
    case 'admin-pago': case 'concluida': return ok(3);
    default: return ok(0);
  }
}

function coberturaDoCenario(whatsOk: boolean): CoberturaWhatsapp {
  // antes: 1 número conectado (Bruno), Ana já teve número (caiu), o resto sem número.
  // depois da etapa: 3 conectados; Diego e Fernanda seguem esperando (confirmado na etapa).
  const st: StatusNumeroCfg[] = whatsOk
    ? ['conectado', 'conectado', 'conectado', 'sem-numero', 'sem-numero']
    : ['conectado', 'desconectado', 'sem-numero', 'sem-numero', 'sem-numero'];
  const comerciais = COMERCIAIS_EXEMPLO.map((c, i) => ({ ...c, status: st[i], numero: st[i] === 'conectado' ? TELEFONES_EXEMPLO[i] : null }));
  const numeros: NumeroWhats[] = comerciais
    .filter((c) => c.status !== 'sem-numero')
    .map((c) => ({ id: `n-${c.usuarioId}`, nome: c.nome, numero: c.numero ?? null, conectado: c.status === 'conectado', donoId: c.usuarioId }));
  return { comerciais, numeros };
}

/** fatura de exemplo (vence dia 5) — mesma apresentação do LicencaGate. A prévia mostra
    SEMPRE o estado de atraso: do dia 1º ao dia 5 a fatura de exemplo é a do mês anterior. */
function mensalidadeExemplo(pix: PreviaConfig['pix'], pago: boolean, agora: Date): MensalidadeConfig {
  let comp = dataBRT(agora).slice(0, 7);
  if (diasAte(`${comp}-05`, agora) >= 0) {
    const a = Number(comp.slice(0, 4)); const m = Number(comp.slice(5, 7));
    comp = m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, '0')}`;
  }
  const lic = apresentarLicenca({
    estado: 'bloqueado',
    comp,
    valor_centavos: 10_000,
    vence_em: `${comp}-05`,
    bloqueia_em: `${comp}-05T14:00:00-03:00`,
    pix_copia_cola: COPIA_COLA_EXEMPLO,
    qr_base64: qrExemploSvg(20261005),
    pago_em: null,
  }, agora);
  const m = apresentarMensalidade(lic, agora, pago ? new Date(agora.getTime() - 35 * 60_000).toISOString() : null);
  return pix === 'indisponivel' && !pago ? { ...m, disponivel: false, lic: null } : m;
}

function storePrevia(p: PreviaConfig): StorePrevia {
  if (store) return store;
  const etapas = etapasDoCenario(p.cenario);
  store = {
    estado: {
      // admin-pago = o instante em que a última etapa acabou de ser concluída
      // (tela "Tudo pronto"); concluida = o sistema já liberado (gate some)
      status: p.cenario === 'concluida' ? 'concluida' : 'pendente',
      etapas,
      whatsapp: { modo: etapas.whatsapp ? 'por-atendente' : null, numeroUnicoId: null },
      concluidaEm: p.cenario === 'concluida' ? new Date().toISOString() : null,
    },
    whats: coberturaDoCenario(etapas.whatsapp),
    mensalidade: mensalidadeExemplo(p.pix, etapas.mensalidade, new Date()),
    tentativasWa: 0,
    tentativasPix: 0,
    telefones: 5, // 0–4 = números dos comerciais do exemplo; conexões novas usam os seguintes
  };
  return store;
}

/** marca a etapa; com as três prontas o sistema libera (real: o banco decide) */
function concluirNoStore(s: StorePrevia, etapa: EtapaId) {
  const etapas = { ...s.estado.etapas, [etapa]: true };
  const todas = ETAPAS.every((e) => etapas[e]);
  s.estado = { ...s.estado, etapas, status: todas ? 'concluida' : s.estado.status, concluidaEm: todas ? new Date().toISOString() : s.estado.concluidaEm };
}

/* ------------------------------------------------------------------
   BACKEND REAL — RPCs (mig 70) + edge reviza-wa-instancia. Enquanto o
   master switch estiver desligado (configuracao_sistema.gate_ativo=false)
   a RPC devolve 'inativo' e o gate não aparece para ninguém.
   ------------------------------------------------------------------ */
const MSG_SEM_BACKEND = 'A configuração inicial ainda não está disponível nesta instância.';

const estadoInativo = (): EstadoConfiguracao => ({
  status: 'inativo', etapas: { planilha: false, whatsapp: false, mensalidade: false }, whatsapp: { modo: null, numeroUnicoId: null }, concluidaEm: null,
});

/** número CRU do banco (dígitos, 55 opcional) → '+55 51 99812-4407'; não formatável → como veio */
export function formatarTelefoneBR(digitos: string): string {
  const bruto = (digitos ?? '').trim();
  let d = bruto.replace(/\D/g, '');
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2);
  if (d.length !== 10 && d.length !== 11) return bruto;
  const corte = d.length - 4;
  return `+55 ${d.slice(0, 2)} ${d.slice(2, corte)}-${d.slice(corte)}`;
}

/** RPC `configuracao_estado()` (security definer) → EstadoConfiguracao (chaves camelCase idênticas).
    Erro de leitura vira erro da query — o gate faz FAIL-OPEN via decidir(): não bloqueia ninguém. */
async function buscarEstadoReal(): Promise<EstadoConfiguracao> {
  if (!isRevizaMode || !supabase) return estadoInativo();
  const { data, error } = await supabase.rpc('configuracao_estado');
  if (error) throw new Error(error.message);
  return data as EstadoConfiguracao;
}
/** RPC `configuracao_concluir_etapa(p_etapa)` — o servidor revalida e carimba a etapa */
async function concluirEtapaReal(etapa: EtapaId): Promise<void> {
  if (!isRevizaMode || !supabase) throw new Error(MSG_SEM_BACKEND);
  const { error } = await supabase.rpc('configuracao_concluir_etapa', { p_etapa: etapa });
  if (error) throw new Error(error.message);
}
/** RPC `configuracao_whatsapp_salvar(p_modo, p_numero_unico_id)` — NÃO liga a régua */
async function salvarWhatsappReal(escolha: EscolhaWhatsapp): Promise<void> {
  if (!isRevizaMode || !supabase) throw new Error(MSG_SEM_BACKEND);
  const { error } = await supabase.rpc('configuracao_whatsapp_salvar', { p_modo: escolha.modo, p_numero_unico_id: escolha.numeroUnicoId });
  if (error) throw new Error(error.message);
}
/** RPC `configuracao_cobertura_whatsapp()` — o número vem CRU (dígitos); formata aqui */
async function coberturaReal(): Promise<CoberturaWhatsapp> {
  if (!isRevizaMode || !supabase) return { comerciais: [], numeros: [] };
  const { data, error } = await supabase.rpc('configuracao_cobertura_whatsapp');
  if (error) throw new Error(error.message);
  const bruta = data as CoberturaWhatsapp;
  return {
    comerciais: (bruta.comerciais ?? []).map((c) => ({ ...c, numero: c.numero ? formatarTelefoneBR(c.numero) : null })),
    numeros: (bruta.numeros ?? []).map((n) => ({ ...n, numero: n.numero ? formatarTelefoneBR(n.numero) : null })),
  };
}
/** edge reviza-wa-instancia no padrão chamarAdmin (usuarios.ts): a mensagem de erro vem no corpo */
async function invocarInstancia(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (!isRevizaMode || !supabase) throw new Error(MSG_SEM_BACKEND);
  const { data, error } = await supabase.functions.invoke('reviza-wa-instancia', { body });
  if (error) {
    let msg = error.message;
    try { const j = await (error as { context?: Response }).context?.json?.(); if (j?.error) msg = j.error; } catch { /* corpo não-JSON: fica a mensagem original */ }
    throw new Error(msg || 'Não foi possível falar com o servidor.');
  }
  const d = (data ?? {}) as Record<string, unknown>;
  if (d.error) throw new Error(String(d.error));
  return d;
}
/** acao 'create': cria (ou reaproveita) o canal e devolve o QR — mesmo fluxo do NumerosReviza */
async function iniciarConexaoReal(alvo: AlvoConexao): Promise<SessaoConexao> {
  const d = await invocarInstancia({ acao: 'create', nome: alvo.usuarioId ? alvo.nome : 'Número da cobrança', dono_id: alvo.usuarioId });
  const id = typeof d.canal_id === 'string' ? d.canal_id : '';
  if (!id) throw new Error('Não foi possível iniciar a conexão. Tente de novo em instantes.');
  const qr = typeof d.qr === 'string' && d.qr ? d.qr : null;
  return { id, alvo, qrSrc: qr ? (qr.startsWith('data:') ? qr : `data:image/png;base64,${qr}`) : null, iniciadaEm: Date.now() };
}
/** acao 'status': conectado → número formatado; >2 min sem conectar → QR expirado */
async function consultarConexaoReal(sessao: SessaoConexao): Promise<EstadoConexao> {
  const d = await invocarInstancia({ acao: 'status', canal_id: sessao.id });
  if (d.estado === 'conectado') {
    const cru = typeof d.numero === 'string' ? d.numero : '';
    return { estado: 'conectado', numero: cru ? formatarTelefoneBR(cru) : '', numeroId: sessao.id };
  }
  if (Date.now() - sessao.iniciadaEm > 120_000) return { estado: 'expirado' };
  return { estado: 'aguardando' };
}

/* ------------------------------------------------------------------
   Leitura do estado
   ------------------------------------------------------------------ */
export function useConfiguracao() {
  const previa = usePreviaConfig();
  return useQuery<EstadoConfiguracao>({
    queryKey: chavesConfig.estado,
    staleTime: previa ? Infinity : 30_000,
    // equipe esperando: re-lê sozinha — o acesso libera sem recarregar a página
    refetchInterval: (q) => (!previa && q.state.data?.status === 'pendente' ? 60_000 : false),
    refetchOnWindowFocus: !previa,
    queryFn: async () => {
      if (previa) return { ...storePrevia(previa).estado };
      if (!isRevizaMode) return estadoInativo(); // Atenvo / demo sem prévia: nunca há configuração
      return buscarEstadoReal();
    },
  });
}

/** configuração pendente? (o shell não monta o LicencaGate enquanto for true — o assistente cobra) */
export function useConfiguracaoPendente(): boolean {
  return useConfiguracao().data?.status === 'pendente';
}

/* ------------------------------------------------------------------
   Ações do assistente
   ------------------------------------------------------------------ */
export function useConcluirEtapa() {
  const previa = usePreviaConfig();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (etapa: EtapaId) => {
      if (previa) { await espera(500); concluirNoStore(storePrevia(previa), etapa); return; }
      await concluirEtapaReal(etapa);
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: chavesConfig.estado }); },
  });
}

export function useFinalizarConfiguracao() {
  const previa = usePreviaConfig();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<EstadoConfiguracao | null> => {
      if (previa) {
        const s = storePrevia(previa);
        s.estado = { ...s.estado, status: 'concluida', concluidaEm: s.estado.concluidaEm ?? new Date().toISOString() };
        return { ...s.estado };
      }
      // real: o banco já liberou ao concluir a 3ª etapa — "Entrar" só fecha a tela
      return null;
    },
    // grava JÁ no cache (antes do mutateAsync resolver): o gate decide 'nada' no mesmo render
    onSuccess: (novo) => { if (novo) qc.setQueryData(chavesConfig.estado, novo); },
  });
}

/* ---------------- WhatsApp ---------------- */
export function useCoberturaWhatsapp() {
  const previa = usePreviaConfig();
  return useQuery<CoberturaWhatsapp>({
    queryKey: chavesConfig.whats,
    staleTime: previa ? Infinity : 15_000,
    queryFn: async () => {
      if (previa) { await espera(350); const w = storePrevia(previa).whats; return { comerciais: [...w.comerciais], numeros: [...w.numeros] }; }
      return coberturaReal();
    },
  });
}

/** conectar um número: gera o QR e acompanha até conectar (prévia: conecta ~5s depois) */
export function useConexaoWhatsapp() {
  const previa = usePreviaConfig();
  const qc = useQueryClient();
  const iniciar = useCallback(async (alvo: AlvoConexao): Promise<SessaoConexao> => {
    if (!previa) return iniciarConexaoReal(alvo);
    const s = storePrevia(previa);
    await espera(900);
    s.tentativasWa += 1;
    if (previa.waErro && s.tentativasWa === 1) throw new Error('Não foi possível gerar o código agora. Tente de novo em instantes.');
    return { id: `sx-${Date.now()}`, alvo, qrSrc: qrExemploSvg(Date.now() % 100_000), iniciadaEm: Date.now() };
  }, [previa]);
  const consultar = useCallback(async (sessao: SessaoConexao): Promise<EstadoConexao> => {
    if (!previa) {
      const r = await consultarConexaoReal(sessao);
      // número novo no ar: a cobertura re-lê (mesmo efeito da prévia abaixo)
      if (r.estado === 'conectado') void qc.invalidateQueries({ queryKey: chavesConfig.whats });
      return r;
    }
    if (Date.now() - sessao.iniciadaEm < 5_000) return { estado: 'aguardando' };
    const s = storePrevia(previa);
    const numero = TELEFONES_EXEMPLO[s.telefones % TELEFONES_EXEMPLO.length];
    s.telefones += 1;
    const numeroId = sessao.alvo.usuarioId ? `n-${sessao.alvo.usuarioId}` : `n-unico-${s.telefones}`;
    const comerciais = s.whats.comerciais.map((c) => (c.usuarioId === sessao.alvo.usuarioId ? { ...c, status: 'conectado' as const, numero } : c));
    const numeros = [
      ...s.whats.numeros.filter((n) => n.id !== numeroId),
      { id: numeroId, nome: sessao.alvo.nome, numero, conectado: true, donoId: sessao.alvo.usuarioId },
    ];
    s.whats = { comerciais, numeros };
    void qc.invalidateQueries({ queryKey: chavesConfig.whats });
    return { estado: 'conectado', numero, numeroId };
  }, [previa, qc]);
  return { iniciar, consultar };
}

export function useSalvarWhatsapp() {
  const previa = usePreviaConfig();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (escolha: EscolhaWhatsapp) => {
      if (previa) {
        await espera(700);
        const s = storePrevia(previa);
        s.estado = { ...s.estado, whatsapp: { modo: escolha.modo, numeroUnicoId: escolha.numeroUnicoId } };
        concluirNoStore(s, 'whatsapp');
        return;
      }
      await salvarWhatsappReal(escolha);
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: chavesConfig.estado }); },
  });
}

/* ---------------- Mensalidade ---------------- */
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const dataBr = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
/** '2026-10-05' → '2026-11-05' (mesmo dia no mês seguinte) */
function mesSeguinte(iso: string): string {
  const a = Number(iso.slice(0, 4)); const m = Number(iso.slice(5, 7));
  const na = m === 12 ? a + 1 : a; const nm = m === 12 ? 1 : m + 1;
  return `${na}-${String(nm).padStart(2, '0')}-${iso.slice(8, 10)}`;
}

/** licença apresentada → o que a etapa Mensalidade mostra (função PURA, testada) */
export function apresentarMensalidade(lic: LicencaApresentada | null, agora: Date, pagoEm: string | null = null): MensalidadeConfig {
  const comp = lic?.comp ?? null;
  const referencia = comp && /^\d{4}-\d{2}$/.test(comp) ? `${MESES[Number(comp.slice(5, 7)) - 1]}/${comp.slice(0, 4)}` : null;
  const venceIso = lic?.venceEm ?? null;
  const centavos = lic?.valorCentavos || 10_000;
  const temPix = !!lic && (!!lic.pixCopiaCola || !!lic.qrSrc);
  return {
    disponivel: !!pagoEm || temPix,
    lic: temPix ? lic : null,
    valor: fmtReais(centavos),
    referencia,
    vencimento: venceIso ? dataBr(venceIso) : null,
    vencida: !!venceIso && diasAte(venceIso, agora) < 0,
    proxima: venceIso ? { valor: fmtReais(centavos), data: dataBr(mesSeguinte(venceIso)) } : null,
    pagoEm,
  };
}

/** forma do licenca_estado() v2 — `proxima_em` chega com a mig 70 (vencimento do mês seguinte) */
type LicencaRpcConfig = LicencaRpc & { proxima_em?: string | null };

export function useMensalidadeConfig() {
  const previa = usePreviaConfig();
  return useQuery<MensalidadeConfig>({
    queryKey: [...chavesConfig.mensalidade, previa ? 'previa' : 'real'],
    staleTime: previa ? Infinity : 30_000,
    // real: mesma cadência do LicencaGate — o Pix pago aparece sem recarregar a página
    refetchInterval: previa ? false : 60_000,
    refetchOnWindowFocus: !previa,
    queryFn: async () => {
      if (previa) { await espera(400); return { ...storePrevia(previa).mensalidade }; }
      const agora = new Date();
      if (!isRevizaMode || !supabase) return apresentarMensalidade(null, agora, null);
      // a MESMA leitura do LicencaGate (licenca_estado), direto: o jsonb cru traz proxima_em
      const { data, error } = await supabase.rpc('licenca_estado');
      if (error) throw new Error(error.message);
      const j = (data ?? null) as LicencaRpcConfig | null;
      const lic = apresentarLicenca(j, agora);
      const m = apresentarMensalidade(lic.estado !== 'ok' ? lic : null, agora, lic.estado === 'ok' ? lic.pagoEm : null);
      if (j?.proxima_em && /^\d{4}-\d{2}-\d{2}$/.test(j.proxima_em)) {
        return { ...m, proxima: { valor: fmtReais(j.valor_centavos ?? 10_000), data: dataBr(j.proxima_em) } };
      }
      return m;
    },
  });
}

/** "Já paguei": re-confere o Pix (real: edge reviza-licenca?acao=verificar, a mesma do LicencaGate) */
export function useConfirmarPagamento() {
  const previa = usePreviaConfig();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<MensalidadeConfig> => {
      if (previa) {
        await espera(1_400);
        const s = storePrevia(previa);
        s.tentativasPix += 1;
        if (previa.pix === 'nao-caiu' && s.tentativasPix === 1) throw new Error('nao-caiu');
        s.mensalidade = { ...s.mensalidade, pagoEm: new Date().toISOString() };
        concluirNoStore(s, 'mensalidade');
        return { ...s.mensalidade };
      }
      const novo = await verificarPagamento();
      if (novo.estado !== 'ok') throw new Error('nao-caiu');
      await concluirEtapaReal('mensalidade');
      return apresentarMensalidade(null, new Date(), novo.pagoEm ?? new Date().toISOString());
    },
    onSuccess: (novo) => {
      // a fatura paga entra no cache na hora ("Pago em …" sem piscar o QR)
      qc.setQueriesData<MensalidadeConfig>({ queryKey: chavesConfig.mensalidade }, (velho) => (velho ? { ...velho, pagoEm: novo.pagoEm } : novo));
      void qc.invalidateQueries({ queryKey: chavesConfig.estado });
    },
  });
}
