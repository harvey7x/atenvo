// evolution-send — envia mensagem de texto pelo WhatsApp (via Evolution) e persiste
// a mensagem de saída na conversa. Requer membro ativo da organização.
import { corsHeaders, json } from '../_shared/cors.ts';
import { adminClient, getUser } from '../_shared/client.ts';
import { evolution, evolutionConfigured } from '../_shared/evolution.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    if (!evolutionConfigured()) return json({ error: 'Evolution não configurada.' }, 503);
    const user = await getUser(req);
    if (!user) return json({ error: 'Não autenticado.' }, 401);

    const { conversa_id, text } = await req.json().catch(() => ({}));
    if (!conversa_id || !text?.toString().trim()) return json({ error: 'conversa_id e text são obrigatórios.' }, 400);

    const admin = adminClient();
    // conversa -> org, contato, canal
    const { data: conv } = await admin.from('conversas')
      .select('id, organizacao_id, contato_id, canal_id').eq('id', conversa_id).maybeSingle();
    if (!conv) return json({ error: 'Conversa não encontrada.' }, 404);

    // membro ativo da org?
    const { data: mem } = await admin.from('organizacao_usuarios')
      .select('status').eq('organizacao_id', conv.organizacao_id).eq('usuario_id', user.id).maybeSingle();
    if (!mem || mem.status !== 'ativo') return json({ error: 'Sem acesso a esta organização.' }, 403);

    const { data: canal } = await admin.from('canais').select('instancia_externa, status_integracao').eq('id', conv.canal_id).maybeSingle();
    if (!canal?.instancia_externa) return json({ error: 'Canal de WhatsApp não encontrado.' }, 404);
    if (canal.status_integracao !== 'conectado') return json({ error: 'WhatsApp não está conectado.' }, 409);

    // número de destino: identidade whatsapp -> telefone do contato
    let numero: string | null = null;
    const { data: ident } = await admin.from('contato_identidades')
      .select('valor_normalizado, valor').eq('contato_id', conv.contato_id).eq('tipo', 'whatsapp').maybeSingle();
    numero = ident?.valor_normalizado ?? ident?.valor ?? null;
    if (!numero) {
      const { data: ct } = await admin.from('contatos').select('telefone').eq('id', conv.contato_id).maybeSingle();
      numero = (ct?.telefone ?? '').replace(/[^0-9]/g, '') || null;
    }
    if (!numero) return json({ error: 'Contato sem número de WhatsApp.' }, 422);

    const sent = await evolution.sendText(canal.instancia_externa as string, numero, text.toString());
    const idExterno = sent?.key?.id ?? null;

    const { data: msg } = await admin.from('mensagens').insert({
      conversa_id, organizacao_id: conv.organizacao_id, direcao: 'saida', tipo: 'texto',
      conteudo: text.toString(), autor_id: user.id, id_externo: idExterno, status: 'enviada',
    }).select('id, conteudo, enviada_em, direcao, status').single();

    await admin.from('conversas').update({ ultima_interacao_em: new Date().toISOString() }).eq('id', conversa_id);
    return json({ ok: true, mensagem: msg });
  } catch (e) {
    return json({ error: (e as Error).message ?? 'Erro inesperado.' }, 500);
  }
});
