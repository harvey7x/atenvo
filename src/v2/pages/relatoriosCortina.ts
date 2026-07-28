/* Gatilho da CORTINA de Relatórios (v2.2) — mesma família de travas da
   IntroEntrada (src/v2/shell/intro.ts), mas com escopo próprio: a cortina
   é EXCLUSIVA da página de Relatórios (página-palco; Adendo nº 5) e tem
   cooldown POR USUÁRIO E POR PÁGINA, independente do cooldown da intro.

   Semântica:
   - Roda na CHEGADA à página quando a última exibição saiu da janela
     CORTINA_RELATORIOS_HORAS; o timestamp é registrado na decisão
     positiva (inclusive quando prefers-reduced-motion pula a exibição).
   - Re-navegação dentro da janela NÃO roda (o cooldown segura a rajada).
   - Replay de dev: flag de sessão consumida na próxima montagem. */

export const CORTINA_RELATORIOS_HORAS = 4;

const chaveTs = (usuarioId: string) => `v2-cortina-relatorios-ts:${usuarioId}`;
const CHAVE_REPLAY = 'v2-cortina-replay';

/** true quando a última exibição já saiu da janela de cooldown. */
export function passouCooldownCortina(ultimaExibicao: number, agora: number): boolean {
  return agora - ultimaExibicao > CORTINA_RELATORIOS_HORAS * 3_600_000;
}

/** Decide se ESTA montagem da página mostra a cortina e registra o
 *  timestamp quando positiva. Replay de dev ignora o cooldown. */
let cacheDecisao: { t: number; valor: boolean } | null = null;

export function decidirCortina(usuarioId: string): boolean {
  // double-invoke do StrictMode: a 2ª chamada imediata reusa a decisão
  if (cacheDecisao && Date.now() - cacheDecisao.t < 1500) return cacheDecisao.valor;
  let replay = false;
  try {
    replay = sessionStorage.getItem(CHAVE_REPLAY) === '1';
    if (replay) sessionStorage.removeItem(CHAVE_REPLAY);
  } catch { /* segue */ }

  let roda = replay;
  if (!roda) {
    let ultima = 0;
    try { ultima = Number(localStorage.getItem(chaveTs(usuarioId)) || 0); } catch { /* segue */ }
    roda = passouCooldownCortina(ultima, Date.now());
  }
  if (roda) {
    try { localStorage.setItem(chaveTs(usuarioId), String(Date.now())); } catch { /* segue */ }
  }
  cacheDecisao = { t: Date.now(), valor: roda };
  return roda;
}

/** Dev: pede replay da cortina — na próxima montagem de /v2/relatorios
 *  (flag de sessão) e imediatamente se a página já estiver aberta (evento). */
export const EVENTO_REPLAY_CORTINA = 'v2-cortina-replay';
export function pedirReplayCortina() {
  try { sessionStorage.setItem(CHAVE_REPLAY, '1'); } catch { /* segue */ }
  try { window.dispatchEvent(new CustomEvent(EVENTO_REPLAY_CORTINA)); } catch { /* segue */ }
}
/** Consome o pedido de replay pendente (montagem tardia). */
export function consumirReplayPendente(): boolean {
  try {
    if (sessionStorage.getItem(CHAVE_REPLAY) === '1') { sessionStorage.removeItem(CHAVE_REPLAY); return true; }
  } catch { /* segue */ }
  return false;
}
