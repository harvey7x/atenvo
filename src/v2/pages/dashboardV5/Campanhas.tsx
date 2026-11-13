import { useMemo, useState } from 'react';
import type { CampanhasV5, QuadroJanelaV5, ResumoCampanhaV5 } from '@/data/dashboardV5.abas.tipos';
import { CAMPANHAS_GRAF, rotuloCampanha } from '@/data/dashboardV5.abas.tipos';
import {
  baldesDe, fimComHoje, leituraOnda, melhorCampanha, somarEmBaldes, type Balde, type BaldeTipo,
} from '@/data/dashboardV5.series';
import { fmtDuracaoH, fmtInt, fmtPct, pctDe, rotuloMotivoNe } from '@/data/dashboardV5.formato';
import { janelaMapaV5 } from '@/data/dashboardV5.periodo';
import type { Periodo } from '@/data/relatorios';
import { Skeleton } from '../../components';
import { Ajuda, Legenda, Secao, Variacao, Vazio } from './comum';
import { GrafLinhas, LegendaGraf, useLinhasGraf, type NotaSerie, type SerieGraf } from './GrafLinhas';

/* Aba CAMPANHAS (12/11): o melhor do dia/semana/mês, as ondas por campanha
   (alternáveis dia · semana · mês CAF), a tabela do período, quem chegou já tendo
   conversa com a gente (retornos) e os recuperados pelo parente. FECHADO = pódio
   do CAF (o mesmo placar); cada bloco declara a régua e as limitações. */

type MetricaOnda = 'entradas' | 'ganhos' | 'ne';
const METRICAS: { valor: MetricaOnda; rotulo: string }[] = [
  { valor: 'entradas', rotulo: 'Entradas' },
  { valor: 'ganhos', rotulo: 'Fechados' },
  { valor: 'ne', rotulo: 'Não elegíveis' },
];
const BALDES: { valor: BaldeTipo; rotulo: string }[] = [
  { valor: 'dia', rotulo: 'Por dia' },
  { valor: 'semana', rotulo: 'Por semana' },
  { valor: 'mes', rotulo: 'Por mês' },
];

/** Seletor compacto do topo do cartão (o "This Year ⌄" da referência): select nativo,
 *  acessível, com a seta desenhada por cima. */
