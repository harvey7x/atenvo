/* ============================================================
   Sala SDR — Projeção isométrica + móveis (SVG puro)
   ------------------------------------------------------------
   Portado da demo de referência (atenvo-sala-sdr-v7.html). A
   GEOMETRIA é a mesma; o que muda é a paleta: os azuis de destaque
   passam a consumir a tinta da casa (--sala-ativo-rgb = --azul),
   e as luzes/telas ficam escopadas em .v2 .sala. Materiais neutros
   (piso, metal, vidro) são ilustração — retunados pro --base #0A0B0D.
   Projeção 2:1 (HW=2·HH). SK = ângulo do skew pra texto no chão.
   ============================================================ */

export const OX = 552;
export const OY = 160;
export const HW = 32;
export const HH = 16;
export const SK = 26.565;
// x0 = margem à ESQUERDA (fora do quadrado principal) p/ as salinhas separadas (perdidos)
// y0 = margem ACIMA (parede alta de torre + placas suspensas sobem acima de y=0).
// Enxerto V3: OX/OY/HW/HH FIXOS — só o viewBox cresce; o mapeamento mundo→tela de
// todo (x,y,z) fica IDÊNTICO, então nenhum móvel/waypoint/boneco se desloca.
export const VB = { w: 1900, h: 1060, x0: -360, y0: -40 };

export interface Pt {
  x: number;
  y: number;
}

export const iso = (x: number, y: number, z = 0): Pt => ({ x: OX + (x - y) * HW, y: OY + (x + y) * HH - z });
export const pts = (arr: Pt[]): string => arr.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

export const box = (x: number, y: number, w: number, d: number, h: number, top: string, left: string, right: string): string => {
  const t = pts([iso(x, y, h), iso(x + w, y, h), iso(x + w, y + d, h), iso(x, y + d, h)]);
  const l = pts([iso(x, y + d, h), iso(x + w, y + d, h), iso(x + w, y + d, 0), iso(x, y + d, 0)]);
  const r = pts([iso(x + w, y, h), iso(x + w, y + d, h), iso(x + w, y + d, 0), iso(x + w, y, 0)]);
  return `<g><polygon points="${l}" fill="${left}"/><polygon points="${r}" fill="${right}"/><polygon points="${t}" fill="${top}"/></g>`;
};

export const boxZ = (x: number, y: number, z0: number, w: number, d: number, h: number, top: string, left: string, right: string): string => {
  const T = (a: number, b: number, c: number) => iso(a, b, z0 + c);
  return `<g><polygon points="${pts([T(x, y + d, h), T(x + w, y + d, h), T(x + w, y + d, 0), T(x, y + d, 0)])}" fill="${left}"/><polygon points="${pts([T(x + w, y, h), T(x + w, y + d, h), T(x + w, y + d, 0), T(x + w, y, 0)])}" fill="${right}"/><polygon points="${pts([T(x, y, h), T(x + w, y, h), T(x + w, y + d, h), T(x, y + d, h)])}" fill="${top}"/></g>`;
};

export const flat = (x: number, y: number, z: number, w: number, d: number, fill: string, extra = ''): string =>
  `<polygon points="${pts([iso(x, y, z), iso(x + w, y, z), iso(x + w, y + d, z), iso(x, y + d, z)])}" fill="${fill}" ${extra}/>`;

export const monitor = (x: number, y: number, z: number, w = 0.8, escura = false): string => {
  const a = iso(x, y, z + 3), b = iso(x + w, y, z + 3), c = iso(x + w, y, z + 25), d = iso(x, y, z + 25);
  const base = iso(x + w / 2, y + 0.08, z);
  const lin = (z1: number, w2: number) => {
    const p = iso(x + 0.1, y, z + z1), q = iso(x + w2, y, z + z1);
    return `<polygon points="${pts([p, q, { x: q.x, y: q.y + 2 }, { x: p.x, y: p.y + 2 }])}" fill="${escura ? 'rgba(255,255,255,.14)' : 'rgba(var(--sala-ativo-rgb),.6)'}"/>`;
  };
  return `<g>${flat(x + 0.3, y - 0.02, z, w - 0.6, 0.16, '#3a4356')}<line x1="${base.x}" y1="${base.y}" x2="${base.x}" y2="${base.y - 4}" stroke="#4a546a" stroke-width="2"/>
    <polygon points="${pts([a, b, c, d])}" fill="#0a0e15" stroke="#3d475c" stroke-width="1.1"/>
    <polygon points="${pts([a, b, c, d])}" fill="${escura ? 'rgba(255,255,255,.02)' : 'url(#telaGrad)'}"/>
    ${escura ? '' : `<ellipse cx="${(a.x + c.x) / 2}" cy="${(a.y + c.y) / 2 + 12}" rx="22" ry="8" fill="url(#luzSoft)"/>`}
    <g class="tela-linhas">${lin(18, w - 0.12)}${lin(13, w - 0.35)}${lin(8, w - 0.22)}</g></g>`;
};

