import { useEffect, useSyncExternalStore } from 'react';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured, isRevizaMode } from '@/lib/supabase';
import { useOrg } from '@/context/OrgContext';
import { useAuth } from '@/context/AuthContext';
import { temRecurso } from '@/v2/data/config/recursos';

/* ------------------------------------------------------------------
   CHAT DA EQUIPE no Atendimento (dono 25/11: a Reviza usava um "Chat Interno" no sistema de antes, com o
   número de não lidas no menu). Conversa entre colegas — de pessoa para pessoa ou em grupo —, só texto.
   Banco: migration 102 (atd_chat_salas, atd_chat_membros, atd_chat_msgs). Cada um só lê as conversas em
   que está; a lista vem de UMA rotina (atd_chat_minhas_salas) e o número do menu de outra, só a contagem
   (atd_chat_nao_lidas). Mensagem nova e leitura nova chegam pelo tempo real; sem ele, confere a cada 30 s.
   Um link de conversa de cliente (/whatsapp?conversa=<id>) dentro da mensagem vira um cartão "Conversa com …".
   DEMO É O CONTRATO: sem backend os mesmos hooks usam a conversa de exemplo abaixo (equipe inventada, nenhum
   cliente de verdade); na demonstração um colega responde uma vez, para a prévia parecer viva.
   ------------------------------------------------------------------ */

export const CHAT_REAL: boolean = isSupabaseConfigured && !!supabase;
/** o chat existe nesta instalação? (só na Reviza, com o recurso ligado — ver config/recursos.ts) */
export const chatEquipeLigado = (): boolean => isRevizaMode && temRecurso('chat-equipe');

export type TipoSala = 'direta' | 'grupo';
export interface MembroSala { id: string; nome: string; lidoAte: string | null }
export interface UltimaMsg { autorId: string | null; texto: string | null; apagada: boolean; criadoEm: string }
export interface SalaChat {
  id: string; tipo: TipoSala; nome: string | null; criadoEm: string; ultimaMsgEm: string | null;
  /** até quando EU li */
  lidoAte: string | null;
  membros: MembroSala[]; ultima: UltimaMsg | null; naoLidas: number;
}
export interface MsgChat { id: string; salaId: string; autorId: string | null; texto: string; criadoEm: string; editadoEm: string | null; apagada: boolean; pendente?: boolean }
export interface Colega { id: string; nome: string }
export const LIMITE_TEXTO = 4000;

/* ---------------- regras puras (testadas) ---------------- */
type B = Record<string, unknown>;
const o = (v: unknown): B => (v && typeof v === 'object' && !Array.isArray(v) ? (v as B) : {});
const a = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const t = (v: unknown, p = ''): string => (typeof v === 'string' ? v : v == null ? p : String(v));
const tn = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
const ms = (iso: string | null | undefined) => (iso ? new Date(iso).getTime() : NaN);

export function normalizarSalas(v: unknown): SalaChat[] {
  return a(v).map((x) => {
    const s = o(x); const u = s.ultima ? o(s.ultima) : null;
    return {
      id: t(s.id), tipo: (t(s.tipo) === 'grupo' ? 'grupo' : 'direta') as TipoSala, nome: tn(s.nome),
      criadoEm: t(s.criado_em), ultimaMsgEm: tn(s.ultima_msg_em), lidoAte: tn(s.lido_ate),
      membros: a(s.membros).map((m) => { const r = o(m); return { id: t(r.id), nome: t(r.nome, 'Colega'), lidoAte: tn(r.lido_ate) }; }),
      ultima: u && u.criado_em ? { autorId: tn(u.autor_id), texto: tn(u.texto), apagada: !!u.apagada, criadoEm: t(u.criado_em) } : null,
      naoLidas: Math.max(0, Number(s.nao_lidas) || 0),
    };
  }).filter((s) => s.id);
}
export const normalizarMsg = (r: unknown): MsgChat => {
  const m = o(r);
  return { id: t(m.id), salaId: t(m.sala_id), autorId: tn(m.autor_id), texto: t(m.texto), criadoEm: t(m.criado_em), editadoEm: tn(m.editado_em), apagada: !!m.apagada };
};

/** não lidas de uma conversa: mensagens de OUTRA pessoa depois da minha leitura (sem leitura, todas desde
 *  que entrei), sem as apagadas — a mesma regra da rotina do banco */
export function contarNaoLidas(msgs: readonly Pick<MsgChat, 'autorId' | 'criadoEm' | 'apagada'>[], euId: string, lidoAte: string | null, entrouEm?: string | null): number {
  const lido = ms(lidoAte), entrou = ms(entrouEm);
  return msgs.filter((m) => {
    if (m.apagada || m.autorId === euId) return false;
    const q = ms(m.criadoEm);
    return Number.isFinite(lido) ? q > lido : Number.isFinite(entrou) ? q >= entrou : true;
  }).length;
}
export const totalNaoLidas = (salas: readonly Pick<SalaChat, 'naoLidas'>[]): number => salas.reduce((s, x) => s + (x.naoLidas || 0), 0);

