import type { MouseEvent as ReactMouseEvent } from 'react';
import { Link } from 'react-router-dom';
import { fmtEspera, type Severidade, type VigiaCaso } from '@/data/vigiaRespostas';
import {
  desdeRotulo, iniciaisCliente, rotuloMais, situacaoDe, textoMensagem,
  type GrupoEspera, type GrupoVista,
} from '@/data/vigiaRespostas.vista';
import { fmtTelefone } from '@/data/dashboardV5.formato';
import { initials } from '@/lib/avatar';
import { ICONES } from '../../shell/icones';
import { IcX } from '../filaIris/icones';
import { Ajuda } from './comum';

/* A tabela do Vigia de respostas: seções por tempo de espera (tbody com faixa e
   "Mostrar mais"), linha inteira clicável, nome e "Abrir" como links de verdade.
   Título e conteúdo de cada coluna centralizados; só Cliente à esquerda (regra do dono).
   Em páginas estreitas o CSS transforma as linhas em cartões — os role explícitos
   mantêm a semântica de tabela quando o display muda (Safari/VoiceOver). */

const AJUDA_ESPERA = 'Tempo desde a primeira mensagem do cliente que ficou sem resposta. Embaixo, quando ele escreveu.';
const TITULO_SEC = 'Quem espera há mais tempo aparece primeiro. A Iris que não voltou e o número desconectado ficam no topo.';
const SEV_DO_GRUPO: Record<GrupoEspera, Severidade> = { menos1h: 'atencao', de1a24h: 'alta', mais24h: 'critica' };

/** Coluna "Quem deve responder": avatar/ícone + nome em cima, o motivo curto embaixo
 *  (as exceções em rubro, com ponto). */
function QuemCelula({ c }: { c: VigiaCaso }) {
  const sit = situacaoDe(c);
  return (
    <span className="d5-cel2 d5-cel2-dir" title={sit.titulo}>
      <b className="d5-vg-qm" data-sem={sit.tipo === 'sem' ? '' : undefined}>
        {sit.tipo === 'pessoa' && <span className="d5-vg-av" aria-hidden>{initials(c.dono ?? '')}</span>}
        {sit.tipo === 'iris' && <span className="d5-vg-ic" aria-hidden>{ICONES.ia}</span>}
        {sit.tipo === 'robo' && <span className="d5-vg-ic" aria-hidden>{ICONES.fluxos}</span>}
        <span className="d5-vg-qm-tx">{sit.quem}</span>
      </b>
      <small data-alerta={sit.alerta ? '' : undefined}>{sit.nota}</small>
    </span>
  );
}

function LinhaVigia({ c, lidoEm, aoAbrir }: { c: VigiaCaso; lidoEm: string; aoAbrir: (conversaId: string) => void }) {
  const msg = textoMensagem(c.ultimaMsg);
  const semNome = c.nome === 'Cliente sem nome';
  const url = `/whatsapp?conversa=${c.conversaId}`;
  const clique = (e: ReactMouseEvent<HTMLTableRowElement>) => {
    // o Link e os botões já tratam o próprio clique (navegar duas vezes duplicaria o histórico);
    // Cmd/Ctrl+clique (nova aba) funciona só no nome e no "Abrir"; seleção de texto não abre
    if ((e.target as HTMLElement).closest('a, button')) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (typeof window !== 'undefined' && window.getSelection?.()?.toString()) return;
    aoAbrir(c.conversaId);
  };
  return (
    <tr className="d5-vg-lin" role="row" onClick={clique}>
      <th scope="row" role="rowheader" className="d5-vg-c-cli">
        <span className="d5-vg-cli">
          <span className="d5-av" aria-hidden>{iniciaisCliente(c.nome)}</span>
          <span className="d5-vg-cli-tx">
            <Link className="d5-pessoa d5-vg-nome" data-sem-nome={semNome ? '' : undefined} to={url}
              title="Abrir a conversa no WhatsApp">{c.nome}</Link>
            <small className="num d5-tel">
              {c.telefone ? fmtTelefone(c.telefone) : 'Sem telefone'}
              {c.canal && <span className="d5-vg-canal-mini"> · {c.canal}</span>}
            </small>
          </span>
        </span>
      </th>
      <td className="d5-dir d5-vg-c-msg" role="cell">
        <span className="d5-vg-msg" title={msg.midia ? msg.texto : c.ultimaMsg ?? undefined}>{msg.texto}</span>
      </td>
      <td className="d5-dir d5-vg-c-quem" role="cell"><QuemCelula c={c} /></td>
      <td className="d5-dir d5-vg-c-num" role="cell"><span className="d5-vg-num">{c.canal ?? '—'}</span></td>
      <td className="d5-dir d5-vg-c-esp" role="cell">
        <span className="d5-cel2 d5-cel2-dir">
          <b className="num">{fmtEspera(c.esperaMin)}</b>
          <small className="num">{desdeRotulo(c.esperaMin, lidoEm)}</small>
        </span>
      </td>
      <td className="d5-dir d5-vg-c-ir" role="cell">
        <Link className="d5-vg-abrir" to={url} aria-label={`Abrir a conversa com ${c.nome}`}>Abrir</Link>
      </td>
    </tr>
  );
}

