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
import { evolution, evolutionConfigured } from './evolution.ts';

const soDigitos = (s?: string | null) => (s ?? '').replace(/[^0-9]/g, '');

// Envia o link do convite por WhatsApp reusando a Evolution (mesma integração/credenciais).
// O LINK só trafega no payload do envio — nunca é persistido/logado/auditado. Retorna estado do envio.
async function enviarWhatsApp(admin: ReturnType<typeof adminClient>, conviteId: string, org: string, canalId: string, telefone: string, nome: string, link: string, usuarioId: string): Promise<{ ok: boolean; erro?: string }> {
  const marcar = (patch: Record<string, unknown>) => admin.from('convites').update(patch).eq('id', conviteId);
  if (!evolutionConfigured()) { await marcar({ whatsapp_status: 'falha', whatsapp_erro: 'evolution_indisponivel' }); return { ok: false, erro: 'WhatsApp indisponível no servidor.' }; }
  const num = soDigitos(telefone);
  if (num.length < 10 || num.length > 15) { await marcar({ whatsapp_status: 'falha', whatsapp_erro: 'telefone_invalido' }); return { ok: false, erro: 'Telefone inválido (use formato internacional/E.164).' }; }

  const { data: canal } = await admin.from('canais').select('id, tipo, instancia_externa, status_integracao, numero_conectado, organizacao_id').eq('id', canalId).eq('organizacao_id', org).maybeSingle();
  if (!canal?.instancia_externa || canal.tipo !== 'whatsapp') { await marcar({ whatsapp_status: 'falha', whatsapp_erro: 'canal_invalido' }); return { ok: false, erro: 'Canal de WhatsApp inválido para esta organização.' }; }
  const instancia = canal.instancia_externa as string;
  // conexão viva (mesma checagem do envio existente)
  let estado: string | undefined;
  try { const st = await evolution.connectionState(instancia); estado = st?.instance?.state; } catch { estado = undefined; }
  if (estado && estado !== 'open') { await marcar({ whatsapp_status: 'falha', whatsapp_erro: 'canal_desconectado' }); return { ok: false, erro: 'O WhatsApp deste canal está desconectado. Reconecte em Integrações.' }; }

  await marcar({ whatsapp_status: 'enviando', telefone: num, canal_id: canalId });
  await admin.from('audit_log').insert({ organizacao_id: org, usuario_id: usuarioId, acao: 'convite_whatsapp_solicitado', entidade: 'convite', entidade_id: conviteId, dados_depois: { telefone_mascarado: num.slice(0, 6) + '…', canal_id: canalId } });

  const texto = `Olá, ${nome || 'tudo bem'}! Você foi convidado para acessar a Atenvo.\n\nClique no link abaixo para definir sua senha:\n${link}\n\nEste convite é pessoal e não deve ser compartilhado.`;
  try {
    const sent = await evolution.sendText(instancia, num, texto);
    const keyId = sent?.key?.id ?? null;
    if (!keyId) { await marcar({ whatsapp_status: 'falha', whatsapp_erro: 'sem_id_externo' }); await admin.from('audit_log').insert({ organizacao_id: org, usuario_id: usuarioId, acao: 'convite_whatsapp_falha', entidade: 'convite', entidade_id: conviteId, dados_depois: { erro: 'sem_id_externo' } }); return { ok: false, erro: 'O WhatsApp não confirmou o envio. Tente novamente.' }; }
    await marcar({ whatsapp_status: 'enviado', whatsapp_key_id: keyId, whatsapp_enviado_em: new Date().toISOString(), whatsapp_erro: null });
    await admin.from('audit_log').insert({ organizacao_id: org, usuario_id: usuarioId, acao: 'convite_whatsapp_enviado', entidade: 'convite', entidade_id: conviteId, dados_depois: { key_id: keyId } }); // sem link
    return { ok: true };
  } catch (e) {
    const m = ((e as Error).message || '').slice(0, 160);
    await marcar({ whatsapp_status: 'falha', whatsapp_erro: m });
    await admin.from('audit_log').insert({ organizacao_id: org, usuario_id: usuarioId, acao: 'convite_whatsapp_falha', entidade: 'convite', entidade_id: conviteId, dados_depois: { erro: m } });
    return { ok: false, erro: 'Não foi possível enviar pelo WhatsApp.' };
  }
}

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

      const { data: lk } = await admin.rpc('_auth_lookup', { p_email: c.email });
      const ent = await entregar(admin, c.email, c.nome, c.papel, org, { existe: !!lk?.id, temSenha: !!lk?.tem_senha });
      // renova o MESMO convite lógico (não cria outro)
      await admin.from('convites').update({ status: 'pendente', expira_em: new Date(Date.now() + 7 * 864e5).toISOString(), reenviado_em: new Date().toISOString(), atualizado_em: new Date().toISOString() }).eq('id', cid);
      if (ent.userId && !c.auth_user_id) await admin.rpc('convite_vincular', { p_convite_id: cid, p_auth_user_id: ent.userId });
      await admin.from('audit_log').insert({ organizacao_id: org, usuario_id: user.id, acao: 'convite_reenviado', entidade: 'convite', entidade_id: cid, dados_depois: { email: c.email, estado: ent.estado } }); // sem link
      // reenvia pelo MESMO canal/telefone do convite, se houver
      if (c.canal_id && c.telefone && ent.link) {
        const wa = await enviarWhatsApp(admin, cid, org, c.canal_id, c.telefone, c.nome || c.email, ent.link, user.id);
        if (wa.ok) return json({ ok: true, estado: 'enviado_whatsapp', entregaValidada: false, modo: INVITE_MODE });
        return json({ ok: true, estado: 'falha_envio', erroEnvio: wa.erro, entregaValidada: false, modo: INVITE_MODE, inviteLink: ent.link });
      }
      return json({ ok: true, estado: ent.estado, entregaValidada: false, modo: INVITE_MODE, inviteLink: INVITE_MODE === 'manual_link' ? ent.link : undefined });
    }

    // ---------------- CONVIDAR ----------------
    const email = String(body?.email ?? '').trim().toLowerCase();
    const nome = String(body?.nome ?? '').trim();
    const papel = String(body?.papel ?? 'atendente');
    const requestId = (body?.request_id as string | undefined) ?? undefined; // idempotência (cliente gera)
    const telefone = String(body?.telefone ?? '').trim();
    const canalId = (body?.canal_id as string | undefined) ?? undefined;
    const enviarWa = body?.enviar_whatsapp !== false && !!canalId && !!telefone; // default true quando há canal+telefone
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

    // 2) usuário já existe no Auth? (e já tem senha?)
    const { data: lookup } = await admin.rpc('_auth_lookup', { p_email: email });
    const info = { existe: !!lookup?.id, temSenha: !!lookup?.tem_senha };

    // 3) AUTH (por modo) + compensação (saga)
    let ent: Entrega;
    try {
      ent = await entregar(admin, email, nome, papel, org, info);
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

    // guarda telefone/canal p/ reenvio (mesmo quando não envia agora)
    if (telefone || canalId) await admin.from('convites').update({ telefone: telefone ? soDigitos(telefone) : null, canal_id: canalId ?? null }).eq('id', conviteId);

    // ENVIO AUTOMÁTICO por WhatsApp (o link vai só no payload; não é persistido/logado)
    if (enviarWa && ent.link) {
      const wa = await enviarWhatsApp(admin, conviteId, org, canalId!, telefone, nome || email, ent.link, user.id);
      if (wa.ok) return json({ ok: true, convite_id: conviteId, modo: INVITE_MODE, estado: 'enviado_whatsapp', entregaValidada: false });
      // falha: convite segue pendente, vaga preservada; devolve o link só p/ o admin copiar (fallback)
      return json({ ok: true, convite_id: conviteId, modo: INVITE_MODE, estado: 'falha_envio', erroEnvio: wa.erro, entregaValidada: false, inviteLink: ent.link });
    }

    // estado do envio (NUNCA declara entregue). Link manual só no modo manual_link, uma vez, não persistido.
    return json({ ok: true, convite_id: conviteId, modo: INVITE_MODE, estado: ent.estado, entregaValidada: false, inviteLink: INVITE_MODE === 'manual_link' ? ent.link : undefined });
  } catch (e) {
    return json({ error: sanitizar((e as Error).message) }, 500);
  }
});

