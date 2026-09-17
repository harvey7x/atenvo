/* ============================================================
   Sala SDR — Bonecos (clientes) e o bot Matheo
   ------------------------------------------------------------
   Figura ADULTA (proporção ~7 cabeças): cabeça pequena (r5),
   pescoço curto, ombros de blazer com V-taper, pernas longas,
   luz vindo da esquerda. Rosto sóbrio/minimalista. As sombras da
   cena usam GRADIENTE (não filtro), então a cena fica fluida.
   ============================================================ */

export interface Look {
  skin: string;
  hair: string;
  estilo: string;
  longo?: boolean;
  top: string;
  top2?: string | null;
  pants: string;
  shoes: string;
  saia?: string | null;
  meia?: string;
  bolsa?: boolean;
  cardigan?: boolean;
  bigode?: boolean;
  oculos?: boolean;
  barba?: boolean;
  bengala?: boolean;
  headset?: boolean;
  cracha?: string;
}

/* Escurece um hex (face em sombra do blazer, sobrancelha etc.). */
function darken(hex: string, f = 0.72): string {
  const m = hex.replace('#', '');
  if (m.length !== 6) return hex;
  const c = (i: number) => Math.max(0, Math.min(255, Math.round(parseInt(m.slice(i, i + 2), 16) * f)));
  const h = (n: number) => n.toString(16).padStart(2, '0');
  return `#${h(c(0))}${h(c(2))}${h(c(4))}`;
}

/* Cabelo ancorado na cabeça pequena (centro (0,-71.5), r5). */
function cabelo(estilo: string, H: string): string {
  const capa = `<path d="M -5 -70.6 Q -5.5 -77.7 0 -78 Q 5.5 -77.7 5 -70.6 Q 4.6 -74 3.4 -74.7 Q 1.8 -75.4 0 -75.4 Q -1.8 -75.4 -3.4 -74.7 Q -4.6 -74 -5 -70.6 Z" fill="${H}"/><path d="M 0 -78 Q 5.5 -77.7 5 -70.6 Q 4.6 -74 3.4 -74.7 Q 1.8 -75.4 0 -75.4 Z" fill="#000" opacity=".1"/><path d="M 0 -78 Q -5.5 -77.7 -5 -70.6 Q -4.6 -74 -3.4 -74.7 Q -1.8 -75.4 0 -75.4 Z" fill="#fff" opacity=".07"/>`;
  const bobL = `<path d="M -5 -71.6 Q -6 -66.4 -4.9 -64.8 L -3.5 -65.8 Q -4.4 -68.5 -4.4 -71.4 Z" fill="${H}"/>`;
  const bobR = `<path d="M 5 -71.6 Q 6 -66.4 4.9 -64.8 L 3.5 -65.8 Q 4.4 -68.5 4.4 -71.4 Z" fill="${H}"/>`;
  const longL = `<path d="M -5 -72 Q -6.7 -63 -5.3 -57.5 L -3.4 -58 Q -4.3 -64 -4.1 -71 Z" fill="${H}"/>`;
  const longR = `<path d="M 5 -72 Q 6.7 -63 5.3 -57.5 L 3.4 -58 Q 4.3 -64 4.1 -71 Z" fill="${H}"/>`;
  switch (estilo) {
    case 'calvo': return `<path d="M -5 -70.6 Q -5.2 -73.6 -4.2 -75.1 L -3.8 -72.7 Q -4.6 -71.7 -4.6 -70.6 Z" fill="${H}"/><path d="M 5 -70.6 Q 5.2 -73.6 4.2 -75.1 L 3.8 -72.7 Q 4.6 -71.7 4.6 -70.6 Z" fill="${H}"/>`;
    case 'bob': return capa + bobL + bobR;
    case 'longo': return longL + longR + capa;
    case 'preso': return capa + `<ellipse cx="0" cy="-78.6" rx="2.1" ry="1.7" fill="${H}"/>`;
    case 'ondulado': return `<path d="M -5.2 -71 Q -6 -78 0 -78.4 Q 6 -78 5.2 -71 Q 4.4 -74.4 3.2 -74.9 Q 1.6 -75.6 0 -75.6 Q -1.6 -75.6 -3.2 -74.9 Q -4.4 -74.4 -5.2 -71 Z" fill="${H}"/>`;
    case 'lado': return capa + `<path d="M -1 -77.4 Q -3.2 -74.5 -4.6 -71.6" stroke="${darken(H, 0.8)}" stroke-width=".45" fill="none" opacity=".55" stroke-linecap="round"/>`;
    default: return capa; // curto
  }
}

