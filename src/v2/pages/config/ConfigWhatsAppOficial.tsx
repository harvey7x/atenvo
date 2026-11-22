/* CONFIGURAÇÕES → INTEGRAÇÕES → WHATSAPP OFICIAL (dono 22/11): "quero WhatsApp via API oficial; uma tela
   boa, simples de configurar; tem que ser tudo muito fácil de configurar".
   Conectar em três passos numa janela só: (1) entrar com o Facebook — ou colar um código de acesso;
   (2) escolher o número e dizer para qual ambiente ele trabalha; (3) o sistema confere tudo e diz o
   que falta. Depois: a saúde de cada número (nome, qualidade, limite, recebimento), mensagem de teste
   e os modelos de mensagem (criar, acompanhar a aprovação, sincronizar).
   Dados e chamadas: data/config/oficial.ts. O código de acesso nunca volta do servidor. */
import { useRef, useState } from 'react';
import { isPrevia } from '@/lib/supabase';
import { BadgeStatus, BotaoPrimario, BotaoSec, CardVidro, ConfirmDialogV2, EstadoErro, ModalV2 } from '../../components';
import { AcoesNoTopo } from '../comunicacao/MenuMais';
import { formatarTelefone } from '../../lib/telefone';
import { ROTULO_AMBIENTE, type Ambiente } from '../../data/modulos';
import {
  CATEGORIAS, ROTULO_NOME, ROTULO_QUALIDADE, ROTULO_SIT_MODELO, VARIAVEIS_MODELO, lerConferencia, modeloInvalido, nomeTecnico, tokenInvalido,
  useBuscarNumeros, useConectarOficial, useCriarModelo, useDesconectarOficial, useEntrarFacebook, useEnviarTesteOficial, useOficial, useSincronizarModelos, useTestarOficial,
  type Achados, type CategoriaModelo, type ContaOficial, type NumeroOficial, type PassoConferencia, type SituacaoModelo,
} from '../../data/config/oficial';
import '../painel/painel.css';

const IcOficial = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z" /><path d="m9 12 2 2 4-4" />
  </svg>
);
const IcCerto = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M20 6 9 17l-5-5" /></svg>;
const IcAtencao = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 8v5" /><path d="M12 16.5h.01" /></svg>;

const fone = (n: string) => formatarTelefone(n) || n;
const quando = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso); if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(',', '');
};
const limiteTexto = (n: number | null) => (n == null ? 'Sem limite' : n === 0 ? 'Não informado pela Meta' : `${n.toLocaleString('pt-BR')} clientes diferentes`);
const DESC_AMBIENTE: Record<Ambiente, string> = {
  cobrancas: 'A régua e as Conversas de Cobranças podem enviar por este número, usando os modelos aprovados.',
  atendimento: 'Recebe quem chama a empresa. As conversas entram no WhatsApp e no Kanban do Atendimento.',
};
const NOME_NA_LISTA = { aprovado: 'nome aprovado pela Meta', analise: 'nome em análise na Meta', recusado: 'nome recusado pela Meta' } as const;
const TOM_MODELO: Record<SituacaoModelo, 'ok' | 'atencao' | 'erro'> = { aprovado: 'ok', analise: 'atencao', recusado: 'erro' };
type Avisar = (texto: string, tom?: 'ok' | 'erro') => void;
type Janela = { tipo: 'conectar' } | { tipo: 'teste'; n: NumeroOficial } | { tipo: 'desconectar'; n: NumeroOficial } | { tipo: 'modelo' };

