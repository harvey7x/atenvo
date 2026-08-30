/* ============================================================================
   Fluxos personalizáveis — Fase 1 (camada de dados + SIMULADOR)

   O fluxo é uma lista ordenada de passos (jsonb em ia_fluxos.passos). O
   simulador daqui é um interpretador PURO do mesmo contrato que o motor
   (bot-runner) executa — o que você vê no teste é o que o canal faz.
   ============================================================================ */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useOrg } from '@/context/OrgContext';

export const FLUXOS_REAL = isSupabaseConfigured && !!supabase;
type Row = Record<string, unknown>;

/* ---------------- contrato dos passos (espelhado no motor) ---------------- */
export type DadoColeta = 'nome' | 'cpf' | 'telefone' | 'email' | 'texto';

export type Passo =
  | { tipo: 'mensagem'; baloes: string[] }
  | { tipo: 'pergunta'; baloes: string[]; opcoes: { rotulo: string; valor: string }[]; salvarEm: string; reprompt: string }
  | { tipo: 'coletar'; baloes: string[]; dado: DadoColeta; salvarEm: string; reprompt: string }
  | { tipo: 'acao'; etiqueta?: string; chamarHumano?: boolean; entregarIa?: boolean }
  | { tipo: 'fim'; baloes?: string[] };

export interface FluxoBot {
  id: string;
  nome: string;
  descricao: string;
  passos: Passo[];
  ativo: boolean;
  criadoEm: string;
}

export const ROTULO_PASSO: Record<Passo['tipo'], string> = {
  mensagem: 'Mensagem', pergunta: 'Pergunta com opções', coletar: 'Coletar dado', acao: 'Ação', fim: 'Fim do fluxo',
};

export const ROTULO_DADO: Record<DadoColeta, string> = {
  nome: 'Nome', cpf: 'CPF (com validação)', telefone: 'Telefone', email: 'E-mail', texto: 'Texto livre',
};

