/* Degradê de rolagem do tamanho do que FALTA rolar: perto do fim (só sobra o padding)
   o degradê some em vez de apagar a última bolha inteira. Escreve --spl-ft/--spl-fb
   (px) no elemento; o CSS usa nas máscaras de .spl-sombra-cima/.spl-sombra-baixo.
   `folgaBase` = padding de baixo do contêiner: o degradê só cobre CONTEÚDO de verdade
   escondido — no fim real da rolagem a última linha nunca fica meio apagada. */
export function bordasRolagem(el: HTMLElement, maxTopo: number, maxBase: number, folga = 8, folgaBase = folga): { cima: boolean; baixo: boolean } {
  const resto = el.scrollHeight - el.clientHeight - el.scrollTop;
  const ft = Math.max(0, Math.min(maxTopo, el.scrollTop - folga));
  const fb = Math.max(0, Math.min(maxBase, resto - folgaBase));
  el.style.setProperty('--spl-ft', `${Math.round(ft)}px`);
  el.style.setProperty('--spl-fb', `${Math.round(fb)}px`);
  return { cima: ft > 0, baixo: fb > 0 };
}
