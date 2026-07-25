/* Tema — Atenvo Obsidian (Fase 3.2): o app é SEMPRE escuro (ATENVO-DESIGN.md §1
 * define um único tema). A API (theme/setTheme/toggle) continua existindo porque
 * telas legadas ainda a chamam — Configurações e as telas de senha têm botões de
 * tema que a partir daqui ficam INERTES (sem efeito) até cada tela migrar e
 * removê-los. Gravamos 'dark' no localStorage para manter consistência com o que
 * qualquer código antigo espera encontrar lá. */
import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';

type Theme = 'light' | 'dark';
const KEY = 'atenvo-theme';

interface ThemeApi {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeApi | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', 'dark');
    try { localStorage.setItem(KEY, 'dark'); } catch { /* ignore */ }
  }, []);

  const value = useMemo<ThemeApi>(() => ({ theme: 'dark', setTheme: () => {}, toggle: () => {} }), []);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeApi {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme deve ser usado dentro de <ThemeProvider>');
  return ctx;
}
