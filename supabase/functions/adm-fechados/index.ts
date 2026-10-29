// adm-fechados — a cada 5 min (pg_cron → aqui) busca no sistema do ADMINISTRATIVO
// a lista dos clientes COMPLETOS (GET caf-fechados, chave no cabeçalho x-api-key)
// e entrega ao banco (adm_sincronizar), que espelha a lista e — se o administrativo
// estiver ligado — põe ou tira do Fechado.
//
// verify_jwt = false: SECRET-GATED. O cron manda x-bot-secret == webhook_config
// 'adm_fechados' (padrão do cron). A chave da API (ADM_API_KEY) e a organização
// (ADM_FECHADOS_ORG) vêm SÓ do env: quem chama nunca escolhe em que org escreve.
// Só nome, CPF, telefone e data passam daqui; qualquer outro campo é descartado.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const API_PADRAO = 'https://ascftdaelcpbmlifsfkp.supabase.co/functions/v1/caf-fechados';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

interface Fechado { cpf: string; telefone: string; nome: string; fechado_em: string | null }

function limpa(f: Record<string, unknown>): Fechado {
  const txt = (v: unknown, max: number) => String(v ?? '').slice(0, max);
  const data = txt(f.fechado_em, 40);
  return {
    cpf: txt(f.cpf, 20),
    telefone: txt(f.telefone, 30),
    nome: txt(f.nome, 160),
    fechado_em: /^\d{4}-\d{2}-\d{2}/.test(data) ? data : null,
  };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ ok: false, erro: 'Use POST.' }, 405);
  const chaveApi = Deno.env.get('ADM_API_KEY');
  const org = Deno.env.get('ADM_FECHADOS_ORG');
  if (!chaveApi || !org) return json({ ok: false, erro: 'Integração não configurada.' }, 500);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const segredo = req.headers.get('x-bot-secret') ?? '';
  const { data: wc } = await admin.from('webhook_config').select('secret').eq('chave', 'adm_fechados').maybeSingle();
  if (!wc?.secret || segredo !== wc.secret) return json({ ok: false, erro: 'Não autorizado.' }, 401);

  const falha = async (erro: string, status = 502) => {
    await admin.from('adm_sync_log').insert({ organizacao_id: org, erro });
    return json({ ok: false, erro }, status);
  };

  let corpo: { total?: unknown; fechados?: unknown };
  try {
    const r = await fetch(Deno.env.get('ADM_API_URL') || API_PADRAO, {
      headers: { 'x-api-key': chaveApi },
      signal: AbortSignal.timeout(30_000),
    });
    if (!r.ok) return await falha(`api_http_${r.status}`);
    corpo = await r.json();
  } catch (e) {
    return await falha(`api_sem_resposta: ${String((e as Error)?.message ?? e).slice(0, 120)}`);
  }

  // a lista tem de vir inteira: o total que a API anuncia bate com o que veio
  if (!Array.isArray(corpo.fechados) || corpo.total !== corpo.fechados.length) return await falha('api_resposta_invalida');

  const { data, error } = await admin.rpc('adm_sincronizar', {
    p_org: org,
    p_fechados: (corpo.fechados as Record<string, unknown>[]).map(limpa),
  });
  if (error) return await falha(`sincronizar: ${error.message.slice(0, 160)}`, 500);
  return json(data);
});
