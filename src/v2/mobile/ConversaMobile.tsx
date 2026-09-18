import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  WA_REAL, mascararNumero, waRecarregarAudio, useAssinaturaMarca,
  useMensagensAgendadas, useAgendarSequencia, useEditarAgendamento, useCancelarAgendamento,
} from '@/data/whatsapp';
import { assinaturaAtendente } from '../hooks/inboxWhatsApp';
import type { WaMessage } from '@/data/whatsappDemo';
import { traduzErroEnvio, useScripts, aguardarConfirmacaoEnvio, type Script } from '@/data/scripts';
import { textoBloqueio } from '@/lib/higieneConversa';
import { canalValidoParaEnvio, itensParaRpc } from '@/lib/agendamentoMensagem';
import { construirItensConversa } from '@/lib/dataConversa';
import { initials } from '@/lib/avatar';
import { useAuth } from '@/context/AuthContext';
import { useOrg } from '@/context/OrgContext';
import { MediaComposer, type MediaTipo } from '@/components/MediaComposer';
import { ScriptSequenceModal } from '@/components/ScriptSequenceModal';
import { AgendarMensagemModalV2 } from '../pages/AgendarMensagemModalV2';
import { AudioRecorderV2 } from '../components/AudioRecorderV2';
import { useScriptsResumoEtapas } from '../hooks/scriptsResumo';
import { BotaoMini, ConfirmDialogV2, EstadoErro, Skeleton } from '../components';
import { Bolha } from '../components/BolhaWa';
import { nomeExibicao } from '../lib/waUi';
import { useInboxMobile } from './MobileShell';

/* ------------------------------------------------------------------
   Tela 2 do mobile (/m/:conversaId): a conversa aberta. A URL é a
   fonte de verdade da seleção (deep-link e restauração inclusos);
   o envio usa inbox.sendMsg — os MESMOS guards do desktop (higiene,
   opt-out, canal restrito/desconectado) vivem dentro do hook.
   Fase 2 (18/09, pedido do dono): PARIDADE do composer com o desktop —
   mídia (MediaComposer), áudio (AudioRecorderV2 → inbox.enviarAudio),
   scripts (sheet próprio → ScriptSequenceModal → inbox.scriptEnviar*)
   e agendar (AgendarMensagemModalV2 → RPC agendar_sequencia). Regra
   mantida: lógica SÓ no hook/data — aqui é markup e fiação de modal.
   ------------------------------------------------------------------ */

/** Janela de render do fio (histórico não pagina no data layer): últimas N bolhas + "ver anteriores". */
const JANELA_MSGS = 100;

/* ícones da barra de ferramentas (mesmo traço dos Ic* do desktop) */
const IcSvg = ({ children }: { children: ReactNode }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{children}</svg>
);
const IcImg = () => <IcSvg><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-4.4-4.4L5 21" /></IcSvg>;
const IcVid = () => <IcSvg><path d="m22 8-6 4 6 4V8Z" /><rect x="2" y="6" width="14" height="12" rx="2" /></IcSvg>;
const IcDoc = () => <IcSvg><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /></IcSvg>;
const IcRaio = () => <IcSvg><path d="M13 2 4 14h7l-1 8 9-12h-7z" /></IcSvg>;
const IcClock = () => <IcSvg><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></IcSvg>;

/* demo: mesmos 4 scripts de amostra do desktop (WhatsApp.tsx scriptsDemo) */
const SCRIPTS_DEMO: Script[] = [
  { id: 'sd-1', titulo: 'Boas-vindas ao cliente', descricao: null, conteudo: 'Olá {{nome_cliente}}! Aqui é {{seu_nome}}, da {{empresa}}. Como posso ajudar?', categoriaId: null, canais: ['whatsapp'], favorito: true, ativo: true, tags: [], autorId: null, criadoEm: '', atualizadoEm: '' },
  { id: 'sd-2', titulo: 'Pedir CPF', descricao: null, conteudo: 'Para conferir os descontos no benefício eu preciso do seu CPF, pode me enviar?', categoriaId: null, canais: ['whatsapp'], favorito: true, ativo: true, tags: [], autorId: null, criadoEm: '', atualizadoEm: '' },
  { id: 'sd-3', titulo: 'Explicar o processo', descricao: null, conteudo: 'A análise é simples: conferimos seu benefício, identificamos descontos indevidos e cuidamos do cancelamento e do ressarcimento.', categoriaId: null, canais: ['whatsapp'], favorito: false, ativo: true, tags: [], autorId: null, criadoEm: '', atualizadoEm: '' },
  { id: 'sd-4', titulo: 'Agendar ligação', descricao: null, conteudo: 'Posso te ligar para explicar melhor. Qual o melhor horário para você?', categoriaId: null, canais: ['whatsapp'], favorito: false, ativo: true, tags: [], autorId: null, criadoEm: '', atualizadoEm: '' },
];

