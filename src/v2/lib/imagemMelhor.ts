/* Melhoria de imagem recebida, feita no navegador (nada vai pra servidor; o ORIGINAL nunca é tocado).
   Só tratamento CLÁSSICO — realça o que a câmera captou, não inventa pixel:
     · 'foto'      → níveis automáticos (preto/branco), balanço de branco contido, clareia foto escura,
                     nitidez leve só na luminância (sem acentuar ruído de JPEG)
     · 'documento' → corrige a ILUMINAÇÃO do papel (sombra, vinheta, foto escura) com o mesmo fator
                     nos 3 canais — as cores do documento (fundo de segurança, carimbo, caneta)
                     ficam como estão; aprofunda o preto da tinta + nitidez leve
   Proibido aqui: super-resolução por IA / "desembaçar" generativo — troca dígito em documento.
   A ampliação de imagem pequena é interpolação comum (bicúbica do navegador), não gera detalhe. */

export type ModoImagem = 'original' | 'foto' | 'documento';

const LADO_MIN = 1600;   // imagem menor que isso é ampliada (só interpolação) pra leitura confortável
const LADO_MAX = 2600;   // teto de memória/tempo no navegador

export function carregarImagem(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';         // URL assinada do Storage: precisa de CORS p/ ler os pixels
    img.onload = () => res(img);
    img.onerror = () => rej(new Error('Não foi possível abrir a imagem.'));
    img.src = src;
  });
}

function desenhar(img: HTMLImageElement): { cv: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const lado = Math.max(img.naturalWidth, img.naturalHeight);
  const esc = lado < LADO_MIN ? LADO_MIN / lado : lado > LADO_MAX ? LADO_MAX / lado : 1;
  const cv = document.createElement('canvas');
  cv.width = Math.round(img.naturalWidth * esc); cv.height = Math.round(img.naturalHeight * esc);
  const ctx = cv.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, cv.width, cv.height);
  return { cv, ctx };
}

const lum = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;
const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);

/** percentil de um histograma de 256 posições. */
function percentil(h: Uint32Array, total: number, p: number): number {
  const alvo = total * p; let acc = 0;
  for (let i = 0; i < 256; i++) { acc += h[i]; if (acc >= alvo) return i; }
  return 255;
}

/** desfoque de caixa separável (raio r) em um canal float — base da nitidez e da estimativa de fundo. */
function desfoqueCaixa(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const tmp = new Float32Array(src.length), out = new Float32Array(src.length);
  const d = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    let s = 0; const o = y * w;
    for (let x = -r; x <= r; x++) s += src[o + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) {
      tmp[o + x] = s / d;
      s += src[o + Math.min(w - 1, x + r + 1)] - src[o + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < w; x++) {
    let s = 0;
    for (let y = -r; y <= r; y++) s += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = s / d;
      s += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
    }
  }
  return out;
}

/** nitidez (máscara de desfoque) aplicada na luminância e somada igual nos 3 canais — não cria franja de cor.
 *  limiar ignora a "granulação" do JPEG pra não virar chiado. */
function nitidez(px: Uint8ClampedArray, w: number, h: number, intensidade: number, raio: number, limiar: number) {
  const L = new Float32Array(w * h);
  for (let i = 0, j = 0; i < L.length; i++, j += 4) L[i] = lum(px[j], px[j + 1], px[j + 2]);
  const B = desfoqueCaixa(desfoqueCaixa(L, w, h, raio), w, h, raio); // 2 passadas ≈ gaussiano
  for (let i = 0, j = 0; i < L.length; i++, j += 4) {
    const d = L[i] - B[i];
    if (Math.abs(d) < limiar) continue;
    const a = d * intensidade;
    px[j] = clamp(px[j] + a); px[j + 1] = clamp(px[j + 1] + a); px[j + 2] = clamp(px[j + 2] + a);
  }
}

