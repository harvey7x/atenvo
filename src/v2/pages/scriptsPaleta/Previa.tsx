import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useOrg } from '@/context/OrgContext';
import { SCRIPTS_REAL, fetchEtapas, urlAssinadaAnexo, type EtapaTipo, type VarCtx } from '@/data/scripts';
import { BotaoPrimario, BotaoSec, Skeleton } from '../../components';
import type { UltimaDoCliente } from './conversa';
import { ETAPAS_DEMO } from './demoEtapas';
import type { ResumoEtapas } from '../../hooks/scriptsResumo';
import {
  chaveEtapas, composicaoDasEtapas, duracaoPt, etapasDoResumo, etapasParaPrevia, extensaoDe, partesNome,
  rotuloComposicaoNaOrdem, rotuloMensagens, tamanhoPt, tipoDocumento, ROTULO_TIPO, type EtapaPrevia,
} from './etapas';
import { IcAbaixo, IcAlerta, IcAudio, IcCelular, IcEnter, IcEstrela, IcPessoa, IcTipo } from './icones';
import type { ItemIndice } from './organizar';
import { bordasRolagem } from './rolagem';
import { destacar, type Pedaco } from './texto';
import { faltasDoTexto, montarTrechos, segmentarVariaveis, type Trecho } from './variaveis';

/* ------------------------------------------------------------------
   PRÉVIA do script realçado — a sequência como o cliente vai receber:
   bolhas de SAÍDA à direita com o número GRUDADO nelas (coluna do lado
   da âncora, trilho vertical ligando a sequência), variáveis JÁ
   preenchidas com o MESMO ctx do compositor (sublinhado pontilhado);
   variável sem valor = o nome humano em âmbar ("valor da parcela") + UM
   aviso discreto abaixo da bolha. Mídia: a linha do arquivo (ícone,
   nome, tipo·duração·tamanho) dentro da própria bolha; com legenda, a
   legenda vem embaixo separada por um fio — nunca caixa dentro de caixa.
   ORÇAMENTO VERTICAL: cabeçalho compacto (título · UMA linha de meta
   com msgs, composição, categoria e #tags · descrição em 1 linha) e o
   que o cliente acabou de dizer numa FAIXA de 1 linha (abre ao clicar)
   — a sequência fica com a altura.
   Rolagem: esmaece só os últimos 28px; "+N mensagens abaixo" conta só
   as TOTALMENTE escondidas; cartão de mídia cortado no meio faz a vista
   terminar antes dele (corte alinhado, sem esmaecer o cartão).
   Selecionar NUNCA envia: "Usar este script" abre o compositor completo.
   Dados: desenhada NA HORA pelo resumo da org (tipo, nome e texto de
   cada mensagem) e enriquecida quando fetchEtapas chega (tamanho,
   duração, miniatura) — ['script-etapas', org, id, atualizadoEm] com
   debounce de 120ms; a paleta pré-busca os vizinhos ±1.
   ------------------------------------------------------------------ */

export function Marcas({ pedacos }: { pedacos: Pedaco[] }) {
  return <>{pedacos.map((p, i) => (p.m ? <mark key={i} className="spl-mark">{p.t}</mark> : <span key={i}>{p.t}</span>))}</>;
}

function useEtapasPrevia(it: ItemIndice | null, provisorias: EtapaPrevia[] | null) {
  const { currentOrg } = useOrg();
  const orgId = currentOrg?.id ?? null;
  const id = it?.s.id ?? null;
  const [alvo, setAlvo] = useState(id);
  useEffect(() => {
    if (id === alvo) return;
    const t = window.setTimeout(() => setAlvo(id), 120);
    return () => window.clearTimeout(t);
  }, [id, alvo]);
  const q = useQuery({
    queryKey: chaveEtapas(orgId, { id: id ?? '', atualizadoEm: it?.s.atualizadoEm }),
    queryFn: () => fetchEtapas(id!),
    enabled: SCRIPTS_REAL && !!orgId && !!id && alvo === id,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    retry: 1,
  });
  if (!SCRIPTS_REAL) return { etapas: (id ? (ETAPAS_DEMO[id] ?? []) : []) as EtapaPrevia[], provisoria: false, carregando: false, erro: false, tentar: () => {} };
  const reais = q.data as EtapaPrevia[] | undefined;
  return {
    // completas quando chegam; antes disso, a sequência desenhada pelo resumo (instantânea)
    etapas: reais ?? (q.isError ? undefined : provisorias ?? undefined),
    provisoria: !reais && !!provisorias,
    carregando: !reais && !q.isError,
    erro: q.isError && !reais,
    tentar: () => { void q.refetch(); },
  };
}

