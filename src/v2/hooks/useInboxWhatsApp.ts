import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  WA_REAL, useWaConversations, useWaMensagens, useSendWaMessage, useAtribuirAtendimento,
  useWaCanais, useWaCanalEnvioSaude, useIniciarConversaWa,
  waMarcarLida, waArquivar, waFixar, removerMensagemFalha, subirMidiaWa,
  buscarConversasAgora, patchOtimistaLista, pedirBuscaAlvo,
} from '@/data/whatsapp';
import { WA_CONTACTS, type WaContact, type WaMessage } from '@/data/whatsappDemo';
import { useHigieneConversa, useRegistrarAdiamento, HIGIENE_VAZIO } from '@/data/higiene';
import { decidirDono, decidirNome, estadoHigiene, conversaAtiva, textoBloqueio } from '@/lib/higieneConversa';
import { aguardarConfirmacaoEnvio } from '@/data/scripts';
import { responsavelEfetivo } from '@/lib/conversaEtiquetas';
import { HIGIENE_CORTE_ISO, HIGIENE_DIAS_ADAPTACAO } from '@/config/higiene';
import { useBloqueiosOrg } from './bloqueiosOrg';
import { useAuth } from '@/context/AuthContext';
import { useOrg } from '@/context/OrgContext';
import {
  aplicarEnvioOtimista, aplicarFalha, aplicarRetry, canalAutomatico, conversaAtual, hidratarHistorico, marcarIdReal,
  montarCorpoAssinado, novoCid, patchBolha, patchConversa, reconciliarLista, removerMensagemLocal, selecaoDescasada, selecaoValida,
} from './inboxWhatsApp';
import { previewUltimaMensagem } from '@/lib/conversaEtiquetas';

/* ------------------------------------------------------------------
   useInboxWhatsApp — a máquina do inbox extraída de src/pages/
   WhatsApp.tsx (as ~600 linhas inline). Timing preservado (timeout
   25s, scroll 220ms, coalesce no data layer); retry idem (retry_
   mensagem_id na MESMA bolha, sem assinatura e sem timeout).
   Reconciliação: lista substitui e devolve o histórico completo à
   conversa aberta, MAS bolhas otimistas PENDENTES sobrevivem até a
   linha real do servidor cobri-las (id devolvido pelo envio, anexo ou
   conteúdo idêntico na janela) — a mensagem recém-enviada não pisca e
   jamais duplica. Mídia também é otimista: bolha imediata com preview
   local (objectURL) enquanto upload+envio correm por trás.
   A página v2 cuida só de UI (draft, popovers, modais, foco, painéis).
   Demo (WA_REAL=false): seed em memória + ações locais.
   ------------------------------------------------------------------ */

export const CURR_KEY = 'atenvo-wa-current';
export type AvisoInbox = { tom: 'ok' | 'erro'; texto: string };
export type ReplyTo = { id: string; idExt?: string; fromMe: boolean; tipo?: string; texto?: string; remetente: string };

const EMPTY_CONTACT: WaContact = {
  id: '', name: '', phone: '', chip: '', time: '', unread: 0, tabs: [], status: '',
  last: '', email: '', stage: '', resp: '', origin: '', tags: [], lastInter: '', notes: '', doc: null, msgs: [],
};

