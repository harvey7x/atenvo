/* Radar de Atendimento — INBOX (card da lista e cabeçalho da conversa aberta).
   - UM selo do Radar por card, logo após o selo de situação. Precedência:
     Gestor pediu (âmbar) > Último aviso (rubro cheio) > 2º aviso (contorno rubro) > 1º aviso (âmbar).
     Cor = urgência; ícone = família (balão = em negociação; selo com visto = cliente fechado, verde).
     A prioridade é um ícone pequeno DENTRO do selo (documento ou alvo), nunca um selo extra.
     "Ligar" é outra situação e tem selo próprio, azul.
   - Dica (title) = alerta.{família}.{estágio} com o tempo útil + a linha de prioridade;
     aria-label = selo.{família}.{estágio}.texto (diz família e estágio).
   - Em sequência: quando sai a resposta da equipe que encerra o aviso da conversa aberta, o
     cabeçalho mostra por 10 s "Próximo aguardando: {cliente}" da MESMA família, na ordem da Central.
   Os selos são PESSOAIS: as filas vêm de useRadarMeus (só o dono do cliente vê, inclusive o admin).
   Sem emoji: ícone de traço + texto do caderno. Nada aqui envia mensagem ao cliente. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { RadarDaConversa, RadarFilas, RadarItem } from '@/data/vacuo';
import type { WaMessage } from '@/data/whatsappDemo';
import type { Notificacao } from '@/data/remarketing';
import { rt, rtTit, rtTxt, fmtTempo, fmtTempoLinha } from '../lib/radarTextos';
import { IcNegociacao, IcFechado, IcLigar, IcGestor, IcDocumento, IcInteresse, IcSeta } from './RadarIcones';

type Familia = 'negociacao' | 'fechado';

/** Notificações do Radar que a resposta da equipe ao cliente encerra (o Ligar não: ele se encerra pela ligação). */
const TIPOS_SINO_RESPOSTA = new Set(['vacuo_aviso', 'vacuo_fechado', 'vacuo_cutucada']);

/** Dia útil padrão do Radar (9h–18h = 540 min) quando a config ainda não chegou. */
const DIA_UTIL = 540;

const juntar = (partes: Array<string | undefined | null>, sep = '\n') => partes.filter(Boolean).join(sep);
/** "Documentação enviada" → "documentação enviada" (vai no meio da frase, como no caderno). */
const minuscula = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

function linhaPrioridade(a: RadarItem | undefined): string {
  if (!a?.prioridade) return '';
  const prioridade = minuscula(a.prioridade);
  return rtTxt('extra.alerta.linha_prioridade', { prioridade }, `Lead prioritário: ${prioridade}. Os avisos chegam mais cedo.`);
}

interface SeloRadar {
  /** modificadores de cor e família: e1 | e2 | e3 | pedido  +  f-negociacao | f-fechado */
  cls: string;
  rotulo: string;
  dica: string;
  aria: string;
  familia: Familia | null;
  prioridade: string | null;
  minutos: number | null;
}

/** O selo único do Radar da conversa (pedido do gestor vence o degrau); null = sem selo. */
function seloDoRadar(r: RadarDaConversa | undefined, diaUtil: number): SeloRadar | null {
  if (!r) return null;
  const a = r.aviso && (r.aviso.categoria === 'negociacao' || r.aviso.categoria === 'fechado') && r.aviso.estagio > 0
    ? r.aviso : undefined;
  const p = r.pedido;
  if (!a && !p) return null;
  const familia = a ? (a.categoria as Familia) : null;
  const minutos = a?.minutosUteis ?? p?.minutosUteis ?? null;
  const tempo = fmtTempo(minutos, diaUtil);
  const prio = linhaPrioridade(a);
  const alerta = a ? rt(`alerta.${a.categoria}.${a.estagio}`, { tempo }) : {};
  const seloTexto = a ? rtTxt(`selo.${a.categoria}.${a.estagio}`, { tempo }) : '';
  const base = { familia, prioridade: a?.prioridade ?? null, minutos };
  if (p) {
    const pedido = rt('alerta.cutucada', { gestor: p.cutucadoPorNome || 'O gestor', tempo });
    return {
      ...base,
      cls: 'pedido' + (familia ? ' f-' + familia : ''),
      rotulo: rtTit('selo.cutucada', {}, 'Gestor pediu'),
      dica: juntar([pedido.titulo, pedido.texto, alerta.titulo, prio]),
      aria: juntar([rtTxt('selo.cutucada', {}, 'Pedido do gestor: responder a este cliente agora.'), seloTexto, prio], ' '),
    };
  }
  const e = a!.estagio;
  return {
    ...base,
    cls: 'e' + e + ' f-' + familia,
    rotulo: rtTit(`selo.${familia}.${e}`, {}, e === 3 ? 'Último aviso' : `${e}º aviso`),
    dica: juntar([alerta.titulo, alerta.texto, prio]),
    aria: juntar([seloTexto, prio], ' '),
  };
}

