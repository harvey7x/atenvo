/* ============================================================================
   Manual de vendas — rota /manual (treinamento dos novos atendentes).
   ============================================================================ */
import { Suspense } from 'react';
import { lazyComRecarga } from '@/lib/recargaChunk';

const ManualTela = lazyComRecarga(() => import('./manual/ManualTela'));

export default function ManualV2() {
  return <Suspense fallback={null}><ManualTela /></Suspense>;
}
