import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Periodo } from '@/data/relatorios';
import {
  custoPor, fmtReais, melhorCampanha, taxa, type CampanhaAnuncio, type DashAnuncios,
} from '@/data/anuncios';
import { fmtInt, fmtPct } from '@/data/dashboardV5.formato';
import { BotaoPrimario, BotaoSec, CardVidro, Skeleton } from '../../components';
import { CartaoMetrica, CartaoSeries, GradeMetricas, diaDoBalao, type SeriesPoint } from '../../components/CartaoMetrica';
import { Ajuda, Secao, Variacao, Vazio } from './comum';
import './anunciosAba.css';

/* Aba ANÚNCIOS do Dashboard (dono 25/11, a partir do sistema que a Reviza usava antes: "conectar o
   Facebook para ver qual campanha tá rodando melhor"). O período é o do topo do Dashboard.
   Quatro números (investido, leads, custo por lead, fechados), a campanha que está rodando melhor,
   os leads por dia empilhados por campanha (barras — regra da casa), a tabela das campanhas, os
   anúncios que mais trouxeram gente e o rastreio cliente a cliente. Sem a conta de anúncios conectada
   os leads e os fechados aparecem (vêm do WhatsApp); o que é dinheiro fica "—" com o caminho para
   conectar. Dados: @/data/anuncios (demo = mesma forma). */

const AJ = {
  investido: 'O que a Meta cobrou pelos anúncios no período, lido da conta de anúncios conectada (atualiza de hora em hora).',
  leads: 'Clientes que começaram a conversa tocando no botão "Enviar mensagem" de um anúncio do Facebook ou do Instagram (o WhatsApp manda junto qual foi o anúncio). Quem copiou o texto do anúncio e escreveu direto não aparece aqui: conta nas entradas da Visão geral.',
  cpl: 'Investido ÷ leads. Quanto custou, em média, cada cliente que chamou pelo anúncio.',
  fechados: 'Desses leads, quantos chegaram à etapa de fechado no Kanban. O custo por fechado é o investido ÷ fechados.',
  melhor: 'Entre as campanhas ATIVAS que trouxeram pelo menos 10 leads no período (com poucos leads o custo baixo pode ser sorte), a de MENOR custo por lead. Empate: a que fechou mais.',
  rastreio: 'Cada cliente que chegou por anúncio no período, do mais novo para o mais antigo, com a etapa e o responsável de hoje.',
};
type Ordem = 'leads' | 'cpl' | 'fechados' | 'investido';
const ORDENS: { valor: Ordem; rotulo: string }[] = [
  { valor: 'leads', rotulo: 'Mais leads' }, { valor: 'cpl', rotulo: 'Menor custo por lead' },
  { valor: 'fechados', rotulo: 'Mais fechados' }, { valor: 'investido', rotulo: 'Mais investido' },
];
const SITUACAO: Record<CampanhaAnuncio['situacao'], string> = { ativa: 'Ativa', pausada: 'Pausada', encerrada: 'Encerrada' };
const IcFace = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
  </svg>
);
const quando = (iso: string | null) => {
  if (!iso) return null;
  const min = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (!Number.isFinite(min)) return null;
  if (min < 2) return 'agora mesmo';
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  return h < 24 ? `há ${h} h` : new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' });
};
const dataHora = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }).replace(',', '');

