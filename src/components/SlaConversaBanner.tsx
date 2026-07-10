import { useState } from 'react';
import { SlaAlertList } from './SlaAlertList';
import { maxSeveridade, ordenarAlertas, sevClass, sevIntensidade, tipoEmoji, tipoLabel, fraseTipo, tempoRelativo, type SlaAlerta } from '@/data/slaView';

/* Banner de SLA no topo da conversa aberta. Mostra o alerta mais grave; expande para a lista
   compacta com ações (Silenciar/Resolver, gated). Não bloqueia a digitação (composer fica embaixo). */

export function SlaConversaBanner({ alertas }: { alertas: SlaAlerta[] }) {
  const [aberto, setAberto] = useState(false);
  if (!alertas.length) return null;

  const ordenados = ordenarAlertas(alertas);      // mais grave primeiro
  const sevMax = maxSeveridade(alertas) ?? 'amarelo';
  const top = ordenados[0];
  const extras = alertas.length - 1;

  return (
    <div className={'sla-conv ' + sevClass(sevMax)} role="alert" aria-label="Alertas de atendimento desta conversa">
      <div className="sla-conv-bar">
        <span className="sla-conv-dot" aria-hidden="true" />
        {sevIntensidade(sevMax) !== 'discreto' && <span className="sla-conv-emoji" aria-hidden="true">{tipoEmoji(top.tipo)}</span>}
        <span className="sla-conv-text"><strong>{tipoLabel(top.tipo)}</strong> · {fraseTipo(top.tipo)} {tempoRelativo(top.criado_em)}{extras > 0 ? ` · +${extras}` : ''}</span>
        <button type="button" className="sla-btn-ghost sla-conv-toggle" onClick={() => setAberto((v) => !v)} aria-expanded={aberto}>
          {aberto ? 'Recolher' : (extras > 0 ? `Ações (${alertas.length})` : 'Ações')}
        </button>
      </div>
      {aberto && (
        <div className="sla-conv-list">
          <SlaAlertList itens={ordenados} hideAbrir />
        </div>
      )}
    </div>
  );
}
