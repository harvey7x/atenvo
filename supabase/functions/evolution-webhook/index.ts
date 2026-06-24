// evolution-webhook — recebe eventos da Evolution (QR, conexão, mensagens).
// Deploy com --no-verify-jwt. Autenticação via ?secret=EVOLUTION_WEBHOOK_SECRET.
// Idempotência de mensagens por id_externo (índice único em mensagens.id_externo).
import { corsHeaders, json } from '../_shared/cors.ts';
import { adminClient } from '../_shared/client.ts';

function normalizeNumber(jid?: string | null): string | null {
  if (!jid) return null;
  return jid.replace(/@.*/, '').replace(/[^0-9]/g, '') || null;
}
function textOf(message: Record<string, unknown> | undefined): string | null {
  if (!message) return null;
  const conv = message.conversation as string | undefined;
  if (conv) return conv;
  const ext = (message.extendedTextMessage as { text?: string } | undefined)?.text;
  return ext ?? null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const url = new URL(req.url);
    const expected = Deno.env.get('EVOLUTION_WEBHOOK_SECRET') ?? '';
    if (!expected || url.searchParams.get('secret') !== expected) return json({ error: 'unauthorized' }, 401);

    const evt = await req.json().catch(() => null) as
      | { event?: string; instance?: string; data?: Record<string, unknown> }
      | null;
    if (!evt?.event || !evt.instance) return json({ ok: true, ignored: true });

    const admin = adminClient();
    const event = evt.event.toLowerCase();
    const data = evt.data ?? {};

    // resolve canal/org pela instância
    const { data: canal } = await admin.from('canais')
      .select('id, organizacao_id, fonte_aquisicao_id').eq('instancia_externa', evt.instance).maybeSingle();
    if (!canal) return json({ ok: true, ignored: 'canal desconhecido' });
    const orgId = canal.organizacao_id as string;

    // -------- conexão --------
    if (event === 'connection.update') {
      const state = (data.state as string) ?? (data.connection as string);
      if (state === 'open') {
        const numero = normalizeNumber((data.wuid as string) ?? (data.ownerJid as string));
        await admin.from('canais').update({
          status_integracao: 'conectado', ativo: true,
          ...(numero ? { numero_conectado: numero } : {}),
          conectado_em: new Date().toISOString(), ultima_sincronizacao: new Date().toISOString(),
        }).eq('id', canal.id);
        await admin.from('integracoes').update({ status: 'conectado' }).eq('canal_id', canal.id);
      } else if (state === 'close') {
        await admin.from('canais').update({ status_integracao: 'desconectado' }).eq('id', canal.id);
      }
      return json({ ok: true });
    }

    // -------- QR atualizado --------
    if (event === 'qrcode.updated') {
      await admin.from('integracoes').update({
        status: 'sincronizando', ultima_sincronizacao: new Date().toISOString(),
      }).eq('canal_id', canal.id);
      return json({ ok: true });
    }

    // -------- mensagem recebida --------
    if (event === 'messages.upsert') {
      const key = (data.key ?? {}) as { remoteJid?: string; fromMe?: boolean; id?: string };
      if (key.fromMe) return json({ ok: true, ignored: 'fromMe' }); // eco do envio (já persistido)
      if ((key.remoteJid ?? '').endsWith('@g.us')) return json({ ok: true, ignored: 'grupo' }); // grupos fora de escopo
      const numero = normalizeNumber(key.remoteJid);
      const corpo = textOf(data.message as Record<string, unknown> | undefined);
      if (!numero || !corpo) return json({ ok: true, ignored: 'sem texto' }); // mídia/áudio fora de escopo
      const pushName = (data.pushName as string) ?? numero;

      // contato: identidade whatsapp -> senão por telefone -> senão cria
      let contatoId: string | null = null;
      const { data: ident } = await admin.from('contato_identidades')
        .select('contato_id').eq('organizacao_id', orgId).eq('tipo', 'whatsapp').eq('valor_normalizado', numero).maybeSingle();
      if (ident) contatoId = ident.contato_id;
      if (!contatoId) {
        const { data: byTel } = await admin.from('contatos')
          .select('id').eq('organizacao_id', orgId).eq('telefone', numero).maybeSingle();
        if (byTel) contatoId = byTel.id;
      }
      if (!contatoId) {
        const { data: novo } = await admin.from('contatos').insert({
          nome: pushName, telefone: numero, origem: 'WhatsApp', organizacao_id: orgId,
        }).select('id').single();
        contatoId = novo!.id;
        await admin.from('contato_identidades').insert({
          contato_id: contatoId, organizacao_id: orgId, tipo: 'whatsapp',
          provedor: 'evolution', valor: numero, valor_normalizado: numero, principal: true,
        });
      }

      // conversa aberta deste contato neste canal -> senão cria
      let conversaId: string | null = null;
      const { data: conv } = await admin.from('conversas')
        .select('id').eq('organizacao_id', orgId).eq('contato_id', contatoId).eq('canal_id', canal.id)
        .neq('status', 'fechada').order('criado_em', { ascending: false }).limit(1).maybeSingle();
      if (conv) conversaId = conv.id;
      if (!conversaId) {
        const { data: nc } = await admin.from('conversas').insert({
          organizacao_id: orgId, contato_id: contatoId, canal_id: canal.id, status: 'aberta',
        }).select('id').single();
        conversaId = nc!.id;
      }

      // mensagem (idempotente por id_externo)
      await admin.from('mensagens').upsert(
        {
          conversa_id: conversaId, organizacao_id: orgId, direcao: 'entrada', tipo: 'texto',
          conteudo: corpo, id_externo: key.id ?? null, status: 'entregue', recebida_em: new Date().toISOString(),
        },
        { onConflict: 'id_externo', ignoreDuplicates: true },
      );
      await admin.from('conversas').update({ ultima_interacao_em: new Date().toISOString() }).eq('id', conversaId);
      return json({ ok: true });
    }

    // -------- atualização de status da mensagem --------
    if (event === 'messages.update') {
      const arr = Array.isArray(data) ? data : [data];
      for (const it of arr as Record<string, unknown>[]) {
        const id = (it.key as { id?: string } | undefined)?.id ?? (it.keyId as string | undefined);
        const status = (it.status as string | undefined)?.toUpperCase();
        if (!id) continue;
        const map: Record<string, string> = { DELIVERY_ACK: 'entregue', READ: 'lida', PLAYED: 'lida', SERVER_ACK: 'enviada' };
        const novo = status ? map[status] : undefined;
        if (novo) await admin.from('mensagens').update({ status: novo }).eq('id_externo', id);
      }
      return json({ ok: true });
    }

    return json({ ok: true, ignored: event });
  } catch (e) {
    return json({ error: (e as Error).message ?? 'Erro inesperado.' }, 500);
  }
});
