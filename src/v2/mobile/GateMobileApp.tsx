import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

/* ------------------------------------------------------------------
   Gate GLOBAL do app autenticado — decisão do dono 18/09: no CELULAR
   o Atenvo é SÓ o chat (/m), pra conversar com os clientes; nada mais.
   Embrulha o AppShellV2 no App.tsx, então TODAS as rotas de módulo
   (dashboard, kanban, disparo, …) caem aqui; /m, /alterar-senha e as
   rotas públicas (login/definir-senha) são IRMÃS — ficam fora por
   construção, sem risco de loop (troca de senha forçada continua
   acessível no celular).
   Critério "é celular" = toque (pointer coarse) + LADO MENOR da tela
   física ≤ 600px — invariante à rotação (revisão 18/09): o antigo
   max-width:760px do viewport trancava iPad em RETRATO (744px) fora
   do app inteiro e liberava o shell desktop num iPhone em PAISAGEM
   (844px); o lado menor não muda ao girar. `pointer: coarse` continua
   OBRIGATÓRIO: janela desktop estreita tem ponteiro fino e segue no
   shell completo. Checagem ÚNICA no render (sem listener de resize).
   Preserva o deep-link ?conversa= do sino (/whatsapp?conversa=X → /m/X)
   — 10+ chamadores navegam assim (sino, Kanban, Dashboard, Contatos…).
   ------------------------------------------------------------------ */

/** Fonte única do critério "é celular" — GateWhatsApp usa a MESMA (nunca divergem). */
export const ehCelular = () =>
  window.matchMedia('(pointer: coarse)').matches &&
  Math.min(window.screen.width, window.screen.height) <= 600;

export default function GateMobileApp({ children }: { children: ReactNode }) {
  const loc = useLocation();
  if (ehCelular()) {
    const c = new URLSearchParams(loc.search).get('conversa');
    return <Navigate to={c ? `/m/${c}` : '/m'} replace />;
  }
  return <>{children}</>;
}
