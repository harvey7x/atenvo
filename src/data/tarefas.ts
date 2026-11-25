import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useOrg } from '@/context/OrgContext';

/* ------------------------------------------------------------------
   TAREFAS DA EQUIPE no Atendimento (dono 25/11: trazer as funções úteis do sistema que a Reviza usava
   antes — lá havia o menu "Tarefas"). Cada tarefa tem título, descrição, responsável, prazo (dia e, se
   quiser, hora), prioridade, situação (Pendente · Em andamento · Concluída), projeto, subtarefas e, quando
   nasceu de uma conversa, o cliente com o caminho de volta para ela.
   Quem vê: o administrador vê todas; os demais, as que criaram ou que estão com eles (o banco confere —
   migration 101; a demonstração aplica a mesma regra em visivelPara).
   DEMO É O CONTRATO: sem backend os mesmos hooks devolvem as tarefas de exemplo abaixo (memória + navegador).
   ------------------------------------------------------------------ */

export const TAREFAS_REAL: boolean = isSupabaseConfigured && !!supabase;
const TZ = 'America/Sao_Paulo';

export type StatusTarefa = 'pendente' | 'andamento' | 'concluida';
export type PrioridadeTarefa = 'alta' | 'media' | 'baixa';
export const STATUS_TAREFA: readonly StatusTarefa[] = ['pendente', 'andamento', 'concluida'];
export const PRIORIDADES: readonly PrioridadeTarefa[] = ['alta', 'media', 'baixa'];
export const ROTULO_STATUS: Record<StatusTarefa, string> = { pendente: 'Pendente', andamento: 'Em andamento', concluida: 'Concluída' };
export const ROTULO_PRIORIDADE: Record<PrioridadeTarefa, string> = { alta: 'Alta', media: 'Média', baixa: 'Baixa' };

export interface Subtarefa { id: string; texto: string; feito: boolean }
export interface Tarefa {
  id: string;
  titulo: string;
  descricao: string | null;
  responsavelId: string | null;
  criadoPor: string | null;
  /** ISO; sem hora = fim do dia (23:59 de Brasília) */
  prazo: string | null;
  prazoComHora: boolean;
  prioridade: PrioridadeTarefa;
  status: StatusTarefa;
  projeto: string | null;
  conversaId: string | null;
  contatoId: string | null;
  clienteNome: string | null;
  concluidaEm: string | null;
  criadoEm: string;
  atualizadoEm: string;
  itens: Subtarefa[];
}
export interface PessoaEquipe { id: string; nome: string }
/** o que a tela manda gravar (criar ou editar) */
export interface RascunhoTarefa {
  titulo: string;
  descricao: string;
  responsavelId: string | null;
  /** 'AAAA-MM-DD' ou '' (sem prazo) */
  dia: string;
  /** 'HH:MM' ou '' (só o dia) */
  hora: string;
  prioridade: PrioridadeTarefa;
  status: StatusTarefa;
  projeto: string;
  conversaId: string | null;
  contatoId: string | null;
  clienteNome: string | null;
  itens: { id?: string; texto: string; feito: boolean }[];
}

