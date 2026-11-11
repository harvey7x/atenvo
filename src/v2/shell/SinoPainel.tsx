/* ============================================================================
   Sino — central de notificações (Radar de Atendimento v5, desenho final 29/10).
   PAPEL: registro organizado do que aconteceu; a fila de trabalho é a Central do Radar.
   - Painel de 380px, até 520px de altura. Cabeçalho fixo: título, "Marcar todas como
     lidas" e o filtro Não lidas | Todas (abre em Não lidas).
   - Seções fixas, nesta ordem, com ícone de traço e número de não lidas:
     Gestão · Em negociação · Fechados · Ligar · Outros. Negociação e fechados nunca
     dividem seção; seção sem item no filtro atual não aparece.
   - Uma linha por cliente (seção + ref_id, só a mais recente); itens do Radar lidos há
     mais de 24 h saem do sino (o histórico fica na conversa e no /radar).
   - Etiqueta desenhada pela interface, nada lido do texto: prioridade (alerta ativo do
     próprio usuário, casado pelo ref_id) ou "Encerrado" (lida e o cliente saiu da fila
     daquela família).
   - 3 linhas por seção + "Ver todas (n)": nas seções do Radar abre a Central na aba;
     em Gestão e Outros expande no lugar até 10. Admin: as decisões viram UMA linha-resumo
     no topo de Gestão (abre o /radar) e as notificações individuais de decisão não aparecem.
   - O ponto do sino (AppShellV2) acende só para não lidas de Gestão e Outros: negociação,
     fechados e ligar já aparecem na barra e na tela cheia.
   - Sino pessoal: a consulta já traz só o que é do usuário (atendente: usuario_id = eu).
   - Perfil GESTOR do bom dia (o Murilo — dono 30/10: "a central de avisos não precisa aparecer
     por enquanto"): NADA do Radar — nem na lista, nem nas seções (Gestão, Em negociação,
     Fechados, Ligar, decisões de repasse), nem no ponto. Atendentes e o Matheus: nada muda.
   ============================================================================ */
import { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useOrg } from '@/context/OrgContext';
import { useNotificacoes, useMarcarNotificacao, REMARKETING_REAL, type Notificacao } from '@/data/remarketing';
import { useRadarAvisos, useRadarMeus, useVacuoDecisoes, type RadarFilas, type RadarItem, type VacuoDecisao } from '@/data/vacuo';
import { useModoBomDia } from '@/data/bomDia';
import { dataHoraSP, tempoRelativo } from '../lib/tempo';
import { rt, rtTit, rtTxt, type RadarParams } from '../lib/radarTextos';
import { IcNegociacao, IcFechado, IcLigar, IcDecisao, IcEmDia, IcDocumento, IcInteresse } from '../components/RadarIcones';
import './sino.css';

export type SinoSecao = 'gestao' | 'negociacao' | 'fechados' | 'ligar' | 'outros';
const ORDEM: SinoSecao[] = ['gestao', 'negociacao', 'fechados', 'ligar', 'outros'];

/* Gestão: o que muda o atendimento por decisão de alguém (pedido do gestor, decisão de repasse,
   cliente que saiu / chegou / ficou) e o lead sem responsável avisado ao gestor. */
const GESTAO = new Set([
  'vacuo_cutucada', 'vacuo_decisao', 'vacuo_punicao', 'vacuo_recebido', 'vacuo_mantido', 'vacuo_devolvido',
  'robo_ligar_sem_dono',
]);
const RADAR = new Set([...GESTAO, 'vacuo_aviso', 'vacuo_fechado', 'vacuo_resumo', 'robo_ligar', 'robo_ligar_resumo']);
const RESUMOS = new Set(['vacuo_resumo', 'robo_ligar_resumo']);
/** Seções que acendem o ponto do sino (novidade, não pendência). */
const ACENDEM = new Set<SinoSecao>(['gestao', 'outros']);
/** Seções do Radar: o "Ver todas" abre a Central na aba correspondente. */
const ABA_CENTRAL: Partial<Record<SinoSecao, string>> = { negociacao: 'negociacao', fechados: 'fechados', ligar: 'ligar' };

