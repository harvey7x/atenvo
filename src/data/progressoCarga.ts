import { useSyncExternalStore } from 'react';

/* Progresso da 1ª carga de uma lista grande — telas "Carregando o Kanban" / "Iniciando o
   WhatsApp" (dono 30/10). Um canal por chave; quem carrega publica a cada faixa pronta
   (buscarKeysetEmFaixas → aoAvancar) e a tela lê com useProgressoCarga(chave). */
export interface ProgressoCarga { feitas: number; total: number; itens: number }

const estado = new Map<string, ProgressoCarga | null>();
const ouvintes = new Map<string, Set<() => void>>();

export function publicarProgresso(chave: string, p: ProgressoCarga | null): void {
  estado.set(chave, p);
  ouvintes.get(chave)?.forEach((f) => f());
}

export function useProgressoCarga(chave: string): ProgressoCarga | null {
  return useSyncExternalStore(
    (f) => {
      let s = ouvintes.get(chave);
      if (!s) { s = new Set(); ouvintes.set(chave, s); }
      s.add(f);
      return () => { s.delete(f); };
    },
    () => estado.get(chave) ?? null,
  );
}

/** Percentual inteiro (0–100) de um progresso; 0 sem progresso. */
export function pctProgresso(p: ProgressoCarga | null): number {
  return p && p.total > 0 ? Math.round((p.feitas / p.total) * 100) : 0;
}
