// REVIZA (23/11): cópia da função do Atenvo que está no ar, adaptada ao Reviza por
// ~/reviza-sist/porte-atendimento/porta-funcoes.py — conexões "revizaatd_", tabela atd_integracoes, pasta atd-midia.
// evolution-webhook — eventos da Evolution. Sem JWT. Secret via webhook_config (constante).
// v37: /clean DO NÚMERO DE TESTE (decisão N8 do dono, 01/11: "coloque um comando que quando eu enviar /clean vai limpar
//      e recomecar o atendimento"). Texto exato "/clean" (sem espaço em volta, maiúscula ou minúscula) de um telefone
//      em bot_canal_config.numeros_teste, com a Iris LIGADA no número: grava a mensagem, chama iris_teste_limpar
//      (migration 20261101240000) e responde no chat com uma mensagem do SISTEMA. Não chama o robô nem a IA e não
//      passa por não lidas/opt-out/remarketing/Kanban. Fora da lista: mensagem comum + evento 'teste_clean_negado'.
//      O eco (fromMe) da resposta é ignorado antes de resolver a conversa (senão abriria uma conversa nova com uma
//      fala "humana"). IRIS DESLIGADA = HOJE: "/clean" é mensagem comum e nenhuma outra mensagem muda (clean.ts).
// v36: FORMULÁRIO DO ANÚNCIO FAZ O ROBÔ ANDAR + RESPOSTA AUTOMÁTICA NÃO É HUMANO (09/10, dono:
//      "atenda essas pessoas normalmente").
//      (a) A mensagem de conclusão que o WhatsApp do celular manda sozinha depois do formulário
//          ("Agradecemos o envio do formulário…", fromMe) era gravada como origem='telefone' e
//          contava como HUMANO em todo lugar (bot-runner pausava com humano_assumiu, bot_pode_atuar,
//          gatilho da IA, SLA). Agora: texto exato + formulário de entrada nesta conversa nas
//          últimas 48 h → origem='bot', metadados.via='formulario_auto', e NÃO mexe em canal
//          atual/canal preso (não é ato humano). Se o formulário chegar DEPOIS dela, o ramo de
//          entrada do formulário reclassifica a resposta automática recente (formulario.ts).
//      (b) O formulário passa a ir pro bot-runner (inbound_tipo 'formulario', texto vazio — o
//          runner lê nome do metadados.formulario no banco). O runner só segue no fluxo que aceita
//          formulário (caf_emprestimo_v1): vale como SIM + nome. Nos outros fluxos ele ignora, como
//          era na v34. Se a trava da conversa estiver ocupada (formulário chega no meio da
//          abertura), o webhook tenta de novo até 3x a cada 5 s. A IA continua ignorando o
//          formulário (migração 20261005160000).
// v34: FORMULÁRIO DO ANÚNCIO. A resposta do WhatsApp Flow dos anúncios Click-to-WhatsApp
//      (interactiveResponseMessage, formulário "Participar agora" com nome/e-mail) não tem texto
//      (o corpo é só "Sent") e caía inteira em ignorado/sem_conteudo: 9 a 30 por dia no EMPRÉSTIMO,
//      e o lead que só preenchia o formulário nem virava contato. Agora vira mensagem de ENTRADA
//      legível ("Formulário do anúncio / Nome: … / Email: …", campos estruturados em
//      metadados.formulario) e preenche o contato: e-mail só se estiver vazio; nome só por cima do
//      nome que veio do próprio WhatsApp (pushName/número/placeholder), nunca de nome digitado.
//      NÃO dispara o bot-runner: o formulário não é resposta a pergunta do fluxo (cairia como
//      resposta ao "SIM ou NÃO") — SUPERADO pela v36 (vai como inbound_tipo 'formulario').
//      Opt-out não lê os campos; remarketing conta como "respondeu".
//      PAREADO com a migração 20261005160000_ia_sessao_ignora_formulario: sem ela o gatilho
//      trg_ia_sessao_mensagem acorda a IA SDR a cada entrada, e a IA responderia ao formulário.
// v32: LID RESOLVIDO DEPOIS re-chama o bot. Inbound que chega só com @lid cria o contato SEM
//      número, então o bot-runner sai na hora com 'sem_destino_envio' e o lead fica mudo. O PN
//      costuma aparecer num evento seguinte (auto-recuperação #7, ~1-2 min depois), mas esse
//      evento não é inbound novo — ninguém redisparava o runner e o lead ficava esperando para
//      sempre (2 casos em 2 dias na CAMPANHA DE EMPRÉSTIMO; um deles pago, veio de anúncio).
//      Agora, ao gravar o PN recuperado, o webhook re-chama o bot-runner com o ÚLTIMO inbound de
//      TEXTO da conversa (≤1h). Idempotência e TODOS os gates seguem no runner — se um humano já
//      assumiu, ele continua calado.
// v31: CANAL PRESO — um canal com canais.prende_conversa (hoje o MURILLO CHIP) prende a conversa
//      quando o cliente fala nele. Presa, a conversa NÃO é mais roubada por entrada de outro
//      número: o "última entrada manda" da v27 vale só entre canais que não prendem. Soltar é
//      ato humano (resposta pelo celular de outro número aqui; envio do painel no evolution-send).
//      Motivo: o fluxo de crédito entrega o cliente pro chip de propósito, e uma mensagem dele no
//      OFICIAL 37s depois devolvia o atendimento pro oficial — dois atendentes na mesma pessoa.
// v30: NONO DÍGITO — a resolução do contato deixa de ser por igualdade exata de valor_normalizado
//      e passa pela RPC wa_resolver_contato_por_numero (chave canônica = DDD + últimos 8). A
//      Evolution entrega o mesmo cliente ora como 55+DDD+8 ora como 55+DDD+9, e o casamento exato
//      criava um CONTATO NOVO a cada troca de forma (14 grupos / 29 contatos duplicados até aqui).
//      A RPC absorveu também o fallback por contatos.telefone. Nada mais muda: valor_normalizado
//      continua intacto (é ele que vira destino do envio), LID/wa_lid_map iguais, conversa igual.
// v29: (a) canal 'removido' NÃO é reativado por connection.update (fim do "canal aposentado volta sozinho");
//      (b) consolidação por número virou DETECÇÃO DE CONFLITO (wa_consolidar_canal_por_numero não funde mais
//      silenciosamente — marca conflito_com); (c) entrega suavizada (instavel antes de restrito, 3 erros).
// v28: SAÚDE DE ENTREGA (outbound) separada da sessão. No messages.update, ERROR/DELIVERY_ACK/READ de
//      SAÍDA classificam canais.entrega_status (ok/instavel/restrito): ERROR sem stub→restrito, com stub→
//      instavel; entrega real a destino EXTERNO recupera ok (self-send não conta). NÃO altera envio_restrito
//      nem health_check_status. Filtro de teste agora ignora "Teste de entrega Atenvo" também (não vira lead).
// v27: UM ATENDIMENTO ATIVO POR CONTATO. A conversa deixa de ser chaveada por (contato+canal): cliente
//      que veio pelo ANDRIUS e passa a ser atendido pela URA/LUIZA/RMKT CONTINUA na mesma conversa —
//      só o CANAL ATUAL muda. conversas.canal_id = CANAL ATUAL (card / responder por / continuidade);
//      a AQUISIÇÃO fica congelada em conversas.canal_origem_id. Nenhuma conversa/mensagem é apagada;
//      a duplicata legada é tratada por secundarizar_conversa (arquiva, preserva histórico).
// v26: REMARKETING — antes do dispatch ao bot-runner, chama bot_remarketing_inbound: lead que responde em
//      remarketing volta pra LEAD NOVO (entrada) ANTES do runner checar elegibilidade; opt-out → PERDIDO e
//      pula o dispatch. Best-effort (try/catch): erro/timeout da RPC nunca quebra o webhook nem trava o lead comum.
// v25: FIAÇÃO DO ÁUDIO — no dispatch ao bot-runner, áudio INBOUND curto (≤MAX_AUDIO_SEG/≤MAX_AUDIO_TRANSC,
//      envs) passa o base64 já baixado (getBase64FromMediaMessage) + mime real (ogg, sem codecs) p/ transcrição.
//      Áudio longo/grande NÃO manda base64 → runner cai no aviso+pausa. Só !fromMe (nunca transcreve saída).
// v24 (B3.3): dispatch fire-and-forget ao bot-runner em inbound NOVO de cliente (texto/áudio). dry_run
//      vem da flag EVO_BOT_DRY_RUN (default 'sim'=simula; go-live da campanha por TEXTO/LUIZA sem redeploy).
//      Gates de negócio são do runner; não bloqueia nem quebra o webhook.
// v23: ao reconectar (connection.update=open) limpa alerta_silenciado do canal ("silenciar até reconexão").
// v22: mensagens do health check (prefixo "Teste automático Atenvo") são ignoradas (ignorado_motivo=
//      health_check) — não criam contato/conversa/lead nem poluem o inbox/relatórios.
// v21: @lid REUSO — evento só com LID consulta wa_lid_map CONFIRMADO por (org,canal,lid) e reutiliza o PN
//      vinculado: resolve o contato certo sem criar novo, sem depender de cache. Mapa não confirmado nunca usado.
// v20: @lid identidade protegida — o LID NUNCA vira nome do contato (sem PN e sem pushName real =>
//      "Identidade protegida", identidade_tipo=lid_pendente). Ao chegar PN (evento real, #7) resolve o
//      estado e corrige o nome placeholder. Grava mapa LID↔PN por CANAL em wa_lid_map (best-effort).
// v19: MÍDIA Fase A — ingere imagem/vídeo/documento/sticker (não só áudio) via midiaOf+baixarMidia:
//      baixa, valida tamanho/ext segura, guarda no bucket privado, persiste tipo+metadados (mime/nome/
//      tamanho/legenda/seconds) e usa a legenda como conteúdo. Falha => pendente recuperável (nunca oculta).
// v18: Inbox Etapa A — inbound NOVO incrementa nao_lidas (idempotente via .select(); nunca fromMe) e
//      REABRE conversa arquivada (arquivada_em=null), subindo ao topo. Webhook repetido não duplica contador.
// v17: auto-recuperação de PN (Caso D #7): inbound com PN real garante a identidade WhatsApp também em
//      contato LID-only já existente (idempotente; não sobrescreve PN confirmado diferente).
// v16: P0 — inbound de TEXTO do cliente falhava no INSERT (metadados NOT NULL/23502) e a mensagem nunca
//      aparecia no painel. Fallback de metadados no caminho de ENTRADA (texto e áudio). Afetava LUIZA/URA/ANDRIUS.
// v15: connection.update(open) auto-consolida canal DUPLICADO do mesmo número (reconexão que criou canal
//      novo) no canal histórico via RPC wa_consolidar_canal_por_numero (idempotente, best-effort).
// v14: INGESTÃO DE ÁUDIO (entrada e fromMe/celular): baixa a mídia (getBase64FromMediaMessage), guarda no
//      bucket privado e persiste tipo='audio' (idempotente por id_externo; falha de download => pendente
//      recuperável). NÃO altera o envio de áudio (evolution-send) nem o parser LID/secret/messages.update.
// v13: registra mensagens fromMe (enviadas pelo celular) como SAÍDA idempotente (#7).
import { corsHeaders, json } from './cors.ts';
import { adminClient } from './client.ts';
import { classificarEntrega, eventoDoStatus, type EntregaStatus } from './entrega.ts';
import { formularioOf, ehRespostaAutoFormulario, ehSaidaAutoFormulario, JANELA_AUTO_FORMULARIO_MS, META_AUTO_FORMULARIO } from './formulario.ts';
import { anuncioOf } from './anuncio.ts';
import { decidirClean, ehComandoClean, ehEcoDaLimpeza, ehTextoDaRespostaClean, enviadorEvolution, executarClean, lerConfigClean } from './clean.ts';
import { despacharAoRunner, DESPACHO_TEXTO, DESPACHO_FORMULARIO } from './dispatch_runner.ts';

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0;
}
function digits(jid?: string | null): string | null {
  if (!jid) return null; return jid.replace(/[:@].*/, '').replace(/[^0-9]/g, '') || null;
}
function firstEndingWith(cands: Array<string | undefined | null>, suffix: string): string | null {
  for (const c of cands) if (typeof c === 'string' && c.endsWith(suffix)) return c; return null;
}
function textOf(message: Record<string, unknown> | undefined): string | null {
  if (!message) return null;
  const conv = message.conversation as string | undefined; if (conv) return conv;
  const ext = (message.extendedTextMessage as { text?: string } | undefined)?.text; if (ext) return ext;
  const eph = (message.ephemeralMessage as { message?: Record<string, unknown> } | undefined)?.message; if (eph) return textOf(eph);
  const vo = (message.viewOnceMessage as { message?: Record<string, unknown> } | undefined)?.message; if (vo) return textOf(vo);
  return null;
}
// LGPD: mascara número/JID preservando prefixo + últimos 4 dígitos. Ex.: 5551****1390@s.whatsapp.net
function maskJid(v: unknown): string | null {
  if (typeof v !== 'string' || !v) return null;
  const at = v.indexOf('@');
  const num = at >= 0 ? v.slice(0, at) : v;
  const dom = at >= 0 ? v.slice(at) : '';
  const d = num.replace(/\D/g, '');
  const masked = d.length >= 8 ? `${d.slice(0, 4)}****${d.slice(-4)}` : (d ? '****' : num);
  return masked + dom;
}

