import { useState } from 'react';
import type { CanalV5, KpisV5 } from '@/data/dashboardV5.tipos';
import { fmtInt, fmtPct, fmtTelefone, pctDe, rotuloMotivoNe } from '@/data/dashboardV5.formato';
import { Skeleton } from '../../components';
import { Ajuda, Legenda, Pop, PontoStatus, Secao, TempoFechar, ancoraDe, type Ancora } from './comum';

/* Entradas por número: todos os WhatsApp conectados (mesmo com zero) e uma linha
   "Números antigos" para o que chega por números que já saíram. Não elegíveis e
   fechados contam pela data em que foram marcados. A barra de entradas mede a
   PARTICIPAÇÃO no total (o mesmo número do % embaixo dela).
   JÁ ESTAVAM NO SISTEMA (dono, 30/10): as entradas contam também quem já tinha falado com a
   CAF e voltou pela mensagem do anúncio (o Gerenciador conta); embaixo da barra, "N já
   estavam" abre por qual tráfego eles tinham entrado antes e quantos vieram pelo anúncio —
   a mesma régua e os mesmos rótulos do relatório diário em PDF. */

/** Contagem de não elegíveis com a quebra por motivo numa bolha (hover e foco). */
function CelulaNe({ c }: { c: CanalV5 }) {
  const [ancora, setAncora] = useState<Ancora | null>(null);
  const motivos = Object.entries(c.neMotivos).filter(([, q]) => q > 0).sort((a, b) => b[1] - a[1]);
  if (c.ne === 0) return <span className="num d5-mudo">0</span>;
  const abrir = (el: Element) => setAncora(ancoraDe(el));
  const fechar = () => setAncora(null);
  const id = `d5-ne-${c.canalId ?? 'antigos'}`;
  return (
    <>
      <button type="button" className="d5-ne-btn" aria-describedby={ancora ? id : undefined}
        aria-label={`${fmtInt(c.ne)} não elegíveis em ${c.nome}. Ver motivos`}
        onMouseEnter={(e) => abrir(e.currentTarget)} onMouseLeave={fechar}
        onFocus={(e) => abrir(e.currentTarget)} onBlur={fechar}>
        {fmtInt(c.ne)}
      </button>
      <Pop ancora={ancora} id={id} largura={300}>
        <span className="d5-pop-tit"><Legenda partes={[c.nome, 'não elegíveis']} /></span>
        <ul className="d5-pop-lista">
          {motivos.map(([m, q]) => (
            <li key={m}>
              <span>{rotuloMotivoNe(m)}</span>
              <b className="num">{fmtInt(q)}</b>
            </li>
          ))}
        </ul>
      </Pop>
    </>
  );
}

/** "N já estavam": por qual tráfego tinham entrado antes e quantos vieram pela mensagem do anúncio (bolha). */
function JaEstavam({ c }: { c: CanalV5 }) {
  const [ancora, setAncora] = useState<Ancora | null>(null);
  const abrir = (el: Element) => setAncora(ancoraDe(el));
  const fechar = () => setAncora(null);
  const id = `d5-ja-${c.canalId ?? 'antigos'}`;
  const nome = c.situacao === 'antigo' ? 'Números antigos' : c.nome;
  const ja = `${fmtInt(c.retornos)} já ${c.retornos === 1 ? 'estava' : 'estavam'}`;
  return (
    <>
      <button type="button" className="d5-ja-btn num" aria-describedby={ancora ? id : undefined}
        aria-label={`${ja} no sistema em ${nome}. Ver por onde tinham entrado`}
        onMouseEnter={(e) => abrir(e.currentTarget)} onMouseLeave={fechar}
        onFocus={(e) => abrir(e.currentTarget)} onBlur={fechar}>
        {ja}
      </button>
      <Pop ancora={ancora} id={id} largura={320}>
        <span className="d5-pop-tit"><Legenda partes={[nome, `${ja} no sistema`]} /></span>
        <span className="d5-pop-sub">Voltaram pela mensagem do anúncio; tinham entrado antes por:</span>
        <ul className="d5-pop-lista">
          {c.retornosOrigens.map((o) => (
            <li key={o.nome}><span>{o.nome}</span><b className="num">{fmtInt(o.n)}</b></li>
          ))}
        </ul>
        {c.peloAnuncio != null && (
          <span className="d5-pop-rod">
            <span>Pelo anúncio (como no Gerenciador de Anúncios)</span><b className="num">{fmtInt(c.peloAnuncio)}</b>
          </span>
        )}
      </Pop>
    </>
  );
}

