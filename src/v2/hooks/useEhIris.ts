import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useOrg } from '@/context/OrgContext';

/* Aba "Iris" do inbox: visível só para Matheus e Murilo. A proteção REAL é no servidor
   (RPC iris_carteira_lista devolve vazio / erro para os demais); o Set abaixo é só a
   primeira cerca (defesa em profundidade) — o hook só libera depois da RPC responder
   sem erro. A RPC não está nos tipos gerados: chamada com cast. */
export const IRIS_USUARIOS = new Set([
  '4ac197b4-9600-4756-81aa-1ac29280df09', // Matheus
  'f81fcc8a-07a7-436a-9224-34003b65fc67', // Murilo
]);

export type IrisLinha = {
  conversa_id: string;
  estado: string | null;
  atendente_original_nome: string | null;
  lote: string | null;
  entrou_em: string | null;
  origem: 'carteira' | 'matheus';
};

export function useIrisCarteira() {
  const { user } = useAuth();
  const { currentOrg } = useOrg();
  const permitido = !!user?.id && IRIS_USUARIOS.has(user.id);
  const q = useQuery({
    queryKey: ['iris-carteira', currentOrg.id],
    enabled: permitido,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    retry: false,
    queryFn: async (): Promise<IrisLinha[]> => {
      if (!supabase) throw new Error('supabase indisponivel');
      const cli = supabase as unknown as { rpc: (fn: string) => Promise<{ data: unknown; error: { message: string } | null }> };
      const { data, error } = await cli.rpc('iris_carteira_lista');
      if (error) throw new Error(error.message);
      return Array.isArray(data) ? (data as IrisLinha[]) : [];
    },
  });
  const linhas = q.data ?? [];
  const mapa = new Map(linhas.map((l) => [l.conversa_id, l]));
  return {
    // liberado só após a RPC responder sem erro
    eIris: permitido && q.isSuccess,
    linhas,
    mapa,
    carteiraIds: new Set(linhas.filter((l) => l.origem === 'carteira').map((l) => l.conversa_id)),
  };
}
