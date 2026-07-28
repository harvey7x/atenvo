import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
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
import { useFichasStatusDeOportunidades } from '@/data/fichaJudicial';
import { useSlaAlertas } from '@/data/sla';
import { indexPorChave, tipoLabel, type SlaAlerta, type SlaTipo } from '@/data/slaView';
import { corDaEtiqueta, type Etiqueta } from '@/types/atendimento';
import { initials } from '@/lib/avatar';
import { FichaJudicialBox } from '@/components/FichaJudicialBox';
import { RelacionamentoContatoBox } from '@/components/RelacionamentoContatoBox';
import { useBloqueiosOrg } from '../hooks/bloqueiosOrg';
import { BotaoPrimario, BotaoSec, ModalV2 } from '../components';
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
const chipDe = (l: KLead) => l.canalNome || l.origem || null;
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
function mergeTags(a: string[], b: string[]): string[] {
  const vis = new Set<string>();
  const out: string[] = [];
  for (const t of [...a, ...b]) {
    const k = t.trim().toLowerCase();
    if (!k || vis.has(k)) continue;
    vis.add(k);
    out.push(t);
  }
  return out;
}
/** Estagnação NÃO vira chip de SLA no card (v1): "Parado há X d" e "2 dias estourado" mediam a mesma coisa. */
const SLA_OCULTO_NO_CARD = new Set<SlaTipo>(['parado_ha_muito_tempo', 'prazo_2_dias_estourado', 'prazo_2_dias_em_risco']);
const slaChipTexto = (tipo: SlaTipo, movimentadoEm: string) =>
  tipo === 'parado_ha_muito_tempo' ? `Parado ${haDe(movimentadoEm)}`
  : tipo === 'prazo_2_dias_em_risco' ? 'Prazo em risco'
  : tipo === 'prazo_2_dias_estourado' ? '2 dias estourado'
  : tipo === 'lead_quente_aguardando' ? 'Lead quente'
  : tipo === 'cliente_qualificado_aguardando_atendimento' ? 'Qualificado aguardando'
  : tipoLabel(tipo);

/** LIMIAR DECLARADO da estagnação visual (trilho rubro + "parado Xd"):
    7 dias sem trocar de coluna (movimentadoEm), só em lead aberto em coluna neutra. */
const LIMIAR_PARADO_DIAS = 7;
const diasParado = (l: KLead) => {
  const base = l.movimentadoEm || l.entradaEm || l.criadoEm;
  if (!base) return 0;
  const d = Math.floor((Date.now() - new Date(base).getTime()) / 86_400_000);
  return Number.isFinite(d) && d > 0 ? d : 0;
};

/** Soma compacta do cabeçalho da coluna (mockup: "R$ 11,7k"). */
const somaCompacta = (v: number) =>
  v >= 1000 ? `R$ ${(v / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}k` : fmtBRL(v);

interface LeadForm {
  colunaId: string; contatoId: string; conversaOrigemId: string; canalOrigemId: string;
  canalTipo: string; canalNome: string; canalNumero: string;
  nome: string; telefone: string; email: string; respId: string; origem: string;
  tipoBeneficio: string; tipoServico: string; statusCancelamento: string; statusRessarcimento: string;
  numeroBeneficio: string; instituicao: string; tipoDesconto: string; dataInicioDesconto: string;
  valorDescontoMensal: string; valorRessarcimentoEstimado: string; valorRessarcido: string; valorEstimado: string;
  etiquetas: string[]; observacoes: string;
}
const FORM0: LeadForm = {
  colunaId: '', contatoId: '', conversaOrigemId: '', canalOrigemId: '', canalTipo: '', canalNome: '', canalNumero: '',
  nome: '', telefone: '', email: '', respId: '', origem: 'Manual',
  tipoBeneficio: '', tipoServico: 'analise_inicial', statusCancelamento: 'nao_se_aplica', statusRessarcimento: 'nao_se_aplica',
  numeroBeneficio: '', instituicao: '', tipoDesconto: '', dataInicioDesconto: '',
  valorDescontoMensal: '', valorRessarcimentoEstimado: '', valorRessarcido: '', valorEstimado: '',
  etiquetas: [], observacoes: '',
};