const POR_SECAO = 3;
const EXPANDIDA = 10;
const DIA_MS = 86_400_000;

/** Seção pelo TIPO (e, no resumo do Radar, pela rota ?radar=fechados) — nunca pelo texto. */
export function secaoDaNotificacao(n: Pick<Notificacao, 'tipo' | 'rota'>): SinoSecao {
  if (GESTAO.has(n.tipo)) return 'gestao';
  if (n.tipo === 'vacuo_aviso') return 'negociacao';
  if (n.tipo === 'vacuo_fechado') return 'fechados';
  if (n.tipo === 'vacuo_resumo') return (n.rota ?? '').includes('radar=fechados') ? 'fechados' : 'negociacao';
  if (n.tipo === 'robo_ligar' || n.tipo === 'robo_ligar_resumo') return 'ligar';
  return 'outros'; // remarketing e demais tipos de outros módulos
}

/** O que fica no sino: sem item do Radar lido há mais de 24 h e uma linha por cliente em cada seção
    (a lista chega do mais novo para o mais antigo, então fica a mais recente). */
export function notificacoesDoSino(lista: Notificacao[], agora = Date.now()): Notificacao[] {
  const vistos = new Set<string>();
  const out: Notificacao[] = [];
  for (const n of lista) {
    if (RADAR.has(n.tipo) && n.lidaEm && agora - new Date(n.lidaEm).getTime() > DIA_MS) continue;
    const s = secaoDaNotificacao(n);
    if (n.refId && s !== 'outros') {
      const k = s + ':' + n.refId;
      if (vistos.has(k)) continue;
      vistos.add(k);
    }
    out.push(n);
  }
  return out;
}

/** Não lidas que ACENDEM o ponto do sino: só Gestão e Outros. */
export function naoLidasQueAcendem(lista: Notificacao[]): number {
  return notificacoesDoSino(lista).filter((n) => !n.lidaEm && ACENDEM.has(secaoDaNotificacao(n))).length;
}

/** A notificação é do Radar (a Central de Avisos)? Negociação, fechados, ligar e Gestão (pedido do gestor,
    decisão de repasse, repassado/recebido/mantido/devolvido, lead sem responsável). */
export const ehDoRadar = (n: Pick<Notificacao, 'tipo'>): boolean => RADAR.has(n.tipo);

/** O sino do perfil GESTOR do bom dia (o Murilo): sem a Central de Avisos, sem nada do Radar — fica o resto
    (Outros: remarketing e os demais módulos). Filtrar AQUI, antes do sino, tira o Radar da lista, das seções,
    da linha-resumo das decisões e do ponto de uma vez. */
export function semRadar(lista: Notificacao[]): Notificacao[] {
  return lista.filter((n) => !ehDoRadar(n));
}

/* ---- etiqueta da linha: desenhada a partir das filas ativas do Radar, nada lido do texto ---- */
export interface RadarAtivos {
  /** conversa → prioridade do alerta de negociação ativo do próprio usuário */
  prioridade: Map<string, string>;
  /** conversas ainda na fila de cada família (o pedido do gestor conta como família própria) */
  negociacao: Set<string>;
  fechado: Set<string>;
  ligar: Set<string>;
  ligarSemDono: Set<string>;
  pedidos: Set<string>;
}

/** Filas ativas: as do PRÓPRIO usuário (useRadarMeus) e, para o gestor, os leads sem responsável. */
export function ativosDoRadar(meus: Pick<RadarFilas, 'negociacao' | 'fechado' | 'ligar' | 'pedidos'>, visiveis: RadarItem[]): RadarAtivos {
  const ids = (l: RadarItem[]) => new Set(l.map((i) => i.conversaId));
  const prioridade = new Map<string, string>();
  for (const i of meus.negociacao) if (i.prioridade) prioridade.set(i.conversaId, i.prioridade);
  return {
    prioridade,
    negociacao: ids(meus.negociacao),
    fechado: ids(meus.fechado),
    ligar: ids(meus.ligar),
    // lead sem responsável: só o gestor recebe esse aviso (e o radar_avisos dele traz a equipe)
    ligarSemDono: ids(visiveis.filter((i) => i.categoria === 'ligar' && !i.donoId)),
    pedidos: meus.pedidos,
  };
}

