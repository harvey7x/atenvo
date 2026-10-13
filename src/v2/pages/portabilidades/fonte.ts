/* Portabilidades — FONTE ÚNICA da tela: no modo demonstração lê o store em memória (nada é salvo);
   no real, o Supabase. A tela não sabe qual é (mesmos tipos, mesmas ações) — "demo é o contrato". */
import { useMemo } from 'react';
import { DEMO_MODE } from '@/lib/demo';
import { conversaDoContato, rpcPort, useBuscaClientesReal, usePortReal } from '@/data/portabilidadesReal';
import {
  ATENDENTES_DEMO, USUARIO_DEMO, casaBusca, portAcoes, situacao, usePortDemo,
  type Aceite, type Atendente, type ClientePort, type EstadoLink, type Portabilidade,
} from '@/data/portabilidades';

export type ClienteBusca = ClientePort & { abertas: number };
export interface Fonte {
  real: boolean;
  carregando: boolean;
  erro?: string;
  portabilidades: Portabilidade[];
  atendentes: Atendente[];
  usuario: { id: string; nome: string };
  cliente: (id: string) => ClientePort;
  atendente: (id: string) => string;
  acoes: {
    criar: (d: { clienteId: string; valorTotal: number; atendenteId: string }) => Promise<string>;
    aceite: (id: string, a: Aceite) => Promise<void>;
    desbloqueio: (id: string, feito: boolean) => Promise<void>;
    link: (id: string, l: EstadoLink) => Promise<void>;
    concluir: (id: string) => Promise<void>;
    reabrir: (id: string) => Promise<void>;
    valor: (id: string, total: number) => Promise<void>;
    trocarAtendente: (id: string, atendenteId: string) => Promise<void>;
    anotar: (id: string, texto: string) => Promise<void>;
    excluir: (id: string) => Promise<void>;
  };
  /** real: a conversa do cliente para o "Abrir conversa" (null = ainda não tem). Demo: undefined. */
  conversaDe?: (clienteId: string) => Promise<string | null>;
  erroAmigavel: (e: unknown) => string;
}

/* Códigos de erro das RPCs (migration 20261013170000) → frase para a tela */
const ERROS: Record<string, string> = {
  sem_acesso: 'Você não tem acesso a esta organização.',
  contato_invalido: 'Cliente não encontrado.',
  contato_mesclado: 'Esse cadastro foi unido a outro. Procure o cliente de novo.',
  atendente_invalido: 'Esse atendente não está ativo na equipe.',
  aceite_invalido: 'Ação inválida. Atualize a página e tente de novo.',
  estado_invalido: 'Ação inválida. Atualize a página e tente de novo.',
  valor_invalido: 'Coloque o valor que o cliente vai receber.',
  sem_aceite: 'Marque primeiro que o cliente aceitou.',
  etapas_pendentes: 'Para concluir, o benefício precisa estar desbloqueado e o cliente precisa ter feito o link.',
  portabilidade_concluida: 'Essa portabilidade já foi concluída. Reabra para mudar.',
  portabilidade_nao_encontrada: 'Portabilidade não encontrada. Atualize a página.',
  nota_vazia: 'Escreva a anotação.',
};
export function erroAmigavel(e: unknown): string {
  const m = (e as Error)?.message ?? String(e);
  const k = (m.match(/[a-z][a-z_]*[a-z]/g) ?? []).find((w) => Object.prototype.hasOwnProperty.call(ERROS, w));
  return k ? ERROS[k] : 'Não deu certo. Tente de novo.';
}

const SEM_CLIENTE: ClientePort = { id: '', nome: 'CLIENTE', telefone: '', responsavel: '—' };

/** a demonstração responde um instante depois, como o servidor (o botão mostra "salvando" e o duplo clique cai nele) */
const ESPERA_DEMO_MS = 300;
const comEspera = <A extends unknown[], R>(f: (...a: A) => R) => async (...a: A): Promise<R> => {
  await new Promise((ok) => setTimeout(ok, ESPERA_DEMO_MS));
  return f(...a);
};

