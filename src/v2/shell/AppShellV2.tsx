import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useOrg } from '@/context/OrgContext';
import '../fontes';
import '../tokens.css';
import '../base.css';
import './shell.css';
import { instalarSpotlight } from '../lib/spotlight';
import { criarRaizPortalV2 } from '../components/portal';
import { ICONES } from './icones';
import { NotificacaoResposta, type DadosNotificacao } from './NotificacaoResposta';
import { useNotificacaoInbound } from '../hooks/useNotificacaoInbound';
import { aplicarTema, lerTema, salvarTema, type Tema } from '../lib/tema';
import { assinarModoPerf, lerModoPerf, salvarModoPerf, type ModoPerf } from '../lib/perf';

/* ícones sol/lua do alternador de tema (traço fino, como o resto do chrome v2) */
const ROTULO_PERF: Record<ModoPerf, string> = { auto: 'Automático', lite: 'Leve', full: 'Completo' };
const IconeRaio = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden>
    <path d="M13 2L3 14h9l-1 8 10-12h-9z" />
  </svg>
);
const IconeSol = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
    <circle cx="12" cy="12" r="4.2" /><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19" />
  </svg>
);
const IconeLua = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M20 14.5A8 8 0 019.5 4 7 7 0 1020 14.5z" />
  </svg>
);

/* Navegação real do app (INVENTARIO.md + decisões aprovadas):
   Relacionamento fica fora (adiada); Facebook, Scripts e Maturação são
   órfãs do mockup e entram nos grupos pela função. Badges chegam com as
   páginas reais — por ora ficam zerados (nada de número inventado). */
type ItemNav = { slug: string; rotulo: string; admin?: boolean };
const GRUPOS: { rotulo: string; itens: ItemNav[] }[] = [
  {
    rotulo: 'Operação',
    itens: [
      { slug: 'dashboard', rotulo: 'Dashboard' },
      { slug: 'whatsapp', rotulo: 'WhatsApp' },
      { slug: 'facebook', rotulo: 'Facebook' },
      { slug: 'kanban', rotulo: 'Kanban' },
      { slug: 'agendamentos', rotulo: 'Agendamentos' },
    ],
  },
  {
    rotulo: 'Gestão',
    itens: [
      { slug: 'contatos', rotulo: 'Contatos' },
      { slug: 'scripts', rotulo: 'Scripts' },
      { slug: 'cobrancas', rotulo: 'Cobranças' },
      { slug: 'relatorios', rotulo: 'Relatórios' },
    ],
  },
  {
    rotulo: 'Sistema',
    itens: [
      { slug: 'integracoes', rotulo: 'Integrações' },
      // Maturação descontinuada (Evolution restrito pela Meta) — item removido do menu; rota → placeholder.
      // paridade: /configuracoes NÃO tem RequireRole no app antigo (as abas variam por papel)
      { slug: 'configuracoes', rotulo: 'Configurações' },
      { slug: 'plano-uso', rotulo: 'Plano e uso', admin: true },
    ],
  },
];

const PAPEL_ROTULO: Record<string, string> = {
  admin: 'Administrador',
  gestor: 'Gestor',
  atendente: 'Atendente',
};

function iniciaisDe(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return 'A';
  return (partes[0][0] + (partes[1]?.[0] ?? '')).toUpperCase();
}

const NOTIF_DEMO: DadosNotificacao = {
  iniciais: 'MA',
  quem: 'Maria Aparecida Souza',
  mensagem: '"Consegui a foto do documento, meu filho. Pode conferir se está boa assim?"',
  fonte: 'WhatsApp · Canal 1390',
};

