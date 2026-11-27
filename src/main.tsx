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
import { isMisconfigured, isDemoMode, isRevizaMode } from '@/lib/supabase';
import { resolverEAplicarPerf } from './v2/lib/perf';
import { aplicarAcento, lerAcento } from './v2/lib/acento';
import './v2/serio.css'; // visual Corporativo FIXO (decisão do dono 29/08) — global: vale no login/mobile também
import './v2/movimento.css'; // camada de movimento do Atenvo (22/10)
import './v2/repaginada.css'; // visual do Atenvo (repaginada 27/10) — age com [data-repaginada] na raiz
import './v2/reviza-visual.css'; // revisão fina das telas da Reviza na língua do Atenvo (depois da repaginada)
import './v2/reviza-sistema.css'; // a régua única da ALFA (crítica de design 12/11) — por último
import './v2/reviza-linear.css'; // estilo Linear na Reviza (dono 13/11) — só age com [data-linear] + [data-barra-alfa]
import { aplicarLinearAlfa } from './v2/lib/linearAlfa';
import './v2/reviza-moldura.css'; // moldura preta + conteúdo claro (dono 19/11) — só age com [data-moldura] + [data-barra-alfa]
import { aplicarMoldura, lerMoldura } from './v2/lib/molduraAlfa';
import './v2/reviza-fundacao.css'; // a fundação do visual novo (21/11): fonte neutra, medidas menores, pesos finos e movimento
import './v2/reviza-grafite.css';
import './v2/atenvo-azul.css'; // ATENVO em azul (dono 28/11) — por cima da moldura e do grafite, sempre por último // grafite (dono 21/11): barra fixa interligada, preto + cinza / branco + branco escuro — só com [data-moldura]
import { aplicarRepaginada } from './v2/lib/repaginada';
import { aplicarInboxPro } from './v2/lib/inboxPro';
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

/* Reviza — takeover de atualização no meio da tela (pedido do dono 11/09):
   overlay em DOM puro (roda fora da árvore React, em qualquer rota), botão
   "Atualizar agora" + contagem de 8s que recarrega sozinha. Visual sóbrio
   dourado-no-escuro, igual ao resto do sistema. */
function mostrarTakeoverAtualizacao(auto: boolean): void {
  if (document.getElementById('rv-atualiza')) return;
  const raiz = document.createElement('div');
  raiz.id = 'rv-atualiza';
  raiz.setAttribute('role', 'alertdialog');
  raiz.setAttribute('aria-label', 'Atualização do sistema');
  raiz.style.cssText = 'position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;background:rgba(8,8,10,.74);backdrop-filter:blur(4px)';
  raiz.innerHTML = `
    <div style="background:#141416;border:1px solid rgba(240,188,78,.35);border-radius:14px;max-width:420px;width:calc(100% - 48px);padding:28px 26px;text-align:center;box-shadow:0 24px 80px rgba(0,0,0,.55);font-family:inherit">
      <div style="font-size:17px;font-weight:700;color:#f5f2ea;margin-bottom:8px">Atualização do sistema</div>
      <p style="margin:0 0 18px;font-size:13.5px;line-height:1.55;color:#b9b5ab">Uma nova versão foi publicada. Atualize para continuar — leva um segundo e nada do que foi salvo se perde.</p>
      <button id="rv-atualiza-btn" type="button" style="font:inherit;font-weight:700;font-size:14px;padding:11px 24px;border-radius:9px;border:0;cursor:pointer;background:#F0BC4E;color:#241A05">Atualizar agora</button>
      <div id="rv-atualiza-cd" style="margin-top:12px;font-size:11.5px;color:#8b877e"></div>
    </div>`;
  document.body.appendChild(raiz);
  const cd = document.getElementById('rv-atualiza-cd');
  const recarregar = () => { try { sessionStorage.setItem('rv_reload_sw', String(Date.now())); } catch { /* segue */ } window.location.reload(); };
  // a planilha ainda gravando (fila de escrita): recarregar agora cortaria a edição
  // que a tela já mostra — espera a fila esvaziar. Gancho em window (planilha.ts),
  // sem importar a planilha no chunk de entrada. Teto de 60 s: rede travada não
  // prende o takeover (aí o navegador pergunta "Sair do site?" antes de perder).
  const escritaPendente = () => {
    try { return !!(window as unknown as { __rvEscritaPendente?: () => boolean }).__rvEscritaPendente?.(); } catch { return false; }
  };
  let esperando = false;
  const irAgora = () => {
    if (!escritaPendente()) { recarregar(); return; }
    if (cd) cd.textContent = 'Terminando de salvar…';
    if (esperando) return;
    esperando = true;
    const desde = Date.now();
    const t2 = window.setInterval(() => {
      if (escritaPendente() && Date.now() - desde < 60_000) return;
      clearInterval(t2);
      recarregar();
    }, 300);
  };
  document.getElementById('rv-atualiza-btn')?.addEventListener('click', irAgora);
  if (auto) {
    let s = 8;
    if (cd) cd.textContent = `Atualizando sozinho em ${s}…`;
    const t = window.setInterval(() => {
      s -= 1;
      if (esperando) { clearInterval(t); return; } // clicou "Atualizar agora" e está terminando de salvar
      if (s <= 0) { clearInterval(t); irAgora(); return; }
      if (cd) cd.textContent = `Atualizando sozinho em ${s}…`;
    }, 1000);
  }
}
if (import.meta.env.DEV) (window as unknown as { __rvTesteAtualiza?: (a: boolean) => void }).__rvTesteAtualiza = mostrarTakeoverAtualizacao;

