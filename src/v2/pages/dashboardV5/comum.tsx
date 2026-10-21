import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { initials } from '@/lib/avatar';
import { fmtInt, fmtVariacao, variacao } from '@/data/dashboardV5.formato';
import { CardVidro } from '../../components';
import { criarRaizPortalV2 } from '../../components/portal';

/* ------------------------------------------------------------------
   Peças compartilhadas do Dashboard v5: cartão de seção, ajuda "i",
   variação vs anterior, avatar e vazio. Tudo com prefixo d5- (o guard de
   colisões v1 × v2 lê todo CSS do v2). Cor só por token: --dado-1 é a
   cor do dado (fixa), --azul/--platina-a a da interação.
   ------------------------------------------------------------------ */

/* ===== bolha flutuante (portal com classe v2: tokens valem; nunca é cortada
   pela rolagem horizontal de uma tabela). Centraliza sob a âncora, sobe se não
   couber embaixo e fica dentro da janela. ===== */
let raizPop: HTMLDivElement | null = null;
function raizDoPop(): HTMLDivElement | null {
  if (typeof document === 'undefined') return null;
  if (!raizPop || !document.body.contains(raizPop)) {
    // regra 10: raiz de portal com a classe v2 (tokens do tema valem dentro dela)
    raizPop = criarRaizPortalV2(document) as HTMLDivElement;
    raizPop.classList.add('d5-pop-raiz');
  }
  return raizPop;
}

export interface Ancora { top: number; left: number; width: number; height: number }
export const ancoraDe = (el: Element): Ancora => {
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
};

