import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Modal } from '@/components/Modal';
import { useToast } from '@/hooks/useToast';
import { useOrgUsuarios } from '@/data/atendimento';
import {
  useWaCanais, useAgendamentosOrg, useEditarAgendamento, useCancelarAgendamento, useReagendarAgendamento,
  WA_REAL, type AgendamentoOrg,
} from '@/data/whatsapp';
import { contarCards, rangePeriodo, agendaEditavel, agendaReagendavel, statusSequencia, type PeriodoAg } from '@/lib/agendamentoMensagem';
import { AgendarMensagemModal, type AgendarSubmit } from '@/components/AgendarMensagemModal';
import './AgendamentosMensagens.css';

const ST_META: Record<string, { label: string; cls: string }> = {
  agendada:    { label: 'Agendada',    cls: 'ag' },
  processando: { label: 'Enviando…',   cls: 'proc' },
  enviada:     { label: 'Enviada',     cls: 'env' },
  parcial:     { label: 'Parcial',     cls: 'proc' },
  falha:       { label: 'Falha',       cls: 'fail' },
  falhou:      { label: 'Falhou',      cls: 'fail' },
  bloqueada:   { label: 'Bloqueada',   cls: 'blk' },
  cancelada:   { label: 'Cancelada',   cls: 'canc' },
  expirada:    { label: 'Expirada',    cls: 'exp' },
};
const TIPO_LABEL: Record<string, string> = { texto: 'Texto', imagem: 'Imagem', audio: 'Áudio', video: 'Vídeo', documento: 'Documento', texto_midia: 'Texto + mídia' };
const tipoLbl = (t: string) => TIPO_LABEL[t] ?? t;
const stMeta = (s: string) => ST_META[s] ?? { label: s, cls: 'ag' };
const fmtSP = (iso: string) => new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });

