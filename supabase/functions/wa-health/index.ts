// wa-health — diagnóstico de SAÚDE das conexões WhatsApp (somente leitura). NÃO altera o envio.
// action 'status' (default): membro ativo da org -> telemetria + estado read-only da Evolution + estado derivado.
// action 'send-test': admin/supervisor -> envia UMA mensagem de teste explícita (número/texto informados).
import { corsHeaders, json } from './cors.ts';
import { adminClient, getUser, orgRole } from './client.ts';
import { evolution, evolutionConfigured } from './evolution.ts';

const OK = ['SERVER_ACK', 'DELIVERY_ACK', 'READ', 'PLAYED'];
const THRESHOLD_FALHAS = 2;        // 2+ falhas nas últimas 10 => instável
const INBOUND_RECENTE_MS = 72 * 3600 * 1000; // 72h
const mask = (n?: string | null) => (n ? '••••' + n.slice(-4) : '—');

interface Last10 { hora: string; status: string; destino: string; erro: string | null; }
interface Tele {
  canal_id: string; nome: string; numero: string | null; status_integracao: string; instancia: string | null;
  ativo: boolean; criado_em: string;
  last_inbound: string | null; last_webhook: string | null; last_webhook_event: string | null;
  last_delivered: string | null; last_error_at: string | null; last_error_msg: string | null; last10: Last10[];
}

