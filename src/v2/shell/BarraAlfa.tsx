/* =====================================================================
   BARRA LATERAL DA ALFA (Reviza de verdade e a demo) — 12/11, pedido do dono:
   "deixar o sistema da Reviza mais ou menos dessa forma" (referência: a Dashboard
   Sidebar — o "workspace" no topo, os grupos com título, contador e atalho, o pé
   com Configurações e Sair, o botão de recolher e a trilha "onde estou" no topo),
   "mais profissional", "priorizar os tons dourados".

   Aqui o "workspace" é a empresa (ALFA GROUP) e o AMBIENTE (Cobranças / Atendimento):
   o quadrado dourado com a marca abre a troca de ambiente — só para quem tem os dois.
   Os itens, a ordem, os ícones e as regras de quem vê o quê são os de antes (o shell
   decide e manda pronto); muda a pele e o desenho do topo e do pé.

   Três jeitos, escolhidos pelo shell (AppShellV2):
   - 'aberta'  — 260px encaixada, o conteúdo começa depois dela (padrão em tela larga);
   - 'trilho'  — 64px só com os ícones; o mouse (ou o Tab) abre por cima do conteúdo,
                 como a barra de antes ("a barra do lado tem que minimizar", 11/09);
   - 'gaveta'  — no celular ela some; o botão do topo abre por cima, com um véu atrás.
   ===================================================================== */
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent as RKeyboardEvent, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import './barra-alfa.css';

export type ModoBarra = 'aberta' | 'trilho' | 'gaveta';
export type ItemBarra = { slug: string; rotulo: string; icone: ReactNode; badge?: number; badgeTitulo?: string; atalho?: string };
export type GrupoBarra = { rotulo: string; itens: ItemBarra[] };
export type AmbienteBarra = { id: string; rotulo: string };

/* a tecla do atalho como a pessoa vê no teclado dela: ⌘ no Mac, Ctrl no Windows */
const EH_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent || '');
export const rotuloAtalho = (tecla: string) => (EH_MAC ? `⌘${tecla}` : `Ctrl ${tecla}`);

/* ícones do chrome da barra — Lucide (lucide.dev, licença ISC), o mesmo desenho da referência */
const svg = (corpo: ReactNode, tam = 16, cls?: string) => (
  <svg className={cls} width={tam} height={tam} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false">{corpo}</svg>
);
export const IcBusca = () => svg(<><path d="m21 21-4.34-4.34" /><circle cx="11" cy="11" r="8" /></>);
export const IcSair = () => svg(<><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /></>);
export const IcFechar = ({ tam = 18 }: { tam?: number }) => svg(<><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>, tam);
const IcSetas = () => svg(<><path d="m7 15 5 5 5-5" /><path d="m7 9 5-5 5 5" /></>, 16, 'ba-ws-seta');
export const IcPainel = ({ aberto }: { aberto: boolean }) => svg(
  <><rect width="18" height="18" x="3" y="3" rx="2" /><path d="M9 3v18" />{aberto ? <path d="m16 15-3-3 3-3" /> : <path d="m14 9 3 3-3 3" />}</>, 18);

