// evolution-send — envia texto/IMAGEM/ÁUDIO/DOCUMENTO e persiste a saída.
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

const digits = (s?: string | null): string | null => ((s ?? '').replace(/[^0-9]/g, '') || null);
const WA_TEXT_MAX_BYTES = 65000; // limite prático de um único envio de texto no WhatsApp

// base64 (sem prefixo data URI) em blocos — seguro para arquivos grandes.
function toBase64(bytes: Uint8Array): string {
  let bin = ''; const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(bin);
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
  if (tipo === 'documento') { const ext = (nome.split('.').pop() || '').toLowerCase(); return DOC_MIMES.includes(mime) || DOC_EXTS.includes(ext); }
  return false;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    if (!evolutionConfigured()) return json({ error: 'Evolution não configurada.' }, 503);
    const user = await getUser(req);
    if (!user) return json({ error: 'Não autenticado.' }, 401);

    const { conversa_id, text, canal_id, assinatura_nome, retry_mensagem_id, midia_path, midia_tipo, midia_mime, midia_nome, midia_tamanho } = await req.json().catch(() => ({}));
    const temTexto = !!text?.toString().trim();
    if (!conversa_id || (!temTexto && !midia_path && !retry_mensagem_id)) return json({ error: 'conversa_id e conteúdo (texto ou mídia) são obrigatórios.' }, 400);
    const corr = (globalThis.crypto?.randomUUID?.() ?? String(Date.now())).slice(0, 8);

    const admin = adminClient();
    const { data: conv } = await admin.from('conversas').select('id, organizacao_id, contato_id, canal_id').eq('id', conversa_id).maybeSingle();
    if (!conv) return json({ error: 'Conversa não encontrada.' }, 404);

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

    const { data: mem } = await admin.from('organizacao_usuarios').select('status').eq('organizacao_id', conv.organizacao_id).eq('usuario_id', user.id).maybeSingle();
    if (!mem || mem.status !== 'ativo') return json({ error: 'Sem acesso a esta organização.' }, 403);

    // CANAL: usa EXATAMENTE o canal escolhido em "Responder por" (canal_id). Sem fallback implícito ao canal da conversa.
    const canalId = (canal_id as string) || (conv.canal_id as string);
    const { data: canal } = await admin.from('canais').select('id, instancia_externa, status_integracao, numero_conectado, provider').eq('id', canalId).eq('organizacao_id', conv.organizacao_id).maybeSingle();
    if (!canal?.instancia_externa) return json({ error: 'Canal de WhatsApp selecionado não encontrado.' }, 404);
    const instancia = canal.instancia_externa as string;
    console.log(`[send] corr=${corr} canalSel=${canal_id ?? '-'} canalUsado=${canal.id} inst=${instancia} de=${digits(canal.numero_conectado)?.slice(0, 6) ?? '-'}`);

    // estado real da instância
    let liveState: string | undefined;
    try { const st = await evolution.connectionState(instancia); liveState = st?.instance?.state; } catch { liveState = undefined; }
    if (liveState && liveState !== 'open') {
      if (canal.status_integracao !== 'desconectado') await admin.from('canais').update({ status_integracao: 'desconectado' }).eq('id', canal.id);
      return json({ error: 'O WhatsApp deste canal desconectou. Abra Integrações e reconecte (QR Code).' }, 409);
    }
    if (liveState === 'open' && canal.status_integracao !== 'conectado') await admin.from('canais').update({ status_integracao: 'conectado' }).eq('id', canal.id);
    if (!liveState && canal.status_integracao !== 'conectado') return json({ error: 'WhatsApp não está conectado.' }, 409);

    // ----- destino: número EXATO salvo, sem remover o 9. -----
    const { data: ct } = await admin.from('contatos').select('telefone').eq('id', conv.contato_id).maybeSingle();
    const { data: ident } = await admin.from('contato_identidades').select('valor_normalizado, valor').eq('contato_id', conv.contato_id).eq('tipo', 'whatsapp').maybeSingle();
    const tel = digits(ct?.telefone);
    const idn = digits(ident?.valor_normalizado) ?? digits(ident?.valor);
    const base = (tel && idn && tel !== idn) ? tel : (idn ?? tel);
    if (!base) return json({ error: 'Contato sem número de WhatsApp.' }, 422);

    // BLOQUEIO DE AUTOENVIO: não enviar do número do canal para ele mesmo.
    const senderNum = digits(canal.numero_conectado);
    if (senderNum && senderNum === base) {
      console.log(`[send] corr=${corr} BLOQUEADO autoenvio de=${senderNum.slice(0, 6)} para=${base.slice(0, 6)}`);
      return json({ error: 'Não é possível enviar uma mensagem para o mesmo número conectado.' }, 422);
    }

    // valida existência; não troca por variante exceto se o EXATO não existir.
    let alvo = base;
    try {
      const chk = await evolution.whatsappNumbers(instancia, [base]);
      const arr = Array.isArray(chk) ? chk : [];
      const hit = arr[0];
      if (hit && hit.exists === false) {
        const altJid = hit.jid ? digits(String(hit.jid).split('@')[0]) : null;
        if (altJid) alvo = altJid; else return json({ error: 'Este número não tem WhatsApp ativo. Confira o DDD e o nono dígito.' }, 422);
      }
    } catch { /* fail-open: usa base */ }
    console.log(`[send] corr=${corr} para=${base.slice(0, 6)} alvo=${alvo.slice(0, 6)}`);

    // ===== MÍDIA (IMAGEM, ÁUDIO e DOCUMENTO). Retry herda o tipo/arquivo da mensagem original. =====
    const ehMidiaRetry = !!retryMsg && !!retryMsg.tipo && retryMsg.tipo !== 'texto';
    if (midia_path || ehMidiaRetry) {
      const TIPOS_OK = ['imagem', 'audio', 'documento'];
      const meta = (retryMsg?.metadados ?? {}) as Record<string, unknown>;
      const path = (midia_path as string) || (meta.anexo_path as string) || '';
      const tipo = ehMidiaRetry ? String(retryMsg!.tipo) : (TIPOS_OK.includes(midia_tipo) ? midia_tipo : '');
      const mime = (midia_mime as string) || (meta.mime as string) || '';
      const nome = (midia_nome as string) || (meta.nome as string) || (tipo === 'audio' ? 'audio' : tipo === 'documento' ? 'documento' : 'imagem');
      const tamanho = (midia_tamanho as number) ?? (meta.tamanho as number) ?? null;
      // áudio é nota de voz (PTT) — sem legenda. Imagem/documento podem ter legenda.
      const caption = tipo === 'audio' ? '' : sanitizeWaText((temTexto ? text.toString() : (retryMsg ? (retryMsg.conteudo ?? '') : '')));
      const nowIso = new Date().toISOString();

      if (!TIPOS_OK.includes(tipo)) return json({ error: 'Tipo de mídia ainda não suportado (apenas imagem, áudio e documento).' }, 422);
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
          // ÁUDIO: Evolution 2.3.6 recusa URL remota no sendWhatsAppAudio -> enviar BASE64 do arquivo.
          const { data: file, error: de } = await admin.storage.from('script-midia').download(path);
          if (de || !file) return json({ error: 'Não foi possível acessar o arquivo de áudio.' }, 500);
          const b64 = toBase64(new Uint8Array(await file.arrayBuffer()));
          sent = await evolution.sendWhatsAppAudio(instancia, alvo, b64);                       // nota de voz (PTT); encoding:true converte p/ ogg/opus
        } else {
          // IMAGEM/DOCUMENTO: URL assinada CURTA (600s) — a Evolution baixa; NUNCA persistimos a URL.
          const { data: signed, error: se } = await admin.storage.from('script-midia').createSignedUrl(path, 600);
          if (se || !signed?.signedUrl) return json({ error: 'Falha ao preparar a mídia.' }, 500);
          sent = tipo === 'documento'
            ? await evolution.sendMedia(instancia, alvo, 'document', mime || 'application/octet-stream', signed.signedUrl, nome, caption || undefined)
            : await evolution.sendMedia(instancia, alvo, 'image', mime, signed.signedUrl, nome, caption || undefined);
        }
      } catch (err) {
        const m = (err as Error).message || 'Falha ao enviar a mídia.';
        console.error(`[send] corr=${corr} MIDIA(${tipo}) erro provider/storage:`, m); // técnico cru no log
        return json({ error: traduzMidiaErro(tipo, m) }, 502);
      }
      const idExterno = sent?.key?.id ?? null;
      const metadados = { anexo_path: path, mime, tamanho, nome };

      // CRITÉRIO DE ACEITE: sem key.id, a Evolution não aceitou — marca FALHA (não "enviada").
      if (!idExterno) {
        if (retryMsg) await admin.from('mensagens').update({ status: 'falhou', erro_envio: 'sem_id_externo' }).eq('id', retryMsg.id);
        else await admin.from('mensagens').insert({ conversa_id, organizacao_id: conv.organizacao_id, direcao: 'saida', tipo, conteudo: caption || null, origem: 'atenvo', autor_id: user.id, status: 'falhou', erro_envio: 'sem_id_externo', metadados });
        console.log(`[send] corr=${corr} MIDIA(${tipo}) sem id_externo -> falhou`);
        return json({ error: 'A Evolution não confirmou o envio (sem identificador de mensagem).' }, 502);
      }
      let msg;
      if (retryMsg) {
        const { data } = await admin.from('mensagens').update({ status: 'enviada', id_externo: idExterno, erro_envio: null, enviada_em: nowIso }).eq('id', retryMsg.id).select('id, conteudo, enviada_em, direcao, status').single();
        msg = data;
      } else {
        const { data } = await admin.from('mensagens').insert({ conversa_id, organizacao_id: conv.organizacao_id, direcao: 'saida', tipo, conteudo: caption || null, origem: 'atenvo', autor_id: user.id, id_externo: idExterno, status: 'enviada', enviada_em: nowIso, metadados }).select('id, conteudo, enviada_em, direcao, status').single();
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
      sent = await evolution.sendText(instancia, alvo, corpoEnviado);
    } catch (err) {
      const msg = (err as Error).message || 'Falha ao enviar pela Evolution.';
      console.error(`[send] corr=${corr} TEXTO erro provider:`, msg); // técnico cru no log
      const m = msg.toLowerCase();
      const amigavel = /not |connect|close/.test(m) ? 'O WhatsApp deste canal desconectou. Reconecte em Integrações.'
        : /bad request|400|invalid|unsupported/.test(m) ? 'Não foi possível enviar este texto. Tente reescrever a mensagem.'
        : msg;
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
          autor_id: user.id, status: 'falhou', erro_envio: 'sem_id_externo',
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
      const { data } = await admin.from('mensagens').insert({
        conversa_id, organizacao_id: conv.organizacao_id, direcao: 'saida', tipo: 'texto',
        conteudo: corpoEnviado, texto_original: rawLimpo, assinatura_nome: assinatura || null, origem: 'atenvo',
        autor_id: user.id, id_externo: idExterno, status: 'enviada', enviada_em: nowIso,
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
