import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type Ref } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useOrg } from '@/context/OrgContext';
import { horaMarcada, tamanhoDoTexto, textoDoCartao, useLembretes, type AvisoLembrete } from '@/data/lembretes';
import { baseDoBalao } from './AssistenteBalao';
import './lembrete.css';

/* ==================================================================
   O AVISO DO LEMBRETE (dono 30/10 ~23h40: "na hora ela me lembra,
   entendeu? … Ela vai lembrar para mim"). Na hora do lembrete, com o
   Atenvo aberto: um cartão de vidro escuro no canto inferior direito,
   ACIMA do balão do assistente — a esfera pequena (a do balão), a
   palavra "Lembrete", o texto grande, "Marcado para 13:00" e os botões
   "Lembrar em 10 min" e "Ok". Ela fala ao mesmo tempo (useLembretes:
   voz Despina; sem voz, um som curto). Vários de uma vez: as bordas dos
   próximos aparecem atrás (pilha) e "1 de 3".
   - REGRA DO DONO: nada flutuando cobre o ENVIAR nem o compositor do
     WhatsApp — no /whatsapp o aviso sobe acima do compositor real
     (medido; baseDoBalao, a MESMA regra do balão) e acima do balão.
   - Não rouba o foco (a pessoa pode estar digitando); Tab chega nos
     botões; Esc com o foco no aviso = Ok. Leitor de tela: alerta.
   - Espera (não aparece nem fala) com o bom dia, o cartão de voz ou a
     tela cheia do Radar na tela: a prop `oculto` e a própria tela
     (.ast-voz, .bd-veu, .gva-tk), conferida enquanto a voz está liberada.
     Com SOM nesta aba (a conversa de voz aberta — o microfone ligado —
     ou o bom dia falando), a aba que fala, se for outra, também espera
     (useLembretes: a trava de espera). Tela parada (o bom dia esperando o
     play, a Central de Avisos) não segura as outras abas.
   - Mora DENTRO do shell (sem portal), z-index 37 (lembrete.css).
   ================================================================== */

/** a largura do cartão (lembrete.css: min(340 px, 100vw − 32 px)) */
export const LARGURA_AVISO = 340;
/** texto que passa da altura por até isto (px) cabe no respiro da última linha: não esmaece */
const SOBRA_QUE_ESMAECE = 6;
/** respiro entre o aviso e o balão */
const FOLGA_BALAO = 12;
/** sem balão nem compositor: o canto (a mesma base do balão) */
const BASE_INICIAL = 20;
/** o bom dia (.bd-veu), o cartão de voz (.ast-voz) ou a tela cheia da Central de Avisos (.gva-tk, modal por
    cima de tudo) nesta aba: o aviso desta aba espera */
export const SELETOR_OCUPADO = '.ast-voz, .bd-veu, .gva-tk';
/** SOM nesta aba — a conversa de voz VIVA (conectando, ouvindo, consultando, falando: o microfone ouve) ou o bom
    dia falando ("Ouvir de novo" volta a falar): a aba que fala, se for outra, espera. Não seguram ninguém: o
    cartão de voz parado no erro ou no fim (sem microfone; pode ficar aberto numa aba esquecida), o bom dia
    esperando o play (pode ficar horas) e o painel dele. */
export const SELETOR_COM_SOM =
  '.ast-voz:not([data-fase="erro"]):not([data-fase="encerrada"]), .bd-veu.bd-fase-falando, .bd-veu.bd-fase-voltando';

// no servidor (testes com renderToString) o efeito de layout vira efeito comum: sem o aviso do React
const useLayoutIso = typeof window === 'undefined' ? useEffect : useLayoutEffect;

const ehLeve = () => document.documentElement.getAttribute('data-perf') === 'lite'
  || !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/* ------------------------------------------------------------------ posição (regra do compositor) */

/** Distância ao rodapé do aviso: a regra do compositor (baseDoBalao, com a largura do aviso) e, com o balão
    na tela, logo acima dele (o balão segue a mesma regra com a largura dele). */
export function baseDoAviso(
  janela: { altura: number; largura: number },
  compositor: { top: number; height: number; left: number; right: number } | null,
  balao: { largura: number; altura: number } | null,
): number {
  const propria = baseDoBalao(janela, compositor, Math.min(LARGURA_AVISO, janela.largura - 32));
  if (!balao) return propria;
  return Math.max(propria, baseDoBalao(janela, compositor, balao.largura) + balao.altura + FOLGA_BALAO);
}

