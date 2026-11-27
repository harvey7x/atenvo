// reviza-wa-enviar (v11: arquivo restrito ao número) (v10: conversa única por cliente + número validado no WhatsApp) — envia mensagem pela Evolution (verify_jwt=true): texto,
// imagem, vídeo, documento (com legenda) e áudio PTT. Qualquer operador ATIVO
// envia — mas cada atendente só pelo PRÓPRIO número (gestor/admin por qualquer).
// Mídia: o front sobe pro bucket wa-midia e manda o midia_path; aqui vira uma
// URL assinada curta que a Evolution baixa.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { sendText, sendMedia, sendWhatsAppAudio, evolutionConfigured, quotedDe, markMessagesAsRead, deleteMessageForEveryone, braNumero, resolverNumero, type QuotedWA } from './evolution.ts';

/** candidatos pro WhatsApp (com e sem o 9), já com 55 — igual ao motor (regua.ts) */
function candidatosTel(t: string): string[] {
  let d = String(t ?? '').replace(/\D/g, '').replace(/^0+/, '');
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2);
  if (d.length === 11) return [`55${d}`, `55${d.slice(0, 2)}${d.slice(3)}`];
  if (d.length === 10) return [`55${d}`, `55${d.slice(0, 2)}9${d.slice(2)}`];
  return d ? [d] : [];
}

