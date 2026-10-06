// midia-melhorar-ia — "Melhorar com IA" no visualizador de imagem da conversa.
//
// Regra do dono (06/10/2026): qualquer atendente usa, UMA vez por cliente; a correção tem que ser a
// mais certeira possível. Por isso:
//   · só o modelo de imagem PRO (no teste, o Flash trocou dígitos de CNH: 2034→2934);
//   · CONFERÊNCIA obrigatória: as duas imagens são lidas (OCR) por um modelo de texto e comparadas —
//     número diferente ou palavra nova = REPROVADA (não libera download); palavra que sumiu = aviso;
//   · reprovou → gera mais uma vez (máx. 2 gerações aprovadas/reprovadas); 503/NO_IMAGE → tenta de novo;
//   · a vaga do cliente só é gasta quando sai APROVADA (índice único em midia_melhoria_ia).
//
// Contrato: POST { mensagem_id } com o JWT do atendente → responde NA HORA com a linha
// (status 'processando' | 'aprovada' existente) e processa em segundo plano (EdgeRuntime.waitUntil);
// a tela acompanha lendo midia_melhoria_ia (RLS de leitura por org).
import { encodeBase64, decodeBase64 } from 'jsr:@std/encoding@1/base64';
import { corsHeaders, json } from './cors.ts';
import { adminClient, getUser } from './client.ts';

const BUCKET = 'script-midia';
const API = 'https://generativelanguage.googleapis.com/v1beta';
const MODELO_IMAGEM = Deno.env.get('GEMINI_MODEL_IMAGEM') || 'gemini-3-pro-image';
const MODELO_OCR = Deno.env.get('GEMINI_MODEL_OCR') || 'gemini-3.1-pro-preview';
const PAPEIS = ['admin', 'supervisor', 'atendente'];
const PRAZO_MS = 330_000;          // teto do trabalho em 2º plano (limite da plataforma: 400 s)
const MAX_GERACOES_CONFERIDAS = 2; // reprovou 1x → mais uma geração
const PROCESSANDO_VELHO_MS = 10 * 60_000;

const PROMPT_RESTAURAR = `Você é um restaurador de digitalização de documentos. Recebe a FOTO de um documento brasileiro tirada com celular e comprimida pelo WhatsApp.
Devolva a MESMA imagem restaurada, como se tivesse sido digitalizada num scanner de boa qualidade:
- remova desfoque, granulação, artefatos de compressão JPEG, reflexo e sombra;
- deixe textos, números e linhas nítidos e com contraste;
- mantenha EXATAMENTE as cores originais do documento (fundos de segurança, brasões, hologramas, carimbos, assinaturas a caneta);
- mantenha o mesmo enquadramento, a mesma orientação e o mesmo layout — não recorte, não gire, não reorganize.
REGRA ABSOLUTA: não altere, não invente e não "corrija" NENHUM caractere. Cada letra, dígito, data e número deve ser idêntico ao original. Se um trecho estiver ilegível, deixe-o como está (borrado) — nunca adivinhe o conteúdo. Não adicione nenhum texto, marca ou elemento.`;

const PROMPT_OCR = `Transcreva TODO texto legível desta imagem de documento, na ordem de leitura, exatamente como aparece (sem corrigir nada).
Responda em JSON: {"linhas": ["...", "..."]}. Se um trecho estiver ilegível, escreva [ilegível] naquele ponto.`;

class ErroTransitorio extends Error {}

async function gemini(modelo: string, body: unknown) {
  const key = Deno.env.get('GEMINI_API_KEY');
  if (!key) throw new Error('GEMINI_API_KEY ausente');
  const r = await fetch(`${API}/models/${modelo}:generateContent`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(body),
  });
  const t = await r.text();
  if (r.status === 503 || r.status === 500 || r.status === 429 && !/credit|prepayment|depleted/i.test(t)) throw new ErroTransitorio(`${modelo} HTTP ${r.status}`);
  if (r.status === 429) throw new Error('Crédito do Gemini esgotado — recarregar no Google AI Studio.');
  if (!r.ok) throw new Error(`${modelo} HTTP ${r.status}: ${t.slice(0, 200)}`);
  return JSON.parse(t);
}

