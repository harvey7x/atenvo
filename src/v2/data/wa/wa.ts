/* Camada de dados da mensageria WhatsApp da Reviza (só reviza — usa o Supabase
   dedicado + as edge functions reviza-wa-*). Canais (um por atendente, como na
   demo), conversas, mensagens, envio, régua (modelo da demo) e fila de envios.
   Polling simples (sem realtime) no v1. */
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { registrarDesfazer, registrarBloqueada } from '../desfazer';
import type { Bloco } from '../../pages/cobrancaMotor';

export type EstadoCanal = 'desconectado' | 'conectando' | 'conectado';
export interface CanalWA {
  id: string; nome: string; instancia: string; numero: string | null; estado: EstadoCanal; qr: string | null; dono_id: string | null;
  ultimo_erro: string | null; ultimo_evento_em: string | null; verificado_em: string | null;
}
/** mig 86 (dono 06/11: "a tela aparece pra todos"): o MESMO canal, mas SEM qr/instancia — o que
    qualquer atendente ativo pode ver de todo mundo (quem tá conectado), sem risco de sequestrar a
    sessão de ninguém. A ação (conectar/gerenciar) continua vendo o canal de verdade, e só no seu. */
export type CanalEquipeWA = Omit<CanalWA, 'instancia' | 'qr'>;
export interface ConversaWA { id: string; canal_id: string; telefone: string; nome_contato: string | null; lead_id: string | null; ultima_previa: string | null; ultima_em: string | null; nao_lidas: number; digitando_ate: string | null; }
export interface MensagemWA { id: string; conversa_id: string; direcao: 'entrada' | 'saida'; tipo: string; conteudo: string | null; midia_path: string | null; resposta_a: string | null; apagada: boolean; status: string; created_at: string; }
export type TipoMidiaWA = 'imagem' | 'video' | 'audio' | 'documento';
export interface ReguaMsgWA {
  id: string; alvo: 'padrao' | 'grupo' | 'cliente' | 'script'; nome: string; quando: number; blocos: Bloco[];
  grupo_nome: string | null; criterio: string | null; cli_id: string | null; cli_nome: string | null; data_envio: string | null; ativo: boolean;
}
/** régua própria de um comercial (mig 74): a versão de UM passo da sequência padrão.
    `comercial` = nome normalizado (sem acento, MAIÚSCULO) — igual ao que o motor compara. */
export interface ReguaVersaoWA {
  id: string; passo_id: string; comercial: string; blocos: Bloco[]; atualizado_em: string | null; atualizado_por: string | null;
  /** mig 75: o passo foi EXCLUÍDO da régua deste comercial (não sai pros clientes dele) */
  excluida: boolean;
  /** mig 76: dia próprio deste comercial (dias em relação ao vencimento); null = o da padrão */
  quando: number | null;
}
/** a chave do comercial — a MESMA conta do banco (wa_nome_chave) e do motor (normNome) */
export const chaveComercial = (s: string | null | undefined) =>
  String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toUpperCase();
export interface FilaEnvioWA {
  id: string; envio_id: string; telefone: string; nome: string | null; status: string; erro: string | null; enviado_em: string | null; created_at: string;
  wa_envios?: { nome: string; wa_canais?: { nome: string } | null } | null;
}
export interface EnvioWA {
  id: string; nome: string; canal_id: string | null; modelo: string; estado: 'rascunho' | 'enviando' | 'concluido' | 'cancelado';
  total: number; enviados: number; erros: number; agendado_para: string | null; created_at: string;
  origem: 'manual' | 'regua'; passo_nome: string | null; passo_quando: number | null; blocos: Bloco[] | null;
  criado_por: string | null; pulados: number;
}
/** um destinatário de um envio — o RASTRO completo (tela Envios) */
export type StatusAlvoWA = 'pendente' | 'enviando' | 'enviado' | 'erro' | 'pulado' | 'cancelado';
export interface AlvoWA {
  id: string; envio_id: string; telefone: string; nome: string | null; lead_id: string | null; status: StatusAlvoWA;
  erro: string | null; motivo: string | null; enviado_em: string | null; created_at: string;
  canal_id: string | null; canal_nome: string | null; canal_numero: string | null; conversa_id: string | null;
  mensagem: string | null; comp: string | null; venc: string | null; regua_msg_id: string | null; passo_nome: string | null;
  entrega: 'enviada' | 'entregue' | 'lida' | null; entregue_em: string | null; lida_em: string | null;
  respondeu_em: string | null; resposta_previa: string | null; tentativas: number; tentar_apos: string | null; parte_atual: number | null;
  wa_envios?: { nome: string; origem: 'manual' | 'regua'; canal_id: string | null; agendado_para: string | null; estado: string } | null;
}
export interface ResumoEnviosWA { enviadas: number; entregues: number; lidas: number; responderam: number; erros: number; pulados: number; na_fila: number; agendados: number; optouts: number }
export interface ProgressoPassoWA { regua_msg_id: string | null; passo_nome: string | null; status: string; entrega: string | null; respondeu: boolean; n: number }
/** prévia do motor: quem recebe o quê em cada dia (a MESMA conta do disparo) */
export type StatusPreviaWA = 'vai_receber' | 'gerado' | 'pulado' | 'aguardando';
export interface ItemPreviaWA {
  data: string; lead_id: string; nome: string; comercial: string; telefone: string | null; dia: number | null;
  passo_id: string; passo_nome: string; quando: number; alvo: string; comp: string | null; venc: string | null;
  status: StatusPreviaWA; motivo: string | null; envio_id: string | null; falta: string | null; texto: string | null;
  numero: { id: string; nome: string; numero: string | null; reserva: boolean } | null;
}
export interface CoberturaWA {
  comercial: string; clientes: number; com_telefone: number; motivo: string | null;
  numero: { id: string; nome: string; numero: string | null; conectado: boolean; reserva: boolean } | null;
}
export interface PreviaWA { hoje: string; de: string; ate: string; itens: ItemPreviaWA[]; cobertura: CoberturaWA[]; config: ReguaConfigWA }
export interface RodadaWA { id: number; inicio: string; fim: string | null; fonte: string; regua: { gerados: number; por_passo: Record<string, number>; pulados: Record<string, number>; aguardando: Record<string, number>; falta_dado: number } | null; enviadas: number; falhas: number; puladas: number; erro: string | null }
export interface OptoutWA { chave: string; telefone: string | null; lead_id: string | null; origem: 'cliente' | 'manual'; texto: string | null; criado_em: string }
export interface NovoEnvioWA {
  nome: string; canal_id: string; texto: string;
  /** compositor completo (texto/áudio/foto/vídeo/documento na ordem, com espera) — tem prioridade sobre texto/mídia */
  blocos?: Bloco[];
  /** ISO do agendamento; null = agora (o motor processa em seguida) */
  agendado_para: string | null;
  alvos: { telefone: string; nome?: string | null; lead_id?: string | null }[];
  /** até 4 textos ALTERNATIVOS (com o principal, 5 variações alternadas por alvo — anti-ban) */
  variantes?: string[];
  midia?: { path: string; tipo: TipoMidiaWA; nome: string } | null;
  delay_min?: number; delay_max?: number;      // intervalo de segurança (s) entre mensagens
  presenca?: boolean;                          // simular "digitando/gravando" antes de cada envio
}

