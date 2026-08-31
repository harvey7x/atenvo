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

export interface OpcaoFluxo { rotulo: string; valor: string; irPara?: string }  // irPara = id de passo | 'fim' | vazio(próximo)
export type Passo = { id?: string } & (
  | { tipo: 'mensagem'; baloes: string[] }
  | { tipo: 'midia'; midiaTipo: 'imagem' | 'video'; url: string; legenda: string }
  | { tipo: 'pergunta'; baloes: string[]; opcoes: OpcaoFluxo[]; salvarEm: string; reprompt: string; semMenu?: boolean }
  | { tipo: 'coletar'; baloes: string[]; dado: DadoColeta; salvarEm: string; reprompt: string }
  | { tipo: 'acao'; etiqueta?: string; chamarHumano?: boolean; entregarIa?: boolean }
  | { tipo: 'fim'; baloes?: string[] }
);

/** garante id estável em todo passo (backfill de fluxos antigos) */
export function garantirIds(passos: Passo[]): Passo[] {
  const gid = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `p_${Math.random().toString(36).slice(2, 10)}`);
  return passos.map((p) => (p.id ? p : { ...p, id: gid() }));
}

export interface FluxoBot {
  id: string;
  nome: string;
  descricao: string;
  passos: Passo[];
  ativo: boolean;
  criadoEm: string;
}

