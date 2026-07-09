import { useState } from 'react';
import { useSlaAlertas } from '@/data/sla';
import { SlaAlertList } from './SlaAlertList';
import { maxSeveridade, ordenarAlertas, resumoTexto, sevClass } from '@/data/slaView';

/* Aviso global de atendimento/SLA. Irmão do GlobalWhatsAppAlert (não se mistura com canal/WhatsApp).
   Aparece nas páginas internas quando há alertas ativos; oculto quando não há. */

export function GlobalSlaAlert() {
  const { data } = useSlaAlertas();
  const [aberto, setAberto] = useState(false);

  if (!data || data.total === 0) return null;

  const itens = ordenarAlertas(data.itens);
  const sevMax = maxSeveridade(data.itens) ?? 'amarelo';
  const unico = data.total === 1;

  return (
    <div className={'sla ' + sevClass(sevMax)} role="alert" aria-label="Alertas de atendimento">
      <div className="sla-bar">
        <span className="sla-bar-dot" aria-hidden="true" />
        <span className="sla-bar-text">{unico ? itens[0].titulo : resumoTexto(data)}</span>
        <div className="sla-bar-actions">
          <button type="button" className="sla-btn-ghost" onClick={() => setAberto((v) => !v)} aria-expanded={aberto}>
            {aberto ? 'Recolher' : (unico ? 'Ver alerta' : `Ver ${data.total} alertas`)}
          </button>
        </div>
      </div>
      {aberto && (
        <div className="sla-bar-list">
          <SlaAlertList itens={itens} />
        </div>
      )}
    </div>
  );
}
