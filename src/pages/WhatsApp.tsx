import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/useToast';
import { useAuth } from '@/context/AuthContext';
import { useOrg } from '@/context/OrgContext';
import { WA_CONTACTS, WA_SCRIPTS, initials, avatarColor, type WaContact } from '@/data/whatsappDemo';
import { useWaConversations, useSendWaMessage, useWaCanais, mascararNumero, WA_REAL } from '@/data/whatsapp';
import { useStatusDefs, useEtiquetas, useAssinaturaPref, useAtendimentoActions, resolverNomeAssinatura } from '@/data/atendimento';
import { corDaEtiqueta, podeGerenciarAtendimento, type AssinaturaModo } from '@/types/atendimento';
import './WhatsApp.css';

/** Conversa vazia (placeholder) para quando ainda não há conversas reais carregadas. */
const EMPTY_CONTACT: WaContact = {
  id: '', name: 'Nenhuma conversa', phone: '', chip: '', time: '', unread: 0, tabs: [],
  status: '', statusId: null, statusCor: null, canalId: null, last: '', email: '', stage: '', resp: 'Não atribuído',
  origin: '', tags: [], lastInter: '', ultimoCanal: null, notes: '', doc: null, msgs: [],
};

/* ---------- ícones (inline, idênticos ao protótipo) ---------- */
const IcWa = () => <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a9.9 9.9 0 0 0-8.5 15l-1.3 4.8 4.9-1.3A9.9 9.9 0 1 0 12 2zm4.5 12c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.6.8-.8 1-.3.1-.6 0a6.7 6.7 0 0 1-2-1.2 7.4 7.4 0 0 1-1.3-1.7c-.2-.3 0-.4.1-.5l.4-.5.3-.4v-.4l-.9-2c-.2-.5-.4-.4-.6-.5h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.6 11.6 0 0 0 4.5 3.9c.6.3 1.1.4 1.5.5a3.6 3.6 0 0 0 1.6.1 2.7 2.7 0 0 0 1.8-1.2 2.2 2.2 0 0 0 .1-1.2c0-.1-.2-.2-.5-.3z" /></svg>;
const IcChip = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="4" y="4" width="16" height="16" rx="3" /><rect x="9" y="9" width="6" height="6" rx="1" /><path d="M9 2v2M15 2v2M9 20v2M15 20v2M2 9h2M2 15h2M20 9h2M20 15h2" /></svg>;
const IcClock = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>;
const IcChevDown = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>;
const IcDots = () => <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="12" cy="19" r="1.7" /></svg>;
const IcSearch = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3-3" /></svg>;
const IcFunnel = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 5h18l-7 8v6l-4-2v-4z" /></svg>;
const IcPaperclip = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5 12.5 20a5 5 0 0 1-7-7l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7l-8.5 8.5a1.7 1.7 0 0 1-2.4-2.4l7.8-7.8" /></svg>;
const IcMic = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>;
const IcImage = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="2.4" /><circle cx="8.5" cy="9.5" r="1.5" /><path d="m3 17 5-5 4 4 3-3 6 6" /></svg>;
const IcDoc = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h6" /></svg>;
const IcEmoji = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M8 14s1.5 2 4 2 4-2 4-2" /><path d="M9 9h.01M15 9h.01" /></svg>;
const IcScripts = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></svg>;
const IcSend = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4z" /></svg>;
const IcWarn = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /></svg>;
const IcChevRight = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>;
const IcChevLeft = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>;
const IcDownload = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12M7 11l5 4 5-4M5 21h14" /></svg>;
const IcPlus = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>;
const IcX = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>;
const IcCaret = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14 }}><path d="m6 9 6 6 6-6" /></svg>;
const IcFocus = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" /></svg>;
const IcSignet = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>;
const IcPhoneSent = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="7" y="2" width="10" height="20" rx="2.5" /><path d="M11 18h2" /></svg>;

function Avatar({ name, cls }: { name: string; cls?: string }) {
  return <span className={'av' + (cls ? ' ' + cls : '')} style={{ background: avatarColor(name) }}>{initials(name)}</span>;
}

