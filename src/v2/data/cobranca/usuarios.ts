/* =====================================================================
   Gestão de usuários da instância Reviza (só admin). Listar/ativar/papel/
   nome vão direto na tabela profiles (RLS + guard). Criar, senha, login e
   EXCLUIR passam pela Edge Function reviza-admin (usa a chave de serviço no
   servidor — nunca no cliente); ela valida que quem chama é admin.
   DEMO (sem banco): as mesmas operações num store local (alfa_usuarios_v1) —
   demo é o contrato: a tela é a mesma, só muda a fonte.
   ===================================================================== */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isRevizaMode, supabase } from '@/lib/supabase';
import { registrarDesfazer, registrarBloqueada } from '../desfazer';
import type { Papel } from './types';
import { AMBIENTES, type Ambiente } from '../modulos';
import { lerAreas } from '../config/areas';
import { temRecurso } from '../config/recursos';

export interface UsuarioRow {
  id: string; nome: string; email: string; papel: Papel; ativo: boolean;
  deve_trocar_senha: boolean; created_at: string; usuario: string;
  /** ambientes marcados pelo administrador (profiles.modulos) — o que vale é ambientesDoPerfil(papel, modulos) */
  modulos?: Ambiente[] | null;
  /** telas liberadas (profiles.areas): null = todas as que o papel alcança — ver data/config/areas.ts */
  areas?: string[] | null;
}

const CHAVE = ['reviza', 'usuarios'] as const;
const real = () => isRevizaMode && !!supabase;

/* ---------------- DEMO: store local ---------------- */
const DEMO_LS = 'alfa_usuarios_v1';
/** id do usuário "logado" na demo (Henrique, administrador) */
export const DEMO_EU = 'demo-henrique';
function demoSeed(): UsuarioRow[] {
  const d = (dias: number) => new Date(Date.now() - dias * 86400_000).toISOString();
  const u = (id: string, nome: string, usuario: string, papel: Papel, dias: number, extra: Partial<UsuarioRow> = {}): UsuarioRow =>
    ({ id, nome, usuario, email: `${usuario}@alfa.demo`, papel, ativo: true, deve_trocar_senha: false, created_at: d(dias), ...extra });
  return [
    u(DEMO_EU, 'Henrique', 'henrique', 'admin', 60),
    u('demo-bruna', 'Bruna', 'bruna', 'financeiro', 45),
    u('demo-adm', 'Administrativo', 'administrativo', 'cadastro', 44),
    u('demo-eduardo', 'Eduardo', 'eduardo', 'comercial', 40, { modulos: ['cobrancas', 'atendimento'] }),
    u('demo-paty', 'Paty', 'paty', 'comercial', 38, { modulos: ['cobrancas', 'atendimento'] }),
    u('demo-augusto', 'Augusto', 'augusto', 'comercial', 36),
    u('demo-junior', 'Junior', 'junior', 'comercial', 30),
    u('demo-garcia', 'Garcia', 'garcia', 'comercial', 25),
    u('demo-emillyn', 'Emillyn', 'emillyn', 'comercial', 12, { deve_trocar_senha: true }),
    u('demo-leandro', 'Leandro', 'leandro', 'comercial', 90, { ativo: false }),
    u('demo-carla', 'Carla', 'carla', 'atendente', 8),
    u('demo-bianca', 'Bianca', 'bianca', 'atendente', 5),
  ];
}
function demoLer(): UsuarioRow[] {
  try { const raw = localStorage.getItem(DEMO_LS); if (raw) { const p = JSON.parse(raw); if (Array.isArray(p)) return p as UsuarioRow[]; } } catch { /* ignore */ }
  return demoSeed();
}
function demoGravar(l: UsuarioRow[]) { try { localStorage.setItem(DEMO_LS, JSON.stringify(l)); } catch { /* ignore */ } }
function demoMudar(id: string, patch: Partial<UsuarioRow>) {
  const l = demoLer();
  if (!l.some((x) => x.id === id)) throw new Error('Usuário não encontrado.');
  demoGravar(l.map((x) => (x.id === id ? { ...x, ...patch } : x)));
}
/** a MESMA senha temporária da função (Rv- + 9) — na demo nada é enviado a lugar nenhum */
function gerarSenhaDemo(): string {
  const alfa = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const arr = new Uint8Array(9); crypto.getRandomValues(arr);
  let s = 'Rv-'; for (const b of arr) s += alfa[b % alfa.length];
  return s;
}

