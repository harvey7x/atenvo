import type { WaContact, WaMessage, WaUltimoCanal } from '@/data/whatsappDemo';
import { previewUltimaMensagem, type OppStatus } from '@/lib/conversaEtiquetas';

/* ------------------------------------------------------------------
   Realtime do inbox SEM recarga completa — funções PURAS.

   O canal wa-<org> traz a linha inteira de mensagens/conversas/contatos.
   Cada evento é ROTEADO (rotearEvento):
     (a) o patch cobre tudo → só o patch no cache (ACK, lida, arquivada…);
     (b) o patch não cobre (conversa nova, mensagem de conversa fora da
         lista, contato alterado, conversa que mudou de contato…) → o id
         vai para a fila de BUSCA-ALVO: busca SÓ essas linhas com o MESMO
         select/mapConversa/etapa/IA da carga completa e mescla (upsert por
         id, NUNCA remove);
     (c) DELETE de mensagem que é a última do card → busca-alvo;
     (d) o que não dá para tratar (payload sem id, DELETE de conversa,
         tipo desconhecido, erro) → recarga completa.
   Mensagem nova também pede a busca-alvo da conversa (traz etapa/IA
   frescas com a palavra do banco).
   ETAPA: `oportunidades` está na publication e TEM assinatura no canal —
   INSERT/UPDATE vira busca-alvo por contato_id (a busca traz TODAS as
   opps do contato: ganho grudento). Mover no Kanban (ganho, etapa nova)
   chega em ~1 s nas outras abas.
   IA: `ia_sessoes` está FORA da publication (assinar tabela fora dela
   derruba o canal inteiro em silêncio) → o motor relê o estado de IA
   enxuto a cada 60 s com a aba visível e aplica só as diferenças.
   BACKSTOP: o refetchInterval da query é reiniciado por TODO setQueryData
   (react-query 5) — com eventos a cada poucos segundos ele nunca dispara.
   Por isso o motor tem relógio próprio: recarga completa quando a última
   carga completa passou de 240 s (aba visível).

   CORRIDA: uma carga (completa ou alvo) que partiu ANTES de um evento não
   pode sobrescrever o que o evento já aplicou. CarimbosRealtime carimba
   cada conversa/contato tocado; ao pousar, a carga desconfia dos itens
   carimbados depois do seu início (mantém a versão do cache e pede nova
   busca-alvo deles) — ver reconciliarCargaCompleta/reconciliarCargaAlvo.
   ------------------------------------------------------------------ */

const tsMs = (m: WaMessage): number => (m.tsISO ? new Date(m.tsISO).getTime() : 0);

/** Mensagem real (conta para preview/aguardando) — sistema e nota interna ficam de fora. */
const ehReal = (tipo?: string | null): boolean => tipo !== 'sistema' && tipo !== 'nota_interna';

const hhmm = (iso?: string | null): string => {
  if (!iso) return '';
  const d = new Date(iso);
  return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
};

/** Igualdade estrutural (objetos/arrays/primitivos). Chave com valor undefined conta como ausente. */
export function igual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!igual(a[i], b[i])) return false;
    return true;
  }
  const oa = a as Record<string, unknown>, ob = b as Record<string, unknown>;
  const ka = Object.keys(oa).filter((k) => oa[k] !== undefined);
  const kb = Object.keys(ob).filter((k) => ob[k] !== undefined);
  if (ka.length !== kb.length) return false;
  for (const k of ka) if (!igual(oa[k], ob[k])) return false;
  return true;
}

/** Aplica `p` em `c` devolvendo o MESMO objeto quando nenhum campo muda de fato
 *  (preserva a referência — a lista não re-renderiza à toa). */
function comPatch(c: WaContact, p: Partial<WaContact>): WaContact {
  const rc = c as unknown as Record<string, unknown>;
  const rp = p as Record<string, unknown>;
  for (const k of Object.keys(rp)) if (!igual(rc[k], rp[k])) return { ...c, ...p };
  return c;
}

/** Troca o item `i` da lista (cópia rasa) — ou devolve a própria lista se o item não mudou. */
function trocar(lista: WaContact[], i: number, novo: WaContact): WaContact[] {
  if (lista[i] === novo) return lista;
  const out = lista.slice();
  out[i] = novo;
  return out;
}

/* ===================== Histórico (wa-msgs) ===================== */

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

/* ===================== Card da lista: mensagem ===================== */

/** Mensagens do CARD no formato da lista (embeds `real` + `ult`): a última mensagem real e a
 *  última de qualquer tipo, sem repetir, em ordem cronológica. Upsert por id. */
export function msgsDoCard(msgs: WaMessage[], nova: WaMessage): WaMessage[] {
  const todas = nova.id && msgs.some((m) => m.id === nova.id) ? msgs.map((m) => (m.id === nova.id ? nova : m)) : [...msgs, nova];
  todas.sort((a, b) => tsMs(a) - tsMs(b));
  const ult = todas[todas.length - 1];
  let real: WaMessage | undefined;
  for (let i = todas.length - 1; i >= 0; i--) if (ehReal(todas[i].tipo)) { real = todas[i]; break; }
  return real && real !== ult ? [real, ult] : [ult];
}

/** A última mensagem REAL (fora sistema/nota interna) de uma lista em ordem cronológica. */
function ultimaRealDe(msgs: WaMessage[] | undefined): WaMessage | undefined {
  const l = msgs ?? [];
  for (let i = l.length - 1; i >= 0; i--) if (ehReal(l[i].tipo)) return l[i];
  return undefined;
}

/** O que uma mensagem REAL faz com o card (comparada às mensagens que o card já tem):
 *   - 'fora': mais velha que a última real do card — não entra no card (ACK de mensagem antiga);
 *   - 'mesma': é a própria última real do card (ACK ✓→✓✓, mídia baixada, transcrição);
 *   - 'nova-ultima': passa a ser a última real do card.
 *  NÃO usa c.lastAtMs: ele vem de conversas.ultima_interacao_em, que o BOT não move (a resposta do
 *  bot fica mais nova que ele) — comparar com lastAtMs deixava o ACK de uma entrada antiga passar
 *  como se fosse a última (card virava "aguardando" com o preview errado). */
export type EfeitoNoCard = 'fora' | 'mesma' | 'nova-ultima';
export function efeitoNoCard(c: WaContact, m: WaMessage): { efeito: EfeitoNoCard; msgs: WaMessage[] } {
  const msgs = msgsDoCard(c.msgs ?? [], m);
  // msgsDoCard guarda só [última real, última]: uma real que entra é necessariamente a última real
  if (!msgs.includes(m)) return { efeito: 'fora', msgs };
  const antes = ultimaRealDe(c.msgs);
  return { efeito: antes?.id && antes.id === m.id ? 'mesma' : 'nova-ultima', msgs };
}

