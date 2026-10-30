import { useCallback, useEffect } from 'react';
import { focusManager, useQuery, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { DEMO_MODE, acaoSimulada } from '@/lib/demo';
import { useOrg } from '@/context/OrgContext';
import type { WaContact, WaMessage, WaUltimoCanal } from '@/data/whatsappDemo';
import { previewUltimaMensagem } from '@/lib/conversaEtiquetas';
import {
  CarimbosRealtime, TABELAS_CANAL_WA, aplicarPatchComDesfazer, aplicarSatelites, contarDivergencias, criarMotorRealtime, etapasDeOportunidades,
  iaDaLinha, linhaMsgIncompleta, nomeDoContato, pousarCargaCompleta, removerDoHistorico, upsertHistorico,
  type Alvos, type DepsMotor, type EtapaContato, type IaEstadoLista, type LoteAlvos, type MotorRealtime, type OppLinha, type TabelaRt,
} from '@/data/whatsappRealtime';
import { buscarKeyset, ehAbortado, lancarSeAbortado } from '@/data/paginacao';
import { definirEscopoLista, escopoLista, useVisibilidade } from '@/lib/visibilidade';

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
/** "Remover da lista": oculta o canal (status 'removido') — some das Integrações, mas PRESERVA todo o
 *  histórico (conversas/mensagens/oportunidades/relatórios). Funciona mesmo com o canal já desconectado. */
export const waOcultar = (orgId: string, canalId: string) =>
  invoke<{ ok: boolean }>('evolution-manage', { action: 'ocultar', organizacao_id: orgId, canal_id: canalId });
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
/** Fixar/desfixar conversa no topo do inbox (estilo WhatsApp, SEM limite). RPC com membership. */
export async function waFixar(conversaId: string, fixar: boolean): Promise<void> {
  const { error } = await supabase!.rpc('wa_fixar_conversa', { p_conversa: conversaId, p_fixar: fixar });
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

export interface DbMsg { id: string; direcao: string; conteudo: string | null; tipo: string; enviada_em: string | null; recebida_em: string | null; criado_em: string | null; origem: string | null; status: string | null; erro_envio: string | null; id_externo?: string | null; respondida_a_id?: string | null; metadados: { anexo_path?: string; media_url?: string; mime?: string; tamanho?: number; nome?: string; midia_pendente?: boolean; seconds?: number | null; ptt?: boolean; quoted?: { remetente?: string; tipo?: string; texto?: string }; contato?: { nome?: string; telefone?: string } } | null; }
const TIPOS_MIDIA = ['imagem', 'audio', 'video', 'documento'];

/** metadados.media_url (mídia do fluxo do robô, URL pública do Storage) → só https; qualquer outra coisa é ignorada. */
export function urlPublicaMidia(u: unknown): string | undefined {
  return typeof u === 'string' && /^https:\/\/\S+$/i.test(u.trim()) ? u.trim() : undefined;
}
export interface DbConv {
  id: string; status: string; status_id: string | null; nao_lidas: number | null; ultima_interacao_em: string | null; criado_em: string | null;
  precisa_humano: boolean | null;
  precisa_humano_motivo: string | null; precisa_humano_em: string | null;
  atendente_id: string | null;
  etiquetas: string[] | null;
  ultimo_canal_id: string | null; ultimo_numero: string | null; ultimo_provider: string | null; ultima_msg_canal_em: string | null;
  arquivada_em: string | null; fixada_em: string | null; silenciada_ate: string | null; ultima_lida_em: string | null;
  contatos: { id: string; nome: string; telefone: string | null; email: string | null; etiquetas: string[] | null; origem: string | null; observacoes: string | null; responsavel_id: string | null; contato_identidades: { tipo: string }[] | null } | null;
  canais: { id: string; nome_interno: string | null } | null;
  /** Embed `real` (SELECT_CONVERSAS): a ÚLTIMA mensagem real (fora sistema/nota_interna), LIMIT 1. */
  real?: DbMsg[] | null;
  /** Embed `ult`: a ÚLTIMA mensagem de qualquer tipo, LIMIT 1 (cobre conversa sem mensagem real e a 1ª pintura). */
  ult?: DbMsg[] | null;
  /** Formato ANTIGO (até 20/10): as 10 últimas por criado_em. Não vem mais do banco; o mapConversa
   *  ainda aceita para o teste de equivalência (10 msgs × real+ult) em whatsapp.lista.test.ts. */
  mensagens?: DbMsg[] | null;
}

function tsOf(m: DbMsg): number {
  return new Date(m.enviada_em || m.recebida_em || m.criado_em || 0).getTime();
}

/** Colunas de mensagem da lista — as MESMAS do histórico (useWaMensagens), para a bolha da 1ª
 *  pintura sair idêntica à do histórico (mapMensagens precisa do metadados: mídia sem legenda). */
const COLS_MSG_LISTA = 'id, direcao, conteudo, tipo, enviada_em, recebida_em, criado_em, origem, status, erro_envio, id_externo, respondida_a_id, metadados';

/** SELECT da lista do inbox — FONTE ÚNICA: a carga completa (useWaConversations) e qualquer busca
 *  pontual de conversas da lista (busca-alvo do realtime, deep-link) TÊM de usar este select junto
 *  com `consultaListaConversas`, senão o mapConversa recebe outro formato e os derivados
 *  (preview, aguardando, lastAtMs) saem diferentes.
 *  canais!conversas_canal_id_fkey: desambigua o embed (há 2 FKs p/ canais: canal_id e ultimo_canal_id).
 *  NÃO embutimos conversa_status_def aqui: a cor/nome do status é resolvida no cliente via useStatusDefs
 *  (mantém o inbox funcional mesmo que a tabela auxiliar fique inacessível por grant).
 *  Mensagens: dois embeds LATERAL de 1 linha cada (alias sobre a mesma tabela):
 *   - `real`: a última mensagem REAL (exclui sistema/nota_interna) — é dela que saem preview,
 *     `aguardando`/`aguardandoDesde` e lastAtMs. Vem direto, sem depender de quantas notas
 *     internas vieram depois (com as 10 de antes, uma rajada de 10+ notas escondia a entrada).
 *   - `ult`: a última de QUALQUER tipo — fallback de preview para conversa só com sistema/nota e
 *     a bolha da 1ª pintura. Na maioria das conversas é a mesma linha da `real` (mapConversa
 *     deduplica por id).
 *  Ordem por enviada_em desc (NOT NULL; índice idx_mensagens_conversa (conversa_id, enviada_em
 *  DESC)) e não criado_em: é o mesmo relógio do tsOf/mapMensagens, então a "última" é a mesma
 *  que a tela ordena. Por criado_em, áudio enviado pelo celular (criado depois de baixar a mídia)
 *  passava à frente de um texto enviado depois dele (4 conversas na medição de 20/10).
 *  Histórico completo vem de useWaMensagens sob demanda. Até 20/10 eram as 10 últimas por
 *  conversa (~37 MB por carga completa; agora ~14 MB e metade do tempo de banco). A "aba
 *  Prioridade" que justificava as 10 (olhava saída recente) não existe mais — inboxGroups.classificar
 *  só é usado pelo teste — e as "últimas 4" do Pós-venda vêm de useWaMensagens da selecionada. */
export const SELECT_CONVERSAS = 'id, status, status_id, nao_lidas, ultima_interacao_em, criado_em, precisa_humano, precisa_humano_motivo, precisa_humano_em, atendente_id, etiquetas, ultimo_canal_id, ultimo_numero, ultimo_provider, ultima_msg_canal_em, arquivada_em, fixada_em, silenciada_ate, ultima_lida_em, contatos!inner(id, nome, telefone, email, etiquetas, origem, observacoes, responsavel_id, contato_identidades(tipo)), canais!conversas_canal_id_fkey!inner(id, nome_interno, tipo), '
  + `real:mensagens(${COLS_MSG_LISTA}), ult:mensagens(${COLS_MSG_LISTA})`;

/** Consulta da lista com SELECT_CONVERSAS + os filtros/ordem/limite dos embeds (`real`, `ult`) e do
 *  canal. O chamador acrescenta só o recorte: keyset (`.order('id').limit().lt()`) na carga
 *  completa, ou `.in('id' | 'contato_id', lote)` numa busca pontual. */
const SEM_DONO_POSSIVEL = '00000000-0000-0000-0000-000000000000';
export function consultaListaConversas(orgId: string) {
  let q = supabase!
    .from('conversas')
    .select(SELECT_CONVERSAS)
    .eq('organizacao_id', orgId)
    .eq('canais.tipo', 'whatsapp');
  // VISIBILIDADE (22/10): fora do admin, só os clientes de que o usuário é o responsável
  // (contatos!inner: o filtro no embed corta a conversa). Vale para a carga completa, a
  // busca-alvo do realtime e o deep-link — todos passam por aqui. Ver lib/visibilidade.
  // escopo '' = recorte sem usuário conhecido: não casa com ninguém (nunca vira "sem filtro")
  const resp = escopoLista(orgId);
  if (resp !== null) q = q.eq('contatos.responsavel_id', resp || SEM_DONO_POSSIVEL);
  return q
    .not('real.tipo', 'in', '(sistema,nota_interna)')
    .order('enviada_em', { referencedTable: 'real', ascending: false })
    .limit(1, { referencedTable: 'real' })
    .order('enviada_em', { referencedTable: 'ult', ascending: false })
    .limit(1, { referencedTable: 'ult' });
}

/** Mensagens que vieram com a conversa. Formato atual: `real` + `ult` (no máximo 2, sem repetir id).
 *  Ordenadas por criado_em desc — a mesma ordem do embed antigo — para o laço `>=` do mapConversa
 *  desempatar exatamente como antes (empate de horário → a de menor criado_em). */
function mensagensDaLista(c: DbConv): DbMsg[] {
  if (c.real === undefined && c.ult === undefined) return c.mensagens ?? [];
  const porId = new Map<string, DbMsg>();
  for (const m of [...(c.real ?? []), ...(c.ult ?? [])]) if (m?.id && !porId.has(m.id)) porId.set(m.id, m);
  const criado = (m: DbMsg) => new Date(m.criado_em || m.enviada_em || 0).getTime();
  return [...porId.values()].sort((a, b) => criado(b) - criado(a));
}

/** Linhas de `mensagens` -> bolhas da UI. FONTE ÚNICA: usada pela lista (embeds real+ult) e pelo
 *  histórico completo da conversa aberta (useWaMensagens) — as duas precisam produzir bolhas
 *  idênticas, senão o histórico "muda de forma" ao abrir a conversa. */
export function mapMensagens(rows: DbMsg[]): WaMessage[] {
  return (rows ?? [])
    // mantém texto com conteúdo OU qualquer mídia (imagem/áudio/vídeo/documento) mesmo sem legenda —
    // anexo do painel/webhook OU URL pública do fluxo do robô; também mantém mídia PENDENTE (download
    // falhou) para mostrar "indisponível" + recarregar.
    .filter((m) => (m.conteudo ?? '').length > 0 || (TIPOS_MIDIA.includes(m.tipo) && (!!m.metadados?.anexo_path || !!urlPublicaMidia(m.metadados?.media_url) || !!m.metadados?.midia_pendente)))
    .sort((a, b) => tsOf(a) - tsOf(b))
    .map((m) => ({
      id: m.id,
      dir: m.direcao === 'saida' ? 'out' : 'in',
      text: m.conteudo ?? '',
      time: hhmm(m.enviada_em || m.recebida_em || m.criado_em),
      viaTelefone: m.origem === 'telefone',
      origemBot: m.origem === 'bot' || undefined,
      transcricao: (m.metadados as { transcricao?: string } | null)?.transcricao || undefined,
      status: m.status ?? undefined,
      erro: m.erro_envio ?? undefined,
      tipo: m.tipo,
      anexoPath: m.metadados?.anexo_path,
      midiaUrl: urlPublicaMidia(m.metadados?.media_url),
      mime: m.metadados?.mime,
      tamanho: m.metadados?.tamanho ?? null,
      // duração do áudio gravada pelo webhook: a bolha mostra o tempo antes do play (como no WhatsApp)
      seconds: m.metadados?.seconds ?? null,
      nome: m.metadados?.nome,
      dataISO: (m.recebida_em || m.enviada_em || m.criado_em || '').slice(0, 10) || undefined,
      // ISO completo (mesma fonte do horário exibido) para o separador de dia calcular no fuso de SP.
      tsISO: m.enviada_em || m.recebida_em || m.criado_em || undefined,
      midiaPendente: !!m.metadados?.midia_pendente,
      idExterno: m.id_externo ?? undefined,
      respondidaAId: m.respondida_a_id ?? undefined,
      quoted: m.metadados?.quoted && (m.metadados.quoted.texto || m.metadados.quoted.tipo) ? m.metadados.quoted : undefined,
      // cartão de contato compartilhado: o v2 desenha o cartão; o conteudo textual é o fallback
      contato: (m.metadados?.contato?.nome && m.metadados?.contato?.telefone)
        ? { nome: String(m.metadados.contato.nome), telefone: String(m.metadados.contato.telefone) }
        : undefined,
    } as WaMessage));
}

export function mapConversa(c: DbConv): WaContact {
  const brutas = mensagensDaLista(c);
  const msgs: WaMessage[] = mapMensagens(brutas);
  const lastMsg = msgs[msgs.length - 1];
  const chip = c.canais?.nome_interno ?? 'WhatsApp';
  // "aguardando resposta": conversa ABERTA cuja ÚLTIMA mensagem real (exclui sistema/nota_interna)
  // é de ENTRADA (cliente) — sem resposta de saída posterior do atendente.
  // A última real vem pronta no embed `real` (o `ult` só conta se também for real; vence a mais nova).
  const aberta = c.status !== 'resolvida' && c.status !== 'fechada';
  const reais = brutas.filter((m) => m.tipo !== 'sistema' && m.tipo !== 'nota_interna');
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
  // Regra em nomeDoContato (fonte única: também o patch de `contatos` do realtime).
  const temPn = (c.contatos?.contato_identidades ?? []).some((i) => i.tipo === 'whatsapp');
  const displayName = nomeDoContato(c.contatos?.nome ?? null, c.contatos?.telefone ?? null, temPn);
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
    // por que a IA pediu humano e quando — vira o evento de handoff no fio da conversa
    precisaHumanoMotivo: c.precisa_humano_motivo ?? null,
    precisaHumanoEm: c.precisa_humano_em ?? null,
    fixada: !!c.fixada_em,
    silenciada: !!c.silenciada_ate && new Date(c.silenciada_ate).getTime() > Date.now(),
    criadaEm: c.criado_em ?? null,
    respId: c.contatos?.responsavel_id ?? null,
    atendenteId: c.atendente_id ?? null,
    // v27: canais.nome_interno via conversas.canal_id = CANAL ATUAL do atendimento (ANDRIUS/URA/LUIZA/RMKT)
    canalAtual: c.canais?.nome_interno ?? null,
    // preview limpo: texto/legenda vence; sem texto, rótulo da mídia ("Mensagem de voz (0:12)").
    // Usa a última mensagem REAL (exclui sistema/nota_interna) — nota interna não vira preview.
    last: previewUltimaMensagem(ultimaReal
      ? { tipo: ultimaReal.tipo, texto: ultimaReal.conteudo, seconds: ultimaReal.metadados?.seconds ?? null, ptt: ultimaReal.metadados?.ptt }
      : { tipo: lastMsg?.tipo, texto: lastMsg?.text }),
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

/* ===================== Etapa do Kanban por contato (etiqueta da lista) =====================
 * Uma query por org (não N por conversa). Regra ('ganho grudento') em etapasDeOportunidades /
 * etapaDoContato (whatsappRealtime.ts) — a MESMA da busca-alvo. Best-effort: erro => Map vazio
 * (lista segue viva). ABORTO NÃO: carga cancelada RELANÇA o AbortError — um mapa vazio aplicado
 * tiraria o selo de todo cliente com ganho (cairia em Todos). */
const SELECT_OPPS = 'contato_id, status, responsavel_id, atualizado_em, id, funil_colunas(nome, cor, entrada, resultado)';
export async function etapasPorContato(orgId: string, signal?: AbortSignal | null): Promise<Map<string, EtapaContato>> {
  try {
    // PAGINAÇÃO (18/09): sem paginar, o PostgREST corta em 1000 linhas (db-max-rows) — com 3,3k+
    // oportunidades, os ganhos/perdidos ANTIGOS caíam fora do mapa e o cliente aparecia como ativo
    // (ganho vazava pra "Meus"). KEYSET por id (imutável) p/ não pular/duplicar na fronteira; a regra
    // "ganho grudento" depende da ordem de NEGÓCIO (atualizado_em desc), ordenada em JS depois.
    const linhas = await buscarKeyset<OppLinha>(
      (cursor, tam, sig) => {
        let q = supabase!
          .from('oportunidades')
          .select(SELECT_OPPS)
          .eq('organizacao_id', orgId)
          .order('id', { ascending: false })
          .limit(tam);
        if (cursor) q = q.lt('id', cursor);
        if (sig) q = q.abortSignal(sig);
        return q.then((r) => ({ data: (r.data as unknown as OppLinha[]) ?? null, error: r.error }));
      },
      (r) => r.id,
      { melhorEsforco: true, rotulo: 'oportunidades', signal },
    );
    return etapasDeOportunidades(linhas);
  } catch (e) {
    if (ehAbortado(e)) throw e;
    return new Map();   // sem etapa: a lista continua funcionando
  }
}

/* Estado da IA/bot por conversa (tabela ia_sessoes). Fetch SEPARADO e BEST-EFFORT, exatamente
   como etapasPorContato (inclusive o aborto relançado): se falhar (grant/RLS) a lista segue
   funcionando, só sem o selo de IA. conversa_id é UNIQUE em ia_sessoes (uma sessão por conversa).
   iaAtiva reproduz a MESMA fórmula do botão do cabeçalho (iaDaLinha). ENXUTA: só
   dados->desativado_manual, não o `dados` inteiro (1,63 MB → ~0,3 MB por carga). */
const SELECT_IA = 'conversa_id, status, desativado_manual:dados->desativado_manual';
type RowIa = { conversa_id: string; status: string | null; desativado_manual?: unknown };
/** Todas as sessões de IA da org, enxutas. `melhorEsforco`: página com erro devolve o que juntou. */
async function lerIaSessoes(orgId: string, signal: AbortSignal | null | undefined, melhorEsforco: boolean): Promise<Map<string, IaEstadoLista>> {
  const map = new Map<string, IaEstadoLista>();
  // PAGINAÇÃO (18/09): idem etapasPorContato — com 1,3k+ sessões o corte de 1000 deixava conversas
  // com o selo de IA errado. Keyset por conversa_id (único, imutável); ordem não importa (mapa por chave).
  const linhas = await buscarKeyset<RowIa>(
    (cursor, tam, sig) => {
      let q = supabase!
        .from('ia_sessoes')
        .select(SELECT_IA)
        .eq('organizacao_id', orgId)
        .order('conversa_id', { ascending: false })
        .limit(tam);
      if (cursor) q = q.lt('conversa_id', cursor);
      if (sig) q = q.abortSignal(sig);
      return q.then((r) => ({ data: (r.data as unknown as RowIa[]) ?? null, error: r.error }));
    },
    (r) => r.conversa_id,
    { melhorEsforco, rotulo: 'ia_sessoes', signal },
  );
  for (const r of linhas) if (r.conversa_id) map.set(r.conversa_id, iaDaLinha(r));
  return map;
}
export async function iaSessoesPorConversa(orgId: string, signal?: AbortSignal | null): Promise<Map<string, IaEstadoLista>> {
  try {
    return await lerIaSessoes(orgId, signal, true);
  } catch (e) {
    if (ehAbortado(e)) throw e;
    return new Map();   // sem estado de IA: a lista continua funcionando
  }
}
/** Releitura ENXUTA do estado de IA para o refresh de 60 s do realtime (ia_sessoes não tem evento).
 *  ESTRITA: qualquer erro lança — um mapa parcial "desligaria" o selo de quem ficou de fora. */
export const iaSessoesEstrito = (orgId: string, signal?: AbortSignal | null) => lerIaSessoes(orgId, signal, false);

/* ===================== Busca-alvo (realtime sem recarga completa) =====================
 * Busca SÓ as conversas pedidas — por id ou por contato — com o MESMO select/embeds
 * (consultaListaConversas), o MESMO mapConversa e a MESMA etapa/IA da carga completa (restritas aos
 * contatos/conversas do lote: TODAS as oportunidades de cada contato, p/ o ganho grudento). Os
 * derivados saem iguais por construção. ESTRITA: qualquer erro (inclusive satélite) LANÇA — quem
 * chama cai na recarga completa; nunca aplica card sem etapa (cliente com ganho cairia em Todos). */
const LOTE_ALVO = 100;   // ≤ 200 pedidos; 100 UUIDs mantêm a URL longe do teto (~4 KB de filtro)
async function etapasDosContatos(orgId: string, contatoIds: string[], signal?: AbortSignal | null): Promise<Map<string, EtapaContato>> {
  const linhas: OppLinha[] = [];
  for (let i = 0; i < contatoIds.length; i += LOTE_ALVO) {
    const lote = contatoIds.slice(i, i + LOTE_ALVO);
    const parte = await buscarKeyset<OppLinha>(
      (cursor, tam, sig) => {
        let q = supabase!
          .from('oportunidades')
          .select(SELECT_OPPS)
          .eq('organizacao_id', orgId)
          .in('contato_id', lote)
          .order('id', { ascending: false })
          .limit(tam);
        if (cursor) q = q.lt('id', cursor);
        if (sig) q = q.abortSignal(sig);
        return q.then((r) => ({ data: (r.data as unknown as OppLinha[]) ?? null, error: r.error }));
      },
      (r) => r.id,
      { rotulo: 'oportunidades (alvo)', signal },
    );
    for (const l of parte) linhas.push(l);
  }
  return etapasDeOportunidades(linhas);
}
async function iaDasConversas(orgId: string, conversaIds: string[], signal?: AbortSignal | null): Promise<Map<string, IaEstadoLista>> {
  const map = new Map<string, IaEstadoLista>();
  for (let i = 0; i < conversaIds.length; i += LOTE_ALVO) {
    const lote = conversaIds.slice(i, i + LOTE_ALVO);
    const parte = await buscarKeyset<RowIa>(
      (cursor, tam, sig) => {
        let q = supabase!
          .from('ia_sessoes')
          .select(SELECT_IA)
          .eq('organizacao_id', orgId)
          .in('conversa_id', lote)
          .order('conversa_id', { ascending: false })
          .limit(tam);
        if (cursor) q = q.lt('conversa_id', cursor);
        if (sig) q = q.abortSignal(sig);
        return q.then((r) => ({ data: (r.data as unknown as RowIa[]) ?? null, error: r.error }));
      },
      (r) => r.conversa_id,
      { rotulo: 'ia_sessoes (alvo)', signal },
    );
    for (const r of parte) if (r.conversa_id) map.set(r.conversa_id, iaDaLinha(r));
  }
  return map;
}

export async function buscarConversasAlvo(orgId: string, alvos: LoteAlvos, signal?: AbortSignal | null): Promise<WaContact[]> {
  const porId = new Map<string, DbConv>();
  const pedir = async (col: 'id' | 'contato_id', vals: string[]) => {
    for (let i = 0; i < vals.length; i += LOTE_ALVO) {
      lancarSeAbortado(signal);
      let q = consultaListaConversas(orgId).in(col, vals.slice(i, i + LOTE_ALVO));
      if (signal) q = q.abortSignal(signal);
      const { data, error } = await q;
      lancarSeAbortado(signal);
      if (error) throw new Error(error.message);
      const rows = (data as unknown as DbConv[]) ?? [];
      // sem limit explícito o PostgREST corta em 1000 (db-max-rows): lote cheio = pode ter faltado linha
      if (rows.length >= 1000) throw new Error('Busca pontual atingiu o teto do PostgREST.');
      for (const c of rows) if (c?.id) porId.set(c.id, c);
    }
  };
  await pedir('id', alvos.ids);
  await pedir('contato_id', alvos.contatoIds);
  const linhas = [...porId.values()];
  if (!linhas.length) return [];
  const contatos = [...new Set(linhas.map((c) => c.contatos?.id).filter((x): x is string => !!x))];
  const [etapas, ia] = await Promise.all([
    etapasDosContatos(orgId, contatos, signal),
    iaDasConversas(orgId, linhas.map((c) => c.id), signal),
  ]);
  lancarSeAbortado(signal);
  return linhas.map((l) => {
    const c = mapConversa(l);
    return aplicarSatelites(c, c.contatoId ? etapas.get(c.contatoId) : null, ia.get(c.id));
  });
}

/* ===================== Motor do realtime por org (módulo) =====================
 * Estado COMPARTILHADO entre a carga completa (queryFn) e o canal wa-<org> (useWaConversations):
 * os carimbos da corrida carga × evento e a fila de busca-alvo do canal montado. */
interface EstadoRtOrg {
  carimbos: CarimbosRealtime; motor: MotorRealtime | null; inscrito: boolean;
  /** quando a última carga completa da lista partiu ou pousou (ms) — relógio do backstop próprio */
  ultimaCargaEm: number;
}
const RT_ORG = new Map<string, EstadoRtOrg>();
function estadoRt(orgId: string): EstadoRtOrg {
  let e = RT_ORG.get(orgId);
  if (!e) { e = { carimbos: new CarimbosRealtime(), motor: null, inscrito: false, ultimaCargaEm: 0 }; RT_ORG.set(orgId, e); }
  return e;
}
/** O queryFn da lista registra aqui cada carga completa (ao partir e ao pousar). */
export function registrarCargaCompleta(orgId: string, em = Date.now()): void {
  estadoRt(orgId).ultimaCargaEm = em;
}

/** Escrita INCREMENTAL na lista ['wa-conversas', org] (patch do realtime, busca-alvo, refresh de IA,
 *  patch otimista). Mantém o dataUpdatedAt da última CARGA COMPLETA: setQueryData sem `updatedAt`
 *  grava "agora" — com eventos a cada poucos segundos a lista nunca ficava velha (staleTime 180 s)
 *  e o refetchOnWindowFocus/montagem nunca recarregava. Updater devolvendo undefined = não grava. */
export function gravarListaIncremental(
  qc: QueryClient, orgId: string, fn: (l: WaContact[] | undefined) => WaContact[] | undefined,
): void {
  const chave = ['wa-conversas', orgId];
  const em = qc.getQueryState(chave)?.dataUpdatedAt;
  qc.setQueryData<WaContact[]>(chave, (old) => fn(old), em ? { updatedAt: em } : undefined);
}

/** Pede a busca-alvo destas conversas/contatos (o banco acabou de mudar para eles). Sem o canal do
 *  inbox montado nesta aba, só marca a lista como velha (recarrega ao montar). */
export function pedirBuscaAlvo(qc: QueryClient, orgId: string, alvos: Alvos): void {
  const rt = estadoRt(orgId);
  rt.carimbos.tocar(alvos);
  if (rt.motor) rt.motor.pedir(alvos);
  else void qc.invalidateQueries({ queryKey: ['wa-conversas', orgId] });
}

/** Busca-alvo IMEDIATA (nova conversa, deep-link para conversa ainda fora da lista).
 *  false = sem canal montado ou a busca falhou (a recarga completa já foi pedida). */
export async function buscarConversasAgora(orgId: string, alvos: Alvos): Promise<boolean> {
  const m = RT_ORG.get(orgId)?.motor;
  return m ? m.agora(alvos) : false;
}

/** Patch OTIMISTA de um card direto no cache ['wa-conversas', org] (marcar lida/arquivar/fixar):
 *  no cache — não só no estado local — para a reconciliação da lista não desfazer, e carimbado para
 *  uma carga completa que partiu antes não sobrescrever.
 *  - confirmar(): chamar quando a RPC RESOLVE — recarimba: uma busca que abriu depois do patch mas
 *    leu o banco ANTES do commit da RPC desconfia e rebusca (se o UPDATE do realtime se perder);
 *  - desfazer(): erro da RPC — volta só os campos tocados e pede a recarga completa. */
export interface PatchOtimista { confirmar: () => void; desfazer: () => void }
export function patchOtimistaLista(qc: QueryClient, orgId: string, conversaId: string, patch: Partial<WaContact>): PatchOtimista {
  const rt = estadoRt(orgId);
  let anterior: Partial<WaContact> | null = null;
  gravarListaIncremental(qc, orgId, (l) => {
    if (!l) return undefined;
    const r = aplicarPatchComDesfazer(l, conversaId, patch);
    anterior = r.desfazer;
    return r.lista;
  });
  rt.carimbos.tocar({ ids: [conversaId] });
  return {
    confirmar: () => { rt.carimbos.tocar({ ids: [conversaId] }); },
    desfazer: () => {
      const volta: Partial<WaContact> | null = anterior;
      if (volta) gravarListaIncremental(qc, orgId, (l) => (l ? aplicarPatchComDesfazer(l, conversaId, volta).lista : undefined));
      rt.carimbos.tocar({ ids: [conversaId] });
      void qc.invalidateQueries({ queryKey: ['wa-conversas', orgId] });
    },
  };
}

/** Histórico da conversa ABERTA (['wa-msgs', org, conversa]) a partir do payload do realtime:
 *  patch direto; INSERT ainda invalida SÓ a conversa do evento (rede barata).
 *  CORRIDA: um refetch do histórico JÁ EM VOO leu o banco antes deste evento e, ao pousar, SUBSTITUI
 *  o cache (o react-query não mescla) — desfaria o patch (ACK voltava, a mídia que acabou de ficar
 *  visível SUMIA). Por isso, com fetch em voo, o UPDATE também invalida: cancela o velho e refaz. */
export function aplicarEventoNoHistorico(
  qc: QueryClient, orgId: string, evt: string, novo: Record<string, unknown> | null, velho: Record<string, unknown> | null,
): void {
  try {
    if (evt === 'DELETE') {
      const id = velho?.id as string | undefined;
      if (id) qc.setQueriesData<WaMessage[]>({ queryKey: ['wa-msgs'] }, (old) => (old ? removerDoHistorico(old, id) : old));
      void qc.invalidateQueries({ queryKey: ['wa-msgs', orgId] });
      return;
    }
    const convId = novo?.conversa_id as string | undefined;
    if (!convId) { void qc.invalidateQueries({ queryKey: ['wa-msgs', orgId] }); return; }
    const chave = ['wa-msgs', orgId, convId];
    // UPDATE sem as colunas grandes inalteradas (TOAST): não patcha às cegas, recarrega a conversa
    if (linhaMsgIncompleta(novo)) { void qc.invalidateQueries({ queryKey: chave }); return; }
    const [m] = mapMensagens([novo as unknown as DbMsg]);
    if (m) qc.setQueryData<WaMessage[]>(chave, (old) => (old ? upsertHistorico(old, m) : undefined));
    const emVoo = qc.getQueryState(chave)?.fetchStatus === 'fetching';
    if (evt === 'INSERT' || !m || emVoo) void qc.invalidateQueries({ queryKey: chave });
  } catch {
    void qc.invalidateQueries({ queryKey: ['wa-msgs', orgId] });
  }
}

/** Motor do realtime da lista desta org, com os fios do react-query/supabase (useWaConversations o
 *  monta junto do canal). `sobrepor` só para teste. */
export function criarMotorDaLista(qc: QueryClient, orgId: string, sobrepor: Partial<DepsMotor> = {}): MotorRealtime {
  const rt = estadoRt(orgId);
  return criarMotorRealtime({
    carimbos: rt.carimbos,
    ler: () => qc.getQueryData<WaContact[]>(['wa-conversas', orgId]),
    gravar: (fn) => gravarListaIncremental(qc, orgId, fn),
    buscar: (lote, signal) => buscarConversasAlvo(orgId, lote, signal),
    // piso: a recarga completa (o comportamento antigo), coalescida pelo motor
    recarregarTudo: () => { void qc.invalidateQueries({ queryKey: ['wa-conversas', orgId] }); },
    aviso: (m) => console.info('[wa]', m),
    ctx: {
      // visibilidade: com recorte, contato que acabou de virar MEU entra por busca-alvo do contato
      donoDoEscopo: () => escopoLista(orgId),
      mapMensagem: (row) => mapMensagens([row as unknown as DbMsg])[0] ?? null,
      canalPorId: (id) => {
        const c = qc.getQueryData<WaCanal[]>(['wa-canais', orgId])?.find((x) => x.id === id);
        return c ? { alias: c.alias } : null;
      },
    },
    intervaloMs: 1000,   // throttle (não debounce): no máximo 1 busca-alvo por segundo por aba
    atrasoMs: 150,       // junta a rajada do webhook (conversa + mensagem + UPDATEs) numa busca só
    // BACKSTOP de 240 s e refresh de IA de 60 s, só com a aba visível (mesma regra do refetchInterval)
    backstopMs: 240_000,
    ultimaCargaCompletaEm: () => rt.ultimaCargaEm,
    visivel: () => focusManager.isFocused(),
    buscarIa: (signal) => iaSessoesEstrito(orgId, signal),
    iaIntervaloMs: 60_000,
    ...sobrepor,
  });
}

/* ===================== Hooks ===================== */
export function useWaConversations() {
  const { currentOrg } = useOrg();
  const qc = useQueryClient();
  const orgId = currentOrg.id;
  // VISIBILIDADE (22/10): o recorte vai na consulta (escopo gravado ANTES da query partir) e
  // também na saída (select): o cache nunca remove um card — conversa transferida para outra
  // pessoa, ou carregada por outro usuário nesta mesma aba, não pode aparecer.
  const vis = useVisibilidade();
  const soDoUsuario = vis.veTodos ? null : vis.uid ?? '';
  definirEscopoLista(orgId, soDoUsuario);
  const recortar = useCallback(
    (lista: WaContact[]) => (soDoUsuario === null ? lista : lista.filter((c) => !!soDoUsuario && c.respId === soDoUsuario)),
    [soDoUsuario],
  );

  const query = useQuery({
    queryKey: ['wa-conversas', orgId],
    enabled: WA_REAL,
    select: recortar,
    // PERF: o realtime (abaixo) é a fonte de frescor; este intervalo é só BACKSTOP, como o
    // comentário sempre disse. Antes eram 6s — e como o fetch levava ~3,8s, a requisição mal
    // terminava antes da próxima começar. O realtime cobre o tempo-real; este intervalo é só a
    // rede de segurança se o canal cair. 2026-09-04: subido 60s→120s e com staleTime de 45s porque
    // o inbox é a query MAIS PESADA do sistema (média ~400ms, picos de ~8s) e, multiplicada por
    // várias abas + refetch ao focar, saturava o compute/conexões. O staleTime impede que cada
    // troca de aba redispare a query pesada; o realtime aplica os deltas ao vivo mesmo assim.
    // 2026-09-21 (incidente de saturação no pico de segunda): subido de 120s/45s p/ 240s/180s.
    // O realtime (setQueryData abaixo) é a fonte de frescor AO VIVO; este refetch é só reconciliação.
    // Rodar a query mais pesada do sistema com metade da frequência alivia a saturação de conexão/CPU
    // no compute Micro (mesmo com o índice novo, cada round-trip espera na fila no pico).
    // NÃO desligar este backstop nem o refetchOnWindowFocus (nem o structuralSharing) antes de uma
    // semana com '[wa] reconciliação' perto de 0: são a rede de segurança do caminho incremental.
    // ATENÇÃO (react-query 5): todo setQueryData reinicia este intervalo — com o realtime fazendo
    // patch a cada poucos segundos ele quase nunca dispara. O backstop QUE VALE é o relógio do motor
    // (criarMotorDaLista: 240 s desde a última carga completa, registrarCargaCompleta) e as escritas
    // incrementais preservam o dataUpdatedAt (gravarListaIncremental) para o foco recarregar. Este
    // intervalo fica como reforço (sem patches, dispara sozinho).
    refetchInterval: 240_000,
    staleTime: 180_000,
    refetchOnWindowFocus: true,
    // 30 min (só nesta query): voltar ao inbox depois de passar pelo Kanban/Dashboard pinta na
    // hora com a lista em memória (o canal, ao se inscrever de novo, dispara a recarga atrás).
    // Antes, com o padrão de 5 min, era partida a frio: esqueleto + 18 requisições.
    gcTime: 30 * 60_000,
    queryFn: async ({ signal }): Promise<WaContact[]> => {
      const rt = estadoRt(orgId);
      const inscritoNoInicio = rt.inscrito;
      registrarCargaCompleta(orgId);   // relógio do backstop: partiu agora (falha também conta: 240 s até a próxima)
      const marco = rt.carimbos.abrir();
      try {
        // ABORTO REAL: o react-query cancela a carga em andamento a cada invalidate/refetch
        // (cancelRefetch). Com o signal em CADA página das 3 cadeias, as páginas restantes param
        // (antes a carga abandonada ia até o fim e o banco fazia o trabalho em dobro).
        const etapasPromise = etapasPorContato(orgId, signal);   // dispara junto; espera depois do fetch principal
        const iaPromise = iaSessoesPorConversa(orgId, signal);   // idem: estado da IA/bot por conversa (fetch paralelo)
        // abortados, os satélites rejeitam: marca como tratado p/ não virar "unhandled rejection"
        // se a cadeia principal lançar antes de chegar ao await deles
        etapasPromise.catch(() => undefined);
        iaPromise.catch(() => undefined);
        // Select e embeds (só a última mensagem real + a última de qualquer tipo, não mais as 10
        // últimas): ver SELECT_CONVERSAS / consultaListaConversas — fonte única, também da busca-alvo.
        // PAGINAÇÃO (18/09): sem paginar, o PostgREST corta em 1000 linhas (db-max-rows) — com 2,6k+
        // conversas não-arquivadas, ~1,6k NÃO CARREGAVAM (clientes "sumidos" do inbox). KEYSET por id
        // (ÚNICO e IMUTÁVEL): a ordenação por ultima_interacao_em é MUTÁVEL e paginar por ela pularia/
        // duplicaria conversas que recebem msg durante o fetch. A ordem de EXIBIÇÃO é refeita no JS
        // (arr.sort abaixo), então paginar por id não muda o que o usuário vê — só garante lista completa.
        const linhas = await buscarKeyset<DbConv>(
          (cursor, tam, sig) => {
            let q = consultaListaConversas(orgId)
              .order('id', { ascending: false })
              .limit(tam);
            if (cursor) q = q.lt('id', cursor);
            if (sig) q = q.abortSignal(sig);
            return q.then((r) => ({ data: (r.data as unknown as DbConv[]) ?? null, error: r.error }));
          },
          (c) => (c as unknown as { id: string }).id,
          { rotulo: 'conversas', signal },
        );
        // Etapa do Kanban por contato + IA por conversa. Best-effort, em PARALELO com o fetch principal.
        const etapas = await etapasPromise;
        const iaEstados = await iaPromise;   // etapa por CONTATO; IA por CONVERSA
        lancarSeAbortado(signal);
        const carga = linhas.map((l) => {
          const c = mapConversa(l);
          return aplicarSatelites(c, c.contatoId ? etapas.get(c.contatoId) : null, iaEstados.get(c.id));
        });
        // CORRIDA: evento/patch/busca-alvo aplicado DEPOIS que esta carga partiu está mais novo no
        // cache do que aqui — o item fica com a versão do cache e ganha uma busca-alvo nova; conversa
        // que chegou por busca-alvo e ainda não está nesta carga não some.
        const atual = qc.getQueryData<WaContact[]>(['wa-conversas', orgId]);
        const { lista: arr, tocados } = pousarCargaCompleta(atual, carga, rt.carimbos, marco);
        if (atual) {
          // métrica do caminho incremental: o que os patches/buscas-alvo deixaram de refletir
          const d = contarDivergencias(atual, arr);
          if (d.total) console.info('[wa] reconciliação', d);
        }
        if (tocados.ids.length || tocados.contatoIds.length) rt.motor?.pedir(tocados);
        // O canal se inscreveu DURANTE esta carga (partida a frio): eventos entre a leitura das
        // páginas e a inscrição nunca chegam → mais uma carga completa, já com o canal no ar.
        if (!inscritoNoInicio && rt.inscrito) setTimeout(() => { void qc.invalidateQueries({ queryKey: ['wa-conversas', orgId] }); }, 0);
        // Ordenação: 1) abertas aguardando resposta (mais antiga primeiro);
        // 2) demais abertas por atividade mais recente; 3) encerradas por atividade.
        const rank = (x: WaContact) => (x.aguardando ? 0 : x.aberta ? 1 : 2);
        arr.sort((a, b) => {
          const ra = rank(a), rb = rank(b);
          if (ra !== rb) return ra - rb;
          if (ra === 0) return new Date(a.aguardandoDesde || 0).getTime() - new Date(b.aguardandoDesde || 0).getTime();
          return (b.lastAtMs || 0) - (a.lastAtMs || 0);
        });
        registrarCargaCompleta(orgId);   // pousou
        return arr;
      } finally {
        rt.carimbos.fechar(marco);
      }
    },
  });

  // REALTIME SEM RECARGA COMPLETA (ver o cabeçalho de whatsappRealtime.ts). Antes, TODO evento
  // (INSERT/ACK/DELETE de mensagens, qualquer evento de conversas/contatos) chamava a recarga
  // completa coalescida em 4 s — cada evento isolado virava 1 carga completa por aba (18
  // requisições, ~36 MB; 11 eventos geraram 21 cargas em 55 s). Agora cada evento é roteado:
  // patch no cache, e/ou busca-alvo SÓ das linhas afetadas (fila com throttle ~1 s), e recarga
  // completa só no que o caminho incremental não sabe tratar ou quando ele falha.
  // Etapa: `oportunidades` (na publication, como no Kanban) vira busca-alvo por contato — mover no
  // Kanban (ganho → Fechados, etapa nova) chega nas outras abas em ~1 s. IA: ia_sessoes está FORA da
  // publication (pedir tabela fora dela derruba o canal inteiro em silêncio) → o motor relê o estado
  // de IA enxuto a cada 60 s com a aba visível. Backstop próprio de 240 s no relógio do motor.
  useEffect(() => {
    if (!WA_REAL) return;
    const chave = ['wa-conversas', orgId];
    const rt = estadoRt(orgId);
    let vivo = true;
    const motor = criarMotorDaLista(qc, orgId);
    rt.motor = motor;

    const aoEvento = (tabela: TabelaRt) => (payload: { eventType: string; new: unknown; old: unknown }) => {
      if (!vivo) return;
      const novo = (payload.new ?? null) as Record<string, unknown> | null;
      const velho = (payload.old ?? null) as Record<string, unknown> | null;
      // histórico da conversa ABERTA: patch direto (ACK é só patch; antes cada evento da org refazia
      // o histórico inteiro da conversa aberta)
      if (tabela === 'mensagens') aplicarEventoNoHistorico(qc, orgId, payload.eventType, novo, velho);
      motor.evento(tabela, payload.eventType, novo, velho);
    };

    let jaInscrito = false;
    let ch = supabase!.channel(`wa-${orgId}`);
    // mensagens/conversas: patch + busca-alvo; contatos (responsável: assumir/transferir, nome):
    // patch + busca-alvo do contato; oportunidades (etapa/ganho): busca-alvo do contato
    for (const tabela of TABELAS_CANAL_WA) {
      ch = ch.on('postgres_changes', { event: '*', schema: 'public', table: tabela, filter: `organizacao_id=eq.${orgId}` }, aoEvento(tabela));
    }
    ch = ch
      // GOTCHA: se QUALQUER tabela pedida estiver fora da publication supabase_realtime, o
      // Realtime rejeita o pedido de postgres_changes INTEIRO (todas as tabelas) — e o aviso chega
      // como evento 'system' com o channel ainda reportando SUBSCRIBED. Foi exatamente assim que
      // o inbox ficou sem realtime nenhum (contatos fora da publication) sem nenhum erro visível.
      .on('system', {}, (msg: { status?: string; message?: string }) => {
        if (msg?.status === 'error') console.error('[wa] realtime postgres_changes recusado:', msg?.message);
      })
      .subscribe((status, err) => {
        if (!vivo) return;
        if (status === 'SUBSCRIBED') {
          // (RE)INSCRITO: o que aconteceu sem o canal (montagem, queda, aba dormindo, volta ao inbox
          // com a lista em memória) nunca vai chegar como evento → 1 recarga completa. Na partida a
          // frio a carga em voo não é cancelada (sem dado ainda): ela mesma pede a segunda ao pousar.
          rt.inscrito = true;
          void qc.invalidateQueries({ queryKey: chave });
          if (jaInscrito) void qc.invalidateQueries({ queryKey: ['wa-msgs', orgId] });
          jaInscrito = true;
          return;
        }
        rt.inscrito = false;
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') console.error('[wa] realtime indisponível:', err?.message ?? status);
      });
    return () => {
      vivo = false;
      rt.inscrito = false;
      motor.parar();
      if (rt.motor === motor) rt.motor = null;
      supabase!.removeChannel(ch);
    };
  }, [orgId, qc]);

  return query;
}

/** Histórico COMPLETO da conversa ABERTA, sob demanda.
 *  A lista traz só a última mensagem de cada conversa (embeds `real` + `ult`, payload leve); o histórico
 *  integral — que é o que o atendente lê — vem por aqui, de UMA conversa só. Usa exatamente as
 *  mesmas colunas e o mesmo mapeamento (mapMensagens) da lista, então a bolha não muda de forma:
 *  mídia (anexo/pendente), status/erro para "Ver erro" e retry, id_externo/respondida_a_id/quoted
 *  para a resposta citada e tsISO para o separador de dia continuam todos presentes. */
export function useWaMensagens(conversaId: string | null | undefined) {
  const { currentOrg } = useOrg();
  const orgId = currentOrg.id;
  return useQuery({
    queryKey: ['wa-msgs', orgId, conversaId ?? ''],
    enabled: WA_REAL && !!conversaId,
    // BACKSTOP: o frescor vem do realtime (patch + invalidação da conversa do evento em
    // useWaConversations), mas a conversa
    // ABERTA não pode congelar se o realtime cair — a lista tem o backstop de 30s e devolve o
    // histórico VELHO à conversa aberta (reconciliarLista), então sem isto a mensagem nova só
    // aparecia ao trocar de conversa. É UMA conversa por consulta: barato.
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<WaMessage[]> => {
      const { data, error } = await supabase!
        .from('mensagens')
        .select(COLS_MSG_LISTA)
        .eq('conversa_id', conversaId!)
        .eq('organizacao_id', orgId) // Fase 2.0: escopo explícito — RLS vira cinto
        .order('criado_em', { ascending: true });
      if (error) throw new Error(error.message);
      return mapMensagens((data as unknown as DbMsg[]) ?? []);
    },
  });
}

// ---- IA SDR: estado e liga/desliga por conversa (botão no cabeçalho do inbox) ----
export interface IaEstadoConversa { existe: boolean; status?: string; etapa?: string; desativado_manual?: boolean; aguardando_humano?: string | null }
export function useIaEstadoConversa(conversaId: string | null | undefined) {
  return useQuery({
    queryKey: ['ia-estado', conversaId ?? ''],
    enabled: WA_REAL && !!conversaId,
    refetchInterval: 20_000,   // a IA muda de estado sozinha (pausa/handoff) — mantém o botão fresco
    queryFn: async (): Promise<IaEstadoConversa> => {
      const { data, error } = await supabase!.rpc('ia_conversa_estado', { p_conversa: conversaId! });
      if (error) throw new Error(error.message);
      return (data as IaEstadoConversa) ?? { existe: false };
    },
  });
}
export function useIaToggle() {
  const qc = useQueryClient();
  const { currentOrg } = useOrg();
  return useMutation({
    mutationFn: async ({ conversaId, ativar }: { conversaId: string; ativar: boolean }) => {
      const { data, error } = await supabase!.rpc('ia_conversa_toggle', { p_conversa: conversaId, p_ativar: ativar });
      if (error) throw new Error(error.message);
      return data as { ok: boolean; ia: string };
    },
    onSettled: (_d, _e, v) => {
      qc.invalidateQueries({ queryKey: ['ia-estado', v.conversaId] });
      // selo/filtro de IA do card: ia_sessoes não tem realtime → busca-alvo da conversa
      pedirBuscaAlvo(qc, currentOrg.id, { ids: [v.conversaId] });
    },
  });
}
/** "Recomeçar atendimento": reativa a IA DO ZERO (etapa inicial, estado limpo) — RPC ia_conversa_recomecar.
 *  Diferente do toggle (que só retoma): usado quando a pessoa volta a chamar e o atendente quer que a IA reinicie. */
export function useIaRecomecar() {
  const qc = useQueryClient();
  const { currentOrg } = useOrg();
  return useMutation({
    mutationFn: async ({ conversaId }: { conversaId: string }) => {
      const { data, error } = await supabase!.rpc('ia_conversa_recomecar', { p_conversa: conversaId });
      if (error) throw new Error(error.message);
      return data as { ok: boolean; ia: string };
    },
    onSettled: (_d, _e, v) => {
      qc.invalidateQueries({ queryKey: ['ia-estado', v.conversaId] });
      pedirBuscaAlvo(qc, currentOrg.id, { ids: [v.conversaId] });   // selo de IA do card (ver useIaToggle)
    },
  });
}

/** Marca curta da org no carimbo de assinatura (organizacoes.assinatura_marca; ex.: "CAF").
 *  A assinatura é OBRIGATÓRIA e aplicada no BACKEND — o front só espelha (bolha otimista/preview). */
export function useAssinaturaMarca() {
  const { currentOrg } = useOrg();
  return useQuery({
    queryKey: ['assinatura-marca', currentOrg.id],
    enabled: WA_REAL,
    staleTime: 60 * 60_000, // marca praticamente não muda
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await supabase!.from('organizacoes').select('assinatura_marca').eq('id', currentOrg.id).maybeSingle();
      if (error) throw new Error(error.message);
      return (data?.assinatura_marca as string | null) ?? null;
    },
  });
}

export function useSendWaMessage() {
  const { currentOrg } = useOrg();
  const qc = useQueryClient();
  return useMutation({
    // identifica o envio da equipe: o Radar encerra na hora o aviso do cliente respondido (RadarSelos)
    mutationKey: ['wa-send'],
    // 'always': o React Query PAUSA mutações quando acha que está offline (navigator.onLine
    // pisca no Wi-Fi/aba em segundo plano) e só retoma quando "volta" — a mensagem ficava
    // presa em "enviando" até recarregar. Envio vai direto; se a rede falhar, cai no onError.
    networkMode: 'always',
    // Assinatura OBRIGATÓRIA aplicada no backend (evolution-send), resolvida lá pelo autor do
    // JWT — o payload NÃO leva nome de assinatura (front velho em cache não fura o padrão).
    // canalId = canal escolhido em "Responder por". O backend nunca confia em org vinda do cliente.
    // Retorna o id INTERNO da mensagem (para confirmação real do provedor). NÃO é garantia de entrega.
    mutationFn: async (input: { conversaId: string; text?: string; canalId?: string | null; retryMensagemId?: string; midiaPath?: string; midiaTipo?: string; midiaMime?: string; midiaNome?: string; midiaTamanho?: number; audioDiag?: Record<string, unknown>; origemAudio?: string; replyTo?: { id: string; idExt?: string; fromMe?: boolean; preview?: { remetente?: string; tipo?: string; texto?: string } }; contato?: { nome: string; telefone: string } }) => {
      const r = await invoke<{ ok: boolean; mensagem?: { id?: string } }>('evolution-send', {
        conversa_id: input.conversaId,
        ...(input.contato ? { contato_nome: input.contato.nome, contato_telefone: input.contato.telefone } : {}),
        ...(input.text ? { text: input.text } : {}),
        ...(input.canalId ? { canal_id: input.canalId } : {}),
        ...(input.retryMensagemId ? { retry_mensagem_id: input.retryMensagemId } : {}),
        ...(input.midiaPath ? { midia_path: input.midiaPath, midia_tipo: input.midiaTipo, midia_mime: input.midiaMime, midia_nome: input.midiaNome, midia_tamanho: input.midiaTamanho } : {}),
        ...(input.audioDiag ? { audio_diag: input.audioDiag } : {}),
        ...(input.origemAudio ? { origem_audio: input.origemAudio } : {}),
        ...(input.replyTo ? { reply_to_id: input.replyTo.id, reply_to_id_ext: input.replyTo.idExt, reply_to_from_me: input.replyTo.fromMe, reply_preview: input.replyTo.preview } : {}),
      });
      return r.mensagem?.id ?? null;
    },
    // Recarrega SÓ o histórico da conversa (barato). A LISTA ['wa-conversas'] é a query mais pesada
    // do sistema (keyset de todas as conversas, picos de ~8s) e era refeita inteira a CADA envio de
    // CADA atendente — disputando o banco com o próprio envio. A mensagem nova já chega na lista
    // pelo realtime (patch na hora + busca-alvo da conversa em useWaConversations).
    onSettled: (_d, _e, input) => qc.invalidateQueries({ queryKey: ['wa-msgs', currentOrg.id, input.conversaId] }),
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
    onSettled: (_d, erro, input) => {
      // Lista do inbox: o evento de `contatos` (responsavel_id) já faz patch + busca-alvo do contato;
      // aqui só reforça a busca-alvo (sem a recarga completa de antes). Erro = piso: recarga completa.
      if (erro) qc.invalidateQueries({ queryKey: ['wa-conversas', currentOrg.id] });
      else pedirBuscaAlvo(qc, currentOrg.id, { ids: [input.conversaId], contatoIds: [input.contatoId] });
      qc.invalidateQueries({ queryKey: ['wa-atividades'] });
      // Responsável é sincronizado no backend (trigger) para conversas + oportunidades +
      // ficha do contato + cobranças + agendamentos. Invalida cada superfície para refletir
      // o novo dono imediatamente (a página Contatos não tem realtime próprio).
      qc.invalidateQueries({ queryKey: ['kanban-leads', currentOrg.id] });
      qc.invalidateQueries({ queryKey: ['opp-do-contato', currentOrg.id] });
      qc.invalidateQueries({ queryKey: ['contatos', currentOrg.id] });
    },
  });
}

/** Colaboração Etapa 1: timeline de atividade da conversa (assumido/transferido/devolvido/…). Leitura RLS. */
export interface WaAtividade { id: string; tipo: string; usuario: string | null; motivo: string | null; em: string; }
export function useWaAtividades(conversaId: string | null) {
  const { currentOrg } = useOrg();
  const org = currentOrg.id;
  return useQuery({
    queryKey: ['wa-atividades', org, conversaId],
    enabled: WA_REAL && !!conversaId,
    queryFn: async (): Promise<WaAtividade[]> => {
      const { data, error } = await supabase!.from('conversa_atividades')
        .select('id, tipo, motivo, criado_em, usuario:usuarios(nome)')
        .eq('conversa_id', conversaId as string)
        .eq('organizacao_id', org) // Fase 2.0: escopo explícito
        .order('criado_em', { ascending: false }).limit(50);
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
  // visibilidade (22/10): quem não vê todos não abre (nem move de número) a conversa de cliente
  // de outra pessoa; contato NOVO criado por ele já nasce dele (senão sumiria da própria lista)
  const vis = useVisibilidade();
  const soDe = vis.veTodos ? null : vis.uid;
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
      if (contatoId && !vis.veTodos) {
        const { data: dono } = await supabase!.from('contatos')
          .select('responsavel_id, responsavel:usuarios(nome)').eq('id', contatoId).maybeSingle();
        const d = dono as { responsavel_id?: string | null; responsavel?: { nome?: string | null } | { nome?: string | null }[] | null } | null;
        if (!soDe || d?.responsavel_id !== soDe) {
          const r = Array.isArray(d?.responsavel) ? d?.responsavel[0] : d?.responsavel;
          throw new Error(d?.responsavel_id
            ? `Este número já é cliente de ${r?.nome?.trim() || 'outro atendente'}. Peça a transferência para atender.`
            : 'Este número já é um cliente sem responsável. Peça ao administrador para distribuir.');
        }
      }
      // 2/3) v27: UM atendimento ativo por CONTATO (não por canal). Se já existe conversa ativa,
      // reutiliza e só move o CANAL ATUAL para o canal escolhido — nunca cria duplicata.
      if (contatoId) {
        const { data: conv } = await supabase!.from('conversas')
          .select('id, canal_id').eq('organizacao_id', org).eq('contato_id', contatoId)
          .neq('status', 'fechada')
          .order('arquivada_em', { ascending: true, nullsFirst: true })
          .order('ultima_interacao_em', { ascending: false, nullsFirst: false })
          .limit(1).maybeSingle();
        if (conv?.id) {
          if (conv.canal_id !== input.canalId) {
            await supabase!.from('conversas').update({ canal_id: input.canalId, ultimo_canal_id: input.canalId }).eq('id', conv.id);
          }
          return { conversaId: conv.id as string, reused: true };
        }
      } else {
        // 5) cria contato (nome informado ou telefone como rótulo temporário)
        const nome = (input.nome || '').trim() || norm;
        const { data: novo, error: e1 } = await supabase!.from('contatos')
          .insert({ nome, telefone: norm, origem: 'WhatsApp', organizacao_id: org, ...(soDe ? { responsavel_id: soDe } : {}) }).select('id').single();
        if (e1 || !novo) throw new Error('Não foi possível iniciar a conversa.');
        contatoId = novo.id as string;
        // identidade whatsapp (best-effort; espelha o webhook p/ dedup quando o cliente responder)
        await supabase!.from('contato_identidades').insert({ contato_id: contatoId, organizacao_id: org, tipo: 'whatsapp', provedor: 'evolution', valor: norm, valor_normalizado: norm, principal: true });
      }
      // 6) cria a conversa (status 'aberta', sem responsável inicial). canal_origem_id = aquisição.
      const { data: nc, error: e2 } = await supabase!.from('conversas')
        .insert({ organizacao_id: org, contato_id: contatoId, canal_id: input.canalId, canal_origem_id: input.canalId, status: 'aberta' }).select('id').single();
      if (e2 || !nc) throw new Error('Não foi possível iniciar a conversa.');
      return { conversaId: nc.id as string, reused: false };
    },
    // Conversa nova/reutilizada: busca-alvo SÓ dela (o inbox v2 ainda espera a busca imediata antes
    // de selecionar — buscarConversasAgora). Erro = piso: recarga completa.
    onSettled: (d, erro) => {
      if (erro || !d) qc.invalidateQueries({ queryKey: ['wa-conversas', currentOrg.id] });
      else pedirBuscaAlvo(qc, currentOrg.id, { ids: [d.conversaId] });
    },
  });
}

export interface WaCanal {
  id: string; alias: string; numero: string | null; status: string; provider: string | null; conectadoEm: string | null;
  /** 'evolution' (QR/Baileys) ou 'cloud_api' (WhatsApp Cloud API oficial). Define o transporte de saída. */
  transporte: string;
  /** true quando o número está com restrição de conta no WhatsApp -> bloqueado só para ENVIO (recebe normal). */
  envioRestrito: boolean;
  /** saúde de ENTREGA (outbound), independente da sessão: ok|instavel|restrito|desconhecido. */
  entregaStatus: 'ok' | 'instavel' | 'restrito' | 'desconhecido';
  entregaErrosRecentes: number;
  /** conflito de número: este canal autenticou um número que já pertence a outro canal (não foi fundido). */
  conflitoCom: string | null;
  // metadados comerciais (configuráveis em Integrações)
  origemTipo: string | null; gestorId: string | null; gestorNome: string | null; fonteId: string | null; campanha: string | null; observacaoComercial: string | null;
}
export type EnvioSaudeEstado = 'ok' | 'instavel' | 'indisponivel';
export interface CanalEnvioSaude { estado: EnvioSaudeEstado; falhasConsecutivas: number; total: number; falhas: number }

/** Classifica a saúde de ENVIO a partir dos status das últimas saídas (mais RECENTE primeiro).
 *  Pura e testável. Baseia-se na taxa REAL de falha — NÃO no state=open.
 *  - indisponivel: >=3 saídas mais recentes seguidas com falha (ex.: o "0/N" do incidente);
 *  - instavel: >=2 falhas seguidas na frente, ou >=40% de falha na janela (o que já exige 2 falhas);
 *  - ok: caso contrário. Um sucesso na frente derruba o alerta (volta a saudável só com evidência).
 *  UMA falha isolada NÃO acende o aviso: a taxa basal de falha do provider é ~0,2%, então o gatilho
 *  antigo (consec>=1, total>=3) acendia "instável" toda semana com o envio saudável — e o atendente
 *  passou a ignorar o aviso, que é justamente o que não pode acontecer quando o chip cair de verdade. */
export function avaliarEnvioSaude(statusesRecentePrimeiro: string[]): CanalEnvioSaude {
  const total = statusesRecentePrimeiro.length;
  const falhas = statusesRecentePrimeiro.filter((s) => s === 'falhou').length;
  let consec = 0;
  for (const s of statusesRecentePrimeiro) { if (s === 'falhou') consec++; else break; }
  let estado: EnvioSaudeEstado = 'ok';
  if (consec >= 3) estado = 'indisponivel';
  else if (consec >= 2 || (total >= 3 && falhas / total >= 0.4)) estado = 'instavel';
  return { estado, falhasConsecutivas: consec, total, falhas };
}

/** Saúde de envio do canal a partir da taxa real de falha das últimas saídas (janela de 2h, últimas 10).
 *  MEDE PELO CHIP QUE DESPACHOU (metadados.canal_envio_id, carimbado pela evolution-send), não por
 *  `conversas.canal_id` — aquele é o canal de ORIGEM da conversa. A diferença não é acadêmica: em
 *  08/09 o EMPRÉSTIMO apareceu "instável" porque os envios que PASSARAM por ele foram descartados
 *  (as conversas tinham nascido em outro chip) e entraram no lugar 2 notas internas do IA SDR, que
 *  nunca vão ao WhatsApp. Amostra de 4 com 2 falhas = 50%, e o aviso acendeu sozinho.
 *  Só conta o que de fato saiu: id_externo preenchido (aceito pelo provider) ou status 'falhou'. */
export function useWaCanalEnvioSaude(canalId: string | null | undefined) {
  return useQuery({
    queryKey: ['wa-canal-envio-saude', canalId],
    enabled: WA_REAL && !!canalId,
    refetchInterval: 20000,
    queryFn: async (): Promise<CanalEnvioSaude> => {
      const desde = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase!
        .from('mensagens')
        .select('status, id_externo')
        .eq('metadados->>canal_envio_id', canalId!)
        .eq('direcao', 'saida')
        .gte('criado_em', desde)
        .order('criado_em', { ascending: false })
        .limit(10);
      if (error) throw new Error(error.message);
      const rows = (data as unknown as { status: string; id_externo: string | null }[]) ?? [];
      // nota interna (sem id_externo e sem falha) nunca tocou o WhatsApp — não é evidência de saúde.
      const reais = rows.filter((r) => r.status === 'falhou' || !!r.id_externo);
      return avaliarEnvioSaude(reais.map((r) => r.status));
    },
  });
}

export function useWaCanais() {
  const { currentOrg } = useOrg();
  return useQuery({
    queryKey: ['wa-canais', currentOrg.id],
    enabled: WA_REAL,
    // O status de conexão do canal NÃO tem realtime (o canal wa-<org> cobre só mensagens/conversas/contatos).
    // Sem isso, uma piscada do WhatsApp (Evolution cai/reconecta) deixava o status preso em "desconectado" no
    // cache e TRAVAVA o composer (sendDisabled = !canalConectado) até um refresh manual. Recarga automática a
    // cada 20s + no foco/reconexão faz o status (e o botão de enviar) se auto-recuperarem sozinhos.
    refetchInterval: 20000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    queryFn: async (): Promise<WaCanal[]> => {
      // Lista apenas canais vigentes. A remoção agora é DEFINITIVA no servidor (Edge Function
      // evolution-manage/remove exclui o registro), então canais 'removido' não devem aparecer aqui.
      const { data, error } = await supabase!
        .from('canais')
        .select('id, nome_interno, numero_conectado, status_integracao, provider, transporte, conectado_em, envio_restrito, entrega_status, entrega_erros_recentes, conflito_com, origem_tipo, gestor_id, fonte_aquisicao_id, campanha, observacao_comercial, gestor:usuarios(nome)')
        // Bloco 3: o filtro por provider='evolution' saiu — canal oficial (Cloud API) tem
        // provider='meta' e ficaria INVISÍVEL no "Responder por". `tipo='whatsapp'` já exclui
        // o canal do Messenger (CAF, tipo='facebook'), então a lista continua correta.
        .eq('organizacao_id', currentOrg.id).eq('tipo', 'whatsapp')
        .neq('status_integracao', 'removido')
        .order('criado_em', { ascending: true });
      if (error) throw new Error(error.message);
      type Row = { id: string; nome_interno: string | null; numero_conectado: string | null; status_integracao: string; provider: string | null; transporte: string | null; conectado_em: string | null; envio_restrito: boolean | null; entrega_status: string | null; entrega_erros_recentes: number | null; conflito_com: string | null; origem_tipo: string | null; gestor_id: string | null; fonte_aquisicao_id: string | null; campanha: string | null; observacao_comercial: string | null; gestor: { nome: string } | { nome: string }[] | null };
      return ((data as Row[]) ?? []).map((r) => ({
        id: r.id, alias: r.nome_interno ?? 'WhatsApp', numero: r.numero_conectado, status: r.status_integracao, provider: r.provider, transporte: r.transporte ?? 'evolution', conectadoEm: r.conectado_em, envioRestrito: Boolean(r.envio_restrito),
        entregaStatus: (['ok', 'instavel', 'restrito'].includes(r.entrega_status ?? '') ? r.entrega_status : 'desconhecido') as WaCanal['entregaStatus'], entregaErrosRecentes: r.entrega_erros_recentes ?? 0, conflitoCom: r.conflito_com,
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

/** Renomeia a conexão (apelido interno) sem tocar na origem comercial.
 *  Existe separado de `waUpdateComercial` de propósito: aquele grava os seis campos de uma
 *  vez e apagaria origem/gestor/fonte de canais que a tela não carrega inteiros (Cloud API). */
export async function waRenomearCanal(canalId: string, nome: string): Promise<void> {
  const { error } = await supabase!.rpc('renomear_canal', { p_canal: canalId, p_nome: nome.trim() });
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

export { rotuloBaixarMidia, nomeArquivoMidia } from './midiaNome';

/* ===================== Monitoramento automático de entrega ===================== */

export type EntregaSaude = 'saudavel' | 'atencao' | 'instavel' | 'restrito' | 'sem_dados' | 'inativo';

export interface EntregaAutoResumo {
  canal_id: string;
  canal: string;
  apto: boolean;
  estado: 'ativo' | 'pausado' | 'inativo';
  pausado_ate: string | null;
  destino: string;
  frequencia_hora: number;
  ultimo_em: string | null;
  ultimo_resultado: string | null;
  ultimo_latencia_ms: number | null;
  entregues_1h: number;
  falhas_1h: number;
  total_1h: number;
  /** Janela de decisão: últimos 5 testes concluídos (timeout ≠ erro). */
  entregues_5: number;
  erros_5: number;
  timeouts_5: number;
  /** Já existe teste aguardando ACK há < 5 min ⇒ não oferecer outro (anti-rajada). */
  pendente_recente: boolean;
  saude: EntregaSaude;
}

/** Painel de entrega automática por canal (RPC valida is_member no banco). Atualiza sozinho. */
export function useEntregaAutoResumo() {
  const { currentOrg } = useOrg();
  return useQuery({
    queryKey: ['wa-entrega-auto', currentOrg.id],
    enabled: WA_REAL && !!currentOrg.id,
    refetchInterval: 60_000,                       // acompanha o cron (1 teste/12min por canal)
    queryFn: async (): Promise<EntregaAutoResumo[]> => {
      const { data, error } = await supabase!.rpc('wa_entrega_auto_resumo', { p_org: currentOrg.id });
      if (error) throw new Error(error.message);
      return (data ?? []) as EntregaAutoResumo[];
    },
  });
}

/** "Rodar teste agora" (ignora slot/pausa) — ação de admin/supervisor validada na Edge Function. */
export function useRodarTesteEntrega() {
  const qc = useQueryClient();
  const { currentOrg } = useOrg();
  return useMutation({
    mutationFn: (canalId: string) =>
      invoke<{ ok: boolean; resultados?: unknown[] }>('evolution-manage', {
        action: 'testar_entrega', organizacao_id: currentOrg.id, canal_id: canalId,
      }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['wa-entrega-auto', currentOrg.id] }); },
  });
}

/**
 * URL assinada CURTA (60s) que FORÇA o download com o nome correto (Content-Disposition).
 * Bucket privado; a policy do Storage valida is_member(org) pela 1ª pasta do path → outra org não acessa.
 * Nunca usa getPublicUrl nem expõe service_role.
 */
export async function urlDownloadMidiaWa(path: string, filename: string): Promise<string> {
  const { data, error } = await supabase!.storage.from('script-midia').createSignedUrl(path, 60, { download: filename });
  if (error || !data?.signedUrl) throw new Error(error?.message || 'Falha ao gerar o link de download.');
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

/* ===================== Agendamento de mensagens (Fase 1: texto) ===================== */
export interface MensagemAgendada {
  id: string; conversaId: string; canalId: string; nomeCanal: string | null; tipo: string;
  texto: string | null; nomeArquivo: string | null; executarEm: string; status: string; tentativas: number;
  ultimoErro: string | null; motivoBloqueio: string | null; criadoPor: string | null; criadoEm: string;
  sequenciaId: string | null; ordemNaSequencia: number | null;
}

/** Lista os agendamentos de uma conversa (leitura por RLS). */
export function useMensagensAgendadas(conversaId: string | null | undefined) {
  const { currentOrg } = useOrg();
  const org = currentOrg.id;
  return useQuery({
    queryKey: ['mensagens-agendadas', org, conversaId],
    enabled: WA_REAL && !!conversaId,
    staleTime: 20_000,
    queryFn: async (): Promise<MensagemAgendada[]> => {
      const { data, error } = await supabase!
        .from('mensagens_agendadas')
        .select('id, conversa_id, canal_id, nome_canal_snapshot, tipo, texto, nome_arquivo, executar_em, status, tentativas, ultimo_erro, motivo_bloqueio, criado_por, criado_em, sequencia_id, ordem_na_sequencia')
        .eq('conversa_id', conversaId!)
        .eq('organizacao_id', org) // Fase 2.0: escopo explícito
        .order('executar_em', { ascending: true });
      if (error) throw new Error(error.message);
      type Row = { id: string; conversa_id: string; canal_id: string; nome_canal_snapshot: string | null; tipo: string; texto: string | null; nome_arquivo: string | null; executar_em: string; status: string; tentativas: number; ultimo_erro: string | null; motivo_bloqueio: string | null; criado_por: string | null; criado_em: string; sequencia_id: string | null; ordem_na_sequencia: number | null };
      return ((data as Row[]) ?? []).map((r) => ({
        id: r.id, conversaId: r.conversa_id, canalId: r.canal_id, nomeCanal: r.nome_canal_snapshot, tipo: r.tipo,
        texto: r.texto, nomeArquivo: r.nome_arquivo, executarEm: r.executar_em, status: r.status, tentativas: r.tentativas,
        ultimoErro: r.ultimo_erro, motivoBloqueio: r.motivo_bloqueio, criadoPor: r.criado_por, criadoEm: r.criado_em,
        sequenciaId: r.sequencia_id, ordemNaSequencia: r.ordem_na_sequencia,
      }));
    },
  });
}

/** Agenda uma mensagem de texto (via RPC segura). `executarEm` = ISO. */
export function useAgendarMensagem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { conversaId: string; canalId: string; texto: string; executarEm: string }) => {
      const { data, error } = await supabase!.rpc('agendar_mensagem', {
        p_conversa: input.conversaId, p_canal: input.canalId, p_texto: input.texto, p_executar_em: input.executarEm,
      });
      if (error) throw new Error(traduzErroAgendamento(error.message));
      return data as { id: string };
    },
    // prefixo SEM ids: a chave da query é ['mensagens-agendadas', org, conversaId] —
    // invalidar com conversaId na 2ª posição NUNCA casava (org lá) e a lista da
    // conversa ficava stale após agendar/editar/cancelar (achado da revisão 18/09).
    onSettled: () => { qc.invalidateQueries({ queryKey: ['mensagens-agendadas'] }); qc.invalidateQueries({ queryKey: ['mensagens-agendadas-org'] }); },
  });
}

/** Agenda uma mensagem de MÍDIA (imagem/áudio/vídeo/documento). O arquivo já foi subido ao bucket. */
export function useAgendarMidia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { conversaId: string; canalId: string; tipo: string; texto: string; path: string; mime: string; nome: string; tamanho: number; executarEm: string; origemAudio?: string }) => {
      const { data, error } = await supabase!.rpc('agendar_midia', {
        p_conversa: input.conversaId, p_canal: input.canalId, p_tipo: input.tipo, p_texto: input.texto || null,
        p_storage_path: input.path, p_mime: input.mime, p_nome: input.nome, p_tamanho: input.tamanho,
        p_executar_em: input.executarEm, p_origem_audio: input.origemAudio ?? null,
      });
      if (error) throw new Error(traduzErroAgendamento(error.message));
      return data as { id: string };
    },
    // prefixo SEM ids: a chave da query é ['mensagens-agendadas', org, conversaId] —
    // invalidar com conversaId na 2ª posição NUNCA casava (org lá) e a lista da
    // conversa ficava stale após agendar/editar/cancelar (achado da revisão 18/09).
    onSettled: () => { qc.invalidateQueries({ queryKey: ['mensagens-agendadas'] }); qc.invalidateQueries({ queryKey: ['mensagens-agendadas-org'] }); },
  });
}

export interface SeqItem { tipo: string; texto?: string | null; storage_path?: string; mime?: string; nome?: string; tamanho?: number; origem_audio?: string }
/** Agenda uma SEQUÊNCIA (vários blocos num único agendamento). Cada item vira uma linha (RPC atômica). */
/** Conversa ativa mais recente de um contato. A central de Agendamentos precisa disto para o
 *  "Novo agendamento": agendar_sequencia exige uma conversa (é por ela que o envio sai). Consulta
 *  pontual e leve, disparada só quando o usuário escolhe o contato. */
export async function conversaAtivaDoContato(orgId: string, contatoId: string): Promise<{ id: string; canalId: string | null } | null> {
  const { data, error } = await supabase!
    .from('conversas')
    .select('id, canal_id')
    .eq('organizacao_id', orgId).eq('contato_id', contatoId).is('arquivada_em', null)
    .order('ultima_interacao_em', { ascending: false })
    .limit(1).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? { id: data.id as string, canalId: (data.canal_id as string) ?? null } : null;
}

export function useAgendarSequencia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { conversaId: string; canalId: string; executarEm: string; itens: SeqItem[] }) => {
      const { data, error } = await supabase!.rpc('agendar_sequencia', {
        p_conversa: input.conversaId, p_canal: input.canalId, p_executar_em: input.executarEm, p_itens: input.itens,
      });
      if (error) throw new Error(traduzErroAgendamento(error.message));
      return data as Array<{ id: string }>;
    },
    // prefixo SEM ids: a chave da query é ['mensagens-agendadas', org, conversaId] —
    // invalidar com conversaId na 2ª posição NUNCA casava (org lá) e a lista da
    // conversa ficava stale após agendar/editar/cancelar (achado da revisão 18/09).
    onSettled: () => { qc.invalidateQueries({ queryKey: ['mensagens-agendadas'] }); qc.invalidateQueries({ queryKey: ['mensagens-agendadas-org'] }); },
  });
}

