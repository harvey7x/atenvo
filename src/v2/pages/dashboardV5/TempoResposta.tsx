import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Periodo } from '@/data/relatorios';
import {
  fmtMin, guardarPreferencia, lerPreferencia, pctDentro, useDashTempoResposta, type DashTempo, type ModoTempo,
} from '@/data/tempoResposta';
import { fmtInt, fmtPct } from '@/data/dashboardV5.formato';
import { BotaoSec, CardVidro, EstadoErro, Segmentado, Skeleton } from '../../components';
import { CartaoMetrica, CartaoMetricaFixo, CartaoSeries, GradeMetricas, TituloBloco, diaDoBalao, type SeriesPoint } from '../../components/CartaoMetrica';
import { Ajuda, Secao, Variacao, Vazio } from './comum';
import './tempoResposta.css';

/* TEMPO DE RESPOSTA DA EQUIPE (dono 25/11, do sistema que a Reviza usava antes): a meta em minutos, quantas respostas
   ficaram dentro dela, a mediana, quem está esperando AGORA e cada atendente do mais lento ao mais rápido. Fica no
   topo da aba Atendentes e tem a sua própria consulta (dash_tempo_resposta). O período é o do topo do Dashboard. */

const AJ = {
  geral: 'Da primeira mensagem do cliente até a próxima mensagem nossa. Se quem respondeu foi uma PESSOA (pelo sistema ou pelo celular), entra na conta; se foi a IA, não entra (a IA não é a equipe). Mensagens seguidas do cliente contam da primeira. A resposta pelo celular vai para o responsável pela conversa.',
  modo: 'Horário comercial: só contam os minutos de segunda a sexta, das 8h às 18h (a mensagem das 23h respondida às 8h05 conta 5 minutos). Tempo corrido: conta tudo, noite e fim de semana inclusive.',
  mediana: 'Metade das respostas saiu em até este tempo. A mediana não é puxada por um caso perdido de dias, como a média.',
  dentro: 'Respostas de uma pessoa que saíram dentro da meta, sobre todas as respostas de pessoas no período.',
  aguardando: 'AGORA, independente do período: conversas abertas cuja última mensagem é do cliente, sem resposta de ninguém (nem da IA), dos últimos 30 dias.',
};

export function TempoResposta({ periodo, hoje, comparacao }: { periodo: Periodo; hoje: string; comparacao: string }) {
  const ir = useNavigate();
  const [pref, setPref] = useState(lerPreferencia);
  const [metaTexto, setMetaTexto] = useState(String(pref.meta));
  const [verFila, setVerFila] = useState(false);
  const q = useDashTempoResposta(periodo, pref.meta, pref.modo, true);
  const mudar = (p: Partial<typeof pref>) => { const nova = { ...pref, ...p }; setPref(nova); guardarPreferencia(nova); };
  const aplicarMeta = () => {
    const v = Math.round(Number(metaTexto.replace(',', '.')));
    if (Number.isFinite(v) && v >= 1 && v <= 1440) { if (v !== pref.meta) mudar({ meta: v }); } else setMetaTexto(String(pref.meta));
  };
  const d = q.data;
  const pct = d ? pctDentro(d.totais) : null;
  const controles = (
    <div className="tr-ctl">
      <label className="tr-meta">
        <span>Meta</span>
        <input className="inp num" inputMode="numeric" value={metaTexto} aria-label="Meta de resposta, em minutos"
          onChange={(e) => setMetaTexto(e.target.value.replace(/[^\d]/g, '').slice(0, 4))} onBlur={aplicarMeta} onKeyDown={(e) => { if (e.key === 'Enter') aplicarMeta(); }} />
        <span>min</span>
      </label>
      <Segmentado<ModoTempo> opcoes={[{ valor: 'uteis', rotulo: 'Horário comercial' }, { valor: 'corrido', rotulo: 'Tempo corrido' }]}
        valor={pref.modo} aoMudar={(m) => mudar({ modo: m })} rotulo="Como contar o tempo" />
      <Ajuda texto={AJ.modo} rotulo="Horário comercial ou tempo corrido" />
    </div>
  );
  return (
    <div className="tr" data-tempo-resposta>
      <TituloBloco titulo="Tempo de resposta da equipe" ajuda={<Ajuda texto={AJ.geral} rotulo="Tempo de resposta da equipe" />}
        sub={d ? (pct == null ? 'Nenhuma resposta de pessoa no período.' : `${fmtPct(pct)} das respostas dentro da meta de ${fmtInt(d.metaMin)} min`) : 'Calculando…'}
        acao={controles} />
      {q.isError && !d ? (
        <CardVidro className="d5-sec d5-erro"><EstadoErro titulo="Não foi possível calcular o tempo de resposta" descricao={(q.error as Error)?.message || 'Tente de novo.'} aoTentarDeNovo={() => void q.refetch()} /></CardVidro>
      ) : !d ? <TempoRespostaSkeleton /> : <Corpo d={d} hoje={hoje} comparacao={comparacao} verFila={verFila} setVerFila={setVerFila} abrir={(id) => ir(`/whatsapp?conversa=${encodeURIComponent(id)}`)} />}
    </div>
  );
}

