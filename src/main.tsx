import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
// Inter self-hosted (ATENVO-DESIGN.md §5): SÓ 400 e 500 — pesos maiores são proibidos
// pelo design system e o Google Fonts em runtime foi removido do index.html.
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import './styles/global.css';
// tokens.css DEPOIS do global de propósito: dois nomes existem nos dois mundos
// (--accent e --surface-2) e o sistema NOVO tem que vencer no :root. As telas
// antigas que re-declaram a paleta no próprio escopo (.wa-app, .kanban-page…)
// continuam com seus valores até serem migradas — é o estado misto da Fase 1.
import './styles/tokens.css';
// base.css por último: o reset novo (canvas escuro) precisa vencer o body claro
// do global.css. Quando a última tela migrar, o global encolhe.
import './styles/base.css';
import { ThemeProvider } from '@/hooks/useTheme';
import { AuthProvider } from '@/context/AuthContext';
import { OrgProvider } from '@/context/OrgContext';
import { ToastProvider } from '@/hooks/useToast';
import { ConfigError } from '@/pages/ConfigError';
import { isMisconfigured } from '@/lib/supabase';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false } },
});

const root = document.getElementById('root');
if (!root) throw new Error('Elemento #root não encontrado');

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <ThemeProvider>
      {isMisconfigured ? (
        <ConfigError />
      ) : (
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <OrgProvider>
              <ToastProvider>
                <App />
              </ToastProvider>
            </OrgProvider>
          </AuthProvider>
        </QueryClientProvider>
      )}
    </ThemeProvider>
  </React.StrictMode>,
);
