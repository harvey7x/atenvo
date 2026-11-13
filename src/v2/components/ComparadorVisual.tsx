import { useState } from 'react';
import { lerLinear, salvarLinear } from '../lib/linear';

/* Comparador "Antes / Depois" da prévia em curso (hoje: camada "Linear", 13/11;
   repaginada e atendimento renovado já foram aprovados e seguem ligados nos dois lados).
   Só renderiza no modo demonstração — quem chama decide (AppShellV2).
   O × esconde até recarregar a aba, para ver a tela limpa. */
export function ComparadorVisual() {
  const [novo, setNovo] = useState(lerLinear);
  const [visivel, setVisivel] = useState(true);
  if (!visivel) return null;

  const trocar = (v: boolean) => { setNovo(v); salvarLinear(v); };

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
