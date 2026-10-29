// planilha-fechados — recebe a planilha CONTROLE ADM (aba REVISIONAL) inteira do
// Apps Script vinculado a ela (gatilho de 5 min) e entrega ao banco
// (planilha_sincronizar), que espelha os clientes e põe/tira do Fechado.
//
// verify_jwt = false: SECRET-GATED. O Apps Script manda o segredo no corpo
// (UrlFetchApp não precisa de header custom) e ele precisa bater com
// PLANILHA_FECHADOS_TOKEN. A organização vem SÓ do env (PLANILHA_FECHADOS_ORG):
// a planilha nunca escolhe em que org escreve.
// A senha do INSS nunca chega aqui — o Apps Script não lê aquela coluna, e
// qualquer campo fora da lista abaixo é descartado.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

interface Linha { linha: number; atendente: string; producao: number | null; mes: number | null; cor: string; obs: string; obs2: string; nome: string; cpf: string; telefone: string }

function limpa(l: Record<string, unknown>): Linha {
  const txt = (v: unknown, max: number) => String(v ?? '').slice(0, max);
  const n = Number(l.producao);
  return {
    linha: Number(l.linha) || 0,
    atendente: txt(l.atendente, 60),
    producao: Number.isFinite(n) && n > 0 ? n : null,
    mes: Number(l.mes) >= 1 && Number(l.mes) <= 12 ? Number(l.mes) : null,
    cor: txt(l.cor, 16),
    obs: txt(l.obs, 200),
    obs2: txt(l.obs2, 200),
    nome: txt(l.nome, 160),
    cpf: txt(l.cpf, 20),
    telefone: txt(l.telefone, 30),
  };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ ok: false, erro: 'Use POST.' }, 405);
  const token = Deno.env.get('PLANILHA_FECHADOS_TOKEN');
  const org = Deno.env.get('PLANILHA_FECHADOS_ORG');
  if (!token || !org) return json({ ok: false, erro: 'Integração não configurada.' }, 500);

  const body = await req.json().catch(() => null) as { token?: string; linhas?: Record<string, unknown>[] } | null;
  if (!body || body.token !== token) return json({ ok: false, erro: 'Não autorizado.' }, 401);
  if (!Array.isArray(body.linhas)) return json({ ok: false, erro: 'linhas é obrigatório.' }, 400);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const { data, error } = await admin.rpc('planilha_sincronizar', { p_org: org, p_linhas: body.linhas.map(limpa) });
  if (error) return json({ ok: false, erro: error.message }, 500);
  return json(data);
});
