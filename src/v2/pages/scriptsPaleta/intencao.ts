/* ------------------------------------------------------------------
   Intenção do mouse na lista da paleta (puro, testado em
   intencao.test.ts). Ao atravessar a lista na DIAGONAL rumo à prévia
   (ex.: indo ao "Usar este script"), os itens do caminho não roubam a
   prévia: só trocam se o ponteiro PARAR sobre o item (atraso) ou andar
   na vertical. Regras que fecham o furo da versão anterior:
   - um único ouvinte na lista inteira: TODO movimento limpa o timer,
     inclusive nas zonas mortas (cabeçalho de grupo, vão entre itens,
     padding) — zona morta nunca agenda nada;
   - quando o timer dispara, só aplica se o ponteiro AINDA estiver
     sobre o mesmo item (quem decide é o chamador, via `aindaSobre`).
   ------------------------------------------------------------------ */

export interface Ponto { x: number; y: number }

export interface OpcoesIntencao {
  /** realça o item (setState do realce) */
  aplicar: (chave: string) => void;
  /** o ponteiro, no último ponto visto, continua sobre o item? */
  aindaSobre: (chave: string, p: Ponto) => boolean;
  atrasoMs?: number;
  agendar?: (fn: () => void, ms: number) => number;
  cancelar?: (h: number | undefined) => void;
}

export interface IntencaoMouse {
  /** `chave` = item sob o ponteiro (null = zona morta) · `atual` = item realçado · `estreito` = sem prévia */
  mover: (p: Ponto, chave: string | null, atual: string | null, estreito: boolean) => void;
  sair: () => void;
  limpar: () => void;
}

/** O movimento vai para a direita, mais na horizontal que na vertical (rumo à prévia). */
export function rumoAPrevia(ant: Ponto | null, p: Ponto): boolean {
  if (!ant) return false;
  const dx = p.x - ant.x, dy = p.y - ant.y;
  return dx > 1 && Math.abs(dy) < dx * 2.5;
}

export function criarIntencaoMouse(o: OpcoesIntencao): IntencaoMouse {
  const atraso = o.atrasoMs ?? 150;
  const agendar = o.agendar ?? ((fn, ms) => window.setTimeout(fn, ms));
  const cancelar = o.cancelar ?? ((h) => window.clearTimeout(h));
  let ultimo: Ponto | null = null;
  let timer: number | undefined;
  const limpar = () => { cancelar(timer); timer = undefined; };
  return {
    mover(p, chave, atual, estreito) {
      const ant = ultimo;
      ultimo = p;
      limpar();
      if (chave === null || chave === atual) return;
      if (!estreito && rumoAPrevia(ant, p)) {
        timer = agendar(() => {
          timer = undefined;
          if (ultimo && o.aindaSobre(chave, ultimo)) o.aplicar(chave);
        }, atraso);
      } else o.aplicar(chave);
    },
    sair() { limpar(); ultimo = null; },
    limpar,
  };
}
