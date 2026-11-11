import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured, isDemoMode, isRevizaMode } from '@/lib/supabase';
import type { SessionUser } from '@/types/org';
import { DEMO_USER } from '@/data/demo';
import { limparDesfazer } from '@/v2/data/desfazer';

type AuthMode = 'supabase' | 'mock';
const MOCK_KEY = 'atenvo-mock-session';

/** Classifica a falha de login para a UI decidir a mensagem (nunca tratar erro de
 *  servidor/config como "senha inválida"). */
type SignInReason = 'ok' | 'invalid' | 'config' | 'server';

interface AuthState {
  mode: AuthMode;
  loading: boolean;
  user: SessionUser | null;
  signIn: (email: string, password: string) => Promise<{ error: string | null; reason: SignInReason }>;
  /** Dispara o e-mail de recuperação de senha (Supabase). Indisponível no modo demonstração. */
  resetPassword: (email: string) => Promise<{ error: string | null }>;
  /** true quando o usuário chegou via link de recuperação (evento PASSWORD_RECOVERY). */
  recovery: boolean;
  /** Define a nova senha na sessão de recuperação (ou logado). Indisponível no demo. */
  updatePassword: (newPassword: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  /** Recarrega o nome do perfil (usuarios.nome; profiles.nome no Reviza) sem exigir logout — usar após salvar o perfil. */
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

/** Monta o SessionUser resolvendo o nome com prioridade: perfil no banco -> metadados do Auth -> ''.
 *  NUNCA usa o e-mail como nome (o e-mail tem seu próprio campo). */
async function buildSessionUser(u: { id: string; email?: string | null; user_metadata?: Record<string, unknown> } | null | undefined): Promise<SessionUser | null> {
  if (!u) return null;
  const metaName = ((u.user_metadata?.name as string | undefined) ?? '').trim();
  let nome = '';
  let deveTrocarSenha = false;
  if (supabase) {
    try {
      // Reviza: o perfil mora em public.profiles ('usuarios' não existe lá — dava 404 em todo login);
      // mesmas colunas nas duas tabelas. Atenvo segue em 'usuarios', intocado.
      const tabelaPerfil = isRevizaMode ? 'profiles' : 'usuarios';
      const { data } = await supabase.from(tabelaPerfil).select('nome, deve_trocar_senha').eq('id', u.id).maybeSingle();
      nome = ((data?.nome as string | undefined) ?? '').trim();
      deveTrocarSenha = Boolean((data as { deve_trocar_senha?: boolean } | null)?.deve_trocar_senha);
    } catch { /* mantém metaName */ }
  }
  return { id: u.id, email: u.email ?? '', name: nome || metaName || '', deveTrocarSenha };
}

/** Saiu (ou entrou OUTRA pessoa) na mesma aba: nada do usuário anterior fica em
 *  memória. As chaves do react-query não levam o id do usuário — a planilha (CPF
 *  completo), as senhas reveladas e o papel apareceriam pro próximo login até o
 *  refetch. Zera também as edições pendentes/fila da planilha (gancho em
 *  window, sem importar o módulo da cobrança no chunk de entrada) e o Desfazer
 *  (o inverso rodaria com a sessão nova). Síncrono: seguro dentro do onAuthStateChange. */
function limparSessaoAnterior(qc: QueryClient) {
  try { void qc.cancelQueries(); } catch { /* segue */ }
  try { qc.clear(); } catch { /* segue */ }
  try { (window as unknown as { __rvResetPlanilha?: () => void }).__rvResetPlanilha?.(); } catch { /* planilha não carregada: nada a zerar */ }
  try { limparDesfazer(); } catch { /* segue */ }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const mode: AuthMode = isSupabaseConfigured ? 'supabase' : 'mock';
  const qc = useQueryClient();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [recovery, setRecovery] = useState(false);
  const uidRef = useRef<string | null>(null); // dono do que está no cache agora

  useEffect(() => {
    let active = true;
    if (mode === 'supabase' && supabase) {
      supabase.auth.getSession().then(async ({ data }) => {
        if (uidRef.current == null) uidRef.current = data.session?.user?.id ?? null;
        const su = await buildSessionUser(data.session?.user);
        if (!active) return;
        setUser(su);
        setLoading(false);
      });
      const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'PASSWORD_RECOVERY') setRecovery(true);
        // SIGNED_OUT (Sair, sessão expirada, saiu em outra aba) ou login de outro usuário
        const uid = session?.user?.id ?? null;
        if (event === 'SIGNED_OUT' || (uid && uidRef.current && uid !== uidRef.current)) limparSessaoAnterior(qc);
        uidRef.current = uid;
        buildSessionUser(session?.user).then((su) => { if (active) setUser(su); });
      });
      return () => { active = false; sub.subscription.unsubscribe(); };
    }
    // modo mock: restaura sessão simulada do localStorage
    try {
      const raw = localStorage.getItem(MOCK_KEY);
      if (raw) setUser(JSON.parse(raw) as SessionUser);
    } catch { /* ignore */ }
    setLoading(false);
    return () => { active = false; };
  }, [mode, qc]);

  const signIn: AuthState['signIn'] = async (email, password) => {
    if (mode === 'supabase' && supabase) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (!error) return { error: null, reason: 'ok' };
      const code = (error as { code?: string }).code;
      const status = (error as { status?: number }).status;
      const invalid = code === 'invalid_credentials' || code === 'invalid_grant'
        || (status === 400 && /invalid login credentials/i.test(error.message));
      // 404/5xx/rede/config => 'server' (NUNCA vira "senha inválida")
      return { error: error.message, reason: invalid ? 'invalid' : 'server' };
    }
    // mock só é permitido no modo demonstração explícito (defesa adicional ao gate)
    if (!isDemoMode) return { error: 'Backend não configurado. Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.', reason: 'config' };
    // demo: aceita qualquer credencial não vazia (sem backend real)
    if (!email || !password) return { error: 'Informe email e senha.', reason: 'invalid' };
    const u: SessionUser = { ...DEMO_USER, email };
    try { localStorage.setItem(MOCK_KEY, JSON.stringify(u)); } catch { /* ignore */ }
    setUser(u);
    return { error: null, reason: 'ok' };
  };

  const resetPassword: AuthState['resetPassword'] = async (email) => {
    if (mode === 'supabase' && supabase) {
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + '/redefinir-senha' });
      return { error: error ? error.message : null };
    }
    return { error: 'Recuperação de senha indisponível no modo demonstração.' };
  };

  const updatePassword: AuthState['updatePassword'] = async (newPassword) => {
    if (mode === 'supabase' && supabase) {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (!error) setRecovery(false);
      return { error: error ? error.message : null };
    }
    return { error: 'Indisponível no modo demonstração.' };
  };

  const signOut: AuthState['signOut'] = async () => {
    if (mode === 'supabase' && supabase) {
      await supabase.auth.signOut();
    } else {
      try { localStorage.removeItem(MOCK_KEY); } catch { /* ignore */ }
      limparSessaoAnterior(qc); // demo: mesma regra do real (o próximo login começa limpo)
      setUser(null);
    }
  };

  const refreshProfile: AuthState['refreshProfile'] = async () => {
    if (mode !== 'supabase' || !supabase) return;
    const { data } = await supabase.auth.getUser();
    setUser(await buildSessionUser(data.user));
  };

  const value = useMemo<AuthState>(() => ({ mode, loading, user, signIn, resetPassword, recovery, updatePassword, signOut, refreshProfile }), [mode, loading, user, recovery]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de <AuthProvider>');
  return ctx;
}
