/* MENSAGEM DO MURILLO PARA A EQUIPE — a fonte REAL (banco: mensagens_equipe / mensagem_equipe_enviar / _vista / _ok /
   _tirar, migration 20261113150000_mensagens_equipe.sql). A cara é a mesma da local (mensagensEquipe.ts). */
import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { DEMO_MODE } from '@/lib/demo';
import { useOrg } from '@/context/OrgContext';
import { useAuth } from '@/context/AuthContext';
import { INTERVALO_LEITURA_MS, type FonteMensagens, type MensagemEnviada, type MensagemEquipe, type PessoaEquipe } from './mensagensEquipe';

type LinhaMinha = { id: string; assinatura: string; mensagem: string; criado_em: string; visto_em: string | null };
type LinhaDestino = { usuario_id: string; nome: string | null; visto_em: string | null; ok_em: string | null };
type LinhaEnviada = {
  id: string; assinatura: string; mensagem: string; criado_em: string; para_todos: boolean; tirada_em: string | null;
  de_id: string; de_nome: string | null; destinos: LinhaDestino[] | null;
};
type Resposta = { admin: boolean; minhas: LinhaMinha[] | null; equipe: PessoaEquipe[] | null; enviadas: LinhaEnviada[] | null };
type Lido = { admin: boolean; minhas: MensagemEquipe[]; equipe: PessoaEquipe[]; enviadas: MensagemEnviada[] };

const ms = (s: string | null | undefined) => (s ? Date.parse(s) : undefined);
function doBanco(d: Resposta | null): Lido {
  return {
    admin: !!d?.admin,
    minhas: (d?.minhas ?? []).map((m) => ({ id: m.id, assinatura: m.assinatura, mensagem: m.mensagem, criadoEm: Date.parse(m.criado_em), vistoEm: ms(m.visto_em) })),
    equipe: d?.equipe ?? [],
    enviadas: (d?.enviadas ?? []).map((m) => ({
      id: m.id, assinatura: m.assinatura, mensagem: m.mensagem, criadoEm: Date.parse(m.criado_em), paraTodos: !!m.para_todos,
      deId: m.de_id, deNome: m.de_nome ?? 'Administrador', tiradaEm: ms(m.tirada_em),
      destinos: (m.destinos ?? []).map((x) => ({ id: x.usuario_id, nome: x.nome ?? 'Atendente', vistoEm: ms(x.visto_em), okEm: ms(x.ok_em) })),
    })),
  };
}

/** prazo de cada chamada: uma chamada pendurada (rede que cai sem dar erro, sessão travada) não prende a janela de
    envio nem o cartão — o erro aparece e dá para tentar de novo (revisão 13/11) */
const PRAZO_MS = 25_000;
const NAO_RESPONDEU = 'O sistema não respondeu a tempo. Tente de novo.';
/** o envio pode ter chegado ao banco antes de estourar: a lista diz (e o freio de 1 minuto barra a repetição) */
const ENVIO_NAO_RESPONDEU = 'O sistema não respondeu a tempo. Confira na lista antes de mandar de novo.';

/** o erro do banco em português de gente: as nossas mensagens (P0001/42501) passam; o resto vira uma frase */
function erroDaMensagem(e: { message?: string; code?: string } | null | undefined): string {
  const msg = e?.message ?? '';
  if (/aborterror|timeouterror|aborted/i.test(msg)) return NAO_RESPONDEU;
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(msg)) return 'Sem conexão agora. Tente de novo em instantes.';
  if (e?.code === 'PGRST202') return 'A mensagem para a equipe ainda não está pronta no sistema. Recarregue a página.';
  if ((e?.code === 'P0001' || e?.code === '42501') && msg) return msg;
  return 'Não deu para concluir agora. Tente de novo.';
}
class ErroMensagem extends Error {}

/** a chamada com prazo: corta o fetch (abortSignal) e, se nem o corte voltar (a espera do token da sessão vem antes
    do fetch), desiste do mesmo jeito */
async function comPrazo<T>(fazer: (sinal: AbortSignal) => PromiseLike<T>, aviso = NAO_RESPONDEU): Promise<T> {
  const ctl = new AbortController();
  let t: number | undefined;
  try {
    return await Promise.race([
      Promise.resolve(fazer(ctl.signal)),
      new Promise<never>((_, rejeitar) => {
        t = window.setTimeout(() => { ctl.abort(); rejeitar(new ErroMensagem(aviso)); }, PRAZO_MS);
      }),
    ]);
  } finally { window.clearTimeout(t); }
}

