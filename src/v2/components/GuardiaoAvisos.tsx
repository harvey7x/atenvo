/* ============================================================================
   Radar de Atendimento — AVISOS NA TELA (v5, desenho final aprovado em 29/10:
   "mensagens melhores, mais organizadas, ultra profissional; cliente FECHADO aparece
   separado de quem ainda está em negociação").
   Cada superfície tem um papel e NUNCA mistura as duas filas (negociação × fechado):
   - RadarBarra — a barra CONTA. Cápsula no .radar-slot da barra superior, na ordem fixa
     marca · Em negociação · Fechados · Ligar | Decisões (só gestor, depois de um fio).
     Cor do número = pior degrau da família. Três larguras medidas no encaixe (completo,
     compacto, mínimo). Fora do horário útil some; com pedido do gestor ativo, fica só o
     segmento "Pedido do gestor".
   - Central de avisos — a Central ORGANIZA. Lista suspensa na raiz de portal v2 (regra
     10), abas fixas com número e grupos Pedido do gestor → Último → 2º → 1º. É a fila
     real: sem "dispensar" — só esvazia respondendo, ligando ou decidindo.
   - GuardiaoAvisos — a tela cheia INTERROMPE, como exceção. Pedido do gestor (a qualquer
     hora) e último aviso (uma vez por cliente por episódio, no máximo uma a cada 15 min,
     só seg–sex 9h–18h). Nunca sobre a conversa aberta, durante a digitação, com a Intro
     do dia, o aviso de atualização ou a Central na tela. Uma tela por pessoa, não por
     aba do navegador.
   Avisos são PESSOAIS (dono 23/10): cada um vê só os próprios clientes; a visão da equipe
   fica no /radar. Nada aqui envia mensagem ao cliente — o Radar é interno da equipe.
   Toda frase visível vem do caderno (lib/radarTextos + lib/radarDeck).
   ============================================================================ */
import {
  Fragment, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState,
  type KeyboardEvent as TeclaReact, type MouseEvent as CliqueReact, type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  useRadarAvisos, useRadarMeus, useRadarEquipe, useVacuoDecisoes, useConcluirLigacao, useVacuoConfig, radarHorarioAberto,
  type RadarItem, type RadarFilas, type VacuoDecisao,
} from '@/data/vacuo';
import { useOrg } from '@/context/OrgContext';
import { useAuth } from '@/context/AuthContext';
import { CURR_KEY } from '../hooks/useInboxWhatsApp';
import {
  rt, rtTit, rtTxt, fmtTempo, fmtTempoLinha, fmtFalta, fmtDesde, fmtDesdeCurto, comecouHoje, iniciais, textoErroLigacao } from '../lib/radarTextos';
import {
  IcNegociacao, IcFechado, IcLigar, IcDecisao, IcGestor, IcRadar, IcDocumento, IcInteresse, IcEmDia, IcSeta,
} from './RadarIcones';
import { CLASSE_RAIZ_PORTAL, criarRaizPortalV2 } from './portal';
import './guardiaoAvisos.css';

/* ---------------------------------------------------------------------------
   Tipos, constantes e utilidades
   --------------------------------------------------------------------------- */
export type RadarAba = 'negociacao' | 'fechados' | 'ligar' | 'decisoes';
type Familia = 'negociacao' | 'fechado';
type GrupoId = 'pedido' | 'ultimo' | 'segundo' | 'primeiro';
type Prio = 'docs' | 'interesse';
type Modo = 'completo' | 'compacto' | 'minimo';

const ABAS: RadarAba[] = ['negociacao', 'fechados', 'ligar', 'decisoes'];
/** Só fallback: repete o caderno (central.aba.*). */
const ROTULO_ABA: Record<RadarAba, string> = { negociacao: 'Em negociação', fechados: 'Fechados', ligar: 'Ligar', decisoes: 'Decisões' };
const POR_GRUPO = 6;         // linhas por grupo antes de "Mostrar mais {n}"
const RECOLHE_ACIMA = 12;     // aba com mais clientes que isso: o grupo 1º aviso começa recolhido
const LARGURA_CENTRAL = 420;  // máx. 100vw − 32px
const MINIMO_PX = 280;        // encaixe mais estreito que isso: modo mínimo
const SAIDA_MS = 200;         // linha resolvida some com esmaecimento

const abaDaFamilia = (f: Familia): RadarAba => (f === 'fechado' ? 'fechados' : 'negociacao');
const rotaConversa = (conversaId: string) => '/whatsapp?conversa=' + encodeURIComponent(conversaId);
const fmtN = (n: number) => (n > 99 ? '99+' : String(n));
const minuscula = (s: string) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);
const prioDe = (p: string | null | undefined): Prio | null => (!p ? null : /document/i.test(p) ? 'docs' : 'interesse');

function piorDegrau(lista: RadarItem[]): 0 | 1 | 2 | 3 {
  return lista.reduce<0 | 1 | 2 | 3>((m, i) => (i.estagio > m ? i.estagio : m), 0);
}

/** Tempo REAL decorrido (não útil) — só no fato "Pedido há" da tela do pedido do gestor. */
function fmtCorrido(iso: string | null | undefined, agora = Date.now()): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const m = Math.max(1, Math.floor((agora - t) / 60e3));
  if (m < 60) return `${m} min`;
  if (m < 1440) { const h = Math.floor(m / 60), r = m % 60; return r ? `${h} h ${r} min` : `${h} h`; }
  const d = Math.floor(m / 1440);
  return d === 1 ? '1 dia' : `${d} dias`;
}

/** Família do cliente de um pedido do gestor (o pedido em si chega com categoria 'cutucada'). */
function familiaDoPedido(p: RadarItem, fechado: RadarItem[]): Familia {
  return fechado.some((i) => i.conversaId === p.conversaId) ? 'fechado' : 'negociacao';
}

/** Um pedido por cliente (o mais recente — a lista já vem do mais novo para o mais velho). */
function pedidosUnicos(cutucadas: RadarItem[]): RadarItem[] {
  const vistos = new Set<string>();
  const out: RadarItem[] = [];
  for (const c of cutucadas) if (!vistos.has(c.conversaId)) { vistos.add(c.conversaId); out.push(c); }
  return out;
}

/** Pedido cujo cliente não está em nenhuma das duas filas (borda rara): entra em Em negociação para não sumir. */
function pedidosOrfaos(cutucadas: RadarItem[], negociacao: RadarItem[], fechado: RadarItem[]): RadarItem[] {
  const nas = new Set([...negociacao, ...fechado].map((i) => i.conversaId));
  return pedidosUnicos(cutucadas).filter((p) => !nas.has(p.conversaId));
}

/** Dica (title) de um aviso: alerta.{família}.{estágio} com o tempo útil ao vivo + prioridade. */
function dicaAlerta(i: RadarItem, familia: Familia, diaUtil: number): string {
  const tempo = fmtTempo(i.minutosUteis, diaUtil);
  const t = i.estagio
    ? rt(`alerta.${familia}.${i.estagio}`, { tempo })
    : rt('alerta.cutucada', { tempo, gestor: i.cutucadoPorNome ?? 'O gestor' });
  const prio = familia === 'negociacao' && i.prioridade
    ? rtTxt('extra.alerta.linha_prioridade', { prioridade: minuscula(i.prioridade) })
    : '';
  return [t.titulo, [t.texto, prio].filter(Boolean).join(' ')].filter(Boolean).join(' — ');
}

function dicaLigar(i: RadarItem, diaUtil: number): string {
  const t = rt('alerta.ligar', { tempo: fmtTempo(i.minutosUteis, diaUtil) });
  return [t.titulo, t.texto].filter(Boolean).join(' — ');
}

/* ---------------------------------------------------------------------------
   Hooks pequenos
   --------------------------------------------------------------------------- */

/** Re-renderiza a cada minuto e diz se o Radar está no horário útil (seg–sex, 9h–18h). */
function useRadarAberto(): boolean {
  const cfgQ = useVacuoConfig();
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 60_000); return () => clearInterval(t); }, []);
  return radarHorarioAberto(cfgQ.data);
}

/** Dia útil do Radar em minutos (9h–18h = 540). */
function useDiaUtil(): number {
  const cfg = useVacuoConfig().data;
  return ((cfg?.horaFim ?? 18) - (cfg?.horaInicio ?? 9)) * 60;
}

/** Os avisos já chegaram do banco (mesma consulta de useRadarMeus, sem leitura extra). Consulta desligada
    ou ainda sem resposta não conta como "lista vazia": senão a primeira leitura parece entrada nova. */
function useAvisosCarregados(): boolean {
  return useRadarAvisos().data !== undefined;
}

/** Raiz de portal v2 reaproveitada por sessão (regra 10) — uma por camada. */
function useRaizPortal(marca: string): HTMLElement {
  return useMemo(() => {
    const sel = '.' + CLASSE_RAIZ_PORTAL.split(' ').join('.') + '[' + marca + ']';
    let el = document.querySelector(sel) as HTMLElement | null;
    if (!el) { el = criarRaizPortalV2(document) as unknown as HTMLElement; el.setAttribute(marca, ''); }
    return el;
  }, [marca]);
}

