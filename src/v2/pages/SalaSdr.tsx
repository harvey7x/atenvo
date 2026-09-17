/* ============================================================
   Sala SDR — página (visão inicial do painel) · REDESENHO
   ------------------------------------------------------------
   Layout (pedido do dono): CENA isométrica ESTICADA em largura
   total no topo (palco imersivo, dirigido pelo motor a 60fps) +
   DASHBOARD completo em largura total EMBAIXO (React lendo o
   snapshot). O detalhe (clicar num boneco/SDR/bot) vira um DRAWER
   sobre o palco — a sala segue viva atrás.

   Fase 1: dados fictícios (motor.ts). Nada de backend. O orgId
   entra por contexto (useOrg) pra a Fase 2 encaixar — ver tipos.ts.
   ============================================================ */
import { Suspense, useCallback, useEffect, useReducer, useRef, useSyncExternalStore, type CSSProperties } from 'react';
import { useOrg } from '@/context/OrgContext';
import { useSalaReal, SALA_REAL } from '@/data/sala';
import { lazyComRecarga as lazy } from '@/lib/recargaChunk';
import { type Look } from '../sala/boneco';
import { bonecoPixelSVG, botPixelSVG } from '../sala/bonecoPixel';
import { criarMotor, type MotorSala, type Snapshot, type DashboardView, type KpiView, type FunilLinha, type ItemLista, type ConversaView } from '../sala/motor';
import '../tokens.css';
import '../base.css';
import '../components/componentes.css';
import './salaSdr.css';

const SalaDashboard = lazy(() => import('./salaDashboard'));

const RESUMO_VAZIO: DashboardView = {
  kpis: [], placar: { qualificados: 0, docs: 0, producao: 0 }, funilDia: [], ondeAgora: [],
  leadsPorHora: { horas: [], anuncio: [], remarketing: [], total: [], agora: 0 },
  primeira: { media: null, mediana: null, sla5: null, histograma: [] }, primeiraPorFatia: [], sdrs: [],
  botFunil: [], bot: { triados: 0, conclusao: null, abandonos: 0, tempoMedio: null, tempos: [], msgs: 0, rmkMsgs: 0, rmkVoltas: 0, naCadencia: 0 },
  remarketing: { naCadencia: 0, rmkVoltas: 0, rmkMsgs: 0, porHora: [] }, motivosNE: [], encaminhados: [], semanasSerie: [], mesas: [],
};
const SNAP_VAZIO: Snapshot = {
  versao: -1, pausado: false, vel: 1, relogio: '', semanas: [], congelada: null, hud: [], feed: [],
  selecao: 'sala', convSel: null, aba: 'agora', painel: { tipo: 'sala', titulo: 'Sala SDR', kpis: [], secoes: [] },
  resumo: RESUMO_VAZIO, assinouPulse: 0,
};
const semSub = () => () => {};
const leg = (v: string): CSSProperties => ({ background: `var(${v})` });

