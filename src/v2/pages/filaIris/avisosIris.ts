/* ============================================================================
   Fila da Iris — os AVISOS NA TELA (dono 12/11: "a Iris atendeu um cliente completo e passou
   para você… preciso que apareça uma notificação na tela, independente da onde").
   O relógio do banco (fila_iris_avisos_tick, todo minuto) grava o aviso quando o cliente ENTRA em
   quentes / documentação / sem resposta; aqui a tela lê os meus avisos não vistos e marca os vistos.
   Demonstração: dois avisos montados dos clientes fictícios (nada é gravado).
   ============================================================================ */
import { useCallback, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { DEMO_MODE } from '@/lib/demo';
import { useOrg } from '@/context/OrgContext';
import { useAuth } from '@/context/AuthContext';
import { leadsFicticios, nomeBonito } from './lead';

import type { AvisoIris, CategoriaAviso } from './avisosTexto';
export { TEXTO_AVISO, type AvisoIris, type CategoriaAviso } from './avisosTexto';

type LinhaAviso = { id: string; contato_id: string; conversa_id: string | null; categoria: CategoriaAviso; nome: string | null; passou_em: string; criado_em: string };

function avisosDaDemo(): AvisoIris[] {
  const agora = Date.now();
  return leadsFicticios()
    .filter((l) => l.novo && l.cat !== 'historico')
    .slice(0, 2)
    .map((l, i) => ({
      id: `demo-${l.id}`, contatoId: l.id, conversaId: l.conversaId, categoria: l.cat as CategoriaAviso,
      nome: l.nome, passouEm: l.passouEm ?? agora, criadoEm: agora - i * 60_000,
    }));
}

/** os meus avisos não vistos (o mais novo primeiro) + marcar como vistos. `ativo` = tenho a Fila da Iris. */
export function useAvisosIris(ativo: boolean): { avisos: AvisoIris[]; marcarVistos: (ids: string[]) => void } {
  const { currentOrg } = useOrg();
  const { user } = useAuth();
  const org = currentOrg?.id;
  const uid = user?.id;
  const qc = useQueryClient();
  const [demo, setDemo] = useState<AvisoIris[]>(() => (DEMO_MODE ? avisosDaDemo() : []));
  /* a chave leva o usuário: quem entra na mesma aba depois de outro nunca vê os avisos dele */
  const chave = useMemo(() => ['fila-iris-avisos', org ?? '', uid ?? ''], [org, uid]);
  /* os dispensados nesta aba não voltam nem por um instante (uma busca em voo pode trazer a lista velha) */
  const dispensados = useRef(new Set<string>());

  const q = useQuery({
    queryKey: chave,
    enabled: !DEMO_MODE && ativo && !!supabase && !!org && !!uid,
    staleTime: 10_000,
    refetchInterval: 30_000,
    /* com o Atenvo em outra aba (o sistema da CAF, o Meu INSS) o aviso também chega */
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<AvisoIris[]> => {
      const { data, error } = await supabase!.rpc('fila_iris_avisos_meus', { p_org: org });
      if (error) throw new Error(error.message);
      return ((data ?? []) as LinhaAviso[]).map((r) => ({
        id: r.id, contatoId: r.contato_id, conversaId: r.conversa_id ?? undefined, categoria: r.categoria,
        nome: nomeBonito(r.nome, null) || 'Cliente', passouEm: Date.parse(r.passou_em), criadoEm: Date.parse(r.criado_em),
      }));
    },
  });

  const marcarVistos = useCallback((ids: string[]) => {
    if (!ids.length) return;
    if (DEMO_MODE) { setDemo((d) => d.filter((a) => !ids.includes(a.id))); return; }
    /* some na hora (otimista); o banco confirma em seguida */
    for (const id of ids) dispensados.current.add(id);
    void qc.cancelQueries({ queryKey: chave });
    qc.setQueryData<AvisoIris[]>(chave, (old) => (old ?? []).filter((a) => !ids.includes(a.id)));
    void supabase?.rpc('fila_iris_avisos_visto', { p_org: org, p_ids: ids }).then(() => {
      void qc.invalidateQueries({ queryKey: chave });
    });
  }, [chave, org, qc]);

  const lista = DEMO_MODE ? demo : (q.data ?? []);
  /* um por cliente (o banco já entrega assim; aqui é o cinto) e sem os dispensados desta aba */
  const avisos = useMemo(() => {
    const vistos = new Set<string>();
    return lista.filter((a) => {
      if (dispensados.current.has(a.id) || vistos.has(a.contatoId)) return false;
      vistos.add(a.contatoId);
      return true;
    });
  }, [lista]);
  return { avisos, marcarVistos };
}
