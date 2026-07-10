import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrg } from '@/context/OrgContext';
import { useAuth } from '@/context/AuthContext';
import { useSilenciarSlaAlerta, useResolverSlaAlerta } from '@/data/sla';
import { sevClass, sevIntensidade, podeGerirAlerta, type SlaAlerta } from '@/data/slaView';

/* Lista compacta de alertas de SLA. Card enxuto: 1 ícone (no título), "Abrir" como ação principal
   discreta e Silenciar/Resolver num menu "…". Gates de permissão iguais (admin/supervisor ou responsável). */

function presetAte(kind: '1h' | 'amanha'): string {
  const d = new Date();
  if (kind === '1h') { d.setHours(d.getHours() + 1); return d.toISOString(); }
  d.setDate(d.getDate() + 1); d.setHours(8, 0, 0, 0); return d.toISOString();
}

function SilenciarBox({ alertaId, onDone }: { alertaId: string; onDone: () => void }) {
  const [motivo, setMotivo] = useState('');
  const [kind, setKind] = useState<'1h' | 'amanha'>('1h');
  const silenciar = useSilenciarSlaAlerta();
  const podeConfirmar = motivo.trim().length > 0 && !silenciar.isPending;
  return (
    <div className="sla-silbox" role="group" aria-label="Silenciar alerta">
      <div className="sla-sil-durs">
        <button type="button" className={kind === '1h' ? 'on' : ''} onClick={() => setKind('1h')}>1 hora</button>
        <button type="button" className={kind === 'amanha' ? 'on' : ''} onClick={() => setKind('amanha')}>Até amanhã</button>
      </div>
      <input className="sla-sil-motivo" placeholder="Motivo (obrigatório)" value={motivo} maxLength={280}
        onChange={(e) => setMotivo(e.target.value)} />
      <div className="sla-sil-actions">
        <button type="button" className="sla-btn-ghost" onClick={onDone} disabled={silenciar.isPending}>Cancelar</button>
        <button type="button" className="sla-btn-solid" disabled={!podeConfirmar}
          onClick={() => silenciar.mutate({ alertaId, ate: presetAte(kind), motivo: motivo.trim() }, { onSuccess: onDone })}>
          {silenciar.isPending ? '…' : 'Silenciar'}
        </button>
      </div>
      {silenciar.isError && <div className="sla-sil-erro">Não foi possível silenciar.</div>}
    </div>
  );
}

function Item({ alerta, onNavigate, hideAbrir }: { alerta: SlaAlerta; onNavigate?: () => void; hideAbrir?: boolean }) {
  const { currentOrg } = useOrg();
  const { user } = useAuth();
  const navigate = useNavigate();
  const resolver = useResolverSlaAlerta();
  const [menu, setMenu] = useState(false);
  const [abrirSil, setAbrirSil] = useState(false);
  const podeGerir = podeGerirAlerta(currentOrg.role, alerta, user?.id);

  const abrir = () => { onNavigate?.(); navigate(alerta.conversa_id ? '/whatsapp' : '/kanban'); };

  return (
    <li className={'sla-item ' + sevClass(alerta.severidade) + ' int-' + sevIntensidade(alerta.severidade)}>
      <div className="sla-item-row">
        <span className="sla-item-titulo" title={alerta.detalhe ?? alerta.titulo}>{alerta.titulo}</span>
        <div className="sla-item-acts">
          {!hideAbrir && <button type="button" className="sla-abrir" onClick={abrir}>Abrir</button>}
          {podeGerir && (
            <div className="sla-kebab-wrap">
              <button type="button" className="sla-kebab" aria-label="Ações" aria-expanded={menu} onClick={() => setMenu((v) => !v)}>⋯</button>
              {menu && (
                <div className="sla-kebab-menu" role="menu" onMouseLeave={() => setMenu(false)}>
                  <button type="button" role="menuitem" onClick={() => { setMenu(false); setAbrirSil(true); }}>Silenciar</button>
                  <button type="button" role="menuitem" disabled={resolver.isPending}
                    onClick={() => { setMenu(false); resolver.mutate(alerta.id); }}>Resolver</button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      {alerta.detalhe && <div className="sla-item-meta">{alerta.detalhe}</div>}
      {abrirSil && <SilenciarBox alertaId={alerta.id} onDone={() => setAbrirSil(false)} />}
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
