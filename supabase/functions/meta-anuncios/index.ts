// meta-anuncios — ANÚNCIOS DO FACEBOOK no Atendimento (dono 25/11: "conectar o Facebook para ver qual campanha tá rodando melhor").
// Lê da Meta (Marketing API, só leitura) o que foi investido por dia × anúncio e grava em atd_meta_gasto; a tela do Dashboard
// cruza com atd_anuncio_origem (quem chegou por cada anúncio) pela rotina dash_anuncios (migration 96).
//
// Ações (corpo { acao }):
//   estado        → a conta conectada, sem o código (qualquer administrador)
//   buscar_contas → { token } → as contas de anúncios que o código enxerga + uma sessão de 15 min (nada conectado ainda)
//   conectar      → { sessao, conta_id } → confere a conta, guarda o código SÓ no servidor e já lê os últimos 30 dias
//   sincronizar   → relê os últimos 7 dias (a Meta ainda ajusta os números de dias recentes); pela tela ou pelo agendador
//   desconectar   → apaga a conta e o código (o gasto já lido fica, a tela deixa de mostrar o dinheiro)
// Quem chama: a TELA (login de administrador do Atendimento) ou o AGENDADOR (x-anuncios-secret == webhook_config.anuncios,
// de hora em hora, todas as empresas conectadas). Deploy --no-verify-jwt: o agendador não tem login; a tela é conferida aqui.
// O código de acesso nunca volta para a tela e nunca vai para o log.
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const GRAPH = 'https://graph.facebook.com/v21.0';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-anuncios-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });
const erro = (codigo: string, s = 400) => json({ erro: codigo }, s);

function seguroIgual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a); const eb = new TextEncoder().encode(b);
  let d = ea.length ^ eb.length;
  for (let i = 0; i < Math.max(ea.length, eb.length); i++) d |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return d === 0;
}

/* ---------------- Graph API ---------------- */
class ErroMeta extends Error { constructor(public codigo: string, msg?: string) { super(msg ?? codigo); } }
/** traduz o erro da Meta para os códigos que a tela conhece (data/anuncios.ts) */
function codigoDoErro(e: { code?: number; error_subcode?: number; type?: string } | undefined): string {
  if (!e) return 'meta_indisponivel';
  if (e.code === 190 || e.type === 'OAuthException' && e.code === 102) return 'token_invalido';
  if (e.code === 200 || e.code === 10 || (e.code ?? 0) >= 200 && (e.code ?? 0) < 300) return 'sem_permissao_ads';
  if (e.code === 100) return 'conta_nao_encontrada';
  if (e.code === 4 || e.code === 17 || e.code === 32 || e.code === 613 || e.code === 80004) return 'meta_limite';
  return 'meta_indisponivel';
}
async function graph(caminho: string, token: string, params: Record<string, string> = {}): Promise<Record<string, unknown>> {
  const u = new URL(caminho.startsWith('http') ? caminho : GRAPH + caminho);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  // o código vai no cabeçalho, nunca na URL (URL pode ir para log)
  const res = await fetch(u.toString(), { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(25000) });
  let corpo: Record<string, unknown> = {};
  try { corpo = await res.json(); } catch { /* corpo vazio */ }
  if (!res.ok || corpo.error) throw new ErroMeta(codigoDoErro(corpo.error as { code?: number }));
  return corpo;
}
/** segue a paginação da Meta (paging.next) até o fim, com teto de páginas */
async function todasAsPaginas(caminho: string, token: string, params: Record<string, string>, teto = 40): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  let r = await graph(caminho, token, params);
  for (let i = 0; i < teto; i++) {
    out.push(...((r.data as Record<string, unknown>[] | undefined) ?? []));
    const prox = (r.paging as { next?: string } | undefined)?.next;
    if (!prox) break;
    // a URL "next" da Meta já traz os parâmetros; o código continua no cabeçalho
    const u = new URL(prox); u.searchParams.delete('access_token');
    r = await graph(u.toString(), token);
  }
  return out;
}

const diaSP = (deslocamento = 0) => {
  const d = new Date(Date.now() + deslocamento * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
};
const situacao = (s: string | undefined) => {
  const x = (s ?? '').toUpperCase();
  if (x === 'ACTIVE' || x === 'IN_PROCESS' || x === 'WITH_ISSUES') return 'ativa';
  if (x.includes('PAUSED')) return 'pausada';
  return x ? 'encerrada' : 'ativa';
};
const n = (v: unknown) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };

