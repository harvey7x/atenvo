import {
  useEffect, useId, useLayoutEffect, useMemo, useState,
  type FocusEvent as ReactFocusEvent, type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { escalaBonita, type Balde } from '@/data/dashboardV5.series';
import { fmtInt } from '@/data/dashboardV5.formato';
import { Vazio } from './comum';

/* Gráfico de LINHAS multi-série ("ondas") — padrão da casa, versão enxuta (dono 12/11:
   "deixe mais minimizado, profissional"). Regras:
   - desenhado no TAMANHO REAL do cartão (ResizeObserver): texto de 11px e linha de 2px de
     verdade — antes o SVG esticava com a largura e números/traços ficavam enormes;
   - altura fixa e baixa; eixo com escala redonda (0 · 50 · 100 · 150), poucas guias claras;
   - curva monótona (Fritsch–Carlson): passa por TODOS os pontos medidos e nunca inventa
     pico ou vale entre eles — a suavidade é só visual;
   - UMA área em degradê, a da série em destaque (a do nome sob o mouse na legenda, senão a
     que mais somou no desenho) — várias áreas sobrepostas viravam borrão;
   - legenda clicável: esconde/mostra a linha (a escala se refaz com as visíveis) e destaca
     ao passar o mouse; cresceu/caiu/voltou ficam ao lado do nome;
   - mira por coluna: linha-guia, pontos e a dica AO LADO do ponto, dentro do gráfico;
     teclado: Tab foca, setas percorrem, Esc fecha; tabela invisível p/ leitor de tela;
   - cor só por token (--dado-1…5), zero animação (só a troca de opacidade ≤ 120 ms). */

export interface NotaSerie {
  texto: string;
  /** ok = verde · er = rubro · am = âmbar */
  tom: 'ok' | 'er' | 'am';
}

export interface SerieGraf {
  id: string;
  rotulo: string;
  /** token de cor ('var(--dado-1)') — nunca hex */
  cor: string;
  /** valor por chave de balde (ausente = 0) */
  valores: ReadonlyMap<string, number>;
  /** leitura curta ao lado do nome na legenda (cresceu · caiu · parou e voltou) */
  notas?: NotaSerie[];
}

const ALTURA_PADRAO = 236;
const PAD_L = 40;
const PAD_R = 14;
const PAD_T = 14;
const PAD_B = 26;
/** largura usada antes da medição (e no servidor / nos testes) */
const LARGURA_INICIAL = 760;
/** espaço mínimo entre dois rótulos do eixo das datas */
const ESPACO_ROTULO = 58;

const useLayoutSeguro = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/** Curva monótona de Fritsch–Carlson: passa por todos os pontos, sem overshoot
 *  (entre dois pontos a curva nunca sai do intervalo deles — nada é inventado). */
function caminhoSuave(px: number[], py: number[]): string {
  const n = px.length;
  if (n === 0) return '';
  if (n === 1) return `M${px[0].toFixed(1)} ${py[0].toFixed(1)}`;
  const dx: number[] = [];
  const m: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(px[i + 1] - px[i]);
    m.push((py[i + 1] - py[i]) / (px[i + 1] - px[i]));
  }
  const t: number[] = [m[0]];
  for (let i = 1; i < n - 1; i++) {
    if (m[i - 1] * m[i] <= 0) t.push(0);
    else {
      const w1 = 2 * dx[i] + dx[i - 1];
      const w2 = dx[i] + 2 * dx[i - 1];
      t.push((w1 + w2) / (w1 / m[i - 1] + w2 / m[i]));
    }
  }
  t.push(m[n - 2]);
  let d = `M${px[0].toFixed(1)} ${py[0].toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i];
    d += ` C${(px[i] + h / 3).toFixed(1)} ${(py[i] + (t[i] * h) / 3).toFixed(1)}`
      + ` ${(px[i + 1] - h / 3).toFixed(1)} ${(py[i + 1] - (t[i + 1] * h) / 3).toFixed(1)}`
      + ` ${px[i + 1].toFixed(1)} ${py[i + 1].toFixed(1)}`;
  }
  return d;
}

export function GrafLinhas({ baldes, series, titulo, vazio, rodape, altura = ALTURA_PADRAO }: {
  baldes: Balde[]; series: SerieGraf[]; titulo: string; vazio: string; rodape?: string; altura?: number;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const idTabela = `g${uid}-tab`;
  const idArea = `g${uid}-area`;
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const [W, setW] = useState(LARGURA_INICIAL);
  const [foco, setFoco] = useState<number | null>(null);
  const [ocultas, setOcultas] = useState<ReadonlySet<string>>(() => new Set());
  const [destaque, setDestaque] = useState<string | null>(null);
  const [anuncio, setAnuncio] = useState('');

  // mede o cartão (e acompanha a largura): o desenho é em pixels reais, não esticado
  useLayoutSeguro(() => {
    if (!el) return undefined;
    const medir = () => {
      const w = Math.round(el.getBoundingClientRect().width);
      if (w > 0) setW((v) => (v === w ? v : w));
    };
    medir();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);

  const pontos = useMemo(
    () => new Map(series.map((s) => [s.id, baldes.map((b) => s.valores.get(b.chave) ?? 0)])),
    [series, baldes],
  );

  const n = baldes.length;
  const temDado = n > 0 && series.some((s) => (pontos.get(s.id) ?? []).some((v) => v > 0));
  if (!temDado) return <Vazio texto={vazio} />;

  const visiveis = series.filter((s) => !ocultas.has(s.id));
  const valoresDe = (id: string) => pontos.get(id) ?? [];
  const soma = (id: string) => valoresDe(id).reduce((a, b) => a + b, 0);
  const lider = destaque && !ocultas.has(destaque)
    ? destaque
    : visiveis.reduce<string | null>((best, s) => (best == null || soma(s.id) > soma(best) ? s.id : best), null);

  // geometria em pixels reais
  const H = altura;
  const plotW = Math.max(40, W - PAD_L - PAD_R);
  const passoX = n > 1 ? plotW / (n - 1) : 0;
  const x = (i: number) => (n > 1 ? PAD_L + i * passoX : PAD_L + plotW / 2);
  const maxVis = Math.max(0, ...visiveis.flatMap((s) => valoresDe(s.id)));
  const esc = escalaBonita(maxVis);
  const y0 = H - PAD_B;
  const y = (v: number) => y0 - (v / esc.topo) * (y0 - PAD_T);
  const xs = baldes.map((_, i) => x(i));
  // rótulos das datas: um a cada k, contando do fim (o último — hoje — sempre aparece)
  const k = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(plotW / ESPACO_ROTULO))));
  const ancoraX = (i: number): 'start' | 'middle' | 'end' => (n > 1 && i === 0 ? 'start' : n > 1 && i === n - 1 ? 'end' : 'middle');

  const linhasDo = (i: number) => visiveis
    .map((s) => ({ id: s.id, rotulo: s.rotulo, cor: s.cor, v: valoresDe(s.id)[i] ?? 0 }))
    .sort((a, b) => b.v - a.v || a.rotulo.localeCompare(b.rotulo, 'pt-BR'));
  const textoDo = (i: number) => `${baldes[i]?.rotuloLongo ?? ''}: ${linhasDo(i).map((l) => `${l.rotulo} ${fmtInt(l.v)}`).join(', ')}`;

  const alternar = (id: string) => setOcultas((prev) => {
    const prox = new Set(prev);
    if (prox.has(id)) prox.delete(id);
    else {
      if (series.length - prox.size <= 1) return prev; // a última linha visível fica
      prox.add(id);
    }
    return prox;
  });

  const indiceDoMouse = (clientX: number): number => {
    if (!el || n <= 1) return 0;
    const px = clientX - el.getBoundingClientRect().left;
    return Math.min(n - 1, Math.max(0, Math.round((px - PAD_L) / passoX)));
  };
  const irPara = (i: number) => { setFoco(i); setAnuncio(textoDo(i)); };
  const aoTeclar = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') { setFoco(null); return; }
    const atual = foco ?? n - 1;
    let prox: number | null = null;
    if (e.key === 'ArrowLeft') prox = foco == null ? n - 1 : Math.max(0, atual - 1);
    else if (e.key === 'ArrowRight') prox = foco == null ? n - 1 : Math.min(n - 1, atual + 1);
    else if (e.key === 'Home') prox = 0;
    else if (e.key === 'End') prox = n - 1;
    if (prox == null) return;
    e.preventDefault();
    irPara(prox);
  };
  // só o foco pelo TECLADO abre a mira sozinho (clique de mouse não)
  const aoFocar = (e: ReactFocusEvent<HTMLDivElement>) => {
    let teclado = false;
    try { teclado = e.currentTarget.matches(':focus-visible'); } catch { /* navegador antigo */ }
    if (teclado && foco == null) irPara(n - 1);
  };

  const aDireita = foco != null && x(foco) < W * 0.6;
  const tip = foco != null ? linhasDo(foco) : [];
  const totalTip = tip.reduce((a, l) => a + l.v, 0);

  return (
    <div className="d5-graf-bloco">
      {series.length > 1 && (
        <ul className="d5-graf-leg" aria-label="Linhas do gráfico — clique para esconder ou mostrar">
          {series.map((s) => {
            const vis = !ocultas.has(s.id);
            return (
              <li key={s.id}>
                <button type="button" className="d5-graf-leg-bt" aria-pressed={vis}
                  aria-label={[s.rotulo, ...(vis ? (s.notas ?? []).map((nt) => nt.texto) : [])].join(', ')}
                  title={vis ? 'Esconder esta linha' : 'Mostrar esta linha'}
                  onClick={() => alternar(s.id)}
                  onMouseEnter={() => vis && setDestaque(s.id)} onMouseLeave={() => setDestaque(null)}
                  onFocus={() => vis && setDestaque(s.id)} onBlur={() => setDestaque(null)}>
                  <i aria-hidden style={{ color: s.cor }} />
                  <span className="d5-graf-leg-nome">{s.rotulo}</span>
                  {vis && s.notas?.map((nt) => (
                    <span key={nt.texto} className={`d5-graf-leg-nota d5-graf-leg-${nt.tom}`}>{nt.texto}</span>
                  ))}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div ref={setEl} className="d5-graf" tabIndex={0} role="img"
        aria-label={`${titulo}. Use as setas para percorrer os pontos.`} aria-describedby={idTabela}
        onMouseMove={(e) => setFoco(indiceDoMouse(e.clientX))}
        onMouseLeave={() => setFoco(null)}
        onKeyDown={aoTeclar} onFocus={aoFocar} onBlur={() => setFoco(null)}>
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="d5-graf-svg" aria-hidden focusable="false">
          {lider && n > 1 && (
            <defs>
              <linearGradient id={idArea} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" style={{ stopColor: series.find((s) => s.id === lider)?.cor }} stopOpacity=".16" />
                <stop offset="1" style={{ stopColor: series.find((s) => s.id === lider)?.cor }} stopOpacity="0" />
              </linearGradient>
            </defs>
          )}
          {esc.ticks.map((t) => (
            <g key={t}>
              <line x1={PAD_L} x2={W - PAD_R} y1={y(t)} y2={y(t)} className={t === 0 ? 'd5-graf-base' : 'd5-graf-guia'} />
              <text x={PAD_L - 10} y={y(t) + 3.5} className="d5-graf-eixo" textAnchor="end">{fmtInt(t)}</text>
            </g>
          ))}
          {baldes.map((b, i) => ((n - 1 - i) % k === 0) && (
            <text key={b.chave} x={x(i)} y={H - 7} className="d5-graf-eixo" textAnchor={ancoraX(i)}>{b.rotulo}</text>
          ))}
          {lider && n > 1 && (
            <path className="d5-graf-area"
              d={`${caminhoSuave(xs, valoresDe(lider).map(y))} L${x(n - 1).toFixed(1)} ${y0} L${x(0).toFixed(1)} ${y0} Z`}
              fill={`url(#${idArea})`} />
          )}
          {foco != null && <line className="d5-graf-mira" x1={x(foco)} x2={x(foco)} y1={PAD_T - 6} y2={y0} />}
          {visiveis.map((s) => (
            <path key={s.id} className="d5-graf-linha" d={caminhoSuave(xs, valoresDe(s.id).map(y))}
              style={{ stroke: s.cor }} data-apagada={destaque && destaque !== s.id ? '' : undefined} />
          ))}
          {/* pontos: na coluna sob a mira (ou sempre, quando o desenho tem um balde só) */}
          {(foco != null || n === 1) && visiveis.map((s) => (
            <circle key={s.id} cx={x(foco ?? 0)} cy={y(valoresDe(s.id)[foco ?? 0] ?? 0)} r="3.5"
              className="d5-graf-ponto" style={{ fill: s.cor }} />
          ))}
        </svg>

        {foco != null && (
          <div className="d5-graf-tip" aria-hidden
            style={{ left: aDireita ? x(foco) + 14 : x(foco) - 14, top: PAD_T, transform: aDireita ? undefined : 'translateX(-100%)' }}>
            <b className="d5-graf-tip-t">{baldes[foco]?.rotuloLongo}</b>
            {tip.map((l) => (
              <span key={l.id} className="d5-graf-tip-l">
                <i style={{ background: l.cor }} />
                <span className="d5-graf-tip-n">{l.rotulo}</span>
                <b className="num">{fmtInt(l.v)}</b>
              </span>
            ))}
            {tip.length > 1 && (
              <span className="d5-graf-tip-l d5-graf-tip-tot">
                <span className="d5-graf-tip-n">Total</span>
                <b className="num">{fmtInt(totalTip)}</b>
              </span>
            )}
          </div>
        )}
      </div>

      <span className="d5-sr" aria-live="polite">{anuncio}</span>
      {rodape && <p className="d5-graf-nota">{rodape}</p>}
      <table className="d5-sr" id={idTabela}>
        <caption>{titulo}</caption>
        <thead><tr><th scope="col">Período</th>{series.map((s) => <th key={s.id} scope="col">{s.rotulo}</th>)}</tr></thead>
        <tbody>
          {baldes.map((b, i) => (
            <tr key={b.chave}>
              <th scope="row">{b.rotuloLongo}</th>
              {series.map((s) => <td key={s.id}>{fmtInt(valoresDe(s.id)[i] ?? 0)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
