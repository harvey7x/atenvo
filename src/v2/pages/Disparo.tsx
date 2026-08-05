import { useMemo, useState } from 'react';
import {
  useDisparoElegiveis, useDisparoContatados, useCampanhas, useCampanhasResumo, useCriarCampanha, useCancelarCampanha,
  useTrocarTemplate, useRearmar, useAddAlvos, useAlvos, useCampanhaResultado, useCampanhaPessoas, useCampanhaAtendentes, useContatoTimeline, useExcluirCampanha,
  useRemarketingFiltro, useProcessarLote, useOptoutLista, useOptoutManual, useOptoutRemover,
  preencherTemplate, primeiroNomeApresentavel, inferirGenero, type Genero,
  type Elegivel, type Contatado, type Campanha, type CampanhaResumo, type CampanhaPessoa, type CampanhaAtendente, type TimelineEvento, type RemarketingPrevia, type OptoutRow, type ResultadoProcessar,
} from '@/data/disparo';
import { useWaTemplates, useCloudDiagnostico, type WaTemplate } from '@/data/cloudApi';
import { formatarNumero } from '@/data/maturacao';
import { tempoRelativo } from '../lib/tempo';
import {
  BadgeStatus, BotaoMini, BotaoPrimario, BotaoSec, CardVidro, Chip, Chips,
  ConfirmDialogV2, EstadoVazio, Input, Kpi, ModalV2, SkeletonTexto, TabelaPadrao,
  type Coluna, type TomStatus,
} from '../components';
import './disparo.css';

/* ------------------------------------------------------------------
   Disparo v2 (redesign) — cara de CAMPANHA, não lista de contatos.
   Fluxo em etapas: 1 Público → 2 Template → 3 Revisar → 4 Disparar,
   com resumo fixo no topo e cards por pessoa (prévia do {{1}} já
   preenchido, serviço de interesse, canal de origem).
   A mecânica é a MESMA da v1 (RPCs + disparo-processar intocados):
   dry-run por default, teto 24h no servidor, opt-out re-checado.
   ------------------------------------------------------------------ */

type AbaId = 'campanha' | 'contatados' | 'excluidos';
type Etapa = 1 | 2 | 3 | 4;

/* Filtros combináveis (E) do relatório de pessoas (Fase C). É a MESMA seleção que a
   Fase D reusa como alvo de remarketing — por isso é estado estruturado, não descartável.
   "resposta=sim" usa status='respondido' (mesmo critério da Fase B, os 77). */
type FiltrosPessoas = {
  disparo: 'todos' | 'pendente' | 'enviado' | 'falha';
  resposta: 'todos' | 'sim' | 'nao';
  murillo: 'todos' | 'sim' | 'nao';
  fechou: 'todos' | 'sim' | 'nao';
  etapa: string; atendente: string; template: string; de: string; ate: string;
};
const FILTROS0: FiltrosPessoas = { disparo: 'todos', resposta: 'todos', murillo: 'todos', fechou: 'todos', etapa: '', atendente: '', template: '', de: '', ate: '' };
const filtrosAtivos = (f: FiltrosPessoas) =>
  f.disparo !== 'todos' || f.resposta !== 'todos' || f.murillo !== 'todos' || f.fechou !== 'todos'
  || f.etapa !== '' || f.atendente !== '' || f.template !== '' || f.de !== '' || f.ate !== '';
const passaFiltro = (p: CampanhaPessoa, f: FiltrosPessoas) =>
  (f.disparo === 'todos'
    || (f.disparo === 'pendente' && p.status === 'pendente')
    || (f.disparo === 'enviado' && (p.status === 'enviado' || p.status === 'respondido'))
    || (f.disparo === 'falha' && (p.status === 'falhou' || p.status === 'pulado' || p.status === 'optout')))
  && (f.resposta === 'todos' || (f.resposta === 'sim') === (p.status === 'respondido'))
  && (f.murillo === 'todos' || (f.murillo === 'sim') === p.chamou_murillo)
  && (f.fechou === 'todos' || (f.fechou === 'sim') === p.fechou)
  && (f.etapa === '' || p.etapa_kanban === f.etapa)
  && (f.atendente === '' || (f.atendente === 'sem' ? !p.atendente_id : p.atendente_id === f.atendente))
  && (f.template === '' || p.template_nome === f.template)
  && (f.de === '' || (!!p.enviado_em && p.enviado_em >= f.de))
  && (f.ate === '' || (!!p.enviado_em && p.enviado_em <= `${f.ate}T23:59:59`));

/* Contatado (já recebeu) → forma de Elegível, para caber no mesmo fluxo de seleção
   e nos cards. Não precisa estar no topo do funil: o disparo_add_alvos re-valida
   opt-out e WhatsApp no servidor. */
const contatadoParaElegivel = (c: Contatado): Elegivel => ({
  contato_id: c.contato_id, nome: c.nome, telefone: c.telefone ?? '',
  etapa: 'Já contatado', etapa_ordem: 999,
  tipo_servico: null, canal_origem: c.ultima_campanha,
  ultima_msg_em: c.ultimo_em, optout: c.optout,
  ja_recebeu: true, ultimo_disparo_em: c.ultimo_em, ultima_campanha: c.ultima_campanha,
});
const ROTULO_ETAPA: Record<Etapa, string> = { 1: 'Público', 2: 'Template', 3: 'Revisar', 4: 'Disparar' };

