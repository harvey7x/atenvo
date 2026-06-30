// evolution-webhook — eventos da Evolution. Sem JWT. Secret via webhook_config (constante).
// v15: connection.update(open) auto-consolida canal DUPLICADO do mesmo número (reconexão que criou canal
//      novo) no canal histórico via RPC wa_consolidar_canal_por_numero (idempotente, best-effort).
// v14: INGESTÃO DE ÁUDIO (entrada e fromMe/celular): baixa a mídia (getBase64FromMediaMessage), guarda no
//      bucket privado e persiste tipo='audio' (idempotente por id_externo; falha de download => pendente
//      recuperável). NÃO altera o envio de áudio (evolution-send) nem o parser LID/secret/messages.update.
// v13: registra mensagens fromMe (enviadas pelo celular) como SAÍDA idempotente (#7).
import { corsHeaders, json } from './cors.ts';
import { adminClient } from './client.ts';

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0;
}
function digits(jid?: string | null): string | null {
  if (!jid) return null; return jid.replace(/[:@].*/, '').replace(/[^0-9]/g, '') || null;
}
function firstEndingWith(cands: Array<string | undefined | null>, suffix: string): string | null {
  for (const c of cands) if (typeof c === 'string' && c.endsWith(suffix)) return c; return null;
}
function textOf(message: Record<string, unknown> | undefined): string | null {
  if (!message) return null;
  const conv = message.conversation as string | undefined; if (conv) return conv;
  const ext = (message.extendedTextMessage as { text?: string } | undefined)?.text; if (ext) return ext;
  const eph = (message.ephemeralMessage as { message?: Record<string, unknown> } | undefined)?.message; if (eph) return textOf(eph);
  const vo = (message.viewOnceMessage as { message?: Record<string, unknown> } | undefined)?.message; if (vo) return textOf(vo);
  return null;
}
function sanitize(obj: unknown): unknown {
  try { return JSON.parse(JSON.stringify(obj, (k, v) => (/(apikey|authorization|token|secret)/i.test(k) ? '[REDACTED]' : v))); } catch { return null; }
}