/** Ícone da família (balão = negociação; selo com visto = fechado). Sem família: sino do gestor. */
function IconeFamilia({ familia, tamanho }: { familia: Familia | null; tamanho: number }) {
  return (
    <span className="rdr-selo-fam" aria-hidden>
      {familia === 'fechado' ? <IcFechado tamanho={tamanho} />
        : familia === 'negociacao' ? <IcNegociacao tamanho={tamanho} />
        : <IcGestor tamanho={tamanho} />}
    </span>
  );
}

/** Prioridade (só negociação): ícone pequeno dentro do selo, com a dica do caderno. */
function IconePrio({ prioridade, tamanho }: { prioridade: string | null; tamanho: number }) {
  if (!prioridade) return null;
  const docs = prioridade === 'Documentação enviada';
  const t = rt(docs ? 'selo.prioridade.docs' : 'selo.prioridade.interesse');
  return (
    <span className="rdr-selo-prio" title={t.texto || prioridade}>
      {docs ? <IcDocumento tamanho={tamanho} /> : <IcInteresse tamanho={tamanho} />}
    </span>
  );
}

/** Dica do Ligar (alerta.ligar com o tempo útil) — card e botão "Ligar · Já liguei" do cabeçalho. */
export function radarDicaLigar(item: RadarItem, diaUtil = DIA_UTIL): string {
  const t = rt('alerta.ligar', { tempo: fmtTempo(item.minutosUteis, diaUtil) });
  return juntar([t.titulo, t.texto]);
}

/** Selos do Radar no card da lista: o selo único (pedido ou degrau) e, à parte, o Ligar. */
export function RadarSelosCard({ r, diaUtil = DIA_UTIL }: { r: RadarDaConversa | undefined; diaUtil?: number }) {
  if (!r) return null;
  const s = seloDoRadar(r, diaUtil);
  const tempoLigar = r.ligar ? fmtTempo(r.ligar.minutosUteis, diaUtil) : '';
  return (
    <>
      {s && (
        <span className={'cchip rdr-selo ' + s.cls} role="img" title={s.dica} aria-label={s.aria}>
          <IconeFamilia familia={s.familia} tamanho={9} />
          <span className="rdr-selo-rot">{s.rotulo}</span>
          <IconePrio prioridade={s.prioridade} tamanho={9} />
        </span>
      )}
      {r.ligar && (
        <span className="cchip rdr-selo ligar" role="img" title={radarDicaLigar(r.ligar, diaUtil)}
          aria-label={rtTxt('selo.ligar', { tempo: tempoLigar }, `Ligar para o cliente: parou no atendimento automático há ${tempoLigar}.`)}>
          <span className="rdr-selo-fam" aria-hidden><IcLigar tamanho={9} /></span>
          <span className="rdr-selo-rot">{rtTit('selo.ligar', {}, 'Ligar')}</span>
        </span>
      )}
    </>
  );
}

/** Cabeçalho da conversa aberta: o mesmo selo + quanto tempo o cliente espera
    ("Último aviso · sem resposta há 5 h"), com a mesma dica. O Ligar fica no botão "Ligar · Já liguei". */
