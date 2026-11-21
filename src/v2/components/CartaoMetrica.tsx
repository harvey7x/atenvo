import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { MetricChart, type ChartView, type SeriesPoint } from '@/components/ui/metric-chart';
import { Icon, PeriodSelect, ViewToggle, type PeriodOption } from '@/components/ui/metric-controls';
import { PmcStyles } from '@/components/ui/progress-metric-card';
import { useTemaAtual } from '@/v2/lib/temaAtual';
import { useMoldura } from '@/v2/lib/molduraAlfa';
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
/* moldura preta (dono 19/11, referência "Sales Dashboard"): o gráfico de cada card é sempre LARANJA;
   o verde/vermelho fica só na variação (o número diz se foi bom ou ruim, a cor do desenho é a da casa) */
const LARANJA = { dark: '#F5A524', light: '#F0921C' } as const;

/* o ícone de cada indicador (quadradinho laranja ao lado do título, só com a moldura) */
const ICONES = {
  repete: <><path d="m17 2 4 4-4 4" /><path d="M3 11v-1a4 4 0 0 1 4-4h14" /><path d="m7 22-4-4 4-4" /><path d="M21 13v1a4 4 0 0 1-4 4H3" /></>,
  carteira: <><path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" /><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" /></>,
  alerta: <><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" /><path d="M12 9v4" /><path d="M12 17h.01" /></>,
  certo: <><circle cx="12" cy="12" r="9" /><path d="m9 12 2 2 4-4" /></>,
  entra: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M19 8v6" /><path d="M22 11h-6" /></>,
  fora: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="m17 8 5 5" /><path d="m22 8-5 5" /></>,
  trofeu: <><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" /><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" /><path d="M4 22h16" /><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" /><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" /><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" /></>,
  relogio: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  sobe: <><path d="m22 7-8.5 8.5-5-5L2 17" /><path d="M16 7h6v6" /></>,
  calendario: <><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4" /><path d="M8 2v4" /><path d="M3 10h18" /></>,
};
export type IconeMetrica = keyof typeof ICONES;
const Selo = ({ icone }: { icone?: IconeMetrica }) => (icone
  ? <span className="rvm-ico" aria-hidden><Icon size={15} strokeWidth={2}>{ICONES[icone]}</Icon></span>
  : null);
const MES_ABREV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
/** '2026-11-14' → '14 nov 2026' (+ ' · até agora' quando é hoje): a data do balão dos gráficos por dia */
export function diaDoBalao(dia: string, hoje?: string): string {
  const [y, m, d] = dia.split('-');
  return `${d} ${MES_ABREV[Number(m) - 1] ?? m} ${y}${hoje && dia === hoje ? ' · até agora' : ''}`;
}
const pctTexto = (n: number) => `${Math.abs(n).toFixed(1).replace('.', ',')}%`;

const SETAS = {
  flat: <><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></>,
  down: <><path d="M12 5v14" /><path d="m19 12-7 7-7-7" /></>,
  up: <><path d="m5 12 7-7 7 7" /><path d="M12 19V5" /></>,
};

/* O número que CONTA até o valor (dono 21/11: "as métricas animadas"). Recebe o texto pronto
   ("R$ 32.580,00", "69%", "1,4 dia", "918"), acha o número em formato brasileiro e anima do valor
   mostrado até o novo em ~0,7 s, mantendo o que vem antes e depois. Sem movimento no sistema
   (ou texto sem número), mostra direto. */
const RE_NUMERO = /\d[\d.]*(?:,\d+)?/;
function Contagem({ texto }: { texto: string }) {
  const [mostrado, setMostrado] = useState(texto);
  const atual = useRef(0);
  useEffect(() => {
    const m = RE_NUMERO.exec(texto);
    if (!m || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setMostrado(texto); return; }
    const [inteiro, dec = ''] = m[0].split(',');
    const alvo = Number(`${inteiro.replace(/\./g, '')}.${dec || '0'}`);
    const casas = dec.length;
    const antes = texto.slice(0, m.index);
    const depois = texto.slice(m.index + m[0].length);
    const de = atual.current;
    if (!Number.isFinite(alvo) || de === alvo) { atual.current = alvo; setMostrado(texto); return; }
    let quadro = 0; let t0 = 0;
    const passo = (ts: number) => {
      if (!t0) t0 = ts;
      const p = Math.min(1, (ts - t0) / 700);
      const v = de + (alvo - de) * (1 - Math.pow(1 - p, 3));
      atual.current = v;
      setMostrado(p >= 1 ? texto : antes + v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas }) + depois);
      if (p < 1) quadro = requestAnimationFrame(passo);
    };
    quadro = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(quadro);
  }, [texto]);
  return <>{mostrado}</>;
}
const comContagem = (v: ReactNode): ReactNode => (typeof v === 'string' ? <Contagem texto={v} /> : v);

