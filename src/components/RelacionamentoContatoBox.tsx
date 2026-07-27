import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Modal } from '@/components/Modal';
import { useToast } from '@/hooks/useToast';
import {
  useAtivacaoDoContato, useBloqueio, useReguas, useCanaisNormais,
  useAtivarRelacionamento, usePausar, useRetomar, useDesativar, useDesbloquear,
  ATIV_STATUS, objetivoInfo, traduzErro,
} from '@/data/relacionamento';
import './RelacionamentoContatoBox.css';

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');

/** Caixa reutilizável (WhatsApp / Kanban): ativa/gerencia o relacionamento de um contato. */
export function RelacionamentoContatoBox({ contatoId, conversaId, canalId }: { contatoId?: string | null; conversaId?: string | null; canalId?: string | null }) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const ativQ = useAtivacaoDoContato(contatoId ?? null);
  const bloqQ = useBloqueio(contatoId ?? null);
  const reguasQ = useReguas();
  const canaisQ = useCanaisNormais();
  const ativar = useAtivarRelacionamento();
  const pausar = usePausar();
  const retomar = useRetomar();
  const desativar = useDesativar();
  const desbloquear = useDesbloquear();
  const [modal, setModal] = useState(false);
  const [reguaSel, setReguaSel] = useState('');
  const [canalSel, setCanalSel] = useState('');
  const [busy, setBusy] = useState(false);

  if (!contatoId) return null;

  const a = ativQ.data;
  const bloqueado = bloqQ.data === true;
  const reguasAtivas = (reguasQ.data ?? []).filter((r) => r.status === 'ativa');
  const canais = canaisQ.data ?? [];

  async function run(fn: () => Promise<unknown>, ok: string) {
    if (busy) return; setBusy(true);
    try { await fn(); toast(ok); } catch (e) { toast(traduzErro((e as Error).message), 'warn'); } finally { setBusy(false); }
  }
  function abrir() {
    setReguaSel(reguasAtivas[0]?.id || '');
    setCanalSel(canalId && canais.some((c) => c.id === canalId) ? canalId : (canais[0]?.id || ''));
    setModal(true);
  }
  async function confirmar() {
    if (!reguaSel || !canalSel) return;
    await run(async () => {
      await ativar.mutateAsync({ contatoId: contatoId!, reguaId: reguaSel, canalId: canalSel, conversaId: conversaId ?? null });
      setModal(false);
    }, 'Relacionamento ativado');
  }

  return (
    <div className="rcb">
      <div className="rcb-h">Relacionamento</div>

      {ativQ.isLoading || bloqQ.isLoading ? (
        <div className="rcb-info">Carregando…</div>
      ) : bloqueado ? (
        <div className="rcb-empty">
          <span className="rcb-info">Marcado como <strong>não incomodar</strong>.</span>
          <button type="button" className="rcb-btn" disabled={busy} onClick={() => run(() => desbloquear.mutateAsync(contatoId!), 'Desbloqueado')}>Remover bloqueio</button>
        </div>
      ) : a ? (
        <div className="rcb-card">
          <div className="rcb-row"><span className="rcb-l">Régua</span><span className="rcb-v">{a.reguaNome || '—'}</span></div>
          <div className="rcb-row"><span className="rcb-l">Objetivo</span><span className="rcb-v">{a.reguaObjetivo ? objetivoInfo(a.reguaObjetivo).label : '—'}</span></div>
          <div className="rcb-row"><span className="rcb-l">Status</span><span className={'badge ' + ATIV_STATUS[a.status].badge}>{ATIV_STATUS[a.status].label}</span></div>
          <div className="rcb-row"><span className="rcb-l">Próximo</span><span className="rcb-v">{fmt(a.proximoEm)}</span></div>
          <div className="rcb-acts">
            {a.status === 'ativo' && <button type="button" className="rcb-btn" disabled={busy} onClick={() => run(() => pausar.mutateAsync({ ativacaoId: a.id }), 'Pausado')}>Pausar</button>}
            {a.status === 'pausado' && <button type="button" className="rcb-btn" disabled={busy} onClick={() => run(() => retomar.mutateAsync({ ativacaoId: a.id }), 'Retomado')}>Retomar</button>}
            <button type="button" className="rcb-btn ghost" onClick={() => navigate('/relacionamento?tab=clientes')}>Ver régua</button>
            <button type="button" className="rcb-btn danger" disabled={busy} onClick={() => run(() => desativar.mutateAsync({ ativacaoId: a.id }), 'Desativado')}>Desativar</button>
          </div>
        </div>
      ) : (
        <div className="rcb-empty">
          <span className="rcb-info">Sem relacionamento ativo.</span>
          <button type="button" className="rcb-btn primary" disabled={reguasQ.isLoading} onClick={abrir}>Ativar relacionamento</button>
        </div>
      )}

      <Modal open={modal} onClose={() => { if (!busy) setModal(false); }} closeOnBackdrop={!busy} width={440}
        title="Ativar relacionamento"
        footer={<><button className="atv-btn" disabled={busy} onClick={() => setModal(false)}>Cancelar</button><button className="atv-btn primary" disabled={busy || !reguaSel || !canalSel} onClick={confirmar}>{busy ? 'Ativando…' : 'Ativar'}</button></>}>
        <div className="rcb-modal">
          <div className="rcb-field"><label className="rcb-lbl">Régua</label>
            <select className="atv-input" value={reguaSel} onChange={(e) => setReguaSel(e.target.value)} disabled={busy}>
              <option value="">Escolha…</option>{reguasAtivas.map((r) => <option key={r.id} value={r.id}>{r.nome}</option>)}
            </select>
            {reguasAtivas.length === 0 && <div className="rcb-hint">Nenhuma régua ativa. Crie e ative uma régua em Relacionamento.</div>}
          </div>
          <div className="rcb-field"><label className="rcb-lbl">Canal (número normal)</label>
            <select className="atv-input" value={canalSel} onChange={(e) => setCanalSel(e.target.value)} disabled={busy}>
              <option value="">Escolha…</option>{canais.map((c) => <option key={c.id} value={c.id}>{c.nome}{c.numero ? ` · ${c.numero}` : ''}</option>)}
            </select>
            {canais.length === 0 && <div className="rcb-hint">Nenhum canal normal conectado disponível.</div>}
          </div>
          <p className="rcb-modal-txt">Enviaremos no máximo <strong>{reguasAtivas.find((r) => r.id === reguaSel)?.tetoSemana ?? 3} mensagens/semana</strong>, só em horário permitido. O envio automático ainda não está ligado nesta fase.</p>
        </div>
      </Modal>
    </div>
  );
}
