import { useEffect, useMemo, useRef, useState } from 'react';
import { useOrg } from '@/context/OrgContext';
import { useToast } from '@/hooks/useToast';
import { useEtiquetas, useOrgUsuarios } from '@/data/atendimento';
import { useContatos } from '@/data/contatos';
import { corDaEtiqueta } from '@/types/atendimento';
import { useKanban, type KColuna, type KLead } from '@/data/kanban';
import { Modal } from '@/components/Modal';
import { EmptyState } from '@/components/EmptyState';
import { initials, avatarColor } from '@/lib/avatar';
import './Kanban.css';

const PALETTE = ['#3b82f6', '#19C37D', '#f59e0b', '#8b5cf6', '#0891b2', '#e11d48', '#7c3aed', '#0e9d63', '#d97706', '#64748b'];
const fmtBRL = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
function haDe(iso?: string) { if (!iso) return ''; const ms = Date.now() - new Date(iso).getTime(); if (!Number.isFinite(ms) || ms < 0) return ''; const m = Math.floor(ms / 60000); if (m < 1) return 'agora'; if (m < 60) return `há ${m} min`; if (m < 1440) return `há ${Math.floor(m / 60)} h`; return `há ${Math.floor(m / 1440)} d`; }
function Av({ n, cls }: { n: string; cls?: string }) { return <span className={'av' + (cls ? ' ' + cls : '')} style={{ background: avatarColor(n) }}>{initials(n)}</span>; }

const IC = {
  search: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3-3" /></svg>,
  plus: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>,
  dots: <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="12" cy="19" r="1.7" /></svg>,
  user: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="3.4" /><path d="M5 20a7 7 0 0 1 14 0" /></svg>,
  clock: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>,
} as const;