export default function SalaSdr() {
  const { currentOrg } = useOrg();
  const org = currentOrg?.name ?? 'Atenvo';

  // Fase 2.0: foto real do Supabase (null em demo/sem-org → o motor usa o mock)
  const { estado: salaReal } = useSalaReal();

  const motorRef = useRef<MotorSala | null>(null);
  const [, forcar] = useReducer((x: number) => x + 1, 0);
  const montarSvg = useCallback((el: SVGSVGElement | null) => {
    if (el && !motorRef.current) { motorRef.current = criarMotor(el, { modoReal: SALA_REAL }); forcar(); }
    else if (!el && motorRef.current) { motorRef.current.destruir(); motorRef.current = null; }
  }, []);

  const motor = motorRef.current;
  const snap = useSyncExternalStore(motor ? motor.assinar : semSub, motor ? motor.snapshot : () => SNAP_VAZIO);

  // alimenta o motor com a foto real sempre que ela chega (ou quando o motor fica pronto)
  useEffect(() => { if (SALA_REAL && salaReal && motor) motor.aplicarReal(salaReal); }, [salaReal, motor]);
  const drawerAberto = snap.selecao !== 'sala';

  // limpa o nó de toast (criado fora da árvore React) e o timer ao desmontar a página
  useEffect(() => () => { window.clearTimeout(toastTimer); document.getElementById('sala-toast')?.remove(); }, []);

  // exportar o relatório do dia (CSV): categorias, motivos e números por cliente
  const exportar = useCallback(() => {
    const csv = motorRef.current?.exportarCsv();
    if (!csv) return;
    const d = new Date();
    const nome = `sala-sdr-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.csv`;
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    toast('Relatório do dia exportado (CSV).');
  }, []);

  return (
    <div className="v2 sala pg-entra">
      {/* ---------- PALCO (largura total, topo) ---------- */}
      <section className="sala-palco">
        <div className="palco-cena">
          <svg ref={montarSvg} viewBox="0 0 1290 790" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" aria-label="Escritório da equipe SDR" role="img" />
        </div>

        {/* topo flutuante: command bar + HUD empilhados (nunca se sobrepõem) */}
        <div className="palco-top">
        <header className="cmd vidro">
          <div className="cmd-brand">
            <span className="cmd-titulo p-display">Sala SDR</span>
            <span className="cmd-org">{org}</span>
          </div>
          <span className="cmd-relogio num">{snap.relogio || '—'}</span>
          <span className="cmd-vivo"><i aria-hidden />ao vivo</span>
          <div className="cmd-semanas" role="group" aria-label="Semana exibida">
            {snap.semanas.map((s) => (
              <button key={s.w} type="button" className={s.ativa ? 'sw on' : 'sw'} aria-pressed={s.ativa} onClick={() => motor?.verSemana(s.w)}>
                {s.rotulo}{s.pend > 0 && <span className="sw-pend num">{s.pend}</span>}
              </button>
            ))}
          </div>
          <div className="cmd-controles">
            <button type="button" className={'p-btn btn-sec btn-mini' + (snap.pausado ? ' on' : '')} onClick={() => motor?.pausar()}>{snap.pausado ? '▶ Continuar' : '⏸ Pausar'}</button>
            <button type="button" className={'p-btn btn-sec btn-mini' + (snap.vel === 3 ? ' on' : '')} onClick={() => motor?.alternarVelocidade()}>{snap.vel}×</button>
            <button type="button" className="p-btn btn-sec btn-mini" onClick={() => motor?.leadNovo()}>+ Lead</button>
            <button type="button" className="p-btn btn-sec btn-mini" onClick={() => motor?.virarSemana()}>Virar semana ⏭</button>
            <button type="button" className="p-btn btn-pri btn-mini" onClick={exportar} title="Exportar o relatório do dia (CSV): não-trabalháveis + motivo, documentação, assinatura, remarketing, números">⤓ Exportar</button>
          </div>
        </header>

        {/* HUD por zona + banner de congelamento (mesma faixa, abaixo da command bar) */}
        <div className="palco-hud-row">
          <div className="palco-hud">
            {snap.hud.map((c, i) => <span key={i} className={'chip-hud tom-' + c.tom}><b className="num">{c.valor}</b> {c.texto}</span>)}
          </div>
          {snap.congelada && (
            <div className="palco-congelado">
              <b>{snap.congelada}</b> · congelada
              <button type="button" className="voltar-hj" onClick={() => { const a = snap.semanas[snap.semanas.length - 1]; if (a) motor?.verSemana(a.w); }}>voltar pra atual</button>
            </div>
          )}
        </div>
        </div>{/* /palco-top */}

        {/* rodapé: legenda + micro-feed */}
        <div className="palco-rodape">
          <div className="palco-legenda">
            <span><b style={leg('--sala-triagem')} />triagem/remarketing</span>
            <span><b style={leg('--sala-ativo')} />mesa/aguardando SDR</span>
            <span><b style={leg('--sala-espera')} />aguardando cliente</span>
            <span><b style={leg('--sala-rubro')} />sem resposta</span>
            <span><b style={leg('--sala-ok')} />doc./assinatura</span>
          </div>
          <div className="palco-feed">
            {snap.feed.slice(0, 2).map((e, i) => <span key={i} className={'mf' + (i === 0 ? ' novo' : '')}><b className="num">{e.hora}</b> {e.texto}</span>)}
          </div>
        </div>

        {/* controles de zoom da cena (roda do mouse aproxima; arrastar move; Esc enquadra) */}
        <div className="palco-zoom" role="group" aria-label="Zoom da sala">
          <button type="button" className="pz" onClick={() => motor?.zoom(0.8)} aria-label="Aproximar" title="Aproximar (role o mouse na sala)">+</button>
          <button type="button" className="pz" onClick={() => motor?.zoom(1.25)} aria-label="Afastar" title="Afastar">−</button>
          <button type="button" className="pz" onClick={() => motor?.resetZoom()} aria-label="Ver sala inteira" title="Ver sala inteira">⤢</button>
        </div>

        {/* DRAWER de detalhe (sobre o palco; a sala segue viva atrás) */}
        <div className={'palco-scrim' + (drawerAberto ? ' on' : '')} onClick={() => motor?.voltarSala()} aria-hidden />
        <aside className={'sala-drawer' + (drawerAberto ? ' on' : '')} role="dialog" aria-modal="false" aria-label="Detalhe">
          {drawerAberto && (
            <>
              <button type="button" className="drawer-x" onClick={() => motor?.voltarSala()} aria-label="Fechar">✕</button>
              <div className="drawer-scroll"><Painel snap={snap} motor={motor} /></div>
            </>
          )}
        </aside>
      </section>

      {/* ---------- DASHBOARD (largura total, embaixo) ---------- */}
      <Suspense fallback={<div className="sala-dash-skel">Carregando dashboard…</div>}>
        <SalaDashboard snap={snap} motor={motor} />
      </Suspense>
    </div>
  );
}

