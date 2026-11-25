// IA COM A CHAVE DA PRÓPRIA EMPRESA — peças PURAS (sem banco e sem rede) da função atd-ia (25/11):
// montar o texto da conversa para o resumo (com teto), esconder senhas antes de mandar ao provedor, ler a resposta
// do resumo e conferir o jeito da chave. Testadas em iaPropria_test.ts (deno test).

export type Provedor = 'gemini' | 'openai';
export const PROVEDORES: Provedor[] = ['gemini', 'openai'];

/** tetos do resumo: as últimas 200 mensagens, no máximo ~12 mil caracteres (as mais novas ficam) */
export const MAX_MENSAGENS_RESUMO = 200;
export const MAX_CARACTERES_RESUMO = 12_000;
/** tetos do áudio */
export const MAX_BYTES_AUDIO = 10 * 1024 * 1024;
export const MAX_SEGUNDOS_AUDIO = 5 * 60;

/** confere o JEITO da chave antes de gastar uma chamada (null = parece certa) */
export function conferirChave(provedor: string, chave: string): string | null {
  if (!PROVEDORES.includes(provedor as Provedor)) return 'provedor_invalido';
  const c = chave.trim();
  if (c.length < 20 || c.length > 400 || /\s/.test(c)) return 'formato_chave';
  if (provedor === 'gemini' && /^sk-/.test(c)) return 'parece_openai';
  if (provedor === 'openai' && /^AIza/.test(c)) return 'parece_gemini';
  return null;
}
/** os 4 últimos caracteres: é só o que a tela vê da chave */
export const finalDaChave = (chave: string) => chave.trim().slice(-4);

/** tira a chave de qualquer texto (erro do provedor, por exemplo) antes de ele sair da função */
export const semChave = (s: string, chave: string) => (chave ? s.split(chave).join('•••') : s).replace(/key=[^&\s"']+/g, 'key=•••').replace(/Bearer\s+\S+/g, 'Bearer •••');

/** senha e código que o cliente escreveu não vão para o provedor de IA: "a senha do meu INSS é X" → "… é [oculta]" */
export function ocultarSegredos(texto: string): string {
  return texto
    .replace(/\b((?:senha|password|c[oó]digo(?: de (?:verifica[cç][aã]o|seguran[cç]a|acesso))?|token|pin)\b[^\n:=]{0,40}?(?:\s(?:[ée]|eh|era|fica|ficou)\s|:|=)\s*)(\S+)/gi, '$1[oculta]')
    .replace(/\b(\d{4})[ .-]?(\d{4})[ .-]?(\d{4})[ .-]?(\d{4})\b/g, '[cartão oculto]');
}

export interface MsgResumo { direcao: 'entrada' | 'saida'; tipo: string; conteudo: string | null; origem: string | null; enviada_em: string; transcricao?: string | null; nome?: string | null }

const quando = (iso: string) => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(d).replace(',', '');
};
/** uma linha por mensagem, em ordem: "[24/11 14:31] Cliente: texto" */
export function linhaDaMensagem(m: MsgResumo): string | null {
  if (m.tipo === 'sistema' || m.tipo === 'nota_interna') return null;
  const quem = m.direcao === 'entrada' ? 'Cliente' : m.origem === 'bot' ? 'IA' : 'Equipe';
  const txt = (m.conteudo ?? '').replace(/\s+/g, ' ').trim();
  let corpo = '';
  if (m.tipo === 'audio') corpo = m.transcricao?.trim() ? `(áudio) ${m.transcricao.replace(/\s+/g, ' ').trim()}` : '[mandou um áudio sem transcrição]';
  else if (m.tipo === 'imagem') corpo = `[mandou uma foto${m.nome ? `: ${m.nome}` : ''}]${txt ? ' ' + txt : ''}`;
  else if (m.tipo === 'video') corpo = `[mandou um vídeo]${txt ? ' ' + txt : ''}`;
  else if (m.tipo === 'documento') corpo = `[mandou o documento: ${m.nome || 'sem nome'}]${txt ? ' ' + txt : ''}`;
  else corpo = txt;
  if (!corpo) return null;
  return `[${quando(m.enviada_em)}] ${quem}: ${ocultarSegredos(corpo)}`;
}
/** a conversa em texto, das mais antigas para as mais novas, com o teto de caracteres (cortando as MAIS ANTIGAS) */
export function montarTextoConversa(msgs: MsgResumo[], teto = MAX_CARACTERES_RESUMO): { texto: string; usadas: number; cortou: boolean } {
  const ordem = [...msgs].sort((a, b) => Date.parse(a.enviada_em) - Date.parse(b.enviada_em));
  const linhas = ordem.map(linhaDaMensagem).filter((l): l is string => !!l).map((l) => (l.length > 1500 ? l.slice(0, 1500) + '…' : l));
  const out: string[] = [];
  let total = 0;
  for (let i = linhas.length - 1; i >= 0; i--) {
    if (total + linhas[i].length + 1 > teto) break;
    out.unshift(linhas[i]); total += linhas[i].length + 1;
  }
  return { texto: out.join('\n'), usadas: out.length, cortou: out.length < linhas.length };
}

export const INSTRUCOES_RESUMO = `Você ajuda a equipe de atendimento de uma empresa a entender rápido uma conversa de WhatsApp com um cliente.
Leia a conversa e devolva um resumo CURTO, em português do Brasil simples, para a pessoa da equipe que vai continuar o atendimento.
Campos:
- quer: o que o cliente quer ou precisa, em uma frase.
- documentos_recebidos: os documentos que o cliente já mandou, com nomes curtos (ex.: "RG", "Extrato do INSS", "Comprovante de residência"). Lista vazia se nenhum.
- documentos_faltando: os documentos que a equipe pediu e o cliente ainda não mandou. Lista vazia se nenhum ou se não dá para saber.
- proximo_passo: o que a equipe deve fazer agora, em uma frase.
- humor: como o cliente está (ex.: tranquilo, com pressa, desconfiado, irritado, confuso), em poucas palavras.
Regras: use só o que está na conversa; não invente valores, prazos, nomes nem documentos. Nunca escreva senhas, códigos, números de documento, de cartão ou de conta: no máximo diga que o cliente mandou. Sem emojis. Frases curtas.`;

export const ESQUEMA_RESUMO_GEMINI = {
  type: 'OBJECT',
  properties: {
    quer: { type: 'STRING' },
    documentos_recebidos: { type: 'ARRAY', items: { type: 'STRING' } },
    documentos_faltando: { type: 'ARRAY', items: { type: 'STRING' } },
    proximo_passo: { type: 'STRING' },
    humor: { type: 'STRING' },
  },
  required: ['quer', 'documentos_recebidos', 'documentos_faltando', 'proximo_passo', 'humor'],
};

export interface Resumo { quer: string; documentos_recebidos: string[]; documentos_faltando: string[]; proximo_passo: string; humor: string }
const frase = (v: unknown, teto: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, teto) : '');
const lista = (v: unknown) => (Array.isArray(v) ? v.map((x) => frase(x, 80)).filter(Boolean).slice(0, 10) : []);
/** a resposta da IA (texto JSON, às vezes dentro de ```json) → o resumo com tetos; null se não der para ler */
export function lerResumo(texto: string): Resumo | null {
  const limpo = texto.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  let j: Record<string, unknown>;
  try { j = JSON.parse(limpo); } catch { return null; }
  if (!j || typeof j !== 'object' || Array.isArray(j)) return null;
  const r: Resumo = {
    quer: frase(j.quer, 400), documentos_recebidos: lista(j.documentos_recebidos), documentos_faltando: lista(j.documentos_faltando),
    proximo_passo: frase(j.proximo_passo, 400), humor: frase(j.humor, 160),
  };
  // a mesma proteção da entrada vale na saída
  r.quer = ocultarSegredos(r.quer); r.proximo_passo = ocultarSegredos(r.proximo_passo);
  return r.quer || r.proximo_passo ? r : null;
}

