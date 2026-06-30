// atribuir-atendimento — assumir / transferir / liberar o responsável de um contato (atendimento).
// v1: validação server-side de vínculo + papel + concorrência (optimistic lock pelo responsável
//     esperado) + auditoria. Nunca confia no bloqueio visual do frontend. service_role só no backend.
import { corsHeaders, json } from './cors.ts';
import { adminClient, getUser } from './client.ts';

const PAPEIS_ATENDEM = ['admin', 'supervisor', 'atendente'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const user = await getUser(req);
    if (!user) return json({ error: 'Não autenticado.' }, 401);

    const body = await req.json().catch(() => ({}));
    const contato_id = body?.contato_id as string | undefined;
    // destino_id: novo responsável (uuid) — o próprio usuário (assumir), outro (transferir) ou null (liberar).
    // esperado_id: responsável que o frontend vê agora (trava de concorrência). undefined => não checa.
    const destino_id = (body?.destino_id ?? null) as string | null;
    const esperado_id = (body?.esperado_id ?? null) as string | null;
    const conversa_id = (body?.conversa_id ?? null) as string | null; // p/ registrar a atividade na timeline
    const motivo = typeof body?.motivo === 'string' ? (body.motivo as string).slice(0, 280) : null;
    if (!contato_id) return json({ error: 'contato_id é obrigatório.' }, 400);

    const admin = adminClient();
    const { data: contato } = await admin.from('contatos').select('id, organizacao_id, responsavel_id').eq('id', contato_id).maybeSingle();
    if (!contato) return json({ error: 'Contato não encontrado.' }, 404);
    const org = contato.organizacao_id as string;

    // quem está agindo precisa ser membro ATIVO da organização do contato
    const { data: mem } = await admin.from('organizacao_usuarios').select('papel, status').eq('organizacao_id', org).eq('usuario_id', user.id).maybeSingle();
    if (!mem || mem.status !== 'ativo' || !PAPEIS_ATENDEM.includes(mem.papel as string)) return json({ error: 'Você não tem vínculo ativo para atender nesta organização.' }, 403);

    // CONCORRÊNCIA: o responsável atual precisa ser exatamente o esperado pelo frontend.
    const atual = (contato.responsavel_id as string | null) ?? null;
    if (atual !== esperado_id) return json({ error: 'A conversa foi reatribuída por outra pessoa. Atualize a tela.' }, 409);

    // PERMISSÃO: gestor (admin/supervisor) pode tudo na org; atendente só assume conversa livre
    // ou mexe na própria (da qual já é responsável).
    const ehGestor = mem.papel === 'admin' || mem.papel === 'supervisor';
    const assumindoLivre = esperado_id === null && destino_id === user.id;
    const mexendoNoProprio = esperado_id === user.id;
    if (!ehGestor && !(assumindoLivre || mexendoNoProprio)) return json({ error: 'Sem permissão para alterar o responsável desta conversa.' }, 403);

    // DESTINO (quando há um): precisa ser membro ATIVO e poder atender.
    if (destino_id) {
      const { data: dm } = await admin.from('organizacao_usuarios').select('papel, status').eq('organizacao_id', org).eq('usuario_id', destino_id).maybeSingle();
      if (!dm || dm.status !== 'ativo' || !PAPEIS_ATENDEM.includes(dm.papel as string)) return json({ error: 'Usuário de destino inválido para atendimento.' }, 422);
    }

    // UPDATE ATÔMICO: só altera se o responsável continuar sendo o esperado (trava de corrida).
    let upd = admin.from('contatos').update({ responsavel_id: destino_id }).eq('id', contato_id);
    upd = esperado_id ? upd.eq('responsavel_id', esperado_id) : upd.is('responsavel_id', null);
    const { data: rows, error: ue } = await upd.select('id, responsavel_id');
    if (ue) return json({ error: ue.message }, 500);
    if (!rows || rows.length === 0) return json({ error: 'A conversa foi reatribuída por outra pessoa. Atualize a tela.' }, 409);

    // AUDITORIA (quem, de quem, para quem, quando). audit_log é imutável.
    const acao = destino_id === null ? 'liberar_atendimento' : destino_id === user.id ? 'assumir_atendimento' : 'transferir_atendimento';
    await admin.from('audit_log').insert({
      usuario_id: user.id, acao, entidade: 'contatos', entidade_id: contato_id,
      dados_antes: { responsavel_id: esperado_id }, dados_depois: { responsavel_id: destino_id }, organizacao_id: org,
    });

    // TIMELINE da conversa (colaboração Etapa 1): assumido | transferido | devolvido. Best-effort (não quebra a ação).
    if (conversa_id) {
      const tipo = destino_id === null ? 'devolvido' : destino_id === user.id ? 'assumido' : 'transferido';
      try {
        await admin.from('conversa_atividades').insert({
          organizacao_id: org, conversa_id, usuario_id: user.id, tipo,
          de: { responsavel_id: esperado_id }, para: { responsavel_id: destino_id }, motivo,
        });
      } catch { /* não bloqueia a atribuição */ }
    }

    return json({ ok: true, responsavel_id: destino_id });
  } catch (e) {
    return json({ error: (e as Error).message ?? 'Erro inesperado.' }, 500);
  }
});