/* ---------- anexos: só quando o cartão entra na vista (lazy) ---------- */
function useVisivel(ref: RefObject<HTMLElement>, ativo: boolean): boolean {
  const [visivel, setVisivel] = useState(false);
  useEffect(() => {
    if (!ativo || visivel) return;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') { setVisivel(true); return; }
    const io = new IntersectionObserver((ents) => { if (ents.some((e) => e.isIntersecting)) { setVisivel(true); io.disconnect(); } }, { rootMargin: '80px' });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, ativo, visivel]);
  return visivel;
}

function useUrlAnexo(path: string | null, ativo: boolean) {
  return useQuery({
    queryKey: ['script-anexo-url', path],
    queryFn: () => urlAssinadaAnexo(path!),
    enabled: SCRIPTS_REAL && ativo && !!path,
    staleTime: 50 * 60_000,
    gcTime: 55 * 60_000,
    retry: 0,
  }).data ?? null;
}

/* Duração lida dos METADADOS do arquivo (preload="metadata": só o cabeçalho, sem baixar
   o áudio inteiro). Formato que o navegador não abre (ex.: .ogg no Safari) = sem duração. */
function lerDuracao(url: string, tipo: EtapaTipo): Promise<number | null> {
  return new Promise((resolve) => {
    const el = document.createElement(tipo === 'video' ? 'video' : 'audio');
    let feito = false;
    const fim = (v: number | null) => {
      if (feito) return;
      feito = true;
      window.clearTimeout(t);
      el.onloadedmetadata = null; el.onerror = null;
      el.removeAttribute('src');
      try { el.load(); } catch { /* sem efeito */ }
      resolve(v);
    };
    const t = window.setTimeout(() => fim(null), 8000);
    el.preload = 'metadata';
    el.muted = true;
    el.onloadedmetadata = () => fim(Number.isFinite(el.duration) && el.duration > 0 ? el.duration : null);
    el.onerror = () => fim(null);
    el.src = url;
  });
}

function useDuracao(e: EtapaPrevia, visivel: boolean): number | null {
  const temMidiaReal = (e.tipo === 'audio' || e.tipo === 'video') && !!e.storagePath && !e.storagePath.startsWith('demo/');
  const conhecida = typeof e.duracao === 'number' ? e.duracao : null;
  const url = useUrlAnexo(e.storagePath ?? null, temMidiaReal && visivel && conhecida === null);
  const q = useQuery({
    queryKey: ['script-anexo-duracao', e.storagePath],
    queryFn: () => lerDuracao(url!, e.tipo),
    enabled: !!url && conhecida === null,
    staleTime: Infinity,
    gcTime: 60 * 60_000,
    retry: 0,
  });
  return conhecida ?? q.data ?? null;
}

/* Nome do arquivo com reticência NO MEIO e a extensão sempre inteira, sem vão:
   mede com a fonte real (canvas) e corta a base no ponto exato. */
let medidor: CanvasRenderingContext2D | null = null;
function NomeArquivo({ nome }: { nome: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [txt, setTxt] = useState(nome);
  const ajustar = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const larg = el.clientWidth - 1;
    if (larg <= 0) return;
    medidor = medidor ?? document.createElement('canvas').getContext('2d');
    if (!medidor) { setTxt(nome); return; }
    const cs = window.getComputedStyle(el);
    medidor.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const cabe = (s: string) => medidor!.measureText(s).width <= larg;
    if (cabe(nome)) { setTxt(nome); return; }
    const { base, ext } = partesNome(nome);
    let lo = 1, hi = base.length - 1, melhor = 1;
    while (lo <= hi) {
      const m = (lo + hi) >> 1;
      if (cabe(base.slice(0, m).trimEnd() + '…' + ext)) { melhor = m; lo = m + 1; } else hi = m - 1;
    }
    setTxt(base.slice(0, melhor).replace(/[\s._-]+$/, '') + '…' + ext);
  }, [nome]);
  useLayoutEffect(() => { ajustar(); }, [ajustar]);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => ajustar());
    ro.observe(el);
    return () => ro.disconnect();
  }, [ajustar]);
  return <span ref={ref} className="spl-mid-nm" title={nome}>{txt}</span>;
}

