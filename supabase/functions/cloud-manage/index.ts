// cloud-manage — painel da API OFICIAL (WhatsApp Cloud API). JWT + admin/supervisor.
//
// Por que NÃO é uma ação do evolution-manage: aquela função responde 503 logo na entrada quando
// EVOLUTION_API_URL/KEY não estão configuradas (index.ts:39). Pendurar a API oficial ali faria o
// painel do número oficial cair junto com a Evolution — exatamente o acoplamento que a conta
// oficial existe para evitar.
//
// AÇÕES
//   diagnostico     — o que falta no SERVIDOR para o canal oficial funcionar. Devolve BOOLEANOS,
//                     nunca valores: saber que META_WHATSAPP_TOKEN existe é útil; ver o token, não.
//   vincular        — cadastra o número oficial como canal (transporte='cloud_api').
//   verificar       — pergunta ao Graph quem é aquele phone_number_id e atualiza número/qualidade.
//   remover         — exclui o canal oficial (definitivo, como na decisão de 07/2026 para WhatsApp).
//   templates_sync  — importa os templates do WABA e o STATUS DE APROVAÇÃO real da Meta.
//
// INERTE ATÉ OS SECRETS EXISTIREM: sem META_WHATSAPP_TOKEN as ações que falam com o Graph
// devolvem um erro explicando o que falta — nenhuma delas inventa estado nem grava mentira.
import { corsHeaders, json } from './cors.ts';
import { adminClient, getUser, requireOrgAdmin } from './client.ts';

const GRAPH_V = () => Deno.env.get('META_GRAPH_VERSION') || 'v21.0';
const TOKEN = () => Deno.env.get('META_WHATSAPP_TOKEN') ?? '';
const SUPABASE_URL = (Deno.env.get('SUPABASE_URL') ?? '').replace(/\/+$/, '');

const soDigitos = (v?: string | null) => (v ?? '').replace(/[^0-9]/g, '') || null;

