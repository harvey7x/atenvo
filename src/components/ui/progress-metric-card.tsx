'use client';

import { useId, useMemo, useState, version, type StyleHTMLAttributes } from 'react';
import {
  ACCENTS,
  formatCompact,
  MetricChart,
  SERIES_COLORS,
  type ChartSeries,
  type ChartView,
  type MetricAccent,
  type MetricSeries,
  type SeriesPoint,
} from './metric-chart';
import { Icon, PeriodSelect, ViewToggle, type PeriodOption } from './metric-controls';

/**
 * Progress Metric Card — o cartão de um indicador: o número grande à esquerda e, atrás dele, à direita, o gráfico da
 * série (a curva com a área em degradê ou as barras), num fundo de pontos que some para a esquerda. Em cima, a troca
 * entre a curva e as barras, a variação no período e o menu do período; no rodapé, a variação do último ponto e o
 * máximo, o mínimo e a média.
 *
 * - Os números saem da série principal (a primeira) e acompanham o período; total, delta e percent passam por cima.
 * - Verde quando o período fecha em alta, vermelho em baixa e cinza quando a variação fica abaixo de 0,5% (accent e trend
 *   fixam a cor e a seta).
 * - Com series, várias linhas (ou barras lado a lado) com a legenda e o balão de todas.
 * - loading mostra o esqueleto; sem pelo menos dois pontos, o aviso de sem dados.
 * - O tema é claro de fábrica; escuro com theme="dark" ou, sem theme, dentro da classe dark do projeto.
 *
 * Só React: o gráfico é um <svg> desenhado em ./metric-chart, os ícones são desenhados aqui e o CSS mora no fim deste
 * arquivo. Sem Tailwind, sem bibliotecas.
 */

// Os tipos, para quem usa o card importar só este arquivo.
export type { SeriesPoint, MetricSeries, MetricAccent, ChartView, PeriodOption };

export type CardSize = 'sm' | 'md' | 'lg';

export interface ProgressMetricCardProps {
  title: string;
  total?: string | number;
  delta?: string;
  deltaLabel?: string;
  percent?: string;
  trend?: 'up' | 'down';
  unit?: string;
  period?: string;
  periodOptions?: PeriodOption[];
  onPeriodChange?: (option: PeriodOption) => void;
  defaultView?: ChartView;
  accent?: MetricAccent;
  /** Uma série só. Passe esta ou series. */
  data?: SeriesPoint[];
  /** Várias séries com nome. Vale mais que data. */
  series?: MetricSeries[];
  defaultIndex?: number;
  size?: CardSize;
  /** Mostra o máximo, o mínimo e a média no rodapé. */
  showStats?: boolean;
  /** O formato dos valores. Sem ele, compacto no número grande e exato no balão. */
  valueFormatter?: (value: number) => string;
  dateFormatter?: (date: string) => string;
  loading?: boolean;
  theme?: 'light' | 'dark';
  className?: string;
}

const DEFAULT_PERIODS: PeriodOption[] = [
  { label: 'Últimos 7 dias', points: 4 },
  { label: 'Últimos 14 dias', points: 7 },
  { label: 'Últimos 30 dias' },
];

// A parte do card (a partir da direita) que o gráfico ocupa.
const REGION_W = 62; // %
// Variação abaixo disso é "estável": cor neutra.
const NEUTRAL_PCT = 0.5;

const sliceWindow = (points: SeriesPoint[], n?: number) =>
  n && n < points.length ? points.slice(-n) : points;

const percentText = (n: number) => `${Math.abs(n).toFixed(1).replace('.', ',')}%`;

