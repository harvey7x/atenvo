import type { WaContact, WaMessage } from '@/data/whatsappDemo';
import { previewUltimaMensagem } from '@/lib/conversaEtiquetas';

/* ------------------------------------------------------------------
   Patches PUROS aplicados aos caches do inbox a partir do payload do
   Realtime (postgres_changes). O payload já traz a linha inteira —
   aplicá-la direto elimina o vão invalidar→refetch (a lista custa
   segundos) entre o evento e a tela. Os refetches coalescidos seguem
   vivos como backstop: qualquer divergência destes patches parciais
   é corrigida pelo fetch completo logo atrás.
   ------------------------------------------------------------------ */

const tsMs = (m: WaMessage): number => (m.tsISO ? new Date(m.tsISO).getTime() : 0);

/** Mensagem real (conta para preview/aguardando) — sistema e nota interna ficam de fora. */
const ehReal = (tipo?: string | null): boolean => tipo !== 'sistema' && tipo !== 'nota_interna';

/** Upsert de UMA mensagem no histórico da conversa aberta: substitui por id
 *  (UPDATE de status: ✓→✓✓→lida) ou insere mantendo a ordem cronológica. */
export function upsertHistorico(hist: WaMessage[], nova: WaMessage): WaMessage[] {
  if (nova.id && hist.some((m) => m.id === nova.id)) return hist.map((m) => (m.id === nova.id ? nova : m));
  const out = [...hist, nova];
  out.sort((a, b) => tsMs(a) - tsMs(b));
  return out;
}

/** Remove uma mensagem do histórico (DELETE do realtime traz só a PK). */
export function removerDoHistorico(hist: WaMessage[], id: string): WaMessage[] {
  return hist.some((m) => m.id === id) ? hist.filter((m) => m.id !== id) : hist;
}

/** Reflete uma mensagem nova no CARD da lista: preview, horário, posição
 *  (lastAtMs ordena a fila) e o estado aguardando/não-lidas. Conversa fora
 *  da lista (recém-criada, sem embeds no payload) fica para o refetch.
 *  `contaNaoLida` só no INSERT — UPDATE (ACK de status, retry) não resoma. */
export function patchListaMensagem(lista: WaContact[], conversaId: string, m: WaMessage, contaNaoLida: boolean): WaContact[] {
  if (!ehReal(m.tipo)) return lista;
  const at = tsMs(m) || Date.now();
  return lista.map((c) => {
    if (c.id !== conversaId) return c;
    if ((c.lastAtMs ?? 0) > at) return c;                       // evento atrasado não regride o card
    const base = {
      ...c,
      last: previewUltimaMensagem({ tipo: m.tipo, texto: m.text || null }),
      time: m.time,
      lastAtMs: at,
    };
    return m.dir === 'in'
      ? { ...base, unread: (c.unread ?? 0) + (contaNaoLida ? 1 : 0), aguardando: !!c.aberta, aguardandoDesde: c.aberta ? (m.tsISO ?? c.aguardandoDesde ?? null) : c.aguardandoDesde ?? null }
      : { ...base, aguardando: false, aguardandoDesde: null };
  });
}

/** Linha crua de `conversas` vinda do payload (sem embeds). */
export interface RowConversa {
  id?: string;
  nao_lidas?: number | null;
  status?: string | null;
  ultima_interacao_em?: string | null;
  arquivada_em?: string | null;
  fixada_em?: string | null;
  silenciada_ate?: string | null;
  precisa_humano?: boolean | null;
  atendente_id?: string | null;
  status_id?: string | null;
  etiquetas?: string[] | null;
}

const STATUS_LABEL: Record<string, string> = {
  aberta: 'Aberta', em_atendimento: 'Em atendimento', pendente: 'Pendente', resolvida: 'Resolvida', fechada: 'Fechada',
};
const hhmm = (iso?: string | null): string => {
  if (!iso) return '';
  const d = new Date(iso);
  return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
};

/** UPDATE em `conversas` → patch dos campos escalares do card (lida/arquivada/
 *  fixada/status/etiquetas…). Campos que dependem de embeds (nome, telefone,
 *  responsável, canal) ficam para o refetch coalescido. */
export function patchListaConversa(lista: WaContact[], row: RowConversa): WaContact[] {
  if (!row.id) return lista;
  return lista.map((c) => {
    if (c.id !== row.id) return c;
    const p: Partial<WaContact> = {};
    if (row.nao_lidas !== undefined) p.unread = row.nao_lidas ?? 0;
    if (row.arquivada_em !== undefined) p.arquivada = !!row.arquivada_em;
    if (row.fixada_em !== undefined) p.fixada = !!row.fixada_em;
    if (row.silenciada_ate !== undefined) p.silenciada = !!row.silenciada_ate && new Date(row.silenciada_ate).getTime() > Date.now();
    if (row.precisa_humano !== undefined) p.precisaHumano = !!row.precisa_humano;
    if (row.atendente_id !== undefined) p.atendenteId = row.atendente_id ?? null;
    if (row.status_id !== undefined) p.statusId = row.status_id ?? null;
    if (row.etiquetas !== undefined && row.etiquetas !== null) p.tags = row.etiquetas;
    if (row.status) {
      p.status = STATUS_LABEL[row.status] ?? row.status;
      p.aberta = row.status !== 'resolvida' && row.status !== 'fechada';
      if (!p.aberta) { p.aguardando = false; p.aguardandoDesde = null; }
    }
    if (row.ultima_interacao_em) {
      const at = new Date(row.ultima_interacao_em).getTime();
      if (at >= (c.lastAtMs ?? 0)) { p.lastAtMs = at; p.time = hhmm(row.ultima_interacao_em); }
    }
    return { ...c, ...p };
  });
}
