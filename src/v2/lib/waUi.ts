import { mascararNumero } from '@/data/whatsapp';
import type { WaContact } from '@/data/whatsappDemo';
import { situacaoDaConversa, type ConversaEtiquetaInput } from '@/lib/conversaEtiquetas';
import { formatarNomeCliente } from '@/lib/nomeCliente';

/* ------------------------------------------------------------------
   Helpers puros do inbox (extraídos de src/v2/pages/WhatsApp.tsx,
   verbatim) — compartilhados entre o desktop e as telas mobile.
   Regra: aqui só função pura de apresentação; lógica de negócio
   continua em useInboxWhatsApp / src/data/*.
   ------------------------------------------------------------------ */

export const ackOf = (status?: string): { s: string; cls: string; title: string } | null =>
  status === 'lida' ? { s: '✓✓', cls: 'lida', title: 'Lida' }
  : status === 'entregue' ? { s: '✓✓', cls: 'entregue', title: 'Entregue' }
  : status === 'enviada' ? { s: '✓', cls: 'enviada', title: 'Enviada' }
  : status === 'pendente' ? { s: '🕗', cls: 'pendente', title: 'Pendente' }
  : status === 'falhou' ? { s: '!', cls: 'falhou', title: 'Falhou' }
  : null;

/** Tamanho de arquivo adaptativo B/KB/MB (paridade v1 L136): evita '0.0 MB' para poucos KB. */
export const fmtTam = (b?: number | null): string =>
  !b ? '' : b < 1024 ? b + ' B' : b < 1_048_576 ? (b / 1024).toFixed(0) + ' KB' : (b / 1_048_576).toFixed(1) + ' MB';

/** Tiers da barra lateral de espera (v1 L75-89): <30min neutro · 30min–2h âmbar · 2–24h vermelho · ≥24h crítico. */
export function tierEspera(aguardandoDesde: string | null | undefined, agoraMs: number): { tier: string; label: string } | null {
  if (!aguardandoDesde) return null;
  const min = Math.floor((agoraMs - new Date(aguardandoDesde).getTime()) / 60_000);
  if (!Number.isFinite(min) || min < 0) return null;
  const label = min < 1 ? 'Aguardando agora' : min < 60 ? `Aguardando há ${min} min` : min < 1440 ? `Aguardando há ${Math.floor(min / 60)} h` : `Aguardando há ${Math.floor(min / 1440)} d`;
  const tier = min < 30 ? 'neutro' : min < 120 ? 'ambar' : min < 1440 ? 'vermelho' : 'critico';
  return { tier, label };
}
export const nomeVazio = (n: string | undefined) => !n?.trim() || /^[\d\s()+\-]+$/.test(n ?? '');
export const nomeExibicao = (c: WaContact) => (nomeVazio(c.name) ? (c.phone ? mascararNumero(c.phone) : 'Cliente sem nome') : formatarNomeCliente(c.name));
/** Situação derivada (v1: sempre há um chip — LEAD NOVO / EM ATENDIMENTO / AGUARDANDO / FECHADO / etapa). */
export const entradaEtiqueta = (c: WaContact): ConversaEtiquetaInput => ({
  atendenteId: c.atendenteId, respId: c.respId, oppRespId: c.oppRespId, etapa: c.etapa, etapaEntrada: c.etapaEntrada,
  oppStatus: c.oppStatus ?? undefined, aguardando: c.aguardando, canalAtual: c.canalAtual,
});
export const situacaoDe = (c: WaContact) => situacaoDaConversa(entradaEtiqueta(c));
/** Cor da coluna do Kanban só quando o texto exibido É o nome da etapa avançada (v1 corDaEtapa). */
export const corDaSituacao = (c: WaContact, texto: string): string | null => {
  const nomeCol = (c.etapa ?? '').trim().toLocaleUpperCase('pt-BR');
  return c.etapaCor && nomeCol && texto === nomeCol ? c.etapaCor : null;
};
export const mmss = (s: number | null | undefined) => (s == null ? '' : `${Math.floor(s / 60)}:${('0' + Math.floor(s % 60)).slice(-2)}`);
export const ONDA = [6, 11, 15, 9, 13, 17, 11, 7, 14, 10, 16, 8, 12, 6, 10, 15];
