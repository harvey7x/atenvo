import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { criarRaizPortalV2 } from './portal';
import { criarAnimacao } from './bomDiaAnimacao';
import { DEMO_MODE } from '@/lib/demo';
import { BOM_DIA_REAL, lerPreviaGestor, prepararBomDia, salvarPreviaGestor, VOZ_BOM_DIA } from '@/data/bomDia';
import {
  agruparCampanhas, analisarVoz, aplicarGanho, casosDoPainel, chaveTelaBomDia, criarGanho, criarMedidor, detalheNaoElegiveis,
  fraseNoTempo, lerMudo, lideresCampanha, limiarPalavra, listaE, mapearFala, medirPalavras, montarFala, primeiroNome,
  progressoFrase, quadroLento, respiracaoCalma, salvarMudo, saudacaoDoDia, textoFalado, textoResumo,
  type AnaliseVoz, type CampanhaAgrupada, type MapaFala, type Momento, type NomeCampanha, type PalavraFalada, type ResumoBomDia,
  type Trecho, type IdTrecho, type Vendedores,
} from '../lib/bomDia';
import './bomDia.css';

/* ------------------------------------------------------------------
   Bom dia do Atenvo — às 8h a assistente lê a carteira e FALA (voz
   feminina do Gemini; sem ela, a neural do navegador; sem nenhuma, só
   a legenda — nunca voz robótica). Às 17h, só para o GESTOR, o
   "diagnóstico do dia".
   PLAY PARA TODOS (dono 30/10): a tela NUNCA começa a falar sozinha. Ao
   abrir mostra a esfera respirando, a saudação ("Bom dia, Juliana.") e
   o botão "Ouvir o resumo" — "a primeira fala entra às 8 horas e ela só
   começa a falar quando a pessoa chegar… teria que ter um botão da gente
   dar um play". O clique no play é também a liberação de som do
   navegador; se mesmo assim o som não sair, a legenda anda pelo relógio.
   "Ver sem áudio" sobe o painel direto; Esc fecha.
   Fluxo falado (dono 30/10): "no meio da tela, uma animação que vai
   indo junto com a fala; embaixo, a tradução do que tá falando; quando
   ela terminar, sobe uma tela com os dados e o botão 'Começar o dia'".
   Visual: PRETO E BRANCO, minimalista.
   - No meio, a ESFERA LÍQUIDA (bomDiaAnimacao.ts: módulo plugável, 1
     canvas WebGL pequeno) movida pela voz real: AnalyserNode → bandas
     grave/médio/agudo (com ganho automático) → seguidores
     sobe-rápido/desce-macio + nível lento.
   - Embaixo, a legenda palavra a palavra pela VOZ ACUMULADA (pausas não
     acendem palavras); a frase troca no início da pausa; número dito
     fica branco e dá um brilho na esfera.
   - Fim da voz + 0,5 s: SOBE o painel (vendedor: novos, sem resposta,
     informações; gestor: 6 cartões compactos) e a esfera pousa no alto.
   UM laço de quadro só (legenda, níveis, esfera, contagem): vivo durante
   a fala e as transições; à espera do play gira alguns segundos e dorme
   (a respiração é CSS — a tela pode ficar horas esperando); pousada no
   alto dorme. Leve = pose fixa; máquina que não aguenta (janelas de
   1,5 s acima de 30 ms) baixa a resolução e, se continuar, para a esfera
   até a próxima fala.
   ------------------------------------------------------------------ */

/* boot: preparando · pronta: o play · falando · voltando: "Ouvir de novo" (o painel desce) · fim: o painel */
type Fase = 'boot' | 'pronta' | 'falando' | 'voltando' | 'fim';
type Voz = 'ia' | 'navegador';

/* prévia local (vite --mode demo): troca de pessoa e de horário para o dono comparar — nunca vai a build.
   A voz já foi escolhida (Despina, VOZ_BOM_DIA). */
const PREVIA = import.meta.env.DEV && DEMO_MODE;

const MIN_ABERTURA_MS = 1300;   // a esfera acende no meio (1,1 s) e respira um instante antes da saudação
const ESPERA_VOZ_MS = 60_000;   // a voz da IA não chegou → legenda sem voz. A fala do gestor leva ~12 s para gerar no Gemini (medido 30/10): com 12 s a tela desistia antes e o Murilo ficava sem áudio
const CARACTERES_POR_S = 14.5;  // ritmo de fala sem áudio (mudo e voz do navegador)
const DEPOIS_DA_VOZ_S = 0.5;    // o painel sobe meio segundo depois da última sílaba (não do fim do arquivo)
const FOCO_CTA_MS = 700;        // o foco vai para "Começar o dia" quando o painel já subiu
const DE_NOVO_MS = 550;         // "Ouvir de novo": o painel desce, a esfera volta ao meio e ela fala
const SAIDA_MS = 420;           // "Começar o dia": a tela esmaece e devolve o sistema
const OCIOSO_MS = 28;           // à espera do play: o redemoinho gira devagar, ~24 quadros/s…
const OCIOSO_POR_MS = 9000;     // …por alguns segundos; depois dorme (a respiração é CSS)
const VIGIA_DESDE_S = 2;        // o vigia de quadro ignora os 2 primeiros segundos de cada fala
const ERRO_DADOS = 'Não consegui ler os seus números agora. Abra o WhatsApp para ver a sua fila.';

const ehLeve = () => document.documentElement.getAttribute('data-perf') === 'lite'
  || window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function useLeve(): boolean {
  const [leve, setLeve] = useState(ehLeve);
  useEffect(() => {
    const obs = new MutationObserver(() => setLeve(ehLeve()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-perf'] });
    return () => obs.disconnect();
  }, []);
  return leve;
}

/* reserva SÓ com voz neural de verdade (Edge: Francisca/Thalita "Online (Natural)"). Dono 30/10:
   nada de voz robótica — sem a voz da IA e sem uma neural, a tela fala só por legenda. */
function vozNeuralDoNavegador(): SpeechSynthesisVoice | null {
  if (!('speechSynthesis' in window)) return null;
  const neurais = speechSynthesis.getVoices()
    .filter((v) => /^pt[-_]br/i.test(v.lang) && /natural|neural/i.test(v.name));
  return neurais.find((v) => /francisca|thalita|brenda|leila|let[ií]cia|manuela|yara/i.test(v.name)) ?? neurais[0] ?? null;
}

const visivel = (el: Element) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
const qtd = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/* ícones de traço fino (o tamanho vem do CSS de cada ponto de uso) */
const svg = (d: ReactNode, sw = 1.6) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden>{d}</svg>
);
const Ic = {
  passados: svg(<><path d="M2.5 12h7M7 9l3 3-3 3" /><circle cx="16.5" cy="8" r="3" /><path d="M11.5 19.5a5 5 0 0110 0" /></>),
  presencial: svg(<><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4M9.5 15l1.8 1.8 3.4-3.6" /></>),
  alerta: svg(<><path d="M10.3 4.7a2 2 0 013.4 0l7.3 12.6a2 2 0 01-1.7 3H4.7a2 2 0 01-1.7-3z" /><path d="M12 9.6v3.9M12 16.8h.01" /></>),
  ok: svg(<><circle cx="12" cy="12" r="8.5" /><path d="M8.5 12.2l2.4 2.4 4.6-4.9" /></>),
  denovo: svg(<><path d="M4 12a8 8 0 108-8 8.4 8.4 0 00-5.8 2.4L4 8.5" /><path d="M4 4v4.5h4.5" /></>, 1.8),
  ouvir: svg(<path d="M8.5 6.2v11.6a.8.8 0 001.2.7l9-5.8a.8.8 0 000-1.4l-9-5.8a.8.8 0 00-1.2.7z" />, 1.8),
  som: svg(<><path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z" /><path d="M15.5 9a4.5 4.5 0 010 6M18 6.5a8 8 0 010 11" /></>, 1.8),
  mudo: svg(<><path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z" /><path d="M16 9.5l5 5M21 9.5l-5 5" /></>, 1.8),
  seta: svg(<path d="M5 12h14M13 6l6 6-6 6" />, 1.9),
};
/* o ▶ do play: cheio (o círculo preto dentro da pílula branca) */
const IcPlay = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M8 5.6v12.8a1 1 0 001.53.85l10.2-6.4a1 1 0 000-1.7L9.53 4.75A1 1 0 008 5.6z" />
  </svg>
);

/* largura da saudação em "em", medida uma vez com a fonte real (cópia invisível, sem quebra; com
   linhas em bloco, a mais larga): o CSS encaixa o tamanho na coluna — nunca invade os cartões */
function useLarguraEm(ref: RefObject<HTMLElement>, texto: string) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let vivo = true;
    const medir = () => {
      const pai = el.parentElement;
      if (!vivo || !pai) return;
      const c = el.cloneNode(true) as HTMLElement;
      c.setAttribute('aria-hidden', 'true');
      c.style.cssText = 'position:absolute;left:0;top:0;visibility:hidden;white-space:nowrap;width:auto;max-width:none;font-size:100px';
      c.style.setProperty('animation', 'none', 'important');
      pai.appendChild(c);
      const em = c.getBoundingClientRect().width / 100;
      c.remove();
      if (em > 0) el.style.setProperty('--bd-ola-em', em.toFixed(3));
    };
    medir();
    document.fonts.ready.then(medir).catch(() => undefined);
    return () => { vivo = false; };
  }, [ref, texto]);
}

