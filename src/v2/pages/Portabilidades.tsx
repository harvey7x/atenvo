/* ============================================================================
   Portabilidades — rota /portabilidades.
   Uma tela só para demo e real (portabilidades/fonte.ts escolhe a fonte de dados).
   ============================================================================ */
import { Suspense } from 'react';
import { lazyComRecarga } from '@/lib/recargaChunk';

const PortabilidadesTela = lazyComRecarga(() => import('./portabilidades/PortabilidadesTela'));

export default function PortabilidadesV2() {
  return <Suspense fallback={null}><PortabilidadesTela /></Suspense>;
}
