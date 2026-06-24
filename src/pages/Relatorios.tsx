import { useState } from 'react';
import { WA_REAL } from '@/data/whatsapp';
import { EmptyState } from '@/components/EmptyState';
import { useToast } from '@/hooks/useToast';
import './Relatorios.css';

const PAL = ['#5b6ee1', '#c2693a', '#7a5bb0', '#2f8f9d', '#b0566f', '#4a7a4a', '#9d7a2f', '#3d7ab0'];
function initials(n: string) { const p = n.trim().split(/\s+/); return ((p[0] || '')[0] + ((p[1] || '')[0] || '')).toUpperCase(); }
function avColor(n: string) { if (n === 'Henrique') return '#3f6f52'; let h = 0; for (let i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) >>> 0; return PAL[h % PAL.length]; }
const fmt = (n: number) => n.toLocaleString('pt-BR');

function series(n: number, base: number, amp: number, seed: number) {
  const a: number[] = [];
  for (let i = 0; i < n; i++) a.push(Math.max(1, Math.round(base + amp * Math.sin((i + seed) * 0.6) + amp * 0.45 * Math.sin((i + seed) * 0.22) + ((i * 7) % 11) * amp * 0.05)));
  return a;
}
function areaChart(main: number[], sec: number[], labels: { i: number; t: string }[]) {
  const W = 720, H = 240, pl = 38, pr = 14, pt = 14, pb = 26;
  const max = Math.max(...main) * 1.18, min = 0, n = main.length;
  const X = (i: number) => pl + (W - pl - pr) * (n > 1 ? i / (n - 1) : 0);
  const Y = (v: number) => H - pb - (H - pt - pb) * ((v - min) / (max - min || 1));
  const path = (d: number[]) => d.map((v, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1)).join(' ');
  const lineM = path(main), area = lineM + ' L' + X(n - 1).toFixed(1) + ' ' + (H - pb) + ' L' + X(0).toFixed(1) + ' ' + (H - pb) + ' Z', lineS = path(sec);
  let grid = '', yl = '';
  for (let g = 0; g <= 4; g++) { const gy = pt + (H - pt - pb) * g / 4; const gv = Math.round(max - (max - min) * g / 4); grid += `<line class="gridln" x1="${pl}" y1="${gy.toFixed(1)}" x2="${W - pr}" y2="${gy.toFixed(1)}"/>`; yl += `<text class="axval" x="${pl - 7}" y="${(gy + 3).toFixed(1)}" text-anchor="end">${gv}</text>`; }
  let xl = ''; labels.forEach((t) => { xl += `<text class="axlbl" x="${X(t.i).toFixed(1)}" y="${H - 7}" text-anchor="middle">${t.t}</text>`; });
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="xMidYMid meet"><defs><linearGradient id="ag" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--accent)" stop-opacity="0.26"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs>${grid}${yl}${xl}<path d="${area}" fill="url(#ag)"/><path d="${lineS}" fill="none" stroke="var(--gray-seg)" stroke-width="2" stroke-dasharray="4 4" stroke-linecap="round" stroke-linejoin="round" opacity="0.85"/><path d="${lineM}" fill="none" stroke="var(--accent)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}
function barChart(data: { label: string; v: number }[]) {
  const W = 620, H = 230, pl = 44, pr = 12, pt = 14, pb = 26;
  const max = Math.max(...data.map((d) => d.v)) * 1.15, n = data.length, bw = (W - pl - pr) / n * 0.54;
  let rects = '', xl = '', grid = '', yl = '';
  for (let g = 0; g <= 4; g++) { const gy = pt + (H - pt - pb) * g / 4; const gv = Math.round((max - max * g / 4) / 1000); grid += `<line class="gridln" x1="${pl}" y1="${gy.toFixed(1)}" x2="${W - pr}" y2="${gy.toFixed(1)}"/>`; yl += `<text class="axval" x="${pl - 7}" y="${(gy + 3).toFixed(1)}" text-anchor="end">${gv}k</text>`; }
  data.forEach((d, i) => { const x = pl + (W - pl - pr) * ((i + 0.5) / n) - bw / 2; const bh = (H - pt - pb) * (d.v / max); const y = H - pb - bh; rects += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(2, bh).toFixed(1)}" rx="4" fill="${i === n - 1 ? 'var(--accent)' : 'var(--bar)'}"/>`; xl += `<text class="axlbl" x="${(x + bw / 2).toFixed(1)}" y="${H - 7}" text-anchor="middle">${d.label}</text>`; });
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="xMidYMid meet">${grid}${yl}${rects}${xl}</svg>`;
}
interface Dist { ln: string; sub?: string; q: number; color: string; }
function donut(data: Dist[], total: number, selName: string) {
  const size = 170, r = size / 2 - 11, C = 2 * Math.PI * r, cx = size / 2, cy = size / 2; let off = 0, segs = '';
  data.forEach((d) => { const len = d.q / total * C; const op = (selName && d.ln !== selName) ? '0.30' : '1'; segs += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${d.color}" stroke-width="17" opacity="${op}" stroke-dasharray="${len.toFixed(1)} ${(C - len).toFixed(1)}" stroke-dashoffset="${(-off).toFixed(1)}"/>`; off += len; });
  return `<svg viewBox="0 0 ${size} ${size}" width="170" height="170">${segs}</svg>`;
}

