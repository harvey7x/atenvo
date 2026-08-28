/* Intro do dia (pedido do dono 28/08): na PRIMEIRA entrada de cada dia o
   sistema recebe o atendente — saudação pelo nome, escolha de cor/modo Leve
   e o briefing de atendimentos. O "reset da meia-noite" não precisa de cron:
   a chave guarda a DATA LOCAL da última exibição; virou o dia, a comparação
   falha e a intro volta. Chave por usuário, mesmo padrão de tema.ts. */

const PREFIXO = 'atenvo-intro';
const chaveIntro = (escopo?: string): string => (escopo ? `${PREFIXO}:${escopo}` : PREFIXO);

/** Data LOCAL (não UTC: o dia do atendente vira à meia-noite DELE). */
export function hojeLocal(agora = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${agora.getFullYear()}-${p(agora.getMonth() + 1)}-${p(agora.getDate())}`;
}

export function deveMostrarIntroDia(escopo?: string): boolean {
  try {
    return localStorage.getItem(chaveIntro(escopo)) !== hojeLocal();
  } catch {
    /* storage indisponível: sem como lembrar "já vi" — melhor não insistir a cada load */
    return false;
  }
}

export function marcarIntroVista(escopo?: string): void {
  try {
    localStorage.setItem(chaveIntro(escopo), hojeLocal());
  } catch {
    /* sem persistir: a intro volta no próximo load, aceitável */
  }
}

export function saudacaoPorHora(agora = new Date()): string {
  const h = agora.getHours();
  if (h >= 6 && h < 12) return 'Bom dia';
  if (h >= 12 && h < 18) return 'Boa tarde';
  return 'Boa noite';
}
