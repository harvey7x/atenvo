import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useAvisosMarcacao } from '../pages/filaIris/avisosMarcacao';
import { curtoDaVencida, TEXTO_VENCIDA, type AvisoVencida, type ResultadoAviso } from '../pages/filaIris/avisosTexto';
import { CartaoMarcacaoVencida, FRASE_DO_RESULTADO, anuncioDaVencida } from './CartaoMarcacaoVencida';
import { useAgoraNoCanto, useOcupadoNoCanto } from './AvisoIris';
import { useConversaAberta } from './AvisoRecado';

/* ==================================================================
   A MARCAÇÃO VENCIDA NO MEIO DA TELA (dono 16/11: "quando o prazo terminar tem que enviar uma notificação pro
   atendente" + "aviso tem que ser no meio da tela, obrigando a atualizar"), montado no shell, em qualquer página,
   para o dono do cliente:
   - véu + cartão no meio, o foco no cartão e o Tab preso nele; nenhuma tecla chega à página de trás. Uma marcação
     por vez ("1 de N"; as do mesmo cliente juntas, o cliente que venceu primeiro na frente). NÃO FECHA: sem Ok, sem
     ×, o Esc não some com ele, clicar fora não faz nada. Sai só quando a marcação é ATUALIZADA ("O que foi feito?"
     → Salvar; o prazo recomeça) ou TIRADA ("Já resolvi"). Aí vem a próxima.
   - Para conferir antes de escrever: "Abrir a conversa" (o aviso espera enquanto a conversa do cliente estiver
     aberta, e mais 1 min depois de sair dela) e "Ver na fila" (a ficha do cliente; o aviso espera a ficha fechar).
   - Espera o recado do administrador e a mensagem do Murillo (os dois no meio da tela, que vêm antes), o bom dia, o
     cartão de voz, a ficha do cliente, qualquer janela/menu aberto, a gravação de áudio e quem está ESCREVENDO no
     WhatsApp (até 30 s sem digitar) — não toma o foco no meio da frase. O que estava escrito no "O que foi feito?"
     não se perde quando ele cede a vez.
   - Com o Atenvo em outra aba: a notificação do navegador para cada vencida NOVA (só com a permissão já dada).
   ================================================================== */
const SAIU_DA_CONVERSA_MS = 60_000;
/** depois de "Abrir a conversa"/"Ver na fila": o aviso espera a página trocar (sem piscar no meio do caminho) */
const INDO_MS = 3_000;
/** uma janela acabou de fechar (a ficha, uma confirmação): o que foi feito nela (o +1, o ×, tirar da fila) chega ao
    aviso em instantes — ele espera esse tanto e não volta para o que acabou de ser resolvido */
const DEPOIS_DA_JANELA_MS = 1_200;
const ESCREVENDO_MS = 30_000;
/** outra janela/tela na frente: o foco é dela (nunca devolvido para a página de trás, por baixo dela) */
const OUTRA_JANELA = '[aria-modal="true"], .mvc-veu, .rcd-veu, .gva-tk, .bd-veu, .rdr-central, .fi-veu, .veu, .p-modal, .atv-modal-overlay, .apres';
/** o gravador de áudio do WhatsApp com um áudio no caminho: pedindo o microfone, gravando/pausado, o áudio gravado
    para ouvir antes de mandar, enviando, ou o envio que falhou com o áudio guardado ("Tentar novamente", .btn-pri). O
    erro SEM áudio (microfone negado, em uso, sem microfone) não segura o aviso: o painel ficaria na tela sem fim
    (revisão). Sem :has() — no querySelector ele quebraria nos navegadores sem suporte */
const GRAVANDO = '.arec-panel .arec-dot, .arec-panel .arec-preview, .arec-panel .arec-info, .arec-panel .btn-pri';
/** o que este aviso espera, além das janelas da Fila/v1 e do bom dia/voz (useOcupadoNoCanto): os dois do meio da tela
    (.rcd-veu: o recado e a mensagem do Murillo — o véu deste é .mvc-veu, que eles não esperam: nada de piscar), os
    menus/painéis em portal por cima do shell (a mesma lista da mensagem do Murillo), a gravação de áudio e o modo
    Apresentar dos Relatórios (.apres: tela cheia por cima de tudo — por baixo dela o aviso ficaria invisível e
    engoliria as setas e o Esc da apresentação). A tela cheia do navegador (o vídeo do cliente) vem de useTelaCheia */