/** sobe um arquivo pro bucket wa-midia e devolve o path (usado por chat e envios) */
export async function subirMidiaWA(arquivo: Blob, nome: string): Promise<string> {
  const limpo = nome.replace(/[^A-Za-z0-9._-]/g, '_').slice(-80) || 'arquivo';
  const path = `saida/${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}-${limpo}`;
  const { error } = await supabase!.storage.from('wa-midia').upload(path, arquivo, { contentType: arquivo.type || undefined, upsert: false });
  if (error) throw new Error(error.message);
  return path;
}
/** URL assinada pra RENDER de mídia (1h); cacheada pelo componente */
export async function urlMidiaWA(path: string): Promise<string | null> {
  const { data } = await supabase!.storage.from('wa-midia').createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}
/** tipo de mídia a partir do MIME do arquivo escolhido */
export function tipoDaMidia(mime: string): TipoMidiaWA {
  if (mime.startsWith('image/')) return 'imagem';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return 'documento';
}

const K = {
  canais: ['reviza', 'wa', 'canais'] as const,
  canaisEquipe: ['reviza', 'wa', 'canais-equipe'] as const,
  conversas: ['reviza', 'wa', 'conversas'] as const,
  mensagens: (id: string) => ['reviza', 'wa', 'mensagens', id] as const,
  regua: ['reviza', 'wa', 'regua'] as const,
  reguaVersoes: ['reviza', 'wa', 'regua-versoes'] as const,
  reguaCfg: ['reviza', 'wa', 'regua-cfg'] as const,
  fila: ['reviza', 'wa', 'fila'] as const,
  envios: ['reviza', 'wa', 'envios'] as const,
  alvos: ['reviza', 'wa', 'alvos'] as const,
  resumo: ['reviza', 'wa', 'resumo'] as const,
  progresso: ['reviza', 'wa', 'progresso'] as const,
  previa: ['reviza', 'wa', 'previa'] as const,
  rodadas: ['reviza', 'wa', 'rodadas'] as const,
  optout: ['reviza', 'wa', 'optout'] as const,
};

async function invocar(fn: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { data, error } = await supabase!.functions.invoke(fn, { body });
  if (error) {
    let msg = error.message;
    try { const j = await (error as { context?: Response }).context?.json?.(); if (j?.error) msg = j.error; } catch { /* ignore */ }
    throw new Error(msg);
  }
  const d = (data ?? {}) as Record<string, unknown>;
  if (d.error) throw new Error(String(d.error));
  if (d.ok === false && d.erro) throw new Error(String(d.erro));
  return d;
}

/* ---------- canais (um por atendente, como na demo) ---------- */
export function useCanaisWA(habilitado = true) {
  return useQuery<CanalWA[]>({
    queryKey: K.canais,
    enabled: habilitado && !!supabase,
    refetchInterval: (q) => ((q.state.data ?? []).some((c) => c.estado === 'conectando') ? 3000 : 15000),
    queryFn: async () => {
      const { data, error } = await supabase!.from('wa_canais')
        .select('id, nome, instancia, numero, estado, qr, dono_id, ultimo_erro, ultimo_evento_em, verificado_em').order('created_at');
      if (error) throw new Error(error.message);
      return (data ?? []) as CanalWA[];
    },
  });
}
/** quadro "quem tá conectado" da equipe inteira (mig 86) — qualquer atendente ativo vê todo mundo,
    sem qr/instancia. `useCanaisWA` continua sendo a fonte pra abrir/gerenciar o SEU canal (a RLS da
    tabela de verdade já restringe ao dono ou gestor — é ali que mora o QR). */
export function useCanaisEquipeWA(habilitado = true) {
  return useQuery<CanalEquipeWA[]>({
    queryKey: K.canaisEquipe,
    enabled: habilitado && !!supabase,
    refetchInterval: (q) => ((q.state.data ?? []).some((c) => c.estado === 'conectando') ? 3000 : 15000),
    queryFn: async () => {
      const { data, error } = await supabase!.rpc('wa_canais_visao_equipe');
      if (error) throw new Error(error.message);
      return (data ?? []) as CanalEquipeWA[];
    },
  });
}
function useInvCanais() {
  const qc = useQueryClient();
  return () => { void qc.invalidateQueries({ queryKey: K.canais }); void qc.invalidateQueries({ queryKey: K.canaisEquipe }); void qc.invalidateQueries({ queryKey: K.previa }); };
}
/** cria (ou reaproveita) o canal daquele atendente e devolve o QR.
    dono_id = usuário do atendente: só ele e gestor/admin veem as conversas do número. */
export function useConectarWA() {
  const inv = useInvCanais();
  return useMutation({ mutationFn: (a: { nome: string; dono_id?: string | null }) => invocar('reviza-wa-instancia', { acao: 'create', nome: a.nome, dono_id: a.dono_id ?? null }), onSuccess: () => { inv(); registrarBloqueada('conectar número', 'Conexão de número é feita na Evolution — desconecte pela tela de Números se precisar.'); } });
}
export function useNovoQrWA() {
  const inv = useInvCanais();
  return useMutation({ mutationFn: (canalId: string) => invocar('reviza-wa-instancia', { acao: 'qr', canal_id: canalId }), onSuccess: inv });
}
export function useStatusWA() {
  const inv = useInvCanais();
  return useMutation({ mutationFn: (canalId: string) => invocar('reviza-wa-instancia', { acao: 'status', canal_id: canalId }), onSuccess: inv });
}
export function useDesconectarWA() {
  const inv = useInvCanais();
  return useMutation({ mutationFn: (canalId: string) => invocar('reviza-wa-instancia', { acao: 'logout', canal_id: canalId }), onSuccess: () => { inv(); registrarBloqueada('desconectar número', 'Reconecte pela tela de Números (novo QR) se precisar.'); } });
}
/** remove o número (desconecta na Evolution e apaga o canal — as conversas dele saem junto) */
/** confere a sessão na Evolution + a configuração do webhook (reaplica se faltar) — não envia nada */
export function useVerificarCanalWA() {
  const inv = useInvCanais();
  return useMutation({ mutationFn: (canalId: string) => invocar('reviza-wa-instancia', { acao: 'verificar', canal_id: canalId }), onSuccess: inv });
}
/** atendente DONO do número: só ele e o admin veem as conversas; a régua casa o comercial do cliente com ele */
export function useDefinirDonoWA() {
  const inv = useInvCanais();
  return useMutation({
    mutationFn: (a: { canal_id: string; dono_id: string | null }) => invocar('reviza-wa-instancia', { acao: 'definir_dono', canal_id: a.canal_id, dono_id: a.dono_id }),
    onSuccess: () => { inv(); registrarBloqueada('trocar o dono do número', 'Troque de novo em Números → Gerenciar se precisar.'); },
  });
}
export function useRemoverWA() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (canalId: string) => invocar('reviza-wa-instancia', { acao: 'remover', canal_id: canalId }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: K.canais }); void qc.invalidateQueries({ queryKey: K.conversas }); registrarBloqueada('remover número', 'O número e as conversas dele foram removidos — não dá pra desfazer.'); },
  });
}

