import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  DASH_REAL, PRESETS_DASH, agrupaPorFonte, periodoDash, useDashboardResumo,
  type DashAtendente, type DashKpis, type DashLinhaFunil, type DashResumo, type PresetDash,
} from '@/data/dashboard';
import { kpi, spHoje, addDias, type Kpi as KpiNum } from '@/data/relatorios';
import { rotuloMotivoPerda } from '@/data/kanban';
import { CardVidro, Chip, Chips, EstadoErro, EstadoVazio, Input, Skeleton } from '../components';
import './dashboard.css';

/* ------------------------------------------------------------------
   Dashboard operacional — a foto do dia da operação em uma tela.
   Uma RPC (dashboard_resumo) por período; trocar de chip = 1 request.
   Padrões Platina: cabeçalho .ph, filtros em chips, cards de vidro,
   base monocromática e cor só como semântica (ganho/perda e deltas).
   ------------------------------------------------------------------ */

/* ===== formatação PT-BR ===== */
const fmtInt = (n: number) => Math.round(n).toLocaleString('pt-BR');
const fmtBRL = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const fmtMin = (n: number | null) => {
  if (n == null) return '—';
  if (n < 60) return `${Math.round(n)} min`;
  const h = Math.floor(n / 60);
  const m = Math.round(n % 60);
  return m === 0 ? `${h}h` : `${h}h ${m}min`;
};
const fmtDiaCurto = (iso: string) => {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
};

/* ===== paleta dos gráficos =====
   Recharts recebe `fill`/`stroke` como ATRIBUTO de SVG, e atributo não
   resolve var(--token) — o mesmo motivo pelo qual as sparklines do Kpi
   usam style. Então lemos os tokens JÁ RESOLVIDOS de um elemento dentro
   de .v2 e repassamos cor concreta. Um MutationObserver na raiz relê
   quando o tema (data-tema) ou o Modo de Performance (data-perf) muda,
   para o gráfico traduzir junto com o resto da tela. */
interface Paleta {
  txt: string; txt2: string; txt3: string;
  verde: string; rubro: string; tint: string;
  lite: boolean;
}
const PALETA_DARK: Paleta = {
  txt: '#F4F5F7', txt2: '#9BA1AB', txt3: '#5E646E',
  verde: '#4ABE8C', rubro: '#E5665C', tint: '255, 255, 255', lite: false,
};

function usePaleta(ref: React.RefObject<HTMLElement | null>): Paleta {
  const [p, setP] = useState<Paleta>(PALETA_DARK);
  useEffect(() => {
    const ler = () => {
      const el = ref.current;
      if (!el) return;
      const cs = getComputedStyle(el);
      const v = (n: string, padrao: string) => cs.getPropertyValue(n).trim() || padrao;
      setP({
        txt: v('--txt', PALETA_DARK.txt),
        txt2: v('--txt-2', PALETA_DARK.txt2),
        txt3: v('--txt-3', PALETA_DARK.txt3),
        verde: v('--verde', PALETA_DARK.verde),
        rubro: v('--rubro', PALETA_DARK.rubro),
        tint: v('--tint', PALETA_DARK.tint),
        lite: document.documentElement.getAttribute('data-perf') === 'lite',
      });
    };
    ler();
    const mo = new MutationObserver(ler);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-tema', 'data-perf'] });
    return () => mo.disconnect();
  }, [ref]);
  return p;
}

const tinta = (p: Paleta, a: number) => `rgba(${p.tint}, ${a})`;

/* ===== tooltip único (vidro Platina, não o branco padrão do Recharts) ===== */
/* ATENÇÃO: com `content` customizado o Recharts NÃO aplica o labelFormatter
   do <Tooltip> — ele só vale para o tooltip padrão. Por isso o rótulo é
   formatado aqui dentro (fmtLabel), senão chega cru ("2026-08-15", "14"). */