export default function ProgressMetricCard({
  title,
  total,
  delta,
  deltaLabel = 'hoje',
  percent,
  trend,
  unit,
  period = 'Últimos 30 dias',
  periodOptions,
  onPeriodChange,
  defaultView = 'curve',
  accent,
  data,
  series,
  defaultIndex,
  size = 'md',
  showStats = true,
  valueFormatter,
  dateFormatter,
  loading = false,
  theme,
  className,
}: ProgressMetricCardProps) {
  const gridId = `grid-${useId().replace(/:/g, '')}`;
  const shell = {
    className: ['pmc-root', className].filter(Boolean).join(' '),
    'data-pmc-size': size,
    'data-pmc-theme': theme,
  };

  const periods = periodOptions ?? DEFAULT_PERIODS;
  const [selectedLabel, setSelectedLabel] = useState(period);
  const [view, setView] = useState<ChartView>(defaultView);

  // Uma data só vira uma lista de uma série.
  const baseSeries: MetricSeries[] = useMemo(
    () => (series?.length ? series : [{ name: title, data: data ?? [], accent }]),
    [series, data, title, accent],
  );

  const selectedOption =
    periods.find((p) => p.label === selectedLabel) ?? periods[periods.length - 1];

  // Cada série recortada no período escolhido.
  const visibleSeries = useMemo(
    () => baseSeries.map((s) => ({ ...s, data: sliceWindow(s.data, selectedOption?.points) })),
    [baseSeries, selectedOption],
  );

  const primary = visibleSeries[0];
  const isMulti = visibleSeries.length > 1;
  const hasData = (primary?.data.length ?? 0) >= 2;

  // Os números saem da série principal, então o card fica coerente e acompanha o período. As props passam por cima.
  const stats = useMemo(() => {
    const vals = primary?.data.map((d) => d.value) ?? [];
    const sum = vals.reduce((a, b) => a + b, 0);
    const first = vals[0] ?? 0;
    const last = vals[vals.length - 1] ?? 0;
    const prev = vals[vals.length - 2] ?? first;
    const net = last - first;
    return {
      sum,
      net,
      pct: first ? (net / first) * 100 : 0,
      step: last - prev,
      peak: vals.length ? Math.max(...vals) : 0,
      low: vals.length ? Math.min(...vals) : 0,
      avg: vals.length ? sum / vals.length : 0,
    };
  }, [primary]);

  // A cor segue o sentido (o último ponto contra o primeiro), com uma faixa neutra.
  const resolvedTrend: 'up' | 'down' | 'flat' =
    trend ?? (Math.abs(stats.pct) < NEUTRAL_PCT ? 'flat' : stats.net >= 0 ? 'up' : 'down');
  const resolvedAccent: MetricAccent =
    accent ?? (resolvedTrend === 'up' ? 'emerald' : resolvedTrend === 'down' ? 'rose' : 'neutral');
  const color = ACCENTS[resolvedAccent];

  const fmtCompact = valueFormatter ?? formatCompact;
  const fmtFull = valueFormatter ?? ((n: number) => n.toLocaleString('pt-BR') + (unit ? ` ${unit}` : ''));
  const fmtDate = dateFormatter ?? ((d: string) => d);
  const sign = (n: number) => (n >= 0 ? '+' : '−') + fmtCompact(Math.abs(n));

  const displayTotal = total ?? fmtCompact(stats.sum);
  const displayDelta = delta ?? sign(stats.step);
  const displayPercent = percent ?? percentText(stats.pct);

  // A cor de cada série: o accent dela, senão a paleta (com várias), senão a do card.
  const chartSeries: ChartSeries[] = visibleSeries.map((s, i) => ({
    name: s.name,
    data: s.data,
    color: s.accent
      ? ACCENTS[s.accent].stroke
      : isMulti
        ? SERIES_COLORS[i % SERIES_COLORS.length]
        : color.stroke,
  }));

  const lastIndex = (primary?.data.length ?? 1) - 1;
  const fallback = Math.min(defaultIndex ?? lastIndex, lastIndex);

  const handlePeriodChange = (option: PeriodOption) => {
    setSelectedLabel(option.label);
    onPeriodChange?.(option);
  };

  if (loading) {
    return (
      <div {...shell} aria-busy="true">
        <PmcStyles />
        <div className="pmc-content pmc-content--plain">
          <div className="pmc-skeleton__row">
            <div className="pmc-skeleton" style={{ width: 128, height: 20, borderRadius: 4 }} />
            <div className="pmc-skeleton" style={{ width: 96, height: 20, borderRadius: 4 }} />
          </div>
          <div className="pmc-skeleton" style={{ marginTop: 24, width: 192, height: 56 }} />
          <div className="pmc-skeleton pmc-skeleton--soft" style={{ marginTop: 'auto', width: '100%', height: 96 }} />
        </div>
        <div className="pmc-foot pmc-foot--plain">
          <div className="pmc-skeleton" style={{ width: 160, height: 16, borderRadius: 4 }} />
        </div>
      </div>
    );
  }

  if (!hasData) {
    return (
      <div {...shell}>
        <PmcStyles />
        <div className="pmc-content pmc-content--plain">
          <h3 className="pmc-title">{title}</h3>
          <div className="pmc-empty">
            <p className="pmc-empty__title">Ainda sem dados</p>
            <p className="pmc-empty__text">As métricas aparecem quando houver dados.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div {...shell}>
      <PmcStyles />
      {/* O gráfico, à direita, atrás do conteúdo */}
      <div className="pmc-region" style={{ width: `${REGION_W}%` }}>
        <div
          className="pmc-fill"
          style={{ background: `linear-gradient(to left, ${color.stroke}1f, transparent 75%)` }}
        />
        <div className="pmc-fill pmc-dots">
          <svg aria-hidden="true">
            <defs>
              <pattern id={gridId} width="14" height="14" patternUnits="userSpaceOnUse">
                <circle cx="1" cy="1" r="1" fill="currentColor" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill={`url(#${gridId})`} />
          </svg>
        </div>

        <MetricChart
          series={chartSeries}
          view={view}
          defaultIndex={fallback}
          valueFormatter={fmtFull}
          dateFormatter={fmtDate}
          label={`${title}: gráfico de ${view === 'curve' ? 'curva' : 'barras'}, ${selectedLabel.toLowerCase()}. Use as setas para percorrer os pontos.`}
        />
      </div>

      {/* O conteúdo */}
      <div className="pmc-content">
        <div className="pmc-head">
          <div className="pmc-head__start">
            <h3 className="pmc-title">{title}</h3>
            <ViewToggle value={view} onChange={setView} />
          </div>
          <div className="pmc-head__end">
            <span className="pmc-trend" style={{ color: color.text }}>
              <Icon size={16} strokeWidth={2.5}>
                {resolvedTrend === 'flat' ? (
                  <>
                    <path d="M5 12h14" />
                    <path d="m12 5 7 7-7 7" />
                  </>
                ) : resolvedTrend === 'down' ? (
                  <>
                    <path d="M12 5v14" />
                    <path d="m19 12-7 7-7-7" />
                  </>
                ) : (
                  <>
                    <path d="m5 12 7-7 7 7" />
                    <path d="M12 19V5" />
                  </>
                )}
              </Icon>
              {displayPercent}
            </span>
            <PeriodSelect
              value={selectedLabel}
              options={periods}
              onChange={handlePeriodChange}
              accentText={color.text}
            />
          </div>
        </div>

        {/* A legenda (só com várias séries) */}
        {isMulti && (
          <div className="pmc-legend">
            {chartSeries.map((s) => (
              <span key={s.name} className="pmc-legend__item">
                <span className="pmc-dot" style={{ background: s.color }} />
                {s.name}
              </span>
            ))}
          </div>
        )}

        <div className="pmc-total">{displayTotal}</div>
      </div>

      {/* O rodapé: a variação do último ponto à esquerda e os números do período à direita */}
      <div className="pmc-foot">
        <div>
          <span className="pmc-strong" style={{ color: color.text }}>
            {displayDelta}
          </span>{' '}
          <span className="pmc-muted">{deltaLabel}</span>
        </div>
        {showStats && (
          <div className="pmc-stats">
            <span>
              <span className="pmc-stats__value">{fmtCompact(stats.peak)}</span> máx
            </span>
            <span className="pmc-stats__sep">·</span>
            <span>
              <span className="pmc-stats__value">{fmtCompact(stats.low)}</span> mín
            </span>
            <span className="pmc-stats__sep">·</span>
            <span>
              <span className="pmc-stats__value">{fmtCompact(Math.round(stats.avg))}</span> média
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// O React 19 sobe uma <style> com href e precedence para o <head>, uma vez só para todos os cards. O React 18 não
// conhece isso: lá ela vai dentro do card, escondida e com o CSS cru, porque como filho de texto o SSR do 18 escaparia
// as aspas e quebraria os seletores.
const HOISTS_STYLES = Number(version.split('.')[0]) >= 19;

// exportado (Reviza 14/11): o card compacto da casa (v2/components/CartaoMetrica) reusa este CSS
export function PmcStyles() {
  if (HOISTS_STYLES) {
    const hoist = { href: 'progress-metric-card', precedence: 'default' } as StyleHTMLAttributes<HTMLStyleElement>;
    return <style {...hoist}>{PMC_CSS}</style>;
  }
  return <style hidden dangerouslySetInnerHTML={{ __html: PMC_CSS }} />;
}

const PMC_CSS = `
/* o que o projeto pode trocar com uma classe (largura, margem): na camada base, que vem antes das classes de
   componente e dos utilitários (Tailwind v4) e perde para o CSS fora de camada (Tailwind v3, CSS Modules, CSS comum) */
@layer base {
  .pmc-root { width: 100%; margin: 0; }
}

/* as cores: claro de fábrica; escuro com theme="dark" ou, sem theme, dentro da classe dark do projeto (a do shadcn e
   do next-themes). Dá para trocar qualquer uma no CSS do projeto */
.pmc-root {
  --pmc-card: oklch(100% 0 0);
  --pmc-text: oklch(14.5% 0 0);
  --pmc-muted: oklch(97% 0 0);
  --pmc-muted-text: oklch(55.6% 0 0);
  --pmc-border: oklch(92.2% 0 0);
  --pmc-ring: oklch(70.8% 0 0);
}
.dark .pmc-root:not([data-pmc-theme="light"]), .pmc-root[data-pmc-theme="dark"] {
  --pmc-card: oklch(20.5% 0 0);
  --pmc-text: oklch(98.5% 0 0);
  --pmc-muted: oklch(26.9% 0 0);
  --pmc-muted-text: oklch(70.8% 0 0);
  --pmc-border: oklch(100% 0 0 / 0.1);
  --pmc-ring: oklch(55.6% 0 0);
}

/* os tamanhos: a altura mínima, as margens, o título e o número grande */
.pmc-root, .pmc-root[data-pmc-size="md"] {
  --pmc-min-h: 380px; --pmc-pad-x: 32px; --pmc-pad-top: 28px; --pmc-foot-y: 16px; --pmc-title: 17px; --pmc-headline: 72px;
}
.pmc-root[data-pmc-size="sm"] {
  --pmc-min-h: 260px; --pmc-pad-x: 24px; --pmc-pad-top: 20px; --pmc-foot-y: 12px; --pmc-title: 15px; --pmc-headline: 46px;
}
.pmc-root[data-pmc-size="lg"] {
  --pmc-min-h: 460px; --pmc-pad-x: 40px; --pmc-pad-top: 36px; --pmc-foot-y: 20px; --pmc-title: 19px; --pmc-headline: 88px;
}

/* o card; nada de texto herdado da página: ele fica igual em qualquer projeto */
.pmc-root {
  box-sizing: border-box;
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: var(--pmc-min-h);
  overflow: hidden;
  border: 1px solid var(--pmc-border);
  border-radius: 28px;
  background: var(--pmc-card);
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.04);
  color: var(--pmc-text);
  font-family: ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji";
  font-size: 16px;
  font-style: normal;
  font-weight: 400;
  line-height: 1.5;
  letter-spacing: normal;
  text-align: left;
  text-transform: none;
  text-shadow: none;
  -webkit-font-smoothing: auto;
  -moz-osx-font-smoothing: auto;
}
.pmc-root *, .pmc-root *::before, .pmc-root *::after { box-sizing: border-box; }
.pmc-root :where(h3, p) { margin: 0; font-size: inherit; font-weight: inherit; }
.pmc-root :where(svg) { display: block; flex-shrink: 0; }
.pmc-root :where(button) {
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: none;
  color: inherit;
  font: inherit;
  letter-spacing: inherit;
  text-align: inherit;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.pmc-root :where(button):focus { outline: none; }
.pmc-root :where(button):focus-visible { outline: 2px solid var(--pmc-ring); outline-offset: 2px; }

/* o gráfico, à direita: o brilho da cor, os pontos (que somem para a esquerda) e o <svg> */
.pmc-region { position: absolute; top: 0; right: 0; bottom: 0; z-index: 0; }
.pmc-fill { position: absolute; inset: 0; }
.pmc-dots {
  color: color-mix(in oklab, var(--pmc-text) 13%, transparent);
  -webkit-mask-image: linear-gradient(to right, transparent, black 55%);
  mask-image: linear-gradient(to right, transparent, black 55%);
}
.pmc-dots svg { width: 100%; height: 100%; }
.pmc-chart { position: relative; width: 100%; height: 100%; min-width: 0; }
.pmc-chart__box { position: absolute; top: 0; left: 0; }
.pmc-chart__svg { width: 100%; height: 100%; touch-action: pan-y; user-select: none; -webkit-user-select: none; }
.pmc-chart__svg:focus { outline: none; }
.pmc-chart__svg:focus-visible { outline: 2px solid var(--pmc-ring); outline-offset: -2px; }

/* o balão do ponto marcado: à esquerda do ponto, na altura do mouse */
.pmc-tip-wrap { position: absolute; top: 0; left: 0; z-index: 20; pointer-events: none; }
.pmc-tip {
  white-space: nowrap;
  border: 1px solid var(--pmc-border);
  border-radius: 10px;
  background: var(--pmc-card);
  padding: 8px 12px;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.1);
  transform: translate(calc(-100% - 16px), -50%);
}
.pmc-tip__row { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; line-height: 1.25; color: var(--pmc-text); }
.pmc-tip__name { font-weight: 400; color: var(--pmc-muted-text); }
.pmc-tip__value { margin-left: auto; }
.pmc-tip__date { margin-top: 2px; font-size: 11px; line-height: 1.25; color: var(--pmc-muted-text); }
.pmc-dot { width: 8px; height: 8px; flex-shrink: 0; border-radius: 9999px; }

/* o conteúdo, por cima do gráfico: ele deixa o mouse passar, menos nos controles */
.pmc-content {
  pointer-events: none;
  position: relative;
  z-index: 10;
  display: flex;
  flex: 1 1 0%;
  flex-direction: column;
  padding: var(--pmc-pad-top) var(--pmc-pad-x) 0;
}
.pmc-content--plain { pointer-events: auto; }
.pmc-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px 16px; }
.pmc-head__start { display: flex; align-items: center; gap: 12px; }
.pmc-head__end { display: flex; align-items: center; gap: 14px; font-size: 14px; }
.pmc-title { font-size: var(--pmc-title); font-weight: 600; letter-spacing: -0.025em; color: var(--pmc-text); }
.pmc-trend { display: flex; align-items: center; gap: 4px; font-weight: 500; }
.pmc-legend { margin-top: 10px; display: flex; flex-wrap: wrap; align-items: center; gap: 4px 16px; }
.pmc-legend__item { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--pmc-muted-text); }
.pmc-total {
  margin-top: 20px;
  font-size: var(--pmc-headline);
  font-weight: 500;
  line-height: 1;
  letter-spacing: -0.025em;
  color: var(--pmc-text);
}

/* a troca entre a curva e as barras */
.pmc-toggle {
  pointer-events: auto;
  display: inline-flex;
  align-items: center;
  gap: 2px;
  border: 1px solid var(--pmc-border);
  border-radius: 10px;
  background: var(--pmc-card);
  padding: 2px;
}
.pmc-root .pmc-toggle__btn {
  display: flex;
  width: 28px;
  height: 28px;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  color: var(--pmc-muted-text);
  transition: color 0.15s cubic-bezier(0.4, 0, 0.2, 1), background-color 0.15s cubic-bezier(0.4, 0, 0.2, 1);
}
.pmc-root .pmc-toggle__btn[aria-pressed="true"] { background: var(--pmc-muted); color: var(--pmc-text); }

/* o menu do período */
.pmc-period { pointer-events: auto; position: relative; }
.pmc-root .pmc-period__btn {
  display: flex;
  align-items: center;
  gap: 4px;
  border-radius: 8px;
  color: var(--pmc-muted-text);
  user-select: none;
  -webkit-user-select: none;
  transition: color 0.15s cubic-bezier(0.4, 0, 0.2, 1);
}
.pmc-period__chevron { opacity: 0.7; transition: rotate 0.2s cubic-bezier(0.4, 0, 0.2, 1); }
.pmc-period__btn[aria-expanded="true"] .pmc-period__chevron { rotate: 180deg; }
.pmc-menu {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: 30;
  display: flex;
  min-width: 170px;
  flex-direction: column;
  gap: 4px;
  overflow: hidden;
  border: 1px solid var(--pmc-border);
  border-radius: 14px;
  background: var(--pmc-card);
  padding: 6px;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.18);
}
.pmc-root .pmc-menu__option {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border-radius: 10px;
  padding: 8px 12px;
  font-size: 13px;
  text-align: left;
  color: color-mix(in oklab, var(--pmc-text) 75%, transparent);
  transition: color 0.15s cubic-bezier(0.4, 0, 0.2, 1), background-color 0.15s cubic-bezier(0.4, 0, 0.2, 1);
}
.pmc-root .pmc-menu__option[aria-selected="true"] { background: var(--pmc-muted); font-weight: 500; color: var(--pmc-text); }
.pmc-root .pmc-menu__option:focus-visible { outline-offset: -2px; }
@media (hover: hover) {
  .pmc-root .pmc-toggle__btn:hover, .pmc-root .pmc-period__btn:hover { color: var(--pmc-text); }
  .pmc-root .pmc-menu__option:not([aria-selected="true"]):hover {
    background: color-mix(in oklab, var(--pmc-muted) 60%, transparent);
    color: var(--pmc-text);
  }
}

/* o rodapé, opaco por cima do pé do gráfico */
.pmc-foot {
  position: relative;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  border-top: 1px solid color-mix(in oklab, var(--pmc-text) 6%, transparent);
  background: var(--pmc-card);
  padding: var(--pmc-foot-y) var(--pmc-pad-x);
  font-size: 14px;
}
.pmc-strong { font-weight: 500; }
.pmc-muted { color: var(--pmc-muted-text); }
.pmc-stats { display: flex; align-items: center; gap: 10px; font-size: 12px; color: var(--pmc-muted-text); }
.pmc-stats__value { font-weight: 500; color: color-mix(in oklab, var(--pmc-text) 80%, transparent); }
.pmc-stats__sep { opacity: 0.4; }

/* o carregando e o sem dados */
.pmc-skeleton__row { display: flex; align-items: center; justify-content: space-between; }
.pmc-skeleton { border-radius: 10px; background: var(--pmc-muted); animation: pmc-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
.pmc-skeleton--soft { background: color-mix(in oklab, var(--pmc-muted) 50%, transparent); }
.pmc-foot--plain { display: block; }
@keyframes pmc-pulse { 50% { opacity: 0.5; } }
.pmc-empty {
  display: flex;
  flex: 1 1 0%;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 40px 0;
  text-align: center;
}
.pmc-empty__title { font-size: 14px; font-weight: 500; line-height: 20px; color: var(--pmc-text); }
.pmc-empty__text { font-size: 12px; line-height: 16px; color: var(--pmc-muted-text); }

@media (prefers-reduced-motion: reduce) {
  .pmc-skeleton { animation: none; }
  .pmc-root .pmc-toggle__btn, .pmc-root .pmc-period__btn, .pmc-root .pmc-menu__option, .pmc-period__chevron { transition: none; }
}
`;