export const ROTULO_PASSO: Record<Passo['tipo'], string> = {
  mensagem: 'Mensagem', midia: 'Mídia (imagem/vídeo)', pergunta: 'Pergunta com opções', coletar: 'Coletar dado', acao: 'Ação', fim: 'Fim do fluxo',
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
      // PARIDADE EXATA com extrairCpfDeTexto do motor: (1) se os dígitos TOTAIS somam 11 (cobre
      // separador incomum tipo vírgula), usa-os; (2) senão a 1ª RUN de dígitos que normalize p/ 11.
      const todos = t.replace(/\D/g, '');
      let d = '';
      if (todos.length === 11) d = todos;
      else {
        for (const run of (t.match(/\d[\d .\/-]*\d|\d/g) || [])) {
          const dig = run.replace(/\D/g, '');
          if (dig.length === 11) { d = dig; break; }
        }
      }
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

/** interpola {chave} nos balões (paridade com o motor). {primeiro_nome}=1ª palavra do nome; var sem valor some. */
export function interpolar(texto: string, dados: Record<string, string>): string {
  return String(texto ?? '').replace(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g, (_m, chave: string) => {
    if (chave === 'primeiro_nome') { const n = String(dados['nome'] ?? '').trim(); return n ? n.split(/\s+/)[0] : ''; }
    const v = dados[chave];
    return (v === undefined || v === null) ? '' : String(v);
  });
}
/** normaliza opções como o motor (fluxo_custom.opcoesDe): filtra rótulo vazio + deriva valor */
export function normOpcoes(opcoes: OpcaoFluxo[]): OpcaoFluxo[] {
  return (opcoes ?? [])
    .map((o) => ({ rotulo: (o.rotulo ?? '').trim(), valor: (o.valor ?? '').trim(), ...(o.irPara ? { irPara: o.irPara } : {}) }))
    .filter((o) => o.rotulo)
    .map((o) => ({ ...o, valor: o.valor || semAcento(o.rotulo).replace(/\s+/g, '_') }));
}

/** resposta do cliente casa com alguma opção? devolve a OPÇÃO casada (com irPara) ou null */
export function casarOpcao(opcoesBrutas: OpcaoFluxo[], txt: string): OpcaoFluxo | null {
  const opcoes = normOpcoes(opcoesBrutas);
  const t = semAcento((txt || '').trim());
  if (!t) return null;
  const n = Number(t);
  if (Number.isInteger(n) && n >= 1 && n <= opcoes.length) return opcoes[n - 1];
  for (const o of opcoes) {
    const rot = semAcento(o.rotulo);
    if (t === o.valor.toLowerCase() || t === rot
        || (t.length >= 3 && rot.startsWith(t))
        || (rot.length >= 3 && t.startsWith(rot))) return o;
  }
  return null;
}
function idxPorId(passos: Passo[], id: string): number {
  if (!id) return -1;
  return passos.findIndex((p) => p.id === id);
}

/* ---------------- simulador (interpretador puro, sem rede) ---------------- */
export interface EstadoSim { passo: number; dados: Record<string, string>; tentativas: number; encerrado: boolean }
export type SaidaSimItem = { tipo: 'texto'; texto: string } | { tipo: 'midia'; midiaTipo: 'imagem' | 'video'; url: string; legenda: string };
export interface SaidaSim { saidas: SaidaSimItem[]; baloes: string[]; eventos: string[]; estado: EstadoSim; aguardando: boolean }

const MAX_TENTATIVAS = 2; // mesma régua do motor

function baloesDe(p: { baloes?: string[] } | undefined): string[] {
  return (p?.baloes ?? []).map((b) => String(b).trim()).filter(Boolean);
}
function menuPergunta(p: Extract<Passo, { tipo: 'pergunta' }>): string[] {
  const base = baloesDe(p);
  if (p.semMenu) return base;   // SIM/NÃO livre: sem "1. 2." (igual ao motor)
  const menu = normOpcoes(p.opcoes).map((o, i) => `${i + 1}. ${o.rotulo}`).join('\n');
  return base.length ? [...base.slice(0, -1), `${base[base.length - 1]}\n\n${menu}`] : [menu];
}
const textosSim = (saidas: SaidaSimItem[]): string[] =>
  saidas.filter((x): x is { tipo: 'texto'; texto: string } => x.tipo === 'texto').map((x) => x.texto);
const mkSim = (saidas: SaidaSimItem[], eventos: string[], estado: EstadoSim, aguardando: boolean): SaidaSim =>
  ({ saidas, baloes: textosSim(saidas), eventos, estado, aguardando });

/** roda até o próximo ponto de espera (ou fim), a partir do passo atual */
export function avancarSim(passos: Passo[], estado: EstadoSim): SaidaSim {
  const saidas: SaidaSimItem[] = [];
  const eventos: string[] = [];
  let e = { ...estado, dados: { ...estado.dados } };
  while (e.passo < passos.length) {
    const p = passos[e.passo];
    if (!p) break;
    if (p.tipo === 'mensagem') { for (const b of baloesDe(p)) saidas.push({ tipo: 'texto', texto: b }); e.passo++; continue; }
    if (p.tipo === 'midia') { const url = (p.url || '').trim(); if (url) saidas.push({ tipo: 'midia', midiaTipo: p.midiaTipo === 'video' ? 'video' : 'imagem', url, legenda: p.legenda || '' }); e.passo++; continue; }
    if (p.tipo === 'acao') {
      if (p.etiqueta) eventos.push(`🏷 etiqueta aplicada: "${p.etiqueta}"`);
      if (p.chamarHumano) eventos.push('🙋 atendente humano avisado (conversa marcada)');
      if (p.entregarIa) eventos.push('✨ conversa entregue pro Atendente de IA');
      e.passo++; continue;
    }
    if (p.tipo === 'pergunta') {
      if (normOpcoes(p.opcoes).length < 2) { e.passo++; continue; }
      for (const b of menuPergunta(p)) saidas.push({ tipo: 'texto', texto: b });
      return mkSim(saidas, eventos, e, true);
    }
    if (p.tipo === 'coletar') { for (const b of baloesDe(p)) saidas.push({ tipo: 'texto', texto: b }); return mkSim(saidas, eventos, e, true); }
    if (p.tipo === 'fim') { for (const b of baloesDe(p)) saidas.push({ tipo: 'texto', texto: b }); return mkSim(saidas, eventos, { ...e, encerrado: true }, false); }
    e.passo++;
  }
  return mkSim(saidas, eventos, { ...e, encerrado: true }, false);
}

/** processa a resposta do cliente no passo de espera atual (ramificação + coleta) */
export function responderSim(passos: Passo[], estado: EstadoSim, resposta: string): SaidaSim {
  const p = passos[estado.passo];
  let e = { ...estado, dados: { ...estado.dados } };
  if (!p || (p.tipo !== 'pergunta' && p.tipo !== 'coletar')) return avancarSim(passos, e);
  if (p.tipo === 'pergunta') {
    const op = casarOpcao(p.opcoes, resposta);
    if (op === null) {
      e.tentativas++;
      if (e.tentativas > MAX_TENTATIVAS) return mkSim([], ['🙋 não entendi 3x → atendente humano avisado'], { ...e, encerrado: true }, false);
      return mkSim([{ tipo: 'texto', texto: p.reprompt || 'Não entendi — responda com uma das opções 🙂' }], [], e, true);
    }
    const eventos = [`💾 ${p.salvarEm || 'resposta'} = "${op.valor}"`];
    if (p.salvarEm) e.dados[p.salvarEm] = op.valor;
    if (op.irPara === 'fim') { eventos.push('↪ opção encerra o fluxo'); return mkSim([], eventos, { ...e, passo: passos.length, tentativas: 0, encerrado: true }, false); }
    let destino = e.passo + 1;
    if (op.irPara) { const idx = idxPorId(passos, op.irPara); if (idx >= 0) { destino = idx; eventos.push(`↪ vai para o passo ${idx + 1}`); } }
    e = { ...e, passo: destino, tentativas: 0 };
    const seg = avancarSim(passos, e);
    return { ...seg, eventos: [...eventos, ...seg.eventos] };
  }
  const v = validarDado(p.dado, resposta);
  if (!v.ok) {
    e.tentativas++;
    if (e.tentativas > MAX_TENTATIVAS) return mkSim([], ['🙋 dado inválido 3x → atendente humano avisado'], { ...e, encerrado: true }, false);
    return mkSim([{ tipo: 'texto', texto: p.reprompt || 'Não consegui validar — pode conferir e mandar de novo?' }], [], e, true);
  }
  const chave = p.salvarEm || p.dado;
  e.dados[chave] = v.valor;
  const eventos = [`💾 ${chave} = "${v.valor}"`];
  if (p.dado !== 'texto') eventos.push(`📇 salvo na ficha do cliente (${p.dado})`);
  e = { ...e, passo: e.passo + 1, tentativas: 0 };
  const seg = avancarSim(passos, e);
  return { ...seg, eventos: [...eventos, ...seg.eventos] };
}

/* ---------------- problemas do fluxo (validação do editor) ---------------- */
export function problemasDoFluxo(passos: Passo[]): string[] {
  const avisos: string[] = [];
  // com ramificação, um 'fim' no meio é legítimo (um ramo encerra cedo; outros passos rodam por outro caminho)
  const temRamificacao = passos.some((pp) => pp.tipo === 'pergunta' && (pp.opcoes ?? []).some((o) => o.irPara));
  if (!passos.length) avisos.push('O fluxo está vazio — adicione ao menos uma mensagem.');
  passos.forEach((p, i) => {
    const n = `Passo ${i + 1}`;
    if (p.tipo === 'mensagem' && !baloesDe(p).length) avisos.push(`${n} (Mensagem): sem texto.`);
    if (p.tipo === 'pergunta') {
      if (!baloesDe(p).length) avisos.push(`${n} (Pergunta): sem texto.`);
      const preenchidas = (p.opcoes ?? []).filter((o) => o.rotulo.trim()).length;
      if (preenchidas < 2) avisos.push(`${n} (Pergunta): precisa de pelo menos 2 opções.`);
      else if (preenchidas < (p.opcoes ?? []).length) avisos.push(`${n} (Pergunta): tem opção sem texto — apague ou preencha (bagunça a numeração).`);
      for (const o of (p.opcoes ?? [])) {
        if (o.irPara && o.irPara !== 'fim' && !passos.some((x) => x.id === o.irPara)) {
          avisos.push(`${n} (Pergunta): a opção "${o.rotulo || '—'}" aponta pra um passo que não existe mais.`);
        }
      }
    }
    if (p.tipo === 'coletar' && !baloesDe(p).length) avisos.push(`${n} (Coletar): sem texto pedindo o dado.`);
    if (p.tipo === 'acao' && !p.etiqueta && !p.chamarHumano && !p.entregarIa) avisos.push(`${n} (Ação): nenhuma ação marcada.`);
    if (p.tipo === 'fim' && i < passos.length - 1 && !temRamificacao) avisos.push(`${n} (Fim): há passos depois do fim que nunca vão rodar.`);
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
