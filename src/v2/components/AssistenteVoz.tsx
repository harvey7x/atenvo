import { useEffect, useRef, type RefObject } from 'react';
import { criarAnimacao } from './bomDiaAnimacao';
import { criarMedidor, quadroLento } from '../lib/bomDia';
import { MENSAGENS_ERRO_VOZ, textoDaFase, textoDoFim } from '../lib/assistenteVoz';
import type { EstadoVoz, SessaoVoz } from '../lib/assistenteVozSessao';

/* ==================================================================
   O CARTÃO DE VOZ (dono 30/10: "quero por voz mesmo… que nem no
   ChatGPT, quando a gente pega no modo de fala"). Flutua no canto
   inferior direito, no lugar do balão (mesma regra do compositor do
   WhatsApp): vidro escuro, preto e branco, ~340×420.
   - No alto, a ESFERA LÍQUIDA do bom dia (bomDiaAnimacao.ts, WebGL; sem
     WebGL a esfera de CSS do balão) reagindo à voz dela e, de leve, à
     sua. Um laço de quadro só; no Leve (ou reduzir movimento) fica numa
     pose parada; máquina que não aguenta baixa a resolução e depois para.
   - Uma linha de estado: Conectando… · Ouvindo · Consultando o sistema… ·
     Falando (· Microfone desligado).
   - A legenda do que ela fala (2–3 linhas; as palavras acendem quando a
     voz passa por elas) e, menor e em cinza, o que você disse.
   - "Abrir conversa · {cliente}" quando a ferramenta trouxe clientes.
   - Microfone (mudo) e Encerrar; Esc encerra. Erro e fim: a frase e
     "Tentar de novo" / "Falar de novo" + "Fechar".
   ================================================================== */

const ehLeve = () => document.documentElement.getAttribute('data-perf') === 'lite'
  || !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** O foco vai para o cartão ao ABRIR (o clique foi no balão ou em "Falar de novo") e, quando a conversa acaba
    sozinha, SÓ se a pessoa ainda estava no cartão (ou em lugar nenhum). Quem voltou a digitar para o cliente
    continua digitando: o Espaço ou o Enter do compositor não podem cair em "Falar de novo" (abriria o microfone
    e gastaria uma conversa do dia). */
export function focoVaiParaOCartao(p: { abrindo: boolean; ativo: { tagName?: string } | null; dentroDoCartao: boolean }): boolean {
  return p.abrindo || p.dentroDoCartao || !p.ativo || p.ativo.tagName === 'BODY';
}