/* ---------------- regras compartilhadas (tela, demo e função usam as mesmas) ---------------- */
export const loginValido = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');
/** mensagem de erro da senha escolhida pelo admin ('' = ok) — igual à da Edge Function */
export function senhaFraca(s: string): string {
  if (s.length < 8) return 'A senha precisa ter pelo menos 8 caracteres.';
  if (!/[A-Za-z]/.test(s) || !/[0-9]/.test(s)) return 'A senha precisa ter letras e números.';
  return '';
}
/** por que NÃO dá pra excluir este usuário ('' = pode). Mesmas guardas da função. */
export function bloqueioExclusao(alvo: UsuarioRow, todos: UsuarioRow[], meuId: string | null): string {
  if (meuId && alvo.id === meuId) return 'Você não pode excluir a sua própria conta.';
  if (alvo.papel === 'admin' && !todos.some((u) => u.id !== alvo.id && u.papel === 'admin' && u.ativo)) return 'É o último administrador ativo — crie ou ative outro antes.';
  return '';
}
/** por que NÃO dá pra desativar ('' = pode) */
export function bloqueioDesativar(alvo: UsuarioRow, todos: UsuarioRow[], meuId: string | null): string {
  if (!alvo.ativo) return '';
  if (meuId && alvo.id === meuId) return 'Você não pode desativar a sua própria conta.';
  if (alvo.papel === 'admin' && !todos.some((u) => u.id !== alvo.id && u.papel === 'admin' && u.ativo)) return 'É o último administrador ativo.';
  return '';
}

