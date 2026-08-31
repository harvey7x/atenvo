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
  | { tipo: 'acao'; etiqueta?: string; etiquetaId?: string; moverEtapaId?: string; chamarHumano?: boolean; entregarIa?: boolean }
  | { tipo: 'fim'; baloes?: string[] }
);

/** GATILHO: quando o fluxo COMEÇA numa conversa (só o início; conversa em andamento continua) */
export type Gatilho = { tipo: 'sempre' | 'palavra_chave'; palavras?: string[] };
export const GATILHO_PADRAO: Gatilho = { tipo: 'sempre' };

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
  gatilho: Gatilho;
  ativo: boolean;
  criadoEm: string;
}

export const ROTULO_PASSO: Record<Passo['tipo'], string> = {
  mensagem: 'Mensagem', midia: 'Mídia (imagem/vídeo)', pergunta: 'Pergunta com opções', coletar: 'Coletar dado', acao: 'Ação', fim: 'Fim do fluxo',
};

/** o que cada tipo de passo faz — mostrado no editor pra quem monta o fluxo do zero entender */
export const DESCRICAO_PASSO: Record<Passo['tipo'], string> = {
  mensagem: 'O bot manda um ou mais balões de texto e segue em frente — não espera resposta. Bom pra saudar e explicar.',
  midia: 'Envia uma imagem ou um vídeo (ex.: o vídeo de boas-vindas da campanha) e segue em frente. Aceita uma legenda.',
  pergunta: 'Faz uma pergunta e ESPERA a resposta do cliente. Cada opção pode seguir por um caminho diferente do fluxo.',
  coletar: 'Pede um dado (nome, CPF, telefone, e-mail) e ESPERA. O bot valida e salva na ficha do cliente automaticamente.',
  acao: 'Nos bastidores, sem falar nada: aplica uma etiqueta, move o lead pra uma etapa do Kanban, chama um atendente humano ou entrega pro Atendente de IA.',
  fim: 'Encerra o fluxo. O bot fica em silêncio nessa conversa e o atendimento segue com o seu time.',
};

/** sugestão de quando usar cada tipo — aparece no botão "adicionar passo" (title/tooltip) */
export const DICA_PASSO: Record<Passo['tipo'], string> = {
  mensagem: 'ex.: "Olá! Seja bem-vindo(a)."',
  midia: 'ex.: foto do escritório ou vídeo de apresentação',
  pergunta: 'ex.: "Qual assunto? 1) Empréstimo 2) Outro"',
  coletar: 'ex.: pedir o nome ou o CPF',
  acao: 'ex.: etiquetar e chamar um humano',
  fim: 'encerra a conversa automática',
};

export const ROTULO_DADO: Record<DadoColeta, string> = {
  nome: 'Nome', cpf: 'CPF (com validação)', telefone: 'Telefone', email: 'E-mail', texto: 'Texto livre',
};

