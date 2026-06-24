import { useEffect, useMemo, useState } from 'react';
import { billing } from '@/adapters';
import { useOrg } from '@/context/OrgContext';
import { useToast } from '@/hooks/useToast';
import { Icon, type IconName } from '@/components/icons';
import {
  type BillingSnapshot, type ResourceKind, type SubscriptionStatus,
  effectiveLimit, monthlyTotal, priceOf,
} from '@/types/billing';

const brl = (n: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);

const META: Record<ResourceKind, { label: string; plural: string; icon: IconName; cls: string }> = {
  users: { label: 'Usuário', plural: 'Usuários', icon: 'users', cls: 'us' },
  whatsapp: { label: 'WhatsApp', plural: 'WhatsApp', icon: 'whatsapp', cls: 'wa' },
  facebook: { label: 'Facebook', plural: 'Facebook', icon: 'facebook', cls: 'fb' },
};
const ORDER: ResourceKind[] = ['users', 'whatsapp', 'facebook'];

const STATUS: Record<SubscriptionStatus, { t: string; bg: string; fg: string }> = {
  sem_assinatura: { t: 'Sem assinatura', bg: 'rgba(140,150,170,.16)', fg: '#9aa3b2' },
  aguardando_pagamento: { t: 'Aguardando pagamento', bg: 'rgba(245,176,65,.16)', fg: '#f5b041' },
  ativa: { t: 'Ativa', bg: 'rgba(25,195,125,.16)', fg: '#19C37D' },
  em_atraso: { t: 'Atrasada', bg: 'rgba(245,176,65,.18)', fg: '#f5b041' },
  cancelada: { t: 'Cancelada', bg: 'rgba(231,76,60,.16)', fg: '#e74c3c' },
  isenta: { t: 'Ativa', bg: 'rgba(25,195,125,.16)', fg: '#19C37D' },
  teste: { t: 'Período de teste', bg: 'rgba(140,150,170,.16)', fg: '#9aa3b2' },
};

export function PlanoUso() {
  const { currentOrg } = useOrg();
  const { toast } = useToast();
  const [snap, setSnap] = useState<BillingSnapshot | null>(null);
  const [qty, setQty] = useState<Record<ResourceKind, number>>({ users: 1, whatsapp: 1, facebook: 1 });

  useEffect(() => {
    let active = true;
    setSnap(null);
    billing.getSnapshot(currentOrg.id).then((s) => { if (active) setSnap(s); });
    return () => { active = false; };
  }, [currentOrg.id]);

  const total = useMemo(() => (snap ? monthlyTotal(snap) : 0), [snap]);
  const status: SubscriptionStatus = snap?.subscription?.status ?? 'ativa';

  // Cobrança ainda não definida: contratar adicional apenas informa (sem checkout).
  function contract(_kind: ResourceKind) {
    toast('A contratação de adicionais entra quando o meio de cobrança for definido.');
  }

  if (!snap) return <div className="center-screen">Carregando plano…</div>;
  const st = STATUS[status];

  return (
    <div className="wrap">
      {/* Plano + total */}
      <div className="plan-hero">
        <div className="card">
          <div className="card-body">
            <div className="plan-head">
              <span className="nm">{snap.plan.name}
                <span style={{ marginLeft: 10, padding: '3px 10px', borderRadius: 999, fontSize: 12, fontWeight: 600, background: st.bg, color: st.fg, verticalAlign: 'middle' }}>{st.t}</span>
              </span>
              <span className="pr">{brl(snap.plan.monthlyPrice)}<small>/mês</small></span>
            </div>
            <ul className="plan-incl">
              <li><Icon name="check" />{snap.plan.includes.users} usuários inclusos</li>
              <li><Icon name="check" />{snap.plan.includes.whatsapp} WhatsApp incluso</li>
              <li><Icon name="check" />{snap.plan.includes.facebook} Facebook incluso</li>
              <li><Icon name="check" />Acesso aos módulos principais</li>
            </ul>
          </div>
        </div>
        <div className="card total-card">
          <div className="card-body">
            <div className="tl">Total mensal estimado</div>
            <div className="tv">{brl(total)}</div>
            <div className="tb">
              Plano-base {brl(snap.plan.monthlyPrice)}
              {total > snap.plan.monthlyPrice ? ` + ${brl(total - snap.plan.monthlyPrice)} em adicionais` : ' · sem adicionais'}.
            </div>
          </div>
        </div>
      </div>

      {/* Uso e limites */}
      <h2 className="section-title">Uso e limites</h2>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-body">
          <div className="usage-grid">
            {ORDER.map((k) => {
              const used = snap.usage[k];
              const limit = effectiveLimit(snap, k);
              const ratio = limit > 0 ? used / limit : 0;
              const cls = ratio >= 1 ? 'warn' : '';
              const extra = snap.addOns[k];
              return (
                <div className="usage-item" key={k}>
                  <div className="ul">
                    <span className="nm">{META[k].plural}</span>
                    <b>{used} de {limit}</b>
                  </div>
                  <div className="progress"><i className={cls} style={{ width: `${Math.min(100, ratio * 100)}%` }} /></div>
                  <div className="hint">
                    {snap.plan.includes[k]} incluso(s){extra > 0 ? ` + ${extra} adicional(is)` : ''}
                    {ratio >= 1 ? ' · no limite' : ''}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Adicionais */}
      <h2 className="section-title">Contratar adicionais</h2>
      <div className="addon-grid" style={{ marginBottom: 16 }}>
        {ORDER.map((k) => {
          const price = priceOf(snap, k);
          const sub = price * qty[k];
          const def = snap.addOnPrices.find((a) => a.kind === k);
          return (
            <div className="addon" key={k}>
              <div className="at">
                <span className={`ai ${META[k].cls}`}><Icon name={META[k].icon} /></span>
                <div>
                  <div className="nm">{def?.label}</div>
                  <div className="pr">{brl(price)}/mês por unidade</div>
                </div>
              </div>
              <div className="ad">{def?.description}</div>
              <div className="actions">
                <div className="stepper">
                  <button onClick={() => setQty((q) => ({ ...q, [k]: Math.max(1, q[k] - 1) }))} disabled={qty[k] <= 1} aria-label="Diminuir">−</button>
                  <span className="q">{qty[k]}</span>
                  <button onClick={() => setQty((q) => ({ ...q, [k]: q[k] + 1 }))} aria-label="Aumentar">+</button>
                </div>
                <div className="sub">
                  <div className="sl">Subtotal</div>
                  <div className="sv">{brl(sub)}</div>
                </div>
              </div>
              <button className="btn btn-primary btn-block" style={{ marginTop: 14 }} onClick={() => contract(k)}>
                Contratar adicional
              </button>
            </div>
          );
        })}
      </div>

      <div className="info-note">
        <Icon name="lock" />
        <div className="tx">
          <b>Plano e uso</b> trata da assinatura da sua organização na Atenvo (plano-base e adicionais) — diferente de <b>Cobranças</b>, que gerencia as cobranças que a sua organização faz aos próprios clientes. O meio de pagamento da assinatura ainda está sendo definido; por enquanto a contratação de adicionais é apenas informativa.
        </div>
      </div>
    </div>
  );
}
