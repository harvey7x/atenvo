import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/useToast';
import { useOrg } from '@/context/OrgContext';
import { useAuth } from '@/context/AuthContext';
import {
  REL_REAL, PRESETS, type Preset, type RelFiltros, FILTROS_PADRAO, resolvePeriodo, type Kpi,
  useRelatorioOpcoes, useResumo, useComercial, useAtendimento, useEquipe, useFinanceiro, useOrigens,
  useConexoes, type ConexaoLinha, montaLinhasEquipe,
  exportarCSV, spHoje,
} from '@/data/relatorios';
import './Relatorios.css';

/* ===== formatação PT-BR ===== */
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

/* ===== ícones ===== */
const I = (d: ReactNode) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">{d}</svg>;
const IcRefresh = () => I(<><path d="M21 12a9 9 0 1 1-3-6.7L21 8" /><path d="M21 3v5h-5" /></>);
const IcExport = () => I(<><path d="M12 3v12M8 11l4 4 4-4M5 21h14" /></>);
const IcSearch = () => I(<><circle cx="11" cy="11" r="7" /><path d="m20 20-3-3" /></>);
const IcCal = () => I(<><rect x="3" y="4.5" width="18" height="16" rx="2.4" /><path d="M3 9h18M8 2.5v4M16 2.5v4" /></>);
const IcFilter = () => I(<path d="M3 5h18l-7 8v5l-4 2v-7z" />);
const IcEmpty = () => I(<><circle cx="12" cy="12" r="9" /><path d="M8 12h8" /></>);

/* ===== KPI ===== */
type Sentido = 'maior' | 'menor' | 'neutro';
function Delta({ k, sentido }: { k: Kpi; sentido: Sentido }) {
  const { deltaAbs, deltaPct } = k;
  if (sentido === 'neutro' || deltaAbs === 0) return <span className="kpi-delta neu">— estável vs anterior</span>;
  const bom = (sentido === 'maior' && deltaAbs > 0) || (sentido === 'menor' && deltaAbs < 0);
  const seta = deltaAbs > 0 ? '▲' : '▼';
  const txt = deltaPct == null ? '—' : `${deltaPct > 0 ? '+' : ''}${deltaPct.toFixed(1)}%`;
  return <span className={'kpi-delta ' + (bom ? 'pos' : 'neg')}>{seta} {txt} vs anterior</span>;
}
function KpiCard({ label, k, sentido, fmt, tooltip, nota, hero }: { label: string; k: Kpi | null; sentido: Sentido; fmt: (n: number) => string; tooltip: string; nota?: string; hero?: boolean }) {
  if (!k) return (
    <div className="kpi"><div className="kpi-body"><div className="kpi-head"><div className="kpi-label">{label}</div><span className="kpi-info" title={tooltip}>i</span></div><div className="kpi-value" style={{ fontSize: 15, color: 'var(--muted)' }}>Indisponível</div><div className="kpi-prev">{tooltip}</div></div></div>
  );
  return (
    <div className={'kpi' + (hero ? ' kpi-hero' : '')}>
      <div className="kpi-body">
        <div className="kpi-head"><div className="kpi-label">{label}</div><span className="kpi-info" title={tooltip}>i</span></div>
        <div className="kpi-value">{fmt(k.atual)}</div>
        {nota ? <span className="kpi-delta neu">{nota}</span> : <><Delta k={k} sentido={sentido} /><div className="kpi-prev">Anterior: {fmt(k.anterior)}</div></>}
      </div>
    </div>
  );
}
const flat = (v: number): Kpi => ({ atual: v, anterior: v, deltaAbs: 0, deltaPct: 0 });

/* ===== estados vazios compactos (zero ≠ indisponível) ===== */
function Vazio({ titulo, texto }: { titulo: string; texto?: string }) {
  return <div className="vazio"><IcEmpty /><div><div className="vt">{titulo}</div>{texto && <div className="vd">{texto}</div>}</div></div>;
}

