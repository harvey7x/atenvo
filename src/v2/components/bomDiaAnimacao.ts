/* ------------------------------------------------------------------
   A ANIMAÇÃO do Bom dia — módulo plugável (dono 30/10: "preto e
   branco, minimalista, profissional"; a referência que ele abriu é a
   esfera escura de vidro com metal líquido por dentro).

   Interface única — o motor (BomDia.tsx) tem UM laço de quadro só e
   chama a animação nele; trocar a esfera pelo fio de seda ou pelo anel
   é escrever outro módulo com a mesma interface:
     criarAnimacao(canvas, { leve, aoMudar }) → {
       quadro(nivel, bandas, t, cena)   um quadro vivo (voz real)
       pose(cena)                        pose parada (Leve / máquina fraca)
       tamanho(leve, dpr)                a tela mudou de tamanho (dpr: 1,5 → 1 antes de parar)
       viva()                            false = sem WebGL → pose estática do CSS
       destruir()                        libera o contexto WebGL (o teto do Chrome é 16)
     }

   A ESFERA: 1 canvas WebGL pequeno (≤ 420 px de lado, DPR 1,5; 1 no
   Leve), 1 triângulo, 1 fragment shader. Esfera quase preta no preto,
   um redemoinho de metal líquido por dentro, fio de luz na borda em
   cima à esquerda. Em repouso ela respira e o redemoinho gira devagar;
   com a voz a superfície ondula (grave/médio/agudo), os reflexos acendem
   e ela cresce um pouco; número dito = um brilho de ~0,5 s. No fim o CSS
   leva a esfera para o alto (escala --bd-esfera-k) e ela é redesenhada
   no tamanho em que aparece (nada de reduzir 4x na composição).
   Sem WebGL / contexto perdido → `aoMudar(false)`: o CSS mostra a pose
   estática (.bd-esfera-estatica). Contexto restaurado → `aoMudar(true)`.
   O canvas é criado pelo motor a cada montagem (o StrictMode monta 2x):
   destruir() perde o contexto de propósito, sem deixar contexto vivo.
   ------------------------------------------------------------------ */

export interface Bandas {
  grave: number;
  medio: number;
  agudo: number;
}

/** O que o motor sabe a cada quadro além da voz. */
export interface Cena {
  /** 0..1 — acendendo (abertura) */
  abre: number;
  /** 0..1 — pousando no alto (fim) */
  recolhe: number;
  /** 0..1 — número dito (o motor decai) */
  brilho: number;
  /** nível lento: respira com a frase */
  lento: number;
}

export interface OpcoesAnimacao {
  /** Modo Leve: só poses paradas, DPR 1 */
  leve: boolean;
  /** a animação caiu para a pose estática do CSS (false) ou voltou (true) */
  aoMudar?: (viva: boolean) => void;
}

export interface Animacao {
  quadro(nivel: number, bandas: Bandas, t: number, cena: Cena): void;
  pose(cena: Pick<Cena, 'recolhe'>): void;
  /** dpr = teto da densidade do canvas (1,5 padrão; o vigia baixa para 1 antes de parar a esfera) */
  tamanho(leve?: boolean, dpr?: number): void;
  viva(): boolean;
  destruir(): void;
}

/** Escala da esfera pousada no alto (igual a --bd-esfera-k do CSS). */
export const ESFERA_K_FIM = 0.2;
/** Começa na pose da referência (o "gancho" em cima à esquerda). */
const POSE_GIRO = 2.86;

const VERT = 'attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }';

const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 uRes;
uniform float uR;        // raio da esfera (uv: meia altura do canvas = 1)
uniform vec3 uAmp;       // ondulação da superfície: grave, médio, agudo (relativo ao raio)
uniform vec3 uFase;      // fases das três ondulações
uniform float uGiro;     // giro do redemoinho
uniform float uTorcao;   // torção do redemoinho
uniform float uLuz;      // ganho dos reflexos
uniform float uMiolo;    // brilho do redemoinho
uniform float uHalo;     // halo fora da esfera
uniform float uAbre;     // 0..1 (acende)
uniform float uAA;       // largura do antisserrilhado, em px do canvas
uniform float uT;        // tempo lento (deriva orgânica)
uniform float uSuave;    // >1 quando ela encolhe: faixas mais macias (sem serrilhado)

