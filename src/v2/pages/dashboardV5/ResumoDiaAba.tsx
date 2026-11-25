/* DASHBOARD › RESUMO DO DIA (25/11): o dia da equipe numa tela só, para o gestor (o administrador). Escolhe o dia
   (hoje, ontem ou um dos últimos dois meses), vê os números grandes, o tempo de resposta do dia, quem esperou além
   da meta, por que as conversas fecharam (barras) e cada atendente. No pé, o aviso no sino no fim da tarde (chega
   desligado). Dados: @/data/resumoDia (migration 108) e @/data/tempoResposta (97). Recurso 'resumo-dia'. */
import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { addDias } from '@/data/relatorios';
import { periodoDash } from '@/data/dashboard';
import { fmtMin, lerPreferencia, useDashTempoResposta } from '@/data/tempoResposta';
import { DIAS_PARA_TRAS, HORAS_RESUMO, RESUMO_CONFIG_PADRAO, fraseDoResumo, qtd, useResumoDia, useResumoDiaConfig, useSalvarResumoDiaConfig, type ResumoDia } from '@/data/resumoDia';
import { DIAS_SEMANA, diasTexto } from '@/data/retomada';
import { CardVidro, EstadoErro, Segmentado, Skeleton, Toggle } from '../../components';
import { CartaoMetricaFixo, GradeMetricas } from '../../components/CartaoMetrica';
import { temRecurso } from '../../data/config/recursos';
import { Secao, Vazio } from './comum';
import './resumoDia.css';

