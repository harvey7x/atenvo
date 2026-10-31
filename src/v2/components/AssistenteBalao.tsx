import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useOrg } from '@/context/OrgContext';
import { DEMO_MODE } from '@/lib/demo';
import { ASSISTENTE_REAL, executarFerramentaVoz, pedirSessaoVoz } from '@/data/assistente';
import { avisarLembretesMudaram } from '@/data/lembretes';
import { ErroVoz, lembretesMudaram, primeiroNomeDe } from '../lib/assistenteVoz';
import { criarAudioVoz } from '../lib/assistenteVozAudio';
import {
  criarSessaoVoz, sessaoComErro, type EstadoVoz, type PermissaoMicrofone, type SessaoVoz, type WsLike,
} from '../lib/assistenteVozSessao';
import { criarSessaoDemo, ehRoteiroDemo } from '../lib/assistenteVozDemo';
import { CartaoVoz } from './AssistenteVoz';
import './assistente.css';

/* ==================================================================
   ASSISTENTE DE IA — o balão no canto inferior direito (dono 30/10) e,
   ao clicar, a CONVERSA POR VOZ ao vivo (dono 30/10 ~21h50: "eu quero
   por voz mesmo. Por texto não me agrada" — o chat de texto saiu).
   - Balão: a esfera do bom dia em miniatura (P&B, CSS puro), 52 px; no
     hover, a pílula "Pergunte à IA". Clique → cartão de voz no mesmo
     canto (AssistenteVoz.tsx). O áudio nasce NO CLIQUE (gesto do
     usuário), antes de qualquer espera.
   - LIBERAÇÃO: por enquanto SÓ o Matheus vê o balão (trocar para todos
     depois do ok do dono). Na prévia local da demo, a conversa simulada.
   - REGRA DO DONO: nada flutuando cobre o botão de ENVIAR nem o
     compositor do WhatsApp — no /whatsapp o balão (e o cartão) sobem
     acima do compositor real (medido, ResizeObserver) e nunca recebem
     clique fora deles.
   - Mora DENTRO do shell (sem portal), z-index 35/36: abaixo do toast de
     mensagem recebida (.notif, 40), dos menus/modais/gavetas (portais
     80+), da Central de Avisos e do aviso de atualização (1200+). A
     conversa sobrevive à troca de rota (o shell monta uma vez).
   ================================================================== */

/** prévia local (vite --mode demo): a conversa simulada — nunca num build publicado */
const PREVIA_DEMO = import.meta.env.DEV && DEMO_MODE;
/** Quem vê o balão de voz (e os avisos de lembrete): toda a equipe logada — dono 31/10, versão 1 publicada para
    "Toda a equipe" (antes, 30/10, só o Matheus). O servidor recorta os dados pelo papel de cada um. */
export const vozLiberadaPara = (id: string | null | undefined, previa: boolean = PREVIA_DEMO): boolean =>
  previa || !!id;

const BASE_PADRAO = 20;   // px do rodapé da janela
// no servidor (testes com renderToString) o efeito de layout vira efeito comum: sem o aviso do React
const useLayoutIso = typeof window === 'undefined' ? useEffect : useLayoutEffect;
const FOLGA_COMPOSITOR = 12;
// as medidas do CSS (assistente.css): right 20 px; balão 52 px; cartão min(340 px, 100vw − 32 px)
const MARGEM_DIREITA = 20;
const LARGURA_BALAO = 52;
export const LARGURA_CARTAO = 340;
/** o fim sozinho (silêncio, tempo) fica à vista alguns segundos e o cartão fecha */
const FECHA_DEPOIS_DO_FIM_MS = 7000;

/* ------------------------------------------------------------------ posição (regra do compositor) */

/** distância ao rodapé de um flutuante encostado à direita (com `largura` px): padrão 20 px; logo acima do
    compositor do WhatsApp SÓ quando o compositor passa por baixo dele (mesma faixa horizontal) — com a ficha
    do cliente aberta o compositor acaba antes do canto e o balão fica no canto, sem cobrir a ficha */
export function baseDoBalao(
  janela: { altura: number; largura: number },
  compositor: { top: number; height: number; left: number; right: number } | null,
  largura: number,
): number {
  if (!compositor || compositor.height <= 0) return BASE_PADRAO;
  const dir = janela.largura - MARGEM_DIREITA;
  if (compositor.right <= dir - largura || compositor.left >= dir) return BASE_PADRAO;
  return Math.max(BASE_PADRAO, Math.round(janela.altura - compositor.top + FOLGA_COMPOSITOR));
}

