/* ------------------------------------------------------------------
   A conversa de voz SIMULADA da demo (vite --mode demo, sem backend):
   só para ver o visual — a esfera com um sinal sintético de fala, a
   legenda palavra a palavra (a MESMA legenda da sessão real, andando
   pelo relógio) e uma pergunta/resposta roteirizada. Nada de microfone,
   rede ou Gemini. Mesma interface da sessão real (SessaoVoz).
   Roteiros (prévia local: window.__astVozRoteiro antes do clique):
   conversa (padrão) · microfone · credito · limite · silencio · queda.
   ------------------------------------------------------------------ */

import {
  TAXA_SAIDA, criarLegenda, cumprimentoReserva, faseAtiva, limiteDaSessao, proximaFase, verificarFim,
  type CodigoErroVoz, type EventoFase, type FaseVoz, type MotivoFim,
} from './assistenteVoz';
import type { BandasVoz } from './assistenteVozAudio';
import { juntarLinks, type EstadoVoz, type SessaoVoz, TIQUE_MS } from './assistenteVozSessao';
import type { LinkAssistente } from '@/data/assistente';

export type RoteiroDemo = 'conversa' | 'microfone' | 'credito' | 'limite' | 'silencio' | 'queda';
const ROTEIROS: ReadonlySet<string> = new Set<RoteiroDemo>(['conversa', 'microfone', 'credito', 'limite', 'silencio', 'queda']);
export const ehRoteiroDemo = (x: unknown): x is RoteiroDemo => typeof x === 'string' && ROTEIROS.has(x);

/** Fala sintética: sílabas ~4,6/s com pausas entre frases (determinística: o print sai igual). */
export function envelopeFala(t: number): number {
  if (t < 0) return 0;
  const frase = 0.55 + 0.45 * Math.sin(t * 0.9 + 0.4) ** 2;
  const silaba = Math.max(0, Math.sin(2 * Math.PI * 4.6 * t + 1.7 * Math.sin(t * 1.3))) ** 1.4;
  const pausa = (t % 2.6) > 2.25 ? 0.12 : 1;
  return Math.min(1, frase * (0.25 + 0.75 * silaba) * pausa);
}

const LINKS_DEMO: LinkAssistente[] = [
  { rotulo: 'Terezinha M. Alves', rota: '/whatsapp?conversa=wa-terezinha' },
  { rotulo: 'José Carlos Ferreira', rota: '/whatsapp?conversa=wa-jose' },
  { rotulo: 'Maria Aparecida Souza', rota: '/whatsapp?conversa=wa-maria' },
];

interface Passo { ms: number; fazer: () => void }