/* ============================================================
   Drawer de detalhe — PainelView (bot / SDR / conversa)
   ============================================================ */
function Painel({ snap, motor }: { snap: Snapshot; motor: MotorSala | null }) {
  const p = snap.painel;
  return (
    <>
      <div className="p-cab">
        {p.avatarBot && <div className="p-avatar" style={{ ['--acento' as string]: p.acento } as CSSProperties}><Avatar bot /></div>}
        {p.avatarLook && <div className="p-avatar" style={{ ['--acento' as string]: p.acento } as CSSProperties}><Avatar look={p.avatarLook} /></div>}
        <div>
          <h3 className="p-nome">{p.titulo}</h3>
          {p.sub && <div className="p-subt">{p.sub}</div>}
        </div>
      </div>
      {p.estado && <span className="p-estado"><i style={{ background: p.estado.cor }} />{p.estado.txt}</span>}

      {p.aba && (
        <div className="p-abas" role="tablist">
          {(['agora', 'conversas', 'atividade'] as const).map((a) => (
            <button key={a} type="button" role="tab" aria-selected={p.aba === a} className={p.aba === a ? 'on' : ''} onClick={() => motor?.trocarAba(a)}>
              {a === 'agora' ? 'Agora' : a === 'conversas' ? 'Conversas' : 'Atividade'}
            </button>
          ))}
        </div>
      )}

      {p.kpis && p.kpis.length > 0 && <Kpis kpis={p.kpis} />}
      {p.secoes?.map((s, i) => <Secao key={i} s={s} motor={motor} />)}
      {p.conversa && <Conversa c={p.conversa} />}
    </>
  );
}