export function useUsuarios(habilitado: boolean) {
  return useQuery<UsuarioRow[]>({
    queryKey: CHAVE,
    enabled: habilitado,
    queryFn: async () => {
      if (!real()) return demoLer();
      const { data, error } = await supabase!
        .from('profiles').select('*') // '*': `modulos` (ambientes) entrou depois — banco sem a coluna segue respondendo
        .order('created_at', { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []).map((r) => ({
        ...(r as Omit<UsuarioRow, 'usuario'>),
        modulos: Array.isArray((r as { modulos?: unknown }).modulos) ? ((r as { modulos: Ambiente[] }).modulos) : null,
        areas: lerAreas((r as { areas?: unknown }).areas),
        usuario: String((r as { email?: string }).email ?? '').replace(/@reviza\.local$/i, ''),
      })) as UsuarioRow[];
    },
  });
}

/** id de quem está logado (proteções: não se excluir/desativar) */
export function useMeuId() {
  return useQuery<string | null>({
    queryKey: ['reviza', 'eu'],
    staleTime: 300_000,
    queryFn: async () => (real() ? (await supabase!.auth.getUser()).data.user?.id ?? null : DEMO_EU),
  });
}

// mensagens conhecidas da Edge Function reviza-admin vêm sem acento — aqui viram
// o texto que o usuário lê (padrão MSG_PARADO; mensagem desconhecida passa como veio)
const MSG_ADMIN: Record<string, string> = {
  'nao autenticado': 'Não autenticado.',
  'sem permissao': 'Sem permissão.',
  'id invalido': 'Id inválido.',
  'dados invalidos': 'Dados inválidos.',
  'acao desconhecida': 'Ação desconhecida.',
  'Usuario invalido (use letras, numeros, ponto, hifen).': 'Usuário inválido (use letras, números, ponto, hífen).',
  'Ja existe um usuario com esse nome.': 'Já existe um usuário com esse nome.',
  'Ja existe um usuario com esse login.': 'Já existe um usuário com esse login.',
};
async function chamarAdmin(body: Record<string, unknown>): Promise<{ senha?: string; usuario?: string }> {
  const { data, error } = await supabase!.functions.invoke('reviza-admin', { body });
  if (error) {
    // erros da função vêm no corpo; tenta extrair a mensagem
    let msg = error.message;
    try { const j = await (error as { context?: Response }).context?.json?.(); if (j?.error) msg = j.error; } catch { /* ignore */ }
    throw new Error(MSG_ADMIN[msg] ?? msg);
  }
  const errCorpo = (data as { error?: string })?.error;
  if (errCorpo) throw new Error(MSG_ADMIN[errCorpo] ?? errCorpo);
  return data as { senha?: string; usuario?: string };
}
const invalidar = (qc: ReturnType<typeof useQueryClient>) => { void qc.invalidateQueries({ queryKey: CHAVE }); void qc.invalidateQueries({ queryKey: ['reviza', 'registros'] }); };

export function useCriarUsuario() {
  const qc = useQueryClient();
  return useMutation({
    /** senha vazia = gera temporária (troca obrigatória no 1º acesso) */
    mutationFn: async (a: { usuario: string; nome: string; papel: Papel; senha?: string; exigirTroca?: boolean; modulos?: Ambiente[]; areas?: string[] | null }) => {
      if (real()) {
        // só manda ambientes e telas quando a instalação tem essas peças no servidor (config/recursos.ts)
        const { modulos, areas, ...resto } = a;
        return chamarAdmin({ acao: 'criar', ...resto, ...(temRecurso('atendimento') && modulos ? { modulos } : {}), ...(temRecurso('telas') && areas !== undefined ? { areas } : {}) });
      }
      const usuario = loginValido(a.usuario);
      if (!usuario) throw new Error('Usuário inválido (use letras, números, ponto, hífen).');
      const l = demoLer();
      if (l.some((x) => x.usuario === usuario)) throw new Error('Já existe um usuário com esse nome.');
      if (a.senha) { const f = senhaFraca(a.senha); if (f) throw new Error(f); }
      const senha = a.senha || gerarSenhaDemo();
      demoGravar([...l, { id: `demo-${Date.now().toString(36)}`, nome: a.nome.trim() || usuario, usuario, email: `${usuario}@alfa.demo`, papel: a.papel, ativo: true, deve_trocar_senha: a.senha ? a.exigirTroca !== false : true, created_at: new Date().toISOString(), modulos: a.modulos ?? null, areas: a.areas ?? null }]);
      return { usuario, senha };
    },
    onSuccess: (_d, a) => { invalidar(qc); registrarBloqueada(`criar usuário ${a.nome}`, 'Criação de usuário não é desfeita por aqui — desative ou exclua o usuário na tela Usuários.'); },
  });
}
export function useResetarSenha() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      if (real()) return chamarAdmin({ acao: 'resetar', id });
      demoMudar(id, { deve_trocar_senha: true });
      return { senha: gerarSenhaDemo() };
    },
    onSuccess: () => { invalidar(qc); registrarBloqueada('resetar senha', 'A senha temporária já foi gerada — não dá pra desfazer.'); },
  });
}
/** o ADMIN escolhe a senha (exigirTroca = a pessoa troca no 1º acesso) */
export function useDefinirSenha() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (a: { id: string; senha: string; exigirTroca: boolean }) => {
      const f = senhaFraca(a.senha); if (f) throw new Error(f);
      if (real()) return chamarAdmin({ acao: 'definir_senha', ...a });
      demoMudar(a.id, { deve_trocar_senha: a.exigirTroca });
      return {};
    },
    onSuccess: () => { invalidar(qc); registrarBloqueada('alterar senha', 'Senha trocada não volta pela tela — defina outra se precisar.'); },
  });
}
/** nome (profiles) e login (Edge Function "renomear") */
export function useEditarUsuario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (a: { id: string; nome?: string; usuario?: string }) => {
      const login = a.usuario != null ? loginValido(a.usuario) : undefined;
      if (a.usuario != null && !login) throw new Error('Login inválido (use letras, números, ponto, hífen).');
      if (!real()) {
        const l = demoLer();
        if (login && l.some((x) => x.id !== a.id && x.usuario === login)) throw new Error('Já existe um usuário com esse login.');
        demoMudar(a.id, { ...(a.nome != null ? { nome: a.nome.trim() } : {}), ...(login ? { usuario: login, email: `${login}@alfa.demo` } : {}) });
        return;
      }
      if (a.nome != null) { const { error } = await supabase!.from('profiles').update({ nome: a.nome.trim() }).eq('id', a.id); if (error) throw new Error(error.message); }
      if (login) await chamarAdmin({ acao: 'renomear', id: a.id, usuario: login });
    },
    onSuccess: () => invalidar(qc),
  });
}
/** EXCLUIR DO SISTEMA — definitivo (confirmar = o login digitado) */
export function useExcluirUsuario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (a: { id: string; confirmar: string }) => {
      if (real()) return chamarAdmin({ acao: 'excluir', ...a });
      const l = demoLer();
      const alvo = l.find((x) => x.id === a.id);
      if (!alvo) throw new Error('Usuário não encontrado.');
      const b = bloqueioExclusao(alvo, l, DEMO_EU); if (b) throw new Error(b);
      if (a.confirmar.trim().toLowerCase() !== alvo.usuario.toLowerCase()) throw new Error('Confirmação não confere: digite o login do usuário.');
      demoGravar(l.filter((x) => x.id !== a.id));
      return {};
    },
    onSuccess: (_d, a) => { invalidar(qc); registrarBloqueada('excluir usuário', `Exclusão é definitiva (${a.confirmar}) — crie o usuário de novo se precisar.`); },
  });
}
export function useDefinirAtivo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (a: { id: string; ativo: boolean }) => {
      if (!real()) { demoMudar(a.id, { ativo: a.ativo }); return; }
      const { error } = await supabase!.from('profiles').update({ ativo: a.ativo }).eq('id', a.id);
      if (error) throw new Error(error.message);
    },
    onMutate: async (a) => { const u = qc.getQueryData<UsuarioRow[]>(CHAVE)?.find((x) => x.id === a.id); const me = real() ? (await supabase!.auth.getUser()).data.user?.id : DEMO_EU; return { antes: u?.ativo, nome: u?.nome, souEu: me === a.id }; },
    onSuccess: (_d, a, ctx) => {
      invalidar(qc);
      if (ctx?.antes === undefined) return;
      // desfazer a própria (des)ativação é impossível pela sessão (perde o acesso) → bloqueia
      if (ctx?.souEu) { registrarBloqueada(`${a.ativo ? 'ativar' : 'desativar'} a própria conta`, 'Mexer no seu próprio acesso não dá pra desfazer por aqui — peça a outro admin.'); return; }
      const antes = ctx.antes;
      registrarDesfazer({ rotulo: `${a.ativo ? 'ativar' : 'desativar'} ${ctx?.nome ?? 'usuário'}`, inverso: async () => {
        if (!real()) { demoMudar(a.id, { ativo: antes }); return; }
        const { error } = await supabase!.from('profiles').update({ ativo: antes }).eq('id', a.id); if (error) throw new Error(error.message);
      } });
    },
  });
}
export function useDefinirPapel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (a: { id: string; papel: Papel }) => {
      if (!real()) { demoMudar(a.id, { papel: a.papel }); return; }
      const { error } = await supabase!.from('profiles').update({ papel: a.papel }).eq('id', a.id);
      if (error) throw new Error(error.message);
    },
    onMutate: async (a) => { const u = qc.getQueryData<UsuarioRow[]>(CHAVE)?.find((x) => x.id === a.id); const me = real() ? (await supabase!.auth.getUser()).data.user?.id : DEMO_EU; return { antes: u?.papel, nome: u?.nome, souEu: me === a.id }; },
    onSuccess: (_d, a, ctx) => {
      invalidar(qc);
      const antes = ctx?.antes; if (!antes) return;
      // desfazer a mudança do PRÓPRIO papel é impossível pela sessão (perde o admin) → bloqueia
      if (ctx?.souEu) { registrarBloqueada('mudar o próprio papel', 'Mexer no seu próprio papel não dá pra desfazer por aqui — peça a outro admin.'); return; }
      registrarDesfazer({ rotulo: `papel de ${ctx?.nome ?? 'usuário'}`, inverso: async () => {
        if (!real()) { demoMudar(a.id, { papel: antes }); return; }
        const { error } = await supabase!.from('profiles').update({ papel: antes }).eq('id', a.id); if (error) throw new Error(error.message);
      } });
    },
  });
}

