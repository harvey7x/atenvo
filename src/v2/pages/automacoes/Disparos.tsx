/* ATENDIMENTO › AUTOMAÇÕES › DISPAROS (26/11, "igual" aos Disparos do sistema que a Reviza usava antes). A lista dos disparos
   com o andamento (barra: enviadas · na fila · falhas · canceladas, e quantos responderam) e o "Novo disparo": quem recebe
   (com a contagem na hora), a mensagem (com a prévia), o número e o ritmo (com quando termina) e a confirmação. Cada mensagem
   vira uma mensagem agendada. Só o administrador. Dados: @/data/disparos (migration 125). */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BotaoPrimario, BotaoSec, CardVidro, EstadoErro, EstadoVazio, ModalV2 } from '../../components';
import {
  FILTRO_VAZIO, INTERVALOS, RITMO_PADRAO, previaTexto, useCancelarDisparo, useCriarDisparo, useDisparos, useEstimativaDisparo, useNumerosDisparo,
  usePreviaDisparo, validarDisparo, type Disparo, type FiltroDisparo, type MensagemDisparo, type RitmoDisparo,
} from '@/data/disparos';
import { usePessoasEEtapas } from '@/data/avisosEquipe';
import { useEtiquetas } from '@/data/atendimento';
import { useAnexosDosScripts } from '@/data/automacoes';
import { DIAS_SEMANA } from '@/data/formularios';
import './formularios.css';
import './disparos.css';

