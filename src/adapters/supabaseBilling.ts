import type { BillingProvider, BillingSnapshot, ResourceKind, AddOnPreview, ResourceCounts, SubscriptionStatus, SubscriptionInfo, ChargeRow } from '@/types/billing';
import { monthlyTotal, priceOf } from '@/types/billing';
import { supabase } from '@/lib/supabase';

const ADDON: Record<ResourceKind, { label: string; description: string }> = {
  users: { label: 'Usuário adicional', description: 'Libera mais um acesso de usuário à plataforma.' },
  whatsapp: { label: 'WhatsApp adicional', description: 'Libera uma vaga para conectar outro número de WhatsApp.' },
  facebook: { label: 'Facebook adicional', description: 'Libera uma vaga para conectar outra página/conta do Facebook.' },
};

interface PlanoRow {
  nome: string; valor_base_centavos: number;
  preco_usuario_adicional_centavos: number; preco_whatsapp_adicional_centavos: number; preco_facebook_centavos: number;
  usuarios_incluidos: number; whatsapps_incluidos: number;
}
interface LimRow {
  usuarios_incluidos: number; usuarios_adicionais: number;
  whatsapps_incluidos: number; whatsapps_adicionais: number;
  facebook_incluidos: number;
  facebook_adicionais: number;
}

async function loadSnapshot(orgId: string): Promise<BillingSnapshot> {
  const sb = supabase!;
  const { data: plano, error: ep } = await sb
    .from('planos')
    .select('nome, valor_base_centavos, preco_usuario_adicional_centavos, preco_whatsapp_adicional_centavos, preco_facebook_centavos, usuarios_incluidos, whatsapps_incluidos')
    .eq('ativo', true).order('versao', { ascending: false }).limit(1).single<PlanoRow>();
  if (ep) throw new Error(ep.message);
  const { data: lim, error: el } = await sb
    .from('organizacao_limites')
    .select('usuarios_incluidos, usuarios_adicionais, whatsapps_incluidos, whatsapps_adicionais, facebook_incluidos, facebook_adicionais')
    .eq('organizacao_id', orgId).single<LimRow>();
  if (el) throw new Error(el.message);

  const [u, w, f] = await Promise.all([
    sb.from('organizacao_usuarios').select('id', { count: 'exact', head: true }).eq('organizacao_id', orgId).eq('status', 'ativo'),
    sb.from('canais').select('id', { count: 'exact', head: true }).eq('organizacao_id', orgId).eq('tipo', 'whatsapp').eq('ativo', true),
    sb.from('canais').select('id', { count: 'exact', head: true }).eq('organizacao_id', orgId).eq('tipo', 'facebook').eq('ativo', true),
  ]);

  // includes: vem do plano/limites (Facebook hoje e 100% adicional no modelo do banco)
  const includes: ResourceCounts = { users: lim.usuarios_incluidos, whatsapp: lim.whatsapps_incluidos, facebook: lim.facebook_incluidos };
  const addOns: ResourceCounts = { users: lim.usuarios_adicionais, whatsapp: lim.whatsapps_adicionais, facebook: lim.facebook_adicionais };
  const usage: ResourceCounts = { users: u.count ?? 0, whatsapp: w.count ?? 0, facebook: f.count ?? 0 };

  // estado da assinatura + histórico básico de cobranças
  const [assinRes, faturasRes] = await Promise.all([
    sb.from('assinaturas').select('status').eq('organizacao_id', orgId).maybeSingle(),
    sb.from('faturas').select('id, competencia, valor_centavos, status, criado_em').eq('organizacao_id', orgId).order('criado_em', { ascending: false }).limit(12),
  ]);
  const status = (assinRes.data?.status as SubscriptionStatus | undefined) ?? 'sem_assinatura';
  const subscription: SubscriptionInfo = { status, active: status === 'ativa' || status === 'isenta' };
  type FaturaRow = { id: string; competencia: string | null; valor_centavos: number; status: string; criado_em: string };
  const charges: ChargeRow[] = ((faturasRes.data as FaturaRow[] | null) ?? []).map((r) => ({
    id: r.id, date: r.criado_em ?? r.competencia ?? '', amount: (r.valor_centavos ?? 0) / 100, status: r.status,
  }));

  return {
    plan: { id: 'plano_atenvo', name: plano.nome, monthlyPrice: plano.valor_base_centavos / 100, includes },
    usage, addOns,
    addOnPrices: [
      { kind: 'users', label: ADDON.users.label, monthlyPrice: plano.preco_usuario_adicional_centavos / 100, description: ADDON.users.description },
      { kind: 'whatsapp', label: ADDON.whatsapp.label, monthlyPrice: plano.preco_whatsapp_adicional_centavos / 100, description: ADDON.whatsapp.description },
      { kind: 'facebook', label: ADDON.facebook.label, monthlyPrice: plano.preco_facebook_centavos / 100, description: ADDON.facebook.description },
    ],
    subscription, charges,
  };
}

/** Implementacao real (Supabase) do BillingProvider. Le plano/limites/uso reais;
 *  "contratar adicional" atualiza organizacao_limites (RLS exige admin da org) e
 *  recalcula o valor persistido da assinatura. Nao mexe em Asaas (fora de escopo). */
class SupabaseBillingProvider implements BillingProvider {
  readonly name = 'supabase';

  async getSnapshot(orgId: string): Promise<BillingSnapshot> {
    return loadSnapshot(orgId);
  }

  async previewAddOn(orgId: string, kind: ResourceKind, qty: number): Promise<AddOnPreview> {
    const s = await loadSnapshot(orgId);
    const unitPrice = priceOf(s, kind);
    const subtotal = unitPrice * qty;
    const current = monthlyTotal(s);
    return { kind, qty, unitPrice, subtotal, currentMonthlyTotal: current, newMonthlyTotal: current + subtotal };
  }

  async contractAddOn(orgId: string, _kind: ResourceKind, _qty: number): Promise<BillingSnapshot> {
    // Cobrança ainda não definida — o frontend não altera limites diretamente.
    return loadSnapshot(orgId);
  }

  async subscribePlan(_orgId: string): Promise<{ checkoutUrl: string }> {
    throw new Error('O meio de cobrança ainda não foi definido.');
  }

  async purchaseAddOn(_orgId: string, _kind: ResourceKind, _qty: number): Promise<{ checkoutUrl: string }> {
    throw new Error('O meio de cobrança ainda não foi definido.');
  }
}

export const supabaseBilling = new SupabaseBillingProvider();
