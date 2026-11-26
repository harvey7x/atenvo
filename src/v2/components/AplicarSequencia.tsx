/* APLICAR UMA SEQUÊNCIA na conversa (26/11, "igual" ao sistema que a Reviza usava antes: as sequências "você dispara na
   conversa, na hora que escolher"). Escolher o modelo (Atendimento › Automações › Sequências), o número que manda e quando
   começa; a prévia mostra a hora de cada mensagem. Cada uma vira uma mensagem agendada (aparece em Mensagens agendadas e
   pode ser cancelada lá). Dados: @/data/automacoes (migration 116). */
import { useMemo, useState } from 'react';
import { BotaoPrimario, BotaoSec, ModalV2 } from './index';
import { AUTO_REAL, fmtEspera, horariosDaSequencia, useAplicarSequencia, useSequencias } from '@/data/automacoes';

export interface CanalOpcaoSeq { id: string; alias: string; numero: string | null; status: string; envioRestrito: boolean }
const tz = { timeZone: 'America/Sao_Paulo' } as const;
const hora = (d: Date) => d.toLocaleString('pt-BR', { ...tz, weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(',', '');

export function AplicarSequencia({ conversaId, cliente, canais: canaisReais, canalPadrao, aoFechar, aoAvisar }: {
  conversaId: string; cliente: string; canais: CanalOpcaoSeq[]; canalPadrao: string | null;
  aoFechar: () => void; aoAvisar: (a: { tom: 'ok' | 'erro'; texto: string }) => void;
}) {
  // demonstração: o número de exemplo da conversa (no sistema de verdade, os números conectados)
  const canais = !AUTO_REAL && canaisReais.length === 0 ? [{ id: 'demo-chip-1', alias: 'Chip 1', numero: '5551900000001', status: 'conectado', envioRestrito: false }] : canaisReais;
  const q = useSequencias();
  const aplicar = useAplicarSequencia();
  const ativas = (q.data ?? []).filter((s) => s.ativo);
  const [id, setId] = useState('');
  const [canal, setCanal] = useState(canalPadrao && canais.some((c) => c.id === canalPadrao) ? canalPadrao : (canais[0]?.id ?? ''));
  const [quando, setQuando] = useState<'agora' | 'depois'>('agora');
  const [inicio, setInicio] = useState('');
  const [erro, setErro] = useState('');
  const s = ativas.find((x) => x.id === id) ?? null;
  const inicioData = useMemo(() => (quando === 'agora' ? new Date(Date.now() + 60_000) : inicio ? new Date(inicio) : null), [quando, inicio]);
  const horas = s && inicioData && !isNaN(inicioData.getTime()) ? horariosDaSequencia(s.passos, inicioData) : [];
  const ir = async () => {
    setErro('');
    if (!s) { setErro('Escolha a sequência.'); return; }
    if (!canal) { setErro('Escolha o número que manda.'); return; }
    if (quando === 'depois' && (!inicioData || inicioData.getTime() < Date.now() + 60_000)) { setErro('Escolha um horário a partir de daqui a 1 minuto.'); return; }
    try {
      const n = await aplicar.mutateAsync({ sequenciaId: s.id, conversaId, canalId: canal, inicio: quando === 'depois' && inicioData ? inicioData.toISOString() : null });
      aoAvisar({ tom: 'ok', texto: `"${s.nome}" aplicada: ${n} ${n === 1 ? 'mensagem agendada' : 'mensagens agendadas'} para ${cliente}.${s.pararSeResponder ? ' Se o cliente responder, o resto para.' : ''}` });
      aoFechar();
    } catch (x) { setErro((x as Error).message); }
  };
  return (
    <ModalV2 aberto aoFechar={aoFechar} largura={560}
      titulo={<div>Aplicar uma sequência<div className="mod-sub">Para {cliente}</div></div>}
      rodape={<><BotaoSec onClick={aoFechar} disabled={aplicar.isPending}>Cancelar</BotaoSec><BotaoPrimario disabled={!s || aplicar.isPending} onClick={() => void ir()}>{aplicar.isPending ? 'Aplicando…' : 'Aplicar'}</BotaoPrimario></>}>
      <div className="pn-us-form" data-aplicar-sequencia>
        {q.isLoading ? <p className="pn-vazio">Carregando as sequências…</p> : ativas.length === 0 ? <p className="pn-vazio">Nenhuma sequência ligada. Crie em Atendimento › Automações › Sequências.</p> : (
          <label className="pn-us-campo"><span>Sequência</span>
            <select className="inp" value={id} onChange={(e) => { setId(e.target.value); setErro(''); }} autoFocus>
              <option value="">Escolha</option>
              {ativas.map((x) => <option key={x.id} value={x.id}>{x.categoria ? `${x.categoria} · ` : ''}{x.nome} ({x.passos.length})</option>)}
            </select>
          </label>
        )}
        <label className="pn-us-campo"><span>Número que manda</span>
          <select className="inp" value={canal} onChange={(e) => setCanal(e.target.value)}>
            {canais.length === 0 && <option value="">Nenhum número conectado</option>}
            {canais.map((c) => <option key={c.id} value={c.id} disabled={c.envioRestrito || c.status !== 'conectado'}>{c.alias}{c.numero ? ` · ${c.numero.slice(-4)}` : ''}{c.envioRestrito ? ' (com restrição)' : c.status !== 'conectado' ? ' (desconectado)' : ''}</option>)}
          </select>
        </label>
        <div className="pn-us-campo"><span>Começa</span>
          <div className="aplseq-quando" role="radiogroup" aria-label="Quando começa">
            {([['agora', 'Daqui a 1 minuto'], ['depois', 'Em outro horário']] as const).map(([v, r]) => (
              <button key={v} type="button" role="radio" aria-checked={quando === v} className={'aplseq-op' + (quando === v ? ' on' : '')} onClick={() => setQuando(v)}>{r}</button>
            ))}
            {quando === 'depois' && <input className="inp" type="datetime-local" value={inicio} aria-label="Horário de início" onChange={(e) => setInicio(e.target.value)} />}
          </div>
        </div>
        {s && horas.length > 0 && (
          <ol className="aplseq-previa" aria-label="Quando cada mensagem sai">
            {s.passos.map((p, i) => (
              <li key={i}><em>{hora(horas[i])}</em><span>{p.tipo === 'texto' ? p.texto : `${p.nome ?? 'arquivo'}`}</span>{i > 0 && <small>+{fmtEspera(Math.max(p.esperaMin || 1, 1))}</small>}</li>
            ))}
          </ol>
        )}
        {erro && <span className="pn-us-erro" role="alert">{erro}</span>}
      </div>
    </ModalV2>
  );
}
