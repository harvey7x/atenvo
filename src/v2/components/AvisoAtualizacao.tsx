import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { criarRaizPortalV2 } from './portal';
import { assinarAtualizacao, haAtualizacao } from '../lib/atualizacao';

/* ------------------------------------------------------------------
   Aviso de deploy (dono 28/08): quando o SW do deploy novo ativa
   (lib/atualizacao sinaliza via onNeedReload do main.tsx), esta pílula
   aparece fixa no rodapé. Recarregar é SEMPRE por clique — o reload
   automático foi suprimido de propósito (rascunho/conversa do atendente).
   SEM botão "Depois" (dono 28/08, 2ª rodada): o aviso NÃO PODE sumir
   até a pessoa realmente atualizar — atendente rodando versão velha sem
   saber foi exatamente o que motivou o pedido. Ele só sai da tela pelo
   "Recarregar agora" (ou fechando a aba, que já volta na versão nova).
   ------------------------------------------------------------------ */

export function AvisoAtualizacao() {
  const [ha, setHa] = useState(() => haAtualizacao());
  useEffect(() => assinarAtualizacao(setHa), []);

  const visivel = ha;
  const [raiz, setRaiz] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (!visivel) return;
    const el = criarRaizPortalV2(document) as unknown as HTMLElement;
    setRaiz(el);
    return () => { el.remove(); setRaiz(null); };
  }, [visivel]);

  if (!visivel || !raiz) return null;
  return createPortal(
    <div className="aviso-up" role="status" aria-live="polite">
      <span className="au-dot" aria-hidden />
      <span className="au-txt">O Atenvo foi atualizado</span>
      <button type="button" className="au-btn" onClick={() => window.location.reload()}>
        Recarregar agora
      </button>
    </div>,
    raiz,
  );
}