/** lê `dias` dias (até hoje) da conta e grava em atd_meta_gasto. Devolve quantas linhas. */
async function sincronizar(admin: SupabaseClient, orgId: string, contaId: string, token: string, dias: number): Promise<number> {
  const since = diaSP(-(dias - 1)), until = diaSP(0);
  const linhas = await todasAsPaginas(`/${contaId}/insights`, token, {
    level: 'ad', time_increment: '1', limit: '500',
    time_range: JSON.stringify({ since, until }),
    fields: 'ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,spend,impressions,clicks',
  });
  // situação de cada campanha (ativa / pausada / encerrada)
  const camps = await todasAsPaginas(`/${contaId}/campaigns`, token, { fields: 'id,effective_status', limit: '500' }, 10).catch(() => []);
  const sit = new Map(camps.map((c) => [String(c.id), situacao(c.effective_status as string)]));
  const agora = new Date().toISOString();
  const regs = linhas.filter((l) => l.ad_id && l.date_start).map((l) => ({
    organizacao_id: orgId, dia: String(l.date_start).slice(0, 10), anuncio_id: String(l.ad_id),
    anuncio_nome: (l.ad_name as string) ?? null, conjunto_id: (l.adset_id as string) ?? null, conjunto_nome: (l.adset_name as string) ?? null,
    campanha_id: (l.campaign_id as string) ?? null, campanha_nome: (l.campaign_name as string) ?? null,
    campanha_situacao: sit.get(String(l.campaign_id)) ?? 'ativa',
    investido: Math.round(n(l.spend) * 100) / 100, impressoes: Math.round(n(l.impressions)), cliques: Math.round(n(l.clicks)), atualizado_em: agora,
  }));
  // a janela inteira é reescrita: anúncio que sumiu da Meta num dia (gasto zerado) não pode ficar com o valor velho
  const { error: eDel } = await admin.from('atd_meta_gasto').delete().eq('organizacao_id', orgId).gte('dia', since).lte('dia', until);
  if (eDel) throw new Error('falha_gravar');
  for (let i = 0; i < regs.length; i += 500) {
    const { error } = await admin.from('atd_meta_gasto').upsert(regs.slice(i, i + 500), { onConflict: 'organizacao_id,dia,anuncio_id' });
    if (error) throw new Error('falha_gravar');
  }
  // nomes/situação das campanhas também nos dias mais antigos (renomear a campanha na Meta vale para tudo)
  for (const [cid, s] of sit) await admin.from('atd_meta_gasto').update({ campanha_situacao: s }).eq('organizacao_id', orgId).eq('campanha_id', cid).lt('dia', since);
  await admin.from('atd_meta_conta').update({ sincronizado_em: agora, erro_sync: null, atualizado_em: agora }).eq('organizacao_id', orgId);
  return regs.length;
}

