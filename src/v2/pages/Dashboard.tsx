import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Area, AreaChart, Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  DASH_REAL, PRESETS_DASH, agrupaPorFonte, periodoDash, useDashboardResumo,
  useDashboardIa, seedDashResumo, seedDashIa,
  type DashAtendente, type DashIa, type DashKpis, type DashLinhaFunil, type DashResumo, type PresetDash,
} from '@/data/dashboard';
import { kpi, spHoje, addDias, type Kpi as KpiNum } from '@/data/relatorios';
import { rotuloMotivoPerda } from '@/data/kanban';
import { initials } from '@/lib/avatar';
import { CardVidro, Chip, Chips, EstadoErro, Input, Skeleton } from '../components';
import './dashboard.css';

/* ------------------------------------------------------------------
   Dashboard — RECONSTRUÍDO 28/08 na anatomia da referência do dono
   (bento grid): heros com número grande + chip de variação, DONUT da
   IA com o total no centro e legenda semântica, equipe em LISTA com
   avatares e chips, atividade em área com gradiente azul. Uma RPC
   (dashboard_resumo) + fatia IA client-side; trocar período = 1 req.
   ------------------------------------------------------------------ */

/* ===== formatação PT-BR ===== */
const fmtInt = (n: number) => Math.round(n).toLocaleString('pt-BR');
const fmtBRL = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const fmtMin = (n: number | null) => {
  if (n == null) return '—';
  if (n < 60) return `${Math.round(n)} min`;
  const h = Math.floor(n / 60);
  const m = Math.round(n % 60);
  return m === 0 ? `${h}h` : `${h}h ${m}min`;
};
const fmtDiaCurto = (iso: string) => {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
};

/* etapa do fluxo da IA → rótulo humano (mesmo mapa do inbox; fallback prettify) */
const ETAPA_IA: Record<string, string> = {
  qualificacao_inss: 'qualificando o benefício', triagem_govbr: 'triagem do gov.br',
  extratos: 'coletando extratos', coleta_docs: 'coletando documentos',
  docs_pessoais: 'documentos pessoais', retorno: 'retomando contato', sem_etapa: 'sem etapa',
};
const etapaIa = (s: string) => ETAPA_IA[s] ?? s.replace(/_/g, ' ');

/* ===== paleta dos gráficos (tokens resolvidos — Recharts não lê var()) ===== */
interface Paleta {
  txt: string; txt2: string; txt3: string;
  verde: string; rubro: string; ambar: string; azul: string; tint: string;
  lite: boolean;
}
const PALETA_DARK: Paleta = {
  txt: '#F4F5F7', txt2: '#9BA1AB', txt3: '#5E646E',
  verde: '#4ABE8C', rubro: '#E5665C', ambar: '#D9A44A', azul: '#4C8DFF',
  tint: '255, 255, 255', lite: false,
};

function usePaleta(ref: React.RefObject<HTMLElement | null>): Paleta {
  const [p, setP] = useState<Paleta>(PALETA_DARK);
  useEffect(() => {
    const ler = () => {
      const el = ref.current;
      if (!el) return;
      const cs = getComputedStyle(el);
      const v = (n: string, padrao: string) => cs.getPropertyValue(n).trim() || padrao;
      setP({
        txt: v('--txt', PALETA_DARK.txt),
        txt2: v('--txt-2', PALETA_DARK.txt2),
        txt3: v('--txt-3', PALETA_DARK.txt3),
        verde: v('--verde', PALETA_DARK.verde),
        rubro: v('--rubro', PALETA_DARK.rubro),
        ambar: v('--ambar', PALETA_DARK.ambar),
        azul: v('--azul', PALETA_DARK.azul),
        tint: v('--tint', PALETA_DARK.tint),
        lite: document.documentElement.getAttribute('data-perf') === 'lite',
      });
    };
    ler();
    const mo = new MutationObserver(ler);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-tema', 'data-perf'] });
    return () => mo.disconnect();
  }, [ref]);
  return p;
}

const tinta = (p: Paleta, a: number) => `rgba(${p.tint}, ${a})`;

