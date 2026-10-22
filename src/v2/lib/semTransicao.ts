/* Troca GLOBAL de aparência (tema, acento) sem animar a passagem.
   Com a camada de movimento (movimento.css) os controles catalogados ganharam
   transição de cor — numa troca de tema centenas delas disparavam juntas (256 no
   inbox) enquanto o resto trocava seco: por 60–120ms o chip selecionado sumia
   (branco no branco), bordas e caixas de seleção piscavam. Aqui o estilo novo é
   calculado na hora e toda transição CSS que a troca criou é levada ao fim.
   Animações por keyframe e transições que nascem depois (o polegar do segmentado
   da intro, que segue o React) continuam normais. */
export function semTransicao(aplicar: () => void): void {
  aplicar();
  if (typeof document === 'undefined' || typeof document.getAnimations !== 'function') return;
  if (typeof CSSTransition === 'undefined') return;
  void document.body?.offsetWidth; // força o recálculo: as transições da troca passam a existir
  for (const a of document.getAnimations()) {
    if (a instanceof CSSTransition) a.finish();
  }
}
