'use client';

import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';

/**
 * O gráfico do Progress Metric Card: a curva com a área em degradê ou as barras arredondadas, com o balão do ponto
 * marcado. É um <svg> desenhado aqui, sem biblioteca de gráficos. O mouse (ou o dedo) marca o ponto mais perto; pelo
 * teclado, as setas andam um ponto, Home e End vão às pontas e o Esc solta. A curva se desenha da esquerda para a direita
 * e as barras sobem; ao trocar o período, a curva e as barras andam até os pontos novos. As classes pmc-* moram no CSS
 * do card (progress-metric-card.tsx).
 */

export type SeriesPoint = { value: number; date: string };
export type MetricAccent = 'emerald' | 'rose' | 'neutral';
export type MetricSeries = { name: string; data: SeriesPoint[]; accent?: MetricAccent };
export type ChartSeries = { name: string; data: SeriesPoint[]; color: string };
export type ChartView = 'curve' | 'bar';

export const ACCENTS: Record<MetricAccent, { stroke: string; text: string }> = {
  emerald: { stroke: '#10b981', text: '#059669' },
  rose: { stroke: '#ef4444', text: '#dc2626' },
  neutral: { stroke: '#64748b', text: '#475569' },
};

// As cores das séries quando há mais de uma e elas não trazem accent.
export const SERIES_COLORS = ['#10b981', '#6366f1', '#f59e0b', '#ef4444', '#14b8a6'];

/** 3150 → "3,15 mil", 1200000 → "1,2 mi", 166 → "166". */
export function formatCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e6) return strip(n / 1e6) + ' mi';
  if (abs >= 1e3) return strip(n / 1e3) + ' mil';
  return n.toLocaleString('pt-BR');
}

function strip(n: number) {
  return n.toFixed(2).replace(/\.?0+$/, '').replace('.', ',');
}

interface MetricChartProps {
  series: ChartSeries[];
  view: ChartView;
  defaultIndex?: number;
  valueFormatter: (value: number) => string;
  dateFormatter: (date: string) => string;
  /** O espaço livre em cima da escala, em px (o cabeçalho do card fica nele). */
  padTop?: number;
  /** O nome do gráfico para o leitor de tela. */
  label?: string;
  /** Reviza (14/11): o balão vira para a DIREITA do ponto quando não cabe à esquerda (gráfico na
   *  largura toda do card compacto). Sem isso, sempre à esquerda, como no original. */
  tipAuto?: boolean;
}

// As animações: a curva em 900 ms (ease-in-out), as barras em 700 ms (ease), as duas dois quadros depois da troca.
const DELAY_MS = 32;
const CURVE_MS = 900;
const BAR_MS = 700;
const CURVE_EASE = bezier(0.42, 0, 0.58, 1);
const BAR_EASE = bezier(0.25, 0.1, 0.25, 1);

// As barras: 10% da faixa de cada ponto fica de folga de cada lado, 4 px entre as séries e no máximo 26 px de largura.
const BAR_GAP_SHARE = 0.1;
const BAR_GAP = 4;
const BAR_MAX = 26;
const BAR_RADIUS = 6;

type Point = { x: number; y: number };
type Rect = { x: number; y: number; w: number; h: number };
type Shape =
  | { view: 'curve'; lines: Point[][] }
  | { view: 'bar'; band: number; bars: Rect[][] };