export function CartaoMetrica({
  titulo, data, total, sentido = 'maior', periodos, periodo, formatar, formatarData, rotuloDelta, carregando,
  cabEsquerda, cabDireita, unidade, numSub, variacao, tom, rodape, extra, className, graficoCarregando, icone,
}: {
  titulo: string;
  /** a série, do mais antigo ao mais novo */
  data: SeriesPoint[];
  /** o número grande: pronto, ou calculado da janela escolhida (soma dos dias, por exemplo) */
  total: ReactNode | ((janela: SeriesPoint[]) => ReactNode);
  sentido?: SentidoMetrica;
  /** o menu do período; sem ele o card usa a série inteira e mostra `cabDireita` */
  periodos?: PeriodOption[];
  /** o período que abre escolhido (pelo rótulo) */
  periodo?: string;
  /** valor do balão e da variação ("R$ 4.066", "22 fechados") */
  formatar: (v: number) => string;
  formatarData: (d: string) => string;
  /** o que vem depois da variação do último ponto ("vs set/26", "hoje vs ontem") */
  rotuloDelta?: string;
  carregando?: boolean;
  /** cabeçalho próprio no lugar do título (avatar + nome, por exemplo); o título fica para o leitor de tela */
  cabEsquerda?: ReactNode;
  /** à direita do cabeçalho quando não há menu de período (a campanha, o placar…) */
  cabDireita?: ReactNode;
  /** palavra pequena depois do número ("fechados") */
  unidade?: string;
  /** texto pequeno na linha do número, à direita ("16 fechados · 29 NE") */
  numSub?: ReactNode;
  /** a variação pronta no lugar da conta do card (ou false para esconder) */
  variacao?: ReactNode | false;
  /** a cor do gráfico decidida fora (melhor campanha, atendente: contra o período anterior) */
  tom?: 'bom' | 'ruim' | 'neutro';
  /** o rodapé pronto no lugar de "+N vs …" */
  rodape?: ReactNode;
  /** bloco entre o gráfico e o rodapé (os números do atendente) */
  extra?: ReactNode;
  className?: string;
  /** só o gráfico ainda carregando (o número já chegou): a faixa pulsa, sem texto */
  graficoCarregando?: boolean;
  /** o ícone do indicador (aparece com a moldura preta) */
  icone?: IconeMetrica;
}) {
  const tema = useTemaAtual();
  const grade = `rvm-pt-${useId().replace(/:/g, '')}`;
  const [rotulo, setRotulo] = useState(periodo ?? '');
  const [view, setView] = useState<ChartView>('curve');
  const opcao = periodos?.find((p) => p.label === rotulo) ?? periodos?.[periodos.length - 1];
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
  const cor = tom ? pal[tom]
    : sentido === 'neutro' || rumo === 'flat' ? pal.neutro : (rumo === 'up') === (sentido === 'maior') ? pal.bom : pal.ruim;
  const moldura = useMoldura();
  const corGraf = moldura ? LARANJA[tema] : cor;
  const passo = ultimo - penultimo;
  const delta = (passo >= 0 ? '+' : '−') + formatar(Math.abs(passo));
  const series = useMemo(() => [{ name: titulo, data: janela, color: corGraf }], [titulo, janela, corGraf]);
  const valor = typeof total === 'function' ? total(janela) : total;

  return (
    <article className={`pmc-root rvm${carregando ? ' rvm-carregando' : ''}${className ? ` ${className}` : ''}`} aria-busy={carregando || undefined}>
      <PmcStyles />
      <header className="rvm-cab">
        {cabEsquerda
          ? <div className="rvm-cab-esq"><Selo icone={icone} /><h3 className="rvm-sr">{titulo}</h3>{cabEsquerda}</div>
          : <div className="rvm-cab-esq"><Selo icone={icone} /><h3 className="rvm-tit">{titulo}</h3></div>}
        {periodos
          ? <PeriodSelect value={rotulo} options={periodos} onChange={(o) => setRotulo(o.label)} accentText={cor} />
          : cabDireita}
      </header>
      <div className="rvm-num">
        <span className="rvm-val">{carregando ? '—' : comContagem(valor)}</span>
        {unidade && !carregando && <span className="rvm-un">{unidade}</span>}
        {variacao !== undefined
          ? (variacao !== false && !carregando && variacao)
          : temGrafico && !carregando && (
            <span className="rvm-var" style={{ color: cor }} title={`Do primeiro ao último ponto (${(rotulo || 'período').toLowerCase()})`}>
              <Icon size={13} strokeWidth={2.5}>{SETAS[rumo]}</Icon>
              {pctTexto(pct)}
            </span>
          )}
        {numSub && !carregando && <span className="rvm-numsub">{numSub}</span>}
      </div>
      <div className={'rvm-graf' + (graficoCarregando ? ' rvm-graf-carregando' : '')}>
        {temGrafico && !carregando && !graficoCarregando ? (
          <>
            <div className="pmc-fill" style={{ background: `linear-gradient(to left, ${corGraf}1c, transparent 80%)` }} />
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
              label={`${titulo}: gráfico de ${view === 'curve' ? 'curva' : 'barras'}${rotulo ? `, ${rotulo}` : ''}. Use as setas para percorrer os pontos.`}
            />
          </>
        ) : (
          <span className="rvm-vazio">{carregando || graficoCarregando ? '' : 'Ainda sem histórico para desenhar'}</span>
        )}
      </div>
      {extra && !carregando && <div className="rvm-extra">{extra}</div>}
      <footer className="rvm-pe">
        <span className="rvm-delta">
          {rodape !== undefined ? rodape : <>{temGrafico && !carregando && <b style={{ color: cor }}>{delta}</b>} {rotuloDelta}</>}
        </span>
        {temGrafico && <ViewToggle value={view} onChange={setView} />}
      </footer>
    </article>
  );
}