/** Fila (família) de que a notificação fala; null = fato sem fila (repassado, recebido, mantido, outros módulos). */
function filaDaNotificacao(n: Notificacao, a: RadarAtivos): Set<string> | null {
  switch (n.tipo) {
    // o mesmo cliente pode trocar de fila (fechou / voltou a negociar) e continuar esperando
    case 'vacuo_aviso':
    case 'vacuo_fechado': return new Set([...a.negociacao, ...a.fechado]);
    case 'vacuo_resumo': return secaoDaNotificacao(n) === 'fechados' ? a.fechado : a.negociacao;
    case 'robo_ligar': return a.ligar;
    case 'robo_ligar_sem_dono': return a.ligarSemDono;
    case 'robo_ligar_resumo': return new Set([...a.ligar, ...a.ligarSemDono]);
    case 'vacuo_cutucada': return a.pedidos;
    default: return null;
  }
}

export type EtiquetaSino = { prioridade: string } | 'encerrado' | null;

/** Prioridade (cliente ativo em negociação, nunca em Fechados ou Ligar) ou "Encerrado"
    (notificação do Radar já lida e o cliente fora da fila daquela família; resumo: fila vazia).
    Sem as filas carregadas (`a` nulo) não desenha nada — nunca um "Encerrado" falso. */
export function etiquetaDoSino(n: Notificacao, secao: SinoSecao, a: RadarAtivos | null): EtiquetaSino {
  if (!a) return null;
  if ((secao === 'negociacao' || secao === 'gestao') && n.refId) {
    const p = a.prioridade.get(n.refId);
    if (p) return { prioridade: p };
  }
  if (!n.lidaEm) return null;
  const fila = filaDaNotificacao(n, a);
  if (!fila) return null;
  const encerrado = RESUMOS.has(n.tipo) ? fila.size === 0 : !!n.refId && !fila.has(n.refId);
  return encerrado ? 'encerrado' : null;
}

/* Texto gravado antes do caderno pode trazer emoji; a interface não mostra emoji. */
const RE_EMOJI = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{FE0F}\u{200D}\u{20E3}]/gu;
const semEmoji = (s: string) => s.replace(RE_EMOJI, '').replace(/\s{2,}/g, ' ').trim();

/* ============================================================================
   DEMO (vite --mode demo, sem backend). O sino mostra o que o motor gravaria para as
   fixtures do Radar (src/data/vacuo.ts) com os textos do caderno, e guarda a leitura
   localmente. Cliente que sai da fila (respondeu, ligou, decidiu) vira lido, como no
   motor, e aparece "Encerrado" no filtro Todas. Nada disso roda com backend.
   ============================================================================ */