export function ConfigWhatsAppOficial() {
  const q = useOficial();
  const [aviso, setAviso] = useState<{ texto: string; tom: 'ok' | 'erro' } | null>(null);
  const [janela, setJanela] = useState<Janela | null>(null);
  const avisar: Avisar = (texto, tom = 'ok') => setAviso({ texto, tom });
  const desconectar = useDesconectarOficial();
  const conta = q.dados;
  const sair = async (n: NumeroOficial) => {
    try { await desconectar.mutateAsync(n.id); avisar(`${n.nome} foi desconectado da API oficial.`); }
    catch (x) { avisar((x as Error)?.message || 'Não foi possível desconectar.', 'erro'); }
    setJanela(null);
  };
  return (
    <div className="pn cfgi">
      {aviso && <div className={`gs-aviso ${aviso.tom}`} role={aviso.tom === 'erro' ? 'alert' : 'status'}><span>{aviso.texto}</span><button type="button" className="gs-aviso-x" onClick={() => setAviso(null)} aria-label="Fechar">×</button></div>}
      {q.carregando ? <p className="pn-vazio">Consultando a conta na Meta…</p>
        : q.falhou ? <EstadoErro titulo="Não foi possível consultar o WhatsApp oficial" descricao="Houve uma falha na consulta. Tente de novo." aoTentarDeNovo={q.recarregar} />
        : conta.numeros.length === 0 ? <SemNumero facebook={conta.facebook} aoConectar={() => setJanela({ tipo: 'conectar' })} />
        : <ComNumero conta={conta} aoAvisar={avisar} aoAbrir={setJanela} />}
      {!q.carregando && !q.falhou && <Modelos conta={conta} aoAvisar={avisar} aoNovo={() => setJanela({ tipo: 'modelo' })} />}

      {janela?.tipo === 'conectar' && <JanelaConectar conta={conta} aoFechar={() => setJanela(null)} aoAvisar={avisar} />}
      {janela?.tipo === 'teste' && <JanelaTeste n={janela.n} conta={conta} aoFechar={() => setJanela(null)} aoAvisar={avisar} />}
      {janela?.tipo === 'modelo' && <JanelaModelo conta={conta} aoFechar={() => setJanela(null)} aoAvisar={avisar} />}
      <ConfirmDialogV2 aberto={janela?.tipo === 'desconectar'} titulo="Desconectar este número?" rotuloConfirmar="Desconectar" destrutivo carregando={desconectar.isPending}
        mensagem="O sistema para de enviar e de receber por este número. Ele continua existindo na sua conta da Meta, com os modelos, e pode ser conectado de novo."
        aoConfirmar={() => { if (janela?.tipo === 'desconectar') void sair(janela.n); }} aoCancelar={() => setJanela(null)} />
    </div>
  );
}

/* ---------------- nenhum número ainda ---------------- */
function SemNumero({ aoConectar, facebook }: { aoConectar: () => void; facebook: boolean }) {
  return (
    <div className="cfgi-duas">
      <CardVidro spot className="pn-card sobe">
        <div className="pn-card-cab"><div><h3>Conectar um número pela API oficial</h3><p>São três passos, na mesma janela.</p></div></div>
        <ol className="cfgw-passos">
          {facebook
            ? <li><b>Entrar com o Facebook</b> e escolher a empresa e o número, na janela da Meta.</li>
            : <li>Colar o <b>código de acesso da Meta</b>: o sistema acha os números da conta sozinho.</li>}
          <li>Dizer se o número trabalha para as <b>Cobranças</b> ou para o <b>Atendimento</b>.</li>
          <li>O sistema <b>confere tudo sozinho</b> e mostra o que ficou certo e o que falta.</li>
        </ol>
        <div className="cfgi-acoes"><BotaoPrimario onClick={aoConectar}>Conectar número</BotaoPrimario></div>
      </CardVidro>
      <CardVidro spot className="pn-card sobe" style={{ animationDelay: '.05s' }}>
        <div className="pn-card-cab"><div><h3>O que muda em relação ao QR Code</h3></div></div>
        <ul className="cfgi-lista">
          <li>O número não depende de celular ligado e não cai: a conexão é direto com a Meta.</li>
          <li>Depois de 24 horas sem o cliente responder, só sai <b>modelo de mensagem aprovado</b> pela Meta.</li>
          <li>A Meta <b>cobra por mensagem</b> enviada pelo sistema, em centavos. A tabela fica na sua conta da Meta.</li>
          <li>A Meta analisa a empresa e cada modelo, e pode bloquear o número de quem descumpre as regras dela.</li>
        </ul>
        <div className="cfgi-sep" />
        <div className="pn-card-cab"><div><h3>O que precisa estar pronto</h3></div></div>
        <ul className="cfgi-lista">
          <li>Uma conta da empresa na Meta (Gerenciador de Negócios), de preferência <b>verificada</b>.</li>
          <li>Uma <b>forma de pagamento</b> cadastrada nessa conta, para a Meta cobrar as mensagens.</li>
          <li>O número em mãos, para confirmar por SMS ou ligação durante o cadastro.</li>
        </ul>
      </CardVidro>
    </div>
  );
}

