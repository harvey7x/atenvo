// reviza-wa-webhook — recebe eventos da Evolution (verify_jwt=false; protegido por
// x-webhook-secret). QR, conexão, presença, mensagens (entrada/saída) e entrega.
// v10 (30/09): mídia recebida com RETRY — falha de download em evento recente responde 500
//  (a Evolution reenvia; a mensagem já fica gravada e o reenvio só completa o arquivo);
//  localização/contato/enquete chegam como texto legível (tipo segue 'outro').
// v9: @lid lembrado na conversa, sufixo de aparelho no JID, SAIR com variações (e na legenda).
// v8 (24/09, "envios completos"):
//  · conversa ÚNICA por cliente: (canal, chave DDD+8) — a resposta cai na mesma
//    conversa do envio da régua, e o banco marca "respondeu" no envio;
//  · contatos @lid (identidade nova do WhatsApp) viram telefone pelo remoteJidAlt/
//    senderPn; grupo/status/canal/lista são ignorados;
//  · mensagem temporária/visualização única/editada é aberta; reação conta como resposta;
//  · SAIR/PARAR = opt-out (a régua para de mandar pra esse número);
//  · saúde: ultimo_evento_em no número; queda registra o motivo;
//  · confirmação de entrega que chega ANTES do registro da mensagem espera e tenta de novo;
//  · falha ao gravar = 500 (a Evolution reenvia; o wa_id garante que não duplica).
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { getBase64FromMediaMessage, evolutionConfigured } from './evolution.ts';

const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// comparação constante-time do secret (mesmo padrão do CAF)
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
const soDigitos = (s: string) => (s || '').replace(/\D/g, '');
type Msg = Record<string, unknown>;

/** abre os "envelopes" (temporária, visualização única, editada, doc com legenda) */
function desembrulhar(m: Msg | undefined): Msg | undefined {
  let cur = m;
  for (let i = 0; i < 4 && cur; i++) {
    const inner = (cur.ephemeralMessage ?? cur.viewOnceMessage ?? cur.viewOnceMessageV2 ?? cur.viewOnceMessageV2Extension
      ?? cur.documentWithCaptionMessage ?? cur.editedMessage) as { message?: Msg } | undefined;
    if (inner?.message) { cur = inner.message; continue; }
    const edit = (cur.protocolMessage as { editedMessage?: Msg } | undefined)?.editedMessage;
    if (edit) { cur = edit; continue; }
    break;
  }
  return cur;
}
function textoDe(message: Msg | undefined): string | null {
  if (!message) return null;
  const conv = message.conversation as string | undefined; if (conv) return conv;
  const ext = (message.extendedTextMessage as { text?: string } | undefined)?.text; if (ext) return ext;
  const btn = (message.buttonsResponseMessage as { selectedDisplayText?: string } | undefined)?.selectedDisplayText; if (btn) return btn;
  const lst = (message.listResponseMessage as { title?: string } | undefined)?.title; if (lst) return lst;
  return null;
}
/** tipo + legenda da mídia recebida (formas do Baileys, como no CAF) */
function midiaDe(message: Msg | undefined): { tipo: 'imagem' | 'audio' | 'video' | 'documento' | 'sticker'; caption: string | null; nome: string | null } | null {
  if (!message) return null;
  const img = message.imageMessage as { caption?: string } | undefined;
  if (img) return { tipo: 'imagem', caption: img.caption ?? null, nome: null };
  const vid = message.videoMessage as { caption?: string } | undefined;
  if (vid) return { tipo: 'video', caption: vid.caption ?? null, nome: null };
  const aud = message.audioMessage as Msg | undefined;
  if (aud) return { tipo: 'audio', caption: null, nome: null };
  const doc = message.documentMessage as { fileName?: string; caption?: string } | undefined;
  if (doc) return { tipo: 'documento', caption: doc.caption ?? null, nome: doc.fileName ?? null };
  if (message.stickerMessage) return { tipo: 'sticker', caption: null, nome: null };
  return null;
}
/** tipos sem download (localização, contato, enquete): o tipo segue 'outro', mas o
    CONTEÚDO passa a dizer o que o cliente mandou (antes a bolha só mostrava "[outro]") */
