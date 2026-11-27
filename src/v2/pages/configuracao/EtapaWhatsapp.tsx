/* ------------------------------------------------------------------
   Configuração inicial — ETAPA 2: WhatsApp da cobrança (obrigatória).
   A régua manda as mensagens pelo WhatsApp; esta etapa só conecta os
   números — NÃO liga a régua (decisão do dono, em outro momento; o
   aviso mora nos fatos do cabeçalho do card, no Assistente).
   Duas formas (cartões): um número por atendente (recomendado) ou um
   número só para todos (mais arriscado, exige "Entendo o risco").
   Conectar = QR com o dono já escolhido. Na PRÉVIA o QR é simulado e
   conecta sozinho em ~5s; no real, a fonte é a mesma dos Números
   (TODO na camada de dados: useConectarWA/useCanaisWA do NumerosReviza).
   Concluir: ≥1 número conectado; faltando atendente → aviso + confirmação.
   Corpo = seções .cini-sec empilhadas + rodapé fixo .cini-pe-etapa.
   ------------------------------------------------------------------ */
import { useEffect, useId, useRef, useState } from 'react';
import { BotaoPrimario, BotaoSec, ModalV2 } from '../../components';
import {
  useCoberturaWhatsapp, useConexaoWhatsapp, useSalvarWhatsapp,
  type AlvoConexao, type ComercialWhats, type EstadoConfiguracao, type ModoWhatsapp, type SessaoConexao,
} from '../../data/cobranca/configuracao';
import { Ic } from './EtapaPlanilha';
import { FigModoAtendentes, FigModoUnico, FigQrConectar } from './figuras/figurasSistema';
import { IcCheck, iniciais } from './TelaEspera';

const plural = (n: number, um: string, muitos: string) => `${n.toLocaleString('pt-BR')} ${n === 1 ? um : muitos}`;
/** "A, B e C" */
const listaNomes = (ns: string[]) => (ns.length <= 1 ? ns.join('') : `${ns.slice(0, -1).join(', ')} e ${ns[ns.length - 1]}`);

const IcEquipe = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false">
    <circle cx="9" cy="8" r="3.4" /><path d="M3.5 20c.6-3.4 2.8-5 5.5-5s4.9 1.6 5.5 5M16 4.6a3.4 3.4 0 0 1 0 6.8M17.5 15.2c1.7.6 2.7 2.2 3 4.8" />
  </svg>
);
const IcUnico = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false">
    <rect x="7" y="2.8" width="10" height="18.4" rx="2.4" /><path d="M10.5 17.6h3" />
  </svg>
);
const IcAlerta = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false">
    <path d="M10.3 4.2L2.6 17.6A2 2 0 0 0 4.3 20.6h15.4a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0zM12 9.5v4.2M12 17h.01" />
  </svg>
);
/** × de traço (erro) */
const IcX = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false">
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);

/** estado do número de cada atendente: ponto + texto (substitui as pílulas) */
const ESTADO_NUMERO: Record<ComercialWhats['status'], { tom: 'ok' | 'neutro' | 'erro'; rot: string }> = {
  conectado: { tom: 'ok', rot: 'Conectado' },
  'sem-numero': { tom: 'neutro', rot: 'Sem número' },
  desconectado: { tom: 'erro', rot: 'Desconectado' },
};

/* ================= janela de conexão (QR → conectado) ================= */
type Fase = 'gerando' | 'aguardando' | 'conectado' | 'expirado' | 'erro';

