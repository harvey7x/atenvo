// ia-agente-testar — "Testar conexão" da IA configurável. PRIVADA (JWT).
// Valida a chave + modelo do agente chamando o provedor DE VERDADE (chamada mínima).
// A chave nunca sai daqui: é lida do Vault via RPC ia_agente_chave (service_role) e
// usada só no request ao provedor — a resposta pro front é {ok, detalhe} em pt-BR.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });
const admin = () => createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });

const TIMEOUT_MS = 12_000;
async function fetchCurto(url: string, init: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try { return await fetch(url, { ...init, signal: ctrl.signal }); }
  finally { clearTimeout(t); }
}

type Ping = { ok: boolean; detalhe: string };

async function pingGemini(chave: string, modelo: string): Promise<Ping> {
  const m = modelo || 'gemini-3.6-flash';
  const r = await fetchCurto(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}?key=${encodeURIComponent(chave)}`, { method: 'GET' });
  if (r.ok) return { ok: true, detalhe: `Conexão OK — o modelo ${m} respondeu.` };
  if (r.status === 400 || r.status === 401 || r.status === 403) return { ok: false, detalhe: 'A chave foi recusada pelo Google. Confira se copiou a chave certa do AI Studio.' };
  if (r.status === 404) return { ok: false, detalhe: `A chave é válida, mas o modelo "${m}" não existe. Confira o nome do modelo.` };
  return { ok: false, detalhe: `O Google respondeu com erro ${r.status}. Tente de novo em instantes.` };
}

async function pingOpenAi(chave: string, modelo: string): Promise<Ping> {
  const m = modelo || 'gpt-5-mini';
  const r = await fetchCurto(`https://api.openai.com/v1/models/${encodeURIComponent(m)}`, {
    method: 'GET', headers: { Authorization: `Bearer ${chave}` },
  });
  if (r.ok) return { ok: true, detalhe: `Conexão OK — o modelo ${m} está disponível na sua conta.` };
  if (r.status === 401) return { ok: false, detalhe: 'A chave foi recusada pela OpenAI. Confira se copiou a chave certa.' };
  if (r.status === 404) return { ok: false, detalhe: `A chave é válida, mas o modelo "${m}" não está disponível na sua conta.` };
  return { ok: false, detalhe: `A OpenAI respondeu com erro ${r.status}. Tente de novo em instantes.` };
}

async function pingAnthropic(chave: string, modelo: string): Promise<Ping> {
  const m = modelo || 'claude-haiku-4-5';
  const r = await fetchCurto('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': chave, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: m, max_tokens: 1, messages: [{ role: 'user', content: 'ok' }] }),
  });
  if (r.ok) return { ok: true, detalhe: `Conexão OK — o modelo ${m} respondeu.` };
  if (r.status === 401 || r.status === 403) return { ok: false, detalhe: 'A chave foi recusada pela Anthropic. Confira se copiou a chave certa.' };
  if (r.status === 404) return { ok: false, detalhe: `A chave é válida, mas o modelo "${m}" não existe. Confira o nome do modelo.` };
  if (r.status === 400) {
    const corpo = await r.text().catch(() => '');
    if (corpo.includes('model')) return { ok: false, detalhe: `A chave é válida, mas o modelo "${m}" não foi aceito. Confira o nome do modelo.` };
  }
  return { ok: false, detalhe: `A Anthropic respondeu com erro ${r.status}. Tente de novo em instantes.` };
}

const _cooldown = new Map<string, number>();

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    const agenteId = String(body.agente_id ?? '');
    if (!agenteId) return json({ ok: false, detalhe: 'agente_id ausente' }, 400);

    // quem pede precisa ENXERGAR o agente (RLS da org faz o corte)...
    const auth = req.headers.get('Authorization') ?? '';
    const uc = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
    const { data: ag, error } = await uc.from('ia_agentes')
      .select('id, organizacao_id, provedor, modelo, chave_definida_em')
      .eq('id', agenteId).maybeSingle();
    if (error || !ag) return json({ ok: false, detalhe: 'Agente não encontrado.' }, 404);

    // ...e precisa ser admin/supervisor da org (mesma régua de quem GRAVA a chave):
    // membro comum não vira oráculo de validade nem gasta a cota do provedor do cliente
    const { data: u } = await uc.auth.getUser();
    if (!u?.user) return json({ ok: false, detalhe: 'Sessão inválida.' }, 401);
    const { data: papel } = await admin().from('organizacao_usuarios')
      .select('papel').eq('usuario_id', u.user.id).eq('organizacao_id', ag.organizacao_id)
      .eq('status', 'ativo').in('papel', ['admin', 'supervisor']).maybeSingle();
    if (!papel) return json({ ok: false, detalhe: 'Só administradores podem testar a conexão.' }, 403);

    // freio simples: 1 teste a cada 5s por agente (por instância da function)
    const antes = _cooldown.get(agenteId) ?? 0;
    if (Date.now() - antes < 5_000) return json({ ok: false, detalhe: 'Aguarde alguns segundos entre testes.' }, 429);
    _cooldown.set(agenteId, Date.now());
    if (!ag.chave_definida_em) return json({ ok: false, detalhe: 'Nenhuma chave guardada ainda — cole a chave e guarde no cofre primeiro.' });

    const { data: chave } = await admin().rpc('ia_agente_chave', { p_agente: agenteId });
    if (typeof chave !== 'string' || !chave) return json({ ok: false, detalhe: 'Não consegui ler a chave do cofre. Guarde a chave de novo.' });

    const modelo = String(ag.modelo ?? '').trim();
    const ping = ag.provedor === 'openai' ? await pingOpenAi(chave, modelo)
      : ag.provedor === 'anthropic' ? await pingAnthropic(chave, modelo)
      : await pingGemini(chave, modelo);
    return json(ping);
  } catch (e) {
    const msg = String((e as Error)?.message ?? '');
    if (msg.includes('abort')) return json({ ok: false, detalhe: 'O provedor demorou demais pra responder. Tente de novo.' });
    return json({ ok: false, detalhe: 'Falha inesperada no teste. Tente de novo.' }, 500);
  }
});
