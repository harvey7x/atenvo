/* CONFIGURAÇÕES → LEMBRETE DE REUNIÃO (26/11, "igual" ao Follow-up de agendamentos do sistema que a Reviza usava antes). Liga e
   desliga o lembrete para o cliente antes de cada reunião marcada, quando ele sai (e o segundo aviso), o texto e a prévia.
   Ligar pede confirmação: a partir daí o Reviza MANDA mensagem para os clientes. Dados: @/data/lembreteReuniao (migration 126). */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BotaoPrimario, BotaoSec, CardVidro, EstadoErro, ModalV2, Toggle } from '../../components';
import { OPCOES_ANTES, OPCOES_SEGUNDO, TEXTO_PADRAO, previaLembrete, useConfigLembrete, useSalvarLembrete, type ConfigLembrete as Cfg } from '@/data/lembreteReuniao';
import '../painel/painel.css';
import './camposMotivos.css';
import './webhooks.css';
import './importacao.css';
import '../automacoes/disparos.css';

export function ConfigLembrete() {
  const q = useConfigLembrete();
  const salvar = useSalvarLembrete();
  const nav = useNavigate();
  const [v, setV] = useState<Cfg | null>(null);
  const [confirmar, setConfirmar] = useState(false);
  const [aviso, setAviso] = useState<{ texto: string; tom: 'ok' | 'erro' } | null>(null);
  useEffect(() => { if (q.data && !v) setV(q.data); }, [q.data, v]);
  if (q.isLoading || !v) return <div className="pn cfgw"><p className="pn-vazio">Carregando…</p></div>;
  if (q.isError) return <div className="pn cfgw"><EstadoErro titulo="Não foi possível carregar o lembrete" descricao="Houve uma falha na consulta. Tente de novo." aoTentarDeNovo={() => void q.refetch()} /></div>;
  const mudou = JSON.stringify({ ...v, ligadoEm: null }) !== JSON.stringify({ ...q.data, ligadoEm: null });
  const gravar = async (c: Cfg) => {
    setAviso(null);
    if (c.texto.trim().length < 5) { setAviso({ tom: 'erro', texto: 'Escreva o texto do lembrete.' }); return; }
    try {
      const r = await salvar.mutateAsync(c);
      setAviso({ tom: 'ok', texto: c.ativo ? `Lembrete ligado: ${r.lembretes} ${r.lembretes === 1 ? 'mensagem agendada' : 'mensagens agendadas'} para as ${r.reunioes} ${r.reunioes === 1 ? 'reunião marcada' : 'reuniões marcadas'} que vão acontecer.` : 'Lembrete desligado: os que estavam na fila saíram.' });
      setConfirmar(false);
    } catch (x) { setAviso({ tom: 'erro', texto: (x as Error).message }); }
  };
  return (
    <div className="pn cfgw cfgwh" data-config-lembrete>
      {aviso && <div className={`gs-aviso ${aviso.tom}`} role={aviso.tom === 'erro' ? 'alert' : 'status'}><span>{aviso.texto}</span><button type="button" className="gs-aviso-x" onClick={() => setAviso(null)} aria-label="Fechar">×</button></div>}
      <CardVidro spot className="pn-card sobe">
        <div className="pn-card-cab cfgimp-resp-cab">
          <div>
            <h3>{v.ativo ? 'Ligado' : 'Desligado'}</h3>
            <p>{v.ativo ? 'Antes de cada reunião marcada na Agenda, o cliente recebe o lembrete pelo número da conversa dele.' : 'Ninguém recebe lembrete. Ligue para o cliente receber uma mensagem antes de cada reunião marcada.'}</p>
          </div>
          <Toggle ligado={v.ativo} rotulo="Lembrete antes da reunião" disabled={salvar.isPending}
            aoMudar={(x) => { if (x) setConfirmar(true); else void gravar({ ...v, ativo: false }).then(() => setV({ ...v, ativo: false })); }} />
        </div>
        <div className="pn-us-form">
          <div className="frm-duas" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 12 }}>
            <label className="pn-us-campo"><span>Quando sai</span>
              <select className="inp" value={String(v.antesMin)} onChange={(e) => setV({ ...v, antesMin: Number(e.target.value) })}>
                {OPCOES_ANTES.map((o) => <option key={o.v} value={o.v}>{o.r}</option>)}
              </select>
            </label>
            <label className="pn-us-campo"><span>Segundo aviso</span>
              <select className="inp" value={String(v.segundoMin ?? 0)} onChange={(e) => setV({ ...v, segundoMin: Number(e.target.value) || null })}>
                {OPCOES_SEGUNDO.filter((o) => o.v !== v.antesMin).map((o) => <option key={o.v} value={o.v}>{o.r}</option>)}
              </select>
            </label>
          </div>
          <label className="pn-us-campo"><span>Texto</span>
            <textarea className="inp" rows={3} maxLength={1000} value={v.texto} style={{ height: 'auto', minHeight: 72 }} onChange={(e) => setV({ ...v, texto: e.target.value })} />
            <small className="cfgc-dica">{'{{nome}}'} = o primeiro nome · {'{{tipo}}'} = reunião, ligação ou videochamada · {'{{quando}}'} = "amanhã às 15:00" · {'{{hora}}'} = "15:00"</small>
          </label>
          <div className="dsp-previa" aria-label="Como o cliente vê">{previaLembrete(v.texto, v.antesMin, 'ligacao')}</div>
          <div className="cfgimp-acoes" style={{ display: 'flex', gap: 8 }}>
            <BotaoPrimario disabled={!mudou || salvar.isPending} onClick={() => void gravar(v)}>{salvar.isPending ? 'Salvando…' : 'Salvar'}</BotaoPrimario>
            {v.texto !== TEXTO_PADRAO && <BotaoSec onClick={() => setV({ ...v, texto: TEXTO_PADRAO })}>Voltar ao texto padrão</BotaoSec>}
            <BotaoSec onClick={() => nav('/agendamentos')}>Mensagens agendadas</BotaoSec>
          </div>
          <p className="cfgc-dica">Só recebe quem tem conversa num número conectado. Mudou o horário da reunião, o lembrete muda junto; cancelou, ele sai da fila.</p>
        </div>
      </CardVidro>
      {confirmar && (
        <ModalV2 aberto aoFechar={() => setConfirmar(false)} largura={480}
          titulo={<div>Ligar o lembrete?<div className="mod-sub">A partir de agora o Reviza manda mensagem para os clientes</div></div>}
          rodape={<><BotaoSec onClick={() => setConfirmar(false)} disabled={salvar.isPending}>Cancelar</BotaoSec><BotaoPrimario disabled={salvar.isPending} onClick={() => void gravar({ ...v, ativo: true }).then(() => setV({ ...v, ativo: true }))}>{salvar.isPending ? 'Ligando…' : 'Ligar o lembrete'}</BotaoPrimario></>}>
          <div className="pn-us-form">
            <p className="cfgc-dica" style={{ fontSize: 13 }}>Cada cliente com reunião marcada (inclusive as que já estão na Agenda) vai receber esta mensagem {OPCOES_ANTES.find((o) => o.v === v.antesMin)?.r ?? ''}{v.segundoMin ? ` e ${OPCOES_SEGUNDO.find((o) => o.v === v.segundoMin)?.r ?? ''}` : ''}:</p>
            <div className="dsp-previa">{previaLembrete(v.texto, v.antesMin, 'ligacao')}</div>
          </div>
        </ModalV2>
      )}
    </div>
  );
}