/** o colega da conversa de pessoa para pessoa */
export const outroDaDireta = (s: Pick<SalaChat, 'tipo' | 'membros'>, euId: string | null): MembroSala | null =>
  s.tipo === 'direta' ? s.membros.find((m) => m.id !== euId) ?? null : null;
export function nomeDaSala(s: Pick<SalaChat, 'tipo' | 'nome' | 'membros'>, euId: string | null): string {
  if (s.tipo === 'grupo') return s.nome?.trim() || 'Grupo';
  return outroDaDireta(s, euId)?.nome || 'Colega';
}
export function iniciais(nome: string): string {
  const l = nome.trim().split(/\s+/).map((p) => p.match(/\p{L}/u)?.[0] ?? '').filter(Boolean);
  return (l[0] ?? '?').toUpperCase() + (l.length > 1 ? l[l.length - 1].toUpperCase() : '');
}
const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
/** busca da lista: pelo nome da conversa e pelo nome das pessoas dela */
export function filtrarSalas<S extends Pick<SalaChat, 'tipo' | 'nome' | 'membros'>>(salas: readonly S[], termo: string, euId: string | null): S[] {
  const q = semAcento(termo.trim());
  if (!q) return [...salas];
  return salas.filter((s) => semAcento(nomeDaSala(s, euId)).includes(q) || s.membros.some((m) => m.id !== euId && semAcento(m.nome).includes(q)));
}

