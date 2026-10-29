/* ============================================================================
   Radar de Atendimento — painel do GESTOR (/radar), desenho final de 29/10.
   Cada superfície tem um papel: a barra conta, a Central organiza, a tela cheia
   interrompe, o sino registra e ESTE painel DECIDE. É a única visão da equipe
   (os avisos dos atendentes são pessoais e ficam com cada um).
   Ordem de triagem: heróis → regras → decisões (por atendente, com lote) →
   pendências por atendente → em negociação → fechados → ligar → conversão →
   histórico. Negociação e fechados são filas SEPARADAS: nenhum número soma as duas.
   Nada é repassado sem o clique do gestor (o lote pede confirmação), cliente
   fechado nunca entra em repasse e nada vai para o cliente: o Radar é interno.
   Todo texto visível sai do caderno (lib/radarTextos). Os poucos rótulos que o
   caderno ainda não tem (colunas, "Pedida", vazios e erro de carga) usam chaves
   propostas em TXT, com o texto do desenho como fallback.
   ============================================================================ */
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import './guardiao.css';
import { BotaoPrimario, BotaoSec, CardVidro, Checkbox, Chip, Skeleton } from '../components';
import { criarRaizPortalV2 } from '../components/portal';
import { useOrgUsuarios } from '@/data/atendimento';
import { useQueryClient } from '@tanstack/react-query';
import {
  VACUO_REAL, CUTUCAR_INTERVALO_MS, repasseEfetivo, recarregarRadar,
  useRadarAvisos, useRadarEquipe, useVacuoDecisoes, useDecidirRepasse, useCutucar,
  useVacuoRepasses, useVacuoRanking, useVacuoConfig,
  type RadarItem, type VacuoDecisao, type VacuoRepasse, type VacuoRankItem, type VacuoConfigView,
} from '@/data/vacuo';
import {
  rt, rtTit, rtTxt, fmtTempo, fmtTempoLinha, fmtFalta, fmtDesde, fmtDesdeCurto, iniciais,
} from '../lib/radarTextos';
import {
  IcNegociacao, IcFechado, IcLigar, IcDecisao, IcGestor, IcDocumento, IcInteresse, IcDestaque, IcEmDia, IcSeta,
} from '../components/RadarIcones';

type Familia = 'negociacao' | 'fechado';
/** Urgência de uma fila: pior degrau (âmbar no 1º · contorno rubro no 2º · rubro cheio no último). */
type TomUrg = 'zero' | 'u1' | 'u2' | 'u3';
type TomCont = TomUrg | 'dec' | 'azul';
type IconeRadar = (p: { tamanho?: number }) => ReactNode;
interface OpcaoDestino { id: string; nome: string }

const POR_TABELA = 15;
const POR_GRUPO = 5;
const DESTAQUE_MS = 2000;
const OK_PEDIDO_MS = 6000;
const SEM_DONO = '__sem_dono__';

const chaveDono = (id: string | null | undefined) => id || SEM_DONO;

/* ---------------------------------------------------------------------------
   Textos
   --------------------------------------------------------------------------- */

/** Rótulos que o caderno ainda NÃO tem (chaves propostas): o fallback é o texto do desenho. */
const TXT = {
  cliente: () => rtTit('extra.painel.col_cliente', {}, 'Cliente'),
  prioridade: () => rtTit('extra.painel.col_prioridade', {}, 'Prioridade'),
  responsavel: () => rtTit('extra.painel.col_responsavel', {}, 'Responsável'),
  decisaoEm: () => rtTit('extra.painel.col_decisao_em', {}, 'Decisão em'),
  pedir: () => rtTit('extra.painel.col_pedir', {}, 'Pedir resposta'),
  quemLiga: () => rtTit('extra.painel.col_quem_liga', {}, 'Quem deve ligar'),
  parado: () => rtTit('extra.painel.col_parado', {}, 'Parado há'),
  atendente: () => rtTit('extra.painel.col_atendente', {}, 'Atendente'),
  recebidos: () => rtTit('extra.painel.col_recebidos', {}, 'Recebidos'),
  conversao: () => rtTit('extra.painel.col_conversao', {}, 'Conversão'),
  repassados: () => rtTit('extra.painel.col_repassados', {}, 'Clientes repassados'),
  quando: () => rtTit('extra.painel.col_quando', {}, 'Quando'),
  desfecho: () => rtTit('extra.painel.col_desfecho', {}, 'Desfecho'),
  pedida: () => rtTxt('extra.painel.decisao_pedida', {}, 'Pedida'),
  vazioRanking: () => rtTxt('extra.painel.vazio_ranking', {}, 'Nenhum dado de conversão nos últimos 30 dias.'),
  vazioHistorico: () => rtTxt('extra.painel.vazio_historico', {}, 'Nenhuma decisão nos últimos 30 dias.'),
  erroCarga: () => rtTxt('extra.painel.erro_carga', {}, 'Não foi possível carregar esta lista.'),
  tentar: () => rtTit('extra.painel.tentar_de_novo', {}, 'Tentar de novo'),
};

/* "Sem resposta", "Desde" e "Aviso" são os rótulos de fato do cartão de fechado: um termo por conceito. */
const fatos = () => rt('tela.fechado_ultimo').fatos ?? [];
const colSemResposta = () => fatos()[0] || 'Sem resposta';
const colDesde = () => fatos()[1] || 'Desde';
const colAviso = () => fatos()[2] || 'Aviso';
/* "Em negociação", "Fechados", "Ligar" e "Decisões": o mesmo nome da barra, das abas e do sino. */
const colFila = (aba: 'negociacao' | 'fechados' | 'ligar' | 'decisoes', padrao: string) => rtTit('central.aba.' + aba, {}, padrao);

const abrirConversa = () => rt('central.botao.ja_liguei').botao_secundario || 'Abrir conversa';
const semResponsavel = () => rtTit('extra.painel.sem_responsavel', {}, 'Sem responsável');
const marcaSugestao = () => rtTit('extra.painel.sugestao', {}, 'Sugerido · maior conversão');
/** "Repassar para" (rótulo do seletor) = o botão do cartão sem o {para}. */
const rotuloRepassarPara = () => rt('extra.painel.cartao_decisao', { para: '' }).botao_primario || 'Repassar para';
/** "Repassar para…" = ainda falta escolher o destino. */
const repassarReticencia = () => rt('extra.painel.lote').botao_primario || 'Repassar para…';
const mostrarTodos = (n: number) => `${rtTit('extra.painel.mostrar_todos', {}, 'Mostrar todos')} (${n})`;
const linhaDesde = (iso: string, agora: number) => {
  const desde = fmtDesde(iso, new Date(agora));
  return rtTxt('extra.central.linha_desde', { desde }, `Sem resposta desde ${desde}`);
};

/** Faixa de regras: o texto do caderno com os números da vacuo_config, no mesmo formato. */
const REGRAS_PADRAO = 'Avisos: 30 min, 2 h e 5 h úteis (prioritário: 15 min, 1 h e 3 h) · Gestor decide: 1 dia útil · Fechados sem repasse · Seg. a sex., 9h às 18h';
const RE_VALOR_REGRA = /\d+ dias úteis|\d+ dia útil|\d+ h \d+ min|\d+ min|\d+ h(?![a-zà-ú])|\d+h(?![a-zà-ú])/g;
function textoRegras(cfg: VacuoConfigView | null, diaUtil: number): string {
  const base = rtTxt('extra.painel.regras', {}, REGRAS_PADRAO);
  if (!cfg) return base;
  const t = (min: number) => fmtTempo(min, diaUtil);
  // na ordem em que aparecem no texto: 3 avisos, 3 avisos do prioritário, decisão, horário
  const v = [t(cfg.aviso1), t(cfg.aviso2), t(cfg.aviso3), t(cfg.prioAviso1), t(cfg.prioAviso2), t(cfg.prioAviso3),
    t(cfg.repasse), `${cfg.horaInicio}h`, `${cfg.horaFim}h`];
  if ((base.match(RE_VALOR_REGRA) ?? []).length === v.length) {
    let i = 0;
    return base.replace(RE_VALOR_REGRA, () => v[i++]);
  }
  // o caderno mudou de forma: o mesmo desenho, montado aqui
  return `Avisos: ${v[0]}, ${v[1]} e ${v[2]} úteis (prioritário: ${v[3]}, ${v[4]} e ${v[5]}) · Gestor decide: ${v[6]} · Fechados sem repasse · Seg. a sex., ${v[7]} às ${v[8]}`;
}

/* ---------------------------------------------------------------------------
   Regras de ordem e cor
   --------------------------------------------------------------------------- */
const PESO_PRIO: Record<string, number> = { 'Documentação enviada': 2, 'Interesse confirmado': 1 };
const pesoPrio = (p: string | null) => (p ? PESO_PRIO[p] ?? 0 : 0);

/** Negociação: estágio, prioridade, antiguidade. */
const ordNegociacao = (a: RadarItem, b: RadarItem) =>
  b.estagio - a.estagio || pesoPrio(b.prioridade) - pesoPrio(a.prioridade) || a.desde.localeCompare(b.desde);
