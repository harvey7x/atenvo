import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { DEMO_MODE, acaoSimulada } from '@/lib/demo';
import { useOrg } from '@/context/OrgContext';
import type { WaContact, WaMessage, WaUltimoCanal } from '@/data/whatsappDemo';

export const WA_REAL = isSupabaseConfigured && !!supabase;

/* ===================== Chamadas às Edge Functions ===================== */
async function invoke<T>(fn: string, body: Record<string, unknown>): Promise<T> {
  if (DEMO_MODE && (fn === 'evolution-manage' || fn === 'evolution-send')) throw acaoSimulada(); // sem Evolution/WhatsApp real na demo
  const { data, error } = await supabase!.functions.invoke(fn, { body });
  if (error) {
    let msg = error.message;
    const ed = data as { error?: string } | null;
    if (ed?.error) msg = ed.error;
    else {
      // supabase-js não parseia o corpo em respostas non-2xx; lê o erro real do Response (FunctionsHttpError.context).
      const ctx = (error as { context?: Response }).context;
      if (ctx && typeof ctx.json === 'function') {
        try { const b = await ctx.clone().json() as { error?: string }; if (b?.error) msg = b.error; } catch { /* mantém msg */ }
      }
    }
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
/** "Desconectar": encerra a sessão/instância e desativa o canal — PRESERVA todo o histórico (não apaga o canal). */
export const waRemove = (orgId: string, canalId: string) =>
  invoke<{ ok: boolean }>('evolution-manage', { action: 'remove', organizacao_id: orgId, canal_id: canalId });
/** Reconectar: reusa o MESMO canal histórico e cria uma nova instância Evolution (novo QR). */
export const waReconnect = (orgId: string, canalId: string) =>
  invoke<CreateResult>('evolution-manage', { action: 'reconnect', organizacao_id: orgId, canal_id: canalId });
/** Recarregar a mídia de uma mensagem de áudio pendente (download falhou no webhook). */
export const waRecarregarAudio = (orgId: string, mensagemId: string) =>
  invoke<{ ok: boolean }>('wa-midia', { action: 'retry-audio', organizacao_id: orgId, mensagem_id: mensagemId });

/** Caso D: valida no WhatsApp (onWhatsApp) um número informado manualmente p/ conversa LID-only.
 *  Aceita só exists=true; NÃO inventa dígitos e NÃO converte LID em telefone. Lança erro claro se não existir. */
export const waValidarNumero = (conversaId: string, canalId: string, telefone: string) =>
  invoke<{ ok: boolean; exists: boolean; numero: string; numero_mascarado: string; jid: string }>(
    'evolution-send', { action: 'validar_numero', conversa_id: conversaId, canal_id: canalId, vinc_numero: telefone });
/** Caso D: confirma e vincula o PN (já validado) como identidade WhatsApp do contato (mantém o LID). */
export const waVincularNumero = (conversaId: string, canalId: string, numero: string, jid: string) =>
  invoke<{ ok: boolean; vinculado: boolean; numero_mascarado: string }>(
    'evolution-send', { action: 'vincular_numero', conversa_id: conversaId, canal_id: canalId, vinc_numero: numero, vinc_jid: jid });

/** Inbox Etapa A: arquivar/desarquivar conversa (RPC com membership). Preserva histórico/contato/oportunidade. */
export async function waArquivar(conversaId: string, arquivar: boolean): Promise<void> {
  const { error } = await supabase!.rpc('wa_arquivar_conversa', { p_conversa: conversaId, p_arquivar: arquivar });
  if (error) throw new Error(error.message);
}
/** Inbox Etapa A: marcar conversa como lida (zera não lidas) ou não lida. */
export async function waMarcarLida(conversaId: string, lida: boolean): Promise<void> {
  const { error } = await supabase!.rpc('wa_marcar_lida', { p_conversa: conversaId, p_lida: lida });
  if (error) throw new Error(error.message);
}

/** Remove uma mensagem de SAÍDA com falha (não entregue) via RPC segura. Retorna a conversa afetada.
 *  A RPC valida auth/organização/acesso e recusa mensagens entregues, lidas ou de entrada. */
export async function removerMensagemFalha(mensagemId: string): Promise<string> {
  const { data, error } = await supabase!.rpc('remover_mensagem_falha', { p_mensagem_id: mensagemId });
  if (error) throw new Error(error.message);
  return data as string;
}

/* ===================== Mapeamento DB -> WaContact ===================== */
function hhmm(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
}
const STATUS_LABEL: Record<string, string> = {
  aberta: 'Aberta', em_atendimento: 'Em atendimento', pendente: 'Pendente', resolvida: 'Resolvida', fechada: 'Fechada',
};

interface DbMsg { id: string; direcao: string; conteudo: string | null; tipo: string; enviada_em: string | null; recebida_em: string | null; criado_em: string | null; origem: string | null; status: string | null; erro_envio: string | null; metadados: { anexo_path?: string; mime?: string; tamanho?: number; nome?: string; midia_pendente?: boolean } | null; }
const TIPOS_MIDIA = ['imagem', 'audio', 'video', 'documento'];
interface DbConv {
  id: string; status: string; status_id: string | null; nao_lidas: number | null; ultima_interacao_em: string | null; criado_em: string | null;
  precisa_humano: boolean | null;
  etiquetas: string[] | null;
  ultimo_canal_id: string | null; ultimo_numero: string | null; ultimo_provider: string | null; ultima_msg_canal_em: string | null;
  arquivada_em: string | null; fixada_em: string | null; silenciada_ate: string | null; ultima_lida_em: string | null;
  contatos: { id: string; nome: string; telefone: string | null; email: string | null; etiquetas: string[] | null; origem: string | null; observacoes: string | null; responsavel_id: string | null; contato_identidades: { tipo: string }[] | null } | null;
  canais: { id: string; nome_interno: string | null } | null;
  mensagens: DbMsg[] | null;
}

function tsOf(m: DbMsg): number {
  return new Date(m.enviada_em || m.recebida_em || m.criado_em || 0).getTime();
}

function mapConversa(c: DbConv): WaContact {
  const msgs: WaMessage[] = (c.mensagens ?? [])
    // mantém texto com conteúdo OU qualquer mídia (imagem/áudio/vídeo/documento) mesmo sem legenda;
    // também mantém mídia PENDENTE (download falhou) para mostrar "indisponível" + recarregar.
    .filter((m) => (m.conteudo ?? '').length > 0 || (TIPOS_MIDIA.includes(m.tipo) && (!!m.metadados?.anexo_path || !!m.metadados?.midia_pendente)))
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
      midiaPendente: !!m.metadados?.midia_pendente,
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
  // Caso D / @lid: nunca exibir um LID cru como nome. Se JÁ há telefone (resolvido), mostra o número
  // mesmo que o nome tenha ficado como placeholder; só sem telefone → "Identidade protegida".
  const temPn = (c.contatos?.contato_identidades ?? []).some((i) => i.tipo === 'whatsapp');
  const nomeCru = c.contatos?.nome ?? null;
  const tel = c.contatos?.telefone ?? null;
  const ehLidCru = !!nomeCru && /^[0-9]{12,}$/.test(nomeCru) && !tel && !temPn;
  const ehPlaceholder = nomeCru === 'Identidade protegida' || ehLidCru;
  const displayName = ehPlaceholder ? (tel ?? 'Identidade protegida') : (nomeCru ?? 'Contato');
  return {
    id: c.id,
    name: displayName,
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
    // Caso D: sem destino confirmado = contato sem identidade WhatsApp (PN). LID não conta como destino.
    semDestino: !temPn,
    arquivada: !!c.arquivada_em,
    precisaHumano: !!c.precisa_humano,
    fixada: !!c.fixada_em,
    silenciada: !!c.silenciada_ate && new Date(c.silenciada_ate).getTime() > Date.now(),
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
        .select('id, status, status_id, nao_lidas, ultima_interacao_em, criado_em, precisa_humano, etiquetas, ultimo_canal_id, ultimo_numero, ultimo_provider, ultima_msg_canal_em, arquivada_em, fixada_em, silenciada_ate, ultima_lida_em, contatos!inner(id, nome, telefone, email, etiquetas, origem, observacoes, responsavel_id, contato_identidades(tipo)), canais!conversas_canal_id_fkey!inner(id, nome_interno, tipo), mensagens(id, direcao, conteudo, tipo, enviada_em, recebida_em, criado_em, origem, status, erro_envio, metadados)')
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
    mutationFn: async (input: { conversaId: string; text?: string; canalId?: string | null; assinaturaNome?: string; retryMensagemId?: string; midiaPath?: string; midiaTipo?: string; midiaMime?: string; midiaNome?: string; midiaTamanho?: number; audioDiag?: Record<string, unknown>; origemAudio?: string }) => {
      const r = await invoke<{ ok: boolean; mensagem?: { id?: string } }>('evolution-send', {
        conversa_id: input.conversaId,
        ...(input.text ? { text: input.text } : {}),
        ...(input.canalId ? { canal_id: input.canalId } : {}),
        ...(input.assinaturaNome ? { assinatura_nome: input.assinaturaNome } : {}),
        ...(input.retryMensagemId ? { retry_mensagem_id: input.retryMensagemId } : {}),
        ...(input.midiaPath ? { midia_path: input.midiaPath, midia_tipo: input.midiaTipo, midia_mime: input.midiaMime, midia_nome: input.midiaNome, midia_tamanho: input.midiaTamanho } : {}),
        ...(input.audioDiag ? { audio_diag: input.audioDiag } : {}),
        ...(input.origemAudio ? { origem_audio: input.origemAudio } : {}),
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
    mutationFn: async (input: { contatoId: string; destinoId: string | null; esperadoId: string | null; conversaId?: string | null; motivo?: string | null }) => {
      const r = await invoke<{ ok: boolean; responsavel_id: string | null }>('atribuir-atendimento', {
        contato_id: input.contatoId, destino_id: input.destinoId, esperado_id: input.esperadoId,
        ...(input.conversaId ? { conversa_id: input.conversaId } : {}),
        ...(input.motivo ? { motivo: input.motivo } : {}),
      });
      return r.responsavel_id ?? null;
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['wa-conversas', currentOrg.id] });
      qc.invalidateQueries({ queryKey: ['wa-atividades'] });
      // Responsável é sincronizado no backend (trigger) para conversas + oportunidades.
      // Invalida o Kanban para o card refletir o novo responsável imediatamente.
      qc.invalidateQueries({ queryKey: ['kanban-leads', currentOrg.id] });
      qc.invalidateQueries({ queryKey: ['opp-do-contato', currentOrg.id] });
    },
  });
}

/** Colaboração Etapa 1: timeline de atividade da conversa (assumido/transferido/devolvido/…). Leitura RLS. */
export interface WaAtividade { id: string; tipo: string; usuario: string | null; motivo: string | null; em: string; }
export function useWaAtividades(conversaId: string | null) {
  return useQuery({
    queryKey: ['wa-atividades', conversaId],
    enabled: WA_REAL && !!conversaId,
    queryFn: async (): Promise<WaAtividade[]> => {
      const { data, error } = await supabase!.from('conversa_atividades')
        .select('id, tipo, motivo, criado_em, usuario:usuarios(nome)')
        .eq('conversa_id', conversaId as string).order('criado_em', { ascending: false }).limit(50);
      if (error) throw new Error(error.message);
      type Row = { id: string; tipo: string; motivo: string | null; criado_em: string; usuario: { nome: string } | { nome: string }[] | null };
      return ((data as Row[]) ?? []).map((r) => ({
        id: r.id, tipo: r.tipo, motivo: r.motivo, em: r.criado_em,
        usuario: (Array.isArray(r.usuario) ? r.usuario[0]?.nome : r.usuario?.nome) ?? null,
      }));
    },
  });
}

/** Normaliza telefone p/ casar com o formato do webhook (dígitos; BR ganha DDI 55).
 *  Retorna null quando não há dígitos suficientes. */
export function normalizeWaPhone(raw: string): string | null {
  const d = (raw || '').replace(/\D/g, '');
  if (d.length < 10) return null;
  if (d.startsWith('55') && d.length >= 12) return d;     // já com DDI BR (55 + DDD + número)
  if (d.length === 10 || d.length === 11) return '55' + d; // BR sem DDI
  return d;                                                // internacional: mantém
}

/** Inicia (ou REUTILIZA) uma conversa de WhatsApp por telefone — sem duplicar.
 *  Reuso espelha o webhook: conversa não-fechada existente no canal é reaproveitada;
 *  se só houver encerrada, cria uma nova. NUNCA aceita organizacao_id do cliente. */
export function useIniciarConversaWa() {
  const { currentOrg } = useOrg();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { canalId: string; telefone: string; nome?: string }): Promise<{ conversaId: string; reused: boolean }> => {
      const org = currentOrg.id;
      if (!input.canalId) throw new Error('Selecione um WhatsApp conectado.');
      const norm = normalizeWaPhone(input.telefone);
      if (!norm) throw new Error('Informe um telefone válido.');
      // 1) contato por identidade whatsapp normalizada → depois por telefone (mesma lógica do webhook)
      let contatoId: string | null = null;
      const { data: ident } = await supabase!.from('contato_identidades')
        .select('contato_id').eq('organizacao_id', org).eq('tipo', 'whatsapp').eq('valor_normalizado', norm).maybeSingle();
      if (ident?.contato_id) contatoId = ident.contato_id as string;
      if (!contatoId) {
        const { data: ct } = await supabase!.from('contatos').select('id').eq('organizacao_id', org).eq('telefone', norm).is('mesclado_em', null).maybeSingle();
        if (ct?.id) contatoId = ct.id as string;
      }
      // 2/3) conversa NÃO fechada existente no canal → reutiliza (não duplica)
      if (contatoId) {
        const { data: conv } = await supabase!.from('conversas')
          .select('id').eq('organizacao_id', org).eq('contato_id', contatoId).eq('canal_id', input.canalId)
          .neq('status', 'fechada').order('criado_em', { ascending: false }).limit(1).maybeSingle();
        if (conv?.id) return { conversaId: conv.id as string, reused: true };
      } else {
        // 5) cria contato (nome informado ou telefone como rótulo temporário)
        const nome = (input.nome || '').trim() || norm;
        const { data: novo, error: e1 } = await supabase!.from('contatos')
          .insert({ nome, telefone: norm, origem: 'WhatsApp', organizacao_id: org }).select('id').single();
        if (e1 || !novo) throw new Error('Não foi possível iniciar a conversa.');
        contatoId = novo.id as string;
        // identidade whatsapp (best-effort; espelha o webhook p/ dedup quando o cliente responder)
        await supabase!.from('contato_identidades').insert({ contato_id: contatoId, organizacao_id: org, tipo: 'whatsapp', provedor: 'evolution', valor: norm, valor_normalizado: norm, principal: true });
      }
      // 6) cria a conversa (status 'aberta', sem responsável inicial)
      const { data: nc, error: e2 } = await supabase!.from('conversas')
        .insert({ organizacao_id: org, contato_id: contatoId, canal_id: input.canalId, status: 'aberta' }).select('id').single();
      if (e2 || !nc) throw new Error('Não foi possível iniciar a conversa.');
      return { conversaId: nc.id as string, reused: false };
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['wa-conversas', currentOrg.id] }),
  });
}