/** A linha resolvida fica mais 200 ms na tela, esmaecendo, no mesmo lugar (o número já mudou). */
type ComSaida<T> = { item: T; saindo: boolean };
function useComSaida<T>(lista: T[], chave: (t: T) => string): ComSaida<T>[] {
  const [anterior, setAnterior] = useState(lista);
  const [fantasmas, setFantasmas] = useState<Array<{ item: T; idx: number; ate: number }>>([]);
  if (anterior !== lista) {
    // derivado na própria renderização: a linha que saiu continua no MESMO nó e só ganha a classe de saída
    const vivos = new Set(lista.map(chave));
    const ate = Date.now() + SAIDA_MS;
    const novos = fantasmas.filter((f) => !vivos.has(chave(f.item)));
    const ja = new Set(novos.map((f) => chave(f.item)));
    anterior.forEach((item, idx) => {
      const k = chave(item);
      if (!vivos.has(k) && !ja.has(k)) novos.push({ item, idx, ate });
    });
    setAnterior(lista);
    setFantasmas(novos);
  }
  useEffect(() => {
    if (!fantasmas.length) return;
    const espera = Math.max(0, Math.min(...fantasmas.map((f) => f.ate)) - Date.now()) + 20;
    const t = setTimeout(() => setFantasmas((f) => f.filter((x) => x.ate > Date.now())), espera);
    return () => clearTimeout(t);
  }, [fantasmas]);
  return useMemo(() => {
    const out: ComSaida<T>[] = lista.map((item) => ({ item, saindo: false }));
    for (const f of [...fantasmas].sort((a, b) => a.idx - b.idx)) out.splice(Math.min(f.idx, out.length), 0, { item: f.item, saindo: true });
    return out;
  }, [lista, fantasmas]);
}

/* A tela cheia ("Ver lista") pede à barra que abra a Central na aba e no grupo certos. */
type PedidoCentral = { aba: RadarAba; grupo?: GrupoId };
const ouvintesCentral = new Set<(p: PedidoCentral) => void>();

/* ---------------------------------------------------------------------------
   Peças pequenas
   --------------------------------------------------------------------------- */

/** Ícone de prioridade nas linhas (só negociação): documento ou alvo; a dica é o selo do caderno. */
function IconePrioridade({ prioridade }: { prioridade: Prio | null }) {
  if (!prioridade) return null;
  const t = rt(prioridade === 'docs' ? 'selo.prioridade.docs' : 'selo.prioridade.interesse');
  return (
    <span className="rdr-prio-ic" role="img" aria-label={t.titulo} title={t.texto}>
      {prioridade === 'docs' ? <IcDocumento tamanho={13} /> : <IcInteresse tamanho={13} />}
    </span>
  );
}

/** Selo de prioridade ao lado do nome, na tela cheia do último aviso em negociação. */
function SeloPrioridade({ prioridade }: { prioridade: Prio | null }) {
  if (!prioridade) return null;
  const t = rt(prioridade === 'docs' ? 'selo.prioridade.docs' : 'selo.prioridade.interesse');
  return (
    <span className="rdr-tela-prio" title={t.texto}>
      {prioridade === 'docs' ? <IcDocumento tamanho={11} /> : <IcInteresse tamanho={11} />}
      <span>{t.titulo}</span>
    </span>
  );
}

function Vazio({ chave }: { chave: string }) {
  const t = rt(chave);
  return (
    <div className="rdr-vazio">
      <IcEmDia tamanho={22} />
      <b>{t.titulo}</b>
      {t.texto && <span>{t.texto}</span>}
    </div>
  );
}

/** Sino com ondas (tela do pedido do gestor). Local: o RadarIcones só tem o sino liso. */
function IcSinoOndas({ tamanho = 24 }: { tamanho?: number }) {
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false">
      <path d="M7.2 9.4a4.8 4.8 0 0 1 9.6 0c0 5.2 2.3 6.9 2.3 6.9H4.9s2.3-1.7 2.3-6.9" />
      <path d="M10.5 19.3a1.7 1.7 0 0 0 3 0" />
      <path d="M3.4 9.8a8.6 8.6 0 0 1 2.4-5.3" />
      <path d="M20.6 9.8a8.6 8.6 0 0 0-2.4-5.3" />
    </svg>
  );
}

/* ---------------------------------------------------------------------------
   Barra superior: cápsula segmentada
   --------------------------------------------------------------------------- */
type SegId = RadarAba | 'pedido';
type Seg = {
  id: SegId; aba: RadarAba; n: number;
  tom: 'u1' | 'u2' | 'u3' | 'azul' | 'decisao' | 'pedido';
  anel: boolean; rotulo: string; dica: string;
  Icone: (p: { tamanho?: number }) => ReactNode;
};
type EstadoCentral = { aba: RadarAba; grupo?: GrupoId; ancora: string | null; seq: number };

/** Elemento da cápsula que está de fato na tela (display:none não conta). */
function visivelEm(cap: HTMLElement | null, sel: string): HTMLElement | null {
  const el = cap?.querySelector<HTMLElement>(sel) ?? null;
  return el && el.offsetParent !== null ? el : null;
}