const SINO_DEMO = !REMARKETING_REAL;
const FUSO = 'America/Sao_Paulo';
/** {desde} do texto gravado: data absoluta ("23/10 às 11:51"), como o banco grava. */
function desdeGravado(iso: string): string {
  const d = new Date(iso);
  const dia = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, day: '2-digit', month: '2-digit' }).format(d);
  const hora = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, hour: '2-digit', minute: '2-digit' }).format(d);
  return `${dia} às ${hora}`;
}
function notifDemo(tipo: string, chave: string, i: RadarItem, sufixo = '', extra: RadarParams = {}): Notificacao {
  const t = rt(chave, { cliente: i.nome, desde: desdeGravado(i.desde), ...extra });
  return {
    id: `sino-demo:${tipo}:${i.conversaId}${sufixo}`, tipo, titulo: t.titulo || i.nome, corpo: t.texto || null,
    rota: '/whatsapp?conversa=' + encodeURIComponent(i.conversaId), refId: i.conversaId, lidaEm: null, criadoEm: i.criadoEm,
  };
}
function decisaoDemo(d: VacuoDecisao): Notificacao {
  const t = rt('notif.decisao', { cliente: d.contatoNome, atendente: d.donoNome, desde: desdeGravado(d.desde) });
  return {
    id: 'sino-demo:vacuo_decisao:' + d.conversaId, tipo: 'vacuo_decisao', titulo: t.titulo || d.contatoNome, corpo: t.texto || null,
    rota: '/radar', refId: d.conversaId, lidaEm: null, criadoEm: d.pedidaEm,
  };
}
type FilasDemo = Pick<RadarFilas, 'negociacao' | 'fechado' | 'ligar' | 'cutucadas'>;
const REGISTRO_DEMO = new Map<string, Notificacao>();
function radarNoSinoDemo(f: FilasDemo, decisoes: VacuoDecisao[]): Notificacao[] {
  const atuais = [
    ...f.negociacao.map((i) => notifDemo('vacuo_aviso', `notif.negociacao.${i.estagio}`, i, `:${i.estagio}`)),
    ...f.fechado.map((i) => notifDemo('vacuo_fechado', `notif.fechado.${i.estagio}`, i, `:${i.estagio}`)),
    ...f.ligar.map((i) => notifDemo('robo_ligar', 'notif.ligar', i)),
    ...f.cutucadas.map((i) => notifDemo('vacuo_cutucada', 'notif.cutucada', i, ':' + (i.cutucadoEm ?? i.criadoEm),
      { gestor: i.cutucadoPorNome || 'O gestor' })),
    ...decisoes.map(decisaoDemo),
  ];
  const ids = new Set(atuais.map((n) => n.id));
  const agora = new Date().toISOString();
  for (const n of atuais) if (!REGISTRO_DEMO.has(n.id)) REGISTRO_DEMO.set(n.id, n);
  for (const [id, n] of REGISTRO_DEMO) if (!ids.has(id) && !n.lidaEm) REGISTRO_DEMO.set(id, { ...n, lidaEm: agora });
  return [...REGISTRO_DEMO.values()];
}
/* leitura local da demo (sem backend, "marcar como lida" não grava nada) */
let lidasDemo: ReadonlyMap<string, string> = new Map();
const ouvintesDemo = new Set<() => void>();
function marcarDemo(ids: string[]) {
  const novo = new Map(lidasDemo);
  const agora = new Date().toISOString();
  for (const id of ids) if (!novo.has(id)) novo.set(id, agora);
  if (novo.size === lidasDemo.size) return;
  lidasDemo = novo;
  ouvintesDemo.forEach((f) => f());
}
const assinarDemo = (f: () => void) => { ouvintesDemo.add(f); return () => { ouvintesDemo.delete(f); }; };
const lerLidasDemo = () => lidasDemo;

/* ============================================================================
   Dados do sino (AppShellV2 usa para o ponto e passa ao painel).
   ============================================================================ */
export interface SinoDados {
  /** notificações do usuário, da mais nova para a mais antiga */
  lista: Notificacao[];
  /** admin: vê as decisões como uma linha-resumo */
  gestor: boolean;
  decisoesPendentes: number;
  marcar: (ids: string[]) => void;
  marcarTodas: () => void;
}

const SEM_NOTIF: Notificacao[] = [];
const SEM_DECISAO: VacuoDecisao[] = [];

