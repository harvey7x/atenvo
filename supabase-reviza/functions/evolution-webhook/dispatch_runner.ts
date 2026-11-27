// REVIZA (23/11): cópia da função do Atenvo que está no ar, adaptada ao Reviza por
// ~/reviza-sist/porte-atendimento/porta-funcoes.py — conexões "revizaatd_", tabela atd_integracoes, pasta atd-midia.
// dispatch_runner.ts — o despacho do webhook ao bot-runner COM repetição quando o runner devolve `lock_ativo`.
// Puro (sem Deno/DB): quem chama passa a função que faz o fetch.
//
// Por que: o runner pega um lock de 30 s por conversa e o mantém enquanto ainda envia os balões do passo anterior (~20 s). O cliente que já sabe o que vem
// depois (manda o CPF logo depois do nome) responde nessa janela, o runner devolve { skipped: 'lock_ativo' } e a mensagem NUNCA era reprocessada (12–25 por
// dia entre 08 e 15/11, leitura da Iris). O formulário do anúncio já tentava de novo (4 × 5 s); texto e áudio faziam UMA tentativa. Cada tentativa é uma execução
// NOVA do runner: relê o estado, refaz a checagem de inbound duplicado (ultimo_inbound_msg_id) e as guardas (pausado, humano, sessão de IA).
export interface OpcoesDespacho {
  tentativas: number;                              // total de chamadas (>= 1)
  esperaMs: number;                                // espera entre uma tentativa e a seguinte
  dormir?: (ms: number) => Promise<void>;          // injetável nos testes
}
export interface ResultadoDespacho {
  tentativas: number;                              // quantas chamadas foram feitas
  skipped: string | null;                          // o `skipped` da última resposta (null = o runner processou)
  esgotou: boolean;                                // acabaram as tentativas ainda com lock_ativo
}

export async function despacharAoRunner(
  chamar: () => Promise<{ skipped?: string } | null>,
  o: OpcoesDespacho,
): Promise<ResultadoDespacho> {
  const dormir = o.dormir ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const total = Math.max(1, Math.floor(o.tentativas));
  let skipped: string | null = null;
  for (let i = 0; i < total; i++) {
    if (i > 0) await dormir(o.esperaMs);
    const rj = await chamar();
    skipped = typeof rj?.skipped === 'string' ? rj.skipped : null;
    if (skipped !== 'lock_ativo') return { tentativas: i + 1, skipped, esgotou: false };
  }
  return { tentativas: total, skipped, esgotou: true };
}

/** Texto/áudio esperam o lock do passo anterior (~20 s, lease de 30 s): 10 × 3 s. Formulário: 4 × 5 s, como sempre. */
export const DESPACHO_TEXTO = { tentativas: 10, esperaMs: 3000 } as const;
export const DESPACHO_FORMULARIO = { tentativas: 4, esperaMs: 5000 } as const;
