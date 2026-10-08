/* ============================================================================
   Pendências do processo — rota /pendencias.
   Uma tela só para demo e real (pendencias/fonte.ts escolhe a fonte de dados):
   na demonstração lê o store em memória; no real, o Supabase.
   ============================================================================ */
import { Suspense } from 'react';
import { lazyComRecarga } from '@/lib/recargaChunk';

const PendenciasTela = lazyComRecarga(() => import('./pendencias/PendenciasTela'));

export default function PendenciasV2() {
  return <Suspense fallback={null}><PendenciasTela /></Suspense>;
}
