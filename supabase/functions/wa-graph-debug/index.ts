// wa-graph-debug — ferramenta de ADMIN da Cloud API (Graph) para diagnosticar/corrigir a
// inscrição WABA->App (subscribed_apps). O META_WHATSAPP_TOKEN só existe no ambiente das edge
// functions; esta função é a ponte para usá-lo sem expor o valor.
//
// SEGURANÇA:
//  * Gated por header x-admin-secret == webhook_config.bot_runner (mesmo segredo do bot). verify_jwt=false.
//  * Token só do env (Deno.env). Nunca no corpo, nunca logado, nunca devolvido.
//
// AÇÕES (body JSON { acao }):
//  * 'diagnostico' (DEFAULT) — SÓ LEITURA. Dois GETs:
//      - GET /{WABA}/subscribed_apps            (apps inscritos nessa WABA)
//      - GET /{PNID}?fields=account_mode,status,verified_name,webhook_configuration
//    NÃO faz nenhuma escrita.
//  * 'inscrever' — a ÚNICA escrita. UM único POST /{WABA}/subscribed_apps (sem corpo, SEM
//    override_callback_uri): inscreve ESTE app (o do META_WHATSAPP_TOKEN) na WABA, usando a
//    callback URL que já está configurada no número. Não sobrescreve URL, não toca em mais nada.
//    Reversível por DELETE /{WABA}/subscribed_apps.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const GRAPH_V = Deno.env.get('META_GRAPH_VERSION') || 'v21.0';
const TOKEN = () => Deno.env.get('META_WHATSAPP_TOKEN') ?? '';

// Alvos fixos: a WABA e o phone_number_id do canal OFICIAL (número 1390).
const WABA = '4352118585049261';
const PNID = '1176570875544852';

async function graphGet(path: string): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`https://graph.facebook.com/${GRAPH_V}/${path}`, {
    headers: { Authorization: `Bearer ${TOKEN()}` },
  });
  const txt = await res.text();
  let body: unknown; try { body = JSON.parse(txt); } catch { body = { raw: txt.slice(0, 500) }; }
  return { status: res.status, body };
}

// POST sem corpo. Usado SÓ pela ação 'inscrever': sem query string, sem body — nada de
// override_callback_uri (a Meta usa a callback URL já configurada no número/WABA).
async function graphPost(path: string): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`https://graph.facebook.com/${GRAPH_V}/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN()}` },
  });
  const txt = await res.text();
  let body: unknown; try { body = JSON.parse(txt); } catch { body = { raw: txt.slice(0, 500) }; }
  return { status: res.status, body };
}

Deno.serve(async (req) => {
  const admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });
  // auth por segredo (reusa webhook_config.bot_runner)
  const { data: wc } = await admin.from('webhook_config').select('secret').eq('chave', 'bot_runner').maybeSingle();
  const secret = req.headers.get('x-admin-secret') ?? '';
  const j = (b: unknown, s = 200) => new Response(JSON.stringify(b, null, 2), { status: s, headers: { 'Content-Type': 'application/json' } });
  if (!wc?.secret || secret !== wc.secret) return j({ error: 'unauthorized' }, 401);
  if (!TOKEN()) return j({ error: 'META_WHATSAPP_TOKEN ausente no ambiente' }, 500);

  const body = await req.json().catch(() => ({})) as { acao?: string };
  const acao = body.acao ?? 'diagnostico';

  if (acao === 'diagnostico') {
    const subscribed_apps = await graphGet(`${WABA}/subscribed_apps`);
    const numero = await graphGet(`${PNID}?fields=account_mode,status,verified_name,webhook_configuration`);
    return j({ acao, waba: WABA, phone_number_id: PNID, subscribed_apps, numero });
  }

  if (acao === 'inscrever') {
    // A ÚNICA escrita desta função. UM POST, sem corpo e sem override_callback_uri: inscreve
    // este app na WABA usando a callback URL já configurada. Nada mais acontece aqui.
    const resultado = await graphPost(`${WABA}/subscribed_apps`);
    return j({ acao, waba: WABA, resultado });
  }

  return j({ error: `acao_nao_suportada:${acao}`, habilitadas: ['diagnostico', 'inscrever'] }, 400);
});