async function graph(path: string, timeoutMs = 20000): Promise<{ ok: boolean; status: number; body: Record<string, any> }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`https://graph.facebook.com/${GRAPH_V()}/${path}`, {
      headers: { Authorization: `Bearer ${TOKEN()}` }, signal: ctrl.signal,
    });
    const txt = await res.text();
    let body: Record<string, any> = {};
    try { body = txt ? JSON.parse(txt) : {}; } catch { body = { raw: txt.slice(0, 300) }; }
    return { ok: res.ok, status: res.status, body };
  } catch (e) {
    return { ok: false, status: 0, body: { error: { message: (e as Error)?.message ?? 'network' } } };
  } finally { clearTimeout(t); }
}
function erroGraph(b: Record<string, any>, status: number): string {
  const e = b?.error ?? {};
  const partes = [e.message, e.error_user_msg, e.error_data?.details].filter(Boolean);
  return (partes.length ? partes.join(' — ') : `HTTP ${status}`).toString().slice(0, 300);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const user = await getUser(req);
    if (!user) return json({ error: 'Não autenticado.' }, 401);
    const body = await req.json().catch(() => ({}));
    const action: string = body.action ?? '';
    const orgId: string = body.organizacao_id ?? '';
    if (!orgId) return json({ error: 'organizacao_id é obrigatório.' }, 400);

    const admin = adminClient();
    const guard = await requireOrgAdmin(admin, user.id, orgId);
    if (!guard.ok) return json({ error: guard.reason }, 403);

    // ---------------------------------------------------------------- diagnostico
    // O checklist que o dono precisa ver ANTES de mexer no painel da Meta. Só booleanos.
    if (action === 'diagnostico') {
      const { data: canais } = await admin.from('canais')
        .select('id, nome_interno, numero_conectado, cloud_phone_number_id, cloud_waba_id, status_integracao')
        .eq('organizacao_id', orgId).eq('transporte', 'cloud_api').neq('status_integracao', 'removido');
      const { count: templatesAprovados } = await admin.from('wa_templates')
        .select('id', { count: 'exact', head: true })
        .eq('organizacao_id', orgId).eq('ativo', true).eq('status', 'aprovado');
      return json({
        ok: true,
        // URL que precisa ser colada no painel da Meta (Webhooks > Callback URL).
        webhook_url: `${SUPABASE_URL}/functions/v1/cloud-webhook`,
        graph_version: GRAPH_V(),
        secrets: {
          META_WHATSAPP_TOKEN: !!Deno.env.get('META_WHATSAPP_TOKEN'),
          META_WA_APP_SECRET: !!Deno.env.get('META_WA_APP_SECRET'),
          META_WA_VERIFY_TOKEN: !!Deno.env.get('META_WA_VERIFY_TOKEN'),
        },
        cloud_api_ativo: (Deno.env.get('CLOUD_API_ATIVO') ?? 'sim').toLowerCase() === 'sim',
        bot_dispatch: (Deno.env.get('CLOUD_BOT_DISPATCH') ?? 'nao').toLowerCase() === 'sim',
        canais: canais ?? [],
        templates_aprovados: templatesAprovados ?? 0,
      });
    }

    // ---------------------------------------------------------------- vincular
    if (action === 'vincular') {
      const alias = String(body.alias ?? '').trim().slice(0, 80);
      const phoneNumberId = soDigitos(body.phone_number_id);
      const wabaId = soDigitos(body.waba_id);
      if (!alias) return json({ error: 'Dê um nome interno para este número (ex.: OFICIAL).' }, 400);
      if (!phoneNumberId) return json({ error: 'Informe o Phone number ID (só números), que fica no painel da Meta.' }, 400);

      // mesmo número já cadastrado? (o unique index barraria, mas com erro feio)
      const { data: jaExiste } = await admin.from('canais').select('id, nome_interno')
        .eq('cloud_phone_number_id', phoneNumberId).neq('status_integracao', 'removido').maybeSingle();
      if (jaExiste) return json({ error: `Este número já está cadastrado como "${jaExiste.nome_interno}".` }, 409);

      // Limite de WhatsApp: o trigger checa_limite_canais é o backstop real, mas ele levanta
      // check_violation. Checar aqui é só para a mensagem sair legível.
      const { data: lim } = await admin.from('organizacao_limites').select('limite_whatsapps').eq('organizacao_id', orgId).maybeSingle();
      const { count: usados } = await admin.from('canais')
        .select('id', { count: 'exact', head: true }).eq('organizacao_id', orgId).eq('tipo', 'whatsapp').eq('ativo', true);
      if ((usados ?? 0) >= ((lim?.limite_whatsapps as number) ?? 0)) {
        return json({ error: 'Limite de WhatsApp atingido para esta organização. Libere um número ou contrate um adicional.' }, 409);
      }

      // Confirma no Graph ANTES de gravar, quando dá: cadastrar um id errado significa um canal
      // que recebe webhook de ninguém e nunca envia. Sem token, grava mesmo assim como pendente.
      let numero: string | null = null;
      let verificado = false;
      let avisoVerificacao: string | null = null;
      if (TOKEN()) {
        const r = await graph(`${phoneNumberId}?fields=display_phone_number,verified_name,quality_rating`);
        if (r.ok) { numero = soDigitos(r.body?.display_phone_number); verificado = true; }
        else avisoVerificacao = erroGraph(r.body, r.status);
      } else {
        avisoVerificacao = 'Token da API oficial ainda não configurado no servidor (META_WHATSAPP_TOKEN).';
      }

      const { data: novo, error: e1 } = await admin.from('canais').insert({
        tipo: 'whatsapp', nome_interno: alias, organizacao_id: orgId,
        provider: 'meta_cloud', transporte: 'cloud_api',
        cloud_phone_number_id: phoneNumberId, cloud_waba_id: wabaId,
        numero_conectado: numero,
        // sem sessão/QR: 'conectado' só quando a Meta confirmou quem é o número.
        status_integracao: verificado ? 'conectado' : 'sincronizando',
        ativo: true, conectado_em: verificado ? new Date().toISOString() : null,
      }).select('id, nome_interno, numero_conectado, status_integracao').single();
      if (e1 || !novo) {
        const m = e1?.message ?? '';
        if (/limite/i.test(m)) return json({ error: 'Limite de WhatsApp atingido para esta organização.' }, 409);
        return json({ error: 'Não foi possível cadastrar o número oficial.', detalhe: m.slice(0, 180) }, 500);
      }

      try {
        await admin.from('audit_log').insert({
          usuario_id: user.id, acao: 'cloud_vincular', entidade: 'canais', entidade_id: novo.id, organizacao_id: orgId,
          dados_depois: { alias, phone_number_id: phoneNumberId, waba_id: wabaId, verificado },
        });
      } catch { /* audit best-effort */ }

      return json({ ok: true, canal: novo, verificado, aviso: avisoVerificacao });
    }

    // ---------------------------------------------------------------- verificar
    if (action === 'verificar') {
      const canalId: string = body.canal_id ?? '';
      if (!canalId) return json({ error: 'canal_id é obrigatório.' }, 400);
      const { data: canal } = await admin.from('canais')
        .select('id, cloud_phone_number_id, transporte').eq('id', canalId).eq('organizacao_id', orgId).maybeSingle();
      if (!canal || canal.transporte !== 'cloud_api') return json({ error: 'Canal da API oficial não encontrado.' }, 404);
      if (!TOKEN()) return json({ error: 'Token da API oficial ainda não configurado no servidor (META_WHATSAPP_TOKEN).' }, 503);

      const r = await graph(`${canal.cloud_phone_number_id}?fields=display_phone_number,verified_name,quality_rating,platform_type,throughput`);
      if (!r.ok) {
        await admin.from('canais').update({ status_integracao: 'erro' }).eq('id', canalId);
        return json({ error: erroGraph(r.body, r.status), code: 'graph_erro' }, 502);
      }
      const numero = soDigitos(r.body?.display_phone_number);
      await admin.from('canais').update({
        numero_conectado: numero, status_integracao: 'conectado',
        conectado_em: new Date().toISOString(), ultima_sincronizacao: new Date().toISOString(),
      }).eq('id', canalId);
      return json({
        ok: true, numero,
        nome_verificado: r.body?.verified_name ?? null,
        qualidade: r.body?.quality_rating ?? null,
        plataforma: r.body?.platform_type ?? null,
      });
    }

    // ---------------------------------------------------------------- remover
    if (action === 'remover') {
      const canalId: string = body.canal_id ?? '';
      if (!canalId) return json({ error: 'canal_id é obrigatório.' }, 400);
      // .eq('transporte','cloud_api') não é decoração: garante que esta função NUNCA apague
      // um canal da Evolution, mesmo se receber um id errado.
      const { data: canal } = await admin.from('canais')
        .select('id, nome_interno, cloud_phone_number_id').eq('id', canalId)
        .eq('organizacao_id', orgId).eq('transporte', 'cloud_api').maybeSingle();
      if (!canal) return json({ error: 'Canal da API oficial não encontrado.' }, 404);
      const { error: eDel } = await admin.from('canais').delete().eq('id', canalId).eq('transporte', 'cloud_api');
      if (eDel) return json({ error: 'Não foi possível remover o canal.', detalhe: eDel.message.slice(0, 180) }, 500);
      try {
        await admin.from('audit_log').insert({
          usuario_id: user.id, acao: 'cloud_remover', entidade: 'canais', entidade_id: canalId, organizacao_id: orgId,
          dados_antes: { nome_interno: canal.nome_interno, phone_number_id: canal.cloud_phone_number_id },
        });
      } catch { /* audit best-effort */ }
      return json({ ok: true });
    }

    // ---------------------------------------------------------------- templates_sync
    // A aprovação é da Meta; digitar o status à mão vira mentira em 24h. Aqui importamos o
    // estado REAL do WABA e casamos por (nome, idioma) — a mesma chave do índice único.
    if (action === 'templates_sync') {
      if (!TOKEN()) return json({ error: 'Token da API oficial ainda não configurado no servidor (META_WHATSAPP_TOKEN).' }, 503);
      const { data: canais } = await admin.from('canais')
        .select('id, cloud_waba_id').eq('organizacao_id', orgId).eq('transporte', 'cloud_api')
        .not('cloud_waba_id', 'is', null).neq('status_integracao', 'removido');
      const wabas = [...new Set((canais ?? []).map((c) => String(c.cloud_waba_id)))];
      if (!wabas.length) return json({ error: 'Nenhum canal oficial tem o WABA ID preenchido. Edite o canal e informe o ID da conta do WhatsApp Business.' }, 409);

      const STATUS_META: Record<string, string> = {
        APPROVED: 'aprovado', REJECTED: 'rejeitado', PENDING: 'pendente',
        PAUSED: 'pausado', DISABLED: 'desativado', PENDING_DELETION: 'desativado',
      };
      let importados = 0, atualizados = 0;
      const erros: string[] = [];

      for (const waba of wabas) {
        const canalDoWaba = (canais ?? []).find((c) => String(c.cloud_waba_id) === waba)?.id ?? null;
        const r = await graph(`${waba}/message_templates?fields=name,language,category,status,components,id&limit=200`);
        if (!r.ok) { erros.push(`${waba}: ${erroGraph(r.body, r.status)}`); continue; }
        for (const t of (r.body?.data ?? []) as Array<Record<string, any>>) {
          const nome = String(t.name ?? '').toLowerCase();
          const idioma = String(t.language ?? 'pt_BR');
          if (!/^[a-z0-9_]{1,512}$/.test(nome)) continue;                       // nome que o CHECK recusaria
          const corpoComp = (t.components ?? []).find((c: Record<string, any>) => String(c.type).toUpperCase() === 'BODY');
          const corpo = String(corpoComp?.text ?? '').trim();
          if (!corpo) continue;                                                  // template sem BODY não nos serve
          // variáveis: a Meta devolve os exemplos em example.body_text[0]
          const exemplos: string[] = corpoComp?.example?.body_text?.[0] ?? [];
          const qtd = [...corpo.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((m) => Number(m[1]));
          const maxVar = qtd.length ? Math.max(...qtd) : 0;
          const variaveis = Array.from({ length: maxVar }, (_, i) => ({
            pos: i + 1, rotulo: i === 0 ? 'nome' : `var${i + 1}`, exemplo: exemplos[i] ?? '',
          }));
          const status = STATUS_META[String(t.status ?? '').toUpperCase()] ?? 'pendente';

          const { data: existente } = await admin.from('wa_templates').select('id')
            .eq('organizacao_id', orgId).eq('nome', nome).eq('idioma', idioma).eq('ativo', true).maybeSingle();
          if (existente) {
            await admin.from('wa_templates').update({
              corpo, variaveis, categoria: String(t.category ?? 'MARKETING').toUpperCase(),
              status, status_motivo: null, meta_template_id: String(t.id ?? '') || null,
              waba_id: waba, canal_id: canalDoWaba, sincronizado_em: new Date().toISOString(),
            }).eq('id', existente.id);
            atualizados++;
          } else {
            const { error: eIns } = await admin.from('wa_templates').insert({
              organizacao_id: orgId, canal_id: canalDoWaba, waba_id: waba, nome, idioma,
              categoria: String(t.category ?? 'MARKETING').toUpperCase(), corpo, variaveis,
              status, meta_template_id: String(t.id ?? '') || null, sincronizado_em: new Date().toISOString(),
            });
            if (eIns) erros.push(`${nome}: ${eIns.message.slice(0, 90)}`); else importados++;
          }
        }
      }
      return json({ ok: true, importados, atualizados, erros });
    }

    return json({ error: 'Ação inválida.' }, 400);
  } catch (e) {
    return json({ error: (e as Error).message ?? 'Erro inesperado.' }, 500);
  }
});
