import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useOrg } from '@/context/OrgContext';
import { MOTIVO_ROTULO, QUEM_ROTULO, fmtEspera, useVigiaRespostas, type VigiaCaso } from '@/data/vigiaRespostas';
import { Skeleton } from '../../components';
import { Secao, Vazio } from './comum';

/* Vigia de respostas 24h (dono 12/11): o banco confere a cada 3 minutos, de dia e de noite, se algum
   cliente ficou sem resposta, e a Iris travada é reativada sozinha. Esta seção só mostra: o
   batimento (vermelho se o vigia parou), os números e a lista. Só o gestor (admin) vê. */

const AJUDA = 'A cada 3 minutos, 24 horas por dia, o sistema procura conversas em que a última mensagem é do cliente e ninguém respondeu: '
  + 'mais de 5 min para a Iris e o robô; mais de 15 min úteis (seg–sex, 9h–18h) para um atendente. '
  + 'Se a Iris travar, o vigia a reativa sozinho. Se parar de rodar, o ponto fica vermelho.';

type Aba = 'agora' | 'antigos';
const UM_DIA = 1440;

function Linha({ c }: { c: VigiaCaso }) {
  return (
    <tr>
      <td>
        <div className="d5-vg-nome"><span className="d5-vg-sev" data-sev={c.severidade} aria-hidden />{c.nome}</div>
        {c.ultimaMsg && <div className="d5-vg-msg">{c.ultimaMsg}</div>}
      </td>
      <td>{c.canal ?? '—'}</td>
      <td>{c.dono ?? 'Sem atendente'}</td>
      <td><span className="d5-vg-quem" data-quem={c.quemDeve}>{QUEM_ROTULO[c.quemDeve]}</span></td>
      <td>
        {MOTIVO_ROTULO[c.motivo] ?? c.motivo}
        {c.tentativasCura > 0 && <span className="d5-vg-cura"> · reativada {c.tentativasCura}×</span>}
      </td>
      <td className="num d5-vg-espera" data-sev={c.severidade}>{fmtEspera(c.esperaMin)}</td>
      <td><Link className="d5-vg-abrir" to={`/whatsapp?conversa=${c.conversaId}`}>Abrir</Link></td>
    </tr>
  );
}

export function VigiaSkeleton() {
  return (
    <Secao titulo="Vigia de respostas" sub="Conferindo agora…">
      <Skeleton largura={220} altura={64} />
    </Secao>
  );
}

export function Vigia() {
  const { currentOrg } = useOrg();
  const admin = currentOrg.role === 'admin';
  const q = useVigiaRespostas(admin);
  const [aba, setAba] = useState<Aba>('agora');
  const d = q.data;
  const casos = d?.casos ?? [];
  const agora = useMemo(() => casos.filter((c) => c.esperaMin < UM_DIA), [casos]);
  const antigos = useMemo(() => casos.filter((c) => c.esperaMin >= UM_DIA), [casos]);

  if (!admin) return null;
  if (!d) {
    if (q.isError) return <Secao titulo="Vigia de respostas"><Vazio texto="Não foi possível ler o vigia agora." detalhe={(q.error as Error)?.message} /></Secao>;
    return <VigiaSkeleton />;
  }

  const s = d.saude;
  const lista = aba === 'agora' ? agora : antigos;
  const pulso = s.vigiaOk
    ? <span className="d5-vg-pulso" data-ok="1"><i aria-hidden />Rodou há {s.ultimoMinutos ?? 0} min</span>
    : <span className="d5-vg-pulso" data-ok="0" role="alert"><i aria-hidden />Vigia parado{s.ultimoMinutos != null ? ` há ${s.ultimoMinutos} min` : ''}{s.ultimoErro ? `: ${s.ultimoErro}` : ''}</span>;

  return (
    <Secao id="vigia-respostas" titulo="Vigia de respostas" ajuda={AJUDA} acao={pulso}
      sub="Confere a cada 3 minutos, 24 horas por dia, quem ficou sem resposta">
      <div className="d5-vg-nums">
        <div><span className="d5-vg-n num" data-zero={agora.length === 0 ? '1' : '0'}>{agora.length}</span><span className="d5-vg-r">sem resposta agora</span></div>
        <div><span className="d5-vg-n num">{antigos.length}</span><span className="d5-vg-r">antigos (mais de 24 h)</span></div>
        <div><span className="d5-vg-n num">{s.curas24h}</span><span className="d5-vg-r">reativados pelo vigia (24 h)</span></div>
        <div><span className="d5-vg-n num">{s.resolvidos24h}</span><span className="d5-vg-r">respondidos depois do alerta (24 h)</span></div>
      </div>

      <div className="d5-vg-abas" role="tablist" aria-label="Período da espera">
        <button type="button" role="tab" aria-selected={aba === 'agora'} onClick={() => setAba('agora')}>Agora ({agora.length})</button>
        <button type="button" role="tab" aria-selected={aba === 'antigos'} onClick={() => setAba('antigos')}>Antigos ({antigos.length})</button>
      </div>

      {lista.length === 0 ? (
        <Vazio
          texto={aba === 'agora' ? 'Nenhum cliente sem resposta agora.' : 'Nenhum cliente antigo sem resposta.'}
          detalhe={aba === 'agora' ? 'O vigia continua conferindo a cada 3 minutos.' : undefined}
        />
      ) : (
        <div className="d5-tab-rolo">
          <table className="d5-tab d5-vg-tab">
            <thead>
              <tr><th>Cliente</th><th>Número</th><th>Atendente</th><th>Quem deve</th><th>Motivo</th><th>Espera</th><th aria-label="Abrir" /></tr>
            </thead>
            <tbody>{lista.map((c) => <Linha key={c.casoId} c={c} />)}</tbody>
          </table>
        </div>
      )}
    </Secao>
  );
}
