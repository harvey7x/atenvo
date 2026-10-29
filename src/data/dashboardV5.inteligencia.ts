/* ============================================================================
   LEITURA DO DIA — o motor (Dashboard v5, 22/10/2026).

   Pedido do dono (22/10): "todos os dados são reais? eu preciso de um mecanismo
   inteligente". O motor LÊ os sinais do banco (dashboard_v5_sinais) e diz o que importa
   e o que fazer, em no máximo 4 linhas — e nada quando nada importa.

   PURO E DETERMINÍSTICO: sem Date.now(), sem Math.random(), sem rede, sem ordenação que
   dependa do idioma do aparelho. O relógio vem sempre de `o.agora`; a hora cheia sai do
   fuso de São Paulo (UTC−3 fixo, sem horário de verão). Mesmo sinal → mesma leitura. O
   motor NUNCA inventa número: toda contagem do texto vem de um campo do sinal (as contas
   aqui são só comparar, somar, subtrair e dividir dois campos).

   Regras e limiares: wf7/SPEC-inteligencia.md §2 (medidos no banco real de 22/09 a
   21/10), com as correções do backtest de 15 em 15 min (wf9): histerese de entrada e de
   saída nos números (um cliente solto não encerra uma queda), "a conexão voltou" só quando
   as mensagens voltaram de fato, o crédito da IA não some numa madrugada quieta, a fila da
   equipe não pisca perto de 40 e a semana de fechados usa a MESMA janela do "7 dias".
   Nove tipos de achado; até 4 na tela; o resto atrás de "Ver mais N".

   Texto: uma frase curta com a causa e o número que importa; a instrução (`acao.texto`)
   só quando é FORA da tela (Gerenciador, conversa com a equipe); o verbo da navegação vai
   no rótulo do link ("Reconectar em Integrações", "Ver Matheus", "Ver os 7 dias").
   ============================================================================ */

import type { PresetDash } from '@/data/dashboard';
import { fmtDuracaoMin, fmtInt, fmtPct, rotuloMotivoNe } from '@/data/dashboardV5.formato';
import type {
  AchadoV5, AlvoV5, FechDiaV5, LacunaMsgV5, LeituraV5, LinkAcaoV5, MarcadorV5, NotaV5, NumeroSinaisV5,
  OpcoesLeituraV5, PessoaSinaisV5, QuedaV5, RajadaV5, SeveridadeV5, SinaisV5, TipoAchadoV5,
} from '@/data/dashboardV5.sinais.tipos';

/* ============================== limiares ============================== */
export const LIMIARES_V5 = {
  parado: {
    /** E: clientes esperados desde a última entrada */
    eMin: 8,
    /** T: esperado nas últimas 3 h e fração que chegou. Histerese: ligado 15 min atrás, ele
     *  só desliga quando passa de 40% OU a última hora volta a max(3, 50%) */
    t3hMin: 8, tFrac: 0.25, tFracSair: 0.4,
    /** E quase no limite (≥ 75%) logo depois de um apagão de mensagens (< 2 h) segue o
     *  cartão — sem o buraco entre "quase sem mensagens" e "sem cliente novo" */
    eQuaseFrac: 0.75,
    /** M: minutos sem mensagem, mensagens esperadas nesse trecho e clientes esperados */
    mGapMin: 75, mEsperadoMin: 20, mEntradaMin: 2,
    /** histerese das MENSAGENS: lacuna que acabou há < 2 h segura o cartão até a última
     *  hora voltar a max(3, 50% do esperado) */
    holdHoras: 2, holdMin: 3, holdFrac: 0.5,
    /** "a conexão voltou" só com ≥ 60% das mensagens esperadas desde o fim da lacuna (e a
     *  última hora no normal acima); abaixo disso a conexão "voltou só em parte" */
    voltouFrac: 0.6,
    /** lacunas separadas por um punhado de mensagens (≤ 60 min entre elas) = um apagão só */
    juntarLacunaMin: 60,
    /** histerese das ENTRADAS: uma queda que acabou só se confirma com ≥ 3 entradas desde o
     *  fim OU a última hora com max(3, 50% do esperado). Até lá o cartão segue: nas primeiras
     *  3 h sempre; depois, enquanto eram esperados ≥ 3 desde o fim (de madrugada, com quase
     *  nada esperado, ele sai) — e nunca além de 12 h */
    voltaEntradas: 3, volta60Min: 3, volta60Frac: 0.5, voltaHoras: 3, voltaEspMin: 3, voltaHorasMax: 12,
    /** a junção de quedas do SQL: ≤ 2 entradas entre elas e < 2 h — o cartão ao vivo usa a
     *  mesma régua para nomear o incidente desde o começo */
    juntarEntradas: 2, juntarHoras: 2,
    /** diagnóstico "o anúncio parou": mensagens ≥ 60% do normal com ≥ 8 esperadas */
    diagFrac: 0.6, diagEspMin: 8,
  },
  ia: {
    /** crédito ativo: ≥ 5 falhas no episódio, nenhuma resposta boa depois e a última falha
     *  há < 12 h — uma madrugada sem cliente NÃO apaga o aviso (o crédito segue zerado) */
    errosMin: 5, ativoHoras: 12,
    okDepoisResolvido: 3, resolvidoHoras: 12, recenteMin: 60,
    erros60Min: 10, okFrac: 1 / 3,
    cobN3h: 10, cobFrac: 0.1, cobBase: 0.4, cobBaseN: 20,
  },
  qualidade: { rsMin: 5, rsFrac: 0.1, rsMult: 2.5, descN: 40, descZ: 3, descPp: 0.15, baseDias: 7 },
  equipe: {
    horaIni: 11, horaFim: 19,
    /** resposta: n mínimo (50 antes das 14 h: de manhã a mediana oscila com poucas vezes) */
    respN: 30, respNManha: 50, respManhaAte: 14,
    respMult: 2, respMais: 5, respBaseDias: 5,
    /** fila: entra em ≥ 40 e ≥ 1,5× o normal; sai abaixo de 35 ou depois de 30 min fora */
    filaMin: 40, filaSair: 35, filaMult: 1.5,
  },
  atendente: {
    pisoRef: 10, pisoMin: 5, parteRef: 0.35, filaMult: 2, semBaseMais: 4, baseDiasMin: 5,
    respN: 15, respBaseDias: 5, respBaseDiaN: 5, respMult: 2, respMais: 10, respRestoMult: 2,
    recorrenteDias: 3, recorrenteJanela: 5,
  },
  queda: { horasHoje: 12, represadasMin: 20, represadasSilencioH: 3 },
  fech: {
    baseMin: 10, quedaFrac: 0.6, altaMult: 1.5, altaMin: 15,
    fichasOk: 0.8, entradasQueda: 0.8, fichasAlta: 1.5, diasExibir: 2, semFechadoMin: 10,
  },
  passados: { n: 20, frac: 0.25, mult: 2, z: 3 },
  ritmo: { horaMin: 11, normalMin: 30, baixo: 0.6, alto: 1.6, msgsOk: 0.6 },
  notas: { fichasMin: 10, rajadaMin: 20 },
  maxVisiveis: 4,
} as const;

const L = LIMIARES_V5;
const MIN = 60_000, HORA = 3_600_000, DIA = 86_400_000;

/* ============================== texto (pt-BR, determinístico) ============================== */
const pad = (n: number) => String(n).padStart(2, '0');
/** campos UTC desta data = relógio de São Paulo */
const sp = (ms: number) => new Date(ms - 3 * HORA);
const valido = (ms: number) => Number.isFinite(ms) && Math.abs(ms) < 8.64e15;
const diaSP = (ms: number) => (valido(ms) ? sp(ms).toISOString().slice(0, 10) : '');
const hhmm = (ms: number) => { if (!valido(ms)) return ''; const d = sp(ms); return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`; };
const ddmmMs = (ms: number) => { if (!valido(ms)) return ''; const d = sp(ms); return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}`; };
const ddmmDia = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
const addDia = (dia: string, n: number) => new Date(Date.parse(`${dia}T12:00:00Z`) + n * DIA).toISOString().slice(0, 10);
const difDias = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / DIA);
const DOW = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const ms = (iso: string | null | undefined) => (iso ? Date.parse(iso) : NaN);
/** ordem sem idioma: só < e > (localeCompare depende do ICU do aparelho) */
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** "13:56" (hoje) · "ontem 21:17" · "sáb 22:29" (até 6 dias) · "08/10 14:00". */
export function quandoTxt(iso: string, agora: Date): string {
  const t = Date.parse(iso);
  if (!valido(t)) return '';
  const d = difDias(diaSP(t), diaSP(agora.getTime()));
  if (d === 0) return hhmm(t);
  if (d === 1) return `ontem ${hhmm(t)}`;
  if (d >= 2 && d <= 6) return `${DOW[sp(t).getUTCDay()]} ${hhmm(t)}`;
  return `${ddmmMs(t)} ${hhmm(t)}`;
}

/** Trecho entre dois instantes, minúsculo: "das 13:56 às 15:29" · "ontem, das 16:22 às
 *  17:19" · "de ontem 21:17 a 09:40" (dias diferentes). */
export function trechoTxt(a: string, b: string, agora: Date): string {
  const ta = Date.parse(a), tb = Date.parse(b);
  if (diaSP(ta) === diaSP(tb)) {
    const d = difDias(diaSP(ta), diaSP(agora.getTime()));
    const dia = d === 0 ? '' : d === 1 ? 'ontem, ' : d >= 2 && d <= 6 ? `${DOW[sp(ta).getUTCDay()]}, ` : `${ddmmMs(ta)}, `;
    return `${dia}das ${hhmm(ta)} às ${hhmm(tb)}`;
  }
  return `de ${quandoTxt(a, agora)} a ${quandoTxt(b, agora)}`;
}

/** Duração em minutos no padrão da página: '4 min' · '3 h 20' · '1,6 dia'. */
export function duracaoTxt(min: number): string { return fmtDuracaoMin(min); }

/** Esperado por extenso: 'cerca de 13'; abaixo de 1, 'menos de 1'. */
export function aprox(e: number): string {
  if (!Number.isFinite(e) || e < 0.5) return 'menos de 1';
  return `cerca de ${fmtInt(Math.round(e))}`;
}
/** Clientes esperados (a conta mais incerta: taxa por hora × um trecho longo): de 100 para
 *  cima vira 'mais de 100'. Mensagens e linhas de base usam `aprox`. */
export function aproxClientes(e: number): string {
  return Number.isFinite(e) && e >= 100 ? 'mais de 100' : aprox(e);
}

/** 'cerca de 23 clientes' · 'cerca de 1 lead esperando' · 'menos de 1 lead esperando': o
 *  esperado SEMPRE com o que está sendo contado (nunca um 'cerca de 5' solto) */
