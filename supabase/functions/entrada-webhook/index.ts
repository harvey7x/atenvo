// entrada-webhook — RECEBER DE OUTROS SISTEMAS (Reviza, dono 23/11: a URA liga para o cliente e, se ele diz
// que tem interesse, manda uma mensagem; o fornecedor integra com o nosso por webhook).
// Endereço: https://<projeto>.supabase.co/functions/v1/entrada-webhook/<chave>  (a chave também vale em ?chave=,
// no cabeçalho x-chave ou como "Authorization: Bearer <chave>"). Aceita JSON, formulário ou os dados no endereço.
// Toda a regra (achar a entrada, ler telefone/nome/mensagem, criar conversa e lead) está no banco:
// public.atd_entrada_receber (migration 94). ?teste=1 só confere, não cria nada. Publicada SEM exigir login
// (quem chama é o outro sistema); a prova é a chave, que é longa e aleatória.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-chave',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const STATUS: Record<string, number> = { chave_invalida: 401, desligada: 403, sem_telefone: 422, sem_numero: 409 };
const LIMITE = 64 * 1024;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST' && req.method !== 'GET') return json({ ok: false, erro: 'use POST' }, 405);
  try {
    const url = new URL(req.url);
    const partes = url.pathname.split('/').filter(Boolean);
    const i = partes.indexOf('entrada-webhook');
    const daRota = i >= 0 ? partes[i + 1] : undefined;
    const bearer = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
    const chave = (daRota || url.searchParams.get('chave') || req.headers.get('x-chave') || (/^[a-f0-9]{40,}$/i.test(bearer) ? bearer : '')).trim();
    if (!chave) return json({ ok: false, erro: 'falta a chave' }, 401);

    let payload: Record<string, unknown> = {};
    if (req.method === 'POST') {
      const bruto = await req.text();
      if (bruto.length > LIMITE) return json({ ok: false, erro: 'corpo grande demais' }, 413);
      const tipo = req.headers.get('content-type') ?? '';
      if (bruto.trim()) {
        if (tipo.includes('application/x-www-form-urlencoded')) payload = Object.fromEntries(new URLSearchParams(bruto));
        else { try { const v = JSON.parse(bruto); payload = v && typeof v === 'object' && !Array.isArray(v) ? v : { valor: v }; } catch { payload = Object.fromEntries(new URLSearchParams(bruto)); } }
      }
    }
    for (const [k, v] of url.searchParams) if (k !== 'chave' && k !== 'teste' && !(k in payload)) payload[k] = v;
    const teste = url.searchParams.get('teste') === '1' || payload.teste === true || payload.teste === 'true';
    delete payload.teste;

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
    const { data, error } = await admin.rpc('atd_entrada_receber', { p_chave: chave, p_payload: payload, p_teste: teste });
    if (error) { console.error('entrada-webhook', error.message); return json({ ok: false, erro: 'falha ao gravar' }, 500); }
    const r = (data ?? {}) as { ok?: boolean; erro?: string };
    return json(r, r.ok ? 200 : (STATUS[r.erro ?? ''] ?? 400));
  } catch (e) {
    console.error('entrada-webhook', (e as Error).message);
    return json({ ok: false, erro: 'falha ao ler o pedido' }, 400);
  }
});