/** Reflete uma mensagem no CARD da lista. Conversa fora da lista fica para a busca-alvo;
 *  sistema/nota interna não mexem no card.
 *  INSERT (`contaNaoLida`): mensagem nova → preview (com a duração do áudio), horário, posição
 *  (lastAtMs ordena a fila), aguardando/não-lidas e as mensagens do card (a busca-alvo pedida pelo
 *  roteador confirma com a palavra do banco logo atrás).
 *  UPDATE (ACK, retry, mídia baixada): NUNCA mexe em lastAtMs/time/aguardando/não-lidas — esses
 *  saem do relógio do banco (ultima_interacao_em) na carga. Só a bolha e, se for a MESMA última
 *  real, o preview. Mensagem antiga: nada. UPDATE que tornaria outra mensagem a última real
 *  ('nova-ultima': mídia que ficou visível, INSERT perdido) só põe a bolha — o roteador pede a
 *  busca-alvo para os derivados. */
export function patchListaMensagem(
  lista: WaContact[], conversaId: string, m: WaMessage, contaNaoLida: boolean,
  meta?: { seconds?: number | null; ptt?: boolean | null },
): WaContact[] {
  if (!ehReal(m.tipo)) return lista;
  const i = lista.findIndex((c) => c.id === conversaId);
  if (i < 0) return lista;
  const c = lista[i];
  const { efeito, msgs } = efeitoNoCard(c, m);
  if (efeito === 'fora') return lista;                          // mais velha que o card: nada a mudar
  const last = previewUltimaMensagem({ tipo: m.tipo, texto: m.text || null, seconds: meta?.seconds ?? null, ptt: meta?.ptt ?? undefined });
  if (!contaNaoLida) return trocar(lista, i, comPatch(c, efeito === 'mesma' ? { msgs, last } : { msgs }));
  const at = tsMs(m) || Date.now();
  if ((c.lastAtMs ?? 0) > at) return lista;                    // evento atrasado não regride o card
  const base: Partial<WaContact> = { msgs, last, time: m.time, lastAtMs: at };
  const p: Partial<WaContact> = m.dir === 'in'
    ? { ...base, unread: (c.unread ?? 0) + (contaNaoLida ? 1 : 0), aguardando: !!c.aberta, aguardandoDesde: c.aberta ? (m.tsISO ?? c.aguardandoDesde ?? null) : c.aguardandoDesde ?? null }
    : { ...base, aguardando: false, aguardandoDesde: null };
  return trocar(lista, i, comPatch(c, p));
}

/* ===================== Card da lista: conversa ===================== */

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
  precisa_humano_motivo?: string | null;
  precisa_humano_em?: string | null;
  atendente_id?: string | null;
  status_id?: string | null;
  etiquetas?: string[] | null;
  /** canal ATUAL (chip/canalAtual/canalId) — o webhook troca em todo inbound */
  canal_id?: string | null;
  /** último canal que falou com o cliente ("Responder por" automático) */
  ultimo_canal_id?: string | null;
  ultimo_numero?: string | null;
  ultimo_provider?: string | null;
  ultima_msg_canal_em?: string | null;
  contato_id?: string | null;
}

/** Resolve o canal pelo id (cache ['wa-canais', org]). null = não achado (mantém o valor antigo). */
export interface CtxCanal { canalPorId?: (id: string) => { alias: string } | null | undefined }

const STATUS_LABEL: Record<string, string> = {
  aberta: 'Aberta', em_atendimento: 'Em atendimento', pendente: 'Pendente', resolvida: 'Resolvida', fechada: 'Fechada',
};

/** UPDATE em `conversas` → patch dos campos escalares de UM card (lida/arquivada/fixada/status/
 *  etiquetas/canal…). Devolve o MESMO card quando nada visível muda. Nome/telefone/responsável
 *  vêm de `contatos` (evento próprio); etapa/IA, da busca-alvo. */
export function patchConversaRow(c: WaContact, row: RowConversa, ctx?: CtxCanal): WaContact {
  const p: Partial<WaContact> = {};
  if (row.nao_lidas !== undefined) p.unread = row.nao_lidas ?? 0;
  if (row.arquivada_em !== undefined) p.arquivada = !!row.arquivada_em;
  if (row.fixada_em !== undefined) p.fixada = !!row.fixada_em;
  if (row.silenciada_ate !== undefined) p.silenciada = !!row.silenciada_ate && new Date(row.silenciada_ate).getTime() > Date.now();
  if (row.precisa_humano !== undefined) p.precisaHumano = !!row.precisa_humano;
  // motivo/quando do pedido de humano viajam JUNTO com o flag: sem eles o evento de
  // handoff do fio montaria sem motivo/hora até a próxima carga
  if (row.precisa_humano_motivo !== undefined) p.precisaHumanoMotivo = row.precisa_humano_motivo ?? null;
  if (row.precisa_humano_em !== undefined) p.precisaHumanoEm = row.precisa_humano_em ?? null;
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
    if (at >= (c.lastAtMs ?? 0)) {
      p.lastAtMs = at; p.time = hhmm(row.ultima_interacao_em);
      p.lastInter = new Date(row.ultima_interacao_em).toLocaleString('pt-BR');
    }
  }
  // canal ATUAL: chip/canalAtual pelo cache de canais; canal não achado (removido/fora do cache)
  // mantém o valor antigo — a busca-alvo (pedida pelo roteador) traz o nome do embed.
  if (row.canal_id !== undefined && row.canal_id && row.canal_id !== (c.canalId ?? null)) {
    const canal = ctx?.canalPorId?.(row.canal_id);
    if (canal) { p.canalId = row.canal_id; p.chip = canal.alias; p.canalAtual = canal.alias; }
  }
  // último canal (mesma forma do mapConversa)
  if (row.ultimo_canal_id !== undefined || row.ultimo_numero !== undefined || row.ultimo_provider !== undefined || row.ultima_msg_canal_em !== undefined) {
    const prev: WaUltimoCanal | null | undefined = c.ultimoCanal;
    const canalId = row.ultimo_canal_id !== undefined ? row.ultimo_canal_id : prev?.canalId ?? null;
    const numero = row.ultimo_numero !== undefined ? row.ultimo_numero : prev?.numero ?? null;
    const provider = row.ultimo_provider !== undefined ? row.ultimo_provider : prev?.provider ?? null;
    const em = row.ultima_msg_canal_em !== undefined ? row.ultima_msg_canal_em : prev?.em ?? null;
    p.ultimoCanal = canalId || numero ? { canalId: canalId ?? null, alias: null, numero: numero ?? null, provider: provider ?? null, em: em ?? null } : null;
  }
  return comPatch(c, p);
}

/** UPDATE em `conversas` aplicado na lista (mesma referência quando nada muda). */
export function patchListaConversa(lista: WaContact[], row: RowConversa, ctx?: CtxCanal): WaContact[] {
  if (!row.id) return lista;
  const i = lista.findIndex((c) => c.id === row.id);
  if (i < 0) return lista;
  return trocar(lista, i, patchConversaRow(lista[i], row, ctx));
}

/* ===================== Card da lista: contato ===================== */

/** Nome exibido (Caso D / @lid): nunca um LID cru. Se JÁ há telefone (resolvido), mostra o número
 *  mesmo que o nome tenha ficado como placeholder; só sem telefone → "Identidade protegida".
 *  FONTE ÚNICA: mapConversa e o patch de `contatos` usam esta regra. */
