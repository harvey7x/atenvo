import { MOTIVO_CURTO, MOTIVO_ROTULO, type VigiaCaso } from './vigiaRespostas';

/* ------------------------------------------------------------------
   Vista do Vigia de respostas — TODA a organização da lista, pura e sem React
   (testável no node): grupos por tempo de espera, filtros (faixa, quem deve
   responder, busca), ordem dentro de cada seção, linhas visíveis e textos.
   Nada aqui inventa campo de banco: entra VigiaCaso[], sai a Vista.
   ------------------------------------------------------------------ */

export type GrupoEspera = 'menos1h' | 'de1a24h' | 'mais24h';
export const GRUPOS_ESPERA: { id: GrupoEspera; rotulo: string; vazio: string }[] = [
  { id: 'menos1h', rotulo: 'Menos de 1 h', vazio: 'Ninguém esperando há menos de 1 h.' },
  { id: 'de1a24h', rotulo: 'De 1 h a 24 h', vazio: 'Ninguém esperando entre 1 h e 24 h.' },
  { id: 'mais24h', rotulo: 'Mais de 24 h', vazio: 'Ninguém esperando há mais de 24 h.' },
];
export const grupoDe = (min: number): GrupoEspera => (min < 60 ? 'menos1h' : min < 1440 ? 'de1a24h' : 'mais24h');

export const LINHAS_INICIAIS = 3;
export const LINHAS_FOCO = 20;
export const PASSO = 20;
export const FOLGA = 2;
export const LIMITE_LISTA = 300;

/* ---------- exceções (as únicas linhas com cor) ---------- */
export type AlertaVigia = 'cura_esgotada' | 'numero_desconectado';
/** 'cura_esgotada': a Iris não voltou depois das tentativas (crítica antes das 24 h);
 *  'numero_desconectado': o WhatsApp do caso caiu. O resto é atraso comum. */
export function alertaDe(c: VigiaCaso): AlertaVigia | null {
  if (c.quemDeve === 'iris' && c.severidade === 'critica' && c.esperaMin < 1440) return 'cura_esgotada';
  if (c.motivo === 'canal_desconectado') return 'numero_desconectado';
  return null;
}

/* ---------- quem deve responder ---------- */
export interface Situacao { tipo: 'iris' | 'robo' | 'pessoa' | 'sem'; quem: string; nota: string; alerta: AlertaVigia | null; titulo: string }
export function situacaoDe(c: VigiaCaso): Situacao {
  const alerta = alertaDe(c);
  const tipo: Situacao['tipo'] = c.quemDeve === 'iris' ? 'iris' : c.quemDeve === 'robo' ? 'robo' : c.dono ? 'pessoa' : 'sem';
  const quem = tipo === 'iris' ? 'Iris' : tipo === 'robo' ? 'Robô' : tipo === 'pessoa' ? primeiroNome(c.dono!) : 'Sem atendente';
  let nota: string;
  if (alerta === 'cura_esgotada') {
    const n = Math.max(1, c.tentativasCura);
    nota = `não voltou depois de ${n} ${n === 1 ? 'tentativa' : 'tentativas'}`;
  } else {
    nota = MOTIVO_CURTO[c.motivo] ?? c.motivo;
    if (c.quemDeve === 'iris' && c.tentativasCura > 0) nota += ` · reativada ${c.tentativasCura} ${c.tentativasCura === 1 ? 'vez' : 'vezes'}`;
  }
  const titulo = (MOTIVO_ROTULO[c.motivo] ?? c.motivo) + (c.dono ? ` · cliente de ${c.dono}` : '');
  return { tipo, quem, nota, alerta, titulo };
}

export type FiltroQuem = 'todos' | 'iris' | 'robo' | 'sem' | `p:${string}`;
export const chaveQuem = (c: VigiaCaso): Exclude<FiltroQuem, 'todos'> =>
  c.quemDeve === 'iris' ? 'iris' : c.quemDeve === 'robo' ? 'robo' : c.dono ? `p:${c.dono}` : 'sem';

export interface OpcaoQuem {
  chave: Exclude<FiltroQuem, 'todos'>;
  tipo: 'iris' | 'robo' | 'pessoa' | 'sem';
  rotulo: string;
  nomeCompleto?: string;
  n: number;
  maiorEspera: number;
}
/** Os chips da barra: Iris e Robô sempre (mesmo com 0); um por atendente com caso
 *  (mais casos primeiro, empate pelo nome; homônimos ganham o nome completo);
 *  "Sem atendente" só se houver. */
