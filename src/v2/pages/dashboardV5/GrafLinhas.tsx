import { useEffect, useId, useMemo, useState } from 'react';
import type { Balde } from '@/data/dashboardV5.series';
import { fmtInt } from '@/data/dashboardV5.formato';
import { Legenda, Pop, Vazio, ancoraDe, type Ancora } from './comum';

/* Gráfico de LINHAS multi-série ("ondas"), no padrão da casa: SVG à mão, cor só por
   token (--dado-1…5) + tracejado distinto por série (daltônico e impressão não
   dependem da cor), segmentos retos (bezier inventaria valores), ZERO animação.
   Tooltip por BALDE (um botão invisível por coluna — foco de teclado de graça),
   no Pop/ancoraDe do mapa; tabela sr-only com balde × série × valor. O contêiner
   rola horizontal como o mapa quando a página é estreita. */

export interface SerieGraf {
  id: string;
  rotulo: string;
  /** token de cor ('var(--dado-1)') — nunca hex */
  cor: string;
  tracejado?: string;
  /** valor por chave de balde (ausente = 0) */
  valores: ReadonlyMap<string, number>;
}

const W = 760;
const H = 240;
const PAD_L = 46;
const PAD_R = 14;
const PAD_T = 14;
const PAD_B = 26;

export function GrafLinhas({ baldes, series, titulo, vazio, rodape }: {
  baldes: Balde[]; series: SerieGraf[]; titulo: string; vazio: string; rodape?: string;
}) {
  const idTabela = useId();
  const [foco, setFoco] = useState<{ i: number; ancora: Ancora } | null>(null);

  // rolagem fecha a bolha (como a Ajuda): a âncora sai do lugar e a bolha ficaria órfã
  useEffect(() => {
    if (!foco) return;
    const sair = () => setFoco(null);
    window.addEventListener('scroll', sair, true);
    return () => window.removeEventListener('scroll', sair, true);
  }, [foco]);

  const { max, pontos } = useMemo(() => {
    let m = 0;
    const ps = series.map((s) => baldes.map((b) => {
      const v = s.valores.get(b.chave) ?? 0;
      if (v > m) m = v;
      return v;
    }));
    return { max: m, pontos: ps };
  }, [baldes, series]);

  if (!baldes.length || max <= 0) return <Vazio texto={vazio} />;

  const n = baldes.length;
  const x = (i: number) => (n > 1 ? PAD_L + (i * (W - PAD_L - PAD_R)) / (n - 1) : W / 2);
  const y = (v: number) => H - PAD_B - (v / max) * (H - PAD_B - PAD_T);
  const guias = [0, 1 / 3, 2 / 3, 1].map((f) => ({ v: max * f, y: y(max * f) }));
  // eixo x: no máximo ~8 rótulos (o resto fica no tooltip)
  const passoRotulo = Math.max(1, Math.ceil(n / 8));
  const largHit = n > 1 ? (W - PAD_L - PAD_R) / (n - 1) : W;

  const linhasTip = (i: number) =>
    series
      .map((s) => ({ rotulo: s.rotulo, v: pontos[series.indexOf(s)][i] ?? 0 }))
      .sort((a, b) => b.v - a.v)
      .map((p) => `${p.rotulo} ${fmtInt(p.v)}`);

  return (
    <div className="d5-graf-rolo" onMouseLeave={() => setFoco(null)}>
      <div className="d5-graf" role="img" aria-label={titulo} aria-describedby={idTabela}>
        <svg viewBox={`0 0 ${W} ${H}`} className="d5-graf-svg" aria-hidden focusable="false">
          {guias.map((g, gi) => (
            <g key={gi}>
              <line x1={PAD_L} x2={W - PAD_R} y1={g.y} y2={g.y} className="d5-graf-guia" />
              <text x={PAD_L - 7} y={g.y + 3.5} className="d5-graf-eixo num" textAnchor="end">{fmtInt(g.v)}</text>
            </g>
          ))}
          {baldes.map((b, i) => (i % passoRotulo === 0 || i === n - 1) && (
            <text key={b.chave} x={x(i)} y={H - 8} className="d5-graf-eixo num" textAnchor="middle">{b.rotulo}</text>
          ))}
          {series.map((s, si) => (
            <path key={s.id} className="d5-graf-linha"
              d={pontos[si].map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ')}
              style={{ stroke: s.cor }} strokeDasharray={s.tracejado} fill="none" />
          ))}
          {/* um balde só não tem linha: o ponto fica sempre visível */}
          {(foco || n === 1) && series.map((s, si) => (
            <circle key={s.id} cx={x(foco?.i ?? 0)} cy={y(pontos[si][foco?.i ?? 0] ?? 0)} r="3.5"
              className="d5-graf-ponto" style={{ fill: s.cor }} />
          ))}
        </svg>
        <div className="d5-graf-hits">
          {baldes.map((b, i) => (
            <button key={b.chave} type="button" className="d5-graf-hit"
              style={{ left: `${(x(i) / W) * 100}%`, width: `${Math.min(14, (largHit / W) * 100)}%` }}
              aria-label={`${b.rotulo}: ${linhasTip(i).join(', ')}`}
              onMouseEnter={(e) => setFoco({ i, ancora: ancoraDe(e.currentTarget) })}
              onFocus={(e) => setFoco({ i, ancora: ancoraDe(e.currentTarget) })}
              onBlur={() => setFoco(null)} />
          ))}
        </div>
        <Pop ancora={foco?.ancora ?? null} papel="status">
          <span className="d5-pop-tx num">
            <b className="d5-graf-tip-t">{baldes[foco?.i ?? 0]?.rotulo}</b>
            {foco && <Legenda partes={linhasTip(foco.i)} />}
          </span>
        </Pop>
      </div>
      {rodape && <p className="d5-graf-nota">{rodape}</p>}
      <table className="d5-sr" id={idTabela}>
        <caption>{titulo}</caption>
        <thead><tr><th scope="col">Período</th>{series.map((s) => <th key={s.id} scope="col">{s.rotulo}</th>)}</tr></thead>
        <tbody>
          {baldes.map((b, i) => (
            <tr key={b.chave}>
              <th scope="row">{b.rotulo}</th>
              {series.map((s, si) => <td key={s.id}>{fmtInt(pontos[si][i] ?? 0)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Legenda de séries para o `acao` da Secao (quadradinho na cor + tracejado da linha). */
export function LegendaGraf({ series }: { series: { id: string; rotulo: string; cor: string; tracejado?: string }[] }) {
  return (
    <ul className="d5-leg d5-graf-leg" aria-label="Linhas do gráfico">
      {series.map((s) => (
        <li key={s.id}>
          <svg viewBox="0 0 22 8" width="22" height="8" aria-hidden>
            <line x1="1" x2="21" y1="4" y2="4" style={{ stroke: s.cor }} strokeWidth="2"
              strokeDasharray={s.tracejado} strokeLinecap="round" />
          </svg>
          <span>{s.rotulo}</span>
        </li>
      ))}
    </ul>
  );
}
