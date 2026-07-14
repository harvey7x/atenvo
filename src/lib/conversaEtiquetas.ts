/* Etiquetas do item da lista de conversas (padrão WhatsApp Business):
     NOME DO CLIENTE
     Última mensagem
     [LEAD NOVO]          -> lead não assumido, sem oportunidade avançada
     [MATHEUS] [CONTRATOS] -> atendente + etapa do Kanban
   Puro (sem React/DB) — testado por vitest. */

export type EtiquetaTipo = 'lead' | 'atendente' | 'etapa';
export type EtapaVariante = 'ganho' | 'perdido' | 'neutro';
export interface EtiquetaConversa { tipo: EtiquetaTipo; texto: string; variante?: EtapaVariante }

export interface ConversaEtiquetaInput {
  /** 1ª preferência: conversas.atendente_id */
  atendenteId?: string | null;
  /** 2ª preferência: contatos.responsavel_id */
  respId?: string | null;
  /** 3ª preferência: responsável da oportunidade */
  oppRespId?: string | null;
  /** nome da coluna atual do Kanban (ex.: "CONTRATOS") */
  etapa?: string | null;
  /** a coluna é a ENTRADA do funil (LEAD NOVO) — não conta como "oportunidade avançada" */
  etapaEntrada?: boolean;
  /** resultado da coluna (funil_colunas.resultado) — só para a cor da etiqueta */
  etapaResultado?: EtapaVariante | null;
}

/** Primeiro nome em MAIÚSCULO (pt-BR). '' quando não há nome. */
export function primeiroNomeUpper(nome: string | null | undefined): string {
  const n = (nome ?? '').trim();
  if (!n) return '';
  return (n.split(/\s+/)[0] ?? '').toLocaleUpperCase('pt-BR');
}

/** Responsável efetivo, na ordem de preferência: conversa -> contato -> oportunidade. */
export function responsavelEfetivo(c: ConversaEtiquetaInput): string | null {
  return c.atendenteId || c.respId || c.oppRespId || null;
}

/** LEAD NOVO: ninguém assumiu E não há oportunidade avançada (sem opp, ou ainda na entrada do funil). */
export function ehLeadNovo(c: ConversaEtiquetaInput): boolean {
  if (responsavelEfetivo(c)) return false;
  const etapa = (c.etapa ?? '').trim();
  return !etapa || c.etapaEntrada === true;
}

/** Etiquetas do item, na ordem de exibição. Lead novo => SOMENTE [LEAD NOVO]. */
export function etiquetasDaConversa(
  c: ConversaEtiquetaInput,
  nomePorId: (id: string) => string | null | undefined,
): EtiquetaConversa[] {
  if (ehLeadNovo(c)) return [{ tipo: 'lead', texto: 'LEAD NOVO' }];

  const out: EtiquetaConversa[] = [];
  const respId = responsavelEfetivo(c);
  if (respId) {
    // sem nome resolvido (usuário fora da lista da org) -> ainda sinaliza que está assumido
    out.push({ tipo: 'atendente', texto: primeiroNomeUpper(nomePorId(respId)) || 'ATENDENTE' });
  }
  const etapa = (c.etapa ?? '').trim();
  if (etapa) {
    out.push({ tipo: 'etapa', texto: etapa.toLocaleUpperCase('pt-BR'), variante: c.etapaResultado ?? 'neutro' });
  }
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
