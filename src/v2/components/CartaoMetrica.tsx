import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { MetricChart, monotonePath, type ChartView, type SeriesPoint } from '@/components/ui/metric-chart';
import { Icon, PeriodSelect, type PeriodOption } from '@/components/ui/metric-controls';
// REGRA do dono (24/11): todo gráfico em BARRAS, como as dos cartões do Painel — sem o modo linha e sem o seletor
const SO_BARRAS: ChartView = 'bar';
import { PmcStyles } from '@/components/ui/progress-metric-card';
import { useTemaAtual } from '@/v2/lib/temaAtual';
import { useMoldura } from '@/v2/lib/molduraAlfa';
import './cartaoMetrica.css';

/* ------------------------------------------------------------------
   Cards de métrica da Reviza (v2/components). Mesmo motor do Progress
   Metric Card (o gráfico pequeno, a troca curva/barras e o menu do período
   vêm de components/ui), na medida e na cara da casa.

   21/11 (dono: "deixar as métricas mais bonitas, mudar o formato"; "azul,
   vermelho, verde poluem"; "Ondas com umas linhas finas é horrível"):
   - FORMATO: ícone + título em cima; o número à esquerda e o gráfico pequeno
     à direita, na mesma linha; embaixo, a variação num selo discreto.
   - COR: a paleta é a da casa — dourado, grafite e cinzas; só a queda/atraso
     usa um ferrugem (laranja queimado). Nada de azul, verde ou vermelho.
   - ONDAS: gráfico próprio (GraficoSeries) com área preenchida, linhas mais
     firmes, grade discreta e balão com todas as séries.

   O SENTIDO de cada indicador decide o tom:
     maior  = subir é bom · menor = subir é ruim (Em atraso) · neutro = nem um nem outro.
   "Subiu ou desceu" = o último ponto da janela contra o primeiro (faixa neutra de 0,5%).
   ------------------------------------------------------------------ */

export type SentidoMetrica = 'maior' | 'menor' | 'neutro';
export type { PeriodOption, SeriesPoint };
type Tom = 'bom' | 'ruim' | 'neutro';

// cor do gráfico pequeno: sem a moldura, a régua antiga (verde/vermelho); com ela, sempre o dourado da casa
const CORES = {
  dark: { bom: '#3FAA79', ruim: '#E0504F', neutro: '#8A8F98' },
  light: { bom: '#2A7352', ruim: '#A23F33', neutro: '#666C76' },
} as const;
const DOURADO = { dark: '#F48349', light: '#ED642E' } as const; // a cor da logo (22/11: o laranja da letra, mais claro e suave que o dourado de antes)
const FAIXA_NEUTRA = 0.5;
const MES_ABREV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
/** '2026-11-14' → '14 nov 2026' (+ ' · até agora' quando é hoje): a data do balão dos gráficos por dia */
export function diaDoBalao(dia: string, hoje?: string): string {
  const [y, m, d] = dia.split('-');
  return `${d} ${MES_ABREV[Number(m) - 1] ?? m} ${y}${hoje && dia === hoje ? ' · até agora' : ''}`;
}

/* o ícone de cada indicador (quadradinho ao lado do título, só com a moldura) */
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
  envia: <><path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z" /><path d="m21.854 2.147-10.94 10.939" /></>,
  balao: <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />,
  lista: <><path d="M3 12h.01" /><path d="M3 18h.01" /><path d="M3 6h.01" /><path d="M8 12h13" /><path d="M8 18h13" /><path d="M8 6h13" /></>,
  pessoas: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>,
  telefone: <><rect width="14" height="20" x="5" y="2" rx="2" ry="2" /><path d="M12 18h.01" /></>,
  pulso: <path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2" />,
  porcento: <><path d="M19 5 5 19" /><circle cx="6.5" cy="6.5" r="2.5" /><circle cx="17.5" cy="17.5" r="2.5" /></>,
  moeda: <><circle cx="12" cy="12" r="10" /><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8" /><path d="M12 18V6" /></>,
  sinal: <><path d="M12 20h.01" /><path d="M2 8.82a15 15 0 0 1 20 0" /><path d="M5 12.859a10 10 0 0 1 14 0" /><path d="M8.5 16.429a5 5 0 0 1 7 0" /></>,
};
export type IconeMetrica = keyof typeof ICONES;
/** o desenho do ícone, para os indicadores das outras telas (Kpi e Indicador) usarem a MESMA família */
export const IconeTile = ({ nome }: { nome: IconeMetrica }) => <Icon size={14} strokeWidth={1.75}>{ICONES[nome]}</Icon>;
const Selo = ({ icone }: { icone?: IconeMetrica }) => (icone
  ? <span className="rvm-ico" aria-hidden><Icon size={14} strokeWidth={1.75}>{ICONES[icone]}</Icon></span>
  : null);

