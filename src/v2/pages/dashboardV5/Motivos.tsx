import type { NeV5 } from '@/data/dashboardV5.tipos';
import { fmtInt, fmtPct, pctDe, rotuloMotivoNe } from '@/data/dashboardV5.formato';
import { Skeleton } from '../../components';
import { Secao, Vazio } from './comum';

/* Não elegíveis por motivo: barras horizontais (contagem e % do total), do maior
   para o menor, e logo abaixo quem marcou (IA, regra automática do RS, equipe). O
   comprimento da barra É o % ao lado dela (61% enche 61% do trilho). */

const QUEM: { chave: keyof NeV5['quem']; rotulo: string; dica: string }[] = [
  { chave: 'ia', rotulo: 'IA', dica: 'A IA descartou na conversa' },
  { chave: 'regraRs', rotulo: 'Regra RS', dica: 'Regra automática: DDD fora do RS, marcado na chegada' },
  { chave: 'equipe', rotulo: 'Equipe', dica: 'Marcado por alguém da equipe' },
];

export function Motivos({ ne }: { ne: NeV5 }) {
  const totQuem = ne.quem.ia + ne.quem.regraRs + ne.quem.equipe;
  return (
    <Secao className="d5-mot" titulo="Não elegíveis por motivo"
      sub={ne.total > 0 ? <><b className="num">{fmtInt(ne.total)}</b> no período</> : undefined}>
      {ne.motivos.length === 0 ? (
        <Vazio texto="Nenhum lead marcado como não elegível no período." />
      ) : (
        <ol className="d5-barras" aria-label="Motivos">
          {ne.motivos.map((m) => {
            const p = pctDe(m.qtd, ne.total);
            return (
              <li key={m.motivo} className="d5-barra" data-d5-alvo={`motivos:${m.motivo}`}>
                <div className="d5-barra-tx">
                  <span className="d5-barra-rot">{rotuloMotivoNe(m.motivo)}</span>
                  <span className="d5-barra-v">
                    <b className="num">{fmtInt(m.qtd)}</b>
                    <small className="num">{fmtPct(p)}</small>
                  </span>
                </div>
                <span className="d5-trilho d5-trilho-g" aria-hidden>
                  <i style={{ width: `${Math.max(1.5, p ?? 0)}%` }} />
                </span>
              </li>
            );
          })}
        </ol>
      )}
      {totQuem > 0 && (
        <div className="d5-quem">
          <div className="d5-quem-tit">Quem marcou</div>
          <div className="d5-quem-barra" role="img"
            aria-label={QUEM.map((q) => `${q.rotulo}: ${fmtInt(ne.quem[q.chave])}`).join(', ')}>
            {QUEM.map((q) => ne.quem[q.chave] > 0 && (
              <i key={q.chave} className={`d5-quem-${q.chave}`} style={{ flexGrow: ne.quem[q.chave] }} title={`${q.dica}: ${fmtInt(ne.quem[q.chave])}`} />
            ))}
          </div>
          <ul className="d5-quem-leg">
            {QUEM.map((q) => (
              <li key={q.chave} title={q.dica}>
                <i className={`d5-quem-${q.chave}`} aria-hidden />
                <span>{q.rotulo}</span>
                <b className="num">{fmtInt(ne.quem[q.chave])}</b>
                <small className="num">{fmtPct(pctDe(ne.quem[q.chave], totQuem))}</small>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Secao>
  );
}

export function MotivosSkeleton() {
  return (
    <Secao className="d5-mot" titulo="Não elegíveis por motivo">
      <div className="d5-sk-linhas" aria-hidden>
        {Array.from({ length: 5 }, (_, i) => <Skeleton key={i} altura={30} raio={6} />)}
      </div>
    </Secao>
  );
}