/* ---------- conversas ---------- */
export function useConversasWA(habilitado = true) {
  return useQuery<ConversaWA[]>({
    queryKey: K.conversas,
    enabled: habilitado && !!supabase,
    refetchInterval: 6000,
    queryFn: async () => {
      const { data, error } = await supabase!.from('wa_conversas')
        .select('id, canal_id, telefone, nome_contato, lead_id, ultima_previa, ultima_em, nao_lidas, digitando_ate')
        .eq('arquivada', false).order('ultima_em', { ascending: false, nullsFirst: false }).limit(200);
      if (error) throw new Error(error.message);
      return (data ?? []) as ConversaWA[];
    },
  });
}
export function useMensagensWA(conversaId: string | null) {
  return useQuery<MensagemWA[]>({
    queryKey: K.mensagens(conversaId ?? '—'),
    enabled: !!conversaId && !!supabase,
    refetchInterval: 4000,
    queryFn: async () => {
      const { data, error } = await supabase!.from('wa_mensagens')
        .select('id, conversa_id, direcao, tipo, conteudo, midia_path, resposta_a, apagada, status, created_at')
        // as 500 MAIS RECENTES (desc + inverte): em conversa longa as novas nunca podem sumir da tela
        .eq('conversa_id', conversaId).order('created_at', { ascending: false }).limit(500);
      if (error) throw new Error(error.message);
      return ((data ?? []) as MensagemWA[]).reverse();
    },
  });
}
export function useEnviarWA() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (a: { conversa_id?: string; telefone?: string; texto: string; midia_path?: string; midia_tipo?: TipoMidiaWA; midia_nome?: string; resposta_a?: string }) => invocar('reviza-wa-enviar', a),
    onSuccess: (_r, a) => {
      void qc.invalidateQueries({ queryKey: K.conversas });
      if (a.conversa_id) void qc.invalidateQueries({ queryKey: K.mensagens(a.conversa_id) });
      registrarBloqueada('enviar mensagem', 'A mensagem já saiu no WhatsApp — não dá pra desfazer.');
    },
  });
}
/** visto azul no CELULAR do cliente: marca as mensagens dele como lidas via Evolution */
export function useLerWA() {
  return useMutation({ mutationFn: (conversaId: string) => invocar('reviza-wa-enviar', { acao: 'ler', conversa_id: conversaId }) });
}
/** apaga uma mensagem NOSSA pra todos */
export function useApagarMsgWA() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (a: { mensagem_id: string; conversa_id: string }) => invocar('reviza-wa-enviar', { acao: 'apagar', mensagem_id: a.mensagem_id }),
    onSuccess: (_r, a) => { void qc.invalidateQueries({ queryKey: K.mensagens(a.conversa_id) }); registrarBloqueada('apagar mensagem', 'A mensagem foi apagada no WhatsApp — não dá pra desfazer.'); },
  });
}
export function useMarcarLidaWA() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (conversaId: string) => { const { error } = await supabase!.rpc('wa_marcar_lida', { p_conversa: conversaId }); if (error) throw new Error(error.message); },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: K.conversas }); },
  });
}

/* ---------- régua (modelo da demo: blocos, grupos, cliente específico) ----------
   Traz ativas E pausadas (a tela mostra as pausadas separadas); scripts do chat
   (alvo 'script') vêm juntos mas NÃO são passos da régua. */
export function useReguaWA(habilitado = true) {
  return useQuery<ReguaMsgWA[]>({
    queryKey: K.regua,
    enabled: habilitado && !!supabase,
    queryFn: async () => {
      const { data, error } = await supabase!.from('wa_regua_msgs')
        .select('id, alvo, nome, quando, blocos, grupo_nome, criterio, cli_id, cli_nome, data_envio, ativo')
        .order('quando').order('created_at');
      if (error) throw new Error(error.message);
      return (data ?? []) as ReguaMsgWA[];
    },
  });
}
function useInvRegua() { const qc = useQueryClient(); return () => { void qc.invalidateQueries({ queryKey: K.regua }); void qc.invalidateQueries({ queryKey: K.reguaVersoes }); void qc.invalidateQueries({ queryKey: K.previa }); }; }
/** não persiste objectURLs de sessão (blob:) — guarda tipo/nome/legenda + path do bucket
    (arquivo REAL, vai em todo envio) e espera (delay entre as partes) */
