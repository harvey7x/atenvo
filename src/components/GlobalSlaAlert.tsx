import { useState } from 'react';
import { useSlaAlertas } from '@/data/sla';
import { SlaAlertList } from './SlaAlertList';
import { useSlaUi } from './SlaNotificationToast';
import { maxSeveridade, ordenarAlertas, resumoTexto, sevClass, sevIntensidade } from '@/data/slaView';

/* Barra global de atendimento/SLA — compacta e premium. Recolhida: 1 linha de resumo.
   Expandida: no máximo 3 principais + "Ver todos" abre a central (dropdown do sino). */

const MAX_PREVIEW = 3;

export function GlobalSlaAlert() {
  const { data } = useSlaAlertas();
  const { abrirCentral } = useSlaUi();
  const [aberto, setAberto] = useState(false);

  if (!data || data.total === 0) return null;

  const itens = ordenarAlertas(data.itens);
  const sevMax = maxSeveridade(data.itens) ?? 'amarelo';
  const preview = itens.slice(0, MAX_PREVIEW);
  const restantes = data.total - preview.length;

  return (
    <div className={'sla ' + sevClass(sevMax) + ' int-' + sevIntensidade(sevMax)} role="alert" aria-label="Alertas de atendimento">
      <div className="sla-bar">
        <span className="sla-bar-dot" aria-hidden="true" />
        <span className="sla-bar-text">{resumoTexto(data)}</span>
        <div className="sla-bar-actions">
          <button type="button" className="sla-bar-link" onClick={() => setAberto((v) => !v)} aria-expanded={aberto}>
            {aberto ? 'Recolher' : 'Ver'}
          </button>
        </div>
      </div>
      {aberto && (
        <div className="sla-bar-list">
          <SlaAlertList itens={preview} />
          <button type="button" className="sla-vertodos" onClick={() => { setAberto(false); abrirCentral(); }}>
            {restantes > 0 ? `Ver todos (${data.total}) ›` : 'Abrir central ›'}
          </button>
        </div>
      )}
    </div>
  );
}