// criado=true SÓ quando um Auth user novo foi criado NESTA chamada (habilita a compensação deleteUser).
interface Entrega { estado: string; userId: string | null; link: string | null; criado: boolean }
interface LookupInfo { existe: boolean; temSenha: boolean }

// Estratégia de link EXPLÍCITA e determinística pelo estado do usuário no Auth (igual em convidar/reenviar):
//   - não existe            -> 'invite'   (cria o usuário + define a senha)      -> /definir-senha
//   - existe, SEM senha     -> 'recovery' (primeiro acesso: define a senha)      -> /definir-senha
//   - existe, COM senha     -> 'magiclink'(preexistente: só autentica e aceita)  -> /definir-senha?ativar=1
// Não alterna silenciosamente entre invite/magiclink por erro: o tipo vem do estado. NUNCA loga o link.
async function entregar(admin: ReturnType<typeof adminClient>, email: string, nome: string, papel: string, org: string, info: LookupInfo): Promise<Entrega> {
  const data = { nome, papel, organizacao_id: org };
  const plano: { tipo: 'invite' | 'recovery' | 'magiclink'; redirect: string; criado: boolean } =
    !info.existe ? { tipo: 'invite', redirect: REDIRECT, criado: true }
      : !info.temSenha ? { tipo: 'recovery', redirect: REDIRECT, criado: false }
        : { tipo: 'magiclink', redirect: `${REDIRECT}?ativar=1`, criado: false };

  if (INVITE_MODE === 'manual_link') {
    const gl = await admin.auth.admin.generateLink({ type: plano.tipo, email, options: { redirectTo: plano.redirect, data } });
    if (gl.error) return { estado: 'envio_falhou', userId: null, link: null, criado: false };
    return { estado: 'link_gerado', userId: gl.data.user?.id ?? null, link: gl.data.properties?.action_link ?? null, criado: plano.criado };
  }
  // MODO email: só inviteUserByEmail (usuário novo). Existentes aceitam via login/link — sem redefinir senha.
  if (info.existe) return { estado: 'convite_criado', userId: null, link: null, criado: false };
  const inv = await admin.auth.admin.inviteUserByEmail(email, { data, redirectTo: REDIRECT });
  if (inv.error) return { estado: 'envio_falhou', userId: null, link: null, criado: false };
  return { estado: 'envio_solicitado', userId: inv.data.user?.id ?? null, link: null, criado: true }; // NÃO é prova de entrega
}