export function useSino(): SinoDados {
  const { currentOrg } = useOrg();
  const gestor = currentOrg?.role === 'admin';
  // perfil gestor do bom dia (ou perfil ainda não lido — a Central nunca pisca para o gestor): sem o Radar
  const comRadar = useModoBomDia() === 'vendedor';
  const qc = useQueryClient();
  const notifsQ = useNotificacoes();
  const { mutate: marcarNotif } = useMarcarNotificacao();
  const decisoesQ = useVacuoDecisoes();
  const { negociacao, fechado, ligar, cutucadas } = useRadarMeus();
  const lidas = useSyncExternalStore(assinarDemo, lerLidasDemo, lerLidasDemo);
  const decisoes = gestor && comRadar ? (decisoesQ.data ?? SEM_DECISAO) : SEM_DECISAO;

  const lista = useMemo(() => {
    const base = notifsQ.data ?? SEM_NOTIF;
    if (!SINO_DEMO) return comRadar ? base : semRadar(base);
    // se a demo de notificações já trouxer itens do Radar, não duplica
    const radar = !comRadar || base.some((n) => RADAR.has(n.tipo)) ? [] : radarNoSinoDemo({ negociacao, fechado, ligar, cutucadas }, decisoes);
    const todas = [...base, ...radar]
      .map((n) => (n.lidaEm || !lidas.has(n.id) ? n : { ...n, lidaEm: lidas.get(n.id) ?? null }))
      .sort((a, b) => new Date(b.criadoEm).getTime() - new Date(a.criadoEm).getTime());
    return comRadar ? todas : semRadar(todas);
  }, [notifsQ.data, negociacao, fechado, ligar, cutucadas, decisoes, lidas, comRadar]);

  // leitura otimista: a linha perde o ponto na hora; o refetch confirma com o banco
  const marcarNoCache = useCallback((alvo: (n: Notificacao) => boolean) => {
    const agora = new Date().toISOString();
    void qc.cancelQueries({ queryKey: ['notificacoes'] });
    qc.setQueriesData<Notificacao[]>({ queryKey: ['notificacoes'] }, (old) =>
      old?.map((n) => (!n.lidaEm && alvo(n) ? { ...n, lidaEm: agora } : n)));
  }, [qc]);

  const marcar = useCallback((ids: string[]) => {
    if (!ids.length) return;
    if (SINO_DEMO) { marcarDemo(ids); return; }
    const alvo = new Set(ids);
    marcarNoCache((n) => alvo.has(n.id));
    for (const id of ids) marcarNotif({ id });
  }, [marcarNoCache, marcarNotif]);

  const marcarTodas = useCallback(() => {
    if (SINO_DEMO) { marcarDemo(lista.map((n) => n.id)); return; }
    marcarNoCache(() => true);
    marcarNotif({ todas: true });
  }, [lista, marcarNoCache, marcarNotif]);

  return { lista, gestor, decisoesPendentes: decisoes.length, marcar, marcarTodas };
}

/* ============================================================================
   Painel
   ============================================================================ */
const IcSino = ({ tamanho = 14 }: { tamanho?: number }) => (
  <svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}
    strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false">
    <path d="M18 9a6 6 0 1 0-12 0c0 6-2.5 7-2.5 7h17S18 15 18 9z" /><path d="M10 20a2.2 2.2 0 0 0 4 0" />
  </svg>
);
const ICONE: Record<SinoSecao, (p: { tamanho?: number }) => ReactNode> = {
  gestao: IcDecisao, negociacao: IcNegociacao, fechados: IcFechado, ligar: IcLigar, outros: IcSino,
};
const ROTULO: Record<SinoSecao, string> = {
  gestao: 'Gestão', negociacao: 'Em negociação', fechados: 'Fechados', ligar: 'Ligar', outros: 'Outros',
};

/** Selo de prioridade (só negociação), desenhado a partir do alerta ativo. */
function EtiquetaPrioridade({ prioridade }: { prioridade: string }) {
  const docs = prioridade === 'Documentação enviada';
  const t = rt(docs ? 'selo.prioridade.docs' : 'selo.prioridade.interesse');
  return (
    <span className={'sn-etq prio ' + (docs ? 'docs' : 'interesse')} title={t.texto}>
      {docs ? <IcDocumento tamanho={10} /> : <IcInteresse tamanho={10} />}
      {t.titulo || (docs ? 'Documentação' : 'Interesse')}
    </span>
  );
}

