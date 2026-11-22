// ia-agente-conversar (Reviza, 22/11) — o "Conversar para testar" da tela da Iris: a MESMA Iris que atende no
// WhatsApp (mesmas instruções, mesma chave, mesmas travas), só que respondendo na tela, sem enviar nada a
// ninguém. Usa a configuração SALVA. Só administrador ativo.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { chamarGemini, explicar, montarConversa, montarSistema, passarPelasTravas, type Agente, type Comportamentos, type Fala } from '../_shared/iris.ts';

const HISTORICO = 30;

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
    if (!perfil?.ativo || perfil.papel !== 'admin') return json({ ok: false, detalhe: 'Só o administrador conversa para testar.' }, 403);

    const body = await req.json().catch(() => ({})) as { agente_id?: string; mensagem?: string; historico?: { de?: string; texto?: string }[] };
    const mensagem = String(body.mensagem ?? '').trim().slice(0, 1000);
    if (!mensagem) return json({ ok: false, detalhe: 'Escreva a mensagem do cliente.' });
    const db = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
    const { data: agente } = await db.from('ia_agentes').select('id, nome, modelo, persona_prompt, conhecimento, comportamentos').eq('id', String(body.agente_id ?? '')).maybeSingle();
    if (!agente) return json({ ok: false, detalhe: 'Atendente não encontrada.' });
    const { data: chave } = await db.rpc('integracao_segredo_ler', { p_nome: `iris_chave_${agente.id}` });
    const falas: Fala[] = [
      ...(Array.isArray(body.historico) ? body.historico : []).slice(-HISTORICO).map((h) => ({ de: h.de === 'ia' ? 'ia' as const : 'cliente' as const, texto: String(h.texto ?? '').slice(0, 1000) })),
      { de: 'cliente', texto: mensagem },
    ];
    try {
      const r = await chamarGemini(typeof chave === 'string' ? chave : '', agente.modelo, montarSistema(agente as Agente), montarConversa(falas));
      const bolhas = passarPelasTravas(r.mensagens, (agente.comportamentos ?? {}) as Comportamentos);
      // no teste, a passagem para a equipe aparece como um aviso (no WhatsApp ela sai da conversa e avisa a equipe)
      if (r.humano) bolhas.push({ texto: `Aqui a Iris passaria o cliente para a equipe${r.motivo ? `: ${r.motivo}` : ''}.`, bloqueada: true });
      return json({ ok: true, mensagens: bolhas });
    } catch (e) { return json({ ok: false, detalhe: explicar(String((e as Error)?.message ?? '')) }); }
  } catch (e) { return json({ ok: false, detalhe: String((e as Error)?.message ?? 'erro inesperado') }, 500); }
});