export function aproxDe(e: number, sing: string, plur: string, f: (x: number) => string = aprox): string {
  const um = !Number.isFinite(e) || e < 0.5 || Math.round(e) === 1;
  return `${f(e)} ${um ? sing : plur}`;
}

/** minutos inteiros entre dois instantes, contados pelo relógio que a tela mostra (minuto
 *  cheio): de 10:48:45 a 15:00 são 4 h 12, como diz '10:48' ao lado — nunca 4 h 11 */
export function minEntre(a: number, b: number): number {
  return Math.floor(b / MIN) - Math.floor(a / MIN);
}

/** '1 cliente' · '3 clientes' */
export function qtd(n: number, sing: string, plur: string): string {
  return `${fmtInt(n)} ${Math.round(n) === 1 ? sing : plur}`;
}
const pl = (n: number, sing: string, plur: string) => (Math.round(n) === 1 ? sing : plur);

/** 'A', 'A e B', 'A, B e C' */
function lista(itens: string[]): string {
  if (itens.length <= 1) return itens[0] ?? '';
  return `${itens.slice(0, -1).join(', ')} e ${itens[itens.length - 1]}`;
}

/** "JUROS ABUSIVO (ANDRIUS)" → "JUROS ABUSIVO" (rótulo de link e frases com dois números) */
export function nomeCurto(nome: string): string {
  const s = nome.replace(/\s*\([^)]*\)\s*$/, '').trim();
  return s || nome;
}
const primeiroNome = (nome: string) => nome.trim().split(/\s+/)[0] || nome;

/** '7% (7 de 94)' */
const pctDe = (k: number, n: number) => `${fmtPct((k / n) * 100)} (${fmtInt(k)} de ${fmtInt(n)})`;

/** minuto do dia → 'HH:MM' (arredonda ANTES de separar hora e minuto: 839,6 → 14:00) */
export function hhmmDoMinuto(min: number): string {
  const m = Math.round(min);
  return `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`;
}

/* ============================== estatística ============================== */
export function mediana(v: number[]): number | null {
  const s = v.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!s.length) return null;
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** relógio de SP: hora cheia, fração da hora, dia da semana e minuto do dia */
function relogio(agora: Date) {
  const d = sp(agora.getTime());
  return {
    hora: d.getUTCHours(), frac: (d.getUTCMinutes() + d.getUTCSeconds() / 60) / 60, dow: d.getUTCDay(),
    minDia: d.getUTCHours() * 60 + d.getUTCMinutes(),
  };
}

/* ============================== modo do período ============================== */
type Modo = 'hoje' | 'curto' | 'longo' | 'fechado';
function modoDe(s: SinaisV5, preset: PresetDash): Modo {
  if (!s.janela.incluiAgora) return 'fechado';
  if (preset === 'hoje') return 'hoje';
  const dias = (ms(s.janela.fim) - ms(s.janela.inicio)) / DIA;
  if (preset === '3d' || (Number.isFinite(dias) && dias < 6.5)) return 'curto';
  return 'longo';
}

/* ============================== links ============================== */
const linkRota = (rotulo: string, rota: LinkAcaoV5['rota']): LinkAcaoV5 => ({ rotulo, rota });
const linkAlvo = (rotulo: string, alvo: AlvoV5): LinkAcaoV5 => ({ rotulo, alvo });
const verNumero = (n: { nome: string; canalId: string }): LinkAcaoV5 => linkAlvo(`Ver ${nomeCurto(n.nome)}`, { bloco: 'numeros', canalId: n.canalId });
const verPessoa = (p: { nome: string; usuarioId: string }): LinkAcaoV5 => linkAlvo(`Ver ${primeiroNome(p.nome)}`, { bloco: 'atendentes', usuarioId: p.usuarioId });
const RECONECTAR = linkRota('Reconectar em Integrações', '/integracoes');
const CONFERIR_INTEGRACOES = linkRota('Conferir em Integrações', '/integracoes');
const ABRIR_IA = linkRota('Abrir IA', '/ia');

/* ============================== 2.1 número parado ============================== */
type Diag = 'conexao_agora' | 'conexao_parcial' | 'conexao_voltou' | 'anuncio' | 'misto';

/** um apagão de mensagens (lacunas vizinhas já juntas) */
interface Apagao { inicio: string; fim: string | null; esperado: number; recDepois: number | null; espDepois: number | null }

/** o incidente de entradas: a queda que acabou e o trecho aberto desde ela, como o SQL juntaria */
interface Incidente { inicio: string; chegaram: number; esperado: number }

interface EstadoNumero {
  n: NumeroSinaisV5;
  e: boolean; t: boolean; m: boolean;
  /** histerese das mensagens (lacuna recente, última hora ainda fraca) */
  holdMsg: boolean;
  /** histerese das entradas (a queda acabou, mas a volta ainda não se confirmou) */
  holdQueda: boolean;
  diag: Diag;
  /** o apagão de mensagens que explica (D2) */
  apagao: Apagao | null;
  inc: Incidente | null;
}

/** Lacunas em ordem de início, com as vizinhas (≤ 30 min de mensagens entre elas) juntas:
 *  13:56→15:29 e 15:29→17:58 (uma mensagem solta às 15:29) são o mesmo apagão. */
export function juntarLacunas(lacs: LacunaMsgV5[]): Apagao[] {
  const ord = [...lacs].sort((a, b) => ms(a.inicio) - ms(b.inicio));
  const out: Apagao[] = [];
  for (const l of ord) {
    const ult = out[out.length - 1];
    if (ult && ult.fim && ms(l.inicio) - ms(ult.fim) <= L.parado.juntarLacunaMin * MIN) {
      ult.fim = l.fim; ult.esperado += l.esperado; ult.recDepois = l.recDepois; ult.espDepois = l.espDepois;
    } else out.push({ inicio: l.inicio, fim: l.fim, esperado: l.esperado, recDepois: l.recDepois, espDepois: l.espDepois });
  }
  return out;
}

/** a queda encerrada mais recente (fim ≤ agora) */
function ultimaQueda(n: NumeroSinaisV5, ag: number): QuedaV5 | null {
  return n.quedas.filter((q) => ms(q.fim) <= ag).sort((a, b) => ms(b.fim) - ms(a.fim))[0] ?? null;
}

/** T (filete): poucas entradas para o esperado. Logo depois de uma queda (fim há < 3 h) as
 *  últimas 3 h ainda contêm a própria queda — o filete é medido DESDE O FIM dela (senão ele
 *  pisca no limite enquanto a janela de 3 h sai de cima da queda). */
function filete(n: NumeroSinaisV5, q: QuedaV5 | null, ag: number): boolean {
  const P = L.parado;
  if (q && ag - ms(q.fim) < 3 * HORA) return q.espDepois >= P.t3hMin && q.depois <= P.tFrac * q.espDepois;
  const liga = (c: { rec: number; esp: number }, f: number) => c.esp >= P.t3hMin && c.rec <= f * c.esp;
  if (liga(n.ent3h, P.tFrac)) return true;
  // estava ligado 15 min atrás: só desliga acima de 40% ou com a última hora de volta
  const hora60Ok = n.ent60.rec >= Math.max(P.volta60Min, P.volta60Frac * n.ent60.esp);
  return liga(n.ent3h15, P.tFrac) && liga(n.ent3h, P.tFracSair) && !hora60Ok;
}

/** a volta das entradas depois da queda q está confirmada? (≥ 3 entradas desde o fim, ou a
 *  última hora no normal; e sem filete) */
function voltaConfirmada(n: NumeroSinaisV5, q: QuedaV5, t: boolean): boolean {
  const P = L.parado;
  return !t && (q.depois >= P.voltaEntradas || n.ent60.rec >= Math.max(P.volta60Min, P.volta60Frac * n.ent60.esp));
}

export function estadoNumero(n: NumeroSinaisV5, agora: Date): EstadoNumero | null {
  if (!n.trafego) return null;
  const P = L.parado;
  const ag = agora.getTime();
  const q = ultimaQueda(n, ag);
  const t = filete(n, q, ag);
  const gapMsg = n.ultimaMsg ? (ag - ms(n.ultimaMsg)) / MIN : Infinity;
  const m = gapMsg >= P.mGapMin && n.msgsEsperadasDesdeUltimaMsg >= P.mEsperadoMin && n.esperadoDesdeUltima >= P.mEntradaMin;
  // histerese das mensagens (sem estado): um apagão que acabou há menos de 2 h e a última
  // hora ainda abaixo do normal = o cartão continua (não pisca a cada mensagem solta)
  const apagoes = juntarLacunas(n.lacunasMsg).filter((l) => l.esperado >= P.mEsperadoMin);
  const fechados = apagoes.filter((l) => l.fim && ms(l.fim) <= ag);
  const msgs60Ok = n.msgs60.rec >= Math.max(P.holdMin, P.holdFrac * n.msgs60.esp);
  const recenteMsg = fechados.filter((l) => ag - ms(l.fim) < P.holdHoras * HORA).pop() ?? null;
  const holdMsg = !!recenteMsg && !msgs60Ok;
  // E: clientes esperados desde a última entrada (≥ 8); logo depois de um apagão de
  // mensagens basta 75% (o cartão não some entre a lacuna e o "sem cliente novo")
  const e = n.esperadoDesdeUltima >= P.eMin || (!!recenteMsg && n.esperadoDesdeUltima >= P.eQuaseFrac * P.eMin);
  // histerese das entradas: a queda acabou com um cliente solto, mas a volta não se confirmou
  const desdeQ = q ? ag - ms(q.fim) : Infinity;
  const holdQueda = !!q && !voltaConfirmada(n, q, t) && desdeQ < P.voltaHorasMax * HORA
    && (desdeQ < P.voltaHoras * HORA || q.espDepois >= P.voltaEspMin);
  if (!e && !t && !m && !holdMsg && !holdQueda) return null;

  // o incidente: a queda recente e o trecho aberto desde ela são UM só (a régua do SQL:
  // ≤ 2 entradas entre eles e < 2 h) — o cartão nomeia o começo e não muda de frase quando
  // um cliente solto chega no meio
  let inc: Incidente | null = null;
  const continua = !!q && !!n.ultimaEntrada && q.depois <= P.juntarEntradas
    && ms(n.ultimaEntrada) - ms(q.fim) < P.juntarHoras * HORA;
  if (q && (holdQueda || ((e || t) && continua))) {
    inc = { inicio: q.inicio, chegaram: q.chegaram + q.depois, esperado: q.esperado + q.espDepois };
  }
  const desdeInc = inc ? ms(inc.inicio) : n.ultimaEntrada ? ms(n.ultimaEntrada) : ag - 3 * HORA;

  let diag: Diag;
  let apagao: Apagao | null = null;
  if (m) diag = 'conexao_agora';
  else {
    // o apagão MAIS RECENTE que cai dentro do incidente (o que explica a tela de agora)
    const rel = fechados.filter((l) => ms(l.fim) >= desdeInc).pop() ?? (holdMsg ? recenteMsg : null);
    const anuncioOuMisto = (): Diag => (n.msgsDiag.esp >= P.diagEspMin && n.msgsDiag.rec >= P.diagFrac * n.msgsDiag.esp ? 'anuncio' : 'misto');
    if (rel) {
      const voltou = rel.recDepois != null && rel.espDepois != null && rel.recDepois >= P.voltouFrac * rel.espDepois && msgs60Ok;
      if (!voltou) { diag = 'conexao_parcial'; apagao = rel; }
      else if (!n.ultimaEntrada || ms(rel.fim) >= ms(n.ultimaEntrada)) { diag = 'conexao_voltou'; apagao = rel; }
      else diag = anuncioOuMisto();   // um cliente chegou depois do apagão: ele não explica o silêncio de agora
    } else diag = anuncioOuMisto();
  }
  return { n, e, t, m, holdMsg, holdQueda, diag, apagao, inc };
}

