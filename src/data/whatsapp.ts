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

interface DbMsg { id: string; direcao: string; conteudo: string | null; tipo: string; enviada_em: string | null; recebida_em: string | null; criado_em: string | null; origem: string | null; status: string | null; }
interface DbStatusDef { id: string; nome: string; cor: string; slug: string }
interface DbConv {
  id: string; status: string; status_id: string | null; nao_lidas: number | null; ultima_interacao_em: string | null; criado_em: string | null;
  etiquetas: string[] | null;
  ultimo_canal_id: string | null; ultimo_numero: string | null; ultimo_provider: string | null; ultima_msg_canal_em: string | null;
  contatos: { id: string; nome: string; telefone: string | null; email: string | null; etiquetas: string[] | null; origem: string | null; observacoes: string | null } | null;
  canais: { id: string; nome_interno: string | null } | null;
  status_def: DbStatusDef | DbStatusDef[] | null;
  mensagens: DbMsg[] | null;
}

function tsOf(m: DbMsg): number {
  return new Date(m.enviada_em || m.recebida_em || m.criado_em || 0).getTime();
}

function mapConversa(c: DbConv): WaContact {
  const msgs: WaMessage[] = (c.mensagens ?? [])
    .filter((m) => (m.conteudo ?? '').length > 0)
    .sort((a, b) => tsOf(a) - tsOf(b))
    .map((m) => ({
      dir: m.direcao === 'saida' ? 'out' : 'in',
      text: m.conteudo ?? '',
      time: hhmm(m.enviada_em || m.recebida_em || m.criado_em),
      viaTelefone: m.origem === 'telefone',
      status: m.status ?? undefined,
    }));
  const lastMsg = msgs[msgs.length - 1];
  const chip = c.canais?.nome_interno ?? 'WhatsApp';
  const def = Array.isArray(c.status_def) ? c.status_def[0] : c.status_def;
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
    tabs: ['todos', 'meus', 'pendentes'],
    status: def?.nome ?? STATUS_LABEL[c.status] ?? c.status,
    statusId: c.status_id ?? null,
    statusCor: def?.cor ?? null,
    canalId: c.canais?.id ?? null,
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
        .select('id, status, status_id, nao_lidas, ultima_interacao_em, criado_em, etiquetas, ultimo_canal_id, ultimo_numero, ultimo_provider, ultima_msg_canal_em, contatos!inner(id, nome, telefone, email, etiquetas, origem, observacoes), canais!inner(id, nome_interno, tipo), status_def:conversa_status_def(id, nome, cor, slug), mensagens(id, direcao, conteudo, tipo, enviada_em, recebida_em, criado_em, origem, status)')
        .eq('organizacao_id', orgId)
        .eq('canais.tipo', 'whatsapp')
        .order('ultima_interacao_em', { ascending: false });
      if (error) throw new Error(error.message);
      return ((data as unknown as DbConv[]) ?? []).map(mapConversa);
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
    mutationFn: async (input: { conversaId: string; text: string; canalId?: string | null; assinaturaNome?: string }) => {
      return invoke<{ ok: boolean }>('evolution-send', {
        conversa_id: input.conversaId,
        text: input.text,
        ...(input.canalId ? { canal_id: input.canalId } : {}),
        ...(input.assinaturaNome ? { assinatura_nome: input.assinaturaNome } : {}),
      });
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
