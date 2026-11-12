import { useMemo, type ReactNode } from 'react';
import type { IrisV5 } from '@/data/dashboardV5.abas.tipos';
import { rotuloCampanha } from '@/data/dashboardV5.abas.tipos';
import { baldesDe, fimComHoje, somarEmBaldes, type BaldeTipo } from '@/data/dashboardV5.series';
import { fmtDuracaoH, fmtDuracaoMin, fmtInt, fmtPct, pctDe } from '@/data/dashboardV5.formato';
import type { Periodo } from '@/data/relatorios';
import { Skeleton } from '../../components';
import { Ajuda, Legenda, Secao, Variacao, Vazio } from './comum';
import { GrafLinhas, LegendaGraf, type SerieGraf } from './GrafLinhas';

/* Aba IRIS (12/11): o funil dela (atendidas → qualificadas → proposta → aceite →
   documentação → FECHOU), o que falta de documento, o tempo até fechar, as ondas e
   o VIGIA (quem ela deixou sem resposta) morando aqui — pedido do dono. Cada número
   diz a própria régua; onde a exatidão tem limite, a tela declara. */

const AJUDA_ATENDIDAS = 'Sessões em que a Iris mandou mensagem no período. Exato a ±5% por enquanto: a marca da '
  + 'Iris é o estado da sessão, e sessões antigas que viraram dela contam o passado junto. Fica exato quando o '
  + 'ia-sdr passar a carimbar cada mensagem (já encomendado).';
const AJUDA_QUALIFICADAS = 'Passaram na porta das 5 financeiras (têm empréstimo em banco que a gente atende) — '
  + 'evento com data exata.';
const AJUDA_PROPOSTAS = 'Propostas de PORTABILIDADE enviadas (evento com data). A pré-aprovada clássica ainda não '
  + 'grava data — não entra aqui, então o número real é um pouco maior.';
const AJUDA_FECHOU = 'FECHOU para a Iris = pegou a documentação completa no período (identidade dos dois lados ou '
  + '2 fotos, comprovante e e-mail). O aceite explícito aparece como linha de apoio porque parte dos clientes '
  + 'aceita mandando o documento, sem escrever "sim".';
const AJUDA_DOCS = 'Régua do código da Iris: identidade completa (2 fotos ou frente e verso), comprovante presente '
  + '("não tenho", aguardando o analista, conta — a linha estrita não conta) e e-mail (ou e-mail a criar com o cliente).';
const AJUDA_TEMPO = 'Da criação da sessão até a documentação completa, relógio de parede (madrugada e espera do '
  + 'cliente contam). Só sessões criadas de 01/11 em diante — antes disso a Iris não atendia essa carteira.';

const ETAPA_ROTULO: Record<string, string> = {
  triagem_govbr: 'Triagem (senha gov.br)',
  qualificacao_inss: 'Qualificação',
  qualificacao_retomada: 'Retomada',
  coleta_docs: 'Coleta de documentos',
  conclusao: 'Conclusão',
  juros_conversa: 'Juros abusivo',
};

function Cartao({ rotulo, ajuda, n, sub, destaque, variacao }: {
  rotulo: string; ajuda?: string; n: string; sub?: ReactNode; destaque?: boolean;
  variacao?: { atual: number; anterior: number | null };
}) {
  return (
    <div className={'d5-qd d5-iris-c' + (destaque ? ' d5-iris-c-forte' : '')}>
      <span className="d5-qd-t">{rotulo}{ajuda && <Ajuda rotulo={rotulo} texto={ajuda} />}</span>
      <b className="d5-qd-n num">{n}</b>
      {sub && <small className="d5-qd-sub num">{sub}</small>}
      {variacao && variacao.anterior != null && (
        <Variacao atual={variacao.atual} anterior={variacao.anterior} sentido="maior" comparacao="vs anterior" />
      )}
    </div>
  );
}

