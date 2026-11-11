// ⚠️ APOSENTADA 03/10 (mig 68): este 1º desenho (bloqueio 8h após o Pix) foi
// substituído por reviza-licenca (fatura dia 1º, bloqueio dia 5 às 14h — mig 67).
// A função foi REMOVIDA do ar e as tabelas mensalidade_* dropadas. O código fica
// só como histórico; não redeployar.
// reviza-mensalidade — MENSALIDADE DO SISTEMA via Pix (PushinPay). Pedido do dono 01/10:
// todo dia 5, R$ 100,00; aparece dentro do sistema; sem pagamento em 8h → painel bloqueia.
// verify_jwt=false — três portas de entrada, cada uma com a sua checagem:
//  · cron (x-motor-secret, a cada 5 min) → gera a do mês no dia/hora e consulta os Pix em aberto;
//  · PushinPay (?origem=pushinpay)      → NUNCA confia no corpo: reconsulta a transação na API
//                                          com o NOSSO token e só então dá baixa;
//  · usuário logado (JWT ativo)          → 'verificar' ("já paguei") / 'gerar' (Pix novo se o atual expirou).
// Segredos (painel do Supabase → Edge Functions → Secrets): PUSHINPAY_TOKEN; opcional
// PUSHINPAY_SANDBOX=sim (usa a API de testes). Sem token: nada é cobrado nem bloqueado.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-motor-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const msgDe = (e: unknown) => String((e as Error)?.message ?? e);
const RE_UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

function igual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let x = 0; for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return x === 0;
}

// deno-lint-ignore no-explicit-any
type Admin = any;
type Cfg = { ativa: boolean; valor_centavos: number; dia_mes: number; hora_brt: number; prazo_horas: number; primeira_competencia: string; isentos: string[] | null };
type Mens = { id: string; competencia: string; valor_centavos: number; status: string; vence_em: string | null; pix_atual: string | null };
type PixRow = { id: string; status: string; expira_em: string | null };

/* ---------------- PushinPay ---------------- */
const TOKEN = () => Deno.env.get('PUSHINPAY_TOKEN') ?? '';
const BASE = () => Deno.env.get('PUSHINPAY_SANDBOX') === 'sim'
  ? 'https://api-sandbox.pushinpay.com.br/api' : 'https://api.pushinpay.com.br/api';

