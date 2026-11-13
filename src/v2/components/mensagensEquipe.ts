/* ============================================================================
   MENSAGEM DO MURILLO PARA A EQUIPE (dono 13/11: "preciso conseguir notificar os cliente, enviar uma mensagem que
   apareça no meio da tela cobrando eles, mas quero conseguir fazer isso em qualquer ocasião, escolher o atendente
   ou todos, e tem que ser enviado como Murillo").
   - O administrador escreve de qualquer tela (botão "Mensagem" na barra do topo) para um ou mais atendentes, ou
     para todos. Quem recebe vê "Mensagem do Murillo" NO MEIO DA TELA, em qualquer página, até dar "Ok, entendi".
   - O administrador vê na mesma janela as mensagens dos últimos 7 dias, quem viu e quem deu ok, e pode tirar uma
     mensagem das telas de quem ainda não deu ok.
   Duas fontes com a MESMA cara: a local (aqui — demonstração e prévia; tudo na página) e a real
   (mensagensEquipeReal.ts — banco, migration 20261113150000_mensagens_equipe.sql).
   ============================================================================ */
import { useMemo, useSyncExternalStore } from 'react';

/** quem assina para a equipe (dono 13/11: "tem que ser enviado como Murillo"); o banco grava a mesma */
export const ASSINATURA = 'Murillo';
export const LIMITE_MENSAGEM = 600;
/** de quanto em quanto tempo a tela de quem recebe pergunta se chegou mensagem */
export const INTERVALO_LEITURA_MS = 20_000;

/** a que chegou para mim e ainda espera o meu "Ok" */
export interface MensagemEquipe {
  id: string;
  assinatura: string;
  mensagem: string;
  criadoEm: number;
  /** já apareceu na minha tela */
  vistoEm?: number;
}
export interface DestinoMensagem { id: string; nome: string; vistoEm?: number; okEm?: number }
/** a lista do administrador */
export interface MensagemEnviada {
  id: string;
  assinatura: string;
  mensagem: string;
  criadoEm: number;
  paraTodos: boolean;
  /** quem escreveu de verdade (só o administrador vê) */
  deId: string;
  deNome: string;
  tiradaEm?: number;
  destinos: DestinoMensagem[];
}
export interface PessoaEquipe { id: string; nome: string }

export interface FonteMensagens {
  eu: string | null;
  admin: boolean;
  /** as que esperam o meu "Ok", a mais antiga primeiro */
  minhas: MensagemEquipe[];
  /** quem pode receber (administrador; sem os administradores e sem mim) */
  equipe: PessoaEquipe[];
  /** as dos últimos 7 dias, a mais nova primeiro (administrador) */
  enviadas: MensagemEnviada[];
  /** a primeira leitura já chegou (antes dela, nada é "novo" para notificar) */
  pronto: boolean;
  erro?: string | null;
  /** para = null → todos (quem estiver na equipe na hora); uma lista → exatamente essas pessoas (vazia é recusada) */
  enviar: (para: string[] | null, texto: string) => Promise<{ destinos: number }>;
  /** apareceu na minha tela (o administrador vê "viu às 14:02") */
  marcarVista: (id: string) => void;
  /** "Ok, entendi" */
  ok: (id: string) => Promise<void>;
  /** o administrador tira das telas de quem ainda não deu ok */
  tirar: (id: string) => Promise<{ tiradaDe: number }>;
  /** lê de novo agora (a janela do administrador abriu: a lista não espera a próxima leitura) */
  recarregar?: () => void;
}

