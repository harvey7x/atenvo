import { useState } from 'react';
import { Icon } from './icons';
import { useSlaAlertas } from '@/data/sla';
import { SlaAlertList } from './SlaAlertList';
import { ordenarAlertas } from '@/data/slaView';

/* Sino da Topbar = central rápida de alertas de SLA. Badge com a contagem ativa + dropdown próprio
   (independente da barra global GlobalSlaAlert). Usa sla_alertas_ativos (role-aware). */

export function SlaBell() {
  const { data } = useSlaAlertas();
  const [aberto, setAberto] = useState(false);
  const total = data?.total ?? 0;
  const urgente = (data?.imediatos ?? 0) + (data?.criticos ?? 0) > 0;
  const itens = data ? ordenarAlertas(data.itens) : [];

  return (
    <div className="sla-bell">
      <button className="icon-btn sla-bell-btn" title="Alertas de atendimento" aria-label="Alertas de atendimento"
        aria-expanded={aberto} onClick={() => setAberto((v) => !v)}>
        <Icon name="bell" />
        {total > 0 && <span className={'sla-bell-badge' + (urgente ? ' urg' : '')}>{total > 99 ? '99+' : total}</span>}
      </button>
      {aberto && (
        <>
          <div className="sla-bell-backdrop" onClick={() => setAberto(false)} />
          <div className="sla-bell-drop" role="dialog" aria-label="Alertas de atendimento">
            <div className="sla-bell-head">Alertas de atendimento{total > 0 ? ` (${total})` : ''}</div>
            <div className="sla-bell-body">
              <SlaAlertList itens={itens} onNavigate={() => setAberto(false)} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