function Kpis({ kpis, tres }: { kpis: KpiView[]; tres?: boolean }) {
  return (
    <div className={'p-kpis' + (tres ? ' tres' : '')}>
      {kpis.map((k, i) => (
        <div key={i} className={'p-kpi' + (k.tom === 'alerta' ? ' alerta' : k.tom === 'ok' ? ' ok' : '')}>
          <div className="n num">{k.n}{k.small && <small> {k.small}</small>}</div>
          <div className="l">{k.label}</div>
        </div>
      ))}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function Secao({ s, motor }: { s: any; motor: MotorSala | null }) {
  switch (s.tipo) {
    case 'secao':
      return <div className="p-secao">{s.titulo}{s.dir && <span>{s.dir}</span>}</div>;
    case 'kpisTres':
      return <Kpis kpis={s.kpis} tres />;
    case 'funil':
      return (
        <div className="p-funil">
          {(s.linhas as FunilLinha[]).map((l, i) => (
            <div className="p-funil-l" key={i}>
              <div className="r">{l.rotulo}</div>
              <div className="b"><i className={l.cls} style={{ width: `${l.total ? Math.round((100 * l.n) / l.total) : 0}%` }} /></div>
              <div className="n num">{l.n}</div>
            </div>
          ))}
        </div>
      );
    case 'lista':
      return (
        <div className="p-lista">
          {(s.itens as ItemLista[]).map((it, i) => (
            <button key={i} type="button" className={'p-item' + (it.ativo ? ' sel' : '')}
              onClick={() => { if (it.sel) motor?.selecionar(it.sel); else if (it.lead) motor?.selecionarLead(it.lead); else if (it.conv) motor?.trocarConversa(it.conv); }}>
              <span className="pt" style={{ background: it.cor }} />
              <span className="txt"><span className="nome">{it.nome}</span><span className="desc">{it.desc}</span></span>
              {it.lado !== undefined && <span className={'lado num' + (it.ladoRubro ? ' rubro' : '')}>{it.lado}</span>}
            </button>
          ))}
        </div>
      );
    case 'vazio':
      return <div className="p-vazio">{s.txt}</div>;
    case 'horas': {
      const hs = s.horas as number[]; const m = Math.max(1, ...hs);
      return (
        <>
          <div className="p-horas">{hs.map((v, i) => <i key={i} className={s.agora !== undefined && i === s.agora ? 'agora' : ''} style={{ height: `${Math.max(4, (v / m) * 100)}%` }} title={`${8 + i}h: ${v}`} />)}</div>
          {s.agora !== undefined && <div className="p-horas-l"><span>8h</span><span>13h</span><span>18h</span></div>}
        </>
      );
    }
    case 'agora':
      return <div className={'p-agora' + (s.alerta ? ' alerta' : '')}><div className="t">Neste momento</div><div className="v" dangerouslySetInnerHTML={{ __html: s.txt }} /></div>;
    case 'barra':
      return (<><div className="p-secao">{s.titulo}<span>{s.dir}</span></div><div className="p-barra"><i style={{ width: `${s.pct}%`, background: s.cor }} /></div></>);
    case 'log':
      return <div className="p-log">{s.itens ? (s.itens as { hora: string; txt: string }[]).map((x, i) => <div key={i}><span className="h num">{x.hora}</span><span>{x.txt}</span></div>) : <div className="p-vazio">Nada registrado ainda.</div>}</div>;
    default:
      return null;
  }
}

function Conversa({ c }: { c: ConversaView }) {
  return (
    <div className="p-conversa">
      <div className="p-secao" style={{ marginTop: 16 }}>Lead <span>{c.titulo}</span></div>
      <div className="p-cab" style={{ marginTop: 6 }}>
        <div className="p-avatar"><Avatar look={c.look} /></div>
        <div><h3 className="p-nome peq">{c.nome}</h3><div className="p-subt">{c.telefone} · {c.cidade}</div></div>
      </div>
      <div className="p-ficha">
        {c.ficha.map(([k, v, rubro], i) => <span className="linha" key={i}><span className="k">{k}</span><span className={rubro ? 'rubro' : ''}>{v}</span></span>)}
      </div>
      <div className="p-passos">{c.passos.map((f, i) => <i key={i} className={f ? 'feito' : ''} />)}</div>
      <div className="p-secao">Conversa <span>{c.nMsgs} mensagens</span></div>
      <div className="p-chat">{c.msgs.map((m, i) => <div key={i} className={'bolha ' + m.de}><span className="q">{m.quem} · {m.hora}</span>{m.txt}</div>)}</div>
      <div className="p-acoes">
        <button type="button" className="p-btn btn-sec btn-mini" onClick={() => toast('Na Atenvo, este botão abre a conversa real na aba de WhatsApp.')}>Abrir conversa</button>
        <button type="button" className="p-btn btn-sec btn-mini fantasma" onClick={() => toast('Na Atenvo, isso transfere o lead pra outra mesa e registra no histórico.')}>Transferir</button>
      </div>
      <div className="p-secao">Histórico</div>
      <div className="p-log">{c.hist.map((x, i) => <div key={i}><span className="h num">{x.hora}</span><span>{x.txt}</span></div>)}</div>
    </div>
  );
}

function Avatar({ look, bot }: { look?: Look; bot?: boolean }) {
  const inner = bot ? botPixelSVG() : look ? bonecoPixelSVG(look, 'pe') : '';
  return <svg viewBox="-17 -78 34 40" dangerouslySetInnerHTML={{ __html: inner }} />;
}

let toastTimer: number | undefined;
function toast(txt: string) {
  let el = document.getElementById('sala-toast');
  if (!el) { el = document.createElement('div'); el.id = 'sala-toast'; el.className = 'v2 sala-toast'; document.body.appendChild(el); }
  el.textContent = txt; el.classList.add('on');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { el && el.classList.remove('on'); }, 2600);
}
