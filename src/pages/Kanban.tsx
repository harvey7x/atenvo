import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { WA_REAL } from '@/data/whatsapp';
import { useEtiquetas } from '@/data/atendimento';
import { corDaEtiqueta } from '@/types/atendimento';
import { EmptyState } from '@/components/EmptyState';
import { useToast } from '@/hooks/useToast';
import { initials, avatarColor } from '@/lib/avatar';
import './Kanban.css';

interface Stage { key: string; name: string; color: string; total: number; }
interface Source { id: string; name: string; cls: string; dot: string; }
interface Hist { ic: string; bg: string; title: string; date: string; detail: string; }
interface Lead { id: string; name: string; source: string; chip: string; resp: string; ago: string; stage: string; created: string; lastAct: string; won?: boolean; etiquetas?: string[]; history: Hist[]; }

const STAGE_PALETTE = ['#3b82f6', '#19C37D', '#f59e0b', '#8b5cf6', '#0891b2', '#e11d48', '#7c3aed', '#0e9d63', '#d97706', '#64748b'];
const SRC_EXTRA = [{ cls: 'src-c1', dot: '#2563eb' }, { cls: 'src-c2', dot: '#d97706' }, { cls: 'src-c3', dot: '#0891b2' }, { cls: 'src-c4', dot: '#be185d' }];
const RESP = ['Henrique', 'Marina Lopes', 'Carlos Eduardo', 'Paula Ferreira'];
const softColor = (hex: string) => hex + '24';

const IC = {
  wa: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a9.9 9.9 0 0 0-8.5 15l-1.3 4.8 4.9-1.3A9.9 9.9 0 1 0 12 2zm4.5 12c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.6.8-.8 1-.3.1-.6 0a6.7 6.7 0 0 1-2-1.2 7.4 7.4 0 0 1-1.3-1.7c-.2-.3 0-.4.1-.5l.4-.5.3-.4v-.4l-.9-2c-.2-.5-.4-.4-.6-.5h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.6 11.6 0 0 0 4.5 3.9c.6.3 1.1.4 1.5.5a3.6 3.6 0 0 0 1.6.1 2.7 2.7 0 0 0 1.8-1.2 2.2 2.2 0 0 0 .1-1.2c0-.1-.2-.2-.5-.3z" /></svg>,
  chip: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="4" y="4" width="16" height="16" rx="3" /><rect x="9" y="9" width="6" height="6" rx="1" /><path d="M9 2v2M15 2v2M9 20v2M15 20v2M2 9h2M2 15h2M20 9h2M20 15h2" /></svg>,
  user: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="3.4" /><path d="M5 20a7 7 0 0 1 14 0" /></svg>,
  clock: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>,
  cal: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="17" rx="2.5" /><path d="M3 9h18M8 2v4M16 2v4" /></svg>,
  tag: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.6 13.4 13 21l-9-9V4h8z" /><circle cx="7.5" cy="7.5" r="1" /></svg>,
  flag: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3.5" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2" /></svg>,
  phone: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6.6 10.8a15 15 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.2.4 2.4.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 0 1 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.4 0 .8-.3 1z" /></svg>,
  doc: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /></svg>,
  check: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg>,
  edit: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>,
  close: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>,
  plus: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>,
  trash: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" /></svg>,
  search: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3-3" /></svg>,
  chev: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>,
  info: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></svg>,
  manage: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.6 13.4 13 21l-9-9V4h8z" /><circle cx="7.5" cy="7.5" r="1.2" /></svg>,
  chevL: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>,
} as const;

const histIc: Record<string, JSX.Element> = { wa: IC.wa, phone: IC.phone, doc: IC.doc, user: IC.user, tag: IC.tag };

function Av({ n, cls }: { n: string; cls?: string }) { return <span className={'av' + (cls ? ' ' + cls : '')} style={{ background: avatarColor(n) }}>{initials(n)}</span>; }

