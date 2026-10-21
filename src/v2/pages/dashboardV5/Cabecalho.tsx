import type { Periodo, PresetDash } from '@/data/dashboardV5';
import { Input, Segmentado } from '../../components';

/* Cabeçalho: título, período em palavras, seletor de período e "Atualizado às". */

export const PRESETS_V5: { valor: PresetDash; rotulo: string }[] = [
  { valor: 'hoje', rotulo: 'Hoje' },
  { valor: '3d', rotulo: '3 dias' },
  { valor: '7d', rotulo: '7 dias' },
  { valor: 'mes_caf', rotulo: 'Nosso mês' },
  { valor: 'custom', rotulo: 'Personalizado' },
];

const TZ = 'America/Sao_Paulo';
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
const DIAS_SEM = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const ddmm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const diaSemana = (d: string) => DIAS_SEM[new Date(`${d}T12:00:00Z`).getUTCDay()];

const ultimoDiaDe = (p: Periodo) => new Date(Date.parse(`${p.fimDate}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);

/** '10/10 – 09/11' (com o ano quando não é o ano corrente). */
function rotuloMes(p: Periodo, hoje: string): string {
  const ult = ultimoDiaDe(p);
  const ano = p.iniDate.slice(0, 4) !== hoje.slice(0, 4) ? `/${p.iniDate.slice(2, 4)}` : '';
  return `${ddmm(p.iniDate)}${ano} – ${ddmm(ult)}${ano}`;
}

/** Rótulo humano do período, usado no subtítulo. */
export function rotuloPeriodoV5(preset: PresetDash, p: Periodo, hoje: string): string {
  const ultimo = ultimoDiaDe(p);
  if (preset === 'hoje') return `Hoje, ${diaSemana(hoje)} ${ddmm(hoje)}`;
  if (preset === '3d') return `Últimos 3 dias, ${ddmm(p.iniDate)} a ${ddmm(ultimo)}`;
  if (preset === '7d') return `Últimos 7 dias, ${ddmm(p.iniDate)} a ${ddmm(ultimo)}`;
  if (preset === 'mes_caf') return `Nosso mês, ${ddmm(p.iniDate)} a ${ddmm(ultimo)}`;
  return p.iniDate === ultimo ? `${diaSemana(ultimo)}, ${ddmm(ultimo)}` : `${ddmm(p.iniDate)} a ${ddmm(ultimo)}`;
}

export function Cabecalho({
  preset, setPreset, periodo, rotulo, comparacao, ini, fim, setIni, setFim, hoje,
  mesCaf, setMesCaf, geradoEm, atualizando, aoAtualizar, demo,
}: {
  preset: PresetDash; setPreset: (p: PresetDash) => void;
  periodo: Periodo; rotulo: string; comparacao: string | null;
  ini: string; fim: string; setIni: (v: string) => void; setFim: (v: string) => void; hoje: string;
  mesCaf: number; setMesCaf: (fn: (m: number) => number) => void;
  geradoEm: string | null; atualizando: boolean; aoAtualizar: () => void;
  demo: boolean;
}) {
  return (
    <header className="d5-cab">
      <div className="d5-cab-tits">
        <h2>Dashboard{demo && <span className="d5-demo">Dados de demonstração</span>}</h2>
        <p>
          <span>{rotulo}</span>
          {comparacao && <span className="d5-cab-comp"> · comparado {comparacao.replace(/^vs /, 'com ')}</span>}
        </p>
      </div>
      <div className="d5-cab-ctl">
        <div className="d5-cab-per">
          <Segmentado opcoes={PRESETS_V5} valor={preset} aoMudar={setPreset} rotulo="Período" />
          {preset === 'mes_caf' && (
            <div className="d5-mes" role="group" aria-label="Mês comercial">
              <button type="button" className="d5-ib" aria-label="Mês anterior" onClick={() => setMesCaf((m) => m - 1)}>
                <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden><path d="M10 3.5 5.5 8l4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
              <span className="num" title={`Mês comercial da casa: do dia 10 ao dia 10 seguinte (${periodo.label})`}>{rotuloMes(periodo, hoje)}</span>
              <button type="button" className="d5-ib" aria-label="Próximo mês" disabled={mesCaf >= 0} onClick={() => setMesCaf((m) => Math.min(0, m + 1))}>
                <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden><path d="M6 3.5 10.5 8 6 12.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
            </div>
          )}
          {preset === 'custom' && (
            <div className="d5-datas">
              <Input type="date" value={ini} max={fim} onChange={(e) => e.target.value && setIni(e.target.value)} aria-label="Data inicial" />
              <span aria-hidden>até</span>
              <Input type="date" value={fim} min={ini} max={hoje} onChange={(e) => e.target.value && setFim(e.target.value)} aria-label="Data final" />
            </div>
          )}
        </div>
        <div className="d5-atual">
          <span className="num" aria-live="polite">
            {atualizando ? 'Atualizando…' : geradoEm ? `Atualizado às ${hhmm(geradoEm)}` : ''}
          </span>
          <button type="button" className="d5-ib" onClick={aoAtualizar} disabled={atualizando} aria-label="Atualizar os números" title="Atualizar">
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden className={atualizando ? 'd5-gira' : undefined}>
              <path d="M13.2 8a5.2 5.2 0 1 1-1.5-3.7M13.2 2.6v2.9h-2.9" fill="none" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>
    </header>
  );
}