function TipPlatina({ active, payload, label, sufixo, fmt = fmtInt, fmtLabel }: {
  active?: boolean; payload?: { value: number; payload?: Record<string, unknown> }[];
  label?: string | number; sufixo?: string;
  fmt?: (n: number) => string; fmtLabel?: (v: string | number) => string;
}) {
  if (!active || !payload?.length) return null;
  const rotulo = label == null ? '' : fmtLabel ? fmtLabel(label) : String(label);
  return (
    <div className="db-tip">
      <div className="tl">{rotulo}</div>
      <div className="tv num">{fmt(payload[0].value)}{sufixo ? ` ${sufixo}` : ''}</div>
    </div>
  );
}

/* ===== KPI ===== */
/* 'neutro' existe para o Descartado: mais descarte não é vitória nem derrota
   — é filtro de perfil funcionando. Mostra a variação sem julgá-la. */
type Sentido = 'maior' | 'menor' | 'neutro';

function KpiCard({ rotulo, k, sentido, fmt, ajuda, sobe, atraso, indisponivel }: {
  rotulo: string; k: KpiNum | null; sentido: Sentido; fmt: (n: number) => string;
  ajuda: string; sobe?: boolean; atraso?: number; indisponivel?: string;
}) {
  let delta: ReactNode = null;
  if (k) {
    const txt = k.deltaPct == null ? '—' : `${k.deltaPct > 0 ? '+' : ''}${k.deltaPct.toFixed(1)}%`;
    if (k.deltaAbs === 0) {
      delta = <span className="delta d-ne">— estável</span>;
    } else if (sentido === 'neutro') {
      delta = <span className="delta d-ne">{k.deltaAbs > 0 ? '▲' : '▼'} {txt}</span>;
    } else {
      // "melhor" depende do sentido: em tempo de resposta, cair é ganhar.
      const bom = sentido === 'maior' ? k.deltaAbs > 0 : k.deltaAbs < 0;
      delta = <span className={'delta ' + (bom ? 'd-ok' : 'd-er')}>{k.deltaAbs > 0 ? '▲' : '▼'} {txt}</span>;
    }
  }
  return (
    <CardVidro spot sobe={sobe} atraso={atraso} className="db-kpi" title={ajuda}>
      <div className="rot">{rotulo}</div>
      {indisponivel ? (
        <>
          <div className="val ind">{indisponivel}</div>
          <div className="ant">{ajuda}</div>
        </>
      ) : (
        <>
          <div className="val num">{k ? fmt(k.atual) : '—'}</div>
          {delta}
          <div className="ant num">Anterior: {k ? fmt(k.anterior) : '—'}</div>
        </>
      )}
    </CardVidro>
  );
}

function KpiSkeleton({ atraso }: { atraso: number }) {
  return (
    <CardVidro sobe atraso={atraso} className="db-kpi">
      <Skeleton largura="52%" altura={9} />
      <div style={{ marginTop: 12 }}><Skeleton largura="66%" altura={20} /></div>
      <div style={{ marginTop: 10 }}><Skeleton largura="44%" altura={9} /></div>
    </CardVidro>
  );
}

/* ===== painel ===== */
function Painel({ titulo, nota, children, sobe, atraso, className }: {
  titulo: string; nota?: ReactNode; children: ReactNode; sobe?: boolean; atraso?: number; className?: string;
}) {
  return (
    <CardVidro sobe={sobe} atraso={atraso} className={'db-painel ' + (className ?? '')}>
      <div className="tt">{titulo}{nota && <span>{nota}</span>}</div>
      {children}
    </CardVidro>
  );
}

function Vazio({ texto }: { texto: string }) {
  return <div className="db-vazio"><span aria-hidden>◌</span> {texto}</div>;
}

