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
import { instalarRolagemSemHover } from '../lib/rolagem';
import { criarRaizPortalV2 } from '../components/portal';
import { ICONES } from './icones';
import { NotificacaoResposta, type DadosNotificacao } from './NotificacaoResposta';
import { GuardiaoAvisos, RadarBarra } from '../components/GuardiaoAvisos';
import { SinoPainel, naoLidasQueAcendem, useSino } from './SinoPainel';
import { useNotificacaoInbound } from '../hooks/useNotificacaoInbound';
import { aplicarTema, lerTema, salvarTema, type Tema } from '../lib/tema';
import {
  HORA_FIM_DIA, hojeLocal, marcarMomentoVisto, momentoAtual, momentoDevido, msAteProximoMomento, proximaTelaBomDia, type TelaBomDia,
} from '../lib/bomDia';
import { BomDia } from '../components/BomDia';
import { prepararBomDia, useModoBomDia } from '@/data/bomDia';
import { AvisoAtualizacao } from '../components/AvisoAtualizacao';
import { AssistenteBalao } from '../components/AssistenteBalao';
import { ComparadorVisual } from '../components/ComparadorVisual';
import { DEMO_MODE } from '@/lib/demo';
import { assinarAcento, lerAcento, salvarAcento, type Acento } from '../lib/acento';

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
/* `fixo`: grupo preso ao pé da sidebar, sem rótulo, acima do usuário — fica
   sempre visível mesmo quando a lista de cima precisa rolar. */
type GrupoNav = { rotulo: string; itens: ItemNav[]; fixo?: boolean };
/* Menu do perfil GESTOR (o administrador Murilo — dono 30/10): Operação, Kanban, Dashboard, Painel da
   Equipe e Ferramentas; sem a Central de Avisos "por enquanto" e sem o Acompanhamento (não listado). */
const ESCONDIDO_DO_GESTOR = new Set(['radar', 'pendencias']);