// superfície: 6 ondas suaves em direções irregulares (2 por banda), com gradiente analítico
float ondas(vec3 n, out vec3 g) {
  float d = 0.0; g = vec3(0.0); float a; vec3 k;
  k = vec3(1.7, 1.2, 0.9);   a = dot(n, k) + uFase.x;         d += 0.6 * uAmp.x * sin(a);  g += 0.6 * uAmp.x * cos(a) * k;
  k = vec3(-1.2, 1.9, -1.1); a = dot(n, k) - 0.83 * uFase.x;  d += 0.4 * uAmp.x * sin(a);  g += 0.4 * uAmp.x * cos(a) * k;
  k = vec3(3.4, -2.6, 1.9);  a = dot(n, k) + uFase.y;         d += 0.55 * uAmp.y * sin(a); g += 0.55 * uAmp.y * cos(a) * k;
  k = vec3(-2.3, -3.7, 2.4); a = dot(n, k) - 1.13 * uFase.y;  d += 0.45 * uAmp.y * sin(a); g += 0.45 * uAmp.y * cos(a) * k;
  k = vec3(6.2, 4.1, -3.3);  a = dot(n, k) + uFase.z;         d += 0.5 * uAmp.z * sin(a);  g += 0.5 * uAmp.z * cos(a) * k;
  k = vec3(-5.1, 6.6, 2.8);  a = dot(n, k) - 0.91 * uFase.z;  d += 0.5 * uAmp.z * sin(a);  g += 0.5 * uAmp.z * cos(a) * k;
  return d;
}

// o redemoinho: dois braços em espiral em volta de um eixo inclinado (largos no meio, finos nas pontas)
float remo(float s, float ang) {
  float w = ang + uTorcao * s + uGiro + 0.3 * sin(1.7 * s - 0.35 * uT) + 0.2 * sin(ang + 1.3 * s + 0.27 * uT);
  float sino = exp(-pow((s - 0.9) / 0.55, 2.0));
  float a1 = pow(max(cos(w), 1e-4), mix(12.0, 1.4, sino));
  float a2 = 0.7 * pow(max(cos(w - 2.5 + 0.6 * s), 1e-4), mix(30.0, 5.5, sino));
  float e = smoothstep(0.05, 0.42, s) * (1.0 - smoothstep(1.3, 1.85, s));
  return (a1 + a2) * e;
}