function Linha({ n, etiqueta, agora, aoClicar }: { n: Notificacao; etiqueta: ReactNode; agora: number; aoClicar: () => void }) {
  const texto = n.corpo ? semEmoji(n.corpo) : '';
  return (
    <button type="button" className={'np-item sn-linha' + (n.lidaEm ? '' : ' nova')} onClick={aoClicar}>
      <span className="sn-ponto" aria-hidden />
      <span className="sn-tx">
        <span className="sn-l1">
          <span className="sn-t">{semEmoji(n.titulo)}</span>
          <time className="sn-h num" dateTime={n.criadoEm} title={dataHoraSP(n.criadoEm)}>{tempoRelativo(n.criadoEm, agora)}</time>
        </span>
        {texto && <span className="sn-c">{texto}</span>}
        {etiqueta}
      </span>
    </button>
  );
}

export function SinoPainel({ pos, sino, aoFechar }: {
  /** canto superior direito do painel (preso sob o sino) */
  pos: { top: number; right: number };
  sino: SinoDados;
  /** fecha o painel; com true, devolve o foco ao sino (Esc) */
  aoFechar: (devolverFoco?: boolean) => void;
}) {
  const navigate = useNavigate();
  const [filtro, setFiltro] = useState<'naolidas' | 'todas'>('naolidas');
  const [expandida, setExpandida] = useState<Partial<Record<SinoSecao, boolean>>>({});
  const idTitulo = useId();
  const filtroRef = useRef<HTMLButtonElement>(null);
  // o foco entra no painel ao abrir (teclado: Tab segue pelas linhas; Esc fecha e volta ao sino)
  useEffect(() => { filtroRef.current?.focus({ preventScroll: true }); }, []);

  /* filas do Radar do PRÓPRIO usuário: etiqueta de prioridade e "Encerrado" (nada lido do texto) */
  const { negociacao, fechado, ligar, pedidos } = useRadarMeus();
  const avisosQ = useRadarAvisos();
  const radarPronto = avisosQ.isSuccess;
  const ativos = useMemo(
    () => (radarPronto ? ativosDoRadar({ negociacao, fechado, ligar, pedidos }, avisosQ.data ?? []) : null),
    [radarPronto, negociacao, fechado, ligar, pedidos, avisosQ.data],
  );

  const etiquetaDe = (n: Notificacao, s: SinoSecao): ReactNode => {
    const e = etiquetaDoSino(n, s, ativos);
    if (!e) return null;
    if (e === 'encerrado') return <span className="sn-etq enc">{rtTit('extra.sino.encerrado', {}, 'Encerrado')}</span>;
    return <EtiquetaPrioridade prioridade={e.prioridade} />;
  };

  const agora = Date.now();
  const todas = notificacoesDoSino(sino.lista, agora);
  // admin: decisões só como linha-resumo no topo de Gestão (o /radar é onde decide)
  const decisoes = sino.gestor ? todas.filter((n) => n.tipo === 'vacuo_decisao') : [];
  const visiveis = sino.gestor ? todas.filter((n) => n.tipo !== 'vacuo_decisao') : todas;
  const decNaoLidas = decisoes.filter((n) => !n.lidaEm);
  const nDecisoes = sino.gestor ? Math.max(sino.decisoesPendentes, decNaoLidas.length) : 0;

  const porSecao = ORDEM.map((s) => {
    const daSecao = visiveis.filter((n) => secaoDaNotificacao(n) === s);
    return {
      s,
      itens: filtro === 'todas' ? daSecao : daSecao.filter((n) => !n.lidaEm),
      naoLidas: daSecao.filter((n) => !n.lidaEm).length + (s === 'gestao' ? decNaoLidas.length : 0),
      resumo: s === 'gestao' && nDecisoes > 0,
    };
  });
  const totalNaoLidas = porSecao.reduce((t, x) => t + x.naoLidas, 0);
  const secoes = porSecao.filter((x) => x.itens.length > 0 || x.resumo);

  const ir = (rota: string) => { aoFechar(); navigate(rota); };
  const abrir = (n: Notificacao) => {
    aoFechar();
    if (!n.lidaEm) sino.marcar([n.id]);
    // "X passou para Fulano": a conversa é de outra pessoa agora — para o atendente, o clique só marca como lida
    if (n.rota && !(n.tipo === 'vacuo_punicao' && !sino.gestor)) navigate(n.rota);
  };
  const abrirDecisoes = () => {
    if (decNaoLidas.length) sino.marcar(decNaoLidas.map((n) => n.id));
    ir('/radar');
  };
  const verTodas = (s: SinoSecao) => {
    const aba = ABA_CENTRAL[s];
    if (aba) ir('/whatsapp?radar=' + aba);
    else setExpandida((e) => ({ ...e, [s]: true }));
  };

  const vazio = rt('sino.vazio');
  const resumoTxt = rtTxt('extra.sino.resumo_decisoes', { n: nDecisoes });

  return (
    <div className="usuario-menu notif-panel" role="dialog" aria-labelledby={idTitulo}
      style={{ top: pos.top, right: pos.right }}
      onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); aoFechar(true); } }}>
      <div className="sn-topo">
        <div className="sn-topo-l1">
          <h2 id={idTitulo} className="sn-titulo">{rtTit('extra.sino.titulo', {}, 'Notificações')}</h2>
          {totalNaoLidas > 0 && (
            <button type="button" className="sn-marcar" onClick={sino.marcarTodas}>
              {rtTit('extra.sino.marcar_todas', {}, 'Marcar todas como lidas')}
            </button>
          )}
        </div>
        <div className="sn-filtro">
          <button ref={filtroRef} type="button" aria-pressed={filtro === 'naolidas'} onClick={() => setFiltro('naolidas')}>
            {rtTit('extra.sino.filtro_naolidas', {}, 'Não lidas')}
          </button>
          <button type="button" aria-pressed={filtro === 'todas'} onClick={() => setFiltro('todas')}>
            {rtTit('extra.sino.filtro_todas', {}, 'Todas')}
          </button>
        </div>
      </div>

      <div className="sn-corpo">
        {secoes.length === 0 ? (
          <div className="sn-vazio">
            <IcEmDia tamanho={22} />
            <b>{vazio.titulo || 'Tudo em dia'}</b>
            {/* a frase fala das não lidas; no filtro Todas fica só o título */}
            {filtro === 'naolidas' && <span>{vazio.texto || 'Nenhuma notificação nova. As já lidas ficam no filtro Todas.'}</span>}
          </div>
        ) : secoes.map(({ s, itens, naoLidas, resumo }) => {
          const Ic = ICONE[s];
          const rotulo = rtTit('sino.categoria.' + s, {}, ROTULO[s]);
          const naCentral = !!ABA_CENTRAL[s];
          const limite = !naCentral && expandida[s] ? EXPANDIDA : POR_SECAO;
          const mostrar = itens.slice(0, limite);
          const resto = itens.length - mostrar.length;
          return (
            <section key={s} className={'sn-sec g-' + s}>
              <div className="sn-cab">
                <span className="sn-ic" aria-hidden><Ic tamanho={14} /></span>
                <h3 className="sn-rot">{rotulo}</h3>
                {naoLidas > 0 && <span className="sn-n num">{naoLidas > 99 ? '99+' : naoLidas}</span>}
              </div>
              {resumo && (
                <button type="button" className={'np-item sn-linha sn-resumo' + (decNaoLidas.length ? ' nova' : '')} onClick={abrirDecisoes}>
                  <span className="sn-ponto" aria-hidden />
                  <span className="sn-tx">
                    <span className="sn-l1">
                      <span className="sn-t">{rtTit('extra.sino.resumo_decisoes', { n: nDecisoes }, `Decisões de repasse pendentes: ${nDecisoes}`)}</span>
                    </span>
                    {resumoTxt && <span className="sn-c">{resumoTxt}</span>}
                  </span>
                </button>
              )}
              {mostrar.map((n) => (
                <Linha key={n.id} n={n} etiqueta={etiquetaDe(n, s)} agora={agora} aoClicar={() => abrir(n)} />
              ))}
              {resto > 0 && (naCentral || !expandida[s]) && (
                <button type="button" className="sn-ver" onClick={() => verTodas(s)}>
                  {rtTit('extra.sino.ver_todas', {}, 'Ver todas')} <span className="num">({itens.length})</span>
                </button>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