/* ---------------- datas em Brasília (puras, testadas) ---------------- */
const fmtDia = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const fmtHora = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
/** o dia em Brasília ('AAAA-MM-DD') de um instante */
export const diaSP = (v: string | number | Date): string => fmtDia.format(new Date(v));
/** a hora em Brasília ('HH:MM') de um instante */
export const horaSP = (v: string | number | Date): string => fmtHora.format(new Date(v));
export const somarDias = (dia: string, n: number): string => {
  const d = new Date(`${dia}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
};
/** o prazo gravado: com hora, aquele instante; só o dia, 23:59 daquele dia (Brasília não tem horário de verão desde 2019) */
export function prazoISO(dia: string, hora?: string | null): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return null;
  const h = hora && /^\d{2}:\d{2}$/.test(hora) ? hora : '23:59';
  return new Date(`${dia}T${h}:00-03:00`).toISOString();
}
/** segunda-feira desta semana, 0h de Brasília (o começo de "concluídas na semana") */
export function inicioDaSemana(agora = Date.now()): number {
  const hoje = diaSP(agora);
  const dow = new Date(`${hoje}T12:00:00Z`).getUTCDay(); // 0 = domingo
  const segunda = somarDias(hoje, -((dow + 6) % 7));
  return new Date(`${segunda}T00:00:00-03:00`).getTime();
}

/* ---------------- regras da lista (puras, testadas) ---------------- */
export const aberta = (t: Pick<Tarefa, 'status'>): boolean => t.status !== 'concluida';
/** passou do prazo e não foi concluída */
export function estaAtrasada(t: Pick<Tarefa, 'status' | 'prazo'>, agora = Date.now()): boolean {
  return aberta(t) && !!t.prazo && new Date(t.prazo).getTime() < agora;
}
/** vence hoje e ainda não passou da hora */
export function venceHoje(t: Pick<Tarefa, 'status' | 'prazo'>, agora = Date.now()): boolean {
  return aberta(t) && !!t.prazo && diaSP(t.prazo) === diaSP(agora) && !estaAtrasada(t, agora);
}
/** quem enxerga a tarefa (a mesma regra do banco): administrador, quem criou ou quem está com ela */
export function visivelPara(t: Pick<Tarefa, 'criadoPor' | 'responsavelId'>, euId: string | null, admin: boolean): boolean {
  return admin || (!!euId && (t.criadoPor === euId || t.responsavelId === euId));
}

export interface ResumoTarefas { abertas: number; atrasadas: number; paraHoje: number; concluidasSemana: number }
export function resumoTarefas(ts: readonly Tarefa[], agora = Date.now()): ResumoTarefas {
  const semana = inicioDaSemana(agora);
  return {
    abertas: ts.filter(aberta).length,
    atrasadas: ts.filter((t) => estaAtrasada(t, agora)).length,
    paraHoje: ts.filter((t) => venceHoje(t, agora)).length,
    concluidasSemana: ts.filter((t) => t.status === 'concluida' && !!t.concluidaEm && new Date(t.concluidaEm).getTime() >= semana).length,
  };
}

const PESO_PRIORIDADE: Record<PrioridadeTarefa, number> = { alta: 0, media: 1, baixa: 2 };
/** abertas primeiro, pelo prazo (as atrasadas no topo, sem prazo por último), depois a prioridade e a mais nova;
 *  as concluídas no fim, da mais recente para a mais antiga */
export function compararTarefas(a: Tarefa, b: Tarefa): number {
  const fa = aberta(a), fb = aberta(b);
  if (fa !== fb) return fa ? -1 : 1;
  if (!fa) return (b.concluidaEm ?? '').localeCompare(a.concluidaEm ?? '');
  const pa = a.prazo ? new Date(a.prazo).getTime() : Infinity;
  const pb = b.prazo ? new Date(b.prazo).getTime() : Infinity;
  if (pa !== pb) return pa < pb ? -1 : 1;
  const pr = PESO_PRIORIDADE[a.prioridade] - PESO_PRIORIDADE[b.prioridade];
  if (pr) return pr;
  return b.criadoEm.localeCompare(a.criadoEm);
}
export const ordenarTarefas = (ts: readonly Tarefa[]): Tarefa[] => [...ts].sort(compararTarefas);

export interface FiltrosTarefa {
  /** minhas = as que estão comigo (e as que criei sem responsável) */
  escopo: 'minhas' | 'todas';
  status: 'abertas' | 'todas' | StatusTarefa;
  /** '' = qualquer pessoa · 'sem' = sem responsável · id */
  responsavel: string;
  prioridade: '' | PrioridadeTarefa;
  soAtrasadas: boolean;
  busca: string;
}
export const FILTROS_PADRAO: FiltrosTarefa = { escopo: 'todas', status: 'abertas', responsavel: '', prioridade: '', soAtrasadas: false, busca: '' };
const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export function minha(t: Pick<Tarefa, 'responsavelId' | 'criadoPor'>, euId: string | null): boolean {
  return !!euId && (t.responsavelId === euId || (t.responsavelId == null && t.criadoPor === euId));
}
/** os filtros da tela; `ignorarStatus` no quadro (as colunas já são as situações) */
export function filtrarTarefas(ts: readonly Tarefa[], f: FiltrosTarefa, euId: string | null, agora = Date.now(), ignorarStatus = false): Tarefa[] {
  const termo = semAcento(f.busca.trim());
  return ts.filter((t) => {
    if (f.escopo === 'minhas' && !minha(t, euId)) return false;
    if (!ignorarStatus) {
      if (f.status === 'abertas' && !aberta(t)) return false;
      if (f.status !== 'abertas' && f.status !== 'todas' && t.status !== f.status) return false;
    }
    if (f.responsavel === 'sem' ? t.responsavelId != null : f.responsavel && t.responsavelId !== f.responsavel) return false;
    if (f.prioridade && t.prioridade !== f.prioridade) return false;
    if (f.soAtrasadas && !estaAtrasada(t, agora)) return false;
    if (termo) {
      const alvo = semAcento([t.titulo, t.descricao, t.clienteNome, t.projeto, ...t.itens.map((i) => i.texto)].filter(Boolean).join(' '));
      if (!alvo.includes(termo)) return false;
    }
    return true;
  });
}
/** os projetos já usados (para sugerir ao digitar) */
export const projetosDe = (ts: readonly Tarefa[]): string[] =>
  [...new Set(ts.map((t) => t.projeto?.trim()).filter((p): p is string => !!p))].sort((a, b) => a.localeCompare(b, 'pt-BR'));

/** o prazo por extenso curto: "Hoje", "Amanhã às 15:30", "Ontem", "28/11", "03/01/2027" */
export function textoPrazo(t: Pick<Tarefa, 'prazo' | 'prazoComHora'>, agora = Date.now()): string {
  if (!t.prazo) return 'Sem prazo';
  const dia = diaSP(t.prazo), hoje = diaSP(agora);
  const [a, m, d] = dia.split('-');
  const base = dia === hoje ? 'Hoje' : dia === somarDias(hoje, 1) ? 'Amanhã' : dia === somarDias(hoje, -1) ? 'Ontem'
    : a === hoje.slice(0, 4) ? `${d}/${m}` : `${d}/${m}/${a}`;
  return t.prazoComHora ? `${base} às ${horaSP(t.prazo)}` : base;
}
export const progressoItens = (t: Pick<Tarefa, 'itens'>): { feitos: number; total: number } =>
  ({ feitos: t.itens.filter((i) => i.feito).length, total: t.itens.length });

/** o rascunho a partir de uma tarefa (para editar) */
export function rascunhoDe(t: Tarefa): RascunhoTarefa {
  return {
    titulo: t.titulo, descricao: t.descricao ?? '', responsavelId: t.responsavelId,
    dia: t.prazo ? diaSP(t.prazo) : '', hora: t.prazo && t.prazoComHora ? horaSP(t.prazo) : '',
    prioridade: t.prioridade, status: t.status, projeto: t.projeto ?? '',
    conversaId: t.conversaId, contatoId: t.contatoId, clienteNome: t.clienteNome,
    itens: t.itens.map((i) => ({ id: i.id, texto: i.texto, feito: i.feito })),
  };
}
export function rascunhoVazio(p: Partial<RascunhoTarefa> = {}): RascunhoTarefa {
  return { titulo: '', descricao: '', responsavelId: null, dia: '', hora: '', prioridade: 'media', status: 'pendente', projeto: '', conversaId: null, contatoId: null, clienteNome: null, itens: [], ...p };
}

/* ---------------- leitura defensiva (linha do banco → tipo) ---------------- */
type B = Record<string, unknown>;
const o = (v: unknown): B => (v && typeof v === 'object' && !Array.isArray(v) ? (v as B) : {});
const txt = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);
export function normalizarTarefa(v: unknown): Tarefa {
  const r = o(v);
  const st = String(r.status);
  const pr = String(r.prioridade);
  const itens = (Array.isArray(r.itens) ? r.itens : []).map(o)
    .sort((x, y) => Number(x.ordem ?? 0) - Number(y.ordem ?? 0))
    .map((i) => ({ id: String(i.id ?? ''), texto: String(i.texto ?? ''), feito: !!i.feito }));
  return {
    id: String(r.id ?? ''),
    titulo: txt(r.titulo) ?? 'Tarefa sem título',
    descricao: txt(r.descricao),
    responsavelId: txt(r.responsavel_id),
    criadoPor: txt(r.criado_por),
    prazo: txt(r.prazo),
    prazoComHora: !!r.prazo_com_hora,
    prioridade: (PRIORIDADES as readonly string[]).includes(pr) ? (pr as PrioridadeTarefa) : 'media',
    status: (STATUS_TAREFA as readonly string[]).includes(st) ? (st as StatusTarefa) : 'pendente',
    projeto: txt(r.projeto),
    conversaId: txt(r.conversa_id),
    contatoId: txt(r.contato_id),
    clienteNome: txt(r.cliente_nome),
    concluidaEm: txt(r.concluida_em),
    criadoEm: txt(r.criado_em) ?? new Date(0).toISOString(),
    atualizadoEm: txt(r.atualizado_em) ?? txt(r.criado_em) ?? new Date(0).toISOString(),
    itens,
  };
}

/* ---------------- demonstração (tarefas inventadas, nenhum dado de cliente de verdade) ---------------- */
export const EQUIPE_DEMO: readonly PessoaEquipe[] = [
  { id: 'demo-alexandra', nome: 'Alexandra' }, { id: 'demo-guilherme', nome: 'Guilherme' }, { id: 'demo-raissa', nome: 'Raissa' },
  { id: 'demo-felipe', nome: 'Felipe' }, { id: 'demo-emillyn', nome: 'Emillyn' }, { id: 'demo-juliano', nome: 'Juliano' }, { id: 'demo-rafael', nome: 'Rafael' },
];
const GUARDA_DEMO = 'previa-tarefas-v1';
let memoriaDemo: Tarefa[] | null = null;
let seqDemo = 0;
const idDemo = (p: string) => `${p}-${Date.now().toString(36)}-${(seqDemo++).toString(36)}`;

/** as tarefas de exemplo, com prazos em volta de hoje (os clientes são os das conversas de exemplo) */
export function seedTarefasDemo(euId: string, agora = Date.now()): Tarefa[] {
  const hoje = diaSP(agora);
  const h = (n: number) => new Date(agora - n * 3_600_000).toISOString();
  const [ale, gui, rai, fel, emi, jul, raf] = EQUIPE_DEMO.map((p) => p.id);
  let n = 0;
  const mk = (p: Partial<Tarefa> & { titulo: string }, dia: number | null, hora?: string, itens: [string, boolean][] = []): Tarefa => {
    n += 1;
    return {
      id: `demo-t${n}`, descricao: null, responsavelId: null, criadoPor: euId, prioridade: 'media', status: 'pendente', projeto: null,
      conversaId: null, contatoId: null, clienteNome: null, concluidaEm: null, criadoEm: h(20 + n * 5), atualizadoEm: h(2 + n),
      prazo: dia == null ? null : prazoISO(somarDias(hoje, dia), hora), prazoComHora: !!hora,
      itens: itens.map(([texto, feito], i) => ({ id: `demo-t${n}-i${i}`, texto, feito })),
      ...p,
    };
  };
  const cli = (conversaId: string, contatoId: string, clienteNome: string) => ({ conversaId, contatoId, clienteNome });
  return [
    mk({ titulo: 'Ligar para a cliente para pegar o extrato do INSS', responsavelId: ale, prioridade: 'alta', projeto: 'Revisão de juros',
      descricao: 'Ela pediu para ligar depois das 14h. Pedir o extrato de empréstimos pelo Meu INSS.', ...cli('wa-maria', 'wa-maria-ct', 'Maria Aparecida Souza') },
      -1, '16:00', [['Ligar para a cliente', true], ['Pedir o extrato de empréstimos', false], ['Salvar o extrato na pasta do cliente', false]]),
    mk({ titulo: 'Conferir comprovante de endereço', responsavelId: gui, status: 'andamento', projeto: 'Documentação', ...cli('wa-ivone', 'wa-ivone-ct', 'Ivone Castro dos Santos') }, 0),
    mk({ titulo: 'Enviar a procuração para assinatura', responsavelId: euId, prioridade: 'alta', projeto: 'Documentação', ...cli('wa-antonio', 'kct-5', 'Antônio Pereira Lima') },
      0, '17:30', [['Preencher a procuração', true], ['Mandar o link de assinatura', false]]),
    mk({ titulo: 'Retornar a mensagem sobre a simulação do empréstimo', responsavelId: rai, ...cli('wa-terezinha', 'wa-terezinha-ct', 'Terezinha M. Alves') }, 1),
    mk({ titulo: 'Montar a lista de clientes com parcela atrasada', responsavelId: fel, prioridade: 'baixa', status: 'andamento', projeto: 'Cobranças' }, 3),
    mk({ titulo: 'Pedir a senha do INSS para a análise', responsavelId: emi, prioridade: 'alta', status: 'andamento', criadoPor: emi, ...cli('wa-jose', 'wa-jose-ct', 'José Carlos Ferreira') },
      -2, undefined, [['Explicar para que serve a senha', true], ['Conferir se a senha entra', false]]),
    mk({ titulo: 'Revisar os contratos fechados da semana', responsavelId: euId, projeto: 'Fechamento do mês' }, 5, undefined, [['Conferir os valores', false], ['Conferir as assinaturas', false]]),
    mk({ titulo: 'Atualizar o cadastro com o telefone novo', responsavelId: jul, prioridade: 'baixa', criadoPor: jul }, 1),
    mk({ titulo: 'Agendar o atendimento presencial para assinar o contrato', responsavelId: raf, ...cli('wa-sebastiao', 'wa-sebastiao-ct', 'Sebastião R. Nunes') }, 2, '10:00'),
    mk({ titulo: 'Ligar para confirmar os dados bancários', responsavelId: rai, prioridade: 'baixa' }, null),
    mk({ titulo: 'Organizar os documentos na pasta do cliente', responsavelId: ale, status: 'concluida', concluidaEm: h(26), projeto: 'Documentação' }, -1),
    mk({ titulo: 'Conferir o comprovante de pagamento da primeira parcela', responsavelId: gui, prioridade: 'alta', status: 'concluida', concluidaEm: h(3), projeto: 'Cobranças' }, 0),
    mk({ titulo: 'Passar para a equipe as respostas prontas novas', responsavelId: euId, status: 'concluida', concluidaEm: h(9) }, 0, '11:00'),
  ];
}
function lerDemo(euId: string): Tarefa[] {
  if (memoriaDemo) return memoriaDemo;
  try {
    const salvo = JSON.parse(localStorage.getItem(GUARDA_DEMO) ?? 'null');
    if (Array.isArray(salvo)) { memoriaDemo = salvo.map(normalizarDemo); return memoriaDemo; }
  } catch { /* navegador sem armazenamento */ }
  memoriaDemo = seedTarefasDemo(euId);
  return memoriaDemo;
}
const normalizarDemo = (v: unknown): Tarefa => { const t = o(v) as unknown as Tarefa; return { ...t, itens: Array.isArray(t.itens) ? t.itens : [] }; };
function gravarDemo(ts: Tarefa[]) {
  memoriaDemo = ts;
  try { localStorage.setItem(GUARDA_DEMO, JSON.stringify(ts)); } catch { /* privado */ }
}
/** aplica o rascunho numa tarefa (a mesma limpeza do banco: textos aparados, carimbo de concluída) */
export function aplicarRascunho(base: Tarefa | null, r: RascunhoTarefa, ids: { id: string; euId: string | null; agora?: number; novoItemId?: () => string }): Tarefa {
  const agora = new Date(ids.agora ?? Date.now()).toISOString();
  const concluidaEm = r.status === 'concluida' ? (base?.status === 'concluida' ? base.concluidaEm : agora) : null;
  const semConversa = !r.conversaId && !r.contatoId;
  let k = 0;
  return {
    id: ids.id,
    titulo: r.titulo.trim(),
    descricao: r.descricao.trim() || null,
    responsavelId: r.responsavelId || null,
    criadoPor: base ? base.criadoPor : ids.euId,
    prazo: r.dia ? prazoISO(r.dia, r.hora) : null,
    prazoComHora: !!r.dia && !!r.hora,
    prioridade: r.prioridade,
    status: r.status,
    projeto: r.projeto.trim() || null,
    conversaId: r.conversaId,
    contatoId: semConversa ? null : r.contatoId,
    clienteNome: semConversa ? null : (r.clienteNome?.trim() || null),
    concluidaEm,
    criadoEm: base ? base.criadoEm : agora,
    atualizadoEm: agora,
    itens: r.itens.filter((i) => i.texto.trim()).map((i) => ({ id: i.id || (ids.novoItemId ? ids.novoItemId() : `${ids.id}-i${k++}`), texto: i.texto.trim(), feito: i.feito })),
  };
}

/* ---------------- erros do banco em português ---------------- */
const MSG: Record<string, string> = {
  responsavel_fora_da_equipe: 'Essa pessoa não está mais na equipe. Escolha outro responsável.',
  conversa_de_outra_empresa: 'Essa conversa não é desta empresa.',
  cliente_de_outra_empresa: 'Esse cliente não é desta empresa.',
  tarefa_nao_encontrada: 'Essa tarefa não existe mais ou não está com você.',
  titulo_obrigatorio: 'Escreva o que precisa ser feito.',
  itens_demais: 'A tarefa pode ter até 50 subtarefas.',
};
export function traduzErroTarefa(e: unknown): string {
  const m = (e as { message?: string })?.message || String(e ?? '');
  const cod = Object.keys(MSG).find((k) => m.includes(k));
  if (cod) return MSG[cod];
  if (/row-level security|permission denied/i.test(m)) return 'Você não tem permissão para mudar esta tarefa.';
  if (/Failed to fetch|NetworkError|network/i.test(m)) return 'Sem conexão agora. Tente de novo em instantes.';
  return 'Não foi possível gravar a tarefa agora. Tente de novo.';
}

/* ---------------- hooks ---------------- */
export interface QuemSouEu { id: string | null; admin: boolean }
const SELECT = 'id, titulo, descricao, responsavel_id, criado_por, prazo, prazo_com_hora, prioridade, status, projeto, conversa_id, contato_id, cliente_nome, concluida_em, criado_em, atualizado_em, itens:atd_tarefa_itens(id, texto, feito, ordem)';

/** as tarefas que a pessoa enxerga: todas as abertas e as concluídas dos últimos 90 dias */
export function useTarefas(eu: QuemSouEu) {
  const { currentOrg } = useOrg();
  return useQuery({
    queryKey: ['tarefas', currentOrg.id, eu.id, eu.admin],
    queryFn: async (): Promise<Tarefa[]> => {
      if (!TAREFAS_REAL) return lerDemo(eu.id ?? 'eu').filter((t) => visivelPara(t, eu.id, eu.admin));
      const desde = new Date(Date.now() - 90 * 86_400_000).toISOString();
      const { data, error } = await supabase!.from('atd_tarefas').select(SELECT)
        .eq('organizacao_id', currentOrg.id)
        .or(`status.neq.concluida,concluida_em.gte.${desde}`)
        .order('criado_em', { ascending: false })
        .limit(1000);
      if (error) throw new Error(error.message);
      return (data ?? []).map(normalizarTarefa);
    },
    staleTime: 30_000,
  });
}
/** as tarefas abertas de uma conversa (o painel do cliente no WhatsApp) */
export function useTarefasDaConversa(conversaId: string | null, eu: QuemSouEu, ativo = true) {
  const { currentOrg } = useOrg();
  return useQuery({
    queryKey: ['tarefas', currentOrg.id, eu.id, eu.admin, 'conversa', conversaId],
    enabled: ativo && !!conversaId,
    queryFn: async (): Promise<Tarefa[]> => {
      if (!TAREFAS_REAL) return lerDemo(eu.id ?? 'eu').filter((t) => t.conversaId === conversaId && aberta(t) && visivelPara(t, eu.id, eu.admin)).sort(compararTarefas);
      const { data, error } = await supabase!.from('atd_tarefas').select(SELECT)
        .eq('organizacao_id', currentOrg.id).eq('conversa_id', conversaId!).neq('status', 'concluida')
        .order('prazo', { ascending: true, nullsFirst: false }).limit(50);
      if (error) throw new Error(error.message);
      return (data ?? []).map(normalizarTarefa).sort(compararTarefas);
    },
    staleTime: 30_000,
  });
}
/** quem pode ser responsável: a equipe ativa da empresa */
export function useEquipeTarefas() {
  const { currentOrg } = useOrg();
  return useQuery({
    queryKey: ['tarefas-equipe', currentOrg.id],
    queryFn: async (): Promise<PessoaEquipe[]> => {
      if (!TAREFAS_REAL) return [...EQUIPE_DEMO];
      const { data, error } = await supabase!.from('organizacao_usuarios').select('usuarios(id, nome)')
        .eq('organizacao_id', currentOrg.id).eq('status', 'ativo');
      if (error) throw new Error(error.message);
      type Linha = { usuarios: { id: string; nome: string | null } | { id: string; nome: string | null }[] | null };
      return ((data as unknown as Linha[]) ?? [])
        .map((l) => (Array.isArray(l.usuarios) ? l.usuarios[0] : l.usuarios))
        .filter((u): u is { id: string; nome: string | null } => !!u?.id)
        .map((u) => ({ id: u.id, nome: u.nome?.trim() || 'Sem nome' }))
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    },
    staleTime: 5 * 60_000,
  });
}

function useInvalidar() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['tarefas'] });
}
/** criar (id nulo) ou editar, com as subtarefas, de uma vez */
export function useSalvarTarefa(eu: QuemSouEu) {
  const { currentOrg } = useOrg();
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async (v: { id: string | null; rascunho: RascunhoTarefa }): Promise<string> => {
      const r = v.rascunho;
      if (!r.titulo.trim()) throw new Error(MSG.titulo_obrigatorio);
      if (!TAREFAS_REAL) {
        const todas = lerDemo(eu.id ?? 'eu');
        const base = v.id ? todas.find((t) => t.id === v.id) ?? null : null;
        const id = v.id ?? idDemo('demo-t');
        const nova = aplicarRascunho(base, r, { id, euId: eu.id, novoItemId: () => idDemo('demo-i') });
        gravarDemo(base ? todas.map((t) => (t.id === id ? nova : t)) : [nova, ...todas]);
        return id;
      }
      const dados = {
        titulo: r.titulo.trim(), descricao: r.descricao.trim() || null, responsavel_id: r.responsavelId || null,
        prazo: r.dia ? prazoISO(r.dia, r.hora) : null, prazo_com_hora: !!r.dia && !!r.hora,
        prioridade: r.prioridade, status: r.status, projeto: r.projeto.trim() || null,
        conversa_id: r.conversaId, contato_id: r.conversaId || r.contatoId ? r.contatoId : null, cliente_nome: r.clienteNome,
      };
      const itens = r.itens.filter((i) => i.texto.trim()).map((i) => ({ id: i.id ?? null, texto: i.texto.trim(), feito: i.feito }));
      const { data, error } = await supabase!.rpc('atd_tarefa_salvar', { p_org: currentOrg.id, p_id: v.id, p_dados: dados, p_itens: itens });
      if (error) throw new Error(traduzErroTarefa(error));
      return String(data);
    },
    onSettled: invalidar,
  });
}
/** a caixinha de concluir e o "mover para" do quadro */
export function useMudarStatusTarefa(eu: QuemSouEu) {
  const invalidar = useInvalidar();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { id: string; status: StatusTarefa }) => {
      if (!TAREFAS_REAL) {
        const agora = new Date().toISOString();
        gravarDemo(lerDemo(eu.id ?? 'eu').map((t) => (t.id === v.id
          ? { ...t, status: v.status, atualizadoEm: agora, concluidaEm: v.status === 'concluida' ? (t.status === 'concluida' ? t.concluidaEm : agora) : null }
          : t)));
        return;
      }
      const { error } = await supabase!.from('atd_tarefas').update({ status: v.status }).eq('id', v.id);
      if (error) throw new Error(traduzErroTarefa(error));
    },
    // na hora, sem esperar o servidor (a caixinha responde ao clique)
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: ['tarefas'] });
      const agora = new Date().toISOString();
      qc.setQueriesData<Tarefa[]>({ queryKey: ['tarefas'] }, (ts) => ts?.map((t) => (t.id === v.id
        ? { ...t, status: v.status, concluidaEm: v.status === 'concluida' ? (t.concluidaEm ?? agora) : null } : t)));
    },
    onSettled: invalidar,
  });
}
export function useExcluirTarefa(eu: QuemSouEu) {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async (id: string) => {
      if (!TAREFAS_REAL) { gravarDemo(lerDemo(eu.id ?? 'eu').filter((t) => t.id !== id)); return; }
      const { error, count } = await supabase!.from('atd_tarefas').delete({ count: 'exact' }).eq('id', id);
      if (error) throw new Error(traduzErroTarefa(error));
      if (count === 0) throw new Error('Só quem criou a tarefa (ou o administrador) pode apagá-la.');
    },
    onSettled: invalidar,
  });
}
/** quem pode apagar (a mesma regra do banco) */
export const podeApagar = (t: Pick<Tarefa, 'criadoPor'>, eu: QuemSouEu): boolean => eu.admin || (!!eu.id && t.criadoPor === eu.id);
