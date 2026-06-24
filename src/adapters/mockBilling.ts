import type { BillingProvider, BillingSnapshot, ResourceKind, AddOnPreview, SubscriptionInfo } from '@/types/billing';
import { monthlyTotal, priceOf } from '@/types/billing';
import { makeInitialSnapshot } from '@/data/demo';

const delay = (ms = 220) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Implementação MOCK do BillingProvider. Mantém o estado em memória por
 * organização. NÃO faz nenhuma chamada real (ex.: Asaas). "Contratar" apenas
 * incrementa o limite (vaga liberada) — não cria usuários nem conecta canais.
 */
class MockBillingProvider implements BillingProvider {
  readonly name = 'mock';
  private store = new Map<string, BillingSnapshot>();

  private get(orgId: string): BillingSnapshot {
    let s = this.store.get(orgId);
    if (!s) {
      s = makeInitialSnapshot(orgId);
      this.store.set(orgId, s);
    }
    if (!s.subscription) s.subscription = { status: 'sem_assinatura', active: false } as SubscriptionInfo;
    if (!s.charges) s.charges = [];
    return s;
  }

  async getSnapshot(orgId: string): Promise<BillingSnapshot> {
    await delay();
    return structuredClone(this.get(orgId));
  }

  async previewAddOn(orgId: string, kind: ResourceKind, qty: number): Promise<AddOnPreview> {
    await delay(120);
    const s = this.get(orgId);
    const unitPrice = priceOf(s, kind);
    const subtotal = unitPrice * qty;
    const current = monthlyTotal(s);
    return {
      kind,
      qty,
      unitPrice,
      subtotal,
      currentMonthlyTotal: current,
      newMonthlyTotal: current + subtotal,
    };
  }

  async contractAddOn(orgId: string, kind: ResourceKind, qty: number): Promise<BillingSnapshot> {
    await delay(360);
    const s = this.get(orgId);
    s.addOns[kind] += qty; // libera a(s) vaga(s); uso permanece igual
    this.store.set(orgId, s);
    return structuredClone(s);
  }

  // Mock (dev): sem Asaas real. Simula a confirmação imediata para o fluxo ficar
  // navegável; retorna checkoutUrl vazio para o frontend NÃO redirecionar.
  async subscribePlan(orgId: string): Promise<{ checkoutUrl: string }> {
    await delay(300);
    const s = this.get(orgId);
    s.subscription = { status: 'ativa', active: true };
    this.store.set(orgId, s);
    return { checkoutUrl: '' };
  }

  async purchaseAddOn(orgId: string, kind: ResourceKind, qty: number): Promise<{ checkoutUrl: string }> {
    await delay(300);
    const s = this.get(orgId);
    s.addOns[kind] += qty;
    this.store.set(orgId, s);
    return { checkoutUrl: '' };
  }
}

export const mockBilling: BillingProvider = new MockBillingProvider();
