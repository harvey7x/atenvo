// bot-runner — motor do bot de atendimento inicial. MODO SEGURO:
//  * dry_run=true por DEFAULT (não envia nada à Evolution; grava outbox como 'simulada').
//  * auth por x-bot-secret == webhook_config.bot_runner. Deploy com --no-verify-jwt.
//  * NÃO é chamado pelo webhook (B3, sob nova aprovação). Master global segue OFF;
//    em teste passa-se force=true (com dry_run) para exercitar a máquina sem enviar.
//  * Pausa se humano assumir/responder ou se o cliente mandar áudio (sem transcrição).
//  * Coleta de nome -> atualiza contato com segurança + Kanban idempotente. CPF nunca completo em nota/UI.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  DEFAULT_COPY, decideProximo, calcularDelays, avaliarLeadQuente, montarResumo, primeiroNome,
  type Copy, type Etapa,
} from './fluxo.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const EVO_BASE = (Deno.env.get('EVOLUTION_API_URL') ?? '').replace(/\/+$/, '');
const EVO_KEY = Deno.env.get('EVOLUTION_API_KEY') ?? '';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type, x-bot-secret', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, Math.max(0, ms)));

async function evoSendText(instancia: string, numero: string, texto: string): Promise<{ ok: boolean; id?: string; erro?: string }> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 20000);
    const res = await fetch(`${EVO_BASE}/message/sendText/${instancia}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', apikey: EVO_KEY },
      body: JSON.stringify({ number: numero, text: texto }), signal: ctrl.signal,
    });
    clearTimeout(t);
    const txt = await res.text();
    let data: any = null; try { data = txt ? JSON.parse(txt) : null; } catch { data = { raw: txt }; }
    if (res.ok && (data?.key?.id || data?.status)) return { ok: true, id: data?.key?.id ?? null };
    return { ok: false, erro: (data?.message ?? data?.error ?? `HTTP ${res.status}`)?.toString?.().slice(0, 300) };
  } catch (e) { return { ok: false, erro: (e as Error)?.message ?? 'network' }; }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // ---- auth por secret ----
    const secretHeader = req.headers.get('x-bot-secret') ?? '';
    const { data: wc } = await admin.from('webhook_config').select('secret').eq('chave', 'bot_runner').maybeSingle();
    if (!wc?.secret || secretHeader !== wc.secret) return json({ error: 'unauthorized' }, 401);

    const body = await req.json().catch(() => ({})) as {
      conversa_id?: string; inbound_text?: string; inbound_tipo?: string; inbound_msg_id?: string;
      dry_run?: boolean; force?: boolean; start?: boolean;
    };
    const dryRun = body.dry_run !== false;      // DEFAULT seguro: dry_run=true
    const force = body.force === true;
    if (!body.conversa_id) return json({ error: 'conversa_id_obrigatorio' }, 400);
    const conversaId = body.conversa_id;

    // ---- estado + contexto ----
    const { data: estado } = await admin.rpc('bot_estado_get_or_create', { p_conversa: conversaId });
    if (!estado) return json({ error: 'conversa_inexistente' }, 404);
    if (estado.pausado) return json({ ok: true, skipped: 'ja_pausado', motivo: estado.motivo_pausa });

    const { data: conv } = await admin.from('conversas')
      .select('id, organizacao_id, contato_id, canal_id, atendente_id').eq('id', conversaId).maybeSingle();
    if (!conv) return json({ error: 'conversa_inexistente' }, 404);
    const { data: canal } = await admin.from('canais')
      .select('id, nome_interno, instancia_externa, origem_tipo').eq('id', conv.canal_id).maybeSingle();
    const { data: cfg } = await admin.from('bot_canal_config')
      .select('mensagens, intervalo_min_ms, intervalo_max_ms').eq('canal_id', conv.canal_id).maybeSingle();
    const { data: cfgOrg } = await admin.from('bot_config')
      .select('intervalo_min_ms, intervalo_max_ms').eq('organizacao_id', conv.organizacao_id).maybeSingle();

    const copy: Copy = (cfg?.mensagens as Copy) ?? DEFAULT_COPY;
    const min = cfg?.intervalo_min_ms ?? cfgOrg?.intervalo_min_ms ?? 1800;
    const max = cfg?.intervalo_max_ms ?? cfgOrg?.intervalo_max_ms ?? 3500;
    const canalNome = canal?.nome_interno ?? '—';
    const origem = canal?.origem_tipo ?? 'WhatsApp';
    const dados = (estado.dados_qualificacao ?? {}) as Record<string, unknown>;

    // ---- pausa por humano (atendente atribuído OU resposta humana) ----
    const { data: humano } = await admin.from('mensagens')
      .select('id, autor_id, origem, tipo').eq('conversa_id', conversaId).eq('direcao', 'saida').limit(50);
    const houveHumano = conv.atendente_id != null || (humano ?? []).some((m: any) =>
      (m.autor_id != null && !['sistema', 'nota_interna'].includes(m.tipo)) || (m.autor_id == null && m.origem === 'telefone'));
    if (houveHumano) {
      const { texto, json: rj } = montarResumo({ dados, canalNome, origem, etapa: estado.etapa, leadQuente: estado.lead_quente, leadQuenteMotivos: estado.lead_quente_motivos ?? [] });
      await admin.rpc('bot_pausar', { p_conversa: conversaId, p_motivo: 'humano_assumiu', p_resumo_texto: texto, p_resumo_json: rj });
      return json({ ok: true, paused: 'humano_assumiu', dry_run: dryRun });
    }

    // ---- pausa por áudio (envia 1 aviso, para, entrega ao humano; sem transcrição) ----
    if (body.inbound_tipo === 'audio') {
      const rows = await enfileirar(admin, conversaId, conv.canal_id, 'audio', [copy.audio], calcularDelays(1, min, max));
      const enviados = await drenar(admin, rows, dryRun, canal, conv);
      const { texto, json: rj } = montarResumo({ dados, canalNome, origem, etapa: estado.etapa, leadQuente: estado.lead_quente, leadQuenteMotivos: estado.lead_quente_motivos ?? [] });
      await admin.rpc('bot_pausar', { p_conversa: conversaId, p_motivo: 'audio', p_resumo_texto: texto, p_resumo_json: rj });
      return json({ ok: true, paused: 'audio', dry_run: dryRun, mensagens: [copy.audio], enviados_reais: enviados });
    }

    // ---- elegibilidade (não bloqueia teste com force; produção exigirá elegivel) ----
    const { data: eleg } = await admin.rpc('bot_pode_atuar', { p_conversa: conversaId });
    if (!eleg?.elegivel && !force) return json({ ok: true, skipped: 'inelegivel', elegibilidade: eleg });

    // ---- decide a etapa ----
    const etapaAtual = (body.start ? 'inicio' : estado.etapa) as Etapa | 'inicio';
    const dec = decideProximo(etapaAtual, body.inbound_text ?? '', dados);

    // validação falhou (nome/CPF): reprompt 1x, senão segue com "não informado"
    if (!dec.valid) {
      const reprompts = estado.reprompts ?? 0;
      if (reprompts < 1) {
        const key = dec.reprompt ?? 'generico';
        const rows = await enfileirar(admin, conversaId, conv.canal_id, `reprompt_${etapaAtual}_${reprompts}`, [copy.reprompt[key]], calcularDelays(1, min, max));
        const enviados = await drenar(admin, rows, dryRun, canal, conv);
        await admin.rpc('bot_avancar_etapa', { p_conversa: conversaId, p_etapa: etapaAtual, p_dados: {}, p_reprompts: reprompts + 1, p_inbound_msg: body.inbound_msg_id ?? null });
        return json({ ok: true, dry_run: dryRun, etapa: etapaAtual, reprompt: key, mensagens: [copy.reprompt[key]], enviados_reais: enviados });
      }
      // já reprovou 1x: aceita como "não informado" e força avanço
      dec.valid = true; dec.dados = { [`${etapaAtual}_status`]: 'nao_informado' };
      dec.copyKey = etapaAtual === 'aguardando_nome' ? 'apos_banco' : 'apos_cpf'; // segue pedindo próximo passo
    }

    // ---- ações de coleta (nome/CPF/lead quente) ----
    let primeiro = '';
    if (dec.acoes.coletarNome) {
      await admin.rpc('bot_coletar_nome', { p_conversa: conversaId, p_nome: dec.acoes.coletarNome });
      primeiro = primeiroNome(dec.acoes.coletarNome);
    }
    if (dec.acoes.coletarCpf) {
      await admin.rpc('bot_registrar_cpf', { p_conversa: conversaId, p_cpf_digits: dec.acoes.coletarCpf.digits, p_cpf_mascarado: dec.acoes.coletarCpf.mascarado });
    }
    const motivosLQ = Array.from(new Set([...(dec.leadQuenteMotivos ?? []), ...avaliarLeadQuente({ ...dados, ...dec.dados }, body.inbound_text ?? '')]));
    if (motivosLQ.length > 0) await admin.rpc('bot_marcar_lead_quente', { p_conversa: conversaId, p_motivos: motivosLQ });

    // ---- monta mensagens do burst ----
    const brutos = dec.copyKey ? (copy[dec.copyKey] as string[]) : [];
    const mensagens = brutos.map((m) => m.replaceAll('{primeiro_nome}', primeiro || 'tudo bem'));

    // ---- enfileira + drena (dry_run => 'simulada', sem envio) ----
    const rows = mensagens.length ? await enfileirar(admin, conversaId, conv.canal_id, dec.copyKey as string, mensagens, calcularDelays(mensagens.length, min, max)) : [];
    const enviados = await drenar(admin, rows, dryRun, canal, conv);

    // ---- avança etapa / conclui ----
    await admin.rpc('bot_avancar_etapa', { p_conversa: conversaId, p_etapa: dec.proximaEtapa, p_dados: dec.dados, p_reprompts: 0, p_inbound_msg: body.inbound_msg_id ?? null });

    let resumo: unknown = undefined;
    if (dec.concluir) {
      const dadosFinais = { ...dados, ...dec.dados };
      const lq = motivosLQ.length > 0 || estado.lead_quente;
      const r = montarResumo({ dados: dadosFinais, canalNome, origem, etapa: 'concluido', leadQuente: lq, leadQuenteMotivos: motivosLQ });
      await admin.rpc('bot_concluir', { p_conversa: conversaId, p_resumo_texto: r.texto, p_resumo_json: r.json });
      resumo = r.json;
    }

    return json({
      ok: true, dry_run: dryRun, elegibilidade: eleg,
      etapa_anterior: etapaAtual, etapa_nova: dec.proximaEtapa,
      acoes: dec.acoes, lead_quente_motivos: motivosLQ,
      mensagens, enviados_reais: enviados, resumo,
    });
  } catch (e) { return json({ error: (e as Error)?.message ?? 'erro' }, 500); }
});

// ---- helpers de outbox ----
async function enfileirar(admin: any, conversaId: string, canalId: string, etapa: string, textos: string[], delays: number[]) {
  const { data, error } = await admin.rpc('bot_enfileirar', { p_conversa: conversaId, p_canal: canalId, p_etapa: etapa, p_textos: textos, p_delays_ms: delays });
  if (error) throw new Error(error.message);
  return (data ?? []) as Array<{ id: string; ordem: number; texto: string; enviar_apos: string }>;
}

async function drenar(admin: any, rows: Array<{ id: string; ordem: number; texto: string; enviar_apos: string }>, dryRun: boolean, canal: any, conv: any): Promise<number> {
  let enviados = 0;
  const ordenadas = [...rows].sort((a, b) => a.ordem - b.ordem);
  // destino (só necessário para envio real)
  let destino: string | null = null;
  if (!dryRun) {
    const { data: ident } = await admin.from('contato_identidades')
      .select('valor_normalizado').eq('contato_id', conv.contato_id).eq('tipo', 'whatsapp')
      .not('valor_normalizado', 'is', null).order('principal', { ascending: false }).limit(1).maybeSingle();
    destino = ident?.valor_normalizado ?? null;
  }
  for (const row of ordenadas) {
    if (dryRun) { await admin.rpc('bot_registrar_envio', { p_saida: row.id, p_status: 'simulada' }); continue; }
    const espera = new Date(row.enviar_apos).getTime() - Date.now();
    await sleep(espera);
    if (!canal?.instancia_externa || !destino) {
      await admin.rpc('bot_registrar_envio', { p_saida: row.id, p_status: 'falhou', p_erro: !destino ? 'sem_destino' : 'sem_instancia' });
      continue;
    }
    const r = await evoSendText(canal.instancia_externa, destino, row.texto);
    if (r.ok) {
      const { data: msg } = await admin.from('mensagens').insert({
        organizacao_id: conv.organizacao_id, conversa_id: conv.id, direcao: 'saida', tipo: 'texto',
        conteudo: row.texto, autor_id: null, origem: 'bot', status: 'enviada', id_externo: r.id,
      }).select('id').maybeSingle();
      await admin.rpc('bot_registrar_envio', { p_saida: row.id, p_status: 'enviada', p_mensagem: msg?.id ?? null, p_id_externo: r.id ?? null });
      enviados++;
    } else {
      await admin.rpc('bot_registrar_envio', { p_saida: row.id, p_status: 'falhou', p_erro: r.erro ?? 'falha_envio' });
    }
  }
  return enviados;
}
