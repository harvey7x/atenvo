/* =====================================================================
   DESFAZER (undo) global de nível único.
   A última ação REVERSÍVEL feita no sistema pode ser revertida por um
   botão no topo (Reviza). Cada mutation registra, no seu onSuccess, o
   INVERSO da ação — com o estado ANTERIOR capturado do cache (onMutate).
   Ações sem como reverter (WhatsApp enviado, reset de senha, importação
   em massa…) registram-se como BLOQUEADAS: o botão aparece, mas avisa
   honestamente que aquela não dá pra desfazer (nunca faz o inverso errado).
   Ações banais (marcar lida, abrir comprovante…) não mexem no slot.
   Nível único + em memória: some ao recarregar a página (é um "ctrl+Z"
   de socorro, não um histórico). ===================================================================== */
import { useSyncExternalStore } from 'react';

export type AcaoDesfazer =
  | { tipo: 'ok'; rotulo: string; destrutivo: boolean; inverso: () => Promise<void>; quando: number }
  | { tipo: 'bloqueada'; rotulo: string; motivo: string; quando: number };

let estado: AcaoDesfazer | null = null;
let executando = false; // enquanto roda o inverso, novas ações não se registram
let expiraTimer: ReturnType<typeof setTimeout> | null = null;
const ouvintes = new Set<() => void>();
const emitir = () => { for (const l of ouvintes) l(); };
const agora = () => { try { return Date.now(); } catch { return 0; } };

// TTL do slot: o desfazer some depois disso. Limita a janela em que um inverso
// poderia sobrescrever uma edição concorrente feita por outra pessoa/aba.
// 5 min (era 2): no teste real, quem move um ciclo confere as outras telas
// (calendário, ficha) ANTES de decidir desfazer — 2 min expirava no meio.
const TTL_MS = 300000; // 5 min
function agendarExpiracao(quando: number) {
  if (expiraTimer) clearTimeout(expiraTimer);
  try { expiraTimer = setTimeout(() => { if (estado && estado.quando === quando) { estado = null; emitir(); } }, TTL_MS); } catch { /* sem timer: ok */ }
}

/** registra o inverso da última ação reversível (chamado no onSuccess da mutation) */
export function registrarDesfazer(a: { rotulo: string; destrutivo?: boolean; inverso: () => Promise<void> }) {
  if (executando) return;
  const quando = agora();
  estado = { tipo: 'ok', rotulo: a.rotulo, destrutivo: !!a.destrutivo, inverso: a.inverso, quando };
  agendarExpiracao(quando);
  emitir();
}

/** a última ação NÃO tem como ser desfeita (envio, reset, import em massa…) */
export function registrarBloqueada(rotulo: string, motivo = 'Essa ação não tem como ser desfeita.') {
  if (executando) return;
  const quando = agora();
  estado = { tipo: 'bloqueada', rotulo, motivo, quando };
  agendarExpiracao(quando);
  emitir();
}

export function limparDesfazer() { estado = null; emitir(); }
export function lerDesfazer(): AcaoDesfazer | null { return estado; }

function subscrever(cb: () => void) { ouvintes.add(cb); return () => { ouvintes.delete(cb); }; }

/** liga o React ao slot (re-renderiza o botão quando muda) */
export function useDesfazerEstado(): AcaoDesfazer | null {
  return useSyncExternalStore(subscrever, lerDesfazer, lerDesfazer);
}

/** executa o inverso da ação atual. Marca `executando` p/ o inverso não
    se registrar de novo (nível único, sem "refazer"); limpa o slot ao fim.
    Lança se o inverso falhar (o chamador mostra o erro e mantém o slot).
    `esperado` (o `quando` da ação que o usuário CONFIRMOU): se o slot trocou
    nesse meio-tempo, NÃO executa o inverso errado — devolve false. */
export async function executarDesfazer(esperado?: number): Promise<boolean> {
  const a = estado;
  if (!a || a.tipo !== 'ok') return false;
  if (esperado !== undefined && a.quando !== esperado) return false;
  executando = true;
  try {
    await a.inverso();
    estado = null; // só limpa se deu certo
    emitir();
    return true;
  } finally {
    executando = false;
  }
}
