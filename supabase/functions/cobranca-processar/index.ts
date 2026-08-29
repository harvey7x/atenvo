// cobranca-processar — motor de envio do Modo Cobrança (Fase C, 29/08).
// NASCE EM SIMULAÇÃO: dry_run=true (default do schema) vira status
// 'simulada'; o caminho de envio REAL NÃO EXISTE nesta versão — item com
// dry_run=false falha com 'envio_real_desligado'. Ligar envio de verdade
// é decisão explícita do dono (REGRA DURA: nenhum envio sem sim).
// Cadência v1 por TIPO: antes=-3d · cobranca=0 · depois=+2d · remarketing=+7d,
// às 09:00 BRT. Auth dual: cron (x-cobranca-secret) ou JWT de gestor (só a
// própria org, p/ "rodar simulação agora" na aba Envios).
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cobranca-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

const OFFSETS: Record<string, number> = { antes: -3, cobranca: 0, depois: 2, remarketing: 7 };

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
/** data/hora no fuso da operação (BRT) */
function agoraBRT(): Date { return new Date(Date.now() - 3 * 3600_000); }
function hojeBRT(): string { return agoraBRT().toISOString().slice(0, 10); }
function somaDias(iso: string, dias: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}
const brl = (v: number) => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dataBR = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

