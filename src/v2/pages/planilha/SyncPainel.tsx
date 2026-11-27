/* =====================================================================
   Gestão de cobranças — painel da SINCRONIZAÇÃO com a planilha do Google
   (depois de configurada na Etapa 1 do assistente).

   · SeloSync            — "Sincronizada com a planilha · há N min" no topo
                           da Gestão (todos os papéis);
   · BotaoSincronizacao  — abre o painel (admin, gestor, cadastro, financeiro);
   · SyncPainel          — cabeçalho de estado (diz o estado UMA vez, com as
                           ações), resolução da pausa/erro (freio com "Aplicar
                           mesmo assim", erro, conferência pendente), fatos
                           (planilha, conta, última rodada), histórico de
                           rodadas e conflitos, Trocar planilha, Trocar chave.

   Os três NÃO renderizam nada enquanto a camada de dados não disser que há
   sincronização configurada (syncVisivel) — em produção, hoje, o backend
   não existe e nada aparece. Peças de formulário/teste/conferência vêm da
   EtapaPlanilha (uma lógica só). Confirmações inline (padrão do assistente).
   ===================================================================== */
import { useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { BotaoPrimario, BotaoSec } from '../../components/Botao';
import { ModalV2 } from '../../components/ModalV2';
import { Segmentado } from '../../components/Segmentado';
import {
  aplicarFreio, dataHoraBR, fmtInt, haQuanto, horaBR, ligarAutomatico, podeGerirSync, saudeSync, sincronizarAgora,
  syncVisivel, useAcaoSync, useSyncPlanilha,
  type ConflitoSync, type EstadoSync, type OrigemRodada, type ResultadoRodada, type RodadaSync, type SaudeSync,
} from '../../data/cobranca/planilhaSync';
import type { Papel } from '../../data/cobranca/types';
import {
  BotaoCopiar, CampoLinkPlanilha, ConferenciaMudancas, EnvioChave, Ic, LinhaStatus, ResumoMudancas, TesteConexao, TrilhaMenu,
  frasePlanoAplicar, type IconeSync,
} from '../configuracao/EtapaPlanilha';
import { FigChaveJson, FigCompartilhar, FigLinkPlanilha } from '../configuracao/figuras/figurasGoogle';
import { FigSincronia } from '../configuracao/figuras/figurasSistema';
import './sync-painel.css';

/** relógio que anda (o "há N min" envelhece sozinho) */
function useAgora(ms = 30_000): Date {
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setAgora(new Date()), ms);
    return () => window.clearInterval(t);
  }, [ms]);
  return agora;
}

type Tom = 'ok' | 'at' | 'er' | 'ne';
const TOM_SAUDE: Record<SaudeSync, Tom> = {
  ok: 'ok', desligada: 'ne', erro: 'er', freio: 'at', conferir: 'at', testar: 'at', pendente: 'ne',
};

function textoSelo(e: EstadoSync, agora: Date): string {
  const s = saudeSync(e);
  const ha = e.ultimaRodada ? ` · ${haQuanto(e.ultimaRodada.quando, agora)}` : '';
  switch (s) {
    case 'ok': return `Sincronizada com a planilha${ha}`;
    case 'erro': return `Sincronização com erro${ha}`;
    case 'freio': return 'Sincronização pausada · conferência pendente';
    case 'conferir': return 'Sincronização pausada · planilha nova a conferir';
    case 'testar': return 'Sincronização pausada · teste a conexão';
    case 'desligada': return 'Sincronização desligada';
    case 'pendente': return 'Sincronização não configurada';
  }
}

function dicaSelo(e: EstadoSync): string {
  const partes: string[] = [];
  if (e.ultimaRodada) partes.push(`Última rodada: ${dataHoraBR(e.ultimaRodada.quando)}`);
  if (e.automatico && e.proximaRodada) partes.push(`próxima às ${horaBR(e.proximaRodada)}`);
  partes.push(`a cada ${e.intervaloMin} min, nos dois sentidos`);
  return partes.join(' · ');
}

/** selo de estado no topo da Gestão (todos os papéis) — nada quando não há sincronização */
export function SeloSync() {
  const { estado } = useSyncPlanilha();
  const agora = useAgora();
  if (!estado || !syncVisivel(estado)) return null;
  const tom = TOM_SAUDE[saudeSync(estado)];
  return (
    <span className={`psy-selo psy-selo-${tom}`} role="status" title={dicaSelo(estado)}>
      <i className="psy-selo-dot" aria-hidden />
      <span className="psy-selo-tx num">{textoSelo(estado, agora)}</span>
    </span>
  );
}