/* ===== barras horizontais monocromáticas (motivos, bancos) ===== */
function BarrasH({ itens }: { itens: { rot: string; v: number; tag?: string }[] }) {
  const max = Math.max(1, ...itens.map((i) => i.v));
  return (
    <div className="db-barh">
      {itens.map((i) => (
        <div className="lin" key={i.rot}>
          <span className="rot" title={i.rot}>
            {i.rot}{i.tag && <b className="db-tag">{i.tag}</b>}
          </span>
          <div className="trilho">
            <i style={{ width: `${Math.max(2, (i.v / max) * 100)}%` }} />
          </div>
          <span className="v num">{fmtInt(i.v)}</span>
        </div>
      ))}
    </div>
  );
}

/* ===== funil =====
   A coluna terminal negativa do Kanban é balde único: TODO fechamento
   negativo cai nela, seja quem nunca foi elegível ou quem escapou. Então
   ela vira barra EMPILHADA — descarte em monocromático, perda em rubro. */
function BarrasFunil({ linhas }: { linhas: DashLinhaFunil[] }) {
  const max = Math.max(1, ...linhas.map((l) => l.qtd));
  return (
    <div className="db-barh">
      {linhas.map((l) => {
        const larg = Math.max(2, (l.qtd / max) * 100);
        const parte = l.resultado === 'perdido' && l.qtd > 0;
        return (
          <div className="lin" key={l.coluna}>
            <span className="rot" title={l.coluna}>{l.coluna}</span>
            <div className="trilho">
              {parte ? (
                <div className="pilha" style={{ width: `${larg}%` }}>
                  {l.qtd_descarte > 0 && (
                    <i className="f-descarte" style={{ flexGrow: l.qtd_descarte }}
                      title={`${fmtInt(l.qtd_descarte)} descartados — fora do perfil`} />
                  )}
                  {l.qtd_perda > 0 && (
                    <i className="f-perdido" style={{ flexGrow: l.qtd_perda }}
                      title={`${fmtInt(l.qtd_perda)} perdidos de verdade`} />
                  )}
                </div>
              ) : (
                <i className={l.resultado === 'ganho' ? 'f-ganho' : undefined}
                  style={{ width: `${larg}%` }} />
              )}
            </div>
            <span className="v num">{fmtInt(l.qtd)}</span>
          </div>
        );
      })}
    </div>
  );
}

/* ==================================================================
   Página
   ================================================================== */