export default function ConversaMobile() {
  const nav = useNavigate();
  const { conversaId } = useParams();
  const { user } = useAuth();
  const { currentOrg } = useOrg();
  const { inbox, aoAvisar } = useInboxMobile();
  const { demo, contacts } = inbox;

  // URL → hook: selecionarPorDeepLink liga de graça marcar-lida (com guardas de foco)
  // e a auto-seleção do canal de resposta. UMA sincronização por conversaId — nem por
  // igualdade de currentId (a lista zera a seleção ao montar; comparar com currentId
  // pularia a seleção e a conversa abriria sem marcar lida), nem re-seleção contínua
  // (deep-link de conversa apagada entraria em ping-pong com o reset de selecaoValida).
  // Só id que EXISTE na lista (ou enquanto ela ainda não chegou).
  const sincronizadaRef = useRef<string | null>(null);
  useEffect(() => {
    if (!conversaId || sincronizadaRef.current === conversaId) return;
    if (contacts.length === 0 || contacts.some((c) => c.id === conversaId)) {
      inbox.selecionarPorDeepLink(conversaId);
      sincronizadaRef.current = conversaId;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversaId, contacts]);

  // Renderizar SEMPRE pelo id da URL — inbox.current tem fallback contacts[0] e
  // piscaria a conversa errada no primeiro paint de um deep-link.
  const conv = contacts.find((c) => c.id === conversaId);
  const selecionada = inbox.currentId === conversaId;

  const [draft, setDraft] = useState('');
  const [verTodas, setVerTodas] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [removerAlvo, setRemoverAlvo] = useState<WaMessage | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const msgsRef = useRef<HTMLDivElement>(null);

  /* ---------- paridade do composer (Fase 2): mídia, scripts, agendar ---------- */
  const [midiaModal, setMidiaModal] = useState<MediaTipo | null>(null);
  const [scriptsAberto, setScriptsAberto] = useState(false);
  const [buscaScript, setBuscaScript] = useState('');
  const [scriptSeq, setScriptSeq] = useState<Script | null>(null);
  const [agendarAberto, setAgendarAberto] = useState(false);
  const [agEditId, setAgEditId] = useState<string | null>(null);
  const [cancelarAgId, setCancelarAgId] = useState<string | null>(null);
  const agendarSeqMut = useAgendarSequencia();
  const editarAgMut = useEditarAgendamento();
  const cancelarAgMut = useCancelarAgendamento();
  const agendadasQ = useMensagensAgendadas(WA_REAL ? conversaId ?? null : null);
  const scriptsQ = useScripts('whatsapp');
  const scripts = WA_REAL ? (scriptsQ.data ?? []) : SCRIPTS_DEMO;
  const scriptsResumo = useScriptsResumoEtapas().data ?? {};

  // trocar de conversa zera o rascunho, a janela de render e os popups do composer
  useEffect(() => {
    setDraft(''); setVerTodas(false);
    setMidiaModal(null); setScriptsAberto(false); setScriptSeq(null);
    setAgendarAberto(false); setAgEditId(null); setCancelarAgId(null);
  }, [conversaId]);

  /* assinatura OBRIGATÓRIA (28/08): carimbo fixo da casa — o backend aplica sozinho;
     aqui só espelhamos para a bolha otimista e o remetente do reply. */
  const assinaturaMarcaQ = useAssinaturaMarca();
  const assinaturaNome = assinaturaAtendente(user?.name, assinaturaMarcaQ.data);

  const msgs = conv?.msgs ?? [];
  const recortadas = verTodas ? msgs : msgs.slice(-JANELA_MSGS);
  const ocultas = msgs.length - recortadas.length;
  const itensConversa = useMemo(() => construirItensConversa(recortadas, (m) => m.tsISO ?? null), [recortadas]);

  /* "ver anteriores" insere bolhas ACIMA do scroll — preservar o ponto de leitura
     na mão (iOS não tem scroll anchoring; Chrome suprime anchoring com scrollTop 0) */
  const ancoraRef = useRef<{ h: number; t: number } | null>(null);
  const verAnteriores = () => {
    const el = msgsRef.current;
    ancoraRef.current = el ? { h: el.scrollHeight, t: el.scrollTop } : null;
    setVerTodas(true);
  };
  useLayoutEffect(() => {
    const a = ancoraRef.current;
    const el = msgsRef.current;
    if (!verTodas || !a || !el) return;
    el.scrollTop = el.scrollHeight - a.h + a.t;
    ancoraRef.current = null;
  }, [verTodas]);

  /* autoscroll ao trocar/receber e quando o teclado abre */
  useEffect(() => {
    const el = msgsRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [conversaId, msgs.length]);

  /* auto-altura do textarea (paridade desktop): roda também na limpeza programática do draft */
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
  }, [draft]);

  // Estado de bloqueio do composer só vale com a seleção sincronizada (`selecionada`):
  // no 1º frame após navegar, inbox.* ainda descreve a conversa ANTERIOR (flash errado).
  const optout = inbox.optout;
  const optoutTexto = 'Contato marcado como não incomodar — mensagens bloqueadas.';
  const composerBloqueado = selecionada && (inbox.canalIndisponivel || inbox.semDestino || inbox.canalRestrito || inbox.higieneBloqueia || optout);
  const placeholder = !selecionada ? 'Digite sua mensagem...'
    : optout ? 'Envio bloqueado: contato pediu para não ser incomodado'
    : inbox.semDestino ? 'Vincule um número para responder'
    : inbox.canalIndisponivel ? 'Envio bloqueado: número desconectado'
    : inbox.canalRestrito ? 'Envio bloqueado: número com restrição no WhatsApp'
    : (textoBloqueio(inbox.higiene) ?? 'Digite sua mensagem...');
  const sendDisabled = draft.trim() === '' || !selecionada || inbox.semDestino || optout || (WA_REAL && (!conv?.id || !inbox.canalConectado));
  const enviar = () => {
    if (optout) { aoAvisar({ tom: 'erro', texto: optoutTexto }); return; }
    inbox.sendMsg(draft, assinaturaNome || null, () => setDraft(''));
  };

  const voltar = () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) nav(-1); else nav('/m', { replace: true });
  };

  if (!conv) {
    return (
      <>
        <header className="m-ctopo">
          <button type="button" className="m-voltar" aria-label="Voltar" onClick={voltar}>‹</button>
          <div className="m-cnome">Conversa</div>
        </header>
        {!demo && inbox.live.isLoading ? (
          <div className="m-carga"><div className="m-carga-linha"><Skeleton largura="70%" /></div><div className="m-carga-linha"><Skeleton largura="50%" /></div></div>
        ) : !demo && inbox.live.isError ? (
          <EstadoErro descricao="Erro ao carregar as conversas." aoTentarDeNovo={() => void inbox.live.refetch()} />
        ) : (
          <div className="m-vazio">Conversa não encontrada. <button type="button" className="lnk" onClick={() => nav('/m', { replace: true })}>Voltar para a lista</button></div>
        )}
      </>
    );
  }

  const bloqueioDono = inbox.higieneBloqueia && inbox.higiene.motivoBloqueio === 'dono';
  const bloqueioNome = inbox.higieneBloqueia && inbox.higiene.motivoBloqueio !== 'dono';

  /* fórmulas da barra de ferramentas — espelho do desktop (WhatsApp.tsx midiaDisabled/
     agendarDisabled) + a guarda `selecionada` que o composer mobile já usa */
  const midiaDisabled = !selecionada || composerBloqueado || (WA_REAL && (!conv.id || !inbox.canalConectado));
  const canaisAgendaveis = inbox.realCanais.filter((c) => canalValidoParaEnvio({ id: c.id, status_integracao: c.status, envio_restrito: c.envioRestrito, conflito_com: c.conflitoCom, ativo: true }).ok);
  const agendarDisabled = !selecionada || inbox.semDestino || inbox.higieneBloqueia || optout || (WA_REAL && (!conv.id || canaisAgendaveis.length === 0));
  const qScript = buscaScript.trim().toLocaleLowerCase('pt-BR');
  const scriptsFiltrados = scripts
    .filter((s) => !qScript || s.titulo.toLocaleLowerCase('pt-BR').includes(qScript) || (s.tags ?? []).some((t) => t.toLocaleLowerCase('pt-BR').includes(qScript)))
    .slice()
    .sort((a, b) => Number(b.favorito) - Number(a.favorito) || a.titulo.localeCompare(b.titulo, 'pt-BR'));
  const agendadasVivas = (agendadasQ.data ?? []).filter((a) => ['agendada', 'processando', 'falhou', 'bloqueada'].includes(a.status));

  return (
    <>
      <header className="m-ctopo">
        <button type="button" className="m-voltar" aria-label="Voltar" onClick={voltar}>‹</button>
        <span className="m-av" aria-hidden>{initials(nomeExibicao(conv))}</span>
        <div className="m-cid">
          <div className="m-cnome">{nomeExibicao(conv)}</div>
          <div className="m-ctel num">{conv.phone ? mascararNumero(conv.phone) : 'sem número'}{conv.chip ? ' · ' + conv.chip : ''}</div>
        </div>
      </header>

      {selecionada && optout && <div className="m-banner bloq"><b>Não incomodar</b> — este contato pediu para não receber mensagens</div>}
      {selecionada && bloqueioDono && (
        <div className="m-banner">
          <span>Esta conversa não tem responsável.</span>
          <BotaoMini disabled={inbox.atribuindo} onClick={() => void inbox.assumir()}>Assumir atendimento</BotaoMini>
        </div>
      )}
      {selecionada && bloqueioNome && (
        <div className="m-banner">
          <span><b>{inbox.decNome.acao === 'bloqueia' ? 'Nome obrigatório' : 'Cadastro incompleto'}</b> — preencha o nome completo pelo computador</span>
          <span className="m-banner-acts">
            {inbox.decNome.podeAdiar && <BotaoMini disabled={inbox.adiando} onClick={inbox.adiarNome}>Lembrar depois</BotaoMini>}
            {inbox.decNome.acao === 'bloqueia' && <BotaoMini disabled={inbox.adiando} title="Libera por 24h e fica registrado" onClick={inbox.nomeNaoInformado}>Cliente não informou</BotaoMini>}
          </span>
        </div>
      )}
      {selecionada && inbox.semDestino && (
        <div className="m-banner bloq">Identidade protegida — vincule um número de resposta pelo computador</div>
      )}

      <div className="wa-msgs m-msgs" ref={msgsRef}>
        {ocultas > 0 && (
          <button type="button" className="m-vermais" onClick={verAnteriores}>Ver {ocultas} mensagens anteriores</button>
        )}
        {itensConversa.map((item, i) =>
          item.tipo === 'sep' ? (
            <div className="dia" key={'sep-' + i}>{item.label}</div>
          ) : (
            <Bolha
              key={item.msg.id ?? item.msg.cid ?? 'i' + i}
              m={item.msg} demo={demo} nomeCliente={nomeExibicao(conv)}
              retryId={inbox.retryId} removendoId={inbox.removendoId} semDestino={inbox.semDestino} optout={optout}
              aoResponder={(m) => {
                inbox.setReplyTo({
                  id: m.id ?? '', idExt: m.idExterno, fromMe: m.dir === 'out', tipo: m.tipo,
                  texto: (m.text || (m.tipo === 'audio' ? 'Mensagem de voz' : m.tipo === 'imagem' ? 'Imagem' : m.tipo === 'video' ? 'Vídeo' : m.tipo === 'documento' ? 'Documento' : '')).slice(0, 300),
                  remetente: m.dir === 'out' ? (assinaturaNome || 'Você') : (conv.name || 'Cliente'),
                });
                textareaRef.current?.focus();
              }}
              aoVerErro={(m) => aoAvisar({ tom: 'erro', texto: traduzErroEnvio(m.erro ?? '') })}
              aoRetry={inbox.retryMsg}
              aoRemover={(m) => setRemoverAlvo(m)}
              aoLightbox={setLightbox}
              aoRecarregarAudio={async (m) => {
                if (!WA_REAL || !m.id) return;
                try { await waRecarregarAudio(currentOrg.id, m.id); await inbox.msgsQ.refetch(); }
                catch { aoAvisar({ tom: 'erro', texto: 'Não foi possível recarregar o áudio.' }); }
              }}
            />
          ),
        )}
      </div>

      <div className="m-composer">
        {/* agendadas na conversa (paridade desktop; sem "por Fulano" — dispensa useOrgUsuarios).
            Embrulho .m-ags com teto+scroll: uma sequência de 10-20 blocos vira 10-20 linhas
            e sem teto o composer engoliria o fio inteiro num viewport de celular. */}
        {agendadasVivas.length > 0 && (
          <div className="m-ags">
            {agendadasVivas.map((a) => (
          <div className="ag-mini num" key={a.id}>
            <IcClock />
            <b>{a.status === 'agendada' ? 'Agendada' : a.status === 'processando' ? 'Enviando…' : a.status === 'bloqueada' ? 'Bloqueada' : 'Falhou'}</b>
            para {new Date(a.executarEm).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })}
            · {({ texto: 'Texto', imagem: 'Imagem', audio: 'Áudio', video: 'Vídeo', documento: 'Documento' } as Record<string, string>)[a.tipo] ?? a.tipo}
            {a.nomeArquivo ? ` · ${a.nomeArquivo}` : ''}{a.nomeCanal ? ` · via ${a.nomeCanal}` : ''}
            {(a.ultimoErro || a.motivoBloqueio) && <span className="err">{a.ultimoErro ?? a.motivoBloqueio}</span>}
            {a.status === 'agendada' && (
              <>
                <button type="button" className="lnk" onClick={() => { setAgEditId(a.id); setAgendarAberto(true); }}>Editar</button>
                <button type="button" className="lnk" onClick={() => setCancelarAgId(a.id)}>Cancelar</button>
              </>
            )}
              </div>
            ))}
          </div>
        )}
        {inbox.replyTo && (
          <div className="reply-box">
            <div>
              <div className="rem">Respondendo a {inbox.replyTo.remetente}</div>
              <div className="tt">{inbox.replyTo.texto || (inbox.replyTo.tipo === 'audio' ? 'Mensagem de voz' : inbox.replyTo.tipo === 'imagem' ? 'Imagem' : inbox.replyTo.tipo === 'video' ? 'Vídeo' : 'Documento')}</div>
            </div>
            <button type="button" className="x" aria-label="Cancelar resposta" onClick={() => inbox.setReplyTo(null)}>×</button>
          </div>
        )}
        {/* barra de ferramentas — as mesmas funções do composer desktop */}
        <div className="m-tools">
          <button type="button" className="tool" title="Enviar imagem" aria-label="Enviar imagem" disabled={midiaDisabled} onClick={() => setMidiaModal('imagem')}><IcImg /></button>
          <button type="button" className="tool" title="Enviar vídeo" aria-label="Enviar vídeo" disabled={midiaDisabled} onClick={() => setMidiaModal('video')}><IcVid /></button>
          <button type="button" className="tool" title="Enviar documento" aria-label="Enviar documento" disabled={midiaDisabled} onClick={() => setMidiaModal('documento')}><IcDoc /></button>
          {/* !selecionada é OBRIGATÓRIA: o envio do script vai pro currentId do HOOK —
              dessincronizado da URL, sairia pra OUTRA conversa (achado da revisão 18/09) */}
          <button type="button" className="tool" title="Scripts" aria-label="Scripts" disabled={!selecionada || composerBloqueado || scripts.length === 0} onClick={() => setScriptsAberto(true)}><IcRaio /></button>
          <button type="button" className="tool" title="Agendar mensagem" aria-label="Agendar mensagem" disabled={agendarDisabled} onClick={() => { setAgEditId(null); setAgendarAberto(true); }}><IcClock /></button>
          <AudioRecorderV2 disabled={midiaDisabled} onEnviar={inbox.enviarAudio} />
        </div>
        <div className="m-cmsg">
          <textarea
            ref={textareaRef} rows={1} value={draft} placeholder={placeholder} disabled={composerBloqueado}
            enterKeyHint="enter"
            onChange={(e) => { setDraft(e.target.value); e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'; }}
            onFocus={() => { const el = msgsRef.current; if (el) window.setTimeout(() => { el.scrollTop = el.scrollHeight; }, 250); }}
          />
          <button type="button" className="m-env" title="Enviar" aria-label="Enviar" disabled={sendDisabled} onClick={enviar}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4 12l16-8-6 16-2.5-6.5z" /></svg>
          </button>
        </div>
      </div>

      <ConfirmDialogV2
        aberto={!!removerAlvo}
        titulo="Remover esta mensagem com falha?"
        mensagem="Ela não foi entregue ao cliente e será retirada da conversa."
        rotuloConfirmar="Remover"
        destrutivo
        carregando={!!inbox.removendoId}
        aoConfirmar={async () => { if (removerAlvo) { await inbox.removerFalha(removerAlvo); setRemoverAlvo(null); } }}
        aoCancelar={() => setRemoverAlvo(null)}
      />

      {/* ===== paridade do composer: modais (mesmos componentes do desktop) ===== */}
      <MediaComposer
        open={!!midiaModal} tipo={midiaModal ?? 'imagem'} previewCard={midiaModal === 'imagem'}
        onClose={() => setMidiaModal(null)}
        enviar={async (file, caption) => {
          if (midiaModal === 'video') await inbox.enviarVideo(file, caption);
          else if (midiaModal === 'documento') await inbox.enviarDocumento(file, caption);
          else await inbox.enviarImagem(file, caption);
          setMidiaModal(null);
        }}
      />

      {/* scripts: sheet mobile próprio (o popover desktop fecha no resize do teclado);
          o clique reusa o MESMO caminho — setScriptSeq → ScriptSequenceModal, nunca envio cego */}
      {scriptsAberto && (
        <div className="veu" role="dialog" aria-modal aria-label="Scripts" onMouseDown={(e) => { if (e.target === e.currentTarget) setScriptsAberto(false); }} style={{ zIndex: 95 }}>
          <div className="m-sheet">
            <div className="m-sheet-topo">
              <b>Scripts</b>
              <button type="button" className="x" aria-label="Fechar" onClick={() => setScriptsAberto(false)}>×</button>
            </div>
            <input className="m-busca" placeholder="Buscar script..." value={buscaScript} onChange={(e) => setBuscaScript(e.target.value)} />
            <div className="m-sheet-lista">
              {scriptsFiltrados.length === 0 && <div className="m-vazio">Nenhum script encontrado.</div>}
              {scriptsFiltrados.map((s) => {
                const r = scriptsResumo[s.id];
                return (
                  <button
                    key={s.id} type="button" className="m-sheet-item"
                    onClick={() => {
                      if (optout) { aoAvisar({ tom: 'erro', texto: optoutTexto }); return; }
                      // re-checa a sincronização URL×hook no toque: a seleção pode ter
                      // caído entre abrir o sheet e escolher (o envio vai pro currentId)
                      if (!selecionada) { aoAvisar({ tom: 'erro', texto: 'Conversa dessincronizada — volte e abra de novo.' }); return; }
                      setScriptsAberto(false); setBuscaScript(''); setScriptSeq(s);
                    }}
                  >
                    <span className="tt">{s.favorito ? '★ ' : ''}{s.titulo}</span>
                    <span className="mt">{(r?.total ?? 1) > 1 ? `${r?.total} mensagens` : '1 mensagem'}{r?.temMidia ? ' · com mídia' : ''}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
      <ScriptSequenceModal
        open={!!scriptSeq} script={scriptSeq}
        canal="whatsapp" conversaId={conv.id} incluirMidia
        onClose={() => setScriptSeq(null)}
        ctx={{ cliente: conv.name, atendente: user?.name || 'Atendente', emailAtendente: user?.email ?? '', empresa: currentOrg.name, telefone: conv.phone }}
        enviarMidia={inbox.scriptEnviarMidia}
        enviarEtapa={inbox.scriptEnviarEtapa}
        confirmar={(id) => (demo ? Promise.resolve('enviada' as const) : aguardarConfirmacaoEnvio(id))}
      />

      {agendarAberto && (
        <AgendarMensagemModalV2
          aberto modo={agEditId ? 'editar' : 'criar'} demo={demo}
          canais={canaisAgendaveis.map((c) => ({ id: c.id, alias: c.alias, numero: c.numero, status: c.status, envioRestrito: c.envioRestrito, conflitoCom: c.conflitoCom }))}
          temTelefone={!!conv.phone}
          ultimaInteracaoMs={conv.lastAtMs ?? null}
          initial={agEditId ? (() => {
            const a = (agendadasQ.data ?? []).find((x) => x.id === agEditId);
            return a ? { canalId: a.canalId, texto: a.texto ?? '', executarEm: a.executarEm, tipo: a.tipo, nomeArquivo: a.nomeArquivo ?? undefined } : null;
          })() : { canalId: inbox.replyCanalId || conv.canalId || undefined }}
          aoFechar={() => { setAgendarAberto(false); setAgEditId(null); }}
          aoSubmeter={async (v) => {
            if (optout) { aoAvisar({ tom: 'erro', texto: optoutTexto }); return; }   // opt-out: revalidar no submit
            if (demo) { aoAvisar({ tom: 'ok', texto: 'Mensagem agendada — será enviada automaticamente no horário.' }); setAgendarAberto(false); setAgEditId(null); return; }
            if (agEditId) {
              await editarAgMut.mutateAsync({ id: agEditId, conversaId: conv.id, canalId: v.canalId, texto: v.texto ?? '', executarEm: v.executarISO });
              aoAvisar({ tom: 'ok', texto: 'Agendamento atualizado.' });
            } else {
              // mapa PLANO da RPC (storage_path na raiz, nunca `midia` aninhada) — lib testada
              const itens = itensParaRpc(v.itens);
              await agendarSeqMut.mutateAsync({ conversaId: conv.id, canalId: v.canalId, executarEm: v.executarISO, itens });
              aoAvisar({ tom: 'ok', texto: itens.length > 1 ? `${itens.length} mensagens agendadas — serão enviadas no horário.` : 'Mensagem agendada — será enviada automaticamente no horário.' });
            }
            setAgendarAberto(false); setAgEditId(null);
          }}
        />
      )}
      <ConfirmDialogV2
        aberto={!!cancelarAgId}
        titulo="Cancelar agendamento?"
        mensagem="A mensagem não será enviada."
        rotuloConfirmar="Cancelar agendamento"
        destrutivo
        carregando={cancelarAgMut.isPending}
        aoConfirmar={async () => {
          if (!cancelarAgId) return;
          try { await cancelarAgMut.mutateAsync({ id: cancelarAgId, conversaId: conv.id }); aoAvisar({ tom: 'ok', texto: 'Agendamento cancelado.' }); }
          catch (e) { aoAvisar({ tom: 'erro', texto: (e as Error)?.message || 'Falha ao cancelar.' }); }
          setCancelarAgId(null);
        }}
        aoCancelar={() => setCancelarAgId(null)}
      />
      {lightbox && (
        <div className="veu" role="dialog" aria-modal onMouseDown={(e) => { if (e.target === e.currentTarget) setLightbox(null); }} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 96 }}>
          <button type="button" aria-label="Fechar" onClick={() => setLightbox(null)} style={{ position: 'fixed', top: 14, right: 18, fontSize: 22, background: 'none', border: 'none', color: 'var(--txt)', cursor: 'pointer' }}>×</button>
          <img src={lightbox} alt="Imagem ampliada" style={{ maxWidth: '92vw', maxHeight: '86vh', borderRadius: 10 }} />
        </div>
      )}
    </>
  );
}