/* a marca em preto e branco (o logo do sistema é azul): id do degradê único por instância */
function LogoMono({ className }: { className?: string }) {
  const id = `bd-logo-${useId().replace(/[^\w-]/g, '')}`;
  return (
    <svg className={className} viewBox="0 0 256 256" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FFFFFF" /><stop offset="1" stopColor="#BDBDBD" /></linearGradient>
      </defs>
      <rect x="6" y="6" width="244" height="244" rx="58" fill="#0B0B0B" stroke="rgba(255,255,255,.16)" strokeWidth="5" />
      <path d="M128 50 L196 196 L128 150 L60 196 Z" fill={`url(#${id})`} />
      <path d="M128 166 L154 188 L128 226 L102 188 Z" fill="#8F8F8F" />
    </svg>
  );
}

type Banda = 'g' | 'm' | 'a';
/* bandas do analisador e a faixa útil de cada uma [lo, hi, p95] medida na voz Despina
   (fftSize 2048, smoothing .5, −88/−20 dB); o ganho automático desloca a faixa para outra voz */
const BANDAS: Record<Banda, readonly [number, number]> = { g: [90, 320], m: [320, 1700], a: [1700, 6500] };
const CAL: Record<Banda, readonly [number, number, number]> = { g: [0.28, 0.66, 0.63], m: [0.14, 0.58, 0.545], a: [0.04, 0.32, 0.295] };

/* as campanhas do cartão "Leads hoje": até 4 linhas (a 5ª em diante vira "Outras"). O rótulo vai em duas
   partes: na lista apertada o "Campanha " da frente some e fica o nome curto ("Antônio") */
type LinhaCampanha = { rotulo: string; prefixo: string; curto: string; n: number };
const linhaDe = (nome: NomeCampanha, n: number): LinhaCampanha => (nome.rotulo !== nome.curto && nome.rotulo.endsWith(nome.curto)
  ? { rotulo: nome.rotulo, prefixo: nome.rotulo.slice(0, nome.rotulo.length - nome.curto.length), curto: nome.curto, n }
  : { rotulo: nome.rotulo, prefixo: '', curto: nome.rotulo, n });
function linhasCampanha(grupos: CampanhaAgrupada[]): LinhaCampanha[] {
  const todas = grupos.map((g) => linhaDe(g.nome, g.n));
  if (todas.length <= 4) return todas;
  return [...todas.slice(0, 3), { rotulo: 'Outras', prefixo: '', curto: 'Outras', n: todas.slice(3).reduce((a, x) => a + x.n, 0) }];
}

const subVendedores = (m: Vendedores) => (m.nomes.length > 1
  ? `${qtd(m.n, 'contrato', 'contratos')} cada`
  : `${qtd(m.n, 'contrato', 'contratos')} ${m.n === 1 ? 'fechado' : 'fechados'}`);

interface PropsHud {
  aoConcluir: () => void;
  nome: string;
  uid: string;
  orgId: string;
  /** o shell sabe pela RPC bom_dia_modo (a prévia, pela pessoa escolhida); a RPC do resumo decide de fato */
  gestor: boolean;
  momento: Momento;
  voz: string;
  /** prévia: a hora fixa (8 ou 17) — a legenda bate com o áudio pré-gerado */
  horaFixa: number | null;
  arquivoDemo: string | null;
}

