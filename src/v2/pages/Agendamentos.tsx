import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrg } from '@/context/OrgContext';
import { useOrgUsuarios } from '@/data/atendimento';
import { useBuscaContatos } from '@/data/contatos';
import {
  useWaCanais, useAgendamentosOrg, useEditarAgendamento, useCancelarAgendamento,
  useReagendarAgendamento, useAgendarSequencia, conversaAtivaDoContato, WA_REAL,
  type AgendamentoOrg,
} from '@/data/whatsapp';
import { rangePeriodo, agendaEditavel, agendaReagendavel, statusSequencia, type PeriodoAg } from '@/lib/agendamentoMensagem';
import {
  BadgeStatus, BotaoMini, BotaoPrimario, BotaoSec, CardCab, CardVidro, ConfirmDialogV2, DrawerV2,
  EstadoErro, EstadoVazio, Input, Kpi, ModalV2, Segmentado, Skeleton, TabelaPadrao, TrilhoItem,
  type Coluna, type TomStatus,
} from '../components';
import { AgendarMensagemModalV2, type AgendarSubmit, type CanalOpcao } from './AgendarMensagemModalV2';
import { dataHoraSP as fmtSP, tempoCelula as quandoCelula } from '../lib/tempo';
import './agendamentos.css';

/* ------------------------------------------------------------------
   Central de mensagens agendadas — funcional REAL do v1
   (AgendamentosMensagens.tsx, somente leitura), vestido nos padrões
   do mockup. O pg-agendamentos (calendário) NÃO é o layout daqui.
   ------------------------------------------------------------------ */

/* Mapeamento de status → semântica Platina (justificado no reporte):
   agendada=neutro (espera é o estado normal da central) ·
   processando=âmbar (transitório em andamento) · enviada=verde ·
   parcial=âmbar (sequência mista pede olhar) · falha/falhou=rubro ·
   bloqueada=rubro (impedida por regra; exige ação) ·
   cancelada=neutro (decisão humana, encerrada) ·
   expirada=âmbar (não saiu no prazo; atenção, não perda ativa). */
const ST_META: Record<string, { label: string; tom: TomStatus }> = {
  agendada:    { label: 'Programada', tom: 'neutro' },
  processando: { label: 'Enviando…',  tom: 'atencao' },
  enviada:     { label: 'Enviada',    tom: 'ok' },
  parcial:     { label: 'Parcial',    tom: 'atencao' },
  falha:       { label: 'Falha',      tom: 'erro' },
  falhou:      { label: 'Falhou',     tom: 'erro' },
  bloqueada:   { label: 'Bloqueada',  tom: 'erro' },
  cancelada:   { label: 'Cancelada',  tom: 'neutro' },
  expirada:    { label: 'Expirada',   tom: 'atencao' },
};
const stMeta = (s: string) => ST_META[s] ?? { label: s, tom: 'neutro' as TomStatus };
const TIPO_LABEL: Record<string, string> = { texto: 'Texto', imagem: 'Imagem', audio: 'Áudio', video: 'Vídeo', documento: 'Documento', texto_midia: 'Texto + mídia' };
const tipoLbl = (t: string) => TIPO_LABEL[t] ?? t;

/** Um agendamento operacional: mensagem avulsa OU uma sequência inteira (agrupada) — como no v1. */
interface Grupo {
  key: string;
  itens: AgendamentoOrg[];
  primeiro: AgendamentoOrg;
  count: number;
  ehSequencia: boolean;
  statusGeral: string;
  tentativas: number;
  contatoNome: string | null; telefone: string | null; nomeCanal: string | null; canalId: string;
  criadoPor: string | null; criadoEm: string; conversaId: string;
}

const ABAS: { id: string; label: string; status: string; vazio: string }[] = [
  { id: 'visao', label: 'Visão geral', status: '',          vazio: 'Nenhum agendamento por aqui.' },
  { id: 'prog',  label: 'Programados', status: 'agendada',  vazio: 'Nada na fila — nenhuma mensagem esperando para sair.' },
  { id: 'env',   label: 'Enviados',    status: 'enviada',   vazio: 'Nenhuma mensagem agendada foi enviada ainda.' },
  { id: 'fal',   label: 'Falhas',      status: 'falha',     vazio: 'Nenhuma falha. Todo agendamento saiu como devia.' },
  { id: 'blk',   label: 'Bloqueados',  status: 'bloqueada', vazio: 'Nenhum agendamento bloqueado.' },
  { id: 'can',   label: 'Cancelados',  status: 'cancelada', vazio: 'Nenhum agendamento cancelado.' },
];

/* ---------- modo demonstração: seed + mutações em memória ---------- */

const CANAIS_DEMO: CanalOpcao[] = [
  { id: 'canal-demo-1', alias: 'LUIZA', numero: '5551990000000', status: 'conectado', envioRestrito: false, conflitoCom: null },
  { id: 'canal-demo-2', alias: 'ANDRIUS', numero: '5551980000000', status: 'conectado', envioRestrito: false, conflitoCom: null },
];