function Corpo({ d, hoje, comparacao, verFila, setVerFila, abrir }: { d: DashTempo; hoje: string; comparacao: string; verFila: boolean; setVerFila: (v: boolean) => void; abrir: (id: string) => void }) {
  const tot = d.totais; const ant = d.anterior;
  const pct = pctDentro(tot); const pctAnt = ant ? pctDentro(ant) : null;
  const serie = (f: (x: DashTempo['porDia'][number]) => number): SeriesPoint[] => d.porDia.map((x) => ({ date: x.dia, value: f(x) }));
  const sMed = useMemo(() => serie((x) => x.medianaMin ?? 0), [d]); // eslint-disable-line react-hooks/exhaustive-deps
  const sPct = useMemo(() => serie((x) => (x.respondidos ? Math.round((x.dentroMeta / x.respondidos) * 100) : 0)), [d]); // eslint-disable-line react-hooks/exhaustive-deps
  const sResp = useMemo(() => serie((x) => x.respondidos), [d]); // eslint-disable-line react-hooks/exhaustive-deps
  const comuns = { formatarData: (dia: string) => diaDoBalao(dia, hoje), variacao: false as const };
  const cab = (titulo: string, ajuda: string) => <span className="rvm-tit rvm-tit-ajuda">{titulo}<Ajuda texto={ajuda} rotulo={titulo} /></span>;
  const tom = (a: number | null, b: number | null, menorMelhor: boolean) => (a == null || b == null || a === b ? 'neutro' as const : (a < b) === menorMelhor ? 'bom' as const : 'ruim' as const);
  const pessoas = d.atendentes;
  const fila = verFila ? d.fila : d.fila.slice(0, 8);
  const horas = d.porHora.filter((h) => h.hora >= 6 && h.hora <= 22);
  return (
    <>
      <div className="rvm-bloco">
        <GradeMetricas rotulo="Tempo de resposta no período">
          <CartaoMetrica icone="relogio" titulo="Mediana de resposta" cabEsquerda={cab('Mediana de resposta', AJ.mediana)} data={sMed}
            total={fmtMin(tot.medianaMin)} tom={tom(tot.medianaMin, ant?.medianaMin ?? null, true)} formatar={(v) => fmtMin(v)} {...comuns}
            numSub={tot.respondidos ? <span title={`9 em cada 10 respostas saíram em até ${fmtMin(tot.p90Min)}`}>média {fmtMin(tot.mediaMin)}</span> : undefined}
            rodape={<Variacao atual={tot.medianaMin} anterior={ant?.medianaMin} sentido="menor" comparacao={comparacao} />} />
          <CartaoMetrica icone="certo" titulo="Dentro da meta" cabEsquerda={cab('Dentro da meta', AJ.dentro)} data={sPct}
            total={fmtPct(pct)} tom={tom(pct, pctAnt, false)} formatar={(v) => `${fmtInt(v)}%`} {...comuns}
            numSub={<span>{fmtInt(tot.dentroMeta)} de {fmtInt(tot.respondidos)} em até {fmtInt(d.metaMin)} min</span>}
            rodape={<Variacao atual={pct} anterior={pctAnt} sentido="maior" comparacao={comparacao} />} />
          <CartaoMetrica icone="balao" titulo="Respondidos por pessoas" data={sResp}
            total={fmtInt(tot.respondidos)} tom="neutro" formatar={(v) => `${fmtInt(v)} ${v === 1 ? 'resposta' : 'respostas'}`} {...comuns}
            numSub={d.pelaIa > 0 ? <span title="Esperas que a IA respondeu: não entram na conta da equipe">fora: {fmtInt(d.pelaIa)} pela IA</span> : undefined}
            rodape={<Variacao atual={tot.respondidos} anterior={ant?.respondidos} sentido="neutro" comparacao={comparacao} />} />
          <CartaoMetricaFixo icone="alerta" titulo="Esperando agora" valor={fmtInt(d.aguardando)}
            detalhe={<span>{d.aguardando === 1 ? 'cliente sem resposta' : 'clientes sem resposta'} de ninguém<Ajuda texto={AJ.aguardando} rotulo="Esperando agora" /></span>}
            rodape={d.fila.length > 0 ? <a className="tr-lk" href="#tempo-fila" onClick={(e) => { e.preventDefault(); document.getElementById('tempo-fila')?.scrollIntoView({ block: 'start', behavior: 'smooth' }); }}>Ver quem está esperando</a> : <span>ninguém esperando</span>} />
        </GradeMetricas>
      </div>

      <Secao titulo="Por atendente" sub="Do mais lento ao mais rápido, pela mediana do período">
        {pessoas.length === 0 ? <Vazio texto="Nenhuma resposta de pessoa no período." /> : (
          <div className="d5-tab-rolo">
            <table className="d5-tab tr-tab">
              <thead>
                <tr>
                  <th scope="col">Atendente</th>
                  <th scope="col" className="d5-dir">Respostas</th>
                  <th scope="col" className="d5-dir">Mediana</th>
                  <th scope="col" className="d5-dir">Média</th>
                  <th scope="col" className="d5-dir">Pior tempo</th>
                  <th scope="col" className="d5-dir">Dentro da meta</th>
                </tr>
              </thead>
              <tbody>
                {pessoas.map((p) => {
                  const pp = pctDentro(p);
                  const estourou = p.medianaMin != null && p.medianaMin > d.metaMin;
                  return (
                    <tr key={p.id ?? 'sem'}>
                      <th scope="row"><span className={'tr-nome' + (p.id ? '' : ' sem')}>{p.nome}</span></th>
                      <td className="d5-dir num">{fmtInt(p.respondidos)}</td>
                      <td className="d5-dir num"><span className={estourou ? 'tr-fora' : undefined}>{fmtMin(p.medianaMin)}</span></td>
                      <td className="d5-dir num">{fmtMin(p.mediaMin)}</td>
                      <td className="d5-dir num">{fmtMin(p.piorMin)}</td>
                      <td className="d5-dir">
                        <span className="tr-pct">
                          <span className="tr-barra" aria-hidden><i style={{ width: `${pp ?? 0}%` }} /></span>
                          <span className="num">{fmtPct(pp)}</span>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="tr-nota">A resposta pelo celular aparece para o responsável pela conversa. "Sem atendente identificado" = respondido pelo celular numa conversa sem responsável.</p>
      </Secao>

      <CartaoSeries titulo="Respostas por hora do dia" sub="Quando a equipe mais responde, no período"
        pontos={horas.map((h) => ({ chave: String(h.hora), rotulo: `${String(h.hora).padStart(2, '0')}h${h.medianaMin != null ? ` · mediana ${fmtMin(h.medianaMin)}` : ''}` }))}
        series={[{ id: 'resp', rotulo: 'Respostas de pessoas', cor: 'var(--dado-1)', valores: new Map(horas.map((h) => [String(h.hora), h.respondidos])) }]}
        eixo={horas.map((h) => `${String(h.hora).padStart(2, '0')}h`)}
        unidade={(x) => (x === 1 ? 'resposta' : 'respostas')} vazio="Nenhuma resposta de pessoa no período." />

      <Secao id="tempo-fila" titulo="Esperando agora" sub={`${fmtInt(d.aguardando)} ${d.aguardando === 1 ? 'cliente' : 'clientes'} sem resposta, quem espera há mais tempo primeiro`}>
        {d.fila.length === 0 ? <Vazio texto="Ninguém esperando resposta agora." /> : (
          <>
            <div className="d5-tab-rolo">
              <table className="d5-tab tr-fila">
                <thead>
                  <tr>
                    <th scope="col">Cliente</th>
                    <th scope="col" className="d5-dir">Esperando há</th>
                    <th scope="col" className="d5-dir">Desde</th>
                    <th scope="col" className="d5-dir">Responsável</th>
                  </tr>
                </thead>
                <tbody>
                  {[...fila].sort((x, y) => x.desde.localeCompare(y.desde)).map((f) => (
                    <tr key={f.conversaId}>
                      <th scope="row"><button type="button" className="tr-cli" onClick={() => abrir(f.conversaId)} title="Abrir a conversa">{f.contato}</button></th>
                      <td className="d5-dir num"><span className={f.esperaMin > d.metaMin ? 'tr-fora' : undefined}>{fmtMin(f.esperaMin)}</span></td>
                      <td className="d5-dir num">{new Date(f.desde).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }).replace(',', '')}</td>
                      <td className="d5-dir">{f.responsavel ?? <span className="tr-sem">Sem responsável</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {d.fila.length > 8 && <div className="tr-mais"><BotaoSec mini onClick={() => setVerFila(!verFila)}>{verFila ? 'Mostrar menos' : `Ver os ${fmtInt(d.fila.length)}`}</BotaoSec></div>}
          </>
        )}
      </Secao>
    </>
  );
}

export function TempoRespostaSkeleton() {
  return (
    <div className="tr-sk" aria-busy="true">
      <div className="pmc-grade" data-col={4}>{[0, 1, 2, 3].map((i) => <Skeleton key={i} altura={168} raio={14} />)}</div>
      <Skeleton altura={240} raio={14} />
    </div>
  );
}
