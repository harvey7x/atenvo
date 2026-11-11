import { useSyncExternalStore } from 'react';
import { isRevizaMode } from '@/lib/supabase';
import { assinarStatusRealtime, lerStatusRealtime } from '../data/cobranca/useRealtimeCobranca';

/* Selo "Ao vivo": ponto pulsante + rótulo. Na Reviza reflete o channel de
   tempo real (verde quando conectado, âmbar reconectando); no demo mostra
   "Ao vivo" pois o painel se mantém fresco pelo polling — o demo representa
   o produto ao vivo. */
export function SeloAoVivo() {
  const status = useSyncExternalStore(assinarStatusRealtime, lerStatusRealtime, () => 'conectando' as const);
  const aoVivo = !isRevizaMode || status === 'conectado';
  // a 1ª conexão NUNCA aparece como falha — só uma queda após ter conectado vira "Reconectando"
  const texto = aoVivo ? 'Ao vivo' : status === 'reconectando' ? 'Reconectando…' : 'Conectando…';
  const titulo = aoVivo ? 'Atualizando em tempo real' : status === 'reconectando' ? 'Reconectando ao tempo real…' : 'Conectando ao tempo real…';
  return (
    <span className={aoVivo ? 'selo-vivo on' : 'selo-vivo'} title={titulo} role="status">
      <i className="selo-vivo-dot" aria-hidden />
      {texto}
    </span>
  );
}