function cartaoNumero(st: EstadoNumero, agora: Date): AchadoV5 {
  const { n, inc } = st;
  const quando = n.ultimaEntrada ? quandoTxt(n.ultimaEntrada, agora) : null;
  const E = n.esperadoDesdeUltima;
  const soVolume = !st.e && !st.t && !inc;      // só a histerese das mensagens
  let titulo: string;
  if (st.m) titulo = n.ultimaMsg ? `${n.nome} sem receber mensagens desde ${quandoTxt(n.ultimaMsg, agora)}` : `${n.nome} sem receber mensagens`;
  else if (inc) titulo = `${n.nome} quase sem cliente novo desde ${quandoTxt(inc.inicio, agora)}`;
  else if (st.e) titulo = quando ? `${n.nome} sem cliente novo desde ${quando}` : `${n.nome} sem cliente novo há dias`;
  else if (st.t) titulo = `${n.nome}: só ${qtd(n.ent3h.rec, 'cliente', 'clientes')} nas últimas 3 h`;   // (sem queda recente: com ela, o título é o do incidente)
  else titulo = st.apagao ? `${n.nome} quase sem mensagens desde ${quandoTxt(st.apagao.inicio, agora)}` : `${n.nome} quase sem mensagens`;

  // 1ª oração: o volume (o número que importa)
  const abertura = inc
    ? (inc.chegaram === 0 ? `Nenhum cliente desde então (normal: ${aproxClientes(inc.esperado)}).`
      : `Só ${qtd(inc.chegaram, 'cliente', 'clientes')} desde então (normal: ${aproxClientes(inc.esperado)}).`)
    : st.e ? `Nesse tempo costumam chegar ${aproxDe(E, 'cliente', 'clientes', aproxClientes)}.`
      : st.t ? `Nas últimas 3 h costumam chegar ${aproxDe(n.ent3h.esp, 'cliente', 'clientes', aproxClientes)}.` : '';
  const desde = n.msgsDiag.desde ? hhmm(ms(n.msgsDiag.desde)) : '';
  let frase: string;
  let acao: AchadoV5['acao'];
  switch (st.diag) {
    case 'conexao_agora':
      frase = `Nem as conversas em andamento chegam (normal: ${aprox(n.msgsEsperadasDesdeUltimaMsg)} mensagens nesse tempo). O chip provavelmente caiu.`;
      acao = { texto: null, link: RECONECTAR };
      break;
    case 'conexao_parcial': {
      const a = st.apagao!;
      // a medida que falhou: desde o fim do apagão (com ≥ 3 esperadas) ou a última hora
      const desdeFim = a.recDepois != null && a.espDepois != null && a.espDepois >= 3 && a.recDepois < L.parado.voltouFrac * a.espDepois;
      const parte = soVolume
        ? `Na última hora ${pl(n.msgs60.rec, 'chegou', 'chegaram')} só ${qtd(n.msgs60.rec, 'mensagem', 'mensagens')}, de ${aprox(n.msgs60.esp)}: a conexão voltou só em parte.`
        : desdeFim
          ? `A conexão voltou só em parte: ${fmtInt(a.recDepois!)} de ${aprox(a.espDepois!)} mensagens desde ${quandoTxt(a.fim!, agora)}.`
          : `A conexão voltou só em parte: na última hora, ${fmtInt(n.msgs60.rec)} de ${aprox(n.msgs60.esp)} mensagens.`;
      frase = abertura ? `${abertura} ${parte}` : parte;
      acao = { texto: null, link: RECONECTAR };
      break;
    }
    case 'conexao_voltou': {
      const a = st.apagao!;
      // o começo do apagão só quando não é o mesmo horário do título
      const inicioTitulo = inc ? inc.inicio : n.ultimaEntrada;
      const desdeA = inicioTitulo && quandoTxt(inicioTitulo, agora) === quandoTxt(a.inicio, agora) ? '' : ` (sem mensagens desde ${quandoTxt(a.inicio, agora)})`;
      frase = `${abertura ? abertura + ' ' : ''}As conversas voltaram às ${hhmm(ms(a.fim!))}${desdeA}, mas cliente novo ainda não.`;
      acao = { texto: 'Se o anúncio estiver ativo no Gerenciador, reconecte o número.', link: CONFERIR_INTEGRACOES };
      break;
    }
    case 'anuncio':
      frase = `${abertura ? abertura + ' ' : ''}As conversas chegam normalmente (${qtd(n.msgsDiag.rec, 'mensagem', 'mensagens')} desde ${desde}): o número está conectado.`;
      acao = { texto: 'Confira o anúncio no Gerenciador: pausa, saldo ou reprovação.', link: verNumero(n) };
      break;
    default:
      frase = `${abertura ? abertura + ' ' : ''}Chegam menos mensagens que o normal (${fmtInt(n.msgsDiag.rec)} de ${aprox(n.msgsDiag.esp)} desde ${desde}).`;
      acao = { texto: 'Se a conexão estiver normal, veja o anúncio no Gerenciador.', link: CONFERIR_INTEGRACOES };
  }
  const forca = inc ? inc.esperado - inc.chegaram : st.e ? E : st.t ? n.ent3h.esp : n.msgsEsperadasDesdeUltimaMsg / 4;
  return {
    id: `numero_parado:${n.canalId}`, tipo: 'numero_parado', severidade: 'atencao',
    prioridade: 150 + Math.min(Math.max(0, Math.round(forca)), 50), titulo, frase, acao, soAdmin: false,
  };
}

/** Desde quando o número está parado, na MESMA fonte e no MESMO minuto do marcador da tabela
 *  (o cartão "pararam juntos" repete o que a linha do número diz): sem mensagens → a última
 *  mensagem; incidente → o começo dele; sem cliente novo → a última entrada. */
interface Parada { t: string | null; msg: boolean; marcador: string; frase: string }
function paradaDe(st: EstadoNumero, agora: Date): Parada {
  const n = st.n;
  if (st.m && n.ultimaMsg) {
    const q = quandoTxt(n.ultimaMsg, agora);
    return { t: n.ultimaMsg, msg: true, marcador: `sem mensagens desde ${q}`, frase: `sem mensagens desde ${q}` };
  }
  if (st.inc) {
    const q = quandoTxt(st.inc.inicio, agora);
    return {
      t: st.inc.inicio, msg: false, marcador: `quase sem entradas desde ${q}`,
      frase: `quase sem cliente novo desde ${q} (${aproxDe(st.inc.esperado, 'cliente esperado', 'clientes esperados', aproxClientes)})`,
    };
  }
  if (!st.e && !st.t && st.apagao) {
    const q = quandoTxt(st.apagao.inicio, agora);
    return { t: st.apagao.inicio, msg: true, marcador: `poucas mensagens desde ${q}`, frase: `com poucas mensagens desde ${q}` };
  }
  if (n.ultimaEntrada) {
    return {
      t: n.ultimaEntrada, msg: false,
      marcador: `sem cliente novo há ${duracaoTxt(minEntre(ms(n.ultimaEntrada), agora.getTime()))}`,
      frase: `sem cliente novo desde ${quandoTxt(n.ultimaEntrada, agora)} (${aproxDe(n.esperadoDesdeUltima, 'cliente esperado', 'clientes esperados', aproxClientes)})`,
    };
  }
  return { t: null, msg: true, marcador: 'poucas mensagens agora', frase: 'com poucas mensagens agora' };
}

function cartaoJuntos(sts: EstadoNumero[], agora: Date): AchadoV5 {
  const ord = [...sts].sort((a, b) => b.n.esperadoDesdeUltima - a.n.esperadoDesdeUltima || cmp(a.n.nome, b.n.nome));
  const titulo = ord.length === 2 ? `${nomeCurto(ord[0].n.nome)} e ${nomeCurto(ord[1].n.nome)} pararam juntos` : `${ord.length} números pararam juntos`;
  const par = ord.map((s) => paradaDe(s, agora));
  const partes = ord.map((s, i) => `${nomeCurto(s.n.nome)} ${par[i].frase}`);
  // a prova de que é a conexão: pararam quase no mesmo minuto (o das próprias frases); quando
  // é a parada das MENSAGENS de todos, ela é citada como tal
  const ts = par.map((p) => (p.t ? ms(p.t) : NaN));
  const os = ord.length === 2 ? 'os dois' : `os ${ord.length}`;
  let prova = `${os} parados ao mesmo tempo apontam para a conexão, não para o anúncio`;
  if (ts.every((t) => valido(t))) {
    const dif = minEntre(Math.min(...ts), Math.max(...ts));
    if (dif <= 60) {
      const quem = par.every((p) => p.msg) ? `as mensagens d${os}` : os;
      const quanto = dif === 0 ? 'no mesmo minuto' : `com ${ord.length === 2 ? '' : 'até '}${fmtInt(dif)} min de diferença`;
      prova = `${quem} pararam ${quanto}, o que aponta para a conexão, não para o anúncio`;
    }
  }
  return {
    id: `numeros_parados_juntos:${ord.map((s) => s.n.canalId).sort(cmp).join('+')}`,
    tipo: 'numeros_parados_juntos', severidade: 'atencao', prioridade: 200,
    titulo,
    frase: `${lista(partes)}: ${prova}.`,
    acao: { texto: null, link: CONFERIR_INTEGRACOES },
    soAdmin: false,
  };
}

function marcadorNumero(st: EstadoNumero, agora: Date): MarcadorV5 {
  return { texto: paradaDe(st, agora).marcador, tom: 'ambar' };
}

