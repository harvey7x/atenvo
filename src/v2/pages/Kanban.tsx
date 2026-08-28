import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CLASSE_RAIZ_PORTAL, criarRaizPortalV2 } from '../components/portal';
import { useOrg } from '@/context/OrgContext';
import {
  KANBAN_REAL, useKanban, useOportunidadesAbertasDeContatos, useConversasDoContato,
  useNaoLidasPorContato, useOportunidadeEventos,
  classificarMovimento, traduzErroKanban, valorRelevante,
  MOTIVOS_PERDA, rotuloMotivoPerda, rotuloDe,
  TIPO_BENEFICIO_OPCOES as TIPO_BENEFICIO, TIPO_SERVICO_OPCOES as TIPO_SERVICO,
  STATUS_CANCEL_OPCOES as ST_CANCEL, STATUS_RESS_OPCOES as ST_RESS,
  type KLead, type KColuna, type ColResultado, type MovimentoTipo, type OppAberta, type OppEvento,
} from '@/data/kanban';
import { useBuscaContatos, type ContatoRow } from '@/data/contatos';
import { useEtiquetas, useOrgUsuarios } from '@/data/atendimento';
import { useFichasStatusDeOportunidades, fichaDemoDaOportunidade, type FichaBoardResumo } from '@/data/fichaJudicial';
import { useSlaAlertas } from '@/data/sla';
import { indexPorChave, type SlaAlerta, type SlaTipo } from '@/data/slaView';
import { corDaEtiqueta, type Etiqueta } from '@/types/atendimento';
import { initials } from '@/lib/avatar';
import { FichaJudicialBox } from '@/components/FichaJudicialBox';
import { RelacionamentoContatoBox } from '@/components/RelacionamentoContatoBox';
import { useBloqueiosOrg } from '../hooks/bloqueiosOrg';
import { BotaoPrimario, BotaoSec, CardVidro, DrawerV2, EstadoErro, ModalV2, Skeleton } from '../components';
import './kanban.css';

/* ------------------------------------------------------------------
   Kanban v2 — funil comercial (anatomia pg-kanban do mockup; verdade
   funcional de src/pages/Kanban.tsx). Drag & drop HTML5 nativo como
   na v1 — só a pele muda (tilt .kc.drag no card de origem + .fantasma
   na coluna sob o cursor). Toda mutação passa por wrappers demo/real:
   no demo (:5176) opera um seed em memória; no real usa useKanban.
   Estagnação "parado Xd" é derivada CLIENT-SIDE de movimentadoEm
   (última troca de coluna) com limiar declarado de 7 dias — não
   depende do motor SLA. Opt-out (relacionamento_bloqueio) vira badge
   no card, precedente de Contatos.
   ------------------------------------------------------------------ */

