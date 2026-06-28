import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useOrg } from '@/context/OrgContext';
import type { WaContact, WaMessage, WaUltimoCanal } from '@/data/whatsappDemo';

export const WA_REAL = isSupabaseConfigured && !!supabase;

/* ===================== Chamadas às Edge Functions ===================== */
async function invoke<T>(fn: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase!.functions.invoke(fn, { body });
  if (error) {
    let msg = error.message;
    const ed = data as { error?: string } | null;
    if (ed?.error) msg = ed.error;
    throw new Error(msg);
  }
  return data as T;
}

export interface CreateResult { canal_id: string; instance: string; qr_base64: string | null; expires_in: number; }
export const waCreateInstance = (orgId: string, alias: string, fonte: string) =>
  invoke<CreateResult>('evolution-manage', { action: 'create', organizacao_id: orgId, alias, fonte });
export const waQr = (orgId: string, canalId: string) =>
  invoke<{ qr_base64: string | null; expires_in: number }>('evolution-manage', { action: 'qr', organizacao_id: orgId, canal_id: canalId });
export const waStatus = (orgId: string, canalId: string) =>
  invoke<{ state: string; connected: boolean; numero?: string }>('evolution-manage', { action: 'status', organizacao_id: orgId, canal_id: canalId });
export const waDisconnect = (orgId: string, canalId: string) =>
  invoke<{ ok: boolean }>('evolution-manage', { action: 'disconnect', organizacao_id: orgId, canal_id: canalId });
export const waRemove = (orgId: string, canalId: string) =>
  invoke<{ ok: boolean }>('evolution-manage', { action: 'remove', organizacao_id: orgId, canal_id: canalId });

/* ===================== Mapeamento DB -> WaContact ===================== */
function hhmm(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
}
const STATUS_LABEL: Record<string, string> = {
  aberta: 'Aberta', em_atendimento: 'Em atendimento', pendente: 'Pendente', resolvida: 'Resolvida', fechada: 'Fechada',
};

interface DbMsg { id: string; direcao: string; conteudo: string | null; tipo: string; enviada_em: string | null; recebida_em: string | null; criado_em: string | null; origem: string | null; status: string | null; erro_envio: string | null; metadados: { anexo_path?: string; mime?: string; tamanho?: number; nome?: string } | null; }
const TIPOS_MIDIA = ['imagem', 'audio', 'video', 'documento'];
interface DbConv {
  id: string; status: string; status_id: string | null; nao_lidas: number | null; ultima_interacao_em: string | null; criado_em: string | null;
  etiquetas: string[] | null;
  ultimo_canal_id: string | null; ultimo_numero: string | null; ultimo_provider: string | null; ultima_msg_canal_em: string | null;
  contatos: { id: string; nome: string; telefone: string | null; email: string | null; etiquetas: string[] | null; origem: string | null; observacoes: string | null; responsavel_id: string | null } | null;
  canais: { id: string; nome_interno: string | null } | null;
  mensagens: DbMsg[] | null;
}

function tsOf(m: DbMsg): number {
  return new Date(m.enviada_em || m.recebida_em || m.criado_em || 0).getTime();
}

