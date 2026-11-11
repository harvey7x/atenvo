/* Documentos do INSS (modelo central, 05/10/2026).
   O atendente PEDE na ficha do cliente (inss_pedidos); o coletor — que roda no
   computador do escritório — atende a fila, faz a coleta no Meu INSS e sobe os
   PDFs para o bucket `inss-docs` via edge function `coletor-inss`. Aqui ficam
   os hooks do lado do atendente: pedir, acompanhar, cancelar e baixar. */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useOrg } from '@/context/OrgContext';
import { useAuth } from '@/context/AuthContext';

export const INSS_REAL = isSupabaseConfigured && !!supabase;
const BUCKET = 'inss-docs';

export type PedidoInssStatus = 'aberto' | 'em_andamento' | 'pronto' | 'falhou' | 'cancelado';
export interface PedidoInss {
  id: string; status: PedidoInssStatus; documentos: string[];
  erro: string | null; criadoEm: string; finalizadoEm: string | null;
  /** Bancos identificados no consignado, ex. "Banco BMG (318)" — elegibilidade.
      null = o consignado NÃO foi lido nesse pedido; [] = lido e sem contrato. */
  bancos: string[] | null;
}
export interface DocumentoInss {
  id: string; pedidoId: string; titulo: string; caminho: string;
  tamanhoBytes: number | null; criadoEm: string;
}

interface DbPedido { id: string; status: PedidoInssStatus; documentos: string[] | null; erro: string | null; criado_em: string; finalizado_em: string | null; bancos: string[] | null; }
interface DbDoc { id: string; pedido_id: string; titulo: string; caminho: string; tamanho_bytes: number | null; criado_em: string; }

export function usePedidosInss(contatoId: string | null) {
  const { currentOrg } = useOrg();
  return useQuery({
    queryKey: ['inss-pedidos', currentOrg.id, contatoId],
    enabled: INSS_REAL && !!contatoId,
    refetchInterval: 15_000,
    queryFn: async (): Promise<PedidoInss[]> => {
      const { data, error } = await supabase!.from('inss_pedidos')
        .select('id,status,documentos,erro,criado_em,finalizado_em,bancos')
        .eq('organizacao_id', currentOrg.id).eq('contato_id', contatoId!)
        .order('criado_em', { ascending: false }).limit(10);
      if (error) throw new Error(error.message);
      return ((data as unknown as DbPedido[]) ?? []).map((r) => ({
        id: r.id, status: r.status, documentos: r.documentos ?? [],
        erro: r.erro, criadoEm: r.criado_em, finalizadoEm: r.finalizado_em,
        bancos: r.bancos,
      }));
    },
  });
}

export function useDocumentosInss(contatoId: string | null) {
  const { currentOrg } = useOrg();
  return useQuery({
    queryKey: ['inss-docs', currentOrg.id, contatoId],
    enabled: INSS_REAL && !!contatoId,
    refetchInterval: 20_000,
    queryFn: async (): Promise<DocumentoInss[]> => {
      const { data, error } = await supabase!.from('inss_documentos')
        .select('id,pedido_id,titulo,caminho,tamanho_bytes,criado_em')
        .eq('organizacao_id', currentOrg.id).eq('contato_id', contatoId!)
        .order('titulo', { ascending: true });
      if (error) throw new Error(error.message);
      return ((data as unknown as DbDoc[]) ?? []).map((r) => ({
        id: r.id, pedidoId: r.pedido_id, titulo: r.titulo, caminho: r.caminho,
        tamanhoBytes: r.tamanho_bytes, criadoEm: r.criado_em,
      }));
    },
  });
}

export function usePedirInss() {
  const { currentOrg } = useOrg();
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (a: { contatoId: string; nome: string; cpf: string }) => {
      const cpf = a.cpf.replace(/\D/g, '');
      if (cpf.length !== 11) throw new Error('O pedido precisa do CPF do cliente (11 números).');
      if (!a.nome.trim()) throw new Error('O pedido precisa do nome do cliente.');
      const { error } = await supabase!.from('inss_pedidos').insert({
        organizacao_id: currentOrg.id, contato_id: a.contatoId,
        nome: a.nome.trim(), cpf, solicitante_id: user?.id ?? null,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['inss-pedidos', currentOrg.id, v.contatoId] }),
  });
}

export function useCancelarPedidoInss() {
  const { currentOrg } = useOrg();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (a: { id: string; contatoId: string }) => {
      const { error } = await supabase!.from('inss_pedidos')
        .update({ status: 'cancelado' })
        .eq('id', a.id).eq('organizacao_id', currentOrg.id)
        .in('status', ['aberto', 'em_andamento']);
      if (error) throw new Error(error.message);
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['inss-pedidos', currentOrg.id, v.contatoId] }),
  });
}

/** URL assinada (1h) para baixar um PDF do bucket privado. */
export async function urlAssinadaDocInss(caminho: string): Promise<string | null> {
  const { data, error } = await supabase!.storage.from(BUCKET).createSignedUrl(caminho, 3600);
  if (error) return null;
  return data?.signedUrl ?? null;
}
