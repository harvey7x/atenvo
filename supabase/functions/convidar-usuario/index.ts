// convidar-usuario — gestão de convites de equipe (Etapa 1).
// Ações: convidar | reenviar | cancelar. service_role SÓ aqui (backend).
// Usa o convite oficial do Supabase Auth (inviteUserByEmail) com fallback generateLink
// para preparar o convite e obter link de "Copiar link" quando o SMTP ainda não estiver configurado.
// Nunca retorna token bruto/senha; nunca loga tokens.
import { corsHeaders, json } from './cors.ts';
import { adminClient, getUser } from './client.ts';

const PAPEIS = ['admin', 'supervisor', 'atendente'];
const SITE = Deno.env.get('SITE_URL') ?? 'https://atenvo-cs4.pages.dev';
const REDIRECT = `${SITE}/definir-senha`;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REENVIO_MIN_MS = 60_000; // rate limit de reenvio

// Detecta erro de envio de e-mail (SMTP ausente/indisponível) para degradar em "convite preparado".
function ehErroEnvio(msg: string) {
  const m = (msg || '').toLowerCase();
  return m.includes('sending') || m.includes('smtp') || m.includes('email') || m.includes('mail');
}
function jaRegistrado(msg: string) {
  return (msg || '').toLowerCase().includes('already been registered') || (msg || '').toLowerCase().includes('already registered');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const user = await getUser(req);
    if (!user) return json({ error: 'Não autenticado.' }, 401);

    const body = await req.json().catch(() => ({}));
    const action = (body?.action ?? 'convidar') as string;
    const org = body?.org as string | undefined;
    if (!org) return json({ error: 'organização é obrigatória.' }, 400);

    const admin = adminClient();

    // solicitante precisa ser membro ATIVO admin/supervisor da organização
    const { data: mem } = await admin.from('organizacao_usuarios').select('papel, status').eq('organizacao_id', org).eq('usuario_id', user.id).maybeSingle();
    if (!mem || mem.status !== 'ativo') return json({ error: 'Você não tem vínculo ativo nesta organização.' }, 403);
    const papelSolicitante = mem.papel as string;
    const ehAdmin = papelSolicitante === 'admin';
    const ehGestor = ehAdmin || papelSolicitante === 'supervisor';
    if (!ehGestor) return json({ error: 'Você não tem permissão para gerenciar usuários.' }, 403);

    // ---------------- CANCELAR ----------------
    if (action === 'cancelar') {
      const convite_id = body?.convite_id as string | undefined;
      if (!convite_id) return json({ error: 'convite_id é obrigatório.' }, 400);
      const { data: c } = await admin.from('convites').select('*').eq('id', convite_id).eq('organizacao_id', org).maybeSingle();
      if (!c) return json({ error: 'Convite não encontrado.' }, 404);
      if (!ehAdmin && c.papel !== 'atendente') return json({ error: 'Supervisor só gerencia convites de atendente.' }, 403);
      if (c.status !== 'pendente' && c.status !== 'expirado') return json({ error: 'Convite não está pendente.' }, 409);
      await admin.from('convites').update({ status: 'cancelado', cancelado_em: new Date().toISOString(), atualizado_em: new Date().toISOString() }).eq('id', convite_id);
      // libera a vaga: remove o vínculo 'convidado' pendente (preserva auditoria)
      if (c.auth_user_id) await admin.from('organizacao_usuarios').delete().eq('organizacao_id', org).eq('usuario_id', c.auth_user_id).eq('status', 'convidado');
      await admin.from('audit_log').insert({ organizacao_id: org, usuario_id: user.id, acao: 'convite_cancelado', entidade: 'convite', entidade_id: convite_id, dados_antes: { email: c.email, status: c.status }, dados_depois: { status: 'cancelado' } });
      return json({ ok: true, status: 'cancelado' });
    }

    // ---------------- REENVIAR ----------------
    if (action === 'reenviar') {
      const convite_id = body?.convite_id as string | undefined;
      if (!convite_id) return json({ error: 'convite_id é obrigatório.' }, 400);
      const { data: c } = await admin.from('convites').select('*').eq('id', convite_id).eq('organizacao_id', org).maybeSingle();
      if (!c) return json({ error: 'Convite não encontrado.' }, 404);
      if (!ehAdmin && c.papel !== 'atendente') return json({ error: 'Supervisor só gerencia convites de atendente.' }, 403);
      if (c.status === 'aceito' || c.status === 'cancelado') return json({ error: 'Convite não pode ser reenviado.' }, 409);
      if (c.reenviado_em && Date.now() - new Date(c.reenviado_em).getTime() < REENVIO_MIN_MS) return json({ error: 'Aguarde antes de reenviar novamente.' }, 429);

      const r = await prepararEnvio(admin, c.email, { nome: c.nome, papel: c.papel, org });
      await admin.from('convites').update({ status: 'pendente', expira_em: new Date(Date.now() + 7 * 864e5).toISOString(), reenviado_em: new Date().toISOString(), atualizado_em: new Date().toISOString() }).eq('id', convite_id);
      await admin.from('audit_log').insert({ organizacao_id: org, usuario_id: user.id, acao: 'convite_reenviado', entidade: 'convite', entidade_id: convite_id, dados_depois: { email: c.email, emailSent: r.emailSent } });
      return json({ ok: true, status: 'pendente', emailSent: r.emailSent, smtpPendente: !r.emailSent, inviteLink: r.link });
    }

    // ---------------- CONVIDAR ----------------
    const email = String(body?.email ?? '').trim().toLowerCase();
    const nome = String(body?.nome ?? '').trim();
    const papel = String(body?.papel ?? 'atendente');
    if (!email || !EMAIL_RE.test(email)) return json({ error: 'Informe um e-mail válido.', code: 'email_invalido' }, 400);
    if (!PAPEIS.includes(papel)) return json({ error: 'Perfil inválido.', code: 'papel_invalido' }, 400);
    if (!ehAdmin && papel !== 'atendente') return json({ error: 'Supervisor só pode convidar atendentes.', code: 'sem_permissao_papel' }, 403);

    // duplicidade: convite pendente existente
    const { data: convPend } = await admin.from('convites').select('id').eq('organizacao_id', org).eq('status', 'pendente').ilike('email', email).maybeSingle();
    if (convPend) return json({ error: 'Já existe um convite pendente para este e-mail.', code: 'convite_pendente', convite_id: convPend.id }, 409);

    // limite do plano: ativos + pendentes não expirados (backend é a fonte da verdade)
    const { data: vagas } = await admin.rpc('_vagas_usuarios', { p_org: org });
    const limite = vagas?.limite as number | null;
    if (limite != null && (vagas.ativos + vagas.pendentes) >= limite) {
      return json({ error: 'Seu plano atingiu o limite de usuários.', code: 'limite_plano', vagas }, 409);
    }

    // usuário já existe no Auth?
    const { data: lookup } = await admin.rpc('_auth_lookup', { p_email: email });
    let authUserId: string | null = lookup?.id ?? null;

    if (authUserId) {
      // já é membro (qualquer status) desta org?
      const { data: jaMem } = await admin.from('organizacao_usuarios').select('status').eq('organizacao_id', org).eq('usuario_id', authUserId).maybeSingle();
      if (jaMem) return json({ error: 'Este usuário já faz parte da equipe.', code: 'ja_membro' }, 409);
    }

    // e-mail de convite (oficial) com fallback para preparar link
    const r = await prepararEnvio(admin, email, { nome, papel, org }, authUserId);
    if (r.userId) authUserId = r.userId;

    // usuarios + vínculo 'convidado' + convite pendente (papel salvo)
    if (authUserId) {
      await admin.from('usuarios').upsert({ id: authUserId, nome: nome || email.split('@')[0], email }, { onConflict: 'id' });
      const { data: exMem } = await admin.from('organizacao_usuarios').select('usuario_id').eq('organizacao_id', org).eq('usuario_id', authUserId).maybeSingle();
      if (!exMem) await admin.from('organizacao_usuarios').insert({ organizacao_id: org, usuario_id: authUserId, papel, status: 'convidado' });
    }
    const { data: novo } = await admin.from('convites').insert({
      organizacao_id: org, email, nome: nome || null, papel, status: 'pendente', auth_user_id: authUserId, convidado_por: user.id,
    }).select('id, status, expira_em').single();

    await admin.from('audit_log').insert({ organizacao_id: org, usuario_id: user.id, acao: 'convite_criado', entidade: 'convite', entidade_id: novo?.id, dados_depois: { email, papel, emailSent: r.emailSent } });

    return json({ ok: true, status: 'pendente', convite_id: novo?.id, expira_em: novo?.expira_em, emailSent: r.emailSent, smtpPendente: !r.emailSent, inviteLink: r.link });
  } catch (e) {
    return json({ error: (e as Error).message ?? 'Erro inesperado.' }, 500);
  }
});

