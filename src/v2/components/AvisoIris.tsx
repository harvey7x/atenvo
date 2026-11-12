import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAvisosIris } from '../pages/filaIris/avisosIris';
import { TEXTO_AVISO, type AvisoIris as Aviso } from '../pages/filaIris/avisosTexto';
import { CartaoAvisoIris, RESUMO_A_PARTIR, anuncioDoAviso } from './CartaoAvisoIris';
import { baseDoAviso, SELETOR_OCUPADO } from './LembreteAviso';

/* ==================================================================
   O AVISO DA IRIS (dono 12/11): "a Iris atendeu um cliente completo e passou para você… preciso
   que apareça uma notificação na tela, independente da onde". Um cartão de VIDRO ESCURO (a família
   do lembrete), no canto inferior direito, em QUALQUER página do sistema:
   - um aviso: "A Iris passou para você", o nome, o que fazer (palavras do dono por prioridade) e
     Abrir conversa · Ver na fila · Ok. Dois: "1 de 2" e a pilha atrás. Três ou mais de uma vez
     (ex.: ao abrir o sistema de manhã): UM cartão de resumo com os nomes e "Abrir a Fila da Iris".
   - Ok (ou Esc com o foco nele) = visto: não volta. Sem Ok, fica — atendente não pode ficar sem aviso.
   - O cartão não troca debaixo do mouse: com o ponteiro ou o foco nele, a lista fica parada; o que
     chegar entra depois (o mais antigo é o da frente, o novo entra atrás).
   - Com o Atenvo em outra aba: uma notificação do navegador (só se a permissão já foi dada — o
     lembrete pede; aqui nunca se pede).
   - REGRA DO DONO: nada flutuando cobre o ENVIAR do WhatsApp (baseDoAviso, a mesma do lembrete, com o
     compositor observado de perto) e, com o lembrete na tela, este sobe acima dele. Espera o bom dia,
     o cartão de voz, a tela cheia do Radar e janelas abertas (a ficha do cliente, diálogos). Não rouba o foco.
   - z-index 38: acima do lembrete (37) e do balão (35), abaixo do toast de mensagem (.notif 40).
   ================================================================== */

const FOLGA = 12;
/** janelas por cima de tudo: a ficha do cliente da Fila da Iris e os diálogos do sistema */
export const SELETOR_JANELA = '.fi-veu, .p-modal';
/** depois de "Ver na fila", o cartão espera a ficha abrir (sem piscar atrás do véu) */
const PAUSA_VER_FILA_MS = 2500;
const useLayoutIso = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/** a distância ao rodapé: a do lembrete (compositor do WhatsApp + balão) e, com o lembrete na tela, acima dele */
function useBase(ativo: boolean): number {
  const { pathname } = useLocation();
  const [base, setBase] = useState(20);
  useLayoutIso(() => {
    if (!ativo) return;
    let alvo: Element | null = null;
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => medir()) : null;
    function medir() {
      const noWhats = /^\/whatsapp(\/|$)/.test(window.location.pathname);
      const el = noWhats ? document.querySelector('.wa-composer') : null;
      /* o compositor cresce (texto longo, resposta citada, anexo): observado de perto, como no lembrete */
      if (el !== alvo) {
        if (alvo) ro?.unobserve(alvo);
        alvo = el;
        if (el) ro?.observe(el);
      }
      const comp = el?.getBoundingClientRect();
      const b = document.querySelector('.ast-balao');
      const br = b && !b.classList.contains('ast-escondido') ? b.getBoundingClientRect() : null;
      let v = baseDoAviso({ altura: window.innerHeight, largura: window.innerWidth },
        comp ? { top: comp.top, height: comp.height, left: comp.left, right: comp.right } : null,
        br && br.width > 0 ? { largura: br.width, altura: br.height } : null);
      const lmb = document.querySelector('.lmb-caixa')?.getBoundingClientRect();
      if (lmb && lmb.height > 0) v = Math.max(v, Math.round(window.innerHeight - lmb.top + FOLGA));
      setBase((x) => (x === v ? x : v));
    }
    medir();
    const iv = window.setInterval(medir, 700);
    window.addEventListener('resize', medir);
    return () => { window.clearInterval(iv); window.removeEventListener('resize', medir); ro?.disconnect(); };
  }, [ativo, pathname]);
  return base;
}

/** o que há na tela que manda o aviso esperar (bom dia, cartão de voz, tela cheia do Radar, janela aberta) */
function useOcupado(ativo: boolean): boolean {
  const [oc, setOc] = useState(false);
  useEffect(() => {
    if (!ativo) { setOc(false); return; }
    const conferir = () => { const v = !!document.querySelector(`${SELETOR_OCUPADO}, ${SELETOR_JANELA}`); setOc((x) => (x === v ? x : v)); };
    conferir();
    const iv = window.setInterval(conferir, 800);
    /* um clique pode abrir uma janela: confere logo depois (sem esperar o intervalo), como o lembrete */
    const aoClicar = () => { window.requestAnimationFrame(conferir); };
    document.addEventListener('click', aoClicar, true);
    return () => { window.clearInterval(iv); document.removeEventListener('click', aoClicar, true); };
  }, [ativo]);
  return oc;
}

