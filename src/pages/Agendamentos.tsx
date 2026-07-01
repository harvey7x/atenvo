import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './Agendamentos.css';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/hooks/useToast';
import { Modal } from '@/components/Modal';
import { useOrgUsuarios } from '@/data/atendimento';
import { useAgendamentos, useCriarAgendamento, useAtualizarAgendamento, useContatosBusca, AG_STATUS, AG_TIPOS, agStatusInfo, SP_OFFSET, AG_REAL, type Agendamento, type AgStatus } from '@/data/agendamentos';

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
/** ISO (UTC) a partir de data local SP (yyyy-mm-dd) + hora HH:mm. */
const spISO = (dateKey: string, hora: string) => new Date(`${dateKey}T${hora}:00${SP_OFFSET}`).toISOString();
const keyOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function inicioSemana(d: Date) { const x = new Date(d); const dw = x.getDay(); x.setDate(x.getDate() - dw); x.setHours(0, 0, 0, 0); return x; } // domingo
function addDias(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
const hhmm = (dec: number) => `${String(Math.floor(dec)).padStart(2, '0')}:${String(Math.round((dec % 1) * 60)).padStart(2, '0')}`;

export function Agendamentos() {
  const { user } = useAuth();
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

  // próximos (a partir de agora)
  const proximos = useMemo(() => todos.filter((a) => new Date(a.inicioEm).getTime() >= Date.now() && a.status !== 'cancelado').slice(0, 6), [todos]);

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

  const hojeKey = keyOf(new Date());
  const nowDec = spParts(new Date().toISOString()).horaDec;

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
                      const h = Math.max(28, (Math.min(f.horaDec, HORA_FIM) - s.horaDec) * HORA_PX - 3);
                      const info = agStatusInfo(a.status);
                      return (
                        <button key={a.id} className="agn-ev" style={{ top, height: h, background: info.cor + '18', borderColor: info.cor + '55' }} onClick={(e) => { e.stopPropagation(); abrir(a); }}>
                          <span className="agn-ev-hora">{s.hora} – {f.hora}</span>
                          <span className="agn-ev-nome">{a.clienteNome || a.titulo || 'Sem cliente'}</span>
                          <span className="agn-ev-tipo">{a.tipo}{a.atendenteNome ? ' · ' + a.atendenteNome : ''}</span>
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
          <div className="agn-prox">
            <div className="agn-prox-t">Próximos agendamentos</div>
            {proximos.length === 0 ? <div className="agn-prox-empty">Nenhum agendamento próximo.</div> : proximos.map((a) => {
              const s = spParts(a.inicioEm); const info = agStatusInfo(a.status);
              return (
                <button key={a.id} className="agn-prox-i" onClick={() => abrir(a)}>
                  <span className="agn-prox-h" style={{ color: info.cor }}>{s.hora}</span>
                  <span className="agn-prox-b"><span className="agn-prox-n">{a.clienteNome || a.titulo || 'Sem cliente'}</span><span className="agn-prox-s">{a.tipo}{a.atendenteNome ? ' · ' + a.atendenteNome : ''}</span></span>
                </button>
              );
            })}
          </div>
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
        onClose={() => setModalOpen(false)} onSaved={() => { setModalOpen(false); q.refetch(); }}
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

function AgModal({ editId, prefill, atendentes, agendamento, onClose, onSaved, userId, toast, navigate }: {
  editId: string | null; prefill: { dataKey: string; hora: string } | null; atendentes: { id: string; nome: string }[];
  agendamento: Agendamento | null; onClose: () => void; onSaved: () => void; userId: string;
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
    atendenteId: ed?.atendenteId ?? '', tipo: ed?.tipo ?? 'Reunião inicial', tipoOutro: '',
    local: ed?.local ?? '', endereco: ed?.endereco ?? '', status: (ed?.status ?? 'pendente') as AgStatus, observacoes: ed?.observacoes ?? '',
  }));
  const [busca, setBusca] = useState('');
  const contatosQ = useContatosBusca(busca);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const set = (k: string, v: unknown) => setF((x) => ({ ...x, [k]: v }));

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
      if (editId) await atualizar.mutateAsync({ id: editId, patch: { contato_id: base.contatoId, atendente_id: base.atendenteId, tipo, cliente_nome: base.clienteNome, telefone: base.telefone, inicio_em: base.inicioEm, fim_em: base.fimEm, status: base.status, local: base.local, endereco: base.endereco, observacoes: base.observacoes } });
      else await criar.mutateAsync({ ...base, criadoPor: userId });
      toast(editId ? 'Agendamento atualizado' : 'Agendamento criado'); onSaved();
    } catch (e) { setErro((e as Error).message || 'Não foi possível salvar.'); }
    finally { setBusy(false); }
  }
  async function mudarStatus(s: AgStatus, motivoCampo?: 'motivo_cancelamento' | 'motivo_remarcacao') {
    if (!editId) return;
    let motivo: string | undefined;
    if (motivoCampo) { motivo = window.prompt(s === 'cancelado' ? 'Motivo do cancelamento:' : 'Motivo da remarcação:') || undefined; if (motivoCampo === 'motivo_cancelamento' && !motivo) return; }
    setBusy(true);
    try { await atualizar.mutateAsync({ id: editId, patch: { status: s, ...(motivoCampo && motivo ? { [motivoCampo]: motivo } : {}) } }); toast('Status atualizado'); onSaved(); }
    catch (e) { setErro((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <Modal open onClose={() => { if (!busy) onClose(); }} title={editId ? 'Detalhe do agendamento' : 'Novo agendamento'} width={520} closeOnBackdrop={!busy}
      footer={<>
        <button className="atv-btn" disabled={busy} onClick={onClose}>Fechar</button>
        <button className="atv-btn primary" disabled={busy} onClick={salvar}>{busy ? 'Salvando…' : (editId ? 'Salvar' : 'Criar agendamento')}</button>
      </>}>
      <div className="agn-form">
        <label className="agn-fld"><span>Cliente <span className="req">*</span></span>
          <input className="atv-input" value={f.clienteNome} placeholder="Nome do cliente" onChange={(e) => { set('clienteNome', e.target.value); setBusca(e.target.value); if (!e.target.value) set('contatoId', ''); }} />
          {busca.trim().length >= 2 && !f.contatoId && (contatosQ.data?.length ?? 0) > 0 && (
            <div className="agn-cts">
              {contatosQ.data!.map((c) => <button key={c.id} type="button" className="agn-ct" onClick={() => { set('contatoId', c.id); set('clienteNome', c.nome); set('telefone', c.telefone ?? ''); setBusca(''); }}>{c.nome}{c.telefone ? ' · ' + c.telefone : ''}</button>)}
            </div>
          )}
          {f.contatoId && <span className="agn-vinc">✓ vinculado ao contato <button type="button" className="link-btn" onClick={() => navigate(`/contatos?contato=${f.contatoId}`)}>abrir</button></span>}
        </label>
        <div className="agn-row2">
          <label className="agn-fld"><span>Telefone</span><input className="atv-input" value={f.telefone} onChange={(e) => set('telefone', e.target.value)} placeholder="55 11 99999-8888" /></label>
          <label className="agn-fld"><span>Atendente</span>
            <select className="atv-input" value={f.atendenteId} onChange={(e) => set('atendenteId', e.target.value)}><option value="">Não atribuído</option>{atendentes.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}</select>
          </label>
        </div>
        <div className="agn-row3">
          <label className="agn-fld"><span>Data</span><input className="atv-input" type="date" value={f.dataKey} onChange={(e) => set('dataKey', e.target.value)} /></label>
          <label className="agn-fld"><span>Início</span><input className="atv-input" type="time" value={f.horaIni} onChange={(e) => set('horaIni', e.target.value)} /></label>
          <label className="agn-fld"><span>Fim</span><input className="atv-input" type="time" value={f.horaFim} onChange={(e) => set('horaFim', e.target.value)} /></label>
        </div>
        <div className="agn-row2">
          <label className="agn-fld"><span>Tipo de atendimento</span>
            <select className="atv-input" value={f.tipo} onChange={(e) => set('tipo', e.target.value)}>{AG_TIPOS.map((t) => <option key={t} value={t}>{t}</option>)}</select>
          </label>
          <label className="agn-fld"><span>Status</span>
            <select className="atv-input" value={f.status} onChange={(e) => set('status', e.target.value as AgStatus)}>{AG_STATUS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
          </label>
        </div>
        {f.tipo === 'Outro' && <label className="agn-fld"><span>Descreva o tipo</span><input className="atv-input" value={f.tipoOutro} onChange={(e) => set('tipoOutro', e.target.value)} placeholder="Tipo personalizado" /></label>}
        <div className="agn-row2">
          <label className="agn-fld"><span>Unidade/Local</span><input className="atv-input" value={f.local} onChange={(e) => set('local', e.target.value)} placeholder="Ex.: Matriz" /></label>
          <label className="agn-fld"><span>Endereço</span><input className="atv-input" value={f.endereco} onChange={(e) => set('endereco', e.target.value)} placeholder="Rua, nº, cidade" /></label>
        </div>
        <label className="agn-fld"><span>Observações</span><textarea className="atv-input" rows={2} value={f.observacoes} onChange={(e) => set('observacoes', e.target.value)} /></label>
        {editId && (
          <div className="agn-acts">
            <button className="agn-act" disabled={busy} onClick={() => mudarStatus('confirmado')}>Confirmar</button>
            <button className="agn-act" disabled={busy} onClick={() => mudarStatus('realizado')}>Realizado</button>
            <button className="agn-act" disabled={busy} onClick={() => mudarStatus('nao_compareceu')}>Não compareceu</button>
            <button className="agn-act" disabled={busy} onClick={() => mudarStatus('remarcado', 'motivo_remarcacao')}>Remarcar</button>
            <button className="agn-act danger" disabled={busy} onClick={() => mudarStatus('cancelado', 'motivo_cancelamento')}>Cancelar</button>
          </div>
        )}
        {erro && <div className="atv-field-err">{erro}</div>}
      </div>
    </Modal>
  );
}
function addHora(h: string) { const [hh, mm] = h.split(':').map(Number); const t = (hh + 1) % 24; return `${String(t).padStart(2, '0')}:${String(mm).padStart(2, '0')}`; }