/* ---------------- validações (MESMAS regras do motor) ---------------- */
export function cpfValido(cpf: string): boolean {
  const d = (cpf || '').replace(/\D/g, '');
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const dv = (fatia: number): number => {
    let soma = 0;
    for (let i = 0; i < fatia; i++) soma += Number(d[i]) * (fatia + 1 - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}

export function validarDado(dado: DadoColeta, txt: string): { ok: boolean; valor: string } {
  const t = (txt || '').trim();
  switch (dado) {
    case 'nome': {
      const ok = t.length >= 2 && /\p{L}/u.test(t);
      return { ok, valor: t };
    }
    case 'cpf': {
      // acha a 1ª sequência de 11 dígitos no meio do texto (igual extrairCpfDeTexto do motor),
      // valida DV e guarda MASCARADO (paridade com a fábrica — nada de CPF cru)
      const m = t.replace(/[.\s-]/g, '').match(/\d{11}/);
      const d = m ? m[0] : '';
      const ok = !!d && cpfValido(d);
      return { ok, valor: ok ? `***.***.***-${d.slice(-2)}` : t };
    }
    case 'telefone': {
      const digitos = t.replace(/\D/g, '');
      return { ok: digitos.length >= 10 && digitos.length <= 13, valor: digitos };
    }
    case 'email': {
      const ok = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(t);
      return { ok, valor: t.toLowerCase() };
    }
    default:
      return { ok: t.length > 0, valor: t };
  }
}

const semAcento = (s: string) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
/** normaliza opções como o motor (fluxo_custom.opcoesDe): filtra rótulo vazio + deriva valor */
export function normOpcoes(opcoes: { rotulo: string; valor: string }[]): { rotulo: string; valor: string }[] {
  return (opcoes ?? [])
    .map((o) => ({ rotulo: (o.rotulo ?? '').trim(), valor: (o.valor ?? '').trim() }))
    .filter((o) => o.rotulo)
    .map((o) => ({ ...o, valor: o.valor || semAcento(o.rotulo).replace(/\s+/g, '_') }));
}

/** resposta do cliente casa com alguma opção? (número, valor derivado ou rótulo — sem acento) */
export function casarOpcao(opcoesBrutas: { rotulo: string; valor: string }[], txt: string): string | null {
  const opcoes = normOpcoes(opcoesBrutas);
  const t = semAcento((txt || '').trim());
  if (!t) return null;
  const n = Number(t);
  if (Number.isInteger(n) && n >= 1 && n <= opcoes.length) return opcoes[n - 1].valor;
  for (const o of opcoes) {
    const rot = semAcento(o.rotulo);
    if (t === o.valor.toLowerCase() || t === rot
        || (t.length >= 3 && rot.startsWith(t))
        || (rot.length >= 3 && t.startsWith(rot))) return o.valor;
  }
  return null;
}

/* ---------------- simulador (interpretador puro, sem rede) ---------------- */
export interface EstadoSim { passo: number; dados: Record<string, string>; tentativas: number; encerrado: boolean }
export interface SaidaSim { baloes: string[]; eventos: string[]; estado: EstadoSim; aguardando: boolean }

const MAX_TENTATIVAS = 2; // mesma régua do motor: estourou → chama humano

function baloesDe(p: { baloes?: string[] } | undefined): string[] {
  return (p?.baloes ?? []).map((b) => String(b).trim()).filter(Boolean);
}

function textoPergunta(p: Extract<Passo, { tipo: 'pergunta' }>): string[] {
  const menu = normOpcoes(p.opcoes).map((o, i) => `${i + 1}. ${o.rotulo}`).join('\n');
  const base = baloesDe(p);
  return base.length ? [...base.slice(0, -1), `${base[base.length - 1]}\n\n${menu}`] : [menu];
}

/** roda até o próximo ponto de espera (ou fim), a partir do passo atual */
export function avancarSim(passos: Passo[], estado: EstadoSim): SaidaSim {
  const baloes: string[] = [];
  const eventos: string[] = [];
  let e = { ...estado, dados: { ...estado.dados } };
  while (e.passo < passos.length) {
    const p = passos[e.passo];
    if (!p) break;
    if (p.tipo === 'mensagem') { baloes.push(...baloesDe(p)); e.passo++; continue; }
    if (p.tipo === 'acao') {
      if (p.etiqueta) eventos.push(`🏷 etiqueta aplicada: "${p.etiqueta}"`);
      if (p.chamarHumano) eventos.push('🙋 atendente humano avisado (conversa marcada)');
      if (p.entregarIa) eventos.push('✨ conversa entregue pro Atendente de IA');
      e.passo++; continue;
    }
    if (p.tipo === 'pergunta') { baloes.push(...textoPergunta(p)); return { baloes, eventos, estado: e, aguardando: true }; }
    if (p.tipo === 'coletar') { baloes.push(...baloesDe(p)); return { baloes, eventos, estado: e, aguardando: true }; }
    if (p.tipo === 'fim') { baloes.push(...baloesDe(p)); e = { ...e, encerrado: true }; return { baloes, eventos, estado: e, aguardando: false }; }
    e.passo++;
  }
  return { baloes, eventos, estado: { ...e, encerrado: true }, aguardando: false };
}

/** processa a resposta do cliente no passo de espera atual */
export function responderSim(passos: Passo[], estado: EstadoSim, resposta: string): SaidaSim {
  const p = passos[estado.passo];
  let e = { ...estado, dados: { ...estado.dados } };
  if (!p || (p.tipo !== 'pergunta' && p.tipo !== 'coletar')) {
    return avancarSim(passos, e);
  }
  if (p.tipo === 'pergunta') {
    const valor = casarOpcao(p.opcoes, resposta);
    if (valor === null) {
      e.tentativas++;
      if (e.tentativas > MAX_TENTATIVAS) {
        return { baloes: [], eventos: ['🙋 não entendi 3x → atendente humano avisado'], estado: { ...e, encerrado: true }, aguardando: false };
      }
      return { baloes: [p.reprompt || 'Não entendi — responda com o número de uma das opções 🙂'], eventos: [], estado: e, aguardando: true };
    }
    if (p.salvarEm) e.dados[p.salvarEm] = valor;
    e = { ...e, passo: e.passo + 1, tentativas: 0 };
    const seg = avancarSim(passos, e);
    return { ...seg, eventos: [`💾 ${p.salvarEm || 'resposta'} = "${valor}"`, ...seg.eventos] };
  }
  const v = validarDado(p.dado, resposta);
  if (!v.ok) {
    e.tentativas++;
    if (e.tentativas > MAX_TENTATIVAS) {
      return { baloes: [], eventos: ['🙋 dado inválido 3x → atendente humano avisado'], estado: { ...e, encerrado: true }, aguardando: false };
    }
    return { baloes: [p.reprompt || 'Não consegui validar — pode conferir e mandar de novo?'], eventos: [], estado: e, aguardando: true };
  }
  e.dados[p.salvarEm || p.dado] = v.valor;
  e = { ...e, passo: e.passo + 1, tentativas: 0 };
  const seg = avancarSim(passos, e);
  return { ...seg, eventos: [`💾 ${p.salvarEm || p.dado} = "${v.valor}"`, ...seg.eventos] };
}

/* ---------------- problemas do fluxo (validação do editor) ---------------- */
export function problemasDoFluxo(passos: Passo[]): string[] {
  const avisos: string[] = [];
  if (!passos.length) avisos.push('O fluxo está vazio — adicione ao menos uma mensagem.');
  passos.forEach((p, i) => {
    const n = `Passo ${i + 1}`;
    if (p.tipo === 'mensagem' && !baloesDe(p).length) avisos.push(`${n} (Mensagem): sem texto.`);
    if (p.tipo === 'pergunta') {
      if (!baloesDe(p).length) avisos.push(`${n} (Pergunta): sem texto.`);
      const preenchidas = (p.opcoes ?? []).filter((o) => o.rotulo.trim()).length;
      if (preenchidas < 2) avisos.push(`${n} (Pergunta): precisa de pelo menos 2 opções.`);
      else if (preenchidas < (p.opcoes ?? []).length) avisos.push(`${n} (Pergunta): tem opção sem texto — apague ou preencha (bagunça a numeração).`);
    }
    if (p.tipo === 'coletar' && !baloesDe(p).length) avisos.push(`${n} (Coletar): sem texto pedindo o dado.`);
    if (p.tipo === 'acao' && !p.etiqueta && !p.chamarHumano && !p.entregarIa) avisos.push(`${n} (Ação): nenhuma ação marcada.`);
    if (p.tipo === 'fim' && i < passos.length - 1) avisos.push(`${n} (Fim): há passos depois do fim que nunca vão rodar.`);
  });
  return avisos;
}

/* ---------------- hooks ---------------- */
function mapFluxo(r: Row): FluxoBot {
  return {
    id: r.id as string,
    nome: (r.nome as string) || 'Fluxo',
    descricao: (r.descricao as string) || '',
    passos: (Array.isArray(r.passos) ? r.passos : []) as Passo[],
    ativo: !!r.ativo,
    criadoEm: (r.criado_em as string) || '',
  };
}

export function useFluxos() {
  const { currentOrg } = useOrg();
  const org = currentOrg?.id;
  return useQuery({
    queryKey: ['ia-fluxos', org], enabled: FLUXOS_REAL && !!org,
    queryFn: async (): Promise<FluxoBot[]> => {
      const { data, error } = await supabase!
        .from('ia_fluxos')
        .select('id, nome, descricao, passos, ativo, criado_em')
        .eq('organizacao_id', org!)
        .order('criado_em', { ascending: true });
      if (error) throw new Error(error.message);
      return ((data as Row[]) || []).map(mapFluxo);
    },
  });
}

export function useCriarFluxo() {
  const qc = useQueryClient(); const { currentOrg } = useOrg();
  return useMutation({
    mutationFn: async (): Promise<string> => {
      const { data, error } = await supabase!
        .from('ia_fluxos')
        .insert({ organizacao_id: currentOrg!.id })
        .select('id')
        .single();
      if (error) throw new Error(error.message);
      return (data as Row).id as string;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ia-fluxos', currentOrg?.id] }),
  });
}

export function useSalvarFluxo() {
  const qc = useQueryClient(); const { currentOrg } = useOrg();
  return useMutation({
    mutationFn: async (p: { id: string; nome: string; descricao: string; passos: Passo[]; ativo: boolean }) => {
      const { error } = await supabase!
        .from('ia_fluxos')
        .update({ nome: p.nome.trim() || 'Fluxo', descricao: p.descricao, passos: p.passos, ativo: p.ativo })
        .eq('id', p.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ia-fluxos', currentOrg?.id] }),
  });
}

export function useExcluirFluxo() {
  const qc = useQueryClient(); const { currentOrg } = useOrg();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase!.from('ia_fluxos').delete().eq('id', id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ia-fluxos', currentOrg?.id] });
      qc.invalidateQueries({ queryKey: ['ia-canais', currentOrg?.id] });
    },
  });
}

export function useVincularFluxoCanal() {
  const qc = useQueryClient(); const { currentOrg } = useOrg();
  return useMutation({
    mutationFn: async (p: { canalId: string; fluxoId: string | null }) => {
      const { error } = await supabase!.rpc('ia_fluxo_vincular_canal', { p_canal: p.canalId, p_fluxo: p.fluxoId });
      if (error) throw new Error(error.message);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['ia-canais', currentOrg?.id] }),
  });
}

/* ---------------- mock (demo) ---------------- */
export const MOCK_FLUXOS: FluxoBot[] = [
  {
    id: 'demo-f1',
    nome: 'Boas-vindas + qualificação',
    descricao: 'Recebe o lead, entende o interesse e coleta nome e CPF antes de passar pro time.',
    ativo: true,
    criadoEm: '2026-08-25T12:00:00Z',
    passos: [
      { tipo: 'mensagem', baloes: ['Olá! 👋 Que bom te ver por aqui.', 'Sou o assistente virtual da empresa.'] },
      {
        tipo: 'pergunta',
        baloes: ['Sobre o que você quer falar hoje?'],
        opcoes: [
          { rotulo: 'Empréstimo', valor: 'emprestimo' },
          { rotulo: 'Revisão de descontos', valor: 'revisao' },
          { rotulo: 'Outro assunto', valor: 'outro' },
        ],
        salvarEm: 'interesse',
        reprompt: 'Só me responder com o número de uma das opções 🙂',
      },
      { tipo: 'coletar', baloes: ['Perfeito! Pra eu te encaminhar certinho: qual o seu nome completo?'], dado: 'nome', salvarEm: 'nome', reprompt: 'Pode me dizer seu nome completo?' },
      { tipo: 'coletar', baloes: ['Obrigado! E o seu CPF? (só números)'], dado: 'cpf', salvarEm: 'cpf', reprompt: 'Esse CPF não bateu — confere os números pra mim?' },
      { tipo: 'acao', etiqueta: 'lead-qualificado', chamarHumano: true },
      { tipo: 'fim', baloes: ['Prontinho! Um dos nossos atendentes já vai falar com você. 🙌'] },
    ],
  },
];