const ESPERA = `.veu, .rcd-veu, .rdr-central, .pd-ed, .drawer-v2, .um-backdrop, .spl, .wa-pop, .wa-etqpop, .kb-menu, .alq-veu, .cor-pop, .apres, ${GRAVANDO}`;
/** outro diálogo ou tela cheia por cima (o recado que chegou agora, uma janela, a apresentação, o vídeo em tela cheia):
    as teclas e o foco são dele */
const emOutraJanela = (el: Element | null) => !!el?.closest('[aria-modal="true"]:not(.mvc-veu), .apres')
  || (!!el && typeof document !== 'undefined' && !!document.fullscreenElement && document.fullscreenElement.contains(el));

/** algo em tela cheia do navegador (o vídeo da conversa pelo botão do player): por baixo dela o aviso ficaria invisível
    e engoliria as teclas do player — espera sair da tela cheia (revisão) */
function useTelaCheia(ativo: boolean): boolean {
  const [cheia, setCheia] = useState(false);
  useEffect(() => {
    if (!ativo || typeof document === 'undefined') { setCheia(false); return; }
    const conferir = () => setCheia(!!document.fullscreenElement);
    conferir();
    document.addEventListener('fullscreenchange', conferir);
    return () => document.removeEventListener('fullscreenchange', conferir);
  }, [ativo]);
  return cheia;
}
const useLayoutIso = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/** escrevendo uma mensagem no WhatsApp (digitou há menos de 30 s e ela ainda não saiu): o aviso espera */
function useEscrevendoNoWhats(ativo: boolean): boolean {
  const [escrevendo, setEscrevendo] = useState(false);
  const ultimo = useRef(0);
  useEffect(() => {
    if (!ativo) { setEscrevendo(false); return; }
    const aoDigitar = (e: Event) => {
      if (!(e.target instanceof Element) || !e.target.closest('.wa-composer')) return;
      ultimo.current = Date.now();
      setEscrevendo(true);
    };
    const conferir = () => {
      const texto = document.querySelector<HTMLTextAreaElement>('.wa-composer textarea')?.value.trim();
      if (!texto || Date.now() - ultimo.current > ESCREVENDO_MS) setEscrevendo(false);
    };
    document.addEventListener('input', aoDigitar, true);
    const iv = window.setInterval(conferir, 2000);
    return () => { document.removeEventListener('input', aoDigitar, true); window.clearInterval(iv); };
  }, [ativo]);
  return escrevendo;
}

/** com o Atenvo em outra aba: a notificação do navegador para cada vencida NOVA (a 1ª leitura não conta) */
function useNotificacaoVencida(avisos: AvisoVencida[], ativo: boolean): void {
  const avisados = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!ativo) return;
    if (avisados.current === null) { avisados.current = new Set(avisos.map((a) => a.id)); return; }
    const novos = avisos.filter((a) => !avisados.current!.has(a.id));
    for (const a of novos) avisados.current.add(a.id);
    if (!novos.length || typeof document === 'undefined' || !document.hidden) return;
    try {
      if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
      const a = novos[0];
      /* "e mais N" conta CLIENTES (um aviso é uma marcação; um cliente pode ter duas) */
      const outros = new Set(novos.map((x) => x.contatoId)).size - 1;
      const doPrimeiro = novos.filter((x) => x.contatoId === a.contatoId).map(curtoDaVencida).join(', ');
      const n = new Notification(TEXTO_VENCIDA.marca, {
        body: outros > 0 ? `${a.nome} e mais ${outros} ${outros === 1 ? 'cliente' : 'clientes'}` : `${a.nome} · ${doPrimeiro}`,
        tag: `atenvo-vencida-${a.id}`,
        icon: '/icons/pwa-192.png',
      });
      n.onclick = () => { try { window.focus(); } catch { /* o navegador decide */ } n.close(); };
    } catch { /* sem notificação do navegador: o aviso aparece ao voltar */ }
  }, [avisos, ativo]);
}

