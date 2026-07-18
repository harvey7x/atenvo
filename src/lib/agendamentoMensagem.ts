/* Agendamento de mensagens — REGRA PURA (sem React/DB), testada por vitest.
 *
 * Fase 1: texto com escolha de canal. O envio real acontece no backend (Edge
 * `mensagens-agendadas-processar` → `evolution-send` em modo service). Aqui só ficam
 * as decisões puras usadas pela UI (o que pode ser agendado / qual canal é selecionável)
 * e pelo processador (expiração / classificação do resultado) — o processador reimplementa
 * estas 3 funções curtas em Deno, apontando para esta fonte testada. */

/* ===================== Canal selecionável ===================== */

export interface CanalAgendavel {
  id: string;
  nome?: string | null;
  ativo?: boolean | null;
  status_integracao?: string | null; // conectado | desconectado | removido
  envio_restrito?: boolean | null;
  conflito_com?: string | null;
  provider?: string | null;
}

export interface CanalValidade { ok: boolean; motivo: string | null }

/** Um canal só pode ENVIAR se: ativo, conectado, não restrito, não conflitado, não removido. */
export function canalValidoParaEnvio(c: CanalAgendavel | null | undefined): CanalValidade {
  if (!c) return { ok: false, motivo: 'canal não encontrado' };
  if (c.ativo === false) return { ok: false, motivo: 'canal inativo' };
  const st = (c.status_integracao ?? '').toLowerCase();
  if (st === 'removido') return { ok: false, motivo: 'canal removido' };
  if (st && st !== 'conectado') return { ok: false, motivo: 'desconectado' };
  if (c.envio_restrito) return { ok: false, motivo: 'envio restrito' };
  if (c.conflito_com) return { ok: false, motivo: 'canal em conflito' };
  return { ok: true, motivo: null };
}

/** Rótulo curto do canal para o dropdown "Enviar por" (ex.: "ANDRIUS — conectado"). */
export function rotuloCanal(c: CanalAgendavel): string {
  const v = canalValidoParaEnvio(c);
  const nome = (c.nome ?? 'Canal').trim() || 'Canal';
  return v.ok ? `${nome} — conectado` : `${nome} — ${v.motivo}`;
}

/* ===================== Validação do agendamento (UI) ===================== */

export interface EntradaAgendar {
  texto: string | null | undefined;
  canal: CanalAgendavel | null | undefined;
  temTelefone: boolean;
  executarEmMs: number;   // instante escolhido (epoch ms)
  agoraMs: number;
  /** margem mínima no futuro (default 60s) — evita "agendar" para já / passado por atraso de clique. */
  minFuturoMs?: number;
}

export interface ResultadoAgendar { ok: boolean; erro: string | null }

export function podeAgendar(i: EntradaAgendar): ResultadoAgendar {
  const texto = (i.texto ?? '').trim();
  if (!texto) return { ok: false, erro: 'Escreva a mensagem.' };
  if (texto.length > 4096) return { ok: false, erro: 'Mensagem muito longa (máximo 4096 caracteres).' };
  if (!i.temTelefone) return { ok: false, erro: 'Este contato não tem número acionável.' };
  const v = canalValidoParaEnvio(i.canal);
  if (!v.ok) return { ok: false, erro: `Canal indisponível: ${v.motivo}.` };
  if (!Number.isFinite(i.executarEmMs)) return { ok: false, erro: 'Escolha data e hora.' };
  const min = i.minFuturoMs ?? 60_000;
  if (i.executarEmMs < i.agoraMs + min) return { ok: false, erro: 'Escolha um horário no futuro.' };
  return { ok: true, erro: null };
}

/* ===================== Decisões do processador ===================== */

/** Follow-up muito atrasado não deve disparar surpresa: além da janela, expira. */
export function estaExpirada(executarEmMs: number, agoraMs: number, janelaHoras = 24): boolean {
  return agoraMs - executarEmMs > janelaHoras * 3_600_000;
}

export type StatusAgendada =
  | 'agendada' | 'processando' | 'enviada' | 'falhou' | 'cancelada' | 'expirada' | 'bloqueada';

export interface ResultadoEnvio {
  ok: boolean;
  /** true quando o motivo é o canal (restrito/desconectado/removido/conflito) */
  problemaCanal?: boolean;
  erro?: string | null;
}

/**
 * Próximo status de uma linha em 'processando' após tentar enviar.
 *   sucesso                      → enviada
 *   problema de canal            → bloqueada (não adianta retry imediato pelo mesmo canal)
 *   outro erro, ainda há retry   → agendada (volta pra fila, tenta no próximo ciclo)
 *   outro erro, esgotou tentativas → falhou
 */
export function proximoStatus(r: ResultadoEnvio, tentativas: number, maxTentativas: number): StatusAgendada {
  if (r.ok) return 'enviada';
  if (r.problemaCanal) return 'bloqueada';
  return tentativas >= maxTentativas ? 'falhou' : 'agendada';
}