function Seletor<V extends string>({ valor, opcoes, aoMudar, rotulo }: { valor: V; opcoes: { valor: V; rotulo: string }[]; aoMudar: (v: V) => void; rotulo: string }) {
  return (
    <label className="d5-sel">
      <span className="d5-sr">{rotulo}</span>
      <select value={valor} onChange={(e) => aoMudar(e.target.value as V)}>
        {opcoes.map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
      </select>
      <svg viewBox="0 0 12 12" width="10" height="10" aria-hidden><path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </label>
  );
}

export function AnunciosAba({ d, periodo, hoje, comparacao }: { d: DashAnuncios; periodo: Periodo; hoje: string; comparacao: string }) {
  const ir = useNavigate();
  const [ordem, setOrdem] = useState<Ordem>('leads');
  const [filtroCamp, setFiltroCamp] = useState<string>('todas');
  const [verTodos, setVerTodos] = useState(false);
  const conectado = d.conectado;
  const tot = d.totais; const ant = d.anterior;
  const cpl = custoPor(tot.investido, tot.leads); const cplAnt = ant ? custoPor(ant.investido, ant.leads) : null;
  const cpf = custoPor(tot.investido, tot.fechados);
  const melhor = conectado ? melhorCampanha(d.campanhas) : null;

  const serie = (f: (x: DashAnuncios['porDia'][number]) => number): SeriesPoint[] => d.porDia.map((x) => ({ date: x.dia, value: f(x) }));
  const sInv = useMemo(() => serie((x) => x.investido), [d]); // eslint-disable-line react-hooks/exhaustive-deps
  const sLeads = useMemo(() => serie((x) => x.leads), [d]); // eslint-disable-line react-hooks/exhaustive-deps
  const sCpl = useMemo(() => serie((x) => (x.leads > 0 ? x.investido / x.leads : 0)), [d]); // eslint-disable-line react-hooks/exhaustive-deps
  const sFech = useMemo(() => serie((x) => x.fechados), [d]); // eslint-disable-line react-hooks/exhaustive-deps

  const campanhas = useMemo(() => {
    const val = (c: CampanhaAnuncio) => (ordem === 'leads' ? -c.leads : ordem === 'fechados' ? -c.fechados : ordem === 'investido' ? -c.investido : (custoPor(c.investido, c.leads) ?? Infinity));
    // campanha sem lead e sem investimento no período (pausada antes dele) não entra na tabela
    return d.campanhas.filter((c) => c.leads > 0 || c.investido > 0).sort((a, b) => val(a) - val(b) || b.leads - a.leads);
  }, [d.campanhas, ordem]);
  const maxLeadsCamp = Math.max(1, ...d.campanhas.map((c) => c.leads));
  const topAnuncios = d.anuncios.filter((x) => x.leads > 0).slice(0, 8);
  const maxLeadsAn = Math.max(1, ...topAnuncios.map((x) => x.leads));
  const leadsFiltrados = d.leads.filter((l) => filtroCamp === 'todas' || l.campanhaId === filtroCamp);
  const leadsVisiveis = verTodos ? leadsFiltrados : leadsFiltrados.slice(0, 25);

  // ondas: leads por dia empilhados pelas 5 campanhas que mais trouxeram
  const top5 = d.campanhas.slice().sort((a, b) => b.leads - a.leads).slice(0, 5);
  const pontos = d.porDia.map((x) => ({ chave: x.dia, rotulo: diaDoBalao(x.dia, hoje) }));
  const eixo = d.porDia.map((x) => x.dia.slice(8, 10) + '/' + x.dia.slice(5, 7));
  const seriesOnda = top5.map((c, i) => ({ id: c.id, rotulo: c.nome, cor: `var(--dado-${i + 1})`, valores: new Map(d.porDia.map((x) => [x.dia, x.porCampanha[c.id] ?? 0])) }));

  const reais = (v: number) => fmtReais(v);
  const palavra = (um: string, varios: string) => (v: number) => `${fmtInt(v)} ${v === 1 ? um : varios}`;
  const cab = (titulo: string, ajuda: string) => <span className="rvm-tit rvm-tit-ajuda">{titulo}<Ajuda texto={ajuda} rotulo={titulo} /></span>;
  const comuns = { formatarData: (dia: string) => diaDoBalao(dia, hoje), variacao: false as const };
  const semConta = <span className="d5-an-sem">Conecte a conta de anúncios para ver</span>;

  return (
    <div className="d5-an" data-aba-anuncios>
      {!conectado ? (
        <CardVidro className="d5-an-conectar">
          <span className="ic" aria-hidden><IcFace /></span>
          <div className="tx">
            <b>Conecte a conta de anúncios do Facebook</b>
            <span>Os leads e os fechados abaixo já vêm do WhatsApp. Com a conta conectada aparecem também quanto foi investido, o custo de cada lead e qual campanha está rodando melhor.</span>
          </div>
          <BotaoPrimario onClick={() => ir('/config/integracoes/anuncios')}>Conectar</BotaoPrimario>
        </CardVidro>
      ) : (
        <p className="d5-an-conta">
          <span className="ic" aria-hidden><IcFace /></span>
          <span>{d.conta?.nome ?? 'Conta de anúncios'}</span>
          {d.sincronizadoEm && <span className="q">· gasto atualizado {quando(d.sincronizadoEm)}</span>}
          <button type="button" className="lk" onClick={() => ir('/config/integracoes/anuncios')}>Gerenciar</button>
        </p>
      )}

      <div className="rvm-bloco">
        <GradeMetricas rotulo="Anúncios no período">
          <CartaoMetrica icone="moeda" titulo="Investido" cabEsquerda={cab('Investido', AJ.investido)} data={sInv}
            total={conectado ? fmtReais(tot.investido) : '—'} tom="neutro" formatar={reais} {...comuns}
            rodape={conectado ? <Variacao atual={tot.investido} anterior={ant?.investido} sentido="neutro" comparacao={comparacao} /> : semConta} />
          <CartaoMetrica icone="entra" titulo="Leads pelo anúncio" cabEsquerda={cab('Leads pelo anúncio', AJ.leads)} data={sLeads}
            total={fmtInt(tot.leads)} tom={ant && tot.leads !== ant.leads ? (tot.leads > ant.leads ? 'bom' : 'ruim') : 'neutro'} formatar={palavra('lead', 'leads')} {...comuns}
            rodape={<Variacao atual={tot.leads} anterior={ant?.leads} sentido="maior" comparacao={comparacao} />} />
          <CartaoMetrica icone="porcento" titulo="Custo por lead" cabEsquerda={cab('Custo por lead', AJ.cpl)} data={conectado ? sCpl : sCpl.map((p) => ({ ...p, value: 0 }))}
            total={conectado ? fmtReais(cpl) : '—'} tom={conectado && cpl != null && cplAnt != null && cpl !== cplAnt ? (cpl < cplAnt ? 'bom' : 'ruim') : 'neutro'} formatar={reais} {...comuns}
            rodape={conectado && cpl != null ? <Variacao atual={cpl} anterior={cplAnt ?? undefined} sentido="menor" comparacao={comparacao} /> : semConta} />
          <CartaoMetrica icone="trofeu" titulo="Fechados" cabEsquerda={cab('Fechados', AJ.fechados)} data={sFech}
            total={fmtInt(tot.fechados)} tom={ant && tot.fechados !== ant.fechados ? (tot.fechados > ant.fechados ? 'bom' : 'ruim') : 'neutro'} formatar={palavra('fechado', 'fechados')} {...comuns}
            numSub={conectado && cpf != null ? <span>{fmtReais(cpf)} por fechado</span> : undefined}
            rodape={<Variacao atual={tot.fechados} anterior={ant?.fechados} sentido="maior" comparacao={comparacao} />} />
        </GradeMetricas>
      </div>

      {melhor && (
        <CardVidro className="d5-an-melhor" role="note">
          <span className="selo">Rodando melhor<Ajuda texto={AJ.melhor} rotulo="Rodando melhor" /></span>
          <b className="nm">{melhor.nome}</b>
          <span className="nums">
            <span><b className="num">{fmtReais(custoPor(melhor.investido, melhor.leads))}</b> por lead</span>
            <span><b className="num">{fmtInt(melhor.leads)}</b> {melhor.leads === 1 ? 'lead' : 'leads'}</span>
            <span><b className="num">{fmtInt(melhor.fechados)}</b> {melhor.fechados === 1 ? 'fechado' : 'fechados'}</span>
            {cpl != null && <span className="cmp">o custo médio de todas é {fmtReais(cpl)}</span>}
          </span>
        </CardVidro>
      )}

      <CartaoSeries titulo="Leads por dia, por campanha" sub={periodo.dias < 7 ? 'Os últimos 7 dias, para dar para comparar' : undefined} pontos={pontos} series={seriesOnda} eixo={eixo}
        unidade={(q) => (q === 1 ? 'lead' : 'leads')} vazio="Nenhum lead de anúncio no período."
        rodape="Cada barra é o dia exato; as cores são as 5 campanhas que mais trouxeram leads." />

      <Secao titulo="Campanhas" sub={`${fmtInt(campanhas.length)} ${campanhas.length === 1 ? 'campanha' : 'campanhas'} com leads ou investimento no período`}
        acao={<Seletor valor={ordem} opcoes={ORDENS} aoMudar={setOrdem} rotulo="Ordenar campanhas" />}>
        {campanhas.length === 0 ? <Vazio texto="Nenhuma campanha no período." detalhe="Quando um anúncio trouxer um cliente, a campanha dele aparece aqui." /> : (
          <div className="d5-tab-rolo">
            <table className="d5-tab d5-an-tab">
              <thead>
                <tr>
                  <th scope="col">Campanha</th>
                  <th scope="col" className="d5-dir">Investido</th>
                  <th scope="col" className="d5-dir">Leads</th>
                  <th scope="col" className="d5-dir">Custo por lead</th>
                  <th scope="col" className="d5-dir">Fechados</th>
                  <th scope="col" className="d5-dir">Custo por fechado</th>
                  <th scope="col" className="d5-dir">Fecharam</th>
                </tr>
              </thead>
              <tbody>
                {campanhas.map((c) => (
                  <tr key={c.id} className={melhor?.id === c.id ? 'd5-an-on' : undefined}>
                    <th scope="row">
                      <span className="d5-an-camp">
                        <span className="nm">{c.nome}</span>
                        <span className="mt">{SITUACAO[c.situacao]} · {c.anuncios} {c.anuncios === 1 ? 'anúncio' : 'anúncios'}</span>
                        <span className="d5-an-barra" aria-hidden><i style={{ width: `${(c.leads / maxLeadsCamp) * 100}%` }} /></span>
                      </span>
                    </th>
                    <td className="d5-dir num">{conectado ? fmtReais(c.investido) : '—'}</td>
                    <td className="d5-dir num">{fmtInt(c.leads)}</td>
                    <td className="d5-dir num">{conectado ? fmtReais(custoPor(c.investido, c.leads)) : '—'}</td>
                    <td className="d5-dir num">{fmtInt(c.fechados)}</td>
                    <td className="d5-dir num">{conectado ? fmtReais(custoPor(c.investido, c.fechados)) : '—'}</td>
                    <td className="d5-dir num">{fmtPct(c.leads > 0 ? (taxa(c.fechados, c.leads) ?? 0) * 100 : null)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Secao>

      <Secao titulo="Anúncios que mais trouxeram clientes" sub="Os 8 anúncios com mais leads no período">
        {topAnuncios.length === 0 ? <Vazio texto="Nenhum anúncio trouxe lead no período." /> : (
          <ul className="d5-an-ads">
            {topAnuncios.map((x) => (
              <li key={x.id}>
                <span className="tx"><span className="nm">{x.nome}</span><span className="mt">{x.campanha}</span></span>
                <span className="d5-an-barra larga" aria-hidden><i style={{ width: `${(x.leads / maxLeadsAn) * 100}%` }} /></span>
                <span className="vl num"><b>{fmtInt(x.leads)}</b> {x.leads === 1 ? 'lead' : 'leads'}</span>
                <span className="vl num">{conectado ? <>{fmtReais(custoPor(x.investido, x.leads))} <small>por lead</small></> : <small>—</small>}</span>
              </li>
            ))}
          </ul>
        )}
      </Secao>

      <Secao titulo="Rastreio" ajuda={AJ.rastreio} sub="Cada cliente que chegou por anúncio, com a etapa de hoje"
        acao={<Seletor valor={filtroCamp} opcoes={[{ valor: 'todas', rotulo: 'Todas as campanhas' }, ...campanhas.map((c) => ({ valor: c.id, rotulo: c.nome }))]} aoMudar={(v) => { setFiltroCamp(v); setVerTodos(false); }} rotulo="Filtrar por campanha" />}>
        {leadsFiltrados.length === 0 ? <Vazio texto="Nenhum cliente de anúncio nesse filtro." /> : (
          <>
            <div className="d5-tab-rolo">
              <table className="d5-tab d5-an-ras">
                <thead>
                  <tr>
                    <th scope="col">Cliente</th>
                    <th scope="col" className="d5-dir">Entrou</th>
                    <th scope="col" className="d5-dir">Anúncio</th>
                    <th scope="col" className="d5-dir">Campanha</th>
                    <th scope="col" className="d5-dir">Etapa</th>
                    <th scope="col" className="d5-dir">Responsável</th>
                  </tr>
                </thead>
                <tbody>
                  {leadsVisiveis.map((l) => (
                    <tr key={l.conversaId}>
                      <th scope="row">
                        <button type="button" className="d5-an-cli" onClick={() => ir(`/whatsapp?conversa=${encodeURIComponent(l.conversaId)}`)} title="Abrir a conversa">
                          {l.contato}
                        </button>
                      </th>
                      <td className="d5-dir num">{dataHora(l.entrouEm)}</td>
                      <td className="d5-dir">{l.anuncio}</td>
                      <td className="d5-dir">{l.campanha ?? '—'}</td>
                      <td className="d5-dir"><span className={'d5-an-etapa' + (l.fechado ? ' ok' : '')}>{l.etapa ?? '—'}</span></td>
                      <td className="d5-dir">{l.responsavel ?? <span className="d5-an-sem">Sem responsável</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {leadsFiltrados.length > 25 && (
              <div className="d5-an-mais">
                <BotaoSec mini onClick={() => setVerTodos((v) => !v)}>{verTodos ? 'Mostrar menos' : `Ver todos os ${fmtInt(leadsFiltrados.length)}`}</BotaoSec>
              </div>
            )}
          </>
        )}
      </Secao>

      {d.semId > 0 && (
        <p className="d5-an-rodape">
          {fmtInt(d.semId)} {d.semId === 1 ? 'desses leads veio' : 'desses leads vieram'} sem o código do anúncio (o WhatsApp nem sempre manda): {d.semId === 1 ? 'aparece' : 'aparecem'} pelo título do anúncio, sem o custo.
        </p>
      )}
    </div>
  );
}

export function AnunciosAbaSkeleton() {
  return (
    <div className="d5-an" aria-busy="true">
      <div className="pmc-grade" data-col={4}>{[0, 1, 2, 3].map((i) => <Skeleton key={i} altura={168} raio={14} />)}</div>
      <Skeleton altura={260} raio={14} />
      <Skeleton altura={220} raio={14} />
    </div>
  );
}
