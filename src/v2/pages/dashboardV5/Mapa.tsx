import { useMemo, useState } from 'react';
import type { CelulaMapaV5 } from '@/data/dashboardV5.tipos';
import { dowIsoV5, type JanelaMapaV5 } from '@/data/dashboardV5.periodo';
import { faixasEscalaV5, fmtDec, fmtInt } from '@/data/dashboardV5.formato';
import { Skeleton } from '../../components';
import { Pop, Secao, Vazio, ancoraDe, type Ancora } from './comum';

/* Entradas por dia e hora (São Paulo). Até 14 dias: uma linha por data; acima
   disso, média por dia da semana. Escala sequencial de 5 degraus a partir da cor
   de dado (--dado-1), células arredondadas com 2px de respiro, hoje em destaque,
   total por linha à direita e uma faixa com o total por hora embaixo.
   Período curto (Hoje, 3 dias): o mapa mostra 7 dias para dar contexto; os dias
   FORA do período escolhido ficam esmaecidos e o total do pé diz "em 7 dias". */

const HORAS = Array.from({ length: 24 }, (_, h) => h);
const DOW_CURTO = ['', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];
const DOW_LONGO = ['', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
const ddmm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const TZ = 'America/Sao_Paulo';
const horaSP = (iso: string) => Number(new Date(iso).toLocaleTimeString('en-GB', { timeZone: TZ, hour: '2-digit', hour12: false }).slice(0, 2)) % 24;

interface Linha {
  chave: string;
  rotulo: string;
  /** texto do tooltip para a linha: 'qua 15/10' ou 'segunda' */
  nomeTip: string;
  valores: number[];
  total: number;
  hoje: boolean;
  /** dia desenhado só como contexto (fora do período escolhido) */
  fora: boolean;
  /** a partir desta hora ainda não aconteceu (só a linha de hoje) */
  futuroDesde: number | null;
}

const degrau = (v: number, ref: number) => (v <= 0 || ref <= 0 ? 0 : Math.min(5, Math.max(1, Math.ceil((v / ref) * 5))));

/** Topo da escala: percentil 95 das células com entrada (um pico isolado — ex.: 122 entradas
 *  em 11 minutos num disparo — não apaga o resto do mapa); com poucas células, o máximo. */
function topoEscala(valores: number[]): number {
  const v = valores.filter((x) => x > 0).sort((a, b) => a - b);
  if (!v.length) return 0;
  if (v.length < 20) return v[v.length - 1];
  return v[Math.min(v.length - 1, Math.floor(0.95 * (v.length - 1)))];
}

export function Mapa({ mapa, janela, hoje, geradoEm }: {
  mapa: CelulaMapaV5[]; janela: JanelaMapaV5; hoje: string; geradoEm: string;
}) {
  const [tip, setTip] = useState<{ ancora: Ancora; texto: string } | null>(null);
  const semana = janela.modo === 'semana';

  const { linhas, porHora, max, maxHora, total } = useMemo(() => {
    const porDia = new Map<string, number[]>();
    for (const d of janela.dias) porDia.set(d, Array<number>(24).fill(0));
    for (const c of mapa) {
      const lin = porDia.get(c.dia);
      if (lin && c.hora >= 0 && c.hora < 24) lin[c.hora] += c.entradas;
    }
    const horaAgora = horaSP(geradoEm);
    const noPeriodo = (d: string) => d >= janela.periodoIniDate && d < janela.periodoFimDate;
    let ls: Linha[];
    if (!semana) {
      ls = janela.dias.map((d) => {
        const valores = porDia.get(d)!;
        const ehHoje = d === hoje;
        return {
          chave: d,
          rotulo: ehHoje ? 'Hoje' : `${DOW_CURTO[dowIsoV5(d)]} ${ddmm(d)}`,
          nomeTip: `${DOW_CURTO[dowIsoV5(d)]} ${ddmm(d)}`,
          valores, total: valores.reduce((a, b) => a + b, 0), hoje: ehHoje,
          fora: janela.estendido && !noPeriodo(d),
          futuroDesde: ehHoje ? horaAgora + 1 : null,
        };
      });
    } else {
      // média por ocorrência do dia da semana, HORA a HORA: hoje só entra nas horas que já
      // terminaram (o dia pela metade puxaria para baixo a média das horas que ainda não vieram)
      const somas = Array.from({ length: 8 }, () => Array<number>(24).fill(0));
      const ocorr = Array.from({ length: 8 }, () => Array<number>(24).fill(0));
      for (const d of janela.dias) {
        const w = dowIsoV5(d);
        porDia.get(d)!.forEach((v, h) => {
          if (d === hoje && h >= horaAgora) return;
          somas[w][h] += v;
          ocorr[w][h]++;
        });
      }
      ls = [1, 2, 3, 4, 5, 6, 7].filter((w) => ocorr[w].some((n) => n > 0)).map((w) => {
        const valores = somas[w].map((v, h) => (ocorr[w][h] ? v / ocorr[w][h] : 0));
        const dias = Math.max(...ocorr[w]);
        return {
          chave: `w${w}`, rotulo: DOW_LONGO[w], nomeTip: `${DOW_LONGO[w].toLowerCase()} (média de ${dias})`,
          valores, total: valores.reduce((a, b) => a + b, 0), hoje: false, fora: false, futuroDesde: null,
        };
      });
    }
    const ph = HORAS.map((h) => ls.reduce((s, l) => s + l.valores[h], 0));
    return {
      linhas: ls,
      porHora: ph,
      max: topoEscala(ls.flatMap((l) => l.valores.filter((_, h) => l.futuroDesde == null || h < l.futuroDesde))),
      maxHora: Math.max(0, ...ph),
      total: ls.reduce((s, l) => s + l.total, 0),
    };
  }, [mapa, janela, hoje, geradoEm, semana]);

  const fmtV = (v: number) => (semana ? fmtDec(v, 1) : fmtInt(v));
  const unid = (v: number) => (!semana && Math.round(v) === 1 ? 'entrada' : 'entradas');
  const nDias = janela.dias.length;
  const sub = janela.estendido
    ? `${janela.terminaHoje ? 'Últimos 7 dias' : `7 dias até ${ddmm(janela.ultimoDate)}`}, pela hora de chegada (horário de Brasília). Em destaque, o período escolhido.`
    : semana
      ? `Média por dia da semana em ${nDias} dias, pela hora de chegada (horário de Brasília).`
      : 'Uma linha por dia, pela hora de chegada (horário de Brasília).';

  const faixas = faixasEscalaV5(max, semana);
  const legenda = (
    <ul className="d5-leg" aria-label={semana ? 'Escala: média de entradas por hora' : 'Escala: entradas por hora'}>
      <li><i className="d5-q0" aria-hidden /><span className="num">0</span></li>
      {faixas.map((f) => <li key={f.q}><i className={`d5-q${f.q}`} aria-hidden /><span className="num">{f.rotulo}</span></li>)}
    </ul>
  );

  const mostrar = (el: Element, texto: string) => setTip({ ancora: ancoraDe(el), texto });
  // pé: total do que está desenhado; diz a que se refere quando não é o período escolhido
  const peTotal = semana ? total / Math.max(1, linhas.length) : total;
  const peLegenda = semana ? 'por dia' : janela.estendido ? `em ${fmtInt(nDias)} ${nDias === 1 ? 'dia' : 'dias'}` : null;

  return (
    <Secao className="d5-mapa" titulo="Entradas por dia e hora" sub={total > 0 ? sub : undefined} acao={total > 0 ? legenda : undefined}>
      {total === 0 ? (
        <Vazio texto="Sem entradas para desenhar neste período." />
      ) : (
        <div className="d5-calor" onMouseLeave={() => setTip(null)}>
          <div className="d5-calor-grade" role="table" aria-label={semana ? 'Média de entradas por dia da semana e hora' : 'Entradas por dia e hora'}>
            <div className="d5-calor-lin d5-calor-cab" role="row">
              <span className="d5-calor-rot" role="columnheader"><span className="d5-sr">{semana ? 'Dia da semana' : 'Dia'}</span></span>
              {HORAS.map((h) => (
                <span key={h} role="columnheader" className={'d5-calor-h' + (h % 3 ? ' d5-calor-h-sec' : '')} aria-label={`${h} horas`}>{h}h</span>
              ))}
              <span className="d5-calor-tot" role="columnheader">{semana ? 'Média' : 'Total'}</span>
            </div>
            {linhas.map((l) => (
              <div key={l.chave} role="row" className={'d5-calor-lin' + (l.hoje ? ' d5-calor-hoje' : '') + (l.fora ? ' d5-calor-fora' : '')}>
                <span className="d5-calor-rot" role="rowheader" title={l.fora ? `${l.nomeTip} (fora do período escolhido)` : l.nomeTip}>{l.rotulo}</span>
                {l.valores.map((v, h) => {
                  const futuro = l.futuroDesde != null && h >= l.futuroDesde;
                  const q = futuro ? 0 : degrau(v, max);
                  const texto = `${l.nomeTip} · ${h}h · ${fmtV(v)} ${unid(v)}${semana ? ' em média' : ''}${l.fora ? ' (fora do período)' : ''}`;
                  return (
                    <span key={h} role="cell"
                      className={'d5-cel' + (futuro ? ' d5-cel-futuro' : q ? ` d5-q${q}` : ' d5-q0')}
                      aria-label={futuro ? `${l.nomeTip} ${h} horas: ainda não aconteceu` : texto}
                      onMouseEnter={futuro ? () => setTip(null) : (e) => mostrar(e.currentTarget, texto)} />
                  );
                })}
                <span className="d5-calor-tot num" role="cell">{fmtV(l.total)}</span>
              </div>
            ))}
            <div className="d5-calor-lin d5-calor-pe" role="row">
              <span className="d5-calor-rot" role="rowheader">{semana ? 'Média/hora' : 'Por hora'}</span>
              {porHora.map((v, h) => {
                const vv = semana ? v / Math.max(1, linhas.length) : v;
                const texto = semana
                  ? `${h}h · ${fmtDec(vv, 1)} entradas por dia em média`
                  : `${h}h · ${fmtInt(v)} ${unid(v)}${janela.estendido ? ` em ${fmtInt(nDias)} dias` : ' no total'}`;
                return (
                  <span key={h} role="cell" className="d5-hbar" aria-label={texto}
                    onMouseEnter={(e) => mostrar(e.currentTarget, texto)}>
                    <i style={{ height: `${maxHora > 0 ? Math.max(v > 0 ? 6 : 0, (v / maxHora) * 100) : 0}%` }} />
                  </span>
                );
              })}
              <span className="d5-calor-tot d5-calor-tot-pe" role="cell">
                <b className="num">{semana ? fmtDec(peTotal, 0) : fmtInt(peTotal)}</b>
                {peLegenda && <small>{peLegenda}</small>}
              </span>
            </div>
          </div>
          <Pop ancora={tip?.ancora ?? null} papel="status"><span className="d5-pop-tx num">{tip?.texto}</span></Pop>
        </div>
      )}
    </Secao>
  );
}

export function MapaSkeleton() {
  return (
    <Secao className="d5-mapa" titulo="Entradas por dia e hora">
      <div className="d5-sk-linhas" aria-hidden>
        {Array.from({ length: 7 }, (_, i) => <Skeleton key={i} altura={22} raio={4} />)}
      </div>
    </Secao>
  );
}
