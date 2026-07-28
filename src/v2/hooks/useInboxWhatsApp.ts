import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  WA_REAL, useWaConversations, useWaMensagens, useSendWaMessage, useAtribuirAtendimento,
  useWaCanais, useWaCanalEnvioSaude, useIniciarConversaWa,
  waMarcarLida, waArquivar, removerMensagemFalha, subirMidiaWa,
} from '@/data/whatsapp';
import { WA_CONTACTS, type WaContact, type WaMessage } from '@/data/whatsappDemo';
import { useHigieneConversa, useRegistrarAdiamento, HIGIENE_VAZIO } from '@/data/higiene';
import { decidirDono, decidirNome, estadoHigiene, conversaAtiva } from '@/lib/higieneConversa';
import { responsavelEfetivo } from '@/lib/conversaEtiquetas';
import { HIGIENE_CORTE_ISO, HIGIENE_DIAS_ADAPTACAO } from '@/config/higiene';
import { useAuth } from '@/context/AuthContext';
import { useOrg } from '@/context/OrgContext';
import {
  aplicarEnvioOtimista, aplicarFalha, aplicarRetry, canalAutomatico, hidratarHistorico,
  montarCorpoAssinado, novoCid, patchConversa, reconciliarLista, removerMensagemLocal, selecaoValida,
} from './inboxWhatsApp';