function blocosParaSalvar(bs: Bloco[]) {
  return bs.map((b) => ({
    tipo: b.tipo, corpo: b.corpo ?? '', nome: b.nome ?? '',
    ...(b.path ? { path: b.path } : {}),
    ...(b.espera != null ? { espera: Math.max(0, Math.min(60, Math.trunc(b.espera))) } : {}),
    ...(b.url && !b.url.startsWith('blob:') ? { url: b.url } : {}),
  }));
}
/** salva (cria/edita) uma mensagem da régua — blocos de mídia guardam nome/legenda (arquivo é reanexado no envio) */
export function useSalvarReguaMsg() {
  const inv = useInvRegua();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (m: Partial<ReguaMsgWA> & { alvo: ReguaMsgWA['alvo']; nome: string; blocos: Bloco[] }) => {
      const blocos = blocosParaSalvar(m.blocos);
      const payload = {
        alvo: m.alvo, nome: m.nome, quando: m.quando ?? 0, blocos,
        grupo_nome: m.grupo_nome ?? null, criterio: m.criterio ?? null,
        cli_id: m.cli_id ?? null, cli_nome: m.cli_nome ?? null, data_envio: m.data_envio || null,
        ativo: m.ativo ?? true,
      };
      const q = m.id && !m.id.startsWith('novo')
        ? await supabase!.from('wa_regua_msgs').update(payload).eq('id', m.id)
        : await supabase!.from('wa_regua_msgs').insert(payload);
      if (q.error) throw new Error(q.error.message);
    },
    onMutate: (m) => {
      const novo = !m.id || m.id.startsWith('novo');
      return { novo, prev: novo ? undefined : qc.getQueryData<ReguaMsgWA[]>(K.regua)?.find((x) => x.id === m.id) };
    },
    onSuccess: (_d, _m, ctx) => {
      inv();
      if (ctx?.novo) { registrarBloqueada('criar mensagem da régua', 'Mensagem nova criada — exclua na régua se precisar.'); return; }
      const prev = ctx?.prev; if (!prev) return;
      registrarDesfazer({
        rotulo: `mensagem "${prev.nome}" da régua`,
        inverso: async () => {
          const payload = { alvo: prev.alvo, nome: prev.nome, quando: prev.quando, blocos: prev.blocos, grupo_nome: prev.grupo_nome, criterio: prev.criterio, cli_id: prev.cli_id, cli_nome: prev.cli_nome, data_envio: prev.data_envio, ativo: prev.ativo };
          const { error } = await supabase!.from('wa_regua_msgs').update(payload).eq('id', prev.id); if (error) throw new Error(error.message);
        },
      });
    },
  });
}
/** exclui um passo da régua (RPC wa_regua_msg_excluir, mig 73): na mesma transação cancela o que
    ele ainda tinha na fila de hoje — sem isso a fila continuava saindo depois de "excluído" */
export function useExcluirReguaMsg() {
  const qc = useQueryClient();
  const invEnvios = useInvEnvios();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase!.rpc('wa_regua_msg_excluir', { p_id: id });
      if (error) throw new Error(error.code === '42501' ? 'Só gestor ou administrador pode excluir mensagens da régua.' : error.message);
      const r = (data ?? {}) as { cancelados?: number };
      return { cancelados: Number(r.cancelados ?? 0) };
    },
    // espera a lista recarregar: o modal só fecha quando o card já sumiu (sem 2º clique no mesmo)
    onSuccess: async () => {
      invEnvios();
      await Promise.all([qc.invalidateQueries({ queryKey: K.regua }), qc.invalidateQueries({ queryKey: K.previa })]);
      registrarBloqueada('excluir mensagem da régua', 'A mensagem foi removida — recadastre na régua se precisar.');
    },
  });
}

/* ---------- régua de cada comercial (mig 74; dono 26/10) ----------
   O comercial vê/edita só a DELE (RLS wa_regua_pode); admin/gestor veem e editam todas.
   Sem versão = o comercial usa a mensagem padrão daquele passo. */
export function useReguaVersoesWA(habilitado = true) {
  return useQuery<ReguaVersaoWA[]>({
    queryKey: K.reguaVersoes,
    enabled: habilitado && !!supabase,
    queryFn: async () => {
      const { data, error } = await supabase!.from('wa_regua_comercial')
        .select('id, passo_id, comercial, blocos, atualizado_em, atualizado_por, excluida, quando').order('comercial');
      if (error) throw new Error(error.message);
      return (data ?? []) as ReguaVersaoWA[];
    },
  });
}
/** cria ou troca a mensagem de UM passo na régua de UM comercial — ou EXCLUI o passo da régua dele
    (excluida=true; os blocos da mensagem própria, se houver, ficam guardados pra "Voltar a usar") */
export function useSalvarVersaoWA() {
  const inv = useInvRegua();
  const qc = useQueryClient();
  return useMutation({
    /** nome = como a pessoa lê ("Eduardo"), só pro rótulo do Desfazer */
    /** quando: dia próprio (null = o da padrão) — SEMPRE mandar o valor atual, o upsert grava a linha inteira */
    mutationFn: async (v: { passo_id: string; comercial: string; blocos: Bloco[]; excluida?: boolean; quando?: number | null; nome?: string }) => {
      const { error } = await supabase!.from('wa_regua_comercial')
        .upsert({ passo_id: v.passo_id, comercial: chaveComercial(v.comercial), blocos: blocosParaSalvar(v.blocos), excluida: !!v.excluida, quando: v.quando ?? null }, { onConflict: 'passo_id,comercial' });
      if (error) throw new Error(error.code === '42501' ? 'Você só pode editar a sua própria régua.' : error.message);
    },
    onMutate: (v) => ({ prev: qc.getQueryData<ReguaVersaoWA[]>(K.reguaVersoes)?.find((x) => x.passo_id === v.passo_id && x.comercial === chaveComercial(v.comercial)) }),
    onSuccess: async (_d, v, ctx) => {
      // espera só a lista da régua (o cartão muda antes do modal fechar); a prévia do motor
      // (carteira inteira) recalcula por trás, sem segurar o botão
      void qc.invalidateQueries({ queryKey: K.previa });
      await qc.invalidateQueries({ queryKey: K.reguaVersoes });
      const prev = ctx?.prev;
      registrarDesfazer({
        rotulo: `${v.excluida ? 'exclusão' : prev?.excluida ? 'volta da mensagem' : 'mensagem'} na régua de ${v.nome ?? v.comercial}`,
        inverso: async () => {
          const q = prev
            ? await supabase!.from('wa_regua_comercial').update({ blocos: prev.blocos, excluida: prev.excluida, quando: prev.quando }).eq('id', prev.id)
            : await supabase!.from('wa_regua_comercial').delete().eq('passo_id', v.passo_id).eq('comercial', chaveComercial(v.comercial));
          if (q.error) throw new Error(q.error.message);
          inv();
        },
      });
    },
  });
}
/** "usar a mensagem padrão": apaga a versão do comercial naquele passo */
export function useExcluirVersaoWA() {
  const inv = useInvRegua();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: ReguaVersaoWA & { nome?: string }) => {
      const { data, error } = await supabase!.from('wa_regua_comercial').delete().eq('id', v.id).select('id');
      if (error) throw new Error(error.message);
      if (!data?.length) throw new Error('Essa mensagem própria já não existe (alguém pode ter mudado agora). Atualize a página.');
    },
    onSuccess: async (_d, v) => {
      void qc.invalidateQueries({ queryKey: K.previa });
      await qc.invalidateQueries({ queryKey: K.reguaVersoes });
      registrarDesfazer({
        rotulo: `volta pra padrão na régua de ${v.nome ?? v.comercial}`,
        inverso: async () => {
          const { error } = await supabase!.from('wa_regua_comercial').insert({ passo_id: v.passo_id, comercial: v.comercial, blocos: v.blocos, excluida: v.excluida, quando: v.quando });
          if (error) throw new Error(error.message);
          inv();
        },
      });
    },
  });
}