/** Fechados: estágio, antiguidade (fechado nunca tem prioridade). */
const ordFechado = (a: RadarItem, b: RadarItem) => b.estagio - a.estagio || a.desde.localeCompare(b.desde);
/** Decisões dentro do grupo: prioritários, depois os mais antigos. */
const ordenarDecisoes = (l: VacuoDecisao[]) =>
  [...l].sort((a, b) => Number(b.prioritario) - Number(a.prioritario) || a.desde.localeCompare(b.desde));

function tomDaFila(l: RadarItem[]): TomUrg {
  let pior = 0;
  for (const i of l) if (i.estagio > pior) pior = i.estagio;
  return pior >= 3 ? 'u3' : pior === 2 ? 'u2' : pior === 1 ? 'u1' : 'zero';
}

function prioDaDecisao(d: VacuoDecisao, vivo?: RadarItem): string | null {
  if (vivo?.prioridade) return vivo.prioridade;
  if (!d.prioritario) return null;
  return /document/i.test(d.prioMotivo ?? '') ? 'Documentação enviada' : 'Interesse confirmado';
}

/** Modo Leve ou "reduzir movimento" do sistema: rolagem sem animação. */
function movimentoReduzido(): boolean {
  try {
    return document.documentElement.getAttribute('data-perf') === 'lite'
      || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** Herói → seção: rola até ela e leva o foco ao título (teclado e leitor de tela chegam junto). */
function irParaSecao(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: movimentoReduzido() ? 'auto' : 'smooth', block: 'start' });
  el.querySelector<HTMLElement>('[data-foco-secao]')?.focus({ preventScroll: true });
}

/** Foco no título de "Aguardando sua decisão" (quando o elemento focado saiu da tela). */
function focarDecisoes() {
  document.querySelector<HTMLElement>('#radar-decisoes [data-foco-secao]')?.focus({ preventScroll: true });
}

const erroMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/* ---------------------------------------------------------------------------
   Peças pequenas
   --------------------------------------------------------------------------- */

/** Prioridade (só negociação): ícone de traço + "Documentação" / "Interesse". */
function SeloPrio({ prioridade }: { prioridade: string | null }) {
  if (!prioridade) return null;
  const docs = /document/i.test(prioridade);
  const t = rt(docs ? 'selo.prioridade.docs' : 'selo.prioridade.interesse');
  return (
    <span className="gd-prio" title={t.texto}>
      {docs ? <IcDocumento tamanho={11} /> : <IcInteresse tamanho={11} />}
      {t.titulo || (docs ? 'Documentação' : 'Interesse')}
    </span>
  );
}

/** Medidor 1–3 do aviso: traços acesos + rótulo do degrau, com a dica do selo (família e estágio). */
function Medidor({ item, diaUtil }: { item: RadarItem; diaUtil: number }) {
  const e = item.estagio || 1;
  const fam: Familia = item.categoria === 'fechado' ? 'fechado' : 'negociacao';
  const s = rt(`selo.${fam}.${e}`, { tempo: fmtTempo(item.minutosUteis, diaUtil) });
  return (
    <span className={'gd-esc e' + e} title={s.texto}>
      <span className="gd-esc-tr" aria-hidden><i /><i /><i /></span>
      <span className="gd-esc-rot">{s.titulo || (e === 3 ? 'Último aviso' : `${e}º aviso`)}</span>
    </span>
  );
}

function Contagem({ n, tom }: { n: number; tom: TomCont }) {
  return <span className={'gd-cont num t-' + (n > 0 ? tom : 'zero')}>{n}</span>;
}

function Vazio({ texto }: { texto: string }) {
  return <div className="gd-vazio"><IcEmDia tamanho={16} /><span>{texto}</span></div>;
}

function ErroCarga({ erro, aoTentar }: { erro: unknown; aoTentar: () => void }) {
  const msg = erro ? erroMsg(erro) : '';
  return (
    <div className="gd-erro" role="alert">
      <span>{TXT.erroCarga()}</span>
      <button type="button" className="gd-link" onClick={aoTentar}>{TXT.tentar()}</button>
      {msg && <small>{msg}</small>}
    </div>
  );
}

function BotaoMais({ rotulo, onClick }: { rotulo: string; onClick: () => void }) {
  return <button type="button" className="gd-mais" onClick={onClick}>{rotulo}</button>;
}

/** Nome do cliente na tabela: botão que abre a conversa (a linha inteira também abre, com o mouse). */
function BotaoCliente({ nome, aoAbrir, extra }: { nome: string; aoAbrir: () => void; extra?: ReactNode }) {
  return (
    <button type="button" className="gd-cli" title={abrirConversa()} onClick={(e) => { e.stopPropagation(); aoAbrir(); }}>
      <span className="gd-av" aria-hidden>{iniciais(nome)}</span>
      <span className="gd-cli-nome">{nome}</span>
      {extra}
    </button>
  );
}

/* ---------------------------------------------------------------------------
   Heróis e seções
   --------------------------------------------------------------------------- */

function Hero({ familia, Icone, titulo, n, tom, sub, carregando, erro, alvo, atraso }: {
  familia: 'dec' | 'neg' | 'fec' | 'lig'; Icone: IconeRadar; titulo: string; n: number; tom: TomCont;
  sub: string; carregando: boolean; erro: boolean; alvo: string; atraso: number;
}) {
  const neutro = carregando || erro || n === 0;
  const emDia = !carregando && !erro && n === 0;
  return (
    <CardVidro spot sobe atraso={atraso} className={`gd-hero f-${familia} t-${neutro ? 'zero' : tom}`}>
      <button type="button" className="gd-hero-btn" onClick={() => irParaSecao(alvo)}>
        <span className="gd-hero-rot"><Icone tamanho={13} /><span>{titulo}</span></span>
        <span className="gd-hero-val num">
          {carregando ? <span className="skel gd-skel-val" aria-hidden /> : erro ? '—' : n}
        </span>
        <span className="gd-hero-sub">
          {emDia ? <><IcEmDia tamanho={12} />{rtTxt('extra.painel.hero_zero', {}, 'Em dia')}</> : neutro ? null : sub}
        </span>
      </button>
    </CardVidro>
  );
}

function Secao({ id, familia, Icone, titulo, texto, contagem, cabExtra, atraso, children }: {
  id: string; familia?: 'dec' | 'neg' | 'fec' | 'lig'; Icone?: IconeRadar; titulo: string; texto?: string;
  contagem?: ReactNode; cabExtra?: ReactNode; atraso: number; children: ReactNode;
}) {
  const idTit = id + '-titulo';
  return (
    <CardVidro sobe atraso={atraso} id={id} role="region" aria-labelledby={idTit}
      className={'gd-sec' + (familia ? ' f-' + familia : '')}>
      <header className="gd-sec-cab">
        <h2 className="gd-sec-tit" id={idTit} tabIndex={-1} data-foco-secao="">
          {Icone && <span className="gd-sec-ic" aria-hidden><Icone tamanho={15} /></span>}
          <span>{titulo}</span>
          {contagem}
        </h2>
        {texto && <p className="gd-sec-txt">{texto}</p>}
        {cabExtra}
      </header>
      {children}
    </CardVidro>
  );
}

/* ---------------------------------------------------------------------------
   Pedir resposta (antigo "cutucar"): tela cheia imediata para o atendente, o selo
   "Gestor pediu", a notificação e a nota interna. Qualquer estágio, negociação ou
   fechado. Trava 10 min por cliente (a RPC também confere); o erro vem do banco.
   --------------------------------------------------------------------------- */
function PedirResposta({ conversaId, atendente, cutucadoEm, agora, compacto, desativado }: {
  conversaId: string; atendente: string | null; cutucadoEm: string | null; agora: number;
  compacto?: boolean; desativado?: boolean;
}) {
  const cutucar = useCutucar();
  const [ok, setOk] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => {
    if (!ok) return;
    const t = setTimeout(() => setOk(null), OK_PEDIDO_MS);
    return () => clearTimeout(t);
  }, [ok]);

  if (!atendente) {
    return (
      <span className="gd-mudo" title={rtTxt('extra.erro.pedido_sem_dono', {}, 'Este cliente está sem atendente. Defina um responsável antes de pedir resposta.')}>—</span>
    );
  }
  const decorrido = cutucadoEm ? agora - new Date(cutucadoEm).getTime() : Number.POSITIVE_INFINITY;
  const travado = decorrido < CUTUCAR_INTERVALO_MS;
  const t = rt('extra.painel.pedir_resposta', { atendente });
  const ha = fmtTempo(Math.max(1, Math.floor(decorrido / 60_000)));
  const rotulo = travado
    ? rtTit('extra.painel.pedido_feito', { tempo: ha }, `Pedido feito há ${ha}`)
    : (t.botao_primario || `Pedir resposta a ${atendente}`);
  const dica = travado
    ? rtTxt('extra.erro.pedido_recente', {}, 'Você pediu resposta há menos de 10 min. Aguarde antes de pedir de novo.')
    : t.texto;
  // aria-disabled (e não disabled): o foco do teclado fica no botão quando ele trava depois do pedido
  const inativo = travado || cutucar.isPending || !!desativado;
  return (
    <span className="gd-pedir-wrap" onClick={(e) => e.stopPropagation()}>
      <button type="button" className={'gd-pedir' + (compacto ? ' compacto' : '')} title={dica}
        aria-disabled={inativo || undefined} aria-busy={cutucar.isPending || undefined}
        onClick={() => {
          if (inativo) return;
          setErro(null);
          setOk(null);
          cutucar.mutate(conversaId, {
            onSuccess: () => setOk(rtTxt('extra.painel.ok_pedido', { atendente }, `Pedido registrado para ${atendente}.`)),
            onError: (e) => setErro(erroMsg(e)),
          });
        }}>
        <IcGestor tamanho={12} />
        <span>{rotulo}</span>
      </button>
      <span className="gd-pedir-ok" role="status">{ok}</span>
      {erro && <span className="gd-pedir-erro" role="alert">{erro}</span>}
    </span>
  );
}