/* datas no horário de Brasília */
const FMT_DIA = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' });
const FMT_HORA = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
export const diaSP = (iso: string): string => FMT_DIA.format(new Date(iso));
export const horaSP = (iso: string): string => FMT_HORA.format(new Date(iso));
const somaDia = (dia: string, n: number) => { const d = new Date(`${dia}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const SEMANA = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const SEMANA_CURTA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
/** o separador de dia na conversa: Hoje, Ontem ou "segunda-feira, 23 de novembro" (com o ano quando é outro) */
export function rotuloDia(dia: string, hoje: string): string {
  if (dia === hoje) return 'Hoje';
  if (dia === somaDia(hoje, -1)) return 'Ontem';
  const d = new Date(`${dia}T12:00:00Z`);
  const ano = dia.slice(0, 4) !== hoje.slice(0, 4) ? ` de ${dia.slice(0, 4)}` : '';
  return `${SEMANA[d.getUTCDay()]}, ${d.getUTCDate()} de ${MESES[d.getUTCMonth()]}${ano}`;
}
/** a hora na lista de conversas: hoje → 14:05; ontem → Ontem; nesta semana → qua; antes → 18/11 */
export function quandoNaLista(iso: string | null, agora = new Date()): string {
  if (!iso) return '';
  const dia = diaSP(iso), hoje = diaSP(agora.toISOString());
  if (dia === hoje) return horaSP(iso);
  if (dia === somaDia(hoje, -1)) return 'Ontem';
  if (dia > somaDia(hoje, -7)) return SEMANA_CURTA[new Date(`${dia}T12:00:00Z`).getUTCDay()];
  return `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
}

export interface MsgNaTela extends MsgChat { /** mesma pessoa da anterior, há menos de 5 min: sem repetir o nome */ continua: boolean }
export interface DiaDeMsgs { dia: string; rotulo: string; msgs: MsgNaTela[] }
/** as mensagens separadas por dia (em ordem), cada uma sabendo se continua o bloco da anterior */
export function agruparPorDia(msgs: readonly MsgChat[], hoje: string): DiaDeMsgs[] {
  const ordem = [...msgs].sort((x, y) => ms(x.criadoEm) - ms(y.criadoEm));
  const dias: DiaDeMsgs[] = [];
  let ant: MsgChat | null = null;
  for (const m of ordem) {
    const dia = diaSP(m.criadoEm);
    let g = dias[dias.length - 1];
    if (!g || g.dia !== dia) { g = { dia, rotulo: rotuloDia(dia, hoje), msgs: [] }; dias.push(g); ant = null; }
    const continua = !!ant && ant.autorId === m.autorId && ms(m.criadoEm) - ms(ant.criadoEm) < 5 * 60_000;
    g.msgs.push({ ...m, continua });
    ant = m;
  }
  return dias;
}

/** "Visto" / "Enviada" na conversa de pessoa para pessoa: só debaixo da MINHA última mensagem, quando ela é a
 *  última da conversa (depois que o colega responde, a resposta já diz que ele viu) */
export function situacaoDaMinhaUltima(s: Pick<SalaChat, 'tipo' | 'membros'>, msgs: readonly MsgChat[], euId: string | null): { msgId: string; visto: boolean } | null {
  if (s.tipo !== 'direta' || !euId || !msgs.length) return null;
  const ult = [...msgs].sort((x, y) => ms(x.criadoEm) - ms(y.criadoEm))[msgs.length - 1];
  if (ult.autorId !== euId || ult.pendente) return null;
  const outro = outroDaDireta(s, euId);
  return { msgId: ult.id, visto: !!outro?.lidoAte && ms(outro.lidoAte) >= ms(ult.criadoEm) };
}

/* link de conversa de cliente dentro do texto: o endereço do sistema, o da prévia (#/whatsapp…) ou só o caminho */
const RE_LINK_CONVERSA = /(?:(?:https?:\/\/|file:\/\/)\S*?)?#?\/whatsapp\?(?:[^\s#]*?&)?conversa=([A-Za-z0-9_-]+)(?:&[^\s#]*)?/g;
export type ParteTexto = { tipo: 'texto'; texto: string } | { tipo: 'conversa'; id: string; link: string };
export function partesDoTexto(texto: string): ParteTexto[] {
  const partes: ParteTexto[] = [];
  let i = 0;
  for (const m of texto.matchAll(RE_LINK_CONVERSA)) {
    const ini = m.index ?? 0;
    if (ini > i) partes.push({ tipo: 'texto', texto: texto.slice(i, ini) });
    partes.push({ tipo: 'conversa', id: m[1], link: m[0] });
    i = ini + m[0].length;
  }
  if (i < texto.length) partes.push({ tipo: 'texto', texto: texto.slice(i) });
  return partes;
}
export const conversasNoTexto = (texto: string): string[] => [...new Set(partesDoTexto(texto).flatMap((p) => (p.tipo === 'conversa' ? [p.id] : [])))];
/** a prévia da última mensagem na lista: o link vira "Conversa de cliente" */
export function previaDoTexto(texto: string | null, apagada = false): string {
  if (apagada) return 'Mensagem apagada';
  if (!texto) return '';
  return partesDoTexto(texto).map((p) => (p.tipo === 'texto' ? p.texto : 'Conversa de cliente')).join('').replace(/\s+/g, ' ').trim();
}

const MSG_ERRO: Record<string, string> = {
  sem_sessao: 'Sua sessão terminou. Entre de novo.',
  pessoa_invalida: 'Escolha um colega para conversar.',
  fora_da_empresa: 'Essa pessoa não está mais no Atendimento.',
  pessoa_fora_da_empresa: 'Alguém da lista não está mais no Atendimento. Tire essa pessoa e tente de novo.',
  nome_invalido: 'Dê um nome ao grupo (até 80 letras).',
  poucas_pessoas: 'Escolha pelo menos um colega para o grupo.',
  pessoas_demais: 'O grupo pode ter até 100 pessoas.',
};
export const traduzErroChat = (e: unknown): string => {
  const m = (e as Error)?.message || String(e ?? '');
  const cod = Object.keys(MSG_ERRO).find((k) => m.includes(k));
  return cod ? MSG_ERRO[cod] : 'Não foi possível agora. Confira a internet e tente de novo.';
};

/* ---------------- demonstração (equipe inventada, nada de cliente de verdade) ---------------- */
export const EU_DEMO = 'eu';
export const COLEGAS_DEMO: Colega[] = [
  { id: 'demo-alexandra', nome: 'Alexandra' }, { id: 'demo-emillyn', nome: 'Emillyn' }, { id: 'demo-felipe', nome: 'Felipe' },
  { id: 'demo-guilherme', nome: 'Guilherme' }, { id: 'demo-juliano', nome: 'Juliano' }, { id: 'demo-rafael', nome: 'Rafael' },
  { id: 'demo-raissa', nome: 'Raissa' },
];
/** os clientes das conversas de exemplo do WhatsApp da prévia (os mesmos nomes inventados de lá) */
const CONVERSAS_DEMO: Record<string, string> = {
  'wa-maria': 'Maria Aparecida Souza', 'wa-jose': 'José Carlos Ferreira', 'wa-ivone': 'Ivone Castro dos Santos',
  'wa-antonio': 'Antônio Pereira Lima', 'wa-terezinha': 'Terezinha M. Alves', 'wa-sebastiao': 'Sebastião R. Nunes',
};
interface SalaDemo { id: string; tipo: TipoSala; nome: string | null; criadoEm: string; membros: { id: string; lidoAte: string | null; entrouEm: string }[] }
interface BancoDemo { salas: SalaDemo[]; msgs: MsgChat[]; respondidas: Set<string>; seq: number }
let bancoDemo: BancoDemo | null = null;
const ouvintesDemo = new Set<() => void>();
const avisarDemo = () => { ouvintesDemo.forEach((f) => f()); };
const nomeColega = (id: string) => (id === EU_DEMO ? 'Você' : COLEGAS_DEMO.find((c) => c.id === id)?.nome ?? 'Colega');

function semearDemo(agora = Date.now()): BancoDemo {
  const ha = (min: number) => new Date(agora - min * 60_000).toISOString();
  const membros = (ids: string[], lidos: Record<string, number | null>, entrou: number) =>
    ids.map((id) => ({ id, lidoAte: lidos[id] == null ? null : ha(lidos[id] as number), entrouEm: ha(entrou) }));
  const salas: SalaDemo[] = [
    { id: 'sala-alexandra', tipo: 'direta', nome: null, criadoEm: ha(60 * 24 * 20), membros: membros([EU_DEMO, 'demo-alexandra'], { eu: 60 * 47, 'demo-alexandra': 24 }, 60 * 24 * 20) },
    { id: 'sala-comercial', tipo: 'grupo', nome: 'Comercial', criadoEm: ha(60 * 24 * 30), membros: membros([EU_DEMO, 'demo-guilherme', 'demo-raissa', 'demo-felipe', 'demo-emillyn'], { eu: 60 * 20, 'demo-guilherme': 5, 'demo-raissa': 9, 'demo-felipe': 30, 'demo-emillyn': 31 }, 60 * 24 * 30) },
    { id: 'sala-guilherme', tipo: 'direta', nome: null, criadoEm: ha(60 * 24 * 12), membros: membros([EU_DEMO, 'demo-guilherme'], { eu: 95, 'demo-guilherme': 95 }, 60 * 24 * 12) },
    { id: 'sala-documentacao', tipo: 'grupo', nome: 'Documentação', criadoEm: ha(60 * 24 * 40), membros: membros([EU_DEMO, 'demo-juliano', 'demo-rafael', 'demo-alexandra'], { eu: 60 * 24 * 2, 'demo-juliano': 60 * 24 * 3, 'demo-rafael': 60 * 24 * 2, 'demo-alexandra': 60 * 24 * 2 }, 60 * 24 * 40) },
    { id: 'sala-rafael', tipo: 'direta', nome: null, criadoEm: ha(60 * 24 * 9), membros: membros([EU_DEMO, 'demo-rafael'], { eu: 60 * 24 * 6, 'demo-rafael': 60 * 24 * 7 }, 60 * 24 * 9) },
  ];
  let n = 0;
  const m = (salaId: string, autorId: string, min: number, texto: string): MsgChat => ({ id: `demo-m${++n}`, salaId, autorId, texto, criadoEm: ha(min), editadoEm: null, apagada: false });
  const msgs: MsgChat[] = [
    m('sala-alexandra', 'demo-alexandra', 60 * 48, 'Bom dia! Tu conseguiu ver se o contrato do seu Valdir chegou?'),
    m('sala-alexandra', EU_DEMO, 60 * 47, 'Chegou sim, já deixei na pasta dele.'),
    m('sala-alexandra', 'demo-alexandra', 26, 'Alguém pode atender a dona Iracema? Ela mandou o RG'),
    m('sala-alexandra', 'demo-alexandra', 25, 'Tô numa ligação longa aqui, não consigo responder agora'),
    m('sala-comercial', 'demo-guilherme', 60 * 23, 'Pessoal, reunião amanhã às 9h para alinhar as metas da semana'),
    m('sala-comercial', 'demo-raissa', 60 * 22.9, 'Combinado'),
    m('sala-comercial', EU_DEMO, 60 * 22, 'Estarei lá'),
    m('sala-comercial', 'demo-felipe', 32, 'Fechei mais um contrato agora de manhã!'),
    m('sala-comercial', 'demo-emillyn', 31, 'Boa, Felipe!'),
    m('sala-comercial', 'demo-raissa', 12, 'Quem ficou com a cliente que veio pelo anúncio de juros? Ela perguntou do retorno'),
    m('sala-guilherme', EU_DEMO, 110, 'Guilherme, deixei a conversa dela pronta para ti: /whatsapp?conversa=wa-maria'),
    m('sala-guilherme', 'demo-guilherme', 96, 'Valeu! Já vou chamar ela.'),
    m('sala-documentacao', 'demo-juliano', 60 * 24 * 3, 'Lembrando: comprovante de residência tem que ser dos últimos 3 meses'),
    m('sala-documentacao', 'demo-alexandra', 60 * 24 * 2.9, 'Anotado. E a conta de luz no nome do filho vale?'),
    m('sala-documentacao', 'demo-juliano', 60 * 24 * 2.8, 'Vale, junto com a declaração de residência assinada'),
    m('sala-rafael', 'demo-rafael', 60 * 24 * 7, 'Me passa o número do suporte do banco depois?'),
    m('sala-rafael', EU_DEMO, 60 * 24 * 6, 'Mando sim, está na lista de telefones da sala'),
  ];
  return { salas, msgs, respondidas: new Set(), seq: n };
}
const demo = (): BancoDemo => (bancoDemo ??= semearDemo());
function salaDemoParaTela(s: SalaDemo, b: BancoDemo): SalaChat {
  const doc = b.msgs.filter((x) => x.salaId === s.id).sort((x, y) => ms(x.criadoEm) - ms(y.criadoEm));
  const eu = s.membros.find((x) => x.id === EU_DEMO);
  const ult = doc[doc.length - 1];
  return {
    id: s.id, tipo: s.tipo, nome: s.nome, criadoEm: s.criadoEm, ultimaMsgEm: ult?.criadoEm ?? null, lidoAte: eu?.lidoAte ?? null,
    membros: s.membros.map((x) => ({ id: x.id, nome: nomeColega(x.id), lidoAte: x.lidoAte })).sort((x, y) => x.nome.localeCompare(y.nome)),
    ultima: ult ? { autorId: ult.autorId, texto: ult.texto, apagada: ult.apagada, criadoEm: ult.criadoEm } : null,
    naoLidas: contarNaoLidas(doc, EU_DEMO, eu?.lidoAte ?? null, eu?.entrouEm),
  };
}
const RESPOSTAS_DEMO = ['Pode deixar, já vejo isso.', 'Combinado, obrigado por avisar!', 'Beleza! Te retorno em seguida.', 'Certo, vou falar com ela agora.'];
export const demoChat = {
  ouvir(f: () => void) { ouvintesDemo.add(f); return () => { ouvintesDemo.delete(f); }; },
  salas(): SalaChat[] {
    const b = demo();
    return b.salas.map((s) => salaDemoParaTela(s, b)).sort((x, y) => ms(y.ultimaMsgEm ?? y.criadoEm) - ms(x.ultimaMsgEm ?? x.criadoEm));
  },
  naoLidas(): number { return totalNaoLidas(demoChat.salas()); },
  msgs(salaId: string): MsgChat[] { return demo().msgs.filter((m) => m.salaId === salaId).sort((x, y) => ms(x.criadoEm) - ms(y.criadoEm)); },
  marcarLida(salaId: string) {
    const b = demo(); const s = b.salas.find((x) => x.id === salaId); const eu = s?.membros.find((x) => x.id === EU_DEMO);
    const ult = demoChat.msgs(salaId).pop();
    if (!eu || !ult || (eu.lidoAte && ms(eu.lidoAte) >= ms(ult.criadoEm))) return;
    eu.lidoAte = ult.criadoEm; avisarDemo();
  },
  enviar(salaId: string, texto: string): MsgChat {
    const b = demo(); const s = b.salas.find((x) => x.id === salaId);
    if (!s) throw new Error('Essa conversa não existe mais.');
    const agora = new Date().toISOString();
    const msg: MsgChat = { id: `demo-m${++b.seq}`, salaId, autorId: EU_DEMO, texto, criadoEm: agora, editadoEm: null, apagada: false };
    b.msgs.push(msg);
    const eu = s.membros.find((x) => x.id === EU_DEMO); if (eu) eu.lidoAte = agora;
    avisarDemo();
    // um colega responde UMA vez por conversa (só na demonstração): primeiro lê, depois escreve
    if (!b.respondidas.has(salaId)) {
      b.respondidas.add(salaId);
      const outros = s.membros.filter((x) => x.id !== EU_DEMO);
      const quem = outros[b.respondidas.size % outros.length] ?? outros[0];
      if (quem) {
        setTimeout(() => { quem.lidoAte = new Date().toISOString(); avisarDemo(); }, 1200);
        setTimeout(() => {
          const quando = new Date().toISOString();
          b.msgs.push({ id: `demo-m${++b.seq}`, salaId, autorId: quem.id, texto: RESPOSTAS_DEMO[b.respondidas.size % RESPOSTAS_DEMO.length], criadoEm: quando, editadoEm: null, apagada: false });
          quem.lidoAte = quando; avisarDemo();
        }, 3200);
      }
    }
    return msg;
  },
  abrirDireta(outroId: string): string {
    const b = demo();
    const ja = b.salas.find((s) => s.tipo === 'direta' && s.membros.some((x) => x.id === outroId) && s.membros.some((x) => x.id === EU_DEMO));
    if (ja) return ja.id;
    const agora = new Date().toISOString();
    const id = `sala-nova-${++b.seq}`;
    b.salas.push({ id, tipo: 'direta', nome: null, criadoEm: agora, membros: [EU_DEMO, outroId].map((x) => ({ id: x, lidoAte: null, entrouEm: agora })) });
    avisarDemo();
    return id;
  },
  criarGrupo(nome: string, ids: string[]): string {
    const b = demo(); const n = nome.trim();
    if (!n || n.length > 80) throw new Error('nome_invalido');
    const lista = [...new Set([EU_DEMO, ...ids])];
    if (lista.length < 2) throw new Error('poucas_pessoas');
    const agora = new Date().toISOString();
    const id = `sala-nova-${++b.seq}`;
    b.salas.push({ id, tipo: 'grupo', nome: n, criadoEm: agora, membros: lista.map((x) => ({ id: x, lidoAte: null, entrouEm: agora })) });
    avisarDemo();
    return id;
  },
  /** só para os testes: recomeça a demonstração */
  reiniciar(agora?: number) { bancoDemo = semearDemo(agora); avisarDemo(); },
};

/* ---------------- tempo real (um canal só para o app inteiro: o menu e a tela dividem) ---------------- */
type EstadoAoVivo = 'desligado' | 'conectando' | 'ok' | 'falhou';
type Inscricao = { qc: QueryClient; org: string };
const aoVivo = {
  usos: 0, org: '', canal: null as RealtimeChannel | null, offDemo: null as (() => void) | null, estado: 'desligado' as EstadoAoVivo,
  inscritos: new Set<Inscricao>(), estadoMudou: new Set<() => void>(), espera: 0 as ReturnType<typeof setTimeout> | 0,
};
const definirEstado = (e: EstadoAoVivo) => { if (aoVivo.estado !== e) { aoVivo.estado = e; aoVivo.estadoMudou.forEach((f) => f()); } };
/** várias mudanças juntas (a mensagem e a leitura de quem escreveu) = UMA releitura, uma vez por app (não por tela) */
const avisarMudanca = () => {
  if (aoVivo.espera) return;
  aoVivo.espera = setTimeout(() => {
    aoVivo.espera = 0;
    const feitos: Inscricao[] = [];
    aoVivo.inscritos.forEach((x) => {
      if (feitos.some((f) => f.qc === x.qc && f.org === x.org)) return;
      feitos.push(x);
      void x.qc.invalidateQueries({ queryKey: ['chat-equipe', x.org] });
    });
  }, 150);
};
function ligar(org: string) {
  aoVivo.org = org;
  if (!CHAT_REAL || !supabase) { aoVivo.offDemo = demoChat.ouvir(avisarMudanca); return; }
  definirEstado('conectando');
  const ch: RealtimeChannel = supabase.channel(`chat-equipe-${org}`);
  const deste = (f: () => void) => { if (aoVivo.canal === ch) f(); }; // aviso atrasado de um canal já fechado não vale
  let recusado = false;
  aoVivo.canal = ch
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'atd_chat_msgs', filter: `organizacao_id=eq.${org}` }, avisarMudanca)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'atd_chat_membros' }, avisarMudanca)
    // tabela fora da publicação derruba o pedido inteiro em silêncio (o canal diz SUBSCRIBED): o aviso vem pelo 'system'
    .on('system', {}, (p: { status?: string }) => { if (p?.status === 'error') deste(() => { recusado = true; definirEstado('falhou'); }); })
    .subscribe((st) => deste(() => definirEstado(st === 'SUBSCRIBED' ? (recusado ? 'falhou' : 'ok') : st === 'CHANNEL_ERROR' || st === 'TIMED_OUT' || st === 'CLOSED' ? 'falhou' : 'conectando')));
}
function desligar() {
  aoVivo.offDemo?.(); aoVivo.offDemo = null;
  if (aoVivo.canal && supabase) void supabase.removeChannel(aoVivo.canal);
  aoVivo.canal = null; aoVivo.org = ''; definirEstado('desligado');
}
const ouvirEstado = (f: () => void) => { aoVivo.estadoMudou.add(f); return () => { aoVivo.estadoMudou.delete(f); }; };
const lerEstado = () => aoVivo.estado;

