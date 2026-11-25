import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DASH_V5_MAX_DIAS, DASH_V5_REAL, periodoDash, useDashV5, type PresetDash } from '@/data/dashboardV5';
import { useDashAtendentesAba, useDashCampanhas } from '@/data/dashboardV5.abas';
import { useDashAnuncios } from '@/data/anuncios';
import { temRecurso } from '../data/config/recursos';
import { janelaMapaV5, periodoAnteriorV5, rotuloComparacaoV5 } from '@/data/dashboardV5.periodo';
import { addDias, spHoje } from '@/data/relatorios';
import { CardVidro, EstadoErro, Segmentado } from '../components';
import { Cabecalho, rotuloPeriodoV5 } from './dashboardV5/Cabecalho';
import { KpisSkeleton } from './dashboardV5/Kpis';
import { KpisCartoes } from './dashboardV5/KpisCartoes';
import { PorNumero, PorNumeroSkeleton } from './dashboardV5/PorNumero';
import { Motivos, MotivosSkeleton } from './dashboardV5/Motivos';
import { Mapa, MapaSkeleton } from './dashboardV5/Mapa';
import { Robo, RoboSkeleton } from './dashboardV5/Robo';
import { Anuncio, AnuncioSkeleton } from './dashboardV5/Anuncio';
import { Campanhas, CampanhasSkeleton } from './dashboardV5/Campanhas';
import { AtendentesAba, AtendentesAbaSkeleton } from './dashboardV5/AtendentesAba';
import { AnunciosAba, AnunciosAbaSkeleton } from './dashboardV5/AnunciosAba';
import './dashboardV5/dashboardV5.css';

/* ------------------------------------------------------------------
   Dashboard v5 em ABAS — o mesmo do Atenvo (12/11), trazido para a Reviza em
   13/11 (dono: "copie o dashboard"): Visão geral (os seis itens, como sempre) ·
   Campanhas (melhor do dia/semana/mês, ondas, retornos, parente) · Atendentes
   (os dois relógios, campanha × atendente, carteira). A aba Iris do Atenvo NÃO
   vem: a Reviza não tem a Iris. O período é GLOBAL, acima da linha de abas.
   Uma RPC por aba + período; cada aba só busca quando aberta. Demo é o
   contrato: em `vite --mode demo` os mesmos hooks devolvem as fixtures.
   ------------------------------------------------------------------ */

const ABAS = [
  { valor: 'geral', rotulo: 'Visão geral' },
  { valor: 'campanhas', rotulo: 'Campanhas' },
  { valor: 'anuncios', rotulo: 'Anúncios' }, // 25/11: os anúncios do Facebook — investido, custo por lead, qual campanha roda melhor (só com o recurso 'anuncios')
  { valor: 'atendentes', rotulo: 'Atendentes' },
] as const;
type AbaDash = typeof ABAS[number]['valor'];
/** as abas desta instalação: Anúncios só com o recurso ligado (a parte do servidor existe) */
const abasVisiveis = () => ABAS.filter((a) => a.valor !== 'anuncios' || temRecurso('anuncios'));
const ehAba = (v: string | null): v is AbaDash => abasVisiveis().some((a) => a.valor === v);

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

/* Primeira abertura (sem foto guardada neste navegador) — dono 30/10: "coloca aquela tela de
   carregando que a gente colocou no WhatsApp e no Kanban". Fica por cima dos esqueletos. É uma
   chamada só ao banco, então a barra é de espera (sem porcentagem inventada). */
function CarregandoDash() {
  return (
    <div className="d5-carr" role="status" aria-live="polite">
      <div className="d5-carr-caixa">
        <span className="d5-carr-ic" aria-hidden><i /><i /><i /><i /></span>
        <strong>Carregando o Dashboard</strong>
        <span className="d5-carr-txt">Calculando as entradas, os fechados e o desempenho da equipe. Só um instante.</span>
        <span className="d5-carr-barra"><i /></span>
      </div>
    </div>
  );
}