function useBaseDoAviso(ativo: boolean): number {
  const { pathname } = useLocation();
  const noWhats = /^\/whatsapp(\/|$)/.test(pathname);
  const [base, setBase] = useState(BASE_INICIAL);
  useLayoutIso(() => {
    if (!ativo) return;
    let alvo: Element | null = null;
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => medir()) : null;
    function medir() {
      const el = noWhats ? document.querySelector('.wa-composer') : null;
      if (el !== alvo) {
        if (alvo) ro?.unobserve(alvo);
        alvo = el;
        if (el) ro?.observe(el);
      }
      const r = el?.getBoundingClientRect();
      const comp = r ? { top: r.top, height: r.height, left: r.left, right: r.right } : null;
      // o balão do assistente (quem tem a voz liberada); escondido = o cartão de voz aberto (o aviso já espera)
      const b = document.querySelector('.ast-balao');
      const br = b && !b.classList.contains('ast-escondido') ? b.getBoundingClientRect() : null;
      const balao = br && br.width > 0 ? { largura: br.width, altura: br.height } : null;
      const v = baseDoAviso({ altura: window.innerHeight, largura: window.innerWidth }, comp, balao);
      setBase((x) => (x === v ? x : v));
    }
    medir();
    // o compositor nasce/morre ao abrir/fechar uma conversa; o balão, ao trocar de pessoa: confere de leve
    const iv = window.setInterval(medir, 700);
    window.addEventListener('resize', medir);
    return () => {
      window.clearInterval(iv);
      window.removeEventListener('resize', medir);
      ro?.disconnect();
    };
  }, [ativo, noWhats]);
  return base;
}

interface Ocupado { tela: boolean; som: boolean }
const LIVRE: Ocupado = { tela: false, som: false };

/** O que há nesta aba: `tela` = bom dia, cartão de voz ou tela cheia do Radar (o aviso daqui espera); `som` = a
    conversa de voz aberta ou o bom dia falando (a aba que fala, se for outra, espera). Confere enquanto a voz
    está liberada, mesmo sem aviso (a conversa pode estar aqui e a aba que fala, em outra). Quem não tem a voz
    liberada: nada roda. */
function useOcupadoNaTela(ativo: boolean): Ocupado {
  const [ocupado, setOcupado] = useState<Ocupado>(LIVRE);
  useLayoutIso(() => {
    if (!ativo) { setOcupado(LIVRE); return; }
    const conferir = () => {
      const tela = !!document.querySelector(SELETOR_OCUPADO);
      const som = tela && !!document.querySelector(SELETOR_COM_SOM);
      setOcupado((o) => (o.tela === tela && o.som === som ? o : { tela, som }));
    };
    conferir();
    const iv = window.setInterval(conferir, 800);
    // o clique no balão abre o cartão de voz: confere logo depois do clique (sem esperar o intervalo)
    const aoClicar = () => { window.requestAnimationFrame(conferir); };
    document.addEventListener('click', aoClicar, true);
    return () => {
      window.clearInterval(iv);
      document.removeEventListener('click', aoClicar, true);
    };
  }, [ativo]);
  return ocupado;
}

/* ------------------------------------------------------------------ o cartão */

const IconeRelogio = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="12" cy="12" r="8.6" />
    <path d="M12 7.6V12l2.9 1.9" />
  </svg>
);

export interface PropsCartaoLembrete {
  aviso: AvisoLembrete;
  /** quantos avisos há na fila (este é o da frente) */
  total: number;
  /** a voz dela está tocando: a esfera acende */
  falando?: boolean;
  /** o relógio do "Marcado para" (testes) */
  agora?: number;
  /** o aviso anterior tinha o foco: este recebe no Ok */
  focar?: boolean;
  esferaRef?: Ref<HTMLSpanElement>;
  aoOk: () => void;
  aoAdiar: () => void;
}

