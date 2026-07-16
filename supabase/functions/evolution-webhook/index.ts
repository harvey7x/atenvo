// evolution-webhook — eventos da Evolution. Sem JWT. Secret via webhook_config (constante).
// v29: (a) canal 'removido' NÃO é reativado por connection.update (fim do "canal aposentado volta sozinho");
//      (b) consolidação por número virou DETECÇÃO DE CONFLITO (wa_consolidar_canal_por_numero não funde mais
//      silenciosamente — marca conflito_com); (c) entrega suavizada (instavel antes de restrito, 3 erros).
// v28: SAÚDE DE ENTREGA (outbound) separada da sessão. No messages.update, ERROR/DELIVERY_ACK/READ de
//      SAÍDA classificam canais.entrega_status (ok/instavel/restrito): ERROR sem stub→restrito, com stub→
//      instavel; entrega real a destino EXTERNO recupera ok (self-send não conta). NÃO altera envio_restrito
//      nem health_check_status. Filtro de teste agora ignora "Teste de entrega Atenvo" também (não vira lead).
// v27: UM ATENDIMENTO ATIVO POR CONTATO. A conversa deixa de ser chaveada por (contato+canal): cliente
//      que veio pelo ANDRIUS e passa a ser atendido pela URA/LUIZA/RMKT CONTINUA na mesma conversa —
//      só o CANAL ATUAL muda. conversas.canal_id = CANAL ATUAL (card / responder por / continuidade);
//      a AQUISIÇÃO fica congelada em conversas.canal_origem_id. Nenhuma conversa/mensagem é apagada;
//      a duplicata legada é tratada por secundarizar_conversa (arquiva, preserva histórico).
// v26: REMARKETING — antes do dispatch ao bot-runner, chama bot_remarketing_inbound: lead que responde em
//      remarketing volta pra LEAD NOVO (entrada) ANTES do runner checar elegibilidade; opt-out → PERDIDO e
//      pula o dispatch. Best-effort (try/catch): erro/timeout da RPC nunca quebra o webhook nem trava o lead comum.
// v25: FIAÇÃO DO ÁUDIO — no dispatch ao bot-runner, áudio INBOUND curto (≤MAX_AUDIO_SEG/≤MAX_AUDIO_TRANSC,
//      envs) passa o base64 já baixado (getBase64FromMediaMessage) + mime real (ogg, sem codecs) p/ transcrição.
//      Áudio longo/grande NÃO manda base64 → runner cai no aviso+pausa. Só !fromMe (nunca transcreve saída).
// v24 (B3.3): dispatch fire-and-forget ao bot-runner em inbound NOVO de cliente (texto/áudio), dry_run:true
//      FIXO (nunca envia). Gates de negócio são do runner; não bloqueia nem quebra o webhook.
// v23: ao reconectar (connection.update=open) limpa alerta_silenciado do canal ("silenciar até reconexão").
// v22: mensagens do health check (prefixo "Teste automático Atenvo") são ignoradas (ignorado_motivo=
//      health_check) — não criam contato/conversa/lead nem poluem o inbox/relatórios.
// v21: @lid REUSO — evento só com LID consulta wa_lid_map CONFIRMADO por (org,canal,lid) e reutiliza o PN
//      vinculado: resolve o contato certo sem criar novo, sem depender de cache. Mapa não confirmado nunca usado.
// v20: @lid identidade protegida — o LID NUNCA vira nome do contato (sem PN e sem pushName real =>
//      "Identidade protegida", identidade_tipo=lid_pendente). Ao chegar PN (evento real, #7) resolve o
//      estado e corrige o nome placeholder. Grava mapa LID↔PN por CANAL em wa_lid_map (best-effort).
// v19: MÍDIA Fase A — ingere imagem/vídeo/documento/sticker (não só áudio) via midiaOf+baixarMidia:
//      baixa, valida tamanho/ext segura, guarda no bucket privado, persiste tipo+metadados (mime/nome/
//      tamanho/legenda/seconds) e usa a legenda como conteúdo. Falha => pendente recuperável (nunca oculta).
// v18: Inbox Etapa A — inbound NOVO incrementa nao_lidas (idempotente via .select(); nunca fromMe) e
//      REABRE conversa arquivada (arquivada_em=null), subindo ao topo. Webhook repetido não duplica contador.
// v17: auto-recuperação de PN (Caso D #7): inbound com PN real garante a identidade WhatsApp também em
//      contato LID-only já existente (idempotente; não sobrescreve PN confirmado diferente).
// v16: P0 — inbound de TEXTO do cliente falhava no INSERT (metadados NOT NULL/23502) e a mensagem nunca
//      aparecia no painel. Fallback de metadados no caminho de ENTRADA (texto e áudio). Afetava LUIZA/URA/ANDRIUS.
// v15: connection.update(open) auto-consolida canal DUPLICADO do mesmo número (reconexão que criou canal
//      novo) no canal histórico via RPC wa_consolidar_canal_por_numero (idempotente, best-effort).
// v14: INGESTÃO DE ÁUDIO (entrada e fromMe/celular): baixa a mídia (getBase64FromMediaMessage), guarda no
//      bucket privado e persiste tipo='audio' (idempotente por id_externo; falha de download => pendente
//      recuperável). NÃO altera o envio de áudio (evolution-send) nem o parser LID/secret/messages.update.
// v13: registra mensagens fromMe (enviadas pelo celular) como SAÍDA idempotente (#7).
import { corsHeaders, json } from './cors.ts';
import { adminClient } from './client.ts';
import { classificarEntrega, eventoDoStatus, type EntregaStatus } from './entrega.ts';

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
// LGPD: mascara número/JID preservando prefixo + últimos 4 dígitos. Ex.: 5551****1390@s.whatsapp.net
function maskJid(v: unknown): string | null {
  if (typeof v !== 'string' || !v) return null;
  const at = v.indexOf('@');
  const num = at >= 0 ? v.slice(0, at) : v;
  const dom = at >= 0 ? v.slice(at) : '';
  const d = num.replace(/\D/g, '');
  const masked = d.length >= 8 ? `${d.slice(0, 4)}****${d.slice(-4)}` : (d ? '****' : num);
  return masked + dom;
}