export function nomeDoContato(nomeCru: string | null, tel: string | null, temPn: boolean): string {
  const ehLidCru = !!nomeCru && /^[0-9]{12,}$/.test(nomeCru) && !tel && !temPn;
  const ehPlaceholder = nomeCru === 'Identidade protegida' || ehLidCru;
  return ehPlaceholder ? (tel ?? 'Identidade protegida') : (nomeCru ?? 'Contato');
}

/** Linha crua de `contatos` vinda do payload. */
export interface RowContato {
  id?: string;
  nome?: string | null;
  telefone?: string | null;
  email?: string | null;
  observacoes?: string | null;
  origem?: string | null;
  responsavel_id?: string | null;
}
const CAMPOS_CONTATO = ['nome', 'telefone', 'email', 'observacoes', 'origem', 'responsavel_id'] as const;

/** UPDATE em `contatos` → campos do card que vêm do contato (mesmos defaults do mapConversa).
 *  temPn sai do próprio card (semDestino = !temPn). null = payload sem algum campo (não dá para
 *  patchar com segurança: vira busca-alvo). Mesmo card quando nada visível muda (cpf etc.). */
export function patchContatoNoCard(c: WaContact, row: RowContato): WaContact | null {
  const r = row as Record<string, unknown>;
  if (CAMPOS_CONTATO.some((k) => r[k] === undefined)) return null;
  const tel = row.telefone ?? null;
  return comPatch(c, {
    name: nomeDoContato(row.nome ?? null, tel, !c.semDestino),
    phone: tel ?? '',
    email: row.email ?? '',
    notes: row.observacoes ?? '',
    origin: row.origem ?? 'WhatsApp',
    respId: row.responsavel_id ?? null,
  });
}

/* ===================== Etapa do Kanban por contato ===================== */

export type EtapaVariante = 'ganho' | 'perdido' | 'neutro';
export interface EtapaContato { etapa: string; cor: string | null; entrada: boolean; resultado: EtapaVariante; status: OppStatus; respId: string | null; emAndamento: boolean }
type ColunaFunil = { nome: string | null; cor: string | null; entrada: boolean | null; resultado: string | null };
/** Linha de `oportunidades` como a lista lê (com a coluna do funil embutida). */
export interface OppLinha { contato_id: string | null; status: string | null; responsavel_id: string | null; atualizado_em: string | null; id: string; funil_colunas: ColunaFunil | ColunaFunil[] | null }

/** Ordem de NEGÓCIO: atualizado_em desc, depois id desc (desempate estável). */
const ordemNegocio = (a: OppLinha, b: OppLinha): number =>
  String(b.atualizado_em ?? '').localeCompare(String(a.atualizado_em ?? '')) || String(b.id).localeCompare(String(a.id));

/** UM passo da regra, com as oportunidades vindo em ordem de negócio (a 1ª vista é a mais recente).
 *  Um GANHO é "grudento" — cliente fechado (ganho) NUNCA perde o selo FECHADO no inbox por causa
 *  de uma oportunidade ativa/paralela. Fora isso, a etapa ATIVA vence uma anterior encerrada (mostra
 *  o estágio vivo). Coluna sem nome não conta. */
function passoEtapa(prev: EtapaContato | undefined, r: OppLinha): EtapaContato | undefined {
  const col = Array.isArray(r.funil_colunas) ? r.funil_colunas[0] : r.funil_colunas;
  if (!col?.nome) return prev;
  const emAndamento = r.status === 'em_andamento';
  const curGanho = r.status === 'ganho';
  if (prev) {
    if (prev.status === 'ganho') return prev;                          // ganho já registrado vence tudo
    if (!curGanho && !(emAndamento && !prev.emAndamento)) return prev; // não-ganho: regra antiga
    // curGanho (com prev não-ganho) substitui abaixo
  }
  const st = r.status;
  return {
    etapa: col.nome,
    cor: col.cor ?? null,
    entrada: !!col.entrada,
    resultado: (col.resultado === 'ganho' || col.resultado === 'perdido') ? col.resultado : 'neutro',
    status: (st === 'ganho' || st === 'perdido' || st === 'cancelado') ? st : 'em_andamento',
    respId: r.responsavel_id ?? null,
    emAndamento,
  };
}

/** Etapa de UM contato a partir de TODAS as oportunidades dele (qualquer ordem de entrada).
 *  Patchar só a linha que mudou erraria o ganho grudento — por isso a busca-alvo traz todas. */
export function etapaDoContato(opps: OppLinha[]): EtapaContato | null {
  let e: EtapaContato | undefined;
  for (const r of [...opps].sort(ordemNegocio)) e = passoEtapa(e, r);
  return e ?? null;
}

/** Mapa contato → etapa a partir das oportunidades de VÁRIOS contatos (carga completa e
 *  busca-alvo). Mesma regra de etapaDoContato aplicada por contato. */
export function etapasDeOportunidades(linhas: OppLinha[]): Map<string, EtapaContato> {
  const map = new Map<string, EtapaContato>();
  for (const r of [...linhas].sort(ordemNegocio)) {
    const cid = r.contato_id;
    if (!cid) continue;
    const prev = map.get(cid);
    const prox = passoEtapa(prev, r);
    if (prox && prox !== prev) map.set(cid, prox);
  }
  return map;
}

/* ===================== IA por conversa ===================== */

export interface IaEstadoLista { iaAtiva: boolean; iaStatus: string }
/** iaAtiva = MESMA fórmula do botão do cabeçalho: existe && status='ativa' && !desativado_manual.
 *  `desativado_manual` vem enxuto do select (`dados->desativado_manual`: true/false/null). */
export function iaDaLinha(r: { status: string | null; desativado_manual?: unknown }): IaEstadoLista {
  const status = r.status ?? '';
  return { iaAtiva: status === 'ativa' && r.desativado_manual !== true, iaStatus: status };
}

/** Etapa + IA no card recém-mapeado (MUTA e devolve o próprio card — só para cards novos). */
export function aplicarSatelites(c: WaContact, e: EtapaContato | null | undefined, ia: IaEstadoLista | null | undefined): WaContact {
  if (ia) { c.iaAtiva = ia.iaAtiva; c.iaStatus = ia.iaStatus; }
  if (e) {
    c.etapa = e.etapa; c.etapaCor = e.cor; c.etapaEntrada = e.entrada; c.etapaResultado = e.resultado;
    c.oppStatus = e.status; c.oppRespId = e.respId;
    c.stage = e.etapa;
  }
  return c;
}

/* ===================== Mesclagem ===================== */

/** Upsert por id das conversas `novas` na lista. NUNCA remove (só a carga completa remove).
 *  Item igual ao atual mantém a referência; nada mudou → a própria lista. Conversa nova entra
 *  no topo (a tela reordena por fixada/atividade). */
export function mesclarConversas(lista: WaContact[], novas: WaContact[]): WaContact[] {
  if (!novas.length) return lista;
  const ultimaPorId = new Map<string, WaContact>();
  for (const n of novas) if (n?.id) ultimaPorId.set(n.id, n);
  const idx = new Map(lista.map((c, i) => [c.id, i] as const));
  let out: WaContact[] | null = null;
  const inserir: WaContact[] = [];
  for (const n of ultimaPorId.values()) {
    const i = idx.get(n.id);
    if (i === undefined) { inserir.push(n); continue; }
    if (igual(lista[i], n)) continue;
    if (!out) out = lista.slice();
    out[i] = n;
  }
  const base = out ?? lista;
  return inserir.length ? [...inserir, ...base] : base;
}

