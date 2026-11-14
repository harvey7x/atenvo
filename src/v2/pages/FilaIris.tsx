/* ============================================================================
   Fila da Iris — rota /fila-iris.
   - Demonstração: os clientes fictícios (nada é gravado).
   - Sistema: a fila de verdade (public.fila_iris_itens), só para quem está liberado em
     fila_iris_config (11/11: os 5 atendentes + Murilo). Sem liberação, a rota cai no WhatsApp.
   ============================================================================ */
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { lazyComRecarga } from '@/lib/recargaChunk';
import { DEMO_MODE } from '@/lib/demo';
import { useAuth } from '@/context/AuthContext';
import { useOrg } from '@/context/OrgContext';
import { useAcessoFila } from '../hooks/useAcessoFila';
import { useFonteLocal } from './filaIris/fonte';
import { useFonteReal } from './filaIris/fonteReal';
import { leadsFicticios, type Lead } from './filaIris/lead';
import { chegadasDeExemplo, irisDeExemplo } from './filaIris/irisAgoraRegras';
import { EQUIPE } from './filaIris/dados';
import { definirEuLocal, useRecadosLocais } from './filaIris/recados';
import { useRecadosReais } from './filaIris/recadosReal';

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
  /* a Iris agora e os adicionados (dono 14/11), com os mesmos clientes fictícios */
  const extras = useMemo(() => ({ irisAgora: irisDeExemplo(iniciais), chegadas: chegadasDeExemplo(iniciais) }), [iniciais]);
  const fonte = useFonteLocal(iniciais, 'demo', 'Demonstração · clientes fictícios', undefined, extras);
  const [cliente, consumir] = usePedidoCliente();
  /* demonstração: os recados ficam na página (o "Ver como" troca quem está olhando) */
  const [eu, setEu] = useState('matheus');
  const equipe = useMemo(() => EQUIPE.map((a) => ({ id: a.id, nome: a.nome })), []);
  const recados = useRecadosLocais(eu, equipe);
  /* o recado no meio da tela (no shell) acompanha o "Ver como" */
  useEffect(() => { definirEuLocal(eu); }, [eu]);
  return (
    <Suspense fallback={null}>
      <FilaIrisTela fonte={fonte} abrirInicial={cliente} aoConsumirInicial={consumir} recados={recados} aoVerComo={setEu} />
    </Suspense>
  );
}

function FilaReal() {
  const fonte = useFonteReal();
  const { user } = useAuth();
  const { currentOrg } = useOrg();
  const navigate = useNavigate();
  /* o aviso da Iris ("Ver na fila") chega com ?cliente=<contato>: a janela daquele cliente abre sozinha */
  const [cliente, consumir] = usePedidoCliente();
  const abrir = (l: Lead) => navigate(l.conversaId ? `/whatsapp?conversa=${encodeURIComponent(l.conversaId)}` : '/whatsapp');
  /* os recados do gestor: a mesma consulta do cartão do canto (o cache é um só) */
  const colegas = useMemo(() => EQUIPE.map((a) => ({ id: a.uid, nome: a.nome })), []);
  const recados = useRecadosReais(true, colegas);
  return (
    <Suspense fallback={null}>
      <FilaIrisTela fonte={fonte} usuarioId={user?.id} admin={currentOrg?.role === 'admin'} abrirConversa={abrir}
        abrirInicial={cliente} aoConsumirInicial={consumir} recados={recados} />
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
