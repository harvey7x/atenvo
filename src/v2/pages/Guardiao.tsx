/* ============================================================================
   Radar de Atendimento — painel do ADMIN (nome interno: vácuo).
   Missão (dono, 23/10): "não esquecer clientes, não deixar cliente pra trás
   que confirmou interesse". O radar vigia cada conversa sem resposta humana
   (seg–sex 9h–19h), avisa o atendente NA TELA em 3 toques ao longo do dia e,
   com 1 dia útil sem resposta, pede a DECISÃO do gestor: repassar (pra quem
   ele escolher) ou manter. Nada é repassado automaticamente.
   Anatomia executiva (Dashboard): monocromático, cor só como semântica.
   ============================================================================ */
import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import './guardiao.css';
import { BotaoPrimario, BotaoSec, CardVidro, EstadoErro, Skeleton } from '../components';
import { tempoRelativo } from '@/data/slaView';
import { useOrgUsuarios, type OrgUsuario } from '@/data/atendimento';
import {
  useVacuoRepasses, useVacuoRanking, useVacuoConfig, useRadarRisco, useVacuoDecisoes, useDecidirRepasse, useLigarEquipe,
  useCutucar, CUTUCAR_INTERVALO_MS,
  repasseEfetivo, type VacuoRepasse, type RadarRisco, type VacuoDecisao,
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

/** "1 dia útil", "1 dia útil e 2 h", "2 h", "45 min" (dia útil = 540 min, seg–sex 9h–18h). */
const DIA_UTIL_MIN = 540;
function fmtUteis(min: number | null): string {
  if (min == null) return '—';
  const dias = Math.floor(min / DIA_UTIL_MIN);
  const resto = min % DIA_UTIL_MIN;
  const h = Math.floor(resto / 60), m = resto % 60;
  const partes: string[] = [];
  if (dias) partes.push(dias + (dias > 1 ? ' dias úteis' : ' dia útil'));
  if (h) partes.push(h + ' h');
  if (m && !dias) partes.push(m + ' min');
  return partes.length ? partes.join(dias ? ' e ' : ' ') : '0 min';
}

/** Uma decisão pendente: o gestor escolhe o destino (sugestão = maior conversão) ou mantém. */
function DecisaoLinha({ d, atendentes, agora, aoAbrir }: {
  d: VacuoDecisao; atendentes: OrgUsuario[]; agora: number; aoAbrir: () => void;
}) {
  const decidir = useDecidirRepasse();
  const cutucar = useCutucar();
  const [okCutucar, setOkCutucar] = useState<string | null>(null);
  const opcoes = atendentes.filter((u) => u.id !== d.donoId);
  // "👉 Cutucar": o atendente recebe aviso de tela cheia pra responder agora (1 a cada 10 min)
  const cutucadoRecente = !!d.cutucadoEm && agora - new Date(d.cutucadoEm).getTime() < CUTUCAR_INTERVALO_MS;
  const ocupado = decidir.isPending || cutucar.isPending;
  const [destino, setDestino] = useState<string>(d.sugeridoId && opcoes.some((u) => u.id === d.sugeridoId) ? d.sugeridoId : (opcoes[0]?.id ?? ''));
  const [erro, setErro] = useState<string | null>(null);
  const nomeDestino = opcoes.find((u) => u.id === destino)?.nome ?? d.sugeridoNome ?? '';
  const enviar = (destinoId: string | null) => {
    setErro(null);
    decidir.mutate({ conversaId: d.conversaId, destinoId }, { onError: (e) => setErro((e as Error).message) });
  };
  return (
    <div className={'gd-dec' + (d.prioritario ? ' prio' : '')}>
      <div className="gd-dec-cli">
        <span className="gd-av n3">{iniciaisDe(d.contatoNome)}</span>
        <div>
          <button type="button" className="gd-dec-nome" title="Abrir a conversa no inbox" onClick={aoAbrir}>{d.contatoNome}</button>
          <div className="gd-dec-meta">
            com <b>{d.donoNome}</b> · sem resposta há <b>{fmtUteis(d.minutos)}</b> · pedido {tempoRelativo(d.pedidaEm, agora)}
            {d.cutucadas > 0 && d.cutucadoEm && (
              <> · <span className="gd-dec-cut">👉 cutucado {tempoRelativo(d.cutucadoEm, agora)}{d.cutucadas > 1 ? ` · ${d.cutucadas}×` : ''}</span></>
            )}
          </div>
        </div>
        {d.prioritario && <PrioMarca prio={true} motivo={d.prioMotivo} />}
      </div>
      <div className="gd-dec-acoes">
        <label className="gd-dec-sel">
          <span>Repassar para</span>
          <select value={destino} onChange={(e) => setDestino(e.target.value)} disabled={decidir.isPending || opcoes.length === 0}>
            {opcoes.map((u) => (
              <option key={u.id} value={u.id}>{u.nome}{u.id === d.sugeridoId ? ' · sugerido (maior conversão)' : ''}</option>
            ))}
          </select>
        </label>
        <BotaoPrimario disabled={!destino || ocupado} onClick={() => enviar(destino)}>
          {decidir.isPending ? 'Salvando…' : `Repassar para ${nomeDestino}`}
        </BotaoPrimario>
        <BotaoSec disabled={ocupado} onClick={() => enviar(null)}>Manter com {d.donoNome}</BotaoSec>
        <button type="button" className="gd-cutucar" disabled={ocupado || cutucadoRecente}
          title={cutucadoRecente ? 'Você já cutucou há pouco — dê um tempo pro atendente responder' : `Aparece um aviso de tela cheia pra ${d.donoNome} responder este cliente agora`}
          onClick={() => {
            setErro(null); setOkCutucar(null);
            cutucar.mutate(d.conversaId, {
              onSuccess: () => setOkCutucar(`${d.donoNome} recebeu o aviso pra responder agora.`),
              onError: (e) => setErro((e as Error).message),
            });
          }}>
          {cutucar.isPending ? 'Cutucando…' : cutucadoRecente ? '👉 Cutucado' : `👉 Cutucar ${d.donoNome}`}
        </button>
      </div>
      {okCutucar && <div className="gd-dec-ok">{okCutucar}</div>}
      {erro && <div className="gd-dec-erro">{erro}</div>}
    </div>
  );
}

function Desfecho({ r }: { r: VacuoRepasse }) {
  if (r.desfeito) return <span className="gd-pill mudo" title="Repasse automático antigo, desfeito pelo gestor">Desfeito · voltou para {r.deNome}</span>;
  if (r.decisao === 'mantido') return <span className="gd-pill">Mantido com {r.deNome}</span>;
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
  const decisoesQ = useVacuoDecisoes();
  const decisoes = decisoesQ.data ?? [];
  const ligar = useLigarEquipe();

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
    const ultimos = repasses.filter((r) => repasseEfetivo(r) && new Date(r.criadoEm).getTime() >= corte);
    return {
      total: ultimos.length,
      fechados: ultimos.filter((r) => r.desfecho === 'fechado').length,
      riscoPrio: risco.filter((r) => r.prio).length,
    };
  }, [repasses, risco, agora]);


  if (repassesQ.isError) return <EstadoErro titulo="Radar de Atendimento" descricao={(repassesQ.error as Error)?.message} aoTentarDeNovo={() => void repassesQ.refetch()} />;

  const abrir = (conversaId: string) => nav('/whatsapp?conversa=' + encodeURIComponent(conversaId));

  return (
    <div className="gd-pg">
      <div className="gd-heros">
        <Hero rotulo="Em risco agora" val={risco.length} tom={risco.length > 0 ? 'rubro' : 'verde'} marca="h-risco"
          sub={risco.length === 0 ? 'radar limpo' : `${stats.riscoPrio} prioritário${stats.riscoPrio === 1 ? '' : 's'} · aja agora`} atraso={0} />
        <Hero rotulo="Aguardando sua decisão" val={decisoesQ.isLoading ? <Skeleton largura={48} /> : decisoes.length} tom={decisoes.length > 0 ? 'rubro' : 'neutro'} marca="h-alvo"
          sub={decisoes.length === 0 ? 'nenhum repasse pendente' : '1 dia útil sem resposta'} atraso={1} />
        <Hero rotulo="Repasses · 30 dias" val={repassesQ.isLoading ? <Skeleton largura={48} /> : stats.total} tom={stats.total > 0 ? 'rubro' : 'neutro'} marca="h-puni" sub="decididos por você" atraso={2} />
        <Hero rotulo="Resgatados e fechados" val={repassesQ.isLoading ? <Skeleton largura={48} /> : stats.fechados} tom={stats.fechados > 0 ? 'verde' : 'neutro'} marca="h-ok" sub="o novo dono fechou o negócio" atraso={3} />
      </div>

      {cfg && (
        <div className="gd-regras num" title="Minutos ÚTEIS: o relógio só anda dentro do horário de atendimento">
          <span>Avisos em <b>{fmtUteis(cfg.aviso1)} · {fmtUteis(cfg.aviso2)} · {fmtUteis(cfg.aviso3)}</b></span>
          <span>Prioritário <b>{fmtUteis(cfg.prioAviso1)} · {fmtUteis(cfg.prioAviso2)} · {fmtUteis(cfg.prioAviso3)}</b></span>
          <span>Sua decisão com <b>{fmtUteis(cfg.repasse)}</b> sem resposta</span>
          <span>Horário útil <b>seg–sex {String(cfg.horaInicio).padStart(2, '0')}h–{String(cfg.horaFim).padStart(2, '0')}h</b></span>
          <span>Repasse <b>só com sua decisão</b></span>
        </div>
      )}

      <div className="gd-grid">
        {(decisoes.length > 0 || decisoesQ.isLoading) && (
          <Secao titulo="Aguardando sua decisão" badge={decisoes.length} badgeTom={decisoes.length > 0 ? 'rubro' : 'neutro'}
            sub="Clientes com 1 dia útil sem resposta. Escolha para quem repassar — a sugestão é quem mais converte — ou mantenha com o atendente." atraso={4}>
            {decisoesQ.isLoading ? <Skeleton altura={90} /> : (
              <div className="gd-decs">
                {decisoes.map((d) => (
                  <DecisaoLinha key={d.conversaId} d={d} atendentes={usuariosQ.data ?? []} agora={agora} aoAbrir={() => abrir(d.conversaId)} />
                ))}
              </div>
            )}
          </Secao>
        )}

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

        <Secao titulo="Pararam no robô — ligar" badge={ligar.length} badgeTom={ligar.length > 0 ? 'rubro' : 'neutro'}
          sub="Leads que o robô atendeu e pararam de responder há 2 horas úteis, sem nenhum contato humano. O dono de cada um recebeu o aviso pra ligar." atraso={5}>
          {ligar.length === 0 ? (
            <div className="gd-vazio ok">✓ Nenhum lead parado no robô agora.</div>
          ) : (
            <table className="gd-tab">
              <thead><tr><th>Cliente</th><th>Quem deve ligar</th><th>Aviso</th><th /></tr></thead>
              <tbody>
                {ligar.map((l) => (
                  <tr key={l.alertaId} className="clk" title="Abrir a conversa no inbox" onClick={() => abrir(l.conversaId)}>
                    <td className="forte"><span className="gd-cli"><span className="gd-av">{iniciaisDe(l.nome)}</span>{l.nome}</span></td>
                    <td className={l.donoId || l.donoNome ? '' : 'rub'}>{l.donoNome ?? (l.donoId ? (usuariosQ.data ?? []).find((u) => u.id === l.donoId)?.nome ?? 'Atendente' : 'Sem dono')}</td>
                    <td className="num mudo">{tempoRelativo(l.desde, agora)}</td>
                    <td className="gd-acao">Abrir →</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Secao>

        <Secao titulo="Quem mais fecha" sub="Conversão na janela (fechados ÷ recebidos), recalculada ao vivo — é daqui que sai a sugestão de repasse" atraso={5}>
          {rankingQ.isLoading ? <Skeleton altura={120} /> : ranking.length === 0 ? <div className="gd-vazio">Sem dados na janela.</div> : (
            <table className="gd-tab">
              <thead><tr><th>Atendente</th><th className="num">Fechados</th><th className="num">Recebidos</th><th className="num">Conversão</th><th className="num">Repasses sofridos</th></tr></thead>
              <tbody>
                {(() => { const topo = Math.max(...ranking.map((p) => p.taxa), 0.1); return ranking.map((p, i) => (
                  <tr key={p.usuarioId} className={i === 0 ? 'lider' : ''}>
                    <td><span className="gd-cli"><span className={'gd-av' + (i === 0 ? ' ouro' : '')}>{iniciaisDe(p.nome)}</span>{p.nome}{i === 0 && <span className="gd-coroa" title="Maior conversão da janela — sugestão padrão de repasse">🏆</span>}</span></td>
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

        <Secao titulo="Histórico de decisões" badge={repasses.length} badgeTom="neutro"
          sub="Cada linha é um cliente que ficou 1 dia útil sem resposta — o que você decidiu e o desfecho" atraso={6}>
          {repassesQ.isLoading ? <Skeleton altura={160} /> : repasses.length === 0 ? (
            <div className="gd-vazio">Nenhuma decisão ainda — a equipe está respondendo dentro do prazo. 👏</div>
          ) : (
            <table className="gd-tab">
              <thead><tr><th>Quando</th><th>Cliente</th><th>Decisão</th><th className="num">Sem resposta</th><th>Desfecho</th></tr></thead>
              <tbody>
                {repasses.slice(0, 80).map((r) => (
                  <tr key={r.id} className="clk" title="Abrir a conversa no inbox" onClick={() => abrir(r.conversaId)}>
                    <td className="num mudo">{dtCurta(r.criadoEm)}</td>
                    <td className="forte">{r.prioritario && <span title={'Lead PRIORITÁRIO no momento do vácuo: ' + (r.prioMotivo ?? '')}>{r.prioMotivo === 'documentação enviada' ? '📄 ' : '🔥 '}</span>}{r.contatoNome ?? '—'}</td>
                    <td>
                      {r.decisao === 'mantido' ? <span className="mudo">ficou com <b>{r.deNome}</b></span> : <span className={'gd-fluxo' + (r.desfeito ? ' riscado' : '')}>
                        <b className="de">{r.deNome}</b>
                        <svg viewBox="0 0 24 10" aria-hidden><path d="M1 5h19M16 1.5L20.5 5 16 8.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                        <b className="para">{r.paraNome}</b>
                      </span>}
                    </td>
                    <td className="num mudo">{fmtUteis(r.minutos)}</td>
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