const INIT_STAGES: Stage[] = [
  { key: 'novo', name: 'Novo lead', color: '#3b82f6', total: 8 },
  { key: 'processo', name: 'Em processo', color: '#19C37D', total: 12 },
  { key: 'contratacao', name: 'Contratação', color: '#f59e0b', total: 6 },
  { key: 'fechado', name: 'Fechado', color: '#8b5cf6', total: 15 },
];
const INIT_SOURCES: Source[] = [
  { id: 's1', name: 'Sistema URA', cls: 'src-ura', dot: '#0f766e' },
  { id: 's2', name: 'Tráfego 1', cls: 'src-t1', dot: '#0e9d63' },
  { id: 's3', name: 'Tráfego 2', cls: 'src-t2', dot: '#7c5cd6' },
];
function genHistory(l: Omit<Lead, 'history'>): Hist[] {
  if (l.id === 'l1') return [
    { ic: 'phone', bg: 'var(--st-fech)', title: 'Lead recebido via Sistema URA', date: 'Hoje, 09:21', detail: 'Origem: Sistema URA · Chip (11) 97777-9012' },
    { ic: 'wa', bg: 'var(--st-proc)', title: 'Mensagem enviada', date: 'Hoje, 09:23', detail: 'Henrique: Olá, Antônio! Tudo bem?' },
    { ic: 'doc', bg: '#94a3b8', title: 'Dados do lead atualizados', date: 'Hoje, 09:25', detail: 'Campo "Responsável" atualizado para Henrique' },
    { ic: 'phone', bg: 'var(--st-proc)', title: 'Ligação realizada', date: 'Hoje, 09:28', detail: 'Duração: 02:34' },
  ];
  const via = l.source;
  return [
    { ic: l.source === 'Sistema URA' ? 'phone' : 'tag', bg: 'var(--st-fech)', title: 'Lead recebido via ' + via, date: l.ago, detail: 'Origem: ' + l.source + ' · Chip ' + l.chip },
    { ic: 'user', bg: '#94a3b8', title: 'Atribuído a ' + l.resp, date: l.ago, detail: 'Responsável definido para ' + l.resp },
  ];
}
const RAW_LEADS: Omit<Lead, 'history'>[] = [
  { id: 'l1', name: 'Antônio César', source: 'Sistema URA', chip: '(11) 97777-9012', resp: 'Henrique', ago: 'Há 5 min', stage: 'novo', created: 'Hoje, 09:21', lastAct: 'Hoje, 09:21', etiquetas: ['Revisão de contrato', 'Juros abusivos'] },
  { id: 'l2', name: 'Paula Ferreira', source: 'Tráfego 1', chip: '(11) 96666-1122', resp: 'Marina Lopes', ago: 'Há 12 min', stage: 'novo', created: 'Hoje, 09:14', lastAct: 'Hoje, 09:18' },
  { id: 'l3', name: 'Bruno Lima', source: 'Tráfego 2', chip: '(11) 95555-3344', resp: 'Carlos Eduardo', ago: 'Há 18 min', stage: 'novo', created: 'Hoje, 09:08', lastAct: 'Hoje, 09:12' },
  { id: 'l4', name: 'Marina Lopes', source: 'Tráfego 2', chip: '(11) 98888-4455', resp: 'Marina Lopes', ago: 'Há 25 min', stage: 'processo', created: 'Hoje, 08:55', lastAct: 'Hoje, 09:01', etiquetas: ['Documentação'] },
  { id: 'l5', name: 'Juliana M.', source: 'Sistema URA', chip: '(11) 97777-2288', resp: 'Henrique', ago: 'Há 32 min', stage: 'processo', created: 'Hoje, 08:48', lastAct: 'Hoje, 08:59' },
  { id: 'l6', name: 'Rafael Souza', source: 'Tráfego 1', chip: '(11) 94444-5566', resp: 'Paula Ferreira', ago: 'Há 45 min', stage: 'processo', created: 'Hoje, 08:35', lastAct: 'Hoje, 08:50' },
  { id: 'l7', name: 'Carlos Eduardo', source: 'Tráfego 1', chip: '(11) 93333-6677', resp: 'Carlos Eduardo', ago: 'Há 1 h', stage: 'contratacao', created: 'Hoje, 08:20', lastAct: 'Hoje, 08:45' },
  { id: 'l8', name: 'Paula Ferreira', source: 'Tráfego 2', chip: '(11) 92222-7788', resp: 'Marina Lopes', ago: 'Há 1 h 20 min', stage: 'contratacao', created: 'Hoje, 08:00', lastAct: 'Hoje, 08:30' },
  { id: 'l9', name: 'Bruno Lima', source: 'Tráfego 1', chip: '(11) 91111-8899', resp: 'Henrique', ago: 'Há 2 h', stage: 'fechado', won: true, created: 'Hoje, 07:15', lastAct: 'Hoje, 08:10' },
  { id: 'l10', name: 'Marina Lopes', source: 'Sistema URA', chip: '(11) 90000-1122', resp: 'Carlos Eduardo', ago: 'Há 3 h', stage: 'fechado', won: true, created: 'Hoje, 06:30', lastAct: 'Hoje, 07:40' },
  { id: 'l11', name: 'Antônio César', source: 'Tráfego 2', chip: '(11) 93333-2211', resp: 'Paula Ferreira', ago: 'Há 5 h', stage: 'fechado', won: true, created: 'Hoje, 04:50', lastAct: 'Hoje, 06:20' },
];
const INIT_LEADS: Lead[] = RAW_LEADS.map((l) => ({ ...l, history: genHistory(l) }));

