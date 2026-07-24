// maturacao-manage — ciclo de vida das instâncias de AQUECIMENTO (não de atendimento).
// action: criar | qr | status | remover | listar
//
// Diferenças deliberadas em relação ao evolution-manage:
//   • NÃO checa `limite_whatsapps` — chips de aquecimento não são canais e não entram na cobrança;
//   • NÃO insere em `canais` nem em `integracoes` — vive só em `maturacao_chips`;
//   • as instâncias nascem com prefixo 'aquec_' e webhook apontando para `maturacao-webhook`.
//
// Auth: JWT de usuário + admin da org (verify_jwt fica TRUE — só a app chama isto).
import { corsHeaders, json } from './cors.ts';
import { adminClient, getUser, requireOrgAdmin } from './client.ts';
import { evolution, evolutionConfigured, extractQr } from './evolution.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const WEBHOOK_URL = `${SUPABASE_URL}/functions/v1/maturacao-webhook`;

function normalizeNumber(jid?: string | null): string | null {
  if (!jid) return null;
  return jid.replace(/@.*/, '').replace(/[^0-9]/g, '') || null;
}

// ownerJid vem em formatos diferentes conforme a versão/endpoint da Evolution
function extractOwnerJid(d: unknown): string | null {
  const arr = Array.isArray(d) ? d : [d];
  for (const item of arr) {
    const o = item as Record<string, unknown>;
    const inst = (o?.instance ?? o) as Record<string, unknown>;
    const jid = (inst?.ownerJid ?? inst?.owner ?? o?.ownerJid) as string | undefined;
    if (jid) return jid;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    if (!evolutionConfigured()) {
      return json({ error: 'Evolution não configurada (defina EVOLUTION_API_URL e EVOLUTION_API_KEY).' }, 503);
    }

    const admin = adminClient();
    const body = await req.json().catch(() => ({}));
    const action: string = body.action;

    const user = await getUser(req);
    if (!user) return json({ error: 'não autenticado' }, 401);

    // Resolve a org: vem do body no 'criar'; nas demais, do próprio chip (nunca confia no cliente).
    let orgId: string | null = body.organizacao_id ?? null;
    let chip: Record<string, unknown> | null = null;

    if (action !== 'criar') {
      if (!body.chip_id) return json({ error: 'chip_id obrigatório' }, 400);
      const { data } = await admin.from('maturacao_chips')
        .select('id, organizacao_id, apelido, instancia_externa, numero_conectado, status_integracao, status_maturacao, proxy_protocolo, proxy_host, proxy_porta, proxy_usuario, proxy_senha')
        .eq('id', body.chip_id).maybeSingle();
      if (!data) return json({ error: 'chip não encontrado' }, 404);
      chip = data;
      orgId = data.organizacao_id as string;
    }

    if (!orgId) return json({ error: 'organizacao_id obrigatório' }, 400);
    const perm = await requireOrgAdmin(admin, user.id, orgId);
    if (!perm.ok) return json({ error: perm.reason }, 403);

    // secret que a Evolution devolverá no header do maturacao-webhook
    const { data: wc } = await admin.from('webhook_config').select('secret').eq('chave', 'maturacao').maybeSingle();
    const secret = (wc?.secret as string) ?? '';

    // ── criar: registra o chip e sobe a instância dedicada ────────────────────
    if (action === 'criar') {
      const apelido = String(body.apelido ?? '').trim();
      if (!apelido) return json({ error: 'apelido obrigatório' }, 400);

      const { data: novo, error: eIns } = await admin.from('maturacao_chips')
        .insert({ organizacao_id: orgId, apelido, operadora: body.operadora ?? null })
        .select('id').single();
      if (eIns) return json({ error: eIns.message }, 500);

      const instancia = `aquec_${String(novo.id).replace(/-/g, '')}`;
      await admin.from('maturacao_chips')
        .update({ instancia_externa: instancia, status_integracao: 'sincronizando', atualizado_em: new Date().toISOString() })
        .eq('id', novo.id);

      try {
        const criada = await evolution.createInstance(instancia, WEBHOOK_URL, secret);
        return json({ ok: true, chip_id: novo.id, instancia, qr: extractQr(criada) });
      } catch (e) {
        // instância não subiu: deixa o chip registrado como 'erro' para o admin poder retentar o QR
        await admin.from('maturacao_chips')
          .update({ status_integracao: 'erro', atualizado_em: new Date().toISOString() })
          .eq('id', novo.id);
        return json({ ok: false, chip_id: novo.id, error: (e as Error).message }, 502);
      }
    }

    const instancia = chip!.instancia_externa as string | null;
    if (!instancia) return json({ error: 'chip sem instância' }, 409);

    // ── proxy: empurra (ou remove) o proxy guardado no banco para a instância ──
    // A senha nunca trafega para o cliente: ela sai daqui direto para a Evolution.
    // Falha NÃO derruba o chip — só registra o erro para o painel mostrar, porque
    // proxy quebrado com fallback silencioso é pior que proxy ausente.
    if (action === 'proxy') {
      const temProxy = !!chip!.proxy_host;
      try {
        if (temProxy) {
          await evolution.setProxy(instancia, {
            host: chip!.proxy_host as string,
            port: chip!.proxy_porta as number,
            protocol: chip!.proxy_protocolo as string,
            username: chip!.proxy_usuario as string | null,
            password: chip!.proxy_senha as string | null,
          });
        } else {
          await evolution.removeProxy(instancia);
        }
        await admin.from('maturacao_chips').update({
          proxy_aplicado_em: temProxy ? new Date().toISOString() : null,
          proxy_ultimo_erro: null,
          atualizado_em: new Date().toISOString(),
        }).eq('id', chip!.id);
        return json({ ok: true, aplicado: temProxy });
      } catch (e) {
        const erro = ((e as Error)?.message ?? 'erro').slice(0, 300);
        await admin.from('maturacao_chips').update({
          proxy_aplicado_em: null,
          proxy_ultimo_erro: erro,
          atualizado_em: new Date().toISOString(),
        }).eq('id', chip!.id);
        return json({ ok: false, aplicado: false, erro }, 502);
      }
    }

    // ── qr: (re)conecta e devolve o QR para leitura no celular ────────────────
    if (action === 'qr') {
      const estado = await evolution.connectionState(instancia).catch(() => null);
      if (estado?.instance?.state === 'open') return json({ ok: true, conectado: true });

      // garante que o webhook aponta pro lugar certo antes de parear (instância pode ser antiga)
      await evolution.setWebhook(instancia, WEBHOOK_URL, secret).catch(() => null);
      const conn = await evolution.connect(instancia);
      return json({ ok: true, conectado: false, qr: extractQr(conn) });
    }

    // ── status: consulta a sessão e persiste o número quando pareia ───────────
    if (action === 'status') {
      const estado = await evolution.connectionState(instancia).catch(() => null);
      const aberto = estado?.instance?.state === 'open';
      const patch: Record<string, unknown> = {
        status_integracao: aberto ? 'conectado' : 'desconectado',
        atualizado_em: new Date().toISOString(),
      };

      if (aberto) {
        const info = await evolution.fetchInstance(instancia).catch(() => null);
        const numero = normalizeNumber(extractOwnerJid(info));
        if (numero) patch.numero_conectado = numero;
        if (!chip!.numero_conectado) patch.conectado_em = new Date().toISOString();
      }

      await admin.from('maturacao_chips').update(patch).eq('id', chip!.id);

      // O front faz polling deste endpoint enquanto o QR está aberto e pode ver a conexão
      // antes do webhook. Chamar aqui também garante o início mesmo se o evento se perder.
      // A RPC é idempotente, então os dois caminhos juntos não iniciam duas vezes.
      let iniciou = false;
      if (aberto) {
        const { data: r } = await admin.rpc('maturacao_auto_iniciar', { p_chip: chip!.id });
        iniciou = !!r;
        if (iniciou) {
          fetch(`${SUPABASE_URL}/functions/v1/maturacao-planner`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-maturacao-secret': secret },
            body: '{}',
          }).catch(() => null);
        }
      }

      return json({
        ok: true,
        status_integracao: patch.status_integracao,
        numero_conectado: patch.numero_conectado ?? chip!.numero_conectado,
        aquecimento_iniciado: iniciou,
      });
    }

    // ── remover: exclusão definitiva (mesma decisão já tomada em Integrações) ──
    if (action === 'remover') {
      await evolution.logout(instancia).catch(() => null);
      await evolution.remove(instancia).catch(() => null);
      const { error } = await admin.from('maturacao_chips').delete().eq('id', chip!.id);
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true, removido: true });
    }

    return json({ error: `ação desconhecida: ${action}` }, 400);
  } catch (e) {
    return json({ error: (e as Error).message ?? 'erro' }, 500);
  }
});
