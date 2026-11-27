// ia-agente-testar (Reviza, 22/11) — o botão "Testar conexão" da tela da Iris: chama o Gemini de verdade com a
// chave guardada no cofre e diz se funcionou. Só administrador ativo. A chave nunca volta para a tela.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { chamarGemini, explicar, MODELO_PADRAO } from '../_shared/iris.ts';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const comoPessoa = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } }, auth: { persistSession: false } });
    const { data: u } = await comoPessoa.auth.getUser();
    if (!u?.user?.id) return json({ ok: false, detalhe: 'Entre de novo no sistema.' }, 401);
    const { data: perfil } = await comoPessoa.from('profiles').select('papel, ativo').eq('id', u.user.id).maybeSingle();
    if (!perfil?.ativo || perfil.papel !== 'admin') return json({ ok: false, detalhe: 'Só o administrador testa a conexão.' }, 403);
    const body = await req.json().catch(() => ({})) as { agente_id?: string };
    const db = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
    const { data: agente } = await db.from('ia_agentes').select('id, modelo').eq('id', String(body.agente_id ?? '')).maybeSingle();
    if (!agente) return json({ ok: false, detalhe: 'Atendente não encontrada.' });
    const { data: chave } = await db.rpc('integracao_segredo_ler', { p_nome: `iris_chave_${agente.id}` });
    try {
      await chamarGemini(typeof chave === 'string' ? chave : '', agente.modelo || MODELO_PADRAO, 'Responda com uma única mensagem curta dizendo "ok".', [{ role: 'user', parts: [{ text: 'Teste de conexão.' }] }]);
      return json({ ok: true, detalhe: `Conexão com o Google funcionando (modelo ${agente.modelo || MODELO_PADRAO}).` });
    } catch (e) { return json({ ok: false, detalhe: explicar(String((e as Error)?.message ?? '')) }); }
  } catch (e) { return json({ ok: false, detalhe: String((e as Error)?.message ?? 'erro inesperado') }, 500); }
});