export function bonecoSVG(k: Look, pose = 'pe', opts: { telefone?: boolean } = {}): string {
  const sentado = pose === 'sentado';
  const TOP = k.top, TOPS = darken(k.top, 0.72), SKIN = k.skin, PANTS = k.pants, HAIR = k.hair, SHOES = k.shoes;
  const grisalho = ['#d8d8d8', '#bfbfbf', '#9a9a9a', '#e6e6e6'].includes(k.hair);
  const sobr = grisalho ? '#9a9a9a' : darken(k.hair, 0.85);
  const gola = k.top2 || '#eef1f5';
  const meia = k.meia || '#2a2f3e';
  const shoes = `<path d="M -2 -4 L -6.2 -4 Q -8.6 -4 -8.6 -1.6 Q -8.6 0.2 -6.2 0.2 L -3.4 0.2 Q -2 0.2 -2 -1.7 Z" fill="${SHOES}"/><path d="M 2 -4 L 6.2 -4 Q 8.6 -4 8.6 -1.6 Q 8.6 0.2 6.2 0.2 L 3.4 0.2 Q 2 0.2 2 -1.7 Z" fill="${SHOES}"/><path d="M 2 -4 L 6.2 -4 Q 8.6 -4 8.6 -1.6 Q 8.6 0.2 6.2 0.2 L 3.4 0.2 Q 2 0.2 2 -1.7 Z" fill="#000" opacity=".12"/>`;

  let s = `<ellipse cx="0" cy="0" rx="10.5" ry="2.6" fill="#000" opacity=".13"/>`;

  // ---- PERNAS ----
  if (!sentado) {
    if (k.saia) s += `<g class="pernas"><g><path d="M -5 -18 L -2.2 -18 L -2.8 -4 L -5.6 -4 Z" fill="${meia}"/></g><g><path d="M 5 -18 L 2.2 -18 L 2.8 -4 L 5.6 -4 Z" fill="${meia}"/><path d="M 5 -18 L 2.2 -18 L 2.8 -4 L 5.6 -4 Z" fill="#000" opacity=".12"/></g></g><path d="M -8.6 -31 L 8.6 -31 L 11.6 -16.5 L -11.6 -16.5 Z" fill="${k.saia}"/><path d="M 0 -31 L 8.6 -31 L 11.6 -16.5 L 0 -16.5 Z" fill="#000" opacity=".1"/>`;
    else s += `<g class="pernas"><g><path d="M -9 -31 L -6.3 -4 L -2.4 -4 L -1 -30 Z" fill="${PANTS}"/></g><g><path d="M 9 -31 L 6.3 -4 L 2.4 -4 L 1 -30 Z" fill="${PANTS}"/><path d="M 9 -31 L 6.3 -4 L 2.4 -4 L 1 -30 Z" fill="#000" opacity=".1"/></g></g>`;
    s += shoes;
  } else {
    const coxaFill = k.saia ? k.saia : PANTS;
    s += `<path d="M -8.5 -16 L 8.5 -16 L 7.6 -11 L -7.6 -11 Z" fill="${coxaFill}"/><path d="M 0 -16 L 8.5 -16 L 7.6 -11 L 0 -11 Z" fill="#000" opacity=".1"/>`;
    s += `<path d="M -6.8 -11 L -3 -11 L -3.4 -4 L -6.4 -4 Z" fill="${k.saia ? meia : PANTS}"/><path d="M 6.8 -11 L 3 -11 L 3.4 -4 L 6.4 -4 Z" fill="${k.saia ? meia : PANTS}"/><path d="M 6.8 -11 L 3 -11 L 3.4 -4 L 6.4 -4 Z" fill="#000" opacity=".1"/>`;
    s += shoes;
  }

  // ---- TRONCO + CABEÇA (bloco superior; sentado desce 15px) ----
  s += `<g transform="translate(0,${sentado ? 15 : 0})">`;
  s += `<path d="M -2.4 -66.5 L 2.4 -66.5 L 2.6 -61 Q 0 -60 -2.6 -61 Z" fill="${SKIN}"/><ellipse cx="0" cy="-66.2" rx="2.9" ry="1.1" fill="#000" opacity=".13"/>`;
  s += `<path d="M -3 -60.5 Q -8 -61 -11 -58.8 L -9.5 -49 Q -8.2 -45 -7.5 -41 L -9 -31 L 9 -31 L 7.5 -41 Q 8.2 -45 9.5 -49 L 11 -58.8 Q 8 -61 3 -60.5 L 0 -56.5 Z" fill="${TOP}"/>`;
  s += `<path d="M 0 -56.5 L 3 -60.5 Q 8 -61 11 -58.8 L 9.5 -49 Q 8.2 -45 7.5 -41 L 9 -31 L 0.6 -31 L 0.9 -45 Z" fill="${TOPS}"/>`;
  s += `<path d="M -3 -60 Q -8 -60.5 -10.6 -58.6 L -10 -55 Q -7.5 -57 -3.5 -57 Z" fill="#fff" opacity=".1"/>`;
  s += `<path d="M -2.7 -60.7 L 0 -55.4 L 2.7 -60.7 Z" fill="${gola}" opacity=".96"/>`;
  s += `<path d="M -2.7 -60.7 L -0.6 -53.6" stroke="${TOPS}" stroke-width=".55" fill="none" opacity=".7" stroke-linecap="round"/><path d="M 2.7 -60.7 L 0.6 -53.6" stroke="${TOPS}" stroke-width=".55" fill="none" opacity=".7" stroke-linecap="round"/>`;
  s += `<rect x="-0.32" y="-54.5" width="0.64" height="23.5" fill="${TOPS}" opacity=".45"/>`;
  if (k.cracha) s += `<rect x="1.6" y="-50" width="3.2" height="4.5" rx=".7" fill="${k.cracha}" opacity=".92"/><rect x="2.1" y="-48.8" width="2.2" height=".8" fill="#fff" opacity=".7"/>`;
  if (opts.telefone) {
    s += `<g class="bracos"><g class="b1"><path d="M -11 -58.6 Q -12.2 -54 -11.4 -48 L -10.4 -37 Q -10.2 -34.6 -8.9 -34.6 L -7.9 -35.6 Q -8.1 -48 -8.3 -56 Q -8.6 -59 -11 -58.6 Z" fill="${TOP}"/><ellipse cx="-9.5" cy="-34" rx="1.7" ry="2.1" fill="${SKIN}"/></g><g class="b2"><path d="M 8.6 -57.6 Q 12.2 -58.4 11.4 -52.6 Q 11 -49.6 8.8 -50.6 Q 9.4 -54 8.8 -57.4 Z" fill="${TOPS}"/><path d="M 8.9 -51.2 Q 6.4 -50.2 6.2 -56.2 Q 6 -62 7 -66.4 L 9.1 -65.9 Q 8.6 -61 9 -54.6 Q 9.2 -51.6 10.4 -51.6 Z" fill="${TOP}"/><ellipse cx="8" cy="-66.6" rx="1.6" ry="1.9" fill="${SKIN}"/><rect x="6.5" y="-70.2" width="2.4" height="5" rx=".8" fill="#0b0f16" stroke="#4a546a" stroke-width=".5"/><rect x="6.9" y="-69.5" width="1.6" height="3.4" rx=".4" fill="rgba(var(--sala-ativo-rgb),.4)"/></g></g>`;
  } else {
    s += `<g class="bracos"><g class="b1"><path d="M -11 -58.6 Q -12.2 -54 -11.4 -48 L -10.4 -37 Q -10.2 -34.6 -8.9 -34.6 L -7.9 -35.6 Q -8.1 -48 -8.3 -56 Q -8.6 -59 -11 -58.6 Z" fill="${TOP}"/><ellipse cx="-9.5" cy="-34" rx="1.7" ry="2.1" fill="${SKIN}"/></g><g class="b2"><path d="M 11 -58.6 Q 12.2 -54 11.4 -48 L 10.4 -37 Q 10.2 -34.6 8.9 -34.6 L 7.9 -35.6 Q 8.1 -48 8.3 -56 Q 8.6 -59 11 -58.6 Z" fill="${TOPS}"/><ellipse cx="9.5" cy="-34" rx="1.7" ry="2.1" fill="${SKIN}"/><ellipse cx="9.5" cy="-34" rx="1.7" ry="2.1" fill="#000" opacity=".08"/></g></g>`;
  }
  if (k.bolsa) s += `<rect x="-13.6" y="-40" width="6" height="6" rx="1.4" fill="#7a5433"/><path d="M -12.6 -40 q 1.6 -4.4 3.2 0" fill="none" stroke="#6b4a2b" stroke-width="1.2"/><rect x="-13.6" y="-37.2" width="6" height="1" fill="#000" opacity=".22"/>`;
  s += `<ellipse cx="-5" cy="-70.8" rx="1" ry="1.4" fill="${SKIN}"/><ellipse cx="5" cy="-70.8" rx="1" ry="1.4" fill="${SKIN}"/>`;
  s += `<ellipse cx="0" cy="-71.5" rx="5" ry="5.6" fill="${SKIN}"/><path d="M 0 -77 Q 4.8 -76.5 5 -71.5 Q 4.8 -66.5 0 -66 Q 2.8 -68 2.9 -71.5 Q 2.8 -75 0 -77 Z" fill="#000" opacity=".07"/>`;
  if (k.barba) s += `<path d="M -4 -68 Q -4.3 -64.4 0 -64 Q 4.3 -64.4 4 -68 Q 3.2 -66 0 -65.8 Q -3.2 -66 -4 -68 Z" fill="${HAIR}" opacity=".85"/>`;
  s += cabelo(k.estilo, HAIR);
  s += `<ellipse cx="-2" cy="-72.3" rx="0.6" ry="0.85" fill="#2b2b33"/><ellipse cx="2" cy="-72.3" rx="0.6" ry="0.85" fill="#2b2b33"/>`;
  s += `<path d="M -2.9 -73.9 Q -2 -74.3 -1.1 -74" stroke="${sobr}" stroke-width=".4" fill="none" opacity=".6" stroke-linecap="round"/><path d="M 1.1 -74 Q 2 -74.3 2.9 -73.9" stroke="${sobr}" stroke-width=".4" fill="none" opacity=".6" stroke-linecap="round"/>`;
  s += `<path d="M -1.2 -68.6 Q 0 -68.1 1.2 -68.6" stroke="#8a5a52" stroke-width=".5" fill="none" opacity=".55" stroke-linecap="round"/>`;
  if (k.bigode) s += `<path d="M -1.9 -68.9 Q 0 -69.7 1.9 -68.9" stroke="${HAIR}" stroke-width="1" fill="none" stroke-linecap="round"/>`;
  if (k.oculos) s += `<g fill="none" stroke="#2b2b33" stroke-width=".5" opacity=".9"><ellipse cx="-2" cy="-72.3" rx="1.5" ry="1.3"/><ellipse cx="2" cy="-72.3" rx="1.5" ry="1.3"/><line x1="-0.5" y1="-72.3" x2="0.5" y2="-72.3"/><line x1="-3.5" y1="-72.3" x2="-5" y2="-71"/><line x1="3.5" y1="-72.3" x2="5" y2="-71"/></g>`;
  if (k.headset) s += `<path d="M -5 -71 Q 0 -80.2 5 -71" fill="none" stroke="#242b3a" stroke-width="1"/><circle cx="-5" cy="-71" r="1.7" fill="#242b3a"/><circle cx="5" cy="-71" r="1.7" fill="#242b3a"/><path d="M -5 -70 Q -5.2 -66.5 -2.6 -67.3" fill="none" stroke="#242b3a" stroke-width=".8"/><circle cx="-2.6" cy="-67.3" r=".8" fill="#242b3a"/>`;
  s += `</g>`;
  if (k.bengala && !sentado) s += `<line x1="10.5" y1="-34" x2="12.5" y2="-1" stroke="#7a5230" stroke-width="1.5" stroke-linecap="round"/><ellipse cx="12.5" cy="-1" rx="1.4" ry=".7" fill="#4a3320"/>`;
  return s;
}