const MSG_SYNC: Record<string, string> = {
  token_invalido: 'A Meta deixou de aceitar o código de acesso (ele foi revogado ou trocado). Conecte de novo com um código novo.',
  sem_permissao_ads: 'O código de acesso perdeu a permissão de ler os anúncios desta conta. Gere um novo com ads_read.',
  conta_nao_encontrada: 'A conta de anúncios não aparece mais para este código. Confira o acesso do usuário do sistema.',
  meta_limite: 'A Meta pediu para esperar um pouco (limite de consultas). O sistema tenta de novo na próxima hora.',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return erro('metodo', 405);
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
  let corpo: Record<string, unknown> = {};
  try { corpo = await req.json(); } catch { /* vazio */ }
  const acao = String(corpo.acao ?? '');

  // ---- AGENDADOR: de hora em hora, todas as contas conectadas ----
  const segredo = req.headers.get('x-anuncios-secret');
  if (segredo != null) {
    const { data: wc } = await admin.from('webhook_config').select('secret').eq('chave', 'anuncios').maybeSingle();
    if (!wc?.secret || !seguroIgual(segredo, wc.secret as string)) return erro('nao_autorizado', 401);
    await admin.rpc('atd_meta_sessao_limpar');
    const { data: contas } = await admin.from('atd_meta_conta').select('organizacao_id, conta_id, token');
    const r: Record<string, unknown>[] = [];
    for (const c of (contas ?? []) as { organizacao_id: string; conta_id: string; token: string }[]) {
      try { r.push({ org: c.organizacao_id, linhas: await sincronizar(admin, c.organizacao_id, c.conta_id, c.token, 7) }); }
      catch (e) {
        const cod = e instanceof ErroMeta ? e.codigo : 'falha';
        await admin.from('atd_meta_conta').update({ erro_sync: MSG_SYNC[cod] ?? 'A última atualização com a Meta falhou. O sistema tenta de novo na próxima hora.', atualizado_em: new Date().toISOString() }).eq('organizacao_id', c.organizacao_id);
        r.push({ org: c.organizacao_id, erro: cod });
      }
    }
    return json({ ok: true, contas: r });
  }

  // ---- TELA: só administrador do Atendimento ----
  const auth = req.headers.get('Authorization') ?? '';
  const comLogin = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data: eu } = await comLogin.auth.getUser();
  if (!eu?.user) return erro('nao_autorizado', 401);
  const { data: vinc } = await admin.from('organizacao_usuarios').select('organizacao_id, papel')
    .eq('usuario_id', eu.user.id).eq('status', 'ativo').limit(1).maybeSingle();
  if (!vinc?.organizacao_id) return erro('so_admin', 403);
  const { data: pa } = await admin.from('usuarios').select('platform_admin, nome').eq('id', eu.user.id).maybeSingle();
  if (vinc.papel !== 'admin' && !pa?.platform_admin) return erro('so_admin', 403);
  const orgId = vinc.organizacao_id as string;

  try {
    if (acao === 'estado') {
      const { data: c } = await admin.from('atd_meta_conta').select('conta_id, nome, moeda, sincronizado_em, erro_sync, conectado_por').eq('organizacao_id', orgId).maybeSingle();
      if (!c) return json({ conectada: false });
      const { data: quem } = c.conectado_por ? await admin.from('usuarios').select('nome').eq('id', c.conectado_por).maybeSingle() : { data: null };
      return json({ conectada: true, conta_id: c.conta_id, nome: c.nome, moeda: c.moeda, sincronizado_em: c.sincronizado_em, erro_sync: c.erro_sync, conectado_por: quem?.nome ?? null });
    }

    if (acao === 'buscar_contas') {
      const token = String(corpo.token ?? '').trim();
      if (token.length < 20 || /\s/.test(token)) return erro('token_invalido');
      const contas = await todasAsPaginas('/me/adaccounts', token, { fields: 'id,name,currency,account_status,timezone_name', limit: '100' }, 5);
      const lista = contas.map((c) => ({ id: String(c.id), nome: String(c.name ?? c.id), moeda: String(c.currency ?? 'BRL'), fuso: String(c.timezone_name ?? ''), ativa: Number(c.account_status) === 1 }))
        .filter((c) => /^act_\d+$/.test(c.id));
      if (!lista.length) return erro('sem_contas');
      await admin.rpc('atd_meta_sessao_limpar');
      const { data: s, error } = await admin.from('atd_meta_sessao').insert({ organizacao_id: orgId, usuario_id: eu.user.id, token, contas: lista }).select('id').single();
      if (error || !s) return erro('falha_gravar', 500);
      return json({ sessao: s.id, contas: lista.map(({ id, nome, moeda }) => ({ id, nome, moeda })) });
    }

    if (acao === 'conectar') {
      const sessao = String(corpo.sessao ?? ''); const contaId = String(corpo.conta_id ?? '');
      const { data: s } = await admin.from('atd_meta_sessao').select('token, contas, criado_em').eq('id', sessao).eq('organizacao_id', orgId).maybeSingle();
      if (!s || Date.parse(s.criado_em as string) < Date.now() - 15 * 60_000) return erro('sessao_expirada');
      const escolhida = ((s.contas as { id: string; nome: string; moeda: string; fuso: string }[]) ?? []).find((c) => c.id === contaId);
      if (!escolhida) return erro('conta_nao_encontrada');
      const token = s.token as string;
      await graph(`/${contaId}`, token, { fields: 'id,name' }); // a conta ainda responde para este código
      const { error } = await admin.from('atd_meta_conta').upsert({
        organizacao_id: orgId, conta_id: contaId, nome: escolhida.nome, moeda: escolhida.moeda, fuso: escolhida.fuso || null, token,
        conectado_por: eu.user.id, conectado_em: new Date().toISOString(), sincronizado_em: null, erro_sync: null, atualizado_em: new Date().toISOString(),
      }, { onConflict: 'organizacao_id' });
      if (error) return erro('falha_gravar', 500);
      await admin.from('atd_meta_sessao').delete().eq('id', sessao);
      const linhas = await sincronizar(admin, orgId, contaId, token, 30);
      return json({ ok: true, linhas });
    }

    if (acao === 'sincronizar') {
      const { data: c } = await admin.from('atd_meta_conta').select('conta_id, token').eq('organizacao_id', orgId).maybeSingle();
      if (!c) return erro('nao_conectada');
      try { return json({ ok: true, linhas: await sincronizar(admin, orgId, c.conta_id as string, c.token as string, 7) }); }
      catch (e) {
        const cod = e instanceof ErroMeta ? e.codigo : 'falha';
        if (MSG_SYNC[cod]) await admin.from('atd_meta_conta').update({ erro_sync: MSG_SYNC[cod] }).eq('organizacao_id', orgId);
        throw e;
      }
    }

    if (acao === 'desconectar') {
      await admin.from('atd_meta_conta').delete().eq('organizacao_id', orgId);
      await admin.from('atd_meta_sessao').delete().eq('organizacao_id', orgId);
      return json({ ok: true });
    }

    return erro('acao_desconhecida');
  } catch (e) {
    if (e instanceof ErroMeta) return erro(e.codigo, 400);
    return erro(String((e as Error)?.message || 'falha').slice(0, 40), 500);
  }
});