export interface WaCanal {
  id: string; alias: string; numero: string | null; status: string; provider: string | null; conectadoEm: string | null;
  /** true quando o número está com restrição de conta no WhatsApp -> bloqueado só para ENVIO (recebe normal). */
  envioRestrito: boolean;
  // metadados comerciais (configuráveis em Integrações)
  origemTipo: string | null; gestorId: string | null; gestorNome: string | null; fonteId: string | null; campanha: string | null; observacaoComercial: string | null;
}
export type EnvioSaudeEstado = 'ok' | 'instavel' | 'indisponivel';
export interface CanalEnvioSaude { estado: EnvioSaudeEstado; falhasConsecutivas: number; total: number; falhas: number }

/** Classifica a saúde de ENVIO a partir dos status das últimas saídas (mais RECENTE primeiro).
 *  Pura e testável. Baseia-se na taxa REAL de falha — NÃO no state=open.
 *  - indisponivel: >=3 saídas mais recentes seguidas com falha (ex.: o "0/N" do incidente);
 *  - instavel: última saída falhou, ou >=40% de falha na janela (com algum sucesso);
 *  - ok: caso contrário. Um sucesso na frente derruba o alerta (volta a saudável só com evidência). */
export function avaliarEnvioSaude(statusesRecentePrimeiro: string[]): CanalEnvioSaude {
  const total = statusesRecentePrimeiro.length;
  const falhas = statusesRecentePrimeiro.filter((s) => s === 'falhou').length;
  let consec = 0;
  for (const s of statusesRecentePrimeiro) { if (s === 'falhou') consec++; else break; }
  let estado: EnvioSaudeEstado = 'ok';
  if (consec >= 3) estado = 'indisponivel';
  else if (consec >= 1 || (total >= 3 && falhas / total >= 0.4)) estado = 'instavel';
  return { estado, falhasConsecutivas: consec, total, falhas };
}