export function RadarSeloCabecalho({ r, diaUtil = DIA_UTIL }: { r: RadarDaConversa | undefined; diaUtil?: number }) {
  const s = seloDoRadar(r, diaUtil);
  if (!s) return null;
  const tempo = fmtTempo(s.minutos, diaUtil);
  return (
    <span className={'wa-hchip rdr-hselo ' + s.cls} role="img" title={s.dica} aria-label={s.aria}>
      <IconeFamilia familia={s.familia} tamanho={10} />
      <span className="rdr-selo-rot">{s.rotulo}</span>
      {tempo && <span className="rdr-hselo-t">· {rtTxt('extra.inbox.cabecalho', { tempo }, `sem resposta há ${tempo}`)}</span>}
      <IconePrio prioridade={s.prioridade} tamanho={10} />
    </span>
  );
}

/* ============================================================================
   EM SEQUÊNCIA — a resposta da equipe que encerra o aviso da conversa aberta:
   1) tira o cliente do cache do Radar na hora (selo, linha da Central, número da barra e
      tela cheia leem dele) e segura essa limpeza até o motor (cron de 1 min) encerrar o
      alerta no banco — um refetch no meio não traz o aviso de volta;
   2) mostra por 10 s "Próximo aguardando" (mesma família, ordem da Central).
   O que encerra: resposta da equipe pelo Atenvo ou pelo celular. Nota interna, mensagem de
   sistema, robô/IA e envio que falhou NÃO contam (a mesma régua do motor).
   ============================================================================ */
const PROXIMO_MS = 10_000;          // quanto o "Próximo aguardando" fica no cabeçalho
const RETOMAR_MS = 4_000;           // depois de o ponteiro/foco sair dele
const RESPOSTA_SEGURA_MS = 3 * 60_000; // o motor encerra no banco em até ~1 min; folga para o refetch

function chaveMsg(m: WaMessage): string | null {
  return m.id ?? m.cid ?? null;
}

/** Envio da equipe ao cliente (fora nota interna, sistema e robô/IA). */
function ehEnvioEquipe(m: WaMessage): boolean {
  return m.dir === 'out' && !m.origemBot && m.tipo !== 'nota_interna' && m.tipo !== 'sistema';
}

/** Lê o fim do fio da conversa aberta e devolve a hora (ms) da resposta da equipe mais nova ainda
    não vista (0 = nenhuma), marcando em `visto.chaves` o que já foi considerado. Só conta envio
    feito com a conversa aberta (o histórico que chega depois não é envio novo); no real, só depois
    da confirmação do servidor; envio que falhou fica de fora até um "Reenviar" dar certo. */
export function radarRespostaNova(msgs: readonly WaMessage[], visto: { em: number; chaves: Set<string> }, real: boolean): number {
  let resposta = 0;
  for (const m of msgs.slice(-25)) {
    const k = chaveMsg(m);
    if (!k || visto.chaves.has(k)) continue;
    if (!ehEnvioEquipe(m)) { visto.chaves.add(k); continue; }
    if (m.status === 'falhou') continue;
    if (real && !m.idReal && m.status === 'pendente') continue;
    visto.chaves.add(k);
    const t = m.tsISO ? Date.parse(m.tsISO) : Date.now();
    const ts = Number.isFinite(t) ? t : Date.now();
    if (ts < visto.em - 5_000) continue;
    resposta = Math.max(resposta, ts);
  }
  return resposta;
}

export interface RadarEmSequencia {
  /** próximo cliente da mesma família, na ordem da Central (null = nada a mostrar) */
  proximo: RadarItem | null;
  familia: Familia | null;
  pausar: () => void;
  retomar: () => void;
  fechar: () => void;
}

