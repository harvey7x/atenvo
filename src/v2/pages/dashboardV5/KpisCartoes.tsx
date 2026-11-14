import { useMemo } from 'react';
import type { KpisV5 } from '@/data/dashboardV5.tipos';
import { useDashCampanhas } from '@/data/dashboardV5.abas';
import { baldesDe, fimComHoje } from '@/data/dashboardV5.series';
import { fmtDuracaoH, fmtInt } from '@/data/dashboardV5.formato';
import { janelaMapaV5 } from '@/data/dashboardV5.periodo';
import type { Periodo } from '@/data/relatorios';
import { useAdmStatus } from '@/data/admFechados';
import {
  CartaoMetrica, CartaoMetricaFixo, GradeMetricas, diaDoBalao, type SeriesPoint,
} from '../../components/CartaoMetrica';
import { Ajuda, Variacao } from './comum';
import { AJUDA_KPIS, SeloAdministrativo } from './Kpis';

/* ------------------------------------------------------------------
   Os 4 números do topo do Dashboard como cards de métrica (dono 14/11).
   O PERÍODO É O DO TOPO (Hoje · 3 dias · 7 dias · Nosso mês · Personalizado) —
   dono: "lá em cima já tem para definir, não faz sentido" um menu de período
   em cada card. O número grande e a comparação são os de sempre (o MESMO
   trecho do período anterior); o gráfico é a série dia a dia da aba Campanhas
   (somadas as campanhas) na janela do período — período curto (Hoje, 3 dias)
   desenha os últimos 7 dias, a mesma régua das ondas. O Tempo para fechar não
   tem série dia a dia: fica na mesma moldura, sem gráfico.
   ------------------------------------------------------------------ */

export function KpisCartoes({ k, ant, comparacao, periodo, hoje, rotuloPeriodo }: {
  k: KpisV5; ant: KpisV5 | null; comparacao: string; periodo: Periodo; hoje: string; rotuloPeriodo: string;
}) {
  const placar = useAdmStatus().data?.placar ?? false;
  const q = useDashCampanhas(periodo, true);
  const jm = useMemo(() => janelaMapaV5(periodo, hoje), [periodo, hoje]);
  const dias = useMemo(() => baldesDe(jm.iniDate, fimComHoje(periodo.fimDate, hoje), 'dia').map((b) => b.chave), [jm, periodo, hoje]);

  // a série da aba Campanhas, somada por dia; dia sem nada = 0 (o gráfico não pula dias)
  const porDia = useMemo(() => {
    const m = new Map(dias.map((dia) => [dia, { entradas: 0, ganhos: 0, ne: 0 }]));
    for (const s of q.data?.serie ?? []) {
      const d = m.get(s.dia);
      if (d) { d.entradas += s.entradas; d.ganhos += s.ganhos; d.ne += s.ne; }
    }
    return [...m.entries()];
  }, [q.data, dias]);
  const serie = (campo: 'entradas' | 'ganhos' | 'ne'): SeriesPoint[] => porDia.map(([dia, v]) => ({ value: v[campo], date: dia }));
  const entradas = useMemo(() => serie('entradas'), [porDia]); // eslint-disable-line react-hooks/exhaustive-deps
  const ne = useMemo(() => serie('ne'), [porDia]); // eslint-disable-line react-hooks/exhaustive-deps
  const ganhos = useMemo(() => serie('ganhos'), [porDia]); // eslint-disable-line react-hooks/exhaustive-deps

  const carregandoGraf = !q.data && !q.isError;
  const tomDe = (atual: number, anterior: number | undefined, neutro?: boolean) => (
    neutro || anterior == null || atual === anterior ? 'neutro' as const : atual > anterior ? 'bom' as const : 'ruim' as const
  );
  const palavra = (um: string, varios: string) => (v: number) => `${fmtInt(v)} ${v === 1 ? um : varios}`;
  const cab = (titulo: string, ajuda: string) => (
    <span className="rvm-tit rvm-tit-ajuda">{titulo}<Ajuda texto={ajuda} rotulo={titulo} /></span>
  );
  const comuns = { formatarData: (dia: string) => diaDoBalao(dia, hoje), variacao: false as const };

  return (
    <div className="rvm-bloco">
      <GradeMetricas rotulo="Resumo do período">
        <CartaoMetrica titulo="Entradas de clientes" cabEsquerda={cab('Entradas de clientes', AJUDA_KPIS.entradas)}
          data={entradas} graficoCarregando={carregandoGraf} total={fmtInt(k.entradas)} tom={tomDe(k.entradas, ant?.entradas)}
          formatar={palavra('entrada', 'entradas')} {...comuns}
          rodape={<Variacao atual={k.entradas} anterior={ant?.entradas} sentido="maior" comparacao={comparacao} />} />
        <CartaoMetrica titulo="Não elegíveis" cabEsquerda={cab('Não elegíveis', AJUDA_KPIS.ne)}
          data={ne} graficoCarregando={carregandoGraf} total={fmtInt(k.ne)} tom="neutro"
          formatar={palavra('não elegível', 'não elegíveis')} {...comuns}
          rodape={<Variacao atual={k.ne} anterior={ant?.ne} sentido="neutro" comparacao={comparacao} />} />
        <CartaoMetrica titulo="Fechados" cabEsquerda={cab('Fechados', placar ? AJUDA_KPIS.ganhosPlacar : AJUDA_KPIS.ganhos)}
          cabDireita={<SeloAdministrativo />}
          data={ganhos} graficoCarregando={carregandoGraf} total={fmtInt(k.ganhos)} tom={tomDe(k.ganhos, ant?.ganhos)}
          formatar={palavra('fechado', 'fechados')} {...comuns}
          rodape={<Variacao atual={k.ganhos} anterior={ant?.ganhos} sentido="maior" comparacao={comparacao} />} />
        <CartaoMetricaFixo
          titulo="Tempo para fechar"
          valor={fmtDuracaoH(k.fechMedianaH)}
          detalhe={k.fechN > 0
            ? <span>média <b>{fmtDuracaoH(k.fechMediaH)}</b> · <b>{fmtInt(k.fechN)}</b> {k.fechN === 1 ? 'fechado' : 'fechados'}</span>
            : 'nenhum fechamento no período'}
          rodape={`Mediana · ${rotuloPeriodo}`} />
      </GradeMetricas>
      {jm.estendido && (
        <p className="rvm-nota">Os números são do período escolhido acima; nos gráficos, os últimos 7 dias, dia a dia, para dar contexto.</p>
      )}
    </div>
  );
}