/* ===================== Carimbos (corrida carga × evento) ===================== */

export interface Alvos { ids?: Iterable<string | null | undefined>; contatoIds?: Iterable<string | null | undefined> }
export interface LoteAlvos { ids: string[]; contatoIds: string[] }

/** Normaliza alvos (sem vazios, sem repetidos). */
export function loteDe(a: Alvos): LoteAlvos {
  const ids = new Set<string>(), contatoIds = new Set<string>();
  for (const id of a.ids ?? []) if (id) ids.add(id);
  for (const id of a.contatoIds ?? []) if (id) contatoIds.add(id);
  return { ids: [...ids], contatoIds: [...contatoIds] };
}

/** Relógio lógico dos eventos aplicados no cache. Uma carga abre um MARCO (o carimbo atual);
 *  conversa/contato tocado depois do marco pode estar mais novo no cache do que no resultado
 *  da carga — que então não pode sobrescrevê-lo. Entradas que nenhuma carga aberta precisa
 *  mais são podadas ao fechar. */
export class CarimbosRealtime {
  private seq = 0;
  private readonly conv = new Map<string, number>();
  private readonly contato = new Map<string, number>();
  private readonly abertos = new Map<number, number>();   // marco -> quantas cargas abertas nele

  /** Abre uma carga e devolve o seu marco. Feche SEMPRE (finally). */
  abrir(): number {
    this.abertos.set(this.seq, (this.abertos.get(this.seq) ?? 0) + 1);
    return this.seq;
  }
  fechar(marco: number): void {
    const n = (this.abertos.get(marco) ?? 0) - 1;
    if (n > 0) this.abertos.set(marco, n); else this.abertos.delete(marco);
    const minAberto = this.abertos.size ? Math.min(...this.abertos.keys()) : this.seq;
    for (const [k, v] of this.conv) if (v <= minAberto) this.conv.delete(k);
    for (const [k, v] of this.contato) if (v <= minAberto) this.contato.delete(k);
  }
  /** Carimba conversas/contatos tocados por um evento (ou patch otimista) agora. */
  tocar(a: Alvos): void {
    const l = loteDe(a);
    if (!l.ids.length && !l.contatoIds.length) return;
    const s = ++this.seq;
    for (const id of l.ids) this.conv.set(id, s);
    for (const id of l.contatoIds) this.contato.set(id, s);
  }
  /** O item foi tocado depois do marco? (então a carga aberta nele pode estar velha p/ ele) */
  tocadoDepois(id: string, contatoId: string | null | undefined, marco: number): boolean {
    return (this.conv.get(id) ?? -1) > marco || (!!contatoId && (this.contato.get(contatoId) ?? -1) > marco);
  }
  /** Tudo o que foi tocado depois do marco (para a nova busca-alvo após uma carga completa). */
  tocadosDepois(marco: number): LoteAlvos {
    const ids: string[] = [], contatoIds: string[] = [];
    for (const [k, v] of this.conv) if (v > marco) ids.push(k);
    for (const [k, v] of this.contato) if (v > marco) contatoIds.push(k);
    return { ids, contatoIds };
  }
  /** só p/ teste/diagnóstico */
  tamanho(): number { return this.conv.size + this.contato.size; }
}

/** Resultado de uma CARGA COMPLETA reconciliado com o cache: a carga é a verdade (inclusive para
 *  remover conversas excluídas/mescladas), EXCETO nos itens tocados depois do início dela — esses
 *  ficam com a versão do cache (que já tem o evento) e quem chama pede a busca-alvo deles.
 *  Conversa trazida por busca-alvo/evento depois do início e ausente da carga NÃO some. */
export function reconciliarCargaCompleta(
  atual: WaContact[] | undefined, carga: WaContact[], desconfiar: (c: WaContact) => boolean,
): WaContact[] {
  if (!atual?.length) return carga;
  const porId = new Map(atual.map((c) => [c.id, c] as const));
  const naCarga = new Set<string>();
  const out = carga.map((c) => {
    naCarga.add(c.id);
    if (!desconfiar(c)) return c;
    return porId.get(c.id) ?? c;
  });
  for (const a of atual) if (!naCarga.has(a.id) && desconfiar(a)) out.push(a);
  return out;
}

/** Resultado de uma BUSCA-ALVO mesclado no cache (upsert, nunca remove). Item tocado depois do
 *  início da busca fica com a versão do cache (se existir) e volta para a fila (`rebuscar`). */
export function reconciliarCargaAlvo(
  atual: WaContact[], carga: WaContact[], desconfiar: (c: WaContact) => boolean,
): { lista: WaContact[]; rebuscar: string[]; aplicados: string[] } {
  const ids = new Set(atual.map((c) => c.id));
  const rebuscar: string[] = [];
  const aplicados: string[] = [];
  const aplicar = carga.filter((c) => {
    if (!desconfiar(c)) { aplicados.push(c.id); return true; }
    rebuscar.push(c.id);
    return !ids.has(c.id);              // ausente no cache: melhor a versão da busca do que nada
  });
  return { lista: mesclarConversas(atual, aplicar), rebuscar, aplicados };
}

/** Estado de IA relido (refresh enxuto de ia_sessoes) aplicado na lista: só iaAtiva/iaStatus e só
 *  onde mudou. Conversa sem sessão no mapa volta a "sem IA" (como a carga completa a monta). Item
 *  tocado depois do início da leitura fica como está (o evento/busca dele é mais novo). */
export function aplicarIaNaLista(
  lista: WaContact[], ia: Map<string, IaEstadoLista>, desconfiar: (c: WaContact) => boolean,
): { lista: WaContact[]; mudadas: string[] } {
  const mudadas: string[] = [];
  let out: WaContact[] | null = null;
  for (let i = 0; i < lista.length; i++) {
    const c = lista[i];
    const e = ia.get(c.id);
    const iaAtiva = e?.iaAtiva, iaStatus = e?.iaStatus;
    if (c.iaAtiva === iaAtiva && c.iaStatus === iaStatus) continue;
    if (desconfiar(c)) continue;
    if (!out) out = lista.slice();
    out[i] = { ...c, iaAtiva, iaStatus };
    mudadas.push(c.id);
  }
  return { lista: out ?? lista, mudadas };
}

/* ===================== Roteamento dos eventos ===================== */

/** Tabelas assinadas no canal wa-<org> — TODAS precisam estar na publication supabase_realtime
 *  (uma fora dela derruba o pedido inteiro em silêncio). ia_sessoes está FORA: não entra aqui. */