export const planta = (x: number, y: number, esc = 1, z = 0, tipo = 0): string => {
  const p = iso(x, y, z);
  const folhas =
    tipo === 1
      ? `<path d="M 0 -20 Q -14 -34 -8 -46 Q 0 -36 0 -20 Z" fill="#3a8a69"/><path d="M 0 -20 Q 14 -34 8 -46 Q 0 -36 0 -20 Z" fill="#2f6f57"/><path d="M 0 -20 Q -2 -40 -16 -40 Q -6 -30 0 -20 Z" fill="#45a07a"/><path d="M 0 -20 Q 2 -40 16 -40 Q 6 -30 0 -20 Z" fill="#2a6350"/><path d="M 0 -22 Q 0 -44 2 -52 Q 4 -40 0 -22 Z" fill="#57b48b"/>`
      : `<circle cx="-7" cy="-30" r="9" fill="#2f6f57"/><circle cx="7" cy="-31" r="10" fill="#3a8a69"/><circle cx="0" cy="-40" r="10" fill="#45a07a"/><circle cx="-3" cy="-33" r="7" fill="#57b48b"/><circle cx="6" cy="-24" r="6" fill="#2a6350"/>`;
  return `<g transform="translate(${p.x},${p.y}) scale(${esc})"><ellipse cx="0" cy="0" rx="12" ry="5" fill="rgba(0,0,0,.35)"/>
    <path d="M -8 -2 L -6 -20 L 6 -20 L 8 -2 Z" fill="#2b3245"/><path d="M -8 -2 L 8 -2 L 6 -20 L 0 -19 Z" fill="#232a3b"/><ellipse cx="0" cy="-20" rx="8" ry="3" fill="#1e2433"/>${folhas}</g>`;
};

export const poltrona = (x: number, y: number): string => {
  const cores = ['#46597f', '#2f3d5c', '#38496c'];
  return (
    box(x - 0.42, y - 0.36, 0.84, 0.2, 26, cores[0], cores[1], cores[2]) +
    boxZ(x - 0.42, y - 0.16, 0, 0.84, 0.6, 13, '#4d6289', '#33436a', '#3c4f78') +
    flat(x - 0.34, y - 0.1, 13.5, 0.68, 0.46, 'rgba(255,255,255,.07)') +
    boxZ(x - 0.5, y - 0.17, 13, 0.1, 0.6, 7, cores[0], cores[1], cores[2]) +
    boxZ(x + 0.4, y - 0.17, 13, 0.1, 0.6, 7, cores[0], cores[1], cores[2])
  );
};

export const cadeiraVisita = (x: number, y: number): string =>
  box(x - 0.3, y - 0.32, 0.6, 0.14, 30, '#3b4557', '#2a3242', '#313a4d') + boxZ(x - 0.3, y - 0.18, 0, 0.6, 0.5, 13, '#4a5468', '#363e4f', '#3f4859');

export const bebedouro = (x: number, y: number): string => {
  const p = iso(x, y, 0);
  return `<g transform="translate(${p.x},${p.y})"><ellipse cx="0" cy="0" rx="10" ry="4.5" fill="rgba(0,0,0,.35)"/><rect x="-8" y="-34" width="16" height="34" rx="2" fill="#2b3245"/><rect x="-8" y="-34" width="6" height="34" fill="rgba(255,255,255,.05)"/><rect x="-3" y="-20" width="6" height="4" rx="1" fill="rgba(var(--sala-ativo-rgb),.8)"/><rect x="-7" y="-56" width="14" height="22" rx="5" fill="rgba(var(--sala-ativo-rgb),.28)" stroke="rgba(190,215,255,.6)" stroke-width="1"/><rect x="-5" y="-53" width="3" height="14" rx="1.5" fill="rgba(255,255,255,.35)"/></g>`;
};

