// atd-ia — INTELIGÊNCIA ARTIFICIAL COM A CHAVE DA PRÓPRIA EMPRESA no Atendimento (25/11). No sistema que a Reviza usava
// antes havia o "Resumo do atendimento" no painel do cliente, o "Transcrever" nos áudios e a "chave de IA própria" nas
// configurações (o custo passa a ser da empresa). A chave é SEMPRE a que a própria empresa criou na conta dela e colou
// em Configurações › Integrações; ela mora em atd_ia_chave (migration 100: só o servidor lê), nunca volta para a tela e
// nunca vai para o log.
//
// Ações (corpo { acao }):
//   disponivel     → { configurada, provedor }: liga ou desliga os botões de IA         qualquer pessoa da empresa
//   estado         → provedor, final (4 últimos), quem configurou e quando, último teste  administrador
//   salvar_chave   → { provedor, chave }: confere com uma chamada mínima ao provedor e guarda   administrador
//   testar         → confere de novo a chave guardada                                      administrador
//   remover_chave  → apaga a chave (resumos e transcrições já feitos ficam)                administrador
//   resumo         → { conversa_id }: o último resumo guardado, sem chamar a IA            quem vê a conversa
//   identificar_documentos → { conversa_id }: o que é cada foto/PDF que o cliente mandou (até 8 por vez; grava em metadados.doc_*)
//   sugerir        → { conversa_id, pedido? }: um rascunho de resposta para o atendente revisar (nada é enviado nem guardado)
//   resumir        → { conversa_id, refazer? }: as últimas 200 mensagens (até ~12 mil caracteres) → resumo curto
//   transcrever    → { mensagem_id }: o áudio do bucket script-midia (até 10 MB e 5 min) → metadados.transcricao
// "Quem vê a conversa" é decidido pelo BANCO: conversa e mensagem são lidas com o login de quem chamou (RLS), nunca com
// a chave de serviço; só depois disso a chave de serviço lê o resto. Deploy com verify_jwt (só a tela chama).
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { MODELO_PADRAO } from '../_shared/iris.ts';
import {
  codigoDoErro, conferirChave, ESQUEMA_RESUMO_GEMINI, extensaoDoMime, finalDaChave, INSTRUCOES_RESUMO, INSTRUCOES_TRANSCRICAO,
  lerResumo, lerTranscricao, MAX_BYTES_AUDIO, MAX_MENSAGENS_RESUMO, MAX_SEGUNDOS_AUDIO, mimeDoAudio, montarTextoConversa,
  type MsgResumo, paraBase64, type Provedor, type Resumo, semChave, INSTRUCOES_SUGESTAO, MAX_CARACTERES_SUGESTAO, lerSugestao, INSTRUCOES_COPILOTO, textoDaConfigIris, montarTextoScripts, ESQUEMA_DOC_GEMINI, INSTRUCOES_DOCUMENTO, MAX_BYTES_DOC, MAX_DOCS_POR_VEZ, lerDocumento, tipoPeloNome, type DocIdentificado,
} from '../_shared/iaPropria.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const GEMINI = 'https://generativelanguage.googleapis.com/v1beta';
const OPENAI = 'https://api.openai.com/v1';
// modelos: dá para trocar sem mexer no código (segredos da função); a chave continua sendo a da empresa
const MODELO_GEMINI = Deno.env.get('IA_GEMINI_MODELO') || MODELO_PADRAO;
const MODELOS_OPENAI = (Deno.env.get('IA_OPENAI_MODELO') || 'gpt-4.1-mini,gpt-4o-mini').split(',').map((s) => s.trim()).filter(Boolean);
const MODELOS_OPENAI_AUDIO = (Deno.env.get('IA_OPENAI_TRANSCRICAO') || 'gpt-4o-mini-transcribe,whisper-1').split(',').map((s) => s.trim()).filter(Boolean);

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });
const erro = (codigo: string, s = 400) => json({ erro: codigo }, s);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** erro com um código que a tela traduz (src/data/iaPropria.ts) */
class ErroIa extends Error { constructor(public codigo: string, public status = 400) { super(codigo); } }

