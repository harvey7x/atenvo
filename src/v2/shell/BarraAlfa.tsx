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

   Três jeitos, escolhidos pelo shell (AppShellV2) pela largura da tela:
   - 'aberta'  — 260px encaixada, o conteúdo começa depois dela (tela larga, ≥1440px, se a
                 pessoa não recolheu — a escolha fica salva neste aparelho);
   - 'trilho'  — 64px só com os ícones (tela larga recolhida, ou tela média 761–1439px, onde
                 encaixar espremeria as telas): o mouse ou o Tab abrem por cima do conteúdo, como
                 a barra de antes ("a barra do lado tem que minimizar", 11/09); na tela média o
                 botão do topo também abre por cima;
   - 'gaveta'  — no celular (≤760px) ela some; o botão do topo abre por cima, com um véu atrás.
   ===================================================================== */
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent as RKeyboardEvent, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import './barra-alfa.css';

export type ModoBarra = 'aberta' | 'trilho' | 'gaveta';
export type ItemBarra = { slug: string; rotulo: string; icone: ReactNode; badge?: number; badgeTitulo?: string; atalho?: string };
export type GrupoBarra = { rotulo: string; itens: ItemBarra[] };
export type AmbienteBarra = { id: string; rotulo: string; descricao?: string };

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
      {/* 19/11: o mesmo desenho, traço mais firme e cantos redondos — lê melhor no quadrado pequeno */}
      <path d="M128 34 L226 214 L30 214 Z" stroke="currentColor" strokeWidth="22" strokeLinejoin="round" />
      <path d="M128 88 L180 198 L114 198 L143 144 L108 144 L76 198" stroke="currentColor" strokeWidth="19" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/* ícone de cada ambiente no menu de troca (quadro de 28px): Cobranças = recibo; Atendimento = balão */