interface Bases { balao: number; cartao: number }
const BASES_PADRAO: Bases = { balao: BASE_PADRAO, cartao: BASE_PADRAO };

function useBaseDoBalao(ativo: boolean): Bases {
  const { pathname } = useLocation();
  const noWhats = ativo && /^\/whatsapp(\/|$)/.test(pathname);
  const [base, setBase] = useState<Bases>(BASES_PADRAO);
  useLayoutIso(() => {
    if (!noWhats) { setBase(BASES_PADRAO); return; }
    let alvo: Element | null = null;
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => medir()) : null;
    function medir() {
      const el = document.querySelector('.wa-composer');
      if (el !== alvo) {
        if (alvo) ro?.unobserve(alvo);
        alvo = el;
        if (el) ro?.observe(el);
      }
      const r = el?.getBoundingClientRect();
      const janela = { altura: window.innerHeight, largura: window.innerWidth };
      const comp = r ? { top: r.top, height: r.height, left: r.left, right: r.right } : null;
      const balao = baseDoBalao(janela, comp, LARGURA_BALAO);
      const cartao = baseDoBalao(janela, comp, Math.min(LARGURA_CARTAO, janela.largura - 32));
      setBase((b) => (b.balao === balao && b.cartao === cartao ? b : { balao, cartao }));
    }
    medir();
    // o compositor nasce/morre ao abrir/fechar uma conversa: confere de leve (só no /whatsapp)
    const iv = window.setInterval(medir, 700);
    window.addEventListener('resize', medir);
    return () => {
      window.clearInterval(iv);
      window.removeEventListener('resize', medir);
      ro?.disconnect();
    };
  }, [noWhats]);
  return base;
}

/* ------------------------------------------------------------------ a sessão (real ou simulada) */

async function permissaoMicrofone(): Promise<PermissaoMicrofone> {
  try {
    const st = await navigator.permissions?.query({ name: 'microphone' as PermissionName });
    return st?.state ?? 'desconhecida';
  } catch {
    return 'desconhecida';
  }
}

/** Cria a sessão DENTRO do clique: os AudioContexts nascem aqui (antes de qualquer await). */
function novaSessao(p: { org: string; nome: string; admin: boolean; aoMudar: (e: EstadoVoz) => void }): SessaoVoz {
  if (!ASSISTENTE_REAL) {
    const r = (window as unknown as { __astVozRoteiro?: unknown }).__astVozRoteiro;
    return criarSessaoDemo({ nome: p.nome, admin: p.admin, roteiro: PREVIA_DEMO && ehRoteiroDemo(r) ? r : 'conversa', aoMudar: p.aoMudar });
  }
  let audio;
  try {
    audio = criarAudioVoz();
  } catch (e) {
    return sessaoComErro(e instanceof ErroVoz ? e.codigo : 'sem_suporte', p.aoMudar);
  }
  return criarSessaoVoz({ org: p.org, nome: p.nome, aoMudar: p.aoMudar }, {
    audio,
    pedirSessao: pedirSessaoVoz,
    executarFerramenta: async (q) => {
      const r = await executarFerramentaVoz(q);
      // criou/cancelou um lembrete: o aviso na tela (LembreteAviso) busca de novo agora, nesta aba e nas outras
      if (lembretesMudaram(q.nome, r.resultado)) avisarLembretesMudaram();
      return r;
    },
    // o WebSocket do navegador (os handlers dele têm `this` tipado; a sessão só usa o pedaço de WsLike)
    criarWs: (url) => new WebSocket(url) as unknown as WsLike,
    permissaoMicrofone,
    aviso: (m) => console.warn(m),
  });
}

/* ------------------------------------------------------------------ peças visuais */

function Esfera() {
  return (
    <span className="ast-esfera" aria-hidden>
      <span className="ast-esfera-giro" />
    </span>
  );
}

/* ------------------------------------------------------------------ o componente */