/* ============================== 2.2 IA parada ============================== */
function achadoIaCredito(s: SinaisV5, agora: Date): AchadoV5 | null {
  const I = L.ia;
  const c = s.ia.credito;
  const ag = agora.getTime();
  if (c && c.erros >= I.errosMin) {
    const desdeFim = ag - ms(c.fim);
    // sem nenhuma resposta boa depois da última falha, o crédito segue zerado — mesmo numa
    // madrugada sem cliente (a próxima conversa também vai falhar)
    if (c.okDepois < I.okDepoisResolvido && desdeFim < I.ativoHoras * HORA) {
      if (c.okDepois === 0) {
        const quieto = desdeFim > I.recenteMin * MIN;
        return {
          id: 'ia_parada:credito', tipo: 'ia_parada', severidade: 'atencao', prioridade: 140,
          titulo: 'A IA parou de responder: o crédito do Gemini acabou',
          frase: quieto
            ? `Desde ${quandoTxt(c.inicio, agora)}, ${qtd(c.erros, 'tentativa falhou', 'tentativas falharam')}; ninguém escreveu desde ${quandoTxt(c.fim, agora)}, mas a próxima conversa também vai falhar.`
            : `Desde ${quandoTxt(c.inicio, agora)}, ${qtd(c.erros, 'tentativa falhou', 'tentativas falharam')} e ${qtd(c.conversas, 'conversa espera', 'conversas esperam')} a IA.`,
          acao: { texto: 'Recarregue o crédito no Google AI Studio e retome as conversas paradas.', link: ABRIR_IA },
          soAdmin: false,
        };
      }
      return {
        id: 'ia_parada:credito', tipo: 'ia_parada', severidade: 'atencao', prioridade: 140,
        titulo: 'O crédito do Gemini pode não ter voltado',
        frase: `Faltou crédito desde ${quandoTxt(c.inicio, agora)} (${qtd(c.erros, 'falha', 'falhas')}); depois da última, às ${hhmm(ms(c.fim))}, a IA respondeu só ${qtd(c.okDepois, 'vez', 'vezes')}.`,
        acao: { texto: 'Confirme se o crédito foi recarregado no Google AI Studio.', link: ABRIR_IA },
        soAdmin: false,
      };
    }
    if (c.okDepois >= I.okDepoisResolvido && desdeFim < I.resolvidoHoras * HORA) {
      return {
        id: 'ia_parada:resolvida', tipo: 'ia_parada', severidade: 'info', prioridade: 45,
        titulo: `A IA ficou parada ${trechoTxt(c.inicio, c.fim, agora)}`,
        frase: `Sem crédito do Gemini: ${qtd(c.erros, 'falha', 'falhas')} e ${qtd(c.conversas, 'conversa esperou', 'conversas esperaram')} a IA nesse tempo.`,
        acao: { texto: 'Confira se essas conversas foram retomadas.', link: ABRIR_IA },
        soAdmin: false,
      };
    }
  }
  if (s.ia.erros60 >= I.erros60Min && s.ia.ok60 <= s.ia.erros60 * I.okFrac) {
    return {
      id: 'ia_parada:erros', tipo: 'ia_parada', severidade: 'atencao', prioridade: 140,
      titulo: `A IA está falhando: ${qtd(s.ia.erros60, 'erro', 'erros')} e ${qtd(s.ia.ok60, 'resposta', 'respostas')} na última hora`,
      frase: 'Os clientes que escrevem agora não recebem resposta da IA.',
      acao: { texto: null, link: ABRIR_IA },
      soAdmin: false,
    };
  }
  return null;
}

/** A IA atrasada com a fila represada, dito com o que é medido: dos clientes que chegaram nas
 *  últimas 3 h até 30 min atrás (os mais novos ainda não contam), quantos a IA atendeu em até
 *  30 min. A rajada entra na conta à vista: "dos 94 que chegaram até 10:30 (os 92 e mais 2)". */
interface AtrasoIa { k: number; n: number; ate: string }
function atrasoIaTxt(a: AtrasoIa, qtdRajada: number | null): string {
  const extra = qtdRajada != null && a.n > qtdRajada ? ` (os ${fmtInt(qtdRajada)} e mais ${fmtInt(a.n - qtdRajada)})` : '';
  const dos = `dos ${fmtInt(a.n)} que chegaram até ${a.ate}${extra}`;
  return a.k === 0
    ? `nenhum ${dos} foi atendido pela IA em até 30 min`
    : `só ${fmtInt(a.k)} ${dos} ${pl(a.k, 'foi atendido', 'foram atendidos')} pela IA em até 30 min`;
}

/** a cobertura caiu; `atraso` = a mesma informação dita dentro do cartão da queda que a
 *  explica (fila represada logo depois da volta — um assunto, uma linha) */
function achadoIaCobertura(n: NumeroSinaisV5, agora: Date): { a: AchadoV5; atraso: AtrasoIa | null } | null {
  const I = L.ia;
  const base = n.iaCob7d.n >= I.cobBaseN ? n.iaCob7d.comIa / n.iaCob7d.n : 0;
  if (base < I.cobBase) return null;
  if (n.ia3h.n < I.cobN3h || n.ia3h.comIa > I.cobFrac * n.ia3h.n) return null;
  const ag = agora.getTime();
  const raj = n.rajadas.filter((r) => ag - ms(r.inicio) <= 3 * HORA && r.qtd >= L.notas.rajadaMin)
    .sort((a, b) => b.qtd - a.qtd || cmp(a.inicio, b.inicio))[0];
  // fila represada (≥ 20 de uma vez depois de ≥ 3 h sem entrada): a IA está ligada e
  // atendendo com atraso — é informação, não "confira se a IA está ligada"
  if (raj && raj.silencioAntesH != null && raj.silencioAntesH >= L.queda.represadasSilencioH) {
    const atraso: AtrasoIa = { k: n.ia3h.comIa, n: n.ia3h.n, ate: hhmm(ag - 30 * MIN) };
    return {
      a: {
        id: `ia_parada:cobertura:${n.canalId}`, tipo: 'ia_parada', severidade: 'info', prioridade: 60,
        titulo: `IA atendendo com atraso no ${n.nome}`,
        frase: `${fmtInt(raj.qtd)} clientes chegaram de uma vez às ${hhmm(ms(raj.inicio))} (mensagens represadas); ${atrasoIaTxt(atraso, raj.qtd)}.`,
        acao: null,
        soAdmin: false,
      },
      atraso,
    };
  }
  return {
    a: {
      id: `ia_parada:cobertura:${n.canalId}`, tipo: 'ia_parada', severidade: 'atencao', prioridade: 140,
      titulo: `IA sem atender no ${n.nome}`,
      frase: `Só ${pctDe(n.ia3h.comIa, n.ia3h.n)} dos clientes das últimas 3 h passaram pela IA; o normal é ${fmtPct(base * 100)}.`
        + (raj ? ` ${fmtInt(raj.qtd)} chegaram de uma vez às ${hhmm(ms(raj.inicio))}.` : ''),
      acao: { texto: null, link: linkRota('Conferir a IA', '/ia') },
      soAdmin: false,
    },
    atraso: null,
  };
}

/* ============================== 2.3 qualidade do tráfego ============================== */
function acaoMotivo(m: string | null): string {
  switch (m) {
    case 'sem_beneficio_inss': return 'Revise o texto do anúncio: deixe claro que é para quem recebe benefício do INSS.';
    case 'sem_emprestimo_banco': return 'Revise o público: o atendimento é para quem tem empréstimo nas financeiras atendidas.';
    default: return 'Revise o público e o texto do anúncio.';
  }
}

function achadoQualidade(n: NumeroSinaisV5, hoje: string): AchadoV5 | null {
  const Q = L.qualidade;
  // número aprendendo (1ª semana) não tem base própria: nada de "o normal é 0%"
  if (!n.trafego || (n.aprendendoAte && n.aprendendoAte > hoje)) return null;
  const q = n.qual24h, b = n.qualBase;
  if (q.n <= 0 || b.n <= 0 || b.dias < Q.baseDias) return null;
  const pRs = q.rs / q.n, p0Rs = b.rs / b.n;
  if (q.rs >= Q.rsMin && pRs >= Q.rsFrac && pRs >= Q.rsMult * p0Rs) {
    return {
      id: `qualidade_trafego:rs:${n.canalId}`, tipo: 'qualidade_trafego', severidade: 'atencao', prioridade: 90,
      titulo: `${qtd(q.rs, 'cliente', 'clientes')} de fora do RS no ${n.nome} em 24 h`,
      frase: `São ${fmtPct(pRs * 100)} das entradas (o normal é ${fmtPct(p0Rs * 100)}); a regra do DDD descarta na hora.`,
      acao: { texto: 'Confira a região do anúncio no Gerenciador.', link: verNumero(n) },
      soAdmin: false,
    };
  }
  const p0 = b.iaDesc / b.n;
  if (q.n >= Q.descN && p0 > 0 && p0 < 1) {
    const z = (q.iaDesc - q.n * p0) / Math.sqrt(q.n * p0 * (1 - p0));
    const p = q.iaDesc / q.n;
    if (z >= Q.descZ && p - p0 >= Q.descPp) {
      // o motivo que mais subiu (participação na janela − participação na base)
      let mot: string | null = null; let melhor = -Infinity;
      for (const [k, v] of Object.entries(q.motivos)) {
        const d = v / q.n - (b.motivos[k] ?? 0) / b.n;
        if (d > melhor || (d === melhor && mot != null && k < mot)) { melhor = d; mot = k; }
      }
      return {
        id: `qualidade_trafego:desc:${n.canalId}`, tipo: 'qualidade_trafego', severidade: 'atencao', prioridade: 90,
        titulo: `IA descartou ${fmtPct(p * 100)} das entradas do ${n.nome} em 24 h`,
        frase: `${fmtInt(q.iaDesc)} de ${qtd(q.n, 'cliente', 'clientes')}, contra ${fmtPct(p0 * 100)} normalmente.`
          + (mot ? ` O motivo que mais subiu: ${rotuloMotivoNe(mot)} (${fmtInt(q.motivos[mot])}).` : ''),
        acao: { texto: acaoMotivo(mot), link: mot ? linkAlvo('Ver motivos', { bloco: 'motivos', motivo: mot }) : verNumero(n) },
        soAdmin: false,
      };
    }
  }
  return null;
}

/* ============================== 2.4 / 2.5 equipe e atendentes ============================== */
function noHorarioEquipe(s: SinaisV5, agora: Date): boolean {
  const { hora } = relogio(agora);
  return !!s.equipe && s.diaUtil && hora >= L.equipe.horaIni && hora <= L.equipe.horaFim;
}

/** mediana da base na hora cheia, puxada linearmente para a hora seguinte */
function baseInterpolada(base: number[], prox: number[] | null, frac: number): number | null {
  const a = mediana(base);
  if (a == null) return null;
  const b = prox && prox.length ? mediana(prox) : null;
  return b == null ? a : a + (b - a) * frac;
}

interface FilaPessoa { p: PessoaSinaisV5; piso: number; base: number; dispara: boolean; recorrente: boolean; excesso: number; diasBase: number }

/** só os dias da base em que a pessoa trabalhou (diasAtivos); sem a máscara, todos */
function soAtivos(v: number[], mascara: boolean[]): number[] {
  return mascara.length === v.length ? v.filter((_, i) => mascara[i]) : v;
}

