'use client';

import ProgressMetricCard, { type ProgressMetricCardProps, type SeriesPoint } from './ui/progress-metric-card';

// Os pedidos de uma loja de exemplo, a cada três dias.
const ordersSeries: SeriesPoint[] = [
  { value: 100, date: '18 mar 2026' },
  { value: 115, date: '21 mar 2026' },
  { value: 120, date: '24 mar 2026' },
  { value: 110, date: '27 mar 2026' },
  { value: 178, date: '30 mar 2026' },
  { value: 180, date: '02 abr 2026' },
  { value: 205, date: '05 abr 2026' },
  { value: 185, date: '08 abr 2026' },
  { value: 180, date: '11 abr 2026' },
  { value: 183, date: '14 abr 2026' },
  { value: 185, date: '17 abr 2026' },
  { value: 185, date: '20 abr 2026' },
  { value: 166, date: '23 abr 2026' },
  { value: 181, date: '26 abr 2026' },
  { value: 168, date: '29 abr 2026' },
  { value: 195, date: '02 mai 2026' },
  { value: 188, date: '05 mai 2026' },
  { value: 162, date: '08 mai 2026' },
  { value: 166, date: '11 mai 2026' },
];

/**
 * O card escuro no centro de uma página escura, com até 664 px de largura (760 com a folga de 48 px de cada lado; 16 px
 * numa tela de celular). As props passam para o card: <ProgressMetricCardDemo size="lg" />, por exemplo.
 */
export default function ProgressMetricCardDemo(props: Partial<ProgressMetricCardProps>) {
  return (
    <div className="pmc-demo">
      <style dangerouslySetInnerHTML={{ __html: DEMO_CSS }} />
      <div className="pmc-demo__frame">
        <ProgressMetricCard
          title="Total de pedidos"
          unit="pedidos"
          data={ordersSeries}
          defaultIndex={6}
          theme="dark"
          {...props}
        />
      </div>
    </div>
  );
}

const DEMO_CSS = `
.pmc-demo {
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  width: 100%;
  min-height: 100svh;
  background: oklch(14.5% 0 0);
}
.pmc-demo__frame { box-sizing: border-box; display: flex; flex-direction: column; gap: 16px; width: 100%; max-width: 760px; padding: 48px; }
@media (max-width: 640px) {
  .pmc-demo__frame { padding: 16px; }
}
`;