/** Saúde de envio do canal a partir da taxa real de falha das últimas saídas (janela de 2h, últimas 10). */
export function useWaCanalEnvioSaude(canalId: string | null | undefined) {
  return useQuery({
    queryKey: ['wa-canal-envio-saude', canalId],
    enabled: WA_REAL && !!canalId,
    refetchInterval: 20000,
    queryFn: async (): Promise<CanalEnvioSaude> => {
      const desde = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase!
        .from('mensagens')
        .select('status, conversas!inner(canal_id)')
        .eq('conversas.canal_id', canalId!)
        .eq('direcao', 'saida')
        .gte('criado_em', desde)
        .order('criado_em', { ascending: false })
        .limit(10);
      if (error) throw new Error(error.message);
      const rows = (data as unknown as { status: string }[]) ?? [];
      return avaliarEnvioSaude(rows.map((r) => r.status));
    },
  });
}

export function useWaCanais() {
  const { currentOrg } = useOrg();
  return useQuery({
    queryKey: ['wa-canais', currentOrg.id],
    enabled: WA_REAL,
    queryFn: async (): Promise<WaCanal[]> => {
      // Lista apenas canais vigentes. A remoção agora é DEFINITIVA no servidor (Edge Function
      // evolution-manage/remove exclui o registro), então canais 'removido' não devem aparecer aqui.
      const { data, error } = await supabase!
        .from('canais')
        .select('id, nome_interno, numero_conectado, status_integracao, provider, conectado_em, envio_restrito, origem_tipo, gestor_id, fonte_aquisicao_id, campanha, observacao_comercial, gestor:usuarios(nome)')
        .eq('organizacao_id', currentOrg.id).eq('tipo', 'whatsapp').eq('provider', 'evolution')
        .neq('status_integracao', 'removido')
        .order('criado_em', { ascending: true });
      if (error) throw new Error(error.message);
      type Row = { id: string; nome_interno: string | null; numero_conectado: string | null; status_integracao: string; provider: string | null; conectado_em: string | null; envio_restrito: boolean | null; origem_tipo: string | null; gestor_id: string | null; fonte_aquisicao_id: string | null; campanha: string | null; observacao_comercial: string | null; gestor: { nome: string } | { nome: string }[] | null };
      return ((data as Row[]) ?? []).map((r) => ({
        id: r.id, alias: r.nome_interno ?? 'WhatsApp', numero: r.numero_conectado, status: r.status_integracao, provider: r.provider, conectadoEm: r.conectado_em, envioRestrito: Boolean(r.envio_restrito),
        origemTipo: r.origem_tipo, gestorId: r.gestor_id, gestorNome: (Array.isArray(r.gestor) ? r.gestor[0]?.nome : r.gestor?.nome) ?? null, fonteId: r.fonte_aquisicao_id, campanha: r.campanha, observacaoComercial: r.observacao_comercial,
      }));
    },
  });
}