const DIST: Record<string, Dist[]> = {
  canal: [{ ln: 'WhatsApp', q: 3274, color: '#1FA855' }, { ln: 'Facebook', q: 1102, color: '#2563EB' }, { ln: 'Lead Ads', q: 608, color: '#7a5bb0' }, { ln: 'Indicação', q: 334, color: '#9aa6b5' }],
  origem: [{ ln: 'Tráfego 1', q: 1842, color: '#19C37D' }, { ln: 'Tráfego 2', q: 1376, color: '#2563EB' }, { ln: 'Sistema URA', q: 1124, color: '#7a5bb0' }, { ln: 'Orgânico', q: 642, color: '#c2772a' }, { ln: 'Indicação', q: 334, color: '#9aa6b5' }],
  whats: [{ ln: 'Chip 1', sub: '(11) 99955-1234', q: 2484, color: '#19C37D' }, { ln: 'Chip 2', sub: '(11) 98888-5678', q: 1710, color: '#2563EB' }, { ln: 'URA', sub: '(11) 97777-9012', q: 1124, color: '#7a5bb0' }],
};
const TABDIM: Record<string, keyof Filters> = { canal: 'canal', origem: 'fonte', whats: 'whats' };
const DIMLABEL: Record<string, string> = { canal: 'Canal', fonte: 'Fonte', whats: 'WhatsApp', resp: 'Responsável' };
function legendFilterValue(tab: string, d: Dist) {
  if (tab === 'whats') return d.ln + ' — ' + d.sub;
  if (tab === 'canal' && d.ln === 'Facebook') return 'Facebook Messenger';
  if (tab === 'canal' && d.ln === 'Lead Ads') return 'Facebook Lead Ads';
  return d.ln;
}
const shortWhats = (v: string) => v.split(' — ')[0];

