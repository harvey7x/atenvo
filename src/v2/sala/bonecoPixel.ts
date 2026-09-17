/* ============================================================
   Sala SDR — Bonecos em PIXEL ART (pedido do dono) · v2 detalhado
   ------------------------------------------------------------
   Sprite 24×32 desenhado num <canvas> (paramétrico: pele/cabelo/
   terno/óculos do Look; gravata azul p/ elas, vermelha p/ eles;
   maleta em pé; pernas dobradas sentado), exportado como PNG e
   CACHEADO por combinação. Renderiza como <image image-rendering:
   pixelated> — 1 elemento por boneco (leve) e nítido no zoom.
   Cenário vetorial mantido; sombra de contato assenta no piso.
   ============================================================ */
import type { Look } from './boneco';

const cache = new Map<string, string>();

function sh(hex: string, f: number): string {
  const m = hex.replace('#', '');
  if (m.length !== 6) return hex;
  const c = (i: number) => Math.max(0, Math.min(255, Math.round(parseInt(m.slice(i, i + 2), 16) * f)));
  const h = (n: number) => n.toString(16).padStart(2, '0');
  return `#${h(c(0))}${h(c(2))}${h(c(4))}`;
}

function desenhar(x: CanvasRenderingContext2D, o: Look, sentado: boolean): void {
  const R = (px: number, py: number, pw: number, ph: number, c: string) => { x.fillStyle = c; x.fillRect(px, py, pw, ph); };
  const fem = o.estilo === 'bob' || o.estilo === 'preso' || o.estilo === 'longo' || o.estilo === 'ondulado';
  const skin = o.skin, skinS = sh(skin, 0.88), skinD = sh(skin, 0.8);
  const hair = o.hair, hairS = sh(hair, 0.76), hairH = sh(hair, 1.24);
  const suit = o.top, suitS = sh(o.top, 0.72), suitH = sh(o.top, 1.2);
  const shirt = '#eef2f6', shirtS = '#c7d0da';
  const tie = fem ? '#3d6fb0' : '#b23b3b';
  const pants = o.pants, pantsS = sh(o.pants, 0.8);
  const shoes = o.shoes, shoesS = sh(o.shoes, 0.75);
  const bag = '#7d5836', bagD = '#5c3f24', bagH = '#946b45';
  // ---- CABELO ----
  if (fem) {
    R(6, 5, 12, 6, hair); R(6, 10, 1, 5, hair); R(17, 10, 1, 5, hairS); // moldura + laterais
    R(10, 2, 4, 3, hair); R(9, 3, 6, 1, hair); R(11, 1, 2, 1, hair); R(11, 2, 2, 1, hairH); // coque
  } else if (o.estilo === 'calvo') {
    R(7, 6, 1, 3, hair); R(16, 6, 1, 3, hairS); R(8, 5, 8, 1, hairS);
  } else {
    R(8, 3, 8, 4, hair); R(9, 2, 6, 1, hair); R(10, 1, 4, 1, hair);
    R(7, 6, 1, 4, hair); R(16, 6, 1, 4, hairS); R(10, 2, 4, 1, hairH); R(9, 4, 3, 1, hairH);
  }
  // ---- CABEÇA ----
  R(8, 6, 8, 9, skin); R(15, 7, 1, 7, skinS);
  R(7, 10, 1, 2, skin); R(16, 10, 1, 2, skinS); // orelhas
  if (o.estilo !== 'calvo') R(8, 6, 8, 1, hair); // franja
  R(9, 9, 2, 1, hairS); R(13, 9, 2, 1, hairS); // sobrancelhas
  R(10, 10, 1, 2, '#2a2730'); R(13, 10, 1, 2, '#2a2730'); // olhos
  if (o.oculos) { R(9, 10, 2, 1, '#2b2b33'); R(13, 10, 2, 1, '#2b2b33'); R(11, 10, 1, 1, '#2b2b33'); }
  if (o.barba) R(8, 13, 8, 1, hairS); // barba no queixo
  R(9, 12, 1, 1, sh(skin, 0.94)); R(14, 12, 1, 1, skinD); R(11, 13, 2, 1, skinD); // bochecha/boca
  if (o.bigode) R(10, 12, 4, 1, hairS);
  R(10, 15, 4, 1, skinS); // pescoço
  // ---- TERNO ----
  R(6, 16, 12, 10, suit); R(12, 16, 6, 10, suitS);
  R(10, 15, 4, 2, shirt); R(9, 17, 2, 2, shirt); R(13, 17, 2, 2, shirt); // gola V
  R(9, 16, 1, 4, suitH); R(14, 16, 1, 4, suitS); // lapelas
  R(11, 17, 2, 2, tie); R(11, 19, 1, 4, tie); R(12, 19, 1, 4, sh(tie, 0.8)); R(11, 23, 2, 1, sh(tie, 0.75)); // gravata
  R(11, 22, 1, 1, suitS); R(11, 24, 1, 1, suitS); // botões
  if (o.cracha) R(8, 18, 1, 2, '#e6c34a'); // crachá
  // ---- BRAÇOS + MÃOS ----
  R(5, 16, 1, 8, suit); R(18, 16, 1, 8, suitS); R(4, 20, 1, 4, suit); R(19, 20, 1, 4, suitS);
  R(4, 24, 2, 1, skin); R(18, 24, 2, 1, skinS); R(4, 23, 2, 1, shirtS); R(18, 23, 2, 1, shirtS);
  // headset
  if (o.headset) { R(6, 5, 1, 4, '#242b3a'); R(17, 5, 1, 4, '#242b3a'); R(7, 4, 10, 1, '#242b3a'); }
  if (sentado) {
    // pernas dobradas (sem maleta)
    R(7, 26, 10, 2, fem && o.saia ? o.saia : pants); R(12, 26, 5, 2, sh(fem && o.saia ? o.saia : pants, 0.82));
    R(8, 28, 3, 3, pants); R(13, 28, 3, 3, pantsS);
    R(7, 31, 4, 1, shoes); R(13, 31, 4, 1, shoesS);
  } else {
    // maleta na mão direita
    R(19, 25, 5, 4, bag); R(19, 25, 5, 1, bagH); R(19, 28, 5, 1, bagD); R(20, 24, 3, 1, '#3a2a1a'); R(21, 26, 1, 2, bagD);
    if (fem) {
      R(7, 26, 10, 3, o.saia || suit); R(12, 26, 5, 3, sh(o.saia || suit, 0.8)); // saia
      R(9, 29, 2, 2, skinS); R(13, 29, 2, 2, skinD); R(9, 31, 3, 1, shoes); R(13, 31, 3, 1, shoesS);
    } else {
      R(8, 26, 3, 5, pants); R(13, 26, 3, 5, pantsS); R(8, 26, 8, 1, sh(pants, 0.9));
      R(7, 30, 4, 2, shoes); R(13, 30, 4, 2, shoesS);
    }
  }
}

