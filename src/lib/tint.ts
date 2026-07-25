/* Receita de tint do Atenvo Obsidian (ATENVO-DESIGN.md §7, Badges):
 * fundo = cor a 10%, borda = cor a 22%, texto = versão CLARA e DESSATURADA da cor.
 *
 * Por que existe: etiquetas, colunas do funil e status guardam hex SATURADO no banco
 * (#e11d48, #3b82f6…). O design system proíbe cor viva chapada — e não vamos migrar
 * dados. Esta função resolve em runtime: qualquer hex vira um trio {bg, border, text}
 * legível sobre superfícies escuras, sem tocar no valor salvo.
 *
 * Pura e determinística de propósito: é testada em vitest e usada em style={{}} nos
 * pontos onde a cor é dinâmica (única exceção permitida ao "proibido hex em componente",
 * porque o hex vem de DADOS, não do código). */

/** #rgb ou #rrggbb -> [r,g,b] 0..255. Inválido -> null (chamador decide o fallback). */
export function hexParaRgb(hex: string): [number, number, number] | null {
  const m = (hex ?? '').trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbParaHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h * 360, s, l];
}

function hslParaRgb(h: number, s: number, l: number): [number, number, number] {
  h = ((h % 360) + 360) % 360 / 360;
  if (s === 0) { const v = Math.round(l * 255); return [v, v, v]; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t: number) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [Math.round(f(h + 1 / 3) * 255), Math.round(f(h) * 255), Math.round(f(h - 1 / 3) * 255)];
}

export interface Tint { bg: string; border: string; text: string }

/** Tint dessaturado para fundo escuro. Mantém o MATIZ da cor salva (a pessoa escolheu
 *  "rosa", ela continua vendo rosa), mas derruba a saturação e clareia o texto para
 *  passar de 4.5:1 sobre --surface-1. Hex inválido cai num cinza neutro dos tokens. */
export function tintDeHex(hex: string): Tint {
  const rgb = hexParaRgb(hex);
  if (!rgb) {
    return {
      bg: 'rgba(255, 255, 255, 0.06)',
      border: 'rgba(255, 255, 255, 0.14)',
      text: 'var(--text-secondary)',
    };
  }
  const [h, s] = rgbParaHsl(rgb[0], rgb[1], rgb[2]);
  const sat = Math.min(s, 0.55);                       // teto de saturação: nada "vivo chapado"
  const [br, bgc, bb] = hslParaRgb(h, sat, 0.55);      // base do fundo/borda
  const [tr, tg, tb] = hslParaRgb(h, Math.min(sat, 0.45), 0.72); // texto claro p/ contraste
  return {
    bg: `rgba(${br}, ${bgc}, ${bb}, 0.10)`,
    border: `rgba(${br}, ${bgc}, ${bb}, 0.25)`,
    text: `rgb(${tr}, ${tg}, ${tb})`,
  };
}
