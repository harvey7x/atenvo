// adm-fechados — a cada 5 min (pg_cron → aqui) busca no sistema do ADMINISTRATIVO
// a lista dos clientes COMPLETOS (GET caf-fechados, chave no cabeçalho x-api-key)
// e entrega ao banco (adm_sincronizar), que espelha a lista e — se o administrativo
// estiver ligado — põe ou tira do Fechado.
//
// verify_jwt = false: SECRET-GATED. O cron manda x-bot-secret == webhook_config
// 'adm_fechados' (padrão do cron). A chave da API (ADM_API_KEY) e a organização
// (ADM_FECHADOS_ORG) vêm SÓ do env: quem chama nunca escolhe em que org escreve.
// Só nome, CPF, telefone e data passam daqui (e, da API nova, caso, vendedor, data do
// pódio e "fora da conta"); qualquer outro campo é descartado.
//
// PENDENTES (30/10): com a API nova, lê também ?pendentes=1 (aguardando documentos/assinatura)
// e grava em adm_pendentes antes do sincronizar — o Kanban segue o CAF em Documentos e Assinar.
//
// PLACAR (29/10): quando a lista já vem com caso_id, também lê ?placar=DIA do mês do
// campeonato (dia 11 → dia 10) e grava em adm_placar — o corrente a cada leitura, os
// dois anteriores uma vez por hora se faltarem ou tiverem mais de um dia.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const API_PADRAO = 'https://ascftdaelcpbmlifsfkp.supabase.co/functions/v1/caf-fechados';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATA = /^\d{4}-\d{2}-\d{2}/;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

interface Fechado {
  cpf: string; telefone: string; nome: string; fechado_em: string | null;
  caso_id?: string; vendedor?: string | null; completo_em?: string | null; fora_da_conta?: boolean;
}

function limpa(f: Record<string, unknown>): Fechado {
  const txt = (v: unknown, max: number) => String(v ?? '').slice(0, max);
  const data = txt(f.fechado_em, 40);
  const item: Fechado = {
    cpf: txt(f.cpf, 20),
    telefone: txt(f.telefone, 30),
    nome: txt(f.nome, 160),
    fechado_em: DATA.test(data) ? data : null,
  };
  const caso = txt(f.caso_id, 40);
  if (UUID.test(caso)) {
    const completo = txt(f.completo_em, 40);
    item.caso_id = caso;
    item.vendedor = f.vendedor == null ? null : txt(f.vendedor, 80);
    item.completo_em = DATA.test(completo) ? completo : null;
    item.fora_da_conta = f.fora_da_conta === true;
  }
  return item;
}

/** Dia 11 que abre o mês do campeonato do CAF que contém hoje (São Paulo), deslocado `off` meses. */
function mesCampeonato(off: number): string {
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const [a, m, d] = hoje.split('-').map(Number);
  return new Date(Date.UTC(a, (d >= 11 ? m - 1 : m - 2) + off, 11)).toISOString().slice(0, 10);
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

  const api = Deno.env.get('ADM_API_URL') || API_PADRAO;
  let corpo: { total?: unknown; fechados?: unknown };
  try {
    const r = await fetch(api, {
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

  const lista = (corpo.fechados as Record<string, unknown>[]).map(limpa);

  // 30/10: casos ainda não completos (Kanban: Documentos e Assinar) — só com a API nova, e
  // ANTES do sincronizar, que aplica o plano já com eles. Falhou: segue com a última leitura boa.
  let pendentes: unknown = null;
  if (lista.some((f) => f.caso_id)) {
    try {
      const u = new URL(api);
      u.searchParams.set('pendentes', '1');
      const r = await fetch(u, { headers: { 'x-api-key': chaveApi }, signal: AbortSignal.timeout(30_000) });
      const c = r.ok ? await r.json() : null;
      if (c && Array.isArray(c.pendentes) && c.total === c.pendentes.length) {
        const limpos = (c.pendentes as Record<string, unknown>[]).map((p) => ({
          caso_id: String(p.caso_id ?? '').slice(0, 40),
          nome: String(p.nome ?? '').slice(0, 160),
          cpf: String(p.cpf ?? '').slice(0, 20),
          telefone: String(p.telefone ?? '').slice(0, 30),
          vendedor: p.vendedor == null ? null : String(p.vendedor).slice(0, 80),
          estagio: String(p.estagio ?? '').slice(0, 40),
          estagio_em: DATA.test(String(p.estagio_em ?? '')) ? String(p.estagio_em) : null,
        }));
        const { data: g, error: e } = await admin.rpc('adm_pendentes_gravar', { p_org: org, p_lista: limpos });
        pendentes = e ? `erro: ${e.message.slice(0, 120)}` : g;
      } else {
        pendentes = r.ok ? 'sem_pendentes' : `http_${r.status}`;
      }
    } catch (e) {
      pendentes = `sem_resposta: ${String((e as Error)?.message ?? e).slice(0, 120)}`;
    }
    if (typeof pendentes === 'string') await admin.from('adm_sync_log').insert({ organizacao_id: org, erro: `pendentes: ${pendentes}` });
  }

  const { data, error } = await admin.rpc('adm_sincronizar', { p_org: org, p_fechados: lista });
  if (error) return await falha(`sincronizar: ${error.message.slice(0, 160)}`, 500);

  // placar do mês — só com a API nova (a antiga ignoraria ?placar e devolveria a lista)
  const placar: Record<string, unknown> = {};
  if (lista.some((f) => f.caso_id)) {
    const { data: lidos } = await admin.from('adm_placar').select('mes, lido_em').eq('organizacao_id', org);
    const lidoEm = new Map<string, number>();
    for (const l of lidos ?? []) lidoEm.set(String(l.mes), Math.max(lidoEm.get(String(l.mes)) ?? 0, new Date(l.lido_em).getTime()));
    const umaVezPorHora = new Date().getUTCMinutes() < 5;
    for (const [i, mes] of [mesCampeonato(0), mesCampeonato(-1), mesCampeonato(-2)].entries()) {
      const lido = lidoEm.get(mes);
      if (i > 0 && (!umaVezPorHora || (lido && Date.now() - lido < 86_400_000))) continue;
      try {
        const u = new URL(api);
        u.searchParams.set('placar', mes);
        const r = await fetch(u, { headers: { 'x-api-key': chaveApi }, signal: AbortSignal.timeout(30_000) });
        const c = r.ok ? await r.json() : null;
        if (!c?.placar || typeof c.placar !== 'object') {
          placar[mes] = r.ok ? 'sem_placar' : `http_${r.status}`;
          await admin.from('adm_sync_log').insert({ organizacao_id: org, erro: `placar ${mes}: ${placar[mes]}` });
          break;
        }
        const { data: n, error: e } = await admin.rpc('adm_placar_gravar', { p_org: org, p_placar: c.placar });
        placar[mes] = e ? `erro: ${e.message.slice(0, 120)}` : n;
      } catch (e) {
        placar[mes] = `sem_resposta: ${String((e as Error)?.message ?? e).slice(0, 120)}`;
        await admin.from('adm_sync_log').insert({ organizacao_id: org, erro: `placar ${mes}: ${placar[mes]}` });
        break;
      }
    }
  }
  return json({ ...(data as Record<string, unknown>), placar, pendentes });
});