/* ---------------- os provedores (a chave vai no cabeçalho, nunca na URL) ---------------- */
async function pedir(url: string, init: RequestInit, chave: string, tempo = 60_000): Promise<Record<string, unknown>> {
  let res: Response;
  try { res = await fetch(url, { ...init, signal: AbortSignal.timeout(tempo) }); }
  catch { throw new ErroIa('provedor_indisponivel', 502); }
  const corpo = await res.json().catch(() => ({})) as Record<string, unknown>;
  if (!res.ok) {
    const e = corpo.error as { message?: string; code?: string; status?: string } | undefined;
    const msg = semChave(`${e?.message ?? ''} ${e?.code ?? ''} ${e?.status ?? ''}`, chave);
    throw new ErroIa(codigoDoErro(res.status, msg), 400);
  }
  return corpo;
}
const cabGemini = (chave: string) => ({ 'x-goog-api-key': chave, 'content-type': 'application/json' });
const cabOpenai = (chave: string) => ({ Authorization: `Bearer ${chave}` });

/** a chamada mínima que prova que a chave funciona (listar 1 modelo: não gasta crédito) */
async function validar(provedor: Provedor, chave: string): Promise<void> {
  if (provedor === 'gemini') await pedir(`${GEMINI}/models?pageSize=1`, { headers: cabGemini(chave) }, chave, 20_000);
  else await pedir(`${OPENAI}/models`, { headers: cabOpenai(chave) }, chave, 20_000);
}

function textoGemini(corpo: Record<string, unknown>): string {
  const cand = (corpo.candidates as { content?: { parts?: { text?: string }[] } }[] | undefined)?.[0];
  return cand?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
}
/** tenta os modelos na ordem; passa para o próximo só quando o modelo não existe para esta chave */
async function comModelos<T>(modelos: string[], f: (m: string) => Promise<T>): Promise<T> {
  let ultimo: unknown = new ErroIa('modelo_indisponivel');
  for (const m of modelos) {
    try { return await f(m); }
    catch (e) { if (e instanceof ErroIa && e.codigo === 'modelo_indisponivel') { ultimo = e; continue; } throw e; }
  }
  throw ultimo;
}

async function gerarResumo(provedor: Provedor, chave: string, conversa: string): Promise<Resumo> {
  const pedido = `Conversa (horário de Brasília; "Cliente" é o cliente, "Equipe" é uma pessoa da empresa e "IA" é a atendente virtual):\n\n${conversa}`;
  let texto = '';
  if (provedor === 'gemini') {
    const r = await pedir(`${GEMINI}/models/${encodeURIComponent(MODELO_GEMINI)}:generateContent`, {
      method: 'POST', headers: cabGemini(chave),
      body: JSON.stringify({ systemInstruction: { parts: [{ text: INSTRUCOES_RESUMO }] }, contents: [{ role: 'user', parts: [{ text: pedido }] }],
        generationConfig: { responseMimeType: 'application/json', responseSchema: ESQUEMA_RESUMO_GEMINI, temperature: 0.2, maxOutputTokens: 2048 } }),
    }, chave, 90_000);
    texto = textoGemini(r);
  } else {
    texto = await comModelos(MODELOS_OPENAI, async (modelo) => {
      const r = await pedir(`${OPENAI}/chat/completions`, {
        method: 'POST', headers: { ...cabOpenai(chave), 'content-type': 'application/json' },
        body: JSON.stringify({ model: modelo, response_format: { type: 'json_object' }, messages: [
          { role: 'system', content: `${INSTRUCOES_RESUMO}\nResponda só com um objeto JSON com as chaves: quer, documentos_recebidos, documentos_faltando, proximo_passo, humor.` },
          { role: 'user', content: pedido },
        ] }),
      }, chave, 90_000);
      return String(((r.choices as { message?: { content?: string } }[] | undefined)?.[0]?.message?.content) ?? '');
    });
  }
  const resumo = lerResumo(texto);
  if (!resumo) throw new ErroIa('resposta_invalida', 502);
  return resumo;
}