// o estúdio: preto, duas faixas brancas suaves, uma luz larga em cima à esquerda,
// um contorno forte atrás em cima à esquerda e um contraluz quase apagado embaixo à direita
float estudio(vec3 r, float nitido) {
  float f1 = smoothstep(0.16 * uSuave, 0.04 / uSuave, abs(r.y - 0.62 - 0.14 * r.x)) * smoothstep(1.0, 0.2, abs(r.x + 0.18));
  float f2 = smoothstep(0.11 * uSuave, 0.025 / uSuave, abs(r.x + 0.74 + 0.1 * r.y)) * smoothstep(-0.7, 0.5, r.y);
  float cupula = pow(max(dot(r, normalize(vec3(-0.45, 0.6, 0.66))), 0.0), 1.6);
  float cd = max(dot(r, normalize(vec3(-0.46, 0.44, -0.77))), 0.0);
  float contorno = 0.8 * pow(cd, 18.0) * nitido + 0.07 * pow(cd, 4.0);
  float contra = pow(max(dot(r, normalize(vec3(0.5, -0.46, -0.73))), 0.0), 3.0);
  return (1.0 * f1 + 0.75 * f2) * nitido + 0.8 * cupula + 1.2 * contorno + 0.05 * contra;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / (0.5 * uRes.y);
  float r = length(uv);
  float px = 2.0 / uRes.y;
  vec3 g;
  vec3 ne = vec3(uv / max(r, 1e-4), 0.0);
  float re = uR * (1.0 + ondas(ne, g));
  float dentro = smoothstep(re + px * uAA, re - px * uAA, r);

  float L = 0.0;
  if (dentro > 0.0) {
    // ponto na superfície ondulada (2 passos de ponto fixo a partir da esfera)
    float rr = min(r, re);
    float z = sqrt(max(re * re - rr * rr, 0.0));
    vec3 n = normalize(vec3(uv, z));
    float rho = uR * (1.0 + ondas(n, g));
    z = sqrt(max(rho * rho - rr * rr, 0.0));
    n = normalize(vec3(uv, z));
    rho = uR * (1.0 + ondas(n, g));
    vec3 N = normalize(n - (g - dot(g, n) * n) * (uR / rho));
    float ndv0 = clamp(N.z, 0.0, 1.0);
    float nitido = smoothstep(0.07, 0.4, ndv0);     // perto da silhueta tudo fica macio (nada de fio serrilhado)

    // redemoinho: coordenadas em volta de um eixo inclinado para cima e para a esquerda
    vec3 A = normalize(vec3(-0.3, 0.22, 1.0));
    vec3 B1 = normalize(cross(vec3(0.0, 1.0, 0.0), A));
    vec3 B2 = cross(A, B1);
    float h = clamp(dot(n, A), -0.9999, 0.9999);
    float s = acos(h);
    float ang = atan(dot(n, B2), dot(n, B1));
    float H = remo(s, ang);
    float eps = 0.012;
    float dHs = (remo(s + eps, ang) - H) / eps;
    float dHa = (remo(s, ang + eps) - H) / eps;
    float ss = max(sin(s), 0.05);
    vec3 ur = (n - A * h) / ss;
    vec3 ua = cross(A, ur);
    vec3 eS = -A * ss + ur * h;
    vec3 gr = dHs * eS + (dHa / ss) * ua;
    gr *= min(1.0, 3.0 / max(length(gr), 1e-4));
    vec3 N2 = normalize(N - (0.26 / uSuave) * nitido * gr);

    vec3 R = reflect(vec3(0.0, 0.0, -1.0), N2);
    float ndv = clamp(N2.z, 0.0, 1.0);
    float fres = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
    float E = estudio(R, nitido) * uLuz;
    float m = smoothstep(0.05, 0.42, H);
    L = mix(fres * E, (0.58 + 0.42 * fres) * E * uMiolo, m);
    // a borda vem da normal lisa: fio claro em cima à esquerda, contraluz largo e apagado embaixo à direita
    vec2 dirN = normalize(N.xy + 1e-4);
    float sobe = pow(max(dot(dirN, vec2(-0.69, 0.72)), 0.0), 1.3);
    float desce = smoothstep(-0.25, 0.85, dot(dirN, vec2(0.722, -0.692)));
    L += (0.7 * pow(1.0 - ndv0, 5.0) * sobe + (1.0 - m) * 0.028 * pow(1.0 - ndv0, 2.2) * desce) * uLuz;
  }
  L *= uAbre;
  float c = 1.0 - exp(-1.7 * L);
  float fora = max(r - re, 0.0);
  float hc = uHalo * exp(-fora * 7.0) * smoothstep(1.0, 0.82, r) * uAbre * (1.0 - dentro);
  float dit = (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;
  float lum = c * dentro + hc;
  float cor = max(lum + dit * step(0.002, lum), 0.0);
  float alfa = clamp(max(dentro, hc), 0.0, 1.0);
  gl_FragColor = vec4(vec3(min(cor, alfa)), alfa);
}
`;

const UNIFORMES = ['uRes', 'uR', 'uAmp', 'uFase', 'uGiro', 'uTorcao', 'uLuz', 'uMiolo', 'uHalo', 'uAbre', 'uAA', 'uT', 'uSuave'] as const;
type Uniforme = typeof UNIFORMES[number];

const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);
const easeIO = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const entre01 = (x: number) => Math.max(0, Math.min(1, x));

export function criarAnimacao(canvas: HTMLCanvasElement, opcoes: OpcoesAnimacao): Animacao {
  let leve = opcoes.leve;
  let dprTeto = 1.5;
  let gl: WebGLRenderingContext | null = null;
  let prog: WebGLProgram | null = null;
  let buf: WebGLBuffer | null = null;
  let U: Record<Uniforme, WebGLUniformLocation | null> | null = null;
  let viva: boolean | null = null;   // null = ainda não tentou (o 1º aviso sempre sai)
  let pequena = false;
  let destruida = false;
  const dims = { css: 1 };
  // o estado do desenho (a voz chega pronta do motor; aqui só fases e giro)
  const fases = [0, 0, 0];
  let giro = POSE_GIRO;
  let relTempo = 0;
  let tAntes = -1;
  const nv = { g: 0, m: 0, a: 0, geral: 0, lento: 0, brilho: 0, abre: 0, recolhe: 0 };

  const avisar = (v: boolean) => {
    if (v === viva) return;
    viva = v;
    opcoes.aoMudar?.(v);
  };

  const iniciar = (): boolean => {
    try {
      gl = canvas.getContext('webgl', {
        alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false,
        preserveDrawingBuffer: false, powerPreference: 'low-power',
      });
    } catch { gl = null; }
    if (!gl) { avisar(false); return false; }
    const g = gl;
    const comp = (tipo: number, src: string) => {
      const s = g.createShader(tipo);
      if (!s) throw new Error('shader');
      g.shaderSource(s, src);
      g.compileShader(s);
      if (!g.getShaderParameter(s, g.COMPILE_STATUS)) throw new Error(g.getShaderInfoLog(s) || 'shader');
      return s;
    };
    try {
      const pr = g.createProgram();
      if (!pr) throw new Error('programa');
      g.attachShader(pr, comp(g.VERTEX_SHADER, VERT));
      g.attachShader(pr, comp(g.FRAGMENT_SHADER, FRAG));
      g.linkProgram(pr);
      if (!g.getProgramParameter(pr, g.LINK_STATUS)) throw new Error(g.getProgramInfoLog(pr) || 'link');
      g.useProgram(pr);
      const b = g.createBuffer();
      g.bindBuffer(g.ARRAY_BUFFER, b);
      g.bufferData(g.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), g.STATIC_DRAW);
      const loc = g.getAttribLocation(pr, 'p');
      g.enableVertexAttribArray(loc);
      g.vertexAttribPointer(loc, 2, g.FLOAT, false, 0, 0);
      const u = {} as Record<Uniforme, WebGLUniformLocation | null>;
      UNIFORMES.forEach((n) => { u[n] = g.getUniformLocation(pr, n); });
      g.clearColor(0, 0, 0, 0);
      prog = pr;
      buf = b;
      U = u;
      avisar(true);
      return true;
    } catch (e) {
      console.warn(`bom dia: esfera sem WebGL (${e instanceof Error ? e.message : 'erro'})`);
      gl = null;
      U = null;
      avisar(false);
      return false;
    }
  };

  /** lado do canvas: tamanho de layout × DPR; pousada no alto, o tamanho em que aparece */
  const medir = () => {
    dims.css = Math.max(1, canvas.offsetWidth || canvas.getBoundingClientRect().width);
    const dpr = leve ? 1 : dprTeto;
    const lado = pequena
      ? Math.max(24, Math.round(dims.css * ESFERA_K_FIM * (window.devicePixelRatio || 1) * 1.25))
      : Math.round(dims.css * dpr);
    if (canvas.width !== lado) { canvas.width = lado; canvas.height = lado; }
  };

  const desenhar = () => {
    if (!viva || !gl || !U || destruida) return;
    const ab = easeOut(entre01(nv.abre));
    const rc = easeIO(entre01(nv.recolhe));
    const k = 1 - (1 - ESFERA_K_FIM) * rc;                                   // escala visual atual
    const naTela = dims.css * k * (window.devicePixelRatio || 1);            // px reais que ela ocupa agora
    const sobra = Math.max(1, canvas.width / Math.max(1, naTela));
    const respiro = leve ? 0 : Math.sin((relTempo * 2 * Math.PI) / 6.4) * 0.012 * (1 - rc);
    const R = 0.72 * (0.93 + 0.07 * ab) * (1 + respiro + 0.07 * nv.lento + 0.025 * nv.geral + 0.014 * nv.brilho);
    const g = gl;
    g.viewport(0, 0, canvas.width, canvas.height);
    g.clear(g.COLOR_BUFFER_BIT);
    g.uniform2f(U.uRes, canvas.width, canvas.height);
    g.uniform1f(U.uR, R);
    g.uniform3f(U.uAmp,
      (0.0035 + 0.02 * nv.g) * (1 - 0.6 * rc),
      (0.0012 + 0.011 * nv.m) * (1 - 0.8 * rc),
      (0.0003 + 0.0035 * nv.a) * (1 - rc));
    g.uniform3f(U.uFase, fases[0], fases[1], fases[2]);
    g.uniform1f(U.uGiro, giro);
    g.uniform1f(U.uSuave, Math.min(3, Math.pow(sobra, 0.6)));
    g.uniform1f(U.uTorcao, 2.0 + 0.18 * Math.sin(relTempo * 0.17) + 0.4 * nv.lento);
    g.uniform1f(U.uLuz, (0.92 + 0.45 * nv.geral + 0.3 * nv.brilho) * (1 - 0.2 * rc));
    g.uniform1f(U.uMiolo, 0.9 + 0.35 * nv.lento + 0.35 * nv.brilho);
    g.uniform1f(U.uHalo, (0.002 + 0.016 * nv.lento + 0.012 * nv.brilho) * (1 - rc));
    g.uniform1f(U.uAbre, ab);
    g.uniform1f(U.uAA, 1.25 * sobra);
    g.uniform1f(U.uT, relTempo);
    g.drawArrays(g.TRIANGLES, 0, 3);
  };

  /** pousada no alto ela é pequena: troca o tamanho do canvas (isso limpa a tela — quem chama redesenha) */
  const ajustarPequena = (recolhe: number) => {
    const quer = recolhe >= 1;
    if (quer === pequena) return;
    pequena = quer;
    medir();
  };

  const perdeu = (e: Event) => { e.preventDefault(); avisar(false); };
  const voltou = () => { if (destruida) return; if (iniciar()) { medir(); desenhar(); } };
  canvas.addEventListener('webglcontextlost', perdeu);
  canvas.addEventListener('webglcontextrestored', voltou);

  medir();
  iniciar();

  return {
    quadro(nivel, bandas, t, cena) {
      const dt = tAntes >= 0 ? Math.min(0.05, Math.max(0, t - tAntes)) : 1 / 60;
      tAntes = t;
      relTempo += dt;
      nv.g = bandas.grave; nv.m = bandas.medio; nv.a = bandas.agudo;
      nv.geral = nivel; nv.lento = cena.lento; nv.brilho = cena.brilho;
      nv.abre = cena.abre; nv.recolhe = cena.recolhe;
      // a superfície ondula no ritmo de cada banda; o redemoinho gira mais rápido com a frase
      fases[0] += dt * (0.45 + 1.5 * nv.g);
      fases[1] += dt * (0.8 + 2.6 * nv.m);
      fases[2] += dt * (1.4 + 4.2 * nv.a);
      giro += dt * (0.13 + 0.32 * nv.lento);
      ajustarPequena(cena.recolhe);
      desenhar();
    },
    pose(cena) {
      // a pose da referência, sem voz: Leve, máquina fraca ou o repouso pousado
      nv.g = nv.m = nv.a = nv.geral = nv.lento = nv.brilho = 0;
      nv.abre = 1;
      nv.recolhe = cena.recolhe;
      if (leve) { giro = POSE_GIRO; relTempo = 0; fases[0] = fases[1] = fases[2] = 0; }
      tAntes = -1;
      ajustarPequena(cena.recolhe);
      desenhar();
    },
    tamanho(novoLeve, dpr) {
      if (typeof novoLeve === 'boolean') leve = novoLeve;
      if (typeof dpr === 'number' && dpr > 0) dprTeto = dpr;
      medir();
      desenhar();
    },
    viva: () => viva === true,
    destruir() {
      destruida = true;
      canvas.removeEventListener('webglcontextlost', perdeu);
      canvas.removeEventListener('webglcontextrestored', voltou);
      if (gl) {
        try {
          if (buf) gl.deleteBuffer(buf);
          if (prog) gl.deleteProgram(prog);
          // sem isto o contexto fica vivo até o GC (cada abertura/troca da prévia criava um novo)
          gl.getExtension('WEBGL_lose_context')?.loseContext();
        } catch { /* contexto já perdido */ }
      }
      gl = null;
      U = null;
    },
  };
}
