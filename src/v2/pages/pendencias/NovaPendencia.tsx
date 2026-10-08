/* Pendências — "Nova pendência" em tela cheia, 3 etapas:
   1 Cliente (só clientes FECHADOS) · 2 O que o juiz pediu · 3 Mensagem e lembretes.
   Demo: grava no store em memória. Real: RPC pendencia_criar (o tick despacha). */
import { useEffect, useState } from 'react';
import { BotaoPrimario, BotaoSec, ConfirmDialogV2, Segmentado } from '../../components';
import {
  MAX_ENVIOS, ROTULO_TIPO, clonarPassos, diasAte, iniciais, instanteLembrete, nomeBonito, previsaoSaida, proximaJanela,
  quandoCurto, variavelSemDado,
  type ClienteFechado, type Passo, type TipoPendencia,
} from '@/data/pendencias';
import { EditorRegua, reguaPronta, useEscFecha } from './EditorRegua';
import { useBuscaClientes } from './fonte';
import { Falta, usePend } from './PendenciasTela';
import { IcAlerta, IcBusca, IcCheck, IcEnviar, IcPedido, IcRelogio, IcSeta, IcVoltar } from './icones';

const DICA_TIPO: Record<TipoPendencia, string> = {
  reassinatura: 'Procuração, contrato…',
  documento: 'RG, comprovante, extrato…',
  informacao: 'Endereço, conta…',
  outro: 'Qualquer outro pedido do juiz',
};
const ETAPAS = ['Cliente', 'O que precisa', 'Mensagens'];

/** data local "AAAA-MM-DD" (toISOString daria a data de Greenwich: depois das 21h viraria amanhã) */
const isoLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function useAtrasado<T>(v: T, ms: number) {
  const [d, setD] = useState(v);
  useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t); }, [v, ms]);
  return d;
}