/** Indicador SEM série dia a dia (Tempo para fechar): a mesma moldura, a mesma altura,
 *  com a explicação no lugar do gráfico. */
export function CartaoMetricaFixo({ titulo, valor, detalhe, rodape, icone }: {
  titulo: string; valor: ReactNode; detalhe?: ReactNode; rodape?: ReactNode; icone?: IconeMetrica;
}) {
  return (
    <article className="pmc-root rvm rvm-fixo">
      <PmcStyles />
      <header className="rvm-cab"><div className="rvm-cab-esq"><Selo icone={icone} /><h3 className="rvm-tit">{titulo}</h3></div></header>
      <div className="rvm-num"><span className="rvm-val">{comContagem(valor)}</span></div>
      <div className="rvm-graf rvm-graf-texto">{detalhe}</div>
      <footer className="rvm-pe"><span className="rvm-delta">{rodape}</span></footer>
    </article>
  );
}

/** Grade dos cards: 4 por linha (como os indicadores de antes); 2 em tela média; 1 no celular. */
export function GradeMetricas({ children, rotulo, colunas = 4 }: { children: ReactNode; rotulo: string; colunas?: 3 | 4 }) {
  return (
    <section className="pmc-grade-caixa" aria-label={rotulo}>
      <div className="pmc-grade" data-col={colunas}>{children}</div>
    </section>
  );
}

/** O título de um bloco de cards (no lugar do cartão grande em volta: card dentro de card
 *  pesava). Título + ajuda + subtítulo à esquerda; controles à direita. */
