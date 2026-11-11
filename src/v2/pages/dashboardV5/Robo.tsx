import type { ReactNode } from 'react';
import type { RoboCanalV5, RoboNumerosV5, RoboV5 } from '@/data/dashboardV5.tipos';
import { fmtDuracaoS, fmtInt, fmtPct, fmtTelefone, pctDe } from '@/data/dashboardV5.formato';
import { Skeleton } from '../../components';
import { Ajuda, Legenda, PontoStatus, Secao, Vazio } from './comum';

/* Robô (dono 30/10: "quanto ele tá concluindo, quanto ele tá entregando"). A MESMA régua do
   relatório diário em PDF (dash_v5_robo): só cliente NOVO para quem o robô mandou a abertura
   no período — quem já tinha falado com a CAF antes não entra. Em cima, os quatro números do
   período; embaixo, cada número de WhatsApp em que o robô atendeu. */

const AJUDA = {
  comecaram: 'Clientes novos para quem o robô mandou a primeira mensagem no período. Quem já tinha falado com a CAF antes não entra.',
  concluiram: 'Chegaram ao fim do fluxo do robô, respondendo as perguntas até o fim.',
  entregues: 'O robô passou o cliente para um atendente — hoje, na mesma hora em que o cliente conclui. O tempo é a mediana entre a primeira mensagem do robô e a entrega: metade foi entregue mais rápido do que isso.',
  elegiveis: 'Dos clientes que o robô entregou, os que não foram marcados como não elegíveis até o fim do período.',
};

/** Um dos quatro números do topo da seção (sem cartão próprio: a seção já é o cartão). */
function Numero({ rotulo, ajuda, valor, children }: { rotulo: string; ajuda: string; valor: string; children: ReactNode }) {
  return (
    <div className="d5-robo-n">
      <div className="d5-robo-rot"><span>{rotulo}</span><Ajuda texto={ajuda} rotulo={rotulo} /></div>
      <div className="d5-robo-val num">{valor}</div>
      <div className="d5-robo-pe">{children}</div>
    </div>
  );
}

/** "mediana de 1,9 min · 9 em 10 em até 11 min" (a cauda só com 10 entregas ou mais). */
function rotuloTempo(r: RoboNumerosV5): ReactNode {
  if (!r.entregues || r.entregaMedianaS == null) return 'ninguém entregue no período';
  const partes: ReactNode[] = [`mediana de ${fmtDuracaoS(r.entregaMedianaS)}`];
  if (r.entregues >= 10 && r.entregaP90S != null) partes.push(`9 em 10 em até ${fmtDuracaoS(r.entregaP90S)}`);
  return <Legenda partes={partes} />;
}

function Topo({ t }: { t: RoboNumerosV5 }) {
  const pConc = pctDe(t.terminaram, t.entraram);
  const pEleg = pctDe(t.entreguesElegiveis, t.entregues);
  return (
    <div className="d5-robo-nums">
      <Numero rotulo="Começaram" ajuda={AJUDA.comecaram} valor={fmtInt(t.entraram)}>
        <span className="d5-var-ctx">clientes novos</span>
      </Numero>
      <Numero rotulo="Concluíram" ajuda={AJUDA.concluiram} valor={fmtInt(t.terminaram)}>
        <span className="d5-var-ctx">{pConc == null ? '—' : `${fmtPct(pConc)} dos que começaram`}</span>
      </Numero>
      <Numero rotulo="Entregues à equipe" ajuda={AJUDA.entregues} valor={fmtInt(t.entregues)}>
        <span className="d5-var-ctx d5-kpi-leg">{rotuloTempo(t)}</span>
      </Numero>
      <Numero rotulo="Seguem elegíveis" ajuda={AJUDA.elegiveis} valor={fmtInt(t.entreguesElegiveis)}>
        <span className="d5-var-ctx">{pEleg == null ? '—' : `${fmtPct(pEleg)} dos entregues`}</span>
      </Numero>
    </div>
  );
}

/** Concluíram: barra (% dos que começaram) + número; embaixo a %, e os entregues quando divergirem. */
function CelulaConcluiram({ r }: { r: RoboNumerosV5 }) {
  const p = pctDe(r.terminaram, r.entraram);
  return (
    <span className="d5-cel2 d5-cel2-dir">
      <span className="d5-ent">
        <span className="d5-trilho" aria-hidden><i style={{ width: `${r.terminaram && p != null ? Math.max(1.5, p) : 0}%` }} /></span>
        <b className={'num' + (r.terminaram ? '' : ' d5-mudo')}>{fmtInt(r.terminaram)}</b>
      </span>
      {p != null && (
        <small className="num">
          {r.entregues === r.terminaram ? fmtPct(p) : <Legenda partes={[fmtPct(p), `${fmtInt(r.entregues)} entregues`]} />}
        </small>
      )}
    </span>
  );
}