/** botão "Sincronização" da barra da Gestão + o painel em modal (admin, gestor, cadastro, financeiro) */
export function BotaoSincronizacao({ papel, gestor }: { papel?: Papel; gestor: boolean }) {
  const { estado } = useSyncPlanilha();
  const [aberto, setAberto] = useState(false);
  if (!estado || !syncVisivel(estado) || !podeGerirSync(papel, gestor)) return null;
  const tom = TOM_SAUDE[saudeSync(estado)];
  const atencao = tom === 'er' || tom === 'at';
  return (
    <>
      <BotaoSec mini onClick={() => setAberto(true)} aria-haspopup="dialog"
        title="Estado da sincronização com a planilha do Google, histórico e ajustes">
        <Ic n="sync" s={13} />Sincronização
        {atencao && <span className={`psy-pino psy-pino-${tom}`} aria-hidden />}
        {atencao && <span className="cpl-vh"> (requer atenção)</span>}
      </BotaoSec>
      <ModalV2 aberto={aberto} aoFechar={() => setAberto(false)} largura={760}
        titulo={<>Sincronização com a planilha<div className="mod-sub">A cada {estado.intervaloMin} minutos, nos dois sentidos · em conflito, vale a planilha</div></>}
        rodape={<BotaoSec onClick={() => setAberto(false)}>Fechar</BotaoSec>}>
        <SyncPainel />
      </ModalV2>
    </>
  );
}

/* ================= o painel ================= */

const ORIGEM: Record<OrigemRodada, string> = { automatica: 'Automática', manual: 'Manual', na_hora: 'Na hora', primeira: 'Primeira sincronização' };
const RESULTADO: Record<ResultadoRodada, { rot: string; tom: Tom }> = {
  ok: { rot: 'Concluída', tom: 'ok' },
  sem_mudancas: { rot: 'Sem mudanças', tom: 'ne' },
  erro: { rot: 'Erro', tom: 'er' },
  freio: { rot: 'Pausada', tom: 'at' },
};
const TITULO_SAUDE: Record<SaudeSync, string> = {
  ok: 'Sincronização ligada',
  desligada: 'Sincronização desligada',
  erro: 'Sincronização com erro',
  freio: 'Pausada: conferência pendente',
  conferir: 'Pausada: planilha nova a conferir',
  testar: 'Pausada: teste a conexão',
  pendente: 'Sincronização não configurada',
};
const ICONE_TOM: Record<Tom, IconeSync> = { ok: 'check', at: 'alerta', er: 'x', ne: 'pausa' };

/** ponto de estado (6px) + texto: substitui as pílulas em listas e histórico */
function Resultado({ tom, children }: { tom: Tom; children: string }) {
  return <span className={`psy-res psy-res-${tom}`}>{children}</span>;
}

function LinhaRodada({ r }: { r: RodadaSync }) {
  const res = RESULTADO[r.resultado];
  return (
    <li className="psy-rod">
      <span className="psy-rod-quando num">{dataHoraBR(r.quando)}</span>
      <span className="psy-rod-meio">
        <span className="psy-rod-origem">{ORIGEM[r.origem]}</span>
        {r.mensagem && <span className="psy-rod-msg">{r.mensagem}</span>}
      </span>
      {/* sem números (sem mudanças · erro · pausa): no estreito a linha vazia/"—" some */}
      <span className={'psy-rod-conta num' + (r.resultado === 'ok' ? '' : ' psy-rod-conta-vazia')}>
        {r.resultado === 'ok'
          ? <>{fmtInt(r.daPlanilha)} da planilha · {fmtInt(r.paraPlanilha)} para a planilha</>
          : r.resultado === 'sem_mudancas' ? '—' : ''}
      </span>
      <Resultado tom={res.tom}>{res.rot}</Resultado>
    </li>
  );
}