function filaPessoa(p: PessoaSinaisV5, s: SinaisV5, agora: Date): FilaPessoa {
  const A = L.atendente;
  const { frac, minDia } = relogio(agora);
  const dias = s.equipe?.filaBase.length ?? 0;
  // sem nenhuma espera nos dias da base, a pessoa não aparece na grade: zeros nos dias dela
  const bruta = p.fila.base.length ? p.fila.base : Array.from({ length: dias }, () => 0);
  const arr = soAtivos(bruta, p.diasAtivos);
  const proxBruta = p.fila.baseProx && p.fila.baseProx.length ? p.fila.baseProx : (p.fila.base.length ? null : bruta);
  const prox = proxBruta ? soAtivos(proxBruta, p.diasAtivos) : null;
  const piso = Math.max(A.pisoMin, Math.round((A.pisoRef * p.parteRodizio14d) / A.parteRef));
  const base = baseInterpolada(arr, prox, frac) ?? 0;
  const agoraN = p.fila.agora;
  // pessoa nova (menos de 5 dias trabalhados na base): só com a fila bem acima do piso
  const dispara = arr.length >= A.baseDiasMin
    ? agoraN >= piso && agoraN >= A.filaMult * Math.max(base, 1)
    : agoraN >= piso + A.semBaseMais;
  // recorrente: (a) ainda não começou e costuma começar MAIS TARDE que agora; ou (b) a mesma
  // régua valeu em ≥ 3 dos 5 últimos dias trabalhados
  const comecaDepois = p.primeiraMsgHoje == null && p.primeiraMsgMedianaMin != null && p.primeiraMsgMedianaMin > minDia;
  const med = mediana(arr) ?? 0;
  const vezesAntes = arr.slice(-A.recorrenteJanela).filter((x) => x >= piso && x >= A.filaMult * Math.max(med, 1)).length;
  const recorrente = dispara && (comecaDepois || vezesAntes >= A.recorrenteDias);
  return { p, piso, base, dispara, recorrente, excesso: agoraN - Math.max(piso, A.filaMult * Math.max(base, 1)), diasBase: arr.length };
}

function achadoEquipe(s: SinaisV5, agora: Date, filas: FilaPessoa[]): AchadoV5 | null {
  if (!noHorarioEquipe(s, agora)) return null;
  const E = L.equipe;
  const eq = s.equipe!;
  const { frac, hora } = relogio(agora);
  const acao: AchadoV5['acao'] = { texto: 'Veja se alguém está fora e redistribua os mais antigos.', link: linkAlvo('Ver atendentes', { bloco: 'atendentes' }) };
  const med = eq.respHoje.medianaMin;
  const base = mediana(eq.respBase);
  const nMin = hora < E.respManhaAte ? E.respNManha : E.respN;
  if (med != null && base != null && eq.respHoje.n >= nMin && eq.respBase.length >= E.respBaseDias
      && med >= E.respMult * base && med >= base + E.respMais) {
    const lentos = s.pessoas
      .filter((p) => p.respHoje && p.respHoje.n >= 5 && p.respHoje.medianaMin != null && p.respHoje.medianaMin > med)
      .sort((a, b) => (b.respHoje!.medianaMin ?? 0) - (a.respHoje!.medianaMin ?? 0) || cmp(a.nome, b.nome))
      .slice(0, 2);
    return {
      id: 'equipe_lenta:resposta', tipo: 'equipe_lenta', severidade: 'atencao', prioridade: 120,
      titulo: `Equipe respondendo mais devagar hoje: ${duracaoTxt(med)}`,
      frase: `Metade das ${fmtInt(eq.respHoje.n)} respostas de hoje levou mais de ${duracaoTxt(med)} (o normal a esta hora é ${duracaoTxt(base)}).`
        + (lentos.length ? ` Mais lentos: ${lista(lentos.map((p) => `${primeiroNome(p.nome)} ${duracaoTxt(p.respHoje!.medianaMin!)}`))}.` : ''),
      acao, soAdmin: false,
    };
  }
  const bf = baseInterpolada(eq.filaBase, eq.filaBaseProx, frac);
  if (bf != null) {
    const acima = (x: number) => x >= E.filaMin && x >= E.filaMult * bf;
    // histerese: entra acima do limite; segue enquanto ≥ 35 e esteve acima nos últimos 30 min
    const ativa = acima(eq.filaAgora) || (eq.filaAgora >= E.filaSair && eq.filaAntes.some(acima));
    if (ativa) {
      const quem = filas.filter((f) => f.p.fila.agora > 0).sort((a, b) => b.p.fila.agora - a.p.fila.agora || cmp(a.p.nome, b.p.nome));
      return {
        id: 'equipe_lenta:fila', tipo: 'equipe_lenta', severidade: 'atencao', prioridade: 120,
        titulo: `${qtd(eq.filaAgora, 'lead espera', 'leads esperam')} a primeira mensagem da equipe`,
        frase: `Ninguém escreveu há mais de 2 horas de expediente (normal a esta hora: ${aproxDe(bf, 'lead esperando', 'leads esperando')}).`
          + (quem.length ? ` ${lista(quem.map((f) => `${primeiroNome(f.p.nome)} ${fmtInt(f.p.fila.agora)}`))}.` : ''),
        acao, soAdmin: false,
      };
    }
  }
  return null;
}

function achadosAtendentes(s: SinaisV5, agora: Date, filas: FilaPessoa[]): AchadoV5[] {
  if (!noHorarioEquipe(s, agora)) return [];
  const A = L.atendente;
  const out: AchadoV5[] = [];
  for (const f of filas) {
    const p = f.p;
    const nome = primeiroNome(p.nome);
    if (f.dispara) {
      const extra = f.recorrente && p.primeiraMsgMedianaMin != null
        ? ` ${nome} costuma começar por volta das ${hhmmDoMinuto(p.primeiraMsgMedianaMin)}.`
        : p.primeiraMsgHoje == null ? ` ${nome} ainda não mandou mensagem hoje.`
          : p.fila.maisAntigo ? ` O mais antigo espera desde ${quandoTxt(p.fila.maisAntigo, agora)}.` : '';
      out.push({
        id: `atendente_atrasado:${p.usuarioId}`, tipo: 'atendente_atrasado',
        severidade: f.recorrente ? 'info' : 'atencao',
        prioridade: 100 + Math.min(Math.max(0, Math.round(f.excesso)), 20),
        titulo: `${qtd(p.fila.agora, 'lead', 'leads')} de ${nome} ${pl(p.fila.agora, 'espera', 'esperam')} a primeira mensagem`,
        frase: `Ninguém escreveu há mais de 2 horas de expediente (normal de ${nome} a esta hora: ${aproxDe(f.base, 'lead esperando', 'leads esperando')}).${extra}`,
        acao: { texto: 'Peça para começar por esses ou redistribua os mais antigos.', link: verPessoa(p) },
        soAdmin: true,
      });
      continue;
    }
    const r = p.respHoje;
    const ativos = p.diasAtivos.length === p.respBase.length ? p.respBase.filter((_, i) => p.diasAtivos[i]) : p.respBase;
    const bases = ativos.filter((x) => x.n >= A.respBaseDiaN && x.med != null).map((x) => x.med as number);
    const b = mediana(bases);
    if (r && r.medianaMin != null && b != null && r.n >= A.respN && bases.length >= A.respBaseDias
        && r.medianaMin >= A.respMult * b && r.medianaMin >= b + A.respMais
        && p.respRestoMedianaMin != null && r.medianaMin >= A.respRestoMult * p.respRestoMedianaMin) {
      out.push({
        id: `atendente_atrasado:${p.usuarioId}`, tipo: 'atendente_atrasado', severidade: 'atencao',
        prioridade: 100 + Math.min(Math.round(r.medianaMin - b), 20),
        titulo: `${nome} respondendo mais devagar hoje: ${duracaoTxt(r.medianaMin)}`,
        frase: `Metade das ${fmtInt(r.n)} respostas de ${nome} levou mais de ${duracaoTxt(r.medianaMin)}; o normal é ${duracaoTxt(b)} e o resto da equipe está em ${duracaoTxt(p.respRestoMedianaMin)} hoje.`,
        acao: { texto: `Veja se ${nome} precisa de ajuda com a fila.`, link: verPessoa(p) },
        soAdmin: true,
      });
    }
  }
  return out;
}

/* ============================== 2.6 quedas encerradas ============================== */
/** duração de uma queda pelo relógio da tela (o mesmo número no cartão e na observação) */
const durQueda = (q: QuedaV5) => minEntre(ms(q.inicio), ms(q.fim));

/** a queda que acabou com esta rajada (a 1ª entrada da rajada encerra a queda) */
function quedaDaRajada(n: NumeroSinaisV5, r: RajadaV5): QuedaV5 | null {
  return n.quedas.find((q) => ms(r.inicio) >= ms(q.fim) - 5 * MIN && ms(r.inicio) <= ms(q.fim) + 30 * MIN) ?? null;
}