/** Um agendamento operacional: mensagem avulsa OU uma sequência inteira (agrupada). */
interface Grupo {
  key: string;
  itens: AgendamentoOrg[];          // ordenados por ordem/executar
  primeiro: AgendamentoOrg;         // item de menor executar_em (início)
  count: number;
  ehSequencia: boolean;
  statusGeral: string;
  tentativas: number;               // soma
  erro: string | null;
  contatoNome: string | null; telefone: string | null; nomeCanal: string | null; canalId: string;
  criadoPor: string | null; criadoEm: string; conversaId: string; sequenciaId: string | null;
}

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

  // ── AGRUPAMENTO: por sequencia_id quando existir, senão pelo próprio id ──────
  const grupos = useMemo<Grupo[]>(() => {
    const map = new Map<string, AgendamentoOrg[]>();
    for (const r of rows) {
      const k = r.sequenciaId ?? r.id;
      const arr = map.get(k); if (arr) arr.push(r); else map.set(k, [r]);
    }
    const out: Grupo[] = [];
    for (const [key, itens0] of map) {
      const itens = [...itens0].sort((a, b) => (a.ordemNaSequencia ?? 0) - (b.ordemNaSequencia ?? 0) || new Date(a.executarEm).getTime() - new Date(b.executarEm).getTime());
      const primeiro = itens.reduce((m, x) => new Date(x.executarEm).getTime() < new Date(m.executarEm).getTime() ? x : m, itens[0]);
      out.push({
        key, itens, primeiro, count: itens.length, ehSequencia: itens.length > 1,
        statusGeral: statusSequencia(itens.map((i) => i.status)),
        tentativas: itens.reduce((s, i) => s + (i.tentativas ?? 0), 0),
        erro: itens.map((i) => i.motivoBloqueio || i.ultimoErro).find(Boolean) ?? null,
        contatoNome: primeiro.contatoNome, telefone: primeiro.telefone, nomeCanal: primeiro.nomeCanal, canalId: primeiro.canalId,
        criadoPor: primeiro.criadoPor, criadoEm: primeiro.criadoEm, conversaId: primeiro.conversaId, sequenciaId: primeiro.sequenciaId,
      });
    }
    return out.sort((a, b) => new Date(b.primeiro.executarEm).getTime() - new Date(a.primeiro.executarEm).getTime());
  }, [rows]);

  // ── filtros ──────────────────────────────────────────────────────────────
  const [fPeriodo, setFPeriodo] = useState<PeriodoAg>('todas');
  const [fStatus, setFStatus] = useState('');
  const [fCanal, setFCanal] = useState('');
  const [fCriador, setFCriador] = useState('');
  const [fTipo, setFTipo] = useState('');
  const [fBusca, setFBusca] = useState('');

  // cards contam AGENDAMENTOS/SEQUÊNCIAS (não mensagens): 1 entrada por grupo, pelo status geral.
  const cards = useMemo(
    () => contarCards(grupos.map((g) => ({ status: g.statusGeral === 'falha' ? 'falhou' : g.statusGeral, executarEmMs: new Date(g.primeiro.executarEm).getTime() })), Date.now()),
    [grupos],
  );

  const filtrados = useMemo(() => {
    const range = rangePeriodo(fPeriodo, Date.now());
    const busca = fBusca.trim().toLowerCase();
    return grupos.filter((g) => {
      if (range) { const ms = new Date(g.primeiro.executarEm).getTime(); if (ms < range.desdeMs || ms >= range.ateMs) return false; }
      if (fStatus && g.statusGeral !== fStatus) return false;
      if (fCanal && g.canalId !== fCanal) return false;
      if (fCriador && g.criadoPor !== fCriador) return false;
      if (fTipo && !g.itens.some((i) => i.tipo === fTipo)) return false;
      if (busca) { const alvo = `${g.contatoNome ?? ''} ${g.telefone ?? ''}`.toLowerCase(); if (!alvo.includes(busca)) return false; }
      return true;
    });
  }, [grupos, fPeriodo, fStatus, fCanal, fCriador, fTipo, fBusca]);

  function aplicarCard(status: string, periodo: PeriodoAg) {
    setFStatus(status); setFPeriodo(periodo); setFCanal(''); setFCriador(''); setFTipo(''); setFBusca('');
  }
  function limpar() { setFPeriodo('todas'); setFStatus(''); setFCanal(''); setFCriador(''); setFTipo(''); setFBusca(''); }
  const filtroAtivo = fPeriodo !== 'todas' || !!fStatus || !!fCanal || !!fCriador || !!fTipo || !!fBusca;

  // ── modais ────────────────────────────────────────────────────────────────
  const [verGrupo, setVerGrupo] = useState<Grupo | null>(null);
  const [comp, setComp] = useState<{ modo: 'editar' | 'reagendar'; item: AgendamentoOrg } | null>(null);

  async function submeterComposicao(v: AgendarSubmit) {
    if (!comp) return;
    if (v.modo === 'reagendar') {
      await reagendarMut.mutateAsync({ id: comp.item.id, conversaId: comp.item.conversaId, canalId: v.canalId, executarEm: v.executarISO });
      toast('Mensagem reagendada — voltou para a fila.');
    } else {
      await editarMut.mutateAsync({ id: comp.item.id, conversaId: comp.item.conversaId, canalId: v.canalId, texto: v.texto ?? '', executarEm: v.executarISO });
      toast('Agendamento atualizado.');
    }
    setComp(null);
  }

  async function cancelarItem(item: AgendamentoOrg) {
    if (!agendaEditavel(item.status) || cancelarMut.isPending) return;
    if (!window.confirm('Cancelar este agendamento? A mensagem não será enviada.')) return;
    try { await cancelarMut.mutateAsync({ id: item.id, conversaId: item.conversaId }); toast('Agendamento cancelado.'); }
    catch (e) { toast((e as Error).message || 'Falha ao cancelar.'); }
  }
  async function cancelarSequencia(g: Grupo) {
    const pend = g.itens.filter((i) => i.status === 'agendada');
    if (!pend.length || cancelarMut.isPending) return;
    if (!window.confirm(`Cancelar ${pend.length} ${pend.length === 1 ? 'mensagem pendente' : 'mensagens pendentes'} desta sequência? Elas não serão enviadas (as já enviadas permanecem).`)) return;
    try { for (const i of pend) await cancelarMut.mutateAsync({ id: i.id, conversaId: i.conversaId }); toast('Mensagens pendentes canceladas.'); }
    catch (e) { toast((e as Error).message || 'Falha ao cancelar.'); }
  }

  const abrirConversa = (conversaId: string) => navigate(`/whatsapp?conversa=${encodeURIComponent(conversaId)}`);

  function previaGrupo(g: Grupo): string {
    const p = g.primeiro;
    const base = (p.texto?.trim()) || p.nomeArquivo || tipoLbl(p.tipo);
    return g.ehSequencia ? `${base}` : (p.texto || p.nomeArquivo || '—');
  }

  if (!WA_REAL) {
    return <div className="agm-wrap"><div className="agm-empty">Disponível com o backend configurado.</div></div>;
  }

  return (
    <div className="agm-wrap">
      {/* Cards de resumo — contam agendamentos/sequências agrupados */}
      <div className="agm-cards">
        <button className="agm-card" onClick={() => aplicarCard('agendada', 'hoje')}><span className="agm-card-n">{cards.hoje}</span><span className="agm-card-l">Agendadas hoje</span></button>
        <button className="agm-card" onClick={() => aplicarCard('agendada', '7d')}><span className="agm-card-n">{cards.prox7}</span><span className="agm-card-l">Próximos 7 dias</span></button>
        <button className="agm-card" onClick={() => aplicarCard('enviada', 'todas')}><span className="agm-card-n">{cards.enviadas}</span><span className="agm-card-l">Enviadas</span></button>
        <button className="agm-card agm-card-warn" onClick={() => aplicarCard('falha', 'todas')}><span className="agm-card-n">{cards.falhas}</span><span className="agm-card-l">Falhas</span></button>
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
          <option value="enviada">Enviada</option>
          <option value="parcial">Parcial</option>
          <option value="falha">Falha</option>
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
        {filtroAtivo && <button className="agm-clear" onClick={limpar}>Limpar</button>}
      </div>

      {/* Tabela — 1 linha por agendamento/sequência */}
      <div className="agm-tablewrap">
        <table className="agm-table">
          <thead>
            <tr>
              <th>Data/hora</th><th>Cliente</th><th>Telefone</th><th>Canal</th><th>Tipo</th>
              <th>Prévia</th><th>Criado por</th><th>Status</th><th className="agm-center">Msgs</th><th className="agm-center">Tent.</th><th>Erro/motivo</th><th>Criado em</th><th className="agm-actcol">Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtrados.length === 0 && (
              <tr><td colSpan={13} className="agm-empty-row">{rowsQ.isLoading ? 'Carregando…' : 'Nenhum agendamento com esses filtros.'}</td></tr>
            )}
            {filtrados.map((g) => {
              const st = stMeta(g.statusGeral);
              const item = g.itens[0];
              const podeCancelarSeq = g.ehSequencia && g.itens.some((i) => i.status === 'agendada');
              return (
                <tr key={g.key}>
                  <td className="agm-nowrap">{fmtSP(g.primeiro.executarEm)}</td>
                  <td>{g.contatoNome ?? '—'}</td>
                  <td className="agm-nowrap">{g.telefone ?? '—'}</td>
                  <td>{g.nomeCanal ?? '—'}</td>
                  <td>{g.ehSequencia ? 'Sequência' : tipoLbl(g.primeiro.tipo)}</td>
                  <td className="agm-preview" title={previaGrupo(g)} onClick={() => setVerGrupo(g)}>{previaGrupo(g)}</td>
                  <td>{nomePorId(g.criadoPor) ?? '—'}</td>
                  <td><span className={'agm-st agm-st-' + st.cls}>{st.label}</span></td>
                  <td className="agm-center">{g.count}</td>
                  <td className="agm-center">{g.tentativas}</td>
                  <td className="agm-err" title={g.erro ?? ''}>{g.erro || '—'}</td>
                  <td className="agm-nowrap agm-muted">{fmtSP(g.criadoEm)}</td>
                  <td className="agm-acts">
                    <button className="agm-mini" onClick={() => setVerGrupo(g)}>Ver</button>
                    {!g.ehSequencia && agendaEditavel(item.status) && <>
                      <button className="agm-mini" onClick={() => setComp({ modo: 'editar', item })}>Editar</button>
                      <button className="agm-mini danger" onClick={() => cancelarItem(item)} disabled={cancelarMut.isPending}>Cancelar</button>
                    </>}
                    {!g.ehSequencia && agendaReagendavel(item.status) && <button className="agm-mini" onClick={() => setComp({ modo: 'reagendar', item })}>Reagendar</button>}
                    {podeCancelarSeq && <button className="agm-mini danger" onClick={() => cancelarSequencia(g)} disabled={cancelarMut.isPending}>Cancelar pendentes</button>}
                    <button className="agm-mini" onClick={() => abrirConversa(g.conversaId)}>Abrir conversa</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Modal editar / reagendar (só agendamento avulso) */}
      <AgendarMensagemModal
        open={!!comp}
        modo={comp?.modo ?? 'editar'}
        canais={canais}
        temTelefone={!!comp?.item.telefone}
        initial={comp ? { canalId: comp.item.canalId, texto: comp.item.texto ?? '', executarEm: comp.item.executarEm, tipo: comp.item.tipo, nomeArquivo: comp.item.nomeArquivo ?? undefined } : null}
        onClose={() => setComp(null)}
        onSubmit={submeterComposicao}
      />

      {/* Drawer/Modal de detalhes do agendamento (com mensagens internas) */}
      <Modal open={!!verGrupo} onClose={() => setVerGrupo(null)} width={620} title="Detalhes do agendamento"
        footer={<>
          {verGrupo && <button className="agm-btn" onClick={() => abrirConversa(verGrupo.conversaId)}>Abrir conversa</button>}
          <button className="agm-btn primary" onClick={() => setVerGrupo(null)}>Fechar</button>
        </>}>
        {verGrupo && (
          <div className="agm-ver">
            <dl>
              <dt>Status geral</dt><dd><span className={'agm-st agm-st-' + stMeta(verGrupo.statusGeral).cls}>{stMeta(verGrupo.statusGeral).label}</span></dd>
              <dt>Cliente</dt><dd>{verGrupo.contatoNome ?? '—'} {verGrupo.telefone ? `· ${verGrupo.telefone}` : ''}</dd>
              <dt>Canal</dt><dd>{verGrupo.nomeCanal ?? '—'}</dd>
              <dt>Tipo</dt><dd>{verGrupo.ehSequencia ? `Sequência · ${verGrupo.count} mensagens` : tipoLbl(verGrupo.primeiro.tipo)}</dd>
              <dt>Início em</dt><dd>{fmtSP(verGrupo.primeiro.executarEm)}</dd>
              <dt>Criado por</dt><dd>{nomePorId(verGrupo.criadoPor) ?? '—'} · {fmtSP(verGrupo.criadoEm)}</dd>
              {verGrupo.ehSequencia && verGrupo.sequenciaId && <><dt>Sequência</dt><dd className="agm-muted">{verGrupo.sequenciaId}</dd></>}
            </dl>
            <div className="agm-ver-lbl">{verGrupo.ehSequencia ? `Mensagens (${verGrupo.count})` : 'Mensagem'}</div>
            <ol className="agm-itens">
              {verGrupo.itens.map((i, idx) => {
                const ist = stMeta(i.status);
                const ierro = i.motivoBloqueio || i.ultimoErro;
                return (
                  <li key={i.id} className="agm-item">
                    <div className="agm-item-top">
                      <span className="agm-item-ord">{verGrupo.ehSequencia ? `${idx + 1}.` : ''} {fmtSP(i.executarEm)}</span>
                      <span className="agm-item-tipo">{tipoLbl(i.tipo)}</span>
                      <span className={'agm-st agm-st-' + ist.cls}>{ist.label}</span>
                    </div>
                    <div className="agm-item-txt">{i.texto || i.nomeArquivo || '—'}</div>
                    <div className="agm-item-meta">
                      {i.nomeArquivo ? <span>📎 {i.nomeArquivo}</span> : null}
                      <span>tent. {i.tentativas}</span>
                      {i.mensagemIdEnviada ? <span>enviada ✓</span> : null}
                      {ierro ? <span className="agm-err">· {ierro}</span> : null}
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        )}
      </Modal>
    </div>
  );
}
