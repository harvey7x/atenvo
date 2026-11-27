/* O tema que está NA TELA agora ([data-tema] da raiz), como valor React que acompanha a troca
   (o botão sol/lua do topo). Para componentes que recebem o tema por prop — o card de métrica
   (components/ui/progress-metric-card) é claro de fábrica e escuro com theme="dark". */
import { useSyncExternalStore } from 'react';
import type { Tema } from './tema';

const assinar = (cb: () => void) => {
  const obs = new MutationObserver(cb);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-tema'] });
  return () => obs.disconnect();
};
const ler = (): Tema => (document.documentElement.getAttribute('data-tema') === 'light' ? 'light' : 'dark');

export function useTemaAtual(): Tema {
  return useSyncExternalStore(assinar, ler, () => 'dark');
}