/** Status de entrega -> rótulo/ticks. Status desconhecido/nulo NUNCA vira "entregue". */
function ackOf(status?: string): { ticks: string; cls: string; title: string } | null {
  switch (status) {
    case 'lida': return { ticks: '✓✓', cls: 'lida', title: 'Lida' };
    case 'entregue': return { ticks: '✓✓', cls: 'entregue', title: 'Entregue' };
    case 'enviada': return { ticks: '✓', cls: 'enviada', title: 'Enviada' };
    case 'pendente': return { ticks: '🕗', cls: 'pendente', title: 'Pendente' };
    case 'falhou': return { ticks: '!', cls: 'falhou', title: 'Falhou' };
    default: return null; // desconhecido: sem tick (não presumir entrega)
  }
}

const TABS: { id: string; label: string }[] = [
  { id: 'todos', label: 'Todos' },
  { id: 'meus', label: 'Meus' },
  { id: 'naoatrib', label: 'Não atribuídos' },
  { id: 'pendentes', label: 'Pendentes' },
];

const ASSINA_OPCOES: { id: AssinaturaModo; label: string }[] = [
  { id: 'sem', label: 'Sem assinatura' },
  { id: 'atendente', label: 'Nome do atendente' },
  { id: 'empresa', label: 'Nome da empresa' },
  { id: 'personalizado', label: 'Nome personalizado' },
];

const FOCO_KEY = 'atenvo-wa-foco';

type PopKind = 'filter' | 'attach' | 'scripts' | 'status' | 'tags';
interface PopState { kind: PopKind; rect: DOMRect; align: 'left' | 'right'; }

