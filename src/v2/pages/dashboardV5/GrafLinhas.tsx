import {
  useCallback, useEffect, useId, useLayoutEffect, useMemo, useState,
  type FocusEvent as ReactFocusEvent, type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { escalaBonita, type Balde } from '@/data/dashboardV5.series';
import { fmtInt } from '@/data/dashboardV5.formato';
import { Vazio } from './comum';

/* Gráfico de LINHAS multi-série ("ondas") no estilo da referência aprovada pelo dono
   (12/11, "Project Activity": "eu quero assim"):
   - cada linha com a SUA área em degradê, da cor da linha até sumir na base (as maiores
     atrás, as menores na frente), curva suave e linha de 2px;
   - desenhado no TAMANHO REAL do cartão (ResizeObserver): texto de 11px e traço de 2px de
     verdade, nunca esticado; eixo com escala redonda (0 · 50 · 100 · 150 · 200);
   - mira: linha-guia, ponto com halo nas linhas que têm valor e a dica LOGO ACIMA do ponto
     (vai para o lado quando não cabe em cima);
   - legenda = botões (esconde/mostra a linha; a escala se refaz; passar o mouse destaca):
     pode morar no topo do cartão (useLinhasGraf + LegendaGraf) ou acima do desenho;
   - a curva é monótona (Fritsch–Carlson): passa por TODOS os pontos medidos e nunca
     inventa pico ou vale entre eles — a suavidade é só visual;
   - teclado: Tab foca, setas percorrem, Esc fecha; tabela invisível p/ leitor de tela;
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

/** Estado da legenda (linhas escondidas e a destacada) — fica com quem desenha o cartão
 *  quando a legenda mora no topo dele, junto do título. */
export interface ControleLinhas {
  ocultas: ReadonlySet<string>;
  destaque: string | null;
  /** esconde/mostra; a última linha visível nunca some */
  alternar: (id: string, totalSeries: number) => void;
  destacar: (id: string | null) => void;
}

export function useLinhasGraf(): ControleLinhas {
  const [ocultas, setOcultas] = useState<ReadonlySet<string>>(() => new Set());
  const [destaque, setDestaque] = useState<string | null>(null);
  const alternar = useCallback((id: string, totalSeries: number) => setOcultas((prev) => {
    const prox = new Set(prev);
    if (prox.has(id)) prox.delete(id);
    else {
      if (totalSeries - prox.size <= 1) return prev;
      prox.add(id);
    }
    return prox;
  }), []);
  return useMemo(() => ({ ocultas, destaque, alternar, destacar: setDestaque }), [ocultas, destaque, alternar]);
}

/** Legenda em botões: ponto na cor · nome · leitura curta. Clicar esconde/mostra a linha. */
export function LegendaGraf({ series, controle, className }: {
  series: SerieGraf[]; controle: ControleLinhas; className?: string;
}) {
  if (series.length < 2) return null;
  return (
    <ul className={'d5-graf-leg' + (className ? ` ${className}` : '')} aria-label="Linhas do gráfico — clique para esconder ou mostrar">
      {series.map((s) => {
        const vis = !controle.ocultas.has(s.id);
        return (
          <li key={s.id}>
            <button type="button" className="d5-graf-leg-bt" aria-pressed={vis}
              aria-label={[s.rotulo, ...(vis ? (s.notas ?? []).map((nt) => nt.texto) : [])].join(', ')}
              title={vis ? 'Esconder esta linha' : 'Mostrar esta linha'}
              onClick={() => controle.alternar(s.id, series.length)}
              onMouseEnter={() => vis && controle.destacar(s.id)} onMouseLeave={() => controle.destacar(null)}
              onFocus={() => vis && controle.destacar(s.id)} onBlur={() => controle.destacar(null)}>
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
  );
}

const ALTURA_PADRAO = 260;
const PAD_L = 40;
const PAD_R = 14;
const PAD_T = 16;
const PAD_B = 26;
/** largura usada antes da medição (e no servidor / nos testes) */
const LARGURA_INICIAL = 760;
/** espaço mínimo entre dois rótulos do eixo das datas */
const ESPACO_ROTULO = 58;
/** largura fixa da dica (deixa a conta de posição exata) */
const LARGURA_DICA = 196;

const useLayoutSeguro = typeof window === 'undefined' ? useEffect : useLayoutEffect;
const limitar = (v: number, a: number, b: number) => Math.min(Math.max(v, a), Math.max(a, b));

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

export function GrafLinhas({ baldes, series, titulo, vazio, rodape, altura = ALTURA_PADRAO, controle }: {
  baldes: Balde[]; series: SerieGraf[]; titulo: string; vazio: string; rodape?: string; altura?: number;
  /** estado da legenda quando ela mora no topo do cartão; sem ele, a legenda vem acima do desenho */
  controle?: ControleLinhas;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const idTabela = `g${uid}-tab`;
  const interno = useLinhasGraf();
  const ctl = controle ?? interno;
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const [W, setW] = useState(LARGURA_INICIAL);
  const [foco, setFoco] = useState<number | null>(null);
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

  const { ocultas, destaque } = ctl;
  const visiveis = series.filter((s) => !ocultas.has(s.id));
  const valoresDe = (id: string) => pontos.get(id) ?? [];
  const soma = (id: string) => valoresDe(id).reduce((a, b) => a + b, 0);
  const emDestaque = destaque && !ocultas.has(destaque) ? destaque : null;
  // áreas: a maior atrás, a menor na frente; com uma linha em destaque, só a dela
  const comArea = (emDestaque ? visiveis.filter((s) => s.id === emDestaque) : [...visiveis])
    .sort((a, b) => soma(b.id) - soma(a.id));

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

  // dica: logo ACIMA do ponto mais alto da coluna; sem espaço em cima, ao lado dele
  const tip = foco != null ? linhasDo(foco) : [];
  const totalTip = tip.reduce((a, l) => a + l.v, 0);
  let estiloDica: Record<string, string | number> | null = null;
  if (foco != null) {
    const linhasDica = tip.length + (tip.length > 1 ? 1 : 0);
    const altDica = 32 + linhasDica * 19;
    const comValor = tip.filter((l) => l.v > 0);
    const yTopo = comValor.length ? Math.min(...comValor.map((l) => y(l.v))) : y0;
    const xf = x(foco);
    if (yTopo - 16 - altDica >= 0) {
      estiloDica = { left: limitar(xf - LARGURA_DICA / 2, 0, W - LARGURA_DICA), top: yTopo - 16, transform: 'translateY(-100%)' };
    } else {
      const aDireita = xf + 18 + LARGURA_DICA <= W;
      estiloDica = {
        left: aDireita ? xf + 18 : xf - 18 - LARGURA_DICA,
        top: limitar(yTopo - altDica / 2, 0, H - altDica),
      };
    }
  }

  return (
    <div className="d5-graf-bloco">
      {!controle && <LegendaGraf series={series} controle={ctl} className="d5-graf-leg-acima" />}

      <div ref={setEl} className="d5-graf" tabIndex={0} role="img"
        aria-label={`${titulo}. Use as setas para percorrer os pontos.`} aria-describedby={idTabela}
        onMouseMove={(e) => setFoco(indiceDoMouse(e.clientX))}
        onMouseLeave={() => setFoco(null)}
        onKeyDown={aoTeclar} onFocus={aoFocar} onBlur={() => setFoco(null)}>
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="d5-graf-svg" aria-hidden focusable="false">
          {n > 1 && (
            <defs>
              {comArea.map((s) => (
                <linearGradient key={s.id} id={`g${uid}-a-${s.id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" className="d5-graf-stop-topo" style={{ stopColor: s.cor }} />
                  <stop offset=".55" className="d5-graf-stop-meio" style={{ stopColor: s.cor }} />
                  <stop offset="1" className="d5-graf-stop-base" style={{ stopColor: s.cor }} />
                </linearGradient>
              ))}
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
          {n > 1 && comArea.map((s) => (
            <path key={s.id} className="d5-graf-area"
              d={`${caminhoSuave(xs, valoresDe(s.id).map(y))} L${x(n - 1).toFixed(1)} ${y0} L${x(0).toFixed(1)} ${y0} Z`}
              fill={`url(#g${uid}-a-${s.id})`} />
          ))}
          {foco != null && <line className="d5-graf-mira" x1={x(foco)} x2={x(foco)} y1={PAD_T - 6} y2={y0} />}
          {visiveis.map((s) => (
            <path key={s.id} className="d5-graf-linha" d={caminhoSuave(xs, valoresDe(s.id).map(y))}
              style={{ stroke: s.cor }} data-apagada={emDestaque && emDestaque !== s.id ? '' : undefined} />
          ))}
          {/* ponto com halo: na coluna sob a mira (ou sempre, com um balde só), só onde há valor */}
          {(foco != null || n === 1) && visiveis
            .filter((s) => (valoresDe(s.id)[foco ?? 0] ?? 0) > 0)
            .map((s) => (
              <g key={s.id}>
                <circle cx={x(foco ?? 0)} cy={y(valoresDe(s.id)[foco ?? 0] ?? 0)} r="9" className="d5-graf-halo" style={{ fill: s.cor }} />
                <circle cx={x(foco ?? 0)} cy={y(valoresDe(s.id)[foco ?? 0] ?? 0)} r="4.5" className="d5-graf-ponto" style={{ fill: s.cor }} />
              </g>
            ))}
        </svg>

        {foco != null && estiloDica && (
          <div className="d5-graf-tip" aria-hidden style={estiloDica}>
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
