// Helpers PUROS de apresentação dos alertas de SLA (sem React/DB/Date) — testáveis no vitest.

export type SlaSeveridade = 'leve' | 'amarelo' | 'vermelho' | 'critico' | 'imediato';
export type SlaTipo =
  | 'atendimento_sem_resposta'
  | 'cliente_qualificado_aguardando_atendimento'
  | 'lead_quente_aguardando'
  | 'audio_recebido_precisa_humano'
  | 'parado_ha_muito_tempo'
  | 'prazo_2_dias_em_risco'
  | 'prazo_2_dias_estourado';

export interface SlaAlerta {
  id: string;
  tipo: SlaTipo;
  severidade: SlaSeveridade;
  titulo: string;
  detalhe: string | null;
  conversa_id: string | null;
  oportunidade_id: string | null;
  contato_id: string | null;
  responsavel_id: string | null;
  vence_em: string | null;
  criado_em: string;
}

export interface SlaAlertasResumo {
  total: number;
  imediatos: number;
  criticos: number;
  vermelhos: number;
  amarelos: number;
  leves: number;
  itens: SlaAlerta[];
}

export const SEV_RANK: Record<SlaSeveridade, number> = { imediato: 5, critico: 4, vermelho: 3, amarelo: 2, leve: 1 };

export function sevRank(s: SlaSeveridade): number { return SEV_RANK[s] ?? 0; }

export function sevClass(s: SlaSeveridade): string {
  return `sla-${s}`;
}

/** Maior severidade de uma lista (null se vazia). */
export function maxSeveridade(itens: Array<{ severidade: SlaSeveridade }>): SlaSeveridade | null {
  let best: SlaSeveridade | null = null;
  for (const it of itens) {
    if (best === null || sevRank(it.severidade) > sevRank(best)) best = it.severidade;
  }
  return best;
}

export const TIPO_META: Record<SlaTipo, { label: string; emoji: string }> = {
  atendimento_sem_resposta: { label: 'Sem resposta', emoji: '⚠️' },
  cliente_qualificado_aguardando_atendimento: { label: 'Qualificado aguardando', emoji: '🟡' },
  lead_quente_aguardando: { label: 'Lead quente', emoji: '🚨' },
  audio_recebido_precisa_humano: { label: 'Áudio recebido', emoji: '🎧' },
  parado_ha_muito_tempo: { label: 'Parado no Kanban', emoji: '⏳' },
  prazo_2_dias_em_risco: { label: 'Prazo em risco', emoji: '⏰' },
  prazo_2_dias_estourado: { label: '2 dias sem fechamento', emoji: '🚨' },
};
export function tipoLabel(t: SlaTipo): string { return TIPO_META[t]?.label ?? t; }
export function tipoEmoji(t: SlaTipo): string { return TIPO_META[t]?.emoji ?? '•'; }

/** Partes do resumo textual, por severidade (só as > 0). Linguagem "premium" (não alarmista). */
export function resumoPartes(r: Pick<SlaAlertasResumo, 'imediatos' | 'criticos' | 'vermelhos' | 'amarelos' | 'leves'>): string[] {
  const p: string[] = [];
  if (r.imediatos > 0) p.push(`${r.imediatos} imediato${r.imediatos > 1 ? 's' : ''}`);
  if (r.criticos > 0) p.push(`${r.criticos} crítico${r.criticos > 1 ? 's' : ''}`);
  if (r.vermelhos > 0) p.push(`${r.vermelhos} urgente${r.vermelhos > 1 ? 's' : ''}`);
  if (r.amarelos > 0) p.push(`${r.amarelos} em atenção`);
  if (r.leves > 0) p.push(`${r.leves} acompanhamento${r.leves > 1 ? 's' : ''}`);
  return p;
}

/** Intensidade visual: forte (imediato/critico/vermelho), suave (amarelo), discreto (leve). */
export function sevIntensidade(s: SlaSeveridade): 'forte' | 'suave' | 'discreto' {
  if (s === 'imediato' || s === 'critico' || s === 'vermelho') return 'forte';
  if (s === 'amarelo') return 'suave';
  return 'discreto';
}

