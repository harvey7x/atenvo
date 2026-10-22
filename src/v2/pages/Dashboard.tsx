import { useEffect, useMemo, useState } from 'react';
import { DASH_V5_MAX_DIAS, DASH_V5_REAL, periodoDash, useDashV5, type PresetDash } from '@/data/dashboardV5';
import { janelaMapaV5, periodoAnteriorV5, rotuloComparacaoV5 } from '@/data/dashboardV5.periodo';
import { addDias, spHoje } from '@/data/relatorios';
import { useSinaisV5 } from '@/data/dashboardV5.sinais';
import { montarLeituraV5 } from '@/data/dashboardV5.inteligencia';
import { useOrg } from '@/context/OrgContext';
import { CardVidro, EstadoErro } from '../components';
import { Cabecalho, rotuloPeriodoV5 } from './dashboardV5/Cabecalho';
import { Leitura, LimiteLeitura } from './dashboardV5/Leitura';
import { Kpis, KpisSkeleton } from './dashboardV5/Kpis';
import { PorNumero, PorNumeroSkeleton } from './dashboardV5/PorNumero';
import { Motivos, MotivosSkeleton } from './dashboardV5/Motivos';
import { Atendentes, AtendentesSkeleton } from './dashboardV5/Atendentes';
import { Mapa, MapaSkeleton } from './dashboardV5/Mapa';
import './dashboardV5/dashboardV5.css';

/* ------------------------------------------------------------------
   Dashboard v5 (21/10) — o pedido FECHADO do dono, e nada além:
   entradas de clientes (no total e em cada número conectado), não
   elegíveis com o motivo, tempo para fechar, avaliação de cada
   atendente e o mapa dia × hora das entradas.
   Uma RPC por período (dashboard_v5). Demo é o contrato: em
   `vite --mode demo` o mesmo hook devolve a fixture com os mesmos tipos.
   LEITURA DO DIA (22/10): uma 2ª chamada, independente e em paralelo
   (dashboard_v5_sinais), alimenta o painel que lê os números e diz o que
   fazer; a página nunca espera por ela.
   ------------------------------------------------------------------ */

/** teto do personalizado em diferença de datas (fim − início): 44 = 45 dias, o teto da RPC */
const MAX_DIF = DASH_V5_MAX_DIAS - 1;
const difDias = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);

/** "Hoje" de São Paulo que VIRA à meia-noite com a página aberta (o escritório deixa o
 *  dashboard ligado): um timer re-renderiza na virada, e o período é recalculado. */
function useHojeSP(): string {
  const hoje = spHoje();
  const [, setTique] = useState(0);
  useEffect(() => {
    const ms = Date.parse(`${addDias(hoje, 1)}T00:00:00-03:00`) - Date.now() + 1_000;
    const t = window.setTimeout(() => setTique((x) => x + 1), Math.max(1_000, Math.min(ms, 2_147_000_000)));
    return () => window.clearTimeout(t);
  }, [hoje]);
  return hoje;
}