export function IrisAba({ d, periodo, hoje }: { d: IrisV5; periodo: Periodo; hoje: string }) {
  const f = d.funil;
  const a = d.funilAnt;
  const fa = d.faltas;
  const balde: BaldeTipo = periodo.dias <= 14 ? 'dia' : 'semana';
  const baldes = useMemo(() => baldesDe(periodo.iniDate, fimComHoje(periodo.fimDate, hoje), balde), [periodo, balde, hoje]);
  const series = useMemo<SerieGraf[]>(() => [
    {
      id: 'atendidas', rotulo: 'Atendidas', cor: 'var(--dado-1)',
      valores: somarEmBaldes(d.serie.map((p) => ({ dia: p.dia, valor: p.atendidas })), balde),
    },
    {
      id: 'qualificadas', rotulo: 'Qualificadas', cor: 'var(--dado-2)', tracejado: '5 3',
      valores: somarEmBaldes(d.serie.map((p) => ({ dia: p.dia, valor: p.qualificadas })), balde),
    },
    {
      id: 'docs', rotulo: 'Documentação completa', cor: 'var(--dado-3)', tracejado: '2 3',
      valores: somarEmBaldes(d.serie.map((p) => ({ dia: p.dia, valor: p.docsCompletos })), balde),
    },
  ], [d.serie, balde]);

  const etapas = Object.entries(d.etapas)
    .map(([k, n]) => ({ k, rotulo: ETAPA_ROTULO[k] ?? k.replace(/_/g, ' '), n }))
    .sort((x, y) => y.n - x.n || x.rotulo.localeCompare(y.rotulo, 'pt-BR'));

  const faltasLista = [
    { r: 'Falta o comprovante', n: fa.comprovante },
    { r: 'Falta o e-mail', n: fa.email },
    { r: 'Falta a identidade', n: fa.identidade },
    { r: 'Não mandou nada dos 3', n: fa.nadaDos3, sub: true },
    { r: 'Só falta o outro lado do documento', n: fa.soOutroLado, sub: true },
    { r: '"Não tenho comprovante" (aguarda o analista)', n: fa.comprPendenteAnalista, sub: true },
  ].filter((x) => x.n > 0);
  const maxFalta = Math.max(1, ...faltasLista.map((x) => x.n));

  return (
    <>
      <Secao className="d5-iris-funil" titulo="Funil da Iris"
        sub="Do primeiro atendimento à documentação completa, no período escolhido. Cada cartão diz a própria régua no “i”.">
        <div className="d5-qds d5-iris-qds">
          <Cartao rotulo="Atendidas" ajuda={AJUDA_ATENDIDAS} n={fmtInt(f.atendidasSessoes)}
            sub={<Legenda partes={[
              `${fmtInt(f.coorteNovas)} ${f.coorteNovas === 1 ? 'nova' : 'novas'} no período`,
              d.exatidaoAtendidas === 'banda_5pct' && 'exato a ±5%',
            ]} />}
            variacao={{ atual: f.atendidasSessoes, anterior: a?.atendidasSessoes ?? null }} />
          <Cartao rotulo="Qualificadas" ajuda={AJUDA_QUALIFICADAS} n={fmtInt(f.qualificadas)}
            sub={<Legenda partes={[`${fmtInt(f.reprovadas)} não passaram`]} />}
            variacao={{ atual: f.qualificadas, anterior: a?.qualificadas ?? null }} />
          <Cartao rotulo="Propostas" ajuda={AJUDA_PROPOSTAS} n={fmtInt(f.propostasPortab)}
            sub="portabilidade, por evento"
            variacao={{ atual: f.propostasPortab, anterior: a?.propostasPortab ?? null }} />
          <Cartao rotulo="Aceitaram" n={fmtInt(f.aceiteSim)}
            sub={<Legenda partes={[
              f.aceiteDuvida > 0 && `${fmtInt(f.aceiteDuvida)} com dúvida`,
              f.aceiteNao > 0 && `${fmtInt(f.aceiteNao)} ${f.aceiteNao === 1 ? 'recusou' : 'recusaram'}`,
            ]} />}
            variacao={{ atual: f.aceiteSim, anterior: a?.aceiteSim ?? null }} />
          <Cartao rotulo="Documentação completa" ajuda={AJUDA_DOCS} n={fmtInt(f.docsCompletos)}
            sub={<Legenda partes={[
              `${fmtInt(f.docsCompletosEstrito)} com comprovante de verdade`,
              `${fmtInt(f.docsAlgum)} mandaram algum documento`,
            ]} />}
            variacao={{ atual: f.docsCompletos, anterior: a?.docsCompletos ?? null }} />
          <Cartao rotulo="Fechou" ajuda={AJUDA_FECHOU} n={fmtInt(f.docsCompletos)} destaque
            sub={<Legenda partes={[
              `${fmtInt(f.fechouAceite)} com aceite explícito`,
              f.atendidasSessoes > 0 && `${fmtPct(pctDe(f.docsCompletos, f.atendidasSessoes))} das atendidas`,
            ]} />}
            variacao={{ atual: f.docsCompletos, anterior: a?.docsCompletos ?? null }} />
          <Cartao rotulo="Tempo até fechar" ajuda={AJUDA_TEMPO}
            n={d.tempo.medianaMin != null ? fmtDuracaoMin(d.tempo.medianaMin) : '—'}
            sub={d.tempo.n > 0
              ? <Legenda partes={[`90% em até ${fmtDuracaoH(d.tempo.p90H)}`, `${fmtInt(d.tempo.n)} ${d.tempo.n === 1 ? 'caso' : 'casos'}`]} />
              : 'sem fechamento no período'} />
        </div>
      </Secao>

      <Secao className="d5-ondas d5-ondas-iris" titulo="Ondas da Iris"
        sub={`Atendidas, qualificadas e documentação completa por ${balde === 'dia' ? 'dia' : 'semana (seg–dom)'}.`}>
        <LegendaGraf series={series} />
        <GrafLinhas baldes={baldes} series={series}
          titulo={`Funil da Iris por ${balde === 'dia' ? 'dia' : 'semana'}`}
          vazio="Sem movimento da Iris neste período." />
      </Secao>

      <div className="d5-linha2 d5-iris-linha">
        <Secao className="d5-iris-faltas" titulo="O que falta de documento" ajuda={AJUDA_DOCS}
          sub={fa.universo > 0
            ? `${fmtInt(fa.universo)} clientes na coleta sem completar, agora (proposta na mão e documentação aberta).`
            : undefined}>
          {fa.universo === 0 ? (
            <Vazio texto="Ninguém com documentação aberta agora." />
          ) : (
            <ul className="d5-par-funil d5-faltas" aria-label="Documentos que faltam">
              {faltasLista.map((x) => (
                <li key={x.r} className={x.sub ? 'd5-par-sub' : undefined}>
                  <span className="d5-par-rot">{x.r}</span>
                  <span className="d5-trilho" aria-hidden><i style={{ width: `${Math.max(3, (x.n / maxFalta) * 100)}%` }} /></span>
                  <b className="num">{fmtInt(x.n)}</b>
                </li>
              ))}
            </ul>
          )}
        </Secao>

        <Secao className="d5-iris-camp" titulo="Iris por campanha"
          sub="Sessões novas no período e documentação completa, pela campanha do cliente.">
          {d.porCampanha.length === 0 ? (
            <Vazio texto="Sem sessões no período." />
          ) : (
            <div className="d5-tab-rolo">
              <table className="d5-tab d5-tab-iriscamp">
                <thead>
                  <tr>
                    <th scope="col">Campanha</th>
                    <th scope="col" className="d5-dir">Sessões novas</th>
                    <th scope="col" className="d5-dir">Documentação completa</th>
                  </tr>
                </thead>
                <tbody>
                  {d.porCampanha.map((c) => (
                    <tr key={c.campanha}>
                      <th scope="row" className="d5-nome"><b>{rotuloCampanha(c.campanha)}</b></th>
                      <td className="d5-dir"><b className={'num' + (c.sessoes ? '' : ' d5-mudo')}>{fmtInt(c.sessoes)}</b></td>
                      <td className="d5-dir"><b className={'num' + (c.docsCompletos ? '' : ' d5-mudo')}>{fmtInt(c.docsCompletos)}</b></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {etapas.length > 0 && (
            <div className="d5-etapas">
              <span className="d5-etapas-t">Onde as conversas dela estão agora:</span>
              <Legenda partes={etapas.map((e) => `${e.rotulo} ${fmtInt(e.n)}`)} />
            </div>
          )}
        </Secao>
      </div>
    </>
  );
}

export function IrisAbaSkeleton() {
  return (
    <Secao className="d5-iris-funil" titulo="Funil da Iris">
      <div className="d5-sk-linhas" aria-hidden>
        {Array.from({ length: 3 }, (_, i) => <Skeleton key={i} altura={72} raio={10} />)}
      </div>
    </Secao>
  );
}