async function gerarSugestao(provedor: Provedor, chave: string, conversa: string, scripts: string, pedidoExtra: string): Promise<string> {
  const pedido = `Conversa (horário de Brasília; "Cliente" é o cliente, "Equipe" é uma pessoa da empresa e "IA" é a atendente virtual):\n\n${conversa}`
    + (scripts ? `\n\nTextos prontos da empresa (use como base quando servir):\n${scripts}` : '')
    + (pedidoExtra ? `\n\nPedido da pessoa da equipe para esta resposta: ${pedidoExtra}` : '')
    + '\n\nEscreva a próxima mensagem da Equipe para o Cliente.';
  let texto = '';
  if (provedor === 'gemini') {
    const r = await pedir(`${GEMINI}/models/${encodeURIComponent(MODELO_GEMINI)}:generateContent`, {
      method: 'POST', headers: cabGemini(chave),
      body: JSON.stringify({ systemInstruction: { parts: [{ text: INSTRUCOES_SUGESTAO }] }, contents: [{ role: 'user', parts: [{ text: pedido }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 512 } }),
    }, chave, 60_000);
    texto = textoGemini(r);
  } else {
    texto = await comModelos(MODELOS_OPENAI, async (modelo) => {
      const r = await pedir(`${OPENAI}/chat/completions`, {
        method: 'POST', headers: { ...cabOpenai(chave), 'content-type': 'application/json' },
        body: JSON.stringify({ model: modelo, temperature: 0.4, messages: [{ role: 'system', content: INSTRUCOES_SUGESTAO }, { role: 'user', content: pedido }] }),
      }, chave, 60_000);
      return String(((r.choices as { message?: { content?: string } }[] | undefined)?.[0]?.message?.content) ?? '');
    });
  }
  const sugestao = lerSugestao(texto);
  if (!sugestao) throw new ErroIa('resposta_invalida', 502);
  return sugestao;
}

/** o copiloto da tela das IAs: a configuração da versão + a conversa com o administrador → a resposta dele */
async function gerarCopiloto(provedor: Provedor, chave: string, config: string, historico: { de: 'eu' | 'copiloto'; texto: string }[], pergunta: string): Promise<string> {
  const pedido = `Configuração atual da IA:\n\n${config}\n\n`
    + (historico.length ? `Conversa até aqui:\n${historico.map((h) => `${h.de === 'eu' ? 'Administrador' : 'Copiloto'}: ${h.texto}`).join('\n')}\n\n` : '')
    + `Pergunta do administrador agora: ${pergunta}`;
  let texto = '';
  if (provedor === 'gemini') {
    const r = await pedir(`${GEMINI}/models/${encodeURIComponent(MODELO_GEMINI)}:generateContent`, {
      method: 'POST', headers: cabGemini(chave),
      body: JSON.stringify({ systemInstruction: { parts: [{ text: INSTRUCOES_COPILOTO }] }, contents: [{ role: 'user', parts: [{ text: pedido }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 2048 } }),
    }, chave, 90_000);
    texto = textoGemini(r);
  } else {
    texto = await comModelos(MODELOS_OPENAI, async (modelo) => {
      const r = await pedir(`${OPENAI}/chat/completions`, {
        method: 'POST', headers: { ...cabOpenai(chave), 'content-type': 'application/json' },
        body: JSON.stringify({ model: modelo, temperature: 0.3, messages: [{ role: 'system', content: INSTRUCOES_COPILOTO }, { role: 'user', content: pedido }] }),
      }, chave, 90_000);
      return String(((r.choices as { message?: { content?: string } }[] | undefined)?.[0]?.message?.content) ?? '');
    });
  }
  const t = (texto ?? '').trim();
  if (!t) throw new ErroIa('resposta_invalida', 502);
  return t.slice(0, 8000);
}

/** o que é este arquivo (imagem ou PDF): Gemini lê os dois; na OpenAI só a imagem (PDF fica pelo nome do arquivo) */
async function identificarDocumento(provedor: Provedor, chave: string, bytes: Uint8Array<ArrayBuffer>, mime: string): Promise<DocIdentificado | null> {
  let texto = '';
  if (provedor === 'gemini') {
    const r = await pedir(`${GEMINI}/models/${encodeURIComponent(MODELO_GEMINI)}:generateContent`, {
      method: 'POST', headers: cabGemini(chave),
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ inline_data: { mime_type: mime, data: paraBase64(bytes) } }, { text: INSTRUCOES_DOCUMENTO }] }],
        generationConfig: { responseMimeType: 'application/json', responseSchema: ESQUEMA_DOC_GEMINI, temperature: 0, maxOutputTokens: 256 } }),
    }, chave, 60_000);
    texto = textoGemini(r);
  } else {
    if (!mime.startsWith('image/')) return null;
    texto = await comModelos(MODELOS_OPENAI, async (modelo) => {
      const r = await pedir(`${OPENAI}/chat/completions`, {
        method: 'POST', headers: { ...cabOpenai(chave), 'content-type': 'application/json' },
        body: JSON.stringify({ model: modelo, temperature: 0, response_format: { type: 'json_object' }, messages: [
          { role: 'system', content: INSTRUCOES_DOCUMENTO },
          { role: 'user', content: [{ type: 'image_url', image_url: { url: `data:${mime};base64,${paraBase64(bytes)}`, detail: 'low' } }] },
        ] }),
      }, chave, 60_000);
      return String(((r.choices as { message?: { content?: string } }[] | undefined)?.[0]?.message?.content) ?? '');
    });
  }
  return lerDocumento(texto);
}

