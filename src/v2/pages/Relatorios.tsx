import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useOrg } from '@/context/OrgContext';
import { useAuth } from '@/context/AuthContext';
import {
  REL_REAL, PRESETS, type Preset, type RelFiltros, FILTROS_PADRAO, resolvePeriodo, type Kpi as KpiNum,
  useRelatorioOpcoes, useResumo, useComercial, useAtendimento, useEquipe, useFinanceiro, useOrigens,
  useConexoes, type ConexaoLinha, type LinhaEquipe, type ResumoData, type ComercialData,
  type AtendimentoData, type FinanceiroData, type LinhaOrigem, montaLinhasEquipe,
  exportarCSV, spHoje, kpi, melhorConexao,
} from '@/data/relatorios';
import {
  BotaoSec, CardVidro, Chip, EstadoErro, EstadoVazio, Input, Segmentado, SkeletonTexto,
} from '../components';
import RelatoriosApresentacao from './RelatoriosApresentacao';
import './relatorios.css';

/* ------------------------------------------------------------------
   Relatórios v2 — verdade funcional do v1 (5 abas, filtros, regras
   A→D da camada viva src/data/relatorios.ts) vestida nos padrões do
   pg-relatorios: KPIs .kpi, barras verticais .barv, subtítulo de
   escopo, tabelas caps com CSV. Dado é calmo: sem contador animado.
   Gráficos de linha do v1 viram barras verticais (única anatomia de
   gráfico do mockup); donut mantido com tons neutros/semânticos.
   ------------------------------------------------------------------ */

