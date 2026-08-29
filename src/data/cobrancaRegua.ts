/* Régua de mensagens do Modo Cobrança (Fase C, 29/08).
   Uma MENSAGEM é uma SEQUÊNCIA de itens (bolhas): texto, imagem,
   áudio ou documento — pedido do dono: "mais de uma mensagem, áudio,
   imagem, documento". Itens em cobranca_mensagem_itens; mídia no
   bucket público cobranca-midia (template, nunca dado de cliente). */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, isDemoMode } from '@/lib/supabase';

export type TipoMensagem = 'antes' | 'cobranca' | 'depois' | 'remarketing';
export type TipoItem = 'texto' | 'imagem' | 'audio' | 'documento';

export interface CobMsgItem {
  id?: string;
  ordem: number;
  tipo: TipoItem;
  corpo: string | null;       // texto da bolha ou legenda da mídia
  midia_url: string | null;
  midia_nome: string | null;
}
export interface CobMensagem {
  id: string;
  tipo: TipoMensagem;
  nome: string;
  ativo: boolean;
  itens: CobMsgItem[];
}

export const ROTULO_TIPO_MSG: Record<TipoMensagem, string> = {
  antes: 'Lembrete (antes do vencimento)',
  cobranca: 'Cobrança (no dia)',
  depois: 'Aviso de atraso (depois)',
  remarketing: 'Remarketing (recuperação)',
};

export function useCobMensagens(orgId?: string) {
  return useQuery({
    queryKey: ['cob-mensagens', orgId],
    enabled: !!orgId && !isDemoMode,
    queryFn: async () => {
      const { data, error } = await supabase!
        .from('cobranca_mensagens')
        .select('id, tipo, nome, ativo, cobranca_mensagem_itens(id, ordem, tipo, corpo, midia_url, midia_nome)')
        .eq('organizacao_id', orgId!)
        .order('ordem', { ascending: true });
      if (error) throw error;
      return (data ?? []).map((m) => ({
        id: m.id as string,
        tipo: m.tipo as TipoMensagem,
        nome: m.nome as string,
        ativo: m.ativo as boolean,
        itens: ((m.cobranca_mensagem_itens ?? []) as CobMsgItem[]).sort((a, b) => a.ordem - b.ordem),
      })) as CobMensagem[];
    },
  });
}

/** sobe a mídia pro bucket público e devolve a URL final */
export async function uploadMidiaCobranca(orgId: string, file: File): Promise<{ url: string; nome: string }> {
  const seguro = file.name.replace(/[^\w.\-]+/g, '_').slice(-80);
  const caminho = `${orgId}/${crypto.randomUUID()}-${seguro}`;
  const { error } = await supabase!.storage.from('cobranca-midia').upload(caminho, file, { upsert: false });
  if (error) throw new Error(`Falha no upload: ${error.message}`);
  const { data } = supabase!.storage.from('cobranca-midia').getPublicUrl(caminho);
  return { url: data.publicUrl, nome: file.name };
}

/** cria/edita a mensagem e SUBSTITUI a sequência de itens (ordem = índice) */
export function useSalvarMensagem(orgId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id?: string; tipo: TipoMensagem; nome: string; itens: CobMsgItem[] }) => {
      if (!orgId) throw new Error('Sem organização.');
      let msgId = args.id;
      if (msgId) {
        const { error } = await supabase!.from('cobranca_mensagens')
          .update({ tipo: args.tipo, nome: args.nome }).eq('id', msgId);
        if (error) throw error;
        const { error: eDel } = await supabase!.from('cobranca_mensagem_itens').delete().eq('mensagem_id', msgId);
        if (eDel) throw eDel;
      } else {
        const { data, error } = await supabase!.from('cobranca_mensagens')
          .insert({ organizacao_id: orgId, tipo: args.tipo, nome: args.nome, corpo: args.itens.find((i) => i.tipo === 'texto')?.corpo ?? '' })
          .select('id').single();
        if (error) throw error;
        msgId = data!.id as string;
      }
      const linhas = args.itens.map((i, k) => ({
        organizacao_id: orgId, mensagem_id: msgId!, ordem: k,
        tipo: i.tipo, corpo: i.corpo || null, midia_url: i.midia_url, midia_nome: i.midia_nome,
      }));
      if (linhas.length) {
        const { error } = await supabase!.from('cobranca_mensagem_itens').insert(linhas);
        if (error) throw error;
      }
      return msgId!;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['cob-mensagens', orgId] }); },
  });
}

export function useAlternarMensagem(orgId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id: string; ativo: boolean }) => {
      const { error } = await supabase!.from('cobranca_mensagens').update({ ativo: args.ativo }).eq('id', args.id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['cob-mensagens', orgId] }); },
  });
}
