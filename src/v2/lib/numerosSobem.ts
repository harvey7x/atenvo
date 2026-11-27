/* ------------------------------------------------------------------
   NÚMEROS QUE SOBEM ao entrar na tela (dono 21/11: "os números vão subindo,
   eu gostei disso — faz em tudo que tenha número").

   Os cartões de métrica e os <Kpi> já contam pelo React. Esta peça cobre o
   RESTO sem tocar em cada tela: ao navegar, percorre o texto da página e
   faz subir de zero todo número de RESUMO — indicadores, totais, valores
   em R$, percentuais e contagens das tabelas de painel.

   O que NÃO entra (de propósito): telefone, CPF, NB, data, hora e código
   (não casam com o formato), ano, dia de calendário, planilha, conversas,
   campos de formulário, janelas, gráficos e contadores miúdos de bolinha.

   Convive com o React: se o React trocar o texto no meio da contagem (dado
   novo chegou), a contagem daquele número para e o valor do React fica.
   Com "reduzir movimento" ligado no sistema, nada é animado.
   ------------------------------------------------------------------ */

// [espaço][R$ / sinal][inteiro com ou sem ponto de milhar][,decimais][unidade curta][espaço]
const RE = /^(\s*)((?:R\$\s?)?[−-]?)(\d{1,3}(?:\.\d{3})+|\d{1,7})(,\d{1,2})?(\s?(?:%|mil|cli\.|dias?|min|×))?(\s*)$/;
const FORA = [
  'input', 'textarea', 'select', 'option', 'svg', 'time', 'code', 'kbd', 'pre', '[contenteditable="true"]',
  '.p-modal', '.p-menu', '[class*="plx"]', '.wa-msgs', '.bolha', '.zp-tel', '.pmc-root', '.kpi .val',
  '.calx-daynum', '.calx-ag-dia', '.pr-dia-n', '.pn-graf-eixo', '.pn-graf-x', '[class*="eixo"]',
].join(',');
// o PRÓPRIO elemento é um dia/código (os filhos dele, como a contagem em negrito, continuam valendo)
const PAI_FORA = '.calx-pill, .calx-al-selo';
const TELAS_FORA = /^\/(whatsapp|pos-venda)(\/|$)/;
const JANELA_MS = 6000;         // depois de navegar, o conteúdo NOVO que chegar neste tempo ainda conta
const JANELA_TEXTO_MS = 20000;  // o dado que chega depois e só troca o texto ("—" ou "0" virando número)
const DURACAO_MS = 760;
const TETO = 180;         // números animados por varredura (os maiores primeiro não importa: é o que está à vista)

type Item = { no: Text; antes: string; pre: string; alvo: number; casas: number; milhar: boolean; uni: string; depois: string; fim: string; ult: string; t0: number };

const agrupa = (inteiro: string) => inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
function formata(i: Item, v: number): string {
  const fixo = v.toFixed(i.casas);
  const [int, dec] = fixo.split('.');
  return i.antes + i.pre + (i.milhar ? agrupa(int) : int) + (dec ? ',' + dec : '') + i.uni + i.depois;
}