const TIPO_CAP: Record<EtapaTipo, string> = { texto: 'Texto', audio: 'Áudio', imagem: 'Imagem', video: 'Vídeo', documento: 'Documento' };

/* Mídia = cartão de anexo (tile · nome · tipo, duração e tamanho), o mesmo formato para
   áudio, imagem, vídeo e documento. Sem play nem onda falsos: a prévia mostra O QUE sai —
   tocar/abrir é no compositor. Imagem real ganha miniatura; áudio/vídeo, a duração. */
function CartaoMidia({ e }: { e: EtapaPrevia }) {
  const ref = useRef<HTMLDivElement>(null);
  const real = !!e.storagePath && !e.storagePath.startsWith('demo/');
  const visivel = useVisivel(ref, SCRIPTS_REAL && real && e.tipo !== 'documento');
  const nome = e.nome || ROTULO_TIPO[e.tipo];
  const extDoc = e.tipo === 'documento' ? extensaoDe(e.nome, e.mime) : '';
  const duracao = useDuracao(e, visivel);
  const url = useUrlAnexo(e.storagePath ?? null, e.tipo === 'imagem' && real && visivel);
  const [falhou, setFalhou] = useState(false);
  const img = e.tipo === 'imagem' && url && !falhou ? url : null;
  const meta = [
    e.tipo === 'documento' ? tipoDocumento(extDoc) : TIPO_CAP[e.tipo],
    duracaoPt(duracao),
    tamanhoPt(e.tamanho),
  ].filter(Boolean).join(' · ');
  return (
    <div ref={ref} className={'spl-mid spl-mid-' + e.tipo}>
      <span className={'spl-mid-tile' + (img ? ' spl-com-img' : '')} aria-hidden>
        {img ? <img src={img} alt="" loading="lazy" decoding="async" onError={() => setFalhou(true)} /> : <IcTipo tipo={e.tipo} />}
        {extDoc && !img && <b>{extDoc}</b>}
      </span>
      <span className="spl-mid-inf">
        <NomeArquivo nome={nome} />
        <span className="spl-mid-mt">{meta}</span>
      </span>
    </div>
  );
}

/* Texto já preenchido: VARIÁVEL = sublinhado pontilhado discreto (sem caixa, sem padding: a
   pontuação cola — "Souza!"); sem valor = o nome humano em âmbar (o {{token}} só no title);
   BUSCA = marca forte (fundo de acento) — nunca o mesmo tipo de caixa. `semNegrito` = linha
   de apoio da lista (12px apagado: o *negrito* do WhatsApp não pesa ali). */
export function TextoRico({ trechos, semNegrito = false }: { trechos: Trecho[]; semNegrito?: boolean }) {
  return (
    <span className="spl-fmt">
      {trechos.map((t, i) => {
        const b = t.b && !semNegrito;
        if (t.v === 'falta' || t.v === 'crua') {
          const cls = 'spl-tok' + (t.m ? ' spl-mark' : '') + (b ? ' spl-b' : '');
          const title = t.v === 'falta' ? `Sem dado para {{${t.nome}}} — preencha no compositor` : `{{${t.nome}}} não é preenchida sozinha — preencha no compositor`;
          return <span key={i} className={cls} title={title}>{t.t}</span>;
        }
        const cls = [t.v === 'var' ? 'spl-var' : '', t.m ? 'spl-mark' : '', b ? 'spl-b' : '', t.link ? 'spl-link' : ''].filter(Boolean).join(' ');
        const title = t.v === 'var' ? `Preenchido automaticamente: {{${t.nome}}}` : undefined;
        return cls ? <span key={i} className={cls} title={title}>{t.t}</span> : <span key={i}>{t.t}</span>;
      })}
    </span>
  );
}

