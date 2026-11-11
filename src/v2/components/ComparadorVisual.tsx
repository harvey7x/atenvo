import { useState } from 'react';
import { lerInboxPro, salvarInboxPro } from '../lib/inboxPro';

/* Comparador "Antes / Depois" da prévia em curso (hoje: atendimento renovado, 29/10;
   a repaginada de 27/10 já foi aprovada e segue ligada nos dois lados).
   Só renderiza no modo demonstração — quem chama decide (AppShellV2).
   O × esconde até recarregar a aba, para ver a tela limpa. */
export function ComparadorVisual() {
  const [novo, setNovo] = useState(lerInboxPro);
  const [visivel, setVisivel] = useState(true);
  if (!visivel) return null;

  const trocar = (v: boolean) => { setNovo(v); salvarInboxPro(v); };

  return (
    <div className="rp-comparador" role="group" aria-label="Comparar visual">
      <span className="rp-rot">Visual</span>
      <div className="rp-seg">
        <button type="button" className={novo ? '' : 'on'} aria-pressed={!novo} onClick={() => trocar(false)}>Antes</button>
        <button type="button" className={novo ? 'on' : ''} aria-pressed={novo} onClick={() => trocar(true)}>Depois</button>
      </div>
      <button type="button" className="rp-x" aria-label="Esconder comparador" title="Esconder até recarregar" onClick={() => setVisivel(false)}>×</button>
    </div>
  );
}
