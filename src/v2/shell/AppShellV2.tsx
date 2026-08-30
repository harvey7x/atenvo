import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useOrg } from '@/context/OrgContext';
import '../fontes';
import '../tokens.css';
import '../base.css';
import './shell.css';
import '../skinAurora.css'; // TESTE (branch teste/skin-aurora-azul): fundo bokeh + azul secundário
import { LogoAtenvo } from '../components/LogoAtenvo';
import { instalarSpotlight } from '../lib/spotlight';
import { criarRaizPortalV2 } from '../components/portal';
import { ICONES } from './icones';
import { NotificacaoResposta, type DadosNotificacao } from './NotificacaoResposta';
import { useNotificacaoInbound } from '../hooks/useNotificacaoInbound';
import { aplicarTema, lerTema, salvarTema, type Tema } from '../lib/tema';
import { deveMostrarIntroDia, marcarIntroVista } from '../lib/introDia';
import { IntroDia } from '../components/IntroDia';
import { AvisoAtualizacao } from '../components/AvisoAtualizacao';
import { assinarAcento, lerAcento, salvarAcento, type Acento } from '../lib/acento';
import { useNotificacoes, useMarcarNotificacao } from '@/data/remarketing';
import { tempoRelativo } from '../lib/tempo';

/* ícones do chrome da topbar (traço fino, como o resto do v2) */
/* gota de tinta — alternador do acento azul → verde → dourado (teste do dono 28/08) */
const ROTULO_ACENTO: Record<Acento, string> = { azul: 'Azul', verde: 'Verde', dourado: 'Dourado' };
const ORDEM_ACENTO: Acento[] = ['azul', 'verde', 'dourado'];
const IconeGota = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden>
    <path d="M12 2.7S5.5 10 5.5 14.6a6.5 6.5 0 0013 0C18.5 10 12 2.7 12 2.7z" />
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
      // Facebook e Disparo fora do menu (pedido do dono 27/08) — rotas seguem vivas por URL
      { slug: 'kanban', rotulo: 'Kanban' },
      { slug: 'agendamentos', rotulo: 'Agendamentos' },
    ],
  },
  {
    rotulo: 'Gestão',
    itens: [
      { slug: 'contatos', rotulo: 'Contatos' },
      { slug: 'scripts', rotulo: 'Scripts' },
      // Simulador fora do menu (pedido do dono 27/08) — rota segue viva por URL
      // Cobranças SAIU daqui (29/08): virou um MÓDULO próprio no seletor do topo.
      // Relatórios fora do menu (pedido do dono 27/08) — rota segue viva por URL
    ],
  },
  {
    rotulo: 'Ferramentas',
    itens: [
      { slug: 'ferramentas/unificador', rotulo: 'Unificador de documentos' },
    ],
  },
  {
    // IA configurável (Fase 1, 30/08): o cliente cria o próprio atendente de IA
    // (provedor + chave própria + prompt). Chave é sensível → item só de admin.
    rotulo: 'Inteligência',
    itens: [
      { slug: 'ia', rotulo: 'Atendente de IA', admin: true },
    ],
  },
  {
    rotulo: 'Sistema',
    itens: [
      { slug: 'integracoes', rotulo: 'Integrações' },
      // Maturação descontinuada (Evolution restrito pela Meta) — item removido do menu; rota → placeholder.
      // paridade: /configuracoes NÃO tem RequireRole no app antigo (as abas variam por papel)
      { slug: 'configuracoes', rotulo: 'Configurações' },
      // Plano e uso fora do menu (pedido do dono 27/08) — rota segue viva por URL

    ],
  },
];

/* MÓDULOS do sistema (seletor do topo, 29/08): cada módulo troca o menu
   inteiro da esquerda. Atendimento = a operação de sempre; Cobranças = as
   seções do Modo Cobrança viram itens de menu. Novos módulos entram aqui. */
