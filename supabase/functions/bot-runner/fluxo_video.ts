// fluxo_video.ts — MOTOR do fluxo caf_video_juros_v1 (VSL de juros abusivos, canal OFICIAL).
// Determinístico, SEM IA. Puro (sem Deno/DB) — compartilhado com os testes vitest, igual ao
// fluxo.ts/fluxo_botoes.ts. Quem envia/persiste/agenda é o bot-runner; quem entrega o RESULTADO
// diferido (8 min) é o worker bot-fila-processar.
//
// TRILHO: abertura (texto + VÍDEO com legenda) → pergunta SIM/NÃO → nome → CPF (com DV) →
// ack + agenda 'resultado' (3 balões, +8 min na fila) → fecho no worker (Lead Qualificado +
// etiqueta + precisa_humano + alerta). NÃO → recusa educada + etiqueta remarketing-bot; um SIM
// depois reentra em pede_nome.
//
// SEM guardrail (saidaSuja) DE PROPÓSITO: a copy é FIXA e aprovada pelo dono — e cita "tem
// direito de receber valores" na legenda do vídeo, que o saidaSuja barraria (afirma_direito).
// O guardrail existe para SAÍDA DE IA e para o fluxo de crédito; aqui não há texto gerado.
import { validarCpfDigits, mascararCpf, primeiroNome } from './fluxo.ts';

/** Um balão do fluxo: texto puro ou o vídeo (Cloud API baixa a URL pública sozinha). */
export type TelaVideo =
  | { tipo: 'texto'; corpo: string }
  | { tipo: 'video'; url: string; caption: string };

export interface EntradaVideo { texto: string; ehAudio: boolean }

/** Copy do fluxo — vem de bot_canal_config.mensagens.caf_video_juros_v1 (jsonb), com este
 *  default como rede de segurança (mesmo papel do DEFAULT_COPY do fluxo.ts). */
export interface CopyVideo {
  abertura: string[];          // balões de texto ANTES do vídeo
  video_url: string;           // URL pública do Storage (bucket bot-midia). Vazia = pula o vídeo.
  video_caption: string;       // legenda do vídeo
  pergunta_analise: string[];  // logo após o vídeo, no MESMO burst
  recusa: string;
  reprompt_sim_nao: string;
  pede_nome: string;
  reprompt_nome: string;
  pede_cpf: string[];
  reprompt_cpf: string;
  ack_cpf: string;             // {primeiro_nome}
  resultado: string[];         // 3 balões diferidos (+8 min) — {primeiro_nome}
  audio_desvio: string;
  handoff_humano: string;
}

export const DEFAULT_COPY_VIDEO: CopyVideo = {
  abertura: ['Olá! 👋 Seja bem-vindo(a) à *CAF – Central de Assessoria Financeira*.'],
  video_url: '',
  video_caption: '▶️ Assista, leva só 30 segundos: nosso advogado explica como funcionam os juros abusivos em empréstimos — e quando você tem direito de receber valores de volta. 😊',
  pergunta_analise: [
    'Quer fazer uma *análise gratuita* pra descobrir se você paga juros abusivos e tem valores a recuperar?',
    'Responda *SIM* ou *NÃO*',
  ],
  recusa: 'Sem problema! 😊 Se mudar de ideia, é só mandar um *SIM* aqui a qualquer momento. A análise é gratuita e fica à sua disposição.',
  reprompt_sim_nao: 'Pode me responder com *SIM* ou *NÃO* pra eu seguir com a sua análise? 😊',
  pede_nome: 'Ótima decisão! 👏 Pra iniciar sua análise, me informe seu *nome completo*:',
  reprompt_nome: 'Pode me enviar seu *nome completo*? (nome e sobrenome) 🙂',
  pede_cpf: [
    'Poderia me informar seu *CPF*?',
    '🔒 Seus dados são usados somente para a consulta, com total sigilo. *Nunca pedimos senhas, códigos ou qualquer pagamento.* A análise é 100% gratuita.',
  ],
  reprompt_cpf: 'Ops, esse CPF parece incompleto. Me envia de novo, por favor 😊',
  ack_cpf: '✅ Recebido, {primeiro_nome}! Sua análise foi iniciada. Em alguns minutos retorno aqui com uma atualização. ⏳',
  resultado: [
    '{primeiro_nome}, atualização da sua análise 📋',
    'Seu CPF entrou na fila da nossa equipe jurídica. E um dado importante: *a grande maioria dos contratos que analisamos tem juros acima do limite legal*.',
    'Ou seja, a chance de recuperar valores no seu caso é real. Um dos nossos atendentes te chama *ainda hoje* aqui no WhatsApp com o resultado. Fique de olho! 📲',
  ],
  audio_desvio: 'Recebi seu áudio! Pra agilizar sua análise, me manda por escrito, por favor 😊',
  handoff_humano: 'Sem problema! Um de nossos atendentes vai te ajudar com isso pessoalmente. 🙏',
};

