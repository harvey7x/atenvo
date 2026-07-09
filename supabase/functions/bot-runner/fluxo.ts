// Lógica PURA do fluxo do bot (sem Deno/Node/DB) — compartilhada entre a edge bot-runner
// e os testes unitários (vitest importa este mesmo arquivo). Não tem efeitos colaterais.

export type Etapa =
  | 'inicio' | 'aguardando_beneficio' | 'aguardando_agibank_bmg' | 'aguardando_banco'
  | 'aguardando_nome' | 'aguardando_cpf' | 'aguardando_preferencia' | 'concluido';

export interface Copy {
  abertura: string[]; apos_beneficio: string[]; apos_agibank_bmg: string[]; apos_banco: string[];
  apos_nome: string[]; apos_cpf: string[]; fechamento: string[];
  reprompt: { nome: string; cpf: string; generico: string }; audio: string;
}

export const DEFAULT_COPY: Copy = {
  abertura: [
    'Oi, tudo bem? Vi que você pediu atendimento sobre descontos no benefício.',
    'Vou ser bem direto pra não te enrolar.',
    'Quando existe desconto irregular, cartão consignado, RMC/RCC ou juros abusivos, muitas vezes dá para analisar o cancelamento e verificar se existem valores a liberar.',
    'Pra te encaminhar certo, vou fazer uma triagem rápida.',
    'Você é aposentado, pensionista ou recebe algum benefício do INSS?',
  ],
  apos_beneficio: [
    'Entendi.',
    'Você lembra se tem algum desconto ou empréstimo ligado à Agibank ou BMG?',
    "Pode responder do seu jeito: Agibank, BMG, os dois ou 'não sei'.",
  ],
  apos_agibank_bmg: [
    'E qual banco você recebe o benefício hoje?',
    'Exemplo: Caixa, Bradesco, Itaú, Santander, Mercantil, Agibank ou outro.',
  ],
  apos_banco: ['Certo. Pra deixar seu atendimento separado aqui, me diga seu nome completo.'],
  apos_nome: [
    'Obrigado, {primeiro_nome}.',
    'Agora me envie seu CPF para o especialista localizar sua análise sem confundir com outro atendimento.',
    'Pode mandar só os números.',
  ],
  apos_cpf: [
    'Pelo que você me passou, vale a pena um especialista olhar isso com prioridade.',
    'Você prefere continuar por mensagem ou pode receber uma ligação rápida?',
    'Se puder ligação, qual melhor horário?',
  ],
  fechamento: ['Perfeito, já vou te encaminhar para um especialista.'],
  reprompt: {
    nome: 'Só pra confirmar, pode me mandar seu nome completo? (nome e sobrenome)',
    cpf: 'Esse CPF não parece completo. Pode mandar os 11 números?',
    generico: 'Pode me responder pra eu seguir com a sua triagem?',
  },
  audio: 'Recebi seu áudio. Para não atrasar sua análise, me manda essa informação por escrito, por favor. Assim eu já deixo tudo certo para o especialista verificar seu caso e te orientar ainda hoje.',
};

