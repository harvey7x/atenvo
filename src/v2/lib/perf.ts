/* Modo de Performance (Automático/Leve/Completo). O Leve NÃO é outro app:
   é uma variante governada por token, ativada por [data-perf="lite"] na
   RAIZ (<html>) — mesma base de código, paridade funcional total; só o
   peso visual muda (ver as camadas MODO LEVE em tokens.css/base.css).
   Preferência POR DISPOSITIVO (localStorage sem escopo de usuário: quem
   engasga é a máquina, não a conta). A escolha MANUAL sempre vence a
   auto-detecção; 'auto' detecta uma vez na inicialização. AUSÊNCIA de
   preferência = LEVE (decisão do dono 27/08: o visual sólido do Leve é o
   padrão estético do produto — Automático/Completo viram opt-in). */

export type ModoPerf = 'auto' | 'lite' | 'full';
export type PerfTier = 'lite' | 'full';

export const CHAVE_PERF = 'atenvo-perf';

/* mediana de frame acima disto (~45fps) durante a sonda → a máquina não
   sustenta o Completo. Mediana, não média: resiste a picos isolados. */
const LIMIAR_FRAME_MS = 22;
const DURACAO_SONDA_MS = 500;
/* espera antes de medir: deixa o boot do app (ou a troca de modo) assentar,
   senão o jank de carga condenaria qualquer máquina ao Leve */
const ASSENTAMENTO_MS = 400;

export function lerModoPerf(): ModoPerf {
  try {
    const v = localStorage.getItem(CHAVE_PERF);
    // 'auto' explícito (escolha manual no toggle) continua valendo; só a AUSÊNCIA cai no Leve
    if (v === 'lite' || v === 'full' || v === 'auto') return v;
    return 'lite';
  } catch {
    return 'lite';
  }
}

export function aplicarPerfTier(tier: PerfTier): void {
  document.documentElement.setAttribute('data-perf', tier);
}

/* sinais de hardware, síncronos — pegam a máquina obviamente fraca sem
   esperar a sonda (deviceMemory não existe em todo navegador) */
function tierPorHardware(): PerfTier | null {
  const nav = navigator as Navigator & { deviceMemory?: number };
  if (nav.hardwareConcurrency > 0 && nav.hardwareConcurrency <= 4) return 'lite';
  if (typeof nav.deviceMemory === 'number' && nav.deviceMemory <= 4) return 'lite';
  return null;
}

/* aba em segundo plano congela o rAF — segura a sonda até a página aparecer
   (o contador de geração descarta o resultado se o modo mudar na espera) */
function paginaVisivel(): Promise<void> {
  if (document.visibilityState !== 'hidden') return Promise.resolve();
  return new Promise((resolve) => {
    const ouve = () => {
      if (document.visibilityState === 'hidden') return;
      document.removeEventListener('visibilitychange', ouve);
      resolve();
    };
    document.addEventListener('visibilitychange', ouve);
  });
}

/* sonda de FPS: ~500ms de requestAnimationFrame medindo o frame time.
   Resolve a MEDIANA dos deltas quando a janela COMPLETA — mesmo com poucos
   frames: janela cheia com 5 deltas de 100ms é uma máquina a 10fps, e é
   exatamente ela que precisa do Leve. 0 = inconclusivo (rAF congelado, a
   guarda de timeout disparou) e é tratado como ok — sem veredito, sem
   condenação. */
function sondarFrameMs(): Promise<number> {
  return new Promise((resolve) => {
    const deltas: number[] = [];
    let anterior = 0;
    let inicio = 0;
    let raf = 0;
    let feito = false;

    const fim = (completa: boolean) => {
      if (feito) return;
      feito = true;
      cancelAnimationFrame(raf);
      clearTimeout(guarda);
      if (!completa || deltas.length === 0) { resolve(0); return; }
      const ord = [...deltas].sort((a, b) => a - b);
      resolve(ord[Math.floor(ord.length / 2)]);
    };

    const passo = (agora: number) => {
      if (feito) return;
      if (!inicio) inicio = agora;
      else deltas.push(agora - anterior);
      anterior = agora;
      if (agora - inicio < DURACAO_SONDA_MS) raf = requestAnimationFrame(passo);
      else fim(true);
    };

    const guarda = setTimeout(() => fim(false), ASSENTAMENTO_MS + DURACAO_SONDA_MS + 1500);
    setTimeout(() => { raf = requestAnimationFrame(passo); }, ASSENTAMENTO_MS);
  });
}

/* 'lite' | 'full' pela máquina: hardware fraco decide na hora; caso
   contrário a sonda de FPS dá o veredito (esperando a página estar
   visível — rAF não roda em aba de fundo). */
export async function detectPerfTier(): Promise<PerfTier> {
  const porHw = tierPorHardware();
  if (porHw) return porHw;
  await paginaVisivel();
  const mediana = await sondarFrameMs();
  return mediana > LIMIAR_FRAME_MS ? 'lite' : 'full';
}

/* Sondas são assíncronas e o usuário pode trocar o modo no meio de uma —
   cada resolução incrementa a geração e o .then só aplica se ainda for o
   pedido vigente (senão a sonda velha do 'auto' atropelaria o 'lite'
   recém-escolhido no toggle). */
let geracao = 0;

/* Resolução da preferência (ordem: manual > auto-detecção). Chamada uma
   vez na inicialização (main.tsx) e a cada troca no toggle. No 'auto',
   aplica o veredito de hardware JÁ (síncrono, antes do primeiro paint)
   e deixa a sonda refinar logo depois — os efeitos ficam ligados durante
   a medição, então ela mede o custo real do Completo. O `modo` vem por
   parâmetro na troca manual (não relê o storage: se ele estiver
   indisponível, a escolha vale mesmo sem persistir). */
export function resolverEAplicarPerf(modo: ModoPerf = lerModoPerf()): void {
  const g = ++geracao;
  if (modo !== 'auto') { aplicarPerfTier(modo); return; }
  aplicarPerfTier(tierPorHardware() ?? 'full');
  void detectPerfTier().then((tier) => { if (g === geracao) aplicarPerfTier(tier); });
}

/* assinantes de mudança de MODO — o alternador da topbar e o Segmentado de
   Configurações refletem um ao outro sem acoplamento (ambos assinam) */
type OuvinteModo = (modo: ModoPerf) => void;
const ouvintes = new Set<OuvinteModo>();
export function assinarModoPerf(cb: OuvinteModo): () => void {
  ouvintes.add(cb);
  return () => { ouvintes.delete(cb); };
}

export function salvarModoPerf(modo: ModoPerf): void {
  try {
    localStorage.setItem(CHAVE_PERF, modo);
  } catch {
    /* storage indisponível: aplica sem persistir (o modo segue por parâmetro) */
  }
  resolverEAplicarPerf(modo);
  ouvintes.forEach((cb) => cb(modo));
}
