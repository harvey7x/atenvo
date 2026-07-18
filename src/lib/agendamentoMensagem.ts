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
  /** Fase 3: quando é mídia, o texto (legenda) é opcional e o que importa é ter o arquivo. */
  ehMidia?: boolean;
  temMidia?: boolean;
}

export interface ResultadoAgendar { ok: boolean; erro: string | null }

export function podeAgendar(i: EntradaAgendar): ResultadoAgendar {
  const texto = (i.texto ?? '').trim();
  if (i.ehMidia) {
    if (!i.temMidia) return { ok: false, erro: 'Anexe o arquivo de mídia.' };
  } else {
    if (!texto) return { ok: false, erro: 'Escreva a mensagem.' };
  }
  if (texto.length > 4096) return { ok: false, erro: 'Mensagem muito longa (máximo 4096 caracteres).' };
  if (!i.temTelefone) return { ok: false, erro: 'Este contato não tem número acionável.' };
  const v = canalValidoParaEnvio(i.canal);
  if (!v.ok) return { ok: false, erro: `Canal indisponível: ${v.motivo}.` };
  if (!Number.isFinite(i.executarEmMs)) return { ok: false, erro: 'Escolha data e hora.' };
  const min = i.minFuturoMs ?? 60_000;
  if (i.executarEmMs < i.agoraMs + min) return { ok: false, erro: 'Escolha um horário no futuro.' };
  return { ok: true, erro: null };
}

/* ===================== Mídia (Fase 3): validação espelhada do evolution-send ===================== */

export type TipoMidia = 'imagem' | 'audio' | 'video' | 'documento';
export const LIM_MIDIA_MB: Record<TipoMidia, number> = { imagem: 16, audio: 16, video: 16, documento: 25 };
const DOC_MIMES_UI = [
  'application/pdf', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain', 'text/csv', 'application/zip', 'application/x-zip-compressed',
];
const DOC_EXTS_UI = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'txt', 'csv', 'ppt', 'pptx', 'zip'];

/** Valida mime/extensão/tamanho do anexo por tipo (mesmas regras do backend). Puro/testável. */
export function midiaValida(tipo: string, mime: string, nome: string, tamanhoBytes: number): ResultadoAgendar {
  const lim = LIM_MIDIA_MB[tipo as TipoMidia];
  if (!lim) return { ok: false, erro: 'Tipo de mídia inválido.' };
  if (tamanhoBytes > lim * 1024 * 1024) return { ok: false, erro: `Arquivo acima de ${lim} MB.` };
  const m = (mime ?? '').toLowerCase();
  if (tipo === 'imagem' && !m.startsWith('image/')) return { ok: false, erro: 'Selecione um arquivo de imagem.' };
  if (tipo === 'audio' && !m.startsWith('audio/')) return { ok: false, erro: 'Selecione um arquivo de áudio.' };
  if (tipo === 'video' && !m.startsWith('video/')) return { ok: false, erro: 'Selecione um arquivo de vídeo.' };
  if (tipo === 'documento') {
    const ext = (nome.split('.').pop() ?? '').toLowerCase();
    if (!DOC_MIMES_UI.includes(m) && !DOC_EXTS_UI.includes(ext)) return { ok: false, erro: 'Formato de documento não suportado.' };
  }
  return { ok: true, erro: null };
}

/* ===================== Padrões, resumo e avisos do modal (Fase 2A) ===================== */

/** America/Sao_Paulo é UTC-3 fixo (Brasil sem horário de verão desde 2019). */
const SP_OFFSET_MS = 3 * 3_600_000;

/** Partes de parede (data yyyy-mm-dd / hora hh:mm) em SP para um instante epoch. Puro/testável. */
export function partesSP(epochMs: number): { data: string; hora: string } {
  const d = new Date(epochMs - SP_OFFSET_MS);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mi = String(d.getUTCMinutes()).padStart(2, '0');
  return { data: `${yyyy}-${mm}-${dd}`, hora: `${hh}:${mi}` };
}

