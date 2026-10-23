/* ============================================================================
   Radar de Atendimento — painel do ADMIN (nome interno: vácuo).
   Missão (dono, 23/10): "não esquecer clientes, não deixar cliente pra trás
   que confirmou interesse". O radar vigia cada conversa sem resposta humana,
   avisa o atendente NA TELA em 3 toques (escada acelerada pra lead
   prioritário) e, ignorados os 3, repassa pra quem mais fecha com punição
   registrada. Aqui o admin enxerga: quem está em risco AGORA (a fila viva),
   a régua do repasse e o histórico de punições com desfecho.
   Anatomia executiva (Dashboard): monocromático, cor só como semântica.
   ============================================================================ */
import { useMemo, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import './guardiao.css';
import { CardVidro, EstadoErro, Skeleton } from '../components';
import { tempoRelativo } from '@/data/slaView';
import { useOrgUsuarios } from '@/data/atendimento';
import {
  useVacuoRepasses, useVacuoRanking, useVacuoConfig, useRadarRisco,
  type VacuoRepasse, type RadarRisco,
} from '@/data/vacuo';

function Hero({ rotulo, val, sub, tom, marca, atraso }: {
  rotulo: string; val: ReactNode; sub?: ReactNode; tom?: 'rubro' | 'verde' | 'neutro'; marca?: string; atraso?: number;
}) {
  return (
    <CardVidro spot sobe atraso={atraso} className={'gd-hero' + (marca ? ' ' + marca : '') + (tom ? ' t-' + tom : '')}>
      <div className="rot">{tom === 'rubro' && <i className="gd-ping" aria-hidden />}{rotulo}</div>
      <div className={'val num' + (tom === 'rubro' ? ' rub' : tom === 'verde' ? ' vrd' : '')}>{val}</div>
      {sub && <div className="pe">{sub}</div>}
    </CardVidro>
  );
}

function Secao({ titulo, badge, badgeTom, sub, children, atraso }: {
  titulo: string; badge?: ReactNode; badgeTom?: 'rubro' | 'neutro'; sub?: ReactNode; children: ReactNode; atraso?: number;
}) {
  return (
    <CardVidro sobe atraso={atraso} className="gd-sec">
      <div className="gd-sec-cab">
        <div>
          <div className="t">{titulo}{badge != null && <span className={'gd-badge' + (badgeTom === 'rubro' ? ' rub' : '')}>{badge}</span>}</div>
          {sub && <div className="s">{sub}</div>}
        </div>
      </div>
      {children}
    </CardVidro>
  );
}

/** Medidor de escalada 1º→3º aviso (três segmentos acesos conforme o estágio). */
function Escalada({ n }: { n: 1 | 2 | 3 }) {
  return (
    <span className="gd-esc" title={`${n}º de 3 avisos`}>
      <i className={'s a1' + (n >= 1 ? ' on' : '')} />
      <i className={'s a2' + (n >= 2 ? ' on' : '')} />
      <i className={'s a3' + (n >= 3 ? ' on' : '')} />
      <b className={'num n' + n}>{n}/3</b>
    </span>
  );
}

const iniciaisDe = (nome: string) =>
  nome.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('');

const dtCurta = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });

function PrioMarca({ prio, motivo }: { prio: RadarRisco['prio'] | boolean; motivo?: string | null }) {
  if (!prio) return null;
  const docs = prio === 'docs' || motivo === 'documentação enviada';
  return (
    <span className={'gd-pill ' + (docs ? 'ok' : 'bad')} title={motivo ? 'Lead prioritário: ' + motivo : docs ? 'Documentação enviada' : 'Interesse confirmado'}>
      {docs ? '📄 Documentação' : '🔥 Interesse'}
    </span>
  );
}

function Desfecho({ r }: { r: VacuoRepasse }) {
  if (r.desfecho === 'fechado') return <span className="gd-pill ok" title={r.fechadoEm ? 'Fechado em ' + dtCurta(r.fechadoEm) : undefined}>✓ {r.paraNome} fechou</span>;
  if (r.desfecho === 'perdido') return <span className="gd-pill bad">Perdido</span>;
  if (r.desfecho === 'andamento') return <span className="gd-pill">Em andamento</span>;
  return <span className="gd-pill mudo">Sem oportunidade</span>;
}

