import { useMemo, useState } from 'react';
import type { AtendenteAbaV5, AtendentesAbaV5 } from '@/data/dashboardV5.abas.tipos';
import { CAMPANHAS_GRAF, rotuloCampanha } from '@/data/dashboardV5.abas.tipos';
import { baldesDe, fimComHoje, somarEmBaldes, type BaldeTipo } from '@/data/dashboardV5.series';
import { fmtDuracaoH, fmtDuracaoMin, fmtInt } from '@/data/dashboardV5.formato';
import { janelaMapaV5 } from '@/data/dashboardV5.periodo';
import type { Periodo } from '@/data/relatorios';
import { Segmentado, Skeleton } from '../../components';
import { CartaoMetrica, TituloBloco, diaDoBalao } from '../../components/CartaoMetrica';
import { Ajuda, Avatar, Legenda, Secao, TempoFechar, Variacao, Vazio } from './comum';
import { GrafLinhas, LegendaGraf, useLinhasGraf, type SerieGraf } from './GrafLinhas';

/* Aba ATENDENTES (12/11): quem fecha mais (placar do CAF), os DOIS relógios com os
   excluídos à vista — "preciso de um resultado exato, não posso aceitar algo falso"
   (dono) —, por qual campanha cada um fecha, tempo de resposta, as ondas de fechados
   da equipe e as fotos de agora (vácuo, carteira, parados). */

const AJUDA_FECHADOS = 'Fechados do placar da ALFA creditados ao vendedor do caso — o mesmo número do pódio. '
  + 'O administrativo lança em dia útil e re-sincroniza a cada 5 minutos: números passados podem mudar.';
const AJUDA_CLI = 'Relógio do CLIENTE: da entrada do lead até o fechamento, mediana. É o tempo que o cliente esperou, '
  + 'independente de quantas mãos o lead passou.';
const AJUDA_AT = 'Relógio do ATENDENTE: de quando a pessoa RECEBEU o lead (primeira atribuição a ela) até o '
  + 'fechamento, mediana. Idas e vindas de dono não reiniciam o relógio. "Sem relógio" = fechados que não têm '
  + 'cliente casado no sistema ou são de antes de agosto — mostrados, nunca escondidos.';
const AJUDA_RESP = 'Tempo de resposta: mediana, em minutos ÚTEIS (seg–sex, 9h–19h), da mensagem do cliente à '
  + 'primeira resposta humana. Madrugada e fim de semana não contam no relógio. Inclui respostas pelo celular, '
  + 'creditadas ao dono do lead.';
const AJUDA_AGORA = 'Fotos de AGORA, independentes do período escolhido: clientes no 3º aviso do radar de vácuo, '
  + 'conversas abertas na carteira e paradas há mais de 7 dias. Carteira e parados carregam o legado antigo — '
  + 'servem para comparar entre a equipe, não como meta.';

type Chave = 'nome' | 'ganhos' | 'recebidos' | 'neMarcados' | 'resp' | 'cli' | 'fech' | 'vacuo';
type Dir = 'asc' | 'desc';
interface Coluna {
  chave: Chave; rotulo: string; ajuda?: string; linhas?: [string, string];
  primeira: Dir; valor: (a: AtendenteAbaV5) => number | string | null;
}
const COLS: Coluna[] = [
  { chave: 'nome', rotulo: 'Atendente', primeira: 'asc', valor: (a) => a.nome },
  { chave: 'ganhos', rotulo: 'Fechados', primeira: 'desc', valor: (a) => a.ganhos, ajuda: AJUDA_FECHADOS },
  {
    chave: 'recebidos', rotulo: 'Recebidos', primeira: 'desc', valor: (a) => a.recebidos,
    ajuda: 'Leads novos entregues pelo rodízio no período (um por cliente). Transferências aparecem embaixo, à parte — dias de redistribuição em lote explodem esse número.',
  },
  {
    chave: 'neMarcados', rotulo: 'Marcou não elegível', linhas: ['Marcou não', 'elegível'], primeira: 'desc', valor: (a) => a.neMarcados,
    ajuda: 'Não elegíveis que a própria pessoa marcou no período. Os da IA e da regra do RS não entram.',
  },
  { chave: 'resp', rotulo: 'Tempo de resposta', linhas: ['Tempo de', 'resposta'], primeira: 'asc', valor: (a) => a.respMedianaMin, ajuda: AJUDA_RESP },
  { chave: 'cli', rotulo: 'Espera do cliente', linhas: ['Espera do', 'cliente'], primeira: 'asc', valor: (a) => a.cliMedianaH, ajuda: AJUDA_CLI },
  { chave: 'fech', rotulo: 'Tempo do atendente', linhas: ['Tempo do', 'atendente'], primeira: 'asc', valor: (a) => a.fechMedianaH, ajuda: AJUDA_AT },
];