const SETAS = {
  flat: <><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></>,
  down: <><path d="M12 5v14" /><path d="m19 12-7 7-7-7" /></>,
  up: <><path d="m5 12 7-7 7 7" /><path d="M12 19V5" /></>,
};
const pctTexto = (n: number) => `${Math.abs(n).toFixed(1).replace('.', ',')}%`;

/* O número que CONTA até o valor. Recebe o texto pronto ("R$ 32.580,00", "69%", "1,4 dia"),
   acha o número em formato brasileiro e anima do valor mostrado até o novo em ~0,7 s, mantendo
   o que vem antes e depois. Sem movimento no sistema (ou texto sem número), mostra direto. */
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
  cabEsquerda, cabDireita, unidade, numSub, variacao, tom, rodape, className, graficoCarregando, icone,
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
  /** o que vem depois da variação do último ponto ("vs set/26") */
  rotuloDelta?: string;
  carregando?: boolean;
  /** cabeçalho próprio no lugar do título; o título fica para o leitor de tela */
  cabEsquerda?: ReactNode;
  /** à direita do cabeçalho quando não há menu de período (a campanha, o selo…) */
  cabDireita?: ReactNode;
  /** palavra pequena depois do número ("fechados") */
  unidade?: string;
  /** texto pequeno embaixo do número ("16 fechados · 29 NE") */
  numSub?: ReactNode;
  /** false = sem o selo da variação calculada (o rodapé traz a comparação pronta) */
  variacao?: false;
  /** o tom decidido fora (contra o período anterior) */
  tom?: Tom;
  /** o rodapé pronto no lugar de "↑ 25% · +N vs …" */
  rodape?: ReactNode;
  className?: string;
  /** só o gráfico ainda carregando (o número já chegou) */
  graficoCarregando?: boolean;
  /** o ícone do indicador (aparece com a moldura preta) */
  icone?: IconeMetrica;
}) {
  const tema = useTemaAtual();
  const moldura = useMoldura();
  const [rotulo, setRotulo] = useState(periodo ?? '');
  const view = SO_BARRAS;
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
  const tomFinal: Tom = tom ?? (sentido === 'neutro' || rumo === 'flat' ? 'neutro' : (rumo === 'up') === (sentido === 'maior') ? 'bom' : 'ruim');
  const corGraf = moldura ? DOURADO[tema] : CORES[tema][tomFinal];
  const passo = ultimo - penultimo;
  const delta = (passo >= 0 ? '+' : '−') + formatar(Math.abs(passo));
  const series = useMemo(() => [{ name: titulo, data: janela, color: corGraf }], [titulo, janela, corGraf]);
  const valor = typeof total === 'function' ? total(janela) : total;
  const mostraGraf = temGrafico && !carregando && !graficoCarregando;

  return (
    <article className={`pmc-root rvm${carregando ? ' rvm-carregando' : ''}${className ? ` ${className}` : ''}`} aria-busy={carregando || undefined}>
      <PmcStyles />
      <header className="rvm-cab">
        <div className="rvm-cab-esq">
          <Selo icone={icone} />
          {cabEsquerda ? <><h3 className="rvm-sr">{titulo}</h3>{cabEsquerda}</> : <h3 className="rvm-tit">{titulo}</h3>}
        </div>
        {periodos
          ? <PeriodSelect value={rotulo} options={periodos} onChange={(o) => setRotulo(o.label)} accentText={corGraf} />
          : cabDireita}
      </header>
      <div className="rvm-meio">
        <div className="rvm-num">
          <span className="rvm-linha">
            <span className="rvm-val">{carregando ? '—' : comContagem(valor)}</span>
            {unidade && !carregando && <span className="rvm-un">{unidade}</span>}
          </span>
          {numSub && !carregando && <span className="rvm-numsub">{numSub}</span>}
        </div>
        <div className={'rvm-graf' + (graficoCarregando || carregando ? ' rvm-graf-carregando' : '')}>
          {mostraGraf && (
            <MetricChart
              series={series}
              view={view}
              valueFormatter={formatar}
              dateFormatter={formatarData}
              padTop={4}
              tipAuto
              label={`${titulo}: gráfico de ${view === 'curve' ? 'curva' : 'barras'}${rotulo ? `, ${rotulo}` : ''}. Use as setas para percorrer os pontos.`}
            />
          )}
        </div>
      </div>
      <footer className="rvm-pe">
        <span className="rvm-delta">
          {rodape !== undefined ? rodape : temGrafico && !carregando ? (
            <>
              {variacao !== false && (
                <span className={`rvm-var rvm-t-${tomFinal}`} title={`Do primeiro ao último ponto (${(rotulo || 'período').toLowerCase()})`}>
                  <Icon size={11} strokeWidth={2.5}>{SETAS[rumo]}</Icon>
                  {pctTexto(pct)}
                </span>
              )}
              {delta} {rotuloDelta}
            </>
          ) : rotuloDelta}
        </span>
      </footer>
    </article>
  );
}