function recomendacao(estado: string): string {
  switch (estado) {
    case 'saudavel': return 'Recebimento e envio funcionando normalmente.';
    case 'enviando_sem_receber': return 'Os envios funcionam, mas não há mensagens recebidas recentemente. Apenas informativo.';
    case 'instavel': return 'Há falhas intermitentes no envio. Verifique a conexão e monitore os próximos envios.';
    case 'possivel_restricao': return 'A conexão está recebendo mensagens, mas os últimos envios falharam. Possível restrição do número ou inconsistência da sessão. Recomendamos testar o envio pelo aplicativo oficial, reconectar a sessão e, se persistir, utilizar outro número.';
    case 'falha_total': return 'Os envios estão falhando e não há atividade de recebimento recente. Reconecte a sessão e, se persistir, utilize outro número.';
    case 'desconectado': return 'Reconecte o WhatsApp lendo um novo QR Code.';
    case 'reconectando': return 'A conexão está sincronizando. Aguarde estabilizar e atualize o diagnóstico.';
    default: return 'Conexão recém-criada ou sem atividade suficiente para classificar. Envie/receba uma mensagem e atualize o diagnóstico.';
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const user = await getUser(req);
    if (!user) return json({ error: 'Não autenticado.' }, 401);
    const body = await req.json().catch(() => ({}));
    const orgId: string = body.organizacao_id;
    const action: string = body.action ?? 'status';
    if (!orgId) return json({ error: 'organizacao_id é obrigatório.' }, 400);

    const admin = adminClient();
    const papel = await orgRole(admin, user.id, orgId);
    if (!papel) return json({ error: 'Sem acesso a esta organização.' }, 403);
    const podeAgir = papel === 'admin' || papel === 'supervisor';

    // ---- Teste de envio EXPLÍCITO (não automático) ----
    if (action === 'send-test') {
      if (!podeAgir) return json({ error: 'Apenas administradores ou supervisores podem testar o envio.' }, 403);
      if (!evolutionConfigured()) return json({ error: 'Evolution não configurada.' }, 503);
      const canalId: string = body.canal_id; const to: string = (body.to ?? '').replace(/[^0-9]/g, ''); const text: string = (body.text ?? 'Teste Atenvo').toString().slice(0, 300);
      if (!canalId || !to) return json({ error: 'Informe o canal e o número de teste.' }, 400);
      const { data: canal } = await admin.from('canais').select('instancia_externa').eq('id', canalId).eq('organizacao_id', orgId).maybeSingle();
      if (!canal?.instancia_externa) return json({ error: 'Canal sem sessão ativa.' }, 409);
      const r = await evolution.sendText(canal.instancia_externa as string, to, text);
      const keyId = (r.data as { key?: { id?: string } })?.key?.id ?? null;
      return json({ ok: r.ok, status: r.status, ms: r.ms, key_id: keyId, aceito: !!keyId });
    }

    // ---- STATUS (default): telemetria + estado read-only ----
    const { data: tele, error: te } = await admin.rpc('wa_health', { p_org: orgId });
    if (te) return json({ error: te.message }, 500);
    const canais = (tele as Tele[]) ?? [];
    const evoOk = evolutionConfigured();
    const versao = evoOk ? ((await evolution.version()).data as { version?: string })?.version ?? null : null;
    const agora = Date.now();

    const out = [];
    for (const c of canais) {
      const last10 = Array.isArray(c.last10) ? c.last10 : [];
      const enviados = last10.length;
      const okN = last10.filter((x) => OK.includes(x.status)).length;
      const erros = last10.filter((x) => x.status === 'ERROR').length;
      let consec = 0; for (const x of last10) { if (x.status === 'ERROR') consec++; else break; }
      const recentInbound = !!c.last_inbound && (agora - new Date(c.last_inbound).getTime()) < INBOUND_RECENTE_MS;

      // estado real da instância (read-only)
      let evoState: string | null = null; let webhookOk: boolean | null = null;
      if (evoOk && c.instancia) {
        const st = await evolution.connectionState(c.instancia);
        evoState = (st.data as { instance?: { state?: string } })?.instance?.state ?? (st.ok ? null : 'erro');
        const wh = await evolution.findWebhook(c.instancia);
        webhookOk = wh.ok ? !!((wh.data as { enabled?: boolean })?.enabled) : null;
      }

      let estado: string;
      if (!c.instancia || !c.ativo) estado = 'desconectado';
      else if (evoState && evoState !== 'open') estado = evoState === 'connecting' ? 'reconectando' : 'desconectado';
      else if (c.status_integracao === 'sincronizando') estado = 'reconectando';
      else if (enviados === 0) estado = 'sem_dados';
      else if (okN > 0 && erros === 0) estado = recentInbound ? 'saudavel' : 'enviando_sem_receber';
      else if (okN === 0 && erros > 0) estado = recentInbound ? 'possivel_restricao' : 'falha_total';
      else if (erros >= THRESHOLD_FALHAS) estado = 'instavel';
      else estado = recentInbound ? 'saudavel' : 'enviando_sem_receber';

      const cor = ({ saudavel: 'verde', enviando_sem_receber: 'verde', instavel: 'amarelo', sem_dados: 'amarelo',
        reconectando: 'amarelo', possivel_restricao: 'laranja', falha_total: 'vermelho', desconectado: 'vermelho' } as Record<string, string>)[estado] ?? 'amarelo';

      const recebimento = recentInbound ? 'Normal' : 'Sem atividade';
      const envio = enviados === 0 ? 'Sem dados' : (erros === 0 ? 'Normal' : (okN === 0 ? 'Falhando' : 'Instável'));

      out.push({
        canalId: c.canal_id, nome: c.nome, numeroMasc: mask(c.numero), instancia: c.instancia,
        statusIntegracao: c.status_integracao, ativo: c.ativo, evoState, webhookOk, versao,
        estado, cor, recebimento, envio,
        enviados, entregues: okN, erros, consecErros: consec,
        taxa: enviados ? Math.round((okN / enviados) * 100) : null,
        lastInbound: c.last_inbound, lastDelivered: c.last_delivered, lastWebhook: c.last_webhook, lastWebhookEvent: c.last_webhook_event,
        lastErrorAt: c.last_error_at, lastErrorMsg: c.last_error_msg,
        last10: last10.map((x) => ({ hora: x.hora, status: x.status, destino: x.destino, erro: x.erro })),
        recomendacao: recomendacao(estado),
      });
    }
    return json({ canais: out, evolutionVersion: versao, podeAgir });
  } catch (e) {
    return json({ error: (e as Error).message ?? 'Erro inesperado.' }, 500);
  }
});