function LinhaConflito({ c }: { c: ConflitoSync }) {
  return (
    <li className="psy-conf">
      <div className="psy-conf-cab">
        <span className="psy-conf-cli">{c.cliente}</span>
        <span className="psy-conf-quando num">{dataHoraBR(c.quando)}</span>
      </div>
      <div className="psy-conf-corpo">
        <span className="psy-conf-campo">{c.campo}</span>
        <span className="psy-conf-val"><span className="psy-conf-rot">Planilha</span><b className="num">{c.valorPlanilha}</b></span>
        <span className="psy-conf-val psy-conf-perdeu"><span className="psy-conf-rot">Sistema</span><s className="num">{c.valorSistema}</s></span>
        <span className="psy-conf-nota">Prevaleceu a planilha</span>
      </div>
    </li>
  );
}

/** resolução do freio: o motivo, o resumo e "Aplicar mesmo assim" (confirmação inline, com fio) */
function BlocoFreio({ estado }: { estado: EstadoSync }) {
  const acao = useAcaoSync(aplicarFreio);
  const [confirmando, setConfirmando] = useState(false);
  const simRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (confirmando) simRef.current?.focus(); }, [confirmando]);
  const f = estado.freio;
  if (!f) return null;
  return (
    <>
      <p className="psy-resolve-tx">{f.motivo}</p>
      <ResumoMudancas grupos={f.grupos} />
      <p className="psy-resolve-nota">Se foi engano, corrija a planilha: a próxima rodada confere de novo e o freio sai sozinho.</p>
      {confirmando ? (
        <div className="cpl-confirma psy-confirma" role="group" aria-label="Confirmar a aplicação da rodada pausada">
          <p className="cpl-confirma-tit">Aplicar mesmo assim?</p>
          <p className="cpl-confirma-tx"><b>{frasePlanoAplicar(f.grupos)}</b>. Quem sai da cobrança mantém o histórico.</p>
          <div className="cpl-acoes">
            <BotaoSec onClick={() => setConfirmando(false)} disabled={acao.pendente}>Voltar</BotaoSec>
            <button ref={simRef} type="button" className="p-btn btn-pri" onClick={() => { void acao.executar(); }}
              disabled={acao.pendente} aria-busy={acao.pendente || undefined}>
              {acao.pendente ? <><span className="cpl-giro" aria-hidden />Aplicando…</> : 'Sim, aplicar'}
            </button>
          </div>
        </div>
      ) : (
        <div className="cpl-acoes"><BotaoSec onClick={() => setConfirmando(true)}>Aplicar mesmo assim</BotaoSec></div>
      )}
      {acao.erro && <p className="cpl-erro" role="alert"><Ic n="alerta" s={13} />{acao.erro}</p>}
    </>
  );
}

/** figura de demonstração pequena, com legenda (painel e vistas de troca) */
function DemoFig({ Fig, legenda }: { Fig: ComponentType; legenda: string }) {
  return (
    <figure className="psy-demo">
      <Fig />
      <figcaption className="psy-demo-leg">{legenda}</figcaption>
    </figure>
  );
}

/** resolução do erro: a mensagem + como corrigir (com a demonstração) + testar a conexão */
function BlocoErro({ estado }: { estado: EstadoSync }) {
  const r = estado.ultimaRodada;
  return (
    <>
      {r?.mensagem && <p className="psy-resolve-tx">{r.mensagem}</p>}
      <p className="psy-resolve-nota">
        Compartilhe a planilha de novo com a conta do sistema como Editor, teste a conexão e sincronize.
      </p>
      <DemoFig Fig={FigCompartilhar} legenda="Como aparece a janela Compartilhar da planilha" />
      <TesteConexao estado={estado} mostrarAnterior={false} />
    </>
  );
}

/** resolução da pausa por troca de planilha (testar + conferir) ou de chave (testar) */
function BlocoPausa({ estado, conferir }: { estado: EstadoSync; conferir: boolean }) {
  return (
    <ol className="psy-pausa-passos" role="list">
      <li>
        <span className="psy-pausa-n num" aria-hidden>1</span>
        <div className="psy-pausa-corpo">
          <span className="psy-pausa-tit">Testar a conexão</span>
          <TesteConexao estado={estado} />
        </div>
      </li>
      {conferir && (
        <li>
          <span className="psy-pausa-n num" aria-hidden>2</span>
          <div className="psy-pausa-corpo">
            <span className="psy-pausa-tit">Conferir e aplicar as mudanças</span>
            <ConferenciaMudancas estado={estado} liberado={!!estado.teste?.ok} />
          </div>
        </li>
      )}
    </ol>
  );
}

