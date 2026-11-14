import { useState, type ReactNode } from 'react';
import ProgressMetricCard, {
  type MetricAccent, type PeriodOption, type ProgressMetricCardProps, type SeriesPoint,
} from '@/components/ui/progress-metric-card';
import { useTemaAtual } from '@/v2/lib/temaAtual';
import './cartaoMetrica.css';

/* ------------------------------------------------------------------
   O card de métrica da Reviza (dono 14/11: "todas as métricas … dessa forma"):
   o Progress Metric Card (components/ui, copiado tal e qual do pedido) com o
   tema da tela e o SENTIDO de cada indicador:
     maior  = subir é bom (verde quando sobe) — o padrão do card;
     menor  = subir é ruim (Em atraso): a seta segue o sentido, a cor inverte;
     neutro = nem bom nem ruim (Não elegíveis): cinza, a seta segue o sentido.
   A conta de "subiu ou desceu" é a MESMA do card: o último ponto da janela
   contra o primeiro, com a faixa neutra de 0,5%.
   ------------------------------------------------------------------ */

export type SentidoMetrica = 'maior' | 'menor' | 'neutro';
export type { PeriodOption, SeriesPoint };

const FAIXA_NEUTRA = 0.5;

type Props = Omit<ProgressMetricCardProps, 'theme' | 'accent' | 'data' | 'series'> & {
  data: SeriesPoint[];
  sentido?: SentidoMetrica;
};

export function CartaoMetrica({ data, sentido = 'maior', period, periodOptions, onPeriodChange, size = 'sm', ...resto }: Props) {
  const tema = useTemaAtual();
  const [rotulo, setRotulo] = useState(period);
  const opcoes = periodOptions ?? [];
  const opcao = opcoes.find((o) => o.label === rotulo) ?? opcoes[opcoes.length - 1];
  const janela = opcao?.points && opcao.points < data.length ? data.slice(-opcao.points) : data;

  let accent: MetricAccent | undefined;
  if (sentido === 'neutro') accent = 'neutral';
  else if (sentido === 'menor' && janela.length >= 2) {
    const primeiro = janela[0].value;
    const ultimo = janela[janela.length - 1].value;
    const pct = primeiro ? ((ultimo - primeiro) / primeiro) * 100 : 0;
    accent = Math.abs(pct) < FAIXA_NEUTRA ? 'neutral' : pct > 0 ? 'rose' : 'emerald';
  }

  return (
    <ProgressMetricCard
      {...resto}
      data={data}
      period={period}
      periodOptions={periodOptions}
      onPeriodChange={(o) => { setRotulo(o.label); onPeriodChange?.(o); }}
      accent={accent}
      size={size}
      theme={tema}
    />
  );
}

/** Indicador SEM série dia a dia (Tempo para fechar): a mesma moldura do card — título,
 *  número grande e rodapé — sem gráfico (não há histórico para desenhar). Usa as classes do
 *  card; mora na mesma grade, ao lado de um card com gráfico (que injeta o CSS pmc-*). */
export function CartaoMetricaFixo({ titulo, valor, rodapeEsq, rodapeDir }: {
  titulo: string; valor: ReactNode; rodapeEsq?: ReactNode; rodapeDir?: ReactNode;
}) {
  const tema = useTemaAtual();
  return (
    <div className="pmc-root pmc-fixo" data-pmc-size="sm" data-pmc-theme={tema}>
      <div className="pmc-content pmc-content--plain">
        <div className="pmc-head">
          <div className="pmc-head__start"><h3 className="pmc-title">{titulo}</h3></div>
        </div>
        <div className="pmc-total">{valor}</div>
      </div>
      <div className="pmc-foot">
        <div className="pmc-muted">{rodapeEsq}</div>
        {rodapeDir && <div className="pmc-stats">{rodapeDir}</div>}
      </div>
    </div>
  );
}

/** Grade dos cards: 2 por linha; 4 numa tela muito larga; 1 no celular. */
export function GradeMetricas({ children, rotulo }: { children: ReactNode; rotulo: string }) {
  return (
    <section className="pmc-grade-caixa" aria-label={rotulo}>
      <div className="pmc-grade">{children}</div>
    </section>
  );
}