/** A esfera: um canvas por sessão (o StrictMode monta 2x; destruir() solta o contexto WebGL). */
function useEsferaVoz(caixaRef: RefObject<HTMLDivElement>, corpoRef: RefObject<HTMLDivElement>, sessao: SessaoVoz, parada: boolean) {
  const paradaRef = useRef(parada);
  paradaRef.current = parada;
  const acordarRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    const caixa = caixaRef.current;
    const corpo = corpoRef.current;
    if (!caixa || !corpo) return;
    const tela = document.createElement('canvas');
    tela.className = 'ast-voz-tela';
    corpo.prepend(tela);
    let leve = ehLeve();
    const anim = criarAnimacao(tela, {
      leve,
      aoMudar: (viva) => { caixa.classList.toggle('ast-sem-gl', !viva); acordarRef.current(); },
    });
    const niv = { g: 0, m: 0, a: 0, geral: 0, lento: 0 };
    let abre = leve ? 1 : 0;
    let raf = 0;
    let antes = 0;
    let rel = 0;
    let escrito = '';
    let posada = false;
    const vigia = { medidor: criarMedidor(), desde: 0, ruins: 0, dprBaixo: false, fixa: false };

    const escrever = (v: number) => {
      const t = v.toFixed(3);
      if (t === escrito) return;
      escrito = t;
      caixa.style.setProperty('--ast-nivel', t);
    };
    const laco = (ms: number) => {
      raf = 0;
      const dtMs = antes ? ms - antes : 0;
      const dt = antes ? Math.min(0.05, Math.max(0, dtMs / 1000)) : 1 / 60;
      antes = ms;
      rel += dt;
      const b = sessao.bandas(dt);
      // a voz dela move a esfera; a sua, de leve
      const alvo = { g: Math.max(b.g, 0.3 * b.entrada), m: Math.max(b.m, 0.34 * b.entrada), a: Math.max(b.a, 0.18 * b.entrada) };
      const seg = (v: number, a: number, sobe: number, desce: number) => v + (a - v) * (1 - Math.exp(-dt * (a > v ? sobe : desce)));
      niv.g = seg(niv.g, alvo.g, 14, 5);
      niv.m = seg(niv.m, alvo.m, 16, 6);
      niv.a = seg(niv.a, alvo.a, 20, 7.5);
      niv.geral = seg(niv.geral, 0.45 * alvo.g + 0.4 * alvo.m + 0.15 * alvo.a, 12, 5);
      niv.lento = seg(niv.lento, niv.geral, 2.2, 1.4);
      abre = Math.min(1, abre + dt / 1.1);

      const estatica = leve || vigia.fixa || !anim.viva();
      if (estatica) {
        if (!posada) { anim.pose({ recolhe: 0 }); posada = true; }
        if (leve) { escrever(0); return; }      // Leve: pose parada, o laço dorme
      } else {
        posada = false;
        anim.quadro(niv.geral, { grave: niv.g, medio: niv.m, agudo: niv.a }, rel, { abre, recolhe: 0, brilho: 0, lento: niv.lento });
        // vigia de quadro (o do bom dia): janela lenta → DPR 1; mais duas → pose parada
        if (!document.hidden && rel - vigia.desde > 2) {
          const lento = quadroLento(vigia.medidor, dtMs);
          if (lento === false) vigia.ruins = 0;
          else if (lento === true) {
            if (!vigia.dprBaixo) { vigia.dprBaixo = true; anim.tamanho(false, 1); }
            else if (++vigia.ruins >= 2) { vigia.fixa = true; console.warn('assistente voz: quadro lento, a esfera fica parada'); }
          }
        }
      }
      escrever(niv.geral);
      // encerrada ou com erro: a esfera assenta e o laço dorme
      if (paradaRef.current && niv.geral < 0.004 && niv.lento < 0.004 && abre >= 1) { antes = 0; return; }
      raf = requestAnimationFrame(laco);
    };
    const acordar = () => { posada = false; if (!raf) raf = requestAnimationFrame(laco); };
    acordarRef.current = acordar;
    acordar();
    const obs = new MutationObserver(() => {
      const l = ehLeve();
      if (l === leve) return;
      leve = l;
      if (leve) abre = 1;
      anim.tamanho(leve);
      acordar();
    });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-perf'] });
    // a caixa muda de tamanho (janela baixa, compositor crescendo): o canvas é refeito no tamanho novo
    let lado = caixa.offsetWidth;
    const ro = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => { if (caixa.offsetWidth === lado) return; lado = caixa.offsetWidth; anim.tamanho(leve); acordar(); })
      : null;
    ro?.observe(caixa);
    return () => {
      cancelAnimationFrame(raf);
      raf = 0;
      acordarRef.current = () => undefined;
      obs.disconnect();
      ro?.disconnect();
      anim.destruir();
      tela.remove();
    };
  }, [caixaRef, corpoRef, sessao]);

  // voltou a falar depois de assentar (não acontece numa sessão encerrada, mas o laço acorda se precisar)
  useEffect(() => { if (!parada) acordarRef.current(); }, [parada]);
}

/* ------------------------------------------------------------------ ícones (traço fino, sem emoji) */

const IconeMic = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="9" y="3" width="6" height="11.5" rx="3" />
    <path d="M5.5 11.5a6.5 6.5 0 0013 0M12 18v3" />
  </svg>
);
const IconeMicMudo = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M15 9.4V6a3 3 0 00-5.6-1.5M9 9v2.5a3 3 0 004.9 2.3" />
    <path d="M18.5 11.5a6.5 6.5 0 01-.9 3.3M5.5 11.5a6.5 6.5 0 009.9 5.5M12 18v3M4 4l16 16" />
  </svg>
);
const IconeEncerrar = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
    <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />
  </svg>
);
const IconeAbrir = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M7 17L17 7M9 7h8v8" />
  </svg>
);

/* ------------------------------------------------------------------ o cartão */

export interface PropsCartaoVoz {
  sessao: SessaoVoz;
  estado: EstadoVoz;
  /** encerrar (botão, Esc) ou fechar depois do fim/erro */
  aoFechar: () => void;
  /** "Tentar de novo" / "Falar de novo": a sessão nova nasce NESTE clique (o áudio precisa do gesto) */
  aoRecomecar: () => void;
  aoAbrirLink: (rota: string) => void;
  /** o ponteiro entrou/saiu do cartão (o fim sozinho espera ele sair para fechar) */
  aoPassar?: (sobre: boolean) => void;
  cartaoRef?: RefObject<HTMLDivElement>;
}