export const TABELAS_CANAL_WA = ['mensagens', 'conversas', 'contatos', 'oportunidades'] as const;
export type TabelaRt = (typeof TABELAS_CANAL_WA)[number];
export interface CtxRoteamento extends CtxCanal {
  /** Linha crua de `mensagens` → bolha (mapMensagens); null quando a linha não vira bolha. */
  mapMensagem: (row: Record<string, unknown>) => WaMessage | null;
}
export interface Roteamento {
  /** Lista depois do patch (a MESMA referência da entrada quando nada mudou; undefined sem cache). */
  lista: WaContact[] | undefined;
  /** Conversas (id) e contatos (contato_id) para a busca-alvo. */
  alvoIds: string[];
  alvoContatos: string[];
  /** O que carimbar (o evento mudou o cache ou pediu busca para estes). */
  tocarIds: string[];
  tocarContatos: string[];
  /** Evento que o caminho incremental não sabe tratar → recarga completa. */
  recarregarTudo: boolean;
  /** rótulo do caminho escolhido (diagnóstico/teste) */
  motivo: string;
}

/** Linha crua do payload do realtime (`new` / `old`). */
export type Linha = Record<string, unknown> | null | undefined;
const texto = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
/** Linha de `mensagens` sem alguma coluna que a bolha precisa (UPDATE com TOAST inalterado). */
export const linhaMsgIncompleta = (row: Linha): boolean =>
  !row || row.conteudo === undefined || row.metadados === undefined || row.tipo === undefined || row.direcao === undefined;

/** Decide o que fazer com um evento do canal wa-<org> (ver o cabeçalho deste arquivo). */
export function rotearEvento(
  tabela: string, tipo: string, novo: Linha, velho: Linha, lista: WaContact[] | undefined, ctx: CtxRoteamento,
): Roteamento {
  const r = (p: Partial<Roteamento> & { motivo: string }): Roteamento => ({
    lista, alvoIds: [], alvoContatos: [], tocarIds: [], tocarContatos: [], recarregarTudo: false, ...p,
  });

  if (tabela === 'mensagens') {
    if (tipo === 'DELETE') {
      const id = texto(velho?.id);
      if (!id) return r({ recarregarTudo: true, motivo: 'mensagem-delete-sem-id' });
      if (!lista) return r({ motivo: 'sem-lista' });
      const conv = texto(velho?.conversa_id);
      // só importa se a mensagem é uma das que o card guarda (a última real / a última):
      // as derivações do card (preview, aguardando, lastAtMs) saem delas.
      const alvos = lista.filter((c) => c.id === conv || (c.msgs ?? []).some((m) => m.id === id)).map((c) => c.id);
      return r({ alvoIds: alvos, tocarIds: alvos, motivo: alvos.length ? 'mensagem-excluida-do-card' : 'mensagem-excluida-irrelevante' });
    }
    if (tipo !== 'INSERT' && tipo !== 'UPDATE') return r({ recarregarTudo: true, motivo: 'mensagem-tipo-desconhecido' });
    const convId = texto(novo?.conversa_id);
    if (!convId) return r({ recarregarTudo: true, motivo: 'mensagem-sem-conversa' });
    const insert = tipo === 'INSERT';
    // carga completa em voo: só carimba — ao pousar ela pede a busca-alvo do que foi tocado
    if (!lista) return r({ tocarIds: [convId], motivo: 'sem-lista' });
    if (!lista.some((c) => c.id === convId)) return r({ alvoIds: [convId], tocarIds: [convId], motivo: 'mensagem-de-conversa-fora-da-lista' });
    // UPDATE pode vir SEM as colunas grandes que não mudaram (TOAST: conteudo/metadados longos não
    // entram no WAL) — linha incompleta não patcha (viraria bolha/preview vazio); INSERT segue p/ busca
    if (linhaMsgIncompleta(novo)) {
      return r({ alvoIds: insert ? [convId] : [], tocarIds: insert ? [convId] : [], motivo: 'mensagem-payload-incompleto' });
    }
    const m = ctx.mapMensagem(novo as Record<string, unknown>);
    const meta = (novo?.metadados ?? null) as { seconds?: number | null; ptt?: boolean | null } | null;
    // UPDATE que tornaria OUTRA mensagem a última real do card (mídia que ficou visível, INSERT
    // perdido): o patch só põe a bolha; preview/aguardando/posição vêm da busca-alvo
    const card = lista.find((c) => c.id === convId)!;
    const viraUltima = !insert && !!m && ehReal(m.tipo) && efeitoNoCard(card, m).efeito === 'nova-ultima';
    const nova = m ? patchListaMensagem(lista, convId, m, insert, { seconds: meta?.seconds ?? null, ptt: meta?.ptt ?? null }) : lista;
    // INSERT também busca a conversa: traz etapa/IA frescas e os derivados com a palavra do banco.
    // UPDATE (ACK ✓→✓✓→lida, mídia baixada) é só patch — é a maioria dos eventos.
    return r({
      lista: nova, alvoIds: insert || viraUltima ? [convId] : [], tocarIds: [convId],
      motivo: insert ? 'mensagem-nova' : viraUltima ? 'mensagem-atualizada-com-busca' : 'mensagem-atualizada',
    });
  }

  if (tabela === 'conversas') {
    if (tipo === 'DELETE') return r({ recarregarTudo: true, motivo: 'conversa-excluida' });
    const id = texto(novo?.id);
    if (!id) return r({ recarregarTudo: true, motivo: 'conversa-sem-id' });
    if (tipo !== 'INSERT' && tipo !== 'UPDATE') return r({ recarregarTudo: true, motivo: 'conversa-tipo-desconhecido' });
    if (!lista) return r({ tocarIds: [id], motivo: 'sem-lista' });
    const i = lista.findIndex((c) => c.id === id);
    if (tipo === 'INSERT' || i < 0) return r({ alvoIds: [id], tocarIds: [id], motivo: tipo === 'INSERT' ? 'conversa-nova' : 'conversa-fora-da-lista' });
    const card = lista[i];
    const row = novo as RowConversa;
    const n = patchConversaRow(card, row, ctx);
    const mudouContato = row.contato_id !== undefined && !!row.contato_id && row.contato_id !== (card.contatoId ?? null);
    const canalPendente = !!row.canal_id && row.canal_id !== (n.canalId ?? null);   // canal novo fora do cache
    // mudanças que costumam vir junto com etapa/IA/contato (arquivou por opp perdida, reabriu,
    // handoff, troca de atendente/contato): a busca-alvo traz o resto com a palavra do banco
    const pedeAlvo = mudouContato || canalPendente
      || n.arquivada !== card.arquivada || n.aberta !== card.aberta
      || n.precisaHumano !== card.precisaHumano || n.atendenteId !== card.atendenteId;
    const mudou = n !== card;
    return r({
      lista: mudou ? trocar(lista, i, n) : lista,
      alvoIds: pedeAlvo ? [id] : [],
      // carimba SEMPRE, mesmo sem mudança visível: o UPDATE que confirma um patch otimista
      // (arquivar/fixar/lida) bate com o cache — sem o carimbo, uma busca que leu o banco ANTES do
      // commit da RPC pousaria depois com o valor velho e ninguém a desmentiria
      tocarIds: [id],
      motivo: pedeAlvo ? 'conversa-atualizada-com-busca' : mudou ? 'conversa-atualizada' : 'conversa-sem-mudanca-visivel',
    });
  }

  if (tabela === 'contatos') {
    if (tipo === 'INSERT') return r({ motivo: 'contato-novo' });   // a conversa dele chega pelo evento próprio
    const cid = texto(novo?.id) ?? texto(velho?.id);
    if (!cid) return r({ recarregarTudo: true, motivo: 'contato-sem-id' });
    if (tipo === 'DELETE') {
      if (lista && !lista.some((c) => c.contatoId === cid)) return r({ motivo: 'contato-excluido-sem-conversa' });
      return r({ recarregarTudo: true, motivo: 'contato-excluido' });
    }
    if (tipo !== 'UPDATE') return r({ recarregarTudo: true, motivo: 'contato-tipo-desconhecido' });
    if (!lista) return r({ tocarContatos: [cid], motivo: 'sem-lista' });
    // só o carimbo (sem busca): a conversa nova deste contato pode estar numa busca-alvo EM VOO que
    // leu o contato antes deste UPDATE (nome resolvido, responsável do roteamento) — com o carimbo
    // ela desconfia e rebusca em vez de pousar com nome/dono velhos
    if (!lista.some((c) => c.contatoId === cid)) return r({ tocarContatos: [cid], motivo: 'contato-sem-conversa-na-lista' });
    let incompleto = false;
    let mudou = false;
    const out = lista.map((c) => {
      if (c.contatoId !== cid) return c;
      const n = patchContatoNoCard(c, novo as RowContato);
      if (n === null) { incompleto = true; return c; }
      if (n !== c) mudou = true;
      return n;
    });
    if (incompleto) return r({ alvoContatos: [cid], tocarContatos: [cid], motivo: 'contato-payload-incompleto' });
    // cpf, canal_origem, nome_fonte… ou o UPDATE que confirma um patch otimista: só o carimbo
    if (!mudou) return r({ tocarContatos: [cid], motivo: 'contato-sem-mudanca-visivel' });
    // patch na hora (abas Meus/Não atribuídos, nome) + busca-alvo: semDestino/nome dependem de
    // contato_identidades, que não vem no payload
    return r({ lista: out, alvoContatos: [cid], tocarContatos: [cid], motivo: 'contato-alterado' });
  }

  if (tabela === 'oportunidades') {
    // Etapa/ganho/perdido do card: a busca-alvo POR CONTATO traz TODAS as opps dele e aplica a
    // regra do ganho grudento (patchar só a linha que mudou erraria). Sem contato_id no payload
    // (DELETE traz só a PK com replica identity default) → recarga completa (exclusão é rara).
    const cid = texto(novo?.contato_id) ?? texto(velho?.contato_id);
    const cidVelho = texto(velho?.contato_id);
    if (tipo === 'DELETE') {
      if (!cid) return r({ recarregarTudo: true, motivo: 'oportunidade-excluida' });
    } else if (tipo !== 'INSERT' && tipo !== 'UPDATE') {
      return r({ recarregarTudo: true, motivo: 'oportunidade-tipo-desconhecido' });
    }
    if (!cid) return r({ recarregarTudo: true, motivo: 'oportunidade-sem-contato' });
    const contatos = cidVelho && cidVelho !== cid ? [cid, cidVelho] : [cid];
    // carga completa em voo: só carimba — ao pousar ela pede a busca-alvo do que foi tocado
    if (!lista) return r({ tocarContatos: contatos, motivo: 'sem-lista' });
    const naLista = contatos.filter((k) => lista.some((c) => c.contatoId === k));
    // contato sem conversa na lista: só o carimbo (uma busca em voo da conversa nova dele rebusca)
    if (!naLista.length) return r({ tocarContatos: contatos, motivo: 'oportunidade-sem-conversa-na-lista' });
    return r({ alvoContatos: naLista, tocarContatos: contatos, motivo: 'oportunidade-alterada' });
  }

  return r({ recarregarTudo: true, motivo: 'tabela-desconhecida' });
}

