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
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const mode: AuthMode = isSupabaseConfigured ? 'supabase' : 'mock';
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<SessionUser | null>(null);

  useEffect(() => {
    let active = true;
    if (mode === 'supabase' && supabase) {
      supabase.auth.getSession().then(({ data }) => {
        if (!active) return;
        const u = data.session?.user;
        setUser(u ? { id: u.id, email: u.email ?? '', name: (u.user_metadata?.name as string) ?? u.email ?? 'Usuário' } : null);
        setLoading(false);
      });
      const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
        const u = session?.user;
        setUser(u ? { id: u.id, email: u.email ?? '', name: (u.user_metadata?.name as string) ?? u.email ?? 'Usuário' } : null);
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

  const signOut: AuthState['signOut'] = async () => {
    if (mode === 'supabase' && supabase) {
      await supabase.auth.signOut();
    } else {
      try { localStorage.removeItem(MOCK_KEY); } catch { /* ignore */ }
      setUser(null);
    }
  };

  const value = useMemo<AuthState>(() => ({ mode, loading, user, signIn, signOut }), [mode, loading, user]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de <AuthProvider>');
  return ctx;
}
