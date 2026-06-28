import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/useToast';
import { useAuth } from '@/context/AuthContext';
import { useOrg } from '@/context/OrgContext';
import { WA_CONTACTS, initials, avatarColor, type WaContact, type WaMessage } from '@/data/whatsappDemo';
import { useWaConversations, useSendWaMessage, useWaCanais, useAtribuirAtendimento, useIniciarConversaWa, normalizeWaPhone, mascararNumero, subirMidiaWa, urlAssinadaMidiaWa, WA_REAL } from '@/data/whatsapp';
import { MediaComposer } from '@/components/MediaComposer';
import { AudioRecorder } from '@/components/AudioRecorder';
import { AudioMessage } from '@/components/AudioMessage';
import { MsgImage } from '@/components/MsgImage';
import { WhatsAppText } from '@/components/WhatsAppText';
import { EmptyState } from '@/components/EmptyState';
import { useScripts, useScriptEtapaCounts, aguardarConfirmacaoEnvio } from '@/data/scripts';
import { ScriptSequenceModal } from '@/components/ScriptSequenceModal';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Modal } from '@/components/Modal';
import { useStatusDefs, useEtiquetas, useAssinaturaPref, useAtendimentoActions, useOrgUsuarios, resolverNomeAssinatura } from '@/data/atendimento';
import { corDaEtiqueta, podeGerenciarAtendimento, type AssinaturaModo } from '@/types/atendimento';
import { KanbanContatoBox } from '@/components/KanbanContatoBox';
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
const IcScripts = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></svg>;
const IcImage = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="2.4" /><circle cx="8.5" cy="9.5" r="1.5" /><path d="m3 17 5-5 4 4 3-3 6 6" /></svg>;
const IcMic = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>;
const IcDoc = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h6" /></svg>;
const IcUserPlus = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 19a6 6 0 0 0-12 0M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M18 8v6M21 11h-6" /></svg>;
const IcTransfer = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 3l4 4-4 4M20 7H8M8 21l-4-4 4-4M4 17h12" /></svg>;
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
const IcEdit = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>;
const IcCopy = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg>;
const IcContactCard = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="11" r="2" /><path d="M5 17a3 3 0 0 1 8 0M15 9h3M15 13h3" /></svg>;
const IcCheckSm = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg>;
const IcArchive = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="4" rx="1" /><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8M10 12h4" /></svg>;
const IcAlert = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" /></svg>;
const IcNewChat = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.5 8.5 0 0 1-12.6 7.4L3 20.5l1.7-5A8.5 8.5 0 1 1 21 11.5z" /><path d="M12 8.5v5M9.5 11h5" /></svg>;