/* ---------------------------------------------------------------------------
   Aguardando sua decisão
   --------------------------------------------------------------------------- */

/** Seletor de destino: a sugestão (maior conversão) vem primeiro, pré-selecionada e marcada. */
function SeletorDestino({ valor, opcoes, sugestaoId, desativado, aoMudar }: {
  valor: string; opcoes: OpcaoDestino[]; sugestaoId: string | null; desativado?: boolean; aoMudar: (id: string) => void;
}) {
  const marca = marcaSugestao();
  return (
    <label className="gd-dest">
      <span>{rotuloRepassarPara()}</span>
      <select className="inp gd-select" value={valor} disabled={desativado || opcoes.length === 0}
        onChange={(e) => aoMudar(e.target.value)}>
        {!sugestaoId && <option value="" disabled>{repassarReticencia()}</option>}
        {opcoes.map((u) => (
          <option key={u.id} value={u.id}>{u.id === sugestaoId ? `${u.nome} · ${marca}` : u.nome}</option>
        ))}
      </select>
    </label>
  );
}

type EstadoNoLote = 'fila' | 'andando' | undefined;

/** Uma decisão pendente: repassar (para quem o gestor escolher), manter ou pedir resposta ao atendente. */
function CartaoDecisao({
  d, vivo, opcoes, sugestaoId, agora, diaUtil, destaqueN, realce,
  selecionavel, selecionado, aoSelecionar, noLote, erroLote, travado, aoAbrir, aoResolvido, aoLimparErro,
}: {
  d: VacuoDecisao; vivo?: RadarItem; opcoes: OpcaoDestino[]; sugestaoId: string | null; agora: number; diaUtil: number;
  destaqueN: number; realce: boolean; selecionavel: boolean; selecionado: boolean; aoSelecionar: () => void;
  noLote: EstadoNoLote; erroLote?: string; travado: boolean;
  aoAbrir: () => void; aoResolvido: () => void; aoLimparErro: () => void;
}) {
  const decidir = useDecidirRepasse();
  const [escolha, setEscolha] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const ref = useRef<HTMLElement>(null);
  const idNome = useId();

  // /radar?decidir=<conversa>: rola até o cartão e leva o foco a ele
  useEffect(() => {
    if (!destaqueN) return;
    const el = ref.current;
    if (!el) return;
    el.scrollIntoView({ behavior: movimentoReduzido() ? 'auto' : 'smooth', block: 'center' });
    el.focus({ preventScroll: true });
  }, [destaqueN]);

  const destino = escolha && opcoes.some((u) => u.id === escolha) ? escolha : (sugestaoId ?? '');
  const para = opcoes.find((u) => u.id === destino)?.nome ?? '';
  const tempo = fmtTempo(vivo?.minutosUteis ?? d.minutos, diaUtil);
  const c = rt('extra.painel.cartao_decisao', { atendente: d.donoNome, tempo, para });
  const processando = decidir.isPending || noLote === 'andando';
  const ocupado = processando || travado || noLote === 'fila';
  const enviar = (destinoId: string | null) => {
    setErro(null);
    aoLimparErro();
    decidir.mutate({ conversaId: d.conversaId, destinoId }, {
      onSuccess: () => {
        // o cartão sai da lista; quem decidia pelo teclado segue para o próximo
        const el = ref.current;
        const proximo = el && el.contains(document.activeElement)
          ? (el.nextElementSibling ?? el.previousElementSibling) as HTMLElement | null
          : null;
        aoResolvido();
        if (proximo?.matches('.gd-dec, .gd-mais')) requestAnimationFrame(() => proximo.focus({ preventScroll: true }));
        else if (proximo) requestAnimationFrame(focarDecisoes);
      },
      onError: (e) => setErro(erroMsg(e)),
    });
  };
  const msgErro = erro ?? erroLote ?? null;

  return (
    <article ref={ref} tabIndex={-1} aria-labelledby={idNome} aria-busy={processando || undefined}
      className={'gd-dec' + (realce ? ' destaque' : '') + (selecionado ? ' sel' : '') + (noLote ? ' lote-' + noLote : '')}>
      <div className="gd-dec-topo">
        {selecionavel && <Checkbox marcado={selecionado} aoAlternar={aoSelecionar} rotulo={d.contatoNome} />}
        <span className="gd-av" aria-hidden>{iniciais(d.contatoNome)}</span>
        <div className="gd-dec-id">
          <div className="gd-dec-l1">
            <button type="button" id={idNome} className="gd-dec-nome" title={abrirConversa()} onClick={aoAbrir}>{d.contatoNome}</button>
            <SeloPrio prioridade={prioDaDecisao(d, vivo)} />
          </div>
          <div className="gd-dec-meta num" title={linhaDesde(d.desde, agora)}>
            {tempo
              ? (c.texto || `Com ${d.donoNome} · sem resposta há ${tempo}`)
              : rtTit('extra.painel.grupo_atendente', { atendente: d.donoNome }, `Com ${d.donoNome}`)}
          </div>
        </div>
      </div>
      <div className="gd-dec-acoes">
        <SeletorDestino valor={destino} opcoes={opcoes} sugestaoId={sugestaoId} desativado={ocupado} aoMudar={setEscolha} />
        <BotaoPrimario disabled={!destino || ocupado} onClick={() => enviar(destino)}>
          {destino ? (c.botao_primario || `Repassar para ${para}`) : repassarReticencia()}
        </BotaoPrimario>
        <BotaoSec disabled={ocupado} onClick={() => enviar(null)}>
          {c.botao_secundario || `Manter com ${d.donoNome}`}
        </BotaoSec>
        <PedirResposta conversaId={d.conversaId} atendente={d.donoId ? d.donoNome : null} cutucadoEm={d.cutucadoEm}
          agora={agora} desativado={ocupado} />
      </div>
      {msgErro && <p className="gd-dec-erro" role="alert">{msgErro}</p>}
    </article>
  );
}

/** Barra do lote (só dentro do grupo de um atendente): mesmo desenho do cartão — seletor de destino,
    "Repassar para…" (abre a confirmação) e "Manter com o atendente atual". */
function BarraLote({ n, rodando, total, feitos, opcoes, sugestaoId, aoManter, aoRepassar }: {
  n: number; rodando: boolean; total: number; feitos: number; opcoes: OpcaoDestino[]; sugestaoId: string | null;
  aoManter: () => void; aoRepassar: (destinoId: string) => void;
}) {
  const [escolha, setEscolha] = useState<string | null>(null);
  const destino = escolha && opcoes.some((u) => u.id === escolha) ? escolha : (sugestaoId ?? '');
  const t = rt('extra.painel.lote', { n });
  const titulo = t.titulo || `Selecionados: ${n}`;
  const parado = rodando || n === 0;
  return (
    <div className="gd-lote" role="group" aria-label={titulo}>
      <div className="gd-lote-cab">
        <b className="gd-lote-n num">{titulo}</b>
        <span className="gd-lote-txt">{t.texto}</span>
      </div>
      <div className="gd-lote-acoes">
        <SeletorDestino valor={destino} opcoes={opcoes} sugestaoId={sugestaoId} desativado={parado} aoMudar={setEscolha} />
        <BotaoPrimario mini disabled={parado || !destino} onClick={() => aoRepassar(destino)}>
          {t.botao_primario || 'Repassar para…'}
        </BotaoPrimario>
        <BotaoSec mini disabled={parado} onClick={aoManter}>{t.botao_secundario || 'Manter com o atendente atual'}</BotaoSec>
      </div>
      {rodando && (
        <div className="gd-lote-prog" role="progressbar" aria-label={titulo}
          aria-valuemin={0} aria-valuemax={total} aria-valuenow={feitos}>
          <i style={{ width: `${total ? Math.round((feitos / total) * 100) : 0}%` }} />
        </div>
      )}
    </div>
  );
}

