// evolution-send-midia — envia imagem/vídeo/documento/áudio pelo WhatsApp (Evolution),
// salva no Storage privado (wa-midia) e persiste a mensagem de saída (mídia no metadados).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const EVO_BASE = (Deno.env.get('EVOLUTION_API_URL') ?? '').replace(/\/+$/, '');
const EVO_KEY = Deno.env.get('EVOLUTION_API_KEY') ?? '';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

const BUCKET = 'wa-midia';
const SIGNED_TTL = 60 * 60 * 24 * 365; // 1 ano
const MEDIATYPE: Record<string, string> = { imagem: 'image', documento: 'document', video: 'video' };
const TIPOS_OK = ['imagem', 'documento', 'video', 'audio'];

function stripB64(s: string) { const i = s.indexOf('base64,'); return i >= 0 ? s.slice(i + 7) : s; }
function b64ToBytes(b64: string) { const bin = atob(b64); const a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return a; }
function extFrom(nome: string, mime: string) { const n = nome.includes('.') ? nome.split('.').pop()! : ''; const m = mime.includes('/') ? mime.split('/').pop()! : ''; return ((n || m || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8)) || 'bin'; }

async function evoCall(path: string, body: unknown) {
  const res = await fetch(`${EVO_BASE}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: EVO_KEY }, body: JSON.stringify(body) });
  const txt = await res.text();
  let data: any = null; try { data = txt ? JSON.parse(txt) : null; } catch { data = { raw: txt }; }
  if (!res.ok) throw new Error(data?.message ?? data?.error ?? `Evolution HTTP ${res.status}`);
  return data;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    if (!EVO_BASE || !EVO_KEY) return json({ error: 'Evolution não configurada.' }, 503);

    const authHeader = req.headers.get('Authorization') ?? '';
    const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });
    const { data: ures } = await userClient.auth.getUser();
    const user = ures?.user;
    if (!user) return json({ error: 'Não autenticado.' }, 401);

    const body = await req.json().catch(() => ({}));
    const conversaId: string = body.conversa_id;
    const tipo: string = (body.tipo ?? '').toString();
    const nome: string = (body.nome ?? 'arquivo').toString();
    const mime: string = (body.mime ?? 'application/octet-stream').toString();
    const caption: string = (body.caption ?? '').toString();
    const b64 = stripB64((body.base64 ?? '').toString());
    if (!conversaId || !TIPOS_OK.includes(tipo) || !b64) return json({ error: 'conversa_id, tipo (imagem|documento|video|audio) e base64 são obrigatórios.' }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

    const { data: conv } = await admin.from('conversas').select('id, organizacao_id, contato_id, canal_id').eq('id', conversaId).maybeSingle();
    if (!conv) return json({ error: 'Conversa não encontrada.' }, 404);

    const { data: mem } = await admin.from('organizacao_usuarios').select('status').eq('organizacao_id', conv.organizacao_id).eq('usuario_id', user.id).maybeSingle();
    if (!mem || mem.status !== 'ativo') return json({ error: 'Sem acesso a esta organização.' }, 403);

    const { data: canal } = await admin.from('canais').select('instancia_externa, status_integracao, envio_restrito').eq('id', conv.canal_id).maybeSingle();
    if (!canal?.instancia_externa) return json({ error: 'Canal de WhatsApp não encontrado.' }, 404);
    // Contenção: canal com restrição de conta no WhatsApp fica bloqueado para envio (recebimento segue).
    if (canal.envio_restrito) return json({ error: 'O número deste canal está com restrição no WhatsApp e está indisponível para envio. Selecione outro canal.', code: 'canal_restrito' }, 409);
    if (canal.status_integracao !== 'conectado') return json({ error: 'WhatsApp não está conectado.' }, 409);

    let numero: string | null = null;
    const { data: ident } = await admin.from('contato_identidades').select('valor_normalizado, valor').eq('contato_id', conv.contato_id).eq('tipo', 'whatsapp').maybeSingle();
    numero = ident?.valor_normalizado ?? ident?.valor ?? null;
    if (!numero) { const { data: ct } = await admin.from('contatos').select('telefone').eq('id', conv.contato_id).maybeSingle(); numero = (ct?.telefone ?? '').replace(/\D/g, '') || null; }
    if (!numero) return json({ error: 'Contato sem número de WhatsApp.' }, 422);

    const inst = canal.instancia_externa as string;
    let idExterno: string | null = null;
    try {
      let sent: any;
      if (tipo === 'audio') sent = await evoCall(`/message/sendWhatsAppAudio/${inst}`, { number: numero, audio: b64 });
      else sent = await evoCall(`/message/sendMedia/${inst}`, { number: numero, mediatype: MEDIATYPE[tipo] ?? 'document', mimetype: mime, media: b64, fileName: nome, caption: caption || undefined });
      idExterno = sent?.key?.id ?? null;
    } catch (e) { return json({ error: `Falha ao enviar a mídia: ${(e as Error).message}` }, 502); }

    let midiaUrl: string | null = null; let storagePath: string | null = null;
    try {
      const path = `${conv.organizacao_id}/${conversaId}/${crypto.randomUUID()}.${extFrom(nome, mime)}`;
      const up = await admin.storage.from(BUCKET).upload(path, b64ToBytes(b64), { contentType: mime, upsert: false });
      if (!up.error) { storagePath = path; const signed = await admin.storage.from(BUCKET).createSignedUrl(path, SIGNED_TTL); midiaUrl = signed.data?.signedUrl ?? null; }
    } catch { /* exibição é best-effort */ }

    const { data: msg } = await admin.from('mensagens').insert({
      conversa_id: conversaId, organizacao_id: conv.organizacao_id, direcao: 'saida', tipo,
      conteudo: caption || '', autor_id: user.id, id_externo: idExterno, status: 'enviada', enviada_em: new Date().toISOString(),
      metadados: { midia_url: midiaUrl, midia_nome: nome, midia_mime: mime, storage_path: storagePath },
    }).select('id, conteudo, tipo, enviada_em, direcao, status, metadados').single();

    await admin.from('conversas').update({ ultima_interacao_em: new Date().toISOString() }).eq('id', conversaId);
    return json({ ok: true, mensagem: msg });
  } catch (e) { return json({ error: (e as Error).message ?? 'Erro inesperado.' }, 500); }
});