/* ===================== Fila de busca-alvo (throttle) ===================== */

export interface FilaAlvos {
  pedir(a: Alvos): void;
  /** tira da fila o que vai ser buscado agora por fora (busca imediata), sem duplicar a busca */
  retirar(a: Alvos): void;
  /** o que ainda não foi buscado (diagnóstico/teste) */
  pendentes(): LoteAlvos;
  parar(): void;
}

/** Fila de alvos com THROTTLE (não debounce): o 1º pedido dispara depois de `atrasoMs` (junta a
 *  rajada de escritas do webhook: conversa + mensagem + UPDATEs), e duas buscas COMEÇAM com no
 *  mínimo `intervaloMs` entre si. Pedido novo nunca adia a busca já agendada. Pedidos que chegam
 *  durante uma busca vão no lote seguinte. */
export function criarFilaAlvos(o: {
  executar: (lote: LoteAlvos) => Promise<unknown>;
  intervaloMs?: number;
  atrasoMs?: number;
  agora?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (h: unknown) => void;
}): FilaAlvos {
  const intervalo = o.intervaloMs ?? 1000;
  const atraso = o.atrasoMs ?? 150;
  const agora = o.agora ?? (() => Date.now());
  const setT = o.setTimer ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const clearT = o.clearTimer ?? ((h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>));
  const ids = new Set<string>(), contatos = new Set<string>();
  let timer: unknown = null;
  let emVoo = false;
  let parado = false;
  let ultimoInicio = Number.NEGATIVE_INFINITY;

  const agendar = () => {
    if (parado || timer !== null || emVoo || (!ids.size && !contatos.size)) return;
    timer = setT(disparar, Math.max(atraso, ultimoInicio + intervalo - agora()));
  };
  const disparar = () => {
    timer = null;
    if (parado) return;
    const lote: LoteAlvos = { ids: [...ids], contatoIds: [...contatos] };
    ids.clear(); contatos.clear();
    if (!lote.ids.length && !lote.contatoIds.length) return;
    emVoo = true;
    ultimoInicio = agora();
    let p: Promise<unknown>;
    try { p = Promise.resolve(o.executar(lote)); } catch (e) { p = Promise.reject(e); }
    void p.catch(() => { /* executar trata os próprios erros (recarga completa) */ })
      .finally(() => { emVoo = false; agendar(); });
  };

  return {
    pedir(a) {
      if (parado) return;
      for (const id of a.ids ?? []) if (id) ids.add(id);
      for (const id of a.contatoIds ?? []) if (id) contatos.add(id);
      agendar();
    },
    retirar(a) {
      for (const id of a.ids ?? []) if (id) ids.delete(id);
      for (const id of a.contatoIds ?? []) if (id) contatos.delete(id);
    },
    pendentes: () => ({ ids: [...ids], contatoIds: [...contatos] }),
    parar() {
      parado = true;
      if (timer !== null) clearT(timer);
      timer = null;
      ids.clear(); contatos.clear();
    },
  };
}

/* ===================== Patch otimista (ações do atendente) ===================== */

/** Patch raso num card guardando os valores ANTERIORES dos campos tocados (para desfazer só eles). */
export function aplicarPatchComDesfazer(
  lista: WaContact[], conversaId: string, patch: Partial<WaContact>,
): { lista: WaContact[]; desfazer: Partial<WaContact> | null } {
  const i = lista.findIndex((c) => c.id === conversaId);
  if (i < 0) return { lista, desfazer: null };
  const c = lista[i];
  const anterior: Partial<WaContact> = {};
  for (const k of Object.keys(patch) as (keyof WaContact)[]) (anterior as Record<string, unknown>)[k] = c[k];
  return { lista: trocar(lista, i, comPatch(c, patch)), desfazer: anterior };
}