const int = (v: number) => v.toLocaleString('pt-BR');
const diaLongo = (d: string) => new Date(`${d}T12:00:00-03:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
type Atalho = 'hoje' | 'ontem' | 'outro';

export function ResumoDiaAba({ hoje }: { hoje: string }) {
  const [params, setParams] = useSearchParams();
  const pedido = params.get('dia');
  const min = addDias(hoje, -DIAS_PARA_TRAS);
  const dia = pedido && /^\d{4}-\d{2}-\d{2}$/.test(pedido) && pedido <= hoje && pedido >= min ? pedido : hoje;
  const atalho: Atalho = dia === hoje ? 'hoje' : dia === addDias(hoje, -1) ? 'ontem' : 'outro';
  const irPara = (d: string) => setParams((p) => { const x = new URLSearchParams(p); if (d === hoje) x.delete('dia'); else x.set('dia', d); return x; }, { replace: true });

  const q = useResumoDia(dia);
  const pref = useMemo(lerPreferencia, []);
  const periodo = useMemo(() => periodoDash('custom', dia, dia), [dia]);
  const tempoQ = useDashTempoResposta(periodo, pref.meta, pref.modo, temRecurso('tempo-resposta'));
  const r = q.data;

  return (
    <div className="rsd" data-resumo-dia aria-busy={q.isFetching || undefined}>
      <div className="rsd-topo">
        <div className="rsd-dia">
          <b>{dia === hoje ? 'Hoje' : dia === addDias(hoje, -1) ? 'Ontem' : 'Dia'}, {diaLongo(dia)}</b>
          {r && <span>{fraseDoResumo(r)}</span>}
        </div>
        <div className="rsd-escolha">
          <Segmentado<Atalho> rotulo="Qual dia" valor={atalho}
            opcoes={[{ valor: 'hoje', rotulo: 'Hoje' }, { valor: 'ontem', rotulo: 'Ontem' }, { valor: 'outro', rotulo: 'Outro dia' }]}
            aoMudar={(v) => { if (v === 'hoje') irPara(hoje); else if (v === 'ontem') irPara(addDias(hoje, -1)); else irPara(addDias(hoje, -2)); }} />
          {atalho === 'outro' && (
            <label className="rsd-data"><span className="rsd-sr">Escolha o dia</span>
              <input type="date" className="inp" value={dia} min={min} max={hoje} onChange={(e) => e.target.value && irPara(e.target.value)} />
            </label>
          )}
        </div>
      </div>

      {q.isError && !r ? <CardVidro className="d5-sec"><EstadoErro titulo="Não foi possível montar o resumo do dia" descricao={(q.error as Error).message} aoTentarDeNovo={() => void q.refetch()} /></CardVidro>
        : !r ? <ResumoSkeleton />
        : <Corpo r={r} tempo={tempoQ.data ? { mediana: tempoQ.data.totais.medianaMin, respondidos: tempoQ.data.totais.respondidos, dentro: tempoQ.data.totais.dentroMeta, meta: tempoQ.data.metaMin } : null} />}

      <AvisoNoSino />
    </div>
  );
}

function Corpo({ r, tempo }: { r: ResumoDia; tempo: { mediana: number | null; respondidos: number; dentro: number; meta: number } | null }) {
  const navigate = useNavigate();
  const maxMotivo = Math.max(1, ...r.motivos.map((m) => m.n));
  const abrir = (id: string) => navigate(`/whatsapp?conversa=${encodeURIComponent(id)}`);
  return (
    <>
      <GradeMetricas rotulo="O dia em números">
        <CartaoMetricaFixo icone="balao" titulo="Clientes que escreveram" valor={int(r.clientesEscreveram)}
          detalhe={<span>{qtd(r.conversasNovas, 'conversa nova', 'conversas novas')} · {qtd(r.docsRecebidos, 'foto ou documento', 'fotos e documentos')}</span>}
          rodape={<span>{qtd(r.recebidas, 'mensagem recebida', 'mensagens recebidas')}</span>} />
        <CartaoMetricaFixo icone="pessoas" titulo="Atendidos pela equipe" valor={int(r.atendidasEquipe)}
          detalhe={<span>{qtd(r.enviadasEquipe, 'mensagem enviada', 'mensagens enviadas')}{r.peloCelular ? ` · ${int(r.peloCelular)} pelo celular` : ''}</span>}
          rodape={<span title={r.falharam ? qtd(r.falharam, 'envio falhou', 'envios falharam') : undefined}>{r.atendidasIa ? `IA atendeu ${int(r.atendidasIa)}` : 'IA não atendeu'}{r.falharam ? ` · ${qtd(r.falharam, 'falha no envio', 'falhas no envio')}` : ''}</span>} />
        <CartaoMetricaFixo icone="relogio" titulo="Tempo de resposta" valor={tempo?.mediana != null ? fmtMin(tempo.mediana) : '—'}
          detalhe={<span>{tempo ? (tempo.respondidos ? `${int(tempo.dentro)} de ${int(tempo.respondidos)} em até ${int(tempo.meta)} min` : 'nenhuma resposta de pessoa') : 'mediana do dia'}</span>}
          rodape={<span>{r.esperaramMeta ? qtd(r.esperaramMeta, 'cliente esperou além da meta', 'clientes esperaram além da meta') : 'ninguém esperou além da meta'}</span>} />
        <CartaoMetricaFixo icone="certo" titulo="Fechadas e leads" valor={int(r.fechadas)}
          detalhe={<span>{qtd(r.fechadas, 'conversa fechada', 'conversas fechadas')}</span>}
          rodape={<span>{qtd(r.leadsNovos, 'lead novo', 'leads novos')} · {qtd(r.ganhos, 'ganho', 'ganhos')} · {qtd(r.perdidos, 'perdido', 'perdidos')}</span>} />
      </GradeMetricas>

      <div className="rsd-duas">
        <Secao titulo="Esperaram além da meta" sub="Clientes que o aviso de espera apontou neste dia. Clique para abrir a conversa.">
          {r.esperaram.length === 0 ? <Vazio texto="Ninguém passou da meta neste dia." detalhe={temRecurso('aviso-espera') ? undefined : 'Ligue o aviso em Configurações › Aviso de espera.'} />
            : (
              <ul className="rsd-lista">
                {r.esperaram.map((e) => (
                  <li key={e.conversaId}>
                    <button type="button" className="rsd-lk" onClick={() => abrir(e.conversaId)}>{e.contato}</button>
                    <span>{e.responsavel ? `Responsável: ${e.responsavel}` : 'Sem responsável'}</span>
                    {e.quando && <span className="num">{new Date(e.quando).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })}</span>}
                  </li>
                ))}
              </ul>
            )}
        </Secao>
        <Secao titulo="Por que fecharam" sub="O motivo escolhido ao fechar cada conversa.">
          {r.motivos.length === 0 ? <Vazio texto="Nenhuma conversa fechada neste dia." />
            : (
              <ul className="rsd-barras" aria-label="Conversas fechadas por motivo">
                {r.motivos.map((m) => (
                  <li key={m.motivo}>
                    <span className="rsd-b-rot">{m.motivo}</span>
                    <span className="rsd-b-trilho" aria-hidden><span style={{ width: `${Math.max(4, (m.n / maxMotivo) * 100)}%` }} /></span>
                    <span className="rsd-b-n num">{int(m.n)}</span>
                  </li>
                ))}
              </ul>
            )}
        </Secao>
      </div>

      <Secao titulo="Por atendente" sub="Quem atendeu neste dia, de quem atendeu mais para quem atendeu menos.">
        {r.atendentes.length === 0 ? <Vazio texto="Nenhum atendente respondeu neste dia." />
          : (
            <div className="d5-tab-rolo">
              <table className="d5-tab rsd-tab">
                <thead><tr><th scope="col">Atendente</th><th scope="col">Conversas atendidas</th><th scope="col">Mensagens enviadas</th><th scope="col">Fechadas</th></tr></thead>
                <tbody>
                  {r.atendentes.map((a) => (
                    <tr key={a.id}><td>{a.nome}</td><td className="num">{int(a.conversas)}</td><td className="num">{int(a.mensagens)}</td><td className="num">{int(a.fechadas)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </Secao>
    </>
  );
}

function AvisoNoSino() {
  const cfgQ = useResumoDiaConfig();
  const salvar = useSalvarResumoDiaConfig();
  const cfg = cfgQ.data ?? RESUMO_CONFIG_PADRAO;
  const [erro, setErro] = useState('');
  const gravar = (c: typeof cfg) => { setErro(''); salvar.mutate(c, { onError: (e) => setErro((e as Error).message) }); };
  return (
    <Secao titulo="Receber no sino" sub="Um aviso com este resumo, no fim da tarde, para quem é administrador. Clicando, abre esta tela no dia.">
      <div className="rsd-sino">
        <Toggle ligado={cfg.ativo} rotulo="Receber o resumo do dia no sino" disabled={salvar.isPending || cfgQ.isLoading} aoMudar={(v) => gravar({ ...cfg, ativo: v })} />
        <span className="rsd-sino-tx">{cfg.ativo ? `Ligado: ${diasTexto(cfg.dias)}, às ${cfg.hora}.` : 'Desligado.'}</span>
        <label className="rsd-sino-h">
          <span>às</span>
          <select className="inp" value={cfg.hora} disabled={salvar.isPending} onChange={(e) => gravar({ ...cfg, hora: e.target.value })}>
            {(HORAS_RESUMO.includes(cfg.hora) ? HORAS_RESUMO : [...HORAS_RESUMO, cfg.hora].sort()).map((h) => <option key={h} value={h}>{h}</option>)}
          </select>
        </label>
        <div className="rsd-dias" role="group" aria-label="Dias da semana">
          {DIAS_SEMANA.map((d) => {
            const on = cfg.dias.includes(d.dia);
            return <button key={d.dia} type="button" aria-pressed={on} aria-label={d.longo} className={on ? 'on' : undefined} disabled={salvar.isPending}
              onClick={() => gravar({ ...cfg, dias: on ? cfg.dias.filter((x) => x !== d.dia) : [...cfg.dias, d.dia] })}>{d.curto}</button>;
          })}
        </div>
      </div>
      {erro && <p className="rsd-erro" role="alert">{erro}</p>}
    </Secao>
  );
}

function ResumoSkeleton() {
  return (
    <GradeMetricas rotulo="Carregando o resumo do dia">
      {[0, 1, 2, 3].map((i) => <CardVidro key={i} className="rsd-sk"><Skeleton largura="50%" altura={12} /><Skeleton largura="35%" altura={26} /><Skeleton largura="70%" altura={11} /></CardVidro>)}
    </GradeMetricas>
  );
}