async function gerar(mime: string, b64: string) {
  const out = await gemini(MODELO_IMAGEM, {
    contents: [{ parts: [{ inline_data: { mime_type: mime, data: b64 } }, { text: PROMPT_RESTAURAR }] }],
    generationConfig: { responseModalities: ['IMAGE'], imageConfig: { imageSize: '2K' } },
  });
  const parte = out?.candidates?.[0]?.content?.parts?.find((p: { inlineData?: { data: string } }) => p.inlineData?.data);
  if (!parte) throw new ErroTransitorio(`sem imagem (${out?.candidates?.[0]?.finishReason ?? '?'})`); // NO_IMAGE costuma passar na nova tentativa
  return { mime: (parte.inlineData.mimeType as string) || 'image/png', b64: parte.inlineData.data as string, uso: out.usageMetadata ?? null };
}

async function ocr(mime: string, b64: string): Promise<string[]> {
  for (let t = 0; ; t++) {
    try {
      const out = await gemini(MODELO_OCR, {
        contents: [{ parts: [{ inline_data: { mime_type: mime, data: b64 } }, { text: PROMPT_OCR }] }],
        generationConfig: { temperature: 0, responseMimeType: 'application/json' },
      });
      const txt = out?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ?? '';
      return (JSON.parse(txt).linhas ?? []).map(String);
    } catch (e) {
      if (!(e instanceof ErroTransitorio) || t >= 2) throw e;
      await new Promise((r) => setTimeout(r, 8000));
    }
  }
}

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
function numeros(linhas: string[]) {
  const out: string[] = [];
  for (const l of linhas) for (const m of l.matchAll(/\d[\d.\-\/ ]*\d/g)) { const d = m[0].replace(/\D/g, ''); if (d.length >= 3) out.push(d); }
  return out;
}
function palavras(linhas: string[]) {
  const out: string[] = [];
  for (const l of linhas) for (const m of semAcento(l).matchAll(/[A-Z]{4,}/g)) out.push(m[0]);
  return out;
}
function sobra(a: string[], b: string[]) {
  const cont = new Map<string, number>();
  for (const x of b) cont.set(x, (cont.get(x) ?? 0) + 1);
  const out: string[] = [];
  for (const x of a) { const n = cont.get(x) ?? 0; if (n > 0) cont.set(x, n - 1); else out.push(x); }
  return out;
}
export function conferir(orig: string[], ia: string[]) {
  const nO = numeros(orig), nI = numeros(ia), pO = palavras(orig), pI = palavras(ia);
  const div = {
    numeros: { soNoOriginal: sobra(nO, nI), soNaMelhorada: sobra(nI, nO) },
    palavrasNovas: sobra(pI, pO),
    palavrasSumidas: sobra(pO, pI),
  };
  const aprovada = div.numeros.soNoOriginal.length === 0 && div.numeros.soNaMelhorada.length === 0 && div.palavrasNovas.length === 0;
  return { aprovada, div };
}