export function CartaoVoz({ sessao, estado, aoFechar, aoRecomecar, aoAbrirLink, aoPassar, cartaoRef }: PropsCartaoVoz) {
  const caixaRef = useRef<HTMLDivElement>(null);
  const corpoRef = useRef<HTMLDivElement>(null);
  const acoesRef = useRef<HTMLDivElement>(null);
  const montadoRef = useRef(false);
  const { fase } = estado;
  const final = fase === 'encerrada' || fase === 'erro';
  useEsferaVoz(caixaRef, corpoRef, sessao, final);

  // abriu: o foco vai para o primeiro botão do rodapé; acabou: só se a pessoa ainda estava no cartão
  useEffect(() => {
    const abrindo = !montadoRef.current || !final;
    montadoRef.current = true;
    const acoes = acoesRef.current;
    const ativo = document.activeElement;
    const cartao = acoes?.closest('.ast-voz') ?? null;
    if (!focoVaiParaOCartao({ abrindo, ativo, dentroDoCartao: !!ativo && !!cartao?.contains(ativo) })) return;
    const b = acoes?.querySelector<HTMLButtonElement>('button');
    window.requestAnimationFrame(() => b?.focus({ preventScroll: true }));
  }, [final]);

  const msg = estado.erro ? MENSAGENS_ERRO_VOZ[estado.erro] : null;
  const podeRecomecar = fase === 'encerrada' || !!msg?.tentar;

  return (
    <div
      ref={cartaoRef}
      className="ast-voz"
      role="dialog"
      aria-modal="false"
      aria-label="Assistente de voz"
      data-fase={fase}
      data-mudo={estado.mudo ? 'sim' : undefined}
      onPointerEnter={() => aoPassar?.(true)}
      onPointerLeave={() => aoPassar?.(false)}
      onKeyDown={(e) => {
        if (e.key !== 'Escape' || e.defaultPrevented) return;
        // o Esc é do cartão: não sobe para o document (lá o WhatsApp desliga o "Modo de foco" no Esc)
        e.preventDefault();
        e.stopPropagation();
        aoFechar();
      }}
    >
      <div className="ast-voz-topo" aria-hidden><span className="ast-voz-marca">Assistente</span></div>

      <div className="ast-voz-esfera" ref={caixaRef} aria-hidden>
        <div className="ast-voz-corpo" ref={corpoRef}>
          <span className="ast-esfera ast-voz-estatica"><span className="ast-esfera-giro" /></span>
        </div>
      </div>

      {/* no fim e no erro a frase vem no aviso logo abaixo: a linha de estado fica só para o leitor de tela */}
      <p className="ast-voz-estado" role="status" aria-live="polite">
        {!final && <i className="ast-voz-ponto" aria-hidden />}
        <span className={final ? 'ast-sr' : undefined}>{textoDaFase(fase, estado.mudo)}</span>
      </p>

      <div className="ast-voz-meio">
        {final ? (
          <div className="ast-voz-aviso" role={fase === 'erro' ? 'alert' : undefined}>
            <p className="ast-voz-titulo">{msg ? msg.titulo : 'Conversa encerrada'}</p>
            <p className="ast-voz-texto">{msg ? msg.texto : estado.fim ? textoDoFim(estado.fim, estado.limiteS) : ''}</p>
          </div>
        ) : (
          <>
            <div className="ast-voz-legenda" aria-hidden>
              <span className="ast-voz-linhas">
                {estado.palavras.map((p, i) => (
                  <span key={i} className={p.dita ? 'ast-dita' : undefined}>{`${i > 0 ? ' ' : ''}${p.texto}`}</span>
                ))}
              </span>
            </div>
            {estado.voce && <p className="ast-voz-voce">{`“${estado.voce}”`}</p>}
          </>
        )}
      </div>

      <div className="ast-voz-links">
        {!final && estado.links.map((l) => (
          <button key={l.rota} type="button" className="ast-voz-link" onClick={() => aoAbrirLink(l.rota)}>
            <IconeAbrir /><span>Abrir conversa · {l.rotulo}</span>
          </button>
        ))}
      </div>

      <div className="ast-voz-acoes" ref={acoesRef}>
        {final ? (
          <>
            {podeRecomecar && (
              <button type="button" className="ast-voz-botao ast-voz-botao-forte" onClick={aoRecomecar}>
                {fase === 'erro' ? 'Tentar de novo' : 'Falar de novo'}
              </button>
            )}
            <button type="button" className="ast-voz-botao" onClick={aoFechar}>Fechar</button>
          </>
        ) : (
          <>
            {/* botão de alternar: o nome fica FIXO e o estado vai no aria-pressed (o leitor diz "pressionado" =
                microfone silenciado); só a dica do mouse muda */}
            <button
              type="button"
              className="ast-voz-mic"
              aria-pressed={estado.mudo}
              aria-label="Silenciar o microfone"
              title={estado.mudo ? 'Ligar o microfone' : 'Desligar o microfone'}
              onClick={() => sessao.alternarMudo()}
            >
              {estado.mudo ? <IconeMicMudo /> : <IconeMic />}
            </button>
            <button type="button" className="ast-voz-fim" onClick={aoFechar} aria-label="Encerrar a conversa" title="Encerrar (Esc)">
              <IconeEncerrar />
            </button>
          </>
        )}
      </div>

      {/* o leitor de tela ouve a fala inteira quando ela termina (a legenda palavra a palavra fica oculta para ele) */}
      <span className="ast-sr" aria-live="polite">{estado.falaConcluida}</span>
    </div>
  );
}