/** Indicador SEM série dia a dia (Tempo para fechar): a mesma moldura, sem gráfico. */
export function CartaoMetricaFixo({ titulo, valor, detalhe, rodape, icone }: {
  titulo: string; valor: ReactNode; detalhe?: ReactNode; rodape?: ReactNode; icone?: IconeMetrica;
}) {
  return (
    <article className="pmc-root rvm rvm-fixo">
      <PmcStyles />
      <header className="rvm-cab"><div className="rvm-cab-esq"><Selo icone={icone} /><h3 className="rvm-tit">{titulo}</h3></div></header>
      <div className="rvm-meio">
        <div className="rvm-num">
          <span className="rvm-linha"><span className="rvm-val">{comContagem(valor)}</span></span>
          {detalhe && <span className="rvm-numsub">{detalhe}</span>}
        </div>
      </div>
      <footer className="rvm-pe"><span className="rvm-delta">{rodape}</span></footer>
    </article>
  );
}

/** Grade dos cards: 4 por linha (ou 3); 2 em tela média; 1 no celular. */
export function GradeMetricas({ children, rotulo, colunas = 4 }: { children: ReactNode; rotulo: string; colunas?: 3 | 4 }) {
  return (
    <section className="pmc-grade-caixa" aria-label={rotulo}>
      <div className="pmc-grade" data-col={colunas}>{children}</div>
    </section>
  );
}

/** O título de um bloco de cards (por fora, sem cartão em volta de cartão). */
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

/* ==================================================================
   CARD DE VÁRIAS SÉRIES (as ondas: "Ondas por campanha", "Fechados da equipe").
   ================================================================== */

/* a paleta das séries: com a moldura, a da casa (dourado · grafite · cinza · bronze · cinza claro);
   sem ela, as cores de série de antes. O gráfico desenha em SVG/estilo, então em hex. */
