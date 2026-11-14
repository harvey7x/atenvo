import { useMemo } from 'react';
import type { KpisV5 } from '@/data/dashboardV5.tipos';
import type { PresetDash } from '@/data/dashboardV5';
import { periodoDash } from '@/data/dashboardV5';
import { useDashCampanhas } from '@/data/dashboardV5.abas';
import { fmtDuracaoH, fmtInt } from '@/data/dashboardV5.formato';
import { addDias } from '@/data/relatorios';
import {
  CartaoMetrica, CartaoMetricaFixo, GradeMetricas, type PeriodOption, type SeriesPoint,
} from '../../components/CartaoMetrica';

/* ------------------------------------------------------------------
   Os 4 números do topo do Dashboard como cards de métrica (dono 14/11:
   "todas as métricas … dessa forma"). Entradas, Não elegíveis e Fechados ganham
   o gráfico DIA A DIA dos últimos 30 dias — a mesma série da aba Campanhas
   (dashboard_v5_campanhas, somadas as campanhas), numa busca própria de 30 dias;
   o menu do card escolhe 7, 14 ou 30 dias e o número grande é o total da janela.
   O card abre na janela mais perto do período do topo (Hoje/3 dias/7 dias → 7;
   Nosso mês/Personalizado → 30). O Tempo para fechar não tem série dia a dia:
   fica na mesma moldura, sem gráfico, com o período do topo.
   ------------------------------------------------------------------ */

const PERIODOS: PeriodOption[] = [
  { label: 'Últimos 7 dias', points: 7 },
  { label: 'Últimos 14 dias', points: 14 },
  { label: 'Últimos 30 dias' },
];
const MES_ABREV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export function KpisCartoes({ k, preset, hoje, rotuloPeriodo }: {
  k: KpisV5; preset: PresetDash; hoje: string; rotuloPeriodo: string;
}) {
  const p30 = useMemo(() => periodoDash('custom', addDias(hoje, -29), hoje), [hoje]);
  const q = useDashCampanhas(p30, true);

  // a série da aba Campanhas, somada por dia; dia sem nada = 0 (o gráfico não pula dias)
  const porDia = useMemo(() => {
    const m = new Map<string, { entradas: number; ganhos: number; ne: number }>();
    for (let i = 29; i >= 0; i--) m.set(addDias(hoje, -i), { entradas: 0, ganhos: 0, ne: 0 });
    for (const s of q.data?.serie ?? []) {
      const d = m.get(s.dia);
      if (d) { d.entradas += s.entradas; d.ganhos += s.ganhos; d.ne += s.ne; }
    }
    return [...m.entries()];
  }, [q.data, hoje]);
  const serie = (campo: 'entradas' | 'ganhos' | 'ne'): SeriesPoint[] => porDia.map(([dia, v]) => ({ value: v[campo], date: dia }));
  const entradas = useMemo(() => serie('entradas'), [porDia]); // eslint-disable-line react-hooks/exhaustive-deps
  const ne = useMemo(() => serie('ne'), [porDia]); // eslint-disable-line react-hooks/exhaustive-deps
  const ganhos = useMemo(() => serie('ganhos'), [porDia]); // eslint-disable-line react-hooks/exhaustive-deps

  const dataDoBalao = (dia: string) => {
    const [y, m, d] = dia.split('-');
    return `${d} ${MES_ABREV[Number(m) - 1] ?? m} ${y}${dia === hoje ? ' · até agora' : ''}`;
  };
  const periodoInicial = preset === 'mes_caf' || preset === 'custom' ? 'Últimos 30 dias' : 'Últimos 7 dias';
  const carregando = !q.data && !q.isError;
  const comuns = {
    periodOptions: PERIODOS, period: periodoInicial, dateFormatter: dataDoBalao,
    deltaLabel: 'hoje (até agora) vs ontem', loading: carregando,
  };

  return (
    <GradeMetricas rotulo="Resumo do período">
      <CartaoMetrica key={`ent-${periodoInicial}`} title="Entradas de clientes" unit="entradas" data={entradas} {...comuns} />
      <CartaoMetrica key={`ne-${periodoInicial}`} title="Não elegíveis" unit="não elegíveis" data={ne} sentido="neutro" {...comuns} />
      <CartaoMetrica key={`gan-${periodoInicial}`} title="Fechados" unit="fechados" data={ganhos} {...comuns} />
      <CartaoMetricaFixo
        titulo="Tempo para fechar"
        valor={fmtDuracaoH(k.fechMedianaH)}
        rodapeEsq={`Mediana · ${rotuloPeriodo}`}
        rodapeDir={k.fechN > 0
          ? <><span>média <span className="pmc-stats__value">{fmtDuracaoH(k.fechMediaH)}</span></span><span className="pmc-stats__sep">·</span><span><span className="pmc-stats__value">{fmtInt(k.fechN)}</span> {k.fechN === 1 ? 'fechado' : 'fechados'}</span></>
          : 'nenhum fechamento no período'} />
    </GradeMetricas>
  );
}