const GRUPOS: GrupoNav[] = [
  {
    rotulo: 'Operação',
    itens: [
      { slug: 'whatsapp', rotulo: 'WhatsApp' },
      // Facebook e Disparo fora do menu (pedido do dono 27/08) — rotas seguem vivas por URL
      // Kanban desceu para a Gestão (dono 30/10)
      // Agendamentos e Contatos fora do menu (pedido do dono 30/10: "ocultar") — rotas seguem vivas por URL
      // Presenciais (dono 29/10): calendário dos atendimentos presenciais; avisa o grupo DOCUMENTOS
      { slug: 'presenciais', rotulo: 'Presenciais' },
      // Scripts veio da Gestão (dono 29/10): ferramenta do dia a dia de quem atende
      { slug: 'scripts', rotulo: 'Scripts' },
    ],
  },
  {
    // o que acontece com o cliente DEPOIS do primeiro atendimento
    rotulo: 'Acompanhamento',
    itens: [
      // Pós-venda SAIU (dono 29/10): o fechado sem resposta agora é avisado pela Central de Avisos.
      // Recuperação fora do menu (pedido do dono 14/10) — rota segue viva por URL
      { slug: 'pendencias', rotulo: 'Pendências' },
      // Portabilidades fora do menu (pedido do dono 30/10) — rota segue viva por URL
    ],
  },
  {
    // Gestão (dono 29/10): a visão da equipe inteira, só para o admin (rotas com RequireRoleV2).
    // Manual de vendas SAIU do sistema a pedido do dono (link antigo cai no WhatsApp).
    rotulo: 'Gestão',
    itens: [
      // Kanban veio da Operação (dono 30/10: "desce o Kanban para gestão"). SEM admin: a equipe
      // continua vendo o quadro (cada um só os seus cards — useKanban/visibilidade)
      { slug: 'kanban', rotulo: 'Kanban' },
      { slug: 'dashboard', rotulo: 'Dashboard', admin: true },
      // Painel da Equipe (29/10): um celular por atendente, igual ao WhatsApp, somente leitura
      { slug: 'equipe', rotulo: 'Painel da Equipe', admin: true },
      // Central de Avisos = o antigo "Radar de Atendimento" (renomeado 29/10; rota /radar mantida):
      // clientes sem resposta, decisões de repasse e conversão.
      { slug: 'radar', rotulo: 'Central de Avisos', admin: true },
      // Simulador fora do menu (pedido do dono 27/08) — rota segue viva por URL
      // Cobranças SAIU daqui (29/08): virou um MÓDULO próprio no seletor do topo.
      // Relatórios fora do menu (pedido do dono 27/08) — rota segue viva por URL
    ],
  },
  {
    rotulo: 'Ferramentas',
    itens: [
      { slug: 'ferramentas/unificador', rotulo: 'Unificador de documentos' },
      { slug: 'ferramentas/conversor', rotulo: 'Conversor de arquivos' },
      // Coletor INSS voltou para as Ferramentas (dono 30/10, depois de passar pela Operação)
      { slug: 'ferramentas/coletor-inss', rotulo: 'Coletor INSS' },
    ],
  },
  // Atendente de IA (/ia) e Fluxos do bot (/fluxos) fora do menu (pedido do dono 14/10) —
  // rotas seguem vivas por URL, só para admin.
  {
    rotulo: 'Sistema',
    fixo: true,
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
/* Cobranças SAIU do sistema (dono 22/10: "a gente nem usa, pode excluir ela") — o
   seletor fica com um módulo só e some a seta; /cobrancas* redireciona ao inbox
   (App.tsx). Os dados no banco ficam intactos; voltar = recolocar a entrada aqui. */
type ModuloId = 'atendimento';
type Modulo = { id: ModuloId; rotulo: string; home: string; grupos: GrupoNav[] };
const MODULOS: Modulo[] = [
  { id: 'atendimento', rotulo: 'Atendimento', home: '/whatsapp', grupos: GRUPOS },
];
const TEM_TROCA = MODULOS.length > 1;
const FERR_ICONES: Record<string, ReactNode> = {
  unificador: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden><path d="M8 3H5a2 2 0 0 0-2 2v5M16 3h3a2 2 0 0 1 2 2v5M8 21H5a2 2 0 0 1-2-2v-5M16 21h3a2 2 0 0 0 2-2v-5M9 12h6M12 9v6" /></svg>,
  // Conversor: dois arquivos com setas trocando (converter)
  conversor: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden><path d="M4 7h11M4 7l3-3M4 7l3 3M20 17H9M20 17l-3-3M20 17l-3 3" /></svg>,
  // Coletor INSS: documento com seta descendo (baixar da fonte oficial)
  'coletor-inss': <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" /><path d="M12 11v6M9.5 14.5 12 17l2.5-2.5" /></svg>,
};
function iconeDoItem(slug: string): ReactNode {
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
  useEffect(() => instalarRolagemSemHover(), []); // movimento.css: lista rolando = hover seco

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
  // pulso de mensagem recebida: não acende mais o ponto do sino (Radar v5: o ponto é só para
  // não lidas de Gestão e Outros); o contador do WhatsApp na barra lateral segue com o inbound
  const [, setSinoOn] = useState(false);
  const [badgePop, setBadgePop] = useState(0);
  const [menuUsuario, setMenuUsuario] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number }>({ top: 60, right: 20 });

  // Tema dual: escolha explícita do usuário, persistida por usuário; padrão dark.
  const escopoTema = user?.id ?? undefined;
  const [tema, setTema] = useState<Tema>(() => lerTema(escopoTema));
  useEffect(() => { setTema(lerTema(escopoTema)); }, [escopoTema]); // recarrega a preferência quando o usuário resolve

  // Bom dia do Atenvo (dono 30/10): DOIS momentos — às 8h para todos e às 17h só para o GESTOR (quem está
  // em bom_dia_gestores: o Murilo). Quem entra depois do horário vê ao entrar; com o sistema aberto, abre
  // sozinho no horário (e espera o play: a tela nunca fala sozinha). Já nasce aberto quando vai aparecer:
  // as telas cheias do Radar ficam bloqueadas desde o 1º commit. O dia é marcado na ABERTURA (outra aba
  // não repete). Depois das 17h, sem saber ainda se a pessoa é gestor, espera a RPC (o gestor ouve o da
  // tarde, não o da manhã). A tela guarda o DIA em que abriu: esquecida aberta de um dia para o outro
  // (falta, fim de semana com o notebook no site), às 8h ela dá lugar à de hoje (proximaTelaBomDia).
  const orgBomDia = currentOrg?.id ?? '';
  // o perfil (RPC bom_dia_modo) é UMA consulta para o sistema todo (useModoBomDia: o sino e a Central de Avisos
  // leem o mesmo cache). null até a RPC responder; sem resposta em 6 s, vendedor (e se ela responder depois, o
  // modo se corrige); na demo, a pessoa escolhida na barra da prévia
  const modoBomDia = useModoBomDia();
  const gestorBomDia = modoBomDia === 'gestor';
  const [bomDia, setBomDia] = useState<TelaBomDia | null>(() => {
    if (!user?.id || new Date().getHours() >= HORA_FIM_DIA) return null;
    const m = momentoDevido(user.id);
    return m ? { momento: m, dia: hojeLocal() } : null;
  });
  const bomDiaRef = useRef(bomDia);
  bomDiaRef.current = bomDia;
  const bomDiaMeuRef = useRef(false); // esta aba marcou o momento (o StrictMode roda o efeito 2x)
  const bomDiaNoInicioRef = useRef(bomDia !== null); // aberto otimista no 1º render (pode ser de outra aba)
  const devolverFocoRef = useRef<HTMLElement | null>(null);
  const preparoBomDiaRef = useRef({ org: '', nome: '' });
  useEffect(() => {
    const uid = user?.id;
    if (!uid) return;
    const gestor = modoBomDia === 'gestor';
    const modoConhecido = modoBomDia !== null;
    let vivo = true;
    let ultimaTecla = 0;
    let tAbre = 0;
    let tPre = 0;
    let tDigitando = 0;
    const aoTeclar = () => { ultimaTecla = Date.now(); };
    const abrir = (motivo: 'entrada' | 'agendado') => {
      const tentar = () => {
        if (!vivo) return;
        const agora = new Date();
        if (!modoConhecido && agora.getHours() >= HORA_FIM_DIA) return;
        const m = momentoDevido(uid, agora, { gestor });
        if (m) {
          // o outro resumo de HOJE ainda está na tela (ex.: o da manhã esquecido aberto até as 17h): espera
          // fechar. A tela de OUTRO dia não segura nada: dá lugar à de hoje (abaixo)
          if (proximaTelaBomDia(bomDiaRef.current, m, agora) === 'esperar') return;
          // no horário, no meio de uma mensagem: espera a pessoa parar de digitar
          const el = document.activeElement as HTMLElement | null;
          const editando = !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
          if (motivo === 'agendado' && editando && Date.now() - ultimaTecla < 8000) {
            window.clearTimeout(tDigitando);
            tDigitando = window.setTimeout(() => abrir(motivo), 10_000);
            return;
          }
          marcarMomentoVisto(uid, m, agora);
          bomDiaMeuRef.current = true;
          bomDiaNoInicioRef.current = false;
          // a mesma tela de hoje fica (o mesmo objeto); a de outro dia vira a de hoje: identidade nova →
          // o Hud remonta e prepara de novo (números e voz do dia)
          setBomDia((b) => {
            const prox = proximaTelaBomDia(b, m, agora);
            return prox === 'esperar' ? b : prox;
          });
        } else if (bomDiaRef.current && bomDiaRef.current.dia !== hojeLocal(agora)) {
          setBomDia(null); // a tela de outro dia esquecida nesta aba: outra aba já abriu a de hoje
        } else if (!bomDiaMeuRef.current && bomDiaNoInicioRef.current) {
          bomDiaNoInicioRef.current = false;
          setBomDia(null); // outra aba já mostrou hoje
        }
      };
      // abas abertas juntas: a trava faz uma de cada vez — a 2ª já encontra o momento marcado. Trava ocupada
      // (outra aba no mesmo instante, ou a montagem dupla do StrictMode com o perfil já conhecido): tenta de novo
      // logo — quem abriu já marcou o momento, então nada abre duas vezes
      const locks = (navigator as Navigator & { locks?: LockManager }).locks;
      if (locks) {
        locks.request('atenvo-bomdia', { ifAvailable: true }, async (l) => {
          if (l) tentar();
          else window.setTimeout(() => { if (vivo) abrir(motivo); }, 400);
        }).catch(tentar);
      } else tentar();
    };
    const preaquecer = () => {
      const p = preparoBomDiaRef.current;
      const m = momentoDevido(uid, new Date(Date.now() + 3 * 60_000), { gestor });
      if (p.org && m) prepararBomDia({ uid, org: p.org, nome: p.nome, momento: m, gestor });
    };
    const agendar = () => {
      window.clearTimeout(tAbre);
      window.clearTimeout(tPre);
      const ms = msAteProximoMomento(new Date(), { gestor });
      tAbre = window.setTimeout(() => { abrir('agendado'); agendar(); }, ms + 400 + Math.random() * 1200);
      // 2 min antes: números e voz prontos no horário
      if (ms > 120_000) tPre = window.setTimeout(preaquecer, ms - 120_000);
    };
    abrir('entrada');
    agendar();
    // notebook dormindo congela o setTimeout: reconfere a cada minuto e ao voltar para a aba
    const devido = () => momentoDevido(uid, new Date(), { gestor }) !== null;
    const iv = window.setInterval(() => { if (devido()) abrir('agendado'); }, 60_000);
    const aoVoltar = () => { if (document.visibilityState === 'visible' && devido()) abrir('agendado'); };
    document.addEventListener('visibilitychange', aoVoltar);
    window.addEventListener('keydown', aoTeclar, true);
    return () => {
      vivo = false;
      window.clearTimeout(tAbre);
      window.clearTimeout(tPre);
      window.clearTimeout(tDigitando);
      window.clearInterval(iv);
      document.removeEventListener('visibilitychange', aoVoltar);
      window.removeEventListener('keydown', aoTeclar, true);
    };
  }, [user?.id, modoBomDia]);
  // aberto pelo menu: o item some no mesmo clique — o foco volta para o avatar ao fechar
  const concluirBomDia = useCallback(() => {
    setBomDia(null);
    const alvo = devolverFocoRef.current;
    devolverFocoRef.current = null;
    if (alvo) window.requestAnimationFrame(() => { if (alvo.isConnected) alvo.focus({ preventScroll: true }); });
  }, []);
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
  // máquinas fracas. (Desde a camada de movimento a transição roda também no Modo
  // Leve — movimento.css — então liga/desliga igual; com "reduzir movimento" não liga.)
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
  // A lista da sidebar rola em telas baixas. Recolhida (rail de ícones) ela não deve
  // ficar parada onde o mouse a deixou: volta ao topo, ou só o necessário para o
  // item ativo aparecer. Calculado à mão — scrollIntoView rolaria também a página.
  const navRef = useRef<HTMLElement>(null);
  const alinharNav = useCallback(() => {
    const n = navRef.current;
    if (!n) return;
    const ativo = n.querySelector<HTMLElement>('.item.on');
    const fimAtivo = ativo ? ativo.offsetTop - n.offsetTop + ativo.offsetHeight : 0;
    n.scrollTop = Math.max(0, fimAtivo - n.clientHeight + 24);
  }, []);
  useEffect(() => {
    // clique num item com a sidebar aberta: não puxa a lista debaixo do mouse
    if (!sidebarRef.current?.matches(':hover')) alinharNav();
  }, [location.pathname, alinharNav]);
  const fecharNotif = useCallback(() => setNotif(null), []);
  // raiz de portal (regra 10): o menu monta no body, fora do stacking context da topbar
  // (que tem backdrop-filter) — senão o conteúdo do palco pinta por cima dele. Shell monta 1×.
  const raizMenu = useMemo(() => criarRaizPortalV2(document) as unknown as HTMLElement, []);
  const abrirMenuUsuario = useCallback(() => {
    const r = avatarRef.current?.getBoundingClientRect();
    if (r) setMenuPos({ top: Math.round(r.bottom + 8), right: Math.round(window.innerWidth - r.right) });
    setMenuUsuario((v) => !v);
  }, []);
  // sino: central de notificações PERSISTIDA (tabela notificacoes), organizada pelo Radar v5
  // (SinoPainel: seções, filtro Não lidas | Todas, uma linha por cliente; na demo, as fixtures do Radar).
  // O clique abre o painel; o pulso/contador de inbound segue sendo zerado aqui.
  const [painelNotif, setPainelNotif] = useState(false);
  const [notifPos, setNotifPos] = useState<{ top: number; right: number }>({ top: 60, right: 60 });
  const sinoRef = useRef<HTMLButtonElement>(null);
  const sino = useSino();
  // o ponto indica NOVIDADE, não pendência: só não lidas de Gestão e Outros
  // (negociação, fechados e ligar já estão na cápsula da barra e na tela cheia)
  const naoLidas = naoLidasQueAcendem(sino.lista);
  const abrirNotificacoes = useCallback(() => {
    const r = sinoRef.current?.getBoundingClientRect();
    if (r) {
      // painel de 380px (no máximo 100vw − 32px) preso sob o sino, sem sair da tela
      const largura = Math.min(380, window.innerWidth - 32);
      const direita = Math.round(window.innerWidth - r.right);
      setNotifPos({ top: Math.round(r.bottom + 8), right: Math.max(16, Math.min(direita, window.innerWidth - 16 - largura)) });
    }
    setSinoOn(false); setBadgePop(0); setPainelNotif((v) => !v);
  }, []);
  const fecharSino = useCallback((devolverFoco?: boolean) => {
    setPainelNotif(false);
    if (devolverFoco) sinoRef.current?.focus();
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
  preparoBomDiaRef.current = { org: currentOrg?.id ?? '', nome };

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

  // MÓDULO ativo: hoje só Atendimento (Cobranças saiu em 22/10). Trocar de módulo
  // navega pra home do módulo (o menu da esquerda se refaz).
  const moduloAtivo: ModuloId = 'atendimento';
  const modulo = MODULOS.find((m) => m.id === moduloAtivo) ?? MODULOS[0];
  const trocarModulo = useCallback((m: Modulo) => {
    setMenuOrg(false);
    navigate(m.home);
  }, [navigate]);

  const renderItem = (i: ItemNav) => (
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
  );

  return (
    <div className="v2 app-v2">
      <div className="luz" />
      <div className="grao" />
      <div className="p-app">
        <aside className="p-sidebar" ref={sidebarRef} onMouseLeave={alinharNav}>
          {/* SELETOR DE MÓDULO (29/08): troca o sistema inteiro de parte —
              Atendimento ↔ Cobranças (e novos módulos no futuro). A marca e o
              seletor dividem UMA linha (14/10): recolhida, sobra só a marca no
              rail; aberta, módulo + organização ao lado. */}
          <button ref={tenantRef} type="button" className="sb-topo" title={TEM_TROCA ? `Módulo: ${modulo.rotulo} — clique para trocar` : modulo.rotulo}
            aria-haspopup={TEM_TROCA ? 'menu' : undefined} aria-expanded={TEM_TROCA ? menuOrg : undefined}
            onClick={TEM_TROCA ? abrirMenuOrg : undefined} style={TEM_TROCA ? undefined : { cursor: 'default' }}>
            <LogoAtenvo className="marca" />
            <span className="sb-topo-txt lab"><b>{modulo.rotulo}</b><i>{org}</i></span>
            {TEM_TROCA && (
              <svg className="sb-topo-seta lab" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M8 15l4 4 4-4M8 9l4-4 4 4" />
              </svg>
            )}
          </button>
          {menuOrg && createPortal(
            <>
              <div className="um-backdrop" onClick={() => setMenuOrg(false)} aria-hidden />
              <div className="usuario-menu org-troca" role="menu" aria-label="Trocar de módulo" style={{ top: orgMenuPos.top, left: orgMenuPos.left }}>
                <div className="um-head"><div className="um-cargo">Ir para</div></div>
                {/* (Cobranças saiu do sistema em 22/10 — sobrou só Atendimento; o menu só abre com 2+ módulos) */}
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
          <nav className="sb-nav" ref={navRef} aria-label="Navegação principal">
            {modulo.grupos.filter((g) => !g.fixo).map((g) => {
              const itens = g.itens.filter((i) => (admin || !i.admin) && !(gestorBomDia && ESCONDIDO_DO_GESTOR.has(i.slug)));
              if (!itens.length) return null;
              return (
                <div className="grupo" key={g.rotulo}>
                  <div className="glabel lab">{g.rotulo}</div>
                  {itens.map(renderItem)}
                </div>
              );
            })}
          </nav>
          {modulo.grupos.filter((g) => g.fixo).map((g) => {
            const itens = g.itens.filter((i) => (admin || !i.admin) && !(gestorBomDia && ESCONDIDO_DO_GESTOR.has(i.slug)));
            if (!itens.length) return null;
            return (
              <nav className="sb-fixo" key={g.rotulo} aria-label={g.rotulo}>
                {itens.map(renderItem)}
              </nav>
            );
          })}
          {import.meta.env.DEV && (
            <div className="dev-ferramentas">
              <button type="button" className="p-btn btn-sec btn-mini" onClick={simularResposta}>
                Simular resposta
              </button>
            </div>
          )}
          <div className="rodape-sb">
            <div className="avatar" title="Canal operante">{iniciaisDe(nome)}<i className="avatar-on" aria-hidden /></div>
            <div className="rodape-txt lab">
              <div className="nome">{nome}</div>
              <div className="cargo">{papel}</div>
            </div>
          </div>
        </aside>
        {/* fundos do flutuante: .sb-rail = cápsula do estado recolhido (estática);
            .sb-fundo = painel aberto (desliza+esmaece); .sb-sombra = sombra da
            expansão. Irmãos do aside — fora do clip-path (que criaria um backdrop
            root sem blur). A sidebar anima só clip-path/transform/opacity, nunca
            width (shell.css). */}
        <div className="sb-rail" aria-hidden />
        {/* menu ABERTO em vidro (dono 29/10: "aquele glaze transparente, que nem nas outras coisas") —
            a mesma receita .vidro-pro do filtro e da paleta de scripts; a cápsula recolhida segue sólida */}
        <div className="sb-fundo vidro-pro" aria-hidden ref={fundoRef} />
        <div className="sb-sombra" aria-hidden />

        <main className="principal">
          <div className="p-topbar">
            <div className="busca">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" />
              </svg>
              <span className="busca-texto">Buscar contatos, conversas, cobranças…</span><kbd>⌘K</kbd>
            </div>
            {/* Radar de Atendimento: cápsula Em negociação · Fechados · Ligar · Decisões no vão entre a busca e os ícones */}
            {/* o perfil gestor (Murilo) não vê a Central de Avisos por enquanto (dono 30/10) */}
            {!gestorBomDia && <div className="radar-slot"><RadarBarra /></div>}
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
              <button ref={sinoRef} type="button" className="ib" aria-label="Notificações" title="Notificações" aria-haspopup="dialog" aria-expanded={painelNotif} onClick={abrirNotificacoes}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                  <path d="M18 9a6 6 0 10-12 0c0 6-2.5 7-2.5 7h17S18 15 18 9zM10 20a2.2 2.2 0 004 0" />
                </svg>
                <span className={naoLidas > 0 ? 'pt on' : 'pt'} aria-hidden />
              </button>
              {painelNotif && createPortal(
                <>
                  <div className="um-backdrop" onClick={() => fecharSino()} aria-hidden />
                  {/* o painel (pele .usuario-menu.notif-panel) marca como lida e navega por conta própria */}
                  <SinoPainel pos={notifPos} sino={sino} aoFechar={fecharSino} />
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
                    <button type="button" role="menuitem" className="um-item" onClick={() => {
                      setMenuUsuario(false);
                      bomDiaNoInicioRef.current = false;
                      devolverFocoRef.current = avatarRef.current;
                      setBomDia({ momento: momentoAtual(new Date(), { gestor: gestorBomDia }), dia: hojeLocal() });
                    }}>Ouvir o bom dia</button>
                    {/* a apresentação de lançamento (dono 30/10): SÓ o perfil gestor e SÓ por aqui — não abre sozinha */}
                    {gestorBomDia && (
                      <button type="button" role="menuitem" className="um-item" onClick={() => {
                        setMenuUsuario(false);
                        bomDiaNoInicioRef.current = false;
                        devolverFocoRef.current = avatarRef.current;
                        setBomDia({ momento: momentoAtual(new Date(), { gestor: true }), dia: hojeLocal(), apresentacao: true });
                      }}>Apresentação do bom dia</button>
                    )}
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
        <BomDia
          aberta={bomDia !== null && !!user?.id && !!currentOrg?.id}
          momento={bomDia?.momento ?? 'manha'}
          apresentacao={!!bomDia?.apresentacao}
          dia={bomDia?.dia ?? ''}
          gestor={gestorBomDia}
          aoConcluir={concluirBomDia}
          nome={nome}
          uid={user?.id ?? ''}
          orgId={currentOrg?.id ?? ''}
        />
        <AvisoAtualizacao />
        {/* Radar de Atendimento (23/10): takeover do último aviso (a pílula fica na barra) */}
        {/* depois das 17h, enquanto o modo (gestor?) não chegou, o Radar também espera */}
        <GuardiaoAvisos bloqueado={gestorBomDia || bomDia !== null || (modoBomDia === null && !!orgBomDia && new Date().getHours() >= HORA_FIM_DIA)} />
        {/* Assistente de IA (dono 30/10): balão no canto inferior direito; some enquanto o bom dia está na tela */}
        <AssistenteBalao oculto={bomDia !== null} />
        {/* prévia da repaginada (27/10): comparador Antes/Depois, só no demo LOCAL
            (nunca num build publicado, nem no demo de cliente) */}
        {import.meta.env.DEV && DEMO_MODE && <ComparadorVisual />}
      </div>

    </div>
  );
}