export function RadarBarra() {
  const aberto = useRadarAberto();
  const filas = useRadarMeus();
  const { negociacao, fechado, ligar, cutucadas } = filas;
  const carregado = useAvisosCarregados();
  const { currentOrg } = useOrg();
  const gestor = currentOrg.role === 'admin';
  const decisoesQ = useVacuoDecisoes();
  const decisoes = useMemo(() => (gestor ? decisoesQ.data ?? [] : []), [gestor, decisoesQ.data]);
  const location = useLocation();
  const nav = useNavigate();
  const capRef = useRef<HTMLDivElement>(null);
  const srRef = useRef<HTMLSpanElement>(null);
  const [central, setCentral] = useState<EstadoCentral | null>(null);
  const centralRef = useRef<EstadoCentral | null>(null);
  centralRef.current = central;
  const [modo, setModo] = useState<Modo>('completo');

  // segmentos na ordem fixa (nunca muda por volume); segmento com zero some
  const segs = useMemo<Seg[]>(() => {
    const nUltimo = (l: RadarItem[]) => l.filter((i) => i.estagio === 3).length;
    const dica = (chave: string, u = 0) => {
      const base = rtTxt(chave);
      return u > 0 ? `${base} ${rtTxt('extra.barra.sub_ultimo', { n: u }, `No último aviso: ${u}`)}.` : base;
    };
    const tomU = (l: RadarItem[]): Seg['tom'] => {
      const p = piorDegrau(l);
      return p >= 3 ? 'u3' : p === 2 ? 'u2' : 'u1';
    };
    const pedidos = pedidosUnicos(cutucadas);
    const segPedido = (aba: RadarAba, n: number): Seg => ({
      id: 'pedido', aba, n, tom: 'pedido', anel: false,
      rotulo: rtTit('extra.barra.pedido', {}, 'Pedido do gestor'),
      dica: rtTxt('extra.barra.pedido', {}, 'O gestor pediu resposta imediata a um cliente seu. Clique para ver.'),
      Icone: IcGestor,
    });
    if (!aberto) {
      // fora de seg–sex, 9h–18h a cápsula some; um pedido do gestor ativo aparece sozinho
      return pedidos.length ? [segPedido(abaDaFamilia(familiaDoPedido(pedidos[0]!, fechado)), pedidos.length)] : [];
    }
    const naNeg = new Set(negociacao.map((i) => i.conversaId));
    const naFec = new Set(fechado.map((i) => i.conversaId));
    const orfaos = pedidos.filter((p) => !naNeg.has(p.conversaId) && !naFec.has(p.conversaId));
    const out: Seg[] = [
      {
        id: 'negociacao', aba: 'negociacao', n: negociacao.length, tom: tomU(negociacao),
        anel: pedidos.some((p) => naNeg.has(p.conversaId)),
        rotulo: rtTit('barra.negociacao', {}, 'Em negociação'), dica: dica('barra.negociacao', nUltimo(negociacao)), Icone: IcNegociacao,
      },
      {
        id: 'fechados', aba: 'fechados', n: fechado.length, tom: tomU(fechado),
        anel: pedidos.some((p) => naFec.has(p.conversaId)),
        rotulo: rtTit('barra.fechados', {}, 'Fechados'), dica: dica('barra.fechados', nUltimo(fechado)), Icone: IcFechado,
      },
    ];
    if (orfaos.length) out.push(segPedido('negociacao', orfaos.length));
    out.push({
      id: 'ligar', aba: 'ligar', n: ligar.length, tom: 'azul', anel: false,
      rotulo: rtTit('barra.ligar', {}, 'Ligar'), dica: dica('barra.ligar'), Icone: IcLigar,
    });
    if (gestor) {
      out.push({
        id: 'decisoes', aba: 'decisoes', n: decisoes.length, tom: 'decisao', anel: false,
        rotulo: rtTit('barra.decisoes', {}, 'Decisões'), dica: dica('barra.decisoes'), Icone: IcDecisao,
      });
    }
    return out.filter((s) => s.n > 0);
  }, [aberto, gestor, negociacao, fechado, ligar, cutucadas, decisoes.length]);

  const visivel = segs.length > 0;
  // modo mínimo: Em negociação e Fechados nunca somem nem se somam; o resto vai para "Mais"
  const temPrimario = segs.some((s) => s.id === 'negociacao' || s.id === 'fechados');
  const someNoMinimo = (s: Seg) => temPrimario && s.id !== 'negociacao' && s.id !== 'fechados';
  const ocultos = segs.filter(someNoMinimo);
  const assinatura = segs.map((s) => `${s.id}:${fmtN(s.n)}`).join('|') + (ocultos.length ? '|mais' : '');

  /* LARGURA: mede o encaixe e usa o maior modo que couber (nada quebra linha nem é cortado).
     Mede a própria cápsula nos dois modos com rótulo/sem rótulo, antes da pintura. */
  const medir = useCallback(() => {
    const cap = capRef.current;
    const slot = cap?.parentElement;
    if (!cap || !slot) return;
    const disponivel = slot.clientWidth;
    const antes = cap.getAttribute('data-modo');
    cap.setAttribute('data-medindo', '');
    cap.setAttribute('data-modo', 'completo');
    const wCompleto = cap.getBoundingClientRect().width;
    cap.setAttribute('data-modo', 'compacto');
    const wCompacto = cap.getBoundingClientRect().width;
    cap.removeAttribute('data-medindo');
    if (antes) cap.setAttribute('data-modo', antes);
    const novo: Modo = disponivel < MINIMO_PX || wCompacto > disponivel ? 'minimo' : wCompleto <= disponivel ? 'completo' : 'compacto';
    setModo((m) => (m === novo ? m : novo));
  }, []);
  useLayoutEffect(() => { medir(); }, [assinatura, medir]);
  useEffect(() => {
    const slot = capRef.current?.parentElement;
    if (!visivel || !slot || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => medir());
    ro.observe(slot);
    return () => ro.disconnect();
  }, [visivel, medir]);
  useEffect(() => {
    // a fonte variável chega depois: mede de novo com a largura real dos rótulos
    document.fonts?.ready.then(() => medir()).catch(() => { /* sem API de fontes */ });
  }, [medir]);

  /* MOVIMENTO: um pulso de 1,2 s quando um cliente ENTRA no 2º ou no último aviso (nada contínuo);
     o leitor de tela ouve só as entradas no último aviso. A primeira leitura é só a base. */
  const estagiosAnt = useRef<Map<string, number> | null>(null);
  const [pulsos, setPulsos] = useState<Record<string, { seq: number; ativo: boolean }>>({});
  const [anuncio, setAnuncio] = useState('');
  useEffect(() => {
    if (!carregado) return;
    const atual = new Map<string, number>();
    const familia = new Map<string, Familia>();
    for (const i of negociacao) { atual.set(i.conversaId, i.estagio); familia.set(i.conversaId, 'negociacao'); }
    for (const i of fechado) { atual.set(i.conversaId, i.estagio); familia.set(i.conversaId, 'fechado'); }
    const ant = estagiosAnt.current;
    estagiosAnt.current = atual;
    if (!ant) return;
    const pulsa = new Set<RadarAba>();
    const noUltimo = new Set<Familia>();
    atual.forEach((e, cid) => {
      const antes = ant.get(cid) ?? 0;
      const f = familia.get(cid) ?? 'negociacao';
      if (e >= 2 && e > antes) pulsa.add(abaDaFamilia(f));
      if (e === 3 && antes < 3) noUltimo.add(f);
    });
    if (pulsa.size) {
      setPulsos((p) => {
        const nx = { ...p };
        pulsa.forEach((a) => { nx[a] = { seq: (p[a]?.seq ?? 0) + 1, ativo: true }; });
        return nx;
      });
    }
    if (noUltimo.size) {
      setAnuncio([...noUltimo].map((f) => {
        const n = (f === 'fechado' ? fechado : negociacao).filter((i) => i.estagio === 3).length;
        const rot = f === 'fechado' ? rtTit('barra.fechados', {}, 'Fechados') : rtTit('barra.negociacao', {}, 'Em negociação');
        return `${rot}. ${rtTxt('extra.barra.sub_ultimo', { n }, `No último aviso: ${n}`)}.`;
      }).join(' '));
    }
  }, [carregado, negociacao, fechado]);
  useEffect(() => {
    if (!Object.values(pulsos).some((p) => p.ativo)) return;
    // a classe sai depois do pulso: remontar a cápsula não repete a animação
    const t = setTimeout(() => setPulsos((p) => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, { ...v, ativo: false }]))), 1300);
    return () => clearTimeout(t);
  }, [pulsos]);
  useEffect(() => {
    if (!anuncio) return;
    const t = setTimeout(() => setAnuncio(''), 6000);
    return () => clearTimeout(t);
  }, [anuncio]);

  /* Central: abre na aba do segmento, ancorada sob ele; novo clique no mesmo segmento fecha. */
  const fecharCentral = useCallback((devolverFoco: boolean) => {
    const c = centralRef.current;
    setCentral(null);
    if (!devolverFoco || !c) return;
    requestAnimationFrame(() => {
      const cap = capRef.current;
      const alvo = (c.ancora ? visivelEm(cap, `[data-seg="${c.ancora}"]`) : null)
        ?? visivelEm(cap, `[data-aba="${c.aba}"]`) ?? visivelEm(cap, '[data-seg="mais"]');
      alvo?.focus();
    });
  }, []);

  const abrirCentral = useCallback((aba: RadarAba, o: { grupo?: GrupoId; ancora?: string | null; alternar?: boolean } = {}) => {
    const alvo: RadarAba = aba === 'decisoes' && !gestor ? 'negociacao' : aba;
    const c = centralRef.current;
    if (o.alternar && c && c.aba === alvo) { fecharCentral(false); return; }
    const cap = capRef.current;
    const ancora = o.ancora !== undefined ? o.ancora
      : (visivelEm(cap, `[data-aba="${alvo}"]`) ?? visivelEm(cap, '[data-seg="mais"]'))?.getAttribute('data-seg') ?? null;
    setCentral({ aba: alvo, grupo: o.grupo, ancora, seq: (c?.seq ?? 0) + 1 });
  }, [gestor, fecharCentral]);

  const trocarAba = useCallback((aba: RadarAba) => setCentral((c) => (c ? { ...c, aba, grupo: undefined } : c)), []);

  // ?radar=negociacao|fechados|ligar|decisoes abre a Central na aba (sino, notificações-resumo) e some da URL;
  // trocar de página fecha a Central
  const rotaAnt = useRef(location.pathname);
  useEffect(() => {
    const mudouRota = rotaAnt.current !== location.pathname;
    rotaAnt.current = location.pathname;
    const p = new URLSearchParams(location.search);
    const alvo = p.get('radar');
    if (alvo) {
      p.delete('radar');
      const s = p.toString();
      nav({ pathname: location.pathname, search: s ? '?' + s : '', hash: location.hash }, { replace: true });
      const aba: RadarAba = alvo === 'fechados' || alvo === 'fechado' ? 'fechados'
        : alvo === 'ligar' ? 'ligar' : alvo === 'decisoes' ? 'decisoes' : 'negociacao';
      abrirCentral(aba);
    } else if (mudouRota) {
      setCentral(null);
    }
  }, [location.pathname, location.search]); // eslint-disable-line react-hooks/exhaustive-deps

  // a tela cheia ("Ver lista") abre a Central na aba e no grupo certos
  useEffect(() => {
    const ouvir = (p: PedidoCentral) => abrirCentral(p.aba, { grupo: p.grupo });
    ouvintesCentral.add(ouvir);
    return () => { ouvintesCentral.delete(ouvir); };
  }, [abrirCentral]);

  const ancoraId = central?.ancora ?? null;
  const obterAncora = useCallback((): DOMRect | null => {
    const cap = capRef.current;
    const el = (ancoraId ? visivelEm(cap, `[data-seg="${ancoraId}"]`) : null) ?? visivelEm(cap, '[data-seg="mais"]');
    if (el) return el.getBoundingClientRect();
    if (cap) return cap.getBoundingClientRect();
    return srRef.current?.parentElement?.getBoundingClientRect() ?? null;
    // modo/assinatura: a cápsula muda de largura e a âncora anda junto
  }, [ancoraId, modo, assinatura]); // eslint-disable-line react-hooks/exhaustive-deps

  const rotuloMais = rtTit('extra.barra.mais', {}, 'Mais');

  return (
    <>
      {visivel && (
        <div ref={capRef} className="rdr-cap" data-modo={modo} role="group"
          aria-label={rtTit('barra.dica', {}, 'Radar de Atendimento')} title={rtTxt('barra.dica')}>
          <span className="rdr-cap-marca" aria-hidden><IcRadar tamanho={14} /></span>
          {segs.map((s, idx) => {
            const minOculta = someNoMinimo(s);
            const pulso = pulsos[s.id];
            const aberta = !!central && central.aba === s.aba && (s.id !== 'pedido' || central.ancora === 'pedido');
            return (
              <Fragment key={s.id}>
                {/* Decisões é gestão, não fila pessoal: um fio vertical antes dela */}
                {s.id === 'decisoes' && idx > 0 && <span className={'rdr-cap-fio' + (minOculta ? ' rdr-min-oculta' : '')} aria-hidden />}
                <button type="button" data-seg={s.id} data-aba={s.aba}
                  className={'rdr-seg rdr-s-' + s.id + ' rdr-' + s.tom + (s.anel ? ' rdr-anel' : '')
                    + (aberta ? ' rdr-on' : '') + (minOculta ? ' rdr-min-oculta' : '')}
                  title={modo === 'completo' ? s.dica : `${s.rotulo}. ${s.dica}`}
                  aria-label={`${s.rotulo}: ${fmtN(s.n)}`}
                  aria-haspopup="dialog" aria-expanded={aberta}
                  onClick={() => abrirCentral(s.aba, { ancora: s.id, alternar: true })}>
                  <span className="rdr-seg-ic"><s.Icone tamanho={14} /></span>
                  <span className="rdr-seg-rot">{s.rotulo}</span>
                  <b key={'n' + (pulso?.seq ?? 0)} className={'rdr-seg-num num' + (pulso?.ativo ? ' rdr-pulsa' : '')}>{fmtN(s.n)}</b>
                </button>
              </Fragment>
            );
          })}
          {ocultos.length > 0 && (
            <button type="button" className="rdr-cap-mais" data-seg="mais" title={rtTxt('extra.barra.mais')}
              aria-label={`${rotuloMais}: ${ocultos.map((s) => `${s.rotulo} ${fmtN(s.n)}`).join(', ')}`}
              aria-haspopup="dialog" aria-expanded={!!central && central.ancora === 'mais'}
              onClick={() => abrirCentral(ocultos[0]!.aba, { ancora: 'mais', alternar: true })}>
              {rotuloMais}
            </button>
          )}
        </div>
      )}
      <span ref={srRef} className="rdr-sr" role="status" aria-live="polite">{anuncio}</span>
      {central && (
        <RadarCentral estado={central} filas={filas} decisoes={decisoes} gestor={gestor}
          ancora={obterAncora} aoFechar={fecharCentral} aoAba={trocarAba} />
      )}
    </>
  );
}

