import { Suspense } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { lazyComRecarga } from '@/lib/recargaChunk';

/* ------------------------------------------------------------------
   Gate da rota /whatsapp: em CELULAR (tela estreita E ponteiro de
   toque) redireciona para o chat mobile (/m), preservando o deep-link
   ?conversa= do sino; no desktop renderiza o inbox completo, intocado.
   O `pointer: coarse` é obrigatório: janela desktop em meia tela
   (snap ~683px) tem ponteiro fino e continua no inbox completo — sem
   ele o atendente ficaria PRESO em /m (que não tem sidebar nem volta).
   Checagem ÚNICA no render (sem listener de resize): redimensionar
   não arranca a página do atendente no meio do trabalho.
   ------------------------------------------------------------------ */

const WhatsAppV2 = lazyComRecarga(() => import('../pages/WhatsApp'));

export default function GateWhatsApp() {
  const [params] = useSearchParams();
  if (window.matchMedia('(max-width: 760px) and (pointer: coarse)').matches) {
    const c = params.get('conversa');
    return <Navigate to={c ? `/m/${c}` : '/m'} replace />;
  }
  return <Suspense fallback={null}><WhatsAppV2 /></Suspense>;
}
