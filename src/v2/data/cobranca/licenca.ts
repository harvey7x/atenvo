/* Mensalidade da plataforma (Reviza) — leitura do estado da licença.
   O escritório paga R$ 100/mês (custo de infraestrutura) por Pix via PushinPay.
   A VERDADE é a RPC `licenca_estado()` (security definer): sem licença ativa ou
   sem fatura aberta do mês → "ok" (FAIL-OPEN: o sistema nunca bloqueia por falha
   nossa). Fatura aberta: "aviso" até o dia do vencimento às 14h BRT; de lá em
   diante, "bloqueado" até o Pix cair. O front só APRESENTA — e promove aviso→
   bloqueado pelo relógio local entre um refetch e outro (nunca o contrário).
   Recurso da PLATAFORMA, não do produto: só roda no modo reviza (sem demo). */
import { useQuery } from '@tanstack/react-query';
import { isRevizaMode, supabase } from '@/lib/supabase';

/** chave de cache react-query do estado da licença */
export const chaveLicenca = ['reviza', 'licenca'] as const;

export type EstadoLicenca = 'ok' | 'aviso' | 'bloqueado';

/** forma do jsonb devolvido pela RPC licenca_estado() (e pela edge ?acao=verificar) */
export interface LicencaRpc {
  estado: EstadoLicenca;
  comp?: string | null;             // '2026-10'
  valor_centavos?: number | null;
  vence_em?: string | null;         // 'AAAA-MM-DD' (dia do vencimento)
  bloqueia_em?: string | null;      // timestamptz do vencimento às 14h BRT
  pix_copia_cola?: string | null;
  qr_base64?: string | null;
  pago_em?: string | null;
}

/** modelo de apresentação (o que a tela consome — tudo já resolvido/formatado) */
export interface LicencaApresentada {
  estado: EstadoLicenca;
  comp: string | null;
  valorCentavos: number;
  /** 'R$ 100,00' */
  valor: string;
  venceEm: string | null;
  /** 'vence dia 5 às 14h' (texto fixo da faixa) */
  rotuloVencimento: string | null;
  /** contagem regressiva: 'vence em N dias' | 'vence amanhã' | 'bloqueia hoje às 14h' */
  rotuloPrazo: string | null;
  pixCopiaCola: string | null;
  /** src pronto para <img> (data URI) ou null */
  qrSrc: string | null;
  pagoEm: string | null;
}

const TZ_BR = 'America/Sao_Paulo';

/** data-calendário 'AAAA-MM-DD' de um instante, em Brasília (en-CA = formato ISO) */
export function dataBRT(instante: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ_BR, year: 'numeric', month: '2-digit', day: '2-digit' }).format(instante);
}

/** hora cheia (0–23) de um instante, em Brasília */
function horaBRT(instante: Date): number {
  const h = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ_BR, hour: 'numeric', hour12: false }).format(instante);
  return Number.parseInt(h, 10) || 0;
}

/** dias de calendário (em Brasília) entre hoje e a data 'AAAA-MM-DD' (negativo = já passou) */
export function diasAte(dataIso: string, agora: Date): number {
  const [a1, m1, d1] = dataBRT(agora).split('-').map(Number);
  const [a2, m2, d2] = dataIso.split('-').map(Number);
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86_400_000);
}