/** montado no shell: os meus avisos de marcação vencida, no meio da tela, até cada marcação ser atualizada ou tirada */
export function AvisoMarcacao({ oculto = false, acesso }: { oculto?: boolean; acesso: boolean | null }) {
  const ativo = acesso === true;
  const { user } = useAuth();
  const { avisos, pronto, atualizar, tirar } = useAvisosMarcacao(ativo);
  const navigate = useNavigate();
  const frente = avisos[0];
  const tem = ativo && avisos.length > 0;

  /* a conversa do cliente da frente aberta: o aviso espera (ele está nela, talvez cobrando o que a marcação pede). Ao
     sair dela, espera mais 1 min — já nesta pintura, sem piscar (a regra do recado do administrador) */
  const aberta = useConversaAberta(tem);
  const naConversa = !!frente?.conversaId && frente.conversaId === aberta;
  const estava = useRef<string | null>(null);
  if (naConversa && frente) estava.current = frente.contatoId;
  const saiuAgora = !naConversa && estava.current !== null;
  const [esperaAte, setEsperaAte] = useState(0);
  useLayoutIso(() => {
    if (!saiuAgora) return;
    estava.current = null;
    setEsperaAte((x) => Math.max(x, Date.now() + SAIU_DA_CONVERSA_MS));
  }, [saiuAgora]);
  /* uma janela acabou de fechar: espera um pouco, já nesta pintura (o aviso do que foi resolvido nela está saindo) */
  const ocupadoNaTela = useOcupadoNoCanto(tem, ESPERA);
  const telaCheia = useTelaCheia(tem);
  const ocupado = ocupadoNaTela || telaCheia;
  const vinhaOcupado = useRef(false);
  if (ocupado) vinhaOcupado.current = true;
  const saiuDaJanela = !ocupado && vinhaOcupado.current;
  useLayoutIso(() => {
    if (!saiuDaJanela) return;
    vinhaOcupado.current = false;
    setEsperaAte((x) => Math.max(x, Date.now() + DEPOIS_DA_JANELA_MS));
  }, [saiuDaJanela]);
  /* a espera vence no segundo certo */
  const [, setTique] = useState(0);
  useEffect(() => {
    if (esperaAte <= Date.now()) return;
    const t = window.setTimeout(() => setTique((x) => x + 1), esperaAte - Date.now() + 50);
    return () => window.clearTimeout(t);
  }, [esperaAte]);
  const esperando = naConversa || saiuAgora || saiuDaJanela || esperaAte > Date.now();

  const escrevendo = useEscrevendoNoWhats(ativo);
  const centro = tem && !oculto && !ocupado && !escrevendo && !esperando;
  const agora = useAgoraNoCanto(centro);
  useNotificacaoVencida(avisos, ativo && pronto);

  /* o que foi escrito em "O que foi feito?" fica guardado por aviso: o cartão sai quando cede a vez (um recado, a
     mensagem do Murillo, o Radar, uma janela) e volta com o texto */
  const rascunhos = useRef(new Map<string, string>());

  /* o retorno de cada ação */
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => { if (!toast) return; const t = window.setTimeout(() => setToast(null), 4800); return () => window.clearTimeout(t); }, [toast]);
  const terminou = (r: ResultadoAviso, a: AvisoVencida) => { rascunhos.current.delete(a.id); setToast(FRASE_DO_RESULTADO[r]); };

  /* no meio da tela: o foco entra no cartão (não num botão: Enter/espaço sem querer não age), o Tab não sai dele e,
     quando o último sai por uma ação na mesma tela (salvar, tirar), volta para onde estava. "Abrir a conversa" e
     "Ver na fila" trocam de página: o "onde estava" não vale mais. */
  const veu = useRef<HTMLDivElement>(null);
  const focoAntes = useRef<HTMLElement | null>(null);
  const devolverFoco = useRef(false);
  /* quantas ainda estão vencidas: o cartão que só CEDEU A VEZ (o Radar, o bom dia, uma janela) não devolve o foco para
     a página de trás — ele iria parar por baixo da tela nova (um Enter ali mandaria o rascunho do WhatsApp) */
  const restam = useRef(0);
  restam.current = avisos.length;
  useEffect(() => {
    if (!centro) return;
    const antes = document.activeElement;
    focoAntes.current = antes instanceof HTMLElement && antes !== document.body ? antes : null;
    devolverFoco.current = false;
    return () => {
      const el = focoAntes.current;
      const devolver = devolverFoco.current;
      focoAntes.current = null;
      devolverFoco.current = false;
      /* só quando o ÚLTIMO saiu por uma ação daqui (salvar, tirar) e nada abriu na frente */
      if (!devolver || restam.current > 0 || !el || !document.contains(el) || document.querySelector(OUTRA_JANELA)) return;
      try { el.focus({ preventScroll: true }); } catch { /* segue */ }
    };
  }, [centro]);
  useEffect(() => {
    if (!centro) return;
    /* a próxima vencida veio para a frente: o "devolver o foco" da que saiu não vale mais (só o da última) */
    devolverFoco.current = false;
    const t = window.setTimeout(() => {
      if (emOutraJanela(document.activeElement)) return;
      veu.current?.querySelector<HTMLElement>('.rcd-aviso')?.focus({ preventScroll: true });
    }, 0);
    return () => window.clearTimeout(t);
  }, [centro, frente?.id]);
  /* o Tab preso no cartão — menos quando outro diálogo chegou por cima (o recado: o foco é dele) */
  useEffect(() => {
    if (!centro) return;
    const h = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const raiz = veu.current;
      if (!raiz || document.querySelector('.rcd-veu')) return;
      const atual = document.activeElement as HTMLElement | null;
      if (atual && emOutraJanela(atual)) return;
      const focos = [...raiz.querySelectorAll<HTMLElement>('button:not([disabled]), textarea:not([disabled])')];
      if (!focos.length) return;
      if (!atual || !raiz.contains(atual)) { e.preventDefault(); focos[0].focus(); return; }
      const i = focos.indexOf(atual);
      if (e.shiftKey && i <= 0) { e.preventDefault(); focos[focos.length - 1].focus(); }
      else if (!e.shiftKey && i === focos.length - 1) { e.preventDefault(); focos[0].focus(); }
    };
    document.addEventListener('keydown', h, true);
    return () => document.removeEventListener('keydown', h, true);
  }, [centro]);
  /* nenhuma tecla chega à página de trás (o foco fora do cartão — clique no fundo, um atalho que puxou o foco — volta
     para ele; os atalhos da Fila, do Remarketing e o compositor do WhatsApp não recebem o que a pessoa digita sem ver).
     Os atalhos do NAVEGADOR (recarregar, copiar, F5…) continuam valendo. O Tab fica com a trava acima; um diálogo por
     cima é dele. Dentro do cartão, ele mesmo segura as teclas (CartaoMarcacaoVencida). */
  useEffect(() => {
    if (!centro) return;
    const h = (e: KeyboardEvent) => {
      const raiz = veu.current;
      const alvo = e.target instanceof Element ? e.target : null;
      if (!raiz || e.key === 'Tab' || document.querySelector('.rcd-veu') || (alvo && (raiz.contains(alvo) || emOutraJanela(alvo)))) return;
      e.stopImmediatePropagation();
      if (!(e.metaKey || e.ctrlKey || e.altKey || /^F\d{1,2}$/.test(e.key))) e.preventDefault();
      raiz.querySelector<HTMLElement>('.rcd-aviso')?.focus({ preventScroll: true });
    };
    window.addEventListener('keydown', h, true);
    return () => window.removeEventListener('keydown', h, true);
  }, [centro]);

  /* o leitor de tela: a região viva fica sempre montada */
  const anuncio = centro ? anuncioDaVencida(frente, avisos.length) : '';
  const [falado, setFalado] = useState('');
  useEffect(() => { setFalado(anuncio); }, [anuncio]);

  const sair = (para: string, frase?: string) => {
    devolverFoco.current = false;
    focoAntes.current = null;
    setEsperaAte((x) => Math.max(x, Date.now() + INDO_MS));
    if (frase) setToast(frase);
    navigate(para);
  };

  return (
    <>
      <div className="ivs-sr" role="status" aria-live="polite">{falado}</div>
      {centro && frente && (
        <div ref={veu} className="mvc-veu" role="dialog" aria-modal="true" aria-label={`${TEXTO_VENCIDA.marca}: ${frente.nome}`}
          onMouseDown={(e) => { if (e.target === e.currentTarget) e.preventDefault(); /* clicar no fundo não tira o foco do cartão */ }}>
          <div className="mvc-caixa">
            <CartaoMarcacaoVencida key={frente.id} aviso={frente} total={avisos.length} agora={agora} euId={user?.id}
              rascunho={rascunhos.current.get(frente.id) ?? ''}
              aoMudarRascunho={(t) => { if (t) rascunhos.current.set(frente.id, t); else rascunhos.current.delete(frente.id); }}
              aoSalvar={async (texto) => {
                /* marcado antes: o cartão pode sair antes da volta do await */
                devolverFoco.current = true;
                try { terminou(await atualizar(frente, texto), frente); } catch (e) { devolverFoco.current = false; throw e; }
              }}
              aoTirar={async () => {
                devolverFoco.current = true;
                try { terminou(await tirar(frente), frente); } catch (e) { devolverFoco.current = false; throw e; }
              }}
              aoVerNaFila={() => sair(`/fila-iris?cliente=${encodeURIComponent(frente.contatoId)}`)}
              aoAbrirConversa={frente.conversaId
                ? () => sair(`/whatsapp?conversa=${encodeURIComponent(frente.conversaId!)}`, 'Confira a conversa: o aviso volta quando você sair dela.')
                : undefined} />
          </div>
        </div>
      )}
      {toast && <div className="rcd-toast" role="status">{toast}</div>}
    </>
  );
}