export function useRadarEmSequencia(p: {
  orgId: string;
  /** conversa aberta ('' = nenhuma) */
  conversaId: string;
  /** mensagens da conversa aberta */
  msgs: readonly WaMessage[];
  /** filas do PRÓPRIO usuário (useRadarMeus) */
  filas: RadarFilas;
  porConversa: Map<string, RadarDaConversa>;
  /** false = demo: o envio não tem confirmação do servidor e o aviso "respondido" vale a sessão toda */
  real: boolean;
}): RadarEmSequencia {
  const qc = useQueryClient();
  // conversa → hora (ms) da última resposta da equipe vista nesta tela
  const respostas = useRef(new Map<string, number>());
  const visto = useRef<{ conv: string; em: number; chaves: Set<string> }>({ conv: '', em: 0, chaves: new Set() });
  const [seq, setSeq] = useState<{ conv: string; familia: Familia; ate: number } | null>(null);
  const [pausado, setPausado] = useState(false);
  const { orgId, real } = p;

  /** Tira do cache os avisos (negociação, fechado e pedido do gestor) que a equipe já respondeu.
      Fica quem voltou a esperar DEPOIS da resposta (desde > resposta) e o Ligar (não se encerra por resposta). */
  const limpar = useCallback(() => {
    const mapa = respostas.current;
    if (real) {
      const agora = Date.now();
      for (const [cid, em] of mapa) if (agora - em > RESPOSTA_SEGURA_MS) mapa.delete(cid);
    }
    if (mapa.size === 0) return;
    // sino: os avisos do Radar desse cliente (anteriores à resposta) já ficam lidos aqui, sem esperar o motor.
    // O updater devolve undefined quando nada muda — senão o próprio "success" reentraria aqui em laço.
    qc.setQueriesData<Notificacao[]>({ queryKey: ['notificacoes'] }, (old) => {
      if (!old) return undefined;
      let mudou = false;
      const novo = old.map((n) => {
        const em = n.refId ? mapa.get(n.refId) : undefined;
        if (n.lidaEm || em == null || !TIPOS_SINO_RESPOSTA.has(n.tipo) || Date.parse(n.criadoEm) > em) return n;
        mudou = true;
        return { ...n, lidaEm: new Date(em).toISOString() };
      });
      return mudou ? novo : undefined;
    });
    const chave = ['radar-avisos', orgId];
    const atual = qc.getQueryData<RadarItem[]>(chave);
    if (!atual?.length) return;
    const fica = atual.filter((i) => {
      if (i.categoria === 'ligar') return true;
      const em = mapa.get(i.conversaId);
      if (em == null) return true;
      const desde = Date.parse(i.desde);
      return Number.isFinite(desde) && desde > em;
    });
    if (fica.length !== atual.length) qc.setQueryData(chave, fica);
  }, [qc, orgId, real]);

  // cada leitura nova do Radar (e do sino) passa pela mesma limpeza (o refetch pode chegar antes do motor)
  useEffect(() => {
    limpar();
    return qc.getQueryCache().subscribe((ev) => {
      if (ev.type !== 'updated' || ev.action.type !== 'success') return;
      const k = ev.query.queryKey[0];
      if (k === 'radar-avisos' || k === 'notificacoes') limpar();
    });
  }, [qc, limpar]);

  // a resposta conta pelo ENVIO confirmado, não pela conversa aberta: quem responde e já clica no próximo
  // card também vê o selo, a barra e a Central do cliente respondido se atualizarem na hora
  useEffect(() => {
    if (!real) return;
    return qc.getMutationCache().subscribe((ev) => {
      if (ev.type !== 'updated' || ev.action.type !== 'success') return;
      if (ev.mutation.options.mutationKey?.[0] !== 'wa-send') return;
      const cid = (ev.mutation.state.variables as { conversaId?: string } | undefined)?.conversaId;
      if (!cid) return;
      respostas.current.set(cid, Math.max(respostas.current.get(cid) ?? 0, Date.now()));
      limpar();
    });
  }, [qc, limpar, real]);

  // resposta da equipe na conversa aberta
  useEffect(() => {
    const conv = p.conversaId;
    const st = visto.current;
    if (st.conv !== conv) {
      // abriu outra conversa: o que já estava no fio não é envio novo
      const chaves = new Set<string>();
      for (const m of p.msgs) { const k = chaveMsg(m); if (k) chaves.add(k); }
      visto.current = { conv, em: Date.now(), chaves };
      return;
    }
    if (!conv) return;
    const resposta = radarRespostaNova(p.msgs, st, real);
    if (!resposta) return;
    respostas.current.set(conv, Math.max(respostas.current.get(conv) ?? 0, resposta));
    const a = p.porConversa.get(conv)?.aviso;
    if (a && (a.categoria === 'negociacao' || a.categoria === 'fechado') && Date.parse(a.desde) < resposta) {
      setSeq({ conv, familia: a.categoria, ate: Date.now() + PROXIMO_MS });
      setPausado(false);
    }
    limpar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.conversaId, p.msgs]);

  // some sozinho em 10 s (pausa enquanto o ponteiro ou o foco estão nele)
  useEffect(() => {
    if (!seq || pausado) return;
    const t = window.setTimeout(() => setSeq(null), Math.max(0, seq.ate - Date.now()));
    return () => window.clearTimeout(t);
  }, [seq, pausado]);
  // abriu outra conversa (pelo próprio aviso ou pela lista): o cabeçalho já é de outro cliente
  useEffect(() => { setSeq((s) => (s && s.conv !== p.conversaId ? null : s)); }, [p.conversaId]);

  // (useRadarMeus devolve um objeto novo a cada render; as listas dentro dele são estáveis)
  const { negociacao, fechado, pedidos } = p.filas;
  const proximo = useMemo(() => {
    if (!seq) return null;
    const lista = (seq.familia === 'fechado' ? fechado : negociacao).filter((i) => i.conversaId !== seq.conv);
    // ordem da Central: o grupo "Pedido do gestor" no topo da aba; depois a fila (último → 1º, prioridade, espera)
    return lista.find((i) => pedidos.has(i.conversaId)) ?? lista[0] ?? null;
  }, [seq, negociacao, fechado, pedidos]);

  const pausar = useCallback(() => setPausado(true), []);
  const retomar = useCallback(() => {
    setPausado(false);
    setSeq((s) => (s ? { ...s, ate: Math.max(s.ate, Date.now() + RETOMAR_MS) } : s));
  }, []);
  const fechar = useCallback(() => setSeq(null), []);
  return { proximo, familia: seq?.familia ?? null, pausar, retomar, fechar };
}

