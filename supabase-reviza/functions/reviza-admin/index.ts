import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
function json(o: unknown, status = 200) {
  return new Response(JSON.stringify(o), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}
function gerarSenha(): string {
  const alfa = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const arr = new Uint8Array(9); crypto.getRandomValues(arr);
  let s = 'Rv-'; for (const b of arr) s += alfa[b % alfa.length];
  return s;
}
const PAPEIS = ['cadastro', 'comercial', 'financeiro', 'admin']; // sem "gestor" por decisão do dono (11/09); "cadastro" = só tela Novos
// 23/11 (migrations 91 e 92): "atendente" = quem trabalha só no Atendimento (a tela só oferece esse papel
// quando o Atendimento está ligado na instalação).
const PAPEIS_ATENDIMENTO = ['atendente'];
const AMBIENTES = ['cobrancas', 'atendimento'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const authHeader = req.headers.get('Authorization') ?? '';

    // 1) valida que QUEM CHAMA é admin ativo (usando o JWT do proprio usuario)
    const asUser = createClient(url, anon, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });
    const { data: u } = await asUser.auth.getUser();
    const uid = u?.user?.id;
    if (!uid) return json({ error: 'nao autenticado' }, 401);
    const { data: perfil } = await asUser.from('profiles').select('papel, ativo, nome').eq('id', uid).maybeSingle();
    if (!perfil || !perfil.ativo || perfil.papel !== 'admin') return json({ error: 'sem permissao' }, 403);

    const body = await req.json().catch(() => ({}));
    const acao = body.acao;
    const admin = createClient(url, service, { auth: { persistSession: false } });
    // auditoria (tela Registros): ação de PESSOA, com o admin como ator
    const registrar = async (acaoReg: string, id: string, rotulo: string, detalhe: string) => {
      await admin.from('registros').insert({ ator_id: uid, ator_nome: perfil.nome || '—', ator_papel: 'admin', acao: acaoReg, entidade: 'usuário', entidade_id: id, rotulo, detalhe });
    };
    // senha escolhida pelo admin: mínimo 8, com letra e número
    const senhaFraca = (s: string) => s.length < 8 ? 'A senha precisa ter pelo menos 8 caracteres.'
      : !/[A-Za-z]/.test(s) || !/[0-9]/.test(s) ? 'A senha precisa ter letras e números.' : '';

    if (acao === 'criar') {
      const usuario = String(body.usuario ?? '').trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');
      if (!usuario) return json({ error: 'Usuario invalido (use letras, numeros, ponto, hifen).' }, 400);
      // papel que o sistema não conhece é recusado (antes virava "comercial" sem avisar)
      if (body.papel != null && ![...PAPEIS, ...PAPEIS_ATENDIMENTO].includes(body.papel)) return json({ error: 'Papel desconhecido.' }, 400);
      const papel = body.papel ?? 'comercial';
      // ambientes (profiles.modulos) e telas liberadas (profiles.areas): opcionais; sem eles vale o padrão do papel
      const modulos = Array.isArray(body.modulos) ? AMBIENTES.filter((a) => (body.modulos as unknown[]).includes(a)) : null;
      const areas = Array.isArray(body.areas) ? (body.areas as unknown[]).filter((x): x is string => typeof x === 'string' && x.length <= 60).slice(0, 80) : null;
      const nome = String(body.nome ?? '').trim() || usuario;
      const email = `${usuario}@reviza.local`;
      // senha: a que o admin escolheu (validada) ou uma temporária gerada aqui
      const escolhida = typeof body.senha === 'string' && body.senha.length > 0 ? String(body.senha) : '';
      if (escolhida) { const f = senhaFraca(escolhida); if (f) return json({ error: f }, 400); }
      const senha = escolhida || gerarSenha();
      const exigirTroca = escolhida ? body.exigirTroca !== false : true;
      const { data: created, error } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true, user_metadata: { nome } });
      if (error) return json({ error: /already|exists|registered/i.test(error.message) ? 'Ja existe um usuario com esse nome.' : error.message }, 400);
      const { error: e2 } = await admin.from('profiles').update({
        papel, ativo: true, nome, deve_trocar_senha: exigirTroca,
        ...(modulos && modulos.length ? { modulos } : {}), ...(areas ? { areas } : {}),
      }).eq('id', created.user.id);
      // o login não pode ficar criado pela metade (sem papel): se o perfil não gravou, desfaz
      if (e2) { await admin.auth.admin.deleteUser(created.user.id).catch(() => undefined); return json({ error: e2.message }, 400); }
      await registrar('criou', created.user.id, nome, `login ${usuario} · papel ${papel}`);
      return json({ ok: true, usuario, senha, papel, nome });
    }

    if (acao === 'resetar') {
      const id = String(body.id ?? '');
      if (!id) return json({ error: 'id invalido' }, 400);
      const senha = gerarSenha();
      const { error } = await admin.auth.admin.updateUserById(id, { password: senha });
      if (error) return json({ error: error.message }, 400);
      const { data: alvo } = await admin.from('profiles').update({ deve_trocar_senha: true }).eq('id', id).select('nome').maybeSingle();
      await registrar('resetou a senha', id, alvo?.nome ?? '—', 'senha temporária gerada · troca no 1º acesso');
      return json({ ok: true, senha });
    }

    // renomear o LOGIN (usuário) — troca o e-mail interno via GoTrue (mantém tudo consistente)
    if (acao === 'renomear') {
      const id = String(body.id ?? '');
      const usuario = String(body.usuario ?? '').trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');
      if (!id || !usuario) return json({ error: 'dados invalidos' }, 400);
      const { data: alvo } = await admin.from('profiles').select('nome, email').eq('id', id).maybeSingle();
      const antigo = String(alvo?.email ?? '').replace(/@reviza\.local$/i, '');
      const email = `${usuario}@reviza.local`;
      const { error } = await admin.auth.admin.updateUserById(id, { email, email_confirm: true });
      if (error) return json({ error: /already|exists|registered/i.test(error.message) ? 'Ja existe um usuario com esse login.' : error.message }, 400);
      const { error: e2 } = await admin.from('profiles').update({ email }).eq('id', id);
      if (e2) return json({ error: e2.message }, 400);
      await registrar('renomeou o login', id, alvo?.nome ?? '—', `de ${antigo || '—'} para ${usuario}`);
      return json({ ok: true, usuario, email });
    }

    // o admin DEFINE a senha (em vez de gerar uma temporária)
    if (acao === 'definir_senha') {
      const id = String(body.id ?? '');
      const senha = String(body.senha ?? '');
      if (!id) return json({ error: 'id invalido' }, 400);
      const f = senhaFraca(senha); if (f) return json({ error: f }, 400);
      const exigirTroca = body.exigirTroca !== false;
      const { error } = await admin.auth.admin.updateUserById(id, { password: senha });
      if (error) return json({ error: error.message }, 400);
      const { data: alvo } = await admin.from('profiles').update({ deve_trocar_senha: exigirTroca }).eq('id', id).select('nome').maybeSingle();
      await registrar('alterou a senha', id, alvo?.nome ?? '—', exigirTroca ? 'senha definida pelo admin · troca no 1º acesso' : 'senha definida pelo admin');
      return json({ ok: true });
    }

    // EXCLUIR DO SISTEMA (definitivo). Os dados de negócio ficam (clientes são ligados pelo
    // NOME do comercial; pagamentos/entradas/avisos têm FK "set null"); some o login, as
    // notificações e os recibos de leitura da pessoa. Guardas: não exclui a si mesmo, nem o
    // último admin ativo, e exige digitar o login (confirmação).
    if (acao === 'excluir') {
      const id = String(body.id ?? '');
      if (!id) return json({ error: 'id invalido' }, 400);
      if (id === uid) return json({ error: 'Você não pode excluir a sua própria conta.' }, 400);
      const { data: alvo } = await admin.from('profiles').select('nome, email, papel, ativo').eq('id', id).maybeSingle();
      if (!alvo) return json({ error: 'Usuário não encontrado.' }, 404);
      const login = String(alvo.email ?? '').replace(/@reviza\.local$/i, '');
      if (String(body.confirmar ?? '').trim().toLowerCase() !== login.toLowerCase()) return json({ error: 'Confirmação não confere: digite o login do usuário.' }, 400);
      if (alvo.papel === 'admin') {
        const { count } = await admin.from('profiles').select('id', { count: 'exact', head: true }).eq('papel', 'admin').eq('ativo', true).neq('id', id);
        if (!count) return json({ error: 'Não dá pra excluir o último administrador ativo.' }, 400);
      }
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) return json({ error: error.message }, 400);
      await registrar('excluiu', id, alvo.nome || login, `login ${login} · papel ${alvo.papel}`);
      return json({ ok: true });
    }

    return json({ error: 'acao desconhecida' }, 400);
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
