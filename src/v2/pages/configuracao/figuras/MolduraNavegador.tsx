/* =====================================================================
   Moldura de navegador + peças das figuras de demonstração (cfig-).

   Toda figura do tutorial é UM <svg> inline (viewBox 520×alt, width
   100%) devolvido por MolduraNavegador: janela de navegador genérica
   (barra com 3 pontos + endereço do serviço) com a cena dentro.
   O <title> é o nome acessível da figura (role="img").

   Peças compartilhadas (coordenadas no espaço do viewBox):
   Realce (anel dourado do ponto de clique), Seta (curva dourada com
   ponta calculada — sem <marker>, nada de id global), Cursor, Ghost
   (linha-fantasma de conteúdo), Painel (menu/modal opaco e elevado),
   MenuFig (lista suspensa com item-alvo), BotaoFig, CampoFig, RadioFig,
   IcFig (traço 2 na grade 24, família dos ícones do app), GradeFig
   (grade de planilha ao fundo). Cores SÓ por classe cfig- (tokens).
   ===================================================================== */
import type { ReactNode } from 'react';
import './figuras.css';

/** largura padrão do viewBox das figuras */
export const FIG_L = 520;
/** onde a "tela" começa (abaixo da barra do navegador) */
export const FIG_TELA_Y = 40;

export function MolduraNavegador({ titulo, endereco, altura = 300, children }: {
  /** nome acessível da figura (<title> do svg) */
  titulo: string;
  /** endereço fictício do serviço, mostrado na barra */
  endereco: string;
  altura?: number;
  children: ReactNode;
}) {
  return (
    <svg className="cfig" viewBox={`0 0 ${FIG_L} ${altura}`} role="img" focusable="false">
      <title>{titulo}</title>
      <rect className="cfig-jan" x="0.75" y="0.75" width={FIG_L - 1.5} height={altura - 1.5} rx="12" />
      <g aria-hidden>
        <circle className="cfig-jan-pt" cx="21" cy="20" r="4" />
        <circle className="cfig-jan-pt" cx="35" cy="20" r="4" />
        <circle className="cfig-jan-pt" cx="49" cy="20" r="4" />
        <rect className="cfig-jan-end" x="64" y="10" width={FIG_L - 64 - 14} height="20" rx="10" />
        <text className="cfig-mono" x="78" y="24">{endereco}</text>
        <path className="cfig-jan-div" d={`M1 ${FIG_TELA_Y - 0.5} H${FIG_L - 1}`} />
      </g>
      {children}
    </svg>
  );
}

/* ---------------------------------------------------------------- realce */

/** anel dourado em volta do elemento onde a pessoa clica (halo + traço) */
export function Realce({ x, y, w, h, rx = 8 }: { x: number; y: number; w: number; h: number; rx?: number }) {
  return (
    <g aria-hidden>
      <rect className="cfig-realce-halo" x={x - 3} y={y - 3} width={w + 6} height={h + 6} rx={rx + 3} />
      <rect className="cfig-realce" x={x} y={y} width={w} height={h} rx={rx} />
    </g>
  );
}

/** seta dourada em curva, de `de` até `a`; a ponta é desenhada (sem <marker>/id).
    `curva` > 0 enverga para um lado, < 0 para o outro. */
export function Seta({ de, a, curva = 0.25 }: { de: [number, number]; a: [number, number]; curva?: number }) {
  const [x1, y1] = de;
  const [x2, y2] = a;
  const cx = (x1 + x2) / 2 - (y2 - y1) * curva;
  const cy = (y1 + y2) / 2 + (x2 - x1) * curva;
  const ang = Math.atan2(y2 - cy, x2 - cx);
  const L = 9;      // comprimento da ponta
  const AB = 0.46;  // abertura da ponta (rad)
  const p = (t: number) => `${(x2 - Math.cos(ang + t) * L).toFixed(1)},${(y2 - Math.sin(ang + t) * L).toFixed(1)}`;
  // a linha para um pouco antes do fim, para não vazar da ponta
  const fx = (x2 - Math.cos(ang) * (L - 2)).toFixed(1);
  const fy = (y2 - Math.sin(ang) * (L - 2)).toFixed(1);
  return (
    <g aria-hidden>
      <path className="cfig-seta" d={`M${x1} ${y1} Q${cx.toFixed(1)} ${cy.toFixed(1)} ${fx} ${fy}`} />
      <polygon className="cfig-seta-pta" points={`${x2},${y2} ${p(AB)} ${p(-AB)}`} />
    </g>
  );
}

