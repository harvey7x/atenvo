/* ============================================================================
   RECADO DO GESTOR PARA O ATENDENTE (dono 12/11: "uma parte para mim notificar o atendente de
   responder o cliente, que eu consiga colocar uma mensagem pra ele… apareça pra ele responder ou
   repassar o cliente, aí tem que mostrar a resposta dele pra gente").
   - O administrador escreve o recado na ficha do cliente (Fila da Iris) → vai para o DONO do cliente
     pela regra da fila (o mesmo que a ficha mostra).
   - O atendente vê o RECADO DO ADMINISTRADOR no meio da tela, em qualquer página (dono 12/11: "coloca
     como recado do ADMINISTRADOR, quero que apareça no meio da tela"): Responder o cliente · Repassar
     (a um colega ou de volta para o administrador decidir, com o motivo) · responder por escrito.
     O nome de quem mandou não aparece para o atendente: é "o administrador". Repassou a um colega: o
     colega recebe o MESMO recado do administrador, com "repassado pela Juliana".
   - O administrador vê a resposta (cartão + lista "Recados para a equipe"). "Respondeu o cliente" vem
     sozinho: a primeira mensagem do próprio atendente (painel ou celular) ao cliente depois do recado.
   Duas fontes com a MESMA cara: a local (aqui — demonstração e prévia; tudo na página) e a real
   (recadosReal.ts — banco, migration 20261112130000_recados_gestor.sql).
   ============================================================================ */
import { useMemo, useSyncExternalStore } from 'react';

export type EstadoRecado = 'aguardando' | 'respondeu_cliente' | 'respondido' | 'repassado' | 'devolvido' | 'mudou' | 'encerrado';

export interface Recado {
  id: string;
  /** quem mandou (no real: o id do usuário; na prévia: o id da equipe) */
  de: string;
  deNome: string;
  /** para quem foi (o dono do cliente quando o recado saiu) */
  para: string;
  paraNome: string;
  contatoId: string;
  conversaId?: string;
  cliente: string;
  mensagem: string;
  criadoEm: number;
  /** o atendente viu o cartão */
  vistoEm?: number;
  /** a primeira mensagem do atendente ao cliente depois do recado */
  clienteRespondidoEm?: number;
  /** o que o atendente escreveu de volta (responder ou motivo do repasse/devolução) */
  resposta?: string;
  respondidoEm?: number;
  /** repassou: para quem (vazio + devolvido = devolveu para o administrador decidir) */
  repassadoPara?: string;
  repassadoParaNome?: string;
  devolvido?: boolean;
  /** o administrador viu a resposta */
  gestorVistoEm?: number;
  /** veio do administrador (sempre, no banco de hoje) */
  deAdmin?: boolean;
  /** nasceu de um repasse: quem repassou e por quê (o recado do administrador seguiu junto) */
  origemId?: string;
  repassadoPorNome?: string;
  repasseMotivo?: string;
  /** o cliente continua com o destinatário (falso: saiu dele por outro caminho; a tela não cobra mais) */
  aindaDono?: boolean;
  /** encerrado sem ação do atendente (o motivo) */
  encerrado?: string;
}

/** quem mandou, como o atendente lê: "o administrador" (ou, num recado antigo, o colega) */
export function remetente(r: Pick<Recado, 'deAdmin' | 'deNome'>): { marca: string; nome: string; artigo: 'o' | 'a' } {
  if (r.deAdmin !== false) return { marca: 'Recado do administrador', nome: 'administrador', artigo: 'o' };
  const primeiro = r.deNome.split(/\s+/)[0] ?? r.deNome;
  const ela = /a$/i.test(primeiro);
  return { marca: `Recado ${ela ? 'da' : 'do'} ${primeiro}`, nome: primeiro, artigo: ela ? 'a' : 'o' };
}

/** o estado de agora (encerrado, repasse e devolução mandam; depois a resposta escrita; depois "respondeu o
    cliente"; sem nada disso e o cliente já não é do destinatário: "mudou") */
export function estadoDoRecado(r: Recado): EstadoRecado {
  if (r.encerrado) return 'encerrado';
  if (r.devolvido) return 'devolvido';
  if (r.repassadoPara) return 'repassado';
  if (r.respondidoEm) return 'respondido';
  if (r.clienteRespondidoEm) return 'respondeu_cliente';
  if (r.aindaDono === false) return 'mudou';
  return 'aguardando';
}
/** o atendente ainda precisa agir (o cartão dele fica) */
export const pendenteParaAtendente = (r: Recado) => estadoDoRecado(r) === 'aguardando';
const COM_RESPOSTA: ReadonlySet<EstadoRecado> = new Set(['respondeu_cliente', 'respondido', 'repassado', 'devolvido']);
/** o administrador tem resposta para ver (o cartão dele aparece) */
export const novidadeParaGestor = (r: Recado) => COM_RESPOSTA.has(estadoDoRecado(r)) && !r.gestorVistoEm;
/** quando a resposta chegou (a ordem do cartão do administrador) */
export const quandoRespondeu = (r: Recado) => r.respondidoEm ?? r.clienteRespondidoEm ?? r.criadoEm;

