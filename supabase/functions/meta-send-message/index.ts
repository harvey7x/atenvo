// meta-send-message — envia TEXTO e/ou MÍDIA pela Página. PRIVADA (JWT).
// Mídia: anexo de script (bucket privado) -> URL assinada curta -> Send API (attachment).
// Cria pendente -> Send API -> reconciliação atômica (envio×echo) -> enviada/falhou.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const GV = () => Deno.env.get('META_GRAPH_VERSION') || 'v21.0';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });
const admin = () => createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });

const TIPO_ATTACH: Record<string, string> = { imagem: 'image', audio: 'audio', video: 'video', documento: 'file' };
const FAMILIA_MIME: Record<string, string> = { imagem: 'image/', audio: 'audio/', video: 'video/', documento: '' };
const MAX_FB = 25 * 1024 * 1024;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  const auth = req.headers.get('Authorization') ?? '';
  const uc = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data: ud } = await uc.auth.getUser(); if (!ud.user) return json({ error: 'forbidden' }, 403);

  const body0 = await req.json().catch(() => ({}));
  const { conversa_id, texto, anexo_id, etapa_id, audio_path, audio_mime, audio_nome, audio_tamanho, midia_path, midia_tipo, midia_mime, midia_nome, midia_tamanho } = body0;
  const dPath = midia_path || audio_path;                    // upload direto (gravacao de audio OU midia manual)
  const dTipo = midia_path ? (['imagem', 'audio', 'video', 'documento'].includes(midia_tipo) ? midia_tipo : 'documento') : 'audio';
  const temTexto = typeof texto === 'string' && texto.trim().length > 0;
  if (!conversa_id || (!temTexto && !anexo_id && !etapa_id && !dPath)) return json({ error: 'parametros' }, 400);
  const db = admin();

  const { data: conv } = await db.from('conversas').select('id,organizacao_id,canal_id,contato_id').eq('id', conversa_id).maybeSingle();
  if (!conv) return json({ error: 'conversa' }, 404);
  const { data: membro } = await db.from('organizacao_usuarios').select('papel').eq('usuario_id', ud.user.id).eq('organizacao_id', conv.organizacao_id).eq('status', 'ativo').maybeSingle();
  if (!membro) return json({ error: 'forbidden' }, 403);

  const { data: canal } = await db.from('canais').select('id,status_integracao,tipo').eq('id', conv.canal_id).maybeSingle();
  if (!canal || canal.tipo !== 'facebook') return json({ error: 'canal_invalido' }, 400);
  if (canal.status_integracao !== 'conectado') return json({ error: 'canal_desconectado' }, 409);

  const { data: mp } = await db.from('meta_paginas').select('id,pagina_id,estado').eq('canal_id', canal.id).maybeSingle();
  if (!mp || mp.estado !== 'conectado') return json({ error: 'pagina_desconectada' }, 409);
  const { data: cred } = await db.from('meta_pagina_credenciais').select('vault_secret_id,token_status').eq('meta_pagina_id', mp.id).maybeSingle();
  if (!cred?.vault_secret_id || cred.token_status !== 'valido') return json({ error: 'token_invalido' }, 409);
  const pageToken = (await db.rpc('meta_get_secret', { p_vault_id: cred.vault_secret_id })).data as string;
  if (!pageToken) return json({ error: 'token_invalido' }, 409);

  const { data: ident } = await db.from('meta_contato_identidades').select('psid').eq('meta_pagina_id', mp.id).eq('contato_id', conv.contato_id).maybeSingle();
  if (!ident?.psid) return json({ error: 'sem_psid', message: 'Contato sem PSID nesta Página (só é possível responder quem já escreveu).' }, 422);

  const sendUrl = `https://graph.facebook.com/${GV()}/me/messages`;
  async function persistirEReconciliar(tipo: string, conteudo: string, messageId: string, clientReq: string, meta: Record<string, unknown>) {
    const idExterno = `meta:${mp!.pagina_id}:${messageId}`;
    const { data: finalId } = await db.rpc('meta_reconciliar_envio', { p_org: conv!.organizacao_id, p_client_request_id: clientReq, p_id_externo: idExterno, p_status: 'enviada' });
    if (!finalId) {
      // pendente não encontrada (raro): garante a linha
      await db.from('mensagens').upsert({ conversa_id: conv!.id, organizacao_id: conv!.organizacao_id, direcao: 'saida', tipo, conteudo, autor_id: ud.user!.id, status: 'enviada', origem: 'atenvo', id_externo: idExterno, metadados: meta, enviada_em: new Date().toISOString() }, { onConflict: 'id_externo', ignoreDuplicates: true });
    }
  }

  const resultados: Record<string, unknown> = {};

  // ---- TEXTO ----
  if (temTexto) {
    const clientReq = `req:${crypto.randomUUID()}`;
    const { data: pend } = await db.from('mensagens').insert({ conversa_id: conv.id, organizacao_id: conv.organizacao_id, direcao: 'saida', tipo: 'texto', conteudo: texto, texto_original: texto, autor_id: ud.user.id, status: 'pendente', origem: 'atenvo', client_request_id: clientReq, enviada_em: new Date().toISOString() }).select('id').single();
    try {
      const r = await fetch(`${sendUrl}?access_token=${encodeURIComponent(pageToken)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ recipient: { id: ident.psid }, messaging_type: 'RESPONSE', message: { text: texto } }) });
      const j = await r.json(); if (!r.ok) throw new Error(j?.error?.message || `Graph ${r.status}`);
      if (!j.message_id) throw new Error('sem_message_id');
      await persistirEReconciliar('texto', texto, j.message_id, clientReq, { mid: j.message_id });
      resultados.texto = { ok: true, message_id: j.message_id };
    } catch (e) {
      if (pend?.id) await db.from('mensagens').update({ status: 'falhou', erro_envio: String((e as Error).message).slice(0, 160) }).eq('id', pend.id);
      resultados.texto = { ok: false, error: String((e as Error).message).slice(0, 160) };
    }
  }

  // ---- MÍDIA: anexo de script, etapa de script, OU áudio gravado (path direto). Mesmo bucket privado. ----
  type Anexo = { tipo: string; nome_arquivo: string | null; mime_type: string | null; tamanho_bytes: number | null; storage_path: string };
  const querMidia = !!(anexo_id || etapa_id || dPath);
  let anexo: Anexo | null = null;
  if (anexo_id || etapa_id) {
    const ref = anexo_id ? { tabela: 'script_anexos', id: anexo_id } : { tabela: 'script_etapas', id: etapa_id };
    const { data } = await db.from(ref.tabela).select('tipo,nome_arquivo,mime_type,tamanho_bytes,storage_path,organizacao_id').eq('id', ref.id).maybeSingle();
    // pertence à organização da conversa? (bloqueia anexo/etapa de outra org)
    if (data && data.organizacao_id === conv.organizacao_id && data.storage_path) anexo = { tipo: data.tipo, nome_arquivo: data.nome_arquivo, mime_type: data.mime_type, tamanho_bytes: data.tamanho_bytes, storage_path: data.storage_path };
  } else if (dPath) {
    const p = String(dPath);
    // ISOLAMENTO: o objeto precisa estar sob o prefixo da organização da conversa (mesma regra da RLS do bucket).
    if (p.startsWith(conv.organizacao_id + '/')) {
      anexo = { tipo: dTipo, nome_arquivo: (midia_nome ?? audio_nome ? String(midia_nome ?? audio_nome) : 'arquivo').slice(0, 120), mime_type: (midia_mime ?? audio_mime) ? String(midia_mime ?? audio_mime) : 'application/octet-stream', tamanho_bytes: Number(midia_tamanho ?? audio_tamanho) || 0, storage_path: p };
    }
  }
  if (querMidia) {
    if (!anexo) { resultados.anexo = { ok: false, error: 'anexo_invalido' }; }
    else {
      const attachType = TIPO_ATTACH[anexo.tipo];
      const fam = FAMILIA_MIME[anexo.tipo] ?? '';
      const mime = (anexo.mime_type ?? '').toLowerCase();
      if (!attachType) { resultados.anexo = { ok: false, error: 'tipo_incompativel' }; }
      else if (fam && mime && !mime.startsWith(fam)) { resultados.anexo = { ok: false, error: 'mime_incompativel' }; }
      else if ((anexo.tamanho_bytes ?? 0) > MAX_FB) { resultados.anexo = { ok: false, error: 'arquivo_grande', message: 'Acima de 25 MB para o Messenger.' }; }
      else {
        const clientReq = `req:${crypto.randomUUID()}`;
        const meta = { anexo_path: anexo.storage_path, etapa_id: etapa_id ?? null, anexo_id: anexo_id ?? null, mime: anexo.mime_type ?? null, tamanho: anexo.tamanho_bytes ?? null };
        const { data: pend } = await db.from('mensagens').insert({ conversa_id: conv.id, organizacao_id: conv.organizacao_id, direcao: 'saida', tipo: anexo.tipo, conteudo: anexo.nome_arquivo ?? '[mídia]', autor_id: ud.user.id, status: 'pendente', origem: 'atenvo', client_request_id: clientReq, metadados: meta, enviada_em: new Date().toISOString() }).select('id').single();
        try {
          const sig = await db.storage.from('script-midia').createSignedUrl(anexo.storage_path, 600); // 10 min só p/ a Meta buscar
          if (sig.error || !sig.data?.signedUrl) throw new Error('falha_url_assinada');
          const r = await fetch(`${sendUrl}?access_token=${encodeURIComponent(pageToken)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ recipient: { id: ident.psid }, messaging_type: 'RESPONSE', message: { attachment: { type: attachType, payload: { url: sig.data.signedUrl, is_reusable: false } } } }) });
          const j = await r.json(); if (!r.ok) throw new Error(j?.error?.message || `Graph ${r.status}`);
          if (!j.message_id) throw new Error('sem_message_id'); // ID externo válido é obrigatório
          await persistirEReconciliar(anexo.tipo, anexo.nome_arquivo ?? '[mídia]', j.message_id, clientReq, meta);
          resultados.anexo = { ok: true, message_id: j.message_id };
        } catch (e) {
          if (pend?.id) await db.from('mensagens').update({ status: 'falhou', erro_envio: String((e as Error).message).slice(0, 160) }).eq('id', pend.id);
          resultados.anexo = { ok: false, error: String((e as Error).message).slice(0, 160) };
        }
      }
    }
  }

  await db.from('conversas').update({ ultima_interacao_em: new Date().toISOString(), ultima_msg_canal_em: new Date().toISOString(), ultimo_canal_id: canal.id, ultimo_provider: 'meta' }).eq('id', conv.id);
  const algumOk = Object.values(resultados).some((r) => (r as { ok?: boolean })?.ok);
  return json({ ok: algumOk, resultados }, algumOk ? 200 : 400);
});
