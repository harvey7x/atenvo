// wa-health-check — teste ativo de saúde do canal WhatsApp (envia p/ número interno autorizado).
// tipo='entrega' (Fase 2): probe de ENTREGA real — envia a canais.entrega_teste_phone (externo autorizado,
//   nunca cliente/self) e confirma pelo ACK (o webhook finaliza o run e classifica entrega_status).
// Chamado pelo pg_cron (automatico) ou pela RPC wa_canal_executar_health_check_manual (manual), sempre
// com header x-health-secret == webhook_config.health_check. Deploy com --no-verify-jwt (auth pelo secret).
// NUNCA envia para cliente: só para canais.health_check_target_phone. Não cria contato/conversa/lead
// (o evolution-webhook marca a msg como ignorado_motivo='health_check'). Falha de INFRA nunca restringe;
// só falha de CONTA (sessão open + provider recusa) escalona: 2 seguidas=atencao, 3 seguidas=restrito.
// tipo='entrega_automatica' (monitoramento): cron a cada minuto; 5 testes/h POR CANAL conectado,
//   espalhados por slot determinístico (agenda.ts) p/ não haver rajada. Pausa 1h sozinho se o canal
//   der 3 ERROR seguidos ou 0 entregas em 5 — sem NUNCA tocar em envio_restrito/atendimento manual.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { estaNaVez, pausaAte, slotDoCanal, TIMEOUT_MIN, type RunResumo } from './agenda.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const EVO_BASE = (Deno.env.get('EVOLUTION_API_URL') ?? '').replace(/\/+$/, '');
const EVO_KEY = Deno.env.get('EVOLUTION_API_KEY') ?? '';

/** Número INTERNO autorizado do monitoramento automático (nunca cliente). */
const ENTREGA_DESTINO = '5551998872825';
const ENTREGA_DESTINO_MASC = '••••2825';
/** O prefixo "Teste de entrega Atenvo" casa com o filtro do webhook ⇒ não vira lead/conversa. */
const ENTREGA_TEXTO = 'Teste de entrega Atenvo: verificação automática do canal.';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type, x-health-secret', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

type EvoRes = { ok: boolean; status: number; data: any; netError?: string };
async function evoCall(path: string, method: 'GET' | 'POST', body?: unknown): Promise<EvoRes> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 20000);
    const res = await fetch(`${EVO_BASE}${path}`, { method, headers: { 'Content-Type': 'application/json', apikey: EVO_KEY }, body: body ? JSON.stringify(body) : undefined, signal: ctrl.signal });
    clearTimeout(t);
    const txt = await res.text();
    let data: any = null; try { data = txt ? JSON.parse(txt) : null; } catch { data = { raw: txt }; }
    return { ok: res.ok, status: res.status, data };
  } catch (e) { return { ok: false, status: 0, data: null, netError: (e as Error)?.message ?? 'network' }; }
}