export function NovaPendencia({ clienteInicial, clienteInicialDados, aoFechar, aoCriar }: {
  clienteInicial?: string; clienteInicialDados?: ClienteFechado; aoFechar: () => void; aoCriar: (id: string) => void;
}) {
  const { f, avisar, rodar } = usePend();
  const [etapa, setEtapa] = useState(clienteInicial ? 2 : 1);
  const [cliente, setCliente] = useState<ClienteFechado | undefined>(clienteInicialDados);
  const [busca, setBusca] = useState('');
  const buscaAtrasada = useAtrasado(busca, 250);
  const { lista, carregando } = useBuscaClientes(buscaAtrasada);
  const [tipo, setTipo] = useState<TipoPendencia | ''>('');
  const [oQue, setOQue] = useState('');
  const [prazo, setPrazo] = useState('');
  const [processo, setProcesso] = useState(clienteInicialDados?.processo ?? '');
  const [modeloId, setModeloId] = useState('');
  const [passos, setPassos] = useState<Passo[]>([]);
  /* o que veio do modelo: se `passos` é outro array, a pessoa mexeu (o editor só cria array novo quando muda algo) */
  const [passosBase, setPassosBase] = useState<Passo[]>([]);
  const [trocarPara, setTrocarPara] = useState<string | null>(null);
  const [quando, setQuando] = useState<'agora' | 'depois'>('agora');
  const [dataAg, setDataAg] = useState(() => { const d = new Date(); d.setDate(d.getDate() + 1); return isoLocal(d); });
  const [horaAg, setHoraAg] = useState('09:00');
  const [sair, setSair] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const escolherModelo = (id: string) => {
    setModeloId(id);
    const m = f.modelos.find((x) => x.id === id);
    const ps = m ? clonarPassos(m.passos) : [{ id: 'p0', dia: 0, hora: 'agora', blocos: [{ id: 'b0', tipo: 'texto' as const, texto: '' }] }];
    setPassos(ps); setPassosBase(ps);
  };
  const editado = passos.length > 0 && passos !== passosBase;
  const irPara3 = () => {
    if (!passos.length) escolherModelo(f.modelos.find((m) => m.tipo === tipo)?.id ?? '');
    setEtapa(3);
  };
  /* com cliente já escolhido (veio do painel), a etapa 1 fica travada */
  const minEtapa = clienteInicial ? 2 : 1;
  const voltar = () => (etapa > minEtapa ? setEtapa(etapa - 1) : fechar());

  /* sujo = a pessoa preencheu algo (escolher o cliente sozinho não conta) */
  const sujo = !!tipo || !!oQue.trim() || !!prazo || processo.trim() !== (clienteInicialDados?.processo ?? '');
  const fechar = () => (sujo ? setSair(true) : aoFechar());
  useEscFecha(fechar, !enviando);

  const ctx = cliente ? { cliente, oQue, prazo: prazo ? `${prazo}T12:00:00` : undefined, processo, atendente: f.usuario.nome, remetente: f.ajustes.numero.nome, telefone: f.ajustes.numero.telefone } : null;
  const faltando = (() => {
    if (!passos.length || !passos[0].blocos.length) return 'A primeira mensagem está vazia.';
    if (passos.length > MAX_ENVIOS) return `Máximo de ${MAX_ENVIOS} envios.`;
    const x = reguaPronta(passos, ctx ?? undefined); if (x) return x;
    if (quando === 'depois' && (!dataAg || !horaAg)) return 'Escolha a data e a hora do envio.';
    if (quando === 'depois' && new Date(`${dataAg}T${horaAg}:00`).getTime() <= Date.now()) return 'Escolha um horário no futuro.';
    return '';
  })();

  /* quando a 1ª sai DE VERDADE: o motor só manda dentro do horário de envio (Ajustes) */
  const aj = f.ajustes;
  const alvo = quando === 'depois' && dataAg && horaAg ? new Date(`${dataAg}T${horaAg}:00`) : new Date();
  const saiEm = proximaJanela(alvo, aj);
  const foraJanela = saiEm.getTime() - alvo.getTime() > 60_000;
  const inicio = quando === 'depois' || foraJanela ? saiEm.toISOString() : undefined;
  const l1 = passos[1] ? proximaJanela(new Date(instanteLembrete(alvo, Math.max(1, passos[1].dia), passos[1].hora, aj.diasUteis)), aj) : undefined;
  const juntoL1 = foraJanela && !!l1 && l1.getTime() <= saiEm.getTime() + 5 * 60_000;
  /* um aviso só, o mais importante primeiro: curto no rodapé (uma linha), inteiro no title.
     Nada sai (desligado / número caído) vem antes de tudo: nunca esconder que a mensagem não sai */
  const nomeNum = nomeBonito(aj.numero.nome);
  const semDado = etapa === 3 && ctx ? variavelSemDado(passos, ctx) : '';
  const qSai = quandoCurto(saiEm.toISOString());
  const aviso = etapa !== 3 ? null
    : !aj.ativo ? { curto: 'Envios desligados: sai quando ligarem.', longo: 'Envios desligados: a pendência fica aberta e a mensagem sai quando ligarem os envios.' }
      : !aj.numero.conectado ? { curto: 'Número desconectado: sai quando voltar.', longo: `O número ${nomeNum} está desconectado: a mensagem sai quando ele voltar.` }
        : semDado ? { curto: semDado.startsWith('Sem prazo') ? 'Sem prazo: “Prazo” fica em branco.' : 'Sem nº do processo: fica em branco.', longo: semDado }
          : foraJanela ? {
            curto: juntoL1 ? `Sai ${qSai}, junto com o Lembrete 1.` : `Fora do horário: sai ${qSai}.`,
            longo: `Fora do horário de envio (${aj.janelaIni} às ${aj.janelaFim}${aj.diasUteis && [0, 6].includes(alvo.getDay()) ? ', de segunda a sexta' : ''}): a primeira mensagem sai ${qSai}${juntoL1 ? ', junto com o Lembrete 1. Mude o Lembrete 1 para outro dia' : ''}.`,
          } : null;
  const enviar = async () => {
    if (!cliente || !tipo || faltando || enviando) return;
    setEnviando(true);
    let id = '';
    const prev = previsaoSaida(alvo.toISOString(), aj);
    const msgOk = !f.real
      ? (quando === 'depois' ? 'Demonstração: envio agendado (nada sai de verdade).'
        : prev === 'em instantes' ? `Demonstração: a mensagem iria agora para ${nomeBonito(cliente.nome).split(' ')[0]} pelo número ${nomeNum}.`
          : `Demonstração: a mensagem sairia ${prev} (nada sai de verdade).`)
      : quando === 'depois' && aj.ativo ? 'Pendência aberta e agendada.'
        : `Pendência aberta. A mensagem sai ${prev}${prev.startsWith('quando') ? '' : ` pelo número ${nomeNum}`}.`;
    const ok = await rodar(async () => {
      id = await f.acoes.criar({
        clienteId: cliente.id, tipo, oQue: oQue.trim(), prazo: prazo ? `${prazo}T12:00:00` : undefined, processo: processo.trim() || undefined,
        passos, agendarPara: quando === 'depois' ? new Date(`${dataAg}T${horaAg}:00`).toISOString() : undefined,
      });
    }, msgOk);
    setEnviando(false);
    if (ok) aoCriar(id);
  };

  return (
    <div className="pd-ed" role="dialog" aria-modal="true" aria-label="Nova pendência">
      <div className="pd-ed-topo">
        <div className="pd-ed-esq">
          <button type="button" className="pd-ed-voltar" onClick={voltar} aria-label="Voltar" title="Voltar"><IcVoltar /></button>
          <h2 className="pd-ed-tit">Nova pendência{cliente && etapa > 1 ? <small> · {nomeBonito(cliente.nome).split(' ').slice(0, 2).join(' ')}</small> : null}</h2>
        </div>
        <ol className="pd-etapas" aria-label="Etapas">
          {ETAPAS.map((r, i) => {
            const e = etapa === i + 1 ? 'atual' : etapa > i + 1 ? 'feita' : 'futura';
            const travada = e === 'feita' && i + 1 < minEtapa;
            return (
              <li key={r} className="pd-etapa" data-e={travada ? 'travada' : e}>
                {i > 0 && <i className="pd-etapa-linha" data-feita={etapa > i ? '' : undefined} aria-hidden />}
                <button type="button" disabled={e !== 'feita' || travada} onClick={() => setEtapa(i + 1)} aria-current={e === 'atual' ? 'step' : undefined}>
                  <span className="pd-etapa-n">{e === 'feita' ? <IcCheck t={12} /> : i + 1}</span>{r}
                </button>
              </li>
            );
          })}
        </ol>
        <div className="pd-ed-dir"><BotaoSec onClick={fechar}>Cancelar</BotaoSec></div>
      </div>

      <div className="pd-ed-corpo">
        {etapa === 1 && (
          <div className="pd-etapa-corpo">
            <h3 className="pd-h">Para qual cliente?</h3>
            <p className="pd-h-sub">Só aparecem clientes que já fecharam com a gente.</p>
            <label className="pd-busca">
              <IcBusca />
              <input autoFocus value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nome ou telefone" aria-label="Buscar cliente" />
            </label>
            <div className="vidro pd-cands" role="list">
              {lista.map((c) => {
                const escolhido = c.id === cliente?.id;
                return (
                  <button key={c.id} type="button" role="listitem" className="pd-cand" aria-pressed={escolhido}
                    onClick={() => { setCliente(c); setProcesso(''); setEtapa(2); }}>
                    <span className="pd-av">{iniciais(c.nome)}</span>
                    <span className="pd-cand-tx">
                      <span className="pd-cand-n">{nomeBonito(c.nome)}</span>
                      <span className="pd-cand-s">{[c.telefone, c.acao, c.responsavel].filter(Boolean).join(' · ')}</span>
                    </span>
                    <span className="pd-cand-dir">
                      {c.abertas > 0 && <span className="pd-cand-ab num" data-varias={c.abertas >= 2 ? '' : undefined}>{c.abertas} {c.abertas === 1 ? 'aberta' : 'abertas'}</span>}
                      {escolhido && <span className="pd-cand-ok"><IcCheck /></span>}
                    </span>
                  </button>
                );
              })}
              {!lista.length && !carregando && <p className="pd-cands-vz">Nenhum cliente fechado com esse nome.</p>}
              {!lista.length && carregando && <p className="pd-cands-vz">Procurando…</p>}
            </div>
          </div>
        )}

        {etapa === 2 && cliente && (
          <div className="pd-etapa-corpo">
            <div className="vidro pd-cli-min">
              <span className="pd-av">{iniciais(cliente.nome)}</span>
              <span className="pd-cand-tx">
                <span className="pd-cand-n">{nomeBonito(cliente.nome)}</span>
                <span className="pd-cand-s">{[cliente.telefone, cliente.acao].filter(Boolean).join(' · ')}</span>
              </span>
              {!clienteInicial && <BotaoSec mini onClick={() => setEtapa(1)}>Trocar</BotaoSec>}
            </div>
            <h3 className="pd-h pd-h-2">O que o juiz pediu?</h3>
            <div className="pd-tipos" role="group" aria-label="Tipo de pendência">
              {(Object.keys(ROTULO_TIPO) as TipoPendencia[]).map((t) => (
                <button key={t} type="button" className="pd-tipo" aria-pressed={tipo === t}
                  onClick={() => { if (t === tipo) return; setTipo(t); if (!editado) { setPassos([]); setModeloId(''); setPassosBase([]); } }}>
                  <span className="pd-tipo-ic"><IcPedido t={t} tam={18} /></span>
                  <span className="pd-tipo-tx"><b>{ROTULO_TIPO[t]}</b><span title={DICA_TIPO[t]}>{DICA_TIPO[t]}</span></span>
                </button>
              ))}
            </div>
            <div className="pd-campo">
              <label htmlFor="pd-oque">Em poucas palavras<span className="pd-campo-dica">entra na mensagem no lugar de “O que precisa”</span></label>
              <input id="pd-oque" className="inp pd-inp" value={oQue} maxLength={160} onChange={(e) => setOQue(e.target.value)}
                placeholder={tipo === 'documento' ? 'ex.: comprovante de residência atualizado' : tipo === 'informacao' ? 'ex.: se o endereço continua o mesmo' : 'ex.: reassinar a procuração'} />
            </div>
            <div className="pd-campo-par">
              <div className="pd-campo">
                <label htmlFor="pd-prazo">Prazo do juiz<span className="pd-campo-dica">se tiver</span></label>
                <input id="pd-prazo" type="date" className="inp pd-inp" value={prazo} onChange={(e) => setPrazo(e.target.value)} />
                {prazo && diasAte(`${prazo}T12:00:00`) < 0 && <span className="pd-campo-erro"><IcAlerta t={13} />Essa data já passou. Confira o ano.</span>}
              </div>
              <div className="pd-campo">
                <label htmlFor="pd-proc">Nº do processo<span className="pd-campo-dica">se quiser</span></label>
                <input id="pd-proc" className="inp pd-inp num" value={processo} maxLength={40} onChange={(e) => setProcesso(e.target.value)} placeholder="0000000-00.0000.0.00.0000" />
              </div>
            </div>
          </div>
        )}

        {etapa === 3 && ctx && (
          <EditorRegua passos={passos} aoMudar={setPassos} ctx={ctx} avisar={avisar} subir={f.subir} inicio={inicio}
            saiTexto={!aj.ativo ? 'Sai quando ligarem os envios' : !aj.numero.conectado ? 'Sai quando o número voltar' : foraJanela ? `Sai ${qSai}` : undefined}
            notaPe={`Sai pelo número ${nomeNum}. Os lembretes param sozinhos quando o cliente responde.`}
            extraEsquerda={(
              <label className="pd-trilho-campo">
                <span className="pd-trilho-rot">Mensagem pronta</span>
                <select className="inp" value={modeloId} onChange={(e) => (editado ? setTrocarPara(e.target.value) : escolherModelo(e.target.value))}>
                  {f.modelos.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
                  <option value="">Em branco</option>
                </select>
              </label>
            )} />
        )}
      </div>

      {/* rodapé só existe quando tem conteúdo (etapa 1 não tem) */}
      {etapa === 2 && (
        <div className="pd-ed-rodape">
          {/* no eixo do formulário: "Continuar" alinha com a borda direita dos campos */}
          <div className="pd-ed-rodape-in">
            <span className="pd-esp" />
            <Falta t={!tipo ? 'Escolha o tipo de pedido.' : !oQue.trim() ? 'Escreva o que precisa.' : ''} />
            <BotaoPrimario disabled={!tipo || !oQue.trim()} onClick={irPara3}>Continuar<IcSeta /></BotaoPrimario>
          </div>
        </div>
      )}
      {etapa === 3 && (
        <div className="pd-ed-rodape">
          <div className="pd-envio">
            <Segmentado rotulo="Quando enviar" valor={quando} aoMudar={setQuando}
              opcoes={[{ valor: 'agora', rotulo: 'Agora' }, { valor: 'depois', rotulo: 'Em outro dia' }]} />
            {quando === 'depois' && (
              <>
                <input type="date" className="inp pd-envio-data" value={dataAg} min={isoLocal(new Date())} onChange={(e) => setDataAg(e.target.value)} aria-label="Data do envio" />
                <input type="time" className="inp pd-envio-hora" value={horaAg} onChange={(e) => setHoraAg(e.target.value || horaAg)} aria-label="Hora do envio" />
              </>
            )}
          </div>
          <span className="pd-esp" />
          {faltando ? <Falta t={faltando} /> : aviso ? <Falta t={aviso.curto} titulo={aviso.longo} /> : null}
          <BotaoPrimario disabled={!!faltando || enviando} onClick={enviar}>{quando === 'agora' ? <><IcEnviar />Enviar agora</> : <><IcRelogio />Agendar</>}</BotaoPrimario>
        </div>
      )}

      <ConfirmDialogV2 aberto={trocarPara !== null} titulo="Trocar a mensagem pronta?"
        mensagem={<span className="pd-dlg-tx">As mensagens que você mudou vão ser substituídas.</span>}
        rotuloConfirmar="Trocar" destrutivo aoConfirmar={() => { escolherModelo(trocarPara ?? ''); setTrocarPara(null); }} aoCancelar={() => setTrocarPara(null)} />
      <ConfirmDialogV2 aberto={sair} titulo="Descartar esta pendência?" mensagem={<span className="pd-dlg-tx">O que você preencheu vai se perder.</span>}
        rotuloConfirmar="Descartar" destrutivo aoConfirmar={() => { setSair(false); aoFechar(); }} aoCancelar={() => setSair(false)} />
    </div>
  );
}
