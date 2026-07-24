// wa-midia — recarrega a mídia de uma mensagem PENDENTE e guarda no bucket privado.
// action 'retry-audio': membro ativo da org. Não envia mensagem; apenas recupera a mídia recebida.
//
// DOIS TRANSPORTES (Bloco 4):
//  * evolution  — re-baixa por getBase64FromMediaMessage usando metadados.media_key. Inalterado.
//  * cloud_api  — re-resolve o metadados.media_id no Graph. Funciona MESMO depois de horas: a URL
//                 que a Meta devolve expira em ~5 min, mas o media_id vale ~30 dias — por isso o
//                 webhook guarda o id, nunca a URL.
// A checagem de Evolution configurada agora é POR TRANSPORTE: um canal oficial não pode ficar sem
// retry só porque a Evolution está fora do ar.
import { corsHeaders, json } from './cors.ts';
import { adminClient, getUser, orgRole } from './client.ts';
import { evolutionConfigured, getBase64 } from './evolution.ts';

const GRAPH_V = () => Deno.env.get('META_GRAPH_VERSION') || 'v21.0';
const META_TOKEN = () => Deno.env.get('META_WHATSAPP_TOKEN') ?? '';
const MAX_MEDIA = 20 * 1024 * 1024;

function extFromMime(mime: string): string {
  const m = mime.toLowerCase();
  if (m.includes('ogg')) return 'ogg'; if (m.includes('mpeg')) return 'mp3'; if (m.includes('mp4') || m.includes('m4a')) return 'm4a';
  if (m.includes('aac')) return 'aac'; if (m.includes('wav')) return 'wav'; if (m.includes('webm')) return 'webm'; return 'ogg';
}
/** Extensão para os demais tipos (o ramo cloud aceita imagem/vídeo/documento também). */
function extPorMime(mime: string): string {
  const m = (mime || '').toLowerCase();
  if (m.includes('jpeg') || m.includes('jpg')) return 'jpg'; if (m.includes('png')) return 'png';
  if (m.includes('webp')) return 'webp'; if (m.includes('gif')) return 'gif';
  if (m.includes('mp4')) return 'mp4'; if (m.includes('quicktime') || m.includes('mov')) return 'mov'; if (m.includes('3gpp')) return '3gp';
  if (m.includes('pdf')) return 'pdf'; if (m.includes('wordprocessingml')) return 'docx'; if (m.includes('msword')) return 'doc';
  if (m.includes('spreadsheetml')) return 'xlsx'; if (m.includes('ms-excel')) return 'xls'; if (m.includes('zip')) return 'zip'; if (m.includes('text')) return 'txt';
  if (m.includes('audio')) return extFromMime(m);
  return 'bin';
}
async function graphGet(path: string, timeoutMs: number): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(/^https?:\/\//i.test(path) ? path : `https://graph.facebook.com/${GRAPH_V()}/${path}`, {
      headers: { Authorization: `Bearer ${META_TOKEN()}` }, signal: ctrl.signal,
    });
  } finally { clearTimeout(t); }
}
/** media_id -> metadados (url temporária, mesmo Bearer) -> bytes. Espelha o cloud-webhook. */
async function baixarMidiaCloud(mediaId: string): Promise<{ bytes: Uint8Array; mime: string }> {
  if (!META_TOKEN()) throw new Error('token_meta_ausente');
  const metaRes = await graphGet(mediaId, 15000);
  if (!metaRes.ok) throw new Error(`meta HTTP ${metaRes.status}`);
  const info = await metaRes.json().catch(() => ({})) as { url?: string; mime_type?: string; file_size?: number };
  if (!info.url) throw new Error('sem_url');
  if (typeof info.file_size === 'number' && info.file_size > MAX_MEDIA) throw new Error('arquivo_excede_limite');
  const binRes = await graphGet(info.url, 45000);
  if (!binRes.ok) throw new Error(`download HTTP ${binRes.status}`);
  const bytes = new Uint8Array(await binRes.arrayBuffer());
  if (bytes.length === 0) throw new Error('midia_vazia');
  if (bytes.length > MAX_MEDIA) throw new Error('arquivo_excede_limite');
  return { bytes, mime: (binRes.headers.get('content-type') ?? info.mime_type ?? '').split(';')[0].trim() };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const user = await getUser(req);
    if (!user) return json({ error: 'Não autenticado.' }, 401);
    const body = await req.json().catch(() => ({}));
    const orgId: string = body.organizacao_id; const mensagemId: string = body.mensagem_id;
    if ((body.action ?? 'retry-audio') !== 'retry-audio') return json({ error: 'Ação inválida.' }, 400);
    if (!orgId || !mensagemId) return json({ error: 'Parâmetros obrigatórios ausentes.' }, 400);

    const admin = adminClient();
    if (!(await orgRole(admin, user.id, orgId))) return json({ error: 'Sem acesso a esta organização.' }, 403);

    const { data: msg } = await admin.from('mensagens')
      .select('id, organizacao_id, tipo, metadados, conversa_id').eq('id', mensagemId).maybeSingle();
    if (!msg || msg.organizacao_id !== orgId) return json({ error: 'Mensagem não encontrada.' }, 404);
    const meta = (msg.metadados ?? {}) as Record<string, unknown>;
    if (!meta.midia_pendente) return json({ error: 'Mensagem não está com mídia pendente.' }, 409);

    // canal da conversa decide o transporte (e, no caso da Evolution, a instância).
    const { data: conv } = await admin.from('conversas').select('canal_id').eq('id', msg.conversa_id).maybeSingle();
    const { data: canal } = conv?.canal_id
      ? await admin.from('canais').select('instancia_externa, transporte').eq('id', conv.canal_id).maybeSingle()
      : { data: null };
    const ehCloud = (canal?.transporte as string | null) === 'cloud_api';

    let dl: { bytes: Uint8Array; mime: string };
    let extBase: string;

    if (ehCloud) {
      const mediaId = typeof meta.media_id === 'string' ? meta.media_id : null;
      if (!mediaId) return json({ error: 'Sem referência da mídia para recarregar.' }, 422);
      try { dl = await baixarMidiaCloud(mediaId); }
      catch (e) {
        await admin.from('mensagens').update({ metadados: { ...meta, media_erro: String((e as Error).message ?? 'download').slice(0, 120) } }).eq('id', mensagemId);
        return json({ error: 'Não foi possível baixar a mídia agora. Tente novamente em instantes.' }, 502);
      }
      extBase = extPorMime(dl.mime || (meta.mime as string) || '');
    } else {
      // ---- ramo Evolution: idêntico ao que já rodava (só áudio, por media_key) ----
      if (!evolutionConfigured()) return json({ error: 'Evolution não configurada.' }, 503);
      if (msg.tipo !== 'audio') return json({ error: 'Mensagem não está com mídia pendente.' }, 409);
      const instancia = (canal?.instancia_externa as string | undefined) ?? null;
      if (!instancia) return json({ error: 'Canal sem sessão para recuperar a mídia.' }, 409);
      const mediaKey = meta.media_key as unknown;
      if (!mediaKey) return json({ error: 'Sem referência da mídia para recarregar.' }, 422);
      try { dl = await getBase64(instancia, { key: mediaKey }); }
      catch (e) {
        await admin.from('mensagens').update({ metadados: { ...meta, media_erro: String((e as Error).message ?? 'download').slice(0, 120) } }).eq('id', mensagemId);
        return json({ error: 'Não foi possível baixar o áudio agora. Tente novamente em instantes.' }, 502);
      }
      extBase = extFromMime(dl.mime || (meta.mime as string) || 'audio/ogg');
    }

    const mime = dl.mime || (meta.mime as string) || (msg.tipo === 'audio' ? 'audio/ogg' : 'application/octet-stream');
    const path = `${orgId}/wa-midia/${mensagemId}.${extBase}`;
    const up = await admin.storage.from('script-midia').upload(path, dl.bytes, { contentType: mime, upsert: true });
    if (up.error) return json({ error: 'Falha ao guardar a mídia.' }, 500);

    // metadados reescritos SEM midia_pendente/media_erro (é assim que o front sabe que resolveu),
    // preservando os ponteiros de origem para um eventual retry futuro.
    await admin.from('mensagens').update({
      metadados: {
        anexo_path: path, mime, tamanho: dl.bytes.length, nome: (meta.nome as string) ?? `${msg.tipo}.${extBase}`,
        ptt: meta.ptt ?? null, seconds: meta.seconds ?? null, via: meta.via ?? 'webhook', status_midia: 'disponivel',
        ...(meta.media_id ? { media_id: meta.media_id } : {}),
        ...(meta.media_key ? { media_key: meta.media_key } : {}),
      },
    }).eq('id', mensagemId);
    return json({ ok: true });
  } catch (e) {
    return json({ error: (e as Error).message ?? 'Erro inesperado.' }, 500);
  }
});