/** liga a escuta das mudanças do chat (tempo real; na demonstração, a conversa de exemplo) — UM canal para o app
 *  inteiro, dividido entre o menu e a tela. Devolve se o tempo real está de pé: sem ele, as consultas conferem
 *  sozinhas a cada 30 s */
export function useChatAoVivo(ativo: boolean): boolean {
  const { currentOrg } = useOrg();
  const qc = useQueryClient();
  const org = currentOrg.id;
  useEffect(() => {
    if (!ativo || !org) return;
    const eu: Inscricao = { qc, org };
    aoVivo.inscritos.add(eu);
    if (aoVivo.usos++ === 0 || aoVivo.org !== org) { desligar(); ligar(org); }
    return () => {
      aoVivo.inscritos.delete(eu);
      if (--aoVivo.usos <= 0) { aoVivo.usos = 0; desligar(); }
    };
  }, [ativo, org, qc]);
  const estado = useSyncExternalStore(ouvirEstado, lerEstado, lerEstado);
  return !CHAT_REAL || estado === 'ok';
}

/* ---------------- consultas ---------------- */
/** quem sou eu no chat (na demonstração, a pessoa da prévia é "eu") */
export function useEuChat(): string | null {
  const { user } = useAuth();
  return CHAT_REAL ? user?.id ?? null : EU_DEMO;
}