export function instalarNumerosSobem(raiz: HTMLElement): { navegou: (caminho: string) => void; parar: () => void } {
  const semMovimento = () => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const feitos = new WeakSet<Text>();
  const espera = new Map<Element, Text[]>();   // fora da vista: sobem quando aparecerem
  let ativos: Item[] = [];
  let quadro = 0;
  let navegouEm = 0;
  let ligado = true;

  const passo = (agora: number) => {
    quadro = 0;
    const seguem: Item[] = [];
    for (const i of ativos) {
      if (!i.no.isConnected || i.no.data !== i.ult) continue;        // o React trocou (ou a tela saiu): fica o valor dele
      // (o relógio do quadro pode vir um nada ANTES do instante em que o número entrou: nunca abaixo de zero)
      const p = Math.min(1, Math.max(0, (agora - i.t0) / DURACAO_MS));
      const txt = p >= 1 ? i.fim : formata(i, i.alvo * (1 - Math.pow(1 - p, 3)));
      if (txt !== i.ult) { i.no.data = txt; i.ult = txt; }
      if (p < 1) seguem.push(i);
    }
    ativos = seguem;
    if (ativos.length) quadro = requestAnimationFrame(passo);
  };

  const comeca = (no: Text) => {
    if (feitos.has(no) || !no.isConnected) return;
    const m = RE.exec(no.data);
    if (!m) return;
    const inteiro = m[3];
    const alvo = Number(inteiro.replace(/\./g, '') + (m[4] ? '.' + m[4].slice(1) : ''));
    // zero não sobe — e NÃO fica marcado: se o dado de verdade chegar depois, aí sim ele sobe
    if (!Number.isFinite(alvo) || alvo === 0) return;
    feitos.add(no);
    const item: Item = {
      no, antes: m[1], pre: m[2], alvo, casas: m[4] ? m[4].length - 1 : 0, milhar: inteiro.includes('.'), uni: m[5] ?? '', depois: m[6],
      fim: no.data, ult: '', t0: performance.now(),
    };
    item.ult = formata(item, 0);
    no.data = item.ult;
    ativos.push(item);
    if (!quadro) quadro = requestAnimationFrame(passo);
  };

  const vista = typeof IntersectionObserver === 'function'
    ? new IntersectionObserver((entradas) => {
      for (const e of entradas) {
        if (!e.isIntersecting) continue;
        const nos = espera.get(e.target); espera.delete(e.target); vista?.unobserve(e.target);
        nos?.forEach(comeca);
      }
    }, { rootMargin: '0px 0px -24px 0px' })
    : null;

  const serve = (no: Text): Element | null => {
    if (feitos.has(no)) return null;
    const pai = no.parentElement;
    if (!pai || !RE.test(no.data)) return null;
    const m = RE.exec(no.data)!;
    // zero à esquerda ("01", "05") é dia ou código, não quantidade
    if (m[3].length > 1 && m[3][0] === '0') return null;
    // ano solto (1900–2100, sem ponto, sem R$, sem unidade) não é quantidade
    if (!m[2] && !m[4] && !m[5] && !m[3].includes('.')) { const n = Number(m[3]); if (n >= 1900 && n <= 2100) return null; }
    if (pai.closest(FORA) || pai.matches(PAI_FORA)) return null;
    const caixa = pai.getBoundingClientRect();
    if (!caixa.width || !caixa.height) return null;
    // contador miúdo em bolinha (não lidas, etc.): fica parado
    if (caixa.width <= 24 && caixa.height <= 24 && parseFloat(getComputedStyle(pai).fontSize) < 12) return null;
    return pai;
  };

  const varrer = (base: Node) => {
    if (!ligado || semMovimento()) return;
    const andador = document.createTreeWalker(base, NodeFilter.SHOW_TEXT);
    const agora: Text[] = [];
    let n = 0;
    for (let no = andador.nextNode() as Text | null; no && n < TETO; no = andador.nextNode() as Text | null) {
      if (!/\d/.test(no.data)) continue;
      const pai = serve(no);
      if (!pai) continue;
      n += 1;
      const caixa = pai.getBoundingClientRect();
      const aVista = caixa.bottom > 0 && caixa.top < window.innerHeight;
      if (aVista) agora.push(no);
      // fora da vista: só o que não é linha de tabela sobe ao aparecer (rolar uma lista longa não fica piscando)
      else if (vista && !pai.closest('tbody') && espera.size < 400) {
        const lista = espera.get(pai); if (lista) lista.push(no); else { espera.set(pai, [no]); vista.observe(pai); }
      } else feitos.add(no);
    }
    agora.forEach(comeca);
  };

  // o que chega depois de navegar: conteúdo novo (tela carregada sob demanda) e texto trocado no lugar
  // (a tela abriu com "—" ou "0" e o dado veio do servidor). As nossas próprias escritas caem aqui também:
  // o nó já está em `feitos`, então são ignoradas.
  const olheiro = new MutationObserver((mudancas) => {
    if (!ligado) return;
    const dt = performance.now() - navegouEm;
    if (dt > JANELA_TEXTO_MS) return;
    for (const mu of mudancas) {
      if (mu.type === 'characterData') {
        const no = mu.target as Text;
        if (no.nodeType !== 3 || feitos.has(no) || semMovimento()) continue;
        const pai = serve(no);
        if (!pai) continue;
        const caixa = pai.getBoundingClientRect();
        if (caixa.bottom > 0 && caixa.top < window.innerHeight) comeca(no); else feitos.add(no);
      } else if (dt <= JANELA_MS) {
        mu.addedNodes.forEach((no) => {
          if (no.nodeType === 1) varrer(no);
          else if (no.nodeType === 3 && no.parentNode) varrer(no.parentNode);
        });
      }
    }
  });
  olheiro.observe(raiz, { childList: true, subtree: true, characterData: true });

  return {
    navegou(caminho: string) {
      ligado = !TELAS_FORA.test(caminho);
      navegouEm = performance.now();
      espera.forEach((_, el) => vista?.unobserve(el)); espera.clear();
      if (ligado) varrer(raiz);
    },
    parar() {
      olheiro.disconnect(); vista?.disconnect(); espera.clear();
      if (quadro) cancelAnimationFrame(quadro);
      for (const i of ativos) if (i.no.isConnected && i.no.data === i.ult) i.no.data = i.fim;
      ativos = [];
    },
  };
}
