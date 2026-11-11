/* ============================================================================
   Portabilidades — acompanhamento do cliente na portabilidade (pedido do dono 13/10/2026).
   Um cliente entra na aba com o VALOR QUE ELE VAI RECEBER; a divisão (cliente / escritório /
   atendente) sai da regra abaixo. Depois a equipe marca, nesta ordem:
     1. o cliente aceitou (ou não aceitou);
     2. o benefício do cliente foi desbloqueado;
     3. o link foi enviado → o cliente fez o link;
     4. a portabilidade foi concluída.
   Este arquivo = tipos + regras puras + store da DEMONSTRAÇÃO (em memória, nada é salvo).
   ============================================================================ */
import { useSyncExternalStore } from 'react';
import { clienteCasaBusca } from './pendencias';

/* ============================ tipos ============================ */
export type Aceite = 'aguardando' | 'aceitou' | 'recusou';
export type EstadoLink = 'nao_enviado' | 'enviado' | 'feito';
export type Situacao = 'aguardando_aceite' | 'em_andamento' | 'concluida' | 'nao_aceitou';

export interface EventoPort {
  id: string;
  quando: string;
  texto: string;
  /** nota = anotação escrita por alguém da equipe; sistema = mudança de etapa */
  tipo: 'sistema' | 'nota' | 'concluida';
  autor: string;
}
/** partes em centavos. escritorio = os 30% INTEIROS (já inclui a parte do atendente);
 *  atendente = 15% desses 30%; escritorioLiquido = o que sobra no escritório. */
export interface Divisao { cliente: number; escritorio: number; atendente: number; escritorioLiquido: number }
export interface Portabilidade {
  id: string;
  clienteId: string;
  atendenteId: string;
  /** valor que o cliente vai receber na portabilidade, em CENTAVOS (base da divisão) */
  valorTotal: number;
  /** a divisão fica gravada na hora (se a regra mudar depois, as antigas não mudam sozinhas) */
  divisao: Divisao;
  aceite: Aceite;
  aceiteEm?: string;
  desbloqueadoEm?: string;
  linkEnviadoEm?: string;
  linkFeitoEm?: string;
  concluidaEm?: string;
  criadaEm: string;
  atualizadaEm: string;
  eventos: EventoPort[];
}
export interface ClientePort { id: string; nome: string; telefone: string; responsavelId?: string; responsavel: string }
export interface Atendente { id: string; nome: string }

/* ============================ regra de divisão ============================
   Regra do dono (13/10/2026): do valor que o cliente vai receber, 30% vai para o ESCRITÓRIO;
   DENTRO desses 30%, 15% vai para o atendente responsável. O cliente fica com os outros 70%.
   Trocar SÓ aqui (a tela e o cálculo leem daqui). */
export interface RegraDivisao {
  /** % do valor do cliente que vai para o escritório */
  escritorio: number;
  /** % da parte do escritório que vai para o atendente */
  atendenteDoEscritorio: number;
}
export const REGRA_DIVISAO: RegraDivisao = { escritorio: 30, atendenteDoEscritorio: 15 };
/** % do valor do cliente que fica com ele (100 − escritório) */
export const pctCliente = (r: RegraDivisao = REGRA_DIVISAO) => 100 - r.escritorio;

/** valor do cliente (centavos) → partes (centavos). Arredonda ao centavo e as contas sempre fecham:
 *  cliente + escritório = valor; atendente + escritorioLiquido = escritório. */
export function dividir(total: number, r: RegraDivisao = REGRA_DIVISAO): Divisao {
  const t = Math.max(0, Math.round(total));
  const escritorio = Math.round((t * r.escritorio) / 100);
  const atendente = Math.round((escritorio * r.atendenteDoEscritorio) / 100);
  return { cliente: t - escritorio, escritorio, atendente, escritorioLiquido: escritorio - atendente };
}