/* ===== gráficos SVG ===== */
function axMoney(gv: number, max: number, money?: boolean) { if (!money) return fmtInt(gv); return max >= 1000 ? fmtInt(gv / 1000) + 'k' : fmtInt(gv); }
function LineChart({ pts, money, compact }: { pts: { label: string; v: number }[]; money?: boolean; compact?: boolean }) {
  const W = 720, H = compact ? 150 : 210, pl0 = 44, pr = 14, pt = 12, pb = 24, n = pts.length;
  const maxV = Math.max(0, ...pts.map((p) => p.v)), max = Math.max(1, maxV) * 1.18;
  const X = (i: number) => pl0 + (W - pl0 - pr) * (n > 1 ? i / (n - 1) : 0.5);
  const Y = (v: number) => H - pb - (H - pt - pb) * (v / max);
  const line = pts.map((p, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(p.v).toFixed(1)).join(' ');
  const area = `${line} L${X(n - 1).toFixed(1)} ${H - pb} L${X(0).toFixed(1)} ${H - pb} Z`;
  const grid = [0, 1, 2, 3, 4].map((g) => { const gy = pt + (H - pt - pb) * g / 4; const gv = max - max * g / 4; return <g key={g}><line className="gridln" x1={pl0} y1={gy} x2={W - pr} y2={gy} /><text className="axval" x={pl0 - 7} y={gy + 3} textAnchor="end">{axMoney(gv, maxV, money)}</text></g>; });
  const step = Math.max(1, Math.ceil(n / 8));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" preserveAspectRatio="xMidYMid meet">
      <defs><linearGradient id="rg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--accent)" stopOpacity="0.24" /><stop offset="1" stopColor="var(--accent)" stopOpacity="0" /></linearGradient></defs>
      {grid}
      {pts.map((p, i) => (i % step === 0 ? <text key={i} className="axlbl" x={X(i)} y={H - 7} textAnchor="middle">{p.label}</text> : null))}
      <path d={area} fill="url(#rg)" /><path d={line} fill="none" stroke="var(--accent)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function Bars({ data, money, compact }: { data: { label: string; v: number }[]; money?: boolean; compact?: boolean }) {
  const W = 620, H = compact ? 150 : 210, pl0 = 44, pr = 12, pt = 12, pb = 26, n = data.length, bw = Math.min(46, (W - pl0 - pr) / Math.max(1, n) * 0.6);
  const maxV = Math.max(0, ...data.map((d) => d.v)), max = Math.max(1, maxV) * 1.15;
  const grid = [0, 1, 2, 3, 4].map((g) => { const gy = pt + (H - pt - pb) * g / 4; const gv = max - max * g / 4; return <g key={g}><line className="gridln" x1={pl0} y1={gy} x2={W - pr} y2={gy} /><text className="axval" x={pl0 - 7} y={gy + 3} textAnchor="end">{axMoney(gv, maxV, money)}</text></g>; });
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" preserveAspectRatio="xMidYMid meet">
      {grid}
      {data.map((d, i) => { const x = pl0 + (W - pl0 - pr) * ((i + 0.5) / n) - bw / 2; const bh = (H - pt - pb) * (d.v / max); return <g key={i}><rect x={x} y={H - pb - bh} width={bw} height={Math.max(2, bh)} rx="4" fill={i === n - 1 ? 'var(--accent)' : 'var(--bar)'} /><text className="axlbl" x={x + bw / 2} y={H - 7} textAnchor="middle">{d.label}</text></g>; })}
    </svg>
  );
}
function Funnel({ stages }: { stages: { nome: string; total: number }[] }) {
  const max = Math.max(1, ...stages.map((s) => s.total));
  return <div className="funnel">{stages.map((s) => <div className="funnel-row" key={s.nome}><span className="funnel-name" title={s.nome}>{s.nome}</span><div className="funnel-bar"><i style={{ width: `${(s.total / max) * 100}%` }} /></div><span className="funnel-val">{fmtInt(s.total)}</span></div>)}</div>;
}
const DONUT_PAL = ['#19C37D', '#2563EB', '#7a5bb0', '#c2772a', '#d6453f', '#2f8f9d', '#b0566f'];
function Donut({ data }: { data: { label: string; v: number }[] }) {
  const total = data.reduce((s, d) => s + d.v, 0);
  const size = 160, r = size / 2 - 11, C = 2 * Math.PI * r, cx = size / 2, cy = size / 2; let off = 0;
  return (
    <div className="donut-wrap">
      <div className="donut"><svg viewBox={`0 0 ${size} ${size}`} width="160" height="160">{data.map((d, i) => { const len = total ? d.v / total * C : 0; const seg = <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={DONUT_PAL[i % DONUT_PAL.length]} strokeWidth="17" strokeDasharray={`${len.toFixed(1)} ${(C - len).toFixed(1)}`} strokeDashoffset={(-off).toFixed(1)} />; off += len; return seg; })}</svg><div className="center"><div className="big">{fmtInt(total)}</div><div className="cap">total</div></div></div>
      <div className="legend">{data.map((d, i) => <div className="li" key={i}><span className="sw" style={{ background: DONUT_PAL[i % DONUT_PAL.length] }} /><span className="ln">{d.label}</span><span className="lv">{fmtInt(d.v)}</span><span className="lp">{total ? ((d.v / total) * 100).toFixed(0) : 0}%</span></div>)}</div>
    </div>
  );
}
function MiniBars({ vals, labels }: { vals: number[]; labels: string[] }) {
  const max = Math.max(1, ...vals);
  return <><div className="minibars">{vals.map((v, i) => <div className="mb" key={i} title={`${labels[i]}: ${fmtInt(v)}`} style={{ height: `${(v / max) * 100}%` }} />)}</div><div className="minibars-x">{labels.map((l, i) => <span key={i}>{l}</span>)}</div></>;
}

