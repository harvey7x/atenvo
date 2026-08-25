// enviar-planilha — envia os dados da ficha judicial para a planilha
// "CONTROLE CLIENTES AGENDADOS" (aba CLIENTES EM ANDAMENTO) via Web App de
// Apps Script já publicado. A ponte deduplica por CPF (atualiza a linha ou
// cria no fim) e responde { ok, acao: 'criado'|'atualizado', linha }.
//
// verify_jwt = true (padrão do gateway): só a app logada chama. Multi-tenant
// validado aqui dentro (a ficha precisa ser da organização do usuário).
// URL do Web App e token vêm SÓ do env (PLANILHA_WEBAPP_URL / PLANILHA_TOKEN).
import { corsHeaders, json } from './cors.ts';
import { adminClient, getUser } from './client.ts';
import { normalizaCpfPlanilha, normalizaTelefonePlanilha } from './normaliza.ts';

interface RespostaPonte { ok?: boolean; acao?: string; linha?: number; erro?: string }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const user = await getUser(req);
    if (!user) return json({ ok: false, erro: 'Não autenticado.' }, 401);

    const body = await req.json().catch(() => ({}));
    const ficha_id = body?.ficha_id as string | undefined;
    const cliente = String(body?.cliente ?? '').trim();
    const senha_inss = String(body?.senha_inss ?? '').trim();
    const trafego = String(body?.trafego ?? '').trim();
    const responsavel = String(body?.responsavel ?? '').trim();
    if (!ficha_id) return json({ ok: false, erro: 'ficha_id é obrigatório.' }, 400);
    if (!cliente) return json({ ok: false, erro: 'Informe o nome do cliente.' }, 400);

    // CPF: preserva zeros à esquerda formatando XXX.XXX.XXX-XX; sem 11 dígitos não envia.
    const cpf = normalizaCpfPlanilha(String(body?.cpf ?? ''));
    if (!cpf) return json({ ok: false, erro: 'CPF precisa ter 11 dígitos para ir à planilha.' }, 400);
    const numero = normalizaTelefonePlanilha(String(body?.numero ?? ''));

    // multi-tenant: a ficha precisa pertencer à organização do usuário autenticado
    const admin = adminClient();
    const { data: ficha, error: fe } = await admin.from('fichas_judiciais')
      .select('id, organizacao_id, oportunidade_id').eq('id', ficha_id).maybeSingle();
    if (fe) return json({ ok: false, erro: fe.message }, 500);
    if (!ficha) return json({ ok: false, erro: 'Ficha não encontrada.' }, 404);
    const { data: mem } = await admin.from('organizacao_usuarios').select('status')
      .eq('organizacao_id', ficha.organizacao_id).eq('usuario_id', user.id).maybeSingle();
    if (!mem || mem.status !== 'ativo') return json({ ok: false, erro: 'A ficha não pertence à sua organização.' }, 403);

    const url = Deno.env.get('PLANILHA_WEBAPP_URL');
    const token = Deno.env.get('PLANILHA_TOKEN');
    if (!url || !token) return json({ ok: false, erro: 'Integração da planilha não configurada.' }, 500);

    // O Apps Script responde via redirect 302 — o fetch segue por padrão (não desabilitar).
    let ponte: RespostaPonte;
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, cliente, cpf, senha_inss, numero, trafego, responsavel }),
      });
      ponte = JSON.parse(await r.text()) as RespostaPonte;
    } catch {
      // rede fora ou HTML de erro do Google no lugar do JSON
      return json({ ok: false, erro: 'Ponte da planilha indisponível' }, 502);
    }
    if (!ponte?.ok) return json({ ok: false, erro: ponte?.erro || 'A planilha recusou o envio.' }, 502);

    const acao = ponte.acao === 'atualizado' ? 'atualizado' : 'criado';
    const linha = Number.isFinite(ponte.linha) ? Number(ponte.linha) : null;

    // Persistência (service role). O trigger fn_ficha_before permite este carimbo
    // (senha_inss/planilha_enviada_em/planilha_linha) mesmo em ficha finalizada.
    let aviso: string | undefined;
    const patch: Record<string, unknown> = { planilha_enviada_em: new Date().toISOString(), planilha_linha: linha };
    if (senha_inss) patch.senha_inss = senha_inss;
    const { error: ue } = await admin.from('fichas_judiciais').update(patch).eq('id', ficha_id);
    if (ue) {
      console.error('enviar-planilha: falha ao carimbar a ficha', ue.message);
      aviso = 'Enviado à planilha, mas não foi possível registrar o envio na ficha.';
    }
    if (ficha.oportunidade_id && trafego) {
      const { error: oe } = await admin.from('oportunidades')
        .update({ fonte_aquisicao: trafego }).eq('id', ficha.oportunidade_id);
      if (oe) console.error('enviar-planilha: falha ao gravar fonte_aquisicao', oe.message);
    }

    return json({ ok: true, acao, linha, ...(aviso ? { aviso } : {}) });
  } catch (e) {
    return json({ ok: false, erro: (e as Error).message ?? 'Erro inesperado.' }, 500);
  }
});