/* a marca da ALFA (o triângulo do LogoAtenvo) em uma cor só — vai dentro do quadrado dourado */
function MarcaAlfa() {
  return (
    <svg viewBox="0 0 256 256" width="20" height="20" fill="none" aria-hidden focusable="false">
      <path d="M128 30 L228 216 L28 216 Z" stroke="currentColor" strokeWidth="20" strokeLinejoin="round" />
      <path d="M128 82 L184 202 L112 202 L144 142 L106 142 L72 202" stroke="currentColor" strokeWidth="17" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/* ---------- troca de ambiente (o "workspace" da referência) ---------- */
function TrocaAmbiente({ org, atual, ambientes, carregando, aoTrocar, aoMudarAberto }: {
  org: string; atual: AmbienteBarra | null; ambientes: AmbienteBarra[]; carregando: boolean;
  aoTrocar: (id: string) => void; aoMudarAberto: (aberto: boolean) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  const gatilho = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const troca = !carregando && ambientes.length > 1;
  useEffect(() => { aoMudarAberto(aberto); }, [aberto, aoMudarAberto]);
  useEffect(() => { if (!troca) setAberto(false); }, [troca]);

  useEffect(() => {
    if (!aberto) return;
    // abre no ambiente atual: as setas começam dele
    raiz.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus({ preventScroll: true });
    const fora = (e: PointerEvent) => { if (!raiz.current?.contains(e.target as Node)) setAberto(false); };
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || e.isComposing) return;
      e.preventDefault(); setAberto(false); gatilho.current?.focus({ preventScroll: true });
    };
    document.addEventListener('pointerdown', fora);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', fora); document.removeEventListener('keydown', esc); };
  }, [aberto]);

  const corpo = (
    <>
      <span className="ba-ws-marca" aria-hidden><MarcaAlfa /></span>
      <span className="ba-ws-tx">
        <span className="ba-ws-nome">{org}</span>
        <span className="ba-ws-amb">{carregando || !atual ? ' ' : atual.rotulo}</span>
      </span>
      {troca && <IcSetas />}
    </>
  );
  if (!troca) return <div className="ba-ws"><div className="ba-ws-gat estatico">{corpo}</div></div>;

  const teclas = (e: RKeyboardEvent<HTMLDivElement>) => {
    const itens = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[role="menuitemradio"]'));
    const at = itens.indexOf(document.activeElement as HTMLElement);
    let prox: number;
    if (e.key === 'ArrowDown') prox = (at + 1) % itens.length;
    else if (e.key === 'ArrowUp') prox = (at - 1 + itens.length) % itens.length;
    else if (e.key === 'Home') prox = 0;
    else if (e.key === 'End') prox = itens.length - 1;
    else { if (e.key === 'Tab') setAberto(false); return; }
    e.preventDefault(); itens[prox]?.focus();
  };
  return (
    <div ref={raiz} className="ba-ws" onBlur={(e) => { const p = e.relatedTarget as Node | null; if (p && !e.currentTarget.contains(p)) setAberto(false); }}>
      <button ref={gatilho} type="button" className="ba-ws-gat" title="Trocar de ambiente"
        aria-haspopup="menu" aria-expanded={aberto} aria-controls={aberto ? menuId : undefined}
        onClick={() => setAberto((v) => !v)}>
        {corpo}
      </button>
      {aberto && (
        <div className="ba-menu" id={menuId} role="menu" aria-label="Ambientes" onKeyDown={teclas}>
          {ambientes.map((a) => (
            <button key={a.id} type="button" role="menuitemradio" aria-checked={a.id === atual?.id} tabIndex={-1}
              className="ba-menu-item" onClick={() => { setAberto(false); gatilho.current?.focus({ preventScroll: true }); aoTrocar(a.id); }}>
              {a.rotulo}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- um item do menu (link de rota) ---------- */
function ItemLink({ item, aoEscolher }: { item: ItemBarra; aoEscolher?: () => void }) {
  const temBadge = !!item.badge && item.badge > 0;
  return (
    <NavLink to={`/${item.slug}`} className={({ isActive }) => (isActive ? 'ba-item on' : 'ba-item')} onClick={aoEscolher}
      aria-keyshortcuts={item.atalho ? `Meta+${item.atalho} Control+${item.atalho}` : undefined}>
      <span className="ba-item-pri">
        <span className="ba-ico">{item.icone}{temBadge && <i className="ba-ponto" aria-hidden />}</span>
        <span className="ba-item-tx">{item.rotulo}</span>
      </span>
      <span className="ba-item-lado">
        {item.atalho && <kbd className="ba-kbd" aria-hidden>{rotuloAtalho(item.atalho)}</kbd>}
        {temBadge && <span className="ba-badge num" title={item.badgeTitulo}>{item.badge}</span>}
      </span>
    </NavLink>
  );
}

export type BarraAlfaProps = {
  modo: ModoBarra;
  /** gaveta (celular): aberta por cima do conteúdo */
  gavetaAberta: boolean;
  aoFecharGaveta: () => void;
  org: string;
  ambientes: AmbienteBarra[];
  ambienteAtual: AmbienteBarra | null;
  aoTrocarAmbiente: (id: string) => void;
  /** enquanto o perfil carrega: sem itens (o menu do ambiente da rota não pisca para quem não o tem) */
  carregando: boolean;
  grupos: GrupoBarra[];
  /** itens do pé (Configurações), acima do Sair */
  rodape: ItemBarra[];
  aoBuscar: () => void;
  buscaAberta: boolean;
  aoSair: () => void;
  versao?: string | null;
};

export function BarraAlfa(p: BarraAlfaProps) {
  const raiz = useRef<HTMLElement>(null);
  const nav = useRef<HTMLElement>(null);
  const { pathname } = useLocation();
  const [menuAberto, setMenuAberto] = useState(false);
  const [rolagem, setRolagem] = useState<'' | 'abaixo' | 'acima' | 'ambos'>('');
  const gavetaFechada = p.modo === 'gaveta' && !p.gavetaAberta;

  // gaveta fechada: fora da ordem do Tab e do leitor de tela
  useLayoutEffect(() => { raiz.current?.toggleAttribute('inert', gavetaFechada); }, [gavetaFechada]);

  // gaveta aberta: Esc fecha
  useEffect(() => {
    if (p.modo !== 'gaveta' || !p.gavetaAberta) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !e.defaultPrevented && !p.buscaAberta) p.aoFecharGaveta(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [p.modo, p.gavetaAberta, p.buscaAberta, p.aoFecharGaveta]); // eslint-disable-line react-hooks/exhaustive-deps

  // a lista rola sem barra (como na referência): um esmaecido na borda avisa que tem mais
  const medir = useCallback(() => {
    const n = nav.current; if (!n) return;
    const acima = n.scrollTop > 2; const abaixo = n.scrollTop + n.clientHeight < n.scrollHeight - 2;
    setRolagem(acima && abaixo ? 'ambos' : acima ? 'acima' : abaixo ? 'abaixo' : '');
  }, []);
  useEffect(() => {
    const n = nav.current; if (!n) return;
    medir();
    const ro = new ResizeObserver(medir); ro.observe(n);
    n.addEventListener('scroll', medir, { passive: true });
    return () => { ro.disconnect(); n.removeEventListener('scroll', medir); };
  }, [medir]);
  // troca de rota: o item ativo fica à vista dentro da lista (sem rolar a página)
  useEffect(() => {
    const n = nav.current; if (!n) return;
    const ativo = n.querySelector<HTMLElement>('.ba-item.on'); if (!ativo) { medir(); return; }
    const topo = ativo.offsetTop - n.offsetTop; const fim = topo + ativo.offsetHeight;
    if (topo < n.scrollTop) n.scrollTop = Math.max(0, topo - 28);
    else if (fim > n.scrollTop + n.clientHeight) n.scrollTop = fim - n.clientHeight + 12;
    medir();
  }, [pathname, p.grupos, medir]);

  const escolher = p.modo === 'gaveta' ? p.aoFecharGaveta : undefined;
  return (
    <>
      <aside ref={raiz} id="ba-barra" className="ba-barra" aria-label="Barra lateral"
        data-menu={menuAberto || undefined}>
        <div className="ba-in">
          <TrocaAmbiente org={p.org} atual={p.ambienteAtual} ambientes={p.ambientes} carregando={p.carregando}
            aoTrocar={(id) => { escolher?.(); p.aoTrocarAmbiente(id); }} aoMudarAberto={setMenuAberto} />

          <nav ref={nav} className="ba-grupos" aria-label="Navegação principal" data-rolagem={rolagem || undefined}>
            {!p.carregando && (
              <div className="ba-grupo">
                <button type="button" className="ba-item" onClick={() => { escolher?.(); p.aoBuscar(); }}
                  aria-haspopup="dialog" aria-expanded={p.buscaAberta} aria-keyshortcuts="Meta+K Control+K">
                  <span className="ba-item-pri"><span className="ba-ico"><IcBusca /></span><span className="ba-item-tx">Buscar</span></span>
                  <span className="ba-item-lado"><kbd className="ba-kbd" aria-hidden>{rotuloAtalho('K')}</kbd></span>
                </button>
              </div>
            )}
            {!p.carregando && p.grupos.map((g) => (
              <div className="ba-grupo" key={g.rotulo} role="group" aria-labelledby={`ba-g-${g.rotulo}`}>
                <span className="ba-grupo-rot" id={`ba-g-${g.rotulo}`}>{g.rotulo}</span>
                {g.itens.map((i) => <ItemLink key={i.slug} item={i} aoEscolher={escolher} />)}
              </div>
            ))}
          </nav>

          <div className="ba-pe">
            {!p.carregando && p.rodape.map((i) => <ItemLink key={i.slug} item={i} aoEscolher={escolher} />)}
            <button type="button" className="ba-item" onClick={p.aoSair}>
              <span className="ba-item-pri"><span className="ba-ico"><IcSair /></span><span className="ba-item-tx">Sair</span></span>
            </button>
            {p.versao && (
              <div className="ba-versao num" title="Versão do painel que você está usando agora. Se estiver diferente da mais nova, atualize a página.">
                Painel v{p.versao}
              </div>
            )}
          </div>
        </div>
      </aside>
      {p.modo === 'gaveta' && p.gavetaAberta && <div className="ba-veu" onClick={p.aoFecharGaveta} aria-hidden />}
    </>
  );
}

/* ---------- o lado esquerdo da barra do topo: recolher + "ambiente / página" ---------- */
export function TopoAlfa({ modo, gavetaAberta, aoAlternar, ambiente, pagina }: {
  modo: ModoBarra; gavetaAberta: boolean; aoAlternar: () => void; ambiente: string; pagina: string;
}) {
  const aberta = modo === 'aberta' || (modo === 'gaveta' && gavetaAberta);
  return (
    <div className="ba-topo">
      <button type="button" className="ba-alternar" onClick={aoAlternar} aria-controls="ba-barra" aria-expanded={aberta}
        aria-label={modo === 'gaveta' ? (gavetaAberta ? 'Fechar o menu' : 'Abrir o menu') : aberta ? 'Recolher a barra lateral' : 'Abrir a barra lateral'}
        title={modo === 'gaveta' ? 'Menu' : aberta ? 'Recolher a barra lateral' : 'Abrir a barra lateral'}>
        <IcPainel aberto={aberta} />
      </button>
      <nav className="ba-trilha" aria-label="Você está em">
        {ambiente && <span className="ba-trilha-amb">{ambiente}</span>}
        {ambiente && pagina && <span className="ba-trilha-sep" aria-hidden>/</span>}
        {pagina && <span className="ba-trilha-pag" aria-current="page">{pagina}</span>}
      </nav>
    </div>
  );
}