const REP = [
  { nome: 'Henrique', atend: '642', conv: 36, rec: 'R$ 28.400' },
  { nome: 'Marina Lopes', atend: '518', conv: 32, rec: 'R$ 22.150' },
  { nome: 'Antônio César', atend: '401', conv: 29, rec: 'R$ 18.620' },
  { nome: 'Paula Ferreira', atend: '281', conv: 27, rec: 'R$ 15.150' },
];
const MESES = [{ label: 'Jun', v: 62000 }, { label: 'Jul', v: 68500 }, { label: 'Ago', v: 60100 }, { label: 'Set', v: 74200 }, { label: 'Out', v: 71800 }, { label: 'Nov', v: 79400 }, { label: 'Dez', v: 88600 }, { label: 'Jan', v: 69200 }, { label: 'Fev', v: 76900 }, { label: 'Mar', v: 81300 }, { label: 'Abr', v: 78050 }, { label: 'Mai', v: 84320 }];
interface Period { sub: string; n: number; base: number; amp: number; seedM: number; seedS: number; range: string; k: string[]; d: string[]; xl: { i: number; t: string }[]; }
const PERIODS: Record<string, Period> = {
  '7d': { sub: 'Volume diário nos últimos 7 dias', n: 7, base: 62, amp: 16, seedM: 1, seedS: 3, range: '24/05/2024 – 30/05/2024', k: ['486', '31,2%', 'R$ 21.040,00', '2m 04s'], d: ['+9% vs período anterior', '+2,4 p.p. vs período anterior', '+6% vs período anterior', '-8% vs período anterior'], xl: [{ i: 0, t: '24' }, { i: 3, t: '27' }, { i: 6, t: '30' }] },
  '30d': { sub: 'Volume diário nos últimos 30 dias', n: 30, base: 58, amp: 18, seedM: 2, seedS: 5, range: '01/05/2024 – 30/05/2024', k: ['1.842', '32,4%', 'R$ 84.320,00', '2m 18s'], d: ['+14% vs período anterior', '+3,1 p.p. vs período anterior', '+9% vs período anterior', '-12% vs período anterior'], xl: [{ i: 0, t: '01' }, { i: 7, t: '08' }, { i: 14, t: '15' }, { i: 21, t: '22' }, { i: 29, t: '30' }] },
  '90d': { sub: 'Média semanal nos últimos 90 dias', n: 13, base: 412, amp: 64, seedM: 4, seedS: 6, range: '02/03/2024 – 30/05/2024', k: ['5.318', '29,8%', 'R$ 241.870,00', '2m 33s'], d: ['+18% vs período anterior', '+1,2 p.p. vs período anterior', '+15% vs período anterior', '-5% vs período anterior'], xl: [{ i: 0, t: 'Sem 1' }, { i: 4, t: 'Sem 5' }, { i: 8, t: 'Sem 9' }, { i: 12, t: 'Sem 13' }] },
  '12m': { sub: 'Volume mensal nos últimos 12 meses', n: 12, base: 1640, amp: 280, seedM: 3, seedS: 7, range: 'Jun/2023 – Mai/2024', k: ['21.640', '30,6%', 'R$ 982.450,00', '2m 41s'], d: ['+22% vs período anterior', '+4,0 p.p. vs período anterior', '+19% vs período anterior', '-7% vs período anterior'], xl: [{ i: 0, t: 'Jun' }, { i: 3, t: 'Set' }, { i: 6, t: 'Dez' }, { i: 9, t: 'Mar' }, { i: 11, t: 'Mai' }] },
};
interface FluxRow { fonte: string; color: string; whats: string; num: string; leads: string; atend: string; proc: string; contr: string; fech: string; taxa: string; rec: string; tempo: string; }
const FLUX: FluxRow[] = [
  { fonte: 'Tráfego 1', color: '#19C37D', whats: 'Chip 1', num: '(11) 99955-1234', leads: '1.842', atend: '1.710', proc: '420', contr: '188', fech: '146', taxa: '7,9%', rec: 'R$ 82.450,00', tempo: '2m 18s' },
  { fonte: 'Tráfego 2', color: '#2563EB', whats: 'Chip 2', num: '(11) 98888-5678', leads: '1.376', atend: '1.244', proc: '318', contr: '142', fech: '103', taxa: '7,5%', rec: 'R$ 61.320,00', tempo: '2m 46s' },
  { fonte: 'Sistema URA', color: '#7a5bb0', whats: 'URA', num: '(11) 97777-9012', leads: '1.124', atend: '1.038', proc: '284', contr: '126', fech: '98', taxa: '8,7%', rec: 'R$ 55.780,00', tempo: '1m 54s' },
  { fonte: 'Orgânico', color: '#c2772a', whats: 'Chip 1', num: '(11) 99955-1234', leads: '642', atend: '588', proc: '142', contr: '64', fech: '49', taxa: '7,6%', rec: 'R$ 28.940,00', tempo: '2m 30s' },
  { fonte: 'Indicação', color: '#9aa6b5', whats: 'Chip 2', num: '(11) 98888-5678', leads: '334', atend: '312', proc: '78', contr: '38', fech: '31', taxa: '9,3%', rec: 'R$ 19.870,00', tempo: '2m 12s' },
];

interface Filters { canal: string; fonte: string; whats: string; resp: string; }
const PERIOD_BTNS = [{ p: '7d', t: '7 dias' }, { p: '30d', t: '30 dias' }, { p: '90d', t: '90 dias' }, { p: '12m', t: '12 meses' }];
const DIST_TABS = [{ t: 'canal', l: 'Canal' }, { t: 'origem', l: 'Origem' }, { t: 'whats', l: 'WhatsApp' }];

