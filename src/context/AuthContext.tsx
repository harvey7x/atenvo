import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { supabase, isSupabaseConfigured, isDemoMode } from '@/lib/supabase';
import type { SessionUser } from '@/types/org';
import { DEMO_USER } from '@/data/demo';

type AuthMode = 'supabase' | 'mock';
const MOCK_KEY = 'atenvo-mock-session';

interface AuthState {
  mode: AuthMode;
  loading: boolean;
  user: SessionUser | null;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
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
      return { error: error ? error.message : null };
    }
    // mock só é permitido no modo demonstração explícito (defesa adicional ao gate)
    if (!isDemoMode) return { error: 'Backend não configurado. Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.' };
    // demo: aceita qualquer credencial não vazia (sem backend real)
    if (!email || !password) return { error: 'Informe email e senha.' };
    const u: SessionUser = { ...DEMO_USER, email };
    try { localStorage.setItem(MOCK_KEY, JSON.stringify(u)); } catch { /* ignore */ }
    setUser(u);
    return { error: null };
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
