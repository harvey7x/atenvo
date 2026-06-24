// evolution-foto-sync — busca a foto de perfil do WhatsApp do contato (via Evolution),
// baixa a imagem e salva no Storage privado (contato-fotos); grava a URL assinada em contatos.foto_url.
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

const BUCKET = 'contato-fotos';
const SIGNED_TTL = 60 * 60 * 24 * 365; // 1 ano

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
    const conversaId: string | undefined = body.conversa_id;
    let contatoId: string | undefined = body.contato_id;
    let orgId: string | undefined = body.organizacao_id;
    let canalId: string | null = null;

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

    if (conversaId) {
      const { data: conv } = await admin.from('conversas').select('organizacao_id, contato_id, canal_id').eq('id', conversaId).maybeSingle();
      if (!conv) return json({ error: 'Conversa não encontrada.' }, 404);
      orgId = conv.organizacao_id; contatoId = conv.contato_id; canalId = conv.canal_id;
    }
    if (!orgId || !contatoId) return json({ error: 'Informe conversa_id ou (organizacao_id + contato_id).' }, 400);

    const { data: mem } = await admin.from('organizacao_usuarios').select('status').eq('organizacao_id', orgId).eq('usuario_id', user.id).maybeSingle();
    if (!mem || mem.status !== 'ativo') return json({ error: 'Sem acesso a esta organização.' }, 403);

    // número do contato
    let numero: string | null = null;
    const { data: ident } = await admin.from('contato_identidades').select('valor_normalizado, valor').eq('contato_id', contatoId).eq('tipo', 'whatsapp').maybeSingle();
    numero = ident?.valor_normalizado ?? ident?.valor ?? null;
    if (!numero) {
      const { data: ct } = await admin.from('contatos').select('telefone').eq('id', contatoId).maybeSingle();
      numero = (ct?.telefone ?? '').replace(/\D/g, '') || null;
    }
    if (!numero) return json({ error: 'Contato sem número de WhatsApp.' }, 422);

    // instância conectada (canal da conversa, ou qualquer WhatsApp conectado da org)
    let instancia: string | null = null;
    if (canalId) {
      const { data: canal } = await admin.from('canais').select('instancia_externa, status_integracao').eq('id', canalId).maybeSingle();
      if (canal?.status_integracao === 'conectado') instancia = canal.instancia_externa as string;
    }
    if (!instancia) {
      const { data: canal } = await admin.from('canais').select('instancia_externa').eq('organizacao_id', orgId).eq('tipo', 'whatsapp').eq('status_integracao', 'conectado').limit(1).maybeSingle();
      instancia = (canal?.instancia_externa as string) ?? null;
    }
    if (!instancia) return json({ error: 'Nenhum WhatsApp conectado para consultar a foto.' }, 409);

    // busca a URL da foto de perfil
    let picUrl: string | null = null;
    try {
      const res = await fetch(`${EVO_BASE}/chat/fetchProfilePictureUrl/${instancia}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', apikey: EVO_KEY }, body: JSON.stringify({ number: numero }),
      });
      const txt = await res.text();
      let data: any = null; try { data = txt ? JSON.parse(txt) : null; } catch { data = null; }
      picUrl = data?.profilePictureUrl ?? null;
    } catch { picUrl = null; }

    // sem foto (não tem ou é privada) -> marca sync e retorna
    if (!picUrl) {
      await admin.from('contatos').update({ foto_sync_em: new Date().toISOString() }).eq('id', contatoId);
      return json({ ok: true, foto_url: null });
    }

    // baixa a imagem e salva no storage (overwrite a cada sync)
    let fotoUrl: string | null = null;
    try {
      const imgRes = await fetch(picUrl);
      if (imgRes.ok) {
        const buf = new Uint8Array(await imgRes.arrayBuffer());
        const ct = imgRes.headers.get('content-type') || 'image/jpeg';
        const path = `${orgId}/${contatoId}`;
        const up = await admin.storage.from(BUCKET).upload(path, buf, { contentType: ct, upsert: true });
        if (!up.error) {
          const signed = await admin.storage.from(BUCKET).createSignedUrl(path, SIGNED_TTL);
          fotoUrl = signed.data?.signedUrl ?? null;
        }
      }
    } catch { fotoUrl = null; }

    await admin.from('contatos').update({ foto_url: fotoUrl, foto_sync_em: new Date().toISOString() }).eq('id', contatoId);
    return json({ ok: true, foto_url: fotoUrl });
  } catch (e) {
    return json({ error: (e as Error)?.message ?? 'Erro inesperado.' }, 500);
  }
});