export default function GuardiaoV2() {
  const nav = useNavigate();
  const riscoQ = useRadarRisco();
  const repassesQ = useVacuoRepasses();
  const rankingQ = useVacuoRanking();
  const configQ = useVacuoConfig();
  const usuariosQ = useOrgUsuarios();

  const risco = riscoQ;
  const repasses = repassesQ.data ?? [];
  const ranking = rankingQ.data ?? [];
  const cfg = configQ.data;
  const agora = Date.now();

  const nomeDono = useMemo(() => {
    const m = new Map<string, string>();
    for (const u of usuariosQ.data ?? []) m.set(u.id, u.nome);
    return (r: RadarRisco) => r.donoNome ?? (r.donoId ? m.get(r.donoId) ?? 'Atendente' : 'Sem dono');
  }, [usuariosQ.data]);

  const stats = useMemo(() => {
    const corte = agora - 30 * 86400e3;
    const ultimos = repasses.filter((r) => new Date(r.criadoEm).getTime() >= corte);
    return {
      total: ultimos.length,
      fechados: ultimos.filter((r) => r.desfecho === 'fechado').length,
      riscoPrio: risco.filter((r) => r.prio).length,
    };
  }, [repasses, risco, agora]);

  const campeao = ranking[0] ?? null; // a RPC já ordena pela régua do motor (taxa de conversão)

  if (repassesQ.isError) return <EstadoErro titulo="Radar de Atendimento" descricao={(repassesQ.error as Error)?.message} aoTentarDeNovo={() => void repassesQ.refetch()} />;

  const abrir = (conversaId: string) => nav('/whatsapp?conversa=' + encodeURIComponent(conversaId));

  return (
    <div className="gd-pg">
      <div className="gd-heros">
        <Hero rotulo="Em risco agora" val={risco.length} tom={risco.length > 0 ? 'rubro' : 'verde'} marca="h-risco"
          sub={risco.length === 0 ? 'radar limpo' : `${stats.riscoPrio} prioritário${stats.riscoPrio === 1 ? '' : 's'} · aja agora`} atraso={0} />
        <Hero rotulo="Punições · 30 dias" val={repassesQ.isLoading ? <Skeleton largura={48} /> : stats.total} tom={stats.total > 0 ? 'rubro' : 'neutro'} marca="h-puni" sub="clientes repassados por falta de resposta" atraso={1} />
        <Hero rotulo="Resgatados e fechados" val={repassesQ.isLoading ? <Skeleton largura={48} /> : stats.fechados} tom={stats.fechados > 0 ? 'verde' : 'neutro'} marca="h-ok" sub="o novo dono fechou o negócio" atraso={2} />
        <Hero rotulo="Pra onde o cliente vai hoje" val={campeao ? campeao.nome : '—'} marca="h-alvo" sub={campeao ? `${campeao.taxa}% de conversão · ${campeao.fechados} fechados` : 'sem elegível na janela'} atraso={3} />
      </div>

      {cfg && (
        <div className="gd-regras num" title="Minutos ÚTEIS: o relógio só anda dentro do horário de atendimento">
          <span>Avisos <b>{cfg.aviso1} · {cfg.aviso2} · {cfg.aviso3} min</b> → repasse <b>{cfg.repasse} min</b></span>
          <span>Prioritário <b>{cfg.prioAviso1} · {cfg.prioAviso2} · {cfg.prioAviso3} min</b> → repasse <b>{cfg.prioRepasse} min</b></span>
          <span>Horário útil <b>{String(cfg.horaInicio).padStart(2, '0')}–{String(cfg.horaFim).padStart(2, '0')}h</b></span>
          <span>Conversão dos últimos <b>{cfg.janelaDias} dias</b></span>
          <span>Teto <b>{cfg.maxRepassesDia} repasses/dia</b></span>
        </div>
      )}

      <div className="gd-grid">
        <Secao titulo="Clientes em risco agora" badge={risco.length} badgeTom={risco.length > 0 ? 'rubro' : 'neutro'}
          sub="A fila viva do radar: estão SEM RESPOSTA neste momento — prioritários primeiro. Clique para abrir e responder." atraso={4}>
          {risco.length === 0 ? (
            <div className="gd-vazio ok">✓ Radar limpo — nenhum cliente esquecido neste momento.</div>
          ) : (
            <table className="gd-tab risco">
              <thead><tr><th>Cliente</th><th>Escalada</th><th>Prioridade</th><th>Com quem está</th><th>Sem resposta</th><th /></tr></thead>
              <tbody>
                {risco.map((r) => (
                  <tr key={r.alertaId} className={'clk r' + r.n} title="Abrir a conversa no inbox" onClick={() => abrir(r.conversaId)}>
                    <td className="forte">
                      <span className="gd-cli">
                        <span className={'gd-av n' + r.n}>{iniciaisDe(r.nome)}</span>
                        {r.nome}
                      </span>
                    </td>
                    <td><Escalada n={r.n} /></td>
                    <td><PrioMarca prio={r.prio} /></td>
                    <td className={r.donoId || r.donoNome ? '' : 'rub'}>{nomeDono(r)}</td>
                    <td className="num mudo">{tempoRelativo(r.desde, agora)}</td>
                    <td className="gd-acao">Responder →</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Secao>

        <Secao titulo="Quem mais fecha" sub="A régua que decide o destino do repasse — conversão na janela (fechados ÷ recebidos), recalculada ao vivo" atraso={5}>
          {rankingQ.isLoading ? <Skeleton altura={120} /> : ranking.length === 0 ? <div className="gd-vazio">Sem dados na janela.</div> : (
            <table className="gd-tab">
              <thead><tr><th>Atendente</th><th className="num">Fechados</th><th className="num">Recebidos</th><th className="num">Conversão</th><th className="num">Punições</th></tr></thead>
              <tbody>
                {(() => { const topo = Math.max(...ranking.map((p) => p.taxa), 0.1); return ranking.map((p, i) => (
                  <tr key={p.usuarioId} className={i === 0 ? 'lider' : ''}>
                    <td><span className="gd-cli"><span className={'gd-av' + (i === 0 ? ' ouro' : '')}>{iniciaisDe(p.nome)}</span>{p.nome}{i === 0 && <span className="gd-coroa" title="Maior conversão da janela — é pra cá que o repasse vai">🏆</span>}</span></td>
                    <td className="num">{p.fechados}</td>
                    <td className="num">{p.recebidos}</td>
                    <td className="num forte">
                      <span className="gd-conv"><span className="tr"><i style={{ width: `${Math.round((p.taxa / topo) * 100)}%` }} /></span><b>{p.taxa}%</b></span>
                    </td>
                    <td className={'num' + (p.punicoes > 0 ? ' rub' : '')}>{p.punicoes}</td>
                  </tr>
                )); })()}
              </tbody>
            </table>
          )}
        </Secao>

        <Secao titulo="Punições e repasses" badge={stats.total} badgeTom={stats.total > 0 ? 'rubro' : 'neutro'}
          sub="Cada linha é um cliente que ficou pra trás após 3 avisos — com quem estava, pra quem foi e o desfecho" atraso={6}>
          {repassesQ.isLoading ? <Skeleton altura={160} /> : repasses.length === 0 ? (
            <div className="gd-vazio">Nenhuma punição registrada — a equipe está respondendo dentro do prazo. 👏</div>
          ) : (
            <table className="gd-tab">
              <thead><tr><th>Quando</th><th>Cliente</th><th>Repasse</th><th className="num">Vácuo</th><th>Desfecho</th></tr></thead>
              <tbody>
                {repasses.slice(0, 80).map((r) => (
                  <tr key={r.id} className="clk" title="Abrir a conversa no inbox" onClick={() => abrir(r.conversaId)}>
                    <td className="num mudo">{dtCurta(r.criadoEm)}</td>
                    <td className="forte">{r.prioritario && <span title={'Lead PRIORITÁRIO no momento do vácuo: ' + (r.prioMotivo ?? '')}>{r.prioMotivo === 'documentação enviada' ? '📄 ' : '🔥 '}</span>}{r.contatoNome ?? '—'}</td>
                    <td>
                      <span className="gd-fluxo">
                        <b className="de">{r.deNome}</b>
                        <svg viewBox="0 0 24 10" aria-hidden><path d="M1 5h19M16 1.5L20.5 5 16 8.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                        <b className="para">{r.paraNome}</b>
                      </span>
                    </td>
                    <td className="num mudo">{r.minutos != null ? `${r.minutos} min` : '—'}</td>
                    <td><Desfecho r={r} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Secao>
      </div>
    </div>
  );
}