/** "Aguardando há X" desde a última mensagem do cliente, com cor por faixa de tempo. */
function tempoEspera(desdeIso?: string | null): { label: string; cor: string; tier: 'neutro' | 'ambar' | 'vermelho' | 'critico' } | null {
  if (!desdeIso) return null;
  const ms = Date.now() - new Date(desdeIso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  const min = Math.floor(ms / 60000);
  let label: string;
  if (min < 1) label = 'Aguardando agora';
  else if (min < 60) label = `Aguardando há ${min} min`;
  else if (min < 1440) label = `Aguardando há ${Math.floor(min / 60)} h`;
  else label = `Aguardando há ${Math.floor(min / 1440)} d`;
  // hierarquia visual por tempo: <30min neutro · 30min–2h âmbar · 2–24h vermelho suave · >24h crítico
  const tier = min >= 1440 ? 'critico' : min >= 120 ? 'vermelho' : min >= 30 ? 'ambar' : 'neutro';
  const cor = tier === 'critico' ? '#c0392b' : tier === 'vermelho' ? '#d06666' : tier === 'ambar' ? 'var(--amber)' : 'var(--muted)';
  return { label, cor, tier };
}

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

/** Motivo de falha sanitizado p/ exibição (nunca expõe internals do provedor). */
function traduzErroEnvio(cod?: string): string {
  if (!cod) return 'A mensagem não pôde ser enviada. Tente novamente.';
  if (cod === 'sem_id_externo') return 'A Evolution não confirmou o envio (a mensagem não recebeu um identificador do WhatsApp). Tente novamente.';
  if (cod.startsWith('ERROR')) return 'O WhatsApp recusou a entrega desta mensagem. Confira o número (DDD e nono dígito) e a conexão do canal, depois tente novamente.';
  return 'Não foi possível enviar a mensagem. Tente novamente.';
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
const CURR_KEY = 'atenvo-wa-current';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const soDigitos = (s: string) => (s || '').replace(/\D/g, '');
const fmtTam = (b?: number | null) => !b ? '' : b < 1024 ? b + ' B' : b < 1048576 ? (b / 1024).toFixed(0) + ' KB' : (b / 1048576).toFixed(1) + ' MB';

type PopKind = 'filter' | 'scripts' | 'status' | 'tags' | 'acoes';
interface PopState { kind: PopKind; rect: DOMRect; align: 'left' | 'right'; }

export function WhatsApp() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { currentOrg } = useOrg();
  const live = useWaConversations();
  const sendMut = useSendWaMessage();
  const atribuirMut = useAtribuirAtendimento();
  const canaisQ = useWaCanais();
  const statusQ = useStatusDefs();
  const etiquetasQ = useEtiquetas();
  const prefQ = useAssinaturaPref();
  const acoes = useAtendimentoActions();
  const podeGerenciar = podeGerenciarAtendimento(currentOrg.role);

  const orgUsuariosQ = useOrgUsuarios();
  const scriptsLib = useScripts('whatsapp').data ?? [];
  const etapaCounts = useScriptEtapaCounts().data ?? {};
  const [scriptSeq, setScriptSeq] = useState<{ id: string; titulo: string; conteudo: string } | null>(null);
  const [contacts, setContacts] = useState<WaContact[]>(() => WA_REAL ? [] : WA_CONTACTS.map((c) => ({ ...c, msgs: c.msgs.map((m) => ({ ...m })), tags: [...c.tags] })));
  const [currentId, setCurrentId] = useState(() => {
    if (!WA_REAL) return 'antonio';
    try { return sessionStorage.getItem(CURR_KEY) || ''; } catch { return ''; }
  });
  const [tab, setTab] = useState('todos');
  const [search, setSearch] = useState('');
  const [filtroCanal, setFiltroCanal] = useState<string | null>(null);   // funil: filtra por número/canal
  const [filtroStatus, setFiltroStatus] = useState<string | null>(null); // funil: filtra por status
  const [confirmFechar, setConfirmFechar] = useState(false);             // diálogo próprio (substitui window.confirm)
  const [erroDialog, setErroDialog] = useState<string | null>(null);     // "Ver erro" de mensagem falhada
  const [retryId, setRetryId] = useState<string | null>(null);           // trava de duplo-clique no retry
  const [imgModal, setImgModal] = useState(false);                       // composer de imagem
  const [docModal, setDocModal] = useState(false);                       // composer de documento
  const [transferOpen, setTransferOpen] = useState(false);               // modal de transferência
  const [transferBusca, setTransferBusca] = useState('');                // busca no modal
  const [transferSel, setTransferSel] = useState<string>('');            // usuário selecionado p/ transferir
  const [atribuindo, setAtribuindo] = useState(false);                   // trava de clique-duplo (assumir/transferir)
  const [lightbox, setLightbox] = useState<string | null>(null);         // imagem ampliada no histórico
  const [replyChip, setReplyChip] = useState('Chip 1');       // modo mock
  const [replyCanalId, setReplyCanalId] = useState<string>(''); // modo real
  // Nova conversa (modal)
  const [novoOpen, setNovoOpen] = useState(false);
  const [novoCanal, setNovoCanal] = useState('');
  const [novoTel, setNovoTel] = useState('');
  const [novoNome, setNovoNome] = useState('');
  const [novoBusy, setNovoBusy] = useState(false);
  const [novoErr, setNovoErr] = useState<string | null>(null);
  const iniciarMut = useIniciarConversaWa();
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

  // #4 edição dos dados do cliente
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState<{ nome: string; email: string; observacoes: string; respId: string }>({ nome: '', email: '', observacoes: '', respId: '' });
  const [saving, setSaving] = useState(false);
  const [editErr, setEditErr] = useState<string | null>(null);

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

  // preserva a conversa selecionada ao navegar (ex.: ir a Configurações e voltar)
  useEffect(() => { if (WA_REAL && currentId) { try { sessionStorage.setItem(CURR_KEY, currentId); } catch { /* ignore */ } } }, [currentId]);
  // ao trocar de conversa, sai do modo de edição
  useEffect(() => { setEditMode(false); setEditErr(null); }, [currentId]);

  const enviandoRef = useRef(false); // trava envio concorrente (duplo-clique / Enter duplo)
  const taRef = useRef<HTMLTextAreaElement>(null);
  const msgsRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const filterBtnRef = useRef<HTMLButtonElement>(null);
  const scriptsBtnRef = useRef<HTMLButtonElement>(null);
  const statusBtnRef = useRef<HTMLButtonElement>(null);
  const tagsBtnRef = useRef<HTMLButtonElement>(null);
  const acoesBtnRef = useRef<HTMLButtonElement>(null);

  const current = contacts.find((c) => c.id === currentId) ?? contacts[0] ?? EMPTY_CONTACT;
  const filtered = contacts.filter((c) => {
    // abas reais: todos / meus (responsável = eu) / não atribuídos / pendentes (com não lidas)
    if (tab === 'meus' && c.respId !== user?.id) return false;
    if (tab === 'naoatrib' && !!c.respId) return false;
    if (tab === 'pendentes' && !((c.unread ?? 0) > 0 || c.aguardando)) return false;
    // funil: por número (canal) e por status
    if (filtroCanal && c.canalId !== filtroCanal) return false;
    if (filtroStatus && c.statusId !== filtroStatus) return false;
    // busca: nome, última mensagem ou telefone
    const t = search.trim().toLowerCase();
    if (t && c.name.toLowerCase().indexOf(t) === -1 && c.last.toLowerCase().indexOf(t) === -1 && (c.phone || '').toLowerCase().indexOf(t) === -1) return false;
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
      if (filterBtnRef.current?.contains(t) || scriptsBtnRef.current?.contains(t)) return;
      if (statusBtnRef.current?.contains(t) || tagsBtnRef.current?.contains(t) || acoesBtnRef.current?.contains(t)) return;
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
    if (enviandoRef.current) return; // impede dois envios concorrentes (duplo-clique / Enter duplo)
    if (WA_REAL && !currentId) return;
    if (canalIndisponivel) { toast('Este número está desconectado. Reconecte em Integrações para enviar.', 'warn'); return; }
    const now = new Date();
    const hh = ('0' + now.getHours()).slice(-2) + ':' + ('0' + now.getMinutes()).slice(-2);
    const corpo = assinaturaNome ? `*${assinaturaNome}:*\n${v}` : v;
    // append otimista (atualiza a tela imediatamente). Status "pendente" até a confirmação real.
    setContacts((cur) => cur.map((c) => c.id === currentId ? { ...c, last: v, msgs: [...c.msgs, { dir: 'out', text: corpo, time: hh, status: 'pendente' }] } : c));
    setDraft('');
    if (WA_REAL) {
      enviandoRef.current = true;
      sendMut.mutate(
        { conversaId: currentId, text: v, canalId: replyCanalId || current.canalId, assinaturaNome: assinaturaNome || undefined },
        { onError: (e) => toast((e as Error).message || 'Falha ao enviar a mensagem', 'warn'), onSettled: () => { enviandoRef.current = false; } },
      );
    } else {
      toast('Mensagem enviada');
    }
  }
  /** Retentativa: reaproveita a MESMA mensagem falhada (retry_mensagem_id), sem duplicar. */
  function retryMsg(m: WaMessage) {
    if (!m.id || !currentId || retryId) return;
    if (canalIndisponivel) { toast('Este número está desconectado. Reconecte em Integrações para reenviar.', 'warn'); return; }
    setRetryId(m.id);
    // otimista: a mesma bolha volta para "enviando" (pendente) e limpa o erro.
    setContacts((cur) => cur.map((c) => c.id === currentId ? { ...c, msgs: c.msgs.map((x) => x.id === m.id ? { ...x, status: 'pendente', erro: undefined } : x) } : c));
    sendMut.mutate(
      { conversaId: currentId, text: m.text ?? '', canalId: replyCanalId || current.canalId, retryMensagemId: m.id },
      { onError: (e) => toast((e as Error).message || 'Falha ao reenviar a mensagem', 'warn'), onSettled: () => setRetryId(null) },
    );
  }
  function verErro(m: WaMessage) { setErroDialog(traduzErroEnvio(m.erro)); }
  /** Envio manual de IMAGEM: sobe ao bucket privado e envia pela Evolution (lança em falha -> mantém p/ retry). */
  async function enviarImagem(file: File, caption: string) {
    if (!currentId) throw new Error('Selecione uma conversa.');
    const up = await subirMidiaWa(currentOrg.id, file);
    await sendMut.mutateAsync({
      conversaId: currentId, canalId: replyCanalId || current.canalId,
      midiaPath: up.path, midiaTipo: 'imagem', midiaMime: up.mime, midiaNome: up.nome, midiaTamanho: up.tamanho,
      text: caption || undefined,
    });
  }
  /** Envio de ÁUDIO (gravado ou arquivo): sobe ao bucket privado e envia como nota de voz pela Evolution. */
  async function enviarAudio(blob: Blob, mime: string, ext: string) {
    if (!currentId) throw new Error('Selecione uma conversa.');
    const file = new File([blob], `audio-${Date.now()}.${ext}`, { type: mime });
    const up = await subirMidiaWa(currentOrg.id, file);
    await sendMut.mutateAsync({
      conversaId: currentId, canalId: replyCanalId || current.canalId,
      midiaPath: up.path, midiaTipo: 'audio', midiaMime: up.mime, midiaNome: up.nome, midiaTamanho: up.tamanho,
    });
  }
  /** Envio manual de DOCUMENTO: sobe ao bucket privado e envia pela Evolution (lança em falha -> mantém p/ retry). */
  async function enviarDocumento(file: File, caption: string) {
    if (!currentId) throw new Error('Selecione uma conversa.');
    const up = await subirMidiaWa(currentOrg.id, file);
    await sendMut.mutateAsync({
      conversaId: currentId, canalId: replyCanalId || current.canalId,
      midiaPath: up.path, midiaTipo: 'documento', midiaMime: up.mime, midiaNome: up.nome, midiaTamanho: up.tamanho,
      text: caption || undefined,
    });
  }
  /** Abre/baixa um documento do histórico via URL assinada gerada sob demanda. */
  async function abrirDocumento(m: WaMessage) {
    if (!m.anexoPath) return;
    try { const url = await urlAssinadaMidiaWa(m.anexoPath); window.open(url, '_blank', 'noopener'); }
    catch { toast('Não foi possível abrir o documento.', 'warn'); }
  }
  /** Assumir o atendimento (responsável = usuário atual). Concorrência/permissão validadas no backend. */
  async function assumir() {
    if (!current.contatoId || !user?.id || atribuindo) return;
    setAtribuindo(true);
    const esperado = current.respId || null;
    setContacts((cur) => cur.map((c) => c.id === current.id ? { ...c, respId: user.id } : c)); // otimista
    try { await atribuirMut.mutateAsync({ contatoId: current.contatoId, destinoId: user.id, esperadoId: esperado }); toast('Você assumiu o atendimento'); }
    catch (e) { setContacts((cur) => cur.map((c) => c.id === current.id ? { ...c, respId: esperado } : c)); toast((e as Error).message || 'Falha ao assumir', 'warn'); }
    finally { setAtribuindo(false); }
  }
  /** Abre o modal de Nova conversa, pré-selecionando um canal conectado (o de resposta, se houver). */
  function abrirNovaConversa() {
    const conectados = realCanais.filter((c) => c.status === 'conectado');
    setNovoErr(null); setNovoTel(''); setNovoNome('');
    setNovoCanal(conectados.length ? (conectados.find((c) => c.id === replyCanalId)?.id ?? conectados[0].id) : '');
    setNovoOpen(true);
  }
  /** Confirma: localiza/cria contato+conversa, abre a conversa e foca o compositor (sem enviar nada). */
  async function iniciarNovaConversa() {
    if (novoBusy) return;
    const conectados = realCanais.filter((c) => c.status === 'conectado');
    if (!conectados.length || !novoCanal) { setNovoErr('Selecione um WhatsApp conectado.'); return; }
    if (!normalizeWaPhone(novoTel)) { setNovoErr('Informe um telefone válido.'); return; }
    setNovoBusy(true); setNovoErr(null);
    try {
      const r = await iniciarMut.mutateAsync({ canalId: novoCanal, telefone: novoTel, nome: novoNome });
      await live.refetch();
      setReplyCanalId(novoCanal);
      setCurrentId(r.conversaId);
      setNovoOpen(false);
      if (r.reused) toast('Conversa existente aberta.');
      setTimeout(() => taRef.current?.focus(), 60);
    } catch (e) {
      setNovoErr((e as Error).message || 'Não foi possível iniciar a conversa.');
    } finally {
      setNovoBusy(false);
    }
  }
  function abrirTransferir() { setPop(null); setTransferSel(''); setTransferBusca(''); setTransferOpen(true); }
  /** Transferir o atendimento para outro usuário ativo da organização. */
  async function transferir(destinoId: string) {
    if (!current.contatoId || !destinoId || atribuindo) return;
    setAtribuindo(true);
    const esperado = current.respId || null;
    setContacts((cur) => cur.map((c) => c.id === current.id ? { ...c, respId: destinoId } : c)); // otimista
    try { await atribuirMut.mutateAsync({ contatoId: current.contatoId, destinoId, esperadoId: esperado }); setTransferOpen(false); setTransferSel(''); setTransferBusca(''); toast('Atendimento transferido'); }
    catch (e) { setContacts((cur) => cur.map((c) => c.id === current.id ? { ...c, respId: esperado } : c)); toast((e as Error).message || 'Falha ao transferir', 'warn'); }
    finally { setAtribuindo(false); }
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
    if (c) toast('Respondendo por ' + c.alias);
  }

  function abrirScript(s: { id: string; titulo: string; conteudo: string }) { setPop(null); setScriptSeq(s); }

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

  /* ---------- menu de ações (três pontos) ---------- */
  function fallbackCopy(txt: string, cb: () => void) {
    try { const ta = document.createElement('textarea'); ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); cb(); }
    catch { toast('Não foi possível copiar o telefone', 'warn'); }
  }
  function copiarTelefone() {
    setPop(null);
    const num = soDigitos(current.phone);
    if (!num) { toast('Este contato não tem telefone.', 'warn'); return; }
    const done = () => toast('Telefone copiado: ' + num);
    try {
      if (navigator.clipboard?.writeText) navigator.clipboard.writeText(num).then(done).catch(() => fallbackCopy(num, done));
      else fallbackCopy(num, done);
    } catch { fallbackCopy(num, done); }
  }
  function abrirEmContatos() {
    setPop(null);
    navigate(current.contatoId ? `/contatos?contato=${current.contatoId}` : '/contatos');
  }
  function fecharConversa() {
    setPop(null);
    if (!statusFechada || !current.id) return;
    setConfirmFechar(true); // diálogo próprio do Atenvo (sem window.confirm)
  }
  function confirmarFecharConversa() {
    setConfirmFechar(false);
    if (statusFechada && current.id) aplicarStatus(statusFechada.id);
  }
  function iniciarEdicao() {
    setPop(null);
    if (!current.contatoId) { toast('Selecione uma conversa para editar.', 'warn'); return; }
    setEditForm({ nome: current.name || '', email: current.email || '', observacoes: current.notes || '', respId: current.respId || '' });
    setEditErr(null);
    setEditMode(true);
    setDataOpen(true);
  }
  async function salvarEdicao() {
    if (!current.contatoId || saving) return;
    const email = editForm.email.trim();
    if (email && !EMAIL_RE.test(email)) { setEditErr('E-mail inválido.'); return; }
    setSaving(true); setEditErr(null);
    const patch = { nome: editForm.nome.trim() || current.name, email: email || null, observacoes: editForm.observacoes.trim() || null, responsavel_id: editForm.respId || null };
    setContacts((cur) => cur.map((c) => c.id === current.id ? { ...c, name: patch.nome, email, notes: patch.observacoes ?? '', respId: patch.responsavel_id } : c));
    try { await acoes.atualizarContato(current.contatoId, patch); toast('Dados do cliente salvos'); setEditMode(false); }
    catch (e) { setEditErr((e as Error).message || 'Falha ao salvar'); }
    finally { setSaving(false); }
  }
  function cancelarEdicao() { setEditMode(false); setEditErr(null); }

  const sendDisabled = draft.trim() === '' || (WA_REAL && (!current.id || !canalConectado));
  const statusDefs = statusQ.data ?? [];
  const statusAtivos = statusDefs.filter((s) => s.ativo);
  // status do contato atual resolvido pela definição configurável (cor/nome); fallback ao rótulo legado.
  const statusDefAtual = statusDefs.find((s) => s.id === current.statusId) ?? null;
  const statusNomeAtual = statusDefAtual?.nome ?? current.status;
  const statusCorAtual = statusDefAtual?.cor ?? current.statusCor ?? null;
  const etiquetas = etiquetasQ.data ?? [];
  const etiquetasAtivas = etiquetas.filter((e) => e.ativo);
  const orgUsuarios = orgUsuariosQ.data ?? [];
  const respNome = current.respId ? (orgUsuarios.find((u) => u.id === current.respId)?.nome ?? null) : null;
  const orgUsuariosFiltrados = orgUsuarios.filter((u) => { const t = transferBusca.trim().toLowerCase(); return !t || u.nome.toLowerCase().includes(t); });
  const statusFechada = statusDefs.find((s) => s.slug === 'fechada' || s.nome.trim().toLowerCase() === 'fechada') ?? null;

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
            <button className="filter-btn lh-new" title="Nova conversa" aria-label="Nova conversa" onClick={abrirNovaConversa}><IcNewChat /></button>
          </div>
          <div className="search-row">
            <div className="search">
              <IcSearch />
              <input type="text" placeholder="Buscar conversas..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <button ref={filterBtnRef} className={'filter-btn' + ((filtroCanal || filtroStatus) ? ' on' : '')} aria-label="Filtros" title={(filtroCanal || filtroStatus) ? 'Filtros ativos' : 'Filtros'} onClick={(e) => { e.stopPropagation(); togglePop('filter', filterBtnRef, 'left'); }}><IcFunnel /></button>
          </div>
          <div className="tabs">
            {TABS.map((t) => (
              <button key={t.id} className={'tab' + (tab === t.id ? ' active' : '')} title={t.id === 'pendentes' ? 'Pendentes inclui mensagens não lidas e clientes aguardando resposta.' : undefined} onClick={() => setTab(t.id)}>{t.label}</button>
            ))}
          </div>
        </div>
        <div className="conv-list">
          {filtered.length === 0 ? (
            <div style={{ padding: '30px 12px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>Nenhuma conversa nesta aba.</div>
          ) : filtered.map((c) => {
            const wait = c.aguardando ? tempoEspera(c.aguardandoDesde) : null;
            return (
            <div key={c.id} className={'conv' + (c.id === currentId ? ' active' : '') + (c.aguardando ? ' aguardando aguardando--' + (wait?.tier ?? 'neutro') : '')} onClick={() => selectContact(c.id)}>
              <Avatar name={c.name} />
              <div className="cbody">
                <div className="crow">
                  <span className="cname">{c.name}</span>
                  {c.aguardando && <span className="conv-alert" title="Cliente aguardando resposta" aria-label="Cliente aguardando resposta"><IcAlert /></span>}
                  <span className="ctime">{c.time}</span>
                </div>
                <div className="cchip"><IcChip />{c.chip}</div>
                <div className="cprev">{c.last}</div>
                {wait && <div className="conv-wait" style={{ color: wait.cor }}>{wait.label}</div>}
                {c.tags.length > 0 && (
                  <div className="conv-tags">
                    {c.tags.slice(0, 3).map((t) => { const cor = corDaEtiqueta(t, etiquetas); return <span key={t} className="ctag" title={t} style={{ background: cor + '22', color: cor, borderColor: cor + '55' }}>{t}</span>; })}
                    {c.tags.length > 3 && <span className="ctag more" title={c.tags.slice(3).join(', ')}>+{c.tags.length - 3}</span>}
                  </div>
                )}
              </div>
              {c.unread > 0 && <span className="unread" title={c.unread + ' não lidas'} aria-label={c.unread + ' mensagens não lidas'}>{c.unread > 99 ? '99+' : c.unread}</span>}
            </div>
            );
          })}
        </div>
      </section>

      {/* ---------- CHAT ---------- */}
      <section className="col chat-col">
        {!current.id ? (
          <EmptyState
            icon={<IcWa />}
            title="Selecione uma conversa"
            text="Escolha uma conversa na lista ou inicie um novo atendimento."
            action={<button className="atv-btn primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={abrirNovaConversa}><IcNewChat />Nova conversa</button>}
          />
        ) : (<>
        <header className="chat-head">
          {foco && (
              <button className="icon-btn list-toggle" title={listOpen ? 'Ocultar conversas' : 'Mostrar conversas'} onClick={() => setListOpen((v) => !v)}>
                {listOpen ? <IcChevLeft /> : <IcChevRight />}
              </button>
            )}
            {!dataOpen && (
              <div className="ch-id">
                <Avatar name={current.name} />
                <div className="ch-id-text">
                  <div className="ch-name" title={current.name} tabIndex={0} aria-label={current.name}>{current.name}</div>
                  <div className="ch-phone" title={current.phone}>{current.phone}</div>
                </div>
              </div>
            )}
            <div className="ch-meta">
            <div className="meta-cell"><div className="k">Canal</div><span className="meta-val"><span style={{ color: 'var(--wa)', display: 'inline-flex' }}><IcWa /></span>WhatsApp</span></div>
            <div className="meta-cell"><div className="k">Status</div>
              {statusNomeAtual
                ? <span className="status-badge" style={{ background: (statusCorAtual ?? '#64748b') + '22', color: statusCorAtual ?? 'var(--ink-2)' }}><span className="sdot" style={{ background: statusCorAtual ?? '#64748b' }} />{statusNomeAtual}</span>
                : <span className="meta-val" style={{ color: 'var(--muted)' }}>—</span>}
            </div>
            <div className="meta-cell"><div className="k">Atendente</div>
              {respNome
                ? <span className="meta-val resp-line"><Avatar name={respNome} cls="s" />{current.respId === user?.id ? 'Você' : respNome}</span>
                : <span className="meta-val" style={{ color: 'var(--muted)' }}>Sem responsável</span>}
            </div>
            </div>
          <div className="ch-actions">
            {current.id && (current.respId
              ? <button className="ch-resp-btn" disabled={atribuindo} title="Transferir atendimento" onClick={abrirTransferir}><IcTransfer /><span>Transferir</span></button>
              : <button className="ch-resp-btn primary" disabled={atribuindo} title="Assumir atendimento" onClick={assumir}><IcUserPlus /><span>Assumir</span></button>)}
            <button className={'icon-btn' + (foco ? ' on' : '')} title="Modo de foco (Esc para sair)" onClick={() => setFoco((v) => !v)}><IcFocus /></button>
            <button ref={acoesBtnRef} className={'icon-btn' + (pop?.kind === 'acoes' ? ' on' : '')} title="Ações" aria-label="Ações da conversa" aria-haspopup="menu" aria-expanded={pop?.kind === 'acoes'} disabled={!current.id} onClick={(e) => { e.stopPropagation(); togglePop('acoes', acoesBtnRef, 'right'); }}><IcDots /></button>
          </div>
        </header>

        <div className="messages" ref={msgsRef}>
          {current.msgs.map((m, i) => {
            const ack = m.dir === 'out' ? ackOf(m.status) : null;
            const tempo = (
              <span className="btime">
                {m.viaTelefone && <span className="phone-tag" title="Enviada pelo celular"><IcPhoneSent />Enviada pelo celular</span>}
                {m.time}
                {ack && <span className={'tick ' + ack.cls} title={m.status === 'falhou' ? traduzErroEnvio(m.erro) : ack.title}>{ack.ticks}</span>}
              </span>
            );
            const falhaActs = (m.dir === 'out' && m.status === 'falhou') ? (
              <span className="msg-falha-acts">
                <button type="button" className="msg-falha-link" onClick={() => verErro(m)}>Ver erro</button>
                <span className="msg-falha-sep">·</span>
                <button type="button" className="msg-falha-link" disabled={!m.id || retryId === m.id} onClick={() => retryMsg(m)}>{retryId === m.id ? 'Reenviando…' : 'Tentar novamente'}</button>
              </span>
            ) : null;
            // horário + status discretos, para a faixa de legenda do card de mídia
            const metaInline = (
              <span className="media-cap-meta">{m.time}{ack && <span className={'tick ' + ack.cls} title={m.status === 'falhou' ? traduzErroEnvio(m.erro) : ack.title}>{ack.ticks}</span>}</span>
            );
            return (
              <div key={i} className={'msg ' + m.dir}>
                {m.tipo === 'audio' ? (
                  (m.dir === 'out' && m.status === 'falhou') ? (
                    <>
                      <div className="bubble bubble-falha bubble-audio-falha"><IcMic />Áudio não enviado</div>
                      {tempo}
                      {falhaActs}
                    </>
                  ) : m.anexoPath ? (
                    <AudioMessage
                      path={m.anexoPath} nome={m.nome}
                      resolveUrl={(p) => urlAssinadaMidiaWa(p).catch(() => null)}
                      time={m.time}
                      statusNode={ack ? <span className={'tick ' + ack.cls} title={ack.title}>{ack.ticks}</span> : null}
                    />
                  ) : null
                ) : m.tipo === 'imagem' ? (
                  <>
                    {m.anexoPath
                      ? <MsgImage path={m.anexoPath} nome={m.nome} caption={m.text || undefined} metaNode={m.text ? metaInline : undefined} falhou={m.status === 'falhou'} onOpen={setLightbox} />
                      : <div className="media-card bubble-img"><div className="msg-img-fallback"><span className="mif-txt">Imagem indisponível</span></div></div>}
                    {!m.text && tempo}
                    {falhaActs}
                  </>
                ) : m.tipo === 'documento' ? (
                  <>
                    <div className={'media-card bubble-doc' + (m.status === 'falhou' ? ' media-falha' : '')}>
                      <button type="button" className="doc-card" onClick={() => abrirDocumento(m)} title="Abrir documento" disabled={m.status === 'falhou'}>
                        <span className="doc-ic"><IcDoc /></span>
                        <span className="doc-info">
                          <span className="doc-nome">{m.nome || 'documento'}</span>
                          <span className="doc-meta">{(m.nome?.split('.').pop() || '').toUpperCase()}{m.tamanho ? ' · ' + fmtTam(m.tamanho) : ''}</span>
                        </span>
                        <span className="doc-open"><IcDownload /></span>
                      </button>
                      {m.text && (
                        <div className="media-cap">
                          <div className="media-cap-text">{m.text}</div>
                          {metaInline}
                        </div>
                      )}
                    </div>
                    {!m.text && tempo}
                    {falhaActs}
                  </>
                ) : m.pdf ? (
                  <>
                    <div className="pdf-card"><span className="pdf-ic">PDF</span><div className="pdf-info"><div className="pdf-name">{m.pdf.name}</div><div className="pdf-meta">{m.pdf.meta}</div></div></div>
                    <span className="btime">{m.time}</span>
                  </>
                ) : (
                  <>
                    <div className={'bubble' + (m.status === 'falhou' ? ' bubble-falha' : '')}><WhatsAppText text={m.text} /></div>
                    {tempo}
                    {falhaActs}
                  </>
                )}
              </div>
            );
          })}
          <div style={{ clear: 'both' }} />
        </div>

        <div className="composer">
          <div className="composer-top">
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
          </div>{/* /composer-top */}

          {canalIndisponivel && (
            <div className="warn warn-block">
              <IcWarn />Este número está {canalSel?.status === 'removido' ? 'removido' : 'desconectado'}. O histórico permanece, mas o envio está bloqueado.
              <button className="link-btn" onClick={() => navigate('/integracoes')}>Reconectar</button>
            </div>
          )}

          <div className="input-wrap">
            <textarea ref={taRef} className="msg-input" rows={1} placeholder={canalIndisponivel ? 'Envio bloqueado: número desconectado' : 'Digite sua mensagem...'}
              value={draft} onChange={(e) => setDraft(e.target.value)} disabled={canalIndisponivel}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); } }} />
            <div className="composer-bar">
              <button className="cbar-act" title="Enviar imagem" aria-label="Enviar imagem" disabled={WA_REAL && (!current.id || !canalConectado)} onClick={() => setImgModal(true)}><IcImage /><span>Imagem</span></button>
              <AudioRecorder disabled={WA_REAL && (!current.id || !canalConectado)} onEnviar={enviarAudio} />
              <button className="cbar-act" title="Enviar documento" aria-label="Enviar documento" disabled={WA_REAL && (!current.id || !canalConectado)} onClick={() => setDocModal(true)}><IcDoc /><span>Arquivo</span></button>
              <span className="spacer" />
              <button ref={scriptsBtnRef} className="scripts-btn" onClick={(e) => { e.stopPropagation(); togglePop('scripts', scriptsBtnRef, 'right'); }}><IcScripts />Scripts<IcCaret /></button>
              <button className="send-btn" aria-label="Enviar" disabled={sendDisabled} onClick={sendMsg}><IcSend /></button>
            </div>
          </div>
        </div>
        </>)}
      </section>

      {/* ---------- DADOS DO CLIENTE ---------- */}
      <aside className="col data-col">
        <div className="data-head">
          <h3>Dados do cliente</h3>
          <div className="dh-actions">
            {current.id && !editMode && <button className="edit-btn" onClick={iniciarEdicao} title="Editar dados do cliente"><IcEdit />Editar</button>}
            <button className="collapse-btn" aria-label="Recolher painel" onClick={() => setDataOpen(false)}><IcChevRight /></button>
          </div>
        </div>
        <div className="data-body">
          {editMode && (
            <div className="edit-bar">
              {editErr && <div className="edit-err"><IcWarn />{editErr}</div>}
              <div className="edit-actions">
                <button className="btn-save" disabled={saving} onClick={salvarEdicao}>{saving ? 'Salvando…' : <><IcCheckSm />Salvar</>}</button>
                <button className="btn-cancel" disabled={saving} onClick={cancelarEdicao}>Cancelar</button>
              </div>
            </div>
          )}
          <div className="dfield"><div className="dlabel">Nome</div>
            {editMode ? <input className="edit-input" value={editForm.nome} onChange={(e) => setEditForm((f) => ({ ...f, nome: e.target.value }))} /> : <div className="dval">{current.name}</div>}
          </div>
          <div className="dfield"><div className="dlabel">Telefone</div>
            <div className="dval with-ic"><IcWa />{current.phone || <span style={{ color: 'var(--muted)' }}>—</span>}{current.phone && <button className="copy-btn" title="Copiar telefone" onClick={copiarTelefone}><IcCopy /></button>}</div>
          </div>
          <div className="dfield"><div className="dlabel">E-mail</div>
            {editMode ? <input className="edit-input" type="email" value={editForm.email} onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))} placeholder="email@exemplo.com" /> : <div className="dval">{current.email || <span style={{ color: 'var(--muted)' }}>—</span>}</div>}
          </div>

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

          <div className="dfield"><KanbanContatoBox contatoId={current.contatoId} conversaId={current.id} canalId={current.canalId} canalTipo="whatsapp" /></div>
          <div className="dfield"><div className="dlabel">Responsável</div>
            {editMode ? (
              <select className="edit-input" value={editForm.respId} onChange={(e) => setEditForm((f) => ({ ...f, respId: e.target.value }))}>
                <option value="">Não atribuído</option>
                {orgUsuarios.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
              </select>
            ) : (
              <div className="resp-box">
                {respNome
                  ? <span className="resp-line"><Avatar name={respNome} cls="s" />{respNome}{current.respId === user?.id && <span className="resp-voce">Você</span>}</span>
                  : <div className="dval" style={{ color: 'var(--muted)' }}>Sem responsável</div>}
                {current.id && (current.respId
                  ? (<>
                      {current.respId === user?.id && <span className="resp-hint">Você é o responsável</span>}
                      <button className="resp-btn" disabled={atribuindo} onClick={abrirTransferir}><IcTransfer />Transferir atendimento</button>
                    </>)
                  : <button className="resp-btn primary" disabled={atribuindo} onClick={assumir}><IcUserPlus />{atribuindo ? 'Assumindo…' : 'Assumir atendimento'}</button>
                )}
              </div>
            )}
          </div>
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
          <div className="dfield"><div className="dlabel">Observações internas</div>
            {editMode ? <textarea className="edit-input edit-textarea" rows={3} value={editForm.observacoes} onChange={(e) => setEditForm((f) => ({ ...f, observacoes: e.target.value }))} /> : <div className="notes">{current.notes || <span style={{ color: 'var(--muted)' }}>Sem observações.</span>}</div>}
          </div>
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
              <button className={'pop-item' + (filtroCanal === null ? ' sel' : '')} onClick={() => { setFiltroCanal(null); setPop(null); }}>Todos os números{filtroCanal === null && <span className="ck">✓</span>}</button>
              {realCanais.map((c) => <button key={c.id} className={'pop-item' + (filtroCanal === c.id ? ' sel' : '')} onClick={() => { setFiltroCanal(c.id); setPop(null); }}>{c.alias}{filtroCanal === c.id && <span className="ck">✓</span>}</button>)}
              <div className="pop-head">Status</div>
              <button className={'pop-item' + (filtroStatus === null ? ' sel' : '')} onClick={() => { setFiltroStatus(null); setPop(null); }}>Todos os status{filtroStatus === null && <span className="ck">✓</span>}</button>
              {statusAtivos.map((s) => <button key={s.id} className={'pop-item' + (filtroStatus === s.id ? ' sel' : '')} onClick={() => { setFiltroStatus(s.id); setPop(null); }}><span className="sdot" style={{ background: s.cor }} />{s.nome}{filtroStatus === s.id && <span className="ck">✓</span>}</button>)}
            </>
          )}
          {pop.kind === 'scripts' && (
            <>
              <div className="pop-head">Enviar script</div>
              {scriptsLib.length === 0 && <div className="pop-empty">Nenhum script para WhatsApp. Crie em Scripts.</div>}
              {scriptsLib.map((s) => {
                const n = etapaCounts[s.id] ?? (s.conteudo.trim() ? 1 : 0);
                return (
                  <button key={s.id} className="pop-item" onClick={() => abrirScript({ id: s.id, titulo: s.titulo, conteudo: s.conteudo })}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{s.titulo}<span style={{ fontSize: 11, color: 'var(--muted)' }}>· {n} {n === 1 ? 'msg' : 'msgs'}</span></div>
                      <small>{s.conteudo.slice(0, 46)}…</small>
                    </div>
                  </button>
                );
              })}
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
              {podeGerenciar && <button className="pop-foot-link" onClick={() => { setPop(null); navigate('/configuracoes?tab=atendimento&section=status'); }}>Gerenciar status…</button>}
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
              {podeGerenciar && <button className="pop-foot-link" onClick={() => { setPop(null); navigate('/configuracoes?tab=atendimento&section=etiquetas'); }}>Gerenciar etiquetas…</button>}
            </>
          )}
          {pop.kind === 'acoes' && (
            <div role="menu" aria-label="Ações da conversa">
              <button role="menuitem" className="pop-item" onClick={iniciarEdicao}><IcEdit />Editar dados do cliente</button>
              {current.phone && <button role="menuitem" className="pop-item" onClick={copiarTelefone}><IcCopy />Copiar telefone</button>}
              {current.contatoId && <button role="menuitem" className="pop-item" onClick={abrirEmContatos}><IcContactCard />Abrir em Contatos</button>}
              {statusFechada && current.statusId !== statusFechada.id && <button role="menuitem" className="pop-item" onClick={fecharConversa}><IcArchive />Fechar conversa</button>}
            </div>
          )}
        </div>
      )}

      <ScriptSequenceModal
        open={!!scriptSeq} onClose={() => setScriptSeq(null)} script={scriptSeq} canal="whatsapp"
        conversaId={currentId}
        ctx={{ cliente: current.name, atendente: user?.name, empresa: currentOrg.name, telefone: current.phone }}
        enviarEtapa={async (texto) => await sendMut.mutateAsync({ conversaId: currentId, text: texto, canalId: replyCanalId || current.canalId, assinaturaNome: assinaturaNome || undefined }) ?? undefined}
        confirmar={(mensagemId) => aguardarConfirmacaoEnvio(mensagemId)}
      />

      <ConfirmDialog
        open={confirmFechar}
        title="Fechar conversa"
        message={statusFechada ? `A conversa será marcada como "${statusFechada.nome}". Você pode reabri-la mudando o status depois.` : 'Fechar esta conversa?'}
        confirmLabel="Fechar conversa"
        onConfirm={confirmarFecharConversa}
        onCancel={() => setConfirmFechar(false)}
      />
      <ConfirmDialog
        open={!!erroDialog}
        title="Falha no envio"
        message={erroDialog ?? ''}
        confirmLabel="Entendi"
        cancelLabel="Fechar"
        onConfirm={() => setErroDialog(null)}
        onCancel={() => setErroDialog(null)}
      />

      <MediaComposer open={imgModal} tipo="imagem" previewCard onClose={() => setImgModal(false)} enviar={enviarImagem} />
      <MediaComposer open={docModal} tipo="documento" onClose={() => setDocModal(false)} enviar={enviarDocumento} />

      <Modal open={novoOpen} onClose={() => { if (!novoBusy) setNovoOpen(false); }} title="Nova conversa" width={420} closeOnBackdrop={!novoBusy}
        footer={<>
          <button className="atv-btn" disabled={novoBusy} onClick={() => setNovoOpen(false)}>Cancelar</button>
          <button className="atv-btn primary" disabled={novoBusy || !realCanais.some((c) => c.status === 'conectado')} onClick={iniciarNovaConversa}>{novoBusy ? 'Iniciando…' : 'Iniciar conversa'}</button>
        </>}>
        {realCanais.some((c) => c.status === 'conectado') ? (
          <div className="nc-form">
            <label className="nc-field"><span className="nc-label">WhatsApp</span>
              <select className="atv-input" value={novoCanal} onChange={(e) => setNovoCanal(e.target.value)} disabled={novoBusy}>
                {realCanais.filter((c) => c.status === 'conectado').map((c) => (
                  <option key={c.id} value={c.id}>{c.alias}{c.numero ? ' · ' + mascararNumero(c.numero) : ''}</option>
                ))}
              </select>
            </label>
            <label className="nc-field"><span className="nc-label">Telefone</span>
              <input className="atv-input" inputMode="tel" placeholder="(11) 99999-8888" value={novoTel} onChange={(e) => setNovoTel(e.target.value)} disabled={novoBusy} />
            </label>
            <label className="nc-field"><span className="nc-label">Nome <span className="nc-opt">(opcional)</span></span>
              <input className="atv-input" placeholder="Nome do contato" value={novoNome} onChange={(e) => setNovoNome(e.target.value)} disabled={novoBusy} />
            </label>
            {novoErr && <div className="atv-field-err">{novoErr}</div>}
          </div>
        ) : (
          <div className="nc-empty"><IcWarn />Nenhum WhatsApp conectado.</div>
        )}
      </Modal>

      <Modal open={transferOpen} onClose={() => setTransferOpen(false)} title="Transferir atendimento" width={460}
        footer={<>
          <button className="atv-btn" disabled={atribuindo} onClick={() => setTransferOpen(false)}>Cancelar</button>
          <button className="atv-btn primary" disabled={!transferSel || transferSel === current.respId || atribuindo} onClick={() => transferir(transferSel)}>{atribuindo ? 'Transferindo…' : 'Transferir'}</button>
        </>}>
        <div className="tr-atual">Responsável atual: <strong>{respNome ?? 'Sem responsável'}</strong></div>
        <input className="atv-input" placeholder="Buscar atendente…" value={transferBusca} onChange={(e) => setTransferBusca(e.target.value)} autoFocus />
        <div className="tr-list">
          {orgUsuariosFiltrados.length === 0 && <div className="tr-empty">Nenhum atendente encontrado.</div>}
          {orgUsuariosFiltrados.map((u) => (
            <button key={u.id} type="button" className={'tr-item' + (transferSel === u.id ? ' sel' : '')} disabled={u.id === current.respId || atribuindo} onClick={() => setTransferSel(u.id)}>
              <Avatar name={u.nome} cls="s" />
              <span className="tr-nome">{u.nome}{u.id === user?.id ? ' (você)' : ''}{u.id === current.respId ? ' · atual' : ''}</span>
              <span className="tr-papel">{u.papel}</span>
              {transferSel === u.id && <span className="tr-ck"><IcCheckSm /></span>}
            </button>
          ))}
        </div>
      </Modal>

      {lightbox && (
        <div className="atv-lightbox" onClick={() => setLightbox(null)} role="dialog" aria-modal="true">
          <button className="atv-lightbox-close" aria-label="Fechar" onClick={() => setLightbox(null)}>×</button>
          <img src={lightbox} alt="Imagem ampliada" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}