/* ============================ dinheiro ============================ */
const FMT = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
/** 1234567 (centavos) → "R$ 12.345,67" */
export const reais = (centavos: number) => FMT.format((centavos || 0) / 100).replace(/ /g, ' ');
/** máscara do campo: só dígitos, como caixa eletrônico ("123456" → "1.234,56"). '' fica ''. */
export function mascaraReais(entrada: string): string {
  const d = (entrada ?? '').replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, 11);
  if (!d) return '';
  const c = Number(d);
  return (c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
/** texto do campo ("1.234,56") → centavos (123456). Vazio = 0. */
export const centavosDe = (texto: string) => Number((texto ?? '').replace(/\D/g, '') || '0');
/** centavos → texto do campo ("1.234,56") */
export const campoDe = (centavos: number) => (centavos > 0 ? mascaraReais(String(centavos)) : '');

/* ============================ situação ============================ */
export function situacao(p: Portabilidade): Situacao {
  if (p.aceite === 'recusou') return 'nao_aceitou';
  if (p.aceite === 'aguardando') return 'aguardando_aceite';
  return p.concluidaEm ? 'concluida' : 'em_andamento';
}
export const estadoLink = (p: Portabilidade): EstadoLink => (p.linkFeitoEm ? 'feito' : p.linkEnviadoEm ? 'enviado' : 'nao_enviado');
/** as duas etapas da portabilidade feitas (benefício desbloqueado + cliente fez o link) */
export const etapasFeitas = (p: Portabilidade) => !!p.desbloqueadoEm && !!p.linkFeitoEm;
export const podeConcluir = (p: Portabilidade) => p.aceite === 'aceitou' && !p.concluidaEm && etapasFeitas(p);

/** o que falta, numa frase curta (linha da lista e faixa de situação) */
export function oQueFalta(p: Portabilidade): { texto: string; tom: 'neutro' | 'azul' | 'ambar' | 'verde' | 'rubro' } {
  const s = situacao(p);
  if (s === 'nao_aceitou') return { texto: 'Cliente não aceitou', tom: 'rubro' };
  if (s === 'aguardando_aceite') return { texto: 'Esperando o cliente aceitar', tom: 'ambar' };
  if (s === 'concluida') return { texto: 'Portabilidade concluída', tom: 'verde' };
  if (etapasFeitas(p)) return { texto: 'Pronta para concluir', tom: 'azul' };
  const falta: string[] = [];
  if (!p.desbloqueadoEm) falta.push('desbloquear o benefício');
  const l = estadoLink(p);
  if (l === 'nao_enviado') falta.push('enviar o link');
  if (l === 'enviado') falta.push('o cliente fazer o link');
  return { texto: `Falta ${falta.join(' e ')}`, tom: 'neutro' };
}

/** ordem dentro de cada vista: em andamento = prontas para concluir primeiro, depois a mais parada;
 *  as demais = a mais recente primeiro */
export function ordenar(lista: Portabilidade[], s: Situacao): Portabilidade[] {
  const t = (iso?: string) => (iso ? new Date(iso).getTime() : 0);
  const c = [...lista];
  if (s === 'em_andamento') {
    return c.sort((a, b) => Number(etapasFeitas(b)) - Number(etapasFeitas(a)) || t(a.atualizadaEm) - t(b.atualizadaEm));
  }
  if (s === 'concluida') return c.sort((a, b) => t(b.concluidaEm) - t(a.concluidaEm));
  return c.sort((a, b) => t(b.criadaEm) - t(a.criadaEm));
}

/** mesmo mês/ano de hoje (resumo "no mês") */
export function noMes(iso: string | undefined, ref = new Date()): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth();
}

export interface Resumo {
  abertas: number; valorAberto: number;
  concluidasMes: number; valorConcluidoMes: number; escritorioMes: number; atendenteMes: number;
}
export function resumir(lista: Portabilidade[], ref = new Date()): Resumo {
  const r: Resumo = { abertas: 0, valorAberto: 0, concluidasMes: 0, valorConcluidoMes: 0, escritorioMes: 0, atendenteMes: 0 };
  for (const p of lista) {
    const s = situacao(p);
    if (s === 'aguardando_aceite' || s === 'em_andamento') { r.abertas += 1; r.valorAberto += p.valorTotal; }
    if (s === 'concluida' && noMes(p.concluidaEm, ref)) {
      r.concluidasMes += 1; r.valorConcluidoMes += p.valorTotal; r.escritorioMes += p.divisao.escritorio; r.atendenteMes += p.divisao.atendente;
    }
  }
  return r;
}

/** busca da lista: nome ou telefone (mesma regra da busca de clientes das Pendências) */
export const casaBusca = (c: ClientePort, busca: string) => clienteCasaBusca(c, busca);

/* ============================ dados de exemplo ============================ */
const MIN = 60_000;
const H = 60 * MIN;
const DIA = 24 * H;
const iso = (msAtras: number) => new Date(Date.now() - msAtras).toISOString();

