/* ============================================================
   Sala SDR — Bonecos em PIXEL ART (pedido do dono)
   ------------------------------------------------------------
   Sprite 16×24 desenhado num <canvas> (paramétrico: pele/cabelo/
   terno/calça/sapato/óculos do Look), exportado como PNG data-URI e
   CACHEADO por combinação. Renderiza como <image image-rendering:
   pixelated> — 1 elemento por boneco (leve) e nítido no zoom em
   escala inteira (3×). Fica na sala atual (vetor); uma sombra de
   contato "assenta" o sprite no piso.
   ============================================================ */
import type { Look } from './boneco';

const cache = new Map<string, string>();

function shade(hex: string, f: number): string {
  const m = hex.replace('#', '');
  if (m.length !== 6) return hex;
  const c = (i: number) => Math.max(0, Math.min(255, Math.round(parseInt(m.slice(i, i + 2), 16) * f)));
  const h = (n: number) => n.toString(16).padStart(2, '0');
  return `#${h(c(0))}${h(c(2))}${h(c(4))}`;
}

/** Desenha o sprite 16×24 no contexto. sentado = pernas dobradas. */
function desenhar(x: CanvasRenderingContext2D, o: Look, sentado: boolean): void {
  const P = (px: number, py: number, pw: number, ph: number, col: string) => { x.fillStyle = col; x.fillRect(px, py, pw, ph); };
  const skin = o.skin, skinD = shade(skin, 0.86), hair = o.hair, hairD = shade(hair, 0.8);
  const top = o.top, topD = shade(top, 0.8), topL = shade(top, 1.12);
  const pants = o.pants, pantsD = shade(pants, 0.85), shoes = o.shoes, shirt = o.top2 || '#eef1f5';
  const fem = o.estilo === 'bob' || o.estilo === 'preso' || o.estilo === 'longo' || o.estilo === 'ondulado';
  const longo = o.estilo === 'longo' || o.estilo === 'bob';
  // cabelo (topo + laterais; mais comprido p/ estilos femininos/longos)
  P(5, 1, 6, 1, hair); P(4, 2, 8, 1, hair); P(4, 3, 8, 1, hairD);
  const ladoH = o.estilo === 'calvo' ? 1 : longo ? 7 : fem ? 5 : 2;
  P(4, 4, 1, ladoH, hair); P(11, 4, 1, ladoH, hairD);
  // cabeça
  P(5, 4, 6, 5, skin); P(10, 4, 1, 5, skinD); P(6, 9, 4, 1, skin);
  P(5, 4, 6, 1, hair); // franja
  // olhos / óculos
  if (o.oculos) { P(5, 6, 3, 1, '#2b2b33'); P(8, 6, 3, 1, '#2b2b33'); P(6, 6, 1, 1, '#dfe7ef'); P(9, 6, 1, 1, '#dfe7ef'); }
  else { P(6, 6, 1, 1, '#20242e'); P(9, 6, 1, 1, '#20242e'); }
  if (o.barba) P(5, 8, 6, 1, hairD); else P(7, 8, 2, 1, skinD); // barba ou boca
  if (o.bigode) P(6, 7, 4, 1, hairD);
  P(7, 10, 2, 1, skinD); // pescoço
  // tronco (blazer) + camisa/gravata + lapelas
  P(4, 11, 8, 6, top); P(9, 11, 3, 6, topD);
  P(7, 11, 2, 3, shirt); if (o.cracha) P(7, 12, 1, 3, '#7a2b34');
  P(4, 11, 1, 2, topL); P(11, 11, 1, 2, topD);
  // braços + mãos
  P(3, 12, 1, 5, top); P(12, 12, 1, 5, topD); P(3, 17, 1, 1, skin); P(12, 17, 1, 1, skinD);
  // headset (aro sobre a cabeça)
  if (o.headset) { P(4, 3, 1, 3, '#242b3a'); P(11, 3, 1, 3, '#242b3a'); P(4, 2, 8, 1, '#242b3a'); }
  // pernas / saia + pés
  if (o.saia && fem) {
    P(4, 17, 8, 2, o.saia || '#4a3f5a'); P(8, 17, 4, 2, shade(o.saia || '#4a3f5a', 0.85));
    if (!sentado) { P(5, 19, 2, 3, skinD); P(9, 19, 2, 3, shade(skin, 0.8)); P(5, 22, 3, 2, shoes); P(9, 22, 3, 2, shade(shoes, 0.85)); }
    else { P(5, 19, 6, 2, skinD); P(5, 21, 3, 2, shoes); P(8, 21, 3, 2, shade(shoes, 0.85)); }
  } else if (!sentado) {
    P(5, 17, 2, 5, pants); P(9, 17, 2, 5, pantsD); P(5, 22, 3, 2, shoes); P(9, 22, 3, 2, shade(shoes, 0.85));
  } else {
    // sentado: coxa (horizontal) + canela curta
    P(4, 17, 8, 2, pants); P(8, 17, 4, 2, pantsD);
    P(5, 19, 2, 3, pants); P(9, 19, 2, 3, pantsD);
    P(5, 22, 3, 2, shoes); P(9, 22, 3, 2, shade(shoes, 0.85));
  }
}

