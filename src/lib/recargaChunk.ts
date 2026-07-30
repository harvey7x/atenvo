import { lazy, type ComponentType } from 'react';

// Após um deploy, os chunks antigos (hash antigo) somem do servidor; quem está com o
// index.html anterior em cache quebra ao navegar para uma rota lazy ("Failed to fetch
// dynamically imported module"). A saída é recarregar a página — o reload busca o
// index.html novo, que aponta para os chunks novos. A guarda de tempo (1 reload por
// minuto, via sessionStorage) impede loop de recarga quando a falha é persistente
// (ex.: rede fora): na segunda falha o erro propaga e a tela de erro aparece.

const CHAVE = 'atenvo:recarga-chunk-ts';

export function tentarRecarga(): boolean {
  let ultima = 0;
  try {
    ultima = Number(sessionStorage.getItem(CHAVE)) || 0;
  } catch {
    /* sem sessionStorage (ex.: modo restrito): segue sem histórico */
  }
  const agora = Date.now();
  if (agora - ultima < 60_000) return false;
  try {
    sessionStorage.setItem(CHAVE, String(agora));
  } catch {
    /* idem */
  }
  window.location.reload();
  return true;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyComRecarga<T extends ComponentType<any>>(
  importar: () => Promise<{ default: T }>,
) {
  return lazy(async () => {
    try {
      return await importar();
    } catch (erro) {
      if (tentarRecarga()) {
        // a página está recarregando — mantém o Suspense pendente até lá
        return new Promise<never>(() => {});
      }
      throw erro;
    }
  });
}
