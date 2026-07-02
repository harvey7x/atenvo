// definir-senha-temporaria — mecanismo administrativo suportado para senha temporária.
// SÓ admin da organização. Usa a API Admin OFICIAL do Supabase (auth.admin.updateUserById) —
// NUNCA escreve em auth.users nem lê/retorna/armazena hash. A senha é gerada aleatória (forte),
// mostrada UMA única vez ao admin na resposta e NUNCA salva em banco/log/auditoria.
// Marca deve_trocar_senha=true. Auditoria registra só a ação, sem a senha. Rate limit por alvo.
// Bloqueia alvo de outra organização (o alvo precisa ter vínculo na MESMA org do admin).
import { corsHeaders, json } from './cors.ts';
import { adminClient, getUser } from './client.ts';

const RATE_MS = 60_000;

// Senha aleatória forte: 20 chars, >=1 de cada classe, alfabeto sem caracteres ambíguos.
function gerarSenhaForte(): string {
  const U = 'ABCDEFGHJKLMNPQRSTUVWXYZ', L = 'abcdefghijkmnopqrstuvwxyz', D = '23456789', S = '!@#$%*?-_';
  const ALL = U + L + D + S;
  const r = new Uint32Array(24); crypto.getRandomValues(r);
  const pick = (set: string, i: number) => set[r[i] % set.length];
  const chars = [pick(U, 0), pick(L, 1), pick(D, 2), pick(S, 3)];
  for (let i = 4; i < 20; i++) chars.push(pick(ALL, i));
  // embaralha (Fisher–Yates) com bytes independentes p/ não vazar posição das classes
  const r2 = new Uint32Array(chars.length); crypto.getRandomValues(r2);
  for (let i = chars.length - 1; i > 0; i--) { const j = r2[i] % (i + 1); [chars[i], chars[j]] = [chars[j], chars[i]]; }
  return chars.join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const caller = await getUser(req);
    if (!caller) return json({ error: 'Não autenticado.' }, 401);

    const body = await req.json().catch(() => ({}));
    const org = body?.org as string | undefined;
    const alvoEmail = String(body?.email ?? '').trim().toLowerCase();
    const alvoId = (body?.usuario_id as string | undefined) ?? undefined;
    if (!org) return json({ error: 'organização é obrigatória.' }, 400);
    if (!alvoEmail && !alvoId) return json({ error: 'Informe o usuário alvo (email ou usuario_id).' }, 400);

    const admin = adminClient();

    // 1) caller é ADMIN ATIVO desta organização
    const { data: mem } = await admin.from('organizacao_usuarios').select('papel, status').eq('organizacao_id', org).eq('usuario_id', caller.id).maybeSingle();
    if (!mem || mem.status !== 'ativo' || mem.papel !== 'admin') return json({ error: 'Apenas administradores da organização podem definir senha temporária.' }, 403);

    // 2) localizar o Auth user ALVO (por id ou e-mail, via lookup oficial)
    let targetId = alvoId ?? null;
    if (!targetId) {
      const { data: lk } = await admin.rpc('_auth_lookup', { p_email: alvoEmail });
      if (!lk?.id) return json({ error: 'Usuário não encontrado.' }, 404);
      targetId = lk.id as string;
    }

    // 3) o ALVO precisa ter vínculo NESTA organização (impede alterar usuário de outra org)
    const { data: tmem } = await admin.from('organizacao_usuarios').select('status, papel').eq('organizacao_id', org).eq('usuario_id', targetId).maybeSingle();
    if (!tmem) return json({ error: 'Este usuário não pertence à sua organização.' }, 403);

    // 4) rate limit: 60s por alvo (usa o próprio audit_log, sem estado extra)
    const { data: recente } = await admin.from('audit_log').select('criado_em').eq('acao', 'senha_temporaria_definida_por_admin').eq('entidade_id', targetId).order('criado_em', { ascending: false }).limit(1).maybeSingle();
    if (recente?.criado_em && Date.now() - new Date(recente.criado_em as string).getTime() < RATE_MS) {
      return json({ error: 'Aguarde um minuto antes de gerar outra senha temporária para este usuário.' }, 429);
    }

    // 5) gerar senha forte + API Admin OFICIAL (nunca toca auth.users direto, nunca manipula hash)
    const senha = gerarSenhaForte();
    const { error: upErr } = await admin.auth.admin.updateUserById(targetId, { password: senha });
    if (upErr) return json({ error: 'Não foi possível definir a senha (Auth).' }, 502);

    // 6) marca troca obrigatória (guard de front + backend cuidam do bloqueio até a troca)
    await admin.from('usuarios').update({ deve_trocar_senha: true, atualizado_em: new Date().toISOString() }).eq('id', targetId);

    // 7) auditoria SEM a senha (só a ação)
    await admin.from('audit_log').insert({ organizacao_id: org, usuario_id: caller.id, acao: 'senha_temporaria_definida_por_admin', entidade: 'usuario', entidade_id: targetId, dados_depois: { deve_trocar_senha: true } });

    // 8) senha mostrada UMA vez ao admin (não persistida em lugar nenhum)
    return json({ ok: true, senha_temporaria: senha, usuario_id: targetId, deve_trocar_senha: true });
  } catch {
    return json({ error: 'Erro ao processar a solicitação.' }, 500);
  }
});