/* ===== painel/estado ===== */
function Panel({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return <section className="panel"><div className="ch-head"><div><h2>{title}</h2>{sub && <div className="sub">{sub}</div>}</div></div><div className="ch-body">{children}</div></section>;
}
function Estado({ q, children }: { q: { isLoading: boolean; isError: boolean; error?: unknown }; children: ReactNode }) {
  if (q.isLoading) return <div className="rloading">Carregando dados…</div>;
  if (q.isError) return <div className="rerror">Erro ao carregar: {(q.error as Error)?.message || 'falha'}</div>;
  return <>{children}</>;
}

/* ===== tabela detalhada genérica ===== */
interface Col<T> { key: keyof T & string; label: string; align?: 'l' | 'c' | 'r'; fmt?: (v: unknown, row: T) => ReactNode; csv?: (row: T) => string | number; }
function DataTable<T extends Record<string, unknown>>({ cols, rows, searchKeys, csvName, csvMeta }: { cols: Col<T>[]; rows: T[]; searchKeys: (keyof T & string)[]; csvName: string; csvMeta: string[] }) {
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<{ k: string; dir: 1 | -1 } | null>(null);
  const [page, setPage] = useState(1);
  const [per, setPer] = useState(10);
  const termo = q.trim().toLowerCase();
  const filtradas = useMemo(() => {
    let r = rows;
    if (termo) r = r.filter((row) => searchKeys.some((k) => String(row[k] ?? '').toLowerCase().includes(termo)));
    if (sort) { const { k, dir } = sort; r = [...r].sort((a, b) => { const av = a[k], bv = b[k]; if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir; return String(av ?? '').localeCompare(String(bv ?? '')) * dir; }); }
    return r;
  }, [rows, termo, sort, searchKeys]);
  const totalPag = Math.max(1, Math.ceil(filtradas.length / per));
  const pg = Math.min(page, totalPag);
  const visiveis = filtradas.slice((pg - 1) * per, pg * per);
  function exportar() { exportarCSV(csvName, cols.map((c) => c.label), filtradas.map((row) => cols.map((c) => (c.csv ? c.csv(row) : String(row[c.key] ?? '')))), csvMeta); }
  return (
    <section className="panel">
      <div className="tbl-tools">
        <div className="rsearch"><IcSearch /><input placeholder="Buscar…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></div>
        <span className="sp" />
        <button className="btn-ghost" onClick={exportar}><IcExport />Exportar CSV</button>
      </div>
      <div className="flux-scroll">
        <table className="rep-table" style={{ tableLayout: 'auto', minWidth: 640 }}>
          <thead><tr>{cols.map((c) => <th key={c.key} className={c.align === 'c' || c.align === 'r' ? 'rc-center' : ''} onClick={() => setSort((s) => s?.k === c.key ? { k: c.key, dir: (s.dir === 1 ? -1 : 1) } : { k: c.key, dir: 1 })}>{c.label}<span className="sortarr">{sort?.k === c.key ? (sort.dir === 1 ? '▲' : '▼') : '↕'}</span></th>)}</tr></thead>
          <tbody>
            {visiveis.length === 0 ? <tr><td colSpan={cols.length} className="fx-empty">Nenhum registro.</td></tr> : visiveis.map((row, i) => (
              <tr key={i}>{cols.map((c) => <td key={c.key} className={c.align === 'c' ? 'rc-center' : ''}>{c.fmt ? c.fmt(row[c.key], row) : String(row[c.key] ?? '—')}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="tc-foot">
        <span className="ft">{filtradas.length} registro{filtradas.length === 1 ? '' : 's'}</span>
        <nav className="pager">
          <button className="pg" disabled={pg <= 1} onClick={() => setPage(pg - 1)}>‹</button>
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>{pg} / {totalPag}</span>
          <button className="pg" disabled={pg >= totalPag} onClick={() => setPage(pg + 1)}>›</button>
        </nav>
        <div className="perpage"><label>Por página:</label><select value={per} onChange={(e) => { setPer(Number(e.target.value)); setPage(1); }}><option value={10}>10</option><option value={25}>25</option><option value={50}>50</option></select></div>
      </div>
    </section>
  );
}

/* ===== card compacto de gargalo (operacional) ===== */
function GargCard({ titulo, valor, sub, alerta }: { titulo: string; valor: string; sub: string; alerta?: boolean }) {
  return (
    <div className={'garg' + (alerta ? ' garg-al' : '')}>
      <div className="garg-t">{titulo}</div>
      <div className="garg-v">{valor}</div>
      <div className="garg-s">{sub}</div>
    </div>
  );
}

/* ===== abas ===== */
const ABAS = [
  { id: 'resumo', label: 'Resumo' }, { id: 'vendas', label: 'Vendas' }, { id: 'atendimento', label: 'Atendimento e equipe' },
  { id: 'financeiro', label: 'Financeiro' }, { id: 'detalhamento', label: 'Detalhamento' },
] as const;
type Aba = typeof ABAS[number]['id'];

export function Relatorios() {
  const { toast } = useToast();
  const { currentOrg } = useOrg();
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const ehAtendente = currentOrg.role === 'atendente';
  const [aba, setAba] = useState<Aba>('resumo');
  const [f, setF] = useState<RelFiltros>(() => (ehAtendente && user ? { ...FILTROS_PADRAO, responsavel: user.id } : FILTROS_PADRAO));
  const [custIni, setCustIni] = useState(spHoje());
  const [custFim, setCustFim] = useState(spHoje());
  const [mais, setMais] = useState(false);

  const periodo = resolvePeriodo(f.preset, f.ini, f.fim);
  const opcoes = useRelatorioOpcoes();
  const setFiltro = (k: keyof RelFiltros, v: string) => setF((s) => ({ ...s, [k]: v || undefined }));
  function setPreset(p: Preset) { if (p === 'custom') setF((s) => ({ ...s, preset: p, ini: custIni, fim: custFim })); else setF((s) => ({ ...s, preset: p, ini: undefined, fim: undefined })); }
  function aplicarCustom(ini: string, fim: string) { setCustIni(ini); setCustFim(fim); setF((s) => ({ ...s, preset: 'custom', ini, fim })); }
  function atualizar() { qc.invalidateQueries({ predicate: (qq) => String(qq.queryKey[0]).startsWith('rel-') }); toast('Dados atualizados'); }
  function limpar() { setF({ ...FILTROS_PADRAO, ...(ehAtendente && user ? { responsavel: user.id } : {}) }); }

  const chips: { k: keyof RelFiltros; lbl: string; val: string }[] = [];
  if (f.canal) chips.push({ k: 'canal', lbl: 'Canal', val: canalNome(f.canal) });
  if (f.origem) chips.push({ k: 'origem', lbl: 'Origem', val: f.origem });
  if (f.responsavel && !ehAtendente) chips.push({ k: 'responsavel', lbl: 'Responsável', val: opcoes.data?.responsaveis.find((r) => r.id === f.responsavel)?.nome || '—' });
  if (f.coluna) chips.push({ k: 'coluna', lbl: 'Etapa', val: opcoes.data?.colunas.find((c) => c.id === f.coluna)?.nome || '—' });
  if (f.status) chips.push({ k: 'status', lbl: 'Status', val: STATUS_OPP.find((s) => s.id === f.status)?.r || f.status });
  if (f.conexao) chips.push({ k: 'conexao', lbl: 'Conexão', val: opcoes.data?.conexoes.find((c) => c.id === f.conexao)?.nome || '—' });

  if (!REL_REAL) return <div className="relatorios-page"><div className="content"><Vazio titulo="Relatórios indisponíveis" texto="Disponível com o backend configurado." /></div></div>;
  const abasVisiveis = ABAS;

  return (
    <div className="relatorios-page">
      <div className="content">
        {/* filtros — linha principal */}
        <div className="toolbar">
          <div className="seg">{PRESETS.map((b) => <button key={b.id} className={f.preset === b.id ? 'on' : ''} onClick={() => setPreset(b.id)}>{b.label}</button>)}</div>
          {f.preset === 'custom'
            ? <span className="custom-dates"><input type="date" value={custIni} max={custFim} onChange={(e) => aplicarCustom(e.target.value, custFim)} /><span style={{ color: 'var(--muted)' }}>até</span><input type="date" value={custFim} min={custIni} max={spHoje()} onChange={(e) => aplicarCustom(custIni, e.target.value)} /></span>
            : <span className="daterange"><IcCal /><span>{periodo.label}</span></span>}
          <select className="flt" aria-label="Canal" value={f.canal || ''} onChange={(e) => setFiltro('canal', e.target.value)}><option value="">Canal: todos</option>{CANAL_OPCOES.map((c) => <option key={c.id} value={c.id}>{c.r}</option>)}</select>
          {!ehAtendente && <select className="flt" aria-label="Responsável" value={f.responsavel || ''} onChange={(e) => setFiltro('responsavel', e.target.value)}><option value="">Responsável: todos</option>{(opcoes.data?.responsaveis || []).map((r) => <option key={r.id} value={r.id}>{r.nome}</option>)}</select>}
          <button className={'btn-ghost' + (mais ? '' : '')} onClick={() => setMais((m) => !m)}><IcFilter />Mais filtros</button>
          <span className="tb-spacer" />
          <button className="btn-ghost" onClick={atualizar}><IcRefresh />Atualizar</button>
        </div>
        {mais && (
          <div className="toolbar" style={{ marginTop: -8 }}>
            <select className="flt" aria-label="Origem" value={f.origem || ''} onChange={(e) => setFiltro('origem', e.target.value)}><option value="">Origem: todas</option>{(opcoes.data?.origens || []).map((o) => <option key={o} value={o}>{o}</option>)}</select>
            <select className="flt" aria-label="Etapa" value={f.coluna || ''} onChange={(e) => setFiltro('coluna', e.target.value)}><option value="">Etapa: todas</option>{(opcoes.data?.colunas || []).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select>
            <select className="flt" aria-label="Status" value={f.status || ''} onChange={(e) => setFiltro('status', e.target.value)}><option value="">Status: todos</option>{STATUS_OPP.map((s) => <option key={s.id} value={s.id}>{s.r}</option>)}</select>
            <select className="flt" aria-label="Conexão de WhatsApp" value={f.conexao || ''} onChange={(e) => setFiltro('conexao', e.target.value)}><option value="">Conexão: todas</option>{(opcoes.data?.conexoes || []).map((c) => <option key={c.id} value={c.id}>{c.nome}{c.numero ? ' — ' + c.numero : ''}</option>)}</select>
          </div>
        )}

        <div className={'filterbar' + (chips.length ? '' : ' empty')}>
          {chips.length > 0 && <>
            <span className="flbl">Filtros ativos:</span>
            {chips.map((c) => <span className="fchip" key={c.k}><span><b>{c.lbl}:</b>{c.val}</span><button aria-label="Remover" onClick={() => setFiltro(c.k, '')}>✕</button></span>)}
            <button className="fclear" onClick={limpar}>Limpar tudo</button>
          </>}
        </div>

        <div className="rtabs">{abasVisiveis.map((a) => <button key={a.id} className={'rtab' + (aba === a.id ? ' on' : '')} onClick={() => setAba(a.id)}>{a.label}</button>)}</div>

        <div style={{ fontSize: 12.5, color: 'var(--muted)', margin: '-6px 0 14px' }}>
          Período: <b style={{ color: 'var(--ink-2)' }}>{periodo.label}</b> · comparado a <b style={{ color: 'var(--ink-2)' }}>{periodo.prevLabel}</b> · {currentOrg.name}
        </div>

        {aba === 'resumo' && <AbaResumo f={f} periodoLabel={periodo.label} orgNome={currentOrg.name} ehAtendente={ehAtendente} />}
        {aba === 'vendas' && <AbaVendas f={f} periodoLabel={periodo.label} orgNome={currentOrg.name} />}
        {aba === 'atendimento' && <AbaAtendimento f={f} periodoLabel={periodo.label} orgNome={currentOrg.name} ehAtendente={ehAtendente} />}
        {aba === 'financeiro' && <AbaFinanceiro f={f} />}
        {aba === 'detalhamento' && <AbaDetalhamento f={f} periodoLabel={periodo.label} orgNome={currentOrg.name} ehAtendente={ehAtendente} onNav={navigate} />}
      </div>
    </div>
  );
}

/* ============ Resumo (visão executiva) ============ */
function AbaResumo({ f, periodoLabel, orgNome, ehAtendente }: { f: RelFiltros; periodoLabel: string; orgNome: string; ehAtendente: boolean }) {
  const q = useResumo(f);
  const at = useAtendimento(f, true);
  const fin = useFinanceiro(f, true);
  const com = useComercial(f, true);
  const cx = useConexoes(f, true);
  const eq = useEquipe(f, !ehAtendente);
  const meta = [`Organizacao: ${orgNome}`, `Periodo: ${periodoLabel}`, `Gerado: ${new Date().toLocaleString('pt-BR')}`];

  const pessoasTotal = (cx.data || []).reduce((s, l) => s + l.pessoasQueChamaram, 0);
  // tabela por conexão: ordena Clientes fechados → Pessoas que chamaram → Taxa de conversão
  const conexRows = (cx.data || []).filter((l) => l.chave !== 'sem')
    .slice().sort((a, b) => b.fechados - a.fechados || b.pessoasQueChamaram - a.pessoasQueChamaram || b.taxaConversao - a.taxaConversao);
  // tabela por atendente: FONTE ÚNICA (mesma dos demais abas)
  const equipeRows = eq.data ? montaLinhasEquipe(eq.data) : [];

  const semRespostaTotal = at.data?.semResposta ?? 0;
  const paradas7d = com.data?.paradasMais7d ?? 0;
  const canalBaixa = conexRows.filter((l) => l.oportunidades > 0).slice().sort((a, b) => a.taxaConversao - b.taxaConversao)[0];
  const atendenteSobre = equipeRows.slice().sort((a, b) => b.contatos - a.contatos)[0];

  return (
    <Estado q={q}>
      {q.data && <>
        {/* Bloco 1 — cards executivos */}
        <div className="kpis">
          <KpiCard hero label="Pessoas que chamaram" k={cx.data ? flat(pessoasTotal) : null} sentido="maior" fmt={fmtInt} nota="No período" tooltip="Pessoas únicas com ≥1 mensagem recebida (inbound) no período, deduplicadas por telefone (ignora 9º dígito/DDI). Não inclui contatos que só receberam mensagem nossa (outbound)." />
          <KpiCard hero label="Clientes fechados" k={q.data.oportunidadesFechadas} sentido="maior" fmt={fmtInt} tooltip="Pessoas únicas (deduplicadas por telefone: ignora 9º dígito/DDI) com oportunidade ganha FECHADA no período (por fechado_em). Não conta a mesma pessoa duas vezes, mesmo que ela tenha contatos duplicados." />
          <KpiCard hero label="Taxa de conversão" k={cx.data ? flat(pessoasTotal > 0 ? (q.data.oportunidadesFechadas.atual / pessoasTotal) * 100 : 0) : null} sentido="maior" fmt={fmtPct} nota="Clientes ÷ pessoas" tooltip="Clientes fechados ÷ pessoas que chamaram no período." />
          <KpiCard hero label="Receita recebida" k={q.data.receitaRecebida} sentido="maior" fmt={fmtBRL} tooltip="Σ valor pago das parcelas pagas no período." />
          <KpiCard hero label="Valores em atraso" k={fin.data ? flat(fin.data.vencida) : flat(0)} sentido="menor" fmt={fmtBRL} nota="Posição atual" tooltip="Parcelas não pagas com vencimento anterior a hoje (posição atual, não comparada)." />
          <KpiCard hero label="Conversas sem resposta" k={at.data ? flat(at.data.semResposta) : null} sentido="menor" fmt={fmtInt} nota="No período" tooltip="Conversas com entrada e nenhuma resposta de operador no período." />
        </div>

        {/* Bloco 2 — desempenho por número/conexão (protagonista) */}
        <div className="sech">Desempenho por número / conexão <span className="sech-sub">· por conexão de aquisição</span></div>
        <Estado q={cx}>{conexRows.length === 0 ? <Vazio titulo="Sem conexões com resultado no período" /> : <DataTable
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

        {/* Bloco 3 — desempenho por atendente */}
        {!ehAtendente && <>
          <div className="sech" style={{ marginTop: 18 }}>Desempenho por atendente <span className="sech-sub">· por responsável</span></div>
          <Estado q={eq}>{equipeRows.length === 0 ? <Vazio titulo="Sem atendentes com dados no período" /> : <DataTable
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

        {/* Bloco 4 — gargalos operacionais */}
        <div className="sech" style={{ marginTop: 18 }}>Gargalos e alertas <span className="sech-sub">· operacional</span></div>
        <div className="garg-grid">
          <GargCard titulo="Conversas sem resposta" valor={fmtInt(semRespostaTotal)} sub="Precisam de retorno" alerta={semRespostaTotal > 0} />
          <GargCard titulo="Oportunidades paradas" valor={fmtInt(paradas7d)} sub="Há mais de 7 dias sem atualização" alerta={paradas7d > 0} />
          <GargCard titulo="Canal com baixa conversão" valor={canalBaixa ? `${conexRotulo(canalBaixa)}` : '—'} sub={canalBaixa ? `Conversão de ${fmtPct(canalBaixa.taxaConversao)}` : 'Sem dados'} alerta={!!canalBaixa && canalBaixa.taxaConversao < 5} />
          <GargCard titulo="Atendente sobrecarregado" valor={atendenteSobre ? atendenteSobre.nome : '—'} sub={atendenteSobre ? `${fmtInt(atendenteSobre.contatos)} contatos na carteira` : 'Sem dados'} />
        </div>
      </>}
    </Estado>
  );
}

/* ============ Vendas (comercial + origens) ============ */
function AbaVendas({ f, periodoLabel, orgNome }: { f: RelFiltros; periodoLabel: string; orgNome: string }) {
  const q = useComercial(f, true);
  const or = useOrigens(f, true);
  const meta = [`Organizacao: ${orgNome}`, `Periodo: ${periodoLabel}`, `Gerado: ${new Date().toLocaleString('pt-BR')}`];
  return (
    <Estado q={q}>
      {q.data && <>
        <div className="kpis">
          <KpiCard label="Novas oportunidades" k={flat(q.data.totalOpp)} sentido="neutro" fmt={fmtInt} nota="No período" tooltip="Oportunidades criadas no período." />
          <KpiCard label="Negócios fechados" k={flat(Math.round((q.data.taxaConversao / 100) * q.data.totalOpp))} sentido="neutro" fmt={fmtInt} nota="No período" tooltip="Oportunidades ganhas no período (por criação). Clientes distintos ficam no Resumo." />
          <KpiCard label="Clientes perdidos" k={flat(q.data.perdidos)} sentido="neutro" fmt={fmtInt} nota="No período" tooltip="Oportunidades com status perdido." />
          <KpiCard label="Conversão" k={flat(q.data.taxaConversao)} sentido="neutro" fmt={fmtPct} nota="No período" tooltip="Ganhas ÷ total de oportunidades criadas." />
        </div>
        <div className="grid-2">
          <Panel title="Funil comercial" sub="Etapas reais da organização">
            {q.data.funil.length === 0 || q.data.totalOpp === 0 ? <Vazio titulo="Sem oportunidades no período" texto="Quando houver oportunidades, o funil por etapa aparece aqui." /> : <Funnel stages={q.data.funil.map((c) => ({ nome: c.nome, total: c.total }))} />}
          </Panel>
          <Panel title="Situação das oportunidades" sub="Distribuição por status">
            {q.data.porStatus.length === 0 ? <Vazio titulo="Sem oportunidades no período" />
              : q.data.porStatus.length === 1 ? <div className="compact-stat"><span className="cs-v">{fmtInt(q.data.porStatus[0].total)}</span><span className="cs-l">{q.data.porStatus[0].status}</span></div>
              : <Donut data={q.data.porStatus.map((s) => ({ label: s.status, v: s.total }))} />}
          </Panel>
        </div>
        <Panel title="Novas oportunidades por dia" sub="Oportunidades criadas">
          {q.data.leadsSerie.length < 2 ? <Vazio titulo="Dados insuficientes para a curva" texto={`No período: ${pl(q.data.totalOpp, 'oportunidade criada', 'oportunidades criadas')}.`} /> : <LineChart pts={q.data.leadsSerie} compact />}
        </Panel>

        <div className="sech" style={{ marginTop: 6 }}>Oportunidades por origem</div>
        <Estado q={or}>{or.data && (or.data.length === 0
          ? <Vazio titulo="Sem origens no período" texto="As origens aparecem conforme as oportunidades são criadas." />
          : <>
            {or.data.length > 1 && <Panel title="Oportunidades por origem"><Bars data={or.data.slice(0, 10).map((o) => ({ label: o.origem.slice(0, 12), v: o.oportunidades }))} compact /></Panel>}
            <DataTable
              cols={[
                { key: 'origem', label: 'Origem' }, { key: 'oportunidades', label: 'Oportunidades', align: 'c' },
                { key: 'ganhas', label: 'Ganhas', align: 'c' }, { key: 'taxaConversao', label: 'Conversão', align: 'c', fmt: (v) => fmtPct(v as number), csv: (r) => (r.taxaConversao as number).toFixed(1) },
              ] as Col<Record<string, unknown>>[]}
              rows={or.data as unknown as Record<string, unknown>[]} searchKeys={['origem']}
              csvName={`vendas_origens_${periodoLabel.replace(/\D/g, '')}`} csvMeta={meta} />
          </>)}</Estado>
      </>}
    </Estado>
  );
}

/* ============ Desempenho por conexão de WhatsApp ============ */
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
function SecaoConexoes({ f, periodoLabel, orgNome }: { f: RelFiltros; periodoLabel: string; orgNome: string }) {
  const q = useConexoes(f, true);
  const linhas = q.data || [];
  const reais = linhas.filter((l) => l.chave !== 'sem');
  const top = (campo: keyof ConexaoLinha) => reais.slice().sort((a, b) => (b[campo] as number) - (a[campo] as number))[0];
  const menorTempo = reais.filter((l) => l.primeiraRespostaMin != null).sort((a, b) => (a.primeiraRespostaMin as number) - (b.primeiraRespostaMin as number))[0];
  const meta = [`Organizacao: ${orgNome}`, `Periodo: ${periodoLabel}`, `Gerado: ${new Date().toLocaleString('pt-BR')}`, 'Atribuicao: conexao de aquisicao (contatos.canal_origem_id + snapshot historico)'];
  const HCard = ({ titulo, l, valor }: { titulo: string; l?: ConexaoLinha; valor?: string }) => (
    <Panel title={titulo}>{l ? <div className="compact-stat" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}><span className="cs-v" style={{ fontSize: 16 }}>{conexRotulo(l)}</span><span className="cs-l">{valor}</span></div> : <div className="fx-empty">Sem dados.</div>}</Panel>
  );
  return (
    <>
      <div className="sech" style={{ marginTop: 6 }}>Desempenho por conexão de WhatsApp <span style={{ fontWeight: 400, color: 'var(--muted)', fontSize: 12 }}>· por conexão de aquisição (origem preservada)</span></div>
      <Estado q={q}>
        {reais.length === 0 ? <Vazio titulo="Sem conexões com resultado no período" texto="As pessoas são atribuídas à conexão de aquisição do contato; conexões removidas mantêm o histórico via snapshot." /> : <>
          <div className="grid-3">
            <HCard titulo="Mais pessoas que chamaram" l={top('pessoasQueChamaram')} valor={top('pessoasQueChamaram') ? `${fmtInt(top('pessoasQueChamaram').pessoasQueChamaram)} pessoas` : ''} />
            <HCard titulo="Mais clientes fechados" l={top('fechados')} valor={top('fechados') ? `${fmtInt(top('fechados').fechados)} fechados` : ''} />
            <HCard titulo="Melhor taxa de conversão" l={top('taxaConversao')} valor={top('taxaConversao') ? fmtPct(top('taxaConversao').taxaConversao) : ''} />
            <HCard titulo="Melhor taxa de qualificação" l={top('taxaQualificacao')} valor={top('taxaQualificacao') ? fmtPct(top('taxaQualificacao').taxaQualificacao) : ''} />
            <HCard titulo="Maior receita recebida" l={top('receitaRecebida')} valor={top('receitaRecebida') ? fmtBRL(top('receitaRecebida').receitaRecebida) : ''} />
            <HCard titulo="Menor tempo de 1ª resposta" l={menorTempo} valor={menorTempo ? fmtMin(menorTempo.primeiraRespostaMin) : ''} />
          </div>
          {frasesConexoes(linhas).length > 0 && <Panel title="Comparação entre conexões"><ul className="narr">{frasesConexoes(linhas).map((s, i) => <li key={i}>{s}</li>)}</ul></Panel>}
          <DataTable
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
function AbaAtendimento({ f, periodoLabel, orgNome, ehAtendente }: { f: RelFiltros; periodoLabel: string; orgNome: string; ehAtendente: boolean }) {
  const q = useAtendimento(f, true);
  const eq = useEquipe(f, !ehAtendente);
  const HORAS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
  const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const meta = [`Organizacao: ${orgNome}`, `Periodo: ${periodoLabel}`, `Gerado: ${new Date().toLocaleString('pt-BR')}`];
  return (
    <Estado q={q}>
      {q.data && <>
        <div className="sech">Atendimento <span style={{ fontWeight: 400, color: 'var(--muted)', fontSize: 12 }}>· por conversa/mensagem</span></div>
        <div className="kpis">
          <KpiCard label="Total de conversas" k={flat(q.data.totalConversas)} sentido="neutro" fmt={fmtInt} nota="No período" tooltip="Conversas criadas no período." />
          <KpiCard label="Conversas atendidas" k={flat(q.data.totalConversas - q.data.semResposta)} sentido="neutro" fmt={fmtInt} nota="No período" tooltip="Conversas com entrada que receberam resposta de operador." />
          <KpiCard label="Sem resposta" k={flat(q.data.semResposta)} sentido="neutro" fmt={fmtInt} nota="No período" tooltip="Conversas com entrada e nenhuma resposta de operador." />
          <KpiCard label="Taxa de atendimento" k={flat(q.data.taxaAtendimento)} sentido="neutro" fmt={fmtPct} nota="No período" tooltip="Conversas atendidas ÷ conversas com entrada." />
          <KpiCard label="Mensagens recebidas" k={flat(q.data.msgRecebidas)} sentido="neutro" fmt={fmtInt} nota="No período" tooltip="Mensagens de entrada no período." />
          <KpiCard label="Mensagens enviadas" k={flat(q.data.msgEnviadas)} sentido="neutro" fmt={fmtInt} nota="No período" tooltip="Saídas (exclui sistema/nota; inclui sincronizadas do aparelho)." />
          <KpiCard label="Tempo até 1ª resposta" k={q.data.primeiraRespostaMin == null ? null : flat(q.data.primeiraRespostaMin)} sentido="menor" fmt={(n) => fmtMin(n)} nota="Operador (autor identificado)" tooltip="Média entre a 1ª entrada e a 1ª resposta de operador. Saídas sincronizadas do aparelho (sem autor) não entram." />
        </div>
        <div className="grid-2">
          <Panel title="Volume por hora" sub="Mensagens (fuso de São Paulo)">{q.data.porHora.some((v) => v > 0) ? <MiniBars vals={q.data.porHora} labels={HORAS} /> : <Vazio titulo="Sem mensagens no período" />}</Panel>
          <Panel title="Volume por dia da semana" sub="Mensagens">{q.data.porDiaSemana.some((v) => v > 0) ? <MiniBars vals={q.data.porDiaSemana} labels={DIAS} /> : <Vazio titulo="Sem mensagens no período" />}</Panel>
        </div>
        <Panel title="Conversas por canal">{q.data.porCanal.length === 0 ? <Vazio titulo="Sem conversas no período" /> : <Donut data={q.data.porCanal.map((c) => ({ label: canalNome(c.canal), v: c.total }))} />}</Panel>

        {!ehAtendente && <Estado q={eq}>{eq.data && <>
          <div className="sech" style={{ marginTop: 18 }}>Desempenho por atendente <span style={{ fontWeight: 400, color: 'var(--muted)', fontSize: 12 }}>· mesma fonte da Resumo</span></div>
          <div className="sec-aviso">Clientes/Negócios fechados usam a regra oficial (ganho por fechado_em, com fallback de responsável). "Em andamento" é a carteira atual (por criação). "Não atribuído" aparece quando há fechamento sem responsável.</div>
          <DataTable
            cols={[
              { key: 'nome', label: 'Atendente' }, { key: 'contatos', label: 'Contatos', align: 'c' },
              { key: 'oppAndamento', label: 'Em andamento', align: 'c' },
              { key: 'clientesFechados', label: 'Clientes fechados', align: 'c' }, { key: 'negociosFechados', label: 'Negócios fechados', align: 'c' },
              { key: 'taxaOperacional', label: 'Taxa operacional', align: 'c', fmt: (v) => fmtPct(v as number), csv: (r) => (r.taxaOperacional as number).toFixed(1) },
              { key: 'receitaRecebida', label: 'Receita recebida', align: 'r', fmt: (v) => fmtBRL(v as number), csv: (r) => (r.receitaRecebida as number).toFixed(2) },
            ] as Col<Record<string, unknown>>[]}
            rows={montaLinhasEquipe(eq.data) as unknown as Record<string, unknown>[]} searchKeys={['nome']}
            csvName={`atendentes_${periodoLabel.replace(/\D/g, '')}`} csvMeta={[...meta, 'Clientes/Negocios fechados: ganho por fechado_em com fallback de responsavel']} />
        </>}</Estado>}
      </>}
    </Estado>
  );
}

/* ============ Financeiro (financeiro + economia) ============ */
function AbaFinanceiro({ f }: { f: RelFiltros }) {
  const q = useFinanceiro(f, true);
  const resumo = useResumo(f);
  const mes = (k: string) => k.slice(5) + '/' + k.slice(2, 4);
  return (
    <Estado q={q}>
      {q.data && <>
        <div className="kpis">
          <KpiCard label="Receita recebida" k={flat(q.data.recebida)} sentido="neutro" fmt={fmtBRL} nota="No período" tooltip="Σ valor pago de parcelas pagas (data_pagamento no período)." />
          <KpiCard label="Receita prevista" k={flat(q.data.prevista)} sentido="neutro" fmt={fmtBRL} nota="No período" tooltip="Σ parcelas não canceladas com vencimento no período." />
          <KpiCard label="Pendente" k={flat(q.data.pendente)} sentido="neutro" fmt={fmtBRL} nota="A vencer" tooltip="Parcelas previstas com vencimento ≥ hoje." />
          <KpiCard label="Vencido" k={flat(q.data.vencida)} sentido="menor" fmt={fmtBRL} nota="Posição atual" tooltip="Parcelas não pagas com vencimento anterior a hoje." />
          <KpiCard label="Inadimplência" k={flat(q.data.inadimplencia)} sentido="menor" fmt={fmtPct} nota="Sobre vencidas" tooltip="Parcelas vencidas não pagas ÷ parcelas vencidas." />
          <KpiCard label="Taxa de recebimento" k={flat(q.data.taxaRecebimento)} sentido="maior" fmt={fmtPct} nota="Sobre vencidas" tooltip="Parcelas vencidas pagas ÷ parcelas vencidas." />
          <KpiCard label="Cobranças ativas" k={flat(q.data.cobAtivas)} sentido="neutro" fmt={fmtInt} nota="Atual" tooltip="Cobranças não finalizadas e não canceladas." />
          <KpiCard label="Ticket médio mensal" k={flat(q.data.ticketMensal)} sentido="neutro" fmt={fmtBRL} nota="Cobranças ativas" tooltip="Média de valor mensal das cobranças ativas." />
        </div>
        <div className="grid-2">
          <Panel title="Previsão de recebimento" sub="Próximos 6 meses (previsto)">{q.data.previsao6m.some((m) => m.previsto > 0) ? <Bars data={q.data.previsao6m.map((m) => ({ label: mes(m.mes), v: m.previsto }))} money compact /> : <Vazio titulo="Sem previsão de recebimento" texto="Nenhuma parcela prevista nos próximos 6 meses." />}</Panel>
          <Panel title="Evolução de recebimentos" sub="Últimos 6 meses">{q.data.evolucao.some((m) => m.recebido > 0) ? <LineChart pts={q.data.evolucao.map((m) => ({ label: mes(m.mes), v: m.recebido }))} money compact /> : <Vazio titulo="Nenhum recebimento registrado" texto="Sem parcelas pagas nos últimos 6 meses." />}</Panel>
        </div>
        <div className="grid-2">
          <Panel title="Parcelas por status">{(q.data.parPagas + q.data.parPrevistas + q.data.parNaoPagas + q.data.parCanceladas) === 0 ? <Vazio titulo="Sem parcelas" /> : <Donut data={[{ label: 'Pagas', v: q.data.parPagas }, { label: 'Previstas', v: q.data.parPrevistas }, { label: 'Não pagas', v: q.data.parNaoPagas }, { label: 'Canceladas', v: q.data.parCanceladas }]} />}</Panel>
          <Panel title="Receita por serviço" sub="Valor mensal somado (ativas)">{q.data.porServico.length === 0 ? <Vazio titulo="Sem cobranças ativas" /> : q.data.porServico.length === 1 ? <div className="compact-stat"><span className="cs-v">{fmtBRL(q.data.porServico[0].total)}</span><span className="cs-l">{q.data.porServico[0].nome}</span></div> : <Bars data={q.data.porServico.slice(0, 8).map((s) => ({ label: s.nome.slice(0, 10), v: s.total }))} money compact />}</Panel>
        </div>
        <Panel title="Economia gerada">
          {resumo.data?.economiaPreenchida && resumo.data.economiaGerada
            ? <div className="compact-stat"><span className="cs-v">{fmtBRL(resumo.data.economiaGerada.atual)}</span><span className="cs-l">economia no período</span></div>
            : <Vazio titulo="Ainda não há dados de economia" texto="Não existem cobranças com os valores original e renegociado preenchidos. Quando esses dados forem registrados, este relatório mostrará a economia total, média e por cliente." />}
        </Panel>
      </>}
    </Estado>
  );
}

/* ============ Detalhamento (seletor interno) ============ */
function AbaDetalhamento({ f, periodoLabel, orgNome, ehAtendente, onNav }: { f: RelFiltros; periodoLabel: string; orgNome: string; ehAtendente: boolean; onNav: (p: string) => void }) {
  const [sel, setSel] = useState<'carteira' | 'origem' | 'conexoes'>('carteira');
  const eq = useEquipe(f, !ehAtendente && sel === 'carteira');
  const or = useOrigens(f, sel === 'origem');
  const meta = [`Organizacao: ${orgNome}`, `Periodo: ${periodoLabel}`, `Gerado: ${new Date().toLocaleString('pt-BR')}`];
  const opcoesSel: { id: 'carteira' | 'origem' | 'conexoes'; r: string }[] = [{ id: 'carteira', r: 'Por responsável' }, { id: 'conexoes', r: 'Por conexão' }, { id: 'origem', r: 'Por origem' }];
  return (
    <>
      <div className="det-sel">{opcoesSel.filter((o) => !(o.id === 'carteira' && ehAtendente)).map((o) => <button key={o.id} className={sel === o.id ? 'on' : ''} onClick={() => setSel(o.id)}>{o.r}</button>)}</div>
      {sel === 'carteira' && !ehAtendente && <Estado q={eq}>{eq.data && <DataTable
        cols={[
          { key: 'nome', label: 'Atendente' }, { key: 'contatos', label: 'Contatos', align: 'c' },
          { key: 'oppAndamento', label: 'Em andamento', align: 'c' }, { key: 'oppPerdido', label: 'Perdidos', align: 'c' },
          { key: 'clientesFechados', label: 'Clientes fechados', align: 'c' }, { key: 'negociosFechados', label: 'Negócios fechados', align: 'c' },
          { key: 'receitaContratada', label: 'Receita contratada', align: 'r', fmt: (v) => fmtBRL(v as number), csv: (r) => (r.receitaContratada as number).toFixed(2) },
          { key: 'receitaRecebida', label: 'Receita recebida', align: 'r', fmt: (v) => fmtBRL(v as number), csv: (r) => (r.receitaRecebida as number).toFixed(2) },
        ] as Col<Record<string, unknown>>[]}
        rows={montaLinhasEquipe(eq.data) as unknown as Record<string, unknown>[]} searchKeys={['nome']}
        csvName={`detalhe_atendentes_${periodoLabel.replace(/\D/g, '')}`} csvMeta={meta} />}</Estado>}
      {sel === 'conexoes' && <SecaoConexoes f={f} periodoLabel={periodoLabel} orgNome={orgNome} />}
      {sel === 'origem' && <Estado q={or}>{or.data && <DataTable
        cols={[
          { key: 'origem', label: 'Origem' }, { key: 'oportunidades', label: 'Oportunidades', align: 'c' },
          { key: 'ganhas', label: 'Ganhas', align: 'c' }, { key: 'taxaConversao', label: 'Conversão', align: 'c', fmt: (v) => fmtPct(v as number), csv: (r) => (r.taxaConversao as number).toFixed(1) },
        ] as Col<Record<string, unknown>>[]}
        rows={or.data as unknown as Record<string, unknown>[]} searchKeys={['origem']}
        csvName={`detalhe_origens_${periodoLabel.replace(/\D/g, '')}`} csvMeta={meta} />}</Estado>}
      <div className="tbl-tools" style={{ marginTop: 8 }}>
        <button className="btn-ghost" onClick={() => onNav('/cobrancas')}>Abrir Cobranças (atraso e pagamentos)</button>
        <button className="btn-ghost" onClick={() => onNav('/kanban')}>Abrir Kanban (oportunidades)</button>
      </div>
      <div className="vazio" style={{ marginTop: 8 }}><IcEmpty /><div><div className="vt">Outros detalhamentos</div><div className="vd">Cobranças em atraso, oportunidades e conversas sem resposta abrem nos módulos relacionados (drill-down por registro). O detalhamento por id dentro do relatório será incremental.</div></div></div>
    </>
  );
}