function DialogoConexao({ alvo, aoFechar }: { alvo: AlvoConexao; aoFechar: (numeroId: string | null) => void }) {
  const { iniciar, consultar } = useConexaoWhatsapp();
  const [fase, setFase] = useState<Fase>('gerando');
  const [sessao, setSessao] = useState<SessaoConexao | null>(null);
  const [numero, setNumero] = useState<{ id: string; tel: string } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);
  const descId = useId();

  // montado (StrictMode monta/desmonta/monta: o pedido de QR sai UMA vez por tentativa)
  const montado = useRef(true);
  useEffect(() => { montado.current = true; return () => { montado.current = false; }; }, []);
  const pedida = useRef(-1);
  useEffect(() => {
    if (pedida.current === tentativa) return;
    pedida.current = tentativa;
    setFase('gerando'); setErro(null); setSessao(null);
    iniciar(alvo)
      .then((s) => { if (montado.current) { setSessao(s); setFase('aguardando'); } })
      .catch((e: unknown) => { if (montado.current) { setErro(e instanceof Error ? e.message : 'Não foi possível gerar o código.'); setFase('erro'); } });
  }, [tentativa, alvo, iniciar]);

  // aguardando a leitura: confere a cada 1,5s
  useEffect(() => {
    if (fase !== 'aguardando' || !sessao) return;
    let vivo = true;
    const t = window.setInterval(() => {
      consultar(sessao).then((r) => {
        if (!vivo) return;
        if (r.estado === 'conectado') { setNumero({ id: r.numeroId, tel: r.numero }); setFase('conectado'); }
        else if (r.estado === 'expirado') setFase('expirado');
      }).catch((e: unknown) => { if (vivo) { setErro(e instanceof Error ? e.message : 'A conexão falhou.'); setFase('erro'); } });
    }, 1_500);
    return () => { vivo = false; window.clearInterval(t); };
  }, [fase, sessao, consultar]);

  const quem = alvo.usuarioId ? alvo.nome : null;
  const fechar = () => aoFechar(numero?.id ?? null);
  // enquanto espera a leitura, a janela abre espaço para a figura de demonstração ao lado do QR
  const comDemo = fase === 'gerando' || fase === 'aguardando';

  return (
    <ModalV2 aberto aoFechar={fechar} largura={comDemo ? 720 : 420} fecharNoVeu={fase !== 'gerando'} descricaoId={descId}
      titulo={<div>Conectar WhatsApp<div className="mod-sub">{quem ? `Número de ${quem}` : 'Número único da cobrança'}</div></div>}
      rodape={fase === 'conectado'
        ? <BotaoPrimario onClick={fechar}>Concluído</BotaoPrimario>
        : <BotaoSec onClick={fechar}>Cancelar</BotaoSec>}>
      <div className="cini-qr" id={descId}>
        {fase === 'conectado' && numero ? (
          <div className="cini-qr-ok" role="status">
            <span className="cini-qr-ok-ic" aria-hidden><IcCheck tam={22} /></span>
            <b className="cini-qr-tit">WhatsApp conectado</b>
            <span className="cini-qr-tx">{quem ? <>O número de <b>{quem}</b> é</> : 'O número da cobrança é'} <b className="num">{numero.tel}</b>.</span>
            <span className="cini-qr-nota">{quem ? `Os clientes de ${quem} passam a receber por este número quando a régua for ligada.` : 'Todos os clientes passam a receber por este número quando a régua for ligada.'}</span>
          </div>
        ) : fase === 'erro' || fase === 'expirado' ? (
          <div className="cini-qr-erro" role="alert">
            <b className="cini-qr-tit"><span className="cini-qr-erro-ic"><IcX /></span>{fase === 'expirado' ? 'O código expirou.' : 'Não deu certo.'}</b>
            <span className="cini-qr-tx">{fase === 'expirado' ? 'Os códigos do WhatsApp valem poucos segundos. Gere um novo e leia logo em seguida.' : erro}</span>
            <BotaoSec onClick={() => setTentativa((n) => n + 1)}>Gerar novo código</BotaoSec>
          </div>
        ) : (
          <div className="cini-qr-par">
            {/* tutorial: a demonstração do caminho no celular + os passos por escrito */}
            <div className="cini-qr-tutorial">
              <span className="cini-qr-demo" aria-hidden><FigQrConectar /></span>
              <ol className="cini-qr-passos">
                <li>Abra o WhatsApp no celular{quem ? <> de <b>{quem}</b></> : ' que vai fazer os envios'}.</li>
                <li>Toque em <b>Aparelhos conectados</b> e depois em <b>Conectar aparelho</b>.</li>
                <li>Aponte a câmera para este código.</li>
              </ol>
            </div>
            <div className="cini-qr-col">
              <div className={'cini-qr-quadro' + (fase === 'gerando' ? ' cini-gerando' : '')}>
                {fase === 'aguardando' && sessao?.qrSrc
                  ? <img src={sessao.qrSrc} alt={`QR Code para conectar o WhatsApp${quem ? ` de ${quem}` : ''}`} width={208} height={208} />
                  : <span className="cini-anel cini-anel-g cini-anel-qr" aria-hidden />}
              </div>
              <p className="cini-qr-status" role="status" aria-live="polite">
                <span className="cini-anel cini-anel-p" aria-hidden />
                {fase === 'gerando' ? 'Gerando o código…' : 'Aguardando a leitura do código…'}
              </p>
            </div>
          </div>
        )}
      </div>
    </ModalV2>
  );
}