function seedAgendamentos(): AgendamentoOrg[] {
  const mk = (deltaMin: number) => new Date(Date.now() + deltaMin * 60_000).toISOString();
  const base = (i: number, extra: Partial<AgendamentoOrg>): AgendamentoOrg => ({
    id: `ag-${i}`, conversaId: `conv-${i}`, contatoId: `ct-${i}`, contatoNome: null, telefone: null,
    canalId: 'canal-demo-1', nomeCanal: 'LUIZA', tipo: 'texto', texto: null, nomeArquivo: null,
    executarEm: mk(60), status: 'agendada', tentativas: 0, ultimoErro: null, motivoBloqueio: null,
    criadoPor: null, criadoEm: mk(-1440), enviadaEm: null, mensagemIdEnviada: null,
    sequenciaId: null, ordemNaSequencia: null, ...extra,
  });
  const dia = (d: number, hh: number, mi = 0) => { const x = new Date(); x.setDate(x.getDate() + d); x.setHours(hh, mi, 0, 0); return x.toISOString(); };
  return [
    // sequência de 3 (1 enviada hoje, 2 programadas hoje) — Maria
    base(1, { sequenciaId: 'seq-1', ordemNaSequencia: 1, contatoNome: 'Maria Aparecida Souza', telefone: '(51) 98812-4407', texto: 'Bom dia, dona Maria! Passando para lembrar da nossa ligação.', status: 'enviada', enviadaEm: mk(-30), executarEm: mk(-30), tentativas: 1 }),
    base(2, { sequenciaId: 'seq-1', ordemNaSequencia: 2, contatoNome: 'Maria Aparecida Souza', telefone: '(51) 98812-4407', texto: 'Segue o passo a passo para conferir o desconto no aplicativo Meu INSS.', executarEm: mk(90) }),
    base(3, { sequenciaId: 'seq-1', ordemNaSequencia: 3, contatoNome: 'Maria Aparecida Souza', telefone: '(51) 98812-4407', tipo: 'documento', nomeArquivo: 'passo-a-passo.pdf', texto: '', executarEm: mk(150) }),
    // programadas: hoje, amanhã e ao longo da semana
    base(4, { contatoNome: 'José Carlos Ferreira', telefone: '(51) 99214-8830', texto: 'Seu José, conseguiu acessar o aplicativo?', executarEm: mk(240) }),
    base(9, { contatoNome: 'Neusa B. Martins', telefone: '(51) 98444-2211', texto: 'Dona Neusa, os documentos chegaram direitinho.', executarEm: dia(1, 9, 0) }),
    base(10, { contatoNome: 'Raimundo A. Silva', telefone: '(51) 99555-7788', texto: 'Seu Raimundo, bom dia! Podemos falar amanhã?', executarEm: dia(1, 14, 30), nomeCanal: 'ANDRIUS', canalId: 'canal-demo-2' }),
    base(11, { contatoNome: 'Aparecida L. Rocha', telefone: '(51) 98777-3344', texto: 'Dona Aparecida, sua consulta de acompanhamento.', executarEm: dia(3, 10, 0) }),
    base(12, { contatoNome: 'Devanir S. Prado', telefone: '(51) 99666-1122', texto: 'Seu Devanir, novidades do seu processo.', executarEm: dia(5, 11, 0) }),
    // enviadas
    base(5, { contatoNome: 'Antônio Pereira Lima', telefone: '(51) 98120-7745', texto: 'Sr. Antônio, sua ligação de orientação é amanhã às 10h.', status: 'enviada', enviadaEm: mk(-1200), executarEm: mk(-1200), tentativas: 1 }),
    // precisa de ação: 2 falhas + 1 bloqueada
    base(6, { contatoNome: 'Terezinha M. Alves', telefone: '(51) 99760-3312', texto: 'Dona Terezinha, tudo bem?', status: 'falhou', ultimoErro: 'Número não está no WhatsApp.', executarEm: mk(-2000), tentativas: 3, nomeCanal: 'ANDRIUS', canalId: 'canal-demo-2' }),
    base(13, { contatoNome: 'Cleusa M. Barros', telefone: '(51) 98333-9900', texto: 'Dona Cleusa, seguem as orientações combinadas.', status: 'falhou', ultimoErro: 'Canal desconectado no horário do envio.', executarEm: mk(-800), tentativas: 2 }),
    base(7, { contatoNome: 'Sebastião R. Nunes', telefone: '(51) 98455-1029', texto: 'Seu Sebastião, o documento chegou.', status: 'bloqueada', motivoBloqueio: 'Contato pediu para não receber mensagens (opt-out).', executarEm: mk(-500) }),
    base(8, { contatoNome: 'Ivone F. Cardoso', telefone: '(51) 99331-6688', texto: 'Dona Ivone, confirmando nosso horário.', status: 'cancelada', executarEm: mk(-3000) }),
  ];
}

/** Dia SP (yyyy-mm-dd) de um ISO — agregações do painel são todas client-side. */
const diaSP = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
const horaSP = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });

type Aviso = { tom: 'ok' | 'erro'; texto: string } | null;

