/* Gatilho da intro de entrada ("o sistema acorda") — Ajuste da Ordem de
   Design nº 1: a intro marca a CHEGADA ao sistema, não a autenticação.

   Semântica exata:
   1. SEMPRE no sucesso do signIn (marcarIntroEntrada), independente de
      cooldown — logar é sempre uma chegada.
   2. TAMBÉM em todo boot do app autenticado (carregamento completo da página
      com sessão válida), governado por cooldown: só roda se a última exibição
      foi há mais de INTRO_COOLDOWN_HORAS, com timestamp em localStorage POR
      USUÁRIO (contas diferentes no mesmo navegador não dividem cooldown).
   3. NUNCA em navegação interna do SPA: a decisão é calculada uma única vez
      por carregamento de página (cache de módulo) — troca de rota e
      remontagens do shell (inclusive o double-mount do StrictMode) reusam a
      decisão.
   4. O cooldown é o que impede a rajada: F5 no meio do trabalho e uma segunda
      aba minutos depois caem dentro da janela e NÃO repetem a intro.

   O timestamp é registrado no momento da DECISÃO positiva — inclusive quando
   prefers-reduced-motion pula a exibição — para manter a lógica uniforme. */

/** Janela mínima entre exibições por chegada (horas). Única constante do
 *  cooldown — ajuste aqui, não espalhe números. */
export const INTRO_COOLDOWN_HORAS = 4;

const CHAVE_LOGIN = 'v2-intro-pendente';
const chaveTs = (usuarioId: string) => `v2-intro-ts:${usuarioId}`;

let pendentePorLogin = false;
let decisao: boolean | null = null; // por carregamento de página

/** true quando a última exibição já saiu da janela de cooldown. */
export function passouCooldown(ultimaExibicao: number, agora: number): boolean {
  return agora - ultimaExibicao > INTRO_COOLDOWN_HORAS * 3_600_000;
}

/** Chamada no SUCESSO do signIn — chegada por login, sem cooldown. */
export function marcarIntroEntrada() {
  pendentePorLogin = true;
  decisao = null; // novo evento de chegada: a próxima montagem do shell re-decide
  try { sessionStorage.setItem(CHAVE_LOGIN, '1'); } catch { /* segue */ }
}

/** Decide (uma vez por carregamento de página) se esta chegada mostra a
 *  intro, e registra o timestamp quando a decisão é positiva. */
export function decidirIntroNaChegada(usuarioId: string): boolean {
  if (decisao !== null) return decisao;

  let porLogin = pendentePorLogin;
  if (!porLogin) {
    try { porLogin = sessionStorage.getItem(CHAVE_LOGIN) === '1'; } catch { /* segue */ }
  }
  pendentePorLogin = false;
  try { sessionStorage.removeItem(CHAVE_LOGIN); } catch { /* segue */ }

  if (porLogin) {
    decisao = true;
  } else {
    // chegada por boot: respeita o cooldown por usuário
    let ultima = 0;
    try { ultima = Number(localStorage.getItem(chaveTs(usuarioId)) || 0); } catch { /* segue */ }
    decisao = passouCooldown(ultima, Date.now());
  }

  if (decisao) {
    try { localStorage.setItem(chaveTs(usuarioId), String(Date.now())); } catch { /* segue */ }
  }
  return decisao;
}