export function opcoesQuem(casos: VigiaCaso[]): OpcaoQuem[] {
  const porChave = new Map<string, { n: number; maiorEspera: number }>();
  for (const c of casos) {
    const k = chaveQuem(c);
    const r = porChave.get(k) ?? { n: 0, maiorEspera: 0 };
    r.n += 1;
    if (c.esperaMin > r.maiorEspera) r.maiorEspera = c.esperaMin;
    porChave.set(k, r);
  }
  const de = (k: string) => porChave.get(k) ?? { n: 0, maiorEspera: 0 };
  const out: OpcaoQuem[] = [
    { chave: 'iris', tipo: 'iris', rotulo: 'Iris', n: de('iris').n, maiorEspera: de('iris').maiorEspera },
    { chave: 'robo', tipo: 'robo', rotulo: 'Robô', n: de('robo').n, maiorEspera: de('robo').maiorEspera },
  ];
  const pessoas = [...porChave.entries()]
    .filter(([k]) => k.startsWith('p:'))
    .map(([k, v]) => ({ chave: k as `p:${string}`, nomeCompleto: k.slice(2), n: v.n, maiorEspera: v.maiorEspera }))
    .sort((a, b) => b.n - a.n || a.nomeCompleto.localeCompare(b.nomeCompleto, 'pt-BR'));
  const primeiros = new Map<string, number>();
  for (const p of pessoas) {
    const pn = primeiroNome(p.nomeCompleto);
    primeiros.set(pn, (primeiros.get(pn) ?? 0) + 1);
  }
  for (const p of pessoas) {
    const pn = primeiroNome(p.nomeCompleto);
    out.push({ chave: p.chave, tipo: 'pessoa', rotulo: (primeiros.get(pn) ?? 0) > 1 ? p.nomeCompleto : pn, nomeCompleto: p.nomeCompleto, n: p.n, maiorEspera: p.maiorEspera });
  }
  const sem = de('sem');
  if (sem.n > 0) out.push({ chave: 'sem', tipo: 'sem', rotulo: 'Sem atendente', n: sem.n, maiorEspera: sem.maiorEspera });
  return out;
}

/* ---------- estado da vista ---------- */
export interface EstadoVista {
  espera: GrupoEspera | 'todas';
  quem: FiltroQuem;
  /** linhas abertas por seção ("Mostrar mais"); vazio = o limite padrão */
  mostrando: Partial<Record<GrupoEspera, number>>;
  /** a busca não vai para o sessionStorage */
  busca: string;
}
export const VISTA_INICIAL: EstadoVista = { espera: 'todas', quem: 'todos', mostrando: {}, busca: '' };

export const limiteDe = (e: EstadoVista, g: GrupoEspera): number =>
  e.mostrando[g] ?? (e.espera === g ? LINHAS_FOCO : LINHAS_INICIAIS);

/* ---------- busca (nome sem acento e sem caixa; telefone por dígitos) ---------- */
const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('pt-BR');
export function passaBusca(c: VigiaCaso, busca: string): boolean {
  const q = busca.trim();
  if (!q) return true;
  if (semAcento(c.nome).includes(semAcento(q))) return true;
  const dig = q.replace(/\D/g, '');
  return dig.length > 0 && (c.telefone ?? '').replace(/\D/g, '').includes(dig);
}

/* ---------- a vista ---------- */
export interface GrupoVista { id: GrupoEspera; rotulo: string; vazio: string; total: number; linhas: VigiaCaso[]; restantes: number }
export interface Vista {
  /** contagem e maior espera por faixa — respeita o quem e a busca, nunca a própria faixa */
  faixa: Record<GrupoEspera, { n: number; maiorEspera: number }>;
  grupos: GrupoVista[];
  quem: OpcaoQuem[];
  total: number;
  filtrados: number;
}

const ordemAlerta = (c: VigiaCaso): number => {
  const a = alertaDe(c);
  return a === 'cura_esgotada' ? 0 : a === 'numero_desconectado' ? 1 : 2;
};
/** exceções primeiro (Iris que não voltou, depois número desconectado), então quem espera há mais tempo, por fim o nome */
export const ordenarCasos = (casos: VigiaCaso[]): VigiaCaso[] =>
  [...casos].sort((a, b) => ordemAlerta(a) - ordemAlerta(b) || b.esperaMin - a.esperaMin || a.nome.localeCompare(b.nome, 'pt-BR'));

