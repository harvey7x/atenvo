// contato-foto — a FOTO REAL do cliente no Atendimento (dono 24/11: "quero que apareça as fotos reais dos clientes lá no Reviza").
// A foto de perfil do WhatsApp vem do servidor de conexão (Evolution: chat/fetchProfilePictureUrl, o mesmo número conectado pelo QR),
// é baixada e guardada no depósito FECHADO contato-fotos (<org>/<contato>); contatos.foto_url recebe um link assinado (1 ano) e
// contatos.foto_sync_em a hora. Sem foto (o cliente esconde ou não tem) = foto_url vazio, as iniciais ficam na tela.
//
// Dois jeitos de chamar:
//  · pela TELA (login da pessoa), ao abrir a conversa: { contato_id } — só busca se nunca buscou ou tem mais de 7 dias.
//    A pessoa só consegue pedir a foto de um contato que ela VÊ (a leitura passa pelas regras de acesso dela).
//  · pelo AGENDADOR (cabeçalho x-fotos-secret == webhook_config.fotos), a cada minuto: { lote: true } — até 8 contatos,
//    conversas mais recentes primeiro, um a cada ~6 s (ritmo calmo; nada de varrer milhares de números de uma vez).
//    Se o servidor do WhatsApp falhar, para o lote e tenta de novo no minuto seguinte, sem marcar ninguém.
// Deploy --no-verify-jwt: o agendador não tem login; a tela é conferida aqui dentro (getUser + regras de acesso).
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const EVO = (Deno.env.get('EVOLUTION_API_URL') ?? '').replace(/\/+$/, '');
const EVO_KEY = Deno.env.get('EVOLUTION_API_KEY') ?? '';

const BUCKET = 'contato-fotos';
const LINK_VALIDADE = 60 * 60 * 24 * 365;       // 1 ano
const SETE_DIAS = 7 * 24 * 60 * 60 * 1000;
const LOTE = 8;
const PAUSA_MS = 6000;
const TETO_BYTES = 2 * 1024 * 1024;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-fotos-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

// comparação de segredo em tempo constante
function seguroIgual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a); const eb = new TextEncoder().encode(b);
  let d = ea.length ^ eb.length;
  for (let i = 0; i < Math.max(ea.length, eb.length); i++) d |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return d === 0;
}

type Alvo = { contato_id: string; organizacao_id: string; numero: string; instancia: string; foto_url: string | null; foto_sync_em: string | null };
type Busca = { tipo: 'foto'; url: string } | { tipo: 'sem' } | { tipo: 'falha'; motivo: string };