/** Default do modal (Fase 2A): data = hoje, hora = agora + N min (em SP). */
export function defaultQuandoAgendar(agoraMs: number, adiantarMin = 5): { data: string; hora: string } {
  return partesSP(agoraMs + adiantarMin * 60_000);
}

/* ---- máscara/validação de data e hora (inputs visuais, sem picker nativo) ---- */

/** Máscara parcial HH:mm enquanto digita (só dígitos, insere ":"). */
export function mascararHora(raw: string): string {
  const d = (raw || '').replace(/\D/g, '').slice(0, 4);
  return d.length <= 2 ? d : d.slice(0, 2) + ':' + d.slice(2);
}

/** hh:mm válido (00-23:00-59). */
export function horaValida(hhmm: string): boolean {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm || '');
  if (!m) return false;
  return +m[1] <= 23 && +m[2] <= 59;
}

/** Máscara parcial DD/MM/AAAA enquanto digita (só dígitos, insere "/"). */
export function mascararDataBR(raw: string): string {
  const d = (raw || '').replace(/\D/g, '').slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return d.slice(0, 2) + '/' + d.slice(2);
  return d.slice(0, 2) + '/' + d.slice(2, 4) + '/' + d.slice(4);
}

/** DD/MM/AAAA → yyyy-mm-dd se for data real; senão '' (data inválida). */
export function dataBRparaISO(br: string): string {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(br || '');
  if (!m) return '';
  const dd = +m[1], mm = +m[2], yyyy = +m[3];
  const dt = new Date(Date.UTC(yyyy, mm - 1, dd));
  if (dt.getUTCFullYear() !== yyyy || dt.getUTCMonth() !== mm - 1 || dt.getUTCDate() !== dd) return '';
  return `${yyyy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}

/** yyyy-mm-dd → DD/MM/AAAA (para exibição). */
export function isoParaDataBR(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

/** Monta o instante ISO (UTC) a partir de data (yyyy-mm-dd) + hora (hh:mm) tratadas como SP. */
export function montarInstanteSP(data: string, hora: string): string {
  if (!data || !hora) return '';
  const t = new Date(`${data}T${hora}:00-03:00`).getTime();
  return Number.isFinite(t) ? new Date(t).toISOString() : '';
}

export type AtalhoAg = 'hoje5' | 'hojeTarde' | 'amanha9' | 'amanha14' | 'em3dias';

/** Atalhos de data/hora do modal (botões rápidos). Puro/testável; ancorado no dia SP. */
export function atalhoAgendar(atalho: AtalhoAg, agoraMs: number): { data: string; hora: string } {
  const hoje = partesSP(agoraMs).data;
  const DIA = 86_400_000;
  switch (atalho) {
    case 'hoje5':     return partesSP(agoraMs + 5 * 60_000);
    case 'hojeTarde': return { data: hoje, hora: '15:00' };
    case 'amanha9':   return { data: partesSP(agoraMs + DIA).data, hora: '09:00' };
    case 'amanha14':  return { data: partesSP(agoraMs + DIA).data, hora: '14:00' };
    case 'em3dias':   return { data: partesSP(agoraMs + 3 * DIA).data, hora: '09:00' };
    default:          return defaultQuandoAgendar(agoraMs, 5);
  }
}

/** Resumo legível do envio: "Será enviada hoje às 12:35 por RMKT 5". Puro. */
export function resumoEnvio(i: { executarEmMs: number; agoraMs: number; canalNome: string | null | undefined }): string | null {
  if (!Number.isFinite(i.executarEmMs)) return null;
  const alvo = partesSP(i.executarEmMs);
  const hoje = partesSP(i.agoraMs).data;
  const amanha = partesSP(i.agoraMs + 86_400_000).data;
  let quando: string;
  if (alvo.data === hoje) quando = `hoje às ${alvo.hora}`;
  else if (alvo.data === amanha) quando = `amanhã às ${alvo.hora}`;
  else { const [y, m, d] = alvo.data.split('-'); quando = `em ${d}/${m}/${y} às ${alvo.hora}`; }
  const canal = (i.canalNome ?? '').trim() || 'canal selecionado';
  return `Será enviada ${quando} por ${canal}`;
}

/**
 * Aviso discreto (NÃO bloqueia): conversa parada há +24h (fora da janela do WhatsApp) ou
 * agendamento muito distante. Retorna a mensagem mais relevante ou null. Puro/testável.
 */
export function avisoJanelaLonga(i: {
  executarEmMs: number; agoraMs: number; ultimaInteracaoMs?: number | null; distanteDias?: number;
}): string | null {
  if (!Number.isFinite(i.executarEmMs)) return null;
  const parada = typeof i.ultimaInteracaoMs === 'number' && i.ultimaInteracaoMs > 0
    && (i.agoraMs - i.ultimaInteracaoMs) > 24 * 3_600_000;
  if (parada) return 'Esta conversa está parada há mais de 24h — o WhatsApp pode restringir a entrega. O canal será revalidado no envio.';
  const dias = i.distanteDias ?? 7;
  if (i.executarEmMs - i.agoraMs > dias * 86_400_000) return `Agendamento distante (mais de ${dias} dias). O canal será revalidado no momento do envio.`;
  return null;
}

/** Uma linha agendada só pode ser editada/cancelada enquanto está 'agendada'. */
export function agendaEditavel(status: string | null | undefined): boolean {
  return status === 'agendada';
}

/** Falha/bloqueio/expiração podem ser reagendados (voltam pra fila). Terminal deliberado (cancelada) não. */
export function agendaReagendavel(status: string | null | undefined): boolean {
  return status === 'falhou' || status === 'bloqueada' || status === 'expirada';
}

/* ===================== Central de agendamentos (Fase 2B) ===================== */

export type PeriodoAg = 'hoje' | 'amanha' | '7d' | '30d' | 'todas';

/** Janela [desde, até) em epoch ms para o filtro de período, ancorada no dia SP. null = todas. */
export function rangePeriodo(periodo: PeriodoAg, agoraMs: number): { desdeMs: number; ateMs: number } | null {
  const inicioHoje = new Date(montarInstanteSP(partesSP(agoraMs).data, '00:00')).getTime();
  const DIA = 86_400_000;
  switch (periodo) {
    case 'hoje':   return { desdeMs: inicioHoje, ateMs: inicioHoje + DIA };
    case 'amanha': return { desdeMs: inicioHoje + DIA, ateMs: inicioHoje + 2 * DIA };
    case '7d':     return { desdeMs: inicioHoje, ateMs: inicioHoje + 7 * DIA };
    case '30d':    return { desdeMs: inicioHoje, ateMs: inicioHoje + 30 * DIA };
    case 'todas':
    default:       return null;
  }
}

export interface ItemCard { status: string; executarEmMs: number }
export interface ResumoCards { hoje: number; prox7: number; enviadas: number; falhas: number; bloqueadas: number; canceladas: number }

/** Contagens dos cards de resumo. Puro/testável. */
export function contarCards(items: ItemCard[], agoraMs: number): ResumoCards {
  const inicioHoje = new Date(montarInstanteSP(partesSP(agoraMs).data, '00:00')).getTime();
  const fimHoje = inicioHoje + 86_400_000;
  const fim7 = agoraMs + 7 * 86_400_000;
  const r: ResumoCards = { hoje: 0, prox7: 0, enviadas: 0, falhas: 0, bloqueadas: 0, canceladas: 0 };
  for (const it of items) {
    if (it.status === 'agendada' && it.executarEmMs >= inicioHoje && it.executarEmMs < fimHoje) r.hoje++;
    if (it.status === 'agendada' && it.executarEmMs >= agoraMs && it.executarEmMs < fim7) r.prox7++;
    if (it.status === 'enviada') r.enviadas++;
    else if (it.status === 'falhou') r.falhas++;
    else if (it.status === 'bloqueada') r.bloqueadas++;
    else if (it.status === 'cancelada') r.canceladas++;
  }
  return r;
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
