import { useCallback, useEffect, useMemo, useState } from 'react';
import { billing } from '@/adapters';
import { useOrg } from '@/context/OrgContext';
import {
  type BillingSnapshot, type ResourceKind, type SubscriptionStatus,
  effectiveLimit, monthlyTotal, priceOf,
} from '@/types/billing';
import { BadgeStatus, BotaoSec, CardVidro, EstadoErro, Skeleton, type TomStatus } from '../components';
import { ICONES } from '../shell/icones';
import './planoUso.css';

const brl = (n: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);

/* Mesmos rótulos e ordem da página antiga; ícones da família da sidebar. */
const META: Record<ResourceKind, { plural: string; icone: keyof typeof ICONES }> = {
  users: { plural: 'Usuários', icone: 'contatos' },
  whatsapp: { plural: 'WhatsApp', icone: 'whatsapp' },
  facebook: { plural: 'Facebook', icone: 'facebook' },
};
const ORDEM: ResourceKind[] = ['users', 'whatsapp', 'facebook'];

/* Rótulos idênticos aos da página antiga; tons mapeados à semântica Platina. */
const STATUS: Record<SubscriptionStatus, { rotulo: string; tom: TomStatus }> = {
  sem_assinatura: { rotulo: 'Sem assinatura', tom: 'neutro' },
  aguardando_pagamento: { rotulo: 'Aguardando pagamento', tom: 'atencao' },
  ativa: { rotulo: 'Ativa', tom: 'ok' },
  em_atraso: { rotulo: 'Atrasada', tom: 'atencao' },
  cancelada: { rotulo: 'Cancelada', tom: 'erro' },
  isenta: { rotulo: 'Ativa', tom: 'ok' },
  teste: { rotulo: 'Período de teste', tom: 'neutro' },
};

/** Barra .fill do mockup: anima de 0 até o percentual real; ≥80% fica âmbar. */
function Medidor({ rotulo, usado, limite, nota, notaLimite }: {
  rotulo: string;
  usado: number;
  limite: number;
  nota: string;
  notaLimite: boolean;
}) {
  const pct = limite > 0 ? Math.min(100, (usado / limite) * 100) : 0;
  const [largura, setLargura] = useState(0);
  useEffect(() => {
    const t = window.setTimeout(() => setLargura(pct), 30);
    return () => window.clearTimeout(t);
  }, [pct]);
  return (
    <div className="medidor">
      <div className="l">
        <b>{rotulo}</b>
        <span className="num">{usado} de {limite}</span>
      </div>
      <div className="trilho2">
        <div className={pct >= 80 ? 'fill alto' : 'fill'} style={{ width: `${largura}%` }} />
      </div>
      <div className="nota-m">
        {nota}
        {notaLimite && <span className="lim"> · no limite</span>}
      </div>
    </div>
  );
}

function Carregando() {
  return (
    <div className="grade" style={{ gridTemplateColumns: '5fr 7fr' }}>
      <CardVidro className="plano-atual">
        <Skeleton largura="45%" altura={15} />
        <div style={{ margin: '14px 0' }}><Skeleton largura="35%" altura={23} /></div>
        <Skeleton largura="80%" />
        <div style={{ marginTop: 9 }}><Skeleton largura="70%" /></div>
        <div style={{ marginTop: 9 }}><Skeleton largura="75%" /></div>
      </CardVidro>
      <CardVidro style={{ padding: '17px 18px' }}>
        <Skeleton largura="30%" altura={13} />
        {[0, 1, 2].map((i) => (
          <div key={i} style={{ marginTop: 18 }}>
            <Skeleton largura="100%" altura={5} raio={99} />
            <div style={{ marginTop: 7 }}><Skeleton largura="40%" altura={10} /></div>
          </div>
        ))}
      </CardVidro>
    </div>
  );
}

/**
 * Plano e uso v2 — layout do pg-planos; funcional da página antiga
 * (billing.getSnapshot + helpers puros de src/types/billing.ts).
 * Sem renovação/cartão/faturas/projeção: a página antiga não tem esses
 * dados e nada é inventado.
 */