/** cursor do mouse (a ponta fica em x,y) */
export function Cursor({ x, y }: { x: number; y: number }) {
  return (
    <path className="cfig-cursor" aria-hidden
      transform={`translate(${x} ${y})`}
      d="m0 0v13.8l3.3-3.1 2.2 4.9 2.6-1.2-2.2-4.8 4.5-.4z" />
  );
}

/* ---------------------------------------------------------------- peças */

/** linha-fantasma de conteúdo (texto sugerido, sem dizer nada) */
export function Ghost({ x, y, w, h = 7, claro = false }: { x: number; y: number; w: number; h?: number; claro?: boolean }) {
  return <rect className={claro ? 'cfig-ghost-2' : 'cfig-ghost'} x={x} y={y} width={w} height={h} rx={h / 2} aria-hidden />;
}

/** painel elevado e OPACO (menu aberto, modal): base sólida + véu de tinta */
export function Painel({ x, y, w, h, rx = 9, children }: {
  x: number; y: number; w: number; h: number; rx?: number; children?: ReactNode;
}) {
  return (
    <g>
      <rect className="cfig-painel-base" x={x} y={y} width={w} height={h} rx={rx} />
      <rect className="cfig-painel" x={x} y={y} width={w} height={h} rx={rx} />
      {children}
    </g>
  );
}

export type ItemMenuFig = {
  t?: string;
  /** ponto de clique: ganha o anel dourado */
  alvo?: boolean;
  /** item "pai" aberto (chip neutro, sem realce) */
  on?: boolean;
  /** chevron de submenu à direita */
  seta?: boolean;
  /** separador (sem texto) */
  sep?: boolean;
};

export const MENU_ITEM_H = 24;
const MENU_SEP_H = 7;
const MENU_PAD = 6;

/** altura total de um MenuFig com esses itens */
export function alturaMenuFig(itens: ItemMenuFig[]): number {
  return itens.reduce((s, it) => s + (it.sep ? MENU_SEP_H : MENU_ITEM_H), MENU_PAD * 2);
}

/** y do topo do item `i` (para apontar setas/cursor) */
export function topoItemMenuFig(y: number, itens: ItemMenuFig[], i: number): number {
  let t = y + MENU_PAD;
  for (let k = 0; k < i; k += 1) t += itens[k].sep ? MENU_SEP_H : MENU_ITEM_H;
  return t;
}

/** lista suspensa: painel opaco + itens; o item-alvo ganha o anel dourado */
export function MenuFig({ x, y, w, itens }: { x: number; y: number; w: number; itens: ItemMenuFig[] }) {
  let cy = y + MENU_PAD;
  const linhas = itens.map((it) => {
    const topo = cy;
    cy += it.sep ? MENU_SEP_H : MENU_ITEM_H;
    return { it, topo };
  });
  return (
    <Painel x={x} y={y} w={w} h={cy - y + MENU_PAD}>
      {linhas.map(({ it, topo }, i) => {
        if (it.sep) return <path key={i} className="cfig-sep" d={`M${x + 8} ${topo + MENU_SEP_H / 2} H${x + w - 8}`} aria-hidden />;
        return (
          <g key={i}>
            {it.on && <rect className="cfig-chip" x={x + 5} y={topo + 1.5} width={w - 10} height={MENU_ITEM_H - 3} rx={6} aria-hidden />}
            <text className={it.alvo ? 'cfig-tx-f' : 'cfig-tx'} x={x + 13} y={topo + 16.5}>{it.t}</text>
            {it.seta && (
              <path className="cfig-ic" aria-hidden d={`M${x + w - 16} ${topo + 8.5} l4.5 3.5 -4.5 3.5`} />
            )}
            {it.alvo && <Realce x={x + 5} y={topo + 1.5} w={w - 10} h={MENU_ITEM_H - 3} rx={6} />}
          </g>
        );
      })}
    </Painel>
  );
}

/** botão ilustrado; `alvo` = anel dourado por cima */
export function BotaoFig({ x, y, w, h = 26, rotulo, pri = false, alvo = false }: {
  x: number; y: number; w: number; h?: number; rotulo: string; pri?: boolean; alvo?: boolean;
}) {
  return (
    <g>
      <rect className={pri ? 'cfig-bt-pri' : 'cfig-bt'} x={x} y={y} width={w} height={h} rx={7} />
      <text className={pri ? 'cfig-tx-f' : 'cfig-tx'} x={x + w / 2} y={y + h / 2 + 4.5} textAnchor="middle">{rotulo}</text>
      {alvo && <Realce x={x - 2.5} y={y - 2.5} w={w + 5} h={h + 5} rx={9} />}
    </g>
  );
}