export function WhatsApp() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { currentOrg } = useOrg();
  const live = useWaConversations();
  const sendMut = useSendWaMessage();
  const canaisQ = useWaCanais();
  const statusQ = useStatusDefs();
  const etiquetasQ = useEtiquetas();
  const prefQ = useAssinaturaPref();
  const acoes = useAtendimentoActions();
  const podeGerenciar = podeGerenciarAtendimento(currentOrg.role);

  const [contacts, setContacts] = useState<WaContact[]>(() => WA_REAL ? [] : WA_CONTACTS.map((c) => ({ ...c, msgs: c.msgs.map((m) => ({ ...m })), tags: [...c.tags] })));
  const [currentId, setCurrentId] = useState(WA_REAL ? '' : 'antonio');
  const [tab, setTab] = useState('todos');
  const [search, setSearch] = useState('');
  const [replyChip, setReplyChip] = useState('Chip 1');       // modo mock
  const [replyCanalId, setReplyCanalId] = useState<string>(''); // modo real
  const [draft, setDraft] = useState('');
  const [dataOpen, setDataOpen] = useState(() => (typeof window !== 'undefined' ? window.innerWidth >= 1200 : true));
  const [isMobile, setIsMobile] = useState(() => (typeof window !== 'undefined' ? window.innerWidth < 1200 : false));
  const [pop, setPop] = useState<PopState | null>(null);
  const [popPos, setPopPos] = useState<{ left: number; top: number }>({ left: -9999, top: -9999 });

  // #8 modo de foco (persistido localmente)
  const [foco, setFoco] = useState<boolean>(() => { try { return localStorage.getItem(FOCO_KEY) === '1'; } catch { return false; } });
  const [listOpen, setListOpen] = useState(true);

  // assinatura: estado local espelhando a preferência salva
  const [assinaModo, setAssinaModo] = useState<AssinaturaModo>('sem');
  const [assinaNome, setAssinaNome] = useState('');

  const realCanais = WA_REAL ? (canaisQ.data ?? []) : [];

  // modo real: sincroniza a lista vinda do Supabase e mantém uma seleção válida
  useEffect(() => {
    if (WA_REAL && live.data) {
      setContacts(live.data);
      setCurrentId((id) => (id && live.data!.some((c) => c.id === id)) ? id : (live.data![0]?.id ?? ''));
    }
  }, [live.data]);

  // espelha preferência de assinatura
  useEffect(() => { if (prefQ.data) { setAssinaModo(prefQ.data.modo); setAssinaNome(prefQ.data.nome); } }, [prefQ.data]);

  const taRef = useRef<HTMLTextAreaElement>(null);
  const msgsRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const filterBtnRef = useRef<HTMLButtonElement>(null);
  const attachBtnRef = useRef<HTMLButtonElement>(null);
  const scriptsBtnRef = useRef<HTMLButtonElement>(null);
  const statusBtnRef = useRef<HTMLButtonElement>(null);
  const tagsBtnRef = useRef<HTMLButtonElement>(null);

  const current = contacts.find((c) => c.id === currentId) ?? contacts[0] ?? EMPTY_CONTACT;
  const filtered = contacts.filter((c) => {
    if (c.tabs.indexOf(tab) === -1) return false;
    const t = search.trim().toLowerCase();
    if (t && c.name.toLowerCase().indexOf(t) === -1 && c.last.toLowerCase().indexOf(t) === -1) return false;
    return true;
  });

  // canal selecionado para "Responder por" (modo real)
  useEffect(() => {
    if (!WA_REAL) return;
    const valido = realCanais.some((c) => c.id === replyCanalId);
    if (!valido) {
      const preferido = current.canalId && realCanais.some((c) => c.id === current.canalId)
        ? current.canalId
        : (realCanais.find((c) => c.status === 'conectado')?.id ?? realCanais[0]?.id ?? '');
      setReplyCanalId(preferido);
    }
  }, [currentId, realCanais.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const canalSel = realCanais.find((c) => c.id === replyCanalId) ?? null;
  const canalConectado = !WA_REAL || (canalSel?.status === 'conectado');
  const canalIndisponivel = WA_REAL && !!canalSel && !canalConectado;

  /* autosize textarea */
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
  }, [draft]);

  /* rolar mensagens para o fim */
  useEffect(() => {
    if (msgsRef.current) msgsRef.current.scrollTop = msgsRef.current.scrollHeight;
  }, [currentId, current.msgs.length]);

  /* responsivo: estado coerente do painel de dados */
  useEffect(() => {
    function onResize() {
      const mob = window.innerWidth < 1200;
      setIsMobile(mob);
      if (!mob) setDataOpen(true);
    }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  /* #8 foco: classe global (recolhe sidebar) + persistência + Esc para sair */
  useEffect(() => {
    try { document.body.classList.toggle('wa-foco', foco); } catch { /* ignore */ }
    try { localStorage.setItem(FOCO_KEY, foco ? '1' : '0'); } catch { /* ignore */ }
    return () => { try { document.body.classList.remove('wa-foco'); } catch { /* ignore */ } };
  }, [foco]);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      if (pop) { setPop(null); return; }
      if (foco) setFoco(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [foco, pop]);

  /* posicionar popover (mede após render, como o protótipo) */
  useLayoutEffect(() => {
    if (!pop || !popRef.current) return;
    const el = popRef.current;
    const pw = el.offsetWidth;
    const ph = el.offsetHeight;
    const r = pop.rect;
    let left = pop.align === 'right' ? r.right - pw : r.left;
    left = Math.max(10, Math.min(left, window.innerWidth - pw - 10));
    let top = r.bottom + 8;
    if (top + ph > window.innerHeight - 10) top = Math.max(10, r.top - ph - 8);
    setPopPos({ left, top });
  }, [pop]);

  /* fechar popover ao clicar fora / redimensionar */
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (popRef.current?.contains(t)) return;
      if (filterBtnRef.current?.contains(t) || attachBtnRef.current?.contains(t) || scriptsBtnRef.current?.contains(t)) return;
      if (statusBtnRef.current?.contains(t) || tagsBtnRef.current?.contains(t)) return;
      setPop(null);
    }
    function onResize() { setPop(null); }
    document.addEventListener('click', onDoc);
    window.addEventListener('resize', onResize);
    return () => { document.removeEventListener('click', onDoc); window.removeEventListener('resize', onResize); };
  }, []);

  function togglePop(kind: PopKind, ref: RefObject<HTMLButtonElement>, align: 'left' | 'right') {
    if (pop?.kind === kind) { setPop(null); return; }
    const el = ref.current;
    if (!el) return;
    setPopPos({ left: -9999, top: -9999 });
    setPop({ kind, rect: el.getBoundingClientRect(), align });
  }

  function selectContact(id: string) {
    setCurrentId(id);
    if (isMobile) setDataOpen(false);
  }

  const empresaNome = currentOrg.name ?? '';
  const atendenteNome = user?.name ?? '';
  const assinaturaNome = resolverNomeAssinatura({ modo: assinaModo, nome: assinaNome }, atendenteNome, empresaNome);

  function persistAssinatura(modo: AssinaturaModo, nome: string) {
    if (!WA_REAL) return; // mock: só estado local
    acoes.salvarAssinatura({ modo, nome }).catch((e) => toast((e as Error).message || 'Falha ao salvar assinatura', 'warn'));
  }

  function sendMsg() {
    const v = draft.trim();
    if (!v) return;
    if (WA_REAL && !currentId) return;
    if (canalIndisponivel) { toast('Este número está desconectado. Reconecte em Integrações para enviar.', 'warn'); return; }
    const now = new Date();
    const hh = ('0' + now.getHours()).slice(-2) + ':' + ('0' + now.getMinutes()).slice(-2);
    const corpo = assinaturaNome ? `*${assinaturaNome}:*\n${v}` : v;
    // append otimista (atualiza a tela imediatamente). Status "pendente" até o ack do webhook.
    setContacts((cur) => cur.map((c) => c.id === currentId ? { ...c, last: v, msgs: [...c.msgs, { dir: 'out', text: corpo, time: hh, status: 'pendente' }] } : c));
    setDraft('');
    if (WA_REAL) {
      sendMut.mutate(
        { conversaId: currentId, text: v, canalId: replyCanalId || current.canalId, assinaturaNome: assinaturaNome || undefined },
        { onError: (e) => toast((e as Error).message || 'Falha ao enviar a mensagem', 'warn') },
      );
    } else {
      toast('Mensagem enviada');
    }
  }

  function onReplyChip(chip: string) {
    const prev = replyChip;
    setReplyChip(chip);
    if (prev !== chip && chip !== 'Chip 1') toast('Atenção: ' + chip + ' pode iniciar uma nova conversa', 'warn');
    else toast('Respondendo por ' + chip);
  }
  function onReplyCanal(id: string) {
    setReplyCanalId(id);
    const c = realCanais.find((x) => x.id === id);
    if (c && current.canalId && id !== current.canalId) toast('Atenção: responder por outro número pode iniciar uma nova conversa', 'warn');
  }

  function insertScript(m: string, t: string) {
    setDraft(m);
    setPop(null);
    toast('Script inserido: ' + t);
    setTimeout(() => taRef.current?.focus(), 0);
  }

  async function aplicarStatus(statusId: string) {
    setPop(null);
    if (!current.id) return;
    setContacts((cur) => cur.map((c) => c.id === current.id ? { ...c, statusId, status: statusQ.data?.find((s) => s.id === statusId)?.nome ?? c.status, statusCor: statusQ.data?.find((s) => s.id === statusId)?.cor ?? c.statusCor } : c));
    try { await acoes.definirStatusConversa(current.id, statusId); } catch (e) { toast((e as Error).message || 'Falha ao alterar status', 'warn'); }
  }
  async function alternarEtiqueta(nome: string) {
    if (!current.id) return;
    const tem = current.tags.some((t) => t.toLowerCase() === nome.toLowerCase());
    const novas = tem ? current.tags.filter((t) => t.toLowerCase() !== nome.toLowerCase()) : [...current.tags, nome];
    setContacts((cur) => cur.map((c) => c.id === current.id ? { ...c, tags: novas } : c));
    try { await acoes.definirEtiquetasConversa(current.id, novas); } catch (e) { toast((e as Error).message || 'Falha ao salvar etiquetas', 'warn'); }
  }

  const sendDisabled = draft.trim() === '' || (WA_REAL && (!current.id || !canalConectado));
  const statusDefs = statusQ.data ?? [];
  const statusAtivos = statusDefs.filter((s) => s.ativo);
  // status do contato atual resolvido pela definição configurável (cor/nome); fallback ao rótulo legado.
  const statusDefAtual = statusDefs.find((s) => s.id === current.statusId) ?? null;
  const statusNomeAtual = statusDefAtual?.nome ?? current.status;
  const statusCorAtual = statusDefAtual?.cor ?? current.statusCor ?? null;
  const etiquetas = etiquetasQ.data ?? [];
  const etiquetasAtivas = etiquetas.filter((e) => e.ativo);

  // alias do último canal resolvido pela lista de canais
  const ultimo = current.ultimoCanal;
  const ultimoAlias = useMemo(() => {
    if (!ultimo) return null;
    return realCanais.find((c) => c.id === ultimo.canalId)?.alias ?? ultimo.alias ?? current.chip;
  }, [ultimo, realCanais, current.chip]);

  const waClass = 'wa-app'
    + (!dataOpen && !isMobile ? ' data-collapsed' : '')
    + (dataOpen && isMobile ? ' drawer-open' : '')
    + (foco ? ' foco' : '')
    + (foco && !listOpen ? ' list-hidden' : '');

  return (
    <div className={waClass}>
      {/* ---------- LISTA ---------- */}
      <section className="col list-col">
        <div className="list-head">
          <div className="lh-top">
            <span className="wa-badge"><IcWa /></span>
            <div><div className="lh-title">WhatsApp</div><div className="lh-sub">Central de Atendimento</div></div>
          </div>
          <div className="search-row">
            <div className="search">
              <IcSearch />
              <input type="text" placeholder="Buscar conversas..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <button ref={filterBtnRef} className="filter-btn" aria-label="Filtros" onClick={(e) => { e.stopPropagation(); togglePop('filter', filterBtnRef, 'left'); }}><IcFunnel /></button>
          </div>
          <div className="tabs">
            {TABS.map((t) => (
              <button key={t.id} className={'tab' + (tab === t.id ? ' active' : '')} onClick={() => setTab(t.id)}>{t.label}</button>
            ))}
          </div>
        </div>
        <div className="conv-list">
          {filtered.length === 0 ? (
            <div style={{ padding: '30px 12px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>Nenhuma conversa nesta aba.</div>
          ) : filtered.map((c) => (
            <div key={c.id} className={'conv' + (c.id === currentId ? ' active' : '')} onClick={() => selectContact(c.id)}>
              <Avatar name={c.name} />
              <div className="cbody">
                <div className="crow"><span className="cname">{c.name}</span><span className="ctime">{c.time}</span></div>
                <div className="cchip"><IcChip />{c.chip}</div>
                <div className="cprev">{c.last}</div>
                {c.tags.length > 0 && (
                  <div className="conv-tags">
                    {c.tags.slice(0, 4).map((t) => <span key={t} className="ctag-dot" title={t} style={{ background: corDaEtiqueta(t, etiquetas) }} />)}
                  </div>
                )}
              </div>
              {c.unread > 0 && <span className="unread">{c.unread}</span>}
            </div>
          ))}
        </div>
        <div className="list-foot"><button onClick={() => toast('Mostrando todas as conversas')}>Ver todas as conversas</button></div>
      </section>

      {/* ---------- CHAT ---------- */}
      <section className="col chat-col">
        <header className="chat-head">
          <div className="ch-left">
            {foco && (
              <button className="icon-btn list-toggle" title={listOpen ? 'Ocultar conversas' : 'Mostrar conversas'} onClick={() => setListOpen((v) => !v)}>
                {listOpen ? <IcChevLeft /> : <IcChevRight />}
              </button>
            )}
            <div className="ch-id">
              <Avatar name={current.name} />
              <div><div className="ch-name">{current.name}</div><div className="ch-phone">{current.phone}</div></div>
            </div>
          </div>
          <div className="ch-meta">
            <div className="meta-cell"><div className="k">Canal</div><span className="meta-val"><span style={{ color: 'var(--wa)', display: 'inline-flex' }}><IcWa /></span>WhatsApp</span></div>
            <div className="meta-cell"><div className="k">Origem</div><span className="meta-val chip-tag"><IcChip />{current.chip}</span></div>
            <div className="meta-cell"><div className="k">Status</div>
              {statusNomeAtual
                ? <span className="status-badge" style={{ background: (statusCorAtual ?? '#64748b') + '22', color: statusCorAtual ?? 'var(--ink-2)' }}><span className="sdot" style={{ background: statusCorAtual ?? '#64748b' }} />{statusNomeAtual}</span>
                : <span className="meta-val" style={{ color: 'var(--muted)' }}>—</span>}
            </div>
          </div>
          <div className="ch-actions">
            <button className={'icon-btn' + (foco ? ' on' : '')} title="Modo de foco (Esc para sair)" onClick={() => setFoco((v) => !v)}><IcFocus /></button>
            <button className="icon-btn" title="Ações" onClick={() => toast('Mais ações da conversa')}><IcDots /></button>
          </div>
        </header>

        <div className="messages" ref={msgsRef}>
          {current.msgs.map((m, i) => {
            const ack = m.dir === 'out' ? ackOf(m.status) : null;
            return (
              <div key={i} className={'msg ' + m.dir}>
                {m.pdf ? (
                  <>
                    <div className="pdf-card"><span className="pdf-ic">PDF</span><div className="pdf-info"><div className="pdf-name">{m.pdf.name}</div><div className="pdf-meta">{m.pdf.meta}</div></div></div>
                    <span className="btime">{m.time}</span>
                  </>
                ) : (
                  <>
                    <div className="bubble">{m.text}</div>
                    <span className="btime">
                      {m.viaTelefone && <span className="phone-tag" title="Enviada pelo celular"><IcPhoneSent />Enviada pelo celular</span>}
                      {m.time}
                      {ack && <span className={'tick ' + ack.cls} title={ack.title}>{ack.ticks}</span>}
                    </span>
                  </>
                )}
              </div>
            );
          })}
          <div style={{ clear: 'both' }} />
        </div>

        <div className="composer">
          <div className="reply-row">
            <span className="rl">Responder por:</span>
            {WA_REAL ? (
              realCanais.length === 0 ? (
                <span className="reply-empty">Nenhum número conectado · <button className="link-btn" onClick={() => navigate('/integracoes')}>conectar</button></span>
              ) : realCanais.map((c, idx) => (
                <span key={c.id} style={{ display: 'inline-flex', alignItems: 'center' }}>
                  {idx > 0 && <span className="chip-div">|</span>}
                  <button className={'chip-btn' + (replyCanalId === c.id ? ' active' : '') + (c.status !== 'conectado' ? ' off' : '')} title={c.status !== 'conectado' ? 'Indisponível (' + c.status + ')' : c.alias} onClick={() => onReplyCanal(c.id)}>{c.alias}</button>
                </span>
              ))
            ) : (
              <>
                <button className={'chip-btn' + (replyChip === 'Chip 1' ? ' active' : '')} onClick={() => onReplyChip('Chip 1')}>Chip 1</button><span className="chip-div">|</span>
                <button className={'chip-btn' + (replyChip === 'Chip 2' ? ' active' : '')} onClick={() => onReplyChip('Chip 2')}>Chip 2</button><span className="chip-div">|</span>
                <button className={'chip-btn' + (replyChip === 'Chip 3' ? ' active' : '')} onClick={() => onReplyChip('Chip 3')}>Chip 3</button>
              </>
            )}
          </div>

          {/* #4 Assinar como */}
          <div className="sign-row">
            <span className="rl"><IcSignet />Assinar como:</span>
            <select className="sign-sel" value={assinaModo} onChange={(e) => { const m = e.target.value as AssinaturaModo; setAssinaModo(m); persistAssinatura(m, assinaNome); }}>
              {ASSINA_OPCOES.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
            {assinaModo === 'personalizado' && (
              <input className="sign-input" placeholder="Nome na assinatura" value={assinaNome}
                onChange={(e) => setAssinaNome(e.target.value)} onBlur={() => persistAssinatura('personalizado', assinaNome)} />
            )}
            {assinaturaNome && <span className="sign-preview">*{assinaturaNome}:*</span>}
          </div>

          {canalIndisponivel ? (
            <div className="warn warn-block">
              <IcWarn />Este número está {canalSel?.status === 'removido' ? 'removido' : 'desconectado'}. O histórico permanece, mas o envio está bloqueado.
              <button className="link-btn" onClick={() => navigate('/integracoes')}>Reconectar</button>
            </div>
          ) : (
            <div className="warn"><IcWarn />Atenção: responder por outro número pode gerar uma nova conversa.</div>
          )}

          <div className="input-wrap">
            <textarea ref={taRef} className="msg-input" rows={1} placeholder={canalIndisponivel ? 'Envio bloqueado: número desconectado' : 'Digite sua mensagem...'}
              value={draft} onChange={(e) => setDraft(e.target.value)} disabled={canalIndisponivel}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); } }} />
            <div className="composer-bar">
              <button ref={attachBtnRef} className="tool" title="Anexar arquivo" onClick={(e) => { e.stopPropagation(); togglePop('attach', attachBtnRef, 'left'); }}><IcPaperclip /></button>
              <button className="tool" title="Áudio" onClick={() => toast('Áudio')}><IcMic /></button>
              <button className="tool" title="Imagem" onClick={() => toast('Imagem')}><IcImage /></button>
              <button className="tool" title="Documento" onClick={() => toast('Documento')}><IcDoc /></button>
              <button className="tool" title="Emoji" onClick={() => toast('Emoji')}><IcEmoji /></button>
              <span className="spacer" />
              <button ref={scriptsBtnRef} className="scripts-btn" onClick={(e) => { e.stopPropagation(); togglePop('scripts', scriptsBtnRef, 'right'); }}><IcScripts />Scripts<IcCaret /></button>
              <button className="send-btn" aria-label="Enviar" disabled={sendDisabled} onClick={sendMsg}><IcSend /></button>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- DADOS DO CLIENTE ---------- */}
      <aside className="col data-col">
        <div className="data-head">
          <h3>Dados do cliente</h3>
          <button className="collapse-btn" aria-label="Recolher painel" onClick={() => setDataOpen(false)}><IcChevRight /></button>
        </div>
        <div className="data-body">
          <div className="dfield"><div className="dlabel">Nome</div><div className="dval">{current.name}</div></div>
          <div className="dfield"><div className="dlabel">Telefone</div><div className="dval with-ic"><IcWa />{current.phone}</div></div>
          <div className="dfield"><div className="dlabel">E-mail</div><div className="dval">{current.email}</div></div>

          {/* #2 STATUS — controle editável movido para Dados do cliente */}
          <div className="dfield">
            <div className="dlabel">Status</div>
            <button ref={statusBtnRef} className="status-picker" disabled={!current.id}
              onClick={(e) => { e.stopPropagation(); togglePop('status', statusBtnRef, 'left'); }}>
              <span className="sdot" style={{ background: statusCorAtual ?? '#64748b' }} />
              <span className="status-name">{statusNomeAtual || 'Definir status'}</span>
              <IcChevDown />
            </button>
          </div>

          <div className="dfield"><div className="dlabel">Etapa do funil</div><span className="badge-soft">{current.stage}</span></div>
          <div className="dfield"><div className="dlabel">Responsável</div>{current.resp === 'Não atribuído' ? <div className="dval" style={{ color: 'var(--muted)' }}>Não atribuído</div> : <span className="resp-line"><Avatar name={current.resp} cls="s" />{current.resp}</span>}</div>
          <div className="dfield"><div className="dlabel">Origem do lead</div><div className="dval with-ic"><IcWa />{current.origin}</div></div>

          {/* #3 ETIQUETAS coloridas */}
          <div className="dfield">
            <div className="dlabel">Etiquetas</div>
            <div className="tags">
              {current.tags.map((t) => {
                const cor = corDaEtiqueta(t, etiquetas);
                return (
                  <span className="tag colored" key={t} style={{ background: cor + '22', color: cor, borderColor: cor + '55' }}>
                    {t}
                    {current.id && <button className="tag-x" title="Remover" onClick={() => alternarEtiqueta(t)}><IcX /></button>}
                  </span>
                );
              })}
              {current.id && <button ref={tagsBtnRef} className="tag-add" title="Adicionar etiqueta" onClick={(e) => { e.stopPropagation(); togglePop('tags', tagsBtnRef, 'left'); }}><IcPlus /></button>}
            </div>
          </div>

          {/* #6 ÚLTIMO CANAL UTILIZADO */}
          {ultimo && (
            <div className="dfield">
              <div className="dlabel">Último canal utilizado</div>
              <div className="last-channel">
                <div className="lc-line"><span className="lc-alias"><IcWa />{ultimoAlias ?? 'WhatsApp'}</span><span className="lc-prov">{ultimo.provider ?? 'whatsapp'}</span></div>
                <div className="lc-num">{mascararNumero(ultimo.numero)}</div>
                {ultimo.em && <div className="lc-when"><IcClock />{new Date(ultimo.em).toLocaleString('pt-BR')}</div>}
              </div>
            </div>
          )}

          <div className="dfield"><div className="dlabel">Última interação</div><div className="dval with-ic"><span style={{ color: 'var(--muted)' }}><IcClock /></span>{current.lastInter}</div></div>
          <div className="dfield"><div className="dlabel">Observações internas</div><div className="notes">{current.notes || <span style={{ color: 'var(--muted)' }}>Sem observações.</span>}</div></div>
          <div className="dfield">
            <div className="dlabel">Documentos</div>
            {current.doc ? (
              <>
                <div className="doc-card"><span className="pdf-ic">PDF</span><div className="pdf-info"><div className="pdf-name">{current.doc.name}</div><div className="pdf-meta">{current.doc.meta}</div></div><button className="doc-dl" title="Baixar" onClick={() => toast('Baixando ' + current.doc!.name)}><IcDownload /></button></div>
                <button className="doc-all" onClick={() => toast('Abrindo documentos do cliente')}>Ver todos os documentos (1)</button>
              </>
            ) : (
              <div className="pdf-meta" style={{ color: 'var(--muted)', fontSize: 13 }}>Nenhum documento anexado.</div>
            )}
          </div>
        </div>
      </aside>

      <button className="reopen" aria-label="Abrir painel de dados" onClick={() => setDataOpen(true)}><IcChevLeft /></button>
      <div className="drawer-overlay" onClick={() => setDataOpen(false)} />

      {/* ---------- POPOVERS ---------- */}
      {pop && (
        <div ref={popRef} className={'pop' + (pop.kind === 'scripts' ? ' pop-scripts' : '')} style={{ left: popPos.left, top: popPos.top }}>
          {pop.kind === 'filter' && (
            <>
              <div className="pop-head">Filtrar por número</div>
              {(WA_REAL ? realCanais.map((c) => c.alias) : ['Chip 1', 'Chip 2', 'Chip 3']).map((c) => <button key={c} className="pop-item" onClick={() => { toast('Filtro: ' + c); setPop(null); }}>{c}</button>)}
              <div className="pop-head">Status</div>
              {(statusAtivos.length ? statusAtivos.map((s) => s.nome) : ['Em atendimento', 'Pendente']).map((s) => <button key={s} className="pop-item" onClick={() => { toast('Filtro: ' + s); setPop(null); }}>{s}</button>)}
            </>
          )}
          {pop.kind === 'attach' && (
            <>
              <button className="pop-item" onClick={() => { toast('Anexar imagem'); setPop(null); }}><IcImage />Imagem</button>
              <button className="pop-item" onClick={() => { toast('Anexar documento'); setPop(null); }}><IcDoc />Documento</button>
              <button className="pop-item" onClick={() => { toast('Gravar áudio'); setPop(null); }}><IcMic />Áudio</button>
            </>
          )}
          {pop.kind === 'scripts' && (
            <>
              <div className="pop-head">Inserir script</div>
              {WA_SCRIPTS.map((s) => (
                <button key={s.t} className="pop-item" onClick={() => insertScript(s.m, s.t)}>
                  <div><div>{s.t}</div><small>{s.m.slice(0, 46)}…</small></div>
                </button>
              ))}
            </>
          )}
          {pop.kind === 'status' && (
            <>
              <div className="pop-head">Status da conversa</div>
              {statusAtivos.length === 0 && <div className="pop-empty">Nenhum status ativo.</div>}
              {statusAtivos.map((s) => (
                <button key={s.id} className={'pop-item' + (s.id === current.statusId ? ' sel' : '')} onClick={() => aplicarStatus(s.id)}>
                  <span className="sdot" style={{ background: s.cor }} />{s.nome}
                </button>
              ))}
              {podeGerenciar && <button className="pop-foot-link" onClick={() => { setPop(null); navigate('/configuracoes'); }}>Gerenciar status…</button>}
            </>
          )}
          {pop.kind === 'tags' && (
            <>
              <div className="pop-head">Etiquetas</div>
              {etiquetasAtivas.length === 0 && <div className="pop-empty">Nenhuma etiqueta. {podeGerenciar ? 'Crie em Configurações.' : 'Peça a um gestor.'}</div>}
              {etiquetasAtivas.map((e) => {
                const on = current.tags.some((t) => t.toLowerCase() === e.nome.toLowerCase());
                return (
                  <button key={e.id} className={'pop-item' + (on ? ' sel' : '')} onClick={() => alternarEtiqueta(e.nome)}>
                    <span className="sdot" style={{ background: e.cor }} />{e.nome}{on && <span className="ck">✓</span>}
                  </button>
                );
              })}
              {podeGerenciar && <button className="pop-foot-link" onClick={() => { setPop(null); navigate('/configuracoes'); }}>Gerenciar etiquetas…</button>}
            </>
          )}
        </div>
      )}
    </div>
  );
}
