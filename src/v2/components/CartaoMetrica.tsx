import { useId, useMemo, useState, type ReactNode } from 'react';
import { MetricChart, type ChartView, type SeriesPoint } from '@/components/ui/metric-chart';
import { Icon, PeriodSelect, ViewToggle, type PeriodOption } from '@/components/ui/metric-controls';
import { PmcStyles } from '@/components/ui/progress-metric-card';
import { useTemaAtual } from '@/v2/lib/temaAtual';
import './cartaoMetrica.css';

/* ------------------------------------------------------------------
   Card de métrica da Reviza — a versão COMPACTA do Progress Metric Card
   (dono 14/11: "ficou muito grande … deixa otimizado pro sistema da Reviza,
   bem encaixado"). Mesmo motor (o gráfico, a troca curva/barras e o menu do
   período vêm de components/ui, sem mudar), na medida e na cara da casa:
   4 por linha como os indicadores de antes, fonte e cantos da Reviza, cores
   verde/vermelho da régua da ALFA, e o card cresce um pouco ao passar o mouse.

     [Título ....................... 6 meses ⌄]
     [R$ 32.580,00  ↑ 25,1%                  ]
     [~~~~~~~~ gráfico (curva ou barras) ~~~~~]
     [+R$ 0 vs out/26 ............ curva|barras]

   O SENTIDO de cada indicador decide a cor:
     maior  = subir é bom (verde quando sobe);
     menor  = subir é ruim (Em atraso: vermelho quando sobe);
     neutro = nem bom nem ruim (Não elegíveis): cinza.
   "Subiu ou desceu" é a conta do card original: o último ponto da janela
   contra o primeiro, com a faixa neutra de 0,5%.
   ------------------------------------------------------------------ */

export type SentidoMetrica = 'maior' | 'menor' | 'neutro';
export type { PeriodOption, SeriesPoint };

// a régua de cores da ALFA (reviza-sistema.css): o verde e o vermelho de cada tema
const CORES = {
  dark: { bom: '#3FAA79', ruim: '#E0504F', neutro: '#8A8F98' },
  light: { bom: '#2A7352', ruim: '#A23F33', neutro: '#666C76' },
} as const;
const FAIXA_NEUTRA = 0.5;
const pctTexto = (n: number) => `${Math.abs(n).toFixed(1).replace('.', ',')}%`;

const SETAS = {
  flat: <><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></>,
  down: <><path d="M12 5v14" /><path d="m19 12-7 7-7-7" /></>,
  up: <><path d="m5 12 7-7 7 7" /><path d="M12 19V5" /></>,
};