export default function DashboardV2() {
  const raiz = useRef<HTMLDivElement>(null);
  const p = usePaleta(raiz);

  const [preset, setPreset] = useState<PresetDash>('7d');
  const [ini, setIni] = useState(() => addDias(spHoje(), -6));
  const [fim, setFim] = useState(() => spHoje());
  const [fonteAberta, setFonteAberta] = useState<string | null>(null);

  const periodo = useMemo(() => periodoDash(preset, ini, fim), [preset, ini, fim]);
  const { data, isPending, isError, error, refetch, isFetching } = useDashboardResumo(periodo);

  const d = data as DashResumo | undefined;
  const carregando = DASH_REAL && isPending;

  const kp = (sel: (k: DashKpis) => number | null): KpiNum | null => {
    if (!d) return null;
    const a = sel(d.kpis); const b = sel(d.kpis_anterior);
    if (a == null || b == null) return null;
    return kpi(a, b);
  };

  const origens = useMemo(() => (d ? agrupaPorFonte(d.origem_trafego) : []), [d]);
  const atendentes = useMemo(
    () => (d ? [...d.atendentes].sort((a, b) => b.ganhos - a.ganhos || b.msgs_enviadas - a.msgs_enviadas) : []),
    [d],
  );

  /* eixos e grades saem do token — traduzem sozinhos no tema claro */
  const eixo = { fontSize: 10.5, fill: p.txt3 };
  const anima = !p.lite; // Modo Leve: gráfico entra pronto, sem animação

  if (!DASH_REAL) {
    return (
      <div className="db-pg" ref={raiz}>
        <div className="ph"><div><h2>Dashboard</h2><p>A foto da operação no período.</p></div></div>
        <CardVidro className="db-painel">
          <EstadoVazio titulo="Sem conexão com os dados" descricao="O Dashboard lê direto do banco da organização." />
        </CardVidro>
      </div>
    );
  }

  return (
    <div className="db-pg" ref={raiz}>
      <div className="ph">
        <div>
          <h2>Dashboard</h2>
          <p>A foto da operação — {periodo.label}{isFetching && !carregando ? ' · atualizando…' : ''}</p>
        </div>
      </div>

      {/* filtros de período */}
      <div className="db-filtros">
        <Chips>
          {PRESETS_DASH.map((op) => (
            <Chip key={op.id} ativo={preset === op.id} onClick={() => setPreset(op.id)}>{op.label}</Chip>
          ))}
        </Chips>
        {preset === 'custom' && (
          <div className="db-datas">
            <Input type="date" value={ini} max={fim} onChange={(e) => setIni(e.target.value)} aria-label="Data inicial" />
            <span aria-hidden>→</span>
            <Input type="date" value={fim} min={ini} max={spHoje()} onChange={(e) => setFim(e.target.value)} aria-label="Data final" />
          </div>
        )}
        <span className="db-comp">vs {periodo.prevLabel}</span>
      </div>

      {isError ? (
        <CardVidro className="db-painel">
          <EstadoErro
            descricao={(error as Error)?.message ?? 'Não foi possível carregar o período.'}
            aoTentarDeNovo={() => void refetch()}
          />
        </CardVidro>
      ) : (
        <>
          {/* ===== KPIs ===== */}
          <div className="db-kpis">
            {carregando ? (
              Array.from({ length: 6 }, (_, i) => <KpiSkeleton key={i} atraso={i * 0.04} />)
            ) : (
              <>
                <KpiCard rotulo="Novos leads" k={kp((k) => k.novos_leads)} sentido="maior" fmt={fmtInt}
                  ajuda="Contatos criados no período (duplicatas mescladas não contam)." sobe atraso={0} />
                <KpiCard rotulo="Conversas ativas" k={kp((k) => k.conversas_ativas)} sentido="maior" fmt={fmtInt}
                  ajuda="Conversas com pelo menos uma mensagem no período." sobe atraso={0.04} />
                <KpiCard rotulo="1ª resposta (mediana)" k={kp((k) => k.mediana_primeira_resposta_min)} sentido="menor" fmt={fmtMin}
                  ajuda="Do primeiro “oi” do cliente até a primeira resposta humana — bot não conta. Mediana, não média."
                  indisponivel={d && d.kpis.mediana_primeira_resposta_min == null ? 'Sem resposta' : undefined}
                  sobe atraso={0.08} />
                <KpiCard rotulo="Ganhos" k={kp((k) => k.ganhos_qtd)} sentido="maior" fmt={fmtInt}
                  ajuda="Oportunidades fechadas como ganho no período." sobe atraso={0.12} />
                <KpiCard rotulo="Valor ganho" k={kp((k) => k.ganhos_valor)} sentido="maior" fmt={fmtBRL}
                  ajuda="Soma do ressarcido (ou do estimado, quando o ressarcido ainda não foi preenchido)."
                  indisponivel={d && d.kpis.ganhos_valor === 0 && d.kpis.ganhos_qtd > 0 ? 'Sem valor' : undefined}
                  sobe atraso={0.16} />
                <KpiCard rotulo="Perdidos" k={kp((k) => k.perdidos_qtd)} sentido="menor" fmt={fmtInt}
                  ajuda="Perda de verdade: era ganhável e escapou (sem interesse, dados inválidos, concorrente, não respondeu)."
                  sobe atraso={0.2} />
                <KpiCard rotulo="Descartados" k={kp((k) => k.descartados_qtd)} sentido="neutro" fmt={fmtInt}
                  ajuda="Fora do perfil — quem já tem processo / não é elegível. Não conta como perda: nunca foi ganhável."
                  sobe atraso={0.24} />
              </>
            )}
          </div>

          {/* ===== leads por dia ===== */}
          <Painel titulo="Leads por dia" nota={periodo.label} sobe atraso={0.24}>
            {carregando ? <Skeleton altura={200} raio={12} /> : !d?.leads_por_dia?.length ? (
              <Vazio texto="Nenhum lead no período." />
            ) : (
              <div style={{ height: 220 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={d.leads_por_dia} margin={{ top: 6, right: 4, left: -18, bottom: 0 }}>
                    <XAxis dataKey="dia" tickFormatter={fmtDiaCurto} tick={eixo} tickLine={false}
                      axisLine={{ stroke: tinta(p, 0.09) }} interval="preserveStartEnd" minTickGap={14} />
                    <YAxis tick={eixo} tickLine={false} axisLine={false} allowDecimals={false} width={44} />
                    <Tooltip cursor={{ fill: tinta(p, 0.05) }}
                      content={<TipPlatina sufixo="leads" fmtLabel={(v) => fmtDiaCurto(String(v))} />} />
                    <Bar dataKey="qtd" radius={[4, 4, 0, 0]} maxBarSize={38}
                      fill={tinta(p, 0.5)} isAnimationActive={anima} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Painel>

          <div className="db-g2">
            {/* ===== origem de tráfego ===== */}
            <Painel titulo="Origem de tráfego" nota="clique para ver os canais" sobe atraso={0.28}>
              {carregando ? <Skeleton altura={160} raio={12} /> : !origens.length ? (
                <Vazio texto="Nenhum lead com origem no período." />
              ) : (
                <div className="db-origem">
                  {origens.map((g) => {
                    const max = Math.max(1, ...origens.map((x) => x.qtd));
                    const aberta = fonteAberta === g.fonte;
                    return (
                      <div key={g.fonte} className={'grp' + (aberta ? ' on' : '')}>
                        <button type="button" className="cab"
                          onClick={() => setFonteAberta(aberta ? null : g.fonte)}
                          aria-expanded={aberta}>
                          <span className="seta" aria-hidden>{aberta ? '▾' : '▸'}</span>
                          <span className="rot" title={g.fonte}>{g.fonte}</span>
                          <div className="trilho"><i style={{ width: `${Math.max(2, (g.qtd / max) * 100)}%` }} /></div>
                          <span className="v num">{fmtInt(g.qtd)}</span>
                        </button>
                        {aberta && (
                          <div className="canais">
                            {g.canais.map((c) => (
                              <div className="lin" key={c.canal}>
                                <span className="rot" title={c.canal}>{c.canal}</span>
                                <div className="trilho"><i style={{ width: `${Math.max(2, (c.qtd / g.qtd) * 100)}%` }} /></div>
                                <span className="v num">{fmtInt(c.qtd)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </Painel>

            {/* ===== funil ===== */}
            <Painel titulo="Funil" nota="abertas agora · fechadas no período" sobe atraso={0.32}>
              {carregando ? <Skeleton altura={160} raio={12} /> : !d?.funil?.length ? (
                <Vazio texto="Nenhuma coluna de funil ativa." />
              ) : (
                <>
                  <BarrasFunil linhas={d.funil} />
                  {d.funil.some((f) => f.qtd_descarte > 0) && (
                    <div className="db-legenda">
                      <span><i className="sw f-ganho" aria-hidden /> ganho</span>
                      <span><i className="sw f-descarte" aria-hidden /> descarte (fora do perfil)</span>
                      <span><i className="sw f-perdido" aria-hidden /> perda real</span>
                    </div>
                  )}
                </>
              )}
            </Painel>
          </div>

          {/* ===== atendentes ===== */}
          <Painel titulo="Atendentes" nota="ordenado por ganhos" sobe atraso={0.36}>
            {carregando ? <Skeleton altura={140} raio={12} /> : !atendentes.length ? (
              <Vazio texto="Nenhum atendente ativo na organização." />
            ) : (
              <>
                <div className="db-scroll">
                  <table className="db-tab">
                    <thead>
                      <tr>
                        <th>Atendente</th>
                        <th className="n">Conversas</th>
                        <th className="n">Mensagens</th>
                        <th className="n">1ª resposta</th>
                        <th className="n">Ganhos</th>
                        <th className="n">Perdidos</th>
                        <th className="n">Descartados</th>
                      </tr>
                    </thead>
                    <tbody>
                      {atendentes.map((a: DashAtendente) => (
                        <tr key={a.nome}>
                          <td className="nm">{a.nome}</td>
                          <td className="n num">{fmtInt(a.conversas_atribuidas)}</td>
                          <td className="n num">{fmtInt(a.msgs_enviadas)}</td>
                          <td className="n num">{fmtMin(a.mediana_resposta_min)}</td>
                          <td className="n num ok">{fmtInt(a.ganhos)}</td>
                          <td className="n num er">{fmtInt(a.perdidos)}</td>
                          <td className="n num">{fmtInt(a.descartados)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="db-nota">
                  Só entra aqui o que o painel consegue atribuir: mensagem respondida do celular do
                  consultor não tem autor no banco e fica de fora destas colunas — mas continua contando
                  na 1ª resposta geral lá em cima.
                </p>
              </>
            )}
          </Painel>

          {/* ===== linha final ===== */}
          <div className="db-g3">
            <Painel titulo="Horários de pico" nota="entradas por hora" sobe atraso={0.4}>
              {carregando ? <Skeleton altura={150} raio={12} /> : !d?.picos_hora?.some((h) => h.qtd > 0) ? (
                <Vazio texto="Nenhuma mensagem recebida no período." />
              ) : (
                <div style={{ height: 168 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={d.picos_hora} margin={{ top: 4, right: 2, left: -26, bottom: 0 }}>
                      <XAxis dataKey="hora" tick={eixo} tickLine={false} axisLine={{ stroke: tinta(p, 0.09) }}
                        interval={3} tickFormatter={(h) => `${h}h`} />
                      <YAxis tick={eixo} tickLine={false} axisLine={false} allowDecimals={false} width={42} />
                      <Tooltip cursor={{ fill: tinta(p, 0.05) }}
                        content={<TipPlatina sufixo="mensagens" fmtLabel={(v) => `${v}h`} />} />
                      <Bar dataKey="qtd" radius={[3, 3, 0, 0]} fill={tinta(p, 0.42)} isAnimationActive={anima} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Painel>

            <Painel titulo="Motivos de saída" nota="eventos do período" sobe atraso={0.44}>
              {carregando ? <Skeleton altura={150} raio={12} /> : !d?.motivos_perda?.length ? (
                <Vazio texto="Nenhuma saída registrada no período." />
              ) : (
                <>
                  <BarrasH itens={d.motivos_perda.map((m) => ({
                    rot: m.motivo === 'Sem motivo' ? 'Sem motivo' : rotuloMotivoPerda(m.motivo) || m.motivo,
                    v: m.qtd,
                    tag: m.grupo === 'descarte' ? 'descarte' : undefined,
                  }))} />
                  {/* evento ≠ estado: quem foi marcado perdido e depois reaberto
                      aparece aqui, mas nos KPIs conta pelo que é HOJE. */}
                  <p className="db-nota">Conta o que foi registrado no período. Uma oportunidade reaberta depois continua listada aqui, mas nos KPIs vale o estado atual.</p>
                </>
              )}
            </Painel>

            <Painel titulo="Bancos mais citados" nota="fichas do período" sobe atraso={0.48}>
              {carregando ? <Skeleton altura={150} raio={12} /> : !d?.bancos?.length ? (
                <Vazio texto="Nenhuma ficha judicial no período." />
              ) : (
                <BarrasH itens={d.bancos.map((b) => ({ rot: b.banco, v: b.qtd }))} />
              )}
            </Painel>
          </div>
        </>
      )}
    </div>
  );
}
