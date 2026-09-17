/* ============================================================
   Sala SDR — Cena estática (escritório isométrico 22×16) + zonas
   ------------------------------------------------------------
   As 10 zonas (cada etapa do funil = um lugar físico), o mobiliário,
   o corredor central e a camada ordenada por profundidade (x+y).
   Portado da demo; só as tintas de destaque viraram tokens da casa.
   ============================================================ */
import { iso, pts, box, boxZ, flat, monitor, planta, poltrona, cadeiraVisita, bebedouro, mesaRedonda, luminaria, ripasEscovado, textoChao, defs, SK, VB, type Pt } from './iso';
import { bonecoPixelSVG, botPixelSVG } from './bonecoPixel';
import { ATENDENTES, BOT } from './config';

/* materiais neutros da sala (ilustração; assentam no --base #0A0B0D) */
const C = { piso1: 'var(--cena-piso1)', piso2: 'var(--cena-piso2)', mesaT: '#e7eaf0', mesaL: '#b9c0cc', mesaR: '#cfd5df', painel: '#2a3244', cadeiraT: '#2b3345', cadeiraL: '#1e2536', cadeiraR: '#242c3e' };
const WALL_H = 175, GX = 30, GY = 21;

/* ---- Zonas: assentos + posições em pé por estado ------------- */
export type NomeZona = 'espera' | 'sem_resposta' | 'retorno' | 'documentacao' | 'remarketing' | 'assinatura' | 'nao_legivel' | 'perdidos';
export interface Zona { assentos: [number, number][]; emPe: [number, number][]; sentado: boolean; telefone: boolean }
export const ZONAS: Record<NomeZona, Zona> = {
  // ESPERA (banda frontal-esq): 2 fileiras + corredor central; lane y~19.4 reservada p/ rótulo
  espera: { assentos: [[2.3, 15.5], [3.6, 15.5], [4.9, 15.5], [6.2, 15.5], [7.5, 15.5], [2.3, 18.0], [3.6, 18.0], [4.9, 18.0], [6.2, 18.0], [7.5, 18.0]], emPe: [[8.4, 16.7], [1.6, 16.0], [1.6, 17.5]], sentado: true, telefone: true },
  // SEM_RESPOSTA (banda meio-esq, recuada): mesa alta em (5.9,12.4)
  sem_resposta: { assentos: [[5.0, 11.8], [6.8, 11.8], [5.0, 13.0], [6.8, 13.0], [5.9, 13.4]], emPe: [[4.3, 12.4], [7.3, 12.4]], sentado: false, telefone: false },
  // RETORNO (banda fundo-dir): sofá longo sob 2ª janela
  retorno: { assentos: [[24.2, 2.6], [25.0, 2.6], [25.8, 2.6], [26.6, 2.6]], emPe: [[24.0, 4.3], [26.5, 4.3]], sentado: true, telefone: true },
  // DOCUMENTAÇÃO (banda meio-dir): balcão com scanner/bandejas/arquivo
  documentacao: { assentos: [[24.2, 12.5], [25.0, 12.5], [25.8, 12.5], [26.6, 12.5], [24.2, 14.1], [25.0, 14.1], [25.8, 14.1], [26.6, 14.1]], emPe: [[23.6, 15.4], [27.0, 15.4]], sentado: true, telefone: true },
  // REMARKETING (banda frontal-esq, abaixo da espera)
  remarketing: { assentos: [[2.8, 18.7], [3.7, 18.7], [5.2, 18.7], [6.1, 18.7]], emPe: [[2.1, 18.1], [6.7, 18.1]], sentado: true, telefone: true },
  // ASSINATURA (CUBO DE VIDRO, banda frontal-dir): mesaRedonda em (20,18.3)
  assinatura: { assentos: [[18.6, 17.7], [19.9, 17.7], [21.2, 17.7], [18.6, 19.0], [19.9, 19.0], [21.2, 19.0]], emPe: [[17.8, 18.3], [22.2, 18.3]], sentado: true, telefone: false },
  // NÃO-TRABALHÁVEIS (alcova de vidro baixa, encostada na parede esq)
  nao_legivel: { assentos: [[1.3, 11.0], [2.1, 11.0], [1.3, 12.0], [2.1, 12.0], [1.3, 13.0], [2.1, 13.0]], emPe: [[2.8, 11.4], [2.8, 12.6]], sentado: true, telefone: false },
  // SALINHA SEPARADA (fora do quadrado, frontal-esq-baixo) — clientes PERDIDOS ficam aqui
  perdidos: { assentos: [[0.9, 23.6], [1.7, 23.6], [2.6, 23.6], [0.9, 24.9], [1.7, 24.9], [2.6, 24.9], [0.9, 26.2], [1.7, 26.2]], emPe: [[3.3, 24.2], [3.3, 25.6]], sentado: true, telefone: false },
};
/* Retângulo (grade) da salinha anexa dos perdidos */
export const ANEXO_PERD = { x0: 0.2, x1: 3.8, y0: 22.5, y1: 27, wallH: 60 };
/* Corredor central (spine horizontal em y~9.3) + portões de entrada/saída de cada zona */
export const BALCAO: [number, number][] = [[4.0, 4.0], [5.4, 4.0]];
export const FILA: [number, number][] = [[3.2, 5.2], [2.6, 6.2], [2.0, 7.2]];
export const PORTA: [number, number] = [0.35, 9.0];
export const HALL: [number, number] = [3.5, 8.5];
export const PASSAGEM: [number, number] = [9.5, 8.8];
export const ESPERA_SAIDA: [number, number] = [9.0, 9.8];
export const SR_GATE: [number, number] = [7.0, 9.5];
export const K1: [number, number] = [11, 9.3];
export const K2: [number, number] = [15.5, 9.3];
export const K3: [number, number] = [19, 9.3];
export const RET_GATE: [number, number] = [22.5, 6.0];
export const RET_IN: [number, number] = [25.0, 5.0];
export const DOC_GATE: [number, number] = [23.0, 10.0];
export const KS: Record<number, [number, number]> = { 1: K1, 2: K2, 3: K3 };