async function pp(caminho: string, init: RequestInit = {}): Promise<Response> {
  return await fetch(BASE() + caminho, {
    ...init,
    headers: { Authorization: `Bearer ${TOKEN()}`, Accept: 'application/json', 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });
}
/** centavos: a API manda número (cashIn) ou texto (consulta) — sempre inteiro em centavos */
const centavos = (v: unknown) => Math.round(Number(v ?? 0));
const data = (v: unknown) => { const t = Date.parse(String(v ?? '')); return Number.isFinite(t) ? new Date(t).toISOString() : null; };

type Transacao = { status: string; valor: number; e2e: string | null; pagador: string | null; expira: string | null };
async function consultar(id: string): Promise<Transacao> {
  // a doc publica /transaction/{id}; a biblioteca de referência usa /transactions/{id} — tenta as duas
  let r = await pp(`/transactions/${encodeURIComponent(id)}`);
  if (r.status === 404) r = await pp(`/transaction/${encodeURIComponent(id)}`);
  const t = await r.text();
  if (!r.ok) throw new Error(`PushinPay consulta ${r.status}: ${t.slice(0, 200)}`);
  // deno-lint-ignore no-explicit-any
  const d = JSON.parse(t) as any;
  return {
    status: String(d?.status ?? '').toLowerCase(),
    valor: centavos(d?.value),
    e2e: d?.end_to_end_id ? String(d.end_to_end_id) : null,
    pagador: d?.payer_name ? String(d.payer_name) : null,
    expira: data(d?.pix_details?.expiration_date),
  };
}

async function criarPixNaApi(valor: number, webhook: string) {
  const r = await pp('/pix/cashIn', { method: 'POST', body: JSON.stringify({ value: valor, webhook_url: webhook }) });
  const t = await r.text();
  if (!r.ok) throw new Error(`PushinPay ${r.status}: ${t.slice(0, 300)}`);
  // deno-lint-ignore no-explicit-any
  const d = JSON.parse(t) as any;
  const id = String(d?.id ?? '').toLowerCase();
  const copia = String(d?.qr_code ?? '');
  if (!id || !copia) throw new Error('PushinPay respondeu sem id/qr_code');
  const qr = d?.qr_code_base64 ? String(d.qr_code_base64) : null;
  return { id, copia, qr: qr && !qr.startsWith('data:') ? `data:image/png;base64,${qr}` : qr, valor: centavos(d?.value) || valor };
}

/* ---------------- regras ---------------- */
async function lerCfg(admin: Admin): Promise<Cfg> {
  const { data: c, error } = await admin.from('mensalidade_config').select('*').eq('id', true).single();
  if (error) throw new Error(`config: ${error.message}`);
  return c as Cfg;
}

/** competência e "já passou do dia/hora" pelo relógio de Brasília (UTC-3, sem horário de verão) */
function agoraBRT() {
  const b = new Date(Date.now() - 3 * 3600_000);
  return { comp: `${b.getUTCFullYear()}-${String(b.getUTCMonth() + 1).padStart(2, '0')}`, dia: b.getUTCDate(), hora: b.getUTCHours() };
}

/** dá baixa se a transação está paga; atualiza o status visto. true = pagou agora */
async function sincronizarPix(admin: Admin, mens: Mens, pixId: string): Promise<boolean> {
  const tx = await consultar(pixId);
  if (tx.status === 'paid') {
    const { data: ok, error } = await admin.rpc('mensalidade_confirmar_pix', { p_pix: pixId, p_valor: tx.valor, p_e2e: tx.e2e, p_pagador: tx.pagador });
    if (error) throw new Error(`baixa: ${error.message}`);
    if (!ok && tx.valor < mens.valor_centavos) {
      await admin.from('mensalidades').update({ ultimo_erro: `Pix pago com valor menor (${tx.valor} centavos).`, updated_at: new Date().toISOString() }).eq('id', mens.id);
    }
    return !!ok;
  }
  if (tx.status) {
    await admin.from('mensalidade_pix').update({ status: tx.status, expira_em: tx.expira, updated_at: new Date().toISOString() }).eq('id', pixId);
  }
  return false;
}

/** garante um Pix válido na tela; o relógio (vence_em) começa no PRIMEIRO Pix e nunca reinicia */
async function garantirPix(admin: Admin, cfg: Cfg, mens: Mens, webhook: string): Promise<void> {
  if (mens.pix_atual) {
    const { data: p } = await admin.from('mensalidade_pix').select('id, status, expira_em').eq('id', mens.pix_atual).maybeSingle();
    const atual = p as PixRow | null;
    const valido = atual && atual.status === 'created' && (!atual.expira_em || Date.parse(atual.expira_em) > Date.now() + 60_000);
    if (valido) return;
  }
  try {
    const pix = await criarPixNaApi(mens.valor_centavos, webhook);
    let expira: string | null = null;
    try { expira = (await consultar(pix.id)).expira; } catch { /* sem validade informada: segue valendo */ }
    const { error: e1 } = await admin.from('mensalidade_pix').insert({
      id: pix.id, mensalidade_id: mens.id, valor_centavos: pix.valor, copia_cola: pix.copia, qr_base64: pix.qr, expira_em: expira,
    });
    if (e1) throw new Error(`gravar Pix: ${e1.message}`);
    const agora = new Date().toISOString();
    await admin.from('mensalidades').update({ pix_atual: pix.id, ultimo_erro: null, updated_at: agora }).eq('id', mens.id);
    await admin.from('mensalidades')
      .update({ vence_em: new Date(Date.now() + cfg.prazo_horas * 3600_000).toISOString() })
      .eq('id', mens.id).is('vence_em', null);
  } catch (e) {
    await admin.from('mensalidades').update({ ultimo_erro: msgDe(e).slice(0, 500), updated_at: new Date().toISOString() }).eq('id', mens.id);
    throw e;
  }
}

async function abertas(admin: Admin): Promise<Mens[]> {
  const { data: ms, error } = await admin.from('mensalidades')
    .select('id, competencia, valor_centavos, status, vence_em, pix_atual').eq('status', 'aberta').order('competencia');
  if (error) throw new Error(`mensalidades: ${error.message}`);
  return (ms ?? []) as Mens[];
}

/** consulta TODOS os Pix ainda "created" da mensalidade (um Pix anterior pode ter sido pago) */
async function verificarMens(admin: Admin, mens: Mens): Promise<boolean> {
  const { data: ps } = await admin.from('mensalidade_pix').select('id, status, expira_em').eq('mensalidade_id', mens.id).eq('status', 'created');
  for (const p of (ps ?? []) as PixRow[]) {
    if (await sincronizarPix(admin, mens, p.id)) return true;
  }
  return false;
}

/* ---------------- HTTP ---------------- */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const url = Deno.env.get('SUPABASE_URL')!;
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const motorSecret = Deno.env.get('MOTOR_SECRET') ?? '';
  const admin = createClient(url, service, { auth: { persistSession: false } });
  const webhook = `${url}/functions/v1/reviza-mensalidade?origem=pushinpay`;
  const origem = new URL(req.url).searchParams.get('origem');

  try {
    // ---- 1) WEBHOOK do PushinPay: o corpo só aponta QUAL transação olhar ----
    if (origem === 'pushinpay') {
      const bruto = await req.text();
      let id = '';
      try { id = String(JSON.parse(bruto)?.id ?? ''); } catch { /* não é JSON */ }
      if (!id) { try { id = new URLSearchParams(bruto).get('id') ?? ''; } catch { /* nem form */ } }
      if (!RE_UUID.test(id)) id = bruto.match(RE_UUID)?.[0] ?? '';
      id = (id.match(RE_UUID)?.[0] ?? '').toLowerCase();
      if (!id || !TOKEN()) return json({ ok: true, ignorado: true });
      const { data: p } = await admin.from('mensalidade_pix').select('mensalidade_id').eq('id', id).maybeSingle();
      if (!p) return json({ ok: true, ignorado: true });   // transação que não é nossa
      const { data: m } = await admin.from('mensalidades').select('id, competencia, valor_centavos, status, vence_em, pix_atual').eq('id', p.mensalidade_id).single();
      const pagou = await sincronizarPix(admin, m as Mens, id);
      return json({ ok: true, pagou });
    }

    const viaSecret = !!motorSecret && igual(req.headers.get('x-motor-secret') ?? '', motorSecret);
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;

    // ---- 2) CRON: gera a do mês e acompanha as abertas ----
    if (viaSecret) {
      if (!TOKEN()) return json({ ok: true, inerte: 'sem PUSHINPAY_TOKEN' });
      const cfg = await lerCfg(admin);
      const b = agoraBRT();
      if (cfg.ativa && b.comp >= cfg.primeira_competencia && (b.dia > cfg.dia_mes || (b.dia === cfg.dia_mes && b.hora >= cfg.hora_brt))) {
        await admin.from('mensalidades').upsert({ competencia: b.comp, valor_centavos: cfg.valor_centavos }, { onConflict: 'competencia', ignoreDuplicates: true });
      }
      const res: Record<string, string> = {};
      for (const m of await abertas(admin)) {
        try {
          if (await verificarMens(admin, m)) { res[m.competencia] = 'paga'; continue; }
          await garantirPix(admin, cfg, m, webhook);
          res[m.competencia] = 'aberta';
        } catch (e) { res[m.competencia] = `erro: ${msgDe(e).slice(0, 160)}`; }
      }
      return json({ ok: true, mensalidades: res });
    }

    // ---- 3) USUÁRIO logado ----
    const asUser = createClient(url, anon, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } }, auth: { persistSession: false } });
    const { data: u } = await asUser.auth.getUser();
    if (!u?.user?.id) return json({ error: 'não autenticado' }, 401);
    const { data: perfil } = await asUser.from('profiles').select('ativo, papel').eq('id', u.user.id).maybeSingle();
    if (!perfil?.ativo) return json({ error: 'sem permissão' }, 403);
    if (!TOKEN()) return json({ error: 'Pagamento indisponível no momento. Avise o suporte.' }, 503);

    const ms = await abertas(admin);
    if (!ms.length) return json({ ok: true, pagou: false, aberta: false });
    const mens = ms[0];

    if (body.acao === 'verificar') {
      for (const m of ms) if (await verificarMens(admin, m)) return json({ ok: true, pagou: true });
      return json({ ok: true, pagou: false });
    }
    if (body.acao === 'gerar') {
      const cfg = await lerCfg(admin);
      const podePagar = ['admin', 'gestor', 'financeiro'].includes(String(perfil.papel)) || (cfg.isentos ?? []).includes(u.user.id);
      if (!podePagar) return json({ error: 'sem permissão' }, 403);
      if (await verificarMens(admin, mens)) return json({ ok: true, pagou: true });
      await garantirPix(admin, cfg, mens, webhook);
      return json({ ok: true, pagou: false });
    }
    return json({ error: 'ação inválida' }, 400);
  } catch (e) {
    console.error('[reviza-mensalidade]', msgDe(e));
    return json({ error: 'Não foi possível falar com o PushinPay agora. Tente de novo em instantes.' }, 502);
  }
});
