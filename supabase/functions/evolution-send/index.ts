// evolution-send — envia texto/IMAGEM/ÁUDIO/DOCUMENTO e persiste a saída.
// v23: DESTINO valida candidatos no onWhatsApp e usa o que EXISTE (identidade WhatsApp tem prioridade sobre
//      o telefone do CRM, que pode estar malformado). Corrige envio ao número errado (exists:false) -> ERROR.
//      Erro do provider preserva o status HTTP (evolution.ts) em erro_envio (não mascara em 502 genérico).
// v22: FALHA SEMPRE PERSISTE — se o provider lança (texto/mídia), grava linha status='falhou' (id p/ retry/
//      remover; sobrevive a reload). Evita a mensagem ficar "pendente eterno" no app quando o edge retorna 502.
// v22: ÁUDIO por ORIGEM — gravação do painel (microfone) SEMPRE nota de voz/PTT (sendWhatsAppAudio,
//      inclusive mp4/aac do Safari; se a Evolution recusar => erro claro, NUNCA arquivo comum silencioso).
//      Arquivo anexado => mídia comum (sendMedia). Corrige áudio do painel chegando como arquivo/mudo.
// v21: ÁUDIO por formato — ogg/webm(opus) via sendWhatsAppAudio (PTT); mp4/m4a/mpeg/aac/wav via sendMedia
//      (áudio reproduzível). Resolve "formato não compatível" no Mac/Safari (grava audio/mp4). Bloqueia áudio vazio.
// v20: TEXTO normalizado antes do envio (NFC, CRLF->\n, NBSP->espaço, remove zero-width/soft-hyphen/
//      controles) — resolve "texto da ficha não envia" (caracteres invisíveis copiados). Não corta;
//      bloqueia só acima do limite real do provider, com erro claro.
// v19: ÁUDIO via BASE64 (Evolution 2.3.6 recusa URL remota no /message/sendWhatsAppAudio -> "Bad Request").
//      Baixa o arquivo do bucket e envia base64 + encoding:true (preserva MIME/ext). Erro de mídia traduzido.
// v18: REVERTE o destino por LID (v17): causa do ERROR era a conta/sessão do remetente, não o resolvedor.
// v16/15/14: DOCUMENTO/ÁUDIO/IMAGEM via sendMedia/sendWhatsAppAudio (isolamento por org, exige key.id).
// v13: status 'enviada' ao obter key.id; webhook avança p/ entregue/lida; retry reaproveita a mesma linha.
import { corsHeaders, json } from './cors.ts';
import { adminClient, getUser } from './client.ts';
import { evolution, evolutionConfigured } from './evolution.ts';
import { enviadorDe } from './transporte.ts';

const digits = (s?: string | null): string | null => ((s ?? '').replace(/[^0-9]/g, '') || null);