/** o número do menu: só a contagem (uma consulta leve) + o tempo real */
export function useChatNaoLidas(ativo: boolean) {
  const { currentOrg } = useOrg();
  const vivo = useChatAoVivo(ativo);
  return useQuery({
    queryKey: ['chat-equipe', currentOrg.id, 'nao-lidas'],
    enabled: ativo && !!currentOrg.id,
    refetchInterval: ativo && !vivo ? 30_000 : false,
    staleTime: 15_000,
    queryFn: async (): Promise<number> => {
      if (!CHAT_REAL) return demoChat.naoLidas();
      const { data, error } = await supabase!.rpc('atd_chat_nao_lidas');
      if (error) throw new Error(error.message);
      return Math.max(0, Number(data) || 0);
    },
  });
}

export function useChatSalas() {
  const { currentOrg } = useOrg();
  const vivo = useChatAoVivo(true);
  return useQuery({
    queryKey: ['chat-equipe', currentOrg.id, 'salas'],
    enabled: !!currentOrg.id,
    refetchInterval: vivo ? false : 30_000,
    queryFn: async (): Promise<SalaChat[]> => {
      if (!CHAT_REAL) return demoChat.salas();
      const { data, error } = await supabase!.rpc('atd_chat_minhas_salas');
      if (error) throw new Error(error.message);
      return normalizarSalas(data);
    },
  });
}

