/* Flag da intro de entrada ("o sistema acorda") — Ordem de Design nº 1.
   TRAVA DE PRODUTO: roda UMA vez por login. A flag é disparada no sucesso do
   signIn (LoginV2) e consumida na primeira montagem do shell; refresh e
   navegação nunca re-disparam. sessionStorage cobre o caso de recarga total
   entre o login e o shell; a decisão é cacheada por ~1,5s para sobreviver ao
   double-mount do StrictMode sem perder a intro em dev. */

const CHAVE = 'v2-intro-pendente';

let pendente = false;
let decisao: { valor: boolean; em: number } | null = null;

/** Chamada no SUCESSO do signIn — única origem legítima da intro. */
export function marcarIntroEntrada() {
  pendente = true;
  decisao = null;
  try { sessionStorage.setItem(CHAVE, '1'); } catch { /* segue */ }
}

/** Lê E consome a flag (idempotente numa janela curta, p/ StrictMode). */
export function retirarIntroPendente(): boolean {
  const agora = Date.now();
  if (decisao && agora - decisao.em < 1500) return decisao.valor;
  let v = pendente;
  if (!v) {
    try { v = sessionStorage.getItem(CHAVE) === '1'; } catch { v = false; }
  }
  pendente = false;
  try { sessionStorage.removeItem(CHAVE); } catch { /* segue */ }
  decisao = { valor: v, em: agora };
  return v;
}
