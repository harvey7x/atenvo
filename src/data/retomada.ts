import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useOrg } from '@/context/OrgContext';

/* ------------------------------------------------------------------
   RETOMADA AUTOMÁTICA no Atendimento (25/11). No sistema que a Reviza usava antes havia "follow-ups":
   mensagens que vão sozinhas quando o cliente para de responder; se ele responde, param. Aqui: uma
   SEQUÊNCIA por etapa do Kanban, até 12 mensagens, cada uma com o tempo de espera sem resposta e o texto
   ({nome}, {primeiro_nome}, {atendente}). A chave geral nasce DESLIGADA.
   Servidor: migration 103 (atd_retomada_config, atd_retomada_sequencias, atd_retomada_envios e o critério
   atd_retomada_proximos) + a função retomada-processar, que roda a cada minuto e manda UMA de cada vez.
   As contas puras abaixo (texto, vencimento do passo, horário de São Paulo, intervalo e teto) são as
   mesmas do servidor e estão testadas em retomada.test.ts — a função do servidor tem uma cópia do texto.
   DEMO É O CONTRATO: sem backend os mesmos hooks guardam no navegador (sequências de exemplo e um
   histórico inventado, nada de cliente de verdade).
   ------------------------------------------------------------------ */

export const RETOMADA_REAL: boolean = isSupabaseConfigured && !!supabase;

export interface PassoRetomada { esperaMin: number; texto: string; exemplo?: boolean }
export interface SequenciaRetomada { id: string; funilId: string; colunaId: string; ativo: boolean; passos: PassoRetomada[]; ativadaEm: string | null; atualizadoEm: string | null }
export interface ConfigRetomada {
  ativo: boolean;
  /** 0 = domingo … 6 = sábado (horário de São Paulo) */
  dias: number[];
  horaIni: string; // "08:00"
  horaFim: string; // "20:00" (até "24:00")
  intervaloS: number;
  tetoDia: number;
  ligadoEm: string | null;
}
export type StatusEnvio = 'agendado' | 'enviado' | 'cancelado' | 'falhou';
export interface EnvioRetomada { id: string; conversaId: string | null; cliente: string; etapa: string; passo: number; totalPassos: number | null; quando: string; status: StatusEnvio; motivo: string | null; texto: string | null }
export interface EtapaFunil { funilId: string; funilNome: string; colunaId: string; colunaNome: string; ordem: number }

/* ---------------- limites (os mesmos da migration 103) ---------------- */
export const MAX_PASSOS = 12;
export const ESPERA_MIN = 60;          // 1 hora
export const ESPERA_MAX = 30 * 1440;   // 30 dias
export const TEXTO_MAX = 1000;
export const INTERVALO_MIN_S = 45;     // anti-spam: nunca menos que isto entre duas retomadas do mesmo número
export const INTERVALO_MAX_S = 3600;
export const INTERVALO_PADRAO_S = 90;
export const TETO_PADRAO = 80;
export const TETO_MAX = 500;
/** o agendador do servidor roda uma vez por minuto e manda no máximo UMA retomada por número a cada rodada */
export const RODADA_S = 60;
export const FUSO = 'America/Sao_Paulo';

export const CONFIG_PADRAO: ConfigRetomada = { ativo: false, dias: [1, 2, 3, 4, 5], horaIni: '08:00', horaFim: '20:00', intervaloS: INTERVALO_PADRAO_S, tetoDia: TETO_PADRAO, ligadoEm: null };

/* ---------------- o texto: variáveis ---------------- */
export const VARIAVEIS = [
  { chave: '{primeiro_nome}', rotulo: 'Primeiro nome', exemplo: 'Maria' },
  { chave: '{nome}', rotulo: 'Nome completo', exemplo: 'Maria da Silva' },
  { chave: '{atendente}', rotulo: 'Atendente', exemplo: 'Ana' },
] as const;
/** sem atendente na conversa, {atendente} vira isto */
export const SEM_ATENDENTE = 'nossa equipe';
export const ROTULO_EXEMPLO = 'Texto de exemplo — troque pelo seu';