function Etapa({ e, n, ctx, termos }: { e: EtapaPrevia; n: number; ctx: VarCtx; termos: string[] }) {
  const r = useMemo(() => segmentarVariaveis(e.conteudo ?? '', ctx), [e.conteudo, ctx]);
  const trechos = useMemo(() => montarTrechos(r.segs, termos), [r.segs, termos]);
  const faltas = useMemo(() => faltasDoTexto(e.conteudo ?? '', ctx), [e.conteudo, ctx]);
  const temTexto = r.final.trim().length > 0;
  const casou = termos.length > 0 && trechos.some((t) => t.m);
  const midia = e.tipo !== 'texto';
  const forma = !midia ? '' : temTexto ? ' spl-et-leg' : ' spl-et-mid';
  return (
    <li className={'spl-et' + forma}>
      <div className="spl-et-col">
        <div className={'spl-bolha' + (midia ? (temTexto ? ' spl-bolha-leg' : ' spl-bolha-mid') : '') + (casou ? ' spl-casou' : '')}>
          {midia && <CartaoMidia e={e} />}
          {temTexto && <div className={midia ? 'spl-leg' : undefined}><TextoRico trechos={trechos} /></div>}
        </div>
        {faltas.length > 0 && (
          <div className="spl-et-aviso"><IcAlerta /><span>Falta: {faltas.join(', ')} — ajuste no compositor</span></div>
        )}
      </div>
      <span className="spl-et-n" aria-label={`Mensagem ${n}`}>{n}</span>
    </li>
  );
}

/* UMA linha de meta: "3 mensagens · texto + vídeo" · categoria (pílula com ponto, inteira)
   · #tags em texto discreto. Ordem de sacrifício: as tags que não cabem viram "+N" PRIMEIRO;
   a composição só corta (reticências) em último caso; a categoria nunca. Medido com as
   larguras NATURAIS antes do paint (.spl-medindo trava o encolhimento durante a medida). */