/* ---------- régua automática: chave global + hora do disparo diário ---------- */
export type DiasEnvioWA = 'todos' | 'uteis' | 'uteis_sabado';
/** hora cheia de Brasília (0–23) — a janela da régua é em horário de Brasília, como no motor */
export const horaBrasilia = (): number => {
  try { return Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', hour: 'numeric', hourCycle: 'h23' }).format(new Date())) % 24; }
  catch { return new Date().getHours(); }
};
export interface ReguaConfigWA {
  ativa: boolean; hora_envio: number;
  /** número que atende quem é de comercial SEM número conectado (null = esses clientes esperam) */
  canal_reserva_id: string | null;
  dias_envio: DiasEnvioWA;
  /** máximo de mensagens por número por dia (0 = sem teto) — proteção contra bloqueio */
  teto_diario: number;
  /** cliente respondeu um envio da régua → os próximos passos do mês pausam (atendimento humano) */
  pausar_se_respondeu: boolean;
  delay_min: number; delay_max: number;
  /** mig 78: a régua só monta e manda de hora_envio até ANTES de hora_fim (ex. 5h–10h) */
  hora_fim: number;
  /** mig 78: pausa longa do número — a cada `pausa_cada` mensagens no dia, descansa `pausa_min` minutos (0 = sem) */
  pausa_cada: number; pausa_min: number;
  /** mig 82 (dono 28/10): início próprio por comercial — { "EDUARDO": 7, "JUNIOR": 8 } (chave = chaveComercial).
      Antes dessa hora a fila do comercial espera; quem não está aqui começa em hora_envio */
  horario_comercial: Record<string, number>;
  /** mig 85 (dono 29/10): comerciais que pausaram a PRÓPRIA régua — { "EDUARDO": "<quando (iso)>" } */
  regua_pausada: Record<string, string>;
  updated_at?: string | null; updated_by?: string | null;
}
/** mig 83 (dono 29/10: "cada atendente consiga alterar os horários dos envios"): muda SÓ o início de UM
    comercial (o comercial só o dele; gestor qualquer um; dentro da janela da régua). hora null = volta pro
    início geral. O Desfazer devolve o horário de antes */
export function useHorarioComercialWA() {
  const qc = useQueryClient();
  /** conferir=true (Desfazer): só aplica se o horário ainda é `esperado` — o que outra pessoa mudou depois fica (mig 84) */
  const mudar = async (comercial: string, hora: number | null, conferir = false, esperado: number | null = null) => {
    const { data, error } = await supabase!.rpc('wa_regua_horario_comercial', { p_comercial: comercial, p_hora: hora, p_conferir: conferir, p_esperado: esperado });
    if (error) throw new Error(error.message);
    return data as { comercial: string; antes: number | null; depois: number | null; inicio_geral: number; fim: number };
  };
  /** a tela mostra o horário novo NA HORA (sem piscar o antigo até o refetch) */
  const aplicarNoCache = (r: { comercial: string; depois: number | null }) => qc.setQueryData<ReguaConfigWA | null>(K.reguaCfg, (c) => {
    if (!c) return c;
    const mapa = { ...(c.horario_comercial ?? {}) };
    if (r.depois == null) delete mapa[r.comercial]; else mapa[r.comercial] = r.depois;
    return { ...c, horario_comercial: mapa };
  });
  return useMutation({
    mutationFn: (a: { comercial: string; hora: number | null; nome?: string }) => mudar(a.comercial, a.hora),
    onSuccess: async (r, a) => {
      aplicarNoCache(r);
      if (r.antes !== r.depois) {
        registrarDesfazer({
          rotulo: `horário de envio de ${a.nome ?? r.comercial}`,
          inverso: async () => { const v = await mudar(r.comercial, r.antes, true, r.depois); aplicarNoCache(v); },
        });
      }
      await Promise.all([qc.invalidateQueries({ queryKey: K.reguaCfg }), qc.invalidateQueries({ queryKey: K.previa })]);
    },
  });
}
/** mig 85: o comercial pausa/retoma a PRÓPRIA régua (gestor: qualquer um). O Desfazer só volta se ninguém
    mudou depois (confere o estado atual antes) */
export function usePausaReguaWA() {
  const qc = useQueryClient();
  const mudar = async (comercial: string, pausar: boolean) => {
    const { data, error } = await supabase!.rpc('wa_regua_comercial_pausar', { p_comercial: comercial, p_pausar: pausar });
    if (error) throw new Error(error.message);
    return data as { comercial: string; antes: boolean; depois: boolean };
  };
  const aplicarNoCache = (comercial: string, pausada: boolean) => qc.setQueryData<ReguaConfigWA | null>(K.reguaCfg, (c) => {
    if (!c) return c;
    const mapa = { ...(c.regua_pausada ?? {}) };
    if (pausada) mapa[comercial] = mapa[comercial] ?? new Date().toISOString(); else delete mapa[comercial];
    return { ...c, regua_pausada: mapa };
  });
  return useMutation({
    mutationFn: (a: { comercial: string; pausar: boolean; nome?: string }) => mudar(a.comercial, a.pausar),
    onSuccess: async (r, a) => {
      aplicarNoCache(r.comercial, r.depois);
      if (r.antes !== r.depois) {
        registrarDesfazer({
          rotulo: `${r.depois ? 'pausa' : 'retomada'} da régua de ${a.nome ?? r.comercial}`,
          inverso: async () => {
            const { data, error } = await supabase!.from('wa_regua_config').select('regua_pausada').eq('id', 1).maybeSingle();
            if (error) throw new Error(error.message);
            const agora = !!(data?.regua_pausada as Record<string, string> | null)?.[r.comercial];
            if (agora !== r.depois) throw new Error('A régua mudou depois (outra pessoa pausou ou retomou) — nada foi desfeito.');
            const v = await mudar(r.comercial, r.antes);
            aplicarNoCache(v.comercial, v.depois);
          },
        });
      }
      await Promise.all([qc.invalidateQueries({ queryKey: K.reguaCfg }), qc.invalidateQueries({ queryKey: K.previa })]);
    },
  });
}
export function useReguaConfigWA(habilitado = true) {
  return useQuery<ReguaConfigWA | null>({
    queryKey: K.reguaCfg,
    enabled: habilitado && !!supabase,
    refetchInterval: 30000,
    queryFn: async () => {
      const { data, error } = await supabase!.from('wa_regua_config')
        .select('ativa, hora_envio, hora_fim, canal_reserva_id, dias_envio, teto_diario, pausar_se_respondeu, delay_min, delay_max, pausa_cada, pausa_min, horario_comercial, regua_pausada, updated_at, updated_by').eq('id', 1).maybeSingle();
      if (error) throw new Error(error.message);
      return (data ?? null) as ReguaConfigWA | null;
    },
  });
}
export function useSalvarReguaConfigWA() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (c: Partial<ReguaConfigWA>) => {
      const { error } = await supabase!.from('wa_regua_config').update(c).eq('id', 1);
      if (error) throw new Error(error.message);
    },
    onMutate: (c) => {
      const antes = qc.getQueryData<ReguaConfigWA | null>(K.reguaCfg);
      // a tela já mostra o valor novo (ex.: o mínimo do intervalo que acabou de salvar limita o máximo)
      if (antes) qc.setQueryData<ReguaConfigWA | null>(K.reguaCfg, { ...antes, ...c });
      return { antes };
    },
    onError: (_e, _c, ctx) => { if (ctx?.antes) qc.setQueryData(K.reguaCfg, ctx.antes); },
    onSuccess: (_d, c, ctx) => {
      void qc.invalidateQueries({ queryKey: K.reguaCfg });
      void qc.invalidateQueries({ queryKey: K.previa });
      const antes = ctx?.antes; if (!antes) return;
      // NUNCA deixar o Desfazer religar/desligar a régua: a chave controla envio
      // REAL de WhatsApp (regra da casa: só o dono liga, com a confirmação própria).
      // Se o toggle 'ativa' foi tocado, bloqueia. O resto (hora, dias, teto…) é reversível.
      if (c.ativa !== undefined && c.ativa !== antes.ativa) {
        registrarBloqueada('ligar/desligar a régua automática', 'A régua controla disparo real de WhatsApp — ligue/desligue no botão da própria régua, com a confirmação.');
        return;
      }
      const campos = Object.keys(c) as (keyof ReguaConfigWA)[];
      const volta: Partial<ReguaConfigWA> = {};
      for (const k of campos) (volta as Record<string, unknown>)[k] = antes[k];
      registrarDesfazer({
        rotulo: 'configuração da régua',
        inverso: async () => { const { error } = await supabase!.from('wa_regua_config').update(volta).eq('id', 1); if (error) throw new Error(error.message); },
      });
    },
  });
}

