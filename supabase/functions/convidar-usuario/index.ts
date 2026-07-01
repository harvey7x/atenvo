// convidar-usuario — convites de equipe (Etapa 1, endurecido).
// Ações: convidar | reenviar | cancelar. service_role SÓ aqui.
// Modo de convite EXPLÍCITO por env (backend decide, nunca o frontend):
//   INVITE_MODE=email        -> só auth.admin.inviteUserByEmail (envia; sem link manual)
//   INVITE_MODE=manual_link  -> só auth.admin.generateLink({type:'invite'}) (link único; sem inviteUserByEmail)
// Sem fallback ambíguo. Reserva de vaga ATÔMICA antes do Auth; compensação (saga) em falha parcial.
// Não classifica e-mail como entregue: 'envio_solicitado' + entregaValidada:false.
// Link manual: retornado UMA vez, nunca persistido/logado/auditado.
import { corsHeaders, json } from './cors.ts';
import { adminClient, getUser } from './client.ts';

const PAPEIS = ['admin', 'supervisor', 'atendente'];
const SITE = Deno.env.get('SITE_URL') ?? 'https://atenvo-cs4.pages.dev';
const REDIRECT = `${SITE}/definir-senha`;                 // domínio oficial por env; nunca de headers
const INVITE_MODE = (Deno.env.get('INVITE_MODE') ?? 'email').toLowerCase() === 'manual_link' ? 'manual_link' : 'email';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REENVIO_MIN_MS = 60_000;
const sanitizar = (m: string) => (m || '').slice(0, 140).replace(/token=[^&\s]+/gi, 'token=***');

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
    const { data: mem } = await admin.from('organizacao_usuarios').select('papel, status').eq('organizacao_id', org).eq('usuario_id', user.id).maybeSingle();
    if (!mem || mem.status !== 'ativo') return json({ error: 'Você não tem vínculo ativo nesta organização.' }, 403);
    const ehAdmin = mem.papel === 'admin';
    const ehGestor = ehAdmin || mem.papel === 'supervisor';
    if (!ehGestor) return json({ error: 'Você não tem permissão para gerenciar usuários.' }, 403);

    // ---------------- CANCELAR (idempotente) ----------------
    if (action === 'cancelar') {
      const cid = body?.convite_id as string | undefined;
      if (!cid) return json({ error: 'convite_id é obrigatório.' }, 400);
      const { data: c } = await admin.from('convites').select('*').eq('id', cid).eq('organizacao_id', org).maybeSingle();
      if (!c) return json({ error: 'Convite não encontrado.' }, 404);
      if (!ehAdmin && c.papel !== 'atendente') return json({ error: 'Supervisor só gerencia convites de atendente.' }, 403);
      if (c.status === 'cancelado') return json({ ok: true, estado: 'cancelado' }); // idempotente
      if (c.status !== 'pendente' && c.status !== 'expirado') return json({ error: 'Convite não pode ser cancelado.' }, 409);
      await admin.from('convites').update({ status: 'cancelado', cancelado_em: new Date().toISOString(), atualizado_em: new Date().toISOString() }).eq('id', cid);
      if (c.auth_user_id) await admin.from('organizacao_usuarios').delete().eq('organizacao_id', org).eq('usuario_id', c.auth_user_id).eq('status', 'convidado');
      await admin.from('audit_log').insert({ organizacao_id: org, usuario_id: user.id, acao: 'convite_cancelado', entidade: 'convite', entidade_id: cid, dados_antes: { email: c.email, status: c.status }, dados_depois: { status: 'cancelado' } });
      return json({ ok: true, estado: 'cancelado' });
    }

    // ---------------- REENVIAR (mesmo convite; renova prazo) ----------------
    if (action === 'reenviar') {
      const cid = body?.convite_id as string | undefined;
      if (!cid) return json({ error: 'convite_id é obrigatório.' }, 400);
      const { data: c } = await admin.from('convites').select('*').eq('id', cid).eq('organizacao_id', org).maybeSingle();
      if (!c) return json({ error: 'Convite não encontrado.' }, 404);
      if (!ehAdmin && c.papel !== 'atendente') return json({ error: 'Supervisor só gerencia convites de atendente.' }, 403);
      if (c.status === 'aceito' || c.status === 'cancelado') return json({ error: 'Convite não pode ser reenviado.' }, 409);
      if (c.reenviado_em && Date.now() - new Date(c.reenviado_em).getTime() < REENVIO_MIN_MS) return json({ error: 'Aguarde antes de reenviar novamente.' }, 429);

      const ent = await entregar(admin, c.email, c.nome, c.papel, org, !!c.auth_user_id);
      // renova o MESMO convite lógico (não cria outro)
      await admin.from('convites').update({ status: 'pendente', expira_em: new Date(Date.now() + 7 * 864e5).toISOString(), reenviado_em: new Date().toISOString(), atualizado_em: new Date().toISOString() }).eq('id', cid);
      if (ent.userId && !c.auth_user_id) await admin.rpc('convite_vincular', { p_convite_id: cid, p_auth_user_id: ent.userId });
      await admin.from('audit_log').insert({ organizacao_id: org, usuario_id: user.id, acao: 'convite_reenviado', entidade: 'convite', entidade_id: cid, dados_depois: { email: c.email, estado: ent.estado } }); // sem link
      return json({ ok: true, estado: ent.estado, entregaValidada: false, modo: INVITE_MODE, inviteLink: INVITE_MODE === 'manual_link' ? ent.link : undefined });
    }

    // ---------------- CONVIDAR ----------------
    const email = String(body?.email ?? '').trim().toLowerCase();
    const nome = String(body?.nome ?? '').trim();
    const papel = String(body?.papel ?? 'atendente');
    const requestId = (body?.request_id as string | undefined) ?? undefined; // idempotência (cliente gera)
    if (!email || !EMAIL_RE.test(email)) return json({ error: 'Informe um e-mail válido.', code: 'email_invalido' }, 400);
    if (!PAPEIS.includes(papel)) return json({ error: 'Perfil inválido.', code: 'papel_invalido' }, 400);
    if (!ehAdmin && papel !== 'atendente') return json({ error: 'Supervisor só pode convidar atendentes.', code: 'sem_permissao_papel' }, 403);

    // 1) RESERVA ATÔMICA (dedup + limite + insere convite) — antes de tocar no Auth
    const { data: rsv, error: rsvErr } = await admin.rpc('convite_reservar', { p_org: org, p_email: email, p_nome: nome, p_papel: papel, p_convidado_por: user.id, p_request_id: requestId ?? null });
    if (rsvErr) return json({ error: sanitizar(rsvErr.message) }, 500);
    const st = rsv?.status as string;
    if (st === 'ja_membro') return json({ error: 'Este usuário já faz parte da equipe.', code: 'ja_membro' }, 409);
    if (st === 'membro_inativo') return json({ error: 'Este usuário está inativo na organização. Use "Reativar" na lista.', code: 'membro_inativo' }, 409);
    if (st === 'convite_pendente') return json({ error: 'Já existe um convite pendente para este e-mail.', code: 'convite_pendente' }, 409);
    if (st === 'limite_plano') return json({ error: 'Seu plano atingiu o limite de usuários.', code: 'limite_plano', vagas: rsv.vagas }, 409);
    if (st === 'ja_processado') return json({ ok: true, estado: 'convite_criado', entregaValidada: false, convite_id: rsv.convite_id, idempotente: true, modo: INVITE_MODE });
    if (st !== 'criado') return json({ error: 'Não foi possível criar o convite.', code: st }, 400);
    const conviteId = rsv.convite_id as string;

    // 2) usuário já existe no Auth?
    const { data: lookup } = await admin.rpc('_auth_lookup', { p_email: email });
    const existia = !!lookup?.id;

    // 3) AUTH (por modo) + compensação (saga)
    let ent: Entrega;
    try {
      ent = await entregar(admin, email, nome, papel, org, existia);
    } catch (e) {
      await admin.rpc('convite_remover', { p_convite_id: conviteId }); // libera a vaga
      return json({ error: 'Falha ao preparar o convite.', code: 'envio_falhou', detalhe: sanitizar((e as Error).message) }, 502);
    }
    if (ent.estado === 'envio_falhou') {
      await admin.rpc('convite_remover', { p_convite_id: conviteId });
      return json({ error: 'Não foi possível enviar o convite (verifique o SMTP nas configurações de Auth).', code: 'envio_falhou' }, 502);
    }

    // 4) VINCULAR (Auth confirmado) + compensação se o banco falhar
    if (ent.userId) {
      const { error: vErr } = await admin.rpc('convite_vincular', { p_convite_id: conviteId, p_auth_user_id: ent.userId });
      if (vErr) {
        await admin.rpc('convite_remover', { p_convite_id: conviteId });        // remove só convite/vínculo desta tentativa
        // deleteUser SÓ se o Auth user foi criado NESTA requisição (flag explícita) e com o ID exato dessa criação.
        // Usuário preexistente (existia) ou não-criado nunca é apagado — preserva vínculos de outras orgs.
        if (ent.criado && ent.userId) { try { await admin.auth.admin.deleteUser(ent.userId); } catch { /* best-effort */ } }
        return json({ error: 'Falha ao registrar o convite.', code: 'banco_falhou', detalhe: sanitizar(vErr.message) }, 500);
      }
    }

    // estado do envio (NUNCA declara entregue). Link manual só no modo manual_link, uma vez, não persistido.
    return json({ ok: true, convite_id: conviteId, modo: INVITE_MODE, estado: ent.estado, entregaValidada: false, inviteLink: INVITE_MODE === 'manual_link' ? ent.link : undefined });
  } catch (e) {
    return json({ error: sanitizar((e as Error).message) }, 500);
  }
});