function achadosQuedas(s: SinaisV5, agora: Date, modo: Modo, ocupados: Set<string>, extra: Map<string, AtrasoIa>,
  abertos: EstadoNumero[]): AchadoV5[] {
  const ag = agora.getTime();
  const Qd = L.queda;
  const traf = s.numeros.filter((n) => n.trafego);
  if (modo === 'hoje') {
    const out: AchadoV5[] = [];
    for (const n of traf) {
      // número com cartão ativo (inclusive a volta ainda não confirmada) não ganha "voltou"
      if (ocupados.has(n.canalId)) continue;
      const q = n.quedas.filter((x) => ag - ms(x.fim) < Qd.horasHoje * HORA && ms(x.fim) <= ag)
        .sort((a, b) => ms(b.fim) - ms(a.fim))[0];
      if (!q) continue;
      if (!voltaConfirmada(n, q, filete(n, ultimaQueda(n, ag), ag))) continue;
      const durMin = durQueda(q);
      const menos = Math.max(0, q.esperado - q.chegaram);
      const raj = n.rajadas.find((r) => ms(r.inicio) >= ms(q.fim) - 5 * MIN && ms(r.inicio) <= ms(q.fim) + 30 * MIN
        && r.qtd >= Qd.represadasMin);
      const atraso = extra.get(n.canalId);
      const comRaj = !!raj && durMin >= Qd.represadasSilencioH * 60;
      const represadas = comRaj
        ? (atraso
          ? ` Ao voltar, ${fmtInt(raj!.qtd)} chegaram em ${fmtInt(raj!.minutos)} min (represados). A IA atende essa fila com atraso: ${atrasoIaTxt(atraso, raj!.qtd)}.`
          : ` Ao voltar, ${fmtInt(raj!.qtd)} chegaram em ${fmtInt(raj!.minutos)} min: eram mensagens represadas, não pico de procura.`)
        : atraso ? ` A IA atende essa fila com atraso: ${atrasoIaTxt(atraso, null)}.` : '';
      const trecho = cap(trechoTxt(q.inicio, q.fim, agora));
      out.push({
        id: `queda_encerrada:${n.canalId}`, tipo: 'queda_encerrada', severidade: 'info',
        prioridade: 50 + Math.min(Math.round(menos), 30),
        titulo: `${n.nome} voltou depois de ${duracaoTxt(durMin)} ${q.chegaram === 0 ? 'sem entradas' : 'quase sem entradas'}`,
        frase: (q.chegaram === 0
          ? `${trecho} não chegou nenhum cliente; o normal seria ${aproxClientes(q.esperado)}.`
          : `${trecho} ${pl(q.chegaram, 'chegou', 'chegaram')} ${qtd(q.chegaram, 'cliente', 'clientes')}; o normal seria ${aproxClientes(q.esperado)}.`)
          + represadas,
        acao: { texto: null, link: verNumero(n) },
        soAdmin: false,
      });
    }
    return out;
  }
  // a queda que acabou mas cuja volta não se confirmou é o MESMO incidente do cartão aberto:
  // ela não conta duas vezes (encerrada aqui e em andamento acima)
  const doIncidente = new Set(abertos.filter((x) => x.inc).map((x) => `${x.n.canalId}|${x.inc!.inicio}`));
  const todas = traf.flatMap((n) => n.quedas.filter((q) => ms(q.fim) <= ag && !doIncidente.has(`${n.canalId}|${q.inicio}`)).map((q) => ({ n, q })));
  if (!todas.length) return [];
  const soma = todas.reduce((a, x) => a + Math.max(0, x.q.esperado - x.q.chegaram), 0);
  const maior = [...todas].sort((a, b) => (b.q.esperado - b.q.chegaram) - (a.q.esperado - a.q.chegaram)
    || ms(b.q.fim) - ms(a.q.fim))[0];
  const durMaior = durQueda(maior.q);
  const outros = new Map<string, { nome: string; k: number }>();
  for (const x of todas) {
    if (x.n.canalId === maior.n.canalId) continue;
    const o = outros.get(x.n.canalId) ?? { nome: x.n.nome, k: 0 };
    o.k++; outros.set(x.n.canalId, o);
  }
  const segundo = [...outros.values()].sort((a, b) => b.k - a.k || cmp(a.nome, b.nome))[0];
  const trecho = trechoTxt(maior.q.inicio, maior.q.fim, agora);
  const menos = `${aproxClientes(soma)} ${pl(Math.round(soma), 'cliente', 'clientes')} a menos`;
  // quedas ainda abertas (os cartões de número parado logo acima): o total do período conta
  // com elas, sem o "1 queda no período" ao lado de outra em andamento
  const abertas = abertos.map((x) => nomeCurto(x.n.nome)).sort(cmp);
  const k = abertas.length;
  const emAndamento = k === 0 ? ''
    : k === 1 ? ` A queda do ${abertas[0]} ainda não acabou (acima).`
      : ` As quedas de ${lista(abertas)} ainda não acabaram (acima).`;
  const sem = maior.q.chegaram === 0 ? 'sem entradas' : 'quase sem entradas';
  const frase = todas.length === 1
    ? `${maior.n.nome} ficou ${duracaoTxt(durMaior)} ${sem} (${trecho})${k ? `: ${menos}.` : '.'}`
    : `A maior: ${maior.n.nome}, ${duracaoTxt(durMaior)} (${trecho}).` + (segundo ? ` ${segundo.nome}: ${qtd(segundo.k, 'queda', 'quedas')}.` : '')
      + (k ? ` Nas encerradas, ${menos}.` : '');
  return [{
    id: 'queda_encerrada:periodo', tipo: 'queda_encerrada', severidade: 'info',
    prioridade: 50 + Math.min(Math.round(soma), 30),
    titulo: k
      ? `${qtd(todas.length, 'queda encerrada', 'quedas encerradas')} no período, mais ${fmtInt(k)} em andamento`
      : `${qtd(todas.length, 'queda', 'quedas')} no período, ${menos}`,
    frase: frase + emAndamento,
    acao: { texto: null, link: verNumero(maior.n) },
    soAdmin: false,
  }];
}

/* ============================== 2.7 fechamentos da semana ============================== */
type EstadoFech = 'queda' | 'alta' | null;
interface JanelaFech { c: number; b: number | null; min: number; max: number; f: number; fb: number | null; e: number; eb: number | null }

function somaJanela(mapa: Map<string, FechDiaV5>, fim: string, campo: 'ganhos' | 'fichas' | 'entradas'): number | null {
  let s = 0;
  for (let i = 0; i < 7; i++) {
    const d = mapa.get(addDia(fim, -i));
    if (!d) return null;
    s += d[campo];
  }
  return s;
}

/** janela de 7 dias COMPLETOS terminando em `fim` (só para saber há quantos dias o estado dura) */
function janelaDiaria(diario: FechDiaV5[], fim: string): JanelaFech | null {
  const mapa = new Map(diario.map((d) => [d.dia, d]));
  const c = somaJanela(mapa, fim, 'ganhos');
  if (c == null) return null;
  const v: number[] = [];
  for (let k = 1; k <= 4; k++) { const x = somaJanela(mapa, addDia(fim, -7 * k), 'ganhos'); if (x != null) v.push(x); }
  return { c, b: v.length === 4 ? mediana(v) : null, min: Math.min(...v), max: Math.max(...v), f: 0, fb: null, e: 0, eb: null };
}

/** a semana da tela ("7 dias": hoje e os 6 anteriores, até agora) contra as 4 de antes no mesmo relógio */
function janelaSemanas(s: SinaisV5): JanelaFech | null {
  const sem = s.fechamentos.semanas;
  if (sem.length < 5) return null;
  const ant = sem.slice(1, 5);
  const med = (k: 'ganhos' | 'fichas' | 'entradas') => mediana(ant.map((x) => x[k]));
  const g = ant.map((x) => x.ganhos);
  return {
    c: sem[0].ganhos, b: med('ganhos'), min: Math.min(...g), max: Math.max(...g),
    f: sem[0].fichas, fb: med('fichas'), e: sem[0].entradas, eb: med('entradas'),
  };
}

function estadoFech(j: JanelaFech | null): EstadoFech {
  const F = L.fech;
  if (!j || j.b == null || j.b < F.baseMin) return null;
  if (j.c <= F.quedaFrac * j.b) return 'queda';
  if (j.c >= F.altaMult * j.b && j.c >= F.altaMin) return 'alta';
  return null;
}

/** o achado e se ele já carrega as fichas sem "fechado" da semana (a nota sai do rodapé) */
function achadoFechamentos(s: SinaisV5, agora: Date, modo: Modo, preset: PresetDash): { a: AchadoV5; semFechado: boolean } | null {
  if (modo === 'fechado') return null;
  const F = L.fech;
  const j0 = janelaSemanas(s);
  const e0 = estadoFech(j0);
  if (!e0 || !j0 || j0.b == null) return null;
  if (modo === 'hoje' || modo === 'curto') {
    // nos primeiros 2 dias do estado e às segundas: um estado de 2 semanas não se repete todo dia
    const ontem = addDia(diaSP(agora.getTime()), -1);
    const e1 = estadoFech(janelaDiaria(s.fechamentos.diario, ontem));
    const e2 = estadoFech(janelaDiaria(s.fechamentos.diario, addDia(ontem, -1)));
    const segunda = relogio(agora).dow === 1;
    const dias = e1 !== e0 ? 1 : e2 !== e0 ? 2 : 3;
    if (dias > F.diasExibir && !segunda) return null;
  }
  // "Ver quem fechou" só quando a tabela mostra a MESMA janela (o preset 7 dias); nos
  // outros períodos o link troca para os 7 dias
  const link: LinkAcaoV5 = preset === '7d'
    ? linkAlvo('Ver quem fechou', { bloco: 'atendentes' })
    : { rotulo: 'Ver os 7 dias', preset: '7d' };
  // o "normal" é a semana típica (mediana) — com a faixa das 4 para mostrar de onde vem, sem
  // um "× o normal" que competiria com a % do KPI (que compara só com a semana anterior)
  const faixa = j0.min === j0.max
    ? `Uma semana típica tem ${aprox(j0.b)}.`
    : `Uma semana típica tem ${aprox(j0.b)} (nas 4 anteriores, de ${fmtInt(j0.min)} a ${fmtInt(j0.max)}).`;
  const u = s.fechamentos.semFechadoSemana;
  const contaSemFechado = u >= F.semFechadoMin;
  const clausSemFechado = contaSemFechado
    ? ` Outras ${fmtInt(u)} fichas finalizadas na semana ainda não estão completas no administrativo.` : '';
  if (e0 === 'queda') {
    const fichasOk = j0.fb != null && j0.fb > 0 && j0.f >= F.fichasOk * j0.fb;
    const entradasCairam = j0.eb != null && j0.eb > 0 && j0.e <= F.entradasQueda * j0.eb;
    let clausula: string;
    if (fichasOk) clausula = ` As fichas finalizadas seguem no normal (${fmtInt(j0.f)} na semana): pode ser só falta de marcar.`;
    else if (entradasCairam) clausula = ` As fichas finalizadas (${fmtInt(j0.f)} contra ${aprox(j0.fb ?? 0)}) e as entradas (${fmtInt(j0.e)} contra ${aprox(j0.eb ?? 0)}) também caíram.`;
    else clausula = ` As fichas finalizadas também caíram (${fmtInt(j0.f)} contra ${aprox(j0.fb ?? 0)}); as entradas seguem no normal.`;
    return {
      a: {
        id: 'fechamentos_semana:queda', tipo: 'fechamentos_semana', severidade: 'atencao', prioridade: 80,
        titulo: `${qtd(j0.c, 'fechado', 'fechados')} nos últimos 7 dias, abaixo do normal`,
        frase: `${faixa}${clausula}`,
        acao: { texto: fichasOk ? 'Confira com o administrativo as fichas finalizadas que ainda não estão completas lá.' : null, link },
        soAdmin: false,
      },
      semFechado: false,
    };
  }
  // alta: com muitas fichas sem "fechado", os dois fatos ficam juntos (22 marcados; outras 59
  // fichas sem marca) — sem afirmar "é venda" enquanto o dono não decide o que conta
  const fichasSubiram = !contaSemFechado && j0.fb != null && j0.fb > 0 && j0.f >= F.fichasAlta * j0.fb;
  return {
    a: {
      id: 'fechamentos_semana:alta', tipo: 'fechamentos_semana', severidade: 'bom', prioridade: 40,
      titulo: `${qtd(j0.c, 'fechado', 'fechados')} nos últimos 7 dias, acima do normal`,
      frase: faixa
        + (contaSemFechado ? clausSemFechado : fichasSubiram ? ` As fichas finalizadas também subiram (${fmtInt(j0.f)} contra ${aprox(j0.fb ?? 0)}).` : ''),
      acao: { texto: null, link },
      soAdmin: false,
    },
    semFechado: contaSemFechado,
  };
}