export function PorNumero({ canais, kpis }: { canais: CanalV5[]; kpis: KpisV5 }) {
  const totEnt = canais.reduce((s, c) => s + c.entradas, 0);
  const totNe = canais.reduce((s, c) => s + c.ne, 0);
  const totGan = canais.reduce((s, c) => s + c.ganhos, 0);
  const totRet = canais.reduce((s, c) => s + c.retornos, 0);
  const repetidos = totEnt - kpis.entradas;
  return (
    <Secao className="d5-num" titulo="Entradas por número"
      sub="Todos os números conectados, mesmo sem entrada. As entradas contam também quem já estava no sistema e voltou pela mensagem do anúncio. Não elegíveis e fechados contam pelo dia da marcação.">
      <div className="d5-tab-rolo">
        <table className="d5-tab">
          <colgroup>
            <col className="d5-c-nome" /><col className="d5-c-ent" /><col className="d5-c-n" /><col className="d5-c-n" /><col className="d5-c-t" />
          </colgroup>
          <thead>
            <tr>
              <th scope="col">Número</th>
              <th scope="col" className="d5-dir">Entradas</th>
              <th scope="col" className="d5-dir">Não elegíveis</th>
              <th scope="col" className="d5-dir">Fechados</th>
              <th scope="col" className="d5-dir">
                <span className="d5-th-ajuda">
                  <Ajuda rotulo="Tempo para fechar" texto="Mediana do tempo entre a chegada do lead e o fechamento, de todos os fechados do período neste número. Embaixo: a média e quantos fecharam." />
                  <span>Tempo para fechar</span>
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {canais.map((c) => {
              const share = pctDe(c.entradas, totEnt);
              return (
                <tr key={c.canalId ?? 'antigos'} className={c.situacao === 'antigo' ? 'd5-lin-antigo' : undefined}>
                  <th scope="row" className="d5-nome">
                    <span className="d5-nome-in">
                      <PontoStatus situacao={c.situacao} />
                      <span className="d5-cel2">
                        <b title={c.nome}>{c.situacao === 'antigo' ? 'Números antigos' : c.nome}</b>
                        {c.situacao === 'antigo'
                          ? <small>Removidos ou desconectados</small>
                          : <small className="num d5-tel">{fmtTelefone(c.numero)}</small>}
                      </span>
                    </span>
                  </th>
                  <td className="d5-dir">
                    <span className="d5-cel2 d5-cel2-dir">
                      <span className="d5-ent">
                        <span className="d5-trilho" aria-hidden>
                          <i style={{ width: `${c.entradas && share != null ? Math.max(1.5, share) : 0}%` }} />
                        </span>
                        <b className={'num' + (c.entradas ? '' : ' d5-mudo')}>{fmtInt(c.entradas)}</b>
                      </span>
                      {share != null && c.entradas > 0 && (
                        <small className="num">
                          {c.retornos > 0 ? <Legenda partes={[fmtPct(share), <JaEstavam key="ja" c={c} />]} /> : fmtPct(share)}
                        </small>
                      )}
                    </span>
                  </td>
                  <td className="d5-dir"><CelulaNe c={c} /></td>
                  <td className="d5-dir"><span className={'num' + (c.ganhos ? '' : ' d5-mudo')}>{fmtInt(c.ganhos)}</span></td>
                  <td className="d5-dir"><TempoFechar med={c.fechMedianaH} media={c.fechMediaH} n={c.fechN} /></td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" className="d5-nome">
                <span className="d5-cel2 d5-tot-rot">
                  <b>Total</b>
                  {repetidos > 0 && (
                    <small className="num">{fmtInt(kpis.entradas)} clientes diferentes</small>
                  )}
                </span>
              </th>
              <td className="d5-dir">
                <span className="d5-cel2 d5-cel2-dir">
                  <b className="num">{fmtInt(totEnt)}</b>
                  {totRet > 0 && <small className="num">{fmtInt(totRet)} já {totRet === 1 ? 'estava' : 'estavam'} no sistema</small>}
                </span>
              </td>
              <td className="d5-dir"><b className="num">{fmtInt(totNe)}</b></td>
              <td className="d5-dir"><b className="num">{fmtInt(totGan)}</b></td>
              <td className="d5-dir"><TempoFechar med={kpis.fechMedianaH} media={kpis.fechMediaH} n={kpis.fechN} /></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </Secao>
  );
}

export function PorNumeroSkeleton() {
  return (
    <Secao className="d5-num" titulo="Entradas por número">
      <div className="d5-sk-linhas" aria-hidden>
        {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} altura={38} raio={6} />)}
      </div>
    </Secao>
  );
}
