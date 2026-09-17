/* ============================================================
   Sala SDR — MOTOR de estado fictício (Fase 1)
   ------------------------------------------------------------
   Gera leads, move-os pelas etapas com temporizadores e produz os
   eventos — o `tick()` da demo, portado. A CENA (SVG) é dirigida
   imperativamente a 60fps pelo `frame()`; o PAINEL/HUD/feed em React
   leem um snapshot que só muda a cada tick/comando (não por quadro),
   via `assinar()` + `snapshot()` (useSyncExternalStore).

   ⚠️ Fase 1 = mock. Nada de Supabase. Os limites de tempo vêm de
   CONFIG (config.ts). Na Fase 2, um produtor real emite o mesmo
   SalaState e a cena não percebe a diferença (ver tipos.ts).
   ============================================================ */
import { CONFIG, ATENDENTES, BOT } from './config';
import { Camada, ZONAS, BALCAO, FILA, PORTA, HALL, PASSAGEM, ESPERA_SAIDA, SR_GATE, K1, K2, K3, RET_GATE, RET_IN, DOC_GATE, KS, iso, VB, type NomeZona } from './cena';
import { lookCliente, bonecoSVG, type Look } from './boneco';
import type { EtapaLead, LeadView, SalaState } from './tipos';

/* ---- tipos internos do lead simulado ---- */
type EtapaInterna = 'chegando' | 'fila_bot' | 'no_bot' | 'abandono' | 'ligacao' | 'triado' | 'com_atendente' | 'documentacao' | 'assinatura' | 'remarketing' | 'concluido' | 'perdido' | 'nao_legivel';
type ZonaInterna = NomeZona | 'fila' | 'recepcao' | 'mesa' | 'saida' | null;
interface Msg { de: 'cliente' | 'bot' | 'atendente'; t: number; txt: string }
interface Ev { t: number; txt: string }
interface Lead {
  id: string; nome: string; g: 'f' | 'm'; look: Look; origem: 'anúncio' | 'remarketing'; cidade: string; telefone: string;
  etapa: EtapaInterna; passo: number; atd: string | null; msgs: Msg[]; chegouEm: number; semanaEntrada: number; semanaFim: number | null;
  motivo: string | null; botInicio: number | null; triadoEm: number | null; qualEm: number | null; primeiroAtdEm: number | null;
  nAtd: number; ligacoes: number; zona: ZonaInterna; assento: number | null; alvoZona: [number, number] | null; zonaEm: number;
  tentativas: number; proxRmk: number; vaiResponder: boolean; docsN: number; proxDoc: number; assIni: number; mudo: boolean;
  ultimaDe: 'cliente' | 'bot' | 'atendente'; ultimaEm: number; proxCliente: number; proxBot: number; fimEm: number | null;
  caminho: [number, number][]; pos: [number, number]; hist: Ev[]; pose: string;
  aoChegar?: (() => void) | null; sumiu?: boolean; abandonou?: boolean; alertaEm?: number; ligacaoAte?: number; parado?: boolean;
  docsIni?: number; semanasArrasto?: number; forcaAband?: boolean;
}
interface AtdSt { digitandoAte: number; digitandoLead: string | null; ligandoAte: number; ligandoLead: string | null; atual: string | null; msgs: number; primeiras: number[]; respostas: number[]; ligacoes: number; recuperados: number; qualificados: number; producao: number; perdidos: number; recebidos: number; maxEspera: number; msgsPorFatia: Record<number, number>; log: Ev[] }

export type Selecao = 'sala' | 'bot' | string;
export type AbaSdr = 'agora' | 'conversas' | 'atividade';

/* ---- constantes de texto (mock) ---- */
const NOMES: [string, 'f' | 'm'][] = [['Ana Ribeiro', 'f'], ['Carlos Mendes', 'm'], ['Ivone Souza', 'f'], ['Antônio Farias', 'm'], ['Marlene Costa', 'f'], ['José Pereira', 'm'], ['Terezinha Lopes', 'f'], ['Raimundo Alves', 'm'], ['Neusa Martins', 'f'], ['Osvaldo Nunes', 'm'], ['Cleusa Barbosa', 'f'], ['Valdir Rocha', 'm'], ['Lourdes Pinto', 'f'], ['Sebastião Reis', 'm'], ['Zilda Moraes', 'f'], ['Nilton Cardoso', 'm'], ['Dalva Fonseca', 'f'], ['Geraldo Lima', 'm'], ['Aparecida Dias', 'f'], ['Benedito Cruz', 'm'], ['Iracema Vale', 'f'], ['Ademir Prado', 'm'], ['Odete Castro', 'f'], ['Lauro Teixeira', 'm']];
const CIDADES = ['Porto Alegre', 'Canoas', 'Viamão', 'Gravataí', 'Alvorada', 'São Leopoldo', 'Novo Hamburgo', 'Cachoeirinha'];
const PERG_BOT = ['Oi! Aqui é o Matheo, da CAF. Vi que você veio pelo anúncio. Me diz seu nome completo?', 'Você é aposentado(a) ou pensionista do INSS?', 'Você percebeu no extrato algum desconto que não reconhece?', 'Isso vale verificar. Tem uns minutinhos pra uma pessoa da equipe conversar com você agora?'];
const PERG_CURTA = ['nome', 'aposentado ou pensionista', 'desconto no extrato', 'disponibilidade'];
const RESP_CLI: (string[] | null)[] = [null, ['Sim, sou aposentada', 'Aposentado desde 2019', 'Pensionista'], ['Tem uns descontos que eu não sei o que é', 'Tem sim, uns nomes de banco que eu não conheço', 'Acho que sim, o valor caiu'], ['Pode ser', 'Sim, agora dá', 'Pode chamar']];
const MSG_CLI_DEPOIS = ['Oi, tá aí?', 'Pode ligar sim', 'Como funciona isso?', 'Mando o extrato por aqui?', 'Ok, aguardo', 'Certo, obrigada', 'Tô esperando a ligação'];
const DOCS = ['RG (frente)', 'RG (verso)', 'Extrato do benefício (PDF)'];
const MSG_RMK = [(n: string) => `Oi, ${n.split(' ')[0]}! Aqui é o Matheo, da CAF. Vi que a gente não terminou nossa conversa. Ainda quer verificar os descontos do seu benefício?`, (n: string) => `${n.split(' ')[0]}, a verificação do extrato é gratuita e leva poucos minutos. Posso continuar de onde paramos?`, () => `Última mensagem, prometo: se quiser retomar a verificação, é só responder por aqui. Fico à disposição!`];
const MSG_ATD = [(n: string) => `Olá, ${n.split(' ')[0]}! Aqui é {A}, da equipe da CAF. Pra facilitar, posso te ligar agora?`, () => `Perfeito. Vou te explicar por telefone como fazemos a verificação, tudo bem?`, () => `Pode mandar o extrato por aqui mesmo, eu confiro com você.`, () => `Combinado. Qualquer dúvida é só chamar por aqui.`];
const MOTIVOS = ['não é do INSS', 'número inválido', 'já é cliente', 'menor de idade', 'fora do perfil', 'pediu pra não receber'];
const NOME_ZONA: Record<string, string> = { fila: 'na fila da recepção', recepcao: 'em triagem com o Matheo (IA)', sem_resposta: 'na área de sem resposta', espera: 'aguardando o atendente', mesa: 'na mesa do SDR', retorno: 'aguardando resposta do cliente', remarketing: 'na cadência de remarketing', documentacao: 'em documentação', assinatura: 'em assinatura', nao_legivel: 'marcado como não-trabalhável', saida: 'saindo' };

