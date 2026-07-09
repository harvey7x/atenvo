import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrg } from '@/context/OrgContext';
import { useAuth } from '@/context/AuthContext';
import { useSilenciarSlaAlerta, useResolverSlaAlerta } from '@/data/sla';
import { sevClass, tipoEmoji, podeGerirAlerta, type SlaAlerta } from '@/data/slaView';

/* Lista de alertas de SLA + ações (Abrir / Silenciar / Resolver). Reutilizada pela barra
   global (GlobalSlaAlert) e pelo dropdown do sino. Silenciar/Resolver só p/ quem tem permissão. */

function presetAte(kind: '1h' | 'amanha'): string {
  const d = new Date();
  if (kind === '1h') { d.setHours(d.getHours() + 1); return d.toISOString(); }
  d.setDate(d.getDate() + 1); d.setHours(8, 0, 0, 0); return d.toISOString(); // amanhã 08:00 local
}

function SilenciarBox({ alertaId, onDone }: { alertaId: string; onDone: () => void }) {
  const [motivo, setMotivo] = useState('');
  const [kind, setKind] = useState<'1h' | 'amanha'>('1h');
  const silenciar = useSilenciarSlaAlerta();
  const podeConfirmar = motivo.trim().length > 0 && !silenciar.isPending;
  return (
    <div className="sla-silbox" role="group" aria-label="Silenciar alerta">
      <div className="sla-sil-durs">
        <button type="button" className={kind === '1h' ? 'on' : ''} onClick={() => setKind('1h')}>Por 1 hora</button>
        <button type="button" className={kind === 'amanha' ? 'on' : ''} onClick={() => setKind('amanha')}>Até amanhã</button>
      </div>
      <input className="sla-sil-motivo" placeholder="Motivo (obrigatório)" value={motivo} maxLength={280}
        onChange={(e) => setMotivo(e.target.value)} />
      <div className="sla-sil-actions">
        <button type="button" className="sla-btn-ghost" onClick={onDone} disabled={silenciar.isPending}>Cancelar</button>
        <button type="button" className="sla-btn-solid" disabled={!podeConfirmar}
          onClick={() => silenciar.mutate({ alertaId, ate: presetAte(kind), motivo: motivo.trim() }, { onSuccess: onDone })}>
          {silenciar.isPending ? 'Silenciando…' : 'Silenciar'}
        </button>
      </div>
      {silenciar.isError && <div className="sla-sil-erro">Não foi possível silenciar. Tente novamente.</div>}
    </div>
  );
}

function Item({ alerta, onNavigate, hideAbrir }: { alerta: SlaAlerta; onNavigate?: () => void; hideAbrir?: boolean }) {
  const { currentOrg } = useOrg();
  const { user } = useAuth();
  const navigate = useNavigate();
  const resolver = useResolverSlaAlerta();
  const [abrirSil, setAbrirSil] = useState(false);
  const podeGerir = podeGerirAlerta(currentOrg.role, alerta, user?.id);

  const abrir = () => {
    onNavigate?.();
    navigate(alerta.conversa_id ? '/whatsapp' : '/kanban');
  };

  return (
    <li className={'sla-item ' + sevClass(alerta.severidade)}>
      <div className="sla-item-main">
        <span className="sla-item-dot" aria-hidden="true" />
        <span className="sla-item-emoji" aria-hidden="true">{tipoEmoji(alerta.tipo)}</span>
        <span className="sla-item-txt">
          <span className="sla-item-titulo">{alerta.titulo}</span>
          {alerta.detalhe && <span className="sla-item-det">{alerta.detalhe}</span>}
        </span>
      </div>
      <div className="sla-item-actions">
        {!hideAbrir && <button type="button" className="sla-btn-ghost" onClick={abrir}>Abrir</button>}
        {podeGerir && !abrirSil && (
          <button type="button" className="sla-btn-ghost" onClick={() => setAbrirSil(true)}>Silenciar</button>
        )}
        {podeGerir && (
          <button type="button" className="sla-btn-solid" disabled={resolver.isPending}
            onClick={() => resolver.mutate(alerta.id)}>
            {resolver.isPending ? '…' : 'Resolver'}
          </button>
        )}
      </div>
      {podeGerir && abrirSil && <SilenciarBox alertaId={alerta.id} onDone={() => setAbrirSil(false)} />}
    </li>
  );
}

export function SlaAlertList({ itens, onNavigate, hideAbrir }: { itens: SlaAlerta[]; onNavigate?: () => void; hideAbrir?: boolean }) {
  if (!itens.length) return <div className="sla-empty">Nenhum alerta de atendimento ativo.</div>;
  return (
    <ul className="sla-list">
      {itens.map((a) => <Item key={a.id} alerta={a} onNavigate={onNavigate} hideAbrir={hideAbrir} />)}
    </ul>
  );
}
