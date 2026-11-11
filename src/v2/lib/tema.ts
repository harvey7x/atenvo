/* Tema dual (Adendo nº 6). O atributo `data-tema` fica na RAIZ (<html>) — assim vale
   para o app, para os portais de modal e para a Vitrine (todos descendem de :root).
   PADRÃO: dark. A ausência do atributo já resolve dark (tokens.css), então não há
   flash ao atualizar. SEM "seguir o sistema" por enquanto: só a escolha explícita do
   usuário (decisão registrada no CONTRATO). Persistência por usuário via `escopo`. */
import { semTransicao } from './semTransicao';

export type Tema = 'dark' | 'light';

const PREFIXO = 'atenvo-tema';
export const chaveTema = (escopo?: string): string => (escopo ? `${PREFIXO}:${escopo}` : PREFIXO);

export function lerTema(escopo?: string): Tema {
  try {
    return localStorage.getItem(chaveTema(escopo)) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

export function aplicarTema(tema: Tema): void {
  const raiz = document.documentElement;
  if (raiz.getAttribute('data-tema') === tema) return;
  semTransicao(() => raiz.setAttribute('data-tema', tema));
}

export function salvarTema(tema: Tema, escopo?: string): void {
  try {
    localStorage.setItem(chaveTema(escopo), tema);
  } catch {
    /* storage indisponível: aplica sem persistir */
  }
  aplicarTema(tema);
}
