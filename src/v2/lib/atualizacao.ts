/* Sinal "saiu deploy novo" (pedido do dono 28/08). Quem dispara é o
   onNeedReload do registerSW em main.tsx — no registerType 'autoUpdate'
   ele roda exatamente quando o SW do deploy novo ATIVA (skipWaiting +
   clientsClaim: o SW novo já está no controle; recarregar é seguro e pega
   o index novo). Mini-store módulo no estilo de perf.ts, porque main.tsx
   roda fora da árvore React. O reload em si é SEMPRE por clique do
   atendente — o reload forçado foi suprimido de propósito (rascunho do
   composer, conversa aberta e filtros iriam embora a cada deploy). */

let disponivel = false;

type Ouvinte = (disponivel: boolean) => void;
const ouvintes = new Set<Ouvinte>();

export function haAtualizacao(): boolean {
  return disponivel;
}

export function sinalizarAtualizacao(): void {
  if (disponivel) return;
  disponivel = true;
  ouvintes.forEach((cb) => cb(true));
}

export function assinarAtualizacao(cb: Ouvinte): () => void {
  ouvintes.add(cb);
  return () => { ouvintes.delete(cb); };
}

/* DEV only (removido do bundle de prod): o SW não registra em dev, então o
   banner só é testável disparando o sinal à mão no console */
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__atenvoSimularDeploy = sinalizarAtualizacao;
}
