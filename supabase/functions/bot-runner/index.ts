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
  validarNome, extrairCpf,
  type Copy, type Etapa,
} from './fluxo.ts';
import { gerarResposta, transcreverAudio, pareceDificil, parseEstado, type Msg } from './ia.ts';
import { systemMatheo } from './prompt.ts';
import { saidaSuja } from './guardrail.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const EVO_BASE = (Deno.env.get('EVOLUTION_API_URL') ?? '').replace(/\/+$/, '');
const EVO_KEY = Deno.env.get('EVOLUTION_API_KEY') ?? '';
// Fluxo por IA (default LIGADO). Se cair (quota/crédito/timeout), o index usa o copy determinístico.
const IA_ATIVA = (Deno.env.get('IA_ATIVA') ?? 'sim').toLowerCase() === 'sim';

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
      inbound_audio_b64?: string; inbound_audio_mime?: string; // áudio p/ transcrição (opcional; webhook passa quando houver)
      dry_run?: boolean; force?: boolean; start?: boolean;
    };
    const dryRun = body.dry_run !== false;      // DEFAULT seguro: dry_run=true
    const force = body.force === true;
    if (!body.conversa_id) return json({ error: 'conversa_id_obrigatorio' }, 400);
    const conversaId = body.conversa_id;

    // ---- estado + conversa (com responsavel_id + precisa_humano) ----
    const { data: estado } = await admin.rpc('bot_estado_get_or_create', { p_conversa: conversaId });
    if (!estado) return json({ error: 'conversa_inexistente' }, 404);
    const { data: conv } = await admin.from('conversas')
      .select('id, organizacao_id, contato_id, canal_id, atendente_id, precisa_humano, contatos(responsavel_id)').eq('id', conversaId).maybeSingle();
    if (!conv) return json({ error: 'conversa_inexistente' }, 404);
    const responsavelId = (Array.isArray(conv.contatos) ? conv.contatos[0]?.responsavel_id : (conv.contatos as any)?.responsavel_id) ?? null;
    const logRunner = async (outcome: string, motivo?: string | null, extra: Record<string, unknown> = {}) => {
      try { await admin.from('audit_log').insert({ usuario_id: null, acao: 'bot_runner', entidade: 'conversas', entidade_id: conversaId, dados_depois: { outcome, motivo: motivo ?? null, dry_run: dryRun, ...extra }, organizacao_id: conv.organizacao_id }); } catch { /* log best-effort */ }
    };

    // ---- guardas (antes de qualquer trabalho) ----
    if (estado.pausado) { await logRunner('bot_ignorado', 'ja_pausado'); return json({ ok: true, skipped: 'ja_pausado', motivo: estado.motivo_pausa }); }
    // idempotência: mesmo inbound já processado nesta conversa
    if (!body.start && body.inbound_msg_id && estado.ultimo_inbound_msg_id === body.inbound_msg_id) {
      await logRunner('inbound_duplicado', body.inbound_msg_id); return json({ ok: true, skipped: 'inbound_duplicado' });
    }
    // precisa_humano: não responde (preserva a flag; não pausa)
    if (conv.precisa_humano) { await logRunner('bot_ignorado', 'precisa_humano'); return json({ ok: true, skipped: 'precisa_humano' }); }
    // lock por conversa (lease 30s): evita execução concorrente
    const { data: claimed } = await admin.rpc('bot_claim_conversa', { p_conversa: conversaId, p_ttl_seg: 30 });
    if (!claimed) { await logRunner('lock_ativo', 'execucao_concorrente'); return json({ ok: true, skipped: 'lock_ativo' }); }
    try {
    try {
    // B3.4: gancho de falha CONTROLADA (só via x-bot-secret; o webhook nunca envia). Prova o caminho
    // bot_falhou: cai no catch (loga + retorna 200) e o finally libera o lock. Inerte em produção.
    if ((body as { _forcar_falha?: boolean })._forcar_falha) throw new Error('falha_controlada_teste');
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
    const houveHumano = conv.atendente_id != null || responsavelId != null || (humano ?? []).some((m: any) =>
      (m.autor_id != null && !['sistema', 'nota_interna'].includes(m.tipo)) || (m.autor_id == null && m.origem === 'telefone'));
    if (houveHumano) {
      const { texto, json: rj } = montarResumo({ dados, canalNome, origem, etapa: estado.etapa, leadQuente: estado.lead_quente, leadQuenteMotivos: estado.lead_quente_motivos ?? [] });
      await admin.rpc('bot_pausar', { p_conversa: conversaId, p_motivo: 'humano_assumiu', p_resumo_texto: texto, p_resumo_json: rj });
      await logRunner('bot_ignorado', 'humano_assumiu');
      return json({ ok: true, paused: 'humano_assumiu', dry_run: dryRun });
    }

    // ---- elegibilidade (fonte de verdade: master/canal/saúde/nova/opp/destino). Bloqueia ANTES do áudio:
    //      "bot off = nada acontece" (master off, canal não habilitado, humano, precisa_humano → ignora). ----
    const { data: eleg } = await admin.rpc('bot_pode_atuar', { p_conversa: conversaId });
    if (!eleg?.elegivel && !force) { await logRunner('bot_ignorado', eleg?.motivo ?? 'inelegivel'); return json({ ok: true, skipped: 'inelegivel', elegibilidade: eleg }); }

    // ---- áudio: tenta transcrever (Gemini). Sucesso → trata como texto. Falha/sem base64 → comportamento atual (aviso + pausa) ----
    let inboundText = body.inbound_text ?? '';
    if (body.inbound_tipo === 'audio') {
      const temB64 = !!body.inbound_audio_b64;
      const transcrito = body.inbound_audio_b64 ? await transcreverAudio(body.inbound_audio_b64, body.inbound_audio_mime) : null;
      if (transcrito) {
        inboundText = transcrito; // segue o fluxo como se fosse texto
        await logRunner('audio_transcrito', null, { chars: transcrito.length });
      } else {
        // base64 veio mas a transcrição voltou vazia (quota/áudio corrompido/formato) → visível no audit_log,
        // distinto de "áudio grande/não-fiado" (sem base64). Em ambos, cai no aviso+pausa abaixo (nunca silêncio).
        if (temB64) await logRunner('audio_transcricao_falhou', body.inbound_audio_mime ?? null);
        const rows = await enfileirar(admin, conversaId, conv.canal_id, 'audio', [copy.audio], calcularDelays(1, min, max));
        const enviados = await drenar(admin, rows, dryRun, canal, conv);
        const { texto, json: rj } = montarResumo({ dados, canalNome, origem, etapa: estado.etapa, leadQuente: estado.lead_quente, leadQuenteMotivos: estado.lead_quente_motivos ?? [] });
        await admin.rpc('bot_pausar', { p_conversa: conversaId, p_motivo: 'audio', p_resumo_texto: texto, p_resumo_json: rj });
        await logRunner('bot_ignorado', 'audio');
        return json({ ok: true, paused: 'audio', dry_run: dryRun, mensagens: [copy.audio], enviados_reais: enviados });
      }
    }

    // ======== FLUXO POR IA (plano A) — se cair/desligado, segue pro determinístico (plano B) abaixo ========
    if (IA_ATIVA) {
      const respostaIa = await tratarComIA({
        admin, conversaId, conv, canal, estado, dados, copy, min, max,
        inboundText, inboundMsgId: body.inbound_msg_id ?? null, dryRun, canalNome, origem, logRunner,
      }).catch(async (e) => { await logRunner('ia_indisponivel', (e as Error)?.message?.slice(0, 160)); return null; });
      if (respostaIa) return respostaIa;
      // respostaIa === null → IA fora do ar ou guardrail barrou 2x → cai no determinístico (rede de segurança)
    }

    // ---- decide a etapa (DETERMINÍSTICO — rede de segurança) ----
    const etapaAtual = (body.start ? 'inicio' : (estado.etapa === 'ia' ? 'inicio' : estado.etapa)) as Etapa | 'inicio';
    const dec = decideProximo(etapaAtual, inboundText, dados);

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
    const motivosLQ = Array.from(new Set([...(dec.leadQuenteMotivos ?? []), ...avaliarLeadQuente({ ...dados, ...dec.dados }, inboundText)]));
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

    await logRunner('bot_respondeu', null, { mensagens: mensagens.length, enviados_reais: enviados, etapa_nova: dec.proximaEtapa });
    return json({
      ok: true, dry_run: dryRun, elegibilidade: eleg,
      etapa_anterior: etapaAtual, etapa_nova: dec.proximaEtapa,
      acoes: dec.acoes, lead_quente_motivos: motivosLQ,
      mensagens, enviados_reais: enviados, resumo,
    });
    } catch (e) {
      await logRunner('bot_falhou', (e as Error)?.message?.slice(0, 200));
      return json({ ok: false, skipped: 'bot_falhou', erro: (e as Error)?.message?.slice(0, 200) }, 200);
    }
    } finally {
      await admin.rpc('bot_release_conversa', { p_conversa: conversaId });
    }
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

