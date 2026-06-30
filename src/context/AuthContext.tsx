import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { supabase, isSupabaseConfigured, isDemoMode } from '@/lib/supabase';
import type { SessionUser } from '@/types/org';
import { DEMO_USER } from '@/data/demo';

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
  signOut: () => Promise<void>;
  /** Recarrega o nome do perfil (usuarios.nome) sem exigir logout — usar após salvar o perfil. */
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

/** Monta o SessionUser resolvendo o nome com prioridade: usuarios.nome -> metadados do Auth -> ''.
 *  NUNCA usa o e-mail como nome (o e-mail tem seu próprio campo). */
async function buildSessionUser(u: { id: string; email?: string | null; user_metadata?: Record<string, unknown> } | null | undefined): Promise<SessionUser | null> {
  if (!u) return null;
  const metaName = ((u.user_metadata?.name as string | undefined) ?? '').trim();
  let nome = '';
  if (supabase) {
    try {
      const { data } = await supabase.from('usuarios').select('nome').eq('id', u.id).maybeSingle();
      nome = ((data?.nome as string | undefined) ?? '').trim();
    } catch { /* mantém metaName */ }
  }
  return { id: u.id, email: u.email ?? '', name: nome || metaName || '' };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const mode: AuthMode = isSupabaseConfigured ? 'supabase' : 'mock';
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<SessionUser | null>(null);

  useEffect(() => {
    let active = true;
    if (mode === 'supabase' && supabase) {
      supabase.auth.getSession().then(async ({ data }) => {
        const su = await buildSessionUser(data.session?.user);
        if (!active) return;
        setUser(su);
        setLoading(false);
      });
      const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
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
  }, [mode]);

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
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + '/login' });
      return { error: error ? error.message : null };
    }
    return { error: 'Recuperação de senha indisponível no modo demonstração.' };
  };

  const signOut: AuthState['signOut'] = async () => {
    if (mode === 'supabase' && supabase) {
      await supabase.auth.signOut();
    } else {
      try { localStorage.removeItem(MOCK_KEY); } catch { /* ignore */ }
      setUser(null);
    }
  };

  const refreshProfile: AuthState['refreshProfile'] = async () => {
    if (mode !== 'supabase' || !supabase) return;
    const { data } = await supabase.auth.getUser();
    setUser(await buildSessionUser(data.user));
  };

  const value = useMemo<AuthState>(() => ({ mode, loading, user, signIn, resetPassword, signOut, refreshProfile }), [mode, loading, user]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de <AuthProvider>');
  return ctx;
}
