// cobranca-wa — conexão de WhatsApp DEDICADA ao Modo Cobrança (Fase C-alfa).
// ISOLAMENTO (ordem do dono 29/08): a instância é própria da cobrança —
// SEM linha em `canais`, SEM webhook apontado — o pipeline de atendimento
// nunca fica sabendo dela, então nada aparece no inbox/WhatsApp.
// Réplicas de padrão da evolution-manage VIVA (auth JWT + papel admin/
// supervisor; apikey nunca sai do backend). action: conectar | qr | status | desconectar.
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

const BASE = (Deno.env.get('EVOLUTION_API_URL') ?? '').replace(/\/+$/, '');
const KEY = Deno.env.get('EVOLUTION_API_KEY') ?? '';
const QR_TTL = 60;

async function evo(path: string, method: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', apikey: KEY },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!res.ok) {
    const msg = (data as { message?: string })?.message ?? (data as { error?: string })?.error ?? `Evolution HTTP ${res.status}`;
    throw new Error(typeof msg === 'string' ? msg : `Evolution HTTP ${res.status}`);
  }
  return data;
}

function extractQr(d: unknown): string | null {
  const o = d as Record<string, unknown>;
  const q = (o?.qrcode ?? o) as Record<string, unknown>;
  const b64 = (q?.base64 ?? o?.base64) as string | undefined;
  if (!b64) return null;
  return b64.startsWith('data:') ? b64 : `data:image/png;base64,${b64}`;
}

function normNum(jid?: string | null): string | null {
  if (!jid) return null;
  return jid.replace(/@.*/, '').replace(/[^0-9]/g, '') || null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    if (!BASE || !KEY) return json({ error: 'Evolution não configurada.' }, 503);
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const admin: SupabaseClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

    // auth: JWT do usuário + papel admin/supervisor na org (mesma régua da evolution-manage)
    const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
      auth: { persistSession: false },
    });
    const { data: au } = await userClient.auth.getUser();
    if (!au?.user) return json({ error: 'Não autenticado.' }, 401);

    const body = await req.json().catch(() => ({}));
    const action: string = body.action;
    const orgId: string = body.organizacao_id;
    if (!orgId) return json({ error: 'organizacao_id é obrigatório.' }, 400);
    const { data: memb } = await admin.from('organizacao_usuarios')
      .select('papel, status').eq('organizacao_id', orgId).eq('usuario_id', au.user.id).maybeSingle();
    if (!memb || memb.status !== 'ativo') return json({ error: 'Usuário não é membro ativo.' }, 403);
    if (memb.papel !== 'admin' && memb.papel !== 'supervisor') return json({ error: 'Apenas administradores ou supervisores.' }, 403);

    // -------- conectar: garante a linha do atendente e cria instância nova --------
    if (action === 'conectar') {
      const atendenteId: string = body.atendente_id;
      if (!atendenteId) return json({ error: 'atendente_id é obrigatório.' }, 400);
      const { data: row, error: eUp } = await admin.from('cobranca_numeros')
        .upsert(
          { organizacao_id: orgId, atendente_id: atendenteId, rotulo: body.rotulo ?? null, ativo: true },
          { onConflict: 'organizacao_id,atendente_id' },
        )
        .select('id, instancia').single();
      if (eUp || !row) return json({ error: eUp?.message ?? 'Falha ao registrar o número.' }, 500);

      // sessão antiga (reconexão): encerra best-effort antes de criar outra
      if (row.instancia) {
        try { await evo(`/instance/logout/${row.instancia}`, 'DELETE'); } catch { /* já caída */ }
        try { await evo(`/instance/delete/${row.instancia}`, 'DELETE'); } catch { /* já removida */ }
      }

      const instancia = `cobr_${(row.id as string).replace(/-/g, '')}_${Date.now().toString(36)}`;
      try {
        // SEM campo webhook: é isto que isola — inbound não vai a lugar nenhum
        const created = await evo('/instance/create', 'POST', { instanceName: instancia, integration: 'WHATSAPP-BAILEYS', qrcode: true });
        let qr = extractQr(created);
        if (!qr) qr = extractQr(await evo(`/instance/connect/${instancia}`, 'GET'));
        await admin.from('cobranca_numeros')
          .update({ instancia, estado: 'aguardando_qr', telefone: null }).eq('id', row.id);
        return json({ numero_id: row.id, instancia, qr_base64: qr, expires_in: QR_TTL });
      } catch (e) {
        await admin.from('cobranca_numeros')
          .update({ instancia: null, estado: 'desconectado' }).eq('id', row.id);
        return json({ error: `Falha ao criar instância: ${(e as Error).message}` }, 502);
      }
    }

    const numeroId: string = body.numero_id;
    if (!numeroId) return json({ error: 'numero_id é obrigatório.' }, 400);
    const { data: num } = await admin.from('cobranca_numeros')
      .select('id, instancia, estado').eq('id', numeroId).eq('organizacao_id', orgId).maybeSingle();
    if (!num) return json({ error: 'Número não encontrado.' }, 404);

    if (action === 'qr') {
      if (!num.instancia) return json({ error: 'Sem sessão. Use Conectar.' }, 409);
      const qr = extractQr(await evo(`/instance/connect/${num.instancia}`, 'GET'));
      return json({ qr_base64: qr, expires_in: QR_TTL });
    }

    if (action === 'status') {
      if (!num.instancia) return json({ connected: false, state: 'close' });
      const st = await evo(`/instance/connectionState/${num.instancia}`, 'GET') as { instance?: { state?: string } };
      const state = st?.instance?.state ?? 'close';
      if (state === 'open') {
        let telefone: string | null = null;
        try {
          const inst = await evo(`/instance/fetchInstances?instanceName=${encodeURIComponent(num.instancia)}`, 'GET') as unknown;
          const arr = Array.isArray(inst) ? inst : [];
          const o = (arr[0] ?? {}) as Record<string, unknown>;
          telefone = normNum((o.ownerJid ?? o.owner) as string | undefined);
        } catch { /* tolerante */ }
        await admin.from('cobranca_numeros')
          .update({ estado: 'conectado', telefone }).eq('id', num.id);
        return json({ connected: true, state, telefone });
      }
      return json({ connected: false, state });
    }

    if (action === 'desconectar') {
      if (num.instancia) {
        try { await evo(`/instance/logout/${num.instancia}`, 'DELETE'); } catch { /* já caída */ }
        try { await evo(`/instance/delete/${num.instancia}`, 'DELETE'); } catch { /* já removida */ }
      }
      await admin.from('cobranca_numeros')
        .update({ instancia: null, estado: 'desconectado', telefone: null }).eq('id', num.id);
      return json({ ok: true });
    }

    return json({ error: 'Ação inválida.' }, 400);
  } catch (e) {
    return json({ error: (e as Error).message ?? 'Erro inesperado.' }, 500);
  }
});
