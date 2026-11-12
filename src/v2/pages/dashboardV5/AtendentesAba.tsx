import { useMemo, useState } from 'react';
import type { AtendenteAbaV5, AtendentesAbaV5 } from '@/data/dashboardV5.abas.tipos';
import { rotuloCampanha } from '@/data/dashboardV5.abas.tipos';
import { baldesDe, fimComHoje, somarEmBaldes, type BaldeTipo } from '@/data/dashboardV5.series';
import { fmtDuracaoMin, fmtInt } from '@/data/dashboardV5.formato';
import { janelaMapaV5 } from '@/data/dashboardV5.periodo';
import type { Periodo } from '@/data/relatorios';
import { Skeleton } from '../../components';
import { Ajuda, Avatar, Legenda, Secao, TempoFechar, Variacao, Vazio } from './comum';
import { GrafLinhas, type SerieGraf } from './GrafLinhas';

/* Aba ATENDENTES (12/11): quem fecha mais (placar do CAF), os DOIS relógios com os
   excluídos à vista — "preciso de um resultado exato, não posso aceitar algo falso"
   (dono) —, por qual campanha cada um fecha, tempo de resposta, as ondas de fechados
   da equipe e as fotos de agora (vácuo, carteira, parados). */

const AJUDA_FECHADOS = 'Fechados do placar do CAF creditados ao vendedor do caso — o mesmo número do pódio. '
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

export function AtendentesAba({ d, periodo, hoje }: { d: AtendentesAbaV5; periodo: Periodo; hoje: string }) {
  const [ordem, setOrdem] = useState<{ chave: Chave; dir: Dir }>({ chave: 'ganhos', dir: 'desc' });
  const linhas = useMemo(() => ordenar(d.atendentes, ordem.chave, ordem.dir), [d.atendentes, ordem]);
  const aoOrdenar = (c: Coluna) => setOrdem((o) => (o.chave === c.chave
    ? { chave: c.chave, dir: o.dir === 'asc' ? 'desc' : 'asc' }
    : { chave: c.chave, dir: c.primeira }));
  const maxGanhos = Math.max(1, ...d.atendentes.map((a) => a.ganhos));

  const balde: BaldeTipo = periodo.dias <= 14 ? 'dia' : 'semana';
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

  const vacuoTotal = d.atendentes.reduce((s, a) => s + a.vacuo3o, 0);

  return (
    <>
      <Secao className="d5-at d5-at-aba" titulo="Desempenho por atendente"
        sub="Fechados pelo placar do CAF; os dois relógios dizem quem esperou — o cliente e o atendente. Clique no título de uma coluna para ordenar.">
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

      {serieEquipe.length > 0 && (
        <Secao className="d5-ondas d5-ondas-eq" titulo="Fechados da equipe, no tempo"
          ajuda={'Fechados do placar do CAF por atendente. O administrativo lança em dia útil: fim de semana e feriado '
            + 'aparecem zerados sem ser queda de venda. Com período curto o gráfico mostra os últimos 7 dias; a tabela '
            + 'acima continua só no período escolhido. Clique no nome para esconder ou mostrar a linha.'}
          sub={`Fechados do placar por ${balde === 'dia' ? 'dia' : 'semana'}${jm.estendido ? ' · últimos 7 dias' : ''}`}>
          <GrafLinhas baldes={baldes} series={serieEquipe}
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
                    <td className="d5-dir"><b className={'num' + (a.vacuo3o ? ' d5-agora-vac' : ' d5-mudo')}>{fmtInt(a.vacuo3o)}</b></td>
                    <td className="d5-dir"><b className={'num' + (a.carteira ? '' : ' d5-mudo')}>{fmtInt(a.carteira)}</b></td>
                    <td className="d5-dir"><b className={'num' + (a.parados7d ? '' : ' d5-mudo')}>{fmtInt(a.parados7d)}</b></td>
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