/** Resumo humano para a barra global (não alarmista). */
export function resumoHumano(r: SlaAlertasResumo): string {
  if (r.total === 0) return '';
  const plural = r.total > 1;
  if (r.imediatos + r.criticos + r.vermelhos > 0) return `${r.total} atendimento${plural ? 's' : ''} aguardando ação`;
  if (r.amarelos > 0) return `${r.total} atendimento${plural ? 's' : ''} aguardando resposta`;
  return `${r.total} acompanhamento${plural ? 's' : ''} pendente${plural ? 's' : ''}`;
}

/** Tempo relativo curto e padronizado dos alertas (nunca minutos gigantes):
    <1min "agora" · 1-59 "há X min" · 60-1439 "há X h" (90→"há 1 h") · 24-47h "há 1 dia" · 2d+ "há X dias". */
export function tempoRelativo(iso: string, nowMs: number = Date.now()): string {
  const ms = nowMs - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 60_000) return 'agora';
  const min = Math.floor(ms / 60_000);
  if (min < 60) return `há ${min} min`;
  if (min < 1440) return `há ${Math.floor(min / 60)} h`;
  const dias = Math.floor(min / 1440);
  return dias === 1 ? 'há 1 dia' : `há ${dias} dias`;
}

/** Frase-status (linha 2 do card), sem número gigante no título. */
export function fraseTipo(t: SlaTipo): string {
  switch (t) {
    case 'atendimento_sem_resposta': return 'Aguardando resposta';
    case 'cliente_qualificado_aguardando_atendimento': return 'Qualificado, aguardando atendente';
    case 'lead_quente_aguardando': return 'Lead quente aguardando';
    case 'audio_recebido_precisa_humano': return 'Cliente enviou áudio';
    case 'parado_ha_muito_tempo': return 'Parado no Kanban';
    case 'prazo_2_dias_em_risco': return 'Perto do prazo de 2 dias';
    case 'prazo_2_dias_estourado': return '2 dias sem fechamento';
    default: return tipoLabel(t);
  }
}

/** Nome de exibição do contato (evita mostrar telefone/numérico cru). */
export function nomeContatoExib(nome: string | null | undefined, _telefone?: string | null): string {
  const n = (nome ?? '').trim();
  if (!n || /^[\d\s()+\-]+$/.test(n)) return 'Cliente sem nome';
  return n;
}

export function resumoTexto(r: SlaAlertasResumo): string {
  const partes = resumoPartes(r);
  return `${r.total} alerta${r.total > 1 ? 's' : ''} de atendimento${partes.length ? ' — ' + partes.join(', ') : ''}.`;
}

/** Indexa alertas por uma chave (conversa_id/oportunidade_id), com a MAIOR severidade primeiro. */
export function indexPorChave(itens: SlaAlerta[], chave: 'conversa_id' | 'oportunidade_id'): Map<string, SlaAlerta[]> {
  const m = new Map<string, SlaAlerta[]>();
  for (const a of itens) {
    const k = a[chave];
    if (!k) continue;
    const arr = m.get(k) ?? [];
    arr.push(a);
    m.set(k, arr);
  }
  for (const arr of m.values()) arr.sort((x, y) => sevRank(y.severidade) - sevRank(x.severidade));
  return m;
}

/** Ordena alertas por severidade desc, depois mais antigo primeiro. */
export function ordenarAlertas(itens: SlaAlerta[]): SlaAlerta[] {
  return [...itens].sort((a, b) => {
    const d = sevRank(b.severidade) - sevRank(a.severidade);
    if (d !== 0) return d;
    return new Date(a.criado_em).getTime() - new Date(b.criado_em).getTime();
  });
}

/** Pode silenciar/resolver: admin/gestor sempre; atendente só se for o responsável. */
export function podeGerirAlerta(role: string | undefined, alerta: Pick<SlaAlerta, 'responsavel_id'>, uid: string | null | undefined): boolean {
  if (role === 'admin' || role === 'gestor') return true;
  return !!uid && alerta.responsavel_id === uid;
}