/* ---- Móveis compostos --------------------------------------- */
const mesa = (x: number, y: number, w: number, nome = '', dotId = '', cores: [string, string, string] = [C.mesaT, C.mesaL, C.mesaR], fim = false) => {
  const pn = iso(fim ? x + w - 0.22 : x + 0.32, y + 0.9, 11), pd = iso(x + 0.16, y + 0.9, 12);
  return (
    box(x, y, w, 0.9, 28, ...cores) +
    `<polygon points="${pts([iso(x + 0.05, y + 0.9, 24), iso(x + w - 0.05, y + 0.9, 24), iso(x + w - 0.05, y + 0.9, 4), iso(x + 0.05, y + 0.9, 4)])}" fill="${C.painel}"/>` +
    (nome ? `${dotId ? `<circle id="${dotId}" cx="${pd.x}" cy="${pd.y}" r="2.6" fill="var(--sala-espera)"/>` : ''}<g transform="translate(${pn.x},${pn.y}) skewY(${SK})"><text class="nome-mesa ${nome === 'mesa livre' ? 'livre' : ''}" x="0" y="0" font-size="9.5" ${fim ? 'text-anchor="end"' : ''}>${nome}</text></g>` : '')
  );
};
const cadeira = (x: number, y: number) => box(x, y, 0.8, 0.16, 40, C.cadeiraT, C.cadeiraL, C.cadeiraR) + boxZ(x - 0.05, y + 0.14, 16, 0.9, 0.55, 4, '#333c50', '#242c3e', '#2b3345');
const acessorios = (x: number, y: number, extra = 0) =>
  flat(x + 0.42, y + 0.55, 28.5, 0.8, 0.22, '#3a4356') +
  `<ellipse cx="${iso(x + 1.3, y + 0.72, 29).x}" cy="${iso(x + 1.3, y + 0.72, 29).y}" rx="3.6" ry="2.2" fill="#3a4356"/>` +
  boxZ(x + 0.04, y + 0.52, 28, 0.3, 0.28, 5, '#2a3244', '#1e2536', '#242c3e') +
  flat(x + 0.08, y + 0.54, 33.2, 0.2, 0.18, 'var(--sala-ativo)') +
  flat(x + 1.42, y + 0.5, 28.6, 0.38, 0.3, '#eef1f5') +
  flat(x + 1.47, y + 0.55, 28.8, 0.28, 0.22, '#dfe4ec') +
  boxZ(x + 1.8, y + 0.18, 28, 0.17, 0.17, 8, '#e9edf3', '#bfc6d2', '#d3d9e3') +
  (extra === 1 ? luminaria(x + 0.08, y + 0.08, 28) : extra === 2 ? planta(x + 1.85, y + 0.2, 0.42, 28, 1) : '');

/* ---- Camada ordenada por profundidade ----------------------- */
const svgNS = 'http://www.w3.org/2000/svg';
export interface Item { depth: number; el: SVGGElement; dyn: boolean }
export interface AddOpts { id?: string; cls?: string; dyn?: boolean; attrs?: Record<string, string> }

export class Camada {
  svg: SVGSVGElement;
  mundo: SVGGElement;
  itens: Item[] = [];
  private ordemAtual = '';
  private ks = 0;

  constructor(svg: SVGSVGElement) {
    this.svg = svg;
    svg.setAttribute('viewBox', `${VB.x0} ${VB.y0} ${VB.w} ${VB.h}`);
    svg.innerHTML = `${defs()}<g id="fundo">${cenaFundo()}</g><g id="selecao"></g><g id="mundo"></g><rect x="-700" y="-600" width="2700" height="2000" fill="url(#vinheta)" pointer-events="none"/><g id="letreiros" pointer-events="none">${letreiros()}</g>`;
    this.mundo = svg.querySelector('#mundo') as SVGGElement;
    montarMoveis(this);
  }

  addItem(depth: number, html: string, extra: AddOpts = {}): Item {
    const g = document.createElementNS(svgNS, 'g');
    g.innerHTML = html;
    if (extra.id) g.id = extra.id;
    if (extra.cls) g.setAttribute('class', extra.cls);
    if (extra.attrs) for (const k in extra.attrs) g.setAttribute(k, extra.attrs[k]);
    const it: Item = { depth, el: g, dyn: !!extra.dyn };
    this.itens.push(it);
    this.mundo.appendChild(g);
    return it;
  }

  reordenar(): void {
    const ord = [...this.itens].sort((a, b) => a.depth - b.depth);
    const chave = ord.map((i) => i.el.id || (i.el as SVGGElement & { __k?: string }).__k || ((i.el as SVGGElement & { __k?: string }).__k = 'k' + this.ks++)).join('|');
    if (chave === this.ordemAtual) return;
    this.ordemAtual = chave;
    for (const i of ord) this.mundo.appendChild(i.el);
  }

  removerItem(it: Item): void {
    it.el.remove();
    const i = this.itens.indexOf(it);
    if (i >= 0) this.itens.splice(i, 1);
  }

  q<E extends Element = SVGElement>(sel: string): E | null {
    return this.svg.querySelector<E>(sel);
  }
}

