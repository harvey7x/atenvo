/* =================== PAINEL — resumo executivo da carteira ===================
   Dono 27/09: "melhore essa parte, deixe mais profissional, organizado e atraente".
   A demo e a instância real usam ESTE markup (demo é o contrato); só muda a fonte.

   Organização (de cima pra baixo, do resumo ao detalhe):
     1. Topo: o MÊS DE REFERÊNCIA — um seletor só comanda a página inteira.
     2. Quatro indicadores com o mesmo desenho (rótulo · valor · contexto · visual).
     3. Saúde da carteira (composição) ao lado do Recebido por mês (tendência).
     4. Receita por ciclo, agrupada como a Gestão: fim do mês × início do mês.
     5. Histórico por ciclo (mapa de calor mês a mês) e desempenho por atendente.
   Regras de leitura (honestidade dos números):
     - só entram meses até o MÊS CORRENTE (coluna aberta antes da hora e lixo de
       teste, ex. 2027-08, não viram barra zerada nem mês selecionável);
     - no mês em andamento, ciclo que ainda NÃO venceu mostra "vence dd/mm" em vez
       de "−100%", e a variação do mês compara só os ciclos que já venceram;
     - valores em R$ com os centavos reais (antes o KPI truncava e mostrava ",00"). */
import { useMemo, useState, type ReactNode } from 'react';
import { BadgeStatus, CardVidro } from '../../components';
import { SeloAoVivo } from '../../components/SeloAoVivo';
import { ROTULO_COMP, type AtendSerie, type CicloSerie, type Comportamento, type ResumoCarteira, type TipoMsg } from '../cobrancaAnalytics';
import { cobrancaDoCiclo } from '../cicloCalendario';
import type { Dados } from '../../data/cobranca/types';
import './painel.css';

/* ---------------- formatação ---------------- */
const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MES_LONGO = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const d2 = (n: number) => String(n).padStart(2, '0');
const mesCurto = (c: string) => MES[(+c.slice(5, 7) || 1) - 1];
export const mesAno = (c: string) => `${mesCurto(c)}/${c.slice(2, 4)}`;
const mesLongo = (c: string) => `${MES_LONGO[(+c.slice(5, 7) || 1) - 1]} de ${c.slice(0, 4)}`;
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
export const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const curto = (v: number) => (v >= 1000 ? `${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil` : String(Math.round(v)));
export const pct1 = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
const deltaPct = (atual: number, anterior: number): number | null => (anterior > 0 ? ((atual - anterior) / anterior) * 100 : null);

/** data LOCAL de hoje (toISOString é UTC: das 21h em diante viraria amanhã em Brasília) */
function hojeLocal() {
  const d = new Date();
  const comp = `${d.getFullYear()}-${d2(d.getMonth() + 1)}`;
  return { comp, iso: `${comp}-${d2(d.getDate())}` };
}

/** "R$ 175.566" + ",65" menor — os centavos de verdade, sem arredondar */
export function Dinheiro({ v }: { v: number }) {
  const t = brl(v);
  const i = t.lastIndexOf(',');
  return <>{t.slice(0, i)}<span className="pn-cent">{t.slice(i)}</span></>;
}

/** variação: verde subiu · vermelho caiu · cinza sem base */
export function Delta({ d, chip }: { d: number | null; chip?: boolean }) {
  if (d === null) return <span className={chip ? 'pn-delta chip neutro' : 'pn-delta neutro'}>—</span>;
  const dir = d > 0.05 ? 'pos' : d < -0.05 ? 'neg' : 'neutro';
  const abs = Math.abs(d);
  const s = abs >= 100 ? Math.round(abs).toLocaleString('pt-BR') : pct1(abs);
  return <span className={`pn-delta num ${dir}${chip ? ' chip' : ''}`}>{dir === 'pos' ? '+' : dir === 'neg' ? '−' : ''}{s}%</span>;
}

/** escala "redonda" do eixo (0, 20 mil, 40 mil, 60 mil…) */
function escala(max: number, partes = 4): { topo: number; ticks: number[] } {
  if (!(max > 0)) return { topo: 1, ticks: [0] };
  const bruto = max / partes;
  const mag = 10 ** Math.floor(Math.log10(bruto));
  const n = bruto / mag;
  const passo = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
  const topo = passo * Math.ceil(max / passo);
  const ticks: number[] = [];
  for (let v = 0; v <= topo + passo / 2; v += passo) ticks.push(v);
  return { topo, ticks };
}