/** Edita um agendamento ainda 'agendada' (texto/canal/data-hora) via RPC segura. */
export function useEditarAgendamento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; conversaId: string; canalId: string; texto: string; executarEm: string }) => {
      const { data, error } = await supabase!.rpc('editar_agendamento', {
        p_id: input.id, p_canal: input.canalId, p_texto: input.texto, p_executar_em: input.executarEm,
      });
      if (error) throw new Error(traduzErroAgendamento(error.message));
      return data as { id: string };
    },
    // prefixo SEM ids: a chave da query é ['mensagens-agendadas', org, conversaId] —
    // invalidar com conversaId na 2ª posição NUNCA casava (org lá) e a lista da
    // conversa ficava stale após agendar/editar/cancelar (achado da revisão 18/09).
    onSettled: () => { qc.invalidateQueries({ queryKey: ['mensagens-agendadas'] }); qc.invalidateQueries({ queryKey: ['mensagens-agendadas-org'] }); },
  });
}

/** Cancela um agendamento ainda 'agendada' (não sai a mensagem) via RPC segura. */
export function useCancelarAgendamento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; conversaId: string }) => {
      const { error } = await supabase!.rpc('cancelar_agendamento', { p_id: input.id });
      if (error) throw new Error(traduzErroAgendamento(error.message));
    },
    // prefixo SEM ids: a chave da query é ['mensagens-agendadas', org, conversaId] —
    // invalidar com conversaId na 2ª posição NUNCA casava (org lá) e a lista da
    // conversa ficava stale após agendar/editar/cancelar (achado da revisão 18/09).
    onSettled: () => { qc.invalidateQueries({ queryKey: ['mensagens-agendadas'] }); qc.invalidateQueries({ queryKey: ['mensagens-agendadas-org'] }); },
  });
}

