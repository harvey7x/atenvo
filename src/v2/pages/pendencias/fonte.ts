/* Pendências — FONTE ÚNICA da tela: no modo demonstração lê o store em memória;
   no real, o Supabase. A tela não sabe qual é (mesmos tipos, mesmas ações). */
import { useMemo } from 'react';
import { DEMO_MODE } from '@/lib/demo';
import {
  clienteCasaBusca, pendAcoes, usePendDemo, usuarioAtual,
  type AjustesPendencias, type Bloco, type ChecagemNumero, type ClienteFechado, type DadosNovaPendencia, type Modelo, type Passo, type Pendencia,
} from '@/data/pendencias';
import { erroAmigavel, rpcPend, subirArquivoPend, useClientesFechados, usePendReal } from '@/data/pendenciasReal';

export type ClienteBusca = ClienteFechado & { abertas: number };
export interface Fonte {
  real: boolean;
  /** dados reais carregados ao menos uma vez (antes disso, ajustes = padrão: não deixar salvar por cima) */
  pronto: boolean;
  carregando: boolean;
  erro?: string;
  pendencias: Pendencia[];
  modelos: Modelo[];
  ajustes: AjustesPendencias;
  canais: { id: string; nome: string; telefone: string; conectado: boolean }[];
  /** banco com o motor novo (20261008190000, no ar). A demo segue o mesmo motor (demo = contrato). */
  motorNovo: boolean;
  /** admin: muda os Ajustes. gestor (administrador ou supervisor): exclui mensagem pronta. */
  usuario: { id: string; nome: string; admin: boolean; gestor: boolean };
  cliente: (id: string) => ClienteFechado;
  /** Nova pendência por número (cliente fora do sistema): o número é válido? já é de algum contato? Só leitura. */
  checarNumero: (tel: string) => Promise<ChecagemNumero>;
  acoes: {
    criar: (d: { clienteId: string } & DadosNovaPendencia) => Promise<string>;
    /** cadastra o cliente pelo número + nome (ou usa quem já tem o número) e abre a pendência */
    criarNumero: (d: { nome: string; telefone: string } & DadosNovaPendencia) => Promise<string>;
    resolver: (id: string) => Promise<void>;
    reabrir: (id: string) => Promise<void>;
    pausar: (id: string, v: boolean) => Promise<void>;
    lembretes: (id: string, passos: Passo[], modo: 'trocar' | 'retomar') => Promise<void>;
    enviarAgora: (id: string, blocos: Bloco[]) => Promise<void>;
    salvarModelo: (m: Modelo, existe: boolean) => Promise<void>;
    excluirModelo: (id: string) => Promise<void>;
    salvarAjustes: (a: AjustesPendencias) => Promise<void>;
  };
  /** real: sobe o arquivo (áudio vira OGG/Opus). Demo: undefined (só guarda o nome). */
  subir?: (blob: Blob, nome: string, tipo: Bloco['tipo']) => Promise<Partial<Bloco>>;
  erroAmigavel: (e: unknown) => string;
}

const SEM_CLIENTE: ClienteFechado = { id: '', nome: 'CLIENTE', telefone: '', processo: '', acao: '', responsavel: '', fechadoEm: '' };

/** a demonstração responde um instante depois, como o servidor: o botão fica em "salvando" e o 2º
 *  clique de um duplo clique cai nele (desabilitado), e não no botão que aparece embaixo quando a
 *  tela cheia fecha na hora (ex.: "Nova pendência" atrás do "Salvar"/"Enviar" do topo). */
const ESPERA_DEMO_MS = 400;
/** a conferência do número também demora um pouco (o "Conferindo…" aparece como no real) */
const ESPERA_CHECAR_MS = 250;
function comEspera(a: Fonte['acoes']): Fonte['acoes'] {
  const r: Record<string, unknown> = {};
  for (const [k, f] of Object.entries(a)) {
    r[k] = async (...x: unknown[]) => {
      await new Promise((ok) => setTimeout(ok, ESPERA_DEMO_MS));
      return (f as (...y: unknown[]) => Promise<unknown>)(...x);
    };
  }
  return r as unknown as Fonte['acoes'];
}