async function processar(id: string, org: string, pathOriginal: string, mensagemId: string) {
  const admin = adminClient();
  const t0 = Date.now();
  const marcar = (campos: Record<string, unknown>) => admin.from('midia_melhoria_ia').update({ ...campos, atualizado_em: new Date().toISOString() }).eq('id', id);
  let tentativas = 0;
  let ultimaDiv: unknown = null;
  const usos: unknown[] = [];
  try {
    const dl = await admin.storage.from(BUCKET).download(pathOriginal);
    if (dl.error || !dl.data) throw new Error('não foi possível abrir a imagem original');
    const mime = dl.data.type || 'image/jpeg';
    const b64 = encodeBase64(new Uint8Array(await dl.data.arrayBuffer()));
    const ocrOriginal = ocr(mime, b64);           // em paralelo com a 1ª geração
    let conferidas = 0;
    while (conferidas < MAX_GERACOES_CONFERIDAS && Date.now() - t0 < PRAZO_MS - 90_000) {
      tentativas++;
      let g;
      try { g = await gerar(mime, b64); }
      catch (e) {
        if (e instanceof ErroTransitorio) { await new Promise((r) => setTimeout(r, 15_000)); continue; }
        throw e;
      }
      usos.push(g.uso);
      const [linhasO, linhasI] = await Promise.all([ocrOriginal, ocr(g.mime, g.b64)]);
      conferidas++;
      const { aprovada, div } = conferir(linhasO, linhasI);
      ultimaDiv = div;
      if (!aprovada) continue;
      const destino = `${org}/wa-midia-ia/${mensagemId}.${g.mime.includes('png') ? 'png' : 'jpg'}`;
      const up = await admin.storage.from(BUCKET).upload(destino, decodeBase64(g.b64), { contentType: g.mime, upsert: true });
      if (up.error) throw new Error('falha ao guardar a imagem melhorada');
      await marcar({ status: 'aprovada', anexo_path_ia: destino, modelo: MODELO_IMAGEM, tentativas, divergencias: div, uso: usos });
      return;
    }
    // não aprovou: libera a vaga do cliente (reprovada/falha não contam)
    await marcar(conferidas > 0
      ? { status: 'reprovada', modelo: MODELO_IMAGEM, tentativas, divergencias: ultimaDiv, uso: usos, erro: 'A IA alterou textos/números — versão bloqueada.' }
      : { status: 'falha', modelo: MODELO_IMAGEM, tentativas, uso: usos, erro: 'O Google está sobrecarregado agora. Tente de novo em alguns minutos.' });
  } catch (e) {
    await marcar({ status: 'falha', tentativas, uso: usos, erro: String((e as Error)?.message ?? e).slice(0, 300) });
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);
  try {
    const user = await getUser(req);
    if (!user) return json({ error: 'Sessão expirada. Entre de novo.' }, 401);
    const { mensagem_id } = await req.json().catch(() => ({}));
    if (typeof mensagem_id !== 'string' || !/^[0-9a-f-]{36}$/i.test(mensagem_id)) return json({ error: 'Mensagem inválida.' }, 400);

    const admin = adminClient();
    const { data: msg } = await admin.from('mensagens').select('id, organizacao_id, conversa_id, tipo, metadados').eq('id', mensagem_id).maybeSingle();
    if (!msg) return json({ error: 'Mensagem não encontrada.' }, 404);
    const org = msg.organizacao_id as string;
    const { data: mem } = await admin.from('organizacao_usuarios').select('papel, status').eq('organizacao_id', org).eq('usuario_id', user.id).maybeSingle();
    if (!mem || mem.status !== 'ativo' || !PAPEIS.includes(mem.papel as string)) return json({ error: 'Sem permissão nesta organização.' }, 403);
    const path = (msg.metadados as Record<string, unknown> | null)?.anexo_path as string | undefined;
    if (msg.tipo !== 'imagem' || !path) return json({ error: 'Esta mensagem não tem imagem.' }, 409);
    const { data: conv } = await admin.from('conversas').select('contato_id').eq('id', msg.conversa_id).maybeSingle();
    const contatoId = conv?.contato_id as string | undefined;
    if (!contatoId) return json({ error: 'Conversa sem cliente vinculado.' }, 409);

    // vaga do cliente: aprovada → devolve (mesma imagem = reabre sem custo; outra imagem = já usada)
    await admin.from('midia_melhoria_ia').delete().eq('contato_id', contatoId).eq('status', 'processando')
      .lt('atualizado_em', new Date(Date.now() - PROCESSANDO_VELHO_MS).toISOString());
    const { data: ocupada } = await admin.from('midia_melhoria_ia').select('*').eq('contato_id', contatoId).in('status', ['processando', 'aprovada']).maybeSingle();
    if (ocupada) {
      if (ocupada.mensagem_id === mensagem_id) return json({ registro: ocupada });
      return json({ error: 'A melhoria com IA deste cliente já foi usada em outra imagem.', registro: ocupada }, 409);
    }
    const { data: novo, error: eIns } = await admin.from('midia_melhoria_ia').insert({
      organizacao_id: org, contato_id: contatoId, mensagem_id, anexo_path_original: path, status: 'processando', criado_por: user.id,
    }).select('*').single();
    if (eIns || !novo) return json({ error: 'Outra melhoria deste cliente começou agora. Atualize a tela.' }, 409); // índice único

    // @ts-ignore EdgeRuntime existe no runtime do Supabase
    EdgeRuntime.waitUntil(processar(novo.id as string, org, path, mensagem_id));
    return json({ registro: novo }, 202);
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e).slice(0, 300) }, 500);
  }
});