/* ===================== Reconciliação: medição ===================== */

export const CAMPOS_RECONCILIACAO = ['unread', 'aguardando', 'last', 'respId', 'atendenteId', 'etapa', 'oppStatus', 'iaAtiva', 'canalId', 'arquivada', 'name'] as const;
export interface Divergencias { faltam: number; sobram: number; campos: Partial<Record<(typeof CAMPOS_RECONCILIACAO)[number], number>>; total: number }

/** Quanto o cache (patches + buscas-alvo) divergia da carga completa nova. Métrica do log
 *  '[wa] reconciliação': perto de 0 por uma semana = o caminho incremental cobre tudo.
 *  faltam = conversas da carga que o cache não tinha; sobram = do cache que a carga não trouxe. */
export function contarDivergencias(cache: WaContact[], carga: WaContact[]): Divergencias {
  const porId = new Map(cache.map((c) => [c.id, c] as const));
  const campos: Divergencias['campos'] = {};
  let faltam = 0, total = 0;
  const vistos = new Set<string>();
  for (const n of carga) {
    vistos.add(n.id);
    const a = porId.get(n.id);
    if (!a) { faltam++; continue; }
    if (a === n) continue;
    for (const k of CAMPOS_RECONCILIACAO) {
      if (!igual(a[k] ?? null, n[k] ?? null)) { campos[k] = (campos[k] ?? 0) + 1; total++; }
    }
  }
  let sobram = 0;
  for (const a of cache) if (!vistos.has(a.id)) sobram++;
  return { faltam, sobram, campos, total: total + faltam + sobram };
}

/* ===================== Motor do realtime (fila + busca-alvo + piso) ===================== */

/** Carga completa pousando: reconcilia com o cache (ver reconciliarCargaCompleta) e devolve o que
 *  foi tocado depois do marco dela — para a busca-alvo logo atrás. Chamar ANTES de fechar o marco. */
export function pousarCargaCompleta(
  atual: WaContact[] | undefined, carga: WaContact[], carimbos: CarimbosRealtime, marco: number,
): { lista: WaContact[]; tocados: LoteAlvos } {
  const lista = reconciliarCargaCompleta(atual, carga, (c) => carimbos.tocadoDepois(c.id, c.contatoId, marco));
  return { lista, tocados: carimbos.tocadosDepois(marco) };
}

export interface DepsMotor {
  carimbos: CarimbosRealtime;
  /** lê o cache da lista (undefined = carga completa ainda não pousou) */
  ler: () => WaContact[] | undefined;
  /** grava no cache por updater (devolver undefined = não grava) */
  gravar: (fn: (l: WaContact[] | undefined) => WaContact[] | undefined) => void;
  /** busca-alvo (consulta da lista restrita ao lote); deve respeitar o signal */
  buscar: (lote: LoteAlvos, signal: AbortSignal) => Promise<WaContact[]>;
  /** recarga completa (invalidar a query) — o PISO */
  recarregarTudo: (motivo: string) => void;
  ctx: CtxRoteamento;
  aviso?: (msg: string) => void;
  intervaloMs?: number;
  atrasoMs?: number;
  /** busca pendurada é abortada (e vira recarga completa) depois disto */
  timeoutMs?: number;
  /** atraso da recarga completa do piso (timer que NÃO reinicia: N pedidos = 1 recarga) */
  atrasoRecargaMs?: number;
  /** busca-alvo que falhou volta para a fila depois destas esperas (uma por tentativa; [] = não
   *  repete). A recarga completa do piso também é pedida — mas se ela falhar junto (banco saturado),
   *  sem a repetição a conversa nova não estaria em fila nenhuma. */
  retentativasMs?: number[];
  /** BACKSTOP próprio: recarga completa quando a última carga completa (ultimaCargaCompletaEm)
   *  passou disto, com a aba visível. O refetchInterval da query NÃO serve: todo setQueryData o
   *  reinicia, e com eventos a cada poucos segundos ele nunca dispararia. */
  backstopMs?: number;
  /** quando a última carga completa partiu/pousou (ms epoch) — o queryFn registra */
  ultimaCargaCompletaEm?: () => number;
  /** aba visível (focusManager): backstop e refresh de IA só com ela visível */
  visivel?: () => boolean;
  /** refresh enxuto do estado de IA (ia_sessoes está fora da publication: sem evento) — ESTRITO:
   *  lança em qualquer erro (um mapa parcial apagaria o selo de quem ficou de fora) */
  buscarIa?: (signal: AbortSignal) => Promise<Map<string, IaEstadoLista>>;
  iaIntervaloMs?: number;
  /** de quanto em quanto tempo o relógio confere backstop e IA */
  relogioMs?: number;
  agora?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (h: unknown) => void;
}
export interface MotorRealtime {
  /** aplica um evento do canal; devolve o roteamento (null se o motor parou ou o patch falhou) */
  evento(tabela: TabelaRt, tipo: string, novo: Linha, velho: Linha): Roteamento | null;
  /** enfileira busca-alvo (throttle) */
  pedir(a: Alvos): void;
  /** busca-alvo imediata (carimba: o banco acabou de mudar); true = mesclada no cache */
  agora(a: Alvos): Promise<boolean>;
  recarregarTudo(motivo: string): void;
  parar(): void;
}

/** O caminho incremental inteiro, sem React: roteia o evento, aplica o patch, enfileira e executa
 *  a busca-alvo e cai na recarga completa em qualquer erro. useWaConversations só liga os fios. */