/* ---------- fila de envios (alimentada pelo motor quando a régua ligar) ---------- */
export function useFilaEnviosWA(habilitado = true) {
  return useQuery<FilaEnvioWA[]>({
    queryKey: K.fila,
    enabled: habilitado && !!supabase,
    refetchInterval: 5000,
    queryFn: async () => {
      const { data, error } = await supabase!.from('wa_envio_alvos')
        .select('id, envio_id, telefone, nome, status, erro, enviado_em, created_at, wa_envios(nome, wa_canais(nome))')
        .order('created_at', { ascending: false }).limit(200);
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as FilaEnvioWA[];
    },
  });
}

/* ---------- envios (criar / agendar / cancelar) ---------- */
export function useEnviosWA(habilitado = true) {
  return useQuery<EnvioWA[]>({
    queryKey: K.envios,
    enabled: habilitado && !!supabase,
    refetchInterval: 15000,
    queryFn: async () => {
      const { data, error } = await supabase!.from('wa_envios')
        .select('id, nome, canal_id, modelo, estado, total, enviados, erros, pulados, agendado_para, created_at, origem, passo_nome, passo_quando, blocos, criado_por')
        .order('created_at', { ascending: false }).limit(60);
      if (error) throw new Error(error.message);
      return (data ?? []) as EnvioWA[];
    },
  });
}
function useInvEnvios() {
  const qc = useQueryClient();
  return () => {
    for (const k of [K.envios, K.fila, K.alvos, K.resumo, K.progresso, K.rodadas]) void qc.invalidateQueries({ queryKey: k });
  };
}
/** cria o envio + alvos; sem agendamento, cutuca o motor pra processar já */
export function useCriarEnvioWA() {
  const inv = useInvEnvios();
  return useMutation({
    mutationFn: async (n: NovoEnvioWA) => {
      const { data: u } = await supabase!.auth.getUser();
      const uid = u?.user?.id;
      if (!uid) throw new Error('não autenticado');
      // compositor: guarda só o que é enviável e persistido (nunca blob: de sessão)
      const blocos = (n.blocos ?? [])
        .filter((b) => (b.tipo === 'texto' ? !!(b.corpo ?? '').trim() : !!b.path))
        .map((b) => ({ tipo: b.tipo, corpo: b.corpo ?? '', nome: b.nome ?? '', ...(b.path ? { path: b.path } : {}), ...(b.espera != null ? { espera: Math.max(0, Math.min(60, Math.trunc(b.espera))) } : {}) }));
      const texto = n.texto || blocos.filter((b) => b.tipo === 'texto').map((b) => b.corpo.trim()).join('\n\n');
      const dMin = Math.max(5, Math.round(n.delay_min ?? 20));
      // nasce SEM data (o motor não pega) e só é liberado depois que os destinatários entrarem
      const { data: envio, error } = await supabase!.from('wa_envios').insert({
        nome: n.nome, canal_id: n.canal_id, modelo: texto, estado: 'rascunho', origem: 'manual',
        agendado_para: null,
        total: n.alvos.length, criado_por: uid,
        blocos: blocos.length ? blocos : null,
        variantes: (n.variantes ?? []).map((v) => v.trim()).filter(Boolean).slice(0, 4),
        midia_path: n.midia?.path ?? null, midia_tipo: n.midia?.tipo ?? null, midia_nome: n.midia?.nome ?? null,
        delay_min: dMin, delay_max: Math.max(dMin, Math.round(n.delay_max ?? 45)),
        presenca: n.presenca ?? true,
      }).select('id').single();
      if (error) throw new Error(error.message);
      const alvos = n.alvos.map((a) => ({ envio_id: envio.id, telefone: a.telefone.replace(/\D/g, ''), nome: a.nome ?? null, lead_id: a.lead_id ?? null }));
      const { error: e2 } = await supabase!.from('wa_envio_alvos').insert(alvos);
      if (e2) { await supabase!.from('wa_envios').update({ estado: 'cancelado' }).eq('id', envio.id); throw new Error(e2.message); }
      const { error: e3 } = await supabase!.from('wa_envios').update({ agendado_para: n.agendado_para ?? new Date().toISOString() }).eq('id', envio.id);
      if (e3) throw new Error(e3.message);
      if (!n.agendado_para) void supabase!.functions.invoke('reviza-wa-motor', { body: {} }).catch(() => { /* o cron pega em 1 min */ });
      return envio.id as string;
    },
    onSuccess: (_d, n) => { inv(); registrarBloqueada(`criar envio "${n.nome}"`, 'O disparo já pode ter começado a enviar — cancele na aba Envios se precisar.'); },
  });
}
/** cutuca o motor pra processar a fila já (sem esperar o cron do minuto) */
export function useProcessarEnviosWA() {
  const inv = useInvEnvios();
  return useMutation({ mutationFn: () => invocar('reviza-wa-motor', {}), onSuccess: () => { inv(); registrarBloqueada('processar envios', 'O motor já pode ter enviado mensagens — não dá pra desfazer.'); } });
}
/** cancela um envio agendado/em andamento: quem ainda não recebeu fica marcado
    "cancelado" (o rastro não some — antes os pendentes eram apagados) */