/* ===================== Central de agendamentos (Fase 2B) ===================== */
export interface AgendamentoOrg {
  id: string; conversaId: string; contatoId: string | null; contatoNome: string | null; telefone: string | null;
  canalId: string; nomeCanal: string | null; tipo: string; texto: string | null; nomeArquivo: string | null;
  executarEm: string; status: string; tentativas: number;
  ultimoErro: string | null; motivoBloqueio: string | null;
  criadoPor: string | null; criadoEm: string; enviadaEm: string | null; mensagemIdEnviada: string | null;
  sequenciaId: string | null; ordemNaSequencia: number | null;
}

/** Lista TODAS as mensagens agendadas da organização (para a central). Isolado por org + RLS. */
export function useAgendamentosOrg() {
  const { currentOrg } = useOrg();
  // visibilidade (22/10): quem não vê todos só vê os agendamentos dos clientes DELE
  const vis = useVisibilidade();
  const soDe = vis.veTodos ? null : vis.uid;
  return useQuery({
    queryKey: ['mensagens-agendadas-org', currentOrg.id, soDe ?? 'todos'],
    enabled: WA_REAL && (vis.veTodos || !!soDe),
    refetchInterval: 30_000,
    queryFn: async (): Promise<AgendamentoOrg[]> => {
      let q = supabase!
        .from('mensagens_agendadas')
        .select('id, conversa_id, contato_id, canal_id, nome_canal_snapshot, tipo, texto, nome_arquivo, executar_em, status, tentativas, ultimo_erro, motivo_bloqueio, criado_por, criado_em, enviada_em, mensagem_id_enviada, sequencia_id, ordem_na_sequencia, '
          + (soDe ? 'contatos!inner(nome, telefone, responsavel_id)' : 'contatos(nome, telefone)'))
        .eq('organizacao_id', currentOrg.id);
      if (soDe) q = q.eq('contatos.responsavel_id', soDe);
      const { data, error } = await q
        .order('executar_em', { ascending: false });
      if (error) throw new Error(error.message);
      type Row = {
        id: string; conversa_id: string; contato_id: string | null; canal_id: string; nome_canal_snapshot: string | null;
        tipo: string; texto: string | null; nome_arquivo: string | null; executar_em: string; status: string; tentativas: number;
        ultimo_erro: string | null; motivo_bloqueio: string | null; criado_por: string | null; criado_em: string;
        enviada_em: string | null; mensagem_id_enviada: string | null; sequencia_id: string | null; ordem_na_sequencia: number | null;
        contatos: { nome: string; telefone: string | null } | { nome: string; telefone: string | null }[] | null;
      };
      const nomeDe = (c: Row['contatos']) => (Array.isArray(c) ? c[0] : c) ?? null;
      return ((data as unknown as Row[]) ?? []).map((r) => {
        const ct = nomeDe(r.contatos);
        return {
          id: r.id, conversaId: r.conversa_id, contatoId: r.contato_id, contatoNome: ct?.nome ?? null, telefone: ct?.telefone ?? null,
          canalId: r.canal_id, nomeCanal: r.nome_canal_snapshot, tipo: r.tipo, texto: r.texto, nomeArquivo: r.nome_arquivo,
          executarEm: r.executar_em, status: r.status, tentativas: r.tentativas,
          ultimoErro: r.ultimo_erro, motivoBloqueio: r.motivo_bloqueio,
          criadoPor: r.criado_por, criadoEm: r.criado_em, enviadaEm: r.enviada_em, mensagemIdEnviada: r.mensagem_id_enviada,
          sequenciaId: r.sequencia_id, ordemNaSequencia: r.ordem_na_sequencia,
        };
      });
    },
  });
}

