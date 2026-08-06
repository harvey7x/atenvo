import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { WA_REAL, mascararNumero, waRecarregarAudio } from '@/data/whatsapp';
import type { WaMessage } from '@/data/whatsappDemo';
import { useAssinaturaPref } from '@/data/atendimento';
import { traduzErroEnvio } from '@/data/scripts';
import { textoBloqueio } from '@/lib/higieneConversa';
import { construirItensConversa } from '@/lib/dataConversa';
import { initials } from '@/lib/avatar';
import { useAuth } from '@/context/AuthContext';
import { useOrg } from '@/context/OrgContext';
import { BotaoMini, ConfirmDialogV2, EstadoErro, Skeleton } from '../components';
import { Bolha } from '../components/BolhaWa';
import { nomeExibicao } from '../lib/waUi';
import { useInboxMobile } from './MobileShell';

/* ------------------------------------------------------------------
   Tela 2 do mobile (/m/:conversaId): a conversa aberta. A URL é a
   fonte de verdade da seleção (deep-link e restauração inclusos);
   o envio usa inbox.sendMsg — os MESMOS guards do desktop (higiene,
   opt-out, canal restrito/desconectado) vivem dentro do hook.
   Fase 1: envio só de TEXTO; mídia recebida renderiza via Bolha.
   ------------------------------------------------------------------ */

/** Janela de render do fio (histórico não pagina no data layer): últimas N bolhas + "ver anteriores". */
const JANELA_MSGS = 100;

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

  // trocar de conversa zera o rascunho e a janela de render
  useEffect(() => { setDraft(''); setVerTodas(false); }, [conversaId]);

  /* assinatura: leitura da preferência salva (edição do modo fica no desktop) */
  const assinaturaQ = useAssinaturaPref();
  const assinaturaNome = useMemo(() => {
    const modo = assinaturaQ.data?.modo ?? 'sem';
    return modo === 'atendente' ? (user?.name || 'Atendente')
      : modo === 'empresa' ? currentOrg.name
      : modo === 'personalizado' ? (assinaturaQ.data?.nome ?? '').trim()
      : '';
  }, [assinaturaQ.data, user?.name, currentOrg.name]);

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
        {inbox.replyTo && (
          <div className="reply-box">
            <div>
              <div className="rem">Respondendo a {inbox.replyTo.remetente}</div>
              <div className="tt">{inbox.replyTo.texto || (inbox.replyTo.tipo === 'audio' ? 'Mensagem de voz' : inbox.replyTo.tipo === 'imagem' ? 'Imagem' : inbox.replyTo.tipo === 'video' ? 'Vídeo' : 'Documento')}</div>
            </div>
            <button type="button" className="x" aria-label="Cancelar resposta" onClick={() => inbox.setReplyTo(null)}>×</button>
          </div>
        )}
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
      {lightbox && (
        <div className="veu" role="dialog" aria-modal onMouseDown={(e) => { if (e.target === e.currentTarget) setLightbox(null); }} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 96 }}>
          <button type="button" aria-label="Fechar" onClick={() => setLightbox(null)} style={{ position: 'fixed', top: 14, right: 18, fontSize: 22, background: 'none', border: 'none', color: 'var(--txt)', cursor: 'pointer' }}>×</button>
          <img src={lightbox} alt="Imagem ampliada" style={{ maxWidth: '92vw', maxHeight: '86vh', borderRadius: 10 }} />
        </div>
      )}
    </>
  );
}
