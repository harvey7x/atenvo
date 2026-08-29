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
import { isMisconfigured, isDemoMode } from '@/lib/supabase';
import { resolverEAplicarPerf } from './v2/lib/perf';
import { aplicarAcento, lerAcento } from './v2/lib/acento';
import { aplicarVisual, lerVisual } from './v2/lib/visual';
import { sinalizarAtualizacao } from './v2/lib/atualizacao';
import { tentarRecarga } from '@/lib/recargaChunk';
import { registerSW } from 'virtual:pwa-register';

// Deploy novo invalida os chunks antigos; se o preload de uma dependência falhar,
// recarrega a página (1x/min — guarda em recargaChunk.ts) para buscar o index novo.
// NÃO remover: é a 2ª metade do mecanismo de atualização do PWA (SW novo purga o
// precache antigo → chunk velho 404 → este guard recarrega e pega o index novo).
if (typeof window !== 'undefined') {
  window.addEventListener('vite:preloadError', (evento) => {
    if (tentarRecarga()) evento.preventDefault();
  });
}

// PWA: service worker com atualização automática (skipWaiting+clientsClaim no build).
// Abas de atendimento ficam abertas o dia todo — checa update de hora em hora.
if ('serviceWorker' in navigator) {
  registerSW({
    immediate: true,
    // SEM reload forçado no update (rascunho digitado, conversa aberta e filtros
    // iriam embora a cada deploy). Em vez disso, sinaliza o aviso in-app
    // (AvisoAtualizacao): o atendente recarrega POR CLIQUE. O SW novo já assumiu
    // o controle quando este callback roda (skipWaiting+clientsClaim), então o
    // reload pega o index novo; o guard vite:preloadError segue cobrindo 404.
    onNeedReload() { sinalizarAtualizacao(); },
    onRegisteredSW(_url, reg) {
      if (!reg) return;
      // 5 min (era 15): o aviso de deploy deve chegar rápido — atendente rodou versão
      // velha por horas sem saber (dono, 28/08). Check também na VOLTA DO FOCO (alt-tab
      // é constante no atendimento), com folga de 60s pra não metralhar o servidor.
      let ultimoCheck = Date.now();
      const checar = () => { ultimoCheck = Date.now(); reg.update().catch(() => { /* offline: tenta na próxima */ }); };
      setInterval(checar, 5 * 60 * 1000);
      window.addEventListener('focus', () => { if (Date.now() - ultimoCheck > 60 * 1000) checar(); });
    },
  });
}

// Intensidade dos efeitos (contrato item 6): produção = --fx 0.5 (padrão em tokens.css);
// só o modo demonstração sobe para 1 via html[data-demo]. O corte torna 0.5 o default real.
if (typeof document !== 'undefined' && isDemoMode) document.documentElement.setAttribute('data-demo', '');

// Modo de Performance (v2): resolve a preferência (manual vence; 'auto' detecta a
// máquina) e marca [data-perf] na raiz antes do primeiro paint — a sonda de FPS
// refina o 'auto' logo depois. Roda uma vez por carga.
if (typeof document !== 'undefined') resolverEAplicarPerf();

// Acento do sistema (teste azul × verde): marca [data-acento] antes do primeiro
// paint pelo mesmo motivo do perf — sem flash de acento errado.
if (typeof document !== 'undefined') aplicarAcento(lerAcento());

// Visual (Platina × Corporativo): mesma regra — antes do primeiro paint.
if (typeof document !== 'undefined') aplicarVisual(lerVisual());

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
