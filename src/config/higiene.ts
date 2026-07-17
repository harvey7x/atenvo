/* ═══════════════════════════════════════════════════════════════════════════
 * CONFIGURAÇÃO OPERACIONAL — Higiene obrigatória da conversa
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O QUE É
 * A data de CORTE separa dois mundos na regra de "conversa sem responsável":
 *   · conversa criada A PARTIR do corte  → é NOVA  → bloqueia o envio no dia 1;
 *   · conversa criada ANTES do corte     → é ANTIGA → só alerta durante os
 *     `DIAS_ADAPTACAO` (janela do mutirão) e passa a bloquear depois.
 *
 * POR QUE EXISTE
 * Na auditoria de 2026-07, 72% das conversas ativas estavam sem responsável.
 * Ligar bloqueio duro nelas de uma vez pararia a operação e empurraria a equipe
 * para o celular — que já concentra 87% do atendimento e é a própria doença que
 * a regra tenta curar. O corte é o que torna a entrada progressiva possível.
 *
 * COMO ALTERAR
 *   1. Preferido: defina `VITE_HIGIENE_CORTE_ISO` no ambiente, com a data do
 *      deploy em ISO 8601 e fuso explícito. Ex.: 2026-08-01T00:00:00-03:00
 *   2. Sem env, vale `CORTE_PADRAO` abaixo. Se o deploy for em outra data,
 *      ATUALIZE a constante — senão a janela de adaptação termina fora de hora.
 *
 * IMPACTO DE ERRAR
 *   · corte muito no PASSADO  → a adaptação já expirou: bloqueia todo mundo no
 *     dia 1, exatamente o que a entrada progressiva existe para evitar;
 *   · corte muito no FUTURO   → nenhuma conversa é "nova": ninguém bloqueia e a
 *     regra vira só um aviso decorativo.
 *
 * POR QUE NÃO USAR `new Date()` COMO FALLBACK
 * Seria um corte MÓVEL: a cada carregamento da página o fim da adaptação seria
 * empurrado para "hoje + 7", e o bloqueio das conversas antigas NUNCA chegaria.
 * A data de build também não serve: cada rebuild reiniciaria a adaptação.
 * Por isso o fallback é uma constante fixa, versionada e auditável.
 * ═══════════════════════════════════════════════════════════════════════════ */

/** Fallback versionado. Trocar junto com o deploy quando a data mudar. */
export const CORTE_PADRAO = '2026-07-17T00:00:00-03:00';
/** Dias de alerta (mutirão) para as conversas que já existiam antes do corte. */
export const DIAS_ADAPTACAO_PADRAO = 7;

export interface CorteResolvido {
  iso: string;
  origem: 'env' | 'padrao';
  /** false quando a env veio preenchida mas inválida (caímos no padrão) */
  envValida: boolean;
}

/** ISO 8601 ESTRITO: 2026-08-01 ou 2026-08-01T00:00:00-03:00.
 *  Não basta `new Date(v)` não ser inválida: `new Date('01/09/2026')` vira 9 de JANEIRO
 *  (formato americano). Quem digitasse "1º de setembro" no padrão brasileiro moveria o
 *  corte em 8 meses sem nenhum erro. Formato livre aqui é armadilha — exigimos ISO. */
const RE_ISO = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/;

/** Puro e testável: resolve a data de corte a partir do valor de ambiente. */
export function resolverCorte(env: string | undefined | null): CorteResolvido {
  const v = (env ?? '').trim();
  if (!v) return { iso: CORTE_PADRAO, origem: 'padrao', envValida: true };
  if (!RE_ISO.test(v)) return { iso: CORTE_PADRAO, origem: 'padrao', envValida: false };
  const ms = new Date(v).getTime();
  if (Number.isNaN(ms)) return { iso: CORTE_PADRAO, origem: 'padrao', envValida: false };
  return { iso: new Date(ms).toISOString(), origem: 'env', envValida: true };
}

/** Puro e testável: resolve os dias de adaptação (inteiro >= 0). */
export function resolverDiasAdaptacao(env: string | undefined | null): number {
  const v = (env ?? '').trim();
  if (!v) return DIAS_ADAPTACAO_PADRAO;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return DIAS_ADAPTACAO_PADRAO;
  return Math.floor(n);
}

const corte = resolverCorte(import.meta.env?.VITE_HIGIENE_CORTE_ISO as string | undefined);

if (!corte.envValida && import.meta.env?.DEV) {
  // Falha barulhenta em dev: env preenchida e inválida é erro de configuração, não detalhe.
  console.warn(`[higiene] VITE_HIGIENE_CORTE_ISO inválida — usando o padrão ${CORTE_PADRAO}.`);
}

/** Data de corte em vigor (env > padrão). */
export const HIGIENE_CORTE_ISO = corte.iso;
/** De onde veio o corte — exibido no diagnóstico/rodapé quando útil. */
export const HIGIENE_CORTE_ORIGEM = corte.origem;
/** Janela de adaptação em vigor. */
export const HIGIENE_DIAS_ADAPTACAO = resolverDiasAdaptacao(import.meta.env?.VITE_HIGIENE_DIAS_ADAPTACAO as string | undefined);