export function botSVG(): string {
  return `<ellipse cx="0" cy="0" rx="11" ry="2.8" fill="rgba(0,0,0,.4)"/><ellipse cx="0" cy="-1" rx="13" ry="3.4" fill="none" stroke="rgba(var(--sala-triagem-rgb),.35)" stroke-width="1.2"/>
    <ellipse class="aura" cx="0" cy="-48" rx="22" ry="40" fill="rgba(var(--sala-triagem-rgb),.16)"/>
    <path d="M -9 -31 L -6.3 -4 L -2.4 -4 L -1 -30 Z" fill="url(#botGrad)"/><path d="M 9 -31 L 6.3 -4 L 2.4 -4 L 1 -30 Z" fill="url(#botGrad)"/>
    <g class="bracos"><g class="b1"><path d="M -11 -58.6 Q -12.2 -54 -11.4 -48 L -10.4 -37 Q -10.2 -34.6 -8.9 -34.6 L -7.9 -35.6 Q -8.1 -48 -8.3 -56 Q -8.6 -59 -11 -58.6 Z" fill="url(#botGrad)" stroke="var(--sala-triagem)" stroke-width=".8"/></g><g class="b2"><path d="M 11 -58.6 Q 12.2 -54 11.4 -48 L 10.4 -37 Q 10.2 -34.6 8.9 -34.6 L 7.9 -35.6 Q 8.1 -48 8.3 -56 Q 8.6 -59 11 -58.6 Z" fill="url(#botGrad)" stroke="var(--sala-triagem)" stroke-width=".8"/></g></g>
    <path d="M -3 -60.5 Q -8 -61 -11 -58.8 L -9.5 -49 Q -8.2 -45 -7.5 -41 L -9 -31 L 9 -31 L 7.5 -41 Q 8.2 -45 9.5 -49 L 11 -58.8 Q 8 -61 3 -60.5 L 0 -56.5 Z" fill="url(#botGrad)" stroke="var(--sala-triagem)" stroke-width="1"/>
    <circle cx="0" cy="-46" r="3" fill="var(--sala-triagem)" opacity=".9"/><circle cx="0" cy="-46" r="6" fill="rgba(var(--sala-triagem-rgb),.22)"/>
    <path d="M -2.4 -66.5 L 2.4 -66.5 L 2.6 -61 Q 0 -60 -2.6 -61 Z" fill="#161b2a"/>
    <ellipse cx="0" cy="-71.5" rx="5" ry="5.6" fill="#161b2a" stroke="var(--sala-triagem)" stroke-width="1"/>
    <rect x="-3" y="-72.6" width="6" height="2.2" rx="1.1" fill="var(--sala-triagem)" opacity=".9"/>
    <path d="M -5 -71 Q 0 -80.2 5 -71" fill="none" stroke="var(--sala-triagem)" stroke-width="1.1"/><circle cx="-5" cy="-71" r="1.7" fill="var(--sala-triagem)"/><circle cx="5" cy="-71" r="1.7" fill="var(--sala-triagem)"/>`;
}