function useFonteDemo(): Fonte {
  const e = usePortDemo();
  return useMemo<Fonte>(() => ({
    real: false, carregando: false,
    portabilidades: e.portabilidades,
    atendentes: ATENDENTES_DEMO,
    usuario: USUARIO_DEMO,
    cliente: (id) => e.clientes.find((c) => c.id === id) ?? SEM_CLIENTE,
    atendente: (id) => ATENDENTES_DEMO.find((a) => a.id === id)?.nome ?? '—',
    acoes: {
      criar: comEspera(portAcoes.criar),
      aceite: comEspera(portAcoes.aceite),
      desbloqueio: comEspera(portAcoes.desbloqueio),
      link: comEspera(portAcoes.link),
      concluir: comEspera(portAcoes.concluir),
      reabrir: comEspera(portAcoes.reabrir),
      valor: comEspera(portAcoes.valor),
      trocarAtendente: comEspera(portAcoes.atendente),
      anotar: comEspera(portAcoes.anotar),
      excluir: comEspera(portAcoes.excluir),
    },
    erroAmigavel,
  }), [e]);
}

function useFonteReal(): Fonte {
  const q = usePortReal();
  const d = q.data;
  const mapa = useMemo(() => new Map((d?.clientes ?? []).map((c) => [c.id, c])), [d?.clientes]);
  return useMemo<Fonte>(() => {
    /* depois de gravar, recarrega: a tela só segue (muda de lista, seleciona) com o dado novo na mão */
    const depois = <A extends unknown[], R>(f: (...a: A) => Promise<R>) => async (...a: A) => { const r = await f(...a); await q.recarregar(); return r; };
    return {
      real: true, carregando: q.isLoading, erro: q.error ? (q.error as Error).message : undefined,
      portabilidades: d?.portabilidades ?? [],
      atendentes: d?.atendentes ?? [],
      usuario: q.usuario,
      cliente: (id) => mapa.get(id) ?? SEM_CLIENTE,
      atendente: (id) => d?.nomes[id] ?? '—',
      acoes: {
        criar: depois(rpcPort.criar), aceite: depois(rpcPort.aceite), desbloqueio: depois(rpcPort.desbloqueio),
        link: depois(rpcPort.link), concluir: depois(rpcPort.concluir), reabrir: depois(rpcPort.reabrir),
        valor: depois(rpcPort.valor), trocarAtendente: depois(rpcPort.trocarAtendente), anotar: depois(rpcPort.anotar),
        excluir: depois(rpcPort.excluir),
      },
      conversaDe: conversaDoContato,
      erroAmigavel,
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d, q.isLoading, q.error, mapa, q.usuario.id, q.usuario.nome]);
}

/* DEMO_MODE é constante de build: a ordem dos hooks nunca muda. */
export const useFonte: () => Fonte = DEMO_MODE ? useFonteDemo : useFonteReal;

/** busca de clientes da Nova portabilidade: nome ou telefone. Sem busca = os primeiros da lista. */
export const useBuscaClientes: (busca: string) => { lista: ClienteBusca[]; carregando: boolean } = DEMO_MODE ? useBuscaDemo : useBuscaReal;

function useBuscaReal(busca: string): { lista: ClienteBusca[]; carregando: boolean } {
  const r = useBuscaClientesReal(busca);
  return { lista: r.data ?? [], carregando: r.isLoading };
}

function useBuscaDemo(busca: string): { lista: ClienteBusca[]; carregando: boolean } {
  const e = usePortDemo();
  return useMemo(() => {
    const abertas = (id: string) => e.portabilidades.filter((p) => p.clienteId === id && ['aguardando_aceite', 'em_andamento'].includes(situacao(p))).length;
    const lista = e.clientes
      .filter((c) => casaBusca(c, busca))
      .slice(0, 8)
      .map((c) => ({ ...c, abertas: abertas(c.id) }));
    return { lista, carregando: false };
  }, [e, busca]);
}