function sprite(look: Look, sentado: boolean): string {
  const key = [look.skin, look.hair, look.top, look.top2 || '', look.pants, look.shoes, look.estilo, look.oculos ? 'g' : '', look.barba ? 'b' : '', look.bigode ? 'm' : '', look.headset ? 'h' : '', look.saia ? 'k' : '', look.cracha ? 'c' : '', sentado ? 's' : 'p'].join('|');
  const hit = cache.get(key); if (hit) return hit;
  const c = document.createElement('canvas'); c.width = 16; c.height = 24;
  const x = c.getContext('2d'); if (!x) return '';
  x.imageSmoothingEnabled = false;
  desenhar(x, look, sentado);
  const uri = c.toDataURL('image/png'); cache.set(key, uri); return uri;
}

/** Boneco pixel como <image> (16×24 → 48×72, pés em y=0). Mantém sombra de contato. */
export function bonecoPixelSVG(look: Look, pose = 'pe'): string {
  const uri = sprite(look, pose === 'sentado');
  return `<ellipse cx="0" cy="0" rx="13" ry="4" fill="rgba(0,0,0,.26)"/>` +
    `<image href="${uri}" x="-24" y="-72" width="48" height="72" preserveAspectRatio="none" style="image-rendering:pixelated"/>`;
}

/** Bot da recepção em pixel (robô com a tinta de triagem). */
export function botPixelSVG(): string {
  const key = '__bot__';
  let uri = cache.get(key);
  if (!uri) {
    const c = document.createElement('canvas'); c.width = 16; c.height = 24;
    const x = c.getContext('2d'); if (!x) return '';
    x.imageSmoothingEnabled = false;
    const P = (px: number, py: number, pw: number, ph: number, col: string) => { x.fillStyle = col; x.fillRect(px, py, pw, ph); };
    const body = '#2b3550', bodyD = '#232c44', metal = '#8f99a8';
    P(5, 3, 6, 5, metal); P(10, 3, 1, 5, '#6f7887'); // cabeça
    P(5, 5, 6, 1, '#7fe3c8'); // visor (será recolorido via CSS? aqui fixo verde-água)
    P(6, 2, 4, 1, metal); P(7, 1, 2, 1, metal); // antena
    P(4, 9, 8, 8, body); P(9, 9, 3, 8, bodyD); // tronco
    P(7, 11, 2, 3, '#7fe3c8'); // painel peito
    P(3, 10, 1, 6, body); P(12, 10, 1, 6, bodyD); // braços
    P(5, 17, 2, 5, bodyD); P(9, 17, 2, 5, '#1b2233'); // pernas
    P(5, 22, 3, 2, '#161b2a'); P(9, 22, 3, 2, '#121624');
    uri = c.toDataURL('image/png'); cache.set(key, uri);
  }
  return `<ellipse cx="0" cy="0" rx="13" ry="4" fill="rgba(0,0,0,.3)"/>` +
    `<image href="${uri}" x="-24" y="-72" width="48" height="72" preserveAspectRatio="none" style="image-rendering:pixelated"/>`;
}