export function TituloBloco({ titulo, ajuda, sub, acao }: { titulo: string; ajuda?: ReactNode; sub?: ReactNode; acao?: ReactNode }) {
  return (
    <div className="rvm-bloco-cab">
      <div className="rvm-bloco-tx">
        <h2 className="rvm-bloco-tit">{titulo}{ajuda}</h2>
        {sub && <p className="rvm-bloco-sub">{sub}</p>}
      </div>
      {acao && <div className="rvm-bloco-acao">{acao}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------
   Card de VÁRIAS SÉRIES (dono 14/11: as ondas — "Ondas por campanha" e
   "Fechados da equipe" — no formato do card de métrica). É o modo "series"
   do Progress Metric Card na medida da casa: as linhas juntas sem área (ou
   barras lado a lado), a troca curva/barras, o fundo de pontos, o balão com
   todas as séries no ponto marcado, a legenda que esconde/mostra cada linha
   (com o total dela e o cresceu/caiu), o total do que está visível e, no
   rodapé, o máximo, o mínimo e a média por ponto.
   ------------------------------------------------------------------ */

/** a cor de série da casa (--dado-1…5) em hex: o gráfico desenha em atributo SVG, onde var() não vale.
 *  Os mesmos tons das bolinhas e dos selos (dashboardV5.css). */
const CORES_SERIE = {
  dark: ['#7C83F2', '#4CB0D9', '#3FB868', '#D1789B', '#8496AB'],
  light: ['#4F46E5', '#1F7E95', '#1E8A44', '#A14A77', '#5E7183'],
} as const;
const corDaSerie = (cor: string, tema: 'dark' | 'light', i: number): string => {
  const n = Number(/--dado-(\d)/.exec(cor)?.[1] ?? 0);
  const pal = CORES_SERIE[tema];
  return n >= 1 && n <= pal.length ? pal[n - 1] : /^#/.test(cor) ? cor : pal[i % pal.length];
};

export interface SerieCartao {
  id: string;
  rotulo: string;
  /** token da casa ('var(--dado-2)') ou hex */
  cor: string;
  /** valor por chave do ponto (ausente = 0) */
  valores: ReadonlyMap<string, number>;
  notas?: { texto: string; tom: 'ok' | 'er' | 'am' }[];
}

export function CartaoSeries({ titulo, ajuda, sub, acao, pontos, series, unidade, rodape, vazio, eixo }: {
  titulo: string;
  ajuda?: ReactNode;
  sub?: ReactNode;
  /** controles do topo (o que mostrar, como agrupar) — ficam antes da troca curva/barras */
  acao?: ReactNode;
  /** os pontos do eixo, em ordem (dia, semana ou mês): a chave e o texto do balão */
  pontos: { chave: string; rotulo: string }[];
  series: SerieCartao[];
  /** a palavra depois do número ("entradas", "fechados"), pelo valor */
  unidade: (n: number) => string;
  /** nota pequena no rodapé, à esquerda */
  rodape?: ReactNode;
  vazio: string;
  /** o texto curto de cada ponto no eixo de baixo ('08/11', 'sem 03/11'); sem ele, sem eixo */
  eixo?: string[];
}) {
  const tema = useTemaAtual();
  const grade = `rvm-pt-${useId().replace(/:/g, '')}`;
  const [view, setView] = useState<ChartView>('curve');
  const [ocultas, setOcultas] = useState<ReadonlySet<string>>(() => new Set());
  const alternar = (id: string) => setOcultas((prev) => {
    const prox = new Set(prev);
    if (prox.has(id)) prox.delete(id);
    else if (series.length - prox.size > 1) prox.add(id);   // a última linha visível nunca some
    return prox;
  });

  const comCor = useMemo(() => series.map((s, i) => ({
    ...s,
    hex: corDaSerie(s.cor, tema, i),
    total: pontos.reduce((t, p) => t + (s.valores.get(p.chave) ?? 0), 0),
  })), [series, pontos, tema]);
  const visiveis = comCor.filter((s) => !ocultas.has(s.id));
  const chart = useMemo(() => visiveis.map((s) => ({
    name: s.rotulo,
    color: s.hex,
    data: pontos.map((p) => ({ value: s.valores.get(p.chave) ?? 0, date: p.rotulo })),
  })), [visiveis, pontos]);
  const porPonto = pontos.map((p) => visiveis.reduce((t, s) => t + (s.valores.get(p.chave) ?? 0), 0));
  const total = porPonto.reduce((a, b) => a + b, 0);
  const temDado = pontos.length >= 2 && comCor.some((s) => s.total > 0);
  const max = porPonto.length ? Math.max(...porPonto) : 0;
  const min = porPonto.length ? Math.min(...porPonto) : 0;
  const media = porPonto.length ? Math.round(total / porPonto.length) : 0;
  const n = (v: number) => v.toLocaleString('pt-BR');

  return (
    <article className="pmc-root rvm rvm-series">
      <PmcStyles />
      <header className="rvm-cab rvm-series-cab">
        <div className="rvm-series-tx">
          <h3 className="rvm-series-tit">{titulo}{ajuda}</h3>
          {sub && <p className="rvm-series-sub">{sub}</p>}
        </div>
        <div className="rvm-series-acao">
          {acao}
          {temDado && <ViewToggle value={view} onChange={setView} />}
        </div>
      </header>
      <div className="rvm-num">
        <span className="rvm-val"><Contagem texto={n(total)} /></span>
        <span className="rvm-un">{unidade(total)}{ocultas.size > 0 ? ' nas linhas visíveis' : ''}</span>
      </div>
      <ul className="rvm-leg" aria-label="Linhas do gráfico (clique para esconder ou mostrar)">
        {comCor.map((s) => {
          const ligada = !ocultas.has(s.id);
          return (
            <li key={s.id}>
              <button type="button" className="rvm-leg-bt" aria-pressed={ligada} onClick={() => alternar(s.id)}
                title={ligada ? `Esconder ${s.rotulo}` : `Mostrar ${s.rotulo}`}>
                <i style={{ background: s.hex }} />
                <span className="rvm-leg-nome">{s.rotulo}</span>
                <b className="num">{n(s.total)}</b>
                {s.notas?.map((nt) => <span key={nt.texto} className={`rvm-leg-nota rvm-leg-${nt.tom}`}>{nt.texto}</span>)}
              </button>
            </li>
          );
        })}
      </ul>
      <div className="rvm-graf rvm-graf-g">
        {temDado ? (
          <>
            <div className="pmc-fill pmc-dots">
              <svg aria-hidden="true">
                <defs>
                  <pattern id={grade} width="14" height="14" patternUnits="userSpaceOnUse">
                    <circle cx="1" cy="1" r="1" fill="currentColor" />
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill={`url(#${grade})`} />
              </svg>
            </div>
            <MetricChart
              series={chart}
              view={view}
              valueFormatter={n}
              dateFormatter={(d) => d}
              padTop={14}
              tipAuto
              label={`${titulo}: gráfico de ${view === 'curve' ? 'curvas' : 'barras'}. Use as setas para percorrer os pontos.`}
            />
          </>
        ) : <span className="rvm-vazio">{vazio}</span>}
      </div>
      {temDado && eixo && eixo.length === pontos.length && (
        <div className="rvm-eixo" aria-hidden>
          {eixo.map((t, i) => {
            // no máximo ~8 rótulos; a posição segue o desenho (curva: nas pontas; barras: no meio da barra)
            const passo = Math.ceil(eixo.length / 8);
            if (i % passo !== 0 && i !== eixo.length - 1) return null;
            const x = view === 'curve' ? (eixo.length > 1 ? (i / (eixo.length - 1)) * 100 : 50) : ((i + 0.5) / eixo.length) * 100;
            const lado = view === 'curve' && i === 0 ? 'ini' : view === 'curve' && i === eixo.length - 1 ? 'fim' : 'meio';
            return <span key={i} data-lado={lado} style={{ left: `${x}%` }}>{t}</span>;
          })}
        </div>
      )}
      <footer className="rvm-pe">
        <span className="rvm-delta">{rodape}</span>
        {temDado && (
          <span className="pmc-stats rvm-series-stats">
            <span><span className="pmc-stats__value">{n(max)}</span> máx</span>
            <span className="pmc-stats__sep">·</span>
            <span><span className="pmc-stats__value">{n(min)}</span> mín</span>
            <span className="pmc-stats__sep">·</span>
            <span><span className="pmc-stats__value">{n(media)}</span> média por ponto</span>
          </span>
        )}
      </footer>
    </article>
  );
}