// ---- Mídia (áudio): detecção + download seguro pela Evolution ----
const EVO_BASE = (Deno.env.get('EVOLUTION_API_URL') ?? '').replace(/\/+$/, '');
const EVO_KEY = Deno.env.get('EVOLUTION_API_KEY') ?? '';
// desembrulha mensagens encapsuladas (ephemeral, viewOnce, documentWithCaption).
function unwrapMsg(m: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!m) return m;
  const inner = (m.ephemeralMessage as { message?: Record<string, unknown> })?.message
    ?? (m.viewOnceMessage as { message?: Record<string, unknown> })?.message
    ?? (m.viewOnceMessageV2 as { message?: Record<string, unknown> })?.message
    ?? (m.documentWithCaptionMessage as { message?: Record<string, unknown> })?.message;
  return inner ? unwrapMsg(inner) : m;
}
// retorna descritor de áudio (audioMessage / ptt / voice) ou null.
function audioOf(message: Record<string, unknown> | undefined): { mime: string; ptt: boolean; seconds: number | null } | null {
  const m = unwrapMsg(message); if (!m) return null;
  const a = (m.audioMessage as { mimetype?: string; ptt?: boolean; seconds?: number } | undefined);
  if (!a) return null;
  return { mime: (a.mimetype ?? 'audio/ogg').split(';')[0].trim(), ptt: !!a.ptt, seconds: typeof a.seconds === 'number' ? a.seconds : null };
}
function extFromMime(mime: string): string {
  const m = mime.toLowerCase();
  if (m.includes('ogg')) return 'ogg'; if (m.includes('mpeg')) return 'mp3'; if (m.includes('mp4') || m.includes('m4a')) return 'm4a';
  if (m.includes('aac')) return 'aac'; if (m.includes('wav')) return 'wav'; if (m.includes('webm')) return 'webm'; return 'ogg';
}
const MAX_MEDIA = 20 * 1024 * 1024; // limite de segurança p/ áudio
// baixa a mídia descriptografada via Evolution (base64). NÃO persiste URL temporária.
async function baixarMidia(instance: string, dataMsg: Record<string, unknown>): Promise<{ bytes: Uint8Array; mime: string }> {
  if (!EVO_BASE || !EVO_KEY) throw new Error('evolution_nao_configurada');
  const res = await fetch(`${EVO_BASE}/chat/getBase64FromMediaMessage/${instance}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', apikey: EVO_KEY },
    body: JSON.stringify({ message: dataMsg, convertToMp4: false }),
  });
  const txt = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${txt.slice(0, 140)}`);
  let j: { base64?: string; media?: string; mimetype?: string } = {};
  try { j = JSON.parse(txt); } catch { throw new Error('resposta_invalida'); }
  const b64 = j.base64 ?? j.media ?? '';
  if (!b64) throw new Error('sem_base64');
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  if (bytes.length === 0) throw new Error('midia_vazia');
  if (bytes.length > MAX_MEDIA) throw new Error('midia_grande');
  return { bytes, mime: (j.mimetype ?? '').split(';')[0].trim() || 'audio/ogg' };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const admin = adminClient();
  try {
    const url = new URL(req.url);
    const { data: cfg } = await admin.from('webhook_config').select('secret').eq('chave', 'whatsapp').maybeSingle();
    const expected = cfg?.secret ?? '';
    if (!expected || !safeEqual(url.searchParams.get('secret') ?? '', expected)) return json({ error: 'unauthorized' }, 401);

    const evt = await req.json().catch(() => null) as { event?: string; instance?: string; instanceId?: string; data?: Record<string, unknown> } | null;
    let event = (evt?.event ?? '').toLowerCase();
    if (!event) { const seg = url.pathname.split('/').filter(Boolean).pop() ?? ''; if (seg && seg !== 'evolution-webhook') event = seg.replace(/-/g, '.'); }
    const instanceName = evt?.instance ?? '';
    const data = (evt?.data ?? {}) as Record<string, unknown>;
    const instanceId = (evt?.instanceId as string) ?? (data.instanceId as string) ?? null;
    if (!event || !instanceName) return json({ ok: true, ignored: 'sem event/instance' });

    const key = (data.key ?? {}) as Record<string, unknown>;
    const remoteJid = (key.remoteJid as string) ?? null;
    const addressing = (data.addressingMode as string) ?? (key.addressingMode as string) ?? (remoteJid?.endsWith('@lid') ? 'lid' : (remoteJid?.endsWith('@s.whatsapp.net') ? 'pn' : null));
    const fromMe = typeof key.fromMe === 'boolean' ? (key.fromMe as boolean) : null;
    const provMsgId = (key.id as string) ?? null;

    const { data: canal } = await admin.from('canais').select('id, organizacao_id, numero_conectado, provider').eq('instancia_externa', instanceName).maybeSingle();

    const { data: track } = await admin.from('whatsapp_webhook_events').insert({
      organizacao_id: canal?.organizacao_id ?? null, canal_id: canal?.id ?? null, instance_name: instanceName, instance_id: instanceId,
      event, provider_message_id: provMsgId, remote_jid: remoteJid, addressing_mode: addressing, from_me: fromMe, payload: sanitize(data), status_processamento: 'recebido',
    }).select('id').single();
    const trackId = track?.id as string | undefined;
    const finish = async (status: string, extra: Record<string, unknown> = {}) => { if (trackId) await admin.from('whatsapp_webhook_events').update({ status_processamento: status, processado_em: new Date().toISOString(), ...extra }).eq('id', trackId); };

    if (!canal) { await finish('erro', { erro: 'INSTANCE_NOT_MAPPED', ignorado_motivo: instanceName }); return json({ ok: true, ignored: 'canal desconhecido' }); }
    const orgId = canal.organizacao_id as string;

    if (event === 'connection.update') {
      const state = (data.state as string) ?? (data.connection as string);
      if (state === 'open') {
        const numero = digits((data.wuid as string) ?? (data.ownerJid as string));
        await admin.from('canais').update({ status_integracao: 'conectado', ativo: true, ...(numero ? { numero_conectado: numero } : {}), conectado_em: new Date().toISOString(), ultima_sincronizacao: new Date().toISOString() }).eq('id', canal.id);
        await admin.from('integracoes').update({ status: 'conectado' }).eq('canal_id', canal.id);
        // Auto-cura de canal DUPLICADO do mesmo número (reconexão que criou canal novo em vez de reusar o
        // histórico): reabsorve no canal histórico, preservando conversas/histórico. Idempotente (best-effort).
        if (numero) { try { await admin.rpc('wa_consolidar_canal_por_numero', { p_org: canal.organizacao_id, p_canal_ativo: canal.id }); } catch { /* não quebra o webhook */ } }
      } else if (state === 'close') { await admin.from('canais').update({ status_integracao: 'desconectado' }).eq('id', canal.id); }
      await finish('processado'); return json({ ok: true });
    }
    if (event === 'qrcode.updated') { await admin.from('integracoes').update({ status: 'sincronizando', ultima_sincronizacao: new Date().toISOString() }).eq('canal_id', canal.id); await finish('processado'); return json({ ok: true }); }

    if (event === 'messages.upsert') {
      // #7: NÃO descartamos mais fromMe. Grupo segue não suportado.
      if ((remoteJid ?? '').endsWith('@g.us')) { await finish('ignorado', { ignorado_motivo: 'grupo_nao_suportado' }); return json({ ok: true }); }

      // remoteJid é a OUTRA parte tanto na entrada (remetente) quanto na saída (destinatário) → resolução idêntica.
      const phoneJid = firstEndingWith([remoteJid, key.remoteJidAlt as string, data.remoteJidAlt as string, key.participantAlt as string, data.participantAlt as string, key.participant as string, data.participant as string], '@s.whatsapp.net');
      const lidJid = firstEndingWith([remoteJid, key.remoteJidAlt as string, data.remoteJidAlt as string, key.participant as string, data.participant as string], '@lid');
      const phone = digits(phoneJid); const lid = digits(lidJid);
      const msgObj = data.message as Record<string, unknown> | undefined;
      const corpo = textOf(msgObj);
      const audio = audioOf(msgObj);
      if (!corpo && !audio) { await finish('ignorado', { ignorado_motivo: 'sem_conteudo' }); return json({ ok: true }); }
      if (!phone && !lid) { await finish('ignorado', { ignorado_motivo: 'sem_identificador' }); return json({ ok: true }); }
      // Em saída o pushName é do dono da conta (não do destinatário) → não usar como nome do contato.
      const pushName = (!fromMe ? (data.pushName as string) : null) ?? (phone ?? lid!);

      let contatoId: string | null = null;
      let contatoCriadoAgora = false; // true apenas no ramo que INSERE contato novo (auto-entrada no Kanban)
      if (phone) { const { data: i } = await admin.from('contato_identidades').select('contato_id').eq('organizacao_id', orgId).eq('tipo', 'whatsapp').eq('valor_normalizado', phone).maybeSingle(); if (i) contatoId = i.contato_id; }
      if (!contatoId && lid) { const { data: i } = await admin.from('contato_identidades').select('contato_id').eq('organizacao_id', orgId).eq('tipo', 'outro').eq('provedor', 'evolution_lid').eq('valor_normalizado', lid).maybeSingle(); if (i) contatoId = i.contato_id; }
      if (!contatoId && phone) { const { data: c } = await admin.from('contatos').select('id').eq('organizacao_id', orgId).eq('telefone', phone).maybeSingle(); if (c) contatoId = c.id; }
      if (!contatoId) {
        const { data: novo, error: e1 } = await admin.from('contatos').insert({ nome: pushName, telefone: phone ?? null, origem: 'WhatsApp', organizacao_id: orgId }).select('id').single();
        if (e1 || !novo) { await finish('erro', { erro: `contatos:${e1?.code ?? ''}:${(e1?.message ?? 'sem retorno').slice(0,180)}` }); return json({ ok: true }); }
        contatoId = novo.id;
        contatoCriadoAgora = true;
        if (phone) await admin.from('contato_identidades').insert({ contato_id: contatoId, organizacao_id: orgId, tipo: 'whatsapp', provedor: 'evolution', valor: phoneJid ?? phone, valor_normalizado: phone, principal: true });
      } else if (phone) { await admin.from('contatos').update({ telefone: phone }).eq('id', contatoId).is('telefone', null); }
      if (lid) { const { data: ex } = await admin.from('contato_identidades').select('id').eq('organizacao_id', orgId).eq('tipo', 'outro').eq('provedor', 'evolution_lid').eq('valor_normalizado', lid).maybeSingle(); if (!ex) await admin.from('contato_identidades').insert({ contato_id: contatoId, organizacao_id: orgId, tipo: 'outro', provedor: 'evolution_lid', valor: lidJid ?? lid, valor_normalizado: lid, principal: false }); }

      let conversaId: string | null = null;
      const { data: conv } = await admin.from('conversas').select('id').eq('organizacao_id', orgId).eq('contato_id', contatoId).eq('canal_id', canal.id).neq('status', 'fechada').order('criado_em', { ascending: false }).limit(1).maybeSingle();
      if (conv) conversaId = conv.id; else { const { data: nc, error: e2 } = await admin.from('conversas').insert({ organizacao_id: orgId, contato_id: contatoId, canal_id: canal.id, status: 'aberta' }).select('id').single(); if (e2 || !nc) { await finish('erro', { erro: `conversas:${e2?.code ?? ''}:${(e2?.message ?? 'sem retorno').slice(0,180)}` }); return json({ ok: true }); } conversaId = nc.id; }

      // ---- Mídia de áudio: baixa pela Evolution e guarda no bucket privado (mesmo do envio). ----
      let tipoMsg = 'texto';
      let metaMsg: Record<string, unknown> | null = null;
      if (audio) {
        tipoMsg = 'audio';
        try {
          const dl = await baixarMidia(instanceName, data);
          const mime = dl.mime || audio.mime;
          const ext = extFromMime(mime);
          const path = `${orgId}/wa-midia/${(provMsgId ?? crypto.randomUUID()).replace(/[^\w-]/g, '')}.${ext}`;
          const up = await admin.storage.from('script-midia').upload(path, dl.bytes, { contentType: mime, upsert: true });
          if (up.error) throw new Error(up.error.message);
          metaMsg = { anexo_path: path, mime, tamanho: dl.bytes.length, nome: `audio.${ext}`, ptt: audio.ptt, seconds: audio.seconds, via: fromMe ? 'webhook_fromMe' : 'webhook' };
        } catch (e) {
          // mídia não baixada: persiste a mensagem como PENDENTE (recuperável), nunca descarta.
          metaMsg = { midia_pendente: true, media_erro: String((e as Error).message ?? 'download').slice(0, 120), mime: audio.mime, ptt: audio.ptt, seconds: audio.seconds, media_key: key, via: fromMe ? 'webhook_fromMe' : 'webhook' };
        }
      }

      if (fromMe) {
        // #7 SAÍDA pelo celular — idempotente por id_externo. Envio da Atenvo já gravou a mesma id → não duplica.
        if (!provMsgId) { await finish('ignorado', { ignorado_motivo: 'fromMe_sem_id' }); return json({ ok: true }); }
        const { data: existente } = await admin.from('mensagens').select('id, origem').eq('organizacao_id', orgId).eq('id_externo', provMsgId).maybeSingle();
        if (existente) {
          if (!existente.origem) await admin.from('mensagens').update({ origem: 'atenvo' }).eq('id', existente.id);
          await finish('processado', { ignorado_motivo: 'fromMe_atenvo' }); return json({ ok: true });
        }
        const nowIso = new Date().toISOString();
        const { error: msgErr } = await admin.from('mensagens').upsert({
          conversa_id: conversaId, organizacao_id: orgId, direcao: 'saida', tipo: tipoMsg,
          conteudo: corpo ?? null, texto_original: corpo ?? null, origem: 'telefone', id_externo: provMsgId,
          status: 'entregue', enviada_em: nowIso, entregue_em: nowIso, metadados: metaMsg ?? { origem: 'telefone', via: 'webhook_fromMe' },
        }, { onConflict: 'id_externo', ignoreDuplicates: true });
        if (msgErr) { await finish('erro', { erro: `mensagens_out:${msgErr.code ?? ''}:${(msgErr.message ?? '').slice(0,180)}` }); return json({ ok: true }); }
        await admin.from('conversas').update({ ultima_interacao_em: nowIso, ultimo_canal_id: canal.id, ultimo_numero: canal.numero_conectado ?? null, ultimo_provider: canal.provider ?? 'whatsapp', ultima_msg_canal_em: nowIso }).eq('id', conversaId);
        await finish('processado', { ignorado_motivo: `fromMe_telefone${tipoMsg === 'audio' ? '_audio' : ''}` }); return json({ ok: true });
      }

      // ENTRADA — texto ou áudio.
      const { error: msgErr } = await admin.from('mensagens').upsert({ conversa_id: conversaId, organizacao_id: orgId, direcao: 'entrada', tipo: tipoMsg, conteudo: corpo ?? null, id_externo: provMsgId, status: 'entregue', recebida_em: new Date().toISOString(), metadados: metaMsg }, { onConflict: 'id_externo', ignoreDuplicates: true });
      await admin.from('conversas').update({ ultima_interacao_em: new Date().toISOString() }).eq('id', conversaId);
      if (msgErr) { await finish('erro', { erro: `mensagens:${msgErr.code ?? ''}:${(msgErr.message ?? '').slice(0,180)}` }); return json({ ok: true }); }
      // Auto-entrada no Kanban: SOMENTE contato recém-criado nesta execução (entrada, não fromMe). Best-effort: nunca quebra o webhook.
      let kanbanErro: string | null = null;
      if (contatoCriadoAgora && contatoId) {
        try {
          const { data: funil } = await admin.from('funis').select('id').eq('organizacao_id', orgId).eq('padrao', true).eq('arquivado', false).limit(1).maybeSingle();
          if (funil?.id) { const { error: re } = await admin.rpc('garantir_oportunidade_entrada', { p_contato: contatoId, p_funil: funil.id, p_origem: 'WhatsApp', p_conversa: conversaId, p_canal: canal.id }); if (re) kanbanErro = `${re.code ?? ''}:${(re.message ?? '').slice(0, 80)}`; }
        } catch (ke) { kanbanErro = String((ke as Error).message ?? 'rpc').slice(0, 80); }
      }
      await finish('processado', { ignorado_motivo: kanbanErro ? ('kanban_erro:' + kanbanErro) : (phone ? null : 'lid_sem_telefone') });
      return json({ ok: true });
    }

    if (event === 'messages.update') {
      const arr = Array.isArray(evt?.data) ? (evt!.data as unknown as Record<string, unknown>[]) : [data];
      let n = 0; let falhas = 0;
      const map: Record<string, string> = { PENDING: 'pendente', SERVER_ACK: 'enviada', DELIVERY_ACK: 'entregue', READ: 'lida', PLAYED: 'lida', ERROR: 'falhou' };
      // ranking p/ status monotônico: o ack só avança (nunca regride enviada<-entregue por ack fora de ordem).
      const RANK: Record<string, number> = { pendente: 0, enviada: 1, entregue: 2, lida: 3 };
      for (const it of arr) {
        const id = ((it.key as { id?: string } | undefined)?.id) ?? (it.keyId as string | undefined);
        const status = (it.status as string | undefined)?.toUpperCase();
        if (!id || !status) continue;
        const novo = map[status];
        if (!novo) continue;
        // estado atual da mensagem (por id_externo) para decidir avanço/regressão.
        const { data: atualRow } = await admin.from('mensagens').select('status').eq('id_externo', id).maybeSingle();
        if (!atualRow) continue;
        const atual = (atualRow.status as string) ?? 'pendente';
        if (novo === 'falhou') {
          // só marca falha se ainda NÃO houve confirmação real de entrega/leitura.
          if (atual === 'entregue' || atual === 'lida') continue;
          const sp = (it.messageStubParameters as unknown);
          const stub = Array.isArray(sp) ? sp.join(',') : (sp != null ? String(sp) : null);
          await admin.from('mensagens').update({ status: 'falhou', erro_envio: `ERROR${stub ? ':' + stub.slice(0, 80) : ''}`, metadados: { erro: { status, remoteJid: (it.remoteJid as string) ?? null, instance: instanceName, stub: stub ?? null, em: new Date().toISOString() } } }).eq('id_externo', id);
          falhas++;
        } else {
          if ((RANK[novo] ?? 0) <= (RANK[atual] ?? -1)) continue; // não regride
          await admin.from('mensagens').update({ status: novo }).eq('id_externo', id); n++;
        }
      }
      await finish('processado', { ignorado_motivo: `acks:${n}${falhas ? ` falhas:${falhas}` : ''}` }); return json({ ok: true });
    }

    await finish('ignorado', { ignorado_motivo: `evento_nao_tratado:${event}` });
    return json({ ok: true });
  } catch (e) { return json({ error: (e as Error).message ?? 'erro' }, 500); }
});
