import type { WaContact } from '@/data/whatsappDemo';
import { responsavelEfetivo } from '@/lib/conversaEtiquetas';
import { situacaoDe } from './waUi';

/* ------------------------------------------------------------------
   Filtro do inbox — REGRA compartilhada desktop (WhatsApp.tsx) × mobile
   (ListaConversasMobile). Extraída VERBATIM do passaBase do desktop em
   18/09 (paridade dos filtros no celular, pedido do dono); mudar uma
   cláusula aqui muda as DUAS telas juntas — nunca reimplementar lá.
   Semântica: multi-seleção DENTRO da faceta = OU; entre facetas = E.
   "QR (não oficial)" = tudo que NÃO é o oficial (inclui canal removido/
   histórico e transporte desconhecido). transporte com os 2 = sem efeito.
   ------------------------------------------------------------------ */

export const SITUACAO_OPCOES: ReadonlyArray<readonly [string, string]> = [
  ['lead', 'Lead novo'], ['atendimento', 'Em atendimento'], ['aguardando', 'Aguardando cliente'],
  ['ganho', 'Fechado'], ['perdido', 'Perdido'], ['cancelado', 'Cancelado'],
];
export const IA_OPCOES: ReadonlyArray<readonly [string, string]> = [
  ['ativa', 'Com IA ativa'], ['pausada', 'IA pausada / handoff'], ['humano', 'Precisa de humano'],
];
export const PERIODO_OPCOES: ReadonlyArray<readonly [string, string]> = [['hoje', 'Hoje'], ['7d', '7 dias'], ['30d', '30 dias']];

export interface FiltrosInbox {
  canais: Set<string>;
  transporte: Set<string>;
  etapas: Set<string>;
  etiquetas: Set<string>;
  atendentes: Set<string>;   // '' = Não atribuído
  ia: Set<string>;
  situacao: Set<string>;
  naoLidas: boolean;
  arquivadas: boolean;       // ligado = SÓ arquivadas (e a tela revela as arquivadas)
  periodo: string | null;    // 'hoje' | '7d' | '30d'
}
export interface CtxFiltroInbox {
  term: string;                                                   // busca já trim().toLowerCase()
  relogioMs: number;                                              // relógio do inbox (tick 60s)
  transporteDe: (id: string | null | undefined) => string | null; // canalPorId.get(id)?.transporte
}

export const FILTROS_VAZIOS = (): FiltrosInbox => ({
  canais: new Set(), transporte: new Set(), etapas: new Set(), etiquetas: new Set(),
  atendentes: new Set(), ia: new Set(), situacao: new Set(),
  naoLidas: false, arquivadas: false, periodo: null,
});

export const contarFiltros = (f: FiltrosInbox): number =>
  f.canais.size + f.transporte.size + f.etapas.size + f.etiquetas.size + f.atendentes.size +
  f.ia.size + f.situacao.size + (f.naoLidas ? 1 : 0) + (f.arquivadas ? 1 : 0) + (f.periodo ? 1 : 0);

export const dentroPeriodoInbox = (periodo: string | null, ms: number | undefined | null, relogioMs: number): boolean => {
  if (!periodo) return true;
  if (!ms) return false;
  if (periodo === 'hoje') { const d = new Date(relogioMs); d.setHours(0, 0, 0, 0); return ms >= d.getTime(); }
  const dias = periodo === '7d' ? 7 : 30;
  return relogioMs - ms <= dias * 86_400_000;
};

export const passaFiltroInbox = (c: WaContact, f: FiltrosInbox, ctx: CtxFiltroInbox): boolean =>
  (f.canais.size === 0 || (!!c.canalId && f.canais.has(c.canalId))) &&
  (f.transporte.size === 0 || f.transporte.size === 2 || (f.transporte.has('cloud_api')
    ? ctx.transporteDe(c.canalId) === 'cloud_api'
    : ctx.transporteDe(c.canalId) !== 'cloud_api')) &&
  (f.etapas.size === 0 || (!!c.etapa && f.etapas.has(c.etapa))) &&
  (f.etiquetas.size === 0 || c.tags.some((t) => f.etiquetas.has(t))) &&
  (f.atendentes.size === 0 || f.atendentes.has(responsavelEfetivo(c) ?? '')) &&
  (f.ia.size === 0 || (
    (f.ia.has('ativa') && !!c.iaAtiva) ||
    (f.ia.has('pausada') && (c.iaStatus === 'pausada' || c.iaStatus === 'handoff')) ||
    (f.ia.has('humano') && !!c.precisaHumano)
  )) &&
  // Situação REUSA situacaoDaConversa (via situacaoDe) — a MESMA fonte do chip da lista (read-only).
  (f.situacao.size === 0 || f.situacao.has(situacaoDe(c).variante)) &&
  (!f.naoLidas || (c.unread ?? 0) > 0) &&
  (!f.arquivadas || !!c.arquivada) &&
  dentroPeriodoInbox(f.periodo, c.lastAtMs, ctx.relogioMs) &&
  (!ctx.term || c.name.toLowerCase().includes(ctx.term) || c.last.toLowerCase().includes(ctx.term) || (c.phone ?? '').toLowerCase().includes(ctx.term));

/** Opções da faceta "Etapa do Kanban": derivadas DA PRÓPRIA lista (sem query extra). */
export const etapasDaLista = (contacts: WaContact[]): { nome: string; cor: string | null }[] => {
  const m = new Map<string, string | null>();
  for (const c of contacts) {
    const nome = (c.etapa ?? '').trim();
    if (nome && !m.has(nome)) m.set(nome, c.etapaCor ?? null);
  }
  return [...m.entries()].map(([nome, cor]) => ({ nome, cor })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
};