/** "Próximo aguardando: {cliente} · Sem resposta há {tempo}" — um clique abre o próximo. */
export function RadarProximo({ seq, diaUtil = DIA_UTIL, aoAbrir }: {
  seq: RadarEmSequencia;
  diaUtil?: number;
  aoAbrir: (conversaId: string) => void;
}) {
  const i = seq.proximo;
  const visivel = !!i && !!seq.familia;
  const tempo = i ? fmtTempoLinha(i.minutosUteis, diaUtil) : '';
  const t = i ? rt('extra.inbox.proximo', { cliente: i.nome, tempo }) : {};
  const titulo = i ? t.titulo || `Próximo aguardando: ${i.nome}` : '';
  const texto = i ? t.texto || `Sem resposta há ${tempo}` : '';
  const anuncio = visivel ? `${titulo}. ${texto}.` : '';
  return (
    <>
      {/* região viva sempre montada: o leitor de tela anuncia quando o próximo aparece */}
      <span className="wa-rdr-sr" role="status" aria-live="polite">{anuncio}</span>
      {visivel && (
        <button
          type="button" className={'wa-rdr-prox f-' + seq.familia}
          title={juntar([rt(`alerta.${i!.categoria}.${i!.estagio}`, { tempo: fmtTempo(i!.minutosUteis, diaUtil) }).titulo, linhaPrioridade(i!)])}
          aria-label={anuncio}
          onClick={() => { seq.fechar(); aoAbrir(i!.conversaId); }}
          onMouseEnter={seq.pausar} onMouseLeave={seq.retomar} onFocus={seq.pausar} onBlur={seq.retomar}
        >
          <span className="rdr-prox-ic" aria-hidden>{seq.familia === 'fechado' ? <IcFechado tamanho={12} /> : <IcNegociacao tamanho={12} />}</span>
          <span className="rdr-prox-nm">{titulo}</span>
          <span className="rdr-prox-tp">{texto}</span>
          <span className="rdr-prox-vai" aria-hidden><IcSeta tamanho={11} /></span>
        </button>
      )}
    </>
  );
}