/* ================= a etapa ================= */
export function EtapaWhatsapp({ estado }: { estado: EstadoConfiguracao }) {
  const concluida = estado.etapas.whatsapp;
  const cobQ = useCoberturaWhatsapp();
  const salvar = useSalvarWhatsapp();
  const nomeGrupo = useId();
  // o recomendado já vem marcado; o arriscado exige escolha + "Entendo o risco"
  const [modo, setModo] = useState<ModoWhatsapp | null>(estado.whatsapp.modo ?? 'por-atendente');
  const [editando, setEditando] = useState(false);
  const [alvo, setAlvo] = useState<AlvoConexao | null>(null);
  const [confirmaFaltando, setConfirmaFaltando] = useState(false);
  const [risco, setRisco] = useState(false);
  const [unicoId, setUnicoId] = useState<string | null>(estado.whatsapp.numeroUnicoId);
  // foco de volta ao fechar a janela do QR: o botão que a abriu some quando o atendente
  // fica "Conectado" (o ModalV2 não devolve o foco) → cai no título da seção
  const gatilhoRef = useRef<HTMLElement | null>(null);
  const blocoTitRef = useRef<HTMLHeadingElement>(null);
  const abrirConexao = (a: AlvoConexao) => {
    gatilhoRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setAlvo(a);
  };

  const comerciais = cobQ.data?.comerciais ?? [];
  const numeros = cobQ.data?.numeros ?? [];
  const conectadosC = comerciais.filter((c) => c.status === 'conectado');
  const faltando = comerciais.filter((c) => c.status !== 'conectado' && c.clientes > 0);
  const totalClientes = comerciais.reduce((s, c) => s + c.clientes, 0);
  const alcancados = conectadosC.reduce((s, c) => s + c.clientes, 0);
  const numerosOk = numeros.filter((n) => n.conectado);
  const unicoValido = !!unicoId && numerosOk.some((n) => n.id === unicoId);
  const mostrarEscolha = !concluida || editando;

  // o que falta para concluir (o botão diz por que está desligado)
  const pendencia: string | null =
    modo == null ? 'Escolha como os números vão enviar.'
    : modo === 'por-atendente'
      ? conectadosC.length === 0 ? 'Conecte pelo menos um número para concluir.'
        : faltando.length > 0 && !confirmaFaltando ? 'Confirme que os clientes dos atendentes sem número vão esperar.' : null
      : numerosOk.length === 0 ? 'Conecte o número que fará os envios.'
        : !unicoValido ? 'Escolha o número que fará todos os envios.'
          : !risco ? 'Confirme que entende o risco de bloqueio do número.' : null;

  const aoFecharConexao = (numeroId: string | null) => {
    if (numeroId && alvo && alvo.usuarioId == null) setUnicoId(numeroId); // número novo do modo único já vem escolhido
    setAlvo(null);
    window.setTimeout(() => {
      const g = gatilhoRef.current;
      gatilhoRef.current = null;
      if (g && g.isConnected && !(g as HTMLButtonElement).disabled) g.focus();
      else blocoTitRef.current?.focus();
    }, 30);
  };
  const concluir = () => {
    if (!modo || pendencia) return;
    salvar.mutate({ modo, numeroUnicoId: modo === 'unico' ? unicoId : null }, { onSuccess: () => setEditando(false) });
  };

  const mostrarAtendentes = (mostrarEscolha && modo === 'por-atendente') || (!mostrarEscolha && estado.whatsapp.modo !== 'unico');
  const erroSalvar = salvar.isError ? ((salvar.error as Error).message || 'Não foi possível salvar. Tente de novo.') : null;

  return (
    <div className="cini-wa">
      {/* ---------- concluída: a forma escolhida + atalho para alterar ---------- */}
      {concluida && !editando && (
        <div className="cini-sec">
          <div className="cini-status cini-status-ok" role="status">
            <span className="cini-status-ic" aria-hidden><IcCheck tam={16} /></span>
            <span className="cini-status-tx">
              <b>{estado.whatsapp.modo === 'unico' ? 'Um número só para todos' : 'Um número por atendente'}</b>
              {estado.whatsapp.modo === 'unico'
                ? ` · ${numerosOk.find((n) => n.id === estado.whatsapp.numeroUnicoId)?.numero ?? 'número escolhido'}`
                : cobQ.data ? ` · ${conectadosC.length} de ${comerciais.length} atendentes com número` : ''}
            </span>
            <button type="button" className="cini-link" onClick={() => { setEditando(true); setModo(estado.whatsapp.modo); }}>Alterar a forma de envio</button>
          </div>
        </div>
      )}

      {/* ---------- a escolha (cartões com rádio nativo) ---------- */}
      {mostrarEscolha && (
        <fieldset className="cini-sec cini-escolha">
          <legend className="cini-sec-tit">Como os números vão enviar</legend>
          <div className="cini-ops">
            <label className={'cini-op' + (modo === 'por-atendente' ? ' cini-sel' : '')}>
              <input type="radio" name={nomeGrupo} value="por-atendente" checked={modo === 'por-atendente'} onChange={() => setModo('por-atendente')} />
              <span className="cini-op-corpo">
                {/* demonstração (decorativa: o texto do cartão diz o mesmo, sem poluir o rótulo do rádio) */}
                <span className="cini-op-fig" aria-hidden><FigModoAtendentes /></span>
                <span className="cini-op-cab">
                  <span className="cini-tile-p" aria-hidden><IcEquipe /></span>
                  <b>Um número por atendente</b>
                  <span className="cini-tag-rec">Recomendado</span>
                </span>
                <span className="cini-op-tx">Cada atendente conecta o próprio número. O volume fica dividido e o risco de bloqueio é bem menor.</span>
              </span>
              <span className="cini-op-radio" aria-hidden />
            </label>
            <label className={'cini-op' + (modo === 'unico' ? ' cini-sel' : '')}>
              <input type="radio" name={nomeGrupo} value="unico" checked={modo === 'unico'} onChange={() => setModo('unico')} />
              <span className="cini-op-corpo">
                <span className="cini-op-fig" aria-hidden><FigModoUnico /></span>
                <span className="cini-op-cab">
                  <span className="cini-tile-p" aria-hidden><IcUnico /></span>
                  <b>Um número só para todos</b>
                  <span className="cini-tag-neutra">Mais arriscado</span>
                </span>
                <span className="cini-op-tx">Um único número envia para todos os clientes: o volume concentrado aumenta muito o risco de bloqueio.</span>
              </span>
              <span className="cini-op-radio" aria-hidden />
            </label>
          </div>
        </fieldset>
      )}

      {/* ---------- atendentes (recomendado; também visível depois de concluída) ---------- */}
      {mostrarAtendentes && (
        <section className="cini-sec" aria-labelledby={`${nomeGrupo}-at`}>
          <h3 className="cini-sec-tit" id={`${nomeGrupo}-at`} ref={blocoTitRef} tabIndex={-1}>Atendentes com clientes em cobrança</h3>
          <p className="cini-sec-sub">Cada atendente conecta o próprio número; o código já sai com o nome dele.</p>

          {cobQ.data && comerciais.length > 0 && (
            <div className="cini-alcance">
              <span className="num"><b>{conectadosC.length}</b> de {comerciais.length} atendentes com número</span>
              <span className="cini-barra" aria-hidden><i style={{ width: `${totalClientes ? (alcancados / totalClientes) * 100 : 0}%` }} /></span>
              <span className="num"><b>{alcancados.toLocaleString('pt-BR')}</b> de {plural(totalClientes, 'cliente alcançado', 'clientes alcançados')}</span>
            </div>
          )}

          {cobQ.isLoading ? (
            <div className="cini-lista" aria-busy="true" aria-label="Carregando atendentes">
              {[0, 1, 2].map((i) => <div key={i} className="cini-linha cini-linha-esq"><span className="skel cini-skel-av" /><span className="skel cini-skel-tx" /></div>)}
            </div>
          ) : cobQ.isError ? (
            <div className="cini-status cini-status-er" role="alert">
              <span className="cini-status-ic" aria-hidden><IcX /></span>
              <span className="cini-status-tx">Não foi possível carregar os atendentes.</span>
              <BotaoSec mini onClick={() => { void cobQ.refetch(); }}>Tentar de novo</BotaoSec>
            </div>
          ) : comerciais.length === 0 ? (
            <p className="cini-vazio">Nenhum atendente com clientes em cobrança ainda. Conclua a etapa da planilha para a carteira aparecer aqui.</p>
          ) : (
            <ul className="cini-lista">
              {comerciais.map((c) => {
                const st = ESTADO_NUMERO[c.status];
                return (
                  <li key={c.usuarioId} className="cini-linha">
                    <span className="cini-av" aria-hidden>{iniciais(c.nome)}</span>
                    <span className="cini-linha-quem">
                      <b>{c.nome}</b>
                      <span className="num">{plural(c.clientes, 'cliente em cobrança', 'clientes em cobrança')}</span>
                    </span>
                    <span className="cini-linha-st">
                      <span className={`cini-ponto cini-ponto-${st.tom}`}>{st.rot}</span>
                      {c.numero && <span className="cini-linha-tel num">{c.numero}</span>}
                    </span>
                    <span className="cini-linha-acao">
                      {c.status !== 'conectado' && (
                        <BotaoSec mini onClick={() => abrirConexao({ usuarioId: c.usuarioId, nome: c.nome })}
                          aria-label={`${c.status === 'desconectado' ? 'Conectar de novo' : 'Conectar'} o número de ${c.nome}`}>
                          {c.status === 'desconectado' ? 'Conectar de novo' : 'Conectar'}
                        </BotaoSec>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}

          {mostrarEscolha && conectadosC.length > 0 && faltando.length > 0 && (
            <div className="cini-sem cini-sem-at">
              <span className="cini-sem-ic" aria-hidden><IcAlerta /></span>
              <div className="cini-sem-corpo">
                <p className="cini-sem-tx">Os clientes de {listaNomes(faltando.map((c) => c.nome))} ficam esperando até o número deles ser conectado.</p>
                <label className="cini-chk">
                  <input type="checkbox" checked={confirmaFaltando} onChange={(e) => setConfirmaFaltando(e.target.checked)} />
                  <span>Entendo e quero concluir assim mesmo — conecto os números que faltam depois.</span>
                </label>
              </div>
            </div>
          )}
        </section>
      )}

      {/* ---------- número único (mais arriscado) ---------- */}
      {mostrarEscolha && modo === 'unico' && (
        <section className="cini-sec" aria-labelledby={`${nomeGrupo}-un`}>
          <h3 className="cini-sec-tit" id={`${nomeGrupo}-un`} ref={blocoTitRef} tabIndex={-1}>Número que fará todos os envios</h3>
          <p className="cini-sec-sub">Escolha um número já conectado ou conecte um novo.</p>
          {cobQ.isLoading ? (
            <div className="cini-lista" aria-busy="true" aria-label="Carregando números"><div className="cini-linha cini-linha-esq"><span className="skel cini-skel-av" /><span className="skel cini-skel-tx" /></div></div>
          ) : (
            <div className="cini-nums-bloco">
              {numerosOk.length > 0 && (
                <div className="cini-nums" role="radiogroup" aria-label="Número único da cobrança">
                  {numerosOk.map((n) => (
                    <label key={n.id} className={'cini-num' + (unicoId === n.id ? ' cini-sel' : '')}>
                      <input type="radio" name={`${nomeGrupo}-unico`} checked={unicoId === n.id} onChange={() => setUnicoId(n.id)} />
                      <span className="cini-op-radio" aria-hidden />
                      <span className="cini-num-tx"><b className="num">{n.numero}</b><span>{n.donoId ? `Número de ${n.nome}` : n.nome}</span></span>
                    </label>
                  ))}
                </div>
              )}
              <div>
                <BotaoSec onClick={() => abrirConexao({ usuarioId: null, nome: 'Número da cobrança' })}>
                  {numerosOk.length ? 'Conectar outro número' : 'Conectar número'}
                </BotaoSec>
              </div>
            </div>
          )}
          <div className="cini-sem cini-sem-at">
            <span className="cini-sem-ic" aria-hidden><IcAlerta /></span>
            <div className="cini-sem-corpo">
              <p className="cini-sem-tx">Com todos os envios saindo de um só número, um bloqueio do WhatsApp para a cobrança de todos os clientes ao mesmo tempo.</p>
              <label className="cini-chk">
                <input type="checkbox" checked={risco} onChange={(e) => setRisco(e.target.checked)} />
                <span>Entendo o risco de bloqueio do número</span>
              </label>
            </div>
          </div>
        </section>
      )}

      {/* ---------- rodapé fixo: o porquê do botão desligado / o erro · a ação ---------- */}
      {mostrarEscolha && (
        <div className="cini-pe cini-pe-etapa">
          <div className="cini-pe-dica">
            {pendencia ? (
              <><span className="cini-pe-ic" aria-hidden><Ic n="info" s={14} /></span><span>{pendencia}</span></>
            ) : erroSalvar ? (
              <span className="cini-pe-erro" role="alert">{erroSalvar}</span>
            ) : null}
          </div>
          <div className="cini-pe-acoes">
            {concluida && editando && <BotaoSec onClick={() => { setEditando(false); setModo(estado.whatsapp.modo); }} disabled={salvar.isPending}>Cancelar</BotaoSec>}
            <BotaoPrimario onClick={concluir} disabled={!!pendencia || salvar.isPending} aria-busy={salvar.isPending || undefined}>
              {salvar.isPending ? 'Salvando…' : concluida ? 'Salvar alteração' : 'Concluir etapa'}
            </BotaoPrimario>
          </div>
        </div>
      )}

      {alvo && <DialogoConexao alvo={alvo} aoFechar={aoFecharConexao} />}
    </div>
  );
}