/** Mantido por compatibilidade com o encaixe antigo da barra. */
export const RadarPilula = RadarBarra;

/* ---------------------------------------------------------------------------
   Central de avisos
   --------------------------------------------------------------------------- */
function RadarCentral({ estado, filas, decisoes, gestor, ancora, aoFechar, aoAba }: {
  estado: EstadoCentral; filas: RadarFilas; decisoes: VacuoDecisao[]; gestor: boolean;
  ancora: () => DOMRect | null; aoFechar: (devolverFoco: boolean) => void; aoAba: (a: RadarAba) => void;
}) {
  const raiz = useRaizPortal('data-radar-central');
  const nav = useNavigate();
  const diaUtil = useDiaUtil();
  const concluir = useConcluirLigacao();
  const ref = useRef<HTMLDivElement>(null);
  const corpoRef = useRef<HTMLDivElement>(null);
  const base = useId();
  const idTit = base + 'tit';
  const idPainel = base + 'painel';
  const idAba = (a: RadarAba) => base + 'aba-' + a;
  const { aba, grupo, seq } = estado;
  const { negociacao, fechado, ligar, cutucadas, pedidos } = filas;
  const abas = gestor ? ABAS : ABAS.filter((a) => a !== 'decisoes');
  const orfaos = useMemo(() => pedidosOrfaos(cutucadas, negociacao, fechado), [cutucadas, negociacao, fechado]);
  const listaNeg = useMemo(() => (orfaos.length ? [...orfaos, ...negociacao] : negociacao), [orfaos, negociacao]);
  const conta: Record<RadarAba, number> = {
    negociacao: negociacao.length, fechados: fechado.length, ligar: ligar.length, decisoes: decisoes.length,
  };
  const tomAba = (a: RadarAba): string => {
    if (conta[a] === 0) return 'rdr-zero';
    if (a === 'ligar') return 'rdr-azul';
    if (a === 'decisoes') return 'rdr-decisao';
    const p = piorDegrau(a === 'fechados' ? fechado : negociacao);
    return p >= 3 ? 'rdr-u3' : p === 2 ? 'rdr-u2' : 'rdr-u1';
  };

  // presa sob o segmento clicado; acompanha a janela
  const [pos, setPos] = useState<{ top: number; left: number; largura: number; alt: number } | null>(null);
  useLayoutEffect(() => {
    const calc = () => {
      const r = ancora();
      const vw = window.innerWidth, vh = window.innerHeight;
      const largura = Math.min(LARGURA_CENTRAL, vw - 32);
      const centro = r ? r.left + r.width / 2 : vw / 2;
      const left = Math.round(Math.max(16, Math.min(centro - largura / 2, vw - largura - 16)));
      const top = Math.round((r ? r.bottom : 56) + 8);
      const alt = Math.round(Math.max(220, Math.min(vh * 0.72, 620, vh - top - 16)));
      setPos((p) => (p && p.top === top && p.left === left && p.largura === largura && p.alt === alt ? p : { top, left, largura, alt }));
    };
    calc();
    window.addEventListener('resize', calc);
    return () => window.removeEventListener('resize', calc);
  }, [ancora]);

  // ao abrir (ou reabrir em outra aba), o foco vai para a aba ativa
  useEffect(() => {
    document.getElementById(idAba(aba))?.focus({ preventScroll: true });
  }, [seq]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!grupo) corpoRef.current?.scrollTo({ top: 0 });
  }, [aba]); // eslint-disable-line react-hooks/exhaustive-deps

  // clique fora fecha; Esc fecha e devolve o foco ao segmento
  useEffect(() => {
    const fora = (e: PointerEvent) => {
      const alvo = e.target as HTMLElement | null;
      if (!alvo || ref.current?.contains(alvo) || alvo.closest?.('.rdr-cap')) return;
      aoFechar(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      e.preventDefault();
      aoFechar(true);
    };
    document.addEventListener('pointerdown', fora);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', fora); document.removeEventListener('keydown', esc); };
  }, [aoFechar]);

  // teclado: ←/→ troca de aba; ↑/↓ percorre as linhas (Enter executa a ação da linha)
  const teclas = (e: TeclaReact<HTMLDivElement>) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const alvo = e.target as HTMLElement;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      const i = Math.max(0, abas.indexOf(aba));
      const prox = abas[(i + (e.key === 'ArrowRight' ? 1 : abas.length - 1)) % abas.length]!;
      e.preventDefault();
      aoAba(prox);
      requestAnimationFrame(() => document.getElementById(idAba(prox))?.focus({ preventScroll: true }));
      return;
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const linhas = Array.from(ref.current?.querySelectorAll<HTMLElement>('[data-linha]') ?? []);
    const daqui = alvo.closest<HTMLElement>('[data-linha]')
      ?? alvo.closest<HTMLElement>('.rdr-linha')?.querySelector<HTMLElement>('[data-linha]')
      ?? alvo;
    e.preventDefault();
    if (e.key === 'ArrowDown') {
      linhas.find((l) => l !== daqui && !!(daqui.compareDocumentPosition(l) & Node.DOCUMENT_POSITION_FOLLOWING))?.focus();
    } else {
      const ant = [...linhas].reverse().find((l) => l !== daqui && !!(daqui.compareDocumentPosition(l) & Node.DOCUMENT_POSITION_PRECEDING));
      (ant ?? document.getElementById(idAba(aba)))?.focus();
    }
  };

  const ir = (rota: string) => { aoFechar(false); nav(rota); };
  const responder = (conversaId: string) => ir(rotaConversa(conversaId));

  // Ligar: "Já liguei" registra a ligação na conversa (robo_ligar_concluir), a linha some e a confirmação fica 3,5 s
  const [okLig, setOkLig] = useState<string | null>(null);
  const [erroLig, setErroLig] = useState<string | null>(null);
  const [pendLig, setPendLig] = useState<string | null>(null);
  useEffect(() => {
    if (!okLig) return;
    const t = setTimeout(() => setOkLig(null), 3500);
    return () => clearTimeout(t);
  }, [okLig]);
  const jaLiguei = (conversaId: string) => {
    setErroLig(null);
    setOkLig(null);
    setPendLig(conversaId);
    concluir.mutate(conversaId, {
      onSuccess: () => setOkLig(rtTxt('extra.central.ok_ligacao', {}, 'Ligação registrada na conversa.')),
      onError: (e) => setErroLig(textoErroLigacao(e)),
      onSettled: () => setPendLig(null),
    });
  };

  const atalho = aba === 'fechados'
    ? { rot: rtTit('extra.central.link_fechados', {}, 'Abrir a aba Fechados'), rota: '/whatsapp?aba=fechados' }
    : aba === 'decisoes' ? { rot: rtTit('extra.central.link_painel', {}, 'Abrir painel do Radar'), rota: '/radar' } : null;
  const titulo = rtTit('central.titulo', {}, 'Aguardando você');
  const subtitulo = rtTxt('central.subtitulo', {}, 'Em ordem de urgência, com tempos em horário útil.');

  return createPortal(
    <div ref={ref} className="rdr-central" role="dialog" aria-labelledby={idTit} onKeyDown={teclas}
      style={pos ? { top: pos.top, left: pos.left, width: pos.largura, maxHeight: pos.alt } : { visibility: 'hidden' }}>
      <div className="rdr-c-cab">
        <div className="rdr-c-tit">
          <b id={idTit}><IcRadar tamanho={15} />{titulo}</b>
          {subtitulo && <span>{subtitulo}</span>}
        </div>
        {gestor && (
          <button type="button" className="rdr-c-link" onClick={() => ir('/radar')}>
            {rtTit('extra.central.link_painel', {}, 'Abrir painel do Radar')}
          </button>
        )}
      </div>

      <div className="rdr-abas" role="tablist" aria-label={titulo}>
        {abas.map((a) => (
          <button key={a} id={idAba(a)} type="button" role="tab" aria-selected={a === aba} aria-controls={idPainel}
            tabIndex={a === aba ? 0 : -1} className={'rdr-aba ' + tomAba(a) + (a === aba ? ' rdr-on' : '')}
            onClick={() => aoAba(a)}>
            <span>{rtTit('central.aba.' + a, {}, ROTULO_ABA[a])}</span>
            <b className="num">{fmtN(conta[a])}</b>
          </button>
        ))}
      </div>

      <div ref={corpoRef} id={idPainel} className="rdr-c-corpo" role="tabpanel" aria-labelledby={idAba(aba)}>
        {aba === 'negociacao' && (
          <ListaFamilia key="negociacao" familia="negociacao" itens={listaNeg} pedidos={pedidos} cutucadas={cutucadas}
            diaUtil={diaUtil} grupoAlvo={grupo} seq={seq} aoResponder={responder} />
        )}
        {aba === 'fechados' && (
          <ListaFamilia key="fechado" familia="fechado" itens={fechado} pedidos={pedidos} cutucadas={cutucadas}
            diaUtil={diaUtil} grupoAlvo={grupo} seq={seq} aoResponder={responder} />
        )}
        {aba === 'ligar' && (
          <>
            {erroLig && <div className="rdr-erro" role="alert">{erroLig}</div>}
            {okLig && <div className="rdr-ok" role="status">{okLig}</div>}
            <ListaLigar itens={ligar} diaUtil={diaUtil} pendente={pendLig} aoAbrir={responder} aoJaLiguei={jaLiguei} />
          </>
        )}
        {aba === 'decisoes' && gestor && (
          <ListaDecisoes itens={decisoes} diaUtil={diaUtil} aoDecidir={(id) => ir('/radar?decidir=' + encodeURIComponent(id))} />
        )}
      </div>

      <div className="rdr-c-rod">
        <span>{rt('central.rodape').rodape ?? ''}</span>
        {atalho && <button type="button" className="rdr-c-link" onClick={() => ir(atalho.rota)}>{atalho.rot}</button>}
      </div>
    </div>,
    raiz,
  );
}