/* ---------------- números conectados ---------------- */
function ComNumero({ conta, aoAvisar, aoAbrir }: { conta: ContaOficial; aoAvisar: Avisar; aoAbrir: (j: Janela) => void }) {
  const testar = useTestarOficial();
  const conferir = async (n: NumeroOficial) => {
    try { await testar.mutateAsync(n.id); aoAvisar(`Conexão com a Meta funcionando · ${n.nome}.`); }
    catch (x) { aoAvisar((x as Error)?.message || 'A Meta não respondeu. Tente de novo.', 'erro'); }
  };
  return (
    <>
      <AcoesNoTopo><BotaoPrimario onClick={() => aoAbrir({ tipo: 'conectar' })}>＋ Conectar número</BotaoPrimario></AcoesNoTopo>
      {conta.empresa && !conta.empresa.verificada && <p className="cfgi-nota" role="note">A empresa ainda não está verificada na Meta: o limite é de {limiteTexto(conta.limiteDia)} por dia. A verificação é feita no Gerenciador de Negócios da Meta e sobe o limite para 2.000.</p>}
      {conta.pagamento === false && <p className="cfgi-nota" role="alert">Não há forma de pagamento cadastrada na sua conta da Meta. Sem ela, a Meta não entrega as mensagens de modelo.</p>}
      {conta.numeros.map((n, i) => (
        <CardVidro key={n.id} spot className="pn-card sobe" style={{ animationDelay: `${i * 0.04}s` }} data-numero={n.id}>
          <div className="cfgi-conta">
            <span className="cfgi-ic on"><IcOficial /></span>
            <div className="cfgi-conta-nm"><b>{n.nome}</b><span className="num">{fone(n.numero)} · {ROTULO_AMBIENTE[n.ambiente]}</span></div>
            {n.bloqueado ? <BadgeStatus tom="erro">Bloqueado pela Meta</BadgeStatus> : <BadgeStatus tom="ok">Conectado</BadgeStatus>}
          </div>
          <dl className="cfgw-ficha">
            <div><dt>Nome que o cliente vê</dt><dd>{n.nomeExibicao} · {ROTULO_NOME[n.nomeSituacao]}</dd></div>
            <div><dt>Qualidade do número</dt><dd>{ROTULO_QUALIDADE[n.qualidade]}</dd></div>
            <div><dt>Limite por dia, fora das 24 horas</dt><dd className="num">{limiteTexto(conta.limiteDia)}</dd></div>
            <div><dt>Recebimento das conversas</dt><dd>{n.recebimento ? 'Ativo' : 'Ainda não ligado: receber e responder entra na próxima etapa'}</dd></div>
            <div><dt>Onde o número funciona</dt><dd>{n.noCelular ? 'No sistema e no aplicativo do celular' : 'Só pelo sistema'}</dd></div>
            <div><dt>Conectado em</dt><dd className="num">{quando(n.conectadoEm)}{n.conectadoPor ? ` · por ${n.conectadoPor}` : ''}</dd></div>
          </dl>
          <div className="cfgi-acoes">
            <BotaoSec disabled={testar.isPending} onClick={() => void conferir(n)}>Testar conexão</BotaoSec>
            <BotaoSec onClick={() => aoAbrir({ tipo: 'teste', n })}>Enviar mensagem de teste</BotaoSec>
            <span className="cfgi-esp" />
            <button type="button" className="cfgi-link perigo" onClick={() => aoAbrir({ tipo: 'desconectar', n })}>Desconectar</button>
          </div>
        </CardVidro>
      ))}
    </>
  );
}