function render(tpl: string, ctx: Record<string, string>): string {
  return tpl.replace(/\{(nome|valor|vencimento|atendente)\}/g, (_, k) => ctx[k] ?? '');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const admin: SupabaseClient = createClient(
      Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
    const body = await req.json().catch(() => ({}));
    const acao: string = body.acao ?? '';

    // ---- auth dual: secret do cron OU JWT de gestor (restrito à própria org) ----
    let orgFiltro: string | null = null;
    const { data: wc } = await admin.from('webhook_config').select('secret').eq('chave', 'cobranca').maybeSingle();
    const secretOk = !!wc?.secret && safeEqual(req.headers.get('x-cobranca-secret') ?? '', wc.secret as string);
    if (!secretOk) {
      const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
        global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } }, auth: { persistSession: false },
      });
      const { data: au } = await userClient.auth.getUser();
      if (!au?.user) return json({ error: 'unauthorized' }, 401);
      const orgId: string = body.organizacao_id;
      if (!orgId) return json({ error: 'organizacao_id é obrigatório.' }, 400);
      const { data: memb } = await admin.from('organizacao_usuarios')
        .select('papel, status').eq('organizacao_id', orgId).eq('usuario_id', au.user.id).maybeSingle();
      if (!memb || memb.status !== 'ativo' || (memb.papel !== 'admin' && memb.papel !== 'supervisor')) {
        return json({ error: 'Apenas administradores ou supervisores.' }, 403);
      }
      orgFiltro = orgId;
    }

    // =================== ENFILEIRAR ===================
    async function enfileirar(): Promise<Record<string, number>> {
      const hoje = hojeBRT();
      let qMsg = admin.from('cobranca_mensagens')
        .select('id, organizacao_id, tipo, nome, ordem').eq('ativo', true).order('ordem');
      if (orgFiltro) qMsg = qMsg.eq('organizacao_id', orgFiltro);
      const { data: msgs } = await qMsg;
      // 1ª mensagem ativa por org×tipo (índice único da fila segura duplicidade por dia)
      const porOrgTipo = new Map<string, { id: string; organizacao_id: string; tipo: string }>();
      for (const m of msgs ?? []) {
        const k = `${m.organizacao_id}:${m.tipo}`;
        if (!porOrgTipo.has(k)) porOrgTipo.set(k, m as { id: string; organizacao_id: string; tipo: string });
      }
      let criadas = 0, semTelefone = 0, semAtendente = 0, duplicadas = 0;
      for (const msg of porOrgTipo.values()) {
        const alvo = somaDias(hoje, -(OFFSETS[msg.tipo] ?? 0)); // venc + offset = hoje
        const { data: comps } = await admin.from('ciclo_vencimento_competencias')
          .select('ciclo_vencimento_id').eq('organizacao_id', msg.organizacao_id).eq('vencimento', alvo);
        const ciclos = [...new Set((comps ?? []).map((c) => c.ciclo_vencimento_id as string))];
        if (!ciclos.length) continue;
        const { data: cobs } = await admin.from('cobrancas')
          .select('id, contato_id, responsavel_id, valor_mensal, contato:contatos(nome, telefone)')
          .eq('organizacao_id', msg.organizacao_id).eq('status', 'ativo').in('ciclo_vencimento_id', ciclos);
        if (!cobs?.length) continue;
        // itens da mensagem → corpo_final (snapshot legível)
        const { data: itens } = await admin.from('cobranca_mensagem_itens')
          .select('ordem, tipo, corpo, midia_nome').eq('mensagem_id', msg.id).order('ordem');
        const { data: nums } = await admin.from('cobranca_numeros')
          .select('atendente_id, estado').eq('organizacao_id', msg.organizacao_id).eq('estado', 'conectado');
        const conectados = new Set((nums ?? []).map((n) => n.atendente_id as string));
        const respIds = [...new Set(cobs.map((c) => c.responsavel_id).filter(Boolean))] as string[];
        const { data: us } = respIds.length
          ? await admin.from('usuarios').select('id, nome').in('id', respIds)
          : { data: [] };
        const nomeAt = new Map((us ?? []).map((u) => [u.id as string, u.nome as string]));

        for (const c of cobs) {
          const ct = c.contato as unknown as { nome: string | null; telefone: string | null } | null;
          if (!ct?.telefone) { semTelefone++; continue; }
          const ctx = {
            nome: (ct.nome ?? 'cliente').split(' ')[0],
            valor: brl(Number(c.valor_mensal ?? 0)),
            vencimento: dataBR(alvo),
            atendente: (c.responsavel_id && nomeAt.get(c.responsavel_id as string)) || 'nossa equipe',
          };
          const corpo = (itens ?? []).map((i) =>
            i.tipo === 'texto' ? render(i.corpo ?? '', ctx) : `[${i.tipo}: ${i.midia_nome ?? 'arquivo'}]${i.corpo ? ' ' + render(i.corpo, ctx) : ''}`,
          ).join('\n— · —\n');
          const temNumero = !!c.responsavel_id && conectados.has(c.responsavel_id as string);
          if (!temNumero) semAtendente++;
          const { error } = await admin.from('cobranca_fila').insert({
            organizacao_id: msg.organizacao_id, cobranca_id: c.id, contato_id: c.contato_id,
            mensagem_id: msg.id, tipo: msg.tipo,
            executar_em: `${hoje}T12:00:00Z`,                       // 09:00 BRT
            status: 'pendente', dry_run: true,                      // SEMPRE nasce simulando
            corpo_final: corpo,
            ultimo_erro: temNumero ? null : 'sem_numero_atendente',
          });
          if (error) { if (/duplicate|unique/i.test(error.message)) duplicadas++; }
          else criadas++;
        }
      }
      return { criadas, duplicadas, sem_telefone: semTelefone, sem_numero_atendente: semAtendente };
    }

    // =================== PROCESSAR ===================
    async function processar(): Promise<Record<string, number>> {
      const h = agoraBRT().getUTCHours();
      if (h < 8 || h >= 20) return { fora_da_janela: 1, simuladas: 0 };
      let q = admin.from('cobranca_fila').select('id, contato_id, dry_run')
        .eq('status', 'pendente').lte('executar_em', new Date().toISOString()).limit(200);
      if (orgFiltro) q = q.eq('organizacao_id', orgFiltro);
      const { data: fila } = await q;
      if (!fila?.length) return { simuladas: 0, bloqueadas_optout: 0, falhas: 0 };
      const ids = fila.map((f) => f.id as string);
      await admin.from('cobranca_fila').update({ status: 'processando' }).in('id', ids);
      let simuladas = 0, bloqueadas = 0, falhas = 0;
      for (const f of fila) {
        // opt-out CONSERVADOR: se o contato pediu SAIR em qualquer canal, não cobra
        const { data: opt } = await admin.from('wa_optout').select('contato_id').eq('contato_id', f.contato_id).limit(1);
        if (opt?.length) {
          await admin.from('cobranca_fila').update({ status: 'bloqueada_optout' }).eq('id', f.id);
          bloqueadas++; continue;
        }
        if (f.dry_run) {
          await admin.from('cobranca_fila').update({ status: 'simulada' }).eq('id', f.id);
          simuladas++; continue;
        }
        // envio REAL deliberadamente inexistente nesta versão
        await admin.from('cobranca_fila').update({ status: 'falhou', ultimo_erro: 'envio_real_desligado' }).eq('id', f.id);
        falhas++;
      }
      return { simuladas, bloqueadas_optout: bloqueadas, falhas };
    }

    if (acao === 'enfileirar') return json({ ok: true, ...(await enfileirar()) });
    if (acao === 'processar') return json({ ok: true, ...(await processar()) });
    if (acao === 'ciclo') {
      const e = await enfileirar();
      const p = await processar();
      return json({ ok: true, enfileirar: e, processar: p });
    }
    return json({ error: 'Ação inválida.' }, 400);
  } catch (e) {
    return json({ error: (e as Error).message ?? 'Erro inesperado.' }, 500);
  }
});
