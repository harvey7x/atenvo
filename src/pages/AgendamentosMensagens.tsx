import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Modal } from '@/components/Modal';
import { useToast } from '@/hooks/useToast';
import { useOrgUsuarios } from '@/data/atendimento';
import {
  useWaCanais, useAgendamentosOrg, useEditarAgendamento, useCancelarAgendamento, useReagendarAgendamento,
  WA_REAL, type AgendamentoOrg,
} from '@/data/whatsapp';
import { contarCards, rangePeriodo, agendaEditavel, agendaReagendavel, type PeriodoAg } from '@/lib/agendamentoMensagem';
import { AgendarMensagemModal, type AgendarSubmit } from '@/components/AgendarMensagemModal';
import './AgendamentosMensagens.css';

const ST_META: Record<string, { label: string; cls: string }> = {
  agendada:    { label: 'Agendada',    cls: 'ag' },
  processando: { label: 'Enviando…',   cls: 'proc' },
  enviada:     { label: 'Enviada',     cls: 'env' },
  falhou:      { label: 'Falhou',      cls: 'fail' },
  bloqueada:   { label: 'Bloqueada',   cls: 'blk' },
  cancelada:   { label: 'Cancelada',   cls: 'canc' },
  expirada:    { label: 'Expirada',    cls: 'exp' },
};
const TIPO_LABEL: Record<string, string> = { texto: 'Texto', imagem: 'Imagem', audio: 'Áudio', video: 'Vídeo', documento: 'Documento', texto_midia: 'Texto + mídia' };
const tipoLbl = (t: string) => TIPO_LABEL[t] ?? t;

const fmtSP = (iso: string) => new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });

type Modo = 'editar' | 'reagendar' | 'ver' | null;