export function CartaoMetrica({
  titulo, data, total, sentido = 'maior', periodos, periodo, formatar, formatarData, rotuloDelta, carregando,
}: {
  titulo: string;
  /** a série, do mais antigo ao mais novo */
  data: SeriesPoint[];
  /** o número grande: pronto, ou calculado da janela escolhida (soma dos dias, por exemplo) */
  total: ReactNode | ((janela: SeriesPoint[]) => ReactNode);
  sentido?: SentidoMetrica;
  periodos: PeriodOption[];
  /** o período que abre escolhido (pelo rótulo) */
  periodo: string;
  /** valor do balão e da variação ("R$ 4.066", "22 fechados") */
  formatar: (v: number) => string;
  formatarData: (d: string) => string;
  /** o que vem depois da variação do último ponto ("vs set/26", "hoje vs ontem") */
  rotuloDelta: string;
  carregando?: boolean;
}) {
  const tema = useTemaAtual();
  const grade = `rvm-pt-${useId().replace(/:/g, '')}`;
  const [rotulo, setRotulo] = useState(periodo);
  const [view, setView] = useState<ChartView>('curve');
  const opcao = periodos.find((p) => p.label === rotulo) ?? periodos[periodos.length - 1];
  const janela = useMemo(
    () => (opcao?.points && opcao.points < data.length ? data.slice(-opcao.points) : data),
    [data, opcao],
  );

  const n = janela.length;
  const temGrafico = n >= 2;
  const primeiro = janela[0]?.value ?? 0;
  const ultimo = janela[n - 1]?.value ?? 0;
  const penultimo = janela[n - 2]?.value ?? primeiro;
  const pct = primeiro ? ((ultimo - primeiro) / primeiro) * 100 : 0;
  const rumo: 'up' | 'down' | 'flat' = Math.abs(pct) < FAIXA_NEUTRA ? 'flat' : ultimo >= primeiro ? 'up' : 'down';
  const pal = CORES[tema];
  const cor = sentido === 'neutro' || rumo === 'flat' ? pal.neutro : (rumo === 'up') === (sentido === 'maior') ? pal.bom : pal.ruim;
  const passo = ultimo - penultimo;
  const delta = (passo >= 0 ? '+' : '−') + formatar(Math.abs(passo));
  const series = useMemo(() => [{ name: titulo, data: janela, color: cor }], [titulo, janela, cor]);
  const valor = typeof total === 'function' ? total(janela) : total;

  return (
    <article className={`pmc-root rvm${carregando ? ' rvm-carregando' : ''}`} aria-busy={carregando || undefined}>
      <PmcStyles />
      <header className="rvm-cab">
        <h3 className="rvm-tit">{titulo}</h3>
        <PeriodSelect value={rotulo} options={periodos} onChange={(o) => setRotulo(o.label)} accentText={cor} />
      </header>
      <div className="rvm-num">
        <span className="rvm-val">{carregando ? '—' : valor}</span>
        {temGrafico && !carregando && (
          <span className="rvm-var" style={{ color: cor }} title={`Do primeiro ao último ponto (${rotulo.toLowerCase()})`}>
            <Icon size={13} strokeWidth={2.5}>{SETAS[rumo]}</Icon>
            {pctTexto(pct)}
          </span>
        )}
      </div>
      <div className="rvm-graf">
        {temGrafico && !carregando ? (
          <>
            <div className="pmc-fill" style={{ background: `linear-gradient(to left, ${cor}1c, transparent 80%)` }} />
            <div className="pmc-fill pmc-dots">
              <svg aria-hidden="true">
                <defs>
                  <pattern id={grade} width="12" height="12" patternUnits="userSpaceOnUse">
                    <circle cx="1" cy="1" r="1" fill="currentColor" />
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill={`url(#${grade})`} />
              </svg>
            </div>
            <MetricChart
              series={series}
              view={view}
              valueFormatter={formatar}
              dateFormatter={formatarData}
              padTop={6}
              tipAuto
              label={`${titulo}: gráfico de ${view === 'curve' ? 'curva' : 'barras'}, ${rotulo}. Use as setas para percorrer os pontos.`}
            />
          </>
        ) : (
          <span className="rvm-vazio">{carregando ? '' : 'Ainda sem histórico para desenhar'}</span>
        )}
      </div>
      <footer className="rvm-pe">
        <span className="rvm-delta">
          {temGrafico && !carregando && <b style={{ color: cor }}>{delta}</b>} {rotuloDelta}
        </span>
        <ViewToggle value={view} onChange={setView} />
      </footer>
    </article>
  );
}

/** Indicador SEM série dia a dia (Tempo para fechar): a mesma moldura, a mesma altura,
 *  com a explicação no lugar do gráfico. */
export function CartaoMetricaFixo({ titulo, valor, detalhe, rodape }: {
  titulo: string; valor: ReactNode; detalhe?: ReactNode; rodape?: ReactNode;
}) {
  return (
    <article className="pmc-root rvm rvm-fixo">
      <PmcStyles />
      <header className="rvm-cab"><h3 className="rvm-tit">{titulo}</h3></header>
      <div className="rvm-num"><span className="rvm-val">{valor}</span></div>
      <div className="rvm-graf rvm-graf-texto">{detalhe}</div>
      <footer className="rvm-pe"><span className="rvm-delta">{rodape}</span></footer>
    </article>
  );
}

/** Grade dos cards: 4 por linha (como os indicadores de antes); 2 em tela média; 1 no celular. */
export function GradeMetricas({ children, rotulo }: { children: ReactNode; rotulo: string }) {
  return (
    <section className="pmc-grade-caixa" aria-label={rotulo}>
      <div className="pmc-grade">{children}</div>
    </section>
  );
}
