import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { criarRaizPortalV2 } from './portal';
import { assinarAtualizacao, haAtualizacao } from '../lib/atualizacao';

/* ------------------------------------------------------------------
   Aviso de deploy (dono 28/08): quando o SW do deploy novo ativa
   (lib/atualizacao sinaliza via onNeedReload do main.tsx), esta pílula
   aparece fixa no rodapé. Recarregar é SEMPRE por clique — o reload
   automático foi suprimido de propósito (rascunho/conversa do atendente).
   "Depois" some nesta sessão; o aviso volta no próximo deploy (ou no
   próximo load, que já entra na versão nova e nem sinaliza).
   ------------------------------------------------------------------ */

export function AvisoAtualizacao() {
  const [ha, setHa] = useState(() => haAtualizacao());
  const [dispensado, setDispensado] = useState(false);
  useEffect(() => assinarAtualizacao(setHa), []);

  const visivel = ha && !dispensado;
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
      <button type="button" className="au-depois" onClick={() => setDispensado(true)}>
        Depois
      </button>
    </div>,
    raiz,
  );
}