export function useChatMsgs(salaId: string | null) {
  const { currentOrg } = useOrg();
  const vivo = useChatAoVivo(!!salaId);
  return useQuery({
    queryKey: ['chat-equipe', currentOrg.id, 'msgs', salaId],
    enabled: !!salaId && !!currentOrg.id,
    refetchInterval: vivo ? false : 15_000,
    queryFn: async (): Promise<MsgChat[]> => {
      if (!CHAT_REAL) return demoChat.msgs(salaId!);
      const { data, error } = await supabase!.from('atd_chat_msgs')
        .select('id, sala_id, autor_id, texto, criado_em, editado_em, apagada')
        .eq('sala_id', salaId!).order('criado_em', { ascending: false }).limit(300);
      if (error) throw new Error(error.message);
      return ((data as unknown[]) ?? []).map(normalizarMsg).reverse();
    },
  });
}

/** os colegas ativos do Atendimento (para começar conversa), sem eu */
export function useColegasChat(ativo = true) {
  const { currentOrg } = useOrg();
  const eu = useEuChat();
  return useQuery({
    queryKey: ['chat-equipe', currentOrg.id, 'colegas', eu],
    enabled: ativo && !!currentOrg.id,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Colega[]> => {
      if (!CHAT_REAL) return COLEGAS_DEMO;
      const { data, error } = await supabase!.from('organizacao_usuarios').select('usuarios(id, nome)')
        .eq('organizacao_id', currentOrg.id).eq('status', 'ativo');
      if (error) throw new Error(error.message);
      type Linha = { usuarios: Colega | Colega[] | null };
      return ((data as unknown as Linha[]) ?? [])
        .map((r) => (Array.isArray(r.usuarios) ? r.usuarios[0] : r.usuarios))
        .filter((u): u is Colega => !!u && u.id !== eu)
        .map((u) => ({ id: u.id, nome: u.nome || 'Colega' }))
        .sort((x, y) => x.nome.localeCompare(y.nome));
    },
  });
}