// ---- histórico da conversa -> mensagens p/ a IA (últimas ~20; só texto do lead e do bot) ----
async function carregarHistorico(admin: any, conversaId: string): Promise<Msg[]> {
  const { data } = await admin.from('mensagens')
    .select('direcao, tipo, conteudo, origem, criado_em').eq('conversa_id', conversaId)
    .eq('tipo', 'texto').order('criado_em', { ascending: true }).limit(40);
  const msgs: Msg[] = [];
  for (const m of (data ?? []) as any[]) {
    if (!m.conteudo) continue;
    if (m.direcao === 'entrada') msgs.push({ role: 'user', content: String(m.conteudo) });
    else if (m.direcao === 'saida' && m.origem === 'bot') msgs.push({ role: 'assistant', content: String(m.conteudo) });
  }
  return msgs.slice(-20);
}

// ---- move a oportunidade para a coluna do funil pelo NOME (PRESENCIAL / REUNIÃO MARCADA / LEAD NOVO) ----
async function moverColunaPorNome(admin: any, oppId: string, nomeColuna: string): Promise<void> {
  const { data: opp } = await admin.from('oportunidades').select('funil_id').eq('id', oppId).maybeSingle();
  if (!opp?.funil_id) return;
  const { data: col } = await admin.from('funil_colunas').select('id')
    .eq('funil_id', opp.funil_id).eq('nome', nomeColuna).eq('arquivada', false).maybeSingle();
  if (col?.id) await admin.from('oportunidades').update({ coluna_id: col.id }).eq('id', oppId);
}