// LGPD: whatsapp_webhook_events.payload é DIAGNÓSTICO e NUNCA re-lido por código, então persistimos
// só metadados técnicos + identificadores MASCARADOS. NADA de corpo de mensagem, mídia, citação,
// nome, foto de perfil, tokens/secrets. (Idempotência é por provider_message_id, não pelo payload.)
function sanitize(obj: unknown): unknown {
  try {
    const d = (obj ?? {}) as Record<string, unknown>;
    const key = (d.key ?? {}) as Record<string, unknown>;
    const msg = (unwrapMsg(d.message as Record<string, unknown> | undefined) ?? {}) as Record<string, unknown>;
    const tipos = Object.keys(msg).filter((k) => k !== 'messageContextInfo' && k !== 'contextInfo');
    const texto = textOf(msg);
    const MIDIA = ['imageMessage', 'audioMessage', 'videoMessage', 'documentMessage', 'stickerMessage', 'albumMessage'];
    return {
      status: d.status ?? d.state ?? null,
      statusReason: d.statusReason ?? d.statusCode ?? null,
      instanceId: d.instanceId ?? null,
      source: d.source ?? null,
      messageTimestamp: d.messageTimestamp ?? null,
      messageId: (key.id as string) ?? (d.keyId as string) ?? (d.messageId as string) ?? null,
      remoteJid: maskJid(key.remoteJid ?? d.remoteJid ?? d.wuid),
      participant: maskJid(key.participant),
      fromMe: typeof key.fromMe === 'boolean' ? key.fromMe : (typeof d.fromMe === 'boolean' ? d.fromMe : null),
      addressingMode: key.addressingMode ?? d.addressingMode ?? null,
      messageType: (d.messageType as string) ?? tipos[0] ?? null,
      hasText: typeof texto === 'string' && texto.length > 0,
      textLen: typeof texto === 'string' ? texto.length : 0,
      hasMedia: MIDIA.some((k) => k in msg),
      hasForm: !!formularioOf(msg),
      hasName: !!(d.pushName || d.profileName),
    };
  } catch { return null; }
}

