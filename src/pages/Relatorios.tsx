import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/useToast';
import { useOrg } from '@/context/OrgContext';
import { useAuth } from '@/context/AuthContext';
import {
  REL_REAL, PRESETS, type Preset, type RelFiltros, FILTROS_PADRAO, resolvePeriodo, type Kpi,
  useRelatorioOpcoes, useResumo, useComercial, useAtendimento, useEquipe, useFinanceiro, useOrigens,
  exportarCSV, spHoje,
} from '@/data/relatorios';
import './Relatorios.css';

/* ===== formatação PT-BR ===== */
const fmtInt = (n: number) => Math.round(n).toLocaleString('pt-BR');
const fmtBRL = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtPct = (n: number) => `${n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
const fmtMin = (n: number | null) => { if (n == null) return '—'; if (n < 60) return `${Math.round(n)} min`; const h = Math.floor(n / 60); return `${h}h ${Math.round(n % 60)}min`; };
const CANAL_LABEL: Record<string, string> = { evolution: 'WhatsApp', meta: 'Facebook' };
const canalNome = (p: string) => CANAL_LABEL[p] || p;
const CANAL_OPCOES = [{ id: 'evolution', r: 'WhatsApp' }, { id: 'meta', r: 'Facebook' }];
const STATUS_OPP = [{ id: 'em_andamento', r: 'Em andamento' }, { id: 'ganho', r: 'Ganho' }, { id: 'perdido', r: 'Perdido' }, { id: 'cancelado', r: 'Cancelado' }];

/* ===== ícones ===== */
const I = (d: ReactNode) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">{d}</svg>;
const IcRefresh = () => I(<><path d="M21 12a9 9 0 1 1-3-6.7L21 8" /><path d="M21 3v5h-5" /></>);
const IcExport = () => I(<><path d="M12 3v12M8 11l4 4 4-4M5 21h14" /></>);
const IcSearch = () => I(<><circle cx="11" cy="11" r="7" /><path d="m20 20-3-3" /></>);
const IcCal = () => I(<><rect x="3" y="4.5" width="18" height="16" rx="2.4" /><path d="M3 9h18M8 2.5v4M16 2.5v4" /></>);

/* ===== KPI ===== */
type Sentido = 'maior' | 'menor' | 'neutro';
function Delta({ k, sentido }: { k: Kpi; sentido: Sentido }) {
  const { deltaAbs, deltaPct } = k;
  if (sentido === 'neutro' || deltaAbs === 0) return <span className="kpi-delta neu">— estável vs período anterior</span>;
  const bom = (sentido === 'maior' && deltaAbs > 0) || (sentido === 'menor' && deltaAbs < 0);
  const seta = deltaAbs > 0 ? '▲' : '▼';
  const txt = deltaPct == null ? `${deltaAbs > 0 ? '+' : ''}${fmtInt(deltaAbs)}` : `${deltaPct > 0 ? '+' : ''}${deltaPct.toFixed(1)}%`;
  return <span className={'kpi-delta ' + (bom ? 'pos' : 'neg')}>{seta} {txt} vs anterior</span>;
}
function KpiCard({ label, k, sentido, fmt, tooltip }: { label: string; k: Kpi | null; sentido: Sentido; fmt: (n: number) => string; tooltip: string }) {
  if (!k) return (
    <div className="kpi"><div className="kpi-body"><div className="kpi-head"><div className="kpi-label">{label}</div><span className="kpi-info" title={tooltip}>i</span></div><div className="kpi-value" style={{ fontSize: 15, color: 'var(--muted)' }}>Dados indisponíveis</div></div></div>
  );
  return (
    <div className="kpi">
      <div className="kpi-body">
        <div className="kpi-head"><div className="kpi-label">{label}</div><span className="kpi-info" title={tooltip}>i</span></div>
        <div className="kpi-value">{fmt(k.atual)}</div>
        <Delta k={k} sentido={sentido} />
        <div className="kpi-prev">Anterior: {fmt(k.anterior)}</div>
      </div>
    </div>
  );
}
const flat = (v: number): Kpi => ({ atual: v, anterior: v, deltaAbs: 0, deltaPct: 0 });

/* ===== gráficos SVG ===== */
function LineChart({ pts, money }: { pts: { label: string; v: number }[]; money?: boolean }) {
  if (!pts.length) return <div className="fx-empty">Sem dados no período.</div>;
  const W = 720, H = 220, pl = 44, pr = 14, pt = 14, pb = 26, n = pts.length;
  const max = Math.max(1, ...pts.map((p) => p.v)) * 1.18;
  const X = (i: number) => pl + (W - pl - pr) * (n > 1 ? i / (n - 1) : 0.5);
  const Y = (v: number) => H - pb - (H - pt - pb) * (v / max);
  const line = pts.map((p, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(p.v).toFixed(1)).join(' ');
  const area = `${line} L${X(n - 1).toFixed(1)} ${H - pb} L${X(0).toFixed(1)} ${H - pb} Z`;
  const grid = [0, 1, 2, 3, 4].map((g) => { const gy = pt + (H - pt - pb) * g / 4; const gv = max - max * g / 4; return <g key={g}><line className="gridln" x1={pl} y1={gy} x2={W - pr} y2={gy} /><text className="axval" x={pl - 7} y={gy + 3} textAnchor="end">{money ? fmtInt(gv / 1000) + 'k' : fmtInt(gv)}</text></g>; });
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
function Bars({ data, money }: { data: { label: string; v: number }[]; money?: boolean }) {
  if (!data.length) return <div className="fx-empty">Sem dados no período.</div>;
  const W = 620, H = 220, pl = 44, pr = 12, pt = 14, pb = 28, n = data.length, bw = Math.min(46, (W - pl - pr) / n * 0.6);
  const max = Math.max(1, ...data.map((d) => d.v)) * 1.15;
  const grid = [0, 1, 2, 3, 4].map((g) => { const gy = pt + (H - pt - pb) * g / 4; const gv = max - max * g / 4; return <g key={g}><line className="gridln" x1={pl} y1={gy} x2={W - pr} y2={gy} /><text className="axval" x={pl - 7} y={gy + 3} textAnchor="end">{money ? fmtInt(gv / 1000) + 'k' : fmtInt(gv)}</text></g>; });
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" preserveAspectRatio="xMidYMid meet">
      {grid}
      {data.map((d, i) => { const x = pl + (W - pl - pr) * ((i + 0.5) / n) - bw / 2; const bh = (H - pt - pb) * (d.v / max); return <g key={i}><rect x={x} y={H - pb - bh} width={bw} height={Math.max(2, bh)} rx="4" fill={i === n - 1 ? 'var(--accent)' : 'var(--bar)'} /><text className="axlbl" x={x + bw / 2} y={H - 7} textAnchor="middle">{d.label}</text></g>; })}
    </svg>
  );
}
function Funnel({ stages }: { stages: { nome: string; total: number }[] }) {
  if (!stages.length) return <div className="fx-empty">Sem etapas configuradas ou sem oportunidades.</div>;
  const max = Math.max(1, ...stages.map((s) => s.total));
  return <div className="funnel">{stages.map((s) => <div className="funnel-row" key={s.nome}><span className="funnel-name" title={s.nome}>{s.nome}</span><div className="funnel-bar"><i style={{ width: `${(s.total / max) * 100}%` }} /></div><span className="funnel-val">{fmtInt(s.total)}</span></div>)}</div>;
}
const DONUT_PAL = ['#19C37D', '#2563EB', '#7a5bb0', '#c2772a', '#d6453f', '#2f8f9d', '#b0566f'];
function Donut({ data }: { data: { label: string; v: number }[] }) {
  const total = data.reduce((s, d) => s + d.v, 0);
  if (total === 0) return <div className="fx-empty">Sem dados no período.</div>;
  const size = 170, r = size / 2 - 11, C = 2 * Math.PI * r, cx = size / 2, cy = size / 2; let off = 0;
  return (
    <div className="donut-wrap">
      <div className="donut"><svg viewBox={`0 0 ${size} ${size}`} width="170" height="170">{data.map((d, i) => { const len = d.v / total * C; const seg = <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={DONUT_PAL[i % DONUT_PAL.length]} strokeWidth="17" strokeDasharray={`${len.toFixed(1)} ${(C - len).toFixed(1)}`} strokeDashoffset={(-off).toFixed(1)} />; off += len; return seg; })}</svg><div className="center"><div className="big">{fmtInt(total)}</div><div className="cap">total</div></div></div>
      <div className="legend">{data.map((d, i) => <div className="li" key={i}><span className="sw" style={{ background: DONUT_PAL[i % DONUT_PAL.length] }} /><span className="ln">{d.label}</span><span className="lv">{fmtInt(d.v)}</span><span className="lp">{((d.v / total) * 100).toFixed(0)}%</span></div>)}</div>
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

/* ===== abas ===== */
const ABAS = [
  { id: 'visao', label: 'Visão geral' }, { id: 'comercial', label: 'Comercial' }, { id: 'atendimento', label: 'Atendimento' },
  { id: 'equipe', label: 'Equipe' }, { id: 'financeiro', label: 'Financeiro' }, { id: 'economia', label: 'Economia gerada' },
  { id: 'origens', label: 'Origens' }, { id: 'dados', label: 'Dados detalhados' },
] as const;
type Aba = typeof ABAS[number]['id'];

export function Relatorios() {
  const { toast } = useToast();
  const { currentOrg } = useOrg();
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const ehAtendente = currentOrg.role === 'atendente';
  const [aba, setAba] = useState<Aba>('visao');
  const [f, setF] = useState<RelFiltros>(() => (ehAtendente && user ? { ...FILTROS_PADRAO, responsavel: user.id } : FILTROS_PADRAO));
  const [custIni, setCustIni] = useState(spHoje());
  const [custFim, setCustFim] = useState(spHoje());

  const periodo = resolvePeriodo(f.preset, f.ini, f.fim);
  const opcoes = useRelatorioOpcoes();
  const setFiltro = (k: keyof RelFiltros, v: string) => setF((s) => ({ ...s, [k]: v || undefined }));
  function setPreset(p: Preset) {
    if (p === 'custom') setF((s) => ({ ...s, preset: p, ini: custIni, fim: custFim }));
    else setF((s) => ({ ...s, preset: p, ini: undefined, fim: undefined }));
  }
  function aplicarCustom(ini: string, fim: string) { setCustIni(ini); setCustFim(fim); setF((s) => ({ ...s, preset: 'custom', ini, fim })); }
  function atualizar() { qc.invalidateQueries({ predicate: (qq) => String(qq.queryKey[0]).startsWith('rel-') }); toast('Dados atualizados'); }
  function limpar() { setF({ ...FILTROS_PADRAO, ...(ehAtendente && user ? { responsavel: user.id } : {}) }); }

  const chips: { k: keyof RelFiltros; lbl: string; val: string }[] = [];
  if (f.canal) chips.push({ k: 'canal', lbl: 'Canal', val: canalNome(f.canal) });
  if (f.origem) chips.push({ k: 'origem', lbl: 'Origem', val: f.origem });
  if (f.responsavel && !ehAtendente) chips.push({ k: 'responsavel', lbl: 'Responsável', val: opcoes.data?.responsaveis.find((r) => r.id === f.responsavel)?.nome || '—' });
  if (f.coluna) chips.push({ k: 'coluna', lbl: 'Etapa', val: opcoes.data?.colunas.find((c) => c.id === f.coluna)?.nome || '—' });
  if (f.status) chips.push({ k: 'status', lbl: 'Status', val: STATUS_OPP.find((s) => s.id === f.status)?.r || f.status });

  if (!REL_REAL) return <div className="relatorios-page"><div className="content"><div className="indispo">Relatórios disponíveis com o backend configurado.</div></div></div>;
  const abasVisiveis = ABAS.filter((a) => !(a.id === 'equipe' && ehAtendente));

  return (
    <div className="relatorios-page">
      <div className="content">
        <div className="toolbar">
          <div className="seg">{PRESETS.map((b) => <button key={b.id} className={f.preset === b.id ? 'on' : ''} onClick={() => setPreset(b.id)}>{b.label}</button>)}</div>
          {f.preset === 'custom'
            ? <span className="custom-dates"><input type="date" value={custIni} max={custFim} onChange={(e) => aplicarCustom(e.target.value, custFim)} /><span style={{ color: 'var(--muted)' }}>até</span><input type="date" value={custFim} min={custIni} max={spHoje()} onChange={(e) => aplicarCustom(custIni, e.target.value)} /></span>
            : <span className="daterange"><IcCal /><span>{periodo.label}</span></span>}
          <select className="flt" aria-label="Canal" value={f.canal || ''} onChange={(e) => setFiltro('canal', e.target.value)}><option value="">Canal: todos</option>{CANAL_OPCOES.map((c) => <option key={c.id} value={c.id}>{c.r}</option>)}</select>
          <select className="flt" aria-label="Origem" value={f.origem || ''} onChange={(e) => setFiltro('origem', e.target.value)}><option value="">Origem: todas</option>{(opcoes.data?.origens || []).map((o) => <option key={o} value={o}>{o}</option>)}</select>
          {!ehAtendente && <select className="flt" aria-label="Responsável" value={f.responsavel || ''} onChange={(e) => setFiltro('responsavel', e.target.value)}><option value="">Responsável: todos</option>{(opcoes.data?.responsaveis || []).map((r) => <option key={r.id} value={r.id}>{r.nome}</option>)}</select>}
          <select className="flt" aria-label="Etapa" value={f.coluna || ''} onChange={(e) => setFiltro('coluna', e.target.value)}><option value="">Etapa: todas</option>{(opcoes.data?.colunas || []).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select>
          <select className="flt" aria-label="Status" value={f.status || ''} onChange={(e) => setFiltro('status', e.target.value)}><option value="">Status: todos</option>{STATUS_OPP.map((s) => <option key={s.id} value={s.id}>{s.r}</option>)}</select>
          <span className="tb-spacer" />
          <button className="btn-ghost" onClick={atualizar}><IcRefresh />Atualizar</button>
        </div>

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

        {aba === 'visao' && <AbaVisao f={f} />}
        {aba === 'comercial' && <AbaComercial f={f} />}
        {aba === 'atendimento' && <AbaAtendimento f={f} />}
        {aba === 'equipe' && !ehAtendente && <AbaEquipe f={f} periodoLabel={periodo.label} orgNome={currentOrg.name} />}
        {aba === 'financeiro' && <AbaFinanceiro f={f} />}
        {aba === 'economia' && <AbaEconomia f={f} />}
        {aba === 'origens' && <AbaOrigens f={f} periodoLabel={periodo.label} orgNome={currentOrg.name} />}
        {aba === 'dados' && <AbaDados f={f} periodoLabel={periodo.label} orgNome={currentOrg.name} onNav={navigate} />}
      </div>
    </div>
  );
}

/* ============ ABA: Visão geral ============ */
function AbaVisao({ f }: { f: RelFiltros }) {
  const q = useResumo(f);
  const fin = useFinanceiro(f, true);
  const com = useComercial(f, true);
  return (
    <Estado q={q}>
      {q.data && <>
        <div className="kpis">
          <KpiCard label="Leads recebidos" k={q.data.leadsRecebidos} sentido="maior" fmt={fmtInt} tooltip="Oportunidades criadas no período (criado_em)." />
          <KpiCard label="Leads atendidos" k={q.data.leadsAtendidos} sentido="maior" fmt={fmtInt} tooltip="Conversas distintas com ao menos uma mensagem de saída no período." />
          <KpiCard label="Novos contatos" k={q.data.novosContatos} sentido="maior" fmt={fmtInt} tooltip="Contatos criados no período (contatos.criado_em)." />
          <KpiCard label="Oportunidades abertas" k={q.data.oportunidadesAbertas} sentido="maior" fmt={fmtInt} tooltip="Oportunidades em andamento criadas no período." />
          <KpiCard label="Clientes fechados" k={q.data.clientesFechados} sentido="maior" fmt={fmtInt} tooltip="Oportunidades com status ganho no período." />
          <KpiCard label="Taxa de conversão" k={q.data.taxaConversao} sentido="maior" fmt={fmtPct} tooltip="Ganhos ÷ leads recebidos no período." />
          <KpiCard label="Receita recebida" k={q.data.receitaRecebida} sentido="maior" fmt={fmtBRL} tooltip="Soma de valor_pago das parcelas pagas com data_pagamento no período." />
          <KpiCard label="Receita prevista" k={q.data.receitaPrevista} sentido="maior" fmt={fmtBRL} tooltip="Soma das parcelas (não canceladas) com vencimento no período." />
          <KpiCard label="Ticket médio (mensal)" k={q.data.ticketMedio} sentido="maior" fmt={fmtBRL} tooltip="Média de valor_mensal das cobranças não canceladas criadas no período." />
          <KpiCard label="Parcelas em atraso" k={q.data.parcelasAtraso} sentido="menor" fmt={fmtInt} tooltip="Parcelas previstas com vencimento anterior a hoje." />
          <KpiCard label="Inadimplência" k={q.data.taxaInadimplencia} sentido="menor" fmt={fmtPct} tooltip="Parcelas vencidas não pagas ÷ parcelas vencidas (vencimento no período)." />
          <KpiCard label="Economia gerada" k={q.data.economiaGerada} sentido="maior" fmt={fmtBRL} tooltip="Soma de valor_economizado das cobranças. Indisponível quando o campo não está preenchido." />
        </div>
        <div className="grid-2">
          <Estado q={fin}>{fin.data && <Panel title="Evolução de recebimentos" sub="Últimos 6 meses (valor pago)"><LineChart pts={fin.data.evolucao.map((m) => ({ label: m.mes.slice(5) + '/' + m.mes.slice(2, 4), v: m.recebido }))} money /></Panel>}</Estado>
          <Estado q={com}>{com.data && <Panel title="Funil comercial" sub="Oportunidades por etapa (colunas reais)"><Funnel stages={com.data.funil.map((c) => ({ nome: c.nome, total: c.total }))} /></Panel>}</Estado>
        </div>
      </>}
    </Estado>
  );
}

/* ============ ABA: Comercial ============ */
function AbaComercial({ f }: { f: RelFiltros }) {
  const q = useComercial(f, true);
  return (
    <Estado q={q}>
      {q.data && <>
        <div className="kpis">
          <KpiCard label="Oportunidades no período" k={flat(q.data.totalOpp)} sentido="neutro" fmt={fmtInt} tooltip="Oportunidades criadas no período." />
          <KpiCard label="Taxa de conversão" k={flat(q.data.taxaConversao)} sentido="neutro" fmt={fmtPct} tooltip="Ganhos ÷ total de oportunidades." />
          <KpiCard label="Taxa de fechamento" k={flat(q.data.taxaFechamento)} sentido="neutro" fmt={fmtPct} tooltip="Ganhos ÷ (ganhos + perdidos)." />
          <KpiCard label="Clientes perdidos" k={flat(q.data.perdidos)} sentido="neutro" fmt={fmtInt} tooltip="Oportunidades com status perdido." />
          <KpiCard label="Paradas há +7 dias" k={flat(q.data.paradasMais7d)} sentido="neutro" fmt={fmtInt} tooltip="Em andamento sem atualização há mais de 7 dias (atualizado_em)." />
        </div>
        <div className="grid-2">
          <Panel title="Leads recebidos por dia" sub="Oportunidades criadas"><LineChart pts={q.data.leadsSerie} /></Panel>
          <Panel title="Funil comercial" sub="Etapas reais do funil da organização"><Funnel stages={q.data.funil.map((c) => ({ nome: c.nome, total: c.total }))} /></Panel>
        </div>
        <Panel title="Distribuição por status"><Donut data={q.data.porStatus.map((s) => ({ label: s.status, v: s.total }))} /></Panel>
        <div className="indispo" style={{ marginTop: 16 }}><b>Indisponível:</b> tempo médio por etapa, conversão entre etapas e motivos de perda — não há tabela de histórico de movimentação nem campo de motivo de perda no schema atual.</div>
      </>}
    </Estado>
  );
}

/* ============ ABA: Atendimento ============ */
function AbaAtendimento({ f }: { f: RelFiltros }) {
  const q = useAtendimento(f, true);
  const HORAS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
  const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  return (
    <Estado q={q}>
      {q.data && <>
        <div className="kpis">
          <KpiCard label="Total de conversas" k={flat(q.data.totalConversas)} sentido="neutro" fmt={fmtInt} tooltip="Conversas criadas no período." />
          <KpiCard label="Abertas" k={flat(q.data.abertas)} sentido="neutro" fmt={fmtInt} tooltip="Conversas com status aberta." />
          <KpiCard label="Resolvidas" k={flat(q.data.resolvidas)} sentido="neutro" fmt={fmtInt} tooltip="Conversas resolvidas ou fechadas." />
          <KpiCard label="Sem resposta" k={flat(q.data.semResposta)} sentido="menor" fmt={fmtInt} tooltip="Conversas com entrada do cliente e nenhuma saída no período." />
          <KpiCard label="Mensagens recebidas" k={flat(q.data.msgRecebidas)} sentido="neutro" fmt={fmtInt} tooltip="Mensagens de entrada no período." />
          <KpiCard label="Mensagens enviadas" k={flat(q.data.msgEnviadas)} sentido="neutro" fmt={fmtInt} tooltip="Mensagens de saída (exclui sistema e nota interna)." />
          <KpiCard label="Média msg/conversa" k={flat(q.data.mediaMsgConversa)} sentido="neutro" fmt={(n) => n.toFixed(1)} tooltip="Total de mensagens ÷ conversas no período." />
          <KpiCard label="Taxa de resposta" k={flat(q.data.taxaResposta)} sentido="maior" fmt={fmtPct} tooltip="Conversas com entrada que receberam ao menos uma saída ÷ conversas com entrada." />
          <KpiCard label="Tempo 1ª resposta (médio)" k={q.data.primeiraRespostaMin == null ? null : flat(q.data.primeiraRespostaMin)} sentido="menor" fmt={(n) => fmtMin(n)} tooltip="Média entre a 1ª entrada e a 1ª saída por conversa." />
        </div>
        <div className="grid-2">
          <Panel title="Volume por hora do dia" sub="Mensagens (fuso de São Paulo)"><MiniBars vals={q.data.porHora} labels={HORAS} /></Panel>
          <Panel title="Volume por dia da semana" sub="Mensagens"><MiniBars vals={q.data.porDiaSemana} labels={DIAS} /></Panel>
        </div>
        <Panel title="Conversas por canal"><Donut data={q.data.porCanal.map((c) => ({ label: canalNome(c.canal), v: c.total }))} /></Panel>
        <div className="indispo" style={{ marginTop: 16 }}><b>Limitação:</b> não é possível distinguir com segurança resposta humana de automática (saídas com autor majoritariamente nulo); usa-se saída não-sistema como proxy. Tempo de atendimento/resolução e “fora de horário” dependem de marcação de jornada inexistente.</div>
      </>}
    </Estado>
  );
}

/* ============ ABA: Equipe ============ */
function AbaEquipe({ f, periodoLabel, orgNome }: { f: RelFiltros; periodoLabel: string; orgNome: string }) {
  const q = useEquipe(f, true);
  const linhas = (q.data || []).slice().sort((a, b) => b.receitaRecebida - a.receitaRecebida);
  const maxRec = Math.max(1, ...linhas.map((l) => l.receitaRecebida));
  const top = (campo: 'oppGanho' | 'receitaRecebida' | 'leads') => linhas.slice().sort((a, b) => (b[campo] as number) - (a[campo] as number))[0];
  return (
    <Estado q={q}>
      {q.data && <>
        <div className="grid-3">
          <Panel title="Maior receita recebida">{top('receitaRecebida') && top('receitaRecebida').receitaRecebida > 0 ? <div className="sech" style={{ margin: 8 }}>{top('receitaRecebida').nome} · {fmtBRL(top('receitaRecebida').receitaRecebida)}</div> : <div className="fx-empty">Sem dados.</div>}</Panel>
          <Panel title="Mais fechamentos">{top('oppGanho') && top('oppGanho').oppGanho > 0 ? <div className="sech" style={{ margin: 8 }}>{top('oppGanho').nome} · {fmtInt(top('oppGanho').oppGanho)}</div> : <div className="fx-empty">Sem dados.</div>}</Panel>
          <Panel title="Maior volume de leads">{top('leads') && top('leads').leads > 0 ? <div className="sech" style={{ margin: 8 }}>{top('leads').nome} · {fmtInt(top('leads').leads)}</div> : <div className="fx-empty">Sem dados.</div>}</Panel>
        </div>
        <Panel title="Ranking por atendente (responsável)" sub="Volume e eficiência separados">
          {linhas.length ? <div className="barlist">{linhas.map((l) => <div className="barlist-row" key={l.id}><span className="barlist-name" title={l.nome}>{l.nome}</span><div className="barlist-track"><i style={{ width: `${(l.receitaRecebida / maxRec) * 100}%` }} /></div><span className="barlist-val">{fmtBRL(l.receitaRecebida)}</span></div>)}</div> : <div className="fx-empty">Sem atendentes.</div>}
        </Panel>
        <DataTable
          cols={[
            { key: 'nome', label: 'Atendente' },
            { key: 'leads', label: 'Leads', align: 'c' },
            { key: 'oppAndamento', label: 'Em andamento', align: 'c' },
            { key: 'oppGanho', label: 'Fechados', align: 'c' },
            { key: 'oppPerdido', label: 'Perdidos', align: 'c' },
            { key: 'taxaConversao', label: 'Conversão', align: 'c', fmt: (v) => fmtPct(v as number), csv: (r) => (r.taxaConversao as number).toFixed(1) },
            { key: 'receitaContratada', label: 'Receita contratada', align: 'r', fmt: (v) => fmtBRL(v as number), csv: (r) => (r.receitaContratada as number).toFixed(2) },
            { key: 'receitaRecebida', label: 'Receita recebida', align: 'r', fmt: (v) => fmtBRL(v as number), csv: (r) => (r.receitaRecebida as number).toFixed(2) },
          ] as Col<Record<string, unknown>>[]}
          rows={linhas as unknown as Record<string, unknown>[]}
          searchKeys={['nome']}
          csvName={`equipe_${periodoLabel.replace(/\D/g, '')}`}
          csvMeta={[`Organizacao: ${orgNome}`, `Periodo: ${periodoLabel}`, `Gerado: ${new Date().toLocaleString('pt-BR')}`, 'Atribuicao por responsavel (responsavel_id/criado_por)']}
        />
        <div className="indispo" style={{ marginTop: 16 }}><b>Limitação:</b> conversas/mensagens não têm atendente atribuído de forma confiável (conversas.atendente_id nulo), então o ranking usa atribuição comercial/financeira por responsável. Metas não existem no schema → comparação com meta indisponível.</div>
      </>}
    </Estado>
  );
}

/* ============ ABA: Financeiro ============ */
function AbaFinanceiro({ f }: { f: RelFiltros }) {
  const q = useFinanceiro(f, true);
  const mes = (k: string) => k.slice(5) + '/' + k.slice(2, 4);
  return (
    <Estado q={q}>
      {q.data && <>
        <div className="kpis">
          <KpiCard label="Receita recebida" k={flat(q.data.recebida)} sentido="neutro" fmt={fmtBRL} tooltip="Σ valor_pago de parcelas pagas com data_pagamento no período." />
          <KpiCard label="Receita prevista" k={flat(q.data.prevista)} sentido="neutro" fmt={fmtBRL} tooltip="Σ parcelas não canceladas com vencimento no período." />
          <KpiCard label="Receita pendente" k={flat(q.data.pendente)} sentido="neutro" fmt={fmtBRL} tooltip="Parcelas previstas a vencer (vencimento ≥ hoje)." />
          <KpiCard label="Receita vencida" k={flat(q.data.vencida)} sentido="menor" fmt={fmtBRL} tooltip="Parcelas não pagas com vencimento anterior a hoje." />
          <KpiCard label="Inadimplência" k={flat(q.data.inadimplencia)} sentido="menor" fmt={fmtPct} tooltip="Parcelas vencidas não pagas ÷ parcelas vencidas." />
          <KpiCard label="Taxa de recebimento" k={flat(q.data.taxaRecebimento)} sentido="maior" fmt={fmtPct} tooltip="Parcelas vencidas pagas ÷ parcelas vencidas." />
          <KpiCard label="Ticket médio mensal" k={flat(q.data.ticketMensal)} sentido="neutro" fmt={fmtBRL} tooltip="Média de valor_mensal das cobranças ativas." />
          <KpiCard label="Cobranças ativas" k={flat(q.data.cobAtivas)} sentido="neutro" fmt={fmtInt} tooltip="Cobranças não finalizadas e não canceladas." />
        </div>
        <div className="grid-2">
          <Panel title="Previsão de recebimento" sub="Próximos 6 meses (previsto)"><Bars data={q.data.previsao6m.map((m) => ({ label: mes(m.mes), v: m.previsto }))} money /></Panel>
          <Panel title="Evolução de recebimentos" sub="Últimos 6 meses"><LineChart pts={q.data.evolucao.map((m) => ({ label: mes(m.mes), v: m.recebido }))} money /></Panel>
        </div>
        <div className="grid-2">
          <Panel title="Parcelas por status"><Donut data={[{ label: 'Pagas', v: q.data.parPagas }, { label: 'Previstas', v: q.data.parPrevistas }, { label: 'Não pagas', v: q.data.parNaoPagas }, { label: 'Canceladas', v: q.data.parCanceladas }]} /></Panel>
          <Panel title="Receita por serviço" sub="Valor mensal somado (cobranças ativas)">{q.data.porServico.length ? <Bars data={q.data.porServico.slice(0, 8).map((s) => ({ label: s.nome.slice(0, 10), v: s.total }))} money /> : <div className="fx-empty">Sem dados.</div>}</Panel>
        </div>
      </>}
    </Estado>
  );
}

/* ============ ABA: Economia gerada ============ */
function AbaEconomia({ f }: { f: RelFiltros }) {
  const q = useResumo(f);
  return (
    <Estado q={q}>
      {q.data?.economiaGerada
        ? <div className="kpis"><KpiCard label="Economia gerada total" k={q.data.economiaGerada} sentido="maior" fmt={fmtBRL} tooltip="Σ valor_economizado das cobranças." /></div>
        : <div className="indispo"><b>Dados indisponíveis.</b><br />Os campos de economia existem em <code>cobrancas</code> (valor_original_descontado, novo_valor_descontado, valor_economizado), mas estão sem preenchimento nos registros atuais. Quando passarem a ser informados, esta aba exibirá economia total, média por cliente, maior economia, por banco/serviço/atendente/origem, % médio de redução e evolução mensal — sem alterar o schema.</div>}
    </Estado>
  );
}

/* ============ ABA: Origens ============ */
function AbaOrigens({ f, periodoLabel, orgNome }: { f: RelFiltros; periodoLabel: string; orgNome: string }) {
  const q = useOrigens(f, true);
  return (
    <Estado q={q}>
      {q.data && <>
        <Panel title="Leads por origem"><Bars data={q.data.slice(0, 10).map((o) => ({ label: o.origem.slice(0, 12), v: o.leads }))} /></Panel>
        <DataTable
          cols={[
            { key: 'origem', label: 'Origem' },
            { key: 'leads', label: 'Leads', align: 'c' },
            { key: 'fechados', label: 'Fechados', align: 'c' },
            { key: 'taxaConversao', label: 'Conversão', align: 'c', fmt: (v) => fmtPct(v as number), csv: (r) => (r.taxaConversao as number).toFixed(1) },
          ] as Col<Record<string, unknown>>[]}
          rows={q.data as unknown as Record<string, unknown>[]}
          searchKeys={['origem']}
          csvName={`origens_${periodoLabel.replace(/\D/g, '')}`}
          csvMeta={[`Organizacao: ${orgNome}`, `Periodo: ${periodoLabel}`, `Gerado: ${new Date().toLocaleString('pt-BR')}`]}
        />
        <div className="indispo" style={{ marginTop: 16 }}><b>Indisponível:</b> custo por lead, CPA e ROI — não há dados de investimento de campanha integrados. Receita/economia por origem dependem de vínculo cobrança↔origem preenchido.</div>
      </>}
    </Estado>
  );
}

/* ============ ABA: Dados detalhados ============ */
function AbaDados({ f, periodoLabel, orgNome, onNav }: { f: RelFiltros; periodoLabel: string; orgNome: string; onNav: (p: string) => void }) {
  const eq = useEquipe(f, true);
  const or = useOrigens(f, true);
  const meta = [`Organizacao: ${orgNome}`, `Periodo: ${periodoLabel}`, `Gerado: ${new Date().toLocaleString('pt-BR')}`];
  return (
    <>
      <div className="sech">Desempenho por atendente</div>
      <Estado q={eq}>{eq.data && <DataTable
        cols={[
          { key: 'nome', label: 'Atendente' }, { key: 'leads', label: 'Leads', align: 'c' }, { key: 'oppAndamento', label: 'Andamento', align: 'c' },
          { key: 'oppGanho', label: 'Fechados', align: 'c' }, { key: 'oppPerdido', label: 'Perdidos', align: 'c' },
          { key: 'receitaRecebida', label: 'Receita recebida', align: 'r', fmt: (v) => fmtBRL(v as number), csv: (r) => (r.receitaRecebida as number).toFixed(2) },
        ] as Col<Record<string, unknown>>[]}
        rows={eq.data as unknown as Record<string, unknown>[]} searchKeys={['nome']}
        csvName={`detalhe_atendentes_${periodoLabel.replace(/\D/g, '')}`} csvMeta={meta} />}</Estado>

      <div className="sech" style={{ marginTop: 18 }}>Desempenho por origem</div>
      <Estado q={or}>{or.data && <DataTable
        cols={[
          { key: 'origem', label: 'Origem' }, { key: 'leads', label: 'Leads', align: 'c' },
          { key: 'fechados', label: 'Fechados', align: 'c' }, { key: 'taxaConversao', label: 'Conversão', align: 'c', fmt: (v) => fmtPct(v as number), csv: (r) => (r.taxaConversao as number).toFixed(1) },
        ] as Col<Record<string, unknown>>[]}
        rows={or.data as unknown as Record<string, unknown>[]} searchKeys={['origem']}
        csvName={`detalhe_origens_${periodoLabel.replace(/\D/g, '')}`} csvMeta={meta} />}</Estado>

      <div className="tbl-tools" style={{ marginTop: 8 }}>
        <button className="btn-ghost" onClick={() => onNav('/cobrancas')}>Abrir Cobranças (atraso e pagamentos)</button>
        <button className="btn-ghost" onClick={() => onNav('/kanban')}>Abrir Kanban (oportunidades)</button>
      </div>
      <div className="indispo" style={{ marginTop: 8 }}>Tabelas de clientes fechados, oportunidades perdidas, cobranças em atraso e conversas sem resposta abrem nos módulos relacionados (drill-down por registro). O detalhamento por id dentro do relatório será incremental.</div>
    </>
  );
}