/* ---- helpers numéricos ---- */
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const ri = (a: number, b: number) => Math.floor(rnd(a, b + 1));
const pick = <T,>(arr: T[]): T => arr[ri(0, arr.length - 1)];
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(Math.floor(m % 60)).padStart(2, '0')}`;
const media = (arr: number[]) => (arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null);
const mediana = (arr: number[]) => { if (!arr.length) return null; const s = [...arr].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2); };
const pct = (a: number, b: number) => (b ? Math.round((100 * a) / b) : null);
const fatia = (t: number) => Math.floor(t / 10) * 10;

const FECHADOS: EtapaInterna[] = ['concluido', 'perdido', 'nao_legivel'];
const T0 = CONFIG.turno.relogioInicio;

/* ---- projeção etapa interna → EtapaLead (contrato Fase 2) ---- */
const ETAPA_VIEW: Record<EtapaInterna, EtapaLead> = { chegando: 'chegando', fila_bot: 'chegando', no_bot: 'triagem', abandono: 'sem_resposta', ligacao: 'em_ligacao', triado: 'na_mesa', com_atendente: 'na_mesa', documentacao: 'documentacao', assinatura: 'assinatura', remarketing: 'remarketing', concluido: 'caso_aberto', perdido: 'perdido', nao_legivel: 'nao_legivel' };

/* ============================================================
   Snapshot que o React consome (imutável por versão)
   ============================================================ */
export interface ChipHud { valor: number; texto: string; tom: 'neutro' | 'ativo' | 'triagem' | 'rubro' | 'ok' }
export interface FeedItem { hora: string; texto: string; destaque: boolean }
export interface SemanaOpt { w: number; rotulo: string; ativa: boolean; pend: number }
export interface KpiView { n: string; small?: string; label: string; tom?: 'ok' | 'alerta' }
export interface FunilLinha { rotulo: string; n: number; total: number; cls: 'ativo' | 'ok' | 'rubro' | 'triagem' | '' }
export interface ItemLista { id?: string; sel?: string; conv?: string; lead?: string; cor: string; nome: string; desc: string; lado?: string; ladoRubro?: boolean; ativo?: boolean }
export interface ConversaView { titulo: string; nome: string; telefone: string; cidade: string; look: Look; ficha: [string, string, boolean?][]; passos: boolean[]; msgs: { de: string; quem: string; hora: string; txt: string }[]; nMsgs: number; hist: { hora: string; txt: string }[] }
export interface PainelView {
  tipo: 'sala' | 'bot' | 'sdr';
  titulo: string; sub?: string; estado?: { txt: string; cor: string }; acento?: string; avatarLook?: Look | null; avatarBot?: boolean;
  kpis?: KpiView[]; kpisTres?: boolean;
  secoes?: { tipo: string; [k: string]: unknown }[];
  aba?: AbaSdr;
  conversa?: ConversaView | null;
}
/* ---- Dashboard (redesenho): agregado ESTÁVEL, sempre construído, independente da seleção ---- */
export interface RankingSdr { id: string; nome: string; cor: string; conversasAtivas: number; recebidos: number; qualificados: number; producao: number; primeiraMedia: number | null; respMediana: number | null; sla5: number | null; msgs: number; ligacoes: number; maxEspera: number; spark: number[] }
export interface MesaOcup { id: string; nome: string; estado: string; cor: string; desc: string }
export interface HistFaixa { faixa: string; n: number }
export interface SemanaSerie { w: number; rotulo: string; abertos: number; perdidos: number; naoTrab: number; pend: number; ativa: boolean }
export interface DashboardView {
  kpis: KpiView[];
  placar: { qualificados: number; docs: number; producao: number };
  funilDia: FunilLinha[];
  ondeAgora: FunilLinha[];
  leadsPorHora: { horas: string[]; anuncio: number[]; remarketing: number[]; total: number[]; agora: number };
  primeira: { media: number | null; mediana: number | null; sla5: number | null; histograma: HistFaixa[] };
  primeiraPorFatia: { fatia: string; valor: number }[];
  sdrs: RankingSdr[];
  botFunil: { rotulo: string; chegaram: number; abandono: number }[];
  bot: { triados: number; conclusao: number | null; abandonos: number; tempoMedio: number | null; tempos: number[]; msgs: number; rmkMsgs: number; rmkVoltas: number; naCadencia: number };
  remarketing: { naCadencia: number; rmkVoltas: number; rmkMsgs: number; porHora: number[] };
  motivosNE: FunilLinha[];
  encaminhados: FunilLinha[];
  semanasSerie: SemanaSerie[];
  mesas: MesaOcup[];
}

export interface Snapshot {
  versao: number;
  pausado: boolean; vel: number;
  relogio: string;
  semanas: SemanaOpt[];
  congelada: string | null; // label da semana congelada, ou null
  hud: ChipHud[];
  feed: FeedItem[];
  selecao: Selecao; convSel: string | null; aba: AbaSdr;
  painel: PainelView;
  resumo: DashboardView; // dashboard agregado (não depende da seleção — anti-piscar)
  assinouPulse: number;  // sobe a cada assinatura (flash/onda)
}

type Ouvinte = () => void;

export interface MotorSala {
  assinar(cb: Ouvinte): () => void;
  snapshot(): Snapshot;
  estadoSala(): SalaState; // projeção do contrato (Fase 2 bridge, saída)
  aplicarReal(estado: SalaState): void; // Fase 2.0: ingere a foto real (entrada)
  zoom(fator: number): void; // <1 aproxima, >1 afasta (centralizado)
  resetZoom(): void; // volta pra sala inteira
  exportarCsv(): string; // relatório do dia (categoria + motivo + números) — CSV p/ Excel
  pausar(): void;
  alternarVelocidade(): void;
  leadNovo(): void;
  virarSemana(): void;
  verSemana(w: number): void;
  selecionar(sel: Selecao, conv?: string | null, aba?: AbaSdr | null): void;
  selecionarLead(id: string): void;
  trocarAba(aba: AbaSdr): void;
  trocarConversa(id: string): void;
  voltarSala(): void;
  destruir(): void;
}

export function criarMotor(svg: SVGSVGElement, opts: { modoReal?: boolean } = {}): MotorSala {
  const modoReal = !!opts.modoReal; // Fase 2.0: dirigido por dados reais (sem simulação)
  const cam = new Camada(svg);
  const reduz = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const S = {
    t: T0, vel: 1, pausado: false, leads: [] as Lead[], nomeIdx: 0, seq: 0, feed: [] as { t: number; txt: string; destaque?: boolean }[],
    hist: {} as Record<number, number>, selecao: 'sala' as Selecao, convSel: null as string | null, aba: 'agora' as AbaSdr,
    semana: 3, verSemana: 3,
    kpi: { chegaram: 0, triados: 0, qualificados: 0, producao: 0, docs: 0, perdidos: 0, naoLegivel: 0, abandonos: 0, primeiras: [] as number[], anuncio: 0, remarketing: 0,
      // acumuladores do dashboard (redesenho): leads/hora com split anúncio×rmk (índice = hora-8, 8..18) e média de 1ª resposta por fatia de 10 min
      porHora: { anuncio: Array(11).fill(0) as number[], remarketing: Array(11).fill(0) as number[] },
      primeirasPorFatia: {} as Record<number, number[]> },
    bot: { passo: [0, 0, 0, 0], abandPasso: [0, 0, 0, 0], tempos: [] as number[], msgs: 0, rmkMsgs: 0, rmkVoltas: 0, porAtd: { gi: 0, ju: 0, ma: 0 } as Record<string, number> },
  };
  const atd: Record<string, AtdSt> = {};
  for (const a of ATENDENTES) atd[a.id] = { digitandoAte: -1, digitandoLead: null, ligandoAte: -1, ligandoLead: null, atual: null, msgs: 0, primeiras: [], respostas: [], ligacoes: 0, recuperados: 0, qualificados: 0, producao: 0, perdidos: 0, recebidos: 0, maxEspera: 0, msgsPorFatia: {}, log: [] };
  const camera = { x: VB.x0, y: VB.y0, w: VB.w, h: VB.h, ax: VB.x0, ay: VB.y0, aw: VB.w, ah: VB.h };
  let zoomUsuario = false; // true quando o usuário controla a câmera (roda/arrastar) — seleção não a move
  const clientes: Record<string, { it: ReturnType<Camada['addItem']>; pose: string | null; telefone: boolean | null }> = {};
  let assinouPulse = 0; // sobe a cada assinatura → flash do KPI, realce do leaderboard e onda verde no videowall
  let ultAssinou = 0;   // último valor visto por renderCena (dispara o pulso na cena)
  let pulseTimer: ReturnType<typeof setTimeout> | undefined; // limpo em destruir()

  const nomeA = (id: string) => ATENDENTES.find((a) => a.id === id)!.nome;
  const atdDe = (id: string) => ATENDENTES.find((a) => a.id === id)!;
  const estaFechado = (L: Lead) => FECHADOS.includes(L.etapa);
  const visivelNaSemana = (L: Lead, sem: number) => (estaFechado(L) ? L.semanaFim === sem : sem === S.semana && L.semanaEntrada <= S.semana);
  const labelSemana = (sem: number) => (sem === S.semana ? 'Semana atual' : sem === S.semana - 1 ? 'Semana passada' : `${S.semana - sem} semanas atrás`);

  function evento(txt: string, destaque = false) { S.feed.unshift({ t: S.t, txt, destaque }); S.feed = S.feed.slice(0, 3); }
  function logA(id: string, txt: string) { const st = atd[id]; st.log.unshift({ t: S.t, txt }); st.log = st.log.slice(0, 10); }

  /* ---------- criação e movimento ---------- */
  function irPara(L: Lead, waypoints: [number, number][], aoChegar?: (() => void) | null) {
    L.caminho = waypoints.map((w, i) => {
      const ult = i === waypoints.length - 1;
      if (!ult) return [w[0] + rnd(-0.22, 0.22), w[1] + rnd(-0.22, 0.22)] as [number, number];
      if (w[0] < 0.5) return [w[0], w[1] + rnd(-0.3, 0.3)] as [number, number];
      return [w[0], w[1]] as [number, number];
    });
    L.aoChegar = aoChegar ?? null;
  }
  function novoLead(origem: 'anúncio' | 'remarketing' = pick(['anúncio', 'anúncio', 'anúncio', 'remarketing'])): Lead {
    const [nome, g] = NOMES[S.nomeIdx++ % NOMES.length];
    const L: Lead = {
      id: 'L' + ++S.seq, nome, g, look: lookCliente(S.seq * 7919 + 13, g), origem, cidade: pick(CIDADES), telefone: `(51) 9${ri(6000, 9999)}-${String(ri(0, 9999)).padStart(4, '0')}`,
      etapa: 'chegando', passo: 0, atd: null, msgs: [], chegouEm: S.t, semanaEntrada: S.semana, semanaFim: null, motivo: null, botInicio: null, triadoEm: null, qualEm: null, primeiroAtdEm: null, nAtd: 0, ligacoes: 0, zona: null, assento: null, alvoZona: null, zonaEm: 0, tentativas: 0, proxRmk: 0, vaiResponder: false, docsN: 0, proxDoc: 0, assIni: 0, mudo: Math.random() < 0.1,
      ultimaDe: 'cliente', ultimaEm: S.t, proxCliente: 0, proxBot: 0, fimEm: null, caminho: [], pos: [PORTA[0], PORTA[1]], hist: [], pose: 'pe',
    };
    L.msgs.push({ de: 'cliente', t: S.t, txt: origem === 'remarketing' ? 'Recebi a mensagem de vocês, ainda dá pra ver isso?' : 'Oi, vi o anúncio sobre desconto no benefício' });
    L.hist.push({ t: S.t, txt: `Entrou pelo ${origem}` });
    S.leads.push(L); S.kpi.chegaram++; S.kpi[origem === 'anúncio' ? 'anuncio' : 'remarketing']++;
    const h = Math.floor(S.t / 60); S.hist[h] = (S.hist[h] || 0) + 1;
    const hb = Math.max(0, Math.min(10, h - 8)); S.kpi.porHora[origem === 'anúncio' ? 'anuncio' : 'remarketing'][hb]++;
    irPara(L, [HALL], () => { L.etapa = 'fila_bot'; });
    evento(`${nome} entrou pelo ${origem}`);
    return L;
  }
  function atendenteMenosOcupado() {
    let best = ATENDENTES[0], n = 1e9;
    for (const a of ATENDENTES) { const c = S.leads.filter((l) => l.atd === a.id && ['com_atendente', 'ligacao', 'triado'].includes(l.etapa)).length; if (c < n) { n = c; best = a; } }
    return best;
  }

  /* ---------- zonas e rotas ---------- */
  const ZONAS_ATEND: ZonaInterna[] = ['espera', 'mesa', 'retorno'];
  function zonaDesejada(L: Lead): ZonaInterna {
    if (L.etapa === 'chegando' || L.etapa === 'fila_bot') return 'fila';
    if (L.etapa === 'no_bot') return 'recepcao';
    if (L.etapa === 'abandono') return 'sem_resposta';
    // EM ATENDIMENTO com um SDR: o cliente SENTA e FICA. O estado (nós devemos responder /
    // cliente deve responder / sem resposta) é mostrado pela COR DO ANEL e pela etiqueta —
    // NÃO por relocação. Só levanta da cadeira quando muda de etapa DE VERDADE (documentação,
    // assinatura, remarketing, sem resposta há 10+ min, ou saída). Isso mata o vai-e-vem.
    if (L.etapa === 'ligacao' || L.etapa === 'triado' || L.etapa === 'com_atendente') {
      // cliente sumiu de verdade (10+ min sem retorno, bola com ele) → área rubra (evento raro)
      if (L.ultimaDe === 'atendente' && S.t - L.ultimaEm >= CONFIG.mesa.clienteViraSemRespostaMin) return 'sem_resposta';
      // voltou a responder depois de ficar sem resposta → volta a sentar no atendimento
      if (L.zona === 'sem_resposta' && L.ultimaDe === 'cliente') return 'espera';
      // já sentado numa cadeira de atendimento → PERMANECE (sem teletransporte por mensagem)
      if (L.zona && ZONAS_ATEND.includes(L.zona)) return L.zona;
      if (L.zona === 'sem_resposta') return L.zona;
      return 'espera'; // 1ª colocação: senta na área de atendimento
    }
    if (L.etapa === 'documentacao') return 'documentacao';
    if (L.etapa === 'assinatura') return 'assinatura';
    if (L.etapa === 'remarketing') return 'remarketing';
    if (L.etapa === 'nao_legivel') return 'nao_legivel';
    // PERDIDO: vai pra SALINHA SEPARADA (fora do quadrado, à esquerda) e fica lá.
    if (L.etapa === 'perdido') return 'perdidos';
    // GANHO (caso aberto): some no lugar por fade (não atravessa a sala).
    if (L.etapa === 'concluido') return L.zona ?? 'saida';
    return 'saida';
  }
  function pegarLugar(zona: NomeZona) {
    const Z = ZONAS[zona]; const occ = new Set(S.leads.filter((l) => l.zona === zona && l.assento !== null && !l.sumiu).map((l) => l.assento));
    for (let i = 0; i < Z.assentos.length; i++) if (!occ.has(i)) return { assento: i, pos: Z.assentos[i] };
    for (let i = 0; i < Z.emPe.length; i++) if (!occ.has(100 + i)) return { assento: 100 + i, pos: Z.emPe[i] };
    return { assento: 100 + Z.emPe.length, pos: Z.emPe[Z.emPe.length - 1] };
  }
  function saidaDe(L: Lead): { pts: [number, number][]; no: number } {
    const z = L.zona;
    if (z === 'espera') return { pts: [ESPERA_SAIDA, PASSAGEM, K1], no: 1 };
    if (z === 'sem_resposta') return { pts: [SR_GATE, PASSAGEM, K1], no: 1 };
    if (z === 'mesa' && L.atd) { const a = atdDe(L.atd), v = a.visita; return a.id === 'ju' ? { pts: [[v[0], v[1] + 1.3], [18.5, 6.5], K3], no: 3 } : a.id === 'gi' ? { pts: [[v[0], v[1] + 1.3], [13.5, 6.5], K2], no: 2 } : { pts: [[v[0], v[1] + 1.3], K2], no: 2 }; }
    if (z === 'retorno') return { pts: [RET_IN, RET_GATE, K3], no: 3 };
    if (z === 'remarketing') return { pts: [[5.0, 17.0], ESPERA_SAIDA, K1], no: 1 };
    if (z === 'assinatura') return { pts: [[20.0, 14.0], K3], no: 3 };
    if (z === 'documentacao') return { pts: [DOC_GATE, K3], no: 3 };
    if (z === 'nao_legivel') return { pts: [[3.0, 10.0], HALL, K1], no: 1 };
    return { pts: [[6.5, 7.0], PASSAGEM, K1], no: 1 };
  }
  function entradaEm(zona: ZonaInterna, L: Lead, alvo: [number, number] | null): { no: number; pts: [number, number][] } {
    if (zona === 'espera') return { no: 1, pts: [PASSAGEM, ESPERA_SAIDA, alvo!] };
    if (zona === 'sem_resposta') return { no: 1, pts: [PASSAGEM, SR_GATE, alvo!] };
    if (zona === 'mesa') { const a = atdDe(L.atd!), v = a.visita; return a.id === 'ju' ? { no: 3, pts: [[18.5, 6.5], [v[0], v[1] + 1.3], v] } : a.id === 'gi' ? { no: 2, pts: [[13.5, 6.5], [v[0], v[1] + 1.3], v] } : { no: 2, pts: [[v[0], v[1] + 1.3], v] }; }
    if (zona === 'retorno') return { no: 3, pts: [RET_GATE, RET_IN, alvo!] };
    if (zona === 'remarketing') return { no: 1, pts: [ESPERA_SAIDA, [5.0, 17.0], alvo!] };
    if (zona === 'assinatura') return { no: 3, pts: [[20.0, 14.0], alvo!] };
    if (zona === 'documentacao') return { no: 3, pts: [DOC_GATE, alvo!] };
    if (zona === 'nao_legivel') return { no: 1, pts: [HALL, [3.0, 10.0], alvo!] };
    return { no: 1, pts: [PASSAGEM, HALL, PORTA] };
  }
  function corredor(a: number, b: number): [number, number][] { const out: [number, number][] = []; if (a < b) for (let i = a + 1; i <= b; i++) out.push(KS[i]); else for (let i = a - 1; i >= b; i--) out.push(KS[i]); return out; }
  function rota(L: Lead, zonaNova: ZonaInterna, alvo: [number, number] | null): [number, number][] {
    const z = L.zona; const naRecepcao = z === 'recepcao' || z === 'fila' || z === null;
    if (naRecepcao && zonaNova === 'sem_resposta') return [alvo!];
    if (naRecepcao && zonaNova === 'saida') return [HALL, PORTA];
    if (z === 'sem_resposta' && zonaNova === 'saida') return [HALL, PORTA];
    if (z === 'espera' && zonaNova === 'saida') return [ESPERA_SAIDA, HALL, PORTA];
    const sd = saidaDe(L), en = entradaEm(zonaNova, L, alvo);
    let p = [...sd.pts];
    if (sd.no === en.no) p.pop(); else p = p.concat(corredor(sd.no, en.no));
    p = p.concat(en.pts);
    return p.filter((q, i) => i === 0 || q[0] !== p[i - 1][0] || q[1] !== p[i - 1][1]);
  }
  function transicionar(L: Lead, zonaNova: ZonaInterna) {
    let alvo: [number, number] | null = null; L.assento = null;
    if (zonaNova === 'mesa') alvo = atdDe(L.atd!).visita;
    else if (zonaNova && ZONAS[zonaNova as NomeZona]) { const lug = pegarLugar(zonaNova as NomeZona); alvo = lug.pos as [number, number]; L.assento = lug.assento; }
    let caminho: [number, number][];
    if (zonaNova === 'fila' || zonaNova === 'recepcao') caminho = L.zona === 'remarketing' ? [[5.0, 17.0], [3.0, 9.0]] : [];
    else if (zonaNova === 'perdidos') { if (alvo) L.pos = [alvo[0], alvo[1]]; caminho = []; } // aparece direto na salinha separada
    else caminho = rota(L, zonaNova, alvo);
    L.zona = zonaNova; L.alvoZona = alvo; L.zonaEm = S.t;
    if (caminho.length) irPara(L, caminho, zonaNova === 'saida' ? () => { L.sumiu = true; } : null);
  }
  function marcarFechado(L: Lead, etapa: EtapaInterna, extra?: string) { L.etapa = etapa; L.fimEm = S.t; L.semanaFim = S.semana; if (extra) L.motivo = extra; }
  function finalizar(L: Lead, como: 'perdido' | 'nao_legivel', txt: string) {
    if (L.atd && atd[L.atd].atual === L.id) atd[L.atd].atual = null;
    if (como === 'nao_legivel') { marcarFechado(L, 'nao_legivel', L.motivo || pick(MOTIVOS)); S.kpi.naoLegivel++; L.hist.push({ t: S.t, txt: `Marcado como não-trabalhável: ${L.motivo}` }); if (L.atd) logA(L.atd, `${L.nome}: não-trabalhável (${L.motivo})`); }
    else { marcarFechado(L, 'perdido'); S.kpi.perdidos++; if (L.atd) atd[L.atd].perdidos++; L.hist.push({ t: S.t, txt: 'Marcado como perdido' }); if (L.atd) logA(L.atd, `${L.nome} marcado como perdido`); }
    evento(txt); atualizarZonas(); if (S.convSel === L.id) S.convSel = null;
  }
  function atualizarZonas() {
    for (const L of S.leads) {
      if (L.sumiu) continue;
      if (L.etapa === 'chegando' && !L.caminho.length) { L.etapa = 'fila_bot'; L.zona = 'fila'; }
      const z = zonaDesejada(L);
      if (z !== L.zona) {
        if (z === 'sem_resposta' && L.etapa === 'com_atendente') { L.hist.push({ t: S.t, txt: `Cliente sem retorno há ${S.t - L.ultimaEm} min` }); if (L.atd) logA(L.atd, `${L.nome} está sem responder há ${S.t - L.ultimaEm} min`); }
        if (z === 'espera' && L.zona === 'sem_resposta' && L.etapa === 'com_atendente') L.hist.push({ t: S.t, txt: 'Cliente voltou a responder' });
        transicionar(L, z);
      }
    }
  }
  function virarSemana() {
    const abertos = S.leads.filter((l) => !estaFechado(l) && !l.sumiu);
    for (const L of S.leads) {
      if (estaFechado(L)) continue;
      L.semanasArrasto = (L.semanasArrasto || 0) + 1;
      L.hist.push({ t: S.t, txt: `Seguiu em aberto para a semana seguinte (${L.semanasArrasto + 1}ª semana)` });
      if (['chegando', 'fila_bot', 'no_bot'].includes(L.etapa)) { L.etapa = 'fila_bot'; L.zona = 'fila'; L.assento = null; L.alvoZona = null; L.caminho = []; L.aoChegar = null; }
      L.ultimaEm = Math.min(L.ultimaEm, S.t); L.ultimaEm = T0 - ri(1, 8);
      if (L.proxRmk) L.proxRmk = S.t + ri(2, 6); if (L.proxCliente) L.proxCliente = S.t + ri(2, 8); if (L.proxDoc) L.proxDoc = S.t + ri(1, 3); if (L.proxBot) L.proxBot = S.t + 1;
    }
    S.semana++; S.verSemana = S.semana; S.t = T0;
    evento(`Virou para a ${labelSemana(S.semana).toLowerCase()} · ${abertos.length} clientes seguiram em aberto`, true);
    atualizarZonas(); mudou();
  }

  /* ---------- o tick (1 minuto simulado) ---------- */
  function tick() {
    S.t++;
    const emFluxo = S.leads.filter((l) => l.etapa === 'no_bot');
    for (const L of S.leads.filter((l) => l.etapa === 'fila_bot')) {
      if (emFluxo.length < CONFIG.triagem.emParalelo) {
        L.etapa = 'no_bot'; emFluxo.push(L); if (!L.botInicio) L.botInicio = S.t; L.proxBot = S.t + 1;
        const volta = L.passo > 0;
        L.msgs.push({ de: 'bot', t: S.t, txt: volta ? 'Que bom que voltou! Continuando: ' + PERG_BOT[L.passo] : PERG_BOT[0] }); S.bot.msgs++;
        if (!volta) S.bot.passo[0]++; if (L.mudo) L.abandonou = true; L.ultimaDe = 'bot'; L.ultimaEm = S.t;
        L.hist.push({ t: S.t, txt: volta ? 'Matheo retomou a triagem' : 'Matheo iniciou a triagem' });
      }
    }
    for (const L of S.leads) {
      if (L.etapa === 'no_bot') {
        if (L.abandonou) {
          if (S.t - L.ultimaEm >= CONFIG.triagem.abandonoAposMin) { L.etapa = 'abandono'; S.kpi.abandonos++; S.bot.abandPasso[L.passo]++; L.alertaEm = S.t; const tAb = L.mudo && L.passo === 0 ? 'Não respondeu nenhuma mensagem' : `Parou de responder na pergunta ${L.passo + 1}`; L.hist.push({ t: S.t, txt: tAb + ' — alerta de lead quente' }); evento(`${L.nome} ${tAb.toLowerCase()} — alerta de lead quente`, true); }
          continue;
        }
        if (S.t >= L.proxBot) {
          if (L.ultimaDe === 'bot') {
            const r = L.passo === 0 ? L.nome : pick(RESP_CLI[L.passo]!);
            L.msgs.push({ de: 'cliente', t: S.t, txt: r }); L.ultimaDe = 'cliente'; L.ultimaEm = S.t; L.passo++;
            if (L.passo === 1 && Math.random() < 0.1) { L.motivo = 'não é do INSS'; L.msgs.push({ de: 'cliente', t: S.t, txt: 'Não, não sou aposentado nem pensionista' }); finalizar(L, 'nao_legivel', `${L.nome} não é do INSS — não-trabalhável`); }
            else if (L.passo >= PERG_BOT.length) {
              const a = atendenteMenosOcupado(); L.atd = a.id; L.etapa = 'triado'; L.triadoEm = S.t; S.kpi.triados++; atd[a.id].recebidos++; S.bot.porAtd[a.id]++; S.bot.tempos.push(S.t - L.botInicio!);
              L.msgs.push({ de: 'bot', t: S.t, txt: `Perfeito. Vou te passar pra ${a.nome}, da equipe, que continua com você por aqui.` }); S.bot.msgs++;
              L.hist.push({ t: S.t, txt: `Triagem concluída em ${S.t - L.botInicio!} min · encaminhado pra ${a.nome}` }); logA(a.id, `Recebeu ${L.nome} da recepção`);
              evento(`Matheo concluiu a triagem de ${L.nome} e encaminhou pra ${a.nome}`);
              L.etapa = 'com_atendente'; L.ultimaDe = 'cliente'; L.ultimaEm = S.t;
            } else { S.bot.passo[L.passo]++; L.proxBot = S.t + ri(1, 3); }
          } else {
            L.msgs.push({ de: 'bot', t: S.t, txt: PERG_BOT[L.passo] }); S.bot.msgs++; L.ultimaDe = 'bot'; L.ultimaEm = S.t;
            if ((!L.forcaAband && Math.random() < 0.07 && L.passo >= 1) || L.forcaAband) L.abandonou = true;
            L.proxBot = S.t + ri(1, 4);
          }
        }
      }
      if (L.etapa === 'abandono' && S.t - L.alertaEm! >= CONFIG.alerta.entraRemarketingAposMin) {
        L.etapa = 'remarketing'; L.tentativas = 0; L.vaiResponder = false; L.proxRmk = S.t + ri(2, 5);
        L.hist.push({ t: S.t, txt: 'Entrou na cadência de remarketing do Matheo' });
      } else if (L.etapa === 'abandono' && S.t - L.alertaEm! >= CONFIG.alerta.assumirAposMin) {
        const a = atendenteMenosOcupado(); const st = atd[a.id];
        if (st.ligandoAte < S.t && !st.digitandoLead && Math.random() < 0.3) {
          L.atd = a.id; L.etapa = 'ligacao'; st.ligandoAte = S.t + ri(4, 7); st.ligandoLead = L.id; st.ligacoes++; L.ligacoes++; L.ligacaoAte = st.ligandoAte;
          L.msgs.push({ de: 'atendente', t: S.t, txt: `Olá! Aqui é ${a.nome}, da equipe da CAF. Para facilitar, vou te ligar agora mesmo e conversamos melhor por telefone, tudo bem?` }); st.msgs++;
          L.hist.push({ t: S.t, txt: `${a.nome} assumiu o alerta e ligou` }); logA(a.id, `Assumiu o alerta de ${L.nome} e ligou`);
          evento(`${a.nome} assumiu ${L.nome} e está ligando`, true); st.atual = L.id;
        }
      }
      if (L.etapa === 'ligacao' && S.t >= L.ligacaoAte!) {
        const st = atd[L.atd!]; st.ligandoLead = null;
        if (Math.random() < 0.65) { L.mudo = false; L.etapa = 'com_atendente'; L.ultimaDe = 'atendente'; L.ultimaEm = S.t; L.proxCliente = S.t + ri(2, 6); L.passo = PERG_BOT.length; L.triadoEm = S.t; L.nAtd = 1; L.primeiroAtdEm = S.t; S.kpi.triados++; st.recebidos++; st.recuperados++; L.hist.push({ t: S.t, txt: 'Recuperado por telefone' }); logA(L.atd!, `Recuperou ${L.nome} por telefone`); evento(`${nomeA(L.atd!)} recuperou ${L.nome} por telefone`); }
        else finalizar(L, 'perdido', `${L.nome} não atendeu à ligação — marcado como perdido`);
      }
      if (L.etapa === 'com_atendente') {
        const st = atd[L.atd!];
        if (L.ultimaDe === 'cliente') {
          const espera = S.t - L.ultimaEm; st.maxEspera = Math.max(st.maxEspera, espera);
          if (espera >= CONFIG.mesa.alertaSemRespostaMin && !L.parado) { L.parado = true; L.hist.push({ t: S.t, txt: '10 min sem resposta da equipe' }); logA(L.atd!, `${L.nome} ficou 10 min sem resposta`); evento(`${L.nome} está há 10 min sem resposta — mesa de ${nomeA(L.atd!)}`, true); }
          if (st.digitandoAte < S.t && st.ligandoAte < S.t && !st.digitandoLead && Math.random() < (espera > 4 ? 0.85 : 0.55)) { st.digitandoAte = S.t + ri(1, 2); st.digitandoLead = L.id; if (st.atual !== L.id) { st.atual = L.id; L.hist.push({ t: S.t, txt: `Chamado à mesa de ${nomeA(L.atd!)}` }); } }
          if (st.digitandoLead === L.id && S.t >= st.digitandoAte) {
            st.digitandoLead = null;
            const n = Math.min(L.nAtd, MSG_ATD.length - 1);
            L.msgs.push({ de: 'atendente', t: S.t, txt: MSG_ATD[n](L.nome).replace('{A}', nomeA(L.atd!)) }); L.nAtd++;
            st.msgs++; const f = fatia(S.t); st.msgsPorFatia[f] = (st.msgsPorFatia[f] || 0) + 1; st.respostas.push(espera);
            if (L.nAtd === 1) { const r = S.t - L.triadoEm!; st.primeiras.push(r); S.kpi.primeiras.push(r); const fz = fatia(S.t); if (!S.kpi.primeirasPorFatia[fz]) S.kpi.primeirasPorFatia[fz] = []; S.kpi.primeirasPorFatia[fz].push(r); L.primeiroAtdEm = S.t; L.hist.push({ t: S.t, txt: `1ª resposta de ${nomeA(L.atd!)} em ${r} min` }); }
            if (L.nAtd === 2 && !L.qualEm) { L.qualEm = S.t; st.qualificados++; S.kpi.qualificados++; L.hist.push({ t: S.t, txt: `Qualificado por ${nomeA(L.atd!)}` }); logA(L.atd!, `Qualificou ${L.nome}`); }
            L.parado = false; L.ultimaDe = 'atendente'; L.ultimaEm = S.t; L.proxCliente = S.t + ri(2, 14);
          }
        } else {
          if (st.atual === L.id && !st.digitandoLead && S.t - L.ultimaEm >= 3) st.atual = null;
          if (S.t - L.ultimaEm >= CONFIG.mesa.clienteDesisteAposMin) {
            if (st.atual === L.id) st.atual = null;
            L.etapa = 'remarketing'; L.tentativas = 0; L.vaiResponder = false; L.proxRmk = S.t + ri(2, 5);
            L.hist.push({ t: S.t, txt: 'Sem retorno do cliente · entrou no remarketing' }); logA(L.atd!, `${L.nome} entrou no remarketing por falta de retorno`);
          } else if (S.t >= L.proxCliente) {
            const r = Math.random(), n = L.nAtd;
            if (n >= 3 && r < 0.6) { L.etapa = 'documentacao'; L.docsIni = S.t; L.docsN = 0; L.proxDoc = S.t + ri(1, 3); S.kpi.docs++; if (st.atual === L.id) st.atual = null; L.hist.push({ t: S.t, txt: 'Começou o envio de documentos' }); logA(L.atd!, `${L.nome} começou a enviar documentos`); evento(`${L.nome} está enviando os documentos`); }
            else if (n >= 3 && r < 0.75) finalizar(L, 'perdido', `${L.nome} desistiu — marcado como perdido`);
            else if (n === 2 && r < 0.12) finalizar(L, 'perdido', `${L.nome} parou de responder — marcado como perdido`);
            else { L.msgs.push({ de: 'cliente', t: S.t, txt: pick(MSG_CLI_DEPOIS) }); L.ultimaDe = 'cliente'; L.ultimaEm = S.t; }
          }
        }
      }
      if (L.etapa === 'remarketing') {
        if (L.vaiResponder && S.t >= L.proxRmk) {
          L.vaiResponder = false; L.mudo = false;
          L.msgs.push({ de: 'cliente', t: S.t, txt: pick(['Oi, desculpa a demora', 'Ainda dá pra ver isso?', 'Pode continuar sim']) });
          S.bot.rmkVoltas++; L.hist.push({ t: S.t, txt: 'Respondeu ao remarketing · voltou pro fluxo' });
          evento(`${L.nome} respondeu ao remarketing e voltou pro fluxo`, true);
          L.ultimaDe = 'cliente'; L.ultimaEm = S.t; L.etapa = L.atd ? 'com_atendente' : 'fila_bot';
        } else if (!L.vaiResponder && S.t >= L.proxRmk) {
          if (L.tentativas >= CONFIG.remarketing.tentativas) { if (Math.random() < 0.25) { L.motivo = pick(['sem contato após 3 tentativas', 'pediu pra não receber']); finalizar(L, 'nao_legivel', `${L.nome} sem retorno no remarketing — marcado como não-trabalhável`); } else finalizar(L, 'perdido', `${L.nome} não respondeu ao remarketing — marcado como perdido`); }
          else {
            L.tentativas++; L.msgs.push({ de: 'bot', t: S.t, txt: MSG_RMK[Math.min(L.tentativas - 1, 2)](L.nome) }); S.bot.rmkMsgs++;
            L.hist.push({ t: S.t, txt: `Remarketing ${L.tentativas}/3 enviado pelo Matheo` });
            if (Math.random() < 0.38) { L.vaiResponder = true; L.proxRmk = S.t + ri(2, 5); } else L.proxRmk = S.t + ri(7, 12);
          }
        }
      }
      if (L.etapa === 'documentacao' && S.t >= L.proxDoc) {
        L.msgs.push({ de: 'cliente', t: S.t, txt: `Enviou: ${DOCS[Math.min(L.docsN, 2)]}` }); L.docsN++; L.ultimaDe = 'cliente'; L.ultimaEm = S.t; L.proxDoc = S.t + ri(2, 4);
        if (L.docsN >= CONFIG.documentacao.total) { L.etapa = 'assinatura'; L.assIni = S.t + ri(3, 6); L.hist.push({ t: S.t, txt: 'Documentos completos · foi pra assinatura' }); evento(`${L.nome} completou os documentos — foi pra assinatura`); }
      }
      if (L.etapa === 'assinatura' && S.t >= L.assIni) {
        marcarFechado(L, 'concluido'); S.kpi.producao++; assinouPulse++; if (L.atd) atd[L.atd].producao++;
        L.hist.push({ t: S.t, txt: 'Assinou a procuração e o contrato · caso aberto' });
        if (L.atd) logA(L.atd, `${L.nome} assinou · caso aberto`);
        evento(`${L.nome} assinou a procuração — caso aberto`, true);
        if (S.convSel === L.id) S.convSel = null;
      }
    }
    { const abertos = S.leads.filter((l) => !estaFechado(l) && !l.sumiu).length; if (abertos < 14 && Math.random() < (abertos < 8 ? 0.14 : 0.05)) novoLead(); }
    atualizarZonas();
    // Retira só o que SAIU pela porta e as conclusões DESTA semana que já descansaram
    // (evita acúmulo no chão da semana atual). O histórico de semanas anteriores NUNCA é
    // removido — é o que mantém o seletor de semanas navegável ("nunca esvazia sozinha").
    S.leads = S.leads.filter((l) => {
      if (l.sumiu) return false;
      if (l.fimEm && l.semanaFim === S.semana) { const desc = l.etapa === 'concluido' ? CONFIG.descansoGanhoMin : CONFIG.descansoFechadoMin; if (S.t - l.fimEm > desc) return false; }
      return true;
    });
    mudou();
  }

  /* ---------- cena por quadro (60fps; NÃO notifica React) ---------- */
  const corEtapa = (L: Lead): string => {
    const z = L.zona;
    if (L.etapa === 'nao_legivel') return 'var(--sala-espera)';
    if (z === 'sem_resposta' || L.parado) return 'var(--sala-rubro)';
    if (z === 'documentacao' || z === 'assinatura' || L.etapa === 'concluido') return 'var(--sala-ok)';
    if (z === 'fila' || z === 'recepcao' || z === 'remarketing' || z === null) return 'var(--sala-triagem)';
    // em atendimento (sentado): azul = cliente aguarda nossa resposta; cinza = bola com o cliente
    if (z === 'mesa' || z === 'espera' || z === 'retorno') return L.ultimaDe === 'cliente' ? 'var(--sala-ativo)' : 'var(--sala-espera)';
    return 'var(--sala-espera)';
  };
  function posDesejada(L: Lead): [number, number] | null {
    if (L.caminho.length) return null;
    if (L.zona === 'fila') { const i = S.leads.filter((l) => l.zona === 'fila').indexOf(L); return FILA[Math.min(i, FILA.length - 1)]; }
    if (L.zona === 'recepcao') { const i = S.leads.filter((l) => l.zona === 'recepcao').indexOf(L); return BALCAO[Math.min(i, 1)]; }
    return L.alvoZona || null;
  }
  function badgeCliente(L: Lead): [string, string] | null {
    if (L.etapa === 'no_bot' && !L.abandonou) return [`pergunta ${Math.min(L.passo + 1, 4)}/4`, 'triagem'];
    if (L.zona === 'sem_resposta') return [L.mudo && L.passo === 0 ? 'nunca respondeu' : `sem resposta há ${Math.max(0, S.t - L.ultimaEm)} min`, 'rubro'];
    if (L.etapa === 'ligacao') return ['ao telefone', 'ativo'];
    // sentado em atendimento: etiqueta só quando notável (espera longa); senão o anel + nome bastam
    if (L.zona === 'espera' || L.zona === 'mesa' || L.zona === 'retorno') {
      if (L.ultimaDe === 'cliente') { const e = Math.max(0, S.t - L.ultimaEm); if (e >= 10) return [`sem resposta há ${e} min`, 'rubro']; if (e >= 4) return [`aguarda ${e} min`, 'ativo']; return null; }
      return null; // bola com o cliente
    }
    if (L.etapa === 'documentacao') return [`documentos ${Math.min(L.docsN, 3)}/3`, 'ok'];
    if (L.etapa === 'assinatura') return ['aguardando assinatura', 'ok'];
    if (L.etapa === 'remarketing') return [L.vaiResponder ? 'digitando…' : `remarketing ${L.tentativas}/3`, 'triagem'];
    if (L.etapa === 'concluido') return ['caso aberto', 'ok'];
    if (L.etapa === 'nao_legivel') return [L.motivo || 'não-trabalhável', 'ne'];
    if (L.etapa === 'perdido') return ['perdido', ''];
    return null;
  }
  function setBadge(g: Element, txt: string, classe: string) {
    const b = g.querySelector('.badge'); if (!b) return; b.setAttribute('class', 'badge ' + (classe || ''));
    if (!txt) { b.setAttribute('opacity', '0'); return; }
    b.setAttribute('opacity', '1'); (b.querySelector('text') as SVGTextElement).textContent = txt;
    const w = Math.max(44, txt.length * 6.4 + 16); const r = b.querySelector('rect') as SVGRectElement; r.setAttribute('x', String(-w / 2)); r.setAttribute('width', String(w));
  }
  function removerCliente(id: string) { const c = clientes[id]; if (!c) return; cam.removerItem(c.it); delete clientes[id]; }
  function frame(dt: number) {
    const visiveis = new Set(S.leads.filter((l) => !l.sumiu && visivelNaSemana(l, S.verSemana)).map((l) => l.id));
    for (const id of Object.keys(clientes)) if (!visiveis.has(id)) removerCliente(id);
    const congelada = S.verSemana !== S.semana;
    for (const L of S.leads) {
      if (!visiveis.has(L.id)) continue;
      if (congelada && !L.caminho.length && L.alvoZona) L.pos = [L.alvoZona[0], L.alvoZona[1]];
      const alvo = L.caminho.length ? L.caminho[0] : posDesejada(L);
      let movendo = false;
      if (alvo) {
        const dx = alvo[0] - L.pos[0], dy = alvo[1] - L.pos[1], d = Math.hypot(dx, dy);
        const passo = (2.3 * dt) / 1000 * (S.vel === 1 ? 1 : 1.8);
        if (d < passo) { L.pos = [alvo[0], alvo[1]]; if (L.caminho.length) { L.caminho.shift(); if (!L.caminho.length && L.aoChegar) { const f = L.aoChegar; L.aoChegar = null; f(); } } }
        else { L.pos[0] += (dx / d) * passo; L.pos[1] += (dy / d) * passo; movendo = true; }
      }
      let c = clientes[L.id];
      const Z = L.zona && ZONAS[L.zona as NomeZona];
      const sentado = !movendo && !L.caminho.length && (L.zona === 'mesa' || (!!Z && Z.sentado && L.assento !== null && L.assento < 100));
      const pose = sentado ? 'sentado' : 'pe';
      const telefone = sentado && !!(Z && Z.telefone);
      if (!c) {
        const it = cam.addItem(L.pos[0] + L.pos[1], '', { id: 'c-' + L.id, cls: 'cliente p', dyn: true, attrs: { 'data-id': L.id, tabindex: '0', role: 'button', 'aria-label': L.nome } });
        c = { it, pose: null, telefone: null }; clientes[L.id] = c;
        it.el.addEventListener('click', (e) => { e.stopPropagation(); selecionar(L.atd || 'bot', L.id); });
        it.el.addEventListener('keydown', (e) => { const ev = e as KeyboardEvent; if (ev.key !== 'Enter' && ev.key !== ' ') return; ev.preventDefault(); selecionar(L.atd || 'bot', L.id); });
      }
      if (c.pose !== pose || c.telefone !== telefone) {
        c.pose = pose; c.telefone = telefone;
        // etiqueta de nome (2 linhas: 1º nome em cima, sobrenome embaixo) — cada boneco é um cliente
        const partes = L.nome.split(' ');
        const n1 = partes[0], n2 = partes.slice(1).join(' ');
        const larg = Math.max(n1.length, n2.length) * 4.3 + 8;
        const nomeSVG = `<g class="nome-cli"><rect x="${(-larg / 2).toFixed(1)}" y="8" width="${larg.toFixed(1)}" height="${n2 ? 17 : 11}" rx="4"/><text x="0" y="15.4" text-anchor="middle">${n1}</text>${n2 ? `<text x="0" y="22.6" text-anchor="middle" class="l2">${n2}</text>` : ''}</g>`;
        c.it.el.innerHTML = `<ellipse class="anel" cx="0" cy="1" rx="14" ry="5.5" fill="none" stroke="var(--sala-espera)" stroke-width="1.6" opacity=".9"/>` + bonecoSVG(L.look, pose, { telefone }) + nomeSVG + `<g class="badge" transform="translate(0,-92)" opacity="0"><rect x="-34" y="-9" width="68" height="18" rx="9"/><text text-anchor="middle" y="4"></text></g>`;
      }
      const p = iso(L.pos[0], L.pos[1], 0);
      c.it.el.setAttribute('transform', `translate(${p.x.toFixed(1)},${p.y.toFixed(1)})`);
      c.it.el.classList.toggle('andando', movendo);
      c.it.depth = L.pos[0] + L.pos[1] + (sentado ? 0.01 : 0.05);
      (c.it.el.querySelector('.anel') as SVGElement).setAttribute('stroke', corEtapa(L));
      let b = badgeCliente(L);
      if (!estaFechado(L) && (L.semanasArrasto || 0) >= 1 && !b) b = [`${(L.semanasArrasto || 0) + 1}ª semana`, 'arrasto'];
      setBadge(c.it.el, b ? b[0] : '', b ? b[1] : '');
      // fechado (não congelado): desvanece no LUGAR (não anda até a porta). Quem assinou some rápido.
      let op = '1';
      if (estaFechado(L) && !congelada) {
        const desc = L.etapa === 'concluido' ? CONFIG.descansoGanhoMin : CONFIG.descansoFechadoMin;
        op = L.fimEm != null ? String(Math.max(0.1, 0.75 * (1 - (S.t - L.fimEm) / desc)).toFixed(2)) : '.65';
      }
      c.it.el.style.opacity = op;
    }
    cam.reordenar();
    const k = 1 - Math.pow(0.001, dt / 1000);
    camera.x += (camera.ax - camera.x) * k; camera.y += (camera.ay - camera.y) * k; camera.w += (camera.aw - camera.w) * k; camera.h += (camera.ah - camera.h) * k;
    svg.setAttribute('viewBox', `${camera.x.toFixed(1)} ${camera.y.toFixed(1)} ${camera.w.toFixed(1)} ${camera.h.toFixed(1)}`);
  }

  /* ---------- estado dos SDRs + cena (chamado a cada mudança) ---------- */
  function estadoAtendente(id: string): { k: string; txt: string; cor: string; n?: number; max?: number } {
    const st = atd[id];
    if (st.ligandoLead) return { k: 'ligando', txt: 'ligando', cor: 'var(--sala-ativo)' };
    if (st.digitandoLead) return { k: 'digitando', txt: 'respondendo', cor: 'var(--sala-ativo)' };
    const minhas = S.leads.filter((l) => l.atd === id && l.etapa === 'com_atendente');
    const esperando = minhas.filter((l) => l.ultimaDe === 'cliente');
    if (esperando.length) {
      const max = Math.max(...esperando.map((l) => S.t - l.ultimaEm));
      if (max >= 10) return { k: 'parado', txt: `há ${max} min`, cor: 'var(--sala-rubro)', n: esperando.length, max };
      return { k: 'pendente', txt: `${esperando.length} pra responder`, cor: 'var(--sala-ativo)', n: esperando.length, max };
    }
    if (minhas.length) return { k: 'aguardando', txt: '', cor: 'var(--sala-espera)' };
    return { k: 'livre', txt: '', cor: 'var(--sala-espera)' };
  }
  const ESTADO_TXT: Record<string, string | ((e: { txt: string }) => string)> = { livre: 'livre', digitando: 'respondendo agora', ligando: 'em ligação', pendente: (e) => e.txt, parado: (e) => `lead sem resposta ${e.txt}`, aguardando: 'aguardando o cliente' };
  const estadoTxt = (e: { k: string; txt: string }) => { const v = ESTADO_TXT[e.k]; return typeof v === 'function' ? v(e) : v; };

  function pulsarAssinatura() {
    const sels = ['#wall-borda', '#anel-assinatura', '.bloom-assina'];
    for (const sel of sels) cam.q(sel)?.classList.add('assinou');
    clearTimeout(pulseTimer);
    pulseTimer = setTimeout(() => { for (const sel of sels) cam.q(sel)?.classList.remove('assinou'); pulseTimer = undefined; }, 780);
  }
  function renderCena() {
    const congeladaC = S.verSemana !== S.semana;
    for (const a of ATENDENTES) {
      const g = cam.q('#p-' + a.id); if (!g) continue; const e = estadoAtendente(a.id);
      g.classList.toggle('digitando', e.k === 'digitando'); g.classList.toggle('ligando', e.k === 'ligando');
      setBadge(g, congeladaC ? '' : e.txt, e.k === 'parado' ? 'rubro' : '');
      cam.q('#mon-' + a.id)?.classList.toggle('digitando', !congeladaC && e.k === 'digitando');
      cam.q('#dot-' + a.id)?.setAttribute('fill', congeladaC ? 'var(--sala-espera)' : e.cor);
      cam.q('#occ-' + a.id)?.setAttribute('fill', congeladaC ? 'var(--sala-espera)' : e.cor); // LED de ocupação da baia
    }
    const gb = cam.q('#p-bot');
    if (gb) {
      const noBot = S.leads.filter((l) => l.etapa === 'no_bot' && !l.abandonou).length, ab = S.leads.filter((l) => l.etapa === 'abandono').length;
      gb.classList.toggle('digitando', !congeladaC && noBot > 0);
      setBadge(gb, congeladaC ? '' : ab ? `${ab} lead${ab > 1 ? 's' : ''} quente${ab > 1 ? 's' : ''}` : noBot ? `triando ${noBot}` : '', ab ? 'rubro' : 'triagem');
    }
    // pulso da assinatura (bloom + onda verde no videowall) — dispara quando producao sobe
    if (assinouPulse > ultAssinou) { ultAssinou = assinouPulse; if (!congeladaC) pulsarAssinatura(); }
    // realce de seleção
    let s = '';
    if (S.selecao !== 'sala') {
      const d = S.selecao === 'bot' ? { x: 1.2, y: 1.2, w: 5.0, f: 2.6 } : { ...atdDe(S.selecao).desk, w: 2, f: 1.4 };
      const c = iso(d.x + d.w / 2, d.y + 0.6);
      s = `<ellipse cx="${c.x}" cy="${c.y}" rx="${d.w * 40 + 50}" ry="${d.w * 14 + 40}" fill="rgba(255,255,255,.07)" filter="url(#blurG)"/><polygon points="${[iso(d.x - 0.6, d.y - 1.1), iso(d.x + d.w + 1.2, d.y - 1.1), iso(d.x + d.w + 1.2, d.y + d.f), iso(d.x - 0.6, d.y + d.f)].map((q) => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(' ')}" fill="none" stroke="rgba(255,255,255,.22)" stroke-dasharray="4 4"/>`;
    }
    const selEl = cam.q('#selecao'); if (selEl) selEl.innerHTML = s;

    // VIDEOWALL: 6 tiles (3×2) no plano y=0 preenchidos com números vivos
    const wtxt = (x: number, z: number, txt: string | number, size: number, fill: string, weight = '400', anchor = 'start') => { const p = iso(x, 0, z); return `<g transform="translate(${p.x},${p.y}) skewY(26.565)"><text x="0" y="0" font-size="${size}" font-weight="${weight}" fill="${fill}" letter-spacing=".02em" text-anchor="${anchor}">${txt}</text></g>`; };
    const wbar = (x: number, z: number, w: number, h: number, fill: string) => `<polygon points="${[iso(x, 0, z), iso(x + w, 0, z), iso(x + w, 0, z + h), iso(x, 0, z + h)].map((q) => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(' ')}" fill="${fill}"/>`;
    const corTv = (c: string) => (c === 'triagem' ? 'var(--sala-triagem)' : c === 'ativo' ? 'var(--sala-ativo)' : c === 'ok' ? 'var(--sala-ok)' : c === 'rubro' ? 'var(--sala-rubro)' : '#9ba1ab');
    let ch = '';
    // TL — relógio + estado
    ch += wtxt(10.7, 105, S.verSemana === S.semana ? hhmm(S.t) : labelSemana(S.verSemana), 11, '#eceff4', '600');
    ch += wtxt(10.7, 98, S.verSemana === S.semana ? 'AO VIVO · OPERAÇÃO CAF' : 'SEMANA CONGELADA', 3.6, 'rgba(var(--sala-ativo-rgb),.9)', '600');
    // TM — placar
    ([[S.kpi.chegaram, 'LEADS'], [S.kpi.qualificados, 'QUALIF.'], [S.kpi.producao, 'CASOS']] as [number, string][]).forEach(([v, l], i) => { const x = 13.2 + i * 0.9; ch += wtxt(x, 105, v, 9.5, '#eceff4', '600', 'middle') + wtxt(x, 98, l, 3.2, '#8a94a6', '400', 'middle'); });
    // TR — leads/hora
    ch += wtxt(15.85, 108, 'LEADS / HORA', 3.6, '#6f7a8d');
    const horas: number[] = []; for (let h = 8; h <= 18; h++) horas.push(S.hist[h] || 0);
    const hmax = Math.max(3, ...horas);
    horas.forEach((v, i) => { const x = 15.85 + i * 0.145; const hh = 2 + (v / hmax) * 12; ch += wbar(x, 86, 0.09, hh, i === Math.floor(S.t / 60) - 8 ? 'rgba(var(--sala-ativo-rgb),.9)' : 'rgba(var(--sala-ativo-rgb),.42)'); });
    // BL — funil do dia (dentro da col0: x 10.4–12.8)
    ch += wtxt(10.55, 77, 'FUNIL DO DIA', 3.6, '#6f7a8d');
    const fmax = Math.max(1, S.kpi.chegaram);
    ([['chegaram', S.kpi.chegaram, 'triagem'], ['triados', S.kpi.triados, 'triagem'], ['qualif.', S.kpi.qualificados, 'ativo'], ['docs', S.kpi.docs, 'ok'], ['assinou', S.kpi.producao, 'ok']] as [string, number, string][]).forEach(([l, v, c], i) => { const z = 71 - i * 4.2; ch += wtxt(10.55, z, l, 3.0, '#9ba1ab') + wbar(11.5, z - 0.5, (v / fmax) * 0.85, 2.3, corTv(c)) + wtxt(12.72, z, v, 3.2, '#eceff4', '600', 'end'); });
    // BM — ranking SDR (dentro da col1: x 12.8–15.2)
    ch += wtxt(12.95, 77, 'RANKING SDR', 3.6, '#6f7a8d');
    const rk = ATENDENTES.map((a) => ({ nome: a.nome, v: atd[a.id].producao, cor: a.acento })).sort((p, q) => q.v - p.v);
    const rmax = Math.max(1, ...rk.map((r) => r.v));
    rk.forEach((r, i) => { const z = 71 - i * 4.8; ch += wtxt(12.95, z, r.nome, 3.2, '#eceff4') + wbar(14.05, z - 0.5, (r.v / rmax) * 0.68, 2.6, r.cor) + wtxt(15.1, z, r.v, 3.2, r.cor, '600', 'end'); });
    // BR — SLA 1ª resposta ≤5min
    ch += wtxt(15.85, 77, '1ª RESP. ≤5MIN', 3.4, '#6f7a8d');
    const sla = pct(S.kpi.primeiras.filter((r) => r <= 5).length, S.kpi.primeiras.length);
    ch += wtxt(16.35, 65, sla === null ? '—' : sla + '%', 11, sla !== null && sla < 50 ? 'var(--sala-rubro)' : 'var(--sala-ok)', '600', 'middle');
    ch += wbar(15.95, 57, ((sla || 0) / 100) * 1.5, 1.6, 'var(--sala-ok)') + wbar(15.95, 57, 1.5, 0.3, 'rgba(255,255,255,.06)');
    const chartEl = cam.q('#paredeChart'); if (chartEl) chartEl.innerHTML = ch;
  }

  /* ---------- câmera / seleção ---------- */
  function focar(sel: Selecao) {
    if (zoomUsuario) return; // usuário no controle manual — abrir/fechar detalhe não mexe o zoom
    if (sel === 'sala') { Object.assign(camera, { ax: VB.x0, ay: VB.y0, aw: VB.w, ah: VB.h }); if (reduz) Object.assign(camera, { x: VB.x0, y: VB.y0, w: VB.w, h: VB.h }); return; }
    const d = sel === 'bot' ? iso(4.0, 3.2, 30) : ((a) => iso(a.desk.x + 1.6, a.desk.y + 1.0, 30))(atdDe(sel));
    const w = sel === 'bot' ? 640 : 600, h = (w * VB.h) / VB.w;
    Object.assign(camera, { ax: d.x - w / 2, ay: d.y - h / 2, aw: w, ah: h });
    if (reduz) Object.assign(camera, { x: camera.ax, y: camera.ay, w: camera.aw, h: camera.ah });
  }
  function selecionar(sel: Selecao, conv: string | null = null, aba: AbaSdr | null = null) {
    S.selecao = sel; S.convSel = conv;
    if (aba) S.aba = aba; else if (conv) S.aba = 'conversas'; else if (sel !== 'sala' && sel !== 'bot') S.aba = 'agora';
    focar(sel); mudou();
  }

  /* ============================================================
     Construção do snapshot que o React lê (por versão)
     ============================================================ */
  const ETAPA_TXT = (L: Lead): string => {
    if (L.etapa === 'no_bot') return `em triagem com o Matheo (pergunta ${Math.min(L.passo + 1, 4)} de 4)`;
    if (L.etapa === 'abandono') return L.mudo && L.passo === 0 ? 'nunca respondeu — na área de sem resposta' : 'parou de responder — na área de sem resposta';
    if (L.etapa === 'remarketing') return `na cadência de remarketing (tentativa ${Math.max(L.tentativas, 1)} de 3)`;
    if (L.etapa === 'documentacao') return `em documentação (${Math.min(L.docsN, 3)} de 3 documentos)`;
    if (L.etapa === 'assinatura') return 'aguardando a assinatura da procuração e do contrato';
    if (L.etapa === 'concluido') return 'caso aberto';
    if (L.etapa === 'nao_legivel') return `não-trabalhável · ${L.motivo || ''}`;
    if (L.etapa === 'perdido') return 'perdido';
    if (L.zona === 'mesa') return `na mesa de ${nomeA(L.atd!)}${L.etapa === 'ligacao' ? ' (em ligação)' : ''}`;
    return `${NOME_ZONA[L.zona || 'chegando'] || 'chegando'}${L.atd && ['espera', 'retorno', 'sem_resposta'].includes(L.zona as string) ? ` · ${nomeA(L.atd)}` : ''}`;
  };
  const corLista = corEtapa;
  const fmt = (v: number | null) => (v === null ? '—' : String(v));

  function conversaView(L: Lead): ConversaView {
    const ult = L.msgs.slice(-8);
    const esp = L.ultimaDe === 'cliente' && ['com_atendente', 'no_bot', 'abandono'].includes(L.etapa) ? S.t - L.ultimaEm : null;
    const ficha: [string, string, boolean?][] = [['Origem', `${L.origem} · entrou ${hhmm(L.chegouEm)}`], ['Etapa', ETAPA_TXT(L)]];
    if (L.triadoEm) ficha.push(['Triagem', `concluída ${hhmm(L.triadoEm)}${L.botInicio ? ` · ${L.triadoEm - L.botInicio} min` : ''}`]);
    if (L.primeiroAtdEm) ficha.push(['1ª resposta', `${hhmm(L.primeiroAtdEm)} · ${L.primeiroAtdEm - L.triadoEm!} min depois`]);
    if (L.qualEm) ficha.push(['Qualificado', `${hhmm(L.qualEm)} por ${nomeA(L.atd!)}`]);
    if (L.motivo && L.etapa === 'nao_legivel') ficha.push(['Motivo', L.motivo, true]);
    ficha.push(['Semana', `entrou na ${labelSemana(L.semanaEntrada).toLowerCase()}${L.semanaFim ? ` · fechou na ${labelSemana(L.semanaFim).toLowerCase()}` : L.semanasArrasto ? ` · há ${(L.semanasArrasto || 0) + 1} semanas em aberto` : ''}`]);
    if (esp !== null) ficha.push(['Esperando', `${esp} min sem resposta`, esp >= 10]);
    return {
      titulo: L.id.replace('L', '#').replace('H', '#'), nome: L.nome, telefone: L.telefone, cidade: L.cidade, look: L.look, ficha,
      passos: PERG_BOT.map((_, i) => i < L.passo), nMsgs: L.msgs.length,
      msgs: ult.map((m) => ({ de: m.de, quem: m.de === 'cliente' ? L.nome.split(' ')[0] : m.de === 'bot' ? 'Matheo' : nomeA(L.atd!), hora: hhmm(m.t), txt: m.txt })),
      hist: L.hist.map((x) => ({ hora: hhmm(x.t), txt: x.txt })),
    };
  }

  function construirPainel(): PainelView {
    const ativos = S.leads.filter((l) => !l.fimEm);
    const convLead = S.convSel ? S.leads.find((l) => l.id === S.convSel) : null;
    const conversa = convLead ? conversaView(convLead) : null;

    if (S.selecao === 'sala') {
      const fila = ativos.filter((l) => ['chegando', 'fila_bot'].includes(l.etapa)).length;
      const noBot = ativos.filter((l) => l.etapa === 'no_bot').length;
      const conv = ativos.filter((l) => ['com_atendente', 'ligacao', 'triado'].includes(l.etapa)).length;
      const pend = ativos.filter((l) => l.etapa === 'com_atendente' && l.ultimaDe === 'cliente').length;
      const parados = ativos.filter((l) => (l.etapa === 'com_atendente' && l.ultimaDe === 'cliente' && S.t - l.ultimaEm >= 10) || l.etapa === 'abandono').length;
      const tmr = media(S.kpi.primeiras), tmd = mediana(S.kpi.primeiras);
      const nz = (z: string) => S.leads.filter((l) => visivelNaSemana(l, S.verSemana) && l.zona === z).length;
      const totZona = Math.max(1, S.leads.filter((l) => visivelNaSemana(l, S.verSemana) && l.zona !== 'saida').length);
      const arr = S.leads.filter((l) => !estaFechado(l) && (l.semanasArrasto || 0) >= 1);
      const relNL = S.leads.filter((l) => l.etapa === 'nao_legivel' && (S.verSemana === S.semana || l.semanaFim === S.verSemana));
      const totNL = Math.max(1, relNL.length);
      const kpis: KpiView[] = [
        { n: String(S.kpi.chegaram), label: 'leads hoje' },
        { n: String(S.kpi.triados), label: 'triados pelo Matheo' },
        { n: String(fila + noBot), small: fila ? `${fila} na fila` : undefined, label: 'na recepção' },
        { n: String(conv), label: 'com os SDRs' },
        { n: String(pend), label: 'esperando resposta nossa' },
        { n: String(parados), label: 'há 10+ min sem resposta', tom: parados ? 'alerta' : undefined },
        { n: String(S.kpi.qualificados), label: 'qualificados pelos SDRs' },
        { n: String(S.kpi.producao), label: 'casos abertos (assinaram)', tom: 'ok' },
      ];
      const secoes: { tipo: string; [k: string]: unknown }[] = [
        { tipo: 'secao', titulo: '1ª resposta dos SDRs', dir: `média ${fmt(tmr)}${tmr === null ? '' : ' min'} · mediana ${fmt(tmd)}${tmd === null ? '' : ' min'}` },
        { tipo: 'secao', titulo: 'Onde estão agora', dir: labelSemana(S.verSemana) },
        { tipo: 'funil', linhas: [
          { rotulo: 'recepção · triagem IA', n: nz('fila') + nz('recepcao'), total: totZona, cls: 'triagem' },
          { rotulo: 'aguardando atendente', n: nz('espera'), total: totZona, cls: '' },
          { rotulo: 'nas mesas dos SDRs', n: nz('mesa'), total: totZona, cls: 'ativo' },
          { rotulo: 'aguardando cliente', n: nz('retorno'), total: totZona, cls: '' },
          { rotulo: 'sem resposta', n: nz('sem_resposta'), total: totZona, cls: 'rubro' },
          { rotulo: 'remarketing', n: nz('remarketing'), total: totZona, cls: 'triagem' },
          { rotulo: 'documentação + assinatura', n: nz('documentacao') + nz('assinatura'), total: totZona, cls: 'ok' },
          { rotulo: 'não-trabalháveis', n: nz('nao_legivel'), total: totZona, cls: '' },
        ] as FunilLinha[] },
      ];
      if (arr.length && S.verSemana === S.semana) {
        secoes.push({ tipo: 'secao', titulo: 'Arrasto de semanas anteriores', dir: String(arr.length) });
        secoes.push({ tipo: 'lista', itens: arr.slice(0, 6).map((l): ItemLista => ({ lead: l.id, cor: corLista(l), nome: l.nome, desc: ETAPA_TXT(l), lado: `${(l.semanasArrasto || 0) + 1}ª sem`, ladoRubro: false })) });
      }
      secoes.push({ tipo: 'secao', titulo: 'Não-trabalháveis', dir: `${relNL.length} ${S.verSemana === S.semana ? 'no total' : 'nesta semana'}` });
      const motLinhas = MOTIVOS.concat(['sem contato após 3 tentativas', 'pediu pra não receber']).map((m): FunilLinha | null => { const n = relNL.filter((l) => l.motivo === m).length; return n ? { rotulo: m, n, total: totNL, cls: '' } : null; }).filter(Boolean) as FunilLinha[];
      secoes.push(motLinhas.length ? { tipo: 'funil', linhas: motLinhas } : { tipo: 'vazio', txt: 'Nenhum ainda.' });
      secoes.push({ tipo: 'secao', titulo: 'Funil do dia' });
      secoes.push({ tipo: 'funil', linhas: [
        { rotulo: 'entraram', n: S.kpi.chegaram, total: Math.max(1, S.kpi.chegaram), cls: 'triagem' },
        { rotulo: 'triados (Matheo)', n: S.kpi.triados, total: Math.max(1, S.kpi.chegaram), cls: 'triagem' },
        { rotulo: 'qualificados (SDR)', n: S.kpi.qualificados, total: Math.max(1, S.kpi.chegaram), cls: '' },
        { rotulo: 'chegaram à documentação', n: S.kpi.docs, total: Math.max(1, S.kpi.chegaram), cls: 'ok' },
        { rotulo: 'assinaram · caso aberto', n: S.kpi.producao, total: Math.max(1, S.kpi.chegaram), cls: 'ok' },
        { rotulo: 'perdidos', n: S.kpi.perdidos, total: Math.max(1, S.kpi.chegaram), cls: 'rubro' },
      ] as FunilLinha[] });
      secoes.push({ tipo: 'secao', titulo: 'Leads por hora', dir: `anúncio ${S.kpi.anuncio} · remarketing ${S.kpi.remarketing}` });
      secoes.push({ tipo: 'horas', horas: (() => { const hs: number[] = []; for (let h = 8; h <= 18; h++) hs.push(S.hist[h] || 0); return hs; })(), agora: Math.floor(S.t / 60) - 8 });
      secoes.push({ tipo: 'secao', titulo: 'Mesas' });
      const mesas: ItemLista[] = [{ sel: 'bot', cor: 'var(--sala-triagem)', nome: 'Matheo · recepção', desc: `${noBot ? `triando ${noBot}` : 'aguardando lead'}${S.kpi.abandonos ? ` · ${S.kpi.abandonos} abandono${S.kpi.abandonos > 1 ? 's' : ''} hoje` : ''}`, lado: `${S.kpi.triados} triados` }];
      for (const a of ATENDENTES) { const e = estadoAtendente(a.id); const n = ativos.filter((l) => l.atd === a.id && ['com_atendente', 'ligacao'].includes(l.etapa)).length; mesas.push({ sel: a.id, cor: e.cor, nome: `${a.nome} · SDR`, desc: `${estadoTxt(e)} · ${atd[a.id].producao} casos`, lado: `${n} conversa${n === 1 ? '' : 's'}`, ladoRubro: e.k === 'parado' }); }
      secoes.push({ tipo: 'lista', itens: mesas });
      return { tipo: 'sala', titulo: 'Sala SDR', sub: `${ATENDENTES.length} SDRs + Matheo na recepção · turno das 8h às 18h`, kpis, secoes };
    }

    if (S.selecao === 'bot') {
      const fluxo = ativos.filter((l) => ['fila_bot', 'no_bot', 'abandono', 'chegando', 'remarketing'].includes(l.etapa));
      const conclusao = pct(S.kpi.triados, S.kpi.triados + S.kpi.abandonos);
      const totalPasso = S.bot.passo[0];
      const kpis: KpiView[] = [
        { n: String(S.kpi.triados), label: 'triados hoje' },
        { n: fmt(conclusao), small: conclusao === null ? undefined : '%', label: 'concluem a triagem' },
        { n: String(S.kpi.abandonos), label: 'abandonaram no meio', tom: S.kpi.abandonos ? 'alerta' : undefined },
        { n: fmt(media(S.bot.tempos)), small: S.bot.tempos.length ? 'min' : undefined, label: 'tempo médio da triagem' },
        { n: String(S.bot.msgs), label: 'mensagens de triagem' },
        { n: String(S.bot.rmkMsgs), label: 'mensagens de remarketing' },
        { n: String(ativos.filter((l) => l.etapa === 'remarketing').length), label: 'na cadência agora' },
        { n: String(S.bot.rmkVoltas), label: 'trazidos de volta', tom: 'ok' },
      ];
      const secoes: { tipo: string; [k: string]: unknown }[] = [
        { tipo: 'secao', titulo: 'Onde os leads param', dir: 'quantos chegam a cada pergunta' },
        { tipo: 'funil', linhas: [...PERG_CURTA.map((p, i): FunilLinha => ({ rotulo: `${i + 1}. ${p}`, n: S.bot.passo[i], total: totalPasso, cls: 'triagem' })), { rotulo: 'triados', n: S.kpi.triados, total: totalPasso, cls: 'ok' }] },
        { tipo: 'secao', titulo: 'Encaminhados hoje' },
        { tipo: 'funil', linhas: ATENDENTES.map((a): FunilLinha => ({ rotulo: a.nome, n: S.bot.porAtd[a.id], total: S.kpi.triados, cls: '' })) },
        { tipo: 'secao', titulo: 'Na recepção agora' },
        { tipo: 'lista', itens: fluxo.length ? fluxo.map((l): ItemLista => ({ conv: l.id, cor: corLista(l), nome: l.nome, desc: l.etapa === 'fila_bot' || l.etapa === 'chegando' ? 'na fila' : l.etapa === 'abandono' ? (l.mudo && l.passo === 0 ? 'não respondeu nada — lead quente' : 'parou de responder — lead quente') : l.etapa === 'remarketing' ? `remarketing ${Math.max(l.tentativas, 1)}/3 · ${l.origem}` : `pergunta ${Math.min(l.passo + 1, PERG_BOT.length)} de ${PERG_BOT.length} · ${l.origem}`, lado: `${S.t - l.ultimaEm} min`, ladoRubro: l.etapa === 'abandono', ativo: S.convSel === l.id })) : [] },
      ];
      if (!fluxo.length) secoes.push({ tipo: 'vazio', txt: 'Ninguém na recepção neste momento.' });
      return { tipo: 'bot', titulo: BOT.nome, sub: 'recepção e triagem automática · canal oficial', acento: 'var(--sala-triagem)', avatarBot: true, estado: { txt: fluxo.length ? `atendendo ${fluxo.length} pessoa${fluxo.length > 1 ? 's' : ''} na recepção` : 'aguardando lead', cor: 'var(--sala-triagem)' }, kpis, secoes, conversa };
    }

    // SDR
    const a = atdDe(S.selecao); const st = atd[a.id]; const e = estadoAtendente(a.id);
    const minhas = ativos.filter((l) => l.atd === a.id && ['com_atendente', 'ligacao', 'triado', 'documentacao', 'assinatura'].includes(l.etapa));
    const esperando = minhas.filter((l) => l.etapa === 'com_atendente' && l.ultimaDe === 'cliente').sort((p, q) => p.ultimaEm - q.ultimaEm);
    const atual = st.atual ? S.leads.find((l) => l.id === st.atual) : null;
    const sla5 = pct(st.respostas.filter((r) => r <= 5).length, st.respostas.length);
    const fatias: number[] = []; for (let f = fatia(S.t) - 50; f <= fatia(S.t); f += 10) fatias.push(st.msgsPorFatia[f] || 0);
    const secoes: { tipo: string; [k: string]: unknown }[] = [];
    if (S.aba === 'agora') {
      const agoraTxt = e.k === 'ligando' && atual ? `Ligando para <b>${atual.nome}</b>` : e.k === 'digitando' && atual ? `Respondendo <b>${atual.nome}</b>${esperando.length > 1 ? ` · mais ${esperando.length - 1} na espera` : ''}` : esperando.length ? `<b>${esperando.length}</b> na sala de espera · o mais antigo há <b>${S.t - esperando[0].ultimaEm} min</b> (${esperando[0].nome.split(' ')[0]})` : minhas.length ? `Bola com o cliente em <b>${minhas.length}</b> conversa${minhas.length > 1 ? 's' : ''}` : 'Sem conversas ativas';
      secoes.push({ tipo: 'agora', alerta: e.k === 'parado', txt: agoraTxt });
      secoes.push({ tipo: 'kpisTres', kpis: [
        { n: String(minhas.length), label: 'conversas ativas' },
        { n: String(st.recebidos), label: 'recebidos da recepção' },
        { n: String(st.qualificados), label: 'qualificados' },
        { n: fmt(media(st.primeiras)), small: st.primeiras.length ? 'min' : undefined, label: '1ª resposta média' },
        { n: fmt(mediana(st.respostas)), small: st.respostas.length ? 'min' : undefined, label: 'resposta mediana' },
        { n: `${st.maxEspera}`, small: 'min', label: 'maior espera hoje', tom: st.maxEspera >= 10 ? 'alerta' : undefined },
        { n: String(st.msgs), label: 'mensagens enviadas' },
        { n: String(st.ligacoes), label: 'ligações feitas' },
        { n: String(st.producao), label: 'casos abertos', tom: 'ok' },
      ] as KpiView[] });
      secoes.push({ tipo: 'barra', titulo: 'Respostas em até 5 min', dir: `${fmt(sla5)}${sla5 === null ? '' : '%'}`, pct: sla5 || 0, cor: 'var(--sala-ativo)' });
      secoes.push({ tipo: 'barra', titulo: 'Qualificação', dir: `${fmt(pct(st.qualificados, st.recebidos))}${st.recebidos ? '% dos recebidos' : ''}`, pct: pct(st.qualificados, st.recebidos) || 0, cor: 'var(--sala-triagem)' });
      secoes.push({ tipo: 'barra', titulo: 'Conversão em caso', dir: `${fmt(pct(st.producao, st.recebidos))}${st.recebidos ? '% dos recebidos' : ''}`, pct: pct(st.producao, st.recebidos) || 0, cor: 'var(--sala-ok)' });
      secoes.push({ tipo: 'secao', titulo: 'Mensagens na última hora', dir: `por 10 min · ${st.perdidos} perdido${st.perdidos === 1 ? '' : 's'} hoje` });
      secoes.push({ tipo: 'horas', horas: fatias });
      if (st.recuperados) secoes.push({ tipo: 'secao', titulo: 'Recuperados por telefone', dir: String(st.recuperados) });
    } else if (S.aba === 'conversas') {
      secoes.push({ tipo: 'secao', titulo: 'Conversas ativas', dir: String(minhas.length) });
      secoes.push({ tipo: 'lista', itens: minhas.length ? minhas.map((l): ItemLista => { const esp = l.ultimaDe === 'cliente' ? S.t - l.ultimaEm : 0; const u = l.msgs[l.msgs.length - 1]; return { conv: l.id, cor: corLista(l), nome: l.nome, desc: l.etapa === 'ligacao' ? 'em ligação' : l.etapa === 'triado' ? 'chegando da recepção' : l.etapa === 'documentacao' ? `enviando documentos (${Math.min(l.docsN, 3)}/3)` : l.etapa === 'assinatura' ? 'assinando a procuração' : (u.de === 'cliente' ? 'cliente: ' : 'você: ') + u.txt, lado: l.ultimaDe === 'cliente' && l.etapa === 'com_atendente' ? `espera ${esp} min` : '', ladoRubro: esp >= 10, ativo: S.convSel === l.id }; }) : [] });
      if (!minhas.length) secoes.push({ tipo: 'vazio', txt: 'Sem conversas ativas. Os próximos leads triados caem aqui.' });
    } else {
      secoes.push({ tipo: 'secao', titulo: 'Últimos acontecimentos' });
      secoes.push({ tipo: 'log', itens: st.log.length ? st.log.map((x) => ({ hora: hhmm(x.t), txt: x.txt })) : null });
    }
    return { tipo: 'sdr', titulo: a.nome, sub: `SDR · online desde ${hhmm(a.entrou)}`, acento: a.acento, avatarLook: a.look as never, estado: { txt: estadoTxt(e), cor: e.cor }, aba: S.aba, secoes, conversa };
  }

  /* ---- Dashboard: agregado ESTÁVEL, sempre construído (não depende da seleção) ---- */
  function construirResumo(): DashboardView {
    const ativos = S.leads.filter((l) => !l.fimEm);
    const fila = ativos.filter((l) => ['chegando', 'fila_bot'].includes(l.etapa)).length;
    const noBot = ativos.filter((l) => l.etapa === 'no_bot').length;
    const conv = ativos.filter((l) => ['com_atendente', 'ligacao', 'triado'].includes(l.etapa)).length;
    const pend = ativos.filter((l) => l.etapa === 'com_atendente' && l.ultimaDe === 'cliente').length;
    const parados = ativos.filter((l) => (l.etapa === 'com_atendente' && l.ultimaDe === 'cliente' && S.t - l.ultimaEm >= 10) || l.etapa === 'abandono').length;
    const kpis: KpiView[] = [
      { n: String(S.kpi.chegaram), label: 'leads hoje' },
      { n: String(S.kpi.triados), label: 'triados' },
      { n: String(fila + noBot), small: fila ? `${fila} fila` : undefined, label: 'na recepção' },
      { n: String(conv), label: 'com os SDRs' },
      { n: String(pend), label: 'esperando nós' },
      { n: String(parados), label: '10+ min parado', tom: parados ? 'alerta' : undefined },
      { n: String(S.kpi.qualificados), label: 'qualificados' },
      { n: String(S.kpi.producao), label: 'casos abertos', tom: 'ok' },
    ];
    const tc = Math.max(1, S.kpi.chegaram);
    const funilDia: FunilLinha[] = [
      { rotulo: 'entraram', n: S.kpi.chegaram, total: tc, cls: 'triagem' },
      { rotulo: 'triados', n: S.kpi.triados, total: tc, cls: 'triagem' },
      { rotulo: 'qualificados', n: S.kpi.qualificados, total: tc, cls: 'ativo' },
      { rotulo: 'documentação', n: S.kpi.docs, total: tc, cls: 'ok' },
      { rotulo: 'assinaram', n: S.kpi.producao, total: tc, cls: 'ok' },
      { rotulo: 'perdidos', n: S.kpi.perdidos, total: tc, cls: 'rubro' },
    ];
    const nz = (z: string) => S.leads.filter((l) => visivelNaSemana(l, S.semana) && l.zona === z).length;
    const totZ = Math.max(1, S.leads.filter((l) => visivelNaSemana(l, S.semana) && l.zona !== 'saida').length);
    const emAt = (pred: (l: Lead) => boolean) => S.leads.filter((l) => visivelNaSemana(l, S.semana) && !l.fimEm && ['com_atendente', 'triado', 'ligacao'].includes(l.etapa) && pred(l)).length;
    const ondeAgora: FunilLinha[] = [
      { rotulo: 'recepção · triagem', n: nz('fila') + nz('recepcao'), total: totZ, cls: 'triagem' },
      { rotulo: 'aguardando SDR', n: emAt((l) => l.ultimaDe === 'cliente'), total: totZ, cls: 'ativo' },
      { rotulo: 'aguardando cliente', n: emAt((l) => l.ultimaDe === 'atendente'), total: totZ, cls: '' },
      { rotulo: 'sem resposta', n: nz('sem_resposta'), total: totZ, cls: 'rubro' },
      { rotulo: 'remarketing', n: nz('remarketing'), total: totZ, cls: 'triagem' },
      { rotulo: 'documentação', n: nz('documentacao'), total: totZ, cls: 'ok' },
      { rotulo: 'aguardando assinatura', n: nz('assinatura'), total: totZ, cls: 'ok' },
      { rotulo: 'não-trabalháveis', n: nz('nao_legivel'), total: totZ, cls: '' },
    ];
    const horas: string[] = []; for (let h = 8; h <= 18; h++) horas.push(`${h}h`);
    const anuncio = S.kpi.porHora.anuncio.slice(0, 11);
    const remark = S.kpi.porHora.remarketing.slice(0, 11);
    const total = anuncio.map((a, i) => a + (remark[i] || 0));
    const leadsPorHora = { horas, anuncio, remarketing: remark, total, agora: Math.floor(S.t / 60) - 8 };
    const pr = S.kpi.primeiras;
    const bucket = (lo: number, hi: number) => pr.filter((r) => r >= lo && r <= hi).length;
    const histograma: HistFaixa[] = [
      { faixa: '0–2', n: bucket(0, 2) }, { faixa: '3–5', n: bucket(3, 5) }, { faixa: '6–10', n: bucket(6, 10) }, { faixa: '11+', n: pr.filter((r) => r >= 11).length },
    ];
    const primeira = { media: media(pr), mediana: mediana(pr), sla5: pct(pr.filter((r) => r <= 5).length, pr.length), histograma };
    const fatKeys = Object.keys(S.kpi.primeirasPorFatia).map(Number).sort((a, b) => a - b).slice(-8);
    const primeiraPorFatia = fatKeys.map((f) => ({ fatia: hhmm(f), valor: media(S.kpi.primeirasPorFatia[f]) || 0 }));
    const sdrs: RankingSdr[] = ATENDENTES.map((a) => {
      const st = atd[a.id];
      const conversasAtivas = ativos.filter((l) => l.atd === a.id && ['com_atendente', 'ligacao'].includes(l.etapa)).length;
      const fs: number[] = []; for (let f = fatia(S.t) - 50; f <= fatia(S.t); f += 10) fs.push(st.msgsPorFatia[f] || 0);
      return { id: a.id, nome: a.nome, cor: a.acento, conversasAtivas, recebidos: st.recebidos, qualificados: st.qualificados, producao: st.producao, primeiraMedia: media(st.primeiras), respMediana: mediana(st.respostas), sla5: pct(st.respostas.filter((r) => r <= 5).length, st.respostas.length), msgs: st.msgs, ligacoes: st.ligacoes, maxEspera: st.maxEspera, spark: fs };
    }).sort((p, q) => q.producao - p.producao || q.qualificados - p.qualificados);
    const botFunil = PERG_CURTA.map((p, i) => ({ rotulo: `${i + 1}. ${p}`, chegaram: S.bot.passo[i], abandono: S.bot.abandPasso[i] }));
    const naCadencia = ativos.filter((l) => l.etapa === 'remarketing').length;
    const bot = { triados: S.kpi.triados, conclusao: pct(S.kpi.triados, S.kpi.triados + S.kpi.abandonos), abandonos: S.kpi.abandonos, tempoMedio: media(S.bot.tempos), tempos: S.bot.tempos.slice(-12), msgs: S.bot.msgs, rmkMsgs: S.bot.rmkMsgs, rmkVoltas: S.bot.rmkVoltas, naCadencia };
    const remarketing = { naCadencia, rmkVoltas: S.bot.rmkVoltas, rmkMsgs: S.bot.rmkMsgs, porHora: S.kpi.porHora.remarketing.slice(0, 11) };
    const relNE = S.leads.filter((l) => l.etapa === 'nao_legivel');
    const totNE = Math.max(1, relNE.length);
    const motivosNE: FunilLinha[] = MOTIVOS.concat(['sem contato após 3 tentativas', 'pediu pra não receber']).map((m) => ({ rotulo: m, n: relNE.filter((l) => l.motivo === m).length, total: totNE, cls: '' as const })).filter((x) => x.n > 0).sort((p, q) => q.n - p.n);
    const encaminhados: FunilLinha[] = ATENDENTES.map((a) => ({ rotulo: a.nome, n: S.bot.porAtd[a.id] || 0, total: Math.max(1, S.kpi.triados), cls: '' as const }));
    const semanasSerie: SemanaSerie[] = [];
    const de = Math.max(1, S.semana - 3);
    for (let w = de; w <= S.semana; w++) {
      const fechou = S.leads.filter((l) => l.semanaFim === w);
      const pendW = w === S.semana ? S.leads.filter((l) => !estaFechado(l) && l.semanaEntrada <= S.semana).length : 0;
      semanasSerie.push({ w, rotulo: w === S.semana ? 'Atual' : w === S.semana - 1 ? 'Passada' : `-${S.semana - w}`, abertos: fechou.filter((l) => l.etapa === 'concluido').length, perdidos: fechou.filter((l) => l.etapa === 'perdido').length, naoTrab: fechou.filter((l) => l.etapa === 'nao_legivel').length, pend: pendW, ativa: w === S.verSemana });
    }
    const mesas: MesaOcup[] = [];
    const noBotAtiv = ativos.filter((l) => l.etapa === 'no_bot' && !l.abandonou).length;
    const abn = ativos.filter((l) => l.etapa === 'abandono').length;
    mesas.push({ id: 'bot', nome: 'Matheo', estado: abn ? 'rubro' : noBotAtiv ? 'ativo' : 'livre', cor: abn ? 'var(--sala-rubro)' : 'var(--sala-triagem)', desc: abn ? `${abn} lead quente` : noBotAtiv ? `triando ${noBotAtiv}` : 'aguardando' });
    for (const a of ATENDENTES) { const e = estadoAtendente(a.id); mesas.push({ id: a.id, nome: a.nome, estado: e.k, cor: e.cor, desc: estadoTxt(e) }); }
    return { kpis, placar: { qualificados: S.kpi.qualificados, docs: S.kpi.docs, producao: S.kpi.producao }, funilDia, ondeAgora, leadsPorHora, primeira, primeiraPorFatia, sdrs, botFunil, bot, remarketing, motivosNE, encaminhados, semanasSerie, mesas };
  }

  function construirSnapshot(): Snapshot {
    const congelada = S.verSemana !== S.semana;
    const semanas: SemanaOpt[] = [];
    const pend = (() => { let n = 0; for (const L of S.leads) if (!estaFechado(L) && L.semanaEntrada <= S.semana) n++; return n; })();
    const de = Math.max(1, S.semana - 3);
    for (let w = de; w <= S.semana; w++) semanas.push({ w, rotulo: w === S.semana ? 'Atual' : w === S.semana - 1 ? 'Passada' : `-${S.semana - w}sem`, ativa: w === S.verSemana, pend: w === S.semana ? pend : 0 });
    // HUD
    let hud: ChipHud[];
    const nz = (z: string) => S.leads.filter((l) => visivelNaSemana(l, S.verSemana) && l.zona === z).length;
    if (congelada) {
      const fechou = S.leads.filter((l) => l.semanaFim === S.verSemana);
      hud = [
        { valor: fechou.filter((l) => l.etapa === 'concluido').length, texto: 'casos abertos', tom: 'ok' as never },
        { valor: fechou.filter((l) => l.etapa === 'perdido').length, texto: 'perdidos', tom: 'neutro' },
        { valor: fechou.filter((l) => l.etapa === 'nao_legivel').length, texto: 'não-trabalháveis', tom: 'neutro' },
      ] as ChipHud[];
    } else {
      const naSala = S.leads.filter((l) => visivelNaSemana(l, S.verSemana) && l.zona !== 'saida').length;
      const emAt = (pred: (l: Lead) => boolean) => S.leads.filter((l) => visivelNaSemana(l, S.verSemana) && !l.fimEm && ['com_atendente', 'triado', 'ligacao'].includes(l.etapa) && pred(l)).length;
      hud = [
        { valor: naSala, texto: 'na sala', tom: 'neutro' },
        { valor: emAt((l) => l.ultimaDe === 'cliente'), texto: 'aguardando SDR', tom: 'neutro' },
        { valor: emAt((l) => l.ultimaDe === 'atendente'), texto: 'aguardando cliente', tom: 'neutro' },
      ];
      if (nz('sem_resposta')) hud.push({ valor: nz('sem_resposta'), texto: 'sem resposta', tom: 'rubro' });
      if (nz('remarketing')) hud.push({ valor: nz('remarketing'), texto: 'remarketing', tom: 'triagem' });
      if (nz('documentacao')) hud.push({ valor: nz('documentacao'), texto: 'documentação', tom: 'ok' });
      if (nz('assinatura')) hud.push({ valor: nz('assinatura'), texto: 'aguardando assinatura', tom: 'ok' });
      if (nz('nao_legivel')) hud.push({ valor: nz('nao_legivel'), texto: 'não-trabalháveis', tom: 'neutro' });
      if (nz('perdidos')) hud.push({ valor: nz('perdidos'), texto: 'perdidos', tom: 'rubro' });
    }
    return {
      versao, pausado: S.pausado, vel: S.vel,
      relogio: S.verSemana === S.semana ? hhmm(S.t) : labelSemana(S.verSemana),
      semanas, congelada: congelada ? labelSemana(S.verSemana) : null,
      hud, feed: S.feed.map((e) => ({ hora: hhmm(e.t), texto: e.txt, destaque: !!e.destaque })),
      selecao: S.selecao, convSel: S.convSel, aba: S.aba,
      painel: construirPainel(),
      resumo: construirResumo(),
      assinouPulse,
    };
  }

  /* ---------- versão / notificação ---------- */
  let versao = 0;
  let snapAtual: Snapshot;
  const ouvintes = new Set<Ouvinte>();
  function mudou() { versao++; renderCena(); snapAtual = construirSnapshot(); ouvintes.forEach((cb) => cb()); }

  /* ---------- MODO REAL (Fase 2.0): ingerir a FOTO real e posicionar bonecos ----------
     Sem simulação: cada LeadView vira um Lead interno posicionado na zona da sua etapa.
     Reusa pegarLugar/geometria de ZONAS; sem movimento (o realtime das transições é a 2.1). */
  const VIEW_INTERNA: Record<EtapaLead, { etapa: EtapaInterna; zona: ZonaInterna }> = {
    chegando: { etapa: 'fila_bot', zona: 'fila' },
    triagem: { etapa: 'no_bot', zona: 'recepcao' },
    aguardando_atendente: { etapa: 'triado', zona: 'espera' },
    na_mesa: { etapa: 'com_atendente', zona: 'mesa' },
    em_ligacao: { etapa: 'ligacao', zona: 'mesa' },
    aguardando_cliente: { etapa: 'com_atendente', zona: 'retorno' },
    sem_resposta: { etapa: 'abandono', zona: 'sem_resposta' },
    remarketing: { etapa: 'remarketing', zona: 'remarketing' },
    documentacao: { etapa: 'documentacao', zona: 'documentacao' },
    assinatura: { etapa: 'assinatura', zona: 'assinatura' },
    caso_aberto: { etapa: 'concluido', zona: 'saida' },
    perdido: { etapa: 'perdido', zona: 'perdidos' },
    nao_legivel: { etapa: 'nao_legivel', zona: 'nao_legivel' },
  };
  const SENTADO_ZONA = new Set<ZonaInterna>(['espera', 'retorno', 'documentacao', 'assinatura', 'remarketing', 'nao_legivel', 'perdidos', 'mesa']);
  const hashId = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return Math.abs(h); };
  const guessG = (nome: string): 'f' | 'm' => (/a$/.test((nome || '').trim().split(' ')[0].toLowerCase()) ? 'f' : 'm');
  function posReal(L: Lead, zona: ZonaInterna): [number, number] {
    if (zona === 'mesa') { const a = L.atd ? ATENDENTES.find((x) => x.id === L.atd) : null; if (a) return [a.visita[0], a.visita[1]]; L.zona = zona = 'espera'; }
    if (zona === 'fila') { const i = S.leads.filter((l) => l.zona === 'fila').indexOf(L); return FILA[Math.min(Math.max(i, 0), FILA.length - 1)]; }
    if (zona === 'recepcao') { const i = S.leads.filter((l) => l.zona === 'recepcao').indexOf(L); return BALCAO[Math.min(Math.max(i, 0), 1)]; }
    if (zona === 'saida') return [PORTA[0], PORTA[1]];
    if (zona && ZONAS[zona as NomeZona]) { const lug = pegarLugar(zona as NomeZona); L.assento = lug.assento; return lug.pos as [number, number]; }
    return [ESPERA_SAIDA[0], ESPERA_SAIDA[1]];
  }
  function aplicarReal(estado: SalaState) {
    S.semana = estado.semanaAtual; S.verSemana = estado.semanaAtual;
    const vistos = new Set<string>();
    for (const lv of estado.leads) {
      vistos.add(lv.id);
      const map = VIEW_INTERNA[lv.etapa] || VIEW_INTERNA.na_mesa;
      const fechado = FECHADOS.includes(map.etapa);
      const semFim = fechado ? estado.semanaAtual : null;
      let L = S.leads.find((l) => l.id === lv.id);
      if (!L) {
        const g = guessG(lv.nome);
        L = {
          id: lv.id, nome: lv.nome, g, look: lookCliente(hashId(lv.id), g), origem: lv.origem === 'remarketing' ? 'remarketing' : 'anúncio', cidade: lv.cidade, telefone: lv.telefone,
          etapa: map.etapa, passo: lv.triagemPasso, atd: lv.atendenteId, msgs: [], chegouEm: 0, semanaEntrada: lv.semanaEntrada, semanaFim: semFim, motivo: lv.motivo ?? null,
          botInicio: null, triadoEm: null, qualEm: null, primeiroAtdEm: null, nAtd: 0, ligacoes: 0, zona: null, assento: null, alvoZona: null, zonaEm: 0, tentativas: 0, proxRmk: 0, vaiResponder: false,
          docsN: lv.docsEnviados, proxDoc: 0, assIni: 0, mudo: false, ultimaDe: 'cliente', ultimaEm: 0, proxCliente: 0, proxBot: 0, fimEm: null, caminho: [], pos: [0, 0], hist: [], pose: 'pe',
        };
        S.leads.push(L);
      } else {
        L.nome = lv.nome; L.telefone = lv.telefone; L.cidade = lv.cidade; L.atd = lv.atendenteId; L.motivo = lv.motivo ?? null; L.docsN = lv.docsEnviados; L.passo = lv.triagemPasso;
        L.origem = lv.origem === 'remarketing' ? 'remarketing' : 'anúncio'; L.semanaEntrada = lv.semanaEntrada; L.semanaFim = semFim;
      }
      if (L.zona !== map.zona) {
        L.etapa = map.etapa; L.zona = map.zona; L.assento = null;
        L.pos = posReal(L, map.zona);
        L.caminho = []; L.pose = SENTADO_ZONA.has(L.zona) ? 'sentado' : 'pe';
      }
    }
    S.leads = S.leads.filter((l) => vistos.has(l.id));
    mudou();
  }

  /* ---------- seed inicial (foto da sala às 9:12) ---------- */
  if (!modoReal) seed();
  function seed() {
    const a = novoLead('anúncio'); a.mudo = false; a.pos = [BALCAO[0][0], BALCAO[0][1]]; a.caminho = []; a.etapa = 'no_bot'; a.passo = 1; a.botInicio = S.t - 3; a.msgs.push({ de: 'bot', t: S.t - 3, txt: PERG_BOT[0] }, { de: 'cliente', t: S.t - 2, txt: a.nome }, { de: 'bot', t: S.t - 1, txt: PERG_BOT[1] }); a.ultimaDe = 'bot'; a.ultimaEm = S.t - 1; a.proxBot = S.t + 1; S.bot.passo[0]++; S.bot.passo[1]++; S.bot.msgs += 2;
    const b = novoLead('anúncio'); b.mudo = false; b.pos = [ATENDENTES[0].visita[0], ATENDENTES[0].visita[1]]; b.caminho = []; b.etapa = 'com_atendente'; b.atd = 'gi'; atd.gi.atual = b.id; b.zona = 'mesa'; b.alvoZona = ATENDENTES[0].visita; b.triadoEm = S.t - 6; b.botInicio = S.t - 12; b.passo = 4; b.msgs.push({ de: 'bot', t: S.t - 7, txt: PERG_BOT[3] }, { de: 'cliente', t: S.t - 6, txt: 'Pode chamar' }, { de: 'atendente', t: S.t - 4, txt: MSG_ATD[0](b.nome).replace('{A}', 'Giovana') }, { de: 'cliente', t: S.t - 1, txt: 'Pode ligar sim' }); b.nAtd = 1; b.primeiroAtdEm = S.t - 4; b.ultimaDe = 'cliente'; b.ultimaEm = S.t - 1; b.hist.push({ t: S.t - 6, txt: 'Triagem concluída em 6 min · encaminhado pra Giovana' }, { t: S.t - 4, txt: '1ª resposta de Giovana em 2 min' });
    Object.assign(atd.gi, { msgs: 1, recebidos: 1, primeiras: [2], respostas: [2] }); S.bot.porAtd.gi = 1; S.bot.tempos.push(6); S.kpi.triados = 1; S.kpi.primeiras = [2]; logA('gi', `Recebeu ${b.nome} da recepção`);
    const c = novoLead('remarketing'); c.mudo = false; c.zona = 'retorno'; c.assento = 0; c.alvoZona = ZONAS.retorno.assentos[0]; c.pos = [ZONAS.retorno.assentos[0][0], ZONAS.retorno.assentos[0][1]]; c.caminho = []; c.etapa = 'com_atendente'; c.atd = 'ju'; c.triadoEm = S.t - 12; c.botInicio = S.t - 17; c.passo = 4; c.msgs.push({ de: 'atendente', t: S.t - 9, txt: MSG_ATD[0](c.nome).replace('{A}', 'Juliana') }, { de: 'cliente', t: S.t - 8, txt: 'Como funciona isso?' }, { de: 'atendente', t: S.t - 5, txt: MSG_ATD[1](c.nome) }); c.nAtd = 2; c.qualEm = S.t - 5; c.primeiroAtdEm = S.t - 9; c.ultimaDe = 'atendente'; c.ultimaEm = S.t - 5; c.proxCliente = S.t + 4; c.hist.push({ t: S.t - 12, txt: 'Triagem concluída em 5 min · encaminhado pra Juliana' }, { t: S.t - 9, txt: '1ª resposta de Juliana em 3 min' }, { t: S.t - 5, txt: 'Qualificado por Juliana' });
    Object.assign(atd.ju, { msgs: 2, recebidos: 1, primeiras: [3], respostas: [3, 3], qualificados: 1 }); S.bot.porAtd.ju = 1; S.bot.tempos.push(5); S.kpi.triados = 2; S.kpi.qualificados = 1; S.kpi.primeiras = [2, 3]; logA('ju', `Recebeu ${c.nome} da recepção`);
    const d = novoLead('anúncio'); d.mudo = false; d.zona = 'espera'; d.assento = 0; d.alvoZona = ZONAS.espera.assentos[0]; d.pos = [ZONAS.espera.assentos[0][0], ZONAS.espera.assentos[0][1]]; d.caminho = []; d.etapa = 'com_atendente'; d.atd = 'ma'; d.triadoEm = S.t - 4; d.botInicio = S.t - 9; d.passo = 4; d.msgs.push({ de: 'bot', t: S.t - 5, txt: PERG_BOT[3] }, { de: 'cliente', t: S.t - 4, txt: 'Sim, agora dá' }); d.ultimaDe = 'cliente'; d.ultimaEm = S.t - 4; d.hist.push({ t: S.t - 4, txt: 'Triagem concluída em 5 min · encaminhado pra Mateus' });
    Object.assign(atd.ma, { recebidos: 1 }); S.bot.porAtd.ma = 1; S.bot.tempos.push(5); S.kpi.triados = 3;
    const e2 = novoLead('anúncio'); e2.mudo = false; e2.zona = 'documentacao'; e2.assento = 0; e2.alvoZona = ZONAS.documentacao.assentos[0]; e2.pos = [ZONAS.documentacao.assentos[0][0], ZONAS.documentacao.assentos[0][1]]; e2.caminho = []; e2.etapa = 'documentacao'; e2.atd = 'gi'; e2.docsIni = S.t - 4; e2.docsN = 1; e2.proxDoc = S.t + 2; e2.triadoEm = S.t - 40; e2.botInicio = S.t - 46; e2.qualEm = S.t - 30; e2.primeiroAtdEm = S.t - 37; e2.nAtd = 4; e2.passo = 4; e2.ultimaDe = 'cliente'; e2.ultimaEm = S.t - 2; e2.msgs.push({ de: 'atendente', t: S.t - 12, txt: MSG_ATD[2](e2.nome) }, { de: 'cliente', t: S.t - 2, txt: 'Enviou: RG (frente)' }); e2.hist.push({ t: S.t - 40, txt: 'Triagem concluída em 6 min · encaminhado pra Giovana' }, { t: S.t - 30, txt: 'Qualificado por Giovana' }, { t: S.t - 4, txt: 'Começou o envio de documentos' });
    const g = novoLead('anúncio'); g.mudo = false; g.zona = 'assinatura'; g.assento = 0; g.alvoZona = ZONAS.assinatura.assentos[0]; g.pos = [ZONAS.assinatura.assentos[0][0], ZONAS.assinatura.assentos[0][1]]; g.caminho = []; g.etapa = 'assinatura'; g.atd = 'ju'; g.assIni = S.t + 3; g.docsN = 3; g.triadoEm = S.t - 55; g.botInicio = S.t - 60; g.qualEm = S.t - 45; g.nAtd = 5; g.passo = 4; g.ultimaDe = 'cliente'; g.ultimaEm = S.t - 3; g.msgs.push({ de: 'cliente', t: S.t - 6, txt: 'Enviou: Extrato do benefício (PDF)' }, { de: 'atendente', t: S.t - 4, txt: 'Perfeito! Agora é só assinar a procuração e o contrato que te enviei.' }); g.hist.push({ t: S.t - 55, txt: 'Triagem concluída · encaminhado pra Juliana' }, { t: S.t - 45, txt: 'Qualificado por Juliana' }, { t: S.t - 3, txt: 'Documentos completos · foi pra assinatura' }); S.kpi.docs = 1;
    const hh = novoLead('anúncio'); hh.mudo = false; hh.zona = 'remarketing'; hh.assento = 0; hh.alvoZona = ZONAS.remarketing.assentos[0]; hh.pos = [ZONAS.remarketing.assentos[0][0], ZONAS.remarketing.assentos[0][1]]; hh.caminho = []; hh.etapa = 'remarketing'; hh.tentativas = 1; hh.proxRmk = S.t + 6; hh.passo = 2; hh.botInicio = S.t - 50; hh.ultimaDe = 'bot'; hh.ultimaEm = S.t - 20; hh.msgs.push({ de: 'bot', t: S.t - 20, txt: MSG_RMK[0](hh.nome) }); hh.hist.push({ t: S.t - 34, txt: 'Parou de responder na pergunta 3 — alerta de lead quente' }, { t: S.t - 20, txt: 'Remarketing 1/3 enviado pelo Matheo' });
    const f = novoLead('anúncio'); f.mudo = false; f.zona = 'sem_resposta'; f.assento = 0; f.alvoZona = ZONAS.sem_resposta.assentos[0]; f.pos = [ZONAS.sem_resposta.assentos[0][0], ZONAS.sem_resposta.assentos[0][1]]; f.caminho = []; f.etapa = 'abandono'; f.passo = 2; f.botInicio = S.t - 16; f.alertaEm = S.t - 2; f.ultimaDe = 'bot'; f.ultimaEm = S.t - 12; f.msgs.push({ de: 'bot', t: S.t - 15, txt: PERG_BOT[0] }, { de: 'cliente', t: S.t - 14, txt: f.nome }, { de: 'bot', t: S.t - 13, txt: PERG_BOT[1] }, { de: 'cliente', t: S.t - 12, txt: 'Aposentado desde 2019' }, { de: 'bot', t: S.t - 12, txt: PERG_BOT[2] }); f.hist.push({ t: S.t - 15, txt: 'Matheo iniciou a triagem' }, { t: S.t - 2, txt: 'Parou de responder na pergunta 3 — alerta de lead quente' }); S.kpi.abandonos = 2; S.bot.abandPasso[2] = 2;
    // totais do dia coerentes entre si (mock): chegaram(15) = anuncio(12)+remarketing(3) = Σ porHora = Σ hist(8h..9h)
    S.hist[8] = 9; S.hist[9] = 6; S.kpi.chegaram = 15; S.kpi.docs = 6; S.bot.rmkMsgs = 5; S.bot.rmkVoltas = 2; S.kpi.anuncio = 12; S.kpi.remarketing = 3;
    S.kpi.porHora.anuncio = [7, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0]; S.kpi.porHora.remarketing = [2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    S.kpi.producao = 4; S.kpi.perdidos = 2; S.kpi.qualificados = 7; atd.gi.producao = 2; atd.ju.producao = 1; atd.ma.producao = 1; atd.ma.recebidos = 3; atd.ma.msgs = 5; atd.ma.primeiras = [4, 3]; atd.ma.respostas = [4, 3, 2, 5, 2]; atd.ma.qualificados = 2; atd.gi.recebidos = 3; atd.gi.qualificados = 2; atd.ju.recebidos = 3; atd.ju.qualificados = 3; atd.gi.respostas.push(3, 5); atd.gi.primeiras.push(3); atd.ju.respostas.push(2, 4); atd.ju.primeiras.push(2); S.bot.porAtd = { gi: 3, ju: 3, ma: 3 }; S.bot.passo = [11, 11, 10, 10]; S.bot.msgs = 44; S.kpi.triados = 9; S.kpi.primeiras.push(3, 2, 4, 3); S.bot.tempos.push(5, 7, 4, 6, 5, 8);
    S.feed = [{ t: S.t - 1, txt: `${b.nome} respondeu — mesa da Giovana` }, { t: S.t - 2, txt: `${f.nome} parou de responder na pergunta 3 — alerta de lead quente`, destaque: true }, { t: S.t - 9, txt: `${e2.nome} enviou os documentos e foi pra Produção` }];
    // histórico: fecha casos nas semanas 1 e 2 pra o seletor ter conteúdo
    const seedSlots: Record<string, number> = {};
    const seedFechado = (sem: number, etapa: EtapaInterna, motivo?: string) => {
      const [nome, gg] = NOMES[S.nomeIdx++ % NOMES.length];
      const zona: NomeZona = etapa === 'nao_legivel' ? 'nao_legivel' : etapa === 'concluido' ? (pick(['assinatura', 'documentacao']) as NomeZona) : 'sem_resposta';
      const key = sem + zona; const idx = (seedSlots[key] = seedSlots[key] || 0); seedSlots[key]++;
      const Z = ZONAS[zona]; const todos = [...Z.assentos, ...Z.emPe]; const alvo = todos[idx % todos.length];
      const L: Lead = { id: 'H' + ++S.seq, nome, g: gg, look: lookCliente(S.seq * 7919 + 13, gg), origem: pick(['anúncio', 'remarketing']), cidade: pick(CIDADES), telefone: `(51) 9${ri(6000, 9999)}-${String(ri(0, 9999)).padStart(4, '0')}`, etapa, passo: 4, atd: pick(['gi', 'ju', 'ma']), msgs: [{ de: 'cliente', t: 9 * 60, txt: '...' }], chegouEm: 9 * 60, semanaEntrada: sem, semanaFim: sem, motivo: motivo || null, botInicio: null, triadoEm: 9 * 60, qualEm: etapa === 'concluido' ? 9 * 60 : null, primeiroAtdEm: null, nAtd: 3, ligacoes: 0, zona, assento: idx % todos.length, alvoZona: [alvo[0], alvo[1]], zonaEm: 0, tentativas: 0, proxRmk: 0, vaiResponder: false, docsN: 3, proxDoc: 0, assIni: 0, mudo: false, ultimaDe: 'cliente', ultimaEm: 9 * 60, proxCliente: 0, proxBot: 0, fimEm: 9 * 60, caminho: [], pos: [alvo[0], alvo[1]], hist: [{ t: 9 * 60, txt: etapa === 'concluido' ? 'Assinou · caso aberto' : etapa === 'nao_legivel' ? `Não-trabalhável: ${motivo}` : 'Marcado como perdido' }], pose: 'pe', semanasArrasto: 0 };
      S.leads.push(L); return L;
    };
    for (let i = 0; i < 5; i++) seedFechado(1, 'concluido');
    for (let i = 0; i < 3; i++) seedFechado(1, 'perdido');
    for (let i = 0; i < 2; i++) seedFechado(1, 'nao_legivel', pick(MOTIVOS));
    for (let i = 0; i < 7; i++) seedFechado(2, 'concluido');
    for (let i = 0; i < 4; i++) seedFechado(2, 'perdido');
    seedFechado(2, 'nao_legivel', 'já é cliente'); seedFechado(2, 'nao_legivel', 'número inválido');
    c.semanaEntrada = 1; c.semanasArrasto = 2; c.hist.unshift({ t: 9 * 60, txt: 'Entrou na semana 1' });
    hh.semanaEntrada = 2; hh.semanasArrasto = 1;
    atualizarZonas();
  }
  snapAtual = construirSnapshot();
  renderCena();

  /* ---------- ZOOM + PAN do usuário (roda do mouse aproxima; arrastar move) ---------- */
  const MINW = VB.w * 0.30, MAXW = VB.w; // aproxima até ~3.3× a sala inteira
  let arrastando = false, dragMoved = false, apX = 0, apY = 0;
  function clampCam() {
    camera.aw = Math.max(MINW, Math.min(MAXW, camera.aw));
    camera.ah = (camera.aw * VB.h) / VB.w;
    const fx = camera.aw * 0.12, fy = camera.ah * 0.12;
    camera.ax = Math.max(VB.x0 - fx, Math.min(VB.x0 + VB.w - camera.aw + fx, camera.ax));
    camera.ay = Math.max(VB.y0 - fy, Math.min(VB.y0 + VB.h - camera.ah + fy, camera.ay));
  }
  function zoomEm(fator: number, fx: number, fy: number) {
    const sx = camera.x + fx * camera.w, sy = camera.y + fy * camera.h; // ponto sob o cursor na visão atual
    const novoW = Math.max(MINW, Math.min(MAXW, camera.aw * fator));
    camera.ax = sx - fx * novoW; camera.ay = sy - fy * (novoW * VB.h) / VB.w; camera.aw = novoW;
    zoomUsuario = novoW < MAXW - 1; // voltou pra sala inteira → sai do modo manual
    clampCam();
  }
  const onWheel = (e: WheelEvent) => { e.preventDefault(); const r = svg.getBoundingClientRect(); zoomEm(Math.exp(e.deltaY * 0.0016), (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height); };
  const onDown = (e: PointerEvent) => { if (e.button !== 0) return; arrastando = true; dragMoved = false; apX = e.clientX; apY = e.clientY; };
  const onMove = (e: PointerEvent) => {
    if (!arrastando) return;
    const dx = e.clientX - apX, dy = e.clientY - apY; apX = e.clientX; apY = e.clientY;
    if (Math.abs(dx) + Math.abs(dy) > 3) dragMoved = true;
    const r = svg.getBoundingClientRect();
    camera.ax -= (dx / r.width) * camera.aw; camera.ay -= (dy / r.height) * camera.ah;
    camera.x = camera.ax; camera.y = camera.ay; zoomUsuario = true; clampCam();
  };
  const onUp = () => { arrastando = false; };

  /* ---------- clique no chão / SDR / bot na cena ---------- */
  const onClick = (e: Event) => { if (dragMoved) { dragMoved = false; return; } const g = (e.target as Element).closest('.p'); if (g && !g.classList.contains('cliente')) selecionar((g as HTMLElement).dataset.id as Selecao); else if (!g && S.selecao !== 'sala') selecionar('sala'); };
  const onKey = (e: Event) => { const ev = e as KeyboardEvent; if (ev.key !== 'Enter' && ev.key !== ' ') return; const g = (ev.target as Element).closest('.p'); if (!g || g.classList.contains('cliente')) return; ev.preventDefault(); selecionar((g as HTMLElement).dataset.id as Selecao); };
  const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') { if (zoomUsuario) { zoomUsuario = false; Object.assign(camera, { ax: VB.x0, ay: VB.y0, aw: VB.w, ah: VB.h }); } else if (S.selecao !== 'sala') selecionar('sala'); } };
  svg.addEventListener('click', onClick);
  svg.addEventListener('keydown', onKey);
  svg.addEventListener('wheel', onWheel, { passive: false });
  svg.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  document.addEventListener('keydown', onEsc);

  /* ---------- loop ---------- */
  let ultimo = performance.now(), acc = 0, raf = 0, vivo = true;
  function loop(now: number) {
    if (!vivo) return;
    const dt = Math.min(100, now - ultimo); ultimo = now;
    if (!modoReal && !S.pausado && S.verSemana === S.semana) { acc += dt * S.vel; while (acc >= CONFIG.MINUTO_MS) { acc -= CONFIG.MINUTO_MS; tick(); } }
    frame(dt);
    raf = requestAnimationFrame(loop);
  }
  raf = requestAnimationFrame(loop);

  return {
    assinar(cb) { ouvintes.add(cb); return () => ouvintes.delete(cb); },
    snapshot() { return snapAtual; },
    estadoSala() {
      const proj = (L: Lead): LeadView => ({ id: L.id, nome: L.nome, telefone: L.telefone, cidade: L.cidade, origem: L.origem === 'anúncio' ? 'anuncio' : 'remarketing', etapa: ETAPA_VIEW[L.etapa], atendenteId: L.atd, motivo: L.motivo || undefined, semanaEntrada: L.semanaEntrada, semanaFim: L.semanaFim ?? undefined, triagemPasso: L.passo, docsEnviados: L.docsN, ultimaInteracaoEm: new Date(Date.now()).toISOString(), conversa: L.msgs.map((m) => ({ de: m.de, texto: m.txt, em: hhmm(m.t) })), historico: L.hist.map((x) => ({ em: hhmm(x.t), texto: x.txt })) });
      return { semanaAtual: S.semana, leads: S.leads.map(proj), atendentes: ATENDENTES.map((a) => ({ id: a.id, nome: a.nome, online: true })) };
    },
    aplicarReal(estado) { aplicarReal(estado); },
    zoom(fator) { zoomEm(fator, 0.5, 0.5); },
    resetZoom() { zoomUsuario = false; Object.assign(camera, { ax: VB.x0, ay: VB.y0, aw: VB.w, ah: VB.h }); },
    exportarCsv() {
      const CAT: Record<string, string> = { chegando: 'Na fila', fila_bot: 'Na fila', no_bot: 'Em triagem', abandono: 'Sem resposta', ligacao: 'Em ligação', triado: 'Em atendimento', com_atendente: 'Em atendimento', documentacao: 'Documentação', assinatura: 'Aguardando assinatura', remarketing: 'Remarketing', concluido: 'Caso aberto', perdido: 'Perdido', nao_legivel: 'Não-trabalhável' };
      const cat = (L: Lead) => CAT[L.etapa] ?? L.etapa;
      const esc = (v: unknown) => { const s = String(v ?? ''); return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
      const linhas: string[] = [];
      // --- resumo por categoria (os números que o dono quer ver todo dia) ---
      const cont: Record<string, number> = {};
      for (const L of S.leads) { const c = cat(L); cont[c] = (cont[c] || 0) + 1; }
      linhas.push(`Relatório da Sala SDR — semana atual (${S.semana})`);
      linhas.push('Resumo por categoria;Quantidade');
      for (const k of Object.keys(cont)) linhas.push(`${esc(k)};${cont[k]}`);
      // motivos dos não-trabalháveis (números por motivo)
      const ne = S.leads.filter((l) => l.etapa === 'nao_legivel');
      if (ne.length) {
        linhas.push('');
        linhas.push('Motivos de não-trabalhável;Quantidade');
        const mot: Record<string, number> = {};
        for (const L of ne) { const m = L.motivo || '(sem motivo)'; mot[m] = (mot[m] || 0) + 1; }
        for (const k of Object.keys(mot)) linhas.push(`${esc(k)};${mot[k]}`);
      }
      // --- detalhe por cliente ---
      linhas.push('');
      linhas.push('Nome;Telefone;Cidade;Origem;Categoria;Motivo;Atendente;Documentos;Semana entrada;Semana fim;Entrou;Última interação');
      const ord = [...S.leads].sort((a, b) => cat(a).localeCompare(cat(b)) || a.nome.localeCompare(b.nome));
      for (const L of ord) {
        const atdN = L.atd ? ATENDENTES.find((a) => a.id === L.atd)?.nome ?? L.atd : '';
        linhas.push([L.nome, L.telefone, L.cidade, L.origem, cat(L), L.etapa === 'nao_legivel' ? L.motivo ?? '' : '', atdN, `${Math.min(L.docsN, 3)}/3`, L.semanaEntrada, L.semanaFim ?? '', hhmm(L.chegouEm), hhmm(L.ultimaEm)].map(esc).join(';'));
      }
      return '﻿' + linhas.join('\r\n'); // BOM + CRLF para o Excel PT-BR abrir certinho
    },
    pausar() { S.pausado = !S.pausado; mudou(); },
    alternarVelocidade() { S.vel = S.vel === 1 ? 3 : 1; mudou(); },
    leadNovo() { if (S.verSemana !== S.semana) { S.verSemana = S.semana; } novoLead('anúncio'); mudou(); },
    virarSemana() { virarSemana(); },
    verSemana(w) { S.verSemana = w; if (S.selecao !== 'sala') { selecionar('sala'); return; } mudou(); },
    selecionar(sel, conv = null, aba = null) { selecionar(sel, conv, aba); },
    selecionarLead(id) { const L = S.leads.find((l) => l.id === id); if (L) selecionar(L.atd || 'bot', L.id); },
    trocarAba(aba) { S.aba = aba; mudou(); },
    trocarConversa(id) { S.convSel = S.convSel === id ? null : id; mudou(); },
    voltarSala() { selecionar('sala'); },
    destruir() {
      vivo = false; cancelAnimationFrame(raf); clearTimeout(pulseTimer);
      svg.removeEventListener('click', onClick); svg.removeEventListener('keydown', onKey); document.removeEventListener('keydown', onEsc);
      svg.removeEventListener('wheel', onWheel); svg.removeEventListener('pointerdown', onDown); window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp);
      ouvintes.clear(); svg.innerHTML = '';
    },
  };
}