export default function AgendamentosV2() {
  const navigate = useNavigate();
  const { currentOrg } = useOrg();
  const demo = !WA_REAL;

  const canaisQ = useWaCanais();
  const canaisReais = canaisQ.data ?? [];
  const canais: CanalOpcao[] = demo ? CANAIS_DEMO : canaisReais;
  const orgUsuarios = useOrgUsuarios().data ?? [];
  const nomePorId = (id: string | null) => (id ? orgUsuarios.find((u) => u.id === id)?.nome ?? null : null);

  const rowsQ = useAgendamentosOrg();
  const [demoRows, setDemoRows] = useState<AgendamentoOrg[]>(() => (demo ? seedAgendamentos() : []));
  const rows = useMemo(() => (demo ? demoRows : rowsQ.data ?? []), [demo, demoRows, rowsQ.data]);

  const editarMut = useEditarAgendamento();
  const cancelarMut = useCancelarAgendamento();
  const reagendarMut = useReagendarAgendamento();
  const criarSeqMut = useAgendarSequencia();

  // agrupamento por sequencia_id (senão pelo próprio id) — idêntico ao v1
  const grupos = useMemo<Grupo[]>(() => {
    const map = new Map<string, AgendamentoOrg[]>();
    for (const r of rows) {
      const k = r.sequenciaId ?? r.id;
      const arr = map.get(k); if (arr) arr.push(r); else map.set(k, [r]);
    }
    const out: Grupo[] = [];
    for (const [key, itens0] of map) {
      const itens = [...itens0].sort((a, b) => (a.ordemNaSequencia ?? 0) - (b.ordemNaSequencia ?? 0) || new Date(a.executarEm).getTime() - new Date(b.executarEm).getTime());
      const primeiro = itens.reduce((m, x) => new Date(x.executarEm).getTime() < new Date(m.executarEm).getTime() ? x : m, itens[0]);
      out.push({
        key, itens, primeiro, count: itens.length, ehSequencia: itens.length > 1,
        statusGeral: statusSequencia(itens.map((i) => i.status)),
        tentativas: itens.reduce((s, i) => s + (i.tentativas ?? 0), 0),
        contatoNome: primeiro.contatoNome, telefone: primeiro.telefone, nomeCanal: primeiro.nomeCanal, canalId: primeiro.canalId,
        criadoPor: primeiro.criadoPor, criadoEm: primeiro.criadoEm, conversaId: primeiro.conversaId,
      });
    }
    return out.sort((a, b) => new Date(b.primeiro.executarEm).getTime() - new Date(a.primeiro.executarEm).getTime());
  }, [rows]);

  // abas com contagens reais por status geral
  const [aba, setAba] = useState('visao');
  const contagens = useMemo(() => {
    const c: Record<string, number> = { visao: grupos.length };
    for (const a of ABAS) if (a.status) c[a.id] = grupos.filter((g) => g.statusGeral === a.status).length;
    return c;
  }, [grupos]);
  const abaAtual = ABAS.find((a) => a.id === aba) ?? ABAS[0];

  // filtros — os mesmos do v1 (+ fDia: filtro de apresentação do painel, client-side)
  const [fPeriodo, setFPeriodo] = useState<PeriodoAg>('todas');
  const [fCanal, setFCanal] = useState('');
  const [fCriador, setFCriador] = useState('');
  const [fTipo, setFTipo] = useState('');
  const [fBusca, setFBusca] = useState('');
  const [fDia, setFDia] = useState<string>(''); // yyyy-mm-dd (clique na barra da semana)
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  const filtroAtivo = fPeriodo !== 'todas' || !!fCanal || !!fCriador || !!fTipo || !!fBusca || !!fDia;
  function limpar() { setFPeriodo('todas'); setFCanal(''); setFCriador(''); setFTipo(''); setFBusca(''); setFDia(''); }

  const filtrados = useMemo(() => {
    const range = rangePeriodo(fPeriodo, Date.now());
    const busca = fBusca.trim().toLowerCase();
    return grupos.filter((g) => {
      if (range) { const ms = new Date(g.primeiro.executarEm).getTime(); if (ms < range.desdeMs || ms >= range.ateMs) return false; }
      if (abaAtual.status && g.statusGeral !== abaAtual.status) return false;
      if (fCanal && g.canalId !== fCanal) return false;
      if (fCriador && g.criadoPor !== fCriador) return false;
      if (fTipo && !g.itens.some((i) => i.tipo === fTipo)) return false;
      if (fDia && !g.itens.some((i) => diaSP(i.executarEm) === fDia)) return false;
      if (busca) {
        const alvo = `${g.contatoNome ?? ''} ${g.telefone ?? ''} ${g.itens.map((i) => i.texto ?? '').join(' ')}`.toLowerCase();
        if (!alvo.includes(busca)) return false;
      }
      return true;
    });
  }, [grupos, fPeriodo, abaAtual.status, fCanal, fCriador, fTipo, fBusca, fDia]);

  // seleção (painel lateral), composição, confirmação
  const [selKey, setSelKey] = useState<string | null>(null);
  const sel = useMemo(() => filtrados.find((g) => g.key === selKey) ?? null, [filtrados, selKey]);
  const [comp, setComp] = useState<{ modo: 'criar' | 'editar' | 'reagendar'; item?: AgendamentoOrg; conversaId?: string; canalId?: string; temTelefone?: boolean } | null>(null);
  const [novoAberto, setNovoAberto] = useState(false);
  const [buscaContato, setBuscaContato] = useState('');
  const [novoErr, setNovoErr] = useState<string | null>(null);
  const contatosQ = useBuscaContatos(buscaContato);
  const [confirmar, setConfirmar] = useState<{ titulo: string; texto: string; rotulo: string; acao: () => Promise<void> } | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [aviso, setAviso] = useState<Aviso>(null);

  /* ações unificadas: mutations reais OU seed demo (mesmos fluxos de UI) */
  const acoes = {
    async criarSequencia(args: { conversaId: string; canalId: string; executarEm: string; itens: { tipo: string; texto: string; midia?: { nome: string } | null }[] }) {
      if (demo) {
        const seqId = args.itens.length > 1 ? `seq-${Date.now()}` : null;
        const nome = compDemoNome.current ?? 'Cliente demo';
        setDemoRows((l) => [...l, ...args.itens.map((it, i) => ({
          id: `ag-${Date.now()}-${i}`, conversaId: args.conversaId, contatoId: null, contatoNome: nome, telefone: '(51) 90000-0000',
          canalId: args.canalId, nomeCanal: CANAIS_DEMO.find((c) => c.id === args.canalId)?.alias ?? 'LUIZA',
          tipo: it.tipo, texto: it.texto || null, nomeArquivo: it.midia?.nome ?? null,
          executarEm: new Date(new Date(args.executarEm).getTime() + i * 60_000).toISOString(),
          status: 'agendada', tentativas: 0, ultimoErro: null, motivoBloqueio: null,
          criadoPor: null, criadoEm: new Date().toISOString(), enviadaEm: null, mensagemIdEnviada: null,
          sequenciaId: seqId, ordemNaSequencia: seqId ? i + 1 : null,
        }))]);
        return;
      }
      await criarSeqMut.mutateAsync(args);
    },
    async editar(args: { id: string; conversaId: string; canalId: string; texto: string; executarEm: string }) {
      if (demo) { setDemoRows((l) => l.map((r) => r.id === args.id ? { ...r, canalId: args.canalId, texto: args.texto, executarEm: args.executarEm } : r)); return; }
      await editarMut.mutateAsync(args);
    },
    async reagendar(args: { id: string; conversaId: string; canalId: string; executarEm: string }) {
      if (demo) { setDemoRows((l) => l.map((r) => r.id === args.id ? { ...r, canalId: args.canalId, executarEm: args.executarEm, status: 'agendada', ultimoErro: null, motivoBloqueio: null } : r)); return; }
      await reagendarMut.mutateAsync(args);
    },
    async cancelar(args: { id: string; conversaId: string }) {
      if (demo) { setDemoRows((l) => l.map((r) => r.id === args.id ? { ...r, status: 'cancelada' } : r)); return; }
      await cancelarMut.mutateAsync(args);
    },
  };
  const compDemoNome = useState<{ current: string | null }>(() => ({ current: null }))[0];

  /** "Novo agendamento": resolve a conversa por onde a mensagem sairá — regra do v1. */
  async function escolherContato(c: { id: string; nome: string; tel: string }) {
    setNovoErr(null);
    if (demo) {
      compDemoNome.current = c.nome;
      setNovoAberto(false); setBuscaContato('');
      setComp({ modo: 'criar', conversaId: `conv-demo-${Date.now()}`, canalId: CANAIS_DEMO[0].id, temTelefone: true });
      return;
    }
    try {
      const conv = await conversaAtivaDoContato(currentOrg.id, c.id);
      if (!conv) { setNovoErr(`${c.nome} ainda não tem conversa aberta. Abra uma conversa no WhatsApp antes de agendar — o envio sai por ela.`); return; }
      setNovoAberto(false); setBuscaContato('');
      setComp({ modo: 'criar', conversaId: conv.id, canalId: conv.canalId ?? undefined, temTelefone: !!c.tel });
    } catch (e) { setNovoErr((e as Error).message || 'Não foi possível abrir o agendamento.'); }
  }

  async function submeterComposicao(v: AgendarSubmit) {
    if (!comp) return;
    if (v.modo === 'sequencia') {
      if (!comp.conversaId) return;
      await acoes.criarSequencia({ conversaId: comp.conversaId, canalId: v.canalId, executarEm: v.executarISO, itens: v.itens ?? [] });
      setAviso({ tom: 'ok', texto: 'Agendamento criado.' });
    } else if (v.modo === 'reagendar' && comp.item) {
      await acoes.reagendar({ id: comp.item.id, conversaId: comp.item.conversaId, canalId: v.canalId, executarEm: v.executarISO });
      setAviso({ tom: 'ok', texto: 'Mensagem reagendada — voltou para a fila.' });
    } else if (comp.item) {
      await acoes.editar({ id: comp.item.id, conversaId: comp.item.conversaId, canalId: v.canalId, texto: v.texto ?? '', executarEm: v.executarISO });
      setAviso({ tom: 'ok', texto: 'Agendamento atualizado.' });
    }
    setComp(null);
  }

  // confirmações — textos byte a byte com o v1
  function pedirCancelarItem(item: AgendamentoOrg) {
    if (!agendaEditavel(item.status)) return;
    setConfirmar({
      titulo: 'Cancelar agendamento',
      texto: 'A mensagem não será enviada. Isto não pode ser desfeito — para enviar depois é preciso agendar de novo.',
      rotulo: 'Cancelar agendamento',
      acao: async () => {
        try { await acoes.cancelar({ id: item.id, conversaId: item.conversaId }); setAviso({ tom: 'ok', texto: 'Agendamento cancelado.' }); }
        catch (e) { setAviso({ tom: 'erro', texto: (e as Error).message || 'Falha ao cancelar.' }); }
      },
    });
  }
  function pedirCancelarSequencia(g: Grupo) {
    const pend = g.itens.filter((i) => i.status === 'agendada');
    if (!pend.length) return;
    setConfirmar({
      titulo: 'Cancelar mensagens pendentes',
      texto: `${pend.length} ${pend.length === 1 ? 'mensagem ainda não saiu' : 'mensagens ainda não saíram'} desta sequência e ${pend.length === 1 ? 'será cancelada' : 'serão canceladas'}. As já enviadas permanecem.`,
      rotulo: pend.length === 1 ? 'Cancelar 1 mensagem' : `Cancelar ${pend.length} mensagens`,
      acao: async () => {
        try { for (const i of pend) await acoes.cancelar({ id: i.id, conversaId: i.conversaId }); setAviso({ tom: 'ok', texto: 'Mensagens pendentes canceladas.' }); }
        catch (e) { setAviso({ tom: 'erro', texto: (e as Error).message || 'Falha ao cancelar.' }); }
      },
    });
  }

  const abrirConversa = (conversaId: string) => navigate(`/whatsapp?conversa=${encodeURIComponent(conversaId)}`);
  const previa = (g: Grupo) => (g.primeiro.texto?.trim()) || g.primeiro.nomeArquivo || tipoLbl(g.primeiro.tipo);
  const agora = Date.now();

  /* ── painel de comando (v2.1): TUDO agregação client-side dos dados já
     carregados — nenhuma query, nenhuma ação nova. ─────────────────────── */
  const ehPainel = aba === 'visao' && !fDia;
  const hojeStr = diaSP(new Date(agora).toISOString());
  const painel = useMemo(() => {
    const naFila = grupos.filter((g) => g.statusGeral === 'agendada').length;
    const enviadasHoje = rows.filter((r) => r.status === 'enviada' && r.enviadaEm && diaSP(r.enviadaEm) === hojeStr).length;
    const precisaAcao = grupos.filter((g) => g.statusGeral === 'falha' || g.statusGeral === 'bloqueada');
    // taxa de sucesso do período filtrado (mensagens com desfecho)
    const itensF = filtrados.flatMap((g) => g.itens);
    const env = itensF.filter((i) => i.status === 'enviada').length;
    const ruim = itensF.filter((i) => i.status === 'falhou' || i.status === 'bloqueada').length;
    const taxa = env + ruim > 0 ? Math.round((env / (env + ruim)) * 100) : 0;
    // próximos ~8 da fila, agrupados por Hoje / Amanhã / data
    const amanhaStr = diaSP(new Date(agora + 86_400_000).toISOString());
    const fila = rows.filter((r) => r.status === 'agendada')
      .sort((a, b) => a.executarEm.localeCompare(b.executarEm)).slice(0, 8);
    const gruposTl: { rotulo: string; itens: AgendamentoOrg[] }[] = [];
    for (const item of fila) {
      const d = diaSP(item.executarEm);
      const rotulo = d === hojeStr ? 'Hoje' : d === amanhaStr ? 'Amanhã'
        : new Date(item.executarEm).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' });
      const ultimo = gruposTl[gruposTl.length - 1];
      if (ultimo && ultimo.rotulo === rotulo) ultimo.itens.push(item);
      else gruposTl.push({ rotulo, itens: [item] });
    }
    // atividade da semana (hoje..+6): programadas + enviadas por dia
    const semana = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(agora + i * 86_400_000);
      const iso = diaSP(d.toISOString());
      const prog = rows.filter((r) => r.status === 'agendada' && diaSP(r.executarEm) === iso).length;
      const envd = rows.filter((r) => r.status === 'enviada' && r.enviadaEm && diaSP(r.enviadaEm) === iso).length;
      return {
        iso,
        rotulo: i === 0 ? 'Hoje' : d.toLocaleDateString('pt-BR', { weekday: 'short', timeZone: 'America/Sao_Paulo' }).replace('.', ''),
        total: prog + envd,
        hoje: i === 0,
      };
    });
    const maxSemana = Math.max(1, ...semana.map((s) => s.total));
    return { naFila, enviadasHoje, precisaAcao, taxa, temDesfecho: env + ruim > 0, gruposTl, filaVazia: fila.length === 0, semana, maxSemana };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grupos, rows, filtrados, hojeStr]);

  /** Posição na sequência ("2/3") de um item da timeline, quando houver. */
  function posicaoSeq(item: AgendamentoOrg): string | null {
    if (!item.sequenciaId || item.ordemNaSequencia == null) return null;
    const g = grupos.find((x) => x.key === item.sequenciaId);
    return g ? `${item.ordemNaSequencia}/${g.count}` : null;
  }

  const COLUNAS: Coluna<Grupo>[] = [
    { chave: 'dest', titulo: 'Destinatário', render: (g) => <div className="ag-cli"><div className="nm">{g.contatoNome ?? g.telefone ?? 'Cliente'}</div><div className="tel num">{g.telefone ?? '—'}</div></div> },
    { chave: 'conteudo', titulo: 'Conteúdo', render: (g) => <span className="ag-previa" title={previa(g)}>{previa(g)}</span> },
    { chave: 'canal', titulo: 'Canal', render: (g) => g.nomeCanal ? <em className="ag-pill">{g.nomeCanal}</em> : '—' },
    { chave: 'tipo', titulo: 'Tipo', render: (g) => <em className={g.ehSequencia ? 'ag-pill seq num' : 'ag-pill'}>{g.ehSequencia ? `Sequência · ${g.count}` : tipoLbl(g.primeiro.tipo)}</em> },
    { chave: 'at', titulo: 'Atendente', render: (g) => nomePorId(g.criadoPor) ?? <span style={{ color: 'var(--txt-3)' }}>—</span> },
    { chave: 'quando', titulo: 'Quando', dir: true, render: (g) => { const q = quandoCelula(g.primeiro.executarEm, agora); return <div className="ag-quando"><div className="qdo-rel num">{q.principal}</div><div className="qdo-abs num">{q.apoio}</div></div>; } },
    { chave: 'status', titulo: 'Status', render: (g) => { const st = stMeta(g.statusGeral); return <BadgeStatus tom={st.tom}>{st.label}</BadgeStatus>; } },
    { chave: 'tent', titulo: 'Tent.', dir: true, classe: 'num', render: (g) => g.tentativas },
  ];

  const carregando = !demo && rowsQ.isLoading;
  const erro = !demo && rowsQ.isError;

  return (
    <>
      <div className="ph sobe">
        <div>
          <h2>Agendamentos</h2>
          <p>Mensagens programadas, enviadas, falhas e canceladas.{demo ? ' · modo demonstração (nada é enviado)' : ''}</p>
        </div>
        <div className="acoes">
          <BotaoPrimario onClick={() => { setNovoAberto(true); setNovoErr(null); setBuscaContato(''); }}>＋ Novo agendamento</BotaoPrimario>
        </div>
      </div>

      {aviso && (
        <div className={aviso.tom === 'erro' ? 'aviso-inline erro' : 'aviso-inline'} role="status">
          {aviso.texto}
          <button type="button" onClick={() => setAviso(null)} aria-label="Fechar aviso">×</button>
        </div>
      )}

      {erro ? (
        <CardVidro sobe>
          <EstadoErro descricao="Houve uma falha ao buscar os agendamentos." aoTentarDeNovo={() => rowsQ.refetch()} />
        </CardVidro>
      ) : carregando ? (
        <CardVidro style={{ borderRadius: 12, padding: '14px 16px' }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} style={{ display: 'flex', gap: 14, alignItems: 'center', padding: '9px 0' }}>
              <Skeleton largura="22%" /><Skeleton largura="26%" /><Skeleton largura="10%" raio={99} /><Skeleton largura="14%" /><Skeleton largura="10%" raio={99} />
            </div>
          ))}
        </CardVidro>
      ) : (
        <>
          <div className="ag-topo sobe" style={{ animationDelay: '.06s' }}>
            <Segmentado
              rotulo="Status dos agendamentos"
              opcoes={ABAS.map((a) => ({ valor: a.id, rotulo: `${a.label} ${contagens[a.id] ?? 0}` }))}
              valor={aba}
              aoMudar={(v) => { setAba(v); setSelKey(null); }}
            />
            <select className="ag-sel" value={fPeriodo} onChange={(e) => setFPeriodo(e.target.value as PeriodoAg)} aria-label="Período">
              <option value="todas">Todo o período</option>
              <option value="hoje">Hoje</option>
              <option value="amanha">Amanhã</option>
              <option value="7d">Próximos 7 dias</option>
              <option value="30d">Próximos 30 dias</option>
            </select>
            <BotaoSec onClick={() => setFiltrosAbertos((v) => !v)} aria-expanded={filtrosAbertos || filtroAtivo}>
              Filtros{filtroAtivo ? ' ·' : ''}
            </BotaoSec>
          </div>

          {(filtrosAbertos || filtroAtivo) && (
            <div className="ag-filtros sobe">
              <div className="busca-inp">
                <Input placeholder="Buscar por cliente, telefone ou conteúdo…" value={fBusca} onChange={(e) => setFBusca(e.target.value)} aria-label="Buscar agendamentos" />
              </div>
              <select className="ag-sel" value={fCanal} onChange={(e) => setFCanal(e.target.value)} aria-label="Canal">
                <option value="">Todos os canais</option>
                {canais.map((c) => <option key={c.id} value={c.id}>{c.alias}</option>)}
              </select>
              <select className="ag-sel" value={fCriador} onChange={(e) => setFCriador(e.target.value)} aria-label="Atendente">
                <option value="">Todos os atendentes</option>
                {orgUsuarios.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
              </select>
              <select className="ag-sel" value={fTipo} onChange={(e) => setFTipo(e.target.value)} aria-label="Tipo">
                <option value="">Todos os tipos</option>
                <option value="texto">Texto</option>
                <option value="imagem">Imagem</option>
                <option value="audio">Áudio</option>
                <option value="video">Vídeo</option>
                <option value="documento">Documento</option>
              </select>
              {fDia && (
                <BotaoMini onClick={() => setFDia('')} aria-label="Remover filtro de dia">
                  Dia {fDia.split('-').reverse().slice(0, 2).join('/')} ×
                </BotaoMini>
              )}
              {filtroAtivo && <BotaoMini onClick={limpar}>Limpar filtros</BotaoMini>}
            </div>
          )}

          <div className="ag-main">
            {ehPainel ? (
              <div className="pc-coluna">
                <div className="kpis sobe" style={{ marginBottom: 0, animationDelay: '.12s' }}>
                  <Kpi rotulo="Na fila" valor={painel.naFila} delta={{ tom: 'neutro', texto: 'agendamentos programados' }} />
                  <Kpi rotulo="Enviadas hoje" valor={painel.enviadasHoje} tomValor={painel.enviadasHoje > 0 ? 'ok' : undefined} delta={{ tom: painel.enviadasHoje > 0 ? 'ok' : 'neutro', texto: 'mensagens que já saíram' }} />
                  <Kpi rotulo="Precisa de ação" valor={painel.precisaAcao.length} tomValor={painel.precisaAcao.length > 0 ? 'erro' : undefined} delta={{ tom: painel.precisaAcao.length > 0 ? 'erro' : 'neutro', texto: 'falhas e bloqueios' }} />
                  <Kpi rotulo="Taxa de sucesso" valor={painel.taxa} sufixo="%" delta={{ tom: painel.temDesfecho ? (painel.taxa >= 90 ? 'ok' : 'atencao') : 'neutro', texto: painel.temDesfecho ? 'do período filtrado' : 'sem envios no período' }} />
                </div>

                <div className="pc-grade sobe" style={{ animationDelay: '.2s' }}>
                  <CardVidro spot>
                    <CardCab titulo="Próximos envios" />
                    {painel.filaVazia ? (
                      <EstadoVazio
                        titulo="Nada programado"
                        descricao="A fila está limpa. Agende uma mensagem para ela sair sozinha na hora certa."
                        acao={{ rotulo: '＋ Novo agendamento', onClick: () => { setNovoAberto(true); setNovoErr(null); setBuscaContato(''); } }}
                      />
                    ) : painel.gruposTl.map((gt) => (
                      <div key={gt.rotulo}>
                        <div className="caps tl-grupo-cab">{gt.rotulo}</div>
                        {gt.itens.map((item) => {
                          const pos = posicaoSeq(item);
                          return (
                            <button type="button" className="tl-item" key={item.id} onClick={() => setSelKey(item.sequenciaId ?? item.id)}>
                              <span className="tl-hora num">{horaSP(item.executarEm)}</span>
                              <span className="tl-corpo">
                                <span className="t">{item.contatoNome ?? item.telefone ?? 'Cliente'}</span>
                                <span className="s">{item.texto?.trim() || item.nomeArquivo || tipoLbl(item.tipo)}</span>
                              </span>
                              <span className="tl-meta">
                                {pos && <em className="ag-pill seq num">{pos}</em>}
                                {item.nomeCanal && <em className="ag-pill">{item.nomeCanal}</em>}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </CardVidro>

                  <div className="pc-coluna">
                    <CardVidro spot style={{ padding: '15px 17px 12px' }}>
                      <div className="cfg-sec" style={{ marginBottom: 12 }}>Atividade da semana</div>
                      <div className="barras" style={{ height: 96 }}>
                        {painel.semana.map((s, i) => (
                          <button type="button" className="bwrap" key={s.iso} title={`Ver o dia ${s.iso.split('-').reverse().slice(0, 2).join('/')}`}
                            onClick={() => setFDia(s.iso)}>
                            <span className="bval num" style={{ animationDelay: `${.6 + i * .06}s` }}>{s.total}</span>
                            <span className={s.hoje ? 'barv hoje2' : 'barv'}
                              style={{ height: `${Math.max(8, (s.total / painel.maxSemana) * 100)}%`, animationDelay: `${.25 + i * .07}s` }} />
                            <span className={s.hoje ? 'blab hoje-lb' : 'blab'}>{s.rotulo}</span>
                          </button>
                        ))}
                      </div>
                    </CardVidro>

                    {painel.precisaAcao.length > 0 && (
                      <CardVidro spot>
                        <CardCab titulo="Precisa de ação" contador={painel.precisaAcao.length} />
                        {painel.precisaAcao.map((g) => {
                          const item = g.itens[0];
                          const motivo = item.motivoBloqueio || item.ultimoErro || stMeta(g.statusGeral).label;
                          const podeReagendar = !g.ehSequencia && agendaReagendavel(item.status);
                          return (
                            <TrilhoItem
                              key={g.key}
                              tom="crit"
                              titulo={g.contatoNome ?? g.telefone ?? 'Cliente'}
                              sub={motivo}
                              direita={
                                <span style={{ display: 'flex', gap: 5, alignSelf: 'center' }}>
                                  {podeReagendar && <BotaoMini onClick={() => setComp({ modo: 'reagendar', item, temTelefone: !!item.telefone })}>Reagendar</BotaoMini>}
                                  <BotaoMini onClick={() => setSelKey(g.key)}>Ver</BotaoMini>
                                </span>
                              }
                            />
                          );
                        })}
                      </CardVidro>
                    )}
                  </div>
                </div>
              </div>
            ) : (
            <CardVidro spot sobe style={{ borderRadius: 12, animationDelay: '.12s' }}>
              {filtrados.length === 0 ? (
                grupos.length === 0 ? (
                  <EstadoVazio
                    titulo="Nenhuma mensagem programada"
                    descricao="Agende uma mensagem para ela sair sozinha na hora certa."
                    acao={{ rotulo: '＋ Novo agendamento', onClick: () => { setNovoAberto(true); setNovoErr(null); setBuscaContato(''); } }}
                  />
                ) : filtroAtivo ? (
                  <EstadoVazio
                    titulo="Nada com esses filtros"
                    descricao="Ajuste os filtros ou veja todos os agendamentos."
                    acao={{ rotulo: 'Limpar filtros', onClick: limpar }}
                  />
                ) : (
                  <EstadoVazio
                    titulo={`${abaAtual.label}: nada aqui`}
                    descricao={abaAtual.vazio}
                    acao={aba !== 'visao' ? { rotulo: 'Ver todos os agendamentos', onClick: () => setAba('visao') } : undefined}
                  />
                )
              ) : (
                <TabelaPadrao
                  colunas={COLUNAS}
                  linhas={filtrados}
                  chave={(g) => g.key}
                  aoClicarLinha={(g) => setSelKey(selKey === g.key ? null : g.key)}
                  rodape={{ texto: `${filtrados.length} agendamento${filtrados.length === 1 ? '' : 's'}` }}
                />
              )}
            </CardVidro>
            )}

            {sel && (() => {
              const st = stMeta(sel.statusGeral);
              const item = sel.itens[0];
              const enviadas = sel.itens.filter((i) => i.status === 'enviada').length;
              const falhas = sel.itens.filter((i) => i.status === 'falhou' || i.status === 'bloqueada').length;
              const taxa = sel.count > 0 ? Math.round((enviadas / sel.count) * 100) : 0;
              const podeCancelarSeq = sel.ehSequencia && sel.itens.some((i) => i.status === 'agendada');
              const podeEditar = !sel.ehSequencia && agendaEditavel(item.status);
              const podeReagendar = !sel.ehSequencia && agendaReagendavel(item.status);
              return (
                <DrawerV2 aberto aoFechar={() => setSelKey(null)}>
                  <div className="cab">
                    Detalhes do agendamento
                    <button type="button" className="fechar-p" aria-label="Fechar" onClick={() => setSelKey(null)}>×</button>
                  </div>
                  <div className="corpo">
                    <div className="ag-p-cli">
                      <div>
                        <div className="nm">{sel.contatoNome ?? sel.telefone ?? 'Cliente'}</div>
                        <div className="tel num">{sel.telefone ?? '—'}</div>
                      </div>
                      <BotaoMini onClick={() => abrirConversa(sel.conversaId)}>Abrir conversa</BotaoMini>
                    </div>
                    <div className="ag-dl">
                      <div className="item-dl"><div className="k">Canal</div><div className="v">{sel.nomeCanal ?? '—'}</div></div>
                      <div className="item-dl"><div className="k">Status</div><div className="v"><BadgeStatus tom={st.tom}>{st.label}</BadgeStatus></div></div>
                      <div className="item-dl"><div className="k">Tipo</div><div className="v">{sel.ehSequencia ? `Sequência · ${sel.count}` : tipoLbl(sel.primeiro.tipo)}</div></div>
                      <div className="item-dl"><div className="k">Tentativas</div><div className="v num">{sel.tentativas}</div></div>
                      <div className="item-dl"><div className="k">Criado por</div><div className="v">{nomePorId(sel.criadoPor) ?? '—'}</div></div>
                      <div className="item-dl"><div className="k">Criado em</div><div className="v num">{fmtSP(sel.criadoEm)}</div></div>
                      <div className="item-dl"><div className="k">Agendado para</div><div className="v num">{fmtSP(sel.primeiro.executarEm)}</div></div>
                      {sel.primeiro.enviadaEm && <div className="item-dl"><div className="k">Enviado em</div><div className="v num">{fmtSP(sel.primeiro.enviadaEm)}</div></div>}
                    </div>

                    {sel.ehSequencia && (
                      <>
                        <div className="ag-sec">Resumo de desempenho</div>
                        <div className="ag-kpis num">
                          <span className="ag-kpi"><b>{sel.count}</b><i>Mensagens</i></span>
                          <span className="ag-kpi ok"><b>{enviadas}</b><i>Enviadas</i></span>
                          <span className={falhas > 0 ? 'ag-kpi bad' : 'ag-kpi'}><b>{falhas}</b><i>Falhas</i></span>
                          <span className="ag-kpi"><b>{taxa}%</b><i>Sucesso</i></span>
                        </div>
                      </>
                    )}

                    <div className="ag-sec">{sel.ehSequencia ? `Mensagens (${sel.count})` : 'Mensagem'}</div>
                    <ol className="ag-msgs">
                      {sel.itens.map((i, idx) => {
                        const ist = stMeta(i.status);
                        const ierro = i.motivoBloqueio || i.ultimoErro;
                        return (
                          <li key={i.id}>
                            <div className="m-h">
                              <span className="num">{sel.ehSequencia ? `${idx + 1}. ` : ''}{fmtSP(i.executarEm)}</span>
                              <BadgeStatus tom={ist.tom}>{ist.label}</BadgeStatus>
                            </div>
                            <div className="m-t">{i.texto || i.nomeArquivo || '—'}</div>
                            {(i.enviadaEm || ierro) && (
                              <div className="m-m">
                                {i.enviadaEm && <span className="ok num">✓ Enviada em {fmtSP(i.enviadaEm)}</span>}
                                {ierro && <span className="bad">{ierro}</span>}
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ol>
                  </div>

                  {(podeEditar || podeReagendar || podeCancelarSeq) && (
                    <div className="ag-p-acoes">
                      {podeEditar && (
                        <>
                          <BotaoMini onClick={() => setComp({ modo: 'editar', item, temTelefone: !!item.telefone })}>Editar</BotaoMini>
                          <button type="button" className="p-btn btn-perigo btn-mini" onClick={() => pedirCancelarItem(item)}>Cancelar</button>
                        </>
                      )}
                      {podeReagendar && <BotaoMini onClick={() => setComp({ modo: 'reagendar', item, temTelefone: !!item.telefone })}>Reagendar</BotaoMini>}
                      {podeCancelarSeq && <button type="button" className="p-btn btn-perigo btn-mini" onClick={() => pedirCancelarSequencia(sel)}>Cancelar pendentes</button>}
                    </div>
                  )}
                </DrawerV2>
              );
            })()}
          </div>
        </>
      )}

      {/* Novo agendamento: escolher o cliente (regra do v1: precisa de conversa aberta) */}
      <ModalV2
        aberto={novoAberto}
        aoFechar={() => setNovoAberto(false)}
        largura={480}
        titulo="Novo agendamento"
        rodape={<BotaoSec onClick={() => setNovoAberto(false)}>Cancelar</BotaoSec>}
      >
        <div className="form-grid">
          <div className="campo" style={{ marginBottom: 0 }}>
            <label htmlFor="ag-novo-busca">Para qual cliente?</label>
            <Input id="ag-novo-busca" autoFocus placeholder="Buscar por nome ou telefone…" value={buscaContato}
              onChange={(e) => { setBuscaContato(e.target.value); setNovoErr(null); }} />
          </div>
          {novoErr && <div className="aviso-inline erro" role="alert" style={{ marginBottom: 0 }}>{novoErr}</div>}
          <div>
            {demo && buscaContato.trim().length > 1 && (
              <button type="button" className="combo-item" onClick={() => escolherContato({ id: 'demo', nome: buscaContato.trim(), tel: '(51) 90000-0000' })}>
                <div className="nm">{buscaContato.trim()}</div>
                <div className="meta">cliente de demonstração</div>
              </button>
            )}
            {!demo && (contatosQ.data ?? []).slice(0, 8).map((c) => (
              <button key={c.id} type="button" className="combo-item" onClick={() => escolherContato(c)}>
                <div className="nm">{c.nome || 'Sem nome'}</div>
                <div className="meta num">{c.tel || 'Sem telefone'}</div>
              </button>
            ))}
            {!demo && buscaContato.trim().length > 1 && (contatosQ.data ?? []).length === 0 && !contatosQ.isLoading && (
              <div className="combo-info">Nenhum cliente encontrado.</div>
            )}
          </div>
        </div>
      </ModalV2>

      <ConfirmDialogV2
        aberto={!!confirmar}
        titulo={confirmar?.titulo ?? ''}
        mensagem={confirmar?.texto ?? ''}
        rotuloConfirmar={confirmando ? 'Cancelando…' : (confirmar?.rotulo ?? '')}
        destrutivo
        carregando={confirmando}
        aoConfirmar={async () => {
          const c = confirmar; if (!c) return;
          setConfirmando(true);
          try { await c.acao(); } finally { setConfirmando(false); setConfirmar(null); }
        }}
        aoCancelar={() => setConfirmar(null)}
      />

      <AgendarMensagemModalV2
        aberto={!!comp}
        modo={comp?.modo ?? 'editar'}
        canais={canais}
        temTelefone={comp?.temTelefone ?? true}
        demo={demo}
        initial={comp?.item
          ? { canalId: comp.item.canalId, texto: comp.item.texto ?? '', executarEm: comp.item.executarEm, tipo: comp.item.tipo, nomeArquivo: comp.item.nomeArquivo ?? undefined }
          : (comp?.canalId ? { canalId: comp.canalId } : null)}
        aoFechar={() => setComp(null)}
        aoSubmeter={submeterComposicao}
      />
    </>
  );
}