function melhorarFoto(px: Uint8ClampedArray, w: number, h: number) {
  const n = w * h;
  const hr = new Uint32Array(256), hg = new Uint32Array(256), hb = new Uint32Array(256), hl = new Uint32Array(256);
  for (let j = 0; j < px.length; j += 4) { hr[px[j]]++; hg[px[j + 1]]++; hb[px[j + 2]]++; hl[Math.round(lum(px[j], px[j + 1], px[j + 2]))]++; }
  // balanço de branco contido: o "branco" de cada canal (p99) puxado pro mesmo nível, no máx. ±20%
  const wr = percentil(hr, n, 0.99), wg = percentil(hg, n, 0.99), wb = percentil(hb, n, 0.99);
  const ref = Math.max(wr, wg, wb);
  const lim = (x: number) => Math.min(1.2, Math.max(0.85, x));
  const fr = lim(ref / Math.max(1, wr)), fg = lim(ref / Math.max(1, wg)), fb = lim(ref / Math.max(1, wb));
  // níveis: preto em p0.5, branco em p99.5 (esticamento limitado a 2,2× pra não estourar)
  let lo = percentil(hl, n, 0.005), hi = percentil(hl, n, 0.995);
  if (hi - lo < 255 / 2.2) { const meio = (hi + lo) / 2; lo = Math.max(0, meio - 255 / 4.4); hi = Math.min(255, meio + 255 / 4.4); }
  const esc = 255 / Math.max(1, hi - lo);
  // foto escura: gama pra levar a média pra ~0,47
  let soma = 0; for (let i = 0; i < 256; i++) soma += hl[i] * Math.min(1, Math.max(0, (i - lo) * esc / 255));
  const media = soma / n;
  const gama = media > 0.05 && media < 0.42 ? Math.max(0.6, Math.log(0.47) / Math.log(media)) : 1;
  const lut = new Uint8ClampedArray(256);
  for (let i = 0; i < 256; i++) lut[i] = 255 * Math.pow(Math.min(1, Math.max(0, (i - lo) * esc / 255)), gama);
  for (let j = 0; j < px.length; j += 4) {
    px[j] = lut[clamp(Math.round(px[j] * fr))]; px[j + 1] = lut[clamp(Math.round(px[j + 1] * fg))]; px[j + 2] = lut[clamp(Math.round(px[j + 2] * fb))];
  }
  nitidez(px, w, h, 0.6, Math.max(1, Math.round(Math.max(w, h) / 1600)), 5);
}

function melhorarDocumento(px: Uint8ClampedArray, w: number, h: number) {
  // Corrige a ILUMINAÇÃO, não a cor: estima só o brilho do papel em cada região (sombra, vinheta,
  // flash) e iguala. Cada canal é multiplicado pelo MESMO fator → fundo de segurança, holograma,
  // brasão e carimbo mantêm a cor. (A 1ª versão dividia cor por cor e levava tudo a branco puro:
  // apagou o fundo da CNH no 1º teste real, 06/10.)
  const bloco = Math.max(8, Math.round(Math.max(w, h) / 48));
  const bw = Math.ceil(w / bloco), bh = Math.ceil(h / bloco);
  const fundo = new Float32Array(bw * bh);
  for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
    // brilho do papel no bloco = média dos 10% mais claros (a tinta é escura e some)
    const lums: number[] = [];
    for (let y = by * bloco; y < Math.min(h, (by + 1) * bloco); y += 2) for (let x = bx * bloco; x < Math.min(w, (bx + 1) * bloco); x += 2) {
      const j = (y * w + x) * 4; lums.push(lum(px[j], px[j + 1], px[j + 2]));
    }
    lums.sort((a, b) => b - a);
    const k = Math.max(1, Math.round(lums.length * 0.1)); let s = 0; for (let q = 0; q < k; q++) s += lums[q];
    fundo[by * bw + bx] = s / k;
  }
  const suave = desfoqueCaixa(desfoqueCaixa(fundo, bw, bh, 1), bw, bh, 1);
  const ord = Array.from(suave).sort((a, b) => a - b);
  const papel = Math.max(1, ord[Math.floor(ord.length * 0.75)]);
  const ALVO = 238;
  const fatorGlobal = Math.min(1.6, Math.max(1, ALVO / papel));
  // região larga bem mais escura que o papel (mesa, roupa) não é papel: recebe só o fator global
  const raio = Math.max(3, Math.round(bloco / 4));
  const Lreg = desfoqueCaixa(desfoqueCaixa(new Float32Array(w * h).map((_, i) => lum(px[i * 4], px[i * 4 + 1], px[i * 4 + 2])), w, h, raio), w, h, raio);
  const amostra = (fx: number, fy: number) => {
    const x0 = Math.max(0, Math.min(bw - 1, Math.floor(fx))), y0 = Math.max(0, Math.min(bh - 1, Math.floor(fy)));
    const x1 = Math.min(bw - 1, x0 + 1), y1 = Math.min(bh - 1, y0 + 1);
    const tx = Math.max(0, Math.min(1, fx - x0)), ty = Math.max(0, Math.min(1, fy - y0));
    return (suave[y0 * bw + x0] * (1 - tx) + suave[y0 * bw + x1] * tx) * (1 - ty) + (suave[y1 * bw + x0] * (1 - tx) + suave[y1 * bw + x1] * tx) * ty;
  };
  for (let y = 0; y < h; y++) {
    const fy = (y + 0.5) / bloco - 0.5;
    for (let x = 0; x < w; x++) {
      const i = y * w + x, j = i * 4;
      const t = Math.min(1, Math.max(0, (Lreg[i] / papel - 0.45) / 0.2)); const peso = t * t * (3 - 2 * t);
      const local = Math.min(1.8, Math.max(0.85, ALVO / Math.max(1, amostra((x + 0.5) / bloco - 0.5, fy))));
      const f = local * peso + fatorGlobal * (1 - peso);
      px[j] = clamp(px[j] * f); px[j + 1] = clamp(px[j + 1] * f); px[j + 2] = clamp(px[j + 2] * f);
    }
  }
  // luz amarelada/azulada: puxa o "branco" (p99 de cada canal) pro neutro, no máx. ±12% — contido
  // de propósito pra não tingir documento colorido
  const hr = new Uint32Array(256), hg = new Uint32Array(256), hb = new Uint32Array(256), hl = new Uint32Array(256);
  for (let j = 0; j < px.length; j += 4) { hr[px[j]]++; hg[px[j + 1]]++; hb[px[j + 2]]++; }
  const n = w * h, wr = percentil(hr, n, 0.99), wg = percentil(hg, n, 0.99), wb = percentil(hb, n, 0.99), ref = Math.max(wr, wg, wb);
  const lim = (x: number) => Math.min(1.12, Math.max(0.9, x));
  const fr = lim(ref / Math.max(1, wr)), fg = lim(ref / Math.max(1, wg)), fb = lim(ref / Math.max(1, wb));
  for (let j = 0; j < px.length; j += 4) { px[j] = clamp(px[j] * fr); px[j + 1] = clamp(px[j + 1] * fg); px[j + 2] = clamp(px[j + 2] * fb); }
  // tinta mais firme: só aprofunda o preto (o branco já foi resolvido acima, sem estourar)
  for (let j = 0; j < px.length; j += 4) hl[Math.round(lum(px[j], px[j + 1], px[j + 2]))]++;
  const lo = Math.min(50, percentil(hl, w * h, 0.01));
  if (lo > 4) {
    const lut = new Uint8ClampedArray(256);
    for (let v = 0; v < 256; v++) lut[v] = Math.max(0, (v - lo) * 255 / (255 - lo));
    for (let j = 0; j < px.length; j += 4) { px[j] = lut[px[j]]; px[j + 1] = lut[px[j + 1]]; px[j + 2] = lut[px[j + 2]]; }
  }
  nitidez(px, w, h, 0.35, Math.max(1, Math.round(Math.max(w, h) / 1600)), 6);
}