const ST_ALVO: Record<string, { rotulo: string; tom: TomStatus }> = {
  pendente: { rotulo: 'Pendente', tom: 'neutro' },
  enviado: { rotulo: 'Enviado', tom: 'ok' },
  respondido: { rotulo: 'Respondeu', tom: 'ok' },   // recebeu E respondeu (marcado pelo webhook)
  falhou: { rotulo: 'Falhou', tom: 'erro' },
  optout: { rotulo: 'Opt-out', tom: 'atencao' },
  pulado: { rotulo: 'Pulado', tom: 'neutro' },
};
/** NUNCA quebra a tela: status desconhecido (novo no backend) vira um selo neutro. */
const stAlvo = (s: string) => ST_ALVO[s] ?? { rotulo: s || '—', tom: 'neutro' as TomStatus };
const ST_CAMP: Record<string, { rotulo: string; tom: TomStatus }> = {
  ativa: { rotulo: 'Ativa', tom: 'ok' },
  concluida: { rotulo: 'Concluída', tom: 'neutro' },
  cancelada: { rotulo: 'Cancelada', tom: 'atencao' },
};
/** Meta dos eventos da timeline por contato (Fase C). */
const EV_TL: Record<string, { rot: string; ic: string; tom: TomStatus }> = {
  enviado: { rot: 'Disparo enviado', ic: '📤', tom: 'neutro' },
  respondeu: { rot: 'Respondeu', ic: '💬', tom: 'ok' },
  murillo: { rot: 'Chamou o Murillo chip', ic: '📞', tom: 'atencao' },
  etapa: { rot: 'Avançou no Kanban', ic: '➡️', tom: 'neutro' },
  fechou: { rot: 'Fechou (ganho)', ic: '✅', tom: 'ok' },
};
const fmtQuando = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const MOTIVO_ROTULO: Record<string, string> = {
  sair_texto: 'Respondeu SAIR',
  erro_131050: 'Bloqueou na Meta',
  user_preferences: 'Descadastro Meta',
  manual: 'Manual (painel)',
};
const fmtTel = (t: string | null) => {
  const d = (t ?? '').replace(/\D/g, '');
  return /^\d{12,13}$/.test(d) ? formatarNumero(d) : (t || '—');
};
const iniciais = (n: string) => {
  const p = (n || '').trim().split(/\s+/);
  return ((p[0]?.[0] || '') + (p[1]?.[0] || '')).toUpperCase() || '?';
};
/** Percentual inteiro de n sobre a base (0 se base vazia). */
const pct = (n: number, base: number) => (base > 0 ? Math.round((n / base) * 100) : 0);
/** Custo por mensagem de template pago (Meta) — R$ aproximado. */
const CUSTO_MSG = 0.35;
const fmtBRL = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
/** Duração amigável a partir de segundos: 45s · 12min · 1h 29min. */
const fmtDur = (seg: number | null | undefined) => {
  if (seg == null) return '—';
  if (seg < 60) return `${Math.round(seg)}s`;
  const min = Math.round(seg / 60);
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h}h ${m}min` : `${h}h`;
};

export function Disparo() {
  const agoraMs = Date.now();
  const [aba, setAba] = useState<AbaId>('campanha');
  const [etapa, setEtapa] = useState<Etapa>(1);
  const [aviso, setAviso] = useState<{ tom: 'ok' | 'erro'; texto: string } | null>(null);
  // Redesign multi-campanha: qual campanha está ABERTA (null = mostra a LISTA),
  // e se estamos no fluxo de "nova campanha" (público → template → revisar → criar).
  const [campanhaSelId, setCampanhaSelId] = useState<string | null>(null);
  const [modoCriar, setModoCriar] = useState(false);

  /* ---------- dados ---------- */
  const elegQ = useDisparoElegiveis();
  const contQ = useDisparoContatados();
  const campQ = useCampanhas();
  const campResumoQ = useCampanhasResumo();
  const tplQ = useWaTemplates();
  const diagQ = useCloudDiagnostico();
  const optQ = useOptoutLista();

  // A campanha ABERTA (qualquer status), não mais "a única ativa".
  const campanha: Campanha | null = useMemo(
    () => (campQ.data ?? []).find((c) => c.id === campanhaSelId) ?? null,
    [campQ.data, campanhaSelId],
  );
  const alvosQ = useAlvos(campanha?.id ?? null);
  const resultadoQ = useCampanhaResultado(campanha?.id ?? null);
  const pessoasQ = useCampanhaPessoas(campanha?.id ?? null);
  const [horasParado, setHorasParado] = useState(1);
  const atendentesQ = useCampanhaAtendentes(campanha?.id ?? null, horasParado);
  const [ordAt, setOrdAt] = useState<{ campo: 'atendente' | 'atribuidos' | 'responderam' | 'avancaram_murillo' | 'fecharam' | 'taxa' | 'sla_time_seg' | 'parados'; asc: boolean }>({ campo: 'taxa', asc: false });
  const templatesTodos = useMemo(() => tplQ.data ?? [], [tplQ.data]);
  const canalCloud = (diagQ.data?.canais ?? []).find((c) => c.status_integracao === 'conectado') ?? null;

  /* navegação entre LISTA de campanhas ↔ campanha aberta ↔ criar nova */
  const abrirCampanha = (id: string) => { setCampanhaSelId(id); setModoCriar(false); setSel(new Set()); setEtapa(4); setAba('campanha'); };
  const novaCampanha = () => { setCampanhaSelId(null); setModoCriar(true); setSel(new Set()); setTemplateId(''); setEtapa(1); setAba('campanha'); };
  const voltarLista = () => { setCampanhaSelId(null); setModoCriar(false); setSel(new Set()); setTemplateId(''); setEtapa(1); };

  /* ---------- mutações ---------- */
  const criar = useCriarCampanha();
  const cancelar = useCancelarCampanha();
  const trocar = useTrocarTemplate();
  const rearmar = useRearmar();
  const excluir = useExcluirCampanha();
  const remarketing = useRemarketingFiltro();
  const addAlvos = useAddAlvos();
  const processar = useProcessarLote();
  const optManual = useOptoutManual();
  const optRemover = useOptoutRemover();

  const ok = (texto: string) => { setAviso({ tom: 'ok', texto }); setTimeout(() => setAviso(null), 6000); };
  const erro = (texto: string) => setAviso({ tom: 'erro', texto });

  /* ================= etapa 1: público ================= */
  const [busca, setBusca] = useState('');
  const [etapasSel, setEtapasSel] = useState<ReadonlySet<string>>(new Set());
  // Gênero multi (régua conservadora pelo primeiro nome — mesma do bot): marca/desmarca
  // homem/mulher/incerto; vazio = todos. "Ambos" = homem+mulher marcados.
  const [generoSel, setGeneroSel] = useState<ReadonlySet<Genero>>(new Set());
  // "Quero N pessoas" dentro dos filtros: N + critério (mais recentes | aleatório).
  const [qtd, setQtd] = useState(50);
  const [modoQtd, setModoQtd] = useState<'recentes' | 'antigos' | 'aleatorio'>('recentes');
  // Protege a base: por padrão o público novo esconde quem já recebeu um disparo.
  // 'todos' mostra tudo; 'so' isola só quem já recebeu (re-disparo direto no Público).
  const [modoJaRecebeu, setModoJaRecebeu] = useState<'esconder' | 'todos' | 'so'>('esconder');
  const [sel, setSel] = useState<ReadonlySet<string>>(new Set());
  const [confOptout, setConfOptout] = useState<Elegivel | null>(null);

  const elegiveis = elegQ.data ?? [];
  const contatados = contQ.data ?? [];
  const etapasKanban = useMemo(() => {
    const m = new Map<string, { ordem: number; total: number }>();
    for (const e of elegiveis) {
      const cur = m.get(e.etapa) ?? { ordem: e.etapa_ordem, total: 0 };
      cur.total += 1; m.set(e.etapa, cur);
    }
    return [...m.entries()].sort((a, b) => a[1].ordem - b[1].ordem).map(([nome, v]) => ({ nome, total: v.total }));
  }, [elegiveis]);
  const generoDe = useMemo(() => new Map(elegiveis.map((e) => [e.contato_id, inferirGenero(e.nome)])), [elegiveis]);
  const porGenero = useMemo(() => {
    const c = { homem: 0, mulher: 0, ambiguo: 0 };
    for (const g of generoDe.values()) c[g] += 1;
    return c;
  }, [generoDe]);
  const jaRecebeuNoFiltro = useMemo(
    () => elegiveis.filter((e) => e.ja_recebeu).length,
    [elegiveis],
  );
  const listaPublico = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return elegiveis.filter((e) =>
      (etapasSel.size === 0 || etapasSel.has(e.etapa)) &&
      (generoSel.size === 0 || generoSel.has(generoDe.get(e.contato_id) ?? 'ambiguo')) &&
      (modoJaRecebeu === 'todos' || (modoJaRecebeu === 'so' ? e.ja_recebeu : !e.ja_recebeu)) &&
      (!q || e.nome.toLowerCase().includes(q) || (e.telefone ?? '').includes(q)));
  }, [elegiveis, busca, etapasSel, generoSel, generoDe, modoJaRecebeu]);
  const selecionaveis = useMemo(() => listaPublico.filter((e) => !e.optout), [listaPublico]);
  // pool de resolução da seleção: elegíveis + contatados (para o re-disparo caber no fluxo).
  const porContato = useMemo(() => {
    const m = new Map<string, Elegivel>();
    for (const e of elegiveis) m.set(e.contato_id, e);
    for (const c of contatados) if (!m.has(c.contato_id)) m.set(c.contato_id, contatadoParaElegivel(c));
    return m;
  }, [elegiveis, contatados]);
  const selecionados = useMemo(
    () => [...sel].map((id) => porContato.get(id)).filter(Boolean) as Elegivel[],
    [sel, porContato],
  );

  const alternarEtapaKanban = (nome: string) => setEtapasSel((s) => {
    const n = new Set(s); if (n.has(nome)) n.delete(nome); else n.add(nome); return n;
  });
  const alternarGenero = (g: Genero) => setGeneroSel((s) => {
    const n = new Set(s); if (n.has(g)) n.delete(g); else n.add(g); return n;
  });
  /** "Quero N": marca N pessoas DENTRO do filtro atual — mais recentes ou mais antigos
   *  (ordem de última mensagem) ou sorteio (Fisher–Yates). Substitui a seleção, nunca soma. */
  const selecionarN = () => {
    const pool = [...selecionaveis];
    if (modoQtd === 'recentes') {
      pool.sort((a, b) => new Date(b.ultima_msg_em ?? 0).getTime() - new Date(a.ultima_msg_em ?? 0).getTime());
    } else if (modoQtd === 'antigos') {
      pool.sort((a, b) => new Date(a.ultima_msg_em ?? 0).getTime() - new Date(b.ultima_msg_em ?? 0).getTime());
    } else {
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
    }
    setSel(new Set(pool.slice(0, qtd).map((e) => e.contato_id)));
  };
  const alternarPessoa = (e: Elegivel) => {
    if (e.optout) return;
    setSel((s) => { const n = new Set(s); if (n.has(e.contato_id)) n.delete(e.contato_id); else n.add(e.contato_id); return n; });
  };
  const alternarContato = (id: string, optout: boolean) => {
    if (optout) return;
    setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  };
  const todosFiltradosMarcados = selecionaveis.length > 0 && selecionaveis.every((e) => sel.has(e.contato_id));

  /* ================= etapa 2: template ================= */
  const [templateId, setTemplateId] = useState('');
  const template: WaTemplate | null = useMemo(
    () => (tplQ.data ?? []).find((t) => t.id === templateId) ?? null,
    [tplQ.data, templateId],
  );
  /* campanha ativa → o template é o dela (trava a escolha) */
  const templateDaCampanha: WaTemplate | null = useMemo(
    () => (campanha ? (tplQ.data ?? []).find((t) => t.id === campanha.template_id) ?? null : null),
    [campanha, tplQ.data],
  );
  const tplEfetivo = campanha ? templateDaCampanha : template;

  /* ================= etapa 3: revisar ================= */
  const semNome = useMemo(
    () => selecionados.filter((e) => !primeiroNomeApresentavel(e.nome)).length,
    [selecionados],
  );

  /* ================= etapa 4: disparar ================= */
  const [lote, setLote] = useState(12);
  const [previa, setPrevia] = useState<ResultadoProcessar | null>(null);
  const [confDisparo, setConfDisparo] = useState(false);
  const [confEncerrar, setConfEncerrar] = useState(false);
  const [confRearmar, setConfRearmar] = useState(false);
  const [confExcluir, setConfExcluir] = useState<CampanhaResumo | null>(null);
  const [remarketAberto, setRemarketAberto] = useState(false);
  const [rmTemplate, setRmTemplate] = useState('');
  const [rmNome, setRmNome] = useState('');
  const [rmPrevia, setRmPrevia] = useState<RemarketingPrevia | null>(null);
  const [filtros, setFiltros] = useState<FiltrosPessoas>(FILTROS0);
  const setF = (patch: Partial<FiltrosPessoas>) => setFiltros((f) => ({ ...f, ...patch }));
  const [timelineContato, setTimelineContato] = useState<CampanhaPessoa | null>(null);
  const pessoasFiltradas = useMemo(
    () => (pessoasQ.data ?? []).filter((p) => passaFiltro(p, filtros)),
    [pessoasQ.data, filtros],
  );
  // opções dos seletores (só o que existe na campanha)
  const etapasOpts = useMemo(() => [...new Set((pessoasQ.data ?? []).map((p) => p.etapa_kanban).filter(Boolean))] as string[], [pessoasQ.data]);
  const templatesOpts = useMemo(() => [...new Set((pessoasQ.data ?? []).map((p) => p.template_nome).filter(Boolean))] as string[], [pessoasQ.data]);
  const atendentesOpts = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of pessoasQ.data ?? []) if (p.atendente_id && p.atendente) m.set(p.atendente_id, p.atendente);
    return [...m.entries()];
  }, [pessoasQ.data]);
  const timelineQ = useContatoTimeline(campanha?.id ?? null, timelineContato?.contato_id ?? null);
  // Ordenação do relatório (tabela): campo + direção.
  const [ordRel, setOrdRel] = useState<{ campo: 'nome' | 'status' | 'etapa_kanban' | 'atendente' | 'fechou' | 'chamou_murillo' | 'template_nome' | 'enviado_em'; asc: boolean }>({ campo: 'enviado_em', asc: false });
  const ordenarPor = (campo: typeof ordRel.campo) => setOrdRel((o) => ({ campo, asc: o.campo === campo ? !o.asc : true }));
  const pessoasOrdenadas = useMemo(() => {
    const arr = [...pessoasFiltradas];
    const { campo, asc } = ordRel;
    const chave = (p: CampanhaPessoa): string | number =>
      campo === 'fechou' ? (p.fechou ? 1 : 0)
      : campo === 'chamou_murillo' ? (p.chamou_murillo ? 1 : 0)
      : campo === 'enviado_em' ? (p.enviado_em ?? '')
      : (p[campo] ?? '') as string;
    arr.sort((a, b) => {
      const va = chave(a), vb = chave(b);
      const cmp = typeof va === 'number' && typeof vb === 'number'
        ? va - vb
        : String(va).localeCompare(String(vb), 'pt', { numeric: true, sensitivity: 'base' });
      return asc ? cmp : -cmp;
    });
    return arr;
  }, [pessoasFiltradas, ordRel]);
  // Quem pode ser re-armado no "Disparar de novo": só quem AINDA está em Lead Novo
  // (coluna de entrada) e não respondeu — espelha a regra do disparo_rearmar no banco.
  const reArmaveis = useMemo(
    () => (pessoasQ.data ?? []).filter(
      (p) => (p.status === 'enviado' || p.status === 'falhou' || p.status === 'pulado') && p.etapa_kanban === 'Lead Novo',
    ).length,
    [pessoasQ.data],
  );
  // Visão geral (agregado de todas as campanhas) para o topo da lista.
  const visaoGeral = useMemo(() => {
    const cs = campResumoQ.data ?? [];
    const enviados = cs.reduce((s, c) => s + c.enviados, 0);
    const respondidos = cs.reduce((s, c) => s + c.respondidos, 0);
    const fecharam = cs.reduce((s, c) => s + c.fecharam, 0);
    return { campanhas: cs.length, enviados, respondidos, fecharam };
  }, [campResumoQ.data]);
  // Métricas do dashboard da campanha aberta (custo, CAC, SLA) — base = enviados do log.
  // Exporta o relatório da campanha aberta em CSV (abre no Excel/Sheets).
  const exportarCSV = () => {
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const head = ['Nome', 'WhatsApp', 'Status', 'Respondeu', 'Chamou Murillo', 'Etapa Kanban', 'Atendente', 'Fechou', 'Template', 'Enviado em'];
    const linhas = pessoasOrdenadas.map((p) => [
      p.nome, p.telefone ?? '', stAlvo(p.status).rotulo, p.status === 'respondido' ? 'Sim' : 'Não',
      p.chamou_murillo ? 'Sim' : 'Não', p.etapa_kanban ?? '', p.atendente ?? '',
      p.fechou ? 'Sim' : 'Não', p.template_nome ?? '', p.enviado_em ?? '',
    ].map(esc).join(','));
    const csv = '﻿' + [head.map(esc).join(','), ...linhas].join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `campanha-${(campanha?.nome ?? 'disparo').replace(/[^\w.-]+/g, '_')}.csv`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  };
  // Cabeçalho de coluna clicável (ordena o relatório).
  const cabOrd = (campo: typeof ordRel.campo, label: string) => (
    <button type="button" className="dsp-th" onClick={() => ordenarPor(campo)}>
      {label}<span className="dsp-th-arr" aria-hidden>{ordRel.campo === campo ? (ordRel.asc ? '↑' : '↓') : '↕'}</span>
    </button>
  );
  const colsRelatorio: Coluna<CampanhaPessoa>[] = [
    { chave: 'nome', titulo: cabOrd('nome', 'Nome'), classe: 'nome', render: (p) => p.nome || '—' },
    { chave: 'tel', titulo: 'WhatsApp', classe: 'num', render: (p) => fmtTel(p.telefone) },
    { chave: 'status', titulo: cabOrd('status', 'Disparo'), render: (p) => <BadgeStatus tom={stAlvo(p.status).tom}>{stAlvo(p.status).rotulo}</BadgeStatus> },
    { chave: 'etapa', titulo: cabOrd('etapa_kanban', 'Kanban'), render: (p) => p.etapa_kanban ? <BadgeStatus tom="neutro">{p.etapa_kanban}</BadgeStatus> : '—' },
    { chave: 'atendente', titulo: cabOrd('atendente', 'Atendente'), render: (p) => p.atendente ? p.atendente : <span className="dsp-sem-at">sem atendente</span> },
    { chave: 'resp', titulo: cabOrd('status', 'Respondeu'), render: (p) => p.status === 'respondido' ? <BadgeStatus tom="ok">Sim</BadgeStatus> : '—' },
    { chave: 'mur', titulo: cabOrd('chamou_murillo', 'Murillo'), render: (p) => p.chamou_murillo ? <BadgeStatus tom="atencao">Chamou</BadgeStatus> : '—' },
    { chave: 'fechou', titulo: cabOrd('fechou', 'Fechou'), render: (p) => p.fechou ? <BadgeStatus tom="ok">Fechou ✓</BadgeStatus> : '—' },
    { chave: 'tpl', titulo: cabOrd('template_nome', 'Template'), classe: 'num', render: (p) => p.template_nome ?? '—' },
    { chave: 'enviado', titulo: cabOrd('enviado_em', 'Enviado'), dir: true, classe: 'num', render: (p) => (p.enviado_em ? tempoRelativo(p.enviado_em, agoraMs) : '—') },
  ];
  // ----- relatório de atendentes (Fase B): ordenação + colunas -----
  const taxaFech = (a: CampanhaAtendente) => (a.atribuidos > 0 ? a.fecharam / a.atribuidos : 0);
  const atendentesOrdenados = useMemo(() => {
    const arr = [...(atendentesQ.data ?? [])];
    const { campo, asc } = ordAt;
    const val = (x: CampanhaAtendente): string | number | null =>
      campo === 'taxa' ? taxaFech(x) : campo === 'atendente' ? x.atendente : x[campo];
    arr.sort((a, b) => {
      const va = val(a), vb = val(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;   // sem dado (ex.: SLA de "sem atendente") sempre no fim
      if (vb == null) return -1;
      const c = typeof va === 'number' && typeof vb === 'number'
        ? va - vb : String(va).localeCompare(String(vb), 'pt', { numeric: true });
      return asc ? c : -c;
    });
    return arr;
  }, [atendentesQ.data, ordAt]);
  const cabOrdAt = (campo: typeof ordAt.campo, label: string) => (
    <button type="button" className="dsp-th" onClick={() => setOrdAt((o) => ({ campo, asc: o.campo === campo ? !o.asc : (campo === 'atendente') }))}>
      {label}<span className="dsp-th-arr" aria-hidden>{ordAt.campo === campo ? (ordAt.asc ? '↑' : '↓') : '↕'}</span>
    </button>
  );
  const pctBadge = (n: number, base: number) => {
    const p = pct(n, base);
    return <><strong className="num">{n}</strong> <span className="dsp-th-arr num">{p}%</span></>;
  };
  const colsAtendentes: Coluna<CampanhaAtendente>[] = [
    { chave: 'at', titulo: cabOrdAt('atendente', 'Atendente'), classe: 'nome', render: (a) => a.atendente_id ? a.atendente : <span className="dsp-sem-at">Sem atendente</span> },
    { chave: 'atr', titulo: cabOrdAt('atribuidos', 'Leads'), dir: true, classe: 'num', render: (a) => a.atribuidos },
    { chave: 'resp', titulo: cabOrdAt('responderam', 'Responderam'), dir: true, classe: 'num', render: (a) => pctBadge(a.responderam, a.atribuidos) },
    { chave: 'avc', titulo: cabOrdAt('avancaram_murillo', 'Avançaram/Murillo'), dir: true, classe: 'num', render: (a) => pctBadge(a.avancaram_murillo, a.atribuidos) },
    { chave: 'fec', titulo: cabOrdAt('fecharam', 'Fecharam'), dir: true, classe: 'num', render: (a) => <strong className="num">{a.fecharam}</strong> },
    { chave: 'tx', titulo: cabOrdAt('taxa', 'Taxa fech.'), dir: true, classe: 'num', render: (a) => <strong className="num">{pct(a.fecharam, a.atribuidos)}%</strong> },
    { chave: 'sla', titulo: cabOrdAt('sla_time_seg', 'Resp. atendente'), dir: true, classe: 'num', render: (a) => fmtDur(a.sla_time_seg) },
    { chave: 'par', titulo: cabOrdAt('parados', 'Parados'), dir: true, classe: 'num', render: (a) => a.parados > 0 ? <span className="dsp-sem-at">{a.parados}</span> : '0' },
  ];
  // ----- Fase D: remarketing por filtro (a seleção filtrada É o alvo) -----
  const alvoRemarketing = () => pessoasFiltradas.map((p) => p.contato_id);
  const canalEhTrafego = /91781390$/.test((canalCloud?.numero_conectado ?? '').replace(/\D/g, ''));
  const abrirRemarketing = () => { setRmTemplate(''); setRmNome(''); setRmPrevia(null); setRemarketAberto(true); };
  const rodarPreviaRm = async (tplId: string) => {
    if (!campanha || !tplId) { setRmPrevia(null); return; }
    try { setRmPrevia(await remarketing.mutateAsync({ origem: campanha.id, template_id: tplId, contatos: alvoRemarketing(), dry_run: true })); }
    catch (e) { erro((e as Error).message); setRmPrevia(null); }
  };
  const criarRemarketing = async () => {
    if (!campanha || !rmTemplate) return;
    try {
      const r = await remarketing.mutateAsync({ origem: campanha.id, template_id: rmTemplate, contatos: alvoRemarketing(), dry_run: false, nome: rmNome || undefined });
      setRemarketAberto(false); setRmPrevia(null); setRmTemplate(''); setRmNome('');
      ok(`Campanha de remarketing criada: ${r.armados} na fila. Nada saiu ainda — use "Disparar lote" pra enviar.`);
      if (r.campanha_id) abrirCampanha(r.campanha_id);
    } catch (e) { erro((e as Error).message); }
  };
  const [resultado, setResultado] = useState<ResultadoProcessar | null>(null);
  const [criandoCampanha, setCriandoCampanha] = useState(false);
  const [nomeNovaCampanha, setNomeNovaCampanha] = useState('');

  const alvos = alvosQ.data ?? [];
  const porStatus = useMemo(() => {
    const c: Record<string, number> = { pendente: 0, enviado: 0, respondido: 0, falhou: 0, optout: 0, pulado: 0 };
    for (const a of alvos) c[a.status] = (c[a.status] ?? 0) + 1;
    return c;
  }, [alvos]);
  // Métricas do dashboard — BASE ÚNICA no log disparo_envios (imune ao re-arme):
  // enviados = pessoas alcançadas (funil/taxas); mensagens = total de envios (CUSTO).
  const dash = useMemo(() => {
    const r = resultadoQ.data;
    const enviados = r?.enviados ?? 0;
    const mensagens = r?.mensagens ?? 0;
    const responderam = r?.responderam ?? 0;
    const murillo = r?.chamaram_murillo ?? 0;
    const fecharam = r?.fecharam ?? 0;
    const custo = mensagens * CUSTO_MSG;
    return {
      enviados, mensagens, responderam, murillo, fecharam, custo,
      cac: fecharam > 0 ? custo / fecharam : null,
      custoResp: responderam > 0 ? custo / responderam : null,
      sla: r?.tempo_1a_resposta_seg ?? null,
    };
  }, [resultadoQ.data]);

  const criarCampanhaComPublico = async () => {
    if (!canalCloud) { erro('Nenhum canal Cloud API conectado.'); return; }
    if (!template) { erro('Escolha o template na etapa 2.'); return; }
    if (!selecionados.length) { erro('Selecione o público na etapa 1.'); return; }
    setCriandoCampanha(true);
    try {
      const nome = nomeNovaCampanha.trim() || `${template.nome} · ${new Date().toLocaleDateString('pt-BR')}`;
      const id = await criar.mutateAsync({ nome, template_id: template.id, canal_id: canalCloud.id });
      const r = await addAlvos.mutateAsync({ campanha_id: id, contatos: selecionados.map((e) => e.contato_id) });
      setSel(new Set()); setNomeNovaCampanha('');
      // abre a campanha recém-criada no acompanhamento
      setCampanhaSelId(id); setModoCriar(false); setEtapa(4);
      ok(`Campanha "${nome}" criada: ${r.pendentes} na fila · ${r.optout} em opt-out · ${r.sem_whatsapp} sem WhatsApp.`);
    } catch (e) { erro((e as Error).message); } finally { setCriandoCampanha(false); }
  };

  /** Troca o template da campanha ABERTA (só aprovado; back valida permissão). */
  const trocarTemplateCampanha = async (templateIdNovo: string) => {
    if (!campanha) return;
    try {
      await trocar.mutateAsync({ campanha_id: campanha.id, template_id: templateIdNovo });
      ok('Template da campanha trocado.');
    } catch (e) { erro((e as Error).message); }
  };

  const adicionarMaisNaCampanha = async () => {
    if (!campanha || !selecionados.length) return;
    try {
      const r = await addAlvos.mutateAsync({ campanha_id: campanha.id, contatos: selecionados.map((e) => e.contato_id) });
      setSel(new Set()); setEtapa(4);
      ok(`Adicionados: ${r.pendentes} novos · ${r.ja_existiam} já estavam na campanha.`);
    } catch (e) { erro((e as Error).message); }
  };

  const simular = async () => {
    if (!campanha) return;
    try { setPrevia(await processar.mutateAsync({ campanha_id: campanha.id, lote, dry_run: true })); }
    catch (e) { erro((e as Error).message); }
  };
  const disparar = async () => {
    if (!campanha) return;
    setConfDisparo(false);
    try {
      const r = await processar.mutateAsync({ campanha_id: campanha.id, lote, dry_run: false });
      setResultado(r);
      ok(`Lote concluído: ${r.enviados ?? 0} enviados · ${r.falhas ?? 0} falhas · ${r.optouts ?? 0} opt-out. Restam ${r.restante_teto ?? '—'} no teto de 24h.`);
    } catch (e) { erro((e as Error).message); }
  };

  /* ================= aba excluídos ================= */
  const [confDesfazer, setConfDesfazer] = useState<OptoutRow | null>(null);
  const COLS_OPTOUT: Coluna<OptoutRow>[] = [
    { chave: 'nome', titulo: 'Contato', classe: 'nome', render: (o) => o.nome || '—' },
    { chave: 'tel', titulo: 'WhatsApp', classe: 'num', render: (o) => fmtTel(o.telefone) },
    { chave: 'motivo', titulo: 'Motivo', render: (o) => <BadgeStatus tom={o.motivo === 'manual' ? 'neutro' : 'atencao'}>{MOTIVO_ROTULO[o.motivo] ?? o.motivo}</BadgeStatus> },
    { chave: 'detalhe', titulo: 'Detalhe', render: (o) => o.detalhe ?? '' },
    { chave: 'quando', titulo: 'Quando', dir: true, classe: 'num', render: (o) => tempoRelativo(o.criado_em, agoraMs) },
    { chave: 'acoes', titulo: '', dir: true, render: (o) => <BotaoMini onClick={() => setConfDesfazer(o)}>Desfazer</BotaoMini> },
  ];

  /* ================= aba já contatados ================= */
  const selCont = useMemo(() => contatados.filter((c) => !c.optout), [contatados]);
  const todosContMarcados = selCont.length > 0 && selCont.every((c) => sel.has(c.contato_id));
  const COLS_CONT: Coluna<Contatado>[] = [
    { chave: 'sel', titulo: '', render: (c) => (
      <input type="checkbox" className="dsp-check" checked={sel.has(c.contato_id)} disabled={c.optout}
        onChange={() => alternarContato(c.contato_id, c.optout)} aria-label={`Selecionar ${c.nome}`} />
    ) },
    { chave: 'nome', titulo: 'Contato', classe: 'nome', render: (c) => c.nome || '—' },
    { chave: 'tel', titulo: 'WhatsApp', classe: 'num', render: (c) => fmtTel(c.telefone) },
    { chave: 'total', titulo: 'Disparos', dir: true, classe: 'num', render: (c) => c.total_disparos },
    { chave: 'ult', titulo: 'Último', dir: true, classe: 'num', render: (c) => (c.ultimo_em ? tempoRelativo(c.ultimo_em, agoraMs) : '—') },
    { chave: 'camp', titulo: 'Última campanha', render: (c) => c.ultima_campanha ?? '—' },
    { chave: 'st', titulo: '', dir: true, render: (c) => (c.optout ? <BadgeStatus tom="erro">Opt-out</BadgeStatus> : null) },
  ];
  // "Disparar de novo" (aba Já contatados): abre o fluxo de NOVA campanha já com os
  // selecionados no público (mantém `sel`), pra escolher template e criar campanha à parte.
  const reDisparar = () => { setCampanhaSelId(null); setModoCriar(true); setAba('campanha'); setEtapa(selecionados.length ? 2 : 1); };

  /* ================= render ================= */
  const carregando = elegQ.isLoading || campQ.isLoading;
  const podeIr = (alvo: Etapa): boolean => {
    if (campanha) return true;                             // acompanhamento livre
    if (alvo >= 2 && selecionados.length === 0) return false;
    if (alvo >= 3 && !template) return false;
    return true;
  };
  const irPara = (alvo: Etapa) => { if (podeIr(alvo)) setEtapa(alvo); };

  const previewGrande = (tpl: WaTemplate | null, nomeExemplo?: string) => (
    <div className="dsp-bolha" aria-label="Prévia da mensagem">
      {tpl
        ? <p>{preencherTemplate(tpl.corpo, tpl.variaveis, nomeExemplo ?? (selecionados[0]?.nome ?? ''))}</p>
        : <p className="dsp-nota">Escolha um template aprovado para ver a mensagem.</p>}
    </div>
  );

  const cardPessoa = (e: Elegivel, opts?: { comPrevia?: boolean }) => {
    const marcado = sel.has(e.contato_id);
    const previa = opts?.comPrevia && tplEfetivo
      ? preencherTemplate(tplEfetivo.corpo, tplEfetivo.variaveis, e.nome)
      : null;
    return (
      <button
        type="button"
        key={e.contato_id}
        className={['dsp-card', marcado ? 'on' : '', e.optout ? 'off' : ''].filter(Boolean).join(' ')}
        onClick={() => alternarPessoa(e)}
        aria-pressed={marcado}
        disabled={e.optout}
      >
        <div className="dsp-card-cab">
          <span className="dsp-av" aria-hidden>{iniciais(e.nome)}</span>
          <span className="dsp-card-id">
            <strong>{e.nome || '—'}</strong>
            <span className="num">{fmtTel(e.telefone)}</span>
          </span>
          <span className={marcado ? 'dsp-tick on' : 'dsp-tick'} aria-hidden>✓</span>
        </div>
        <div className="dsp-card-tags">
          <BadgeStatus tom={e.etapa === 'REMARKETING' ? 'atencao' : 'neutro'}>{e.etapa}</BadgeStatus>
          {e.tipo_servico && <BadgeStatus tom="neutro">{e.tipo_servico}</BadgeStatus>}
          {e.ja_recebeu && <BadgeStatus tom="atencao">já recebeu</BadgeStatus>}
          {e.optout && <BadgeStatus tom="erro">Opt-out</BadgeStatus>}
        </div>
        <div className="dsp-card-meta num">
          {e.ultima_msg_em ? `falou ${tempoRelativo(e.ultima_msg_em, agoraMs)}` : 'sem mensagem'}
          {e.canal_origem ? ` · via ${e.canal_origem}` : ''}
        </div>
        {previa && <p className="dsp-card-previa">{previa}</p>}
        {!e.optout && (
          <span
            role="button"
            tabIndex={0}
            className="dsp-card-opt"
            onClick={(ev) => { ev.stopPropagation(); setConfOptout(e); }}
            onKeyDown={(ev) => { if (ev.key === 'Enter') { ev.stopPropagation(); setConfOptout(e); } }}
          >
            marcar opt-out
          </span>
        )}
      </button>
    );
  };

  return (
    <div className="pg-disparo">
      <header className="dsp-cab sobe">
        <div>
          <h1>Disparo</h1>
          <p className="sub">Campanha de template aprovado pelo canal oficial · opt-out respeitado sempre · teto {campanha?.teto_24h ?? 200}/24h no servidor</p>
        </div>
        <Chips>
          <Chip ativo={aba === 'campanha'} onClick={() => setAba('campanha')}>Campanha</Chip>
          <Chip ativo={aba === 'contatados'} onClick={() => setAba('contatados')}>Já contatados {contatados.length}</Chip>
          <Chip ativo={aba === 'excluidos'} onClick={() => setAba('excluidos')}>Excluídos {optQ.data?.length ?? 0}</Chip>
        </Chips>
      </header>

      {aviso && <div className={aviso.tom === 'ok' ? 'dsp-aviso ok' : 'dsp-aviso erro'} role="status">{aviso.texto}</div>}

      {carregando ? (
        <CardVidro style={{ borderRadius: 12, padding: 16 }}><SkeletonTexto linhas={6} /></CardVidro>
      ) : aba === 'contatados' ? (
        <CardVidro spot sobe style={{ borderRadius: 12 }}>
          {contQ.isLoading ? (
            <div style={{ padding: 16 }}><SkeletonTexto linhas={6} /></div>
          ) : contatados.length === 0 ? (
            <EstadoVazio titulo="Ninguém recebeu disparo ainda" descricao="Assim que uma campanha enviar, quem receber aparece aqui — para você disparar de novo para os mesmos depois, sem repetir sem querer." />
          ) : (
            <>
              <div className="dsp-cont-barra">
                <span className="num"><strong>{contatados.length}</strong> já receberam · {selecionados.length} selecionado{selecionados.length === 1 ? '' : 's'}</span>
                <div className="dsp-cont-acoes">
                  <BotaoSec onClick={() => setSel(todosContMarcados ? new Set() : new Set(selCont.map((c) => c.contato_id)))}>
                    {todosContMarcados ? 'Desmarcar todos' : `Selecionar os ${selCont.length}`}
                  </BotaoSec>
                  <BotaoPrimario disabled={!selecionados.length} onClick={reDisparar}>
                    Disparar de novo{selecionados.length ? ` (${selecionados.length})` : ''} →
                  </BotaoPrimario>
                </div>
              </div>
              <TabelaPadrao colunas={COLS_CONT} linhas={contatados} chave={(c) => c.contato_id} rodape={{ texto: `${contatados.length} contatos já disparados · opt-out é barrado no envio` }} />
            </>
          )}
        </CardVidro>
      ) : aba === 'excluidos' ? (
        <CardVidro spot sobe style={{ borderRadius: 12 }}>
          {(optQ.data ?? []).length === 0 ? (
            <EstadoVazio titulo="Ninguém em opt-out" descricao="Quem responder SAIR (ou for marcado manualmente) aparece aqui e nunca mais recebe disparo." />
          ) : (
            <TabelaPadrao colunas={COLS_OPTOUT} linhas={optQ.data ?? []} chave={(o) => o.contato_id} rodape={{ texto: `${optQ.data?.length ?? 0} contatos fora de qualquer disparo` }} />
          )}
        </CardVidro>
      ) : campanhaSelId === null && !modoCriar ? (
        /* ===== LISTA DE CAMPANHAS ===== */
        <CardVidro spot sobe style={{ borderRadius: 12, padding: 16 }}>
          {visaoGeral.enviados > 0 && (
            <div className="dsp-visao">
              <div className="dsp-visao-item">
                <span className="dsp-visao-n num">{visaoGeral.enviados.toLocaleString('pt-BR')}</span>
                <span className="dsp-visao-r">enviados no total</span>
              </div>
              <div className="dsp-visao-item">
                <span className="dsp-visao-n num">{pct(visaoGeral.respondidos, visaoGeral.enviados)}%</span>
                <span className="dsp-visao-r">taxa de resposta · {visaoGeral.respondidos}</span>
              </div>
              <div className="dsp-visao-item">
                <span className="dsp-visao-n num">{pct(visaoGeral.fecharam, visaoGeral.enviados)}%</span>
                <span className="dsp-visao-r">taxa de fechamento · {visaoGeral.fecharam}</span>
              </div>
              <div className="dsp-visao-item">
                <span className="dsp-visao-n num">{visaoGeral.campanhas}</span>
                <span className="dsp-visao-r">campanhas</span>
              </div>
            </div>
          )}
          <div className="dsp-cont-barra">
            <span className="num"><strong>{(campResumoQ.data ?? []).length}</strong> campanha{(campResumoQ.data ?? []).length === 1 ? '' : 's'}</span>
            <BotaoPrimario onClick={novaCampanha}>+ Nova campanha</BotaoPrimario>
          </div>
          {campResumoQ.isLoading ? (
            <SkeletonTexto linhas={6} />
          ) : (campResumoQ.data ?? []).length === 0 ? (
            <EstadoVazio titulo="Nenhuma campanha ainda" descricao="Crie a primeira: escolha o público, o template e dispare em lotes." acao={{ rotulo: 'Nova campanha', onClick: novaCampanha }} />
          ) : (
            <div className="dsp-camp-lista">
              {(campResumoQ.data ?? []).map((c: CampanhaResumo) => (
                <div className="dsp-camp-wrap" key={c.id}>
                  <button type="button" className="dsp-camp-item" onClick={() => abrirCampanha(c.id)}>
                    <div className="dsp-camp-topo">
                      <strong>{c.nome}</strong>
                      <BadgeStatus tom={ST_CAMP[c.status]?.tom ?? 'neutro'}>{ST_CAMP[c.status]?.rotulo ?? c.status}</BadgeStatus>
                    </div>
                    <div className="dsp-camp-meta num">
                      template <strong>{c.template_nome ?? '—'}</strong> · canal {c.canal_nome ?? '—'} · criada {tempoRelativo(c.criado_em, agoraMs)}
                    </div>
                    <div className="dsp-camp-nums">
                      <span><strong className="num">{c.total}</strong> alvos</span>
                      <span><strong className="num">{c.enviados}</strong> enviados</span>
                      <span><strong className="num">{c.respondidos}</strong> resp · {pct(c.respondidos, c.enviados)}%</span>
                      <span><strong className="num">{c.fecharam}</strong> fech · {pct(c.fecharam, c.enviados)}%</span>
                      <span><strong className="num">{c.pendentes}</strong> pendentes</span>
                    </div>
                  </button>
                  <button type="button" className="dsp-camp-x" title="Excluir campanha" aria-label={`Excluir campanha ${c.nome}`} onClick={() => setConfExcluir(c)}>×</button>
                </div>
              ))}
            </div>
          )}
        </CardVidro>
      ) : (
        <>
          {/* voltar para a lista de campanhas */}
          <div className="dsp-voltar">
            <BotaoSec onClick={voltarLista}>← Campanhas</BotaoSec>
            <span className="dsp-voltar-nome">{campanha ? campanha.nome : 'Nova campanha'}</span>
          </div>
          {/* -------- resumo da campanha (sempre visível) -------- */}
          <CardVidro spot sobe className="dsp-resumo" style={{ borderRadius: 12, padding: '12px 16px' }}>
            <div className="dsp-resumo-linha">
              <span><strong className="num">{campanha ? alvos.length : selecionados.length}</strong> {campanha ? 'na campanha' : 'selecionados'}</span>
              <span aria-hidden>·</span>
              <span>template <strong>{tplEfetivo?.nome ?? '—'}</strong></span>
              <span aria-hidden>·</span>
              <span>lote de <strong className="num">{lote}</strong></span>
              <span aria-hidden>·</span>
              <span>canal <strong>{canalCloud?.nome_interno ?? '—'}</strong></span>
              {campanha && (
                <>
                  <span aria-hidden>·</span>
                  <BadgeStatus tom="ok">campanha ativa</BadgeStatus>
                </>
              )}
            </div>
            <nav className="dsp-passos" aria-label="Etapas do disparo">
              {([1, 2, 3, 4] as Etapa[]).map((n) => (
                <button
                  type="button"
                  key={n}
                  className={['dsp-passo', etapa === n ? 'on' : '', !podeIr(n) ? 'trava' : ''].filter(Boolean).join(' ')}
                  onClick={() => irPara(n)}
                  disabled={!podeIr(n)}
                >
                  <span className="num">{n}</span> {ROTULO_ETAPA[n]}
                </button>
              ))}
            </nav>
          </CardVidro>

          {/* ================= 1 · PÚBLICO ================= */}
          {etapa === 1 && (
            <>
              <CardVidro spot sobe className="dsp-fpainel" style={{ borderRadius: 12, padding: '14px 16px', animationDelay: '.05s' }}>
                {/* BLOCO 1 — filtros: define QUEM é o público */}
                <div className="dsp-fbloco">
                  <div className="dsp-fgrupo">
                    <span className="dsp-flabel">Etapa do Kanban</span>
                    <Chips>
                      <Chip ativo={etapasSel.size === 0} onClick={() => setEtapasSel(new Set())}>Todas {elegiveis.length}</Chip>
                      {etapasKanban.map((et) => (
                        <Chip key={et.nome} ativo={etapasSel.has(et.nome)} onClick={() => alternarEtapaKanban(et.nome)}>{et.nome} {et.total}</Chip>
                      ))}
                    </Chips>
                  </div>
                  <div className="dsp-fgrupo">
                    <span className="dsp-flabel">Gênero (pelo primeiro nome)</span>
                    <Chips>
                      <Chip ativo={generoSel.size === 0} onClick={() => setGeneroSel(new Set())}>Todos</Chip>
                      <Chip ativo={generoSel.has('homem')} onClick={() => alternarGenero('homem')}>♂ Homens {porGenero.homem}</Chip>
                      <Chip ativo={generoSel.has('mulher')} onClick={() => alternarGenero('mulher')}>♀ Mulheres {porGenero.mulher}</Chip>
                      <Chip ativo={generoSel.has('ambiguo')} onClick={() => alternarGenero('ambiguo')}>? Incertos {porGenero.ambiguo}</Chip>
                    </Chips>
                  </div>
                  <div className="dsp-fgrupo">
                    <span className="dsp-flabel">Busca</span>
                    <div className="dsp-busca">
                      <Input placeholder="Nome ou telefone…" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar no público elegível" />
                    </div>
                  </div>
                  <div className="dsp-fgrupo">
                    <span className="dsp-flabel">Já contatados</span>
                    <Chips>
                      <Chip ativo={modoJaRecebeu === 'esconder'} onClick={() => setModoJaRecebeu('esconder')}>Esconder quem já recebeu {jaRecebeuNoFiltro > 0 ? `(${jaRecebeuNoFiltro})` : ''}</Chip>
                      <Chip ativo={modoJaRecebeu === 'todos'} onClick={() => setModoJaRecebeu('todos')}>Mostrar todos</Chip>
                      <Chip ativo={modoJaRecebeu === 'so'} onClick={() => setModoJaRecebeu('so')}>Só quem já recebeu {jaRecebeuNoFiltro > 0 ? `(${jaRecebeuNoFiltro})` : ''}</Chip>
                    </Chips>
                  </div>
                </div>

                {/* BLOCO 2 — quantidade: QUANTOS desse público */}
                <div className="dsp-fbloco dsp-fbloco-qtd">
                  <div className="dsp-fgrupo">
                    <span className="dsp-flabel">Quantidade</span>
                    <div className="dsp-fqtd-linha">
                      <span className="num">Quero</span>
                      <input
                        className="inp dsp-lote-inp num" type="number" min={1} max={999}
                        value={qtd} onChange={(e) => setQtd(Math.min(999, Math.max(1, Number(e.target.value) || 1)))}
                        aria-label="Quantidade de pessoas"
                      />
                      <span className="num">pessoas,</span>
                      <select className="inp dsp-fsel" value={modoQtd} onChange={(e) => setModoQtd(e.target.value as 'recentes' | 'antigos' | 'aleatorio')} aria-label="Critério de seleção">
                        <option value="recentes">recentes</option>
                        <option value="antigos">antigos</option>
                        <option value="aleatorio">aleatórios</option>
                      </select>
                      <BotaoSec onClick={selecionarN}>Selecionar {Math.min(qtd, selecionaveis.length)}</BotaoSec>
                      <BotaoSec onClick={() => setSel(todosFiltradosMarcados ? new Set() : new Set(selecionaveis.map((e) => e.contato_id)))}>
                        {todosFiltradosMarcados ? 'Desmarcar todos' : `Todos os ${selecionaveis.length}`}
                      </BotaoSec>
                    </div>
                  </div>
                  <div className="dsp-fdisp" aria-live="polite">
                    <strong className="num">{selecionaveis.length}</strong>
                    <span>disponíveis<br />neste filtro</span>
                  </div>
                </div>
              </CardVidro>
              {listaPublico.length === 0 ? (
                <CardVidro spot style={{ borderRadius: 12 }}>
                  <EstadoVazio titulo="Ninguém neste filtro" descricao="O público vem do Kanban: coluna REMARKETING + Lead Novo com conversa real (a pessoa respondeu)." />
                </CardVidro>
              ) : (
                <div className="dsp-grid sobe" style={{ animationDelay: '.1s' }}>
                  {listaPublico.map((e) => cardPessoa(e))}
                </div>
              )}
              <div className="dsp-rodape-etapa dsp-flutua">
                <span className="num">{selecionados.length} selecionado{selecionados.length === 1 ? '' : 's'}</span>
                <BotaoPrimario
                  onClick={() => irPara(campanha ? (selecionados.length ? 3 : 4) : 2)}
                  disabled={!selecionados.length && !campanha}
                >
                  {campanha
                    ? (selecionados.length ? `Adicionar ${selecionados.length} à campanha →` : 'Ir para o disparo →')
                    : `Avançar (${selecionados.length} selecionado${selecionados.length === 1 ? '' : 's'}) →`}
                </BotaoPrimario>
              </div>
            </>
          )}

          {/* ================= 2 · TEMPLATE ================= */}
          {etapa === 2 && (
            <div className="dsp-duas sobe">
              <CardVidro spot style={{ borderRadius: 12, padding: 16 }}>
                <h2 className="dsp-h2">Template {campanha ? 'da campanha' : 'do disparo'}</h2>
                {campanha && (
                  <p className="dsp-nota">Clique em outro template aprovado para <strong>trocar</strong> o desta campanha.</p>
                )}
                {templatesTodos.length === 0 ? (
                  <EstadoVazio titulo="Nenhum template" descricao="Sincronize em Integrações → Modelos e eles aparecem aqui." />
                ) : (
                  <div className="dsp-tpl-lista">
                    {templatesTodos.map((t) => {
                      const aprovado = t.status === 'aprovado';
                      const selecionado = (campanha ? campanha.template_id : templateId) === t.id;
                      return (
                        <button
                          type="button"
                          key={t.id}
                          className={['dsp-tpl', selecionado ? 'on' : '', !aprovado ? 'off' : ''].filter(Boolean).join(' ')}
                          onClick={() => { if (!aprovado) return; if (campanha) void trocarTemplateCampanha(t.id); else setTemplateId(t.id); }}
                          aria-pressed={selecionado}
                          disabled={!aprovado || (!!campanha && trocar.isPending)}
                          title={aprovado ? '' : 'Ainda não aprovado na Meta — não pode enviar'}
                        >
                          <strong>{t.nome}</strong>
                          <span className="num">{t.idioma} · {t.categoria}{aprovado ? '' : ' · pendente na Meta'}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </CardVidro>
              <CardVidro spot style={{ borderRadius: 12, padding: 16 }}>
                <h2 className="dsp-h2">Como o cliente recebe</h2>
                {previewGrande(tplEfetivo)}
                {tplEfetivo && (tplEfetivo.variaveis?.length ?? 0) > 0 && (
                  <p className="dsp-nota">A variável de nome é preenchida por pessoa; quem não tem nome cadastrado recebe “cliente”.</p>
                )}
                <div className="dsp-rodape-etapa">
                  <BotaoSec onClick={() => setEtapa(1)}>← Público</BotaoSec>
                  <BotaoPrimario onClick={() => irPara(3)} disabled={!tplEfetivo}>Revisar →</BotaoPrimario>
                </div>
              </CardVidro>
            </div>
          )}

          {/* ================= 3 · REVISAR ================= */}
          {etapa === 3 && (
            <>
              <div className="dsp-kpis sobe">
                <Kpi rotulo="Vão receber" valor={selecionados.length} />
                <Kpi rotulo="Com nome" valor={selecionados.length - semNome} />
                <Kpi rotulo="Sairá “cliente”" valor={semNome} />
                <Kpi rotulo="Teto 24h" valor={campanha?.teto_24h ?? 200} />
              </div>
              <div className="dsp-duas sobe" style={{ animationDelay: '.05s' }}>
                <CardVidro spot style={{ borderRadius: 12, padding: 16 }}>
                  <h2 className="dsp-h2">A mensagem</h2>
                  {previewGrande(tplEfetivo)}
                  {semNome > 0 && (
                    <p className="dsp-nota">⚠ {semNome} contato{semNome === 1 ? '' : 's'} sem nome cadastrado sai{semNome === 1 ? '' : 'em'} como “Olá, cliente”. Dá pra renomear na página Contatos antes de disparar.</p>
                  )}
                  {!campanha && (
                    <div className="dsp-fgrupo" style={{ marginTop: 12 }}>
                      <span className="dsp-flabel">Nome da campanha</span>
                      <Input
                        placeholder={template ? `${template.nome} · ${new Date().toLocaleDateString('pt-BR')}` : 'Ex.: Campanha 1'}
                        value={nomeNovaCampanha}
                        onChange={(e) => setNomeNovaCampanha(e.target.value)}
                        aria-label="Nome da campanha"
                      />
                    </div>
                  )}
                  <div className="dsp-rodape-etapa">
                    <BotaoSec onClick={() => setEtapa(2)}>← Template</BotaoSec>
                    {campanha ? (
                      <BotaoPrimario onClick={() => void adicionarMaisNaCampanha()} disabled={!selecionados.length || addAlvos.isPending}>
                        {addAlvos.isPending ? 'Adicionando…' : `Adicionar ${selecionados.length} à campanha →`}
                      </BotaoPrimario>
                    ) : (
                      <BotaoPrimario onClick={() => void criarCampanhaComPublico()} disabled={criandoCampanha || !selecionados.length}>
                        {criandoCampanha ? 'Criando…' : `Criar campanha com ${selecionados.length} →`}
                      </BotaoPrimario>
                    )}
                  </div>
                </CardVidro>
                <div>
                  <h2 className="dsp-h2 dsp-h2-solta">Como fica pra cada um</h2>
                  <div className="dsp-grid dsp-grid-revisao">
                    {selecionados.slice(0, 30).map((e) => cardPessoa(e, { comPrevia: true }))}
                  </div>
                  {selecionados.length > 30 && <p className="dsp-nota">…e mais {selecionados.length - 30} (mostrando os 30 primeiros).</p>}
                </div>
              </div>
            </>
          )}

          {/* ================= 4 · DISPARAR ================= */}
          {etapa === 4 && !campanha && (
            <CardVidro spot sobe style={{ borderRadius: 12 }}>
              <EstadoVazio titulo="Nenhuma campanha ativa" descricao="Monte o público (etapa 1), escolha o template (2) e crie a campanha na revisão (3)." acao={{ rotulo: 'Começar pelo público', onClick: () => setEtapa(1) }} />
            </CardVidro>
          )}
          {etapa === 4 && campanha && (
            <>
              <div className="dsp-kpis sobe">
                <Kpi rotulo="Enviados (pessoas)" valor={dash.enviados} />
                <Kpi rotulo="Na fila" valor={porStatus.pendente} />
                <Kpi rotulo="Falhas técnicas" valor={porStatus.falhou + porStatus.pulado} />
                <Kpi rotulo="Opt-outs" valor={porStatus.optout} />
              </div>
              <p className="dsp-nota" style={{ margin: '2px 2px 0' }}>
                <strong>Enviados</strong> = pessoas que já receberam ao menos 1 mensagem (histórico). <strong>Na fila</strong> = pendentes pra enviar/reenviar agora. Custo usa o total de <strong>mensagens</strong> enviadas ({dash.mensagens}).
              </p>
              <div className="dsp-metricas sobe" style={{ animationDelay: '.02s' }}>
                <div className="dsp-metrica">
                  <span className="dsp-metrica-n num">{fmtBRL(dash.custo)}</span>
                  <span className="dsp-metrica-r">custo · {dash.mensagens}×R$0,35</span>
                </div>
                <div className="dsp-metrica">
                  <span className="dsp-metrica-n num">{dash.cac != null ? fmtBRL(dash.cac) : '—'}</span>
                  <span className="dsp-metrica-r">CAC · custo por fechamento</span>
                </div>
                <div className="dsp-metrica">
                  <span className="dsp-metrica-n num">{dash.custoResp != null ? fmtBRL(dash.custoResp) : '—'}</span>
                  <span className="dsp-metrica-r">custo por resposta</span>
                </div>
                <div className="dsp-metrica">
                  <span className="dsp-metrica-n num">{fmtDur(dash.sla)}</span>
                  <span className="dsp-metrica-r">tempo médio até 1ª resposta</span>
                </div>
              </div>
              {/* funil de conversão: sinais reais depois do disparo, com taxa sobre os enviados */}
              <CardVidro spot sobe style={{ borderRadius: 12, padding: 16, animationDelay: '.03s' }}>
                <h2 className="dsp-h2">Funil de conversão</h2>
                <div className="dsp-funil">
                  {([
                    { rot: 'Enviados', n: dash.enviados, prev: null as number | null, prevRot: '', cls: 'env' },
                    { rot: 'Responderam', n: dash.responderam, prev: dash.enviados, prevRot: 'dos enviados', cls: 'resp' },
                    { rot: 'Chamaram no Murillo chip', n: dash.murillo, prev: dash.responderam, prevRot: 'de quem respondeu', cls: 'mur' },
                    { rot: 'Fecharam', n: dash.fecharam, prev: dash.murillo, prevRot: 'de quem chamou', cls: 'fech' },
                  ]).map((s, i) => {
                    const pEnv = i === 0 ? (dash.enviados > 0 ? 100 : 0) : pct(s.n, dash.enviados);
                    return (
                      <div className="dsp-funil-linha" key={s.rot}>
                        <span className="dsp-funil-rot">{s.rot}</span>
                        <div className="dsp-funil-barra"><div className={`dsp-funil-fill ${s.cls}`} style={{ width: `${Math.max(pEnv, 1.5)}%` }} /></div>
                        <span className="dsp-funil-val">
                          <strong className="num">{s.n}</strong>
                          <span className="num dsp-funil-pct">{pEnv}% envio</span>
                          {s.prev != null && <span className="num dsp-funil-step">{pct(s.n, s.prev)}% {s.prevRot}</span>}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <p className="dsp-nota">Cada etapa mostra <strong>% sobre os enviados</strong> e a <strong>conversão da etapa anterior</strong> (onde o funil vaza). Conta o que aconteceu depois do disparo: resposta ao template, mensagem ao Murillo chip e oportunidade ganha.</p>
              </CardVidro>
              {/* ===== relatório de atendentes (Fase B) ===== */}
              <div className="dsp-rel-cab sobe" style={{ animationDelay: '.04s' }}>
                <h2 className="dsp-h2" style={{ margin: 0 }}>Relatório de atendentes</h2>
                <label className="dsp-lote num" htmlFor="dsp-parado-h">
                  Parados: sem resposta há &gt;
                  <input id="dsp-parado-h" className="inp dsp-lote-inp num" type="number" min={1} max={72}
                    value={horasParado} onChange={(e) => setHorasParado(Math.min(72, Math.max(1, Number(e.target.value) || 1)))}
                    aria-label="Limiar de horas para lead parado" />
                  h
                </label>
              </div>
              {atendentesQ.isLoading ? (
                <CardVidro spot sobe style={{ borderRadius: 12 }}><SkeletonTexto linhas={4} /></CardVidro>
              ) : (
                <CardVidro spot sobe className="dsp-rel-tab" style={{ borderRadius: 12 }}>
                  <TabelaPadrao
                    colunas={colsAtendentes}
                    linhas={atendentesOrdenados}
                    chave={(a) => a.atendente_id ?? 'sem'}
                    rodape={{ texto: `Taxa fech. = fechou/leads · "Resp. atendente" = tempo do TIME (inbound do lead → 1ª resposta do atendente) · "Parados" = respondeu e sem resposta do atendente há >${horasParado}h` }}
                  />
                </CardVidro>
              )}
              <CardVidro spot sobe style={{ borderRadius: 12, padding: 16, animationDelay: '.05s' }}>
                <div className="dsp-painel">
                  <div className="dsp-info">
                    <strong>{campanha.nome}</strong>
                    <span className="num">canal {canalCloud?.nome_interno ?? '—'} · teto {campanha.teto_24h}/24h · quem já recebeu nunca recebe de novo</span>
                  </div>
                  <div className="dsp-acoes">
                    <BotaoSec onClick={() => setConfEncerrar(true)}>Encerrar</BotaoSec>
                    <BotaoSec onClick={() => setEtapa(1)}>+ pessoas</BotaoSec>
                    {reArmaveis > 0 && (
                      <BotaoSec onClick={() => setConfRearmar(true)} disabled={rearmar.isPending}>
                        {rearmar.isPending ? 'Re-armando…' : `Disparar de novo (${reArmaveis})`}
                      </BotaoSec>
                    )}
                    <label className="dsp-lote num" htmlFor="dsp-lote-inp">Enviar agora:</label>
                    <input
                      id="dsp-lote-inp" className="inp dsp-lote-inp num" type="number" min={1} max={50}
                      value={lote} onChange={(e) => setLote(Math.min(50, Math.max(1, Number(e.target.value) || 1)))}
                      aria-label="Quantidade do lote"
                    />
                    <BotaoSec onClick={() => void simular()} disabled={processar.isPending || !porStatus.pendente}>
                      {processar.isPending ? 'Processando…' : 'Simular'}
                    </BotaoSec>
                    <BotaoPrimario onClick={() => setConfDisparo(true)} disabled={processar.isPending || !porStatus.pendente}>
                      Disparar lote
                    </BotaoPrimario>
                  </div>
                </div>
                <div className="dsp-prog" role="progressbar" aria-valuenow={pct(alvos.length - porStatus.pendente, alvos.length)} aria-valuemin={0} aria-valuemax={100}>
                  <div className="dsp-prog-fill" style={{ width: `${pct(alvos.length - porStatus.pendente, alvos.length)}%` }} />
                  <span className="dsp-prog-lbl num">{porStatus.pendente} na fila de {alvos.length} · {pct(alvos.length - porStatus.pendente, alvos.length)}% processado</span>
                </div>
                {resultado && !resultado.dry_run && (
                  <p className="dsp-resultado num" role="status">
                    Último lote: {resultado.enviados ?? 0} enviados · {resultado.falhas ?? 0} falhas · {resultado.optouts ?? 0} opt-out
                    {typeof resultado.restante_teto === 'number' ? ` · restam ${resultado.restante_teto} no teto de 24h` : ''}
                  </p>
                )}
              </CardVidro>
              {alvos.length === 0 ? (
                <CardVidro spot sobe style={{ borderRadius: 12, animationDelay: '.1s' }}>
                  <EstadoVazio titulo="Campanha sem alvos" descricao="Volte ao público e adicione as pessoas." acao={{ rotulo: 'Ir para o público', onClick: () => setEtapa(1) }} />
                </CardVidro>
              ) : (
                <>
                  <div className="dsp-filtros sobe" style={{ animationDelay: '.08s' }}>
                    <div className="dsp-filtros-linha">
                      <div className="dsp-fchip"><span className="dsp-flabel">Disparo</span><Chips>
                        <Chip ativo={filtros.disparo === 'todos'} onClick={() => setF({ disparo: 'todos' })}>Todos</Chip>
                        <Chip ativo={filtros.disparo === 'pendente'} onClick={() => setF({ disparo: 'pendente' })}>Pendente</Chip>
                        <Chip ativo={filtros.disparo === 'enviado'} onClick={() => setF({ disparo: 'enviado' })}>Enviado</Chip>
                        <Chip ativo={filtros.disparo === 'falha'} onClick={() => setF({ disparo: 'falha' })}>Falha</Chip>
                      </Chips></div>
                      <div className="dsp-fchip"><span className="dsp-flabel">Resposta</span><Chips>
                        <Chip ativo={filtros.resposta === 'todos'} onClick={() => setF({ resposta: 'todos' })}>Todos</Chip>
                        <Chip ativo={filtros.resposta === 'sim'} onClick={() => setF({ resposta: 'sim' })}>Respondeu</Chip>
                        <Chip ativo={filtros.resposta === 'nao'} onClick={() => setF({ resposta: 'nao' })}>Não resp.</Chip>
                      </Chips></div>
                      <div className="dsp-fchip"><span className="dsp-flabel">Murillo</span><Chips>
                        <Chip ativo={filtros.murillo === 'todos'} onClick={() => setF({ murillo: 'todos' })}>Todos</Chip>
                        <Chip ativo={filtros.murillo === 'sim'} onClick={() => setF({ murillo: 'sim' })}>Chamou</Chip>
                        <Chip ativo={filtros.murillo === 'nao'} onClick={() => setF({ murillo: 'nao' })}>Não</Chip>
                      </Chips></div>
                      <div className="dsp-fchip"><span className="dsp-flabel">Fechou</span><Chips>
                        <Chip ativo={filtros.fechou === 'todos'} onClick={() => setF({ fechou: 'todos' })}>Todos</Chip>
                        <Chip ativo={filtros.fechou === 'sim'} onClick={() => setF({ fechou: 'sim' })}>Sim</Chip>
                        <Chip ativo={filtros.fechou === 'nao'} onClick={() => setF({ fechou: 'nao' })}>Não</Chip>
                      </Chips></div>
                    </div>
                    <div className="dsp-filtros-linha">
                      <select className="inp dsp-fsel" value={filtros.etapa} onChange={(e) => setF({ etapa: e.target.value })} aria-label="Etapa do Kanban">
                        <option value="">Kanban: todas</option>
                        {etapasOpts.map((et) => <option key={et} value={et}>{et}</option>)}
                      </select>
                      <select className="inp dsp-fsel" value={filtros.atendente} onChange={(e) => setF({ atendente: e.target.value })} aria-label="Atendente">
                        <option value="">Atendente: todos</option>
                        <option value="sem">Sem atendente</option>
                        {atendentesOpts.map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}
                      </select>
                      <select className="inp dsp-fsel" value={filtros.template} onChange={(e) => setF({ template: e.target.value })} aria-label="Template recebido">
                        <option value="">Template: todos</option>
                        {templatesOpts.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                      <label className="dsp-lote num">De <input className="inp dsp-fdate num" type="date" value={filtros.de} onChange={(e) => setF({ de: e.target.value })} aria-label="Enviado de" /></label>
                      <label className="dsp-lote num">até <input className="inp dsp-fdate num" type="date" value={filtros.ate} onChange={(e) => setF({ ate: e.target.value })} aria-label="Enviado até" /></label>
                      {filtrosAtivos(filtros) && <BotaoSec onClick={() => setFiltros(FILTROS0)}>Limpar</BotaoSec>}
                      <span className="dsp-filtros-cont num">{pessoasFiltradas.length} de {pessoasQ.data?.length ?? 0}</span>
                      <BotaoSec onClick={exportarCSV} disabled={!pessoasOrdenadas.length}>↓ Exportar CSV</BotaoSec>
                      <BotaoPrimario onClick={abrirRemarketing} disabled={!pessoasFiltradas.length}>Remarketing ({pessoasFiltradas.length}) →</BotaoPrimario>
                    </div>
                  </div>
                  {pessoasQ.isLoading ? (
                    <CardVidro spot sobe style={{ borderRadius: 12 }}><SkeletonTexto linhas={5} /></CardVidro>
                  ) : pessoasOrdenadas.length === 0 ? (
                    <CardVidro spot sobe style={{ borderRadius: 12 }}>
                      <EstadoVazio titulo="Ninguém neste filtro" descricao="Troque o filtro acima para ver as outras pessoas da campanha." />
                    </CardVidro>
                  ) : (
                    <CardVidro spot sobe className="dsp-rel-tab" style={{ borderRadius: 12, animationDelay: '.1s' }}>
                      <TabelaPadrao
                        colunas={colsRelatorio}
                        linhas={pessoasOrdenadas}
                        chave={(p) => p.contato_id}
                        aoClicarLinha={(p) => setTimelineContato(p)}
                        rodape={{ texto: `${pessoasOrdenadas.length} pessoa${pessoasOrdenadas.length === 1 ? '' : 's'} · clique numa linha pra ver a jornada · opt-out barrado no envio` }}
                      />
                    </CardVidro>
                  )}
                </>
              )}
            </>
          )}
        </>
      )}

      {/* ---------- modal: prévia da simulação ---------- */}
      <ModalV2
        aberto={remarketAberto}
        aoFechar={() => setRemarketAberto(false)}
        titulo={`Remarketing — ${pessoasFiltradas.length} do filtro`}
        largura={560}
        rodape={<>
          <BotaoSec onClick={() => void rodarPreviaRm(rmTemplate)} disabled={!rmTemplate || remarketing.isPending}>Simular</BotaoSec>
          <BotaoPrimario onClick={() => void criarRemarketing()} disabled={!rmTemplate || !rmPrevia || (rmPrevia?.alvo ?? 0) === 0 || remarketing.isPending}>
            {remarketing.isPending ? 'Criando…' : `Criar campanha (${rmPrevia?.alvo ?? 0})`}
          </BotaoPrimario>
        </>}
      >
        <div className="dsp-fgrupo">
          <span className="dsp-flabel">Template do remarketing (aprovado)</span>
          <select className="inp dsp-fsel" value={rmTemplate} onChange={(e) => { setRmTemplate(e.target.value); void rodarPreviaRm(e.target.value); }} aria-label="Template do remarketing">
            <option value="">Escolha um template…</option>
            {templatesTodos.filter((t) => t.status === 'aprovado').map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
          </select>
        </div>
        <div className="dsp-fgrupo" style={{ marginTop: 10 }}>
          <span className="dsp-flabel">Nome da campanha (opcional)</span>
          <Input placeholder="Remarketing · hoje" value={rmNome} onChange={(e) => setRmNome(e.target.value)} aria-label="Nome da campanha de remarketing" />
        </div>
        <p className="dsp-nota" style={{ marginTop: 10 }}>Canal: <strong>{canalCloud?.nome_interno ?? '—'}</strong>{canalEhTrafego && <span className="dsp-aviso-inline"> ⚠ é o número do tráfego do anúncio (1390) — remarketing por aqui já derrubou/baniu chip.</span>}</p>
        {rmPrevia && (
          <div className="dsp-puzzle">
            <div><strong className="num">{rmPrevia.alvo}</strong> vão receber</div>
            <div>− <strong className="num">{rmPrevia.removidos_optout}</strong> removidos (opt-out)</div>
            <div>− <strong className="num">{rmPrevia.removidos_ja_template}</strong> removidos (já receberam este template)</div>
            <div>custo estimado <strong className="num">{fmtBRL(rmPrevia.custo_estimado)}</strong> · {rmPrevia.alvo}×R$0,35</div>
            <div>teto 24h: resta <strong className="num">{rmPrevia.teto_restante}</strong> de {rmPrevia.teto}{rmPrevia.alvo > rmPrevia.teto_restante && <span className="dsp-aviso-inline"> — não cabe tudo hoje; sai {rmPrevia.teto_restante} e o resto amanhã</span>}</div>
          </div>
        )}
        <p className="dsp-nota">Isso <strong>cria a campanha</strong> com os elegíveis na fila — <strong>nada é enviado</strong>. O envio real é no “Disparar lote” da campanha, respeitando teto e opt-out.</p>
      </ModalV2>
      <ModalV2
        aberto={!!timelineContato}
        aoFechar={() => setTimelineContato(null)}
        titulo={`Jornada — ${timelineContato?.nome ?? ''}`}
        largura={520}
        rodape={<BotaoSec onClick={() => setTimelineContato(null)}>Fechar</BotaoSec>}
      >
        {timelineQ.isLoading ? (
          <SkeletonTexto linhas={5} />
        ) : (timelineQ.data ?? []).length === 0 ? (
          <EstadoVazio titulo="Sem eventos ainda" descricao="Assim que a pessoa receber o disparo e reagir, a jornada aparece aqui." />
        ) : (
          <ol className="dsp-tl">
            {(timelineQ.data ?? []).map((e: TimelineEvento, i) => {
              const m = EV_TL[e.tipo] ?? { rot: e.tipo, ic: '•', tom: 'neutro' as TomStatus };
              return (
                <li key={i} className="dsp-tl-item">
                  <span className="dsp-tl-ic" aria-hidden>{m.ic}</span>
                  <div className="dsp-tl-txt">
                    <strong>{m.rot}{e.detalhe ? <span className="dsp-tl-det"> · {e.detalhe}</span> : null}</strong>
                    <span className="num dsp-tl-quando">{fmtQuando(e.quando)}</span>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </ModalV2>
      <ModalV2
        aberto={!!previa}
        aoFechar={() => setPrevia(null)}
        titulo={`Simulação — ${previa?.processados ?? 0} no lote (nada foi enviado)`}
        largura={560}
        rodape={<BotaoSec onClick={() => setPrevia(null)}>Fechar</BotaoSec>}
      >
        <div className="dsp-previa">
          {(previa?.resultados ?? []).map((r, i) => (
            <div key={i} className="dsp-previa-item">
              <div className="dsp-previa-cab">
                <strong>{r.contato ?? '—'}</strong>
                <span className="num">{fmtTel(r.telefone ?? null)} · {r.status}</span>
              </div>
              {r.texto && <p className="dsp-previa-txt">{r.texto}</p>}
            </div>
          ))}
          {!previa?.resultados?.length && <p className="dsp-nota">{previa?.mensagem ?? 'Nenhum alvo pendente.'}</p>}
        </div>
      </ModalV2>

      {/* ---------- confirmações ---------- */}
      <ConfirmDialogV2
        aberto={confEncerrar}
        titulo={`Encerrar a campanha "${campanha?.nome ?? ''}"?`}
        mensagem={`${porStatus.pendente} pendente${porStatus.pendente === 1 ? '' : 's'} deixa${porStatus.pendente === 1 ? '' : 'm'} de ser enviados. O histórico fica guardado e você pode criar outra campanha em seguida.`}
        rotuloConfirmar="Encerrar campanha"
        destrutivo
        carregando={cancelar.isPending}
        aoConfirmar={async () => {
          const c = campanha; setConfEncerrar(false);
          if (!c) return;
          try { await cancelar.mutateAsync(c.id); setEtapa(1); ok(`Campanha "${c.nome}" encerrada.`); }
          catch (e) { erro((e as Error).message); }
        }}
        aoCancelar={() => setConfEncerrar(false)}
      />
      <ConfirmDialogV2
        aberto={confRearmar}
        titulo={`Disparar de novo "${campanha?.nome ?? ''}"?`}
        mensagem={`Só quem AINDA está em Lead Novo e não respondeu volta para a fila: ${reArmaveis} pessoa${reArmaveis === 1 ? '' : 's'}. Quem já respondeu (${porStatus.respondido}), quem avançou no funil (Reunião, Documentos, Fechado…) e quem está em opt-out NÃO são reenviados. Troque o template no passo 2 antes, se quiser. Nada sai até você disparar o lote.`}
        rotuloConfirmar="Disparar de novo"
        carregando={rearmar.isPending}
        aoConfirmar={async () => {
          const c = campanha; setConfRearmar(false);
          if (!c) return;
          try { const r = await rearmar.mutateAsync(c.id); setEtapa(4); ok(`${r.rearmados} de volta na fila. Escolha o lote e dispare quando quiser.`); }
          catch (e) { erro((e as Error).message); }
        }}
        aoCancelar={() => setConfRearmar(false)}
      />
      <ConfirmDialogV2
        aberto={!!confExcluir}
        titulo={`Excluir a campanha "${confExcluir?.nome ?? ''}"?`}
        mensagem={`${confExcluir && confExcluir.enviados > 0 ? `Atenção: essa campanha tem ${confExcluir.enviados} envio(s) — o histórico e os resultados dela serão apagados. ` : ''}A campanha e todos os alvos somem da lista. Não dá pra desfazer.`}
        rotuloConfirmar="Excluir campanha"
        destrutivo
        carregando={excluir.isPending}
        aoConfirmar={async () => {
          const c = confExcluir; setConfExcluir(null);
          if (!c) return;
          try { await excluir.mutateAsync(c.id); ok(`Campanha "${c.nome}" excluída.`); }
          catch (e) { erro((e as Error).message); }
        }}
        aoCancelar={() => setConfExcluir(null)}
      />
      <ConfirmDialogV2
        aberto={confDisparo}
        titulo={`Disparar ${Math.min(lote, porStatus.pendente)} mensagens agora?`}
        mensagem={`Template real pelo canal ${canalCloud?.nome_interno ?? 'Cloud API'} para os ${Math.min(lote, porStatus.pendente)} primeiros pendentes · custo ≈ ${fmtBRL(Math.min(lote, porStatus.pendente) * CUSTO_MSG)}. Opt-out e quem já recebeu este template são barrados no envio. Custa dinheiro e não tem desfazer.`}
        rotuloConfirmar="Disparar"
        destrutivo
        carregando={processar.isPending}
        aoConfirmar={() => void disparar()}
        aoCancelar={() => setConfDisparo(false)}
      />
      <ConfirmDialogV2
        aberto={!!confOptout}
        titulo={`Marcar ${confOptout?.nome ?? ''} como opt-out?`}
        mensagem="Sai de qualquer disparo e remarketing (o atendimento normal continua). Dá para desfazer na aba Excluídos."
        rotuloConfirmar="Marcar opt-out"
        carregando={optManual.isPending}
        aoConfirmar={async () => {
          const alvo = confOptout; setConfOptout(null);
          if (!alvo) return;
          try {
            await optManual.mutateAsync({ contato_id: alvo.contato_id, detalhe: 'via painel (Disparo)' });
            setSel((s) => { const n = new Set(s); n.delete(alvo.contato_id); return n; });
            ok(`${alvo.nome} marcado como opt-out.`);
          } catch (e) { erro((e as Error).message); }
        }}
        aoCancelar={() => setConfOptout(null)}
      />
      <ConfirmDialogV2
        aberto={!!confDesfazer}
        titulo={`Desfazer opt-out de ${confDesfazer?.nome ?? ''}?`}
        mensagem="O contato volta a ser elegível para disparos. Só faça isso se a exclusão foi um engano."
        rotuloConfirmar="Desfazer"
        carregando={optRemover.isPending}
        aoConfirmar={async () => {
          const alvo = confDesfazer; setConfDesfazer(null);
          if (!alvo) return;
          try { await optRemover.mutateAsync(alvo.contato_id); ok(`Opt-out de ${alvo.nome} desfeito.`); }
          catch (e) { erro((e as Error).message); }
        }}
        aoCancelar={() => setConfDesfazer(null)}
      />
    </div>
  );
}

export default Disparo;