export function Kanban() {
  const { toast } = useToast();
  const { currentOrg } = useOrg();
  const podeConfig = currentOrg.role === 'admin' || currentOrg.role === 'gestor';
  const k = useKanban();
  const { data: etiquetas = [] } = useEtiquetas();
  const { data: usuarios = [] } = useOrgUsuarios();
  const { data: contatos = [] } = useContatos();

  const [search, setSearch] = useState('');
  const [optim, setOptim] = useState<Record<string, string>>({}); // id -> colunaId (otimista)
  const [hover, setHover] = useState<string | null>(null);
  const dragId = useRef<string | null>(null);
  const [menu, setMenu] = useState<{ kind: 'card' | 'col'; id: string } | null>(null);

  // modal coluna
  const [colModal, setColModal] = useState<{ mode: 'novo' | 'editar'; id?: string } | null>(null);
  const [colForm, setColForm] = useState({ nome: '', cor: PALETTE[0] });
  const [colBusy, setColBusy] = useState(false);
  const [colErr, setColErr] = useState<string | null>(null);
  // exclusão de coluna
  const [delCol, setDelCol] = useState<KColuna | null>(null);
  const [delDest, setDelDest] = useState('');
  const [delBusy, setDelBusy] = useState(false);
  // modal lead
  const [leadModal, setLeadModal] = useState<{ mode: 'novo' | 'editar'; id?: string } | null>(null);
  const [lf, setLf] = useState({ colunaId: '', contatoId: '', nome: '', telefone: '', respId: '', valor: '', origem: '', etiquetas: [] as string[], observacoes: '' });
  const [leadBusy, setLeadBusy] = useState(false);
  const [leadErr, setLeadErr] = useState<string | null>(null);

  useEffect(() => {
    setOptim((m) => { const n: Record<string, string> = {}; for (const id in m) { const l = k.leads.find((x) => x.id === id); if (l && l.colunaId !== m[id]) n[id] = m[id]; } return n; });
  }, [k.leads]);
  useEffect(() => { function onDoc() { setMenu(null); } document.addEventListener('click', onDoc); return () => document.removeEventListener('click', onDoc); }, []);

  const term = search.trim().toLowerCase();
  const matchBusca = (l: KLead) => !term || (l.nome + ' ' + l.telefone + ' ' + l.respNome + ' ' + l.etiquetas.join(' ')).toLowerCase().includes(term) || (term.replace(/\D/g, '').length >= 3 && (l.telefone || '').replace(/\D/g, '').includes(term.replace(/\D/g, '')));
  const colunaDoLead = (l: KLead) => optim[l.id] ?? l.colunaId;
  const leadsVisiveis = useMemo(() => k.leads.filter(matchBusca), [k.leads, term]); // eslint-disable-line
  const porColuna = (colId: string) => leadsVisiveis.filter((l) => colunaDoLead(l) === colId).sort((a, b) => a.ordem - b.ordem);
  const semResultado = term !== '' && leadsVisiveis.length === 0 && k.leads.length > 0;

  async function mover(id: string, colId: string) {
    const lead = k.leads.find((l) => l.id === id); if (!lead || lead.colunaId === colId) return;
    setOptim((m) => ({ ...m, [id]: colId }));
    try { await k.moverLead(id, colId); toast('Lead movido'); }
    catch (e) { setOptim((m) => { const n = { ...m }; delete n[id]; return n; }); toast('Falha ao mover: ' + (e as Error).message, 'warn'); }
  }
  function onDrop(colId: string) { const id = dragId.current; setHover(null); dragId.current = null; if (id) mover(id, colId); }

  // ---- colunas ----
  function abrirNovaColuna() { setColForm({ nome: '', cor: PALETTE[0] }); setColErr(null); setColModal({ mode: 'novo' }); }
  function abrirEditarColuna(c: KColuna) { setColForm({ nome: c.nome, cor: c.cor }); setColErr(null); setColModal({ mode: 'editar', id: c.id }); setMenu(null); }
  async function salvarColuna() {
    if (colBusy) return; const nome = colForm.nome.trim();
    if (!nome) { setColErr('Informe o nome da coluna.'); return; }
    setColBusy(true); setColErr(null);
    try { if (colModal!.mode === 'novo') await k.criarColuna({ nome, cor: colForm.cor }); else await k.editarColuna({ id: colModal!.id!, nome, cor: colForm.cor }); setColModal(null); toast(colModal!.mode === 'novo' ? 'Coluna criada' : 'Coluna atualizada'); }
    catch (e) { setColErr('Não foi possível salvar: ' + (e as Error).message); }
    finally { setColBusy(false); }
  }
  function pedirExcluirColuna(c: KColuna) {
    setMenu(null);
    if (k.colunas.length <= 1) { toast('O funil precisa de ao menos uma coluna ativa.', 'warn'); return; }
    setDelDest(k.colunas.find((x) => x.id !== c.id)?.id || ''); setDelCol(c);
  }
  async function confirmarExcluirColuna() {
    if (!delCol || delBusy) return;
    const temLeads = k.leads.some((l) => colunaDoLead(l) === delCol.id);
    if (temLeads && !delDest) { toast('Escolha a coluna de destino dos leads.', 'warn'); return; }
    setDelBusy(true);
    try { await k.excluirColuna(delCol.id, temLeads ? delDest : null); toast('Coluna excluída'); setDelCol(null); }
    catch (e) { toast('Falha ao excluir: ' + (e as Error).message, 'warn'); }
    finally { setDelBusy(false); }
  }

  // ---- leads ----
  function abrirNovoLead(colunaId?: string) { setLf({ colunaId: colunaId || k.colunas[0]?.id || '', contatoId: '', nome: '', telefone: '', respId: '', valor: '', origem: 'Manual', etiquetas: [], observacoes: '' }); setLeadErr(null); setLeadModal({ mode: 'novo' }); }
  function abrirEditarLead(l: KLead) { setLf({ colunaId: l.colunaId || '', contatoId: l.contatoId || '', nome: l.nome, telefone: l.telefone, respId: l.respId || '', valor: l.valor != null ? String(l.valor) : '', origem: l.origem, etiquetas: [...l.etiquetas], observacoes: l.observacoes }); setLeadErr(null); setLeadModal({ mode: 'editar', id: l.id }); setMenu(null); }
  function onPickContato(id: string) { const c = contatos.find((x) => x.id === id); setLf((f) => ({ ...f, contatoId: id, nome: id ? (c?.nome || f.nome) : f.nome, telefone: id ? (c?.tel || f.telefone) : f.telefone })); }
  async function salvarLead() {
    if (leadBusy) return; const nome = lf.nome.trim();
    if (!nome) { setLeadErr('Informe o nome do lead.'); return; }
    if (!lf.colunaId) { setLeadErr('Selecione a coluna.'); return; }
    const valorNum = lf.valor.trim() ? Number(lf.valor.replace(/\./g, '').replace(',', '.')) : null;
    if (lf.valor.trim() && (valorNum == null || Number.isNaN(valorNum))) { setLeadErr('Valor inválido.'); return; }
    setLeadBusy(true); setLeadErr(null);
    try {
      if (leadModal!.mode === 'novo') await k.criarLead({ colunaId: lf.colunaId, contatoId: lf.contatoId || null, nome, telefone: lf.telefone, responsavelId: lf.respId || null, valor: valorNum, origem: lf.origem, etiquetas: lf.etiquetas, observacoes: lf.observacoes });
      else await k.editarLead({ id: leadModal!.id!, nome, telefone: lf.telefone || null, responsavelId: lf.respId || null, valor: valorNum, origem: lf.origem || null, etiquetas: lf.etiquetas, observacoes: lf.observacoes || null, colunaId: lf.colunaId });
      setLeadModal(null); toast(leadModal!.mode === 'novo' ? 'Lead criado' : 'Lead atualizado');
    } catch (e) { setLeadErr('Não foi possível salvar o lead: ' + (e as Error).message); }
    finally { setLeadBusy(false); }
  }
  async function arquivar(l: KLead) { setMenu(null); try { await k.arquivarLead(l.id); toast('Lead arquivado'); } catch (e) { toast('Falha ao arquivar: ' + (e as Error).message, 'warn'); } }
  function toggleEtq(t: string) { setLf((f) => ({ ...f, etiquetas: f.etiquetas.includes(t) ? f.etiquetas.filter((x) => x !== t) : [...f.etiquetas, t] })); }

  // ---- estados ----
  if (k.loading) return <div className="kanban-page"><div className="kb-info">Carregando funil…</div></div>;
  if (k.isError) return <div className="kanban-page"><div className="kb-info error">Erro ao carregar o funil: {k.error?.message}</div></div>;
  if (k.colunas.length === 0) return (
    <div className="kanban-page"><EmptyState
      icon={<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="5" height="16" rx="1.3" /><rect x="10" y="4" width="5" height="11" rx="1.3" /><rect x="17" y="4" width="4" height="14" rx="1.3" /></svg>}
      title="Seu funil está vazio"
      text="Crie a primeira coluna para começar a organizar seus leads."
      action={podeConfig ? <button className="btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={abrirNovaColuna}>{IC.plus}Criar primeira coluna</button> : <span style={{ color: 'var(--muted)' }}>Peça a um administrador para configurar o funil.</span>}
    /></div>
  );

  return (
    <div className="kanban-page">
      <main className="col-main">
        <div className="toolbar">
          <div className="tb-search">{IC.search}<input type="text" aria-label="Buscar leads" placeholder="Buscar por nome, telefone, responsável ou etiqueta..." value={search} onChange={(e) => setSearch(e.target.value)} /></div>
          <span className="tb-spacer" />
          {podeConfig && <button className="btn-ghost" onClick={abrirNovaColuna}>{IC.plus}Nova coluna</button>}
          <button className="btn-primary" onClick={() => abrirNovoLead()}>{IC.plus}Novo lead</button>
        </div>

        {semResultado && <div className="kb-info">Nenhum lead encontrado para “{search}”.</div>}

        <div className="board-scroll">
          <div className="board">
            {k.colunas.map((col) => {
              const cards = porColuna(col.id);
              const totalCount = k.leads.filter((l) => colunaDoLead(l) === col.id).length;
              const soma = k.leads.filter((l) => colunaDoLead(l) === col.id).reduce((s, l) => s + (l.valor || 0), 0);
              return (
                <div className="column" key={col.id}>
                  <div className="col-head">
                    <span className="dot" style={{ background: col.cor }} />
                    <div className="col-htxt"><span className="col-name-st">{col.nome}</span><span className="col-metric">{totalCount} {totalCount === 1 ? 'lead' : 'leads'}{soma > 0 ? ' · ' + fmtBRL(soma) : ''}</span></div>
                    {podeConfig && (
                      <div className="col-menu-wrap">
                        <button className="col-mbtn" aria-label={'Ações da coluna ' + col.nome} onClick={(e) => { e.stopPropagation(); setMenu(menu?.kind === 'col' && menu.id === col.id ? null : { kind: 'col', id: col.id }); }}>{IC.dots}</button>
                        {menu?.kind === 'col' && menu.id === col.id && (
                          <div className="kb-menu" onClick={(e) => e.stopPropagation()} role="menu">
                            <button className="pop-item" role="menuitem" onClick={() => abrirEditarColuna(col)}>Renomear / cor</button>
                            <button className="pop-item danger" role="menuitem" onClick={() => pedirExcluirColuna(col)}>Excluir</button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div className={'col-body' + (hover === col.id ? ' drop-hover' : '')}
                    onDragOver={(e) => { e.preventDefault(); setHover(col.id); }} onDragLeave={() => setHover((h) => h === col.id ? null : h)} onDrop={() => onDrop(col.id)}>
                    {cards.map((l) => {
                      const moving = optim[l.id] !== undefined;
                      return (
                        <div key={l.id} className={'lead-card' + (moving ? ' moving' : '')} draggable onClick={() => abrirEditarLead(l)}
                          onDragStart={(e) => { dragId.current = l.id; try { e.dataTransfer.effectAllowed = 'move'; } catch { /* */ } }} onDragEnd={() => { dragId.current = null; setHover(null); }}>
                          <div className="lc-top">
                            <Av n={l.nome} />
                            <div className="lc-id"><div className="lc-name" title={l.nome}>{l.nome}</div>{l.origem && <span className="src-badge">{l.origem}</span>}</div>
                            {l.valor != null && <span className="lc-valor">{fmtBRL(l.valor)}</span>}
                            <div className="col-menu-wrap">
                              <button className="lc-mbtn" aria-label={'Ações do lead ' + l.nome} onClick={(e) => { e.stopPropagation(); setMenu(menu?.kind === 'card' && menu.id === l.id ? null : { kind: 'card', id: l.id }); }}>{IC.dots}</button>
                              {menu?.kind === 'card' && menu.id === l.id && (
                                <div className="kb-menu" onClick={(e) => e.stopPropagation()} role="menu">
                                  <button className="pop-item" role="menuitem" onClick={() => abrirEditarLead(l)}>Editar</button>
                                  <div className="kb-menu-sep">Mover para</div>
                                  {k.colunas.filter((c) => c.id !== colunaDoLead(l)).map((c) => <button key={c.id} className="pop-item" role="menuitem" onClick={() => { setMenu(null); mover(l.id, c.id); }}><span className="dot" style={{ background: c.cor }} />{c.nome}</button>)}
                                  <button className="pop-item danger" role="menuitem" onClick={() => arquivar(l)}>Arquivar</button>
                                </div>
                              )}
                            </div>
                          </div>
                          {l.telefone && <div className="lc-line">{IC.user}{l.respNome || 'Sem responsável'}</div>}
                          {l.etiquetas.length > 0 && <div className="lc-tags">{l.etiquetas.slice(0, 3).map((t) => { const cor = corDaEtiqueta(t, etiquetas); return <span key={t} className="lc-tag" title={t} style={{ background: cor + '22', color: cor, borderColor: cor + '55' }}>{t}</span>; })}{l.etiquetas.length > 3 && <span className="lc-tag more">+{l.etiquetas.length - 3}</span>}</div>}
                          <div className="lc-foot">{IC.clock}{haDe(l.atualizadoEm || l.criadoEm)}</div>
                        </div>
                      );
                    })}
                    {cards.length === 0 && <div className="col-empty">Sem leads</div>}
                    <button className="add-lead" onClick={(e) => { e.stopPropagation(); abrirNovoLead(col.id); }}>{IC.plus}Adicionar lead</button>
                  </div>
                </div>
              );
            })}
            {podeConfig && (
              <div className="column ghost-col"><button className="add-stage" onClick={abrirNovaColuna}>{IC.plus}Nova coluna</button></div>
            )}
          </div>
        </div>
      </main>

      {/* modal coluna */}
      <Modal open={!!colModal} onClose={() => { if (!colBusy) setColModal(null); }} closeOnBackdrop={!colBusy} width={420}
        title={colModal?.mode === 'novo' ? 'Nova coluna' : 'Editar coluna'}
        footer={<><button className="atv-btn" disabled={colBusy} onClick={() => setColModal(null)}>Cancelar</button><button className="atv-btn primary" disabled={colBusy} onClick={salvarColuna}>{colBusy ? 'Salvando…' : (colModal?.mode === 'novo' ? 'Criar coluna' : 'Salvar')}</button></>}>
        <div className="kb-form">
          <div className="kb-field"><label className="kb-label">Nome da coluna</label><input className="atv-input" placeholder="Ex.: Proposta enviada" value={colForm.nome} onChange={(e) => setColForm({ ...colForm, nome: e.target.value })} disabled={colBusy} /></div>
          <div className="kb-field"><label className="kb-label">Cor</label><div className="kb-swatches">{PALETTE.map((c) => <button key={c} type="button" aria-label={'Cor ' + c} className={'kb-swatch' + (c === colForm.cor ? ' sel' : '')} style={{ background: c }} onClick={() => setColForm({ ...colForm, cor: c })} disabled={colBusy} />)}</div></div>
          {colErr && <div className="kb-err">{colErr}</div>}
        </div>
      </Modal>

      {/* modal excluir coluna */}
      <Modal open={!!delCol} onClose={() => { if (!delBusy) setDelCol(null); }} closeOnBackdrop={!delBusy} width={440}
        title="Excluir coluna"
        footer={<><button className="atv-btn" disabled={delBusy} onClick={() => setDelCol(null)}>Cancelar</button><button className="atv-btn danger" disabled={delBusy} onClick={confirmarExcluirColuna}>{delBusy ? 'Excluindo…' : 'Excluir coluna'}</button></>}>
        <div className="kb-form">
          {delCol && k.leads.some((l) => colunaDoLead(l) === delCol.id) ? (
            <>
              <div className="atv-modal-msg">Esta coluna possui leads. Escolha para qual coluna eles devem ser movidos antes de excluir.</div>
              <div className="kb-field"><label className="kb-label">Mover leads para</label><select className="atv-input" value={delDest} onChange={(e) => setDelDest(e.target.value)} disabled={delBusy}>{k.colunas.filter((c) => c.id !== delCol.id).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></div>
            </>
          ) : <div className="atv-modal-msg">Excluir a coluna <strong>{delCol?.nome}</strong>?</div>}
        </div>
      </Modal>

      {/* modal lead */}
      <Modal open={!!leadModal} onClose={() => { if (!leadBusy) setLeadModal(null); }} closeOnBackdrop={!leadBusy} width={560}
        title={<div><div>{leadModal?.mode === 'novo' ? 'Novo lead' : 'Editar lead'}</div><div className="kb-modal-sub">{leadModal?.mode === 'novo' ? 'Adicione um lead ao funil.' : 'Atualize os dados do lead.'}</div></div>}
        footer={<><button className="atv-btn" disabled={leadBusy} onClick={() => setLeadModal(null)}>Cancelar</button><button className="atv-btn primary" disabled={leadBusy} onClick={salvarLead}>{leadBusy ? 'Salvando…' : (leadModal?.mode === 'novo' ? 'Criar lead' : 'Salvar')}</button></>}>
        <div className="kb-form">
          {leadModal?.mode === 'novo' && (
            <div className="kb-field"><label className="kb-label">Contato existente (opcional)</label><select className="atv-input" value={lf.contatoId} onChange={(e) => onPickContato(e.target.value)} disabled={leadBusy}><option value="">Novo / sem vínculo</option>{contatos.map((c) => <option key={c.id} value={c.id}>{c.nome}{c.tel ? ' · ' + c.tel : ''}</option>)}</select></div>
          )}
          <div className="kb-field"><label className="kb-label">Nome *</label><input className="atv-input" placeholder="Nome do lead/contato" value={lf.nome} onChange={(e) => setLf({ ...lf, nome: e.target.value })} disabled={leadBusy} /></div>
          <div className="kb-row">
            <div className="kb-field"><label className="kb-label">Telefone</label><input className="atv-input" inputMode="tel" placeholder="(11) 99999-9999" value={lf.telefone} onChange={(e) => setLf({ ...lf, telefone: e.target.value })} disabled={leadBusy} /></div>
            <div className="kb-field"><label className="kb-label">Valor estimado (R$)</label><input className="atv-input" inputMode="decimal" placeholder="0,00" value={lf.valor} onChange={(e) => setLf({ ...lf, valor: e.target.value })} disabled={leadBusy} /></div>
          </div>
          <div className="kb-row">
            <div className="kb-field"><label className="kb-label">Coluna</label><select className="atv-input" value={lf.colunaId} onChange={(e) => setLf({ ...lf, colunaId: e.target.value })} disabled={leadBusy}>{k.colunas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></div>
            <div className="kb-field"><label className="kb-label">Responsável</label><select className="atv-input" value={lf.respId} onChange={(e) => setLf({ ...lf, respId: e.target.value })} disabled={leadBusy}><option value="">Não atribuído</option>{usuarios.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}</select></div>
          </div>
          <div className="kb-field"><label className="kb-label">Origem</label><input className="atv-input" placeholder="Ex.: Manual, Indicação…" value={lf.origem} onChange={(e) => setLf({ ...lf, origem: e.target.value })} disabled={leadBusy} /></div>
          <div className="kb-field"><label className="kb-label">Etiquetas</label><div className="kb-tags">{etiquetas.length === 0 ? <span className="kb-empty">Nenhuma etiqueta</span> : etiquetas.map((e) => { const on = lf.etiquetas.includes(e.nome); return <button key={e.id} type="button" className={'kb-tag' + (on ? ' on' : '')} style={on ? { background: e.cor + '22', color: e.cor, borderColor: e.cor + '66' } : undefined} onClick={() => toggleEtq(e.nome)} disabled={leadBusy}>{e.nome}</button>; })}</div></div>
          <div className="kb-field"><label className="kb-label">Observações</label><textarea className="atv-input kb-textarea" rows={2} placeholder="Observações internas do lead." value={lf.observacoes} onChange={(e) => setLf({ ...lf, observacoes: e.target.value })} disabled={leadBusy} /></div>
          {leadErr && <div className="kb-err">{leadErr}</div>}
        </div>
      </Modal>
    </div>
  );
}
