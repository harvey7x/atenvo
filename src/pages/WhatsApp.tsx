import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useToast } from '@/hooks/useToast';
import { useAuth } from '@/context/AuthContext';
import { useOrg } from '@/context/OrgContext';
import { WA_CONTACTS, initials, avatarColor, type WaContact, type WaMessage } from '@/data/whatsappDemo';
import { useWaConversations, useWaMensagens, useSendWaMessage, useWaCanais, useWaCanalEnvioSaude, useAtribuirAtendimento, useIniciarConversaWa, normalizeWaPhone, mascararNumero, subirMidiaWa, urlAssinadaMidiaWa, urlDownloadMidiaWa, nomeArquivoMidia, rotuloBaixarMidia, removerMensagemFalha, waRecarregarAudio, waValidarNumero, waVincularNumero, waArquivar, waMarcarLida, useWaAtividades, WA_REAL } from '@/data/whatsapp';
import { MediaComposer } from '@/components/MediaComposer';
import { AudioRecorder } from '@/components/AudioRecorder';
import { AudioMessage } from '@/components/AudioMessage';
import { MsgImage } from '@/components/MsgImage';
import { MsgVideo } from '@/components/MsgVideo';
import { WhatsAppText } from '@/components/WhatsAppText';
import { formatarNomeCliente } from '@/lib/nomeCliente';
import { etiquetasDaConversa, responsavelEfetivo } from '@/lib/conversaEtiquetas';
import { analisarNome, conversaAtiva, decidirDono, decidirNome, estadoHigiene, textoBloqueio } from '@/lib/higieneConversa';
import { construirItensConversa } from '@/lib/dataConversa';
import { canalValidoParaEnvio } from '@/lib/agendamentoMensagem';
import { useAgendarSequencia, useMensagensAgendadas, useEditarAgendamento, useCancelarAgendamento, type MensagemAgendada } from '@/data/whatsapp';
import { AgendarMensagemModal, type AgendarSubmit } from '@/components/AgendarMensagemModal';
import { HIGIENE_CORTE_ISO, HIGIENE_DIAS_ADAPTACAO } from '@/config/higiene';
import { useHigieneConversa, useRegistrarAdiamento, HIGIENE_VAZIO } from '@/data/higiene';
import { EmptyState } from '@/components/EmptyState';
import { useScripts, useScriptEtapaCounts, aguardarConfirmacaoEnvio, traduzErroEnvio } from '@/data/scripts';
import { ScriptSequenceModal } from '@/components/ScriptSequenceModal';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Modal } from '@/components/Modal';
import { useStatusDefs, useEtiquetas, useAssinaturaPref, useAtendimentoActions, useOrgUsuarios, resolverNomeAssinatura } from '@/data/atendimento';
import { useSlaAlertas } from '@/data/sla';
import { indexPorChave, tipoLabel, tempoRelativo } from '@/data/slaView';
import { siglaCanal } from '@/lib/cardConversa';
import { SlaConversaBanner } from '@/components/SlaConversaBanner';
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

