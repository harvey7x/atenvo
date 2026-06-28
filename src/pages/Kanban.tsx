import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrg } from '@/context/OrgContext';
import { useToast } from '@/hooks/useToast';
import { useEtiquetas, useOrgUsuarios } from '@/data/atendimento';
import { useBuscaContatos, type ContatoRow as Row } from '@/data/contatos';
import { corDaEtiqueta } from '@/types/atendimento';
import { useKanban, useOportunidadesAbertasDeContatos, useConversasDoContato, valorRelevante,
  TIPO_BENEFICIO_OPCOES as TIPO_BENEFICIO, TIPO_SERVICO_OPCOES as TIPO_SERVICO,
  STATUS_CANCEL_OPCOES as ST_CANCEL, STATUS_RESS_OPCOES as ST_RESS, rotuloDe as labelOf,
  type KColuna, type KLead } from '@/data/kanban';
import { useSearchParams } from 'react-router-dom';
import { Modal } from '@/components/Modal';
import { FichaJudicialBox } from '@/components/FichaJudicialBox';
import { useFichasStatusDeOportunidades } from '@/data/fichaJudicial';
import { initials, avatarColor } from '@/lib/avatar';
import './Kanban.css';

const PALETTE = ['#3b82f6', '#19C37D', '#f59e0b', '#8b5cf6', '#0891b2', '#e11d48', '#7c3aed', '#0e9d63', '#d97706', '#64748b'];
const fmtBRL = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
function haDe(iso?: string | null) { if (!iso) return ''; const ms = Date.now() - new Date(iso).getTime(); if (!Number.isFinite(ms) || ms < 0) return ''; const m = Math.floor(ms / 60000); if (m < 1) return 'agora'; if (m < 60) return `há ${m} min`; if (m < 1440) return `há ${Math.floor(m / 60)} h`; return `há ${Math.floor(m / 1440)} d`; }
function fmtData(s?: string | null) { if (!s) return ''; const [y, m, d] = s.split('-'); return d && m && y ? `${d}/${m}/${y}` : s; }
function fmtDataHora(iso?: string | null) { if (!iso) return ''; const dt = new Date(iso); return Number.isNaN(dt.getTime()) ? '' : dt.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
function Av({ n, cls }: { n: string; cls?: string }) { return <span className={'av' + (cls ? ' ' + cls : '')} style={{ background: avatarColor(n) }}>{initials(n)}</span>; }

// ---- domínio previdenciário (rótulos importados de @/data/kanban) ----
const canalLabel = (t: string | null) => (t === 'whatsapp' ? 'WhatsApp' : t === 'facebook' ? 'Facebook' : (t || 'Canal'));
function chipDe(l: Pick<KLead, 'canalTipo' | 'canalNome' | 'origem'>): string | null { if (l.canalNome) return canalLabel(l.canalTipo) + ' · ' + l.canalNome; return l.origem || null; }
function maskNum(n?: string | null) { if (!n) return ''; const d = n.replace(/\D/g, ''); return d.length > 4 ? '•••• ' + d.slice(-4) : d; }
function defaultsStatus(serv: string): { c: string; r: string } {
  if (serv === 'cancelamento') return { c: 'nao_iniciado', r: 'nao_se_aplica' };
  if (serv === 'ressarcimento') return { c: 'nao_se_aplica', r: 'nao_iniciado' };
  if (serv === 'cancelamento_ressarcimento') return { c: 'nao_iniciado', r: 'nao_iniciado' };
  return { c: 'nao_se_aplica', r: 'nao_se_aplica' };
}
const mostraCancel = (s: string) => s === 'cancelamento' || s === 'cancelamento_ressarcimento';
const mostraRess = (s: string) => s === 'ressarcimento' || s === 'cancelamento_ressarcimento';
function parseBRL(s: string): { ok: boolean; v: number | null } { const t = s.trim(); if (!t) return { ok: true, v: null }; const n = Number(t.replace(/\./g, '').replace(',', '.')); if (Number.isNaN(n) || n < 0) return { ok: false, v: null }; return { ok: true, v: n }; }
const brlInput = (n: number) => String(n).replace('.', ',');
function mergeTags(a: string[], b: string[]): string[] { const seen = new Set<string>(); const out: string[] = []; for (const t of [...a, ...b]) { const k = t.trim().toLowerCase(); if (k && !seen.has(k)) { seen.add(k); out.push(t); } } return out; }

const FORM0 = {
  colunaId: '', contatoId: '', conversaOrigemId: '', canalOrigemId: '', canalTipo: '', canalNome: '', canalNumero: '',
  nome: '', telefone: '', email: '', respId: '', origem: 'Manual',
  tipoBeneficio: '', tipoServico: 'analise_inicial', statusCancelamento: 'nao_se_aplica', statusRessarcimento: 'nao_se_aplica',
  numeroBeneficio: '', instituicao: '', tipoDesconto: '', dataInicioDesconto: '',
  valorDescontoMensal: '', valorRessarcimentoEstimado: '', valorRessarcido: '', valorEstimado: '',
  etiquetas: [] as string[], observacoes: '',
};

/** Combobox pesquisável de contatos (autocomplete real, sem <select>/datalist). */
function ContatoCombobox({ onSelect, onCriarNovo }: { onSelect: (c: Row) => void; onCriarNovo: () => void }) {
  const [term, setTerm] = useState('');
  const [deb, setDeb] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => { const t = setTimeout(() => setDeb(term), 300); return () => clearTimeout(t); }, [term]);
  const q = useBuscaContatos(deb);
  const results = q.data ?? [];
  const oppMap = useOportunidadesAbertasDeContatos(results.map((r) => r.id)).data ?? {};
  useEffect(() => { setActive(0); }, [deb, results.length]);
  useEffect(() => { function onDoc(e: MouseEvent) { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false); } document.addEventListener('mousedown', onDoc); return () => document.removeEventListener('mousedown', onDoc); }, []);
  const mostrar = open && deb.trim().length >= 2;
  function escolher(c: Row) { onSelect(c); setOpen(false); setTerm(''); }
  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter') { if (mostrar && results[active]) { e.preventDefault(); escolher(results[active]); } }
    else if (e.key === 'Escape') { setOpen(false); }
  }
  return (
    <div className="kb-combo" ref={wrapRef}>
      <input className="atv-input" role="combobox" aria-expanded={mostrar} aria-autocomplete="list" aria-controls="kb-combo-list" placeholder="Digite nome, telefone ou e-mail" value={term} onChange={(e) => { setTerm(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onKeyDown={onKey} autoFocus />
      {mostrar && (
        <div className="kb-combo-pop" id="kb-combo-list" role="listbox">
          {q.isLoading ? <div className="kb-combo-info">Buscando…</div>
            : q.isError ? <div className="kb-combo-info err">Erro na busca. Tente novamente.</div>
            : results.length === 0 ? (
              <div className="kb-combo-empty"><div className="kb-combo-info">Nenhum contato encontrado.</div><button type="button" className="kb-link" onMouseDown={(e) => { e.preventDefault(); onCriarNovo(); }}>Criar novo contato</button></div>
            ) : results.map((c, i) => {
              const opp = oppMap[c.id];
              return (
                <button key={c.id} type="button" role="option" aria-selected={i === active} className={'kb-combo-item' + (i === active ? ' active' : '')} onMouseEnter={() => setActive(i)} onMouseDown={(e) => { e.preventDefault(); escolher(c); }}>
                  <Av n={c.nome || c.tel || '?'} />
                  <div className="kb-ci-txt">
                    <div className="kb-ci-nome">{c.nome || 'Sem nome'}</div>
                    <div className="kb-ci-meta">{c.tel || 'Sem telefone'}{c.org && c.org !== '—' ? ' · ' + c.org : ''}{c.email ? ' · ' + c.email : ''}</div>
                    <div className={'kb-ci-opp' + (opp ? ' tem' : '')}>{opp ? ((opp.colunaNome ? opp.colunaNome + ' · ' : '') + 'oportunidade aberta') : 'Nenhuma oportunidade aberta'}</div>
                  </div>
                </button>
              );
            })}
        </div>
      )}
    </div>
  );
}

const IC = {
  search: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3-3" /></svg>,
  plus: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>,
  dots: <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="12" cy="19" r="1.7" /></svg>,
  user: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="3.4" /><path d="M5 20a7 7 0 0 1 14 0" /></svg>,
  clock: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>,
  chat: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-11.6 7.8L3 21l1.7-6.4A8.4 8.4 0 1 1 21 11.5Z" /></svg>,
} as const;

export function Kanban() {
  const { toast } = useToast();
  const { currentOrg } = useOrg();
  const podeConfig = currentOrg.role === 'admin' || currentOrg.role === 'gestor';
  const k = useKanban();
  const { data: etiquetas = [] } = useEtiquetas();
  const { data: usuarios = [] } = useOrgUsuarios();
  const navigate = useNavigate();
  const fichaStatusMap = useFichasStatusDeOportunidades(useMemo(() => k.leads.map((l) => l.id), [k.leads])).data ?? {};

  const [search, setSearch] = useState('');
  const [optim, setOptim] = useState<Record<string, string>>({}); // id -> colunaId (otimista)
  const [hover, setHover] = useState<string | null>(null);
  const dragId = useRef<string | null>(null);
  const boardScrollRef = useRef<HTMLDivElement>(null);
  const autoRaf = useRef<number | null>(null);
  const ptr = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const [menu, setMenu] = useState<{ kind: 'card' | 'col'; id: string } | null>(null);

  // modal coluna
  const [colModal, setColModal] = useState<{ mode: 'novo' | 'editar'; id?: string } | null>(null);
  const [colForm, setColForm] = useState({ nome: '', cor: PALETTE[0] });
  const [colBusy, setColBusy] = useState(false);
  const [colErr, setColErr] = useState<string | null>(null);
  // exclusão de coluna
  const [delCol, setDelCol] = useState<KColuna | null>(null);
  const [delDest, setDelDest] = useState('');
  const [delBusy, setDelBusy] = useState(false);
  // modal lead (form compartilhado novo/editar)
  const [leadModal, setLeadModal] = useState<{ mode: 'novo' | 'editar'; id?: string } | null>(null);
  const [lf, setLf] = useState({ ...FORM0 });
  const [leadBusy, setLeadBusy] = useState(false);
  const [leadErr, setLeadErr] = useState<string | null>(null);
  const [selContato, setSelContato] = useState<Row | null>(null);
  const [semVinculo, setSemVinculo] = useState(false);
  // detalhes da oportunidade
  const [detId, setDetId] = useState<string | null>(null);
  // deep-link "Ver no Kanban" (?oportunidade=<uuid>)
  const [params, setParams] = useSearchParams();
  const [destaque, setDestaque] = useState<string | null>(null);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const editLead = leadModal?.mode === 'editar' ? (k.leads.find((l) => l.id === leadModal.id) ?? null) : null;
  const detLead = detId ? (k.leads.find((l) => l.id === detId) ?? null) : null;
  const formContatoId = leadModal ? (selContato?.id || (leadModal.mode === 'editar' ? lf.contatoId : '')) : '';
  const conversas = useConversasDoContato(formContatoId || null).data ?? [];
  const clienteTags = selContato ? selContato.tags : (editLead?.contatoEtiquetas ?? []);
  const oppSelMap = useOportunidadesAbertasDeContatos(selContato ? [selContato.id] : []).data ?? {};
  const oppSel = selContato ? oppSelMap[selContato.id] : undefined;
  const bloqueado = !!(selContato && oppSel && oppSel.funilId === k.funilId);
  const podeCampos = leadModal?.mode === 'editar' || !!selContato || semVinculo;
  const vinculado = !!selContato || (leadModal?.mode === 'editar' && !!lf.contatoId);
  const mostraGenerico = lf.tipoServico === 'analise_inicial' || lf.tipoServico === 'outro' || (parseBRL(lf.valorEstimado).v ?? 0) > 0;

  // herda conversa/canal/chip/atendente da conversa mais recente ao selecionar contato (novo)
  useEffect(() => {
    if (leadModal?.mode !== 'novo' || !selContato || conversas.length === 0 || lf.conversaOrigemId) return;
    const c = conversas[0];
    setLf((f) => ({ ...f, conversaOrigemId: c.id, canalOrigemId: c.canalId || '', canalTipo: c.canalTipo || '', canalNome: c.canalNome || '', canalNumero: c.canalNumero || '', respId: f.respId || c.atendenteId || '', origem: c.canalTipo ? canalLabel(c.canalTipo) : f.origem }));
  }, [conversas, selContato, leadModal, lf.conversaOrigemId]);

  useEffect(() => {
    setOptim((m) => { const n: Record<string, string> = {}; for (const id in m) { const l = k.leads.find((x) => x.id === id); if (l && l.colunaId !== m[id]) n[id] = m[id]; } return n; });
  }, [k.leads]);
  useEffect(() => { function onDoc() { setMenu(null); } document.addEventListener('click', onDoc); return () => document.removeEventListener('click', onDoc); }, []);
  useEffect(() => () => { if (autoRaf.current != null) cancelAnimationFrame(autoRaf.current); }, []);
  // Ver no Kanban: abre detalhes + destaca + rola até o card; ignora UUID inválido com segurança.
  useEffect(() => {
    const oid = params.get('oportunidade');
    if (!oid) return;
    const valido = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(oid);
    if (valido && k.leads.some((l) => l.id === oid)) {
      setDetId(oid); setDestaque(oid);
      setTimeout(() => cardRefs.current[oid]?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60);
      const t = setTimeout(() => setDestaque(null), 2600);
      setParams((p) => { p.delete('oportunidade'); return p; }, { replace: true });
      return () => clearTimeout(t);
    }
    if (!valido) setParams((p) => { p.delete('oportunidade'); return p; }, { replace: true });
  }, [params, k.leads]); // eslint-disable-line

  const term = search.trim().toLowerCase();
  const termDig = term.replace(/\D/g, '');
  const matchBusca = (l: KLead) => {
    if (!term) return true;
    const hay = [l.nome, l.telefone, l.email, l.instituicao, l.numeroBeneficio, labelOf(TIPO_BENEFICIO, l.tipoBeneficio), labelOf(TIPO_SERVICO, l.tipoServico), l.respNome, l.canalNome, ...l.etiquetas, ...l.contatoEtiquetas].filter(Boolean).join(' ').toLowerCase();
    if (hay.includes(term)) return true;
    return termDig.length >= 3 && (l.telefone || '').replace(/\D/g, '').includes(termDig);
  };
  const colunaDoLead = (l: KLead) => optim[l.id] ?? l.colunaId;
  const leadsVisiveis = useMemo(() => k.leads.filter(matchBusca), [k.leads, term]); // eslint-disable-line
  const porColuna = (colId: string) => leadsVisiveis.filter((l) => colunaDoLead(l) === colId).sort((a, b) => a.ordem - b.ordem);
  const semResultado = term !== '' && leadsVisiveis.length === 0 && k.leads.length > 0;

  async function mover(id: string, colId: string) {
    const lead = k.leads.find((l) => l.id === id); if (!lead || lead.colunaId === colId) return;
    setOptim((m) => ({ ...m, [id]: colId }));
    try { await k.moverLead(id, colId); toast('Lead movido'); }
    catch (e) { setOptim((m) => { const n = { ...m }; delete n[id]; return n; }); toast('Falha ao mover: ' + (e as Error).message, 'warn'); }
  }
  function onDrop(colId: string) { pararAutoScroll(); const id = dragId.current; setHover(null); dragId.current = null; if (id) mover(id, colId); }

  // Auto-scroll horizontal simétrico durante o arraste (zona lateral ~80px do container visível).
  function pararAutoScroll() { if (autoRaf.current != null) { cancelAnimationFrame(autoRaf.current); autoRaf.current = null; } ptr.current = { x: 0, y: 0 }; }
  function iniciarAutoScroll() {
    if (autoRaf.current != null) return;
    const passo = () => {
      const el = boardScrollRef.current;
      if (!el || dragId.current == null) { pararAutoScroll(); return; }
      const r = el.getBoundingClientRect();
      const edge = 80, speed = 18;
      const { x, y } = ptr.current;
      if (x > 0 && y >= r.top && y <= r.bottom) {
        const max = el.scrollWidth - el.clientWidth;
        if (x < r.left + edge) el.scrollLeft = Math.max(0, el.scrollLeft - speed);
        else if (x > r.right - edge) el.scrollLeft = Math.min(max, el.scrollLeft + speed);
      }
      autoRaf.current = requestAnimationFrame(passo);
    };
    autoRaf.current = requestAnimationFrame(passo);
  }

  // ---- colunas ----
  function abrirNovaColuna() { setColForm({ nome: '', cor: PALETTE[0] }); setColErr(null); setColModal({ mode: 'novo' }); }
  function abrirEditarColuna(c: KColuna) { setColForm({ nome: c.nome, cor: c.cor }); setColErr(null); setColModal({ mode: 'editar', id: c.id }); setMenu(null); }
  async function salvarColuna() {
    if (colBusy) return; const nome = colForm.nome.trim();
    if (!nome) { setColErr('Informe o nome da coluna.'); return; }
    setColBusy(true); setColErr(null);
    try { if (colModal!.mode === 'novo') await k.criarColuna({ nome, cor: colForm.cor }); else await k.editarColuna({ id: colModal!.id!, nome, cor: colForm.cor }); setColModal(null); toast(colModal!.mode === 'novo' ? 'Coluna criada' : 'Coluna atualizada'); }
    catch (e) { setColErr('Não foi possível salvar: ' + (e as Error).message); }
    finally { setColBusy(false); }
  }
  function pedirExcluirColuna(c: KColuna) {
    setMenu(null);
    if (c.entrada) { toast('A coluna de entrada não pode ser excluída.', 'warn'); return; }
    if (k.colunas.length <= 1) { toast('O funil precisa de ao menos uma coluna ativa.', 'warn'); return; }
    setDelDest(k.colunas.find((x) => x.id !== c.id)?.id || ''); setDelCol(c);
  }
  async function confirmarExcluirColuna() {
    if (!delCol || delBusy) return;
    const temLeads = k.leads.some((l) => colunaDoLead(l) === delCol.id);
    if (temLeads && !delDest) { toast('Escolha a coluna de destino dos leads.', 'warn'); return; }
    setDelBusy(true);
    try { await k.excluirColuna(delCol.id, temLeads ? delDest : null); toast('Coluna excluída'); setDelCol(null); }
    catch (e) { toast('Falha ao excluir: ' + (e as Error).message, 'warn'); }
    finally { setDelBusy(false); }
  }

  // ---- leads ----
  function abrirNovoLead(colunaId?: string) { setLf({ ...FORM0, colunaId: colunaId || k.colunas.find((c) => c.entrada)?.id || k.colunas[0]?.id || '' }); setSelContato(null); setSemVinculo(false); setLeadErr(null); setDetId(null); setLeadModal({ mode: 'novo' }); }
  function abrirEditarLead(l: KLead) {
    setLf({
      colunaId: l.colunaId || '', contatoId: l.contatoId || '', conversaOrigemId: l.conversaOrigemId || '', canalOrigemId: l.canalOrigemId || '',
      canalTipo: l.canalTipo || '', canalNome: l.canalNome || '', canalNumero: l.canalNumero || '',
      nome: l.nome, telefone: l.telefone, email: l.email, respId: l.respId || '', origem: l.origem,
      tipoBeneficio: l.tipoBeneficio || '', tipoServico: l.tipoServico, statusCancelamento: l.statusCancelamento, statusRessarcimento: l.statusRessarcimento,
      numeroBeneficio: l.numeroBeneficio || '', instituicao: l.instituicao || '', tipoDesconto: l.tipoDesconto || '', dataInicioDesconto: l.dataInicioDesconto || '',
      valorDescontoMensal: l.valorDescontoMensal != null ? brlInput(l.valorDescontoMensal) : '', valorRessarcimentoEstimado: l.valorRessarcimentoEstimado != null ? brlInput(l.valorRessarcimentoEstimado) : '', valorRessarcido: l.valorRessarcido != null ? brlInput(l.valorRessarcido) : '', valorEstimado: l.valor != null ? brlInput(l.valor) : '',
      etiquetas: [...l.etiquetas], observacoes: l.observacoes,
    });
    setSelContato(null); setSemVinculo(false); setLeadErr(null); setMenu(null); setDetId(null); setLeadModal({ mode: 'editar', id: l.id });
  }
  function onSelContato(c: Row) { setSelContato(c); setSemVinculo(false); setLf((f) => ({ ...f, contatoId: c.id, nome: c.nome, telefone: c.tel, email: c.email, conversaOrigemId: '', canalOrigemId: '', canalTipo: '', canalNome: '', canalNumero: '', respId: '', origem: (c.org && c.org !== '—') ? c.org : 'Manual' })); }
  function onChangeServico(v: string) { const d = defaultsStatus(v); setLf((f) => ({ ...f, tipoServico: v, statusCancelamento: d.c, statusRessarcimento: d.r })); }
  function onPickConversa(id: string) { const c = conversas.find((x) => x.id === id); if (!c) { setLf((f) => ({ ...f, conversaOrigemId: '', canalOrigemId: '', canalTipo: '', canalNome: '', canalNumero: '' })); return; } setLf((f) => ({ ...f, conversaOrigemId: c.id, canalOrigemId: c.canalId || '', canalTipo: c.canalTipo || '', canalNome: c.canalNome || '', canalNumero: c.canalNumero || '', respId: c.atendenteId || f.respId, origem: c.canalTipo ? canalLabel(c.canalTipo) : f.origem })); }

  async function salvarLead() {
    if (leadBusy || bloqueado) return;
    const novo = leadModal!.mode === 'novo';
    if (novo && !selContato && !semVinculo) { setLeadErr('Selecione um contato ou escolha criar sem vínculo.'); return; }
    const nome = (selContato ? selContato.nome : lf.nome).trim();
    if (!nome) { setLeadErr('Informe o nome do beneficiário.'); return; }
    if (!lf.tipoBeneficio) { setLeadErr('Selecione o tipo de benefício.'); return; }
    if (!lf.tipoServico) { setLeadErr('Selecione o serviço solicitado.'); return; }
    if (!lf.colunaId) { setLeadErr('Selecione a etapa.'); return; }
    const vMensal = parseBRL(lf.valorDescontoMensal), vRess = parseBRL(lf.valorRessarcimentoEstimado), vPago = parseBRL(lf.valorRessarcido), vEst = parseBRL(lf.valorEstimado);
    if (!vMensal.ok || !vRess.ok || !vPago.ok || !vEst.ok) { setLeadErr('Valores inválidos: use números sem sinal negativo.'); return; }
    setLeadBusy(true); setLeadErr(null);
    const comum = {
      nome, telefone: (selContato?.tel || lf.telefone) || null, responsavelId: lf.respId || null, origem: lf.origem || null, etiquetas: lf.etiquetas,
      conversaOrigemId: lf.conversaOrigemId || null, canalOrigemId: lf.canalOrigemId || null,
      tipoBeneficio: lf.tipoBeneficio || null, tipoServico: lf.tipoServico, statusCancelamento: lf.statusCancelamento, statusRessarcimento: lf.statusRessarcimento,
      numeroBeneficio: lf.numeroBeneficio.trim() || null, instituicao: lf.instituicao.trim() || null, tipoDesconto: lf.tipoDesconto.trim() || null, dataInicioDesconto: lf.dataInicioDesconto || null,
      valorDescontoMensal: vMensal.v, valorRessarcimentoEstimado: vRess.v, valorRessarcido: vPago.v, valor: vEst.v, observacoes: lf.observacoes || null,
    };
    try {
      if (novo) await k.criarLead({ colunaId: lf.colunaId, contatoId: selContato?.id ?? null, ...comum });
      else await k.editarLead({ id: leadModal!.id!, colunaId: lf.colunaId, ...comum });
      setLeadModal(null); toast(novo ? 'Oportunidade criada' : 'Oportunidade atualizada');
    } catch (e) { const m = (e as Error).message || ''; setLeadErr(/uq_oport_aberta|duplicate key|23505/i.test(m) ? 'Este contato já possui uma oportunidade aberta neste funil.' : ('Não foi possível salvar: ' + m)); }
    finally { setLeadBusy(false); }
  }
  async function arquivar(l: KLead) { setMenu(null); try { await k.arquivarLead(l.id); toast('Lead arquivado'); } catch (e) { toast('Falha ao arquivar: ' + (e as Error).message, 'warn'); } }
  function toggleEtq(t: string) { setLf((f) => ({ ...f, etiquetas: f.etiquetas.includes(t) ? f.etiquetas.filter((x) => x !== t) : [...f.etiquetas, t] })); }
  function abrirConversa(l: KLead) { if (!l.conversaOrigemId) return; navigate(l.canalTipo === 'facebook' ? '/facebook' : '/whatsapp'); }

  // ---- estados ----
  if (k.loading) return <div className="kanban-page"><div className="kb-info">Carregando funil…</div></div>;
  if (k.isError) return <div className="kanban-page"><div className="kb-info error">Erro ao carregar o funil: {k.error?.message}</div></div>;

  const vazioFunil = k.colunas.length > 0 && k.leads.length === 0;

  return (
    <div className="kanban-page">
      {k.colunas.length === 0 ? (
        <div className="kb-empty-state">
          <span className="kb-empty-ic"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="5" height="16" rx="1.3" /><rect x="10" y="4" width="5" height="11" rx="1.3" /><rect x="17" y="4" width="4" height="14" rx="1.3" /></svg></span>
          <div className="kb-empty-title">Seu funil está vazio</div>
          <div className="kb-empty-desc">Crie a primeira coluna para começar a organizar seus leads.</div>
          {podeConfig
            ? <button type="button" className="kb-empty-btn" onClick={abrirNovaColuna}><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>Criar primeira coluna</button>
            : <div className="kb-empty-desc" style={{ marginTop: 14 }}>Peça a um administrador para configurar o funil.</div>}
        </div>
      ) : (
      <main className="col-main">
        <div className="toolbar">
          <div className="tb-search">{IC.search}<input type="text" aria-label="Buscar leads" placeholder="Buscar por nome, telefone, e-mail, benefício, serviço, instituição, responsável ou etiqueta..." value={search} onChange={(e) => setSearch(e.target.value)} /></div>
          <span className="tb-spacer" />
          {podeConfig && <button className="btn-ghost" onClick={abrirNovaColuna}>{IC.plus}Nova coluna</button>}
          <button className="btn-primary" onClick={() => abrirNovoLead()}>{IC.plus}Novo lead</button>
        </div>

        {semResultado && <div className="kb-info">Nenhum lead encontrado para “{search}”.</div>}
        {vazioFunil && !semResultado && (
          <div className="kb-empty-state kb-empty-inline">
            <div className="kb-empty-title">Nenhum lead no funil</div>
            <div className="kb-empty-desc">Novos contatos dos canais conectados aparecerão automaticamente aqui.</div>
            <div className="kb-empty-acts">
              <button type="button" className="kb-empty-btn" onClick={() => abrirNovoLead()}><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>Adicionar lead</button>
              <button type="button" className="kb-empty-btn ghost" onClick={() => navigate('/contatos')}>Abrir contatos</button>
            </div>
          </div>
        )}

        <div className="board-scroll" ref={boardScrollRef} onDragOver={(e) => { ptr.current = { x: e.clientX, y: e.clientY }; iniciarAutoScroll(); }}>
          <div className="board">
            {k.colunas.map((col) => {
              const cards = porColuna(col.id);
              const totalCount = k.leads.filter((l) => colunaDoLead(l) === col.id).length;
              return (
                <div className="column" key={col.id}>
                  <div className="col-head">
                    <span className="dot" style={{ background: col.cor }} />
                    <div className="col-htxt"><span className="col-name-st">{col.nome}{col.entrada && <span className="col-entrada-tag" title="Coluna de entrada — recebe novos leads dos canais">entrada</span>}</span><span className="col-metric">{totalCount} {totalCount === 1 ? 'lead' : 'leads'}</span></div>
                    {podeConfig && (
                      <div className="col-menu-wrap">
                        <button className="col-mbtn" aria-label={'Ações da coluna ' + col.nome} onClick={(e) => { e.stopPropagation(); setMenu(menu?.kind === 'col' && menu.id === col.id ? null : { kind: 'col', id: col.id }); }}>{IC.dots}</button>
                        {menu?.kind === 'col' && menu.id === col.id && (
                          <div className="kb-menu" onClick={(e) => e.stopPropagation()} role="menu">
                            <button className="pop-item" role="menuitem" onClick={() => abrirEditarColuna(col)}>Renomear / cor</button>
                            {!col.entrada && <button className="pop-item danger" role="menuitem" onClick={() => pedirExcluirColuna(col)}>Excluir</button>}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div className={'col-body' + (hover === col.id ? ' drop-hover' : '')}
                    onDragOver={(e) => { e.preventDefault(); setHover(col.id); }} onDragLeave={() => setHover((h) => h === col.id ? null : h)} onDrop={() => onDrop(col.id)}>
                    {cards.map((l) => {
                      const moving = optim[l.id] !== undefined;
                      const vr = valorRelevante(l);
                      const tags = mergeTags(l.contatoEtiquetas, l.etiquetas);
                      const chip = chipDe(l);
                      const subt = [l.tipoBeneficio ? labelOf(TIPO_BENEFICIO, l.tipoBeneficio) : '', labelOf(TIPO_SERVICO, l.tipoServico)].filter(Boolean).join(' · ');
                      return (
                        <div key={l.id} ref={(el) => { cardRefs.current[l.id] = el; }} className={'lead-card' + (moving ? ' moving' : '') + (destaque === l.id ? ' destaque' : '')} draggable onClick={() => setDetId(l.id)}
                          onDragStart={(e) => { dragId.current = l.id; try { e.dataTransfer.effectAllowed = 'move'; } catch { /* */ } }} onDragEnd={() => { pararAutoScroll(); dragId.current = null; setHover(null); }}>
                          <div className="lc-top">
                            <Av n={l.nome} />
                            <div className="lc-id"><div className="lc-name" title={l.nome}>{l.nome}</div>{subt && <div className="lc-sub">{subt}</div>}</div>
                            <div className="col-menu-wrap">
                              <button className="lc-mbtn" aria-label={'Ações do lead ' + l.nome} onClick={(e) => { e.stopPropagation(); setMenu(menu?.kind === 'card' && menu.id === l.id ? null : { kind: 'card', id: l.id }); }}>{IC.dots}</button>
                              {menu?.kind === 'card' && menu.id === l.id && (
                                <div className="kb-menu" onClick={(e) => e.stopPropagation()} role="menu">
                                  <button className="pop-item" role="menuitem" onClick={() => abrirEditarLead(l)}>Editar</button>
                                  <div className="kb-menu-sep">Mover para</div>
                                  {k.colunas.filter((c) => c.id !== colunaDoLead(l)).map((c) => <button key={c.id} className="pop-item" role="menuitem" onClick={() => { setMenu(null); mover(l.id, c.id); }}><span className="dot" style={{ background: c.cor }} />{c.nome}</button>)}
                                  <button className="pop-item danger" role="menuitem" onClick={() => arquivar(l)}>Arquivar</button>
                                </div>
                              )}
                            </div>
                          </div>
                          {l.instituicao && <div className="lc-line lc-inst">{l.instituicao}</div>}
                          <div className="lc-meta">
                            {chip && <span className="lc-chip" title={chip}>{chip}</span>}
                            <span className="lc-resp">{IC.user}{l.respNome || 'Não atribuído'}</span>
                          </div>
                          {vr.valor != null && <div className="lc-valor-line">{fmtBRL(vr.valor)}{vr.mensal ? ' /mês' : ''}</div>}
                          {tags.length > 0 && <div className="lc-tags" title={tags.join(', ')}>{tags.slice(0, 3).map((t) => { const cor = corDaEtiqueta(t, etiquetas); return <span key={t} className="lc-tag" style={{ background: cor + '22', color: cor, borderColor: cor + '55' }}>{t}</span>; })}{tags.length > 3 && <span className="lc-tag more">+{tags.length - 3}</span>}</div>}
                          <div className="lc-foot">{IC.clock}{haDe(l.atualizadoEm || l.criadoEm)}{fichaStatusMap[l.id] && <span className={'lc-ficha-tag ' + fichaStatusMap[l.id]}>{fichaStatusMap[l.id] === 'finalizada' ? 'Ficha finalizada' : 'Ficha em rascunho'}</span>}</div>
                        </div>
                      );
                    })}
                    {cards.length === 0 && <div className="col-empty">Sem leads</div>}
                    <button className="add-lead" onClick={(e) => { e.stopPropagation(); abrirNovoLead(col.id); }}>{IC.plus}Adicionar lead</button>
                  </div>
                </div>
              );
            })}
            {podeConfig && (
              <div className="column ghost-col"><button className="add-stage" onClick={abrirNovaColuna}>{IC.plus}Nova coluna</button></div>
            )}
          </div>
        </div>
      </main>
      )}

      {/* modal coluna */}
      <Modal open={!!colModal} onClose={() => { if (!colBusy) setColModal(null); }} closeOnBackdrop={!colBusy} width={420}
        title={colModal?.mode === 'novo' ? 'Nova coluna' : 'Editar coluna'}
        footer={<><button className="atv-btn" disabled={colBusy} onClick={() => setColModal(null)}>Cancelar</button><button className="atv-btn primary" disabled={colBusy} onClick={salvarColuna}>{colBusy ? 'Salvando…' : (colModal?.mode === 'novo' ? 'Criar coluna' : 'Salvar')}</button></>}>
        <div className="kb-form">
          <div className="kb-field"><label className="kb-label">Nome da coluna</label><input className="atv-input" placeholder="Ex.: Proposta enviada" value={colForm.nome} onChange={(e) => setColForm({ ...colForm, nome: e.target.value })} disabled={colBusy} /></div>
          <div className="kb-field"><label className="kb-label">Cor</label><div className="kb-swatches">{PALETTE.map((c) => <button key={c} type="button" aria-label={'Cor ' + c} className={'kb-swatch' + (c === colForm.cor ? ' sel' : '')} style={{ background: c }} onClick={() => setColForm({ ...colForm, cor: c })} disabled={colBusy} />)}</div></div>
          {colErr && <div className="kb-err">{colErr}</div>}
        </div>
      </Modal>

      {/* modal excluir coluna */}
      <Modal open={!!delCol} onClose={() => { if (!delBusy) setDelCol(null); }} closeOnBackdrop={!delBusy} width={440}
        title="Excluir coluna"
        footer={<><button className="atv-btn" disabled={delBusy} onClick={() => setDelCol(null)}>Cancelar</button><button className="atv-btn danger" disabled={delBusy} onClick={confirmarExcluirColuna}>{delBusy ? 'Excluindo…' : 'Excluir coluna'}</button></>}>
        <div className="kb-form">
          {delCol && k.leads.some((l) => colunaDoLead(l) === delCol.id) ? (
            <>
              <div className="atv-modal-msg">Esta coluna possui leads. Escolha para qual coluna eles devem ser movidos antes de excluir.</div>
              <div className="kb-field"><label className="kb-label">Mover leads para</label><select className="atv-input" value={delDest} onChange={(e) => setDelDest(e.target.value)} disabled={delBusy}>{k.colunas.filter((c) => c.id !== delCol.id).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></div>
            </>
          ) : <div className="atv-modal-msg">Excluir a coluna <strong>{delCol?.nome}</strong>?</div>}
        </div>
      </Modal>

      {/* modal lead (Novo/Editar — formulário compartilhado) */}
      <Modal open={!!leadModal} onClose={() => { if (!leadBusy) setLeadModal(null); }} closeOnBackdrop={!leadBusy} width={620}
        title={<div><div>{leadModal?.mode === 'novo' ? 'Novo lead' : 'Editar oportunidade'}</div><div className="kb-modal-sub">{leadModal?.mode === 'novo' ? 'Cadastre um caso previdenciário no funil.' : 'Atualize os dados do caso.'}</div></div>}
        footer={<><button className="atv-btn" disabled={leadBusy} onClick={() => setLeadModal(null)}>Cancelar</button><button className="atv-btn primary" disabled={leadBusy || bloqueado} onClick={salvarLead}>{leadBusy ? 'Salvando…' : (leadModal?.mode === 'novo' ? 'Adicionar lead' : 'Salvar')}</button></>}>
        <div className="kb-form">
          {/* Seção: Contato e origem */}
          <div className="kb-sec-h">Contato e origem</div>
          {leadModal?.mode === 'novo' ? (
            selContato ? (
              <div className="kb-selcontato">
                <div className="kb-sc-row"><Av n={selContato.nome || selContato.tel || '?'} /><div className="kb-sc-id"><div className="kb-sc-nome">{selContato.nome || 'Sem nome'}</div><div className="kb-sc-meta">{selContato.tel || 'Sem telefone'}{selContato.email ? ' · ' + selContato.email : ''}{selContato.org && selContato.org !== '—' ? ' · ' + selContato.org : ''}</div></div></div>
                {bloqueado && oppSel && (
                  <div className="kb-opp-aberta">
                    <div className="kb-opp-titulo">Este contato já possui uma oportunidade aberta neste funil.</div>
                    <div className="kb-opp-meta">Coluna: {oppSel.colunaNome || '—'} · Resp.: {oppSel.respNome || 'Não atribuído'}{oppSel.valor != null ? ' · ' + fmtBRL(oppSel.valor) : ''}{oppSel.atualizadoEm ? ' · atualizado ' + haDe(oppSel.atualizadoEm) : ''}</div>
                    <button type="button" className="kb-link" onClick={() => { setLeadModal(null); setDetId(oppSel.id); }}>Abrir oportunidade</button>
                  </div>
                )}
                <div className="kb-sc-acts"><button type="button" className="kb-link" onClick={() => setSelContato(null)}>Trocar contato</button><button type="button" className="kb-link danger" onClick={() => { setSelContato(null); setLf((f) => ({ ...f, contatoId: '', nome: '', telefone: '', email: '' })); }}>Remover</button></div>
              </div>
            ) : semVinculo ? (
              <>
                <div className="kb-row">
                  <div className="kb-field"><label className="kb-label">Nome do lead *</label><input className="atv-input" placeholder="Nome do beneficiário" value={lf.nome} onChange={(e) => setLf({ ...lf, nome: e.target.value })} disabled={leadBusy} /></div>
                  <div className="kb-field"><label className="kb-label">Telefone</label><input className="atv-input" inputMode="tel" placeholder="(11) 99999-9999" value={lf.telefone} onChange={(e) => setLf({ ...lf, telefone: e.target.value })} disabled={leadBusy} /></div>
                </div>
                <button type="button" className="kb-link" onClick={() => { setSemVinculo(false); setLf((f) => ({ ...f, nome: '', telefone: '' })); }}>Vincular a um contato existente</button>
              </>
            ) : (
              <>
                <div className="kb-field"><label className="kb-label">Pesquisar contato</label><ContatoCombobox onSelect={onSelContato} onCriarNovo={() => { setLeadModal(null); navigate('/contatos'); }} /></div>
                <button type="button" className="kb-link" onClick={() => { setSemVinculo(true); setLf((f) => ({ ...f, nome: '', telefone: '' })); }}>Criar lead sem contato vinculado</button>
              </>
            )
          ) : (
            <div className="kb-selcontato"><div className="kb-sc-row"><Av n={lf.nome} /><div className="kb-sc-id"><div className="kb-sc-nome">{lf.nome}</div><div className="kb-sc-meta">{lf.telefone || 'Sem telefone'}{lf.email ? ' · ' + lf.email : ''}</div></div></div></div>
          )}

          {podeCampos && (
            <>
              <div className="kb-row">
                {vinculado && (
                  <div className="kb-field"><label className="kb-label">Canal / chip de origem</label>
                    {conversas.length > 1 ? (
                      <select className="atv-input" value={lf.conversaOrigemId} onChange={(e) => onPickConversa(e.target.value)} disabled={leadBusy}>
                        <option value="">Selecione a conversa…</option>
                        {conversas.map((c) => <option key={c.id} value={c.id}>{canalLabel(c.canalTipo)} · {c.canalNome || '—'}{c.ultimaInteracao ? ' · ' + haDe(c.ultimaInteracao) : ''}</option>)}
                      </select>
                    ) : (
                      <input className="atv-input" readOnly value={lf.canalNome ? canalLabel(lf.canalTipo) + ' · ' + lf.canalNome : 'Sem conversa vinculada'} />
                    )}
                  </div>
                )}
                <div className="kb-field"><label className="kb-label">Responsável pelo atendimento</label><select className="atv-input" value={lf.respId} onChange={(e) => setLf({ ...lf, respId: e.target.value })} disabled={leadBusy}><option value="">Não atribuído</option>{usuarios.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}</select></div>
              </div>

              {/* Seção: Benefício */}
              <div className="kb-sec-h">Benefício</div>
              <div className="kb-row">
                <div className="kb-field"><label className="kb-label">Tipo de benefício *</label><select className="atv-input" value={lf.tipoBeneficio} onChange={(e) => setLf({ ...lf, tipoBeneficio: e.target.value })} disabled={leadBusy}><option value="">Selecione…</option>{TIPO_BENEFICIO.map(([v, lbl]) => <option key={v} value={v}>{lbl}</option>)}</select></div>
                <div className="kb-field"><label className="kb-label">Número do benefício <span className="kb-hint">(opcional)</span></label><input className="atv-input" placeholder="Ex.: 123.456.789-0" value={lf.numeroBeneficio} onChange={(e) => setLf({ ...lf, numeroBeneficio: e.target.value })} disabled={leadBusy} /></div>
              </div>
              <div className="kb-field"><label className="kb-label">Instituição, associação ou banco <span className="kb-hint">(opcional)</span></label><input className="atv-input" placeholder="Ex.: Banco Pan, BMG ou associação" value={lf.instituicao} onChange={(e) => setLf({ ...lf, instituicao: e.target.value })} disabled={leadBusy} /></div>

              {/* Seção: Serviço */}
              <div className="kb-sec-h">Serviço</div>
              <div className="kb-field"><label className="kb-label">Serviço solicitado *</label><select className="atv-input" value={lf.tipoServico} onChange={(e) => onChangeServico(e.target.value)} disabled={leadBusy}>{TIPO_SERVICO.map(([v, lbl]) => <option key={v} value={v}>{lbl}</option>)}</select></div>
              {(mostraCancel(lf.tipoServico) || mostraRess(lf.tipoServico)) && (
                <div className="kb-row">
                  {mostraCancel(lf.tipoServico) && <div className="kb-field"><label className="kb-label">Situação do cancelamento</label><select className="atv-input" value={lf.statusCancelamento} onChange={(e) => setLf({ ...lf, statusCancelamento: e.target.value })} disabled={leadBusy}>{ST_CANCEL.map(([v, lbl]) => <option key={v} value={v}>{lbl}</option>)}</select></div>}
                  {mostraRess(lf.tipoServico) && <div className="kb-field"><label className="kb-label">Situação do ressarcimento</label><select className="atv-input" value={lf.statusRessarcimento} onChange={(e) => setLf({ ...lf, statusRessarcimento: e.target.value })} disabled={leadBusy}>{ST_RESS.map(([v, lbl]) => <option key={v} value={v}>{lbl}</option>)}</select></div>}
                </div>
              )}

              {/* Seção: Dados do desconto */}
              <div className="kb-sec-h">Dados do desconto</div>
              <div className="kb-row">
                <div className="kb-field"><label className="kb-label">Tipo de desconto <span className="kb-hint">(opcional)</span></label><input className="atv-input" placeholder="Ex.: empréstimo, mensalidade associativa" value={lf.tipoDesconto} onChange={(e) => setLf({ ...lf, tipoDesconto: e.target.value })} disabled={leadBusy} /></div>
                <div className="kb-field"><label className="kb-label">Início do desconto <span className="kb-hint">(opcional)</span></label><input className="atv-input" type="date" value={lf.dataInicioDesconto} onChange={(e) => setLf({ ...lf, dataInicioDesconto: e.target.value })} disabled={leadBusy} /></div>
              </div>

              {/* Seção: Valores */}
              <div className="kb-sec-h">Valores</div>
              <div className="kb-row">
                <div className="kb-field"><label className="kb-label">Valor mensal descontado (R$)</label><input className="atv-input" inputMode="decimal" placeholder="0,00" value={lf.valorDescontoMensal} onChange={(e) => setLf({ ...lf, valorDescontoMensal: e.target.value })} disabled={leadBusy} /></div>
                <div className="kb-field"><label className="kb-label">Valor estimado do ressarcimento (R$)</label><input className="atv-input" inputMode="decimal" placeholder="0,00" value={lf.valorRessarcimentoEstimado} onChange={(e) => setLf({ ...lf, valorRessarcimentoEstimado: e.target.value })} disabled={leadBusy} /></div>
              </div>
              <div className="kb-row">
                <div className="kb-field"><label className="kb-label">Valor já ressarcido (R$)</label><input className="atv-input" inputMode="decimal" placeholder="0,00" value={lf.valorRessarcido} onChange={(e) => setLf({ ...lf, valorRessarcido: e.target.value })} disabled={leadBusy} /></div>
                {mostraGenerico && <div className="kb-field"><label className="kb-label">Valor estimado genérico (R$)</label><input className="atv-input" inputMode="decimal" placeholder="0,00" value={lf.valorEstimado} onChange={(e) => setLf({ ...lf, valorEstimado: e.target.value })} disabled={leadBusy} /></div>}
              </div>

              {/* Seção: Organização */}
              <div className="kb-sec-h">Organização</div>
              <div className="kb-field"><label className="kb-label">Etapa</label><select className="atv-input" value={lf.colunaId} onChange={(e) => setLf({ ...lf, colunaId: e.target.value })} disabled={leadBusy}>{k.colunas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></div>
              {clienteTags.length > 0 && (
                <div className="kb-field"><label className="kb-label">Etiquetas do cliente <span className="kb-hint">(do contato, somente leitura)</span></label><div className="kb-tags ro">{clienteTags.map((t) => { const cor = corDaEtiqueta(t, etiquetas); return <span key={t} className="kb-tag-ro" style={{ background: cor + '22', color: cor, borderColor: cor + '55' }}>{t}</span>; })}</div></div>
              )}
              <div className="kb-field"><label className="kb-label">Etiquetas do caso</label><div className="kb-tags">{etiquetas.length === 0 ? <span className="kb-empty">Nenhuma etiqueta</span> : etiquetas.map((e) => { const on = lf.etiquetas.includes(e.nome); return <button key={e.id} type="button" className={'kb-tag' + (on ? ' on' : '')} style={on ? { background: e.cor + '22', color: e.cor, borderColor: e.cor + '66' } : undefined} onClick={() => toggleEtq(e.nome)} disabled={leadBusy}>{e.nome}</button>; })}</div></div>
              <div className="kb-field"><label className="kb-label">Resumo do caso</label><textarea className="atv-input kb-textarea" rows={3} placeholder="Descreva a situação do beneficiário, descontos identificados, instituição, documentos e outras informações importantes." value={lf.observacoes} onChange={(e) => setLf({ ...lf, observacoes: e.target.value })} disabled={leadBusy} /></div>
            </>
          )}
          {leadErr && <div className="kb-err">{leadErr}</div>}
        </div>
      </Modal>

      {/* drawer/modal detalhes da oportunidade */}
      <Modal open={!!detLead} onClose={() => setDetId(null)} width={520}
        title={detLead ? <div><div>{detLead.nome}</div><div className="kb-modal-sub">{[detLead.tipoBeneficio ? labelOf(TIPO_BENEFICIO, detLead.tipoBeneficio) : 'Benefício não informado', labelOf(TIPO_SERVICO, detLead.tipoServico)].filter(Boolean).join(' · ')}</div></div> : ''}
        footer={detLead ? <><button className="atv-btn" onClick={() => setDetId(null)}>Fechar</button>{detLead.conversaOrigemId && <button className="atv-btn" onClick={() => abrirConversa(detLead)}>Abrir conversa</button>}<button className="atv-btn primary" onClick={() => abrirEditarLead(detLead)}>Editar</button></> : null}>
        {detLead && (() => {
          const vr = valorRelevante(detLead);
          const tags = mergeTags(detLead.contatoEtiquetas, detLead.etiquetas);
          const coluna = k.colunas.find((c) => c.id === detLead.colunaId)?.nome || '—';
          const temValores = detLead.valorDescontoMensal != null || detLead.valorRessarcimentoEstimado != null || detLead.valorRessarcido != null || detLead.valor != null;
          const row = (lbl: string, val: React.ReactNode) => (val ? <div className="kb-det-row"><span className="kb-det-l">{lbl}</span><span className="kb-det-v">{val}</span></div> : null);
          return (
            <div className="kb-det">
              <div className="kb-sec-h">Contato</div>
              {row('Nome', detLead.nome)}
              {row('Telefone', detLead.telefone)}
              {row('E-mail', detLead.email)}
              {row('Canal / chip', detLead.canalNome ? canalLabel(detLead.canalTipo) + ' · ' + detLead.canalNome + (detLead.canalNumero ? ' · ' + maskNum(detLead.canalNumero) : '') : (detLead.origem || null))}
              {row('Responsável', detLead.respNome || 'Não atribuído')}
              <div className="kb-sec-h">Benefício e serviço</div>
              {row('Tipo de benefício', detLead.tipoBeneficio ? labelOf(TIPO_BENEFICIO, detLead.tipoBeneficio) : 'Não informado')}
              {row('Número do benefício', detLead.numeroBeneficio)}
              {row('Instituição', detLead.instituicao)}
              {row('Serviço', labelOf(TIPO_SERVICO, detLead.tipoServico))}
              {mostraCancel(detLead.tipoServico) && row('Situação do cancelamento', labelOf(ST_CANCEL, detLead.statusCancelamento))}
              {mostraRess(detLead.tipoServico) && row('Situação do ressarcimento', labelOf(ST_RESS, detLead.statusRessarcimento))}
              {row('Tipo de desconto', detLead.tipoDesconto)}
              {row('Início do desconto', fmtData(detLead.dataInicioDesconto))}
              <div className="kb-sec-h">Valores</div>
              {!temValores && <div className="kb-det-empty">Nenhum valor informado</div>}
              {row('Valor mensal descontado', detLead.valorDescontoMensal != null ? fmtBRL(detLead.valorDescontoMensal) : null)}
              {row('Valor estimado do ressarcimento', detLead.valorRessarcimentoEstimado != null ? fmtBRL(detLead.valorRessarcimentoEstimado) : null)}
              {row('Valor já ressarcido', detLead.valorRessarcido != null ? fmtBRL(detLead.valorRessarcido) : null)}
              {row('Valor estimado genérico', detLead.valor != null ? fmtBRL(detLead.valor) : null)}
              {vr.valor != null && row('Valor relevante', fmtBRL(vr.valor) + (vr.mensal ? ' /mês' : ''))}
              <div className="kb-sec-h">Organização</div>
              {row('Etapa', coluna)}
              {clienteTagsDet(detLead, etiquetas)}
              {detLead.etiquetas.length > 0 && row('Etiquetas do caso', <span className="kb-det-tags">{detLead.etiquetas.map((t) => { const cor = corDaEtiqueta(t, etiquetas); return <span key={t} className="kb-tag-ro" style={{ background: cor + '22', color: cor, borderColor: cor + '55' }}>{t}</span>; })}</span>)}
              {tags.length === 0 && row('Etiquetas', '—')}
              {row('Resumo do caso', detLead.observacoes ? <span className="kb-det-resumo">{detLead.observacoes}</span> : null)}
              <div className="kb-sec-h">Datas</div>
              {row('Criado em', fmtDataHora(detLead.criadoEm))}
              {row('Atualizado em', fmtDataHora(detLead.atualizadoEm))}
              <div className="kb-det-ficha">
                <FichaJudicialBox contatoId={detLead.contatoId} oportunidadeId={detLead.id} conversaId={detLead.conversaOrigemId} canalId={detLead.canalOrigemId}
                  responsavelSugerido={{ id: detLead.respId, nome: detLead.respNome }}
                  contatoAtual={{ nome: detLead.nome, telefone: detLead.telefone, email: detLead.email }}
                  oportunidadeAtual={{ tipoBeneficio: detLead.tipoBeneficio, numeroBeneficio: detLead.numeroBeneficio, instituicao: detLead.instituicao }} />
              </div>
            </div>
          );
        })()}
      </Modal>
    </div>
  );
}

function clienteTagsDet(l: KLead, cat: Parameters<typeof corDaEtiqueta>[1]) {
  if (l.contatoEtiquetas.length === 0) return null;
  return (
    <div className="kb-det-row"><span className="kb-det-l">Etiquetas do cliente</span><span className="kb-det-v"><span className="kb-det-tags">{l.contatoEtiquetas.map((t) => { const cor = corDaEtiqueta(t, cat); return <span key={t} className="kb-tag-ro" style={{ background: cor + '22', color: cor, borderColor: cor + '55' }}>{t}</span>; })}</span></span></div>
  );
}
