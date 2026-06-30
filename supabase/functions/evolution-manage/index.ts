// evolution-manage — ações do conector de WhatsApp por QR Code.
// action: create | qr | status | disconnect | remove
// v10: 'remove' é EXCLUSÃO DEFINITIVA — apaga a instância na Evolution e EXCLUI o registro local
//      (integracoes + canais). Conversas/mensagens/oportunidades são preservadas via FKs ON DELETE SET NULL.
import { corsHeaders, json } from './cors.ts';
import { adminClient, getUser, requireOrgAdmin } from './client.ts';
import { evolution, evolutionConfigured, extractQr } from './evolution.ts';

const QR_TTL = 60; // segundos para o contador de expiração na interface

function normalizeNumber(jid?: string | null): string | null {
  if (!jid) return null;
  return jid.replace(/@.*/, '').replace(/[^0-9]/g, '') || null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    if (!evolutionConfigured()) return json({ error: 'Evolution não configurada (defina EVOLUTION_API_URL e EVOLUTION_API_KEY).' }, 503);

    const user = await getUser(req);
    if (!user) return json({ error: 'Não autenticado.' }, 401);

    const body = await req.json().catch(() => ({}));
    const action: string = body.action;
    const orgId: string = body.organizacao_id;
    if (!orgId) return json({ error: 'organizacao_id é obrigatório.' }, 400);

    const admin = adminClient();
    const guard = await requireOrgAdmin(admin, user.id, orgId);
    if (!guard.ok) return json({ error: guard.reason }, 403);

    const supaUrl = Deno.env.get('SUPABASE_URL')!;
    // Segredo SEMPRE da tabela webhook_config (fonte única de verdade). NUNCA do env: evita URL/segredo defasado.
    const { data: wc } = await admin.from('webhook_config').select('secret').eq('chave', 'whatsapp').maybeSingle();
    const secret = wc?.secret ?? '';
    const webhookUrl = `${supaUrl}/functions/v1/evolution-webhook?secret=${encodeURIComponent(secret)}`;

    // -------- CREATE: valida assinatura + vaga, cria canal (reserva vaga) e instância --------
    if (action === 'create') {
      const alias: string = (body.alias ?? '').toString().trim();
      const fonteSlug: string = (body.fonte ?? 'outra').toString().trim();
      if (!alias) return json({ error: 'Informe o alias do canal.' }, 400);

      const { data: org } = await admin.from('organizacoes').select('assinatura_status').eq('id', orgId).single();
      if (!org || !['ativa', 'isenta'].includes(org.assinatura_status)) {
        return json({ error: 'Assinatura inativa. Assine o plano antes de conectar um WhatsApp.' }, 402);
      }
      const { data: lim } = await admin.from('organizacao_limites').select('limite_whatsapps').eq('organizacao_id', orgId).single();
      const { count: usados } = await admin.from('canais')
        .select('id', { count: 'exact', head: true })
        .eq('organizacao_id', orgId).eq('tipo', 'whatsapp').eq('ativo', true);
      if ((usados ?? 0) >= (lim?.limite_whatsapps ?? 0)) {
        return json({ error: 'Limite de WhatsApp atingido. Contrate um WhatsApp adicional.' }, 409);
      }

      let fonteId: string | null = null;
      const { data: f } = await admin.from('fontes_aquisicao').select('id').eq('organizacao_id', orgId).eq('slug', fonteSlug).maybeSingle();
      if (f) fonteId = f.id;
      else {
        const { data: nf } = await admin.from('fontes_aquisicao')
          .insert({ organizacao_id: orgId, nome: alias, slug: fonteSlug }).select('id').maybeSingle();
        fonteId = nf?.id ?? null;
      }

      const { data: canal, error: ec } = await admin.from('canais').insert({
        tipo: 'whatsapp', nome_interno: alias, organizacao_id: orgId,
        fonte_aquisicao_id: fonteId, provider: 'evolution', status_integracao: 'sincronizando', ativo: true,
      }).select('id').single();
      if (ec) return json({ error: ec.message }, 409);

      const instanceName = `atenvo_${(canal.id as string).replace(/-/g, '')}`;
      await admin.from('canais').update({ instancia_externa: instanceName }).eq('id', canal.id);
      await admin.from('integracoes').insert({
        provedor: 'evolution', canal_id: canal.id, organizacao_id: orgId,
        status: 'sincronizando', config: { instance: instanceName },
      });

      try {
        const created = await evolution.createInstance(instanceName, webhookUrl);
        // garante o webhook ATUAL (URL/segredo da tabela), independente de variações do create inline
        try { await evolution.setWebhook(instanceName, webhookUrl); } catch { /* tolerante */ }
        let qr = extractQr(created);
        if (!qr) { qr = extractQr(await evolution.connect(instanceName)); }
        return json({ canal_id: canal.id, instance: instanceName, qr_base64: qr, expires_in: QR_TTL });
      } catch (e) {
        await admin.from('integracoes').delete().eq('canal_id', canal.id);
        await admin.from('canais').delete().eq('id', canal.id);
        return json({ error: `Falha ao criar instância: ${(e as Error).message}` }, 502);
      }
    }

    const canalId: string = body.canal_id;
    if (!canalId) return json({ error: 'canal_id é obrigatório.' }, 400);
    const { data: canal } = await admin.from('canais')
      .select('id, instancia_externa, organizacao_id, ativo').eq('id', canalId).eq('organizacao_id', orgId).maybeSingle();
    if (!canal) return json({ error: 'Canal não encontrado.' }, 404);

    // RECONNECT: reusa o MESMO canal histórico (preserva nome/origem/gestor/relatórios) e cria uma
    // NOVA instância Evolution. Usado quando o canal está desconectado (sem sessão).
    if (action === 'reconnect') {
      const { data: org } = await admin.from('organizacoes').select('assinatura_status').eq('id', orgId).single();
      if (!org || !['ativa', 'isenta'].includes(org.assinatura_status)) {
        return json({ error: 'Assinatura inativa. Assine o plano antes de reconectar.' }, 402);
      }
      // Reconectar REUSA o mesmo canal histórico (mesmo canal_id) — NÃO cria canal novo. Só CONSOME vaga
      // quando o canal estava DESATIVADO (ativo=false); um canal já ativo (ex.: desconectado, mas com a vaga
      // mantida) NÃO consome outra vaga. O trigger trg_limite_canais (exclui o próprio id) é o backstop.
      if (canal.ativo === false) {
        const { data: lim } = await admin.from('organizacao_limites').select('limite_whatsapps').eq('organizacao_id', orgId).single();
        const { count: usados } = await admin.from('canais')
          .select('id', { count: 'exact', head: true })
          .eq('organizacao_id', orgId).eq('tipo', 'whatsapp').eq('ativo', true);
        if ((usados ?? 0) >= (lim?.limite_whatsapps ?? 0)) {
          return json({ error: 'Limite de WhatsApp atingido. Contrate um adicional ou desconecte outro número.' }, 409);
        }
      }
      const instanceName = `atenvo_${canalId.replace(/-/g, '')}_${Date.now().toString(36)}`;
      const { error: upErr } = await admin.from('canais').update({ instancia_externa: instanceName, status_integracao: 'sincronizando', ativo: true }).eq('id', canalId);
      if (upErr) return json({ error: /limite/i.test(upErr.message) ? 'Limite de WhatsApp atingido. Contrate um adicional ou desconecte outro número.' : 'Não foi possível reconectar o canal.' }, 409);
      await admin.from('integracoes').insert({ provedor: 'evolution', canal_id: canalId, organizacao_id: orgId, status: 'sincronizando', config: { instance: instanceName } });
      try {
        const created = await evolution.createInstance(instanceName, webhookUrl);
        try { await evolution.setWebhook(instanceName, webhookUrl); } catch { /* tolerante */ }
        let qr = extractQr(created);
        if (!qr) { qr = extractQr(await evolution.connect(instanceName)); }
        return json({ canal_id: canalId, instance: instanceName, qr_base64: qr, expires_in: QR_TTL });
      } catch (e) {
        await admin.from('integracoes').delete().eq('canal_id', canalId);
        await admin.from('canais').update({ status_integracao: 'desconectado', ativo: false, instancia_externa: null }).eq('id', canalId);
        return json({ error: `Falha ao criar instância: ${(e as Error).message}` }, 502);
      }
    }

    const instance = canal.instancia_externa as string;
    if (!instance) return json({ error: 'Canal sem sessão ativa. Use Reconectar.' }, 409);

    if (action === 'qr') {
      // Toda RECONEXÃO re-aplica o webhook ATUAL (URL/segredo nunca defasados) antes de gerar o QR.
      try { await evolution.setWebhook(instance, webhookUrl); } catch { /* tolerante */ }
      const qr = extractQr(await evolution.connect(instance));
      return json({ qr_base64: qr, expires_in: QR_TTL });
    }

    if (action === 'status') {
      const st = await evolution.connectionState(instance);
      const state = st?.instance?.state ?? 'close';
      if (state === 'open') {
        let numero: string | null = null;
        try {
          const inst = await evolution.fetchInstance(instance) as unknown;
          const arr = Array.isArray(inst) ? inst : (inst as { instance?: unknown })?.instance ? [inst] : [];
          const owner = (arr[0] as Record<string, unknown>)?.ownerJid ?? (arr[0] as Record<string, unknown>)?.owner;
          numero = normalizeNumber(owner as string | undefined);
        } catch { /* tolerante */ }
        await admin.from('canais').update({
          status_integracao: 'conectado', ativo: true,
          numero_conectado: numero, conectado_em: new Date().toISOString(), ultima_sincronizacao: new Date().toISOString(),
        }).eq('id', canalId);
        await admin.from('integracoes').update({ status: 'conectado', ultima_sincronizacao: new Date().toISOString() }).eq('canal_id', canalId);
        return json({ state, connected: true, numero });
      }
      return json({ state, connected: false });
    }

    if (action === 'disconnect') {
      try { await evolution.logout(instance); } catch { /* já pode estar desconectado */ }
      await admin.from('canais').update({ status_integracao: 'desconectado' }).eq('id', canalId);
      await admin.from('integracoes').update({ status: 'desconectado' }).eq('canal_id', canalId);
      return json({ ok: true });
    }

    if (action === 'remove') {
      // DESCONEXÃO (não é mais exclusão): encerra a sessão/instância na Evolution e DESATIVA o canal,
      // PRESERVANDO todo o histórico — canal, conversas, mensagens, contatos, oportunidades, cobranças,
      // origem, métricas/relatórios, snapshots e a configuração comercial do chip. NÃO faz DELETE em canais.
      try { await evolution.logout(instance); } catch { /* já pode estar desconectada */ }
      try { await evolution.remove(instance); } catch { /* instância pode já não existir */ }
      await admin.from('integracoes').delete().eq('canal_id', canalId); // registro técnico descartável
      await admin.from('canais').update({
        status_integracao: 'desconectado', ativo: false, instancia_externa: null,
      }).eq('id', canalId);
      return json({ ok: true });
    }

    return json({ error: 'Ação inválida.' }, 400);
  } catch (e) {
    return json({ error: (e as Error).message ?? 'Erro inesperado.' }, 500);
  }
});