/** Shell autenticado v2: sidebar em overlay (64→242 no hover), topbar e palco. */
export default function AppShellV2() {
  const { user, signOut } = useAuth();
  const { currentOrg } = useOrg();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => instalarSpotlight(), []);

  /* Trava o scroll da JANELA sob o shell (bug do dono: deep-links conversa↔kanban
     disparavam scrollIntoView que rolava o body — topbar sumia, o toast de
     notificação aparecia cortado e sobrava faixa branca embaixo). O app é um
     layout fixo de 100vh; a janela nunca deve rolar. */
  useEffect(() => {
    const html = document.documentElement, body = document.body;
    const prev = [html.style.overflow, body.style.overflow] as const;
    html.style.overflow = 'hidden'; body.style.overflow = 'hidden';
    window.scrollTo(0, 0);
    return () => { html.style.overflow = prev[0]; body.style.overflow = prev[1]; };
  }, []);

  const [notif, setNotif] = useState<(DadosNotificacao & { conversaId?: string }) | null>(null);
  const [sinoOn, setSinoOn] = useState(false);
  const [badgePop, setBadgePop] = useState(0);
  const [menuUsuario, setMenuUsuario] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number }>({ top: 60, right: 20 });

  // Tema dual: escolha explícita do usuário, persistida por usuário; padrão dark.
  const escopoTema = user?.id ?? undefined;
  const [tema, setTema] = useState<Tema>(() => lerTema(escopoTema));
  useEffect(() => { setTema(lerTema(escopoTema)); }, [escopoTema]); // recarrega a preferência quando o usuário resolve
  useEffect(() => { aplicarTema(tema); }, [tema]);
  const alternarTema = useCallback(() => {
    setTema((t) => { const novo: Tema = t === 'dark' ? 'light' : 'dark'; salvarTema(novo, escopoTema); return novo; });
  }, [escopoTema]);
  // Modo de Performance na topbar (par do alternador de tema): o clique cicla
  // Automático → Leve → Completo; o estado vem da assinatura (a mesma que
  // mantém o Segmentado de Configurações em sincronia). Dot = Leve fixado.
  const [modoPerf, setModoPerf] = useState<ModoPerf>(() => lerModoPerf());
  useEffect(() => assinarModoPerf(setModoPerf), []);
  const alternarPerf = useCallback(() => {
    const ordem: ModoPerf[] = ['auto', 'lite', 'full'];
    salvarModoPerf(ordem[(ordem.indexOf(modoPerf) + 1) % ordem.length]);
  }, [modoPerf]);
  const seqRef = useRef(0);
  const avatarRef = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const fundoRef = useRef<HTMLDivElement>(null);
  // will-change com disciplina (Modo de Performance): promove camada SÓ enquanto
  // a transição de abrir/fechar roda (clip-path no host, transform no fundo) e
  // remove ao terminar — camada permanente custa memória de GPU justo nas
  // máquinas fracas. (No Modo Leve transition:none → nunca liga, e está certo.)
  useEffect(() => {
    const instala = (el: HTMLElement | null, prop: string) => {
      if (!el) return () => {};
      const liga = (e: TransitionEvent) => { if (e.target === el && e.propertyName === prop) el.style.willChange = prop; };
      const desliga = (e: TransitionEvent) => { if (e.target === el && e.propertyName === prop) el.style.willChange = ''; };
      el.addEventListener('transitionrun', liga);
      el.addEventListener('transitionend', desliga);
      el.addEventListener('transitioncancel', desliga);
      return () => {
        el.removeEventListener('transitionrun', liga);
        el.removeEventListener('transitionend', desliga);
        el.removeEventListener('transitioncancel', desliga);
      };
    };
    const desinstalar = [instala(sidebarRef.current, 'clip-path'), instala(fundoRef.current, 'transform')];
    return () => { desinstalar.forEach((d) => d()); };
  }, []);
  const fecharNotif = useCallback(() => setNotif(null), []);
  // raiz de portal (regra 10): o menu monta no body, fora do stacking context da topbar
  // (que tem backdrop-filter) — senão o conteúdo do palco pinta por cima dele. Shell monta 1×.
  const raizMenu = useMemo(() => criarRaizPortalV2(document) as unknown as HTMLElement, []);
  const abrirMenuUsuario = useCallback(() => {
    const r = avatarRef.current?.getBoundingClientRect();
    if (r) setMenuPos({ top: Math.round(r.bottom + 8), right: Math.round(window.innerWidth - r.right) });
    setMenuUsuario((v) => !v);
  }, []);
  // sino: o v1 abre a "Central de atendimento" (SLA) — não portada ao v2. Fallback declarado
  // no reporte: leva ao Inbox (onde os inbounds notificados vivem) e marca o pulso como visto.
  const abrirNotificacoes = useCallback(() => { setSinoOn(false); setBadgePop(0); navigate('/whatsapp'); }, [navigate]);
  // avatar: menu de usuário real — Configurações (rota v2) + Sair (signOut do v1, como a Topbar antiga).
  const sair = useCallback(async () => { setMenuUsuario(false); await signOut(); navigate('/login', { replace: true }); }, [signOut, navigate]);
  // fecha o menu ao trocar de rota
  useEffect(() => { setMenuUsuario(false); }, [location.pathname]);

  // Fiação realtime (dívida da 1b, quitada na sessão do WhatsApp): o feed
  // postgres_changes já usado pelo app alimenta o toast — só mensagem de
  // cliente, nunca com a conversa aberta e focada; badge pulsa a cada inbound.
  useNotificacaoInbound({
    aoBadge: useCallback(() => { setBadgePop((n) => n + 1); setSinoOn(true); }, []),
    aoNotificar: useCallback((d) => {
      seqRef.current += 1;
      setNotif({ ...d, seq: seqRef.current });
    }, []),
  });
  // ao abrir o Inbox, o não-visto foi visto: zera o contador e apaga o pulso do sino
  useEffect(() => {
    if (location.pathname.startsWith('/whatsapp')) { setBadgePop(0); setSinoOn(false); }
  }, [location.pathname]);

  // Botão de simulação (DEV): segue como fallback de demonstração do visual.
  function simularResposta() {
    seqRef.current += 1;
    setNotif({ ...NOTIF_DEMO, seq: seqRef.current });
    setBadgePop((n) => n + 1);
    setSinoOn(true);
  }

  const nome = user?.name?.trim() || 'Equipe';
  const papel = currentOrg ? (PAPEL_ROTULO[currentOrg.role] ?? currentOrg.role) : '—';
  const org = currentOrg?.name ?? 'Atenvo';
  const admin = !currentOrg || currentOrg.role === 'admin';

  return (
    <div className="v2 app-v2">
      <div className="luz" />
      <div className="grao" />
      <div className="p-app">
        <aside className="p-sidebar" ref={sidebarRef}>
          <div className="p-logo">
            <div className="marca">A</div>
            <span className="word lab">atenvo</span>
          </div>
          <div className="tenant" title={org}>
            <b>{org}</b>
            {/* currentColor (auditoria): o hex #9BA1AB era o --txt-2 do dark cravado — sumia a hierarquia no light */}
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--txt-2)' }} aria-hidden>
              <path d="M7 15l5 5 5-5M7 9l5-5 5 5" />
            </svg>
          </div>
          <nav aria-label="Navegação principal">
            {GRUPOS.map((g) => {
              const itens = g.itens.filter((i) => admin || !i.admin);
              if (!itens.length) return null;
              return (
                <div className="grupo" key={g.rotulo}>
                  <div className="glabel caps lab">{g.rotulo}</div>
                  {itens.map((i) => (
                    <NavLink
                      key={i.slug}
                      to={`/${i.slug}`}
                      className={({ isActive }) => (isActive ? 'item on' : 'item')}
                      title={i.rotulo}
                    >
                      {ICONES[i.slug]}
                      <span className="lab">{i.rotulo}</span>
                      {i.slug === 'whatsapp' && badgePop > 0 && (
                        <span key={badgePop} className="badge-n lab pop num">{badgePop}</span>
                      )}
                    </NavLink>
                  ))}
                </div>
              );
            })}
          </nav>
          <div className="canal"><i aria-hidden /><span>Canal · operante</span></div>
          {import.meta.env.DEV && (
            <div className="dev-ferramentas">
              <button type="button" className="p-btn btn-sec btn-mini" onClick={simularResposta}>
                Simular resposta
              </button>
            </div>
          )}
          <div className="rodape-sb">
            <div className="avatar">{iniciaisDe(nome)}</div>
            <div className="lab">
              <div className="nome">{nome}</div>
              <div className="cargo">{papel}</div>
            </div>
          </div>
        </aside>
        {/* fundo (vidro+fio) e sombra da expansão: irmãos do aside — fora do
            clip-path (que criaria um backdrop root sem blur), pintando abaixo
            dele. A sidebar anima só clip-path/transform/opacity, nunca width
            (shell.css). */}
        <div className="sb-fundo" aria-hidden ref={fundoRef} />
        <div className="sb-sombra" aria-hidden />

        <main className="principal">
          <div className="p-topbar">
            <div className="busca">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" />
              </svg>
              <span className="busca-texto">Buscar contatos, conversas, cobranças…</span><kbd>⌘K</kbd>
            </div>
            <div className="top-dir">
              <button
                type="button" className="ib"
                aria-label={`Modo de Performance: ${ROTULO_PERF[modoPerf]} — clique para alternar`}
                title={`Modo de Performance: ${ROTULO_PERF[modoPerf]}`}
                onClick={alternarPerf}
              >
                <IconeRaio />
                <span className={modoPerf === 'lite' ? 'pt on' : 'pt'} aria-hidden />
              </button>
              <button
                type="button" className="ib"
                aria-label={tema === 'dark' ? 'Mudar para o tema claro' : 'Mudar para o tema escuro'}
                title={tema === 'dark' ? 'Tema claro' : 'Tema escuro'}
                onClick={alternarTema}
              >
                {tema === 'dark' ? <IconeSol /> : <IconeLua />}
              </button>
              <button type="button" className="ib" aria-label="Notificações" title="Notificações — abrir o Inbox" onClick={abrirNotificacoes}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                  <path d="M18 9a6 6 0 10-12 0c0 6-2.5 7-2.5 7h17S18 15 18 9zM10 20a2.2 2.2 0 004 0" />
                </svg>
                <span className={sinoOn ? 'pt on' : 'pt'} aria-hidden />
              </button>
              <div className="top-usuario">
                <button ref={avatarRef} type="button" className="avatar avatar-btn" aria-label="Menu do usuário" aria-haspopup="menu"
                  aria-expanded={menuUsuario} title={nome} style={{ width: 33, height: 33 }}
                  onClick={abrirMenuUsuario}>{iniciaisDe(nome)}</button>
              </div>
              {menuUsuario && createPortal(
                <>
                  <div className="um-backdrop" onClick={() => setMenuUsuario(false)} aria-hidden />
                  <div className="usuario-menu" role="menu" aria-label="Menu do usuário" style={{ top: menuPos.top, right: menuPos.right }}>
                    <div className="um-head">
                      <div className="um-nome">{nome}</div>
                      <div className="um-cargo">{papel}</div>
                    </div>
                    <button type="button" role="menuitem" className="um-item" onClick={() => { setMenuUsuario(false); navigate('/configuracoes'); }}>Configurações</button>
                    <button type="button" role="menuitem" className="um-item perigo" onClick={sair}>Sair</button>
                  </div>
                </>,
                raizMenu,
              )}
            </div>
          </div>

          <div className="palco">
            {/* key por caminho + geração: re-executa a entrada (pg-entra + cascata)
                a cada troca de rota e quando a intro abre o palco */}
            {/* páginas cheias (kanban, inbox) gerenciam a própria altura — shell.css .pagina.cheia.
                Rotas OFICIAIS estão na RAIZ desde o CORTE (/whatsapp, /kanban) — não mais em /v2/*. */}
            <div className={/^\/(kanban|whatsapp)(\/|$)/.test(location.pathname) ? 'pagina pg-entra cheia' : 'pagina pg-entra'} key={location.pathname}>
              <Outlet />
            </div>
          </div>

          <NotificacaoResposta
            dados={notif}
            aoFechar={fecharNotif}
            aoVerConversa={() => {
              const alvo = notif?.conversaId;
              fecharNotif();
              navigate(alvo ? `/whatsapp?conversa=${encodeURIComponent(alvo)}` : '/whatsapp');
            }}
          />
        </main>
      </div>

    </div>
  );
}