// Comparação de segredo em tempo constante — não vaza o tamanho/prefixo por timing.
function seguroIgual(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
const WA_TEXT_MAX_BYTES = 65000; // limite prático de um único envio de texto no WhatsApp

// base64 (sem prefixo data URI) em blocos — seguro para arquivos grandes.
function toBase64(bytes: Uint8Array): string {
  let bin = ''; const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(bin);
}
// container REAL por magic bytes (não confia no MIME/extensão declarados) — só p/ diagnóstico.
function containerReal(bytes: Uint8Array): string {
  if (bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return 'webm/matroska';
  const asc = new TextDecoder('latin1').decode(bytes.slice(0, 16));
  if (asc.startsWith('OggS')) return 'ogg';
  if (asc.slice(4, 8) === 'ftyp') return 'mp4/m4a:' + asc.slice(8, 12).replace(/[^\x20-\x7e]/g, '');
  if (asc.startsWith('RIFF')) return 'wav';
  if (asc.startsWith('ID3') || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)) return 'mp3';
  return 'desconhecido';
}
// Normaliza texto antes do envio: NFC, CRLF->\n, NBSP->espaço normal, remove zero-width/word-joiner/BOM,
// soft-hyphen e controles inválidos (mantém \n e \t). Preserva acentos e o conteúdo legível.
// Resolve falhas de "texto copiado da ficha" que carregam NBSP/controles invisíveis.
function sanitizeWaText(s: string): string {
  const nbsp = new RegExp('\\u00A0', 'g');
  const zeroWidth = new RegExp('[\\u200B-\\u200D\\u2060\\uFEFF]', 'g');
  const softHyphen = new RegExp('\\u00AD', 'g');
  const controls = new RegExp('[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F]', 'g');
  return (s ?? '')
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .replace(nbsp, ' ')
    .replace(zeroWidth, '')
    .replace(softHyphen, '')
    .replace(controls, '');
}
// Traduz o erro técnico do provider/storage em mensagem clara ao usuário (cru fica no log).
function traduzMidiaErro(tipo: string, m: string): string {
  const c = (m || '').toLowerCase();
  if (/not |connect|close|logout/.test(c)) return 'O WhatsApp deste canal desconectou. Reconecte em Integrações.';
  if (/too large|payload|413|excede|grande/.test(c)) return tipo === 'audio' ? 'O áudio excede o tamanho permitido.' : 'O arquivo excede o tamanho permitido.';
  if (/download|fetch| url|access|not found|404/.test(c)) return tipo === 'audio' ? 'Não foi possível acessar o arquivo de áudio.' : 'Não foi possível acessar o arquivo.';
  if (/bad request|400|unsupported|invalid|format|mime|codec|decode/.test(c)) return tipo === 'audio' ? 'O formato deste áudio não é compatível.' : 'O formato deste arquivo não é compatível.';
  return tipo === 'audio' ? 'A conexão do WhatsApp recusou o áudio. Tente novamente.' : 'A conexão do WhatsApp recusou o arquivo. Tente novamente.';
}

// ===== Mídia: regras centralizadas (MIME permitido, extensões, tamanho) =====
const DOC_MIMES = [
  'application/pdf', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain', 'text/csv', 'application/zip', 'application/x-zip-compressed',
];
const DOC_EXTS = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'txt', 'csv', 'ppt', 'pptx', 'zip'];
const MAX_IMG_AUDIO = 16 * 1024 * 1024; // imagem/áudio
const MAX_DOC = 25 * 1024 * 1024;       // documento
function midiaCompativel(tipo: string, mime: string, nome: string): boolean {
  if (tipo === 'audio') return mime.startsWith('audio/');
  if (tipo === 'imagem') return mime.startsWith('image/');
  if (tipo === 'video') return mime.startsWith('video/');
  if (tipo === 'documento') { const ext = (nome.split('.').pop() || '').toLowerCase(); return DOC_MIMES.includes(mime) || DOC_EXTS.includes(ext); }
  return false;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    if (!evolutionConfigured()) return json({ error: 'Evolution não configurada.' }, 503);
    const admin = adminClient();
    // AUTENTICAÇÃO — dois caminhos:
    //  (1) FLUXO NORMAL: JWT de usuário (idêntico ao de sempre; envio manual não muda).
    //  (2) MODO SERVICE: header x-agendamento-secret == webhook_config.agendamento — usado SÓ pelo
    //      processador de mensagens agendadas (cron). Nunca acessível pelo front (segredo só no backend).
    //      NÃO relaxa nenhuma validação de org/canal/conversa abaixo — só dispensa o JWT de usuário.
    const user = await getUser(req);
    let serviceMode = false;
    if (!user) {
      const svcSecret = req.headers.get('x-agendamento-secret') ?? '';
      if (svcSecret) {
        const { data: cfg } = await admin.from('webhook_config').select('secret').eq('chave', 'agendamento').maybeSingle();
        if (cfg?.secret && seguroIgual(svcSecret, cfg.secret as string)) serviceMode = true;
      }
    }
    if (!user && !serviceMode) return json({ error: 'Não autenticado.' }, 401);

    const { action, conversa_id, text, canal_id, assinatura_nome, retry_mensagem_id, midia_path, midia_tipo, midia_mime, midia_nome, midia_tamanho, vinc_numero, vinc_jid, audio_diag, origem_audio, ator_id, agendamento_id, reply_to_id, reply_to_id_ext, reply_to_from_me, reply_preview } = await req.json().catch(() => ({}));
    // Resposta a uma mensagem específica (quoted reply). `respostaCols` grava o link local
    // (respondida_a_id); o objeto `quoted` (montado após resolver o destino) vai à Evolution.
    const respostaCols: Record<string, unknown> = (typeof reply_to_id === 'string' && reply_to_id) ? { respondida_a_id: reply_to_id } : {};
    const replyPrev = (reply_preview && typeof reply_preview === 'object') ? reply_preview as Record<string, unknown> : null;
    // Autor da mensagem: usuário logado (fluxo manual) OU, no modo service, quem agendou (ator_id).
    // NUNCA usar user.id direto nos INSERTs — no modo service user é null e estouraria APÓS o envio.
    const autorId: string | null = user?.id ?? (typeof ator_id === 'string' ? ator_id : null);
    const temTexto = !!text?.toString().trim();
    if (!conversa_id) return json({ error: 'conversa_id é obrigatório.' }, 400);
    if (!action && (!temTexto && !midia_path && !retry_mensagem_id)) return json({ error: 'conversa_id e conteúdo (texto ou mídia) são obrigatórios.' }, 400);
    const corr = (globalThis.crypto?.randomUUID?.() ?? String(Date.now())).slice(0, 8);

    // Guard de troca de senha obrigatória (só no fluxo de usuário; o cron não tem usuário).
    if (user) {
      const { data: perfil } = await admin.from('usuarios').select('deve_trocar_senha').eq('id', user.id).maybeSingle();
      if (perfil?.deve_trocar_senha) return json({ error: 'Troque sua senha temporária antes de usar o sistema.', code: 'troca_senha_obrigatoria' }, 403);
    }
    const { data: conv } = await admin.from('conversas').select('id, organizacao_id, contato_id, canal_id').eq('id', conversa_id).maybeSingle();
    if (!conv) return json({ error: 'Conversa não encontrada.' }, 404);

    // IDEMPOTÊNCIA (modo service/agendamento) — vale p/ TEXTO E MÍDIA: se este agendamento JÁ teve mensagem
    // ENVIADA, não reenvia (fecha a duplicação quando o processador re-tenta após resposta HTTP perdida).
    // Checado ANTES dos ramos de mídia/texto para cobrir os dois caminhos.
    if (agendamento_id) {
      const { data: jaEnviada } = await admin.from('mensagens')
        .select('id, conteudo, enviada_em, direcao, status')
        .eq('conversa_id', conversa_id).eq('status', 'enviada')
        .filter('metadados->>agendamento_id', 'eq', agendamento_id as string)
        .maybeSingle();
      if (jaEnviada) { console.log(`[send] corr=${corr} idempotente: agendamento ${agendamento_id} já enviado`); return json({ ok: true, mensagem: jaEnviada, idempotente: true }); }
    }

    // RETRY: reaproveita a MESMA mensagem falhada (sem duplicar). Só vale p/ mensagem de saída desta conversa/org com status 'falhou'.
    let retryMsg: { id: string; conteudo: string | null; texto_original: string | null; assinatura_nome: string | null; tipo: string | null; metadados: Record<string, unknown> | null } | null = null;
    if (retry_mensagem_id) {
      const { data: rm } = await admin.from('mensagens')
        .select('id, conversa_id, organizacao_id, direcao, status, conteudo, texto_original, assinatura_nome, tipo, metadados')
        .eq('id', retry_mensagem_id).maybeSingle();
      if (!rm || rm.conversa_id !== conversa_id || rm.organizacao_id !== conv.organizacao_id || rm.direcao !== 'saida' || rm.status !== 'falhou')
        return json({ error: 'Mensagem para retentativa inválida.' }, 422);
      retryMsg = { id: rm.id as string, conteudo: rm.conteudo as string | null, texto_original: rm.texto_original as string | null, assinatura_nome: rm.assinatura_nome as string | null, tipo: rm.tipo as string | null, metadados: (rm.metadados as Record<string, unknown> | null) ?? null };
    }

    // Vínculo do ATOR: no fluxo de usuário, exige membro ativo. No modo service, o `ator_id`
    // (quem agendou) é validado contra a org DA CONVERSA — o envio segue mesmo que essa pessoa
    // tenha saído depois (decisão do dono: follow-up agendado não se perde), mas nunca cruza org.
    if (user) {
      const { data: mem } = await admin.from('organizacao_usuarios').select('status').eq('organizacao_id', conv.organizacao_id).eq('usuario_id', user.id).maybeSingle();
      if (!mem || mem.status !== 'ativo') return json({ error: 'Sem acesso a esta organização.' }, 403);
    } else if (serviceMode && ator_id) {
      const { data: memAtor } = await admin.from('organizacao_usuarios').select('status').eq('organizacao_id', conv.organizacao_id).eq('usuario_id', ator_id).maybeSingle();
      console.log(`[send] service corr=${corr} conv=${conversa_id} ator=${ator_id} ator_vinculo=${memAtor?.status ?? 'nenhum'}`);
    }

    // CANAL: usa EXATAMENTE o canal escolhido em "Responder por" (canal_id). Sem fallback implícito ao canal da conversa.
    const canalId = (canal_id as string) || (conv.canal_id as string);
    const { data: canal } = await admin.from('canais').select('id, instancia_externa, status_integracao, numero_conectado, provider, envio_restrito, transporte, cloud_phone_number_id').eq('id', canalId).eq('organizacao_id', conv.organizacao_id).maybeSingle();
    if (!canal) return json({ error: 'Canal de WhatsApp selecionado não encontrado.' }, 404);
    // Bloco 3 — DISPATCHER: o canal decide o transporte (Evolution QR x Cloud API oficial).
    // Daqui para baixo o código NÃO sabe qual é: `tx` tem a mesma interface nos dois casos.
    const tx = enviadorDe(canal);
    if (!tx.ehCloud && !canal.instancia_externa) return json({ error: 'Canal de WhatsApp selecionado não encontrado.' }, 404);
    // Contenção: canal com restrição de conta no WhatsApp fica BLOQUEADO só para envio (recebimento segue).
    // Não é erro da Evolution nem altera a mecânica de envio — apenas impede novos disparos/retries.
    if (canal.envio_restrito) return json({ error: 'O número deste canal está com restrição no WhatsApp e está indisponível para envio. Selecione outro canal.', code: 'canal_restrito' }, 409);
    const instancia = (canal.instancia_externa ?? '') as string;
    console.log(`[send] corr=${corr} canalSel=${canal_id ?? '-'} canalUsado=${canal.id} inst=${instancia} de=${digits(canal.numero_conectado)?.slice(0, 6) ?? '-'}`);

    // estado real da instância — SÓ para Evolution. A Cloud API não tem sessão/QR: não há
    // "instância conectada" para consultar, e o próprio envio já devolve o erro da Meta.
    if (!tx.ehCloud) {
      let liveState: string | undefined;
      try { const st = await evolution.connectionState(instancia); liveState = st?.instance?.state; } catch { liveState = undefined; }
      if (liveState && liveState !== 'open') {
        if (canal.status_integracao !== 'desconectado') await admin.from('canais').update({ status_integracao: 'desconectado' }).eq('id', canal.id);
        return json({ error: 'O WhatsApp deste canal desconectou. Abra Integrações e reconecte (QR Code).' }, 409);
      }
      if (liveState === 'open' && canal.status_integracao !== 'conectado') await admin.from('canais').update({ status_integracao: 'conectado' }).eq('id', canal.id);
      if (!liveState && canal.status_integracao !== 'conectado') return json({ error: 'WhatsApp não está conectado.' }, 409);
    }

    // ===== Caso D: VÍNCULO MANUAL de número (conversas LID-only sem PN confirmado). =====
    // validar_numero: normaliza (sem inventar dígitos) e checa no WhatsApp (onWhatsApp). Aceita só exists=true.
    // vincular_numero: persiste o PN como identidade WhatsApp do contato (mantém o LID), via RPC auditada.
    if (action === 'validar_numero' || action === 'vincular_numero') {
      // ações de vínculo são exclusivas do fluxo de usuário (o processador nunca envia `action`).
      if (!user) return json({ error: 'Não autenticado.' }, 401);
      // A Cloud API NÃO tem equivalente do onWhatsApp: não existe como checar um número antes.
      // Em canal oficial o destino vem do wa_id do inbound, então o vínculo manual não se aplica.
      if (tx.ehCloud) return json({ error: 'Vínculo manual de número não se aplica a canal oficial (Cloud API).', code: 'NAO_SUPORTADO_CLOUD' }, 422);
      // SEGURANÇA: o backend NUNCA confia em validação do frontend. AMBAS as ações validam o número no
      // onWhatsApp server-side. 'vincular_numero' é ATÔMICA — valida e persiste na MESMA execução, usando o
      // JID canônico obtido AGORA (ignora qualquer vinc_jid/flag enviado pelo cliente).
      const convMask = String(conversa_id).slice(0, 8);
      const norm = digits(vinc_numero ?? text);
      if (!norm || norm.length < 12) {
        console.log(JSON.stringify({ stage: 'validar_e_vincular', action, conversation: convMask, provider_validation: 'formato_invalido' }));
        return json({ error: 'Informe o número com DDI + DDD (ex.: 5551999990000).', code: 'NUMERO_FORMATO' }, 422);
      }
      const mascarado = '••••' + norm.slice(-4);
      let exists = false; let jid: string | null = null;
      try {
        const chk = await evolution.whatsappNumbers(instancia, [norm]);
        const hit = (Array.isArray(chk) ? chk : []).find((h) => h?.exists === true && !!h?.jid);
        if (hit?.jid) { exists = true; jid = String(hit.jid); }
      } catch {
        console.log(JSON.stringify({ stage: 'validar_e_vincular', action, conversation: convMask, provider_validation: 'error' }));
        return json({ error: 'Não foi possível validar o número agora. Tente novamente.', code: 'VALIDACAO_INDISPONIVEL' }, 502);
      }
      console.log(JSON.stringify({ stage: 'validar_e_vincular', action, conversation: convMask, provider_validation: exists ? 'exists_true' : 'exists_false' }));
      if (!exists) return json({ error: 'Este número não tem WhatsApp ativo. Confira o DDI, o DDD e o nono dígito.', code: 'SEM_WHATSAPP' }, 422);
      // passo visual: só devolve a máscara + jid (não grava nada)
      if (action === 'validar_numero') return json({ ok: true, exists: true, numero: norm, numero_mascarado: mascarado, jid });

      // confirmação ATÔMICA: já validou exists=true acima → persiste via RPC auditada com o JID validado agora.
      const { data: rpc, error: rpcErr } = await admin.rpc('wa_vincular_numero', { p_conversa: conversa_id, p_numero: norm, p_jid: jid, p_usuario: user.id });
      if (rpcErr) {
        const m = rpcErr.message ?? '';
        const rpcRes = /pn_em_outro_contato|pn_confirmado_diferente/.test(m) ? 'conflict' : /sem_permissao/.test(m) ? 'permission' : 'error';
        console.log(JSON.stringify({ stage: 'validar_e_vincular', conversation: convMask, provider_validation: 'exists_true', rpc_result: rpcRes }));
        if (/pn_em_outro_contato/.test(m)) return json({ error: 'Este número já está vinculado a outro contato. Revise os contatos antes de continuar.', code: 'CONFLITO_OUTRO_CONTATO' }, 409);
        if (/pn_confirmado_diferente/.test(m)) return json({ error: 'Este contato já tem um número confirmado diferente. Revise antes de alterar.', code: 'CONFLITO_PN' }, 409);
        if (/sem_permissao/.test(m)) return json({ error: 'Você não tem permissão para vincular este número.', code: 'SEM_PERMISSAO' }, 403);
        if (/numero_invalido/.test(m)) return json({ error: 'Valide novamente o número no WhatsApp.', code: 'NUMERO_INVALIDO' }, 422);
        return json({ error: 'Não foi possível concluir o vínculo. Tente novamente.', code: 'VINCULO_ERRO', detalhe: m.slice(0, 120) }, 500);
      }
      console.log(JSON.stringify({ stage: 'validar_e_vincular', conversation: convMask, provider_validation: 'exists_true', rpc_result: 'success' }));
      return json({ ok: true, vinculado: true, numero_mascarado: mascarado, rpc });
    }

    // ----- destino -----
    // A IDENTIDADE WhatsApp (valor_normalizado, derivada do JID real do inbound) tem PRIORIDADE sobre o
    // telefone do CRM (contatos.telefone), que pode estar malformado/divergente. Validamos no onWhatsApp e
    // enviamos para o candidato que EXISTE — nunca para um número exists:false (que o provider recusa/ERROR).
    const { data: ct } = await admin.from('contatos').select('telefone').eq('id', conv.contato_id).maybeSingle();
    const { data: ident } = await admin.from('contato_identidades').select('valor_normalizado, valor').eq('contato_id', conv.contato_id).eq('tipo', 'whatsapp').maybeSingle();
    const tel = digits(ct?.telefone);
    const idn = digits(ident?.valor_normalizado) ?? digits(ident?.valor);
    const candidatos = [...new Set([idn, tel].filter((x): x is string => !!x))]; // identidade primeiro
    if (!candidatos.length) return json({ error: 'Esta conversa foi recebida por uma identidade protegida do WhatsApp e ainda não possui um número confirmado para resposta.', code: 'SEM_NUMERO_CONFIRMADO' }, 422);

    // BLOQUEIO DE AUTOENVIO: não enviar do número do canal para ele mesmo.
    const senderNum = digits(canal.numero_conectado);
    if (senderNum && candidatos.includes(senderNum)) {
      console.log(`[send] corr=${corr} BLOQUEADO autoenvio de=${senderNum.slice(0, 6)}`);
      return json({ error: 'Não é possível enviar uma mensagem para o mesmo número conectado.' }, 422);
    }

    // Valida no WhatsApp e escolhe o candidato que EXISTE (jid canônico). Se NENHUM existe -> 422 claro.
    let alvo = candidatos[0];
    // A validação prévia é EXCLUSIVA da Evolution (onWhatsApp). A Cloud API não expõe nada
    // equivalente: o destino é o wa_id que a própria Meta nos entregou no inbound, e um número
    // inválido só é reportado depois, no `statuses` (failed) — que o cloud-webhook já persiste.
    if (!tx.ehCloud) {
      try {
        const chk = await evolution.whatsappNumbers(instancia, candidatos);
        const arr = Array.isArray(chk) ? chk : [];
        const existe = arr.find((h) => h?.exists === true && !!h?.jid);
        if (existe?.jid) {
          alvo = digits(String(existe.jid).split('@')[0]) ?? alvo;
        } else if (arr.length && arr.every((h) => h?.exists === false)) {
          return json({ error: 'Este número não tem WhatsApp ativo. Confira o DDD e o nono dígito.' }, 422);
        }
        // resultado inconclusivo -> mantém a identidade (candidatos[0]) como destino (fail-open).
      } catch { /* fail-open: usa a identidade */ }
    }
    console.log(`[send] corr=${corr} cands=${candidatos.length} alvo=${alvo.slice(0, 6)}`);

    // QUOTED (resposta a mensagem específica): monta o contexto que a Evolution usa para citar.
    // Requer o id externo da mensagem citada + se ela é fromMe (saída) + o jid do chat (o alvo).
    const quoted = (typeof reply_to_id_ext === 'string' && reply_to_id_ext)
      ? { key: { id: reply_to_id_ext, remoteJid: `${alvo}@s.whatsapp.net`, fromMe: !!reply_to_from_me }, message: { conversation: (replyPrev?.texto ?? '').toString().slice(0, 300) } }
      : undefined;

    // ===== MÍDIA (IMAGEM, ÁUDIO e DOCUMENTO). Retry herda o tipo/arquivo da mensagem original. =====
    const ehMidiaRetry = !!retryMsg && !!retryMsg.tipo && retryMsg.tipo !== 'texto';
    if (midia_path || ehMidiaRetry) {
      const TIPOS_OK = ['imagem', 'audio', 'video', 'documento'];
      const meta = (retryMsg?.metadados ?? {}) as Record<string, unknown>;
      const path = (midia_path as string) || (meta.anexo_path as string) || '';
      const tipo = ehMidiaRetry ? String(retryMsg!.tipo) : (TIPOS_OK.includes(midia_tipo) ? midia_tipo : '');
      const mime = (midia_mime as string) || (meta.mime as string) || '';
      const nome = (midia_nome as string) || (meta.nome as string) || (tipo === 'audio' ? 'audio' : tipo === 'video' ? 'video' : tipo === 'documento' ? 'documento' : 'imagem');
      const tamanho = (midia_tamanho as number) ?? (meta.tamanho as number) ?? null;
      // áudio é nota de voz (PTT) — sem legenda. Imagem/documento podem ter legenda.
      const caption = tipo === 'audio' ? '' : sanitizeWaText((temTexto ? text.toString() : (retryMsg ? (retryMsg.conteudo ?? '') : '')));
      const nowIso = new Date().toISOString();

      if (!TIPOS_OK.includes(tipo)) return json({ error: 'Tipo de mídia ainda não suportado (apenas imagem, áudio, vídeo e documento).' }, 422);
      // ISOLAMENTO por organização: o caminho do arquivo precisa começar pelo id da org da conversa.
      if (!path || !path.startsWith(conv.organizacao_id + '/')) return json({ error: 'Arquivo de mídia inválido.' }, 422);
      // MIME/extensão compatível com o tipo (regras centralizadas)
      if (!midiaCompativel(tipo, mime, nome)) return json({ error: 'mime_incompativel' }, 422);
      // limite de tamanho
      const max = tipo === 'documento' ? MAX_DOC : MAX_IMG_AUDIO;
      if (tamanho && tamanho > max) return json({ error: 'Arquivo acima do limite.' }, 422);

      let sent: { key?: { id?: string } };
      try {
        if (tipo === 'audio') {
          // ÁUDIO base64 (Evolution 2.3.6 recusa URL remota). CAMINHO POR FORMATO:
          // - ogg / webm(opus): sendWhatsAppAudio (encoding:true -> ogg/opus) => nota de voz (PTT).
          // - mp4 / m4a / mpeg(mp3) / aac / wav (Mac/Safari etc.): sendMedia mediatype=audio => arquivo
          //   de áudio reproduzível (NÃO declaramos conversão para PTT; só trocar MIME não converte codec).
          const { data: file, error: de } = await admin.storage.from('script-midia').download(path);
          if (de || !file) return json({ error: 'Não foi possível acessar o arquivo de áudio.' }, 500);
          const bytes = new Uint8Array(await file.arrayBuffer());
          if (bytes.length === 0) return json({ error: 'Áudio vazio. Grave novamente.' }, 422);
          const b64 = toBase64(bytes);
          const mlow = (mime || '').toLowerCase();
          // MODO: gravação do painel (microfone) => SEMPRE nota de voz/PTT (nunca arquivo comum, mesmo mp4/aac
          // do Safari — a Evolution transcodifica via encoding:true; se recusar, ERRO CLARO, sem cair p/ arquivo).
          // Arquivo de áudio anexado => mídia comum (sendMedia), separado por design.
          const gravacaoPainel = origem_audio !== 'arquivo_anexado'; // padrão: gravação (fonte do incidente)
          const usaPtt = gravacaoPainel;
          try { console.log(JSON.stringify({ stage: 'audio_send', corr, origem_audio: gravacaoPainel ? 'gravacao_painel' : 'arquivo_anexado', container_real: containerReal(bytes), mime_declarado: mime, bytes: bytes.length, endpoint: usaPtt ? 'sendWhatsAppAudio(ptt)' : 'sendMedia(file)' })); } catch { /* ignore */ }
          if (usaPtt) {
            try {
              sent = await tx.sendWhatsAppAudio(alvo, b64, quoted);            // voz/PTT (encoding:true -> ogg/opus)
            } catch (e) {
              const em = String((e as Error)?.message ?? '').toLowerCase();
              // NUNCA envia gravação como arquivo comum silenciosamente: erro claro (Safari/mp4 recusado etc.).
              const msg = /format|codec|unsupported|bad request|400|invalid|decode/.test(em)
                ? 'Este navegador não gerou um formato compatível de mensagem de voz. Use o Chrome ou grave novamente.'
                : 'A conexão do WhatsApp recusou a mensagem de voz. Tente novamente.';
              return json({ error: msg, code: 'AUDIO_PTT_INCOMPATIVEL' }, 422);
            }
          } else {
            sent = await tx.sendMedia(alvo, 'audio', mime || 'audio/mpeg', b64, nome && nome !== 'audio' ? nome : 'audio.m4a', undefined, quoted); // arquivo de áudio anexado
          }
          // OBSERVABILIDADE MÍNIMA: 1 linha por correlation_id (sem hashes/RMS/conteúdo). Escritor único.
          if (audio_diag && typeof audio_diag === 'object') {
            try {
              const d = audio_diag as Record<string, unknown>;
              await admin.from('wa_audio_diag').upsert({
                correlation_id: String(d.correlation_id ?? corr), organizacao_id: conv.organizacao_id,
                blob_mime: d.blob_mime ?? mime ?? null, blob_size: d.blob_size ?? bytes.length,
                container_real: containerReal(bytes), endpoint: usaPtt ? 'sendWhatsAppAudio' : 'sendMedia', ptt: usaPtt,
                base64_len: b64.length, key_id: sent?.key?.id ?? null, http_status: 200,
              }, { onConflict: 'correlation_id' });
            } catch { /* diagnóstico best-effort — nunca afeta o envio */ }
          }
        } else {
          // IMAGEM/VÍDEO/DOCUMENTO: URL assinada CURTA (600s) — a Evolution baixa; NUNCA persistimos a URL.
          const { data: signed, error: se } = await admin.storage.from('script-midia').createSignedUrl(path, 600);
          if (se || !signed?.signedUrl) return json({ error: 'Falha ao preparar a mídia.' }, 500);
          const mediatype = tipo === 'documento' ? 'document' : tipo === 'video' ? 'video' : 'image';
          const mimeEnv = mime || (tipo === 'documento' ? 'application/octet-stream' : tipo === 'video' ? 'video/mp4' : 'image/jpeg');
          sent = await tx.sendMedia(alvo, mediatype, mimeEnv, signed.signedUrl, nome, caption || undefined, quoted);
        }
      } catch (err) {
        const m = (err as Error).message || 'Falha ao enviar a mídia.';
        console.error(`[send] corr=${corr} MIDIA(${tipo}) erro provider/storage:`, m); // técnico cru no log
        // PERSISTE como FALHA (com metadados p/ retry reusar o arquivo) — evita "pendente eterno".
        const metaFalha = { anexo_path: path, mime, tamanho, nome, ...(agendamento_id ? { agendamento_id } : {}) };
        if (retryMsg) await admin.from('mensagens').update({ status: 'falhou', erro_envio: m.slice(0, 200) }).eq('id', retryMsg.id);
        else await admin.from('mensagens').insert({ conversa_id, organizacao_id: conv.organizacao_id, direcao: 'saida', tipo, conteudo: caption || null, origem: 'atenvo', autor_id: autorId, status: 'falhou', erro_envio: m.slice(0, 200), metadados: metaFalha });
        return json({ error: traduzMidiaErro(tipo, m) }, 502);
      }
      const idExterno = sent?.key?.id ?? null;
      // carimba agendamento_id p/ idempotência (modo service) e a prévia do quoted (contexto da resposta).
      const metadados = { anexo_path: path, mime, tamanho, nome, ...(agendamento_id ? { agendamento_id } : {}), ...(replyPrev ? { quoted: replyPrev } : {}) };

      // CRITÉRIO DE ACEITE: sem key.id, a Evolution não aceitou — marca FALHA (não "enviada").
      if (!idExterno) {
        if (retryMsg) await admin.from('mensagens').update({ status: 'falhou', erro_envio: 'sem_id_externo' }).eq('id', retryMsg.id);
        else await admin.from('mensagens').insert({ conversa_id, organizacao_id: conv.organizacao_id, direcao: 'saida', tipo, conteudo: caption || null, origem: 'atenvo', autor_id: autorId, status: 'falhou', erro_envio: 'sem_id_externo', metadados });
        console.log(`[send] corr=${corr} MIDIA(${tipo}) sem id_externo -> falhou`);
        return json({ error: 'A Evolution não confirmou o envio (sem identificador de mensagem).' }, 502);
      }
      let msg;
      if (retryMsg) {
        const { data } = await admin.from('mensagens').update({ status: 'enviada', id_externo: idExterno, erro_envio: null, enviada_em: nowIso }).eq('id', retryMsg.id).select('id, conteudo, enviada_em, direcao, status').single();
        msg = data;
      } else {
        const { data } = await admin.from('mensagens').insert({ conversa_id, organizacao_id: conv.organizacao_id, direcao: 'saida', tipo, conteudo: caption || null, origem: 'atenvo', autor_id: autorId, id_externo: idExterno, status: 'enviada', enviada_em: nowIso, metadados, ...respostaCols }).select('id, conteudo, enviada_em, direcao, status').single();
        msg = data;
      }
      await admin.from('conversas').update({ ultima_interacao_em: nowIso, ultimo_canal_id: canal.id, ultimo_numero: canal.numero_conectado ?? null, ultimo_provider: canal.provider ?? 'whatsapp', ultima_msg_canal_em: nowIso }).eq('id', conversa_id);
      return json({ ok: true, mensagem: msg });
    }

    // ----- #4 ASSINATURA: aplica *Nome:*\n; guarda anti-dupla-assinatura em retentativa. -----
    // RETRY: usa o corpo já assinado/persistido da mensagem original (não reassina, não duplica).
    const raw = retryMsg ? (retryMsg.texto_original ?? retryMsg.conteudo ?? text.toString()) : text.toString();
    const assinatura = retryMsg ? (retryMsg.assinatura_nome ?? '').toString().trim() : (assinatura_nome ?? '').toString().trim();
    const prefixo = assinatura ? `*${assinatura}:*\n` : '';
    const jaAssinado = assinatura ? raw.startsWith(`*${assinatura}:*`) : false;
    const corpoBruto = retryMsg ? (retryMsg.conteudo ?? raw) : ((assinatura && !jaAssinado) ? prefixo + raw : raw);
    // NORMALIZA o texto (NBSP/zero-width/soft-hyphen/controles/CRLF) — preserva acentos/linhas; não corta.
    const corpoEnviado = sanitizeWaText(corpoBruto);
    const rawLimpo = sanitizeWaText(raw);
    // Limite real do provider: não corta silenciosamente; acima do limite, erro claro (não dividir aqui).
    if (new TextEncoder().encode(corpoEnviado).length > WA_TEXT_MAX_BYTES) {
      return json({ error: 'Mensagem muito longa para um único envio do WhatsApp. Reduza o texto e tente novamente.' }, 422);
    }

    // envia (texto já assinado e normalizado)
    let sent: { key?: { id?: string } };
    try {
      sent = await tx.sendText(alvo, corpoEnviado, quoted);
    } catch (err) {
      const emsg = (err as Error).message || 'Falha ao enviar pela Evolution.';
      console.error(`[send] corr=${corr} TEXTO erro provider:`, emsg); // técnico cru no log
      // PERSISTE como FALHA: nunca deixa o envio sem registro (evita "pendente eterno" no app). Gera linha
      // com id p/ Tentar novamente (mesma linha, sem duplicar) e Remover; sobrevive a reload.
      if (retryMsg) {
        await admin.from('mensagens').update({ status: 'falhou', erro_envio: emsg.slice(0, 200) }).eq('id', retryMsg.id);
      } else {
        await admin.from('mensagens').insert({
          conversa_id, organizacao_id: conv.organizacao_id, direcao: 'saida', tipo: 'texto',
          conteudo: corpoEnviado, texto_original: rawLimpo, assinatura_nome: assinatura || null, origem: 'atenvo',
          autor_id: autorId, status: 'falhou', erro_envio: emsg.slice(0, 200),
        });
      }
      const m = emsg.toLowerCase();
      const amigavel = /not |connect|close/.test(m) ? 'O WhatsApp deste canal desconectou. Reconecte em Integrações.'
        : /bad request|400|invalid|unsupported/.test(m) ? 'Não foi possível enviar este texto. Tente reescrever a mensagem.'
        : 'O WhatsApp não confirmou o envio. Tente novamente.';
      return json({ error: amigavel }, 502);
    }
    const idExterno = sent?.key?.id ?? null;
    const nowIso = new Date().toISOString();

    // CRITÉRIO DE ACEITE: sem identificador externo válido, a Evolution NÃO aceitou o envio.
    // Persistimos como FALHA e devolvemos erro — um corpo 2xx sem key.id não é sucesso.
    if (!idExterno) {
      if (retryMsg) {
        await admin.from('mensagens').update({ status: 'falhou', erro_envio: 'sem_id_externo' }).eq('id', retryMsg.id);
      } else {
        await admin.from('mensagens').insert({
          conversa_id, organizacao_id: conv.organizacao_id, direcao: 'saida', tipo: 'texto',
          conteudo: corpoEnviado, texto_original: rawLimpo, assinatura_nome: assinatura || null, origem: 'atenvo',
          autor_id: autorId, status: 'falhou', erro_envio: 'sem_id_externo',
        });
      }
      console.log(`[send] corr=${corr} SEM id_externo -> falhou`);
      return json({ error: 'A Evolution não confirmou o envio (sem identificador de mensagem).' }, 502);
    }

    // ENVIADA AO PROVEDOR: key.id confirma que a Evolution aceitou/enfileirou o envio (✓).
    // O webhook (messages.update) avança p/ entregue (✓✓) e lida; ERROR volta p/ falhou.
    // RETRY: reaproveita a MESMA linha (sem duplicar). Envio novo: insere.
    let msg;
    if (retryMsg) {
      const { data } = await admin.from('mensagens').update({
        status: 'enviada', id_externo: idExterno, erro_envio: null, enviada_em: nowIso,
      }).eq('id', retryMsg.id).select('id, conteudo, enviada_em, direcao, status').single();
      msg = data;
    } else {
      // metadados: idempotência do agendamento (modo service) + prévia do quoted (resposta). Só grava se houver algo.
      const metaTexto = { ...(agendamento_id ? { agendamento_id } : {}), ...(replyPrev ? { quoted: replyPrev } : {}) };
      const { data } = await admin.from('mensagens').insert({
        conversa_id, organizacao_id: conv.organizacao_id, direcao: 'saida', tipo: 'texto',
        conteudo: corpoEnviado, texto_original: rawLimpo, assinatura_nome: assinatura || null, origem: 'atenvo',
        autor_id: autorId, id_externo: idExterno, status: 'enviada', enviada_em: nowIso,
        ...(Object.keys(metaTexto).length ? { metadados: metaTexto } : {}),
        ...respostaCols,
      }).select('id, conteudo, enviada_em, direcao, status').single();
      msg = data;
    }

    // #6 após envio aceito: registra último canal/número/provider usado nesta conversa (mantém histórico das mensagens).
    await admin.from('conversas').update({
      ultima_interacao_em: nowIso,
      ultimo_canal_id: canal.id, ultimo_numero: canal.numero_conectado ?? null,
      ultimo_provider: canal.provider ?? 'whatsapp', ultima_msg_canal_em: nowIso,
    }).eq('id', conversa_id);
    return json({ ok: true, mensagem: msg });
  } catch (e) {
    return json({ error: (e as Error).message ?? 'Erro inesperado.' }, 500);
  }
});
