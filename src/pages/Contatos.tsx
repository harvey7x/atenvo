import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useToast } from '@/hooks/useToast';
import { useContatos, useCreateContato, useUpdateContato, useDeleteContato, normalizarTelefone, telefoneValido, normalizarEmail, emailValido, type ContatoRow as Row } from '@/data/contatos';
import { useEtiquetas, useOrgUsuarios } from '@/data/atendimento';
import { corDaEtiqueta } from '@/types/atendimento';
import { Modal } from '@/components/Modal';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import './Contatos.css';

const PAL = ['#5b6ee1', '#c2693a', '#7a5bb0', '#2f8f9d', '#b0566f', '#4a7a4a', '#9d7a2f', '#3d7ab0'];
function initials(n: string) { const p = n.trim().split(/\s+/); return ((p[0] || '')[0] + ((p[1] || '')[0] || '')).toUpperCase(); }
function avColor(n: string) { if (n === 'Henrique') return '#3f6f52'; let h = 0; for (let i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) >>> 0; return PAL[h % PAL.length]; }
function Av({ n, cls }: { n: string; cls?: string }) { return <span className={'av ' + (cls || 'sm')} style={{ background: avColor(n) }}>{initials(n)}</span>; }

const ORIG: Record<string, string> = { WhatsApp: 'wa', Facebook: 'fb', 'Lead Ads': 'ads', 'Indicação': 'ind' };
const STC: Record<string, string> = { Cliente: 'ok', Lead: 'info', Negociando: 'warn', Inativo: 'neutral' };
const ORIGENS_NOVO = ['Manual', 'WhatsApp', 'Facebook'];

const IcDots = () => <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="12" cy="19" r="1.7" /></svg>;
const IcEye = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></svg>;
const IcEdit = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>;
const IcTrash = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /></svg>;
const IcChevL = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>;
const IcChevR = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>;
const IcSearch = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3-3" /></svg>;
const IcFilter = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 5h18l-7 8v5l-4 2v-7z" /></svg>;
const IcExport = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12M8 11l4 4 4-4M5 21h14" /></svg>;
const IcPlus = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>;
const IcX = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>;

