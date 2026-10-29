import { resolvePeriodo, spHoje, addDias, type Periodo, type Preset } from '@/data/relatorios';

/* ------------------------------------------------------------------
   Períodos do Dashboard. A matemática é a de @/data/relatorios — a janela
   do Dashboard significa exatamente o mesmo que a de Relatórios (fim
   exclusivo, fuso SP). A camada de dados da tela está em
   @/data/dashboardV5 (RPC dashboard_v5); o v3 (dashboard_resumo e os
   painéis de IA/drill-down) saiu com o Dashboard v5 em 21/10.
   ------------------------------------------------------------------ */

/** Janelas do dono (10/09): diário, 3 dias, 7 dias e o mês COMERCIAL da casa
 *  (dia 11 → dia 10, o mesmo do CAF, navegável por ‹ › via mesCaf). Personalizado cobre o resto. */
export type PresetDash = 'hoje' | '3d' | '7d' | 'mes_caf' | 'custom';

export function periodoDash(preset: PresetDash, ini?: string, fim?: string, mesCaf = 0): Periodo {
  if (preset === 'custom') {
    const h = spHoje();
    return resolvePeriodo('custom', ini || addDias(h, -6), fim || h);
  }
  return resolvePeriodo(preset as Preset, undefined, undefined, mesCaf);
}
