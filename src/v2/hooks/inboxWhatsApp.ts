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

/** A bolha otimista está COBERTA quando o histórico do servidor já contém a
 *  linha real correspondente: pelo id devolvido pelo envio (marcarIdReal), pelo
 *  anexo (path é único por upload) ou por conteúdo idêntico dentro da janela —
 *  o servidor grava o MESMO corpo assinado que a bolha exibe. */
export function bolhaCoberta(servidor: WaMessage[], p: WaMessage, janelaMs = 120_000): boolean {
  const pTs = p.tsISO ? new Date(p.tsISO).getTime() : null;
  return servidor.some((h) => {
    if (p.idReal && h.id === p.idReal) return true;
    if (h.dir !== 'out') return false;
    if (p.anexoPath) return h.anexoPath === p.anexoPath;
    const hTs = h.tsISO ? new Date(h.tsISO).getTime() : null;
    if (pTs == null || hTs == null || Math.abs(hTs - pTs) > janelaMs) return false;
    if (p.contato) return !!h.contato && h.contato.telefone === p.contato.telefone;
    return (h.tipo ?? 'texto') === 'texto' && (h.text ?? '') === (p.text ?? '');
  });
}

/** Mescla o histórico do servidor com as bolhas otimistas PENDENTES ainda não
 *  cobertas (ficam no fim: são as mais recentes). Sem isto, um refetch que
 *  partiu ANTES do INSERT sobrescrevia a conversa e a mensagem recém-enviada
 *  "piscava" (sumia e voltava). Bolha 'falhou' local (sem linha no banco)
 *  continua NÃO preservada — some no refetch seguinte, como sempre. */
export function mesclarPendentes(servidor: WaMessage[], locais: WaMessage[] | undefined): WaMessage[] {
  const pend = (locais ?? []).filter((x) => x.cid && x.status === 'pendente' && !bolhaCoberta(servidor, x));
  return pend.length ? [...servidor, ...pend] : servidor;
}

/** Reconciliação da LISTA (v1 effect L251-260): o payload da lista traz só as
 *  últimas 10 msgs (LATERAL) — a lista substitui as conversas, MAS: a conversa
 *  ABERTA recebe de volta o histórico completo já carregado, e bolhas otimistas
 *  PENDENTES sobrevivem à substituição (mesclarPendentes — morrem quando a
 *  linha real chega, jamais duplicam). Conversa com pendente preservada mantém
 *  também o card local (preview/horário/posição): está à frente do servidor. */
export function reconciliarLista(
  atuais: WaContact[],
  liveData: WaContact[],
  abertaId: string | null,
  historicoAberta: WaMessage[] | null | undefined,
): WaContact[] {
  const porId = new Map(atuais.map((c) => [c.id, c]));
  return liveData.map((c) => {
    const local = porId.get(c.id);
    const base = c.id === abertaId && historicoAberta?.length ? historicoAberta : c.msgs;
    const msgs = mesclarPendentes(base, local?.msgs);
    const temPendente = !!local && msgs !== base;
    if (!temPendente) return msgs === c.msgs ? c : { ...c, msgs };
    return { ...c, msgs, last: local.last, time: local.time, lastAtMs: local.lastAtMs, aguardando: local.aguardando, aguardandoDesde: local.aguardandoDesde };
  });
}

/** Hidratação do histórico completo na conversa aberta (v1 effect L263-266),
 *  preservando bolhas pendentes ainda não cobertas pelo servidor. */
export function hidratarHistorico(contacts: WaContact[], conversaId: string, historico: WaMessage[]): WaContact[] {
  return contacts.map((c) => (c.id === conversaId ? { ...c, msgs: mesclarPendentes(historico, c.msgs) } : c));
}

/** Bolha otimista de envio (v1 L685): append + last — e o CARD inteiro acompanha
 *  na hora (horário, posição na fila via lastAtMs, sai de "aguardando resposta"),
 *  sem esperar o refetch pesado da lista. */
export function aplicarEnvioOtimista(
  contacts: WaContact[],
  conversaId: string,
  bolha: WaMessage,
  last: string,
): WaContact[] {
  const at = bolha.tsISO ? new Date(bolha.tsISO).getTime() : Date.now();
  return contacts.map((c) => (c.id === conversaId
    ? { ...c, last, time: bolha.time, lastAtMs: at, aguardando: false, aguardandoDesde: null, msgs: [...c.msgs, bolha] }
    : c));
}

/** Grava na bolha otimista o id REAL devolvido pelo envio — a partir daí a
 *  reconciliação mata a bolha por id (à prova de textos repetidos). */
export function marcarIdReal(contacts: WaContact[], conversaId: string, cid: string, idReal: string | null): WaContact[] {
  if (!idReal) return contacts;
  return contacts.map((c) => (c.id === conversaId
    ? { ...c, msgs: c.msgs.map((x) => (x.cid === cid ? { ...x, idReal } : x)) }
    : c));
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

/** Patch raso numa bolha otimista (por cid) — ex.: anexoPath ao concluir o upload da mídia. */
export function patchBolha(contacts: WaContact[], conversaId: string, cid: string, patch: Partial<WaMessage>): WaContact[] {
  return contacts.map((c) => (c.id === conversaId
    ? { ...c, msgs: c.msgs.map((x) => (x.cid === cid ? { ...x, ...patch } : x)) }
    : c));
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