export function AssistenteBalao({ oculto = false }: { oculto?: boolean }) {
  const { user } = useAuth();
  const { currentOrg } = useOrg();
  const navigate = useNavigate();
  const admin = currentOrg?.role === 'admin';
  const org = currentOrg?.id ?? '';
  const nome = primeiroNomeDe(user?.name);
  const pronto = !!user?.id && !!org && vozLiberadaPara(user?.id);

  const [sessao, setSessao] = useState<SessaoVoz | null>(null);
  const [estado, setEstado] = useState<EstadoVoz | null>(null);
  const sessaoRef = useRef<SessaoVoz | null>(null);
  const balaoRef = useRef<HTMLButtonElement>(null);
  const cartaoRef = useRef<HTMLDivElement>(null);
  const sobreRef = useRef(false);
  const base = useBaseDoBalao(pronto && !oculto);

  /** abre a conversa — chamado SÓ de um clique (o áudio precisa do gesto) */
  const abrir = useCallback(() => {
    sessaoRef.current?.encerrar();
    let s: SessaoVoz | null = null;
    s = novaSessao({ org, nome, admin, aoMudar: (e) => { if (sessaoRef.current === s) setEstado(e); } });
    sessaoRef.current = s;
    setSessao(s);
    s.iniciar();
  }, [admin, nome, org]);

  const fechar = useCallback((devolverFoco = true) => {
    const s = sessaoRef.current;
    sessaoRef.current = null;
    s?.encerrar();
    // o cartão sai debaixo do ponteiro sem pointerleave: o "ponteiro em cima" não pode valer para o próximo
    // (senão a próxima conversa que acaba sozinha nunca fecha)
    sobreRef.current = false;
    setSessao(null);
    setEstado(null);
    if (devolverFoco) window.requestAnimationFrame(() => balaoRef.current?.focus({ preventScroll: true }));
  }, []);

  // trocou a pessoa ou a empresa, o bom dia abriu ou o componente saiu: a conversa acaba
  useEffect(() => () => { sessaoRef.current?.encerrar(); sessaoRef.current = null; }, []);
  useEffect(() => { fechar(false); }, [user?.id, org, fechar]);
  useEffect(() => { if (oculto) fechar(false); }, [oculto, fechar]);

  // Esc encerra com o foco em lugar nenhum (com o foco NO cartão, o próprio cartão trata e não deixa o Esc subir) —
  // nunca rouba o Esc de um campo ou modal
  const aberto = estado !== null;
  useEffect(() => {
    if (!aberto) return;
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const ativo = document.activeElement;
      const noCartao = !!ativo && !!cartaoRef.current?.contains(ativo);
      if (!noCartao && ativo && ativo !== document.body) return;
      e.preventDefault();
      fechar();
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [aberto, fechar]);

  // fim sozinho (1 minuto sem fala, teto de tempo, servidor): a frase fica à vista e o cartão fecha
  // (com o ponteiro em cima, espera ele sair)
  const fimSozinho = estado?.fase === 'encerrada' && estado.fim !== null;
  useEffect(() => {
    if (!fimSozinho) return;
    let t = 0;
    const tentar = () => {
      if (sobreRef.current) { t = window.setTimeout(tentar, 1500); return; }
      // o foco só volta ao balão se estava no cartão (quem está digitando em outro lugar continua lá)
      const ativo = document.activeElement;
      fechar(!!ativo && !!cartaoRef.current?.contains(ativo));
    };
    t = window.setTimeout(tentar, FECHA_DEPOIS_DO_FIM_MS);
    return () => window.clearTimeout(t);
  }, [fimSozinho, fechar]);

  if (!pronto || oculto) return null;

  const estilo = { '--ast-base': `${base.balao}px`, '--ast-base-cartao': `${base.cartao}px` } as CSSProperties;

  return (
    <div className="ast-raiz" style={estilo}>
      <button
        ref={balaoRef}
        type="button"
        className={aberto ? 'ast-balao ast-escondido' : 'ast-balao'}
        aria-label="Pergunte à IA — abrir a conversa por voz"
        aria-haspopup="dialog"
        aria-expanded={aberto}
        tabIndex={aberto ? -1 : 0}
        onClick={abrir}
      >
        <Esfera />
        <span className="ast-pilula" aria-hidden>Pergunte à IA</span>
      </button>

      {aberto && sessao && estado && (
        <CartaoVoz
          sessao={sessao}
          estado={estado}
          cartaoRef={cartaoRef}
          aoFechar={() => fechar()}
          aoRecomecar={abrir}
          aoAbrirLink={(rota) => navigate(rota)}
          aoPassar={(sobre) => { sobreRef.current = sobre; }}
        />
      )}
    </div>
  );
}
