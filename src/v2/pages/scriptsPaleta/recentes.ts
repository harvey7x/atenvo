import { useCallback, useState } from 'react';

/* ------------------------------------------------------------------
   Recentes da paleta — últimos 6 scripts usados por ESTE usuário
   nesta org, gravados quando "Usar este script" é acionado.
   Conveniência por navegador (localStorage, chave org+usuário).
   Storage indisponível (aba privada, bloqueio, cota) NUNCA quebra a
   paleta: lê vazio e guarda em memória até recarregar a página.
   ------------------------------------------------------------------ */

export const MAX_RECENTES = 6;
type Armazem = Pick<Storage, 'getItem' | 'setItem'> | null;

export function chaveRecentes(orgId: string | null | undefined, userId: string | null | undefined): string {
  return `atenvo-scripts-recentes:${orgId || 'sem-org'}:${userId || 'anonimo'}`;
}

export function armazemPadrao(): Armazem {
  try { return typeof window !== 'undefined' ? window.localStorage : null; } catch { return null; }
}

// espelho em memória: sobrevive a fechar/abrir a paleta quando o storage falha
const memoria = new Map<string, string[]>();

export function lerRecentes(chave: string, armazem: Armazem = armazemPadrao()): string[] {
  let lista: string[] | null = null;
  try {
    const bruto = armazem?.getItem(chave);
    if (bruto) {
      const v: unknown = JSON.parse(bruto);
      if (Array.isArray(v)) lista = v.filter((x): x is string => typeof x === 'string' && x.length > 0);
    }
  } catch { lista = null; }
  const final = lista ?? memoria.get(chave) ?? [];
  return [...new Set(final)].slice(0, MAX_RECENTES);
}

/** Põe o id no topo, sem repetir, no máximo 6. Com `validos`, descarta ids de scripts que
 *  não existem mais (apagados/inativos) — eles não ocupam vaga dos 6. */
export function juntarRecente(lista: string[], id: string, validos?: ReadonlySet<string>): string[] {
  return [id, ...lista.filter((x) => x !== id && (!validos || validos.has(x)))].slice(0, MAX_RECENTES);
}

/** Grava; devolve false se o storage recusou (a memória guarda mesmo assim). */
export function gravarRecentes(chave: string, lista: string[], armazem: Armazem = armazemPadrao()): boolean {
  memoria.set(chave, lista);
  try {
    if (!armazem) return false;
    armazem.setItem(chave, JSON.stringify(lista));
    return true;
  } catch { return false; }
}

export function useRecentes(chave: string): [string[], (id: string, validos?: ReadonlySet<string>) => void] {
  const [estado, setEstado] = useState(() => ({ chave, lista: lerRecentes(chave) }));
  // trocou de org/usuário com a paleta aberta: relê a lista DAQUELA chave (nunca mostra a de outro)
  if (estado.chave !== chave) setEstado({ chave, lista: lerRecentes(chave) });
  const registrar = useCallback((id: string, validos?: ReadonlySet<string>) => {
    const nova = juntarRecente(lerRecentes(chave), id, validos);
    gravarRecentes(chave, nova);
    setEstado({ chave, lista: nova });
  }, [chave]);
  return [estado.chave === chave ? estado.lista : lerRecentes(chave), registrar];
}