const TABS: { id: string; label: string }[] = [
  { id: 'todos', label: 'Todos' },
  { id: 'meus', label: 'Meus' },
  { id: 'naoatrib', label: 'Não atribuídos' },
  { id: 'naolidas', label: 'Não lidas' },
  { id: 'pendentes', label: 'Pendentes' },
  { id: 'arquivadas', label: 'Arquivadas' },
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
  // SLA (S4.2): alertas ativos indexados por conversa_id (só leitura; não altera o motor).
  const slaQ = useSlaAlertas();
  const slaPorConversa = useMemo(() => indexPorChave(slaQ.data?.itens ?? [], 'conversa_id'), [slaQ.data]);
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
  const [searchParams, setSearchParams] = useSearchParams();
  const [currentId, setCurrentId] = useState(() => {
    if (!WA_REAL) return 'antonio';
    try {
      const p = new URLSearchParams(window.location.search).get('conversa'); // deep-link/Kanban tem prioridade
      if (p) return p;
      return sessionStorage.getItem(CURR_KEY) || '';
    } catch { return ''; }
  });
  const atividadesQ = useWaAtividades(WA_REAL ? (currentId || null) : null); // timeline de atendimento (colab. E1)
  const [tab, setTab] = useState('todos');
  const [search, setSearch] = useState('');
  const [filtroCanal, setFiltroCanal] = useState<string | null>(null);   // funil: filtra por número/canal
  const [filtroStatus, setFiltroStatus] = useState<string | null>(null); // funil: filtra por status
  const [confirmFechar, setConfirmFechar] = useState(false);             // diálogo próprio (substitui window.confirm)
  const [erroDialog, setErroDialog] = useState<string | null>(null);     // "Ver erro" de mensagem falhada
  const [retryId, setRetryId] = useState<string | null>(null);           // trava de duplo-clique no retry
  const [removerAlvo, setRemoverAlvo] = useState<WaMessage | null>(null); // mensagem com falha a remover
  const [removendoId, setRemovendoId] = useState<string | null>(null);   // trava de duplo-clique na remoção
  const [recarregando, setRecarregando] = useState<string | null>(null); // áudio pendente sendo recarregado
  const [baixando, setBaixando] = useState<string | null>(null);         // mídia sendo baixada (gerando URL assinada)
  const [imgModal, setImgModal] = useState(false);                       // composer de imagem
  const [docModal, setDocModal] = useState(false);                       // composer de documento
  const [agendarOpen, setAgendarOpen] = useState(false);                 // modal "Agendar mensagem"
  const [agEditId, setAgEditId] = useState<string | null>(null);         // id em edição (null = criando)
  const [agInitial, setAgInitial] = useState<{ canalId?: string; texto?: string; executarEm?: string; tipo?: string; nomeArquivo?: string } | null>(null);
  // Responder mensagem específica (quoted reply)
  const [replyTo, setReplyTo] = useState<{ id: string; idExt?: string; fromMe: boolean; tipo: string; texto: string; remetente: string } | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);               // modal de transferência
  const [transferBusca, setTransferBusca] = useState('');                // busca no modal
  const [transferSel, setTransferSel] = useState<string>('');            // usuário selecionado p/ transferir
  const [transferMotivo, setTransferMotivo] = useState('');              // motivo (obrigatório) da transferência
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

  // O card mostra tempo RELATIVO ("há 15 min"). Antes o refetch de 6s forçava re-render e o
  // rótulo se atualizava de carona; com o refetch em 30s (Bloco 1) ele congelaria na tela.
  // Este tick de 1 min mantém o rótulo honesto sem tráfego nenhum.
  const [relogioMs, setRelogioMs] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setRelogioMs(Date.now()), 60_000); return () => clearInterval(t); }, []);

  // PERF: histórico COMPLETO só da conversa aberta. A lista agora traz apenas as últimas
  // mensagens de cada conversa (payload ~10x menor), então o histórico integral vem daqui.
  const msgsQ = useWaMensagens(WA_REAL ? currentId : null);
  // refs para o efeito da lista enxergar o valor ATUAL sem entrar nas dependências (o efeito
  // precisa rodar só quando live.data muda, senão vira loop).
  const currentIdRef = useRef(currentId);
  currentIdRef.current = currentId;
  const historicoRef = useRef<WaMessage[] | undefined>(undefined);
  historicoRef.current = msgsQ.data;

  // modo real: sincroniza a lista vinda do Supabase e mantém uma seleção válida.
  // ARMADILHA: substituir a lista inteira apagaria o histórico da conversa ABERTA (que agora vem
  // truncado no payload da lista). Por isso a conversa aberta recebe de volta o histórico completo
  // já carregado. O resto da semântica é idêntico ao de antes — inclusive a reconciliação das
  // bolhas otimistas, que continua acontecendo por substituição.
  useEffect(() => {
    if (WA_REAL && live.data) {
      const abertaId = currentIdRef.current;
      const hist = historicoRef.current;
      setContacts(hist?.length && abertaId
        ? live.data.map((c) => (c.id === abertaId ? { ...c, msgs: hist } : c))
        : live.data);
      setCurrentId((id) => (id && live.data!.some((c) => c.id === id)) ? id : (live.data![0]?.id ?? ''));
    }
  }, [live.data]);

  // hidrata o histórico completo assim que ele chega (ou troca de conversa)
  useEffect(() => {
    if (!WA_REAL || !currentId || !msgsQ.data) return;
    setContacts((cur) => cur.map((c) => (c.id === currentId ? { ...c, msgs: msgsQ.data! } : c)));
  }, [msgsQ.data, currentId]);

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
  const buscaAtiva = search.trim().length > 0;
  const filtered = contacts.filter((c) => {
    // Arquivadas só aparecem na aba 'arquivadas' (ou quando a busca está ativa, com badge). As demais abas
    // operam apenas sobre conversas ativas (não arquivadas).
    if (tab === 'arquivadas') { if (!c.arquivada) return false; }
    else if (c.arquivada && !buscaAtiva) return false;
    // abas reais: todos / meus / não atribuídos / não lidas / pendentes (não lidas OU aguardando)
    if (tab === 'meus' && c.respId !== user?.id) return false;
    if (tab === 'naoatrib' && !!c.respId) return false;
    if (tab === 'naolidas' && !((c.unread ?? 0) > 0)) return false;
    if (tab === 'pendentes' && !((c.unread ?? 0) > 0 || c.aguardando)) return false;
    // funil: por número (canal) e por status
    if (filtroCanal && c.canalId !== filtroCanal) return false;
    if (filtroStatus && c.statusId !== filtroStatus) return false;
    // busca: nome, última mensagem ou telefone
    const t = search.trim().toLowerCase();
    if (t && c.name.toLowerCase().indexOf(t) === -1 && c.last.toLowerCase().indexOf(t) === -1 && (c.phone || '').toLowerCase().indexOf(t) === -1) return false;
    return true;
  }).sort((a, b) => {
    // Ordenação natural tipo WhatsApp (abas normais): FIXADAS no topo → depois recência pura
    // (última interação mais recente primeiro). Não-lidas é só BADGE visual, NÃO reordena — assim
    // atrasados antigos (com mensagens não lidas) não sobem indevidamente. SLA/severidade NÃO
    // influenciam a ordem (só chip/status).
    if (!!a.fixada !== !!b.fixada) return a.fixada ? -1 : 1;
    return (b.lastAtMs ?? 0) - (a.lastAtMs ?? 0);
  });

  // Contadores das abas (pills, ref. Helena). Usam os MESMOS predicados do filtro acima —
  // inclusive canal/status/busca e a regra de arquivadas — senão o número mente em relação ao
  // que a aba mostra ao ser clicada.
  const tabCounts = useMemo(() => {
    const t = search.trim().toLowerCase();
    const base = contacts.filter((c) => {
      if (filtroCanal && c.canalId !== filtroCanal) return false;
      if (filtroStatus && c.statusId !== filtroStatus) return false;
      if (t && c.name.toLowerCase().indexOf(t) === -1 && c.last.toLowerCase().indexOf(t) === -1 && (c.phone || '').toLowerCase().indexOf(t) === -1) return false;
      return true;
    });
    const ativos = base.filter((c) => !c.arquivada || buscaAtiva);
    return {
      todos: ativos.length,
      meus: ativos.filter((c) => c.respId === user?.id).length,
      naoatrib: ativos.filter((c) => !c.respId).length,
      naolidas: ativos.filter((c) => (c.unread ?? 0) > 0).length,
      pendentes: ativos.filter((c) => (c.unread ?? 0) > 0 || c.aguardando).length,
      arquivadas: base.filter((c) => c.arquivada).length,
    } as Record<string, number>;
  }, [contacts, filtroCanal, filtroStatus, search, buscaAtiva, user?.id]);


  // LEITURA (regra mínima): só zera o contador quando (1) o usuário SELECIONOU ativamente a conversa
  // (não em restauração de ID), (2) as mensagens estão carregadas, (3) o documento está visível e (4) a
  // janela está em foco. Roda uma única vez por (conversa, contador) e evita loop de mutation/refetch.
  const marcandoLeituraRef = useRef(false);
  // id da conversa que o usuário SELECIONOU explicitamente (clique). Só este id pode ser marcado como lido —
  // distingue de ID restaurado no mount/reload e de reatribuição programática (live.data[0]).
  const selecaoUsuarioRef = useRef<string | null>(null);
  const markCurrentRead = () => {
    if (!WA_REAL || !currentId) return;
    if (selecaoUsuarioRef.current !== currentId) return; // só após clique do usuário NESTA conversa
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
    if (typeof document !== 'undefined' && typeof document.hasFocus === 'function' && !document.hasFocus()) return;
    if (marcandoLeituraRef.current) return; // sem chamada concorrente (guard contra loop mutation/refetch)
    const c = contacts.find((x) => x.id === currentId);
    if (!c || !c.id || (c.unread ?? 0) === 0) return; // mensagens carregadas (conversa presente) e há não lidas
    marcandoLeituraRef.current = true;
    // reage a CADA novo não lido (inbound na conversa aberta): após refetch o contador zera; novo inbound
    // (unread>0) dispara novamente. Em falha NÃO assume lido localmente — badge permanece e retenta no
    // próximo focus/refetch; log sanitizado (sem toast em loop).
    waMarcarLida(currentId, true)
      .then(() => void live.refetch())
      .catch((e) => { console.warn('[inbox] marcar lida falhou:', ((e as Error)?.message ?? 'erro').slice(0, 80)); })
      .finally(() => { marcandoLeituraRef.current = false; });
  };
  useEffect(() => { markCurrentRead(); }, [currentId, contacts]); // eslint-disable-line react-hooks/exhaustive-deps

  // Abertura direta pela rota (?conversa=<id>) — botão "Abrir conversa" do Kanban/modal do cliente ou deep-link.
  // Seleciona ESTA conversa (não o default), limpa filtros incompatíveis para o card aparecer na lista, rola
  // até ele e consome o parâmetro (a persistência no reload fica por conta do sessionStorage).
  const conversaParam = searchParams.get('conversa');
  useEffect(() => {
    if (!WA_REAL || !conversaParam) return;
    selecaoUsuarioRef.current = conversaParam;
    setCurrentId(conversaParam);
    setTab('todos'); setFiltroCanal(null); setFiltroStatus(null); setSearch('');
    const alvo = conversaParam;
    window.setTimeout(() => { const el = document.querySelector(`[data-cid="${alvo}"]`); if (el) (el as HTMLElement).scrollIntoView({ block: 'center', behavior: 'smooth' }); }, 220);
    setSearchParams((p) => { const n = new URLSearchParams(p); n.delete('conversa'); return n; }, { replace: true });
  }, [conversaParam]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!WA_REAL) return;
    const h = () => markCurrentRead();
    window.addEventListener('focus', h);
    document.addEventListener('visibilitychange', h);
    return () => { window.removeEventListener('focus', h); document.removeEventListener('visibilitychange', h); };
  }, [currentId, contacts]); // eslint-disable-line react-hooks/exhaustive-deps

  // "Responder por": SEMPRE o canal pelo qual ESTA conversa foi recebida.
  // Prioridade: 1) ultimo_canal_id (último canal recebido); 2) canal_id (origem); senão vazio (escolha manual).
  // Inclui canais DESCONECTADOS (não troca silenciosamente para outro chip). NUNCA usa o chip da conversa
  // anterior, o primeiro da lista, nem o último envio do atendente.
  const autoCanalRef = useRef<{ conv: string; canal: string } | null>(null);
  useEffect(() => {
    if (!WA_REAL) return;
    const ult = current.ultimoCanal?.canalId;
    const canalDaConversa = (ult && realCanais.some((c) => c.id === ult)) ? ult
      : (current.canalId && realCanais.some((c) => c.id === current.canalId)) ? current.canalId
      : '';
    // recalcula ao trocar de conversa OU quando o canal real da conversa muda (ex.: novo inbound por outro chip).
    // Seleção manual (onReplyCanal) persiste enquanto o canal da conversa não muda.
    if (!autoCanalRef.current || autoCanalRef.current.conv !== currentId || autoCanalRef.current.canal !== canalDaConversa) {
      autoCanalRef.current = { conv: currentId, canal: canalDaConversa };
      setReplyCanalId(canalDaConversa);
    }
  }, [currentId, current.ultimoCanal?.canalId, current.canalId, realCanais.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const canalSel = realCanais.find((c) => c.id === replyCanalId) ?? null;
  const canalConectado = !WA_REAL || (canalSel?.status === 'conectado');
  const canalIndisponivel = WA_REAL && !!canalSel && !canalConectado;
  // Contenção: número com restrição de conta no WhatsApp -> bloqueado só para ENVIO (recebe normal).
  const canalRestrito = WA_REAL && !!canalSel?.envioRestrito;
  // Saúde de ENVIO do canal de resposta (mesmo conectado, o outbound pode estar falhando).
  const envioSaude = useWaCanalEnvioSaude(canalConectado && !canalRestrito ? (replyCanalId || current?.canalId) : null).data?.estado ?? 'ok';
  // Saúde de ENTREGA persistida (webhook classifica pelos ACKs reais): sessão conectada ≠ entrega funcionando.
  const canalEntrega = WA_REAL ? (canalSel?.entregaStatus ?? 'desconhecido') : 'ok';
  const canalEntregaProblema = canalEntrega === 'restrito' || canalEntrega === 'instavel';
  // Caso D: conversa sem número de resposta confirmado (origem LID). Bloqueia o envio até vincular um PN validado.
  const semDestino = WA_REAL && !!current.id && !!current.semDestino;

  /* ── Higiene obrigatória (regra pura em @/lib/higieneConversa) ──────────────────
     1) conversa ativa sem responsável EFETIVO → alerta forte; bloqueia envio conforme
        a entrada progressiva (nova bloqueia já; antiga só depois da adaptação);
     2) nome fraco → alerta com 2 adiamentos e depois bloqueio, com escape de 24h.
     Bloqueio é de FRONT (regra operacional, não segurança): o backend não muda. */
  const higQ = useHigieneConversa(current.id || null);
  const hig = higQ.data ?? HIGIENE_VAZIO;
  const adiarMut = useRegistrarAdiamento();
  const ativa = conversaAtiva({ status: current.status, arquivada: current.arquivada });
  const donoEfetivo = responsavelEfetivo(current);
  const agoraMs = Date.now();
  const acaoDono = decidirDono({ ativa, temDono: !!donoEfetivo, conversaCriadaEm: current.criadaEm ?? null, agoraMs, corteISO: HIGIENE_CORTE_ISO, diasAdaptacao: HIGIENE_DIAS_ADAPTACAO });
  const decNome = decidirNome({ ativa, nome: current.name, adiamentos: hig.adiamentos, liberadoAte: hig.liberadoAte, agoraMs });
  const higiene = estadoHigiene(acaoDono, decNome);
  const higieneBloqueia = WA_REAL && !!current.id && higiene.bloqueiaEnvio;

  /* ── Agendamento de mensagens (texto · editar/cancelar) ─ modal em AgendarMensagemModal ── */
  const agendarSeqMut = useAgendarSequencia();
  const editarMut = useEditarAgendamento();
  const cancelarMut = useCancelarAgendamento();
  const agendadasQ = useMensagensAgendadas(current.id || null);
  const agendadas = agendadasQ.data ?? [];
  // canais válidos para envio (conectado, ativo, não restrito/conflito/removido)
  const canaisAgendaveis = realCanais.filter((c) => canalValidoParaEnvio({
    id: c.id, nome: c.alias, ativo: true, status_integracao: c.status, envio_restrito: c.envioRestrito, conflito_com: c.conflitoCom,
  }).ok);
  function abrirAgendar() {
    if (!current.id) return;
    const daConversa = replyCanalId && canaisAgendaveis.some((c) => c.id === replyCanalId) ? replyCanalId : (canaisAgendaveis[0]?.id ?? '');
    setAgEditId(null); setAgInitial({ canalId: daConversa }); setAgendarOpen(true);
  }
  function abrirEditar(a: MensagemAgendada) {
    if (!current.id || a.status !== 'agendada') return;
    setAgEditId(a.id); setAgInitial({ canalId: a.canalId, texto: a.texto ?? '', executarEm: a.executarEm, tipo: a.tipo, nomeArquivo: a.nomeArquivo ?? undefined }); setAgendarOpen(true);
  }
  async function submeterAgendar(v: AgendarSubmit) {
    if (!current.id) return;
    if (v.modo === 'editar') {
      // edição: legenda(texto)/canal/data — mídia mantém o arquivo (RPC editar_agendamento).
      await editarMut.mutateAsync({ id: agEditId!, conversaId: current.id, canalId: v.canalId, texto: v.texto ?? '', executarEm: v.executarISO });
      toast('Agendamento atualizado.');
    } else {
      // criar (1..N blocos) → sequência atômica (mídia já subiu no modal).
      const itens = (v.itens ?? []).map((it) => ({
        tipo: it.tipo, texto: it.texto || null,
        storage_path: it.midia?.path, mime: it.midia?.mime, nome: it.midia?.nome, tamanho: it.midia?.tamanho, origem_audio: it.midia?.origemAudio,
      }));
      await agendarSeqMut.mutateAsync({ conversaId: current.id, canalId: v.canalId, executarEm: v.executarISO, itens });
      toast(itens.length > 1 ? `${itens.length} mensagens agendadas — serão enviadas no horário.` : 'Mensagem agendada — será enviada automaticamente no horário.');
    }
    setAgendarOpen(false);
  }
  async function cancelarAgendamento(a: MensagemAgendada) {
    if (!current.id || a.status !== 'agendada' || cancelarMut.isPending) return;
    if (!window.confirm('Cancelar este agendamento? A mensagem não será enviada.')) return;
    try {
      await cancelarMut.mutateAsync({ id: a.id, conversaId: current.id });
      toast('Agendamento cancelado.');
    } catch (e) { toast((e as Error).message || 'Falha ao cancelar.'); }
  }

  const [vincOpen, setVincOpen] = useState(false);
  const [vincTel, setVincTel] = useState('');
  const [vincBusy, setVincBusy] = useState(false);
  const [vincErr, setVincErr] = useState<string | null>(null);
  const [vincVal, setVincVal] = useState<{ numero: string; mascarado: string; jid: string } | null>(null);

  async function validarNumeroVinc() {
    if (vincBusy) return;
    // telemetria sanitizada do clique (sem número completo)
    try { console.log(JSON.stringify({ stage: 'validar_numero_click', conversation: (current.id || '').slice(0, 8), digits_length: (vincTel || '').replace(/\D/g, '').length })); } catch { /* ignore */ }
    if (!current.id) { setVincErr('Conversa inválida. Reabra a conversa e tente de novo.'); return; }
    const tel = normalizeWaPhone(vincTel);
    if (!tel) { setVincErr('Informe um telefone válido com DDD.'); return; }
    // NÃO retornar em silêncio: sem canal de resposta, avise (antes era um early-return mudo).
    if (!replyCanalId) { setVincErr('Não há canal de resposta definido para esta conversa. Selecione em "Responder por" e tente novamente.'); return; }
    setVincBusy(true); setVincErr(null); setVincVal(null);
    try {
      const r = await waValidarNumero(current.id, replyCanalId, tel);
      try { console.log(JSON.stringify({ stage: 'validar_numero_result', result: r?.exists ? 'success' : 'not_found' })); } catch { /* ignore */ }
      setVincVal({ numero: r.numero, mascarado: r.numero_mascarado, jid: r.jid });
    } catch (e) {
      try { console.log(JSON.stringify({ stage: 'validar_numero_result', result: 'error' })); } catch { /* ignore */ }
      setVincErr((e as Error).message);
    }
    finally { setVincBusy(false); }
  }
  async function confirmarVinculo() {
    if (vincBusy || !current.id || !replyCanalId || !vincVal) return;
    // telemetria sanitizada do clique (sem telefone completo) — prova handler/mutation no fluxo real.
    try { console.log(JSON.stringify({ stage: 'confirmar_vinculo_click', conversa: current.id.slice(0, 8), canal: replyCanalId.slice(0, 8), validado: true })); } catch { /* ignore */ }
    setVincBusy(true); setVincErr(null);
    try {
      await waVincularNumero(current.id, replyCanalId, vincVal.numero, vincVal.jid);
      await live.refetch();
      setVincOpen(false); setVincTel(''); setVincVal(null);
      toast('Número vinculado e confirmado. Você já pode responder.');
    } catch (e) { setVincErr((e as Error).message); }
    finally { setVincBusy(false); }
  }

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
    selecaoUsuarioRef.current = id; // seleção explícita do usuário (habilita marcar ESTA conversa como lida)
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

  /** Trava de higiene compartilhada por texto e mídia. true = não pode enviar agora. */
  function bloquearPorHigiene(): boolean {
    if (!higieneBloqueia) return false;
    if (higiene.motivoBloqueio === 'dono') toast('Esta conversa não tem responsável. Clique em "Assumir atendimento" para responder.', 'warn');
    else toast('Preencha o nome completo do cliente para continuar respondendo.', 'warn');
    return true;
  }

  /** "Lembrar depois" — consome 1 dos 2 adiamentos permitidos nesta conversa. */
  async function adiarNome() {
    if (!current.id || adiarMut.isPending) return;
    try {
      const r = await adiarMut.mutateAsync({ conversaId: current.id, tipo: 'nome_adiado' });
      const restam = Math.max(0, 2 - r.adiamentos);
      toast(restam > 0
        ? `Ok. Depois de mais ${restam === 1 ? 'um adiamento' : `${restam} adiamentos`} o nome vira obrigatório.`
        : 'Último adiamento usado. Na próxima o nome será obrigatório para responder.');
    } catch (e) { toast((e as Error).message || 'Falha ao adiar', 'warn'); }
  }

  /** "Cliente ainda não informou" — libera a conversa por 24h e fica registrado. */
  async function nomeNaoInformado() {
    if (!current.id || adiarMut.isPending) return;
    try {
      await adiarMut.mutateAsync({ conversaId: current.id, tipo: 'nome_nao_informado' });
      toast('Liberado por 24h. O aviso volta depois — registre o nome assim que o cliente informar.');
    } catch (e) { toast((e as Error).message || 'Falha ao liberar', 'warn'); }
  }

  /* ── Responder mensagem específica ─────────────────────────────────────── */
  function rotuloRespostaMsg(m: WaMessage): string {
    if (m.tipo === 'audio') return 'Mensagem de voz';
    if (m.tipo === 'imagem') return (m.text ?? '').trim() || 'Imagem';
    if (m.tipo === 'video') return (m.text ?? '').trim() || 'Vídeo';
    if (m.tipo === 'documento') return m.nome || 'Documento';
    return (m.text ?? '').trim();
  }
  function iniciarResposta(m: WaMessage) {
    if (!m.id) return; // precisa do id local p/ vincular a resposta
    const remetente = m.dir === 'out' ? (assinaturaNome?.trim() || 'Você') : (current.name || 'Cliente');
    setReplyTo({ id: m.id, idExt: m.idExterno, fromMe: m.dir === 'out', tipo: m.tipo || 'texto', texto: rotuloRespostaMsg(m).slice(0, 300), remetente });
    taRef.current?.focus();
  }
  const replyPayload = replyTo ? { id: replyTo.id, idExt: replyTo.idExt, fromMe: replyTo.fromMe, preview: { remetente: replyTo.remetente, tipo: replyTo.tipo, texto: replyTo.texto } } : undefined;
  const replyPreviewBolha = replyTo ? { remetente: replyTo.remetente, tipo: replyTo.tipo, texto: replyTo.texto } : undefined;

  function sendMsg() {
    const v = draft.trim();
    if (!v) return;
    if (enviandoRef.current) return; // impede dois envios concorrentes (duplo-clique / Enter duplo)
    if (WA_REAL && !currentId) return;
    if (canalRestrito) { toast('O número deste canal está com restrição no WhatsApp e está indisponível para envio. Selecione outro canal.', 'warn'); return; }
    if (canalIndisponivel) { toast('Este número está desconectado. Reconecte em Integrações para enviar.', 'warn'); return; }
    if (semDestino) { toast('Vincule um número confirmado para responder.', 'warn'); return; }
    // HIGIENE: trava o envio NOVO pelo painel. Não vale para retryMsg() — lá a mensagem já
    // foi escrita e falhou; travar só deixaria a falha presa sem ganho de cadastro.
    if (bloquearPorHigiene()) return;
    const now = new Date();
    const hh = ('0' + now.getHours()).slice(-2) + ':' + ('0' + now.getMinutes()).slice(-2);
    const corpo = assinaturaNome ? `*${assinaturaNome}:*\n${v}` : v;
    // append otimista com cid (id de cliente) para reconciliar/timeout sem id real. "pendente" até confirmar.
    const cid = 'tmp_' + now.getTime().toString(36) + Math.random().toString(36).slice(2, 7);
    setContacts((cur) => cur.map((c) => c.id === currentId ? { ...c, last: v, msgs: [...c.msgs, { dir: 'out', text: corpo, time: hh, status: 'pendente', cid, quoted: replyPreviewBolha }] } : c));
    setDraft('');
    const replyEnvio = replyPayload; // captura o contexto antes de limpar
    if (WA_REAL) {
      enviandoRef.current = true;
      const convAlvo = currentId;
      const marcarFalha = (erro: string) => setContacts((cur) => cur.map((c) => c.id === convAlvo
        ? { ...c, msgs: c.msgs.map((x) => x.cid === cid && x.status === 'pendente' ? { ...x, status: 'falhou', erro } : x) } : c));
      // timeout de segurança: nunca deixar "pendente" para sempre. O edge persiste 'falhou' e o refetch
      // (onSettled da mutation) reconcilia para a linha real com id; este timeout cobre o caso de não-resposta.
      const to = setTimeout(() => marcarFalha('Sem confirmação de envio a tempo. Tente novamente.'), 25000);
      sendMut.mutate(
        { conversaId: currentId, text: v, canalId: replyCanalId || current.canalId, assinaturaNome: assinaturaNome || undefined, replyTo: replyEnvio },
        {
          onError: (e) => { clearTimeout(to); marcarFalha((e as Error).message || 'Falha no envio.'); toast((e as Error).message || 'Falha ao enviar a mensagem', 'warn'); },
          onSuccess: () => { clearTimeout(to); setReplyTo(null); }, // resposta enviada → limpa o contexto
          onSettled: () => { enviandoRef.current = false; },
        },
      );
    } else {
      toast('Mensagem enviada');
    }
  }
  /** Retentativa: reaproveita a MESMA mensagem falhada (retry_mensagem_id), sem duplicar. */
  function retryMsg(m: WaMessage) {
    if (!m.id || !currentId || retryId) return;
    if (canalRestrito) { toast('O número deste canal está com restrição no WhatsApp e está indisponível para envio. Selecione outro canal.', 'warn'); return; }
    if (canalIndisponivel) { toast('Este número está desconectado. Reconecte em Integrações para reenviar.', 'warn'); return; }
    if (semDestino) { toast('Vincule um número confirmado para responder.', 'warn'); return; }
    setRetryId(m.id);
    // otimista: a mesma bolha volta para "enviando" (pendente) e limpa o erro.
    setContacts((cur) => cur.map((c) => c.id === currentId ? { ...c, msgs: c.msgs.map((x) => x.id === m.id ? { ...x, status: 'pendente', erro: undefined } : x) } : c));
    sendMut.mutate(
      { conversaId: currentId, text: m.text ?? '', canalId: replyCanalId || current.canalId, retryMensagemId: m.id },
      { onError: (e) => toast((e as Error).message || 'Falha ao reenviar a mensagem', 'warn'), onSettled: () => setRetryId(null) },
    );
  }
  function verErro(m: WaMessage) { setErroDialog(traduzErroEnvio(m.erro)); }
  /** Recarrega a mídia de um áudio pendente (re-baixa via Edge Function) e atualiza a conversa. */
  async function recarregarAudio(m: WaMessage) {
    if (!m.id || recarregando) return;
    setRecarregando(m.id);
    try { await waRecarregarAudio(currentOrg.id, m.id); await live.refetch(); }
    catch (e) { toast((e as Error).message || 'Não foi possível recarregar o áudio.', 'warn'); }
    finally { setRecarregando(null); }
  }
  /** Remove uma mensagem de SAÍDA com falha (não entregue). Atualiza a conversa na hora, sem reload. */
  async function removerFalha(m: WaMessage) {
    if (!m.id || removendoId) return;
    setRemovendoId(m.id);
    try {
      await removerMensagemFalha(m.id);
      setContacts((cur) => cur.map((c) => c.id === currentId ? { ...c, msgs: c.msgs.filter((x) => x.id !== m.id) } : c));
      setRemoverAlvo(null);
      toast('Mensagem com falha removida.');
    } catch (e) {
      toast((e as Error).message || 'Não foi possível remover a mensagem.', 'warn');
    } finally { setRemovendoId(null); }
  }
  /** Envio manual de IMAGEM: sobe ao bucket privado e envia pela Evolution (lança em falha -> mantém p/ retry). */
  async function enviarImagem(file: File, caption: string) {
    if (!currentId) throw new Error('Selecione uma conversa.');
    if (higieneBloqueia) throw new Error(higiene.motivoBloqueio === 'dono' ? 'Assuma o atendimento para responder.' : 'Preencha o nome completo do cliente para responder.');
    const up = await subirMidiaWa(currentOrg.id, file);
    await sendMut.mutateAsync({
      conversaId: currentId, canalId: replyCanalId || current.canalId,
      midiaPath: up.path, midiaTipo: 'imagem', midiaMime: up.mime, midiaNome: up.nome, midiaTamanho: up.tamanho,
      text: caption || undefined, replyTo: replyPayload,
    });
    setReplyTo(null);
  }
  /** Envio de ÁUDIO (gravado ou arquivo): sobe ao bucket privado e envia como nota de voz pela Evolution. */
  async function enviarAudio(blob: Blob, mime: string, ext: string, diag?: Record<string, unknown>) {
    if (!currentId) throw new Error('Selecione uma conversa.');
    if (higieneBloqueia) throw new Error(higiene.motivoBloqueio === 'dono' ? 'Assuma o atendimento para responder.' : 'Preencha o nome completo do cliente para responder.');
    if (!blob || blob.size === 0) throw new Error('Áudio vazio. Grave novamente.');
    const file = new File([blob], `audio-${Date.now()}.${ext}`, { type: mime });
    const up = await subirMidiaWa(currentOrg.id, file);
    const audioDiag = diag ? { correlation_id: diag.correlation_id, origem: diag.origem, blob_mime: diag.blob_mime, blob_size: diag.blob_size } : undefined; // observabilidade mínima
    // gravação do microfone => voz/PTT; arquivo anexado => mídia comum. Padrão: gravação (fonte do incidente).
    const origemAudio = (diag?.origem as string) === 'arquivo_anexado' ? 'arquivo_anexado' : 'gravacao_painel';
    await sendMut.mutateAsync({
      conversaId: currentId, canalId: replyCanalId || current.canalId,
      midiaPath: up.path, midiaTipo: 'audio', midiaMime: up.mime, midiaNome: up.nome, midiaTamanho: up.tamanho,
      audioDiag, origemAudio, replyTo: replyPayload,
    });
    setReplyTo(null);
  }
  /** Envio manual de DOCUMENTO: sobe ao bucket privado e envia pela Evolution (lança em falha -> mantém p/ retry). */
  async function enviarDocumento(file: File, caption: string) {
    if (!currentId) throw new Error('Selecione uma conversa.');
    if (higieneBloqueia) throw new Error(higiene.motivoBloqueio === 'dono' ? 'Assuma o atendimento para responder.' : 'Preencha o nome completo do cliente para responder.');
    const up = await subirMidiaWa(currentOrg.id, file);
    await sendMut.mutateAsync({
      conversaId: currentId, canalId: replyCanalId || current.canalId,
      midiaPath: up.path, midiaTipo: 'documento', midiaMime: up.mime, midiaNome: up.nome, midiaTamanho: up.tamanho,
      text: caption || undefined, replyTo: replyPayload,
    });
    setReplyTo(null);
  }
  /** Abre um documento do histórico via URL assinada gerada sob demanda. */
  async function abrirDocumento(m: WaMessage) {
    if (!m.anexoPath) return;
    try { const url = await urlAssinadaMidiaWa(m.anexoPath); window.open(url, '_blank', 'noopener'); }
    catch { toast('Não foi possível abrir o documento.', 'warn'); }
  }
  /**
   * Baixa a mídia com o nome/extensão corretos. URL assinada de 60s com Content-Disposition
   * (bucket privado; a policy do Storage garante que só a própria organização acessa).
   */
  async function baixarMidia(m: WaMessage) {
    if (!m.anexoPath || baixando) return;
    const nome = nomeArquivoMidia(m);
    setBaixando(m.id ?? m.anexoPath);
    try {
      const url = await urlDownloadMidiaWa(m.anexoPath, nome);
      const a = document.createElement('a');
      a.href = url; a.download = nome; a.rel = 'noopener';
      document.body.appendChild(a); a.click(); a.remove();
    } catch {
      toast('Não foi possível baixar o arquivo. Tente novamente.', 'warn');
    } finally { setBaixando(null); }
  }
  /** Assumir o atendimento (responsável = usuário atual). Concorrência/permissão validadas no backend. */
  async function assumir() {
    if (!current.contatoId || !user?.id || atribuindo) return;
    setAtribuindo(true);
    const esperado = current.respId || null;
    setContacts((cur) => cur.map((c) => c.id === current.id ? { ...c, respId: user.id } : c)); // otimista
    try { await atribuirMut.mutateAsync({ contatoId: current.contatoId, destinoId: user.id, esperadoId: esperado, conversaId: current.id }); toast('Você assumiu o atendimento'); }
    catch (e) { setContacts((cur) => cur.map((c) => c.id === current.id ? { ...c, respId: esperado } : c)); toast((e as Error).message || 'Falha ao assumir', 'warn'); }
    finally { setAtribuindo(false); }
  }
  /** Devolver o atendimento para a fila (responsável = ninguém). Registra na timeline. */
  async function devolverParaFila() {
    setPop(null);
    if (!current.contatoId || atribuindo || !current.respId) return;
    setAtribuindo(true);
    const esperado = current.respId || null;
    setContacts((cur) => cur.map((c) => c.id === current.id ? { ...c, respId: null } : c)); // otimista
    try { await atribuirMut.mutateAsync({ contatoId: current.contatoId, destinoId: null, esperadoId: esperado, conversaId: current.id }); toast('Atendimento devolvido para a fila'); }
    catch (e) { setContacts((cur) => cur.map((c) => c.id === current.id ? { ...c, respId: esperado } : c)); toast((e as Error).message || 'Falha ao devolver', 'warn'); }
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
  function abrirTransferir() { setPop(null); setTransferSel(''); setTransferBusca(''); setTransferMotivo(''); setTransferOpen(true); }
  /** Transferir o atendimento para outro usuário ativo da organização (motivo obrigatório; registra timeline). */
  async function transferir(destinoId: string) {
    if (!current.contatoId || !destinoId || atribuindo) return;
    if (!transferMotivo.trim()) { toast('Informe o motivo da transferência.', 'warn'); return; }
    setAtribuindo(true);
    const esperado = current.respId || null;
    setContacts((cur) => cur.map((c) => c.id === current.id ? { ...c, respId: destinoId } : c)); // otimista
    try { await atribuirMut.mutateAsync({ contatoId: current.contatoId, destinoId, esperadoId: esperado, conversaId: current.id, motivo: transferMotivo.trim() }); setTransferOpen(false); setTransferSel(''); setTransferBusca(''); setTransferMotivo(''); toast('Atendimento transferido'); }
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
  async function arquivarConversa(arquivar: boolean) {
    setPop(null);
    if (!current.id) return;
    try { await waArquivar(current.id, arquivar); await live.refetch(); toast(arquivar ? 'Conversa arquivada' : 'Conversa desarquivada'); }
    catch (e) { toast((e as Error).message || 'Falha ao arquivar', 'warn'); }
  }
  async function marcarLida(lida: boolean) {
    setPop(null);
    if (!current.id) return;
    try { await waMarcarLida(current.id, lida); await live.refetch(); }
    catch (e) { toast((e as Error).message || 'Falha ao atualizar leitura', 'warn'); }
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

  const sendDisabled = draft.trim() === '' || semDestino || (WA_REAL && (!current.id || !canalConectado));
  const statusDefs = statusQ.data ?? [];
  const statusAtivos = statusDefs.filter((s) => s.ativo);
  // status do contato atual resolvido pela definição configurável (cor/nome); fallback ao rótulo legado.
  const statusDefAtual = statusDefs.find((s) => s.id === current.statusId) ?? null;
  const statusNomeAtual = statusDefAtual?.nome ?? current.status;
  const statusCorAtual = statusDefAtual?.cor ?? current.statusCor ?? null;
  const etiquetas = etiquetasQ.data ?? [];
  const etiquetasAtivas = etiquetas.filter((e) => e.ativo);
  const orgUsuarios = orgUsuariosQ.data ?? [];
  // resolve nome do usuário p/ a etiqueta de atendente (conversa -> contato -> oportunidade)
  const nomePorId = (id: string): string | null => orgUsuarios.find((u) => u.id === id)?.nome ?? null;
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
              <button key={t.id} className={'tab' + (tab === t.id ? ' active' : '')} title={t.id === 'pendentes' ? 'Pendentes inclui mensagens não lidas e clientes aguardando resposta.' : undefined} onClick={() => setTab(t.id)}>
                {t.label}
                {tabCounts[t.id] != null && tabCounts[t.id] > 0 && <span className="tab-n">{tabCounts[t.id]}</span>}
              </button>
            ))}
          </div>
        </div>
        <div className="conv-list">
          {filtered.length === 0 ? (
            // "vazio" e "carregando" são coisas diferentes: enquanto a lista não chega, dizer
            // "Nenhuma conversa" é MENTIRA e é o que dava a sensação de tela piscando vazia.
            (WA_REAL && live.isLoading && contacts.length === 0)
              ? <div className="conv-skel" aria-busy="true" aria-label="Carregando conversas">
                  {[0, 1, 2, 3, 4, 5].map((i) => (
                    <div className="conv-skel-row" key={i}>
                      <span className="conv-skel-av" />
                      <span className="conv-skel-lines"><i style={{ width: (58 + (i % 3) * 12) + '%' }} /><i style={{ width: (72 - (i % 4) * 9) + '%' }} /></span>
                    </div>
                  ))}
                </div>
              : <div style={{ padding: '30px 12px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>Nenhuma conversa nesta aba.</div>
          ) : (() => {
            const renderConv = (c: WaContact) => {
            const wait = c.aguardando ? tempoEspera(c.aguardandoDesde) : null;
            // atendente responsável — mesma ordem da etiqueta: conversa -> contato -> oportunidade
            const atendId = responsavelEfetivo(c);
            const atendNome = atendId ? (nomePorId(atendId) ?? 'Atendente') : 'Não atribuído';
            // cliente sem nome real (vazio ou só dígitos/telefone) → rótulo + telefone REAL secundário.
            // Nunca exibe o LID/nome-numérico como "telefone" (identificador técnico).
            const nomeVazio = !c.name?.trim() || /^[\d\s()+\-]+$/.test(c.name.trim());
            const telSec = c.phone ? mascararNumero(c.phone) : '';
            // status operacional + tempo de espera ("Aguardando cliente · 12 h" / "Atrasado")
            const tempoCurto = wait ? wait.label.replace(/^Aguardando (há )?/, '') : '';
            const atrasado = wait?.tier === 'critico' || wait?.tier === 'vermelho';
            const finalizado = c.status === 'Resolvida' || c.status === 'Fechada';
            const statusTxt = wait
              ? (atrasado ? 'Atrasado' : 'Aguardando cliente') + (tempoCurto ? ' · ' + tempoCurto : '')
              : (finalizado ? 'Finalizado' : (c.status || 'Em atendimento'));
            const barTier = wait ? (atrasado ? 'critico' : 'aguardando') : (c.id === currentId ? 'ativo' : 'neutro');
            const slaChips = slaPorConversa.get(c.id) ?? [];
            // Etiquetas (padrão WhatsApp Business): [LEAD NOVO] OU [ATENDENTE] [ETAPA].
            const badges = etiquetasDaConversa(c, nomePorId);
            // Higiene: cadastro fraco vira badge na lista. A etiqueta LEAD NOVO já sinaliza "sem dono".
            const nomeRuim = analisarNome(c.name).fraco && conversaAtiva({ status: c.status, arquivada: c.arquivada });
            // ---- fileira de chips: ETAPA + ATENDENTE + canal (pedido do dono: "o card precisa
            // deixar claro em qual etapa do Kanban está, quem atende e por onde entrou").
            // "Atrasado · Xh", "Nome incompleto", SLA e precisa-humano SAÍRAM do card visível:
            // viram UM indicador ⚠ discreto com tudo no tooltip. A REGRA continua viva — barra
            // lateral colorida (barTier), bloqueios de envio e o motor de SLA
            // não foram tocados; só a apresentação mudou.
            const eAtendente = badges.find((b) => b.tipo === 'atendente');
            const eSituacao = badges.find((b) => b.tipo === 'situacao');
            const alertas: string[] = [];
            if (atrasado && tempoCurto) alertas.push('Sem resposta há ' + tempoCurto);
            for (const a of slaChips) alertas.push(tipoLabel(a.tipo) + (a.detalhe ? ' — ' + a.detalhe : ''));
            if (c.precisaHumano) alertas.push('Precisa de atendimento humano');
            if (nomeRuim) alertas.push('Cadastro incompleto: preencha o nome do cliente');
            return (
            <div key={c.id} data-cid={c.id} className={'conv conv--' + barTier + (c.id === currentId ? ' active' : '') + ((c.unread ?? 0) > 0 ? ' has-unread' : '')}
                 title={'Atendente: ' + atendNome + ' · Canal: WhatsApp ' + c.chip + ' · ' + statusTxt + ' · ' + c.time}
                 onClick={() => selectContact(c.id)}>
              {/* canal deixou de ser chip de texto: virou micro-badge no avatar (sigla + nome no tooltip) */}
              <span className="cav">
                <Avatar name={c.name} />
                <i className="cav-canal" title={'Canal atual: ' + c.chip} aria-label={'Canal ' + c.chip}>{siglaCanal(c.chip)}</i>
              </span>
              <div className="cbody">
                <div className="crow">
                  {c.fixada && <i className="cflag" title="Fixada" aria-label="Fixada">📌</i>}
                  {c.silenciada && <i className="cflag" title="Silenciada" aria-label="Silenciada">🔕</i>}
                  {c.arquivada && <i className="cflag" title="Arquivada" aria-label="Arquivada">🗄️</i>}
                  {/* sem nome cadastrado: o telefone MASCARADO é o identificador real do cliente e
                      vira o rótulo — "Cliente sem nome" + telefone ocupava duas vagas e truncava os
                      dois. A pendência de cadastro continua sinalizada pelo chip "Nome incompleto".
                      Sem telefone (contato LID-only) cai no rótulo genérico, nunca no LID. */}
                  <span className="cname">{nomeVazio ? (telSec || 'Cliente sem nome') : formatarNomeCliente(c.name)}</span>
                </div>
                <div className="cbadges">
                  {eSituacao && <span className={'ctag ctag--' + (eSituacao.variante ?? 'atendimento')} title="Etapa no Kanban">{eSituacao.texto}</span>}
                  {alertas.length > 0 && (
                    <span className="ctag ctag--alerta" title={alertas.join(' · ')} aria-label={alertas.join('. ')}>⚠{alertas.length > 1 ? ' ' + alertas.length : ''}</span>
                  )}
                  {finalizado && <span className="ctag ctag--fim" title={'Conversa ' + (c.status ?? 'finalizada')}>Finalizado</span>}
                </div>
                <div className="cprev">{c.last || '—'}</div>
              </div>
              {/* coluna direita (referência): pill do atendente, tempo relativo e badge de não lidas */}
              <div className="cright">
                <span className="cresp" title="Atendente responsável">{eAtendente ? eAtendente.texto : 'Não atribuído'}</span>
                <span className="ctime" title={'Última interação: ' + c.time}>{c.lastAtMs ? tempoRelativo(new Date(c.lastAtMs).toISOString(), relogioMs) : c.time}</span>
                {c.unread > 0 && <span className="unread" title={c.unread + ' não lidas'} aria-label={c.unread + ' mensagens não lidas'}>{c.unread > 99 ? '99+' : c.unread}</span>}
              </div>
            </div>
            );
            };
            // Cabeçalhos de grupo (referência): "Não atribuídos" primeiro (é o que exige ação),
            // depois atendentes em ordem alfabética. Agrupa a MESMA lista filtrada — ordenação
            // interna (fixadas/recência) preservada dentro de cada grupo.
            const grupos = new Map<string, typeof filtered>();
            for (const c of filtered) { const k = responsavelEfetivo(c) ?? ''; if (!grupos.has(k)) grupos.set(k, []); grupos.get(k)!.push(c); }
            const nomeDe = (k: string) => (k === user?.id ? 'Você' : (nomePorId(k) ?? 'Atendente'));
            const chaves = [...grupos.keys()].sort((a, b) => {
              if (!a) return -1; if (!b) return 1;
              return nomeDe(a).localeCompare(nomeDe(b), 'pt-BR');
            });
            return chaves.map((k) => (
              <div className="conv-grupo" key={k || 'sem'}>
                <div className="conv-grupo-h">{k ? <>Atendimento distribuído para <b>{nomeDe(k)}</b></> : 'Não atribuídos'}</div>
                {grupos.get(k)!.map(renderConv)}
              </div>
            ));
          })()}
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
            {/* Cabeçalho focado no CLIENTE (referência Helena CRM): avatar + nome em destaque e as
                tags logo abaixo — etapa do Kanban, canal, atendente e status. Substitui as células
                técnicas "Canal / Status / Atendente" (a informação é a MESMA, muda a apresentação).
                Sem nome cadastrado, o telefone mascarado vira o rótulo (mesma regra do card). */}
            {(() => {
              const hNomeVazio = !current.name?.trim() || /^[\d\s()+\-]+$/.test(current.name.trim());
              const hNome = hNomeVazio ? (current.phone ? mascararNumero(current.phone) : 'Cliente sem nome') : (formatarNomeCliente(current.name) || current.name);
              const hSit = current.id ? etiquetasDaConversa(current, nomePorId).find((b) => b.tipo === 'situacao') : null;
              return (
                <div className="ch-id ch-id--cliente">
                  <Avatar name={current.name} />
                  <div className="ch-id-text">
                    <div className="ch-name" title={hNome} tabIndex={0} aria-label={hNome}>{hNome}</div>
                    <div className="ch-tags">
                      {hSit && <span className={'ctag ctag--' + (hSit.variante ?? 'atendimento')} title="Etapa no Kanban">{hSit.texto}</span>}
                      {current.chip && <span className="ctag ctag--canal" title="Canal atual do atendimento">{current.chip.toLocaleUpperCase('pt-BR')}</span>}
                      <span className="ctag ctag--atendente" title="Atendente responsável">{respNome ? (current.respId === user?.id ? 'VOCÊ' : respNome.toLocaleUpperCase('pt-BR')) : 'Não atribuído'}</span>
                      {statusNomeAtual && (
                        <span className="status-badge" style={{ background: (statusCorAtual ?? '#64748b') + '22', color: statusCorAtual ?? 'var(--ink-2)' }}>
                          <span className="sdot" style={{ background: statusCorAtual ?? '#64748b' }} />{statusNomeAtual}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}
            {/* pill de telefone só quando o painel direito está FECHADO — aberto, ele já mostra o
                telefone, e a duplicata roubava a largura que cortava o pill de status das tags. */}
            {!dataOpen && current.phone && <span className="ch-phone-pill" title="Telefone do cliente"><span style={{ color: 'var(--wa)', display: 'inline-flex' }}><IcWa /></span>{current.phone}</span>}
          <div className="ch-actions">
            {/* responsável EFETIVO (conversa → contato → oportunidade): antes olhava só
                contatos.responsavel_id e oferecia "Assumir" em conversa que já tinha dono na oportunidade. */}
            {current.id && (donoEfetivo
              ? <button className="ch-resp-btn" disabled={atribuindo} title="Transferir atendimento" onClick={abrirTransferir}><IcTransfer /><span>Transferir</span></button>
              : <button className="ch-resp-btn primary" disabled={atribuindo} title="Assumir atendimento" onClick={assumir}><IcUserPlus /><span>Assumir</span></button>)}
            <button className={'icon-btn' + (foco ? ' on' : '')} title="Modo de foco (Esc para sair)" onClick={() => setFoco((v) => !v)}><IcFocus /></button>
            <button ref={acoesBtnRef} className={'icon-btn' + (pop?.kind === 'acoes' ? ' on' : '')} title="Ações" aria-label="Ações da conversa" aria-haspopup="menu" aria-expanded={pop?.kind === 'acoes'} disabled={!current.id} onClick={(e) => { e.stopPropagation(); togglePop('acoes', acoesBtnRef, 'right'); }}><IcDots /></button>
          </div>
        </header>

        <SlaConversaBanner alertas={slaPorConversa.get(currentId) ?? []} />

        {/* HIGIENE 1 — conversa sem responsável. Alerta forte no topo; bloqueia envio quando
            a entrada progressiva mandar (nova = já; antiga = depois da adaptação). */}
        {WA_REAL && !!current.id && higiene.dono !== 'livre' && (
          <div className={'hig-banner hig-slim' + (higiene.dono === 'bloqueia' ? ' hig-bloq' : '')}
               title={higiene.dono === 'bloqueia'
                 ? 'Esta conversa ainda não tem responsável. Assuma o atendimento para responder e evitar perda de lead.'
                 : 'Esta conversa ainda não tem responsável. Assuma o atendimento para responder e evitar perda de lead. Em breve isto será obrigatório.'}>
            <IcWarn />
            <div className="hig-txt"><b>Sem responsável</b>{higiene.dono === 'bloqueia' ? ' — obrigatório para responder' : ''}</div>
            <button className="hig-btn" disabled={atribuindo} onClick={assumir}>
              <IcUserPlus />Assumir
            </button>
          </div>
        )}

        {/* HIGIENE 2 — cadastro do nome. Progressiva: 2 adiamentos, depois obrigatório;
            "cliente ainda não informou" libera 24h. Só cobra quando já há responsável. */}
        {WA_REAL && !!current.id && higiene.dono === 'livre' && decNome.acao !== 'livre' && (
          <div className={'hig-banner hig-slim' + (decNome.acao === 'bloqueia' ? ' hig-bloq' : ' hig-nome')}
               title={(decNome.acao === 'bloqueia' ? 'Preencha o nome completo para continuar. ' : 'O cadastro deste cliente está incompleto. ')
                 + (decNome.analise.motivo === 'comercio'
                   ? 'O nome parece ser de um comércio. Se for pessoa física, corrija para o nome completo.'
                   : 'Preencha o nome completo para facilitar follow-up, relatórios e atendimento.')}>
            <IcWarn />
            <div className="hig-txt">
              <b>{decNome.acao === 'bloqueia' ? 'Nome obrigatório' : 'Cadastro incompleto'}</b>
              {decNome.analise.motivo === 'comercio' && <span className="hig-sub"> · parece comércio</span>}
              {decNome.podeAdiar && decNome.adiamentosRestantes < 2 && (
                <span className="hig-sub"> · resta {decNome.adiamentosRestantes === 1 ? '1 adiamento' : `${decNome.adiamentosRestantes} adiamentos`}</span>
              )}
            </div>
            <button className="hig-btn" onClick={iniciarEdicao}>Editar nome</button>
            {decNome.podeAdiar && (
              <button className="hig-btn ghost" disabled={adiarMut.isPending} onClick={adiarNome}>Lembrar depois</button>
            )}
            {decNome.acao === 'bloqueia' && (
              <button className="hig-btn ghost" disabled={adiarMut.isPending} onClick={nomeNaoInformado} title="Libera por 24h e fica registrado">
                Cliente ainda não informou
              </button>
            )}
          </div>
        )}

        <div className="messages" ref={msgsRef}>
          {construirItensConversa(current.msgs, (m) => m.tsISO).map((item) => {
            // Separador de dia (estilo WhatsApp) — construído por função pura testada.
            if (item.tipo === 'sep') return <div key={item.chave} className="day-sep"><span>{item.label}</span></div>;
            const m = item.msg;
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
                <button type="button" className="msg-falha-link" disabled={!m.id || retryId === m.id || semDestino} title={semDestino ? 'Vincule um número confirmado para responder' : undefined} onClick={() => retryMsg(m)}>{retryId === m.id ? 'Reenviando…' : 'Tentar novamente'}</button>
                <span className="msg-falha-sep">·</span>
                <button type="button" className="msg-falha-link" disabled={!m.id || removendoId === m.id} onClick={() => setRemoverAlvo(m)}>{removendoId === m.id ? 'Removendo…' : 'Remover'}</button>
              </span>
            ) : null;
            // horário + status discretos, para a faixa de legenda do card de mídia
            const metaInline = (
              <span className="media-cap-meta">{m.time}{ack && <span className={'tick ' + ack.cls} title={m.status === 'falhou' ? traduzErroEnvio(m.erro) : ack.title}>{ack.ticks}</span>}</span>
            );
            // Ação de baixar a mídia: ÍCONE apenas (sem texto) — dentro da própria mídia.
            // Nome/extensão corretos via URL assinada curta (a lógica não muda, só o visual).
            const dlBtn = (m.anexoPath && m.status !== 'falhou') ? (
              <button
                type="button"
                className={'midia-dl' + (baixando === (m.id ?? m.anexoPath) ? ' is-baixando' : '')}
                onClick={() => baixarMidia(m)}
                disabled={baixando === (m.id ?? m.anexoPath)}
                title={rotuloBaixarMidia(m.tipo)}
                aria-label={rotuloBaixarMidia(m.tipo)}
              >
                <IcDownload />
              </button>
            ) : null;
            const rotuloQ = (q?: { tipo?: string; texto?: string }) => q?.texto?.trim() || (q?.tipo === 'audio' ? 'Mensagem de voz' : q?.tipo === 'imagem' ? 'Imagem' : q?.tipo === 'video' ? 'Vídeo' : q?.tipo === 'documento' ? 'Documento' : '');
            return (
              <div key={item.chave} className={'msg ' + m.dir}>
                {m.quoted && (
                  <div className="msg-quoted"><span className="mq-rem">{m.quoted.remetente || (m.dir === 'out' ? 'Você' : current.name)}</span><span className="mq-txt">{rotuloQ(m.quoted)}</span></div>
                )}
                {m.id && !semDestino && (
                  <button type="button" className="msg-reply-btn" title="Responder" aria-label="Responder" onClick={() => iniciarResposta(m)}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 17 3 12l6-5" /><path d="M3 12h11a6 6 0 0 1 6 6v1" /></svg>
                  </button>
                )}
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
                      acaoNode={dlBtn}
                    />
                  ) : m.midiaPendente ? (
                    <>
                      <div className="bubble bubble-falha bubble-audio-falha"><IcMic />Áudio indisponível — <button type="button" className="msg-falha-link" disabled={!m.id || recarregando === m.id} onClick={() => recarregarAudio(m)}>{recarregando === m.id ? 'Carregando…' : 'tentar carregar novamente'}</button></div>
                      {tempo}
                    </>
                  ) : null
                ) : m.tipo === 'imagem' ? (
                  <>
                    {m.anexoPath
                      ? <MsgImage path={m.anexoPath} nome={m.nome} caption={m.text || undefined} metaNode={m.text ? metaInline : undefined} falhou={m.status === 'falhou'} onOpen={setLightbox} acaoNode={dlBtn} />
                      : <div className="media-card bubble-img"><div className="msg-img-fallback"><span className="mif-txt">Imagem indisponível</span></div></div>}
                    {!m.text && tempo}
                    {falhaActs}
                  </>
                ) : m.tipo === 'video' ? (
                  <>
                    {m.anexoPath
                      ? <MsgVideo path={m.anexoPath} nome={m.nome} caption={m.text || undefined} metaNode={m.text ? metaInline : undefined} falhou={m.status === 'falhou'} acaoNode={dlBtn} />
                      : <div className="media-card bubble-img"><div className="msg-img-fallback"><span className="mif-txt">Vídeo indisponível</span></div></div>}
                    {!m.text && tempo}
                    {falhaActs}
                  </>
                ) : m.tipo === 'documento' ? (
                  <>
                    <div className={'media-card bubble-doc' + (m.status === 'falhou' ? ' media-falha' : '')}>
                      <div className="doc-card doc-card-info">
                        <span className="doc-ic"><IcDoc /></span>
                        <span className="doc-info">
                          <span className="doc-nome">{m.nome || 'documento'}</span>
                          <span className="doc-meta">{(m.nome?.split('.').pop() || '').toUpperCase()}{m.tamanho ? ' · ' + fmtTam(m.tamanho) : ''}</span>
                        </span>
                      </div>
                      {m.anexoPath && m.status !== 'falhou' && (
                        <div className="doc-acts">
                          <button type="button" className="doc-act" onClick={() => baixarMidia(m)} disabled={baixando === (m.id ?? m.anexoPath)} title={rotuloBaixarMidia(m.tipo)}>
                            <IcDownload />{baixando === (m.id ?? m.anexoPath) ? 'Baixando…' : 'Baixar'}
                          </button>
                          <button type="button" className="doc-act doc-act-sec" onClick={() => abrirDocumento(m)} title="Abrir em nova aba">Abrir</button>
                        </div>
                      )}
                      {m.text && (
                        <div className="media-cap">
                          <div className="media-cap-text"><WhatsAppText text={m.text} /></div>
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

          {/* Avisos do compositor — Bloco 3. Eram até 4 blocos empilhados com texto de 2 linhas cada;
              viraram UMA linha, com a explicação completa no title. Duas intensidades de propósito:
              .warn-bloq (vermelho) para o que IMPEDE o envio — "precisa incomodar" — e o tom leve para
              o que é só informativo. NENHUMA das flags mudou: quem bloqueia continua sendo
              canalIndisponivel / canalRestrito / semDestino / higieneBloqueia, e o placeholder do
              textarea segue dizendo o motivo no ponto de ação. */}
          {canalIndisponivel && (
            <div className="warn warn-slim warn-bloq"
                 title={`Esta conversa entrou por ${canalSel?.alias}, mas a conexão está ${canalSel?.status === 'removido' ? 'removida' : 'desconectada'}. O histórico permanece; selecione outro canal para responder ou reconecte.`}>
              <IcWarn /><span className="warn-txt"><b>{canalSel?.alias}</b> {canalSel?.status === 'removido' ? 'removido' : 'desconectado'} — selecione outro canal</span>
              <button className="link-btn" onClick={() => navigate('/integracoes')}>Reconectar</button>
            </div>
          )}
          {/* Conta com restrição no WhatsApp: bloqueado só para ENVIO; recebimento segue normal. */}
          {!canalIndisponivel && canalRestrito && (
            <div className="warn warn-slim warn-bloq"
                 title={`O número ${canalSel?.alias} está com restrição no WhatsApp e está indisponível para envio. Selecione outro canal em "Responder por" para responder.`}>
              <IcWarn /><span className="warn-txt"><b>{canalSel?.alias}</b> com restrição no WhatsApp — selecione outro canal</span>
            </div>
          )}
          {/* Canal conectado, mas com envio falhando (state=open não garante envio). Recebimento segue
              normal. NÃO bloqueia nada → fica no tom mais leve de todos (sem barra vermelha). */}
          {!canalIndisponivel && !canalRestrito && (envioSaude !== 'ok' || canalEntregaProblema) && (
            <div className="warn warn-slim warn-info"
                 title={canalEntrega === 'restrito'
                   ? `Este canal (${canalSel?.alias}) está conectado, mas falhou na entrega de mensagens recentes. Prefira outro canal em "Responder por" e evite reconectar repetidamente.`
                   : envioSaude === 'indisponivel'
                     ? `O canal ${canalSel?.alias} está recebendo mensagens, mas não consegue enviar no momento. Selecione outro canal para responder (o envio por outro número muda o remetente para o cliente).`
                     : `O envio pelo canal ${canalSel?.alias} está instável agora (algumas mensagens estão falhando). Se falhar, selecione outro canal em "Responder por".`}>
              <IcWarn />
              <span className="warn-txt">
                {canalEntrega === 'restrito'
                  ? <><b>{canalSel?.alias}</b> falhou na entrega recente</>
                  : envioSaude === 'indisponivel'
                    ? <><b>{canalSel?.alias}</b> recebe, mas não envia agora</>
                    : <>Envio instável por <b>{canalSel?.alias}</b></>}
              </span>
            </div>
          )}
          {semDestino && !canalIndisponivel && (
            <div className="warn warn-slim warn-bloq"
                 title="Esta conversa foi recebida por uma identidade protegida do WhatsApp e ainda não possui um número confirmado para resposta. O histórico permanece.">
              <IcWarn /><span className="warn-txt">Identidade protegida — sem número para resposta</span>
              <button className="link-btn" onClick={() => { setVincErr(null); setVincVal(null); setVincTel(current.phone || ''); setVincOpen(true); }}>Vincular número</button>
            </div>
          )}

          {agendadas.filter((a) => ['agendada', 'processando', 'falhou', 'bloqueada'].includes(a.status)).length > 0 && (
            <div className="ag-lista">
              {agendadas.filter((a) => ['agendada', 'processando', 'falhou', 'bloqueada'].includes(a.status)).map((a) => {
                const criador = a.criadoPor ? nomePorId(a.criadoPor) : null;
                const tipoLbl = a.tipo === 'imagem' ? 'Imagem' : a.tipo === 'audio' ? 'Áudio' : a.tipo === 'video' ? 'Vídeo' : a.tipo === 'documento' ? 'Documento' : 'Texto';
                return (
                <div key={a.id} className={'ag-item ag-' + a.status}>
                  <IcClock />
                  <div className="ag-item-txt">
                    <b>{a.status === 'agendada' ? 'Agendada' : a.status === 'processando' ? 'Enviando…' : a.status === 'bloqueada' ? 'Bloqueada' : 'Falhou'}</b>
                    {' '}para {new Date(a.executarEm).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    {' · '}{tipoLbl}
                    {a.nomeArquivo ? ` · ${a.nomeArquivo}` : ''}
                    {a.nomeCanal ? ` · via ${a.nomeCanal}` : ''}
                    {criador ? ` · por ${criador}` : ''}
                    {(a.motivoBloqueio || a.ultimoErro) && <span className="ag-item-err"> · {a.motivoBloqueio || a.ultimoErro}</span>}
                  </div>
                  {a.status === 'agendada' && (
                    <div className="ag-item-acts">
                      <button type="button" className="ag-mini" onClick={() => abrirEditar(a)} disabled={cancelarMut.isPending}>Editar</button>
                      <button type="button" className="ag-mini danger" onClick={() => cancelarAgendamento(a)} disabled={cancelarMut.isPending}>Cancelar</button>
                    </div>
                  )}
                </div>
                );
              })}
            </div>
          )}

          {replyTo && (
            <div className="reply-box">
              <span className="reply-box-bar" />
              <div className="reply-box-body">
                <div className="reply-box-rem">Respondendo a {replyTo.remetente}</div>
                <div className="reply-box-txt">{replyTo.texto || (replyTo.tipo === 'audio' ? 'Mensagem de voz' : replyTo.tipo === 'imagem' ? 'Imagem' : replyTo.tipo === 'video' ? 'Vídeo' : replyTo.tipo === 'documento' ? 'Documento' : '')}</div>
              </div>
              <button type="button" className="reply-box-x" aria-label="Cancelar resposta" onClick={() => setReplyTo(null)}>×</button>
            </div>
          )}
          <div className="input-wrap">
            <textarea ref={taRef} className="msg-input" rows={1} placeholder={semDestino ? 'Vincule um número para responder' : (canalIndisponivel ? 'Envio bloqueado: número desconectado' : (canalRestrito ? 'Envio bloqueado: número com restrição no WhatsApp' : (textoBloqueio(higiene) ?? 'Digite sua mensagem...')))}
              value={draft} onChange={(e) => setDraft(e.target.value)} disabled={canalIndisponivel || semDestino || canalRestrito || higieneBloqueia}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); } }} />
            <div className="composer-bar">
              <button className="cbar-act" title="Enviar imagem" aria-label="Enviar imagem" disabled={semDestino || canalRestrito || higieneBloqueia || (WA_REAL && (!current.id || !canalConectado))} onClick={() => setImgModal(true)}><IcImage /><span>Imagem</span></button>
              <AudioRecorder disabled={semDestino || canalRestrito || higieneBloqueia || (WA_REAL && (!current.id || !canalConectado))} onEnviar={enviarAudio} />
              <button className="cbar-act" title="Enviar documento" aria-label="Enviar documento" disabled={semDestino || canalRestrito || higieneBloqueia || (WA_REAL && (!current.id || !canalConectado))} onClick={() => setDocModal(true)}><IcDoc /><span>Arquivo</span></button>
              <button className="cbar-act" title="Agendar mensagem" aria-label="Agendar mensagem" disabled={semDestino || higieneBloqueia || (WA_REAL && (!current.id || canaisAgendaveis.length === 0))} onClick={abrirAgendar}><IcClock /><span>Agendar</span></button>
              <span className="spacer" />
              <button ref={scriptsBtnRef} className="scripts-btn" disabled={semDestino} onClick={(e) => { e.stopPropagation(); togglePop('scripts', scriptsBtnRef, 'right'); }}><IcScripts />Scripts<IcCaret /></button>
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
            {editMode ? <input className="edit-input" value={editForm.nome} onChange={(e) => setEditForm((f) => ({ ...f, nome: e.target.value }))} /> : <div className="dval">{formatarNomeCliente(current.name) || current.name}</div>}
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

          <div className="dfield"><KanbanContatoBox contatoId={current.contatoId} conversaId={current.id} canalId={current.canalId} canalTipo="whatsapp" contatoTelefone={current.phone} /></div>
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
                      <button className="resp-btn" disabled={atribuindo} onClick={devolverParaFila}>Devolver para a fila</button>
                    </>)
                  : <button className="resp-btn primary" disabled={atribuindo} onClick={assumir}><IcUserPlus />{atribuindo ? 'Assumindo…' : 'Assumir atendimento'}</button>
                )}
              </div>
            )}
          </div>
          <div className="dfield"><div className="dlabel">Origem do lead</div><div className="dval with-ic"><IcWa />{current.origin}</div></div>

          {/* Colaboração E1: histórico de atividade do atendimento (timeline) */}
          {current.id && (atividadesQ.data?.length ?? 0) > 0 && (
            <div className="dfield"><div className="dlabel">Atividade do atendimento</div>
              <ul className="ativ-timeline" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {atividadesQ.data!.map((a) => {
                  const verbo = a.tipo === 'assumido' ? 'assumiu o atendimento'
                    : a.tipo === 'transferido' ? 'transferiu o atendimento'
                    : a.tipo === 'devolvido' ? 'devolveu para a fila'
                    : a.tipo;
                  const quando = (() => { try { return new Date(a.em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch { return ''; } })();
                  return (
                    <li key={a.id} style={{ fontSize: 12.5, lineHeight: 1.4 }}>
                      <span style={{ fontWeight: 600 }}>{a.usuario ?? 'Alguém'}</span> {verbo}
                      <span style={{ color: 'var(--muted)' }}> · {quando}</span>
                      {a.motivo && <div style={{ color: 'var(--muted)' }}>Motivo: {a.motivo}</div>}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

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
              {(current.unread ?? 0) > 0
                ? <button role="menuitem" className="pop-item" onClick={() => marcarLida(true)}><IcCheckSm />Marcar como lida</button>
                : <button role="menuitem" className="pop-item" onClick={() => marcarLida(false)}><IcCheckSm />Marcar como não lida</button>}
              {current.arquivada
                ? <button role="menuitem" className="pop-item" onClick={() => arquivarConversa(false)}><IcArchive />Desarquivar conversa</button>
                : <button role="menuitem" className="pop-item" onClick={() => arquivarConversa(true)}><IcArchive />Arquivar conversa</button>}
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
        ctx={{ cliente: current.name, atendente: (user?.name || '').trim() || 'Atendente', emailAtendente: user?.email, empresa: currentOrg.name, telefone: current.phone }}
        enviarEtapa={async (texto, retryId) => await sendMut.mutateAsync({ conversaId: currentId, text: texto, canalId: replyCanalId || current.canalId, assinaturaNome: assinaturaNome || undefined, retryMensagemId: retryId }) ?? undefined}
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
      <ConfirmDialog
        open={!!removerAlvo}
        title="Remover esta mensagem com falha?"
        message="Ela não foi entregue ao cliente e será retirada da conversa."
        destructive loading={!!removendoId} confirmLabel="Remover" cancelLabel="Cancelar"
        onConfirm={() => { if (removerAlvo) void removerFalha(removerAlvo); }}
        onCancel={() => { if (!removendoId) setRemoverAlvo(null); }}
      />

      <MediaComposer open={imgModal} tipo="imagem" previewCard onClose={() => setImgModal(false)} enviar={enviarImagem} />
      <MediaComposer open={docModal} tipo="documento" onClose={() => setDocModal(false)} enviar={enviarDocumento} />

      <AgendarMensagemModal
        open={agendarOpen}
        modo={agEditId ? 'editar' : 'criar'}
        canais={realCanais}
        temTelefone={!current.semDestino}
        ultimaInteracaoMs={current.lastAtMs}
        initial={agInitial}
        onClose={() => setAgendarOpen(false)}
        onSubmit={submeterAgendar}
      />

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

      <Modal open={vincOpen} onClose={() => { if (!vincBusy) setVincOpen(false); }} title="Vincular número para responder" width={440} closeOnBackdrop={!vincBusy}
        footer={<>
          <button className="atv-btn" disabled={vincBusy} onClick={() => setVincOpen(false)}>Cancelar</button>
          {vincVal
            ? <button className="atv-btn primary" disabled={vincBusy} onClick={confirmarVinculo}>{vincBusy ? 'Vinculando…' : 'Confirmar e vincular'}</button>
            : <button className="atv-btn primary" disabled={vincBusy} onClick={validarNumeroVinc}>{vincBusy ? 'Validando…' : 'Validar no WhatsApp'}</button>}
        </>}>
        <div className="nc-form">
          <p style={{ margin: '0 0 6px', fontSize: 13, color: 'var(--muted)' }}>
            Esta conversa chegou por uma identidade protegida (LID), sem número para resposta. Informe o número real do cliente — validamos no WhatsApp antes de salvar. O LID é preservado e nada é inventado.
          </p>
          <label className="nc-field"><span className="nc-label">Telefone (DDI + DDD)</span>
            <input className="atv-input" inputMode="tel" placeholder="55 11 99999-8888" value={vincTel} disabled={vincBusy || !!vincVal}
              onChange={(e) => { setVincTel(e.target.value); setVincErr(null); }} />
          </label>
          {!vincVal && current.phone && <div style={{ fontSize: 12, color: 'var(--muted)' }}>Número cadastrado (não confirmado) — valide no WhatsApp para usar, ou informe outro.</div>}
          {vincVal && <div style={{ color: 'var(--green)', fontSize: 13 }}>✓ Número com WhatsApp ativo: <strong>{vincVal.mascarado}</strong>. Confirme para vincular a este contato.</div>}
          {vincVal && <button className="link-btn" style={{ alignSelf: 'flex-start' }} disabled={vincBusy} onClick={() => { setVincVal(null); }}>Corrigir número</button>}
          {vincErr && <div className="atv-field-err">{vincErr}</div>}
        </div>
      </Modal>

      <Modal open={transferOpen} onClose={() => setTransferOpen(false)} title="Transferir atendimento" width={460}
        footer={<>
          <button className="atv-btn" disabled={atribuindo} onClick={() => setTransferOpen(false)}>Cancelar</button>
          <button className="atv-btn primary" disabled={!transferSel || transferSel === current.respId || !transferMotivo.trim() || atribuindo} onClick={() => transferir(transferSel)}>{atribuindo ? 'Transferindo…' : 'Transferir'}</button>
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
        <label className="nc-field" style={{ marginTop: 10 }}><span className="nc-label">Motivo da transferência <span style={{ color: 'var(--warn)' }}>*</span></span>
          <input className="atv-input" placeholder="Ex.: atendimento presencial, especialista, ausência…" value={transferMotivo} onChange={(e) => setTransferMotivo(e.target.value)} maxLength={280} />
        </label>
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