/* ---- Fundo: piso, tapetes das zonas, paredes, janelas, TV ---- */
function cenaFundo(): string {
  let s = '';
  for (let x = 0; x < GX; x += 2) for (let y = 0; y < GY; y += 2) {
    s += `<polygon points="${pts([iso(x, y), iso(x + 2, y), iso(x + 2, y + 2), iso(x, y + 2)])}" fill="${((x + y) / 2) % 2 ? C.piso1 : C.piso2}" stroke="var(--cena-linha)" stroke-width="1"/>`;
  }
  // Oclusão de ambiente: sombras de contato suaves sob os clusters (o "peso de foto")
  for (const [x, y, rx, ry] of [[14.0, 4.5, 380, 160], [4.9, 17.0, 240, 110], [25.5, 13.0, 200, 92], [5.9, 12.4, 150, 72], [20.0, 18.3, 205, 96], [3.7, 2.0, 150, 70], [25.0, 3.0, 150, 70]]) s += `<ellipse cx="${iso(x, y).x}" cy="${iso(x, y).y}" rx="${rx}" ry="${ry}" fill="url(#sombraSoft)"/>`;
  const rug = (x1: number, y1: number, x2: number, y2: number, fill: string, stroke: string) => `<polygon points="${pts([iso(x1, y1), iso(x2, y1), iso(x2, y2), iso(x1, y2)])}" fill="${fill}" stroke="${stroke}"/>`;
  s += rug(9.5, 1.5, 21.0, 12.0, 'rgba(var(--sala-ativo-rgb),.045)', 'rgba(var(--sala-ativo-rgb),.14)');      // EQUIPE SDR
  s += rug(1.0, 1.0, 7.2, 4.0, 'rgba(var(--sala-triagem-rgb),.04)', 'rgba(var(--sala-triagem-rgb),.12)');       // recepção
  s += rug(23.0, 1.6, 28.7, 4.8, 'rgba(138,148,166,.06)', 'rgba(138,148,166,.2)');                             // retorno
  s += rug(4.3, 11.0, 8.5, 14.0, 'rgba(229,102,92,.06)', 'rgba(229,102,92,.22)');                              // sem resposta
  s += rug(0.7, 10.4, 3.2, 13.7, 'rgba(160,170,186,.05)', 'rgba(160,170,186,.18)');                            // não-trabalháveis
  s += rug(23.2, 10.8, 29.0, 15.6, 'rgba(74,190,140,.05)', 'rgba(74,190,140,.2)');                             // documentação
  s += rug(1.5, 15.0, 9.0, 19.4, 'rgba(217,164,74,.05)', 'rgba(217,164,74,.16)');                              // espera
  s += rug(1.8, 17.6, 7.0, 20.2, 'rgba(var(--sala-triagem-rgb),.05)', 'rgba(var(--sala-triagem-rgb),.16)');    // remarketing
  s += rug(16.8, 16.3, 23.2, 20.6, 'rgba(74,190,140,.07)', 'rgba(74,190,140,.28)');                            // ASSINATURA (verde)
  s += rug(9.0, 17.0, 14.0, 20.0, 'rgba(217,164,74,.035)', 'rgba(217,164,74,.12)');                            // convívio/café
  // Piso polido: verniz claro no núcleo SDR + recepção + corredor (assenta a cena)
  s += `<polygon points="${pts([iso(9.5, 1.5, 0.16), iso(21.0, 1.5, 0.16), iso(21.0, 12.0, 0.16), iso(9.5, 12.0, 0.16)])}" fill="url(#pisoPolido)" opacity=".5"/>`;
  s += `<polygon points="${pts([iso(1.0, 1.0, 0.16), iso(7.2, 1.0, 0.16), iso(7.2, 7.6, 0.16), iso(1.0, 7.6, 0.16)])}" fill="url(#pisoPolido)" opacity=".38"/>`;
  s += `<polygon points="${pts([iso(3.0, 8.2, 0.16), iso(28.0, 8.2, 0.16), iso(28.0, 10.2, 0.16), iso(3.0, 10.2, 0.16)])}" fill="url(#pisoPolido)" opacity=".33"/>`;
  // (rótulos de zona: pílulas horizontais flutuantes em letreiros(), não mais no chão skewado)
  // PAREDES (pé-direito de torre)
  s += `<polygon points="${pts([iso(0, 0, WALL_H), iso(GX, 0, WALL_H), iso(GX, 0, 0), iso(0, 0, 0)])}" fill="url(#paredeFGrad)"/>`;
  s += `<polygon points="${pts([iso(0, 0, WALL_H), iso(0, GY, WALL_H), iso(0, GY, 0), iso(0, 0, 0)])}" fill="url(#paredeLGrad)"/>`;
  s += `<polygon points="${pts([iso(0, 0, 7), iso(GX, 0, 7), iso(GX, 0, 0), iso(0, 0, 0)])}" fill="var(--cena-sombra-parede)"/><polygon points="${pts([iso(0, 0, 7), iso(0, GY, 7), iso(0, GY, 0), iso(0, 0, 0)])}" fill="var(--cena-sombra-parede)"/>`;
  // Pilastras (relevo 3D) onde a parede está livre de janela/videowall
  for (const px of [10.6, 21.3]) s += boxZ(px - 0.12, 0, 0, 0.24, 0.2, WALL_H, 'var(--cena-parede2)', 'var(--cena-sombra-parede)', 'var(--cena-parede-l2)');
  for (const py of [15.0, 19.0]) s += boxZ(0, py - 0.12, 0, 0.2, 0.24, WALL_H, 'var(--cena-parede2)', 'var(--cena-parede-l2)', 'var(--cena-sombra-parede)');
  // Sanca clara de topo (cornija) — separa parede do teto no pé-direito alto
  s += `<polygon points="${pts([iso(0, 0, WALL_H - 6), iso(GX, 0, WALL_H - 6), iso(GX, 0, WALL_H - 9), iso(0, 0, WALL_H - 9)])}" fill="rgba(255,255,255,.05)"/><polygon points="${pts([iso(0, 0, WALL_H - 6), iso(0, GY, WALL_H - 6), iso(0, GY, WALL_H - 9), iso(0, 0, WALL_H - 9)])}" fill="rgba(255,255,255,.04)"/>`;
  // janela grande da recepção
  const jx1 = 0.8, jx2 = 10.2, jz1 = 56, jz2 = 150;
  s += `<polygon points="${pts([iso(jx1, 0, jz1), iso(jx2, 0, jz1), iso(jx2, 0, jz2), iso(jx1, 0, jz2)])}" fill="url(#ceuGrad)" stroke="rgba(255,255,255,.18)" stroke-width="1.2"/>`;
  for (const [x, h, w] of [[1.0, 34, 0.6], [1.7, 56, 0.8], [2.7, 28, 0.5], [3.3, 70, 1.0], [4.5, 44, 0.9], [5.5, 62, 0.7], [6.4, 34, 0.6], [7.1, 52, 0.8], [8.1, 40, 0.7], [9.0, 60, 0.9]]) s += `<polygon points="${pts([iso(x, 0, jz1), iso(x + w, 0, jz1), iso(x + w, 0, jz1 + h), iso(x, 0, jz1 + h)])}" fill="rgba(20,26,40,.9)"/>`;
  for (const [x, h, w] of [[1.8, 48, 0.15], [3.5, 64, 0.12], [5.6, 52, 0.1], [9.2, 54, 0.12]]) s += `<polygon points="${pts([iso(x, 0, jz1 + 6), iso(x + w, 0, jz1 + 6), iso(x + w, 0, jz1 + h), iso(x, 0, jz1 + h)])}" fill="rgba(255,214,150,.35)"/>`;
  for (let i = 1; i < 5; i++) { const a = iso(jx1 + i * 1.88, 0, jz1), b = iso(jx1 + i * 1.88, 0, jz2); s += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="rgba(255,255,255,.22)" stroke-width="1.5"/>`; }
  s += `<polygon points="${pts([iso(jx1, 0), iso(jx2, 0), iso(jx2 + 0.8, 3.2), iso(jx1 - 0.2, 3.2)])}" fill="url(#luzJanela)"/>`;
  // FEIXES VOLUMÉTRICOS golden-hour: descem da janela e alargam no chão (--luz-op zera no tema claro)
  const shaft = (xa: number, w: number) => `<polygon points="${pts([iso(xa, 0, 140), iso(xa + w, 0, 140), iso(xa + w + 2.4, 5.0, 2), iso(xa + 2.4, 5.0, 2)])}" fill="url(#luzVolume)" filter="url(#blurXL)" style="opacity:calc(var(--fx) * var(--luz-op))"/>`;
  s += shaft(1.4, 1.1) + shaft(3.2, 1.3) + shaft(5.4, 1.0);
  // POEIRA suspensa nos feixes (drift lento via CSS, morto no lite/reduced-motion)
  let dust = '';
  for (let i = 0; i < 26; i++) { const t = i / 26; const bx = 1.3 + t * 5.4 + ((i * 7) % 5) * 0.28; const by = 0.5 + ((i * 13) % 40) / 11; const p = iso(bx, by, 30 + ((i * 17) % 92)); const r = (0.6 + ((i * 11) % 7) / 10).toFixed(1); dust += `<circle class="poeira" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${r}" fill="rgba(255,235,200,.5)"/>`; }
  s += `<g style="opacity:calc(var(--fx) * var(--luz-op))">${dust}</g>`;
  // COVE quente no teto (separa parede de teto), subido pro pé-direito alto
  s += `<polygon points="${pts([iso(0, 0, WALL_H - 9), iso(GX, 0, WALL_H - 9), iso(GX, 0, WALL_H - 3), iso(0, 0, WALL_H - 3)])}" fill="rgba(255,214,170,.05)" style="opacity:var(--luz-op)"/>`;
  s += `<polygon points="${pts([iso(0, 0, WALL_H - 9), iso(0, GY, WALL_H - 9), iso(0, GY, WALL_H - 3), iso(0, 0, WALL_H - 3)])}" fill="rgba(255,214,170,.04)" style="opacity:var(--luz-op)"/>`;
  const pr = iso(3.9, 0, WALL_H - 16); s += `<g transform="translate(${pr.x},${pr.y}) skewY(${SK})"><text x="0" y="0" text-anchor="middle" font-size="8.5" fill="var(--cena-txt)" letter-spacing=".16em">RECEPÇÃO</text></g>`;
  // 2ª janela (retorno) — parede de fundo x24..28.5
  s += `<polygon points="${pts([iso(24.0, 0, 56), iso(28.5, 0, 56), iso(28.5, 0, 138), iso(24.0, 0, 138)])}" fill="url(#ceuGrad)" stroke="rgba(255,255,255,.18)" stroke-width="1.2"/>`;
  for (const [x, h, w] of [[24.3, 40, 0.6], [25.2, 58, 0.8], [26.3, 34, 0.6], [27.2, 50, 0.6], [28.0, 30, 0.5]]) s += `<polygon points="${pts([iso(x, 0, 56), iso(x + w, 0, 56), iso(x + w, 0, 56 + h), iso(x, 0, 56 + h)])}" fill="rgba(20,26,40,.9)"/>`;
  for (let i = 1; i < 3; i++) { const a = iso(24.0 + i * 1.5, 0, 56), b = iso(24.0 + i * 1.5, 0, 138); s += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="rgba(255,255,255,.2)" stroke-width="1.4"/>`; }
  s += `<polygon points="${pts([iso(24.0, 0), iso(28.5, 0), iso(28.9, 2.8), iso(23.8, 2.8)])}" fill="url(#luzJanela)"/>`;
  const pz = iso(26.25, 0, WALL_H - 20); s += `<g transform="translate(${pz.x},${pz.y}) skewY(${SK})"><text x="0" y="0" text-anchor="middle" font-size="7.5" fill="var(--cena-txt)" letter-spacing=".16em">RETORNO</text></g>`;
  // VIDEOWALL herói (matriz 4×2 de tiles, plano y=0, moldura escovada) — conteúdo vivo por renderCena()
  const wX0 = 11.0, wX1 = 19.0, wZ0 = 54, wZ1 = 156;
  const molduraQ = pts([iso(wX0, 0, wZ0 - 1.8), iso(wX1, 0, wZ0 - 1.8), iso(wX1, 0, wZ1 + 1.8), iso(wX0, 0, wZ1 + 1.8)]);
  s += `<polygon points="${molduraQ}" fill="#04060a" stroke="rgba(202,169,106,.5)" stroke-width="1.8"/>`;
  const colW = (wX1 - wX0) / 4, rowH = (wZ1 - wZ0) / 2;
  for (let cx = 0; cx < 4; cx++) for (let cy = 0; cy < 2; cy++) {
    const x0 = wX0 + cx * colW + 0.05, x1 = wX0 + (cx + 1) * colW - 0.05, z0 = wZ0 + cy * rowH + 0.6, z1 = wZ0 + (cy + 1) * rowH - 0.6;
    const quad = pts([iso(x0, 0, z0), iso(x1, 0, z0), iso(x1, 0, z1), iso(x0, 0, z1)]);
    s += `<polygon points="${quad}" fill="#070a10"/><polygon points="${quad}" fill="url(#telaGrad)" opacity=".45"/><polygon points="${quad}" fill="none" stroke="rgba(255,255,255,.07)"/>`;
  }
  // reflexo espelhado do videowall no piso polido logo à frente (estático)
  s += `<polygon points="${pts([iso(wX0, 0.05, 0), iso(wX1, 0.05, 0), iso(wX1, 3.4, 0), iso(wX0, 3.4, 0)])}" fill="url(#telaGrad)" opacity=".1" filter="url(#blurG)"/>`;
  s += `<polygon id="wall-borda" points="${molduraQ}" fill="none" stroke="var(--sala-ok)" stroke-width="2.6" opacity="0"/>`;
  s += `<polygon points="${molduraQ}" fill="none" stroke="rgba(var(--sala-ativo-rgb),.28)" stroke-width="1.4"/>`; // rim light azul constante
  s += `<g id="paredeChart"></g>`;
  // Marca ATENVO na parede esquerda (canto superior, perto da recepção)
  const pa = iso(0, 5.1, WALL_H - 44);
  s += `<polygon points="${pts([iso(0, 6.6, WALL_H - 52), iso(0, 3.6, WALL_H - 52), iso(0, 3.6, WALL_H - 26), iso(0, 6.6, WALL_H - 26)])}" fill="rgba(255,255,255,.04)" stroke="rgba(255,255,255,.12)"/>`;
  s += `<g transform="translate(${pa.x},${pa.y}) skewY(-${SK})"><text x="0" y="6" text-anchor="middle" font-size="16" font-weight="600" fill="var(--cena-txt)" letter-spacing=".04em">Atenvo</text></g>`;
  const pbm = iso(0, 4.6, WALL_H - 60); s += `<g transform="translate(${pbm.x},${pbm.y}) skewY(-${SK})"><text x="0" y="4" text-anchor="middle" font-size="9" fill="var(--cena-txt-soft)" letter-spacing=".14em">SALA SDR</text></g>`;
  // porta de ENTRADA na parede esquerda (y~9, alinhada ao PORTA/HALL)
  s += `<polygon points="${pts([iso(0, 8.4, 96), iso(0, 9.6, 96), iso(0, 9.6, 0), iso(0, 8.4, 0)])}" fill="#0a0d14" stroke="rgba(255,255,255,.14)"/>`;
  s += `<polygon points="${pts([iso(0, 8.45, 92), iso(0, 9.55, 92), iso(0, 9.55, 4), iso(0, 8.45, 4)])}" fill="rgba(var(--sala-ativo-rgb),.05)"/>`;
  s += `<polygon points="${pts([iso(0, 8.4, 96), iso(0, 9.6, 96), iso(0, 9.6, 86), iso(0, 8.4, 86)])}" fill="rgba(74,190,140,.22)"/><circle cx="${iso(0, 9.0, 91).x}" cy="${iso(0, 9.0, 91).y}" r="2" fill="var(--sala-ok)"/>`;
  const pl = iso(0, 9.0, 105); s += `<g transform="translate(${pl.x},${pl.y}) skewY(-${SK})"><text x="0" y="0" class="placa" text-anchor="middle">entrada</text></g>`;
  // KANBAN físico na parede esquerda (storytelling, plano x=0) — realocado p/ baixo (atrás da espera)
  s += `<polygon points="${pts([iso(0, 16.2, 46), iso(0, 20.0, 46), iso(0, 20.0, 98), iso(0, 16.2, 98)])}" fill="rgba(255,255,255,.045)" stroke="rgba(255,255,255,.14)"/>`;
  for (const yy of [17.47, 18.73]) { const a = iso(0, yy, 46), b = iso(0, yy, 98); s += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="rgba(255,255,255,.1)"/>`; }
  const stick = (yy: number, zz: number, c: string) => `<polygon points="${pts([iso(0, yy, zz), iso(0, yy + 0.28, zz), iso(0, yy + 0.28, zz + 5), iso(0, yy, zz + 5)])}" fill="${c}"/>`;
  s += stick(16.5, 88, 'rgba(var(--sala-triagem-rgb),.5)') + stick(16.5, 80, 'rgba(var(--sala-triagem-rgb),.4)') + stick(16.8, 71, 'rgba(var(--sala-triagem-rgb),.45)');
  s += stick(17.75, 90, 'rgba(var(--sala-ativo-rgb),.5)') + stick(17.75, 82, 'rgba(var(--sala-ativo-rgb),.4)');
  s += stick(19.0, 92, 'rgba(74,190,140,.5)') + stick(19.0, 84, 'rgba(74,190,140,.45)') + stick(19.3, 75, 'rgba(74,190,140,.4)');
  for (const [yy, txt] of [[16.85, 'A TRABALHAR'], [18.1, 'EM CONVERSA'], [19.35, 'FECHADO']] as [number, string][]) { const p = iso(0, yy, 96); s += `<g transform="translate(${p.x},${p.y}) skewY(-${SK})"><text x="0" y="0" font-size="4.4" fill="rgba(255,255,255,.4)" letter-spacing=".08em">${txt}</text></g>`; }
  for (const [x, y, rx, ry] of [[15.0, 4.0, 220, 100], [15.0, 9.0, 220, 100], [4.9, 17.0, 190, 88], [5.9, 12.4, 150, 70], [20.0, 18.3, 170, 80], [25.5, 13.0, 150, 72]]) s += `<ellipse cx="${iso(x, y).x}" cy="${iso(x, y).y}" rx="${rx}" ry="${ry}" fill="url(#luzSoft)"/>`;
  // ---- SALINHA ANEXA (PERDIDOS): fora do quadrado principal, na margem esquerda ----
  {
    const { x0, x1, y0, y1, wallH } = ANEXO_PERD;
    const cxm = (x0 + x1) / 2, cym = (y0 + y1) / 2;
    s += `<ellipse cx="${iso(cxm, cym).x}" cy="${iso(cxm, cym).y}" rx="155" ry="72" fill="url(#sombraSoft)"/>`;
    s += `<polygon points="${pts([iso(x0, y0), iso(x1, y0), iso(x1, y1), iso(x0, y1)])}" fill="var(--cena-piso2)" stroke="var(--cena-linha)" stroke-width="1"/>`;
    for (let x = x0 + 1.6; x < x1; x += 1.6) s += `<line x1="${iso(x, y0).x}" y1="${iso(x, y0).y}" x2="${iso(x, y1).x}" y2="${iso(x, y1).y}" stroke="var(--cena-linha)"/>`;
    for (let y = y0 + 2.1; y < y1; y += 2.1) s += `<line x1="${iso(x0, y).x}" y1="${iso(x0, y).y}" x2="${iso(x1, y).x}" y2="${iso(x1, y).y}" stroke="var(--cena-linha)"/>`;
    s += `<polygon points="${pts([iso(x0, y0, wallH), iso(x1, y0, wallH), iso(x1, y0, 0), iso(x0, y0, 0)])}" fill="url(#paredeFGrad)"/>`;
    s += `<polygon points="${pts([iso(x0, y0, wallH), iso(x0, y1, wallH), iso(x0, y1, 0), iso(x0, y0, 0)])}" fill="url(#paredeLGrad)"/>`;
    s += `<polygon points="${pts([iso(x0, y0, 6), iso(x1, y0, 6), iso(x1, y0, 0), iso(x0, y0, 0)])}" fill="var(--cena-sombra-parede)"/><polygon points="${pts([iso(x0, y0, 6), iso(x0, y1, 6), iso(x0, y1, 0), iso(x0, y0, 0)])}" fill="var(--cena-sombra-parede)"/>`;
    // faixa rubro (identidade "perdido") na parede do fundo
    s += `<polygon points="${pts([iso(x0, y0, wallH - 5), iso(x1, y0, wallH - 5), iso(x1, y0, wallH - 9), iso(x0, y0, wallH - 9)])}" fill="rgba(229,102,92,.28)"/>`;
    s += textoChao(cxm, cym - 0.2, 'PERDIDOS', 9, 'rgba(229,102,92,.55)');
    const pw = iso(cxm, y0, wallH - 18); s += `<g transform="translate(${pw.x},${pw.y}) skewY(${SK})"><text x="0" y="0" text-anchor="middle" font-size="8" fill="var(--cena-txt)" letter-spacing=".14em">SALA · PERDIDOS</text></g>`;
  }
  return s;
}

/* Letreiros das zonas: PÍLULAS HORIZONTAIS (sem skew) flutuando ACIMA de cada zona,
   desenhadas por cima de tudo (#letreiros, após a vinheta) → sempre legíveis, nunca
   cortadas nem cobertas por móvel/boneco. Substituem os rótulos de chão skewados e as
   placas suspensas (que ficavam ilegíveis/cortadas). */
function letreiros(): string {
  // [cx, cy, z, título, cor, subtítulo?]
  const Z: [number, number, number, string, string, string?][] = [
    [3.9, 1.0, 128, 'RECEPÇÃO', 'var(--cena-txt)'],
    [14.0, 4.5, 138, 'EQUIPE SDR', 'var(--sala-ativo)'],
    [25.5, 2.2, 112, 'AGUARDANDO CLIENTE', '#9aa6bb', 'retorno do cliente'],
    [5.9, 11.4, 96, 'SEM RESPOSTA', '#e5665c'],
    [2.0, 10.6, 104, 'NÃO-TRABALHÁVEIS', '#a0aab6'],
    [4.9, 15.0, 96, 'AGUARDANDO ATENDENTE', '#d9a44a'],
    [4.4, 17.8, 80, 'REMARKETING', 'var(--sala-triagem)'],
    [25.5, 11.2, 100, 'DOCUMENTAÇÃO', 'var(--sala-ok)', 'envio de documentos'],
    [20.0, 16.6, 92, 'ASSINATURA', 'var(--sala-ok)', 'aguardando assinatura'],
    [11.5, 17.2, 78, 'CONVÍVIO', '#c9a86a'],
  ];
  let s = '';
  for (const [cx, cy, z, txt, cor, sub] of Z) {
    const p = iso(cx, cy, z);
    const w = Math.max(txt.length * 6.2 + 22, sub ? String(sub).length * 4.1 + 22 : 0);
    const h = sub ? 25 : 17;
    s += `<g transform="translate(${p.x.toFixed(1)},${p.y.toFixed(1)})">` +
      `<rect x="${(-w / 2).toFixed(1)}" y="${(-h / 2).toFixed(1)}" width="${w.toFixed(1)}" height="${h}" rx="${(h / 2).toFixed(1)}" fill="rgba(9,12,18,.88)" stroke="${cor}" stroke-opacity=".6" stroke-width="1"/>` +
      `<rect x="${(-w / 2 + 5).toFixed(1)}" y="${sub ? -6.5 : -3}" width="2.6" height="${sub ? 13 : 6}" rx="1.3" fill="${cor}"/>` +
      `<text x="0" y="${sub ? -1.5 : 3.3}" text-anchor="middle" font-size="9.5" font-weight="700" letter-spacing=".03em" fill="${cor}">${txt}</text>` +
      (sub ? `<text x="0" y="8" text-anchor="middle" font-size="6" letter-spacing=".02em" fill="var(--cena-txt-soft)">${sub}</text>` : '') +
      `</g>`;
  }
  return s;
}

const badgeHTML = `<g class="badge" transform="translate(0,-92)" opacity="0"><rect x="-34" y="-9" width="68" height="18" rx="9"/><text text-anchor="middle" y="4"></text></g>`;

function montarMoveis(cam: Camada): void {
  const A = (d: number, html: string, extra?: AddOpts) => cam.addItem(d, html, extra);
  // ---- RECEPÇÃO (banda fundo-esq) ----
  A(3.3 + 0.35 - 0.02, cadeira(3.3, 0.35));
  const pb = iso(3.9, 0.9); A(3.9 + 0.9, botPixelSVG() + badgeHTML, { id: 'p-bot', cls: 'p', attrs: { transform: `translate(${pb.x},${pb.y})`, 'data-id': 'bot', tabindex: '0', role: 'button', 'aria-label': BOT.nome } });
  A(3.9 + 1.75, mesa(1.2, 1.2, 5.2, 'Recepção') + boxZ(1.2, 1.98, 24, 5.2, 0.16, 12, '#f3f5f8', '#c5ccd7', '#d9dee7') + `<polygon points="${pts([iso(1.3, 2.1, 22), iso(6.3, 2.1, 22), iso(6.3, 2.1, 20), iso(1.3, 2.1, 20)])}" fill="rgba(var(--sala-ativo-rgb),.55)" filter="url(#blur)"/>` + monitor(1.7, 1.42, 28, 0.75, true) + monitor(2.9, 1.42, 28, 0.75) + monitor(4.1, 1.42, 28, 0.75, true) + monitor(5.25, 1.42, 28, 0.75, true) + flat(2.2, 1.78, 28.5, 0.55, 0.2, '#3a4356') + flat(3.45, 1.8, 28.5, 0.55, 0.2, '#3a4356') + flat(4.6, 1.78, 28.5, 0.55, 0.2, '#3a4356') + planta(1.45, 1.35, 0.4, 28, 1), { id: 'mesa-bot' });
  // divisória de vidro (recepção ↔ open-space), x=7.6, y0.6..6.4
  { const gx = 7.6, ya = 0.6, yb = 6.4, gz = 78;
    const g1 = iso(gx, ya, 0), g2 = iso(gx, yb, 0), g3 = iso(gx, yb, gz), g4 = iso(gx, ya, gz);
    A(gx + yb - 0.3, `<polygon points="${pts([g1, g2, g3, g4])}" fill="rgba(var(--sala-ativo-rgb),.06)" stroke="rgba(255,255,255,.22)"/><polygon points="${pts([iso(gx, ya, gz - 4), iso(gx, yb, gz - 4), iso(gx, yb, gz), iso(gx, ya, gz)])}" fill="rgba(255,255,255,.22)"/><polygon points="${pts([iso(gx, ya, 40), iso(gx, yb, 40), iso(gx, yb, 41), iso(gx, ya, 41)])}" fill="rgba(255,255,255,.14)"/><line x1="${g1.x}" y1="${g1.y}" x2="${g4.x}" y2="${g4.y}" stroke="rgba(255,255,255,.3)"/><line x1="${g2.x}" y1="${g2.y}" x2="${g3.x}" y2="${g3.y}" stroke="rgba(255,255,255,.3)"/>`);
    A(gx + yb - 0.29, `<polygon points="${pts([iso(gx, ya, 2), iso(gx, yb, 2), iso(gx, yb, 4.5), iso(gx, ya, 4.5)])}" fill="rgba(var(--sala-ativo-rgb),.2)"/>`, { attrs: { 'pointer-events': 'none' } });
  }
  // ---- EQUIPE SDR: mesas (posição via config), nameplate escovado, LED occ, pendente frio ----
  for (const a of ATENDENTES) {
    const { x, y } = a.desk; const pp = iso(x + 1, y - 0.35);
    A(x + 1 + y - 0.35 - 0.02, cadeira(x + 0.6, y - 0.8));
    A(x + 1 + y - 0.35, bonecoPixelSVG(a.look as never, 'sentado') + badgeHTML, { id: 'p-' + a.id, cls: 'p', attrs: { transform: `translate(${pp.x},${pp.y})`, 'data-id': a.id, tabindex: '0', role: 'button', 'aria-label': a.nome } });
    const occ = flat(x + 0.28, y + 0.1, 28.4, 1.5, 0.05, 'var(--sala-espera)', `id="occ-${a.id}"`);
    const plate = ripasEscovado(x + 0.42, y + 0.9, 4.5, 1.16, 3) + `<polygon points="${pts([iso(x + 0.42, y + 0.9, 7.2), iso(x + 1.58, y + 0.9, 7.2), iso(x + 1.58, y + 0.9, 7.6), iso(x + 0.42, y + 0.9, 7.6)])}" fill="${a.acento}"/>`;
    A(x + 1 + y + 0.45, mesa(x, y, 2, a.nome, 'dot-' + a.id) + occ + `<g id="mon-${a.id}">${monitor(x + 0.35, y + 0.18, 28, 0.78)}${monitor(x + 1.2, y + 0.18, 28, 0.55, true)}</g>` + acessorios(x, y, a.extra) + plate, { id: 'mesa-' + a.id });
    A(a.visita[0] + a.visita[1] - 0.02, cadeiraVisita(a.visita[0], a.visita[1]));
    const cx = x + 0.5, cy = y + 0.1;
    const l1a = iso(cx - 0.35, cy, 104), l1b = iso(cx - 0.35, cy, 118), l2a = iso(cx + 0.35, cy, 104), l2b = iso(cx + 0.35, cy, 118), halo = iso(cx, cy, 104);
    A(cx + cy - 3, `<line x1="${l1a.x}" y1="${l1a.y}" x2="${l1b.x}" y2="${l1b.y}" stroke="rgba(255,255,255,.1)" stroke-width="1.1"/><line x1="${l2a.x}" y1="${l2a.y}" x2="${l2b.x}" y2="${l2b.y}" stroke="rgba(255,255,255,.1)" stroke-width="1.1"/>` + flat(cx - 0.75, cy - 0.28, 104, 1.5, 0.56, 'rgba(var(--sala-ativo-rgb),.16)') + `<ellipse cx="${halo.x}" cy="${halo.y + 10}" rx="40" ry="17" fill="url(#luzSoft)"/>`, { attrs: { 'pointer-events': 'none' } });
  }
  // ---- ESPERA / AGUARDANDO ATENDENTE (banda frontal-esq): poltronas via ZONAS + console ----
  ZONAS.espera.assentos.forEach(([x, y]) => A(x + y - 0.02, poltrona(x, y)));
  A(4.9 + 14.35, boxZ(4.0, 14.35, 0, 2.2, 0.7, 12, '#3a4356', '#262e3f', '#2f3849') + flat(4.2, 14.47, 12.5, 0.5, 0.36, '#eceff4') + flat(4.25, 14.51, 12.8, 0.4, 0.28, 'var(--sala-ativo)') + flat(4.85, 14.45, 12.5, 0.45, 0.4, 'var(--ambar)') + boxZ(5.6, 14.55, 12, 0.18, 0.18, 6, '#e9edf3', '#bfc6d2', '#d3d9e3') + planta(5.45, 14.4, 0.32, 12, 1));
  A(1.0 + 15.2, bebedouro(1.0, 15.2));
  // ---- NÃO-TRABALHÁVEIS (alcova de vidro baixa, parede esq): estante + cadeiras + vidro ----
  A(0.55 + 12.9, boxZ(0.35, 10.7, 0, 0.35, 2.2, 78, '#2b3245', '#232a3b', '#20273a') + `<polygon points="${pts([iso(0.72, 10.75, 68), iso(0.72, 12.85, 68), iso(0.72, 12.85, 64), iso(0.72, 10.75, 64)])}" fill="rgba(255,255,255,.05)"/><polygon points="${pts([iso(0.72, 10.75, 46), iso(0.72, 12.85, 46), iso(0.72, 12.85, 42), iso(0.72, 10.75, 42)])}" fill="rgba(255,255,255,.05)"/><polygon points="${pts([iso(0.72, 10.75, 24), iso(0.72, 12.85, 24), iso(0.72, 12.85, 20), iso(0.72, 10.75, 20)])}" fill="rgba(255,255,255,.05)"/>` + flat(0.4, 10.9, 64.2, 0.28, 0.5, '#e2503c') + flat(0.4, 11.6, 64.2, 0.28, 0.5, 'var(--ambar)') + flat(0.4, 12.3, 64.2, 0.28, 0.5, '#8a94a6') + flat(0.4, 11.0, 42.2, 0.28, 0.5, '#8a94a6') + flat(0.4, 11.8, 42.2, 0.28, 0.5, '#e2503c'));
  ZONAS.nao_legivel.assentos.forEach(([x, y]) => A(x + y - 0.02, cadeiraVisita(x, y)));
  ZONAS.perdidos.assentos.forEach(([x, y]) => A(x + y - 0.02, cadeiraVisita(x, y)));
  { const dz = 34; const p1 = iso(3.0, 10.5, 0), p2 = iso(3.0, 13.5, 0), p3 = iso(3.0, 13.5, dz), p4 = iso(3.0, 10.5, dz);
    A(3.0 + 13.5 - 0.3, `<polygon points="${pts([p1, p2, p3, p4])}" fill="rgba(138,148,166,.05)" stroke="rgba(255,255,255,.16)"/><polygon points="${pts([iso(3.0, 10.5, dz - 3), iso(3.0, 13.5, dz - 3), iso(3.0, 13.5, dz), iso(3.0, 10.5, dz)])}" fill="rgba(255,255,255,.16)"/><polygon points="${pts([iso(1.0, 13.5, 0), iso(3.0, 13.5, 0), iso(3.0, 13.5, dz), iso(1.0, 13.5, dz)])}" fill="rgba(255,255,255,.03)" stroke="rgba(255,255,255,.12)"/>`, { attrs: { 'pointer-events': 'none' } });
  }
  // ---- REMARKETING (banda frontal-esq, abaixo da espera): bancos ----
  const banco = (x: number, y: number, w: number) => boxZ(x, y, 0, w, 0.55, 13, '#3f4c68', '#2c3550', '#354060') + flat(x + 0.06, y + 0.07, 13.3, w - 0.12, 0.4, 'rgba(255,255,255,.07)');
  A(3.45 + 18.95, banco(2.6, 18.4, 1.7));
  A(5.65 + 18.95, banco(4.8, 18.4, 1.7));
  // ---- CONVÍVIO/CAFÉ (x9..14 y17..20): café mármore + banquetas (só ambiente) ----
  A(11.1 + 18.05, box(9.8, 17.6, 2.6, 0.9, 30, '#d8dde5', '#9aa3b2', '#b5bcc9') + `<ellipse cx="${iso(10.5, 17.9, 30).x}" cy="${iso(10.5, 17.9, 30).y}" rx="30" ry="12" fill="rgba(255,255,255,.05)"/><ellipse cx="${iso(11.6, 18.2, 30).x}" cy="${iso(11.6, 18.2, 30).y}" rx="18" ry="7" fill="rgba(255,255,255,.06)"/>` + boxZ(10.3, 17.75, 30, 0.5, 0.55, 16, '#2b3245', '#1e2536', '#242c3e') + flat(10.35, 17.8, 46.2, 0.2, 0.18, '#e2503c') + `<circle class="led-cafe" cx="${iso(10.55, 17.78, 44).x}" cy="${iso(10.55, 17.78, 44).y}" r="1.7" fill="var(--ambar)"/>` + boxZ(11.1, 17.85, 30, 0.18, 0.18, 6, '#e9edf3', '#bfc6d2', '#d3d9e3') + boxZ(11.4, 17.85, 30, 0.18, 0.18, 6, '#e9edf3', '#bfc6d2', '#d3d9e3') + flat(9.95, 17.95, 30.2, 0.3, 0.3, '#3a4356'));
  A(12.9 + 18.6, boxZ(12.6, 18.3, 0, 0.6, 0.6, 15, '#3f4c68', '#2c3550', '#354060') + boxZ(13.4, 18.5, 0, 0.6, 0.6, 15, '#3f4c68', '#2c3550', '#354060'));
  // ---- ASSINATURA (cubo de vidro, mesaRedonda 20,18.3) ----
  { const cb = iso(20.0, 18.3, 0.2); A(20.0 + 18.3 - 0.6, `<ellipse class="bloom-assina" cx="${cb.x}" cy="${cb.y}" rx="80" ry="38" fill="url(#bloomAssina)" opacity=".45"/><g id="anel-assinatura" opacity="0"><ellipse cx="${cb.x}" cy="${cb.y}" rx="58" ry="28" fill="none" stroke="var(--sala-ok)" stroke-width="2.2"/><ellipse cx="${cb.x}" cy="${cb.y}" rx="70" ry="34" fill="none" stroke="var(--sala-ok)" stroke-width="1.2" opacity=".6"/></g>`, { attrs: { 'pointer-events': 'none' } }); }
  A(20.0 + 18.3, mesaRedonda(20.0, 18.3));
  ZONAS.assinatura.assentos.forEach(([x, y]) => A(x + y - 0.02, cadeiraVisita(x, y)));
  // cubo de vidro em 3 lados (fundo y16.5, esq x17, dir x23) — vidro médio (não enterra os bonecos)
  { const gh = 52, xa = 17, xb = 23, ya = 16.5, yb = 20.5;
    const glassY = (yy: number, x0: number, x1: number) => `<polygon points="${pts([iso(x0, yy, 0), iso(x1, yy, 0), iso(x1, yy, gh), iso(x0, yy, gh)])}" fill="rgba(74,190,140,.05)" stroke="rgba(180,240,210,.24)"/><polygon points="${pts([iso(x0, yy, gh - 3), iso(x1, yy, gh - 3), iso(x1, yy, gh), iso(x0, yy, gh)])}" fill="rgba(255,255,255,.2)"/><polygon points="${pts([iso(x0, yy, 2), iso(x1, yy, 2), iso(x1, yy, 4), iso(x0, yy, 4)])}" fill="rgba(74,190,140,.25)"/>`;
    const glassX = (xx: number, y0: number, y1: number) => `<polygon points="${pts([iso(xx, y0, 0), iso(xx, y1, 0), iso(xx, y1, gh), iso(xx, y0, gh)])}" fill="rgba(74,190,140,.045)" stroke="rgba(180,240,210,.2)"/><polygon points="${pts([iso(xx, y0, gh - 3), iso(xx, y1, gh - 3), iso(xx, y1, gh), iso(xx, y0, gh)])}" fill="rgba(255,255,255,.18)"/><polygon points="${pts([iso(xx, y0, 2), iso(xx, y1, 2), iso(xx, y1, 4), iso(xx, y0, 4)])}" fill="rgba(74,190,140,.22)"/>`;
    A(xa + ya, glassY(ya, xa, xb), { attrs: { 'pointer-events': 'none' } });        // fundo (depth baixo → atrás)
    A(xa + yb, glassX(xa, ya, yb), { attrs: { 'pointer-events': 'none' } });        // esquerda
    A(xb + yb, glassX(xb, ya, yb), { attrs: { 'pointer-events': 'none' } });        // direita
  }
  // ---- SEM_RESPOSTA (banda meio-esq): mesa alta (5.9,12.4) ----
  { const c = iso(5.9, 12.4); A(5.9 + 12.4, `<g><ellipse cx="${c.x}" cy="${c.y}" rx="18" ry="9" fill="rgba(0,0,0,.3)"/><rect x="${c.x - 2.5}" y="${c.y - 40}" width="5" height="40" fill="#3a4356"/><ellipse cx="${c.x}" cy="${c.y - 2}" rx="8" ry="4" fill="#2a3244"/><ellipse cx="${c.x}" cy="${c.y - 40}" rx="19" ry="9.5" fill="#8f99a8"/><ellipse cx="${c.x}" cy="${c.y - 42}" rx="19" ry="9.5" fill="#d8dde5"/></g>`); }
  // ---- RETORNO (banda fundo-dir): sofá longo (23.6,2.42,w3.1) + mesinha ----
  A(25.15 + 2.5 - 0.04, box(23.6, 2.22, 3.1, 0.2, 26, '#46597f', '#2f3d5c', '#38496c') + boxZ(23.6, 2.42, 0, 3.1, 0.6, 13, '#4d6289', '#33436a', '#3c4f78') + flat(23.7, 2.48, 13.5, 2.9, 0.46, 'rgba(255,255,255,.07)') + boxZ(23.52, 2.4, 13, 0.1, 0.6, 7, '#46597f', '#2f3d5c', '#38496c') + boxZ(26.68, 2.4, 13, 0.1, 0.6, 7, '#46597f', '#2f3d5c', '#38496c'));
  A(25.35 + 3.95, boxZ(24.5, 3.75, 0, 1.7, 0.5, 11, '#3a4356', '#262e3f', '#2f3849') + flat(24.65, 3.85, 11.5, 0.5, 0.3, '#eceff4') + boxZ(25.7, 3.88, 11, 0.17, 0.17, 6, '#e9edf3', '#bfc6d2', '#d3d9e3'));
  // ---- DOCUMENTAÇÃO (banda meio-dir): balcão scanner/bandejas/arquivo (23.5,10.4) ----
  A(24.8 + 11.3, mesa(23.5, 10.4, 2.6, 'Documentação') + boxZ(23.65, 10.55, 28, 0.7, 0.55, 9, '#2b3245', '#1e2536', '#242c3e') + flat(23.72, 10.6, 37.2, 0.5, 0.38, 'var(--sala-ativo)') + flat(24.6, 10.65, 28.5, 0.55, 0.4, '#eef1f5') + flat(24.65, 10.7, 31, 0.45, 0.3, '#dfe4ec') + flat(24.7, 10.75, 33.5, 0.35, 0.22, '#eef1f5') + boxZ(25.45, 10.6, 28, 0.45, 0.45, 4, '#e2503c', '#a83a2b', '#c4442f') + boxZ(25.45, 10.6, 32, 0.45, 0.45, 4, 'var(--ambar)', '#b8964a', '#d4b05a'));
  A(26.1 + 11.15, box(25.7, 10.7, 0.8, 0.8, 46, '#3a4356', '#262e3f', '#2f3849') + `<polygon points="${pts([iso(25.75, 11.5, 42), iso(26.45, 11.5, 42), iso(26.45, 11.5, 40), iso(25.75, 11.5, 40)])}" fill="rgba(255,255,255,.2)"/><polygon points="${pts([iso(25.75, 11.5, 28), iso(26.45, 11.5, 28), iso(26.45, 11.5, 26), iso(25.75, 11.5, 26)])}" fill="rgba(255,255,255,.2)"/><polygon points="${pts([iso(25.75, 11.5, 14), iso(26.45, 11.5, 14), iso(26.45, 11.5, 12), iso(25.75, 11.5, 12)])}" fill="rgba(255,255,255,.2)"/>`);
  ZONAS.documentacao.assentos.forEach(([x, y]) => A(x + y - 0.02, cadeiraVisita(x, y)));
  // (rótulos de zona agora são PÍLULAS HORIZONTAIS flutuantes em letreiros() — legíveis, nunca cortadas)
  // ---- plantas statement nos cantos de corredor (grade 30×21) ----
  const cachepo = (x: number, y: number, esc: number) => box(x - 0.22, y - 0.22, 0.44, 0.44, 24, '#c5ccd7', '#8f99a8', '#a1a8b5') + planta(x, y, esc, 24, 1);
  A(8.9 + 15.6, planta(8.9, 15.6, 1.7, 0, 0) + planta(9.15, 15.78, 1.3, 0, 1));
  A(16.6 + 15.4, cachepo(16.6, 15.4, 1.2));
  for (const [x, y, e] of [[9.0, 0.6, 1.15], [29.0, 0.6, 1.05], [0.7, 20.2, 1.0], [29.2, 15.0, 1.0], [8.6, 9.6, 0.95], [21.8, 9.6, 0.95]]) A(x + y, cachepo(x, y, e));
  cam.reordenar();
}

export { iso, pts, VB, type Pt };