function sprite(look: Look, sentado: boolean): string {
  const key = [look.skin, look.hair, look.top, look.pants, look.shoes, look.estilo, look.oculos ? 'g' : '', look.barba ? 'b' : '', look.bigode ? 'm' : '', look.headset ? 'h' : '', look.saia || '', look.cracha ? 'c' : '', sentado ? 's' : 'p'].join('|');
  const hit = cache.get(key); if (hit) return hit;
  const c = document.createElement('canvas'); c.width = 24; c.height = 32;
  const x = c.getContext('2d'); if (!x) return '';
  x.imageSmoothingEnabled = false;
  desenhar(x, look, sentado);
  const uri = c.toDataURL('image/png'); cache.set(key, uri); return uri;
}

/** Boneco pixel como <image> (24×32 → 60×80, pés em y=0) + sombra de contato. */
export function bonecoPixelSVG(look: Look, pose = 'pe'): string {
  const uri = sprite(look, pose === 'sentado');
  return `<ellipse cx="0" cy="0" rx="14" ry="4.2" fill="rgba(0,0,0,.26)"/>` +
    `<image href="${uri}" x="-30" y="-80" width="60" height="80" preserveAspectRatio="none" style="image-rendering:pixelated"/>`;
}

/** Bot da recepção em pixel (robô com a tinta de triagem). 24×32. */
export function botPixelSVG(): string {
  const key = '__bot24__';
  let uri = cache.get(key);
  if (!uri) {
    const c = document.createElement('canvas'); c.width = 24; c.height = 32;
    const x = c.getContext('2d'); if (!x) return '';
    x.imageSmoothingEnabled = false;
    const R = (px: number, py: number, pw: number, ph: number, col: string) => { x.fillStyle = col; x.fillRect(px, py, pw, ph); };
    const body = '#2b3550', bodyD = '#232c44', metal = '#9aa4b4', metalD = '#727c8c', viz = '#7fe3c8';
    R(9, 1, 2, 2, metalD); R(9, 0, 2, 1, viz); // antena
    R(7, 4, 10, 8, metal); R(14, 5, 3, 7, metalD); // cabeça
    R(8, 7, 8, 2, '#0c1018'); R(8, 7, 8, 1, viz); R(9, 8, 5, 1, viz); // visor
    R(11, 12, 2, 1, metalD); // pescoço
    R(6, 13, 12, 12, body); R(12, 13, 6, 12, bodyD);
    R(9, 16, 6, 4, '#0c1018'); R(10, 17, 4, 2, viz); // painel peito
    R(4, 14, 2, 9, body); R(18, 14, 2, 9, bodyD); R(4, 23, 2, 2, metalD); R(18, 23, 2, 2, metalD); // braços
    R(8, 25, 3, 6, bodyD); R(13, 25, 3, 6, '#1b2233'); // pernas
    R(7, 30, 4, 2, '#141a28'); R(13, 30, 4, 2, '#10151f');
    uri = c.toDataURL('image/png'); cache.set(key, uri);
  }
  return `<ellipse cx="0" cy="0" rx="14" ry="4.5" fill="rgba(0,0,0,.3)"/>` +
    `<image href="${uri}" x="-30" y="-80" width="60" height="80" preserveAspectRatio="none" style="image-rendering:pixelated"/>`;
}