function MetaLinha({ total, tipos, categoria, tags, termos }: {
  total: number; tipos: EtapaPrevia['tipo'][]; categoria: string | null; tags: string[]; termos: string[];
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [cabem, setCabem] = useState<number | null>(null);
  useLayoutEffect(() => {
    if (cabem !== null) return;
    const el = ref.current;
    if (!el) return;
    const chips = [...el.querySelectorAll<HTMLElement>('[data-tag]')];
    const W = el.clientWidth, MAIS = 32;
    const fim = (i: number) => chips[i].offsetLeft + chips[i].offsetWidth;
    let k = chips.length;
    if (k && fim(k - 1) > W) { k = 0; while (k < chips.length && fim(k) + MAIS <= W) k += 1; }
    setCabem(k);
  }, [cabem]);
  // largura mudou (resize): mede de novo
  const largRef = useRef(0);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    largRef.current = el.clientWidth;
    const ro = new ResizeObserver(() => {
      if (Math.abs(el.clientWidth - largRef.current) < 1) return;
      largRef.current = el.clientWidth;
      setCabem(null);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const vis = cabem === null ? tags : tags.slice(0, cabem);
  const resto = tags.length - vis.length;
  return (
    <div className={'spl-pv-meta' + (cabem === null ? ' spl-medindo' : '')} ref={ref}>
      {/* title = a linha inteira (em último caso a composição corta com reticências) */}
      <span className="spl-pv-linha" title={rotuloMensagens(total) + (tipos.length ? ' · ' + rotuloComposicaoNaOrdem(tipos) : '')}>
        {/* por extenso no cabeçalho da prévia ("3 mensagens"); a LISTA segue com "3 msgs" */}
        <b>{rotuloMensagens(total)}</b>
        {tipos.length > 0 && <> · {rotuloComposicaoNaOrdem(tipos)}</>}
      </span>
      {categoria && <span className="spl-chip-cat" title={`Categoria: ${categoria}`}><i aria-hidden /><span>{categoria}</span></span>}
      {vis.map((t) => <span key={t} data-tag className="spl-tag">#<Marcas pedacos={destacar(t.replace(/^#+/, ''), termos)} /></span>)}
      {resto > 0 && <span className="spl-tag spl-tag-mais" title={tags.slice(vis.length).map((t) => '#' + t.replace(/^#+/, '')).join(' ')}>+{resto}</span>}
    </div>
  );
}

/* O que o cliente acabou de dizer: FAIXA de 1 linha ("Cliente · há 4 min" + a fala) que
   abre ao clicar quando a fala não cabe; o que ele mandou DEPOIS vem numa linha à parte,
   por extenso ("Depois o cliente enviou 2 imagens") — sem ambiguidade de ordem. */
function Contexto({ ultima, onAlternar }: { ultima: UltimaDoCliente; onAlternar?: () => void }) {
  const [aberto, setAberto] = useState(false);
  const [cortado, setCortado] = useState(false);
  const txtRef = useRef<HTMLSpanElement>(null);
  const medirCorte = useCallback(() => {
    const el = txtRef.current;
    if (el && !el.closest('.spl-ctx-aberto')) setCortado(el.scrollWidth > el.clientWidth + 1);
  }, []);
  useLayoutEffect(() => { medirCorte(); }, [ultima.texto, aberto, medirCorte]);
  // a largura chega depois (o painel nasce fora da tela até ser posicionado) e muda no resize
  useEffect(() => {
    const el = txtRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => medirCorte());
    ro.observe(el);
    return () => ro.disconnect();
  }, [medirCorte]);
  const depois = ultima.extra ? `Depois o cliente enviou ${ultima.extra}` : '';
  const abre = cortado || aberto;
  return (
    <div
      className={'spl-ctx' + (aberto ? ' spl-ctx-aberto' : '') + (abre ? ' spl-ctx-abre' : '')}
      aria-label={`Última do cliente, ${ultima.quando}: ${ultima.audio ? 'áudio: ' : ''}${ultima.texto}${depois ? `. ${depois}` : ''}`}
      onClick={abre ? () => { setAberto((a) => !a); onAlternar?.(); } : undefined}
      title={abre ? (aberto ? 'Recolher' : 'Ver a mensagem inteira') : undefined}
    >
      <div className="spl-ctx-linha">
        <span className="spl-ctx-rot">Cliente · {ultima.quando}</span>
        <span className="spl-ctx-txt" ref={txtRef}>
          {ultima.audio && <span className="spl-ctx-aud"><IcAudio />Áudio:</span>}
          {ultima.texto}
        </span>
        {abre && <span className="spl-ctx-ver" aria-hidden><IcAbaixo /></span>}
      </div>
      {depois && (
        <div className="spl-ctx-depois">
          {ultima.extraTipo && ultima.extraTipo !== 'texto' && <IcTipo tipo={ultima.extraTipo} />}
          <span>{depois}</span>
        </div>
      )}
    </div>
  );
}

interface EstadoRolo { cima: boolean; baixo: boolean; abaixo: number }
/** padding de baixo do corpo da prévia (paleta.css .spl-pv-corpo) — o degradê não conta ele */
const PAD_BASE = 16;
/** degradê de baixo: só os últimos 28px da vista */
const FADE = 28;
/** faixa mínima entre a última mensagem inteira e o fim da janela para o selo "+N abaixo"
 *  (22px a 4px do fundo): ele só encosta no respiro de baixo da bolha (≥ 10px sem texto) */
const BANDA_MIN = 16;

export function Previa({ it, categoria, ctx, termos, canal, ultima, resumo, resumoPronto, onUsar, onTransborda }: {
  it: ItemIndice;
  /** nome da categoria — sem categoria a paleta passa "Outros" (a mesma pílula); null esconde o chip */
  categoria: string | null;
  ctx: VarCtx;
  termos: string[];
  /** número/chip por onde a mensagem vai sair ("Responder por") */
  canal?: string | null;
  /** o que o cliente acabou de dizer (a paleta cobre o fim do chat) */
  ultima?: UltimaDoCliente | null;
  /** resumo de etapas DESTE script (prévia instantânea antes de fetchEtapas) */
  resumo?: ResumoEtapas;
  /** o resumo da org já chegou (sem entrada = script sem etapas → conteudo) */
  resumoPronto: boolean;
  onUsar: () => void;
  /** a sequência transborda a vista (o rodapé mostra "Shift ↑↓ rolar prévia") */
  onTransborda?: (rola: boolean) => void;
}) {
  const provisorias = useMemo(
    () => (SCRIPTS_REAL ? etapasDoResumo(resumo, it.s.conteudo, resumoPronto) : null),
    [resumo, it.s.conteudo, resumoPronto],
  );
  const { etapas: brutas, provisoria, carregando, erro, tentar } = useEtapasPrevia(it, provisorias);
  // as provisórias já são as enviáveis (sem storagePath ainda): não passam pelo filtro de envio
  const etapas = useMemo(
    () => (brutas ? (provisoria ? brutas : etapasParaPrevia(brutas, it.s.conteudo)) : null),
    [brutas, provisoria, it.s.conteudo],
  );
  const comp = etapas ? composicaoDasEtapas(etapas) : { total: it.total, tipos: it.tipos };
  // pendências da sequência inteira, em nome humano ("valor da parcela")
  const pendencias = useMemo(() => {
    const out: string[] = [];
    for (const e of etapas ?? []) for (const f of faltasDoTexto(e.conteudo ?? '', ctx)) if (!out.includes(f)) out.push(f);
    return out;
  }, [etapas, ctx]);
  const cliente = (ctx.cliente ?? '').trim();

  /* ---------- rolagem: posição inicial, corte alinhado, degradês e "+N abaixo" ---------- */
  const roloRef = useRef<HTMLDivElement>(null);
  const janelaRef = useRef<HTMLDivElement>(null);
  const [rolo, setRolo] = useState<EstadoRolo>({ cima: false, baixo: false, abaixo: 0 });
  /** px tirados do fim da vista para ela terminar ANTES da 1ª mensagem que não cabe inteira (0 = sem corte) */
  const corteRef = useRef(0);
  const usuarioRolou = useRef(false);
  const rolagemProgramada = useRef<number | null>(null);
  const onTransbordaRef = useRef(onTransborda);
  onTransbordaRef.current = onTransborda;
  const medir = useCallback(() => {
    const el = roloRef.current;
    if (!el) return;
    // só conta o que está TOTALMENTE fora da vista
    const fundo = el.scrollTop + el.clientHeight;
    let abaixo = 0;
    el.querySelectorAll<HTMLElement>('.spl-ets > .spl-et').forEach((li) => { if (li.offsetTop >= fundo - 2) abaixo += 1; });
    const b = bordasRolagem(el, 20, FADE, 8, PAD_BASE);
    // corte alinhado: nada está partido no fim da vista → sem degradê embaixo
    const novo = { cima: b.cima, baixo: b.baixo && corteRef.current === 0, abaixo };
    setRolo((r) => (r.cima === novo.cima && r.baixo === novo.baixo && r.abaixo === novo.abaixo ? r : novo));
    onTransbordaRef.current?.(el.scrollHeight - el.clientHeight > PAD_BASE + 2 || corteRef.current > 0);
  }, []);
  const aplicarCorte = (px: number) => {
    const el = roloRef.current;
    if (!el) return;
    corteRef.current = px;
    el.style.marginBottom = px ? `${px}px` : '';
  };
  /* CORTE ALINHADO (na abertura e no resize, até o atendente rolar): a 1ª mensagem que não
     cabe INTEIRA sai toda da vista — a vista termina logo antes dela, nenhum cartão fica
     partido no meio, o selo "+N abaixo" conta exatamente as escondidas e senta na faixa livre.
     A faixa precisa de BANDA_MIN px até a última mensagem inteira (o selo só encosta no
     respiro de baixo da bolha, nunca no texto); sem isso, sai também a anterior.
     Exceções: a ÚLTIMA mensagem com só a ponta escondida (≤ 28px) só esmaece (sem selo), e a
     primeira da vista (mais alta que a janela) nunca some. */
  const alinharCorte = () => {
    const el = roloRef.current, jan = janelaRef.current;
    if (!el || !jan) return;
    const fundo = el.scrollTop + jan.clientHeight;
    const lis = [...el.querySelectorAll<HTMLElement>('.spl-ets > .spl-et')];
    const fim = (li: HTMLElement) => li.offsetTop + li.offsetHeight;
    const k = lis.findIndex((li) => fim(li) > fundo);
    if (k < 0) return;
    if (k === lis.length - 1 && fim(lis[k]) - fundo <= FADE) return;
    let alvo = k;
    if (alvo > 0 && fundo - fim(lis[alvo - 1]) < BANDA_MIN) alvo -= 1;
    const t = lis[alvo].offsetTop;
    if (t <= el.scrollTop + 4) return;
    aplicarCorte(Math.max(0, Math.round(fundo - (t - 4))));
  };
  const chaveTermos = termos.join(' ');
  const chaveVista = `${it.s.id}|${chaveTermos}`;
  const ultimaVista = useRef('');
  useLayoutEffect(() => {
    const el = roloRef.current;
    if (!el) return;
    const nova = ultimaVista.current !== chaveVista;
    ultimaVista.current = chaveVista;
    if (nova) usuarioRolou.current = false;
    // etapas completas chegaram e o atendente já rolou: só mede (não puxa a vista de volta)
    if (!nova && usuarioRolou.current) { medir(); return; }
    aplicarCorte(0);
    // com busca, abre no trecho que casou (o atendente vê POR QUE o script apareceu)
    const marca = chaveTermos ? el.querySelector<HTMLElement>('.spl-ets .spl-mark') : null;
    let topo = 0;
    if (marca) {
      const rm = marca.getBoundingClientRect(), re = el.getBoundingClientRect();
      const y = rm.top - re.top + el.scrollTop;
      if (y + rm.height > el.clientHeight - 40) topo = Math.max(0, y - el.clientHeight / 2 + rm.height / 2);
    }
    const antes = el.scrollTop;
    el.scrollTop = topo;
    // o navegador pode limitar o valor: guarda o que ficou (o evento de rolagem dele não é do atendente)
    if (Math.abs(el.scrollTop - antes) >= 1) rolagemProgramada.current = el.scrollTop;
    alinharCorte();
    medir();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaveVista, etapas, medir]);
  useEffect(() => {
    const el = roloRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => medir());
    ro.observe(el);
    const lista = el.firstElementChild;
    if (lista) ro.observe(lista);
    return () => ro.disconnect();
  }, [medir, etapas]);
  useEffect(() => {
    const jan = janelaRef.current;
    if (!jan || typeof ResizeObserver === 'undefined') return;
    let h = jan.clientHeight;
    const ro = new ResizeObserver(() => {
      if (Math.abs(jan.clientHeight - h) < 1 || usuarioRolou.current) return;
      h = jan.clientHeight;
      aplicarCorte(0); alinharCorte(); medir();
    });
    ro.observe(jan);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [medir]);
  useEffect(() => () => onTransbordaRef.current?.(false), []);
  const aoRolar = () => {
    const el = roloRef.current;
    if (!el) return;
    const prog = rolagemProgramada.current;
    if (prog !== null && Math.abs(el.scrollTop - prog) < 1) { rolagemProgramada.current = null; medir(); return; }
    // o atendente rolou: a vista volta à altura cheia (o conteúdo flui com o degradê)
    usuarioRolou.current = true;
    if (corteRef.current) aplicarCorte(0);
    medir();
  };
  // abrir/recolher a faixa do cliente muda a altura do conteúdo: a vista volta à altura cheia
  const soltarCorte = () => { usuarioRolou.current = true; if (corteRef.current) aplicarCorte(0); };
  const irParaAbaixo = () => {
    const el = roloRef.current;
    if (!el) return;
    const fundo = el.scrollTop + el.clientHeight;
    const prox = [...el.querySelectorAll<HTMLElement>('.spl-ets > .spl-et')].find((li) => li.offsetTop >= fundo - 2);
    usuarioRolou.current = true;
    aplicarCorte(0);
    const suave = !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el.scrollTo({ top: prox ? prox.offsetTop - 12 : el.scrollHeight, behavior: suave ? 'smooth' : 'auto' });
  };

  const sequencia = etapas && etapas.length > 0 && !erro;
  const nPend = pendencias.length;

  return (
    <section className="spl-pv" aria-label={`Prévia: ${it.titulo}`} aria-busy={carregando}>
      {/* sem descrição: cabeçalho mais baixo, com título · meta centrados nele */}
      <header className={'spl-pv-cab' + (it.descricao ? '' : ' spl-pv-cab-sd')}>
        <h3 className="spl-pv-tit">
          <span className="spl-pv-tit-t" title={it.titulo}><Marcas pedacos={destacar(it.titulo, termos)} /></span>
          {it.s.favorito && <span className="spl-estrela" title="Favorito" aria-label="Favorito"><IcEstrela /></span>}
        </h3>
        <MetaLinha
          key={`${it.s.id}|${comp.total}|${comp.tipos.join()}`}
          total={comp.total} tipos={comp.tipos} categoria={categoria} tags={it.tags} termos={termos}
        />
        {it.descricao && <p className="spl-pv-desc" title={it.descricao}><Marcas pedacos={destacar(it.descricao, termos)} /></p>}
      </header>

      <div
        className="spl-pv-janela" ref={janelaRef}
        // a roda sobre a faixa livre do corte alinhado (fora do corpo) rola a prévia mesmo assim
        onWheel={(e) => { const el = roloRef.current; if (el && corteRef.current && !el.contains(e.target as Node)) el.scrollBy({ top: e.deltaY }); }}
      >
        <div
          className={'spl-pv-corpo' + (rolo.cima ? ' spl-sombra-cima' : '') + (rolo.baixo ? ' spl-sombra-baixo' : '')}
          ref={roloRef} onScroll={aoRolar}
        >
          {erro ? (
            <div className="spl-pv-erro" role="alert">
              <span className="spl-pv-erro-ic" aria-hidden><IcAlerta /></span>
              <b>Não foi possível carregar as mensagens</b>
              <span>Verifique a conexão e tente de novo.</span>
              <BotaoSec mini onClick={tentar}>Tentar de novo</BotaoSec>
            </div>
          ) : (
            <div className="spl-pv-fio">
              {ultima && <Contexto ultima={ultima} onAlternar={soltarCorte} />}
              {!etapas ? (
                <ol className="spl-ets" aria-hidden>
                  {[['72%', 44], ['58%', 56], ['46%', 36]].map(([w, h], i) => (
                    <li key={i} className="spl-et spl-et-sk">
                      <div className="spl-et-col"><Skeleton largura={w} altura={h as number} raio={14} style={{ marginLeft: 'auto' }} /></div>
                      <span className="spl-et-n">{i + 1}</span>
                    </li>
                  ))}
                </ol>
              ) : etapas.length === 0 ? (
                <div className="spl-pv-vazio">Este script ainda não tem mensagens. Adicione na página de Scripts.</div>
              ) : (
                <ol className={'spl-ets' + (provisoria ? ' spl-ets-prov' : '')}>
                  {etapas.map((e, i) => <Etapa key={`${it.s.id}:${i}`} e={e} n={i + 1} ctx={ctx} termos={termos} />)}
                </ol>
              )}
            </div>
          )}
        </div>
        {sequencia && rolo.abaixo > 0 && (
          <button type="button" className="spl-pv-mais" onClick={irParaAbaixo} tabIndex={-1}>
            <IcAbaixo />{rolo.abaixo === 1 ? '+1 mensagem abaixo' : `+${rolo.abaixo} mensagens abaixo`}
          </button>
        )}
      </div>

      <footer className="spl-pv-rod">
        <div className="spl-pv-para">
          <span className="spl-pv-l spl-pv-quem" title={cliente ? `Para ${cliente}` : undefined}>
            <IcPessoa /><span>{cliente ? <>Para <b>{cliente}</b></> : 'Conversa sem nome do cliente'}</span>
          </span>
          {(canal || nPend > 0) && (
            <span className="spl-pv-l" title={[canal ? `Sai por ${canal}` : '', nPend ? `Falta preencher: ${pendencias.join(', ')}` : ''].filter(Boolean).join(' · ')}>
              {canal ? <IcCelular /> : <span className="spl-pv-alerta"><IcAlerta /></span>}
              <span>
                {canal && <>por <b>{canal}</b></>}
                {canal && nPend > 0 && ' · '}
                {nPend > 0 && (
                  <span className="spl-pv-falta">
                    {canal && <span className="spl-pv-alerta"><IcAlerta /></span>}
                    {nPend === 1 ? '1 campo para ajustar' : `${nPend} campos para ajustar`}
                  </span>
                )}
              </span>
            </span>
          )}
        </div>
        <BotaoPrimario className="spl-usar" onClick={onUsar} aria-label="Usar este script">
          <span>Usar<span className="spl-usar-x"> este script</span></span>
          <span className="spl-usar-kbd" aria-hidden><IcEnter /></span>
        </BotaoPrimario>
      </footer>
    </section>
  );
}