/** Erro da aba quando não há nem dado velho; com dado velho, só o aviso em cima. */
function ErroAba({ q }: { q: { isError: boolean; error: unknown; refetch: () => unknown; data: unknown } }) {
  if (!q.isError) return null;
  if (q.data) {
    return (
      <p className="d5-aviso" role="status">
        {(q.error as Error)?.message || 'Não foi possível atualizar agora.'} Os números abaixo são da última leitura.
      </p>
    );
  }
  return (
    <CardVidro className="d5-sec d5-erro">
      <EstadoErro
        titulo="Não foi possível carregar esta aba"
        descricao={(q.error as Error)?.message || 'Verifique a conexão e tente de novo.'}
        aoTentarDeNovo={() => void q.refetch()}
      />
    </CardVidro>
  );
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

  // aba na URL (?aba=campanhas): sobrevive ao F5 e vira link compartilhável
  const [params, setParams] = useSearchParams();
  const aba: AbaDash = ehAba(params.get('aba')) ? (params.get('aba') as AbaDash) : 'geral';
  const setAba = (v: AbaDash) => {
    setParams((p) => {
      const n = new URLSearchParams(p);
      if (v === 'geral') n.delete('aba'); else n.set('aba', v);
      return n;
    }, { replace: true });
  };

  // `hoje` entra nas dependências: depois da meia-noite "Hoje" passa a ser o dia novo
  const periodo = useMemo(() => periodoDash(preset, ini, fim, mesCaf), [preset, ini, fim, mesCaf, hoje]); // eslint-disable-line react-hooks/exhaustive-deps
  const q = useDashV5(periodo);
  const qCamp = useDashCampanhas(periodo, aba === 'campanhas');
  const qAt = useDashAtendentesAba(periodo, aba === 'atendentes');
  const qAn = useDashAnuncios(periodo, aba === 'anuncios');
  const d = q.data;
  const carregando = !d;

  // esmaecer na troca de período: o da aba aberta
  const qAtivo = aba === 'geral' ? q : aba === 'campanhas' ? qCamp : aba === 'anuncios' ? qAn : qAt;
  const trocando = qAtivo.isPlaceholderData && qAtivo.isFetching;

  // o trecho do anterior que a busca comparou: sai do MESMO instante com que o hook cortou
  // a janela (buscaEm), então o rótulo nomeia o minuto que foi de fato para a RPC
  const buscaEm = d?.buscaEm ?? null;
  const comparacao = useMemo(
    () => rotuloComparacaoV5(periodoAnteriorV5(periodo, buscaEm ? new Date(buscaEm) : new Date()), periodo, hoje),
    [periodo, buscaEm, hoje],
  );
  const janelaMapa = useMemo(() => janelaMapaV5(periodo, hoje), [periodo, hoje]);

  const atualizar = () => { void qAtivo.refetch(); };

  return (
    <div className="d5-pg" aria-busy={trocando || undefined}>
      <Cabecalho
        preset={preset} setPreset={setPreset} periodo={periodo}
        rotulo={rotuloPeriodoV5(preset, periodo, hoje)}
        ini={ini} fim={fim} setIni={setIni} setFim={setFim} hoje={hoje}
        mesCaf={mesCaf} setMesCaf={setMesCaf}
        geradoEm={(qAtivo.data as { geradoEm?: string } | undefined)?.geradoEm ?? d?.geradoEm ?? null}
        atualizando={qAtivo.isFetching}
        aoAtualizar={atualizar}
        demo={!DASH_V5_REAL}
      />

      <nav className="d5-abas" aria-label="Seções do dashboard">
        <Segmentado<AbaDash>
          opcoes={abasVisiveis().map((a) => ({ valor: a.valor, rotulo: a.rotulo }))}
          valor={aba} aoMudar={setAba} rotulo="Seção do dashboard" />
      </nav>

      {aba === 'geral' && (
        q.isError && !d ? (
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

            {/* os 4 números do topo como cards de métrica com gráfico (dono 14/11), no período do topo;
                os de antes (Kpis) ficam só para o esqueleto da primeira carga */}
            {carregando ? <KpisSkeleton /> : <KpisCartoes k={d.kpis} ant={d.kpisAnterior} comparacao={comparacao} periodo={periodo} hoje={hoje} rotuloPeriodo={rotuloPeriodoV5(preset, periodo, hoje)} />}

            <div className="d5-linha2">
              {carregando ? <PorNumeroSkeleton /> : <PorNumero canais={d.canais} kpis={d.kpis} />}
              {carregando ? <MotivosSkeleton /> : <Motivos ne={d.ne} />}
            </div>

            {carregando ? <AnuncioSkeleton /> : <Anuncio canais={d.canais} />}

            {carregando ? <RoboSkeleton /> : d.robo && <Robo robo={d.robo} />}

            {carregando ? <MapaSkeleton /> : <Mapa mapa={d.mapa} janela={janelaMapa} hoje={hoje} geradoEm={d.geradoEm} />}

            {carregando && <CarregandoDash />}
          </>
        )
      )}

      {aba === 'campanhas' && (
        <>
          <ErroAba q={qCamp} />
          {qCamp.data
            ? <Campanhas d={qCamp.data} periodo={periodo} hoje={hoje} />
            : !qCamp.isError && <CampanhasSkeleton />}
        </>
      )}

      {aba === 'anuncios' && (
        <>
          <ErroAba q={qAn} />
          {qAn.data
            ? <AnunciosAba d={qAn.data} periodo={periodo} hoje={hoje} comparacao={comparacao} />
            : !qAn.isError && <AnunciosAbaSkeleton />}
        </>
      )}

      {aba === 'atendentes' && (
        <>
          <ErroAba q={qAt} />
          {qAt.data
            ? <AtendentesAba d={qAt.data} periodo={periodo} hoje={hoje} />
            : !qAt.isError && <AtendentesAbaSkeleton />}
        </>
      )}
    </div>
  );
}