// PWA: service worker com atualização automática (skipWaiting+clientsClaim no build).
// Abas de atendimento ficam abertas o dia todo — checa update de hora em hora.
if ('serviceWorker' in navigator) {
  registerSW({
    immediate: true,
    // Atenvo: SEM reload forçado no update (rascunho digitado, conversa aberta e
    // filtros iriam embora a cada deploy) — sinaliza o aviso in-app e o atendente
    // recarrega POR CLIQUE. REVIZA: takeover no MEIO DA TELA exigindo atualizar
    // (pedido do dono 11/09), com botão + contagem de 8s que atualiza sozinha.
    // O SW novo já assumiu o controle quando este callback roda (skipWaiting+
    // clientsClaim), então o reload pega o index novo. Se recarregou há <60s,
    // mostra só o botão (sem contagem) — nunca entra em laço de reload.
    onNeedReload() {
      if (isRevizaMode) {
        let auto = true;
        try { auto = Date.now() - Number(sessionStorage.getItem('rv_reload_sw') || 0) >= 60 * 1000; } catch { /* segue */ }
        mostrarTakeoverAtualizacao(auto);
        return;
      }
      sinalizarAtualizacao();
    },
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

// Visual Corporativo FIXO (decisão do dono 29/08): o sistema roda sempre
// no modo sério (serio.css) — sem alternador, sem preferência. O tema
// escuro/claro continua livre; reverter = apagar esta linha.
if (typeof document !== 'undefined') document.documentElement.setAttribute('data-visual', 'corp');

// Visual do Atenvo FIXO na ALFA (sem comparador): marca [data-repaginada] antes do primeiro paint.
if (typeof document !== 'undefined') aplicarRepaginada(true);

// Atendimento renovado do Atenvo (inbox pro) FIXO: marca [data-inbox-pro] antes do primeiro paint (sem comparador)
if (typeof document !== 'undefined') aplicarInboxPro(true);

// Barra lateral e topo da ALFA (dono 12/11, referência "Dashboard Sidebar"): marca [data-barra-alfa] antes
// do primeiro paint — Reviza de verdade e a demo (shell/BarraAlfa.tsx, shell/barra-alfa.css)
if (typeof document !== 'undefined') document.documentElement.setAttribute('data-barra-alfa', '');   // 28/11: o Atenvo usa o visual do Reviza
// Estilo Linear (dono 13/11): [data-linear] antes do primeiro paint, só na ALFA; padrão ligado.
// 19/11: o Linear é a BASE do visual da ALFA (a moldura preta mora em cima dele) — sempre ligado;
// a escolha antiga "reviza.linear=0" (do Antes/Depois de 13/11) não vale mais
if (typeof document !== 'undefined') aplicarLinearAlfa(true);
// Moldura preta (dono 19/11): [data-moldura] antes do primeiro paint, só na ALFA; padrão ligado.
if (typeof document !== 'undefined') aplicarMoldura(lerMoldura());

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
