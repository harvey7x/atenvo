import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Modal } from '@/components/Modal';
import { useToast } from '@/hooks/useToast';
import { useOrg } from '@/context/OrgContext';
import { useOrgUsuarios } from '@/data/atendimento';
import { useBuscaContatos } from '@/data/contatos';
import {
  useWaCanais, useAgendamentosOrg, useEditarAgendamento, useCancelarAgendamento, useReagendarAgendamento,
  useAgendarSequencia, conversaAtivaDoContato, WA_REAL, type AgendamentoOrg,
} from '@/data/whatsapp';
import { contarCards, rangePeriodo, agendaEditavel, agendaReagendavel, statusSequencia, type PeriodoAg } from '@/lib/agendamentoMensagem';
import { AgendarMensagemModal, type AgendarSubmit } from '@/components/AgendarMensagemModal';
import './AgendamentosMensagens.css';

const ST_META: Record<string, { label: string; cls: string }> = {
  agendada:    { label: 'Programada', cls: 'ag' },
  processando: { label: 'Enviando…',  cls: 'proc' },
  enviada:     { label: 'Enviada',    cls: 'env' },
  parcial:     { label: 'Parcial',    cls: 'proc' },
  falha:       { label: 'Falha',      cls: 'fail' },
  falhou:      { label: 'Falhou',     cls: 'fail' },
  bloqueada:   { label: 'Bloqueada',  cls: 'blk' },
  cancelada:   { label: 'Cancelada',  cls: 'canc' },
  expirada:    { label: 'Expirada',   cls: 'exp' },
};
const TIPO_LABEL: Record<string, string> = { texto: 'Texto', imagem: 'Imagem', audio: 'Áudio', video: 'Vídeo', documento: 'Documento', texto_midia: 'Texto + mídia' };
const tipoLbl = (t: string) => TIPO_LABEL[t] ?? t;
const stMeta = (s: string) => ST_META[s] ?? { label: s, cls: 'ag' };
const fmtSP = (iso: string) => new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
const fmtHora = (iso: string) => new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
const fmtDia = (iso: string) => new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: '2-digit' });
const iniciais = (n: string) => n.trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toLocaleUpperCase('pt-BR') || '?';

/* ícones dos cards — um por status, para o número não ficar sozinho */
const IcSend = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m22 2-7 20-4-9-9-4z" /><path d="M22 2 11 13" /></svg>;
const IcCheck = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="m8.5 12 2.5 2.5 4.5-5" /></svg>;
const IcWarn = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4M12 17h.01" /></svg>;
const IcBlock = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="m5.6 5.6 12.8 12.8" /></svg>;
const IcX = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="m15 9-6 6M9 9l6 6" /></svg>;
const IcSearch = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.2-3.2" /></svg>;
const IcFiltro = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M3 5h18l-7 8v6l-4 2v-8z" /></svg>;
const IcPlus = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>;
const IcClose = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><path d="m6 6 12 12M18 6 6 18" /></svg>;

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

/** Abas -> status geral do grupo. 'visao' não filtra. */
const ABAS: { id: string; label: string; status: string }[] = [
  { id: 'visao', label: 'Visão geral', status: '' },
  { id: 'prog', label: 'Programados', status: 'agendada' },
  { id: 'env', label: 'Enviados', status: 'enviada' },
  { id: 'fal', label: 'Falhas', status: 'falha' },
  { id: 'blk', label: 'Bloqueados', status: 'bloqueada' },
  { id: 'can', label: 'Cancelados', status: 'cancelada' },
];