/** 10000 → 'R$ 100,00' */
export const fmtReais = (centavos: number): string =>
  'R$ ' + (centavos / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** src de <img> a partir do qr_base64 da PushinPay (vem com ou sem o prefixo data:) */
export function qrSrc(qr: string | null | undefined): string | null {
  const v = (qr ?? '').trim();
  if (!v) return null;
  return v.startsWith('data:') ? v : `data:image/png;base64,${v}`;
}

/* ------------------------------------------------------------------
   Função PURA que decide a apresentação a partir do jsonb + relógio —
   é ela que o licenca.test.ts exercita. Regras:
   · sem payload / estado desconhecido / 'ok' → ok (FAIL-OPEN);
   · 'bloqueado' → bloqueado;
   · 'aviso' com o relógio local já ≥ bloqueia_em → bloqueado (a RPC só
     é re-lida a cada 60s; o relógio promove no meio do caminho);
   · FAIL-SAFE (espelha o licenca_estado v2 da mig 70): fatura SEM Pix
     (copia-e-cola E QR nulos) nunca vira 'bloqueado' — ninguém é
     trancado sem ter como pagar (ex.: a fatura semeada antes do token).
   ------------------------------------------------------------------ */
export function apresentarLicenca(j: LicencaRpc | null | undefined, agora: Date): LicencaApresentada {
  const vazio: LicencaApresentada = {
    estado: 'ok', comp: null, valorCentavos: 0, valor: '', venceEm: null,
    rotuloVencimento: null, rotuloPrazo: null, pixCopiaCola: null, qrSrc: null, pagoEm: null,
  };
  if (!j || !j.estado || j.estado === 'ok') return { ...vazio, pagoEm: j?.pago_em ?? null };
  if (j.estado !== 'aviso' && j.estado !== 'bloqueado') return vazio; // estado desconhecido = fail-open

  const bloqueia = j.bloqueia_em ? new Date(j.bloqueia_em) : null;
  const bloqueiaValida = bloqueia != null && !Number.isNaN(bloqueia.getTime());
  // FAIL-SAFE: sem Pix não existe bloqueio (nem promovido pelo relógio, nem vindo
  // do servidor) — bloquear sem ter como pagar trancaria o escritório para sempre
  const temComoPagar = !!(j.pix_copia_cola || j.qr_base64);
  const estado: EstadoLicenca =
    temComoPagar && (j.estado === 'bloqueado' || (bloqueiaValida && agora.getTime() >= (bloqueia as Date).getTime()))
      ? 'bloqueado' : 'aviso';

  const hora = bloqueiaValida ? horaBRT(bloqueia as Date) : 14;
  const venceEm = j.vence_em ?? null;
  const diaVenc = venceEm ? Number.parseInt(venceEm.slice(8, 10), 10) : null;
  const rotuloVencimento = diaVenc ? `vence dia ${diaVenc} às ${hora}h` : null;

  let rotuloPrazo: string | null = null;
  if (estado === 'aviso' && venceEm) {
    const dias = diasAte(venceEm, agora);
    rotuloPrazo = dias > 1 ? `vence em ${dias} dias` : dias === 1 ? 'vence amanhã' : `bloqueia hoje às ${hora}h`;
  }

  return {
    estado,
    comp: j.comp ?? null,
    valorCentavos: j.valor_centavos ?? 0,
    valor: fmtReais(j.valor_centavos ?? 0),
    venceEm,
    rotuloVencimento,
    rotuloPrazo,
    pixCopiaCola: j.pix_copia_cola ?? null,
    qrSrc: qrSrc(j.qr_base64),
    pagoEm: j.pago_em ?? null,
  };
}

/* ------------------------------------------------------------------
   DEV-only: ?licenca=aviso|bloqueado força o estado com dados de
   exemplo para ver as telas sem mexer no banco. Em build de produção
   import.meta.env.DEV é false e este caminho inteiro é código morto.
   ------------------------------------------------------------------ */
/** exemplo de copia-e-cola (prévias DEV/demo — também usado pela configuração inicial) */
export const COPIA_COLA_EXEMPLO =
  '00020126420014BR.GOV.BCB.PIX0120exemplo@pushinpay.dev5204000053039865406100.005802BR5907EXEMPLO6009SAO PAULO62070503***6304ABCD';
const QR_EXEMPLO_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><rect width="8" height="8" fill="#fff"/>' +
  '<path fill="#111" d="M0 0h3v3H0zM5 0h3v3H5zM0 5h3v3H0zM4 0h1v2H4zM4 3h2v1H4zM7 3h1v1H7zM3 4h1v1H3zM5 5h1v1H5zM4 6h1v2H4zM6 6h2v2H6z"/></svg>';

export function licencaForcadaDev(): LicencaRpc | null {
  if (!import.meta.env.DEV) return null;
  let modo: string | null = null;
  try { modo = new URLSearchParams(window.location.search).get('licenca'); } catch { return null; }
  if (modo !== 'aviso' && modo !== 'bloqueado') return null;
  const agora = new Date();
  const comp = dataBRT(agora).slice(0, 7);
  return {
    estado: modo,
    comp,
    valor_centavos: 10_000,
    vence_em: `${comp}-05`,
    bloqueia_em: new Date(agora.getTime() + (modo === 'aviso' ? 72 : -1) * 3_600_000).toISOString(),
    pix_copia_cola: COPIA_COLA_EXEMPLO,
    qr_base64: 'data:image/svg+xml;utf8,' + encodeURIComponent(QR_EXEMPLO_SVG),
    pago_em: null,
  };
}

/** DEV: há estado forjado na querystring? (libera a prévia fora do modo reviza) */
export const licencaDevAtiva = (): boolean => licencaForcadaDev() != null;

/* ------------------------------------------------------------------
   Hook de leitura — re-lê a cada 60s e ao focar a janela; 'ok' faz a
   tela não renderizar NADA. Erro de RPC = fail-open (nunca bloqueia).
   ------------------------------------------------------------------ */
export function useLicenca() {
  return useQuery<LicencaApresentada>({
    queryKey: chaveLicenca,
    enabled: (isRevizaMode && !!supabase) || licencaDevAtiva(),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const forjado = licencaForcadaDev();
      if (forjado) return apresentarLicenca(forjado, new Date());
      if (!isRevizaMode || !supabase) return apresentarLicenca(null, new Date()); // só reviza consulta o banco
      const { data, error } = await supabase.rpc('licenca_estado');
      if (error) return apresentarLicenca(null, new Date()); // FAIL-OPEN: falha nossa nunca tranca o escritório
      return apresentarLicenca(data as LicencaRpc, new Date());
    },
  });
}

/* ------------------------------------------------------------------
   "Já paguei" — chama a edge reviza-licenca?acao=verificar (mesmo
   padrão do chamarAdmin de usuarios.ts: functions.invoke leva o JWT
   da sessão). A edge re-consulta a PushinPay e devolve o estado novo
   na mesma forma da RPC.
   ------------------------------------------------------------------ */
export async function verificarPagamento(): Promise<LicencaApresentada> {
  const forjado = licencaForcadaDev();
  if (forjado) return apresentarLicenca(forjado, new Date()); // prévia DEV: nada a verificar
  if (!supabase) throw new Error('Sem conexão com o servidor.');
  const { data, error } = await supabase.functions.invoke('reviza-licenca?acao=verificar', { body: {} });
  if (error) {
    let msg = error.message;
    try {
      const j = await (error as { context?: Response }).context?.json?.();
      const m = j?.error ?? j?.erro; // a reviza-licenca responde { erro } (padrão das edges da Reviza)
      if (m) msg = String(m);
    } catch { /* corpo não-JSON: fica a mensagem original */ }
    throw new Error(msg || 'Não foi possível verificar o pagamento.');
  }
  const errCorpo = (data as { error?: string } | null)?.error;
  if (errCorpo) throw new Error(errCorpo);
  return apresentarLicenca(data as LicencaRpc, new Date());
}