export function MetricChart({
  series,
  view,
  defaultIndex,
  valueFormatter,
  dateFormatter,
  padTop = 36,
  label,
  tipAuto = false,
}: MetricChartProps) {
  const uid = useId().replace(/:/g, '');
  const reduce = usePrefersReducedMotion();
  const [box, ref] = useBox();
  const { w, h } = box;
  const isMulti = series.length > 1;
  const count = series[0]?.data.length ?? 0;
  const mid = (padTop + h) / 2;

  const target = useMemo(() => shape(series, view, w, h, padTop), [series, view, w, h, padTop]);

  // O ponto marcado: o defaultIndex ao abrir e a cada troca de curva e barras; o mouse, o dedo e o teclado mudam.
  const [active, setActive] = useState<{ i: number; y?: number } | null>(
    defaultIndex == null ? null : { i: defaultIndex },
  );
  const [shownView, setShownView] = useState(view);
  if (shownView !== view) {
    setShownView(view);
    setActive(defaultIndex == null ? null : { i: defaultIndex });
  }
  const index = active && count ? Math.min(active.i, count - 1) : null;

  // A animação: ao abrir (e ao trocar de curva para barras) a curva se desenha e as barras sobem; com outros dados (o
  // período), elas andam do desenho atual até o novo. Mudar só o tamanho redesenha direto.
  const dataKey = view + '|' + series.map((s) => s.color + ':' + s.data.map((d) => d.value + '@' + d.date).join(',')).join('|');
  const drawn = useRef<Shape | null>(null);
  const [anim, setAnim] = useState<{ key: string; from: Shape | null; p: number } | null>(null);
  const ready = w > 0 && h > 0;

  useIsomorphicLayoutEffect(() => {
    if (!ready) return;
    if (reduce) {
      setAnim(null);
      return;
    }
    const prev = drawn.current;
    const from = prev && prev.view === view ? prev : null;
    setAnim({ key: dataKey, from, p: 0 });
    const ms = view === 'curve' ? CURVE_MS : BAR_MS;
    let start = 0;
    let raf = requestAnimationFrame(function frame(now) {
      if (!start) start = now + DELAY_MS;
      const p = Math.max(0, Math.min(1, (now - start) / ms));
      setAnim((a) => (a && a.key === dataKey ? { ...a, p } : a));
      if (p < 1) raf = requestAnimationFrame(frame);
    });
    return () => cancelAnimationFrame(raf);
  }, [dataKey, ready, reduce]);

  const running = anim && anim.key === dataKey && anim.p < 1 ? anim : null;
  const ease = view === 'curve' ? CURVE_EASE : BAR_EASE;
  const t = running ? ease(running.p) : 1;
  const frame = running ? blend(running.from, target, t, h) : target;

  useIsomorphicLayoutEffect(() => {
    if (ready) drawn.current = frame;
  });

  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    if (!count) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) * w) / r.width;
    const y = ((e.clientY - r.top) * h) / r.height;
    const i =
      view === 'curve'
        ? Math.round(count > 1 ? (x / w) * (count - 1) : 0)
        : Math.floor((x / w) * count);
    setActive({ i: clamp(i, 0, count - 1), y });
  };

  const onKeyDown = (e: KeyboardEvent<SVGSVGElement>) => {
    if (!count) return;
    if (e.key === 'Escape') {
      // sem ponto marcado, o Esc segue para a página (fecha um modal em volta, por exemplo)
      if (index == null) return;
      e.preventDefault();
      setActive(null);
      return;
    }
    const keys: Record<string, number> = {
      ArrowLeft: (index ?? count) - 1,
      ArrowRight: (index ?? count - 2) + 1,
      Home: 0,
      End: count - 1,
    };
    if (!(e.key in keys)) return;
    e.preventDefault();
    setActive({ i: clamp(keys[e.key], 0, count - 1) });
  };

  const tipX =
    index == null
      ? 0
      : target.view === 'curve'
        ? (target.lines[0]?.[index]?.x ?? 0)
        : (index + 0.5) * target.band;
  const tipY = active?.y ?? mid;
  const tipSide = tipAuto && tipX < Math.min(170, w * 0.5) ? 'right' : undefined;

  return (
    <div ref={ref} className="pmc-chart">
      {ready && (
        <div className="pmc-chart__box" style={{ width: w, height: h }}>
          <svg
            className="pmc-chart__svg"
            width={w}
            height={h}
            viewBox={`0 0 ${w} ${h}`}
            role="application"
            aria-label={label}
            tabIndex={0}
            onPointerMove={onPointerMove}
            onPointerDown={onPointerMove}
            onPointerLeave={() => setActive(null)}
            onKeyDown={onKeyDown}
          >
            {frame.view === 'curve' ? (
              <>
                <defs>
                  {series.map((s, k) => (
                    <linearGradient key={k} id={`fill-${uid}-${k}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={s.color} stopOpacity={0.32} />
                      <stop offset="55%" stopColor={s.color} stopOpacity={0.08} />
                      <stop offset="100%" stopColor={s.color} stopOpacity={0} />
                    </linearGradient>
                  ))}
                  {running && !running.from && (
                    <clipPath id={`reveal-${uid}`}>
                      <rect x={0} y={0} width={w * t} height={h} />
                    </clipPath>
                  )}
                </defs>
                <g clipPath={running && !running.from ? `url(#reveal-${uid})` : undefined}>
                  {frame.lines.map((pts, k) => {
                    const line = monotonePath(pts);
                    if (!line) return null;
                    const area = `${line}L${num(pts[pts.length - 1].x)},${h}L${num(pts[0].x)},${h}Z`;
                    return (
                      <g key={k}>
                        {!isMulti && <path d={area} fill={`url(#fill-${uid}-${k})`} fillOpacity={0.6} />}
                        <path d={line} fill="none" stroke={series[k].color} strokeWidth={2} />
                      </g>
                    );
                  })}
                </g>
                {/* o ponto marcado fica no lugar final, mesmo com a curva andando */}
                {index != null &&
                  target.view === 'curve' &&
                  target.lines.map((pts, k) =>
                    pts[index] ? (
                      <circle
                        key={k}
                        cx={pts[index].x}
                        cy={pts[index].y}
                        r={6}
                        fill={series[k].color}
                        stroke="var(--pmc-card)"
                        strokeWidth={4}
                      />
                    ) : null,
                  )}
              </>
            ) : (
              <>
                <defs>
                  {series.map((s, k) => (
                    <linearGradient key={k} id={`bar-${uid}-${k}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={s.color} stopOpacity={1} />
                      <stop offset="100%" stopColor={s.color} stopOpacity={1} />
                    </linearGradient>
                  ))}
                </defs>
                {frame.bars.map((rects, k) => (
                  <g key={k}>
                    {rects.map((r, i) => (
                      <path
                        key={i}
                        d={roundedTop(r)}
                        fill={i === index ? series[k].color : `url(#bar-${uid}-${k})`}
                      />
                    ))}
                  </g>
                ))}
              </>
            )}
          </svg>

          {index != null && (
            <div className="pmc-tip-wrap" data-side={tipSide} style={{ transform: `translate(${tipX}px, ${tipY}px)` }}>
              <div className="pmc-tip">
                {series.map((s, k) => (
                  <div key={k} className="pmc-tip__row">
                    {isMulti && <span className="pmc-dot" style={{ background: s.color }} />}
                    {isMulti && <span className="pmc-tip__name">{s.name}</span>}
                    <span className={isMulti ? 'pmc-tip__value' : undefined}>
                      {valueFormatter(s.data[index]?.value ?? 0)}
                    </span>
                  </div>
                ))}
                <div className="pmc-tip__date">{dateFormatter(series[0].data[index].date)}</div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------- as contas ---------- */

function shape(series: ChartSeries[], view: ChartView, w: number, h: number, padTop: number): Shape {
  const n = series[0]?.data.length ?? 0;
  const values = series.flatMap((s) => s.data.map((d) => d.value));
  const lo = values.length ? Math.min(...values) : 0;
  const hi = values.length ? Math.max(...values) : 0;
  // a curva ganha folga embaixo (14%) e em cima (2%); as barras partem do zero, com 8% em cima
  const [d0, d1] =
    view === 'bar'
      ? [0, Math.ceil(hi + (hi || 1) * 0.08)]
      : [Math.floor(lo - (lo || 1) * 0.14), Math.ceil(hi + (hi || 1) * 0.02)];
  const span = d1 - d0 || 1;
  const y = (v: number) => padTop + ((d1 - v) / span) * (h - padTop);
  const value = (s: ChartSeries, i: number) => s.data[i]?.value ?? 0;

  if (view === 'curve') {
    const x = (i: number) => (n > 1 ? (i * w) / (n - 1) : w / 2);
    return { view, lines: series.map((s) => Array.from({ length: n }, (_, i) => ({ x: x(i), y: y(value(s, i)) }))) };
  }

  const band = n ? w / n : 0;
  const offset = band * BAR_GAP_SHARE;
  const k = series.length;
  const gap = band - 2 * offset - (k - 1) * BAR_GAP <= 0 ? 0 : BAR_GAP;
  let full = (band - 2 * offset - (k - 1) * gap) / k;
  if (full > 1) full = Math.floor(full);
  const size = Math.min(full, BAR_MAX);
  return {
    view,
    band,
    bars: series.map((s, j) =>
      Array.from({ length: n }, (_, i) => {
        const top = y(value(s, i));
        return { x: i * band + offset + (full + gap) * j + (full - size) / 2, y: top, w: size, h: h - top };
      }),
    ),
  };
}

// O quadro da animação: ao abrir, a forma final (a curva é revelada pelo clipPath; as barras sobem do chão); com outros
// dados, cada ponto anda do ponto equivalente do desenho anterior.
function blend(from: Shape | null, to: Shape, t: number, h: number): Shape {
  if (to.view === 'curve') {
    if (!from || from.view !== 'curve') return to;
    return {
      view: 'curve',
      lines: to.lines.map((pts, k) => {
        const prev = from.lines[k];
        if (!prev?.length) return pts;
        return pts.map((p, i) => {
          const q = prev[Math.floor((i * prev.length) / pts.length)];
          return q ? { x: lerp(q.x, p.x, t), y: lerp(q.y, p.y, t) } : p;
        });
      }),
    };
  }
  const prevBars = from && from.view === 'bar' ? from.bars : null;
  return {
    ...to,
    bars: to.bars.map((rects, k) => {
      const prev = prevBars?.[k];
      return rects.map((r, i) => {
        const q = prev?.length ? prev[Math.floor((i * prev.length) / rects.length)] : null;
        if (q) return { x: lerp(q.x, r.x, t), y: lerp(q.y, r.y, t), w: lerp(q.w, r.w, t), h: lerp(q.h, r.h, t) };
        const grown = r.h * t;
        return { ...r, y: h - grown, h: grown };
      });
    }),
  };
}

/** A curva monotone (a do d3, curveMonotoneX): passa por todos os pontos sem inventar picos entre eles. */
export function monotonePath(pts: Point[]): string {
  const n = pts.length;
  if (!n) return '';
  if (n === 1) return `M${num(pts[0].x)},${num(pts[0].y)}`;
  if (n === 2) return `M${num(pts[0].x)},${num(pts[0].y)}L${num(pts[1].x)},${num(pts[1].y)}`;
  const sign = (v: number) => (v < 0 ? -1 : 1);
  const tangents: number[] = new Array(n);
  for (let i = 1; i < n - 1; i++) {
    const h0 = pts[i].x - pts[i - 1].x;
    const h1 = pts[i + 1].x - pts[i].x;
    const s0 = (pts[i].y - pts[i - 1].y) / (h0 || (h1 < 0 ? -0 : 0));
    const s1 = (pts[i + 1].y - pts[i].y) / (h1 || (h0 < 0 ? -0 : 0));
    const p = (s0 * h1 + s1 * h0) / (h0 + h1);
    tangents[i] = (sign(s0) + sign(s1)) * Math.min(Math.abs(s0), Math.abs(s1), 0.5 * Math.abs(p)) || 0;
  }
  const end = (a: Point, b: Point, t: number) => {
    const hx = b.x - a.x;
    return hx ? ((3 * (b.y - a.y)) / hx - t) / 2 : t;
  };
  tangents[0] = end(pts[0], pts[1], tangents[1]);
  tangents[n - 1] = end(pts[n - 2], pts[n - 1], tangents[n - 2]);
  let d = `M${num(pts[0].x)},${num(pts[0].y)}`;
  for (let i = 0; i < n - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const dx = (b.x - a.x) / 3;
    d += `C${num(a.x + dx)},${num(a.y + dx * tangents[i])},${num(b.x - dx)},${num(b.y - dx * tangents[i + 1])},${num(b.x)},${num(b.y)}`;
  }
  return d;
}

// Três casas bastam no desenho.
const num = (v: number) => Math.round(v * 1000) / 1000;

// A barra com os dois cantos de cima arredondados (6 px, menos se ela for mais estreita ou mais baixa que isso).
function roundedTop(rect: Rect) {
  const [x, y, w, h] = [rect.x, rect.y, rect.w, rect.h].map((v) => Math.round(v * 1e4) / 1e4);
  if (h <= 0 || w <= 0) return '';
  const r = Math.min(BAR_RADIUS, w / 2, h);
  return `M${x},${y + r}A${r},${r},0,0,1,${x + r},${y}L${x + w - r},${y}A${r},${r},0,0,1,${x + w},${y + r}L${x + w},${y + h}L${x},${y + h}Z`;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Uma curva de easing como a cubic-bezier() do CSS. */
function bezier(x1: number, y1: number, x2: number, y2: number) {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const xAt = (t: number) => ((ax * t + bx) * t + cx) * t;
  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let lo = 0;
    let hi = 1;
    let t = x;
    for (let i = 0; i < 30; i++) {
      const v = xAt(t);
      if (Math.abs(v - x) < 1e-7) break;
      if (v < x) lo = t;
      else hi = t;
      t = (lo + hi) / 2;
    }
    return ((ay * t + by) * t + cy) * t;
  };
}

/* ---------- os ganchos ---------- */

const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

const REDUCE = '(prefers-reduced-motion: reduce)';
const onReduceChange = (cb: () => void) => {
  const mq = window.matchMedia(REDUCE);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
};

/** O reduzir movimento do sistema (no servidor, desligado). */
export function usePrefersReducedMotion() {
  return useSyncExternalStore(onReduceChange, () => window.matchMedia(REDUCE).matches, () => false);
}

/** O tamanho do elemento em px inteiros, o do layout (sem os transforms em volta, como uma prévia encolhida com scale).
 *  0 × 0 até a primeira medida. */
function useBox() {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useIsomorphicLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const set = (w: number, h: number) =>
      setBox((b) => (b.w === Math.floor(w) && b.h === Math.floor(h) ? b : { w: Math.floor(w), h: Math.floor(h) }));
    set(node.clientWidth, node.clientHeight);
    const ro = new ResizeObserver(([entry]) => set(entry.contentRect.width, entry.contentRect.height));
    ro.observe(node);
    return () => ro.disconnect();
  }, []);
  return [box, ref] as const;
}