async function transcreverAudio(provedor: Provedor, chave: string, bytes: Uint8Array<ArrayBuffer>, mime: string): Promise<string> {
  if (provedor === 'gemini') {
    const r = await pedir(`${GEMINI}/models/${encodeURIComponent(MODELO_GEMINI)}:generateContent`, {
      method: 'POST', headers: cabGemini(chave),
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ inline_data: { mime_type: mime, data: paraBase64(bytes) } }, { text: INSTRUCOES_TRANSCRICAO }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 4096 } }),
    }, chave, 120_000);
    return lerTranscricao(textoGemini(r));
  }
  return await comModelos(MODELOS_OPENAI_AUDIO, async (modelo) => {
    const f = new FormData();
    f.append('file', new Blob([bytes], { type: mime }), `audio.${extensaoDoMime(mime)}`);
    f.append('model', modelo); f.append('language', 'pt'); f.append('response_format', 'json');
    const r = await pedir(`${OPENAI}/audio/transcriptions`, { method: 'POST', headers: cabOpenai(chave), body: f }, chave, 120_000);
    return lerTranscricao(String(r.text ?? ''));
  });
}

/* ---------------- quem chama ---------------- */
interface Quem { id: string; orgId: string; admin: boolean; nome: string | null }
async function quemChama(admin: SupabaseClient, comLogin: SupabaseClient, orgDaConversa?: string): Promise<Quem | null> {
  const { data: eu } = await comLogin.auth.getUser();
  if (!eu?.user) return null;
  let q = admin.from('organizacao_usuarios').select('organizacao_id, papel').eq('usuario_id', eu.user.id).eq('status', 'ativo');
  if (orgDaConversa) q = q.eq('organizacao_id', orgDaConversa);
  const { data: vinc } = await q.limit(1).maybeSingle();
  if (!vinc?.organizacao_id) return null;
  const { data: pa } = await admin.from('usuarios').select('platform_admin, nome').eq('id', eu.user.id).maybeSingle();
  return { id: eu.user.id, orgId: vinc.organizacao_id as string, admin: vinc.papel === 'admin' || !!pa?.platform_admin, nome: (pa?.nome as string) ?? null };
}
async function chaveDa(admin: SupabaseClient, orgId: string): Promise<{ provedor: Provedor; chave: string } | null> {
  const { data } = await admin.from('atd_ia_chave').select('provedor, chave').eq('organizacao_id', orgId).maybeSingle();
  return data ? { provedor: data.provedor as Provedor, chave: data.chave as string } : null;
}
/** erro de CHAVE durante o uso fica marcado para o administrador ver em Integrações */
async function marcarErroDeChave(admin: SupabaseClient, orgId: string, codigo: string) {
  if (!['chave_invalida', 'chave_sem_permissao', 'sem_credito_ou_limite'].includes(codigo)) return;
  await admin.from('atd_ia_chave').update({ ultimo_erro: codigo }).eq('organizacao_id', orgId);
}
const nomeDe = async (admin: SupabaseClient, id: string | null) => {
  if (!id) return null;
  const { data } = await admin.from('usuarios').select('nome').eq('id', id).maybeSingle();
  return (data?.nome as string) ?? null;
};
/** a última mensagem de verdade da conversa (para saber se o resumo ficou para trás) */
async function ultimaMensagemEm(admin: SupabaseClient, conversaId: string): Promise<string | null> {
  const { data } = await admin.from('mensagens').select('enviada_em').eq('conversa_id', conversaId).not('tipo', 'in', '(sistema,nota_interna)')
    .order('enviada_em', { ascending: false }).limit(1).maybeSingle();
  return (data?.enviada_em as string) ?? null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return erro('metodo', 405);
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
  const auth = req.headers.get('Authorization') ?? '';
  if (!auth) return erro('nao_autorizado', 401);
  const comLogin = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  let corpo: Record<string, unknown> = {};
  try { corpo = await req.json(); } catch { /* vazio */ }
  const acao = String(corpo.acao ?? '');
  let orgParaErro: string | null = null;

  try {
    /* ---------- conversa: resumo / resumir ---------- */
    if (acao === 'resumo' || acao === 'resumir') {
      const conversaId = String(corpo.conversa_id ?? '');
      if (!UUID.test(conversaId)) return erro('conversa_nao_encontrada');
      // VISIBILIDADE: com o login de quem chamou (RLS)
      const { data: conv } = await comLogin.from('conversas').select('id, organizacao_id').eq('id', conversaId).maybeSingle();
      if (!conv) return erro('conversa_nao_encontrada', 404);
      const eu = await quemChama(admin, comLogin, conv.organizacao_id as string);
      if (!eu) return erro('conversa_nao_encontrada', 404);
      orgParaErro = eu.orgId;
      const { data: guardado } = await admin.from('atd_resumos').select('resumo, gerado_em, gerado_por, ate_msg_em, mensagens').eq('conversa_id', conversaId).maybeSingle();
      const ultima = await ultimaMensagemEm(admin, conversaId);
      const responder = async (g: { resumo: unknown; gerado_em: string; gerado_por: string | null; ate_msg_em: string | null; mensagens: number | null }) => json({
        resumo: g.resumo, gerado_em: g.gerado_em, gerado_por: await nomeDe(admin, g.gerado_por), mensagens: g.mensagens ?? null,
        desatualizado: !!ultima && (!g.ate_msg_em || Date.parse(ultima) > Date.parse(g.ate_msg_em)),
      });
      if (acao === 'resumo') return guardado ? await responder(guardado as never) : json({ resumo: null });

      // "Gerar de novo" apertado duas vezes seguidas, ou nada mudou desde o último: devolve o guardado (não paga duas vezes)
      const refazer = corpo.refazer === true;
      if (guardado) {
        const recente = Date.parse(guardado.gerado_em as string) > Date.now() - 15_000;
        const nadaNovo = !!ultima && !!guardado.ate_msg_em && Date.parse(ultima) <= Date.parse(guardado.ate_msg_em as string);
        if (recente || (!refazer && nadaNovo)) return await responder(guardado as never);
      }
      const k = await chaveDa(admin, eu.orgId);
      if (!k) return erro('sem_chave');
      const { data: linhas, error: eMsgs } = await admin.from('mensagens')
        .select('direcao, tipo, conteudo, origem, enviada_em, transcricao:metadados->>transcricao, nome:metadados->>nome')
        .eq('conversa_id', conversaId).not('tipo', 'in', '(sistema,nota_interna)')
        .order('enviada_em', { ascending: false }).limit(MAX_MENSAGENS_RESUMO);
      if (eMsgs) return erro('falha_ler', 500);
      const { texto, usadas } = montarTextoConversa((linhas ?? []) as MsgResumo[]);
      if (!usadas) return erro('conversa_vazia');
      const resumo = await gerarResumo(k.provedor, k.chave, texto);
      const agora = new Date().toISOString();
      const ate = (linhas?.[0]?.enviada_em as string) ?? ultima ?? agora;
      const { error } = await admin.from('atd_resumos').upsert({
        conversa_id: conversaId, organizacao_id: eu.orgId, resumo, provedor: k.provedor, mensagens: usadas, gerado_em: agora, gerado_por: eu.id, ate_msg_em: ate,
      }, { onConflict: 'conversa_id' });
      if (error) return erro('falha_gravar', 500);
      return json({ resumo, gerado_em: agora, gerado_por: eu.nome, mensagens: usadas, desatualizado: false });
    }

    /* ---------- conversa: sugerir resposta (rascunho para o atendente; nada é enviado nem guardado) ---------- */
    if (acao === 'sugerir') {
      const conversaId = String(corpo.conversa_id ?? '');
      if (!UUID.test(conversaId)) return erro('conversa_nao_encontrada');
      const { data: conv } = await comLogin.from('conversas').select('id, organizacao_id').eq('id', conversaId).maybeSingle();
      if (!conv) return erro('conversa_nao_encontrada', 404);
      const eu = await quemChama(admin, comLogin, conv.organizacao_id as string);
      if (!eu) return erro('conversa_nao_encontrada', 404);
      orgParaErro = eu.orgId;
      const k = await chaveDa(admin, eu.orgId);
      if (!k) return erro('sem_chave');
      const { data: linhas, error: eMsgs } = await admin.from('mensagens')
        .select('direcao, tipo, conteudo, origem, enviada_em, transcricao:metadados->>transcricao, nome:metadados->>nome')
        .eq('conversa_id', conversaId).not('tipo', 'in', '(sistema,nota_interna)')
        .order('enviada_em', { ascending: false }).limit(60);
      if (eMsgs) return erro('falha_ler', 500);
      const { texto, usadas } = montarTextoConversa((linhas ?? []) as MsgResumo[], MAX_CARACTERES_SUGESTAO);
      if (!usadas) return erro('conversa_vazia');
      const { data: scr } = await admin.from('scripts').select('titulo, conteudo').eq('organizacao_id', eu.orgId).eq('ativo', true)
        .order('favorito', { ascending: false }).order('atualizado_em', { ascending: false }).limit(40);
      const pedidoExtra = String(corpo.pedido ?? '').replace(/\s+/g, ' ').trim().slice(0, 200);
      const sugestao = await gerarSugestao(k.provedor, k.chave, texto, montarTextoScripts((scr ?? []) as { titulo: string | null; conteudo: string | null }[]), pedidoExtra);
      return json({ sugestao });
    }

    /* ---------- tela das IAs: o copiloto (só o administrador; lê a configuração da versão, nunca a chave) ---------- */
    if (acao === 'copiloto_iris') {
      const agenteId = String(corpo.agente_id ?? '');
      if (!UUID.test(agenteId)) return erro('ia_nao_encontrada');
      const eu = await quemChama(admin, comLogin);
      if (!eu) return erro('nao_autorizado', 401);
      if (!eu.admin) return erro('so_administrador', 403);
      orgParaErro = eu.orgId;
      const { data: ag } = await admin.from('ia_agentes').select('id, nome, comportamentos').eq('id', agenteId).eq('organizacao_id', eu.orgId).maybeSingle();
      if (!ag) return erro('ia_nao_encontrada', 404);
      const pergunta = String(corpo.pergunta ?? '').replace(/\s+/g, ' ').trim().slice(0, 1500);
      if (pergunta.length < 2) return erro('pergunta_vazia');
      const hist = (Array.isArray(corpo.historico) ? corpo.historico : []).slice(-8)
        .map((h) => (h && typeof h === 'object' ? h as Record<string, unknown> : {}))
        .map((h) => ({ de: h.de === 'copiloto' ? 'copiloto' as const : 'eu' as const, texto: String(h.texto ?? '').slice(0, 3000) }))
        .filter((h) => h.texto.trim());
      // a configuração que está NA TELA (ainda não salva) pode vir junto; senão, a salva
      const naTela = corpo.config && typeof corpo.config === 'object' ? corpo.config as Record<string, unknown> : null;
      const salva = ((ag.comportamentos as Record<string, unknown> | null)?.iris as Record<string, unknown> | null) ?? null;
      const k = await chaveDa(admin, eu.orgId);
      if (!k) return erro('sem_chave');
      const resposta = await gerarCopiloto(k.provedor, k.chave, textoDaConfigIris(naTela ?? salva, String(ag.nome ?? 'IA')), hist, pergunta);
      return json({ resposta });
    }

    /* ---------- documentos que o CLIENTE mandou: o que é cada um (até 8 por vez, só os ainda não vistos) ---------- */
    if (acao === 'identificar_documentos') {
      const conversaId = String(corpo.conversa_id ?? '');
      if (!UUID.test(conversaId)) return erro('conversa_nao_encontrada');
      const { data: conv } = await comLogin.from('conversas').select('id, organizacao_id').eq('id', conversaId).maybeSingle();
      if (!conv) return erro('conversa_nao_encontrada', 404);
      const eu = await quemChama(admin, comLogin, conv.organizacao_id as string);
      if (!eu) return erro('conversa_nao_encontrada', 404);
      orgParaErro = eu.orgId;
      const k = await chaveDa(admin, eu.orgId);
      if (!k) return erro('sem_chave');
      const { data: msgs, error: eM } = await admin.from('mensagens').select('id, tipo, metadados')
        .eq('conversa_id', conversaId).eq('direcao', 'entrada').in('tipo', ['imagem', 'documento'])
        .is('metadados->>doc_tipo', null).not('metadados->>anexo_path', 'is', null)
        .order('enviada_em', { ascending: false }).limit(MAX_DOCS_POR_VEZ + 1);
      if (eM) return erro('falha_ler', 500);
      const lote = (msgs ?? []).slice(0, MAX_DOCS_POR_VEZ);
      const feitos: { mensagem_id: string; tipo: string; lado: string | null; legivel: boolean; observacao: string }[] = [];
      for (const m of lote) {
        const meta = (m.metadados ?? {}) as Record<string, unknown>;
        const caminho = typeof meta.anexo_path === 'string' ? meta.anexo_path : '';
        if (!caminho.startsWith(`${eu.orgId}/`) || caminho.includes('..')) continue;
        const mime = String(meta.mime ?? (m.tipo === 'imagem' ? 'image/jpeg' : 'application/pdf'));
        let doc: DocIdentificado | null = null;
        if (Number(meta.tamanho) <= MAX_BYTES_DOC && (mime.startsWith('image/') || mime === 'application/pdf')) {
          const { data: arq } = await admin.storage.from('script-midia').download(caminho);
          if (arq && arq.size <= MAX_BYTES_DOC) doc = await identificarDocumento(k.provedor, k.chave, new Uint8Array(await arq.arrayBuffer()), mime);
        }
        if (!doc) { const t = tipoPeloNome(meta.nome as string); if (t) doc = { tipo: t, lado: null, legivel: true, observacao: 'pelo nome do arquivo' }; }
        const novo = { ...meta, doc_tipo: doc?.tipo ?? 'outro', doc_lado: doc?.lado ?? null, doc_legivel: doc?.legivel ?? true, doc_obs: doc?.observacao ?? '', doc_em: new Date().toISOString() };
        await admin.from('mensagens').update({ metadados: novo }).eq('id', m.id);
        feitos.push({ mensagem_id: m.id as string, tipo: novo.doc_tipo, lado: novo.doc_lado, legivel: novo.doc_legivel, observacao: novo.doc_obs });
      }
      return json({ identificados: feitos, faltam_mais: (msgs ?? []).length > MAX_DOCS_POR_VEZ });
    }

    /* ---------- áudio: transcrever ---------- */
    if (acao === 'transcrever') {
      const mensagemId = String(corpo.mensagem_id ?? '');
      if (!UUID.test(mensagemId)) return erro('mensagem_nao_encontrada');
      // VISIBILIDADE: a mensagem e a conversa dela, com o login de quem chamou (RLS)
      const { data: msg } = await comLogin.from('mensagens').select('id, conversa_id, organizacao_id, tipo, metadados').eq('id', mensagemId).maybeSingle();
      if (!msg) return erro('mensagem_nao_encontrada', 404);
      const { data: conv } = await comLogin.from('conversas').select('id').eq('id', msg.conversa_id as string).maybeSingle();
      if (!conv) return erro('mensagem_nao_encontrada', 404);
      const eu = await quemChama(admin, comLogin, msg.organizacao_id as string);
      if (!eu) return erro('mensagem_nao_encontrada', 404);
      orgParaErro = eu.orgId;
      if (msg.tipo !== 'audio') return erro('nao_e_audio');
      const meta = (msg.metadados ?? {}) as Record<string, unknown>;
      if (typeof meta.transcricao === 'string' && meta.transcricao.trim()) return json({ texto: meta.transcricao, ja_tinha: true });
      const caminho = typeof meta.anexo_path === 'string' ? meta.anexo_path : '';
      // o arquivo tem de estar na pasta da própria empresa no bucket privado
      if (!caminho || !caminho.startsWith(`${eu.orgId}/`) || caminho.includes('..')) return erro('audio_sem_arquivo');
      if (Number(meta.seconds) > MAX_SEGUNDOS_AUDIO) return erro('audio_longo');
      if (Number(meta.tamanho) > MAX_BYTES_AUDIO) return erro('audio_grande');
      const k = await chaveDa(admin, eu.orgId);
      if (!k) return erro('sem_chave');
      const { data: arq, error: eArq } = await admin.storage.from('script-midia').download(caminho);
      if (eArq || !arq) return erro('audio_sem_arquivo');
      if (arq.size > MAX_BYTES_AUDIO) return erro('audio_grande');
      const bytes = new Uint8Array(await arq.arrayBuffer());
      const texto = await transcreverAudio(k.provedor, k.chave, bytes, mimeDoAudio((meta.mime as string) ?? arq.type, caminho));
      if (!texto) return erro('audio_sem_fala');
      const { data: gravou, error } = await admin.rpc('atd_ia_gravar_transcricao', { p_mensagem: mensagemId, p_texto: texto, p_provedor: k.provedor });
      if (error) return erro('falha_gravar', 500);
      if (gravou !== true) {
        // alguém transcreveu ao mesmo tempo: vale a que ficou gravada
        const { data: atual } = await admin.from('mensagens').select('transcricao:metadados->>transcricao').eq('id', mensagemId).maybeSingle();
        if (atual?.transcricao) return json({ texto: atual.transcricao, ja_tinha: true });
      }
      return json({ texto });
    }

    /* ---------- a chave ---------- */
    const eu = await quemChama(admin, comLogin);
    if (!eu) return erro('nao_autorizado', 401);
    orgParaErro = eu.orgId;

    if (acao === 'disponivel') {
      const { data } = await admin.from('atd_ia_chave').select('provedor').eq('organizacao_id', eu.orgId).maybeSingle();
      return json({ configurada: !!data, provedor: data?.provedor ?? null });
    }
    if (!eu.admin) return erro('so_admin', 403);

    if (acao === 'estado') {
      const { data: c } = await admin.from('atd_ia_chave').select('provedor, final, configurada_por, configurada_em, ultimo_teste_em, ultimo_erro').eq('organizacao_id', eu.orgId).maybeSingle();
      if (!c) return json({ configurada: false });
      return json({ configurada: true, provedor: c.provedor, final: c.final, configurada_em: c.configurada_em, configurada_por: await nomeDe(admin, c.configurada_por as string | null),
        ultimo_teste_em: c.ultimo_teste_em, ultimo_erro: c.ultimo_erro });
    }

    if (acao === 'salvar_chave') {
      const provedor = String(corpo.provedor ?? '') as Provedor;
      const chave = String(corpo.chave ?? '').trim();
      const ruim = conferirChave(provedor, chave);
      if (ruim) return erro(ruim);
      orgParaErro = null; // erro da chave NOVA não marca a chave guardada
      await validar(provedor, chave);
      const agora = new Date().toISOString();
      const { error } = await admin.from('atd_ia_chave').upsert({
        organizacao_id: eu.orgId, provedor, chave, final: finalDaChave(chave), configurada_por: eu.id, configurada_em: agora, ultimo_teste_em: agora, ultimo_erro: null,
      }, { onConflict: 'organizacao_id' });
      if (error) return erro('falha_gravar', 500);
      return json({ ok: true });
    }

    if (acao === 'testar') {
      const k = await chaveDa(admin, eu.orgId);
      if (!k) return erro('sem_chave');
      const agora = new Date().toISOString();
      try { await validar(k.provedor, k.chave); }
      catch (e) {
        const cod = e instanceof ErroIa ? e.codigo : 'provedor_indisponivel';
        await admin.from('atd_ia_chave').update({ ultimo_teste_em: agora, ultimo_erro: cod }).eq('organizacao_id', eu.orgId);
        return erro(cod);
      }
      await admin.from('atd_ia_chave').update({ ultimo_teste_em: agora, ultimo_erro: null }).eq('organizacao_id', eu.orgId);
      return json({ ok: true, testado_em: agora });
    }

    if (acao === 'remover_chave') {
      const { error } = await admin.from('atd_ia_chave').delete().eq('organizacao_id', eu.orgId);
      if (error) return erro('falha_gravar', 500);
      return json({ ok: true });
    }

    return erro('acao_desconhecida');
  } catch (e) {
    if (e instanceof ErroIa) {
      if (orgParaErro) await marcarErroDeChave(admin, orgParaErro, e.codigo).catch(() => undefined);
      return erro(e.codigo, e.status);
    }
    // nunca devolve texto cru (poderia carregar algo do provedor)
    return erro('falha', 500);
  }
});