/* ===== tooltip único (vidro Platina, não o branco padrão do Recharts) =====
   Com `content` customizado o Recharts NÃO aplica labelFormatter — o rótulo
   é formatado aqui dentro (fmtLabel), senão chega cru ("2026-08-15"). */
function TipPlatina({ active, payload, label, sufixo, fmt = fmtInt, fmtLabel }: {
  active?: boolean; payload?: { value: number; payload?: Record<string, unknown> }[];
  label?: string | number; sufixo?: string;
  fmt?: (n: number) => string; fmtLabel?: (v: string | number) => string;
}) {
  if (!active || !payload?.length) return null;
  const rotulo = label == null ? '' : fmtLabel ? fmtLabel(label) : String(label);
  return (
    <div className="db-tip">
      <div className="tl">{rotulo}</div>
      <div className="tv num">{fmt(payload[0].value)}{sufixo ? ` ${sufixo}` : ''}</div>
    </div>
  );
}

/* ===== contador ANIMADO dos números =====
   rAF ~550ms ease-out; aba oculta ou valor igual assenta direto. Os GRÁFICOS
   seguem sem animação ("dado é calmo" + bug do rAF em aba de fundo, medido
   em produção 24/08) — o contador não sofre disso: cai no valor final. */
function Contador({ valor, fmt }: { valor: number; fmt: (n: number) => string }) {
  const [v, setV] = useState(valor);
  const anterior = useRef<number | null>(null);
  useEffect(() => {
    const de = anterior.current ?? 0;
    anterior.current = valor;
    if (de === valor || document.visibilityState === 'hidden') { setV(valor); return; }
    const t0 = performance.now(); const dur = 550; let raf = 0;
    const passo = (t: number) => {
      const k = Math.min(1, (t - t0) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      setV(de + (valor - de) * e);
      if (k < 1) raf = requestAnimationFrame(passo); else setV(valor);
    };
    raf = requestAnimationFrame(passo);
    return () => { cancelAnimationFrame(raf); setV(valor); };
  }, [valor]);
  return <>{fmt(v)}</>;
}

/* ===== hero: número grande + chip de variação (anatomia da referência) ===== */
type Sentido = 'maior' | 'menor' | 'neutro';

function DeltaChip({ k, sentido }: { k: KpiNum | null; sentido: Sentido }) {
  if (!k) return null;
  const txt = k.deltaPct == null ? '—' : `${k.deltaPct > 0 ? '+' : ''}${k.deltaPct.toFixed(1)}%`;
  if (k.deltaAbs === 0) return <span className="db-delta ne">estável</span>;
  const seta = k.deltaAbs > 0 ? '▲' : '▼';
  if (sentido === 'neutro') return <span className="db-delta ne">{seta} {txt}</span>;
  const bom = sentido === 'maior' ? k.deltaAbs > 0 : k.deltaAbs < 0;
  return <span className={'db-delta ' + (bom ? 'ok' : 'er')}>{seta} {txt} <i>vs anterior</i></span>;
}

function Hero({ rotulo, k, sentido, fmt, ajuda, sub, atraso, carregando, spark, corSpark }: {
  rotulo: string; k: KpiNum | null; sentido: Sentido; fmt: (n: number) => string;
  ajuda: string; sub?: ReactNode; atraso?: number; carregando?: boolean;
  spark?: { v: number }[]; corSpark?: string;
}) {
  return (
    <CardVidro spot sobe atraso={atraso} className="db-hero" title={ajuda}>
      {carregando ? (
        <>
          <Skeleton largura="46%" altura={9} />
          <div style={{ marginTop: 14 }}><Skeleton largura="58%" altura={26} /></div>
          <div style={{ marginTop: 12 }}><Skeleton largura="38%" altura={12} raio={99} /></div>
        </>
      ) : (
        <>
          <div className="rot">{rotulo}</div>
          <div className="val num">{k ? <Contador valor={k.atual} fmt={fmt} /> : '—'}</div>
          <div className="pe">
            <DeltaChip k={k} sentido={sentido} />
            {sub && <span className="sub">{sub}</span>}
          </div>
          {spark && spark.length > 1 && corSpark && (
            <div className="spark" aria-hidden>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={spark} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id={'g-' + rotulo} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={corSpark} stopOpacity={0.4} />
                      <stop offset="100%" stopColor={corSpark} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Area dataKey="v" stroke={corSpark} strokeWidth={1.6} fill={`url(#g-${rotulo})`} isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}
    </CardVidro>
  );
}

/* ===== cartão de seção ===== */
function Secao({ titulo, sub, acao, children, atraso, className }: {
  titulo: string; sub?: ReactNode; acao?: ReactNode; children: ReactNode; atraso?: number; className?: string;
}) {
  return (
    <CardVidro sobe atraso={atraso} className={'db-sec ' + (className ?? '')}>
      <div className="db-sec-cab">
        <div><div className="t">{titulo}</div>{sub && <div className="s">{sub}</div>}</div>
        {acao}
      </div>
      {children}
    </CardVidro>
  );
}

function Vazio({ texto }: { texto: string }) {
  return <div className="db-vazio"><span aria-hidden>◌</span> {texto}</div>;
}

/* ===== barras horizontais (funil/origem/bancos/motivos) ===== */
function BarrasH({ itens, cor }: { itens: { rot: ReactNode; chave: string; v: number; tag?: string; cor?: string }[]; cor?: string }) {
  const max = Math.max(1, ...itens.map((i) => i.v));
  return (
    <div className="db-barh">
      {itens.map((i) => (
        <div className="lin" key={i.chave}>
          <span className="rot" title={typeof i.rot === 'string' ? i.rot : i.chave}>
            <span className="tx">{i.rot}</span>
            {i.tag && <b className="db-tag">{i.tag}</b>}
          </span>
          <div className="trilho">
            <i style={{ width: `${Math.max(2, (i.v / max) * 100)}%`, background: i.cor ?? cor }} />
          </div>
          <span className="v num">{fmtInt(i.v)}</span>
        </div>
      ))}
    </div>
  );
}

/* ===== funil (ganho verde · perda rubro · descarte âmbar; resto azul-tint) ===== */
function BarrasFunil({ linhas, p }: { linhas: DashLinhaFunil[]; p: Paleta }) {
  const max = Math.max(1, ...linhas.map((l) => l.qtd));
  return (
    <div className="db-barh">
      {linhas.map((l) => {
        const larg = Math.max(2, (l.qtd / max) * 100);
        const pilha = l.resultado === 'perdido' && l.qtd > 0;
        return (
          <div className="lin" key={l.coluna}>
            <span className="rot" title={l.coluna}><span className="tx">{l.coluna}</span></span>
            <div className="trilho">
              {pilha ? (
                <div className="pilha" style={{ width: `${larg}%` }}>
                  {l.qtd_descarte > 0 && <i style={{ flexGrow: l.qtd_descarte, background: p.ambar }} title={`${fmtInt(l.qtd_descarte)} descartados — fora do perfil`} />}
                  {l.qtd_perda > 0 && <i style={{ flexGrow: l.qtd_perda, background: p.rubro }} title={`${fmtInt(l.qtd_perda)} perdidos de verdade`} />}
                </div>
              ) : (
                <i style={{ width: `${larg}%`, background: l.resultado === 'ganho' ? p.verde : undefined }} />
              )}
            </div>
            <span className="v num">{fmtInt(l.qtd)}</span>
          </div>
        );
      })}
    </div>
  );
}

/* ==================================================================
   Página
   ================================================================== */
export default function DashboardV2() {
  const raiz = useRef<HTMLDivElement>(null);
  const p = usePaleta(raiz);

  const [preset, setPreset] = useState<PresetDash>('hoje'); // fim do dia: a foto de HOJE primeiro
  const [ini, setIni] = useState(() => addDias(spHoje(), -6));
  const [fim, setFim] = useState(() => spHoje());
  const [fonteAberta, setFonteAberta] = useState<string | null>(null);

  const periodo = useMemo(() => periodoDash(preset, ini, fim), [preset, ini, fim]);
  const { data, isPending, isError, error, refetch, isFetching } = useDashboardResumo(periodo);
  const iaQ = useDashboardIa(periodo);

  // demo: a tela vive com seeds coerentes (nada de "Sem conexão")
  const demoResumo = useMemo(() => (DASH_REAL ? null : seedDashResumo(periodo)), [periodo]);
  const d = DASH_REAL ? (data as DashResumo | undefined) : demoResumo ?? undefined;
  const ia: DashIa | undefined = DASH_REAL ? iaQ.data : seedDashIa();
  const carregando = DASH_REAL && isPending;

  const kp = (sel: (k: DashKpis) => number | null): KpiNum | null => {
    if (!d) return null;
    const a = sel(d.kpis); const b = sel(d.kpis_anterior);
    if (a == null || b == null) return null;
    return kpi(a, b);
  };

  const origens = useMemo(() => (d ? agrupaPorFonte(d.origem_trafego) : []), [d]);
  const atendentes = useMemo(
    () => (d ? [...d.atendentes].sort((a, b) => b.ganhos - a.ganhos || b.msgs_enviadas - a.msgs_enviadas) : []),
    [d],
  );
  const maxMsgsAt = Math.max(1, ...atendentes.map((a) => a.msgs_enviadas));

  // donut da IA (semântico): vivas em destaque, pausadas fecham o anel
  const donutIa = useMemo(() => {
    if (!ia) return [];
    return [
      { nome: 'Atendendo', v: ia.sessoesAtivas, cor: p.verde },
      { nome: 'Aguardando humano', v: ia.aguardandoHumano, cor: p.ambar },
      { nome: 'Handoff', v: ia.handoffs, cor: p.rubro },
      { nome: 'Pausadas', v: ia.pausadas, cor: tinta(p, 0.18) },
    ].filter((x) => x.v > 0);
  }, [ia, p]);
  const vivasIa = ia ? ia.sessoesAtivas + ia.handoffs : 0;
  const pctBot = ia ? Math.round((ia.msgsBot / Math.max(1, ia.msgsBot + ia.msgsHumano)) * 100) : 0;

  // atividade: no "Hoje" a série honesta é POR HORA; em períodos maiores, por dia
  const porHora = periodo.dias <= 1;

  const eixo = { fontSize: 10.5, fill: p.txt3 };
  const anima = false; // gráfico não anima (regra + rAF em aba de fundo)
  void p.lite;

  return (
    <div className="db-pg" ref={raiz}>
      <div className="ph">
        <div>
          <h2>Dashboard</h2>
          <p>Como foi {preset === 'hoje' ? 'o dia' : 'o período'} — {periodo.label}
            {isFetching && !carregando ? ' · atualizando…' : ''}
            {!DASH_REAL ? ' · modo demonstração (dados ilustrativos)' : ''}</p>
        </div>
        <div className="db-filtros">
          <Chips>
            {PRESETS_DASH.map((op) => (
              <Chip key={op.id} ativo={preset === op.id} onClick={() => setPreset(op.id)}>{op.label}</Chip>
            ))}
          </Chips>
          {preset === 'custom' && (
            <div className="db-datas">
              <Input type="date" value={ini} max={fim} onChange={(e) => setIni(e.target.value)} aria-label="Data inicial" />
              <span aria-hidden>→</span>
              <Input type="date" value={fim} min={ini} max={spHoje()} onChange={(e) => setFim(e.target.value)} aria-label="Data final" />
            </div>
          )}
        </div>
      </div>

      {DASH_REAL && isError ? (
        <CardVidro className="db-sec">
          <EstadoErro
            descricao={(error as Error)?.message ?? 'Não foi possível carregar o período.'}
            aoTentarDeNovo={() => void refetch()}
          />
        </CardVidro>
      ) : (
        <div className="db-bento">
          {/* ===== fileira HERO ===== */}
          <Hero rotulo="Novos leads" k={kp((k) => k.novos_leads)} sentido="maior" fmt={fmtInt} atraso={0}
            ajuda="Contatos criados no período (duplicatas mescladas não contam)." carregando={carregando}
            spark={d?.leads_por_dia?.map((x) => ({ v: x.qtd }))} corSpark={p.azul} />
          <Hero rotulo="Conversas ativas" k={kp((k) => k.conversas_ativas)} sentido="maior" fmt={fmtInt} atraso={0.05}
            ajuda="Conversas com pelo menos uma mensagem no período." carregando={carregando} />
          <Hero rotulo="Ganhos" k={kp((k) => k.ganhos_qtd)} sentido="maior" fmt={fmtInt} atraso={0.1}
            ajuda="Oportunidades fechadas como ganho no período. O valor soma o ressarcido (ou o estimado)."
            sub={d && d.kpis.ganhos_valor > 0 ? fmtBRL(d.kpis.ganhos_valor) : undefined} carregando={carregando} />
          <Hero rotulo="1ª resposta" k={kp((k) => k.mediana_primeira_resposta_min)} sentido="menor" fmt={fmtMin} atraso={0.15}
            ajuda="Do primeiro “oi” do cliente até a primeira resposta humana — bot não conta. Mediana, não média."
            sub="mediana do período" carregando={carregando} />

          {/* ===== atividade (área azul com gradiente · por hora no Hoje) ===== */}
          <Secao className="db-span8" titulo={porHora ? 'Atividade de hoje' : 'Leads por dia'}
            sub={porHora ? 'mensagens recebidas por hora' : periodo.label} atraso={0.18}>
            {carregando ? <Skeleton altura={210} raio={12} /> : porHora ? (
              !d?.picos_hora?.some((h) => h.qtd > 0) ? <Vazio texto="Nenhuma mensagem recebida hoje." /> : (
                <div className="db-graf">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={d.picos_hora} margin={{ top: 6, right: 4, left: -8, bottom: 0 }}>
                      <XAxis dataKey="hora" tick={eixo} tickLine={false} axisLine={{ stroke: tinta(p, 0.09) }} interval={2} tickFormatter={(h) => `${h}h`} />
                      <YAxis tick={eixo} tickLine={false} axisLine={false} allowDecimals={false} width={38} />
                      <Tooltip cursor={{ fill: tinta(p, 0.05) }} content={<TipPlatina sufixo="mensagens" fmtLabel={(v) => `${v}h`} />} />
                      <Bar dataKey="qtd" radius={[4, 4, 0, 0]} maxBarSize={26} fill={p.azul} fillOpacity={0.75} isAnimationActive={anima} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )
            ) : !d?.leads_por_dia?.length ? <Vazio texto="Nenhum lead no período." /> : (
              <div className="db-graf">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={d.leads_por_dia} margin={{ top: 6, right: 4, left: -8, bottom: 0 }}>
                    <defs>
                      <linearGradient id="g-atividade" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={p.azul} stopOpacity={0.42} />
                        <stop offset="100%" stopColor={p.azul} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="dia" tickFormatter={fmtDiaCurto} tick={eixo} tickLine={false}
                      axisLine={{ stroke: tinta(p, 0.09) }} interval="preserveStartEnd" minTickGap={14} />
                    <YAxis tick={eixo} tickLine={false} axisLine={false} allowDecimals={false} width={38} />
                    <Tooltip cursor={{ stroke: tinta(p, 0.2) }} content={<TipPlatina sufixo="leads" fmtLabel={(v) => fmtDiaCurto(String(v))} />} />
                    <Area dataKey="qtd" stroke={p.azul} strokeWidth={2.2} fill="url(#g-atividade)" isAnimationActive={anima} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </Secao>

          {/* ===== DONUT da IA (anatomia da referência: total no centro + legenda) ===== */}
          <Secao className="db-span4" titulo="A IA da casa" sub="sessões agora" atraso={0.22}>
            {DASH_REAL && iaQ.isPending ? <Skeleton altura={210} raio={12} /> : !ia ? <Vazio texto="Sem dados da IA." /> : (
              <div className="db-donut-wrap">
                <div className="db-donut">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={donutIa} dataKey="v" nameKey="nome" innerRadius="68%" outerRadius="94%"
                        startAngle={90} endAngle={-270} stroke="none" isAnimationActive={anima} paddingAngle={2}>
                        {donutIa.map((x) => <Cell key={x.nome} fill={x.cor} />)}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="centro">
                    <b className="num"><Contador valor={vivasIa} fmt={fmtInt} /></b>
                    <span>vivas agora</span>
                  </div>
                </div>
                <div className="db-donut-leg">
                  <div className="li"><i style={{ background: p.verde }} />Atendendo<b className="num">{fmtInt(ia.sessoesAtivas)}</b></div>
                  <div className="li"><i style={{ background: p.ambar }} />Aguardando humano<b className="num">{fmtInt(ia.aguardandoHumano)}</b></div>
                  <div className="li"><i style={{ background: p.rubro }} />Handoff<b className="num">{fmtInt(ia.handoffs)}</b></div>
                  <div className="li"><i style={{ background: tinta(p, 0.25) }} />Pausadas<b className="num">{fmtInt(ia.pausadas)}</b></div>
                  {ia.precisaHumanoAgora > 0 && (
                    <div className="alerta" title="Conversas com pedido de humano em aberto agora — independe do período.">
                      ⚠ {fmtInt(ia.precisaHumanoAgora)} pedido{ia.precisaHumanoAgora > 1 ? 's' : ''} de humano em aberto
                    </div>
                  )}
                </div>
              </div>
            )}
          </Secao>

          {/* ===== equipe em LISTA (avatar + chips, como a referência) ===== */}
          <Secao className="db-span7" titulo="Equipe" sub="ordenado por ganhos no período" atraso={0.26}>
            {carregando ? <Skeleton altura={180} raio={12} /> : !atendentes.length ? (
              <Vazio texto="Nenhum atendente ativo na organização." />
            ) : (
              <div className="db-equipe">
                {atendentes.map((a: DashAtendente, i) => (
                  <div className="db-at" key={a.nome}>
                    <span className="av" aria-hidden>{initials(a.nome)}</span>
                    <span className="quem">
                      <span className="nm">{a.nome}{i === 0 && a.ganhos > 0 && <b className="top">top do período</b>}</span>
                      <span className="sub num">{fmtInt(a.conversas_atribuidas)} conversas · 1ª resposta {fmtMin(a.mediana_resposta_min)}</span>
                    </span>
                    <span className="msgs">
                      <span className="n num">{fmtInt(a.msgs_enviadas)} msgs</span>
                      <i className="trilho"><em style={{ width: `${Math.max(3, (a.msgs_enviadas / maxMsgsAt) * 100)}%` }} /></i>
                    </span>
                    <span className="chips">
                      <b className="c ok num" title="Ganhos no período">{fmtInt(a.ganhos)}</b>
                      <b className="c er num" title="Perdidos no período">{fmtInt(a.perdidos)}</b>
                    </span>
                  </div>
                ))}
                <p className="db-nota">
                  Só entra o que o painel consegue atribuir: resposta pelo celular do consultor não tem
                  autor no banco — fica fora daqui, mas conta na 1ª resposta geral.
                </p>
              </div>
            )}
          </Secao>

          {/* ===== automação do período ===== */}
          <Secao className="db-span5" titulo="Automação" sub="quem falou no período" atraso={0.3}>
            {DASH_REAL && iaQ.isPending ? <Skeleton altura={180} raio={12} /> : !ia ? <Vazio texto="Sem dados da IA." /> : (
              <div className="db-auto">
                <div className="pct">
                  <b className="num"><Contador valor={pctBot} fmt={(n) => `${Math.round(n)}%`} /></b>
                  <span>das mensagens enviadas saíram da IA</span>
                </div>
                <div className="prop" aria-hidden>
                  <i style={{ width: `${pctBot}%` }} />
                </div>
                <div className="leg">
                  <span><i className="sw bot" aria-hidden /> IA <b className="num">{fmtInt(ia.msgsBot)}</b></span>
                  <span><i className="sw hum" aria-hidden /> equipe <b className="num">{fmtInt(ia.msgsHumano)}</b></span>
                </div>
                <div className="tt2">Fluxo vivo por etapa</div>
                {ia.porEtapa.length === 0 ? <Vazio texto="Nenhuma sessão ativa." /> : (
                  <BarrasH cor={p.azul} itens={ia.porEtapa.map((e) => ({ chave: e.etapa, rot: etapaIa(e.etapa), v: e.qtd }))} />
                )}
              </div>
            )}
          </Secao>

          {/* ===== funil + origem ===== */}
          <Secao className="db-span6" titulo="Funil" sub="abertas agora · fechadas no período" atraso={0.34}>
            {carregando ? <Skeleton altura={160} raio={12} /> : !d?.funil?.length ? (
              <Vazio texto="Nenhuma coluna de funil ativa." />
            ) : (
              <>
                <BarrasFunil linhas={d.funil} p={p} />
                {d.funil.some((f) => f.qtd_descarte > 0 || f.qtd_perda > 0) && (
                  <div className="db-legenda">
                    <span><i className="sw" style={{ background: p.verde }} aria-hidden /> ganho</span>
                    <span><i className="sw" style={{ background: p.ambar }} aria-hidden /> descarte (fora do perfil)</span>
                    <span><i className="sw" style={{ background: p.rubro }} aria-hidden /> perda real</span>
                  </div>
                )}
              </>
            )}
          </Secao>

          <Secao className="db-span6" titulo="Origem de tráfego" sub="clique para abrir os canais" atraso={0.38}>
            {carregando ? <Skeleton altura={160} raio={12} /> : !origens.length ? (
              <Vazio texto="Nenhum lead com origem no período." />
            ) : (
              <div className="db-origem">
                {origens.map((g) => {
                  const max = Math.max(1, ...origens.map((x) => x.qtd));
                  const aberta = fonteAberta === g.fonte;
                  return (
                    <div key={g.fonte} className={'grp' + (aberta ? ' on' : '')}>
                      <button type="button" className="cab" onClick={() => setFonteAberta(aberta ? null : g.fonte)} aria-expanded={aberta}>
                        <span className="seta" aria-hidden>{aberta ? '▾' : '▸'}</span>
                        <span className="rot" title={g.fonte}>{g.fonte}</span>
                        <div className="trilho"><i style={{ width: `${Math.max(2, (g.qtd / max) * 100)}%`, background: p.azul, opacity: 0.75 }} /></div>
                        <span className="v num">{fmtInt(g.qtd)}</span>
                      </button>
                      {aberta && (
                        <div className="canais">
                          {g.canais.map((c) => (
                            <div className="lin" key={c.canal}>
                              <span className="rot" title={c.canal}>{c.canal}</span>
                              <div className="trilho"><i style={{ width: `${Math.max(2, (c.qtd / g.qtd) * 100)}%` }} /></div>
                              <span className="v num">{fmtInt(c.qtd)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Secao>

          {/* ===== bancos + motivos ===== */}
          <Secao className="db-span6" titulo="Bancos das fichas" sub="mais citados no período" atraso={0.42}>
            {carregando ? <Skeleton altura={150} raio={12} /> : !d?.bancos?.length ? (
              <Vazio texto="Nenhuma ficha judicial no período." />
            ) : (
              <BarrasH itens={d.bancos.map((b) => ({ chave: b.banco, rot: <span className="db-banco">{b.banco}</span>, v: b.qtd }))} />
            )}
          </Secao>

          <Secao className="db-span6" titulo="Motivos de saída" sub="eventos do período" atraso={0.46}>
            {carregando ? <Skeleton altura={150} raio={12} /> : !d?.motivos_perda?.length ? (
              <Vazio texto="Nenhuma saída registrada no período." />
            ) : (
              <>
                <BarrasH itens={d.motivos_perda.map((m) => ({
                  chave: m.motivo,
                  rot: m.motivo === 'Sem motivo' ? 'Sem motivo' : rotuloMotivoPerda(m.motivo) || m.motivo,
                  v: m.qtd,
                  tag: m.grupo === 'descarte' ? 'descarte' : undefined,
                  cor: m.grupo === 'descarte' ? p.ambar : undefined,
                }))} />
                <p className="db-nota">Conta o que foi registrado no período. Reaberto depois continua listado aqui; nos números de cima vale o estado atual.</p>
              </>
            )}
          </Secao>
        </div>
      )}
    </div>
  );
}
