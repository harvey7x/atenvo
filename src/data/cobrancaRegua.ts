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
  offsetDias: number | null;   // null = padrão do tipo
  hora: string | null;         // 'HH:MM' BRT; null = 09:00
  itens: CobMsgItem[];
}

/** cadência padrão por tipo (motor usa o mesmo mapa) */
export const PADRAO_OFFSET: Record<TipoMensagem, number> = { antes: -3, cobranca: 0, depois: 2, remarketing: 7 };

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
        .select('id, tipo, nome, ativo, offset_dias, hora, cobranca_mensagem_itens(id, ordem, tipo, corpo, midia_url, midia_nome)')
        .eq('organizacao_id', orgId!)
        .order('ordem', { ascending: true });
      if (error) throw error;
      return (data ?? []).map((m) => ({
        id: m.id as string,
        tipo: m.tipo as TipoMensagem,
        nome: m.nome as string,
        ativo: m.ativo as boolean,
        offsetDias: (m.offset_dias as number | null) ?? null,
        hora: m.hora ? String(m.hora).slice(0, 5) : null,
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
    mutationFn: async (args: { id?: string; tipo: TipoMensagem; nome: string; offsetDias: number | null; hora: string | null; itens: CobMsgItem[] }) => {
      if (!orgId) throw new Error('Sem organização.');
      let msgId = args.id;
      if (msgId) {
        const { error } = await supabase!.from('cobranca_mensagens')
          .update({ tipo: args.tipo, nome: args.nome, offset_dias: args.offsetDias, hora: args.hora }).eq('id', msgId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase!.from('cobranca_mensagens')
          .insert({ organizacao_id: orgId, tipo: args.tipo, nome: args.nome, offset_dias: args.offsetDias, hora: args.hora, corpo: args.itens.find((i) => i.tipo === 'texto')?.corpo ?? '' })
          .select('id').single();
        if (error) throw error;
        msgId = data!.id as string;
      }
      // troca da sequência é ATÔMICA no banco (RPC transacional) — o
      // delete+insert em 2 requests deixava mensagem ativa vazia se a
      // rede caísse no meio (achado da revisão 29/08)
      const { error: eItens } = await supabase!.rpc('cobranca_salvar_itens', {
        p_mensagem: msgId,
        p_itens: args.itens.map((i, k) => ({ ordem: k, tipo: i.tipo, corpo: i.corpo || null, midia_url: i.midia_url, midia_nome: i.midia_nome })),
      });
      if (eItens) throw new Error(eItens.message);
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

/* ---- fila de envios (motor cobranca-processar; nasce em SIMULAÇÃO) ---- */
export interface CobFilaItem {
  id: string;
  tipo: string | null;
  status: string;
  executar_em: string;
  corpo_final: string | null;
  ultimo_erro: string | null;
  dry_run: boolean;
  cliente: string;
  mensagem: string | null;
}
export function useCobFila(orgId?: string) {
  return useQuery({
    queryKey: ['cob-fila', orgId],
    enabled: !!orgId && !isDemoMode,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase!
        .from('cobranca_fila')
        .select('id, tipo, status, executar_em, corpo_final, ultimo_erro, dry_run, contato:contatos(nome), mensagem:cobranca_mensagens(nome)')
        .eq('organizacao_id', orgId!)
        .order('executar_em', { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []).map((r) => ({
        id: r.id as string, tipo: r.tipo as string | null, status: r.status as string,
        executar_em: r.executar_em as string, corpo_final: r.corpo_final as string | null,
        ultimo_erro: r.ultimo_erro as string | null, dry_run: r.dry_run as boolean,
        cliente: (r.contato as unknown as { nome: string | null } | null)?.nome ?? 'Cliente',
        mensagem: (r.mensagem as unknown as { nome: string | null } | null)?.nome ?? null,
      })) as CobFilaItem[];
    },
  });
}
/** dispara enfileirar+processar SÓ da org do gestor (tudo dry-run) */
export async function rodarSimulacao(orgId: string): Promise<Record<string, unknown>> {
  const { data, error } = await supabase!.functions.invoke('cobranca-processar', {
    body: { acao: 'ciclo', organizacao_id: orgId },
  });
  if (error) throw new Error(error.message);
  return data as Record<string, unknown>;
}

/* ---- a CHAVE do envio real (cobranca_config; default = simulação) ---- */
export function useCobConfig(orgId?: string) {
  return useQuery({
    queryKey: ['cob-config', orgId],
    enabled: !!orgId && !isDemoMode,
    queryFn: async () => {
      const { data, error } = await supabase!
        .from('cobranca_config').select('envio_real').eq('organizacao_id', orgId!).maybeSingle();
      if (error) throw error;
      return { envioReal: data?.envio_real === true };
    },
  });
}
export function useSalvarCobConfig(orgId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (envioReal: boolean) => {
      const { error } = await supabase!
        .from('cobranca_config')
        .upsert({ organizacao_id: orgId!, envio_real: envioReal }, { onConflict: 'organizacao_id' });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['cob-config', orgId] }); },
  });
}
/** converte os pendentes de HOJE para envio real (exige a chave ligada) */
export async function converterPendentesHoje(orgId: string): Promise<number> {
  const { data, error } = await supabase!.functions.invoke('cobranca-processar', {
    body: { acao: 'converter_hoje', organizacao_id: orgId },
  });
  if (error) throw new Error(error.message);
  return Number((data as Record<string, unknown>)?.convertidas ?? 0);
}