/** o relógio do "há X" (o cartão parado numa página também envelhece) */
function useAgora(ativo: boolean): number {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    if (!ativo) return;
    setAgora(Date.now());
    const iv = window.setInterval(() => setAgora(Date.now()), 60_000);
    return () => window.clearInterval(iv);
  }, [ativo]);
  return agora;
}

/** com o Atenvo em outra aba: a notificação do navegador para cada aviso NOVO (só com a permissão já dada) */
function useNotificacaoDoNavegador(avisos: Aviso[], ativo: boolean): void {
  const avisados = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!ativo) return;
    /* a primeira lista é a que já existia ao abrir: não vira notificação */
    if (avisados.current === null) { avisados.current = new Set(avisos.map((a) => a.id)); return; }
    const novos = avisos.filter((a) => !avisados.current!.has(a.id));
    for (const a of novos) avisados.current.add(a.id);
    if (!novos.length || typeof document === 'undefined' || !document.hidden) return;
    try {
      if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
      const a = novos[0];
      const n = new Notification('A Iris passou para você', {
        body: novos.length > 1 ? `${a.nome} e mais ${novos.length - 1}` : `${a.nome} · ${TEXTO_AVISO[a.categoria].faca}`,
        tag: `atenvo-iris-${a.id}`,
        icon: '/icons/pwa-192.png',
      });
      n.onclick = () => { try { window.focus(); } catch { /* o navegador decide */ } n.close(); };
    } catch { /* sem notificação do navegador: o cartão aparece ao voltar */ }
  }, [avisos, ativo]);
}

/** montado no shell: busca os avisos de quem tem a Fila da Iris e mostra o cartão */
export function AvisoIris({ oculto = false, acesso }: { oculto?: boolean; acesso: boolean | null }) {
  const ativo = acesso === true;
  const { avisos, marcarVistos } = useAvisosIris(ativo);
  const navigate = useNavigate();
  const ocupado = useOcupado(ativo && avisos.length > 0);
  const [pausaAte, setPausaAte] = useState(0);
  useEffect(() => {
    if (!pausaAte) return;
    const t = window.setTimeout(() => setPausaAte(0), Math.max(0, pausaAte - Date.now()));
    return () => window.clearTimeout(t);
  }, [pausaAte]);

  /* a lista que está NA TELA: parada enquanto o ponteiro ou o foco estão no cartão */
  const [exibidos, setExibidos] = useState<Aviso[]>(avisos);
  const segurando = useRef(false);
  useEffect(() => {
    if (segurando.current) {
      /* parado: só tira o que deixou de valer (visto, saiu da prioridade), nunca põe nem troca a ordem */
      setExibidos((atual) => atual.filter((x) => avisos.some((a) => a.id === x.id)));
    } else setExibidos(avisos);
  }, [avisos]);
  const soltar = useCallback(() => { segurando.current = false; setExibidos(avisos); }, [avisos]);

  const visivel = ativo && exibidos.length > 0 && !oculto && !ocupado && !pausaAte;
  const base = useBase(visivel);
  const agora = useAgora(visivel);
  useNotificacaoDoNavegador(avisos, ativo);

  /* o leitor de tela: a região viva fica SEMPRE montada e o texto muda quando muda o que está na frente */
  const anuncio = visivel ? anuncioDoAviso(exibidos) : '';
  const [falado, setFalado] = useState('');
  useEffect(() => { setFalado(anuncio); }, [anuncio]);

  const resumo = exibidos.length >= RESUMO_A_PARTIR;
  return (
    <>
      <div className="ivs-sr" role="status" aria-live="polite">{falado}</div>
      {visivel && (
        <div className="ivs-caixa" style={{ '--ivs-base': `${base}px` } as CSSProperties}
          onPointerEnter={() => { segurando.current = true; }}
          onPointerLeave={() => { if (!document.activeElement?.closest('.ivs-caixa')) soltar(); }}
          onFocus={() => { segurando.current = true; }}
          onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null) && !e.currentTarget.matches(':hover')) soltar(); }}>
          <CartaoAvisoIris
            avisos={exibidos}
            agora={agora}
            aoOk={(ids) => marcarVistos(ids)}
            aoConversa={(a) => {
              marcarVistos([a.id]);
              navigate(a.conversaId ? `/whatsapp?conversa=${encodeURIComponent(a.conversaId)}` : '/whatsapp');
            }}
            aoVerFila={(a) => {
              marcarVistos(resumo ? exibidos.map((x) => x.id) : a ? [a.id] : []);
              setPausaAte(Date.now() + PAUSA_VER_FILA_MS);
              navigate(a && !resumo ? `/fila-iris?cliente=${encodeURIComponent(a.contatoId)}` : '/fila-iris');
            }}
          />
        </div>
      )}
    </>
  );
}
