// evolution-start — inicia uma conversa de SAÍDA a partir de um número (canal) escolhido.
// Acha-ou-cria o contato, cria/recupera a conversa naquele canal, envia e persiste.
// Requer membro ativo da organização. O canal precisa estar conectado.
import { corsHeaders, json } from './cors.ts';
import { adminClient, getUser } from './client.ts';
import { evolution, evolutionConfigured } from './evolution.ts';

function normalizeNumber(s?: string | null): string | null {
  if (!s) return null;
  return s.replace(/\D/g, '') || null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    if (!evolutionConfigured()) return json({ error: 'Evolution não configurada.' }, 503);
    const user = await getUser(req);
    if (!user) return json({ error: 'Não autenticado.' }, 401);

    const body = await req.json().catch(() => ({}));
    const orgId: string = body.organizacao_id;
    const canalId: string = body.canal_id;
    const numeroRaw: string = (body.numero ?? '').toString();
    const text: string = (body.text ?? '').toString();
    const nome: string = (body.nome ?? '').toString().trim();
    if (!orgId || !canalId || !numeroRaw || !text.trim()) {
      return json({ error: 'organizacao_id, canal_id, numero e text são obrigatórios.' }, 400);
    }
    const numero = normalizeNumber(numeroRaw);
    if (!numero || numero.length < 10) return json({ error: 'Número de destino inválido. Use DDI + DDD + número (ex.: 5551999990000).' }, 422);

    const admin = adminClient();

    // membro ativo da org?
    const { data: mem } = await admin.from('organizacao_usuarios')
      .select('status').eq('organizacao_id', orgId).eq('usuario_id', user.id).maybeSingle();
    if (!mem || mem.status !== 'ativo') return json({ error: 'Sem acesso a esta organização.' }, 403);

    // canal pertence à org, é whatsapp e está conectado
    const { data: canal } = await admin.from('canais')
      .select('id, instancia_externa, status_integracao, tipo')
      .eq('id', canalId).eq('organizacao_id', orgId).maybeSingle();
    if (!canal?.instancia_externa || canal.tipo !== 'whatsapp') return json({ error: 'Canal de WhatsApp não encontrado.' }, 404);
    if (canal.status_integracao !== 'conectado') return json({ error: 'Este número não está conectado.' }, 409);

    // contato: por identidade whatsapp -> por telefone -> cria
    let contatoId: string | null = null;
    const { data: ident } = await admin.from('contato_identidades')
      .select('contato_id').eq('organizacao_id', orgId).eq('tipo', 'whatsapp').eq('valor_normalizado', numero).maybeSingle();
    if (ident) contatoId = ident.contato_id;
    if (!contatoId) {
      const { data: byTel } = await admin.from('contatos').select('id').eq('organizacao_id', orgId).eq('telefone', numero).maybeSingle();
      if (byTel) contatoId = byTel.id;
    }
    if (!contatoId) {
      const { data: novo } = await admin.from('contatos').insert({
        nome: nome || numero, telefone: numero, origem: 'WhatsApp (saída)', organizacao_id: orgId,
      }).select('id').single();
      contatoId = novo!.id;
      await admin.from('contato_identidades').insert({
        contato_id: contatoId, organizacao_id: orgId, tipo: 'whatsapp',
        provedor: 'evolution', valor: numero, valor_normalizado: numero, principal: true,
      });
    }

    // conversa aberta deste contato NESTE canal -> senão cria
    let conversaId: string | null = null;
    const { data: conv } = await admin.from('conversas')
      .select('id').eq('organizacao_id', orgId).eq('contato_id', contatoId).eq('canal_id', canalId)
      .neq('status', 'fechada').order('criado_em', { ascending: false }).limit(1).maybeSingle();
    if (conv) conversaId = conv.id;
    if (!conversaId) {
      const { data: nc } = await admin.from('conversas').insert({
        organizacao_id: orgId, contato_id: contatoId, canal_id: canalId, status: 'aberta',
      }).select('id').single();
      conversaId = nc!.id;
    }

    // envia pela Evolution e persiste a mensagem de saída
    const sent = await evolution.sendText(canal.instancia_externa as string, numero, text);
    const idExterno = sent?.key?.id ?? null;
    await admin.from('mensagens').insert({
      conversa_id: conversaId, organizacao_id: orgId, direcao: 'saida', tipo: 'texto',
      conteudo: text, autor_id: user.id, id_externo: idExterno, status: 'enviada',
    });
    await admin.from('conversas').update({ ultima_interacao_em: new Date().toISOString() }).eq('id', conversaId);

    return json({ ok: true, conversa_id: conversaId });
  } catch (e) {
    return json({ error: (e as Error).message ?? 'Erro inesperado.' }, 500);
  }
});
