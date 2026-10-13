/* ============================================================================
   Períodos do extrato de pagamento (Meu INSS) — regra do dono (13/10/2026).
   Cada consulta cobre UM ANO INTEIRO (12 meses):
     fim    = mês atual do ano atual;
     início = mês seguinte, um ano antes  (= fim − 11 meses).
   Ex.: em out/2026 → nov/2025 a out/2026. Em dez/2026 → jan/2026 a dez/2026.
   Depois é só ir descendo um ano por vez, mantendo os meses, até cobrir 10 anos.
   ============================================================================ */

export const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'] as const;
export const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'] as const;

/** mes: 1..12 */
export type MesAno = { mes: number; ano: number };
export type Periodo = { inicio: MesAno; fim: MesAno };

function somarMeses({ mes, ano }: MesAno, n: number): MesAno {
  const t = ano * 12 + (mes - 1) + n;
  return { mes: (((t % 12) + 12) % 12) + 1, ano: Math.floor(t / 12) };
}

/** Os períodos de 12 meses, do mais recente para o mais antigo. */
export function periodosDoExtrato(hoje: MesAno, anos = 10): Periodo[] {
  return Array.from({ length: anos }, (_, i) => {
    const fim = somarMeses(hoje, -12 * i);
    return { inicio: somarMeses(fim, -11), fim };
  });
}

/** "11/2025" — o formato que o campo do Meu INSS pede. */
export function mmaaaa({ mes, ano }: MesAno): string {
  return `${String(mes).padStart(2, '0')}/${ano}`;
}
