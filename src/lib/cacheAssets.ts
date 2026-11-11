/* Guarda do cache imutável de /assets/* (perf 20/10) — função PURA, usada pelo vite.config.ts
   (o build quebra se a guarda falhar) e pelo teste cacheAssets.test.ts.

   A regra `/assets/*  Cache-Control: ... immutable` do public/_headers só é segura junto com
   public/assets/404.html: sem ele, asset inexistente em /assets/ (chunk de deploy antigo, rollback)
   cai no modo SPA do Pages e recebe o index.html com 200 e cache de 1 ano — o navegador e o
   precache do SW guardam HTML no lugar do .js/.css e a rota quebra até o hash mudar. Com ele, o
   Pages responde 404 com "no-store". E NUNCA pode existir public/404.html (na raiz ele desliga o
   modo SPA do site inteiro). Sem isto, um commit que levasse o _headers sem o 404.html (arquivo
   novo, fora do `git add -u`) ia para produção sem aviso nenhum. */

export interface EstadoCacheAssets {
  /** Conteúdo de public/_headers. */
  headers: string;
  /** public/assets/404.html existe. */
  temAssets404: boolean;
  /** public/404.html existe (proibido: desliga o SPA). */
  temRaiz404: boolean;
}

/** A regra de /assets/* do _headers tem Cache-Control com `immutable` (ou max-age longo)? */
export function temCacheLongoAssets(headers: string): boolean {
  const linhas = headers.split(/\r?\n/);
  let naRegra = false;
  for (const bruta of linhas) {
    const linha = bruta.replace(/#.*$/, '');
    if (!linha.trim()) continue;
    if (!/^\s/.test(linha)) { naRegra = linha.trim().startsWith('/assets/'); continue; }   // linha sem recuo = nova regra (URL)
    if (!naRegra) continue;
    const m = /^\s*cache-control\s*:\s*(.+)$/i.exec(linha);
    if (!m) continue;
    const valor = m[1].toLowerCase();
    const maxAge = /max-age\s*=\s*(\d+)/.exec(valor);
    if (valor.includes('immutable') || (maxAge && Number(maxAge[1]) > 0)) return true;
  }
  return false;
}

/** Lista de problemas (vazia = ok). */
export function problemasCacheAssets(e: EstadoCacheAssets): string[] {
  const out: string[] = [];
  if (e.temRaiz404) out.push('public/404.html existe: na raiz ele desliga o modo SPA do Pages (todas as rotas virariam 404). Apague-o.');
  if (temCacheLongoAssets(e.headers) && !e.temAssets404) {
    out.push('public/_headers dá cache longo/imutável a /assets/* mas public/assets/404.html não existe: asset inexistente receberia o index.html com 200 e cache de 1 ano. Inclua public/assets/404.html no MESMO commit (git add explícito: é arquivo novo).');
  }
  return out;
}