export function criarSessaoDemo(op: {
  nome: string; admin: boolean; roteiro?: RoteiroDemo; aoMudar: (e: EstadoVoz) => void; agora?: () => number;
}): SessaoVoz {
  const agora = op.agora ?? (() => performance.now());
  const legenda = criarLegenda();
  let fase: FaseVoz = 'conectando';
  let mudo = false;
  let erro: CodigoErroVoz | null = null;
  let fim: MotivoFim | null = null;
  let voce = '';
  let links: LinkAssistente[] = [];
  let falaConcluida = '';
  let pos = 0;
  let marcaFim = 0;
  let falaIni = -1;
  let falaDur = 0;
  let voceIni = -1;
  let voceDur = 0;
  let inicio = 0;
  let ultima = 0;
  const limiteS = limiteDaSessao(600);
  const timers = new Set<ReturnType<typeof setTimeout>>();
  let relogio: ReturnType<typeof setInterval> | null = null;
  let tique: ReturnType<typeof setInterval> | null = null;

  const acabou = () => fase === 'encerrada' || fase === 'erro';
  const estado = (): EstadoVoz => ({
    fase, mudo, erro, fim, limiteS, links, falaConcluida, voce,
    palavras: legenda.palavras(pos),
  });
  const emitir = () => op.aoMudar(estado());
  const mudar = (e: EventoFase) => { fase = proximaFase(fase, e); };
  const depois = (ms: number, fn: () => void) => {
    const t = setTimeout(() => { timers.delete(t); if (!acabou()) fn(); }, ms);
    timers.add(t);
  };
  const parar = () => {
    for (const t of timers) clearTimeout(t);
    timers.clear();
    if (relogio) { clearInterval(relogio); relogio = null; }
    if (tique) { clearInterval(tique); tique = null; }
  };

  /** ela "fala" o texto em `dur` s: as palavras recebem marcas espaçadas e a posição anda pelo relógio */
  const falar = (texto: string, dur: number, depoisDe?: () => void) => {
    legenda.limpar();
    const palavras = texto.split(/\s+/).filter(Boolean);
    const total = Math.round(dur * TAXA_SAIDA);
    const base = pos;
    palavras.forEach((p, i) => legenda.adicionar(`${i ? ' ' : ''}${p}`, base + Math.round(((i + 0.6) / palavras.length) * total)));
    marcaFim = base + total;
    falaIni = agora();
    falaDur = dur;
    mudar({ tipo: 'audio' });
    ultima = agora();
    emitir();
    depois(dur * 1000 + 250, () => {
      pos = marcaFim;
      legenda.concluir();
      falaConcluida = legenda.texto();
      falaIni = -1;
      mudar({ tipo: 'tocou_tudo' });
      ultima = agora();
      emitir();
      depoisDe?.();
    });
  };

  /** você "pergunta": a legenda cinza cresce palavra a palavra */
  const perguntar = (texto: string, dur: number, depoisDe: () => void) => {
    if (mudo) { depois(1500, () => perguntar(texto, dur, depoisDe)); return; }
    const palavras = texto.split(/\s+/);
    voce = '';
    links = [];
    legenda.limpar();
    voceIni = agora();
    voceDur = dur;
    emitir();
    palavras.forEach((_, i) => depois(Math.round(((i + 1) / palavras.length) * dur * 1000), () => {
      voce = palavras.slice(0, i + 1).join(' ');
      ultima = agora();
      emitir();
    }));
    depois(dur * 1000 + 450, () => { voceIni = -1; depoisDe(); });
  };

  const consultar = (ms: number, depoisDe: () => void) => {
    mudar({ tipo: 'ferramenta' });
    emitir();
    depois(ms, depoisDe);
  };

  const roteiro = (r: RoteiroDemo): Passo[] => {
    const ola = cumprimentoReserva(op.nome);
    const erroEm = (c: CodigoErroVoz, ms: number): Passo[] => [{ ms, fazer: () => { erro = c; mudar({ tipo: 'erro' }); parar(); emitir(); } }];
    if (r === 'microfone') return erroEm('microfone_negado', 650);
    if (r === 'credito') return erroEm('sem_credito', 900);
    if (r === 'limite') return erroEm('limite_dia', 900);
    const abrir: Passo = { ms: 900, fazer: () => { mudar({ tipo: 'pronta' }); inicio = agora(); ultima = inicio; emitir(); } };
    if (r === 'silencio') {
      return [abrir, { ms: 1100, fazer: () => falar(ola, 1.7, () => depois(1600, () => { fim = 'silencio'; mudar({ tipo: 'encerrar' }); parar(); emitir(); })) }];
    }
    if (r === 'queda') {
      return [abrir, { ms: 1100, fazer: () => falar(ola, 1.7, () => depois(1400, () => { erro = 'queda'; mudar({ tipo: 'erro' }); parar(); emitir(); })) }];
    }
    return [
      abrir,
      {
        ms: 1100,
        fazer: () => falar(ola, 1.7, () => depois(1300, () => perguntar('Quantos clientes eu fechei hoje?', 1.5, () => consultar(1200, () => {
          falar('Hoje você fechou 5 clientes. No mês do CAF, desde 11/10, já são 32.', 5.2, () => depois(2200, () => {
            perguntar('E o que eu tenho para resolver?', 1.6, () => consultar(1100, () => {
              links = juntarLinks([], LINKS_DEMO);
              falar('Você tem 8 clientes sem resposta e 3 passados pelo robô. Quem espera há mais tempo é a Terezinha, desde ontem.', 6.6);
            }));
          }));
        })))),
      },
    ];
  };

  return {
    iniciar() {
      emitir();
      const r: RoteiroDemo = op.roteiro ?? 'conversa';
      let ms = 0;
      for (const p of roteiro(r)) { ms += p.ms; depois(ms, p.fazer); }
      // a posição da "fala" anda pelo relógio (a legenda acende como na real)
      relogio = setInterval(() => {
        if (falaIni < 0) return;
        const t = (agora() - falaIni) / 1000;
        pos = Math.min(marcaFim, marcaFim - Math.round(falaDur * TAXA_SAIDA) + Math.round(t * TAXA_SAIDA));
        emitir();
      }, 90);
      tique = setInterval(() => {
        if (acabou() || !inicio) return;
        const m = verificarFim({ agora: agora(), inicio, ultimaAtividade: ultima, limiteS, fase });
        if (m) { fim = m; mudar({ tipo: 'encerrar' }); parar(); emitir(); }
      }, TIQUE_MS);
    },
    alternarMudo() {
      if (acabou()) return;
      mudo = !mudo;
      ultima = agora();
      emitir();
    },
    encerrar() {
      if (acabou()) return;
      parar();
      mudar({ tipo: 'encerrar' });
      emitir();
    },
    bandas(): BandasVoz {
      if (acabou() || !faseAtiva(fase)) return { g: 0, m: 0, a: 0, entrada: 0 };
      const ms = agora();
      let g = 0; let m = 0; let a = 0; let entrada = 0;
      if (falaIni >= 0) {
        const t = (ms - falaIni) / 1000;
        const e = t <= falaDur ? envelopeFala(t) : 0;
        g = e * (0.75 + 0.2 * Math.sin(t * 3.1));
        m = e * (0.8 + 0.2 * Math.sin(t * 5.3 + 1));
        a = e * e * (0.45 + 0.3 * Math.sin(t * 9.7 + 2));
      }
      if (voceIni >= 0 && !mudo) {
        const t = (ms - voceIni) / 1000;
        entrada = t <= voceDur ? 0.7 * envelopeFala(t + 0.8) : 0;
      }
      return { g, m, a, entrada };
    },
    estado,
  };
}
