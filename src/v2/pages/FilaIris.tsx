/* ============================================================================
   Fila da Iris — rota /fila-iris.
   - Demonstração: os clientes fictícios (nada é gravado).
   - Sistema: a fila de verdade (public.fila_iris_itens), só para quem está liberado em
     fila_iris_config (11/11: os 5 atendentes + Murilo). Sem liberação, a rota cai no WhatsApp.
   ============================================================================ */
import { Suspense, useCallback, useMemo } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { lazyComRecarga } from '@/lib/recargaChunk';
import { DEMO_MODE } from '@/lib/demo';
import { useAuth } from '@/context/AuthContext';
import { useOrg } from '@/context/OrgContext';
import { useAcessoFila } from '../hooks/useAcessoFila';
import { useFonteLocal } from './filaIris/fonte';
import { useFonteReal } from './filaIris/fonteReal';
import { leadsFicticios, type Lead } from './filaIris/lead';

const FilaIrisTela = lazyComRecarga(() => import('./filaIris/FilaIrisTela'));

/** o "Ver na fila" do aviso da Iris chega com ?cliente=<contato>; depois de atendido, o parâmetro sai da URL */
function usePedidoCliente(): [string | null, () => void] {
  const [params, setParams] = useSearchParams();
  const consumir = useCallback(() => {
    setParams((p) => { const n = new URLSearchParams(p); n.delete('cliente'); return n; }, { replace: true });
  }, [setParams]);
  return [params.get('cliente'), consumir];
}

function FilaDemo() {
  const iniciais = useMemo(() => leadsFicticios(), []);
  const fonte = useFonteLocal(iniciais, 'demo', 'Demonstração · clientes fictícios');
  const [cliente, consumir] = usePedidoCliente();
  return <Suspense fallback={null}><FilaIrisTela fonte={fonte} abrirInicial={cliente} aoConsumirInicial={consumir} /></Suspense>;
}

function FilaReal() {
  const fonte = useFonteReal();
  const { user } = useAuth();
  const { currentOrg } = useOrg();
  const navigate = useNavigate();
  /* o aviso da Iris ("Ver na fila") chega com ?cliente=<contato>: a janela daquele cliente abre sozinha */
  const [cliente, consumir] = usePedidoCliente();
  const abrir = (l: Lead) => navigate(l.conversaId ? `/whatsapp?conversa=${encodeURIComponent(l.conversaId)}` : '/whatsapp');
  return (
    <Suspense fallback={null}>
      <FilaIrisTela fonte={fonte} usuarioId={user?.id} admin={currentOrg?.role === 'admin'} abrirConversa={abrir}
        abrirInicial={cliente} aoConsumirInicial={consumir} />
    </Suspense>
  );
}

export default function FilaIrisV2() {
  const acesso = useAcessoFila();
  if (DEMO_MODE) return <FilaDemo />;
  if (acesso === null) return null;
  if (!acesso) return <Navigate to="/whatsapp" replace />;
  return <FilaReal />;
}
