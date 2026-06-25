// evolution-send — envia texto e persiste a saída como PENDENTE.
// v12: assinatura *Nome:*\n (negrito), persiste texto_original/assinatura_nome/origem='atenvo' (#4),
//      atualiza último canal/número após envio aceito (#6). NÃO altera normalização de número.
import { corsHeaders, json } from './cors.ts';
import { adminClient, getUser } from './client.ts';
import { evolution, evolutionConfigured } from './evolution.ts';

const digits = (s?: string | null): string | null => ((s ?? '').replace(/[^0-9]/g, '') || null);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    if (!evolutionConfigured()) return json({ error: 'Evolution não configurada.' }, 503);
    const user = await getUser(req);
    if (!user) return json({ error: 'Não autenticado.' }, 401);

    const { conversa_id, text, canal_id, assinatura_nome } = await req.json().catch(() => ({}));
    if (!conversa_id || !text?.toString().trim()) return json({ error: 'conversa_id e text são obrigatórios.' }, 400);
    const corr = (globalThis.crypto?.randomUUID?.() ?? String(Date.now())).slice(0, 8);

    const admin = adminClient();
    const { data: conv } = await admin.from('conversas').select('id, organizacao_id, contato_id, canal_id').eq('id', conversa_id).maybeSingle();
    if (!conv) return json({ error: 'Conversa não encontrada.' }, 404);

    const { data: mem } = await admin.from('organizacao_usuarios').select('status').eq('organizacao_id', conv.organizacao_id).eq('usuario_id', user.id).maybeSingle();
    if (!mem || mem.status !== 'ativo') return json({ error: 'Sem acesso a esta organização.' }, 403);

    // CANAL: usa EXATAMENTE o canal escolhido em "Responder por" (canal_id). Sem fallback implícito ao canal da conversa.
    const canalId = (canal_id as string) || (conv.canal_id as string);
    const { data: canal } = await admin.from('canais').select('id, instancia_externa, status_integracao, numero_conectado, provider').eq('id', canalId).eq('organizacao_id', conv.organizacao_id).maybeSingle();
    if (!canal?.instancia_externa) return json({ error: 'Canal de WhatsApp selecionado não encontrado.' }, 404);
    const instancia = canal.instancia_externa as string;
    console.log(`[send] corr=${corr} canalSel=${canal_id ?? '-'} canalUsado=${canal.id} inst=${instancia} de=${digits(canal.numero_conectado)?.slice(0, 6) ?? '-'}`);

    // estado real da instância
    let liveState: string | undefined;
    try { const st = await evolution.connectionState(instancia); liveState = st?.instance?.state; } catch { liveState = undefined; }
    if (liveState && liveState !== 'open') {
      if (canal.status_integracao !== 'desconectado') await admin.from('canais').update({ status_integracao: 'desconectado' }).eq('id', canal.id);
      return json({ error: 'O WhatsApp deste canal desconectou. Abra Integrações e reconecte (QR Code).' }, 409);
    }
    if (liveState === 'open' && canal.status_integracao !== 'conectado') await admin.from('canais').update({ status_integracao: 'conectado' }).eq('id', canal.id);
    if (!liveState && canal.status_integracao !== 'conectado') return json({ error: 'WhatsApp não está conectado.' }, 409);

    // ----- destino: número EXATO salvo, sem remover o 9. -----
    const { data: ct } = await admin.from('contatos').select('telefone').eq('id', conv.contato_id).maybeSingle();
    const { data: ident } = await admin.from('contato_identidades').select('valor_normalizado, valor').eq('contato_id', conv.contato_id).eq('tipo', 'whatsapp').maybeSingle();
    const tel = digits(ct?.telefone);
    const idn = digits(ident?.valor_normalizado) ?? digits(ident?.valor);
    const base = (tel && idn && tel !== idn) ? tel : (idn ?? tel);
    if (!base) return json({ error: 'Contato sem número de WhatsApp.' }, 422);

    // BLOQUEIO DE AUTOENVIO: não enviar do número do canal para ele mesmo.
    const senderNum = digits(canal.numero_conectado);
    if (senderNum && senderNum === base) {
      console.log(`[send] corr=${corr} BLOQUEADO autoenvio de=${senderNum.slice(0, 6)} para=${base.slice(0, 6)}`);
      return json({ error: 'Não é possível enviar uma mensagem para o mesmo número conectado.' }, 422);
    }

    // valida existência; não troca por variante exceto se o EXATO não existir.
    let alvo = base;
    try {
      const chk = await evolution.whatsappNumbers(instancia, [base]);
      const arr = Array.isArray(chk) ? chk : [];
      const hit = arr[0];
      if (hit && hit.exists === false) {
        const altJid = hit.jid ? digits(String(hit.jid).split('@')[0]) : null;
        if (altJid) alvo = altJid; else return json({ error: 'Este número não tem WhatsApp ativo. Confira o DDD e o nono dígito.' }, 422);
      }
    } catch { /* fail-open: usa base */ }
    console.log(`[send] corr=${corr} para=${base.slice(0, 6)} alvo=${alvo.slice(0, 6)}`);

    // ----- #4 ASSINATURA: aplica *Nome:*\n; guarda anti-dupla-assinatura em retentativa. -----
    const raw = text.toString();
    const assinatura = (assinatura_nome ?? '').toString().trim();
    const prefixo = assinatura ? `*${assinatura}:*\n` : '';
    const jaAssinado = assinatura ? raw.startsWith(`*${assinatura}:*`) : false;
    const corpoEnviado = (assinatura && !jaAssinado) ? prefixo + raw : raw;

    // envia (texto já assinado)
    let sent: { key?: { id?: string } };
    try {
      sent = await evolution.sendText(instancia, alvo, corpoEnviado);
    } catch (err) {
      const msg = (err as Error).message || 'Falha ao enviar pela Evolution.';
      return json({ error: /not|connect|close/i.test(msg) ? 'O WhatsApp deste canal desconectou. Reconecte em Integrações.' : msg }, 502);
    }
    const idExterno = sent?.key?.id ?? null;
    const nowIso = new Date().toISOString();

    // PENDENTE: 201 != entrega. O webhook (messages.update) move p/ enviada/entregue/lida/falhou.
    const { data: msg } = await admin.from('mensagens').insert({
      conversa_id, organizacao_id: conv.organizacao_id, direcao: 'saida', tipo: 'texto',
      conteudo: corpoEnviado, texto_original: raw, assinatura_nome: assinatura || null, origem: 'atenvo',
      autor_id: user.id, id_externo: idExterno, status: 'pendente',
    }).select('id, conteudo, enviada_em, direcao, status').single();

    // #6 após envio aceito: registra último canal/número/provider usado nesta conversa (mantém histórico das mensagens).
    await admin.from('conversas').update({
      ultima_interacao_em: nowIso,
      ultimo_canal_id: canal.id, ultimo_numero: canal.numero_conectado ?? null,
      ultimo_provider: canal.provider ?? 'whatsapp', ultima_msg_canal_em: nowIso,
    }).eq('id', conversa_id);
    return json({ ok: true, mensagem: msg });
  } catch (e) {
    return json({ error: (e as Error).message ?? 'Erro inesperado.' }, 500);
  }
});