export const ICONE_AMBIENTE: Record<string, ReactNode> = {
  cobrancas: svg(<><path d="M5 3.5h14v17l-2.4-1.5-2.3 1.5-2.3-1.5-2.3 1.5-2.3-1.5L5 20.5z" /><path d="M8.5 8h7M8.5 11.5h7M8.5 15h4" /></>, 16),
  atendimento: svg(<path d="M20 11.5a7.5 7.5 0 0 1-11 6.6L4 19.5l1.4-4.6A7.5 7.5 0 1 1 20 11.5z" />, 16),
};
const IcCheck = () => svg(<path d="M20 6 9 17l-5-5" />, 16, 'ba-menu-check');

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
        /* o conceito central do produto: título, ícone, descrição e o ambiente atual marcado (crítica 12/11) */
        <div className="ba-menu" id={menuId} role="menu" aria-labelledby={menuId + '-t'} onKeyDown={teclas}>
          <span className="ba-menu-tit" id={menuId + '-t'}>Ambientes</span>
          {ambientes.map((a) => (
            <button key={a.id} type="button" role="menuitemradio" aria-checked={a.id === atual?.id} tabIndex={-1}
              className="ba-menu-item" onClick={() => { setAberto(false); gatilho.current?.focus({ preventScroll: true }); aoTrocar(a.id); }}>
              <span className="ba-menu-ico" aria-hidden>{ICONE_AMBIENTE[a.id] ?? ICONE_AMBIENTE.cobrancas}</span>
              <span className="ba-menu-tx">
                <span className="ba-menu-nome">{a.rotulo}</span>
                {a.descricao && <span className="ba-menu-desc">{a.descricao}</span>}
              </span>
              {a.id === atual?.id && <IcCheck />}
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
        {temBadge && <span className="ba-badge num" title={item.badgeTitulo}>{(item.badge ?? 0) > 99 ? '99+' : item.badge}</span>}
      </span>
    </NavLink>
  );
}

export type AcaoTopoBarra = { rotulo: string; tipo: 'fixar' | 'recolher' | 'fechar'; aoClicar: () => void };

export type BarraAlfaProps = {
  modo: ModoBarra;
  /** aberta POR CIMA do conteúdo: a gaveta do celular, ou o trilho aberto pelo botão do topo (tela média) */
  sobreposta: boolean;
  aoFecharSobreposta: () => void;
  /** o botão do canto da barra quando ela está por cima do conteúdo (fixar aberta / recolher / fechar) */
  acaoTopo?: AcaoTopoBarra | null;
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

const idGrupo = (rotulo: string) => 'ba-g-' + rotulo.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
const IcFixar = () => svg(<><rect width="18" height="18" x="3" y="3" rx="2" /><path d="M9 3v18" /><path d="m14 9 3 3-3 3" /></>, 16);
const IcRecolher = () => svg(<><rect width="18" height="18" x="3" y="3" rx="2" /><path d="M9 3v18" /><path d="m16 15-3-3 3-3" /></>, 16);

export function BarraAlfa(p: BarraAlfaProps) {
  const raiz = useRef<HTMLElement>(null);
  const nav = useRef<HTMLElement>(null);
  const { pathname } = useLocation();
  const [menuAberto, setMenuAberto] = useState(false);
  const [rolagem, setRolagem] = useState<'' | 'abaixo' | 'acima' | 'ambos'>('');
  const gavetaFechada = p.modo === 'gaveta' && !p.sobreposta;

  // gaveta fechada: fora da ordem do Tab e do leitor de tela
  useLayoutEffect(() => { raiz.current?.toggleAttribute('inert', gavetaFechada); }, [gavetaFechada]);

  // por cima do conteúdo (gaveta ou trilho aberto pelo botão): o foco entra na barra e, ao fechar, volta ao
  // botão do topo; o Esc fecha (o Esc do menu de ambiente e o da busca vêm antes)
  const menuRef = useRef(menuAberto); menuRef.current = menuAberto;
  const buscaRef = useRef(p.buscaAberta); buscaRef.current = p.buscaAberta;
  const fecharRef = useRef(p.aoFecharSobreposta); fecharRef.current = p.aoFecharSobreposta;
  useEffect(() => {
    if (!p.sobreposta) return;
    const r = raiz.current;
    const alvo = r?.querySelector<HTMLElement>('.ba-item.on') ?? r?.querySelector<HTMLElement>('.ba-ws-gat:not(.estatico), .ba-item');
    alvo?.focus({ preventScroll: true });
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || menuRef.current || buscaRef.current) return;
      e.preventDefault(); fecharRef.current();
    };
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('keydown', esc);
      // o foco estava na barra: volta para o botão que abre/fecha (senão se perde no body)
      if (r && r.contains(document.activeElement)) document.querySelector<HTMLElement>('.ba-alternar')?.focus({ preventScroll: true });
    };
  }, [p.sobreposta]);

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
  // troca de rota (ou o menu muda de verdade): o item ativo fica à vista dentro da lista, sem rolar a página.
  // A chave é a LISTA de itens, não o array (que é novo a cada render do shell — a lista pulava sozinha)
  const chaveItens = p.grupos.map((g) => g.itens.map((i) => i.slug).join(',')).join('|');
  useEffect(() => {
    const n = nav.current; if (!n) return;
    const ativo = n.querySelector<HTMLElement>('.ba-item.on'); if (!ativo) { medir(); return; }
    const topo = ativo.offsetTop - n.offsetTop; const fim = topo + ativo.offsetHeight;
    if (topo < n.scrollTop) n.scrollTop = Math.max(0, topo - 28);
    else if (fim > n.scrollTop + n.clientHeight) n.scrollTop = fim - n.clientHeight + 12;
    medir();
  }, [pathname, chaveItens, medir]);

  const escolher = p.sobreposta ? p.aoFecharSobreposta : undefined;
  const a = p.acaoTopo;
  return (
    <>
      <aside ref={raiz} id="ba-barra" className="ba-barra" aria-label="Barra lateral"
        data-menu={menuAberto || undefined}>
        <div className="ba-in">
          <div className="ba-cab">
            <TrocaAmbiente org={p.org} atual={p.ambienteAtual} ambientes={p.ambientes} carregando={p.carregando}
              aoTrocar={(id) => { escolher?.(); p.aoTrocarAmbiente(id); }} aoMudarAberto={setMenuAberto} />
            {a && (
              <button type="button" className="ba-cab-bt" onClick={a.aoClicar} aria-label={a.rotulo} title={a.rotulo}>
                {a.tipo === 'fixar' ? <IcFixar /> : a.tipo === 'recolher' ? <IcRecolher /> : <IcFechar tam={16} />}
              </button>
            )}
          </div>

          <nav ref={nav} className="ba-grupos" aria-label="Navegação principal" data-rolagem={rolagem || undefined}>
            {!p.carregando && (
              <div className="ba-grupo">
                <button type="button" className="ba-item ba-busca" onClick={() => { escolher?.(); p.aoBuscar(); }}
                  aria-haspopup="dialog" aria-expanded={p.buscaAberta} aria-keyshortcuts="Meta+K Control+K">
                  <span className="ba-item-pri"><span className="ba-ico"><IcBusca /></span><span className="ba-item-tx">Buscar</span></span>
                  <span className="ba-item-lado"><kbd className="ba-kbd" aria-hidden>{rotuloAtalho('K')}</kbd></span>
                </button>
              </div>
            )}
            {!p.carregando && p.grupos.map((g) => (
              <div className="ba-grupo" key={g.rotulo} role="group" aria-labelledby={idGrupo(g.rotulo)}>
                <span className="ba-grupo-rot" id={idGrupo(g.rotulo)}>{g.rotulo}</span>
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
      {p.sobreposta && <div className={p.modo === 'gaveta' ? 'ba-veu' : 'ba-veu leve'} onClick={p.aoFecharSobreposta} aria-hidden />}
    </>
  );
}

/* ---------- o lado esquerdo da barra do topo: recolher + "ambiente / página" ---------- */
export function TopoAlfa({ modo, sobreposta, aoAlternar, ambiente, pagina, inicioAmbiente }: {
  modo: ModoBarra; sobreposta: boolean; aoAlternar: () => void; ambiente: string; pagina: string;
  /** o início do ambiente: o primeiro nível da trilha vira link para ele (fora da própria página inicial) */
  inicioAmbiente?: string;
}) {
  const aberta = modo === 'aberta' || sobreposta;
  const rotulo = modo === 'gaveta' ? (sobreposta ? 'Fechar o menu' : 'Abrir o menu') : aberta ? 'Recolher a barra lateral' : 'Abrir a barra lateral';
  return (
    <div className="ba-topo">
      <button type="button" className="ba-alternar" onClick={aoAlternar} aria-controls="ba-barra" aria-expanded={aberta}
        aria-label={rotulo} title={rotulo}>
        <IcPainel aberto={aberta} />
      </button>
      <nav className="ba-trilha" aria-label="Você está em">
        {ambiente && (inicioAmbiente
          ? <Link to={inicioAmbiente} className="ba-trilha-amb" title={`Ir para o início de ${ambiente}`}>{ambiente}</Link>
          : <span className="ba-trilha-amb">{ambiente}</span>)}
        {ambiente && pagina && <span className="ba-trilha-sep" aria-hidden>/</span>}
        {pagina && <span className="ba-trilha-pag" aria-current="page">{pagina}</span>}
      </nav>
    </div>
  );
}
