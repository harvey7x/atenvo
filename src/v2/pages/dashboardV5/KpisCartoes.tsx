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
   o menu do card escolhe 7, 14 ou 30 dias e o número grande é o total da janela
   (o card é o compacto da casa, 4 por linha — dono 14/11: "bem encaixado").
   O card abre na janela mais perto do período do topo (Hoje/3 dias/7 dias → 7;
   Nosso mês/Personalizado → 30). O Tempo para fechar não tem série dia a dia:
   fica na mesma moldura, sem gráfico, com o período do topo.
   ------------------------------------------------------------------ */

const PERIODOS: PeriodOption[] = [
  { label: '7 dias', points: 7 },
  { label: '14 dias', points: 14 },
  { label: '30 dias' },
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
  const periodoInicial = preset === 'mes_caf' || preset === 'custom' ? '30 dias' : '7 dias';
  const carregando = !q.data && !q.isError;
  const somaDaJanela = (j: SeriesPoint[]) => fmtInt(j.reduce((t, p) => t + p.value, 0));
  const comuns = {
    periodos: PERIODOS, periodo: periodoInicial, formatarData: dataDoBalao,
    rotuloDelta: 'hoje vs ontem', carregando, total: somaDaJanela,
  };
  const n = (rot: string, rots: string) => (v: number) => `${fmtInt(v)} ${v === 1 ? rot : rots}`;

  return (
    <GradeMetricas rotulo="Resumo do período">
      <CartaoMetrica key={`ent-${periodoInicial}`} titulo="Entradas de clientes" data={entradas} formatar={n('entrada', 'entradas')} {...comuns} />
      <CartaoMetrica key={`ne-${periodoInicial}`} titulo="Não elegíveis" data={ne} sentido="neutro" formatar={n('não elegível', 'não elegíveis')} {...comuns} />
      <CartaoMetrica key={`gan-${periodoInicial}`} titulo="Fechados" data={ganhos} formatar={n('fechado', 'fechados')} {...comuns} />
      <CartaoMetricaFixo
        titulo="Tempo para fechar"
        valor={fmtDuracaoH(k.fechMedianaH)}
        detalhe={k.fechN > 0
          ? <span>média <b>{fmtDuracaoH(k.fechMediaH)}</b> · <b>{fmtInt(k.fechN)}</b> {k.fechN === 1 ? 'fechado' : 'fechados'}</span>
          : 'nenhum fechamento no período'}
        rodape={`Mediana · ${rotuloPeriodo}`} />
    </GradeMetricas>
  );
}