const PARTICULAS = new Set(['da', 'de', 'do', 'das', 'dos', 'e', 'di', 'du', 'del']);
const maiuscula = (p: string) => p.split('-').map((x) => x.charAt(0).toUpperCase() + x.slice(1)).join('-');
/** o nome como gente escreve: "MARIA DA SILVA" → "Maria da Silva". Quem veio com maiúsculas e minúsculas
 *  misturadas fica como está (foi escrito assim de propósito). Só número (contato sem nome) = vazio. */
export function nomeBonito(bruto: string | null | undefined): string {
  const s = (bruto ?? '').replace(/\s+/g, ' ').trim();
  if (!s || !/\p{L}/u.test(s)) return '';
  if (s !== s.toUpperCase() && s !== s.toLowerCase()) return s;
  return s.toLowerCase().split(' ').map((p, i) => (i > 0 && PARTICULAS.has(p) ? p : maiuscula(p))).join(' ');
}
export const primeiroNome = (bruto: string | null | undefined): string => nomeBonito(bruto).split(' ')[0] ?? '';

const RE_VARIAVEL = /\{\s*(nome|primeiro_nome|atendente)\s*\}/gi;
const VAZIO = '\uE000'; // marca onde uma variável ficou vazia (caractere de uso privado: nunca aparece em texto de gente)
/** troca as variáveis. Quando o cliente não tem nome, a pontuação em volta se ajeita ("Oi, {primeiro_nome}!" vira
 *  "Oi!"); o resto do texto fica EXATAMENTE como foi escrito. Espelhada em functions/retomada-processar. */
export function renderizarTexto(texto: string, dados: { nome?: string | null; atendente?: string | null }): string {
  const nome = nomeBonito(dados.nome);
  const valores: Record<string, string> = { nome, primeiro_nome: nome.split(' ')[0] ?? '', atendente: primeiroNome(dados.atendente) || SEM_ATENDENTE };
  let t = (texto ?? '').replace(RE_VARIAVEL, (_m, v: string) => valores[v.toLowerCase()] || VAZIO);
  if (!t.includes(VAZIO)) return t.trim();
  t = t.replace(/^([ \t]*)\uE000+[ \t]*[,;:][ \t]*/gm, '$1') // "␀, tudo bem?" no começo → "tudo bem?"
    .replace(/[ \t]*,?[ \t]*\uE000+(?=[!?.,;:])/g, '')       // "Oi, ␀!" → "Oi!" · "Olá ␀, tudo bem?" → "Olá, tudo bem?"
    .replace(/^[ \t]*\uE000+[ \t]*/gm, '')                  // começo da linha
    .replace(/[ \t]*,?[ \t]*\uE000+[ \t]*$/gm, '')          // fim da linha
    .replace(/[ \t]*\uE000+[ \t]*/g, ' ');                  // no meio da frase
  return t.trim();
}
/** prévia com um cliente de exemplo */
export const previaTexto = (texto: string) => renderizarTexto(texto, { nome: 'Maria da Silva', atendente: 'Ana' });

/* ---------------- a espera ---------------- */
export type UnidadeEspera = 'horas' | 'dias';
export function separarEspera(min: number): { valor: number; unidade: UnidadeEspera } {
  if (min >= 1440 && min % 1440 === 0) return { valor: min / 1440, unidade: 'dias' };
  return { valor: Math.max(1, Math.round(min / 60)), unidade: 'horas' };
}
export const juntarEspera = (valor: number, unidade: UnidadeEspera): number => Math.round(valor) * (unidade === 'dias' ? 1440 : 60);
/** "6 h", "1 dia", "2 dias" */
export function esperaCurta(min: number): string {
  const { valor, unidade } = separarEspera(min);
  return unidade === 'dias' ? `${valor} ${valor === 1 ? 'dia' : 'dias'}` : `${valor} h`;
}
/** "6 horas", "1 dia" */
export function esperaLonga(min: number): string {
  const { valor, unidade } = separarEspera(min);
  return unidade === 'dias' ? `${valor} ${valor === 1 ? 'dia' : 'dias'}` : `${valor} ${valor === 1 ? 'hora' : 'horas'}`;
}

/* ---------------- quando o próximo passo vence (o mesmo critério do servidor) ----------------
   O tempo conta da ÚLTIMA MENSAGEM NOSSA (do atendente, da IA ou a anterior desta sequência). O ciclo é a última
   mensagem do cliente: respondeu → ciclo novo → recomeça do 1º passo. Só entra quem já falou com a gente, quem ficou
   sem resposta DEPOIS de ligar (`inicio`), sem envio que falhou no ciclo e sem texto de exemplo na sequência. */