/** o nome do cliente dos links de conversa (só os que a pessoa pode ver; os outros ficam "Conversa de cliente") */
export function useNomesConversas(ids: string[]) {
  const { currentOrg } = useOrg();
  const chave = [...new Set(ids)].sort();
  return useQuery({
    queryKey: ['chat-equipe', currentOrg.id, 'conversas-citadas', chave.join(',')],
    enabled: chave.length > 0,
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<Record<string, string>> => {
      if (!CHAT_REAL) return Object.fromEntries(chave.filter((id) => CONVERSAS_DEMO[id]).map((id) => [id, CONVERSAS_DEMO[id]]));
      const uuids = chave.filter((id) => /^[0-9a-f-]{36}$/i.test(id));
      if (!uuids.length) return {};
      const { data, error } = await supabase!.from('conversas').select('id, contatos(nome)').in('id', uuids);
      if (error) return {};
      type Linha = { id: string; contatos: { nome: string | null } | { nome: string | null }[] | null };
      return Object.fromEntries(((data as unknown as Linha[]) ?? []).flatMap((r) => {
        const c = Array.isArray(r.contatos) ? r.contatos[0] : r.contatos;
        return c?.nome ? [[r.id, c.nome]] : [];
      }));
    },
  });
}

/* ---------------- ações ---------------- */
export function useEnviarChat() {
  const { currentOrg } = useOrg();
  const qc = useQueryClient();
  const eu = useEuChat();
  const org = currentOrg.id;
  return useMutation({
    mutationFn: async (v: { salaId: string; texto: string }): Promise<MsgChat> => {
      const texto = v.texto.trim().slice(0, LIMITE_TEXTO);
      if (!texto) throw new Error('vazio');
      if (!CHAT_REAL) return demoChat.enviar(v.salaId, texto);
      if (!eu) throw new Error('sem_sessao');
      const { data, error } = await supabase!.from('atd_chat_msgs').insert({ sala_id: v.salaId, autor_id: eu, texto })
        .select('id, sala_id, autor_id, texto, criado_em, editado_em, apagada').single();
      if (error) throw new Error(error.message);
      return normalizarMsg(data);
    },
    // aparece na hora (cinza até o banco confirmar)
    onMutate: async (v) => {
      if (!CHAT_REAL) return;
      const chave = ['chat-equipe', org, 'msgs', v.salaId];
      await qc.cancelQueries({ queryKey: chave });
      const provisoria: MsgChat = { id: `envio-${Date.now()}`, salaId: v.salaId, autorId: eu, texto: v.texto.trim(), criadoEm: new Date().toISOString(), editadoEm: null, apagada: false, pendente: true };
      qc.setQueryData<MsgChat[]>(chave, (l) => [...(l ?? []), provisoria]);
      return { provisoria };
    },
    onError: (_e, v, ctx) => {
      if (ctx?.provisoria) qc.setQueryData<MsgChat[]>(['chat-equipe', org, 'msgs', v.salaId], (l) => (l ?? []).filter((m) => m.id !== ctx.provisoria.id));
    },
    onSuccess: (msg, v, ctx) => {
      if (ctx?.provisoria) qc.setQueryData<MsgChat[]>(['chat-equipe', org, 'msgs', v.salaId], (l) => (l ?? []).map((m) => (m.id === ctx.provisoria.id ? msg : m)));
    },
    onSettled: (_r, _e, v) => {
      void qc.invalidateQueries({ queryKey: ['chat-equipe', org, 'msgs', v.salaId] });
      void qc.invalidateQueries({ queryKey: ['chat-equipe', org, 'salas'] });
    },
  });
}