const GRUPOS: Array<{ id: GrupoId; chave: string; padrao: string; tom: string }> = [
  { id: 'pedido', chave: 'extra.central.grupo_pedido', padrao: 'Pedido do gestor', tom: 'rdr-t-ambar' },
  { id: 'ultimo', chave: 'central.grupo.ultimo', padrao: 'Último aviso', tom: 'rdr-t-rubro' },
  { id: 'segundo', chave: 'central.grupo.segundo', padrao: '2º aviso', tom: 'rdr-t-rubro2' },
  { id: 'primeiro', chave: 'central.grupo.primeiro', padrao: '1º aviso', tom: 'rdr-t-ambar' },
];

const chaveCliente = (i: RadarItem) => i.conversaId;

/** Uma aba de família (Em negociação ou Fechados): grupos Pedido do gestor → Último → 2º → 1º. */
function ListaFamilia({ familia, itens, pedidos, cutucadas, diaUtil, grupoAlvo, seq, aoResponder }: {
  familia: Familia; itens: RadarItem[]; pedidos: Set<string>; cutucadas: RadarItem[]; diaUtil: number;
  grupoAlvo?: GrupoId; seq: number; aoResponder: (conversaId: string) => void;
}) {
  const linhas = useComSaida(itens, chaveCliente);
  const pedidoDe = useMemo(() => new Map(pedidosUnicos(cutucadas).map((c) => [c.conversaId, c] as const)), [cutucadas]);
  const [abertos, setAbertos] = useState<Set<string>>(() => new Set(grupoAlvo ? [grupoAlvo] : []));
  const caixaRef = useRef<HTMLDivElement>(null);
  const base = useId();
  // "Ver lista" da tela cheia: chega no grupo certo, aberto
  useEffect(() => {
    if (!grupoAlvo) return;
    setAbertos((s) => (s.has(grupoAlvo) ? s : new Set(s).add(grupoAlvo)));
    const raf = requestAnimationFrame(() => {
      caixaRef.current?.querySelector(`[data-grupo="${grupoAlvo}"]`)?.scrollIntoView({ block: 'start' });
    });
    return () => cancelAnimationFrame(raf);
  }, [grupoAlvo, seq]);
  const abrir = (k: string) => setAbertos((s) => new Set(s).add(k));
  // a linha que sai esmaece no grupo em que estava (o pedido do gestor se encerra junto com a resposta)
  const ultimoGrupo = useRef(new Map<string, GrupoId>());

  if (!linhas.length) return <Vazio chave={familia === 'fechado' ? 'central.vazio.fechados' : 'central.vazio.negociacao'} />;
  const grupoAtual = (i: RadarItem): GrupoId =>
    (pedidos.has(i.conversaId) ? 'pedido' : i.estagio === 3 ? 'ultimo' : i.estagio === 2 ? 'segundo' : 'primeiro');
  const grupoDeLinha = new Map<string, GrupoId>();
  for (const l of linhas) {
    const k = l.item.conversaId;
    const g = l.saindo ? ultimoGrupo.current.get(k) ?? grupoAtual(l.item) : grupoAtual(l.item);
    grupoDeLinha.set(k, g);
    if (!l.saindo) ultimoGrupo.current.set(k, g);
  }
  const grupoDe = (i: RadarItem): GrupoId => grupoDeLinha.get(i.conversaId) ?? grupoAtual(i);
  const total = itens.length;

  return (
    <div ref={caixaRef}>
      {GRUPOS.map((g) => {
        const doGrupo = linhas.filter((l) => grupoDe(l.item) === g.id);
        if (!doGrupo.length) return null;
        const n = doGrupo.filter((l) => !l.saindo).length;
        const titulo = rtTit(g.chave, {}, g.padrao);
        const recolhido = g.id === 'primeiro' && total > RECOLHE_ACIMA && !abertos.has('primeiro');
        const mostrar = recolhido ? [] : abertos.has('tudo:' + g.id) ? doGrupo : doGrupo.slice(0, POR_GRUPO);
        const resto = recolhido ? 0 : doGrupo.slice(mostrar.length).filter((l) => !l.saindo).length;
        const idCab = base + g.id;
        return (
          <div key={g.id} className={'rdr-grupo ' + g.tom} data-grupo={g.id} role="group" aria-labelledby={idCab}>
            <div id={idCab} className="rdr-grupo-cab"><span>{titulo}</span><b className="num">{n}</b></div>
            {recolhido ? (
              <button type="button" className="rdr-mais" data-linha="" onClick={() => abrir('primeiro')}>
                {rtTxt('extra.central.mostrar_grupo', { n }, `Mostrar ${n}`)}
              </button>
            ) : mostrar.map(({ item, saindo }) => (
              <LinhaAviso key={item.alertaId} i={item} familia={familia} grupo={g.id} saindo={saindo}
                pedido={pedidoDe.get(item.conversaId)} diaUtil={diaUtil} aoResponder={aoResponder} />
            ))}
            {resto > 0 && (
              <button type="button" className="rdr-mais" data-linha="" onClick={() => abrir('tudo:' + g.id)}>
                {rtTxt('extra.central.mostrar_mais', { n: resto }, `Mostrar mais ${resto}`)}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Linha de 52px: iniciais · nome · contexto · prioridade (só negociação) · Responder. A linha inteira responde. */
function LinhaAviso({ i, familia, grupo, saindo, pedido, diaUtil, aoResponder }: {
  i: RadarItem; familia: Familia; grupo: GrupoId; saindo: boolean; pedido?: RadarItem; diaUtil: number;
  aoResponder: (conversaId: string) => void;
}) {
  const tempo = fmtTempoLinha(i.minutosUteis, diaUtil);
  const semResposta = rtTxt(familia === 'fechado' ? 'central.linha.fechado' : 'central.linha.negociacao', { tempo }, `Sem resposta há ${tempo}`);
  let contexto: string;
  if (grupo === 'pedido') {
    const gestor = pedido?.cutucadoPorNome ?? i.cutucadoPorNome;
    contexto = gestor
      ? rtTxt('extra.central.linha_pedido', { gestor, tempo }, `Pedido de ${gestor} · ${tempo} sem resposta`)
      : `${rtTit('extra.central.grupo_pedido', {}, 'Pedido do gestor')} · ${semResposta}`;
  } else if (!comecouHoje(i.desde)) {
    // espera que começou antes de hoje: data e hora, não duração ("Sem resposta desde ontem às 16:40")
    const desde = fmtDesde(i.desde);
    contexto = rtTxt('extra.central.linha_desde', { desde }, `Sem resposta desde ${desde}`);
  } else {
    contexto = semResposta;
  }
  return (
    <button type="button" className={'rdr-linha rdr-c-' + familia + (saindo ? ' rdr-sai' : '')}
      data-linha={saindo ? undefined : ''} tabIndex={saindo ? -1 : 0} aria-hidden={saindo || undefined}
      title={dicaAlerta(i, familia, diaUtil)} onClick={() => { if (!saindo) aoResponder(i.conversaId); }}>
      <span className="rdr-av" aria-hidden>{iniciais(i.nome)}</span>
      <span className="rdr-lt"><b>{i.nome}</b><span>{contexto}</span></span>
      {familia === 'negociacao' && <IconePrioridade prioridade={prioDe(i.prioridade)} />}
      <span className="rdr-btn">{rt('central.botao.responder').botao_primario ?? 'Responder'}</span>
    </button>
  );
}

/** Ligar: lista única, espera mais longa primeiro. A linha abre a conversa; o único botão é "Já liguei". */
function ListaLigar({ itens, diaUtil, pendente, aoAbrir, aoJaLiguei }: {
  itens: RadarItem[]; diaUtil: number; pendente: string | null;
  aoAbrir: (conversaId: string) => void; aoJaLiguei: (conversaId: string) => void;
}) {
  const linhas = useComSaida(itens, chaveCliente);
  const [tudo, setTudo] = useState(false);
  if (!linhas.length) return <Vazio chave="central.vazio.ligar" />;
  const mostrar = tudo ? linhas : linhas.slice(0, POR_GRUPO);
  const resto = linhas.slice(mostrar.length).filter((l) => !l.saindo).length;
  const botoes = rt('central.botao.ja_liguei');
  const abrirRot = botoes.botao_secundario ?? 'Abrir conversa';
  const ligueiRot = botoes.botao_primario ?? 'Já liguei';
  return (
    <div className="rdr-grupo rdr-t-azul">
      {mostrar.map(({ item: i, saindo }) => {
        const tempo = fmtTempoLinha(i.minutosUteis, diaUtil);
        return (
          <div key={i.alertaId} className={'rdr-linha rdr-c-ligar' + (saindo ? ' rdr-sai' : '')} aria-hidden={saindo || undefined}
            title={dicaLigar(i, diaUtil)} onClick={() => { if (!saindo) aoAbrir(i.conversaId); }}>
            <button type="button" className="rdr-linha-alvo" data-linha={saindo ? undefined : ''} tabIndex={saindo ? -1 : 0}
              aria-label={`${abrirRot}: ${i.nome}`}
              onClick={(e) => { e.stopPropagation(); if (!saindo) aoAbrir(i.conversaId); }}>
              <span className="rdr-av" aria-hidden>{iniciais(i.nome)}</span>
              <span className="rdr-lt">
                <b>{i.nome}</b>
                <span>{rtTxt('central.linha.ligar', { tempo }, `Parou no atendimento automático há ${tempo}`)}</span>
              </span>
            </button>
            <button type="button" className="rdr-btn" disabled={saindo || pendente === i.conversaId} tabIndex={saindo ? -1 : 0}
              aria-label={`${ligueiRot}: ${i.nome}`}
              onClick={(e) => { e.stopPropagation(); aoJaLiguei(i.conversaId); }}>
              {ligueiRot}
            </button>
          </div>
        );
      })}
      {resto > 0 && (
        <button type="button" className="rdr-mais" data-linha="" onClick={() => setTudo(true)}>
          {rtTxt('extra.central.mostrar_mais', { n: resto }, `Mostrar mais ${resto}`)}
        </button>
      )}
    </div>
  );
}

/** Decisões (gestor): prioritários e depois os mais antigos. "Decidir" leva ao painel — a decisão nunca é tomada aqui. */
function ListaDecisoes({ itens, diaUtil, aoDecidir }: {
  itens: VacuoDecisao[]; diaUtil: number; aoDecidir: (conversaId: string) => void;
}) {
  // tempo útil AO VIVO do cliente (o banco recalcula a cada leitura); sem ele, o do momento do pedido de decisão
  const equipe = useRadarEquipe();
  const vivo = useMemo(() => new Map(equipe.negociacao.map((i) => [i.conversaId, i] as const)), [equipe.negociacao]);
  const ordenadas = useMemo(
    () => [...itens].sort((a, b) => (b.prioritario ? 1 : 0) - (a.prioritario ? 1 : 0) || a.desde.localeCompare(b.desde)),
    [itens],
  );
  const linhas = useComSaida(ordenadas, (d) => d.conversaId);
  const [tudo, setTudo] = useState(false);
  if (!linhas.length) return <Vazio chave="central.vazio.decisoes" />;
  const mostrar = tudo ? linhas : linhas.slice(0, POR_GRUPO);
  const resto = linhas.slice(mostrar.length).filter((l) => !l.saindo).length;
  const decidir = rt('central.botao.decidir').botao_primario ?? 'Decidir';
  return (
    <div className="rdr-grupo rdr-t-rubro">
      {mostrar.map(({ item: d, saindo }) => {
        const v = vivo.get(d.conversaId);
        const tempo = fmtTempoLinha(v?.minutosUteis ?? d.minutos, diaUtil);
        const prio = d.prioritario ? prioDe(v?.prioridade ?? d.prioMotivo) : null;
        return (
          <button key={d.conversaId} type="button" className={'rdr-linha rdr-c-decisao' + (saindo ? ' rdr-sai' : '')}
            data-linha={saindo ? undefined : ''} tabIndex={saindo ? -1 : 0} aria-hidden={saindo || undefined}
            onClick={() => { if (!saindo) aoDecidir(d.conversaId); }}>
            <span className="rdr-av" aria-hidden>{iniciais(d.contatoNome)}</span>
            <span className="rdr-lt">
              <b>{d.contatoNome}</b>
              <span>{rtTxt('central.linha.decisao', { atendente: d.donoNome, tempo }, `Com ${d.donoNome} · sem resposta há ${tempo}`)}</span>
            </span>
            <IconePrioridade prioridade={prio} />
            <span className="rdr-btn">{decidir}</span>
          </button>
        );
      })}
      {resto > 0 && (
        <button type="button" className="rdr-mais" data-linha="" onClick={() => setTudo(true)}>
          {rtTxt('extra.central.mostrar_mais', { n: resto }, `Mostrar mais ${resto}`)}
        </button>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Telas cheias: pedido do gestor e último aviso
   --------------------------------------------------------------------------- */
const INTERVALO_ULTIMO_MS = 15 * 60e3;   // no máximo 1 tela de último aviso a cada 15 min, por pessoa
const LEMBRAR_MS = 15 * 60e3;            // "Lembrar em 15 min" (só por escolha da pessoa)
const APOS_RESPONDER_MS = 5 * 60e3;      // "Abrir conversa e responder": nenhuma tela de último aviso nos 5 min seguintes
const ENTRE_TELAS_MS = 30_000;           // nunca duas telas juntas nem uma atrás da outra
const DIGITANDO_MS = 15_000;             // tecla num campo de texto nos últimos 15 s = está digitando
const ESPERA_DIGITACAO_MAX_MS = 60_000;  // espera a pausa da digitação por no máximo 60 s
const TELA_VIVA_MS = 90_000;             // a aba com a tela aberta renova a marca a cada 30 s (uma tela por pessoa)
const REGISTRO_DIAS = 3;
const TECLA_RECENTE_MS = 700;            // Enter/Espaço da digitação não aciona o botão que acabou de receber o foco
const ABA_ID = Math.random().toString(36).slice(2, 10);

type Tela = { tipo: 'pedido' | 'ultimo'; familia: Familia; item: RadarItem; mais: RadarItem[] };
type Lembrete = { em: number; familia: Familia; ids: string[] };
type Registro = {
  vistos: Record<string, number>;           // tela mostrada (por cliente e episódio / por pedido) → quando
  ultima: number;                           // última tela de último aviso
  fechadaEm: number;                        // última tela fechada
  bloqueioAte: number;                      // sem tela de último aviso até (depois de "Abrir conversa e responder")
  lembrete: Lembrete | null;                // "Lembrar em 15 min"
  aberta: { por: string; em: number } | null; // aba do navegador que está com a tela aberta
};

const chaveRegistro = (uid: string) => 'atenvo-radar-telas:' + uid;
const chavePedido = (p: RadarItem) => 'ped:' + p.alertaId;
/** Episódio = o alerta ativo do motor: o id só muda quando começa um ciclo novo (resposta da equipe, decisão do
    gestor, troca de dono); a troca de família (negociação ↔ fechado) mantém o id — a tela não se repete. */
const chaveUltimo = (i: RadarItem) => 'ult:' + i.alertaId;

function lerRegistro(uid: string): Registro {
  const vazio: Registro = { vistos: {}, ultima: 0, fechadaEm: 0, bloqueioAte: 0, lembrete: null, aberta: null };
  try {
    const r = JSON.parse(localStorage.getItem(chaveRegistro(uid)) ?? '{}') as Partial<Registro>;
    const corte = Date.now() - REGISTRO_DIAS * 86400e3;
    const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
    const vistos: Record<string, number> = {};
    for (const [k, t] of Object.entries(r.vistos ?? {})) if (typeof t === 'number' && t > corte) vistos[k] = t;
    const l = r.lembrete;
    const lembrete = l && typeof l.em === 'number' && Array.isArray(l.ids) && (l.familia === 'negociacao' || l.familia === 'fechado')
      ? { em: l.em, familia: l.familia, ids: l.ids.filter((x): x is string => typeof x === 'string') } : null;
    const a = r.aberta;
    const aberta = a && typeof a.por === 'string' && typeof a.em === 'number' ? { por: a.por, em: a.em } : null;
    return { vistos, ultima: n(r.ultima), fechadaEm: n(r.fechadaEm), bloqueioAte: n(r.bloqueioAte), lembrete, aberta };
  } catch {
    return vazio;
  }
}
function gravarRegistro(uid: string, r: Registro) {
  try { localStorage.setItem(chaveRegistro(uid), JSON.stringify(r)); } catch { /* navegação privada */ }
}

/** Marca a última tecla digitada num campo de texto (o compositor do inbox, sobretudo). */
function useUltimaTecla() {
  const ref = useRef(0);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT' || t.isContentEditable)) ref.current = Date.now();
    };
    document.addEventListener('keydown', h, true);
    return () => document.removeEventListener('keydown', h, true);
  }, []);
  return ref;
}

/** Conversa aberta no inbox agora (a URL ?conversa= dura só até o inbox rolar até o card). */
function conversaAbertaAgora(pathname: string, search: string): string | null {
  if (!pathname.startsWith('/whatsapp')) return null;
  const daUrl = new URLSearchParams(search).get('conversa');
  if (daUrl) return daUrl;
  const card = document.querySelector<HTMLElement>('.conv2.ativa[data-cid]');
  if (card?.dataset.cid) return card.dataset.cid;
  try { return sessionStorage.getItem(CURR_KEY); } catch { return null; }
}

/** Próxima tela, pela ordem do desenho: pedido do gestor > último aviso de negociação prioritária >
    último aviso de fechado > último aviso de negociação comum; empate → quem espera há mais tempo.
    Famílias diferentes nunca dividem tela. */
function escolherTela(filas: RadarFilas, reg: Registro, agora: number, horarioAberto: boolean, aberta: string | null):
  { tela: Tela; marcar: string[]; ultimo: boolean; usouLembrete: boolean } | null {
  // 1) pedido do gestor: na hora, a cada novo pedido, inclusive fora do horário útil
  const pedidos = pedidosUnicos(filas.cutucadas)
    .filter((p) => !reg.vistos[chavePedido(p)] && p.conversaId !== aberta)
    .sort((a, b) => a.desde.localeCompare(b.desde));
  if (pedidos.length) {
    const familia = familiaDoPedido(pedidos[0]!, filas.fechado);
    const mesma = pedidos.filter((p) => familiaDoPedido(p, filas.fechado) === familia);
    return { tela: { tipo: 'pedido', familia, item: mesma[0]!, mais: mesma.slice(1) }, marcar: mesma.map(chavePedido), ultimo: false, usouLembrete: false };
  }
  // 2) último aviso: só no horário útil, 1 a cada 15 min, nunca nos 5 min depois de "Abrir conversa e responder"
  if (!horarioAberto || agora - reg.ultima < INTERVALO_ULTIMO_MS || agora < reg.bloqueioAte) return null;
  const lembrete = reg.lembrete && agora >= reg.lembrete.em ? reg.lembrete : null;
  const candidatos = (familia: Familia, lista: RadarItem[]) => lista.filter((i) =>
    i.estagio === 3 && i.conversaId !== aberta && !filas.pedidos.has(i.conversaId)
    && (!reg.vistos[chaveUltimo(i)] || (lembrete?.familia === familia && lembrete.ids.includes(i.conversaId))));
  const neg = candidatos('negociacao', filas.negociacao); // a fila já vem em ordem: prioridade, depois espera
  const fec = candidatos('fechado', filas.fechado);
  const ordem = (f: Familia, l: RadarItem[]) => (!l.length ? 9 : f === 'fechado' ? 2 : l.some((i) => !!i.prioridade) ? 1 : 3);
  const [familia, lista] = ordem('negociacao', neg) <= ordem('fechado', fec) ? ['negociacao', neg] as const : ['fechado', fec] as const;
  if (!lista.length) return null;
  return {
    tela: { tipo: 'ultimo', familia, item: lista[0]!, mais: lista.slice(1) },
    marcar: lista.map(chaveUltimo), ultimo: true, usouLembrete: lembrete?.familia === familia,
  };
}

/** Abre a Central da barra (ou, sem barra montada, pela URL). */
function pedirCentral(p: PedidoCentral, nav: (to: string) => void) {
  if (ouvintesCentral.size) ouvintesCentral.forEach((f) => f(p));
  else nav('?radar=' + p.aba);
}

const AVISO_UP_MS = 60_000;               // aviso de atualização: segura só o último aviso, no 1º minuto dele

export function GuardiaoAvisos({ bloqueado = false }: { bloqueado?: boolean }) {
  const filas = useRadarMeus();
  const { negociacao, fechado, cutucadas } = filas;
  const carregado = useAvisosCarregados();
  const aberto = useRadarAberto();
  const { user } = useAuth();
  const uid = user?.id ?? null;
  const nav = useNavigate();
  const location = useLocation();
  const ultimaTecla = useUltimaTecla();
  const esperaDesde = useRef(0);
  const abertaEm = useRef(0);
  const avisoUpDesde = useRef(0);
  const [tela, setTela] = useState<Tela | null>(null);
  const telaRef = useRef<Tela | null>(null);
  telaRef.current = tela;
  const [versao, setVersao] = useState(0); // o registro mudou (nesta aba ou em outra)
  const [tick, setTick] = useState(0);

  useEffect(() => { const t = setInterval(() => setTick((n) => n + 1), 5_000); return () => clearInterval(t); }, []);
  useEffect(() => {
    const vis = () => setTick((n) => n + 1);
    document.addEventListener('visibilitychange', vis);
    return () => document.removeEventListener('visibilitychange', vis);
  }, []);
  // uma tela por pessoa, não por aba do navegador: outra aba gravou o registro → relê
  useEffect(() => {
    if (!uid) return;
    const ouvir = (e: StorageEvent) => { if (e.key === chaveRegistro(uid)) setVersao((v) => v + 1); };
    window.addEventListener('storage', ouvir);
    return () => window.removeEventListener('storage', ouvir);
  }, [uid]);
  // aba fechada (ou saída) com a tela aberta: libera para as outras abas
  useEffect(() => {
    if (!uid) return;
    const liberar = () => {
      const r = lerRegistro(uid);
      if (r.aberta?.por === ABA_ID) gravarRegistro(uid, { ...r, aberta: null });
    };
    window.addEventListener('pagehide', liberar);
    return () => { window.removeEventListener('pagehide', liberar); liberar(); };
  }, [uid]);
  // enquanto a tela está aberta, esta aba renova a marca (se a aba morrer, a marca vence sozinha)
  useEffect(() => {
    if (!tela || !uid) return;
    const t = setInterval(() => {
      if (document.visibilityState !== 'visible') return; // aba em segundo plano não segura a tela das outras
      const r = lerRegistro(uid);
      if (!r.aberta || r.aberta.por === ABA_ID) gravarRegistro(uid, { ...r, aberta: { por: ABA_ID, em: Date.now() } });
    }, 30_000);
    return () => clearInterval(t);
  }, [tela, uid]);

  // escolhe a próxima tela (uma por vez; nunca duas juntas nem uma atrás da outra)
  useEffect(() => {
    if (tela || !uid || !carregado || bloqueado) return;                      // bloqueado = Intro do dia aberta
    if (document.visibilityState !== 'visible') return;                     // a aba visível é que mostra
    if (document.querySelector('.bd-veu, .rdr-central')) return;            // Bom dia (reforço), Central aberta
    const agora = Date.now();
    // aviso de atualização: fica até a pessoa recarregar — segura só o último aviso, e só no 1º minuto dele;
    // o pedido do gestor passa sempre
    if (document.querySelector('.aviso-up')) { if (!avisoUpDesde.current) avisoUpDesde.current = agora; }
    else avisoUpDesde.current = 0;
    const avisoUpRecente = !!avisoUpDesde.current && agora - avisoUpDesde.current < AVISO_UP_MS;
    const reg = lerRegistro(uid);
    if (reg.aberta && reg.aberta.por !== ABA_ID && agora - reg.aberta.em < TELA_VIVA_MS) return; // tela aberta em outra aba
    if (agora - reg.fechadaEm < ENTRE_TELAS_MS) return;
    const aberta = conversaAbertaAgora(location.pathname, location.search);
    // lembrete vencido sem ninguém mais no último aviso: sai do registro
    if (reg.lembrete && agora >= reg.lembrete.em) {
      const lista = reg.lembrete.familia === 'fechado' ? fechado : negociacao;
      const ids = reg.lembrete.ids;
      if (!lista.some((i) => i.estagio === 3 && ids.includes(i.conversaId))) {
        gravarRegistro(uid, { ...reg, lembrete: null });
        reg.lembrete = null;
      }
    }
    const escolha = escolherTela(filas, reg, agora, aberto && !avisoUpRecente, aberta);
    if (!escolha) { esperaDesde.current = 0; return; }
    // nunca durante a digitação: espera a pausa, por no máximo 60 s
    if (agora - ultimaTecla.current < DIGITANDO_MS) {
      if (!esperaDesde.current) esperaDesde.current = agora;
      if (agora - esperaDesde.current < ESPERA_DIGITACAO_MAX_MS) return;
    }
    esperaDesde.current = 0;
    const vistos = { ...reg.vistos };
    for (const k of escolha.marcar) vistos[k] = agora;
    gravarRegistro(uid, {
      ...reg, vistos, aberta: { por: ABA_ID, em: agora },
      ultima: escolha.ultimo ? agora : reg.ultima,
      lembrete: escolha.usouLembrete ? null : reg.lembrete,
    });
    abertaEm.current = agora;
    setTela(escolha.tela);
  }, [tela, uid, carregado, bloqueado, negociacao, fechado, cutucadas, aberto, location.pathname, location.search, tick, versao]); // eslint-disable-line react-hooks/exhaustive-deps

  const fechar = useCallback((acao: 'responder' | 'lembrar' | 'depois' | 'lista' | 'sumiu') => {
    const t = telaRef.current;
    setTela(null);
    if (!t || !uid) return;
    const agora = Date.now();
    const reg = lerRegistro(uid);
    const nx: Registro = { ...reg, aberta: reg.aberta?.por === ABA_ID ? null : reg.aberta, fechadaEm: agora };
    if (acao === 'responder') nx.bloqueioAte = agora + APOS_RESPONDER_MS;
    if (acao === 'lembrar' && t.tipo === 'ultimo') {
      // a MESMA tela volta em 15 min, só com quem ainda estiver no último aviso (e respeitando todas as regras)
      nx.lembrete = { em: agora + LEMBRAR_MS, familia: t.familia, ids: [t.item, ...t.mais].map((i) => i.conversaId) };
    }
    gravarRegistro(uid, nx);
    setVersao((v) => v + 1);
  }, [uid]);

  // o item ao vivo (o tempo útil vem do banco a cada leitura) e se a tela ainda vale
  const familiaLista = tela?.familia === 'fechado' ? fechado : negociacao;
  const vivo = !tela ? null
    : tela.tipo === 'pedido'
      ? cutucadas.find((c) => c.alertaId === tela.item.alertaId) ?? null
      : familiaLista.find((i) => i.conversaId === tela.item.conversaId && i.estagio === 3) ?? null;
  const nMais = !tela ? 0 : tela.mais.filter((m) => (tela.tipo === 'pedido'
    ? cutucadas.some((c) => c.alertaId === m.alertaId)
    : familiaLista.some((i) => i.conversaId === m.conversaId && i.estagio === 3))).length;

  // some sozinha quando o cliente é respondido (o aviso sai das filas)
  useEffect(() => {
    if (tela && !vivo && carregado) fechar('sumiu');
  }, [tela, vivo, carregado, fechar]);

  if (!tela || !vivo) return null;
  const responder = () => { const t = telaRef.current; fechar('responder'); if (t) nav(rotaConversa(t.item.conversaId)); };
  const secundario = () => fechar(telaRef.current?.tipo === 'ultimo' ? 'lembrar' : 'depois');
  const verLista = () => {
    const t = telaRef.current;
    fechar('lista');
    if (t) pedirCentral({ aba: abaDaFamilia(t.familia), grupo: t.tipo === 'pedido' ? 'pedido' : 'ultimo' }, nav);
  };
  return (
    <TelaCheia tela={tela} item={vivo} nMais={nMais} abertaEm={abertaEm.current}
      aoResponder={responder} aoSecundario={secundario} aoVerLista={verLista} />
  );
}

/** Cartão executivo: faixa de 3px, ícone em círculo, sobrelinha, título, cartão do cliente, 3 fatos,
    botão principal, secundário discreto e rodapé de uma linha. */
function TelaCheia({ tela, item: i, nMais, abertaEm, aoResponder, aoSecundario, aoVerLista }: {
  tela: Tela; item: RadarItem; nMais: number; abertaEm: number;
  aoResponder: () => void; aoSecundario: () => void; aoVerLista: () => void;
}) {
  const raiz = useRaizPortal('data-radar-tela');
  const diaUtil = useDiaUtil();
  const priRef = useRef<HTMLButtonElement>(null);
  const cartaoRef = useRef<HTMLDivElement>(null);
  const base = useId();
  const [, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick((n) => n + 1), 30_000); return () => clearInterval(t); }, []);

  // foco no botão principal — MAS, se a pessoa estava num campo de texto, no próprio cartão: um Enter ou Espaço
  // da digitação não pode abrir outra conversa. Ao fechar, o foco volta para onde estava, exceto quando a tela
  // abriu outra conversa ("Abrir conversa e responder"): voltar ao compositor levaria o rascunho do cliente anterior.
  const abriuConversa = useRef(false);
  useEffect(() => {
    const anterior = document.activeElement as HTMLElement | null;
    const digitando = !!anterior && (anterior.tagName === 'TEXTAREA' || anterior.tagName === 'INPUT' || anterior.isContentEditable);
    if (digitando) cartaoRef.current?.focus({ preventScroll: true });
    else priRef.current?.focus({ preventScroll: true });
    abriuConversa.current = false;
    return () => {
      if (abriuConversa.current) { (document.activeElement as HTMLElement | null)?.blur?.(); return; }
      if (anterior && anterior.isConnected && (document.activeElement === document.body || !document.activeElement)) {
        anterior.focus({ preventScroll: true });
      }
    };
  }, [tela.item.alertaId]);

  // Esc = botão secundário; Tab fica dentro do cartão
  const secRef = useRef(aoSecundario);
  secRef.current = aoSecundario;
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); secRef.current(); return; }
      if (e.key !== 'Tab') return;
      const foc = Array.from(cartaoRef.current?.querySelectorAll<HTMLElement>('button:not([disabled])') ?? []);
      if (!foc.length) return;
      e.preventDefault();
      const at = foc.indexOf(document.activeElement as HTMLElement);
      const prox = e.shiftKey ? (at <= 0 ? foc.length - 1 : at - 1) : (at === foc.length - 1 ? 0 : at + 1);
      foc[prox]!.focus();
    };
    document.addEventListener('keydown', tecla, true);
    return () => document.removeEventListener('keydown', tecla, true);
  }, []);

  // Enter/Espaço que vinham da digitação não acionam o botão que acabou de receber o foco
  const guarda = (fn: () => void) => (e: CliqueReact<HTMLButtonElement>) => {
    if (e.detail === 0 && Date.now() - abertaEm < TECLA_RECENTE_MS) return;
    fn();
  };

  const pedido = tela.tipo === 'pedido';
  const fechado = tela.familia === 'fechado';
  const t = rt(pedido ? 'tela.cutucada' : fechado ? 'tela.fechado_ultimo' : 'tela.negociacao_ultimo');
  const Icone = pedido ? IcSinoOndas : fechado ? IcFechado : IcNegociacao;
  // linha do cliente: trecho da última mensagem (o banco já corta e mascara números); sem texto, a frase do caderno
  const linha = i.ultimaMsg ? `“${i.ultimaMsg}”` : (t.texto ?? '');

  // valor de cada fato pelo rótulo (o caderno define a ordem)
  const fato = (rotulo: string): { valor: string; dica?: string } => {
    const r = rotulo.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
    if (r.startsWith('sem resposta')) return { valor: fmtTempo(i.minutosUteis, diaUtil) };
    if (r === 'desde') return { valor: fmtDesdeCurto(i.desde) };
    if (r.includes('decide') || r.includes('decisao')) {
      const dica = rtTxt('extra.tela.decisao_dica', {}, 'Com 1 dia útil sem resposta, o gestor decide se o cliente continua com você.');
      if (i.decisaoPedidaEm) return { valor: rtTxt('extra.tela.decisao_acionada', {}, 'Já acionado'), dica };
      if (i.decisaoEmMin == null) return { valor: rtTxt('extra.tela.decisao_regra', {}, 'Com 1 dia útil'), dica };
      const falta = fmtFalta(i.decisaoEmMin, diaUtil);
      return { valor: rtTxt('extra.tela.decisao_em', { tempo: falta }, `Em ${falta}`), dica };
    }
    if (r === 'aviso') return { valor: rtTxt('extra.tela.aviso_valor', {}, '3 de 3') };
    if (r.startsWith('pedido por')) return { valor: i.cutucadoPorNome ?? '—' };
    if (r.startsWith('pedido ha')) return { valor: fmtCorrido(i.cutucadoEm ?? i.criadoEm) };
    return { valor: '—' };
  };
  const fatos = (t.fatos ?? []).slice(0, 3);

  // pedido do gestor: etiqueta da família; último aviso do fechado: etiqueta verde "Cliente fechado"
  const etiqueta = pedido || fechado
    ? (fechado
      ? <span className="rdr-tag rdr-tag-fechado"><IcFechado tamanho={11} />{rtTit('extra.etiqueta.fechado', {}, 'Cliente fechado')}</span>
      : <span className="rdr-tag rdr-tag-neg"><IcNegociacao tamanho={11} />{rtTit('extra.etiqueta.negociacao', {}, 'Em negociação')}</span>)
    : null;

  const textoMais = pedido
    ? rtTxt('extra.tela.mais_pedidos', { n: nMais }, `Outros pedidos do gestor: ${nMais}`)
    : rtTxt('extra.tela.mais_ultimo', { n: nMais }, `Também no último aviso: ${nMais}`);
  const idTit = base + 'tit';
  const idCli = base + 'cli';

  return createPortal(
    <div className="gva-tk">
      <div ref={cartaoRef} tabIndex={-1} className={'rdr-tela ' + (pedido ? 'rdr-t-ambar' : 'rdr-t-rubro')} role="alertdialog" aria-modal="true"
        aria-labelledby={idTit} aria-describedby={idCli}>
        <span className="rdr-tela-faixa" aria-hidden />
        <div className="rdr-tela-icone" aria-hidden>
          {pedido && <><i className="rdr-onda" /><i className="rdr-onda rdr-onda-b" /></>}
          <Icone tamanho={24} />
        </div>
        {t.sobrelinha && <div className="rdr-tela-sobre">{t.sobrelinha}</div>}
        <h2 id={idTit} className="rdr-tela-tit">{t.titulo}</h2>

        <div id={idCli} className="rdr-tela-cli">
          <span className="rdr-tela-av" aria-hidden>{iniciais(i.nome)}</span>
          <div className="rdr-tela-cli-tx">
            <div className="rdr-tela-nome">
              <b>{i.nome}</b>
              {!pedido && !fechado && <SeloPrioridade prioridade={prioDe(i.prioridade)} />}
            </div>
            {linha && <span className={'rdr-tela-linha' + (i.ultimaMsg ? ' rdr-tela-msg' : '')}>{linha}</span>}
          </div>
          {etiqueta}
        </div>

        {fatos.length > 0 && (
          <dl className="rdr-tela-fatos">
            {fatos.map((rot) => {
              const f = fato(rot);
              return <div key={rot} title={f.dica}><dt>{rot}</dt><dd>{f.valor}</dd></div>;
            })}
          </dl>
        )}

        {nMais > 0 && (
          <button type="button" className="rdr-tela-mais" onClick={guarda(aoVerLista)}>
            <span>{textoMais}</span><b>{rtTit('extra.tela.ver_lista', {}, 'Ver lista')}</b>
          </button>
        )}

        <div className="rdr-tela-acoes">
          <button ref={priRef} type="button" className="rdr-tela-pri" onClick={guarda(() => { abriuConversa.current = true; aoResponder(); })}>
            {t.botao_primario ?? 'Abrir conversa e responder'}
            <IcSeta tamanho={15} />
          </button>
          <button type="button" className="rdr-tela-sec" onClick={guarda(aoSecundario)}>
            {t.botao_secundario ?? (pedido ? 'Responder em seguida' : 'Lembrar em 15 min')}
          </button>
        </div>
        {t.rodape && <p className="rdr-tela-rodape">{t.rodape}</p>}
      </div>
    </div>,
    raiz,
  );
}
