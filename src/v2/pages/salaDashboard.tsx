/* ============================================================
   Sala SDR — DASHBOARD (largura total, abaixo do palco)
   ------------------------------------------------------------
   Reusa a ANATOMIA e o CSS do Dashboard da casa (dashboard.css):
   grid bento .db-bento, heros .db-hero, seções .db-sec (o gráfico
   ESTICA e preenche o card → sem buraco branco), barras .db-barh,
   donut .db-donut, tooltip .db-tip, chips .db-delta. Paleta e
   config recharts idênticas (ticks 10.5px, sem grid, sem animação).
   Lê snap.resumo (agregado estável do motor).
   ============================================================ */
import { memo, useEffect, useState, type ReactNode } from 'react';
import {
  ResponsiveContainer, ComposedChart, Bar, Line, LineChart, Area, AreaChart, XAxis, YAxis, Tooltip, PieChart, Pie, Cell,
} from 'recharts';
import type { MotorSala, DashboardView, FunilLinha, RankingSdr } from '../sala/motor';
import '../pages/dashboard.css';
import './salaDashboard.css';

const iniciais = (nome: string) => nome.trim().split(/\s+/).slice(0, 2).map((p) => p[0] || '').join('').toUpperCase();

/* paleta resolvida (recharts não lê var()) — mesmos hex do Dashboard da casa */
const P = { txt: '#F4F5F7', txt2: '#9BA1AB', txt3: '#5E646E', verde: '#4ABE8C', rubro: '#E5665C', ambar: '#D9A44A', azul: '#4C8DFF', tint: '255, 255, 255' };
const tinta = (a: number) => `rgba(${P.tint}, ${a})`;
const eixo = { fontSize: 10.5, fill: P.txt3 };
const anima = false;
const fmt = (v: number | null | undefined) => (v == null ? '—' : String(v));
/* cls do funil → cor semântica da CASA (IA/bot → azul; ganho → verde; perda → rubro; resto monocromático) */
const corBarra = (c: string): string | undefined => (c === 'ok' ? P.verde : c === 'rubro' ? P.rubro : c === 'descarte' ? P.ambar : c === 'ativo' || c === 'triagem' ? P.azul : undefined);