/** Confirmação do repasse em lote: número, destino e nomes à vista; nada é repassado sem "Confirmar repasse". */
function ConfirmaLote({ nomes, para, aoConfirmar, aoCancelar }: {
  nomes: string[]; para: string; aoConfirmar: () => void; aoCancelar: () => void;
}) {
  const [raiz, setRaiz] = useState<HTMLElement | null>(null);
  const cartao = useRef<HTMLDivElement>(null);
  const cancelar = useRef(aoCancelar);
  useEffect(() => { cancelar.current = aoCancelar; });
  const idTit = useId();
  const idTxt = useId();

  // raiz de portal v2 (regra 10): criada ao abrir, removida ao fechar
  useEffect(() => {
    const el = criarRaizPortalV2(document) as unknown as HTMLElement;
    setRaiz(el);
    return () => { el.remove(); setRaiz(null); };
  }, []);

  // foco em "Cancelar" (o repasse pede um clique deliberado), Tab preso no diálogo, Esc cancela; ao fechar,
  // o foco volta ao botão que abriu (se ele ficou desativado porque o lote começou, vai para o título da seção)
  useEffect(() => {
    if (!raiz) return;
    const anterior = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const foco = setTimeout(() => cartao.current?.querySelector<HTMLElement>('[data-foco-inicial]')?.focus(), 30);
    const teclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); cancelar.current(); return; }
      if (e.key !== 'Tab' || !cartao.current) return;
      const focaveis = [...cartao.current.querySelectorAll<HTMLElement>('button:not([disabled])')];
      if (!focaveis.length) return;
      const primeiro = focaveis[0];
      const ultimo = focaveis[focaveis.length - 1];
      const dentro = cartao.current.contains(document.activeElement);
      if (!dentro) { e.preventDefault(); (e.shiftKey ? ultimo : primeiro).focus(); }
      else if (e.shiftKey && document.activeElement === primeiro) { e.preventDefault(); ultimo.focus(); }
      else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primeiro.focus(); }
    };
    document.addEventListener('keydown', teclar);
    return () => {
      clearTimeout(foco);
      document.removeEventListener('keydown', teclar);
      if (anterior && anterior.isConnected && !anterior.hasAttribute('disabled')) anterior.focus({ preventScroll: true });
      else focarDecisoes();
    };
  }, [raiz]);

  if (!raiz) return null;
  const t = rt('extra.painel.lote_confirma', { n: nomes.length, para });
  return createPortal(
    <div className="veu gd-veu" onMouseDown={(e) => { if (e.target === e.currentTarget) aoCancelar(); }}>
      <div ref={cartao} className="p-modal vidro gd-confirma" role="alertdialog" aria-modal="true"
        aria-labelledby={idTit} aria-describedby={idTxt}>
        <div className="p-modal-cab" id={idTit}>{t.titulo || `Confirmar repasse para ${para}`}</div>
        <div className="p-modal-corpo">
          <p className="p-modal-msg" id={idTxt}>
            {t.texto || `Clientes selecionados: ${nomes.length}. Cada um passa para ${para} e fica registrado no histórico como decisão sua.`}
          </p>
          <ul className="gd-confirma-lista">
            {nomes.map((nome, i) => (
              <li key={i + nome}><span className="gd-av" aria-hidden>{iniciais(nome)}</span><span>{nome}</span></li>
            ))}
          </ul>
        </div>
        <div className="p-modal-rodape">
          <BotaoSec data-foco-inicial="" onClick={aoCancelar}>{t.botao_secundario || 'Cancelar'}</BotaoSec>
          <BotaoPrimario onClick={aoConfirmar}>{t.botao_primario || 'Confirmar repasse'}</BotaoPrimario>
        </div>
      </div>
    </div>,
    raiz,
  );
}

/* ---------------------------------------------------------------------------
   Tabelas (15 linhas + "Mostrar todos (n)"; clicar na linha abre a conversa)
   --------------------------------------------------------------------------- */

/** "Decisão em": quanto falta para o gestor ser acionado, ou "Pedida" (leva ao cartão de decisão). */
function DecisaoEm({ item, temCartao, aoIr, diaUtil }: {
  item: RadarItem; temCartao: boolean; aoIr: (id: string) => void; diaUtil: number;
}) {
  if (item.decisaoPedidaEm) {
    return temCartao ? (
      <button type="button" className="gd-pedida" title={rt('central.botao.decidir').botao_primario || 'Decidir'}
        onClick={(e) => { e.stopPropagation(); aoIr(item.conversaId); }}>
        {TXT.pedida()}
      </button>
    ) : <span className="gd-pedida">{TXT.pedida()}</span>;
  }
  if (item.decisaoEmMin == null) return <span className="gd-mudo">—</span>;
  return <>{fmtFalta(item.decisaoEmMin, diaUtil)}</>;
}