export default function PlanoUsoV2() {
  const { currentOrg } = useOrg();
  const [snap, setSnap] = useState<BillingSnapshot | null>(null);
  const [erro, setErro] = useState(false);
  const [qty, setQty] = useState<Record<ResourceKind, number>>({ users: 1, whatsapp: 1, facebook: 1 });
  const [aviso, setAviso] = useState<string | null>(null);

  const carregar = useCallback(() => {
    let ativo = true;
    setErro(false);
    setSnap(null);
    billing.getSnapshot(currentOrg.id)
      .then((s) => { if (ativo) setSnap(s); })
      .catch(() => { if (ativo) setErro(true); });
    return () => { ativo = false; };
  }, [currentOrg.id]);

  useEffect(() => carregar(), [carregar]);

  const total = useMemo(() => (snap ? monthlyTotal(snap) : 0), [snap]);
  const status: SubscriptionStatus = snap?.subscription?.status ?? 'ativa';
  const st = STATUS[status];

  // Cobrança ainda não definida: contratar adicional apenas informa (comportamento
  // real da página antiga — lá era toast; aqui é aviso inline no padrão do cartão).
  function contratar(_kind: ResourceKind) {
    setAviso('A contratação de adicionais entra quando o meio de cobrança for definido.');
  }

  return (
    <>
      <div className="ph sobe">
        <div>
          <h2>Plano e uso</h2>
          <p>assinatura da {currentOrg.name}</p>
        </div>
      </div>

      {erro ? (
        <CardVidro sobe>
          <EstadoErro
            descricao="Não conseguimos carregar os dados do plano. Verifique a conexão."
            aoTentarDeNovo={carregar}
          />
        </CardVidro>
      ) : !snap ? (
        <Carregando />
      ) : (
        <>
          <div className="grade sobe" style={{ gridTemplateColumns: '5fr 7fr', animationDelay: '.08s' }}>
            <CardVidro spot className="plano-atual">
              <div className="l1">
                <span className="n">{snap.plan.name}</span>
                <BadgeStatus tom={st.tom}>{st.rotulo}</BadgeStatus>
              </div>
              <div className="preco num">{brl(snap.plan.monthlyPrice)}<small>/mês</small></div>
              <div className="cfg-div" />
              <ul className="plano-incl">
                <li><i aria-hidden>✓</i>{snap.plan.includes.users} usuários inclusos</li>
                <li><i aria-hidden>✓</i>{snap.plan.includes.whatsapp} WhatsApp incluso</li>
                <li><i aria-hidden>✓</i>{snap.plan.includes.facebook} Facebook incluso</li>
                <li><i aria-hidden>✓</i>Acesso aos módulos principais</li>
              </ul>
              <div className="cfg-div" />
              <div className="r">Total mensal estimado</div>
              <div className="preco num" style={{ fontSize: 19, margin: '4px 0 2px' }}>{brl(total)}</div>
              <div className="r num">
                Plano-base {brl(snap.plan.monthlyPrice)}
                {total > snap.plan.monthlyPrice ? ` + ${brl(total - snap.plan.monthlyPrice)} em adicionais` : ' · sem adicionais'}.
              </div>
            </CardVidro>

            <CardVidro spot style={{ padding: '17px 18px' }}>
              <div className="cfg-sec" style={{ marginBottom: 15 }}>Uso e limites</div>
              {ORDEM.map((k) => {
                const usado = snap.usage[k];
                const limite = effectiveLimit(snap, k);
                const extra = snap.addOns[k];
                return (
                  <Medidor
                    key={k}
                    rotulo={META[k].plural}
                    usado={usado}
                    limite={limite}
                    nota={`${snap.plan.includes[k]} incluso(s)${extra > 0 ? ` + ${extra} adicional(is)` : ''}`}
                    notaLimite={limite > 0 && usado / limite >= 1}
                  />
                );
              })}
            </CardVidro>
          </div>

          <div className="sobe" style={{ marginTop: 22, animationDelay: '.16s' }}>
            <span className="caps" style={{ display: 'block', marginBottom: 12 }}>Contratar adicionais</span>
            {aviso && (
              <div className="aviso-inline" role="status">
                {aviso}
                <button type="button" onClick={() => setAviso(null)} aria-label="Fechar aviso">×</button>
              </div>
            )}
            <div className="grade addons">
              {ORDEM.map((k) => {
                const preco = priceOf(snap, k);
                const sub = preco * qty[k];
                const def = snap.addOnPrices.find((a) => a.kind === k);
                return (
                  <CardVidro spot className="p-addon" key={k}>
                    <div className="l1">
                      <span className="ic">{ICONES[META[k].icone]}</span>
                      <div>
                        <div className="nm">{def?.label}</div>
                        <div className="pr num">{brl(preco)}/mês por unidade</div>
                      </div>
                    </div>
                    <div className="ds">{def?.description}</div>
                    <div className="rodo">
                      <div className="p-stepper">
                        <button
                          type="button"
                          onClick={() => setQty((q) => ({ ...q, [k]: Math.max(1, q[k] - 1) }))}
                          disabled={qty[k] <= 1}
                          aria-label="Diminuir"
                        >−</button>
                        <span className="q num">{qty[k]}</span>
                        <button
                          type="button"
                          onClick={() => setQty((q) => ({ ...q, [k]: q[k] + 1 }))}
                          aria-label="Aumentar"
                        >+</button>
                      </div>
                      <div className="sub">
                        <div className="sl">Subtotal</div>
                        <div className="sv num">{brl(sub)}</div>
                      </div>
                    </div>
                    <BotaoSec onClick={() => contratar(k)} style={{ justifyContent: 'center' }}>
                      Contratar adicional
                    </BotaoSec>
                  </CardVidro>
                );
              })}
            </div>
          </div>

          <CardVidro className="nota-info sobe" style={{ marginTop: 14, animationDelay: '.24s' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
              <rect x="4" y="11" width="16" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" />
            </svg>
            <div>
              <b>Plano e uso</b> trata da assinatura da sua organização na Atenvo (plano-base e
              adicionais) — diferente de <b>Cobranças</b>, que gerencia as cobranças que a sua
              organização faz aos próprios clientes. O meio de pagamento da assinatura ainda está
              sendo definido; por enquanto a contratação de adicionais é apenas informativa.
            </div>
          </CardVidro>
        </>
      )}
    </>
  );
}