export function AgendamentosMensagens() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { currentOrg } = useOrg();
  const canais = useWaCanais().data ?? [];
  const orgUsuarios = useOrgUsuarios().data ?? [];
  const nomePorId = (id: string | null) => (id ? orgUsuarios.find((u) => u.id === id)?.nome ?? null : null);
  const rowsQ = useAgendamentosOrg();
  const rows = useMemo(() => rowsQ.data ?? [], [rowsQ.data]);

  const editarMut = useEditarAgendamento();
  const cancelarMut = useCancelarAgendamento();
  const reagendarMut = useReagendarAgendamento();
  const criarSeqMut = useAgendarSequencia();

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

  // ── abas + filtros ────────────────────────────────────────────────────────
  const [aba, setAba] = useState('visao');
  const [fPeriodo, setFPeriodo] = useState<PeriodoAg>('todas');
  const [fCanal, setFCanal] = useState('');
  const [fCriador, setFCriador] = useState('');
  const [fTipo, setFTipo] = useState('');
  const [fBusca, setFBusca] = useState('');
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  const statusAba = ABAS.find((a) => a.id === aba)?.status ?? '';

  // Cards contam AGENDAMENTOS/SEQUÊNCIAS (não mensagens): 1 entrada por grupo, pelo status geral.
  const cards = useMemo(
    () => contarCards(grupos.map((g) => ({ status: g.statusGeral === 'falha' ? 'falhou' : g.statusGeral, executarEmMs: new Date(g.primeiro.executarEm).getTime() })), Date.now()),
    [grupos],
  );
  const programados = useMemo(() => grupos.filter((g) => g.statusGeral === 'agendada').length, [grupos]);

  const filtrados = useMemo(() => {
    const range = rangePeriodo(fPeriodo, Date.now());
    const busca = fBusca.trim().toLowerCase();
    return grupos.filter((g) => {
      if (range) { const ms = new Date(g.primeiro.executarEm).getTime(); if (ms < range.desdeMs || ms >= range.ateMs) return false; }
      if (statusAba && g.statusGeral !== statusAba) return false;
      if (fCanal && g.canalId !== fCanal) return false;
      if (fCriador && g.criadoPor !== fCriador) return false;
      if (fTipo && !g.itens.some((i) => i.tipo === fTipo)) return false;
      if (busca) {
        const alvo = `${g.contatoNome ?? ''} ${g.telefone ?? ''} ${g.itens.map((i) => i.texto ?? '').join(' ')}`.toLowerCase();
        if (!alvo.includes(busca)) return false;
      }
      return true;
    });
  }, [grupos, fPeriodo, statusAba, fCanal, fCriador, fTipo, fBusca]);

  function limpar() { setFPeriodo('todas'); setFCanal(''); setFCriador(''); setFTipo(''); setFBusca(''); }
  const filtroAtivo = fPeriodo !== 'todas' || !!fCanal || !!fCriador || !!fTipo || !!fBusca;

  // ── seleção (painel lateral) e composição ─────────────────────────────────
  const [selKey, setSelKey] = useState<string | null>(null);
  const sel = useMemo(() => filtrados.find((g) => g.key === selKey) ?? null, [filtrados, selKey]);
  const [comp, setComp] = useState<{ modo: 'criar' | 'editar' | 'reagendar'; item?: AgendamentoOrg; conversaId?: string; canalId?: string; temTelefone?: boolean } | null>(null);
  const [novoOpen, setNovoOpen] = useState(false);
  const [buscaContato, setBuscaContato] = useState('');
  const [novoErr, setNovoErr] = useState<string | null>(null);
  const contatosQ = useBuscaContatos(buscaContato);

  /** Escolhe o contato do "Novo agendamento" e resolve a conversa por onde a mensagem sairá. */
  async function escolherContato(c: { id: string; nome: string; tel: string }) {
    setNovoErr(null);
    try {
      const conv = await conversaAtivaDoContato(currentOrg.id, c.id);
      if (!conv) { setNovoErr(`${c.nome} ainda não tem conversa aberta. Abra uma conversa no WhatsApp antes de agendar — o envio sai por ela.`); return; }
      setNovoOpen(false); setBuscaContato('');
      setComp({ modo: 'criar', conversaId: conv.id, canalId: conv.canalId ?? undefined, temTelefone: !!c.tel });
    } catch (e) { setNovoErr((e as Error).message || 'Não foi possível abrir o agendamento.'); }
  }

  async function submeterComposicao(v: AgendarSubmit) {
    if (!comp) return;
    if (v.modo === 'sequencia') {
      if (!comp.conversaId) return;
      await criarSeqMut.mutateAsync({ conversaId: comp.conversaId, canalId: v.canalId, executarEm: v.executarISO, itens: v.itens ?? [] });
      toast('Agendamento criado.');
    } else if (v.modo === 'reagendar' && comp.item) {
      await reagendarMut.mutateAsync({ id: comp.item.id, conversaId: comp.item.conversaId, canalId: v.canalId, executarEm: v.executarISO });
      toast('Mensagem reagendada — voltou para a fila.');
    } else if (comp.item) {
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
  const previa = (g: Grupo) => (g.primeiro.texto?.trim()) || g.primeiro.nomeArquivo || tipoLbl(g.primeiro.tipo);

  if (!WA_REAL) {
    return <div className="agm2"><div className="agm2-vazio"><h3>Disponível com o backend configurado.</h3></div></div>;
  }

  const carregando = rowsQ.isLoading;
  const erro = rowsQ.isError;

  return (
    <div className={'agm2' + (sel ? ' com-painel' : '')}>
      {/* ─── barra superior: abas + ações ─────────────────────────────────── */}
      <div className="agm2-top">
        <nav className="agm2-abas" role="tablist">
          {ABAS.map((a) => (
            <button key={a.id} role="tab" aria-selected={aba === a.id}
              className={'agm2-aba' + (aba === a.id ? ' on' : '')}
              onClick={() => { setAba(a.id); setSelKey(null); }}>{a.label}</button>
          ))}
        </nav>
        <div className="agm2-top-acoes">
          <select className="agm2-sel" value={fPeriodo} onChange={(e) => setFPeriodo(e.target.value as PeriodoAg)} aria-label="Período">
            <option value="todas">Todo o período</option>
            <option value="hoje">Hoje</option>
            <option value="amanha">Amanhã</option>
            <option value="7d">Próximos 7 dias</option>
            <option value="30d">Próximos 30 dias</option>
          </select>
          <button className={'agm2-btn' + (filtrosAbertos || filtroAtivo ? ' on' : '')} onClick={() => setFiltrosAbertos((v) => !v)}>
            <IcFiltro />Filtros{filtroAtivo ? ' ·' : ''}
          </button>
          <button className="agm2-btn cta" onClick={() => { setNovoOpen(true); setNovoErr(null); setBuscaContato(''); }}>
            <IcPlus />Novo agendamento
          </button>
        </div>
      </div>

      {/* ─── indicadores ──────────────────────────────────────────────────── */}
      <div className="agm2-cards">
        {[
          { id: 'prog', ic: <IcSend />, n: programados, l: 'Programados', cls: 'c-prog' },
          { id: 'env', ic: <IcCheck />, n: cards.enviadas, l: 'Enviados', cls: 'c-env' },
          { id: 'fal', ic: <IcWarn />, n: cards.falhas, l: 'Falhas', cls: 'c-fal' },
          { id: 'blk', ic: <IcBlock />, n: cards.bloqueadas, l: 'Bloqueados', cls: 'c-blk' },
          { id: 'can', ic: <IcX />, n: cards.canceladas, l: 'Cancelados', cls: 'c-can' },
        ].map((c) => (
          <button key={c.id} className={'agm2-card ' + c.cls + (aba === c.id ? ' on' : '')}
            onClick={() => { setAba(aba === c.id ? 'visao' : c.id); setSelKey(null); }}>
            <span className="agm2-card-ic">{c.ic}</span>
            <span className="agm2-card-n">{c.n}</span>
            <span className="agm2-card-l">{c.l}</span>
          </button>
        ))}
      </div>

      {/* ─── filtros (recolhíveis) ────────────────────────────────────────── */}
      {(filtrosAbertos || filtroAtivo) && (
        <div className="agm2-filtros">
          <span className="agm2-busca"><IcSearch />
            <input placeholder="Buscar por cliente, telefone ou conteúdo…" value={fBusca} onChange={(e) => setFBusca(e.target.value)} />
          </span>
          <select className="agm2-sel" value={fCanal} onChange={(e) => setFCanal(e.target.value)}>
            <option value="">Todos os canais</option>
            {canais.map((c) => <option key={c.id} value={c.id}>{c.alias}</option>)}
          </select>
          <select className="agm2-sel" value={fCriador} onChange={(e) => setFCriador(e.target.value)}>
            <option value="">Todos os atendentes</option>
            {orgUsuarios.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
          </select>
          <select className="agm2-sel" value={fTipo} onChange={(e) => setFTipo(e.target.value)}>
            <option value="">Todos os tipos</option>
            <option value="texto">Texto</option>
            <option value="imagem">Imagem</option>
            <option value="audio">Áudio</option>
            <option value="video">Vídeo</option>
            <option value="documento">Documento</option>
          </select>
          {filtroAtivo && <button className="agm2-limpar" onClick={limpar}>Limpar filtros</button>}
        </div>
      )}

      {/* ─── lista + painel ───────────────────────────────────────────────── */}
      <div className="agm2-main">
        <div className="agm2-lista">
          <div className="agm2-lista-h">
            <span className="cl-quando">Data / hora</span>
            <span className="cl-cli">Cliente</span>
            <span className="cl-canal">Canal</span>
            <span className="cl-tipo">Tipo</span>
            <span className="cl-cont">Conteúdo</span>
            <span className="cl-at">Atendente</span>
            <span className="cl-st">Status</span>
            <span className="cl-tent">Tent.</span>
          </div>

          {carregando && [0, 1, 2, 3, 4].map((i) => (
            <div className="agm2-skel" key={i}><span className="sk sk-av" /><span className="sk sk-l1" /><span className="sk sk-l2" /></div>
          ))}

          {!carregando && erro && (
            <div className="agm2-vazio">
              <h3>Não foi possível carregar</h3>
              <p>Houve uma falha ao buscar os agendamentos.</p>
              <button className="agm2-btn" onClick={() => rowsQ.refetch()}>Tentar novamente</button>
            </div>
          )}

          {!carregando && !erro && filtrados.length === 0 && (
            grupos.length === 0 ? (
              <div className="agm2-vazio">
                <span className="agm2-vazio-ic"><IcSend /></span>
                <h3>Nenhuma mensagem programada</h3>
                <p>Agende uma mensagem para ela sair sozinha na hora certa.</p>
                <button className="agm2-btn cta" onClick={() => setNovoOpen(true)}><IcPlus />Novo agendamento</button>
              </div>
            ) : (
              <div className="agm2-vazio">
                <h3>Nada com esses filtros</h3>
                <p>Ajuste os filtros ou veja todos os agendamentos.</p>
                <button className="agm2-btn" onClick={() => { limpar(); setAba('visao'); }}>Limpar filtros</button>
              </div>
            )
          )}

          {!carregando && !erro && filtrados.map((g) => {
            const st = stMeta(g.statusGeral);
            const nome = g.contatoNome ?? g.telefone ?? 'Cliente';
            return (
              <button key={g.key} className={'agm2-row' + (selKey === g.key ? ' on' : '')} onClick={() => setSelKey(selKey === g.key ? null : g.key)}>
                <span className="cl-quando"><b>{fmtDia(g.primeiro.executarEm)}</b><i>{fmtHora(g.primeiro.executarEm)}</i></span>
                <span className="cl-cli">
                  <i className="agm2-av">{iniciais(nome)}</i>
                  <span className="agm2-cli-t"><b>{nome}</b><i>{g.telefone ?? '—'}</i></span>
                </span>
                <span className="cl-canal">{g.nomeCanal ? <em className="agm2-pill">{g.nomeCanal}</em> : '—'}</span>
                <span className="cl-tipo"><em className={'agm2-chip' + (g.ehSequencia ? ' seq' : '')}>{g.ehSequencia ? `Sequência · ${g.count}` : tipoLbl(g.primeiro.tipo)}</em></span>
                <span className="cl-cont" title={previa(g)}>{previa(g)}</span>
                <span className="cl-at">{nomePorId(g.criadoPor) ?? '—'}</span>
                <span className="cl-st"><em className={'agm2-st ' + st.cls}>{st.label}</em></span>
                <span className="cl-tent">{g.tentativas}</span>
              </button>
            );
          })}
        </div>

        {/* ─── painel lateral de detalhes ─────────────────────────────────── */}
        {sel && (() => {
          const st = stMeta(sel.statusGeral);
          const item = sel.itens[0];
          const enviadas = sel.itens.filter((i) => i.status === 'enviada').length;
          const falhas = sel.itens.filter((i) => i.status === 'falhou' || i.status === 'bloqueada').length;
          const taxa = sel.count > 0 ? Math.round((enviadas / sel.count) * 100) : 0;
          const podeCancelarSeq = sel.ehSequencia && sel.itens.some((i) => i.status === 'agendada');
          const podeEditar = !sel.ehSequencia && agendaEditavel(item.status);
          const podeReagendar = !sel.ehSequencia && agendaReagendavel(item.status);
          return (
            <aside className="agm2-painel" aria-label="Detalhes do agendamento">
              <div className="agm2-p-h">
                <strong>Detalhes do agendamento</strong>
                <button className="agm2-p-x" aria-label="Fechar" onClick={() => setSelKey(null)}><IcClose /></button>
              </div>

              <div className="agm2-p-corpo">
              <div className="agm2-p-cli">
                <i className="agm2-av g">{iniciais(sel.contatoNome ?? sel.telefone ?? 'Cliente')}</i>
                <div className="agm2-p-cli-t">
                  <b>{sel.contatoNome ?? sel.telefone ?? 'Cliente'}</b>
                  <i>{sel.telefone ?? '—'}</i>
                </div>
                <button className="agm2-btn sm" onClick={() => abrirConversa(sel.conversaId)}>Abrir conversa</button>
              </div>

              <dl className="agm2-p-dl">
                <div><dt>Canal</dt><dd>{sel.nomeCanal ?? '—'}</dd></div>
                <div><dt>Status</dt><dd><em className={'agm2-st ' + st.cls}>{st.label}</em></dd></div>
                <div><dt>Tipo</dt><dd>{sel.ehSequencia ? `Sequência · ${sel.count}` : tipoLbl(sel.primeiro.tipo)}</dd></div>
                <div><dt>Tentativas</dt><dd>{sel.tentativas}</dd></div>
                <div><dt>Criado por</dt><dd>{nomePorId(sel.criadoPor) ?? '—'}</dd></div>
                <div><dt>Criado em</dt><dd>{fmtSP(sel.criadoEm)}</dd></div>
                <div><dt>Agendado para</dt><dd>{fmtSP(sel.primeiro.executarEm)}</dd></div>
                {sel.primeiro.enviadaEm && <div><dt>Enviado em</dt><dd>{fmtSP(sel.primeiro.enviadaEm)}</dd></div>}
              </dl>

              {/* Desempenho: só faz sentido em SEQUÊNCIA (em mensagem única seria sempre 0% ou 100%). */}
              {sel.ehSequencia && (
                <>
                  <div className="agm2-p-lbl">Resumo de desempenho</div>
                  <div className="agm2-p-kpis">
                    <span className="agm2-kpi"><b>{sel.count}</b><i>Mensagens</i></span>
                    <span className="agm2-kpi ok"><b>{enviadas}</b><i>Enviadas</i></span>
                    <span className={'agm2-kpi' + (falhas > 0 ? ' bad' : '')}><b>{falhas}</b><i>Falhas</i></span>
                    <span className="agm2-kpi"><b>{taxa}%</b><i>Sucesso</i></span>
                  </div>
                </>
              )}

              <div className="agm2-p-lbl">{sel.ehSequencia ? `Mensagens (${sel.count})` : 'Mensagem'}</div>
              <ol className="agm2-p-msgs">
                {sel.itens.map((i, idx) => {
                  const ist = stMeta(i.status);
                  const ierro = i.motivoBloqueio || i.ultimoErro;
                  return (
                    <li key={i.id}>
                      <div className="agm2-p-msg-h">
                        <span>{sel.ehSequencia ? `${idx + 1}. ` : ''}{fmtSP(i.executarEm)}</span>
                        <em className={'agm2-st ' + ist.cls}>{ist.label}</em>
                      </div>
                      <div className="agm2-p-msg-t">{i.texto || i.nomeArquivo || '—'}</div>
                      {(i.enviadaEm || ierro) && (
                        <div className="agm2-p-msg-m">
                          {i.enviadaEm && <span className="ok">✓ Enviada em {fmtSP(i.enviadaEm)}</span>}
                          {ierro && <span className="bad">{ierro}</span>}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>
              </div>

              {/* rodapé só existe quando há ação — nada de barra vazia em agendamento já enviado */}
              {(podeEditar || podeReagendar || podeCancelarSeq) && (
                <div className="agm2-p-acoes">
                  {podeEditar && (
                    <>
                      <button className="agm2-btn sm" onClick={() => setComp({ modo: 'editar', item, temTelefone: !!item.telefone })}>Editar</button>
                      <button className="agm2-btn sm danger" disabled={cancelarMut.isPending} onClick={() => cancelarItem(item)}>Cancelar</button>
                    </>
                  )}
                  {podeReagendar && (
                    <button className="agm2-btn sm" onClick={() => setComp({ modo: 'reagendar', item, temTelefone: !!item.telefone })}>Reagendar</button>
                  )}
                  {podeCancelarSeq && (
                    <button className="agm2-btn sm danger" disabled={cancelarMut.isPending} onClick={() => cancelarSequencia(sel)}>Cancelar pendentes</button>
                  )}
                </div>
              )}
            </aside>
          );
        })()}
      </div>

      {/* ─── "Novo agendamento": escolher o cliente ───────────────────────── */}
      <Modal open={novoOpen} onClose={() => setNovoOpen(false)} width={480} title="Novo agendamento"
        footer={<button className="agm2-btn" onClick={() => setNovoOpen(false)}>Cancelar</button>}>
        <div className="agm2-novo">
          <p className="agm2-novo-h">Para qual cliente?</p>
          <span className="agm2-busca full"><IcSearch />
            <input autoFocus placeholder="Buscar por nome ou telefone…" value={buscaContato} onChange={(e) => { setBuscaContato(e.target.value); setNovoErr(null); }} />
          </span>
          {novoErr && <p className="agm2-novo-err">{novoErr}</p>}
          <ul className="agm2-novo-lista">
            {(contatosQ.data ?? []).slice(0, 8).map((c) => (
              <li key={c.id}>
                <button onClick={() => escolherContato(c)}>
                  <i className="agm2-av">{iniciais(c.nome)}</i>
                  <span><b>{c.nome}</b><i>{c.tel || 'Sem telefone'}</i></span>
                </button>
              </li>
            ))}
            {buscaContato.trim().length > 1 && (contatosQ.data ?? []).length === 0 && !contatosQ.isLoading && (
              <li className="agm2-novo-vazio">Nenhum cliente encontrado.</li>
            )}
          </ul>
        </div>
      </Modal>

      {/* Composição: criar / editar / reagendar */}
      <AgendarMensagemModal
        open={!!comp}
        modo={comp?.modo ?? 'editar'}
        canais={canais}
        temTelefone={comp?.temTelefone ?? true}
        initial={comp?.item
          ? { canalId: comp.item.canalId, texto: comp.item.texto ?? '', executarEm: comp.item.executarEm, tipo: comp.item.tipo, nomeArquivo: comp.item.nomeArquivo ?? undefined }
          : (comp?.canalId ? { canalId: comp.canalId } : null)}
        onClose={() => setComp(null)}
        onSubmit={submeterComposicao}
      />
    </div>
  );
}
