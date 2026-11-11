import { useMemo, useState } from 'react';
import type { AtendenteV5 } from '@/data/dashboardV5.tipos';
import { fmtDuracaoMin, fmtInt } from '@/data/dashboardV5.formato';
import { Skeleton } from '../../components';
import { Ajuda, Avatar, Legenda, Secao, TempoFechar, Vazio } from './comum';

/* Desempenho por atendente — o bloco mais importante. Colunas ordenáveis (clique
   ou Enter no título), cada uma com a definição em uma frase no "i". */

type Chave = 'nome' | 'recebidos' | 'ganhos' | 'neMarcados' | 'resp' | 'fech';
type Dir = 'asc' | 'desc';

interface Coluna {
  chave: Chave; rotulo: string; ajuda?: string;
  /** onde o título quebra quando a página é estreita (sempre em 2 linhas fixas — assim o
   *  bloco do título tem a largura da linha mais longa e o "i" fica colado nele) */
  linhas?: [string, string];
  /** direção do 1º clique (tempo: o mais rápido primeiro) */
  primeira: Dir;
  valor: (a: AtendenteV5) => number | string | null;
}

const COLS: Coluna[] = [
  { chave: 'nome', rotulo: 'Atendente', primeira: 'asc', valor: (a) => a.nome },
  {
    chave: 'recebidos', rotulo: 'Recebidos', primeira: 'desc', valor: (a) => a.recebidos,
    ajuda: 'Leads novos que o rodízio entregou para a pessoa no período, um por cliente. Leads transferidos de outra pessoa aparecem embaixo, à parte.',
  },
  {
    chave: 'ganhos', rotulo: 'Fechados', primeira: 'desc', valor: (a) => a.ganhos,
    ajuda: 'Leads marcados como fechados no período em que a pessoa era a responsável, inclusive leads que chegaram antes.',
  },
  {
    // não é o mesmo "Não elegíveis" da tabela de números (lá entram IA e regra RS)
    chave: 'neMarcados', rotulo: 'Marcou não elegível', linhas: ['Marcou não', 'elegível'], primeira: 'desc', valor: (a) => a.neMarcados,
    ajuda: 'Leads que a própria pessoa marcou como não elegíveis no período. Os descartados pela IA ou pela regra do RS não entram.',
  },
  {
    chave: 'resp', rotulo: 'Tempo de resposta', primeira: 'asc', valor: (a) => a.respMedianaMin,
    ajuda: 'Tempo de resposta: mediana, em horário comercial (seg–sex, 9h–19h), entre a mensagem do cliente e a primeira resposta humana. Inclui respostas pelo celular, creditadas ao dono do lead.',
  },
  {
    chave: 'fech', rotulo: 'Tempo para fechar', linhas: ['Tempo para', 'fechar'], primeira: 'asc', valor: (a) => a.fechMedianaH,
    ajuda: 'Mediana do tempo entre o lead chegar à pessoa e o fechamento, de todos os fechados dela no período.',
  },
];

function ordenar(lista: AtendenteV5[], chave: Chave, dir: Dir): AtendenteV5[] {
  const col = COLS.find((c) => c.chave === chave)!;
  const m = dir === 'asc' ? 1 : -1;
  return [...lista].sort((x, y) => {
    const a = col.valor(x), b = col.valor(y);
    // sem dado vai sempre para o fim, em qualquer direção
    if (a == null && b == null) return x.nome.localeCompare(y.nome, 'pt-BR');
    if (a == null) return 1;
    if (b == null) return -1;
    const c = typeof a === 'string' && typeof b === 'string' ? a.localeCompare(b, 'pt-BR') : (a as number) - (b as number);
    return c !== 0 ? c * m : y.recebidos - x.recebidos || x.nome.localeCompare(y.nome, 'pt-BR');
  });
}

function Cabeca({ col, ordem, aoOrdenar }: { col: Coluna; ordem: { chave: Chave; dir: Dir }; aoOrdenar: (c: Coluna) => void }) {
  const ativa = ordem.chave === col.chave;
  const sort = ativa ? (ordem.dir === 'asc' ? 'ascending' : 'descending') : 'none';
  // coluna numérica (alinhada à direita): o "i" vem ANTES do rótulo, para o rótulo
  // terminar na mesma borda dos números e o "i" não encostar no título vizinho
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

export function Atendentes({ atendentes }: { atendentes: AtendenteV5[] }) {
  const [ordem, setOrdem] = useState<{ chave: Chave; dir: Dir }>({ chave: 'recebidos', dir: 'desc' });
  const linhas = useMemo(() => ordenar(atendentes, ordem.chave, ordem.dir), [atendentes, ordem]);
  const maxRec = Math.max(1, ...atendentes.map((a) => a.recebidos));
  const aoOrdenar = (c: Coluna) => setOrdem((o) => (o.chave === c.chave
    ? { chave: c.chave, dir: o.dir === 'asc' ? 'desc' : 'asc' }
    : { chave: c.chave, dir: c.primeira }));

  return (
    <Secao className="d5-at" titulo="Desempenho por atendente"
      sub="Quem teve movimento no período. Clique no título de uma coluna para ordenar.">
      {atendentes.length === 0 ? (
        <Vazio texto="Ninguém da equipe teve movimento no período." detalhe="Recebidos, fechados, não elegíveis e respostas aparecem aqui quando acontecerem." />
      ) : (
        <div className="d5-tab-rolo">
          <table className="d5-tab d5-tab-at">
            <colgroup>
              <col className="d5-c-pessoa" /><col className="d5-c-rec" /><col className="d5-c-n" /><col className="d5-c-ne" /><col className="d5-c-resp" /><col className="d5-c-fech" />
            </colgroup>
            <thead>
              <tr>{COLS.map((c) => <Cabeca key={c.chave} col={c} ordem={ordem} aoOrdenar={aoOrdenar} />)}</tr>
            </thead>
            <tbody>
              {linhas.map((a) => {
                return (
                <tr key={a.usuarioId}>
                  <th scope="row" className="d5-nome">
                    <span className="d5-nome-in">
                      <Avatar nome={a.nome} />
                      <b className="d5-pessoa">{a.nome}</b>
                    </span>
                  </th>
                  <td className="d5-dir">
                    <span className="d5-cel2 d5-cel2-dir">
                      <span className="d5-ent">
                        {/* sem % ao lado: barra relativa ao maior, sem trilho (não é progresso) */}
                        <span className="d5-trilho d5-trilho-livre" aria-hidden><i style={{ width: `${a.recebidos ? Math.max(2, (a.recebidos / maxRec) * 100) : 0}%` }} /></span>
                        <b className={'num' + (a.recebidos ? '' : ' d5-mudo')}>{fmtInt(a.recebidos)}</b>
                      </span>
                      {a.transferidos > 0 && <small className="num">+{fmtInt(a.transferidos)} {a.transferidos === 1 ? 'transferido' : 'transferidos'}</small>}
                    </span>
                  </td>
                  <td className="d5-dir"><b className={'num' + (a.ganhos ? '' : ' d5-mudo')}>{fmtInt(a.ganhos)}</b></td>
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
                  <td className="d5-dir"><TempoFechar med={a.fechMedianaH} media={a.fechMediaH} n={a.fechN} /></td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Secao>
  );
}

export function AtendentesSkeleton() {
  return (
    <Secao className="d5-at" titulo="Desempenho por atendente">
      <div className="d5-sk-linhas" aria-hidden>
        {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} altura={44} raio={6} />)}
      </div>
    </Secao>
  );
}
