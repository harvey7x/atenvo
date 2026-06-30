// wa-midia — recarrega a mídia (áudio) de uma mensagem PENDENTE: re-baixa pela Evolution e guarda no bucket.
// action 'retry-audio': membro ativo da org. Não envia mensagem; apenas recupera a mídia recebida.
import { corsHeaders, json } from './cors.ts';
import { adminClient, getUser, orgRole } from './client.ts';
import { evolutionConfigured, getBase64 } from './evolution.ts';

function extFromMime(mime: string): string {
  const m = mime.toLowerCase();
  if (m.includes('ogg')) return 'ogg'; if (m.includes('mpeg')) return 'mp3'; if (m.includes('mp4') || m.includes('m4a')) return 'm4a';
  if (m.includes('aac')) return 'aac'; if (m.includes('wav')) return 'wav'; if (m.includes('webm')) return 'webm'; return 'ogg';
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
    if (!evolutionConfigured()) return json({ error: 'Evolution não configurada.' }, 503);

    const admin = adminClient();
    if (!(await orgRole(admin, user.id, orgId))) return json({ error: 'Sem acesso a esta organização.' }, 403);

    const { data: msg } = await admin.from('mensagens')
      .select('id, organizacao_id, tipo, metadados, conversa_id').eq('id', mensagemId).maybeSingle();
    if (!msg || msg.organizacao_id !== orgId) return json({ error: 'Mensagem não encontrada.' }, 404);
    const meta = (msg.metadados ?? {}) as Record<string, unknown>;
    if (msg.tipo !== 'audio' || !meta.midia_pendente) return json({ error: 'Mensagem não está com mídia pendente.' }, 409);

    // canal/instância da conversa
    const { data: conv } = await admin.from('conversas').select('canal_id').eq('id', msg.conversa_id).maybeSingle();
    const { data: canal } = conv?.canal_id ? await admin.from('canais').select('instancia_externa').eq('id', conv.canal_id).maybeSingle() : { data: null };
    const instancia = (canal?.instancia_externa as string | undefined) ?? null;
    if (!instancia) return json({ error: 'Canal sem sessão para recuperar a mídia.' }, 409);

    const mediaKey = meta.media_key as unknown;
    if (!mediaKey) return json({ error: 'Sem referência da mídia para recarregar.' }, 422);

    let dl: { bytes: Uint8Array; mime: string };
    try { dl = await getBase64(instancia, { key: mediaKey }); }
    catch (e) {
      await admin.from('mensagens').update({ metadados: { ...meta, media_erro: String((e as Error).message ?? 'download').slice(0, 120) } }).eq('id', mensagemId);
      return json({ error: 'Não foi possível baixar o áudio agora. Tente novamente em instantes.' }, 502);
    }
    const mime = dl.mime || (meta.mime as string) || 'audio/ogg';
    const ext = extFromMime(mime);
    const path = `${orgId}/wa-midia/${mensagemId}.${ext}`;
    const up = await admin.storage.from('script-midia').upload(path, dl.bytes, { contentType: mime, upsert: true });
    if (up.error) return json({ error: 'Falha ao guardar o áudio.' }, 500);

    await admin.from('mensagens').update({
      metadados: { anexo_path: path, mime, tamanho: dl.bytes.length, nome: `audio.${ext}`, ptt: meta.ptt ?? null, seconds: meta.seconds ?? null, via: meta.via ?? 'webhook' },
    }).eq('id', mensagemId);
    return json({ ok: true });
  } catch (e) {
    return json({ error: (e as Error).message ?? 'Erro inesperado.' }, 500);
  }
});