function ordenar(lista: AtendenteAbaV5[], chave: Chave, dir: Dir): AtendenteAbaV5[] {
  const col = COLS.find((c) => c.chave === chave) ?? COLS[1];
  const m = dir === 'asc' ? 1 : -1;
  return [...lista].sort((x, y) => {
    const a = col.valor(x), b = col.valor(y);
    if (a == null && b == null) return x.nome.localeCompare(y.nome, 'pt-BR');
    if (a == null) return 1;
    if (b == null) return -1;
    const c = typeof a === 'string' && typeof b === 'string' ? a.localeCompare(b, 'pt-BR') : (a as number) - (b as number);
    return c !== 0 ? c * m : y.ganhos - x.ganhos || x.nome.localeCompare(y.nome, 'pt-BR');
  });
}

function Cabeca({ col, ordem, aoOrdenar }: { col: Coluna; ordem: { chave: Chave; dir: Dir }; aoOrdenar: (c: Coluna) => void }) {
  const ativa = ordem.chave === col.chave;
  const sort = ativa ? (ordem.dir === 'asc' ? 'ascending' : 'descending') : 'none';
  return (
    <th scope="col" aria-sort={sort} className={(col.chave === 'nome' ? '' : 'd5-dir') + (ativa ? ' d5-th-on' : '')}>
      <span className="d5-th-ajuda">
        {col.ajuda && <Ajuda texto={col.ajuda} rotulo={col.rotulo} />}
        <button type="button" className="d5-ord" onClick={() => aoOrdenar(col)}>
          <span className="d5-ord-tx">{col.linhas ? <><span>{col.linhas[0]}</span> <span>{col.linhas[1]}</span></> : col.rotulo}</span>
          <svg viewBox="0 0 10 12" width="8" height="10" aria-hidden className={'d5-ord-ic' + (ativa ? ` d5-ord-${ordem.dir}` : '')}>
            <path d="M5 1.2 8.2 4.8H1.8z" className="d5-ord-up" />
            <path d="M5 10.8 1.8 7.2h6.4z" className="d5-ord-dn" />
          </svg>
        </button>
      </span>
    </th>
  );
}

const CORES_EQUIPE = ['var(--dado-1)', 'var(--dado-2)', 'var(--dado-3)', 'var(--dado-4)', 'var(--dado-5)'];

/* ---------------- o card de cada atendente (dono 14/11: "deixar o desempenho por atendente
   mais organizado, mais profissional, mais bonito") ----------------
   Os MESMOS números da tabela, cada pessoa num card: a posição, quem é e por qual campanha
   mais fecha; os fechados com o gráfico dia a dia (a mesma série do "Fechados da equipe");
   embaixo os seis números do período em grade; no rodapé, contra o período anterior. */
const ORDENS: { valor: Chave; rotulo: string }[] = [
  { valor: 'ganhos', rotulo: 'Fechados' },
  { valor: 'recebidos', rotulo: 'Recebidos' },
  { valor: 'resp', rotulo: 'Resposta' },
  { valor: 'cli', rotulo: 'Espera' },
];
type Vista = 'cartoes' | 'tabela';
const VISTAS: { valor: Vista; rotulo: string }[] = [
  { valor: 'cartoes', rotulo: 'Cartões' },
  { valor: 'tabela', rotulo: 'Tabela' },
];