export default function DashboardV2() {
  const hoje = useHojeSP();
  const [preset, setPresetRaw] = useState<PresetDash>('hoje');
  const [ini, setIniRaw] = useState(() => addDias(spHoje(), -6));
  const [fim, setFimRaw] = useState(() => spHoje());
  const [mesCaf, setMesCaf] = useState(0); // 0 = mês comercial corrente; -1 = anterior…
  const setPreset = (v: PresetDash) => { setPresetRaw(v); if (v !== 'mes_caf') setMesCaf(0); };
  // personalizado: mantém o intervalo dentro do teto puxando a outra ponta
  const setIni = (v: string) => { setIniRaw(v); if (difDias(v, fim) > MAX_DIF) setFimRaw(addDias(v, MAX_DIF)); };
  const setFim = (v: string) => { setFimRaw(v); if (difDias(ini, v) > MAX_DIF) setIniRaw(addDias(v, -MAX_DIF)); };

  // `hoje` entra nas dependências: depois da meia-noite "Hoje" passa a ser o dia novo
  const periodo = useMemo(() => periodoDash(preset, ini, fim, mesCaf), [preset, ini, fim, mesCaf, hoje]); // eslint-disable-line react-hooks/exhaustive-deps
  const q = useDashV5(periodo);
  const d = q.data;
  const { currentOrg } = useOrg();
  const sq = useSinaisV5(periodo, preset);
  // o servidor decide quem é admin/supervisor (os blocos por pessoa só vêm para ele)
  const admin = sq.data ? sq.data.admin : currentOrg.role !== 'atendente';
  // a página IA é só de admin (supervisor cairia em "Acesso restrito")
  const podeIa = currentOrg.role === 'admin';
  // o sinal carrega o preset com que foi buscado: durante a troca de período o sinal antigo
  // (keepPreviousData) segue lido como antes. Um sinal inesperado que quebre o motor derruba
  // só o painel ("Leitura indisponível agora"), nunca a página.
  const { leitura, falhou } = useMemo(() => {
    if (!sq.data) return { leitura: null, falhou: false };
    try {
      return { leitura: montarLeituraV5(sq.data, { agora: new Date(sq.data.agora), preset: sq.data.preset ?? preset, admin }), falhou: false };
    } catch (e) {
      console.error('Leitura do dia', e);
      return { leitura: null, falhou: true };
    }
  }, [sq.data, preset, admin]);
  // alvos que existem na tela agora: ação sem linha correspondente não aparece
  const alvos = useMemo(() => {
    const s = new Set<string>(['kpi:entradas', 'kpi:ne', 'kpi:ganhos']);
    if (!d) return s;
    for (const c of d.canais) if (c.canalId) s.add(`numeros:${c.canalId}`);
    if (d.atendentes.length) s.add('atendentes');
    for (const a of d.atendentes) s.add(`atendentes:${a.usuarioId}`);
    for (const m of d.ne.motivos) s.add(`motivos:${m.motivo}`);
    return s;
  }, [d]);
  const carregando = !d;
  // trocou de período: os números do anterior ficam esmaecidos até a nova foto chegar
  const trocando = q.isPlaceholderData && q.isFetching;

  // o trecho do anterior que a busca comparou: sai do MESMO instante com que o hook cortou
  // a janela (buscaEm), então o rótulo nomeia o minuto que foi de fato para a RPC
  const buscaEm = d?.buscaEm ?? null;
  const comparacao = useMemo(
    () => rotuloComparacaoV5(periodoAnteriorV5(periodo, buscaEm ? new Date(buscaEm) : new Date()), periodo, hoje),
    [periodo, buscaEm, hoje],
  );
  const janelaMapa = useMemo(() => janelaMapaV5(periodo, hoje), [periodo, hoje]);

  return (
    <div className="d5-pg" aria-busy={trocando || undefined}>
      <Cabecalho
        preset={preset} setPreset={setPreset} periodo={periodo}
        rotulo={rotuloPeriodoV5(preset, periodo, hoje)}
        ini={ini} fim={fim} setIni={setIni} setFim={setFim} hoje={hoje}
        mesCaf={mesCaf} setMesCaf={setMesCaf}
        geradoEm={d?.geradoEm ?? null} atualizando={q.isFetching}
        aoAtualizar={() => { void q.refetch(); void sq.refetch(); }}
        demo={!DASH_V5_REAL}
      />

      <LimiteLeitura>
        <Leitura q={sq} leitura={leitura} falhou={falhou} alvos={alvos} podeIa={podeIa} aoPreset={setPreset}
          horaCabecalho={d?.geradoEm ?? null} />
      </LimiteLeitura>

      {q.isError && !d ? (
        <CardVidro className="d5-sec d5-erro">
          <EstadoErro
            titulo="Não foi possível carregar o dashboard"
            descricao={(q.error as Error)?.message || 'Verifique a conexão e tente de novo.'}
            aoTentarDeNovo={() => void q.refetch()}
          />
        </CardVidro>
      ) : (
        <>
          {q.isError && d && (
            <p className="d5-aviso" role="status">
              {(q.error as Error)?.message || 'Não foi possível atualizar agora.'} Os números abaixo são da última leitura.
            </p>
          )}

          {carregando ? <KpisSkeleton /> : <Kpis k={d.kpis} ant={d.kpisAnterior} comparacao={comparacao} />}

          <div className="d5-linha2">
            {carregando ? <PorNumeroSkeleton /> : <PorNumero canais={d.canais} kpis={d.kpis} marcadores={leitura?.marcadores.numeros} />}
            {carregando ? <MotivosSkeleton /> : <Motivos ne={d.ne} />}
          </div>

          {carregando ? <AtendentesSkeleton /> : <Atendentes atendentes={d.atendentes} marcadores={admin ? leitura?.marcadores.atendentes : undefined} />}

          {carregando ? <MapaSkeleton /> : <Mapa mapa={d.mapa} janela={janelaMapa} hoje={hoje} geradoEm={d.geradoEm} />}
        </>
      )}
    </div>
  );
}
