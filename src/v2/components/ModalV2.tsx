import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { criarRaizPortalV2 } from './portal';
import { BotaoPrimario, BotaoSec } from './Botao';
import './componentes.css';

type ModalV2Props = {
  aberto: boolean;
  aoFechar: () => void;
  titulo?: ReactNode;
  children: ReactNode;
  rodape?: ReactNode;
  largura?: number;
  /** quando false, clicar fora não fecha (ex.: durante loading) — como no Modal v1 */
  fecharNoVeu?: boolean;
};

/**
 * Modal v2 — cartão de vidro sobre véu escurecido, mesma família dos cards.
 * Comportamento do Modal v1 preservado: Esc fecha (sempre chama aoFechar — o
 * chamador guarda o busy), clique no véu fecha quando fecharNoVeu, autofoco
 * no primeiro campo. Monta em portal com a classe `v2` na raiz (regra 10).
 */
export function ModalV2({ aberto, aoFechar, titulo, children, rodape, largura = 440, fecharNoVeu = true }: ModalV2Props) {
  const cartaoRef = useRef<HTMLDivElement>(null);
  const aoFecharRef = useRef(aoFechar);
  useEffect(() => { aoFecharRef.current = aoFechar; });

  // Raiz do portal atrelada a `aberto`: criada só quando o modal abre e
  // removida no fechamento/unmount — modais fechados não deixam nós órfãos,
  // e o cleanup simulado do StrictMode recria a raiz corretamente.
  const [raiz, setRaiz] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!aberto) return;
    const el = criarRaizPortalV2(document) as HTMLDivElement;
    setRaiz(el);
    return () => { el.remove(); setRaiz(null); };
  }, [aberto]);

  useEffect(() => {
    if (!aberto) return;
    const aoTeclar = (e: KeyboardEvent) => { if (e.key === 'Escape') aoFecharRef.current(); };
    document.addEventListener('keydown', aoTeclar);
    const t = setTimeout(() => {
      cartaoRef.current?.querySelector<HTMLElement>('input,textarea,select,button')?.focus();
    }, 30);
    return () => { document.removeEventListener('keydown', aoTeclar); clearTimeout(t); };
  }, [aberto]);

  if (!aberto || !raiz) return null;
  return createPortal(
    <div className="veu" onMouseDown={(e) => { if (fecharNoVeu && e.target === e.currentTarget) aoFechar(); }}>
      <div className="p-modal vidro" ref={cartaoRef} style={{ width: largura }} role="dialog" aria-modal="true">
        {titulo != null && <div className="p-modal-cab">{titulo}</div>}
        <div className="p-modal-corpo">{children}</div>
        {rodape != null && <div className="p-modal-rodape">{rodape}</div>}
      </div>
    </div>,
    raiz,
  );
}

type ConfirmDialogV2Props = {
  aberto: boolean;
  titulo: string;
  mensagem: ReactNode;
  rotuloConfirmar: string;
  destrutivo?: boolean;
  carregando?: boolean;
  aoConfirmar: () => void;
  aoCancelar: () => void;
};

/** Diálogo de confirmação v2 (paridade com ConfirmDialog v1). */
export function ConfirmDialogV2({ aberto, titulo, mensagem, rotuloConfirmar, destrutivo, carregando, aoConfirmar, aoCancelar }: ConfirmDialogV2Props) {
  return (
    <ModalV2
      aberto={aberto}
      aoFechar={() => { if (!carregando) aoCancelar(); }}
      fecharNoVeu={!carregando}
      titulo={titulo}
      largura={420}
      rodape={
        <>
          <BotaoSec disabled={carregando} onClick={aoCancelar}>Voltar</BotaoSec>
          {destrutivo ? (
            <button type="button" className="p-btn btn-perigo" disabled={carregando} onClick={aoConfirmar}>
              {carregando ? 'Aguarde…' : rotuloConfirmar}
            </button>
          ) : (
            <BotaoPrimario disabled={carregando} onClick={aoConfirmar}>
              {carregando ? 'Aguarde…' : rotuloConfirmar}
            </BotaoPrimario>
          )}
        </>
      }
    >
      <div className="p-modal-msg">{mensagem}</div>
    </ModalV2>
  );
}
