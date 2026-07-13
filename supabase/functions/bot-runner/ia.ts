// Módulo de IA do bot: Gemini (barato, simples) + Claude (difícil), com retry e FALLBACK CRUZADO.
// Se um cair, o outro assume. Se ambos caírem, gerarResposta LANÇA → o index cai no copy determinístico.
// Sem dependências: só fetch nativo. Env lido DENTRO das funções (helpers puros ficam testáveis fora do Deno).

const GEMINI_MODEL = 'gemini-2.5-flash';
const CLAUDE_MODEL = 'claude-sonnet-4-6';

// deno-lint-ignore no-explicit-any
const env = (k: string): string => ((globalThis as any).Deno?.env?.get(k) ?? '');

export interface Msg { role: 'user' | 'assistant'; content: string }

// ---------- Gemini (chat) ----------
export async function chamarGemini(messages: Msg[], system: string): Promise<string> {
  const key = env('GEMINI_API_KEY');
  if (!key) throw new Error('gemini_sem_chave');
  const contents = messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents, generationConfig: { maxOutputTokens: 1000, temperature: 0.85 } }),
  });
  if (!res.ok) throw new Error(`gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const txt = (data?.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text).filter(Boolean).join('').trim();
  if (!txt) throw new Error('gemini_vazio');
  return txt;
}

// ---------- Claude (chat) ----------
export async function chamarClaude(messages: Msg[], system: string): Promise<string> {
  const key = env('ANTHROPIC_API_KEY');
  if (!key) throw new Error('claude_sem_chave');
  // Claude exige começar com 'user'
  const msgs = [...messages];
  while (msgs.length && msgs[0].role !== 'user') msgs.shift();
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: CLAUDE_MODEL, max_tokens: 1000, system, messages: msgs }),
  });
  if (!res.ok) throw new Error(`claude ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const txt = (data?.content ?? []).filter((p: { type: string }) => p.type === 'text').map((p: { text: string }) => p.text).join('\n').trim();
  if (!txt) throw new Error('claude_vazio');
  return txt;
}

// ---------- Retry: repete transitório, aborta permanente (p/ o fallback assumir) ----------
function erroRetryavel(e: unknown): boolean {
  const m = ((e as Error)?.message ?? '').toLowerCase();
  return /(429|500|502|503|504|timeout|fetch failed|network|econnreset|etimedout|socket|overloaded|unavailable)/.test(m);
}
export async function comRetry<T>(fn: () => Promise<T>, tentativas = 3, esperaBase = 700): Promise<T> {
  let ultimo: unknown;
  for (let i = 0; i < tentativas; i++) {
    try { return await fn(); }
    catch (e) {
      ultimo = e;
      if (i < tentativas - 1 && erroRetryavel(e)) { await new Promise((r) => setTimeout(r, esperaBase * (i + 1))); continue; }
      throw e; // permanente (400/401 sem crédito, chave inválida): aborta já
    }
  }
  throw ultimo;
}

// ---------- Roteador: mensagem simples (Gemini) ou difícil (Claude)? [puro] ----------
export function pareceDificil(texto: string, dados: Record<string, unknown> = {}, hist: { role: string }[] = []): boolean {
  const t = (texto ?? '').toLowerCase();
  // objeção / desconfiança / hesitação / pergunta de valor
  if (/(golpe|n[aã]o confio|desconfi|fraude|medo|receio|caro|n[aã]o sei se|por ?qu[eê]|como assim|advogad|process(o|ar)|reclama|den[uú]nci|cancelar|n[aã]o quero|garant|seguro|verdade|engan|mentira|confi[aá]vel|pensar|meu filho|minha filha|esposo|marido|preciso falar|quanto|receber|valor|restitu)/i.test(t)) return true;
  if (t.includes('?')) return true;                       // qualquer pergunta
  if ((texto ?? '').length > 140) return true;            // mensagem longa
  if (hist.filter((h) => h.role === 'user').length <= 1) return true; // abertura define o tom
  if (dados.cpf && dados.banco) return true;              // fase de fechamento
  return false;                                           // resto → Gemini
}

// ---------- Orquestra: primário → retry → fallback cruzado → (ambos caem) LANÇA ----------
export async function gerarResposta(p: { messages: Msg[]; system: string; dificil: boolean }): Promise<string> {
  const claudeAtivo = (env('CLAUDE_ATIVO') || 'sim').toLowerCase() === 'sim';
  const usarClaude = claudeAtivo && p.dificil;
  const primario = usarClaude ? chamarClaude : chamarGemini;
  const secundario = !claudeAtivo ? null : (usarClaude ? chamarGemini : chamarClaude);
  try {
    return await comRetry(() => primario(p.messages, p.system));
  } catch (e1) {
    if (!secundario) throw e1;
    return await comRetry(() => secundario(p.messages, p.system)); // se este também lançar, propaga → fallback determinístico
  }
}

// ---------- Transcrição de áudio (Gemini). Falha → null (mantém o comportamento atual: avisa+pausa) ----------
export async function transcreverAudio(base64: string, mime = 'audio/ogg'): Promise<string | null> {
  try {
    // backstop: base64 gigante não vai pro Gemini (custo/contexto). ~12M chars ≈ 9MB bytes — folga acima do
    // teto do webhook (8MB → ~10,7M chars) e MUITO abaixo do limite de 20MB do inline_data.
    if (!base64 || base64.length > 12_000_000) return null;
    const key = env('GEMINI_API_KEY');
    if (!key) return null;
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [
        { inline_data: { mime_type: mime, data: base64 } },
        { text: 'Transcreva este áudio em português do Brasil. Responda apenas com o texto falado, sem comentários.' },
      ] }] }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const txt = (data?.candidates?.[0]?.content?.parts ?? []).map((x: { text?: string }) => x.text).filter(Boolean).join(' ').trim();
    return txt || null;
  } catch { return null; }
}

// ---------- Parse do bloco <estado> (puro) ----------
export interface EstadoIA {
  interesse?: boolean | null; nome_completo?: string; genero?: string; cpf?: string; banco?: string;
  financeiras?: string[]; tem_emprestimo?: boolean | null; desfecho?: string; dia_horario?: string;
  quer_humano?: boolean; optout?: boolean; resumo?: string;
}
/** Separa o texto humano do bloco <estado>{...}</estado> e faz o parse do JSON. */
export function parseEstado(resposta: string): { texto: string; estado: EstadoIA | null } {
  const r = resposta ?? '';
  const m = r.match(/<estado>\s*([\s\S]*?)\s*<\/estado>/i);
  if (!m) return { texto: r.replace(/<estado>[\s\S]*/i, '').trim(), estado: null };
  const texto = r.slice(0, m.index).trim();
  let estado: EstadoIA | null = null;
  try { estado = JSON.parse(m[1]); } catch { estado = null; }
  return { texto: texto || r.replace(/<estado>[\s\S]*/i, '').trim(), estado };
}