const IcCal = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4.5" width="18" height="16" rx="2.4" /><path d="M3 9h18M8 2.5v4M16 2.5v4" /></svg>;
const IcExport = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12M8 11l4 4 4-4M5 21h14" /></svg>;
const IcX = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>;
const IcChevL = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>;
const IcChevR = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>;
const KPI_IC = [
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>,
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 17l6-6 4 4 8-8M21 7h-5M21 7v5" /></svg>,
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v10M14.6 9.3c-.7-.9-3.7-1.4-3.7.6 0 1.9 3.7 1 3.7 2.9 0 2-3 1.5-3.7.6" /></svg>,
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>,
];
const KPI_LABEL = ['Atendimentos no período', 'Taxa de conversão', 'Receita recuperada', 'Tempo médio de resposta'];
const KPI_TONE = ['green', 'green', 'green', 'amber'];

export function Relatorios() {
  const { toast } = useToast();
  const [period, setPeriod] = useState('30d');
  const [curTab, setCurTab] = useState('canal');
  const [filters, setFilters] = useState<Filters>({ canal: '', fonte: '', whats: '', resp: '' });

  const c = PERIODS[period];
  const main = series(c.n, c.base, c.amp, c.seedM);
  const sec = main.map((v) => Math.round(v * (0.30 + 0.04 * Math.sin(v))));
  const areaSvg = areaChart(main, sec, c.xl);
  const barSvg = barChart(MESES);

  const distData = DIST[curTab]; const distTotal = distData.reduce((s, d) => s + d.q, 0);
  const dim = TABDIM[curTab]; let selName = '';
  distData.forEach((d) => { if (legendFilterValue(curTab, d) === filters[dim]) selName = d.ln; });
  const donutSvg = donut(distData, distTotal, selName);

  const fluxRows = FLUX.filter((r) => { if (filters.fonte && r.fonte !== filters.fonte) return false; if (filters.whats && (r.whats + ' — ' + r.num) !== filters.whats) return false; return true; });
  const activeKeys = (Object.keys(filters) as (keyof Filters)[]).filter((k) => filters[k]);

  function setFilter(d: keyof Filters, val: string) { setFilters((f) => ({ ...f, [d]: val })); }
  function onSelect(d: keyof Filters, val: string) { setFilter(d, val); if (val) toast(DIMLABEL[d] + ': ' + (d === 'whats' ? shortWhats(val) : val)); }
  function clickLegend(d: Dist) {
    const dd = TABDIM[curTab]; const val = legendFilterValue(curTab, d); const on = filters[dd] !== val;
    setFilter(dd, on ? val : ''); toast(on ? (DIMLABEL[dd] + ': ' + (dd === 'whats' ? d.ln : val)) : 'Filtro removido');
  }

  if (WA_REAL) return (
    <EmptyState
      icon={<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20V4M4 20h16" /><rect x="7" y="11" width="3" height="6" rx="1" /><rect x="12" y="7" width="3" height="10" rx="1" /><rect x="17" y="13" width="3" height="4" rx="1" /></svg>}
      title="Sem dados para exibir"
      text="Os relatórios são gerados conforme os atendimentos e cobranças acontecem. Conecte um canal e comece a atender para ver os números aqui."
    />
  );

  return (
    <div className="relatorios-page">
      <div className="content">
        <div className="toolbar">
          <div className="seg">
            {PERIOD_BTNS.map((b) => <button key={b.p} className={period === b.p ? 'on' : ''} onClick={() => { setPeriod(b.p); toast('Período: ' + b.t); }}>{b.t}</button>)}
          </div>
          <span className="daterange"><IcCal /><span>{c.range}</span></span>
          <select className="flt" aria-label="Canal" value={filters.canal} onChange={(e) => onSelect('canal', e.target.value)}><option value="">Canal: todos</option><option>WhatsApp</option><option>Facebook Messenger</option><option>Facebook Lead Ads</option><option>Indicação</option></select>
          <select className="flt" aria-label="Fonte de aquisição" value={filters.fonte} onChange={(e) => onSelect('fonte', e.target.value)}><option value="">Fonte: todas</option><option>Tráfego 1</option><option>Tráfego 2</option><option>Sistema URA</option><option>Orgânico</option><option>Indicação</option></select>
          <select className="flt" aria-label="WhatsApp de entrada" value={filters.whats} onChange={(e) => onSelect('whats', e.target.value)}><option value="">WhatsApp: todos</option><option>Chip 1 — (11) 99955-1234</option><option>Chip 2 — (11) 98888-5678</option><option>URA — (11) 97777-9012</option></select>
          <select className="flt" aria-label="Responsável" value={filters.resp} onChange={(e) => onSelect('resp', e.target.value)}><option value="">Responsável: todos</option><option>Henrique</option><option>Marina Lopes</option><option>Antônio César</option><option>Paula Ferreira</option></select>
          <span className="tb-spacer" />
          <button className="btn-ghost" onClick={() => toast('Exportar relatório')}><IcExport />Exportar relatório</button>
        </div>

        <div className={'filterbar' + (activeKeys.length ? '' : ' empty')}>
          {activeKeys.length > 0 && (<>
            <span className="flbl">Filtros ativos:</span>
            {activeKeys.map((k) => (
              <span className="fchip" key={k}><span><b>{DIMLABEL[k]}:</b>{k === 'whats' ? shortWhats(filters[k]) : filters[k]}</span><button aria-label="Remover filtro" onClick={() => setFilter(k, '')}><IcX /></button></span>
            ))}
            <button className="fclear" onClick={() => { setFilters({ canal: '', fonte: '', whats: '', resp: '' }); toast('Filtros limpos'); }}>Limpar tudo</button>
          </>)}
        </div>

        <div className="kpis">
          {[0, 1, 2, 3].map((i) => (
            <div className="kpi" key={i}>
              <span className={'kpi-ic ' + KPI_TONE[i]}>{KPI_IC[i]}</span>
              <div className="kpi-body"><div className="kpi-label">{KPI_LABEL[i]}</div><div className="kpi-value">{c.k[i]}</div><div className={'kpi-delta ' + (i === 3 ? 'down' : 'up')}>{c.d[i]}</div></div>
            </div>
          ))}
        </div>

        <div className="charts row-2a">
          <section className="panel">
            <div className="ch-head">
              <div><h2>Atendimentos por período</h2><div className="sub">{c.sub}</div></div>
              <div className="right"><span className="leg-inline"><span className="sw" style={{ background: 'var(--accent)' }} />Atendimentos</span><span className="leg-inline"><span className="sw" style={{ background: 'var(--gray-seg)' }} />Conversões</span></div>
            </div>
            <div className="ch-body" dangerouslySetInnerHTML={{ __html: areaSvg }} />
          </section>
          <section className="panel">
            <div className="ch-head"><div><h2>Distribuição de entradas</h2><div className="sub">Por canal, origem e WhatsApp de entrada</div></div></div>
            <div className="dist-tabs">{DIST_TABS.map((t) => <button key={t.t} className={curTab === t.t ? 'on' : ''} onClick={() => setCurTab(t.t)}>{t.l}</button>)}</div>
            <div className="donut-wrap">
              <div className="donut"><div dangerouslySetInnerHTML={{ __html: donutSvg }} /><div className="center"><span className="big">{fmt(distTotal)}</span><span className="cap">leads</span></div></div>
              <div className="legend">
                {distData.map((d) => {
                  const pct = (d.q / distTotal * 100).toFixed(1).replace('.', ',') + '%';
                  const cls = 'li' + (selName ? (d.ln === selName ? ' sel' : ' dim') : '');
                  return <div className={cls} key={d.ln} onClick={() => clickLegend(d)}><span className="sw" style={{ background: d.color }} /><span className="ln">{d.ln}{d.sub && <span style={{ color: 'var(--muted)', fontWeight: 500 }}> {d.sub}</span>}</span><span className="lq">{fmt(d.q)}</span><span className="lv">{pct}</span></div>;
                })}
              </div>
            </div>
          </section>
        </div>

        <div className="charts row-2b">
          <section className="panel">
            <div className="ch-head"><div><h2>Receita recuperada por mês</h2><div className="sub">Em R$ — últimos 12 meses</div></div></div>
            <div className="ch-body" dangerouslySetInnerHTML={{ __html: barSvg }} />
          </section>
          <section className="panel">
            <div className="ch-head"><div><h2>Desempenho por responsável</h2><div className="sub">Ranking no período</div></div></div>
            <div style={{ padding: '8px 8px 6px' }}>
              <table className="rep-table" aria-label="Desempenho por responsável">
                <colgroup><col className="rc-resp" /><col className="rc-atend" /><col className="rc-conv" /><col className="rc-rec" /></colgroup>
                <thead><tr><th className="rc-id">Responsável</th><th className="rc-center">Atendimentos</th><th className="rc-center">Conversão</th><th className="rc-center">Receita</th></tr></thead>
                <tbody>
                  {REP.map((r) => (
                    <tr key={r.nome}>
                      <td><div className="rep-cell"><span className="av" style={{ background: avColor(r.nome) }}>{initials(r.nome)}</span><span className="rname">{r.nome}</span></div></td>
                      <td><div className="rep-center"><span className="rep-num">{r.atend}</span></div></td>
                      <td><div className="rep-center"><span className="rep-conv"><span className="convbar"><i style={{ width: r.conv * 2.4 + '%' }} /></span>{r.conv}%</span></div></td>
                      <td><div className="rep-center"><span className="rep-num">{r.rec}</span></div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <section className="panel" style={{ overflow: 'hidden' }}>
          <div className="ch-head"><div><h2>Desempenho por origem e WhatsApp</h2><div className="sub">Origem registrada na entrada do lead (snapshot) — não muda se o chip for remapeado</div></div></div>
          <div className="flux-scroll">
            <table className="flux-table" aria-label="Desempenho por origem e WhatsApp">
              <colgroup><col className="fc-fonte" /><col className="fc-whats" /><col className="fc-num" /><col className="fc-leads" /><col className="fc-atend" /><col className="fc-proc" /><col className="fc-contr" /><col className="fc-fech" /><col className="fc-taxa" /><col className="fc-rec" /><col className="fc-tempo" /></colgroup>
              <thead><tr><th>Fonte de aquisição</th><th>WhatsApp de entrada</th><th>Número</th><th className="column-center">Leads recebidos</th><th className="column-center">Atendimentos</th><th className="column-center">Em processo</th><th className="column-center">Contratações</th><th className="column-center">Fechados</th><th className="column-center">Taxa de conversão</th><th className="column-center">Receita recuperada</th><th className="column-center">Tempo médio de resposta</th></tr></thead>
              <tbody>
                {fluxRows.length === 0 ? (
                  <tr><td colSpan={11}><div className="fx-empty">Nenhuma origem para os filtros selecionados.</div></td></tr>
                ) : fluxRows.map((r) => (
                  <tr key={r.fonte + r.num}>
                    <td><div className="fonte-cell"><span className="dot" style={{ background: r.color }} /><span className="fname">{r.fonte}</span></div></td>
                    <td>{r.whats}</td>
                    <td><span className="fx-num">{r.num}</span></td>
                    <td className="column-center"><span className="fx-strong">{r.leads}</span></td>
                    <td className="column-center">{r.atend}</td>
                    <td className="column-center">{r.proc}</td>
                    <td className="column-center">{r.contr}</td>
                    <td className="column-center">{r.fech}</td>
                    <td className="column-center"><span className="fx-tax">{r.taxa}</span></td>
                    <td className="column-center"><span className="fx-strong">{r.rec}</span></td>
                    <td className="column-center">{r.tempo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <footer className="tc-foot">
            <span className="ft">Mostrando 1 a {fluxRows.length} de {fluxRows.length} origens</span>
            <nav className="pager" aria-label="Paginação das origens">
              <button type="button" className="pg nav" aria-label="Página anterior" onClick={() => toast('Página anterior')}><IcChevL /></button>
              <button type="button" className="pg on" aria-current="page">1</button>
              <button type="button" className="pg nav" aria-label="Próxima página" onClick={() => toast('Página seguinte')}><IcChevR /></button>
            </nav>
            <div className="perpage"><label htmlFor="fluxPer">Itens por página:</label><select id="fluxPer" onChange={(e) => toast(e.target.value + ' itens por página')}><option value="10">10</option><option value="25">25</option></select></div>
          </footer>
        </section>
      </div>
    </div>
  );
}