/** Pergunta ao servidor do WhatsApp a foto de perfil do número. 400 = número inválido / sem WhatsApp (= sem foto). */
async function perguntarFoto(instancia: string, numero: string): Promise<Busca> {
  try {
    const res = await fetch(`${EVO}/chat/fetchProfilePictureUrl/${encodeURIComponent(instancia)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', apikey: EVO_KEY },
      body: JSON.stringify({ number: numero }), signal: AbortSignal.timeout(15000),
    });
    const txt = await res.text();
    // 5xx, chave errada ou o número NOSSO não existe mais lá (404) = falha nossa, não do cliente: não marca ninguém
    if (res.status >= 500 || [401, 403, 404].includes(res.status)) return { tipo: 'falha', motivo: `servidor do WhatsApp respondeu ${res.status}` };
    if (!res.ok) return { tipo: 'sem' };
    let data: { profilePictureUrl?: string | null } | null = null;
    try { data = txt ? JSON.parse(txt) : null; } catch { data = null; }
    const url = data?.profilePictureUrl;
    return typeof url === 'string' && /^https:\/\//.test(url) ? { tipo: 'foto', url } : { tipo: 'sem' };
  } catch (e) {
    return { tipo: 'falha', motivo: (e as Error)?.message ?? 'sem resposta' };
  }
}

/** Busca, guarda e anota a foto de um contato. Devolve o link novo (null = sem foto) ou 'falha'. */
async function sincronizar(admin: SupabaseClient, a: Alvo): Promise<{ foto_url: string | null } | { falha: string }> {
  const r = await perguntarFoto(a.instancia, a.numero);
  if (r.tipo === 'falha') return { falha: r.motivo };
  const agora = new Date().toISOString();
  const caminho = `${a.organizacao_id}/${a.contato_id}`;
  if (r.tipo === 'sem') {
    await admin.storage.from(BUCKET).remove([caminho]).catch(() => {});
    await admin.from('contatos').update({ foto_url: null, foto_sync_em: agora }).eq('id', a.contato_id);
    return { foto_url: null };
  }
  let link: string | null = null;
  try {
    const img = await fetch(r.url, { signal: AbortSignal.timeout(15000) });
    const tipo = (img.headers.get('content-type') ?? 'image/jpeg').split(';')[0].trim();
    if (img.ok && /^image\/(jpeg|png|webp)$/.test(tipo)) {
      const buf = new Uint8Array(await img.arrayBuffer());
      if (buf.byteLength > 0 && buf.byteLength <= TETO_BYTES) {
        const up = await admin.storage.from(BUCKET).upload(caminho, buf, { contentType: tipo, upsert: true });
        if (!up.error) link = (await admin.storage.from(BUCKET).createSignedUrl(caminho, LINK_VALIDADE)).data?.signedUrl ?? null;
      }
    }
  } catch { link = null; }
  // não conseguiu baixar agora: mantém a foto que já tinha e tenta de novo no próximo ciclo (não marca a hora)
  if (!link) return { foto_url: a.foto_url };
  await admin.from('contatos').update({ foto_url: link, foto_sync_em: agora }).eq('id', a.contato_id);
  return { foto_url: link };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);
  try {
    if (!EVO || !EVO_KEY) return json({ error: 'Servidor do WhatsApp não configurado.' }, 503);
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
    const body = await req.json().catch(() => ({})) as { lote?: boolean; contato_id?: string; forcar?: boolean };

    // ---- agendador: a fila, aos poucos ----
    const segredo = req.headers.get('x-fotos-secret');
    if (segredo !== null) {
      const { data: wc } = await admin.from('webhook_config').select('secret').eq('chave', 'fotos').maybeSingle();
      if (!wc?.secret || !seguroIgual(segredo, wc.secret as string)) return json({ error: 'unauthorized' }, 401);
      const { data: alvos, error } = await admin.rpc('atd_fotos_alvos', { p_contato: null, p_limite: LOTE });
      if (error) return json({ error: error.message }, 500);
      let comFoto = 0; let semFoto = 0; let parou: string | null = null;
      for (const [i, a] of ((alvos ?? []) as Alvo[]).entries()) {
        if (i > 0) await dormir(PAUSA_MS);
        const r = await sincronizar(admin, a);
        if ('falha' in r) { parou = r.falha; break; }
        if (r.foto_url) comFoto++; else semFoto++;
      }
      return json({ ok: true, com_foto: comFoto, sem_foto: semFoto, parou });
    }

    // ---- tela: um contato, com o login de quem pediu ----
    const contatoId = String(body.contato_id ?? '');
    if (!/^[0-9a-f-]{36}$/i.test(contatoId)) return json({ error: 'Informe o contato.' }, 400);
    const usuario = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } }, auth: { persistSession: false },
    });
    const { data: quem } = await usuario.auth.getUser();
    if (!quem?.user) return json({ error: 'Faça login de novo.' }, 401);
    const { data: visivel } = await usuario.from('contatos').select('id').eq('id', contatoId).maybeSingle();
    if (!visivel) return json({ error: 'Contato não encontrado.' }, 404);

    const { data: alvos, error } = await admin.rpc('atd_fotos_alvos', { p_contato: contatoId, p_limite: 1 });
    if (error) return json({ error: error.message }, 500);
    const a = ((alvos ?? []) as Alvo[])[0];
    if (!a) {
      const { data: ct } = await admin.from('contatos').select('foto_url').eq('id', contatoId).maybeSingle();
      return json({ ok: true, foto_url: ct?.foto_url ?? null, motivo: 'sem número de WhatsApp ou nenhum número nosso conectado' });
    }
    const idade = a.foto_sync_em ? Date.now() - new Date(a.foto_sync_em).getTime() : Infinity;
    if (idade < SETE_DIAS && !(body.forcar && idade > 10 * 60 * 1000)) return json({ ok: true, foto_url: a.foto_url });
    const r = await sincronizar(admin, a);
    if ('falha' in r) return json({ ok: true, foto_url: a.foto_url, motivo: r.falha });
    return json({ ok: true, foto_url: r.foto_url });
  } catch (e) {
    return json({ error: (e as Error)?.message ?? 'Erro inesperado.' }, 500);
  }
});