export const INSTRUCOES_TRANSCRICAO = 'Transcreva este áudio de WhatsApp em português do Brasil, exatamente como foi falado. Responda só com o texto falado: sem comentários, sem aspas, sem marcar quem fala e sem horário. Se não houver fala, responda apenas: [sem fala]';
/** o texto da transcrição limpo; '' quando não há fala */
export function lerTranscricao(texto: string): string {
  const t = texto.replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().replace(/^["“]|["”]$/g, '').trim();
  if (!t || /^\[?sem fala\]?\.?$/i.test(t)) return '';
  return t.slice(0, 4000);
}

/** o mime do áudio do WhatsApp para o provedor ("audio/ogg; codecs=opus" → "audio/ogg") */
export function mimeDoAudio(mime: string | null | undefined, caminho: string): string {
  const m = String(mime ?? '').split(';')[0].trim().toLowerCase();
  if (m === 'audio/mpeg' || m === 'audio/mp3') return 'audio/mp3';
  if (m === 'audio/x-m4a' || m === 'audio/m4a') return 'audio/mp4';
  if (m.startsWith('audio/')) return m;
  const ext = caminho.split('.').pop()?.toLowerCase() ?? '';
  return ({ ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg', mp3: 'audio/mp3', m4a: 'audio/mp4', mp4: 'audio/mp4', aac: 'audio/aac', wav: 'audio/wav', webm: 'audio/webm', flac: 'audio/flac' } as Record<string, string>)[ext] ?? 'audio/ogg';
}
export const extensaoDoMime = (mime: string) => ({ 'audio/ogg': 'ogg', 'audio/mp3': 'mp3', 'audio/mp4': 'm4a', 'audio/aac': 'aac', 'audio/wav': 'wav', 'audio/webm': 'webm', 'audio/flac': 'flac' } as Record<string, string>)[mime] ?? 'ogg';

/** bytes → base64 sem estourar a pilha (áudio de até 10 MB) */
export function paraBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** o erro HTTP do provedor → os códigos que a tela conhece (src/data/iaPropria.ts) */
export function codigoDoErro(status: number, mensagem: string): string {
  const m = mensagem.toLowerCase();
  if (status === 401 || /api key not valid|invalid api key|incorrect api key|api_key_invalid/.test(m)) return 'chave_invalida';
  if (status === 400 && /api key/.test(m)) return 'chave_invalida';
  if (status === 429 || /quota|insufficient_quota|billing|exceeded/.test(m)) return 'sem_credito_ou_limite';
  if (status === 403) return 'chave_sem_permissao';
  if (status === 404) return 'modelo_indisponivel';
  return 'provedor_indisponivel';
}