/** AMBIENTES do usuário (Cobranças / Atendimento) — só vale para quem não tem acesso fixo
    (administrador = os dois; atendente = só Atendimento: ver data/modulos.ts) */
export function useDefinirAmbientes() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (a: { id: string; modulos: Ambiente[] }) => {
      const lista = AMBIENTES.filter((m) => a.modulos.includes(m));
      if (!lista.length) throw new Error('Marque pelo menos um ambiente — sem nenhum, a pessoa não entra em nada.');
      if (!real()) { demoMudar(a.id, { modulos: lista }); return; }
      const { error } = await supabase!.from('profiles').update({ modulos: lista }).eq('id', a.id);
      if (error) throw new Error(error.message);
    },
    onMutate: async (a) => { const u = qc.getQueryData<UsuarioRow[]>(CHAVE)?.find((x) => x.id === a.id); return { antes: u?.modulos ?? null, nome: u?.nome }; },
    onSuccess: (_d, a, ctx) => {
      invalidar(qc);
      void qc.invalidateQueries({ queryKey: ['cobranca', 'papel'] });
      const antes = ctx?.antes ?? null;
      registrarDesfazer({ rotulo: `ambientes de ${ctx?.nome ?? 'usuário'}`, inverso: async () => {
        if (!real()) { demoMudar(a.id, { modulos: antes }); return; }
        const { error } = await supabase!.from('profiles').update({ modulos: antes }).eq('id', a.id); if (error) throw new Error(error.message);
      } });
    },
  });
}