const Ic = ({ children }: { children: ReactNode }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{children}</svg>
);
const IcBusca = () => <Ic><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></Ic>;
const IcMais = () => <Ic><path d="M12 5v14M5 12h14" /></Ic>;
const IcPontos = () => <Ic><circle cx="12" cy="5" r="1.4" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" /><circle cx="12" cy="19" r="1.4" fill="currentColor" stroke="none" /></Ic>;
const IcKb = () => <Ic><rect x="3" y="4" width="5" height="16" rx="1.4" /><rect x="10" y="4" width="5" height="10" rx="1.4" /><rect x="17" y="4" width="5" height="13" rx="1.4" /></Ic>;

type Aviso = { tom: 'ok' | 'erro'; texto: string } | null;

/* ---------- modo demonstração: seed + mutações em memória ---------- */
interface SeedKb {
  colunas: KColuna[];
  leads: KLead[];
  naoLidas: Record<string, number>;
  sla: SlaAlerta[];
  fichaStatus: Record<string, string>;
  eventos: Record<string, OppEvento[]>;
  bloqueados: Set<string>;
  contatos: ContatoRow[];
}
function leadDemo(n: Partial<KLead> & { id: string; nome: string; colunaId: string }): KLead {
  const agora = new Date().toISOString();
  return {
    contatoId: null, conversaOrigemId: null, canalOrigemId: null, telefone: '', email: '',
    respId: null, respNome: '', valor: null, origem: 'WhatsApp', etiquetas: [], observacoes: '', ordem: 0,
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
    leadDemo({ id: 'kl-1', nome: 'Ivone F. Cardoso', colunaId: 'kc-1', contatoId: 'kct-1', conversaOrigemId: 'kcv-1', respNome: 'Juliana', respId: 'u-mock', valorDescontoMensal: 130, tipoServico: 'cancelamento', statusCancelamento: 'nao_iniciado', instituicao: 'Banco Pan', criadoEm: iso(agora - 2 * h), atualizadoEm: iso(agora - 2 * h), movimentadoEm: iso(agora - 2 * h), contatoEtiquetas: ['Idoso'] }),
    leadDemo({ id: 'kl-2', nome: 'Sebastião R. Nunes', colunaId: 'kc-1', contatoId: 'kct-2', valor: 1300, atualizadoEm: iso(agora - 5 * h), movimentadoEm: iso(agora - 5 * h) }),
    leadDemo({ id: 'kl-3', nome: 'Maria Aparecida Souza', colunaId: 'kc-2', contatoId: 'kct-3', conversaOrigemId: 'kcv-3', respNome: 'Juliana', respId: 'u-mock', tipoServico: 'cancelamento_ressarcimento', statusCancelamento: 'em_analise', statusRessarcimento: 'em_analise', valorRessarcimentoEstimado: 4800, instituicao: 'BMG', numeroBeneficio: '123.456.789-0', etiquetas: ['Urgente'], atualizadoEm: iso(agora - 12 * 60_000), movimentadoEm: iso(agora - 12 * 60_000), prioridade: 'alta' }),
    leadDemo({ id: 'kl-4', nome: 'Terezinha M. Alves', colunaId: 'kc-2', contatoId: 'kct-4', respNome: 'Matheus', valor: 1300, atualizadoEm: iso(agora - 3 * h), movimentadoEm: iso(agora - 3 * h) }),
    leadDemo({ id: 'kl-5', nome: 'Antônio Pereira Lima', colunaId: 'kc-3', contatoId: 'kct-5', respNome: 'Juliana', respId: 'u-mock', tipoServico: 'ressarcimento', statusRessarcimento: 'solicitado', valorRessarcimentoEstimado: 6200, instituicao: 'Banco Pan', atualizadoEm: iso(agora - 24 * h), movimentadoEm: iso(agora - 24 * h) }),
    leadDemo({ id: 'kl-6', nome: 'José Carlos Ferreira', colunaId: 'kc-3', contatoId: 'kct-6', respNome: 'Matheus', valor: 1300, tipoBeneficio: 'pensao_por_morte', atualizadoEm: iso(agora - 9 * 24 * h), movimentadoEm: iso(agora - 9 * 24 * h) }),
    leadDemo({ id: 'kl-7', nome: 'Neusa B. Martins', colunaId: 'kc-4', contatoId: 'kct-7', respNome: 'Juliana', respId: 'u-mock', valorDescontoMensal: 96.4, tipoServico: 'cancelamento', statusCancelamento: 'solicitado', tipoDesconto: 'mensalidade associativa', dataInicioDesconto: '2024-03-01', atualizadoEm: iso(agora - 2 * 24 * h), movimentadoEm: iso(agora - 2 * 24 * h) }),
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
  const [menu, setMenu] = useState<{ kind: 'card' | 'col'; id: string } | null>(null);
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
  const fichaStatusMap = demo ? seed.fichaStatus : (fichaStatusQ.data ?? {});
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
      l.respNome, l.canalNome, ...l.etiquetas, ...l.contatoEtiquetas,
    ].filter(Boolean).join(' ').toLowerCase();
    if (hay.includes(term)) return true;
    return termDig.length >= 3 && (l.telefone ?? '').replace(/\D/g, '').includes(termDig);
  };
  const leadsVisiveis = useMemo(() => leads.filter(matchBusca), [leads, term, termDig]); // eslint-disable-line react-hooks/exhaustive-deps
  // severidade máxima de SLA por lead, uma vez por render (386 cards no real: o sort não pode realocar por comparação)
  const SEV_PESO: Record<string, number> = { imediato: 5, critico: 4, vermelho: 3, amarelo: 2, leve: 1 };
  const sevPorLead = useMemo(() => {
    const m = new Map<string, number>();
    for (const [id, alertas] of slaPorOpp) m.set(id, Math.max(0, ...alertas.map((a) => SEV_PESO[a.severidade] ?? 0)));
    return m;
  }, [slaPorOpp]); // eslint-disable-line react-hooks/exhaustive-deps
  const semResultado = term !== '' && leadsVisiveis.length === 0 && leads.length > 0;
  const vazioFunil = leads.length === 0 && colunas.length > 0;

  const abertos = leads.filter((l) => l.status === 'em_andamento');
  const somaPotencial = abertos.reduce((s, l) => s + (valorRelevante(l).valor ?? 0), 0);

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

  /* menu fecha em qualquer clique global (v1) */
  useEffect(() => {
    if (!menu) return;
    const f = () => setMenu(null);
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
    if (!leads.some((l) => l.id === oid)) return; // ainda não carregado: tenta de novo quando k.leads chegar
    setDetId(oid);
    setDestaque(oid);
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
    if (demo) { demoMover(p.id, p.colunaId, p); return; }
    await k.moverOportunidade(p);
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
      etiquetas: l.etiquetas, observacoes: l.observacoes,
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
      observacoes: lf.observacoes || null,
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
              etiquetas: lf.etiquetas, observacoes: lf.observacoes, tipoBeneficio: lf.tipoBeneficio || null,
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
          observacoes: lf.observacoes, tipoBeneficio: lf.tipoBeneficio || null, tipoServico: lf.tipoServico,
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

  /* ---------- estados de página ---------- */
  if (!demo && k.loading) {
    return <div className="kb-pg"><div className="kb-info">Carregando funil…</div></div>;
  }
  if (!demo && k.isError) {
    return (
      <div className="kb-pg">
        <div className="kb-info erro" role="alert">
          Não foi possível carregar o Kanban. Tente atualizar a página.
          <button type="button" className="link" onClick={() => k.refetch()}>Atualizar</button>
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
          <p className="num">
            {abertos.length} lead{abertos.length === 1 ? '' : 's'} ativo{abertos.length === 1 ? '' : 's'}
            {somaPotencial > 0 ? ` · ${fmtBRL(somaPotencial)} em potencial` : ''}
            {demo ? ' · modo demonstração (nada é gravado)' : ''}
          </p>
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
            const cardsCol = leadsVisiveis.filter((l) => colunaDoLead(l) === col.id);
            const todosCol = leads.filter((l) => colunaDoLead(l) === col.id);
            const soma = todosCol.reduce((s, l) => s + (valorRelevante(l).valor ?? 0), 0);
            return (
              <div
                key={col.id}
                className={'kb-col sobe' + (hoverCol === col.id ? ' col-drop' : '') + (colArrastando === col.id ? ' arrastando' : '')}
                style={{ animationDelay: `${0.08 + Math.min(i, 5) * 0.07}s` }}
                onDragOver={(e) => { if (dragColId.current && dragColId.current !== col.id) { e.preventDefault(); setHoverCol(col.id); } }}
                onDrop={(e) => { if (dragColId.current) { e.preventDefault(); e.stopPropagation(); soltarColuna(col.id); } }}
              >
                <div
                  className="kb-cab"
                  draggable={podeConfig && !col.entrada}
                  onDragStart={(e) => {
                    if (!podeConfig || col.entrada) { e.preventDefault(); return; }
                    dragColId.current = col.id;
                    setColArrastando(col.id);
                    try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', col.id); } catch { /* alguns navegadores */ }
                  }}
                  onDragEnd={() => { dragColId.current = null; setColArrastando(null); setHoverCol(null); }}
                >
                  <span className="pt2" style={{ background: col.cor }} />
                  <span className="n" title={col.nome}>{col.nome}</span>
                  {col.entrada && <span className="tag-entrada" title="Coluna de entrada — recebe novos leads dos canais">entrada</span>}
                  <span className="q num">{todosCol.length}</span>
                  {soma > 0 && <span className="s2 num">{somaCompacta(soma)}</span>}
                  {podeConfig && (
                    <span className="kb-menu-wrap">
                      <button type="button" className="mbtn" aria-label={'Ações da coluna ' + col.nome} onClick={(e) => { e.stopPropagation(); setMenu(menu?.kind === 'col' && menu.id === col.id ? null : { kind: 'col', id: col.id }); }}>
                        <IcPontos />
                      </button>
                      {menu?.kind === 'col' && menu.id === col.id && (
                        <div className="kb-menu" role="menu" onClick={(e) => e.stopPropagation()}>
                          <button type="button" className="it" onClick={() => { setMenu(null); abrirEditarColuna(col); }}>Renomear / cor</button>
                          {!col.entrada && <button type="button" className="it perigo" onClick={() => { setMenu(null); pedirExcluirColuna(col); }}>Excluir</button>}
                        </div>
                      )}
                    </span>
                  )}
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
                  {cardsCol
                    .slice()
                    .sort((a, b) => {
                      const sa = sevPorLead.get(a.id) ?? 0;
                      const sb = sevPorLead.get(b.id) ?? 0;
                      if (sa !== sb) return sb - sa;
                      const pa = a.prioridade === 'alta' ? 1 : 0;
                      const pb = b.prioridade === 'alta' ? 1 : 0;
                      if (pa !== pb) return pb - pa;
                      return a.ordem - b.ordem;
                    })
                    .map((l) => (
                      <CardKc
                        key={l.id} l={l} colunas={colunas} colunaAtual={col.id} etiquetas={etiquetas}
                        naoLidas={naoLidasMap[l.contatoId ?? ''] ?? 0}
                        sla={(slaPorOpp.get(l.id) ?? []).filter((a) => !SLA_OCULTO_NO_CARD.has(a.tipo))}
                        fichaStatus={fichaStatusMap[l.id]}
                        optout={!!l.contatoId && bloqueados.has(l.contatoId)}
                        moving={optim[l.id] !== undefined}
                        arrastando={dragando === l.id}
                        destacado={destaque === l.id}
                        menuAberto={menu?.kind === 'card' && menu.id === l.id}
                        aoRef={(el) => { cardRefs.current[l.id] = el; }}
                        aoClicar={() => setDetId(l.id)}
                        aoMenu={() => setMenu(menu?.kind === 'card' && menu.id === l.id ? null : { kind: 'card', id: l.id })}
                        aoEditar={() => { setMenu(null); abrirEditarLead(l); }}
                        aoMover={(cid) => { setMenu(null); mover(l.id, cid); }}
                        aoArquivar={() => { setMenu(null); arquivar(l); }}
                        aoDragStart={(e) => {
                          if (optim[l.id]) { e.preventDefault(); return; }
                          dragId.current = l.id;
                          setDragando(l.id);
                          try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', l.id); } catch { /* ok */ }
                        }}
                        aoDragEnd={() => { pararAutoScroll(); dragId.current = null; setDragando(null); setHover(null); }}
                      />
                    ))}
                  {hover === col.id && dragando && <div className="fantasma" aria-hidden />}
                  {cardsCol.length === 0 && hover !== col.id && <div className="kb-vazia">Sem leads</div>}
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

      {/* ---------- modal coluna (criar/editar) ---------- */}
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
   Card .kc — pele do mockup (trilho, av3, t3) com o conteúdo da v1.
   Trilho: .parado = estagnação client-side (LIMIAR_PARADO_DIAS sem
   trocar de coluna, lead aberto em coluna neutra); .quente = alerta
   SLA de lead quente ativo.
   ================================================================ */
function CardKc({ l, colunas, etiquetas, naoLidas, sla, fichaStatus, optout, moving, arrastando, destacado, menuAberto, colunaAtual, aoRef, aoClicar, aoMenu, aoEditar, aoMover, aoArquivar, aoDragStart, aoDragEnd }: {
  l: KLead; colunaAtual: string; colunas: KColuna[]; etiquetas: Etiqueta[]; naoLidas: number;
  sla: SlaAlerta[]; fichaStatus: string | undefined; optout: boolean; moving: boolean; arrastando: boolean;
  destacado: boolean; menuAberto: boolean;
  aoRef: (el: HTMLDivElement | null) => void; aoClicar: () => void; aoMenu: () => void;
  aoEditar: () => void; aoMover: (colId: string) => void; aoArquivar: () => void;
  aoDragStart: (e: DragEvent) => void; aoDragEnd: () => void;
}) {
  const vr = valorRelevante(l);
  const tags = mergeTags(l.contatoEtiquetas, l.etiquetas);
  const colAtual = colunas.find((c) => c.id === l.colunaId);
  const parado = l.status === 'em_andamento' && (colAtual?.resultado ?? 'neutro') === 'neutro' && diasParado(l) >= LIMIAR_PARADO_DIAS;
  const quente = sla.some((a) => a.tipo === 'lead_quente_aguardando');
  const servLbl = l.tipoServico !== 'analise_inicial' ? rotuloDe(TIPO_SERVICO, l.tipoServico) : '';
  const sub = [l.tipoBeneficio ? rotuloDe(TIPO_BENEFICIO, l.tipoBeneficio) : '', servLbl].filter(Boolean).join(' · ');
  const chip = chipDe(l);

  return (
    <div
      ref={aoRef}
      className={'kc' + (parado ? ' parado' : quente ? ' quente' : '') + (arrastando ? ' drag' : '') + (moving ? ' moving' : '') + (destacado ? ' destaque' : '')}
      draggable={!moving}
      onClick={aoClicar}
      onDragStart={aoDragStart}
      onDragEnd={aoDragEnd}
    >
      <div className="topo">
        <div className="n" title={l.nome}>{l.nome}</div>
        {l.status === 'ganho' && <span className="flag ganho" title="Fechado como ganho">Ganho</span>}
        {l.status === 'perdido' && <span className="flag perdido" title={'Perdido' + (l.motivoPerda ? ' · ' + rotuloMotivoPerda(l.motivoPerda) : '')}>Perdido</span>}
        <span className="kb-menu-wrap">
          <button type="button" className="mbtn" aria-label={'Ações do lead ' + l.nome} onClick={(e) => { e.stopPropagation(); aoMenu(); }}>
            <IcPontos />
          </button>
          {menuAberto && (
            <div className="kb-menu" role="menu" onClick={(e) => e.stopPropagation()}>
              <button type="button" className="it" onClick={aoEditar}>Editar</button>
              <div className="sep">Mover para</div>
              {colunas.filter((c) => c.id !== colunaAtual).map((c) => (
                <button key={c.id} type="button" className="it" onClick={() => aoMover(c.id)}>
                  <span className="pt" style={{ background: c.cor }} />{c.nome}
                </button>
              ))}
              <button type="button" className="it perigo" onClick={aoArquivar}>Arquivar</button>
            </div>
          )}
        </span>
      </div>
      {sub && <div className="sub" title={sub}>{sub}</div>}
      {l.instituicao && <div className="inst" title={l.instituicao}>{l.instituicao}</div>}
      {(chip || optout) && (
        <div className="meta">
          {chip && <span className="chip" title={chip}>{chip}</span>}
          {optout && <span className="optout" title="Contato marcado como não incomodar — mensagens bloqueadas.">Não incomodar</span>}
        </div>
      )}
      {vr.valor != null && <div className="v num">{fmtBRL(vr.valor)}{vr.mensal && <span className="mes"> /mês</span>}</div>}
      {tags.length > 0 && (
        <div className="tags" title={tags.join(', ')}>
          {tags.slice(0, 3).map((t) => {
            const cor = corDaEtiqueta(t, etiquetas);
            return <span key={t} className="tag" style={{ background: cor + '22', color: cor, borderColor: cor + '55' }}>{t}</span>;
          })}
          {tags.length > 3 && <span className="tag mais">+{tags.length - 3}</span>}
        </div>
      )}
      {(sla.length > 0 || l.prioridade === 'alta') && (
        <div className="slas">
          {sla.map((a) => (
            <span key={a.id} className={'sla-chip s-' + a.severidade} title={a.detalhe ?? a.titulo}>{slaChipTexto(a.tipo, l.movimentadoEm)}</span>
          ))}
          {l.prioridade === 'alta' && <span className="sla-chip prio" title="Prioridade alta">⭐ Prioridade alta</span>}
        </div>
      )}
      <div className="r">
        <span className="av3" title={l.nome}>
          {initials(l.nome)}
          {naoLidas > 0 && <i className="naolidas num" title={naoLidas + ' mensagem(ns) nova(s) do cliente'} aria-label={naoLidas + ' mensagens novas'}>{Math.min(naoLidas, 99)}</i>}
        </span>
        <span className="resp" title={l.respNome || 'Não atribuído'}>{l.respNome || 'Não atribuído'}</span>
        {fichaStatus && <span className={'ficha-tag ' + fichaStatus}>{fichaStatus === 'finalizada' ? 'Ficha finalizada' : 'Ficha em rascunho'}</span>}
        <span className={'t3 num' + (parado ? ' al' : '')}>{parado ? `parado ${diasParado(l)}d` : haDe(l.atualizadoEm || l.criadoEm)}</span>
      </div>
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

  return (
    <ModalV2
      aberto
      aoFechar={aoFechar}
      largura={520}
      titulo={
        <span>
          {l.nome}
          <div className="kb-modal-sub">
            {[l.tipoBeneficio ? rotuloDe(TIPO_BENEFICIO, l.tipoBeneficio) : 'Benefício não informado', rotuloDe(TIPO_SERVICO, l.tipoServico)].join(' · ')}
          </div>
        </span>
      }
      rodape={
        <>
          <BotaoSec onClick={aoFechar}>Fechar</BotaoSec>
          {l.conversaOrigemId && <BotaoSec onClick={aoAbrirConversa}>Abrir conversa</BotaoSec>}
          <BotaoPrimario onClick={aoEditar}>Editar</BotaoPrimario>
        </>
      }
    >
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
        {demo ? (
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
    </ModalV2>
  );
}