export const USUARIO_DEMO: Atendente = { id: 'u-matheus', nome: 'Matheus' };
export const ATENDENTES_DEMO: Atendente[] = [
  USUARIO_DEMO, { id: 'u-juliana', nome: 'Juliana' }, { id: 'u-luiz', nome: 'Luiz' },
];
const nomeAt = (id: string) => ATENDENTES_DEMO.find((a) => a.id === id)?.nome ?? '—';

const CLI = (id: string, nome: string, telefone: string, responsavelId: string): ClientePort =>
  ({ id, nome, telefone, responsavelId, responsavel: nomeAt(responsavelId) });
const CLIENTES_DEMO: ClientePort[] = [
  CLI('k1', 'ANTÔNIO CARLOS RIBEIRO', '(51) 99634-2810', 'u-matheus'),
  CLI('k2', 'MARLENE DE FÁTIMA SOUZA', '(51) 98417-5532', 'u-juliana'),
  CLI('k3', 'JOSÉ ROBERTO MACHADO', '(54) 99182-0476', 'u-matheus'),
  CLI('k4', 'IVONE TEREZINHA DA SILVA', '(51) 99270-8814', 'u-luiz'),
  CLI('k5', 'PAULO CÉSAR NUNES', '(53) 98105-3367', 'u-matheus'),
  CLI('k6', 'NEUSA MARIA KLEIN', '(51) 99503-1129', 'u-juliana'),
  CLI('k7', 'VALDIR ANTÔNIO ROSA', '(55) 99620-7751', 'u-matheus'),
  CLI('k8', 'LOURDES APARECIDA GOMES', '(51) 98832-4406', 'u-luiz'),
  CLI('k9', 'SEBASTIÃO DOS REIS', '(51) 99741-6683', 'u-matheus'),
  CLI('k10', 'ZULMIRA BEATRIZ CORRÊA', '(54) 98426-9915', 'u-juliana'),
  CLI('k11', 'OSMAR LUIZ PEREIRA', '(51) 99358-2047', 'u-matheus'),
  CLI('k12', 'TEREZA CRISTINA ALVES', '(51) 98190-7738', 'u-luiz'),
  CLI('k13', 'GERALDO FERREIRA LIMA', '(53) 99916-4402', 'u-matheus'),
  CLI('k14', 'ROSÂNGELA MARTINS', '(51) 99087-3351', 'u-juliana'),
];

let seq = 0;
const novoId = (p: string) => `${p}-${Date.now().toString(36)}${(seq++).toString(36)}`;
const ev = (texto: string, msAtras: number, autor: string, tipo: EventoPort['tipo'] = 'sistema'): EventoPort =>
  ({ id: novoId('e'), quando: iso(msAtras), texto, tipo, autor });

function exemplo(
  id: string, clienteId: string, atendenteId: string, valorTotal: number, criadaHa: number,
  marcos: { aceite?: [Aceite, number]; desbloq?: number; envio?: number; feito?: number; concl?: number; notas?: [string, number][] } = {},
): Portabilidade {
  const autor = nomeAt(atendenteId);
  const eventos: EventoPort[] = [ev(`Entrou na aba com ${reais(valorTotal)}`, criadaHa, autor)];
  const p: Portabilidade = {
    id, clienteId, atendenteId, valorTotal, divisao: dividir(valorTotal), aceite: 'aguardando',
    criadaEm: iso(criadaHa), atualizadaEm: iso(criadaHa), eventos,
  };
  const marcar = (ha: number, texto: string, tipo: EventoPort['tipo'] = 'sistema') => {
    eventos.push(ev(texto, ha, autor, tipo));
    if (Date.now() - ha > new Date(p.atualizadaEm).getTime()) p.atualizadaEm = iso(ha);
  };
  if (marcos.aceite) {
    p.aceite = marcos.aceite[0]; p.aceiteEm = iso(marcos.aceite[1]);
    marcar(marcos.aceite[1], p.aceite === 'aceitou' ? 'Cliente aceitou a portabilidade' : 'Cliente não aceitou');
  }
  if (marcos.desbloq != null) { p.desbloqueadoEm = iso(marcos.desbloq); marcar(marcos.desbloq, 'Benefício desbloqueado'); }
  if (marcos.envio != null) { p.linkEnviadoEm = iso(marcos.envio); marcar(marcos.envio, 'Link enviado ao cliente'); }
  if (marcos.feito != null) { p.linkFeitoEm = iso(marcos.feito); marcar(marcos.feito, 'Cliente fez o link'); }
  if (marcos.concl != null) { p.concluidaEm = iso(marcos.concl); marcar(marcos.concl, 'Portabilidade concluída', 'concluida'); }
  for (const [t, ha] of marcos.notas ?? []) marcar(ha, t, 'nota');
  eventos.sort((a, b) => new Date(a.quando).getTime() - new Date(b.quando).getTime());
  return p;
}