export function montarVista(casos: VigiaCaso[], e: EstadoVista): Vista {
  const doQuem = e.quem === 'todos' ? casos : casos.filter((c) => chaveQuem(c) === e.quem);
  const comBusca = e.busca.trim() !== '';
  const filtradosLista = comBusca ? doQuem.filter((c) => passaBusca(c, e.busca)) : doQuem;

  const faixa = {} as Vista['faixa'];
  for (const g of GRUPOS_ESPERA) faixa[g.id] = { n: 0, maiorEspera: 0 };
  for (const c of filtradosLista) {
    const f = faixa[grupoDe(c.esperaMin)];
    f.n += 1;
    if (c.esperaMin > f.maiorEspera) f.maiorEspera = c.esperaMin;
  }

  const filtroDeLista = e.quem !== 'todos' || comBusca; // com ele, seções vazias somem
  const grupos: GrupoVista[] = [];
  for (const g of GRUPOS_ESPERA) {
    if (e.espera !== 'todas' && e.espera !== g.id) continue;
    const doGrupo = ordenarCasos(filtradosLista.filter((c) => grupoDe(c.esperaMin) === g.id));
    if (filtroDeLista && doGrupo.length === 0) continue;
    const lim = limiteDe(e, g.id);
    const linhas = doGrupo.length <= lim + FOLGA ? doGrupo : doGrupo.slice(0, lim); // nunca "mostrar mais 1"
    grupos.push({ id: g.id, rotulo: g.rotulo, vazio: g.vazio, total: doGrupo.length, linhas, restantes: doGrupo.length - linhas.length });
  }

  return { faixa, grupos, quem: opcoesQuem(casos), total: casos.length, filtrados: filtradosLista.length };
}

/* ---------- textos ---------- */
/** Traduz o código de mídia que vem no ultima_msg ('[audio]', '[imagem]'…). */
export function textoMensagem(m: string | null): { texto: string; midia: boolean } {
  const t = (m ?? '').trim();
  if (!t) return { texto: '—', midia: false };
  if (/^\[[^\]]*\]$/.test(t)) {
    const tipo = t.slice(1, -1).toLocaleLowerCase('pt-BR');
    if (tipo === 'audio' || tipo === 'áudio') return { texto: 'Mensagem de voz', midia: true };
    if (tipo === 'imagem') return { texto: 'Imagem', midia: true };
    if (tipo === 'video' || tipo === 'vídeo') return { texto: 'Vídeo', midia: true };
    if (tipo === 'documento') return { texto: 'Documento', midia: true };
    return { texto: 'Mensagem sem texto', midia: true };
  }
  return { texto: t, midia: false };
}

const TZ = 'America/Sao_Paulo';
const diaSP = (t: number): string => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(t);
const horaSP = (t: number): string => new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(t);

/** "desde 13:02" · "desde ontem, 18:40" · "desde seg, 09:14" · "desde 05/11" — o momento em que o
 *  cliente escreveu (lidoEm − esperaMin, no fuso de São Paulo; espera_min é relógio corrido). */
export function desdeRotulo(esperaMin: number, lidoEm: string): string {
  const ref = Date.parse(lidoEm);
  if (!Number.isFinite(ref)) return '';
  const t = ref - esperaMin * 60_000;
  const hm = horaSP(t);
  const d0 = diaSP(t), r0 = diaSP(ref);
  if (d0 === r0) return `desde ${hm}`;
  const dias = Math.round((Date.parse(`${r0}T12:00:00Z`) - Date.parse(`${d0}T12:00:00Z`)) / 86_400_000);
  if (dias === 1) return `desde ontem, ${hm}`;
  if (dias < 7) {
    const sem = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, weekday: 'short' }).format(t).replace(/\./g, '');
    return `desde ${sem}, ${hm}`;
  }
  const dm = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit' }).format(t);
  return `desde ${dm}`;
}

/** "às 14:32" pede só a hora; null vira "—". */
export function hhmm(iso: string | null): string {
  if (!iso) return '—';
  const t = Date.parse(iso);
  return Number.isFinite(t) ? horaSP(t) : '—';
}

export const primeiroNome = (nome: string): string => nome.trim().split(/\s+/)[0] ?? nome;

const MIUDA = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);
/** Iniciais do cliente: primeira + última palavra (ignora de/da/do/das/dos/e); sem nome vira "·". */
export function iniciaisCliente(nome: string): string {
  if (!nome || nome === 'Cliente sem nome') return '·';
  const p = nome.trim().split(/\s+/).filter((x) => x && !MIUDA.has(x.toLocaleLowerCase('pt-BR')));
  if (!p.length) return '·';
  const a = p[0][0] ?? '';
  const b = p.length > 1 ? p[p.length - 1][0] ?? '' : '';
  return (a + b).toLocaleUpperCase('pt-BR');
}

/** "Mostrar o outro" · "Mostrar os outros 4" · "Mostrar mais 20 · faltam 136". */
export function rotuloMais(restantes: number): string {
  if (restantes === 1) return 'Mostrar o outro';
  if (restantes <= PASSO) return `Mostrar os outros ${restantes}`;
  return `Mostrar mais ${PASSO} · faltam ${restantes}`;
}