export function useCancelarEnvioWA() {
  const inv = useInvEnvios();
  return useMutation({
    mutationFn: async (envioId: string) => {
      const { data, error } = await supabase!.rpc('wa_envio_cancelar', { p_envio: envioId });
      if (error) throw new Error(error.message);
      return Number((data as { cancelados?: number } | null)?.cancelados ?? 0);
    },
    onSuccess: () => { inv(); registrarBloqueada('cancelar envio', 'Quem ainda não tinha recebido ficou como "cancelado" — crie um envio novo se precisar.'); },
  });
}

/* ---------- ENVIOS DETALHADOS (dono 24/09): rastro por cliente ---------- */
const COLS_ALVO = 'id, envio_id, telefone, nome, lead_id, status, erro, motivo, enviado_em, created_at, canal_id, canal_nome, canal_numero, conversa_id, mensagem, comp, venc, regua_msg_id, passo_nome, entrega, entregue_em, lida_em, respondeu_em, resposta_previa, tentativas, tentar_apos, parte_atual, wa_envios(nome, origem, canal_id, agendado_para, estado)';
export type FiltroStatusAlvo = 'todos' | 'fila' | 'enviadas' | 'responderam' | 'erros' | 'pulados';
export interface FiltroAlvosWA { desdeIso: string | null; status: FiltroStatusAlvo; origem: 'todas' | 'regua' | 'manual'; busca: string; envioId?: string | null; leadId?: string | null; conversaId?: string | null; alvoId?: string | null;
  /** true = janela e ordem pela RESPOSTA (respondeu_em), 1 página só — usado no "Responderam" das Conversas */
  porResposta?: boolean }