/* tooltip vidro da casa (.db-tip) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function TipPlatina({ active, payload, label, sufixo, fmtLabel }: any) {
  if (!active || !payload?.length) return null;
  const rotulo = label == null ? '' : fmtLabel ? fmtLabel(label) : String(label);
  return (
    <div className="db-tip">
      <div className="tl">{rotulo}</div>
      {payload.map((s: { name?: string; value: number; color?: string }, i: number) => (
        <div className="tv num" key={i}>{s.value}{sufixo ? ` ${sufixo}` : s.name ? ` ${s.name}` : ''}</div>
      ))}
    </div>
  );
}

/* ---- cartões (mesma anatomia da casa) ---- */
function Hero({ span, rotulo, valor, sub, delta, spark, corSpark }: { span?: number; rotulo: string; valor: ReactNode; sub?: string; delta?: { txt: string; tom: 'ok' | 'er' | 'ne' }; spark?: number[]; corSpark?: string }) {
  return (
    <div className={`vidro db-hero${span ? ` db-span${span}` : ''}`}>
      <div className="rot">{rotulo}</div>
      <div className="val num">{valor}</div>
      <div className="pe">
        {delta && <span className={`db-delta ${delta.tom}`}>{delta.txt}</span>}
        {sub && <span className="sub">{sub}</span>}
      </div>
      {spark && spark.length > 1 && corSpark && (
        <div className="spark" aria-hidden>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={spark.map((v, i) => ({ i, v }))} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
              <defs><linearGradient id={'gs-' + rotulo} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={corSpark} stopOpacity={0.4} /><stop offset="100%" stopColor={corSpark} stopOpacity={0} /></linearGradient></defs>
              <Area dataKey="v" stroke={corSpark} strokeWidth={1.6} fill={`url(#gs-${rotulo})`} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function Secao({ span, titulo, sub, acao, graf, children }: { span: number; titulo: string; sub?: string; acao?: ReactNode; graf?: boolean; children: ReactNode }) {
  return (
    <div className={`vidro db-sec db-span${span}`}>
      <div className="db-sec-cab"><div><div className="t">{titulo}</div>{sub && <div className="s">{sub}</div>}</div>{acao}</div>
      {graf ? <div className="db-graf">{children}</div> : children}
    </div>
  );
}

function Barh({ linhas }: { linhas: FunilLinha[] }) {
  const max = Math.max(1, ...linhas.map((l) => l.n));
  return (
    <div className="db-barh">
      {linhas.map((l, i) => (
        <div className="lin" key={i}>
          <span className="rot"><span className="tx">{l.rotulo}</span></span>
          <div className="trilho"><i style={{ width: `${Math.max(2, (l.n / max) * 100)}%`, background: corBarra(l.cls) }} /></div>
          <span className="v num">{l.n}</span>
        </div>
      ))}
    </div>
  );
}

function MiniSpark({ pts, cor }: { pts: number[]; cor: string }) {
  const m = Math.max(1, ...pts); const w = 148, h = 26;
  const d = pts.map((v, i) => `${i === 0 ? 'M' : 'L'} ${(i / Math.max(1, pts.length - 1)) * w} ${h - (v / m) * h}`).join(' ');
  return <svg className="sd-spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden><path d={d} fill="none" stroke={cor} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" /></svg>;
}

/* leaderboard = lista de equipe no estilo .db-at da casa, com avatar + chips + medalha */
function Leaderboard({ sdrs }: { sdrs: RankingSdr[] }) {
  const maxProd = Math.max(1, ...sdrs.map((s) => s.producao));
  const medalha = ['①', '②', '③'];
  return (
    <div className="sd-lead">
      {sdrs.map((s, i) => (
        <div className={`sd-at${i === 0 && s.producao > 0 ? ' lider' : ''}`} key={s.id} style={{ ['--sdr' as string]: s.cor }}>
          <div className="pos num">{medalha[i] ?? i + 1}</div>
          <span className="av num">{iniciais(s.nome)}</span>
          <div className="who"><div className="nome">{s.nome}</div><div className="sub">{s.conversasAtivas} ativas · {s.recebidos} recebidos · {s.qualificados} qualif.</div></div>
          <div className="msgs"><MiniSpark pts={s.spark} cor="var(--txt-2)" /><span className="lab">{s.msgs} msgs</span></div>
          <div className="mid"><b className="num">{fmt(s.primeiraMedia)}</b><span>1ª resp.</span></div>
          <div className={`mid${s.maxEspera >= 10 ? ' er' : ''}`}><b className="num">{s.maxEspera}</b><span>maior espera</span></div>
          <div className="prod"><div className="pbar"><i style={{ width: `${Math.round((100 * s.producao) / maxProd)}%` }} /></div><b className="c ok num">{s.producao}</b></div>
        </div>
      ))}
    </div>
  );
}

function SalaDashboardBase({ snap, motor, real, resumoReal }: { snap: { resumo: DashboardView; feed: { hora: string; texto: string; destaque: boolean }[]; assinouPulse: number; versao: number }; motor: MotorSala | null; real?: boolean; resumoReal?: DashboardView | null }) {
  // Fase 2.2: em modo real o dashboard vem do `dashboard_resumo` (mesma fonte do
  // Dashboard da casa) montado em React; o snapshot do motor (mock) só serve à demo.
  const r = resumoReal ?? snap.resumo;
  const [flash, setFlash] = useState(false);
  useEffect(() => { if (!snap.assinouPulse) return; setFlash(true); const id = window.setTimeout(() => setFlash(false), 700); return () => window.clearTimeout(id); }, [snap.assinouPulse]);
  if (snap.versao < 0) return <div className="sala-dash-skel">Preparando dashboard…</div>;
  // real, mas o agregado do dia ainda carregando → esqueleto (não pisca 0s do mock)
  if (real && !resumoReal) return <div className="sala-dash-skel">Preparando o painel do dia…</div>;

  const leadsData = r.leadsPorHora.horas.map((h, i) => ({ hora: h, anúncio: r.leadsPorHora.anuncio[i] || 0, remarketing: r.leadsPorHora.remarketing[i] || 0, total: r.leadsPorHora.total[i] || 0 }));
  const msgsDonut = [{ nome: 'Triagem', v: r.bot.msgs, cor: P.azul }, { nome: 'Remarketing', v: r.bot.rmkMsgs, cor: P.ambar }].filter((x) => x.v > 0);
  const totalMsgs = r.bot.msgs + r.bot.rmkMsgs;
  const bf: FunilLinha[] = r.botFunil.map((b) => ({ rotulo: b.rotulo, n: b.chegaram, total: Math.max(1, r.botFunil[0]?.chegaram || 1), cls: 'ativo' as const }));
  const semanas = r.semanasSerie.map((s) => ({ ...s, nome: s.rotulo }));

  return (
    <div className="v2 db-pg sala-dash-wrap">
      <div className="sala-dash-h"><span className="caps">Dashboard operacional</span><span className="sub">dados do dia · atualiza ao vivo com a sala</span></div>

      <div className="db-bento">
        {/* Fileira 1 — heros */}
        <Hero rotulo="Leads hoje" valor={r.kpis[0]?.n ?? '—'} sub="entraram na sala" spark={r.leadsPorHora.total} corSpark={P.azul} />
        <Hero rotulo="Qualificados" valor={String(r.placar.qualificados)} sub="pelos SDRs" />
        <Hero rotulo="Casos abertos" valor={<span className={flash ? 'sd-flash' : undefined} style={{ color: P.verde }}>{r.placar.producao}</span>} sub="assinaram" delta={{ txt: `${r.placar.docs} em documentação`, tom: 'ne' }} />
        <Hero rotulo="1ª resposta" valor={<>{fmt(r.primeira.media)}<small style={{ fontSize: 13, color: P.txt3, fontWeight: 500 }}>{r.primeira.media != null ? ' min' : ''}</small></>} sub={`mediana ${fmt(r.primeira.mediana)}`} delta={r.primeira.sla5 != null ? { txt: `${r.primeira.sla5}% ≤5min`, tom: r.primeira.sla5 >= 60 ? 'ok' : r.primeira.sla5 >= 40 ? 'ne' : 'er' } : undefined} />

        {/* Fileira 2 — leads/hora (8) + mensagens do bot donut (4) */}
        <Secao span={real ? 12 : 8} titulo="Leads por hora" sub={real ? 'mensagens recebidas por hora' : 'anúncio × remarketing ao longo do dia'} graf>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={leadsData} margin={{ top: 6, right: 4, left: -8, bottom: 0 }}>
              <XAxis dataKey="hora" tick={eixo} tickLine={false} axisLine={{ stroke: tinta(0.09) }} interval={0} />
              <YAxis tick={eixo} tickLine={false} axisLine={false} allowDecimals={false} width={38} />
              <Tooltip cursor={{ fill: tinta(0.05) }} content={<TipPlatina />} />
              <Bar dataKey="anúncio" stackId="a" fill={P.azul} fillOpacity={0.85} maxBarSize={30} isAnimationActive={anima} />
              <Bar dataKey="remarketing" stackId="a" fill={P.ambar} fillOpacity={0.85} maxBarSize={30} radius={[3, 3, 0, 0]} isAnimationActive={anima} />
              <Line dataKey="total" stroke={P.txt2} strokeWidth={1.6} dot={false} isAnimationActive={anima} />
            </ComposedChart>
          </ResponsiveContainer>
        </Secao>
        {!real && (
        <Secao span={4} titulo="Mensagens do bot" sub="triagem × remarketing">
          <div className="db-donut-wrap">
            <div className="db-donut">
              {totalMsgs > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart><Pie data={msgsDonut} dataKey="v" nameKey="nome" innerRadius="68%" outerRadius="94%" startAngle={90} endAngle={-270} stroke="none" paddingAngle={2} isAnimationActive={anima}>{msgsDonut.map((x) => <Cell key={x.nome} fill={x.cor} />)}</Pie></PieChart>
                </ResponsiveContainer>
              ) : null}
              <div className="centro"><b className="num">{totalMsgs}</b><span>mensagens</span></div>
            </div>
            <div className="db-donut-leg">
              <div className="li"><i style={{ background: P.azul }} />Triagem <b className="num">{r.bot.msgs}</b></div>
              <div className="li"><i style={{ background: P.ambar }} />Remarketing <b className="num">{r.bot.rmkMsgs}</b></div>
            </div>
          </div>
        </Secao>
        )}

        {/* Fileira 3 — leaderboard (7) + funil do dia (5) */}
        <Secao span={7} titulo="Ranking por SDR" sub="produção · qualificação · velocidade">
          <Leaderboard sdrs={r.sdrs} />
        </Secao>
        <Secao span={5} titulo="Funil do dia" sub="queda entre etapas">
          <Barh linhas={r.funilDia} />
        </Secao>

        {/* Fileira 4 — onde estão (real: largura total) + automação do bot (só mock) */}
        <Secao span={real ? 12 : 6} titulo="Onde estão agora" sub="mapa da sala">
          <Barh linhas={r.ondeAgora} />
        </Secao>
        {!real && (
        <Secao span={6} titulo="Matheo — automação da triagem" sub="onde os leads param">
          <div className="sd-auto">
            <div className="sd-auto-kpis">
              <div className="k"><b className="num" style={{ color: P.azul }}>{fmt(r.bot.conclusao)}{r.bot.conclusao != null && '%'}</b><span>concluem</span></div>
              <div className="k"><b className="num">{fmt(r.bot.tempoMedio)}<small>{r.bot.tempoMedio != null ? 'min' : ''}</small></b><span>tempo médio</span></div>
              <div className="k"><b className="num">{r.bot.naCadencia}</b><span>na cadência</span></div>
              <div className="k"><b className="num" style={{ color: P.verde }}>{r.bot.rmkVoltas}</b><span>recuperados</span></div>
            </div>
            <Barh linhas={bf} />
          </div>
        </Secao>
        )}

        {/* Fileira 5 — motivos NE (6) + encaminhados (6) */}
        <Secao span={6} titulo="Motivos de não-trabalhável" sub="Pareto">
          {r.motivosNE.length ? <Barh linhas={r.motivosNE.map((m) => ({ ...m, cls: 'descarte' as unknown as FunilLinha['cls'] }))} /> : <div className="db-vazio"><span aria-hidden>◌</span> Nenhum não-trabalhável ainda.</div>}
        </Secao>
        <Secao span={6} titulo="Encaminhados por SDR" sub="pelo Matheo · ocupação das mesas">
          <Barh linhas={r.encaminhados} />
          <div className="sd-mesas">{r.mesas.map((m) => <span key={m.id} className="mesa-led" title={`${m.nome}: ${m.desc}`}><i style={{ background: m.cor }} />{m.nome}</span>)}</div>
        </Secao>

        {/* Fileira 6 — arrasto de semanas (2.3) + feed (2.1): sem fonte real ainda → só mock */}
        {!real && (<>
        <Secao span={8} titulo="Arrasto de semanas" sub="casos · perdidos · não-trabalháveis por semana" graf>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={semanas} margin={{ top: 6, right: 8, left: -8, bottom: 0 }} onClick={(e) => { const w = (e as unknown as { activePayload?: { payload: { w: number } }[] })?.activePayload?.[0]?.payload?.w; if (w != null) motor?.verSemana(w); }}>
              <XAxis dataKey="nome" tick={eixo} tickLine={false} axisLine={{ stroke: tinta(0.09) }} />
              <YAxis tick={eixo} tickLine={false} axisLine={false} allowDecimals={false} width={38} />
              <Tooltip content={<TipPlatina />} />
              <Line dataKey="abertos" name="casos" stroke={P.verde} strokeWidth={2} dot={{ r: 3 }} isAnimationActive={anima} />
              <Line dataKey="perdidos" name="perdidos" stroke={P.rubro} strokeWidth={1.6} dot={{ r: 2 }} isAnimationActive={anima} />
              <Line dataKey="naoTrab" name="não-trab." stroke={P.ambar} strokeWidth={1.4} dot={{ r: 2 }} isAnimationActive={anima} />
              <Line dataKey="pend" name="em aberto" stroke={P.txt2} strokeWidth={1.4} strokeDasharray="4 3" dot={false} isAnimationActive={anima} />
            </LineChart>
          </ResponsiveContainer>
        </Secao>
        <Secao span={4} titulo="Feed de operação" sub="ao vivo">
          <div className="sd-feed">
            {snap.feed.length ? snap.feed.map((e, i) => <div key={i} className={`ev${i === 0 ? ' novo' : ''}${e.destaque ? ' dest' : ''}`}><span className="h num">{e.hora}</span><span>{e.texto}</span></div>) : <div className="db-vazio"><span aria-hidden>◌</span> Aguardando eventos…</div>}
          </div>
        </Secao>
        </>)}
      </div>
    </div>
  );
}

export const SalaDashboard = memo(SalaDashboardBase, (a, b) => a.snap.versao === b.snap.versao && a.resumoReal === b.resumoReal && a.real === b.real);
export default SalaDashboard;
