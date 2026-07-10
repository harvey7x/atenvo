import type { SlaSeveridade, SlaTipo } from '@/data/slaView';

/* Classificação visual do Inbox em 3 blocos (Urgentes / Atenção / Acompanhamentos).
   Puro e testável. NÃO decide nada no backend — só organiza a lista já carregada. */

export type Grupo = 'urgente' | 'atencao' | 'acompanhamento' | 'backlog';

const NOVO_MAX_MIN = 120;    // "novo" só até 2h
const BACKLOG_MIN = 2880;    // > 48h = backlog antigo

export interface SinaisConversa {
  aguardando: boolean;                 // última mensagem real é do cliente (aguardando resposta)
  aguardandoDesde: string | null;      // ISO da última mensagem do cliente
  temResponsavel: boolean;             // contatos.responsavel_id preenchido
  houveResposta: boolean;              // já houve alguma saída (out) na conversa
  primeiraMensagem: boolean;           // conversa com uma única mensagem (só o inbound)
  precisaHumano: boolean;              // conversas.precisa_humano
  sevAlerta: SlaSeveridade | null;     // maior severidade do alerta SLA ativo, se houver
  tipoAlerta: SlaTipo | null;
}

export function minutosDesde(iso: string | null, nowMs: number = Date.now()): number | null {
  if (!iso) return null;
  const ms = nowMs - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return 0;
  return Math.floor(ms / 60000);
}

/** Faixa de tempo (mesma hierarquia do inbox atual): <30min neutro · 30–120 âmbar · 120–1440 vermelho · >1440 crítico. */
export function tierTempo(min: number | null): 'neutro' | 'ambar' | 'vermelho' | 'critico' {
  if (min == null) return 'neutro';
  if (min >= 1440) return 'critico';
  if (min >= 120) return 'vermelho';
  if (min >= 30) return 'ambar';
  return 'neutro';
}

/** Tempo curto e humano para o topo do card: "13 min" / "1 h" / "1 dia" / "2 dias" / "agora". */
export function tempoCurto(iso: string | null, nowMs: number = Date.now()): string {
  const min = minutosDesde(iso, nowMs);
  if (min == null || min < 1) return 'agora';
  if (min < 60) return `${min} min`;
  if (min < 1440) return `${Math.floor(min / 60)} h`;
  const dias = Math.floor(min / 1440);
  return dias === 1 ? '1 dia' : `${dias} dias`;
}

/** Cliente NOVO: aguardando, sem responsável, sem nenhuma saída E idade < 2h.
    (o corte de idade impede "NOVO" em conversa de vários dias.) */
export function isNovo(s: SinaisConversa, nowMs: number = Date.now()): boolean {
  if (!(s.aguardando && !s.temResponsavel && !s.houveResposta)) return false;
  const min = minutosDesde(s.aguardandoDesde, nowMs);
  return min != null && min < NOVO_MAX_MIN;
}

const ALERTA_CRITICO = (s: SinaisConversa): boolean =>
  s.precisaHumano || s.sevAlerta === 'imediato' || s.sevAlerta === 'critico'
  || s.tipoAlerta === 'lead_quente_aguardando' || s.tipoAlerta === 'audio_recebido_precisa_humano';

/** Regra final aprovada de classificação (só usada na aba Prioridade). */
export function classificar(s: SinaisConversa, nowMs: number = Date.now()): Grupo {
  if (ALERTA_CRITICO(s)) return 'urgente';                       // áudio/lead quente/imediato/crítico
  const min = s.aguardando ? minutosDesde(s.aguardandoDesde, nowMs) : null;
  if (isNovo(s, nowMs)) return 'urgente';                        // lead novo recente (< 2h)
  if (min != null && min >= BACKLOG_MIN) return 'backlog';       // aguardando > 48h → backlog antigo
  if (min != null && min >= NOVO_MAX_MIN) return 'atencao';      // 2h–48h → Atenção
  if (s.sevAlerta === 'amarelo') return 'atencao';
  return 'acompanhamento';                                       // responsável / já respondido / leve / normal
}

export type StatusKind = 'audio' | 'lead_quente' | 'primeira_mensagem' | 'aguardando_primeira' | 'aguardando' | 'em_acompanhamento';

export function statusKind(s: SinaisConversa, nowMs: number = Date.now()): StatusKind {
  if (s.tipoAlerta === 'audio_recebido_precisa_humano') return 'audio';
  if (s.tipoAlerta === 'lead_quente_aguardando') return 'lead_quente';
  if (isNovo(s, nowMs)) return s.primeiraMensagem ? 'primeira_mensagem' : 'aguardando_primeira';
  if (s.aguardando) return 'aguardando';
  return 'em_acompanhamento';
}