const PAG_ALVOS = 60;
/** lista paginada por CURSOR (created_at,id) — nunca trunca em 1000 (PostgREST) nem pula linha */
type CursorAlvo = { em: string; id: string } | null;
export function useAlvosWA(f: FiltroAlvosWA, habilitado = true) {
  return useInfiniteQuery({
    queryKey: [...K.alvos, f],
    enabled: habilitado && !!supabase,
    initialPageParam: null as CursorAlvo,
    refetchInterval: 6000,
    getNextPageParam: (ult: AlvoWA[]): CursorAlvo | undefined => (f.porResposta || ult.length < PAG_ALVOS ? undefined : { em: ult[ult.length - 1].created_at, id: ult[ult.length - 1].id }),
    queryFn: async ({ pageParam }: { pageParam: CursorAlvo }): Promise<AlvoWA[]> => {
      let q = supabase!.from('wa_envio_alvos').select(f.origem === 'todas' ? COLS_ALVO : COLS_ALVO.replace('wa_envios(', 'wa_envios!inner('));
      if (f.alvoId) q = q.eq('id', f.alvoId);
      if (f.envioId) q = q.eq('envio_id', f.envioId);
      if (f.leadId) q = q.eq('lead_id', f.leadId);
      if (f.conversaId) q = q.eq('conversa_id', f.conversaId);
      if (f.desdeIso && !f.envioId && !f.alvoId) q = f.porResposta ? q.gte('respondeu_em', f.desdeIso) : q.gte('created_at', f.desdeIso);
      if (f.origem !== 'todas') q = q.eq('wa_envios.origem', f.origem);
      if (f.status === 'fila') q = q.in('status', ['pendente', 'enviando']);
      else if (f.status === 'enviadas') q = q.eq('status', 'enviado');
      else if (f.status === 'responderam') q = q.not('respondeu_em', 'is', null);
      else if (f.status === 'erros') q = q.eq('status', 'erro');
      else if (f.status === 'pulados') q = q.in('status', ['pulado', 'cancelado']);
      const s = f.busca.trim();
      if (s) {
        const dig = s.replace(/\D/g, '');
        q = dig.length >= 4 ? q.ilike('telefone', `%${dig}%`) : q.ilike('nome', `%${s.replace(/[%_,()]/g, ' ')}%`);
      }
      if (pageParam) q = q.or(`created_at.lt."${pageParam.em}",and(created_at.eq."${pageParam.em}",id.lt.${pageParam.id})`);
      const { data, error } = await (f.porResposta ? q.order('respondeu_em', { ascending: false }) : q.order('created_at', { ascending: false })).order('id', { ascending: false }).limit(PAG_ALVOS);
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as AlvoWA[];
    },
  });
}
/** números do topo da tela (contados no banco, respeitando quem pode ver o quê) */
export function useResumoEnviosWA(deIso: string, ateIso: string, habilitado = true) {
  return useQuery<ResumoEnviosWA>({
    queryKey: [...K.resumo, deIso, ateIso],
    enabled: habilitado && !!supabase,
    refetchInterval: 8000,
    queryFn: async () => {
      const { data, error } = await supabase!.rpc('wa_envios_resumo', { p_de: deIso, p_ate: ateIso });
      if (error) throw new Error(error.message);
      const d = (data ?? {}) as Partial<ResumoEnviosWA>;
      return { enviadas: +(d.enviadas ?? 0), entregues: +(d.entregues ?? 0), lidas: +(d.lidas ?? 0), responderam: +(d.responderam ?? 0), erros: +(d.erros ?? 0), pulados: +(d.pulados ?? 0), na_fila: +(d.na_fila ?? 0), agendados: +(d.agendados ?? 0), optouts: +(d.optouts ?? 0) };
    },
  });
}
/** andamento da régua por passo (hoje): gerados × enviados × entregues × responderam × erro/pulado */
export function useProgressoReguaWA(deIso: string, ateIso: string, habilitado = true) {
  return useQuery<ProgressoPassoWA[]>({
    queryKey: [...K.progresso, deIso, ateIso],
    enabled: habilitado && !!supabase,
    refetchInterval: 8000,
    queryFn: async () => {
      const { data, error } = await supabase!.rpc('wa_regua_progresso', { p_de: deIso, p_ate: ateIso });
      if (error) throw new Error(error.message);
      return ((data ?? []) as ProgressoPassoWA[]).map((r) => ({ ...r, n: Number(r.n) }));
    },
  });
}
/** PRÉVIA: o motor calcula quem recebe o quê em cada dia — NÃO envia nada */
export function usePreviaReguaWA(p: { de: string; ate?: string; lead_id?: string | null }, habilitado = true) {
  return useQuery<PreviaWA>({
    queryKey: [...K.previa, p.de, p.ate ?? p.de, p.lead_id ?? null],
    enabled: habilitado && !!supabase,
    staleTime: 60_000,
    refetchInterval: 120_000,
    queryFn: async () => {
      const d = await invocar('reviza-wa-motor', { acao: 'previa', de: p.de, ate: p.ate ?? p.de, lead_id: p.lead_id ?? null });
      return d as unknown as PreviaWA;
    },
  });
}
/** últimas rodadas do motor (saúde: o que gerou, o que pulou e por quê, erros) */
export function useRodadasWA(habilitado = true) {
  return useQuery<RodadaWA[]>({
    queryKey: K.rodadas,
    enabled: habilitado && !!supabase,
    refetchInterval: 20000,
    queryFn: async () => {
      const { data, error } = await supabase!.from('wa_motor_rodadas').select('id, inicio, fim, fonte, regua, enviadas, falhas, puladas, erro').order('inicio', { ascending: false }).limit(15);
      if (error) throw new Error(error.message);
      return (data ?? []) as RodadaWA[];
    },
  });
}
/** batimento do motor (a cada rodada, ~1/min) — a tela sabe se ele parou */
export interface MotorStatusWA { ultima_rodada: string | null; ultima_ok: boolean | null; ultimo_erro: string | null }
export function useMotorStatusWA(habilitado = true) {
  return useQuery<MotorStatusWA | null>({
    queryKey: [...K.rodadas, 'status'],
    enabled: habilitado && !!supabase,
    refetchInterval: 20000,
    queryFn: async () => {
      const { data, error } = await supabase!.from('wa_motor_status').select('ultima_rodada, ultima_ok, ultimo_erro').eq('id', 1).maybeSingle();
      if (error) throw new Error(error.message);
      return (data ?? null) as MotorStatusWA | null;
    },
  });
}
/** uma conversa pelo id (atalho de Envios → Conversas, mesmo fora das 200 mais recentes) */
export function useConversaWA(id: string | null) {
  return useQuery<ConversaWA | null>({
    queryKey: [...K.conversas, 'uma', id ?? '—'],
    enabled: !!id && !!supabase,
    queryFn: async () => {
      const { data, error } = await supabase!.from('wa_conversas')
        .select('id, canal_id, telefone, nome_contato, lead_id, ultima_previa, ultima_em, nao_lidas, digitando_ate').eq('id', id).maybeSingle();
      if (error) throw new Error(error.message);
      return (data ?? null) as ConversaWA | null;
    },
  });
}
/** quem pediu pra sair (SAIR/PARAR) ou foi tirado da régua à mão */
export function useOptoutWA(habilitado = true) {
  return useQuery<OptoutWA[]>({
    queryKey: K.optout,
    enabled: habilitado && !!supabase,
    refetchInterval: 30000,
    queryFn: async () => {
      const { data, error } = await supabase!.from('wa_optout').select('chave, telefone, lead_id, origem, texto, criado_em').order('criado_em', { ascending: false }).limit(500);
      if (error) throw new Error(error.message);
      return (data ?? []) as OptoutWA[];
    },
  });
}
export function useVoltarAReceberWA() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (o: OptoutWA) => { const { error } = await supabase!.from('wa_optout').delete().eq('chave', o.chave); if (error) throw new Error(error.message); return o; },
    onSuccess: (o) => {
      void qc.invalidateQueries({ queryKey: K.optout }); void qc.invalidateQueries({ queryKey: K.previa });
      registrarDesfazer({
        rotulo: 'cliente voltou a receber',
        inverso: async () => {
          const { error } = await supabase!.from('wa_optout').insert({ chave: o.chave, telefone: o.telefone, lead_id: o.lead_id, origem: o.origem, texto: o.texto });
          if (error) throw new Error(error.message);
        },
      });
    },
  });
}
/** tira um cliente da régua à mão (ficha/Envios) — mesmo efeito do SAIR dele */
export function useTirarDaReguaWA() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (a: { telefone: string; lead_id?: string | null }) => {
      const { data: ch, error: e1 } = await supabase!.rpc('wa_tel_chave', { p: a.telefone });
      if (e1) throw new Error(e1.message);
      if (!ch) throw new Error('telefone inválido');
      const { data: u } = await supabase!.auth.getUser();
      const { error } = await supabase!.from('wa_optout').insert({ chave: ch, telefone: a.telefone.replace(/\D/g, ''), lead_id: a.lead_id ?? null, origem: 'manual', criado_por: u?.user?.id ?? null });
      if (error) {
        // já estava fora (ex.: o próprio cliente pediu SAIR): nada foi criado → nada a desfazer
        if (/duplicate|23505/i.test(error.message)) return { ch: String(ch), jaEstava: true };
        throw new Error(error.message);
      }
      return { ch: String(ch), jaEstava: false };
    },
    onSuccess: ({ ch, jaEstava }) => {
      void qc.invalidateQueries({ queryKey: K.optout }); void qc.invalidateQueries({ queryKey: K.previa });
      if (jaEstava) return;
      // o inverso só apaga a linha MANUAL criada aqui — nunca o SAIR que o cliente pediu
      registrarDesfazer({ rotulo: 'tirar cliente da régua', inverso: async () => { const { error } = await supabase!.from('wa_optout').delete().eq('chave', ch).eq('origem', 'manual'); if (error) throw new Error(error.message); } });
    },
  });
}
/** manda de novo quem deu ERRO (manual a qualquer hora; régua só no mesmo dia) */
export function useReenviarWA() {
  const inv = useInvEnvios();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      const { data, error } = await supabase!.rpc('wa_alvos_reenviar', { p_ids: ids });
      if (error) throw new Error(error.message);
      void supabase!.functions.invoke('reviza-wa-motor', { body: {} }).catch(() => { /* o cron pega em 1 min */ });
      return Number((data as { reenviados?: number } | null)?.reenviados ?? 0);
    },
    onSuccess: () => { inv(); registrarBloqueada('reenviar mensagem', 'A mensagem voltou pra fila e pode já ter saído — não dá pra desfazer.'); },
  });
}