/** data de cobrança do ciclo no mês (data manual do Calendário > regra fds/feriado) —
    a MESMA conta do motor e da previsão */
function venceEm(dia: number, comp: string, ciclosDatas?: Dados['ciclosDatas']): string {
  return ciclosDatas?.[String(dia)]?.[comp]?.cobranca || cobrancaDoCiclo(comp, dia).iso;
}

export const TOM_COMP: Record<Comportamento, string> = { em_dia: 'ok', voltou: 'ok2', faltou: 'at', inadimplente: 'er' };
export const DESC_COMP: Record<Comportamento, string> = {
  em_dia: 'pagou o último mês',
  voltou: 'voltou depois de uma falha',
  faltou: 'não pagou o último mês',
  inadimplente: 'dois meses seguidos sem pagar',
};
const ROTULO_TIPO_ENG: Record<TipoMsg, string> = { antes: 'Lembrete (antes)', cobranca: 'Cobrança', depois: 'Aviso de atraso', remarketing: 'Remarketing' };

/* ---------------- peças ---------------- */
export function Indicador({ rotulo, valor, tom, pe, visual, extra }: {
  rotulo: string; valor: ReactNode; tom?: 'ok' | 'at' | 'er'; pe: ReactNode; visual?: ReactNode; extra?: ReactNode;
}) {
  return (
    <CardVidro spot className="pn-kpi">
      <div className="pn-kpi-cab"><span className="pn-kpi-rot">{rotulo}</span>{extra}</div>
      <div className={`pn-kpi-val num${tom ? ` ${tom}` : ''}`}>{valor}</div>
      <div className="pn-kpi-pe">{pe}</div>
      {visual && <div className="pn-kpi-vis">{visual}</div>}
    </CardVidro>
  );
}

/** linha do tempo compacta (área + linha + ponto no mês de referência).
    `ultimoAberto` (crítica 12/11): o último mês ainda não fechou — fora da seleção ele sai da
    linha (não "despenca" para zero); selecionado, entra como trecho tracejado (parcial). */
function Tendencia({ valores: todos, sel, ultimoAberto }: { valores: number[]; sel: number; ultimoAberto?: boolean }) {
  const cortar = !!ultimoAberto && todos.length > 2 && sel < todos.length - 1;
  const valores = cortar ? todos.slice(0, -1) : todos;
  if (valores.length < 2) return null;
  const max = Math.max(...valores, 1);
  const W = 120, H = 30;
  const pts = valores.map((v, i) => [(i / (valores.length - 1)) * W, H - 2 - (v / max) * (H - 6)] as const);
  const tracejar = !!ultimoAberto && !cortar;   // o mês aberto é o selecionado: trecho final tracejado
  const firmes = tracejar ? pts.slice(0, -1) : pts;
  const caminho = (xs: readonly (readonly [number, number])[]) => xs.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const linha = caminho(firmes);
  const fimX = firmes[firmes.length - 1][0];
  const area = `${linha} L${fimX.toFixed(1)},${H} L0,${H} Z`;
  const p = pts[Math.max(0, Math.min(sel, pts.length - 1))];
  // o ponto é HTML por cima: dentro do SVG esticado (preserveAspectRatio none) viraria elipse
  return (
    <div className="pn-tend" aria-hidden>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        <path className="pn-tend-area" d={area} />
        <path className="pn-tend-linha" d={linha} vectorEffect="non-scaling-stroke" />
        {tracejar && <path className="pn-tend-linha pn-tend-parcial" d={caminho(pts.slice(-2))} vectorEffect="non-scaling-stroke" />}
      </svg>
      <i className="pn-tend-ponto" style={{ left: `${(p[0] / W) * 100}%`, top: `${(p[1] / H) * 100}%` }} />
    </div>
  );
}

export function Proporcao({ partes }: { partes: { v: number; tom: string; titulo: string }[] }) {
  const tot = partes.reduce((s, p) => s + p.v, 0) || 1;
  return (
    <div className="pn-prop" role="img" aria-label={partes.map((p) => p.titulo).join(' · ')}>
      {partes.filter((p) => p.v > 0).map((p) => <i key={p.titulo} className={p.tom} style={{ width: `${(p.v / tot) * 100}%` }} title={p.titulo} />)}
    </div>
  );
}