/** número da tabela "Carteira agora" com a barra proporcional embaixo */
function CelBarra({ v, max, alerta }: { v: number; max: number; alerta?: boolean }) {
  return (
    <span className="rvm-celbar">
      <b className={'num' + (v ? (alerta ? ' d5-agora-vac' : '') : ' d5-mudo')}>{fmtInt(v)}</b>
      <span className={'rvm-barra' + (alerta ? ' rvm-barra-alerta' : '')} aria-hidden><i style={{ width: `${v ? Math.max(3, (v / max) * 100) : 0}%` }} /></span>
    </span>
  );
}

function Numero({ rotulo, valor, sub, ajuda, alerta }: { rotulo: string; valor: string; sub?: string | null; ajuda?: string; alerta?: boolean }) {
  return (
    <div className="rvm-stat">
      <dt>{rotulo}{ajuda && <Ajuda texto={ajuda} rotulo={rotulo} />}</dt>
      <dd>
        <b className={'num' + (valor === '—' || valor === '0' ? ' d5-mudo' : '')}>{valor}</b>
        {sub && <small className={'num' + (alerta ? ' d5-sem-relogio' : '')}>{sub}</small>}
      </dd>
    </div>
  );
}

function CartaoAtendente({ a, pos, dias, serieGanhos, hoje }: {
  a: AtendenteAbaV5; pos: number; dias: string[]; serieGanhos: AtendentesAbaV5['serieGanhos']; hoje: string;
}) {
  const pontos = useMemo(() => {
    const m = new Map(dias.map((dia) => [dia, 0]));
    for (const p of serieGanhos) if (p.usuarioId === a.usuarioId && m.has(p.dia)) m.set(p.dia, (m.get(p.dia) ?? 0) + p.ganhos);
    return [...m].map(([dia, v]) => ({ value: v, date: dia }));
  }, [a.usuarioId, serieGanhos, dias]);
  const camp = a.campanhas[0];
  const corCamp = camp ? CAMPANHAS_GRAF.find((c) => c.slug === camp.campanha)?.cor ?? 'var(--txt-3)' : null;
  const fechados = (v: number) => `${fmtInt(v)} ${v === 1 ? 'fechado' : 'fechados'}`;
  return (
    <CartaoMetrica
      className="rvm-at"
      titulo={`${pos}º ${a.nome}: ${fechados(a.ganhos)}`}
      cabEsquerda={(
        <span className="rvm-pessoa">
          <span className={'rvm-pos' + (pos === 1 && a.ganhos > 0 ? ' rvm-pos-1' : '')}>{pos}º</span>
          <Avatar nome={a.nome} />
          <b>{a.nome}</b>
        </span>
      )}
      cabDireita={camp && corCamp ? (
        <span className="rvm-chip" title={'Fecha mais por: ' + a.campanhas.map((c) => `${rotuloCampanha(c.campanha)} ${c.ganhos}`).join(' · ')}>
          <i style={{ background: corCamp }} />{rotuloCampanha(camp.campanha)}
        </span>
      ) : undefined}
      data={pontos}
      total={fmtInt(a.ganhos)}
      unidade={a.ganhos === 1 ? 'fechado' : 'fechados'}
      variacao={false}
      tom={a.ganhos > a.ganhosAnt ? 'bom' : a.ganhos < a.ganhosAnt ? 'ruim' : 'neutro'}
      formatar={fechados}
      formatarData={(dia) => diaDoBalao(dia, hoje)}
      extra={(
        <dl className="rvm-stats">
          <Numero rotulo="Recebidos" valor={fmtInt(a.recebidos)}
            sub={a.transferidos > 0 ? `+${fmtInt(a.transferidos)} ${a.transferidos === 1 ? 'transferido' : 'transferidos'}` : null} />
          <Numero rotulo="Marcou NE" valor={fmtInt(a.neMarcados)} sub="não elegíveis" />
          <Numero rotulo="Respostas" valor={fmtInt(a.respN)} sub={a.respCelularN > 0 ? `${fmtInt(a.respCelularN)} pelo celular` : null} />
          <Numero rotulo="Resposta" ajuda={AJUDA_RESP}
            valor={a.respN > 0 && a.respMedianaMin != null ? fmtDuracaoMin(a.respMedianaMin) : '—'}
            sub={a.respN > 0 ? `média ${fmtDuracaoMin(a.respMediaMin)}` : null} />
          <Numero rotulo="Espera do cliente" ajuda={AJUDA_CLI}
            valor={a.cliN > 0 && a.cliMedianaH != null ? fmtDuracaoH(a.cliMedianaH) : '—'}
            sub={a.cliN > 0 ? `média ${fmtDuracaoH(a.cliMediaH)}` : null} />
          <Numero rotulo="Tempo do atendente" ajuda={AJUDA_AT}
            valor={a.fechN > 0 && a.fechMedianaH != null ? fmtDuracaoH(a.fechMedianaH) : '—'}
            sub={a.fechSemRelogio > 0 ? `${fmtInt(a.fechSemRelogio)} sem relógio` : a.fechN > 0 ? `média ${fmtDuracaoH(a.fechMediaH)}` : null}
            alerta={a.fechSemRelogio > 0} />
        </dl>
      )}
      rodape={<Variacao atual={a.ganhos} anterior={a.ganhosAnt} sentido="maior" comparacao="vs período anterior" />}
    />
  );
}

