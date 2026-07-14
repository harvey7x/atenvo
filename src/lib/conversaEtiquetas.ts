/* Etiquetas do item da lista de conversas (padrão WhatsApp Business):
     NOME DO CLIENTE
     Última mensagem
     [ATENDENTE] [SITUAÇÃO] [CANAL ATUAL]
   Puro (sem React/DB) — testado por vitest. */

export type EtiquetaTipo = 'atendente' | 'situacao' | 'canal';
export type SituacaoVariante = 'lead' | 'atendimento' | 'aguardando' | 'etapa' | 'ganho' | 'perdido' | 'cancelado';
export type OppStatus = 'em_andamento' | 'ganho' | 'perdido' | 'cancelado';
export interface EtiquetaConversa { tipo: EtiquetaTipo; texto: string; variante?: SituacaoVariante }

export interface ConversaEtiquetaInput {
  /** 1ª preferência: conversas.atendente_id */
  atendenteId?: string | null;
  /** 2ª preferência: contatos.responsavel_id */
  respId?: string | null;
  /** 3ª preferência: oportunidades.responsavel_id */
  oppRespId?: string | null;
  /** nome da coluna atual do Kanban */
  etapa?: string | null;
  /** a coluna é a ENTRADA do funil (não é etapa avançada) */
  etapaEntrada?: boolean;
  /** status da oportunidade (ganho/perdido/cancelado vencem a etapa) */
  oppStatus?: OppStatus | null;
  /** conversa aguardando resposta do cliente */
  aguardando?: boolean;
  /** CANAL ATUAL do atendimento (conversas.canal_id -> nome). Ex.: ANDRIUS, URA, LUIZA, RMKT */
  canalAtual?: string | null;
}

/** Primeiro nome em MAIÚSCULO (pt-BR). '' quando não há nome. */
export function primeiroNomeUpper(nome: string | null | undefined): string {
  const n = (nome ?? '').trim();
  if (!n) return '';
  return (n.split(/\s+/)[0] ?? '').toLocaleUpperCase('pt-BR');
}

/** Responsável efetivo: conversa -> contato -> oportunidade. */
export function responsavelEfetivo(c: ConversaEtiquetaInput): string | null {
  return c.atendenteId || c.respId || c.oppRespId || null;
}

/** LEAD NOVO: ninguém assumiu E não há oportunidade avançada (sem opp, ou ainda na entrada do funil). */
export function ehLeadNovo(c: ConversaEtiquetaInput): boolean {
  if (responsavelEfetivo(c)) return false;
  if (c.oppStatus && c.oppStatus !== 'em_andamento') return false; // ganho/perdido/cancelado não é lead novo
  const etapa = (c.etapa ?? '').trim();
  return !etapa || c.etapaEntrada === true;
}

/** SITUAÇÃO (uma só etiqueta). Precedência, do mais forte ao mais fraco:
 *   1) resultado da oportunidade  -> CLIENTE FECHADO / PERDIDO / CANCELADO
 *   2) etapa AVANÇADA do Kanban   -> DOCUMENTOS, CONTRATOS, PROCURAÇÃO, ...
 *   3) sem responsável na entrada -> LEAD NOVO
 *   4) com responsável, esperando -> AGUARDANDO CLIENTE
 *   5) com responsável            -> EM ATENDIMENTO
 * A coluna de ENTRADA nunca vira texto cru: com atendente ela lê "EM ATENDIMENTO", nunca "LEAD NOVO". */
export function situacaoDaConversa(c: ConversaEtiquetaInput): { texto: string; variante: SituacaoVariante } {
  if (c.oppStatus === 'ganho')     return { texto: 'CLIENTE FECHADO', variante: 'ganho' };
  if (c.oppStatus === 'perdido')   return { texto: 'PERDIDO', variante: 'perdido' };
  if (c.oppStatus === 'cancelado') return { texto: 'CANCELADO', variante: 'cancelado' };

  const etapa = (c.etapa ?? '').trim();
  const avancada = !!etapa && c.etapaEntrada !== true;
  if (avancada) return { texto: etapa.toLocaleUpperCase('pt-BR'), variante: 'etapa' };

  if (!responsavelEfetivo(c)) return { texto: 'LEAD NOVO', variante: 'lead' };
  if (c.aguardando)           return { texto: 'AGUARDANDO CLIENTE', variante: 'aguardando' };
  return { texto: 'EM ATENDIMENTO', variante: 'atendimento' };
}

/** Etiquetas do item, na ordem: [ATENDENTE] [SITUAÇÃO] [CANAL ATUAL]. */
export function etiquetasDaConversa(
  c: ConversaEtiquetaInput,
  nomePorId: (id: string) => string | null | undefined,
): EtiquetaConversa[] {
  const out: EtiquetaConversa[] = [];

  const respId = responsavelEfetivo(c);
  if (respId) {
    // sem nome resolvido (usuário fora da equipe carregada) -> ainda sinaliza que foi assumido
    out.push({ tipo: 'atendente', texto: primeiroNomeUpper(nomePorId(respId)) || 'ATENDENTE' });
  }

  const s = situacaoDaConversa(c);
  out.push({ tipo: 'situacao', texto: s.texto, variante: s.variante });

  const canal = (c.canalAtual ?? '').trim();
  if (canal) out.push({ tipo: 'canal', texto: canal.toLocaleUpperCase('pt-BR') });

  return out;
}

/* ---------------- preview da última mensagem ---------------- */
function duracao(seg?: number | null): string {
  const s = Math.floor(seg ?? 0);
  if (!s || s <= 0) return '';
  return ` (${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')})`;
}

export interface PreviewMsgInput { tipo?: string | null; texto?: string | null; seconds?: number | null; ptt?: boolean | null }

/** Preview curto e limpo. Texto/legenda vence; sem texto, rótulo da mídia. */
export function previewUltimaMensagem(m?: PreviewMsgInput | null): string {
  if (!m) return '';
  const t = (m.texto ?? '').trim();
  if (t) return t;                                     // texto ou legenda da mídia
  switch (m.tipo) {
    case 'audio':     return (m.ptt === false ? 'Áudio' : 'Mensagem de voz') + duracao(m.seconds);
    case 'imagem':    return 'Imagem';
    case 'video':     return 'Vídeo';
    case 'documento': return 'Documento';
    default:          return m.tipo ? 'Mensagem' : '';
  }
}