/* ---------------------------------------------------------------- o que a lista do administrador escreve */
export type Situacao = 'ok' | 'viu' | 'nao_viu';
export const situacaoDe = (d: DestinoMensagem): Situacao => (d.okEm ? 'ok' : d.vistoEm ? 'viu' : 'nao_viu');
const hm = (t: number) => {
  const d = new Date(t);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
/** "14:20" hoje, "ontem 14:20", "11/11 14:20" */
export function horaCurta(t: number, agora = Date.now()): string {
  const hoje = new Date(agora); hoje.setHours(0, 0, 0, 0);
  if (t >= hoje.getTime()) return hm(t);
  if (t >= hoje.getTime() - 86_400_000) return `ontem ${hm(t)}`;
  const d = new Date(t);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${hm(t)}`;
}
/** "ok 14:21" · "viu 14:25" · "não viu" */
export function rotuloSituacao(d: DestinoMensagem, agora = Date.now()): string {
  if (d.okEm) return `ok ${horaCurta(d.okEm, agora)}`;
  if (d.vistoEm) return `viu ${horaCurta(d.vistoEm, agora)}`;
  return 'não viu';
}
export const primeiroNome = (n: string) => n.trim().split(/\s+/)[0] || n;

/* ---------------------------------------------------------------- local (demonstração e prévia) */
/** quantas a lista do administrador mostra (o banco corta igual) */
const LIMITE_LISTA = 40;
/** ainda está na tela de alguém (não foi tirada e falta o ok de alguém) */
const naTela = (m: MensagemEnviada) => !m.tiradaEm && m.destinos.some((d) => !d.okEm);
const loja: { mensagens: MensagemEnviada[] } = { mensagens: [] };
const ouvintes = new Set<() => void>();
let versao = 0;
const avisar = () => { versao += 1; ouvintes.forEach((f) => f()); };
const assinar = (f: () => void) => { ouvintes.add(f); return () => { ouvintes.delete(f); }; };
const mexerDestino = (id: string, quem: string, f: (d: DestinoMensagem) => DestinoMensagem) => {
  loja.mensagens = loja.mensagens.map((m) => (m.id !== id ? m : { ...m, destinos: m.destinos.map((d) => (d.id === quem ? f(d) : d)) }));
  avisar();
};

/** põe mensagens de exemplo na loja local (a prévia mostra a lista do administrador logo ao abrir) */
export function semearMensagensLocais(lista: MensagemEnviada[]): void {
  if (loja.mensagens.length) return;
  loja.mensagens = lista;
  avisar();
}

/** a demonstração faz o que o banco faz (migration 20261113150000): as mesmas recusas e as mesmas listas.
    `equipe` = todos da demonstração, com `admin` em quem é administrador (o "Ver como" diz quem está olhando). */
export function useMensagensLocais(eu: string, equipe: (PessoaEquipe & { admin?: boolean })[]): FonteMensagens {
  useSyncExternalStore(assinar, () => versao, () => versao);
  const todas = loja.mensagens;
  return useMemo<FonteMensagens>(() => {
    const admin = !!equipe.find((p) => p.id === eu)?.admin;
    const semana = Date.now() - 7 * 86_400_000;
    const nome = (id: string) => equipe.find((p) => p.id === id)?.nome ?? 'Atendente';
    const podem = equipe.filter((p) => !p.admin && p.id !== eu).map(({ id, nome: n }) => ({ id, nome: n }));
    const minhas = todas
      .filter((m) => !m.tiradaEm && m.criadoEm > semana && m.destinos.some((d) => d.id === eu && !d.okEm))
      .sort((a, b) => a.criadoEm - b.criadoEm)
      .map((m) => ({ id: m.id, assinatura: m.assinatura, mensagem: m.mensagem, criadoEm: m.criadoEm, vistoEm: m.destinos.find((d) => d.id === eu)?.vistoEm }));
    return {
      eu,
      admin,
      minhas,
      equipe: admin ? podem : [],
      /* como o banco: 7 dias, no máximo 40 — as que ainda estão na tela de alguém entram antes do corte (o "Tirar das
         telas" nunca some) — e a lista na ordem da hora, a mais nova primeiro */
      enviadas: admin ? todas.filter((m) => m.criadoEm > semana)
        .sort((a, b) => Number(naTela(b)) - Number(naTela(a)) || b.criadoEm - a.criadoEm)
        .slice(0, LIMITE_LISTA)
        .sort((a, b) => b.criadoEm - a.criadoEm) : [],
      pronto: true,
      erro: null,
      enviar: async (para, texto) => {
        const msg = texto.trim();
        if (!admin) throw new Error('Só o administrador manda mensagem para a equipe.');
        if (!msg) throw new Error('Escreva a mensagem.');
        if (msg.length > LIMITE_MENSAGEM) throw new Error(`A mensagem passou de ${LIMITE_MENSAGEM} letras.`);
        const todos = para === null;
        const dest = todos ? podem.map((p) => p.id) : [...new Set(para)].sort();
        if (!todos && !dest.length) throw new Error('Escolha quem recebe.');
        if (dest.includes(eu)) throw new Error('Você não manda mensagem para você mesmo.');
        if (!dest.length) throw new Error('Não há ninguém da equipe para receber.');
        const agora = Date.now();
        const chave = [...dest].sort().join(',');
        if (loja.mensagens.some((m) => m.deId === eu && m.mensagem === msg && !m.tiradaEm && m.criadoEm > agora - 60_000
          && m.destinos.map((d) => d.id).sort().join(',') === chave)) {
          throw new Error('Você acabou de mandar esta mensagem.');
        }
        loja.mensagens = [...loja.mensagens, {
          id: `ml-${agora}`, assinatura: ASSINATURA, mensagem: msg, criadoEm: agora, paraTodos: todos, deId: eu, deNome: nome(eu),
          destinos: dest.map((id) => ({ id, nome: nome(id) })).sort((a, b) => a.nome.localeCompare(b.nome)),
        }];
        avisar();
        return { destinos: dest.length };
      },
      marcarVista: (id) => {
        const d = loja.mensagens.find((m) => m.id === id)?.destinos.find((x) => x.id === eu);
        if (d && !d.vistoEm) mexerDestino(id, eu, (x) => ({ ...x, vistoEm: Date.now() }));
      },
      ok: async (id) => {
        const d = loja.mensagens.find((m) => m.id === id)?.destinos.find((x) => x.id === eu);
        if (d && !d.okEm) mexerDestino(id, eu, (x) => ({ ...x, okEm: Date.now(), vistoEm: x.vistoEm ?? Date.now() }));
      },
      tirar: async (id) => {
        if (!admin) throw new Error('Só o administrador tira a mensagem das telas.');
        const m = loja.mensagens.find((x) => x.id === id);
        if (!m) throw new Error('Mensagem não encontrada.');
        if (!m.tiradaEm) { loja.mensagens = loja.mensagens.map((x) => (x.id === id ? { ...x, tiradaEm: Date.now() } : x)); avisar(); }
        return { tiradaDe: m.destinos.filter((d) => !d.okEm).length };
      },
    };
  }, [eu, equipe, todas]);
}