function Hud({ aoConcluir, nome, uid, orgId, gestor, momento, voz: vozGemini, horaFixa, arquivoDemo }: PropsHud) {
  const leve = useLeve();
  const relogio = useCallback(() => {
    const d = new Date();
    if (horaFixa != null) d.setHours(horaFixa, 0, 0, 0);
    return d;
  }, [horaFixa]);
  const [fase, setFase] = useState<Fase>('boot');
  const [resumo, setResumo] = useState<ResumoBomDia | null>(null);
  /* a hora com que o texto da voz foi montado (a saudação do gestor): legenda = áudio */
  const [horaDaFala, setHoraDaFala] = useState<Date | null>(null);
  const [erro, setErro] = useState(false);
  const [voz, setVoz] = useState<Voz | null>(null);
  const [aberturaFeita, setAberturaFeita] = useState(false);
  const [querTocar, setQuerTocar] = useState(false);    // play clicado ainda preparando: toca quando ficar pronta
  const [jaOuviu, setJaOuviu] = useState(false);
  const [atual, setAtual] = useState(-1);
  const [saindo, setSaindo] = useState<number | null>(null);
  const [rodada, setRodada] = useState(0);
  const [mudo, setMudo] = useState(() => lerMudo(uid));
  const [fechando, setFechando] = useState(false);
  const [agora, setAgora] = useState(relogio);

  const opFala = useMemo(() => ({ momento, agora: horaDaFala ?? undefined }), [momento, horaDaFala]);
  const trechos: Trecho[] = useMemo(() => (resumo ? montarFala(nome, resumo, opFala) : []), [resumo, nome, opFala]);
  const palavras: PalavraFalada[][] = useMemo(() => trechos.map((t) => medirPalavras(t.texto)), [trechos]);

  const ctxRef = useRef<AudioContext | null>(null);
  const bufRef = useRef<AudioBuffer | null>(null);
  const analiseRef = useRef<AnaliseVoz | null>(null);
  const mapaRef = useRef<{ de: Trecho[]; mapa: MapaFala } | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const ganhoRef = useRef<GainNode | null>(null);
  const fonteRef = useRef<AudioBufferSourceNode | null>(null);
  const t0Ref = useRef(0);
  /* quem dita o tempo da legenda: o relógio do áudio, o de frase (mudo/voz do navegador) ou ninguém */
  const relogioRef = useRef<'audio' | 'frase' | 'parado'>('parado');
  const execRef = useRef(0);        // cada tocar() é uma execução; callbacks velhos se calam
  const fimRef = useRef(false);     // terminar() é idempotente (relógio da voz × onended × Pular)
  const falaNumRef = useRef(0);     // cada fala nova zera o vigia de quadro (a esfera volta a girar)
  const atualRef = useRef(-1);
  const saidaRef = useRef(0);
  const fraseRef = useRef<{ ini: number; dur: number; char: number | null }>({ ini: 0, dur: 1, char: null });
  /* o Chrome perde os eventos de uma fala que o coletor de lixo levou: a frase fica guardada aqui */
  const falaRef = useRef<SpeechSynthesisUtterance | null>(null);
  const veuRef = useRef<HTMLDivElement>(null);
  const esferaRef = useRef<HTMLDivElement>(null);
  const corpoRef = useRef<HTMLDivElement>(null);
  const fraseAtualRef = useRef<HTMLParagraphElement>(null);
  const painelRef = useRef<HTMLElement>(null);
  const ctaRef = useRef<HTMLButtonElement>(null);
  const playRef = useRef<HTMLButtonElement>(null);
  const olaRef = useRef<HTMLHeadingElement>(null);
  const brilhoRef = useRef(0);      // número dito: a esfera dá um brilho (~0,5 s)
  const contagemRef = useRef<{ ini: number; alvos: Array<{ no: Text; ate: number }> } | null>(null);
  const mudoRef = useRef(mudo);
  const vozRef = useRef(voz);
  vozRef.current = voz;
  const trechosRef = useRef(trechos);
  trechosRef.current = trechos;
  const palavrasRef = useRef(palavras);
  palavrasRef.current = palavras;
  /* o laço dorme quando ela cala; a fase e o Leve chegam a ele por ref */
  const faseRef = useRef(fase);
  faseRef.current = fase;
  const leveRef = useRef(leve);
  leveRef.current = leve;
  const erroRef = useRef(erro);
  erroRef.current = erro;
  const acordarRef = useRef<() => void>(() => undefined);
  const acordar = useCallback(() => acordarRef.current(), []);

  /* ---------- o som: um AudioContext por tela (nasce suspenso; o clique no play o libera) ---------- */
  useEffect(() => {
    let ctx: AudioContext | null = null;
    try { ctx = new AudioContext(); } catch { ctx = null; }
    ctxRef.current = ctx;
    return () => {
      execRef.current++;
      relogioRef.current = 'parado';
      const f = fonteRef.current;
      fonteRef.current = null;
      if (f) { f.onended = null; try { f.stop(); } catch { /* já parou */ } }
      if ('speechSynthesis' in window) speechSynthesis.cancel();
      analyserRef.current = null;
      ganhoRef.current = null;
      ctx?.close().catch(() => undefined);
      if (ctxRef.current === ctx) ctxRef.current = null;
    };
  }, []);

  /* ---------- preparo: números + voz (o shell pré-carrega 2 min antes do horário) ----------
     no sistema real a RPC decide o modo: o "gestor" do shell (chega depois, pela RPC bom_dia_modo)
     só escolhe o seed da demo — mudar não refaz o preparo nem reinicia a tela */
  const gestorSeed = !BOM_DIA_REAL && gestor;
  useEffect(() => {
    let vivo = true;
    const ctx = ctxRef.current;
    const prep = prepararBomDia({
      org: orgId, uid, nome, momento, gestor: gestorSeed, voz: vozGemini, arquivoDemo,
      agora: horaFixa == null ? undefined : relogio(),
    });
    prep.resumo.then((r) => { if (vivo) { setHoraDaFala(prep.agora); setResumo(r); } }).catch(() => { if (vivo) setErro(true); });
    const espera = window.setTimeout(() => { if (vivo) setVoz((v) => v ?? 'navegador'); }, ESPERA_VOZ_MS);
    prep.voz.then(async (ab) => {
      if (!vivo) return;
      if (!ab || !ctx) { setVoz((v) => v ?? 'navegador'); return; }
      try {
        const buf = await ctx.decodeAudioData(ab.slice(0));
        // chegou atrasada com a voz do navegador já falando: deixa terminar
        if (!vivo || relogioRef.current === 'frase') return;
        bufRef.current = buf;
        // pausas reais, voz acumulada e fim da última sílaba: lidos UMA vez do PCM
        analiseRef.current = analisarVoz(buf.getChannelData(0), buf.sampleRate);
        setVoz('ia');
      } catch { if (vivo) setVoz((v) => v ?? 'navegador'); }
    });
    return () => {
      vivo = false;
      window.clearTimeout(espera);
      // os dados mudaram com a tela aberta (ex.: o nome foi relido): a fala velha para por inteiro
      // (relógio, fonte, mapa) e a tela volta ao play — o laço não lê o tempo de outro áudio
      execRef.current++;
      relogioRef.current = 'parado';
      const f = fonteRef.current;
      fonteRef.current = null;
      if (f) { f.onended = null; try { f.stop(); } catch { /* já parou */ } }
      if ('speechSynthesis' in window) speechSynthesis.cancel();
      bufRef.current = null;
      analiseRef.current = null;
      mapaRef.current = null;
      fimRef.current = false;
      atualRef.current = -1;
      setAtual(-1);
      setFase((x) => (x === 'fim' ? x : 'boot'));
      setVoz(null);
      setResumo(null);
      setErro(false);
    };
  }, [orgId, uid, nome, momento, gestorSeed, vozGemini, arquivoDemo, horaFixa, relogio]);

  /* a esfera acende e respira um instante antes da saudação */
  useEffect(() => {
    const t = window.setTimeout(() => setAberturaFeita(true), MIN_ABERTURA_MS);
    return () => window.clearTimeout(t);
  }, []);

  /* relógio da data (a prévia fica parada no horário dela) */
  useEffect(() => {
    if (horaFixa != null) return;
    const iv = window.setInterval(() => setAgora(new Date()), 20_000);
    return () => window.clearInterval(iv);
  }, [horaFixa]);

  /* diálogo: o foco vai para o play ao abrir e volta para onde estava ao fechar */
  useEffect(() => {
    const antes = document.activeElement as HTMLElement | null;
    (playRef.current ?? veuRef.current)?.focus({ preventScroll: true });
    return () => {
      if (antes && antes !== document.body && antes.isConnected && typeof antes.focus === 'function') antes.focus({ preventScroll: true });
    };
  }, []);

  /* o botão focado saiu da tela (play → fala, painel → "Ouvir de novo"): o foco fica no diálogo,
     nunca no <body> (senão o Tab seguinte sai para o sistema atrás) */
  useEffect(() => {
    const veu = veuRef.current;
    const a = document.activeElement;
    if (!veu || (a && a !== document.body && (veu.contains(a) || a.closest('.bd-previa')))) return;
    veu.focus({ preventScroll: true });
  }, [fase]);

  /* ---------- legenda: a frase troca no início da pausa; a velha sai em 0,12 s ---------- */
  const irPara = useCallback((i: number) => {
    const antes = atualRef.current;
    atualRef.current = i;
    setAtual(i);
    if (antes >= 0 && antes !== i) {
      setSaindo(antes);
      window.clearTimeout(saidaRef.current);
      saidaRef.current = window.setTimeout(() => setSaindo(null), 200);
    }
  }, []);

  const pintarLegenda = useCallback((prog: number) => {
    const i = atualRef.current;
    const el = fraseAtualRef.current;
    const ps = palavrasRef.current[i];
    // o React ainda não trocou o nó: não pinta a frase velha com o progresso da nova
    if (!el || !ps || el.dataset.i !== String(i)) return;
    const spans = el.children;
    let numero = false;
    for (let k = 0; k < ps.length && k < spans.length; k++) {
      const dita = prog >= limiarPalavra(ps[k]);
      const sp = spans[k];
      if (dita !== sp.classList.contains('dita')) {
        sp.classList.toggle('dita', dita);
        if (dita && ps[k].numero) numero = true;
      }
    }
    if (numero) brilhoRef.current = 1;
  }, []);

  const pararTudo = useCallback(() => {
    execRef.current++;
    relogioRef.current = 'parado';
    const f = fonteRef.current;
    fonteRef.current = null;
    if (f) { f.onended = null; try { f.stop(); } catch { /* já parou */ } }
    if ('speechSynthesis' in window) speechSynthesis.cancel();
  }, []);

  /** fim da fala (relógio da voz, onended, Pular, Esc, "Ver sem áudio"): uma vez só */
  const terminar = useCallback(() => {
    if (fimRef.current) return;
    fimRef.current = true;
    pararTudo();
    setQuerTocar(false);
    setFase('fim');
    acordar();
  }, [acordar, pararTudo]);

  /* fala sem som (mudo, sem voz, som que não liberou) ou com a voz neural do navegador: frase a frase, pelo relógio */
  const falarPorFrases = useCallback((comVoz: boolean, desde = 0) => {
    const exec = execRef.current;
    const tr = trechosRef.current;
    const vozNav = comVoz ? vozNeuralDoNavegador() : null;
    const falar = comVoz && !!vozNav;
    relogioRef.current = 'frase';
    const frase = (i: number, pausa: number) => {
      if (execRef.current !== exec) return;
      if (i >= tr.length) {
        fraseRef.current = { ini: performance.now(), dur: 0, char: null };
        window.setTimeout(() => { if (execRef.current === exec) terminar(); }, DEPOIS_DA_VOZ_S * 1000);
        return;
      }
      // a legenda troca já no início da pausa; a frase nova acende quando a "voz" dela começa
      irPara(i);
      const dur = (textoFalado(tr[i].texto).length / CARACTERES_POR_S) * 1000;
      fraseRef.current = { ini: performance.now() + pausa, dur, char: null };
      if (!falar) { window.setTimeout(() => frase(i + 1, 380), pausa + dur); return; }
      const u = new SpeechSynthesisUtterance(tr[i].texto);
      u.lang = 'pt-BR';
      if (vozNav) u.voice = vozNav;
      u.rate = 1.03;
      // uma saída só por frase: fim, erro ou o vigia (o fim às vezes não chega)
      let saiu = false;
      const proxima = () => {
        if (saiu) return;
        saiu = true;
        window.clearTimeout(vigia);
        frase(i + 1, 160);
      };
      const vigia = window.setTimeout(proxima, pausa + dur * 2.2 + 2500);
      u.onstart = () => { fraseRef.current.ini = performance.now(); };
      u.onboundary = (e) => { if (e.name === 'word') fraseRef.current.char = e.charIndex; };
      u.onend = proxima;
      u.onerror = proxima;
      falaRef.current = u;
      window.setTimeout(() => { if (execRef.current === exec) speechSynthesis.speak(u); }, pausa);
    };
    setFase('falando');
    acordar();
    frase(desde, 0);
  }, [acordar, irPara, terminar]);

  /* tocar: SEMPRE a partir de um gesto (o play, "Ouvir de novo", trocar o mudo) ou de um play
     clicado enquanto preparava (o contexto já foi liberado no clique).
     desde = frase de onde (re)começar (troca de mudo no meio da fala) */
  const tocar = useCallback((desde = 0) => {
    pararTudo();
    fimRef.current = false;
    falaNumRef.current++;
    atualRef.current = -1;
    setAtual(-1);
    setSaindo(null);
    setRodada((r) => r + 1);
    setJaOuviu(true);
    if (!trechosRef.current.length) { terminar(); return; }
    const exec = execRef.current;
    const ctx = ctxRef.current;
    const buf = bufRef.current;
    if (vozRef.current === 'ia' && ctx && buf) {
      // mesmo depois do clique o som não saiu: a legenda segue pelo relógio (sem voz, sem erro)
      const semSom = () => {
        if (execRef.current !== exec) return;
        execRef.current++;
        falarPorFrases(false, desde);
      };
      const comecar = () => {
        if (execRef.current !== exec) return;
        if (ctx.state !== 'running') { semSom(); return; }
        if (!analyserRef.current) {
          // silenciar = ganho DEPOIS do analisador: a esfera e a legenda seguem a voz muda
          const an = ctx.createAnalyser();
          an.fftSize = 2048;
          an.smoothingTimeConstant = 0.5;
          an.minDecibels = -88;
          an.maxDecibels = -20;
          const ganho = ctx.createGain();
          an.connect(ganho);
          ganho.connect(ctx.destination);
          analyserRef.current = an;
          ganhoRef.current = ganho;
        }
        ganhoRef.current!.gain.value = mudoRef.current ? 0 : 1;
        // fronteiras de cada frase encaixadas nas pausas reais; a legenda anda pela voz acumulada
        const analise = analiseRef.current ?? (analiseRef.current = analisarVoz(buf.getChannelData(0), buf.sampleRate));
        if (mapaRef.current?.de !== trechosRef.current) mapaRef.current = { de: trechosRef.current, mapa: mapearFala(trechosRef.current, analise) };
        const mapa = mapaRef.current.mapa;
        const desloc = desde > 0 ? Math.max(0, mapa.trocas[desde] ?? 0) : 0;
        const fonte = ctx.createBufferSource();
        fonte.buffer = buf;
        fonte.connect(analyserRef.current!);
        // o fim é o da VOZ + 0,5 s (o laço cuida); o onended garante o fim com a aba escondida
        fonte.onended = () => {
          if (fonteRef.current !== fonte || execRef.current !== exec) return;
          const resta = mapa.voz.fimVoz + DEPOIS_DA_VOZ_S - (ctx.currentTime - t0Ref.current);
          window.setTimeout(() => { if (execRef.current === exec) terminar(); }, Math.max(0, resta * 1000));
        };
        const quando = ctx.currentTime + 0.06;
        t0Ref.current = quando - desloc;
        fonte.start(quando, desloc);
        fonteRef.current = fonte;
        relogioRef.current = 'audio';
        setFase('falando');
        acordar();
      };
      if (ctx.state === 'running') { comecar(); return; }
      // resume() precisa nascer no gesto (o play já pediu); confere logo depois
      ctx.resume().then(comecar).catch(semSom);
      window.setTimeout(() => { if (ctx.state !== 'running') semSom(); }, 450);
      return;
    }
    falarPorFrases(!mudoRef.current && !!vozNeuralDoNavegador(), desde);
  }, [acordar, falarPorFrases, pararTudo, terminar]);

  /** o play: o clique é a liberação de som do navegador (resume DENTRO do gesto) */
  const clicarPlay = useCallback(() => {
    const ctx = ctxRef.current;
    if (ctx && ctx.state !== 'running') ctx.resume().catch(() => undefined);
    const f = faseRef.current;
    if (f === 'pronta') tocar();
    else if (f === 'boot') setQuerTocar(true);
  }, [tocar]);

  /* ---------- o laço: legenda + níveis + esfera + contagem (UM rAF só) ----------
     falando / abrindo / pousando: a cada quadro; à espera do play: ~24 q/s por alguns segundos e
     dorme (a respiração é CSS); pousada no alto, Leve ou pose fixa: dorme */
  useEffect(() => {
    const corpo = corpoRef.current;
    const esfera = esferaRef.current;
    if (!corpo || !esfera) return;
    // um canvas por montagem: o StrictMode monta 2x e um contexto perdido de propósito não volta
    const tela = document.createElement('canvas');
    tela.className = 'bd-esfera-tela';
    corpo.prepend(tela);
    let pose = '';                 // a pose parada que está na tela (Leve / pose fixa / sem WebGL)
    const anim = criarAnimacao(tela, {
      leve: leveRef.current,
      // sem WebGL ou contexto perdido: a pose estática do CSS; voltou: o laço redesenha
      aoMudar: (viva) => { esfera.classList.toggle('bd-sem-gl', !viva); pose = ''; acordarRef.current(); },
    });
    const niv = { g: 0, m: 0, a: 0, geral: 0, lento: 0 };
    const est = { abre: leveRef.current ? 1 : 0, recolhe: 0 };
    const ganhos = { g: criarGanho(...CAL.g), m: criarGanho(...CAL.m), a: criarGanho(...CAL.a) };
    /* vigia de quadro (o do mock aprovado, mais tolerante): só falando, com a aba à vista e depois de
       2 s de fala; 1ª janela lenta → canvas em DPR 1; mais 2 janelas lentas seguidas → pose fixa até a
       próxima fala */
    const vigia = { medidor: criarMedidor(), fala: -1, desde: 0, ruins: 0, fixa: false, dprBaixo: false };
    let freq: Uint8Array<ArrayBuffer> | null = null;
    let raf = 0;
    let espera = 0;
    let antes = 0;
    let relTempo = 0;
    let escrito = '';
    let ociosoAte = performance.now() + OCIOSO_POR_MS;
    let leveAntes = leveRef.current;

    const escrever = (v: number) => {
      const txt = v.toFixed(3);
      if (txt === escrito) return;
      escrito = txt;
      esfera.style.setProperty('--bd-nivel', txt);
    };
    const lerBandas = (dt: number) => {
      const an = analyserRef.current;
      const ctx = ctxRef.current;
      if (!an || !ctx) return { g: 0, m: 0, a: 0 };
      if (!freq || freq.length !== an.frequencyBinCount) freq = new Uint8Array(an.frequencyBinCount);
      an.getByteFrequencyData(freq);
      const hz = ctx.sampleRate / an.fftSize;
      const f = freq;
      const media = ([lo, hi]: readonly [number, number]) => {
        const i0 = Math.max(1, Math.round(lo / hz));
        const i1 = Math.min(f.length - 1, Math.round(hi / hz));
        let s = 0;
        for (let i = i0; i <= i1; i++) s += f[i];
        return s / ((i1 - i0 + 1) * 255);
      };
      return {
        g: aplicarGanho(ganhos.g, media(BANDAS.g), dt),
        m: aplicarGanho(ganhos.m, media(BANDAS.m), dt),
        a: aplicarGanho(ganhos.a, media(BANDAS.a), dt),
      };
    };
    /* Leve, máquina fraca ou sem WebGL: a esfera numa pose (redesenha só quando a pose muda) */
    const desenharPose = () => {
      const fim = faseRef.current === 'fim';
      const chave = `${fim ? 1 : 0}|${anim.viva() ? 1 : 0}`;
      if (chave === pose) return;
      pose = chave;
      anim.pose({ recolhe: fim ? 1 : 0 });
      escrever(0);
    };
    const vigiar = (falando: boolean, dtMs: number) => {
      if (vigia.fala !== falaNumRef.current) {
        // fala nova: a esfera volta a girar (a resolução baixa, se baixou, fica)
        vigia.fala = falaNumRef.current;
        vigia.desde = relTempo;
        vigia.medidor = criarMedidor();
        vigia.ruins = 0;
        if (vigia.fixa) { vigia.fixa = false; pose = ''; esfera.classList.remove('bd-pose-fixa'); }
      }
      if (!falando || document.hidden || relTempo - vigia.desde < VIGIA_DESDE_S) { vigia.medidor = criarMedidor(); return; }
      const lento = quadroLento(vigia.medidor, dtMs);
      if (lento === false) { vigia.ruins = 0; return; }
      if (lento !== true) return;
      if (!vigia.dprBaixo) {
        vigia.dprBaixo = true;
        anim.tamanho(leveRef.current, 1);
        return;
      }
      if (++vigia.ruins >= 2) {
        // a máquina não aguenta a esfera viva: pose fixa (o CSS respira), a legenda segue
        vigia.fixa = true;
        pose = '';
        esfera.classList.add('bd-pose-fixa');
        console.warn('bom dia: quadro lento, a esfera fica parada até a próxima fala');
      }
    };

    const laco = (agoraMs: number) => {
      raf = 0;
      const dtMs = antes ? agoraMs - antes : 0;
      const dt = antes ? Math.min(0.05, Math.max(0, dtMs / 1000)) : 1 / 60;
      antes = agoraMs;
      relTempo += dt;
      const fase = faseRef.current;
      if (leveRef.current !== leveAntes) { leveAntes = leveRef.current; anim.tamanho(leveAntes); pose = ''; }
      let alvo = { g: 0, m: 0, a: 0 };

      // 1. o relógio da fala move a legenda (e diz quando acabou)
      const rel = relogioRef.current;
      const ctx = ctxRef.current;
      const mapa = mapaRef.current?.mapa;
      const vivaAgora = !leveRef.current && !vigia.fixa && anim.viva();
      if (rel === 'audio' && ctx && mapa) {
        const t = ctx.currentTime - t0Ref.current;
        const i = fraseNoTempo(mapa, t);
        if (i !== atualRef.current) irPara(i);
        pintarLegenda(progressoFrase(mapa, i, t));
        if (t >= mapa.voz.fimVoz + DEPOIS_DA_VOZ_S) terminar();
        else if (vivaAgora && t > 0 && t < mapa.voz.fimVoz + 0.1) alvo = lerBandas(dt);
      } else if (rel === 'frase') {
        const i = atualRef.current;
        const tr = trechosRef.current;
        const fr = fraseRef.current;
        const ms = performance.now();
        if (i >= 0 && tr[i]) {
          const porTempo = (ms - fr.ini) / Math.max(1, fr.dur);
          const pc = fr.char != null ? fr.char / (tr[i].texto.length || 1) : 0;   // a voz do navegador diz a letra
          const prog = fr.char != null ? Math.max(pc, Math.min(porTempo, pc + 0.25)) : porTempo;
          pintarLegenda(Math.max(0, Math.min(1, prog)));
        }
        // sem voz para medir: um respirar calmo dentro da frase (nunca sílaba falsa)
        const dentro = ms >= fr.ini && ms <= fr.ini + fr.dur;
        const v = dentro ? respiracaoCalma(ms / 1000) : 0.05;
        alvo = { g: v, m: v * 0.9, a: v * 0.7 };
      }

      // 2. contagem dos números quando o painel sobe (no mesmo laço)
      const cont = contagemRef.current;
      if (cont) {
        const p = Math.max(0, Math.min(1, (agoraMs - cont.ini) / 900));
        const e = 1 - Math.pow(1 - p, 3);
        for (const a of cont.alvos) {
          const v = String(Math.round(a.ate * e));
          if (a.no.nodeValue !== v) a.no.nodeValue = v;
        }
        if (p >= 1) contagemRef.current = null;
      }

      // 3. a esfera segue a voz: sobe rápido, desce macio; o lento respira com a frase
      const seg = (v: number, a: number, sobe: number, desce: number) => v + (a - v) * (1 - Math.exp(-dt * (a > v ? sobe : desce)));
      niv.g = seg(niv.g, alvo.g, 14, 5);
      niv.m = seg(niv.m, alvo.m, 16, 6);
      niv.a = seg(niv.a, alvo.a, 20, 7.5);
      niv.geral = seg(niv.geral, 0.45 * alvo.g + 0.4 * alvo.m + 0.15 * alvo.a, 12, 5);
      niv.lento = seg(niv.lento, niv.geral, 2.2, 1.4);
      if (est.abre < 1) est.abre = Math.min(1, est.abre + dt / 1.1);
      est.recolhe = fase === 'fim' ? Math.min(1, est.recolhe + dt / 1.15) : Math.max(0, est.recolhe - dt / 0.9);
      const brilho = brilhoRef.current;
      brilhoRef.current = brilho > 0.002 ? brilho * Math.exp(-2.4 * dt) : 0;

      // 4. desenho (o vigia mede antes: um quadro lento pode parar a esfera já neste)
      const falando = fase === 'falando';
      vigiar(falando, dtMs);
      const estatico = leveRef.current || vigia.fixa || !anim.viva();
      if (estatico) desenharPose();
      else {
        anim.quadro(niv.geral, { grave: niv.g, medio: niv.m, agudo: niv.a }, relTempo,
          { abre: est.abre, recolhe: est.recolhe, brilho, lento: niv.lento });
        escrever(niv.geral);
      }

      // 5. ela calou e tudo assentou: pousada no alto (ou numa pose) o laço dorme
      const quieta = niv.geral < 0.004 && niv.lento < 0.004 && brilhoRef.current === 0;
      if (rel === 'parado' && !cont && (estatico || (fase === 'fim' && est.recolhe >= 1 && quieta))) {
        if (!estatico) {
          niv.g = niv.m = niv.a = niv.geral = niv.lento = 0;
          anim.pose({ recolhe: 1 });
          escrever(0);
        }
        esfera.classList.add('bd-repouso');
        antes = 0;
        return;
      }
      // à espera do play (pode ficar horas: aberta às 8h, a pessoa chega às 9h): o redemoinho gira
      // devagar alguns segundos e o laço dorme — a respiração segue no CSS
      if (rel === 'parado' && !cont && fase !== 'fim' && est.abre >= 1 && est.recolhe === 0 && quieta) {
        if (agoraMs > ociosoAte) { esfera.classList.add('bd-repouso'); antes = 0; return; }
        espera = window.setTimeout(() => { espera = 0; raf = requestAnimationFrame(laco); }, OCIOSO_MS);
        return;
      }
      raf = requestAnimationFrame(laco);
    };
    acordarRef.current = () => {
      esfera.classList.remove('bd-repouso');
      ociosoAte = performance.now() + OCIOSO_POR_MS;
      if (espera) { window.clearTimeout(espera); espera = 0; }
      if (!raf) raf = requestAnimationFrame(laco);
    };
    acordarRef.current();

    // a tela mudou de tamanho: refaz o canvas e redesenha (dormindo, a pose atual)
    const refazer = () => anim.tamanho(leveRef.current);
    window.addEventListener('resize', refazer);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(espera);
      raf = 0;
      espera = 0;
      acordarRef.current = () => undefined;
      window.removeEventListener('resize', refazer);
      anim.destruir();
      tela.remove();
    };
  }, [irPara, pintarLegenda, terminar]);

  /* Leve ligou/desligou com a tela aberta: refaz a pose */
  useEffect(() => { acordar(); }, [leve, acordar]);
  /* cada fase nova acorda o laço (pose, abre/recolhe da esfera, alguns segundos de giro) */
  useEffect(() => { acordar(); }, [fase, acordar]);

  /* o painel subiu: números contam (no laço), o foco vai para "Começar o dia", o leitor ouve o resumo */
  useEffect(() => {
    if (fase !== 'fim') return;
    const painel = painelRef.current;
    if (painel && resumo && !leveRef.current) {
      const alvos: Array<{ no: Text; ate: number }> = [];
      painel.querySelectorAll('.bd-valor').forEach((el) => {
        const no = el.firstChild;
        const ate = Number(no?.nodeValue);
        if (no instanceof Text && Number.isFinite(ate) && ate > 0) { no.nodeValue = '0'; alvos.push({ no, ate }); }
      });
      if (alvos.length) { contagemRef.current = { ini: performance.now() + 300, alvos }; acordar(); }
    }
    const tm = window.setTimeout(() => {
      const cta = ctaRef.current;
      const ativo = document.activeElement;
      if (cta && !(ativo && painel?.contains(ativo))) cta.focus({ preventScroll: true });
    }, FOCO_CTA_MS);
    return () => {
      window.clearTimeout(tm);
      // saiu do fim no meio da contagem: os números voltam ao valor certo
      const c = contagemRef.current;
      if (c) { c.alvos.forEach((a) => { a.no.nodeValue = String(a.ate); }); contagemRef.current = null; }
    };
  }, [fase, resumo, acordar]);

  /* abertura → pronta (o play espera a pessoa); play clicado enquanto preparava → toca agora */
  useEffect(() => {
    if (fase === 'boot' && aberturaFeita && (resumo || erro) && (voz || erro)) setFase('pronta');
  }, [fase, aberturaFeita, resumo, erro, voz]);
  useEffect(() => {
    if (fase !== 'pronta' || !querTocar) return;
    setQuerTocar(false);
    if (!erro) tocar();
  }, [fase, querTocar, erro, tocar]);

  useEffect(() => () => { pararTudo(); window.clearTimeout(saidaRef.current); }, [pararTudo]);

  const saidaTelaRef = useRef(0);
  useEffect(() => () => window.clearTimeout(saidaTelaRef.current), []);
  const concluir = useCallback(() => {
    if (saidaTelaRef.current) return;
    pararTudo();
    if (leveRef.current) { saidaTelaRef.current = -1; aoConcluir(); return; }
    setFechando(true);
    saidaTelaRef.current = window.setTimeout(aoConcluir, SAIDA_MS);
  }, [aoConcluir, pararTudo]);

  /** "Pular" (ou Esc) durante a fala: para a voz e sobe o painel. "Ver sem áudio" faz o mesmo antes do play. */
  const pular = useCallback(() => { if (faseRef.current !== 'fim') terminar(); }, [terminar]);

  /* Tab fica preso no diálogo (o sistema atrás não recebe foco) — no document: vale até com o foco no <body> */
  const prenderTab = useCallback((e: KeyboardEvent) => {
    const raiz = veuRef.current;
    if (!raiz) return;
    const alvos = Array.from(raiz.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'))
      .filter(visivel);
    if (!alvos.length) { e.preventDefault(); return; }
    const primeiro = alvos[0];
    const ultimo = alvos[alvos.length - 1];
    const ativo = document.activeElement;
    if (ativo && ativo.closest('.bd-previa')) return;   // a barra da prévia (só no demo local) fica fora do ciclo
    const dentro = !!ativo && raiz.contains(ativo) && ativo !== raiz;
    if (e.shiftKey && (!dentro || ativo === primeiro)) { e.preventDefault(); ultimo.focus(); }
    else if (!e.shiftKey && (!dentro || ativo === ultimo)) { e.preventDefault(); primeiro.focus(); }
  }, []);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        const f = faseRef.current;
        if (f === 'falando' || f === 'voltando') pular(); else concluir();
        return;
      }
      if (e.key === 'Tab') { prenderTab(e); return; }
      // Enter/Espaço tocam o resumo — menos num botão focado (Ver sem áudio, silenciar…): ele faz o próprio clique
      if ((e.key === 'Enter' || e.key === ' ') && !e.repeat && !erroRef.current && (faseRef.current === 'pronta' || faseRef.current === 'boot')) {
        const alvo = e.target as Element | null;
        if (alvo?.closest?.('button, a[href], input, select, textarea, [contenteditable="true"]')) return;
        e.preventDefault();
        clicarPlay();
      }
    };
    document.addEventListener('keydown', tecla);
    return () => document.removeEventListener('keydown', tecla);
  }, [clicarPlay, concluir, prenderTab, pular]);

  /** "Ouvir de novo": o painel desce, a esfera volta ao meio e ela fala de novo (o clique libera o som) */
  const ouvirDeNovo = () => {
    const ctx = ctxRef.current;
    if (ctx && ctx.state !== 'running') ctx.resume().catch(() => undefined);   // dentro do gesto
    pararTudo();
    fimRef.current = false;
    setFase('voltando');
    veuRef.current?.focus({ preventScroll: true });
    const exec = execRef.current;
    window.setTimeout(() => { if (execRef.current === exec) tocar(); }, leveRef.current ? 0 : DE_NOVO_MS);
  };

  const alternarMudo = () => {
    const novo = !mudoRef.current;
    setMudo(novo);
    mudoRef.current = novo;
    salvarMudo(novo, uid);
    const ctx = ctxRef.current;
    if (relogioRef.current === 'audio' && ganhoRef.current && ctx) {
      ganhoRef.current.gain.setTargetAtTime(novo ? 0 : 1, ctx.currentTime, 0.03);
      return;
    }
    // falando pelo relógio (sem voz da IA / voz do navegador): segue da frase atual no modo novo
    if (relogioRef.current === 'frase') tocar(Math.max(0, atualRef.current));
  };

  /* ---------- tela ---------- */
  const pn = primeiroNome(nome);
  const ehGestor = resumo ? resumo.modo === 'gestor' : gestor;
  const tarde = ehGestor && momento === 'tarde';
  const sd = saudacaoDoDia(agora);
  useLarguraEm(olaRef, `${ehGestor ? 'g' : 'v'}|${tarde ? 't' : 'm'}|${sd}|${pn}`);
  const dataLonga = agora.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  const data = dataLonga.charAt(0).toUpperCase() + dataLonga.slice(1);
  const hora = agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  /* a saudação do vendedor encolhe com o nome (e nunca invade os cartões) */
  const tamOla = pn.length > 10 ? ' bd-ola-p' : pn.length > 8 ? ' bd-ola-m' : '';

  /* a tela do play: a saudação + uma linha discreta + "Ouvir o resumo" */
  const saudacaoTela = `${sd}${pn ? `, ${pn}` : ''}.`;
  const linhaPronta = tarde ? 'O resumo do dia está pronto.' : 'Seu resumo da manhã está pronto.';
  const naTelaDoPlay = fase === 'boot' || fase === 'pronta';
  /* "Preparando…" só quando a espera passou da abertura (ou o play já foi clicado) — sem piscar */
  const preparando = fase === 'boot' && (aberturaFeita || querTocar) && !((resumo || erro) && (voz || erro) && aberturaFeita);
  const linhaPlay = erro ? ERRO_DADOS : preparando ? 'Preparando o seu resumo…' : linhaPronta;

  const falandoAgora = fase === 'falando' && atual >= 0 ? trechos[atual] : null;
  const fraseSr = naTelaDoPlay ? `${saudacaoTela} ${linhaPlay}`
    : fase === 'fim' ? (resumo ? textoResumo(nome, resumo, opFala) : '')
      : falandoAgora ? falandoAgora.texto : '';
  /* na tela: a frase que sai (0,12 s) e a atual */
  const legendas: number[] = [];
  if ((fase === 'falando' || fase === 'fim') && atual >= 0 && atual < trechos.length) {
    if (saindo != null && saindo !== atual && saindo < trechos.length) legendas.push(saindo);
    legendas.push(atual);
  }

  /* ---------- o painel do VENDEDOR: novos, sem resposta e as informações importantes ---------- */
  type Info = { id: IdTrecho; ic: ReactNode; titulo: string; sub?: ReactNode; valor?: number; tom?: 'alerta' | 'calmo' };
  const vend = resumo?.modo === 'vendedor' ? resumo : null;
  const infos: Info[] = [];
  if (vend) {
    if (vend.passados > 0) {
      infos.push({ id: 'passados', ic: Ic.passados, titulo: vend.passados === 1 ? 'Cliente passado pelo robô' : 'Clientes passados pelo robô', sub: 'esperando atendimento', valor: vend.passados });
    }
    if (vend.presenciais > 0) {
      infos.push({ id: 'presenciais', ic: Ic.presencial, titulo: vend.presenciais === 1 ? 'Atendimento presencial' : 'Atendimentos presenciais', sub: vend.presenciais === 1 ? 'marcado para hoje' : 'marcados para hoje', valor: vend.presenciais });
    }
    if (!infos.length) infos.push({ id: 'nenhum', ic: Ic.ok, titulo: 'Nada urgente por enquanto', tom: 'calmo' });
  }
  const painelVendedor = (
    <div className="bd-quadro">
      <div className="bd-nums">
        <article className="bd-cartao bd-num bd-surge bd-surge-2">
          <span className="bd-rot">Novos clientes</span>
          <div className={`bd-valor${vend ? '' : ' bd-valor-vazio'}`}>{vend ? String(vend.novos) : '—'}</div>
          <p className="bd-sub">desde o fim do último expediente</p>
        </article>
        <article className="bd-cartao bd-num bd-surge bd-surge-3">
          <span className="bd-rot">Sem resposta</span>
          <div className={`bd-valor${vend ? '' : ' bd-valor-vazio'}`}>{vend ? String(vend.semResposta) : '—'}</div>
          <p className="bd-sub">esperando você</p>
        </article>
      </div>

      <article className="bd-cartao bd-info bd-surge bd-surge-4">
        <h2 className="bd-info-tit">Informações importantes</h2>
        <ul className="bd-lista">
          {vend
            ? infos.map((a) => (
              <li key={a.id} className={`bd-item${a.tom ? ` bd-${a.tom}` : ''}`}>
                <span className="bd-item-ic" aria-hidden>{a.ic}</span>
                <span className="bd-item-tx"><b>{a.titulo}</b>{a.sub && <small>{a.sub}</small>}</span>
                {a.valor != null && <span className="bd-item-v">{a.valor}</span>}
              </li>
            ))
            : erro
              ? (
                <li className="bd-item bd-calmo">
                  <span className="bd-item-ic" aria-hidden>{Ic.alerta}</span>
                  <span className="bd-item-tx"><b>Sem dados agora</b><small>a sua fila está no WhatsApp</small></span>
                </li>
              )
              : Array.from({ length: 2 }, (_, i) => (
                <li key={i} className="bd-item bd-item-vazio" aria-hidden>
                  <span className="bd-item-ic" />
                  <span className="bd-item-tx"><i /><i /></span>
                </li>
              ))}
        </ul>
      </article>
    </div>
  );

  /* ---------- o painel do GESTOR: 6 cartões do MESMO tamanho, 3 por linha (manhã e 17h em ordens próprias) ----------
     a anatomia do vendedor (.bd-num): o rótulo no alto; o valor e o detalhe presos EMBAIXO (.bd-g-pe). O valor
     fica numa caixa da altura do número (.bd-g-v): o nome assenta na linha de base do número e o detalhe começa
     na mesma altura em toda a linha; a sobra vira espaço no meio, igual nos seis. As campanhas dos leads ficam
     AO LADO do número (sobem para o espaço do meio); os casos críticos, embaixo, no máximo 3 (casosDoPainel:
     os números caídos viram um item só, como na fala). Nada aqui cresce com os dados. */
  const ges = resumo?.modo === 'gestor' ? resumo : null;
  const grupos = ges ? agruparCampanhas(ges.porCampanha) : [];
  const lider = lideresCampanha(grupos);
  const casos = ges ? casosDoPainel(ges.criticos) : [];
  const VAZIO = ' ';   // segura a altura da linha enquanto os números não chegam
  const caixa = (conteudo: ReactNode) => <div className="bd-g-v">{conteudo}</div>;
  /* min-width = os dígitos do valor final: a contagem (0 → 125) não mexe na largura (nem na lista ao lado) */
  const valor = (n: number | undefined) => {
    const d = ges && n != null ? String(n).length : 1;
    return caixa(
      <div className={`bd-valor${ges ? '' : ' bd-valor-vazio'}`} style={{ minWidth: `calc(${d}ch - ${(d * 0.05).toFixed(2)}em)` }}>
        {ges && n != null ? String(n) : '—'}
      </div>,
    );
  };
  /* nome no lugar do número (campanha, vendedor): o comprido (empate) desce de 25 para 22 e vai a 2 linhas,
     dentro da mesma caixa — o detalhe embaixo não se mexe */
  const nomeCartao = (txt: string | null) => caixa(
    <p className={`bd-g-nome${txt ? '' : ' bd-g-vazio'}${txt && txt.length > 18 ? ' bd-g-nome-longo' : ''}`} title={txt ?? undefined}>{txt ?? '—'}</p>,
  );
  const detalhe = (txt: string | null) => <p className="bd-sub" title={txt ?? undefined}>{txt ?? VAZIO}</p>;
  const cartao = (id: IdTrecho, linha: 1 | 2, rotulo: string, corpo: ReactNode, extra = '') => (
    <article key={id} className={`bd-cartao bd-g${extra} bd-surge bd-surge-${linha + 1}`} data-trecho={id}>
      <span className="bd-rot">{rotulo}</span>
      <div className="bd-g-pe">{corpo}</div>
    </article>
  );
  const vendedoresCartao = (m: Vendedores | null, vazio: string) => (
    <>{nomeCartao(m ? listaE(m.nomes) : null)}{detalhe(ges ? (m ? subVendedores(m) : vazio) : null)}</>
  );
  const cartoesGestor = (linhas: Array<Array<[IdTrecho, string, ReactNode, string?]>>) =>
    linhas.flatMap((l, i) => l.map(([id, rot, corpo, extra]) => cartao(id, (i + 1) as 1 | 2, rot, corpo, extra)));
  const cLeads: [IdTrecho, string, ReactNode, string] = ['leads', 'Leads hoje', (
    <>
      <div className="bd-g-numlista">
        {valor(ges?.chegaram)}
        {ges && grupos.length > 0 && (
          <ul className="bd-g-lista">
            {linhasCampanha(grupos).map((l) => (
              <li key={l.rotulo} title={`${l.rotulo}: ${l.n}`}>
                <span>{l.prefixo && <span className="bd-g-pref">{l.prefixo}</span>}{l.curto}</span><b>{l.n}</b>
              </li>
            ))}
          </ul>
        )}
      </div>
      {detalhe(ges ? (ges.chegaram > 0 ? 'até o momento' : 'nenhum lead ainda') : null)}
    </>
  ), ' bd-g-leads'];
  const cMelhorCampanha: [IdTrecho, string, ReactNode] = ['melhor-campanha', 'Melhor campanha', (
    <>
      {nomeCartao(lider ? listaE(lider.nomes.map((x) => x.rotulo)) : null)}
      {detalhe(ges ? (lider ? `${qtd(lider.n, 'lead', 'leads')}${lider.nomes.length > 1 ? ' cada' : ''}` : 'nenhum lead ainda') : null)}
    </>
  )];
  const cNe: [IdTrecho, string, ReactNode] = ['nao-elegiveis', 'Não elegíveis', (
    <>{valor(ges?.naoElegiveis)}{detalhe(ges ? detalheNaoElegiveis(ges) : null)}</>
  )];
  const cFechados: [IdTrecho, string, ReactNode] = ['fechados', 'Fechados hoje', (
    <>
      {valor(ges?.fechadosHoje)}
      {detalhe(ges ? (ges.fechadosHoje <= 0 ? 'nenhum ainda' : ges.fechadosHoje === 1 ? 'contrato fechado' : 'contratos fechados') : null)}
    </>
  )];
  const cOntem: [IdTrecho, string, ReactNode] = ['melhor-ontem', 'Melhor vendedor de ontem', vendedoresCartao(ges?.melhorOntem ?? null, 'nenhum contrato ontem')];
  const cHoje: [IdTrecho, string, ReactNode] = ['melhor-vendedor', 'Quem mais vendeu hoje', vendedoresCartao(ges?.melhorHoje ?? null, 'ninguém fechou ainda')];
  /* sem caso: "Nenhum" no lugar do valor (a fala diz "Nenhum caso crítico no momento.") */
  const cCriticos: [IdTrecho, string, ReactNode, string] = ['criticos', 'Casos críticos', (
    ges && casos.length
      ? (
        <ul className="bd-g-casos">
          {casos.map((c) => (
            <li key={c.k} className="bd-g-caso">
              <span className="bd-g-caso-ic" aria-hidden>{Ic.alerta}</span>
              <span className="bd-g-caso-tx"><b title={c.titulo}>{c.titulo}</b>{c.sub && <small title={c.sub}>{c.sub}</small>}</span>
            </li>
          ))}
        </ul>
      )
      : <>{nomeCartao(ges ? 'Nenhum' : null)}{detalhe(ges ? 'no momento' : null)}</>
  ), ' bd-g-criticos'];
  const painelGestor = (
    <div className="bd-quadro-g">
      {tarde
        ? cartoesGestor([[cFechados, cHoje, cMelhorCampanha], [cLeads, cNe, cCriticos]])
        : cartoesGestor([[cLeads, cMelhorCampanha, cNe], [cFechados, cOntem, cCriticos]])}
    </div>
  );

  return (
    <div
      ref={veuRef}
      className={`bd-veu bd-fase-${fase}${leve ? ' bd-leve' : ''}${ehGestor ? ' bd-gestor' : ''}${tarde ? ' bd-tarde' : ''}${fechando ? ' bd-fechando' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={tarde ? 'Diagnóstico do dia do Atenvo' : 'Bom dia do Atenvo'}
      tabIndex={-1}
    >
      <header className="bd-topo">
        <div className="bd-marca">
          <LogoMono className="bd-logo" />
          <span>Atenvo</span>
        </div>
        <div className="bd-topo-ctrl">
          <button type="button" className="bd-pular" onClick={pular}>
            Pular <kbd className="bd-kbd">Esc</kbd>
          </button>
          <button
            type="button"
            className="bd-ic"
            onClick={alternarMudo}
            aria-pressed={mudo}
            aria-label="Silenciar a voz"
            title={mudo ? 'Ligar a voz' : 'Silenciar a voz'}
          >
            {mudo ? Ic.mudo : Ic.som}
          </button>
        </div>
      </header>

      <div className="bd-esfera" ref={esferaRef} aria-hidden>
        {/* o canvas da esfera nasce no efeito do laço (um por montagem) */}
        <div className="bd-esfera-corpo" ref={corpoRef}>
          <i className="bd-esfera-estatica" />
        </div>
      </div>

      <div className="bd-fala">
        {/* leitor de tela: a frase inteira, uma vez por frase (a legenda palavra a palavra fica oculta) */}
        <p className="bd-sr" aria-live="polite">{fraseSr}</p>
        {naTelaDoPlay ? (
          <div className="bd-play-caixa">
            <p className="bd-play-ola">{saudacaoTela}</p>
            <p className={`bd-play-linha${erro ? ' bd-erro' : ''}`}>{linhaPlay}</p>
            {erro ? (
              <button ref={playRef} type="button" className="bd-play bd-play-so-texto" onClick={concluir}>
                <span>Continuar</span>
              </button>
            ) : (
              <>
                <button
                  ref={playRef}
                  type="button"
                  className={`bd-play${querTocar ? ' bd-play-espera' : ''}`}
                  onClick={clicarPlay}
                  aria-busy={querTocar || undefined}
                >
                  <span className="bd-play-ic" aria-hidden>{IcPlay}</span>
                  <span>Ouvir o resumo</span>
                </button>
                <button type="button" className="bd-sem-audio" onClick={pular}>Ver sem áudio</button>
              </>
            )}
          </div>
        ) : (
          <div className="bd-legenda-caixa" aria-hidden>
            {legendas.map((i) => {
              const sai = i === saindo && i !== atual;
              const ps = palavras[i] ?? [];
              return (
                <p key={`${rodada}-${i}`} ref={sai ? undefined : fraseAtualRef} data-i={i} className={`bd-legenda${sai ? ' bd-sai' : ''}`}>
                  {ps.map((p, k) => (
                    <span key={k} className={p.numero ? 'bd-num-fala' : undefined}>{p.texto}</span>
                  )).flatMap((s, k) => (k ? [' ', s] : [s]))}
                </p>
              );
            })}
          </div>
        )}
      </div>

      <section
        className="bd-painel"
        ref={painelRef}
        aria-label={ehGestor ? (tarde ? 'Diagnóstico do dia' : 'O resumo da equipe hoje') : 'Seu resumo de hoje'}
      >
        <div className="bd-painel-grade">
          <div className="bd-saudacao bd-surge bd-surge-1">
            <p className="bd-hoje">{data}<span className="bd-sep" aria-hidden>·</span>{hora}</p>
            {ehGestor ? (
              <h1 ref={olaRef} className="bd-ola bd-ola-g">
                {tarde ? <><span>Diagnóstico</span> <span>do dia.</span></> : <><span>{sd},</span> <span>{pn || 'equipe'}.</span></>}
              </h1>
            ) : (
              <h1 ref={olaRef} className={`bd-ola${tamOla}`}>Olá, {pn || 'equipe'}.</h1>
            )}
            <p className="bd-fecho">{tarde ? `Bom fim de dia${pn ? `, ${pn}` : ''}!` : 'Bom trabalho!'}</p>
          </div>

          {ehGestor ? painelGestor : painelVendedor}

          <footer className="bd-rodape bd-surge bd-surge-5">
            <div className="bd-ctrl">
              <button type="button" className="bd-btn" onClick={ouvirDeNovo} disabled={!trechos.length || fase !== 'fim'}>
                {jaOuviu ? Ic.denovo : Ic.ouvir}<span>{jaOuviu ? 'Ouvir de novo' : 'Ouvir o resumo'}</span>
              </button>
            </div>
            <div className="bd-saida">
              <span className="bd-dica"><kbd className="bd-kbd">Esc</kbd>fecha</span>
              <button ref={ctaRef} type="button" className="bd-cta" onClick={concluir}>
                <span>{tarde ? 'Continuar' : 'Começar o dia'}</span>{Ic.seta}
              </button>
            </div>
          </footer>
        </div>
      </section>
    </div>
  );
}

export function BomDia({ aberta, momento, dia, gestor, aoConcluir, nome, uid, orgId }: {
  aberta: boolean;
  /** 'manha' (8h, todos) ou 'tarde' (17h, só o gestor) */
  momento: Momento;
  /** o dia (data local) em que a tela abriu: outro dia = outra tela (a key do Hud) — às 8h a tela esquecida
      aberta desde ontem remonta e prepara os números e a voz de hoje */
  dia: string;
  /** quem está em bom_dia_gestores (o Murilo) — o shell descobre pela RPC bom_dia_modo */
  gestor: boolean;
  aoConcluir: () => void;
  nome: string;
  uid: string;
  orgId: string;
}) {
  // raiz de portal atrelada a `aberta` (mesmo ciclo do ModalV2: sem nós órfãos)
  const [raiz, setRaiz] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (!aberta) return;
    const el = criarRaizPortalV2(document) as unknown as HTMLElement;
    setRaiz(el);
    return () => { el.remove(); setRaiz(null); };
  }, [aberta]);
  /* prévia: Atendente | Administrador e, para o administrador, Manhã | 17h. A pessoa escolhida
     fica guardada: o shell da demo agenda como ela (o das 17h é só do gestor) */
  const [previaGestor, setPreviaGestor] = useState(() => PREVIA && lerPreviaGestor());
  const [previaMomento, setPreviaMomento] = useState<Momento>(momento);
  useEffect(() => { if (aberta) setPreviaMomento(momento); }, [aberta, momento]);
  const escolherPessoa = (g: boolean) => { setPreviaGestor(g); salvarPreviaGestor(g); };

  if (!aberta || !raiz) return null;
  const g = PREVIA ? previaGestor : gestor;
  const m: Momento = PREVIA ? (previaGestor ? previaMomento : 'manha') : momento;
  return createPortal(
    <>
      <Hud
        key={PREVIA ? `${g ? 'gestor' : 'atendente'}-${chaveTelaBomDia({ momento: m, dia })}` : chaveTelaBomDia({ momento: m, dia })}
        aoConcluir={aoConcluir}
        nome={PREVIA ? (g ? 'Murilo' : 'Juliana') : nome}
        uid={uid}
        orgId={orgId}
        gestor={g}
        momento={m}
        voz={VOZ_BOM_DIA}
        horaFixa={PREVIA ? (m === 'tarde' ? 17 : 8) : null}
        arquivoDemo={PREVIA ? `/demo-midia/bom-dia-${g ? `gestor-${m}` : 'atendente'}-${VOZ_BOM_DIA.toLowerCase()}.wav` : null}
      />
      {PREVIA && (
        <div className={`bd-previa${g ? ' bd-previa-g' : ''}`} role="group" aria-label="Prévia: trocar a pessoa e o horário">
          <span>Prévia</span>
          <button type="button" aria-pressed={!g} onClick={() => escolherPessoa(false)}>Atendente</button>
          <button type="button" aria-pressed={g} onClick={() => escolherPessoa(true)}>Administrador</button>
          {g && (
            <>
              <i className="bd-previa-sep" aria-hidden />
              <button type="button" aria-pressed={m === 'manha'} onClick={() => setPreviaMomento('manha')}>Manhã</button>
              <button type="button" aria-pressed={m === 'tarde'} onClick={() => setPreviaMomento('tarde')}>17h</button>
            </>
          )}
        </div>
      )}
    </>,
    raiz,
  );
}
