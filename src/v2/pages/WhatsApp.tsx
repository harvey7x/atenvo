import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { WA_REAL, mascararNumero, urlAssinadaMidiaWa, urlDownloadMidiaWa, waRecarregarAudio, waValidarNumero, waVincularNumero, useWaAtividades, useMensagensAgendadas, useAgendarSequencia, useEditarAgendamento, useCancelarAgendamento, normalizeWaPhone } from '@/data/whatsapp';
import { nomeArquivoMidia, rotuloBaixarMidia } from '@/data/midiaNome';
import type { WaContact, WaMessage } from '@/data/whatsappDemo';
import { useStatusDefs, useEtiquetas, useOrgUsuarios, useAssinaturaPref, useAtendimentoActions } from '@/data/atendimento';
import { useScripts, useScriptEtapaCounts, useScriptCategorias, traduzErroEnvio, aguardarConfirmacaoEnvio, type Script } from '@/data/scripts';
import { useScriptsResumoEtapas } from '../hooks/scriptsResumo';
import { useJanelaCanal, rotuloJanela } from '@/data/cloudApi';
import { useSlaAlertas } from '@/data/sla';
import { indexPorChave, tipoLabel, tempoRelativo } from '@/data/slaView';
import { useOportunidadesDoContato, useFunisDaOrg, chamarGarantirEntrada } from '@/data/kanban';
import { useCobrancas } from '@/data/cobrancas';
import { corDaEtiqueta, podeGerenciarAtendimento, type AssinaturaModo } from '@/types/atendimento';
import { textoBloqueio, analisarNome, conversaAtiva } from '@/lib/higieneConversa';
import { responsavelEfetivo, situacaoDaConversa, type ConversaEtiquetaInput } from '@/lib/conversaEtiquetas';
import { construirItensConversa } from '@/lib/dataConversa';
import { formatarNomeCliente } from '@/lib/nomeCliente';
import { canalValidoParaEnvio } from '@/lib/agendamentoMensagem';
import { initials } from '@/lib/avatar';
import { useAuth } from '@/context/AuthContext';
import { useOrg } from '@/context/OrgContext';
import { MediaComposer } from '@/components/MediaComposer';
import { ScriptSequenceModal } from '@/components/ScriptSequenceModal';
import { FichaJudicialBox } from '@/components/FichaJudicialBox';
import { useSendWaMessage } from '@/data/whatsapp';
import { useInboxWhatsApp, type AvisoInbox } from '../hooks/useInboxWhatsApp';
import { AudioRecorderV2 } from '../components/AudioRecorderV2';
import { AgendarMensagemModalV2 } from './AgendarMensagemModalV2';
import { CLASSE_RAIZ_PORTAL } from '../components/portal';
import { BotaoMini, BotaoPrimario, BotaoSec, ConfirmDialogV2, EstadoErro, ModalV2, Skeleton } from '../components';
import { seedWa } from './whatsappSeed';
import './whatsapp.css';

/* ------------------------------------------------------------------
   WhatsApp v2 — inbox de atendimento (anatomia pg-wa: fila 296px ·
   conversa · contexto 266px). A máquina vive em useInboxWhatsApp
   (extração fiel da v1); aqui é só UI. Respostas rápidas = ponte dos
   Scripts (useScripts reais → ScriptSequenceModal, nunca envio cego).
   OPT-OUT inviolável: contato em relacionamento_bloqueio mostra o
   estado e bloqueia envio com motivo visível (precedente Contatos).
   REGRA DE OURO: mutações só no demo; no real esta página só é
   validada em leitura — enviar mensagem é falar com cliente real.
   ------------------------------------------------------------------ */

const FOCO_KEY = 'atenvo-wa-foco';
const ABA_KEY = 'atenvo-wa-aba';
const GRUPOS_KEY = 'atenvo-wa-grupos-fechados';
const TABS = [
  ['todos', 'Todos'], ['meus', 'Meus'], ['naoatrib', 'Não atribuídos'],
  ['naolidas', 'Não lidas'], ['pendentes', 'Pendentes'], ['arquivadas', 'Arquivadas'],
] as const;
type TabId = typeof TABS[number][0];
const ASSINA_OPCOES = [['sem', 'Sem assinatura'], ['atendente', 'Nome do atendente'], ['empresa', 'Nome da empresa'], ['personalizado', 'Nome personalizado']] as const;