/** o que cada dado faz ao ser coletado — recomendação pro seletor de "Qual dado?" */
export const DICA_DADO: Record<DadoColeta, string> = {
  nome: 'Valida que tem ao menos 2 letras. Salva na ficha e habilita a variável {primeiro_nome}.',
  cpf: 'Confere os 11 dígitos e o dígito verificador. Guarda o CPF na ficha (mascarado na conversa).',
  telefone: 'Aceita 10 a 13 dígitos. Salva na ficha do cliente.',
  email: 'Confere o formato (algo@algo.com). Salva na ficha do cliente.',
  texto: 'Aceita qualquer texto. Fica guardado só na conversa (não vai pra ficha).',
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

/** o fluxo COMEÇA nesta conversa? ESPELHO do motor (fluxo_custom.ts gatilhoBate).
    'palavra_chave' vazio/tipo desconhecido => começa (fail-open, nunca deixa o canal mudo). */
export function gatilhoBate(gatilho: Gatilho | undefined, texto: string): boolean {
  if (!gatilho || gatilho.tipo !== 'palavra_chave') return true;
  const palavras = (gatilho.palavras ?? []).map((w) => semAcento(String(w ?? '')).trim()).filter(Boolean);
  if (!palavras.length) return true;
  const t = semAcento(texto ?? '');
  return palavras.some((w) => t.includes(w));
}
/** texto curto de como o fluxo é disparado (pra lista/topo) */
export function descricaoGatilho(g: Gatilho | undefined): string {
  if (!g || g.tipo === 'sempre') return 'Toda conversa nova';
  const ps = (g.palavras ?? []).filter(Boolean);
  return ps.length ? `Palavra-chave: ${ps.join(', ')}` : 'Palavra-chave (defina as palavras)';
}

/* ---------------- simulador (interpretador puro, sem rede) ---------------- */
export interface EstadoSim { passo: number; dados: Record<string, string>; tentativas: number; encerrado: boolean }
export type SaidaSimItem = { tipo: 'texto'; texto: string } | { tipo: 'midia'; midiaTipo: 'imagem' | 'video'; url: string; legenda: string };
export interface SaidaSim { saidas: SaidaSimItem[]; baloes: string[]; eventos: string[]; estado: EstadoSim; aguardando: boolean }

const MAX_TENTATIVAS = 2; // mesma régua do motor
const MAX_SAIDAS_SIM = 6; // mesmo teto de itens/turno do motor (fluxo_custom.ts)

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
const mkSim = (saidas: SaidaSimItem[], eventos: string[], estado: EstadoSim, aguardando: boolean): SaidaSim => {
  const cortadas = saidas.slice(0, MAX_SAIDAS_SIM); // motor corta em MAX_SAIDAS_TURNO
  return { saidas: cortadas, baloes: textosSim(cortadas), eventos, estado, aguardando };
};

/** nomes pra mostrar no simulador (etiqueta/coluna são id no passo; o painel resolve o nome) */
export type RotulosSim = { etiquetas?: Record<string, string>; colunas?: Record<string, string> };

/** roda até o próximo ponto de espera (ou fim), a partir do passo atual */
export function avancarSim(passos: Passo[], estado: EstadoSim, rotulos?: RotulosSim): SaidaSim {
  const saidas: SaidaSimItem[] = [];
  const eventos: string[] = [];
  let e = { ...estado, dados: { ...estado.dados } };
  while (e.passo < passos.length) {
    const p = passos[e.passo];
    if (!p) break;
    if (p.tipo === 'mensagem') { for (const b of baloesDe(p)) saidas.push({ tipo: 'texto', texto: b }); e.passo++; continue; }
    if (p.tipo === 'midia') { const url = (p.url || '').trim(); if (url) saidas.push({ tipo: 'midia', midiaTipo: p.midiaTipo === 'video' ? 'video' : 'imagem', url, legenda: p.legenda || '' }); e.passo++; continue; }
    if (p.tipo === 'acao') {
      if (p.etiqueta) eventos.push(`🏷 etiqueta: "${p.etiqueta}"`);
      if (p.etiquetaId) eventos.push(`🏷 etiqueta: ${rotulos?.etiquetas?.[p.etiquetaId] ?? '(selecionada)'}`);
      if (p.moverEtapaId) eventos.push(`↗ move pra etapa: ${rotulos?.colunas?.[p.moverEtapaId] ?? '(selecionada)'}`);
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
export function responderSim(passos: Passo[], estado: EstadoSim, resposta: string, rotulos?: RotulosSim): SaidaSim {
  const p = passos[estado.passo];
  let e = { ...estado, dados: { ...estado.dados } };
  if (!p || (p.tipo !== 'pergunta' && p.tipo !== 'coletar')) return avancarSim(passos, e, rotulos);
  if (p.tipo === 'pergunta') {
    const op = casarOpcao(p.opcoes, resposta);
    if (op === null) {
      e.tentativas++;
      if (e.tentativas > MAX_TENTATIVAS) return mkSim([], ['🙋 não entendi 3x → atendente humano avisado'], { ...e, encerrado: true }, false);
      const rpDefault = p.semMenu ? 'Não entendi — pode responder de novo? 🙂' : 'Não entendi — responda com o número de uma das opções 🙂';
      return mkSim([{ tipo: 'texto', texto: (p.reprompt || '').trim() || rpDefault }], [], e, true);
    }
    const eventos = [`💾 ${p.salvarEm || 'resposta'} = "${op.valor}"`];
    if (p.salvarEm) e.dados[p.salvarEm] = op.valor;
    if (op.irPara === 'fim') { eventos.push('↪ opção encerra o fluxo'); return mkSim([], eventos, { ...e, passo: passos.length, tentativas: 0, encerrado: true }, false); }
    let destino = e.passo + 1;
    if (op.irPara) { const idx = idxPorId(passos, op.irPara); if (idx >= 0) { destino = idx; eventos.push(`↪ vai para o passo ${idx + 1}`); } }
    e = { ...e, passo: destino, tentativas: 0 };
    const seg = avancarSim(passos, e, rotulos);
    return { ...seg, eventos: [...eventos, ...seg.eventos] };
  }
  const v = validarDado(p.dado, resposta);
  if (!v.ok) {
    e.tentativas++;
    if (e.tentativas > MAX_TENTATIVAS) return mkSim([], ['🙋 dado inválido 3x → atendente humano avisado'], { ...e, encerrado: true }, false);
    return mkSim([{ tipo: 'texto', texto: (p.reprompt || '').trim() || 'Não consegui validar — pode conferir e mandar de novo?' }], [], e, true);
  }
  const chave = p.salvarEm || p.dado;
  e.dados[chave] = v.valor;
  const eventos = [`💾 ${chave} = "${v.valor}"`];
  if (p.dado !== 'texto') eventos.push(`📇 salvo na ficha do cliente (${p.dado})`);
  e = { ...e, passo: e.passo + 1, tentativas: 0 };
  const seg = avancarSim(passos, e, rotulos);
  return { ...seg, eventos: [...eventos, ...seg.eventos] };
}

/* ---------------- problemas do fluxo (validação do editor) ---------------- */
export function problemasDoFluxo(passos: Passo[], gatilho?: Gatilho): string[] {
  const avisos: string[] = [];
  // com ramificação, um 'fim' no meio é legítimo (um ramo encerra cedo; outros passos rodam por outro caminho)
  const temRamificacao = passos.some((pp) => pp.tipo === 'pergunta' && (pp.opcoes ?? []).some((o) => o.irPara));
  if (gatilho?.tipo === 'palavra_chave' && !(gatilho.palavras ?? []).some((w) => w.trim()))
    avisos.push('Gatilho: escolheu "palavra-chave" mas não definiu nenhuma palavra — o fluxo nunca dispararia (ou dispara sempre).');
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
    if (p.tipo === 'midia' && !(p.url || '').trim()) avisos.push(`${n} (Mídia): sem link do arquivo — o cliente não recebe nada.`);
    if (p.tipo === 'coletar' && !baloesDe(p).length) avisos.push(`${n} (Coletar): sem texto pedindo o dado.`);
    if (p.tipo === 'acao' && !p.etiqueta && !p.etiquetaId && !p.moverEtapaId && !p.chamarHumano && !p.entregarIa) avisos.push(`${n} (Ação): nenhuma ação marcada.`);
    if (p.tipo === 'fim' && i < passos.length - 1 && !temRamificacao) avisos.push(`${n} (Fim): há passos depois do fim que nunca vão rodar.`);
  });
  return avisos;
}

/* ---------------- hooks ---------------- */
/** normaliza o gatilho vindo do banco/arquivo pra forma canônica (nunca quebra) */
export function lerGatilho(raw: unknown): Gatilho {
  const g = (raw && typeof raw === 'object' ? raw : {}) as { tipo?: unknown; palavras?: unknown };
  if (g.tipo === 'palavra_chave') {
    const palavras = (Array.isArray(g.palavras) ? g.palavras : [])
      .map((w) => String(w ?? '').trim()).filter(Boolean).slice(0, 20);
    return { tipo: 'palavra_chave', palavras };
  }
  return { tipo: 'sempre' };
}

function mapFluxo(r: Row): FluxoBot {
  return {
    id: r.id as string,
    nome: (r.nome as string) || 'Fluxo',
    descricao: (r.descricao as string) || '',
    passos: (Array.isArray(r.passos) ? r.passos : []) as Passo[],
    gatilho: lerGatilho(r.gatilho),
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
        .select('id, nome, descricao, passos, gatilho, ativo, criado_em')
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
    mutationFn: async (p: { id: string; nome: string; descricao: string; passos: Passo[]; gatilho: Gatilho; ativo: boolean }) => {
      const { error } = await supabase!
        .from('ia_fluxos')
        .update({ nome: p.nome.trim() || 'Fluxo', descricao: p.descricao, passos: p.passos, gatilho: lerGatilho(p.gatilho), ativo: p.ativo })
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

/* ---------------- etapas do Kanban pro passo Ação (mover) ---------------- */
export type EtapaFluxo = { id: string; nome: string; cor: string };
/** colunas NEUTRAS do funil padrão da org (ganho/perdido exigem motivo → fora do fluxo) */
export function useEtapasFluxo() {
  const { currentOrg } = useOrg();
  const org = currentOrg?.id;
  return useQuery({
    queryKey: ['ia-fluxo-etapas', org], enabled: FLUXOS_REAL && !!org,
    queryFn: async (): Promise<EtapaFluxo[]> => {
      const { data: funil } = await supabase!.from('funis')
        .select('id').eq('organizacao_id', org!).eq('padrao', true).order('ordem', { ascending: true }).limit(1).maybeSingle();
      const funilId = (funil as Row | null)?.id as string | undefined;
      if (!funilId) return [];
      const { data: cols } = await supabase!.from('funil_colunas')
        .select('id, nome, cor, ordem, resultado').eq('organizacao_id', org!).eq('funil_id', funilId)
        .eq('arquivada', false).eq('resultado', 'neutro').order('ordem', { ascending: true });
      return ((cols as Row[]) || []).map((c) => ({ id: c.id as string, nome: (c.nome as string) || 'Etapa', cor: (c.cor as string) || '#64748b' }));
    },
  });
}

/* ---------------- exportar / importar (arquivo .json) ---------------- */
export function exportarFluxo(f: FluxoBot) {
  return { tipo: 'fluxo-atenvo', versao: 1, nome: f.nome, descricao: f.descricao, gatilho: f.gatilho, passos: f.passos };
}
const TIPOS_PASSO_OK = new Set(['mensagem', 'midia', 'pergunta', 'coletar', 'acao', 'fim']);
// só aceita STRING (arquivo importado é não confiável): número/objeto/array viram '' e somem,
// em vez de virar lixo tipo "[object Object]" no balão/legenda.
const strCap = (v: unknown, max: number): string => (typeof v === 'string' ? v : '').slice(0, max);
const baloesCap = (v: unknown): string[] =>
  (Array.isArray(v) ? v : []).slice(0, 12).map((b) => strCap(b, 2000).trim()).filter(Boolean);

/** reconstrói UM passo na forma canônica, só com campos conhecidos e limitados
    (arquivo importado é fonte NÃO confiável — não guardamos chaves/valores extras) */
function sanearPassoImportado(raw: Record<string, unknown>): Passo | null {
  const tipo = raw.tipo as string;
  const id = typeof raw.id === 'string' ? raw.id.slice(0, 64) : undefined;
  const base = id ? { id } : {};
  switch (tipo) {
    case 'mensagem':
      return { ...base, tipo: 'mensagem', baloes: baloesCap(raw.baloes) } as Passo;
    case 'midia':
      return {
        ...base, tipo: 'midia',
        midiaTipo: raw.midiaTipo === 'video' ? 'video' : 'imagem',
        url: strCap(raw.url, 2000).trim(),
        legenda: strCap(raw.legenda, 2000),
      } as Passo;
    case 'pergunta': {
      const opcoes = (Array.isArray(raw.opcoes) ? raw.opcoes : []).slice(0, 12)
        .map((o) => {
          const r = (o ?? {}) as Record<string, unknown>;
          const irPara = strCap(r.irPara, 64).trim();
          return { rotulo: strCap(r.rotulo, 120), valor: strCap(r.valor, 60), ...(irPara ? { irPara } : {}) };
        })
        .filter((o) => o.rotulo.trim());
      return {
        ...base, tipo: 'pergunta', baloes: baloesCap(raw.baloes), opcoes,
        salvarEm: strCap(raw.salvarEm, 40), reprompt: strCap(raw.reprompt, 500),
        ...(raw.semMenu === true ? { semMenu: true } : {}),
      } as Passo;
    }
    case 'coletar':
      return {
        ...base, tipo: 'coletar', baloes: baloesCap(raw.baloes),
        dado: (['nome', 'cpf', 'telefone', 'email', 'texto'].includes(raw.dado as string) ? raw.dado : 'texto') as DadoColeta,
        salvarEm: strCap(raw.salvarEm, 40), reprompt: strCap(raw.reprompt, 500),
      } as Passo;
    case 'acao':
      return {
        ...base, tipo: 'acao', etiqueta: strCap(raw.etiqueta, 60),
        etiquetaId: strCap(raw.etiquetaId, 64).trim(), moverEtapaId: strCap(raw.moverEtapaId, 64).trim(),
        chamarHumano: raw.chamarHumano === true, entregarIa: raw.entregarIa === true,
      } as Passo;
    case 'fim':
      return { ...base, tipo: 'fim', baloes: baloesCap(raw.baloes) } as Passo;
    default:
      return null;
  }
}

/** valida + normaliza um arquivo de fluxo importado (lança Error com mensagem amigável) */
export function parseFluxoImportado(texto: string): { nome: string; descricao: string; passos: Passo[]; gatilho: Gatilho } {
  let obj: Record<string, unknown>;
  try { obj = JSON.parse(texto) as Record<string, unknown>; }
  catch { throw new Error('Arquivo inválido: não parece um JSON de fluxo.'); }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error('Arquivo inválido.');
  if (obj.tipo && obj.tipo !== 'fluxo-atenvo') throw new Error('Este arquivo é de outro tipo (talvez um Atendente). Use "Importar" na área certa.');
  const passos = obj.passos;
  if (!Array.isArray(passos)) throw new Error('Este arquivo não é um fluxo (não tem "passos").');
  if (passos.length > 100) throw new Error('Fluxo grande demais (máximo 100 passos).');
  const limpos = passos
    .filter((p): p is Record<string, unknown> => !!p && typeof p === 'object' && TIPOS_PASSO_OK.has((p as Record<string, unknown>).tipo as string))
    .map(sanearPassoImportado)
    .filter((p): p is Passo => p !== null);
  if (!limpos.length) throw new Error('O arquivo não tem passos válidos.');
  return {
    nome: strCap(obj.nome, 120) || 'Fluxo importado',
    descricao: strCap(obj.descricao, 500),
    gatilho: lerGatilho(obj.gatilho),
    passos: garantirIds(limpos),
  };
}
export function useImportarFluxo() {
  const qc = useQueryClient(); const { currentOrg } = useOrg();
  return useMutation({
    mutationFn: async (p: { nome: string; descricao: string; passos: Passo[]; gatilho: Gatilho }): Promise<string> => {
      const { data, error } = await supabase!.from('ia_fluxos')
        .insert({ organizacao_id: currentOrg!.id, nome: p.nome, descricao: p.descricao, passos: p.passos, gatilho: lerGatilho(p.gatilho), ativo: false })
        .select('id').single();
      if (error) throw new Error(error.message);
      return (data as Row).id as string;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ia-fluxos', currentOrg?.id] }),
  });
}

/* ---------------- mock (demo) ---------------- */
export const MOCK_FLUXOS: FluxoBot[] = [
  {
    id: 'demo-f1',
    nome: 'Boas-vindas + qualificação',
    descricao: 'Recebe o lead, entende o interesse e coleta nome e CPF antes de passar pro time.',
    gatilho: { tipo: 'sempre' },
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
