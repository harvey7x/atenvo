/* Portabilidades — peças usadas pela tela e pela Nova portabilidade. */
import { REGRA_DIVISAO, pctCliente, reais, type Divisao } from '@/data/portabilidades';

/** barra + a divisão do valor do cliente: ele fica com 70%; 30% vai para o escritório e,
 *  dentro desses 30%, 15% vai para o atendente (o resto fica no escritório) */
export function Partes({ d, atendente }: { d: Divisao; atendente: string }) {
  const r = REGRA_DIVISAO;
  const total = d.cliente + d.escritorio;
  const larg = (v: number) => (total > 0 ? `${(v / total) * 100}%` : '0%');
  return (
    <>
      <div className="pt-barra" aria-hidden data-vazia={total > 0 ? undefined : ''}>
        <i data-p="cliente" style={{ width: larg(d.cliente) }} />
        <i data-p="escritorio" style={{ width: larg(d.escritorioLiquido) }} />
        <i data-p="atendente" style={{ width: larg(d.atendente) }} />
      </div>
      <dl className="pt-div">
        <div><dt><i data-p="cliente" aria-hidden />Cliente fica com</dt><dd><span className="pt-pct num">{pctCliente()}%</span><b className="num">{reais(d.cliente)}</b></dd></div>
        <div><dt><i data-p="escritorio" aria-hidden />Escritório</dt><dd><span className="pt-pct num">{r.escritorio}%</span><b className="num">{reais(d.escritorio)}</b></dd></div>
        <div className="pt-div-sub">
          <dt><i data-p="atendente" aria-hidden /><span className="pt-div-at">Atendente · {atendente}</span></dt>
          <dd><span className="pt-pct num">{r.atendenteDoEscritorio}% dos {r.escritorio}%</span><b className="num">{reais(d.atendente)}</b></dd>
        </div>
        <div className="pt-div-sub">
          <dt><i data-p="escritorio" aria-hidden />Fica no escritório</dt>
          <dd><span className="pt-pct num">{100 - r.atendenteDoEscritorio}% dos {r.escritorio}%</span><b className="num">{reais(d.escritorioLiquido)}</b></dd>
        </div>
      </dl>
    </>
  );
}