function Origem({ o }: { o: string }) { return <span className={'tag ' + (ORIG[o] || 'ind')}>{o}</span>; }
function Status({ s }: { s: string }) { return <span className={'st ' + (STC[s] || 'neutral')}>{s === 'Cliente' && <span className="dot" />}{s}</span>; }
function Responsavel({ nome }: { nome: string }) {
  if (!nome || nome === '—') return <span className="resp-none">Não atribuído</span>;
  return <span className="resp-line"><Av n={nome} cls="sm" /><span className="rname">{nome}</span></span>;
}
function fmtData(iso?: string) { if (!iso) return ''; const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('pt-BR'); }
function hojeArquivo() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function csvCell(v: unknown) { const s = (v ?? '').toString(); return /[",\n\r;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }

const STAT_ICONS = {
  users: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="8" r="3.2" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.2a3.2 3.2 0 0 1 0 6.3M21.5 20a6.5 6.5 0 0 0-4-6" /></svg>,
  target: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r="1" /></svg>,
  check: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="m17 11 2 2 4-4" /></svg>,
  spark: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" /></svg>,
};

const PER_PAGE = 20;
type Form = { nome: string; telefone: string; email: string; cpf: string; origem: string; responsavelId: string; etiquetas: string[]; observacoes: string };
const EMPTY_FORM: Form = { nome: '', telefone: '', email: '', cpf: '', origem: 'Manual', responsavelId: '', etiquetas: [], observacoes: '' };
type Filtros = { origem: string; respId: string; semResp: boolean; etiquetas: string[]; criadoDe: string; criadoAte: string };
const EMPTY_FILTROS: Filtros = { origem: '', respId: '', semResp: false, etiquetas: [], criadoDe: '', criadoAte: '' };

export function Contatos() {
  const { toast } = useToast();
  const { data: rows = [], isLoading, isError, error } = useContatos();
  const { data: etiquetas = [] } = useEtiquetas();
  const { data: usuarios = [] } = useOrgUsuarios();
  const createContato = useCreateContato();
  const updateContato = useUpdateContato();
  const deleteContato = useDeleteContato();

  const [queryInput, setQueryInput] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [drawer, setDrawer] = useState<Row | null>(null);
  const [menu, setMenu] = useState<{ row: Row; left: number; top: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const pendingBtn = useRef<DOMRect | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const autoAbriu = useRef(false);

  // modal de contato (novo/editar)
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'novo' | 'editar'>('novo');
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);
  const [dupHit, setDupHit] = useState<Row | null>(null);
  const [emailAck, setEmailAck] = useState(false);

  // filtros + exportação + exclusão
  const [filtros, setFiltros] = useState<Filtros>(EMPTY_FILTROS);
  const [draft, setDraft] = useState<Filtros>(EMPTY_FILTROS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filtersRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);
  const [confirmDel, setConfirmDel] = useState<Row | null>(null);
  const [delBusy, setDelBusy] = useState(false);

  // debounce da busca
  useEffect(() => { const t = setTimeout(() => setQuery(queryInput), 300); return () => clearTimeout(t); }, [queryInput]);

  // deep-link: ?contato=<id> abre o registro
  useEffect(() => {
    const id = searchParams.get('contato');
    if (!id || autoAbriu.current || rows.length === 0) return;
    const alvo = rows.find((r) => r.id === id);
    if (alvo) { autoAbriu.current = true; setDrawer(alvo); const next = new URLSearchParams(searchParams); next.delete('contato'); setSearchParams(next, { replace: true }); }
  }, [rows, searchParams, setSearchParams]);

  const activeFilters = (filtros.origem ? 1 : 0) + (filtros.respId ? 1 : 0) + (filtros.semResp ? 1 : 0) + (filtros.etiquetas.length ? 1 : 0) + (filtros.criadoDe ? 1 : 0) + (filtros.criadoAte ? 1 : 0);
  const origensDisp = useMemo(() => Array.from(new Set(rows.map((r) => r.org).filter((o) => o && o !== '—'))).sort(), [rows]);

  const filtered = useMemo(() => rows.filter((r) => {
    const q = query.trim().toLowerCase();
    if (q) {
      const hay = (r.nome + ' ' + r.email + ' ' + r.tel + ' ' + r.resp).toLowerCase();
      const qDig = q.replace(/\D/g, '');
      const telDig = (r.tel || '').replace(/\D/g, '');
      if (!hay.includes(q) && !(qDig.length >= 3 && telDig.includes(qDig))) return false;
    }
    if (filtros.origem && r.org !== filtros.origem) return false;
    if (filtros.semResp && r.respId) return false;
    if (filtros.respId && r.respId !== filtros.respId) return false;
    if (filtros.etiquetas.length && !filtros.etiquetas.every((t) => r.tags.includes(t))) return false;
    const dia = (r.criadoEm || '').slice(0, 10);
    if (filtros.criadoDe && dia && dia < filtros.criadoDe) return false;
    if (filtros.criadoAte && dia && dia > filtros.criadoAte) return false;
    return true;
  }), [rows, query, filtros]);

  // reseta página ao mudar busca/filtros
  useEffect(() => { setPage(1); }, [query, filtros]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const pageSafe = Math.min(page, pageCount);
  const pageRows = filtered.slice((pageSafe - 1) * PER_PAGE, pageSafe * PER_PAGE);

  const totalContatos = rows.length;
  const totalLeads = rows.filter((r) => r.st === 'Lead').length;
  const totalClientes = rows.filter((r) => r.st === 'Cliente').length;
  const buscaAtiva = query.trim() !== '' || activeFilters > 0;
  const footTxt = buscaAtiva ? `${filtered.length} resultado${filtered.length === 1 ? '' : 's'}` : `Mostrando ${totalContatos} contato${totalContatos === 1 ? '' : 's'}`;

  useLayoutEffect(() => {
    if (!menu || !menuRef.current || !pendingBtn.current) return;
    const rc = pendingBtn.current; const pw = menuRef.current.offsetWidth;
    setMenu((m) => m && ({ ...m, left: Math.min(rc.right - pw, window.innerWidth - pw - 10), top: rc.bottom + 6 }));
    pendingBtn.current = null;
  }, [menu?.row]); // eslint-disable-line

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setMenu(null);
      if (filtersRef.current && !filtersRef.current.contains(e.target as Node)) setFiltersOpen(false);
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') { setMenu(null); setDrawer(null); setFiltersOpen(false); } }
    function onResize() { setMenu(null); }
    document.addEventListener('click', onDoc); document.addEventListener('keydown', onKey); window.addEventListener('resize', onResize);
    return () => { document.removeEventListener('click', onDoc); document.removeEventListener('keydown', onKey); window.removeEventListener('resize', onResize); };
  }, []);

  function openMenu(e: React.MouseEvent, r: Row) {
    e.stopPropagation();
    const rc = (e.currentTarget as HTMLElement).getBoundingClientRect();
    if (menu && menu.row === r) { setMenu(null); return; }
    pendingBtn.current = rc; setMenu({ row: r, left: -9999, top: -9999 });
  }

  function abrirNovo() { setModalMode('novo'); setEditId(null); setForm(EMPTY_FORM); setFormErr(null); setDupHit(null); setEmailAck(false); setModalOpen(true); }
  function abrirEditar(r: Row) {
    setModalMode('editar'); setEditId(r.id);
    setForm({ nome: r.nome, telefone: r.tel, email: r.email, cpf: r.cpf || '', origem: (r.org && r.org !== '—') ? r.org : 'Manual', responsavelId: r.respId || '', etiquetas: [...r.tags], observacoes: r.obs || '' });
    setFormErr(null); setDupHit(null); setEmailAck(false); setModalOpen(true);
  }
  function abrirDup() { if (dupHit) { setModalOpen(false); setDrawer(dupHit); } }

  async function salvar() {
    if (saving) return;
    const nome = form.nome.trim();
    if (!nome) { setFormErr('Informe o nome do contato.'); setDupHit(null); return; }
    if (form.telefone.trim() && !telefoneValido(form.telefone)) { setFormErr('Telefone inválido.'); setDupHit(null); return; }
    if (form.email.trim() && !emailValido(form.email)) { setFormErr('E-mail inválido.'); setDupHit(null); return; }
    const telN = normalizarTelefone(form.telefone);
    const emailN = normalizarEmail(form.email);
    if (telN) {
      const ja = rows.find((r) => r.id !== editId && normalizarTelefone(r.tel) === telN);
      if (ja) { setDupHit(ja); setFormErr('Já existe um contato com estes dados.'); return; }
    }
    if (emailN && !emailAck) {
      const ja = rows.find((r) => r.id !== editId && normalizarEmail(r.email) === emailN);
      if (ja) { setDupHit(ja); setEmailAck(true); setFormErr('Já existe um contato com este e-mail. Clique novamente para salvar mesmo assim.'); return; }
    }
    setSaving(true); setFormErr(null);
    try {
      const cpf = form.cpf.replace(/\D/g, '');
      if (modalMode === 'novo') {
        await createContato.mutateAsync({ nome, telefone: telN || undefined, email: emailN || undefined, cpf: cpf || undefined, origem: form.origem || undefined, responsavelId: form.responsavelId || null, etiquetas: form.etiquetas, observacoes: form.observacoes.trim() || undefined });
      } else {
        await updateContato.mutateAsync({ id: editId!, nome, telefone: telN || null, email: emailN || null, cpf: cpf || null, origem: form.origem || null, responsavelId: form.responsavelId || null, etiquetas: form.etiquetas, observacoes: form.observacoes.trim() || null });
      }
      setModalOpen(false);
      toast(modalMode === 'novo' ? 'Contato criado' : 'Contato atualizado');
    } catch {
      setFormErr('Não foi possível salvar o contato.');
    } finally { setSaving(false); }
  }

  function toggleFormEtiqueta(t: string) { setForm((f) => ({ ...f, etiquetas: f.etiquetas.includes(t) ? f.etiquetas.filter((x) => x !== t) : [...f.etiquetas, t] })); }
  function toggleDraftEtiqueta(t: string) { setDraft((d) => ({ ...d, etiquetas: d.etiquetas.includes(t) ? d.etiquetas.filter((x) => x !== t) : [...d.etiquetas, t] })); }
  function abrirFiltros() { setDraft(filtros); setFiltersOpen((v) => !v); }
  function aplicarFiltros() { setFiltros(draft); setFiltersOpen(false); }
  function limparFiltros() { setDraft(EMPTY_FILTROS); setFiltros(EMPTY_FILTROS); }

  function exportarCSV() {
    if (exporting) return;
    setExporting(true);
    try {
      const cols = ['Nome', 'Telefone', 'E-mail', 'CPF', 'Origem', 'Responsável', 'Etiquetas', 'Observações', 'Criado em', 'Atualizado em'];
      const linhas = filtered.map((r) => [r.nome, r.tel, r.email, r.cpf || '', r.org === '—' ? '' : r.org, r.resp === '—' ? '' : r.resp, (r.tags || []).join('; '), r.obs || '', fmtData(r.criadoEm), fmtData(r.atualizadoEm)].map(csvCell).join(';'));
      const csv = '﻿' + [cols.join(';'), ...linhas].join('\r\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `contatos-atenvo-${hojeArquivo()}.csv`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
      toast(`Exportação concluída (${filtered.length})`);
    } catch (e) { toast('Falha ao exportar: ' + (e as Error).message, 'warn'); }
    finally { setExporting(false); }
  }

  function pedirExcluir(r: Row) { setMenu(null); setConfirmDel(r); }
  async function confirmarExcluir() {
    if (!confirmDel || delBusy) return;
    setDelBusy(true);
    try { await deleteContato.mutateAsync(confirmDel.id); toast('Contato excluído'); setConfirmDel(null); setDrawer(null); }
    catch (e) { toast('Erro ao excluir: ' + (e as Error).message, 'warn'); }
    finally { setDelBusy(false); }
  }

  const colCount = 7;

  return (
    <div className="contatos-page">
      <div className="content">
        <div className="stats">
          <div className="stat"><span className="stat-ic green">{STAT_ICONS.users}</span><div className="stat-body"><div className="stat-label">Total de contatos</div><div className="stat-value">{totalContatos}</div><div className="stat-delta flat">Contatos da organização</div></div></div>
          <div className="stat"><span className="stat-ic blue">{STAT_ICONS.target}</span><div className="stat-body"><div className="stat-label">Leads ativos</div><div className="stat-value">{totalLeads}</div><div className="stat-delta flat">Sem comparação disponível</div></div></div>
          <div className="stat"><span className="stat-ic green">{STAT_ICONS.check}</span><div className="stat-body"><div className="stat-label">Clientes</div><div className="stat-value">{totalClientes}</div><div className="stat-delta flat">Sem comparação disponível</div></div></div>
          <div className="stat"><span className="stat-ic amber">{STAT_ICONS.spark}</span><div className="stat-body"><div className="stat-label">Novos contatos</div><div className="stat-value">{rows.filter((r) => r.criadoEm && (Date.now() - new Date(r.criadoEm).getTime()) <= 30 * 86400000).length}</div><div className="stat-delta flat">Últimos 30 dias</div></div></div>
        </div>

        <section className="panel table-card">
          <div className="tc-head">
            <h2>Todos os contatos</h2>
            <div className="right">
              <div className="filters-wrap" ref={filtersRef}>
                <button className={'btn-ghost' + (activeFilters ? ' on' : '')} aria-haspopup="dialog" aria-expanded={filtersOpen} onClick={(e) => { e.stopPropagation(); abrirFiltros(); }}><IcFilter />Filtros{activeFilters ? ` (${activeFilters})` : ''}</button>
                {filtersOpen && (
                  <div className="filters-pop" role="dialog" aria-label="Filtros de contatos" onClick={(e) => e.stopPropagation()}>
                    <div className="fp-field"><label>Origem</label><select className="atv-input" value={draft.origem} onChange={(e) => setDraft({ ...draft, origem: e.target.value })}><option value="">Todas</option>{origensDisp.map((o) => <option key={o} value={o}>{o}</option>)}</select></div>
                    <div className="fp-field"><label>Responsável</label><select className="atv-input" value={draft.respId} disabled={draft.semResp} onChange={(e) => setDraft({ ...draft, respId: e.target.value })}><option value="">Qualquer</option>{usuarios.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}</select></div>
                    <label className="fp-check"><input type="checkbox" checked={draft.semResp} onChange={(e) => setDraft({ ...draft, semResp: e.target.checked, respId: e.target.checked ? '' : draft.respId })} />Sem responsável</label>
                    <div className="fp-field"><label>Etiquetas</label><div className="fp-tags">{etiquetas.length === 0 ? <span className="fp-empty">Nenhuma etiqueta</span> : etiquetas.map((e) => { const on = draft.etiquetas.includes(e.nome); return <button key={e.id} type="button" className={'fp-tag' + (on ? ' on' : '')} style={on ? { background: e.cor + '22', color: e.cor, borderColor: e.cor + '66' } : undefined} onClick={() => toggleDraftEtiqueta(e.nome)}>{e.nome}</button>; })}</div></div>
                    <div className="fp-row"><div className="fp-field"><label>Criado de</label><input type="date" className="atv-input" value={draft.criadoDe} onChange={(e) => setDraft({ ...draft, criadoDe: e.target.value })} /></div><div className="fp-field"><label>até</label><input type="date" className="atv-input" value={draft.criadoAte} onChange={(e) => setDraft({ ...draft, criadoAte: e.target.value })} /></div></div>
                    <div className="fp-foot"><button className="btn-ghost" onClick={limparFiltros}>Limpar</button><button className="btn-primary" onClick={aplicarFiltros}>Aplicar filtros</button></div>
                  </div>
                )}
              </div>
              <button className="btn-ghost" disabled={exporting || filtered.length === 0} onClick={exportarCSV}><IcExport />{exporting ? 'Exportando…' : 'Exportar'}</button>
              <button className="btn-primary" onClick={abrirNovo} disabled={createContato.isPending}><IcPlus />Novo contato</button>
            </div>
          </div>
          <div className="tc-search">
            <IcSearch />
            <input type="text" aria-label="Buscar contatos" placeholder="Buscar por nome, email, telefone ou responsável..." value={queryInput} onChange={(e) => setQueryInput(e.target.value)} />
          </div>
          <div className="table-scroll">
            <table className="contacts-table" aria-label="Lista de contatos">
              <colgroup><col className="col-contato" /><col className="col-telefone" /><col className="col-origem" /><col className="col-responsavel" /><col className="col-status" /><col className="col-interacao" /><col className="col-acoes" /></colgroup>
              <thead><tr><th className="column-contact">Contato</th><th className="column-center">Telefone</th><th className="column-center">Origem</th><th className="column-responsible">Responsável</th><th className="column-center">Status</th><th className="column-center">Última interação</th><th className="column-center" aria-label="Ações"></th></tr></thead>
              <tbody>
                {isLoading && (<tr><td colSpan={colCount}><div className="empty-row">Carregando contatos…</div></td></tr>)}
                {isError && !isLoading && (<tr><td colSpan={colCount}><div className="empty-row error">Erro ao carregar contatos: {(error as Error)?.message}</div></td></tr>)}
                {!isLoading && !isError && filtered.length === 0 && (
                  <tr><td colSpan={colCount}>
                    {buscaAtiva
                      ? <div className="empty-row">Nenhum contato encontrado para esta busca.</div>
                      : <div className="empty-state"><div className="es-title">Nenhum contato cadastrado</div><div className="es-desc">Cadastre um contato ou aguarde uma nova conversa pelos canais conectados.</div><button className="btn-primary" onClick={abrirNovo}><IcPlus />Novo contato</button></div>}
                  </td></tr>
                )}
                {!isLoading && !isError && pageRows.map((r) => (
                  <tr key={r.id} onClick={() => setDrawer(r)}>
                    <td><div className="contact-cell"><Av n={r.nome} /><div className="c-txt"><span className="nm">{r.nome}</span><span className="em">{r.email}</span>{r.tags.length > 0 && <span className="ctags">{r.tags.slice(0, 3).map((t) => { const cor = corDaEtiqueta(t, etiquetas); return <span key={t} className="ctag" style={{ background: cor + '22', color: cor, borderColor: cor + '55' }}>{t}</span>; })}{r.tags.length > 3 && <span className="ctag more">+{r.tags.length - 3}</span>}</span>}</div></div></td>
                    <td><div className="phone-cell"><span className="phone">{r.tel}</span></div></td>
                    <td><div className="origin-cell"><Origem o={r.org} /></div></td>
                    <td><div className="responsible-cell"><Responsavel nome={r.resp} /></div></td>
                    <td><div className="status-cell"><Status s={r.st} /></div></td>
                    <td><div className="interaction-cell"><span className="ultima">{r.ult}</span></div></td>
                    <td><div className="actions-cell"><button type="button" className="row-menu" aria-label={'Ações de ' + r.nome} onClick={(e) => openMenu(e, r)}><IcDots /></button></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <footer className="tc-foot">
            <span className="ft">{footTxt}</span>
            <nav className="pager" aria-label="Paginação dos contatos">
              <button type="button" className="pg nav" aria-label="Página anterior" disabled={pageSafe <= 1} onClick={() => setPage(pageSafe - 1)}><IcChevL /></button>
              {Array.from({ length: pageCount }, (_, i) => i + 1).slice(Math.max(0, pageSafe - 3), Math.max(0, pageSafe - 3) + 5).map((n) => <button key={n} type="button" className={'pg' + (pageSafe === n ? ' on' : '')} aria-current={pageSafe === n ? 'page' : undefined} onClick={() => setPage(n)}>{n}</button>)}
              <button type="button" className="pg nav" aria-label="Próxima página" disabled={pageSafe >= pageCount} onClick={() => setPage(pageSafe + 1)}><IcChevR /></button>
            </nav>
            <div className="perpage"><span className="ft">{PER_PAGE} por página</span></div>
          </footer>
        </section>
      </div>

      {/* drawer */}
      <div className={'drawer-backdrop' + (drawer ? ' show' : '')} onClick={() => setDrawer(null)} />
      <aside className={'drawer' + (drawer ? ' show' : '')} aria-label="Detalhe do contato">
        {drawer && (<>
          <div className="drawer-head">
            <span className="av xl" style={{ background: avColor(drawer.nome) }}>{initials(drawer.nome)}</span>
            <div className="who"><div className="nm">{drawer.nome}</div><div className="em">{drawer.email}</div></div>
            <button className="drawer-x" aria-label="Fechar" onClick={() => setDrawer(null)}><IcX /></button>
          </div>
          <div className="drawer-body">
            <div className="dl-row"><div className="dl-txt"><span className="dl-label">Telefone</span><span className="dl-value">{drawer.tel || '—'}</span></div></div>
            <div className="dl-row"><div className="dl-txt"><span className="dl-label">E-mail</span><span className="dl-value">{drawer.email || '—'}</span></div></div>
            <div className="dl-row"><div className="dl-txt"><span className="dl-label">CPF</span><span className="dl-value">{drawer.cpf || '—'}</span></div></div>
            <div className="dl-row"><div className="dl-txt"><span className="dl-label">Origem</span><span className="dl-value"><Origem o={drawer.org} /></span></div></div>
            <div className="dl-row"><div className="dl-txt"><span className="dl-label">Responsável</span><span className="dl-value"><Responsavel nome={drawer.resp} /></span></div></div>
            <div className="dl-row"><div className="dl-txt"><span className="dl-label">Status</span><span className="dl-value"><Status s={drawer.st} /></span></div></div>
            <div className="dl-row"><div className="dl-txt"><span className="dl-label">Criado em</span><span className="dl-value">{fmtData(drawer.criadoEm) || '—'}</span></div></div>
            <div className="dl-row"><div className="dl-txt"><span className="dl-label">Última interação</span><span className="dl-value">{drawer.ult}</span></div></div>
            <div className="dl-row"><div className="dl-txt"><span className="dl-label">Etiquetas</span><span className="dl-value">{drawer.tags.length > 0 ? <span className="ctags">{drawer.tags.map((t) => { const cor = corDaEtiqueta(t, etiquetas); return <span key={t} className="ctag" style={{ background: cor + '22', color: cor, borderColor: cor + '55' }}>{t}</span>; })}</span> : <span style={{ color: 'var(--muted)' }}>Nenhuma</span>}</span></div></div>
            {drawer.obs && <div className="dl-row"><div className="dl-txt"><span className="dl-label">Observações</span><span className="dl-value" style={{ whiteSpace: 'pre-wrap' }}>{drawer.obs}</span></div></div>}
          </div>
          <div className="drawer-foot">
            <button className="btn-block primary" onClick={() => { const d = drawer; setDrawer(null); abrirEditar(d); }}><IcEdit />Editar contato</button>
          </div>
        </>)}
      </aside>

      {/* menu por linha */}
      {menu && (
        <div ref={menuRef} className="pop show" style={{ left: menu.left, top: menu.top }} role="menu">
          <button className="pop-item" role="menuitem" onClick={() => { setDrawer(menu.row); setMenu(null); }}><IcEye />Visualizar</button>
          <button className="pop-item" role="menuitem" onClick={() => { const r = menu.row; setMenu(null); abrirEditar(r); }}><IcEdit />Editar</button>
          <button className="pop-item danger" role="menuitem" onClick={() => pedirExcluir(menu.row)}><IcTrash />Excluir</button>
        </div>
      )}

      {/* modal novo/editar */}
      <Modal open={modalOpen} onClose={() => { if (!saving) setModalOpen(false); }} closeOnBackdrop={!saving} width={580}
        title={<div><div>{modalMode === 'novo' ? 'Novo contato' : 'Editar contato'}</div><div className="modal-sub">{modalMode === 'novo' ? 'Cadastre os dados básicos do contato.' : 'Atualize os dados do contato.'}</div></div>}
        footer={<>
          <button className="atv-btn" disabled={saving} onClick={() => setModalOpen(false)}>Cancelar</button>
          <button className="atv-btn primary" disabled={saving} onClick={salvar}>{saving ? 'Salvando…' : (modalMode === 'novo' ? 'Salvar contato' : 'Salvar')}</button>
        </>}>
        <div className="ct-form">
          <div className="ct-field"><label className="ct-label">Nome *</label><input className="atv-input" placeholder="Nome completo" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} disabled={saving} /></div>
          <div className="ct-row">
            <div className="ct-field"><label className="ct-label">Telefone</label><input className="atv-input" inputMode="tel" placeholder="(11) 99999-9999" value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} disabled={saving} /></div>
            <div className="ct-field"><label className="ct-label">CPF</label><input className="atv-input" inputMode="numeric" placeholder="000.000.000-00" value={form.cpf} onChange={(e) => setForm({ ...form, cpf: e.target.value })} disabled={saving} /></div>
          </div>
          <div className="ct-field"><label className="ct-label">E-mail</label><input className="atv-input" type="email" placeholder="contato@email.com" value={form.email} onChange={(e) => { setForm({ ...form, email: e.target.value }); setEmailAck(false); }} disabled={saving} /></div>
          <div className="ct-row">
            <div className="ct-field"><label className="ct-label">Origem</label><select className="atv-input" value={form.origem} onChange={(e) => setForm({ ...form, origem: e.target.value })} disabled={saving}>{ORIGENS_NOVO.map((o) => <option key={o} value={o}>{o}</option>)}</select></div>
            <div className="ct-field"><label className="ct-label">Responsável</label><select className="atv-input" value={form.responsavelId} onChange={(e) => setForm({ ...form, responsavelId: e.target.value })} disabled={saving}><option value="">Não atribuído</option>{usuarios.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}</select></div>
          </div>
          <div className="ct-field"><label className="ct-label">Etiquetas</label><div className="fp-tags">{etiquetas.length === 0 ? <span className="fp-empty">Nenhuma etiqueta disponível</span> : etiquetas.map((e) => { const on = form.etiquetas.includes(e.nome); return <button key={e.id} type="button" className={'fp-tag' + (on ? ' on' : '')} style={on ? { background: e.cor + '22', color: e.cor, borderColor: e.cor + '66' } : undefined} onClick={() => toggleFormEtiqueta(e.nome)} disabled={saving}>{e.nome}</button>; })}</div></div>
          <div className="ct-field"><label className="ct-label">Observações internas</label><textarea className="atv-input ct-textarea" rows={3} placeholder="Adicione observações internas sobre este contato." value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} disabled={saving} /></div>
          {formErr && <div className="ct-err">{formErr}{dupHit && <button type="button" className="ct-err-link" onClick={abrirDup}>Abrir contato existente</button>}</div>}
        </div>
      </Modal>

      <ConfirmDialog open={!!confirmDel} title="Excluir contato" destructive loading={delBusy}
        message={<>Excluir o contato <strong>{confirmDel?.nome}</strong>? Esta ação não pode ser desfeita.</>}
        confirmLabel="Excluir" onConfirm={confirmarExcluir} onCancel={() => { if (!delBusy) setConfirmDel(null); }} />
    </div>
  );
}