function CelulaElegiveis({ r }: { r: RoboNumerosV5 }) {
  if (!r.entregues) return <span className="d5-mudo">—</span>;
  const p = pctDe(r.entreguesElegiveis, r.entregues);
  return (
    <span className="d5-cel2 d5-cel2-dir">
      <b className="num">{fmtInt(r.entreguesElegiveis)}</b>
      {p != null && <small className="num">{fmtPct(p)} dos entregues</small>}
    </span>
  );
}

function CelulaTempo({ r }: { r: RoboNumerosV5 }) {
  if (!r.entregues || r.entregaMedianaS == null) return <span className="d5-mudo">—</span>;
  return (
    <span className="d5-cel2 d5-cel2-dir">
      <b className="num">{fmtDuracaoS(r.entregaMedianaS)}</b>
      {r.entregues >= 10 && r.entregaP90S != null && <small className="num">9 em 10 até {fmtDuracaoS(r.entregaP90S)}</small>}
    </span>
  );
}

function Linha({ c }: { c: RoboCanalV5 }) {
  return (
    <tr className={c.situacao === 'antigo' ? 'd5-lin-antigo' : undefined}>
      <th scope="row" className="d5-nome">
        <span className="d5-nome-in">
          <PontoStatus situacao={c.situacao} />
          <span className="d5-cel2">
            <b title={c.nome}>{c.nome}</b>
            {c.numero ? <small className="num d5-tel">{fmtTelefone(c.numero)}</small> : <small>Número fora do ar</small>}
          </span>
        </span>
      </th>
      <td className="d5-dir"><span className={'num' + (c.entraram ? '' : ' d5-mudo')}>{fmtInt(c.entraram)}</span></td>
      <td className="d5-dir"><CelulaConcluiram r={c} /></td>
      <td className="d5-dir"><CelulaElegiveis r={c} /></td>
      <td className="d5-dir"><CelulaTempo r={c} /></td>
    </tr>
  );
}

export function Robo({ robo }: { robo: RoboV5 }) {
  const t = robo.total;
  return (
    <Secao className="d5-robo" titulo="Robô"
      sub="Clientes novos que o robô atendeu no período: quantos concluíram o fluxo, quantos ele entregou à equipe e quantos desses seguem elegíveis.">
      {t.entraram === 0 ? (
        <Vazio texto="O robô não atendeu nenhum cliente novo no período." />
      ) : (
        <>
          <Topo t={t} />
          <div className="d5-tab-rolo">
            <table className="d5-tab d5-tab-robo">
              <colgroup>
                <col className="d5-c-nome" /><col className="d5-c-n" /><col className="d5-c-ent" /><col className="d5-c-n" /><col className="d5-c-t" />
              </colgroup>
              <thead>
                <tr>
                  <th scope="col">Número</th>
                  <th scope="col" className="d5-dir">Começaram</th>
                  <th scope="col" className="d5-dir">
                    <span className="d5-th-ajuda"><Ajuda rotulo="Concluíram" texto={AJUDA.concluiram} /><span>Concluíram</span></span>
                  </th>
                  <th scope="col" className="d5-dir">
                    <span className="d5-th-ajuda"><Ajuda rotulo="Seguem elegíveis" texto={AJUDA.elegiveis} /><span>Seguem elegíveis</span></span>
                  </th>
                  <th scope="col" className="d5-dir">
                    <span className="d5-th-ajuda"><Ajuda rotulo="Tempo até entregar" texto={AJUDA.entregues} /><span>Tempo até entregar</span></span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {robo.canais.map((c) => <Linha key={c.canalId} c={c} />)}
              </tbody>
              {robo.canais.length > 1 && (
                <tfoot>
                  <tr>
                    <th scope="row" className="d5-nome"><span className="d5-cel2 d5-tot-rot"><b>Total</b></span></th>
                    <td className="d5-dir"><b className="num">{fmtInt(t.entraram)}</b></td>
                    <td className="d5-dir"><CelulaConcluiram r={t} /></td>
                    <td className="d5-dir"><CelulaElegiveis r={t} /></td>
                    <td className="d5-dir"><CelulaTempo r={t} /></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </>
      )}
    </Secao>
  );
}

export function RoboSkeleton() {
  return (
    <Secao className="d5-robo" titulo="Robô">
      <div className="d5-robo-nums" aria-hidden>
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="d5-robo-n">
            <Skeleton largura={96} altura={11} />
            <Skeleton largura={64} altura={24} style={{ marginTop: 12 }} />
            <Skeleton largura={130} altura={11} style={{ marginTop: 12 }} />
          </div>
        ))}
      </div>
    </Secao>
  );
}
