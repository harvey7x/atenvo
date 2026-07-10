import { Icon } from './icons';
import { useSlaAlertas } from '@/data/sla';
import { SlaAlertList } from './SlaAlertList';
import { useSlaUi } from './SlaNotificationToast';
import { ordenarAlertas } from '@/data/slaView';

/* Sino da Topbar = central rápida de alertas de SLA. Estado da central vem do SlaUiProvider
   (a barra global e os toasts também abrem esta central). Dropdown premium com scroll interno. */

export function SlaBell() {
  const { data } = useSlaAlertas();
  const { centralAberta, toggleCentral, fecharCentral } = useSlaUi();
  const total = data?.total ?? 0;
  const urgente = (data?.imediatos ?? 0) + (data?.criticos ?? 0) + (data?.vermelhos ?? 0) > 0;
  const itens = data ? ordenarAlertas(data.itens) : [];

  return (
    <div className="sla-bell">
      <button className="icon-btn sla-bell-btn" title="Alertas de atendimento" aria-label="Alertas de atendimento"
        aria-expanded={centralAberta} onClick={toggleCentral}>
        <Icon name="bell" />
        {total > 0 && <span className={'sla-bell-badge' + (urgente ? ' urg' : '')}>{total > 99 ? '99+' : total}</span>}
      </button>
      {centralAberta && (
        <>
          <div className="sla-bell-backdrop" onClick={fecharCentral} />
          <div className="sla-bell-drop" role="dialog" aria-label="Central de alertas de atendimento">
            <div className="sla-bell-head">
              <span>Central de atendimento</span>
              {total > 0 && <span className="sla-bell-count">{total}</span>}
            </div>
            <div className="sla-bell-body">
              <SlaAlertList itens={itens} onNavigate={fecharCentral} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