function semente(): Portabilidade[] {
  return [
    // esperando o cliente aceitar
    exemplo('pt1', 'k1', 'u-matheus', 1_245_000, 3 * H, { notas: [['Mandei a proposta por áudio. Ficou de conversar com a filha.', 2 * H]] }),
    exemplo('pt2', 'k2', 'u-juliana', 780_000, 2 * DIA),
    // em andamento
    exemplo('pt3', 'k3', 'u-matheus', 1_630_000, 4 * DIA, { aceite: ['aceitou', 4 * DIA - 2 * H], desbloq: 2 * DIA, envio: DIA + 5 * H, feito: 6 * H }),
    exemplo('pt4', 'k5', 'u-matheus', 945_050, 3 * DIA, { aceite: ['aceitou', 3 * DIA - H], desbloq: DIA + 3 * H, envio: 20 * H,
      notas: [['Cliente disse que faz o link hoje à noite, com o neto.', 19 * H]] }),
    exemplo('pt5', 'k6', 'u-juliana', 2_210_000, 5 * DIA, { aceite: ['aceitou', 5 * DIA - 4 * H], envio: 2 * DIA, feito: DIA }),
    exemplo('pt6', 'k7', 'u-matheus', 560_000, DIA + 4 * H, { aceite: ['aceitou', DIA] }),
    exemplo('pt7', 'k8', 'u-luiz', 1_380_000, 6 * DIA, { aceite: ['aceitou', 6 * DIA - 3 * H], desbloq: 4 * DIA }),
    // concluídas
    exemplo('pt8', 'k9', 'u-matheus', 1_875_000, 12 * DIA, { aceite: ['aceitou', 12 * DIA - 2 * H], desbloq: 10 * DIA, envio: 9 * DIA, feito: 8 * DIA, concl: 5 * DIA }),
    exemplo('pt9', 'k10', 'u-juliana', 1_120_000, 9 * DIA, { aceite: ['aceitou', 9 * DIA - H], desbloq: 8 * DIA, envio: 7 * DIA, feito: 6 * DIA, concl: 2 * DIA }),
    // não aceitou
    exemplo('pt10', 'k11', 'u-matheus', 690_000, 7 * DIA, { aceite: ['recusou', 5 * DIA],
      notas: [['Achou o valor baixo. Prefere ficar no banco atual por enquanto.', 5 * DIA - 10 * MIN]] }),
  ];
}

/* ============================ store da demonstração ============================ */
interface Estado { portabilidades: Portabilidade[]; clientes: ClientePort[] }
let estado: Estado = { portabilidades: semente(), clientes: CLIENTES_DEMO };
const ouvintes = new Set<() => void>();
function set(f: (e: Estado) => Estado) { estado = f(estado); ouvintes.forEach((o) => o()); }
/** leitura fora do React (testes) */
export const estadoDemo = () => estado;
/** volta ao começo (testes) */
export const reiniciarDemo = () => set(() => ({ portabilidades: semente(), clientes: CLIENTES_DEMO }));
export function usePortDemo() {
  return useSyncExternalStore((o) => { ouvintes.add(o); return () => ouvintes.delete(o); }, () => estado);
}

const agoraIso = () => new Date().toISOString();
function mudar(id: string, texto: string | null, f: (p: Portabilidade) => Partial<Portabilidade>, tipo: EventoPort['tipo'] = 'sistema') {
  const p = estado.portabilidades.find((x) => x.id === id);
  if (!p) throw new Error('portabilidade_nao_encontrada');
  const quando = agoraIso();
  set((e) => ({
    ...e,
    portabilidades: e.portabilidades.map((x) => (x.id !== id ? x : {
      ...x, ...f(x), atualizadaEm: quando,
      eventos: texto ? [...x.eventos, { id: novoId('e'), quando, texto, tipo, autor: USUARIO_DEMO.nome }] : x.eventos,
    })),
  }));
}