function GrupoVigia({ g, lidoEm, faltamCorte, expandido, aoMais, aoMenos, aoAbrir }: {
  g: GrupoVista; lidoEm: string; faltamCorte: number; expandido: boolean;
  aoMais: (g: GrupoEspera) => void; aoMenos: (g: GrupoEspera) => void; aoAbrir: (conversaId: string) => void;
}) {
  const id = `d5-vg-sec-${g.id}`;
  return (
    <tbody role="rowgroup" id={id}>
      <tr className="d5-vg-sec" role="row">
        <th scope="rowgroup" role="rowheader" colSpan={6} title={TITULO_SEC}>
          {g.rotulo}
          <span className="d5-vg-sec-n num">{g.total === 1 ? '1 cliente' : `${g.total} clientes`}</span>
        </th>
      </tr>
      {g.linhas.map((c) => <LinhaVigia key={c.casoId} c={c} lidoEm={lidoEm} aoAbrir={aoAbrir} />)}
      {g.total === 0 && (
        <tr className="d5-vg-vazio" role="row">
          <td role="cell" colSpan={6}>
            {faltamCorte > 0
              ? `Há ${faltamCorte} clientes nesta faixa que não couberam na lista.`
              : g.vazio}
          </td>
        </tr>
      )}
      {g.restantes > 0 && (
        <tr className="d5-vg-mais" role="row">
          <td role="cell" colSpan={6}>
            <button type="button" className="d5-vg-mais-bt" aria-controls={id} onClick={() => aoMais(g.id)}>{rotuloMais(g.restantes)}</button>
          </td>
        </tr>
      )}
      {g.restantes === 0 && expandido && (
        <tr className="d5-vg-mais" role="row">
          <td role="cell" colSpan={6}>
            <button type="button" className="d5-vg-mais-bt" aria-controls={id} onClick={() => aoMenos(g.id)}>Mostrar menos</button>
          </td>
        </tr>
      )}
    </tbody>
  );
}

export function TabelaVigia({ grupos, lidoEm, truncada, porSeveridade, mostrando, aoMais, aoMenos, aoAbrir, aoLimpar }: {
  grupos: GrupoVista[]; lidoEm: string; truncada: boolean;
  porSeveridade: Partial<Record<Severidade, number>>;
  mostrando: Partial<Record<GrupoEspera, number>>;
  aoMais: (g: GrupoEspera) => void; aoMenos: (g: GrupoEspera) => void;
  aoAbrir: (conversaId: string) => void; aoLimpar: () => void;
}) {
  if (!grupos.length) {
    return (
      <div className="d5-vg-filtro-vazio">
        <span>Nenhum cliente sem resposta com este filtro.</span>
        <button type="button" className="d5-vg-limpar" onClick={aoLimpar}>Limpar filtro<IcX t={10} /></button>
      </div>
    );
  }
  return (
    <div className="d5-tab-rolo">
      <table className="d5-tab d5-vg-tab" role="table">
        <caption className="d5-sr">Clientes sem resposta, agrupados pelo tempo de espera</caption>
        <thead role="rowgroup">
          <tr role="row">
            <th scope="col" role="columnheader" className="d5-vg-c-cli">Cliente</th>
            <th scope="col" role="columnheader" className="d5-dir d5-vg-c-msg">Última mensagem</th>
            <th scope="col" role="columnheader" className="d5-dir d5-vg-c-quem">Quem deve responder</th>
            <th scope="col" role="columnheader" className="d5-dir d5-vg-c-num">Número</th>
            <th scope="col" role="columnheader" className="d5-dir d5-vg-c-esp">
              <span className="d5-th-ajuda"><Ajuda rotulo="Esperando há" texto={AJUDA_ESPERA} /><span>Esperando há</span></span>
            </th>
            <th scope="col" role="columnheader" className="d5-dir d5-vg-c-ir"><span className="d5-sr">Abrir conversa</span></th>
          </tr>
        </thead>
        {grupos.map((g) => (
          <GrupoVigia key={g.id} g={g} lidoEm={lidoEm}
            faltamCorte={truncada ? Math.max(0, (porSeveridade[SEV_DO_GRUPO[g.id]] ?? 0) - g.total) : 0}
            expandido={mostrando[g.id] != null}
            aoMais={aoMais} aoMenos={aoMenos} aoAbrir={aoAbrir} />
        ))}
      </table>
    </div>
  );
}