export function Pop({ ancora, id, children, largura = 280, papel = 'tooltip' }: {
  ancora: Ancora | null; id?: string; children: ReactNode; largura?: number; papel?: 'tooltip' | 'status';
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  useLayoutEffect(() => {
    if (!ancora || !ref.current) { setPos(null); return; }
    const el = ref.current;
    const w = el.offsetWidth, h = el.offsetHeight, m = 8;
    const vw = window.innerWidth, vh = window.innerHeight;
    let top = ancora.top + ancora.height + 8;
    if (top + h > vh - m) top = Math.max(m, ancora.top - h - 8);
    const left = Math.min(Math.max(m, ancora.left + ancora.width / 2 - w / 2), vw - w - m);
    setPos((p) => (p && p.top === top && p.left === left ? p : { top, left }));
  }, [ancora, children]);
  const raiz = raizDoPop();
  if (!ancora || !raiz) return null;
  return createPortal(
    <div ref={ref} id={id} role={papel} className="d5-pop"
      style={{ maxWidth: largura, top: pos?.top ?? -9999, left: pos?.left ?? -9999, visibility: pos ? 'visible' : 'hidden' }}>
      {children}
    </div>,
    raiz,
  );
}

/** Ícone "i" com bolha de definição — abre no hover E no foco do teclado. */
export function Ajuda({ texto, rotulo }: { texto: string; rotulo: string }) {
  const id = useId();
  const btn = useRef<HTMLButtonElement>(null);
  const [ancora, setAncora] = useState<Ancora | null>(null);
  const abrir = () => { if (btn.current) setAncora(ancoraDe(btn.current)); };
  const fechar = () => setAncora(null);
  useEffect(() => {
    if (!ancora) return;
    const sair = () => setAncora(null);
    window.addEventListener('scroll', sair, true);
    window.addEventListener('resize', sair);
    return () => { window.removeEventListener('scroll', sair, true); window.removeEventListener('resize', sair); };
  }, [ancora]);
  return (
    <span className="d5-ajuda">
      <button type="button" ref={btn} className={'d5-ajuda-btn' + (ancora ? ' on' : '')} aria-label={`O que é ${rotulo}`}
        aria-describedby={ancora ? id : undefined}
        onMouseEnter={abrir} onMouseLeave={fechar} onFocus={abrir} onBlur={fechar}
        onClick={(e) => { e.stopPropagation(); if (ancora) fechar(); else abrir(); }}
        onKeyDown={(e) => { if (e.key === 'Escape') fechar(); }}>
        <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden>
          <circle cx="8" cy="8" r="6.3" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <path d="M8 7.3v3.8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          <circle cx="8" cy="5.05" r=".85" fill="currentColor" />
        </svg>
      </button>
      <Pop ancora={ancora} id={id}><span className="d5-pop-tx">{texto}</span></Pop>
    </span>
  );
}

/** Cartão de seção: título (com ajuda opcional), linha de apoio e ação à direita. */
export function Secao({ titulo, sub, ajuda, acao, children, className, id }: {
  titulo: string; sub?: ReactNode; ajuda?: string; acao?: ReactNode;
  children: ReactNode; className?: string; id?: string;
}) {
  const idTit = useId();
  return (
    <CardVidro className={'d5-sec ' + (className ?? '')} id={id} role="region" aria-labelledby={idTit}>
      <div className="d5-sec-cab">
        <div className="d5-sec-tits">
          <h3 className="d5-sec-tit" id={idTit}>
            {titulo}
            {ajuda && <Ajuda texto={ajuda} rotulo={titulo} />}
          </h3>
          {sub && <p className="d5-sec-sub">{sub}</p>}
        </div>
        {acao && <div className="d5-sec-acao">{acao}</div>}
      </div>
      {children}
    </CardVidro>
  );
}

export type Sentido = 'maior' | 'menor' | 'neutro';

/** Variação vs o mesmo trecho do período anterior. `sentido` diz qual direção é boa. */
export function Variacao({ atual, anterior, sentido, comparacao }: {
  atual: number | null | undefined; anterior: number | null | undefined; sentido: Sentido; comparacao: string;
}) {
  const v = variacao(atual, anterior);
  if (!v) return <span className="d5-var-ctx">{comparacao}</span>;
  const txt = fmtVariacao(v);
  const estavel = txt === 'estável';
  const tom = estavel || sentido === 'neutro' ? 'ne' : (sentido === 'maior' ? v.abs > 0 : v.abs < 0) ? 'ok' : 'er';
  const seta = estavel ? null : v.abs > 0 ? 'up' : 'dn';
  return (
    <span className="d5-var" title={`Antes: ${fmtInt(anterior)}`}>
      <span className={`d5-var-chip d5-var-${tom}`}>
        {seta && (
          <svg viewBox="0 0 10 10" width="8" height="8" aria-hidden className={seta === 'dn' ? 'd5-var-dn' : undefined}>
            <path d="M5 1.5 9 7.5H1z" fill="currentColor" />
          </svg>
        )}
        <span className="num">{txt}</span>
        <span className="d5-sr">{seta === 'up' ? ' (subiu)' : seta === 'dn' ? ' (caiu)' : ''}</span>
      </span>
      <span className="d5-var-ctx">{comparacao}</span>
    </span>
  );
}

/** Avatar de iniciais (neutro — cor de pessoa não é dado). */
export function Avatar({ nome }: { nome: string }) {
  return <span className="d5-av" aria-hidden>{initials(nome) || '·'}</span>;
}

/** Vazio compacto dentro de um bloco (zero não é erro). */
export function Vazio({ texto, detalhe }: { texto: string; detalhe?: string }) {
  return (
    <div className="d5-vazio">
      <span className="d5-vazio-t">{texto}</span>
      {detalhe && <span className="d5-vazio-s">{detalhe}</span>}
    </div>
  );
}

/** Ponto de status do número (conectado = verde; antigo = neutro). */
export function PontoStatus({ situacao }: { situacao: 'conectado' | 'antigo' }) {
  return <i className={'d5-ponto' + (situacao === 'conectado' ? ' d5-ponto-ok' : '')} aria-hidden />;
}