function conteudoEspecial(message: Msg | undefined): string | null {
  if (!message) return null;
  const loc = message.locationMessage as { degreesLatitude?: number; degreesLongitude?: number; name?: string; address?: string } | undefined;
  if (loc) {
    const lugar = [loc.name, loc.address].filter(Boolean).join(', ');
    return `📍 Localização: ${loc.degreesLatitude ?? '?'},${loc.degreesLongitude ?? '?'}${lugar ? ` — ${lugar}` : ''}`;
  }
  const cts = (message.contactsArrayMessage as { contacts?: Msg[] } | undefined)?.contacts;
  const ct = (message.contactMessage ?? cts?.[0]) as { displayName?: string; vcard?: string } | undefined;
  if (ct) {
    // parse leve do vCard (sem lib): primeira linha TEL
    const m = /TEL[^:\r\n]*:([+\d][\d\s().-]*)/i.exec(String(ct.vcard ?? ''));
    const tel = m ? m[1].replace(/[^\d+]/g, '') : '';
    const mais = cts && cts.length > 1 ? ` (+${cts.length - 1})` : '';
    return `Contato: ${ct.displayName || 'sem nome'}${tel ? ` — ${tel}` : ''}${mais}`;
  }
  const poll = (message.pollCreationMessage ?? message.pollCreationMessageV2 ?? message.pollCreationMessageV3) as { name?: string } | undefined;
  if (poll) return `Enquete: ${poll.name || 'sem título'}`;
  return null;
}
/** idade do evento: messageTimestamp em SEGUNDOS (algumas versões mandam Long {low}) */
function tsEventoMs(data: Msg): number {
  const t = data.messageTimestamp as number | string | { low?: number } | null | undefined;
  const s = typeof t === 'object' && t ? Number(t.low ?? 0) : Number(t ?? 0);
  return Number.isFinite(s) && s > 0 ? s * 1000 : 0;
}
const EXT_DE: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
  'video/mp4': 'mp4', 'video/3gpp': '3gp', 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a',
  'application/pdf': 'pdf',
};
/** pedido de parada: "SAIR", "Para", "quero sair", "não quero mais", "SAIR 🙏", "me tira da lista"…
    Só mensagem CURTA (até 7 palavras) — "vou sair do trabalho mais cedo" não é pedido de parada. */
function pediuSair(texto: string | null | undefined): boolean {
  const t = String(texto ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t || t.split(' ').length > 7) return false;
  return /^(sair|parar|para|pare|stop|chega|descadastrar|descadastra|remover)( (por favor|pf|pfv|obrigad[oa]|ja|agora|ok|pls))*$/.test(t)
    || /\b(quero sair|sair da lista|me (tira|tire|remove|remova)|nao (quero|desejo) (mais )?receber|nao quero mais|para de (mandar|enviar)|pare de (mandar|enviar)|parem de (mandar|enviar)|cancelar (as )?mensagens|nao me mande mais)\b/.test(t);
}

/** dígitos do JID sem o sufixo de aparelho ("555193227097:12@s.whatsapp.net" → "555193227097") */
const digitosJid = (jid: string) => soDigitos(String(jid).replace(/[:@].*$/, ''));
/** telefone do contato: JID normal, ou o telefone por trás de um @lid (formas da Evolution v2, como no CAF) */
function telefoneDe(key: Msg, data: Msg): string | null {
  const rj = String(key.remoteJid ?? '');
  if (rj.endsWith('@s.whatsapp.net')) return digitosJid(rj) || null;
  if (rj.endsWith('@lid')) {
    for (const alt of [key.remoteJidAlt, data.remoteJidAlt, key.senderPn, data.senderPn, key.participantPn, key.participantAlt]) {
      const s = String(alt ?? '');
      if (s.endsWith('@s.whatsapp.net')) return digitosJid(s) || null;
      if (/^\d{10,15}$/.test(s)) return s;
    }
  }
  return null;
}