const nowIso = () => new Date().toISOString();

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    // ---- auth por secret (fonte única: webhook_config.health_check) ----
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const secretHeader = req.headers.get('x-health-secret') ?? '';
    const { data: wc } = await admin.from('webhook_config').select('secret').eq('chave', 'health_check').maybeSingle();
    if (!wc?.secret || secretHeader !== wc.secret) return json({ error: 'unauthorized' }, 401);
    if (!EVO_BASE || !EVO_KEY) return json({ error: 'evolution_nao_configurada' }, 503);

    const body = await req.json().catch(() => ({})) as { canal_id?: string; tipo?: string; criado_por?: string };

    // ============ PROBE DE ENTREGA (Fase 2) — envia a número INTERNO/autorizado e confirma pelo ACK real ============
    // Só canal CONECTADO e com entrega_teste_phone configurado. NUNCA cliente, NUNCA self-send como prova.
    // Grava um run tipo='entrega' PENDENTE; o evolution-webhook finaliza pelo DELIVERY_ACK/READ (ok) ou ERROR
    // (restrito/instavel). NÃO altera envio_restrito nem health_check_status (sessão).
    if (body.tipo === 'entrega') {
      if (!body.canal_id) return json({ error: 'canal_id_obrigatorio' }, 400);
      const { data: c } = await admin.from('canais')
        .select('id, organizacao_id, nome_interno, instancia_externa, status_integracao, entrega_teste_phone, numero_conectado')
        .eq('id', body.canal_id).maybeSingle();
      if (!c) return json({ error: 'canal_nao_encontrado' }, 404);
      if (c.status_integracao !== 'conectado' || !c.instancia_externa) return json({ error: 'canal_nao_conectado', nota: 'probe roda só em canal conectado' }, 409);
      const alvo = (c.entrega_teste_phone ?? '').replace(/\D/g, '');
      if (!alvo) return json({ error: 'entrega_teste_phone_nao_configurado', nota: 'configure o número interno autorizado do canal' }, 409);
      if (alvo === (c.numero_conectado ?? '').replace(/\D/g, '')) return json({ error: 'alvo_igual_ao_proprio_numero', nota: 'self-send não prova entrega; use um número externo autorizado' }, 409);

      const t0 = Date.now();
      const st = await evoCall(`/instance/connectionState/${c.instancia_externa}`, 'GET');
      const state = st.data?.instance?.state ?? null;
      if (state !== 'open') return json({ error: `sessao_${state ?? 'desconhecida'}`, nota: 'sessão não está open' }, 409);

      const texto = 'Teste de entrega Atenvo — não responder';
      const snd = await evoCall(`/message/sendText/${c.instancia_externa}`, 'POST', { number: alvo, text: texto });
      const msgId: string | null = snd.data?.key?.id ?? null;
      const aceito = snd.ok && (!!msgId || !!snd.data?.status);
      const masc = alvo.length > 4 ? '••••' + alvo.slice(-4) : alvo;
      const erroSend = aceito ? null : ((snd.data?.message ?? snd.data?.error ?? snd.netError ?? `send HTTP ${snd.status}`)?.toString?.().slice(0, 200) ?? 'falha_envio');

      await admin.from('canal_health_runs').insert({
        organizacao_id: c.organizacao_id, canal_id: c.id, tipo: 'entrega',
        sucesso: false,                                                       // PENDENTE: só o ACK confirma entrega
        status_resultado: aceito ? 'aguardando_ack' : String(snd.status),
        erro: erroSend, erro_tipo: aceito ? null : 'infra',
        message_id: msgId, instancia_externa: c.instancia_externa, target_phone: masc, latencia_ms: Date.now() - t0,
        dados: { aguardando_ack: aceito, destino_masc: masc }, criado_por: body.criado_por ?? null,
      });

      if (!aceito) return json({ ok: false, tipo: 'entrega', aceito: false, erro: erroSend, destino: masc });
      return json({ ok: true, tipo: 'entrega', aceito: true, pendente: true, message_id: msgId, destino: masc,
        nota: 'Enviado ao número interno; aguardando ACK de entrega (DELIVERY_ACK/ERROR) via webhook.' });
    }

    // ====== MONITORAMENTO AUTOMÁTICO DE ENTREGA (cron a cada minuto) ======
    // 5 testes/h por canal CONECTADO, espalhados por slot determinístico (sem rajada). Envia SÓ ao número
    // interno autorizado; o texto casa com o filtro de health_check do webhook ⇒ não vira lead/conversa.
    // Grava run tipo='entrega_automatica' PENDENTE; o ACK REAL finaliza. NUNCA mexe em envio_restrito.
    if (body.tipo === 'entrega_automatica') {
      const agora = new Date();
      const forcar = body.canal_id ?? null;   // "Rodar teste agora": ignora slot e pausa (ato humano)

      // 1) fecha runs pendentes sem ACK → timeout (preserva o resto de `dados`)
      const limite = new Date(agora.getTime() - TIMEOUT_MIN * 60_000).toISOString();
      const { data: pend } = await admin.from('canal_health_runs')
        .select('id, dados').eq('tipo', 'entrega_automatica').eq('status_resultado', 'aguardando_ack')
        .lt('executado_em', limite);
      for (const p of pend ?? []) {
        await admin.from('canal_health_runs').update({
          status_resultado: 'timeout', erro: `sem ACK em ${TIMEOUT_MIN} min`, erro_tipo: 'timeout',
          dados: { ...((p.dados as Record<string, unknown>) ?? {}), aguardando_ack: false, timeout: true },
        }).eq('id', p.id);
      }

      // 2) canais elegíveis (conectado, ativo, sem conflito, com instância, sem envio_restrito)
      const { data: canais } = await admin.from('canais')
        .select('id, organizacao_id, nome_interno, instancia_externa, numero_conectado')
        .eq('provider', 'evolution').eq('tipo', 'whatsapp').eq('status_integracao', 'conectado')
        .eq('ativo', true).is('conflito_com', null).not('instancia_externa', 'is', null).eq('envio_restrito', false);

      const minuto = agora.getUTCMinutes();
      const resultados: unknown[] = [];
      for (const c of canais ?? []) {
        if (forcar && c.id !== forcar) continue;
        if ((c.numero_conectado ?? '').replace(/\D/g, '') === ENTREGA_DESTINO) {
          resultados.push({ canal: c.nome_interno, pulado: 'self_send' }); continue;   // nunca self-send
        }
        if (!forcar && !estaNaVez(c.id, minuto)) continue;                              // não é a vez deste canal
        const { data: ult } = await admin.from('canal_health_runs')
          .select('status_resultado, executado_em').eq('canal_id', c.id).eq('tipo', 'entrega_automatica')
          .order('executado_em', { ascending: false }).limit(6);
        const pausado = pausaAte((ult ?? []) as RunResumo[], agora.getTime());
        if (pausado && !forcar) { resultados.push({ canal: c.nome_interno, pulado: 'pausado', ate: pausado }); continue; }

        const t0 = Date.now();
        const snd = await evoCall(`/message/sendText/${c.instancia_externa}`, 'POST', { number: ENTREGA_DESTINO, text: ENTREGA_TEXTO });
        const msgId: string | null = snd.data?.key?.id ?? null;
        const aceito = snd.ok && (!!msgId || !!snd.data?.status);
        const erroSend = aceito ? null : ((snd.data?.message ?? snd.data?.error ?? snd.netError ?? `send HTTP ${snd.status}`)?.toString?.().slice(0, 200) ?? 'falha_envio');
        await admin.from('canal_health_runs').insert({
          organizacao_id: c.organizacao_id, canal_id: c.id, tipo: 'entrega_automatica',
          sucesso: false,                                                   // só o ACK REAL confirma entrega
          status_resultado: aceito ? 'aguardando_ack' : String(snd.status),
          erro: erroSend, erro_tipo: aceito ? null : 'infra',
          message_id: msgId, instancia_externa: c.instancia_externa,
          target_phone: ENTREGA_DESTINO_MASC, latencia_ms: Date.now() - t0,
          dados: { aguardando_ack: aceito, destino_masc: ENTREGA_DESTINO_MASC, slot: slotDoCanal(c.id), origem: forcar ? 'manual' : 'cron' },
        });
        resultados.push({ canal: c.nome_interno, enviado: aceito, message_id: msgId, erro: erroSend });
      }
      return json({ ok: true, minuto, timeouts: (pend ?? []).length, resultados });
    }

    const manual = body.tipo === 'manual' && !!body.canal_id;

    // ---- seleção de canais ----
    let q = admin.from('canais').select('id, organizacao_id, nome_interno, instancia_externa, status_integracao, envio_restrito, health_check_enabled, health_check_target_phone, health_check_fail_count, health_check_status, auto_restrict_on_failure').eq('provider', 'evolution');
    if (manual) q = q.eq('id', body.canal_id!);                                    // manual: canal específico (admin já autorizou)
    else q = q.eq('health_check_enabled', true).eq('envio_restrito', false);        // automático: só habilitado e NÃO restrito
    const { data: canais } = await q;

    const resultados: unknown[] = [];
    for (const c of canais ?? []) {
      const t0 = Date.now();
      const alvo = (c.health_check_target_phone ?? '').replace(/\D/g, '');
      let sucesso = false, erro: string | null = null, erroTipo: string | null = null, statusResultado = '', messageId: string | null = null;

      if (!c.instancia_externa) { erro = 'sem_instancia'; erroTipo = 'infra'; }
      else if (!alvo) { erro = 'sem_target_phone'; erroTipo = 'permissao'; }
      else {
        // 1) estado da sessão (não gera falso positivo de conta se estiver reconectando/caído)
        const st = await evoCall(`/instance/connectionState/${c.instancia_externa}`, 'GET');
        const state = st.data?.instance?.state ?? null;
        if (!st.ok || st.status >= 500 || st.netError) { erro = st.netError ?? `connectionState HTTP ${st.status}`; erroTipo = 'infra'; }
        else if (state !== 'open') { erro = `sessao_${state ?? 'desconhecida'}`; erroTipo = 'infra'; } // connecting/close = infra
        else {
          // 2) envio de teste ao número interno
          const texto = `Teste automático Atenvo ${c.nome_interno ?? ''} - ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`;
          const snd = await evoCall(`/message/sendText/${c.instancia_externa}`, 'POST', { number: alvo, text: texto });
          statusResultado = String(snd.status);
          if (snd.ok && (snd.data?.key?.id || snd.data?.status)) { sucesso = true; messageId = snd.data?.key?.id ?? null; }
          else if (snd.netError || snd.status === 0 || snd.status >= 500) { erro = snd.netError ?? `send HTTP ${snd.status}`; erroTipo = 'infra'; }
          else if (snd.status === 401 || snd.status === 403) { erro = `auth ${snd.status}`; erroTipo = 'permissao'; }
          else { erro = (snd.data?.message ?? snd.data?.error ?? `send HTTP ${snd.status}`)?.toString?.().slice(0, 300); erroTipo = 'conta'; } // sessão open + provider recusou = conta
        }
      }
      const latencia = Date.now() - t0;

      // ---- registra run ----
      await admin.from('canal_health_runs').insert({
        organizacao_id: c.organizacao_id, canal_id: c.id, tipo: manual ? 'manual' : 'automatico',
        sucesso, status_resultado: statusResultado || null, erro, erro_tipo: erroTipo, message_id: messageId,
        instancia_externa: c.instancia_externa, target_phone: alvo || null, latencia_ms: latencia,
        dados: { state_check: true }, criado_por: manual ? (body.criado_por ?? null) : null,
      });

      // ---- atualiza saúde do canal ----
      const patch: Record<string, unknown> = { health_check_last_run_at: nowIso(), health_check_last_error: erro };
      if (sucesso) {
        patch.health_check_status = 'saudavel'; patch.health_check_fail_count = 0; patch.health_check_last_success_at = nowIso(); patch.health_check_last_error = null;
      } else if (erroTipo === 'conta') {
        if (manual) { patch.health_check_status = 'falha'; }                        // manual não escalona nem restringe
        else {
          const novo = (c.health_check_fail_count ?? 0) + 1;
          patch.health_check_fail_count = novo;
          if (novo >= 3 && c.auto_restrict_on_failure) {
            patch.health_check_status = 'restrito'; patch.envio_restrito = true; patch.envio_restrito_em = nowIso(); patch.envio_restrito_motivo = `health_check_auto: ${erro}`.slice(0, 300);
            await admin.from('audit_log').insert({ usuario_id: null, acao: 'restringir_envio_canal_auto', entidade: 'canais', entidade_id: c.id, dados_antes: { fail_count: c.health_check_fail_count }, dados_depois: { fail_count: novo, motivo: erro }, organizacao_id: c.organizacao_id });
          } else if (novo >= 2) patch.health_check_status = 'atencao';
          else patch.health_check_status = 'falha';
        }
      } else {
        // infra/permissao: nunca restringe, não incrementa fail_count de conta
        if (c.health_check_status !== 'restrito') patch.health_check_status = 'atencao';
      }
      await admin.from('canais').update(patch).eq('id', c.id);
      resultados.push({ canal: c.nome_interno, sucesso, erro_tipo: erroTipo, erro, latencia_ms: latencia });
    }

    return json({ ok: true, tipo: manual ? 'manual' : 'automatico', testados: resultados.length, resultados });
  } catch (e) { return json({ error: (e as Error)?.message ?? 'erro' }, 500); }
});