/* ---- Gerador de aparência (determinístico por seed) ---- */
const SKINS = ['#f1d2b8', '#e3b89a', '#d9a88a', '#c58c66', '#a86b4a', '#7d4b31'];
const CABELOS = ['#d8d8d8', '#bfbfbf', '#9a9a9a', '#d8d8d8', '#6b5d52', '#3b2a21', '#1f1a17', '#8a5a3c'];
const TOPS = ['#2f3e5e', '#33384a', '#3d5675', '#2f5048', '#6e3f45', '#4a4f5e', '#3a4a66', '#54586a', '#455a52', '#5a4a5e'];
const TOP2: (string | null)[] = ['#e8e2d9', '#d9e0ea', '#efe3e3', null, null];
const PANTS = ['#2f3542', '#3d3a4a', '#4a4038', '#2c3e50', '#5a5550', '#3a3f5a'];

export function lookCliente(seed: number, g: 'f' | 'm'): Look {
  const r = (n: number) => {
    seed = (seed * 9301 + 49297) % 233280;
    return Math.floor((seed / 233280) * n);
  };
  const estilos = g === 'f' ? ['bob', 'preso', 'longo', 'ondulado', 'curto', 'bob'] : ['curto', 'calvo', 'lado', 'ondulado', 'curto'];
  const estilo = estilos[r(estilos.length)];
  const saia = g === 'f' && r(100) < 40;
  return {
    skin: SKINS[r(SKINS.length)],
    hair: CABELOS[r(CABELOS.length)],
    estilo,
    longo: estilo === 'longo',
    top: TOPS[r(TOPS.length)],
    top2: TOP2[r(TOP2.length)],
    pants: PANTS[r(PANTS.length)],
    shoes: ['#1c2230', '#3a2a1f', '#2a2a2a', '#5a4632'][r(4)],
    saia: saia ? ['#4a3f5a', '#5a3d3d', '#3a4a5a', '#6a5a3a'][r(4)] : null,
    meia: ['#3a3f5a', '#2a2a2a', '#d9b89a'][r(3)],
    bolsa: g === 'f' && r(100) < 45,
    cardigan: r(100) < 32,
    bigode: g === 'm' && r(100) < 22,
    oculos: r(100) < 45,
    barba: g === 'm' && r(100) < 28,
    bengala: r(100) < 14,
  };
}