function mapConversa(c: DbConv): WaContact {
  const msgs: WaMessage[] = (c.mensagens ?? [])
    // mantém texto com conteúdo OU qualquer mídia (imagem/áudio/vídeo/documento) mesmo sem legenda.
    .filter((m) => (m.conteudo ?? '').length > 0 || (TIPOS_MIDIA.includes(m.tipo) && !!m.metadados?.anexo_path))
    .sort((a, b) => tsOf(a) - tsOf(b))
    .map((m) => ({
      id: m.id,
      dir: m.direcao === 'saida' ? 'out' : 'in',
      text: m.conteudo ?? '',
      time: hhmm(m.enviada_em || m.recebida_em || m.criado_em),
      viaTelefone: m.origem === 'telefone',
      status: m.status ?? undefined,
      erro: m.erro_envio ?? undefined,
      tipo: m.tipo,
      anexoPath: m.metadados?.anexo_path,
      mime: m.metadados?.mime,
      tamanho: m.metadados?.tamanho ?? null,
      nome: m.metadados?.nome,
    } as WaMessage));
  const lastMsg = msgs[msgs.length - 1];
  const chip = c.canais?.nome_interno ?? 'WhatsApp';
  // "aguardando resposta": conversa ABERTA cuja ÚLTIMA mensagem real (exclui sistema/nota_interna)
  // é de ENTRADA (cliente) — sem resposta de saída posterior do atendente.
  const aberta = c.status !== 'resolvida' && c.status !== 'fechada';
  const reais = (c.mensagens ?? []).filter((m) => m.tipo !== 'sistema' && m.tipo !== 'nota_interna');
  let ultimaReal: DbMsg | null = null;
  for (const m of reais) { if (!ultimaReal || tsOf(m) >= tsOf(ultimaReal)) ultimaReal = m; }
  const aguardando = aberta && !!ultimaReal && ultimaReal.direcao === 'entrada';
  const aguardandoDesde = aguardando ? (ultimaReal!.recebida_em || ultimaReal!.criado_em || ultimaReal!.enviada_em || null) : null;
  const lastAtMs = new Date(c.ultima_interacao_em || (ultimaReal ? (ultimaReal.recebida_em || ultimaReal.enviada_em || ultimaReal.criado_em) : null) || c.criado_em || 0).getTime();
  const ultimoCanal: WaUltimoCanal | null = c.ultimo_canal_id || c.ultimo_numero
    ? { canalId: c.ultimo_canal_id, alias: null, numero: c.ultimo_numero, provider: c.ultimo_provider, em: c.ultima_msg_canal_em }
    : null;
  return {
    id: c.id,
    name: c.contatos?.nome ?? 'Contato',
    phone: c.contatos?.telefone ?? '',
    chip,
    time: hhmm(c.ultima_interacao_em) || (lastMsg?.time ?? ''),
    unread: c.nao_lidas ?? 0,
    aberta,
    aguardando,
    aguardandoDesde,
    lastAtMs,
    tabs: ['todos', 'meus', 'pendentes'],
    status: STATUS_LABEL[c.status] ?? c.status,
    statusId: c.status_id ?? null,
    statusCor: null, // resolvido no cliente via useStatusDefs (cor/nome do status configurável)
    canalId: c.canais?.id ?? null,
    contatoId: c.contatos?.id ?? null,
    respId: c.contatos?.responsavel_id ?? null,
    last: lastMsg?.text ?? '',
    email: c.contatos?.email ?? '',
    stage: '—',
    resp: 'Não atribuído',
    origin: c.contatos?.origem ?? 'WhatsApp',
    tags: c.etiquetas ?? c.contatos?.etiquetas ?? [],
    lastInter: c.ultima_interacao_em ? new Date(c.ultima_interacao_em).toLocaleString('pt-BR') : '',
    ultimoCanal,
    notes: c.contatos?.observacoes ?? '',
    doc: null,
    msgs,
  };
}