export function criarMotorRealtime(d: DepsMotor): MotorRealtime {
  const setT = d.setTimer ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const clearT = d.clearTimer ?? ((h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>));
  const agora = d.agora ?? (() => Date.now());
  const visivel = d.visivel ?? (() => true);
  const timeoutMs = d.timeoutMs ?? 15_000;
  let vivo = true;
  const emVoo = new Set<AbortController>();
  const timers = new Set<unknown>();          // repetições agendadas (limpos no parar)
  let timerTudo: unknown = null;

  const recarregarTudo = (motivo: string) => {
    if (!vivo || timerTudo !== null) return;
    d.aviso?.('recarga completa: ' + motivo);
    timerTudo = setT(() => { timerTudo = null; if (vivo) d.recarregarTudo(motivo); }, d.atrasoRecargaMs ?? 1500);
  };

  /* ---- repetição da busca-alvo que falhou (backoff, teto de tentativas por id) ---- */
  const esperas = d.retentativasMs ?? [5_000, 10_000, 20_000];
  const tentativas = new Map<string, number>();   // 'c:<conversa>' | 'k:<contato>' -> falhas seguidas
  const repetirDepois = (lote: LoteAlvos) => {
    const rep: LoteAlvos = { ids: [], contatoIds: [] };
    let n = 0;
    const contar = (chave: string, id: string, destino: string[]) => {
      const t = (tentativas.get(chave) ?? 0) + 1;
      if (t > esperas.length) { tentativas.delete(chave); return; }   // desiste: backstop/foco cobrem
      tentativas.set(chave, t);
      destino.push(id);
      n = Math.max(n, t);
    };
    for (const id of lote.ids) contar('c:' + id, id, rep.ids);
    for (const id of lote.contatoIds) contar('k:' + id, id, rep.contatoIds);
    if (!n) return;
    const h = setT(() => { timers.delete(h); if (vivo) fila.pedir(rep); }, esperas[n - 1]);
    timers.add(h);
  };

  const executar = async (lote: LoteAlvos): Promise<boolean> => {
    if (!lote.ids.length && !lote.contatoIds.length) return true;
    const ctl = new AbortController();
    emVoo.add(ctl);
    const limite = setT(() => ctl.abort(), timeoutMs);
    const marco = d.carimbos.abrir();
    try {
      const novas = await d.buscar(lote, ctl.signal);
      if (!vivo) return false;
      let rebuscar: string[] = [];
      let aplicados: string[] = [];
      let aplicou = false;
      d.gravar((old) => {
        // sem cache = carga completa em voo: ao pousar ela pede a busca-alvo do que foi tocado
        if (!old) return undefined;
        const r = reconciliarCargaAlvo(old, novas, (c) => d.carimbos.tocadoDepois(c.id, c.contatoId, marco));
        rebuscar = r.rebuscar;
        aplicados = r.aplicados;
        aplicou = true;
        return r.lista === old ? undefined : r.lista;   // nada mudou: não grava
      });
      for (const id of lote.ids) tentativas.delete('c:' + id);
      for (const id of lote.contatoIds) tentativas.delete('k:' + id);
      // o que esta busca aplicou é a palavra MAIS NOVA do banco para estes: uma carga (completa ou
      // outra busca) aberta antes e que pouse depois não pode desfazê-la — sem o carimbo, a etapa/IA
      // (que não têm evento próprio garantido) voltariam ao valor velho da carga completa
      if (aplicados.length) d.carimbos.tocar({ ids: aplicados });
      if (rebuscar.length) fila.pedir({ ids: rebuscar });
      return aplicou;
    } catch (e) {
      if (!vivo) return false;
      d.aviso?.('busca-alvo falhou: ' + String((e as Error)?.message ?? e).slice(0, 120));
      recarregarTudo('busca-alvo falhou');
      repetirDepois(lote);
      return false;
    } finally {
      clearT(limite);
      emVoo.delete(ctl);
      d.carimbos.fechar(marco);
    }
  };

  const fila = criarFilaAlvos({
    executar, intervaloMs: d.intervaloMs ?? 1000, atrasoMs: d.atrasoMs ?? 150,
    agora: d.agora, setTimer: d.setTimer, clearTimer: d.clearTimer,
  });

  /* ---- relógio: backstop próprio + refresh enxuto da IA (só com a aba visível) ---- */
  const criadoEm = agora();
  const ultimaCarga = () => Math.max(criadoEm, d.ultimaCargaCompletaEm?.() ?? 0);
  let ultimoBackstop = Number.NEGATIVE_INFINITY;
  let ultimaIa = criadoEm;
  let iaEmVoo = false;
  let timerRelogio: unknown = null;

  const refrescarIa = async () => {
    iaEmVoo = true;
    ultimaIa = agora();
    const cargaNoInicio = d.ultimaCargaCompletaEm?.() ?? 0;
    const ctl = new AbortController();
    emVoo.add(ctl);
    const limite = setT(() => ctl.abort(), timeoutMs);
    const marco = d.carimbos.abrir();
    try {
      const ia = await d.buscarIa!(ctl.signal);
      // uma carga completa partiu/pousou no meio: ela traz IA tão nova quanto esta — não sobrescreve
      if (!vivo || (d.ultimaCargaCompletaEm?.() ?? 0) !== cargaNoInicio) return;
      let mudadas: string[] = [];
      d.gravar((old) => {
        if (!old) return undefined;
        const r = aplicarIaNaLista(old, ia, (c) => d.carimbos.tocadoDepois(c.id, c.contatoId, marco));
        mudadas = r.mudadas;
        return r.lista === old ? undefined : r.lista;
      });
      if (mudadas.length) d.carimbos.tocar({ ids: mudadas });
    } catch (e) {
      if (vivo) d.aviso?.('IA: releitura falhou: ' + String((e as Error)?.message ?? e).slice(0, 120));
    } finally {
      clearT(limite);
      emVoo.delete(ctl);
      d.carimbos.fechar(marco);
      iaEmVoo = false;
    }
  };

  const tique = () => {
    timerRelogio = null;
    if (!vivo) return;
    try {
      if (visivel()) {
        const t = agora();
        if (d.backstopMs && t - Math.max(ultimaCarga(), ultimoBackstop) >= d.backstopMs) {
          // recarga do piso já agendada também serve; senão, direto (sem os 1,5 s do piso)
          if (timerTudo === null) { d.aviso?.('recarga completa: backstop'); d.recarregarTudo('backstop'); }
          ultimoBackstop = t;
        } else if (d.buscarIa && !iaEmVoo && t - Math.max(ultimaIa, ultimaCarga()) >= (d.iaIntervaloMs ?? 60_000)) {
          void refrescarIa();
        }
      }
    } finally {
      agendarRelogio();
    }
  };
  const agendarRelogio = () => {
    if (!vivo || timerRelogio !== null || (!d.backstopMs && !d.buscarIa)) return;
    timerRelogio = setT(tique, d.relogioMs ?? 15_000);
  };
  agendarRelogio();

  return {
    evento(tabela, tipo, novo, velho) {
      if (!vivo) return null;
      try {
        const atual = d.ler();
        const r = rotearEvento(tabela, tipo, novo, velho, atual, d.ctx);
        d.carimbos.tocar({ ids: r.tocarIds, contatoIds: r.tocarContatos });
        if (atual && r.lista && r.lista !== atual) { const nova = r.lista; d.gravar(() => nova); }
        if (r.alvoIds.length || r.alvoContatos.length) fila.pedir({ ids: r.alvoIds, contatoIds: r.alvoContatos });
        if (r.recarregarTudo) recarregarTudo(r.motivo);
        return r;
      } catch (e) {
        d.aviso?.('patch do realtime falhou: ' + String((e as Error)?.message ?? e).slice(0, 120));
        recarregarTudo('erro no patch do realtime');
        return null;
      }
    },
    pedir: (a) => fila.pedir(a),
    agora(a) {
      const lote = loteDe(a);
      d.carimbos.tocar(lote);   // ação do atendente: o banco acabou de mudar para estes
      fila.retirar(lote);       // o que já estava na fila vai nesta busca (sem duplicar)
      return executar(lote);
    },
    recarregarTudo,
    parar() {
      vivo = false;
      fila.parar();
      for (const c of emVoo) c.abort();
      if (timerTudo !== null) clearT(timerTudo);
      timerTudo = null;
      if (timerRelogio !== null) clearT(timerRelogio);
      timerRelogio = null;
      for (const h of timers) clearT(h);
      timers.clear();
    },
  };
}
