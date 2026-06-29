// Modo demonstração: ativado apenas quando VITE_DEMO_MODE === 'true' (build do site demo).
// Em produção a flag é falsa e nada muda. Bloqueia integrações externas reais e identifica o ambiente.
export const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true';
export const MSG_SIMULADO = 'Esta ação está simulada no ambiente de demonstração.';

/** Erro padrão para ações que chamariam integrações externas reais (WhatsApp/Facebook/envios/pagamentos). */
export function acaoSimulada(): Error {
  const e = new Error(MSG_SIMULADO);
  (e as Error & { simulado?: boolean }).simulado = true;
  return e;
}
export function ehSimulado(e: unknown): boolean {
  return !!(e as { simulado?: boolean })?.simulado;
}