// ---- Mídia (áudio): detecção + download seguro pela Evolution ----
const EVO_BASE = (Deno.env.get('EVOLUTION_API_URL') ?? '').replace(/\/+$/, '');
const EVO_KEY = Deno.env.get('EVOLUTION_API_KEY') ?? '';
// B3.3: base das Edge Functions (para o dispatch fire-and-forget ao bot-runner).
const FUNCTIONS_BASE = (Deno.env.get('SUPABASE_URL') ?? '').replace(/\/+$/, '') + '/functions/v1';
// dry_run do dispatch ao bot, LIDO DE FLAG (espelha CLOUD_BOT_DRY_RUN do cloud-webhook). Default
// SEGURO = simular: só o valor explícito 'nao' manda de verdade; unset ou qualquer outra coisa
// mantém a simulação. É o lever de GO-LIVE da campanha por TEXTO (ex.: LUIZA) — trocado sem redeploy.
// Mesmo 'nao', o envio real ainda respeita os gates do runner (master/canal habilitado/humano) e a
// allowlist por número (CLOUD_BOT_ENVIO_REAL_ALLOWLIST) do fluxo por botões: rollout controlável.
const EVO_BOT_DRY_RUN = (Deno.env.get('EVO_BOT_DRY_RUN') ?? 'sim').toLowerCase() !== 'nao';
// desembrulha mensagens encapsuladas (ephemeral, viewOnce, documentWithCaption).
function unwrapMsg(m: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!m) return m;
  const inner = (m.ephemeralMessage as { message?: Record<string, unknown> })?.message
    ?? (m.viewOnceMessage as { message?: Record<string, unknown> })?.message
    ?? (m.viewOnceMessageV2 as { message?: Record<string, unknown> })?.message
    ?? (m.documentWithCaptionMessage as { message?: Record<string, unknown> })?.message;
  return inner ? unwrapMsg(inner) : m;
}
// retorna descritor de áudio (audioMessage / ptt / voice) ou null.
function audioOf(message: Record<string, unknown> | undefined): { mime: string; ptt: boolean; seconds: number | null } | null {
  const m = unwrapMsg(message); if (!m) return null;
  const a = (m.audioMessage as { mimetype?: string; ptt?: boolean; seconds?: number } | undefined);
  if (!a) return null;
  return { mime: (a.mimetype ?? 'audio/ogg').split(';')[0].trim(), ptt: !!a.ptt, seconds: typeof a.seconds === 'number' ? a.seconds : null };
}
function extFromMime(mime: string): string {
  const m = mime.toLowerCase();
  if (m.includes('ogg')) return 'ogg'; if (m.includes('mpeg')) return 'mp3'; if (m.includes('mp4') || m.includes('m4a')) return 'm4a';
  if (m.includes('aac')) return 'aac'; if (m.includes('wav')) return 'wav'; if (m.includes('webm')) return 'webm'; return 'ogg';
}
function sanitizeNome(n: unknown): string | null {
  const s = typeof n === 'string' ? n.trim() : '';
  if (!s) return null;
  // Mantém acento/Unicode/emoji (á, ç, ã… não são \w em JS — a regex antiga virava "_").
  // Remove só o perigoso/ruído: controle, separadores de caminho e < > (anti path-traversal).
  return s.replace(/[/\\<>]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || null; // mantem acento/emoji; tira so / \ < >
}
function numOrNull(v: unknown): number | null { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; }
// extensão segura por nome de arquivo (se houver) OU por MIME.
function extFor(mime: string, nome: string | null): string {
  if (nome && /\.[a-z0-9]{1,8}$/i.test(nome)) return (nome.split('.').pop() ?? '').toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
  const m = (mime || '').toLowerCase();
  if (m.includes('jpeg') || m.includes('jpg')) return 'jpg'; if (m.includes('png')) return 'png'; if (m.includes('webp')) return 'webp'; if (m.includes('gif')) return 'gif';
  if (m.includes('mp4')) return 'mp4'; if (m.includes('quicktime') || m.includes('mov')) return 'mov'; if (m.includes('3gpp')) return '3gp';
  if (m.includes('pdf')) return 'pdf'; if (m.includes('wordprocessingml')) return 'docx'; if (m.includes('msword')) return 'doc';
  if (m.includes('spreadsheetml')) return 'xlsx'; if (m.includes('ms-excel')) return 'xls'; if (m.includes('zip')) return 'zip'; if (m.includes('text')) return 'txt';
  if (m.includes('audio')) return extFromMime(m);
  return 'bin';
}
interface MidiaDesc { kind: 'imagem' | 'video' | 'audio' | 'documento'; mime: string; nome: string | null; caption: string | null; seconds: number | null; ptt: boolean; tamanho: number | null; }
// descritor genérico de mídia (imagem/vídeo/áudio/documento/sticker), já desembrulhado (ephemeral/viewOnce/docWithCaption).
function midiaOf(message: Record<string, unknown> | undefined): MidiaDesc | null {
  const m = unwrapMsg(message); if (!m) return null;
  const img = m.imageMessage as { mimetype?: string; caption?: string; fileLength?: unknown } | undefined;
  if (img) return { kind: 'imagem', mime: (img.mimetype ?? 'image/jpeg').split(';')[0].trim(), nome: null, caption: img.caption ?? null, seconds: null, ptt: false, tamanho: numOrNull(img.fileLength) };
  const vid = m.videoMessage as { mimetype?: string; caption?: string; seconds?: number; fileLength?: unknown } | undefined;
  if (vid) return { kind: 'video', mime: (vid.mimetype ?? 'video/mp4').split(';')[0].trim(), nome: null, caption: vid.caption ?? null, seconds: typeof vid.seconds === 'number' ? vid.seconds : null, ptt: false, tamanho: numOrNull(vid.fileLength) };
  const aud = m.audioMessage as { mimetype?: string; ptt?: boolean; seconds?: number; fileLength?: unknown } | undefined;
  if (aud) return { kind: 'audio', mime: (aud.mimetype ?? 'audio/ogg').split(';')[0].trim(), nome: null, caption: null, seconds: typeof aud.seconds === 'number' ? aud.seconds : null, ptt: !!aud.ptt, tamanho: numOrNull(aud.fileLength) };
  const doc = m.documentMessage as { mimetype?: string; caption?: string; fileName?: string; title?: string; fileLength?: unknown } | undefined;
  if (doc) return { kind: 'documento', mime: (doc.mimetype ?? 'application/octet-stream').split(';')[0].trim(), nome: sanitizeNome(doc.fileName ?? doc.title), caption: doc.caption ?? null, seconds: null, ptt: false, tamanho: numOrNull(doc.fileLength) };
  const st = m.stickerMessage as { mimetype?: string; fileLength?: unknown } | undefined;
  if (st) return { kind: 'imagem', mime: (st.mimetype ?? 'image/webp').split(';')[0].trim(), nome: 'sticker.webp', caption: null, seconds: null, ptt: false, tamanho: numOrNull(st.fileLength) };
  return null;
}
const MAX_MEDIA = 20 * 1024 * 1024; // limite de segurança p/ áudio
// transcrição tem teto MENOR que o de armazenamento: áudio muito longo/grande NÃO vai pro Gemini
// (custo/contexto) — cai no aviso+pausa. O bucket ainda guarda o arquivo até MAX_MEDIA.
// Env p/ afinar sem redeploy quando vir os áudios reais (idoso fala 2–3 min: default 120s / 8MB).
const MAX_AUDIO_SEG = Number(Deno.env.get('MAX_AUDIO_SEG')) || 120;
const MAX_AUDIO_TRANSC = Number(Deno.env.get('MAX_AUDIO_TRANSC')) || 8 * 1024 * 1024;
// baixa a mídia descriptografada via Evolution (base64). NÃO persiste URL temporária.
async function baixarMidia(instance: string, dataMsg: Record<string, unknown>): Promise<{ bytes: Uint8Array; mime: string; b64: string }> {
  if (!EVO_BASE || !EVO_KEY) throw new Error('evolution_nao_configurada');
  const res = await fetch(`${EVO_BASE}/chat/getBase64FromMediaMessage/${instance}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', apikey: EVO_KEY },
    body: JSON.stringify({ message: dataMsg, convertToMp4: false }),
  });
  const txt = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${txt.slice(0, 140)}`);
  let j: { base64?: string; media?: string; mimetype?: string } = {};
  try { j = JSON.parse(txt); } catch { throw new Error('resposta_invalida'); }
  const b64 = j.base64 ?? j.media ?? '';
  if (!b64) throw new Error('sem_base64');
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  if (bytes.length === 0) throw new Error('midia_vazia');
  if (bytes.length > MAX_MEDIA) throw new Error('midia_grande');
  return { bytes, mime: (j.mimetype ?? '').split(';')[0].trim() || 'audio/ogg', b64 };
}

// v30: REMOVIDO o "teste de entrega ao conectar". O envio programático ~9s após o QR restringia
// chip novo/frio (número frio + primeiro tráfego automático = gatilho do antispam da Meta). NÃO há
// mais envio automático ao conectar um canal Evolution. Ficam por compatibilidade: o filtro de inbound
// (~L319, regex "teste de entrega/automático atenvo") — pois o health-check periódico ainda usa esse
// texto — e o matcher de ACK que trata 'entrega_conexao' (fecha runs históricos).

// Revisão 09/10: a resposta automática do formulário só deixa de ser "humano" no canal cujo robô
// ATENDE o formulário (fluxo do empréstimo). Nos outros (ex.: JUROS, vídeo) ela segue como antes —
// senão as automações que leem origem='bot' como "o robô falou" (juros 6h / iniciar caso) mudariam.
const FLUXOS_COM_FORMULARIO = new Set(['caf_emprestimo_v1']);
async function canalAceitaFormulario(admin: any, canalId: string): Promise<boolean> {
  try {
    const { data } = await admin.from('bot_canal_config').select('fluxo_slug').eq('canal_id', canalId).maybeSingle();
    return FLUXOS_COM_FORMULARIO.has(String(data?.fluxo_slug ?? ''));
  } catch { return false; }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const admin = adminClient();
  try {
    const url = new URL(req.url);
    const { data: cfg } = await admin.from('webhook_config').select('secret').eq('chave', 'whatsapp').maybeSingle();
    const expected = cfg?.secret ?? '';
    // C2 concluída: auth SOMENTE por header x-webhook-secret. Fallback de ?secret= REMOVIDO —
    // o segredo nunca trafega na URL (logs/proxies/painel da Evolution). Instâncias novas/reconectadas
    // e o refresh_webhook (evolution-manage) já gravam a URL sem secret + header.
    const hdrSecret = req.headers.get('x-webhook-secret') ?? '';
    if (!expected || !safeEqual(hdrSecret, expected)) return json({ error: 'unauthorized' }, 401);

    const evt = await req.json().catch(() => null) as { event?: string; instance?: string; instanceId?: string; data?: Record<string, unknown> } | null;
    let event = (evt?.event ?? '').toLowerCase();
    if (!event) { const seg = url.pathname.split('/').filter(Boolean).pop() ?? ''; if (seg && seg !== 'evolution-webhook') event = seg.replace(/-/g, '.'); }
    const instanceName = evt?.instance ?? '';
    const data = (evt?.data ?? {}) as Record<string, unknown>;
    const instanceId = (evt?.instanceId as string) ?? (data.instanceId as string) ?? null;
    if (!event || !instanceName) return json({ ok: true, ignored: 'sem event/instance' });

    const key = (data.key ?? {}) as Record<string, unknown>;
    const remoteJid = (key.remoteJid as string) ?? null;
    const addressing = (data.addressingMode as string) ?? (key.addressingMode as string) ?? (remoteJid?.endsWith('@lid') ? 'lid' : (remoteJid?.endsWith('@s.whatsapp.net') ? 'pn' : null));
    const fromMe = typeof key.fromMe === 'boolean' ? (key.fromMe as boolean) : null;
    const provMsgId = (key.id as string) ?? null;

    const { data: canal } = await admin.from('canais').select('id, organizacao_id, numero_conectado, provider, status_integracao, entrega_status, entrega_erros_recentes, prende_conversa, papel').eq('instancia_externa', instanceName).maybeSingle();

    const { data: track } = await admin.from('whatsapp_webhook_events').insert({
      organizacao_id: canal?.organizacao_id ?? null, canal_id: canal?.id ?? null, instance_name: instanceName, instance_id: instanceId,
      event, provider_message_id: provMsgId, remote_jid: maskJid(remoteJid), addressing_mode: addressing, from_me: fromMe, payload: sanitize(data), status_processamento: 'recebido',
    }).select('id').single();
    const trackId = track?.id as string | undefined;
    const finish = async (status: string, extra: Record<string, unknown> = {}) => { if (trackId) await admin.from('whatsapp_webhook_events').update({ status_processamento: status, processado_em: new Date().toISOString(), ...extra }).eq('id', trackId); };

    if (!canal) { await finish('erro', { erro: 'INSTANCE_NOT_MAPPED', ignorado_motivo: instanceName }); return json({ ok: true, ignored: 'canal desconhecido' }); }
    const orgId = canal.organizacao_id as string;

    if (event === 'connection.update') {
      const state = (data.state as string) ?? (data.connection as string);
      if (state === 'open') {
        // Canal APOSENTADO/removido NÃO é ressuscitado por um evento de conexão (instância zumbi / reconexão indevida).
        if (canal.status_integracao === 'removido') { await finish('ignorado', { ignorado_motivo: 'canal_removido' }); return json({ ok: true }); }
        const numero = digits((data.wuid as string) ?? (data.ownerJid as string));
        // v23: reconectou → limpa silêncio de alerta ("silenciar até reconexão" se resolve sozinho).
        await admin.from('canais').update({ status_integracao: 'conectado', ativo: true, ...(numero ? { numero_conectado: numero } : {}), conectado_em: new Date().toISOString(), ultima_sincronizacao: new Date().toISOString(), alerta_silenciado: false, alerta_silenciado_ate: null, alerta_silenciado_motivo: null, alerta_silenciado_por: null }).eq('id', canal.id);
        await admin.from('atd_integracoes').update({ status: 'conectado' }).eq('canal_id', canal.id);
        // Auto-cura de canal DUPLICADO do mesmo número (reconexão que criou canal novo em vez de reusar o
        // histórico): reabsorve no canal histórico, preservando conversas/histórico. Idempotente (best-effort).
        if (numero) { try { await admin.rpc('wa_consolidar_canal_por_numero', { p_org: canal.organizacao_id, p_canal_ativo: canal.id }); } catch { /* não quebra o webhook */ } }
        // v30: sem envio automático ao conectar — o teste-de-entrega foi removido (restringia chip frio).
      } else if (state === 'close') { await admin.from('canais').update({ status_integracao: 'desconectado' }).eq('id', canal.id); }
      await finish('processado'); return json({ ok: true });
    }
    if (event === 'qrcode.updated') { await admin.from('atd_integracoes').update({ status: 'sincronizando', ultima_sincronizacao: new Date().toISOString() }).eq('canal_id', canal.id); await finish('processado'); return json({ ok: true }); }

    // v33: canal NOTIFICADOR (papel='notificacao') — número pessoal do dono conectado só pra
    // emitir avisos no grupo. Conexão/QR (acima) funcionam; TODO o resto é ignorado: nada do
    // que esse número envia ou recebe vira conversa/mensagem no sistema.
    if ((canal.papel as string | null) === 'notificacao') {
      await finish('ignorado', { ignorado_motivo: 'canal_notificacao' });
      return json({ ok: true, ignored: 'canal notificador' });
    }

    if (event === 'messages.upsert') {
      // #7: NÃO descartamos mais fromMe. Grupo segue não suportado.
      if ((remoteJid ?? '').endsWith('@g.us')) { await finish('ignorado', { ignorado_motivo: 'grupo_nao_suportado' }); return json({ ok: true }); }

      // remoteJid é a OUTRA parte tanto na entrada (remetente) quanto na saída (destinatário) → resolução idêntica.
      let phoneJid = firstEndingWith([remoteJid, key.remoteJidAlt as string, data.remoteJidAlt as string, key.participantAlt as string, data.participantAlt as string, key.participant as string, data.participant as string], '@s.whatsapp.net');
      const lidJid = firstEndingWith([remoteJid, key.remoteJidAlt as string, data.remoteJidAlt as string, key.participant as string, data.participant as string], '@lid');
      let phone = digits(phoneJid); const lid = digits(lidJid);
      const msgObj = data.message as Record<string, unknown> | undefined;
      const corpo = textOf(msgObj);
      const midia = midiaOf(msgObj);
      // v34: formulário do anúncio (WhatsApp Flow) — sem texto próprio; o conteúdo é montado dos campos.
      const form = !corpo && !midia ? formularioOf(unwrapMsg(msgObj)) : null;
      const conteudoMsg = corpo ?? midia?.caption ?? form?.texto ?? null; // legenda da mídia vira o texto exibido
      // v22: mensagens do HEALTH CHECK (wa-health-check) não viram lead/conversa/inbox. Marcador estável no texto.
      if (corpo && /^\s*teste (autom[aá]tico|de entrega) atenvo\b/i.test(corpo)) { await finish('ignorado', { ignorado_motivo: 'health_check' }); return json({ ok: true }); }
      if (!corpo && !midia && !form) { await finish('ignorado', { ignorado_motivo: 'sem_conteudo' }); return json({ ok: true }); }
      if (!phone && !lid) { await finish('ignorado', { ignorado_motivo: 'sem_identificador' }); return json({ ok: true }); }
      // v21: evento SÓ com LID → consulta o mapa CONFIRMADO por (org, canal, lid) e REUTILIZA o PN já vinculado
      //      (manual ou anterior). Isso resolve o contato correto sem criar novo e sem depender de cache em memória.
      //      NUNCA usa mapa não confirmado nem PN sem telefone.
      let resolvidoViaMapa = false;
      if (!phone && lid) {
        const { data: mp } = await admin.from('wa_lid_map').select('telefone_normalizado, jid_telefone')
          .eq('organizacao_id', orgId).eq('canal_id', canal.id).eq('lid', lid).eq('confirmado', true)
          .not('telefone_normalizado', 'is', null).maybeSingle();
        if (mp?.telefone_normalizado) { phone = mp.telefone_normalizado; phoneJid = mp.jid_telefone ?? `${phone}@s.whatsapp.net`; resolvidoViaMapa = true; }
      }
      // Em saída o pushName é do dono da conta (não do destinatário) → não usar como nome do contato.
      // v19: o LID NUNCA vira nome. Sem PN e sem pushName real → "Identidade protegida" (pendente).
      const pushNameReal = !fromMe ? sanitizeNome(data.pushName as string) : null;

      // v37: o ECO da resposta do /clean (fromMe, texto exato da resposta, número de teste) não vira conversa nem
      //      mensagem "do celular". Só lê a config quando o texto bate (nenhuma outra mensagem paga consulta a mais).
      if (fromMe && !midia && !form && ehTextoDaRespostaClean(corpo)) {
        const cfgEco = await lerConfigClean(admin, canal.id as string);
        if (ehEcoDaLimpeza({ fromMe, texto: corpo, telefone: phone, cfg: cfgEco })) {
          await finish('processado', { ignorado_motivo: 'fromMe_teste_clean' });
          return json({ ok: true });
        }
      }

      // v35: CORRIDA NO INBOUND. Contato + identidades (PN #7 / LID) + conversa saem de UMA RPC
      //      transacional, serializada por PESSOA (advisory lock na chave canônica DDD+8 e no LID).
      //      Antes eram ~6 chamadas soltas (resolve → insert contato → identidades → select/insert
      //      conversa) e, numa rajada (05/10 10:02: a Evolution despejou o backlog), dois requests do
      //      MESMO número criavam DOIS contatos + DUAS conversas no mesmo segundo. O perdedor ficava
      //      sem identidade WhatsApp (uq_identidade_valor, erro ignorado) e o bot/IA saíam com
      //      sem_destino_envio; e o 23505 de conversas_uma_ativa_por_contato descartava a mensagem.
      //      A regra de resolução/criação é a MESMA de antes (v30 chave canônica, v21 LID, #7 PN,
      //      v27 uma conversa ativa por contato, v31 canal que prende) — só mudou de lugar.
      //      PAREADO com a migração 20261006142643_wa_inbound_garantir_contato_conversa.
      //      A trava faz o 2º evento da mesma pessoa ESPERAR o 1º; o authenticator tem lock_timeout e
      //      statement_timeout de 8s. Num dia lento (21/09) a espera pode estourar — e agora contato +
      //      conversa são UM passo só: falhou = mensagem perdida (respondemos 200, a Evolution não
      //      reenvia). A RPC é idempotente (resolve-ou-cria sob trava), então 1 nova tentativa em erro
      //      TRANSITÓRIO (trava/timeout/deadlock/rede) é segura. Erro de regra/dado não repete.
      const argsGarantir = {
        p_org: orgId, p_canal: canal.id,
        p_phone: phone ?? null, p_phone_jid: phoneJid ?? null,
        p_lid: lid ?? null, p_lid_jid: lidJid ?? null,
        p_push_name: pushNameReal, p_prende: !!canal.prende_conversa,
      };
      let { data: garantido, error: eG } = await admin.rpc('wa_inbound_garantir_contato_conversa', argsGarantir);
      if (eG && ['55P03', '57014', '40P01', '40001', ''].includes(eG.code ?? '')) {
        await new Promise((r) => setTimeout(r, 300 + Math.floor(Math.random() * 400)));
        ({ data: garantido, error: eG } = await admin.rpc('wa_inbound_garantir_contato_conversa', argsGarantir));
      }
      const gar = (garantido ?? null) as { contato_id?: string; conversa_id?: string; canal_preso_id?: string | null; pn_recuperado?: boolean } | null;
      if (eG || !gar?.contato_id || !gar?.conversa_id) { await finish('erro', { erro: `inbound:${eG?.code ?? ''}:${(eG?.message ?? 'sem retorno').slice(0,180)}` }); return json({ ok: true }); }
      const contatoId: string = gar.contato_id;
      const conversaId: string = gar.conversa_id;
      const canalPresoId: string | null = gar.canal_preso_id ?? null;
      const pnRecuperadoAgora = !!gar.pn_recuperado;   // v32: ESTE evento deu número a um contato que não tinha

      // v19: mapa LID↔PN por CANAL (o mesmo LID pode ser pessoas diferentes em números distintos). Best-effort.
      if (lid) {
        try {
          const { data: mapRow } = await admin.from('wa_lid_map').select('id, telefone_normalizado').eq('organizacao_id', orgId).eq('canal_id', canal.id).eq('lid', lid).maybeSingle();
          if (!mapRow) await admin.from('wa_lid_map').insert({ organizacao_id: orgId, canal_id: canal.id, lid, jid_telefone: phoneJid ?? null, telefone_normalizado: phone ?? null, fonte: 'webhook', confirmado: !!phone });
          else if (phone && mapRow.telefone_normalizado !== phone) await admin.from('wa_lid_map').update({ jid_telefone: phoneJid ?? null, telefone_normalizado: phone, confirmado: true }).eq('id', mapRow.id);
        } catch { /* não bloqueia o webhook */ }
      }

      // ---- MÍDIA (imagem/vídeo/áudio/documento/sticker): baixa pela Evolution e guarda no bucket privado. ----
      // Mesma cadeia do áudio (getBase64FromMediaMessage). Falha de download => PENDENTE recuperável, nunca descarta.
      const viaTag = fromMe ? 'webhook_fromMe' : 'webhook';
      let tipoMsg = 'texto';
      let metaMsg: Record<string, unknown> | null = null;
      let audioB64: string | null = null;   // base64 SÓ p/ áudio INBOUND dentro do teto de transcrição
      let audioMime: string | null = null;
      if (midia) {
        tipoMsg = midia.kind;
        const baseMeta = { mime: midia.mime, nome: midia.nome, ptt: midia.ptt, seconds: midia.seconds, tamanho: midia.tamanho, legenda: midia.caption, via: viaTag };
        if (midia.tamanho && midia.tamanho > MAX_MEDIA) {
          metaMsg = { ...baseMeta, midia_pendente: true, media_erro: 'arquivo_excede_limite', status_midia: 'falhou', media_key: key };
        } else {
          try {
            const dl = await baixarMidia(instanceName, data);
            if (dl.bytes.length > MAX_MEDIA) throw new Error('arquivo_excede_limite');
            const mime = dl.mime || midia.mime;
            const ext = extFor(mime, midia.nome);
            const path = `${orgId}/wa-midia/${(provMsgId ?? crypto.randomUUID()).replace(/[^\w-]/g, '')}.${ext}`;
            const up = await admin.storage.from('script-midia').upload(path, dl.bytes, { contentType: mime, upsert: true });
            if (up.error) throw new Error(up.error.message);
            metaMsg = { ...baseMeta, mime, tamanho: dl.bytes.length, nome: midia.nome ?? `${midia.kind}.${ext}`, anexo_path: path, status_midia: 'disponivel' };
            // áudio INBOUND curto → guarda o base64 p/ o bot-runner transcrever (Gemini). Longo/grande → withhold (aviso+pausa).
            if (!fromMe && midia.kind === 'audio' && dl.bytes.length <= MAX_AUDIO_TRANSC && (midia.seconds == null || midia.seconds <= MAX_AUDIO_SEG)) {
              audioB64 = dl.b64; audioMime = mime;
            }
          } catch (e) {
            // mídia não baixada: persiste a mensagem como PENDENTE (recuperável), nunca descarta.
            metaMsg = { ...baseMeta, midia_pendente: true, media_erro: String((e as Error).message ?? 'download').slice(0, 120), status_midia: 'falhou', media_key: key };
          }
        }
      }
      if (form) {
        metaMsg = { via: viaTag, origem: 'cliente', formulario: { fonte: 'whatsapp_flow', flow_id: form.flow_id, flow_name: form.flow_name, campos: form.campos, nome: form.nome, email: form.email } };
      }

      if (fromMe) {
        // #7 SAÍDA pelo celular — idempotente por id_externo. Envio da Atenvo já gravou a mesma id → não duplica.
        if (!provMsgId) { await finish('ignorado', { ignorado_motivo: 'fromMe_sem_id' }); return json({ ok: true }); }
        const { data: existente } = await admin.from('mensagens').select('id, origem').eq('organizacao_id', orgId).eq('id_externo', provMsgId).maybeSingle();
        if (existente) {
          if (!existente.origem) await admin.from('mensagens').update({ origem: 'atenvo' }).eq('id', existente.id);
          await finish('processado', { ignorado_motivo: 'fromMe_atenvo' }); return json({ ok: true });
        }
        const nowIso = new Date().toISOString();
        // v36: resposta automática do WhatsApp ao formulário NÃO é humano. Só consulta o banco quando
        //      o texto bate exato (raro); qualquer erro na consulta mantém o comportamento antigo.
        let autoForm = false;
        if (tipoMsg === 'texto' && ehRespostaAutoFormulario(conteudoMsg) && await canalAceitaFormulario(admin, canal.id)) {
          try {
            const desde = new Date(Date.now() - JANELA_AUTO_FORMULARIO_MS).toISOString();
            const { data: fm } = await admin.from('mensagens').select('criado_em')
              .eq('conversa_id', conversaId).eq('direcao', 'entrada').not('metadados->formulario', 'is', null)
              .gte('criado_em', desde).order('criado_em', { ascending: false }).limit(1).maybeSingle();
            autoForm = ehSaidaAutoFormulario({ tipo: tipoMsg, texto: conteudoMsg, formularioEmMs: fm?.criado_em ? Date.parse(fm.criado_em as string) : null, agoraMs: Date.now() });
          } catch { autoForm = false; }
        }
        const { error: msgErr } = await admin.from('mensagens').upsert({
          conversa_id: conversaId, organizacao_id: orgId, direcao: 'saida', tipo: tipoMsg,
          conteudo: conteudoMsg ?? null, texto_original: conteudoMsg ?? null, origem: autoForm ? 'bot' : 'telefone', id_externo: provMsgId,
          status: 'entregue', enviada_em: nowIso, entregue_em: nowIso,
          metadados: autoForm ? { ...META_AUTO_FORMULARIO } : (metaMsg ?? { origem: 'telefone', via: 'webhook_fromMe' }),
        }, { onConflict: 'id_externo', ignoreDuplicates: true });
        if (msgErr) { await finish('erro', { erro: `mensagens_out:${msgErr.code ?? ''}:${(msgErr.message ?? '').slice(0,180)}` }); return json({ ok: true }); }
        if (autoForm) {
          // não é ato humano: NÃO troca o canal atual nem prende/solta canal_preso (v27/v31 são de gente).
          await admin.from('conversas').update({ ultima_interacao_em: nowIso }).eq('id', conversaId);
          await finish('processado', { ignorado_motivo: 'fromMe_formulario_auto' }); return json({ ok: true });
        }
        // v27: saída pelo celular também move o CANAL ATUAL (atendente passou a falar por outro número).
        // v31: e é o ato humano que PRENDE (canal que prende) ou SOLTA (qualquer outro número —
        //      alguém do time trouxe o atendimento de volta). Bot e cron nunca caem aqui: este
        //      ramo é mensagem digitada no celular, e o que a Atenvo mandou já saiu em fromMe_atenvo.
        await admin.from('conversas').update({
          ultima_interacao_em: nowIso, canal_id: canal.id, ultimo_canal_id: canal.id,
          ultimo_numero: canal.numero_conectado ?? null, ultimo_provider: canal.provider ?? 'whatsapp',
          ultima_msg_canal_em: nowIso,
          canal_preso_id: canal.prende_conversa ? canal.id : null,
          canal_preso_em: canal.prende_conversa ? nowIso : null,
        }).eq('id', conversaId);
        await finish('processado', { ignorado_motivo: `fromMe_telefone${tipoMsg !== 'texto' ? '_' + tipoMsg : ''}` }); return json({ ok: true });
      }

      // ---- v37: /clean DO NÚMERO DE TESTE (N8). Só o texto exato lê a config; qualquer outra mensagem segue igual. ----
      let cleanNegado = false;
      if (!midia && !form && ehComandoClean(corpo)) {
        const cfgClean = await lerConfigClean(admin, canal.id as string);
        const decisao = decidirClean({ texto: corpo, fromMe, temMidia: false, ehFormulario: false, telefone: phone, cfg: cfgClean });
        if (decisao === 'limpar') {
          // grava o "/clean", limpa (iris_teste_limpar) e responde como SISTEMA; o robô e a IA não são chamados
          const r = await executarClean({
            admin, orgId, canalId: canal.id as string, contatoId, conversaId, provMsgId, texto: corpo as string,
            destino: phone ?? null, enviarTexto: enviadorEvolution(EVO_BASE, EVO_KEY, instanceName),
          });
          await finish(r.status, { ignorado_motivo: r.motivo, ...(r.erro ? { erro: r.erro } : {}) });
          return json({ ok: true });
        }
        cleanNegado = decisao === 'negado';   // número fora da lista: mensagem comum (abaixo) + evento
      }

      // ENTRADA — texto ou áudio.
      // metadados é NOT NULL: texto não preenche metaMsg (só áudio) — usar fallback p/ não violar a constraint
      // (era a causa do P0: inbound de TEXTO do cliente falhava com 23502 e a mensagem nunca aparecia no painel).
      const nowEntradaIso = new Date().toISOString();
      // .select() para saber se o INSERT criou linha NOVA (ignoreDuplicates → array vazio em webhook repetido):
      // só então incrementamos não lidas e reabrimos arquivada — evita duplo-incremento por reentrega.
      const { data: insArr, error: msgErr } = await admin.from('mensagens').upsert({ conversa_id: conversaId, organizacao_id: orgId, direcao: 'entrada', tipo: tipoMsg, conteudo: conteudoMsg ?? null, id_externo: provMsgId, status: 'entregue', recebida_em: nowEntradaIso, metadados: metaMsg ?? { via: 'webhook', origem: 'cliente' } }, { onConflict: 'id_externo', ignoreDuplicates: true }).select('id');
      if (msgErr) { await finish('erro', { erro: `mensagens:${msgErr.code ?? ''}:${(msgErr.message ?? '').slice(0,180)}` }); return json({ ok: true }); }
      const inboundNovo = Array.isArray(insArr) && insArr.length > 0; // false em reentrega (idempotente)
      // v27: CANAL ATUAL do atendimento = o número por onde o cliente acabou de falar. canal_id passa a
      // ser "canal atual" (card + continuidade); ultimo_canal_* alimenta o "Responder por".
      // A AQUISIÇÃO fica congelada em canal_origem_id (nunca é tocada aqui).
      // v31: canal que PRENDE marca a conversa nele; canal que não prende RESPEITA um preso
      // vigente — a conversa não muda de número só porque o cliente também escreveu no oficial.
      // A mensagem entra igual (não lida, desarquiva, bot): o que não anda é o canal.
      const presoPorOutro = !canal.prende_conversa && !!canalPresoId && canalPresoId !== canal.id;
      if (presoPorOutro) console.log(`[webhook] conversa ${conversaId} presa em ${canalPresoId} — entrada por ${canal.id} não move o canal`);
      const canalPatch = presoPorOutro ? {} : {
        canal_id: canal.id,
        ultimo_canal_id: canal.id,
        ultimo_numero: canal.numero_conectado ?? null,
        ultimo_provider: canal.provider ?? 'whatsapp',
        ultima_msg_canal_em: nowEntradaIso,
        ...(canal.prende_conversa ? { canal_preso_id: canal.id, canal_preso_em: nowEntradaIso } : {}),
      };
      if (inboundNovo) {
        // não lida operacional++ (nunca conta fromMe — este é o ramo de ENTRADA) e REABRE conversa arquivada.
        const { data: cv } = await admin.from('conversas').select('nao_lidas, arquivada_em').eq('id', conversaId).maybeSingle();
        await admin.from('conversas').update({
          ultima_interacao_em: nowEntradaIso,
          nao_lidas: (cv?.nao_lidas ?? 0) + 1,
          ...canalPatch,
          ...(cv?.arquivada_em ? { arquivada_em: null, arquivada_por: null } : {}),
        }).eq('id', conversaId);
      } else {
        await admin.from('conversas').update({ ultima_interacao_em: nowEntradaIso, ...canalPatch }).eq('id', conversaId);
      }

      const inboundMsgId = (insArr?.[0]?.id as string | undefined) ?? null;

      // v37: "/clean" de quem NÃO é número de teste (Iris ligada): segue como mensagem comum; só fica o registro.
      if (cleanNegado && inboundNovo) {
        try { await admin.rpc('iris_teste_registrar_negado', { p_conversa: conversaId, p_canal: canal.id }); }
        catch { /* registro best-effort: nunca afeta a ingestão */ }
      }

      // ---- JANELA DE 24H (dois números): registra que ESTE contato falou com ESTE canal.
      //      Só serve para o envio pela Cloud API — a Evolution não tem janela e nada aqui muda
      //      para ela. Existe neste webhook porque o relógio tem que valer para qualquer número
      //      que um dia vire cloud_api. Best-effort: erro nunca afeta a ingestão.
      if (inboundNovo && contatoId) {
        try { await admin.rpc('wa_janela_registrar', { p_canal: canal.id, p_contato: contatoId, p_quando: nowEntradaIso }); }
        catch { /* janela nunca interrompe a ingestão */ }
      }

      // ---- 25/11: DE QUAL ANÚNCIO veio a conversa (o cliente tocou no "Enviar mensagem" de um anúncio do Facebook ou do
      //      Instagram: o WhatsApp manda o ID do anúncio no externalAdReply) → atd_anuncio_origem (migration 96), que o
      //      Dashboard › Anúncios cruza com o gasto da Meta. Só na entrada NOVA; best-effort: nunca afeta a ingestão. ----
      if (inboundNovo && conversaId) {
        const ad = anuncioOf(data as Record<string, unknown>);
        if (ad) {
          try { await admin.rpc('atd_anuncio_registrar', { p_conversa: conversaId, p_contato: contatoId ?? null, p_canal: canal.id, p_anuncio: ad, p_quando: nowEntradaIso }); }
          catch { /* origem do anúncio nunca interrompe a ingestão */ }
        }
      }

      // ---- v34: FORMULÁRIO DO ANÚNCIO → contato. Só no inbound NOVO (reentrega não reaplica).
      //      E-mail: só preenche vazio. Nome: troca placeholder (sem letra/"Identidade protegida", como o
      //      bot_coletar_nome) ou o nome que ainda é o do próprio WhatsApp (pushName deste evento ou o
      //      número) com nome_fonte vazio/'whatsapp'/'sistema' — nunca 'manual'/'bot'. O painel não marca
      //      nome_fonte ao editar, por isso a régua é "o nome atual ainda é o do WhatsApp", e o UPDATE é
      //      otimista (nome e fonte iguais aos lidos). Fica
      //      nome_fonte='sistema': o nome que o lead digitar pro bot depois (bot_coletar_nome) ainda vence.
      //      Best-effort: erro aqui nunca afeta a ingestão. ----
      if (form && inboundNovo && contatoId && (form.email || form.nome)) {
        try {
          if (form.email) await admin.from('contatos').update({ email: form.email }).eq('id', contatoId).is('email', null);
          if (form.nome) {
            const { data: ct } = await admin.from('contatos').select('nome, nome_fonte').eq('id', contatoId).maybeSingle();
            const atual = ((ct?.nome as string | null) ?? '').trim();
            const fonte = (ct?.nome_fonte as string | null) ?? null;
            const generico = !atual || !/\p{L}/u.test(atual) || ['cliente', 'identidade protegida'].includes(atual.toLowerCase());
            const doWhatsapp = (fonte === null || fonte === 'whatsapp' || fonte === 'sistema')
              && (atual === (pushNameReal ?? '') || atual === (phone ?? ''));
            if (ct && form.nome !== atual && (generico || doWhatsapp)) {
              let up = admin.from('contatos').update({ nome: form.nome, nome_fonte: 'sistema' }).eq('id', contatoId).eq('nome', ct.nome as string);
              up = fonte === null ? up.is('nome_fonte', null) : up.eq('nome_fonte', fonte);
              await up;
            }
          }
        } catch { /* best-effort: o formulário já está na conversa */ }
      }

      // ---- v36: FORMULÁRIO CHEGOU DEPOIS da resposta automática dele (ordem invertida — não vista
      //      em produção, mas a Evolution não garante ordem): a resposta automática recente que
      //      entrou como 'telefone' é reclassificada agora (mesma regra do ramo fromMe). Best-effort. ----
      if (form && inboundNovo && await canalAceitaFormulario(admin, canal.id)) {
        try {
          const desde = new Date(Date.now() - JANELA_AUTO_FORMULARIO_MS).toISOString();
          const { data: autos } = await admin.from('mensagens').select('id, conteudo, metadados')
            .eq('conversa_id', conversaId).eq('direcao', 'saida').eq('origem', 'telefone').eq('tipo', 'texto')
            .is('autor_id', null).gte('criado_em', desde).limit(20);
          for (const m of (autos ?? []) as Array<{ id: string; conteudo: string | null; metadados: Record<string, unknown> | null }>) {
            if (!ehRespostaAutoFormulario(m.conteudo)) continue;
            await admin.from('mensagens').update({ origem: 'bot', metadados: { ...(m.metadados ?? {}), ...META_AUTO_FORMULARIO, reclassificada_em: nowEntradaIso } })
              .eq('id', m.id).eq('origem', 'telefone');
          }
        } catch { /* best-effort: o bot-runner também ignora esse texto ao procurar humano */ }
      }

      // ---- OPT-OUT COMERCIAL: "SAIR"/frase explícita de descadastro grava wa_optout SEMPRE,
      //      mesmo sem cadência de remarketing (bot_remarketing_inbound retorna cedo sem fila e
      //      nunca persistia o pedido). Bloqueia só marketing/disparo — atendimento segue normal. ----
      // v34: formulário não passa aqui — são campos digitados (nome/e-mail), não um pedido de descadastro.
      if (inboundNovo && inboundMsgId && conteudoMsg && !form) {
        try { await admin.rpc('wa_optout_inbound', { p_conversa: conversaId, p_texto: conteudoMsg }); }
        catch { /* best-effort: opt-out nunca quebra a ingestão */ }
      }

      // ---- REMARKETING: se o lead estava numa cadência, re-roteia a opp ANTES do dispatch ao runner.
      //      respondeu → opp volta pra LEAD NOVO (entrada), senão bot_pode_atuar bloquearia o lead que respondeu;
      //      opt-out → PERDIDO + NÃO dispara o bot. AWAITED de propósito: o move de coluna precisa commitar
      //      antes do fetch fire-and-forget. Best-effort: erro NUNCA afeta o fluxo normal (lead comum segue igual).
      let rmktDesfecho: string | null = null;
      if (inboundNovo && inboundMsgId) {
        try {
          const { data: r } = await admin.rpc('bot_remarketing_inbound', { p_conversa: conversaId, p_texto: form ? '' : (conteudoMsg ?? '') });
          rmktDesfecho = (r as string) ?? null;
        } catch { /* best-effort: erro/timeout do remarketing nunca quebra o webhook */ }
      }

      // ---- B3.3: dispatch fire-and-forget ao bot-runner (só inbound NOVO de cliente, texto/áudio) ----
      // dry_run:true FIXO → o bot só simula/loga; jamais envia a cliente. Os gates de negócio (master,
      // bot_pode_atuar, humano/responsável, precisa_humano, idempotência, lock, saúde do canal) são do
      // RUNNER (fonte de verdade). Aqui só o filtro básico. Nunca bloqueia nem quebra o webhook.
      // v36: o formulário do anúncio VAI pro runner como inbound_tipo 'formulario' com texto VAZIO (a v34
      //      não mandava: o lead respondia a abertura com o formulário e o robô esperava um SIM pra
      //      sempre). O runner nunca lê "Formulário do anúncio…" como resposta de etapa: só o fluxo que
      //      aceita formulário (empréstimo) usa o nome do metadados.formulario; os outros ignoram.
      //      Formulário que cai na trava (chega durante a abertura, ~10 s) tenta de novo: 3x, 5 s.
      const houveDispatchNormal = inboundNovo && !!inboundMsgId && rmktDesfecho !== 'optout' && (tipoMsg === 'texto' || tipoMsg === 'audio');
      if (houveDispatchNormal) {
        const dispatch = (async () => {
          try {
            const { data: bs } = await admin.from('webhook_config').select('secret').eq('chave', 'bot_runner').maybeSingle();
            if (!bs?.secret) return;
            const corpoRunner = JSON.stringify({
              conversa_id: conversaId, inbound_msg_id: inboundMsgId,
              inbound_text: form ? '' : (conteudoMsg ?? ''), inbound_tipo: form ? 'formulario' : tipoMsg,
              dry_run: EVO_BOT_DRY_RUN, ...(audioB64 ? { inbound_audio_b64: audioB64, inbound_audio_mime: audioMime } : {}),
            });
            // 15/11 (leitura da Iris): texto/áudio do cliente que cai na trava do passo anterior (~20 s) TAMBÉM tenta de novo (antes: 1 tentativa e a resposta se
            // perdia, 12–25/dia). Cada tentativa é uma execução nova do runner (relê estado, refaz a idempotência e as guardas) — ver dispatch_runner.ts.
            await despacharAoRunner(async () => {
              const resp = await fetch(`${FUNCTIONS_BASE}/bot-runner`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-bot-secret': bs.secret as string },
                body: corpoRunner,
              });
              return await resp.json().catch(() => null) as { skipped?: string } | null;
            }, form ? DESPACHO_FORMULARIO : DESPACHO_TEXTO);
          } catch { /* fire-and-forget: erro do runner nunca afeta o webhook */ }
        })();
        try { (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime?.waitUntil?.(dispatch); } catch { /* sem waitUntil: segue fire-and-forget */ }
      }

      // ---- v32: LID RESOLVIDO DEPOIS -> re-dispatch ao bot-runner ----
      // O inbound que abriu a conversa chegou só com @lid: o contato nasceu sem número, o runner
      // saiu com 'sem_destino_envio' e o bot ficou mudo. Este evento acabou de gravar o PN (bloco
      // #7 acima) e NÃO é um inbound novo de texto — sem isto aqui, o lead só voltaria a existir
      // para o bot se ELE mandasse outra mensagem. Reenvia o ÚLTIMO inbound de TEXTO da conversa
      // (janela de 1h: cobre o caso real, de minutos, sem ressuscitar conversa velha).
      // Só quando o dispatch normal NÃO rodou neste evento — senão o runner receberia dois.
      // Idempotência (ultimo_inbound_msg_id), lock e gates continuam no RUNNER: se um humano
      // assumiu nesse meio tempo, ele responde 'ja_tem_atendente' e não atropela ninguém.
      if (pnRecuperadoAgora && conversaId && !houveDispatchNormal) {
        const redispatch = (async () => {
          try {
            const desde = new Date(Date.now() - 60 * 60 * 1000).toISOString();
            const { data: ult } = await admin.from('mensagens')
              .select('id, conteudo, metadados').eq('conversa_id', conversaId).eq('direcao', 'entrada').eq('tipo', 'texto')
              .gte('criado_em', desde).order('criado_em', { ascending: false }).limit(1).maybeSingle();
            if (!ult?.id) return;
            const { data: bs } = await admin.from('webhook_config').select('secret').eq('chave', 'bot_runner').maybeSingle();
            if (!bs?.secret) return;
            // v36: se o último inbound de texto é o formulário, vai como formulário (nunca como texto da etapa)
            const ultForm = !!(ult.metadados as Record<string, unknown> | null)?.formulario;
            await fetch(`${FUNCTIONS_BASE}/bot-runner`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'x-bot-secret': bs.secret as string },
              body: JSON.stringify({ conversa_id: conversaId, inbound_msg_id: ult.id, inbound_text: ultForm ? '' : (ult.conteudo ?? ''), inbound_tipo: ultForm ? 'formulario' : 'texto', dry_run: EVO_BOT_DRY_RUN }),
            });
          } catch { /* fire-and-forget: erro nunca afeta o webhook */ }
        })();
        try { (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime?.waitUntil?.(redispatch); } catch { /* sem waitUntil */ }
      }

      // Auto-entrada no Kanban: TODO inbound de contato garante LEAD NOVO (não só recém-criado —
      // contato pré-existente sem oportunidade também entra ao voltar a falar). A RPC central
      // resolve o funil principal, é idempotente (não duplica opp ativa) e NÃO reentra contato
      // que já teve opp fechada (decisão do dono). Best-effort: nunca quebra o webhook.
      let kanbanErro: string | null = null;
      if (contatoId) {
        try {
          const { error: re } = await admin.rpc('garantir_oportunidade_lead_novo', { p_contato: contatoId, p_conversa: conversaId, p_canal: canal.id, p_origem: 'WhatsApp' });
          if (re) kanbanErro = `${re.code ?? ''}:${(re.message ?? '').slice(0, 80)}`;
        } catch (ke) { kanbanErro = String((ke as Error).message ?? 'rpc').slice(0, 80); }
      }
      await finish('processado', { ignorado_motivo: kanbanErro ? ('kanban_erro:' + kanbanErro) : (resolvidoViaMapa ? 'lid_resolvido_via_mapa' : (phone ? (form ? 'formulario_anuncio' : null) : 'lid_sem_telefone')) });
      return json({ ok: true });
    }

    if (event === 'messages.update') {
      const arr = Array.isArray(evt?.data) ? (evt!.data as unknown as Record<string, unknown>[]) : [data];
      let n = 0; let falhas = 0;
      const map: Record<string, string> = { PENDING: 'pendente', SERVER_ACK: 'enviada', DELIVERY_ACK: 'entregue', READ: 'lida', PLAYED: 'lida', ERROR: 'falhou' };
      // ranking p/ status monotônico: o ack só avança (nunca regride enviada<-entregue por ack fora de ordem).
      const RANK: Record<string, number> = { pendente: 0, enviada: 1, entregue: 2, lida: 3 };
      // Saúde de ENTREGA (outbound) — acumula o efeito dos ACKs deste lote no canal. Independe do
      // health_check_status (sessão) e NÃO altera envio_restrito. canal é garantido não-nulo aqui (guard acima).
      let entregaEstado: { status: EntregaStatus; erros: number } = {
        status: ((canal.entrega_status as EntregaStatus) ?? 'desconhecido'), erros: (canal.entrega_erros_recentes as number) ?? 0,
      };
      let entregaTocou = false, entregaErroEm = false;
      const numCanal = digits(canal.numero_conectado as string);
      // aplica um evento de entrega ao estado acumulado do canal (destino externo = prova real).
      const aplicaEntrega = (statusProv: string, temStub: boolean, externo: boolean) => {
        const ev = eventoDoStatus(statusProv, temStub, externo);
        if (!ev) return;
        const patch = classificarEntrega(ev, entregaEstado);
        if (patch) { entregaEstado = { status: patch.entrega_status, erros: patch.entrega_erros_recentes }; entregaTocou = true; if (patch.marcarErroEm) entregaErroEm = true; }
      };
      for (const it of arr) {
        const id = ((it.key as { id?: string } | undefined)?.id) ?? (it.keyId as string | undefined);
        const status = (it.status as string | undefined)?.toUpperCase();
        if (!id || !status) continue;
        const novo = map[status];
        if (!novo) continue;
        const sp = (it.messageStubParameters as unknown);
        const stub = Array.isArray(sp) ? sp.join(',') : (sp != null ? String(sp) : null);
        // estado atual da mensagem (por id_externo) para decidir avanço/regressão.
        const { data: atualRow } = await admin.from('mensagens').select('status, direcao').eq('id_externo', id).maybeSingle();
        if (!atualRow) {
          // Fase 2: pode ser o ACK de um PROBE de entrega (não vive em mensagens, e sim em canal_health_runs).
          const { data: run } = await admin.from('canal_health_runs')
            .select('id, dados, executado_em').eq('message_id', id).in('tipo', ['entrega', 'entrega_conexao', 'entrega_automatica']).eq('canal_id', canal.id)
            .order('criado_em', { ascending: false }).limit(1).maybeSingle();
          if (run && (run.dados as { aguardando_ack?: boolean } | null)?.aguardando_ack) {
            // Só ACK TERMINAL fecha o run. PENDING/SERVER_ACK são aceitação do servidor (passos
            // intermediários), NÃO entrega e NÃO falha — se fechássemos aqui, o DELIVERY_ACK real
            // chegaria depois e seria ignorado (probe saudável apareceria como restrito).
            const entregue = status === 'DELIVERY_ACK' || status === 'READ' || status === 'PLAYED';
            const falhou = status === 'ERROR';
            if (entregue || falhou) {
              aplicaEntrega(status, !!stub, true);                            // probe = destino externo autorizado
              await admin.from('canal_health_runs').update({
                sucesso: entregue, status_resultado: entregue ? 'entregue' : status,
                erro: entregue ? null : `ERROR${stub ? ':' + stub.slice(0, 80) : ''}`,
                erro_tipo: entregue ? null : (stub ? 'instavel' : 'restrito'),
                // latência REAL até o ACK (envio → confirmação do provedor)
                latencia_ms: Math.max(0, Date.now() - new Date(run.executado_em as string).getTime()),
                dados: { ...(run.dados as object), aguardando_ack: false, ack: status },
              }).eq('id', run.id);
            } else {
              // ACK intermediário (PENDING/SERVER_ACK): o servidor aceitou, mas NÃO é entrega.
              // Registra p/ diagnóstico e mantém o run aberto até o ACK final (ou o timeout de 5min).
              await admin.from('canal_health_runs').update({
                dados: { ...(run.dados as object), ack_intermediario: status, ack_intermediario_em: new Date().toISOString() },
              }).eq('id', run.id);
            }
          }
          continue;
        }
        const atual = (atualRow.status as string) ?? 'pendente';
        if (novo === 'falhou') {
          // só marca falha se ainda NÃO houve confirmação real de entrega/leitura.
          if (atual === 'entregue' || atual === 'lida') continue;
          await admin.from('mensagens').update({ status: 'falhou', erro_envio: `ERROR${stub ? ':' + stub.slice(0, 80) : ''}`, metadados: { erro: { status, remoteJid: (it.remoteJid as string) ?? null, instance: instanceName, stub: stub ?? null, em: new Date().toISOString() } } }).eq('id_externo', id);
          falhas++;
        } else {
          if ((RANK[novo] ?? 0) <= (RANK[atual] ?? -1)) continue; // não regride
          await admin.from('mensagens').update({ status: novo }).eq('id_externo', id); n++;
        }
        // ---- classifica ENTREGA só p/ mensagem de SAÍDA (ACK é sobre o que ENVIAMOS) ----
        if ((atualRow.direcao as string) === 'saida') {
          const destino = digits(it.remoteJid as string);
          aplicaEntrega(status, !!stub, !!destino && destino !== numCanal);   // self-send não prova entrega a cliente
        }
      }
      if (entregaTocou) {
        await admin.from('canais').update({
          entrega_status: entregaEstado.status, entrega_erros_recentes: entregaEstado.erros,
          ...(entregaErroEm ? { entrega_ultimo_erro_em: new Date().toISOString() } : {}),
        }).eq('id', canal.id); // NÃO toca health_check_status nem envio_restrito
      }
      await finish('processado', { ignorado_motivo: `acks:${n}${falhas ? ` falhas:${falhas}` : ''}${entregaTocou ? ` entrega:${entregaEstado.status}` : ''}` }); return json({ ok: true });
    }

    await finish('ignorado', { ignorado_motivo: `evento_nao_tratado:${event}` });
    return json({ ok: true });
  } catch (e) { return json({ error: (e as Error).message ?? 'erro' }, 500); }
});