const CORES_SERIE = {
  dark: ['#7C83F2', '#4CB0D9', '#3FB868', '#D1789B', '#8496AB'],
  light: ['#4F46E5', '#1F7E95', '#1E8A44', '#A14A77', '#5E7183'],
} as const;
const CORES_SERIE_CASA = {
  dark: ['#F48349', '#E4E4E7', '#8A8A93', '#FAB882', '#52525B'], // 23/11: cinzas neutros e o pêssego da logo no lugar do castanho (o escuro estava amarronzado)
  light: ['#ED642E', '#292523', '#A39D97', '#9C6A4C', '#D6D1CC'],
} as const;
const corDaSerie = (cor: string, tema: 'dark' | 'light', i: number, casa: boolean): string => {
  const pal = (casa ? CORES_SERIE_CASA : CORES_SERIE)[tema];
  const n = Number(/--dado-(\d)/.exec(cor)?.[1] ?? 0);
  return n >= 1 && n <= pal.length ? pal[n - 1] : !casa && /^#/.test(cor) ? cor : pal[i % pal.length];
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

/** teto "redondo" da escala (a metade também é inteira): 4, 6, 8, 10, 20, 40… */
function tetoBonito(max: number): number {
  if (max <= 4) return 4;
  const pot = Math.pow(10, Math.floor(Math.log10(max)));
  for (const m of [1, 2, 4, 6, 8, 10]) if (m * pot >= max) return m * pot;
  return 10 * pot;
}

/* O gráfico das ondas: curvas suaves com a área preenchida (ou barras empilhadas), grade discreta
   com a escala à esquerda, os dias embaixo, linha-guia e balão com todas as séries no ponto. As
   curvas esticam com o cartão (SVG sem proporção fixa); pontos, guia, rótulos e balão são HTML por
   cima, para não deformar. */
const VB_W = 1000; const VB_H = 300;
function GraficoSeries({ series, rotulos, eixo, view, titulo }: {
  series: { nome: string; cor: string; valores: number[] }[];
  /** o texto de cada ponto no balão */
  rotulos: string[];
  /** o texto curto de cada ponto no eixo de baixo */
  eixo: string[];
  view: ChartView;
  titulo: string;
}) {
  const uid = useId().replace(/:/g, '');
  const [ativo, setAtivo] = useState<number | null>(null);
  const n = rotulos.length;
  const totais = rotulos.map((_, i) => series.reduce((t, s) => t + (s.valores[i] ?? 0), 0));
  const teto = tetoBonito(view === 'bar' ? Math.max(0, ...totais) : Math.max(0, ...series.flatMap((s) => s.valores)));
  const xPct = (i: number) => (view === 'bar' ? ((i + 0.5) / n) * 100 : n > 1 ? (i / (n - 1)) * 100 : 50);
  const yPct = (v: number) => (1 - v / teto) * 100;
  const fmt = (v: number) => v.toLocaleString('pt-BR');
  const passoEixo = Math.ceil(n / 8);

  const aoMover = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const f = (e.clientX - r.left) / r.width;
    const i = view === 'bar' ? Math.floor(f * n) : Math.round(f * (n - 1));
    setAtivo(Math.max(0, Math.min(n - 1, i)));
  };
  const aoTeclar = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') { if (ativo != null) { e.preventDefault(); setAtivo(null); } return; }
    const para: Record<string, number> = { ArrowLeft: (ativo ?? n) - 1, ArrowRight: (ativo ?? -1) + 1, Home: 0, End: n - 1 };
    if (!(e.key in para)) return;
    e.preventDefault();
    setAtivo(Math.max(0, Math.min(n - 1, para[e.key])));
  };

  return (
    <div className="rvo">
      <div className="rvo-escala" aria-hidden>
        {[teto, teto / 2, 0].map((v) => <span key={v} style={{ top: `${yPct(v)}%` }}>{fmt(v)}</span>)}
      </div>
      <div className="rvo-plot" role="application" tabIndex={0} aria-label={`${titulo}. Use as setas para percorrer os pontos.`}
        onPointerMove={aoMover} onPointerDown={aoMover} onPointerLeave={() => setAtivo(null)} onKeyDown={aoTeclar}>
        {[teto, teto / 2, 0].map((v) => <i key={v} className={'rvo-grade' + (v === 0 ? ' rvo-base' : '')} style={{ top: `${yPct(v)}%` }} />)}

        {view === 'curve' ? (
          <svg key={`c-${n}-${series.length}`} className="rvo-svg" viewBox={`0 0 ${VB_W} ${VB_H}`} preserveAspectRatio="none" aria-hidden>
            <defs>
              {series.map((s, k) => (
                <linearGradient key={k} id={`rvo-${uid}-${k}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={s.cor} stopOpacity={k === 0 ? 0.3 : 0.14} />
                  <stop offset="100%" stopColor={s.cor} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            {/* de trás para a frente: a primeira série (a principal) fica por cima */}
            {[...series.keys()].reverse().map((k) => {
              const s = series[k];
              const pts = s.valores.map((v, i) => ({ x: n > 1 ? (i / (n - 1)) * VB_W : VB_W / 2, y: (1 - v / teto) * VB_H }));
              const linha = monotonePath(pts);
              if (!linha) return null;
              return (
                <g key={k}>
                  <path d={`${linha}L${VB_W},${VB_H}L0,${VB_H}Z`} fill={`url(#rvo-${uid}-${k})`} />
                  <path d={linha} fill="none" stroke={s.cor} strokeWidth={k === 0 ? 2.5 : 2} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                </g>
              );
            })}
          </svg>
        ) : (
          <div key={`b-${n}-${series.length}`} className="rvo-barras" aria-hidden>
            {rotulos.map((_, i) => (
              <div key={i} className={'rvo-col' + (ativo === i ? ' on' : '')}>
                <div className="rvo-pilha" style={{ height: `${(totais[i] / teto) * 100}%`, animationDelay: `${Math.min(i, 12) * 25}ms` }}>
                  {series.map((s, k) => (s.valores[i] ?? 0) > 0 && (
                    <i key={k} style={{ flex: `${s.valores[i]} 0 0`, background: s.cor }} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {ativo != null && (
          <>
            <i className="rvo-guia" style={{ left: `${xPct(ativo)}%` }} />
            {view === 'curve' && series.map((s, k) => (
              <i key={k} className="rvo-ponto" style={{ left: `${xPct(ativo)}%`, top: `${yPct(s.valores[ativo] ?? 0)}%`, background: s.cor }} />
            ))}
            <div className={'rvo-balao' + (xPct(ativo) > 55 ? ' esq' : '')} style={{ left: `${xPct(ativo)}%` }}>
              <b className="rvo-balao-t">{rotulos[ativo]}</b>
              {series.map((s, k) => (
                <span key={k} className="rvo-balao-l"><i style={{ background: s.cor }} /><span>{s.nome}</span><b>{fmt(s.valores[ativo] ?? 0)}</b></span>
              ))}
              {series.length > 1 && <span className="rvo-balao-l rvo-balao-tot"><span>Total</span><b>{fmt(totais[ativo])}</b></span>}
            </div>
          </>
        )}
      </div>
      <div className="rvo-eixo" aria-hidden>
        {eixo.map((t, i) => ((i % passoEixo === 0 || i === n - 1) && (i === n - 1 || n - 1 - i >= passoEixo) ? (
          <span key={i} data-lado={view === 'curve' ? (i === 0 ? 'ini' : i === n - 1 ? 'fim' : 'meio') : 'meio'} style={{ left: `${xPct(i)}%` }}>{t}</span>
        ) : null))}
      </div>
    </div>
  );
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
  /** o texto curto de cada ponto no eixo de baixo ('08/11', 'sem 03/11') */
  eixo?: string[];
}) {
  const tema = useTemaAtual();
  const moldura = useMoldura();
  const view = SO_BARRAS;
  const [ocultas, setOcultas] = useState<ReadonlySet<string>>(() => new Set());
  const alternar = (id: string) => setOcultas((prev) => {
    const prox = new Set(prev);
    if (prox.has(id)) prox.delete(id);
    else if (series.length - prox.size > 1) prox.add(id);   // a última série visível nunca some
    return prox;
  });

  const comCor = useMemo(() => series.map((s, i) => ({
    ...s,
    hex: corDaSerie(s.cor, tema, i, moldura),
    total: pontos.reduce((t, p) => t + (s.valores.get(p.chave) ?? 0), 0),
  })), [series, pontos, tema, moldura]);
  const visiveis = comCor.filter((s) => !ocultas.has(s.id));
  const grafico = useMemo(() => visiveis.map((s) => ({
    nome: s.rotulo, cor: s.hex, valores: pontos.map((p) => s.valores.get(p.chave) ?? 0),
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
        </div>
      </header>
      <div className="rvm-series-topo">
        <div className="rvm-linha">
          <span className="rvm-val"><Contagem texto={n(total)} /></span>
          <span className="rvm-un">{unidade(total)}{ocultas.size > 0 ? ' nas séries visíveis' : ''}</span>
        </div>
        <ul className="rvm-leg" aria-label="Séries do gráfico (clique para esconder ou mostrar)">
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
      </div>
      {temDado
        ? <GraficoSeries series={grafico} rotulos={pontos.map((p) => p.rotulo)} eixo={eixo ?? pontos.map((p) => p.rotulo)} view={view} titulo={titulo} />
        : <div className="rvo rvo-vazio">{vazio}</div>}
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