export function useMarcarLidaChat() {
  const { currentOrg } = useOrg();
  const qc = useQueryClient();
  const org = currentOrg.id;
  return useMutation({
    mutationFn: async (salaId: string) => {
      if (!CHAT_REAL) { demoChat.marcarLida(salaId); return; }
      const { error } = await supabase!.rpc('atd_chat_marcar_lida', { p_sala: salaId });
      if (error) throw new Error(error.message);
    },
    onSuccess: (_r, salaId) => {
      qc.setQueryData<SalaChat[]>(['chat-equipe', org, 'salas'], (l) => l?.map((s) => (s.id === salaId ? { ...s, naoLidas: 0 } : s)));
      void qc.invalidateQueries({ queryKey: ['chat-equipe', org, 'nao-lidas'] });
    },
  });
}

export function useAbrirDireta() {
  const { currentOrg } = useOrg();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (outroId: string): Promise<string> => {
      if (!CHAT_REAL) return demoChat.abrirDireta(outroId);
      const { data, error } = await supabase!.rpc('atd_chat_abrir_direta', { p_outro: outroId });
      if (error) throw new Error(error.message);
      return String(data);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['chat-equipe', currentOrg.id, 'salas'] }),
  });
}

export function useCriarGrupo() {
  const { currentOrg } = useOrg();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { nome: string; membros: string[] }): Promise<string> => {
      if (!CHAT_REAL) return demoChat.criarGrupo(v.nome, v.membros);
      const { data, error } = await supabase!.rpc('atd_chat_criar_grupo', { p_nome: v.nome.trim(), p_membros: v.membros });
      if (error) throw new Error(error.message);
      return String(data);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['chat-equipe', currentOrg.id, 'salas'] }),
  });
}