/** ações da demonstração — MESMAS regras que o servidor vai seguir (demo = contrato) */
export const portAcoes = {
  criar(d: { clienteId: string; valorTotal: number; atendenteId: string }): string {
    if (!estado.clientes.some((c) => c.id === d.clienteId)) throw new Error('contato_invalido');
    if (!(d.valorTotal > 0)) throw new Error('valor_invalido');
    const id = novoId('pt');
    const quando = agoraIso();
    const p: Portabilidade = {
      id, clienteId: d.clienteId, atendenteId: d.atendenteId, valorTotal: d.valorTotal, divisao: dividir(d.valorTotal),
      aceite: 'aguardando', criadaEm: quando, atualizadaEm: quando,
      eventos: [{ id: novoId('e'), quando, texto: `Entrou na aba com ${reais(d.valorTotal)}`, tipo: 'sistema', autor: USUARIO_DEMO.nome }],
    };
    set((e) => ({ ...e, portabilidades: [p, ...e.portabilidades] }));
    return id;
  },
  /* = RPCs da migration 20261013170000 (mesmas travas, mesmos textos no histórico) */
  aceite(id: string, a: Aceite) {
    const p = estado.portabilidades.find((x) => x.id === id);
    if (p?.concluidaEm) throw new Error('portabilidade_concluida');
    if (p?.aceite === a) return; // = servidor: repetir não muda nada nem entra no histórico
    const texto = a === 'aceitou' ? 'Cliente aceitou a portabilidade' : a === 'recusou' ? 'Cliente não aceitou' : 'Voltou para "esperando o cliente aceitar"';
    mudar(id, texto, () => ({ aceite: a, aceiteEm: a === 'aguardando' ? undefined : agoraIso() }));
  },
  desbloqueio(id: string, feito: boolean) {
    const p = estado.portabilidades.find((x) => x.id === id);
    if (p && p.aceite !== 'aceitou') throw new Error('sem_aceite');
    if (p?.concluidaEm) throw new Error('portabilidade_concluida');
    if (p && !!p.desbloqueadoEm === feito) return;
    mudar(id, feito ? 'Benefício desbloqueado' : 'Desbloqueio do benefício desfeito', () => ({ desbloqueadoEm: feito ? agoraIso() : undefined }));
  },
  link(id: string, l: EstadoLink) {
    const p = estado.portabilidades.find((x) => x.id === id);
    if (p && p.aceite !== 'aceitou') throw new Error('sem_aceite');
    if (p?.concluidaEm) throw new Error('portabilidade_concluida');
    if (p && estadoLink(p) === l) return;
    const texto = l === 'enviado' ? (p?.linkFeitoEm ? 'Link voltou para "enviado, esperando o cliente"' : 'Link enviado ao cliente')
      : l === 'feito' ? 'Cliente fez o link' : 'Envio do link desfeito';
    mudar(id, texto, (x) => ({
      linkEnviadoEm: l === 'nao_enviado' ? undefined : x.linkEnviadoEm ?? agoraIso(),
      linkFeitoEm: l === 'feito' ? agoraIso() : undefined,
    }));
  },
  concluir(id: string) {
    const p = estado.portabilidades.find((x) => x.id === id);
    if (p?.concluidaEm) return;
    if (p && !podeConcluir(p)) throw new Error('etapas_pendentes');
    mudar(id, 'Portabilidade concluída', () => ({ concluidaEm: agoraIso() }), 'concluida');
  },
  reabrir(id: string) {
    if (!estado.portabilidades.find((x) => x.id === id)?.concluidaEm) return;
    mudar(id, 'Portabilidade reaberta', () => ({ concluidaEm: undefined }));
  },
  valor(id: string, total: number) {
    if (!(total > 0)) throw new Error('valor_invalido');
    const p = estado.portabilidades.find((x) => x.id === id);
    if (p?.concluidaEm) throw new Error('portabilidade_concluida');
    if (p && p.valorTotal === total) return;
    mudar(id, `Valor: ${reais(p?.valorTotal ?? 0)} → ${reais(total)}`, () => ({ valorTotal: total, divisao: dividir(total) }));
  },
  atendente(id: string, atendenteId: string) {
    const p = estado.portabilidades.find((x) => x.id === id);
    if (!p || p.atendenteId === atendenteId) return;
    mudar(id, `Atendente: ${nomeAt(p.atendenteId)} → ${nomeAt(atendenteId)}`, () => ({ atendenteId }));
  },
  anotar(id: string, texto: string) {
    const t = (texto ?? '').trim();
    if (!t) throw new Error('nota_vazia');
    mudar(id, t.slice(0, 500), () => ({}), 'nota');
  },
  excluir(id: string) {
    set((e) => ({ ...e, portabilidades: e.portabilidades.filter((p) => p.id !== id) }));
  },
};