type Vista = 'painel' | 'trocar-planilha' | 'trocar-chave';

/** o painel (corpo do modal da Gestão) */
export function SyncPainel() {
  const { estado } = useSyncPlanilha();
  const agora = useAgora();
  const [vista, setVista] = useState<Vista>('painel');
  const [lista, setLista] = useState<'rodadas' | 'conflitos'>('rodadas');
  const agoraSync = useAcaoSync(sincronizarAgora);
  const auto = useAcaoSync(ligarAutomatico);
  /** id da rodada que o "Sincronizar agora" DESTA tela gerou (só ela ganha a confirmação) */
  const [rodadaAgora, setRodadaAgora] = useState<string | null>(null);

  /* foco: o botão clicado some ao trocar de vista (ou ao resolver uma pausa) — sem isto o
     foco cai no body e o teclado se perde dentro do modal */
  const raizRef = useRef<HTMLDivElement>(null);
  const estadoRef = useRef<HTMLElement>(null);
  const vistaAnterior = useRef<Vista>('painel');
  useEffect(() => {
    const raiz = raizRef.current;
    const de = vistaAnterior.current;
    vistaAnterior.current = vista;
    if (!raiz || de === vista) return;
    const alvo = vista === 'painel'
      ? raiz.querySelector<HTMLElement>(`[data-psy-volta="${de}"]`)
      : raiz.querySelector<HTMLElement>('input:not([type="file"]), .cpl-drop');
    alvo?.focus();
  }, [vista]);
  const saude = estado ? saudeSync(estado) : null;
  const pausaAnterior = useRef(false);
  useEffect(() => {
    const pausadaAgora = saude === 'freio' || saude === 'conferir' || saude === 'testar';
    const saiu = pausaAnterior.current && !pausadaAgora;
    pausaAnterior.current = pausadaAgora;
    if (saiu && !raizRef.current?.contains(document.activeElement)) estadoRef.current?.focus();
  }, [saude]);

  if (!estado || !syncVisivel(estado)) {
    return (
      <div className="psy-vazio psy-vazio-painel">
        <div className="psy-fig" aria-hidden><FigSincronia /></div>
        <p>A sincronização com a planilha não está configurada.</p>
      </div>
    );
  }
  const s = saudeSync(estado);
  const tom = TOM_SAUDE[s];
  const pausada = s === 'freio' || s === 'conferir' || s === 'testar';

  if (vista === 'trocar-planilha') {
    return (
      <div className="psy-raiz psy-troca" ref={raizRef}>
        <button type="button" className="psy-voltar" onClick={() => setVista('painel')}><Ic n="chevron" s={14} className="psy-voltar-ic" />Voltar ao painel</button>
        <div className="psy-sec-cab">
          <h4 className="psy-sec-tit">Trocar a planilha</h4>
          <p className="psy-tx">Cole o link da planilha nova. A sincronização pausa até você testar a conexão e conferir as mudanças — nada é gravado antes disso.</p>
        </div>
        <CampoLinkPlanilha previa={estado.modo === 'previa'} rotuloBotao="Trocar planilha" aoCancelar={() => setVista('painel')} aoSalvo={() => setVista('painel')} />
        <DemoFig Fig={FigLinkPlanilha} legenda="Onde fica o link, na barra de endereço da planilha" />
      </div>
    );
  }
  if (vista === 'trocar-chave') {
    return (
      <div className="psy-raiz psy-troca" ref={raizRef}>
        <button type="button" className="psy-voltar" onClick={() => setVista('painel')}><Ic n="chevron" s={14} className="psy-voltar-ic" />Voltar ao painel</button>
        <div className="psy-sec-cab">
          <h4 className="psy-sec-tit">Trocar a chave</h4>
          <p className="psy-tx">Envie o .json de uma chave nova da conta de serviço. A chave atual é substituída e a sincronização pausa até o teste da conexão.</p>
          <TrilhaMenu itens={['Chaves', 'Adicionar chave', 'Criar nova chave', 'JSON']} />
        </div>
        <EnvioChave previa={estado.modo === 'previa'} aoCancelar={() => setVista('painel')} aoEnviada={() => setVista('painel')} />
        <DemoFig Fig={FigChaveJson} legenda="Como aparece a criação da chave, na conta de serviço do Google Cloud" />
      </div>
    );
  }

  const r = estado.ultimaRodada;
  const rodarAgora = async () => {
    const e = await agoraSync.executar();
    setRodadaAgora(e?.ultimaRodada?.id ?? null);
  };

  /* o estado é dito UMA vez: título + uma frase com o "quando" (os blocos abaixo não repetem) */
  let sub: ReactNode = null;
  if (s === 'ok' && estado.proximaRodada) sub = <>Próxima rodada às <span className="num">{horaBR(estado.proximaRodada)}</span></>;
  else if (s === 'desligada') sub = 'A planilha e o sistema não trocam dados até você ligar de novo.';
  else if (s === 'erro' && r) sub = `A última rodada falhou ${haQuanto(r.quando, agora)} · ${horaBR(r.quando)}. As rodadas seguem tentando a cada ${estado.intervaloMin} minutos.`;
  else if (s === 'freio' && estado.freio) sub = `Pausada pelo freio de segurança às ${horaBR(estado.freio.detectadoEm)}. As rodadas automáticas esperam a sua decisão.`;
  else if (s === 'conferir') sub = 'Planilha trocada: confira antes de voltar a sincronizar.';
  else if (s === 'testar') sub = 'Chave trocada: teste a conexão para voltar a sincronizar.';

  const resolve = s === 'freio' && estado.freio ? <BlocoFreio estado={estado} />
    : s === 'erro' && r?.resultado === 'erro' ? <BlocoErro estado={estado} />
      : s === 'conferir' || s === 'testar' ? <BlocoPausa estado={estado} conferir={s === 'conferir'} />
        : null;

  /* um primário ativo por vez: com erro, quem lidera é o "Testar conexão" da resolução */
  const rotuloAgora = agoraSync.pendente ? <><span className="cpl-giro" aria-hidden />Sincronizando…</> : <><Ic n="sync" s={14} />Sincronizar agora</>;
  const dicaAgora = 'Roda uma sincronização agora, fora do relógio';

  return (
    <div className="psy-raiz" ref={raizRef}>
      {/* cabeçalho de estado */}
      <header ref={estadoRef} tabIndex={-1} className={`psy-estado psy-estado-${tom}`}>
        <span className="psy-tile" aria-hidden><Ic n={ICONE_TOM[tom]} s={20} /></span>
        <div className="psy-estado-tx">
          <h3 id="psy-estado-tit" className="psy-estado-tit">{TITULO_SAUDE[s]}</h3>
          {sub && <p className="psy-estado-sub">{sub}</p>}
        </div>
        <div className="psy-estado-acoes">
          {pausada ? (
            <BotaoSec disabled title="Resolva a pausa abaixo antes de sincronizar"><Ic n="sync" s={14} />Sincronizar agora</BotaoSec>
          ) : s === 'erro' ? (
            <BotaoSec onClick={() => { void rodarAgora(); }} disabled={agoraSync.pendente} aria-busy={agoraSync.pendente || undefined} title={dicaAgora}>
              {rotuloAgora}
            </BotaoSec>
          ) : (
            <BotaoPrimario onClick={() => { void rodarAgora(); }} disabled={agoraSync.pendente} aria-busy={agoraSync.pendente || undefined} title={dicaAgora}>
              {rotuloAgora}
            </BotaoPrimario>
          )}
          {estado.automatico ? (
            <BotaoSec onClick={() => { void auto.executar(false); }} disabled={auto.pendente}>
              {auto.pendente ? 'Desligando…' : 'Desligar o automático'}
            </BotaoSec>
          ) : (
            <BotaoSec onClick={() => { void auto.executar(true); }} disabled={auto.pendente || pausada}>
              {auto.pendente ? 'Ligando…' : `Ligar o automático (a cada ${estado.intervaloMin} min)`}
            </BotaoSec>
          )}
        </div>
      </header>

      {/* resolução (só freio, erro, conferir, testar): borda na cor, sem título — o cabeçalho já diz */}
      {resolve && (
        <section className={`psy-resolve psy-resolve-${tom}`} aria-labelledby="psy-estado-tit">{resolve}</section>
      )}

      {agoraSync.erro && <p className="cpl-erro psy-retorno" role="alert"><Ic n="alerta" s={13} />{agoraSync.erro}</p>}
      {auto.erro && <p className="cpl-erro psy-retorno" role="alert"><Ic n="alerta" s={13} />{auto.erro}</p>}
      {!agoraSync.pendente && r && r.id === rodadaAgora && (
        r.resultado === 'erro'
          ? <LinhaStatus tom="er" role="alert" className="psy-retorno">A sincronização falhou: {r.mensagem ?? 'tente de novo em instantes.'}</LinhaStatus>
          : <LinhaStatus tom="ok" role="status" className="psy-retorno">Sincronizado: <span className="num">{fmtInt(r.daPlanilha)}</span> da planilha · <span className="num">{fmtInt(r.paraPlanilha)}</span> para a planilha.</LinhaStatus>
      )}

      {/* fatos */}
      <dl className="psy-fatos">
        <div className="psy-fato">
          <dt>Planilha</dt>
          <dd className="psy-fato-val">
            {estado.planilha
              ? <code className="cpl-id psy-fato-id" title={estado.planilha.id}>{estado.planilha.id}</code>
              : <span className="psy-fato-nada">—</span>}
          </dd>
          <dd className="psy-fato-acoes">
            {estado.planilha && (
              <a className="p-btn btn-sec btn-mini cpl-a" href={estado.planilha.url} target="_blank" rel="noopener noreferrer">
                <Ic n="externo" s={13} />Abrir<span className="cpl-vh"> a planilha no Google (nova aba)</span>
              </a>
            )}
            <BotaoSec mini data-psy-volta="trocar-planilha" onClick={() => setVista('trocar-planilha')}>Trocar planilha</BotaoSec>
          </dd>
        </div>
        <div className="psy-fato">
          <dt>Conta do sistema</dt>
          <dd className="psy-fato-val">
            {estado.conta ? <code className="cpl-email">{estado.conta.email}</code> : <span className="psy-fato-nada">—</span>}
          </dd>
          <dd className="psy-fato-acoes">
            {estado.conta && <BotaoCopiar texto={estado.conta.email} oQue="e-mail da conta do sistema" />}
            <BotaoSec mini data-psy-volta="trocar-chave" onClick={() => setVista('trocar-chave')}>Trocar chave</BotaoSec>
          </dd>
        </div>
        <div className="psy-fato">
          <dt>Última rodada</dt>
          <dd className="psy-fato-val num">
            {r ? (
              <>
                {haQuanto(r.quando, agora)} · {horaBR(r.quando)}
                {(r.resultado === 'ok' || r.resultado === 'sem_mudancas') && (
                  <> · <Resultado tom={RESULTADO[r.resultado].tom}>{RESULTADO[r.resultado].rot}</Resultado></>
                )}
              </>
            ) : <span className="psy-fato-nada">Nenhuma ainda</span>}
          </dd>
        </div>
      </dl>

      {/* histórico */}
      <div className="psy-hist">
        <div className="psy-hist-cab">
          <Segmentado rotulo="Histórico da sincronização" valor={lista} aoMudar={setLista}
            opcoes={[
              { valor: 'rodadas', rotulo: <>Rodadas <span className="num psy-cont">{estado.log.length}</span></> },
              { valor: 'conflitos', rotulo: <>Conflitos <span className="num psy-cont">{estado.conflitos.length}</span></> },
            ]} />
          <span className="psy-hist-nota">
            {lista === 'rodadas' ? 'Mais recentes primeiro' : 'Mesmo campo alterado nos dois lados entre duas rodadas'}
          </span>
        </div>
        {lista === 'rodadas' ? (
          estado.log.length ? (
            <ul className="psy-rods">{estado.log.map((x) => <LinhaRodada key={x.id} r={x} />)}</ul>
          ) : (
            <div className="psy-vazio psy-vazio-lista">
              <div className="psy-fig psy-fig-mini" aria-hidden><FigSincronia /></div>
              <p>Nenhuma rodada ainda.</p>
            </div>
          )
        ) : (
          estado.conflitos.length ? (
            <ul className="psy-confs">{estado.conflitos.map((c) => <LinhaConflito key={c.id} c={c} />)}</ul>
          ) : (
            <div className="psy-vazio psy-vazio-lista">
              <div className="psy-fig psy-fig-mini" aria-hidden><FigSincronia /></div>
              <p>Nenhum conflito nos últimos 7 dias.</p>
            </div>
          )
        )}
      </div>
    </div>
  );
}
