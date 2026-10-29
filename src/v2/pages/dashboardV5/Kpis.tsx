import type { ReactNode } from 'react';
import type { KpisV5 } from '@/data/dashboardV5.tipos';
import { fmtDuracaoH, fmtInt } from '@/data/dashboardV5.formato';
import { CardVidro, Skeleton } from '../../components';
import { useAdmStatus } from '@/data/admFechados';
import { Ajuda, Legenda, Variacao, type Sentido } from './comum';

/* Os quatro números do topo. Entradas, não elegíveis e fechados comparam com o
   MESMO trecho do período anterior; o tempo para fechar mostra mediana, média e n. */

const AJUDA = {
  entradas: 'Clientes diferentes que mandaram a primeira mensagem no período, em qualquer número. O número interno do escritório não conta.',
  ne: 'Leads marcados como não elegíveis no período, pela IA, pela regra automática do RS ou por alguém da equipe.',
  ganhos: 'Clientes que o sistema do administrativo marcou como completos no período, pela data em que ficaram completos lá. A lista é lida de lá a cada 5 minutos.',
  /* com a API nova do CAF (29/10): a mesma conta do pódio do "Meu painel" */
  ganhosPlacar: 'Casos completos no sistema do CAF no período, pela mesma regra do pódio do "Meu painel": data em que o caso ficou completo, vendedor do caso, só os vendedores do campeonato e sem os casos que o gerente tirou da conta. Lido de lá a cada 5 minutos.',
  tempo: 'Mediana do tempo entre a chegada do lead e o fechamento, considerando todos os fechados do período. Metade fecha mais rápido do que isso. Embaixo, a média e quantos fechados entraram na conta.',
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

function Cartao({ rotulo, ajuda, valor, children, alvo, selo }: { rotulo: string; ajuda: string; valor: string; children: ReactNode; alvo?: string; selo?: ReactNode }) {
  return (
    <CardVidro className="d5-kpi" data-d5-alvo={alvo}>
      <div className="d5-kpi-rot">
        <span>{rotulo}</span>
        <Ajuda texto={ajuda} rotulo={rotulo} />
        {selo}
      </div>
      <div className="d5-kpi-val num"><ValorKpi txt={valor} /></div>
      <div className="d5-kpi-pe">{children}</div>
    </CardVidro>
  );
}

/** Selo "administrativo" ao lado de Fechados: a fonte do número e a hora da última leitura. */
function SeloAdministrativo() {
  const st = useAdmStatus().data;
  if (!st?.ativo) return null;
  const hora = st.ultimaLeituraEm
    ? new Date(st.ultimaLeituraEm).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })
    : null;
  return <span className="d5-kpi-fonte" title={hora ? `Sistema do administrativo lido às ${hora}` : 'Sistema do administrativo'}>administrativo</span>;
}

export function Kpis({ k, ant, comparacao }: { k: KpisV5; ant: KpisV5 | null; comparacao: string }) {
  const placar = useAdmStatus().data?.placar ?? false;
  const v = (atual: number, anterior: number | undefined, sentido: Sentido) => (
    <Variacao atual={atual} anterior={anterior ?? null} sentido={sentido} comparacao={comparacao} />
  );
  return (
    <section className="d5-kpis" aria-label="Resumo do período">
      <Cartao rotulo="Entradas de clientes" ajuda={AJUDA.entradas} valor={fmtInt(k.entradas)} alvo="kpi:entradas">
        {v(k.entradas, ant?.entradas, 'maior')}
      </Cartao>
      <Cartao rotulo="Não elegíveis" ajuda={AJUDA.ne} valor={fmtInt(k.ne)} alvo="kpi:ne">
        {v(k.ne, ant?.ne, 'neutro')}
      </Cartao>
      <Cartao rotulo="Fechados" ajuda={placar ? AJUDA.ganhosPlacar : AJUDA.ganhos} valor={fmtInt(k.ganhos)} alvo="kpi:ganhos" selo={<SeloAdministrativo />}>
        {v(k.ganhos, ant?.ganhos, 'maior')}
      </Cartao>
      <Cartao rotulo="Tempo para fechar" ajuda={AJUDA.tempo} valor={fmtDuracaoH(k.fechMedianaH)}>
        {/* "mediana" já está na definição do "i": a legenda fica numa linha só */}
        <span className="d5-var-ctx d5-kpi-leg"
          title={k.fechN > 0 ? `Mediana ${fmtDuracaoH(k.fechMedianaH)} · média ${fmtDuracaoH(k.fechMediaH)} · ${fmtInt(k.fechN)} ${k.fechN === 1 ? 'fechado' : 'fechados'}` : undefined}>
          {k.fechN > 0
            ? <Legenda partes={[`média ${fmtDuracaoH(k.fechMediaH)}`, `${fmtInt(k.fechN)} ${k.fechN === 1 ? 'fechado' : 'fechados'}`]} />
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