function Seletor<V extends string>({ valor, opcoes, aoMudar, rotulo }: {
  valor: V; opcoes: { valor: V; rotulo: string }[]; aoMudar: (v: V) => void; rotulo: string;
}) {
  return (
    <label className="d5-sel">
      <span className="d5-sr">{rotulo}</span>
      <select value={valor} onChange={(e) => aoMudar(e.target.value as V)}>
        {opcoes.map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
      </select>
      <svg viewBox="0 0 12 12" width="10" height="10" aria-hidden>
        <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </label>
  );
}

const AJUDA_FECHADOS = 'Fechado = caso completo no sistema do administrativo (a régua do placar do CAF), '
  + 'pelo número por onde o cliente entrou. Parceiros e casos tirados da conta não pontuam; fim de semana '
  + 'e feriado mostram 0 porque o administrativo lança em dia útil. Números passados podem mudar ao re-sincronizar.';
const AJUDA_MELHOR = 'Melhor do dia = mais entradas (fechados do dia só aparecem quando o administrativo lança). '
  + 'Melhor da semana e do mês = mais fechados do placar, desempate por entradas. A comparação é com o período '
  + 'anterior cortado no mesmo ponto.';
const AJUDA_RETORNOS = 'Clientes que mandaram a mensagem do anúncio mas JÁ ESTAVAM no sistema. "De qual campanha" '
  + 'é o número da primeira conversa deles (aquisição). A atribuição por número é exata só nos últimos 14 dias '
  + '(retenção dos eventos do WhatsApp); quem volta escrevendo direto, sem o texto do anúncio, não é contado.';
const AJUDA_ONDAS = 'Cada ponto é o número exato do dia (ou da semana, ou do mês da casa); a curva só liga '
  + 'os pontos — nada é inventado entre eles. Clique no nome de uma campanha para esconder ou mostrar a linha '
  + '(a escala se ajusta). Com período curto o gráfico mostra os últimos 7 dias para dar contexto; as tabelas '
  + 'abaixo continuam só no período escolhido. Ao lado do nome: cresceu ou caiu no último dia/semana fechado, '
  + 'e "parou e voltou" quando a campanha zerou e retomou dentro do desenho.';
const AJUDA_PARENTE = 'Clientes que disseram que NÃO recebem INSS, mas um parente recebe — o atendimento seguiu '
  + 'pelo benefício do parente. Conta "algum parente" (pai ou mãe especificamente não fica registrado). O dia de '
  + 'hoje cresce ao longo do dia: a resposta sobre o parente vem depois da entrada.';

/* ---------------- quadro: melhor do dia / semana / mês ---------------- */
function CartaoQuadro({ titulo, quadro, metrica, comparacao }: {
  titulo: string; quadro: QuadroJanelaV5; metrica: 'entradas' | 'ganhos'; comparacao: string;
}) {
  const soCampanhas = (l: ResumoCampanhaV5[]) => l.filter((x) => !['outros', 'sem_campanha'].includes(x.campanha));
  const atual = soCampanhas(quadro.atual);
  const melhor = metrica === 'ganhos'
    ? melhorCampanha(atual, (x) => x.ganhos, (x) => x.entradas)
    : melhorCampanha(atual, (x) => x.entradas, (x) => x.ganhos);
  // semana/mês sem fechado lançado ainda (fim de semana): cai para entradas, dizendo isso
  const caiu = metrica === 'ganhos' && !melhor;
  const vence = caiu ? melhorCampanha(atual, (x) => x.entradas, (x) => x.ganhos) : melhor;
  const usa: 'entradas' | 'ganhos' = caiu ? 'entradas' : metrica;
  const ant = soCampanhas(quadro.anterior).find((x) => x.campanha === vence?.campanha);
  return (
    <div className="d5-qd">
      <span className="d5-qd-t">{titulo}</span>
      {vence ? (
        <>
          <b className="d5-qd-camp">{rotuloCampanha(vence.campanha)}</b>
          <span className="d5-qd-n num">
            {fmtInt(usa === 'ganhos' ? vence.ganhos : vence.entradas)}
            <small> {usa === 'ganhos' ? (vence.ganhos === 1 ? 'fechado' : 'fechados') : 'entradas'}</small>
          </span>
          <small className="d5-qd-sub num">
            <Legenda partes={[
              usa === 'ganhos' ? `${fmtInt(vence.entradas)} entradas` : caiu ? 'sem fechados lançados ainda' : `${fmtInt(vence.ganhos)} fechados`,
              vence.ne > 0 && `${fmtInt(vence.ne)} NE`,
            ]} />
          </small>
          <Variacao atual={usa === 'ganhos' ? vence.ganhos : vence.entradas}
            anterior={ant ? (usa === 'ganhos' ? ant.ganhos : ant.entradas) : 0}
            sentido="maior" comparacao={comparacao} />
        </>
      ) : <span className="d5-mudo">Sem movimento ainda.</span>}
    </div>
  );
}

/* ---------------- a aba ---------------- */
export function Campanhas({ d, periodo, hoje }: { d: CampanhasV5; periodo: Periodo; hoje: string }) {
  const [metrica, setMetrica] = useState<MetricaOnda>('entradas');
  const [balde, setBalde] = useState<BaldeTipo>(() => (periodo.dias <= 14 ? 'dia' : 'semana'));
  const linhas = useLinhasGraf();

  const campanhas = d.campanhas.filter((c) => !['outros', 'sem_campanha'].includes(c.campanha));
  const resto = d.campanhas.filter((c) => ['outros', 'sem_campanha'].includes(c.campanha));
  const antPor = useMemo(() => new Map(d.anterior.map((a) => [a.campanha, a])), [d.anterior]);

  // período curto desenha os ÚLTIMOS 7 DIAS (a régua do mapa): um dia só não faz onda
  const jm = useMemo(() => janelaMapaV5(periodo, hoje), [periodo, hoje]);
  const { baldes, series } = useMemo(() => {
    const bs: Balde[] = baldesDe(jm.iniDate, fimComHoje(periodo.fimDate, hoje), balde);
    const fechados = bs.filter((b) => b.fim <= hoje).length;
    const ativos = CAMPANHAS_GRAF.filter((c) => d.serie.some((p) => p.campanha === c.slug)
      || campanhas.some((x) => x.campanha === c.slug));
    const ss: SerieGraf[] = ativos.map((c) => {
      const valores = somarEmBaldes(
        d.serie.filter((p) => p.campanha === c.slug).map((p) => ({ dia: p.dia, valor: p[metrica] })),
        balde,
      );
      // cresceu / caiu / parou e voltou: a leitura vai ao lado do nome, na legenda
      const l = leituraOnda(c.slug, bs.map((b) => valores.get(b.chave) ?? 0), fechados);
      const notas: NotaSerie[] = [];
      if (l.tendencia === 'cresceu') notas.push({ texto: 'cresceu', tom: 'ok' });
      if (l.tendencia === 'caiu') notas.push({ texto: 'caiu', tom: 'er' });
      if (l.recaida) notas.push({ texto: 'parou e voltou', tom: 'am' });
      return { id: c.slug, rotulo: rotuloCampanha(c.slug), cor: c.cor, valores, notas };
    });
    return { baldes: bs, series: ss };
  }, [d.serie, campanhas, periodo, balde, metrica, hoje, jm]);

  const tituloMetrica = METRICAS.find((m) => m.valor === metrica)!.rotulo;
  const avisoRetencao = d.retornosConfiavelDesde !== '' && periodo.iniDate < d.retornosConfiavelDesde;
  const comRetornos = [...campanhas].filter((c) => c.peloAnuncio > 0).sort((a, b) => b.retornos - a.retornos);
  const pf = d.parente.funil;
  const pd = d.parente.desfecho;
  const motivoTop = (m: Record<string, number>) => Object.entries(m).sort((a, b) => b[1] - a[1])[0];

  return (
    <>
      <Secao className="d5-quadro" titulo="Melhor campanha" ajuda={AJUDA_MELHOR}
        sub="Hoje por entradas; semana e mês pelo placar de fechados. Sempre os quadros de agora, independentes do período escolhido acima.">
        <div className="d5-qds">
          <CartaoQuadro titulo="Hoje" quadro={d.quadro.dia} metrica="entradas" comparacao="vs ontem, mesmo horário" />
          <CartaoQuadro titulo="Esta semana (seg–dom)" quadro={d.quadro.semana} metrica="ganhos" comparacao="vs semana passada, mesmo ponto" />
          <CartaoQuadro titulo="Nosso mês (11 a 10)" quadro={d.quadro.mes} metrica="ganhos" comparacao="vs mês anterior, mesmo ponto" />
        </div>
      </Secao>

      <Secao className="d5-ondas" titulo="Ondas por campanha" ajuda={AJUDA_ONDAS}
        sub={`${tituloMetrica} por ${balde === 'dia' ? 'dia' : balde === 'semana' ? 'semana' : 'mês da casa'}${jm.estendido ? ' · últimos 7 dias' : ''}`}
        acao={(
          <div className="d5-ondas-ctl">
            <LegendaGraf series={series} controle={linhas} />
            <span className="d5-ondas-sels">
              <Seletor<MetricaOnda> opcoes={METRICAS} valor={metrica} aoMudar={setMetrica} rotulo="O que o gráfico mostra" />
              <Seletor<BaldeTipo> opcoes={BALDES} valor={balde} aoMudar={setBalde} rotulo="Agrupar o gráfico" />
            </span>
          </div>
        )}>
        <GrafLinhas baldes={baldes} series={series} controle={linhas}
          titulo={`${tituloMetrica} por campanha e ${balde === 'dia' ? 'dia' : balde === 'semana' ? 'semana' : 'mês'}`}
          vazio="Sem movimento para desenhar neste período."
          rodape={metrica === 'ganhos'
            ? 'Fechados entram quando o administrativo lança (dias úteis): fim de semana e feriado aparecem zerados.'
            : undefined} />
      </Secao>

      <Secao className="d5-camp-tab" titulo="Campanhas no período" ajuda={AJUDA_FECHADOS}
        sub="Entradas, fechados do placar e não elegíveis pela campanha do número por onde o cliente entrou.">
        {campanhas.length === 0 ? (
          <Vazio texto="Sem movimento de campanha neste período." />
        ) : (
          <div className="d5-tab-rolo">
            <table className="d5-tab d5-tab-camp">
              <thead>
                <tr>
                  <th scope="col">Campanha</th>
                  <th scope="col" className="d5-dir">Entradas</th>
                  <th scope="col" className="d5-dir">Fechados</th>
                  <th scope="col" className="d5-dir">Não elegíveis</th>
                  <th scope="col" className="d5-dir">
                    <span className="d5-th-ajuda"><Ajuda rotulo="Recuperados pelo parente" texto={AJUDA_PARENTE} /><span>Pelo parente</span></span>
                  </th>
                  <th scope="col" className="d5-dir">Já eram nossos</th>
                </tr>
              </thead>
              <tbody>
                {[...campanhas, ...resto].map((c) => {
                  const ant = antPor.get(c.campanha);
                  const topo = motivoTop(c.neMotivos);
                  return (
                    <tr key={c.campanha}>
                      <th scope="row" className="d5-nome">
                        <span className="d5-cel2">
                          <b>{rotuloCampanha(c.campanha)}</b>
                          {c.canais.length > 0 && (
                            <small>{c.canais.length === 1 ? c.canais[0].nome : `${c.canais.length} números`}</small>
                          )}
                        </span>
                      </th>
                      <td className="d5-dir">
                        <span className="d5-cel2 d5-cel2-dir">
                          <b className={'num' + (c.entradas ? '' : ' d5-mudo')}>{fmtInt(c.entradas)}</b>
                          {ant && <Variacao atual={c.entradas} anterior={ant.entradas} sentido="maior" comparacao="vs anterior" />}
                        </span>
                      </td>
                      <td className="d5-dir">
                        <span className="d5-cel2 d5-cel2-dir">
                          <b className={'num' + (c.ganhos ? '' : ' d5-mudo')}>{fmtInt(c.ganhos)}</b>
                          {c.fechN > 0 && <small className="num">mediana {fmtDuracaoH(c.fechMedianaH)}</small>}
                        </span>
                      </td>
                      <td className="d5-dir">
                        <span className="d5-cel2 d5-cel2-dir">
                          <b className={'num' + (c.ne ? '' : ' d5-mudo')}>{fmtInt(c.ne)}</b>
                          {topo && <small>{rotuloMotivoNe(topo[0])}: <span className="num">{fmtInt(topo[1])}</span></small>}
                        </span>
                      </td>
                      <td className="d5-dir"><b className={'num' + (c.parenteRec ? '' : ' d5-mudo')}>{fmtInt(c.parenteRec)}</b></td>
                      <td className="d5-dir">
                        <span className="d5-cel2 d5-cel2-dir">
                          <b className={'num' + (c.retornos ? '' : ' d5-mudo')}>{fmtInt(c.retornos)}</b>
                          {c.retornos > 0 && <small className="num">{fmtPct(pctDe(c.retornos, c.peloAnuncio))} do anúncio</small>}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Secao>

      <Secao className="d5-retcamp" titulo="Chegaram pela campanha, mas já eram nossos" ajuda={AJUDA_RETORNOS}
        sub="Quem mandou a mensagem do anúncio já tendo conversa no sistema — e por qual campanha tinha entrado antes.">
        {avisoRetencao && (
          <p className="d5-aviso" role="status">
            O período escolhido recua além de {d.retornosConfiavelDesde.slice(8, 10)}/{d.retornosConfiavelDesde.slice(5, 7)}: antes disso a
            atribuição por número perde exatidão (retenção de 14 dias dos eventos do WhatsApp).
          </p>
        )}
        {comRetornos.length === 0 ? (
          <Vazio texto="Nenhuma mensagem de anúncio no período." />
        ) : (
          <div className="d5-tab-rolo">
            <table className="d5-tab d5-tab-ret">
              <thead>
                <tr>
                  <th scope="col">Campanha</th>
                  <th scope="col" className="d5-dir">Pelo anúncio</th>
                  <th scope="col" className="d5-dir">Já eram nossos</th>
                  <th scope="col" className="d5-dir">Da própria · de outra</th>
                  <th scope="col" className="d5-dir">De onde vieram</th>
                </tr>
              </thead>
              <tbody>
                {comRetornos.map((c) => (
                  <tr key={c.campanha}>
                    <th scope="row" className="d5-nome"><b>{rotuloCampanha(c.campanha)}</b></th>
                    <td className="d5-dir"><b className="num">{fmtInt(c.peloAnuncio)}</b></td>
                    <td className="d5-dir">
                      <span className="d5-cel2 d5-cel2-dir">
                        <b className={'num' + (c.retornos ? '' : ' d5-mudo')}>{fmtInt(c.retornos)}</b>
                        {c.retornos > 0 && <small className="num">{fmtPct(pctDe(c.retornos, c.peloAnuncio))}</small>}
                      </span>
                    </td>
                    <td className="d5-dir">
                      {c.retornos > 0
                        ? <span className="num">{fmtInt(c.retornosMesma)} · {fmtInt(c.retornos - c.retornosMesma)}</span>
                        : <span className="d5-mudo">—</span>}
                    </td>
                    <td className="d5-dir">
                      {c.retornosOrigens.length
                        ? (
                          <span className="d5-ret-origens">
                            <Legenda partes={c.retornosOrigens.slice(0, 3).map((o) => `${rotuloCampanha(o.campanha)} ${fmtInt(o.n)}`)} />
                          </span>
                        )
                        : <span className="d5-mudo">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Secao>

      <Secao className="d5-parente" titulo="Recuperados pelo parente" ajuda={AJUDA_PARENTE}
        sub="Não recebiam INSS, mas o benefício de um parente segurou o atendimento — pela criação da sessão no período.">
        {pf.semBeneficio === 0 ? (
          <Vazio texto="Ninguém caiu nessa pergunta no período." />
        ) : (
          <>
            <div className="d5-par-topo">
              <div className="d5-qd d5-par-total">
                <span className="d5-qd-t">Recuperados</span>
                <b className="d5-qd-n num">{fmtInt(d.parente.total)}</b>
                <small className="d5-qd-sub num">de {fmtInt(pf.semBeneficio)} sem benefício próprio ({fmtPct(pctDe(d.parente.total, pf.semBeneficio))})</small>
              </div>
              <ul className="d5-par-funil" aria-label="O que respondeu quem não recebe INSS">
                {[
                  { r: 'Um parente recebe', n: pf.familiarSim, on: true },
                  { r: 'Parente também não', n: pf.familiarNao },
                  { r: 'Não respondeu', n: pf.semResposta },
                  { r: 'Virou NE pelo tempo (30 min)', n: pf.neTimer, dentro: true },
                ].map((x) => (
                  <li key={x.r} className={x.dentro ? 'd5-par-sub' : undefined}>
                    <span className="d5-par-rot">{x.r}</span>
                    <span className="d5-trilho" aria-hidden><i className={x.on ? 'd5-par-on' : undefined}
                      style={{ width: `${pf.semBeneficio ? Math.max(x.n ? 3 : 0, (x.n / pf.semBeneficio) * 100) : 0}%` }} /></span>
                    <b className="num">{fmtInt(x.n)}</b>
                  </li>
                ))}
              </ul>
            </div>
            <div className="d5-par-desf">
              <span className="d5-par-desf-t">Como esses {fmtInt(d.parente.total)} estão hoje:</span>
              <Legenda partes={[
                <span key="g"><b className="num">{fmtInt(pd.ganho)}</b> {pd.ganho === 1 ? 'fechado' : 'fechados'}</span>,
                <span key="a"><b className="num">{fmtInt(pd.emAndamento)}</b> em andamento</span>,
                <span key="p">
                  <b className="num">{fmtInt(pd.perdido)}</b> perdidos
                  {motivoTop(pd.perdidoMotivos) && <> (maior motivo: {rotuloMotivoNe(motivoTop(pd.perdidoMotivos)![0])})</>}
                </span>,
                pd.semOpp > 0 && <span key="s"><b className="num">{fmtInt(pd.semOpp)}</b> sem ficha</span>,
                d.parente.neDesfeito > 0 && <span key="n">NE desfeito pelo cliente: <b className="num">{fmtInt(d.parente.neDesfeito)}</b></span>,
              ]} />
            </div>
            {d.parente.serie.length > 1 && (
              <GrafLinhas
                baldes={baldesDe(periodo.iniDate, fimComHoje(periodo.fimDate, hoje), periodo.dias <= 14 ? 'dia' : 'semana')}
                series={[{
                  id: 'parente', rotulo: 'Recuperados', cor: 'var(--dado-3)',
                  valores: somarEmBaldes(d.parente.serie.map((p) => ({ dia: p.dia, valor: p.n })), periodo.dias <= 14 ? 'dia' : 'semana'),
                }]}
                titulo="Recuperados pelo parente por dia" vazio="" altura={176}
                rodape="O dia de hoje cresce ao longo do dia: a resposta sobre o parente vem depois da entrada." />
            )}
          </>
        )}
      </Secao>
    </>
  );
}

export function CampanhasSkeleton() {
  return (
    <>
      <Secao className="d5-quadro" titulo="Melhor campanha">
        <div className="d5-sk-linhas" aria-hidden>
          {Array.from({ length: 3 }, (_, i) => <Skeleton key={i} altura={72} raio={10} />)}
        </div>
      </Secao>
      <Secao className="d5-ondas" titulo="Ondas por campanha">
        <div className="d5-sk-linhas" aria-hidden><Skeleton altura={220} raio={10} /></div>
      </Secao>
    </>
  );
}