const tz = { timeZone: 'America/Sao_Paulo' } as const;
const quando = (iso: string | null) => { if (!iso) return '—'; const d = new Date(iso); return isNaN(d.getTime()) ? '—' : d.toLocaleString('pt-BR', { ...tz, weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(',', ''); };
const int = (n: number) => n.toLocaleString('pt-BR');

export function Disparos() {
  const q = useDisparos();
  const cancelar = useCancelarDisparo();
  const nav = useNavigate();
  const [novo, setNovo] = useState(false);
  const [aviso, setAviso] = useState<{ texto: string; tom: 'ok' | 'erro' } | null>(null);
  const [confirmaCancelar, setConfirmaCancelar] = useState<string | null>(null);
  const lista = q.data ?? [];
  const parar = async (d: Disparo) => {
    try { const n = await cancelar.mutateAsync(d.id); setAviso({ tom: 'ok', texto: `"${d.nome}" parado: ${int(n)} ${n === 1 ? 'mensagem saiu' : 'mensagens saíram'} da fila. As que já foram enviadas ficam.` }); setConfirmaCancelar(null); }
    catch (x) { setAviso({ tom: 'erro', texto: (x as Error).message }); }
  };
  return (
    <>
      {aviso && <div className={`gs-aviso ${aviso.tom}`} role={aviso.tom === 'erro' ? 'alert' : 'status'}><span>{aviso.texto}</span><button type="button" className="gs-aviso-x" onClick={() => setAviso(null)} aria-label="Fechar">×</button></div>}
      <div className="aut-barra">
        <span className="dsp-sub">Cada mensagem entra em Mensagens agendadas e sai no ritmo do número.</span>
        <BotaoPrimario onClick={() => setNovo(true)}>＋ Novo disparo</BotaoPrimario>
      </div>
      {q.isLoading ? <p className="pn-vazio">Carregando os disparos…</p>
        : q.isError ? <EstadoErro titulo="Não foi possível carregar os disparos" descricao={(q.error as Error).message} aoTentarDeNovo={() => void q.refetch()} />
        : lista.length === 0 ? <CardVidro className="pn-card"><EstadoVazio titulo="Nenhum disparo" descricao="Mande a mesma mensagem para um grupo de clientes (por etapa, etiqueta ou responsável), num ritmo seguro para o número." acao={{ rotulo: '＋ Novo disparo', onClick: () => setNovo(true) }} /></CardVidro>
        : (
          <CardVidro spot className="pn-card sobe">
            <div className="pn-card-cab"><div><h3>Disparos</h3><p>Do mais novo para o mais antigo.</p></div><BotaoSec mini onClick={() => nav('/agendamentos')}>Mensagens agendadas</BotaoSec></div>
            <ul className="dsp-lista">
              {lista.map((d) => {
                const tot = Math.max(1, d.total);
                const fila = d.status === 'agendado' && d.agendadas > 0;
                return (
                  <li key={d.id}>
                    <div className="dsp-cab">
                      <div className="dsp-tx">
                        <b>{d.nome}</b>
                        <small>{d.canal ?? 'número apagado'} · {int(d.total)} {d.total === 1 ? 'pessoa' : 'pessoas'} · {quando(d.inicio)} → {quando(d.fim)}{d.status === 'cancelado' ? ' · parado' : ''}</small>
                        <span className="dsp-msg">{d.arquivo ? `[${d.arquivo}] ` : ''}{d.texto}</span>
                      </div>
                      {fila && (confirmaCancelar === d.id
                        ? <span className="dsp-ac"><BotaoSec mini onClick={() => setConfirmaCancelar(null)}>Não</BotaoSec><button type="button" className="p-btn btn-perigo mini" disabled={cancelar.isPending} onClick={() => void parar(d)}>Parar o disparo</button></span>
                        : <BotaoSec mini onClick={() => setConfirmaCancelar(d.id)}>Parar</BotaoSec>)}
                    </div>
                    <div className="dsp-barra" role="img" aria-label={`${d.enviadas} enviadas, ${d.agendadas} na fila, ${d.falhas} falhas, ${d.canceladas} canceladas`}>
                      <span className="env" style={{ width: `${(d.enviadas / tot) * 100}%` }} />
                      <span className="fila" style={{ width: `${(d.agendadas / tot) * 100}%` }} />
                      <span className="falha" style={{ width: `${(d.falhas / tot) * 100}%` }} />
                    </div>
                    <dl className="dsp-nums">
                      <div><dt>Enviadas</dt><dd className="num">{int(d.enviadas)}</dd></div>
                      <div><dt>Na fila</dt><dd className="num">{int(d.agendadas)}</dd></div>
                      <div><dt>Responderam</dt><dd className="num">{int(d.responderam)}</dd></div>
                      <div><dt>Falhas</dt><dd className="num">{int(d.falhas)}</dd></div>
                      <div><dt>Canceladas</dt><dd className="num">{int(d.canceladas)}</dd></div>
                    </dl>
                  </li>
                );
              })}
            </ul>
          </CardVidro>
        )}
      {novo && <JanelaDisparo aoFechar={() => setNovo(false)} aoAvisar={(t) => setAviso({ tom: 'ok', texto: t })} />}
    </>
  );
}

function JanelaDisparo({ aoFechar, aoAvisar }: { aoFechar: () => void; aoAvisar: (t: string) => void }) {
  const { data: pe } = usePessoasEEtapas();
  const etiquetas = useEtiquetas().data ?? [];
  const anexos = useAnexosDosScripts().data ?? [];
  const numeros = useNumerosDisparo().data ?? [];
  const criar = useCriarDisparo();
  const [nome, setNome] = useState('');
  const [f, setF] = useState<FiltroDisparo>(FILTRO_VAZIO);
  const [m, setM] = useState<MensagemDisparo>({ tipo: 'texto', texto: '' });
  const [canal, setCanal] = useState<string>('');
  const [r, setR] = useState<RitmoDisparo>(RITMO_PADRAO);
  const [quandoComeca, setQuandoComeca] = useState<'agora' | 'depois'>('agora');
  const [inicio, setInicio] = useState('');
  const [confirmo, setConfirmo] = useState(false);
  const [erro, setErro] = useState('');
  const previa = usePreviaDisparo(f);
  const total = previa.data?.total ?? 0;
  const inicioIso = quandoComeca === 'depois' && inicio ? new Date(inicio).toISOString() : null;
  const est = useEstimativaDisparo(total, r, inicioIso);
  const numero = numeros.find((n) => n.id === canal);
  const intervalo = INTERVALOS.find((i) => i.min === r.intervalo_min_s && i.max === r.intervalo_max_s)?.valor ?? '90-180';
  const tog = <T,>(l: T[], x: T) => (l.includes(x) ? l.filter((y) => y !== x) : [...l, x]);
  const setFiltro = (p: Partial<FiltroDisparo>) => { setF((x) => ({ ...x, ...p })); setConfirmo(false); setErro(''); };
  const etapas = pe?.etapas ?? []; const pessoas = pe?.pessoas ?? [];

  const ir = async () => {
    const e = validarDisparo({ nome, canalId: canal || null, mensagem: m, total }); if (e) { setErro(e); return; }
    if (numero && !numero.pronto) { setErro(`Esse número está ${numero.motivo}.`); return; }
    if (!confirmo) { setErro('Marque a confirmação antes de criar.'); return; }
    try {
      const res = await criar.mutateAsync({ nome, canalId: canal, mensagem: m, filtro: f, ritmo: r, inicio: inicioIso, total, canalNome: numero?.nome ?? '' });
      aoAvisar(`"${nome.trim()}" criado: ${int(res.total)} ${res.total === 1 ? 'mensagem agendada' : 'mensagens agendadas'}, até ${quando(res.fim)}.`); aoFechar();
    } catch (x) { setErro((x as Error).message); }
  };
  return (
    <ModalV2 aberto aoFechar={aoFechar} largura={760}
      titulo={<div>Novo disparo<div className="mod-sub">A mesma mensagem para um grupo de clientes, no ritmo do número</div></div>}
      rodape={<><BotaoSec onClick={aoFechar} disabled={criar.isPending}>Cancelar</BotaoSec><BotaoPrimario disabled={criar.isPending || !confirmo} onClick={() => void ir()}>{criar.isPending ? 'Agendando…' : `Agendar ${total ? int(total) : ''} ${total === 1 ? 'mensagem' : 'mensagens'}`}</BotaoPrimario></>}>
      <div className="pn-us-form frm-editor" data-disparo-editor>
        <label className="pn-us-campo"><span>Nome do disparo (só a equipe vê)</span>
          <input className="inp" value={nome} maxLength={80} autoFocus placeholder="ex.: Retomar quem parou na documentação" onChange={(e) => { setNome(e.target.value); setErro(''); }} />
        </label>

        <fieldset className="frm-bloco">
          <legend>Quem recebe</legend>
          <div className="pn-us-campo"><span>Etapas (nenhuma marcada = todas)</span>
            <div className="frm-etqs">{etapas.map((e) => <button key={e.id} type="button" aria-pressed={f.etapas.includes(e.id)} className={'frm-etq' + (f.etapas.includes(e.id) ? ' on' : '')} onClick={() => setFiltro({ etapas: tog(f.etapas, e.id) })}>{e.nome}</button>)}</div>
          </div>
          {etiquetas.length > 0 && (
            <div className="pn-us-campo"><span>Com alguma destas etiquetas</span>
              <div className="frm-etqs">{etiquetas.map((t) => <button key={t.id} type="button" aria-pressed={f.etiquetas.includes(t.nome)} className={'frm-etq' + (f.etiquetas.includes(t.nome) ? ' on' : '')} onClick={() => setFiltro({ etiquetas: tog(f.etiquetas, t.nome) })}><i style={{ background: t.cor || 'var(--txt-3)' }} />{t.nome}</button>)}</div>
            </div>
          )}
          <div className="pn-us-campo"><span>Responsável</span>
            <div className="frm-etqs">
              {pessoas.map((p) => <button key={p.id} type="button" aria-pressed={f.responsaveis.includes(p.id)} className={'frm-etq' + (f.responsaveis.includes(p.id) ? ' on' : '')} onClick={() => setFiltro({ responsaveis: tog(f.responsaveis, p.id) })}>{p.nome}</button>)}
              <button type="button" aria-pressed={f.semResponsavel} className={'frm-etq' + (f.semResponsavel ? ' on' : '')} onClick={() => setFiltro({ semResponsavel: !f.semResponsavel })}>Sem responsável</button>
            </div>
          </div>
          <div className="frm-duas">
            <label className="pn-us-campo"><span>Sem conversa há</span>
              <select className="inp" value={f.semConversaDias ?? ''} onChange={(e) => setFiltro({ semConversaDias: e.target.value ? Number(e.target.value) : null })}>
                <option value="">Tanto faz</option>{[3, 7, 15, 30, 60, 90].map((d) => <option key={d} value={d}>{d} dias ou mais</option>)}
              </select>
            </label>
            <label className="frm-chk frm-chk-baixo"><input type="checkbox" checked={f.todos} onChange={(e) => setFiltro({ todos: e.target.checked })} />Incluir quem já fechou ou foi descartado</label>
          </div>
          <p className={'dsp-conta' + (total > 2000 ? ' erro' : '')} role="status">
            {previa.isFetching ? 'Contando…' : <><b>{int(total)}</b> {total === 1 ? 'pessoa recebe' : 'pessoas recebem'}{total > 2000 ? ' (o máximo é 2.000 por disparo)' : ''}. Fica de fora quem pediu para não receber e quem não tem WhatsApp válido.</>}
          </p>
          {(previa.data?.amostra.length ?? 0) > 0 && <p className="dsp-amostra">Por exemplo: {previa.data!.amostra.map((a) => a.nome).join(', ')}{total > previa.data!.amostra.length ? '…' : ''}</p>}
        </fieldset>

        <fieldset className="frm-bloco">
          <legend>Mensagem</legend>
          <div className="frm-duas">
            <label className="pn-us-campo"><span>Tipo</span>
              <select className="inp" value={m.tipo === 'texto' ? 'texto' : 'arquivo'} onChange={(e) => { setM(e.target.value === 'texto' ? { tipo: 'texto', texto: m.texto } : { ...m, tipo: 'documento' }); setConfirmo(false); }}>
                <option value="texto">Só texto</option><option value="arquivo" disabled={anexos.length === 0}>Arquivo dos Scripts{anexos.length === 0 ? ' (nenhum)' : ''}</option>
              </select>
            </label>
            {m.tipo !== 'texto' && (
              <label className="pn-us-campo"><span>Arquivo</span>
                <select className="inp" value={m.storage_path ?? ''} onChange={(e) => { const a = anexos.find((x) => x.storagePath === e.target.value); if (a) setM({ ...m, tipo: a.tipo === 'texto' ? 'documento' : a.tipo, storage_path: a.storagePath, mime: a.mime, nome: a.nome, tamanho: a.tamanho }); setConfirmo(false); }}>
                  <option value="">Escolha</option>{anexos.map((a) => <option key={a.id} value={a.storagePath}>{a.rotulo}</option>)}
                </select>
              </label>
            )}
          </div>
          <label className="pn-us-campo"><span>{m.tipo === 'texto' ? 'Texto' : 'Legenda (opcional)'}</span>
            <textarea className="inp" rows={4} maxLength={4000} value={m.texto} placeholder={'Oi {{nome}}! …'} onChange={(e) => { setM({ ...m, texto: e.target.value }); setConfirmo(false); setErro(''); }} />
            <small className="cfgc-dica">Use {'{{nome}}'} para o primeiro nome do cliente.</small>
          </label>
          {m.texto.trim() && <div className="dsp-previa" aria-label="Como o cliente vê"><span>{previaTexto(m.texto)}</span></div>}
        </fieldset>

        <fieldset className="frm-bloco">
          <legend>Número e ritmo</legend>
          <div className="frm-duas">
            <label className="pn-us-campo"><span>Número que manda</span>
              <select className="inp" value={canal} onChange={(e) => { setCanal(e.target.value); setConfirmo(false); setErro(''); }}>
                <option value="">{numeros.length ? 'Escolha' : 'Nenhum número conectado'}</option>
                {numeros.map((n) => <option key={n.id} value={n.id} disabled={!n.pronto}>{n.nome}{n.numero ? ` · ${n.numero.slice(-4)}` : ''}{n.pronto ? '' : ` (${n.motivo})`}</option>)}
              </select>
            </label>
            <label className="pn-us-campo"><span>Uma mensagem a cada</span>
              <select className="inp" value={intervalo} onChange={(e) => { const i = INTERVALOS.find((x) => x.valor === e.target.value)!; setR({ ...r, intervalo_min_s: i.min, intervalo_max_s: i.max }); setConfirmo(false); }}>
                {INTERVALOS.map((i) => <option key={i.valor} value={i.valor}>{i.rotulo}</option>)}
              </select>
            </label>
          </div>
          <div className="pn-us-campo"><span>Dias</span>
            <div className="frm-dias">{DIAS_SEMANA.map((d) => <button key={d.n} type="button" aria-pressed={r.dias.includes(d.n)} className={'frm-dia' + (r.dias.includes(d.n) ? ' on' : '')} onClick={() => { setR({ ...r, dias: tog(r.dias, d.n).sort() }); setConfirmo(false); }}>{d.r}</button>)}</div>
          </div>
          <div className="frm-tres">
            <label className="pn-us-campo"><span>Das</span><input className="inp" type="time" value={r.janela_inicio} onChange={(e) => { setR({ ...r, janela_inicio: e.target.value }); setConfirmo(false); }} /></label>
            <label className="pn-us-campo"><span>Até</span><input className="inp" type="time" value={r.janela_fim} onChange={(e) => { setR({ ...r, janela_fim: e.target.value }); setConfirmo(false); }} /></label>
            <label className="pn-us-campo"><span>No máximo por dia</span>
              <select className="inp" value={String(r.max_por_dia)} onChange={(e) => { setR({ ...r, max_por_dia: Number(e.target.value) }); setConfirmo(false); }}>
                {[30, 50, 80, 100, 150, 200, 300].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
          </div>
          <div className="pn-us-campo"><span>Começa</span>
            <div className="aplseq-quando" role="radiogroup" aria-label="Quando começa">
              {([['agora', 'Daqui a 1 minuto'], ['depois', 'Em outro horário']] as const).map(([v, rot]) => (
                <button key={v} type="button" role="radio" aria-checked={quandoComeca === v} className={'aplseq-op' + (quandoComeca === v ? ' on' : '')} onClick={() => { setQuandoComeca(v); setConfirmo(false); }}>{rot}</button>
              ))}
              {quandoComeca === 'depois' && <input className="inp" type="datetime-local" value={inicio} aria-label="Começa em" onChange={(e) => { setInicio(e.target.value); setConfirmo(false); }} />}
            </div>
          </div>
          {total > 0 && est.data && <p className="dsp-conta" role="status">Começa {quando(est.data.inicio)} e termina por volta de <b>{quando(est.data.fim)}</b>{est.data.dias > 1 ? ` (${est.data.dias} dias)` : ''}.</p>}
        </fieldset>

        <label className="frm-chk frm-chk-l dsp-confirmo">
          <input type="checkbox" checked={confirmo} onChange={(e) => { setConfirmo(e.target.checked); setErro(''); }} />
          Confirmo: vão sair {int(total)} {total === 1 ? 'mensagem' : 'mensagens'} pelo número {numero?.nome ?? '(escolha o número)'}, no ritmo acima.
        </label>
        {erro && <span className="pn-us-erro" role="alert">{erro}</span>}
      </div>
    </ModalV2>
  );
}