export async function melhorarImagem(src: string, modo: Exclude<ModoImagem, 'original'>): Promise<{ blob: Blob; largura: number; altura: number; ms: number }> {
  const t0 = performance.now();
  const img = await carregarImagem(src);
  const { cv, ctx } = desenhar(img);
  const dados = ctx.getImageData(0, 0, cv.width, cv.height);  // lança se a imagem vier sem CORS (canvas "sujo")
  await new Promise((r) => setTimeout(r, 0));                   // deixa o "melhorando…" pintar antes do laço pesado
  if (modo === 'foto') melhorarFoto(dados.data, cv.width, cv.height);
  else melhorarDocumento(dados.data, cv.width, cv.height);
  ctx.putImageData(dados, 0, 0);
  const blob = await new Promise<Blob>((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error('Falha ao gerar a imagem.'))), 'image/jpeg', 0.92));
  return { blob, largura: cv.width, altura: cv.height, ms: Math.round(performance.now() - t0) };
}

/** Sugere o ajuste: 'documento' quando boa parte da foto é PAPEL (região clara e pouco colorida, mesmo
 *  amarelada pela luz); senão 'foto'. Só escolhe o ponto de partida — o atendente pode trocar. */
export async function sugerirModo(src: string): Promise<Exclude<ModoImagem, 'original'>> {
  const img = await carregarImagem(src);
  const esc = 200 / Math.max(img.naturalWidth, img.naturalHeight);
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.round(img.naturalWidth * esc)); cv.height = Math.max(1, Math.round(img.naturalHeight * esc));
  const ctx = cv.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, cv.width, cv.height);
  const px = ctx.getImageData(0, 0, cv.width, cv.height).data;
  const n = px.length / 4;
  const hl = new Uint32Array(256);
  for (let j = 0; j < px.length; j += 4) hl[Math.round(lum(px[j], px[j + 1], px[j + 2]))]++;
  const claro = percentil(hl, n, 0.9);
  let papel = 0;
  for (let j = 0; j < px.length; j += 4) {
    const mx = Math.max(px[j], px[j + 1], px[j + 2]), mn = Math.min(px[j], px[j + 1], px[j + 2]);
    const sat = mx ? (mx - mn) / mx : 0;
    if (sat < 0.35 && lum(px[j], px[j + 1], px[j + 2]) >= claro * 0.72) papel++;
  }
  return papel / n > 0.35 ? 'documento' : 'foto';
}