const FILTERS: Record<string, string[]> = {
  resp: ['Todos', 'Henrique', 'Marina Lopes', 'Carlos Eduardo', 'Paula Ferreira'],
  origem: ['Todos', 'WhatsApp', 'Facebook', 'Sistema URA'],
  fonte: ['Todos', 'Sistema URA', 'Tráfego 1', 'Tráfego 2'],
  periodo: ['Hoje', 'Últimos 7 dias', 'Últimos 30 dias', 'Este mês'],
};
const FILTER_DEFS = [
  { key: 'resp', label: 'Responsável' },
  { key: 'origem', label: 'Origem/Canal' },
  { key: 'fonte', label: 'Fonte de aquisição' },
];

let stageSeq = 0, leadSeq = 20;

export function Kanban() {
  const { toast } = useToast();
  const { data: etiquetas = [] } = useEtiquetas();
  const [stages, setStages] = useState<Stage[]>(INIT_STAGES);
  const [leads, setLeads] = useState<Lead[]>(INIT_LEADS);
  const [sources, setSources] = useState<Source[]>(INIT_SOURCES);
  const [search, setSearch] = useState('');
  const [currentId, setCurrentId] = useState('l1');
  const [dataOpen, setDataOpen] = useState(() => (typeof window !== 'undefined' ? window.innerWidth >= 1200 : true));
  const [isMobile, setIsMobile] = useState(() => (typeof window !== 'undefined' ? window.innerWidth < 1200 : false));
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState<string | null>(null); // stage key | '__new__'
  const [newColor, setNewColor] = useState(STAGE_PALETTE[0]);
  const [hoverStage, setHoverStage] = useState<string | null>(null);
  const [filterVals, setFilterVals] = useState<Record<string, string>>({ resp: 'Todos', origem: 'Todos', fonte: 'Todos', periodo: 'Últimos 30 dias' });
  const [pop, setPop] = useState<{ kind: 'filter' | 'origens'; filterKey?: string; rect: DOMRect } | null>(null);
  const [popPos, setPopPos] = useState({ left: -9999, top: -9999 });
  const dragId = useRef<string | null>(null);
  const popRef = useRef<HTMLDivElement>(null);
  // form drafts
  const [af, setAf] = useState({ name: '', src: 'Sistema URA', chip: '', resp: 'Henrique' });
  const [asName, setAsName] = useState('');
  const [ed, setEd] = useState({ name: '', src: '', chip: '', resp: '', stage: '' });
  const [orgNew, setOrgNew] = useState('');

  const stageOf = (k: string) => stages.find((s) => s.key === k) || stages[0];
  const leadOf = (id: string) => leads.find((l) => l.id === id) || leads[0];
  const srcCls = (name: string) => sources.find((s) => s.name === name)?.cls || 'src-c1';
  const current = leadOf(currentId);

  useEffect(() => {
    function onResize() { const mob = window.innerWidth < 1200; setIsMobile(mob); if (!mob) setDataOpen(true); }
    window.addEventListener('resize', onResize); return () => window.removeEventListener('resize', onResize);
  }, []);
  useLayoutEffect(() => {
    if (!pop || !popRef.current) return;
    const el = popRef.current; const pw = el.offsetWidth; const r = pop.rect;
    setPopPos({ left: Math.max(10, Math.min(r.left, window.innerWidth - pw - 10)), top: r.bottom + 6 });
  }, [pop]);
  useEffect(() => {
    function onDoc(e: MouseEvent) { if (popRef.current?.contains(e.target as Node)) return; if ((e.target as HTMLElement).closest('.tb-filter,.tb-date,.tb-manage')) return; setPop(null); }
    function onResize() { setPop(null); }
    document.addEventListener('click', onDoc); window.addEventListener('resize', onResize);
    return () => { document.removeEventListener('click', onDoc); window.removeEventListener('resize', onResize); };
  }, []);

  function openDetail(id: string) { setCurrentId(id); setEditing(false); setDataOpen(true); }
  function moveLead(id: string, to: string) {
    setLeads((cur) => cur.map((l) => l.id === id ? { ...l, stage: to, won: to === 'fechado', ago: 'Agora' } : l));
    setStages((cur) => { const from = leadOf(id).stage; if (from === to) return cur; return cur.map((s) => s.key === from ? { ...s, total: Math.max(0, s.total - 1) } : s.key === to ? { ...s, total: s.total + 1 } : s); });
  }
  function onDrop(to: string) {
    const id = dragId.current; setHoverStage(null); if (!id) return;
    const from = leadOf(id).stage;
    if (from !== to) { moveLead(id, to); toast('Lead movido para "' + stageOf(to).name + '"'); }
    dragId.current = null;
  }
  function addLead(stageKey: string) {
    const id = 'l' + (++leadSeq);
    const nl: Lead = { id, name: af.name.trim() || 'Novo lead', source: af.src, chip: af.chip.trim() || '(11) 90000-0000', resp: af.resp, ago: 'Agora', stage: stageKey, created: 'Hoje', lastAct: 'Hoje', won: stageKey === 'fechado', history: [] };
    nl.history = genHistory(nl);
    setLeads((c) => [...c, nl]);
    setStages((c) => c.map((s) => s.key === stageKey ? { ...s, total: s.total + 1 } : s));
    setAdding(null); setAf({ name: '', src: 'Sistema URA', chip: '', resp: 'Henrique' });
    toast('Lead adicionado em "' + stageOf(stageKey).name + '"');
  }
  function createStage() {
    const name = asName.trim() || 'Nova etapa';
    setStages((c) => [...c, { key: 'st' + (++stageSeq) + '_' + Date.now(), name, color: newColor, total: 0 }]);
    setAdding(null); setAsName(''); toast('Etapa "' + name + '" adicionada');
  }
  function removeStage(key: string) {
    if (stages.length <= 1) { toast('Mantenha ao menos uma etapa'); return; }
    const idx = stages.findIndex((s) => s.key === key); const removed = stages[idx];
    const destKey = stages[idx === 0 ? 1 : 0].key; let moved = 0;
    setLeads((c) => c.map((l) => { if (l.stage === key) { moved++; return { ...l, stage: destKey, won: destKey === 'fechado' }; } return l; }));
    setStages((c) => c.filter((s) => s.key !== key));
    toast('Etapa "' + removed.name + '" removida' + (moved ? ' · ' + moved + ' lead' + (moved > 1 ? 's' : '') + ' → "' + stageOf(destKey).name + '"' : ''));
  }
  function renameStage(key: string, name: string) { setStages((c) => c.map((s) => s.key === key ? { ...s, name } : s)); }
  function saveEdit() {
    const ns = ed.stage;
    setLeads((c) => c.map((l) => l.id === currentId ? { ...l, name: ed.name.trim() || l.name, source: ed.src, chip: ed.chip.trim() || l.chip, resp: ed.resp, stage: ns, won: ns === 'fechado' } : l));
    if (ns !== current.stage) setStages((c) => c.map((s) => s.key === current.stage ? { ...s, total: Math.max(0, s.total - 1) } : s.key === ns ? { ...s, total: s.total + 1 } : s));
    setEditing(false); toast('Lead atualizado');
  }
  function startEdit() { setEd({ name: current.name, src: current.source, chip: current.chip, resp: current.resp, stage: current.stage }); setEditing(true); }
  function pickFilter(key: string, val: string) {
    setFilterVals((v) => ({ ...v, [key]: val }));
    const label = key === 'periodo' ? 'Período' : FILTER_DEFS.find((f) => f.key === key)?.label || 'Filtro';
    toast(label + ': ' + val); setPop(null);
  }
  function renameSource(id: string, nv: string) {
    const src = sources.find((s) => s.id === id)!; const old = src.name; const v = nv.trim();
    if (!v || v === old) return;
    setLeads((c) => c.map((l) => l.source === old ? { ...l, source: v } : l));
    setSources((c) => c.map((s) => s.id === id ? { ...s, name: v } : s));
    toast('Origem renomeada para "' + v + '"');
  }
  function delSource(id: string) {
    const src = sources.find((s) => s.id === id)!; const used = leads.filter((l) => l.source === src.name).length;
    if (used > 0) { toast('Origem em uso por ' + used + ' lead' + (used > 1 ? 's' : '')); return; }
    setSources((c) => c.filter((s) => s.id !== id)); toast('Origem removida');
  }
  function addSource() {
    const v = orgNew.trim(); if (!v) return;
    if (sources.some((s) => s.name === v)) { toast('Já existe uma origem com esse nome'); return; }
    const ex = SRC_EXTRA[Math.max(0, sources.length - 3) % SRC_EXTRA.length];
    setSources((c) => [...c, { id: 's' + Date.now(), name: v, cls: ex.cls, dot: ex.dot }]);
    setOrgNew(''); toast('Origem "' + v + '" adicionada');
  }

  const rootCls = 'kanban-page' + (!dataOpen && !isMobile ? ' detail-collapsed' : '') + (dataOpen && isMobile ? ' drawer-open' : '');
  const term = search.trim().toLowerCase();
  const s = stageOf(current.stage);

  if (WA_REAL) return (
    <EmptyState
      icon={<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="5" height="16" rx="1.3" /><rect x="10" y="4" width="5" height="11" rx="1.3" /><rect x="17" y="4" width="4" height="14" rx="1.3" /></svg>}
      title="Seu funil está vazio"
      text="Os leads aparecem aqui automaticamente conforme chegam pelos canais conectados (WhatsApp, Facebook). Conecte um canal em Integrações para começar."
    />
  );

  return (
    <div className={rootCls}>
      <main className="col-main">
        <div className="toolbar">
          <div className="tb-search">{IC.search}<input type="text" placeholder="Buscar leads..." value={search} onChange={(e) => setSearch(e.target.value)} /></div>
          {FILTER_DEFS.map((f) => (
            <button key={f.key} className="tb-filter" onClick={(e) => { e.stopPropagation(); setPop((p) => p?.kind === 'filter' && p.filterKey === f.key ? null : { kind: 'filter', filterKey: f.key, rect: (e.currentTarget as HTMLElement).getBoundingClientRect() }); }}>
              <span className="tbf-label">{f.label}</span><span className="tbf-val"><span className="fval">{filterVals[f.key]}</span><span className="chev">{IC.chev}</span></span>
            </button>
          ))}
          <button className="tb-date" onClick={(e) => { e.stopPropagation(); setPop((p) => p?.kind === 'filter' && p.filterKey === 'periodo' ? null : { kind: 'filter', filterKey: 'periodo', rect: (e.currentTarget as HTMLElement).getBoundingClientRect() }); }}>{IC.cal}<span className="fval">{filterVals.periodo}</span></button>
          <button className="tb-manage" title="Gerenciar origens" onClick={(e) => { e.stopPropagation(); setPop((p) => p?.kind === 'origens' ? null : { kind: 'origens', rect: (e.currentTarget as HTMLElement).getBoundingClientRect() }); }}>{IC.manage}Origens</button>
        </div>

        <div className="summary">
          {stages.map((st) => (
            <div className="sum-card" key={st.key}><div className="sum-top"><span className="dot" style={{ background: st.color }} />{st.name}</div><div className="sum-num">{st.total}<small>Leads</small></div></div>
          ))}
        </div>

        <div className="board-scroll">
          <div className="board">
            {stages.map((st) => {
              const cards = leads.filter((l) => l.stage === st.key && (!term || l.name.toLowerCase().indexOf(term) !== -1));
              return (
                <div className="column" key={st.key}>
                  <div className="col-head">
                    <span className="dot" style={{ background: st.color }} />
                    <input className="col-name" value={st.name} title="Clique para renomear" onMouseDown={(e) => e.stopPropagation()} onChange={(e) => renameStage(st.key, e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} onBlur={(e) => { if (e.target.value.trim()) toast('Coluna renomeada para "' + e.target.value.trim() + '"'); }} />
                    <button className="col-rename" title="Renomear etapa" onClick={(e) => { (e.currentTarget.parentElement?.querySelector('.col-name') as HTMLInputElement)?.select(); }}>{IC.edit}</button>
                    <button className="col-remove" title="Remover etapa" onClick={() => removeStage(st.key)}>{IC.trash}</button>
                    <span className="col-count">{st.total}</span>
                  </div>
                  <div className={'col-body' + (hoverStage === st.key ? ' drop-hover' : '')}
                    onDragOver={(e) => { e.preventDefault(); setHoverStage(st.key); }} onDragLeave={() => setHoverStage((h) => h === st.key ? null : h)} onDrop={() => onDrop(st.key)}>
                    {cards.map((l) => (
                      <div key={l.id} className={'lead-card' + (l.id === currentId ? ' active' : '')} draggable onClick={() => openDetail(l.id)}
                        onDragStart={(e) => { dragId.current = l.id; try { e.dataTransfer.effectAllowed = 'move'; } catch { /* */ } }} onDragEnd={() => { dragId.current = null; setHoverStage(null); }}>
                        <div className="lc-top"><Av n={l.name} /><div className="lc-id"><div className="lc-name">{l.name}</div><span className={'src-badge ' + srcCls(l.source)}>{l.source}</span></div></div>
                        <div className="lc-line wa">{IC.wa}Chip {l.chip}</div>
                        <div className="lc-line">{IC.user}{l.resp}</div>
                        {l.etiquetas && l.etiquetas.length > 0 && (
                          <div className="lc-tags">{l.etiquetas.map((t) => { const cor = corDaEtiqueta(t, etiquetas); return <span key={t} className="lc-tag" style={{ background: cor + '22', color: cor, borderColor: cor + '55' }}>{t}</span>; })}</div>
                        )}
                        <div className="lc-foot">{IC.clock}{l.ago}{l.won && <span className="won">{IC.check}Ganho</span>}</div>
                      </div>
                    ))}
                    {adding === st.key ? (
                      <div className="add-form">
                        <div className="mini-field"><div className="mini-label">Nome</div><input value={af.name} onChange={(e) => setAf({ ...af, name: e.target.value })} placeholder="Nome do lead" autoFocus /></div>
                        <div className="mini-field"><div className="mini-label">Origem</div><select value={af.src} onChange={(e) => setAf({ ...af, src: e.target.value })}>{sources.map((o) => <option key={o.id}>{o.name}</option>)}</select></div>
                        <div className="mini-field"><div className="mini-label">Chip / Telefone</div><input value={af.chip} onChange={(e) => setAf({ ...af, chip: e.target.value })} placeholder="(11) 90000-0000" /></div>
                        <div className="mini-field"><div className="mini-label">Responsável</div><select value={af.resp} onChange={(e) => setAf({ ...af, resp: e.target.value })}>{RESP.map((r) => <option key={r}>{r}</option>)}</select></div>
                        <div className="form-actions"><button className="btn-primary" onClick={() => addLead(st.key)}>Adicionar</button><button className="btn-ghost" onClick={() => setAdding(null)}>Cancelar</button></div>
                      </div>
                    ) : (
                      <button className="add-lead" onClick={(e) => { e.stopPropagation(); setAf({ name: '', src: sources[0]?.name || '', chip: '', resp: 'Henrique' }); setAdding(st.key); }}>{IC.plus}Adicionar lead</button>
                    )}
                  </div>
                </div>
              );
            })}
            <div className="column ghost-col">
              {adding === '__new__' ? (
                <div className="add-stage-form">
                  <div className="mini-field"><div className="mini-label">Nome da etapa</div><input value={asName} onChange={(e) => setAsName(e.target.value)} placeholder="Ex.: Pós-venda" autoFocus /></div>
                  <div className="mini-field"><div className="mini-label">Cor</div><div className="swatches">{STAGE_PALETTE.map((c) => <button key={c} className={'swatch' + (c === newColor ? ' sel' : '')} style={{ background: c }} onClick={(e) => { e.preventDefault(); setNewColor(c); }} />)}</div></div>
                  <div className="form-actions"><button className="btn-primary" onClick={createStage}>Adicionar</button><button className="btn-ghost" onClick={() => setAdding(null)}>Cancelar</button></div>
                </div>
              ) : (
                <button className="add-stage" onClick={(e) => { e.stopPropagation(); setNewColor(STAGE_PALETTE[0]); setAdding('__new__'); }}>{IC.plus}Adicionar etapa</button>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* DETALHE */}
      <aside className="detail-col">
        <div className="detail-head">
          <button className="close-btn" aria-label="Fechar" onClick={() => setDataOpen(false)}>{IC.close}</button>
          <button className="edit-detail-btn" title="Editar lead" onClick={() => editing ? setEditing(false) : startEdit()}>{IC.edit}</button>
          <div className="dh-top"><Av n={current.name} /><div><div className="dh-name">{current.name}<span className={'src-inline ' + srcCls(current.source)}>{current.source}</span></div><div className="dh-chip">{IC.wa}Chip {current.chip}</div></div></div>
        </div>
        {editing ? (
          <div className="detail-body">
            <h4 className="det-title">Editar lead</h4>
            <div className="mini-field"><div className="mini-label">Nome</div><input value={ed.name} onChange={(e) => setEd({ ...ed, name: e.target.value })} /></div>
            <div className="mini-field" style={{ marginTop: 11 }}><div className="mini-label">Origem</div><select value={ed.src} onChange={(e) => setEd({ ...ed, src: e.target.value })}>{sources.map((o) => <option key={o.id}>{o.name}</option>)}</select></div>
            <div className="mini-field" style={{ marginTop: 11 }}><div className="mini-label">Chip / Telefone</div><input value={ed.chip} onChange={(e) => setEd({ ...ed, chip: e.target.value })} /></div>
            <div className="mini-field" style={{ marginTop: 11 }}><div className="mini-label">Responsável</div><select value={ed.resp} onChange={(e) => setEd({ ...ed, resp: e.target.value })}>{RESP.map((r) => <option key={r}>{r}</option>)}</select></div>
            <div className="mini-field" style={{ marginTop: 11 }}><div className="mini-label">Etapa</div><select value={ed.stage} onChange={(e) => setEd({ ...ed, stage: e.target.value })}>{stages.map((st) => <option key={st.key} value={st.key}>{st.name}</option>)}</select></div>
            <div className="form-actions" style={{ marginTop: 15 }}><button className="btn-primary" onClick={saveEdit}>Salvar</button><button className="btn-ghost" onClick={() => setEditing(false)}>Cancelar</button></div>
          </div>
        ) : (
          <div className="detail-body">
            <h4 className="det-title">Detalhes do lead</h4>
            <div className="det-row"><span className="dk">{IC.wa}Canal</span><span className="dv">WhatsApp</span></div>
            <div className="det-row"><span className="dk">{IC.tag}Origem do lead</span><span className="dv"><span className={'src-inline ' + srcCls(current.source)}>{current.source}</span></span></div>
            <div className="det-row"><span className="dk">{IC.chip}Chip de entrada</span><span className="dv">{current.chip}</span></div>
            <div className="det-row"><span className="dk">{IC.user}Responsável</span><span className="dv"><Av n={current.resp} cls="xs" />{current.resp}</span></div>
            <div className="det-row"><span className="dk">{IC.flag}Status atual</span><span className="dv"><span className="badge-soft" style={{ background: softColor(s.color), color: s.color }}>{s.name}</span></span></div>
            {current.etiquetas && current.etiquetas.length > 0 && (
              <div className="det-row"><span className="dk">{IC.tag}Etiquetas</span><span className="dv"><span className="lc-tags">{current.etiquetas.map((t) => { const cor = corDaEtiqueta(t, etiquetas); return <span key={t} className="lc-tag" style={{ background: cor + '22', color: cor, borderColor: cor + '55' }}>{t}</span>; })}</span></span></div>
            )}
            <div className="det-row"><span className="dk">{IC.cal}Data de criação</span><span className="dv">{current.created}</span></div>
            <div className="det-row"><span className="dk">{IC.clock}Última atividade</span><span className="dv">{current.lastAct}</span></div>
            <div className="info-box">{IC.info}{current.source === 'Sistema URA' ? 'Este chip está mapeado e recebe leads automaticamente pelo Sistema URA.' : 'Lead captado por tráfego pago (' + current.source + ').'}</div>
            <div className="det-sep" />
            <h4 className="det-title">Histórico de atividades</h4>
            <div className="timeline">
              {current.history.map((h, i) => (
                <div className="tl-item" key={i}><span className="tl-ic" style={{ background: h.bg }}>{histIc[h.ic]}</span><div className="tl-title"><span className="tl-date">{h.date}</span>{h.title}</div><div className="tl-detail">{h.detail}</div></div>
              ))}
            </div>
            <button className="act-all" onClick={() => toast('Abrindo todas as atividades')}>Ver todas as atividades</button>
          </div>
        )}
      </aside>

      <button className="reopen" aria-label="Abrir detalhe" onClick={() => setDataOpen(true)}>{IC.chevL}</button>
      <div className="drawer-overlay" onClick={() => setDataOpen(false)} />

      {pop && (
        <div ref={popRef} className={'pop' + (pop.kind === 'origens' ? ' pop-org' : '')} style={{ left: popPos.left, top: popPos.top, minWidth: pop.kind === 'filter' ? pop.rect.width : undefined }}>
          {pop.kind === 'filter' && pop.filterKey && FILTERS[pop.filterKey].map((o) => (
            <button key={o} className={'pop-item' + (filterVals[pop.filterKey!] === o ? ' sel' : '')} onClick={() => pickFilter(pop.filterKey!, o)}>{o}<span className="ck">{IC.check}</span></button>
          ))}
          {pop.kind === 'origens' && (<>
            <div className="pop-head">Gerenciar origens</div>
            {sources.map((o) => (
              <div className="org-row" key={o.id}><span className="org-dot" style={{ background: o.dot }} /><input className="org-name" defaultValue={o.name} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} onBlur={(e) => renameSource(o.id, e.target.value)} /><button className="org-del" title="Remover" onClick={() => delSource(o.id)}>{IC.close}</button></div>
            ))}
            <div className="org-add"><input placeholder="Nova origem" value={orgNew} onChange={(e) => setOrgNew(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSource(); } }} /><button className="btn-primary" style={{ flex: 'none', padding: '0 14px' }} onClick={addSource}>Adicionar</button></div>
          </>)}
        </div>
      )}
    </div>
  );
}