Deno.serve(async (req) => {
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const secret = Deno.env.get('WA_WEBHOOK_SECRET') ?? '';

    // gate por secret (header enviado pela Evolution, configurado no create/setWebhook)
    if (!secret) return json({ error: 'webhook sem secret configurado' }, 503);
    if (!safeEqual(req.headers.get('x-webhook-secret') ?? '', secret)) return json({ error: 'unauthorized' }, 401);

    const evt = await req.json().catch(() => null) as { event?: string; instance?: string; data?: Msg } | null;
    const event = (evt?.event ?? '').toLowerCase();
    const instancia = evt?.instance ?? '';
    const data = (evt?.data ?? {}) as Msg;
    if (!event || !instancia) return json({ ok: true, ignored: 'sem event/instance' });

    const admin = createClient(url, service, { auth: { persistSession: false } });
    const { data: canal } = await admin.from('wa_canais').select('id, estado, ultimo_evento_em').eq('instancia', instancia).maybeSingle();
    if (!canal) return json({ ok: true, ignored: 'canal desconhecido' });

    // saúde: último sinal de vida do número (no máximo 1 escrita por minuto)
    const ult = canal.ultimo_evento_em ? new Date(canal.ultimo_evento_em).getTime() : 0;
    if (Date.now() - ult > 60_000) await admin.from('wa_canais').update({ ultimo_evento_em: new Date().toISOString() }).eq('id', canal.id);

    // ---- QR atualizado ----
    if (event === 'qrcode.updated') {
      const b64 = ((data.qrcode as { base64?: string } | undefined)?.base64) ?? (data.base64 as string | undefined);
      const qr = b64 ? (b64.startsWith('data:') ? b64 : `data:image/png;base64,${b64}`) : null;
      await admin.from('wa_canais').update({ estado: 'conectando', ...(qr ? { qr } : {}) }).eq('id', canal.id);
      return json({ ok: true });
    }

    // ---- estado da conexão ----
    if (event === 'connection.update') {
      const state = (data.state as string) ?? (data.connection as string) ?? '';
      if (state === 'open') {
        const owner = (data.wuid as string) ?? ((data.instance as { owner?: string } | undefined)?.owner) ?? '';
        const numero = soDigitos(String(owner).split('@')[0] || '');
        await admin.from('wa_canais').update({ estado: 'conectado', qr: null, ...(numero ? { numero } : {}), ultimo_erro: null, verificado_em: new Date().toISOString() }).eq('id', canal.id);
      } else if (state === 'connecting') {
        await admin.from('wa_canais').update({ estado: 'conectando' }).eq('id', canal.id);
      } else if (state === 'close') {
        const motivo = data.statusReason != null ? `caiu (código ${String(data.statusReason)}) — reconecte pelo QR em Números` : 'caiu — reconecte pelo QR em Números';
        await admin.from('wa_canais').update({ estado: 'desconectado', ultimo_erro: motivo }).eq('id', canal.id);
      }
      return json({ ok: true });
    }

    // ---- presença: cliente digitando/gravando (some sozinha em 8s) ----
    if (event === 'presence.update') {
      const jid = String((data.id as string) ?? '');
      const tel = jid.endsWith('@s.whatsapp.net') ? soDigitos(jid.split('@')[0] || '') : '';
      if (tel) {
        const pres = (data.presences ?? {}) as Record<string, { lastKnownPresence?: string }>;
        const estado = Object.values(pres)[0]?.lastKnownPresence ?? '';
        const digitando = estado === 'composing' || estado === 'recording';
        const { data: ch } = await admin.rpc('wa_tel_chave', { p: tel });
        if (ch) await admin.from('wa_conversas').update({ digitando_ate: digitando ? new Date(Date.now() + 8000).toISOString() : null })
          .eq('canal_id', canal.id).eq('chave', ch);
      }
      return json({ ok: true });
    }

    // ---- mensagem recebida/enviada ----
    if (event === 'messages.upsert') {
      const key = (data.key ?? {}) as Msg;
      const remoteJid = String(key.remoteJid ?? '');
      if (!remoteJid.endsWith('@s.whatsapp.net') && !remoteJid.endsWith('@lid')) return json({ ok: true, ignored: 'grupo/status/canal' });
      const lid = remoteJid.endsWith('@lid') ? digitosJid(remoteJid) : null;
      let telefone = telefoneDe(key, data);
      if (!telefone && lid) {
        // só veio o @lid: acha a conversa que já foi ligada a esse lid antes
        const { data: cvLid } = await admin.from('wa_conversas').select('telefone').eq('canal_id', canal.id).eq('lid', lid).limit(1).maybeSingle();
        telefone = cvLid?.telefone ?? null;
      }
      if (!telefone) { console.log(JSON.stringify({ ignorado: 'lid sem telefone', instancia, lid })); return json({ ok: true, ignored: 'lid sem telefone' }); }
      const fromMe = key.fromMe === true;
      const waId = (key.id as string) ?? null;
      const bruto = data.message as Msg | undefined;
      const mensagem = desembrulhar(bruto);
      // apagada pelo remetente: marca a original
      const proto = (bruto?.protocolMessage ?? mensagem?.protocolMessage) as { type?: string | number; key?: { id?: string } } | undefined;
      if (proto && (proto.type === 'REVOKE' || proto.type === 0) && proto.key?.id) {
        await admin.from('wa_mensagens').update({ apagada: true }).eq('canal_id', canal.id).eq('wa_id', proto.key.id);
        return json({ ok: true });
      }
      const reacao = (mensagem?.reactionMessage as { text?: string } | undefined);
      const texto = reacao ? (reacao.text ? `Reagiu com ${reacao.text}` : null) : textoDe(mensagem);
      if (reacao && !reacao.text) return json({ ok: true, ignored: 'reação removida' });
      const midia = texto ? null : midiaDe(mensagem);
      const especial = texto || midia ? null : conteudoEspecial(mensagem);
      const pushName = !fromMe ? (data.pushName as string | undefined) : undefined;

      // conversa ÚNICA por cliente (canal + chave DDD+8); o telefone fica no formato do WhatsApp
      const { data: conv, error: eConv } = await admin.from('wa_conversas')
        .upsert({ canal_id: canal.id, telefone, ...(pushName ? { nome_contato: pushName } : {}), ...(lid ? { lid } : {}) }, { onConflict: 'canal_id,chave', ignoreDuplicates: false })
        .select('id').single();
      if (eConv || !conv) { console.error('conversa:', eConv?.message); return json({ ok: false, erro: 'falha ao abrir conversa' }, 500); }

      // mídia: baixa via Evolution e guarda no bucket (falha de download NÃO perde a mensagem;
      // se o evento for recente respondemos 500 lá embaixo — a Evolution reenvia e o retry
      // completa o arquivo da mensagem já gravada)
      let midiaPath: string | null = null;
      let midiaFalhou = false;
      if (midia && midia.tipo !== 'sticker' && evolutionConfigured()) {
        // reenvio da Evolution: mensagem já gravada COM o arquivo não baixa de novo
        if (waId) {
          const { data: ja } = await admin.from('wa_mensagens').select('midia_path').eq('canal_id', canal.id).eq('wa_id', waId).maybeSingle();
          midiaPath = ja?.midia_path ?? null;
        }
        if (!midiaPath) {
          try {
            const m = await getBase64FromMediaMessage(instancia, data);
            const ext = EXT_DE[m.mime] ?? (midia.nome?.split('.').pop() ?? 'bin');
            const path = `entrada/${canal.id}/${(waId ?? crypto.randomUUID()).replace(/[^A-Za-z0-9_-]/g, '')}.${ext}`;
            const up = await admin.storage.from('wa-midia').upload(path, m.bytes, { contentType: m.mime, upsert: true });
            if (up.error) throw new Error(up.error.message);
            midiaPath = path;
          } catch { midiaFalhou = true; /* grava a mensagem sem o arquivo; o retry preenche */ }
        }
      }

      // citação recebida: contextInfo.stanzaId aponta pro wa_id da mensagem original
      let respostaA: string | null = null;
      const ctx = (Object.values(mensagem ?? {}).find((v) => (v as { contextInfo?: { stanzaId?: string } })?.contextInfo?.stanzaId) as { contextInfo?: { stanzaId?: string } } | undefined)?.contextInfo;
      const alvoReacao = (reacao as { key?: { id?: string } } | undefined)?.key?.id;
      const citado = ctx?.stanzaId ?? alvoReacao;
      if (citado) {
        const { data: orig } = await admin.from('wa_mensagens').select('id').eq('canal_id', canal.id).eq('wa_id', citado).maybeSingle();
        respostaA = orig?.id ?? null;
      }

      // mensagem chegou = parou de digitar
      await admin.from('wa_conversas').update({ digitando_ate: null }).eq('id', conv.id);

      // idempotência via (canal_id, wa_id)
      const { error: insErr } = await admin.from('wa_mensagens').insert({
        conversa_id: conv.id, canal_id: canal.id,
        direcao: fromMe ? 'saida' : 'entrada',
        tipo: midia ? midia.tipo : texto ? (reacao ? 'outro' : 'texto') : 'outro',
        conteudo: texto ?? midia?.caption ?? (midia ? midia.nome : especial),
        midia_path: midiaPath, resposta_a: respostaA,
        wa_id: waId, status: fromMe ? 'enviada' : 'entregue',
      });
      if (insErr && /duplicate|unique|23505/i.test(insErr.message)) {
        // reenvio com a mensagem já gravada SEM o arquivo: o retry só completa a mídia (backfill)
        if (midiaPath && waId) {
          await admin.from('wa_mensagens').update({ midia_path: midiaPath }).eq('canal_id', canal.id).eq('wa_id', waId).is('midia_path', null);
        }
      } else if (insErr) { console.error('mensagem:', insErr.message); return json({ ok: false, erro: insErr.message }, 500); }

      // cliente pediu pra sair (texto ou legenda): a régua e os envios em massa param pra este número
      const falou = texto ?? midia?.caption ?? null;
      if (!fromMe && !reacao && pediuSair(falou)) {
        const { data: ch } = await admin.rpc('wa_tel_chave', { p: telefone });
        if (ch) {
          const { data: cv } = await admin.from('wa_conversas').select('lead_id').eq('id', conv.id).maybeSingle();
          const { error: eOpt } = await admin.from('wa_optout').upsert({ chave: ch, telefone, lead_id: cv?.lead_id ?? null, origem: 'cliente', texto: String(falou).slice(0, 120) }, { onConflict: 'chave', ignoreDuplicates: true });
          if (eOpt) { console.error('opt-out:', eOpt.message); return json({ ok: false, erro: 'falha ao registrar o pedido de saída' }, 500); }
        }
      }
      // mídia que falhou em evento RECENTE: 500 pra Evolution reenviar o evento inteiro —
      // a mensagem já está gravada sem o arquivo e o reenvio só completa a mídia (nada duplica).
      // Evento com 24h+ (ou sem wa_id/timestamp) segue 200: reenviar não traria nada, só loop.
      if (midiaFalhou && waId) {
        const ts = tsEventoMs(data);
        if (ts && Date.now() - ts < 24 * 3600_000) return json({ ok: false, erro: 'falha ao baixar a mídia — aguardando reenvio' }, 500);
      }
      return json({ ok: true });
    }

    // ---- status de entrega (saída): entregue/lida/erro — o banco só deixa AVANÇAR ----
    if (event === 'messages.update') {
      const key = (data.key ?? {}) as Msg;
      const waId = (key.id as string) ?? (data.keyId as string) ?? null;
      const st = String((data.status as string) ?? (data.update as { status?: string } | undefined)?.status ?? '').toUpperCase();
      const mapa: Record<string, string> = { DELIVERY_ACK: 'entregue', READ: 'lida', PLAYED: 'lida', SERVER_ACK: 'enviada', ERROR: 'erro' };
      const novo = mapa[st];
      if (waId && novo) {
        // a confirmação pode chegar antes do motor/chat gravar a mensagem: espera e tenta de novo
        for (let i = 0; i < 3; i++) {
          const { data: up } = await admin.from('wa_mensagens').update({ status: novo }).eq('canal_id', canal.id).eq('wa_id', waId).select('id');
          if (up?.length) break;
          await sleep(1500);
        }
      }
      return json({ ok: true });
    }

    return json({ ok: true, ignored: event });
  } catch (e) {
    console.error('webhook:', String((e as Error)?.message ?? e));
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
