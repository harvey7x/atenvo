/* ============================================================================
   Fila da Iris — rota /fila-iris.
   - Demonstração: os clientes fictícios (nada é gravado).
   - Sistema: a fila de verdade (public.fila_iris_itens), só para quem está liberado em
     fila_iris_config (11/11: os 5 atendentes + Murilo). Sem liberação, a rota cai no WhatsApp.
   ============================================================================ */
import { Suspense, useMemo } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { lazyComRecarga } from '@/lib/recargaChunk';
import { DEMO_MODE } from '@/lib/demo';
import { useAuth } from '@/context/AuthContext';
import { useOrg } from '@/context/OrgContext';
import { useAcessoFila } from '../hooks/useAcessoFila';
import { useFonteLocal } from './filaIris/fonte';
import { useFonteReal } from './filaIris/fonteReal';
import { leadsFicticios, type Lead } from './filaIris/lead';

const FilaIrisTela = lazyComRecarga(() => import('./filaIris/FilaIrisTela'));

function FilaDemo() {
  const iniciais = useMemo(() => leadsFicticios(), []);
  const fonte = useFonteLocal(iniciais, 'demo', 'Demonstração · clientes fictícios');
  return <Suspense fallback={null}><FilaIrisTela fonte={fonte} /></Suspense>;
}

function FilaReal() {
  const fonte = useFonteReal();
  const { user } = useAuth();
  const { currentOrg } = useOrg();
  const navigate = useNavigate();
  const abrir = (l: Lead) => navigate(l.conversaId ? `/whatsapp?conversa=${encodeURIComponent(l.conversaId)}` : '/whatsapp');
  return <Suspense fallback={null}><FilaIrisTela fonte={fonte} usuarioId={user?.id} admin={currentOrg?.role === 'admin'} abrirConversa={abrir} /></Suspense>;
}

export default function FilaIrisV2() {
  const acesso = useAcessoFila();
  if (DEMO_MODE) return <FilaDemo />;
  if (acesso === null) return null;
  if (!acesso) return <Navigate to="/whatsapp" replace />;
  return <FilaReal />;
}
