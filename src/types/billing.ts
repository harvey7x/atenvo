/* Domínio de cobrança da ASSINATURA Atenvo (plano + uso + adicionais).
   NÃO confundir com a página "Cobranças" (que trata das cobranças que a
   organização faz aos seus próprios clientes). Aqui é o plano da Atenvo. */

export type ResourceKind = 'users' | 'whatsapp' | 'facebook';

export interface ResourceCounts {
  users: number;
  whatsapp: number;
  facebook: number;
}

export interface Plan {
  id: string;
  name: string;
  /** valor mensal base em BRL */
  monthlyPrice: number;
  /** limites inclusos no plano-base */
  includes: ResourceCounts;
}

export interface AddOnPrice {
  kind: ResourceKind;
  label: string;
  /** valor mensal por unidade adicional, em BRL */
  monthlyPrice: number;
  description: string;
}

/** Estado da assinatura da organização (espelha o enum assinatura_status do banco). */
export type SubscriptionStatus =
  | 'sem_assinatura'
  | 'aguardando_pagamento'
  | 'ativa'
  | 'em_atraso'
  | 'cancelada'
  | 'isenta'
  | 'teste';

/** Linha de histórico de cobrança (fatura/pagamento da assinatura Atenvo). */
export interface ChargeRow {
  id: string;
  date: string;        // ISO
  amount: number;      // BRL
  status: string;      // aberta | paga | cancelada | ...
}

export interface SubscriptionInfo {
  status: SubscriptionStatus;
  /** true quando a organização pode operar (ativa ou isenta). */
  active: boolean;
}

export interface BillingSnapshot {
  plan: Plan;
  /** uso atual por recurso */
  usage: ResourceCounts;
  /** adicionais já contratados por recurso */
  addOns: ResourceCounts;
  addOnPrices: AddOnPrice[];
  /** estado da assinatura (opcional: ausente no mock antigo). */
  subscription?: SubscriptionInfo;
  /** histórico básico de cobranças (opcional). */
  charges?: ChargeRow[];
}

export interface AddOnPreview {
  kind: ResourceKind;
  qty: number;
  unitPrice: number;
  subtotal: number;
  currentMonthlyTotal: number;
  newMonthlyTotal: number;
}

/**
 * Provedor de cobrança/assinatura. A implementação real (ex.: Asaas) NÃO é
 * feita nesta fase — usamos apenas a implementação mock com dados simulados.
 * Nenhuma credencial real trafega por esta interface.
 */
export interface BillingProvider {
  readonly name: string;
  getSnapshot(orgId: string): Promise<BillingSnapshot>;
  previewAddOn(orgId: string, kind: ResourceKind, qty: number): Promise<AddOnPreview>;
  /** Apenas contrata a vaga (atualiza o limite). NÃO conecta canais nem cria usuários. */
  contractAddOn(orgId: string, kind: ResourceKind, qty: number): Promise<BillingSnapshot>;
  /** Inicia o checkout recorrente do plano-base no Asaas. Retorna a URL para redirecionar.
   *  A ativação NÃO acontece aqui — somente no webhook de pagamento confirmado. */
  subscribePlan(orgId: string): Promise<{ checkoutUrl: string }>;
  /** Inicia o checkout de um adicional no Asaas. A vaga só é liberada após o webhook. */
  purchaseAddOn(orgId: string, kind: ResourceKind, qty: number): Promise<{ checkoutUrl: string }>;
}

/* Helpers de cálculo reaproveitáveis */
export function effectiveLimit(s: BillingSnapshot, kind: ResourceKind): number {
  return s.plan.includes[kind] + s.addOns[kind];
}
export function priceOf(s: BillingSnapshot, kind: ResourceKind): number {
  const p = s.addOnPrices.find((a) => a.kind === kind);
  return p ? p.monthlyPrice : 0;
}
export function monthlyTotal(s: BillingSnapshot): number {
  const add =
    s.addOns.users * priceOf(s, 'users') +
    s.addOns.whatsapp * priceOf(s, 'whatsapp') +
    s.addOns.facebook * priceOf(s, 'facebook');
  return s.plan.monthlyPrice + add;
}