export const impressora = (x: number, y: number): string =>
  box(x - 0.4, y - 0.35, 0.8, 0.7, 24, '#2b3245', '#20273a', '#262e40') +
  boxZ(x - 0.32, y - 0.28, 24, 0.64, 0.56, 10, '#d5dae3', '#9aa3b2', '#b5bcc9') +
  boxZ(x - 0.2, y - 0.2, 34, 0.4, 0.34, 3, '#3a4356', '#2a3244', '#323b4f');

export const mesaRedonda = (x: number, y: number): string => {
  const c = iso(x, y, 0);
  return `<g><ellipse cx="${c.x}" cy="${c.y}" rx="44" ry="22" fill="rgba(0,0,0,.3)"/><ellipse cx="${c.x}" cy="${c.y - 3}" rx="10" ry="5" fill="#2a3244"/><rect x="${c.x - 3}" y="${c.y - 26}" width="6" height="24" fill="#3a4356"/><ellipse cx="${c.x}" cy="${c.y - 26}" rx="42" ry="21" fill="#b9c0cc"/><path d="M ${c.x - 42} ${c.y - 26} A 42 21 0 0 0 ${c.x + 42} ${c.y - 26} L ${c.x + 42} ${c.y - 22} A 42 21 0 0 1 ${c.x - 42} ${c.y - 22} Z" fill="#8f99a8"/><ellipse cx="${c.x}" cy="${c.y - 27}" rx="42" ry="21" fill="#e7eaf0"/><ellipse cx="${c.x - 8}" cy="${c.y - 30}" rx="9" ry="4.5" fill="var(--ambar)" opacity=".9"/></g>`;
};

export const luminaria = (x: number, y: number, z: number): string =>
  boxZ(x, y, z, 0.08, 0.08, 20, '#3a4356', '#2a3244', '#323b4f') +
  boxZ(x - 0.14, y - 0.1, z + 20, 0.36, 0.28, 5, '#d9dee6', '#98a1b0', '#b7bfcb') +
  `<ellipse cx="${iso(x + 0.05, y + 0.05, z).x}" cy="${iso(x + 0.05, y + 0.05, z).y + 2}" rx="16" ry="7" fill="rgba(255,225,180,.12)" filter="url(#blur)"/>`;

/** Texto rebatido no plano do chão (skew isométrico). */
export const textoChao = (x: number, y: number, txt: string, tam = 9, cor = 'rgba(255,255,255,.16)'): string => {
  const p = iso(x, y, 0.5);
  return `<g transform="matrix(1,0.5,-1,0.5,${p.x.toFixed(1)},${p.y.toFixed(1)})"><text x="0" y="0" text-anchor="middle" font-size="${tam}" font-weight="600" letter-spacing=".18em" fill="${cor}">${txt}</text></g>`;
};

/** Placa suspensa do teto (rótulo nível 2, resolve o bug do ASSINATURA tapado):
   bandeja num plano y=const, z~96..110 → ACIMA da cabeça (~78px) e abaixo do cove.
   Deve ser adicionada em montarMoveis com depth = borda de FUNDO da zona (x+y MÍNIMO):
   o motor a ordena ATRÁS dos bonecos e, por flutuar alto, nunca é ocluída por eles. */