// criado=true SÓ quando um Auth user novo foi criado NESTA chamada (habilita a compensação deleteUser).
interface Entrega { estado: string; userId: string | null; link: string | null; criado: boolean }

// Entrega conforme o MODO. Retorna estado explícito. NUNCA loga o link.
async function entregar(admin: ReturnType<typeof adminClient>, email: string, nome: string, papel: string, org: string, existia: boolean): Promise<Entrega> {
  const data = { nome, papel, organizacao_id: org };
  if (INVITE_MODE === 'manual_link') {
    // só generateLink; nunca inviteUserByEmail
    const tipo = existia ? 'magiclink' : 'invite';
    const gl = await admin.auth.admin.generateLink({ type: tipo as 'invite' | 'magiclink', email, options: { redirectTo: REDIRECT, data } });
    if (gl.error) {
      if (tipo === 'invite') { // corrida: já existe -> magiclink (não criamos usuário)
        const gl2 = await admin.auth.admin.generateLink({ type: 'magiclink', email, options: { redirectTo: REDIRECT, data } });
        if (!gl2.error) return { estado: 'link_gerado', userId: gl2.data.user?.id ?? null, link: gl2.data.properties?.action_link ?? null, criado: false };
      }
      return { estado: 'envio_falhou', userId: null, link: null, criado: false };
    }
    // 'invite' cria o usuário (novo); 'magiclink' é para usuário existente
    return { estado: 'link_gerado', userId: gl.data.user?.id ?? null, link: gl.data.properties?.action_link ?? null, criado: tipo === 'invite' };
  }
  // MODO email: só inviteUserByEmail; sem link manual
  if (existia) {
    // usuário já tem conta: não há convite por e-mail (já registrado). Vínculo aguarda login/aceitação.
    return { estado: 'convite_criado', userId: null, link: null, criado: false };
  }
  const inv = await admin.auth.admin.inviteUserByEmail(email, { data, redirectTo: REDIRECT });
  if (inv.error) return { estado: 'envio_falhou', userId: null, link: null, criado: false };
  // sucesso = Auth ACEITOU a solicitação; NÃO é prova de entrega
  return { estado: 'envio_solicitado', userId: inv.data.user?.id ?? null, link: null, criado: true };
}
