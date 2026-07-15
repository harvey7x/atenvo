// Classificação de saúde de ENTREGA (outbound) a partir dos ACKs reais do WhatsApp (messages.update).
// PURA (sem Deno/DB) → compartilhada com os testes vitest. Não decide envio; só classifica o estado.
//
// Regras (v2 — suavizadas p/ não confundir falha transitória com restrição real):
//  - ERROR -> incrementa o contador; status vira 'instavel' e SÓ escala p/ 'restrito' após
//    LIMITE_RESTRITO (3) erros SEM entrega externa no meio (o contador zera em cada entrega real).
//    Assim 1 ERROR transitório NÃO grita 'restrito' (era o problema: sessão zumbi dava 1 ERROR).
//  - DELIVERY_ACK / READ em saída para destino EXTERNO -> recupera 'ok' e zera o contador.
//  - self-send / destino não-externo NÃO recupera o status (self não prova entrega a cliente).

/** Nº de ERRORs de entrega (sem entrega externa no meio) para escalar de 'instavel' p/ 'restrito'. */
export const LIMITE_RESTRITO = 3;

export type EntregaStatus = 'ok' | 'instavel' | 'restrito' | 'desconhecido';

export type EntregaEvento =
  | { kind: 'error'; temStub: boolean }              // messages.update status=ERROR
  | { kind: 'delivered' | 'read'; externo: boolean }; // DELIVERY_ACK / READ (externo = destino real, não self)

export interface EstadoEntrega { status: EntregaStatus; erros: number }
/** Patch a aplicar no canal; null = nada a mudar. `marcarErroEm` sinaliza gravar entrega_ultimo_erro_em=now. */
export interface PatchEntrega { entrega_status: EntregaStatus; entrega_erros_recentes: number; marcarErroEm: boolean }

export function classificarEntrega(ev: EntregaEvento, atual: EstadoEntrega): PatchEntrega | null {
  if (ev.kind === 'error') {
    const erros = (atual.erros ?? 0) + 1;
    // 'instavel' primeiro; só vira 'restrito' quando acumular LIMITE_RESTRITO erros sem entrega no meio.
    // (o temStub é registrado como metadado pelo webhook; a ESCALADA é por contagem, não por 1 evento.)
    const status: EntregaStatus = erros >= LIMITE_RESTRITO ? 'restrito' : 'instavel';
    return { entrega_status: status, entrega_erros_recentes: erros, marcarErroEm: true };
  }
  // delivered / read
  if (!ev.externo) return null;               // self-send não conta como prova de entrega
  if (atual.status === 'ok' && (atual.erros ?? 0) === 0) return null; // já ok, nada muda
  return { entrega_status: 'ok', entrega_erros_recentes: 0, marcarErroEm: false };
}

/** Mapeia o status cru do provedor (messages.update) para o evento de entrega, ou null se irrelevante. */
export function eventoDoStatus(statusProvedor: string, temStub: boolean, externo: boolean): EntregaEvento | null {
  const s = (statusProvedor || '').toUpperCase();
  if (s === 'ERROR') return { kind: 'error', temStub };
  if (s === 'DELIVERY_ACK') return { kind: 'delivered', externo };
  if (s === 'READ' || s === 'PLAYED') return { kind: 'read', externo };
  return null; // PENDING/SERVER_ACK: aceitação, não entrega — não altera saúde de entrega
}