/** Config parcial do jsonb → copy completa (chave ausente cai no default; formato dos fluxos
 *  existentes: cada etapa é uma chave, balões em array, {primeiro_nome} como placeholder). */
export function montarCopyVideo(cfg: unknown): CopyVideo {
  const c = (cfg && typeof cfg === 'object' ? cfg : {}) as Partial<CopyVideo>;
  return { ...DEFAULT_COPY_VIDEO, ...Object.fromEntries(Object.entries(c).filter(([, v]) => v != null)) } as CopyVideo;
}

// ---- SIM/NÃO (case/acento-insensitive) ----
// NÃO é checado ANTES do SIM ("não quero" contém "quero"). Fora das listas → null (reprompt);
// conservador de propósito: "não sei" não é recusa, é dúvida — re-pergunta em vez de descartar.
const norm = (s: string) => (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
const SIM_TOKENS = new Set(['sim', 's', 'ss', 'si', 'quero', 'claro', 'pode', 'ok']);
const NAO_EXATAS = new Set(['nao', 'n', 'nao quero', 'agora nao']);

export function parseSimNao(texto: string): 'sim' | 'nao' | null {
  const bruto = texto ?? '';
  const t = norm(bruto).replace(/[!.?,;:()"'*]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t && !bruto.includes('👍')) return null;
  if (NAO_EXATAS.has(t)) return 'nao';
  // combinações só de palavras afirmativas ("sim quero", "pode sim", "ok claro") também valem
  const palavras = t ? t.split(' ') : [];
  if (palavras.length > 0 && palavras.every((p) => SIM_TOKENS.has(p))) return 'sim';
  if (bruto.includes('👍')) return 'sim';   // 👍 (com ou sem tom de pele — o emoji base sobrevive)
  return null;
}

// ---- NOME: ≥2 palavras (com ≥2 letras cada), sem dígitos ----
export function validarNomeVideo(txt: string): boolean {
  const t = (txt ?? '').trim();
  if (!t || /\d/.test(t)) return false;
  const palavras = t.split(/\s+/).filter((p) => /\p{L}{2,}/u.test(p));
  return palavras.length >= 2;
}

// ---- CPF: extrai a PRIMEIRA sequência de 11 dígitos da mensagem (aceita pontuação, espaços e
//      texto em volta) e valida o dígito verificador (validarCpfDigits, o mesmo do fluxo.ts). ----
export function extrairCpfDeTexto(texto: string): { valido: boolean; digits: string; mascarado: string } {
  const t = texto ?? '';
  // 1) mensagem cujos dígitos TOTAIS já são 11 (cobre separador incomum, ex.: "529,982,247-25")
  const todos = t.replace(/\D/g, '');
  if (todos.length === 11) {
    const valido = validarCpfDigits(todos);
    return { valido, digits: todos, mascarado: valido ? mascararCpf(todos) : '—' };
  }
  // 2) primeira RUN de dígitos (tolerando ./espaço/-) que normalize para exatamente 11
  for (const run of t.match(/\d[\d .\/-]*\d|\d/g) ?? []) {
    const digits = run.replace(/\D/g, '');
    if (digits.length === 11) {
      const valido = validarCpfDigits(digits);
      return { valido, digits, mascarado: valido ? mascararCpf(digits) : '—' };
    }
  }
  return { valido: false, digits: '', mascarado: '—' };
}

/** Ações de efeito colateral que o bot-runner executa (o motor só decide). */
export interface AcoesVideo {
  salvarNome?: string;                                     // bot_coletar_nome (respeita nome_fonte)
  salvarCpf?: { digits: string; mascarado: string };       // bot_registrar_cpf
  /** NÃO na pergunta: etiqueta remarketing-bot (contato+conversa) + estado concluído motivo recusou. */
  registrarRecusa?: boolean;
  /** SIM depois da recusa: limpa a conclusão anterior (reentrou no funil). */
  limparRecusa?: boolean;
  /** CPF válido: agenda os 3 balões de 'resultado' na fila (+8 min, status agendada). */
  agendarResultado?: boolean;
  /** 2ª falha: pausa o bot + conversas.precisa_humano com este motivo. */
  escalarHumano?: 'bot_nao_entendeu' | 'cpf_invalido';
}

export type ResultadoVideo =
  | { acao: 'enviar'; telas: TelaVideo[]; passoNovo: string; tentativas: number; desvios: number; acoes?: AcoesVideo }
  | { acao: 'nada'; motivo: string };

const T = (corpo: string): TelaVideo => ({ tipo: 'texto', corpo });

/** Balões da abertura: texto(s) + vídeo (se houver URL) + pergunta SIM/NÃO no MESMO burst. */
function telasAbertura(copy: CopyVideo): TelaVideo[] {
  return [
    ...copy.abertura.map(T),
    ...(copy.video_url ? [{ tipo: 'video', url: copy.video_url, caption: copy.video_caption } as TelaVideo] : []),
    ...copy.pergunta_analise.map(T),
  ];
}

/** Motor puro. `tentativas` = contador do passo atual (zera ao trocar de passo); `desvios` =
 *  contador GLOBAL de áudio/mídia fora do trilho (2 → humano, em qualquer etapa ativa). */
export function proximoPassoVideo(
  passoAtual: string | null,
  entrada: EntradaVideo,
  tentativas: number,
  desvios: number,
  dados: Record<string, unknown> = {},
  copy: CopyVideo = DEFAULT_COPY_VIDEO,
): ResultadoVideo {
  const primeiro = primeiroNome(String(dados.nome_completo ?? '')) || 'tudo bem';
  // replace com /g (não replaceAll): o tsc do repo mira ES2020 e este arquivo entra no escopo dele via os testes
  const interp = (s: string) => s.replace(/\{primeiro_nome\}/g, primeiro);

  // início: abertura completa (texto + vídeo + pergunta), qualquer que seja a 1ª mensagem.
  if (!passoAtual || passoAtual === 'inicio') {
    return { acao: 'enviar', telas: telasAbertura(copy), passoNovo: 'aguardando_sim_nao', tentativas: 0, desvios };
  }

  // fluxo já encerrado pelo worker; nada a fazer.
  if (passoAtual === 'fim') return { acao: 'nada', motivo: 'fluxo_encerrado' };

  // aguardando o RESULTADO diferido: fica quieto (o worker entrega em ~8 min; o atendente
  // é acionado na sequência — responder aqui atropelaria a entrega).
  if (passoAtual === 'aguardando_resultado') return { acao: 'nada', motivo: 'aguardando_resultado' };

  // recusou antes: SÓ um SIM reengata (reentra em pede_nome); o resto fica em silêncio
  // (a recusa já foi respondida com "se mudar de ideia, mande um SIM").
  if (passoAtual === 'recusado') {
    if (!entrada.ehAudio && parseSimNao(entrada.texto) === 'sim') {
      return {
        acao: 'enviar', telas: [T(copy.pede_nome)], passoNovo: 'aguardando_nome', tentativas: 0, desvios,
        acoes: { limparRecusa: true },
      };
    }
    return { acao: 'nada', motivo: 'recusado_aguardando_sim' };
  }

  // ÁUDIO/MÍDIA em qualquer etapa ativa: pede texto e conta o desvio; no 2º, escala pra humano.
  if (entrada.ehAudio) {
    const n = desvios + 1;
    if (n >= 2) {
      return {
        acao: 'enviar', telas: [T(copy.handoff_humano)], passoNovo: passoAtual, tentativas, desvios: n,
        acoes: { escalarHumano: 'bot_nao_entendeu' },
      };
    }
    return { acao: 'enviar', telas: [T(copy.audio_desvio)], passoNovo: passoAtual, tentativas, desvios: n };
  }

  if (passoAtual === 'aguardando_sim_nao') {
    const r = parseSimNao(entrada.texto);
    if (r === 'sim') return { acao: 'enviar', telas: [T(copy.pede_nome)], passoNovo: 'aguardando_nome', tentativas: 0, desvios };
    if (r === 'nao') {
      return {
        acao: 'enviar', telas: [T(copy.recusa)], passoNovo: 'recusado', tentativas: 0, desvios,
        acoes: { registrarRecusa: true },
      };
    }
    const n = tentativas + 1;
    if (n < 2) return { acao: 'enviar', telas: [T(copy.reprompt_sim_nao)], passoNovo: 'aguardando_sim_nao', tentativas: n, desvios };
    return {
      acao: 'enviar', telas: [T(copy.handoff_humano)], passoNovo: 'aguardando_sim_nao', tentativas: n, desvios,
      acoes: { escalarHumano: 'bot_nao_entendeu' },
    };
  }

  if (passoAtual === 'aguardando_nome') {
    const nome = entrada.texto.trim();
    if (validarNomeVideo(nome)) {
      return {
        acao: 'enviar', telas: copy.pede_cpf.map(T), passoNovo: 'aguardando_cpf', tentativas: 0, desvios,
        acoes: { salvarNome: nome },
      };
    }
    const n = tentativas + 1;
    if (n < 2) return { acao: 'enviar', telas: [T(copy.reprompt_nome)], passoNovo: 'aguardando_nome', tentativas: n, desvios };
    return {
      acao: 'enviar', telas: [T(copy.handoff_humano)], passoNovo: 'aguardando_nome', tentativas: n, desvios,
      acoes: { escalarHumano: 'bot_nao_entendeu' },
    };
  }

  if (passoAtual === 'aguardando_cpf') {
    const cpf = extrairCpfDeTexto(entrada.texto);
    if (cpf.valido) {
      return {
        acao: 'enviar', telas: [T(interp(copy.ack_cpf))], passoNovo: 'aguardando_resultado', tentativas: 0, desvios,
        acoes: { salvarCpf: { digits: cpf.digits, mascarado: cpf.mascarado }, agendarResultado: true },
      };
    }
    const n = tentativas + 1;
    if (n < 2) return { acao: 'enviar', telas: [T(copy.reprompt_cpf)], passoNovo: 'aguardando_cpf', tentativas: n, desvios };
    return {
      acao: 'enviar', telas: [T(copy.handoff_humano)], passoNovo: 'aguardando_cpf', tentativas: n, desvios,
      acoes: { escalarHumano: 'cpf_invalido' },
    };
  }

  return { acao: 'nada', motivo: `passo_desconhecido:${passoAtual}` };
}

/** Balões do RESULTADO já interpolados — é o TEXTO FINAL que vai pra fila (o worker não
 *  interpola; o nome já é conhecido no agendamento). */
export function mensagensResultado(copy: CopyVideo, nomeCompleto: string): string[] {
  const primeiro = primeiroNome(nomeCompleto ?? '') || 'tudo bem';
  return copy.resultado.map((s) => s.replace(/\{primeiro_nome\}/g, primeiro));
}
