// bot-runner — motor do bot de atendimento inicial. MODO SEGURO:
//  * dry_run=true por DEFAULT (não envia nada; grava outbox como 'simulada'). Quem chama decide.
//  * ENVIO real roteia por canais.transporte via enviadorDe (Evolution OU Cloud API) — mesma
//    implementação do envio manual. Falha/transporte não suportado vira motivo explícito no outbox.
//  * auth por x-bot-secret == webhook_config.bot_runner. Deploy com --no-verify-jwt.
//  * Chamado pelos webhooks (evolution/cloud) com dry_run vindo de flag; master global e config do
//    canal ainda precisam estar ligados. Em teste passa-se force=true (com dry_run) sem enviar.
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
// ENVIO: reusa o MESMO adaptador do envio manual (evolution-send). enviadorDe(canal) roteia por
// canais.transporte — Evolution (Baileys) OU Cloud API oficial — devolvendo sempre { key: { id } }.
// Importar (não copiar) garante UMA implementação de envio Cloud API, sem duas divergindo no tempo.
import { enviadorDe } from '../evolution-send/transporte.ts';
// Motor determinístico por BOTÕES (sem IA). Puro; o bot-runner é quem envia/persiste.
import { proximoPasso, proximoPassoSuporte, chaveTel, deveHandoff48h, telaComoTexto, opcoesDaTela } from './fluxo_botoes.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
// Fluxo por IA (default LIGADO). Se cair (quota/crédito/timeout), o index usa o copy determinístico.
const IA_ATIVA = (Deno.env.get('IA_ATIVA') ?? 'sim').toLowerCase() === 'sim';
// Fluxo por BOTÕES (determinístico). Roteado por canal via bot_canal_config.fluxo_slug começando
// com 'botoes'. Freio de emergência global: BOT_BOTOES_ATIVO='nao'. Reversível sem redeploy.
const BOTOES_ATIVO = (Deno.env.get('BOT_BOTOES_ATIVO') ?? 'sim').toLowerCase() !== 'nao';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type, x-bot-secret', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, Math.max(0, ms)));

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
      .select('id, nome_interno, instancia_externa, origem_tipo, transporte, cloud_phone_number_id').eq('id', conv.canal_id).maybeSingle();
    const { data: cfg } = await admin.from('bot_canal_config')
      .select('mensagens, intervalo_min_ms, intervalo_max_ms, fluxo_slug').eq('canal_id', conv.canal_id).maybeSingle();
    const { data: cfgOrg } = await admin.from('bot_config')
      .select('intervalo_min_ms, intervalo_max_ms').eq('organizacao_id', conv.organizacao_id).maybeSingle();

    const copy: Copy = (cfg?.mensagens as Copy) ?? DEFAULT_COPY;
    const min = cfg?.intervalo_min_ms ?? cfgOrg?.intervalo_min_ms ?? 1800;
    const max = cfg?.intervalo_max_ms ?? cfgOrg?.intervalo_max_ms ?? 3500;
    const canalNome = canal?.nome_interno ?? '—';
    const origem = canal?.origem_tipo ?? 'WhatsApp';
    const dados = (estado.dados_qualificacao ?? {}) as Record<string, unknown>;

    // ---- humano ativo vs cliente dormente ----
    // humanoRespondeu = ALGUÉM humano já enviou nesta conversa (painel ou celular). temDono = o CONTATO
    // já tem responsável. A distinção é o que separa "atendimento ao vivo" (fica quieto) de "cliente
    // que voltou do nada" (fluxo de suporte).
    const { data: humano } = await admin.from('mensagens')
      .select('id, autor_id, origem, tipo').eq('conversa_id', conversaId).eq('direcao', 'saida').limit(50);
    const humanoRespondeu = (humano ?? []).some((m: any) =>
      (m.autor_id != null && !['sistema', 'nota_interna'].includes(m.tipo)) || (m.autor_id == null && m.origem === 'telefone'));
    const temDono = responsavelId != null;

    // atendimento AO VIVO (humano já respondeu aqui) -> pausa e fica quieto (não atropela o consultor).
    if (humanoRespondeu) {
      const { texto, json: rj } = montarResumo({ dados, canalNome, origem, etapa: estado.etapa, leadQuente: estado.lead_quente, leadQuenteMotivos: estado.lead_quente_motivos ?? [] });
      await admin.rpc('bot_pausar', { p_conversa: conversaId, p_motivo: 'humano_assumiu', p_resumo_texto: texto, p_resumo_json: rj });
      await logRunner('bot_ignorado', 'humano_assumiu');
      return json({ ok: true, paused: 'humano_assumiu', dry_run: dryRun });
    }

    // CLIENTE que já tem dono e voltou numa conversa dormente -> FLUXO DE SUPORTE (não re-roteia).
    // Respeita os mesmos freios do fluxo de botões (BOT_BOTOES_ATIVO + dry_run/allowlist no envio).
    // !estado.pausado: se a conversa está pausada (ex.: acabou de completar a qualificação = handoff),
    // NÃO abre suporte — cai pro humano em silêncio. Evita "Oi de novo?" logo após o fecho.
    if (temDono && !estado.pausado && BOTOES_ATIVO && (cfg?.fluxo_slug ?? '').startsWith('botoes')) {
      return await tratarSuporte({
        admin, conversaId, conv, canal, estado, responsavelId,
        inboundText: body.inbound_text ?? '', inboundTipo: body.inbound_tipo ?? 'texto',
        inboundMsgId: body.inbound_msg_id ?? null, dryRun, logRunner,
      });
    }

    // ---- elegibilidade (fonte de verdade: master/canal/saúde/nova/opp/destino). Bloqueia ANTES do áudio:
    //      "bot off = nada acontece" (master off, canal não habilitado, humano, precisa_humano → ignora). ----
    const { data: eleg } = await admin.rpc('bot_pode_atuar', { p_conversa: conversaId });
    if (!eleg?.elegivel && !force) {
      // LACUNA DAS 48h: lead que abandonou o fluxo por botões (tem passo) e voltou depois da trava
      // 'conversa_antiga' NÃO fica mudo -> cai pra humano (handoff) + 1 balão tranquilizador.
      // (Completado/atribuído retorna 'bot_pausado'/'ja_tem_responsavel', não 'conversa_antiga'.)
      if (BOTOES_ATIVO && (cfg?.fluxo_slug ?? '').startsWith('botoes') && deveHandoff48h(eleg?.motivo, dados.passo_botoes as string | undefined)) {
        return await tratarLeadRetornou48h({ admin, conversaId, conv, canal, dryRun, logRunner });
      }
      await logRunner('bot_ignorado', eleg?.motivo ?? 'inelegivel'); return json({ ok: true, skipped: 'inelegivel', elegibilidade: eleg });
    }

    // ---- DESVIO: fluxo determinístico por BOTÕES (canais com fluxo_slug 'botoes*') ----
    // Fica ANTES do áudio e da IA de propósito: NESTE canal o bot NUNCA chama ia.ts (nem a
    // transcrição de áudio, nem a geração). A IA continua no código para os outros canais.
    // Reversível: muda o fluxo_slug do canal (config) ou desliga BOT_BOTOES_ATIVO (env).
    // dry_run continua valendo (o motor simula em vez de enviar).
    if (BOTOES_ATIVO && (cfg?.fluxo_slug ?? '').startsWith('botoes')) {
      // GATE DE ANÚNCIO: o fluxo de crédito é SÓ pra quem chegou do tráfego de anúncio (1º inbound com
      // `referral` de Click-to-WhatsApp, gravado pelo webhook em mensagens.metadados.referral). Lead novo
      // SEM referral não engata (humano atende). Só gateia na ENTRADA (sem passo salvo) — quem já está no
      // meio segue. Reversível por env (CREDITO_SO_ANUNCIO=nao desliga o gate).
      // Gate SÓ no Cloud (1390): lá o referral de anúncio existe e é o filtro "só tráfego pago". Nos
      // canais Evolution (LUIZA) NÃO há referral — o gate não se aplica e TODO lead novo engata.
      const SO_ANUNCIO = (Deno.env.get('CREDITO_SO_ANUNCIO') ?? 'sim').toLowerCase() !== 'nao';
      const dqBot = (estado.dados_qualificacao ?? {}) as Record<string, unknown>;
      const jaNoFluxo = !!dqBot.passo_botoes;
      if (SO_ANUNCIO && canal?.transporte === 'cloud_api' && !jaNoFluxo) {
        const { data: inbs } = await admin.from('mensagens').select('metadados').eq('conversa_id', conversaId).eq('direcao', 'entrada').limit(50);
        const veioDeAnuncio = (inbs ?? []).some((m: any) => m?.metadados?.referral);
        if (!veioDeAnuncio) {
          await logRunner('fluxo_botoes', 'nao_engatou_sem_referral', { dry_run: dryRun });
          return json({ ok: true, fluxo: 'botoes', skipped: 'sem_referral_anuncio', conversa_id: conversaId });
        }
      }
      return await tratarComBotoes({
        admin, conversaId, conv, canal, estado,
        inboundText: body.inbound_text ?? '', inboundTipo: body.inbound_tipo ?? 'texto',
        inboundMsgId: body.inbound_msg_id ?? null, dryRun, logRunner,
      });
    }

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
  // transporte do canal decide o caminho de saída (NÃO a existência de instancia_externa): um canal
  // Cloud API sai pela Graph API, um canal Evolution pela instância Baileys. Default 'evolution'.
  const transporte = (canal?.transporte ?? 'evolution') as string;
  for (const row of ordenadas) {
    if (dryRun) { await admin.rpc('bot_registrar_envio', { p_saida: row.id, p_status: 'simulada' }); continue; }
    const espera = new Date(row.enviar_apos).getTime() - Date.now();
    await sleep(espera);
    // pré-checagens: cada bloqueio tem MOTIVO EXPLÍCITO — nunca um 'sem_instancia' mudo para um
    // canal Cloud (o falso motivo de antes). Falha nunca vira silêncio (mesma regra do remarketing).
    const bloqueio = !destino ? 'sem_destino'
      : (transporte === 'cloud_api' && !canal?.cloud_phone_number_id) ? 'sem_phone_number_id'
      : (transporte === 'evolution' && !canal?.instancia_externa) ? 'sem_instancia'
      : (transporte !== 'cloud_api' && transporte !== 'evolution') ? `transporte_nao_suportado:${transporte}`
      : null;
    if (bloqueio) { await admin.rpc('bot_registrar_envio', { p_saida: row.id, p_status: 'falhou', p_erro: bloqueio }); continue; }
    try {
      // enviadorDe roteia por transporte e devolve { key: { id } }; sem id => trata como falha
      // (mesmo critério de aceite do envio manual). O adaptador Cloud lança com a mensagem da Meta
      // (ex.: janela 24h, CLOUD_API_ATIVO off) — que vira o motivo registrado, nunca um silêncio.
      const sent = await enviadorDe(canal).sendText(destino!, row.texto);
      const idExterno = sent?.key?.id ?? null;
      if (!idExterno) throw new Error('sem_id_retorno');
      const { data: msg } = await admin.from('mensagens').insert({
        organizacao_id: conv.organizacao_id, conversa_id: conv.id, direcao: 'saida', tipo: 'texto',
        conteudo: row.texto, autor_id: null, origem: 'bot', status: 'enviada', id_externo: idExterno,
      }).select('id').maybeSingle();
      await admin.rpc('bot_registrar_envio', { p_saida: row.id, p_status: 'enviada', p_mensagem: msg?.id ?? null, p_id_externo: idExterno });
      enviados++;
    } catch (e) {
      await admin.rpc('bot_registrar_envio', { p_saida: row.id, p_status: 'falhou', p_erro: String((e as Error)?.message ?? 'falha_envio').slice(0, 300) });
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

// ======== FLUXO POR BOTÕES: motor determinístico (sem IA) para o canal oficial ========
// Lê o passo atual (dados_qualificacao.passo_botoes) + o toque do lead (payload_id da mensagem
// inbound, que o cloud-webhook já gravou em metadados) e decide a próxima tela via proximoPasso
// (puro). Envia pela Cloud API, ou SIMULA em dry_run. Observável no audit_log (acao='fluxo_botoes')
// e — o toque do lead — na própria tabela mensagens.
// FECHO (4B.2): consultores fixos (ids conferidos na tabela usuarios). Roteamento por gênero:
// mulher -> Matheus; homem -> Giovana/Juliana; ambíguo -> humano decide (sem consultor).
// `cartao` = nome exibido no vCard (com cargo). Feminino p/ Giovana/Juliana, masculino p/ Matheus.
const CONSULTORES = {
  matheus: { id: '4ac197b4-9600-4756-81aa-1ac29280df09', nome: 'Matheus', chave: 'matheus', cartao: 'Consultor Matheus' },
  giovana: { id: 'a31b5fcb-d378-4490-83fe-a47a7c1ee847', nome: 'Giovana', chave: 'giovana', cartao: 'Consultora Giovana' },
  juliana: { id: 'd7e59652-d3eb-4d7d-8830-7fc780701a8e', nome: 'Juliana', chave: 'juliana', cartao: 'Consultora Juliana' },
};
// Nome FIXO exibido no cartão (vCard) do handoff de crédito. O número é sempre o do Murillo (5329,
// vem da tela do motor); a distribuição interna (consultor_roteado) NÃO aparece pro cliente (decisão
// do dono 2026-08-04). Genérico de propósito.
const CARD_ATENDIMENTO_NOME = 'CAF Atendimento';

// Conta atribuições de um consultor até agora (dados_qualificacao.consultor_roteado). Base do rodízio.
async function contarRoteados(admin: any, chave: string): Promise<number> {
  const { count } = await admin.from('bot_conversa_estado')
    .select('conversa_id', { count: 'exact', head: true })
    .eq('dados_qualificacao->>consultor_roteado', chave);
  return count ?? 0;
}
// Rodízio por CONTAGEM: manda o próximo homem pro consultor com MENOS atribuições até agora
// (empate -> Giovana). Alterna G,J,G,J e se auto-corrige. Marca em dados_qualificacao.consultor_roteado.
async function proximoConsultorHomem(admin: any): Promise<{ id: string; nome: string; chave: string; cartao: string }> {
  const g = await contarRoteados(admin, 'giovana');
  const j = await contarRoteados(admin, 'juliana');
  return g <= j ? CONSULTORES.giovana : CONSULTORES.juliana;
}
// Rodízio por CONTAGEM entre os TRÊS (Giovana/Juliana/Matheus) — usado no gênero AMBÍGUO, pra ninguém
// ficar sem dono. Menor contagem vence; empate segue a ordem estável giovana, juliana, matheus.
async function proximoConsultorTres(admin: any): Promise<{ id: string; nome: string; chave: string; cartao: string }> {
  const [g, j, m] = await Promise.all([contarRoteados(admin, 'giovana'), contarRoteados(admin, 'juliana'), contarRoteados(admin, 'matheus')]);
  const counts: Record<string, number> = { giovana: g, juliana: j, matheus: m };
  const ordem = [CONSULTORES.giovana, CONSULTORES.juliana, CONSULTORES.matheus];
  return ordem.reduce((best, c) => (counts[c.chave] < counts[best.chave] ? c : best), ordem[0]);
}

// Resolve o destino do lead + o modo de envio (allowlist/dry_run). Compartilhado pelo fluxo e pelo
// handoff das 48h — UMA fonte da verdade pro "isto sai real ou é simulado".
async function resolverEnvio(admin: any, conv: any, dryRun: boolean): Promise<{ destino: string | null; numeroLiberado: boolean; dryRunEfetivo: boolean }> {
  const { data: ident } = await admin.from('contato_identidades')
    .select('valor_normalizado').eq('contato_id', conv.contato_id).eq('tipo', 'whatsapp')
    .not('valor_normalizado', 'is', null).order('principal', { ascending: false }).limit(1).maybeSingle();
  const destino = ident?.valor_normalizado ?? null;
  const allowlist = (Deno.env.get('CLOUD_BOT_ENVIO_REAL_ALLOWLIST') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const numeroLiberado = !!destino && allowlist.some((a) => chaveTel(a) === chaveTel(destino));
  return { destino, numeroLiberado, dryRunEfetivo: dryRun && !numeroLiberado };
}

// LACUNA DAS 48h: lead abandonou no meio e voltou depois da trava 'conversa_antiga'. Em vez de silêncio,
// faz o handoff (reusa bot_pausar + precisa_humano) e manda 1 balão tranquilizador. A PAUSA é a trava
// anti-repetição: na próxima msg, bot_pode_atuar retorna 'bot_pausado' e esta regra não re-dispara.
async function tratarLeadRetornou48h(p: {
  admin: any; conversaId: string; conv: any; canal: any; dryRun: boolean;
  logRunner: (o: string, m?: string | null, e?: Record<string, unknown>) => Promise<void>;
}): Promise<Response> {
  const { admin, conversaId, conv, canal, dryRun, logRunner } = p;
  const MSG = 'Oi! Um dos nossos consultores já vai te atender. 🙂';   // balão fixo, limpo no guardrail
  const logFluxo = async (evento: string, extra: Record<string, unknown> = {}) => {
    try { await admin.from('audit_log').insert({ usuario_id: null, acao: 'fluxo_botoes', entidade: 'conversas', entidade_id: conversaId, dados_depois: { evento, ...extra }, organizacao_id: conv.organizacao_id }); } catch { /* best-effort */ }
  };
  // handoff pro humano (mecânica existente): pausa + precisa_humano com rótulo lead_retornou_48h.
  try { await admin.rpc('bot_pausar', { p_conversa: conversaId, p_motivo: 'lead_retornou_48h' }); } catch { /* best-effort */ }
  try {
    await admin.from('conversas').update({ precisa_humano: true, precisa_humano_motivo: 'lead_retornou_48h', precisa_humano_em: new Date().toISOString() }).eq('id', conversaId);
  } catch { /* best-effort */ }
  // 1 balão tranquilizador (respeitando dry_run/allowlist como o resto do fluxo).
  const { destino, dryRunEfetivo } = await resolverEnvio(admin, conv, dryRun);
  let enviado = false; let erro: string | null = null;
  if (dryRunEfetivo || !destino) {
    if (!destino) erro = 'sem_destino';
    await logFluxo('mostrar_tela_simulada', { passo_novo: 'lead_retornou_48h', tela: { tipo: 'texto', corpo: MSG }, motivo: erro });
  } else if (((canal?.transporte ?? 'evolution') === 'cloud_api' && !canal?.cloud_phone_number_id)
          || ((canal?.transporte ?? 'evolution') === 'evolution' && !canal?.instancia_externa)
          || ((canal?.transporte ?? 'evolution') !== 'cloud_api' && (canal?.transporte ?? 'evolution') !== 'evolution')) {
    erro = 'transporte_nao_suportado'; await logFluxo('tela_falhou', { erro });
  } else {
    try {
      const sent = await enviadorDe(canal).sendText(destino, MSG);
      const idExterno = sent?.key?.id ?? null;
      if (!idExterno) throw new Error('sem_id_retorno');
      await admin.from('mensagens').insert({ organizacao_id: conv.organizacao_id, conversa_id: conv.id, direcao: 'saida', tipo: 'texto', conteudo: MSG, autor_id: null, origem: 'bot', status: 'enviada', id_externo: idExterno, metadados: { fluxo: 'botoes', tela: { tipo: 'texto', corpo: MSG } } });
      enviado = true;
    } catch (e) { erro = String((e as Error)?.message ?? 'falha_envio').slice(0, 300); await logFluxo('tela_falhou', { erro }); }
  }
  await logFluxo('lead_retornou_48h', { dry_run: dryRunEfetivo, enviado, erro });
  await logRunner('fluxo_botoes', 'lead_retornou_48h', { dry_run: dryRunEfetivo, enviado, erro });
  return json({ ok: true, fluxo: 'botoes', lead_retornou_48h: true, dry_run: dryRunEfetivo, enviado, erro });
}

// FLUXO DE SUPORTE: cliente que já tem dono voltou numa conversa dormente. Mini-menu -> resumo ->
// handoff pro DONO (mantém responsavel_id, NÃO re-roteia). Cooldown de 3h entre conversas + o passo
// 'suporte_fim' barra repetição na mesma conversa. Áudio é bem-vindo (não é fora do trilho).
async function tratarSuporte(p: {
  admin: any; conversaId: string; conv: any; canal: any; estado: any; responsavelId: string;
  inboundText: string; inboundTipo: string; inboundMsgId: string | null; dryRun: boolean;
  logRunner: (o: string, m?: string | null, e?: Record<string, unknown>) => Promise<void>;
}): Promise<Response> {
  const { admin, conversaId, conv, canal, estado, responsavelId, inboundText, inboundTipo, inboundMsgId, dryRun, logRunner } = p;
  const dq = (estado.dados_qualificacao ?? {}) as Record<string, unknown>;
  const passo = (dq.passo_suporte as string | undefined) ?? null;
  const logFluxo = async (evento: string, extra: Record<string, unknown> = {}) => {
    try { await admin.from('audit_log').insert({ usuario_id: null, acao: 'fluxo_botoes', entidade: 'conversas', entidade_id: conversaId, dados_depois: { evento, fluxo: 'suporte', ...extra }, organizacao_id: conv.organizacao_id }); } catch { /* best-effort */ }
  };
  // handoff pro DONO: pausa + precisa_humano (rótulo suporte_cliente). NÃO mexe no responsavel_id.
  const handoff = async (evt: string) => {
    try { await admin.rpc('bot_pausar', { p_conversa: conversaId, p_motivo: 'suporte_cliente' }); } catch { /* best-effort */ }
    try { await admin.from('conversas').update({ precisa_humano: true, precisa_humano_motivo: 'suporte_cliente', precisa_humano_em: new Date().toISOString() }).eq('id', conversaId); } catch { /* best-effort */ }
    await logFluxo(evt);
  };

  // já concluiu o suporte NESTA conversa -> não re-mostra o menu; só reforça o handoff pro dono.
  if (passo === 'suporte_fim') {
    await handoff('suporte_repetido');
    await logRunner('fluxo_botoes', 'suporte_repetido', { dry_run: dryRun });
    return json({ ok: true, fluxo: 'suporte', repetido: true, dry_run: dryRun });
  }

  // COOLDOWN 3h ENTRE conversas (só antes de MOSTRAR o menu): viu o menu há <3h em alguma conversa
  // deste contato? Então não mostra de novo — só passa pro dono. (Repetição na mesma conversa já é
  // barrada pelo passo acima.)
  if (passo === null) {
    const { data: convs } = await admin.from('conversas').select('id').eq('contato_id', conv.contato_id);
    const ids = (convs ?? []).map((c: any) => c.id);
    let cooldown = false;
    if (ids.length) {
      const { data: estados } = await admin.from('bot_conversa_estado').select('dados_qualificacao').in('conversa_id', ids);
      const limite = Date.now() - 3 * 3600 * 1000;
      cooldown = (estados ?? []).some((e: any) => { const t = e?.dados_qualificacao?.suporte_menu_em; return t && new Date(t).getTime() >= limite; });
    }
    if (cooldown) {
      await handoff('suporte_cooldown');
      await logRunner('fluxo_botoes', 'suporte_cooldown', { dry_run: dryRun });
      return json({ ok: true, fluxo: 'suporte', cooldown: true, dry_run: dryRun });
    }
  }

  // nome do cliente (contato) + nome do consultor DONO (responsavel_id)
  const { data: ct } = await admin.from('contatos').select('nome').eq('id', conv.contato_id).maybeSingle();
  const { data: dono } = await admin.from('usuarios').select('nome').eq('id', responsavelId).maybeSingle();
  const primeiroNome = ((ct?.nome ?? '').trim().split(/\s+/)[0]) || 'tudo bem';
  const consultor = ((dono?.nome ?? '').trim().split(/\s+/)[0]) || 'um consultor';

  // o toque do lead (id do botão) vem em mensagens.metadados.payload_id
  let toqueId: string | null = null;
  if (inboundMsgId) {
    const { data: m } = await admin.from('mensagens').select('metadados').eq('id', inboundMsgId).maybeSingle();
    toqueId = ((m?.metadados ?? {}) as Record<string, unknown>).payload_id as string | undefined ?? null;
  }
  const ehAudio = inboundTipo === 'audio';
  const r = proximoPassoSuporte(passo, { texto: inboundText || '', ehAudio, toqueId }, { primeiroNome, consultor }, dq);
  await logFluxo('suporte_entrada', { passo_atual: passo, texto: inboundText || null, eh_audio: ehAudio, decisao: r.acao });
  if (r.acao === 'nada') { await logRunner('fluxo_botoes', `suporte_${r.motivo}`, { dry_run: dryRun }); return json({ ok: true, fluxo: 'suporte', motivo: r.motivo, dry_run: dryRun }); }

  // guardrail (defesa em profundidade) — nenhum balão pode citar valor/%/prazo/promessa.
  const suja = r.telas.flatMap((t) => ('corpo' in t ? [{ corpo: t.corpo, v: saidaSuja(t.corpo) }] : [])).find((x) => x.v);
  if (suja) { await logFluxo('guardrail_bloqueou', { violacao: suja.v }); await logRunner('fluxo_botoes', 'suporte_guardrail_bloqueou', { dry_run: dryRun }); return json({ ok: true, fluxo: 'suporte', bloqueado: suja.v }); }

  // envia/simula (respeitando dry_run/allowlist como o resto)
  const { destino, dryRunEfetivo } = await resolverEnvio(admin, conv, dryRun);
  let enviados = 0; let erro: string | null = null;
  if (dryRunEfetivo || !destino) {
    if (!destino) erro = 'sem_destino';
    for (let i = 0; i < r.telas.length; i++) await logFluxo('mostrar_tela_simulada', { ordem: i, passo_novo: r.passoNovo, tela: r.telas[i], motivo: erro });
  } else if (((canal?.transporte ?? 'evolution') === 'cloud_api' && !canal?.cloud_phone_number_id)
          || ((canal?.transporte ?? 'evolution') === 'evolution' && !canal?.instancia_externa)
          || ((canal?.transporte ?? 'evolution') !== 'cloud_api' && (canal?.transporte ?? 'evolution') !== 'evolution')) {
    erro = 'transporte_nao_suportado'; await logFluxo('tela_falhou', { erro });
  } else {
    const tx = enviadorDe(canal);
    for (let i = 0; i < r.telas.length; i++) {
      if (i > 0) await sleep(1000);
      const tela = r.telas[i];
      // Evolution (sem botões): o menu de suporte vira texto; Cloud envia o botão de verdade.
      const textoTela = tx.ehCloud ? (tela as { corpo: string }).corpo : telaComoTexto(tela);
      try {
        const sent = (tx.ehCloud && tela.tipo === 'botoes')
          ? await tx.sendBotoes(destino, tela.corpo, tela.botoes.map((b) => ({ id: b.id, titulo: b.titulo })))
          : await tx.sendText(destino, textoTela);
        const idExterno = sent?.key?.id ?? null;
        if (!idExterno) throw new Error('sem_id_retorno');
        await admin.from('mensagens').insert({ organizacao_id: conv.organizacao_id, conversa_id: conv.id, direcao: 'saida', tipo: 'texto', conteudo: textoTela, autor_id: null, origem: 'bot', status: 'enviada', id_externo: idExterno, metadados: { fluxo: 'suporte', tela } });
        enviados++;
      } catch (e) { erro = String((e as Error)?.message ?? 'falha_envio').slice(0, 300); await logFluxo('tela_falhou', { ordem: i, erro }); break; }
    }
  }

  // fim do suporte -> handoff pro dono (pausa + precisa_humano), mantendo o responsavel_id.
  if (r.acoes?.finalizarSuporte) await handoff('suporte_concluido');

  // persiste o passo + (na 1ª vez) o timestamp do menu pro cooldown + a qualificação.
  const entrouNoMenu = passo === null;
  await admin.rpc('bot_avancar_etapa', { p_conversa: conversaId, p_etapa: estado.etapa, p_dados: { passo_suporte: r.passoNovo, ultimas_opcoes: opcoesDaTela(r.telas), ...(entrouNoMenu ? { suporte_menu_em: new Date().toISOString() } : {}), ...(r.acoes?.salvarQualificacao ?? {}) }, p_reprompts: 0, p_inbound_msg: inboundMsgId });
  await logRunner('fluxo_botoes', `suporte_${r.passoNovo}`, { dry_run: dryRunEfetivo, baloes: r.telas.length, enviados, erro });
  return json({ ok: true, fluxo: 'suporte', passo_novo: r.passoNovo, baloes: r.telas.length, enviados, erro, dry_run: dryRunEfetivo });
}

async function tratarComBotoes(p: {
  admin: any; conversaId: string; conv: any; canal: any; estado: any;
  inboundText: string; inboundTipo: string; inboundMsgId: string | null; dryRun: boolean;
  logRunner: (o: string, m?: string | null, e?: Record<string, unknown>) => Promise<void>;
}): Promise<Response> {
  const { admin, conversaId, conv, canal, estado, inboundText, inboundTipo, inboundMsgId, dryRun, logRunner } = p;
  const logFluxo = async (evento: string, extra: Record<string, unknown> = {}) => {
    try {
      await admin.from('audit_log').insert({
        usuario_id: null, acao: 'fluxo_botoes', entidade: 'conversas', entidade_id: conversaId,
        dados_depois: { evento, dry_run: dryRun, ...extra }, organizacao_id: conv.organizacao_id,
      });
    } catch { /* log best-effort: nunca quebra o fluxo */ }
  };

  const dq = (estado.dados_qualificacao ?? {}) as Record<string, unknown>;
  const passoAtual = (dq.passo_botoes as string | undefined) ?? null;
  const tentativas = Number(dq.tentativas ?? 0) || 0;   // contador do passo (zera ao avançar)
  // o toque do lead: o id do botão/lista fica em mensagens.metadados.payload_id (gravado pelo webhook)
  let toqueId: string | null = null;
  if (inboundMsgId) {
    const { data: m } = await admin.from('mensagens').select('metadados').eq('id', inboundMsgId).maybeSingle();
    toqueId = ((m?.metadados ?? {}) as Record<string, unknown>).payload_id as string | undefined ?? null;
  }
  const ehAudio = inboundTipo === 'audio';
  // __canal_transporte: hint transiente pro motor decidir o FECHO (Cloud → cartão Murillo; Evolution/LUIZA
  // → sem cartão, atendido no próprio número). NÃO é persistido (só entra no dados de leitura do motor).
  const r = proximoPasso(passoAtual, { texto: inboundText || '', ehAudio, toqueId }, tentativas, { ...dq, __canal_transporte: canal?.transporte });
  await logFluxo('entrada_recebida', { passo_atual: passoAtual, toque_id: toqueId, texto: inboundText || null, eh_audio: ehAudio, tentativas_antes: tentativas, decisao: r.acao });

  if (r.acao === 'nada') {
    await logRunner('fluxo_botoes', r.motivo, { dry_run: dryRun });
    return json({ ok: true, fluxo: 'botoes', dry_run: dryRun, skipped: r.motivo, passo_atual: passoAtual });
  }

  // BANNER: imagem promocional anteposta SÓ na abertura inicial (não em re-prompt), canal Cloud, com
  // CREDITO_BANNER_URL setada. A Meta baixa a URL pública sozinha (sendMedia image por link). Enviado
  // ANTES dos balões, no ramo de envio real abaixo (e só logado em dry_run).
  const ehAberturaInicial = passoAtual == null && r.passoNovo === 'aguardando_abertura';
  const bannerUrl = (Deno.env.get('CREDITO_BANNER_URL') ?? '').trim();
  const ehCloudCanal = (canal?.transporte ?? 'evolution') === 'cloud_api';
  const deveBanner = ehAberturaInicial && ehCloudCanal && !!bannerUrl;

  // ---- TRAVA de conteúdo (defesa em profundidade): nenhum balão pode citar valor/%/prazo/promessa.
  //      O texto das telas é FIXO e já respeita as travas; isto barra um erro FUTURO de conteúdo
  //      antes de qualquer envio/simulação. Reusa o mesmo guardrail da IA (saidaSuja). ----
  const suja = r.telas.flatMap((t) => ('corpo' in t ? [{ corpo: t.corpo, v: saidaSuja(t.corpo) }] : [])).find((x) => x.v);
  if (suja) {
    await logFluxo('guardrail_bloqueou', { passo_novo: r.passoNovo, violacao: suja.v, corpo: suja.corpo.slice(0, 200) });
    await logRunner('fluxo_botoes', 'guardrail_bloqueou', { dry_run: dryRun, violacao: suja.v });
    return json({ ok: true, fluxo: 'botoes', dry_run: dryRun, bloqueado: suja.v, passo_atual: passoAtual });
  }

  // ---- AÇÕES de estado (guardar nome/CPF). Rodam também em dry_run: o fluxo AVANÇA de estado
  //      (passo/nome/CPF ficam salvos pra a próxima mensagem continuar) — só o ENVIO é simulado.
  //      CPF vai pelo bot_registrar_cpf: completo só em contatos.cpf, mascarado em dados_qualificacao. ----
  if (r.acoes?.salvarNome) {
    try { await admin.rpc('bot_coletar_nome', { p_conversa: conversaId, p_nome: r.acoes.salvarNome }); } catch { /* best-effort */ }
    await logFluxo('salvou_nome', { primeiro: r.acoes.salvarNome.split(/\s+/)[0] ?? '' });
  }
  if (r.acoes?.salvarCpf) {
    try { await admin.rpc('bot_registrar_cpf', { p_conversa: conversaId, p_cpf_digits: r.acoes.salvarCpf.digits, p_cpf_mascarado: r.acoes.salvarCpf.mascarado }); } catch { /* best-effort */ }
    await logFluxo('salvou_cpf', { cpf_mascarado: r.acoes.salvarCpf.mascarado });   // nunca o CPF cru
  }
  // salvarQualificacao NÃO tem RPC dedicada: os pares chave→valor são persistidos no MERGE do
  // bot_avancar_etapa (p_dados) logo abaixo. Aqui só registramos pra observabilidade.
  if (r.acoes?.salvarQualificacao) {
    await logFluxo('salvou_qualificacao', { dados: r.acoes.salvarQualificacao });
  }

  // ---- FECHO (4B.2): resolve o consultor ANTES de enviar (o cartão vCard precisa do NOME dele).
  //      mulher -> Matheus; homem -> rodízio Giovana/Juliana; ambíguo -> sem consultor (humano decide,
  //      cartão sai como "CAF – Assessoria"). A ATRIBUIÇÃO no banco acontece depois do envio. ----
  let consultorFinal: { id: string; nome: string; chave: string; cartao: string } | null = null;
  let conversaJaTemDono = false;
  let finalizarDados: Record<string, unknown> = {};
  if (r.acoes?.finalizar) {
    const g = r.acoes.finalizar.genero;
    // Distribuição: decidida no BANCO (RPC bot_rotear_consultor): mulher -> Matheus; homem ->
    // Giovana/Juliana alternando; ambíguo -> menor placar. Placar é DO DIA (fuso SP), com teto
    // de +3 sobre quem tem menos e trava de nunca sobrescrever atendente já definido.
    // Fallback = régua local antiga (all-time), pro fecho nunca ficar sem dono se a RPC cair.
    try {
      const { data, error } = await admin.rpc('bot_rotear_consultor', { p_conversa: conversaId, p_genero: g });
      if (error) throw error;
      const rot = Array.isArray(data) ? data[0] : data;
      if (rot?.ja_tinha_atendente) conversaJaTemDono = true;
      else consultorFinal = (CONSULTORES as Record<string, typeof CONSULTORES.matheus>)[rot?.consultor_chave ?? ''] ?? null;
    } catch {
      if (g === 'mulher') consultorFinal = CONSULTORES.matheus;
      else if (g === 'homem') consultorFinal = await proximoConsultorHomem(admin);
      else consultorFinal = await proximoConsultorTres(admin);
    }
    const roteamento = conversaJaTemDono ? 'ja_tinha_dono' : (consultorFinal ? 'auto' : 'indefinido');
    // Cartão: NOME genérico fixo (o número é sempre o do Murillo, vem da tela do motor). A distribuição
    // interna fica só no responsavel_id — não aparece no vCard. (Fallback p/ preferências antigas.)
    const nomeCartao = r.acoes.finalizar.preferencia === 'contato_murillo' ? CARD_ATENDIMENTO_NOME : (consultorFinal?.cartao ?? 'CAF – Assessoria');
    for (const t of r.telas) if (t.tipo === 'contato') t.nome = nomeCartao;
    finalizarDados = { genero: g, preferencia: r.acoes.finalizar.preferencia, roteamento,
      ...(consultorFinal ? { consultor_roteado: consultorFinal.chave } : {}),
      // handoff_em: marca o instante do handoff pro cron credito-nudge medir os +5/+10/+15 min.
      ...(r.acoes.finalizar.preferencia === 'contato_murillo' ? { handoff_em: new Date().toISOString() } : {}) };
    await logFluxo('roteou_fecho', finalizarDados);
  }

  // ---- destino + ALLOWLIST de envio real (trava de teste). Por padrão o dry_run global vale pra
  //      TODOS. Um número na CLOUD_BOT_ENVIO_REAL_ALLOWLIST (e SÓ ele) tem o envio real ligado;
  //      qualquer outro continua simulado. Allowlist vazia = dry_run total (default seguro).
  //      Comparo por chave canônica; se não casar, fica dry (falha pro lado seguro). ----
  const { destino, numeroLiberado, dryRunEfetivo } = await resolverEnvio(admin, conv, dryRun);
  await logFluxo('modo_envio', { destino_chave: destino ? chaveTel(destino) : null, numero_liberado: numeroLiberado, dry_run_global: dryRun, dry_run_efetivo: dryRunEfetivo });

  // ---- mostra a SEQUÊNCIA de balões: SIMULA em dry_run_efetivo (só loga cada um), envia caso contrário ----
  let enviados = 0; let erro: string | null = null;
  if (dryRunEfetivo) {
    if (deveBanner) await logFluxo('banner_simulado', { url: bannerUrl });
    for (let i = 0; i < r.telas.length; i++) await logFluxo('mostrar_tela_simulada', { ordem: i, passo_novo: r.passoNovo, tela: r.telas[i] });
  } else {
    const transporte = (canal?.transporte ?? 'evolution') as string;
    // A campanha por BOTÕES (Cloud API) envia botões/lista/vCard; a campanha por TEXTO (Evolution,
    // ex.: LUIZA) roda o MESMO fluxo mas renderiza cada tela como texto (telaComoTexto). Só o
    // transporte desconhecido é bloqueio — motivo explícito, nunca silêncio (regra do remarketing).
    const bloqueio = !destino ? 'sem_destino'
      : (transporte === 'cloud_api' && !canal?.cloud_phone_number_id) ? 'sem_phone_number_id'
      : (transporte === 'evolution' && !canal?.instancia_externa) ? 'sem_instancia'
      : (transporte !== 'cloud_api' && transporte !== 'evolution') ? `transporte_nao_suportado:${transporte}`
      : null;
    if (bloqueio) {
      erro = bloqueio;
      await logFluxo('tela_falhou', { passo_novo: r.passoNovo, erro });
    } else {
      const tx = enviadorDe(canal);
      // BANNER antes dos balões (Cloud + abertura inicial): a Meta baixa a URL pública sozinha. Usa o 1º
      // balão (a SAUDAÇÃO) como LEGENDA → imagem + saudação viram UMA mensagem. Best-effort: se falhar, o
      // fluxo segue e a saudação sai normal (não pulamos o balão 0). Só pula o balão 0 se o banner SAIU.
      let pulaPrimeiro = false;
      if (deveBanner) {
        const legenda = (r.telas[0]?.tipo === 'texto') ? (r.telas[0] as { corpo: string }).corpo : undefined;
        try {
          const b = await tx.sendMedia(destino!, 'image', 'image/jpeg', bannerUrl, 'banner.jpg', legenda);
          const idB = b?.key?.id ?? null;
          if (idB) {
            pulaPrimeiro = !!legenda;   // a saudação foi como legenda: não repetir como balão
            await admin.from('mensagens').insert({
              organizacao_id: conv.organizacao_id, conversa_id: conv.id, direcao: 'saida', tipo: 'imagem',
              conteudo: legenda ?? '📷', autor_id: null, origem: 'bot', status: 'enviada', id_externo: idB,
              metadados: { fluxo: 'botoes', etapa: 'banner', url: bannerUrl },
            });
          }
          await logFluxo('banner_enviado', { id_externo: idB, com_legenda: !!legenda });
          await sleep(1000);
        } catch (e) {
          await logFluxo('banner_falhou', { erro: String((e as Error)?.message ?? 'falha').slice(0, 200) });
        }
      }
      for (let i = (pulaPrimeiro ? 1 : 0); i < r.telas.length; i++) {
        if (i > 0) await sleep(1000);   // respiro entre balões: chega como conversa, não bloco único
        const tela = r.telas[i];
        // transporte SEM interativos (Evolution): toda tela vira texto; a decisão do fluxo é a mesma.
        const textoTela = tx.ehCloud ? null : telaComoTexto(tela);
        try {
          let sent: { key?: { id?: string } };
          if (!tx.ehCloud) sent = await tx.sendText(destino!, textoTela!);
          else if (tela.tipo === 'botoes') sent = await tx.sendBotoes(destino!, tela.corpo, tela.botoes.map((b) => ({ id: b.id, titulo: b.titulo })));
          else if (tela.tipo === 'lista') sent = await tx.sendLista(destino!, tela.corpo, tela.tituloBotao, tela.secoes.map((s) => ({ titulo: s.titulo, itens: s.itens })));
          else if (tela.tipo === 'contato') sent = await tx.sendContato(destino!, tela.nome, tela.telefone);
          else sent = await tx.sendText(destino!, tela.corpo);
          const idExterno = sent?.key?.id ?? null;
          if (!idExterno) throw new Error('sem_id_retorno');
          const conteudoTela = textoTela ?? (tela.tipo === 'contato' ? `📇 ${tela.nome} — ${tela.telefone}` : tela.corpo);
          await admin.from('mensagens').insert({
            organizacao_id: conv.organizacao_id, conversa_id: conv.id, direcao: 'saida', tipo: 'texto',
            conteudo: conteudoTela, autor_id: null, origem: 'bot', status: 'enviada', id_externo: idExterno,
            metadados: { fluxo: 'botoes', tela },
          });
          enviados++;
          await logFluxo('tela_enviada', { ordem: i, tela, id_externo: idExterno });
        } catch (e) {
          erro = String((e as Error)?.message ?? 'falha_envio').slice(0, 300);
          await logFluxo('tela_falhou', { ordem: i, tela, erro });
          break;   // parou num balão: não segue derramando os próximos
        }
      }
    }
  }

  // ---- SAIU DO TRILHO 2x: para o bot NESTA conversa E acende "precisa de humano" no painel.
  //      Reusa os mesmos mecanismos da IA: bot_pausar (bot_pode_atuar passa a bloquear) +
  //      conversas.precisa_humano (o card do WhatsApp já mostra o alerta). Vale em dry_run também —
  //      é decisão de estado, não mensagem ao cliente (o balão tranquilizador é simulado). ----
  if (r.escalarHumano) {
    // rótulo derivado do passo (ask_nome / ask_cpf) — o MECANISMO é o mesmo; só o motivo fica honesto.
    const motivoEscala = `fluxo_botoes_${r.passoNovo}`;
    try { await admin.rpc('bot_pausar', { p_conversa: conversaId, p_motivo: 'fluxo_botoes_precisa_humano' }); } catch { /* best-effort */ }
    try {
      await admin.from('conversas').update({
        precisa_humano: true, precisa_humano_motivo: motivoEscala, precisa_humano_em: new Date().toISOString(),
      }).eq('id', conversaId);
    } catch { /* best-effort */ }
    await logFluxo('sinalizou_humano', { passo: r.passoNovo, motivo: `${r.passoNovo}_2_tentativas` });
  }

  // ---- FECHO: grava o RESPONSÁVEL e faz o HANDOFF. Consultor definido -> contatos.responsavel_id
  //      (o trigger propaga pro conversas.atendente_id, o card mostra o consultor) + bot_pausar
  //      (para o bot / handoff pro humano). Ambíguo -> precisa_humano (sem consultor, humano escolhe
  //      quem assume). Os balões (cartão inclusive) já foram enviados ACIMA, então a pausa não os corta. ----
  if (r.acoes?.finalizar) {
    if (consultorFinal) {
      try { await admin.from('contatos').update({ responsavel_id: consultorFinal.id }).eq('id', conv.contato_id); } catch { /* best-effort */ }
      try { await admin.rpc('bot_pausar', { p_conversa: conversaId, p_motivo: 'humano_assumiu' }); } catch { /* best-effort */ }
    } else if (conversaJaTemDono) {
      // conversa já tem atendente humano: NÃO mexe na atribuição; só pausa o bot (fluxo acabou).
      try { await admin.rpc('bot_pausar', { p_conversa: conversaId, p_motivo: 'humano_assumiu' }); } catch { /* best-effort */ }
    } else {
      try {
        await admin.from('conversas').update({
          precisa_humano: true, precisa_humano_motivo: 'fluxo_botoes_roteamento_indefinido', precisa_humano_em: new Date().toISOString(),
        }).eq('id', conversaId);
      } catch { /* best-effort */ }
    }
  }

  // ---- avança o passo + contador. bot_avancar_etapa faz MERGE em dados_qualificacao e grava
  //      ultimo_inbound_msg_id (idempotência). p_etapa recebe o valor ATUAL (a coluna etapa tem
  //      CHECK e não aceita 'botoes'; o passo real vive em dados_qualificacao.passo_botoes).
  //      'tentativas' é o contador do passo — zera sozinho quando o passoNovo é diferente. ----
  // ultimas_opcoes: ids das opções da tela recém-mostrada (canal por texto: "1"/"2" viram a opção certa
  // no próximo turno). Sempre gravado (mesmo []) pra não sobrar lista velha de uma tela anterior.
  await admin.rpc('bot_avancar_etapa', { p_conversa: conversaId, p_etapa: estado.etapa, p_dados: { passo_botoes: r.passoNovo, tentativas: r.tentativas, ultimas_opcoes: opcoesDaTela(r.telas), ...(ehAberturaInicial ? { abertura_em: new Date().toISOString() } : {}), ...(r.acoes?.salvarQualificacao ?? {}), ...finalizarDados }, p_reprompts: 0, p_inbound_msg: inboundMsgId });

  await logRunner('fluxo_botoes', r.passoNovo, { dry_run: dryRunEfetivo, baloes: r.telas.length, enviados, erro, tentativas: r.tentativas, escalou: !!r.escalarHumano, encerra: r.encerra });
  return json({ ok: true, fluxo: 'botoes', dry_run: dryRunEfetivo, passo_novo: r.passoNovo, baloes: r.telas.length, enviados, erro, tentativas: r.tentativas, escalou: !!r.escalarHumano });
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