export function AtendentesAba({ d, periodo, hoje }: { d: AtendentesAbaV5; periodo: Periodo; hoje: string }) {
  const [ordem, setOrdem] = useState<{ chave: Chave; dir: Dir }>({ chave: 'ganhos', dir: 'desc' });
  const [vista, setVista] = useState<Vista>('cartoes');
  const linhas = useMemo(() => ordenar(d.atendentes, ordem.chave, ordem.dir), [d.atendentes, ordem]);
  const aoOrdenar = (c: Coluna) => setOrdem((o) => (o.chave === c.chave
    ? { chave: c.chave, dir: o.dir === 'asc' ? 'desc' : 'asc' }
    : { chave: c.chave, dir: c.primeira }));
  const maxGanhos = Math.max(1, ...d.atendentes.map((a) => a.ganhos));

  const balde: BaldeTipo = periodo.dias <= 14 ? 'dia' : 'semana';
  const linhasGraf = useLinhasGraf();
  // período curto desenha os últimos 7 dias (régua do mapa): um dia só não faz onda
  const jm = useMemo(() => janelaMapaV5(periodo, hoje), [periodo, hoje]);
  const serieEquipe = useMemo<SerieGraf[]>(() => {
    const comGanho = d.atendentes.filter((a) => a.ganhos > 0).slice(0, 5);
    return comGanho.map((a, i) => ({
      id: a.usuarioId,
      rotulo: a.nome,
      cor: CORES_EQUIPE[i % CORES_EQUIPE.length],
      valores: somarEmBaldes(
        d.serieGanhos.filter((p) => p.usuarioId === a.usuarioId).map((p) => ({ dia: p.dia, valor: p.ganhos })),
        balde,
      ),
    }));
  }, [d.atendentes, d.serieGanhos, balde]);
  const baldes = useMemo(() => baldesDe(jm.iniDate, fimComHoje(periodo.fimDate, hoje), balde), [jm, periodo, balde, hoje]);
  const diasGraf = useMemo(() => baldesDe(jm.iniDate, fimComHoje(periodo.fimDate, hoje), 'dia').map((b) => b.chave), [jm, periodo, hoje]);

  const vacuoTotal = d.atendentes.reduce((s, a) => s + a.vacuo3o, 0);
  // "Carteira agora": a barra de cada número contra o maior da equipe (comparar num relance)
  const maxAgora = {
    vacuo: Math.max(1, ...d.atendentes.map((a) => a.vacuo3o)),
    carteira: Math.max(1, ...d.atendentes.map((a) => a.carteira)),
    parados: Math.max(1, ...d.atendentes.map((a) => a.parados7d)),
  };
  const controles = (
    <div className="rvm-ctl">
      {vista === 'cartoes' && (
        <span className="rvm-ctl-ord">
          <span className="rvm-ctl-rot">Ordenar por</span>
          <Segmentado<Chave> opcoes={ORDENS} valor={ORDENS.some((o) => o.valor === ordem.chave) ? ordem.chave : 'ganhos'}
            aoMudar={(v) => setOrdem({ chave: v, dir: COLS.find((c) => c.chave === v)?.primeira ?? 'desc' })} rotulo="Ordenar os atendentes" />
        </span>
      )}
      <Segmentado<Vista> opcoes={VISTAS} valor={vista} aoMudar={setVista} rotulo="Mostrar em cartões ou em tabela" />
    </div>
  );


  return (
    <>
      {vista === 'cartoes' ? (
        <div className="rvm-bloco">
          <TituloBloco titulo="Desempenho por atendente" ajuda={<Ajuda texto={AJUDA_FECHADOS} rotulo="Desempenho por atendente" />}
            sub="Fechados pelo placar da ALFA, dia a dia; embaixo, quem recebeu, respondeu e esperou — o cliente e o atendente."
            acao={controles} />
          {d.atendentes.length === 0 ? (
            <Vazio texto="Ninguém da equipe teve movimento no período." />
          ) : (
            <div className="rvm-grade-at">
              {linhas.map((a, i) => (
                <CartaoAtendente key={a.usuarioId} a={a} pos={i + 1} dias={diasGraf} serieGanhos={d.serieGanhos} hoje={hoje} />
              ))}
            </div>
          )}
        </div>
      ) : (
      <Secao className="d5-at d5-at-aba" titulo="Desempenho por atendente"
        sub="Fechados pelo placar da ALFA; os dois relógios dizem quem esperou — o cliente e o atendente. Clique no título de uma coluna para ordenar."
        acao={controles}>
        {d.atendentes.length === 0 ? (
          <Vazio texto="Ninguém da equipe teve movimento no período." />
        ) : (
          <div className="d5-tab-rolo">
            <table className="d5-tab d5-tab-at">
              <thead>
                <tr>{COLS.map((c) => <Cabeca key={c.chave} col={c} ordem={ordem} aoOrdenar={aoOrdenar} />)}</tr>
              </thead>
              <tbody>
                {linhas.map((a) => (
                  <tr key={a.usuarioId}>
                    <th scope="row" className="d5-nome">
                      <span className="d5-nome-in">
                        <Avatar nome={a.nome} />
                        <span className="d5-cel2">
                          <b className="d5-pessoa">{a.nome}</b>
                          {a.campanhas.length > 0 && (
                            <small title={a.campanhas.map((c) => `${rotuloCampanha(c.campanha)}: ${c.ganhos}`).join(' · ')}>
                              fecha mais por <b>{rotuloCampanha(a.campanhas[0].campanha)}</b>
                            </small>
                          )}
                        </span>
                      </span>
                    </th>
                    <td className="d5-dir">
                      <span className="d5-cel2 d5-cel2-dir">
                        <span className="d5-ent">
                          <span className="d5-trilho d5-trilho-livre" aria-hidden><i style={{ width: `${a.ganhos ? Math.max(2, (a.ganhos / maxGanhos) * 100) : 0}%` }} /></span>
                          <b className={'num' + (a.ganhos ? '' : ' d5-mudo')}>{fmtInt(a.ganhos)}</b>
                        </span>
                        <Variacao atual={a.ganhos} anterior={a.ganhosAnt} sentido="maior" comparacao="vs anterior" />
                      </span>
                    </td>
                    <td className="d5-dir">
                      <span className="d5-cel2 d5-cel2-dir">
                        <b className={'num' + (a.recebidos ? '' : ' d5-mudo')}>{fmtInt(a.recebidos)}</b>
                        {a.transferidos > 0 && <small className="num">+{fmtInt(a.transferidos)} {a.transferidos === 1 ? 'transferido' : 'transferidos'}</small>}
                      </span>
                    </td>
                    <td className="d5-dir"><b className={'num' + (a.neMarcados ? '' : ' d5-mudo')}>{fmtInt(a.neMarcados)}</b></td>
                    <td className="d5-dir">
                      {a.respN > 0 && a.respMedianaMin != null ? (
                        <span className="d5-cel2 d5-cel2-dir">
                          <b className="num">{fmtDuracaoMin(a.respMedianaMin)}</b>
                          <small className="num">
                            <Legenda partes={[
                              `média ${fmtDuracaoMin(a.respMediaMin)}`,
                              `${fmtInt(a.respN)} ${a.respN === 1 ? 'resposta' : 'respostas'}`,
                              a.respCelularN > 0 && `${fmtInt(a.respCelularN)} pelo celular`,
                            ]} />
                          </small>
                        </span>
                      ) : <span className="d5-mudo">—</span>}
                    </td>
                    <td className="d5-dir"><TempoFechar med={a.cliMedianaH} media={a.cliMediaH} n={a.cliN} /></td>
                    <td className="d5-dir">
                      <span className="d5-cel2 d5-cel2-dir">
                        <TempoFechar med={a.fechMedianaH} media={a.fechMediaH} n={a.fechN} />
                        {a.fechSemRelogio > 0 && (
                          <small className="d5-sem-relogio num">{fmtInt(a.fechSemRelogio)} sem relógio</small>
                        )}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Secao>
      )}

      {serieEquipe.length > 0 && (
        <Secao className="d5-ondas d5-ondas-eq" titulo="Fechados da equipe, no tempo"
          ajuda={'Fechados do placar da ALFA por atendente. O administrativo lança em dia útil: fim de semana e feriado '
            + 'aparecem zerados sem ser queda de venda. Com período curto o gráfico mostra os últimos 7 dias; a tabela '
            + 'acima continua só no período escolhido. Clique no nome para esconder ou mostrar a linha.'}
          sub={`Fechados do placar por ${balde === 'dia' ? 'dia' : 'semana'}${jm.estendido ? ' · últimos 7 dias' : ''}`}
          acao={<div className="d5-ondas-ctl"><LegendaGraf series={serieEquipe} controle={linhasGraf} /></div>}>
          <GrafLinhas baldes={baldes} series={serieEquipe} controle={linhasGraf}
            titulo={`Fechados por atendente e ${balde === 'dia' ? 'dia' : 'semana'}`}
            vazio="Sem fechados lançados neste período." />
        </Secao>
      )}

      <Secao className="d5-agora" titulo="Carteira agora" ajuda={AJUDA_AGORA}
        sub={`Foto deste instante, não do período escolhido.${vacuoTotal > 0 ? ` ${fmtInt(vacuoTotal)} clientes no 3º aviso do vácuo.` : ''}`}>
        {d.atendentes.length === 0 ? (
          <Vazio texto="Sem carteira para mostrar." />
        ) : (
          <div className="d5-tab-rolo">
            <table className="d5-tab d5-tab-agora">
              <thead>
                <tr>
                  <th scope="col">Atendente</th>
                  <th scope="col" className="d5-dir">No vácuo (3º aviso)</th>
                  <th scope="col" className="d5-dir">Conversas abertas</th>
                  <th scope="col" className="d5-dir">Paradas há 7+ dias</th>
                </tr>
              </thead>
              <tbody>
                {[...d.atendentes].sort((a, b) => b.vacuo3o - a.vacuo3o || a.nome.localeCompare(b.nome, 'pt-BR')).map((a) => (
                  <tr key={a.usuarioId}>
                    <th scope="row" className="d5-nome">
                      <span className="d5-nome-in"><Avatar nome={a.nome} /><b className="d5-pessoa">{a.nome}</b></span>
                    </th>
                    <td className="d5-dir"><CelBarra v={a.vacuo3o} max={maxAgora.vacuo} alerta /></td>
                    <td className="d5-dir"><CelBarra v={a.carteira} max={maxAgora.carteira} /></td>
                    <td className="d5-dir"><CelBarra v={a.parados7d} max={maxAgora.parados} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="d5-graf-nota">Perda marcada pela equipe quase não existe no sistema (em novembro, 100% das perdas são não
          elegíveis) — por isso o "deixou esperando" sai do radar de vácuo e das conversas paradas, não de um botão de perda.</p>
      </Secao>
    </>
  );
}

export function AtendentesAbaSkeleton() {
  return (
    <Secao className="d5-at d5-at-aba" titulo="Desempenho por atendente">
      <div className="d5-sk-linhas" aria-hidden>
        {Array.from({ length: 5 }, (_, i) => <Skeleton key={i} altura={44} raio={6} />)}
      </div>
    </Secao>
  );
}