export function CartaoLembrete({ aviso, total, falando = false, agora, focar = false, esferaRef, aoOk, aoAdiar }: PropsCartaoLembrete) {
  const okRef = useRef<HTMLButtonElement>(null);
  const textoRef = useRef<HTMLParagraphElement>(null);
  const id = useId();
  const texto = textoDoCartao(aviso.texto);
  const hora = horaMarcada(aviso.quandoMs, agora ?? Date.now());
  // sem altura para o texto inteiro (compositor alto numa janela baixa: o cartão encolhe e o texto rola): o fim
  // do texto esmaece — sinal de que há mais (o Mac esconde a barra de rolagem). Sobra de poucos px (só o respiro
  // da última linha some) não esmaece: a linha está inteira à vista.
  const [rola, setRola] = useState(false);

  useEffect(() => {
    if (focar) okRef.current?.focus({ preventScroll: true });
  }, [focar]);

  useEffect(() => {
    const el = textoRef.current;
    if (!el) return;
    const medir = () => setRola(el.scrollHeight - el.clientHeight - el.scrollTop > SOBRA_QUE_ESMAECE);
    medir();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(medir) : null;
    ro?.observe(el);
    el.addEventListener('scroll', medir, { passive: true });
    return () => {
      ro?.disconnect();
      el.removeEventListener('scroll', medir);
    };
  }, [texto]);

  const aoTecla = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key !== 'Escape' || e.defaultPrevented) return;
    e.preventDefault();
    e.stopPropagation();
    aoOk();
  };

  return (
    <>
      {total > 2 && <span className="lmb-camada lmb-camada-2" aria-hidden />}
      {total > 1 && <span className="lmb-camada lmb-camada-1" aria-hidden />}
      <section
        className="lmb-aviso"
        role="dialog"
        aria-modal="false"
        aria-labelledby={`${id}-t`}
        aria-describedby={`${id}-x ${id}-h`}
        data-falando={falando ? 'sim' : undefined}
        data-atrasado={aviso.atrasado ? 'sim' : undefined}
        onKeyDown={aoTecla}
      >
        <header className="lmb-topo">
          <span className="lmb-esfera" ref={esferaRef} aria-hidden>
            <span className="lmb-esfera-giro" />
          </span>
          <span className="lmb-marca" id={`${id}-t`}>Lembrete</span>
          {total > 1 && <span className="lmb-conta">{`1 de ${total}`}</span>}
        </header>
        <p className="lmb-texto" ref={textoRef} id={`${id}-x`} data-tam={tamanhoDoTexto(texto)} data-rola={rola ? 'sim' : undefined}>{texto}</p>
        <p className="lmb-hora" id={`${id}-h`}>
          <IconeRelogio />
          <span>{hora}</span>
        </p>
        <div className="lmb-acoes">
          <button type="button" className="lmb-botao" onClick={aoAdiar}>Lembrar em 10 min</button>
          <button type="button" className="lmb-botao lmb-forte" ref={okRef} onClick={aoOk}>Ok</button>
        </div>
        {/* o leitor de tela ouve o lembrete quando ele aparece (a fala dela não chega a ele) */}
        <span className="lmb-sr" role="alert">{`Lembrete: ${texto}. ${hora}.`}</span>
      </section>
    </>
  );
}

/* ------------------------------------------------------------------ o componente (montado no shell) */

export interface PropsLembreteAviso {
  /** o bom dia (ou outra tela que fala) aberto: o aviso espera — não aparece nem fala */
  oculto?: boolean;
  /** false = não busca lembretes (ex.: quem ainda não tem a voz liberada) */
  ativo?: boolean;
}

export function LembreteAviso({ oculto = false, ativo = true }: PropsLembreteAviso) {
  const { user } = useAuth();
  const { currentOrg } = useOrg();
  // a tela é conferida enquanto a voz está liberada (quem não tem: nada roda)
  const ocupado = useOcupadoNaTela(ativo && !!user?.id && !!currentOrg?.id);
  const esconder = oculto || ocupado.tela;
  const l = useLembretes({
    org: currentOrg?.id ?? '', uid: user?.id ?? '', nome: user?.name ?? '', oculto: esconder, somNaAba: ocupado.som, ativo,
  });
  const { frente, aoNivel } = l;
  const haFrente = !!frente;

  const visivel = haFrente && !esconder;
  const base = useBaseDoAviso(visivel);
  const caixaRef = useRef<HTMLDivElement>(null);
  const esferaRef = useRef<HTMLSpanElement>(null);
  // a ocorrência que recebe o foco ao aparecer (só a seguinte a um Ok/adiar feito pelo teclado; nunca rouba o foco)
  const [focarChave, setFocarChave] = useState<string | null>(null);

  // a esfera acende com a voz (no Leve e com "reduzir movimento", fica parada)
  useEffect(() => {
    if (!visivel || ehLeve()) { aoNivel(null); return; }
    let escrito = '';
    aoNivel((n) => {
      const t = n.toFixed(2);
      if (t === escrito) return;
      escrito = t;
      esferaRef.current?.style.setProperty('--lmb-nivel', t);
    });
    return () => aoNivel(null);
  }, [visivel, aoNivel]);

  // o foco foi entregue (o cartão já montou com ele): vale uma vez só
  const chaveFrente = frente?.chave ?? null;
  useEffect(() => {
    if (chaveFrente !== null && chaveFrente === focarChave) setFocarChave(null);
  }, [chaveFrente, focarChave]);

  if (!visivel || !frente) return null;

  const resolver = (acao: 'ok' | 'adiar') => {
    // com o foco no aviso (teclado), o próximo da fila recebe o foco no Ok
    const el = document.activeElement;
    const comFoco = !!el && !!caixaRef.current?.contains(el);
    setFocarChave(comFoco ? l.fila[1]?.chave ?? null : null);
    if (acao === 'ok') l.confirmar(frente.chave);
    else l.adiar(frente.chave);
  };

  const estilo = { '--lmb-base': `${base}px` } as CSSProperties;
  return (
    <div className="lmb-raiz" style={estilo}>
      <div className="lmb-caixa" ref={caixaRef}>
        <CartaoLembrete
          key={frente.chave}
          aviso={frente}
          total={l.fila.length}
          falando={l.falando}
          focar={frente.chave === focarChave}
          esferaRef={esferaRef}
          aoOk={() => resolver('ok')}
          aoAdiar={() => resolver('adiar')}
        />
      </div>
    </div>
  );
}