export interface EstadoConversa { ultimaNossaEm: number | null; ultimaDoClienteEm: number | null; enviadosNoCiclo: number; falhouNoCiclo?: boolean; inicio: number }
export function proximoPasso(passos: PassoRetomada[], e: EstadoConversa, agora: number): { passo: number; venceEm: number; vencido: boolean } | null {
  if (e.ultimaDoClienteEm == null || e.ultimaNossaEm == null) return null;
  if (e.ultimaNossaEm <= e.ultimaDoClienteEm) return null; // a última palavra é do cliente: é a nossa vez, não retomada
  if (e.ultimaNossaEm < e.inicio || e.falhouNoCiclo) return null;
  if (passos.some((p) => p.exemplo)) return null;
  const p = passos[e.enviadosNoCiclo];
  if (!p) return null;
  const venceEm = e.ultimaNossaEm + p.esperaMin * 60_000;
  return { passo: e.enviadosNoCiclo + 1, venceEm, vencido: venceEm <= agora };
}

/* ---------------- dias e horário (São Paulo) ---------------- */
const DIA_EN: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
/** o dia da semana (0 = domingo) e os minutos do dia no relógio de São Paulo */
export function relogioSP(d: Date): { dia: number; minutos: number } {
  const partes = new Intl.DateTimeFormat('en-US', { timeZone: FUSO, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d);
  const de = (t: string) => partes.find((p) => p.type === t)?.value ?? '';
  return { dia: DIA_EN[de('weekday')] ?? 0, minutos: (Number(de('hour')) % 24) * 60 + Number(de('minute')) };
}
export const minutosDe = (hhmm: string): number => { const [h, m] = (hhmm || '0:0').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
export const hhmm = (min: number): string => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
export function dentroDoHorario(d: Date, cfg: Pick<ConfigRetomada, 'dias' | 'horaIni' | 'horaFim'>): boolean {
  const { dia, minutos } = relogioSP(d);
  return cfg.dias.includes(dia) && minutos >= minutosDe(cfg.horaIni) && minutos < minutosDe(cfg.horaFim);
}
export const DIAS_SEMANA = [
  { dia: 1, curto: 'Seg', longo: 'segunda' }, { dia: 2, curto: 'Ter', longo: 'terça' }, { dia: 3, curto: 'Qua', longo: 'quarta' },
  { dia: 4, curto: 'Qui', longo: 'quinta' }, { dia: 5, curto: 'Sex', longo: 'sexta' }, { dia: 6, curto: 'Sáb', longo: 'sábado' }, { dia: 0, curto: 'Dom', longo: 'domingo' },
] as const;
/** "Seg a Sex", "Seg, Qua e Sex", "Todos os dias" */
export function diasTexto(dias: number[]): string {
  const ord = DIAS_SEMANA.filter((d) => dias.includes(d.dia));
  if (ord.length === 7) return 'Todos os dias';
  if (!ord.length) return 'Nenhum dia';
  const idx = ord.map((d) => DIAS_SEMANA.findIndex((x) => x.dia === d.dia));
  const seguidos = idx.every((v, i) => i === 0 || v === idx[i - 1] + 1);
  if (seguidos && ord.length >= 3) return `${ord[0].curto} a ${ord[ord.length - 1].curto}`;
  return ord.length === 1 ? ord[0].curto : `${ord.slice(0, -1).map((d) => d.curto).join(', ')} e ${ord[ord.length - 1].curto}`;
}

/* ---------------- ritmo: intervalo e teto por número ---------------- */
/** o intervalo que acontece na prática: o agendador passa a cada minuto, então 90 s viram 2 min */
export const intervaloEfetivo = (intervaloS: number): number => Math.ceil(Math.max(intervaloS, INTERVALO_MIN_S) / RODADA_S) * RODADA_S;
export type LivreNumero = 'livre' | 'intervalo' | 'teto';
/** o número pode mandar a próxima retomada agora? (a última dele + o intervalo; o teto do dia) */
export function numeroLivre(uso: { ultimoEnvioEm: number | null; enviadosHoje: number }, agora: number, cfg: Pick<ConfigRetomada, 'intervaloS' | 'tetoDia'>): LivreNumero {
  if (uso.enviadosHoje >= cfg.tetoDia) return 'teto';
  if (uso.ultimoEnvioEm != null && agora - uso.ultimoEnvioEm < Math.max(cfg.intervaloS, INTERVALO_MIN_S) * 1000) return 'intervalo';
  return 'livre';
}
/** quantas retomadas cada número consegue mandar num dia: o teto, ou o que cabe no horário no ritmo do intervalo */
export function capacidadeDia(cfg: Pick<ConfigRetomada, 'horaIni' | 'horaFim' | 'intervaloS' | 'tetoDia'>): number {
  const janelaS = Math.max(0, minutosDe(cfg.horaFim) - minutosDe(cfg.horaIni)) * 60;
  return Math.max(0, Math.min(cfg.tetoDia, Math.floor(janelaS / intervaloEfetivo(cfg.intervaloS))));
}
/** "1 min 30 s", "2 min", "45 s", "1 h" */
export function duracaoTexto(s: number): string {
  if (s < 60) return `${s} s`;
  if (s % 3600 === 0) return `${s / 3600} h`;
  const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); const r = s % 60;
  return [h ? `${h} h` : '', m ? `${m} min` : '', r ? `${r} s` : ''].filter(Boolean).join(' ');
}
export const OPCOES_INTERVALO = [45, 60, 90, 120, 180, 300, 600, 900, 1800, 3600];

/* ---------------- conferência antes de gravar ---------------- */
export function validarConfig(c: ConfigRetomada): string | null {
  if (!c.dias.length) return 'Escolha pelo menos um dia para enviar.';
  if (minutosDe(c.horaFim) <= minutosDe(c.horaIni)) return 'O fim do horário precisa ser depois do começo.';
  if (!Number.isFinite(c.intervaloS) || c.intervaloS < INTERVALO_MIN_S) return `O intervalo entre duas mensagens do mesmo número é de no mínimo ${INTERVALO_MIN_S} segundos.`;
  if (c.intervaloS > INTERVALO_MAX_S) return 'O intervalo pode ser de no máximo 1 hora.';
  if (!Number.isInteger(c.tetoDia) || c.tetoDia < 1 || c.tetoDia > TETO_MAX) return `O limite por dia vai de 1 a ${TETO_MAX} mensagens por número.`;
  return null;
}
export function validarPassos(passos: PassoRetomada[]): string | null {
  if (!passos.length) return 'Coloque pelo menos uma mensagem.';
  if (passos.length > MAX_PASSOS) return `São no máximo ${MAX_PASSOS} mensagens por sequência.`;
  for (let i = 0; i < passos.length; i++) {
    const p = passos[i];
    if (!Number.isInteger(p.esperaMin) || p.esperaMin < ESPERA_MIN || p.esperaMin > ESPERA_MAX) return `Na ${i + 1}ª mensagem, a espera vai de 1 hora a 30 dias.`;
    const n = p.texto.trim().length;
    if (!n) return `Escreva o texto da ${i + 1}ª mensagem.`;
    if (n > TEXTO_MAX) return `A ${i + 1}ª mensagem passou de ${TEXTO_MAX} letras.`;
  }
  return null;
}
export const temExemplo = (s: Pick<SequenciaRetomada, 'passos'>): boolean => s.passos.some((p) => p.exemplo);

/* ---------------- textos de exemplo (rascunhos neutros: o dono escreve o texto dos clientes) ---------------- */
export const TEXTOS_EXEMPLO = [
  'Oi, {primeiro_nome}! Aqui é {atendente}. Ficou alguma dúvida sobre o que conversamos? Estou por aqui.',
  '{primeiro_nome}, passando para saber se ainda posso te ajudar. É só responder esta mensagem.',
  'Oi, {primeiro_nome}. Vou deixar seu atendimento em aberto por aqui. Quando quiser continuar, é só mandar uma mensagem.',
];
export const ESPERAS_SUGERIDAS = [6 * 60, 1440, 2 * 1440, 6 * 1440, 7 * 1440];
/** a mensagem nova do editor: espera sugerida e um rascunho marcado como exemplo */
export function passoNovo(indice: number): PassoRetomada {
  return { esperaMin: ESPERAS_SUGERIDAS[Math.min(indice, ESPERAS_SUGERIDAS.length - 1)], texto: TEXTOS_EXEMPLO[Math.min(indice, TEXTOS_EXEMPLO.length - 1)], exemplo: true };
}

/* ---------------- servidor → tipos (defensivo) ---------------- */
type B = Record<string, unknown>;
const o = (v: unknown): B => (v && typeof v === 'object' && !Array.isArray(v) ? (v as B) : {});
const a = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const t = (v: unknown, p = ''): string => (typeof v === 'string' ? v : v == null ? p : String(v));
const num = (v: unknown, p = 0): number => { const x = typeof v === 'number' ? v : Number(v); return Number.isFinite(x) ? x : p; };
const hora = (v: unknown, p: string) => { const m = /^(\d{1,2}):(\d{2})/.exec(t(v)); return m ? `${m[1].padStart(2, '0')}:${m[2]}` : p; };
export function normalizarConfig(v: unknown): ConfigRetomada {
  const r = o(v);
  if (!Object.keys(r).length) return { ...CONFIG_PADRAO };
  return {
    ativo: r.ativo === true,
    dias: a(r.dias).map((x) => num(x, -1)).filter((x) => x >= 0 && x <= 6),
    horaIni: hora(r.hora_ini, CONFIG_PADRAO.horaIni), horaFim: hora(r.hora_fim, CONFIG_PADRAO.horaFim),
    intervaloS: num(r.intervalo_s, INTERVALO_PADRAO_S), tetoDia: num(r.teto_dia, TETO_PADRAO), ligadoEm: t(r.ligado_em) || null,
  };
}
export const normalizarPassos = (v: unknown): PassoRetomada[] => a(v).map((x) => { const p = o(x); return { esperaMin: num(p.espera_min, ESPERA_MIN), texto: t(p.texto), ...(p.exemplo === true ? { exemplo: true } : {}) }; });
export const passosParaBanco = (ps: PassoRetomada[]) => ps.map((p) => ({ espera_min: p.esperaMin, texto: p.texto.trim(), ...(p.exemplo ? { exemplo: true } : {}) }));
export function normalizarSequencia(v: unknown): SequenciaRetomada {
  const r = o(v);
  return { id: t(r.id), funilId: t(r.funil_id), colunaId: t(r.coluna_id), ativo: r.ativo !== false, passos: normalizarPassos(r.passos), ativadaEm: t(r.ativada_em) || null, atualizadoEm: t(r.atualizado_em) || null };
}
const STATUS: StatusEnvio[] = ['agendado', 'enviado', 'cancelado', 'falhou'];
export function normalizarHistorico(v: unknown): EnvioRetomada[] {
  return a(v).map((x) => {
    const r = o(x); const s = t(r.status) as StatusEnvio;
    return { id: t(r.id), conversaId: t(r.conversa_id) || null, cliente: nomeBonito(t(r.cliente)) || 'Cliente sem nome', etapa: t(r.etapa, '—') || '—', passo: num(r.passo, 1), totalPassos: r.total_passos == null ? null : num(r.total_passos), quando: t(r.quando), status: STATUS.includes(s) ? s : 'falhou', motivo: t(r.motivo) || null, texto: t(r.texto) || null };
  });
}
const MSG: [RegExp, string][] = [
  [/atd_retomada_seq_uma_por_etapa|duplicate key/i, 'Esta etapa já tem uma sequência. Edite a que já existe.'],
  [/etapa_que_encerra/i, 'Etapas que encerram o lead (como Fechado e Perdido) não têm retomada.'],
  [/atd_retomada_seq_passos/i, 'Confira as mensagens: de 1 a 12, cada uma com texto e espera de 1 hora a 30 dias.'],
  [/atd_retomada_config_intervalo/i, `O intervalo entre duas mensagens do mesmo número é de no mínimo ${INTERVALO_MIN_S} segundos.`],
  [/atd_retomada_config_horas/i, 'O fim do horário precisa ser depois do começo.'],
  [/row-level security|permission denied|sem_permissao/i, 'Só o administrador muda a retomada automática.'],
];
const traduz = (e: unknown): Error => { const m = (e as Error)?.message || String(e); return new Error(MSG.find(([re]) => re.test(m))?.[1] ?? 'Não foi possível salvar agora. Tente de novo.'); };

/* ---------------- demonstração (fica no navegador; nada de cliente de verdade) ---------------- */
export const ETAPAS_DEMO: EtapaFunil[] = [
  { funilId: 'f-principal', funilNome: 'Funil principal', colunaId: 'k-lead', colunaNome: 'LEAD NOVO', ordem: 0 },
  { funilId: 'f-principal', funilNome: 'Funil principal', colunaId: 'k-atend', colunaNome: 'Em atendimento', ordem: 1 },
  { funilId: 'f-principal', funilNome: 'Funil principal', colunaId: 'k-doc', colunaNome: 'Documentação', ordem: 2 },
  { funilId: 'f-principal', funilNome: 'Funil principal', colunaId: 'k-qual', colunaNome: 'Qualificado', ordem: 3 },
  { funilId: 'f-juros', funilNome: 'Revisão de juros', colunaId: 'k-jnovo', colunaNome: 'Contato novo', ordem: 0 },
  { funilId: 'f-juros', funilNome: 'Revisão de juros', colunaId: 'k-janalise', colunaNome: 'Em análise', ordem: 1 },
];
const SEQ_DEMO: SequenciaRetomada[] = [
  { id: 'rs-1', funilId: 'f-principal', colunaId: 'k-lead', ativo: true, ativadaEm: null, atualizadoEm: null,
    passos: [0, 1, 2].map((i) => passoNovo(i)) },
  { id: 'rs-2', funilId: 'f-principal', colunaId: 'k-doc', ativo: true, ativadaEm: null, atualizadoEm: null,
    passos: [
      { esperaMin: 1440, texto: 'Oi, {primeiro_nome}! Para seguir com o seu atendimento, ainda falta um documento. Consegue me enviar por aqui?', exemplo: true },
      { esperaMin: 3 * 1440, texto: '{primeiro_nome}, o documento ainda está pendente. Se precisar de ajuda para enviar, me avise.', exemplo: true },
    ] },
  { id: 'rs-3', funilId: 'f-juros', colunaId: 'k-janalise', ativo: false, ativadaEm: null, atualizadoEm: null,
    passos: [{ esperaMin: 2 * 1440, texto: 'Oi, {primeiro_nome}. A análise do seu caso segue aqui com a gente. Ficou alguma dúvida?', exemplo: true }] },
];
const GUARDA = 'previa-retomada-v1';
interface Guardado { config: ConfigRetomada; sequencias: SequenciaRetomada[] }
function lerDemo(): Guardado {
  try {
    const g = JSON.parse(localStorage.getItem(GUARDA) ?? 'null') as Guardado | null;
    if (g && g.config && Array.isArray(g.sequencias)) return { config: { ...CONFIG_PADRAO, ...g.config }, sequencias: g.sequencias };
  } catch { /* privado */ }
  return { config: { ...CONFIG_PADRAO }, sequencias: SEQ_DEMO.map((s) => ({ ...s, passos: s.passos.map((p) => ({ ...p })) })) };
}
function gravarDemo(g: Guardado) { try { localStorage.setItem(GUARDA, JSON.stringify(g)); } catch { /* privado */ } }
const espera = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
const NOMES_DEMO = ['Iracema S.', 'Valdir M.', 'Neusa T.', 'Arlindo P.', 'Cleonice R.', 'Jurema F.', 'Osvaldo L.', 'Dalva C.', 'Ernesto B.', 'Zilda A.', 'Lourival G.', 'Marlene K.'];
/** um histórico inventado, sempre relativo a agora (o cliente de exemplo, a etapa, o passo e como terminou) */
export function historicoDemo(agora = Date.now()): EnvioRetomada[] {
  const linhas: [number, number, string, number, number, StatusEnvio, string | null][] = [
    // [minutos atrás, cliente, etapa, passo, total, status, motivo]
    [12, 0, 'Funil principal › LEAD NOVO', 1, 3, 'enviado', null],
    [14, 1, 'Funil principal › Documentação', 1, 2, 'enviado', null],
    [58, 2, 'Funil principal › LEAD NOVO', 2, 3, 'enviado', null],
    [61, 3, 'Funil principal › LEAD NOVO', 1, 3, 'falhou', 'O WhatsApp não reconheceu o número deste contato. Confira o DDD e o nono dígito.'],
    [140, 4, 'Funil principal › Documentação', 2, 2, 'enviado', null],
    [26 * 60, 5, 'Funil principal › LEAD NOVO', 3, 3, 'enviado', null],
    [26 * 60 + 4, 6, 'Funil principal › LEAD NOVO', 1, 3, 'cancelado', 'O cliente respondeu antes do envio.'],
    [27 * 60, 7, 'Funil principal › Documentação', 1, 2, 'enviado', null],
    [50 * 60, 8, 'Revisão de juros › Em análise', 1, 1, 'enviado', null],
    [51 * 60, 9, 'Funil principal › LEAD NOVO', 2, 3, 'enviado', null],
    [74 * 60, 10, 'Funil principal › LEAD NOVO', 1, 3, 'enviado', null],
    [75 * 60, 11, 'Funil principal › Documentação', 1, 2, 'enviado', null],
  ];
  return linhas.map(([min, c, etapa, passo, total, status, motivo], i) => ({
    id: `rh-${i}`, conversaId: null, cliente: NOMES_DEMO[c], etapa, passo, totalPassos: total,
    quando: new Date(agora - min * 60_000).toISOString(), status, motivo, texto: null,
  }));
}

/* ---------------- hooks ---------------- */
const CHAVE = 'retomada';
export function useRetomadaConfig() {
  const { currentOrg } = useOrg();
  return useQuery({
    queryKey: [CHAVE, 'config', currentOrg.id],
    queryFn: async (): Promise<ConfigRetomada> => {
      if (!RETOMADA_REAL) return lerDemo().config;
      const { data, error } = await supabase!.from('atd_retomada_config').select('ativo, dias, hora_ini, hora_fim, intervalo_s, teto_dia, ligado_em').eq('organizacao_id', currentOrg.id).maybeSingle();
      if (error) throw new Error(error.message);
      return normalizarConfig(data);
    },
  });
}
export function useSalvarRetomadaConfig() {
  const { currentOrg } = useOrg();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (c: ConfigRetomada) => {
      const erro = validarConfig(c); if (erro) throw new Error(erro);
      if (!RETOMADA_REAL) {
        await espera(450);
        const g = lerDemo();
        const ligou = c.ativo && !g.config.ativo;
        gravarDemo({ ...g, config: { ...c, ligadoEm: ligou ? new Date().toISOString() : g.config.ligadoEm } });
        return;
      }
      const { error } = await supabase!.from('atd_retomada_config').upsert({
        organizacao_id: currentOrg.id, ativo: c.ativo, dias: [...c.dias].sort((x, y) => x - y), hora_ini: c.horaIni, hora_fim: c.horaFim, intervalo_s: c.intervaloS, teto_dia: c.tetoDia,
      }, { onConflict: 'organizacao_id' });
      if (error) throw traduz(error);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [CHAVE] }),
  });
}
export function useSequenciasRetomada() {
  const { currentOrg } = useOrg();
  return useQuery({
    queryKey: [CHAVE, 'sequencias', currentOrg.id],
    queryFn: async (): Promise<SequenciaRetomada[]> => {
      if (!RETOMADA_REAL) return lerDemo().sequencias;
      const { data, error } = await supabase!.from('atd_retomada_sequencias').select('id, funil_id, coluna_id, ativo, passos, ativada_em, atualizado_em').eq('organizacao_id', currentOrg.id).order('criado_em', { ascending: true });
      if (error) throw new Error(error.message);
      return a(data).map(normalizarSequencia);
    },
  });
}
export function useSalvarSequencia() {
  const { currentOrg } = useOrg();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (s: Omit<SequenciaRetomada, 'id' | 'ativadaEm' | 'atualizadoEm'> & { id?: string | null }) => {
      const erro = validarPassos(s.passos); if (erro) throw new Error(erro);
      if (!s.colunaId) throw new Error('Escolha a etapa do Kanban.');
      if (!RETOMADA_REAL) {
        await espera(450);
        const g = lerDemo();
        if (g.sequencias.some((x) => x.colunaId === s.colunaId && x.id !== s.id)) throw new Error('Esta etapa já tem uma sequência. Edite a que já existe.');
        const agora = new Date().toISOString();
        const nova: SequenciaRetomada = { id: s.id || `rs-${Date.now().toString(36)}`, funilId: s.funilId, colunaId: s.colunaId, ativo: s.ativo, passos: s.passos.map((p) => ({ ...p, texto: p.texto.trim() })), ativadaEm: s.ativo ? agora : null, atualizadoEm: agora };
        gravarDemo({ ...g, sequencias: s.id ? g.sequencias.map((x) => (x.id === s.id ? { ...nova, ativadaEm: x.ativo && s.ativo ? x.ativadaEm : nova.ativadaEm } : x)) : [...g.sequencias, nova] });
        return;
      }
      const linha = { organizacao_id: currentOrg.id, funil_id: s.funilId, coluna_id: s.colunaId, ativo: s.ativo, passos: passosParaBanco(s.passos) };
      const { error } = s.id ? await supabase!.from('atd_retomada_sequencias').update(linha).eq('id', s.id) : await supabase!.from('atd_retomada_sequencias').insert(linha);
      if (error) throw traduz(error);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [CHAVE] }),
  });
}
export function useAtivarSequencia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { id: string; ativo: boolean }) => {
      if (!RETOMADA_REAL) {
        await espera(250);
        const g = lerDemo();
        gravarDemo({ ...g, sequencias: g.sequencias.map((x) => (x.id === v.id ? { ...x, ativo: v.ativo, ativadaEm: v.ativo && !x.ativo ? new Date().toISOString() : x.ativadaEm } : x)) });
        return;
      }
      const { error } = await supabase!.from('atd_retomada_sequencias').update({ ativo: v.ativo }).eq('id', v.id);
      if (error) throw traduz(error);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [CHAVE] }),
  });
}
export function useExcluirSequencia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      if (!RETOMADA_REAL) { await espera(300); const g = lerDemo(); gravarDemo({ ...g, sequencias: g.sequencias.filter((x) => x.id !== id) }); return; }
      const { error } = await supabase!.from('atd_retomada_sequencias').delete().eq('id', id);
      if (error) throw traduz(error);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [CHAVE] }),
  });
}
/** as etapas do Kanban que podem ter retomada (as que encerram o lead, como Fechado e Perdido, ficam de fora) */
export function useEtapasFunil() {
  const { currentOrg } = useOrg();
  return useQuery({
    queryKey: [CHAVE, 'etapas', currentOrg.id],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<EtapaFunil[]> => {
      if (!RETOMADA_REAL) return ETAPAS_DEMO;
      const [{ data: fs, error: e1 }, { data: cs, error: e2 }] = await Promise.all([
        supabase!.from('funis').select('id, nome, ordem, padrao').eq('organizacao_id', currentOrg.id).eq('arquivado', false),
        supabase!.from('funil_colunas').select('id, funil_id, nome, ordem, encerra_oportunidade').eq('organizacao_id', currentOrg.id).eq('arquivada', false),
      ]);
      if (e1 || e2) throw new Error((e1 ?? e2)!.message);
      const funis = a(fs).map(o).sort((x, y) => Number(!!y.padrao) - Number(!!x.padrao) || num(x.ordem) - num(y.ordem));
      return funis.flatMap((f) => a(cs).map(o).filter((c) => c.funil_id === f.id && c.encerra_oportunidade !== true).sort((x, y) => num(x.ordem) - num(y.ordem))
        .map((c) => ({ funilId: t(f.id), funilNome: t(f.nome, 'Funil'), colunaId: t(c.id), colunaNome: t(c.nome, 'Etapa'), ordem: num(c.ordem) })));
    },
  });
}
export function useHistoricoRetomada(ativo = true) {
  const { currentOrg } = useOrg();
  return useQuery({
    queryKey: [CHAVE, 'historico', currentOrg.id],
    enabled: ativo,
    refetchInterval: ativo ? 60_000 : false,
    queryFn: async (): Promise<EnvioRetomada[]> => {
      if (!RETOMADA_REAL) return historicoDemo();
      const { data, error } = await supabase!.rpc('atd_retomada_historico', { p_limite: 300 });
      if (error) throw new Error(error.message);
      return normalizarHistorico(data);
    },
  });
}