export const placaSuspensa = (cx: number, cy: number, txt: string, cor: string, sub = ''): string => {
  const halfW = Math.max(1.5, txt.length * 0.115);
  const zBase = 96, zH = sub ? 15 : 11, zTop = 150;
  const x0 = cx - halfW, x1 = cx + halfW;
  const cbl = (xx: number) => { const a = iso(xx, cy, zTop), b = iso(xx, cy, zBase + zH); return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="rgba(255,255,255,.2)" stroke-width="1.1"/>`; };
  const face = pts([iso(x0, cy, zBase + zH), iso(x1, cy, zBase + zH), iso(x1, cy, zBase), iso(x0, cy, zBase)]);
  const p = iso(cx, cy, zBase + zH * (sub ? 0.66 : 0.6));
  let s = cbl(x0 + 0.25) + cbl(x1 - 0.25);
  s += `<polygon points="${face}" fill="rgba(11,15,23,.94)" stroke="${cor}" stroke-width="1.5"/>`;
  s += `<polygon points="${pts([iso(x0, cy, zBase), iso(x1, cy, zBase), iso(x1, cy, zBase - 1.8), iso(x0, cy, zBase - 1.8)])}" fill="${cor}"/>`;
  s += `<g transform="translate(${p.x},${p.y}) skewY(${SK})"><text x="0" y="0" text-anchor="middle" font-size="10.5" font-weight="700" letter-spacing=".1em" fill="${cor}">${txt}</text>${sub ? `<text x="0" y="9" text-anchor="middle" font-size="5" letter-spacing=".06em" fill="var(--cena-txt-soft)">${sub}</text>` : ''}</g>`;
  return s;
};

export const defs = (): string => `<defs>
    <linearGradient id="botGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="rgba(var(--sala-triagem-rgb),.22)"/><stop offset="1" stop-color="rgba(var(--sala-triagem-rgb),.08)"/></linearGradient>
    <linearGradient id="paredeFGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--cena-parede1)"/><stop offset="1" stop-color="var(--cena-parede2)"/></linearGradient>
    <linearGradient id="paredeLGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--cena-parede-l1)"/><stop offset="1" stop-color="var(--cena-parede-l2)"/></linearGradient>
    <linearGradient id="ceuGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1d2a4a"/><stop offset=".6" stop-color="#2b3e6a"/><stop offset="1" stop-color="#c88a5a" stop-opacity=".55"/></linearGradient>
    <linearGradient id="luzJanela" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="rgba(255,214,170,.14)"/><stop offset="1" stop-color="rgba(255,214,170,0)"/></linearGradient>
    <linearGradient id="telaGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="rgba(var(--sala-ativo-rgb),.22)"/><stop offset="1" stop-color="rgba(var(--sala-ativo-rgb),.06)"/></linearGradient>
    <radialGradient id="vinheta" cx=".5" cy=".55" r=".75"><stop offset=".55" stop-color="rgba(0,0,0,0)"/><stop offset="1" stop-color="var(--cena-vinheta)"/></radialGradient>
    <filter id="blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="5"/></filter>
    <filter id="blurG" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="14"/></filter>
    <!-- Redesenho: luz volumétrica golden-hour da janela + poeira -->
    <filter id="blurXL" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="12"/></filter>
    <linearGradient id="luzVolume" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="rgba(255,225,180,.14)"/><stop offset="1" stop-color="rgba(255,225,180,0)"/></linearGradient>
    <!-- Piso polido: verniz claro que assenta a cena -->
    <linearGradient id="pisoPolido" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="rgba(255,255,255,.07)"/><stop offset="1" stop-color="rgba(255,255,255,0)"/></linearGradient>
    <!-- Metal escovado: nameplates, painéis, cachepôs -->
    <linearGradient id="metalEscovado" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8f99a8"/><stop offset=".5" stop-color="#cbd2dd"/><stop offset="1" stop-color="#828c9b"/></linearGradient>
    <!-- Bloom dourado da assinatura -->
    <radialGradient id="bloomAssina" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="rgba(240,201,107,.5)"/><stop offset="1" stop-color="rgba(240,201,107,0)"/></radialGradient>
    <!-- Sombra/luz SUAVES por gradiente (substituem feGaussianBlur → custo-por-frame ~zero) -->
    <radialGradient id="sombraSoft" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="var(--cena-sombra)"/><stop offset=".7" stop-color="var(--cena-sombra)"/><stop offset="1" stop-color="var(--cena-sombra)" stop-opacity="0"/></radialGradient>
    <radialGradient id="luzSoft" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="rgba(255,255,255,.05)"/><stop offset="1" stop-color="rgba(255,255,255,0)"/></radialGradient>
  </defs>`;

/* Metal escovado: painel vertical (plano y=const) com ripas verticais alternando
   alpha + brilho diagonal. Usado em nameplates, painel da recepção e cachepôs. */
export const ripasEscovado = (x: number, y: number, z0: number, w: number, h: number): string => {
  let s = `<polygon points="${pts([iso(x, y, z0), iso(x + w, y, z0), iso(x + w, y, z0 + h), iso(x, y, z0 + h)])}" fill="url(#metalEscovado)"/>`;
  const n = Math.max(4, Math.round(w / 0.1));
  for (let i = 0; i < n; i++) {
    const xi = x + (i / n) * w;
    const seg = (w / n) * 0.62;
    s += `<polygon points="${pts([iso(xi, y, z0), iso(xi + seg, y, z0), iso(xi + seg, y, z0 + h), iso(xi, y, z0 + h)])}" fill="rgba(255,255,255,${i % 2 ? 0.07 : 0.02})"/>`;
  }
  s += `<polygon points="${pts([iso(x, y, z0 + h * 0.72), iso(x + w, y, z0 + h * 0.28), iso(x + w, y, z0 + h * 0.42), iso(x, y, z0 + h * 0.86)])}" fill="rgba(255,255,255,.12)"/>`;
  return s;
};
