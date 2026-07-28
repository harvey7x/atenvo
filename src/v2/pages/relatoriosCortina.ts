/* Gatilho da CORTINA de Relatórios (v2.2, revisão "cortina sempre"):
   roda em TODA abertura de /v2/relatorios — navegação SPA, refresh,
   sempre (decisão do dono; o cooldown foi removido). A cortina segue
   EXCLUSIVA desta página (Adendo nº 5).

   Travas que ficam são da própria exibição (no componente/página):
   clique/tecla pulam, prefers-reduced-motion pula direto, mascaramento
   de carga com timeout, heróis nunca placeholder, nunca ao sair do
   Modo Apresentação (a decisão é por montagem da página). Aqui fica
   apenas o guard anti-StrictMode: o double-invoke do mesmo mount reusa
   a decisão em vez de decidir duas vezes. */

let cacheDecisao: { t: number; valor: boolean } | null = null;

export function decidirCortina(): boolean {
  if (cacheDecisao && Date.now() - cacheDecisao.t < 1500) return cacheDecisao.valor;
  cacheDecisao = { t: Date.now(), valor: true };
  return true;
}
