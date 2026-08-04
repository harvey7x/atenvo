// credito-painel — endpoint READ-ONLY do painel do fluxo de crédito. Devolve as métricas das últimas
// N horas (por canal) chamando fn_credito_painel. Secret-gated (x-bot-secret == webhook_config.credito_painel).
// Usado pela routine de monitoramento (curl a cada 2h). NÃO escreve nada.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type, x-bot-secret', 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const secretHeader = req.headers.get('x-bot-secret') ?? '';
    const { data: wc } = await admin.from('webhook_config').select('secret').eq('chave', 'credito_painel').maybeSingle();
    if (!wc?.secret || secretHeader !== wc.secret) return json({ error: 'unauthorized' }, 401);

    const url = new URL(req.url);
    const horas = Math.min(Math.max(1, Number(url.searchParams.get('horas')) || 2), 168);
    const { data, error } = await admin.rpc('fn_credito_painel', { p_horas: horas });
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true, painel: data });
  } catch (e) { return json({ error: (e as Error)?.message ?? 'erro' }, 500); }
});