// Cria/garante o usuário no Auth e obtém o link seguro; tenta enviar via convite oficial.
// Retorna { emailSent, link, userId }. Nunca lança por falta de SMTP.
async function prepararEnvio(admin: ReturnType<typeof adminClient>, email: string, meta: { nome: string; papel: string; org: string }, existingId?: string | null) {
  const data = { nome: meta.nome, papel: meta.papel, organizacao_id: meta.org };
  let emailSent = false;
  let userId: string | null = existingId ?? null;

  if (!existingId) {
    // usuário novo: tenta o convite oficial (envia se houver SMTP)
    const inv = await admin.auth.admin.inviteUserByEmail(email, { data, redirectTo: REDIRECT });
    if (!inv.error) { emailSent = true; userId = inv.data.user?.id ?? null; }
    else if (jaRegistrado(inv.error.message)) { /* corrida: já existe, segue p/ magiclink */ }
    // se falhou por envio (SMTP), o usuário pode ter sido criado; link vem do generateLink abaixo
  }

  // gera link seguro (não envia): 'invite' para não confirmado, 'magiclink' para existente confirmado
  let link: string | null = null;
  try {
    const tipo = existingId ? 'magiclink' : 'invite';
    const gl = await admin.auth.admin.generateLink({ type: tipo as 'invite' | 'magiclink', email, options: { redirectTo: REDIRECT } });
    if (!gl.error) { link = gl.data.properties?.action_link ?? null; userId = userId ?? gl.data.user?.id ?? null; }
    else if (tipo === 'invite') {
      // já existe (confirmado): usa magiclink
      const gl2 = await admin.auth.admin.generateLink({ type: 'magiclink', email, options: { redirectTo: REDIRECT } });
      if (!gl2.error) { link = gl2.data.properties?.action_link ?? null; userId = userId ?? gl2.data.user?.id ?? null; }
    }
  } catch { /* link opcional */ }

  return { emailSent, link, userId };
}
