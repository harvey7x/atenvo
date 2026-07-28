import type { WaContact, WaMessage } from '@/data/whatsappDemo';

/* ------------------------------------------------------------------
   Funções PURAS da máquina do inbox (extraídas de src/pages/
   WhatsApp.tsx — comportamento byte a byte; ver useInboxWhatsApp).
   Puras para serem testáveis sem renderHook: a suíte cobre a
   reconciliação lista×histórico e o ciclo otimista de envio.
   ------------------------------------------------------------------ */

/** cid da bolha otimista (v1 L684): tmp_<ts36><5 aleatórios>. */
export function novoCid(agoraMs: number, aleatorio = Math.random()): string {
  return 'tmp_' + agoraMs.toString(36) + aleatorio.toString(36).slice(2, 7);
}

/** Corpo exibido na bolha local (v1 L682): assinatura `*Nome:*\n<texto>`; o servidor recebe o texto cru. */
export function montarCorpoAssinado(texto: string, assinaturaNome: string | null | undefined): string {
  return assinaturaNome ? `*${assinaturaNome}:*\n${texto}` : texto;
}

/** Reconciliação da LISTA (v1 effect L251-260): o payload da lista traz só as
 *  últimas 10 msgs (LATERAL) — a lista SUBSTITUI todas as conversas, MAS a
 *  conversa ABERTA recebe de volta o histórico completo já carregado.
 *  Sem histórico carregado, substitui tudo cru. NUNCA preserva bolhas
 *  otimistas: toda reconciliação é substituição (o refetch de wa-msgs traz
 *  a linha real e a bolha cid morre por substituição, jamais duplica). */
export function reconciliarLista(
  liveData: WaContact[],
  abertaId: string | null,
  historicoAberta: WaMessage[] | null | undefined,
): WaContact[] {
  if (!historicoAberta?.length || !abertaId) return liveData;
  return liveData.map((c) => (c.id === abertaId ? { ...c, msgs: historicoAberta } : c));
}

/** Hidratação do histórico completo na conversa aberta (v1 effect L263-266). */
export function hidratarHistorico(contacts: WaContact[], conversaId: string, historico: WaMessage[]): WaContact[] {
  return contacts.map((c) => (c.id === conversaId ? { ...c, msgs: historico } : c));
}

/** Bolha otimista de envio (v1 L685): append + last. */
export function aplicarEnvioOtimista(
  contacts: WaContact[],
  conversaId: string,
  bolha: WaMessage,
  last: string,
): WaContact[] {
  return contacts.map((c) => (c.id === conversaId ? { ...c, last, msgs: [...c.msgs, bolha] } : c));
}

/** marcarFalha (v1 L691-692): match por CID e status ainda 'pendente' —
 *  não sobrescreve se o servidor já reconciliou a bolha. */
export function aplicarFalha(contacts: WaContact[], conversaId: string, cid: string, erro: string): WaContact[] {
  return contacts.map((c) =>
    c.id === conversaId
      ? { ...c, msgs: c.msgs.map((x) => (x.cid === cid && x.status === 'pendente' ? { ...x, status: 'falhou', erro } : x)) }
      : c,
  );
}

/** Retry otimista (v1 L716): a MESMA bolha (id real) volta a pendente. */
export function aplicarRetry(contacts: WaContact[], conversaId: string, mensagemId: string): WaContact[] {
  return contacts.map((c) =>
    c.id === conversaId
      ? { ...c, msgs: c.msgs.map((x) => (x.id === mensagemId ? { ...x, status: 'pendente', erro: undefined } : x)) }
      : c,
  );
}

/** Remoção local da mensagem com falha (v1 L737) — após a RPC confirmar. */
export function removerMensagemLocal(contacts: WaContact[], conversaId: string, mensagemId: string): WaContact[] {
  return contacts.map((c) => (c.id === conversaId ? { ...c, msgs: c.msgs.filter((x) => x.id !== mensagemId) } : c));
}

/** Patch raso otimista numa conversa (assumir/transferir/status/etiquetas/edição — v1 L813/L864/L888/L895/L949). */
export function patchConversa(contacts: WaContact[], conversaId: string, patch: Partial<WaContact>): WaContact[] {
  return contacts.map((c) => (c.id === conversaId ? { ...c, ...patch } : c));
}

/** Canal de resposta automático (v1 L394-408): último canal recebido → canal
 *  de origem → vazio. Inclui canais desconectados (o aviso trata depois). */
export function canalAutomatico(
  ultimoCanalId: string | null | undefined,
  canalOrigemId: string | null | undefined,
  idsCanaisReais: string[],
): string {
  if (ultimoCanalId && idsCanaisReais.includes(ultimoCanalId)) return ultimoCanalId;
  if (canalOrigemId && idsCanaisReais.includes(canalOrigemId)) return canalOrigemId;
  return '';
}

/** Seleção válida após reconciliar a lista (v1 L258): mantém o id se ainda
 *  existe; senão cai para a primeira conversa. */
export function selecaoValida(idAtual: string, lista: WaContact[]): string {
  return idAtual && lista.some((c) => c.id === idAtual) ? idAtual : (lista[0]?.id ?? '');
}