/* ------------------------------------------------------------------
   useInboxWhatsApp — a máquina do inbox extraída de src/pages/
   WhatsApp.tsx (as ~600 linhas inline), comportamento 100% IDÊNTICO:
   mesmo timing (timeout 25s, scroll 220ms, coalesce fica no data
   layer), mesma ordem de reconciliação (lista substitui tudo e devolve
   o histórico completo à conversa aberta; histórico substitui inteiro;
   bolha otimista morre por substituição, nunca duplica) e mesmo retry
   (retry_mensagem_id na MESMA bolha, sem assinatura e sem timeout).
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
}) {
  const { aoAvisar } = opts;
  const { user } = useAuth();
  const { currentOrg } = useOrg();
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

  /* reconciliação da LISTA (v1 L251-260) — dep SÓ em live.data; a conversa
     aberta recebe de volta o histórico completo via refs (sem loop) */
  useEffect(() => {
    if (!WA_REAL || !live.data) return;
    const abertaId = currentIdRef.current;
    const hist = historicoRef.current;
    setContacts(reconciliarLista(live.data, abertaId, hist));
    setCurrentId((id) => selecaoValida(id, live.data!));
  }, [live.data]);

  /* hidratação do histórico completo (v1 L263-266) */
  useEffect(() => {
    if (!WA_REAL || !msgsQ.data || !currentId) return;
    setContacts((cur) => hidratarHistorico(cur, currentId, msgsQ.data!));
  }, [msgsQ.data, currentId]);

  const current = contacts.find((c) => c.id === currentId) ?? contacts[0] ?? EMPTY_CONTACT;

  /* ---------- marcar-lida (v1 L340-382) ---------- */
  const selecaoUsuarioRef = useRef<string | null>(null);
  const marcandoLeituraRef = useRef(false);
  const markCurrentRead = useCallback(() => {
    if (!WA_REAL || !currentId) return;
    if (selecaoUsuarioRef.current !== currentId) return;      // restauração/programática NÃO marca
    if (document.visibilityState !== 'visible') return;
    if (!document.hasFocus()) return;
    if (marcandoLeituraRef.current) return;
    const c = contacts.find((x) => x.id === currentId);
    if (!c || (c.unread ?? 0) <= 0) return;
    marcandoLeituraRef.current = true;
    waMarcarLida(currentId, true)
      .then(() => void live.refetch())
      .catch((e) => console.warn('[wa] marcar lida falhou:', String((e as Error)?.message ?? e).slice(0, 80)))
      .finally(() => { marcandoLeituraRef.current = false; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId, contacts]);
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
  const canalRestrito = WA_REAL && !!canalSel && (canalSel.envioRestrito || canalSel.entregaStatus === 'restrito') && canalSel.status === 'conectado';
  const envioSaudeQ = useWaCanalEnvioSaude(WA_REAL ? canalSel?.id ?? null : null);
  const semDestino = WA_REAL && !!current.semDestino;

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
    if (higiene.dono !== 'livre') aoAvisar({ tom: 'erro', texto: 'Esta conversa não tem responsável. Clique em "Assumir atendimento" para responder.' });
    else aoAvisar({ tom: 'erro', texto: 'Preencha o nome completo do cliente para continuar respondendo.' });
    return true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [higieneBloqueia, higiene.dono]);

  const adiarNome = useCallback(async () => {
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
    try {
      await adiarMut.mutateAsync({ conversaId: current.id, tipo: 'nome_nao_informado' });
      aoAvisar({ tom: 'ok', texto: 'Liberado por 24h. O aviso volta depois — registre o nome assim que o cliente informar.' });
    } catch (e) { aoAvisar({ tom: 'erro', texto: (e as Error)?.message || 'Falha ao registrar.' }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current.id]);

  /* ---------- reply (quoted) ---------- */
  const [replyTo, setReplyTo] = useState<ReplyTo | null>(null);

  /* ---------- envio (v1 L669-743) ---------- */
  const enviandoRef = useRef(false);
  const [retryId, setRetryId] = useState<string | null>(null);
  const [removendoId, setRemovendoId] = useState<string | null>(null);

  const sendMsg = useCallback((draft: string, assinaturaNome: string | null, aoAceitar: () => void) => {
    const v = draft.trim();
    if (!v) return;
    if (enviandoRef.current) return;
    if (WA_REAL && !currentId) return;
    if (canalRestrito) { aoAvisar({ tom: 'erro', texto: 'O número deste canal está com restrição no WhatsApp e está indisponível para envio. Selecione outro canal.' }); return; }
    if (canalIndisponivel) { aoAvisar({ tom: 'erro', texto: 'Este número está desconectado. Reconecte em Integrações para enviar.' }); return; }
    if (semDestino) { aoAvisar({ tom: 'erro', texto: 'Vincule um número confirmado para responder.' }); return; }
    if (bloquearPorHigiene()) return;                          // higiene NÃO vale para retry (v1 L677)
    const now = new Date();
    const hh = ('0' + now.getHours()).slice(-2) + ':' + ('0' + now.getMinutes()).slice(-2);
    const corpo = montarCorpoAssinado(v, assinaturaNome);
    const cid = novoCid(now.getTime());
    const replyEnvio = replyTo ? { id: replyTo.id, idExt: replyTo.idExt, fromMe: replyTo.fromMe, preview: { remetente: replyTo.remetente, tipo: replyTo.tipo, texto: replyTo.texto } } : undefined;
    const quotedBolha = replyTo ? { remetente: replyTo.remetente, tipo: replyTo.tipo, texto: replyTo.texto } : undefined;
    setContacts((cur) => aplicarEnvioOtimista(cur, currentId, { dir: 'out', text: corpo, time: hh, status: 'pendente', cid, quoted: quotedBolha }, v));
    aoAceitar();                                               // limpa o draft na página
    if (!WA_REAL) { aoAvisar({ tom: 'ok', texto: 'Mensagem enviada' }); setReplyTo(null); return; }
    enviandoRef.current = true;
    const convAlvo = currentId;
    const marcarFalha = (erro: string) => setContacts((cur) => aplicarFalha(cur, convAlvo, cid, erro));
    const to = window.setTimeout(() => marcarFalha('Sem confirmação de envio a tempo. Tente novamente.'), 25_000);
    sendMut.mutate(
      { conversaId: currentId, text: v, canalId: replyCanalId || current.canalId, assinaturaNome: assinaturaNome || undefined, replyTo: replyEnvio },
      {
        onError: (e) => { window.clearTimeout(to); const msg = (e as Error)?.message || 'Falha no envio.'; marcarFalha(msg); aoAvisar({ tom: 'erro', texto: msg }); },
        onSuccess: () => { window.clearTimeout(to); setReplyTo(null); },
        onSettled: () => { enviandoRef.current = false; },
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId, canalRestrito, canalIndisponivel, semDestino, bloquearPorHigiene, replyTo, replyCanalId, current.canalId]);

  const retryMsg = useCallback((m: WaMessage) => {
    if (!m.id || !currentId || retryId) return;
    if (canalRestrito) { aoAvisar({ tom: 'erro', texto: 'O número deste canal está com restrição no WhatsApp e está indisponível para reenviar. Selecione outro canal.' }); return; }
    if (canalIndisponivel) { aoAvisar({ tom: 'erro', texto: 'Este número está desconectado. Reconecte em Integrações para enviar.' }); return; }
    if (semDestino) { aoAvisar({ tom: 'erro', texto: 'Vincule um número confirmado para responder.' }); return; }
    setRetryId(m.id);
    setContacts((cur) => aplicarRetry(cur, currentId, m.id!));
    if (!WA_REAL) { setRetryId(null); return; }
    sendMut.mutate(
      { conversaId: currentId, text: m.text ?? '', canalId: replyCanalId || current.canalId, retryMensagemId: m.id },
      {
        onError: (e) => aoAvisar({ tom: 'erro', texto: (e as Error)?.message || 'Falha no reenvio.' }),
        onSettled: () => setRetryId(null),
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId, retryId, canalRestrito, canalIndisponivel, semDestino, replyCanalId, current.canalId]);

  const removerFalha = useCallback(async (m: WaMessage) => {
    if (!m.id || removendoId) return;
    setRemovendoId(m.id);
    try {
      if (WA_REAL) await removerMensagemFalha(m.id);
      setContacts((cur) => removerMensagemLocal(cur, currentId, m.id!));
      aoAvisar({ tom: 'ok', texto: 'Mensagem com falha removida.' });
    } catch (e) {
      aoAvisar({ tom: 'erro', texto: (e as Error)?.message || 'Falha ao remover.' });
    } finally { setRemovendoId(null); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId, removendoId]);

  /* mídia (upload ANTES do envio; sem bolha otimista — v1 L745-784) */
  const guardaMidia = () => {
    if (higiene.dono !== 'livre' && higieneBloqueia) throw new Error('Assuma o atendimento para responder.');
    if (higiene.dono === 'livre' && higieneBloqueia) throw new Error('Preencha o nome completo do cliente para responder.');
  };
  const replyPayload = () => (replyTo ? { id: replyTo.id, idExt: replyTo.idExt, fromMe: replyTo.fromMe, preview: { remetente: replyTo.remetente, tipo: replyTo.tipo, texto: replyTo.texto } } : undefined);
  const enviarImagem = useCallback(async (file: File, caption: string) => {
    guardaMidia();
    if (!WA_REAL) { aoAvisar({ tom: 'ok', texto: 'Mensagem enviada' }); return; }
    const up = await subirMidiaWa(currentOrg.id, file);
    await sendMut.mutateAsync({ conversaId: currentId, canalId: replyCanalId || current.canalId, midiaPath: up.path, midiaTipo: 'imagem', midiaMime: up.mime, midiaNome: up.nome, midiaTamanho: up.tamanho, text: caption || undefined, replyTo: replyPayload() });
    setReplyTo(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId, replyCanalId, current.canalId, replyTo, higieneBloqueia, higiene.dono]);
  const enviarAudio = useCallback(async (blob: Blob, mime: string, ext: string, diag?: Record<string, unknown>) => {
    guardaMidia();
    if (!blob.size) throw new Error('Áudio vazio.');
    if (!WA_REAL) { aoAvisar({ tom: 'ok', texto: 'Mensagem enviada' }); return; }
    const file = new File([blob], `audio.${ext}`, { type: mime });
    const up = await subirMidiaWa(currentOrg.id, file);
    const origemAudio = diag?.origem === 'arquivo_anexado' ? 'arquivo_anexado' : 'gravacao_painel';
    await sendMut.mutateAsync({ conversaId: currentId, canalId: replyCanalId || current.canalId, midiaPath: up.path, midiaTipo: 'audio', midiaMime: up.mime, midiaNome: up.nome, midiaTamanho: up.tamanho, audioDiag: diag, origemAudio, replyTo: replyPayload() });
    setReplyTo(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId, replyCanalId, current.canalId, replyTo, higieneBloqueia, higiene.dono]);
  const enviarDocumento = useCallback(async (file: File, caption: string) => {
    guardaMidia();
    if (!WA_REAL) { aoAvisar({ tom: 'ok', texto: 'Mensagem enviada' }); return; }
    const up = await subirMidiaWa(currentOrg.id, file);
    await sendMut.mutateAsync({ conversaId: currentId, canalId: replyCanalId || current.canalId, midiaPath: up.path, midiaTipo: 'documento', midiaMime: up.mime, midiaNome: up.nome, midiaTamanho: up.tamanho, text: caption || undefined, replyTo: replyPayload() });
    setReplyTo(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId, replyCanalId, current.canalId, replyTo, higieneBloqueia, higiene.dono]);

  /* ---------- atribuição (v1 L806-867) — otimista com rollback ---------- */
  const [atribuindo, setAtribuindo] = useState(false);
  const assumir = useCallback(async () => {
    if (atribuindo || !current.id) return;
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
    if (atribuindo || !current.id) return;
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
  }, [current.id, current.respId, atribuindo]);
  const transferir = useCallback(async (destinoId: string, motivo: string) => {
    if (!motivo.trim()) { aoAvisar({ tom: 'erro', texto: 'Informe o motivo da transferência.' }); return false; }
    if (atribuindo || !current.id) return false;
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
  const marcarLida = useCallback(async (lida: boolean) => {
    if (!current.id) return;
    if (!WA_REAL) { setContacts((cur) => patchConversa(cur, current.id, { unread: lida ? 0 : 1 })); return; }
    try { await waMarcarLida(current.id, lida); await live.refetch(); }
    catch (e) { aoAvisar({ tom: 'erro', texto: (e as Error)?.message || 'Falha ao marcar.' }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current.id]);
  const arquivar = useCallback(async (arq: boolean) => {
    if (!current.id) return;
    if (!WA_REAL) { setContacts((cur) => patchConversa(cur, current.id, { arquivada: arq })); aoAvisar({ tom: 'ok', texto: arq ? 'Conversa arquivada' : 'Conversa desarquivada' }); return; }
    try { await waArquivar(current.id, arq); await live.refetch(); aoAvisar({ tom: 'ok', texto: arq ? 'Conversa arquivada' : 'Conversa desarquivada' }); }
    catch (e) { aoAvisar({ tom: 'erro', texto: (e as Error)?.message || 'Falha ao arquivar.' }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current.id]);
  /** patch local otimista de edição (nome/email/observações/responsável) — o await fica na página (acoes.atualizarContato). */
  const aplicarEdicaoLocal = useCallback((patch: Partial<WaContact>) => {
    if (current.id) setContacts((cur) => patchConversa(cur, current.id, patch));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current.id]);

  const iniciarNovaConversa = useCallback(async (canalId: string, telefone: string, nome: string): Promise<boolean> => {
    if (!WA_REAL) { aoAvisar({ tom: 'ok', texto: 'Disponível com o backend configurado' }); return false; }
    const r = await iniciarMut.mutateAsync({ canalId, telefone, nome: nome || undefined });
    await live.refetch();
    canalManualRef.current = canalId;
    setReplyCanalId(canalId);
    selecaoUsuarioRef.current = r.conversaId;
    setCurrentId(r.conversaId);
    if (r.reused) aoAvisar({ tom: 'ok', texto: 'Conversa existente aberta.' });
    return true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    canalConectado, canalIndisponivel, canalRestrito, semDestino,
    envioSaude: envioSaudeQ.data?.estado ?? 'ok',
    higiene, higieneBloqueia, decNome, donoEfetivo, bloquearPorHigiene, adiarNome, nomeNaoInformado,
    replyTo, setReplyTo,
    sendMsg, retryMsg, removerFalha, retryId, removendoId,
    enviarImagem, enviarAudio, enviarDocumento,
    atribuindo, assumir, devolver, transferir,
    marcarLida, arquivar, aplicarEdicaoLocal, iniciarNovaConversa,
  };
}
