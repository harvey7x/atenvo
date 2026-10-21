import type { ReactNode } from 'react';
import type { KpisV5 } from '@/data/dashboardV5.tipos';
import { fmtDuracaoH, fmtInt } from '@/data/dashboardV5.formato';
import { CardVidro, Skeleton } from '../../components';
import { Ajuda, Variacao, type Sentido } from './comum';

/* Os quatro números do topo. Entradas, não elegíveis e fechados comparam com o
   MESMO trecho do período anterior; o tempo para fechar mostra mediana, média e n. */

const AJUDA = {
  entradas: 'Clientes diferentes que mandaram a primeira mensagem no período, em qualquer número. O número interno do escritório não conta.',
  ne: 'Leads marcados como não elegíveis no período, pela IA, pela regra automática do RS ou por alguém da equipe.',
  ganhos: 'Leads marcados como fechados no período, inclusive os que chegaram antes dele.',
  tempo: 'Mediana do tempo entre a chegada do lead e o fechamento, considerando todos os fechados do período. Metade fecha mais rápido do que isso.',
};

/** Número grande com a unidade menor: '2,6 dias' → 2,6 + dias; '3 h 20' → 3 h 20. */
function ValorKpi({ txt }: { txt: string }) {
  const partes = txt.split(/(\d[\d.,]*)/).filter(Boolean);
  return (
    <>
      {partes.map((p, i) => (/^\d/.test(p)
        ? <span key={i}>{p}</span>
        : <span key={i} className="d5-kpi-un">{p.trim() ? p : '\u00a0'}</span>))}
    </>
  );
}

function Cartao({ rotulo, ajuda, valor, children }: { rotulo: string; ajuda: string; valor: string; children: ReactNode }) {
  return (
    <CardVidro className="d5-kpi">
      <div className="d5-kpi-rot">
        <span>{rotulo}</span>
        <Ajuda texto={ajuda} rotulo={rotulo} />
      </div>
      <div className="d5-kpi-val num"><ValorKpi txt={valor} /></div>
      <div className="d5-kpi-pe">{children}</div>
    </CardVidro>
  );
}

export function Kpis({ k, ant, comparacao }: { k: KpisV5; ant: KpisV5 | null; comparacao: string }) {
  const v = (atual: number, anterior: number | undefined, sentido: Sentido) => (
    <Variacao atual={atual} anterior={anterior ?? null} sentido={sentido} comparacao={comparacao} />
  );
  return (
    <section className="d5-kpis" aria-label="Resumo do período">
      <Cartao rotulo="Entradas de clientes" ajuda={AJUDA.entradas} valor={fmtInt(k.entradas)}>
        {v(k.entradas, ant?.entradas, 'maior')}
      </Cartao>
      <Cartao rotulo="Não elegíveis" ajuda={AJUDA.ne} valor={fmtInt(k.ne)}>
        {v(k.ne, ant?.ne, 'neutro')}
      </Cartao>
      <Cartao rotulo="Fechados" ajuda={AJUDA.ganhos} valor={fmtInt(k.ganhos)}>
        {v(k.ganhos, ant?.ganhos, 'maior')}
      </Cartao>
      <Cartao rotulo="Tempo para fechar" ajuda={AJUDA.tempo} valor={fmtDuracaoH(k.fechMedianaH)}>
        <span className="d5-var-ctx">
          {k.fechN > 0
            ? <>mediana · média <span className="num">{fmtDuracaoH(k.fechMediaH)}</span> · <span className="num">{fmtInt(k.fechN)}</span> {k.fechN === 1 ? 'fechamento' : 'fechamentos'}</>
            : 'nenhum fechamento no período'}
        </span>
      </Cartao>
    </section>
  );
}

export function KpisSkeleton() {
  return (
    <section className="d5-kpis" aria-hidden>
      {Array.from({ length: 4 }, (_, i) => (
        <CardVidro key={i} className="d5-kpi">
          <Skeleton largura={110} altura={11} />
          <Skeleton largura={84} altura={28} style={{ marginTop: 14 }} />
          <Skeleton largura={150} altura={11} style={{ marginTop: 14 }} />
        </CardVidro>
      ))}
    </section>
  );
}