const Ic = ({ children, fill }: { children: ReactNode; fill?: boolean }) => (
  <svg viewBox="0 0 24 24" fill={fill ? 'currentColor' : 'none'} stroke={fill ? 'none' : 'currentColor'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{children}</svg>
);
const IcWa = () => <Ic><path d="M21 11.5a8.4 8.4 0 01-9 8.4 8.9 8.9 0 01-3.8-.8L3 20l1-4.9a8.3 8.3 0 01-1-4A8.4 8.4 0 0112 3a8.4 8.4 0 019 8.5z" /></Ic>;
const IcBusca = () => <Ic><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></Ic>;
const IcMais = () => <Ic><path d="M12 5v14M5 12h14" /></Ic>;
const IcFunil = () => <Ic><path d="M3 5h18l-7 8v5l-4 2v-7z" /></Ic>;
const IcDots = () => <Ic fill><circle cx="12" cy="5" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="19" r="1.5" /></Ic>;
const IcImg = () => <Ic><rect x="3" y="4" width="18" height="16" rx="2.5" /><circle cx="9" cy="10" r="1.6" /><path d="m5 18 5-5 3 3 3-3 3 3" /></Ic>;
const IcDoc = () => <Ic><path d="M13 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9z" /><path d="M13 3v6h6" /></Ic>;
const IcDownload = () => <Ic><path d="M12 3v12" /><path d="m7 11 5 5 5-5" /><path d="M5 21h14" /></Ic>;
const IcClock = () => <Ic><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Ic>;
const IcSend = () => <Ic><path d="M4 12l16-8-6 16-2.5-6.5z" /></Ic>;
const IcTel = () => <Ic><path d="M5 4h4l2 5-2.5 1.5a12 12 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" /></Ic>;
const IcCopy = () => <Ic><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></Ic>;
const IcReply = () => <Ic><path d="M9 14 4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 5 5v6" /></Ic>;
const IcPlay = () => <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M8 5.5v13l11-6.5z" /></svg>;
const IcFoco = () => <Ic><path d="M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4" /></Ic>;

const ackOf = (status?: string): { s: string; cls: string; title: string } | null =>
  status === 'lida' ? { s: '✓✓', cls: 'lida', title: 'Lida' }
  : status === 'entregue' ? { s: '✓✓', cls: 'entregue', title: 'Entregue' }
  : status === 'enviada' ? { s: '✓', cls: 'enviada', title: 'Enviada' }
  : status === 'pendente' ? { s: '🕗', cls: 'pendente', title: 'Pendente' }
  : status === 'falhou' ? { s: '!', cls: 'falhou', title: 'Falhou' }
  : null;

/** Tamanho de arquivo adaptativo B/KB/MB (paridade v1 L136): evita '0.0 MB' para poucos KB. */
const fmtTam = (b?: number | null): string =>
  !b ? '' : b < 1024 ? b + ' B' : b < 1_048_576 ? (b / 1024).toFixed(0) + ' KB' : (b / 1_048_576).toFixed(1) + ' MB';

/** Tiers da barra lateral de espera (v1 L75-89): <30min neutro · 30min–2h âmbar · 2–24h vermelho · ≥24h crítico. */
function tierEspera(aguardandoDesde: string | null | undefined, agoraMs: number): { tier: string; label: string } | null {
  if (!aguardandoDesde) return null;
  const min = Math.floor((agoraMs - new Date(aguardandoDesde).getTime()) / 60_000);
  if (!Number.isFinite(min) || min < 0) return null;
  const label = min < 1 ? 'Aguardando agora' : min < 60 ? `Aguardando há ${min} min` : min < 1440 ? `Aguardando há ${Math.floor(min / 60)} h` : `Aguardando há ${Math.floor(min / 1440)} d`;
  const tier = min < 30 ? 'neutro' : min < 120 ? 'ambar' : min < 1440 ? 'vermelho' : 'critico';
  return { tier, label };
}
const nomeVazio = (n: string | undefined) => !n?.trim() || /^[\d\s()+\-]+$/.test(n ?? '');
const nomeExibicao = (c: WaContact) => (nomeVazio(c.name) ? (c.phone ? mascararNumero(c.phone) : 'Cliente sem nome') : formatarNomeCliente(c.name));
/** Situação derivada (v1: sempre há um chip — LEAD NOVO / EM ATENDIMENTO / AGUARDANDO / FECHADO / etapa). */
const entradaEtiqueta = (c: WaContact): ConversaEtiquetaInput => ({
  atendenteId: c.atendenteId, respId: c.respId, oppRespId: c.oppRespId, etapa: c.etapa, etapaEntrada: c.etapaEntrada,
  oppStatus: c.oppStatus ?? undefined, aguardando: c.aguardando, canalAtual: c.canalAtual,
});
const situacaoDe = (c: WaContact) => situacaoDaConversa(entradaEtiqueta(c));
/** Cor da coluna do Kanban só quando o texto exibido É o nome da etapa avançada (v1 corDaEtapa). */
const corDaSituacao = (c: WaContact, texto: string): string | null => {
  const nomeCol = (c.etapa ?? '').trim().toLocaleUpperCase('pt-BR');
  return c.etapaCor && nomeCol && texto === nomeCol ? c.etapaCor : null;
};
const mmss = (s: number | null | undefined) => (s == null ? '' : `${Math.floor(s / 60)}:${('0' + Math.floor(s % 60)).slice(-2)}`);
const ONDA = [6, 11, 15, 9, 13, 17, 11, 7, 14, 10, 16, 8, 12, 6, 10, 15];

type Pop = { kind: 'filtro' | 'acoes' | 'status' | 'tags' | 'scripts'; x: number; y: number; acima?: boolean } | null;

export default function WhatsAppV2() {
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const { user } = useAuth();
  const { currentOrg } = useOrg();
  const [aviso, setAviso] = useState<AvisoInbox | null>(null);
  const avisoTimer = useRef(0);
  const aoAvisar = useCallback((a: AvisoInbox) => {
    setAviso(a);
    window.clearTimeout(avisoTimer.current);
    avisoTimer.current = window.setTimeout(() => setAviso(null), 4200);
  }, []);
  useEffect(() => () => window.clearTimeout(avisoTimer.current), []);

  const inbox = useInboxWhatsApp({ aoAvisar, seedDemo: useMemo(() => seedWa(), []), bloqueadosDemo: useMemo(() => new Set(['wa-cleusa-ct']), []) });
  const { demo, contacts, current, currentId, relogioMs } = inbox;
  const sendMut = useSendWaMessage();

  /* ---------- UI ---------- */
  const [draft, setDraft] = useState('');
  // lembra a última aba usada (quem trabalha pelo "Meus" reabre no "Meus")
  const [tab, setTab] = useState<TabId>(() => {
    try { const t = localStorage.getItem(ABA_KEY); return TABS.some(([id]) => id === t) ? (t as TabId) : 'todos'; } catch { return 'todos'; }
  });
  // persiste APENAS na escolha do usuário — a troca programática do deep-link não apaga a preferência
  const mudarAba = (t: TabId) => { setTab(t); try { localStorage.setItem(ABA_KEY, t); } catch { /* privado */ } };
  // grupos recolhidos na fila (por respId; '' = Não atribuídos), lembrados entre sessões
  const [gruposFechados, setGruposFechados] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem(GRUPOS_KEY) ?? '[]') as string[]); } catch { return new Set(); }
  });
  // persistência dentro da AÇÃO (não em effect): o expandir-tudo do deep-link fica só na sessão
  const alternarGrupo = (k: string) => setGruposFechados((cur) => {
    const s = new Set(cur);
    if (s.has(k)) s.delete(k); else s.add(k);
    try { localStorage.setItem(GRUPOS_KEY, JSON.stringify([...s])); } catch { /* privado */ }
    return s;
  });
  const [search, setSearch] = useState('');
  const [filtroCanal, setFiltroCanal] = useState<string | null>(null);
  const [filtroStatus, setFiltroStatus] = useState<string | null>(null);
  const [filtroTransporte, setFiltroTransporte] = useState<string | null>(null);
  const [pop, setPop] = useState<Pop>(null);
  const [foco, setFoco] = useState(() => { try { return localStorage.getItem(FOCO_KEY) === '1'; } catch { return false; } });
  const [ctxAberto, setCtxAberto] = useState(() => { try { return sessionStorage.getItem('atenvo-wa-ctx') !== '0'; } catch { return true; } });
  useEffect(() => { try { sessionStorage.setItem('atenvo-wa-ctx', ctxAberto ? '1' : '0'); } catch { /* privado */ } }, [ctxAberto]);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [novaConversa, setNovaConversa] = useState(false);
  const [transferirAberto, setTransferirAberto] = useState(false);
  const [vincAberto, setVincAberto] = useState(false);
  const [fecharConfirm, setFecharConfirm] = useState(false);
  const [cancelarAgId, setCancelarAgId] = useState<string | null>(null); // auditoria: era window.confirm nativo
  const [verErro, setVerErro] = useState<string | null>(null);
  const [removerAlvo, setRemoverAlvo] = useState<WaMessage | null>(null);
  const [imgModal, setImgModal] = useState(false);
  const [docModal, setDocModal] = useState(false);
  const [agendarAberto, setAgendarAberto] = useState(false);
  const [agEditId, setAgEditId] = useState<string | null>(null);
  const [scriptSeq, setScriptSeq] = useState<Script | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState({ nome: '', email: '', observacoes: '', responsavelId: '' });
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const msgsRef = useRef<HTMLDivElement>(null);

  useEffect(() => { try { localStorage.setItem(FOCO_KEY, foco ? '1' : '0'); } catch { /* privado */ } }, [foco]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (pop) { setPop(null); return; }
      setFoco(false);
    };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [pop]);
  useEffect(() => { setEditMode(false); }, [currentId]);
  /* autoscroll do chat ao trocar/receber */
  useEffect(() => {
    const el = msgsRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [currentId, current.msgs.length]);

  /* ---------- dados satélites ---------- */
  const slaQ = useSlaAlertas();
  const slaPorConversa = useMemo(() => indexPorChave(slaQ.data?.itens ?? [], 'conversa_id'), [slaQ.data]);
  const atividadesQ = useWaAtividades(WA_REAL ? currentId || null : null);
  const statusQ = useStatusDefs();
  const etiquetasQ = useEtiquetas();
  const usuariosQ = useOrgUsuarios();
  const assinaturaQ = useAssinaturaPref();
  const acoes = useAtendimentoActions();
  const scriptsQ = useScripts('whatsapp');
  const scriptsDemo: Script[] = useMemo(() => (WA_REAL ? [] : [
    { id: 'sd-1', titulo: 'Boas-vindas ao cliente', descricao: null, conteudo: 'Olá {{nome_cliente}}! Aqui é {{seu_nome}}, da {{empresa}}. Como posso ajudar?', categoriaId: null, canais: ['whatsapp'], favorito: true, ativo: true, tags: [], autorId: null, criadoEm: '', atualizadoEm: '' },
    { id: 'sd-2', titulo: 'Pedir CPF', descricao: null, conteudo: 'Para conferir os descontos no benefício eu preciso do seu CPF, pode me enviar?', categoriaId: null, canais: ['whatsapp'], favorito: true, ativo: true, tags: [], autorId: null, criadoEm: '', atualizadoEm: '' },
    { id: 'sd-3', titulo: 'Explicar o processo', descricao: null, conteudo: 'A análise é simples: conferimos seu benefício, identificamos descontos indevidos e cuidamos do cancelamento e do ressarcimento.', categoriaId: null, canais: ['whatsapp'], favorito: false, ativo: true, tags: [], autorId: null, criadoEm: '', atualizadoEm: '' },
    { id: 'sd-4', titulo: 'Agendar ligação', descricao: null, conteudo: 'Posso te ligar para explicar melhor. Qual o melhor horário para você?', categoriaId: null, canais: ['whatsapp'], favorito: false, ativo: true, tags: [], autorId: null, criadoEm: '', atualizadoEm: '' },
  ]), []);
  const scripts = WA_REAL ? (scriptsQ.data ?? []) : scriptsDemo;
  const etapaCounts = useScriptEtapaCounts().data ?? {};
  const scriptCategorias = useScriptCategorias().data ?? [];
  const scriptsResumo = useScriptsResumoEtapas().data ?? {};
  // Todos os scripts do canal, agrupados por categoria (ordem da categoria; "Sem categoria" por
  // último) — alimenta o seletor compacto do composer sem tirar o atendente da conversa.
  const scriptsPorCategoria = useMemo(() => {
    const cats = [...scriptCategorias].sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome));
    const idsValidos = new Set(cats.map((c) => c.id));
    const grupos = cats.map((c) => ({ id: c.id, nome: c.nome, itens: scripts.filter((s) => s.categoriaId === c.id) }));
    const soltos = scripts.filter((s) => !s.categoriaId || !idsValidos.has(s.categoriaId));
    if (soltos.length) grupos.push({ id: '__sem__', nome: 'Sem categoria', itens: soltos });
    return grupos.filter((g) => g.itens.length > 0);
  }, [scripts, scriptCategorias]);
  const bloqueados = inbox.bloqueados;
  const canalEhCloud = inbox.canalSel?.transporte === 'cloud_api';
  // canal oficial (Cloud API/Meta) × número conectado por QR (Evolution) — sinalização na fila,
  // no topo da conversa, no "Responder por:" e no filtro de números. Transporte DESCONHECIDO
  // (demo, canais ainda carregando, canal removido fora de realCanais) fica neutro: não se
  // afirma "não oficial" sobre canal que não foi consultado.
  const canalPorId = useMemo(() => new Map(inbox.realCanais.map((c) => [c.id, c])), [inbox.realCanais]);
  const transporteDe = (id: string | null | undefined) => (id ? canalPorId.get(id)?.transporte ?? null : null);
  const tituloCanal = (nome: string | null | undefined, transporte: string | null) =>
    transporte === 'cloud_api' ? `${nome ?? 'WhatsApp'} — OFICIAL (API do WhatsApp/Meta)`
    : transporte ? `${nome ?? 'WhatsApp'} — número conectado por QR (não oficial)`
    : nome ?? 'WhatsApp';
  const janelaQ = useJanelaCanal(WA_REAL && canalEhCloud ? inbox.canalSel?.id ?? null : null, WA_REAL ? current.contatoId ?? null : null, canalEhCloud);
  const agendadasQ = useMensagensAgendadas(WA_REAL ? currentId || null : null);
  const agendarSeqMut = useAgendarSequencia();
  const editarAgMut = useEditarAgendamento();
  const cancelarAgMut = useCancelarAgendamento();
  const cobrancasQ = useCobrancas();

  const optout = inbox.optout;
  const podeGerenciar = podeGerenciarAtendimento(currentOrg.role);
  const usuarios = usuariosQ.data ?? [];
  // Map memoizado em vez de usuarios.find() por linha da fila: o cabeçalho e cada card
  // resolvem o nome do responsável a cada render (inclusive a cada tecla no composer).
  const nomeMap = useMemo(() => new Map(usuarios.map((u) => [u.id, u.nome])), [usuarios]);
  const nomePorId = (id: string) => nomeMap.get(id);

  /* assinatura (v1: select inline; persistida em organizacao_usuarios) */
  const [assinaMode, setAssinaMode] = useState<string>('sem');
  const [assinaCustom, setAssinaCustom] = useState('');
  useEffect(() => {
    const p = assinaturaQ.data;
    if (!p) return;
    setAssinaMode(p.modo ?? 'sem');
    setAssinaCustom(p.nome ?? '');
  }, [assinaturaQ.data]);
  const assinaturaNome = assinaMode === 'atendente' ? (user?.name || 'Atendente')
    : assinaMode === 'empresa' ? currentOrg.name
    : assinaMode === 'personalizado' ? assinaCustom.trim()
    : '';
  const persistAssinatura = (modo: string, nome: string) => {
    if (!WA_REAL) return;
    acoes.salvarAssinatura({ modo: modo as AssinaturaModo, nome }).catch(() => aoAvisar({ tom: 'erro', texto: 'Falha ao salvar assinatura' }));
  };

  /* ---------- deep-link ?conversa= (v1 L363-375) ---------- */
  const conversaParam = params.get('conversa');
  useEffect(() => {
    if (!conversaParam) return;
    inbox.selecionarPorDeepLink(conversaParam);
    setTab('todos'); setFiltroCanal(null); setFiltroStatus(null); setFiltroTransporte(null); setSearch('');
    setGruposFechados(new Set()); // expande tudo: o card alvo pode estar num grupo recolhido
    const t = window.setTimeout(() => {
      document.querySelector(`[data-cid="${CSS.escape(conversaParam)}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      // só limpa o parâmetro DEPOIS de rolar: apagá-lo muda conversaParam→null, o que
      // dispara o cleanup deste effect (clearTimeout). Se limpássemos antes, o timer
      // morreria antes dos 220ms e a rolagem nunca ocorreria (regressão vs v1).
      setParams((p) => { p.delete('conversa'); return p; }, { replace: true });
    }, 220);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversaParam]);

  /* ---------- fila: filtro/contadores/ordenação (v1 L287-334) ---------- */
  const buscaAtiva = search.trim().length > 0;
  const term = search.trim().toLowerCase();
  const passaBase = (c: WaContact) =>
    (!filtroCanal || c.canalId === filtroCanal) &&
    (!filtroStatus || c.statusId === filtroStatus) &&
    // "QR (não oficial)" = tudo que NÃO é o canal oficial (inclui canal removido/histórico,
    // cujo transporte é desconhecido) — sem terceiro balde invisível entre as duas opções
    (!filtroTransporte || (filtroTransporte === 'cloud_api'
      ? transporteDe(c.canalId) === 'cloud_api'
      : transporteDe(c.canalId) !== 'cloud_api')) &&
    (!term || c.name.toLowerCase().includes(term) || c.last.toLowerCase().includes(term) || (c.phone ?? '').toLowerCase().includes(term));
  const passaTab = (c: WaContact, t: TabId) =>
    t === 'arquivadas' ? !!c.arquivada
    : (!c.arquivada || buscaAtiva) && (
      t === 'todos' ? true
      : t === 'meus' ? c.respId === user?.id
      : t === 'naoatrib' ? !c.respId
      : t === 'naolidas' ? (c.unread ?? 0) > 0
      : (c.unread ?? 0) > 0 || !!c.aguardando
    );
  const tabCounts = useMemo(() => {
    const base = contacts.filter(passaBase);
    const n: Record<string, number> = {};
    for (const [t] of TABS) n[t] = base.filter((c) => passaTab(c, t)).length;
    return n;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contacts, filtroCanal, filtroStatus, filtroTransporte, canalPorId, term, user?.id]);
  const visiveis = useMemo(() => {
    const lista = contacts.filter((c) => passaBase(c) && passaTab(c, tab));
    return lista.sort((a, b) => (a.fixada === b.fixada ? (b.lastAtMs ?? 0) - (a.lastAtMs ?? 0) : a.fixada ? -1 : 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contacts, tab, filtroCanal, filtroStatus, filtroTransporte, canalPorId, term, user?.id]);
  /* agrupamento por responsável — VOCÊ primeiro (seus clientes sempre visíveis no Todos),
     depois Não atribuídos, depois os demais atendentes em ordem alfabética */
  const grupos = useMemo(() => {
    const m = new Map<string, WaContact[]>();
    for (const c of visiveis) {
      const k = responsavelEfetivo(c) ?? '';
      m.set(k, [...(m.get(k) ?? []), c]);
    }
    const uid = user?.id;
    // na aba "Não atribuídos" a fila sem dono continua PRIMEIRO (propósito da aba);
    // nas demais, Você abre a lista
    const rank = (k: string) =>
      tab === 'naoatrib' ? (k === '' ? 0 : 1)
      : uid && k === uid ? 0 : k === '' ? 1 : 2;
    return [...m.entries()].sort((a, b) =>
      rank(a[0]) - rank(b[0]) || (nomePorId(a[0]) ?? '').localeCompare(nomePorId(b[0]) ?? '', 'pt-BR'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visiveis, usuarios, user?.id, tab]);

  /* ---------- envio / composer ---------- */
  const optoutTexto = 'Contato marcado como não incomodar — mensagens bloqueadas.';
  const composerBloqueado = inbox.canalIndisponivel || inbox.semDestino || inbox.canalRestrito || inbox.higieneBloqueia || optout;
  const placeholder = optout ? 'Envio bloqueado: contato pediu para não ser incomodado'
    : inbox.semDestino ? 'Vincule um número para responder'
    : inbox.canalIndisponivel ? 'Envio bloqueado: número desconectado'
    : inbox.canalRestrito ? 'Envio bloqueado: número com restrição no WhatsApp'
    : (textoBloqueio(inbox.higiene) ?? 'Digite sua mensagem...');
  const enviar = () => {
    if (optout) { aoAvisar({ tom: 'erro', texto: optoutTexto }); return; }
    inbox.sendMsg(draft, assinaturaNome || null, () => setDraft(''));
  };
  // auto-altura da caixa (paridade v1 L531-536): roda também na limpeza programática do draft
  // (setDraft('') após enviar não dispara onChange), colapsando o campo em vez de deixá-lo esticado.
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
  }, [draft]);
  const sendDisabled = draft.trim() === '' || inbox.semDestino || optout || (WA_REAL && (!current.id || !inbox.canalConectado));
  const midiaDisabled = inbox.semDestino || inbox.canalRestrito || inbox.higieneBloqueia || optout || (WA_REAL && (!current.id || !inbox.canalConectado));
  const canaisAgendaveis = inbox.realCanais.filter((c) => canalValidoParaEnvio({ id: c.id, status_integracao: c.status, envio_restrito: c.envioRestrito, conflito_com: c.conflitoCom, ativo: true }).ok);
  const agendarDisabled = inbox.semDestino || inbox.higieneBloqueia || optout || (WA_REAL && (!current.id || canaisAgendaveis.length === 0));
  // itens do fio memoizados: construirItensConversa formata Intl.DateTimeFormat por mensagem;
  // sem memo isso refazia a cada tecla do composer / tick de 60s. Só depende das mensagens.
  const itensConversa = useMemo(() => construirItensConversa(current.msgs, (m) => m.tsISO ?? null), [current.msgs]);

  /* ---------- popovers em portal (regra 10) ---------- */
  const raizPop = useMemo(() => {
    // usa a CONSTANTE (sem efeito colateral): criarRaizPortalV2() anexaria um <div> ao body
    // que aqui só leríamos pelo className — deixando um nó órfão por montagem. A raiz real é
    // o div [data-wa-pop] criado/reutilizado abaixo, que já carrega a classe .v2 (regra 10).
    const className = CLASSE_RAIZ_PORTAL;
    let el = document.querySelector(`.${className.split(' ').join('.')}[data-wa-pop]`) as HTMLElement | null;
    if (!el) {
      el = document.createElement('div');
      el.className = className;
      el.setAttribute('data-wa-pop', '1');
      document.body.appendChild(el);
    }
    return el;
  }, []);
  useEffect(() => {
    if (!pop) return;
    const f = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest('.wa-pop')) setPop(null); };
    const r = () => setPop(null);
    document.addEventListener('mousedown', f);
    window.addEventListener('resize', r);
    return () => { document.removeEventListener('mousedown', f); window.removeEventListener('resize', r); };
  }, [pop]);
  const abrirPop = (kind: Pop extends null ? never : Exclude<Pop, null>['kind'], e: React.MouseEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = Math.min(r.left, window.innerWidth - 300);
    setPop((p) => (p?.kind === kind ? null : { kind, x, y: r.bottom + 6 }));
  };

  /* ---------- edição de dados (painel) ---------- */
  const iniciarEdicao = () => {
    setEditForm({ nome: current.name, email: current.email, observacoes: current.notes, responsavelId: current.respId ?? '' });
    setEditMode(true);
    setCtxAberto(true);
  };
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const [salvandoEdicao, setSalvandoEdicao] = useState(false);
  const salvarEdicao = async () => {
    if (salvandoEdicao) return;
    if (editForm.email && !EMAIL_RE.test(editForm.email)) { aoAvisar({ tom: 'erro', texto: 'E-mail inválido.' }); return; }
    setSalvandoEdicao(true);
    inbox.aplicarEdicaoLocal({ name: editForm.nome, email: editForm.email, notes: editForm.observacoes, respId: editForm.responsavelId || null });
    try {
      if (WA_REAL && current.contatoId) {
        await acoes.atualizarContato(current.contatoId, {
          nome: editForm.nome, email: editForm.email || null, observacoes: editForm.observacoes || null,
          responsavel_id: editForm.responsavelId || null,
        });
      }
      aoAvisar({ tom: 'ok', texto: 'Dados do cliente salvos' });
      setEditMode(false);
    } catch (e) {
      aoAvisar({ tom: 'erro', texto: (e as Error)?.message || 'Falha ao salvar.' });
    } finally { setSalvandoEdicao(false); }
  };
  const copiarTelefone = async () => {
    if (!current.phone) { aoAvisar({ tom: 'erro', texto: 'Este contato não tem telefone.' }); return; }
    const tel = current.phone.replace(/\D/g, '') || current.phone;
    try {
      await navigator.clipboard.writeText(tel);
      aoAvisar({ tom: 'ok', texto: 'Telefone copiado: ' + tel });
    } catch {
      try {
        const ta = document.createElement('textarea');
        ta.value = tel;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
        aoAvisar({ tom: 'ok', texto: 'Telefone copiado: ' + tel });
      } catch { aoAvisar({ tom: 'erro', texto: 'Não foi possível copiar o telefone' }); }
    }
  };

  const statusAtivos = statusQ.data?.filter((s) => s.ativo) ?? [];
  const statusFechada = statusQ.data?.find((s) => (s.slug ?? s.nome).toLowerCase() === 'fechada');
  const aplicarStatus = async (id: string) => {
    const st = statusAtivos.find((s) => s.id === id);
    inbox.setContacts((cur) => cur.map((c) => (c.id === current.id ? { ...c, statusId: id, status: st?.nome ?? c.status, statusCor: st?.cor ?? c.statusCor } : c)));
    if (!WA_REAL) return;
    try { await acoes.definirStatusConversa(current.id, id); } catch { aoAvisar({ tom: 'erro', texto: 'Falha ao alterar status' }); }
  };
  const alternarEtiqueta = async (nome: string) => {
    const novas = current.tags.includes(nome) ? current.tags.filter((t) => t !== nome) : [...current.tags, nome];
    inbox.setContacts((cur) => cur.map((c) => (c.id === current.id ? { ...c, tags: novas } : c)));
    if (!WA_REAL) return;
    try { await acoes.definirEtiquetasConversa(current.id, novas); } catch { aoAvisar({ tom: 'erro', texto: 'Falha ao salvar etiquetas' }); }
  };

  /* cobranças do contexto (agregação client-side — precedente Contatos) */
  const cobrancasCtx = useMemo(() => {
    const todas = cobrancasQ.data ?? [];
    return todas
      .filter((p) => p.contatoId && p.contatoId === current.contatoId)
      .slice(0, 2);
  }, [cobrancasQ.data, current.contatoId]);

  const alertasDe = (c: WaContact): string[] => {
    const wait = tierEspera(c.aguardando ? c.aguardandoDesde : null, relogioMs);
    const atrasado = wait && (wait.tier === 'critico' || wait.tier === 'vermelho');
    const out: string[] = [];
    if (atrasado && wait) out.push('Sem resposta ' + wait.label.replace('Aguardando ', ''));
    for (const a of slaPorConversa.get(c.id) ?? []) out.push(tipoLabel(a.tipo) + (a.detalhe ? ' — ' + a.detalhe : ''));
    if (c.precisaHumano) out.push('Precisa de atendimento humano');
    if (analisarNome(c.name).fraco && conversaAtiva({ status: c.status, arquivada: c.arquivada })) out.push('Cadastro incompleto: preencha o nome do cliente');
    // opt-out NÃO entra no agregado ⚠ — já tem chip dedicado "Não incomodar" (evita sinal em dobro)
    return out;
  };

  /* ---------- render ---------- */
  return (
    <div className="wa-pg">
      {/* ===================== FILA ===================== */}
      {!foco && (
        <aside className="wa-fila">
          <div className="wa-ftopo">
            <div className="l1">
              <h3>Conversas</h3>
              <div className="bts">
                <button type="button" className={'ib2' + (filtroCanal || filtroStatus || filtroTransporte ? ' on' : '')} title={filtroCanal || filtroStatus || filtroTransporte ? 'Filtros ativos' : 'Filtros'} onClick={(e) => abrirPop('filtro', e)}><IcFunil /></button>
                <button type="button" className="ib2" title="Nova conversa" aria-label="Nova conversa" onClick={() => setNovaConversa(true)}><IcMais /></button>
              </div>
            </div>
            <div className="wa-busca">
              <IcBusca />
              <input className="inp" placeholder="Buscar conversas..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <div className="wa-abas" role="tablist">
              {TABS.map(([id, rot]) => (
                <button
                  key={id} type="button" role="tab" aria-selected={tab === id}
                  className={'wa-aba' + (tab === id ? ' on' : '')}
                  title={id === 'pendentes' ? 'Pendentes inclui mensagens não lidas e clientes aguardando resposta.' : undefined}
                  onClick={() => mudarAba(id)}
                >
                  {rot}{(tabCounts[id] ?? 0) > 0 && <span className="n num">{tabCounts[id]}</span>}
                </button>
              ))}
            </div>
          </div>
          <div className="wa-lista">
            {WA_REAL && inbox.live.isError && contacts.length === 0 ? (
              /* contrato item 7: erro desenhado com "Tentar de novo" (auditoria) */
              <EstadoErro descricao="Erro ao carregar as conversas." aoTentarDeNovo={() => void inbox.live.refetch()} />
            ) : WA_REAL && inbox.live.isLoading && contacts.length === 0 ? (
              <div className="wa-skel" aria-busy aria-label="Carregando conversas">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <div className="row" key={i}>
                    <Skeleton largura={33} altura={33} raio={99} />
                    <div style={{ flex: 1 }}><Skeleton largura="60%" /><div style={{ height: 5 }} /><Skeleton largura="85%" /></div>
                  </div>
                ))}
              </div>
            ) : visiveis.length === 0 ? (
              <div className="wa-vazio">Nenhuma conversa nesta aba.</div>
            ) : (
              grupos.map(([respId, lista]) => {
                // busca ativa ignora o recolhimento: resultado escondido confunde
                const fechado = gruposFechados.has(respId) && !buscaAtiva;
                // grupo fechado não pode esconder urgência: soma de não lidas + ⚠ de espera estourada
                const naoLidasGrupo = fechado ? lista.reduce((s, c) => s + (c.unread ?? 0), 0) : 0;
                const atrasoGrupo = fechado && lista.some((c) => {
                  const w = tierEspera(c.aguardando ? c.aguardandoDesde : null, relogioMs);
                  return !!w && (w.tier === 'vermelho' || w.tier === 'critico');
                });
                return (
                <div key={respId || '(fila)'}>
                  <button
                    type="button" className={'wa-grupo' + (fechado ? ' fech' : '')} aria-expanded={!fechado}
                    title={buscaAtiva ? 'Limpe a busca para recolher grupos' : fechado ? 'Mostrar as conversas deste grupo' : 'Recolher este grupo'}
                    onClick={() => { if (!buscaAtiva) alternarGrupo(respId); }}
                  >
                    <span className="seta" aria-hidden>▾</span>
                    <span className="rot">
                      {respId ? <>Atendimento distribuído para <b>{respId === user?.id ? 'Você' : nomePorId(respId) ?? 'Atendente'}</b></> : 'Não atribuídos'}
                    </span>
                    <span className="num qt">{lista.length}</span>
                    {atrasoGrupo && <span className="galer" title="Há conversas aguardando resposta há tempo demais neste grupo">⚠</span>}
                    {naoLidasGrupo > 0 && <span className="gnl num" title={`${naoLidasGrupo} não lidas neste grupo`}>{naoLidasGrupo > 99 ? '99+' : naoLidasGrupo}</span>}
                  </button>
                  {!fechado && lista.map((c) => {
                    const wait = tierEspera(c.aguardando ? c.aguardandoDesde : null, relogioMs);
                    const atrasado = wait && (wait.tier === 'critico' || wait.tier === 'vermelho');
                    const alertas = alertasDe(c);
                    const finalizado = c.status === 'Resolvida' || c.status === 'Fechada';
                    const sit = situacaoDe(c);
                    const transporte = transporteDe(c.canalId);
                    const oficial = transporte === 'cloud_api';
                    return (
                      <button
                        key={c.id} type="button" data-cid={c.id}
                        className={'conv2 spot' + (wait ? ` t-${wait.tier}` : '') + (c.id === currentId ? ' ativa' : '')}
                        title={`Atendente: ${c.respId ? nomePorId(c.respId) ?? 'Atendente' : 'Não atribuído'} · Canal: ${tituloCanal(c.chip, transporte)} · ${finalizado ? 'Finalizado' : c.status || 'Em atendimento'} · ${c.time}`}
                        onClick={() => inbox.selectContact(c.id)}
                      >
                        <span className="av2">{initials(nomeExibicao(c))}{c.canalAtual && <span className={'sig' + (oficial ? ' of' : '')} title={tituloCanal(c.canalAtual, transporte)}>{oficial ? '✓ ' : ''}{c.canalAtual.slice(0, 2)}</span>}</span>
                        <span className="tx">
                          <span className="n">
                            {c.fixada && <span className="fl" title="Fixada">📌</span>}
                            {c.silenciada && <span className="fl" title="Silenciada">🔕</span>}
                            {c.arquivada && <span className="fl" title="Arquivada">🗄️</span>}
                            {nomeExibicao(c)}
                          </span>
                          <span className="p">{c.last || '—'}</span>
                          <span className="chips">
                            {(() => { const cor = corDaSituacao(c, sit.texto); return <span className={'cchip etapa sit-' + sit.variante} title="Situação no funil" style={cor ? { background: cor + '26', color: cor } : undefined}>{sit.texto}</span>; })()}
                            {alertas.length > 0 && <span className="cchip alerta" title={alertas.join(' · ')}>⚠{alertas.length > 1 ? ' ' + alertas.length : ''}</span>}
                            {c.contatoId && bloqueados.has(c.contatoId) && <span className="cchip alerta" style={{ color: 'var(--rubro)', borderColor: 'rgba(var(--rubro-rgb),.4)' }} title={optoutTexto}>Não incomodar</span>}
                            {/* "Finalizado" só quando a situação NÃO já é terminal (ganho/perdido/cancelado) — evita verde ao lado de PERDIDO (Adendo 3) */}
                            {finalizado && !['ganho', 'perdido', 'cancelado'].includes(sit.variante) && <span className="cchip fim">Finalizado</span>}
                          </span>
                        </span>
                        <span className="m">
                          <span className="h2 num" title={'Última interação: ' + c.time}>{c.lastAtMs ? tempoRelativo(new Date(c.lastAtMs).toISOString(), relogioMs) : c.time}</span>
                          {(c.unread ?? 0) > 0 && <span className="nl num" title={`${c.unread} não lidas`}>{(c.unread ?? 0) > 99 ? '99+' : c.unread}</span>}
                          {wait && <span className={'cr num' + (atrasado ? ' g' : '')}>{wait.label.replace('Aguardando ', '').replace('há ', '')}</span>}
                        </span>
                      </button>
                    );
                  })}
                </div>
                );
              })
            )}
          </div>
        </aside>
      )}

      {/* ===================== CONVERSA ===================== */}
      <section className="wa-conv">
        {aviso && (
          <div className={aviso.tom === 'erro' ? 'aviso-inline erro' : 'aviso-inline'} role="status">
            {aviso.texto}
            <button type="button" onClick={() => setAviso(null)} aria-label="Fechar aviso">×</button>
          </div>
        )}
        {!current.id ? (
          <div className="wa-conv-vazia">
            <IcWa />
            <div className="t">Selecione uma conversa</div>
            <div className="d">Escolha uma conversa na lista ou inicie um novo atendimento.</div>
            <BotaoPrimario onClick={() => setNovaConversa(true)}>Nova conversa</BotaoPrimario>
          </div>
        ) : (
          <>
            <div className="wa-ctopo">
              <button type="button" className="ib2 wa-ftopo-solto" style={{ display: 'none' }} aria-hidden />
              <span className="av2 conv2-av" style={{ display: 'flex', width: 32, height: 32, borderRadius: '50%', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: 12 }}>{initials(nomeExibicao(current))}</span>
              <div className="idw">
                <div className="nm">{nomeExibicao(current)}</div>
                <div className="sb num">
                  {current.phone ? mascararNumero(current.phone) : 'sem número'}
                  {(() => { const sit = situacaoDe(current); const cor = corDaSituacao(current, sit.texto); return <span className={'wa-hchip etapa sit-' + sit.variante} title="Situação no funil" style={cor ? { background: cor + '26', color: cor } : undefined}>{sit.texto}</span>; })()}
                  {inbox.canalSel
                    ? <span className={'wa-hchip' + (canalEhCloud ? ' of' : '')} title={`Respondendo por ${inbox.canalSel.alias}${inbox.canalSel.numero ? ' · ' + mascararNumero(inbox.canalSel.numero) : ''} · ${canalEhCloud ? 'OFICIAL (API do WhatsApp/Meta)' : 'número conectado por QR (não oficial)'}`}>{canalEhCloud ? '✓ ' : ''}{inbox.canalSel.alias}</span>
                    : current.chip && (() => { const t = transporteDe(current.canalId); return <span className={'wa-hchip' + (t === 'cloud_api' ? ' of' : '')} title={tituloCanal(current.chip, t)}>{t === 'cloud_api' ? '✓ ' : ''}{current.chip}</span>; })()}
                  {WA_REAL && canalEhCloud && janelaQ.data && (
                    <span className={'janela' + (janelaQ.data.aberta ? '' : ' fechada')} title={janelaQ.data.aberta ? 'Dentro das 24 horas: dá para responder com texto livre por este número.' : 'Passaram 24 horas desde a última mensagem do cliente PARA ESTE número. Só um modelo aprovado pela Meta pode sair daqui.'}>
                      {rotuloJanela(janelaQ.data)}
                    </span>
                  )}
                  <span className="wa-hchip" title="Atendente responsável">{current.respId ? nomePorId(current.respId) ?? 'Atendente' : 'Não atribuído'}</span>
                </div>
              </div>
              <div className="dir">
                {inbox.donoEfetivo
                  ? <BotaoMini title="Transferir atendimento" onClick={() => setTransferirAberto(true)}>Transferir</BotaoMini>
                  : <BotaoSec mini title="Assumir atendimento" disabled={inbox.atribuindo} onClick={inbox.assumir}>Assumir</BotaoSec>}
                <BotaoMini title={current.arquivada ? 'Desarquivar conversa' : 'Arquivar conversa'} onClick={() => inbox.arquivar(!current.arquivada)}>{current.arquivada ? 'Desarquivar' : 'Arquivar'}</BotaoMini>
                {!ctxAberto && <BotaoMini title="Abrir painel de dados do contato" onClick={() => setCtxAberto(true)}>Dados</BotaoMini>}
                <button type="button" className={'ib2' + (foco ? ' on' : '')} title="Modo de foco (Esc para sair)" onClick={() => setFoco((f) => !f)} style={{ width: 26, height: 26 }}><IcFoco /></button>
                <button type="button" className="ib2" title="Ações" aria-label="Ações da conversa" style={{ width: 26, height: 26 }} onClick={(e) => abrirPop('acoes', e)}><IcDots /></button>
              </div>
            </div>

            {/* OPT-OUT inviolável — precedente Contatos */}
            {optout && (
              <div className="wa-banner bloq" role="alert">
                <b>Não incomodar ativo.</b> Nenhuma mensagem (bot, régua ou agendamento) é enviada a este contato.
              </div>
            )}
            {/* higiene 1 — dono */}
            {WA_REAL && !!current.id && inbox.higiene.dono !== 'livre' && (
              <div className={'wa-banner' + (inbox.higiene.dono === 'bloqueia' ? ' bloq' : '')} title={'Esta conversa ainda não tem responsável. Assuma o atendimento para responder e evitar perda de lead.' + (inbox.higiene.dono === 'bloqueia' ? '' : ' Em breve isto será obrigatório.')}>
                <span><b>Sem responsável</b>{inbox.higiene.dono === 'bloqueia' ? ' — obrigatório para responder' : ''}</span>
                <span className="acts"><BotaoMini disabled={inbox.atribuindo} onClick={inbox.assumir}>Assumir</BotaoMini></span>
              </div>
            )}
            {/* higiene 2 — nome */}
            {WA_REAL && !!current.id && inbox.higiene.dono === 'livre' && inbox.decNome.acao !== 'livre' && (
              <div className={'wa-banner' + (inbox.decNome.acao === 'bloqueia' ? ' bloq' : '')}>
                <span>
                  <b>{inbox.decNome.acao === 'bloqueia' ? 'Nome obrigatório' : 'Cadastro incompleto'}</b>
                  {inbox.decNome.analise?.motivo === 'comercio' ? ' · parece comércio' : ''}
                  {inbox.decNome.podeAdiar && inbox.decNome.adiamentosRestantes < 2 ? (inbox.decNome.adiamentosRestantes === 1 ? ' · resta 1 adiamento' : ` · restam ${inbox.decNome.adiamentosRestantes} adiamentos`) : ''}
                </span>
                <span className="acts">
                  <BotaoMini onClick={iniciarEdicao}>Editar nome</BotaoMini>
                  {inbox.decNome.podeAdiar && <BotaoMini disabled={inbox.adiando} onClick={inbox.adiarNome}>Lembrar depois</BotaoMini>}
                  {inbox.decNome.acao === 'bloqueia' && <BotaoMini disabled={inbox.adiando} title="Libera por 24h e fica registrado" onClick={inbox.nomeNaoInformado}>Cliente ainda não informou</BotaoMini>}
                </span>
              </div>
            )}

            <div className="wa-msgs" ref={msgsRef}>
              {itensConversa.map((item, i) =>
                item.tipo === 'sep' ? (
                  <div className="dia" key={'sep-' + i}>{item.label}</div>
                ) : (
                  <Bolha
                    key={item.msg.id ?? item.msg.cid ?? 'i' + i}
                    m={item.msg} demo={demo} nomeCliente={nomeExibicao(current)}
                    retryId={inbox.retryId} removendoId={inbox.removendoId} semDestino={inbox.semDestino} optout={optout}
                    aoResponder={(m) => {
                      inbox.setReplyTo({
                        id: m.id ?? '', idExt: m.idExterno, fromMe: m.dir === 'out', tipo: m.tipo,
                        texto: (m.text || (m.tipo === 'audio' ? 'Mensagem de voz' : m.tipo === 'imagem' ? 'Imagem' : m.tipo === 'video' ? 'Vídeo' : m.tipo === 'documento' ? 'Documento' : '')).slice(0, 300),
                        remetente: m.dir === 'out' ? (assinaturaNome || 'Você') : (current.name || 'Cliente'),
                      });
                      textareaRef.current?.focus();
                    }}
                    aoVerErro={(m) => setVerErro(traduzErroEnvio(m.erro ?? ''))}
                    aoRetry={inbox.retryMsg}
                    aoRemover={(m) => setRemoverAlvo(m)}
                    aoLightbox={setLightbox}
                    aoRecarregarAudio={async (m) => {
                      if (!WA_REAL || !m.id) return;
                      try { await waRecarregarAudio(currentOrg.id, m.id); await inbox.msgsQ.refetch(); }
                      catch { aoAvisar({ tom: 'erro', texto: 'Não foi possível recarregar o áudio.' }); }
                    }}
                  />
                ),
              )}
            </div>

            <div className="wa-composer">
              {/* respostas rápidas — A PONTE: scripts reais; clique abre o fluxo de envio com confirmação (nunca envio cego) */}
              {scripts.length > 0 && (
                <div className="rapidas" role="list" aria-label="Respostas rápidas (Scripts)">
                  {scripts.slice(0, 8).map((s) => (
                    <button
                      key={s.id} type="button" className="rapida" role="listitem" disabled={composerBloqueado}
                      title={(s.conteudo || '').slice(0, 120) + ` · ${etapaCounts[s.id] ?? 1} msg${(etapaCounts[s.id] ?? 1) === 1 ? '' : 's'}`}
                      onClick={() => { if (optout) { aoAvisar({ tom: 'erro', texto: optoutTexto }); return; } setScriptSeq(s); }}
                    >
                      {s.favorito ? '★ ' : ''}{s.titulo}
                    </button>
                  ))}
                  <button
                    type="button" className={'rapida rapida-todos' + (pop?.kind === 'scripts' ? ' on' : '')}
                    title="Ver todos os scripts, por categoria, sem sair da conversa"
                    onClick={(e) => {
                      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                      const x = Math.min(r.left, window.innerWidth - 320);
                      setPop((p) => (p?.kind === 'scripts' ? null : { kind: 'scripts', x, y: r.top - 6, acima: true }));
                    }}
                  >Todos ▾</button>
                </div>
              )}

              <div className="wa-linha-resp">
                Responder por:
                {demo ? (
                  ['Chip 1', 'Chip 2', 'Chip 3'].map((chip) => (
                    <button key={chip} type="button" className={'wa-chipbtn' + (inbox.replyChip === chip ? ' on' : '')} onClick={() => inbox.onReplyChip(chip)}>{chip}</button>
                  ))
                ) : inbox.realCanais.length === 0 ? (
                  <>Nenhum número conectado · <button type="button" className="lnk" style={{ background: 'none', border: 'none', color: 'var(--txt-2)', textDecoration: 'underline', cursor: 'pointer', fontSize: 10.5, fontFamily: 'var(--fonte)' }} onClick={() => nav('/integracoes')}>conectar</button></>
                ) : (
                  inbox.realCanais.map((c) => (
                    <button
                      key={c.id} type="button"
                      className={'wa-chipbtn' + (inbox.replyCanalId === c.id ? ' on' : '') + (c.status !== 'conectado' ? ' off' : '')}
                      title={c.status !== 'conectado' ? `Indisponível (${c.status})` : tituloCanal(c.alias, c.transporte)}
                      onClick={() => inbox.onReplyCanal(c.id)}
                    >
                      {c.alias}<span className={'oftag' + (c.transporte === 'cloud_api' ? '' : ' qr')}>{c.transporte === 'cloud_api' ? '✓ Oficial' : 'QR'}</span>
                    </button>
                  ))
                )}
                <span className="wa-assina">
                  Assinar como:
                  <select className="inp" value={assinaMode} onChange={(e) => { setAssinaMode(e.target.value); persistAssinatura(e.target.value, assinaCustom); }}>
                    {ASSINA_OPCOES.map(([v, r]) => <option key={v} value={v}>{r}</option>)}
                  </select>
                  {assinaMode === 'personalizado' && (
                    <input className="inp" placeholder="Nome na assinatura" value={assinaCustom} onChange={(e) => setAssinaCustom(e.target.value)} onBlur={() => persistAssinatura(assinaMode, assinaCustom)} />
                  )}
                  {assinaturaNome && <span className="prev">*{assinaturaNome}:*</span>}
                </span>
              </div>

              {/* avisos do composer (cascata v1 + opt-out) */}
              {optout && (
                <div className="wa-aviso bloq" title={optoutTexto}><b>Não incomodar</b> — este contato pediu para não receber mensagens</div>
              )}
              {inbox.canalRestrito && !inbox.canalIndisponivel && inbox.canalSel && (
                <div className="wa-aviso bloq" title={`O número ${inbox.canalSel.alias} está com restrição no WhatsApp e está indisponível para envio. Selecione outro canal em "Responder por" para responder.`}>
                  <b>{inbox.canalSel.alias}</b> com restrição no WhatsApp — selecione outro canal
                </div>
              )}
              {!inbox.canalRestrito && WA_REAL && inbox.canalSel && inbox.canalSel.status === 'conectado' && (inbox.canalSel.entregaStatus === 'restrito' || inbox.canalSel.entregaStatus === 'instavel' || inbox.envioSaude !== 'ok') && (
                <div className="wa-aviso info" title={
                  inbox.canalSel.entregaStatus === 'restrito'
                    ? `Este canal (${inbox.canalSel.alias}) está conectado, mas falhou na entrega de mensagens recentes. Prefira outro canal em "Responder por" e evite reconectar repetidamente.`
                    : inbox.envioSaude === 'indisponivel'
                      ? `O envio por ${inbox.canalSel.alias} não está saindo agora. Você pode responder por outro número — o envio por outro número muda o remetente para o cliente.`
                      : `O envio pelo canal ${inbox.canalSel.alias} está instável agora (algumas mensagens estão falhando). Se falhar, selecione outro canal em "Responder por".`
                }>
                  {inbox.canalSel.entregaStatus === 'restrito' ? <><b>{inbox.canalSel.alias}</b> falhou na entrega recente</>
                    : inbox.envioSaude === 'indisponivel' ? <><b>{inbox.canalSel.alias}</b> recebe, mas não envia agora</>
                    : <>Envio instável por <b>{inbox.canalSel.alias}</b></>}
                </div>
              )}
              {inbox.semDestino && (
                <div className="wa-aviso bloq" title="Esta conversa foi recebida por uma identidade protegida do WhatsApp e ainda não possui um número confirmado para resposta. O histórico permanece.">
                  Identidade protegida — sem número para resposta
                  <button type="button" className="lnk" onClick={() => setVincAberto(true)}>Vincular número</button>
                </div>
              )}

              {/* agendadas na conversa */}
              {(agendadasQ.data ?? []).filter((a) => ['agendada', 'processando', 'falhou', 'bloqueada'].includes(a.status)).map((a) => (
                <div className="ag-mini num" key={a.id}>
                  <IcClock />
                  <b>{a.status === 'agendada' ? 'Agendada' : a.status === 'processando' ? 'Enviando…' : a.status === 'bloqueada' ? 'Bloqueada' : 'Falhou'}</b>
                  para {new Date(a.executarEm).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })}
                  · {({ texto: 'Texto', imagem: 'Imagem', audio: 'Áudio', video: 'Vídeo', documento: 'Documento' } as Record<string, string>)[a.tipo] ?? a.tipo}
                  {a.nomeArquivo ? ` · ${a.nomeArquivo}` : ''}{a.nomeCanal ? ` · via ${a.nomeCanal}` : ''}{a.criadoPor && nomePorId(a.criadoPor) ? ` · por ${nomePorId(a.criadoPor)}` : ''}
                  {(a.ultimoErro || a.motivoBloqueio) && <span className="err">{a.ultimoErro ?? a.motivoBloqueio}</span>}
                  {a.status === 'agendada' && (
                    <>
                      <button type="button" className="lnk" onClick={() => { setAgEditId(a.id); setAgendarAberto(true); }}>Editar</button>
                      <button type="button" className="lnk" onClick={() => setCancelarAgId(a.id)}>
                        Cancelar
                      </button>
                    </>
                  )}
                </div>
              ))}

              {inbox.replyTo && (
                <div className="reply-box">
                  <div>
                    <div className="rem">Respondendo a {inbox.replyTo.remetente}</div>
                    <div className="tt">{inbox.replyTo.texto || (inbox.replyTo.tipo === 'audio' ? 'Mensagem de voz' : inbox.replyTo.tipo === 'imagem' ? 'Imagem' : inbox.replyTo.tipo === 'video' ? 'Vídeo' : 'Documento')}</div>
                  </div>
                  <button type="button" className="x" aria-label="Cancelar resposta" onClick={() => inbox.setReplyTo(null)}>×</button>
                </div>
              )}

              <div className="cmsg">
                <textarea
                  ref={textareaRef} rows={1} value={draft} placeholder={placeholder} disabled={composerBloqueado}
                  onChange={(e) => { setDraft(e.target.value); e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'; }}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); } }}
                />
                <div className="tools">
                  <button type="button" className="tool" title="Enviar imagem" disabled={midiaDisabled} onClick={() => setImgModal(true)}><IcImg /></button>
                  <AudioRecorderV2 disabled={midiaDisabled} onEnviar={inbox.enviarAudio} permitirArquivo />
                  <button type="button" className="tool" title="Enviar documento" disabled={midiaDisabled} onClick={() => setDocModal(true)}><IcDoc /></button>
                  <button type="button" className="tool" title="Agendar mensagem" disabled={agendarDisabled} onClick={() => { setAgEditId(null); setAgendarAberto(true); }}><IcClock /></button>
                </div>
                <button type="button" className="env-b" title="Enviar" disabled={sendDisabled} onClick={enviar}><IcSend /></button>
              </div>
            </div>
          </>
        )}
      </section>

      {/* ===================== CONTEXTO =====================
          O reabrir "Dados" agora é um botão irmão na fileira de ações do cabeçalho
          (.wa-ctopo .dir, condicionado a !ctxAberto) — não flutua mais solto sobre o header. */}
      {current.id && (
        <aside className={'wa-ctx' + (ctxAberto ? '' : ' recolhido')} aria-hidden={!ctxAberto} {...(!ctxAberto ? ({ inert: '' } as Record<string, string>) : {})}>
         <div className="wa-ctx-inner">
          <div className="ctx-topo spot">
            <div className="av2">{initials(nomeExibicao(current))}</div>
            <div className="n2">{nomeExibicao(current)}</div>
            <div className="t2 num">
              {current.phone ? mascararNumero(current.phone) : 'sem número'}
              {current.phone && <button type="button" className="cp" title="Copiar telefone" onClick={copiarTelefone}><IcCopy /></button>}
            </div>
            <div className="bb">
              <BotaoMini onClick={() => setCtxAberto(false)}>Recolher</BotaoMini>
              {editMode
                ? <BotaoPrimario mini disabled={salvandoEdicao} onClick={salvarEdicao}>{salvandoEdicao ? 'Salvando…' : 'Salvar'}</BotaoPrimario>
                : <BotaoPrimario mini onClick={iniciarEdicao}>Editar</BotaoPrimario>}
            </div>
            {editMode && <div style={{ marginTop: 6 }}><BotaoMini onClick={() => setEditMode(false)}>Cancelar</BotaoMini></div>}
          </div>

          {optout && (
            <div className="ctx-b spot">
              <div className="ctx-optout"><b>Não incomodar ativo.</b> Nenhuma mensagem (bot, régua ou agendamento) é enviada a este contato.</div>
            </div>
          )}

          {editMode && (
            <div className="ctx-b ctx-edit">
              <div className="campo"><label>Nome</label><input className="inp" value={editForm.nome} onChange={(e) => setEditForm((f) => ({ ...f, nome: e.target.value }))} /></div>
              <div className="campo"><label>E-mail</label><input className="inp" placeholder="email@exemplo.com" value={editForm.email} onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))} /></div>
              <div className="campo"><label>Responsável</label>
                <select className="inp" value={editForm.responsavelId} onChange={(e) => setEditForm((f) => ({ ...f, responsavelId: e.target.value }))}>
                  <option value="">Não atribuído</option>
                  {usuarios.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
                </select>
              </div>
              <div className="campo"><label>Observações</label><textarea className="inp" rows={2} value={editForm.observacoes} onChange={(e) => setEditForm((f) => ({ ...f, observacoes: e.target.value }))} /></div>
            </div>
          )}

          <div className="ctx-b spot">
            <div className="ctx-t">Status</div>
            <button type="button" className="ctx-status" onClick={(e) => abrirPop('status', e)}>
              <span className="dot" style={{ background: current.statusCor ?? 'var(--txt-3)' }} />
              {current.status || 'Definir status'}
            </button>
          </div>

          <KanbanCtx contatoId={current.contatoId ?? null} demo={demo} etapa={current.etapa} etapaCor={current.etapaCor} origem={current.origin} respNome={current.respId ? nomePorId(current.respId) : undefined} lead={current} aoAvisar={aoAvisar} />

          {cobrancasCtx.length > 0 && (
            <div className="ctx-b spot">
              <div className="ctx-t">Cobranças <button type="button" className="lk" onClick={() => nav('/cobrancas')}>ver</button></div>
              {cobrancasCtx.map((cb) => (
                <div className="cx-l" key={cb.id}>
                  <span className="k num">
                    {cb.ciclosPagos}/{cb.ciclosTotais}
                    {cb.proximaCobranca ? ' · ' + cb.proximaCobranca.split('-').reverse().slice(0, 2).join('/') : ''}
                  </span>
                  {(() => {
                    const venc = /atras|venc/i.test(cb.status), pago = /quitad|conclu/i.test(cb.status);
                    return <span className={'st ' + (venc ? 's-er' : pago ? 's-ok' : 's-at')}><i />{venc ? 'Vencida' : pago ? 'Pago' : 'Pendente'}</span>;
                  })()}
                </div>
              ))}
            </div>
          )}

          <div className="ctx-b spot">
            <div className="ctx-t">Etiquetas <button type="button" className="lk" onClick={(e) => abrirPop('tags', e)}>+</button></div>
            <div className="ctx-tags">
              {current.tags.length === 0 && <span className="ctx-nota">Nenhuma etiqueta</span>}
              {current.tags.map((t) => {
                const cor = corDaEtiqueta(t, etiquetasQ.data);
                return (
                  <span key={t} className="ctx-tag" style={{ background: cor + '22', color: cor, borderColor: cor + '55' }}>
                    {t}
                    <button type="button" className="x" aria-label={'Remover etiqueta ' + t} onClick={() => alternarEtiqueta(t)}>×</button>
                  </span>
                );
              })}
            </div>
          </div>

          <div className="ctx-b spot">
            <div className="ctx-t">Responsável</div>
            <div className="cx-l">
              <span className="k">{current.respId ? (current.respId === user?.id ? 'Você' : nomePorId(current.respId) ?? 'Atendente') : 'Sem responsável'}</span>
              <span className="v">
                {inbox.donoEfetivo
                  ? <button type="button" className="lk" style={{ background: 'none', border: 'none', color: 'var(--txt-2)', textDecoration: 'underline', cursor: 'pointer', fontSize: 10.5, fontFamily: 'var(--fonte)' }} onClick={inbox.devolver}>Devolver para a fila</button>
                  : <button type="button" className="lk" style={{ background: 'none', border: 'none', color: 'var(--txt-2)', textDecoration: 'underline', cursor: 'pointer', fontSize: 10.5, fontFamily: 'var(--fonte)' }} onClick={inbox.assumir}>{inbox.atribuindo ? 'Assumindo…' : 'Assumir atendimento'}</button>}
              </span>
            </div>
          </div>

          {(atividadesQ.data ?? []).length > 0 && (
            <div className="ctx-b spot">
              <div className="ctx-t">Atividade do atendimento</div>
              <ul className="ativ-tl">
                {(atividadesQ.data ?? []).map((a) => (
                  <li key={a.id}>
                    <b>{a.usuario ?? 'Alguém'}</b> {a.tipo === 'assumido' ? 'assumiu o atendimento' : a.tipo === 'transferido' ? 'transferiu o atendimento' : a.tipo === 'devolvido' ? 'devolveu para a fila' : a.tipo}
                    {' · '}{new Date(a.em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    {a.motivo && <div className="mot">Motivo: {a.motivo}</div>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {current.ultimoCanal?.alias && (
            <div className="ctx-b spot">
              <div className="ctx-t">Último canal utilizado</div>
              <div className="ctx-nota num">
                {current.ultimoCanal.alias}
                {current.ultimoCanal.numero ? ' · ' + mascararNumero(current.ultimoCanal.numero) : ''}
                {current.ultimoCanal.em ? ' · ' + new Date(current.ultimoCanal.em).toLocaleString('pt-BR') : ''}
              </div>
            </div>
          )}

          <div className="ctx-b spot">
            <div className="ctx-t">Nota interna</div>
            <div className="ctx-nota">{current.notes || 'Sem observações.'}</div>
          </div>
          <div className="ctx-b spot">
            <div className="ctx-t">Origem do lead</div>
            <div className="cx-l"><span className="k"><IcWa /></span><span className="v">{current.origin}</span></div>
            <div className="cx-l"><span className="k">Última interação</span><span className="v num">{current.lastInter || current.time}</span></div>
          </div>
         </div>
        </aside>
      )}

      {/* ===================== POPOVERS (portal) ===================== */}
      {pop && createPortal(
        <div className={'wa-pop' + (pop.kind === 'scripts' ? ' wa-pop-scripts' : '')} style={pop.acima ? { left: pop.x, bottom: window.innerHeight - pop.y } : { left: pop.x, top: pop.y }} role={pop.kind === 'acoes' ? 'menu' : undefined}>
          {pop.kind === 'filtro' && (
            <>
              <div className="ph2">Filtrar por número</div>
              <button type="button" className="it" onClick={() => { setFiltroCanal(null); setPop(null); }}>Todos os números {!filtroCanal && <span className="ck">✓</span>}</button>
              {inbox.realCanais.map((c) => (
                <button key={c.id} type="button" className="it" title={tituloCanal(c.alias, c.transporte)} onClick={() => { setFiltroCanal(c.id); setPop(null); }}>
                  {c.alias}<span className={'oftag' + (c.transporte === 'cloud_api' ? '' : ' qr')}>{c.transporte === 'cloud_api' ? '✓ Oficial' : 'QR'}</span> {filtroCanal === c.id && <span className="ck">✓</span>}
                </button>
              ))}
              {/* "|| filtroTransporte": se os canais sumirem com o filtro ativo, o controle de limpar continua acessível */}
              {(inbox.realCanais.length > 0 || filtroTransporte) && (
                <>
                  <div className="ph2">Conexão do número</div>
                  <button type="button" className="it" onClick={() => { setFiltroTransporte(null); setPop(null); }}>Todas as conexões {!filtroTransporte && <span className="ck">✓</span>}</button>
                  <button type="button" className="it" title="Conversas do canal oficial (API do WhatsApp/Meta)" onClick={() => { setFiltroTransporte('cloud_api'); setPop(null); }}>Oficial (API do WhatsApp) {filtroTransporte === 'cloud_api' && <span className="ck">✓</span>}</button>
                  <button type="button" className="it" title="Tudo que não é o canal oficial: números conectados por QR e canais já removidos" onClick={() => { setFiltroTransporte('evolution'); setPop(null); }}>QR (não oficial) {filtroTransporte === 'evolution' && <span className="ck">✓</span>}</button>
                </>
              )}
              <div className="ph2">Status</div>
              <button type="button" className="it" onClick={() => { setFiltroStatus(null); setPop(null); }}>Todos os status {!filtroStatus && <span className="ck">✓</span>}</button>
              {statusAtivos.map((s) => (
                <button key={s.id} type="button" className="it" onClick={() => { setFiltroStatus(s.id); setPop(null); }}>
                  <span className="dot" style={{ background: s.cor }} />{s.nome} {filtroStatus === s.id && <span className="ck">✓</span>}
                </button>
              ))}
            </>
          )}
          {pop.kind === 'acoes' && (
            <>
              <button type="button" className="it" onClick={() => { setPop(null); iniciarEdicao(); }}>Editar dados do cliente</button>
              {(current.unread ?? 0) > 0
                ? <button type="button" className="it" onClick={() => { setPop(null); inbox.marcarLida(true); }}>Marcar como lida</button>
                : <button type="button" className="it" onClick={() => { setPop(null); inbox.marcarLida(false); }}>Marcar como não lida</button>}
              <button type="button" className="it" onClick={() => { setPop(null); inbox.arquivar(!current.arquivada); }}>{current.arquivada ? 'Desarquivar conversa' : 'Arquivar conversa'}</button>
              {current.phone && <button type="button" className="it" onClick={() => { setPop(null); copiarTelefone(); }}>Copiar telefone</button>}
              {statusFechada && current.status !== statusFechada.nome && (
                <button type="button" className="it" onClick={() => { setPop(null); setFecharConfirm(true); }}>Fechar conversa</button>
              )}
            </>
          )}
          {pop.kind === 'status' && (
            <>
              <div className="ph2">Status da conversa</div>
              {statusAtivos.length === 0 && <div className="vazio">Nenhum status ativo.</div>}
              {statusAtivos.map((s) => (
                <button key={s.id} type="button" className="it" onClick={() => { setPop(null); aplicarStatus(s.id); }}>
                  <span className="dot" style={{ background: s.cor }} />{s.nome} {current.statusId === s.id && <span className="ck">✓</span>}
                </button>
              ))}
              {podeGerenciar && <button type="button" className="lk" onClick={() => { setPop(null); nav('/configuracoes?tab=atendimento&section=status'); }}>Gerenciar status…</button>}
            </>
          )}
          {pop.kind === 'scripts' && (
            <>
              {scriptsPorCategoria.length === 0 && <div className="vazio">Nenhum script para WhatsApp. Crie no arsenal.</div>}
              {scriptsPorCategoria.map((g) => (
                <div key={g.id} className="scr-grupo">
                  <div className="ph2">{g.nome}</div>
                  {g.itens.map((s) => {
                    const r = scriptsResumo[s.id];
                    const total = r?.total ?? etapaCounts[s.id] ?? (s.conteudo.trim() ? 1 : 0);
                    const temMidia = r?.temMidia ?? false;
                    return (
                      <button
                        key={s.id} type="button" className="it scr-it"
                        onClick={() => { setPop(null); if (optout) { aoAvisar({ tom: 'erro', texto: optoutTexto }); return; } setScriptSeq(s); }}
                      >
                        <span className="scr-nome">{s.favorito ? '★ ' : ''}{s.titulo}</span>
                        {temMidia && <span className="scr-tag">mídia</span>}
                        <span className="scr-cnt">{total} msg{total === 1 ? '' : 's'}</span>
                      </button>
                    );
                  })}
                </div>
              ))}
              <button type="button" className="lk" onClick={() => { setPop(null); nav('/scripts'); }}>Gerenciar no arsenal…</button>
            </>
          )}
          {pop.kind === 'tags' && (
            <>
              <div className="ph2">Etiquetas</div>
              {(etiquetasQ.data ?? []).filter((t) => t.ativo).length === 0 && <div className="vazio">{podeGerenciar ? 'Nenhuma etiqueta. Crie em Configurações.' : 'Peça a um gestor.'}</div>}
              {(etiquetasQ.data ?? []).filter((t) => t.ativo).map((t) => (
                <button key={t.nome} type="button" className="it" onClick={() => alternarEtiqueta(t.nome)}>
                  <span className="dot" style={{ background: t.cor }} />{t.nome} {current.tags.includes(t.nome) && <span className="ck">✓</span>}
                </button>
              ))}
              {podeGerenciar && <button type="button" className="lk" onClick={() => { setPop(null); nav('/configuracoes?tab=atendimento&section=etiquetas'); }}>Gerenciar etiquetas…</button>}
            </>
          )}
        </div>,
        raizPop,
      )}

      {/* ===================== MODAIS ===================== */}
      {novaConversa && (
        <NovaConversaModal
          canais={inbox.realCanais.filter((c) => c.status === 'conectado')}
          demo={demo}
          aoFechar={() => setNovaConversa(false)}
          aoIniciar={async (canalId, tel, nome) => {
            const ok = await inbox.iniciarNovaConversa(canalId, tel, nome);
            if (ok) { setNovaConversa(false); window.setTimeout(() => textareaRef.current?.focus(), 60); }
            return ok;
          }}
        />
      )}
      {transferirAberto && (
        <TransferirModal
          usuarios={usuarios} atualId={current.respId ?? null} meuId={user?.id ?? null}
          atualNome={current.respId ? nomePorId(current.respId) ?? null : null}
          busy={inbox.atribuindo}
          aoFechar={() => setTransferirAberto(false)}
          aoTransferir={async (destinoId, motivo) => {
            const ok = await inbox.transferir(destinoId, motivo);
            if (ok) setTransferirAberto(false);
          }}
        />
      )}
      {vincAberto && (
        <VincularModal
          telInicial={current.phone} conversaId={current.id} canalId={inbox.replyCanalId || current.canalId || ''}
          demo={demo}
          aoFechar={() => setVincAberto(false)}
          aoVinculado={async () => { setVincAberto(false); await inbox.live.refetch(); aoAvisar({ tom: 'ok', texto: 'Número vinculado e confirmado. Você já pode responder.' }); }}
        />
      )}
      <ConfirmDialogV2
        aberto={fecharConfirm}
        titulo="Fechar conversa"
        mensagem={statusFechada ? `A conversa será marcada como "${statusFechada.nome}". Você pode reabri-la mudando o status depois.` : 'Fechar esta conversa?'}
        rotuloConfirmar="Fechar conversa"
        aoConfirmar={() => { setFecharConfirm(false); if (statusFechada) aplicarStatus(statusFechada.id); }}
        aoCancelar={() => setFecharConfirm(false)}
      />
      <ConfirmDialogV2
        aberto={verErro !== null}
        titulo="Falha no envio"
        mensagem={verErro ?? ''}
        rotuloConfirmar="Entendi"
        aoConfirmar={() => setVerErro(null)}
        aoCancelar={() => setVerErro(null)}
      />
      <ConfirmDialogV2
        aberto={!!removerAlvo}
        titulo="Remover esta mensagem com falha?"
        mensagem="Ela não foi entregue ao cliente e será retirada da conversa."
        rotuloConfirmar="Remover"
        destrutivo
        carregando={!!inbox.removendoId}
        aoConfirmar={async () => { if (removerAlvo) { await inbox.removerFalha(removerAlvo); setRemoverAlvo(null); } }}
        aoCancelar={() => setRemoverAlvo(null)}
      />
      <ConfirmDialogV2
        aberto={!!cancelarAgId}
        titulo="Cancelar agendamento?"
        mensagem="A mensagem não será enviada."
        rotuloConfirmar="Cancelar agendamento"
        destrutivo
        carregando={cancelarAgMut.isPending}
        aoConfirmar={async () => {
          if (!cancelarAgId || !current) return;
          try { await cancelarAgMut.mutateAsync({ id: cancelarAgId, conversaId: current.id }); aoAvisar({ tom: 'ok', texto: 'Agendamento cancelado.' }); }
          catch (e) { aoAvisar({ tom: 'erro', texto: (e as Error)?.message || 'Falha ao cancelar.' }); }
          setCancelarAgId(null);
        }}
        aoCancelar={() => setCancelarAgId(null)}
      />
      <MediaComposer
        open={imgModal} tipo="imagem" previewCard
        onClose={() => setImgModal(false)}
        enviar={async (file, caption) => { await inbox.enviarImagem(file, caption); setImgModal(false); }}
      />
      <MediaComposer
        open={docModal} tipo="documento"
        onClose={() => setDocModal(false)}
        enviar={async (file, caption) => { await inbox.enviarDocumento(file, caption); setDocModal(false); }}
      />
      {agendarAberto && (
        <AgendarMensagemModalV2
          aberto modo={agEditId ? 'editar' : 'criar'} demo={demo}
          canais={canaisAgendaveis.map((c) => ({ id: c.id, alias: c.alias, numero: c.numero, status: c.status, envioRestrito: c.envioRestrito, conflitoCom: c.conflitoCom }))}
          temTelefone={!!current.phone}
          ultimaInteracaoMs={current.lastAtMs ?? null}
          initial={agEditId ? (() => {
            const a = (agendadasQ.data ?? []).find((x) => x.id === agEditId);
            return a ? { canalId: a.canalId, texto: a.texto ?? '', executarEm: a.executarEm, tipo: a.tipo, nomeArquivo: a.nomeArquivo ?? undefined } : null;
          })() : null}
          aoFechar={() => { setAgendarAberto(false); setAgEditId(null); }}
          aoSubmeter={async (v) => {
            if (optout) { aoAvisar({ tom: 'erro', texto: optoutTexto }); return; }   // opt-out: revalidar no submit (pode ter bloqueado com o modal aberto)
            if (demo) { aoAvisar({ tom: 'ok', texto: 'Mensagem agendada — será enviada automaticamente no horário.' }); return; }
            if (agEditId) {
              await editarAgMut.mutateAsync({ id: agEditId, conversaId: current.id, canalId: v.canalId, texto: v.texto ?? '', executarEm: v.executarISO });
              aoAvisar({ tom: 'ok', texto: 'Agendamento atualizado.' });
            } else {
              const itens = v.itens ?? [];
              await agendarSeqMut.mutateAsync({ conversaId: current.id, canalId: v.canalId, executarEm: v.executarISO, itens });
              aoAvisar({ tom: 'ok', texto: itens.length > 1 ? `${itens.length} mensagens agendadas — serão enviadas no horário.` : 'Mensagem agendada — será enviada automaticamente no horário.' });
            }
          }}
        />
      )}
      <ScriptSequenceModal
        open={!!scriptSeq} script={scriptSeq}
        canal="whatsapp" conversaId={current.id} incluirMidia
        onClose={() => setScriptSeq(null)}
        ctx={{ cliente: current.name, atendente: user?.name || 'Atendente', emailAtendente: user?.email ?? '', empresa: currentOrg.name, telefone: current.phone }}
        enviarMidia={async (m) => {
          // Mesmas travas do composer (o estado pode mudar por realtime com o modal aberto).
          if (inbox.canalRestrito) throw new Error('O número deste canal está com restrição no WhatsApp e está indisponível para envio. Selecione outro canal.');
          if (inbox.canalIndisponivel) throw new Error('Este número está desconectado. Reconecte em Integrações para enviar.');
          if (inbox.semDestino) throw new Error('Vincule um número confirmado para responder.');
          if (optout) throw new Error(optoutTexto);
          if (inbox.higieneBloqueia) throw new Error(textoBloqueio(inbox.higiene) ?? 'Atendimento sem responsável ou com cadastro incompleto — assuma e complete o nome para enviar.');
          if (!m.storagePath) throw new Error('Mídia do script sem arquivo. Reenvie o anexo no arsenal de Scripts.');
          if (demo) { aoAvisar({ tom: 'ok', texto: 'Mídia enviada' }); return; }
          // A mídia do script já vive no bucket privado (script-midia); envia pelo mesmo caminho do compositor.
          const id = await sendMut.mutateAsync({
            conversaId: current.id, canalId: inbox.replyCanalId || current.canalId,
            midiaPath: m.storagePath, midiaTipo: m.tipo, midiaMime: m.mime ?? undefined, midiaNome: m.nome ?? undefined, midiaTamanho: m.tamanho ?? undefined,
            text: m.texto || undefined,
          });
          if (id) await aguardarConfirmacaoEnvio(id); // sucesso = confirmação REAL do provedor (igual ao texto)
        }}
        enviarEtapa={async (texto, retryMensagemId) => {
          // TODAS as travas do composer valem também aqui — o caminho de script não pode furar
          // o que sendMsg bloqueia (o estado pode mudar por realtime com o modal aberto). Espelha
          // as mesmas verificações/mensagens de useInboxWhatsApp.sendMsg, na mesma ordem.
          if (inbox.canalRestrito) throw new Error('O número deste canal está com restrição no WhatsApp e está indisponível para envio. Selecione outro canal.');
          if (inbox.canalIndisponivel) throw new Error('Este número está desconectado. Reconecte em Integrações para enviar.');
          if (inbox.semDestino) throw new Error('Vincule um número confirmado para responder.');
          if (optout) throw new Error(optoutTexto);
          if (inbox.higieneBloqueia) throw new Error(textoBloqueio(inbox.higiene) ?? 'Atendimento sem responsável ou com cadastro incompleto — assuma e complete o nome para enviar.');
          if (demo) { aoAvisar({ tom: 'ok', texto: 'Mensagem enviada' }); return; }
          const id = await sendMut.mutateAsync({ conversaId: current.id, canalId: inbox.replyCanalId || current.canalId, assinaturaNome: assinaturaNome || undefined, text: texto, retryMensagemId });
          return id ?? undefined;
        }}
        confirmar={(id) => (demo ? Promise.resolve('enviada' as const) : aguardarConfirmacaoEnvio(id))}
      />
      {lightbox && (
        <div className="veu" role="dialog" aria-modal onMouseDown={(e) => { if (e.target === e.currentTarget) setLightbox(null); }} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 96 }}>
          <button type="button" aria-label="Fechar" onClick={() => setLightbox(null)} style={{ position: 'fixed', top: 14, right: 18, fontSize: 22, background: 'none', border: 'none', color: 'var(--txt)', cursor: 'pointer' }}>×</button>
          <img src={lightbox} alt="Imagem ampliada" style={{ maxWidth: '86vw', maxHeight: '86vh', borderRadius: 10 }} />
        </div>
      )}
    </div>
  );
}

/* ================================================================
   Bolha de mensagem — .rec/.env2 do mockup com o conteúdo da v1:
   selo do bot (origemBot → "◈ Matheo"), áudio com onda + .transc,
   imagem/vídeo/documento, quoted, ticks, falha, responder.
   ================================================================ */
function Bolha({ m, demo, nomeCliente, retryId, removendoId, semDestino, optout, aoResponder, aoVerErro, aoRetry, aoRemover, aoLightbox, aoRecarregarAudio }: {
  m: WaMessage; demo: boolean; nomeCliente: string; retryId: string | null; removendoId: string | null; semDestino: boolean; optout: boolean;
  aoResponder: (m: WaMessage) => void; aoVerErro: (m: WaMessage) => void; aoRetry: (m: WaMessage) => void;
  aoRemover: (m: WaMessage) => void; aoLightbox: (url: string) => void; aoRecarregarAudio: (m: WaMessage) => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [urlErro, setUrlErro] = useState(false);
  // v1: imagem/vídeo resolvem a URL assinada eager; ÁUDIO só no play (AudioBolha) — não emitir N signed-URLs por abertura de conversa
  const precisaUrl = !demo && !!m.anexoPath && ['imagem', 'video'].includes(m.tipo ?? '');
  useEffect(() => {
    let vivo = true;
    setUrl(null); setUrlErro(false);
    if (precisaUrl && m.anexoPath) {
      urlAssinadaMidiaWa(m.anexoPath).then((u) => { if (vivo) setUrl(u); }).catch(() => { if (vivo) setUrlErro(true); });
    }
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m.anexoPath]);
  // enquanto a URL assinada não resolveu (anexo presente) é CARREGANDO, não "indisponível" (v1 não pisca)
  const carregandoMidia = precisaUrl && !url && !urlErro;
  const ack = m.dir === 'out' ? ackOf(m.status) : null;
  const falhou = m.dir === 'out' && m.status === 'falhou';   // só saída falha (v1); inbound nunca é "não enviado"

  // Baixar a mídia recebida/enviada com o nome/extensão corretos (URL assinada curta com Content-Disposition).
  // Ícone sobreposto à imagem/vídeo (canto inf. direito) e ao lado do player de áudio — reusa a lógica do v1.
  async function baixarMidia() {
    if (demo || !m.anexoPath) return;
    const nome = nomeArquivoMidia(m);
    try {
      const u = await urlDownloadMidiaWa(m.anexoPath, nome);
      const a = document.createElement('a');
      a.href = u; a.download = nome; a.rel = 'noopener';
      document.body.appendChild(a); a.click(); a.remove();
    } catch { /* falha silenciosa: bucket privado pode negar; o usuário pode tentar de novo */ }
  }
  const btnBaixar = (!demo && m.anexoPath && !falhou) ? (
    <button type="button" className="midia-dl" title={rotuloBaixarMidia(m.tipo)} aria-label={rotuloBaixarMidia(m.tipo)} onClick={baixarMidia}>
      <IcDownload />
    </button>
  ) : null;

  const falhaActs = falhou && (
    <div className="msg-falha-acts">
      <button type="button" className="lnk" onClick={() => aoVerErro(m)}>Ver erro</button>·
      <button type="button" className="lnk" disabled={!m.id || retryId === m.id || semDestino || optout} title={semDestino ? 'Vincule um número confirmado para responder.' : undefined} onClick={() => aoRetry(m)}>
        {retryId === m.id ? 'Reenviando…' : 'Tentar novamente'}
      </button>·
      <button type="button" className="lnk" disabled={!m.id || removendoId === m.id} onClick={() => aoRemover(m)}>{removendoId === m.id ? 'Removendo…' : 'Remover'}</button>
    </div>
  );

  return (
    <div className={'bolha ' + (m.dir === 'out' ? 'env2' : 'rec') + (falhou ? ' falha' : '')}>
      {m.id && !semDestino && (
        <button type="button" className="resp-btn" title="Responder" aria-label="Responder" onClick={() => aoResponder(m)}><IcReply /></button>
      )}
      {m.origemBot && <div className="bt-tag">◈ Matheo</div>}
      {m.quoted && (
        <div className="mq">
          <div className="rem">{m.quoted.remetente || (m.dir === 'out' ? 'Você' : nomeCliente)}</div>
          <div className="tt">{m.quoted.texto || (m.quoted.tipo === 'audio' ? 'Mensagem de voz' : m.quoted.tipo === 'imagem' ? 'Imagem' : m.quoted.tipo === 'video' ? 'Vídeo' : 'Documento')}</div>
        </div>
      )}
      {m.tipo === 'imagem' && (
        (url || demo)
          ? <>
              {url ? <div className="m-media"><img className="m-img" loading="lazy" src={url} alt="Imagem" title="Ampliar" onClick={() => aoLightbox(url)} />{btnBaixar}</div> : <div className="audio-ind">Imagem de demonstração</div>}
              {m.text && <div className="m-cap"><WaTexto texto={m.text} /></div>}
            </>
          : carregandoMidia ? <div className="audio-ind">Carregando imagem…</div>
          : <div className="audio-ind">Imagem indisponível</div>  /* só quando anexo ausente ou URL falhou — nunca durante a carga */
      )}
      {m.tipo === 'video' && (
        url
          ? <>
              <div className="m-media"><video className="m-video" src={url} controls preload="metadata" />{btnBaixar}</div>
              {m.text && <div className="m-cap"><WaTexto texto={m.text} /></div>}
            </>
          : demo ? <div className="audio-ind">Vídeo de demonstração</div>
          : carregandoMidia ? <div className="audio-ind">Carregando vídeo…</div>
          : <div className="audio-ind">Vídeo indisponível</div>
      )}
      {m.tipo === 'audio' && (
        falhou
          ? <div className="audio-ind">Áudio não enviado</div>  /* saída que falhou não vira player tocável (v1) */
          : m.midiaPendente
          ? <div className="audio-ind">Áudio indisponível — <button type="button" className="lnk" onClick={() => aoRecarregarAudio(m)}>tentar carregar novamente</button></div>
          : <AudioBolha anexoPath={demo ? null : m.anexoPath ?? null} segundos={(m as WaMessage & { seconds?: number }).seconds ?? null} demo={demo} acaoNode={btnBaixar} />
      )}
      {m.tipo === 'documento' && (
        <div className="doc2">
          <span className="ic"><IcDoc /></span>
          <span className="inf">
            <span className="nm">{m.nome || 'documento'}</span>
            <span className="mt num">{(m.nome?.split('.').pop() || '').toUpperCase() || 'Arquivo'}{m.tamanho ? ' · ' + fmtTam(m.tamanho) : ''}</span>
            {!demo && m.anexoPath && (
              <span className="acts">
                <button type="button" className="lnk" onClick={async () => { const u = await urlDownloadMidiaWa(m.anexoPath!, nomeArquivoMidia(m)); window.location.assign(u); }}>Baixar</button>
                <button type="button" className="lnk" title="Abrir em nova aba" onClick={async () => { const u = await urlAssinadaMidiaWa(m.anexoPath!); window.open(u, '_blank', 'noopener'); }}>Abrir</button>
              </span>
            )}
          </span>
        </div>
      )}
      {m.pdf && (
        <div className="doc2"><span className="ic"><IcDoc /></span><span className="inf"><span className="nm">{m.pdf.name}</span><span className="mt">{m.pdf.meta}</span></span></div>
      )}
      {(m.tipo === 'texto' || (!m.tipo && m.text)) && m.text && <WaTexto texto={m.text} />}
      {m.transcricao && <div className="transc">“{m.transcricao}”</div>}
      {falhaActs}
      <div className="hh num">
        {m.viaTelefone && <span className="fone-tag" title="Enviada pelo celular"><IcTel />Enviada pelo celular</span>}
        {m.time}
        {ack && <span className={'tick ' + ack.cls} title={ack.cls === 'falhou' ? traduzErroEnvio(m.erro ?? '') : ack.title}>{ack.s}</span>}
      </div>
    </div>
  );
}

/** *negrito* + links, sem HTML bruto (equivalente ao WhatsAppText do v1). */
function WaTexto({ texto }: { texto: string }) {
  const partes = useMemo(() => {
    const out: ReactNode[] = [];
    const re = /(\*[^*\s][^*]*[^*\s]\*|\*[^*\s]\*|https?:\/\/\S+|www\.\S+)/g;
    let i = 0, k = 0, m: RegExpExecArray | null;
    while ((m = re.exec(texto))) {
      if (m.index > i) out.push(texto.slice(i, m.index));
      const t = m[0];
      if (t.startsWith('*')) out.push(<strong key={k++}>{t.slice(1, -1)}</strong>);
      else out.push(<a key={k++} className="wa-link" href={t.startsWith('www.') ? 'https://' + t : t} target="_blank" rel="noopener noreferrer nofollow">{t}</a>);
      i = m.index + t.length;
    }
    if (i < texto.length) out.push(texto.slice(i));
    return out;
  }, [texto]);
  return <span className="wa-fmt">{partes}</span>;
}

/** Player de áudio na pele do mockup (.audio2). A URL assinada é resolvida SÓ no play (v1: preload none),
    para não emitir uma rajada de signed-URLs por abertura de conversa. */
function AudioBolha({ anexoPath, segundos, demo, acaoNode }: { anexoPath: string | null; segundos: number | null; demo: boolean; acaoNode?: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [tocando, setTocando] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [pos, setPos] = useState(0);
  const [durS, setDurS] = useState(segundos ?? 0);
  const [rate, setRate] = useState(1);
  useEffect(() => () => { audioRef.current?.pause(); }, []);
  const montarAudio = (src: string) => {
    const a = new Audio(src);
    a.addEventListener('timeupdate', () => setPos(a.currentTime));
    a.addEventListener('loadedmetadata', () => { if (Number.isFinite(a.duration)) setDurS(a.duration); });
    a.addEventListener('ended', () => { setTocando(false); setPos(0); });
    audioRef.current = a;
    return a;
  };
  const toggle = async () => {
    if (tocando) { audioRef.current?.pause(); setTocando(false); return; }
    let a = audioRef.current;
    if (!a) {
      if (demo || !anexoPath) return;                    // demo: sem áudio real
      setCarregando(true);
      try { a = montarAudio(await urlAssinadaMidiaWa(anexoPath)); }   // signed-URL SÓ agora
      catch { setCarregando(false); return; }
      setCarregando(false);
    }
    a.playbackRate = rate;
    a.play().catch(() => setTocando(false));
    setTocando(true);
  };
  const prog = durS > 0 ? pos / durS : 0;
  return (
    <div className="audio2">
      <button type="button" className="play" title={demo ? 'Áudio de demonstração' : carregando ? 'Carregando…' : tocando ? 'Pausar' : 'Reproduzir'} onClick={toggle} disabled={demo || carregando}>
        {tocando ? <svg viewBox="0 0 24 24" fill="currentColor" width="10" height="10" aria-hidden><path d="M7 5h3v14H7zM14 5h3v14h-3z" /></svg> : <IcPlay />}
      </button>
      <div className="onda" onClick={(e) => {
        if (!audioRef.current || durS <= 0) return;
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const p = (e.clientX - r.left) / r.width;
        audioRef.current.currentTime = p * durS;
        setPos(p * durS);
      }}>
        {ONDA.map((h, i) => <i key={i} className={i / ONDA.length <= prog && prog > 0 ? 'done' : ''} style={{ height: h }} />)}
      </div>
      <span className="dur num">{tocando || pos > 0 ? mmss(pos) + ' / ' : ''}{mmss(durS) || '·'}</span>
      <button type="button" className="rate num" title="Velocidade" onClick={() => {
        const nx = rate === 1 ? 1.5 : rate === 1.5 ? 2 : 1;
        setRate(nx);
        if (audioRef.current) audioRef.current.playbackRate = nx;
      }}>{rate}x</button>
      {acaoNode}
    </div>
  );
}

/* ================================================================
   Contexto: bloco Funil/Kanban — "Abrir no Kanban" via deep-link
   /v2/kanban?oportunidade= (KanbanContatoBox v1 recriado; hooks reais
   reusados; ficha judicial reusada inteira no real).
   ================================================================ */
function KanbanCtx({ contatoId, demo, etapa, etapaCor, origem, respNome, lead, aoAvisar }: {
  contatoId: string | null; demo: boolean; etapa?: string | null; etapaCor?: string | null;
  origem: string; respNome?: string; lead: WaContact; aoAvisar: (a: AvisoInbox) => void;
}) {
  const nav = useNavigate();
  const oppsQ = useOportunidadesDoContato(!demo ? contatoId : null);
  const funisQ = useFunisDaOrg();
  const [addAberto, setAddAberto] = useState(false);
  const [funilSel, setFunilSel] = useState('');
  const [addBusy, setAddBusy] = useState(false);
  if (!contatoId) return null;
  const aberta = demo
    ? (etapa ? { id: 'demo-opp', funilNome: 'Funil comercial', colunaNome: etapa, respNome: respNome ?? '', tipoServico: 'analise_inicial', tipoBeneficio: 'aposentadoria', valor: null } : null)
    : (oppsQ.data ?? []).find((o) => o.aberta) ?? null;
  return (
    <div className="ctx-b spot">
      <div className="ctx-t">Funil</div>
      {(!demo && oppsQ.isLoading) ? (
        <div className="ctx-nota">Carregando…</div>
      ) : aberta ? (
        <>
          <div className="cx-l"><span className="k">Etapa</span><span className="v" style={etapaCor ? { color: etapaCor } : undefined}>{aberta.colunaNome ?? etapa ?? '—'}</span></div>
          <div className="cx-l"><span className="k">Funil</span><span className="v">{aberta.funilNome ?? '—'}</span></div>
          <div className="cx-l"><span className="k">Responsável</span><span className="v">{aberta.respNome || 'Não atribuído'}</span></div>
          <div className="cx-l"><span className="k">Origem</span><span className="v">{origem}</span></div>
          <div style={{ marginTop: 7 }}>
            <BotaoMini onClick={() => nav(demo ? '/kanban' : `/kanban?oportunidade=${encodeURIComponent(aberta.id)}`)}>Abrir no Kanban</BotaoMini>
          </div>
          {demo ? (
            /* representação da ficha no demo — MESMAS classes fjb do componente real (aplica o override Platina) */
            <div className="fjb" style={{ marginTop: 12 }}>
              <div className="fjb-h">Ficha judicial</div>
              <div className="fjb-card">
                <span className="fjb-tag vazia">Nenhuma ficha</span>
                <div className="fjb-info">Importe a consulta do Promosys/iCred e gere a ficha judicial.</div>
                <div className="fjb-acts"><button type="button" className="fjb-btn" onClick={() => aoAvisar({ tom: 'ok', texto: 'Modo demonstração: a ficha real (importar, revisar, finalizar) abre no ambiente com backend.' })}>Criar ficha</button></div>
              </div>
            </div>
          ) : (
            <div style={{ marginTop: 10 }}>
              <FichaJudicialBox contatoId={contatoId} oportunidadeId={aberta.id} conversaId={lead.id} canalId={lead.canalId ?? null} contatoAtual={{ nome: lead.name, telefone: lead.phone, email: lead.email }} />
            </div>
          )}
        </>
      ) : (
        <>
          <div className="ctx-nota">Sem oportunidade aberta.</div>
          <div style={{ marginTop: 7 }}><BotaoMini onClick={() => { setFunilSel(funisQ.data?.find((f) => f.padrao)?.id ?? funisQ.data?.[0]?.id ?? ''); setAddAberto(true); }}>Adicionar ao Kanban</BotaoMini></div>
        </>
      )}
      <ModalV2
        aberto={addAberto}
        aoFechar={() => { if (!addBusy) setAddAberto(false); }}
        largura={420}
        titulo="Adicionar ao Kanban"
        rodape={
          <>
            <BotaoSec disabled={addBusy} onClick={() => setAddAberto(false)}>Cancelar</BotaoSec>
            <BotaoPrimario disabled={addBusy || (!demo && !funilSel)} onClick={async () => {
              if (demo) { aoAvisar({ tom: 'ok', texto: 'Adicionado ao Kanban' }); setAddAberto(false); return; }
              setAddBusy(true);
              try {
                await chamarGarantirEntrada({ contatoId, funilId: funilSel, origem: 'WhatsApp', conversaId: lead.id, canalId: lead.canalId ?? undefined });
                aoAvisar({ tom: 'ok', texto: 'Adicionado ao Kanban' });
                setAddAberto(false);
              } catch (e) { aoAvisar({ tom: 'erro', texto: (e as Error)?.message || 'Falha ao adicionar.' }); }
              finally { setAddBusy(false); }
            }}>{addBusy ? 'Adicionando…' : 'Adicionar'}</BotaoPrimario>
          </>
        }
      >
        <p style={{ fontSize: 12.5, color: 'var(--txt-2)', lineHeight: 1.55 }}>
          O contato entrará na <b>coluna de entrada</b> do funil, com origem <b>WhatsApp</b>, herdando conversa, canal e atendente.
        </p>
        {(funisQ.data ?? []).length === 0 && !demo ? (
          <div className="kb-err" role="alert" style={{ marginTop: 10 }}>Nenhum funil disponível.</div>
        ) : (funisQ.data ?? []).length > 1 && (
          <div className="campo" style={{ marginTop: 10 }}>
            <label>Funil</label>
            <select className="inp" value={funilSel} onChange={(e) => setFunilSel(e.target.value)}>
              {(funisQ.data ?? []).map((f) => <option key={f.id} value={f.id}>{f.nome}{f.padrao ? ' (padrão)' : ''}</option>)}
            </select>
          </div>
        )}
      </ModalV2>
    </div>
  );
}

/* ================================================================ */
function NovaConversaModal({ canais, demo, aoFechar, aoIniciar }: {
  canais: { id: string; alias: string; numero: string | null }[]; demo: boolean;
  aoFechar: () => void; aoIniciar: (canalId: string, tel: string, nome: string) => Promise<boolean>;
}) {
  const [canalId, setCanalId] = useState(canais[0]?.id ?? '');
  const [tel, setTel] = useState('');
  const [nome, setNome] = useState('');
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const iniciar = async () => {
    setErro(null);
    if (!demo) {
      if (!canalId) { setErro('Selecione um WhatsApp conectado.'); return; }
      if (!normalizeWaPhone(tel)) { setErro('Informe um telefone válido.'); return; }
    }
    setBusy(true);
    try { await aoIniciar(canalId, tel, nome); }
    catch (e) { setErro((e as Error)?.message || 'Falha ao iniciar.'); }
    finally { setBusy(false); }
  };
  return (
    <ModalV2
      aberto aoFechar={() => { if (!busy) aoFechar(); }} largura={420} titulo="Nova conversa"
      rodape={
        <>
          <BotaoSec disabled={busy} onClick={aoFechar}>Cancelar</BotaoSec>
          <BotaoPrimario disabled={busy || (!demo && canais.length === 0)} onClick={iniciar}>{busy ? 'Iniciando…' : 'Iniciar conversa'}</BotaoPrimario>
        </>
      }
    >
      {erro && <div className="aviso-inline erro" role="alert" style={{ marginBottom: 10 }}>{erro}</div>}
      <div className="form-grid">
        <div className="campo">
          <label>WhatsApp</label>
          {canais.length === 0 && !demo ? (
            <div className="ctx-nota">Nenhum WhatsApp conectado.</div>
          ) : (
            <select className="inp" value={canalId} onChange={(e) => setCanalId(e.target.value)}>
              {(demo ? [{ id: 'demo', alias: 'Chip 1', numero: '5551999990000' }] : canais).map((c) => (
                <option key={c.id} value={c.id}>{c.alias}{c.numero ? ' · ' + mascararNumero(c.numero) : ''}</option>
              ))}
            </select>
          )}
        </div>
        <div className="campo"><label>Telefone</label><input className="inp" placeholder="(11) 99999-8888" inputMode="tel" value={tel} onChange={(e) => setTel(e.target.value)} /></div>
        <div className="campo"><label>Nome (opcional)</label><input className="inp" placeholder="Nome do contato" value={nome} onChange={(e) => setNome(e.target.value)} /></div>
      </div>
    </ModalV2>
  );
}

function TransferirModal({ usuarios, atualId, atualNome, meuId, busy, aoFechar, aoTransferir }: {
  usuarios: { id: string; nome: string; papel?: string }[]; atualId: string | null; atualNome: string | null; meuId: string | null;
  busy: boolean; aoFechar: () => void; aoTransferir: (destinoId: string, motivo: string) => Promise<void>;
}) {
  const [busca, setBusca] = useState('');
  const [sel, setSel] = useState<string | null>(null);
  const [motivo, setMotivo] = useState('');
  const filtrados = usuarios.filter((u) => u.nome.toLowerCase().includes(busca.trim().toLowerCase()));
  return (
    <ModalV2
      aberto aoFechar={() => { if (!busy) aoFechar(); }} largura={460} titulo="Transferir atendimento"
      rodape={
        <>
          <BotaoSec disabled={busy} onClick={aoFechar}>Cancelar</BotaoSec>
          <BotaoPrimario disabled={busy || !sel || !motivo.trim() || sel === atualId} onClick={() => sel && aoTransferir(sel, motivo)}>
            {busy ? 'Transferindo…' : 'Transferir'}
          </BotaoPrimario>
        </>
      }
    >
      <p style={{ fontSize: 12, color: 'var(--txt-2)', marginBottom: 10 }}>Responsável atual: <b style={{ color: 'var(--txt)' }}>{atualNome ?? 'Sem responsável'}</b></p>
      <div className="campo" style={{ marginBottom: 8 }}>
        <input className="inp" placeholder="Buscar atendente…" autoFocus value={busca} onChange={(e) => setBusca(e.target.value)} />
      </div>
      <div style={{ maxHeight: 180, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 10 }}>
        {filtrados.length === 0 && <div className="ctx-nota">Nenhum atendente encontrado.</div>}
        {filtrados.map((u) => (
          <button
            key={u.id} type="button" disabled={u.id === atualId}
            style={{ display: 'flex', gap: 8, alignItems: 'center', textAlign: 'left', background: sel === u.id ? 'rgba(var(--tint),.08)' : 'none', border: '1px solid ' + (sel === u.id ? 'rgba(var(--tint),.25)' : 'transparent'), borderRadius: 8, padding: '6px 9px', color: 'var(--txt)', fontFamily: 'var(--fonte)', fontSize: 12.5, cursor: u.id === atualId ? 'default' : 'pointer', opacity: u.id === atualId ? .55 : 1 }}
            onClick={() => setSel(u.id)}
          >
            {u.nome}{u.id === meuId ? ' (você)' : ''}{u.id === atualId ? ' · atual' : ''}
            {u.papel && <span style={{ marginLeft: 'auto', fontSize: 10.5, color: 'var(--txt-3)' }}>{u.papel === 'gestor' ? 'Supervisor' : u.papel}</span>}
          </button>
        ))}
      </div>
      <div className="campo">
        <label>Motivo da transferência *</label>
        <input className="inp" maxLength={280} placeholder="Ex.: atendimento presencial, especialista, ausência…" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
      </div>
    </ModalV2>
  );
}

function VincularModal({ telInicial, conversaId, canalId, demo, aoFechar, aoVinculado }: {
  telInicial: string; conversaId: string; canalId: string; demo: boolean;
  aoFechar: () => void; aoVinculado: () => Promise<void>;
}) {
  const [tel, setTel] = useState(telInicial ?? '');
  const [validado, setValidado] = useState<{ numero: string; mascarado: string; jid: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const validar = async () => {
    setErro(null);
    if (demo) { setErro('Disponível com o backend configurado.'); return; }
    setBusy(true);
    try {
      const r = await waValidarNumero(conversaId, canalId, tel);
      if (!r.exists) { setErro('Este número não tem WhatsApp ativo.'); return; }
      setValidado({ numero: r.numero, mascarado: r.numero_mascarado, jid: r.jid });
    } catch (e) { setErro((e as Error)?.message || 'Falha ao validar.'); }
    finally { setBusy(false); }
  };
  const vincular = async () => {
    if (!validado) return;
    setBusy(true);
    try { await waVincularNumero(conversaId, canalId, validado.numero, validado.jid); await aoVinculado(); }
    catch (e) { setErro((e as Error)?.message || 'Falha ao vincular.'); }
    finally { setBusy(false); }
  };
  return (
    <ModalV2
      aberto aoFechar={() => { if (!busy) aoFechar(); }} largura={440} titulo="Vincular número para responder"
      rodape={
        <>
          <BotaoSec disabled={busy} onClick={aoFechar}>Cancelar</BotaoSec>
          {validado
            ? <BotaoPrimario disabled={busy} onClick={vincular}>{busy ? 'Vinculando…' : 'Confirmar e vincular'}</BotaoPrimario>
            : <BotaoPrimario disabled={busy || !tel.trim()} onClick={validar}>{busy ? 'Validando…' : 'Validar no WhatsApp'}</BotaoPrimario>}
        </>
      }
    >
      <p style={{ fontSize: 12, color: 'var(--txt-2)', lineHeight: 1.55, marginBottom: 10 }}>
        Esta conversa chegou por uma identidade protegida (LID), sem número para resposta. Informe o número real do
        cliente — validamos no WhatsApp antes de salvar. O LID é preservado e nada é inventado.
      </p>
      {erro && <div className="aviso-inline erro" role="alert" style={{ marginBottom: 10 }}>{erro}</div>}
      <div className="campo">
        <label>Telefone (DDI + DDD)</label>
        <input className="inp" placeholder="55 11 99999-8888" value={tel} disabled={!!validado} onChange={(e) => setTel(e.target.value)} />
      </div>
      {!validado && telInicial && (
        <p style={{ fontSize: 11, color: 'var(--txt-3)', marginTop: 6 }}>Número cadastrado (não confirmado) — valide no WhatsApp para usar, ou informe outro.</p>
      )}
      {validado && (
        <p style={{ fontSize: 12, color: 'var(--verde)', marginTop: 8 }}>
          ✓ Número com WhatsApp ativo: <b>{validado.mascarado}</b>. Confirme para vincular a este contato.{' '}
          <button type="button" className="kb-link" onClick={() => setValidado(null)}>Corrigir número</button>
        </p>
      )}
    </ModalV2>
  );
}