// ======== FLUXO POR IA: gera resposta, passa pelo GUARDRAIL, persiste estado, roteia desfecho ========
// Retorna a Response quando responde; retorna null quando a IA cai ou o guardrail barra 2x
// (o chamador então usa o copy determinístico — a máquina de estados é a REDE DE SEGURANÇA).
async function tratarComIA(p: {
  admin: any; conversaId: string; conv: any; canal: any; estado: any; dados: Record<string, unknown>;
  copy: Copy; min: number; max: number; inboundText: string; inboundMsgId: string | null; dryRun: boolean;
  canalNome: string; origem: string; logRunner: (o: string, m?: string | null, e?: Record<string, unknown>) => Promise<void>;
}): Promise<Response | null> {
  const { admin, conversaId, conv, canal, estado, dados, min, max, inboundText, inboundMsgId, dryRun, canalNome, origem, logRunner } = p;

  // 1) histórico -> messages (+ inbound atual se ainda não estiver lá)
  const messages = await carregarHistorico(admin, conversaId);
  if (inboundText && (!messages.length || messages[messages.length - 1].content !== inboundText)) {
    messages.push({ role: 'user', content: inboundText });
  }
  if (!messages.length) messages.push({ role: 'user', content: 'Oi' }); // seed p/ abertura

  // 2) contexto (não repetir o que já sabe)
  const ctx: string[] = [];
  if (dados.nome_completo) ctx.push(`nome=${dados.nome_completo}`);
  if (dados.cpf_mascarado) ctx.push('cpf=ja_informado');
  if (dados.banco) ctx.push(`banco=${dados.banco}`);
  if (Array.isArray(dados.financeiras) && (dados.financeiras as string[]).length) ctx.push(`financeiras=${(dados.financeiras as string[]).join('/')}`);
  const system = systemMatheo(ctx.join(', ') || null);

  // 3) gera (Claude p/ difícil, Gemini p/ simples). Se ambos caírem, LANÇA -> chamador cai no determinístico.
  const dificil = pareceDificil(inboundText, dados, messages);
  let resposta = await gerarResposta({ messages, system, dificil });

  // 4) GUARDRAIL: separa texto/estado; sujo -> regenera 1x; ainda sujo -> descarta (null -> determinístico)
  let { texto, estado: est } = parseEstado(resposta);
  let violou = saidaSuja(texto);
  if (violou) {
    await logRunner('bot_guardrail', violou, { tentativa: 1, texto: texto.slice(0, 200) });
    const reforco = system + `\n\n⚠️ Você violou uma trava (${violou}): nunca cite valores, percentuais, prazos ou garantias. Reescreva sem isso.`;
    resposta = await gerarResposta({ messages, system: reforco, dificil: true });
    ({ texto, estado: est } = parseEstado(resposta));
    violou = saidaSuja(texto);
    if (violou) { await logRunner('bot_guardrail', violou, { tentativa: 2, descartado: true, texto: texto.slice(0, 200) }); return null; }
  }

  // 5) merge estado -> dados (SEM CPF cru: PII só via bot_registrar_cpf)
  const merge: Record<string, unknown> = {};
  if (est?.nome_completo) merge.nome_completo = est.nome_completo;
  if (est?.genero) merge.genero = est.genero;
  if (est?.banco) merge.banco = est.banco;
  if (Array.isArray(est?.financeiras) && est!.financeiras!.length) merge.financeiras = est!.financeiras;
  if (typeof est?.tem_emprestimo === 'boolean') merge.tem_emprestimo = est!.tem_emprestimo;
  if (typeof est?.interesse === 'boolean') merge.interesse = est!.interesse;
  if (est?.desfecho) merge.desfecho = est.desfecho;
  if (est?.dia_horario) merge.dia_horario = est.dia_horario;
  if (est?.resumo) merge.resumo = est.resumo;

  // 6) coletas (nome cria opp; cpf grava PII no contato + mascarado no estado)
  if (est?.nome_completo && validarNome(est.nome_completo)) {
    await admin.rpc('bot_coletar_nome', { p_conversa: conversaId, p_nome: est.nome_completo.trim() });
  }
  if (est?.cpf) {
    const cpf = extrairCpf(est.cpf);
    if (cpf.valido) await admin.rpc('bot_registrar_cpf', { p_conversa: conversaId, p_cpf_digits: cpf.digits, p_cpf_mascarado: cpf.mascarado });
  }

  // 7) lead quente: financeira-chave OU aceitou o presencial
  const fins = (Array.isArray(est?.financeiras) ? est!.financeiras! : []).map((s) => String(s).toLowerCase());
  const motivosLQ: string[] = [];
  if (fins.includes('agibank')) motivosLQ.push('citou_agibank');
  if (fins.includes('bmg')) motivosLQ.push('citou_bmg');
  if (fins.includes('facta')) motivosLQ.push('citou_facta');
  if (est?.desfecho === 'escritorio') motivosLQ.push('quer_presencial');
  if (motivosLQ.length) await admin.rpc('bot_marcar_lead_quente', { p_conversa: conversaId, p_motivos: motivosLQ });

  // 8) avança etapa 'ia' + merge + inbound (idempotência)
  await admin.rpc('bot_avancar_etapa', { p_conversa: conversaId, p_etapa: 'ia', p_dados: merge, p_reprompts: 0, p_inbound_msg: inboundMsgId });

  // 9) balões -> outbox (etapa ÚNICA por turno p/ não colidir no unique(conversa,etapa,ordem)) -> drena
  const baloes = texto.split(/\s*\|\|\s*/).map((s) => s.trim()).filter(Boolean).slice(0, 4);
  const tag = `ia_${inboundMsgId ?? Date.now()}`;
  const rows = baloes.length ? await enfileirar(admin, conversaId, conv.canal_id, tag, baloes, calcularDelays(baloes.length, min, max)) : [];
  const enviados = await drenar(admin, rows, dryRun, canal, conv);

  // 10) oportunidade + resumo: relê estado fresco (nome/cpf/opp já persistidos pelas RPCs acima)
  const { data: estFresh } = await admin.from('bot_conversa_estado').select('oportunidade_id, dados_qualificacao').eq('conversa_id', conversaId).maybeSingle();
  const oppId = estFresh?.oportunidade_id ?? null;
  const dadosFinais = (estFresh?.dados_qualificacao ?? { ...dados, ...merge }) as Record<string, unknown>;
  if (oppId && (est?.banco || fins.length)) {
    const patch: Record<string, unknown> = {};
    if (est?.banco) patch.instituicao = est.banco;      // banco -> instituicao
    if (fins.length) patch.etiquetas = fins;            // financeiras -> etiquetas
    if (Object.keys(patch).length) await admin.from('oportunidades').update(patch).eq('id', oppId);
  }

  // 11) desfecho / opt-out / humano
  if (est?.optout) {
    await admin.rpc('bot_pausar', { p_conversa: conversaId, p_motivo: 'optout' });
    await logRunner('bot_respondeu', 'optout', { mensagens: baloes.length, enviados_reais: enviados });
    return json({ ok: true, dry_run: dryRun, etapa_nova: 'ia', desfecho: 'optout', mensagens: baloes, enviados_reais: enviados });
  }
  if (est?.desfecho === 'atendente' || est?.quer_humano) {
    if (oppId) await moverColunaPorNome(admin, oppId, 'LEAD NOVO');
    await admin.from('conversas').update({ precisa_humano: true, precisa_humano_motivo: 'bot_encaminhou', precisa_humano_em: new Date().toISOString() }).eq('id', conversaId);
    await logRunner('bot_respondeu', 'encaminhou_humano', { mensagens: baloes.length, enviados_reais: enviados });
    return json({ ok: true, dry_run: dryRun, etapa_nova: 'ia', desfecho: 'atendente', mensagens: baloes, enviados_reais: enviados });
  }
  if (est?.desfecho === 'escritorio' || est?.desfecho === 'reuniao') {
    if (oppId) await moverColunaPorNome(admin, oppId, est.desfecho === 'escritorio' ? 'PRESENCIAL' : 'REUNIÃO MARCADA');
    const lq = motivosLQ.length > 0 || estado.lead_quente;
    const r = montarResumo({ dados: dadosFinais, canalNome, origem, etapa: 'concluido', leadQuente: lq, leadQuenteMotivos: motivosLQ });
    await admin.rpc('bot_concluir', { p_conversa: conversaId, p_resumo_texto: r.texto, p_resumo_json: r.json });
    await logRunner('bot_respondeu', `desfecho_${est.desfecho}`, { mensagens: baloes.length, enviados_reais: enviados });
    return json({ ok: true, dry_run: dryRun, etapa_nova: 'concluido', desfecho: est.desfecho, mensagens: baloes, enviados_reais: enviados, resumo: r.json });
  }

  await logRunner('bot_respondeu', 'ia', { mensagens: baloes.length, enviados_reais: enviados, dificil });
  return json({ ok: true, dry_run: dryRun, etapa_nova: 'ia', mensagens: baloes, enviados_reais: enviados, lead_quente_motivos: motivosLQ });
}
