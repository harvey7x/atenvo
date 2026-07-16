// Lógica PURA do monitoramento automático de entrega (slot/jitter + pausa por restrição).
// Sem I/O → testável isoladamente (src/data/entregaAgenda.test.ts).

/** 60/12 = 5 testes por hora por canal. */
export const SLOTS = 12;
/** Pausa (min) ao detectar restrição. */
export const PAUSA_MIN = 60;
/** Sem ACK após N min ⇒ timeout. */
export const TIMEOUT_MIN = 5;

/**
 * Slot determinístico do canal (0..n-1) a partir do uuid. Espalha os canais pelos minutos
 * (jitter estável) para não haver rajada: o canal envia quando `minuto % n === slot`.
 */
export function slotDoCanal(canalId: string, n: number = SLOTS): number {
  let h = 0;
  for (let i = 0; i < canalId.length; i++) h = (Math.imul(h, 31) + canalId.charCodeAt(i)) >>> 0;
  return h % n;
}

/** É a vez deste canal neste minuto? */
export function estaNaVez(canalId: string, minutoDaHora: number, n: number = SLOTS): boolean {
  return ((minutoDaHora % n) + n) % n === slotDoCanal(canalId, n);
}

export interface RunResumo {
  /** 'entregue' | 'lida' (sucesso) | 'ERROR' | 'timeout' | 'aguardando_ack' | ... */
  status_resultado: string | null;
  executado_em: string;
}

const ENTREGUE = (s: string | null) => s === 'entregue' || s === 'lida';
const ERRO = (s: string | null) => s === 'ERROR';

/**
 * Pausa automática por restrição, calculada do HISTÓRICO (sem coluna nova; expira sozinha):
 *  - 3 ERROR seguidos, OU
 *  - 0 entregas nos últimos 5 testes (com 5 testes já concluídos).
 * Retorna o ISO até quando pausar, ou null. `runs` deve vir do mais recente p/ o mais antigo.
 * NUNCA mexe em envio_restrito nem bloqueia atendimento manual — só suspende o TESTE.
 */
export function pausaAte(runs: RunResumo[], agoraMs: number, pausaMin: number = PAUSA_MIN): string | null {
  const concluidos = runs.filter((r) => r.status_resultado !== 'aguardando_ack');
  if (concluidos.length === 0) return null;

  const tresErrosSeguidos = concluidos.length >= 3 && concluidos.slice(0, 3).every((r) => ERRO(r.status_resultado));
  const cincoSemEntrega = concluidos.length >= 5 && !concluidos.slice(0, 5).some((r) => ENTREGUE(r.status_resultado));
  if (!tresErrosSeguidos && !cincoSemEntrega) return null;

  const fim = new Date(concluidos[0].executado_em).getTime() + pausaMin * 60_000;
  return fim > agoraMs ? new Date(fim).toISOString() : null;   // pausa expirada → volta a testar
}
