import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import './styles/global.css';
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