export function AgendamentosMensagens() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const canais = useWaCanais().data ?? [];
  const orgUsuarios = useOrgUsuarios().data ?? [];
  const nomePorId = (id: string | null) => (id ? orgUsuarios.find((u) => u.id === id)?.nome ?? null : null);
  const rowsQ = useAgendamentosOrg();
  const rows = useMemo(() => rowsQ.data ?? [], [rowsQ.data]);

  const editarMut = useEditarAgendamento();
  const cancelarMut = useCancelarAgendamento();
  const reagendarMut = useReagendarAgendamento();

  // ── filtros ──────────────────────────────────────────────────────────────
  const [fPeriodo, setFPeriodo] = useState<PeriodoAg>('todas');
  const [fStatus, setFStatus] = useState('');
  const [fCanal, setFCanal] = useState('');
  const [fCriador, setFCriador] = useState('');
  const [fTipo, setFTipo] = useState('');
  const [fBusca, setFBusca] = useState('');

  const cards = useMemo(
    () => contarCards(rows.map((r) => ({ status: r.status, executarEmMs: new Date(r.executarEm).getTime() })), Date.now()),
    [rows],
  );

  const filtrados = useMemo(() => {
    const range = rangePeriodo(fPeriodo, Date.now());
    const busca = fBusca.trim().toLowerCase();
    return rows.filter((r) => {
      if (range) { const ms = new Date(r.executarEm).getTime(); if (ms < range.desdeMs || ms >= range.ateMs) return false; }
      if (fStatus && r.status !== fStatus) return false;
      if (fCanal && r.canalId !== fCanal) return false;
      if (fCriador && r.criadoPor !== fCriador) return false;
      if (fTipo && r.tipo !== fTipo) return false;
      if (busca) {
        const alvo = `${r.contatoNome ?? ''} ${r.telefone ?? ''}`.toLowerCase();
        if (!alvo.includes(busca)) return false;
      }
      return true;
    });
  }, [rows, fPeriodo, fStatus, fCanal, fCriador, fTipo, fBusca]);

  function aplicarCard(status: string, periodo: PeriodoAg) {
    setFStatus(status); setFPeriodo(periodo); setFCanal(''); setFCriador(''); setFTipo(''); setFBusca('');
  }

  // ── modais: editar/reagendar (via AgendarMensagemModal) e ver ─────────────
  const [modo, setModo] = useState<Modo>(null);
  const [sel, setSel] = useState<AgendamentoOrg | null>(null);

  function abrirEditar(r: AgendamentoOrg) { setSel(r); setModo('editar'); }
  function abrirReagendar(r: AgendamentoOrg) { setSel(r); setModo('reagendar'); }
  function abrirVer(r: AgendamentoOrg) { setSel(r); setModo('ver'); }
  function fecharComposicao() { setModo(null); setSel(null); }

  async function submeterComposicao(v: AgendarSubmit) {
    if (!sel) return;
    if (v.modo === 'reagendar') {
      await reagendarMut.mutateAsync({ id: sel.id, conversaId: sel.conversaId, canalId: v.canalId, executarEm: v.executarISO });
      toast('Mensagem reagendada — voltou para a fila.');
    } else {
      await editarMut.mutateAsync({ id: sel.id, conversaId: sel.conversaId, canalId: v.canalId, texto: v.texto ?? '', executarEm: v.executarISO });
      toast('Agendamento atualizado.');
    }
    setModo(null); setSel(null);
  }

  async function cancelar(r: AgendamentoOrg) {
    if (!agendaEditavel(r.status) || cancelarMut.isPending) return;
    if (!window.confirm('Cancelar este agendamento? A mensagem não será enviada.')) return;
    try { await cancelarMut.mutateAsync({ id: r.id, conversaId: r.conversaId }); toast('Agendamento cancelado.'); }
    catch (e) { toast((e as Error).message || 'Falha ao cancelar.'); }
  }

  const abrirConversa = (r: AgendamentoOrg) => navigate(`/whatsapp?conversa=${encodeURIComponent(r.conversaId)}`);

  if (!WA_REAL) {
    return <div className="agm-wrap"><div className="agm-empty">Disponível com o backend configurado.</div></div>;
  }

  return (
    <div className="agm-wrap">
      {/* Cards de resumo */}
      <div className="agm-cards">
        <button className="agm-card" onClick={() => aplicarCard('agendada', 'hoje')}><span className="agm-card-n">{cards.hoje}</span><span className="agm-card-l">Agendadas hoje</span></button>
        <button className="agm-card" onClick={() => aplicarCard('agendada', '7d')}><span className="agm-card-n">{cards.prox7}</span><span className="agm-card-l">Próximos 7 dias</span></button>
        <button className="agm-card" onClick={() => aplicarCard('enviada', 'todas')}><span className="agm-card-n">{cards.enviadas}</span><span className="agm-card-l">Enviadas</span></button>
        <button className="agm-card agm-card-warn" onClick={() => aplicarCard('falhou', 'todas')}><span className="agm-card-n">{cards.falhas}</span><span className="agm-card-l">Falhas</span></button>
        <button className="agm-card agm-card-warn" onClick={() => aplicarCard('bloqueada', 'todas')}><span className="agm-card-n">{cards.bloqueadas}</span><span className="agm-card-l">Bloqueadas</span></button>
        <button className="agm-card" onClick={() => aplicarCard('cancelada', 'todas')}><span className="agm-card-n">{cards.canceladas}</span><span className="agm-card-l">Canceladas</span></button>
      </div>

      {/* Filtros */}
      <div className="agm-filters">
        <select value={fPeriodo} onChange={(e) => setFPeriodo(e.target.value as PeriodoAg)}>
          <option value="todas">Todas as datas</option>
          <option value="hoje">Hoje</option>
          <option value="amanha">Amanhã</option>
          <option value="7d">Próximos 7 dias</option>
          <option value="30d">Próximos 30 dias</option>
        </select>
        <select value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
          <option value="">Todos os status</option>
          <option value="agendada">Agendada</option>
          <option value="processando">Enviando</option>
          <option value="enviada">Enviada</option>
          <option value="falhou">Falhou</option>
          <option value="bloqueada">Bloqueada</option>
          <option value="cancelada">Cancelada</option>
          <option value="expirada">Expirada</option>
        </select>
        <select value={fCanal} onChange={(e) => setFCanal(e.target.value)}>
          <option value="">Todos os canais</option>
          {canais.map((c) => <option key={c.id} value={c.id}>{c.alias}</option>)}
        </select>
        <select value={fCriador} onChange={(e) => setFCriador(e.target.value)}>
          <option value="">Todos os atendentes</option>
          {orgUsuarios.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
        </select>
        <select value={fTipo} onChange={(e) => setFTipo(e.target.value)}>
          <option value="">Todos os tipos</option>
          <option value="texto">Texto</option>
          <option value="imagem">Imagem</option>
          <option value="audio">Áudio</option>
          <option value="video">Vídeo</option>
          <option value="documento">Documento</option>
        </select>
        <input className="agm-search" placeholder="Buscar cliente ou telefone…" value={fBusca} onChange={(e) => setFBusca(e.target.value)} />
        {(fPeriodo !== 'todas' || fStatus || fCanal || fCriador || fTipo || fBusca) && (
          <button className="agm-clear" onClick={() => { setFPeriodo('todas'); setFStatus(''); setFCanal(''); setFCriador(''); setFTipo(''); setFBusca(''); }}>Limpar</button>
        )}
      </div>

      {/* Tabela */}
      <div className="agm-tablewrap">
        <table className="agm-table">
          <thead>
            <tr>
              <th>Data/hora</th><th>Cliente</th><th>Telefone</th><th>Canal</th><th>Tipo</th>
              <th>Prévia</th><th>Criado por</th><th>Status</th><th>Tent.</th><th>Erro/motivo</th><th>Criado em</th><th className="agm-actcol">Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtrados.length === 0 && (
              <tr><td colSpan={12} className="agm-empty-row">{rowsQ.isLoading ? 'Carregando…' : 'Nenhum agendamento com esses filtros.'}</td></tr>
            )}
            {filtrados.map((r) => {
              const st = ST_META[r.status] ?? { label: r.status, cls: 'ag' };
              const erro = r.motivoBloqueio || r.ultimoErro || '';
              return (
                <tr key={r.id}>
                  <td className="agm-nowrap">{fmtSP(r.executarEm)}</td>
                  <td>{r.contatoNome ?? '—'}</td>
                  <td className="agm-nowrap">{r.telefone ?? '—'}</td>
                  <td>{r.nomeCanal ?? '—'}</td>
                  <td>{tipoLbl(r.tipo)}</td>
                  <td className="agm-preview" title={r.texto ?? r.nomeArquivo ?? ''} onClick={() => abrirVer(r)}>{r.texto || r.nomeArquivo || '—'}</td>
                  <td>{nomePorId(r.criadoPor) ?? '—'}</td>
                  <td><span className={'agm-st agm-st-' + st.cls}>{st.label}</span></td>
                  <td className="agm-center">{r.tentativas}</td>
                  <td className="agm-err" title={erro}>{erro || '—'}</td>
                  <td className="agm-nowrap agm-muted">{fmtSP(r.criadoEm)}</td>
                  <td className="agm-acts">
                    {agendaEditavel(r.status) && <>
                      <button className="agm-mini" onClick={() => abrirEditar(r)}>Editar</button>
                      <button className="agm-mini danger" onClick={() => cancelar(r)} disabled={cancelarMut.isPending}>Cancelar</button>
                    </>}
                    {agendaReagendavel(r.status) && <button className="agm-mini" onClick={() => abrirReagendar(r)}>Reagendar</button>}
                    <button className="agm-mini" onClick={() => abrirVer(r)}>Ver</button>
                    <button className="agm-mini" onClick={() => abrirConversa(r)}>Abrir conversa</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Modal editar / reagendar — composição rica compartilhada */}
      <AgendarMensagemModal
        open={modo === 'editar' || modo === 'reagendar'}
        modo={modo === 'reagendar' ? 'reagendar' : 'editar'}
        canais={canais}
        temTelefone={!!sel?.telefone}
        initial={sel ? { canalId: sel.canalId, texto: sel.texto ?? '', executarEm: sel.executarEm, tipo: sel.tipo, nomeArquivo: sel.nomeArquivo ?? undefined } : null}
        onClose={fecharComposicao}
        onSubmit={submeterComposicao}
      />

      {/* Modal ver (somente leitura) */}
      <Modal open={modo === 'ver'} onClose={() => { setModo(null); setSel(null); }} width={480} title="Detalhes do agendamento"
        footer={<>
          {sel && <button className="agm-btn" onClick={() => abrirConversa(sel)}>Abrir conversa</button>}
          <button className="agm-btn primary" onClick={() => { setModo(null); setSel(null); }}>Fechar</button>
        </>}>
        {sel && (
          <div className="agm-ver">
            <dl>
              <dt>Status</dt><dd><span className={'agm-st agm-st-' + (ST_META[sel.status]?.cls ?? 'ag')}>{ST_META[sel.status]?.label ?? sel.status}</span></dd>
              <dt>Cliente</dt><dd>{sel.contatoNome ?? '—'} {sel.telefone ? `· ${sel.telefone}` : ''}</dd>
              <dt>Canal</dt><dd>{sel.nomeCanal ?? '—'}</dd>
              <dt>Tipo</dt><dd>{tipoLbl(sel.tipo)}</dd>
              {sel.nomeArquivo && <><dt>Arquivo</dt><dd>{sel.nomeArquivo}</dd></>}
              <dt>Envio em</dt><dd>{fmtSP(sel.executarEm)}</dd>
              <dt>Criado por</dt><dd>{nomePorId(sel.criadoPor) ?? '—'} · {fmtSP(sel.criadoEm)}</dd>
              <dt>Tentativas</dt><dd>{sel.tentativas}</dd>
              {sel.enviadaEm && <><dt>Enviada em</dt><dd>{fmtSP(sel.enviadaEm)}</dd></>}
              {(sel.motivoBloqueio || sel.ultimoErro) && <><dt>Erro/motivo</dt><dd className="agm-err">{sel.motivoBloqueio || sel.ultimoErro}</dd></>}
            </dl>
            <div className="agm-ver-txt"><div className="agm-ver-lbl">Mensagem</div>{sel.texto ?? '—'}</div>
          </div>
        )}
      </Modal>
    </div>
  );
}