const norm = (s: string) => (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

export function primeiroNome(nome: string): string {
  return (nome ?? '').trim().split(/\s+/)[0] ?? '';
}

/** "parece nome": 2+ palavras, letras, sem dígitos, tamanho razoável, não é palavra-chave. */
export function validarNome(txt: string): boolean {
  const t = (txt ?? '').trim();
  if (t.length < 4 || t.length > 80) return false;
  if (/\d/.test(t)) return false;
  const palavras = t.split(/\s+/).filter((p) => /[A-Za-zÀ-ÿ]{2,}/.test(p));
  if (palavras.length < 2) return false;
  const proibidas = ['nao sei', 'sim', 'nao', 'agibank', 'bmg', 'os dois', 'caixa', 'bradesco'];
  if (proibidas.includes(norm(t))) return false;
  return true;
}

export function validarCpfDigits(d: string): boolean {
  if (!/^\d{11}$/.test(d)) return false;
  if (/^(\d)\1{10}$/.test(d)) return false; // todos iguais
  const calc = (base: string, pesoIni: number) => {
    let soma = 0;
    for (let i = 0; i < base.length; i++) soma += parseInt(base[i], 10) * (pesoIni - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  const dv1 = calc(d.slice(0, 9), 10);
  const dv2 = calc(d.slice(0, 10), 11);
  return dv1 === parseInt(d[9], 10) && dv2 === parseInt(d[10], 10);
}

export function mascararCpf(d: string): string {
  if (!/^\d{11}$/.test(d)) return '—';
  return `***.***.***-${d.slice(9, 11)}`;
}

export function extrairCpf(txt: string): { valido: boolean; digits: string; mascarado: string } {
  const digits = (txt ?? '').replace(/\D/g, '');
  const valido = validarCpfDigits(digits);
  return { valido, digits, mascarado: valido ? mascararCpf(digits) : '—' };
}

export function parseBeneficio(txt: string): string {
  const t = norm(txt);
  if (/aposent/.test(t)) return 'aposentadoria';
  if (/pension/.test(t)) return 'pensao';
  if (/bpc|loas/.test(t)) return 'bpc_loas';
  if (/inss|beneficio|sim/.test(t)) return 'inss';
  if (/\bnao\b|nenhum/.test(t)) return 'nao';
  return 'outro';
}

export function parseAgibankBmg(txt: string): string {
  const t = norm(txt);
  const ag = /agibank|agi\b/.test(t), bmg = /bmg/.test(t);
  if ((ag && bmg) || /os dois|ambos|dois/.test(t)) return 'ambos';
  if (ag) return 'agibank';
  if (bmg) return 'bmg';
  if (/nao sei|nao lembro|talvez/.test(t)) return 'nao_sei';
  if (/\bnao\b|nenhum/.test(t)) return 'nao';
  return 'outro';
}

const BANCOS = ['caixa', 'bradesco', 'itau', 'santander', 'mercantil', 'agibank', 'banco do brasil', 'bb', 'nubank', 'inter', 'pan', 'bmg'];
export function parseBanco(txt: string): string {
  const t = norm(txt);
  const achado = BANCOS.find((b) => t.includes(b));
  if (achado) return achado === 'bb' ? 'banco do brasil' : achado;
  return (txt ?? '').trim().slice(0, 40) || 'outro';
}

export function parsePreferencia(txt: string): { preferencia: 'mensagem' | 'ligacao' | 'indefinido'; horario: string | null } {
  const t = norm(txt);
  let pref: 'mensagem' | 'ligacao' | 'indefinido' = 'indefinido';
  if (/ligac|ligar|liga|telefone|chamada|call/.test(t)) pref = 'ligacao';
  else if (/mensagem|texto|whats|aqui mesmo|por aqui|escrever/.test(t)) pref = 'mensagem';
  const hm = (txt ?? '').match(/\b(\d{1,2})(?:[:h]\d{0,2})?\s*(?:h|horas?|da manha|da tarde|da noite)?\b/i);
  const horario = /manha|tarde|noite|\d/.test(t) ? (hm ? hm[0].trim() : (txt ?? '').trim().slice(0, 40)) : null;
  return { preferencia: pref, horario };
}

/** Delays (ms) por mensagem. delays[0]=0 (primeira imediata); demais aleatórios em [min,max]. */
export function calcularDelays(n: number, min: number, max: number, rng: () => number = Math.random): number[] {
  const lo = Math.min(min, max), hi = Math.max(min, max);
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(i === 0 ? 0 : Math.round(lo + rng() * (hi - lo)));
  return out;
}

export function avaliarLeadQuente(dados: Record<string, unknown>, inbound: string): string[] {
  const m = new Set<string>();
  const t = norm(inbound);
  if (dados.nome_completo && dados.cpf_mascarado) m.add('nome_e_cpf');
  const ag = dados.agibank_bmg as string | undefined;
  if (ag === 'agibank' || ag === 'ambos') m.add('citou_agibank');
  if (ag === 'bmg' || ag === 'ambos') m.add('citou_bmg');
  if (dados.preferencia === 'ligacao') m.add('quer_ligacao');
  if (/liberar|receber dinheiro|valor|restitu|quanto|dinheiro/.test(t)) m.add('perguntou_liberar');
  if (/agora|urgente|hoje|rapido|imediat/.test(t)) m.add('atendimento_imediato');
  return [...m];
}

export interface Decisao {
  needsInbound: boolean;
  valid: boolean;
  reprompt?: 'nome' | 'cpf' | 'generico';
  copyKey: keyof Copy | null;
  proximaEtapa: Etapa;
  dados: Record<string, unknown>;
  acoes: { coletarNome?: string; coletarCpf?: { digits: string; mascarado: string } };
  concluir: boolean;
  leadQuenteMotivos: string[];
}

/** Decide a resposta a partir da etapa atual e do texto recebido. Pura. */
export function decideProximo(etapa: Etapa | 'inicio', inbound: string, dadosAtuais: Record<string, unknown> = {}): Decisao {
  const base: Decisao = {
    needsInbound: true, valid: true, copyKey: null, proximaEtapa: etapa as Etapa,
    dados: {}, acoes: {}, concluir: false, leadQuenteMotivos: [],
  };
  switch (etapa) {
    case 'inicio':
      return { ...base, needsInbound: false, copyKey: 'abertura', proximaEtapa: 'aguardando_beneficio' };
    case 'aguardando_beneficio': {
      const beneficio = parseBeneficio(inbound);
      return { ...base, dados: { beneficio }, copyKey: 'apos_beneficio', proximaEtapa: 'aguardando_agibank_bmg' };
    }
    case 'aguardando_agibank_bmg': {
      const agibank_bmg = parseAgibankBmg(inbound);
      return {
        ...base, dados: { agibank_bmg }, copyKey: 'apos_agibank_bmg', proximaEtapa: 'aguardando_banco',
        leadQuenteMotivos: avaliarLeadQuente({ ...dadosAtuais, agibank_bmg }, inbound),
      };
    }
    case 'aguardando_banco': {
      const banco = parseBanco(inbound);
      return { ...base, dados: { banco }, copyKey: 'apos_banco', proximaEtapa: 'aguardando_nome' };
    }
    case 'aguardando_nome': {
      if (!validarNome(inbound)) return { ...base, valid: false, reprompt: 'nome', proximaEtapa: 'aguardando_nome' };
      return { ...base, acoes: { coletarNome: inbound.trim() }, copyKey: 'apos_nome', proximaEtapa: 'aguardando_cpf' };
    }
    case 'aguardando_cpf': {
      const cpf = extrairCpf(inbound);
      if (!cpf.valido) return { ...base, valid: false, reprompt: 'cpf', proximaEtapa: 'aguardando_cpf' };
      return {
        ...base, acoes: { coletarCpf: { digits: cpf.digits, mascarado: cpf.mascarado } },
        dados: { cpf_mascarado: cpf.mascarado }, copyKey: 'apos_cpf', proximaEtapa: 'aguardando_preferencia',
        leadQuenteMotivos: avaliarLeadQuente({ ...dadosAtuais, cpf_mascarado: cpf.mascarado }, inbound),
      };
    }
    case 'aguardando_preferencia': {
      const { preferencia, horario } = parsePreferencia(inbound);
      return {
        ...base, dados: { preferencia, horario }, copyKey: 'fechamento', proximaEtapa: 'concluido', concluir: true,
        leadQuenteMotivos: avaliarLeadQuente({ ...dadosAtuais, preferencia }, inbound),
      };
    }
    default:
      return { ...base, needsInbound: false, copyKey: null, proximaEtapa: 'concluido' };
  }
}

export interface ResumoParams {
  dados: Record<string, unknown>;
  canalNome: string; origem: string; etapa: string;
  leadQuente: boolean; leadQuenteMotivos: string[]; nomeContato?: string | null;
}

/** Monta o resumo (texto p/ nota_interna + json). CPF sempre mascarado. */
export function montarResumo(p: ResumoParams): { texto: string; json: Record<string, unknown> } {
  const d = p.dados || {};
  const nome = (d.nome_completo as string) || p.nomeContato || '—';
  const prioridade = p.leadQuente ? `ALTA — lead quente (${p.leadQuenteMotivos.join(', ') || 'critérios atingidos'})` : 'normal';
  const json = {
    nome, cpf_mascarado: (d.cpf_mascarado as string) || '—',
    beneficio_inss: (d.beneficio as string) || '—', agibank_bmg: (d.agibank_bmg as string) || '—',
    banco: (d.banco as string) || '—', preferencia: (d.preferencia as string) || '—',
    horario: (d.horario as string) || '—', prioridade, origem: p.origem, canal: p.canalNome, etapa: p.etapa,
  };
  const primeiro = primeiroNome(nome);
  const sugestao = p.leadQuente
    ? `Lead quente. Ligue/priorize agora. Abertura: "Oi, ${primeiro}. Acabei de receber suas informações. Pelo que você respondeu, vale a pena analisarmos esses descontos com atenção — consigo te orientar hoje sobre o cancelamento e verificar se há valores a liberar. Você consegue falar comigo agora?"`
    : `Retome sem reiniciar. Abertura: "Oi, ${primeiro}. Recebi suas informações aqui. Vale a pena analisarmos esses descontos com atenção. Você consegue falar comigo agora?"`;
  const texto =
    `📋 Resumo do bot (triagem inicial)\n` +
    `• Nome: ${json.nome}\n` +
    `• CPF: ${json.cpf_mascarado}\n` +
    `• Recebe benefício INSS: ${json.beneficio_inss}\n` +
    `• Agibank/BMG: ${json.agibank_bmg}\n` +
    `• Banco de recebimento: ${json.banco}\n` +
    `• Preferência: ${json.preferencia}\n` +
    `• Melhor horário: ${json.horario}\n` +
    `• Prioridade: ${json.prioridade}\n` +
    `• Origem/canal: ${json.origem} / ${json.canal}\n` +
    `• Etapa: ${json.etapa}\n\n` +
    `💡 Sugestão: ${sugestao}`;
  return { texto, json };
}
