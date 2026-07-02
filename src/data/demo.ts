import type { Plan, AddOnPrice, BillingSnapshot, ResourceCounts } from '@/types/billing';
import type { Organization, SessionUser } from '@/types/org';

/* ===== Plano-base e preços (decisões da fase funcional) ===== */
export const BASE_PLAN: Plan = {
  id: 'plan_atenvo_base',
  name: 'Plano Atenvo',
  monthlyPrice: 249.9,
  includes: { users: 2, whatsapp: 1, facebook: 1 },
};

export const ADDON_PRICES: AddOnPrice[] = [
  { kind: 'users', label: 'Usuário adicional', monthlyPrice: 19.9, description: 'Libera mais um acesso de usuário à plataforma.' },
  { kind: 'whatsapp', label: 'WhatsApp adicional', monthlyPrice: 49.9, description: 'Libera uma vaga para conectar outro número de WhatsApp.' },
  { kind: 'facebook', label: 'Facebook adicional', monthlyPrice: 49.9, description: 'Libera uma vaga para conectar outra página/conta do Facebook.' },
];

/* ===== Organizações de demonstração (multiempresa) ===== */
export const DEMO_USER: SessionUser = {
  id: 'usr_henrique',
  name: 'Henrique',
  email: 'henrique@atenvo.com',
  deveTrocarSenha: false,
};

export const DEMO_ORGS: Organization[] = [
  { id: 'org_demo', name: 'Empresa Demonstração', slug: 'empresa-demo', role: 'admin' },
  { id: 'org_matriz', name: 'Atenvo Matriz', slug: 'atenvo-matriz', role: 'gestor' },
];

/* Uso inicial simulado por organização (no limite do plano-base, para
   evidenciar limites e o fluxo de contratação de adicionais). */
const initialUsage: Record<string, ResourceCounts> = {
  org_demo: { users: 2, whatsapp: 1, facebook: 1 },
  org_matriz: { users: 1, whatsapp: 1, facebook: 0 },
};
const initialAddOns: Record<string, ResourceCounts> = {
  org_demo: { users: 0, whatsapp: 0, facebook: 0 },
  org_matriz: { users: 0, whatsapp: 0, facebook: 0 },
};

export function makeInitialSnapshot(orgId: string): BillingSnapshot {
  const usage = initialUsage[orgId] ?? { users: 1, whatsapp: 1, facebook: 0 };
  const addOns = initialAddOns[orgId] ?? { users: 0, whatsapp: 0, facebook: 0 };
  return {
    plan: BASE_PLAN,
    usage: { ...usage },
    addOns: { ...addOns },
    addOnPrices: ADDON_PRICES,
  };
}