// LGPD: whatsapp_webhook_events.payload é DIAGNÓSTICO e NUNCA re-lido por código, então persistimos
// só metadados técnicos + identificadores MASCARADOS. NADA de corpo de mensagem, mídia, citação,
// nome, foto de perfil, tokens/secrets. (Idempotência é por provider_message_id, não pelo payload.)
function sanitize(obj: unknown): unknown {
  try {
    const d = (obj ?? {}) as Record<string, unknown>;
    const key = (d.key ?? {}) as Record<string, unknown>;
    const msg = (unwrapMsg(d.message as Record<string, unknown> | undefined) ?? {}) as Record<string, unknown>;
    const tipos = Object.keys(msg).filter((k) => k !== 'messageContextInfo' && k !== 'contextInfo');
    const texto = textOf(msg);
    const MIDIA = ['imageMessage', 'audioMessage', 'videoMessage', 'documentMessage', 'stickerMessage', 'albumMessage'];
    return {
      status: d.status ?? d.state ?? null,
      statusReason: d.statusReason ?? d.statusCode ?? null,
      instanceId: d.instanceId ?? null,
      source: d.source ?? null,
      messageTimestamp: d.messageTimestamp ?? null,
      messageId: (key.id as string) ?? (d.keyId as string) ?? (d.messageId as string) ?? null,
      remoteJid: maskJid(key.remoteJid ?? d.remoteJid ?? d.wuid),
      participant: maskJid(key.participant),
      fromMe: typeof key.fromMe === 'boolean' ? key.fromMe : (typeof d.fromMe === 'boolean' ? d.fromMe : null),
      addressingMode: key.addressingMode ?? d.addressingMode ?? null,
      messageType: (d.messageType as string) ?? tipos[0] ?? null,
      hasText: typeof texto === 'string' && texto.length > 0,
      textLen: typeof texto === 'string' ? texto.length : 0,
      hasMedia: MIDIA.some((k) => k in msg),
      hasName: !!(d.pushName || d.profileName),
    };
  } catch { return null; }
}

// ---- Mídia (áudio): detecção + download seguro pela Evolution ----
const EVO_BASE = (Deno.env.get('EVOLUTION_API_URL') ?? '').replace(/\/+$/, '');
const EVO_KEY = Deno.env.get('EVOLUTION_API_KEY') ?? '';
// B3.3: base das Edge Functions (para o dispatch fire-and-forget ao bot-runner).
const FUNCTIONS_BASE = (Deno.env.get('SUPABASE_URL') ?? '').replace(/\/+$/, '') + '/functions/v1';
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
function sanitizeNome(n: unknown): string | null {
  const s = typeof n === 'string' ? n.trim() : '';
  if (!s) return null;
  return s.replace(/[/\\]+/g, '_').replace(/[^\w.\- ()]+/g, '_').slice(0, 120) || null; // anti path-traversal
}
function numOrNull(v: unknown): number | null { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; }
// extensão segura por nome de arquivo (se houver) OU por MIME.
function extFor(mime: string, nome: string | null): string {
  if (nome && /\.[a-z0-9]{1,8}$/i.test(nome)) return (nome.split('.').pop() ?? '').toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
  const m = (mime || '').toLowerCase();
  if (m.includes('jpeg') || m.includes('jpg')) return 'jpg'; if (m.includes('png')) return 'png'; if (m.includes('webp')) return 'webp'; if (m.includes('gif')) return 'gif';
  if (m.includes('mp4')) return 'mp4'; if (m.includes('quicktime') || m.includes('mov')) return 'mov'; if (m.includes('3gpp')) return '3gp';
  if (m.includes('pdf')) return 'pdf'; if (m.includes('wordprocessingml')) return 'docx'; if (m.includes('msword')) return 'doc';
  if (m.includes('spreadsheetml')) return 'xlsx'; if (m.includes('ms-excel')) return 'xls'; if (m.includes('zip')) return 'zip'; if (m.includes('text')) return 'txt';
  if (m.includes('audio')) return extFromMime(m);
  return 'bin';
}
interface MidiaDesc { kind: 'imagem' | 'video' | 'audio' | 'documento'; mime: string; nome: string | null; caption: string | null; seconds: number | null; ptt: boolean; tamanho: number | null; }
// descritor genérico de mídia (imagem/vídeo/áudio/documento/sticker), já desembrulhado (ephemeral/viewOnce/docWithCaption).
function midiaOf(message: Record<string, unknown> | undefined): MidiaDesc | null {
  const m = unwrapMsg(message); if (!m) return null;
  const img = m.imageMessage as { mimetype?: string; caption?: string; fileLength?: unknown } | undefined;
  if (img) return { kind: 'imagem', mime: (img.mimetype ?? 'image/jpeg').split(';')[0].trim(), nome: null, caption: img.caption ?? null, seconds: null, ptt: false, tamanho: numOrNull(img.fileLength) };
  const vid = m.videoMessage as { mimetype?: string; caption?: string; seconds?: number; fileLength?: unknown } | undefined;
  if (vid) return { kind: 'video', mime: (vid.mimetype ?? 'video/mp4').split(';')[0].trim(), nome: null, caption: vid.caption ?? null, seconds: typeof vid.seconds === 'number' ? vid.seconds : null, ptt: false, tamanho: numOrNull(vid.fileLength) };
  const aud = m.audioMessage as { mimetype?: string; ptt?: boolean; seconds?: number; fileLength?: unknown } | undefined;
  if (aud) return { kind: 'audio', mime: (aud.mimetype ?? 'audio/ogg').split(';')[0].trim(), nome: null, caption: null, seconds: typeof aud.seconds === 'number' ? aud.seconds : null, ptt: !!aud.ptt, tamanho: numOrNull(aud.fileLength) };
  const doc = m.documentMessage as { mimetype?: string; caption?: string; fileName?: string; title?: string; fileLength?: unknown } | undefined;
  if (doc) return { kind: 'documento', mime: (doc.mimetype ?? 'application/octet-stream').split(';')[0].trim(), nome: sanitizeNome(doc.fileName ?? doc.title), caption: doc.caption ?? null, seconds: null, ptt: false, tamanho: numOrNull(doc.fileLength) };
  const st = m.stickerMessage as { mimetype?: string; fileLength?: unknown } | undefined;
  if (st) return { kind: 'imagem', mime: (st.mimetype ?? 'image/webp').split(';')[0].trim(), nome: 'sticker.webp', caption: null, seconds: null, ptt: false, tamanho: numOrNull(st.fileLength) };
  return null;
}
const MAX_MEDIA = 20 * 1024 * 1024; // limite de segurança p/ áudio
// transcrição tem teto MENOR que o de armazenamento: áudio muito longo/grande NÃO vai pro Gemini
// (custo/contexto) — cai no aviso+pausa. O bucket ainda guarda o arquivo até MAX_MEDIA.
// Env p/ afinar sem redeploy quando vir os áudios reais (idoso fala 2–3 min: default 120s / 8MB).
const MAX_AUDIO_SEG = Number(Deno.env.get('MAX_AUDIO_SEG')) || 120;
const MAX_AUDIO_TRANSC = Number(Deno.env.get('MAX_AUDIO_TRANSC')) || 8 * 1024 * 1024;
// baixa a mídia descriptografada via Evolution (base64). NÃO persiste URL temporária.
async function baixarMidia(instance: string, dataMsg: Record<string, unknown>): Promise<{ bytes: Uint8Array; mime: string; b64: string }> {
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
  return { bytes, mime: (j.mimetype ?? '').split(';')[0].trim() || 'audio/ogg', b64 };
}