/* ---------------- modelos de mensagem ---------------- */
function Modelos({ conta, aoAvisar, aoNovo }: { conta: ContaOficial; aoAvisar: Avisar; aoNovo: () => void }) {
  const sync = useSincronizarModelos();
  const sincronizar = async () => {
    try { const r = await sync.mutateAsync(); const n = Number(r.mudaram) || 0; aoAvisar(n ? `Modelos atualizados: ${n} ${n === 1 ? 'mudou' : 'mudaram'} de situação na Meta.` : 'Modelos conferidos na Meta: nada mudou.'); }
    catch (x) { aoAvisar((x as Error)?.message || 'Não foi possível consultar os modelos.', 'erro'); }
  };
  if (!conta.numeros.length) return null;
  return (
    <CardVidro spot className="pn-card sobe" style={{ animationDelay: '.1s' }}>
      <div className="pn-card-cab">
        <div><h3>Modelos de mensagem</h3><p>Depois de 24 horas sem o cliente responder, o WhatsApp só entrega modelos aprovados pela Meta.</p></div>
        <div className="cfgi-acoes">
          <BotaoSec disabled={sync.isPending} onClick={() => void sincronizar()}>{sync.isPending ? 'Consultando…' : 'Atualizar situação'}</BotaoSec>
          <BotaoPrimario onClick={aoNovo}>Novo modelo</BotaoPrimario>
        </div>
      </div>
      {conta.modelos.length === 0 ? <p className="pn-vazio">Nenhum modelo ainda. Crie o primeiro para poder enviar fora das 24 horas.</p> : (
        <div className="pn-mapa-rolo">
          <table className="pn-eq pn-fin-tab pn-us-tab cfgo-tab">
            <thead><tr><th scope="col">Modelo</th><th scope="col">Tipo</th><th scope="col">Situação</th></tr></thead>
            <tbody>
              {conta.modelos.map((m) => (
                <tr key={m.id}>
                  <td><span className="cfgo-mod"><b>{m.nome}</b><span>{m.texto}</span>{m.motivo && <small>{m.motivo}</small>}</span></td>
                  <td><span className="pn-us-amb-tx">{CATEGORIAS.find((c) => c.id === m.categoria)?.rotulo}</span></td>
                  <td><BadgeStatus tom={TOM_MODELO[m.situacao]}>{ROTULO_SIT_MODELO[m.situacao]}</BadgeStatus></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </CardVidro>
  );
}

/* ---------------- conectar: entrar → número e ambiente → conferência ---------------- */
function JanelaConectar({ conta, aoFechar, aoAvisar }: { conta: ContaOficial; aoFechar: () => void; aoAvisar: Avisar }) {
  const entrar = useEntrarFacebook();
  const buscar = useBuscarNumeros();
  const conectar = useConectarOficial();
  const [fase, setFase] = useState<'entrar' | 'numero' | 'pronto'>('entrar');
  const [noCelular, setNoCelular] = useState(false);
  const [comToken, setComToken] = useState(!conta.facebook);
  const [token, setToken] = useState('');
  const [waba, setWaba] = useState('');
  const [pedeWaba, setPedeWaba] = useState(false);
  const [achados, setAchados] = useState<Achados | null>(null);
  const [escolhido, setEscolhido] = useState('');
  const [ambiente, setAmbiente] = useState<Ambiente | null>(null);
  const [nome, setNome] = useState('');
  const [conferencia, setConferencia] = useState<PassoConferencia[]>([]);
  const [erro, setErro] = useState('');
  const ocupado = entrar.isPending || buscar.isPending || conectar.isPending;

  const receber = (a: Achados) => {
    const livres = a.numeros.filter((n) => !n.jaConectado);
    if (!livres.length) { setErro(a.numeros.length ? 'Os números desta conta já estão conectados ao sistema.' : 'Esta conta da Meta ainda não tem número de WhatsApp.'); return; }
    setAchados(a); setEscolhido(livres[0].phoneNumberId); setNome(livres[0].nomeExibicao); setFase('numero');
  };
  const peloFacebook = async () => {
    setErro('');
    try { receber(await entrar.mutateAsync({ noCelular })); } catch (x) { setErro((x as Error)?.message || 'A janela da Meta não concluiu. Tente de novo.'); }
  };
  const peloToken = async () => {
    if (noCelular) { setErro('Para continuar usando o número no celular, a conexão precisa ser pela entrada com o Facebook.'); return; }
    const e = tokenInvalido(token); if (e) { setErro(e); return; }
    setErro('');
    try { receber(await buscar.mutateAsync({ token, wabaId: pedeWaba ? waba : undefined })); }
    catch (x) { const m = (x as Error)?.message || 'Não foi possível conferir o código. Tente de novo.'; if (/de qual conta do WhatsApp/.test(m)) setPedeWaba(true); setErro(m); }
  };
  const finalizar = async () => {
    if (!achados || !escolhido) return;
    if (!ambiente) { setErro('Escolha para qual ambiente este número trabalha.'); return; }
    if (!nome.trim()) { setErro('Dê um nome a este número.'); return; }
    setErro('');
    try { setConferencia(lerConferencia(await conectar.mutateAsync({ sessao: achados.sessao, phoneNumberId: escolhido, ambiente, nome, noCelular }))); setFase('pronto'); }
    catch (x) { setErro((x as Error)?.message || 'Não foi possível conectar o número. Tente de novo.'); }
  };
  const fechar = () => { if (ocupado) return; if (fase === 'pronto') aoAvisar(`${nome.trim() || 'Número'} conectado pela API oficial em ${ROTULO_AMBIENTE[ambiente ?? 'cobrancas']}.`); aoFechar(); };
  const faltas = conferencia.filter((p) => !p.ok).length;

  return (
    <ModalV2 aberto aoFechar={fechar} largura={560} fecharNoVeu={!ocupado && fase !== 'numero'}
      titulo={<div>{fase === 'pronto' ? 'Número conectado' : 'Conectar pela API oficial'}<div className="mod-sub">{fase === 'entrar' ? 'Passo 1 de 3 · Entrar na conta da Meta' : fase === 'numero' ? `Passo 2 de 3 · ${achados?.empresa ?? 'Número e ambiente'}` : faltas ? `Passo 3 de 3 · Conectado, com ${faltas} ${faltas === 1 ? 'ponto' : 'pontos'} para resolver` : 'Passo 3 de 3 · Tudo certo'}</div></div>}
      rodape={fase === 'entrar'
        ? <BotaoSec disabled={ocupado} onClick={fechar}>Cancelar</BotaoSec>
        : fase === 'numero'
          ? <><BotaoSec disabled={ocupado} onClick={() => { setFase('entrar'); setErro(''); }}>Voltar</BotaoSec><BotaoPrimario disabled={ocupado} onClick={() => void finalizar()}>{conectar.isPending ? 'Conectando e conferindo…' : 'Conectar número'}</BotaoPrimario></>
          : <BotaoPrimario onClick={fechar}>Concluir</BotaoPrimario>}>
      {fase === 'entrar' && (
        <div className="pn-us-form">
          {!conta.facebook && <p className="cfgi-nota" role="note">A entrada pelo Facebook ainda depende de a Meta aprovar o aplicativo deste sistema. Até lá, a conexão é pelo código de acesso, e o número funciona só pelo sistema.</p>}
          {conta.facebook && <div className="pn-us-campo">
            <span className="pn-us-rot">Onde este número vai funcionar?</span>
            <div className="pn-us-opcoes" role="radiogroup" aria-label="Onde o número vai funcionar">
              <button type="button" role="radio" aria-checked={!noCelular} className={!noCelular ? 'on' : undefined} onClick={() => { setNoCelular(false); setErro(''); }}>
                <b>Só pelo sistema</b><span>O número sai do aplicativo do celular e passa a enviar e receber só por aqui.</span>
              </button>
              <button type="button" role="radio" aria-checked={noCelular} className={noCelular ? 'on' : undefined} onClick={() => { setNoCelular(true); setComToken(false); setErro(''); }}>
                <b>No sistema e no celular</b><span>Continua no aplicativo WhatsApp Business do celular e também funciona aqui.</span>
              </button>
            </div>
          </div>}
          {!comToken ? (
            <div className="pn-us-campo">
              <BotaoPrimario disabled={ocupado} onClick={() => void peloFacebook()}>{entrar.isPending ? 'Aguardando a janela da Meta…' : 'Entrar com o Facebook'}</BotaoPrimario>
              <span className="pn-us-dica">Abre a janela da Meta. Você escolhe a empresa e o número, e o sistema faz o resto.{isPrevia ? ' Na prévia a janela não abre: o sistema simula a escolha de um número de demonstração.' : ''}</span>
              {!noCelular && <button type="button" className="cfgi-link" onClick={() => { setComToken(true); setErro(''); }}>Prefiro usar um código de acesso da Meta</button>}
            </div>
          ) : (
            <div className="pn-us-campo">
              <label htmlFor="of-token">Código de acesso da Meta</label>
              <div className="pn-us-senha-in">
                <input id="of-token" className="inp" type="password" value={token} placeholder="EAA…" autoComplete="off" spellCheck={false} data-1p-ignore onChange={(e) => { setToken(e.target.value); setErro(''); }} />
                <BotaoPrimario disabled={ocupado} onClick={() => void peloToken()}>{buscar.isPending ? 'Conferindo…' : 'Buscar os números'}</BotaoPrimario>
              </div>
              <span className="pn-us-dica">É o código permanente de um usuário do sistema, gerado no Gerenciador de Negócios da Meta com as permissões do WhatsApp. Ele fica guardado só no servidor.</span>
              {pedeWaba && (<>
                <label htmlFor="of-waba">Número da conta do WhatsApp na Meta</label>
                <input id="of-waba" className="inp" inputMode="numeric" value={waba} placeholder="só números" onChange={(e) => { setWaba(e.target.value.replace(/\D/g, '')); setErro(''); }} />
                <span className="pn-us-dica">Aparece no Gerenciador do WhatsApp como "Identificação da conta do WhatsApp Business".</span>
              </>)}
              <span className="cfgo-linha-links">
                {isPrevia && <button type="button" className="cfgi-link" onClick={() => { setToken('EAAexemplo-da-previa-0000000000000000000000000000000000'); setErro(''); }}>Usar um código de exemplo</button>}
                {conta.facebook && <button type="button" className="cfgi-link" onClick={() => { setComToken(false); setErro(''); }}>Voltar para a entrada com o Facebook</button>}
              </span>
            </div>
          )}
          {erro && <span className="pn-us-erro" role="alert">{erro}</span>}
        </div>
      )}
      {fase === 'numero' && achados && (
        <div className="pn-us-form">
          <div className="pn-us-campo">
            <span className="pn-us-rot">{achados.numeros.length === 1 ? 'Número escolhido' : 'Qual número conectar?'}</span>
            <div className="cfgo-numeros" role="radiogroup" aria-label="Número a conectar">
              {achados.numeros.map((n) => (
                <button key={n.phoneNumberId} type="button" role="radio" aria-checked={escolhido === n.phoneNumberId} disabled={n.jaConectado}
                  className={escolhido === n.phoneNumberId ? 'on' : undefined} onClick={() => { setEscolhido(n.phoneNumberId); setNome(n.nomeExibicao); setErro(''); }}>
                  <b className="num">{fone(n.numero)}</b>
                  <span>{n.jaConectado ? 'Já conectado ao sistema' : `${n.nomeExibicao} · ${NOME_NA_LISTA[n.nomeSituacao]}`}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="pn-us-campo">
            <span className="pn-us-rot">Para qual ambiente é este número?</span>
            <div className="pn-us-opcoes" role="radiogroup" aria-label="Ambiente do número">
              {(['cobrancas', 'atendimento'] as const).map((a) => (
                <button key={a} type="button" role="radio" aria-checked={ambiente === a} className={ambiente === a ? 'on' : undefined} onClick={() => { setAmbiente(a); setErro(''); }}>
                  <b>{ROTULO_AMBIENTE[a]}</b><span>{DESC_AMBIENTE[a]}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="pn-us-campo">
            <label htmlFor="of-nome">Nome do número no sistema</label>
            <input id="of-nome" className="inp" value={nome} maxLength={40} onChange={(e) => { setNome(e.target.value); setErro(''); }} />
            <span className="pn-us-dica">É como a equipe vai reconhecer este número. O cliente continua vendo o nome aprovado pela Meta.</span>
          </div>
          {erro && <span className="pn-us-erro" role="alert">{erro}</span>}
        </div>
      )}
      {fase === 'pronto' && (
        <ul className="cfgo-conf">
          {conferencia.map((p) => (
            <li key={p.rotulo} className={p.ok ? 'ok' : 'falta'}>
              <i aria-hidden>{p.ok ? <IcCerto /> : <IcAtencao />}</i>
              <span><b>{p.rotulo}</b>{p.nota && <small>{p.nota}</small>}</span>
            </li>
          ))}
        </ul>
      )}
    </ModalV2>
  );
}

/* ---------------- mensagem de teste ---------------- */
function JanelaTeste({ n, conta, aoFechar, aoAvisar }: { n: NumeroOficial; conta: ContaOficial; aoFechar: () => void; aoAvisar: Avisar }) {
  const enviar = useEnviarTesteOficial();
  const aprovados = conta.modelos.filter((m) => m.situacao === 'aprovado');
  const [para, setPara] = useState('');
  const [modelo, setModelo] = useState(aprovados[0]?.nome ?? '');
  const [erro, setErro] = useState('');
  const mandar = async () => {
    const d = para.replace(/\D/g, '');
    if (d.length < 10) { setErro('Digite o número com DDD.'); return; }
    if (!modelo) { setErro('Não há modelo aprovado para enviar. Crie um e espere a aprovação da Meta.'); return; }
    try { await enviar.mutateAsync({ id: n.id, para: d.length <= 11 ? `55${d}` : d, modelo }); aoAvisar(`Mensagem de teste enviada para ${fone(d.length <= 11 ? `55${d}` : d)}${isPrevia ? ' (na prévia nada é enviado de verdade)' : ''}.`); aoFechar(); }
    catch (x) { setErro((x as Error)?.message || 'A Meta recusou o envio. Tente de novo.'); }
  };
  return (
    <ModalV2 aberto aoFechar={() => { if (!enviar.isPending) aoFechar(); }} largura={460}
      titulo={<div>Enviar mensagem de teste<div className="mod-sub">{n.nome} · {fone(n.numero)}</div></div>}
      rodape={<><BotaoSec disabled={enviar.isPending} onClick={aoFechar}>Cancelar</BotaoSec><BotaoPrimario disabled={enviar.isPending} onClick={() => void mandar()}>{enviar.isPending ? 'Enviando…' : 'Enviar teste'}</BotaoPrimario></>}>
      <div className="pn-us-form">
        <div className="pn-us-campo">
          <label htmlFor="of-para">Enviar para</label>
          <input id="of-para" className="inp" inputMode="tel" value={para} placeholder="(51) 99999-0000" onChange={(e) => { setPara(e.target.value); setErro(''); }} />
          <span className="pn-us-dica">Use um número seu. O teste é uma mensagem de modelo de verdade, cobrada pela Meta.</span>
        </div>
        <div className="pn-us-campo">
          <label htmlFor="of-modelo">Modelo</label>
          <select id="of-modelo" className="inp" value={modelo} onChange={(e) => setModelo(e.target.value)}>
            {aprovados.length === 0 && <option value="">Nenhum modelo aprovado</option>}
            {aprovados.map((m) => <option key={m.id} value={m.nome}>{m.nome}</option>)}
          </select>
          <span className="pn-us-dica">As variáveis saem preenchidas com dados de exemplo.</span>
        </div>
        {erro && <span className="pn-us-erro" role="alert">{erro}</span>}
      </div>
    </ModalV2>
  );
}

/* ---------------- novo modelo de mensagem ---------------- */
function JanelaModelo({ conta, aoFechar, aoAvisar }: { conta: ContaOficial; aoFechar: () => void; aoAvisar: Avisar }) {
  const criar = useCriarModelo();
  const [nome, setNome] = useState('');
  const [categoria, setCategoria] = useState<CategoriaModelo>('utilidade');
  const [texto, setTexto] = useState('');
  const [erro, setErro] = useState('');
  const area = useRef<HTMLTextAreaElement>(null);
  const inserir = (v: string) => {
    const el = area.current; const ini = el?.selectionStart ?? texto.length; const fim = el?.selectionEnd ?? texto.length;
    setTexto(texto.slice(0, ini) + `{${v}}` + texto.slice(fim)); setErro('');
    requestAnimationFrame(() => { el?.focus(); const p = ini + v.length + 2; el?.setSelectionRange(p, p); });
  };
  const mandar = async () => {
    const e = modeloInvalido(nome, texto, conta.modelos); if (e) { setErro(e); return; }
    try { await criar.mutateAsync({ nome, categoria, texto }); aoAvisar(`Modelo ${nomeTecnico(nome)} enviado para a aprovação da Meta. Ele aparece como "Em análise" até a resposta.`); aoFechar(); }
    catch (x) { setErro((x as Error)?.message || 'A Meta não aceitou o modelo. Tente de novo.'); }
  };
  return (
    <ModalV2 aberto aoFechar={() => { if (!criar.isPending) aoFechar(); }} largura={600} fecharNoVeu={false}
      titulo={<div>Novo modelo de mensagem<div className="mod-sub">A Meta analisa o texto antes de liberar o envio</div></div>}
      rodape={<><BotaoSec disabled={criar.isPending} onClick={aoFechar}>Cancelar</BotaoSec><BotaoPrimario disabled={criar.isPending} onClick={() => void mandar()}>{criar.isPending ? 'Enviando…' : 'Enviar para aprovação'}</BotaoPrimario></>}>
      <div className="pn-us-form">
        <div className="pn-us-campo">
          <label htmlFor="of-mod-nome">Nome do modelo</label>
          <input id="of-mod-nome" className="inp" value={nome} placeholder="ex.: Lembrete da parcela" maxLength={60} onChange={(e) => { setNome(e.target.value); setErro(''); }} />
          {nomeTecnico(nome) && <span className="pn-us-dica">Na Meta ele fica como <b className="num">{nomeTecnico(nome)}</b>. O cliente não vê esse nome.</span>}
        </div>
        <div className="pn-us-campo">
          <span className="pn-us-rot">Tipo de mensagem</span>
          <div className="pn-us-opcoes" role="radiogroup" aria-label="Tipo de mensagem">
            {CATEGORIAS.map((c) => (
              <button key={c.id} type="button" role="radio" aria-checked={categoria === c.id} className={categoria === c.id ? 'on' : undefined} onClick={() => setCategoria(c.id)}>
                <b>{c.rotulo}</b><span>{c.dica}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="pn-us-campo">
          <label htmlFor="of-mod-texto">Texto da mensagem</label>
          <textarea id="of-mod-texto" ref={area} className="inp cfgo-texto" rows={5} value={texto} maxLength={1024} onChange={(e) => { setTexto(e.target.value); setErro(''); }} />
          <span className="cfgo-vars" role="group" aria-label="Inserir variável">
            <small>Inserir:</small>
            {VARIAVEIS_MODELO.map((v) => <button key={v} type="button" onClick={() => inserir(v)}>{`{${v}}`}</button>)}
          </span>
          <span className="pn-us-dica">O sistema troca cada variável pelo dado do cliente na hora do envio. Não comece nem termine o texto com uma variável.</span>
        </div>
        {erro && <span className="pn-us-erro" role="alert">{erro}</span>}
      </div>
    </ModalV2>
  );
}