/** `intervalo`: de quanto em quanto tempo ESTE uso relê. O cartão do meio da tela lê a cada 20 s (também com a aba
    escondida, para a notificação do navegador); o botão do topo só lê com a janela aberta (5 s: o "viu"/"ok" chega
    logo) — os dois dividem a mesma leitura em cache, sem pergunta dobrada. */
export function useMensagensReais(ativo: boolean, intervalo: number | false = INTERVALO_LEITURA_MS): FonteMensagens {
  const { currentOrg } = useOrg();
  const { user } = useAuth();
  const org = currentOrg?.id;
  const uid = user?.id ?? null;
  const qc = useQueryClient();
  const chave = useMemo(() => ['mensagens-equipe', org ?? '', uid ?? ''], [org, uid]);
  const q = useQuery({
    queryKey: chave,
    enabled: ativo && !DEMO_MODE && !!supabase && !!org && !!uid,
    staleTime: 4_000,
    refetchInterval: intervalo,
    refetchIntervalInBackground: intervalo !== false,
    refetchOnWindowFocus: true,
    /* com a aba escondida, uma falha não pode parar a leitura: o react-query só repete uma tentativa com a aba em foco
       (e pausa quando se acha sem rede) — sem repetir e sem pausar, a próxima leitura de 20 s é a nova tentativa e a
       notificação do navegador continua chegando (revisão 13/11) */
    retry: false,
    networkMode: 'always',
    queryFn: async (): Promise<Lido> => {
      const { data, error } = await comPrazo((s) => supabase!.rpc('mensagens_equipe', { p_org: org }).abortSignal(s),
        'Não deu para ler as mensagens agora.');
      if (error) throw new ErroMensagem(erroDaMensagem(error));
      return doBanco(data as Resposta | null);
    },
  });
  const rpc = useCallback(async <T = unknown>(nome: string, args: Record<string, unknown>, aviso = NAO_RESPONDEU): Promise<T | null> => {
    if (!supabase || !org) throw new ErroMensagem('Sem conexão agora. Tente de novo em instantes.');
    let res: { data: unknown; error: { message?: string; code?: string } | null };
    const cliente = supabase;
    try {
      res = await comPrazo((s) => cliente.rpc(nome, { p_org: org, ...args }).abortSignal(s), aviso);
    } catch (e) {
      if (e instanceof ErroMensagem) throw e;
      throw new ErroMensagem(erroDaMensagem({ message: e instanceof Error ? e.message : String(e) }));
    }
    if (res.error) throw new ErroMensagem(erroDaMensagem(res.error));
    void qc.invalidateQueries({ queryKey: chave });
    return (res.data ?? null) as T | null;
  }, [org, qc, chave]);
  const lido = q.data;
  const erroLeitura = q.error ? (q.error instanceof Error ? q.error.message : 'Não deu para ler as mensagens agora.') : null;
  /* o botão do topo aparece já na primeira pintura pelo papel na org; o banco confirma */
  const admin = lido?.admin ?? currentOrg?.role === 'admin';
  return useMemo<FonteMensagens>(() => ({
    eu: uid,
    admin,
    minhas: lido?.minhas ?? [],
    equipe: lido?.equipe ?? [],
    enviadas: lido?.enviadas ?? [],
    pronto: q.isSuccess,
    erro: erroLeitura,
    enviar: async (para, texto) => {
      /* null = todos (o banco calcula na hora); uma lista vai como lista — vazia, o banco recusa (nunca vira "todos") */
      const d = await rpc<{ destinos?: number }>('mensagem_equipe_enviar', { p_para: para, p_mensagem: texto.trim() }, ENVIO_NAO_RESPONDEU);
      return { destinos: d?.destinos ?? 0 };
    },
    marcarVista: (id) => {
      qc.setQueryData<Lido>(chave, (old) => (old ? { ...old, minhas: old.minhas.map((m) => (m.id === id && !m.vistoEm ? { ...m, vistoEm: Date.now() } : m)) } : old));
      void rpc('mensagem_equipe_vista', { p_id: id }).catch(() => undefined);
    },
    ok: async (id) => {
      await rpc('mensagem_equipe_ok', { p_id: id });
      /* sai da tela já (a releitura confirma) */
      qc.setQueryData<Lido>(chave, (old) => (old ? { ...old, minhas: old.minhas.filter((m) => m.id !== id) } : old));
    },
    tirar: async (id) => {
      const d = await rpc<{ tirada_de?: number }>('mensagem_equipe_tirar', { p_id: id });
      return { tiradaDe: d?.tirada_de ?? 0 };
    },
    recarregar: () => { void qc.invalidateQueries({ queryKey: chave }); },
  }), [uid, admin, lido, q.isSuccess, erroLeitura, rpc, qc, chave]);
}