/* ============================== 2.8 passados sem contato ============================== */
function achadosPassados(s: SinaisV5, filas: Map<string, FilaPessoa>): AchadoV5[] {
  const P = L.passados;
  const com = s.pessoas.filter((p) => p.passados && p.passados.n > 0);
  const out: AchadoV5[] = [];
  for (const p of com) {
    const n = p.passados!.n, k = p.passados!.semContato;
    const rn = com.filter((x) => x !== p).reduce((a, x) => a + x.passados!.n, 0);
    const rk = com.filter((x) => x !== p).reduce((a, x) => a + x.passados!.semContato, 0);
    if (n < P.n || rn <= 0) continue;
    const pu = k / n, pr = rk / rn, pp = (k + rk) / (n + rn);
    const z = pp > 0 && pp < 1 ? (pu - pr) / Math.sqrt(pp * (1 - pp) * (1 / n + 1 / rn)) : 0;
    if (!(pu >= P.frac && pu >= P.mult * pr && z >= P.z)) continue;
    const nome = primeiroNome(p.nome);
    const f = filas.get(p.usuarioId);
    const vivo = f?.dispara ? ` Agora, ${qtd(p.fila.agora, 'espera', 'esperam')} a primeira mensagem.` : '';
    out.push({
      id: `passados_sem_contato:${p.usuarioId}`, tipo: 'passados_sem_contato', severidade: 'atencao', prioridade: 70,
      // "passados" = os que a IA ou o robô passou para a pessoa (o rodízio já tinha escolhido
      // quem): o número difere de "Recebidos" e a frase diz por quê, em uma oração
      titulo: `${fmtInt(k)} de ${fmtInt(n)} leads que a IA passou para ${nome} ${pl(k, 'ficou', 'ficaram')} sem mensagem`,
      frase: `São ${fmtPct(pu * 100)} sem mensagem registrada em 1 dia de expediente; no resto da equipe, ${fmtPct(pr * 100)}.`
        + ` Contam só os que a IA ou o robô passou há mais de 1 dia de expediente, por isso não é o número de “Recebidos”.`
        + ` Ligações não aparecem aqui.${vivo}`,
      acao: { texto: `Redistribua os que ainda esperam ou ajuste o peso de ${nome} no rodízio.`, link: verPessoa(p) },
      soAdmin: true,
    });
  }
  return out;
}

/* ============================== 2.9 ritmo do dia (reserva) ============================== */
function achadoRitmo(s: SinaisV5, agora: Date): AchadoV5 | null {
  const R = L.ritmo;
  const { hora } = relogio(agora);
  const b = s.total.normalAteAgora;
  if (hora < R.horaMin || b == null || b < R.normalMin) return null;
  const r = s.total.hoje / b;
  const hh = hhmm(agora.getTime());
  const frase = `${qtd(s.total.hoje, 'entrada', 'entradas')} até ${hh}; o normal até este horário é ${aprox(b)}.`;
  if (r < R.baixo) {
    // "recebendo mensagens normalmente" só quando é verdade em TODO número de tráfego
    const traf = s.numeros.filter((n) => n.trafego);
    const msgsOk = traf.length > 0 && traf.every((n) => n.msgs60.esp <= 0 || n.msgs60.rec >= R.msgsOk * n.msgs60.esp);
    return {
      id: 'ritmo_dia:baixo', tipo: 'ritmo_dia', severidade: 'info', prioridade: 30,
      titulo: 'Entradas abaixo do normal hoje',
      frase: msgsOk ? `${frase} Os números estão recebendo mensagens normalmente.` : frase,
      acao: { texto: 'Veja a entrega dos anúncios no Gerenciador.', link: linkAlvo('Ver Entradas', { bloco: 'kpi', kpi: 'entradas' }) },
      soAdmin: false,
    };
  }
  if (r > R.alto && !s.total.rajadaHoje) {
    return {
      id: 'ritmo_dia:alto', tipo: 'ritmo_dia', severidade: 'bom', prioridade: 30,
      titulo: 'Entradas acima do normal hoje',
      frase,
      acao: { texto: 'Garanta resposta rápida enquanto o anúncio rende.', link: linkAlvo('Ver Entradas', { bloco: 'kpi', kpi: 'entradas' }) },
      soAdmin: false,
    };
  }
  return null;
}

/* ============================== 2.10 observações (rodapé) ============================== */
function notasDados(s: SinaisV5, agora: Date, modo: Modo, explicadas: Set<string>, admin: boolean, semFichasNota: boolean): NotaV5[] {
  const out: NotaV5[] = [];
  const quandoDe = (iso: string) => `${hhmm(ms(iso))} de ${ddmmMs(ms(iso))}`;
  for (const l of s.notas.lotesNe) {
    if (l.sistema) {
      // "antigos" só quando a maioria era antiga (29/09 13:44: 9 de 223 — não eram)
      const antigos = l.antigos * 2 >= l.qtd;
      out.push({
        id: `lote_ne:${l.minuto}`,
        texto: `Às ${quandoDe(l.minuto)}, ${qtd(l.qtd, antigos ? 'lead antigo foi marcado' : 'lead foi marcado', antigos ? 'leads antigos foram marcados' : 'leads foram marcados')} como não elegíveis de uma vez pelo sistema.`,
      });
      continue;
    }
    const quem = admin && l.quem ? primeiroNome(l.quem) : null;
    const datas = l.dMin && l.dMax ? (l.dMin === l.dMax ? `de ${ddmmDia(l.dMin)}` : `de ${ddmmDia(l.dMin)} a ${ddmmDia(l.dMax)}`) : '';
    const data = l.retroativos <= 0 || !datas ? ''
      : l.retroativos >= l.qtd ? `, todos com data antiga (${datas})`
        : ` (${fmtInt(l.retroativos)} com data antiga, ${datas})`;
    const contam = l.retroativos > 0
      ? ` Eles contam nos dias dessas datas e no total de ${quem ?? 'quem marcou'}.`
      : ` Eles contam no total de ${quem ?? 'quem marcou'}.`;
    out.push({ id: `lote_ne:${l.minuto}`, texto: `Às ${quandoDe(l.minuto)}, ${qtd(l.qtd, 'não elegível foi marcado', 'não elegíveis foram marcados')} de uma vez por ${quem ?? 'alguém da equipe'}${data}.${contam}` });
  }
  for (const t of s.notas.transferencias) {
    const para = t.para.map((x) => primeiroNome(x.nome));
    const texto = admin && t.de && para.length
      ? `Às ${quandoDe(t.minuto)}, ${qtd(t.qtd, 'lead', 'leads')} de ${primeiroNome(t.de)} ${pl(t.qtd, 'passou', 'passaram')} de uma vez para ${lista(para)}.`
      : `Às ${quandoDe(t.minuto)}, ${qtd(t.qtd, 'lead passou', 'leads passaram')} de uma vez de uma pessoa para outras.`;
    out.push({ id: `transferencia_lote:${t.minuto}`, texto: `${texto} “Recebidos” não muda; aparece em “transferidos”.`, link: linkAlvo('Ver transferidos', { bloco: 'atendentes' }) });
  }
  for (const n of s.numeros) {
    if (!n.trafego) continue;
    for (const r of n.rajadas) {
      if (r.qtd < L.notas.rajadaMin || explicadas.has(`${n.canalId}|${r.inicio}`)) continue;
      const mesmoDia = diaSP(ms(r.inicio)) === diaSP(agora.getTime());
      const quando = mesmoDia ? hhmm(ms(r.inicio)) : quandoDe(r.inicio);
      // a queda que a rajada encerrou dá a duração EXATA (a mesma do cartão "voltou depois de
      // 23 h 14"); sem ela, as horas de silêncio do sinal
      const q = quedaDaRajada(n, r);
      const durQ = q ? durQueda(q) : null;
      const silencio = q && durQ! >= L.queda.represadasSilencioH * 60
        ? `, logo depois de ${duracaoTxt(durQ!)} ${q.chegaram === 0 ? 'sem entradas' : 'quase sem entradas'}: mensagens represadas, não pico de procura`
        : !q && r.silencioAntesH != null && r.silencioAntesH >= L.queda.represadasSilencioH
          ? `, logo depois de ${duracaoTxt(r.silencioAntesH * 60)} sem entradas: mensagens represadas, não pico de procura` : '';
      out.push({
        id: `rajada:${n.canalId}:${r.inicio}`,
        texto: `${fmtInt(r.qtd)} clientes do ${n.nome} chegaram em ${fmtInt(r.minutos)} min às ${quando}${silencio}.`,
        link: verNumero(n),
      });
    }
  }
  for (const d of s.feriadosNoPeriodo) {
    out.push({ id: `feriado:${d}`, texto: `O tempo de resposta da tabela conta o feriado de ${ddmmDia(d)} como dia normal.` });
  }
  const fs = s.notas.fichasSemFechado;
  if (fs.total >= L.notas.fichasMin && !semFichasNota) {
    const top = fs.porPessoa.slice(0, 3).map((x) => `${primeiroNome(x.nome)} ${fmtInt(x.qtd)}`);
    const resto = fs.porPessoa.length - top.length;
    const quem = admin && top.length
      ? ` (${resto > 0 ? `${top.join(', ')} e mais ${qtd(resto, 'pessoa', 'pessoas')}` : lista(top)})` : '';
    const quando = modo === 'hoje' ? 'hoje' : 'no período';
    out.push({
      id: 'fichas_sem_fechado',
      texto: `${qtd(fs.total, 'ficha finalizada', 'fichas finalizadas')} ${quando} ${pl(fs.total, 'ainda não está completa', 'ainda não estão completas')} no administrativo${quem}. “Fechados” conta só o que o administrativo confirmou.`,
      link: linkAlvo('Ver Fechados', { bloco: 'kpi', kpi: 'ganhos' }),
    });
  }
  const hoje = diaSP(agora.getTime());
  const fimJ = ms(s.janela.fim);
  const fimPer = diaSP((Number.isFinite(fimJ) ? Math.min(fimJ, agora.getTime()) : agora.getTime()) - 1);
  for (const n of s.numeros) {
    // número que nasceu depois do período (mês anterior fechado) não é assunto dele
    if (!n.aprendendoAte || n.aprendendoAte <= hoje || !n.historiaDesde || n.historiaDesde > fimPer) continue;
    out.push({
      id: `numero_aprendendo:${n.canalId}`,
      texto: `${n.nome} começou em ${ddmmDia(n.historiaDesde)}: avisos de queda a partir de ${ddmmDia(n.aprendendoAte)}.`,
    });
  }
  return out;
}

/* ============================== 2.11 seleção ============================== */
const PESO_SEV: Record<SeveridadeV5, number> = { atencao: 0, bom: 1, info: 2 };

