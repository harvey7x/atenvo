/* Reviza — ponte Sistema → Planilha (Google Sheets via Apps Script Web App).
   Mesmo padrão da enviar-planilha do CAF: o front manda o cliente cadastrado,
   aqui valida o usuário e repassa pro Apps Script com o token.
   Secrets: PLANILHA_WEBAPP_URL (URL /exec do App da Web) + PLANILHA_TOKEN.
   Sem os secrets, responde {ok:false, erro:'ponte nao configurada'} — o front
   ignora em silêncio (cadastro nunca quebra por causa da planilha). */
import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
function json(o: unknown, status = 200) {
  return new Response(JSON.stringify(o), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const authHeader = req.headers.get('Authorization') ?? '';

    // qualquer usuário ATIVO pode acionar (cadastro/comercial cadastram clientes)
    const asUser = createClient(url, anon, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });
    const { data: u } = await asUser.auth.getUser();
    if (!u?.user?.id) return json({ error: 'nao autenticado' }, 401);
    const { data: perfil } = await asUser.from('profiles').select('ativo').eq('id', u.user.id).maybeSingle();
    if (!perfil?.ativo) return json({ error: 'sem permissao' }, 403);

    const webapp = Deno.env.get('PLANILHA_WEBAPP_URL');
    const token = Deno.env.get('PLANILHA_TOKEN');
    if (!webapp || !token) return json({ ok: false, erro: 'ponte nao configurada' });

    const body = await req.json().catch(() => ({}));
    // só os campos da planilha; NUNCA senhas
    const payload = {
      token,
      fechamento: String(body.fechamento ?? ''),
      comercial: String(body.comercial ?? ''),
      nome: String(body.nome ?? ''),
      nb: String(body.nb ?? ''),
      banco: String(body.banco ?? ''),
      cpf: String(body.cpf ?? ''),
      valor: body.valor ?? '',
      dataParou: String(body.dataParou ?? ''),
      recebe: String(body.recebe ?? ''),
      telefone: String(body.telefone ?? ''),
    };
    if (!payload.nome) return json({ ok: false, erro: 'nome vazio' });

    const r = await fetch(webapp, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      redirect: 'follow', // Apps Script responde via redirect 302 → googleusercontent
    });
    const texto = await r.text();
    try { return json(JSON.parse(texto)); } catch { return json({ ok: r.ok, resposta: texto.slice(0, 200) }); }
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