/* ===================== Hooks ===================== */
export function useWaConversations() {
  const { currentOrg } = useOrg();
  const qc = useQueryClient();
  const orgId = currentOrg.id;

  const query = useQuery({
    queryKey: ['wa-conversas', orgId],
    enabled: WA_REAL,
    refetchInterval: 6000, // backstop caso o realtime não dispare
    queryFn: async (): Promise<WaContact[]> => {
      const { data, error } = await supabase!
        .from('conversas')
        // canais!conversas_canal_id_fkey: desambigua o embed (há 2 FKs p/ canais: canal_id e ultimo_canal_id).
        // NÃO embutimos conversa_status_def aqui: a cor/nome do status é resolvida no cliente via useStatusDefs
        // (mantém o inbox funcional mesmo que a tabela auxiliar fique inacessível por grant).
        .select('id, status, status_id, nao_lidas, ultima_interacao_em, criado_em, etiquetas, ultimo_canal_id, ultimo_numero, ultimo_provider, ultima_msg_canal_em, contatos!inner(id, nome, telefone, email, etiquetas, origem, observacoes, responsavel_id), canais!conversas_canal_id_fkey!inner(id, nome_interno, tipo), mensagens(id, direcao, conteudo, tipo, enviada_em, recebida_em, criado_em, origem, status, erro_envio, metadados)')
        .eq('organizacao_id', orgId)
        .eq('canais.tipo', 'whatsapp')
        .order('ultima_interacao_em', { ascending: false });
      if (error) throw new Error(error.message);
      const arr = ((data as unknown as DbConv[]) ?? []).map(mapConversa);
      // Ordenação: 1) abertas aguardando resposta (mais antiga primeiro);
      // 2) demais abertas por atividade mais recente; 3) encerradas por atividade.
      const rank = (x: WaContact) => (x.aguardando ? 0 : x.aberta ? 1 : 2);
      arr.sort((a, b) => {
        const ra = rank(a), rb = rank(b);
        if (ra !== rb) return ra - rb;
        if (ra === 0) return new Date(a.aguardandoDesde || 0).getTime() - new Date(b.aguardandoDesde || 0).getTime();
        return (b.lastAtMs || 0) - (a.lastAtMs || 0);
      });
      return arr;
    },
  });

  // realtime: invalida ao chegar mensagem/conversa nova
  useEffect(() => {
    if (!WA_REAL) return;
    const ch = supabase!
      .channel(`wa-${orgId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mensagens', filter: `organizacao_id=eq.${orgId}` }, () => {
        qc.invalidateQueries({ queryKey: ['wa-conversas', orgId] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversas', filter: `organizacao_id=eq.${orgId}` }, () => {
        qc.invalidateQueries({ queryKey: ['wa-conversas', orgId] });
      })
      // responsável (assumir/transferir) vive em contatos.responsavel_id → refaz a lista em tempo real
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contatos', filter: `organizacao_id=eq.${orgId}` }, () => {
        qc.invalidateQueries({ queryKey: ['wa-conversas', orgId] });
      })
      .subscribe();
    return () => { supabase!.removeChannel(ch); };
  }, [orgId, qc]);

  return query;
}

export function useSendWaMessage() {
  const { currentOrg } = useOrg();
  const qc = useQueryClient();
  return useMutation({
    // #4 assinatura aplicada no backend (evolution-send): passamos só o nome resolvido.
    // canalId = canal escolhido em "Responder por". O backend nunca confia em org vinda do cliente.
    // Retorna o id INTERNO da mensagem (para confirmação real do provedor). NÃO é garantia de entrega.
    mutationFn: async (input: { conversaId: string; text?: string; canalId?: string | null; assinaturaNome?: string; retryMensagemId?: string; midiaPath?: string; midiaTipo?: string; midiaMime?: string; midiaNome?: string; midiaTamanho?: number }) => {
      const r = await invoke<{ ok: boolean; mensagem?: { id?: string } }>('evolution-send', {
        conversa_id: input.conversaId,
        ...(input.text ? { text: input.text } : {}),
        ...(input.canalId ? { canal_id: input.canalId } : {}),
        ...(input.assinaturaNome ? { assinatura_nome: input.assinaturaNome } : {}),
        ...(input.retryMensagemId ? { retry_mensagem_id: input.retryMensagemId } : {}),
        ...(input.midiaPath ? { midia_path: input.midiaPath, midia_tipo: input.midiaTipo, midia_mime: input.midiaMime, midia_nome: input.midiaNome, midia_tamanho: input.midiaTamanho } : {}),
      });
      return r.mensagem?.id ?? null;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['wa-conversas', currentOrg.id] }),
  });
}

/** Assumir / transferir / liberar o responsável do atendimento (via Edge Function segura). */
export function useAtribuirAtendimento() {
  const { currentOrg } = useOrg();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { contatoId: string; destinoId: string | null; esperadoId: string | null }) => {
      const r = await invoke<{ ok: boolean; responsavel_id: string | null }>('atribuir-atendimento', {
        contato_id: input.contatoId, destino_id: input.destinoId, esperado_id: input.esperadoId,
      });
      return r.responsavel_id ?? null;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['wa-conversas', currentOrg.id] }),
  });
}

export interface WaCanal { id: string; alias: string; numero: string | null; status: string; provider: string | null; conectadoEm: string | null; }
export function useWaCanais() {
  const { currentOrg } = useOrg();
  return useQuery({
    queryKey: ['wa-canais', currentOrg.id],
    enabled: WA_REAL,
    queryFn: async (): Promise<WaCanal[]> => {
      // Inclui canais com exclusão lógica (removido/arquivado): o histórico permanece legível e
      // o canal aparece como indisponível para envio (#5). Apenas excluímos nada de fato.
      const { data, error } = await supabase!
        .from('canais')
        .select('id, nome_interno, numero_conectado, status_integracao, provider, conectado_em')
        .eq('organizacao_id', currentOrg.id).eq('tipo', 'whatsapp').eq('provider', 'evolution')
        .order('criado_em', { ascending: true });
      if (error) throw new Error(error.message);
      type Row = { id: string; nome_interno: string | null; numero_conectado: string | null; status_integracao: string; provider: string | null; conectado_em: string | null };
      return ((data as Row[]) ?? []).map((r) => ({
        id: r.id, alias: r.nome_interno ?? 'WhatsApp', numero: r.numero_conectado, status: r.status_integracao, provider: r.provider, conectadoEm: r.conectado_em,
      }));
    },
  });
}

/** Máscara amigável de número conectado (mostra DDI/DDD e os 4 últimos dígitos). */
export function mascararNumero(numero: string | null | undefined): string {
  const d = (numero ?? '').replace(/\D/g, '');
  if (!d) return 'Sem número';
  if (d.length <= 4) return '••' + d;
  const fim = d.slice(-4);
  const ini = d.slice(0, Math.min(4, d.length - 4));
  return `+${ini}•••••${fim}`;
}

/** Sobe um arquivo de mídia ao bucket PRIVADO `script-midia`, isolado por organização.
 *  O caminho começa pelo id da org (a Edge Function valida esse prefixo). NUNCA expõe URL pública. */
export async function subirMidiaWa(orgId: string, file: File): Promise<{ path: string; nome: string; tamanho: number; mime: string }> {
  const safe = file.name.replace(/[^\w.\-]/g, '_').slice(-80);
  const path = `${orgId}/wa-midia/${crypto.randomUUID()}-${safe}`;
  const { error } = await supabase!.storage.from('script-midia').upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false });
  if (error) throw new Error(error.message);
  return { path, nome: file.name, tamanho: file.size, mime: file.type || 'application/octet-stream' };
}

/** URL assinada CURTA para renderizar a mídia no histórico (gerada sob demanda, nunca persistida). */
export async function urlAssinadaMidiaWa(path: string): Promise<string> {
  const { data, error } = await supabase!.storage.from('script-midia').createSignedUrl(path, 600);
  if (error || !data?.signedUrl) throw new Error(error?.message || 'Falha ao gerar URL da mídia.');
  return data.signedUrl;
}