/** campo rotulado (o rótulo fica acima, em cinza-token) */
export function CampoFig({ x, y, w, h = 28, rotulo, valor, mono = false, alvo = false }: {
  x: number; y: number; w: number; h?: number; rotulo?: string; valor: string; mono?: boolean; alvo?: boolean;
}) {
  return (
    <g>
      {rotulo && <text className="cfig-rot" x={x} y={y - 6}>{rotulo}</text>}
      <rect className="cfig-campo" x={x} y={y} width={w} height={h} rx={7} />
      <text className={mono ? 'cfig-mono-f' : 'cfig-tx'} x={x + 10} y={y + h / 2 + 4}>{valor}</text>
      {alvo && <Realce x={x - 2.5} y={y - 2.5} w={w + 5} h={h + 5} rx={9} />}
    </g>
  );
}

/** radio ilustrado (marcado = ponto dourado) */
export function RadioFig({ x, y, rotulo, nota, marcado = false }: {
  x: number; y: number; rotulo: string; nota?: string; marcado?: boolean;
}) {
  return (
    <g>
      <circle className="cfig-radio" cx={x + 7} cy={y} r={6.5} />
      {marcado && <circle className="cfig-sel" cx={x + 7} cy={y} r={3.5} aria-hidden />}
      <text className={marcado ? 'cfig-tx-f' : 'cfig-tx'} x={x + 22} y={y + 4.5}>{rotulo}</text>
      {nota && <text className="cfig-rot" x={x + 22 + rotulo.length * 7.6 + 7} y={y + 4.5}>{nota}</text>}
    </g>
  );
}

/** ícone de traço (desenhe na grade 24; a escala leva o traço 2 para ≈1.3) */
export function IcFig({ x, y, s = 16, forte = false, children }: {
  x: number; y: number; s?: number; forte?: boolean; children: ReactNode;
}) {
  return (
    <g className={forte ? 'cfig-ic cfig-ic-forte' : 'cfig-ic'} transform={`translate(${x} ${y}) scale(${s / 24})`} aria-hidden>
      {children}
    </g>
  );
}

/** caminhos dos ícones (grade 24, família do traço do app) */
export const IC = {
  doc: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h4',
  grade: 'M4 5h16v14H4zM4 10h16M4 15h16M10 5v14',
  mais: 'M12 5v14M5 12h14',
  relogio: 'M12 7.4v4.6l3.1 1.9M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z',
  lupa: 'M10.5 4a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13zM15.5 15.5 20 20',
  link: 'M9.5 14.5 14.5 9.5M8 12l-2.3 2.3a3.5 3.5 0 0 0 5 5L13 17M16 12l2.3-2.3a3.5 3.5 0 0 0-5-5L11 7',
  subir: 'M12 16V4m0 0-4.5 4.5M12 4l4.5 4.5M4 16v2.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V16',
  pessoa: 'M12 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM5 20c.8-3.2 3.6-5 7-5s6.2 1.8 7 5',
  info: 'M12 8h.01M11 12h1v5h1M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z',
} as const;

/** grade de planilha ao fundo (linhas finas; cab = faixa com letras das colunas) */
export function GradeFig({ x, y, w, h, colunas = 6, linhas = 6, cab = false }: {
  x: number; y: number; w: number; h: number; colunas?: number; linhas?: number; cab?: boolean;
}) {
  const topo = cab ? y + 18 : y;
  const lw = w / colunas;
  const lh = (y + h - topo) / linhas;
  const letras = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  return (
    <g aria-hidden>
      <rect className="cfig-sup" x={x} y={y} width={w} height={h} rx={6} />
      {cab && <path className="cfig-linha" d={`M${x} ${y + 18} H${x + w}`} />}
      {cab && Array.from({ length: colunas }, (_, i) => (
        <text key={`c${i}`} className="cfig-rot" x={x + lw * i + lw / 2} y={y + 13} textAnchor="middle">{letras[i] ?? ''}</text>
      ))}
      {Array.from({ length: colunas - 1 }, (_, i) => (
        <path key={`v${i}`} className="cfig-linha" d={`M${x + lw * (i + 1)} ${y} V${y + h}`} />
      ))}
      {Array.from({ length: linhas - 1 }, (_, i) => (
        <path key={`h${i}`} className="cfig-linha" d={`M${x} ${topo + lh * (i + 1)} H${x + w}`} />
      ))}
    </g>
  );
}