// ---- Teste de entrega AO CONECTAR (diagnóstico técnico, NÃO é bot) ----
// Em connection.update=open, envia UM texto ao número interno autorizado e registra em
// canal_health_runs (tipo 'entrega_conexao', aguardando_ack). O ACK REAL chega por messages.update e
// fecha o run (DELIVERY_ACK/READ -> entregue; ERROR -> erro real). O texto casa com o filtro de
// health_check (linha ~264), então NÃO vira lead/conversa. NUNCA altera envio_restrito.
const TESTE_CONEXAO_DESTINO = '5551998872825';                                   // número interno autorizado
const TESTE_CONEXAO_TEXTO = 'Teste de entrega Atenvo: canal conectado com sucesso.';

async function testeEntregaAoConectar(admin: ReturnType<typeof adminClient>, canalId: string, orgId: string) {
  try {
    if (!EVO_BASE || !EVO_KEY) return;
    // Re-lê o canal APÓS a consolidação: conflito/removido/sem-instância abortam o teste.
    const { data: c } = await admin.from('canais')
      .select('tipo, status_integracao, conflito_com, numero_conectado, instancia_externa')
      .eq('id', canalId).maybeSingle();
    if (!c || c.tipo !== 'whatsapp') return;
    if (c.status_integracao !== 'conectado') return;              // conflito vira 'atencao' -> não envia
    if (c.conflito_com) return;                                    // canal em conflito -> não envia
    const inst = c.instancia_externa as string | null;
    if (!inst) return;                                             // sem instância válida
    if (digits((c.numero_conectado as string) ?? '') === TESTE_CONEXAO_DESTINO) return; // nunca self-send
    const t0 = Date.now();
    let ok = false, msgId: string | null = null, erro: string | null = null, http = 0;
    try {
      const res = await fetch(`${EVO_BASE}/message/sendText/${inst}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'apikey': EVO_KEY },
        body: JSON.stringify({ number: TESTE_CONEXAO_DESTINO, text: TESTE_CONEXAO_TEXTO }),
      });
      http = res.status;
      const b = await res.json().catch(() => null) as { key?: { id?: string } } | null;
      msgId = b?.key?.id ?? null;
      ok = res.ok && !!msgId;
      if (!ok) erro = `send HTTP ${res.status}`;
    } catch (e) { erro = (e as Error).message; }
    await admin.from('canal_health_runs').insert({
      organizacao_id: orgId, canal_id: canalId, executado_em: new Date().toISOString(),
      tipo: 'entrega_conexao',
      sucesso: false,                                              // só vira true no ACK REAL de entrega
      status_resultado: ok ? 'aguardando_ack' : String(http || 'erro'),
      erro, erro_tipo: ok ? null : 'infra',
      message_id: msgId, instancia_externa: inst, target_phone: TESTE_CONEXAO_DESTINO,
      latencia_ms: Date.now() - t0,
      dados: { aguardando_ack: ok, origem: 'connection.update:open' },
    });
  } catch { /* diagnóstico NUNCA pode quebrar o webhook */ }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const admin = adminClient();
  try {
    const url = new URL(req.url);
    const { data: cfg } = await admin.from('webhook_config').select('secret').eq('chave', 'whatsapp').maybeSingle();
    const expected = cfg?.secret ?? '';
    // C2 concluída: auth SOMENTE por header x-webhook-secret. Fallback de ?secret= REMOVIDO —
    // o segredo nunca trafega na URL (logs/proxies/painel da Evolution). Instâncias novas/reconectadas
    // e o refresh_webhook (evolution-manage) já gravam a URL sem secret + header.
    const hdrSecret = req.headers.get('x-webhook-secret') ?? '';
    if (!expected || !safeEqual(hdrSecret, expected)) return json({ error: 'unauthorized' }, 401);

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

    const { data: canal } = await admin.from('canais').select('id, organizacao_id, numero_conectado, provider, status_integracao, entrega_status, entrega_erros_recentes').eq('instancia_externa', instanceName).maybeSingle();

    const { data: track } = await admin.from('whatsapp_webhook_events').insert({
      organizacao_id: canal?.organizacao_id ?? null, canal_id: canal?.id ?? null, instance_name: instanceName, instance_id: instanceId,
      event, provider_message_id: provMsgId, remote_jid: maskJid(remoteJid), addressing_mode: addressing, from_me: fromMe, payload: sanitize(data), status_processamento: 'recebido',
    }).select('id').single();
    const trackId = track?.id as string | undefined;
    const finish = async (status: string, extra: Record<string, unknown> = {}) => { if (trackId) await admin.from('whatsapp_webhook_events').update({ status_processamento: status, processado_em: new Date().toISOString(), ...extra }).eq('id', trackId); };

    if (!canal) { await finish('erro', { erro: 'INSTANCE_NOT_MAPPED', ignorado_motivo: instanceName }); return json({ ok: true, ignored: 'canal desconhecido' }); }
    const orgId = canal.organizacao_id as string;

    if (event === 'connection.update') {
      const state = (data.state as string) ?? (data.connection as string);
      if (state === 'open') {
        // Canal APOSENTADO/removido NÃO é ressuscitado por um evento de conexão (instância zumbi / reconexão indevida).
        if (canal.status_integracao === 'removido') { await finish('ignorado', { ignorado_motivo: 'canal_removido' }); return json({ ok: true }); }
        const numero = digits((data.wuid as string) ?? (data.ownerJid as string));
        // v23: reconectou → limpa silêncio de alerta ("silenciar até reconexão" se resolve sozinho).
        await admin.from('canais').update({ status_integracao: 'conectado', ativo: true, ...(numero ? { numero_conectado: numero } : {}), conectado_em: new Date().toISOString(), ultima_sincronizacao: new Date().toISOString(), alerta_silenciado: false, alerta_silenciado_ate: null, alerta_silenciado_motivo: null, alerta_silenciado_por: null }).eq('id', canal.id);
        await admin.from('integracoes').update({ status: 'conectado' }).eq('canal_id', canal.id);
        // Auto-cura de canal DUPLICADO do mesmo número (reconexão que criou canal novo em vez de reusar o
        // histórico): reabsorve no canal histórico, preservando conversas/histórico. Idempotente (best-effort).
        if (numero) { try { await admin.rpc('wa_consolidar_canal_por_numero', { p_org: canal.organizacao_id, p_canal_ativo: canal.id }); } catch { /* não quebra o webhook */ } }
        // Teste de entrega técnico ao conectar (após a consolidação, p/ não disparar em canal conflitado).
        await testeEntregaAoConectar(admin, canal.id as string, orgId);
      } else if (state === 'close') { await admin.from('canais').update({ status_integracao: 'desconectado' }).eq('id', canal.id); }
      await finish('processado'); return json({ ok: true });
    }
    if (event === 'qrcode.updated') { await admin.from('integracoes').update({ status: 'sincronizando', ultima_sincronizacao: new Date().toISOString() }).eq('canal_id', canal.id); await finish('processado'); return json({ ok: true }); }

    if (event === 'messages.upsert') {
      // #7: NÃO descartamos mais fromMe. Grupo segue não suportado.
      if ((remoteJid ?? '').endsWith('@g.us')) { await finish('ignorado', { ignorado_motivo: 'grupo_nao_suportado' }); return json({ ok: true }); }

      // remoteJid é a OUTRA parte tanto na entrada (remetente) quanto na saída (destinatário) → resolução idêntica.
      let phoneJid = firstEndingWith([remoteJid, key.remoteJidAlt as string, data.remoteJidAlt as string, key.participantAlt as string, data.participantAlt as string, key.participant as string, data.participant as string], '@s.whatsapp.net');
      const lidJid = firstEndingWith([remoteJid, key.remoteJidAlt as string, data.remoteJidAlt as string, key.participant as string, data.participant as string], '@lid');
      let phone = digits(phoneJid); const lid = digits(lidJid);
      const msgObj = data.message as Record<string, unknown> | undefined;
      const corpo = textOf(msgObj);
      const midia = midiaOf(msgObj);
      const conteudoMsg = corpo ?? midia?.caption ?? null; // legenda da mídia vira o texto exibido
      // v22: mensagens do HEALTH CHECK (wa-health-check) não viram lead/conversa/inbox. Marcador estável no texto.
      if (corpo && /^\s*teste (autom[aá]tico|de entrega) atenvo\b/i.test(corpo)) { await finish('ignorado', { ignorado_motivo: 'health_check' }); return json({ ok: true }); }
      if (!corpo && !midia) { await finish('ignorado', { ignorado_motivo: 'sem_conteudo' }); return json({ ok: true }); }
      if (!phone && !lid) { await finish('ignorado', { ignorado_motivo: 'sem_identificador' }); return json({ ok: true }); }
      // v21: evento SÓ com LID → consulta o mapa CONFIRMADO por (org, canal, lid) e REUTILIZA o PN já vinculado
      //      (manual ou anterior). Isso resolve o contato correto sem criar novo e sem depender de cache em memória.
      //      NUNCA usa mapa não confirmado nem PN sem telefone.
      let resolvidoViaMapa = false;
      if (!phone && lid) {
        const { data: mp } = await admin.from('wa_lid_map').select('telefone_normalizado, jid_telefone')
          .eq('organizacao_id', orgId).eq('canal_id', canal.id).eq('lid', lid).eq('confirmado', true)
          .not('telefone_normalizado', 'is', null).maybeSingle();
        if (mp?.telefone_normalizado) { phone = mp.telefone_normalizado; phoneJid = mp.jid_telefone ?? `${phone}@s.whatsapp.net`; resolvidoViaMapa = true; }
      }
      // Em saída o pushName é do dono da conta (não do destinatário) → não usar como nome do contato.
      // v19: o LID NUNCA vira nome. Sem PN e sem pushName real → "Identidade protegida" (pendente).
      const agoraIso = new Date().toISOString();
      const pushNameReal = !fromMe ? sanitizeNome(data.pushName as string) : null;
      const nomeContato = pushNameReal ?? phone ?? 'Identidade protegida';
      const identTipo = phone ? 'telefone' : 'lid_pendente';

      let contatoId: string | null = null;
      let contatoCriadoAgora = false; // true apenas no ramo que INSERE contato novo (auto-entrada no Kanban)
      if (phone) { const { data: i } = await admin.from('contato_identidades').select('contato_id').eq('organizacao_id', orgId).eq('tipo', 'whatsapp').eq('valor_normalizado', phone).maybeSingle(); if (i) contatoId = i.contato_id; }
      if (!contatoId && lid) { const { data: i } = await admin.from('contato_identidades').select('contato_id').eq('organizacao_id', orgId).eq('tipo', 'outro').eq('provedor', 'evolution_lid').eq('valor_normalizado', lid).maybeSingle(); if (i) contatoId = i.contato_id; }
      if (!contatoId && phone) { const { data: c } = await admin.from('contatos').select('id').eq('organizacao_id', orgId).eq('telefone', phone).maybeSingle(); if (c) contatoId = c.id; }
      if (!contatoId) {
        const { data: novo, error: e1 } = await admin.from('contatos').insert({ nome: nomeContato, telefone: phone ?? null, origem: 'WhatsApp', organizacao_id: orgId, identidade_tipo: identTipo, identidade_fonte: phone ? 'webhook_pn' : 'webhook_lid', identidade_resolvida_em: phone ? agoraIso : null }).select('id').single();
        if (e1 || !novo) { await finish('erro', { erro: `contatos:${e1?.code ?? ''}:${(e1?.message ?? 'sem retorno').slice(0,180)}` }); return json({ ok: true }); }
        contatoId = novo.id;
        contatoCriadoAgora = true;
      }
      // #7 AUTO-RECUPERAÇÃO de PN vindo de evento REAL: garante a identidade WhatsApp (PN) do contato — vale
      // para contato novo E para contato LID-only que passe a receber um PN. Idempotente; NÃO sobrescreve um
      // PN confirmado DIFERENTE já existente (conflito -> mantém o existente, não cria duplicado).
      if (phone) {
        const { data: jaWa } = await admin.from('contato_identidades').select('valor_normalizado').eq('contato_id', contatoId).eq('tipo', 'whatsapp');
        const temEste = (jaWa ?? []).some((r) => r.valor_normalizado === phone);
        const temOutro = (jaWa ?? []).some((r) => r.valor_normalizado !== phone);
        if (!temEste && !temOutro) {
          await admin.from('contato_identidades').insert({ contato_id: contatoId, organizacao_id: orgId, tipo: 'whatsapp', provedor: 'evolution', valor: phoneJid ?? phone, valor_normalizado: phone, principal: true, metadados: { origem: 'webhook' } });
          // resolve identidade: grava telefone/estado e corrige o nome se estava como "Identidade protegida" (nunca sobrescreve nome real).
          await admin.from('contatos').update({ telefone: phone, identidade_tipo: 'telefone', identidade_resolvida_em: agoraIso, identidade_fonte: 'webhook_pn' }).eq('id', contatoId).is('telefone', null);
          await admin.from('contatos').update({ nome: pushNameReal ?? phone }).eq('id', contatoId).eq('nome', 'Identidade protegida');
        }
      }
      if (lid) { const { data: ex } = await admin.from('contato_identidades').select('id').eq('organizacao_id', orgId).eq('tipo', 'outro').eq('provedor', 'evolution_lid').eq('valor_normalizado', lid).maybeSingle(); if (!ex) await admin.from('contato_identidades').insert({ contato_id: contatoId, organizacao_id: orgId, tipo: 'outro', provedor: 'evolution_lid', valor: lidJid ?? lid, valor_normalizado: lid, principal: false }); }
      // v19: mapa LID↔PN por CANAL (o mesmo LID pode ser pessoas diferentes em números distintos). Best-effort.
      if (lid) {
        try {
          const { data: mapRow } = await admin.from('wa_lid_map').select('id, telefone_normalizado').eq('organizacao_id', orgId).eq('canal_id', canal.id).eq('lid', lid).maybeSingle();
          if (!mapRow) await admin.from('wa_lid_map').insert({ organizacao_id: orgId, canal_id: canal.id, lid, jid_telefone: phoneJid ?? null, telefone_normalizado: phone ?? null, fonte: 'webhook', confirmado: !!phone });
          else if (phone && mapRow.telefone_normalizado !== phone) await admin.from('wa_lid_map').update({ jid_telefone: phoneJid ?? null, telefone_normalizado: phone, confirmado: true }).eq('id', mapRow.id);
        } catch { /* não bloqueia o webhook */ }
      }

      // v27: UM atendimento ativo por CONTATO (a conversa NÃO é mais chaveada por canal).
      // Cliente que veio pelo ANDRIUS e passa a ser atendido pela URA/LUIZA/RMKT continua na MESMA
      // conversa — só o CANAL ATUAL (canal_id) muda. Isso mata a duplicata visual na lista.
      // Preferimos a conversa NÃO arquivada; uma arquivada (ex.: secundarizada) só é reusada se for a
      // ÚNICA — aí o fluxo de reabertura abaixo a traz de volta (cliente voltou a falar).
      let conversaId: string | null = null;
      const { data: conv } = await admin.from('conversas')
        .select('id')
        .eq('organizacao_id', orgId).eq('contato_id', contatoId)
        .neq('status', 'fechada')
        .order('arquivada_em', { ascending: true, nullsFirst: true })     // não-arquivada primeiro
        .order('ultima_interacao_em', { ascending: false, nullsFirst: false })
        .limit(1).maybeSingle();
      if (conv) conversaId = conv.id;
      else {
        // conversa nova: canal_id = canal ATUAL; canal_origem_id = canal de AQUISIÇÃO (imutável).
        const { data: nc, error: e2 } = await admin.from('conversas')
          .insert({ organizacao_id: orgId, contato_id: contatoId, canal_id: canal.id, canal_origem_id: canal.id, status: 'aberta' })
          .select('id').single();
        if (e2 || !nc) { await finish('erro', { erro: `conversas:${e2?.code ?? ''}:${(e2?.message ?? 'sem retorno').slice(0,180)}` }); return json({ ok: true }); }
        conversaId = nc.id;
      }

      // ---- MÍDIA (imagem/vídeo/áudio/documento/sticker): baixa pela Evolution e guarda no bucket privado. ----
      // Mesma cadeia do áudio (getBase64FromMediaMessage). Falha de download => PENDENTE recuperável, nunca descarta.
      const viaTag = fromMe ? 'webhook_fromMe' : 'webhook';
      let tipoMsg = 'texto';
      let metaMsg: Record<string, unknown> | null = null;
      let audioB64: string | null = null;   // base64 SÓ p/ áudio INBOUND dentro do teto de transcrição
      let audioMime: string | null = null;
      if (midia) {
        tipoMsg = midia.kind;
        const baseMeta = { mime: midia.mime, nome: midia.nome, ptt: midia.ptt, seconds: midia.seconds, tamanho: midia.tamanho, legenda: midia.caption, via: viaTag };
        if (midia.tamanho && midia.tamanho > MAX_MEDIA) {
          metaMsg = { ...baseMeta, midia_pendente: true, media_erro: 'arquivo_excede_limite', status_midia: 'falhou', media_key: key };
        } else {
          try {
            const dl = await baixarMidia(instanceName, data);
            if (dl.bytes.length > MAX_MEDIA) throw new Error('arquivo_excede_limite');
            const mime = dl.mime || midia.mime;
            const ext = extFor(mime, midia.nome);
            const path = `${orgId}/wa-midia/${(provMsgId ?? crypto.randomUUID()).replace(/[^\w-]/g, '')}.${ext}`;
            const up = await admin.storage.from('script-midia').upload(path, dl.bytes, { contentType: mime, upsert: true });
            if (up.error) throw new Error(up.error.message);
            metaMsg = { ...baseMeta, mime, tamanho: dl.bytes.length, nome: midia.nome ?? `${midia.kind}.${ext}`, anexo_path: path, status_midia: 'disponivel' };
            // áudio INBOUND curto → guarda o base64 p/ o bot-runner transcrever (Gemini). Longo/grande → withhold (aviso+pausa).
            if (!fromMe && midia.kind === 'audio' && dl.bytes.length <= MAX_AUDIO_TRANSC && (midia.seconds == null || midia.seconds <= MAX_AUDIO_SEG)) {
              audioB64 = dl.b64; audioMime = mime;
            }
          } catch (e) {
            // mídia não baixada: persiste a mensagem como PENDENTE (recuperável), nunca descarta.
            metaMsg = { ...baseMeta, midia_pendente: true, media_erro: String((e as Error).message ?? 'download').slice(0, 120), status_midia: 'falhou', media_key: key };
          }
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
          conteudo: conteudoMsg ?? null, texto_original: conteudoMsg ?? null, origem: 'telefone', id_externo: provMsgId,
          status: 'entregue', enviada_em: nowIso, entregue_em: nowIso, metadados: metaMsg ?? { origem: 'telefone', via: 'webhook_fromMe' },
        }, { onConflict: 'id_externo', ignoreDuplicates: true });
        if (msgErr) { await finish('erro', { erro: `mensagens_out:${msgErr.code ?? ''}:${(msgErr.message ?? '').slice(0,180)}` }); return json({ ok: true }); }
        // v27: saída pelo celular também move o CANAL ATUAL (atendente passou a falar por outro número).
        await admin.from('conversas').update({ ultima_interacao_em: nowIso, canal_id: canal.id, ultimo_canal_id: canal.id, ultimo_numero: canal.numero_conectado ?? null, ultimo_provider: canal.provider ?? 'whatsapp', ultima_msg_canal_em: nowIso }).eq('id', conversaId);
        await finish('processado', { ignorado_motivo: `fromMe_telefone${tipoMsg !== 'texto' ? '_' + tipoMsg : ''}` }); return json({ ok: true });
      }

      // ENTRADA — texto ou áudio.
      // metadados é NOT NULL: texto não preenche metaMsg (só áudio) — usar fallback p/ não violar a constraint
      // (era a causa do P0: inbound de TEXTO do cliente falhava com 23502 e a mensagem nunca aparecia no painel).
      const nowEntradaIso = new Date().toISOString();
      // .select() para saber se o INSERT criou linha NOVA (ignoreDuplicates → array vazio em webhook repetido):
      // só então incrementamos não lidas e reabrimos arquivada — evita duplo-incremento por reentrega.
      const { data: insArr, error: msgErr } = await admin.from('mensagens').upsert({ conversa_id: conversaId, organizacao_id: orgId, direcao: 'entrada', tipo: tipoMsg, conteudo: conteudoMsg ?? null, id_externo: provMsgId, status: 'entregue', recebida_em: nowEntradaIso, metadados: metaMsg ?? { via: 'webhook', origem: 'cliente' } }, { onConflict: 'id_externo', ignoreDuplicates: true }).select('id');
      if (msgErr) { await finish('erro', { erro: `mensagens:${msgErr.code ?? ''}:${(msgErr.message ?? '').slice(0,180)}` }); return json({ ok: true }); }
      const inboundNovo = Array.isArray(insArr) && insArr.length > 0; // false em reentrega (idempotente)
      // v27: CANAL ATUAL do atendimento = o número por onde o cliente acabou de falar. canal_id passa a
      // ser "canal atual" (card + continuidade); ultimo_canal_* alimenta o "Responder por".
      // A AQUISIÇÃO fica congelada em canal_origem_id (nunca é tocada aqui).
      const canalPatch = {
        canal_id: canal.id,
        ultimo_canal_id: canal.id,
        ultimo_numero: canal.numero_conectado ?? null,
        ultimo_provider: canal.provider ?? 'whatsapp',
        ultima_msg_canal_em: nowEntradaIso,
      };
      if (inboundNovo) {
        // não lida operacional++ (nunca conta fromMe — este é o ramo de ENTRADA) e REABRE conversa arquivada.
        const { data: cv } = await admin.from('conversas').select('nao_lidas, arquivada_em').eq('id', conversaId).maybeSingle();
        await admin.from('conversas').update({
          ultima_interacao_em: nowEntradaIso,
          nao_lidas: (cv?.nao_lidas ?? 0) + 1,
          ...canalPatch,
          ...(cv?.arquivada_em ? { arquivada_em: null, arquivada_por: null } : {}),
        }).eq('id', conversaId);
      } else {
        await admin.from('conversas').update({ ultima_interacao_em: nowEntradaIso, ...canalPatch }).eq('id', conversaId);
      }

      const inboundMsgId = (insArr?.[0]?.id as string | undefined) ?? null;

      // ---- REMARKETING: se o lead estava numa cadência, re-roteia a opp ANTES do dispatch ao runner.
      //      respondeu → opp volta pra LEAD NOVO (entrada), senão bot_pode_atuar bloquearia o lead que respondeu;
      //      opt-out → PERDIDO + NÃO dispara o bot. AWAITED de propósito: o move de coluna precisa commitar
      //      antes do fetch fire-and-forget. Best-effort: erro NUNCA afeta o fluxo normal (lead comum segue igual).
      let rmktDesfecho: string | null = null;
      if (inboundNovo && inboundMsgId) {
        try {
          const { data: r } = await admin.rpc('bot_remarketing_inbound', { p_conversa: conversaId, p_texto: conteudoMsg ?? '' });
          rmktDesfecho = (r as string) ?? null;
        } catch { /* best-effort: erro/timeout do remarketing nunca quebra o webhook */ }
      }

      // ---- B3.3: dispatch fire-and-forget ao bot-runner (só inbound NOVO de cliente, texto/áudio) ----
      // dry_run:true FIXO → o bot só simula/loga; jamais envia a cliente. Os gates de negócio (master,
      // bot_pode_atuar, humano/responsável, precisa_humano, idempotência, lock, saúde do canal) são do
      // RUNNER (fonte de verdade). Aqui só o filtro básico. Nunca bloqueia nem quebra o webhook.
      if (inboundNovo && inboundMsgId && rmktDesfecho !== 'optout' && (tipoMsg === 'texto' || tipoMsg === 'audio')) {
        const dispatch = (async () => {
          try {
            const { data: bs } = await admin.from('webhook_config').select('secret').eq('chave', 'bot_runner').maybeSingle();
            if (!bs?.secret) return;
            await fetch(`${FUNCTIONS_BASE}/bot-runner`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'x-bot-secret': bs.secret as string },
              body: JSON.stringify({ conversa_id: conversaId, inbound_msg_id: inboundMsgId, inbound_text: conteudoMsg ?? '', inbound_tipo: tipoMsg, dry_run: true, ...(audioB64 ? { inbound_audio_b64: audioB64, inbound_audio_mime: audioMime } : {}) }),
            });
          } catch { /* fire-and-forget: erro do runner nunca afeta o webhook */ }
        })();
        try { (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime?.waitUntil?.(dispatch); } catch { /* sem waitUntil: segue fire-and-forget */ }
      }

      // Auto-entrada no Kanban: SOMENTE contato recém-criado nesta execução (entrada, não fromMe). Best-effort: nunca quebra o webhook.
      let kanbanErro: string | null = null;
      if (contatoCriadoAgora && contatoId) {
        try {
          const { data: funil } = await admin.from('funis').select('id').eq('organizacao_id', orgId).eq('padrao', true).eq('arquivado', false).limit(1).maybeSingle();
          if (funil?.id) { const { error: re } = await admin.rpc('garantir_oportunidade_entrada', { p_contato: contatoId, p_funil: funil.id, p_origem: 'WhatsApp', p_conversa: conversaId, p_canal: canal.id }); if (re) kanbanErro = `${re.code ?? ''}:${(re.message ?? '').slice(0, 80)}`; }
        } catch (ke) { kanbanErro = String((ke as Error).message ?? 'rpc').slice(0, 80); }
      }
      await finish('processado', { ignorado_motivo: kanbanErro ? ('kanban_erro:' + kanbanErro) : (resolvidoViaMapa ? 'lid_resolvido_via_mapa' : (phone ? null : 'lid_sem_telefone')) });
      return json({ ok: true });
    }

    if (event === 'messages.update') {
      const arr = Array.isArray(evt?.data) ? (evt!.data as unknown as Record<string, unknown>[]) : [data];
      let n = 0; let falhas = 0;
      const map: Record<string, string> = { PENDING: 'pendente', SERVER_ACK: 'enviada', DELIVERY_ACK: 'entregue', READ: 'lida', PLAYED: 'lida', ERROR: 'falhou' };
      // ranking p/ status monotônico: o ack só avança (nunca regride enviada<-entregue por ack fora de ordem).
      const RANK: Record<string, number> = { pendente: 0, enviada: 1, entregue: 2, lida: 3 };
      // Saúde de ENTREGA (outbound) — acumula o efeito dos ACKs deste lote no canal. Independe do
      // health_check_status (sessão) e NÃO altera envio_restrito. canal é garantido não-nulo aqui (guard acima).
      let entregaEstado: { status: EntregaStatus; erros: number } = {
        status: ((canal.entrega_status as EntregaStatus) ?? 'desconhecido'), erros: (canal.entrega_erros_recentes as number) ?? 0,
      };
      let entregaTocou = false, entregaErroEm = false;
      const numCanal = digits(canal.numero_conectado as string);
      // aplica um evento de entrega ao estado acumulado do canal (destino externo = prova real).
      const aplicaEntrega = (statusProv: string, temStub: boolean, externo: boolean) => {
        const ev = eventoDoStatus(statusProv, temStub, externo);
        if (!ev) return;
        const patch = classificarEntrega(ev, entregaEstado);
        if (patch) { entregaEstado = { status: patch.entrega_status, erros: patch.entrega_erros_recentes }; entregaTocou = true; if (patch.marcarErroEm) entregaErroEm = true; }
      };
      for (const it of arr) {
        const id = ((it.key as { id?: string } | undefined)?.id) ?? (it.keyId as string | undefined);
        const status = (it.status as string | undefined)?.toUpperCase();
        if (!id || !status) continue;
        const novo = map[status];
        if (!novo) continue;
        const sp = (it.messageStubParameters as unknown);
        const stub = Array.isArray(sp) ? sp.join(',') : (sp != null ? String(sp) : null);
        // estado atual da mensagem (por id_externo) para decidir avanço/regressão.
        const { data: atualRow } = await admin.from('mensagens').select('status, direcao').eq('id_externo', id).maybeSingle();
        if (!atualRow) {
          // Fase 2: pode ser o ACK de um PROBE de entrega (não vive em mensagens, e sim em canal_health_runs).
          const { data: run } = await admin.from('canal_health_runs')
            .select('id, dados').eq('message_id', id).in('tipo', ['entrega', 'entrega_conexao']).eq('canal_id', canal.id)
            .order('criado_em', { ascending: false }).limit(1).maybeSingle();
          if (run && (run.dados as { aguardando_ack?: boolean } | null)?.aguardando_ack) {
            aplicaEntrega(status, !!stub, true);                              // probe = destino externo autorizado
            const entregue = status === 'DELIVERY_ACK' || status === 'READ' || status === 'PLAYED';
            await admin.from('canal_health_runs').update({
              sucesso: entregue, status_resultado: entregue ? 'entregue' : status,
              erro: entregue ? null : `ERROR${stub ? ':' + stub.slice(0, 80) : ''}`,
              erro_tipo: entregue ? null : (stub ? 'instavel' : 'restrito'),
              dados: { ...(run.dados as object), aguardando_ack: false, ack: status },
            }).eq('id', run.id);
          }
          continue;
        }
        const atual = (atualRow.status as string) ?? 'pendente';
        if (novo === 'falhou') {
          // só marca falha se ainda NÃO houve confirmação real de entrega/leitura.
          if (atual === 'entregue' || atual === 'lida') continue;
          await admin.from('mensagens').update({ status: 'falhou', erro_envio: `ERROR${stub ? ':' + stub.slice(0, 80) : ''}`, metadados: { erro: { status, remoteJid: (it.remoteJid as string) ?? null, instance: instanceName, stub: stub ?? null, em: new Date().toISOString() } } }).eq('id_externo', id);
          falhas++;
        } else {
          if ((RANK[novo] ?? 0) <= (RANK[atual] ?? -1)) continue; // não regride
          await admin.from('mensagens').update({ status: novo }).eq('id_externo', id); n++;
        }
        // ---- classifica ENTREGA só p/ mensagem de SAÍDA (ACK é sobre o que ENVIAMOS) ----
        if ((atualRow.direcao as string) === 'saida') {
          const destino = digits(it.remoteJid as string);
          aplicaEntrega(status, !!stub, !!destino && destino !== numCanal);   // self-send não prova entrega a cliente
        }
      }
      if (entregaTocou) {
        await admin.from('canais').update({
          entrega_status: entregaEstado.status, entrega_erros_recentes: entregaEstado.erros,
          ...(entregaErroEm ? { entrega_ultimo_erro_em: new Date().toISOString() } : {}),
        }).eq('id', canal.id); // NÃO toca health_check_status nem envio_restrito
      }
      await finish('processado', { ignorado_motivo: `acks:${n}${falhas ? ` falhas:${falhas}` : ''}${entregaTocou ? ` entrega:${entregaEstado.status}` : ''}` }); return json({ ok: true });
    }

    await finish('ignorado', { ignorado_motivo: `evento_nao_tratado:${event}` });
    return json({ ok: true });
  } catch (e) { return json({ error: (e as Error).message ?? 'erro' }, 500); }
});