/** Reagenda uma mensagem falhada/bloqueada/expirada (volta pra 'agendada' com novo canal/horário). */
export function useReagendarAgendamento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; conversaId: string; canalId: string; executarEm: string }) => {
      const { data, error } = await supabase!.rpc('reagendar_agendamento', {
        p_id: input.id, p_canal: input.canalId, p_executar_em: input.executarEm,
      });
      if (error) throw new Error(traduzErroAgendamento(error.message));
      return data as { id: string };
    },
    // prefixo SEM ids: a chave da query é ['mensagens-agendadas', org, conversaId] —
    // invalidar com conversaId na 2ª posição NUNCA casava (org lá) e a lista da
    // conversa ficava stale após agendar/editar/cancelar (achado da revisão 18/09).
    onSettled: () => { qc.invalidateQueries({ queryKey: ['mensagens-agendadas'] }); qc.invalidateQueries({ queryKey: ['mensagens-agendadas-org'] }); },
  });
}

/** Traduz os códigos de erro das RPCs de agendamento (agendar/editar/cancelar/reagendar) para texto amigável. */
function traduzErroAgendamento(msg: string): string {
  const m = (msg || '').toLowerCase();
  if (m.includes('texto_vazio')) return 'Escreva a mensagem antes de agendar.';
  if (m.includes('texto_muito_longo')) return 'Mensagem muito longa (máximo 4096 caracteres).';
  if (m.includes('horario_invalido')) return 'Escolha um horário no futuro.';
  if (m.includes('conversa_nao_encontrada')) return 'Conversa não encontrada.';
  if (m.includes('agendamento_nao_encontrado')) return 'Agendamento não encontrado.';
  if (m.includes('nao_editavel')) return 'Este agendamento não pode mais ser editado (já saiu de "agendada").';
  if (m.includes('nao_cancelavel')) return 'Este agendamento não pode mais ser cancelado (já saiu de "agendada").';
  if (m.includes('nao_reagendavel')) return 'Só é possível reagendar mensagens que falharam, foram bloqueadas ou expiraram.';
  if (m.includes('reagendar_indisponivel_tipo')) return 'Este tipo não pode ser reagendado.';
  if (m.includes('edicao_indisponivel_tipo')) return 'Este tipo não pode ser editado.';
  if (m.includes('tipo_midia_invalido')) return 'Tipo de mídia inválido.';
  if (m.includes('midia_path_invalido')) return 'Arquivo de mídia inválido para esta organização.';
  if (m.includes('mime_incompativel')) return 'O formato do arquivo não é compatível com o tipo escolhido.';
  if (m.includes('arquivo_muito_grande')) return 'Arquivo acima do limite permitido.';
  if (m.includes('sem_acesso')) return 'Você não tem acesso a esta organização.';
  if (m.includes('contato_sem_telefone')) return 'Este contato não tem número acionável.';
  if (m.includes('canal_invalido')) return 'Canal inválido para esta organização.';
  if (m.includes('canal_inativo')) return 'O canal escolhido está inativo.';
  if (m.includes('canal_removido')) return 'O canal escolhido foi removido.';
  if (m.includes('canal_desconectado')) return 'O canal escolhido está desconectado.';
  if (m.includes('canal_restrito')) return 'O canal escolhido está com envio restrito.';
  if (m.includes('canal_em_conflito')) return 'O canal escolhido está em conflito.';
  return msg || 'Falha ao agendar.';
}