type ModuloId = 'atendimento' | 'cobrancas';
type Modulo = { id: ModuloId; rotulo: string; home: string; grupos: { rotulo: string; itens: ItemNav[] }[] };
const COB_SECOES: ItemNav[] = [
  { slug: 'cobrancas/painel', rotulo: 'Painel' },
  { slug: 'cobrancas/atendentes', rotulo: 'Atendentes' },
  { slug: 'cobrancas/clientes', rotulo: 'Clientes' },
  { slug: 'cobrancas/ciclos', rotulo: 'Ciclos' },
  { slug: 'cobrancas/regua', rotulo: 'Régua de mensagens' },
  { slug: 'cobrancas/numeros', rotulo: 'Números' },
  { slug: 'cobrancas/envios', rotulo: 'Envios' },
];
const MODULOS: Modulo[] = [
  { id: 'atendimento', rotulo: 'Atendimento', home: '/whatsapp', grupos: GRUPOS },
  { id: 'cobrancas', rotulo: 'Cobranças', home: '/cobrancas/painel', grupos: [{ rotulo: 'Cobranças', itens: COB_SECOES }] },
];
/* ícones das seções de cobrança (mesma família traço 1.7) */
const IcC = (d: string) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden><path d={d} /></svg>
);
const FERR_ICONES: Record<string, ReactNode> = {
  unificador: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden><path d="M8 3H5a2 2 0 0 0-2 2v5M16 3h3a2 2 0 0 1 2 2v5M8 21H5a2 2 0 0 1-2-2v-5M16 21h3a2 2 0 0 0 2-2v-5M9 12h6M12 9v6" /></svg>,
};
const COB_ICONES: Record<string, ReactNode> = {
  painel: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden><path d="M4 20V10M10 20V4M16 20v-8M21 20H3" /></svg>,
  atendentes: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden><circle cx="9" cy="8" r="3.4" /><path d="M3.5 20c.6-3.4 2.8-5 5.5-5s4.9 1.6 5.5 5M16 4.6a3.4 3.4 0 010 6.8" /></svg>,
  clientes: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden><circle cx="12" cy="8" r="3.6" /><path d="M5 20c.7-4 3.4-6 7-6s6.3 2 7 6" /></svg>,
  ciclos: IcC('M20 12a8 8 0 1 1-2.3-5.6M20 4v4h-4'),
  regua: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden><path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.9 8.9 0 0 1-3.8-.8L3 20l1-4.9a8.3 8.3 0 0 1-1-4A8.4 8.4 0 0 1 12 3a8.4 8.4 0 0 1 9 8.5z" /></svg>,
  numeros: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L20 13l-.5-.2 1 4.2A2 2 0 0 1 18.5 19 15 15 0 0 1 5 5.5 2 2 0 0 1 5 4z" /></svg>,
  envios: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden><path d="M21 3L10.5 13.5M21 3l-6.8 17.4a.35.35 0 0 1-.65.02L10.5 13.5 3.6 10.45a.35.35 0 0 1 .02-.65L21 3z" /></svg>,
};
function iconeDoItem(slug: string): ReactNode {
  if (slug.startsWith('cobrancas/')) return COB_ICONES[slug.split('/')[1]] ?? ICONES.cobrancas;
  if (slug.startsWith('ferramentas/')) return FERR_ICONES[slug.split('/')[1]] ?? FERR_ICONES.unificador;
  return ICONES[slug];
}

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

  // Intro do dia: primeira entrada de cada dia (o auth resolve assíncrono —
  // só decide quando o user existe; virou a data local = mostra de novo)
  const [introAberta, setIntroAberta] = useState(false);
  useEffect(() => { if (user?.id && deveMostrarIntroDia(user.id)) setIntroAberta(true); }, [user?.id]);
  const concluirIntro = useCallback(() => {
    marcarIntroVista(user?.id ?? undefined);
    setIntroAberta(false);
  }, [user?.id]);
  useEffect(() => { aplicarTema(tema); }, [tema]);
  // valor explícito (a intro do dia escolhe direto); o toggle da topbar cicla por cima
  const definirTema = useCallback((novo: Tema) => {
    setTema(novo);
    salvarTema(novo, escopoTema);
  }, [escopoTema]);
  const alternarTema = useCallback(() => {
    definirTema(tema === 'dark' ? 'light' : 'dark');
  }, [definirTema, tema]);
  // Acento do sistema (gota): cicla azul → verde → dourado. O botão do Modo
  // de Performance saiu da topbar (dono 29/08 — o Corporativo fixo já é leve);
  // o modo segue vivo na auto-detecção do main.tsx e no Segmentado de Configurações.
  const [acento, setAcento] = useState<Acento>(() => lerAcento());
  useEffect(() => assinarAcento(setAcento), []);
  const alternarAcento = useCallback(() => {
    salvarAcento(ORDEM_ACENTO[(ORDEM_ACENTO.indexOf(acento) + 1) % ORDEM_ACENTO.length]);
  }, [acento]);
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
  // sino: central de notificações PERSISTIDA (tabela notificacoes, F2 do remarketing).
  // O clique abre o painel; o pulso/contador de inbound segue sendo zerado aqui.
  const [painelNotif, setPainelNotif] = useState(false);
  const [notifPos, setNotifPos] = useState<{ top: number; right: number }>({ top: 60, right: 60 });
  const sinoRef = useRef<HTMLButtonElement>(null);
  const notifsQ = useNotificacoes();
  const marcarNotif = useMarcarNotificacao();
  const naoLidas = (notifsQ.data ?? []).filter((n) => !n.lidaEm).length;
  const abrirNotificacoes = useCallback(() => {
    const r = sinoRef.current?.getBoundingClientRect();
    if (r) setNotifPos({ top: Math.round(r.bottom + 8), right: Math.round(window.innerWidth - r.right) });
    setSinoOn(false); setBadgePop(0); setPainelNotif((v) => !v);
  }, []);
  useEffect(() => { setPainelNotif(false); }, [location.pathname]);
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

  // Fase 2.0: troca de organização — só EXISTE para quem tem mais de um vínculo
  const [menuOrg, setMenuOrg] = useState(false);
  const [orgMenuPos, setOrgMenuPos] = useState({ top: 0, left: 0 });
  const tenantRef = useRef<HTMLButtonElement>(null);
  const abrirMenuOrg = useCallback(() => {
    const r = tenantRef.current?.getBoundingClientRect();
    if (r) setOrgMenuPos({ top: r.bottom + 6, left: r.left });
    // sempre TRUE (fechar é papel do backdrop/seleção): toggle com updater
    // (v => !v) morre no StrictMode dev, que invoca o updater 2× — !!v = v
    setMenuOrg(true);
  }, []);

  // MÓDULO ativo derivado da rota: /cobrancas* = Cobranças, senão Atendimento.
  // Trocar de módulo navega pra home do módulo (o menu da esquerda se refaz).
  const moduloAtivo: ModuloId = location.pathname.startsWith('/cobrancas') ? 'cobrancas' : 'atendimento';
  const modulo = MODULOS.find((m) => m.id === moduloAtivo) ?? MODULOS[0];
  const trocarModulo = useCallback((m: Modulo) => {
    setMenuOrg(false);
    navigate(m.home);
  }, [navigate]);

  return (
    <div className="v2 app-v2">
      <div className="luz" />
      <div className="grao" />
      <div className="p-app">
        <aside className="p-sidebar" ref={sidebarRef}>
          <div className="p-logo">
            <LogoAtenvo className="marca" />
            <span className="word lab">atenvo</span>
          </div>
          {/* SELETOR DE MÓDULO (29/08): troca o sistema inteiro de parte —
              Atendimento ↔ Cobranças (e novos módulos no futuro). Ocupa o
              lugar do antigo seletor de organização (single-tenant: a org é
              fixa; seu nome vira o subtítulo). */}
          <button ref={tenantRef} type="button" className="tenant trocavel modulo-sel" title={`Módulo: ${modulo.rotulo} — clique para trocar`}
            aria-haspopup="menu" aria-expanded={menuOrg} onClick={abrirMenuOrg}>
            <span className="modulo-txt"><b>{modulo.rotulo}</b><i className="modulo-org lab">{org}</i></span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--txt-2)' }} aria-hidden>
              <path d="M7 15l5 5 5-5M7 9l5-5 5 5" />
            </svg>
          </button>
          {menuOrg && createPortal(
            <>
              <div className="um-backdrop" onClick={() => setMenuOrg(false)} aria-hidden />
              <div className="usuario-menu org-troca" role="menu" aria-label="Trocar de módulo" style={{ top: orgMenuPos.top, left: orgMenuPos.left }}>
                <div className="um-head"><div className="um-cargo">Ir para</div></div>
                {MODULOS.map((m) => (
                  <button key={m.id} type="button" role="menuitemradio" aria-checked={m.id === moduloAtivo}
                    className={m.id === moduloAtivo ? 'um-item om-item on' : 'um-item om-item'}
                    onClick={() => trocarModulo(m)}>
                    <span className="om-dot" aria-hidden />
                    <span className="om-nome">{m.rotulo}</span>
                  </button>
                ))}
              </div>
            </>,
            raizMenu,
          )}
          <nav aria-label="Navegação principal">
            {modulo.grupos.map((g) => {
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
                      {iconeDoItem(i.slug)}
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
                aria-label={`Acento do sistema: ${ROTULO_ACENTO[acento]} — clique para alternar`}
                title={`Acento: ${ROTULO_ACENTO[acento]}`}
                onClick={alternarAcento}
              >
                <IconeGota />
                <span className={acento !== 'azul' ? 'pt on' : 'pt'} aria-hidden />
              </button>
              <button
                type="button" className="ib"
                aria-label={tema === 'dark' ? 'Mudar para o tema claro' : 'Mudar para o tema escuro'}
                title={tema === 'dark' ? 'Tema claro' : 'Tema escuro'}
                onClick={alternarTema}
              >
                {tema === 'dark' ? <IconeSol /> : <IconeLua />}
              </button>
              <button ref={sinoRef} type="button" className="ib" aria-label="Notificações" title="Notificações" aria-haspopup="menu" aria-expanded={painelNotif} onClick={abrirNotificacoes}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                  <path d="M18 9a6 6 0 10-12 0c0 6-2.5 7-2.5 7h17S18 15 18 9zM10 20a2.2 2.2 0 004 0" />
                </svg>
                <span className={sinoOn || naoLidas > 0 ? 'pt on' : 'pt'} aria-hidden />
              </button>
              {painelNotif && createPortal(
                <>
                  <div className="um-backdrop" onClick={() => setPainelNotif(false)} aria-hidden />
                  <div className="usuario-menu notif-panel" role="menu" aria-label="Notificações" style={{ top: notifPos.top, right: notifPos.right }}>
                    <div className="np-head">
                      <b>Notificações</b>
                      {naoLidas > 0 && (
                        <button type="button" className="np-todas" onClick={() => marcarNotif.mutate({ todas: true })}>Marcar todas como lidas</button>
                      )}
                    </div>
                    {(notifsQ.data ?? []).length === 0 ? (
                      <div className="np-vazio">Nenhuma notificação ainda. Quando a Central de Remarketing identificar algo, aparece aqui.</div>
                    ) : (notifsQ.data ?? []).slice(0, 20).map((n) => (
                      <button key={n.id} type="button" role="menuitem" className={'np-item' + (n.lidaEm ? '' : ' nova')}
                        onClick={() => { setPainelNotif(false); if (!n.lidaEm) marcarNotif.mutate({ id: n.id }); if (n.rota) navigate(n.rota); }}>
                        <span className="np-dot" aria-hidden />
                        <span className="np-tx">
                          <span className="np-t">{n.titulo}</span>
                          {n.corpo && <span className="np-c">{n.corpo}</span>}
                        </span>
                        <span className="np-h num">{tempoRelativo(n.criadoEm, Date.now())}</span>
                      </button>
                    ))}
                  </div>
                </>,
                raizMenu,
              )}
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

        {/* portais soltos: intro do dia + aviso de deploy (dono 28/08) */}
        <IntroDia aberta={introAberta} aoConcluir={concluirIntro} nome={nome} tema={tema} aoMudarTema={definirTema} />
        <AvisoAtualizacao />
      </div>

    </div>
  );
}
