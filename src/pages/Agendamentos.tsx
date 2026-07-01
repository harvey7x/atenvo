import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './Agendamentos.css';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/hooks/useToast';
import { Modal } from '@/components/Modal';
import { useOrgUsuarios } from '@/data/atendimento';
import { useOrg } from '@/context/OrgContext';
import { useAgendamentos, useProximosAgendamentos, useCriarAgendamento, useAtualizarAgendamento, useRemarcarAgendamento, useHistorico, useContatosBusca, checarConflitoAtendente, ERRO_CONCORRENCIA, AG_STATUS, AG_TIPOS, agStatusInfo, AG_REAL, type Agendamento, type AgStatus, type Atividade } from '@/data/agendamentos';

type View = 'dia' | 'semana' | 'mes';
const HORA_INI = 8, HORA_FIM = 19, HORA_PX = 56;
const DIAS_ABR = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

/** partes de um instante no fuso America/Sao_Paulo (dateKey + hora decimal). */
function spParts(iso: string) {
  const d = new Date(iso);
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d).reduce((a, x) => { a[x.type] = x.value; return a; }, {} as Record<string, string>);
  const hh = +p.hour % 24;
  return { key: `${p.year}-${p.month}-${p.day}`, hh, mm: +p.minute, horaDec: hh + (+p.minute) / 60, hora: `${p.hour}:${p.minute}` };
}
/** deslocamento REAL de America/Sao_Paulo (ms) para um instante — via Intl (robusto a mudança de fuso/DST). */
function spOffsetMs(d: Date): number {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).formatToParts(d).reduce((a, x) => { a[x.type] = x.value; return a; }, {} as Record<string, string>);
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  return asUTC - d.getTime();
}
/** ISO (UTC) a partir do horário de PAREDE em America/Sao_Paulo (yyyy-mm-dd + HH:mm), sem offset fixo. */
function spISO(dateKey: string, hora: string): string {
  const [Y, M, D] = dateKey.split('-').map(Number);
  const [h, mi] = hora.split(':').map(Number);
  const guessUTC = Date.UTC(Y, M - 1, D, h, mi);
  return new Date(guessUTC - spOffsetMs(new Date(guessUTC))).toISOString();
}
const keyOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function inicioSemana(d: Date) { const x = new Date(d); const dw = x.getDay(); x.setDate(x.getDate() - dw); x.setHours(0, 0, 0, 0); return x; } // domingo
function addDias(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
const hhmm = (dec: number) => `${String(Math.floor(dec)).padStart(2, '0')}:${String(Math.round((dec % 1) * 60)).padStart(2, '0')}`;
/** "03/07/2026" no fuso SP. */
function fmtDataBR(iso: string) { const [Y, M, D] = spParts(iso).key.split('-'); return `${D}/${M}/${Y}`; }
/** "03/07, 14:30" no fuso SP (para o histórico). */
function fmtDataHoraBR(iso: string) { const p = spParts(iso); const [, M, D] = p.key.split('-'); return `${D}/${M}, ${p.hora}`; }

export function Agendamentos() {
  const { user } = useAuth();
  const { currentOrg } = useOrg();
  const { toast } = useToast();
  const navigate = useNavigate();
  const atendentes = useOrgUsuarios().data ?? [];

  const [view, setView] = useState<View>(window.innerWidth < 720 ? 'dia' : 'semana');
  const [ancora, setAncora] = useState(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; });
  const [fAtendente, setFAtendente] = useState('');
  const [fStatus, setFStatus] = useState('');

  // intervalo consultado conforme a visão
  const { rangeIni, rangeFim, dias } = useMemo(() => {
    if (view === 'dia') { const ini = new Date(ancora); ini.setHours(0, 0, 0, 0); return { rangeIni: ini, rangeFim: addDias(ini, 1), dias: [ini] }; }
    if (view === 'mes') { const ini = new Date(ancora.getFullYear(), ancora.getMonth(), 1); const fim = new Date(ancora.getFullYear(), ancora.getMonth() + 1, 1); const gridIni = inicioSemana(ini); const gridFim = addDias(inicioSemana(addDias(fim, -1)), 7); const ds: Date[] = []; for (let d = new Date(gridIni); d < gridFim; d = addDias(d, 1)) ds.push(new Date(d)); return { rangeIni: gridIni, rangeFim: gridFim, dias: ds }; }
    const ini = inicioSemana(ancora); return { rangeIni: ini, rangeFim: addDias(ini, 7), dias: Array.from({ length: 7 }, (_, i) => addDias(ini, i)) };
  }, [view, ancora]);

  const iniISO = spISO(keyOf(rangeIni), '00:00');
  const fimISO = spISO(keyOf(rangeFim), '00:00');
  const q = useAgendamentos(iniISO, fimISO);
  const todos = q.data ?? [];
  const ags = todos.filter((a) => (!fAtendente || a.atendenteId === fAtendente) && (!fStatus || a.status === fStatus));

  const hojeKey = spParts(new Date().toISOString()).key; // "hoje" no fuso de São Paulo
  const nowDec = spParts(new Date().toISOString()).horaDec;
  const ehGestor = currentOrg.role === 'admin' || currentOrg.role === 'gestor';

  // Próximos agendamentos: janela fixa a partir de hoje (independe da visão do calendário).
  const proxRange = useMemo(() => {
    const h = new Date(); h.setHours(0, 0, 0, 0);
    return { desde: spISO(keyOf(h), '00:00'), ate: spISO(keyOf(addDias(h, 22)), '00:00') };
  }, [hojeKey]);
  const proxQ = useProximosAgendamentos(proxRange.desde, proxRange.ate);
  const proximos = (proxQ.data ?? []).filter((a) => new Date(a.fimEm).getTime() >= Date.now());

  // resumo
  const resumo = useMemo(() => {
    const r = { total: ags.length, confirmado: 0, pendente: 0, realizado: 0, cancelado: 0, nao_compareceu: 0 } as Record<string, number>;
    for (const a of ags) r[a.status] = (r[a.status] ?? 0) + 1;
    return r;
  }, [ags]);

  const porDia = useMemo(() => {
    const m: Record<string, Agendamento[]> = {};
    for (const a of ags) { const k = spParts(a.inicioEm).key; (m[k] ??= []).push(a); }
    return m;
  }, [ags]);

  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  function novo(dataKey?: string, hora?: string) { setEditId(null); setPrefill({ dataKey: dataKey ?? keyOf(new Date()), hora: hora ?? '09:00' }); setModalOpen(true); }
  function abrir(a: Agendamento) { setEditId(a.id); setPrefill(null); setModalOpen(true); }
  const [prefill, setPrefill] = useState<{ dataKey: string; hora: string } | null>(null);

  const tituloPeriodo = view === 'mes'
    ? `${MESES[ancora.getMonth()]} ${ancora.getFullYear()}`
    : view === 'dia'
      ? `${DIAS_ABR[ancora.getDay()]}, ${ancora.getDate()} de ${MESES[ancora.getMonth()]}`
      : (() => { const f = addDias(rangeIni, 6); return `${rangeIni.getDate()} – ${f.getDate()} de ${MESES[f.getMonth()]}, ${f.getFullYear()}`; })();

  function mover(dir: number) { setAncora((a) => view === 'mes' ? new Date(a.getFullYear(), a.getMonth() + dir, 1) : addDias(a, dir * (view === 'dia' ? 1 : 7))); }

  return (
    <div className="agn">
      <div className="agn-head">
        <div>
          <h1 className="agn-title">Agendamentos</h1>
          <p className="agn-sub">Organize os atendimentos presenciais da equipe.</p>
        </div>
        <button className="agn-novo" onClick={() => novo()}><span>+ Novo agendamento</span></button>
      </div>

      <div className="agn-toolbar">
        <div className="agn-views">
          {(['dia', 'semana', 'mes'] as View[]).map((v) => (
            <button key={v} className={'agn-view' + (view === v ? ' on' : '')} onClick={() => setView(v)}>{v === 'dia' ? 'Dia' : v === 'semana' ? 'Semana' : 'Mês'}</button>
          ))}
        </div>
        <button className="agn-nav" onClick={() => { const d = new Date(); d.setHours(0, 0, 0, 0); setAncora(d); }}>Hoje</button>
        <button className="agn-nav ic" aria-label="Anterior" onClick={() => mover(-1)}>‹</button>
        <button className="agn-nav ic" aria-label="Próximo" onClick={() => mover(1)}>›</button>
        <span className="agn-periodo">{tituloPeriodo}</span>
        <div className="agn-filtros">
          <select className="agn-select" value={fAtendente} onChange={(e) => setFAtendente(e.target.value)} title="Filtrar por atendente">
            <option value="">Todos os atendentes</option>
            {atendentes.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
          </select>
          <select className="agn-select" value={fStatus} onChange={(e) => setFStatus(e.target.value)} title="Filtrar por status">
            <option value="">Todos os status</option>
            {AG_STATUS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>
      </div>

      <div className="agn-body">
        <div className="agn-cal">
          {!AG_REAL ? (
            <div className="agn-empty">Disponível com o backend configurado.</div>
          ) : view === 'mes' ? (
            <MesGrid dias={dias} mesRef={ancora.getMonth()} porDia={porDia} hojeKey={hojeKey} onDia={(k) => { setAncora(new Date(k + 'T12:00:00')); setView('dia'); }} onEvento={abrir} />
          ) : (
            <div className={'agn-grid' + (view === 'dia' ? ' um' : '')}>
              <div className="agn-corner" />
              {dias.map((d) => {
                const k = keyOf(d);
                return <div key={k} className={'agn-colhead' + (k === hojeKey ? ' hoje' : '')}>{DIAS_ABR[d.getDay()]} {String(d.getDate()).padStart(2, '0')}/{String(d.getMonth() + 1).padStart(2, '0')}</div>;
              })}
              <div className="agn-hours">
                {Array.from({ length: HORA_FIM - HORA_INI + 1 }, (_, i) => <div key={i} className="agn-hour" style={{ height: HORA_PX }}>{String(HORA_INI + i).padStart(2, '0')}:00</div>)}
              </div>
              {dias.map((d) => {
                const k = keyOf(d);
                const eventos = (porDia[k] ?? []);
                return (
                  <div key={k} className={'agn-daycol' + (k === hojeKey ? ' hoje' : '')} style={{ height: (HORA_FIM - HORA_INI) * HORA_PX }} onClick={(e) => { if (e.currentTarget === e.target) { const rect = (e.currentTarget as HTMLElement).getBoundingClientRect(); const dec = HORA_INI + (e.clientY - rect.top) / HORA_PX; novo(k, hhmm(Math.max(HORA_INI, Math.min(HORA_FIM - 1, Math.floor(dec * 2) / 2)))); } }}>
                    {k === hojeKey && nowDec >= HORA_INI && nowDec <= HORA_FIM && <div className="agn-now" style={{ top: (nowDec - HORA_INI) * HORA_PX }} />}
                    {eventos.map((a) => {
                      const s = spParts(a.inicioEm), f = spParts(a.fimEm);
                      const top = Math.max(0, (s.horaDec - HORA_INI) * HORA_PX);
                      const rawH = (Math.min(f.horaDec, HORA_FIM) - s.horaDec) * HORA_PX;
                      const h = Math.max(58, rawH - 2); // mínimo que comporta horário+nome+status
                      const size = h >= 108 ? 'expanded' : h >= 78 ? 'normal' : 'compact';
                      const info = agStatusInfo(a.status);
                      const nome = a.clienteNome || a.titulo || 'Sem cliente';
                      const meta = [a.atendenteNome, a.local].filter(Boolean).join(' · ');
                      const tip = `${nome}\n${s.hora} – ${f.hora}\n${a.tipo}${a.atendenteNome ? '\nAtendente: ' + a.atendenteNome : ''}\nStatus: ${info.label}${a.local ? '\nLocal: ' + a.local : ''}`;
                      return (
                        <button key={a.id} className={'agn-ev ' + size} title={tip} style={{ top, height: h, background: info.cor + '26', borderColor: info.cor + '73' }} onClick={(e) => { e.stopPropagation(); abrir(a); }}>
                          <span className="agn-ev-hora">{s.hora} – {f.hora}</span>
                          <span className="agn-ev-nome">{nome}</span>
                          {size !== 'compact' && <span className="agn-ev-tipo">{a.tipo}</span>}
                          {size === 'expanded' && meta && <span className="agn-ev-meta">{meta}</span>}
                          <span className="agn-ev-status" style={{ color: info.cor }}>● {info.label}</span>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <aside className="agn-aside">
          <MiniCal ancora={ancora} onPick={(d) => { setAncora(d); if (view === 'mes') setView('semana'); }} hojeKey={hojeKey} />
          <div className="agn-legend">
            <div className="agn-legend-t">Legenda de status</div>
            {AG_STATUS.map((s) => <div key={s.id} className="agn-legend-i"><span className="dot" style={{ background: s.cor }} />{s.label}</div>)}
          </div>
          <ProximosPanel proximos={proximos} hojeKey={hojeKey} onAbrir={abrir} onVerTodos={() => { const d = new Date(); d.setHours(0, 0, 0, 0); setAncora(d); setView('dia'); setFStatus(''); }} />
        </aside>
      </div>

      <div className="agn-resumo">
        <div className="agn-r-i"><b>{resumo.total}</b><span>na {view === 'mes' ? 'mês' : view === 'dia' ? 'dia' : 'semana'}</span></div>
        <div className="agn-r-i ok"><b>{resumo.confirmado}</b><span>Confirmados</span></div>
        <div className="agn-r-i pend"><b>{resumo.pendente}</b><span>Pendentes</span></div>
        <div className="agn-r-i canc"><b>{resumo.cancelado + resumo.nao_compareceu}</b><span>Cancel./faltas</span></div>
        <div className="agn-r-i real"><b>{resumo.realizado}</b><span>Realizados</span></div>
      </div>

      {modalOpen && <AgModal editId={editId} prefill={prefill} atendentes={atendentes} agendamento={todos.find((a) => a.id === editId) ?? null}
        orgId={currentOrg.id} ehGestor={ehGestor} onClose={() => { setModalOpen(false); q.refetch(); proxQ.refetch(); }} onSaved={() => { setModalOpen(false); q.refetch(); proxQ.refetch(); }}
        userId={user?.id ?? ''} toast={toast} navigate={navigate} />}
    </div>
  );
}

function MesGrid({ dias, mesRef, porDia, hojeKey, onDia, onEvento }: { dias: Date[]; mesRef: number; porDia: Record<string, Agendamento[]>; hojeKey: string; onDia: (k: string) => void; onEvento: (a: Agendamento) => void }) {
  return (
    <div className="agn-mes">
      {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((d) => <div key={d} className="agn-mes-h">{d}</div>)}
      {dias.map((d) => {
        const k = keyOf(d); const evs = porDia[k] ?? [];
        return (
          <div key={k} className={'agn-mes-c' + (d.getMonth() !== mesRef ? ' fora' : '') + (k === hojeKey ? ' hoje' : '')} onClick={() => onDia(k)}>
            <div className="agn-mes-n">{d.getDate()}</div>
            {evs.slice(0, 3).map((a) => { const info = agStatusInfo(a.status); return <button key={a.id} className="agn-mes-ev" style={{ background: info.cor + '18', color: info.cor }} onClick={(e) => { e.stopPropagation(); onEvento(a); }}>{spParts(a.inicioEm).hora} {a.clienteNome || a.titulo || '—'}</button>; })}
            {evs.length > 3 && <div className="agn-mes-mais">+{evs.length - 3}</div>}
          </div>
        );
      })}
    </div>
  );
}

function MiniCal({ ancora, onPick, hojeKey }: { ancora: Date; onPick: (d: Date) => void; hojeKey: string }) {
  const [ref, setRef] = useState(ancora);
  const first = new Date(ref.getFullYear(), ref.getMonth(), 1);
  const gridIni = inicioSemana(first);
  const cells = Array.from({ length: 42 }, (_, i) => addDias(gridIni, i));
  return (
    <div className="agn-mini">
      <div className="agn-mini-h"><button onClick={() => setRef(new Date(ref.getFullYear(), ref.getMonth() - 1, 1))}>‹</button><span>{MESES[ref.getMonth()]} {ref.getFullYear()}</span><button onClick={() => setRef(new Date(ref.getFullYear(), ref.getMonth() + 1, 1))}>›</button></div>
      <div className="agn-mini-g">
        {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d, i) => <span key={i} className="agn-mini-wd">{d}</span>)}
        {cells.map((d) => { const k = keyOf(d); return <button key={k} className={'agn-mini-d' + (d.getMonth() !== ref.getMonth() ? ' fora' : '') + (k === keyOf(ancora) ? ' sel' : '') + (k === hojeKey ? ' hoje' : '')} onClick={() => onPick(new Date(k + 'T12:00:00'))}>{d.getDate()}</button>; })}
      </div>
    </div>
  );
}

function ProximosPanel({ proximos, hojeKey, onAbrir, onVerTodos }: { proximos: Agendamento[]; hojeKey: string; onAbrir: (a: Agendamento) => void; onVerTodos: () => void }) {
  const amanhaKey = keyOf(addDias(new Date(hojeKey + 'T12:00:00'), 1));
  const grupos = useMemo(() => {
    const m: { key: string; label: string; itens: Agendamento[] }[] = []; const idx: Record<string, number> = {};
    for (const a of proximos) {
      const k = spParts(a.inicioEm).key;
      if (idx[k] == null) { idx[k] = m.length; const [, M, D] = k.split('-'); m.push({ key: k, label: k === hojeKey ? 'Hoje' : k === amanhaKey ? 'Amanhã' : `${D}/${M}`, itens: [] }); }
      m[idx[k]].itens.push(a);
    }
    return m;
  }, [proximos, hojeKey, amanhaKey]);
  return (
    <div className="agn-prox">
      <div className="agn-prox-head"><span className="agn-prox-t">Próximos agendamentos</span>{proximos.length > 0 && <button className="agn-prox-all" onClick={onVerTodos}>Ver todos</button>}</div>
      {grupos.length === 0 ? <div className="agn-prox-empty">Nenhum agendamento próximo.</div> : grupos.map((g) => (
        <div key={g.key} className="agn-prox-grp">
          <div className="agn-prox-day">{g.label}</div>
          {g.itens.map((a) => { const s = spParts(a.inicioEm); const info = agStatusInfo(a.status); return (
            <button key={a.id} className="agn-prox-i" onClick={() => onAbrir(a)}>
              <span className="agn-prox-h" style={{ color: info.cor }}>{s.hora}</span>
              <span className="agn-prox-b">
                <span className="agn-prox-n">{a.clienteNome || a.titulo || 'Sem cliente'}</span>
                <span className="agn-prox-s">{a.atendenteNome || 'Sem atendente'}{a.local ? ' · ' + a.local : ''}</span>
              </span>
              <span className="agn-prox-st" style={{ color: info.cor }}>{info.label}</span>
            </button>
          ); })}
        </div>
      ))}
    </div>
  );
}

function AgModal({ editId, prefill, atendentes, agendamento, orgId, ehGestor, onClose, onSaved, userId, toast, navigate }: {
  editId: string | null; prefill: { dataKey: string; hora: string } | null; atendentes: { id: string; nome: string }[];
  agendamento: Agendamento | null; orgId: string; ehGestor: boolean; onClose: () => void; onSaved: () => void; userId: string;
  toast: (m: string, k?: 'ok' | 'warn') => void; navigate: (p: string) => void;
}) {
  const criar = useCriarAgendamento();
  const atualizar = useAtualizarAgendamento();
  const ed = agendamento;
  const p0 = ed ? spParts(ed.inicioEm) : null; const p1 = ed ? spParts(ed.fimEm) : null;
  const [f, setF] = useState(() => ({
    clienteNome: ed?.clienteNome ?? '', contatoId: ed?.contatoId ?? '', telefone: ed?.telefone ?? '',
    dataKey: p0?.key ?? prefill?.dataKey ?? new Date().toISOString().slice(0, 10),
    horaIni: p0 ? p0.hora : (prefill?.hora ?? '09:00'), horaFim: p1 ? p1.hora : addHora(prefill?.hora ?? '09:00'),
    atendenteId: ed?.atendenteId ?? '', tipo: ed && !AG_TIPOS.includes(ed.tipo) ? 'Outro' : (ed?.tipo ?? 'Reunião inicial'),
    tipoOutro: ed && !AG_TIPOS.includes(ed.tipo) ? ed.tipo : '',
    local: ed?.local ?? '', endereco: ed?.endereco ?? '', status: (ed?.status ?? 'pendente') as AgStatus, observacoes: ed?.observacoes ?? '',
  }));
  const [busca, setBusca] = useState('');
  const contatosQ = useContatosBusca(busca);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aba, setAba] = useState<'detalhes' | 'historico'>('detalhes');
  const [remarcarOpen, setRemarcarOpen] = useState(false);
  const set = (k: string, v: unknown) => setF((x) => ({ ...x, [k]: v }));

  // Permissões: novo => qualquer um; edição => gestor OU dono (criou ou é o atendente).
  const ehDono = !!ed && (ed.criadoPor === userId || ed.atendenteId === userId);
  const podeEditar = !editId || ehGestor || ehDono;
  const ro = !podeEditar;
  const podeReatribuir = ehGestor; // atendente não troca o responsável
  const opcoesAtendente = ehGestor ? atendentes : atendentes.filter((u) => u.id === userId);
  const atendentesMap = useMemo(() => Object.fromEntries(atendentes.map((u) => [u.id, u.nome] as const)), [atendentes]);

  async function salvar() {
    setErro(null);
    if (!f.clienteNome.trim()) { setErro('Informe o cliente.'); return; }
    if (f.horaFim <= f.horaIni) { setErro('O horário final deve ser após o inicial.'); return; }
    const tipo = f.tipo === 'Outro' ? (f.tipoOutro.trim() || 'Outro') : f.tipo;
    const base = {
      clienteNome: f.clienteNome.trim(), contatoId: f.contatoId || null, telefone: f.telefone || null,
      atendenteId: f.atendenteId || null, tipo, status: f.status,
      inicioEm: spISO(f.dataKey, f.horaIni), fimEm: spISO(f.dataKey, f.horaFim),
      local: f.local || null, endereco: f.endereco || null, observacoes: f.observacoes || null,
    };
    setBusy(true);
    try {
      if (editId) await atualizar.mutateAsync({ id: editId, atualizadoEmEsperado: ed?.atualizadoEm, patch: { contato_id: base.contatoId, atendente_id: base.atendenteId, tipo, cliente_nome: base.clienteNome, telefone: base.telefone, inicio_em: base.inicioEm, fim_em: base.fimEm, status: base.status, local: base.local, endereco: base.endereco, observacoes: base.observacoes } });
      else await criar.mutateAsync({ ...base, criadoPor: userId });
      toast(editId ? 'Agendamento atualizado' : 'Agendamento criado'); onSaved();
    } catch (e) { setErro(traduzErro((e as Error).message)); }
    finally { setBusy(false); }
  }
  async function mudarStatus(s: AgStatus, motivoCampo?: 'motivo_cancelamento') {
    if (!editId) return;
    let motivo: string | undefined;
    if (motivoCampo) { motivo = window.prompt('Motivo do cancelamento:') || undefined; if (!motivo) return; }
    setBusy(true);
    try { await atualizar.mutateAsync({ id: editId, atualizadoEmEsperado: ed?.atualizadoEm, patch: { status: s, ...(motivo ? { [motivoCampo!]: motivo } : {}) } }); toast('Status atualizado'); onSaved(); }
    catch (e) { setErro(traduzErro((e as Error).message)); } finally { setBusy(false); }
  }

  return (
    <>
    <Modal open onClose={() => { if (!busy) onClose(); }} title={editId ? 'Detalhe do agendamento' : 'Novo agendamento'} width={520} closeOnBackdrop={!busy}
      footer={<>
        <button className="atv-btn" disabled={busy} onClick={onClose}>Fechar</button>
        {aba === 'detalhes' && podeEditar && <button className="atv-btn primary" disabled={busy} onClick={salvar}>{busy ? 'Salvando…' : (editId ? 'Salvar' : 'Criar agendamento')}</button>}
      </>}>
      {editId && (
        <div className="agn-tabs">
          <button className={'agn-tab' + (aba === 'detalhes' ? ' on' : '')} onClick={() => setAba('detalhes')}>Detalhes</button>
          <button className={'agn-tab' + (aba === 'historico' ? ' on' : '')} onClick={() => setAba('historico')}>Histórico</button>
        </div>
      )}
      {aba === 'historico' && editId ? (
        <Historico agendamentoId={editId} atendentesMap={atendentesMap} />
      ) : (
      <div className="agn-form">
        {ro && <div className="agn-ro">Você não tem permissão para editar este agendamento — visualização apenas.</div>}
        <label className="agn-fld"><span>Cliente <span className="req">*</span></span>
          <input className="atv-input" value={f.clienteNome} disabled={ro} placeholder="Nome do cliente" onChange={(e) => { set('clienteNome', e.target.value); setBusca(e.target.value); if (!e.target.value) set('contatoId', ''); }} />
          {busca.trim().length >= 2 && !f.contatoId && (contatosQ.data?.length ?? 0) > 0 && (
            <div className="agn-cts">
              {contatosQ.data!.map((c) => <button key={c.id} type="button" className="agn-ct" onClick={() => { set('contatoId', c.id); set('clienteNome', c.nome); set('telefone', c.telefone ?? ''); setBusca(''); }}>{c.nome}{c.telefone ? ' · ' + c.telefone : ''}</button>)}
            </div>
          )}
          {f.contatoId && <span className="agn-vinc">✓ vinculado ao contato <button type="button" className="link-btn" onClick={() => navigate(`/contatos?contato=${f.contatoId}`)}>abrir</button></span>}
        </label>
        <div className="agn-row2">
          <label className="agn-fld"><span>Telefone</span><input className="atv-input" value={f.telefone} disabled={ro} onChange={(e) => set('telefone', e.target.value)} placeholder="55 11 99999-8888" /></label>
          <label className="agn-fld"><span>Atendente</span>
            <select className="atv-input" value={f.atendenteId} disabled={ro || (!!editId && !podeReatribuir)} onChange={(e) => set('atendenteId', e.target.value)}><option value="">Não atribuído</option>{opcoesAtendente.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}</select>
          </label>
        </div>
        <div className="agn-row3">
          <label className="agn-fld"><span>Data</span><input className="atv-input" type="date" value={f.dataKey} disabled={ro} onChange={(e) => set('dataKey', e.target.value)} /></label>
          <label className="agn-fld"><span>Início</span><input className="atv-input" type="time" value={f.horaIni} disabled={ro} onChange={(e) => set('horaIni', e.target.value)} /></label>
          <label className="agn-fld"><span>Fim</span><input className="atv-input" type="time" value={f.horaFim} disabled={ro} onChange={(e) => set('horaFim', e.target.value)} /></label>
        </div>
        <div className="agn-row2">
          <label className="agn-fld"><span>Tipo de atendimento</span>
            <select className="atv-input" value={f.tipo} disabled={ro} onChange={(e) => set('tipo', e.target.value)}>{AG_TIPOS.map((t) => <option key={t} value={t}>{t}</option>)}</select>
          </label>
          <label className="agn-fld"><span>Status</span>
            <select className="atv-input" value={f.status} disabled={ro} onChange={(e) => set('status', e.target.value as AgStatus)}>{AG_STATUS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
          </label>
        </div>
        {f.tipo === 'Outro' && <label className="agn-fld"><span>Descreva o tipo</span><input className="atv-input" value={f.tipoOutro} disabled={ro} onChange={(e) => set('tipoOutro', e.target.value)} placeholder="Tipo personalizado" /></label>}
        <div className="agn-row2">
          <label className="agn-fld"><span>Unidade/Local</span><input className="atv-input" value={f.local} disabled={ro} onChange={(e) => set('local', e.target.value)} placeholder="Ex.: Matriz" /></label>
          <label className="agn-fld"><span>Endereço</span><input className="atv-input" value={f.endereco} disabled={ro} onChange={(e) => set('endereco', e.target.value)} placeholder="Rua, nº, cidade" /></label>
        </div>
        <label className="agn-fld"><span>Observações</span><textarea className="atv-input" rows={2} value={f.observacoes} disabled={ro} onChange={(e) => set('observacoes', e.target.value)} /></label>
        {editId && podeEditar && (
          <div className="agn-acts">
            <button className="agn-act" disabled={busy} onClick={() => mudarStatus('confirmado')}>Confirmar</button>
            <button className="agn-act" disabled={busy} onClick={() => mudarStatus('realizado')}>Realizado</button>
            <button className="agn-act" disabled={busy} onClick={() => mudarStatus('nao_compareceu')}>Não compareceu</button>
            <button className="agn-act" disabled={busy} onClick={() => setRemarcarOpen(true)}>Remarcar</button>
            <button className="agn-act danger" disabled={busy} onClick={() => mudarStatus('cancelado', 'motivo_cancelamento')}>Cancelar</button>
          </div>
        )}
        {erro && <div className="atv-field-err">{erro}</div>}
      </div>
      )}
    </Modal>
    {remarcarOpen && ed && <RemarcarModal ag={ed} orgId={orgId} toast={toast}
      onClose={() => setRemarcarOpen(false)} onDone={() => { setRemarcarOpen(false); onSaved(); }} />}
    </>
  );
}

/** Traduz erros técnicos vindos do banco/RPC para mensagens ao usuário. */
function traduzErro(m: string): string {
  if (m === ERRO_CONCORRENCIA || m.includes('conflito_concorrencia')) return 'Este agendamento foi alterado por outra pessoa. Revise as informações atualizadas.';
  if (m.includes('sem_permissao_reatribuir')) return 'Você não pode transferir este agendamento para outro atendente.';
  if (m.includes('sem_permissao')) return 'Você não tem permissão para esta ação.';
  if (m.includes('motivo_obrigatorio')) return 'O motivo é obrigatório.';
  if (m.includes('periodo_invalido')) return 'O horário final deve ser após o inicial.';
  return m || 'Não foi possível concluir a operação.';
}

function RemarcarModal({ ag, orgId, toast, onClose, onDone }: {
  ag: Agendamento; orgId: string; toast: (m: string, k?: 'ok' | 'warn') => void; onClose: () => void; onDone: () => void;
}) {
  const remarcar = useRemarcarAgendamento();
  const cur = spParts(ag.inicioEm); const curFim = spParts(ag.fimEm);
  const [dataKey, setDataKey] = useState(cur.key);
  const [horaIni, setHoraIni] = useState(cur.hora);
  const [horaFim, setHoraFim] = useState(curFim.hora);
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [conflito, setConflito] = useState<{ msg: string; podeForcar: boolean } | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const novoIni = spISO(dataKey, horaIni); const novoFim = spISO(dataKey, horaFim);

  // aviso ao vivo de conflito enquanto escolhe o novo horário (o guard definitivo é a RPC)
  useEffect(() => {
    let vivo = true; setAviso(null);
    if (!ag.atendenteId || horaFim <= horaIni) return;
    checarConflitoAtendente(orgId, ag.atendenteId, novoIni, novoFim, ag.id)
      .then((c) => { if (vivo && c) setAviso('Este atendente já possui outro agendamento nesse horário.'); })
      .catch(() => {});
    return () => { vivo = false; };
  }, [dataKey, horaIni, horaFim, ag.atendenteId, ag.id, orgId, novoIni, novoFim]);

  async function confirmar(forcar = false) {
    setErro(null); setConflito(null);
    if (horaFim <= horaIni) { setErro('O horário final deve ser após o inicial.'); return; }
    if (!motivo.trim()) { setErro('Informe o motivo da remarcação.'); return; }
    setBusy(true);
    try {
      const r = await remarcar.mutateAsync({ id: ag.id, inicioEm: novoIni, fimEm: novoFim, motivo: motivo.trim(), atualizadoEmEsperado: ag.atualizadoEm, forcar });
      if (r.status === 'conflito') { setConflito({ msg: `${r.atendente} já possui um agendamento das ${r.inicio} às ${r.fim}.`, podeForcar: !!r.pode_forcar }); return; }
      toast('Agendamento remarcado'); onDone();
    } catch (e) { setErro(traduzErro((e as Error).message)); }
    finally { setBusy(false); }
  }

  return (
    <Modal open onClose={() => { if (!busy) onClose(); }} title="Remarcar agendamento" width={460} closeOnBackdrop={!busy}
      footer={<>
        <button className="atv-btn" disabled={busy} onClick={onClose}>Cancelar</button>
        {conflito && conflito.podeForcar
          ? <button className="atv-btn primary" disabled={busy} onClick={() => confirmar(true)}>Remarcar mesmo assim</button>
          : <button className="atv-btn primary" disabled={busy} onClick={() => confirmar(false)}>{busy ? 'Remarcando…' : 'Confirmar remarcação'}</button>}
      </>}>
      <div className="agn-form">
        <div className="agn-remsum">
          <div><span>Cliente</span><b>{ag.clienteNome || ag.titulo || 'Sem cliente'}</b></div>
          <div><span>Atendente</span><b>{ag.atendenteNome || 'Não atribuído'}</b></div>
          <div><span>Período atual</span><b>{fmtDataBR(ag.inicioEm)} · {cur.hora}–{curFim.hora}</b></div>
        </div>
        <div className="agn-row3">
          <label className="agn-fld"><span>Nova data</span><input className="atv-input" type="date" value={dataKey} onChange={(e) => setDataKey(e.target.value)} /></label>
          <label className="agn-fld"><span>Novo início</span><input className="atv-input" type="time" value={horaIni} onChange={(e) => setHoraIni(e.target.value)} /></label>
          <label className="agn-fld"><span>Novo fim</span><input className="atv-input" type="time" value={horaFim} onChange={(e) => setHoraFim(e.target.value)} /></label>
        </div>
        <label className="agn-fld"><span>Motivo da remarcação <span className="req">*</span></span>
          <textarea className="atv-input" rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: Cliente solicitou nova data" />
        </label>
        {aviso && !conflito && <div className="agn-aviso">⚠ {aviso}</div>}
        {conflito && <div className="atv-field-err">{conflito.msg}{conflito.podeForcar ? ' Confirme para remarcar mesmo assim.' : ' Ajuste o horário para continuar.'}</div>}
        {erro && <div className="atv-field-err">{erro}</div>}
      </div>
    </Modal>
  );
}

function Historico({ agendamentoId, atendentesMap }: { agendamentoId: string; atendentesMap: Record<string, string> }) {
  const q = useHistorico(agendamentoId);
  const nomeAtend = (id: unknown) => id == null ? 'Não atribuído' : (atendentesMap[String(id)] ?? 'Atendente');
  if (q.isLoading) return <div className="agn-hist-empty">Carregando histórico…</div>;
  const itens = q.data ?? [];
  if (!itens.length) return <div className="agn-hist-empty">Sem histórico ainda.</div>;
  return (
    <div className="agn-hist">
      {itens.map((it) => {
        const d = descreveAtividade(it, nomeAtend);
        return (
          <div key={it.id} className="agn-hist-i">
            <div className="agn-hist-top"><b>{it.usuarioNome || 'Sistema'}</b> {d.acao}<span className="agn-hist-when">{fmtDataHoraBR(it.criadoEm)}</span></div>
            {d.detalhe && <div className="agn-hist-det">{d.detalhe}</div>}
            {it.motivo && <div className="agn-hist-motivo">Motivo: {it.motivo}</div>}
          </div>
        );
      })}
    </div>
  );
}

/** Converte uma atividade de auditoria em texto legível (sem JSON, IDs ou campos técnicos). */
function descreveAtividade(it: Atividade, nomeAtend: (id: unknown) => string): { acao: string; detalhe?: string } {
  const lbl = (v: unknown) => v ? agStatusInfo(String(v)).label : '—';
  switch (it.tipo) {
    case 'criado': return { acao: 'criou o agendamento' };
    case 'status_alterado': {
      const para = it.para?.status;
      if (para === 'confirmado') return { acao: 'confirmou o atendimento' };
      if (para === 'realizado') return { acao: 'marcou como realizado' };
      if (para === 'nao_compareceu') return { acao: 'marcou como não compareceu' };
      if (para === 'cancelado') return { acao: 'cancelou o atendimento' };
      if (para === 'remarcado') return { acao: 'marcou como remarcado' };
      return { acao: 'alterou o status', detalhe: `${lbl(it.de?.status)} → ${lbl(para)}` };
    }
    case 'horario_alterado':
      return { acao: 'remarcou o atendimento', detalhe: `${fmtDataHoraBR(String(it.de?.inicio_em))} → ${fmtDataHoraBR(String(it.para?.inicio_em))}` };
    case 'atendente_alterado':
      return { acao: 'trocou o atendente', detalhe: `${nomeAtend(it.de?.atendente_id)} → ${nomeAtend(it.para?.atendente_id)}` };
    default: return { acao: it.tipo };
  }
}
function addHora(h: string) { const [hh, mm] = h.split(':').map(Number); const t = (hh + 1) % 24; return `${String(t).padStart(2, '0')}:${String(mm).padStart(2, '0')}`; }
