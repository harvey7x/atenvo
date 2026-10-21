import { useMemo, useState } from 'react';
import { DASH_V5_REAL, periodoDash, useDashV5, type PresetDash } from '@/data/dashboardV5';
import { janelaMapaV5, periodoAnteriorV5, rotuloComparacaoV5 } from '@/data/dashboardV5.periodo';
import { addDias, spHoje } from '@/data/relatorios';
import { CardVidro, EstadoErro } from '../components';
import { Cabecalho, rotuloPeriodoV5 } from './dashboardV5/Cabecalho';
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
   ------------------------------------------------------------------ */

/** teto do período personalizado (a RPC recusa acima de 93 dias) */
const MAX_DIAS = 92;
const difDias = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);

export default function DashboardV2() {
  const hoje = spHoje();
  const [preset, setPresetRaw] = useState<PresetDash>('hoje');
  const [ini, setIniRaw] = useState(() => addDias(spHoje(), -6));
  const [fim, setFimRaw] = useState(() => spHoje());
  const [mesCaf, setMesCaf] = useState(0); // 0 = mês comercial corrente; -1 = anterior…
  const setPreset = (v: PresetDash) => { setPresetRaw(v); if (v !== 'mes_caf') setMesCaf(0); };
  // personalizado: mantém o intervalo dentro do teto puxando a outra ponta
  const setIni = (v: string) => { setIniRaw(v); if (difDias(v, fim) > MAX_DIAS) setFimRaw(addDias(v, MAX_DIAS)); };
  const setFim = (v: string) => { setFimRaw(v); if (difDias(ini, v) > MAX_DIAS) setIniRaw(addDias(v, -MAX_DIAS)); };

  const periodo = useMemo(() => periodoDash(preset, ini, fim, mesCaf), [preset, ini, fim, mesCaf]);
  const q = useDashV5(periodo);
  const d = q.data;
  const carregando = q.isPending && !d;

  // o trecho do anterior que a busca comparou (mesmo tempo decorrido, no instante da foto)
  const geradoEm = d?.geradoEm ?? null;
  const comparacao = useMemo(
    () => rotuloComparacaoV5(periodoAnteriorV5(periodo, geradoEm ? new Date(geradoEm) : new Date()), periodo, hoje),
    [periodo, geradoEm, hoje],
  );
  const janelaMapa = useMemo(() => janelaMapaV5(periodo, hoje), [periodo, hoje]);
  const vazio = !!d && d.kpis.entradas === 0 && d.kpis.ne === 0 && d.kpis.ganhos === 0 && d.atendentes.length === 0;

  return (
    <div className="d5-pg">
      <Cabecalho
        preset={preset} setPreset={setPreset} periodo={periodo}
        rotulo={rotuloPeriodoV5(preset, periodo, hoje)} comparacao={d ? comparacao : null}
        ini={ini} fim={fim} setIni={setIni} setFim={setFim} hoje={hoje}
        mesCaf={mesCaf} setMesCaf={setMesCaf}
        geradoEm={geradoEm} atualizando={q.isFetching} aoAtualizar={() => void q.refetch()}
        demo={!DASH_V5_REAL}
      />

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
            <p className="d5-aviso" role="status">Não foi possível atualizar agora. Os números abaixo são da última leitura.</p>
          )}
          {vazio && (
            <p className="d5-aviso" role="status">Nenhuma entrada, não elegível ou fechamento neste período.</p>
          )}

          {carregando || !d ? <KpisSkeleton /> : <Kpis k={d.kpis} ant={d.kpisAnterior} comparacao={comparacao} />}

          <div className="d5-linha2">
            {carregando || !d ? <PorNumeroSkeleton /> : <PorNumero canais={d.canais} kpis={d.kpis} />}
            {carregando || !d ? <MotivosSkeleton /> : <Motivos ne={d.ne} />}
          </div>

          {carregando || !d ? <AtendentesSkeleton /> : <Atendentes atendentes={d.atendentes} />}

          {carregando || !d ? <MapaSkeleton /> : <Mapa mapa={d.mapa} janela={janelaMapa} hoje={hoje} geradoEm={d.geradoEm} />}
        </>
      )}
    </div>
  );
}