/* ===== formatação PT-BR (idêntica ao v1) ===== */
const fmtInt = (n: number) => Math.round(n).toLocaleString('pt-BR');
const fmtBRL = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtPct = (n: number) => `${n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
const fmtMin = (n: number | null) => { if (n == null) return '—'; if (n < 60) return `${Math.round(n)} min`; const h = Math.floor(n / 60); return `${h}h ${Math.round(n % 60)}min`; };
const pl = (n: number, s: string, p: string) => `${fmtInt(n)} ${n === 1 ? s : p}`;
const CANAL_LABEL: Record<string, string> = { evolution: 'WhatsApp', meta: 'Facebook' };
const canalNome = (p: string) => CANAL_LABEL[p] || p;
const CANAL_OPCOES = [{ id: 'evolution', r: 'WhatsApp' }, { id: 'meta', r: 'Facebook' }];
const STATUS_OPP = [{ id: 'em_andamento', r: 'Em andamento' }, { id: 'ganho', r: 'Ganho' }, { id: 'perdido', r: 'Perdido' }, { id: 'cancelado', r: 'Cancelado' }];
const TIPO_LABEL: Record<string, string> = { trafego: 'Tráfego', ura: 'URA', organico: 'Orgânico', indicacao: 'Indicação', campanha: 'Campanha', parceiro: 'Parceiro', outro: 'Outro' };
const tipoNome = (t: string) => TIPO_LABEL[t] || (t || '—');
const conexRotulo = (l: { nome: string; numero: string; removida: boolean }) => (l.removida ? `Conexão removida${l.nome && l.nome !== 'Conexão removida' ? ' (' + l.nome + ')' : ''}` : l.nome) + (l.numero ? ` — ${l.numero}` : '');

type Sentido = 'maior' | 'menor' | 'neutro';
const flat = (v: number): KpiNum => ({ atual: v, anterior: v, deltaAbs: 0, deltaPct: 0 });

/* ===== KPI estático (.kpi do mockup; dado é calmo) ===== */
function KpiCard({ label, k, sentido, fmt, tooltip, nota, sobe, atraso, spark }: {
  label: string; k: KpiNum | null; sentido: Sentido; fmt: (n: number) => string; tooltip: string; nota?: string; sobe?: boolean; atraso?: number; spark?: number[];
}) {
  let delta: ReactNode = null;
  if (k && !nota) {
    if (sentido === 'neutro' || k.deltaAbs === 0) delta = <span className="delta d-ne">— estável vs anterior</span>;
    else {
      const bom = (sentido === 'maior' && k.deltaAbs > 0) || (sentido === 'menor' && k.deltaAbs < 0);
      const txt = k.deltaPct == null ? '—' : `${k.deltaPct > 0 ? '+' : ''}${k.deltaPct.toFixed(1)}%`;
      delta = <span className={'delta ' + (bom ? 'd-ok' : 'd-er')}>{k.deltaAbs > 0 ? '▲' : '▼'} {txt} vs anterior</span>;
    }
  }
  return (
    <CardVidro spot sobe={sobe} atraso={atraso} className="rl2-kpi" title={tooltip}>
      <div className="rot">{label}<span className="info" aria-hidden>i</span></div>
      {k == null ? (
        <>
          <div className="val ind">Indisponível</div>
          <div className="ant">{tooltip}</div>
        </>
      ) : (
        <>
          <div className="val num">{fmt(k.atual)}</div>
          {nota ? <span className="delta d-ne" style={{ marginTop: 6 }}>{nota}</span> : <>{delta}<div className="ant num">Anterior: {fmt(k.anterior)}</div></>}
          {spark && spark.length >= 2 && (
            <div className="rl2-spark" aria-hidden>
              {spark.map((v, i) => { const mx = Math.max(1, ...spark); return <i key={i} style={{ height: `${Math.max(6, (v / mx) * 100)}%` }} />; })}
            </div>
          )}
        </>
      )}
    </CardVidro>
  );
}

/* ===== vazio compacto (zero ≠ indisponível — textos do v1) ===== */
function Vazio({ titulo, texto }: { titulo: string; texto?: string }) {
  return <div className="rl2-vazio"><span aria-hidden>◌</span><div><div className="vt">{titulo}</div>{texto && <div className="vd">{texto}</div>}</div></div>;
}

/* ===== gráficos nos padrões do mockup ===== */
/** Barras verticais .barv (anatomia do pg-relatorios). Substitui LineChart/Bars/MiniBars do v1. */
function BarrasV({ pts, money, destaqueUltima, altura = 120, mostraValor = true }: {
  pts: { label: string; v: number }[]; money?: boolean; destaqueUltima?: boolean; altura?: number; mostraValor?: boolean;
}) {
  const max = Math.max(1, ...pts.map((p) => p.v));
  const fmtV = (v: number) => (money ? (max >= 1000 ? fmtInt(v / 1000) + 'k' : fmtInt(v)) : fmtInt(v));
  const passo = Math.max(1, Math.ceil(pts.length / 16));
  return (
    <div className="barras" style={{ height: altura }}>
      {pts.map((p, i) => (
        <div className="bwrap" key={i} title={`${p.label}: ${money ? fmtBRL(p.v) : fmtInt(p.v)}`}>
          {mostraValor && pts.length <= 16 && <span className="bval num" style={{ opacity: 1, animation: 'none' }}>{p.v > 0 ? fmtV(p.v) : ''}</span>}
          <div className={'barv' + (destaqueUltima && i === pts.length - 1 ? ' hoje2' : '')} style={{ height: `${Math.max(3, (p.v / max) * 100)}%`, animation: 'none', transform: 'none' }} />
          <span className="blab" style={destaqueUltima && i === pts.length - 1 ? { color: 'var(--txt)' } : undefined}>{i % passo === 0 || i === pts.length - 1 ? p.label : ''}</span>
        </div>
      ))}
    </div>
  );
}
function FunilV2({ stages }: { stages: { nome: string; total: number }[] }) {
  const max = Math.max(1, ...stages.map((s) => s.total));
  return (
    <div className="rl2-funil">
      {stages.map((s) => (
        <div className="fr" key={s.nome}>
          <span className="fn" title={s.nome}>{s.nome}</span>
          <div className="ft"><i style={{ width: `${(s.total / max) * 100}%` }} /></div>
          <span className="fv num">{fmtInt(s.total)}</span>
        </div>
      ))}
    </div>
  );
}
/** Donut: tons de TINTA (canal --tint: branco no dark, grafite no light — auditoria:
    literais brancos deixavam o donut ilegível no tema claro). var() só resolve em
    contexto CSS, por isso os segmentos recebem a cor via style, não via atributo. */
const DONUT_TONS = ['rgba(var(--tint),.85)', 'rgba(var(--tint),.45)', 'rgba(var(--tint),.22)', 'rgba(var(--tint),.12)', 'rgba(var(--tint),.07)'];
const STATUS_COR: Record<string, string> = { ganho: 'var(--verde)', perdido: 'var(--rubro)', em_andamento: 'rgba(var(--tint),.55)', cancelado: 'rgba(var(--tint),.18)' };
function DonutV2({ data, semantico }: { data: { label: string; v: number; chave?: string }[]; semantico?: boolean }) {
  const total = data.reduce((s, d) => s + d.v, 0);
  const size = 132, r = size / 2 - 10, C = 2 * Math.PI * r, cx = size / 2, cy = size / 2;
  let off = 0;
  const cor = (d: { chave?: string }, i: number) => (semantico && d.chave && STATUS_COR[d.chave]) || DONUT_TONS[i % DONUT_TONS.length];
  return (
    <div className="rl2-donut">
      <div className="centro">
        <svg viewBox={`0 0 ${size} ${size}`} width="132" height="132">
          {data.map((d, i) => {
            const len = total ? (d.v / total) * C : 0;
            const seg = <circle key={i} cx={cx} cy={cy} r={r} fill="none" style={{ stroke: cor(d, i) }} strokeWidth="14" strokeDasharray={`${len.toFixed(1)} ${(C - len).toFixed(1)}`} strokeDashoffset={(-off).toFixed(1)} transform={`rotate(-90 ${cx} ${cy})`} />;
            off += len;
            return seg;
          })}
        </svg>
        <div className="c"><b className="num">{fmtInt(total)}</b><i>total</i></div>
      </div>
      <div className="leg">
        {data.map((d, i) => (
          <div className="li" key={i}>
            <span className="sw" style={{ background: cor(d, i) }} />
            <span className="ln">{d.label}</span>
            <span className="lv num">{fmtInt(d.v)}</span>
            <span className="lp num">{total ? ((d.v / total) * 100).toFixed(0) : 0}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ===== painel/estado ===== */
function Painel({ title, sub, children, sobe, atraso }: { title: string; sub?: string; children: ReactNode; sobe?: boolean; atraso?: number }) {
  return <CardVidro spot sobe={sobe} atraso={atraso} className="rl2-painel"><div className="tt">{title}{sub && <span>{sub}</span>}</div>{children}</CardVidro>;
}
/* contrato item 7: loading = skeleton, erro = EstadoErro com "Tentar de novo" (auditoria). */
function Estado({ q, demo, children }: { q: { isLoading: boolean; isError: boolean; error?: unknown; refetch?: () => void }; demo: boolean; children: ReactNode }) {
  if (demo) return <>{children}</>;
  if (q.isLoading) return <div aria-busy aria-label="Carregando dados"><SkeletonTexto linhas={3} /></div>;
  if (q.isError) return <EstadoErro descricao={(q.error as Error)?.message || 'Erro ao carregar os dados.'} aoTentarDeNovo={() => q.refetch?.()} />;
  return <>{children}</>;
}

/* ===== tabela de relatório (busca + ordenação + paginação + CSV — lógica do v1) ===== */
interface Col<T> { key: keyof T & string; label: string; align?: 'l' | 'c' | 'r'; fmt?: (v: unknown, row: T) => ReactNode; csv?: (row: T) => string | number; }
function RelTabela<T extends Record<string, unknown>>({ cols, rows, searchKeys, csvName, csvMeta }: {
  cols: Col<T>[]; rows: T[]; searchKeys: (keyof T & string)[]; csvName: string; csvMeta: string[];
}) {
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<{ k: string; dir: 1 | -1 } | null>(null);
  const [page, setPage] = useState(1);
  const [per, setPer] = useState(10);
  const termo = q.trim().toLowerCase();
  const filtradas = useMemo(() => {
    let r = rows;
    if (termo) r = r.filter((row) => searchKeys.some((k) => String(row[k] ?? '').toLowerCase().includes(termo)));
    if (sort) {
      const { k, dir } = sort;
      r = [...r].sort((a, b) => {
        const av = a[k], bv = b[k];
        if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
        return String(av ?? '').localeCompare(String(bv ?? '')) * dir;
      });
    }
    return r;
  }, [rows, termo, sort, searchKeys]);
  const totalPag = Math.max(1, Math.ceil(filtradas.length / per));
  const pg = Math.min(page, totalPag);
  const visiveis = filtradas.slice((pg - 1) * per, pg * per);
  function exportar() { exportarCSV(csvName, cols.map((c) => c.label), filtradas.map((row) => cols.map((c) => (c.csv ? c.csv(row) : String(row[c.key] ?? '')))), csvMeta); }
  return (
    <CardVidro className="rl2-painel">
      <div className="rl2-tools">
        <div className="busca"><Input placeholder="Buscar…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} aria-label="Buscar na tabela" /></div>
        <span style={{ flex: 1 }} />
        <BotaoSec mini onClick={exportar}>Exportar CSV</BotaoSec>
      </div>
      <div className="rl2-scroll">
        <table className="rl2-tab" style={{ minWidth: 640 }}>
          <thead><tr>{cols.map((c) => (
            <th key={c.key} className={c.align === 'c' ? 'c' : c.align === 'r' ? 'd' : ''} onClick={() => setSort((s) => s?.k === c.key ? { k: c.key, dir: s.dir === 1 ? -1 : 1 } : { k: c.key, dir: 1 })}>
              {c.label}<span className="seta">{sort?.k === c.key ? (sort.dir === 1 ? '▲' : '▼') : '↕'}</span>
            </th>
          ))}</tr></thead>
          <tbody>
            {visiveis.length === 0 ? <tr><td colSpan={cols.length} className="vazia">Nenhum registro.</td></tr> : visiveis.map((row, i) => (
              <tr key={i}>{cols.map((c) => (
                <td key={c.key} className={(c.align === 'c' ? 'c' : c.align === 'r' ? 'd' : '') + (c.key === 'nome' || c.key === 'origem' ? ' nome' : '') + ' num'}>
                  {c.fmt ? c.fmt(row[c.key], row) : String(row[c.key] ?? '—')}
                </td>
              ))}</tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="rl2-rodape">
        <span className="num">{filtradas.length} registro{filtradas.length === 1 ? '' : 's'}</span>
        <nav className="rl2-pag" aria-label="Paginação">
          <button type="button" disabled={pg <= 1} onClick={() => setPage(pg - 1)}>‹</button>
          <span className="num" style={{ color: 'var(--txt-3)' }}>{pg} / {totalPag}</span>
          <button type="button" disabled={pg >= totalPag} onClick={() => setPage(pg + 1)}>›</button>
        </nav>
        <div className="rl2-perpage">
          <label htmlFor={`pp-${csvName}`}>Por página:</label>
          <select id={`pp-${csvName}`} className="inp" value={per} onChange={(e) => { setPer(Number(e.target.value)); setPage(1); }}>
            <option value={10}>10</option><option value={25}>25</option><option value={50}>50</option>
          </select>
        </div>
      </div>
    </CardVidro>
  );
}

/* ===== gargalo operacional ===== */
function Garg({ titulo, valor, sub, alerta }: { titulo: string; valor: string; sub: string; alerta?: boolean }) {
  return <div className={'rl2-garg' + (alerta ? ' al' : '')}><div className="t">{titulo}</div><div className="v num">{valor}</div><div className="s">{sub}</div></div>;
}

/* ============================================================
   v2.1 — CAMADA VISUAL: funil do tráfego, ranking, insights.
   Zero query nova: tudo agregação client-side dos hooks já
   carregados. AMOSTRA_MINIMA declarada: abaixo dela o cartão
   mostra o absoluto sem veredito.
   ============================================================ */
const AMOSTRA_MINIMA = 8;

const ETAPAS_TRAFEGO: { k: keyof ConexaoLinha; r: string }[] = [
  { k: 'pessoasQueChamaram', r: 'Pessoas que chamaram' },
  { k: 'conversasAtendidas', r: 'Conversas atendidas' },
  { k: 'oportunidades', r: 'Oportunidades' },
  { k: 'qualificados', r: 'Qualificados' },
  { k: 'fechados', r: 'Clientes fechados' },
];

/** Funil do tráfego: as colunas já existentes das conexões SÃO as etapas. */
function FunilTrafego({ linhas }: { linhas: ConexaoLinha[] }) {
  const reais = linhas.filter((l) => l.chave !== 'sem');
  const soma = (k: keyof ConexaoLinha) => linhas.reduce((s, l) => s + ((l[k] as number) || 0), 0);
  const agreg = ETAPAS_TRAFEGO.map((e) => ({ r: e.r, v: soma(e.k) }));
  const max = Math.max(1, ...agreg.map((a) => a.v));
  const melhor = melhorConexao(linhas);
  const comOpp = reais.filter((l) => l.oportunidades > 0);
  const pior = comOpp.length >= 2 ? comOpp.slice().sort((a, b) => a.taxaConversao - b.taxaConversao)[0] : null;
  if (agreg[0].v === 0) return <Vazio titulo="Sem tráfego no período" texto="O funil aparece quando houver pessoas chamando." />;
  return (
    <>
      <Painel title="Funil do tráfego" sub="etapas = colunas já medidas por conexão · taxa sobre a etapa anterior">
        <div className="rl2-ft">
          {agreg.map((e, i) => {
            const antes = i > 0 ? agreg[i - 1].v : 0;
            const taxa = i === 0 ? null : antes > 0 ? (e.v / antes) * 100 : null;
            return (
              <div className="et" key={e.r}>
                <span className="en">{e.r}</span>
                <div className="eb"><i style={{ width: `${(e.v / max) * 100}%` }} /></div>
                <span className="ev num">{fmtInt(e.v)}</span>
                <span className="ex num" title="Taxa sobre a etapa anterior — populações podem se sobrepor (ex.: uma pessoa com mais de uma conversa)">{taxa == null ? '' : `${taxa.toFixed(0)}%`}</span>
              </div>
            );
          })}
        </div>
      </Painel>
      {reais.length > 0 && (
        <div className="rl2-ftg" style={{ marginBottom: 12 }}>
          {reais.map((l) => {
            const base = Math.max(1, l.pessoasQueChamaram);
            const ehMelhor = melhor?.chave === l.chave && reais.length >= 2;
            const ehPior = pior?.chave === l.chave && !ehMelhor;
            return (
              <div className={'rl2-ftc' + (ehMelhor ? ' melhor' : '')} key={l.chave}>
                <div className="cn">
                  <span className="nome-cx">{conexRotulo(l)}</span>
                  {ehMelhor && <span className="tag m">Melhor</span>}
                  {ehPior && <span className="tag p">Menor conversão</span>}
                </div>
                <div className="cx-tx num">{fmtPct(l.taxaConversao)} de conversão · {fmtInt(l.fechados)} fechado{l.fechados === 1 ? '' : 's'}</div>
                <div className="mf">
                  {ETAPAS_TRAFEGO.map((e) => {
                    const v = (l[e.k] as number) || 0;
                    return (
                      <div className="r" key={e.k}>
                        <span>{e.r.replace('Pessoas que chamaram', 'Pessoas').replace('Conversas atendidas', 'Atendidas').replace('Clientes fechados', 'Fechados')}</span>
                        <div className="b"><i style={{ width: `${(v / base) * 100}%` }} /></div>
                        <span className="n num">{fmtInt(v)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

/** Ranking de atendentes: pódio pelo período do filtro; métrica selecionável
    entre colunas que o v1 já tem. Bot (se existir) e "Não atribuído" não competem. */
const METRICAS_RANK: { k: keyof LinhaEquipe; r: string; fmt: (n: number) => string }[] = [
  { k: 'clientesFechados', r: 'Clientes fechados', fmt: fmtInt },
  { k: 'negociosFechados', r: 'Negócios fechados', fmt: fmtInt },
  { k: 'contatos', r: 'Contatos atendidos', fmt: fmtInt },
  { k: 'taxaOperacional', r: 'Taxa operacional', fmt: fmtPct },
  { k: 'mensagensEnviadas', r: 'Mensagens enviadas', fmt: fmtInt },
  { k: 'receitaRecebida', r: 'Receita recebida', fmt: fmtBRL },
];
function RankingAtendentes({ linhas }: { linhas: LinhaEquipe[] }) {
  const [mk, setMk] = useState<keyof LinhaEquipe>('clientesFechados');
  const met = METRICAS_RANK.find((m) => m.k === mk)!;
  const ehTriagem = (l: LinhaEquipe) => /bot|matheo/i.test(l.nome);
  const ehAgregado = (l: LinhaEquipe) => l.id === 'nao' || l.nome === 'Não atribuído';
  const competidores = linhas.filter((l) => !ehTriagem(l) && !ehAgregado(l))
    .slice().sort((a, b) => ((b[mk] as number) || 0) - ((a[mk] as number) || 0));
  const foraDoPodio = linhas.filter((l) => ehTriagem(l) || ehAgregado(l));
  if (competidores.length === 0) return null;
  const podio = competidores.slice(0, 3);
  const resto = competidores.slice(3);
  return (
    <Painel title="Ranking de atendentes" sub="pelo período e filtros ativos">
      <div className="rl2-rk-metric" style={{ marginBottom: 11 }}>
        <span style={{ fontSize: 10.5, color: 'var(--txt-3)' }}>Ordenar por</span>
        <select className="inp rl2-sel" value={mk} onChange={(e) => setMk(e.target.value as keyof LinhaEquipe)} aria-label="Métrica do ranking">
          {METRICAS_RANK.map((m) => <option key={m.k} value={m.k}>{m.r}</option>)}
        </select>
      </div>
      <div className="rl2-podio">
        {podio.map((l, i) => (
          <div className={'rl2-pod' + (i === 0 ? ' ouro' : '')} key={l.id}>
            <span className="pos">{i + 1}º</span>
            <div className="nm">{l.nome}</div>
            <div className="mv">{met.fmt((l[mk] as number) || 0)}</div>
            <div className="ml">{met.r}</div>
          </div>
        ))}
      </div>
      {(resto.length > 0 || foraDoPodio.length > 0) && (
        <div className="rl2-rk-linhas">
          {resto.map((l, i) => (
            <div className="rl2-rk" key={l.id}>
              <span className="p num">{i + 4}º</span>
              <span className="n">{l.nome}</span>
              <span className="v num">{met.fmt((l[mk] as number) || 0)}</span>
            </div>
          ))}
          {foraDoPodio.map((l) => (
            <div className="rl2-rk triagem" key={l.id}>
              <span className="p">—</span>
              <span className="n">{l.nome}{ehTriagem(l) ? ' · triagem (não compete)' : ' · agregado (não compete)'}</span>
              <span className="v num">{met.fmt((l[mk] as number) || 0)}</span>
            </div>
          ))}
        </div>
      )}
    </Painel>
  );
}

/** Insights honestos: computados client-side, regra visível, amostra mínima declarada. */
interface Insight { t: string; v: string; f: string; como: string; amostra: number; }
function computaInsights(args: {
  at: AtendimentoData | null | undefined; fin: FinanceiroData | null | undefined;
  linhasCx: ConexaoLinha[]; pessoasTotal: number; fechadosTotal: number;
}): Insight[] {
  const { at, fin, linhasCx, pessoasTotal, fechadosTotal } = args;
  const out: Insight[] = [];
  const reais = linhasCx.filter((l) => l.chave !== 'sem');
  if (at) {
    const atendidas = at.totalConversas - at.semResposta;
    if (at.primeiraRespostaMin != null) out.push({
      t: 'Tempo até 1ª resposta', v: fmtMin(at.primeiraRespostaMin),
      f: `média sobre ${pl(atendidas, 'conversa atendida', 'conversas atendidas')}`,
      como: 'Como calculamos: média entre a 1ª mensagem recebida e a 1ª resposta de operador (autor identificado), por conversa do período.',
      amostra: atendidas,
    });
    out.push({
      t: 'Conversas sem resposta', v: fmtInt(at.semResposta),
      f: at.totalConversas > 0 ? `${fmtPct((at.semResposta / at.totalConversas) * 100)} das ${pl(at.totalConversas, 'conversa do período', 'conversas do período')}` : 'sem conversas no período',
      como: 'Como calculamos: conversas com mensagem recebida e nenhuma resposta de operador no período.',
      amostra: at.totalConversas,
    });
    const somaMsgs = at.porHora.reduce((s, v) => s + v, 0);
    if (somaMsgs > 0) {
      const hPico = at.porHora.indexOf(Math.max(...at.porHora));
      const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
      const dPico = at.porDiaSemana.indexOf(Math.max(...at.porDiaSemana));
      out.push({
        t: 'Pico de atividade', v: `${String(hPico).padStart(2, '0')}h · ${DIAS[dPico]}`,
        f: `hora e dia com mais mensagens (${fmtInt(somaMsgs)} no período)`,
        como: 'Como calculamos: histograma de mensagens por hora e por dia da semana (fuso de São Paulo); mostramos o maior de cada.',
        amostra: somaMsgs,
      });
    }
  }
  out.push({
    t: 'Conversão do período', v: pessoasTotal > 0 ? fmtPct((fechadosTotal / pessoasTotal) * 100) : '—',
    f: `${pl(fechadosTotal, 'cliente fechado', 'clientes fechados')} de ${pl(pessoasTotal, 'pessoa que chamou', 'pessoas que chamaram')}`,
    como: 'Como calculamos: clientes fechados (pessoa única por telefone, ganho por fechado_em) ÷ pessoas que chamaram (inbound, dedup por telefone).',
    amostra: pessoasTotal,
  });
  const melhor = melhorConexao(linhasCx);
  if (melhor && reais.length >= 2) out.push({
    t: 'Melhor conexão', v: melhor.nome,
    f: `${pl(melhor.pessoasQueChamaram, 'pessoa', 'pessoas')} · ${fmtInt(melhor.fechados)} fechado${melhor.fechados === 1 ? '' : 's'} · ${fmtPct(melhor.taxaConversao)}`,
    como: 'Como calculamos: conexão com mais pessoas que chamaram (desempate por clientes fechados), pela conexão de aquisição do contato.',
    amostra: melhor.pessoasQueChamaram,
  });
  if (fin && fin.vencTotalQtd > 0) out.push({
    t: 'Inadimplência', v: fmtPct(fin.inadimplencia),
    f: `sobre ${pl(fin.vencTotalQtd, 'parcela vencida', 'parcelas vencidas')} · ${fmtBRL(fin.vencida)} em aberto`,
    como: 'Como calculamos: parcelas vencidas e não pagas ÷ parcelas vencidas no período (posição de hoje para o valor em aberto).',
    amostra: fin.vencTotalQtd,
  });
  return out;
}
function SecaoInsights({ insights }: { insights: Insight[] }) {
  if (insights.length === 0) return null;
  return (
    <>
      <div className="rl2-sec" style={{ marginTop: 0 }}>Leituras do período <span>· computadas dos dados acima · passe o mouse para ver a regra</span></div>
      <div className="rl2-ins">
        {insights.map((i) => {
          const pequena = i.amostra < AMOSTRA_MINIMA;
          return (
            <div className={'rl2-in' + (pequena ? ' amostra' : '')} key={i.t} title={i.como}>
              <div className="t">{i.t}</div>
              <div className="v">{pequena ? `${fmtInt(i.amostra)} evento${i.amostra === 1 ? '' : 's'} no período` : i.v}</div>
              <div className="f">{pequena ? 'amostra pequena — sem veredito' : i.f}</div>
              <div className="como">{i.como.replace('Como calculamos: ', '')}</div>
            </div>
          );
        })}
      </div>
    </>
  );
}

/* ===== modo demonstração: seeds por aba ===== */
interface SeedRel {
  resumo: ResumoData;
  comercial: ComercialData;
  atendimento: AtendimentoData;
  equipe: LinhaEquipe[];
  financeiro: FinanceiroData;
  origens: LinhaOrigem[];
  conexoes: ConexaoLinha[];
}
function seedRel(): SeedRel {
  const linhaEq = (n: Partial<LinhaEquipe> & { id: string; nome: string }): LinhaEquipe => ({
    contatos: 0, oppTrabalhadas: 0, oppAndamento: 0, oppPerdido: 0, clientesFechados: 0, negociosFechados: 0,
    taxaOperacional: 0, mensagensEnviadas: 0, conversasSemResposta: 0, receitaContratada: 0, receitaRecebida: 0, ...n,
  });
  const conex = (n: Partial<ConexaoLinha> & { chave: string; nome: string }): ConexaoLinha => ({
    numero: '', tipo: '', gestor: '', fonte: '', campanha: '', removida: false,
    novosContatos: 0, leadsRecebidos: 0, leadsAnterior: 0, conversas: 0, conversasAtendidas: 0, semResposta: 0,
    pessoasQueChamaram: 0, contatosCriados: 0, conversasRecebidas: 0, msgsInbound: 0, msgsOutbound: 0,
    difContatosPessoas: 0, oportunidades: 0, qualificados: 0, fechados: 0, negociosFechados: 0, perdidos: 0,
    qualifFechados: 0, taxaAtendimento: 0, taxaQualificacao: 0, taxaConversao: 0, conversaoOportunidades: 0,
    convQualificados: 0, primeiraRespostaMin: null, tempoAteFechamentoDias: null, receitaPrevista: 0,
    receitaRecebida: 0, valoresAtraso: 0, economia: 0, economiaPreenchida: false, clientesPagantes: 0, ticketMedio: 0, ...n,
  });
  const dias = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Hoje'];
  const serie = [14, 18, 15, 22, 19, 8, 24].map((v, i) => ({ label: dias[i], v }));
  return {
    resumo: {
      novosContatos: kpi(64, 51), pessoasUnicas: kpi(58, 47), novasConversas: kpi(71, 60), conversasAtendidas: kpi(63, 51),
      taxaAtendimento: kpi(88.7, 85), oportunidadesCriadas: kpi(37, 29), oportunidadesFechadas: kpi(9, 7),
      negociosFechados: kpi(10, 7), conversaoComercial: kpi(24.3, 24.1), receitaRecebida: kpi(14850, 11200),
      receitaPrevista: kpi(19900, 18300), ticketMedio: kpi(412, 396), parcelasAtraso: 6, taxaInadimplencia: kpi(9.8, 12.4),
      economiaGerada: null, economiaPreenchida: false,
    },
    comercial: {
      leadsSerie: serie, totalOpp: 37, taxaConversao: 27, taxaFechamento: 24.3, perdidos: 6, paradasMais7d: 4,
      funil: [
        { id: 'c1', nome: 'Lead novo', ordem: 0, total: 14 },
        { id: 'c2', nome: 'Em atendimento', ordem: 1, total: 9 },
        { id: 'c3', nome: 'Documentação', ordem: 2, total: 6 },
        { id: 'c4', nome: 'Fechado', ordem: 3, total: 8 },
      ],
      porStatus: [
        { status: 'em_andamento', total: 21 }, { status: 'ganho', total: 10 }, { status: 'perdido', total: 6 },
      ],
    },
    atendimento: {
      totalConversas: 71, abertas: 18, resolvidas: 45, semResposta: 8, msgRecebidas: 612, msgEnviadas: 548,
      mediaMsgConversa: 16.3, primeiraRespostaMin: 12, taxaAtendimento: 88.7,
      porCanal: [{ canal: 'evolution', total: 58 }, { canal: 'meta', total: 13 }],
      porHora: [0, 0, 0, 0, 0, 0, 1, 3, 9, 16, 21, 18, 12, 14, 19, 22, 17, 12, 8, 4, 2, 1, 0, 0],
      porDiaSemana: [4, 22, 26, 24, 27, 21, 9],
    },
    equipe: [
      linhaEq({ id: 'u1', nome: 'Henrique Prado', contatos: 42, oppTrabalhadas: 17, oppAndamento: 9, oppPerdido: 2, clientesFechados: 5, negociosFechados: 6, taxaOperacional: 11.9, mensagensEnviadas: 231, conversasSemResposta: 3, receitaContratada: 6400, receitaRecebida: 7900 }),
      linhaEq({ id: 'u2', nome: 'Juliana Costa', contatos: 35, oppTrabalhadas: 12, oppAndamento: 8, oppPerdido: 3, clientesFechados: 3, negociosFechados: 3, taxaOperacional: 8.6, mensagensEnviadas: 187, conversasSemResposta: 4, receitaContratada: 3900, receitaRecebida: 4700 }),
      linhaEq({ id: 'nao', nome: 'Não atribuído', contatos: 11, oppTrabalhadas: 8, oppAndamento: 4, oppPerdido: 1, clientesFechados: 1, negociosFechados: 1, taxaOperacional: 9.1, mensagensEnviadas: 0, conversasSemResposta: 1, receitaContratada: 900, receitaRecebida: 2250 }),
    ],
    financeiro: {
      recebida: 14850, prevista: 19900, pendente: 5050, vencida: 2140, cancelada: 0,
      vencTotalQtd: 41, vencPagasQtd: 37, inadimplencia: 9.8, taxaRecebimento: 90.2,
      cobAtivas: 34, cobFinalizadas: 6, cobCanceladas: 2, parPrevistas: 12, parPagas: 37, parNaoPagas: 4, parCanceladas: 1,
      ticketMensal: 412,
      previsao6m: [
        { mes: '2026-08', previsto: 13800, recebido: 0 }, { mes: '2026-09', previsto: 13400, recebido: 0 },
        { mes: '2026-10', previsto: 12100, recebido: 0 }, { mes: '2026-11', previsto: 10400, recebido: 0 },
        { mes: '2026-12', previsto: 8600, recebido: 0 }, { mes: '2027-01', previsto: 7200, recebido: 0 },
      ],
      evolucao: [
        { mes: '2026-02', recebido: 8100 }, { mes: '2026-03', recebido: 9400 }, { mes: '2026-04', recebido: 10900 },
        { mes: '2026-05', recebido: 11700 }, { mes: '2026-06', recebido: 11200 }, { mes: '2026-07', recebido: 14850 },
      ],
      porServico: [{ nome: 'Revisão de contrato', total: 9200 }, { nome: 'Juros abusivos', total: 3600 }, { nome: 'Consultoria', total: 1200 }],
    },
    origens: [
      { origem: 'whatsapp', oportunidades: 21, ganhas: 6, taxaConversao: 28.6 },
      { origem: 'indicacao', oportunidades: 8, ganhas: 3, taxaConversao: 37.5 },
      { origem: 'trafego', oportunidades: 6, ganhas: 1, taxaConversao: 16.7 },
      { origem: 'facebook', oportunidades: 2, ganhas: 0, taxaConversao: 0 },
    ],
    conexoes: [
      conex({ chave: 'ch-1', nome: 'Atendimento Principal', numero: '+55 51 98888-0001', tipo: 'trafego', gestor: 'Henrique Prado', pessoasQueChamaram: 38, contatosCriados: 41, difContatosPessoas: 3, conversasRecebidas: 44, msgsInbound: 402, msgsOutbound: 361, conversasAtendidas: 40, semResposta: 4, oportunidades: 24, qualificados: 15, fechados: 6, negociosFechados: 7, perdidos: 4, taxaAtendimento: 90.9, taxaQualificacao: 62.5, taxaConversao: 15.8, conversaoOportunidades: 29.2, primeiraRespostaMin: 9, tempoAteFechamentoDias: 6.4, receitaPrevista: 12600, receitaRecebida: 9800, valoresAtraso: 1240, clientesPagantes: 14, ticketMedio: 700 }),
      conex({ chave: 'ch-2', nome: 'Número de campanha', numero: '+55 51 97777-0002', tipo: 'campanha', gestor: '', pessoasQueChamaram: 17, contatosCriados: 19, difContatosPessoas: 2, conversasRecebidas: 21, msgsInbound: 168, msgsOutbound: 149, conversasAtendidas: 17, semResposta: 4, oportunidades: 11, qualificados: 5, fechados: 2, negociosFechados: 2, perdidos: 2, taxaAtendimento: 81, taxaQualificacao: 45.5, taxaConversao: 11.8, conversaoOportunidades: 18.2, primeiraRespostaMin: 21, tempoAteFechamentoDias: 9.1, receitaPrevista: 4300, receitaRecebida: 3350, valoresAtraso: 900, clientesPagantes: 5, ticketMedio: 670 }),
      conex({ chave: 'snap:1', nome: 'Número antigo', numero: '+55 51 96666-0009', removida: true, tipo: 'ura', pessoasQueChamaram: 3, contatosCriados: 4, difContatosPessoas: 1, conversasRecebidas: 4, msgsInbound: 22, msgsOutbound: 17, conversasAtendidas: 3, semResposta: 1, oportunidades: 2, qualificados: 1, fechados: 1, negociosFechados: 1, taxaAtendimento: 75, taxaQualificacao: 50, taxaConversao: 33.3, conversaoOportunidades: 50, primeiraRespostaMin: 34, receitaPrevista: 900, receitaRecebida: 1700, clientesPagantes: 2, ticketMedio: 850 }),
      conex({ chave: 'sem', nome: 'Sem origem', pessoasQueChamaram: 0, contatosCriados: 2, difContatosPessoas: 2 }),
    ],
  };
}

/* ===== abas ===== */
const ABAS = [
  { id: 'resumo', label: 'Resumo' }, { id: 'vendas', label: 'Vendas' }, { id: 'atendimento', label: 'Atendimento e equipe' },
  { id: 'financeiro', label: 'Financeiro' }, { id: 'detalhamento', label: 'Detalhamento' },
] as const;
type Aba = typeof ABAS[number]['id'];

export default function RelatoriosV2() {
  const { currentOrg } = useOrg();
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const demo = !REL_REAL;
  const seed = useMemo(() => (demo ? seedRel() : null), [demo]);
  const ehAtendente = currentOrg.role === 'atendente';
  const [aba, setAba] = useState<Aba>('resumo');
  const [f, setF] = useState<RelFiltros>(() => (ehAtendente && user ? { ...FILTROS_PADRAO, responsavel: user.id } : FILTROS_PADRAO));
  const [custIni, setCustIni] = useState(spHoje());
  const [custFim, setCustFim] = useState(spHoje());
  const [mais, setMais] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const periodo = resolvePeriodo(f.preset, f.ini, f.fim);
  const opcoes = useRelatorioOpcoes();
  const setFiltro = (k: keyof RelFiltros, v: string) => setF((s) => ({ ...s, [k]: v || undefined }));
  function setPreset(p: Preset) { if (p === 'custom') setF((s) => ({ ...s, preset: p, ini: custIni, fim: custFim })); else setF((s) => ({ ...s, preset: p, ini: undefined, fim: undefined })); }
  function aplicarCustom(ini: string, fim: string) { setCustIni(ini); setCustFim(fim); setF((s) => ({ ...s, preset: 'custom', ini, fim })); }
  function atualizar() { qc.invalidateQueries({ predicate: (qq) => String(qq.queryKey[0]).startsWith('rel-') }); setAviso('Dados atualizados'); }
  function limpar() { setF({ ...FILTROS_PADRAO, ...(ehAtendente && user ? { responsavel: user.id } : {}) }); }

  const [apresentar, setApresentar] = useState(false);

  const dadosApresDemo = useMemo(() => {
    if (!demo || !seed) return null;
    const soma = (k: keyof ConexaoLinha) => seed.conexoes.reduce((s, l) => s + ((l[k] as number) || 0), 0);
    const pessoas = soma('pessoasQueChamaram');
    const clientes = seed.resumo.oportunidadesFechadas.atual;
    return {
      pessoas, clientes,
      conversao: pessoas > 0 ? (clientes / pessoas) * 100 : null,
      receita: seed.resumo.receitaRecebida.atual,
      semResposta: seed.atendimento.semResposta,
      primeiraRespostaMin: seed.atendimento.primeiraRespostaMin,
      funil: [
        { r: 'Pessoas que chamaram', v: pessoas },
        { r: 'Conversas atendidas', v: soma('conversasAtendidas') },
        { r: 'Oportunidades', v: soma('oportunidades') },
        { r: 'Qualificados', v: soma('qualificados') },
        { r: 'Clientes fechados', v: soma('fechados') },
      ],
      competidores: seed.equipe.filter((l) => l.id !== 'nao'),
      melhor: melhorConexao(seed.conexoes),
      inadimplencia: { taxa: seed.financeiro.inadimplencia, parcelas: seed.financeiro.vencTotalQtd },
    };
  }, [demo, seed]);

  const chips: { k: keyof RelFiltros; lbl: string; val: string }[] = [];
  if (f.canal) chips.push({ k: 'canal', lbl: 'Canal', val: canalNome(f.canal) });
  if (f.origem) chips.push({ k: 'origem', lbl: 'Origem', val: f.origem });
  if (f.responsavel && !ehAtendente) chips.push({ k: 'responsavel', lbl: 'Responsável', val: opcoes.data?.responsaveis.find((r) => r.id === f.responsavel)?.nome || '—' });
  if (f.coluna) chips.push({ k: 'coluna', lbl: 'Etapa', val: opcoes.data?.colunas.find((c) => c.id === f.coluna)?.nome || '—' });
  if (f.status) chips.push({ k: 'status', lbl: 'Status', val: STATUS_OPP.find((s) => s.id === f.status)?.r || f.status });
  if (f.conexao) chips.push({ k: 'conexao', lbl: 'Conexão', val: opcoes.data?.conexoes.find((c) => c.id === f.conexao)?.nome || '—' });

  const escopo = [
    periodo.label,
    f.responsavel && !ehAtendente ? (opcoes.data?.responsaveis.find((r) => r.id === f.responsavel)?.nome ?? 'responsável') : 'todos os consultores',
    f.canal ? canalNome(f.canal) : 'todos os canais',
  ].join(' · ');

  return (
    <div className="rl2-raiz">
      <div>
      <div className="ph sobe">
        <div>
          <h2>Relatórios</h2>
          <p>{escopo}{demo ? ' · modo demonstração' : ''}</p>
        </div>
        <div className="acoes">
          <BotaoSec onClick={() => setApresentar(true)}>Apresentar</BotaoSec>
        </div>
      </div>

      {apresentar && (
        <RelatoriosApresentacao
          f={f}
          demo={demo}
          dadosDemo={dadosApresDemo}
          orgNome={currentOrg.name}
          periodoLabel={periodo.label}
          aoFechar={() => setApresentar(false)}
        />
      )}

      {aviso && (
        <div className="aviso-inline" role="status">{aviso}<button type="button" onClick={() => setAviso(null)} aria-label="Fechar aviso">×</button></div>
      )}

      {/* filtros — linha principal */}
      <div className="rl2-toolbar sobe" style={{ animationDelay: '.05s' }}>
        <Segmentado<Preset>
          rotulo="Período"
          valor={f.preset}
          aoMudar={setPreset}
          opcoes={PRESETS.map((p) => ({ valor: p.id, rotulo: p.label }))}
        />
        {f.preset !== 'custom' && <span className="rl2-datas num">{periodo.label}</span>}
        {f.preset === 'custom' && (
          <span className="rl2-datas">
            <input type="date" className="inp" value={custIni} max={custFim} onChange={(e) => aplicarCustom(e.target.value, custFim)} aria-label="Data inicial" />
            até
            <input type="date" className="inp" value={custFim} min={custIni} max={spHoje()} onChange={(e) => aplicarCustom(custIni, e.target.value)} aria-label="Data final" />
          </span>
        )}
        <select className="inp rl2-sel" aria-label="Canal" value={f.canal || ''} onChange={(e) => setFiltro('canal', e.target.value)}>
          <option value="">Canal: todos</option>
          {CANAL_OPCOES.map((c) => <option key={c.id} value={c.id}>{c.r}</option>)}
        </select>
        {!ehAtendente && (
          <select className="inp rl2-sel" aria-label="Responsável" value={f.responsavel || ''} onChange={(e) => setFiltro('responsavel', e.target.value)}>
            <option value="">Responsável: todos</option>
            {(opcoes.data?.responsaveis || []).map((r) => <option key={r.id} value={r.id}>{r.nome}</option>)}
          </select>
        )}
        <BotaoSec mini onClick={() => setMais((m) => !m)}>Mais filtros</BotaoSec>
        <span style={{ flex: 1 }} />
        <BotaoSec mini onClick={atualizar}>Atualizar</BotaoSec>
      </div>
      {mais && (
        <div className="rl2-toolbar">
          <select className="inp rl2-sel" aria-label="Origem" value={f.origem || ''} onChange={(e) => setFiltro('origem', e.target.value)}>
            <option value="">Origem: todas</option>
            {(opcoes.data?.origens || []).map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
          <select className="inp rl2-sel" aria-label="Etapa" value={f.coluna || ''} onChange={(e) => setFiltro('coluna', e.target.value)}>
            <option value="">Etapa: todas</option>
            {(opcoes.data?.colunas || []).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
          <select className="inp rl2-sel" aria-label="Status" value={f.status || ''} onChange={(e) => setFiltro('status', e.target.value)}>
            <option value="">Status: todos</option>
            {STATUS_OPP.map((s) => <option key={s.id} value={s.id}>{s.r}</option>)}
          </select>
          <select className="inp rl2-sel" aria-label="Conexão de WhatsApp" value={f.conexao || ''} onChange={(e) => setFiltro('conexao', e.target.value)}>
            <option value="">Conexão: todas</option>
            {(opcoes.data?.conexoes || []).map((c) => <option key={c.id} value={c.id}>{c.nome}{c.numero ? ' — ' + c.numero : ''}</option>)}
          </select>
        </div>
      )}
      {chips.length > 0 && (
        <div className="rl2-chips">
          <span className="rot">Filtros ativos:</span>
          {chips.map((c) => <Chip key={c.k} ativo removivel onClick={() => setFiltro(c.k, '')}>{c.lbl}: {c.val}</Chip>)}
          <Chip limpar onClick={limpar}>Limpar tudo</Chip>
        </div>
      )}

      <div className="rl2-toolbar sobe" style={{ animationDelay: '.09s' }}>
        <Segmentado<Aba> rotulo="Seção do relatório" valor={aba} aoMudar={setAba} opcoes={ABAS.map((a) => ({ valor: a.id, rotulo: a.label }))} />
      </div>

      <div className="rl2-escopo num">
        Período: <b>{periodo.label}</b> · comparado a <b>{periodo.prevLabel}</b> · {currentOrg.name}
      </div>

      {aba === 'resumo' && <AbaResumo f={f} demo={demo} seed={seed} periodoLabel={periodo.label} orgNome={currentOrg.name} ehAtendente={ehAtendente} />}
      {aba === 'vendas' && <AbaVendas f={f} demo={demo} seed={seed} periodoLabel={periodo.label} orgNome={currentOrg.name} />}
      {aba === 'atendimento' && <AbaAtendimento f={f} demo={demo} seed={seed} periodoLabel={periodo.label} orgNome={currentOrg.name} ehAtendente={ehAtendente} />}
      {aba === 'financeiro' && <AbaFinanceiro f={f} demo={demo} seed={seed} />}
      {aba === 'detalhamento' && <AbaDetalhamento f={f} demo={demo} seed={seed} periodoLabel={periodo.label} orgNome={currentOrg.name} ehAtendente={ehAtendente} onNav={navigate} />}
      </div>
    </div>
  );
}

/* ============ Resumo (visão executiva) ============ */
function AbaResumo({ f, demo, seed, periodoLabel, orgNome, ehAtendente }: { f: RelFiltros; demo: boolean; seed: SeedRel | null; periodoLabel: string; orgNome: string; ehAtendente: boolean }) {
  const q = useResumo(f);
  const at = useAtendimento(f, !demo);
  const fin = useFinanceiro(f, !demo);
  const com = useComercial(f, !demo);
  const cx = useConexoes(f, !demo);
  const eq = useEquipe(f, !demo && !ehAtendente);
  const meta = [`Organizacao: ${orgNome}`, `Periodo: ${periodoLabel}`, `Gerado: ${new Date().toLocaleString('pt-BR')}`];

  const dResumo = demo ? seed!.resumo : q.data;
  const dAt = demo ? seed!.atendimento : at.data;
  const dFin = demo ? seed!.financeiro : fin.data;
  const dCom = demo ? seed!.comercial : com.data;
  const linhasCx = demo ? seed!.conexoes : (cx.data || []);
  const equipeRows: LinhaEquipe[] = demo ? seed!.equipe : (eq.data ? montaLinhasEquipe(eq.data) : []);

  const pessoasTotal = linhasCx.reduce((s, l) => s + l.pessoasQueChamaram, 0);
  const conexRows = linhasCx.filter((l) => l.chave !== 'sem')
    .slice().sort((a, b) => b.fechados - a.fechados || b.pessoasQueChamaram - a.pessoasQueChamaram || b.taxaConversao - a.taxaConversao);
  const semRespostaTotal = dAt?.semResposta ?? 0;
  const paradas7d = dCom?.paradasMais7d ?? 0;
  const canalBaixa = conexRows.filter((l) => l.oportunidades > 0).slice().sort((a, b) => a.taxaConversao - b.taxaConversao)[0];
  const atendenteSobre = equipeRows.slice().sort((a, b) => b.contatos - a.contatos)[0];
  const temCx = demo || !!cx.data;

  return (
    <Estado q={q} demo={demo}>
      {dResumo && <>
        <div className="rl2-kpis">
          <KpiCard sobe atraso={0.07} label="Pessoas que chamaram" k={temCx ? flat(pessoasTotal) : null} sentido="maior" fmt={fmtInt} nota="No período" tooltip="Pessoas únicas com ≥1 mensagem recebida (inbound) no período, deduplicadas por telefone (ignora 9º dígito/DDI). Não inclui contatos que só receberam mensagem nossa (outbound)." />
          <KpiCard sobe atraso={0.1} label="Clientes fechados" k={dResumo.oportunidadesFechadas} sentido="maior" fmt={fmtInt} tooltip="Pessoas únicas (deduplicadas por telefone: ignora 9º dígito/DDI) com oportunidade ganha FECHADA no período (por fechado_em). Não conta a mesma pessoa duas vezes, mesmo que ela tenha contatos duplicados." />
          <KpiCard sobe atraso={0.13} label="Taxa de conversão" k={temCx ? flat(pessoasTotal > 0 ? (dResumo.oportunidadesFechadas.atual / pessoasTotal) * 100 : 0) : null} sentido="maior" fmt={fmtPct} nota="Clientes ÷ pessoas" tooltip="Clientes fechados ÷ pessoas que chamaram no período." />
          <KpiCard sobe atraso={0.16} label="Receita recebida" k={dResumo.receitaRecebida} sentido="maior" fmt={fmtBRL} tooltip="Σ valor pago das parcelas pagas no período." />
          <KpiCard sobe atraso={0.19} label="Valores em atraso" k={dFin ? flat(dFin.vencida) : flat(0)} sentido="menor" fmt={fmtBRL} nota="Posição atual" tooltip="Parcelas não pagas com vencimento anterior a hoje (posição atual, não comparada)." />
          <KpiCard sobe atraso={0.22} label="Conversas sem resposta" k={dAt ? flat(dAt.semResposta) : null} sentido="menor" fmt={fmtInt} nota="No período" tooltip="Conversas com entrada e nenhuma resposta de operador no período." />
        </div>

        <SecaoInsights insights={computaInsights({ at: dAt, fin: dFin, linhasCx, pessoasTotal, fechadosTotal: dResumo.oportunidadesFechadas.atual })} />

        <div className="rl2-sec">Funil do tráfego <span>· agregado do período + por conexão</span></div>
        <Estado q={cx} demo={demo}><FunilTrafego linhas={linhasCx} /></Estado>

        <div className="rl2-sec">Desempenho por número / conexão <span>· por conexão de aquisição</span></div>
        <Estado q={cx} demo={demo}>{conexRows.length === 0 ? <Vazio titulo="Sem conexões com resultado no período" /> : <RelTabela
          cols={[
            { key: 'nome', label: 'Número / Conexão', fmt: (_v, r) => conexRotulo(r as unknown as ConexaoLinha), csv: (r) => conexRotulo(r as unknown as ConexaoLinha) },
            { key: 'pessoasQueChamaram', label: 'Pessoas que chamaram', align: 'c' },
            { key: 'contatosCriados', label: 'Contatos criados', align: 'c' },
            { key: 'oportunidades', label: 'Oportunidades', align: 'c' },
            { key: 'fechados', label: 'Clientes fechados', align: 'c' },
            { key: 'taxaConversao', label: 'Taxa de conversão', align: 'c', fmt: (v) => fmtPct(v as number), csv: (r) => (r.taxaConversao as number).toFixed(1) },
            { key: 'msgsInbound', label: 'Mensagens inbound', align: 'c' },
            { key: 'msgsOutbound', label: 'Mensagens outbound', align: 'c' },
            { key: 'semResposta', label: 'Conversas sem resposta', align: 'c' },
          ] as Col<Record<string, unknown>>[]}
          rows={conexRows as unknown as Record<string, unknown>[]} searchKeys={['nome', 'numero']}
          csvName={`resumo_conexoes_${periodoLabel.replace(/\D/g, '')}`} csvMeta={meta} />}</Estado>

        {!ehAtendente && <>
          <div className="rl2-sec">Desempenho por atendente <span>· por responsável</span></div>
          <RankingAtendentes linhas={equipeRows} />
          <Estado q={eq} demo={demo}>{equipeRows.length === 0 ? <Vazio titulo="Sem atendentes com dados no período" /> : <RelTabela
            cols={[
              { key: 'nome', label: 'Atendente' },
              { key: 'contatos', label: 'Contatos atendidos', align: 'c' },
              { key: 'oppTrabalhadas', label: 'Oportunidades trabalhadas', align: 'c' },
              { key: 'clientesFechados', label: 'Clientes fechados', align: 'c' },
              { key: 'negociosFechados', label: 'Negócios fechados', align: 'c' },
              { key: 'taxaOperacional', label: 'Taxa operacional', align: 'c', fmt: (v) => fmtPct(v as number), csv: (r) => (r.taxaOperacional as number).toFixed(1) },
              { key: 'mensagensEnviadas', label: 'Mensagens enviadas', align: 'c' },
              { key: 'conversasSemResposta', label: 'Conversas sem resposta', align: 'c' },
              { key: 'receitaRecebida', label: 'Receita recebida', align: 'r', fmt: (v) => fmtBRL(v as number), csv: (r) => (r.receitaRecebida as number).toFixed(2) },
            ] as Col<Record<string, unknown>>[]}
            rows={equipeRows as unknown as Record<string, unknown>[]} searchKeys={['nome']}
            csvName={`resumo_atendentes_${periodoLabel.replace(/\D/g, '')}`} csvMeta={meta} />}</Estado>
        </>}

        <div className="rl2-sec">Gargalos e alertas <span>· operacional</span></div>
        <div className="rl2-gargs">
          <Garg titulo="Conversas sem resposta" valor={fmtInt(semRespostaTotal)} sub="Precisam de retorno" alerta={semRespostaTotal > 0} />
          <Garg titulo="Oportunidades paradas" valor={fmtInt(paradas7d)} sub="Há mais de 7 dias sem atualização" alerta={paradas7d > 0} />
          <Garg titulo="Canal com baixa conversão" valor={canalBaixa ? conexRotulo(canalBaixa) : '—'} sub={canalBaixa ? `Conversão de ${fmtPct(canalBaixa.taxaConversao)}` : 'Sem dados'} alerta={!!canalBaixa && canalBaixa.taxaConversao < 5} />
          <Garg titulo="Atendente sobrecarregado" valor={atendenteSobre ? atendenteSobre.nome : '—'} sub={atendenteSobre ? `${fmtInt(atendenteSobre.contatos)} contatos na carteira` : 'Sem dados'} />
        </div>
      </>}
    </Estado>
  );
}

/* ============ Vendas ============ */
function AbaVendas({ f, demo, seed, periodoLabel, orgNome }: { f: RelFiltros; demo: boolean; seed: SeedRel | null; periodoLabel: string; orgNome: string }) {
  const q = useComercial(f, !demo);
  const or = useOrigens(f, !demo);
  const d = demo ? seed!.comercial : q.data;
  const dOr = demo ? seed!.origens : or.data;
  const meta = [`Organizacao: ${orgNome}`, `Periodo: ${periodoLabel}`, `Gerado: ${new Date().toLocaleString('pt-BR')}`];
  const statusLabel: Record<string, string> = { em_andamento: 'Em andamento', ganho: 'Ganho', perdido: 'Perdido', cancelado: 'Cancelado' };
  return (
    <Estado q={q} demo={demo}>
      {d && <>
        <div className="rl2-kpis" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
          <KpiCard label="Novas oportunidades" k={flat(d.totalOpp)} sentido="neutro" fmt={fmtInt} nota="No período" tooltip="Oportunidades criadas no período." spark={d.leadsSerie.map((s) => s.v)} />
          <KpiCard label="Negócios fechados" k={flat(Math.round((d.taxaConversao / 100) * d.totalOpp))} sentido="neutro" fmt={fmtInt} nota="No período" tooltip="Oportunidades ganhas no período (por criação). Clientes distintos ficam no Resumo." />
          <KpiCard label="Clientes perdidos" k={flat(d.perdidos)} sentido="neutro" fmt={fmtInt} nota="No período" tooltip="Oportunidades com status perdido." />
          <KpiCard label="Conversão" k={flat(d.taxaConversao)} sentido="neutro" fmt={fmtPct} nota="No período" tooltip="Ganhas ÷ total de oportunidades criadas." />
        </div>
        <div className="rl2-g2">
          <Painel title="Funil comercial" sub="Etapas reais da organização">
            {d.funil.length === 0 || d.totalOpp === 0 ? <Vazio titulo="Sem oportunidades no período" texto="Quando houver oportunidades, o funil por etapa aparece aqui." /> : <FunilV2 stages={d.funil.map((c) => ({ nome: c.nome, total: c.total }))} />}
          </Painel>
          <Painel title="Situação das oportunidades" sub="Distribuição por status">
            {d.porStatus.length === 0 ? <Vazio titulo="Sem oportunidades no período" />
              : d.porStatus.length === 1 ? <div className="rl2-stat"><span className="v">{fmtInt(d.porStatus[0].total)}</span><span className="l">{statusLabel[d.porStatus[0].status] ?? d.porStatus[0].status}</span></div>
              : <DonutV2 semantico data={d.porStatus.map((s) => ({ label: statusLabel[s.status] ?? s.status, v: s.total, chave: s.status }))} />}
          </Painel>
        </div>
        <Painel title="Novas oportunidades por dia" sub="Oportunidades criadas">
          {d.leadsSerie.length < 2 ? <Vazio titulo="Dados insuficientes para a curva" texto={`No período: ${pl(d.totalOpp, 'oportunidade criada', 'oportunidades criadas')}.`} /> : <BarrasV pts={d.leadsSerie} destaqueUltima />}
        </Painel>

        <div className="rl2-sec">Oportunidades por origem</div>
        <Estado q={or} demo={demo}>{dOr && (dOr.length === 0
          ? <Vazio titulo="Sem origens no período" texto="As origens aparecem conforme as oportunidades são criadas." />
          : <>
            {dOr.length > 1 && (
              <Painel title="Oportunidades por origem">
                <BarrasV pts={dOr.slice(0, 10).map((o) => ({ label: o.origem.slice(0, 12), v: o.oportunidades }))} altura={104} />
              </Painel>
            )}
            <RelTabela
              cols={[
                { key: 'origem', label: 'Origem' }, { key: 'oportunidades', label: 'Oportunidades', align: 'c' },
                { key: 'ganhas', label: 'Ganhas', align: 'c' }, { key: 'taxaConversao', label: 'Conversão', align: 'c', fmt: (v) => fmtPct(v as number), csv: (r) => (r.taxaConversao as number).toFixed(1) },
              ] as Col<Record<string, unknown>>[]}
              rows={dOr as unknown as Record<string, unknown>[]} searchKeys={['origem']}
              csvName={`vendas_origens_${periodoLabel.replace(/\D/g, '')}`} csvMeta={meta} />
          </>)}</Estado>
      </>}
    </Estado>
  );
}

/* ============ Desempenho por conexão (Detalhamento) ============ */
function frasesConexoes(linhas: ConexaoLinha[]): string[] {
  const reais = linhas.filter((l) => l.chave !== 'sem' && l.pessoasQueChamaram > 0).sort((a, b) => b.pessoasQueChamaram - a.pessoasQueChamaram);
  const out = reais.slice(0, 3).map((l) => `${l.nome}: ${pl(l.pessoasQueChamaram, 'pessoa chamou', 'pessoas chamaram')} (${fmtInt(l.contatosCriados)} contatos criados), qualificou ${fmtInt(l.qualificados)} e fechou ${fmtInt(l.fechados)} — conversão de ${fmtPct(l.taxaConversao)}.`);
  if (reais.length >= 2) {
    const maisVol = reais[0];
    const melhorQual = reais.slice().sort((a, b) => b.taxaQualificacao - a.taxaQualificacao)[0];
    if (melhorQual.chave !== maisVol.chave) out.push(`${maisVol.nome} trouxe o maior volume, mas ${melhorQual.nome} entregou a melhor qualificação (${fmtPct(melhorQual.taxaQualificacao)}).`);
  }
  return out;
}
function SecaoConexoes({ f, demo, seed, periodoLabel, orgNome }: { f: RelFiltros; demo: boolean; seed: SeedRel | null; periodoLabel: string; orgNome: string }) {
  const q = useConexoes(f, !demo);
  const linhas = demo ? seed!.conexoes : (q.data || []);
  const reais = linhas.filter((l) => l.chave !== 'sem');
  const top = (campo: keyof ConexaoLinha) => reais.slice().sort((a, b) => (b[campo] as number) - (a[campo] as number))[0];
  const menorTempo = reais.filter((l) => l.primeiraRespostaMin != null).sort((a, b) => (a.primeiraRespostaMin as number) - (b.primeiraRespostaMin as number))[0];
  const meta = [`Organizacao: ${orgNome}`, `Periodo: ${periodoLabel}`, `Gerado: ${new Date().toLocaleString('pt-BR')}`, 'Atribuicao: conexao de aquisicao (contatos.canal_origem_id + snapshot historico)'];
  const HCard = ({ titulo, l, valor }: { titulo: string; l?: ConexaoLinha; valor?: string }) => (
    <Painel title={titulo}>{l ? <div className="rl2-stat" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}><span className="v" style={{ fontSize: 14 }}>{conexRotulo(l)}</span><span className="l">{valor}</span></div> : <div className="rl2-vazio"><div className="vd">Sem dados.</div></div>}</Painel>
  );
  return (
    <>
      <div className="rl2-sec">Desempenho por conexão de WhatsApp <span>· por conexão de aquisição (origem preservada)</span></div>
      <Estado q={q} demo={demo}>
        {reais.length === 0 ? <Vazio titulo="Sem conexões com resultado no período" texto="As pessoas são atribuídas à conexão de aquisição do contato; conexões removidas mantêm o histórico via snapshot." /> : <>
          <div className="rl2-g3">
            <HCard titulo="Mais pessoas que chamaram" l={top('pessoasQueChamaram')} valor={top('pessoasQueChamaram') ? `${fmtInt(top('pessoasQueChamaram').pessoasQueChamaram)} pessoas` : ''} />
            <HCard titulo="Mais clientes fechados" l={top('fechados')} valor={top('fechados') ? `${fmtInt(top('fechados').fechados)} fechados` : ''} />
            <HCard titulo="Melhor taxa de conversão" l={top('taxaConversao')} valor={top('taxaConversao') ? fmtPct(top('taxaConversao').taxaConversao) : ''} />
            <HCard titulo="Melhor taxa de qualificação" l={top('taxaQualificacao')} valor={top('taxaQualificacao') ? fmtPct(top('taxaQualificacao').taxaQualificacao) : ''} />
            <HCard titulo="Maior receita recebida" l={top('receitaRecebida')} valor={top('receitaRecebida') ? fmtBRL(top('receitaRecebida').receitaRecebida) : ''} />
            <HCard titulo="Menor tempo de 1ª resposta" l={menorTempo} valor={menorTempo ? fmtMin(menorTempo.primeiraRespostaMin) : ''} />
          </div>
          {frasesConexoes(linhas).length > 0 && <Painel title="Comparação entre conexões"><ul className="rl2-narr">{frasesConexoes(linhas).map((s, i) => <li key={i}>{s}</li>)}</ul></Painel>}
          <RelTabela
            cols={[
              { key: 'nome', label: 'Conexão', fmt: (_v, r) => conexRotulo(r as unknown as ConexaoLinha), csv: (r) => conexRotulo(r as unknown as ConexaoLinha) },
              { key: 'tipo', label: 'Tipo de origem', fmt: (v) => tipoNome(String(v || '')) === '—' ? 'Não configurado' : tipoNome(String(v || '')), csv: (r) => (r.tipo ? tipoNome(String(r.tipo)) : 'Não configurado') },
              { key: 'gestor', label: 'Gestor', fmt: (v) => (v ? String(v) : 'Não configurado'), csv: (r) => (r.gestor ? String(r.gestor) : 'Não configurado') },
              { key: 'fonte', label: 'Fonte / campanha', fmt: (_v, r) => [r.fonte, r.campanha].filter(Boolean).join(' · ') || '—', csv: (r) => [r.fonte, r.campanha].filter(Boolean).join(' / ') },
              { key: 'pessoasQueChamaram', label: 'Pessoas que chamaram', align: 'c' },
              { key: 'contatosCriados', label: 'Contatos criados', align: 'c' },
              { key: 'difContatosPessoas', label: 'Dif.', align: 'c' },
              { key: 'conversasRecebidas', label: 'Conversas', align: 'c' },
              { key: 'msgsInbound', label: 'Msgs inbound', align: 'c' },
              { key: 'conversasAtendidas', label: 'Atendidas', align: 'c' },
              { key: 'semResposta', label: 'Sem resp.', align: 'c' },
              { key: 'oportunidades', label: 'Oport. criadas', align: 'c' },
              { key: 'qualificados', label: 'Qualific.', align: 'c' },
              { key: 'fechados', label: 'Clientes fechados', align: 'c' },
              { key: 'negociosFechados', label: 'Negócios fechados', align: 'c' },
              { key: 'perdidos', label: 'Perdidos', align: 'c' },
              { key: 'taxaAtendimento', label: 'Tx atend.', align: 'c', fmt: (v) => fmtPct(v as number), csv: (r) => (r.taxaAtendimento as number).toFixed(1) },
              { key: 'taxaQualificacao', label: 'Tx qualif.', align: 'c', fmt: (v) => fmtPct(v as number), csv: (r) => (r.taxaQualificacao as number).toFixed(1) },
              { key: 'taxaConversao', label: 'Tx conv. (cli/pess)', align: 'c', fmt: (v) => fmtPct(v as number), csv: (r) => (r.taxaConversao as number).toFixed(1) },
              { key: 'conversaoOportunidades', label: 'Conv. oport.', align: 'c', fmt: (v) => fmtPct(v as number), csv: (r) => (r.conversaoOportunidades as number).toFixed(1) },
              { key: 'primeiraRespostaMin', label: '1ª resposta', align: 'c', fmt: (v) => fmtMin(v as number | null), csv: (r) => (r.primeiraRespostaMin == null ? '' : Math.round(r.primeiraRespostaMin as number).toString()) },
              { key: 'tempoAteFechamentoDias', label: 'Até fechar (d)', align: 'c', fmt: (v) => (v == null ? '—' : (v as number).toFixed(1)), csv: (r) => (r.tempoAteFechamentoDias == null ? '' : (r.tempoAteFechamentoDias as number).toFixed(1)) },
              { key: 'receitaPrevista', label: 'Rec. prevista', align: 'r', fmt: (v) => fmtBRL(v as number), csv: (r) => (r.receitaPrevista as number).toFixed(2) },
              { key: 'receitaRecebida', label: 'Rec. recebida', align: 'r', fmt: (v) => fmtBRL(v as number), csv: (r) => (r.receitaRecebida as number).toFixed(2) },
              { key: 'valoresAtraso', label: 'Em atraso', align: 'r', fmt: (v) => fmtBRL(v as number), csv: (r) => (r.valoresAtraso as number).toFixed(2) },
              { key: 'economia', label: 'Economia', align: 'r', fmt: (_v, r) => (r.economiaPreenchida ? fmtBRL(r.economia as number) : '—'), csv: (r) => (r.economiaPreenchida ? (r.economia as number).toFixed(2) : '') },
              { key: 'ticketMedio', label: 'Ticket médio', align: 'r', fmt: (v) => fmtBRL(v as number), csv: (r) => (r.ticketMedio as number).toFixed(2) },
            ] as Col<Record<string, unknown>>[]}
            rows={linhas as unknown as Record<string, unknown>[]} searchKeys={['nome', 'numero', 'tipo']}
            csvName={`conexoes_${periodoLabel.replace(/\D/g, '')}`} csvMeta={meta} />
        </>}
      </Estado>
    </>
  );
}

/* ============ Atendimento e equipe ============ */
function AbaAtendimento({ f, demo, seed, periodoLabel, orgNome, ehAtendente }: { f: RelFiltros; demo: boolean; seed: SeedRel | null; periodoLabel: string; orgNome: string; ehAtendente: boolean }) {
  const q = useAtendimento(f, !demo);
  const eq = useEquipe(f, !demo && !ehAtendente);
  const d = demo ? seed!.atendimento : q.data;
  const equipeRows = demo ? seed!.equipe : (eq.data ? montaLinhasEquipe(eq.data) : []);
  const HORAS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
  const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const meta = [`Organizacao: ${orgNome}`, `Periodo: ${periodoLabel}`, `Gerado: ${new Date().toLocaleString('pt-BR')}`];
  return (
    <Estado q={q} demo={demo}>
      {d && <>
        <div className="rl2-sec" style={{ marginTop: 0 }}>Atendimento <span>· por conversa/mensagem</span></div>
        <div className="rl2-kpis">
          <KpiCard label="Total de conversas" k={flat(d.totalConversas)} sentido="neutro" fmt={fmtInt} nota="No período" tooltip="Conversas criadas no período." />
          <KpiCard label="Conversas atendidas" k={flat(d.totalConversas - d.semResposta)} sentido="neutro" fmt={fmtInt} nota="No período" tooltip="Conversas com entrada que receberam resposta de operador." />
          <KpiCard label="Sem resposta" k={flat(d.semResposta)} sentido="neutro" fmt={fmtInt} nota="No período" tooltip="Conversas com entrada e nenhuma resposta de operador." />
          <KpiCard label="Taxa de atendimento" k={flat(d.taxaAtendimento)} sentido="neutro" fmt={fmtPct} nota="No período" tooltip="Conversas atendidas ÷ conversas com entrada." />
          <KpiCard label="Mensagens recebidas" k={flat(d.msgRecebidas)} sentido="neutro" fmt={fmtInt} nota="No período" tooltip="Mensagens de entrada no período." />
          <KpiCard label="Mensagens enviadas" k={flat(d.msgEnviadas)} sentido="neutro" fmt={fmtInt} nota="No período" tooltip="Saídas (exclui sistema/nota; inclui sincronizadas do aparelho)." />
          <KpiCard label="Tempo até 1ª resposta" k={d.primeiraRespostaMin == null ? null : flat(d.primeiraRespostaMin)} sentido="menor" fmt={(n) => fmtMin(n)} nota="Operador (autor identificado)" tooltip="Média entre a 1ª entrada e a 1ª resposta de operador. Saídas sincronizadas do aparelho (sem autor) não entram." />
        </div>
        <div className="rl2-g2">
          <Painel title="Volume por hora" sub="Mensagens (fuso de São Paulo)">
            {d.porHora.some((v) => v > 0) ? <BarrasV pts={d.porHora.map((v, i) => ({ label: HORAS[i], v }))} altura={96} mostraValor={false} /> : <Vazio titulo="Sem mensagens no período" />}
          </Painel>
          <Painel title="Volume por dia da semana" sub="Mensagens">
            {d.porDiaSemana.some((v) => v > 0) ? <BarrasV pts={d.porDiaSemana.map((v, i) => ({ label: DIAS[i], v }))} altura={96} /> : <Vazio titulo="Sem mensagens no período" />}
          </Painel>
        </div>
        <Painel title="Conversas por canal">
          {d.porCanal.length === 0 ? <Vazio titulo="Sem conversas no período" /> : <DonutV2 data={d.porCanal.map((c) => ({ label: canalNome(c.canal), v: c.total }))} />}
        </Painel>

        {!ehAtendente && <Estado q={eq} demo={demo}>{(demo || eq.data) && <>
          <div className="rl2-sec">Desempenho por atendente <span>· mesma fonte da Resumo</span></div>
          <div className="rl2-aviso">Clientes/Negócios fechados usam a regra oficial (ganho por fechado_em, com fallback de responsável). "Em andamento" é a carteira atual (por criação). "Não atribuído" aparece quando há fechamento sem responsável.</div>
          <RelTabela
            cols={[
              { key: 'nome', label: 'Atendente' }, { key: 'contatos', label: 'Contatos', align: 'c' },
              { key: 'oppAndamento', label: 'Em andamento', align: 'c' },
              { key: 'clientesFechados', label: 'Clientes fechados', align: 'c' }, { key: 'negociosFechados', label: 'Negócios fechados', align: 'c' },
              { key: 'taxaOperacional', label: 'Taxa operacional', align: 'c', fmt: (v) => fmtPct(v as number), csv: (r) => (r.taxaOperacional as number).toFixed(1) },
              { key: 'receitaRecebida', label: 'Receita recebida', align: 'r', fmt: (v) => fmtBRL(v as number), csv: (r) => (r.receitaRecebida as number).toFixed(2) },
            ] as Col<Record<string, unknown>>[]}
            rows={equipeRows as unknown as Record<string, unknown>[]} searchKeys={['nome']}
            csvName={`atendentes_${periodoLabel.replace(/\D/g, '')}`} csvMeta={[...meta, 'Clientes/Negocios fechados: ganho por fechado_em com fallback de responsavel']} />
        </>}</Estado>}
      </>}
    </Estado>
  );
}

/* ============ Financeiro ============ */
function AbaFinanceiro({ f, demo, seed }: { f: RelFiltros; demo: boolean; seed: SeedRel | null }) {
  const q = useFinanceiro(f, !demo);
  const resumo = useResumo(f);
  const d = demo ? seed!.financeiro : q.data;
  const dRes = demo ? seed!.resumo : resumo.data;
  const mes = (k: string) => k.slice(5) + '/' + k.slice(2, 4);
  return (
    <Estado q={q} demo={demo}>
      {d && <>
        <div className="rl2-kpis">
          <KpiCard label="Receita recebida" k={flat(d.recebida)} sentido="neutro" fmt={fmtBRL} nota="No período" tooltip="Σ valor pago de parcelas pagas (data_pagamento no período)." />
          <KpiCard label="Receita prevista" k={flat(d.prevista)} sentido="neutro" fmt={fmtBRL} nota="No período" tooltip="Σ parcelas não canceladas com vencimento no período." />
          <KpiCard label="Pendente" k={flat(d.pendente)} sentido="neutro" fmt={fmtBRL} nota="A vencer" tooltip="Parcelas previstas com vencimento ≥ hoje." />
          <KpiCard label="Vencido" k={flat(d.vencida)} sentido="menor" fmt={fmtBRL} nota="Posição atual" tooltip="Parcelas não pagas com vencimento anterior a hoje." />
          <KpiCard label="Inadimplência" k={flat(d.inadimplencia)} sentido="menor" fmt={fmtPct} nota="Sobre vencidas" tooltip="Parcelas vencidas não pagas ÷ parcelas vencidas." />
          <KpiCard label="Taxa de recebimento" k={flat(d.taxaRecebimento)} sentido="maior" fmt={fmtPct} nota="Sobre vencidas" tooltip="Parcelas vencidas pagas ÷ parcelas vencidas." />
          <KpiCard label="Cobranças ativas" k={flat(d.cobAtivas)} sentido="neutro" fmt={fmtInt} nota="Atual" tooltip="Cobranças não finalizadas e não canceladas." />
          <KpiCard label="Ticket médio mensal" k={flat(d.ticketMensal)} sentido="neutro" fmt={fmtBRL} nota="Cobranças ativas" tooltip="Média de valor mensal das cobranças ativas." />
        </div>
        <div className="rl2-g2">
          <Painel title="Previsão de recebimento" sub="Próximos 6 meses (previsto)">
            {d.previsao6m.some((m) => m.previsto > 0) ? <BarrasV pts={d.previsao6m.map((m) => ({ label: mes(m.mes), v: m.previsto }))} money altura={104} /> : <Vazio titulo="Sem previsão de recebimento" texto="Nenhuma parcela prevista nos próximos 6 meses." />}
          </Painel>
          <Painel title="Evolução de recebimentos" sub="Últimos 6 meses">
            {d.evolucao.some((m) => m.recebido > 0) ? <BarrasV pts={d.evolucao.map((m) => ({ label: mes(m.mes), v: m.recebido }))} money altura={104} destaqueUltima /> : <Vazio titulo="Nenhum recebimento registrado" texto="Sem parcelas pagas nos últimos 6 meses." />}
          </Painel>
        </div>
        <div className="rl2-g2">
          <Painel title="Parcelas por status">
            {(d.parPagas + d.parPrevistas + d.parNaoPagas + d.parCanceladas) === 0 ? <Vazio titulo="Sem parcelas" /> : <DonutV2 semantico data={[{ label: 'Pagas', v: d.parPagas, chave: 'ganho' }, { label: 'Previstas', v: d.parPrevistas, chave: 'em_andamento' }, { label: 'Não pagas', v: d.parNaoPagas, chave: 'perdido' }, { label: 'Canceladas', v: d.parCanceladas, chave: 'cancelado' }]} />}
          </Painel>
          <Painel title="Receita por serviço" sub="Valor mensal somado (ativas)">
            {d.porServico.length === 0 ? <Vazio titulo="Sem cobranças ativas" /> : d.porServico.length === 1 ? <div className="rl2-stat"><span className="v">{fmtBRL(d.porServico[0].total)}</span><span className="l">{d.porServico[0].nome}</span></div> : <BarrasV pts={d.porServico.slice(0, 8).map((s) => ({ label: s.nome.slice(0, 10), v: s.total }))} money altura={104} />}
          </Painel>
        </div>
        <Painel title="Economia gerada">
          {dRes?.economiaPreenchida && dRes.economiaGerada
            ? <div className="rl2-stat"><span className="v">{fmtBRL(dRes.economiaGerada.atual)}</span><span className="l">economia no período</span></div>
            : <Vazio titulo="Ainda não há dados de economia" texto="Não existem cobranças com os valores original e renegociado preenchidos. Quando esses dados forem registrados, este relatório mostrará a economia total, média e por cliente." />}
        </Painel>
      </>}
    </Estado>
  );
}

/* ============ Detalhamento ============ */
function AbaDetalhamento({ f, demo, seed, periodoLabel, orgNome, ehAtendente, onNav }: { f: RelFiltros; demo: boolean; seed: SeedRel | null; periodoLabel: string; orgNome: string; ehAtendente: boolean; onNav: (p: string) => void }) {
  const [sel, setSel] = useState<'carteira' | 'origem' | 'conexoes'>(ehAtendente ? 'conexoes' : 'carteira');
  const eq = useEquipe(f, !demo && !ehAtendente && sel === 'carteira');
  const or = useOrigens(f, !demo && sel === 'origem');
  const equipeRows = demo ? seed!.equipe : (eq.data ? montaLinhasEquipe(eq.data) : []);
  const dOr = demo ? seed!.origens : or.data;
  const meta = [`Organizacao: ${orgNome}`, `Periodo: ${periodoLabel}`, `Gerado: ${new Date().toLocaleString('pt-BR')}`];
  const opcoesSel: { id: 'carteira' | 'origem' | 'conexoes'; r: string }[] = [{ id: 'carteira', r: 'Por responsável' }, { id: 'conexoes', r: 'Por conexão' }, { id: 'origem', r: 'Por origem' }];
  return (
    <>
      <div className="rl2-toolbar">
        <Segmentado<'carteira' | 'origem' | 'conexoes'>
          rotulo="Detalhamento"
          valor={sel}
          aoMudar={setSel}
          opcoes={opcoesSel.filter((o) => !(o.id === 'carteira' && ehAtendente)).map((o) => ({ valor: o.id, rotulo: o.r }))}
        />
      </div>
      {sel === 'carteira' && !ehAtendente && <Estado q={eq} demo={demo}>{(demo || eq.data) && <RelTabela
        cols={[
          { key: 'nome', label: 'Atendente' }, { key: 'contatos', label: 'Contatos', align: 'c' },
          { key: 'oppAndamento', label: 'Em andamento', align: 'c' }, { key: 'oppPerdido', label: 'Perdidos', align: 'c' },
          { key: 'clientesFechados', label: 'Clientes fechados', align: 'c' }, { key: 'negociosFechados', label: 'Negócios fechados', align: 'c' },
          { key: 'receitaContratada', label: 'Receita contratada', align: 'r', fmt: (v) => fmtBRL(v as number), csv: (r) => (r.receitaContratada as number).toFixed(2) },
          { key: 'receitaRecebida', label: 'Receita recebida', align: 'r', fmt: (v) => fmtBRL(v as number), csv: (r) => (r.receitaRecebida as number).toFixed(2) },
        ] as Col<Record<string, unknown>>[]}
        rows={equipeRows as unknown as Record<string, unknown>[]} searchKeys={['nome']}
        csvName={`detalhe_atendentes_${periodoLabel.replace(/\D/g, '')}`} csvMeta={meta} />}</Estado>}
      {sel === 'conexoes' && <SecaoConexoes f={f} demo={demo} seed={seed} periodoLabel={periodoLabel} orgNome={orgNome} />}
      {sel === 'origem' && <Estado q={or} demo={demo}>{dOr && <RelTabela
        cols={[
          { key: 'origem', label: 'Origem' }, { key: 'oportunidades', label: 'Oportunidades', align: 'c' },
          { key: 'ganhas', label: 'Ganhas', align: 'c' }, { key: 'taxaConversao', label: 'Conversão', align: 'c', fmt: (v) => fmtPct(v as number), csv: (r) => (r.taxaConversao as number).toFixed(1) },
        ] as Col<Record<string, unknown>>[]}
        rows={dOr as unknown as Record<string, unknown>[]} searchKeys={['origem']}
        csvName={`detalhe_origens_${periodoLabel.replace(/\D/g, '')}`} csvMeta={meta} />}</Estado>}
      <div className="rl2-toolbar" style={{ marginTop: 4 }}>
        <BotaoSec mini onClick={() => onNav('/cobrancas')}>Abrir Cobranças (atraso e pagamentos)</BotaoSec>
        <BotaoSec mini onClick={() => onNav('/kanban')}>Abrir Kanban (oportunidades)</BotaoSec>
      </div>
      <CardVidro className="rl2-painel">
        <EstadoVazio
          titulo="Outros detalhamentos"
          descricao="Cobranças em atraso, oportunidades e conversas sem resposta abrem nos módulos relacionados (drill-down por registro). O detalhamento por id dentro do relatório será incremental."
        />
      </CardVidro>
    </>
  );
}