export interface NovosResumo { n: number; mensal: number }

/** Markup do Painel — demo e instância real usam O MESMO; só muda a fonte dos números. */
export function PainelResumoVista({ r, ciclosM, atendM, ciclosDatas, novos, individual, aposKpis, antesAtend, limiteAtend, aoVerEquipe }: {
  r: ResumoCarteira; ciclosM: CicloSerie[]; atendM: AtendSerie[];
  /** datas manuais de cobrança do Calendário (vencimento do ciclo no mês) */
  ciclosDatas?: Dados['ciclosDatas'];
  /** clientes nos Novos (débito ainda ativo) — contexto do topo */
  novos?: NovosResumo;
  /** painel INDIVIDUAL do comercial (dono 27/09: "pro comercial, individual de seus
      clientes; pro financeiro e administrador, geral"): nome dele na barra e sem a
      tabela de atendentes. Os números já chegam filtrados (RLS + filtro no RevizaPainel). */
  individual?: string;
  /** crítica 12/11: faixa logo abaixo dos indicadores (a Previsão de faturamento subiu para cá) */
  aposKpis?: ReactNode;
  /** bloco antes do "Desempenho por atendente" (Clientes que precisam de atenção) */
  antesAtend?: ReactNode;
  /** "Desempenho por atendente" mostra só os N primeiros; o resto fica na tela Atendentes */
  limiteAtend?: number;
  aoVerEquipe?: () => void;
}) {
  const hoje = hojeLocal();

  // meses até o corrente (índice k na série original de cada ciclo/atendente)
  const meses = useMemo(() => {
    const todas = ciclosM[0]?.serie.map((s) => s.competencia) ?? atendM[0]?.serie.map((s) => s.competencia) ?? [];
    return todas.map((comp, k) => ({ comp, k })).filter((m) => m.comp <= hoje.comp);
  }, [ciclosM, atendM, hoje.comp]);
  const serie = useMemo(() => meses.map((m) => ({ comp: m.comp, valor: ciclosM.reduce((s, c) => s + (c.serie[m.k]?.valor ?? 0), 0) })), [meses, ciclosM]);
  const temSerie = serie.some((m) => m.valor > 0);
  // mês padrão = o mais recente (até hoje) com entrada registrada
  const padrao = useMemo(() => {
    for (let i = serie.length - 1; i >= 0; i--) if (serie[i].valor > 0) return i;
    return serie.length - 1;
  }, [serie]);
  const [mesEsc, setMesEsc] = useState<string | null>(null);
  const idxEsc = mesEsc ? serie.findIndex((m) => m.comp === mesEsc) : -1;
  const sel = idxEsc >= 0 ? idxEsc : padrao;
  const ant = sel - 1;
  const compSel = serie[sel]?.comp ?? hoje.comp;
  const compAnt = ant >= 0 ? serie[ant].comp : null;
  const kSel = sel >= 0 ? meses[sel]?.k ?? -1 : -1;
  const kAnt = ant >= 0 ? meses[ant].k : -1;
  const emAndamento = compSel === hoje.comp;

  // ciclos do mês de referência: valor, mês anterior e vencimento
  // entra quem tem cliente em cobrança OU valor num mês visível (turma nova sem pagamento
  // aparece como "vence dd/mm"; ciclo com valor só em coluna futura/lixo não aparece)
  const ciclos = useMemo(() => ciclosM
    .filter((c) => c.clientes > 0 || meses.some((m) => (c.serie[m.k]?.valor ?? 0) > 0))
    .map((c) => {
      const dia = Number(c.codigo.slice(1)) || 0;
      const vSel = kSel >= 0 ? c.serie[kSel]?.valor ?? 0 : 0;
      const vAnt = kAnt >= 0 ? c.serie[kAnt]?.valor ?? 0 : 0;
      const vence = dia > 0 ? venceEm(dia, compSel, ciclosDatas) : '';
      // no PRÓPRIO dia da cobrança o ciclo ainda não venceu (o retorno do débito chega depois)
      return { ...c, dia, vSel, vAnt, vence, aVencer: !!vence && vence >= hoje.iso };
    }), [ciclosM, meses, kSel, kAnt, compSel, ciclosDatas, hoje.iso]);
  const aVencer = ciclos.filter((c) => c.aVencer);
  const vencidos = ciclos.filter((c) => !c.aVencer);
  // variação honesta: com ciclo ainda por vencer no mês escolhido (o corrente, ou um mês
  // cuja cobrança foi empurrada pro mês seguinte), compara só os ciclos que JÁ venceram
  const parcial = aVencer.length > 0;
  // a barra do mês corrente é "parcial" independentemente do mês escolhido
  const correnteAberto = useMemo(() => ciclosM.some((c) => {
    const dia = Number(c.codigo.slice(1)) || 0;
    if (!dia || !(c.clientes > 0 || meses.some((m) => (c.serie[m.k]?.valor ?? 0) > 0))) return false;
    return venceEm(dia, hoje.comp, ciclosDatas) >= hoje.iso;
  }), [ciclosM, meses, ciclosDatas, hoje.comp, hoje.iso]);
  const recSel = serie[sel]?.valor ?? 0;
  const recAnt = ant >= 0 ? serie[ant].valor : 0;
  const deltaMes = parcial
    ? deltaPct(vencidos.reduce((s, c) => s + c.vSel, 0), vencidos.reduce((s, c) => s + c.vAnt, 0))
    : ant >= 0 ? deltaPct(recSel, recAnt) : null;

  const grupos = useMemo(() => {
    const porDia = (a: typeof ciclos[number], b: typeof ciclos[number]) => a.dia - b.dia;
    return [
      { id: 'fim', rot: 'Fim do mês', itens: ciclos.filter((c) => c.dia >= 15).sort(porDia) },
      { id: 'ini', rot: 'Início do mês', itens: ciclos.filter((c) => c.dia >= 1 && c.dia < 15).sort(porDia) },
      { id: 'sem', rot: 'Sem ciclo', itens: ciclos.filter((c) => c.dia === 0) },
    ].filter((g) => g.itens.length > 0);
  }, [ciclos]);
  const maxCiclo = Math.max(1, ...ciclos.map((c) => Math.max(c.vSel, c.vAnt)));
  const largura = (v: number) => `${v > 0 ? Math.max(1.5, (v / maxCiclo) * 100) : 0}%`;

  // carteira (a soma dos comportamentos É a carteira em cobrança — bate com a Gestão)
  const nComp = (c: Comportamento) => r.porComportamento.find((s) => s.comp === c)?.n ?? 0;
  const carteira = r.porComportamento.reduce((s, c) => s + c.n, 0);
  const emDiaN = nComp('em_dia') + nComp('voltou');
  const atrasoN = nComp('faltou') + nComp('inadimplente');
  const pctCart = (n: number) => (carteira ? (n / carteira) * 100 : 0);
  const adimTom = carteira === 0 ? undefined : r.adimplencia >= 80 ? 'ok' : r.adimplencia >= 60 ? 'at' : 'er';

  // gráfico
  const esc = escala(Math.max(...serie.map((m) => m.valor), 1));
  const alturaDe = (v: number) => `${(v / esc.topo) * 100}%`;
  const comValor = serie.filter((m) => m.valor > 0);
  const media = comValor.length ? comValor.reduce((s, m) => s + m.valor, 0) / comValor.length : 0;

  // mapa de calor (histórico por ciclo)
  const ordemMapa = grupos.flatMap((g) => g.itens);
  const maxCel = Math.max(1, ...ordemMapa.flatMap((c) => meses.map((m) => c.serie[m.k]?.valor ?? 0)));

  const atendOrd = useMemo(() => [...atendM].sort((a, b) => (b.serie[kSel]?.valor ?? 0) - (a.serie[kSel]?.valor ?? 0)), [atendM, kSel]);
  const temEng = r.respostaPorTipo.some((t) => t.enviadas > 0); // régua parada = seção some

  const irMes = (i: number) => { const m = serie[i]; if (m) setMesEsc(m.comp); };

  return (
    <div className="pn">
      {/* 1. barra de referência (dono 27/09: o topo tinha DOIS cabeçalhos empilhados —
          "Cobranças / Painel" e "Carteira em cobrança / Julho de 2026". O título da página
          fica sozinho; aqui vira UMA linha: mês de referência à esquerda, carteira à direita) */}
      <div className="pn-barra sobe">
        <div className="pn-barra-esq">
          <span className="pn-barra-rot" id="pn-mes-rot">Mês de referência</span>
          {serie.length > 0 ? (
            <div className="pn-mes" role="group" aria-labelledby="pn-mes-rot">
              <button type="button" className="pn-mes-seta" disabled={sel <= 0} onClick={() => irMes(sel - 1)} aria-label="Mês anterior">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m15 18-6-6 6-6" /></svg>
              </button>
              <label className="pn-mes-sel">
                <span className="pn-vh">Mês de referência</span>
                <select value={compSel} onChange={(e) => setMesEsc(e.target.value)}>
                  {[...serie].reverse().map((m) => <option key={m.comp} value={m.comp}>{mesLongo(m.comp).replace(/^./, (x) => x.toUpperCase())}</option>)}
                </select>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m6 9 6 6 6-6" /></svg>
              </label>
              <button type="button" className="pn-mes-seta" disabled={sel >= serie.length - 1} onClick={() => irMes(sel + 1)} aria-label="Próximo mês">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m9 18 6-6-6-6" /></svg>
              </button>
            </div>
          ) : <span className="pn-barra-vazio">sem pagamentos ainda</span>}
          {emAndamento && serie.length > 0 && <span className="pn-tag">em andamento</span>}
        </div>
        <div className="pn-barra-dir">
          {individual && <span className="pn-dono" title="Painel individual: só os seus clientes"><span className="pn-av" aria-hidden>{individual.trim().slice(0, 2).toUpperCase()}</span>Carteira de {individual.trim()}</span>}
          <span className="pn-barra-stat num"><b>{carteira.toLocaleString('pt-BR')}</b> em cobrança</span>
          {novos && novos.n > 0 && <span className="pn-barra-stat num"><b>{novos.n.toLocaleString('pt-BR')}</b> nos Novos</span>}
          <SeloAoVivo />
        </div>
      </div>

      {/* 2. indicadores */}
      <div className="pn-kpis sobe" style={{ animationDelay: '.04s' }}>
        <Indicador rotulo="Recorrência mensal" valor={<Dinheiro v={r.recorrencia} />}
          pe={<>{carteira.toLocaleString('pt-BR')} clientes · ticket médio <b className="num">{brl(carteira ? r.recorrencia / carteira : 0)}</b></>}
          visual={<Proporcao partes={r.porComportamento.map((s) => ({ v: s.valor, tom: TOM_COMP[s.comp], titulo: `${ROTULO_COMP[s.comp]}: ${brl(s.valor)}/mês` }))} />} />
        <Indicador rotulo={`Recebido em ${compSel ? mesAno(compSel) : '—'}`} valor={<Dinheiro v={recSel} />}
          extra={parcial ? <span className="pn-tag suave" title="O mês ainda não fechou">parcial</span> : undefined}
          pe={compAnt
            ? <><Delta d={deltaMes} chip /> <span>vs {mesAno(compAnt)}{parcial ? ' nos ciclos já vencidos' : ''}</span></>
            : <span>primeiro mês com registro</span>}
          visual={temSerie ? <Tendencia valores={serie.map((m) => m.valor)} sel={sel} ultimoAberto={correnteAberto && serie[serie.length - 1]?.comp === hoje.comp} /> : undefined} />
        <Indicador rotulo="Em atraso" valor={<Dinheiro v={r.emAtrasoValor} />} tom={r.emAtrasoValor > 0 ? 'er' : undefined}
          pe={<><b className="num">{atrasoN.toLocaleString('pt-BR')}</b> cliente{atrasoN === 1 ? '' : 's'} · {pct1(pctCart(atrasoN))}% da carteira</>}
          visual={<div className="pn-trilho"><i className="er" style={{ width: `${pctCart(atrasoN)}%` }} /></div>} />
        <Indicador rotulo="Adimplência" valor={carteira ? <>{r.adimplencia}<span className="pn-cent">%</span></> : '—'} tom={adimTom}
          pe={carteira ? <><b className="num">{emDiaN.toLocaleString('pt-BR')}</b> de {carteira.toLocaleString('pt-BR')} clientes em dia</> : 'nenhum cliente em cobrança'}
          visual={<div className="pn-trilho"><i className={adimTom ?? 'neutro'} style={{ width: `${carteira ? Math.min(100, r.adimplencia) : 0}%` }} /></div>} />
      </div>

      {aposKpis}

      {/* 3. saúde × tendência */}
      <div className="pn-duas sobe" style={{ animationDelay: '.08s' }}>
        <CardVidro spot className="pn-card">
          <div className="pn-card-cab">
            <div><h3>Saúde da carteira</h3><p>Pelo último mês registrado de cada cliente</p></div>
            <span className="pn-card-lado num">{carteira.toLocaleString('pt-BR')} clientes</span>
          </div>
          <Proporcao partes={r.porComportamento.map((s) => ({ v: s.n, tom: TOM_COMP[s.comp], titulo: `${ROTULO_COMP[s.comp]}: ${s.n}` }))} />
          <ul className="pn-saude">
            {r.porComportamento.map((s) => (
              <li key={s.comp}>
                <i className={`pn-ponto ${TOM_COMP[s.comp]}`} aria-hidden />
                <span className="pn-saude-rot">{ROTULO_COMP[s.comp]}<small>{DESC_COMP[s.comp]}</small></span>
                <span className="pn-saude-n num">{s.n.toLocaleString('pt-BR')}</span>
                <span className="pn-saude-pct num">{pct1(pctCart(s.n))}%</span>
                <span className="pn-saude-v num">{brl(s.valor)}<small>/mês</small></span>
              </li>
            ))}
          </ul>
        </CardVidro>

        <CardVidro spot className="pn-card">
          <div className="pn-card-cab">
            <div><h3>Recebido por mês</h3><p>Pagamentos registrados na Gestão · clique num mês para detalhar</p></div>
            {temSerie && <span className="pn-card-lado num">{mesAno(compSel)} <b>{brl(recSel)}</b></span>}
          </div>
          {temSerie ? (
            <div className="pn-graf">
              <div className="pn-graf-eixo num" aria-hidden>
                {esc.ticks.map((t) => <span key={t} style={{ bottom: alturaDe(t) }}>{t === 0 ? '0' : curto(t)}</span>)}
              </div>
              <div className="pn-graf-corpo">
                <div className="pn-graf-plot">
                  {esc.ticks.map((t) => <i key={t} className="pn-graf-grade" style={{ bottom: alturaDe(t) }} />)}
                  {media > 0 && <div className="pn-graf-media" style={{ bottom: alturaDe(media) }}><span className="num">média {curto(media)}</span></div>}
                  <div className="pn-graf-cols">
                    {serie.map((m, i) => (
                      <button type="button" key={m.comp}
                        className={['pn-graf-col', i === sel ? 'on' : '', (m.comp === hoje.comp && correnteAberto) || (i === sel && parcial) ? 'parcial' : ''].filter(Boolean).join(' ')}
                        onClick={() => setMesEsc(m.comp)} aria-pressed={i === sel}
                        aria-label={`${mesLongo(m.comp)}: ${brl(m.valor)}`} title={`${mesAno(m.comp)} · ${brl(m.valor)}`}>
                        <span className="pn-graf-bar" style={{ height: m.valor > 0 ? `max(3px, ${alturaDe(m.valor)})` : '0' }}>
                          {i === sel && m.valor > 0 && <em className="num">{curto(m.valor)}</em>}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="pn-graf-x num" aria-hidden>
                  {serie.map((m, i) => (
                    <span key={m.comp} className={i === sel ? 'on' : undefined}>
                      {mesCurto(m.comp)}
                      {(i === 0 || m.comp.endsWith('-01')) && <small>{m.comp.slice(0, 4)}</small>}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ) : <p className="pn-vazio">Sem pagamentos registrados ainda.</p>}
        </CardVidro>
      </div>

      {temSerie && (
        <>
          {/* 4. receita por ciclo no mês de referência */}
          <CardVidro spot className="pn-card pn-sec sobe" style={{ animationDelay: '.12s' }}>
            <div className="pn-card-cab">
              <div>
                <h3>Receita por ciclo</h3>
                <p>Recebido em {mesAno(compSel)}{compAnt ? ` comparado com ${mesAno(compAnt)}` : ''}{parcial ? ` · ${aVencer.length} ciclo${aVencer.length === 1 ? '' : 's'} ainda não ${aVencer.length === 1 ? 'venceu' : 'venceram'}` : ''}</p>
              </div>
              <div className="pn-leg" aria-hidden>
                {compAnt && <span><i className="ant" />{mesAno(compAnt)}</span>}
                <span><i className="sel" />{mesAno(compSel)}</span>
              </div>
            </div>
            <div className={grupos.length > 1 ? 'pn-grupos dois' : 'pn-grupos'}>
              {grupos.map((g) => {
                const soma = g.itens.reduce((s, c) => s + c.vSel, 0);
                return (
                  <section className="pn-grupo" key={g.id} aria-label={g.rot}>
                    <div className="pn-grupo-cab">
                      <span>{g.rot}</span>
                      <span className="num">{brl(soma)}</span>
                    </div>
                    {g.itens.map((c) => (
                      <div className="pn-ciclo" key={c.codigo}>
                        <span className="pn-ciclo-id"><b>{c.dia ? c.codigo : 'Sem ciclo'}</b><small className="num">{c.clientes} cli.</small></span>
                        <span className="pn-ciclo-barras" aria-hidden>
                          {compAnt && <i className="ant" style={{ width: largura(c.vAnt) }} />}
                          <i className={c.aVencer ? 'sel previsto' : 'sel'} style={{ width: largura(c.vSel) }} />
                        </span>
                        <span className="pn-ciclo-v num">{c.aVencer && c.vSel === 0 ? '—' : brl(c.vSel)}</span>
                        <span className="pn-ciclo-st">
                          {c.aVencer
                            ? <span className="pn-tag suave" title={`Cobrança do ciclo em ${ddmm(c.vence)}`}>{c.vence === hoje.iso ? 'vence hoje' : `vence ${ddmm(c.vence)}`}</span>
                            : <Delta d={compAnt ? deltaPct(c.vSel, c.vAnt) : null} />}
                        </span>
                      </div>
                    ))}
                  </section>
                );
              })}
            </div>
            <div className="pn-rodape num">
              <span>Total em {mesAno(compSel)}</span>
              <b>{brl(recSel)}</b>
              {compAnt && <><Delta d={deltaMes} chip /><span className="pn-rodape-mut">vs {mesAno(compAnt)}{parcial ? ' nos ciclos já vencidos' : ''}</span></>}
            </div>
          </CardVidro>

          {/* 5a. histórico por ciclo (mapa de calor) */}
          <CardVidro spot className="pn-card pn-sec sobe" style={{ animationDelay: '.16s' }}>
            <div className="pn-card-cab">
              <div><h3>Histórico por ciclo</h3><p>Recebido mês a mês · quanto mais forte a cor, maior o valor · clique no mês para detalhar</p></div>
            </div>
            <div className="pn-mapa-rolo">
              <table className="pn-mapa">
                <thead>
                  <tr>
                    <th scope="col" className="pn-mapa-fixa">Ciclo</th>
                    {meses.map((m, i) => (
                      <th key={m.comp} scope="col" className={i === sel ? 'on' : undefined}>
                        <button type="button" onClick={() => setMesEsc(m.comp)} aria-pressed={i === sel}>{mesAno(m.comp)}</button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ordemMapa.map((c) => (
                    <tr key={c.codigo}>
                      <th scope="row" className="pn-mapa-fixa"><b>{c.dia ? c.codigo : 'Sem ciclo'}</b><small className="num">{c.clientes}</small></th>
                      {meses.map((m, i) => {
                        const v = c.serie[m.k]?.valor ?? 0;
                        const aVenc = i === sel && c.aVencer && v === 0;
                        return (
                          <td key={m.comp} className={['num', i === sel ? 'on' : ''].filter(Boolean).join(' ')}
                            style={v > 0 ? { background: `rgba(var(--azul-rgb, 240, 188, 78), ${(0.06 + 0.3 * (v / maxCel)).toFixed(3)})` } : undefined}
                            title={`${c.dia ? c.codigo : 'Sem ciclo'} · ${mesAno(m.comp)} · ${brl(v)}`}>
                            {v > 0 ? curto(v) : aVenc ? <span className="pn-mapa-av">a vencer</span> : <span className="pn-mapa-zero">—</span>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th scope="row" className="pn-mapa-fixa">Total</th>
                    {serie.map((m, i) => <td key={m.comp} className={['num', i === sel ? 'on' : ''].filter(Boolean).join(' ')}>{m.valor > 0 ? curto(m.valor) : '—'}</td>)}
                  </tr>
                </tfoot>
              </table>
            </div>
          </CardVidro>

        </>
      )}

      {antesAtend}

      {temSerie && (
        <>
          {/* 5b. desempenho por atendente (só no painel geral) — crítica 12/11: os primeiros
              (por recebido no mês); a equipe completa é a tela Atendentes */}
          {!individual && <CardVidro spot className="pn-card pn-sec sobe" style={{ animationDelay: '.2s' }}>
            <div className="pn-card-cab">
              <div>
                <h3>Desempenho por atendente</h3>
                <p>Recebido da carteira de cada comercial em {mesAno(compSel)}{compAnt ? `, comparado com ${mesAno(compAnt)}` : ''}{parcial ? ` · ainda há ciclo por vencer em ${mesAno(compSel)}` : ''}</p>
              </div>
              {aoVerEquipe && limiteAtend != null && atendOrd.length > limiteAtend && (
                <button type="button" className="pn-link pn-ver" onClick={aoVerEquipe}>Ver equipe completa<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m9 18 6-6-6-6" /></svg></button>
              )}
            </div>
            <div className="pn-mapa-rolo">
              <table className="pn-atend">
                <thead>
                  <tr>
                    <th scope="col">Atendente</th>
                    <th scope="col" className="num">Carteira</th>
                    <th scope="col">Últimos meses</th>
                    <th scope="col" className="num">{compAnt ? mesAno(compAnt) : '—'}</th>
                    <th scope="col" className="num">{mesAno(compSel)}</th>
                    <th scope="col" className="num">Variação</th>
                    <th scope="col" className="num">Adimplência</th>
                  </tr>
                </thead>
                <tbody>
                  {(limiteAtend != null ? atendOrd.slice(0, limiteAtend) : atendOrd).map((a) => {
                    const vSel = kSel >= 0 ? a.serie[kSel]?.valor ?? 0 : 0;
                    const vAnt = kAnt >= 0 ? a.serie[kAnt]?.valor ?? 0 : 0;
                    const hist = meses.map((m) => a.serie[m.k]?.valor ?? 0);
                    const mx = Math.max(...hist, 1);
                    return (
                      <tr key={a.nome}>
                        <td><span className="pn-atend-nm"><span className="pn-av" aria-hidden>{a.nome.slice(0, 2).toUpperCase()}</span>{a.nome}</span></td>
                        <td className="num">{a.clientes} cli.</td>
                        <td>
                          <span className="pn-mini" aria-hidden>
                            {hist.map((v, i) => <i key={meses[i].comp} className={i === sel ? 'on' : undefined} style={{ height: `${Math.max(2, Math.round((v / mx) * 22))}px` }} />)}
                          </span>
                        </td>
                        <td className="num pn-mut">{compAnt ? brl(vAnt) : '—'}</td>
                        <td className="num"><b>{brl(vSel)}</b></td>
                        <td className="num"><Delta d={compAnt ? deltaPct(vSel, vAnt) : null} /></td>
                        <td className="num">{a.clientes > 0 ? <BadgeStatus tom={a.adimplencia >= 80 ? 'ok' : a.adimplencia >= 60 ? 'atencao' : 'erro'}>{a.adimplencia}%</BadgeStatus> : <span className="pn-mut">—</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardVidro>}
        </>
      )}

      {temEng && (
        <div className="pn-eng sobe" style={{ animationDelay: '.24s' }}>
          {r.respostaPorTipo.map((t) => {
            const pct = t.enviadas ? Math.round((t.respostas / t.enviadas) * 100) : 0;
            return (
              <CardVidro spot className="pn-card" key={t.tipo}>
                <div className="pn-kpi-rot">{ROTULO_TIPO_ENG[t.tipo]}</div>
                <div className="pn-kpi-val num">{pct}<span className="pn-cent">%</span></div>
                <div className="pn-kpi-pe">{t.respostas} de {t.enviadas} responderam</div>
                <div className="pn-trilho"><i className={pct >= 50 ? 'ok' : 'neutro'} style={{ width: `${pct}%` }} /></div>
              </CardVidro>
            );
          })}
        </div>
      )}
    </div>
  );
}
