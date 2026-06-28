import { useEffect, useMemo, useRef, useState } from 'react';
import { useOrg } from '@/context/OrgContext';
import { useToast } from '@/hooks/useToast';
import { Modal } from '@/components/Modal';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useBuscaContatos, type ContatoRow } from '@/data/contatos';
import { useOrgUsuarios } from '@/data/atendimento';
import { parseMoedaBRL, formataMoedaBRL } from '@/lib/fichaJudicialNormalizers';
import {
  useCobrancas, useCobranca, useCobrancasMetricas, useCriarCobranca, useRegistrarBaixa, useAlterarStatusParcela, useCancelarCobranca,
  statusCobrancaLabel, statusParcelaLabel, type CobrancaParcela,
} from '@/data/cobrancas';
import '@/pages/Cobrancas.css';

const fmtBRL = (v: number) => formataMoedaBRL(v);
const dataBR = (iso?: string | null) => { const m = (iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : '—'; };
const hojeISO = () => new Date().toISOString().slice(0, 10);
const initials = (n: string) => { const p = (n || '').trim().split(/\s+/); return ((p[0]?.[0] || '') + (p[1]?.[0] || '')).toUpperCase() || '?'; };
const PAL = ['#5b6ee1', '#c2693a', '#7a5bb0', '#2f8f9d', '#b0566f', '#4a7a4a', '#9d7a2f', '#3d7ab0'];
const avColor = (n: string) => { let h = 0; for (let i = 0; i < (n || '').length; i++) h = (h * 31 + n.charCodeAt(i)) >>> 0; return PAL[h % PAL.length]; };
const Av = ({ n }: { n: string }) => <span className="av sm" style={{ background: avColor(n) }}>{initials(n)}</span>;

const IcSearch = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3-3" /></svg>;
const IcPlus = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>;

function statusClasse(raw: string) { return raw === 'finalizado' ? 'neutral' : raw === 'cancelado' ? 'err' : 'ok'; }
function CobStBadge({ s }: { s: string }) { return <span className={'st ' + statusClasse(s)}>{s !== 'finalizado' && s !== 'cancelado' && <span className="dot" />}{statusCobrancaLabel(s)}</span>; }
function ParcStBadge({ p }: { p: CobrancaParcela }) {
  const cls = p.status === 'paga' ? 'ok' : p.status === 'cancelada' ? 'neutral' : (p.atrasada || p.status === 'nao_paga') ? 'err' : 'warn';
  const txt = p.status === 'prevista' && p.atrasada ? 'Atrasada' : statusParcelaLabel[p.status];
  return <span className={'st ' + cls}>{txt}</span>;
}

export function CobrancasApp() {
  const { currentOrg } = useOrg();
  const gestor = currentOrg.role === 'admin' || currentOrg.role === 'gestor';
  const cobQ = useCobrancas();
  const metQ = useCobrancasMetricas();
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<'todas' | 'ativa' | 'concluida' | 'cancelada'>('todas');
  const [novo, setNovo] = useState(false);
  const [detId, setDetId] = useState<string | null>(null);

  const cobrancas = cobQ.data ?? [];
  const termo = busca.trim().toLowerCase();
  const lista = useMemo(() => cobrancas.filter((c) => {
    if (filtro === 'ativa' && (c.status === 'finalizado' || c.status === 'cancelado')) return false;
    if (filtro === 'concluida' && c.status !== 'finalizado') return false;
    if (filtro === 'cancelada' && c.status !== 'cancelado') return false;
    if (!termo) return true;
    return (c.contatoNome + ' ' + c.contatoTelefone + ' ' + c.contatoCpf + ' ' + c.responsavelNome).toLowerCase().includes(termo);
  }), [cobrancas, filtro, termo]);

  const m = metQ.data?.m;

  return (
    <div className="cobrancas-page">
      <div className="content">
        <div className="stats">
          <Stat label="Previsto no mês" valor={m ? fmtBRL(m.previstoMes) : '—'} tone="green" />
          <Stat label="Recebido no mês" valor={m ? fmtBRL(m.recebidoMes) : '—'} tone="green" />
          <Stat label="Em atraso" valor={m ? fmtBRL(m.emAtraso) : '—'} tone="amber" />
          <Stat label="A receber" valor={m ? fmtBRL(m.aReceber) : '—'} tone="green" />
        </div>

        <section className="panel table-card">
          <div className="tc-head">
            <h2>Cobranças recorrentes</h2>
            <div className="right">
              <select className="cob-filtro" value={filtro} onChange={(e) => setFiltro(e.target.value as typeof filtro)} aria-label="Filtrar por status">
                <option value="todas">Todas</option><option value="ativa">Ativas</option><option value="concluida">Concluídas</option><option value="cancelada">Canceladas</option>
              </select>
              {gestor && <button className="btn-save cob-nova" onClick={() => setNovo(true)}><IcPlus />Nova cobrança</button>}
            </div>
          </div>
          <div className="tc-search"><IcSearch /><input type="text" placeholder="Buscar por cliente, telefone, CPF ou responsável..." value={busca} onChange={(e) => setBusca(e.target.value)} /></div>

          {cobQ.isLoading ? (
            <div className="cob-info">Carregando cobranças…</div>
          ) : cobQ.isError ? (
            <div className="cob-info err">Erro ao carregar: {(cobQ.error as Error)?.message}</div>
          ) : lista.length === 0 ? (
            <div className="cob-empty">
              <div className="cob-empty-t">{cobrancas.length === 0 ? 'Nenhuma cobrança cadastrada' : 'Nenhuma cobrança encontrada'}</div>
              <div className="cob-empty-d">{cobrancas.length === 0 ? 'Cadastre uma cobrança recorrente para um cliente do escritório.' : 'Ajuste a busca ou os filtros.'}</div>
              {gestor && cobrancas.length === 0 && <button className="btn-save" onClick={() => setNovo(true)}><IcPlus />Criar primeira cobrança</button>}
            </div>
          ) : (
            <div className="table-scroll">
              <table className="contracts-table" aria-label="Cobranças">
                <thead><tr><th>Cliente</th><th>Valor mensal</th><th>Ciclos</th><th>Próxima</th><th>Status</th><th>Responsável</th><th aria-label="Ações"></th></tr></thead>
                <tbody>
                  {lista.map((c) => (
                    <tr key={c.id} className="cob-row" onClick={() => setDetId(c.id)}>
                      <td><div className="client-cell"><Av n={c.contatoNome} /><div className="cli-txt"><span className="nm">{c.contatoNome}</span><span className="co">{c.contatoTelefone || '—'}</span></div></div></td>
                      <td><div className="cell-centered val">{fmtBRL(c.valorMensal)}</div></td>
                      <td><div className="cell-centered">{c.ciclosPagos} de {c.ciclosTotais} pagas</div></td>
                      <td><div className="cell-centered">{dataBR(c.proximaCobranca)}</div></td>
                      <td><div className="cell-centered"><CobStBadge s={c.status} /></div></td>
                      <td><div className="responsible-cell">{c.responsavelNome ? <><Av n={c.responsavelNome} /><span className="rname">{c.responsavelNome}</span></> : <span className="rname" style={{ color: 'var(--muted)' }}>—</span>}</div></td>
                      <td><div className="cell-centered"><button type="button" className="row-menu" aria-label="Ver detalhes" onClick={(e) => { e.stopPropagation(); setDetId(c.id); }}>›</button></div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <footer className="tc-foot"><span className="ft">{lista.length} cobrança{lista.length === 1 ? '' : 's'}</span></footer>
        </section>

        {metQ.data && metQ.data.previsao.some((p) => p.previsto > 0) && (
          <section className="panel cob-prev">
            <div className="tc-head"><h2>Previsão de faturamento (6 meses)</h2></div>
            <div className="cob-prev-grid">
              {metQ.data.previsao.map((p) => (
                <div className="cob-prev-card" key={p.mes}>
                  <div className="cob-prev-mes">{p.mes.split('-').reverse().join('/')}</div>
                  <div className="cob-prev-val">{fmtBRL(p.previsto)}</div>
                  <div className="cob-prev-sub">Recebido {fmtBRL(p.recebido)}{p.atraso > 0 ? ` · Atraso ${fmtBRL(p.atraso)}` : ''}</div>
                  <div className="cob-prev-qtd">{p.qtd} parcela{p.qtd === 1 ? '' : 's'}</div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      {novo && <NovaCobranca onClose={() => setNovo(false)} />}
      {detId && <DetalheCobranca id={detId} gestor={gestor} onClose={() => setDetId(null)} />}
    </div>
  );
}

function Stat({ label, valor, tone }: { label: string; valor: string; tone: 'green' | 'amber' }) {
  return (
    <div className="stat"><span className={'stat-ic ' + tone}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v10M14.6 9.3c-.7-.9-3.7-1.4-3.7.6 0 1.9 3.7 1 3.7 2.9 0 2-3 1.5-3.7.6" /></svg></span>
      <div className="stat-body"><div className="stat-label">{label}</div><div className="stat-value">{valor}</div></div></div>
  );
}

// ---- Nova cobrança ----
function NovaCobranca({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const { data: usuarios = [] } = useOrgUsuarios();
  const criar = useCriarCobranca();
  const [contato, setContato] = useState<ContatoRow | null>(null);
  const [respId, setRespId] = useState('');
  const [valor, setValor] = useState('');
  const [data, setData] = useState(hojeISO());
  const [ciclos, setCiclos] = useState('6');
  const [servico, setServico] = useState('');
  const [obs, setObs] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const v = parseMoedaBRL(valor);
  const nCiclos = Math.trunc(Number(ciclos) || 0);
  const total = v != null && nCiclos > 0 ? v * nCiclos : null;
  const ultima = useMemo(() => { if (!data || nCiclos < 1) return null; const d = new Date(data + 'T00:00:00'); const dia = d.getDate(); const alvo = new Date(d.getFullYear(), d.getMonth() + (nCiclos - 1) + 1, 0); const last = Math.min(dia, alvo.getDate()); return new Date(alvo.getFullYear(), alvo.getMonth(), last).toISOString().slice(0, 10); }, [data, nCiclos]);

  async function salvar() {
    if (busy) return;
    if (!contato) { setErro('Selecione o cliente.'); return; }
    if (v == null || v <= 0) { setErro('Informe um valor mensal válido.'); return; }
    if (nCiclos < 1 || nCiclos > 60) { setErro('Quantidade de parcelas deve ser entre 1 e 60.'); return; }
    if (!data) { setErro('Informe a data da primeira cobrança.'); return; }
    setBusy(true); setErro(null);
    try {
      await criar.mutateAsync({ contatoId: contato.id, valor: v, dataPrimeira: data, ciclos: nCiclos, responsavelId: respId || null, servico: servico || null, observacoes: obs || null });
      toast('Cobrança criada'); onClose();
    } catch (e) { setErro(traduz((e as Error).message)); }
    finally { setBusy(false); }
  }

  return (
    <Modal open onClose={() => { if (!busy) onClose(); }} closeOnBackdrop={!busy} width={560}
      title={<div><div>Nova cobrança</div><div className="cob-modal-sub">Cobrança recorrente para um cliente do escritório.</div></div>}
      footer={<><button className="atv-btn" disabled={busy} onClick={onClose}>Cancelar</button><button className="atv-btn primary" disabled={busy} onClick={salvar}>{busy ? 'Criando…' : 'Criar cobrança'}</button></>}>
      <div className="cob-form">
        <div className="cob-field"><label className="cob-label">Cliente *</label>
          {contato ? (
            <div className="cob-selcli"><div><div className="cob-selcli-nm">{contato.nome || 'Sem nome'}</div><div className="cob-selcli-meta">{contato.tel || 'Sem telefone'}{contato.email ? ' · ' + contato.email : ''}</div></div><button type="button" className="cob-link" onClick={() => setContato(null)}>Trocar</button></div>
          ) : <ContatoPicker onSelect={setContato} />}
        </div>
        <div className="cob-2col">
          <div className="cob-field"><label className="cob-label">Valor mensal *</label><input className="ctrl" inputMode="decimal" placeholder="R$ 0,00" value={valor} onChange={(e) => setValor(e.target.value)} disabled={busy} /></div>
          <div className="cob-field"><label className="cob-label">Qtd. de parcelas *</label><input className="ctrl" inputMode="numeric" value={ciclos} onChange={(e) => setCiclos(e.target.value)} disabled={busy} /></div>
        </div>
        <div className="cob-2col">
          <div className="cob-field"><label className="cob-label">Primeira cobrança *</label><input className="ctrl" type="date" value={data} onChange={(e) => setData(e.target.value)} disabled={busy} /></div>
          <div className="cob-field"><label className="cob-label">Responsável</label><select className="ctrl" value={respId} onChange={(e) => setRespId(e.target.value)} disabled={busy}><option value="">Não atribuído</option>{usuarios.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}</select></div>
        </div>
        <div className="cob-field"><label className="cob-label">Descrição do serviço</label><input className="ctrl" placeholder="Ex.: Honorários, acordo…" value={servico} onChange={(e) => setServico(e.target.value)} disabled={busy} /></div>
        <div className="cob-field"><label className="cob-label">Observações</label><textarea className="ctrl cob-ta" rows={2} value={obs} onChange={(e) => setObs(e.target.value)} disabled={busy} /></div>
        <div className="cob-resumo">
          <div><span>Valor da parcela</span><strong>{v != null && v > 0 ? fmtBRL(v) : '—'}</strong></div>
          <div><span>Parcelas</span><strong>{nCiclos > 0 ? nCiclos : '—'}</strong></div>
          <div><span>Total previsto</span><strong>{total != null ? fmtBRL(total) : '—'}</strong></div>
          <div><span>Primeira</span><strong>{dataBR(data)}</strong></div>
          <div><span>Última (estimada)</span><strong>{dataBR(ultima)}</strong></div>
        </div>
        {erro && <div className="cob-erro">{erro}</div>}
      </div>
    </Modal>
  );
}

function ContatoPicker({ onSelect }: { onSelect: (c: ContatoRow) => void }) {
  const [term, setTerm] = useState('');
  const [deb, setDeb] = useState('');
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => { const t = setTimeout(() => setDeb(term), 300); return () => clearTimeout(t); }, [term]);
  useEffect(() => { function od(e: MouseEvent) { if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false); } document.addEventListener('mousedown', od); return () => document.removeEventListener('mousedown', od); }, []);
  const q = useBuscaContatos(deb);
  const res = q.data ?? [];
  const mostrar = open && deb.trim().length >= 2;
  return (
    <div className="cob-combo" ref={wrap}>
      <input className="ctrl" placeholder="Digite nome, telefone ou e-mail" value={term} onChange={(e) => { setTerm(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} />
      {mostrar && (
        <div className="cob-combo-pop">
          {q.isLoading ? <div className="cob-combo-info">Buscando…</div>
            : res.length === 0 ? <div className="cob-combo-info">Nenhum contato encontrado.</div>
            : res.map((c) => (
              <button key={c.id} type="button" className="cob-combo-item" onMouseDown={(e) => { e.preventDefault(); onSelect(c); }}>
                <Av n={c.nome || c.tel || '?'} /><div><div className="cob-ci-nm">{c.nome || 'Sem nome'}</div><div className="cob-ci-meta">{c.tel || 'Sem telefone'}{c.email ? ' · ' + c.email : ''}</div></div>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

// ---- Detalhe ----
function DetalheCobranca({ id, gestor, onClose }: { id: string; gestor: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const det = useCobranca(id);
  const baixa = useRegistrarBaixa();
  const alterar = useAlterarStatusParcela();
  const cancelar = useCancelarCobranca();
  const [baixaParc, setBaixaParc] = useState<CobrancaParcela | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const c = det.data;

  async function agir(p: CobrancaParcela, novo: 'nao_paga' | 'prevista') {
    try { await alterar.mutateAsync({ parcelaId: p.id, cobrancaId: id, novo }); toast('Parcela atualizada'); }
    catch (e) { toast(traduz((e as Error).message), 'warn'); }
  }
  async function doCancelar() {
    try { await cancelar.mutateAsync({ cobrancaId: id }); toast('Cobrança cancelada'); setConfirmCancel(false); }
    catch (e) { toast(traduz((e as Error).message), 'warn'); }
  }

  const podeCancelar = gestor && c && c.status !== 'cancelado' && c.status !== 'finalizado';

  return (
    <Modal open onClose={onClose} width={680}
      title={c ? <div><div>{c.contatoNome}</div><div className="cob-modal-sub">{c.servico || 'Cobrança recorrente'} · <CobStBadge s={c.status} /></div></div> : 'Cobrança'}
      footer={<><button className="atv-btn" onClick={onClose}>Fechar</button>{podeCancelar && <button className="atv-btn danger" onClick={() => setConfirmCancel(true)}>Cancelar cobrança</button>}</>}>
      {det.isLoading ? <div className="cob-info">Carregando…</div> : !c ? <div className="cob-info err">Cobrança não encontrada.</div> : (
        <div className="cob-det">
          <div className="cob-det-resumo">
            <Campo l="Telefone" v={c.contatoTelefone || '—'} /><Campo l="Responsável" v={c.responsavelNome || '—'} />
            <Campo l="Valor mensal" v={fmtBRL(c.valorMensal)} /><Campo l="Total previsto" v={fmtBRL(c.valorMensal * c.ciclosTotais)} />
            <Campo l="Pagas" v={`${c.ciclosPagos} de ${c.ciclosTotais}`} /><Campo l="Próxima" v={dataBR(c.proximaCobranca)} />
          </div>

          <div className="cob-sec">Parcelas</div>
          <div className="table-scroll">
            <table className="contracts-table cob-parc-table">
              <thead><tr><th>#</th><th>Vencimento</th><th>Valor</th><th>Status</th><th>Pago em</th><th>Valor pago</th>{gestor && <th aria-label="Ações"></th>}</tr></thead>
              <tbody>
                {c.parcelas.map((p) => (
                  <tr key={p.id}>
                    <td>{p.ciclo}</td><td>{dataBR(p.dataPrevista)}</td><td>{fmtBRL(p.valor)}</td>
                    <td><ParcStBadge p={p} /></td><td>{dataBR(p.dataPagamento)}</td><td>{p.valorPago != null ? fmtBRL(p.valorPago) : '—'}</td>
                    {gestor && <td className="cob-parc-acts">
                      {(p.status === 'prevista' || p.status === 'nao_paga') && <button className="cob-mini" onClick={() => setBaixaParc(p)} disabled={baixa.isPending}>Pagar</button>}
                      {p.status === 'prevista' && <button className="cob-mini" onClick={() => agir(p, 'nao_paga')}>Não paga</button>}
                      {p.status === 'nao_paga' && <button className="cob-mini" onClick={() => agir(p, 'prevista')}>Reabrir</button>}
                      {p.status === 'paga' && <button className="cob-mini" onClick={() => agir(p, 'prevista')}>Estornar</button>}
                    </td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="cob-sec">Histórico</div>
          <div className="cob-eventos">
            {c.eventos.length === 0 ? <div className="cob-info">Sem eventos.</div> : c.eventos.map((e) => (
              <div className="cob-ev" key={e.id}><span className="cob-ev-dot" /><div><div className="cob-ev-txt">{e.descricao || e.tipo}</div><div className="cob-ev-meta">{e.autorNome ? e.autorNome + ' · ' : ''}{new Date(e.criadoEm).toLocaleString('pt-BR')}</div></div></div>
            ))}
          </div>
        </div>
      )}

      {baixaParc && <BaixaModal parcela={baixaParc} cobrancaId={id} onClose={() => setBaixaParc(null)} />}
      <ConfirmDialog open={confirmCancel} title="Cancelar cobrança"
        message="As parcelas futuras/pendentes serão canceladas; as pagas são preservadas. Esta ação não pode ser desfeita."
        confirmLabel="Cancelar cobrança" destructive loading={cancelar.isPending} onConfirm={doCancelar} onCancel={() => setConfirmCancel(false)} />
    </Modal>
  );
}

function BaixaModal({ parcela, cobrancaId, onClose }: { parcela: CobrancaParcela; cobrancaId: string; onClose: () => void }) {
  const { toast } = useToast();
  const baixa = useRegistrarBaixa();
  const [data, setData] = useState(hojeISO());
  const [obs, setObs] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  async function salvar() {
    if (baixa.isPending) return;
    setErro(null);
    try { await baixa.mutateAsync({ parcelaId: parcela.id, cobrancaId, data, obs: obs || null }); toast('Pagamento registrado'); onClose(); }
    catch (e) { setErro(traduz((e as Error).message)); }
  }
  return (
    <Modal open onClose={() => { if (!baixa.isPending) onClose(); }} closeOnBackdrop={!baixa.isPending} width={420}
      title={`Registrar pagamento · parcela ${parcela.ciclo}`}
      footer={<><button className="atv-btn" disabled={baixa.isPending} onClick={onClose}>Cancelar</button><button className="atv-btn primary" disabled={baixa.isPending} onClick={salvar}>{baixa.isPending ? 'Salvando…' : 'Confirmar pagamento'}</button></>}>
      <div className="cob-form">
        <p className="cob-modal-txt">Valor integral da parcela: <strong>{fmtBRL(parcela.valor)}</strong> (pagamento parcial não é permitido).</p>
        <div className="cob-field"><label className="cob-label">Data do pagamento</label><input className="ctrl" type="date" value={data} onChange={(e) => setData(e.target.value)} /></div>
        <div className="cob-field"><label className="cob-label">Observação</label><input className="ctrl" value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Opcional" /></div>
        {erro && <div className="cob-erro">{erro}</div>}
      </div>
    </Modal>
  );
}

const Campo = ({ l, v }: { l: string; v: string }) => <div className="cob-campo"><span className="cob-campo-l">{l}</span><span className="cob-campo-v">{v}</span></div>;

function traduz(msg: string): string {
  const m = (msg || '').toLowerCase();
  if (m.includes('sem_permissao') || m.includes('row-level') || m.includes('permission')) return 'Você não tem permissão para esta ação.';
  if (m.includes('parcela_ja_paga')) return 'Esta parcela já está paga.';
  if (m.includes('cobranca_cancelada')) return 'A cobrança está cancelada.';
  if (m.includes('cobranca_finalizada')) return 'Cobrança já finalizada.';
  if (m.includes('valor_invalido')) return 'Valor inválido.';
  if (m.includes('ciclos_invalido')) return 'Quantidade de parcelas inválida.';
  if (m.includes('contato_invalido')) return 'Cliente inválido.';
  if (m.includes('transicao_nao_permitida')) return 'Transição de status não permitida.';
  return 'Não foi possível concluir: ' + msg;
}