const MIME_DE: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif',
  mp4: 'video/mp4', '3gp': 'video/3gpp', mov: 'video/quicktime',
  ogg: 'audio/ogg', mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', webm: 'audio/webm',
  pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv', txt: 'text/plain', zip: 'application/zip',
};
const mimeDoNome = (n: string) => MIME_DE[(n.split('.').pop() ?? '').toLowerCase()] ?? 'application/octet-stream';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const soDigitos = (s: string) => (s || '').replace(/\D/g, '');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    if (!evolutionConfigured()) return json({ error: 'Evolution não configurada.' }, 503);

    const url = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const authHeader = req.headers.get('Authorization') ?? '';

    const asUser = createClient(url, anon, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });
    const { data: u } = await asUser.auth.getUser();
    const uid = u?.user?.id;
    if (!uid) return json({ error: 'não autenticado' }, 401);
    const { data: perfil } = await asUser.from('profiles').select('papel, ativo').eq('id', uid).maybeSingle();
    if (!perfil || !perfil.ativo) return json({ error: 'sem permissão' }, 403);

    const body = await req.json().catch(() => ({}));
    const admin0 = createClient(url, service, { auth: { persistSession: false } });
    const gestor0 = ['gestor', 'admin'].includes(perfil.papel);

    // ---- ação LER: marca as mensagens do cliente como lidas (visto azul no celular dele) ----
    if (body.acao === 'ler') {
      const convId = String(body.conversa_id ?? '');
      if (!convId) return json({ error: 'conversa_id ausente' }, 400);
      const { data: cv } = await admin0.from('wa_conversas').select('id, canal_id, telefone').eq('id', convId).maybeSingle();
      if (!cv) return json({ error: 'conversa não encontrada' }, 404);
      const { data: cn } = await admin0.from('wa_canais').select('instancia, estado, dono_id').eq('id', cv.canal_id).maybeSingle();
      if (!cn || cn.estado !== 'conectado') return json({ ok: false, erro: 'canal não conectado' });
      if (!gestor0 && cn.dono_id !== uid) return json({ error: 'este WhatsApp é de outro atendente' }, 403);
      const { data: naoLidas } = await admin0.from('wa_mensagens')
        .select('wa_id').eq('conversa_id', convId).eq('direcao', 'entrada').not('wa_id', 'is', null)
        .order('created_at', { ascending: false }).limit(30);
      const jid = `${braNumero(cv.telefone)}@s.whatsapp.net`;
      try {
        await markMessagesAsRead(cn.instancia, (naoLidas ?? []).map((m) => ({ remoteJid: jid, fromMe: false, id: String(m.wa_id) })));
      } catch (e) { return json({ ok: false, erro: String((e as Error)?.message ?? e) }); }
      return json({ ok: true, lidas: (naoLidas ?? []).length });
    }

    // ---- ação APAGAR: apaga uma mensagem NOSSA pra todos ----
    if (body.acao === 'apagar') {
      const msgId = String(body.mensagem_id ?? '');
      if (!msgId) return json({ error: 'mensagem_id ausente' }, 400);
      const { data: msg } = await admin0.from('wa_mensagens').select('id, canal_id, conversa_id, direcao, wa_id').eq('id', msgId).maybeSingle();
      if (!msg) return json({ error: 'mensagem não encontrada' }, 404);
      if (msg.direcao !== 'saida' || !msg.wa_id) return json({ error: 'só dá pra apagar mensagens enviadas por vocês' }, 400);
      const { data: cn } = await admin0.from('wa_canais').select('instancia, estado, dono_id').eq('id', msg.canal_id).maybeSingle();
      if (!cn || cn.estado !== 'conectado') return json({ error: 'canal não conectado' }, 409);
      if (!gestor0 && cn.dono_id !== uid) return json({ error: 'este WhatsApp é de outro atendente' }, 403);
      const { data: cv } = await admin0.from('wa_conversas').select('telefone').eq('id', msg.conversa_id).maybeSingle();
      if (!cv) return json({ error: 'conversa não encontrada' }, 404);
      try { await deleteMessageForEveryone(cn.instancia, cv.telefone, String(msg.wa_id)); }
      catch (e) { return json({ error: String((e as Error)?.message ?? e) }, 502); }
      await admin0.from('wa_mensagens').update({ apagada: true }).eq('id', msg.id);
      return json({ ok: true });
    }

    const texto = String(body.texto ?? '').trim();
    const midiaPath = typeof body.midia_path === 'string' && body.midia_path ? String(body.midia_path) : null;
    const midiaTipo = ['imagem', 'video', 'audio', 'documento'].includes(body.midia_tipo) ? body.midia_tipo as 'imagem' | 'video' | 'audio' | 'documento' : null;
    const midiaNome = String(body.midia_nome ?? '').slice(0, 120) || 'arquivo';
    if (!texto && !midiaPath) return json({ error: 'texto vazio' }, 400);
    if (midiaPath && !midiaTipo) return json({ error: 'tipo da mídia ausente' }, 400);

    const admin = createClient(url, service, { auth: { persistSession: false } });

    // resolve conversa/telefone/canal
    let conversaId: string | null = body.conversa_id ?? null;
    let telefone = soDigitos(String(body.telefone ?? ''));
    let canalId: string | null = null;

    if (conversaId) {
      const { data: c } = await admin.from('wa_conversas').select('id, canal_id, telefone').eq('id', conversaId).maybeSingle();
      if (!c) return json({ error: 'conversa não encontrada' }, 404);
      canalId = c.canal_id; telefone = c.telefone;
    }
    if (!telefone) return json({ error: 'informe telefone ou conversa_id' }, 400);

    // canal conectado (o da conversa; sem conversa, o canal DO PRÓPRIO atendente — gestor usa o primeiro)
    const gestor = ['gestor', 'admin'].includes(perfil.papel);
    const { data: canal } = canalId
      ? await admin.from('wa_canais').select('id, instancia, estado, dono_id').eq('id', canalId).maybeSingle()
      : gestor
        ? await admin.from('wa_canais').select('id, instancia, estado, dono_id').eq('estado', 'conectado').order('created_at').limit(1).maybeSingle()
        : await admin.from('wa_canais').select('id, instancia, estado, dono_id').eq('estado', 'conectado').eq('dono_id', uid).limit(1).maybeSingle();
    if (!canal) return json({ error: 'nenhum WhatsApp conectado' }, 409);
    if (canal.estado !== 'conectado') return json({ error: 'WhatsApp não está conectado' }, 409);
    // privacidade: cada atendente só envia pelo PRÓPRIO número; gestor/admin por qualquer um
    if (!gestor && canal.dono_id !== uid) return json({ error: 'este WhatsApp é de outro atendente' }, 403);
    canalId = canal.id;
    // arquivo só da pasta de saída ou recebido POR ESTE número (não reenvia mídia de outro atendente)
    if (midiaPath && !(midiaPath.startsWith('saida/') || midiaPath.startsWith(`entrada/${canalId}/`))) {
      return json({ error: 'arquivo não permitido para este número' }, 403);
    }

    // garante a conversa ÚNICA do cliente (canal + chave DDD+8), com o número REAL do
    // WhatsApp (com/sem o 9) — a resposta dele cai nesta mesma conversa
    if (!conversaId) {
      let jid: string | null = null;
      try { jid = await resolverNumero(canal.instancia, candidatosTel(telefone)); }
      catch { return json({ error: 'Não deu pra validar o número agora. Tente de novo em instantes.' }, 502); }
      if (!jid) return json({ error: 'Este número não tem WhatsApp — confira o DDD e o nono dígito.' }, 422);
      telefone = jid;
      const { data: cUp } = await admin.from('wa_conversas')
        .upsert({ canal_id: canalId, telefone }, { onConflict: 'canal_id,chave', ignoreDuplicates: false })
        .select('id').single();
      conversaId = cUp?.id ?? null;
    }
    if (!conversaId) return json({ error: 'falha ao abrir conversa' }, 500);

    // citação (responder): monta o contexto a partir da mensagem local respondida
    const respostaA = typeof body.resposta_a === 'string' && body.resposta_a ? String(body.resposta_a) : null;
    let quoted: QuotedWA | undefined;
    if (respostaA) {
      const { data: orig } = await admin.from('wa_mensagens').select('wa_id, direcao, conteudo').eq('id', respostaA).maybeSingle();
      if (orig?.wa_id) quoted = quotedDe(telefone, String(orig.wa_id), orig.direcao === 'saida', String(orig.conteudo ?? ''));
    }

    // envia pela Evolution (texto e/ou mídia; áudio não tem legenda — texto sai antes, separado)
    const tipoMsg = midiaPath ? midiaTipo! : 'texto';
    let waId: string | null = null;
    try {
      if (midiaPath) {
        const { data: assinada, error: eUrl } = await admin.storage.from('wa-midia').createSignedUrl(midiaPath, 600);
        if (eUrl || !assinada?.signedUrl) throw new Error('não achei a mídia no bucket: ' + (eUrl?.message ?? midiaPath));
        if (midiaTipo === 'audio') {
          if (texto) {
            const rt = await sendText(canal.instancia, telefone, texto, quoted);
            await admin.from('wa_mensagens').insert({
              conversa_id: conversaId, canal_id: canalId, direcao: 'saida', tipo: 'texto',
              conteudo: texto, wa_id: rt.id, status: 'enviada', autor_id: uid,
            });
          }
          waId = (await sendWhatsAppAudio(canal.instancia, telefone, assinada.signedUrl, quoted)).id;
        } else {
          const mediatype = midiaTipo === 'imagem' ? 'image' : midiaTipo === 'video' ? 'video' : 'document';
          waId = (await sendMedia(canal.instancia, telefone, mediatype, mimeDoNome(midiaNome), assinada.signedUrl, midiaNome, texto || undefined, quoted)).id;
        }
      } else {
        waId = (await sendText(canal.instancia, telefone, texto, quoted)).id;
      }
    } catch (e) {
      await admin.from('wa_mensagens').insert({
        conversa_id: conversaId, canal_id: canalId, direcao: 'saida', tipo: tipoMsg,
        conteudo: texto || midiaNome, midia_path: midiaPath, status: 'erro', autor_id: uid, erro: String((e as Error)?.message ?? e),
      });
      return json({ error: String((e as Error)?.message ?? e) }, 502);
    }

    const { data: msg, error: insErr } = await admin.from('wa_mensagens').insert({
      conversa_id: conversaId, canal_id: canalId, direcao: 'saida', tipo: tipoMsg,
      conteudo: midiaPath ? (midiaTipo === 'audio' ? null : texto || midiaNome) : texto,
      midia_path: midiaPath, resposta_a: respostaA, wa_id: waId, status: 'enviada', autor_id: uid,
    }).select('id').single();
    if (insErr) return json({ ok: true, aviso: 'enviado, mas não registrado: ' + insErr.message });

    return json({ ok: true, conversa_id: conversaId, mensagem_id: msg?.id, wa_id: waId });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