/** os atalhos do recado (o administrador toca e o texto entra no campo; dá para editar) */
export const ATALHOS_RECADO = ['Responda este cliente agora.', 'Ligue para o cliente.', 'Me dê um retorno sobre este cliente.'];

const hm = (t: number) => {
  const d = new Date(t);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
/** "14:20" hoje, "ontem às 14:20", "11/11 às 14:20" */
export function quandoFoi(t: number, agora = Date.now()): string {
  const d = new Date(t);
  const hoje = new Date(agora); hoje.setHours(0, 0, 0, 0);
  const ontem = hoje.getTime() - 86_400_000;
  if (t >= hoje.getTime()) return hm(t);
  if (t >= ontem) return `ontem às ${hm(t)}`;
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} às ${hm(t)}`;
}
/** "às 14:20" · "ontem às 14:20" · "em 11/11 às 14:20" (para ir depois de um verbo) */
const naHora = (t: number) => { const q = quandoFoi(t); return /^\d{2}:\d{2}$/.test(q) ? `às ${q}` : /^\d/.test(q) ? `em ${q}` : q; };
const primeiro = (n: string) => n.split(/\s+/)[0] ?? n;
/** a frase do estado, para o administrador (lista e cartão) */
export function fraseDoEstado(r: Recado): string {
  const quem = primeiro(r.paraNome);
  switch (estadoDoRecado(r)) {
    case 'encerrado': return `Encerrado: ${r.encerrado}`;
    case 'devolvido': return `${quem} devolveu para você decidir`;
    case 'repassado': return `${quem} repassou para ${r.repassadoParaNome ? primeiro(r.repassadoParaNome) : 'outro atendente'}`;
    case 'respondido': return `${quem} respondeu`;
    case 'respondeu_cliente': return `${quem} respondeu o cliente ${naHora(r.clienteRespondidoEm!)}`;
    case 'mudou': return `O cliente não está mais com ${quem}`;
    default: return r.vistoEm ? `Aguardando ${quem} · viu ${naHora(r.vistoEm)}` : `Aguardando ${quem}`;
  }
}

/** a Fila da Iris relê quando o dono de um cliente mudou (repasse pelo recado; recado recusado porque o cliente
    mudou de atendente) — fonteReal.ts escuta */
export const EVENTO_FILA_RECARREGAR = 'atenvo:fila-iris-recarregar';

/* ---------------------------------------------------------------- a fonte (mesma cara nos dois jeitos) */
export interface Colega { id: string; nome: string }
export interface ResultadoRepasse { ok: boolean; erro?: string; paraNome?: string }
export interface FonteRecados {
  /** quem está olhando (o id que aparece em `de` e `para`) */
  eu: string | null;
  /** os recados que chegaram para mim e esperam a minha ação, o mais antigo primeiro */
  recebidos: Recado[];
  /** os que mandei e têm resposta que eu ainda não vi, pela hora da resposta */
  respostas: Recado[];
  /** a lista "Recados para a equipe": os da equipe (últimos 7 dias + os que ainda esperam), o mais novo primeiro */
  enviados: Recado[];
  /** para quem dá para repassar (os colegas da fila, sem mim) */
  colegas: Colega[];
  /** a leitura falhou (a lista mostra; o cartão segue com o que já tinha) */
  erro?: string | null;
  /** a primeira leitura já chegou (antes dela, nada é "novo" para notificar) */
  pronto?: boolean;
  /** lê de novo agora (ex.: o atendente saiu da conversa do cliente — talvez tenha acabado de responder) */
  recarregar?: () => void;
  enviar: (c: { contatoId: string; conversaId?: string; cliente: string; para: string; paraNome: string }, mensagem: string) => Promise<{ paraNome: string }>;
  responder: (id: string, texto: string) => Promise<void>;
  /** para = id do colega; null = devolver para o administrador decidir */
  repassar: (id: string, para: string | null, motivo: string) => Promise<ResultadoRepasse>;
  /** o atendente viu o cartão (o administrador vê "viu às 14:02") */
  marcarVisto: (id: string) => void;
  /** o administrador viu as respostas */
  marcarRespostaVista: (ids: string[]) => void;
  /** a prévia simula "respondeu o cliente" (no real é a mensagem enviada de verdade) */
  simularRespostaAoCliente?: (id: string) => void;
}

/** as listas a partir de todos os recados (a mesma regra nas duas fontes) */
export function separarRecados(todos: Recado[], eu: string | null): Pick<FonteRecados, 'recebidos' | 'respostas' | 'enviados'> {
  const semana = Date.now() - 7 * 86_400_000;
  return {
    recebidos: todos.filter((r) => r.para === eu && pendenteParaAtendente(r)).sort((a, b) => a.criadoEm - b.criadoEm),
    respostas: todos.filter((r) => r.de === eu && novidadeParaGestor(r)).sort((a, b) => quandoRespondeu(a) - quandoRespondeu(b)),
    enviados: todos.filter((r) => r.para !== eu && (r.criadoEm >= semana || estadoDoRecado(r) === 'aguardando'))
      .sort((a, b) => b.criadoEm - a.criadoEm),
  };
}

/* ---------------------------------------------------------------- local (demonstração e prévia) */
/** o que a loja local precisa saber da fila local (o dono e a prioridade de um cliente) — fonte.ts registra */
type ConsultaLocal = (contatoId: string) => { dono: string; cat: string } | null;
let consultaLocal: ConsultaLocal | null = null;
export function registrarFilaLocal(f: ConsultaLocal | null): void { consultaLocal = f; }

type Loja = { recados: Recado[]; donos: Record<string, string> };
const loja: Loja = { recados: [], donos: {} };
const ouvintes = new Set<() => void>();
let versao = 0;
const avisar = () => { versao += 1; ouvintes.forEach((f) => f()); };
const mexer = (id: string, f: (r: Recado) => Recado) => { loja.recados = loja.recados.map((r) => (r.id === id ? f(r) : r)); avisar(); };
const assinar = (f: () => void) => { ouvintes.add(f); return () => { ouvintes.delete(f); }; };
/** o dono de agora na demonstração (o repasse daqui manda; senão, a fila local) */
const donoLocal = (contatoId: string) => loja.donos[contatoId] ?? consultaLocal?.(contatoId)?.dono ?? null;
const aberto = (r: Recado) => !r.respondidoEm && !r.encerrado;

/** quem está olhando na demonstração (o "Ver como" da Fila muda; o recado no meio da tela acompanha) */
let euLocal = 'matheus';
export function definirEuLocal(eu: string): void {
  if (eu === euLocal) return;
  euLocal = eu;
  avisar();
}
export function useEuLocal(): string {
  useSyncExternalStore(assinar, () => versao, () => versao);
  return euLocal;
}

/** põe recados de exemplo na loja local (a prévia mostra os dois lados logo ao abrir); `donos` = clientes que já
    mudaram de dono por um repasse de exemplo */
export function semearRecadosLocais(lista: Recado[], donos: Record<string, string> = {}): void {
  if (loja.recados.length) return;
  loja.recados = lista;
  loja.donos = { ...donos };
  avisar();
}
/** os donos trocados pelos repasses da demonstração (a fila local aplica; vale em qualquer página) */
export function useDonosLocais(): Record<string, string> {
  return useSyncExternalStore(assinar, () => loja.donos, () => loja.donos);
}

/** a demonstração faz o que o banco faz (migration 20261112130000): as mesmas recusas, o repasse troca o dono na
    fila, os recados pendentes do mesmo cliente vão juntos, e quem deixa de ser o dono tem o recado encerrado */
export function useRecadosLocais(eu: string, equipe: Colega[]): FonteRecados {
  useSyncExternalStore(assinar, () => versao, () => versao);
  const todos = loja.recados;
  return useMemo<FonteRecados>(() => {
    const nome = (id: string) => equipe.find((x) => x.id === id)?.nome ?? id;
    const comDono = todos.map((r) => {
      const d = donoLocal(r.contatoId);
      return d == null ? r : { ...r, aindaDono: d === r.para };
    });
    return {
      eu,
      ...separarRecados(comDono, eu),
      colegas: equipe.filter((x) => x.id !== eu),
      erro: null,
      pronto: true,
      recarregar: () => avisar(),
      enviar: async (c, mensagem) => {
        if (c.para === eu) throw new Error('Este cliente é seu.');
        const d = donoLocal(c.contatoId);
        if (d != null && d !== c.para) throw new Error('Este cliente mudou de atendente. Abra a ficha de novo.');
        loja.recados = [...loja.recados, {
          id: `rl-${Date.now()}`, de: eu, deNome: nome(eu), para: c.para, paraNome: c.paraNome,
          contatoId: c.contatoId, conversaId: c.conversaId, cliente: c.cliente, mensagem: mensagem.trim(), criadoEm: Date.now(),
          deAdmin: true, aindaDono: true,
        }];
        avisar();
        return { paraNome: c.paraNome };
      },
      responder: async (id, texto) => {
        const r = loja.recados.find((x) => x.id === id);
        if (!r || r.para !== eu) throw new Error('Este recado não é seu.');
        if (r.respondidoEm) throw new Error('Este recado já foi respondido.');
        if (r.encerrado) throw new Error('Este recado já foi encerrado.');
        mexer(id, (x) => ({ ...x, resposta: texto.trim(), respondidoEm: Date.now(), vistoEm: x.vistoEm ?? Date.now(), gestorVistoEm: undefined }));
      },
      repassar: async (id, para, motivo) => {
        const orig = loja.recados.find((x) => x.id === id);
        if (!orig || orig.para !== eu) throw new Error('Este recado não é seu.');
        if (orig.respondidoEm) throw new Error('Este recado já foi respondido.');
        if (orig.encerrado) throw new Error('Este recado já foi encerrado.');
        const mot = motivo.trim() || undefined;
        const agora = Date.now();
        if (!para) {
          mexer(id, (r) => ({ ...r, devolvido: true, resposta: mot, respondidoEm: agora, vistoEm: r.vistoEm ?? agora, gestorVistoEm: undefined }));
          return { ok: true };
        }
        if (para === eu) throw new Error('Escolha outro atendente.');
        if (consultaLocal?.(orig.contatoId)?.cat === 'historico') {
          throw new Error('Este cliente fica com o vendedor do caso no CAF: não dá para repassar. Use "Devolver para o administrador decidir".');
        }
        const d = donoLocal(orig.contatoId);
        if (d != null && d !== eu) {
          mexer(id, (r) => ({ ...r, encerrado: 'o cliente mudou de atendente', gestorVistoEm: agora }));
          return { ok: false, erro: 'Este cliente já não é seu: o recado foi encerrado.' };
        }
        /* o principal e os outros pendentes deste cliente para mim vão juntos; o administrador do principal já tem o
           cartão dele (os de outro administrador ganham o seu) */
        const irmaos = loja.recados.filter((r) => r.contatoId === orig.contatoId && r.para === eu && r.id !== id && aberto(r) && !r.clienteRespondidoEm);
        const foram = new Set([id, ...irmaos.map((r) => r.id)]);
        loja.recados = loja.recados.map((r) => (!foram.has(r.id) ? r : {
          ...r, repassadoPara: para, repassadoParaNome: nome(para), resposta: mot, respondidoEm: agora, vistoEm: r.vistoEm ?? agora,
          gestorVistoEm: r.id === id || r.de !== orig.de ? undefined : agora,
        }));
        /* o cliente muda de dono: na fila local e, como o gatilho do banco, encerra o pendente de quem deixou de ser o dono */
        loja.donos = { ...loja.donos, [orig.contatoId]: para };
        loja.recados = loja.recados.map((r) => (r.contatoId === orig.contatoId && aberto(r) && !r.clienteRespondidoEm && r.para !== para
          ? { ...r, encerrado: 'o cliente mudou de atendente', gestorVistoEm: r.gestorVistoEm ?? agora } : r));
        const copias = [orig, ...irmaos].filter((r) => r.de !== para).map((r, i): Recado => ({
          ...r, id: `rl-${agora}-r${i}`, para, paraNome: nome(para), criadoEm: agora + i, vistoEm: undefined,
          clienteRespondidoEm: undefined, resposta: undefined, respondidoEm: undefined, repassadoPara: undefined,
          repassadoParaNome: undefined, devolvido: false, gestorVistoEm: undefined, encerrado: undefined, aindaDono: true,
          origemId: r.id, repassadoPorNome: nome(eu), repasseMotivo: mot,
        }));
        loja.recados = [...loja.recados, ...copias];
        avisar();
        return { ok: true, paraNome: nome(para) };
      },
      marcarVisto: (id) => { const r = loja.recados.find((x) => x.id === id); if (r && !r.vistoEm) mexer(id, (x) => ({ ...x, vistoEm: Date.now() })); },
      marcarRespostaVista: (ids) => { loja.recados = loja.recados.map((r) => (ids.includes(r.id) ? { ...r, gestorVistoEm: Date.now() } : r)); avisar(); },
      simularRespostaAoCliente: (id) => mexer(id, (r) => ({ ...r, clienteRespondidoEm: Date.now(), gestorVistoEm: undefined })),
    };
  }, [eu, equipe, todos]);
}