/** ÁREAS da pessoa (22/11): as telas que ela vê dentro do que o papel alcança. null = sem restrição
    (todas as do papel). Vale na hora: o menu e a rota leem do perfil (data/config/areas.ts). */
export function useDefinirAreas() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (a: { id: string; areas: string[] | null }) => {
      const lista = a.areas ? lerAreas(a.areas) : null;
      if (lista && !lista.length) throw new Error('Marque pelo menos uma tela — sem nenhuma, a pessoa entra e não vê nada.');
      if (!real()) { demoMudar(a.id, { areas: lista }); return; }
      const { error } = await supabase!.from('profiles').update({ areas: lista }).eq('id', a.id);
      if (error) throw new Error(error.message);
    },
    onMutate: async (a) => { const u = qc.getQueryData<UsuarioRow[]>(CHAVE)?.find((x) => x.id === a.id); return { antes: u?.areas ?? null, nome: u?.nome }; },
    onSuccess: (_d, a, ctx) => {
      invalidar(qc);
      void qc.invalidateQueries({ queryKey: ['cobranca', 'papel'] });
      const antes = ctx?.antes ?? null;
      registrarDesfazer({ rotulo: `telas de ${ctx?.nome ?? 'usuário'}`, inverso: async () => {
        if (!real()) { demoMudar(a.id, { areas: antes }); return; }
        const { error } = await supabase!.from('profiles').update({ areas: antes }).eq('id', a.id); if (error) throw new Error(error.message);
      } });
    },
  });
}