export function useInboxWhatsApp(opts: {
  aoAvisar: (a: AvisoInbox) => void;
  /** seed do demo (deep-copy é feita aqui); default WA_CONTACTS. */
  seedDemo?: WaContact[];
  /** contatos em opt-out no demo (no real vem de useBloqueiosOrg). */
  bloqueadosDemo?: Set<string>;
}) {
  const { aoAvisar } = opts;
  const { user } = useAuth();
  const { currentOrg } = useOrg();
  const qc = useQueryClient();
  const orgId = currentOrg.id;
  const demo = !WA_REAL;

  const live = useWaConversations();
  const canaisQ = useWaCanais();
  const sendMut = useSendWaMessage();
  const atribuirMut = useAtribuirAtendimento();
  const iniciarMut = useIniciarConversaWa();
  const adiarMut = useRegistrarAdiamento();

  /* ---------- espelho `contacts` ---------- */
  const [contacts, setContacts] = useState<WaContact[]>(() =>
    WA_REAL ? [] : (opts.seedDemo ?? WA_CONTACTS).map((c) => ({ ...c, msgs: c.msgs.map((m) => ({ ...m })), tags: [...c.tags] })),
  );

  /* ---------- seleção ---------- */
  const [currentId, setCurrentId] = useState<string>(() => {
    if (!WA_REAL) return (opts.seedDemo ?? WA_CONTACTS)[0]?.id ?? '';
    try { return sessionStorage.getItem(CURR_KEY) ?? ''; } catch { return ''; }
  });
  const currentIdRef = useRef(currentId);
  currentIdRef.current = currentId;
  useEffect(() => {
    if (WA_REAL && currentId) { try { sessionStorage.setItem(CURR_KEY, currentId); } catch { /* privado */ } }
  }, [currentId]);

  const msgsQ = useWaMensagens(WA_REAL ? currentId || null : null);
  const historicoRef = useRef<WaMessage[] | undefined>(undefined);
  historicoRef.current = msgsQ.data;

  /* conversa selecionada que AINDA não está na lista (deep-link do toast "Ver conversa", alerta
     de lead quente, restauração da sessão): busca-alvo imediata SÓ dela, em vez de esperar a
     recarga completa. Enquanto a busca corre a seleção é PROTEGIDA (selecaoValida não troca para
     a 1ª conversa); se a busca não a encontrar, a seleção cai na 1ª como sempre. Uma tentativa por id. */
  const alvoPendenteRef = useRef<{ id: string; ate: number } | null>(null);
  const tentadosRef = useRef(new Set<string>());
  const buscarSelecionadaAusente = useCallback((id: string) => {
    if (!WA_REAL || !id || tentadosRef.current.has(id)) return;
    tentadosRef.current.add(id);
    alvoPendenteRef.current = { id, ate: Date.now() + 15_000 };
    void buscarConversasAgora(orgId, { ids: [id] }).then((ok) => {
      const pend = alvoPendenteRef.current;
      if (pend?.id !== id) return;
      // falhou: a recarga completa já foi pedida — segue protegida por mais alguns segundos
      if (!ok) { alvoPendenteRef.current = { id, ate: Date.now() + 8_000 }; return; }
      alvoPendenteRef.current = null;
      const lista = qc.getQueryData<WaContact[]>(['wa-conversas', orgId]);
      if (lista) setCurrentId((cur) => (cur === id ? selecaoValida(cur, lista) : cur));
    });
  }, [orgId, qc]);
  const selecaoProtegida = (id: string): boolean => {
    const pend = alvoPendenteRef.current;
    return !!id && pend?.id === id && Date.now() < pend.ate;
  };

  /* reconciliação da LISTA (v1 L251-260) — dep SÓ em live.data; a conversa
     aberta recebe de volta o histórico completo via refs (sem loop); bolhas
     pendentes do estado atual sobrevivem (por isso o updater com `cur`) */
  useEffect(() => {
    if (!WA_REAL || !live.data) return;
    const abertaId = currentIdRef.current;
    const hist = historicoRef.current;
    setContacts((cur) => reconciliarLista(cur, live.data!, abertaId, hist));
    if (abertaId && !live.data.some((c) => c.id === abertaId)) buscarSelecionadaAusente(abertaId);
    setCurrentId((id) => (selecaoProtegida(id) ? id : selecaoValida(id, live.data!)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live.data]);
  /* seleção nova (deep-link) com a lista já carregada e sem a conversa: mesma busca-alvo */
  useEffect(() => {
    if (!WA_REAL || !currentId || !live.data) return;
    if (!live.data.some((c) => c.id === currentId)) buscarSelecionadaAusente(currentId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId]);

  /* hidratação do histórico completo (v1 L263-266) */
  useEffect(() => {
    if (!WA_REAL || !msgsQ.data || !currentId) return;
    setContacts((cur) => hidratarHistorico(cur, currentId, msgsQ.data!));
  }, [msgsQ.data, currentId]);

  // seleção fora da lista (deep-link durante a busca-alvo) = estado vazio, NUNCA a 1ª conversa:
  // a tela/travas/canal seriam de outra conversa enquanto o envio iria para currentId
  const current = conversaAtual(contacts, currentId, WA_REAL) ?? EMPTY_CONTACT;
  const descasada = selecaoDescasada(WA_REAL, currentId, current.id);

  /* ---------- marcar-lida (v1 L340-382) ---------- */
  const selecaoUsuarioRef = useRef<string | null>(null);
  const marcandoLeituraRef = useRef(false);
  // falha recente por conversa: o desfazer devolve o badge, o que re-dispararia este efeito —
  // sem a pausa, uma RPC que sempre falha (ex.: sem_permissao) viraria um laço RPC → desfazer → RPC
  const leituraFalhouRef = useRef<{ id: string; em: number } | null>(null);
  const markCurrentRead = useCallback(() => {
    if (!WA_REAL || !currentId) return;
    if (selecaoUsuarioRef.current !== currentId) return;      // restauração/programática NÃO marca
    if (document.visibilityState !== 'visible') return;
    if (!document.hasFocus()) return;
    if (marcandoLeituraRef.current) return;
    const falhou = leituraFalhouRef.current;
    if (falhou && falhou.id === currentId && Date.now() - falhou.em < 60_000) return;
    const c = contacts.find((x) => x.id === currentId);
    if (!c || (c.unread ?? 0) <= 0) return;
    marcandoLeituraRef.current = true;
    const alvo = currentId;
    // Patch OTIMISTA no cache da lista (badge zera na hora) em vez da recarga completa IMEDIATA de
    // antes — que rodava a cada mensagem recebida na conversa aberta e focada (18 requisições, ~36 MB).
    // O UPDATE de conversas que volta pelo realtime confirma; no erro, desfaz + recarga completa.
    const otimista = patchOtimistaLista(qc, orgId, alvo, { unread: 0 });
    waMarcarLida(alvo, true)
      .then(() => {
        otimista.confirmar();
        marcandoLeituraRef.current = false;
        // chegou mensagem enquanto a RPC corria (o efeito foi barrado pela trava): confere de novo
        window.setTimeout(() => markReadRef.current(), 0);
      })
      .catch((e) => {
        marcandoLeituraRef.current = false;
        leituraFalhouRef.current = { id: alvo, em: Date.now() };
        otimista.desfazer();
        console.warn('[wa] marcar lida falhou:', String((e as Error)?.message ?? e).slice(0, 80));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId, contacts]);
  const markReadRef = useRef(markCurrentRead);
  markReadRef.current = markCurrentRead;
  useEffect(() => { markCurrentRead(); }, [markCurrentRead]);
  useEffect(() => {
    const h = () => markCurrentRead();
    window.addEventListener('focus', h);
    document.addEventListener('visibilitychange', h);
    return () => { window.removeEventListener('focus', h); document.removeEventListener('visibilitychange', h); };
  }, [markCurrentRead]);

  const selectContact = useCallback((id: string) => {
    selecaoUsuarioRef.current = id;
    setCurrentId(id);
  }, []);
  /** deep-link: conta como seleção do usuário (marca lida) — v1 L369 */
  const selecionarPorDeepLink = useCallback((id: string) => {
    selecaoUsuarioRef.current = id;
    setCurrentId(id);
  }, []);

  /* ---------- canal de resposta (v1 L388-408) ---------- */
  const realCanais = useMemo(() => (WA_REAL ? (canaisQ.data ?? []) : []), [canaisQ.data]);
  const [replyCanalId, setReplyCanalId] = useState('');
  const [replyChip, setReplyChip] = useState('Chip 1'); // mock
  const autoCanalRef = useRef<{ conv: string; canal: string } | null>(null);
  const canalManualRef = useRef<string | null>(null);
  useEffect(() => {
    if (!WA_REAL) return;
    const ids = realCanais.map((c) => c.id);
    const canalDaConversa = canalAutomatico(current.ultimoCanal?.canalId, current.canalId, ids);
    const trocouDeConversa = autoCanalRef.current?.conv !== currentId;
    if (trocouDeConversa) canalManualRef.current = null;
    if (!autoCanalRef.current || trocouDeConversa || autoCanalRef.current.canal !== canalDaConversa) {
      autoCanalRef.current = { conv: currentId, canal: canalDaConversa };
      if (trocouDeConversa || !canalManualRef.current) setReplyCanalId(canalDaConversa);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId, current.ultimoCanal?.canalId, current.canalId, realCanais.length]);

  const onReplyCanal = useCallback((id: string) => {
    setReplyCanalId(id);
    canalManualRef.current = id;
    const c = realCanais.find((x) => x.id === id);
    if (c) aoAvisar({ tom: 'ok', texto: 'Respondendo por ' + c.alias });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [realCanais]);
  const replyChipRef = useRef(replyChip);
  replyChipRef.current = replyChip;
  const onReplyChip = useCallback((chip: string) => {
    // aviso FORA do updater (updaters precisam ser puros — StrictMode invoca 2×)
    if (replyChipRef.current !== chip && chip !== 'Chip 1') aoAvisar({ tom: 'erro', texto: 'Atenção: ' + chip + ' pode iniciar uma nova conversa' });
    else aoAvisar({ tom: 'ok', texto: 'Respondendo por ' + chip });
    setReplyChip(chip);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canalSel = realCanais.find((c) => c.id === replyCanalId) ?? null;
  const canalConectado = WA_REAL ? canalSel?.status === 'conectado' : true;
  const canalIndisponivel = WA_REAL && !!canalSel && canalSel.status !== 'conectado';
  // v1 L420: SÓ envioRestrito bloqueia; entregaStatus 'restrito'/'instavel' é aviso não-bloqueante (composer).
  const canalRestrito = WA_REAL && !!canalSel?.envioRestrito;
  const envioSaudeQ = useWaCanalEnvioSaude(WA_REAL ? (canalSel?.id ?? current.canalId ?? null) : null);
  const semDestino = WA_REAL && !!current.semDestino;

  /* opt-out (relacionamento_bloqueio) — inviolável: bloqueia TODA rota de envio, inclusive retry */
  const bloqueiosQ = useBloqueiosOrg();
  const bloqueados = demo ? (opts.bloqueadosDemo ?? new Set<string>()) : (bloqueiosQ.data ?? new Set<string>());
  const optout = !!current.contatoId && bloqueados.has(current.contatoId);

  /* ---------- higiene (v1 L434-443) ---------- */
  const higQ = useHigieneConversa(WA_REAL ? current.id || null : null);
  const hig = higQ.data ?? HIGIENE_VAZIO;
  const agoraMs = Date.now();
  const ativa = conversaAtiva({ status: current.status, arquivada: current.arquivada });
  const donoEfetivo = responsavelEfetivo(current);
  const acaoDono = decidirDono({
    ativa, temDono: !!donoEfetivo, conversaCriadaEm: current.criadaEm ?? null, agoraMs,
    corteISO: HIGIENE_CORTE_ISO, diasAdaptacao: HIGIENE_DIAS_ADAPTACAO,
  });
  const decNome = decidirNome({ ativa, nome: current.name, adiamentos: hig.adiamentos, liberadoAte: hig.liberadoAte, agoraMs });
  const higiene = estadoHigiene(acaoDono, decNome);
  const higieneBloqueia = WA_REAL && !!current.id && higiene.bloqueiaEnvio;

  const bloquearPorHigiene = useCallback((): boolean => {
    if (!higieneBloqueia) return false;
    // v1: o texto segue o MOTIVO do bloqueio, não o estado do dono (dono='alerta' + nome bloqueia → é nome)
    if (higiene.motivoBloqueio === 'dono') aoAvisar({ tom: 'erro', texto: 'Esta conversa não tem responsável. Clique em "Assumir atendimento" para responder.' });
    else aoAvisar({ tom: 'erro', texto: 'Preencha o nome completo do cliente para continuar respondendo.' });
    return true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [higieneBloqueia, higiene.motivoBloqueio]);

  const adiarNome = useCallback(async () => {
    if (!current.id || adiarMut.isPending) return;                 // v1 L633: trava de duplo-clique
    try {
      const r = await adiarMut.mutateAsync({ conversaId: current.id, tipo: 'nome_adiado' });
      const restam = Math.max(0, 2 - r.adiamentos);
      aoAvisar({
        tom: 'ok',
        texto: restam > 0
          ? `Ok. Depois de mais ${restam === 1 ? 'um adiamento' : `${restam} adiamentos`} o nome vira obrigatório.`
          : 'Último adiamento usado. Na próxima o nome será obrigatório para responder.',
      });
    } catch (e) { aoAvisar({ tom: 'erro', texto: (e as Error)?.message || 'Falha ao registrar o adiamento.' }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current.id]);
  const nomeNaoInformado = useCallback(async () => {
    if (!current.id || adiarMut.isPending) return;                 // v1 L645: trava de duplo-clique
    try {
      await adiarMut.mutateAsync({ conversaId: current.id, tipo: 'nome_nao_informado' });
      aoAvisar({ tom: 'ok', texto: 'Liberado por 24h. O aviso volta depois — registre o nome assim que o cliente informar.' });
    } catch (e) { aoAvisar({ tom: 'erro', texto: (e as Error)?.message || 'Falha ao registrar.' }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current.id]);

  /* ---------- reply (quoted) ---------- */
  const [replyTo, setReplyTo] = useState<ReplyTo | null>(null);

  /* ---------- envio (v1 L669-743) ---------- */
  // Anti-duplo-clique por TEMPO, não por "requisição em voo": a trava antiga só soltava no
  // onSettled — se a chamada ficava pendurada (rede piscou, aba dormiu, token renovando), TODO
  // envio seguinte era ignorado em silêncio até recarregar a página. Agora cada mensagem sai na
  // hora e independente; só bloqueia o MESMO texto repetido em < 1,5s (Enter duplo).
  const ultimoEnvioRef = useRef<{ chave: string; em: number } | null>(null);
  const [retryId, setRetryId] = useState<string | null>(null);
  const [removendoId, setRemovendoId] = useState<string | null>(null);

  const sendMsg = useCallback((draft: string, assinaturaNome: string | null, aoAceitar: () => void) => {
    const v = draft.trim();
    if (!v) return;
    if (WA_REAL && !currentId) return;
    if (descasada) { aoAvisar({ tom: 'erro', texto: 'Aguarde a conversa carregar para enviar.' }); return; }
    const chaveEnvio = currentId + '|' + v;
    const ult = ultimoEnvioRef.current;
    if (ult && ult.chave === chaveEnvio && Date.now() - ult.em < 1500) return;
    if (canalRestrito) { aoAvisar({ tom: 'erro', texto: 'O número deste canal está com restrição no WhatsApp e está indisponível para envio. Selecione outro canal.' }); return; }
    if (canalIndisponivel) { aoAvisar({ tom: 'erro', texto: 'Este número está desconectado. Reconecte em Integrações para enviar.' }); return; }
    if (semDestino) { aoAvisar({ tom: 'erro', texto: 'Vincule um número confirmado para responder.' }); return; }
    if (optout) { aoAvisar({ tom: 'erro', texto: 'Contato marcado como não incomodar — mensagens bloqueadas.' }); return; }
    if (bloquearPorHigiene()) return;                          // higiene NÃO vale para retry (v1 L677)
    const now = new Date();
    const hh = ('0' + now.getHours()).slice(-2) + ':' + ('0' + now.getMinutes()).slice(-2);
    const corpo = montarCorpoAssinado(v, assinaturaNome);
    const cid = novoCid(now.getTime());
    ultimoEnvioRef.current = { chave: chaveEnvio, em: now.getTime() };
    const replyEnvio = replyTo ? { id: replyTo.id, idExt: replyTo.idExt, fromMe: replyTo.fromMe, preview: { remetente: replyTo.remetente, tipo: replyTo.tipo, texto: replyTo.texto } } : undefined;
    const quotedBolha = replyTo ? { remetente: replyTo.remetente, tipo: replyTo.tipo, texto: replyTo.texto } : undefined;
    setContacts((cur) => aplicarEnvioOtimista(cur, currentId, { dir: 'out', text: corpo, time: hh, tsISO: now.toISOString(), status: 'pendente', cid, quoted: quotedBolha }, v));
    aoAceitar();                                               // limpa o draft na página
    if (!WA_REAL) { aoAvisar({ tom: 'ok', texto: 'Mensagem enviada' }); setReplyTo(null); return; }
    const convAlvo = currentId;
    const marcarFalha = (erro: string) => setContacts((cur) => aplicarFalha(cur, convAlvo, cid, erro));
    const to = window.setTimeout(() => marcarFalha('Sem confirmação de envio a tempo. Tente novamente.'), 25_000);
    // mutateAsync (não mutate): com envios em paralelo, os callbacks do mutate() só disparam
    // para a ÚLTIMA chamada — as anteriores ficariam sem confirmação e cairiam no timeout.
    sendMut.mutateAsync({ conversaId: currentId, text: v, canalId: replyCanalId || current.canalId, replyTo: replyEnvio })
      .then((idReal) => { window.clearTimeout(to); setReplyTo(null); if (idReal) setContacts((cur) => marcarIdReal(cur, convAlvo, cid, idReal)); })
      .catch((e) => { window.clearTimeout(to); const msg = (e as Error)?.message || 'Falha no envio.'; marcarFalha(msg); aoAvisar({ tom: 'erro', texto: msg }); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId, descasada, canalRestrito, canalIndisponivel, semDestino, optout, bloquearPorHigiene, replyTo, replyCanalId, current.canalId]);

  const retryMsg = useCallback((m: WaMessage) => {
    if (!m.id || !currentId || retryId || descasada) return;
    if (canalRestrito) { aoAvisar({ tom: 'erro', texto: 'O número deste canal está com restrição no WhatsApp e está indisponível para reenviar. Selecione outro canal.' }); return; }
    if (canalIndisponivel) { aoAvisar({ tom: 'erro', texto: 'Este número está desconectado. Reconecte em Integrações para enviar.' }); return; }
    if (semDestino) { aoAvisar({ tom: 'erro', texto: 'Vincule um número confirmado para responder.' }); return; }
    if (optout) { aoAvisar({ tom: 'erro', texto: 'Contato marcado como não incomodar — mensagens bloqueadas.' }); return; }
    setRetryId(m.id);
    setContacts((cur) => aplicarRetry(cur, currentId, m.id!));
    if (!WA_REAL) { setRetryId(null); return; }
    // chamada pendurada não pode prender o "Reenviar" para sempre (mesmo bug do envio)
    const soltar = window.setTimeout(() => setRetryId(null), 25_000);
    sendMut.mutateAsync({ conversaId: currentId, text: m.text ?? '', canalId: replyCanalId || current.canalId, retryMensagemId: m.id })
      .catch((e) => aoAvisar({ tom: 'erro', texto: (e as Error)?.message || 'Falha no reenvio.' }))
      .finally(() => { window.clearTimeout(soltar); setRetryId(null); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId, retryId, descasada, canalRestrito, canalIndisponivel, semDestino, optout, replyCanalId, current.canalId]);

  const removerFalha = useCallback(async (m: WaMessage) => {
    if (!m.id || removendoId) return;
    setRemovendoId(m.id);
    try {
      if (WA_REAL) {
        await removerMensagemFalha(m.id);
        // o DELETE não chega pelo canal filtrado e a mensagem removida pode ser o preview do card:
        // busca-alvo da conversa (antes, a recarga completa de qualquer evento seguinte corrigia)
        pedirBuscaAlvo(qc, orgId, { ids: [currentId] });
      }
      setContacts((cur) => removerMensagemLocal(cur, currentId, m.id!));
      aoAvisar({ tom: 'ok', texto: 'Mensagem com falha removida.' });
    } catch (e) {
      aoAvisar({ tom: 'erro', texto: (e as Error)?.message || 'Falha ao remover.' });
    } finally { setRemovendoId(null); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId, removendoId, orgId]);

  /* mídia — ciclo OTIMISTA: bolha imediata com preview local (objectURL) e o
     upload+envio correndo por trás. As guardas continuam lançando SÍNCRONO
     (o modal aberto mostra o erro); passou nelas, a função resolve na hora
     (o modal fecha) e falha posterior vira bolha 'falhou' + aviso. */
  const guardaMidia = () => {
    if (WA_REAL && !currentId) throw new Error('Selecione uma conversa.');   // v1 L746/L758/L775
    if (descasada) throw new Error('Aguarde a conversa carregar para enviar.');
    if (optout) throw new Error('Contato marcado como não incomodar — mensagens bloqueadas.');
    if (!higieneBloqueia) return;
    // v1: motivo do bloqueio decide o texto (não o estado do dono)
    throw new Error(higiene.motivoBloqueio === 'dono' ? 'Assuma o atendimento para responder.' : 'Preencha o nome completo do cliente para responder.');
  };
  const replyPayload = () => (replyTo ? { id: replyTo.id, idExt: replyTo.idExt, fromMe: replyTo.fromMe, preview: { remetente: replyTo.remetente, tipo: replyTo.tipo, texto: replyTo.texto } } : undefined);
  const dispararMidia = useCallback((tipo: 'imagem' | 'video' | 'audio' | 'documento', file: File, caption: string, extra?: { audioDiag?: Record<string, unknown>; origemAudio?: string }) => {
    guardaMidia();
    const convAlvo = currentId;
    const canalAlvo = replyCanalId || current.canalId;
    const replyEnvio = replyPayload();
    const quotedBolha = replyTo ? { remetente: replyTo.remetente, tipo: replyTo.tipo, texto: replyTo.texto } : undefined;
    const now = new Date();
    const hh = ('0' + now.getHours()).slice(-2) + ':' + ('0' + now.getMinutes()).slice(-2);
    const cid = novoCid(now.getTime());
    const localUrl = URL.createObjectURL(file);
    const bolha: WaMessage = { dir: 'out', tipo, text: caption || '', time: hh, tsISO: now.toISOString(), status: 'pendente', cid, localUrl, nome: file.name, tamanho: file.size, mime: file.type, quoted: quotedBolha };
    setContacts((cur) => aplicarEnvioOtimista(cur, convAlvo, bolha, previewUltimaMensagem({ tipo, texto: caption || null })));
    setReplyTo(null);
    const marcarFalha = (erro: string) => setContacts((cur) => aplicarFalha(cur, convAlvo, cid, erro));
    // o upload acontece antes do envio: janela maior que os 25s do texto
    const to = window.setTimeout(() => marcarFalha('Sem confirmação do envio da mídia a tempo. Tente novamente.'), 120_000);
    void (async () => {
      try {
        const up = await subirMidiaWa(currentOrg.id, file);
        // anexoPath na bolha: o path é único por upload — a reconciliação mata a
        // bolha pelo path assim que a linha real chegar, sem depender do id.
        setContacts((cur) => patchBolha(cur, convAlvo, cid, { anexoPath: up.path }));
        const idReal = await sendMut.mutateAsync({ conversaId: convAlvo, canalId: canalAlvo, midiaPath: up.path, midiaTipo: tipo, midiaMime: up.mime, midiaNome: up.nome, midiaTamanho: up.tamanho, text: caption || undefined, replyTo: replyEnvio, ...(extra ?? {}) });
        if (idReal) setContacts((cur) => marcarIdReal(cur, convAlvo, cid, idReal));
      } catch (e) {
        const msg = (e as Error)?.message || 'Falha no envio da mídia.';
        marcarFalha(msg);
        aoAvisar({ tom: 'erro', texto: msg });
      } finally { window.clearTimeout(to); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId, descasada, replyCanalId, current.canalId, currentOrg.id, replyTo, higieneBloqueia, higiene.motivoBloqueio, optout]);
  const enviarImagem = useCallback(async (file: File, caption: string) => {
    if (!WA_REAL) { guardaMidia(); aoAvisar({ tom: 'ok', texto: 'Mensagem enviada' }); return; }
    dispararMidia('imagem', file, caption);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispararMidia]);
  const enviarVideo = useCallback(async (file: File, caption: string) => {
    if (!WA_REAL) { guardaMidia(); aoAvisar({ tom: 'ok', texto: 'Mensagem enviada' }); return; }
    dispararMidia('video', file, caption);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispararMidia]);
  const enviarAudio = useCallback(async (blob: Blob, mime: string, ext: string, diag?: Record<string, unknown>) => {
    if (!blob || !blob.size) throw new Error('Áudio vazio. Grave novamente.');   // tolera blob nulo (v1 L760)
    if (!WA_REAL) {
      guardaMidia();
      // demo: a bolha toca o áudio EXATAMENTE como sairia (já limpo + convertido) — dá pra conferir o resultado
      const now = new Date();
      const hh = ('0' + now.getHours()).slice(-2) + ':' + ('0' + now.getMinutes()).slice(-2);
      setContacts((cur) => aplicarEnvioOtimista(cur, currentId, { dir: 'out', tipo: 'audio', time: hh, tsISO: now.toISOString(), status: 'entregue', cid: novoCid(now.getTime()), localUrl: URL.createObjectURL(blob), mime, tamanho: blob.size }, '🎤 Áudio'));
      aoAvisar({ tom: 'ok', texto: 'Mensagem enviada' }); return;
    }
    const file = new File([blob], `audio.${ext}`, { type: mime });
    const origemAudio = diag?.origem === 'arquivo_anexado' ? 'arquivo_anexado' : 'gravacao_painel';
    dispararMidia('audio', file, '', { audioDiag: diag, origemAudio });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispararMidia, currentId]);
  const enviarDocumento = useCallback(async (file: File, caption: string) => {
    if (!WA_REAL) { guardaMidia(); aoAvisar({ tom: 'ok', texto: 'Mensagem enviada' }); return; }
    dispararMidia('documento', file, caption);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispararMidia]);
  /** Cartão de contato (vCard): o cliente recebe como contato nativo. Mesmos guards da mídia;
   *  otimista na bolha (texto fallback "📇 …" + metadados de cartão) e envio nativo no backend. */
  const enviarContato = useCallback(async (nome: string, telefone: string) => {
    guardaMidia();
    const tel = telefone.replace(/\D+/g, '');
    if (!nome.trim() || tel.length < 10) throw new Error('Informe o nome e o número com DDI + DDD.');
    const now = new Date();
    const hh = ('0' + now.getHours()).slice(-2) + ':' + ('0' + now.getMinutes()).slice(-2);
    const cid = novoCid(now.getTime());
    setContacts((cur) => aplicarEnvioOtimista(cur, currentId, { dir: 'out', text: `📇 ${nome.trim()} · +${tel}`, time: hh, status: 'pendente', cid, contato: { nome: nome.trim(), telefone: tel } }, `📇 ${nome.trim()}`));
    if (!WA_REAL) { aoAvisar({ tom: 'ok', texto: 'Contato compartilhado' }); return; }
    await sendMut.mutateAsync({ conversaId: currentId, canalId: replyCanalId || current.canalId, contato: { nome: nome.trim(), telefone: tel } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId, descasada, replyCanalId, current.canalId, higieneBloqueia, higiene.motivoBloqueio, optout]);

  /* ---------- envio via SCRIPT (ScriptSequenceModal) ----------
     As MESMAS travas do composer, re-checadas A CADA etapa (o estado pode mudar
     por realtime com o modal aberto — optout/higiene/canal): o caminho de script
     não pode furar o que sendMsg bloqueia. Mesma ordem e mesmos textos do
     composer. FONTE ÚNICA para desktop e mobile. */
  const guardaScript = () => {
    if (descasada) throw new Error('Aguarde a conversa carregar para enviar.');
    if (canalRestrito) throw new Error('O número deste canal está com restrição no WhatsApp e está indisponível para envio. Selecione outro canal.');
    if (canalIndisponivel) throw new Error('Este número está desconectado. Reconecte em Integrações para enviar.');
    if (semDestino) throw new Error('Vincule um número confirmado para responder.');
    if (optout) throw new Error('Contato marcado como não incomodar — mensagens bloqueadas.');
    if (higieneBloqueia) throw new Error(textoBloqueio(higiene) ?? 'Atendimento sem responsável ou com cadastro incompleto — assuma e complete o nome para enviar.');
  };
  /** Bolha otimista de uma etapa de script (texto ou mídia do arsenal). */
  const bolhaScript = (conv: string, b: Partial<WaMessage>, last: string) => {
    const now = new Date();
    const hh = ('0' + now.getHours()).slice(-2) + ':' + ('0' + now.getMinutes()).slice(-2);
    const cid = novoCid(now.getTime());
    setContacts((cur) => aplicarEnvioOtimista(cur, conv, { dir: 'out', time: hh, tsISO: now.toISOString(), status: 'pendente', cid, ...b }, last));
    return { conv, cid };
  };
  const scriptEnviarEtapa = useCallback(async (texto: string, retryMensagemId?: string) => {
    guardaScript();
    // demo devolve um id sintético: com `confirmar` presente o modal EXIGE id
    // (sem ele a etapa marcava "Falhou · envio sem identificador" no demo)
    if (demo) { aoAvisar({ tom: 'ok', texto: 'Mensagem enviada' }); return 'demo-script'; }
    // bolha "enviando" NA HORA (o script roda em segundo plano): some quando a linha real chega
    // (marcarIdReal → reconciliação por id); em erro vira "falhou" (o backend grava a falha com Reenviar).
    const bolha = retryMensagemId ? null : bolhaScript(currentId, { tipo: 'texto', text: texto }, texto);
    try {
      const id = await sendMut.mutateAsync({ conversaId: currentId, canalId: replyCanalId || current.canalId, text: texto, retryMensagemId });
      if (bolha && id) setContacts((cur) => marcarIdReal(cur, bolha.conv, bolha.cid, id));
      return id ?? undefined;
    } catch (e) {
      if (bolha) setContacts((cur) => aplicarFalha(cur, bolha.conv, bolha.cid, (e as Error)?.message || 'Falha no envio.'));
      throw e;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId, descasada, replyCanalId, current.canalId, canalRestrito, canalIndisponivel, semDestino, optout, higieneBloqueia, higiene, demo]);
  const scriptEnviarMidia = useCallback(async (m: { tipo: string; texto: string; mime?: string | null; nome?: string | null; tamanho?: number | null; storagePath?: string | null; previewUrl?: string }) => {
    guardaScript();
    if (!m.storagePath) throw new Error('Mídia do script sem arquivo. Reenvie o anexo na página de Scripts.');
    if (demo) { aoAvisar({ tom: 'ok', texto: 'Mídia enviada' }); return; }
    // A mídia do script já vive no bucket privado (script-midia); envia pelo mesmo caminho do compositor.
    const tipoBolha = (['imagem', 'video', 'audio', 'documento'].includes(m.tipo) ? m.tipo : 'documento') as 'imagem' | 'video' | 'audio' | 'documento';
    const bolha = bolhaScript(currentId,
      { tipo: tipoBolha, text: m.texto || '', localUrl: m.previewUrl, nome: m.nome ?? undefined, mime: m.mime ?? undefined, tamanho: m.tamanho ?? undefined },
      previewUltimaMensagem({ tipo: tipoBolha, texto: m.texto || null }));
    try {
      const id = await sendMut.mutateAsync({
        conversaId: currentId, canalId: replyCanalId || current.canalId,
        midiaPath: m.storagePath, midiaTipo: m.tipo, midiaMime: m.mime ?? undefined, midiaNome: m.nome ?? undefined, midiaTamanho: m.tamanho ?? undefined,
        text: m.texto || undefined,
      });
      if (id) setContacts((cur) => marcarIdReal(cur, bolha.conv, bolha.cid, id));
      if (id) await aguardarConfirmacaoEnvio(id); // sucesso = confirmação REAL do provedor (igual ao texto)
    } catch (e) {
      setContacts((cur) => aplicarFalha(cur, bolha.conv, bolha.cid, (e as Error)?.message || 'Falha no envio da mídia.'));
      throw e;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId, descasada, replyCanalId, current.canalId, canalRestrito, canalIndisponivel, semDestino, optout, higieneBloqueia, higiene, demo]);

  /* ---------- atribuição (v1 L806-867) — otimista com rollback ---------- */
  const [atribuindo, setAtribuindo] = useState(false);
  const assumir = useCallback(async () => {
    if (atribuindo || !current.id || !current.contatoId || !user?.id) return;
    setAtribuindo(true);
    const esperado = current.respId ?? null;
    setContacts((cur) => patchConversa(cur, current.id, { respId: user?.id ?? null }));
    try {
      if (WA_REAL) await atribuirMut.mutateAsync({ contatoId: current.contatoId ?? '', destinoId: user?.id ?? null, esperadoId: esperado, conversaId: current.id });
      aoAvisar({ tom: 'ok', texto: 'Você assumiu o atendimento' });
    } catch (e) {
      setContacts((cur) => patchConversa(cur, current.id, { respId: esperado }));
      aoAvisar({ tom: 'erro', texto: (e as Error)?.message || 'Falha ao assumir.' });
    } finally { setAtribuindo(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current.id, current.contatoId, current.respId, atribuindo, user?.id]);
  const devolver = useCallback(async () => {
    if (atribuindo || !current.id || !current.contatoId || !current.respId) return;
    setAtribuindo(true);
    const esperado = current.respId ?? null;
    setContacts((cur) => patchConversa(cur, current.id, { respId: null }));
    try {
      if (WA_REAL) await atribuirMut.mutateAsync({ contatoId: current.contatoId ?? '', destinoId: null, esperadoId: esperado, conversaId: current.id });
      aoAvisar({ tom: 'ok', texto: 'Atendimento devolvido para a fila' });
    } catch (e) {
      setContacts((cur) => patchConversa(cur, current.id, { respId: esperado }));
      aoAvisar({ tom: 'erro', texto: (e as Error)?.message || 'Falha ao devolver.' });
    } finally { setAtribuindo(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current.id, current.contatoId, current.respId, atribuindo]);
  const transferir = useCallback(async (destinoId: string, motivo: string) => {
    if (!motivo.trim()) { aoAvisar({ tom: 'erro', texto: 'Informe o motivo da transferência.' }); return false; }
    if (atribuindo || !current.id || !current.contatoId || !destinoId) return false;
    setAtribuindo(true);
    const esperado = current.respId ?? null;
    setContacts((cur) => patchConversa(cur, current.id, { respId: destinoId }));
    try {
      if (WA_REAL) await atribuirMut.mutateAsync({ contatoId: current.contatoId ?? '', destinoId, esperadoId: esperado, conversaId: current.id, motivo: motivo.trim() });
      aoAvisar({ tom: 'ok', texto: 'Atendimento transferido' });
      return true;
    } catch (e) {
      setContacts((cur) => patchConversa(cur, current.id, { respId: esperado }));
      aoAvisar({ tom: 'erro', texto: (e as Error)?.message || 'Falha ao transferir.' });
      return false;
    } finally { setAtribuindo(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current.id, current.respId, atribuindo]);

  /* ---------- ações do menu / painel ---------- */
  // marcar lida / arquivar / fixar: patch OTIMISTA no cache da lista (patchOtimistaLista) em vez
  // da recarga completa de antes; o UPDATE de conversas do realtime confirma (e o confirmar() no
  // sucesso recarimba contra busca que leu antes do commit). Erro = desfaz os campos tocados +
  // recarga completa (raro).
  const marcarLida = useCallback(async (lida: boolean) => {
    if (!current.id) return;
    if (!WA_REAL) { setContacts((cur) => patchConversa(cur, current.id, { unread: lida ? 0 : 1 })); return; }
    // mesma regra da RPC wa_marcar_lida: lida → 0; não lida → greatest(nao_lidas, 1)
    const otimista = patchOtimistaLista(qc, orgId, current.id, { unread: lida ? 0 : Math.max(current.unread ?? 0, 1) });
    try { await waMarcarLida(current.id, lida); otimista.confirmar(); }
    catch (e) { otimista.desfazer(); aoAvisar({ tom: 'erro', texto: (e as Error)?.message || 'Falha ao marcar.' }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current.id, current.unread, orgId]);
  const arquivar = useCallback(async (arq: boolean) => {
    if (!current.id) return;
    if (!WA_REAL) { setContacts((cur) => patchConversa(cur, current.id, { arquivada: arq })); aoAvisar({ tom: 'ok', texto: arq ? 'Conversa arquivada' : 'Conversa desarquivada' }); return; }
    const otimista = patchOtimistaLista(qc, orgId, current.id, { arquivada: arq });
    try { await waArquivar(current.id, arq); otimista.confirmar(); aoAvisar({ tom: 'ok', texto: arq ? 'Conversa arquivada' : 'Conversa desarquivada' }); }
    catch (e) { otimista.desfazer(); aoAvisar({ tom: 'erro', texto: (e as Error)?.message || 'Falha ao arquivar.' }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current.id, orgId]);
  // fixar/desfixar QUALQUER conversa (por id) — o pin de cada card manda o próprio id; o menu ⋯ usa a atual.
  // Otimista (o card já fica azul na hora); sem toast de sucesso (o estado azul é o feedback).
  const fixar = useCallback(async (fix: boolean, conversaId?: string) => {
    const id = conversaId ?? current.id;
    if (!id) return;
    if (!WA_REAL) { setContacts((cur) => patchConversa(cur, id, { fixada: fix })); return; }
    setContacts((cur) => patchConversa(cur, id, { fixada: fix }));   // otimista (local: pinta já)
    const otimista = patchOtimistaLista(qc, orgId, id, { fixada: fix });   // e no cache (a reconciliação não desfaz)
    try { await waFixar(id, fix); otimista.confirmar(); }
    catch (e) { setContacts((cur) => patchConversa(cur, id, { fixada: !fix })); otimista.desfazer(); aoAvisar({ tom: 'erro', texto: (e as Error)?.message || 'Falha ao fixar.' }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current.id, orgId]);
  /** patch local otimista de edição (nome/email/observações/responsável) — o await fica na página (acoes.atualizarContato). */
  const aplicarEdicaoLocal = useCallback((patch: Partial<WaContact>) => {
    if (current.id) setContacts((cur) => patchConversa(cur, current.id, patch));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current.id]);

  const iniciarNovaConversa = useCallback(async (canalId: string, telefone: string, nome: string): Promise<boolean> => {
    if (!WA_REAL) { aoAvisar({ tom: 'ok', texto: 'Disponível com o backend configurado' }); return false; }
    const r = await iniciarMut.mutateAsync({ canalId, telefone, nome: nome || undefined });
    // busca-alvo SÓ da conversa (antes: recarga completa da lista inteira) — já mesclada no cache
    // antes de selecionar. Se a busca falhar ou não trouxer a conversa, cai na recarga completa.
    tentadosRef.current.add(r.conversaId);
    const ok = await buscarConversasAgora(orgId, { ids: [r.conversaId] });
    const naLista = (qc.getQueryData<WaContact[]>(['wa-conversas', orgId]) ?? []).some((c) => c.id === r.conversaId);
    if (!ok || !naLista) await live.refetch();
    canalManualRef.current = canalId;
    setReplyCanalId(canalId);
    selecaoUsuarioRef.current = r.conversaId;
    setCurrentId(r.conversaId);
    if (r.reused) aoAvisar({ tom: 'ok', texto: 'Conversa existente aberta.' });
    return true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  /* ---------- relógio de 1min (tempos relativos) ---------- */
  const [relogioMs, setRelogioMs] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setRelogioMs(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  return {
    demo, contacts, setContacts, current, currentId,
    selectContact, selecionarPorDeepLink,
    live, msgsQ, relogioMs,
    realCanais, canalSel, replyCanalId, replyChip, onReplyCanal, onReplyChip,
    canalConectado, canalIndisponivel, canalRestrito, semDestino, optout, bloqueados,
    envioSaude: envioSaudeQ.data?.estado ?? 'ok',
    higiene, higieneBloqueia, decNome, donoEfetivo, bloquearPorHigiene, adiarNome, nomeNaoInformado, adiando: adiarMut.isPending,
    replyTo, setReplyTo,
    sendMsg, retryMsg, removerFalha, retryId, removendoId,
    enviarImagem, enviarVideo, enviarAudio, enviarDocumento, enviarContato,
    scriptEnviarEtapa, scriptEnviarMidia,
    atribuindo, assumir, devolver, transferir,
    marcarLida, arquivar, fixar, aplicarEdicaoLocal, iniciarNovaConversa,
  };
}