function useFonteDemo(): Fonte {
  const e = usePendDemo();
  return useMemo(() => ({
    real: false, pronto: true, carregando: false,
    pendencias: e.pendencias, modelos: e.modelos, ajustes: e.ajustes, canais: [], motorNovo: true,
    usuario: { id: 'demo', nome: usuarioAtual(), admin: true, gestor: true },
    cliente: (id) => e.clientes.find((c) => c.id === id) ?? SEM_CLIENTE,
    checarNumero: async (tel) => { await new Promise((ok) => setTimeout(ok, ESPERA_CHECAR_MS)); return pendAcoes.checarNumero(tel); },
    acoes: comEspera({
      criar: async (d) => pendAcoes.criar(d).id,
      criarNumero: async (d) => pendAcoes.criarNumero(d).id,
      resolver: async (id) => pendAcoes.resolver(id),
      reabrir: async (id) => pendAcoes.reabrir(id),
      pausar: async (id, v) => pendAcoes.pausar(id, v),
      lembretes: async (id, ps, modo) => (modo === 'trocar' ? pendAcoes.trocarLembretes(id, ps) : pendAcoes.retomar(id, ps)),
      enviarAgora: async (id, bs) => pendAcoes.enviarAgora(id, bs),
      salvarModelo: async (m) => pendAcoes.salvarModelo(m),
      excluirModelo: async (id) => pendAcoes.excluirModelo(id),
      salvarAjustes: async (a) => pendAcoes.ajustar(a),
    }),
    erroAmigavel, // mesmos textos do real
  }), [e]);
}

function useFonteReal(): Fonte {
  const q = usePendReal();
  const d = q.data;
  const mapa = useMemo(() => new Map((d?.clientes ?? []).map((c) => [c.id, c])), [d?.clientes]);
  const org = q.org ?? '';
  return useMemo(() => {
    const depois = <A extends unknown[], R>(f: (...a: A) => Promise<R>) => async (...a: A) => { const r = await f(...a); await q.recarregar(); return r; };
    return {
      real: true, pronto: !!d, carregando: q.isLoading, erro: q.error ? (q.error as Error).message : undefined,
      pendencias: d?.pendencias ?? [], modelos: d?.modelos ?? [], canais: d?.canais ?? [], motorNovo: !!d?.motorNovo,
      ajustes: d?.ajustes ?? { numero: { nome: '—', telefone: '', conectado: false }, ativo: false, diasUteis: true, janelaIni: '09:00', janelaFim: '19:00', limiteDia: 40, avisarResponsavel: true },
      usuario: q.usuario,
      cliente: (id) => mapa.get(id) ?? SEM_CLIENTE,
      checarNumero: rpcPend.checarNumero,
      acoes: {
        criar: depois(rpcPend.criar), criarNumero: depois(rpcPend.criarNumero), resolver: depois(rpcPend.resolver), reabrir: depois(rpcPend.reabrir),
        pausar: depois(rpcPend.pausar), lembretes: depois(rpcPend.lembretes), enviarAgora: depois(rpcPend.enviarAgora),
        salvarModelo: depois(rpcPend.salvarModelo), excluirModelo: depois(rpcPend.excluirModelo), salvarAjustes: depois(rpcPend.salvarAjustes),
      },
      subir: (blob, nome, tipo) => subirArquivoPend(org, blob, nome, tipo),
      erroAmigavel,
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d, q.isLoading, q.error, mapa, org, q.usuario.id, q.usuario.admin, q.usuario.gestor]);
}

/* DEMO_MODE é constante de build: a ordem dos hooks nunca muda. */
export const useFonte: () => Fonte = DEMO_MODE ? useFonteDemo : useFonteReal;

/** busca de clientes da Nova pendência: fechados + quem já tem pendência (cadastrado por número) */
export function useBuscaClientes(busca: string): { lista: ClienteBusca[]; carregando: boolean } {
  if (DEMO_MODE) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const e = usePendDemo();
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useMemo(() => {
      /* = pendencias_clientes_fechados: nome, ou telefone (pedaço com 4+ dígitos, ou o número inteiro pela
         chave canônica). Não procura por processo. e.clientes já é quem fechou + quem ganhou pendência
         pelo número (o store move o contato junto) */
      const lista = e.clientes
        .filter((c) => clienteCasaBusca(c, busca))
        .map((c) => ({ ...c, abertas: e.pendencias.filter((p) => p.clienteId === c.id && p.status !== 'resolvida').length }));
      return { lista, carregando: false };
    }, [e, busca]);
  }
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const r = useClientesFechados(busca, true);
  return { lista: r.data ?? [], carregando: r.isLoading };
}