/* ===================== Limite de WhatsApp (fonte única de verdade) =====================
 * Mesma regra do backend (evolution-manage): limite efetivo = organizacao_limites.limite_whatsapps
 * (coluna GERADA = whatsapps_incluidos + whatsapps_adicionais) e "usados" = canais tipo=whatsapp ativo=true.
 * Não conta canais removidos (linha excluída), Facebook, criações que falharam (revertidas) nem outra org. */
export interface WaLimite { usados: number; limite: number; incluidos: number; adicionais: number; atingido: boolean; }
export function useWaLimite() {
  const { currentOrg } = useOrg();
  return useQuery({
    queryKey: ['wa-limite', currentOrg.id],
    enabled: WA_REAL,
    queryFn: async (): Promise<WaLimite> => {
      const { data: lim, error } = await supabase!
        .from('organizacao_limites')
        .select('whatsapps_incluidos, whatsapps_adicionais, limite_whatsapps')
        .eq('organizacao_id', currentOrg.id).single();
      if (error) throw new Error(error.message);
      const { count, error: e2 } = await supabase!
        .from('canais')
        .select('id', { count: 'exact', head: true })
        .eq('organizacao_id', currentOrg.id).eq('tipo', 'whatsapp').eq('ativo', true);
      if (e2) throw new Error(e2.message);
      const usados = count ?? 0;
      const limite = (lim as { limite_whatsapps: number }).limite_whatsapps ?? 0;
      return {
        usados, limite,
        incluidos: (lim as { whatsapps_incluidos: number }).whatsapps_incluidos ?? 0,
        adicionais: (lim as { whatsapps_adicionais: number }).whatsapps_adicionais ?? 0,
        atingido: usados >= limite,
      };
    },
  });
}

