/* RECADO DO ADMINISTRADOR — a fonte REAL (banco: recados_meus / recado_enviar / _responder / _repassar / _visto /
   recados_resposta_vista, migration 20261112130000_recados_gestor.sql). A cara é a mesma da local (recados.ts). */
import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { DEMO_MODE } from '@/lib/demo';
import { useOrg } from '@/context/OrgContext';
import { useAuth } from '@/context/AuthContext';
import { nomeBonito } from './lead';
import { EVENTO_FILA_RECARREGAR, separarRecados, type Colega, type FonteRecados, type Recado, type ResultadoRepasse } from './recados';


type LinhaRecado = {
  id: string; de_id: string; de_nome: string | null; para_id: string; para_nome: string | null;
  contato_id: string; conversa_id: string | null; cliente: string | null; mensagem: string; criado_em: string;
  visto_em: string | null; cliente_respondido_em: string | null; resposta: string | null; respondido_em: string | null;
  repassado_para: string | null; repassado_para_nome: string | null; devolvido: boolean; gestor_visto_em: string | null;
  de_admin: boolean; repassado_por_nome: string | null; repasse_motivo: string | null; origem_id: string | null;
  ainda_dono: boolean | null; encerrado: string | null;
};
const ms = (s: string | null) => (s ? Date.parse(s) : undefined);
const doBanco = (r: LinhaRecado): Recado => ({
  id: r.id, de: r.de_id, deNome: r.de_nome ?? 'O administrador', para: r.para_id, paraNome: r.para_nome ?? 'o atendente',
  contatoId: r.contato_id, conversaId: r.conversa_id ?? undefined, cliente: nomeBonito(r.cliente, null) || 'Cliente',
  mensagem: r.mensagem, criadoEm: Date.parse(r.criado_em), vistoEm: ms(r.visto_em), clienteRespondidoEm: ms(r.cliente_respondido_em),
  resposta: r.resposta ?? undefined, respondidoEm: ms(r.respondido_em), repassadoPara: r.repassado_para ?? undefined,
  repassadoParaNome: r.repassado_para_nome ?? undefined, devolvido: !!r.devolvido, gestorVistoEm: ms(r.gestor_visto_em),
  deAdmin: r.de_admin !== false, origemId: r.origem_id ?? undefined, repassadoPorNome: r.repassado_por_nome ?? undefined,
  repasseMotivo: r.repasse_motivo ?? undefined, aindaDono: r.ainda_dono !== false, encerrado: r.encerrado ?? undefined,
});

/** o erro do banco em português de gente: as nossas mensagens (P0001/42501) passam; o resto vira uma frase */
export function erroDoRecado(e: { message?: string; code?: string } | null | undefined): string {
  const msg = e?.message ?? '';
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(msg)) return 'Sem conexão agora. Tente de novo em instantes.';
  if (e?.code === 'PGRST202') return 'O recado ainda não está pronto no sistema. Recarregue a página.';
  if ((e?.code === 'P0001' || e?.code === '42501') && msg) return msg;
  return 'Não deu para concluir agora. Tente de novo.';
}
class ErroRecado extends Error {}

/** os recados que me envolvem (para mim; de mim; administrador: a equipe toda), do banco */
export function useRecadosReais(ativo: boolean, colegasDaEquipe: Colega[]): FonteRecados {
  const { currentOrg } = useOrg();
  const { user } = useAuth();
  const org = currentOrg?.id;
  const uid = user?.id ?? null;
  const qc = useQueryClient();
  const chave = useMemo(() => ['recados-gestor', org ?? '', uid ?? ''], [org, uid]);
  const q = useQuery({
    queryKey: chave,
    enabled: ativo && !DEMO_MODE && !!supabase && !!org && !!uid,
    staleTime: 10_000,
    refetchInterval: 30_000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<Recado[]> => {
      const { data, error } = await supabase!.rpc('recados_meus', { p_org: org });
      if (error) throw new ErroRecado(erroDoRecado(error));
      return ((data ?? []) as LinhaRecado[]).map(doBanco);
    },
  });
  const rpc = useCallback(async <T = unknown>(nome: string, args: Record<string, unknown>): Promise<T | null> => {
    if (!supabase || !org) throw new ErroRecado('Sem conexão agora. Tente de novo em instantes.');
    let res: { data: unknown; error: { message?: string; code?: string } | null };
    try {
      res = await supabase.rpc(nome, { p_org: org, ...args });
    } catch (e) {
      throw new ErroRecado(erroDoRecado({ message: e instanceof Error ? e.message : String(e) }));
    }
    if (res.error) throw new ErroRecado(erroDoRecado(res.error));
    void qc.invalidateQueries({ queryKey: chave });
    return (res.data ?? null) as T | null;
  }, [org, qc, chave]);
  const todos = q.data ?? [];
  const erroLeitura = q.error ? (q.error instanceof Error ? q.error.message : 'Não deu para ler os recados agora.') : null;
  return useMemo<FonteRecados>(() => ({
    eu: uid,
    ...separarRecados(todos, uid),
    colegas: colegasDaEquipe.filter((x) => x.id !== uid),
    erro: erroLeitura,
    pronto: q.isSuccess,
    recarregar: () => { void qc.invalidateQueries({ queryKey: chave }); },
    enviar: async (c, mensagem) => {
      const d = await rpc<{ para_nome?: string | null }>('recado_enviar', { p_contato: c.contatoId, p_para: c.para, p_mensagem: mensagem.trim() });
      return { paraNome: d?.para_nome || c.paraNome };
    },
    responder: async (id, texto) => { await rpc('recado_responder', { p_recado: id, p_texto: texto.trim() }); },
    repassar: async (id, para, motivo): Promise<ResultadoRepasse> => {
      const d = await rpc<{ ok?: boolean; erro?: string; para_nome?: string | null }>('recado_repassar',
        { p_recado: id, p_para: para, p_motivo: motivo.trim() || null });
      if (para && d?.ok !== false) window.dispatchEvent(new Event(EVENTO_FILA_RECARREGAR));
      return { ok: d?.ok !== false, erro: d?.erro ?? undefined, paraNome: d?.para_nome ?? undefined };
    },
    marcarVisto: (id) => {
      qc.setQueryData<Recado[]>(chave, (old) => (old ?? []).map((r) => (r.id === id && !r.vistoEm ? { ...r, vistoEm: Date.now() } : r)));
      void rpc('recado_visto', { p_recado: id }).catch(() => undefined);
    },
    marcarRespostaVista: (ids) => {
      qc.setQueryData<Recado[]>(chave, (old) => (old ?? []).map((r) => (ids.includes(r.id) ? { ...r, gestorVistoEm: Date.now() } : r)));
      void rpc('recados_resposta_vista', { p_ids: ids }).catch(() => undefined);
    },
  }), [todos, uid, colegasDaEquipe, rpc, qc, chave, erroLeitura, q.isSuccess]);
}