/** Em negociação OU fechados — nunca juntos. Fechado: sem prioridade, sem decisão, sem repasse. */
function TabelaAvisos({ itens, familia, agora, diaUtil, comCartao, aoAbrir, aoIrDecisao }: {
  itens: RadarItem[]; familia: Familia; agora: number; diaUtil: number; comCartao: ReadonlySet<string>;
  aoAbrir: (id: string) => void; aoIrDecisao: (id: string) => void;
}) {
  const [tudo, setTudo] = useState(false);
  const lista = tudo ? itens : itens.slice(0, POR_TABELA);
  const neg = familia === 'negociacao';
  const hoje = new Date(agora);
  return (
    <>
      <div className="gd-tab-rolo">
        <table className={'gd-tab ' + (neg ? 'neg' : 'fech')}>
          <thead>
            <tr>
              <th scope="col">{TXT.cliente()}</th>
              <th scope="col">{colAviso()}</th>
              {neg && <th scope="col">{TXT.prioridade()}</th>}
              <th scope="col">{TXT.responsavel()}</th>
              <th scope="col" className="num">{colSemResposta()}</th>
              {!neg && <th scope="col" className="num">{colDesde()}</th>}
              {neg && <th scope="col" className="num">{TXT.decisaoEm()}</th>}
              <th scope="col" className="gd-c-acao">{TXT.pedir()}</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((r) => (
              <tr key={r.alertaId} className="clk" onClick={() => aoAbrir(r.conversaId)}>
                <td><BotaoCliente nome={r.nome} aoAbrir={() => aoAbrir(r.conversaId)} /></td>
                <td><Medidor item={r} diaUtil={diaUtil} /></td>
                {neg && <td>{r.prioridade ? <SeloPrio prioridade={r.prioridade} /> : <span className="gd-mudo">—</span>}</td>}
                <td>{r.donoId && r.donoNome ? r.donoNome : <span className="gd-rub">{semResponsavel()}</span>}</td>
                <td className="num" title={linhaDesde(r.desde, agora)}>{fmtTempoLinha(r.minutosUteis, diaUtil)}</td>
                {!neg && <td className="num gd-mudo">{fmtDesdeCurto(r.desde, hoje)}</td>}
                {neg && (
                  <td className="num">
                    <DecisaoEm item={r} temCartao={comCartao.has(r.conversaId)} aoIr={aoIrDecisao} diaUtil={diaUtil} />
                  </td>
                )}
                <td className="gd-c-acao">
                  <PedirResposta conversaId={r.conversaId} atendente={r.donoId && r.donoNome ? r.donoNome : null}
                    cutucadoEm={r.cutucadoEm} agora={agora} compacto />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!tudo && itens.length > POR_TABELA && <BotaoMais rotulo={mostrarTodos(itens.length)} onClick={() => setTudo(true)} />}
    </>
  );
}

function TabelaLigar({ itens, diaUtil, aoAbrir }: { itens: RadarItem[]; diaUtil: number; aoAbrir: (id: string) => void }) {
  const [tudo, setTudo] = useState(false);
  const lista = tudo ? itens : itens.slice(0, POR_TABELA);
  return (
    <>
      <div className="gd-tab-rolo">
        <table className="gd-tab lig">
          <thead>
            <tr>
              <th scope="col">{TXT.cliente()}</th>
              <th scope="col">{TXT.quemLiga()}</th>
              <th scope="col" className="num">{TXT.parado()}</th>
              <th scope="col" className="gd-c-acao"><span className="gd-sr">{abrirConversa()}</span></th>
            </tr>
          </thead>
          <tbody>
            {lista.map((l) => (
              <tr key={l.alertaId} className="clk" onClick={() => aoAbrir(l.conversaId)}>
                <td><span className="gd-cli"><span className="gd-av" aria-hidden>{iniciais(l.nome)}</span><span className="gd-cli-nome">{l.nome}</span></span></td>
                <td>{l.donoId && l.donoNome ? l.donoNome : <span className="gd-rub">{semResponsavel()}</span>}</td>
                <td className="num" title={rtTxt('central.linha.ligar', { tempo: fmtTempo(l.minutosUteis, diaUtil) })}>
                  {fmtTempoLinha(l.minutosUteis, diaUtil)}
                </td>
                <td className="gd-c-acao">
                  <button type="button" className="gd-abrir" onClick={(e) => { e.stopPropagation(); aoAbrir(l.conversaId); }}>
                    {abrirConversa()}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!tudo && itens.length > POR_TABELA && <BotaoMais rotulo={mostrarTodos(itens.length)} onClick={() => setTudo(true)} />}
    </>
  );
}

interface LinhaPend { chave: string; nome: string; neg: number; negU: number; fec: number; fecU: number; lig: number; dec: number }

/** Total da fila e, em rubro cheio, quantos estão no último aviso. */
function CelulaPend({ n, ult }: { n: number; ult: number }) {
  if (!n) return <span className="gd-mudo">0</span>;
  const dica = rtTxt('extra.barra.sub_ultimo', { n: ult }, `No último aviso: ${ult}`);
  return (
    <>
      {n}
      {ult > 0 && (
        <span className="gd-ult" title={dica}>
          <span className="gd-sr">{dica}</span><span aria-hidden>{ult}</span>
        </span>
      )}
    </>
  );
}

function TabelaPendencias({ linhas, filtro, aoFiltrar }: {
  linhas: LinhaPend[]; filtro: string | null; aoFiltrar: (chave: string) => void;
}) {
  return (
    <div className="gd-tab-rolo">
      <table className="gd-tab pend">
        <thead>
          <tr>
            <th scope="col">{TXT.atendente()}</th>
            <th scope="col" className="num">{colFila('negociacao', 'Em negociação')}</th>
            <th scope="col" className="num">{colFila('fechados', 'Fechados')}</th>
            <th scope="col" className="num">{colFila('ligar', 'Ligar')}</th>
            <th scope="col" className="num">{colFila('decisoes', 'Decisões')}</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((p) => {
            const ativo = filtro === p.chave;
            return (
              <tr key={p.chave} className={'clk' + (ativo ? ' sel' : '')} onClick={() => aoFiltrar(p.chave)}>
                <td>
                  <button type="button" className="gd-cli" aria-pressed={ativo}
                    onClick={(e) => { e.stopPropagation(); aoFiltrar(p.chave); }}>
                    <span className="gd-av" aria-hidden>{p.chave === SEM_DONO ? '—' : iniciais(p.nome)}</span>
                    <span className={'gd-cli-nome' + (p.chave === SEM_DONO ? ' gd-rub' : '')}>{p.nome}</span>
                  </button>
                </td>
                <td className="num"><CelulaPend n={p.neg} ult={p.negU} /></td>
                <td className="num"><CelulaPend n={p.fec} ult={p.fecU} /></td>
                <td className={'num' + (p.lig ? ' gd-azul' : ' gd-mudo')}>{p.lig}</td>
                <td className="num">{p.dec ? <Contagem n={p.dec} tom="dec" /> : <span className="gd-mudo">0</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Quem o banco sugeriria (vacuo_melhor_fechador): entre quem fechou algo, maior taxa REAL com o mínimo de
    recebidos; sem ninguém no mínimo, quem mais fechou. */
function liderDoRanking(ranking: VacuoRankItem[], minRecebidos: number): string | null {
  const taxa = (p: VacuoRankItem) => (p.recebidos >= minRecebidos && p.recebidos > 0 ? p.fechados / p.recebidos : 0);
  const cand = ranking.filter((p) => p.fechados > 0)
    .sort((a, b) => taxa(b) - taxa(a) || b.fechados - a.fechados || b.recebidos - a.recebidos || a.usuarioId.localeCompare(b.usuarioId));
  return cand[0]?.usuarioId ?? null;
}

function TabelaRanking({ ranking, minRecebidos }: { ranking: VacuoRankItem[]; minRecebidos: number }) {
  // ordem pela taxa real (sem arredondar), para os quase-empates seguirem a conta do banco
  const real = (p: VacuoRankItem) => (p.recebidos > 0 ? p.fechados / p.recebidos : 0);
  const ord = [...ranking].sort((a, b) => real(b) - real(a) || b.fechados - a.fechados);
  const lider = liderDoRanking(ranking, minRecebidos);
  const topo = Math.max(0.1, ...ord.map((p) => p.taxa));
  const marca = marcaSugestao();
  return (
    <div className="gd-tab-rolo">
      <table className="gd-tab rank">
        <thead>
          <tr>
            <th scope="col">{TXT.atendente()}</th>
            <th scope="col" className="num">{colFila('fechados', 'Fechados')}</th>
            <th scope="col" className="num">{TXT.recebidos()}</th>
            <th scope="col" className="num">{TXT.conversao()}</th>
            <th scope="col" className="num">{TXT.repassados()}</th>
          </tr>
        </thead>
        <tbody>
          {ord.map((p) => (
            <tr key={p.usuarioId} className={p.usuarioId === lider ? 'lider' : undefined}>
              <td>
                <span className="gd-cli">
                  <span className="gd-av" aria-hidden>{iniciais(p.nome)}</span>
                  <span className="gd-cli-nome">{p.nome}</span>
                  {p.usuarioId === lider && (
                    <span className="gd-lider" title={marca}><IcDestaque tamanho={12} /><span className="gd-sr">{marca}</span></span>
                  )}
                </span>
              </td>
              <td className="num">{p.fechados}</td>
              <td className="num">{p.recebidos}</td>
              <td className="num">
                <span className="gd-conv">
                  <span className="tr" aria-hidden><i style={{ width: `${Math.round((p.taxa / topo) * 100)}%` }} /></span>
                  <b>{p.taxa.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%</b>
                </span>
              </td>
              <td className={'num' + (p.punicoes ? '' : ' gd-mudo')}>{p.punicoes}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Desfecho({ r }: { r: VacuoRepasse }) {
  if (r.decisao === 'mantido') {
    return <span className="gd-pill">{rtTit('extra.painel.desfecho_mantido', { atendente: r.deNome }, `Mantido com ${r.deNome}`)}</span>;
  }
  if (r.desfecho === 'fechado') {
    return (
      <span className="gd-pill fechou" title={r.fechadoEm ? fmtDesdeCurto(r.fechadoEm) : undefined}>
        <IcFechado tamanho={11} />{rtTit('extra.painel.desfecho_fechou', { para: r.paraNome }, `${r.paraNome} fechou`)}
      </span>
    );
  }
  if (r.desfecho === 'perdido') return <span className="gd-pill perdido">{rtTit('extra.painel.desfecho_perdido', {}, 'Perdido')}</span>;
  if (r.desfecho === 'andamento') return <span className="gd-pill">{rtTit('extra.painel.desfecho_andamento', {}, 'Em andamento')}</span>;
  return <span className="gd-mudo">—</span>;
}

function TabelaHistorico({ itens, agora, diaUtil, aoAbrir }: {
  itens: VacuoRepasse[]; agora: number; diaUtil: number; aoAbrir: (id: string) => void;
}) {
  const [tudo, setTudo] = useState(false);
  const lista = tudo ? itens : itens.slice(0, POR_TABELA);
  const hoje = new Date(agora);
  return (
    <>
      <div className="gd-tab-rolo">
        <table className="gd-tab hist">
          <thead>
            <tr>
              <th scope="col">{TXT.quando()}</th>
              <th scope="col">{TXT.cliente()}</th>
              <th scope="col">{TXT.atendente()}</th>
              <th scope="col" className="num">{colSemResposta()}</th>
              <th scope="col">{TXT.desfecho()}</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((r) => {
              const docs = /document/i.test(r.prioMotivo ?? '');
              const prio = r.prioritario
                ? <span className="gd-prio-mini" title={rtTit(docs ? 'selo.prioridade.docs' : 'selo.prioridade.interesse', {}, docs ? 'Documentação' : 'Interesse')}>
                    {docs ? <IcDocumento tamanho={11} /> : <IcInteresse tamanho={11} />}
                  </span>
                : null;
              return (
                <tr key={r.id} className="clk" onClick={() => aoAbrir(r.conversaId)}>
                  <td className="num gd-mudo">{fmtDesdeCurto(r.criadoEm, hoje)}</td>
                  <td><BotaoCliente nome={r.contatoNome ?? '—'} aoAbrir={() => aoAbrir(r.conversaId)} extra={prio} /></td>
                  <td>
                    {r.decisao === 'repassado' ? (
                      <span className="gd-fluxo"><span>{r.deNome}</span><IcSeta tamanho={12} /><b>{r.paraNome}</b></span>
                    ) : <span>{r.deNome}</span>}
                  </td>
                  <td className="num gd-mudo">{fmtTempoLinha(r.minutos, diaUtil) || '—'}</td>
                  <td><Desfecho r={r} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!tudo && itens.length > POR_TABELA && <BotaoMais rotulo={mostrarTodos(itens.length)} onClick={() => setTudo(true)} />}
    </>
  );
}

/* ---------------------------------------------------------------------------
   Página
   --------------------------------------------------------------------------- */
interface GrupoDec { chave: string; donoId: string | null; nome: string; itens: VacuoDecisao[] }
interface LoteRodando { grupo: string; total: number; feitos: number; andando: string | null; fila: string[] }

export default function GuardiaoV2() {
  const nav = useNavigate();
  const location = useLocation();
  const avisosQ = useRadarAvisos(); // mesmo cache de useRadarEquipe: aqui só para erro e "tentar de novo"
  const equipe = useRadarEquipe();
  const decisoesQ = useVacuoDecisoes();
  const repassesQ = useVacuoRepasses();
  const rankingQ = useVacuoRanking();
  const qc = useQueryClient();
  const configQ = useVacuoConfig();
  const usuariosQ = useOrgUsuarios();
  const decidirLote = useDecidirRepasse();

  const cfg = configQ.data ?? null;
  const diaUtil = ((cfg?.horaFim ?? 18) - (cfg?.horaInicio ?? 9)) * 60;
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const abrir = useCallback((conversaId: string) => nav('/whatsapp?conversa=' + encodeURIComponent(conversaId)), [nav]);

  /* decisões tomadas aqui somem na hora; o refetch confirma (e a marca sai quando o banco confirmar) */
  const [resolvidos, setResolvidos] = useState<ReadonlySet<string>>(() => new Set());
  const brutas = decisoesQ.data;
  useEffect(() => {
    if (!resolvidos.size) return;
    const pendentes = new Set((brutas ?? []).map((d) => d.conversaId));
    const resta = [...resolvidos].filter((id) => pendentes.has(id));
    if (resta.length !== resolvidos.size) setResolvidos(new Set(resta));
  }, [brutas, resolvidos]);
  // cliente fechado nunca entra em repasse: se ele já está na fila de fechados, a decisão não é oferecida
  // (o motor cancela a decisão pendente; isto cobre o minuto até a próxima rodada)
  const fechadosIds = useMemo(() => new Set(equipe.fechado.map((i) => i.conversaId)), [equipe.fechado]);
  const decisoes = useMemo(
    () => (brutas ?? []).filter((d) => !resolvidos.has(d.conversaId) && !fechadosIds.has(d.conversaId)),
    [brutas, resolvidos, fechadosIds],
  );
  const marcarResolvido = useCallback((id: string) => setResolvidos((s) => new Set(s).add(id)), []);

  /* filtro por atendente: vale para decisões, negociação, fechados e ligar */
  const [filtro, setFiltro] = useState<string | null>(null);
  const passa = useCallback((donoId: string | null) => !filtro || chaveDono(donoId) === filtro, [filtro]);

  /* destinos possíveis: qualquer atendente ativo da organização */
  const ranking = rankingQ.data;
  const candidatos = useMemo<OpcaoDestino[]>(() => {
    const m = new Map<string, OpcaoDestino>();
    if (VACUO_REAL) {
      for (const u of usuariosQ.data ?? []) m.set(u.id, { id: u.id, nome: u.nome });
    } else {
      // demo (sem backend): o seed não tem usuários; os atendentes do ranking e das sugestões fazem o papel
      for (const r of ranking ?? []) m.set(r.usuarioId, { id: r.usuarioId, nome: r.nome });
      for (const d of brutas ?? []) if (d.sugeridoId && d.sugeridoNome && !m.has(d.sugeridoId)) m.set(d.sugeridoId, { id: d.sugeridoId, nome: d.sugeridoNome });
    }
    return [...m.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }, [usuariosQ.data, ranking, brutas]);
  const nomePorId = useMemo(() => new Map(candidatos.map((u) => [u.id, u.nome] as const)), [candidatos]);

  /** Opções do seletor para um cliente: todos menos o dono atual, com a sugestão primeiro. */
  const opcoesPara = useCallback((donoId: string | null, sugeridoId: string | null) => {
    const lista = candidatos.filter((u) => u.id !== donoId);
    const sug = sugeridoId ? lista.find((u) => u.id === sugeridoId) : undefined;
    return { opcoes: sug ? [sug, ...lista.filter((u) => u !== sug)] : lista, sugestaoId: sug?.id ?? null };
  }, [candidatos]);

  /* tempo e prioridade AO VIVO da decisão (radar_avisos), quando o aviso é do mesmo dono */
  const negPorConversa = useMemo(() => new Map(equipe.negociacao.map((i) => [i.conversaId, i] as const)), [equipe.negociacao]);
  const vivoDe = useCallback((d: VacuoDecisao) => {
    const v = negPorConversa.get(d.conversaId);
    return v && v.donoId === d.donoId ? v : undefined;
  }, [negPorConversa]);

  /* 3. decisões agrupadas por atendente: quem acumula mais primeiro */
  const grupos = useMemo<GrupoDec[]>(() => {
    const m = new Map<string, GrupoDec>();
    for (const d of decisoes) {
      if (!passa(d.donoId)) continue;
      const k = chaveDono(d.donoId);
      let g = m.get(k);
      if (!g) { g = { chave: k, donoId: d.donoId, nome: d.donoNome, itens: [] }; m.set(k, g); }
      g.itens.push(d);
    }
    const antigo = (g: GrupoDec) => g.itens.reduce((min, d) => (d.desde < min ? d.desde : min), g.itens[0]?.desde ?? '');
    return [...m.values()]
      .map((g) => ({ ...g, itens: ordenarDecisoes(g.itens) }))
      .sort((a, b) => b.itens.length - a.itens.length || antigo(a).localeCompare(antigo(b)) || a.nome.localeCompare(b.nome, 'pt-BR'));
  }, [decisoes, passa]);
  const comCartao = useMemo(() => new Set(decisoes.map((d) => d.conversaId)), [decisoes]);

  /* 4. pendências por atendente: mais atrasado (decisões + últimos avisos) primeiro */
  const pendencias = useMemo<LinhaPend[]>(() => {
    const m = new Map<string, LinhaPend>();
    const pega = (id: string | null, nome: string | null) => {
      const k = chaveDono(id);
      let l = m.get(k);
      if (!l) {
        const n = k === SEM_DONO ? semResponsavel() : (nome || nomePorId.get(k) || '—');
        l = { chave: k, nome: n, neg: 0, negU: 0, fec: 0, fecU: 0, lig: 0, dec: 0 };
        m.set(k, l);
      }
      return l;
    };
    for (const i of equipe.negociacao) { const l = pega(i.donoId, i.donoNome); l.neg++; if (i.estagio === 3) l.negU++; }
    for (const i of equipe.fechado) { const l = pega(i.donoId, i.donoNome); l.fec++; if (i.estagio === 3) l.fecU++; }
    for (const i of equipe.ligar) pega(i.donoId, i.donoNome).lig++;
    for (const d of decisoes) pega(d.donoId, d.donoNome).dec++;
    return [...m.values()].sort((a, b) =>
      (b.dec + b.negU + b.fecU) - (a.dec + a.negU + a.fecU)
      || (b.neg + b.fec + b.lig) - (a.neg + a.fec + a.lig)
      || a.nome.localeCompare(b.nome, 'pt-BR'));
  }, [equipe.negociacao, equipe.fechado, equipe.ligar, decisoes, nomePorId]);

  /* 5–7. filas ao vivo (filtradas) */
  const negociacao = useMemo(() => equipe.negociacao.filter((i) => passa(i.donoId)).sort(ordNegociacao), [equipe.negociacao, passa]);
  const fechados = useMemo(() => equipe.fechado.filter((i) => passa(i.donoId)).sort(ordFechado), [equipe.fechado, passa]);
  const ligar = useMemo(() => equipe.ligar.filter((i) => passa(i.donoId)), [equipe.ligar, passa]);

  /* 9. histórico: últimos 30 dias (repasse antigo desfeito não é decisão) */
  const historico = useMemo(() => {
    const corte = agora - 30 * 86400e3;
    const itens = (repassesQ.data ?? []).filter((r) => !r.desfeito && new Date(r.criadoEm).getTime() >= corte);
    const efetivos = itens.filter(repasseEfetivo);
    return {
      itens,
      repasses: efetivos.length,
      mantidos: itens.filter((r) => r.decisao === 'mantido').length,
      fechados: efetivos.filter((r) => r.desfecho === 'fechado').length,
    };
  }, [repassesQ.data, agora]);

  /* ---- destaque: /radar?decidir=<conversa> e "Pedida" rolam até o cartão e o destacam por 2 s ---- */
  const [destaque, setDestaque] = useState<{ id: string; n: number } | null>(null);
  const [expandidos, setExpandidos] = useState<ReadonlySet<string>>(() => new Set());
  const irParaDecisao = useCallback((conversaId: string) => {
    const d = decisoes.find((x) => x.conversaId === conversaId);
    if (!d) { irParaSecao('radar-decisoes'); return; }
    const k = chaveDono(d.donoId);
    setFiltro((f) => (f && f !== k ? null : f));
    const pos = ordenarDecisoes(decisoes.filter((x) => chaveDono(x.donoId) === k)).findIndex((x) => x.conversaId === conversaId);
    if (pos >= POR_GRUPO) setExpandidos((s) => (s.has(k) ? s : new Set(s).add(k)));
    setDestaque((x) => ({ id: conversaId, n: (x?.n ?? 0) + 1 }));
  }, [decisoes]);
  useEffect(() => {
    if (!destaque) return;
    const t = setTimeout(() => setDestaque(null), DESTAQUE_MS);
    return () => clearTimeout(t);
  }, [destaque]);
  const alvoUrl = new URLSearchParams(location.search).get('decidir');
  const decisoesProntas = decisoesQ.isFetched || decisoesQ.isError;
  const tratado = useRef<string | null>(null);
  useEffect(() => {
    if (!alvoUrl || !decisoesProntas) return;
    const marca = location.key + '|' + alvoUrl;
    if (tratado.current === marca) return; // uma vez por navegação (o refetch não repete o destaque)
    tratado.current = marca;
    irParaDecisao(alvoUrl);
  }, [alvoUrl, location.key, decisoesProntas, irParaDecisao]);

  /* ---- lote: só dentro do grupo de um atendente; executa um por um ---- */
  const [selecao, setSelecao] = useState<{ grupo: string; ids: string[] } | null>(null);
  const [lote, setLote] = useState<LoteRodando | null>(null);
  const [errosLote, setErrosLote] = useState<Record<string, string>>({});
  const [confirmando, setConfirmando] = useState<{ grupo: string; destinoId: string } | null>(null);
  useEffect(() => {
    // a seleção acompanha a lista: quem foi decidido sai dela
    setSelecao((s) => {
      if (!s) return s;
      const ids = s.ids.filter((id) => comCartao.has(id));
      if (ids.length === s.ids.length) return s;
      return ids.length ? { ...s, ids } : null;
    });
  }, [comCartao]);
  useEffect(() => {
    if (confirmando && (!selecao || selecao.grupo !== confirmando.grupo)) setConfirmando(null);
  }, [confirmando, selecao]);

  const limparErro = useCallback((id: string) => setErrosLote((m) => {
    if (!(id in m)) return m;
    const n = { ...m };
    delete n[id];
    return n;
  }), []);
  const alternar = (grupo: string, id: string) => {
    if (lote) return;
    limparErro(id);
    setSelecao((s) => {
      if (!s || s.grupo !== grupo) return { grupo, ids: [id] };
      const ids = s.ids.includes(id) ? s.ids.filter((x) => x !== id) : [...s.ids, id];
      return ids.length ? { grupo, ids } : null;
    });
  };
  const alternarTodos = (grupo: string, visiveis: string[]) => {
    if (lote) return;
    setSelecao((s) => {
      const todos = !!s && s.grupo === grupo && visiveis.every((id) => s.ids.includes(id));
      return todos ? null : { grupo, ids: [...visiveis] };
    });
  };
  const idsDoLote = (g: GrupoDec) => (selecao && selecao.grupo === g.chave
    ? g.itens.filter((d) => selecao.ids.includes(d.conversaId)).map((d) => d.conversaId)
    : []);
  const executarLote = async (grupo: string, ids: string[], destinoId: string | null) => {
    if (lote || !ids.length) return;
    setConfirmando(null);
    setErrosLote({});
    setLote({ grupo, total: ids.length, feitos: 0, andando: null, fila: ids });
    for (const id of ids) {
      setLote((l) => l && { ...l, andando: id, fila: l.fila.filter((x) => x !== id) });
      try {
        // cada cliente vira uma decisão do gestor no histórico (vacuo_decidir), na ordem da tela;
        // sem recarregar a cada um — a leitura pesada das decisões roda UMA vez, no fim
        await decidirLote.mutateAsync({ conversaId: id, destinoId, semRecarga: true });
        marcarResolvido(id);
      } catch (e) {
        setErrosLote((m) => ({ ...m, [id]: erroMsg(e) }));
      }
      setLote((l) => l && { ...l, feitos: l.feitos + 1, andando: null });
    }
    setLote(null);
    if (VACUO_REAL) recarregarRadar(qc);
    // o botão que disparou o lote ficou desativado ou saiu da tela: o foco não se perde
    if (!document.activeElement || document.activeElement === document.body) focarDecisoes();
  };

  /* ---- números dos heróis (sempre a equipe toda) ---- */
  const ultimos = (l: RadarItem[]) => l.reduce((n, i) => n + (i.estagio === 3 ? 1 : 0), 0);
  const semDono = equipe.ligar.filter((i) => !i.donoId).length;
  const maisAntiga = decisoes.reduce<VacuoDecisao | null>((m, d) => (!m || d.desde < m.desde ? d : m), null);
  const tempoMaisAntiga = maisAntiga ? fmtTempo(vivoDe(maisAntiga)?.minutosUteis ?? maisAntiga.minutos, diaUtil) : '';
  const erroAvisos = avisosQ.isError;
  const tentarAvisos = () => void avisosQ.refetch();
  const hero = (k: string, p: Record<string, string | number> = {}) => rt('painel.hero.' + k, p);
  const sec = (k: string) => rt('painel.secao.' + k);
  const nomeFiltro = filtro ? (pendencias.find((p) => p.chave === filtro)?.nome
    ?? (filtro === SEM_DONO ? semResponsavel() : nomePorId.get(filtro) ?? '—')) : '';

  const renderGrupo = (g: GrupoDec) => {
    const aberto = expandidos.has(g.chave);
    const visiveis = aberto ? g.itens : g.itens.slice(0, POR_GRUPO);
    const idsVisiveis = visiveis.map((d) => d.conversaId);
    const sel = selecao && selecao.grupo === g.chave ? selecao.ids : [];
    // caixa em todo cartão (o lote é sempre do grupo); "marcar todos" só quando há mais de um
    const marcarTodos = g.itens.length >= 2;
    const rodandoAqui = lote?.grupo === g.chave;
    const todos = marcarTodos && idsVisiveis.every((id) => sel.includes(id));
    const titulo = rtTit('extra.painel.grupo_atendente', { atendente: g.nome }, `Com ${g.nome}`);
    const resto = g.itens.length - POR_GRUPO;
    // um grupo = um dono: a sugestão (maior conversão) é a mesma para todos os clientes dele
    const destinosGrupo = opcoesPara(g.donoId, g.itens.find((d) => d.sugeridoId)?.sugeridoId ?? null);
    return (
      <section key={g.chave} className="gd-grupo" aria-label={titulo}>
        <div className="gd-grupo-cab">
          {marcarTodos && <Checkbox marcado={todos} aoAlternar={() => alternarTodos(g.chave, idsVisiveis)} rotulo={titulo} />}
          <span className="gd-grupo-tit">{titulo}</span>
          <Contagem n={g.itens.length} tom="dec" />
        </div>
        {(sel.length > 0 || rodandoAqui) && (
          <BarraLote n={sel.length} rodando={rodandoAqui} total={lote?.total ?? 0} feitos={lote?.feitos ?? 0}
            opcoes={destinosGrupo.opcoes} sugestaoId={destinosGrupo.sugestaoId}
            aoManter={() => void executarLote(g.chave, idsDoLote(g), null)}
            aoRepassar={(destinoId) => setConfirmando({ grupo: g.chave, destinoId })} />
        )}
        {visiveis.map((d) => {
          const { opcoes, sugestaoId } = opcoesPara(d.donoId, d.sugeridoId);
          const noLote: EstadoNoLote = !lote ? undefined : lote.andando === d.conversaId ? 'andando'
            : lote.fila.includes(d.conversaId) ? 'fila' : undefined;
          return (
            <CartaoDecisao key={d.conversaId} d={d} vivo={vivoDe(d)} opcoes={opcoes} sugestaoId={sugestaoId}
              agora={agora} diaUtil={diaUtil}
              destaqueN={destaque?.id === d.conversaId ? destaque.n : 0} realce={destaque?.id === d.conversaId}
              selecionavel selecionado={sel.includes(d.conversaId)}
              aoSelecionar={() => alternar(g.chave, d.conversaId)}
              noLote={noLote} erroLote={errosLote[d.conversaId]} travado={!!lote}
              aoAbrir={() => abrir(d.conversaId)}
              aoResolvido={() => marcarResolvido(d.conversaId)}
              aoLimparErro={() => limparErro(d.conversaId)} />
          );
        })}
        {!aberto && resto > 0 && (
          <BotaoMais rotulo={rtTxt('extra.central.mostrar_mais', { n: resto }, `Mostrar mais ${resto}`)}
            onClick={() => setExpandidos((s) => new Set(s).add(g.chave))} />
        )}
      </section>
    );
  };

  const grupoConfirmando = confirmando ? grupos.find((g) => g.chave === confirmando.grupo) : undefined;
  const idsConfirmando = grupoConfirmando ? idsDoLote(grupoConfirmando) : [];
  const paraConfirmando = confirmando ? candidatos.find((u) => u.id === confirmando.destinoId)?.nome ?? '' : '';
  const regras = textoRegras(cfg, diaUtil);

  return (
    <div className={'gd-pg' + (filtro ? ' com-filtro' : '')}>
      {/* 1. HERÓIS: clicáveis, rolam até a seção */}
      <div className="gd-heros">
        <Hero familia="dec" Icone={IcDecisao} alvo="radar-decisoes" atraso={0.02}
          titulo={hero('decisoes').titulo || 'Aguardando sua decisão'} n={decisoes.length} tom="dec"
          sub={tempoMaisAntiga ? (hero('decisoes', { tempo: tempoMaisAntiga }).texto || `Mais antiga há ${tempoMaisAntiga}`) : ''}
          carregando={decisoesQ.isLoading} erro={decisoesQ.isError} />
        <Hero familia="neg" Icone={IcNegociacao} alvo="radar-negociacao" atraso={0.05}
          titulo={hero('negociacao').titulo || 'Em negociação sem resposta'} n={equipe.negociacao.length}
          tom={tomDaFila(equipe.negociacao)}
          sub={hero('negociacao', { n: ultimos(equipe.negociacao) }).texto || `No último aviso: ${ultimos(equipe.negociacao)}`}
          carregando={equipe.carregando} erro={erroAvisos} />
        <Hero familia="fec" Icone={IcFechado} alvo="radar-fechados" atraso={0.08}
          titulo={hero('fechados').titulo || 'Fechados sem resposta'} n={equipe.fechado.length}
          tom={tomDaFila(equipe.fechado)}
          sub={hero('fechados', { n: ultimos(equipe.fechado) }).texto || `No último aviso: ${ultimos(equipe.fechado)}`}
          carregando={equipe.carregando} erro={erroAvisos} />
        <Hero familia="lig" Icone={IcLigar} alvo="radar-ligar" atraso={0.11}
          titulo={hero('ligar').titulo || 'Leads para ligar'} n={equipe.ligar.length} tom="azul"
          sub={hero('ligar', { n: semDono }).texto || `Sem responsável: ${semDono}`}
          carregando={equipe.carregando} erro={erroAvisos} />
      </div>

      {/* 2. FAIXA DE REGRAS (vacuo_config) */}
      {configQ.isLoading
        ? <Skeleton altura={32} raio={10} />
        : <p className="gd-regras num">{regras.split(' · ').map((parte, i) => <span key={i}>{parte}</span>)}</p>}

      {filtro && (
        <div className="gd-filtro">
          <Chip ativo removivel onClick={() => setFiltro(null)}>
            {rtTit('extra.painel.filtro', { atendente: nomeFiltro }, `Filtrando: ${nomeFiltro}`)}
          </Chip>
        </div>
      )}

      <div className="gd-grid">
        {/* 3. AGUARDANDO SUA DECISÃO */}
        <Secao id="radar-decisoes" familia="dec" Icone={IcDecisao} atraso={0.14}
          titulo={sec('decisoes').titulo || 'Aguardando sua decisão'} texto={sec('decisoes').texto}
          contagem={<Contagem n={grupos.reduce((n, g) => n + g.itens.length, 0)} tom="dec" />}>
          {decisoesQ.isError ? <ErroCarga erro={decisoesQ.error} aoTentar={() => void decisoesQ.refetch()} />
            : decisoesQ.isLoading ? <Skeleton altura={96} />
              : grupos.length === 0 ? <Vazio texto={rtTxt('extra.painel.vazio_decisoes', {}, 'Nenhuma decisão pendente.')} />
                : <div className="gd-grupos">{grupos.map(renderGrupo)}</div>}
        </Secao>

        {/* 4. PENDÊNCIAS POR ATENDENTE (clicar no nome filtra 3, 5, 6 e 7) */}
        <Secao id="radar-equipe" atraso={0.16}
          titulo={rtTit('extra.painel.secao_equipe', {}, 'Pendências por atendente')}
          texto={rtTxt('extra.painel.secao_equipe', {}, 'Quem tem clientes aguardando agora. Clique em um nome para filtrar as listas abaixo.')}>
          {erroAvisos ? <ErroCarga erro={avisosQ.error} aoTentar={tentarAvisos} />
            : equipe.carregando ? <Skeleton altura={80} />
              : pendencias.length === 0 ? <Vazio texto={rtTxt('extra.painel.hero_zero', {}, 'Em dia')} />
                : <TabelaPendencias linhas={pendencias} filtro={filtro} aoFiltrar={(k) => setFiltro((f) => (f === k ? null : k))} />}
        </Secao>

        {/* 5. EM NEGOCIAÇÃO SEM RESPOSTA */}
        <Secao id="radar-negociacao" familia="neg" Icone={IcNegociacao} atraso={0.18}
          titulo={sec('negociacao').titulo || 'Em negociação sem resposta'} texto={sec('negociacao').texto}
          contagem={<Contagem n={negociacao.length} tom={tomDaFila(negociacao)} />}>
          {erroAvisos ? <ErroCarga erro={avisosQ.error} aoTentar={tentarAvisos} />
            : equipe.carregando ? <Skeleton altura={120} />
              : negociacao.length === 0 ? <Vazio texto={rtTxt('extra.painel.vazio_negociacao', {}, 'Nenhum cliente em negociação sem resposta agora.')} />
                : <TabelaAvisos itens={negociacao} familia="negociacao" agora={agora} diaUtil={diaUtil}
                    comCartao={comCartao} aoAbrir={abrir} aoIrDecisao={irParaDecisao} />}
        </Secao>

        {/* 6. FECHADOS SEM RESPOSTA (fio verde; sem prioridade, sem decisão, sem repasse) */}
        <Secao id="radar-fechados" familia="fec" Icone={IcFechado} atraso={0.2}
          titulo={sec('fechados').titulo || 'Fechados sem resposta'} texto={sec('fechados').texto}
          contagem={<Contagem n={fechados.length} tom={tomDaFila(fechados)} />}>
          {erroAvisos ? <ErroCarga erro={avisosQ.error} aoTentar={tentarAvisos} />
            : equipe.carregando ? <Skeleton altura={120} />
              : fechados.length === 0 ? <Vazio texto={rtTxt('extra.painel.vazio_fechados', {}, 'Nenhum cliente fechado sem resposta agora.')} />
                : <TabelaAvisos itens={fechados} familia="fechado" agora={agora} diaUtil={diaUtil}
                    comCartao={comCartao} aoAbrir={abrir} aoIrDecisao={irParaDecisao} />}
        </Secao>

        {/* 7. LEADS PARA LIGAR */}
        <Secao id="radar-ligar" familia="lig" Icone={IcLigar} atraso={0.22}
          titulo={sec('ligar').titulo || 'Leads para ligar'} texto={sec('ligar').texto}
          contagem={<Contagem n={ligar.length} tom="azul" />}>
          {erroAvisos ? <ErroCarga erro={avisosQ.error} aoTentar={tentarAvisos} />
            : equipe.carregando ? <Skeleton altura={90} />
              : ligar.length === 0 ? <Vazio texto={rtTxt('extra.painel.vazio_ligar', {}, 'Nenhum lead novo parado no atendimento automático.')} />
                : <TabelaLigar itens={ligar} diaUtil={diaUtil} aoAbrir={abrir} />}
        </Secao>

        {/* 8. CONVERSÃO POR ATENDENTE (base da sugestão) */}
        <Secao id="radar-conversao" atraso={0.24}
          titulo={rtTit('extra.painel.secao_ranking', {}, 'Conversão por atendente')}
          texto={rtTxt('extra.painel.secao_ranking', {}, 'Fechados sobre recebidos nos últimos 30 dias. É a base da sugestão de repasse.')}>
          {rankingQ.isError ? <ErroCarga erro={rankingQ.error} aoTentar={() => void rankingQ.refetch()} />
            : rankingQ.isLoading ? <Skeleton altura={120} />
              : !ranking?.length ? <Vazio texto={TXT.vazioRanking()} />
                : <TabelaRanking ranking={ranking} minRecebidos={cfg?.minRecebidos ?? 30} />}
        </Secao>

        {/* 9. HISTÓRICO DE DECISÕES (30 dias) */}
        <Secao id="radar-historico" atraso={0.26}
          titulo={rtTit('extra.painel.secao_historico', {}, 'Histórico de decisões')}
          texto={rtTxt('extra.painel.secao_historico', {}, 'Cada decisão do gestor e o desfecho do cliente, nos últimos 30 dias.')}
          cabExtra={repassesQ.isSuccess && (
            <div className="gd-hist-stats num">
              <span>{rtTit('extra.painel.hist_repasses', { n: historico.repasses }, `Repasses: ${historico.repasses}`)}</span>
              <span>{rtTit('extra.painel.hist_mantidos', { n: historico.mantidos }, `Mantidos: ${historico.mantidos}`)}</span>
              <span>{rtTit('extra.painel.hist_fechados', { n: historico.fechados }, `Fechados após repasse: ${historico.fechados}`)}</span>
            </div>
          )}>
          {repassesQ.isError ? <ErroCarga erro={repassesQ.error} aoTentar={() => void repassesQ.refetch()} />
            : repassesQ.isLoading ? <Skeleton altura={140} />
              : historico.itens.length === 0 ? <Vazio texto={TXT.vazioHistorico()} />
                : <TabelaHistorico itens={historico.itens} agora={agora} diaUtil={diaUtil} aoAbrir={abrir} />}
        </Secao>
      </div>

      {confirmando && grupoConfirmando && idsConfirmando.length > 0 && paraConfirmando && (() => {
        const porId = new Map(grupoConfirmando.itens.map((d) => [d.conversaId, d.contatoNome] as const));
        return (
          <ConfirmaLote nomes={idsConfirmando.map((id) => porId.get(id) ?? '—')} para={paraConfirmando}
            aoCancelar={() => setConfirmando(null)}
            aoConfirmar={() => void executarLote(grupoConfirmando.chave, idsConfirmando, confirmando.destinoId)} />
        );
      })()}
    </div>
  );
}
