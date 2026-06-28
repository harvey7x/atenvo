import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useOportunidadesDoContato, useFunisDaOrg, chamarGarantirEntrada, valorRelevante, rotuloDe, TIPO_SERVICO_OPCOES, TIPO_BENEFICIO_OPCOES } from '@/data/kanban';
import { Modal } from '@/components/Modal';
import { FichaJudicialBox } from '@/components/FichaJudicialBox';
import { useToast } from '@/hooks/useToast';
import './KanbanContatoBox.css';

const fmtBRL = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

/** Caixa reutilizável (WhatsApp/Facebook): mostra a oportunidade aberta do contato ou permite adicioná-lo ao Kanban via RPC. */
export function KanbanContatoBox({ contatoId, conversaId, canalId, canalTipo }: { contatoId?: string | null; conversaId?: string | null; canalId?: string | null; canalTipo?: 'whatsapp' | 'facebook' }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { toast } = useToast();
  const opps = useOportunidadesDoContato(contatoId ?? null);
  const funisQ = useFunisDaOrg();
  const [modal, setModal] = useState(false);
  const [funilSel, setFunilSel] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!contatoId) return null;
  const lista = opps.data ?? [];
  const aberta = lista.find((o) => o.aberta);
  const funis = funisQ.data ?? [];
  const origem = canalTipo === 'facebook' ? 'Facebook' : 'WhatsApp';

  function abrir() { setFunilSel(funis.find((f) => f.padrao)?.id || funis[0]?.id || ''); setErr(null); setModal(true); }
  async function confirmar() {
    if (busy || !contatoId) return;
    const fid = funis.length > 1 ? funilSel : (funis.find((f) => f.padrao)?.id || funis[0]?.id || funilSel);
    if (!fid) { setErr('Nenhum funil disponível.'); return; }
    setBusy(true); setErr(null);
    try {
      await chamarGarantirEntrada({ contatoId, funilId: fid, origem, conversaId: conversaId ?? null, canalId: canalId ?? null });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['opp-do-contato'] }),
        qc.invalidateQueries({ queryKey: ['opp-abertas'] }),
        qc.invalidateQueries({ queryKey: ['kanban-leads'] }),
      ]);
      setModal(false); toast('Adicionado ao Kanban');
    } catch (e) { setErr((e as Error).message || 'Falha ao adicionar.'); }
    finally { setBusy(false); }
  }

  return (
    <div className="kcb">
      <div className="kcb-h">Kanban</div>
      {opps.isLoading ? (
        <div className="kcb-info">Carregando…</div>
      ) : opps.isError ? (
        <div className="kcb-info err">Não foi possível carregar.</div>
      ) : aberta ? (
        <div className="kcb-card">
          <div className="kcb-row"><span className="kcb-l">Funil</span><span className="kcb-v">{aberta.funilNome || '—'}</span></div>
          <div className="kcb-row"><span className="kcb-l">Etapa</span><span className="kcb-v">{aberta.colunaNome || '—'}</span></div>
          <div className="kcb-row"><span className="kcb-l">Resp. (oportunidade)</span><span className="kcb-v">{aberta.respNome || 'Não atribuído'}</span></div>
          <div className="kcb-row"><span className="kcb-l">Serviço</span><span className="kcb-v">{rotuloDe(TIPO_SERVICO_OPCOES, aberta.tipoServico)}</span></div>
          {aberta.tipoBeneficio && <div className="kcb-row"><span className="kcb-l">Benefício</span><span className="kcb-v">{rotuloDe(TIPO_BENEFICIO_OPCOES, aberta.tipoBeneficio)}</span></div>}
          {(() => { const vr = valorRelevante(aberta); return vr.valor != null ? <div className="kcb-row"><span className="kcb-l">Valor</span><span className="kcb-v">{fmtBRL(vr.valor)}{vr.mensal ? ' /mês' : ''}</span></div> : null; })()}
          <button type="button" className="kcb-btn" onClick={() => navigate(`/kanban?oportunidade=${aberta.id}`)}>Ver no Kanban</button>
          <div className="kcb-ficha">
            <FichaJudicialBox contatoId={contatoId} oportunidadeId={aberta.id} conversaId={conversaId ?? null} canalId={canalId ?? null}
              responsavelSugerido={{ nome: aberta.respNome }} oportunidadeAtual={{ tipoBeneficio: aberta.tipoBeneficio }} />
          </div>
        </div>
      ) : (
        <div className="kcb-empty">
          <span className="kcb-info">Sem oportunidade aberta.</span>
          <button type="button" className="kcb-btn" onClick={abrir} disabled={funisQ.isLoading}>Adicionar ao Kanban</button>
        </div>
      )}

      <Modal open={modal} onClose={() => { if (!busy) setModal(false); }} closeOnBackdrop={!busy} width={420}
        title="Adicionar ao Kanban"
        footer={<><button className="atv-btn" disabled={busy} onClick={() => setModal(false)}>Cancelar</button><button className="atv-btn primary" disabled={busy} onClick={confirmar}>{busy ? 'Adicionando…' : 'Adicionar'}</button></>}>
        <div className="kcb-modal">
          <p className="kcb-modal-txt">O contato entrará na <strong>coluna de entrada</strong> do funil, com origem <strong>{origem}</strong>, herdando conversa, canal e atendente.</p>
          {funis.length > 1 && (
            <div className="kcb-field"><label className="kcb-lbl">Funil</label><select className="atv-input" value={funilSel} onChange={(e) => setFunilSel(e.target.value)} disabled={busy}>{funis.map((f) => <option key={f.id} value={f.id}>{f.nome}{f.padrao ? ' (padrão)' : ''}</option>)}</select></div>
          )}
          {err && <div className="kcb-err">{err}</div>}
        </div>
      </Modal>
    </div>
  );
}