export function selecionar(achados: AchadoV5[], admin: boolean): { achados: AchadoV5[]; visiveis: number } {
  const vistos = new Set<string>();
  const lista0 = achados.filter((a) => (admin || !a.soAdmin) && !vistos.has(a.id) && vistos.add(a.id));
  const ord = [...lista0].sort((a, b) => PESO_SEV[a.severidade] - PESO_SEV[b.severidade]
    || b.prioridade - a.prioridade || cmp(a.id, b.id));
  // até 4; com 2 ou mais "atenção" na tela, no máximo 1 "bom"
  const max = L.maxVisiveis;
  const nAt = Math.min(ord.filter((a) => a.severidade === 'atencao').length, max);
  const vis: AchadoV5[] = []; const resto: AchadoV5[] = [];
  let bons = 0;
  for (const a of ord) {
    if (vis.length >= max) { resto.push(a); continue; }
    if (a.severidade === 'bom' && nAt >= 2 && bons >= 1) { resto.push(a); continue; }
    if (a.severidade === 'bom') bons++;
    vis.push(a);
  }
  return { achados: [...vis, ...resto], visiveis: vis.length };
}

/* ============================== montagem ============================== */
export function montarLeituraV5(s: SinaisV5, o: OpcoesLeituraV5): LeituraV5 {
  const agora = o.agora;
  const ag = agora.getTime();
  const admin = o.admin && s.admin !== false ? o.admin : false;
  // o preset com que ESTE sinal foi buscado (ao trocar de período, o sinal antigo continua
  // sendo lido como antes até o novo chegar)
  const preset = s.preset ?? o.preset;
  const modo = modoDe(s, preset);
  const vivo = modo !== 'fechado';
  const hojeSP = diaSP(ag);
  const marcadores: LeituraV5['marcadores'] = { numeros: {}, atendentes: {} };
  const cand: AchadoV5[] = [];
  const ocupados = new Set<string>();          // números que já têm cartão
  const explicadas = new Set<string>();        // rajadas que um cartão já explica

  // ---- 2.1 números parados (o sinal mais valioso)
  const estados = vivo ? s.numeros.map((n) => estadoNumero(n, agora)).filter((x): x is EstadoNumero => x !== null) : [];
  if (estados.length >= 2 && !estados.some((x) => x.diag === 'anuncio')) {
    cand.push(cartaoJuntos(estados, agora));
  } else {
    for (const st of estados) cand.push(cartaoNumero(st, agora));
  }
  for (const st of estados) { ocupados.add(st.n.canalId); marcadores.numeros[st.n.canalId] = marcadorNumero(st, agora); }

  // ---- 2.2 IA
  const ia = vivo ? achadoIaCredito(s, agora) : null;
  if (ia && (modo === 'hoje' || modo === 'curto' || ia.severidade === 'atencao')) cand.push(ia);
  const creditoAtivo = ia?.id === 'ia_parada:credito';
  // fila represada com a IA atendendo atrasada: vira oração do cartão da queda que acabou
  // (se houver um); sem ele, é um cartão de informação
  const atrasoIa = new Map<string, { a: AchadoV5; atraso: AtrasoIa }>();
  if (vivo && !creditoAtivo) {
    for (const n of s.numeros) {
      if (ocupados.has(n.canalId)) continue;
      const c = achadoIaCobertura(n, agora);
      if (!c) continue;
      for (const r of n.rajadas) if (ag - ms(r.inicio) <= 3 * HORA) explicadas.add(`${n.canalId}|${r.inicio}`);
      if (c.atraso) atrasoIa.set(n.canalId, { a: c.a, atraso: c.atraso });
      else { cand.push(c.a); ocupados.add(n.canalId); }
    }
  }

  // ---- 2.3 qualidade do tráfego
  if (vivo) {
    for (const n of s.numeros) {
      if (ocupados.has(n.canalId)) continue;
      const q = achadoQualidade(n, hojeSP);
      if (q) { cand.push(q); ocupados.add(n.canalId); }
    }
  }

  // ---- 2.4 / 2.5 equipe e pessoas (dia útil 11:00–19:59)
  const avaliouEquipe = vivo && noHorarioEquipe(s, agora);
  const filas = avaliouEquipe ? s.pessoas.map((p) => filaPessoa(p, s, agora)) : [];
  const filaPor = new Map(filas.map((f) => [f.p.usuarioId, f]));
  const equipe = avaliouEquipe ? achadoEquipe(s, agora, filas) : null;
  if (equipe) cand.push(equipe);
  const pessoas = avaliouEquipe && !equipe ? achadosAtendentes(s, agora, filas) : [];
  if (admin) {
    for (const f of filas) if (f.dispara) marcadores.atendentes[f.p.usuarioId] = { texto: `${fmtInt(f.p.fila.agora)} esperam 1ª mensagem`, tom: 'ambar' };
  }

  // ---- 2.8 passados sem contato (períodos de 7 dias ou mais) — junta com o cartão vivo
  const passados = modo === 'longo' || modo === 'fechado' ? achadosPassados(s, filaPor) : [];
  const comPassados = new Set(passados.map((a) => a.id.split(':')[1]));
  for (const a of pessoas) {
    const uid = a.id.split(':')[1];
    if (comPassados.has(uid)) continue;
    if (modo === 'longo' && a.severidade !== 'atencao') continue;   // 7 dias / mês: só atenção ao vivo
    cand.push(a);
  }
  cand.push(...passados);

  // ---- 2.6 quedas encerradas
  const extraQueda = new Map([...atrasoIa].map(([k, v]) => [k, v.atraso]));
  const quedas = achadosQuedas(s, agora, modo, ocupados, extraQueda, estados);
  for (const [canal, v] of atrasoIa) {
    if (!quedas.some((q) => q.id === `queda_encerrada:${canal}`)) { cand.push(v.a); ocupados.add(canal); }
  }
  for (const q of quedas) {
    cand.push(q);
    if (q.id !== 'queda_encerrada:periodo') {
      const canal = q.id.split(':')[1];
      const n = s.numeros.find((x) => x.canalId === canal);
      const qq = n?.quedas.slice().sort((a, b) => ms(b.fim) - ms(a.fim))[0];
      if (n && qq) for (const r of n.rajadas) if (Math.abs(ms(r.inicio) - ms(qq.fim)) <= 30 * MIN) explicadas.add(`${canal}|${r.inicio}`);
    }
  }

  // ---- 2.7 fechamentos da semana
  const fech = achadoFechamentos(s, agora, modo, preset);
  if (fech) cand.push(fech.a);

  // ---- 2.9 ritmo (só Hoje, e só quando NENHUM número tem cartão nem uma queda que acabou
  // hoje: depois de uma queda, "entradas abaixo do normal" culparia o anúncio pelo chip)
  const quedaHoje = s.numeros.some((n) => n.trafego && n.quedas.some((q) => ms(q.fim) <= ag && diaSP(ms(q.fim)) === hojeSP));
  if (modo === 'hoje' && !estados.length && !ocupados.size && !quedaHoje) {
    const ritmo = achadoRitmo(s, agora);
    if (ritmo) cand.push(ritmo);
  }

  // ---- modo do período: 7 dias / mês só com os cartões vivos de atenção
  const filtrados = cand.filter((a) => {
    if (modo === 'hoje') return true;
    if (modo === 'curto') return a.tipo !== 'ritmo_dia' && a.tipo !== 'passados_sem_contato';
    if (modo === 'longo') {
      if (a.tipo === 'queda_encerrada' || a.tipo === 'fechamentos_semana' || a.tipo === 'passados_sem_contato') return true;
      return a.severidade === 'atencao' && a.tipo !== 'ritmo_dia';
    }
    return a.tipo === 'queda_encerrada' || a.tipo === 'passados_sem_contato';
  });

  const sel = selecionar(filtrados, admin);
  for (const n of s.numeros) {
    if (!marcadores.numeros[n.canalId] && n.aprendendoAte && n.aprendendoAte > hojeSP) {
      marcadores.numeros[n.canalId] = { texto: `aprendendo até ${ddmmDia(n.aprendendoAte)}`, tom: 'mudo' };
    }
  }

  const rodape = s.demo
    ? 'Números de demonstração. “Normal” compara com o mesmo horário dos dias anteriores, sem contar dias em que um número caiu.'
    : 'Números reais do banco. “Normal” compara com o mesmo horário dos dias anteriores, sem contar dias em que um número caiu.';

  // o vazio só afirma o que FOI conferido (e nunca contradiz os números da tela)
  let vazio: LeituraV5['vazio'] = null;
  if (!sel.achados.length) {
    const ok: string[] = [];
    if (s.numeros.some((n) => n.trafego)) ok.push('números recebendo mensagens');
    if (s.ia.ok60 > 0) ok.push('IA respondendo');
    if (avaliouEquipe) ok.push('equipe no tempo de sempre');
    let motivo: string;
    if (modo === 'hoje') {
      const b = s.total.normalAteAgora;
      const r = b != null && b > 0 ? s.total.hoje / b : null;
      // o comparativo só entra dentro da faixa do normal (fora dela e sem cartão de ritmo — de
      // manhã ou com normal < 30 — ele contradiria o "dentro do normal")
      const ritmoTxt = r != null && r >= L.ritmo.baixo && r <= L.ritmo.alto
        ? `${qtd(s.total.hoje, 'entrada', 'entradas')} até ${hhmm(ag)} (o normal até este horário é ${aprox(b!)})` : '';
      if (ritmoTxt && ok.length) motivo = `${ritmoTxt}; ${lista(ok)}.`;
      else if (ritmoTxt) motivo = `${ritmoTxt}.`;
      else motivo = ok.length ? `${cap(lista(ok))}.` : 'Nada fora do comum agora.';
    } else if (modo === 'fechado') {
      motivo = 'Nenhuma queda de número no período.';
    } else {
      motivo = ok.length ? `Nenhuma queda de número no período; agora, ${lista(ok)}.` : 'Nenhuma queda de número no período.';
    }
    vazio = { titulo: 'Tudo dentro do normal', motivo };
  }

  return {
    titulo: modo === 'hoje' ? 'Leitura do dia' : preset === '3d' ? 'Leitura dos 3 dias' : 'Leitura do período',
    achados: sel.achados,
    visiveis: sel.visiveis,
    vazio,
    rodape,
    notas: notasDados(s, agora, modo, explicadas, admin, !!fech?.semFechado && sel.achados.some((a) => a.id === fech.a.id)),
    marcadores,
  };
}

/** Chave do alvo na página (atributo data-d5-alvo das linhas e cartões). */
export function chaveAlvoV5(a: AlvoV5): string {
  switch (a.bloco) {
    case 'numeros': return `numeros:${a.canalId}`;
    case 'atendentes': return a.usuarioId ? `atendentes:${a.usuarioId}` : 'atendentes';
    case 'motivos': return `motivos:${a.motivo}`;
    default: return `kpi:${a.kpi}`;
  }
}

export type { TipoAchadoV5 };