/* ===================== Saúde das conexões (diagnóstico real, read-only) ===================== */
export interface WaHealthL10 { hora: string; status: string; destino: string; erro: string | null }
export interface WaHealthCanal {
  canalId: string; nome: string; numeroMasc: string; instancia: string | null;
  statusIntegracao: string; ativo: boolean; evoState: string | null; webhookOk: boolean | null; versao: string | null;
  estado: string; cor: 'verde' | 'amarelo' | 'laranja' | 'vermelho'; recebimento: string; envio: string;
  enviados: number; entregues: number; erros: number; consecErros: number; taxa: number | null;
  lastInbound: string | null; lastDelivered: string | null; lastWebhook: string | null; lastWebhookEvent: string | null;
  lastErrorAt: string | null; lastErrorMsg: string | null; last10: WaHealthL10[]; recomendacao: string;
}
export interface WaHealthResp { canais: WaHealthCanal[]; evolutionVersion: string | null; podeAgir: boolean }
/** Diagnóstico de saúde de TODAS as conexões WhatsApp da org (Edge Function protegida, read-only). */
export function useWaHealth() {
  const { currentOrg } = useOrg();
  return useQuery({
    queryKey: ['wa-health', currentOrg.id],
    enabled: WA_REAL,
    refetchInterval: 60_000,
    queryFn: () => invoke<WaHealthResp>('wa-health', { organizacao_id: currentOrg.id, action: 'status' }),
  });
}
/* ===================== Configuração comercial da conexão ===================== */
export interface FonteAquisicao { id: string; nome: string }
export function useFontesAquisicao() {
  const { currentOrg } = useOrg();
  return useQuery({
    queryKey: ['fontes-aquisicao', currentOrg.id], enabled: WA_REAL,
    queryFn: async (): Promise<FonteAquisicao[]> => {
      const { data, error } = await supabase!.from('fontes_aquisicao').select('id, nome').eq('organizacao_id', currentOrg.id).eq('ativo', true).order('nome');
      if (error) throw new Error(error.message);
      return (data as FonteAquisicao[]) ?? [];
    },
  });
}
export interface ComercialInput { nome_interno: string; origem_tipo: string | null; gestor_id: string | null; fonte_aquisicao_id: string | null; campanha: string | null; observacao_comercial: string | null; }
/** Persiste os metadados comerciais via RPC (autorização admin/supervisor validada no banco). */
export async function waUpdateComercial(canalId: string, c: ComercialInput): Promise<void> {
  const { error } = await supabase!.rpc('atualizar_canal_comercial', {
    p_canal: canalId, p_nome: c.nome_interno?.trim() || 'WhatsApp', p_origem_tipo: c.origem_tipo || null, p_gestor_id: c.gestor_id || null,
    p_fonte_aquisicao_id: c.fonte_aquisicao_id || null, p_campanha: c.campanha?.trim() || null, p_observacao: c.observacao_comercial?.trim() || null,
  });
  if (error) throw new Error(error.message);
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

/* ===================== Alerta global de canais WhatsApp (F2) ===================== */
export type WaAlertaSeveridade = 'critico' | 'alto' | 'medio';
export interface WaAlertaGlobalItem {
  canal_id: string;
  nome_interno: string;
  severidade: WaAlertaSeveridade;
  tipo_alerta: 'envio_restrito' | 'health_falha' | 'desconectado' | 'health_atencao';
  titulo: string;
  acao_label: string;
  acao_url: string;
}
export interface WaAlertasGlobais {
  total: number;
  criticos: number;
  altos: number;
  medios: number;
  severidade_max: number;
  acao_url: string;
  itens: WaAlertaGlobalItem[];
}

/** Alertas globais dos canais WhatsApp (só problemas ativos e não silenciados). Refetch leve, sem probe ao vivo. */
export function useWaAlertasGlobais() {
  const { currentOrg } = useOrg();
  return useQuery({
    queryKey: ['wa-alertas-globais', currentOrg.id],
    enabled: WA_REAL && !!currentOrg.id,
    staleTime: 60_000,
    refetchInterval: 120_000,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<WaAlertasGlobais> => {
      const { data, error } = await supabase!.rpc('wa_canais_alertas_globais', { p_org: currentOrg.id });
      if (error) throw new Error(error.message);
      return (data ?? { total: 0, criticos: 0, altos: 0, medios: 0, severidade_max: 0, acao_url: '/integracoes', itens: [] }) as WaAlertasGlobais;
    },
  });
}

/** Silenciar alerta de um canal (admin/supervisor). p_ate null = "até reconexão". */
export function useSilenciarAlertaCanal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { canalId: string; ate: string | null; motivo: string }) => {
      const { error } = await supabase!.rpc('wa_canal_silenciar_alerta', { p_canal: p.canalId, p_ate: p.ate, p_motivo: p.motivo });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wa-alertas-globais'] });
      qc.invalidateQueries({ queryKey: ['wa-canais'] });
    },
  });
}

/** Reativar alerta de um canal (admin/supervisor). */
export function useReativarAlertaCanal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (canalId: string) => {
      const { error } = await supabase!.rpc('wa_canal_reativar_alerta', { p_canal: canalId });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wa-alertas-globais'] });
      qc.invalidateQueries({ queryKey: ['wa-canais'] });
    },
  });
}