/* ---------- constantes/helpers (verbatim da v1) ---------- */
const PALETTE = ['#3b82f6', '#19C37D', '#f59e0b', '#8b5cf6', '#0891b2', '#e11d48', '#7c3aed', '#0e9d63', '#d97706', '#64748b'];
const fmtBRL = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
function haDe(iso: string | null | undefined): string {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '';
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'agora';
  if (m < 60) return `há ${m} min`;
  if (m < 1440) return `há ${Math.floor(m / 60)} h`;
  return `há ${Math.floor(m / 1440)} d`;
}
const fmtData = (d: string | null) => (d ? d.split('-').reverse().join('/') : '');
function fmtDataHora(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
const canalLabel = (t: string | null) => (t === 'whatsapp' ? 'WhatsApp' : t === 'facebook' ? 'Facebook' : t || 'Canal');
/** Polish 2026-08 — nome ALL CAPS do banco vira Title Case SÓ no render (dado intacto). */
const MINUSCULAS_NOME = new Set(['da', 'de', 'do', 'das', 'dos', 'e']);
function nomeExibicao(nome: string): string {
  const t = nome.trim();
  if (!t || t !== t.toLocaleUpperCase('pt-BR') || !/[A-ZÀ-Ü]/.test(t)) return nome;
  return t.toLocaleLowerCase('pt-BR').split(/\s+/).map((p, i) =>
    (i > 0 && MINUSCULAS_NOME.has(p)) ? p : p.charAt(0).toLocaleUpperCase('pt-BR') + p.slice(1)
  ).join(' ');
}
/** Lead sem nome (título só dígitos) → telefone legível como título + sufixo "· sem nome". */
function tituloTelefone(nome: string): string | null {
  const d = nome.replace(/[\s()+.-]/g, '');
  if (!/^\d{8,15}$/.test(d)) return null;
  const n = d.length >= 12 && d.startsWith('55') ? d.slice(2) : d;
  if (n.length === 11) return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`;
  if (n.length === 10) return `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`;
  return nome;
}
const maskNum = (n: string | null) => {
  const d = (n ?? '').replace(/\D/g, '');
  return d.length > 4 ? '•••• ' + d.slice(-4) : d;
};
const defaultsStatus = (serv: string) =>
  serv === 'cancelamento' ? { c: 'nao_iniciado', r: 'nao_se_aplica' }
  : serv === 'ressarcimento' ? { c: 'nao_se_aplica', r: 'nao_iniciado' }
  : serv === 'cancelamento_ressarcimento' ? { c: 'nao_iniciado', r: 'nao_iniciado' }
  : { c: 'nao_se_aplica', r: 'nao_se_aplica' };
const mostraCancel = (s: string) => s === 'cancelamento' || s === 'cancelamento_ressarcimento';
const mostraRess = (s: string) => s === 'ressarcimento' || s === 'cancelamento_ressarcimento';
function parseBRL(s: string): { ok: boolean; v: number | null } {
  const t = s.trim();
  if (!t) return { ok: true, v: null };
  const n = Number(t.replace(/\./g, '').replace(',', '.'));
  if (Number.isNaN(n) || n < 0) return { ok: false, v: null };
  return { ok: true, v: n };
}
const brlInput = (n: number | null) => (n == null ? '' : String(n).replace('.', ','));
/** Estagnação NÃO vira chip de SLA no card (v1): "Parado há X d" e "2 dias estourado" mediam a mesma coisa. */
const SLA_OCULTO_NO_CARD = new Set<SlaTipo>(['parado_ha_muito_tempo', 'prazo_2_dias_estourado', 'prazo_2_dias_em_risco']);

/** LIMIAR DECLARADO da estagnação visual (trilho rubro + "parado Xd"):
    7 dias sem trocar de coluna (movimentadoEm), só em lead aberto em coluna neutra. */
const LIMIAR_PARADO_DIAS = 7;
const diasParado = (l: KLead) => {
  const base = l.movimentadoEm || l.entradaEm || l.criadoEm;
  if (!base) return 0;
  const d = Math.floor((Date.now() - new Date(base).getTime()) / 86_400_000);
  return Number.isFinite(d) && d > 0 ? d : 0;
};

/* Sem cobranças no board (decisão 2026-08): nenhuma soma R$ no kanban —
   valores do caso continuam existindo no modal/drawer, mas o funil é gestão
   de atendimento, não de receita. */

/* ---------- v3: recência p/ o cabeçalho (recentes/fechados) — client-side, só apresentação ----------
   UMA janela só de estagnação em toda a tela: >7d (LIMIAR_PARADO_DIAS, decisão do dono). */
const diasDesde = (iso: string | null | undefined) => {
  if (!iso) return 999999;
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return Number.isFinite(d) && d > 0 ? d : 0;
};
/** Limiar do lead REALMENTE crítico (trilho/badge rubro): com 51% do funil parado +7d,
    só +30d (ou SLA vermelho) merece o alarme forte — senão o vermelho vira ruído. */
const LIMIAR_CRITICO_DIAS = 30;
type SortModo = 'urgencia' | 'recencia' | 'lembrete';
const ROTULO_SORT: Record<SortModo, string> = { urgencia: 'Urgência', recencia: 'Recentes', lembrete: 'Lembretes' };

interface LeadForm {
  colunaId: string; contatoId: string; conversaOrigemId: string; canalOrigemId: string;
  canalTipo: string; canalNome: string; canalNumero: string;
  nome: string; telefone: string; email: string; respId: string; origem: string;
  tipoBeneficio: string; tipoServico: string; statusCancelamento: string; statusRessarcimento: string;
  numeroBeneficio: string; instituicao: string; tipoDesconto: string; dataInicioDesconto: string;
  valorDescontoMensal: string; valorRessarcimentoEstimado: string; valorRessarcido: string; valorEstimado: string;
  etiquetas: string[]; observacoes: string; lembrete: string;
}
const FORM0: LeadForm = {
  colunaId: '', contatoId: '', conversaOrigemId: '', canalOrigemId: '', canalTipo: '', canalNome: '', canalNumero: '',
  nome: '', telefone: '', email: '', respId: '', origem: 'Manual',
  tipoBeneficio: '', tipoServico: 'analise_inicial', statusCancelamento: 'nao_se_aplica', statusRessarcimento: 'nao_se_aplica',
  numeroBeneficio: '', instituicao: '', tipoDesconto: '', dataInicioDesconto: '',
  valorDescontoMensal: '', valorRessarcimentoEstimado: '', valorRessarcido: '', valorEstimado: '',
  etiquetas: [], observacoes: '', lembrete: '',
};

const Ic = ({ children }: { children: ReactNode }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{children}</svg>
);
const IcBusca = () => <Ic><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></Ic>;
const IcMais = () => <Ic><path d="M12 5v14M5 12h14" /></Ic>;
const IcPontos = () => <Ic><circle cx="12" cy="5" r="1.4" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" /><circle cx="12" cy="19" r="1.4" fill="currentColor" stroke="none" /></Ic>;
const IcKb = () => <Ic><rect x="3" y="4" width="5" height="16" rx="1.4" /><rect x="10" y="4" width="5" height="10" rx="1.4" /><rect x="17" y="4" width="5" height="13" rx="1.4" /></Ic>;
const IcColapsar = () => <Ic><path d="M13 5l-6 7 6 7M20 5l-6 7 6 7" /></Ic>; // « recolher coluna
const IcSino = () => <Ic><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></Ic>; // lembrete no card
const IcChat = () => <Ic><path d="M21 12a8 8 0 0 1-8 8H4l2.2-2.6A8 8 0 1 1 21 12z" /></Ic>; // atalho pro WhatsApp no card

type Aviso = { tom: 'ok' | 'erro'; texto: string } | null;

/* ---------- modo demonstração: seed + mutações em memória ---------- */
interface SeedKb {
  colunas: KColuna[];
  leads: KLead[];
  naoLidas: Record<string, number>;
  sla: SlaAlerta[];
  fichaStatus: Record<string, string>;
  /** DEMO dos bancos da ficha no card: banco do cliente (recebe) + bancos das REVs. */
  fichaBancos: Record<string, { banco: string | null; revs: string[] }>;
  eventos: Record<string, OppEvento[]>;
  bloqueados: Set<string>;
  contatos: ContatoRow[];
}
function leadDemo(n: Partial<KLead> & { id: string; nome: string; colunaId: string }): KLead {
  const agora = new Date().toISOString();
  return {
    contatoId: null, conversaOrigemId: null, canalOrigemId: null, telefone: '', email: '',
    respId: null, respNome: '', valor: null, origem: 'WhatsApp', etiquetas: [], observacoes: '', lembrete: null, ordem: 0,
    criadoEm: agora, atualizadoEm: agora, entradaEm: agora, movimentadoEm: agora, prioridade: null,
    status: 'em_andamento', fechadoEm: null, motivoPerda: null, respNoFechamentoId: null,
    tipoBeneficio: 'aposentadoria', tipoServico: 'analise_inicial', statusCancelamento: 'nao_se_aplica',
    statusRessarcimento: 'nao_se_aplica', numeroBeneficio: null, instituicao: null, tipoDesconto: null,
    dataInicioDesconto: null, valorDescontoMensal: null, valorRessarcimentoEstimado: null, valorRessarcido: null,
    canalTipo: 'whatsapp', canalNome: 'LUIZA', canalNumero: '5551981010001', contatoEtiquetas: [], ...n,
  };
}
function seedKb(): SeedKb {
  const h = 3_600_000;
  const agora = Date.now();
  const iso = (t: number) => new Date(t).toISOString();
  const colunas: KColuna[] = [
    { id: 'kc-1', nome: 'LEAD NOVO', cor: '#64748b', ordem: 0, entrada: true, resultado: 'neutro', encerra: false },
    { id: 'kc-2', nome: 'Em atendimento', cor: '#3b82f6', ordem: 1, entrada: false, resultado: 'neutro', encerra: false },
    { id: 'kc-3', nome: 'Documentação', cor: '#f59e0b', ordem: 2, entrada: false, resultado: 'neutro', encerra: false },
    { id: 'kc-4', nome: 'Qualificado', cor: '#8b5cf6', ordem: 3, entrada: false, resultado: 'neutro', encerra: false },
    { id: 'kc-5', nome: 'Fechado', cor: '#19C37D', ordem: 4, entrada: false, resultado: 'ganho', encerra: true },
    { id: 'kc-6', nome: 'Perdido', cor: '#e11d48', ordem: 5, entrada: false, resultado: 'perdido', encerra: true },
  ];
  const leads: KLead[] = [
    leadDemo({ id: 'kl-1', nome: 'Ivone F. Cardoso', colunaId: 'kc-1', contatoId: 'kct-1', conversaOrigemId: 'kcv-1', respNome: 'Juliana', respId: 'u-mock', valorDescontoMensal: 130, tipoServico: 'cancelamento', statusCancelamento: 'nao_iniciado', instituicao: 'Banco Pan', criadoEm: iso(agora - 22 * 24 * h), atualizadoEm: iso(agora - 20 * 24 * h), movimentadoEm: iso(agora - 20 * 24 * h), contatoEtiquetas: ['Idoso'], lembrete: 'Ligar após as 15h' }),
    leadDemo({ id: 'kl-2', nome: 'Sebastião R. Nunes', colunaId: 'kc-1', contatoId: 'kct-2', valor: 1300, criadoEm: iso(agora - 11 * 24 * h), atualizadoEm: iso(agora - 10 * 24 * h), movimentadoEm: iso(agora - 10 * 24 * h) }),
    leadDemo({ id: 'kl-3', nome: 'Maria Aparecida Souza', colunaId: 'kc-2', contatoId: 'kct-3', conversaOrigemId: 'kcv-3', respNome: 'Juliana', respId: 'u-mock', tipoServico: 'cancelamento_ressarcimento', statusCancelamento: 'em_analise', statusRessarcimento: 'em_analise', valorRessarcimentoEstimado: 4800, instituicao: 'BMG', numeroBeneficio: '123.456.789-0', etiquetas: ['Urgente'], atualizadoEm: iso(agora - 12 * 60_000), movimentadoEm: iso(agora - 12 * 60_000), prioridade: 'alta' }),
    leadDemo({ id: 'kl-4', nome: 'Terezinha M. Alves', colunaId: 'kc-2', contatoId: 'kct-4', respNome: 'Matheus', canalNome: 'ANDRIUS', valor: 1300, atualizadoEm: iso(agora - 3 * h), movimentadoEm: iso(agora - 3 * h) }),
    leadDemo({ id: 'kl-5', nome: 'Antônio Pereira Lima', colunaId: 'kc-3', contatoId: 'kct-5', respNome: 'Juliana', respId: 'u-mock', tipoServico: 'ressarcimento', statusRessarcimento: 'solicitado', valorRessarcimentoEstimado: 6200, instituicao: 'Banco Pan', atualizadoEm: iso(agora - 24 * h), movimentadoEm: iso(agora - 24 * h) }),
    leadDemo({ id: 'kl-6', nome: 'José Carlos Ferreira', colunaId: 'kc-3', contatoId: 'kct-6', respNome: 'Matheus', valor: 1300, tipoBeneficio: 'pensao_por_morte', atualizadoEm: iso(agora - 9 * 24 * h), movimentadoEm: iso(agora - 9 * 24 * h) }),
    leadDemo({ id: 'kl-7', nome: 'Neusa B. Martins', colunaId: 'kc-4', contatoId: 'kct-7', respNome: 'Juliana', respId: 'u-mock', canalNome: 'ANDRIUS', valorDescontoMensal: 96.4, tipoServico: 'cancelamento', statusCancelamento: 'solicitado', tipoDesconto: 'mensalidade associativa', dataInicioDesconto: '2024-03-01', atualizadoEm: iso(agora - 2 * 24 * h), movimentadoEm: iso(agora - 2 * 24 * h) }),
    leadDemo({ id: 'kl-8', nome: 'Aparecida L. Rocha', colunaId: 'kc-5', contatoId: 'kct-8', respNome: 'Matheus', status: 'ganho', fechadoEm: iso(agora - 48 * h), valorRessarcimentoEstimado: 5100, tipoServico: 'ressarcimento', statusRessarcimento: 'pago', valorRessarcido: 5100, atualizadoEm: iso(agora - 48 * h), movimentadoEm: iso(agora - 48 * h) }),
    leadDemo({ id: 'kl-9', nome: 'Cleusa M. Barros', colunaId: 'kc-6', contatoId: 'kct-9', status: 'perdido', fechadoEm: iso(agora - 72 * h), motivoPerda: 'sem_interesse', valor: 1300, atualizadoEm: iso(agora - 72 * h), movimentadoEm: iso(agora - 72 * h) }),
  ];
  const evento = (n: Partial<OppEvento> & { id: string; evento: string }): OppEvento => ({
    colunaAnteriorId: null, colunaNovaId: null, motivoPerda: null, motivoReabertura: null,
    respNoFechamentoId: null, respNoFechamentoNome: '', executadoPor: null, executadoPorNome: '', criadoEm: iso(agora - 48 * h), ...n,
  });
  return {
    colunas,
    leads,
    naoLidas: { 'kct-3': 2, 'kct-1': 1 },
    sla: [
      { id: 'ks-1', tipo: 'lead_quente_aguardando', severidade: 'vermelho', titulo: 'Lead quente aguardando', detalhe: 'Cliente respondeu e aguarda há 40 min.', conversa_id: 'kcv-3', oportunidade_id: 'kl-3', contato_id: 'kct-3', responsavel_id: null, vence_em: null, criado_em: iso(agora - h) } as SlaAlerta,
      { id: 'ks-2', tipo: 'atendimento_sem_resposta', severidade: 'amarelo', titulo: 'Sem resposta', detalhe: 'Conversa sem resposta da equipe.', conversa_id: 'kcv-1', oportunidade_id: 'kl-1', contato_id: 'kct-1', responsavel_id: null, vence_em: null, criado_em: iso(agora - 2 * h) } as SlaAlerta,
    ],
    fichaStatus: { 'kl-5': 'finalizada', 'kl-3': 'rascunho' },
    fichaBancos: { 'kl-5': { banco: 'AGIBANK', revs: ['BANRISUL', 'BMG'] }, 'kl-3': { banco: 'MERCANTIL', revs: ['PAN'] } },
    eventos: {
      'kl-8': [evento({ id: 'ke-1', evento: 'ganho', colunaAnteriorId: 'kc-4', colunaNovaId: 'kc-5', respNoFechamentoNome: 'Matheus', executadoPorNome: 'Matheus', criadoEm: iso(agora - 48 * h) })],
      'kl-9': [evento({ id: 'ke-2', evento: 'perdido', colunaAnteriorId: 'kc-2', colunaNovaId: 'kc-6', motivoPerda: 'sem_interesse', executadoPorNome: 'Juliana', criadoEm: iso(agora - 72 * h) })],
    },
    bloqueados: new Set(['kct-9']),
    contatos: [
      { id: 'kct-10', nome: 'Devanir S. Prado', email: '', tel: '5551988330044', org: 'WhatsApp', resp: 'Juliana', st: 'ativo', ult: iso(agora - 30 * h), tags: [] },
      { id: 'kct-11', nome: 'Raimundo A. Silva', email: 'raimundo@email.com', tel: '5551988110022', org: '—', resp: '', st: 'ativo', ult: iso(agora - 60 * h), tags: ['Idoso'] },
      { id: 'kct-9', nome: 'Cleusa M. Barros', email: '', tel: '5551988990077', org: 'WhatsApp', resp: '', st: 'ativo', ult: iso(agora - 80 * h), tags: [] },
    ],
  };
}

/* ================================================================== */

export default function KanbanV2() {
  const { currentOrg } = useOrg();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const demo = !KANBAN_REAL;
  const [seed, setSeed] = useState<SeedKb>(seedKb);
  const demoSeq = useRef(0);

  const podeConfig = currentOrg.role === 'admin' || currentOrg.role === 'gestor';

  const k = useKanban();
  const naoLidasQ = useNaoLidasPorContato();
  const slaQ = useSlaAlertas();
  const etiquetasQ = useEtiquetas();
  const usuariosQ = useOrgUsuarios();
  const bloqueiosQ = useBloqueiosOrg();

  const [aviso, setAviso] = useState<Aviso>(null);
  const [search, setSearch] = useState('');
  const [menu, setMenu] = useState<{ kind: 'card' | 'col'; id: string; top: number; right: number } | null>(null);
  // raiz de portal (regra 10): o menu "⋮" monta no body, fora do overflow da coluna e do stacking
  // context do card (:hover cria transform) — senão fica clipado/atrás dos cards. Reusa 1 nó por sessão.
  const raizMenu = useMemo(() => {
    const sel = '.' + CLASSE_RAIZ_PORTAL.split(' ').join('.') + '[data-kb-menu]';
    let el = document.querySelector(sel) as HTMLElement | null;
    if (!el) { el = criarRaizPortalV2(document) as unknown as HTMLElement; el.setAttribute('data-kb-menu', '1'); }
    return el;
  }, []);
  // helper de posição: menu fixo, alinhado abaixo/à direita do botão "⋮"
  const posMenu = (btn: HTMLElement) => { const r = btn.getBoundingClientRect(); return { top: Math.round(r.bottom + 4), right: Math.round(window.innerWidth - r.right) }; };
  const [optim, setOptim] = useState<Record<string, string>>({});
  const [ordemOtim, setOrdemOtim] = useState<string[] | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [dragando, setDragando] = useState<string | null>(null);
  const dragId = useRef<string | null>(null);
  const dragColId = useRef<string | null>(null);
  const [colArrastando, setColArrastando] = useState<string | null>(null);
  const [hoverCol, setHoverCol] = useState<string | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const autoRaf = useRef(0);
  const ptr = useRef<{ x: number; y: number } | null>(null);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const [pend, setPend] = useState<{ lead: KLead; colDest: KColuna; tipo: MovimentoTipo } | null>(null);
  const [movBusy, setMovBusy] = useState(false);
  const [motPerda, setMotPerda] = useState('');
  const [motPerdaDesc, setMotPerdaDesc] = useState('');
  const [motReab, setMotReab] = useState('');
  const [movErr, setMovErr] = useState<string | null>(null);

  const [colModal, setColModal] = useState<{ id: string | null } | null>(null);
  const [colForm, setColForm] = useState({ nome: '', cor: PALETTE[0] });
  const [colErr, setColErr] = useState<string | null>(null);
  const [colBusy, setColBusy] = useState(false);
  const [delCol, setDelCol] = useState<KColuna | null>(null);
  const [delDest, setDelDest] = useState('');
  const [delBusy, setDelBusy] = useState(false);

  const [leadModal, setLeadModal] = useState<{ modo: 'novo' | 'editar'; lead?: KLead } | null>(null);
  const [lf, setLf] = useState<LeadForm>(FORM0);
  const [selContato, setSelContato] = useState<ContatoRow | null>(null);
  const [semVinculo, setSemVinculo] = useState(false);
  const [leadErr, setLeadErr] = useState<string | null>(null);
  const [leadBusy, setLeadBusy] = useState(false);

  const [detId, setDetId] = useState<string | null>(null);
  const [destaque, setDestaque] = useState<string | null>(null);
  const [filtroOrigem, setFiltroOrigem] = useState<string | null>(null); // v2.1: origem repetida vira filtro no topo
  // v3 — ordenação inteligente (persistida) + Foco (filtro opcional, NÃO ocupa espaço vertical) + recolher coluna.
  const [sortModo, setSortModo] = useState<SortModo>(() => { try { const s = sessionStorage.getItem('atenvo-kb-sort'); return s === 'lembrete' || s === 'recencia' ? s : 'urgencia'; } catch { return 'urgencia'; } });
  const [foco, setFoco] = useState(false); // some por padrão (Kanban é o protagonista) — liga sob demanda
  const [equipe, setEquipe] = useState(false); // painel "Carga por responsável" — opt-in, não ocupa espaço quando off
  const [filtroResp, setFiltroResp] = useState<string | null>(null); // filtra o board por atendente (chave = respId ou '__none__')
  // FILTRO COMPLETO do board (dono 27/08): benefício, banco da ficha, período de entrada.
  // Atendente e canal reusam filtroResp/filtroOrigem — o painel unifica tudo.
  const [filtroBenef, setFiltroBenef] = useState<Set<string>>(new Set());
  const [filtroBanco, setFiltroBanco] = useState<Set<string>>(new Set());
  const [filtroDataDe, setFiltroDataDe] = useState('');
  const [filtroDataAte, setFiltroDataAte] = useState('');
  const [painelFiltros, setPainelFiltros] = useState(false);
  const [colsRecolhidas, setColsRecolhidas] = useState<Record<string, boolean>>(() => { try { return JSON.parse(sessionStorage.getItem('atenvo-kb-cols') || '{}'); } catch { return {}; } });
  useEffect(() => { try { sessionStorage.setItem('atenvo-kb-sort', sortModo); } catch { /* privado */ } }, [sortModo]);
  useEffect(() => { try { sessionStorage.setItem('atenvo-kb-cols', JSON.stringify(colsRecolhidas)); } catch { /* privado */ } }, [colsRecolhidas]);
  const toggleCol = (colId: string) => setColsRecolhidas((m) => ({ ...m, [colId]: !m[colId] }));

  /* ---------- dados (demo | real) ---------- */
  const colunasBase = demo ? seed.colunas : k.colunas;
  const leads = demo ? seed.leads : k.leads;
  const colunas = useMemo(
    () => (ordemOtim ? ordemOtim.map((id) => colunasBase.find((c) => c.id === id)).filter(Boolean) as KColuna[] : colunasBase),
    [ordemOtim, colunasBase],
  );
  const naoLidasMap = demo ? seed.naoLidas : (naoLidasQ.data ?? {});
  const slaPorOpp = useMemo(
    () => indexPorChave(demo ? seed.sla : (slaQ.data?.itens ?? []), 'oportunidade_id'),
    [demo, seed.sla, slaQ.data],
  );
  const fichaStatusQ = useFichasStatusDeOportunidades(useMemo(() => leads.map((l) => l.id), [leads]));
  // resumo por lead (status + bancos da ficha); no demo, sintetiza dos seeds
  const fichaResumoMap: Record<string, FichaBoardResumo> = useMemo(() => (demo
    ? Object.fromEntries(Object.entries(seed.fichaStatus).map(([id, st]) => [id, {
        status: st as FichaBoardResumo['status'],
        bancoNome: seed.fichaBancos[id]?.banco ?? null,
        revBancos: seed.fichaBancos[id]?.revs ?? [],
        tipoBeneficio: null,
      }]))
    : (fichaStatusQ.data ?? {})), [demo, seed.fichaStatus, seed.fichaBancos, fichaStatusQ.data]);
  const bloqueados = demo ? seed.bloqueados : (bloqueiosQ.data ?? new Set<string>());
  const etiquetas = etiquetasQ.data ?? [];
  const usuarios = usuariosQ.data ?? [];

  const colunaDoLead = (l: KLead) => optim[l.id] ?? l.colunaId;
  const term = search.trim().toLowerCase();
  const termDig = term.replace(/\D/g, '');
  const matchBusca = (l: KLead) => {
    if (!term) return true;
    const hay = [
      l.nome, l.telefone, l.email, l.instituicao, l.numeroBeneficio,
      rotuloDe(TIPO_BENEFICIO, l.tipoBeneficio), rotuloDe(TIPO_SERVICO, l.tipoServico),
      l.respNome, l.canalNome, l.lembrete, ...l.etiquetas, ...l.contatoEtiquetas,
    ].filter(Boolean).join(' ').toLowerCase();
    if (hay.includes(term)) return true;
    return termDig.length >= 3 && (l.telefone ?? '').replace(/\D/g, '').includes(termDig);
  };
  const origemDe = (l: KLead) => l.canalNome || l.origem || 'Sem origem'; // v2.1: origem do card/filtro
  // v3 F2 — chave estável do responsável (id em prod; nome como reserva; '__none__' = sem dono).
  const respKeyDe = (l: KLead) => l.respId || (l.respNome ? 'n:' + l.respNome : '__none__');
  // dados dos filtros avançados: benefício (opp, fallback ficha), bancos (ficha) e dia de entrada
  const benefDoLead = (l: KLead) => l.tipoBeneficio ?? (fichaResumoMap[l.id]?.tipoBeneficio as KLead['tipoBeneficio'] | null) ?? null;
  const bancosDoLead = (l: KLead): string[] => { const f = fichaResumoMap[l.id]; return f ? ([f.bancoNome, ...f.revBancos].filter(Boolean) as string[]) : []; };
  const diaEntradaDe = (l: KLead) => (l.entradaEm || l.criadoEm || '').slice(0, 10);
  const passaAvancados = (l: KLead): boolean => {
    if (filtroBenef.size > 0) { const b = benefDoLead(l); if (!b || !filtroBenef.has(b)) return false; }
    if (filtroBanco.size > 0 && !bancosDoLead(l).some((b) => filtroBanco.has(b))) return false;
    const d = diaEntradaDe(l);
    if (filtroDataDe && (!d || d < filtroDataDe)) return false;
    if (filtroDataAte && (!d || d > filtroDataAte)) return false;
    return true;
  };
  const nFiltrosAtivos = (filtroBenef.size ? 1 : 0) + (filtroBanco.size ? 1 : 0) + ((filtroDataDe || filtroDataAte) ? 1 : 0) + (filtroResp ? 1 : 0) + (filtroOrigem ? 1 : 0);
  const leadsVisiveis = useMemo(() => leads.filter((l) => matchBusca(l) && (!filtroOrigem || origemDe(l) === filtroOrigem) && (!filtroResp || respKeyDe(l) === filtroResp) && passaAvancados(l)), [leads, term, termDig, filtroOrigem, filtroResp, filtroBenef, filtroBanco, filtroDataDe, filtroDataAte, fichaResumoMap]); // eslint-disable-line react-hooks/exhaustive-deps
  // severidade máxima de SLA por lead, uma vez por render (386 cards no real: o sort não pode realocar por comparação)
  const SEV_PESO: Record<string, number> = { imediato: 5, critico: 4, vermelho: 3, amarelo: 2, leve: 1 };
  const sevPorLead = useMemo(() => {
    const m = new Map<string, number>();
    for (const [id, alertas] of slaPorOpp) m.set(id, Math.max(0, ...alertas.map((a) => SEV_PESO[a.severidade] ?? 0)));
    return m;
  }, [slaPorOpp]); // eslint-disable-line react-hooks/exhaustive-deps
  const semResultado = term !== '' && leadsVisiveis.length === 0 && leads.length > 0;
  const vazioFunil = leads.length === 0 && colunas.length > 0;

  const abertos = useMemo(() => leads.filter((l) => l.status === 'em_andamento'), [leads]);
  // O PLACAR acompanha o filtro de origem (o recorte que o chip ao lado aplica): mesmo conjunto
  // ativo que o board mostra na faceta selecionada — sem filtro, é o funil inteiro.
  const abertosNoRecorte = useMemo(() => abertos.filter((l) => (!filtroOrigem || origemDe(l) === filtroOrigem) && passaAvancados(l)), [abertos, filtroOrigem, filtroBenef, filtroBanco, filtroDataDe, filtroDataAte, fichaResumoMap]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- v2.1: agregação client-side (só apresentação; zero query/métrica/mutação nova) ----------
     estaParado = MESMA regra do trilho rubro do card (LIMIAR_PARADO_DIAS sem trocar de coluna neutra). */
  const estaParado = (l: KLead) => l.status === 'em_andamento'
    && (colunas.find((c) => c.id === l.colunaId)?.resultado ?? 'neutro') === 'neutro'
    && diasParado(l) >= LIMIAR_PARADO_DIAS;
  const nParados = useMemo(() => abertosNoRecorte.filter(estaParado).length, [abertosNoRecorte, colunas]); // eslint-disable-line react-hooks/exhaustive-deps
  const nFichaPend = useMemo(() => abertosNoRecorte.filter((l) => fichaResumoMap[l.id]?.status === 'rascunho').length, [abertosNoRecorte, fichaResumoMap]);
  // origem/canal repetido em ~todos os cards é ruído → vira FILTRO no topo; no card só quando é exceção.
  // Conta 1 origem por LEAD ATIVO (em_andamento) — mesma base do "leads ativos", então os chips
  // SOMAM ~401 (decisão do dono). Antes contava sobre todos os status e somava ~524.
  const origens = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of abertos) m.set(origemDe(l), (m.get(origemDe(l)) ?? 0) + 1);
    return [...m.entries()].map(([nome, n]) => ({ nome, n })).sort((a, b) => b.n - a.n);
  }, [abertos]); // eslint-disable-line react-hooks/exhaustive-deps
  // v2.1 — ordem por URGÊNCIA (estagnação → SLA → prioridade → ordem manual). Base do sort "Urgência".
  const sortUrgencia = (a: KLead, b: KLead) => {
    const da = estaParado(a) ? diasParado(a) : 0;
    const db = estaParado(b) ? diasParado(b) : 0;
    if (da !== db) return db - da;
    const sa = sevPorLead.get(a.id) ?? 0;
    const sb = sevPorLead.get(b.id) ?? 0;
    if (sa !== sb) return sb - sa;
    const pa = a.prioridade === 'alta' ? 1 : 0;
    const pb = b.prioridade === 'alta' ? 1 : 0;
    if (pa !== pb) return pb - pa;
    return a.ordem - b.ordem;
  };
  // v3 — lentes de ordenação (o operador escolhe; padrão = urgência). Só apresentação.
  const cmpRecencia = (a: KLead, b: KLead) => new Date(b.atualizadoEm || b.criadoEm).getTime() - new Date(a.atualizadoEm || a.criadoEm).getTime();
  const cmpLembrete = (a: KLead, b: KLead) => ((b.lembrete ? 1 : 0) - (a.lembrete ? 1 : 0)) || sortUrgencia(a, b);
  const comparador = sortModo === 'lembrete' ? cmpLembrete : sortModo === 'recencia' ? cmpRecencia : sortUrgencia;
  // v3 — Foco: o lead que EXIGE ação agora (parado crítico +30d, SLA vermelho/lead quente, ou parado sem dono).
  const ehCritico = (l: KLead) => l.status === 'em_andamento' && (
    (estaParado(l) && diasParado(l) >= LIMIAR_CRITICO_DIAS)
    || (sevPorLead.get(l.id) ?? 0) >= 3
    || (slaPorOpp.get(l.id) ?? []).some((a) => a.tipo === 'lead_quente_aguardando')
    || (estaParado(l) && !l.respId)
  );

  /* ---------- v3: KPIs de etapa do funil (Reuniões/Contratos/Fechados) — client-side, zero query nova.
     Robustos a renomear: casam por palavra-chave; se não casar, caem nas colunas neutras mais próximas do fecho. */
  const ativosPorColuna = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of abertosNoRecorte) { const cid = colunaDoLead(l); if (cid) m.set(cid, (m.get(cid) ?? 0) + 1); }
    return m;
  }, [abertosNoRecorte]); // eslint-disable-line react-hooks/exhaustive-deps
  // v3 F3 — parados por coluna → a etapa que mais trava (mesmo limiar do selo "Gargalo": ≥5 e >40% da etapa).
  const paradosPorColuna = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of abertosNoRecorte) if (estaParado(l)) { const cid = colunaDoLead(l); if (cid) m.set(cid, (m.get(cid) ?? 0) + 1); }
    return m;
  }, [abertosNoRecorte, colunas]); // eslint-disable-line react-hooks/exhaustive-deps
  const gargaloTop = useMemo(() => {
    let best: { col: KColuna; n: number } | null = null;
    for (const [cid, n] of paradosPorColuna) {
      const total = ativosPorColuna.get(cid) ?? n;
      if (n >= 5 && n / total > 0.4 && (!best || n > best.n)) { const col = colunas.find((c) => c.id === cid); if (col) best = { col, n }; }
    }
    return best;
  }, [paradosPorColuna, ativosPorColuna, colunas]);
  const colGanho = useMemo(() => colunas.find((c) => c.resultado === 'ganho') ?? null, [colunas]);
  const nFechados = useMemo(() => (colGanho ? leads.filter((l) => l.status === 'ganho' && (!filtroOrigem || origemDe(l) === filtroOrigem)).length : 0), [leads, colGanho, filtroOrigem]); // eslint-disable-line react-hooks/exhaustive-deps
  // KPIs "na etapa" removidos (polish 2026-08): duplicavam o header das colunas
  // sem dizer QUAL etapa — leitura ambígua. A contagem por etapa vive no board.

  /* ---------- v3 F2: CARGA POR RESPONSÁVEL — quem está sobrecarregado num relance (client-side).
     ativos / parados / críticos por atendente; clicar filtra o board (filtroResp). */
  const cargaPorResp = useMemo(() => {
    const m = new Map<string, { key: string; nome: string; ativos: number; parados: number; criticos: number }>();
    for (const l of abertos) {
      const key = respKeyDe(l);
      const nome = l.respNome || 'Não atribuído';
      const e = m.get(key) ?? { key, nome, ativos: 0, parados: 0, criticos: 0 };
      e.ativos += 1;
      if (estaParado(l)) e.parados += 1;
      if (ehCritico(l)) e.criticos += 1;
      m.set(key, e);
    }
    // sem dono por último; o resto por carga (críticos, depois parados, depois ativos)
    return [...m.values()].sort((a, b) => {
      if ((a.key === '__none__') !== (b.key === '__none__')) return a.key === '__none__' ? 1 : -1;
      return b.criticos - a.criticos || b.parados - a.parados || b.ativos - a.ativos;
    });
  }, [abertos, colunas, sevPorLead, slaPorOpp]); // eslint-disable-line react-hooks/exhaustive-deps
  const cargaMax = useMemo(() => Math.max(1, ...cargaPorResp.map((c) => c.ativos)), [cargaPorResp]);

  // facetas do painel de filtros (contadas sobre os ATIVOS, mesmo recorte do board)
  const benefOpcoes = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of abertos) { const b = benefDoLead(l); if (b) m.set(b, (m.get(b) ?? 0) + 1); }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [abertos, fichaResumoMap]); // eslint-disable-line react-hooks/exhaustive-deps
  const bancoOpcoes = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of abertos) for (const b of bancosDoLead(l)) m.set(b, (m.get(b) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [abertos, fichaResumoMap]); // eslint-disable-line react-hooks/exhaustive-deps
  const limparFiltros = () => { setFiltroBenef(new Set()); setFiltroBanco(new Set()); setFiltroDataDe(''); setFiltroDataAte(''); setFiltroResp(null); setFiltroOrigem(null); };
  // distribuição por etapa (KPI "Funil"): barra empilhada nas cores das colunas — complementa o "N no funil"
  const etapasDist = useMemo(() => colunas
    .filter((c) => (c.resultado ?? 'neutro') === 'neutro')
    .map((c) => ({ id: c.id, nome: c.nome, cor: c.cor, n: ativosPorColuna.get(c.id) ?? 0 })), [colunas, ativosPorColuna]);
  const distTotal = Math.max(1, etapasDist.reduce((s, d) => s + d.n, 0));
  const distMaior = etapasDist.reduce<typeof etapasDist[number] | null>((mx, d) => (d.n > (mx?.n ?? 0) ? d : mx), null);

  /* EXPORTAÇÃO CSV (dono 27/08): baixa exatamente o RECORTE atual — busca + canal +
     atendente + filtros avançados, o mesmo conjunto que o board mostra. CSV com BOM e
     ';' abre direto no Excel pt-BR — sem lib nova. */
  const exportarCsv = () => {
    const colNome = (id: string | null) => colunas.find((c) => c.id === id)?.nome ?? '';
    const esc = (v: unknown) => { const s = String(v ?? ''); return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const cab = ['Nome', 'Telefone', 'Email', 'Coluna', 'Status', 'Benefício', 'Banco (recebe)', 'Bancos REV', 'Etiquetas', 'Responsável', 'Canal', 'Entrada no funil', 'Atualizado em', 'Lembrete', 'Instituição'];
    const linhas = leadsVisiveis.map((l) => {
      const f = fichaResumoMap[l.id];
      const b = benefDoLead(l);
      return [
        l.nome, l.telefone, l.email, colNome(colunaDoLead(l)), l.status,
        b ? rotuloDe(TIPO_BENEFICIO, b) : '',
        f?.bancoNome ?? '', (f?.revBancos ?? []).join(', '),
        [...new Set([...l.etiquetas, ...l.contatoEtiquetas])].join(', '),
        l.respNome || 'Não atribuído', l.canalNome || l.origem || '',
        diaEntradaDe(l), (l.atualizadoEm || '').slice(0, 10), l.lembrete ?? '', l.instituicao ?? '',
      ].map(esc).join(';');
    });
    const csv = '\uFEFF' + cab.join(';') + '\n' + linhas.join('\n'); // BOM: Excel reconhece UTF-8
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `kanban-leads-${new Date().toISOString().slice(0, 10)}.csv`; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 4000);
    setAviso({ tom: 'ok', texto: `${leadsVisiveis.length} lead(s) exportado(s) em CSV (recorte atual).` });
  };

  /* reconciliação do otimista (v1): entrada some quando o servidor confirma */
  useEffect(() => {
    setOptim((m) => {
      const novo: Record<string, string> = {};
      for (const [id, col] of Object.entries(m)) {
        const l = leads.find((x) => x.id === id);
        if (l && l.colunaId !== col) novo[id] = col;
      }
      return Object.keys(novo).length === Object.keys(m).length ? m : novo;
    });
  }, [leads]);
  useEffect(() => {
    if (!ordemOtim) return;
    const ids = colunasBase.map((c) => c.id);
    // servidor confirmou a ordem — ou o conjunto mudou (coluna criada/excluída em paralelo): a verdade do servidor vence
    if (ids.join(',') === ordemOtim.join(',') || ids.length !== ordemOtim.length || ids.some((id) => !ordemOtim.includes(id))) setOrdemOtim(null);
  }, [colunasBase, ordemOtim]);

  /* menu fecha em qualquer clique global (v1); o clique DENTRO do dropdown portado não fecha
     (ele bubbla nativamente até o document — o stopPropagation do React não o barra no portal). */
  useEffect(() => {
    if (!menu) return;
    const f = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest('.kb-menu')) setMenu(null); };
    document.addEventListener('click', f);
    return () => document.removeEventListener('click', f);
  }, [menu]);

  /* deep-link ?oportunidade= (v1 byte a byte) */
  useEffect(() => {
    const oid = params.get('oportunidade');
    if (!oid) return;
    const limpar = () => setParams((p) => { p.delete('oportunidade'); return p; }, { replace: true });
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(oid) && !(demo && oid.startsWith('kl-'))) {
      limpar();
      return;
    }
    const alvo = leads.find((l) => l.id === oid);
    if (!alvo) return; // ainda não carregado: tenta de novo quando k.leads chegar
    setDetId(oid);
    setDestaque(oid);
    // se a coluna do alvo estiver RECOLHIDA, expande antes de rolar — senão o card não monta
    // (sem ref) e o scroll/destaque viram no-op.
    const colAlvo = colunaDoLead(alvo);
    setColsRecolhidas((m) => (m[colAlvo] ? { ...m, [colAlvo]: false } : m));
    const t1 = window.setTimeout(() => cardRefs.current[oid]?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60);
    const t2 = window.setTimeout(() => setDestaque(null), 2600);
    limpar();
    return () => { window.clearTimeout(t1); window.clearTimeout(t2); };
  }, [params, leads]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- wrappers de mutação (demo em memória | real useKanban) ---------- */
  const tocar = (l: KLead): KLead => ({ ...l, atualizadoEm: new Date().toISOString() });
  const demoMover = (id: string, colunaId: string, extras?: { motivoPerda?: string | null; motivoReabertura?: string | null }) => {
    setSeed((s) => {
      const col = s.colunas.find((c) => c.id === colunaId);
      const agora = new Date().toISOString();
      return {
        ...s,
        leads: s.leads.map((l) => {
          if (l.id !== id) return l;
          const res = col?.resultado ?? 'neutro';
          const status = res === 'ganho' ? 'ganho' : res === 'perdido' ? 'perdido' : 'em_andamento';
          return {
            ...l, colunaId, movimentadoEm: agora, atualizadoEm: agora, status,
            fechadoEm: res === 'neutro' ? null : agora,
            motivoPerda: res === 'perdido' ? (extras?.motivoPerda ?? l.motivoPerda) : res === 'ganho' ? null : null,
          };
        }),
      };
    });
  };
  const moverOportunidade = async (p: { id: string; colunaId: string; atualizadoEmEsperado: string; motivoPerda?: string; motivoPerdaDesc?: string; motivoReabertura?: string }) => {
    if (demo) demoMover(p.id, p.colunaId, p);
    else await k.moverOportunidade(p);
    // se o destino estiver recolhido, expande p/ o card movido continuar visível após o drop
    setColsRecolhidas((m) => (m[p.colunaId] ? { ...m, [p.colunaId]: false } : m));
  };

  const abrirNovaColuna = () => { setColForm({ nome: '', cor: PALETTE[0] }); setColErr(null); setColModal({ id: null }); };
  const abrirEditarColuna = (c: KColuna) => { setColForm({ nome: c.nome, cor: c.cor }); setColErr(null); setColModal({ id: c.id }); };
  const salvarColuna = async () => {
    if (colBusy) return;
    if (!colForm.nome.trim()) { setColErr('Informe o nome da coluna.'); return; }
    setColBusy(true);
    setColErr(null);
    try {
      if (demo) {
        if (colModal?.id) setSeed((s) => ({ ...s, colunas: s.colunas.map((c) => (c.id === colModal.id ? { ...c, nome: colForm.nome.trim(), cor: colForm.cor } : c)) }));
        else {
          demoSeq.current += 1;
          setSeed((s) => ({ ...s, colunas: [...s.colunas, { id: `kcd-${demoSeq.current}`, nome: colForm.nome.trim(), cor: colForm.cor, ordem: s.colunas.length, entrada: false, resultado: 'neutro' as ColResultado, encerra: false }] }));
        }
      } else if (colModal?.id) await k.editarColuna({ id: colModal.id, nome: colForm.nome.trim(), cor: colForm.cor });
      else await k.criarColuna({ nome: colForm.nome.trim(), cor: colForm.cor });
      setAviso({ tom: 'ok', texto: colModal?.id ? 'Coluna atualizada' : 'Coluna criada' });
      setColModal(null);
    } catch (e) {
      setColErr('Não foi possível salvar: ' + ((e as Error)?.message ?? ''));
    } finally { setColBusy(false); }
  };
  const pedirExcluirColuna = (c: KColuna) => {
    if (c.entrada) { setAviso({ tom: 'erro', texto: 'A coluna de entrada não pode ser excluída.' }); return; }
    if (c.resultado !== 'neutro') { setAviso({ tom: 'erro', texto: 'Colunas de ganho/perdido são estruturais e não podem ser excluídas.' }); return; }
    if (colunas.length <= 1) { setAviso({ tom: 'erro', texto: 'O funil precisa de ao menos uma coluna ativa.' }); return; }
    setDelDest(colunas.find((x) => x.id !== c.id)?.id ?? '');
    setDelCol(c);
  };
  const confirmarExcluirColuna = async () => {
    if (!delCol || delBusy) return;
    const temLeads = leads.some((l) => colunaDoLead(l) === delCol.id);
    if (temLeads && !delDest) { setAviso({ tom: 'erro', texto: 'Escolha a coluna de destino dos leads.' }); return; }
    setDelBusy(true);
    try {
      if (demo) {
        setSeed((s) => ({
          ...s,
          colunas: s.colunas.filter((c) => c.id !== delCol.id),
          leads: s.leads.map((l) => (l.colunaId === delCol.id ? { ...tocar(l), colunaId: delDest } : l)),
        }));
      } else await k.excluirColuna(delCol.id, temLeads ? delDest : null);
      setAviso({ tom: 'ok', texto: 'Coluna excluída' });
      setDelCol(null);
    } catch (e) {
      setAviso({ tom: 'erro', texto: 'Falha ao excluir: ' + ((e as Error)?.message ?? '') });
    } finally { setDelBusy(false); }
  };

  /* ---------- drag & drop de CARDS (mecanismo v1; pele do mockup) ---------- */
  const pararAutoScroll = () => { cancelAnimationFrame(autoRaf.current); ptr.current = null; };
  useEffect(() => () => cancelAnimationFrame(autoRaf.current), []);
  const iniciarAutoScroll = () => {
    cancelAnimationFrame(autoRaf.current);
    const passo = () => {
      const el = boardRef.current;
      const p = ptr.current;
      if (!el || !p || !dragId.current) return;
      const r = el.getBoundingClientRect();
      const edge = 80, speed = 18;
      if (p.y >= r.top && p.y <= r.bottom) {
        if (p.x < r.left + edge) el.scrollLeft = Math.max(0, el.scrollLeft - speed);
        else if (p.x > r.right - edge) el.scrollLeft = Math.min(el.scrollWidth - el.clientWidth, el.scrollLeft + speed);
      }
      autoRaf.current = requestAnimationFrame(passo);
    };
    autoRaf.current = requestAnimationFrame(passo);
  };

  const mover = async (id: string, colId: string) => {
    const lead = leads.find((l) => l.id === id);
    if (!lead || colunaDoLead(lead) === colId) return;
    if (optim[id]) return; // card já em movimentação
    const colDest = colunas.find((c) => c.id === colId);
    if (!colDest) return;
    const resOrig: ColResultado = colunas.find((c) => c.id === colunaDoLead(lead))?.resultado ?? 'neutro';
    const tipo = classificarMovimento(resOrig, colDest.resultado);
    if (tipo !== 'neutro') {
      setMotPerda(''); setMotPerdaDesc(''); setMotReab(''); setMovErr(null);
      setPend({ lead, colDest, tipo });
      return;
    }
    setOptim((m) => ({ ...m, [id]: colId }));
    try {
      await moverOportunidade({ id, colunaId: colId, atualizadoEmEsperado: lead.atualizadoEm });
      setAviso({ tom: 'ok', texto: 'Lead movido' });
      if (demo) setOptim((m) => { const { [id]: _x, ...resto } = m; return resto; });
    } catch (e) {
      setOptim((m) => { const { [id]: _x, ...resto } = m; return resto; });
      setAviso({ tom: 'erro', texto: traduzErroKanban((e as Error)?.message ?? '') });
    }
  };

  const confirmarMov = async () => {
    if (!pend || movBusy) return;
    if (pend.tipo === 'perdido' && !motPerda) { setMovErr('Selecione o motivo da perda.'); return; }
    if (pend.tipo === 'perdido' && motPerda === 'outro' && !motPerdaDesc.trim()) { setMovErr('Descreva o motivo da perda.'); return; }
    if (pend.tipo === 'reabertura' && !motReab.trim()) { setMovErr('Informe o motivo da reabertura.'); return; }
    setMovBusy(true);
    const atual = leads.find((l) => l.id === pend.lead.id)?.atualizadoEm ?? pend.lead.atualizadoEm;
    setOptim((m) => ({ ...m, [pend.lead.id]: pend.colDest.id }));
    try {
      await moverOportunidade({
        id: pend.lead.id, colunaId: pend.colDest.id, atualizadoEmEsperado: atual,
        motivoPerda: pend.tipo === 'perdido' ? motPerda : undefined,
        motivoPerdaDesc: pend.tipo === 'perdido' && motPerda === 'outro' ? motPerdaDesc.trim() : undefined,
        motivoReabertura: pend.tipo === 'reabertura' ? motReab.trim() : undefined,
      });
      setAviso({
        tom: 'ok',
        texto: pend.tipo === 'ganho' ? 'Oportunidade fechada como ganho' : pend.tipo === 'perdido' ? 'Oportunidade marcada como perdida' : 'Oportunidade reaberta',
      });
      if (demo) setOptim((m) => { const { [pend.lead.id]: _x, ...resto } = m; return resto; });
      setPend(null);
    } catch (e) {
      setOptim((m) => { const { [pend.lead.id]: _x, ...resto } = m; return resto; });
      setMovErr(traduzErroKanban((e as Error)?.message ?? ''));
    } finally { setMovBusy(false); }
  };

  const soltarColuna = async (alvoId: string) => {
    const de = dragColId.current;
    dragColId.current = null;
    setColArrastando(null);
    setHoverCol(null);
    if (!de || de === alvoId) return;
    const base = (ordemOtim ?? colunasBase.map((c) => c.id));
    const deCol = colunasBase.find((c) => c.id === de);
    const alvoCol = colunasBase.find((c) => c.id === alvoId);
    if (deCol?.entrada || alvoCol?.entrada) {
      setAviso({ tom: 'erro', texto: 'A coluna de entrada fica sempre na primeira posição.' });
      return;
    }
    const nova = base.filter((id) => id !== de);
    const at = nova.indexOf(alvoId);
    if (at < 0) return;
    nova.splice(at, 0, de);
    setOrdemOtim(nova);
    try {
      if (demo) {
        setSeed((s) => ({ ...s, colunas: nova.map((id, i) => ({ ...s.colunas.find((c) => c.id === id)!, ordem: i })) }));
        setOrdemOtim(null);
      } else await k.reordenarColunas(nova);
      setAviso({ tom: 'ok', texto: 'Ordem das colunas atualizada' });
    } catch (e) {
      setOrdemOtim(null);
      setAviso({ tom: 'erro', texto: (e as Error)?.message || 'Não foi possível reordenar' });
    }
  };

  /* ---------- lead: novo/editar/arquivar ---------- */
  const abrirNovoLead = (colunaId?: string) => {
    setLf({ ...FORM0, colunaId: colunaId ?? colunas.find((c) => c.entrada)?.id ?? colunas[0]?.id ?? '' });
    setSelContato(null); setSemVinculo(false); setLeadErr(null);
    setLeadModal({ modo: 'novo' });
  };
  const abrirEditarLead = (l: KLead) => {
    setDetId(null);
    setLf({
      colunaId: colunaDoLead(l) ?? '', contatoId: l.contatoId ?? '', conversaOrigemId: l.conversaOrigemId ?? '',
      canalOrigemId: l.canalOrigemId ?? '', canalTipo: l.canalTipo ?? '', canalNome: l.canalNome ?? '', canalNumero: l.canalNumero ?? '',
      nome: l.nome, telefone: l.telefone, email: l.email, respId: l.respId ?? '', origem: l.origem,
      tipoBeneficio: l.tipoBeneficio ?? '', tipoServico: l.tipoServico, statusCancelamento: l.statusCancelamento,
      statusRessarcimento: l.statusRessarcimento, numeroBeneficio: l.numeroBeneficio ?? '', instituicao: l.instituicao ?? '',
      tipoDesconto: l.tipoDesconto ?? '', dataInicioDesconto: l.dataInicioDesconto ?? '',
      valorDescontoMensal: brlInput(l.valorDescontoMensal), valorRessarcimentoEstimado: brlInput(l.valorRessarcimentoEstimado),
      valorRessarcido: brlInput(l.valorRessarcido), valorEstimado: brlInput(l.valor),
      etiquetas: l.etiquetas, observacoes: l.observacoes, lembrete: l.lembrete ?? '',
    });
    setSelContato(null); setSemVinculo(false); setLeadErr(null);
    setLeadModal({ modo: 'editar', lead: l });
  };
  const arquivar = async (l: KLead) => {
    try {
      if (demo) setSeed((s) => ({ ...s, leads: s.leads.filter((x) => x.id !== l.id) }));
      else await k.arquivarLead(l.id);
      setAviso({ tom: 'ok', texto: 'Lead arquivado' });
    } catch (e) {
      setAviso({ tom: 'erro', texto: 'Falha ao arquivar: ' + ((e as Error)?.message ?? '') });
    }
  };

  const salvarLead = async () => {
    if (leadBusy) return;
    const editar = leadModal?.modo === 'editar';
    if (!editar && !selContato && !semVinculo) { setLeadErr('Selecione um contato ou escolha criar sem vínculo.'); return; }
    if (!lf.nome.trim()) { setLeadErr('Informe o nome do beneficiário.'); return; }
    if (!lf.tipoBeneficio) { setLeadErr('Selecione o tipo de benefício.'); return; }
    if (!lf.tipoServico) { setLeadErr('Selecione o serviço solicitado.'); return; }
    if (!lf.colunaId) { setLeadErr('Selecione a etapa.'); return; }
    const vals = [parseBRL(lf.valorDescontoMensal), parseBRL(lf.valorRessarcimentoEstimado), parseBRL(lf.valorRessarcido), parseBRL(lf.valorEstimado)];
    if (vals.some((v) => !v.ok)) { setLeadErr('Valores inválidos: use números sem sinal negativo.'); return; }
    setLeadBusy(true);
    setLeadErr(null);
    const comum = {
      nome: lf.nome.trim(), telefone: selContato?.tel || lf.telefone || null, responsavelId: lf.respId || null,
      origem: lf.origem || null, etiquetas: lf.etiquetas, conversaOrigemId: lf.conversaOrigemId || null, canalOrigemId: lf.canalOrigemId || null,
      tipoBeneficio: lf.tipoBeneficio, tipoServico: lf.tipoServico, statusCancelamento: lf.statusCancelamento,
      statusRessarcimento: lf.statusRessarcimento, numeroBeneficio: lf.numeroBeneficio.trim() || null,
      instituicao: lf.instituicao.trim() || null, tipoDesconto: lf.tipoDesconto.trim() || null,
      dataInicioDesconto: lf.dataInicioDesconto || null,
      valorDescontoMensal: vals[0].v, valorRessarcimentoEstimado: vals[1].v, valorRessarcido: vals[2].v, valor: vals[3].v,
      observacoes: lf.observacoes || null, lembrete: lf.lembrete.trim() || null,
    };
    try {
      if (!editar) {
        if (demo) {
          demoSeq.current += 1;
          setSeed((s) => ({
            ...s,
            leads: [...s.leads, leadDemo({
              id: `kld-${demoSeq.current}`, nome: comum.nome, colunaId: lf.colunaId, contatoId: selContato?.id ?? null,
              telefone: comum.telefone ?? '', email: lf.email, respId: lf.respId || null,
              respNome: usuarios.find((u) => u.id === lf.respId)?.nome ?? '', origem: lf.origem,
              etiquetas: lf.etiquetas, observacoes: lf.observacoes, lembrete: lf.lembrete.trim() || null, tipoBeneficio: lf.tipoBeneficio || null,
              tipoServico: lf.tipoServico, statusCancelamento: lf.statusCancelamento, statusRessarcimento: lf.statusRessarcimento,
              numeroBeneficio: comum.numeroBeneficio, instituicao: comum.instituicao, tipoDesconto: comum.tipoDesconto,
              dataInicioDesconto: comum.dataInicioDesconto, valorDescontoMensal: vals[0].v, valorRessarcimentoEstimado: vals[1].v,
              valorRessarcido: vals[2].v, valor: vals[3].v, canalTipo: lf.canalTipo || null, canalNome: lf.canalNome || null,
              canalNumero: lf.canalNumero || null, contatoEtiquetas: selContato?.tags ?? [],
              conversaOrigemId: lf.conversaOrigemId || null, canalOrigemId: lf.canalOrigemId || null,
            })],
          }));
        } else await k.criarLead({ colunaId: lf.colunaId, contatoId: selContato?.id ?? null, ...comum });
        setLeadModal(null);
        setAviso({ tom: 'ok', texto: 'Oportunidade criada' });
      } else {
        const el = leadModal!.lead!;
        const mudouEtapa = lf.colunaId && lf.colunaId !== colunaDoLead(el);
        const colDest = colunas.find((c) => c.id === lf.colunaId);
        const resOrig: ColResultado = colunas.find((c) => c.id === colunaDoLead(el))?.resultado ?? 'neutro';
        const tipo = colDest ? classificarMovimento(resOrig, colDest.resultado) : 'neutro';
        const aplicarDemo = (patch: Partial<KLead>, colunaId?: string) => setSeed((s) => ({
          ...s,
          leads: s.leads.map((x) => (x.id === el.id ? { ...tocar(x), ...patch, ...(colunaId ? { colunaId, movimentadoEm: new Date().toISOString() } : {}) } : x)),
        }));
        const patchDemo: Partial<KLead> = {
          nome: comum.nome, telefone: comum.telefone ?? '', respId: lf.respId || null,
          respNome: usuarios.find((u) => u.id === lf.respId)?.nome ?? '', origem: lf.origem, etiquetas: lf.etiquetas,
          observacoes: lf.observacoes, lembrete: lf.lembrete.trim() || null, tipoBeneficio: lf.tipoBeneficio || null, tipoServico: lf.tipoServico,
          statusCancelamento: lf.statusCancelamento, statusRessarcimento: lf.statusRessarcimento,
          numeroBeneficio: comum.numeroBeneficio, instituicao: comum.instituicao, tipoDesconto: comum.tipoDesconto,
          dataInicioDesconto: comum.dataInicioDesconto, valorDescontoMensal: vals[0].v,
          valorRessarcimentoEstimado: vals[1].v, valorRessarcido: vals[2].v, valor: vals[3].v,
        };
        if (mudouEtapa && tipo !== 'neutro' && colDest) {
          if (demo) aplicarDemo(patchDemo);
          else await k.editarLead({ id: el.id, ...comum });
          setLeadModal(null);
          setMotPerda(''); setMotPerdaDesc(''); setMotReab(''); setMovErr(null);
          setPend({ lead: el, colDest, tipo });
        } else {
          if (demo) aplicarDemo(patchDemo, lf.colunaId || undefined);
          else await k.editarLead({ id: el.id, colunaId: lf.colunaId, ...comum });
          setLeadModal(null);
          setAviso({ tom: 'ok', texto: 'Oportunidade atualizada' });
        }
      }
    } catch (e) {
      const msg = (e as Error)?.message ?? '';
      setLeadErr(/uq_oport_aberta|duplicate key|23505/i.test(msg) ? 'Este contato já possui uma oportunidade aberta neste funil.' : traduzErroKanban(msg));
    } finally { setLeadBusy(false); }
  };

  const detLead = detId ? leads.find((l) => l.id === detId) ?? null : null;

  /* ---------- estados de página (contrato item 7: skeleton em vidro + EstadoErro) ---------- */
  if (!demo && k.loading) {
    return (
      <div className="kb-pg">
        <div className="kb-skel" aria-busy aria-label="Carregando funil">
          {[0, 1, 2].map((i) => (
            <CardVidro key={i} className="kb-skel-col">
              <Skeleton largura="55%" />
              <Skeleton largura="100%" altura={64} raio={12} />
              <Skeleton largura="100%" altura={64} raio={12} />
            </CardVidro>
          ))}
        </div>
      </div>
    );
  }
  if (!demo && k.isError) {
    return (
      <div className="kb-pg">
        <div className="kb-estado">
          <EstadoErro descricao="Não foi possível carregar o Kanban." aoTentarDeNovo={() => k.refetch()} />
        </div>
      </div>
    );
  }
  if (colunas.length === 0) {
    return (
      <div className="kb-pg">
        <div className="kb-vazio-geral sobe">
          <IcKb />
          <div className="t">Seu funil está vazio</div>
          <div className="d">Crie a primeira coluna para começar a organizar seus leads.</div>
          {podeConfig
            ? <BotaoPrimario onClick={abrirNovaColuna}>＋ Criar primeira coluna</BotaoPrimario>
            : <div className="d" style={{ marginTop: 14 }}>Peça a um administrador para configurar o funil.</div>}
        </div>
      </div>
    );
  }

  return (
    <div className="kb-pg">
      <div className="ph sobe">
        <div>
          <h2>Kanban</h2>
          <p>Funil comercial · cada card = 1 oportunidade em andamento{demo ? ' · modo demonstração (nada é gravado)' : ''}</p>
        </div>
        <div className="acoes">
          <div className="kb-busca">
            <IcBusca />
            <input
              className="inp" aria-label="Buscar leads" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome, telefone, e-mail, benefício, serviço, instituição, responsável ou etiqueta..."
            />
          </div>
          {podeConfig && <BotaoSec onClick={abrirNovaColuna}>Nova coluna</BotaoSec>}
          <BotaoPrimario onClick={() => abrirNovoLead()}>＋ Novo lead</BotaoPrimario>
        </div>
      </div>

      {/* v3 — Painel de KPIs (saúde do funil) + barra de ordenação/Foco/origem. Só agregação client-side. */}
      {!vazioFunil && (
        <>
          <div className="kb-kpis sobe" role="group" aria-label="Indicadores do funil">
            <div className="kb-kpi" title="Oportunidades em andamento (1 card = 1 oportunidade). No Disparo o número é menor porque lá conta CONTATOS distintos com WhatsApp e conversa real.">
              <div className="lab">Leads ativos</div><div className="val num">{abertosNoRecorte.length}</div>
              <div className="meta">no funil</div>
            </div>
            {/* distribuição por ETAPA — a informação que faltava do lado do total (dono 27/08) */}
            {etapasDist.some((d) => d.n > 0) && (
              <div className="kb-kpi dist" title={'Distribuição por etapa: ' + etapasDist.map((d) => `${d.nome} ${d.n}`).join(' · ')}>
                <div className="lab">Distribuição</div>
                <div className="kb-dist" aria-hidden>
                  {etapasDist.filter((d) => d.n > 0).map((d) => (
                    <span key={d.id} style={{ width: `${(d.n / distTotal) * 100}%`, background: d.cor }} />
                  ))}
                </div>
                <div className="kb-dist-leg">
                  {etapasDist.filter((d) => d.n > 0).slice(0, 3).map((d) => (
                    <span key={d.id} className="li"><i style={{ background: d.cor }} />{d.nome} <b className="num">{d.n}</b></span>
                  ))}
                  {distMaior && etapasDist.filter((d) => d.n > 0).length > 3 && <span className="li mais">…</span>}
                </div>
              </div>
            )}
            <button type="button" className={'kb-kpi crit acao' + (foco ? ' on' : '')} aria-pressed={foco}
              title={gargaloTop ? `Etapa mais travada: ${gargaloTop.col.nome} (${gargaloTop.n} parados). Clique para focar só no que exige ação agora.` : 'Leads sem trocar de coluna há mais de 7 dias. Clique para focar só no que exige ação agora.'}
              onClick={() => setFoco((f) => !f)}>
              <div className="lab">Parados +{LIMIAR_PARADO_DIAS}d</div><div className="val num">{nParados}</div>
              <div className="meta">{abertosNoRecorte.length > 0 ? Math.round((nParados / abertosNoRecorte.length) * 100) + '%' : ''}{foco ? ' — focando' : gargaloTop ? ' · trava em ' + gargaloTop.col.nome : nParados > 0 ? ' — ver só estes' : ''}</div>
            </button>
            <div className="kb-kpi warn" title="Fichas judiciais em rascunho, ainda não finalizadas.">
              <div className="lab">Pendentes</div><div className="val num">{nFichaPend}</div>
              <div className="meta">ficha{nFichaPend === 1 ? '' : 's'} em rascunho</div>
            </div>
            {colGanho && (
              <div className="kb-kpi good" title={`Oportunidades fechadas como ganho${filtroOrigem ? ' · ' + filtroOrigem : ''}`}>
                <div className="lab">{colGanho.nome}</div><div className="val num">{nFechados}</div><div className="meta">ganhos</div>
              </div>
            )}
          </div>

          <div className="kb-barra sobe">
            <div className="kb-ord" role="group" aria-label="Ordenar os cards">
              <span className="kb-ord-l">Ordenar</span>
              {(['urgencia', 'recencia', 'lembrete'] as SortModo[]).map((m) => (
                <button key={m} type="button" className={'kb-fchip' + (sortModo === m ? ' on' : '')} aria-pressed={sortModo === m} onClick={() => setSortModo(m)}>{ROTULO_SORT[m]}</button>
              ))}
            </div>
            <button type="button" className={'kb-fchip foco' + (foco ? ' on' : '')} aria-pressed={foco}
              title="Mostra só os leads que exigem ação agora — sem esconder o board" onClick={() => setFoco((f) => !f)}>
              ◆ Foco{foco ? ' ativo' : ''}
            </button>
            {cargaPorResp.length > 1 && (
              <button type="button" className={'kb-fchip' + (equipe ? ' on' : '')} aria-pressed={equipe}
                title="Carga por responsável — quem está sobrecarregado" onClick={() => { if (equipe) setFiltroResp(null); setEquipe((e) => !e); }}>
                Equipe
              </button>
            )}
            {origens.length > 1 && (
              <div className="kb-filtro-origem" role="group" aria-label="Filtrar por canal de origem (leads ativos)">
                <button type="button" className={'kb-fchip' + (!filtroOrigem ? ' on' : '')} onClick={() => setFiltroOrigem(null)}>Todas</button>
                {origens.slice(0, 6).map((o) => (
                  <button key={o.nome} type="button" className={'kb-fchip' + (filtroOrigem === o.nome ? ' on' : '')} title={`${o.n} lead(s) ativo(s) · canal ${o.nome}`} onClick={() => setFiltroOrigem((f) => (f === o.nome ? null : o.nome))}>
                    {o.nome}<span className="c num">{o.n}</span>
                  </button>
                ))}
              </div>
            )}
            {/* FILTRO COMPLETO + EXPORTAÇÃO (dono 27/08) */}
            <button type="button" className={'kb-fchip' + (nFiltrosAtivos > 0 ? ' on' : '')} title="Filtros completos: benefício, banco, atendente, canal e período" onClick={() => setPainelFiltros(true)}>
              Filtros{nFiltrosAtivos > 0 && <span className="c num">{nFiltrosAtivos}</span>}
            </button>
            <button type="button" className="kb-fchip" title={`Baixar os ${leadsVisiveis.length} lead(s) do recorte atual em CSV (abre no Excel) — respeita busca e filtros`} onClick={exportarCsv}>
              ⇩ Exportar
            </button>
          </div>

          {/* v3 F2 — Carga por responsável (opt-in): quem está sobrecarregado; clicar filtra o board */}
          {equipe && cargaPorResp.length > 1 && (
            <div className="kb-carga sobe" role="group" aria-label="Carga por responsável">
              {filtroResp && <button type="button" className="kb-carga-todos" onClick={() => setFiltroResp(null)}>Ver todos</button>}
              {cargaPorResp.map((c) => (
                <button key={c.key} type="button"
                  className={'kb-carga-c' + (filtroResp === c.key ? ' on' : '') + (c.key === '__none__' ? ' semdono' : '')}
                  title={`${c.nome}: ${c.ativos} ativo(s), ${c.parados} parado(s), ${c.criticos} crítico(s) · clique para filtrar`}
                  onClick={() => setFiltroResp((f) => (f === c.key ? null : c.key))}>
                  <span className="kb-carga-av">{c.key === '__none__' ? '·' : initials(c.nome)}</span>
                  <span className="tx">
                    <span className="nm">{c.nome}</span>
                    <span className="mt">
                      <b className="num">{c.ativos}</b> ativos
                      {c.parados > 0 && <span className="par num"> · {c.parados} parados</span>}
                      {c.criticos > 0 && <span className="cri num"> · {c.criticos} crít.</span>}
                    </span>
                    <span className="bar"><i style={{ width: Math.round((c.ativos / cargaMax) * 100) + '%' }} /></span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {aviso && (
        <div className={aviso.tom === 'erro' ? 'aviso-inline erro' : 'aviso-inline'} role="status" style={{ flexShrink: 0 }}>
          {aviso.texto}
          <button type="button" onClick={() => setAviso(null)} aria-label="Fechar aviso">×</button>
        </div>
      )}

      {semResultado && <div className="kb-info sobe">Nenhum lead encontrado para “{search}”.</div>}
      {vazioFunil && !semResultado && (
        <div className="kb-vazio-geral kb-vazio-inline sobe">
          <div className="t">Nenhum lead no funil</div>
          <div className="d">Novos contatos dos canais conectados aparecerão automaticamente aqui.</div>
          <BotaoSec onClick={() => abrirNovoLead()}>＋ Adicionar lead</BotaoSec>
        </div>
      )}

      <div
        className="kb-scroll" ref={boardRef}
        onDragOver={(e) => { ptr.current = { x: e.clientX, y: e.clientY }; if (dragId.current) iniciarAutoScroll(); }}
      >
        <div className="kb-cols">
          {colunas.map((col, i) => {
            const desfecho = (col.resultado ?? 'neutro') !== 'neutro';
            const cardsCol = leadsVisiveis.filter((l) => colunaDoLead(l) === col.id && (!foco || ehCritico(l))).slice().sort(comparador);
            const todosCol = leads.filter((l) => colunaDoLead(l) === col.id);
            const atraso = `${0.08 + Math.min(i, 5) * 0.07}s`;
            // v3 — leituras do cabeçalho: neutras → parados(>7d) · recentes(<7d); desfecho → recência do fechamento.
            const nParadosCol = desfecho ? 0 : todosCol.filter((l) => l.status === 'em_andamento' && diasParado(l) >= LIMIAR_PARADO_DIAS).length;
            const nRecentesCol = desfecho
              ? todosCol.filter((l) => diasDesde(l.fechadoEm || l.atualizadoEm) <= 7).length
              : todosCol.filter((l) => l.status === 'em_andamento' && diasParado(l) < LIMIAR_PARADO_DIAS).length;
            // v3 — GARGALO: a etapa aponta o próprio congestionamento (muitos travados e boa fração do total).
            const gargalo = !desfecho && nParadosCol >= 5 && nParadosCol / Math.max(1, todosCol.length) > 0.4;
            // coluna RECOLHIDA: faixa fina (nome + contagem + cor); NÃO aceita drop de card (declarado).
            if (colsRecolhidas[col.id]) {
              return (
                <button key={col.id} type="button" className="kb-col recolhida sobe" style={{ animationDelay: atraso }}
                  title={`Expandir ${col.nome} · ${todosCol.length} lead(s)`} onClick={() => toggleCol(col.id)}>
                  <span className="pt2" style={{ background: col.cor }} />
                  <span className="kb-strip-n">{col.nome}</span>
                  <span className="kb-strip-q num">{todosCol.length}</span>
                </button>
              );
            }
            const renderCard = (l: KLead) => (
              <CardKc
                key={l.id} l={l} colunas={colunas} etiquetasCat={etiquetas}
                naoLidas={naoLidasMap[l.contatoId ?? ''] ?? 0}
                sla={(slaPorOpp.get(l.id) ?? []).filter((a) => !SLA_OCULTO_NO_CARD.has(a.tipo))}
                fichaInfo={fichaResumoMap[l.id]} optout={!!l.contatoId && bloqueados.has(l.contatoId)}
                aoAbrirConversa={() => { if (l.conversaOrigemId) nav((l.canalTipo === 'facebook' ? '/facebook' : '/whatsapp') + `?conversa=${encodeURIComponent(l.conversaOrigemId)}`); }}
                moving={optim[l.id] !== undefined} arrastando={dragando === l.id} destacado={destaque === l.id}
                menuAberto={menu?.kind === 'card' && menu.id === l.id}
                aoRef={(el) => { cardRefs.current[l.id] = el; }}
                aoClicar={() => setDetId(l.id)}
                aoMenu={(btn) => setMenu(menu?.kind === 'card' && menu.id === l.id ? null : { kind: 'card', id: l.id, ...posMenu(btn) })}
                aoDragStart={(e) => { if (optim[l.id]) { e.preventDefault(); return; } dragId.current = l.id; setDragando(l.id); try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', l.id); } catch { /* ok */ } }}
                aoDragEnd={() => { pararAutoScroll(); dragId.current = null; setDragando(null); setHover(null); }}
              />
            );
            return (
              <div
                key={col.id}
                className={'kb-col sobe' + (hoverCol === col.id ? ' col-drop' : '') + (colArrastando === col.id ? ' arrastando' : '') + (gargalo ? ' gargalo' : '')}
                style={{ animationDelay: atraso }}
                onDragOver={(e) => { if (dragColId.current && dragColId.current !== col.id) { e.preventDefault(); setHoverCol(col.id); } }}
                onDrop={(e) => { if (dragColId.current) { e.preventDefault(); e.stopPropagation(); soltarColuna(col.id); } }}
              >
                <div
                  className="kb-cab"
                  /* sublinhado na COR da coluna (anatomia da referência) — borda real de 2px */
                  style={{ borderBottom: `2px solid ${col.cor}73` }}
                  draggable={podeConfig && !col.entrada}
                  onDragStart={(e) => {
                    if (!podeConfig || col.entrada) { e.preventDefault(); return; }
                    dragColId.current = col.id;
                    setColArrastando(col.id);
                    try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', col.id); } catch { /* alguns navegadores */ }
                  }}
                  onDragEnd={() => { dragColId.current = null; setColArrastando(null); setHoverCol(null); }}
                >
                  <button type="button" className="kb-col-toggle" aria-label={'Recolher coluna ' + col.nome} title="Recolher coluna" onClick={(e) => { e.stopPropagation(); toggleCol(col.id); }}><IcColapsar /></button>
                  {/* v5: o dot saiu do cabeçalho expandido — a cor da coluna vive no sublinhado (na recolhida o dot fica) */}
                  <span className="n" title={col.nome}>{col.nome}</span>
                  {col.entrada && <span className="tag-entrada" title="Coluna de entrada — recebe novos leads dos canais">entrada</span>}
                  <span className="q num">{todosCol.length}</span>
                  {podeConfig && (
                    <span className="kb-menu-wrap">
                      <button type="button" className="mbtn" aria-label={'Ações da coluna ' + col.nome} onClick={(e) => { e.stopPropagation(); setMenu(menu?.kind === 'col' && menu.id === col.id ? null : { kind: 'col', id: col.id, ...posMenu(e.currentTarget) }); }}>
                        <IcPontos />
                      </button>
                    </span>
                  )}
                </div>
                {/* v3 — segunda linha do cabeçalho: parados · recentes (+ gargalo) numa leitura calma */}
                <div className="kb-subcab">
                  {desfecho
                    ? <span className="rec">{nRecentesCol} nos últimos 7 dias</span>
                    : (
                      <>
                        <span className={'par' + (nParadosCol > 0 ? '' : ' zero')}>{nParadosCol} parado{nParadosCol === 1 ? '' : 's'}</span>
                        <span className="rec">· {nRecentesCol} recente{nRecentesCol === 1 ? '' : 's'}</span>
                      </>
                    )}
                  {gargalo && <span className="glr" title={`${nParadosCol} leads travados +${LIMIAR_PARADO_DIAS}d nesta etapa — gargalo do funil`}>Gargalo · {nParadosCol}</span>}
                </div>
                <div
                  className="kb-corpo"
                  onDragOver={(e) => { if (dragColId.current) return; e.preventDefault(); setHover(col.id); }}
                  onDragLeave={() => setHover((hAtual) => (hAtual === col.id ? null : hAtual))}
                  onDrop={() => {
                    if (dragColId.current) return;
                    pararAutoScroll();
                    const id = dragId.current;
                    setHover(null);
                    dragId.current = null;
                    if (id) mover(id, col.id);
                  }}
                >
                  {cardsCol.map(renderCard)}
                  {hover === col.id && dragando && <div className="fantasma" aria-hidden />}
                  {cardsCol.length === 0 && hover !== col.id && <div className="kb-vazia">{foco ? 'Nada crítico aqui' : 'Sem leads'}</div>}
                  <button type="button" className="kb-add" onClick={() => abrirNovoLead(col.id)}><IcMais />Adicionar lead</button>
                </div>
              </div>
            );
          })}
          {podeConfig && (
            <div className="kb-col ghost-col sobe" style={{ animationDelay: '.5s' }}>
              <button type="button" className="kb-add" onClick={abrirNovaColuna}><IcMais />Nova coluna</button>
            </div>
          )}
        </div>
      </div>

      {/* dropdown "⋮" (card ou coluna) em PORTAL — fora do overflow da coluna e do stacking do card;
          superfície sólida #17191D (kanban.css .kb-menu), z-index acima de tudo. Posição = rect do botão. */}
      {menu && raizMenu && createPortal(
        <div className="kb-menu" role="menu" style={{ top: menu.top, right: menu.right }} onClick={(e) => e.stopPropagation()}>
          {menu.kind === 'card' && (() => {
            const ml = leads.find((x) => x.id === menu.id);
            if (!ml) return null;
            return (
              <>
                <button type="button" className="it" onClick={() => { setMenu(null); abrirEditarLead(ml); }}>Editar</button>
                <div className="sep">Mover para</div>
                {colunas.filter((c) => c.id !== colunaDoLead(ml)).map((c) => (
                  <button key={c.id} type="button" className="it" onClick={() => { setMenu(null); mover(ml.id, c.id); }}>
                    <span className="pt" style={{ background: c.cor }} />{c.nome}
                  </button>
                ))}
                <button type="button" className="it perigo" onClick={() => { setMenu(null); arquivar(ml); }}>Arquivar</button>
              </>
            );
          })()}
          {menu.kind === 'col' && (() => {
            const mc = colunas.find((c) => c.id === menu.id);
            if (!mc) return null;
            return (
              <>
                <button type="button" className="it" onClick={() => { setMenu(null); abrirEditarColuna(mc); }}>Renomear / cor</button>
                {!mc.entrada && <button type="button" className="it perigo" onClick={() => { setMenu(null); pedirExcluirColuna(mc); }}>Excluir</button>}
              </>
            );
          })()}
        </div>,
        raizMenu,
      )}

      {/* ---------- modal coluna (criar/editar) ---------- */}
      {/* FILTRO COMPLETO do board (dono 27/08): benefício · banco · atendente · canal · período.
          Estado aplica AO VIVO; "Aplicar" só fecha. O Exportar CSV baixa este recorte. */}
      <ModalV2
        aberto={painelFiltros}
        aoFechar={() => setPainelFiltros(false)}
        largura={500}
        titulo="Filtros do board"
        rodape={
          <>
            <BotaoSec onClick={limparFiltros}>Limpar tudo</BotaoSec>
            <BotaoSec onClick={() => { exportarCsv(); }}>⇩ Exportar CSV ({leadsVisiveis.length})</BotaoSec>
            <BotaoPrimario onClick={() => setPainelFiltros(false)}>Aplicar</BotaoPrimario>
          </>
        }
      >
        <div className="kbf">
          {benefOpcoes.length > 0 && (
            <div className="kbf-sec">
              <div className="kbf-cab">
                <span className="ic"><Ic><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M3 12h18" /></Ic></span>
                <span className="tt">Tipo de benefício</span>
                {filtroBenef.size > 0 && <span className="sel num">{filtroBenef.size}</span>}
              </div>
              <div className="kbf-chips">
                {benefOpcoes.map(([b, n]) => (
                  <button key={b} type="button" className={'kb-fchip' + (filtroBenef.has(b) ? ' on' : '')}
                    onClick={() => setFiltroBenef((s) => { const x = new Set(s); if (x.has(b)) x.delete(b); else x.add(b); return x; })}>
                    {rotuloDe(TIPO_BENEFICIO, b as KLead['tipoBeneficio'])}<span className="c num">{n}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="kbf-sec">
            <div className="kbf-cab">
              <span className="ic"><Ic><path d="M3 10l9-6 9 6" /><path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8" /><path d="M3 20h18" /></Ic></span>
              <span className="tt">Banco (da ficha)</span>
              {filtroBanco.size > 0 && <span className="sel num">{filtroBanco.size}</span>}
            </div>
            {bancoOpcoes.length === 0 ? <div className="kbf-vazio">Nenhuma ficha com banco marcado neste funil.</div> : (
              <div className="kbf-chips">
                {bancoOpcoes.map(([b, n]) => (
                  <button key={b} type="button" className={'kb-fchip' + (filtroBanco.has(b) ? ' on' : '')}
                    onClick={() => setFiltroBanco((s) => { const x = new Set(s); if (x.has(b)) x.delete(b); else x.add(b); return x; })}>
                    {b}<span className="c num">{n}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="kbf-sec">
            <div className="kbf-cab">
              <span className="ic"><Ic><circle cx="12" cy="8" r="3.5" /><path d="M5 20a7 7 0 0 1 14 0" /></Ic></span>
              <span className="tt">Atendente</span>
              {filtroResp && <span className="sel num">1</span>}
            </div>
            <div className="kbf-chips">
              <button type="button" className={'kb-fchip' + (!filtroResp ? ' on' : '')} onClick={() => setFiltroResp(null)}>Todos</button>
              {cargaPorResp.map((c) => (
                <button key={c.key} type="button" className={'kb-fchip' + (filtroResp === c.key ? ' on' : '')}
                  onClick={() => setFiltroResp((f) => (f === c.key ? null : c.key))}>
                  {c.nome}<span className="c num">{c.ativos}</span>
                </button>
              ))}
            </div>
          </div>
          {origens.length > 1 && (
            <div className="kbf-sec">
              <div className="kbf-cab">
                <span className="ic"><Ic><path d="M22 2 11 13" /><path d="M22 2 15 22l-4-9-9-4z" /></Ic></span>
                <span className="tt">Canal de origem</span>
                {filtroOrigem && <span className="sel num">1</span>}
              </div>
              <div className="kbf-chips">
                <button type="button" className={'kb-fchip' + (!filtroOrigem ? ' on' : '')} onClick={() => setFiltroOrigem(null)}>Todas</button>
                {origens.map((o) => (
                  <button key={o.nome} type="button" className={'kb-fchip' + (filtroOrigem === o.nome ? ' on' : '')} onClick={() => setFiltroOrigem((f) => (f === o.nome ? null : o.nome))}>
                    {o.nome}<span className="c num">{o.n}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="kbf-sec">
            <div className="kbf-cab">
              <span className="ic"><Ic><rect x="4" y="6" width="16" height="14" rx="2" /><path d="M4 10h16M8 4v4M16 4v4" /></Ic></span>
              <span className="tt">Entrada no funil</span>
              {(filtroDataDe || filtroDataAte) && <span className="sel num">1</span>}
            </div>
            <div className="kbf-datas">
              <label>De <input type="date" className="inp" value={filtroDataDe} onChange={(e) => setFiltroDataDe(e.target.value)} /></label>
              <label>Até <input type="date" className="inp" value={filtroDataAte} onChange={(e) => setFiltroDataAte(e.target.value)} /></label>
            </div>
          </div>
          <div className="kbf-resumo"><b>{leadsVisiveis.length} lead(s)</b> no recorte atual — o board e a exportação seguem estes filtros.</div>
        </div>
      </ModalV2>

      <ModalV2
        aberto={!!colModal}
        aoFechar={() => { if (!colBusy) setColModal(null); }}
        largura={420}
        titulo={colModal?.id ? 'Editar coluna' : 'Nova coluna'}
        rodape={
          <>
            <BotaoSec disabled={colBusy} onClick={() => setColModal(null)}>Cancelar</BotaoSec>
            <BotaoPrimario disabled={colBusy} onClick={salvarColuna}>{colBusy ? 'Salvando…' : colModal?.id ? 'Salvar' : 'Criar coluna'}</BotaoPrimario>
          </>
        }
      >
        <fieldset disabled={colBusy} className="kb-fieldset">
        <div className="form-grid">
          <div className="campo">
            <label>Nome da coluna</label>
            <input className="inp" value={colForm.nome} placeholder="Ex.: Proposta enviada" onChange={(e) => setColForm((f) => ({ ...f, nome: e.target.value }))} />
          </div>
          <div className="campo">
            <label>Cor</label>
            <div className="kb-swatches">
              {PALETTE.map((hex) => (
                <button key={hex} type="button" aria-label={'Cor ' + hex} className={'kb-swatch' + (colForm.cor === hex ? ' sel' : '')} style={{ background: hex }} onClick={() => setColForm((f) => ({ ...f, cor: hex }))} />
              ))}
            </div>
          </div>
        </div>
        </fieldset>
        {colErr && <div className="kb-err" role="alert">{colErr}</div>}
      </ModalV2>

      {/* ---------- modal excluir coluna ---------- */}
      <ModalV2
        aberto={!!delCol}
        aoFechar={() => { if (!delBusy) setDelCol(null); }}
        largura={440}
        titulo="Excluir coluna"
        rodape={
          <>
            <BotaoSec disabled={delBusy} onClick={() => setDelCol(null)}>Cancelar</BotaoSec>
            <button type="button" className="p-btn btn-perigo" disabled={delBusy} onClick={confirmarExcluirColuna}>{delBusy ? 'Excluindo…' : 'Excluir coluna'}</button>
          </>
        }
      >
        <fieldset disabled={delBusy} className="kb-fieldset">
        {delCol && leads.some((l) => colunaDoLead(l) === delCol.id) ? (
          <div className="form-grid">
            <p style={{ fontSize: 12.5, color: 'var(--txt-2)', lineHeight: 1.55 }}>
              Esta coluna possui leads. Escolha para qual coluna eles devem ser movidos antes de excluir.
            </p>
            <div className="campo">
              <label>Mover leads para</label>
              <select className="inp" value={delDest} onChange={(e) => setDelDest(e.target.value)}>
                {colunas.filter((c) => c.id !== delCol.id).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </div>
          </div>
        ) : (
          <p style={{ fontSize: 12.5, color: 'var(--txt-2)' }}>Excluir a coluna <strong>{delCol?.nome}</strong>?</p>
        )}
        </fieldset>
      </ModalV2>

      {/* ---------- modal confirmação de movimento (ganho/perdido/reabertura) ---------- */}
      <ModalV2
        aberto={!!pend}
        aoFechar={() => { if (!movBusy) setPend(null); }}
        fecharNoVeu={!movBusy}
        largura={460}
        titulo={pend?.tipo === 'ganho' ? 'Confirmar fechamento' : pend?.tipo === 'perdido' ? 'Marcar oportunidade como perdida' : 'Reabrir oportunidade'}
        rodape={
          <>
            <BotaoSec disabled={movBusy} onClick={() => setPend(null)}>Cancelar</BotaoSec>
            <BotaoPrimario disabled={movBusy} onClick={confirmarMov}>
              {movBusy ? 'Salvando…' : pend?.tipo === 'ganho' ? 'Confirmar fechamento' : pend?.tipo === 'perdido' ? 'Marcar como perdida' : 'Reabrir'}
            </BotaoPrimario>
          </>
        }
      >
        {pend && (
          <>
            {movErr && <div className="aviso-inline erro" role="alert" style={{ marginBottom: 10 }}>{movErr}</div>}
            <DetRow l="Cliente" v={pend.lead.nome} />
            <DetRow l="Etapa anterior" v={colunas.find((c) => c.id === pend.lead.colunaId)?.nome || '—'} />
            <DetRow l="Nova etapa" v={pend.colDest.nome} />
            {pend.tipo !== 'reabertura' && <DetRow l="Responsável atual" v={pend.lead.respNome || <em>sem atribuição</em>} />}
            {pend.tipo === 'ganho' && !pend.lead.respNome && (
              <div className="kd-empty">Sem responsável: o fechamento ficará como “sem atribuição”.</div>
            )}
            {pend.tipo === 'reabertura' && (
              <>
                <DetRow l="Resultado anterior" v={pend.lead.status === 'ganho' ? 'Ganho' : pend.lead.status === 'perdido' ? 'Perdido' : '—'} />
                <DetRow l="Fechado em" v={fmtDataHora(pend.lead.fechadoEm) || '—'} />
                <DetRow l="Responsável no fechamento" v={pend.lead.respNoFechamentoId ? 'atribuído' : <em>sem atribuição</em>} />
              </>
            )}
            {pend.tipo === 'perdido' && (
              <div className="form-grid" style={{ marginTop: 12 }}>
                <div className="campo">
                  <label>Motivo da perda *</label>
                  <select className="inp" value={motPerda} onChange={(e) => { setMotPerda(e.target.value); setMovErr(null); }}>
                    <option value="">Selecione…</option>
                    {MOTIVOS_PERDA.map(([v, r]) => <option key={v} value={v}>{r}</option>)}
                  </select>
                </div>
                {motPerda === 'outro' && (
                  <div className="campo">
                    <label>Descrição *</label>
                    <textarea className="inp" rows={2} placeholder="Descreva o motivo" value={motPerdaDesc} onChange={(e) => { setMotPerdaDesc(e.target.value); setMovErr(null); }} />
                  </div>
                )}
              </div>
            )}
            {pend.tipo === 'reabertura' && (
              <div className="form-grid" style={{ marginTop: 12 }}>
                <div className="campo">
                  <label>Motivo da reabertura *</label>
                  <textarea className="inp" rows={2} placeholder="Por que está reabrindo esta oportunidade?" value={motReab} onChange={(e) => { setMotReab(e.target.value); setMovErr(null); }} />
                </div>
              </div>
            )}
          </>
        )}
      </ModalV2>

      {/* ---------- modal novo/editar lead ---------- */}
      {leadModal && (
        <LeadModalV2
          demo={demo} modo={leadModal.modo} lead={leadModal.lead}
          lf={lf} setLf={setLf} selContato={selContato} setSelContato={setSelContato}
          semVinculo={semVinculo} setSemVinculo={setSemVinculo}
          leadErr={leadErr} leadBusy={leadBusy} colunas={colunas} usuarios={usuarios}
          etiquetas={etiquetas} funilId={demo ? 'kf-demo' : k.funilId} seedContatos={seed.contatos}
          leadsAbertos={leads}
          aoFechar={() => { if (!leadBusy) setLeadModal(null); }}
          aoSalvar={salvarLead}
          aoAbrirOportunidade={(id) => { setLeadModal(null); setDetId(id); }}
        />
      )}

      {/* ---------- modal detalhe ---------- */}
      {detLead && (
        <DetalheModalV2
          demo={demo} l={detLead} colunas={colunas}
          eventosDemo={demo ? (seed.eventos[detLead.id] ?? []) : undefined}
          fichaDemoStatus={demo ? seed.fichaStatus[detLead.id] : undefined}
          aoFechar={() => setDetId(null)}
          aoEditar={() => abrirEditarLead(detLead)}
          aoAbrirConversa={() => {
            nav((detLead.canalTipo === 'facebook' ? '/facebook' : '/whatsapp') + `?conversa=${encodeURIComponent(detLead.conversaOrigemId ?? '')}`);
          }}
        />
      )}
    </div>
  );
}

/* ---------- linha rotulada (detalhe/confirmação) ---------- */
function DetRow({ l, v }: { l: string; v: ReactNode }) {
  if (!v) return null;
  return <div className="kd-row"><span className="kd-l">{l}</span><span className="kd-v">{v}</span></div>;
}

/* ================================================================
   Card .kc — v3 COMPACTO: só o que decide a ação de 1 segundo.
   Linha 1: nome + status. Linha 2: responsável + tempo parado.
   1 badge discreto de próximo passo. Secundário (valor/benefício/
   instituição) só no HOVER; o resto vive no drawer ao clicar.
   Criticidade em CAMADAS: .warm (7–30d ou lead quente, âmbar discreto)
   vs .hot (+30d ou SLA vermelho, trilho/tempo rubro) — com 51% do
   funil parado, só o .hot ganha o alarme forte para o vermelho valer.
   ================================================================ */
function CardKc({ l, colunas, etiquetasCat, naoLidas, sla, fichaInfo, optout, moving, arrastando, destacado, menuAberto, aoRef, aoClicar, aoMenu, aoDragStart, aoDragEnd, aoAbrirConversa }: {
  l: KLead; colunas: KColuna[]; etiquetasCat: Etiqueta[]; naoLidas: number;
  sla: SlaAlerta[]; fichaInfo: FichaBoardResumo | undefined; optout: boolean; moving: boolean; arrastando: boolean;
  destacado: boolean; menuAberto: boolean;
  aoRef: (el: HTMLDivElement | null) => void; aoClicar: () => void; aoMenu: (btn: HTMLElement) => void;
  aoDragStart: (e: DragEvent) => void; aoDragEnd: () => void; aoAbrirConversa: () => void;
}) {
  const fichaStatus = fichaInfo?.status;
  const colAtual = colunas.find((c) => c.id === l.colunaId);
  const dp = diasParado(l);
  const paradoAtivo = l.status === 'em_andamento' && (colAtual?.resultado ?? 'neutro') === 'neutro' && dp >= LIMIAR_PARADO_DIAS;
  const slaVermelho = sla.some((a) => a.severidade === 'vermelho' || a.severidade === 'critico' || a.severidade === 'imediato');
  const quente = sla.some((a) => a.tipo === 'lead_quente_aguardando');
  const hot = (paradoAtivo && dp >= LIMIAR_CRITICO_DIAS) || slaVermelho;
  const warm = !hot && (paradoAtivo || quente);
  const tier = hot ? ' hot' : warm ? ' warm' : '';
  // tipo de benefício: da oportunidade; sem ele, o da FICHA (pedido do dono 27/08).
  // v6: SERVIÇO saiu do card (dono: "cancelamento não fazemos mais, é só ressarcimento" —
  // rótulo repetido em todo card é ruído); VALORES saíram ("não trabalhamos com isso").
  const benefBruto = l.tipoBeneficio ?? (fichaInfo?.tipoBeneficio as KLead['tipoBeneficio'] | null);
  const benefLbl = benefBruto ? rotuloDe(TIPO_BENEFICIO, benefBruto) : '';
  // data no FUSO DE SP (slice do ISO daria o dia em UTC — à noite mostra amanhã)
  const dtEntradaIso = l.entradaEm || l.criadoEm || '';
  const dataCurta = dtEntradaIso ? new Date(dtEntradaIso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' }) : '';
  const dataFull = dtEntradaIso ? new Date(dtEntradaIso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '';
  // meta corrida: só a instituição (bancos ganharam a própria fileira de destaque)
  const metaPartes = [l.instituicao].filter(Boolean) as string[];
  const revN = fichaInfo?.revBancos.length ?? 0;
  const metaTitle = metaPartes.join(' · ');
  // progresso do funil DO JEITO DO DONO (27/08): TODAS as etapas contam menos Perdido
  // (Lead novo, Qualificado, Documentação, Assinar, Fechado = 5). Entrada = 0/5; cada
  // avanço de coluna sobe 1; chegou no Fechado/ganho = 5/5 cheio (verde).
  const etapasFunil = colunas.filter((c) => (c.resultado ?? 'neutro') !== 'perdido');
  const nEtapas = etapasFunil.length;
  const idxEtapa = etapasFunil.findIndex((c) => c.id === l.colunaId);
  const noGanho = l.status === 'ganho' || (colAtual ? (colAtual.resultado ?? 'neutro') === 'ganho' : false);
  const mostraProg = l.status !== 'perdido' && nEtapas > 1 && (noGanho || idxEtapa >= 0);
  const progVal = noGanho ? nEtapas : Math.max(0, idxEtapa);
  const progPct = (progVal / Math.max(nEtapas, 1)) * 100;
  // v3 F2 — PRÓXIMO PASSO: 1 badge que diz o que FAZER (não só o que é). "Sem responsável" já vive
  // em âmbar na linha do atendente; a estagnação, no "parado Xd" ao lado — o badge não os repete.
  const badge = optout ? { cls: 'blk', txt: 'Não incomodar' }
    : naoLidas > 0 ? { cls: 'msg', txt: `Responder · ${Math.min(naoLidas, 99)}` }
    : quente ? { cls: 'hot', txt: 'Responder agora' }
    : fichaStatus === 'rascunho' ? { cls: 'ficha', txt: 'Finalizar ficha' }
    : hot && paradoAtivo ? { cls: 'hot', txt: 'Retomar contato' }
    // "Ficha ✓" saiu do card (v5): estado BOM não compete por atenção — vive no drawer
    : null;
  // Etiquetas do lead + do contato, sem repetição, SEMPRE visíveis (pedido do dono:
  // "colocar etiquetas e que fique aparecendo no kanban, como lembrete"). Máx. 2 + contador.
  const todasEtiquetas = Array.from(new Set([...l.etiquetas, ...l.contatoEtiquetas]));
  // Polish: telefone cru como título vira número legível + "· sem nome"; ALL CAPS vira Title Case.
  const fone = tituloTelefone(l.nome);
  const nomeCard = fone ?? nomeExibicao(l.nome);

  return (
    <div
      ref={aoRef}
      className={'kc' + tier + (l.status === 'ganho' ? ' e-ganho' : '') + (arrastando ? ' drag' : '') + (moving ? ' moving' : '') + (destacado ? ' destaque' : '')}
      draggable={!moving}
      onClick={aoClicar}
      onDragStart={aoDragStart}
      onDragEnd={aoDragEnd}
    >
      {/* ⋮ absoluto no canto — em repouso o card é só informação (aparece no hover) */}
      <span className="kb-menu-wrap">
        <button type="button" className={'mbtn' + (menuAberto ? ' on' : '')} aria-label={'Ações do lead ' + l.nome} aria-expanded={menuAberto} onClick={(e) => { e.stopPropagation(); aoMenu(e.currentTarget); }}>
          <IcPontos />
        </button>
        {/* o dropdown do card é renderizado em PORTAL no nível da página (fora do overflow da coluna) */}
      </span>

      {/* L1: TAG de benefício colorida (a energia da referência) + data de entrada */}
      {(benefLbl || dataCurta) && (
        <div className="kc-eyebrow">
          {benefLbl && <span className="kc-benef" title={'Tipo de benefício: ' + benefLbl}>{benefLbl}</span>}
          {dataCurta && <span className="kc-data num" title={'No funil desde ' + dataFull}>{dataCurta}</span>}
        </div>
      )}

      {/* L2 TÍTULO — o único elemento forte do card */}
      <div className="kc-r1">
        <span className="kc-nm" title={l.nome}>{fone ? <span className="num">{fone}</span> : nomeCard}{fone && <i className="kc-semnome">· sem nome</i>}</span>
        {l.status === 'ganho' && <span className="kc-flag ganho" title="Fechado como ganho">Ganho</span>}
        {l.status === 'perdido' && <span className="kc-flag perdido" title={'Perdido' + (l.motivoPerda ? ' · ' + rotuloMotivoPerda(l.motivoPerda) : '')}>Perdido</span>}
      </div>

      {/* L3 META corrida: instituição */}
      {metaPartes.length > 0 && (
        <div className="kc-meta" title={metaTitle}>{metaPartes.join(' · ')}</div>
      )}

      {/* L3b BANCOS DA FICHA em DESTAQUE (dono: "muito importante"): o banco do cliente
          (recebe) no chip mais forte do card (assinatura platina); REVs em contorno */}
      {fichaInfo && (fichaInfo.bancoNome || revN > 0) && (
        <div className="kc-bancos" title={'Bancos da ficha' + (fichaInfo.bancoNome ? ` · recebe: ${fichaInfo.bancoNome}` : '') + (revN ? ` · REV: ${fichaInfo.revBancos.join(', ')}` : '')}>
          {fichaInfo.bancoNome && <span className="kc-banco prin">{fichaInfo.bancoNome}</span>}
          {fichaInfo.revBancos.slice(0, 2).map((b) => <span key={b} className="kc-banco">{b}</span>)}
          {revN > 2 && <span className="kc-banco mais">+{revN - 2}</span>}
        </div>
      )}
      {/* RESERVADO — estado do BOT no card (dono 27/08): quando a opção nascer no bot,
          entra aqui (fonte provável: ia_sessoes da conversa). */}

      {/* L5 PROGRESSO do funil: avançou X de N etapas (0/N na entrada; N/N no Fechado) */}
      {mostraProg && (
        <div className="kc-prog" title={noGanho ? `Fechado — completou as ${nEtapas} etapas` : `Avançou ${progVal} de ${nEtapas} etapas · está em ${colAtual?.nome ?? ''}`}>
          <span className="trilho"><span className="fill" style={{ width: progPct + '%' }} /></span>
          <span className="frac num">{progVal}/{nEtapas}</span>
        </div>
      )}

      {/* L6 LEMBRETE — texto âmbar, sem caixa */}
      {l.lembrete && (
        <div className="kc-lem" title={'Lembrete: ' + l.lembrete}><IcSino /><span>{l.lembrete}</span></div>
      )}

      {/* L6b ETIQUETAS coloridas — mesma linguagem da tag de benefício, na cor da etiqueta */}
      {todasEtiquetas.length > 0 && (
        <div className="kc-etqs">
          {todasEtiquetas.slice(0, 2).map((t) => {
            const cor = corDaEtiqueta(t, etiquetasCat);
            return <span key={t} className="kc-etq" title={t} style={{ color: cor, background: cor + '24', borderColor: cor + '4D' }}>{t}</span>;
          })}
          {todasEtiquetas.length > 2 && <span className="kc-etq mais" title={todasEtiquetas.slice(2).join(' · ')}>+{todasEtiquetas.length - 2}</span>}
        </div>
      )}

      {/* L7 RODAPÉ: gente + tempo + WhatsApp */}
      <div className="kc-foot">
        <span className={'kc-av' + (l.respNome ? '' : ' semdono')} title={l.respNome ? 'Responsável · ' + l.respNome : 'Sem responsável'}>{l.respNome ? initials(l.respNome) : '·'}</span>
        <span className={'kc-resp' + (l.respNome ? '' : ' none')} title={l.respNome || 'Não atribuído'}>{l.respNome || 'Não atribuído'}</span>
        <span className={'kc-time num' + (paradoAtivo ? (hot ? ' hot' : ' warm') : '')} title={paradoAtivo ? `Sem trocar de coluna há ${dp} dia(s)` : 'Última atualização'}>
          {paradoAtivo ? `parado ${dp}d` : haDe(l.atualizadoEm || l.criadoEm)}
        </span>
        {l.conversaOrigemId && (
          <button type="button" className="kc-wa" title="Abrir a conversa do cliente no WhatsApp" aria-label={'Abrir a conversa de ' + l.nome + ' no WhatsApp'}
            onClick={(e) => { e.stopPropagation(); aoAbrirConversa(); }}>
            <IcChat />
          </button>
        )}
      </div>

      {/* L8 FAIXA DE AÇÃO full-width no pé — o call-to-action que o atendente varre */}
      {badge && <span className={'kc-badge ' + badge.cls} title={badge.txt}>{badge.txt}</span>}
    </div>
  );
}

/* ================================================================
   Combobox de contatos (v1: debounce 300ms, min 2 chars, teclado).
   Demo: filtra o seed local; real: useBuscaContatos (limit 12).
   ================================================================ */
function ContatoComboboxV2({ demo, seedContatos, funilId, leadsAbertos, aoSelecionar, aoCriarNovo }: {
  demo: boolean; seedContatos: ContatoRow[]; funilId: string | null; leadsAbertos: KLead[];
  aoSelecionar: (c: ContatoRow) => void; aoCriarNovo: () => void;
}) {
  const [termo, setTermo] = useState('');
  const [deb, setDeb] = useState('');
  const [open, setOpen] = useState(false);
  const [ativo, setAtivo] = useState(0);
  const raiz = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const t = window.setTimeout(() => setDeb(termo), 300);
    return () => window.clearTimeout(t);
  }, [termo]);
  useEffect(() => {
    const f = (e: MouseEvent) => { if (raiz.current && !raiz.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', f);
    return () => document.removeEventListener('mousedown', f);
  }, []);

  const buscaQ = useBuscaContatos(demo ? '' : deb);
  const t = deb.trim().toLowerCase();
  const dig = t.replace(/\D/g, '');
  const resultados: ContatoRow[] = demo
    ? (t.length >= 2 ? seedContatos.filter((c) => c.nome.toLowerCase().includes(t) || c.email.toLowerCase().includes(t) || (dig.length >= 3 && c.tel.replace(/\D/g, '').includes(dig))) : [])
    : (buscaQ.data ?? []);
  const oppQ = useOportunidadesAbertasDeContatos(useMemo(() => resultados.map((r) => r.id), [resultados]));
  useEffect(() => { setAtivo(0); }, [deb, resultados.length]);
  const oppDe = (cid: string): OppAberta | undefined => {
    if (demo) {
      const l = leadsAbertos.find((x) => x.contatoId === cid && x.status === 'em_andamento');
      return l ? { id: l.id, contatoId: cid, colunaId: l.colunaId, colunaNome: '', funilId, respNome: l.respNome, valor: l.valor, atualizadoEm: l.atualizadoEm } : undefined;
    }
    return oppQ.data?.[cid];
  };
  const mostrar = open && t.length >= 2;

  return (
    <div className="kb-combo" ref={raiz}>
      <input
        className="inp" role="combobox" aria-expanded={mostrar} autoFocus
        placeholder="Digite nome, telefone ou e-mail" value={termo}
        onChange={(e) => { setTermo(e.target.value); setOpen(true); setAtivo(0); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setAtivo((a) => Math.min(a + 1, Math.max(0, resultados.length - 1))); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setAtivo((a) => Math.max(a - 1, 0)); }
          else if (e.key === 'Enter') { e.preventDefault(); const c = resultados[ativo]; if (c) { aoSelecionar(c); setOpen(false); } }
          else if (e.key === 'Escape') setOpen(false);
        }}
      />
      {mostrar && (
        <div className="kb-combo-pop" role="listbox">
          {!demo && buscaQ.isLoading ? (
            <div className="kb-combo-info">Buscando…</div>
          ) : !demo && buscaQ.isError ? (
            <div className="kb-combo-info err">Erro na busca. Tente novamente.</div>
          ) : resultados.length === 0 ? (
            <div className="kb-combo-vazio">
              Nenhum contato encontrado.
              <button type="button" className="kb-link" onClick={aoCriarNovo}>Criar novo contato</button>
            </div>
          ) : (
            resultados.map((c, i) => {
              const opp = oppDe(c.id);
              return (
                <div
                  key={c.id} role="option" aria-selected={i === ativo}
                  className={'kb-ci' + (i === ativo ? ' ativo' : '')}
                  onMouseEnter={() => setAtivo(i)}
                  onMouseDown={(e) => { e.preventDefault(); aoSelecionar(c); setOpen(false); }}
                >
                  <span className="av3">{initials(c.nome || '?')}</span>
                  <span className="tx">
                    <span className="kb-ci-nome">{c.nome || 'Sem nome'}</span>
                    <span className="kb-ci-meta">
                      {c.tel || 'Sem telefone'}
                      {c.org !== '—' && c.org ? ' · ' + c.org : ''}
                      {c.email ? ' · ' + c.email : ''}
                    </span>
                    <span className={'kb-ci-opp' + (opp ? ' tem' : '')}>
                      {opp ? (opp.colunaNome ? opp.colunaNome + ' · ' : '') + 'oportunidade aberta' : 'Nenhuma oportunidade aberta'}
                    </span>
                  </span>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

/* ================================================================
   Modal novo/editar lead — campos, combobox, herança de conversa e
   bloqueio de duplicidade (textos v1 byte a byte).
   ================================================================ */
function LeadModalV2({ demo, modo, lead, lf, setLf, selContato, setSelContato, semVinculo, setSemVinculo, leadErr, leadBusy, colunas, usuarios, etiquetas, funilId, seedContatos, leadsAbertos, aoFechar, aoSalvar, aoAbrirOportunidade }: {
  demo: boolean; modo: 'novo' | 'editar'; lead?: KLead;
  lf: LeadForm; setLf: React.Dispatch<React.SetStateAction<LeadForm>>;
  selContato: ContatoRow | null; setSelContato: (c: ContatoRow | null) => void;
  semVinculo: boolean; setSemVinculo: (v: boolean) => void;
  leadErr: string | null; leadBusy: boolean; colunas: KColuna[];
  usuarios: { id: string; nome: string }[]; etiquetas: Etiqueta[];
  funilId: string | null; seedContatos: ContatoRow[]; leadsAbertos: KLead[];
  aoFechar: () => void; aoSalvar: () => void; aoAbrirOportunidade: (id: string) => void;
}) {
  const editar = modo === 'editar';
  const conversasQ = useConversasDoContato(selContato?.id ?? null);
  const conversas = conversasQ.data ?? [];
  const oppQ = useOportunidadesAbertasDeContatos(useMemo(() => (selContato ? [selContato.id] : []), [selContato]));
  const oppSel: OppAberta | undefined = demo
    ? (selContato ? (() => {
        const l = leadsAbertos.find((x) => x.contatoId === selContato.id && x.status === 'em_andamento');
        return l ? { id: l.id, contatoId: selContato.id, colunaId: l.colunaId, colunaNome: colunas.find((c) => c.id === l.colunaId)?.nome ?? '', funilId, respNome: l.respNome, valor: l.valor, atualizadoEm: l.atualizadoEm } : undefined;
      })() : undefined)
    : (selContato ? oppQ.data?.[selContato.id] : undefined);
  const bloqueado = !!oppSel && oppSel.funilId === funilId;
  const podeCampos = editar || !!selContato || semVinculo;
  const vinculado = !!selContato || (editar && !!lf.contatoId);
  const mostraGenerico = ['analise_inicial', 'outro'].includes(lf.tipoServico) || (parseBRL(lf.valorEstimado).v ?? 0) > 0;
  const clienteTags = selContato?.tags ?? lead?.contatoEtiquetas ?? [];

  /* herança automática da conversa mais recente (v1) */
  useEffect(() => {
    if (editar || !selContato || conversas.length === 0 || lf.conversaOrigemId) return;
    const c = conversas[0];
    setLf((f) => ({
      ...f,
      conversaOrigemId: c.id, canalOrigemId: c.canalId ?? '', canalTipo: c.canalTipo ?? '',
      canalNome: c.canalNome ?? '', canalNumero: c.canalNumero ?? '',
      respId: f.respId || (c.atendenteId ?? ''),
      origem: c.canalTipo ? canalLabel(c.canalTipo) : f.origem,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editar, selContato, conversas]);

  const selecionarContato = (c: ContatoRow) => {
    setSelContato(c);
    setLf((f) => ({
      ...f, contatoId: c.id, nome: c.nome, telefone: c.tel, email: c.email,
      conversaOrigemId: '', canalOrigemId: '', canalTipo: '', canalNome: '', canalNumero: '', respId: '',
      origem: c.org !== '—' && c.org ? c.org : 'Manual',
    }));
  };

  const set = (k: keyof LeadForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setLf((f) => ({ ...f, [k]: e.target.value }));

  return (
    <ModalV2
      aberto
      aoFechar={aoFechar}
      fecharNoVeu={!leadBusy}
      largura={620}
      titulo={
        <span>
          {editar ? 'Editar oportunidade' : 'Novo lead'}
          <div className="kb-modal-sub">{editar ? 'Atualize os dados do caso.' : 'Cadastre um caso previdenciário no funil.'}</div>
        </span>
      }
      rodape={
        <>
          <BotaoSec disabled={leadBusy} onClick={aoFechar}>Cancelar</BotaoSec>
          <BotaoPrimario disabled={leadBusy || bloqueado} onClick={() => { if (leadBusy || bloqueado) return; aoSalvar(); }}>{leadBusy ? 'Salvando…' : editar ? 'Salvar' : 'Adicionar lead'}</BotaoPrimario>
        </>
      }
    >
      <fieldset disabled={leadBusy} className="kb-fieldset">
      <div className="kb-sec-h">Contato e origem</div>
      {!editar && !selContato && !semVinculo && (
        <div className="form-grid">
          <div className="campo">
            <label>Pesquisar contato</label>
            <ContatoComboboxV2 demo={demo} seedContatos={seedContatos} funilId={funilId} leadsAbertos={leadsAbertos} aoSelecionar={selecionarContato} aoCriarNovo={() => { setSemVinculo(true); setLf((f) => ({ ...f, nome: '', telefone: '' })); }} />
          </div>
          <button type="button" className="kb-link" onClick={() => { setSemVinculo(true); setLf((f) => ({ ...f, nome: '', telefone: '' })); }}>
            Criar lead sem contato vinculado
          </button>
        </div>
      )}
      {!editar && selContato && (
        <div className="kb-selcontato">
          <div className="kb-sc-row">
            <span className="av3">{initials(selContato.nome || '?')}</span>
            <span>
              <div className="kb-sc-nome">{selContato.nome || 'Sem nome'}</div>
              <div className="kb-sc-meta">
                {selContato.tel || 'Sem telefone'}
                {selContato.email ? ' · ' + selContato.email : ''}
                {selContato.org !== '—' && selContato.org ? ' · ' + selContato.org : ''}
              </div>
            </span>
          </div>
          {bloqueado && oppSel && (
            <div className="kb-opp-aberta">
              <div className="kb-opp-titulo">Este contato já possui uma oportunidade aberta neste funil.</div>
              <div className="kb-opp-meta num">
                Coluna: {oppSel.colunaNome || '—'} · Resp.: {oppSel.respNome || 'Não atribuído'}
                {oppSel.valor ? ' · ' + fmtBRL(oppSel.valor) : ''}
                {oppSel.atualizadoEm ? ' · atualizado ' + haDe(oppSel.atualizadoEm) : ''}
              </div>
              <button type="button" className="kb-link" onClick={() => aoAbrirOportunidade(oppSel.id)}>Abrir oportunidade</button>
            </div>
          )}
          <div className="kb-sc-acts">
            <button type="button" className="kb-link" onClick={() => setSelContato(null)}>Trocar contato</button>
            <button type="button" className="kb-link perigo" onClick={() => { setSelContato(null); setLf((f) => ({ ...f, contatoId: '', nome: '', telefone: '', email: '' })); }}>Remover</button>
          </div>
        </div>
      )}
      {!editar && semVinculo && (
        <div className="form-grid">
          <div className="form-2col">
            <div className="campo">
              <label>Nome do lead *</label>
              <input className="inp" placeholder="Nome do beneficiário" value={lf.nome} onChange={set('nome')} />
            </div>
            <div className="campo">
              <label>Telefone</label>
              <input className="inp" inputMode="tel" placeholder="(11) 99999-9999" value={lf.telefone} onChange={set('telefone')} />
            </div>
          </div>
          <button type="button" className="kb-link" onClick={() => { setSemVinculo(false); setLf((f) => ({ ...f, nome: '', telefone: '' })); }}>
            Vincular a um contato existente
          </button>
        </div>
      )}
      {editar && (
        <div className="kb-selcontato">
          <div className="kb-sc-row">
            <span className="av3">{initials(lf.nome || '?')}</span>
            <span>
              <div className="kb-sc-nome">{lf.nome}</div>
              <div className="kb-sc-meta">{lf.telefone || 'Sem telefone'}{lf.email ? ' · ' + lf.email : ''}</div>
            </span>
          </div>
        </div>
      )}

      {podeCampos && (
        <>
          <div className="form-grid" style={{ marginTop: 12 }}>
            <div className="form-2col">
              {vinculado ? (
                <div className="campo">
                  <label>Canal / chip de origem</label>
                  {conversas.length > 1 ? (
                    <select
                      className="inp" value={lf.conversaOrigemId}
                      onChange={(e) => {
                        const c = conversas.find((x) => x.id === e.target.value);
                        if (!c) { setLf((f) => ({ ...f, conversaOrigemId: '', canalOrigemId: '', canalTipo: '', canalNome: '', canalNumero: '' })); return; }
                        setLf((f) => ({
                          ...f, conversaOrigemId: c.id, canalOrigemId: c.canalId ?? '', canalTipo: c.canalTipo ?? '',
                          canalNome: c.canalNome ?? '', canalNumero: c.canalNumero ?? '',
                          respId: c.atendenteId || f.respId, origem: c.canalTipo ? canalLabel(c.canalTipo) : f.origem,
                        }));
                      }}
                    >
                      <option value="">Selecione a conversa…</option>
                      {conversas.map((c) => (
                        <option key={c.id} value={c.id}>
                          {canalLabel(c.canalTipo)} · {c.canalNome || '—'}{c.ultimaInteracao ? ' · ' + haDe(c.ultimaInteracao) : ''}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input className="inp" readOnly value={lf.canalNome ? canalLabel(lf.canalTipo) + ' · ' + lf.canalNome : 'Sem conversa vinculada'} />
                  )}
                </div>
              ) : <div className="campo" aria-hidden />}
              <div className="campo">
                <label>Responsável pelo atendimento</label>
                <select className="inp" value={lf.respId} onChange={set('respId')}>
                  <option value="">Não atribuído</option>
                  {usuarios.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
                </select>
              </div>
            </div>
          </div>

          <div className="kb-sec-h">Benefício</div>
          <div className="form-grid">
            <div className="form-2col">
              <div className="campo">
                <label>Tipo de benefício *</label>
                <select className="inp" value={lf.tipoBeneficio} onChange={set('tipoBeneficio')}>
                  <option value="">Selecione…</option>
                  {TIPO_BENEFICIO.map(([v, r]) => <option key={v} value={v}>{r}</option>)}
                </select>
              </div>
              <div className="campo">
                <label>Número do benefício <span className="kb-hint">(opcional)</span></label>
                <input className="inp" placeholder="Ex.: 123.456.789-0" value={lf.numeroBeneficio} onChange={set('numeroBeneficio')} />
              </div>
            </div>
            <div className="campo">
              <label>Instituição, associação ou banco (opcional)</label>
              <input className="inp" placeholder="Ex.: Banco Pan, BMG ou associação" value={lf.instituicao} onChange={set('instituicao')} />
            </div>
          </div>

          <div className="kb-sec-h">Serviço</div>
          <div className="form-grid">
            <div className="campo">
              <label>Serviço solicitado *</label>
              <select
                className="inp" value={lf.tipoServico}
                onChange={(e) => {
                  const d = defaultsStatus(e.target.value);
                  setLf((f) => ({ ...f, tipoServico: e.target.value, statusCancelamento: d.c, statusRessarcimento: d.r }));
                }}
              >
                {TIPO_SERVICO.map(([v, r]) => <option key={v} value={v}>{r}</option>)}
              </select>
            </div>
            {(mostraCancel(lf.tipoServico) || mostraRess(lf.tipoServico)) && (
              <div className="form-2col">
                {mostraCancel(lf.tipoServico) ? (
                  <div className="campo">
                    <label>Situação do cancelamento</label>
                    <select className="inp" value={lf.statusCancelamento} onChange={set('statusCancelamento')}>
                      {ST_CANCEL.map(([v, r]) => <option key={v} value={v}>{r}</option>)}
                    </select>
                  </div>
                ) : <div className="campo" aria-hidden />}
                {mostraRess(lf.tipoServico) ? (
                  <div className="campo">
                    <label>Situação do ressarcimento</label>
                    <select className="inp" value={lf.statusRessarcimento} onChange={set('statusRessarcimento')}>
                      {ST_RESS.map(([v, r]) => <option key={v} value={v}>{r}</option>)}
                    </select>
                  </div>
                ) : <div className="campo" aria-hidden />}
              </div>
            )}
          </div>

          <div className="kb-sec-h">Dados do desconto</div>
          <div className="form-grid">
            <div className="form-2col">
              <div className="campo">
                <label>Tipo de desconto (opcional)</label>
                <input className="inp" placeholder="Ex.: empréstimo, mensalidade associativa" value={lf.tipoDesconto} onChange={set('tipoDesconto')} />
              </div>
              <div className="campo">
                <label>Início do desconto (opcional)</label>
                <input className="inp" type="date" value={lf.dataInicioDesconto} onChange={set('dataInicioDesconto')} />
              </div>
            </div>
          </div>

          <div className="kb-sec-h">Valores</div>
          <div className="form-grid">
            <div className="form-2col">
              <div className="campo">
                <label>Valor mensal descontado (R$)</label>
                <input className="inp" inputMode="decimal" placeholder="0,00" value={lf.valorDescontoMensal} onChange={set('valorDescontoMensal')} />
              </div>
              <div className="campo">
                <label>Valor estimado do ressarcimento (R$)</label>
                <input className="inp" inputMode="decimal" placeholder="0,00" value={lf.valorRessarcimentoEstimado} onChange={set('valorRessarcimentoEstimado')} />
              </div>
            </div>
            <div className="form-2col">
              <div className="campo">
                <label>Valor já ressarcido (R$)</label>
                <input className="inp" inputMode="decimal" placeholder="0,00" value={lf.valorRessarcido} onChange={set('valorRessarcido')} />
              </div>
              {mostraGenerico ? (
                <div className="campo">
                  <label>Valor estimado genérico (R$)</label>
                  <input className="inp" inputMode="decimal" placeholder="0,00" value={lf.valorEstimado} onChange={set('valorEstimado')} />
                </div>
              ) : <div className="campo" aria-hidden />}
            </div>
          </div>

          <div className="kb-sec-h">Organização</div>
          <div className="form-grid">
            <div className="campo">
              <label>Etapa</label>
              <select className="inp" value={lf.colunaId} onChange={set('colunaId')}>
                {colunas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </div>
            {clienteTags.length > 0 && (
              <div className="campo">
                <label>Etiquetas do cliente <span className="kb-hint">(do contato, somente leitura)</span></label>
                <div className="kb-tags">
                  {clienteTags.map((t) => {
                    const cor = corDaEtiqueta(t, etiquetas);
                    return <span key={t} className="kb-tag-ro" style={{ background: cor + '22', color: cor, borderColor: cor + '55' }}>{t}</span>;
                  })}
                </div>
              </div>
            )}
            <div className="campo">
              <label>Etiquetas do caso</label>
              <div className="kb-tags">
                {etiquetas.length === 0 && <span className="kb-sem-etiqueta">Nenhuma etiqueta</span>}
                {etiquetas.map((t) => {
                  const on = lf.etiquetas.includes(t.nome);
                  return (
                    <button
                      key={t.nome} type="button"
                      className="kb-tag"
                      style={on ? { background: t.cor + '22', color: t.cor, borderColor: t.cor + '66' } : undefined}
                      onClick={() => setLf((f) => ({ ...f, etiquetas: on ? f.etiquetas.filter((x) => x !== t.nome) : [...f.etiquetas, t.nome] }))}
                    >
                      {t.nome}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="campo">
              <label>Lembrete no card <span className="kb-hint">· nota curta fixada no card do kanban</span></label>
              <input
                className="inp" maxLength={140} value={lf.lembrete} onChange={set('lembrete')}
                placeholder="Ex.: ligar depois das 14h · falta RG e comprovante · retornar segunda"
              />
            </div>
            <div className="campo">
              <label>Resumo do caso</label>
              <textarea
                className="inp" rows={3} value={lf.observacoes} onChange={set('observacoes')}
                placeholder="Descreva a situação do beneficiário, descontos identificados, instituição, documentos e outras informações importantes."
              />
            </div>
          </div>
        </>
      )}
      </fieldset>
      {leadErr && <div className="kb-err" role="alert">{leadErr}</div>}
    </ModalV2>
  );
}

/* ================================================================
   Modal de detalhe — seções condicionais da v1 + FichaJudicialBox
   (componente v1 reusado INTEIRO no real — bytes idênticos) e
   RelacionamentoContatoBox. No demo, a ficha vira leitura semeada.
   ================================================================ */
function DetalheModalV2({ demo, l, colunas, eventosDemo, fichaDemoStatus, aoFechar, aoEditar, aoAbrirConversa }: {
  demo: boolean; l: KLead; colunas: KColuna[]; eventosDemo?: OppEvento[]; fichaDemoStatus?: string;
  aoFechar: () => void; aoEditar: () => void; aoAbrirConversa: () => void;
}) {
  const eventosQ = useOportunidadeEventos(demo ? null : l.id);
  const eventos = demo ? (eventosDemo ?? []) : (eventosQ.data ?? []);
  const etiquetasCat = useEtiquetas().data ?? [];
  const vrDet = valorRelevante(l);
  const colNome = (id: string | null) => (id ? colunas.find((c) => c.id === id)?.nome ?? '—' : '—');
  const temBenefServ = !!(l.tipoBeneficio || l.numeroBeneficio || l.instituicao || l.tipoServico !== 'analise_inicial' || l.tipoDesconto || l.dataInicioDesconto || mostraCancel(l.tipoServico) || mostraRess(l.tipoServico));
  const temValores = l.valorDescontoMensal != null || l.valorRessarcimentoEstimado != null || l.valorRessarcido != null || l.valor != null;

  const etapaCol = colunas.find((c) => c.id === l.colunaId);
  const dpDet = diasParado(l);
  const paradoDet = l.status === 'em_andamento' && (etapaCol?.resultado ?? 'neutro') === 'neutro' && dpDet >= LIMIAR_PARADO_DIAS;
  return (
    <DrawerV2 aberto aoFechar={aoFechar} largura={480}>
      <div className="cab">
        Detalhe do lead
        <button type="button" className="fechar-p" aria-label="Fechar" onClick={aoFechar}>×</button>
      </div>
      <div className="corpo">
        {/* v3 — cabeçalho do drawer: identidade + etapa + estagnação num relance */}
        <div className="kd-hero">
          <span className="kd-hero-av">{initials(l.nome)}</span>
          <div className="kd-hero-tx">
            <div className="kd-hero-nm" title={l.nome}>{tituloTelefone(l.nome) ?? nomeExibicao(l.nome)}{tituloTelefone(l.nome) && <i className="kc-semnome">· sem nome</i>}</div>
            <div className="kd-hero-sub">{[l.tipoBeneficio ? rotuloDe(TIPO_BENEFICIO, l.tipoBeneficio) : 'Benefício não informado', rotuloDe(TIPO_SERVICO, l.tipoServico)].join(' · ')}</div>
            <div className="kd-hero-meta">
              {etapaCol && <span className="kd-etapa"><span className="pt" style={{ background: etapaCol.cor }} />{etapaCol.nome}</span>}
              {l.status === 'ganho' && <span className="kd-flag ganho">Ganho</span>}
              {l.status === 'perdido' && <span className="kd-flag perdido">Perdido</span>}
              {paradoDet && <span className="kd-flag parado">parado {dpDet}d</span>}
            </div>
          </div>
        </div>
      <div className="kb-sec-h">Contato</div>
      <DetRow l="Nome" v={l.nome} />
      <DetRow l="Telefone" v={l.telefone} />
      <DetRow l="E-mail" v={l.email} />
      <DetRow l="Canal / chip" v={l.canalNome ? canalLabel(l.canalTipo) + ' · ' + l.canalNome + (l.canalNumero ? ' · ' + maskNum(l.canalNumero) : '') : (l.origem || null)} />
      <DetRow l="Responsável" v={l.respNome || 'Não atribuído'} />

      {temBenefServ && (
        <>
          <div className="kb-sec-h">Benefício e serviço</div>
          <DetRow l="Tipo de benefício" v={l.tipoBeneficio ? rotuloDe(TIPO_BENEFICIO, l.tipoBeneficio) : null} />
          <DetRow l="Número do benefício" v={l.numeroBeneficio} />
          <DetRow l="Instituição" v={l.instituicao} />
          <DetRow l="Serviço" v={l.tipoServico !== 'analise_inicial' ? rotuloDe(TIPO_SERVICO, l.tipoServico) : null} />
          {mostraCancel(l.tipoServico) && <DetRow l="Situação do cancelamento" v={rotuloDe(ST_CANCEL, l.statusCancelamento)} />}
          {mostraRess(l.tipoServico) && <DetRow l="Situação do ressarcimento" v={rotuloDe(ST_RESS, l.statusRessarcimento)} />}
          <DetRow l="Tipo de desconto" v={l.tipoDesconto} />
          <DetRow l="Início do desconto" v={l.dataInicioDesconto ? fmtData(l.dataInicioDesconto) : null} />
        </>
      )}

      {temValores && (
        <>
          <div className="kb-sec-h">Valores</div>
          <DetRow l="Valor mensal descontado" v={l.valorDescontoMensal != null ? fmtBRL(l.valorDescontoMensal) : null} />
          <DetRow l="Valor estimado do ressarcimento" v={l.valorRessarcimentoEstimado != null ? fmtBRL(l.valorRessarcimentoEstimado) : null} />
          <DetRow l="Valor já ressarcido" v={l.valorRessarcido != null ? fmtBRL(l.valorRessarcido) : null} />
          <DetRow l="Valor estimado genérico" v={l.valor != null ? fmtBRL(l.valor) : null} />
          <DetRow l="Valor relevante" v={vrDet.valor != null ? fmtBRL(vrDet.valor) + (vrDet.mensal ? ' /mês' : '') : null} />
        </>
      )}

      <div className="kb-sec-h">Organização</div>
      <DetRow l="Etapa" v={colNome(l.colunaId)} />
      <DetRow l="Lembrete no card" v={l.lembrete ? <span className="kd-lem"><IcSino />{l.lembrete}</span> : null} />
      {l.contatoEtiquetas.length > 0 && (
        <DetRow l="Etiquetas do cliente" v={<span className="kb-tags" style={{ justifyContent: 'flex-end' }}>{l.contatoEtiquetas.map((t) => { const cor = corDaEtiqueta(t, etiquetasCat); return <span key={t} className="kb-tag-ro" style={{ background: cor + '22', color: cor, borderColor: cor + '55' }}>{t}</span>; })}</span>} />
      )}
      {l.etiquetas.length > 0 && (
        <DetRow l="Etiquetas do caso" v={<span className="kb-tags" style={{ justifyContent: 'flex-end' }}>{l.etiquetas.map((t) => { const cor = corDaEtiqueta(t, etiquetasCat); return <span key={t} className="kb-tag-ro" style={{ background: cor + '22', color: cor, borderColor: cor + '55' }}>{t}</span>; })}</span>} />
      )}
      <DetRow l="Resumo do caso" v={l.observacoes ? <span className="kd-resumo">{l.observacoes}</span> : null} />

      {eventos.length > 0 && (
        <>
          <div className="kb-sec-h">Histórico comercial</div>
          <div className="kd-hist">
            {eventos.map((ev) => (
              <div key={ev.id} className={'kd-hist-item ' + ev.evento}>
                <div className="kd-hist-top">
                  <strong>{ev.evento === 'ganho' ? 'Fechado como ganho' : ev.evento === 'perdido' ? 'Marcado como perdido' : 'Reaberto'}</strong>
                  <span className="kd-hist-when num">{fmtDataHora(ev.criadoEm)}</span>
                </div>
                <div className="kd-hist-sub">{colNome(ev.colunaAnteriorId)} → {colNome(ev.colunaNovaId)}</div>
                {ev.evento === 'perdido' && ev.motivoPerda && <div className="kd-hist-sub">Motivo: {rotuloMotivoPerda(ev.motivoPerda)}</div>}
                {ev.evento === 'reaberto' && ev.motivoReabertura && <div className="kd-hist-sub">Motivo: {ev.motivoReabertura}</div>}
                <div className="kd-hist-sub">
                  Por: {ev.executadoPorNome || 'Importação / sistema'}
                  {ev.evento !== 'reaberto' ? ' · Responsável no fechamento: ' + (ev.respNoFechamentoNome || 'sem atribuição') : ''}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="kb-sec-h">Datas</div>
      <DetRow l="Criado em" v={fmtDataHora(l.criadoEm)} />
      <DetRow l="Atualizado em" v={fmtDataHora(l.atualizadoEm)} />

      <div className="kd-ficha">
        {demo && !fichaDemoDaOportunidade(l.id) ? (
          <div className="fjb">
            <div className="fjb-h">Ficha judicial</div>
            {fichaDemoStatus ? (
              <div className="fjb-card">
                <span className={'fjb-tag ' + (fichaDemoStatus === 'finalizada' ? 'finalizada' : 'rascunho')}>
                  {fichaDemoStatus === 'finalizada' ? 'Finalizada · v1' : 'Rascunho · v1'}
                </span>
                <div className="fjb-info">Modo demonstração: a ficha real (importar consulta, revisar e finalizar) fica no ambiente com backend.</div>
              </div>
            ) : (
              <div className="fjb-info">Importe a consulta do Promosys/iCred e gere a ficha judicial.</div>
            )}
          </div>
        ) : (
          <FichaJudicialBox
            contatoId={l.contatoId}
            oportunidadeId={l.id}
            conversaId={l.conversaOrigemId}
            canalId={l.canalOrigemId}
            responsavelSugerido={{ id: l.respId, nome: l.respNome }}
            contatoAtual={{ nome: l.nome, telefone: l.telefone, email: l.email }}
            oportunidadeAtual={{ tipoBeneficio: l.tipoBeneficio, numeroBeneficio: l.numeroBeneficio, instituicao: l.instituicao }}
          />
        )}
      </div>
      {!demo && (
        <div className="kd-ficha">
          <RelacionamentoContatoBox contatoId={l.contatoId} conversaId={l.conversaOrigemId} canalId={l.canalOrigemId} />
        </div>
      )}
      </div>
      <div className="kd-foot">
        <BotaoSec onClick={aoFechar}>Fechar</BotaoSec>
        {l.conversaOrigemId && <BotaoSec onClick={aoAbrirConversa}>Abrir conversa</BotaoSec>}
        <BotaoPrimario onClick={aoEditar}>Editar</BotaoPrimario>
      </div>
    </DrawerV2>
  );
}
