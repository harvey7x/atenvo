// disparo-processar — envio em massa por TEMPLATE aprovado (Cloud API), Fase 1: disparo único.
//
// MODO SEGURO (mesma filosofia do bot-remarketing):
//  * dry_run=true por DEFAULT — só simula e devolve a prévia; envio real exige dry_run:false explícito.
//  * lote máximo por chamada: 50 (o ritmo é decidido na tela, "Enviar agora: X").
//  * teto MÓVEL de 24h por CANAL (disparo_campanhas.teto_24h, cap 200): conta alvos enviados nas
//    últimas 24h em TODAS as campanhas do canal + toques do bot-remarketing. Estourou → para.
//  * opt-out re-checado POR ALVO no momento do envio (wa_optout, qualquer canal do contato).
//  * 131050 no envio → registra wa_optout e marca o alvo 'optout' (estado, não retry).
//  * jitter 1,5–3s entre envios — nunca rajada.
//  * SEM janela de horário (decisão do dono 2026-08-02): dispara em qualquer dia/hora.
//
// AUTH: JWT de usuário (a tela chama via supabase.functions.invoke) + vínculo ATIVO na org da
// campanha. Criar campanha/alvos já exigiu admin|supervisor na RPC; aqui basta ser membro.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { enviadorDe } from '../evolution-send/transporte.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const LOTE_MAX = 50;
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

function codigoMeta(msg: string): number | undefined {
  const m = (msg || '').match(/\b(13\d{4})\b/);
  return m ? Number(m[1]) : undefined;
}
// Primeiro nome APRESENTÁVEL: contato criado pelo webhook sem nome fica com o telefone no
// campo nome — "Olá, 5551981..." queima a campanha. Nome numérico/curto demais → ''.
const primeiroNome = (nome: string) => {
  const p = (nome ?? '').trim().split(/\s+/)[0] ?? '';
  return (/^[+\d()\-.]*$/.test(p) || p.length < 2) ? '' : p;
};

// Mesma regra do bot-remarketing: variável com rótulo de nome → primeiro nome do contato;
// o resto sai com o exemplo cadastrado (a Meta recusa parâmetro vazio — 132000).
function varsDoTemplate(variaveis: unknown, primeiro: string): string[] {
  const defs = Array.isArray(variaveis) ? variaveis as Array<Record<string, unknown>> : [];
  return defs.map((d) => {
    const rotulo = String(d?.rotulo ?? '').toLowerCase();
    // variável de nome: primeiro nome real ou o neutro 'cliente' — NUNCA o exemplo da Meta
    // (mandar o nome do exemplo pra pessoa errada é pior que o genérico).
    if (/nome|primeiro|cliente/.test(rotulo)) return primeiro || 'cliente';
    const ex = String(d?.exemplo ?? '').trim();
    return ex || 'cliente';
  });
}
function preencherTemplate(corpo: string, vars: string[]): string {
  return (corpo ?? '').replace(/\{\{\s*(\d+)\s*\}\}/g, (_m, n) => vars[Number(n) - 1] ?? '');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // usuário do JWT (o gateway já validou a assinatura; aqui resolvemos quem é)
    const authHeader = req.headers.get('Authorization') ?? '';
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: 'Não autenticado.' }, 401);

    const body = await req.json().catch(() => ({}));
    const campanhaId = String(body.campanha_id ?? '');
    const dryRun = body.dry_run !== false;                       // default SEMPRE simular
    const lote = Math.min(Math.max(Number(body.lote) || 10, 1), LOTE_MAX);
    if (!campanhaId) return json({ error: 'campanha_id é obrigatório.' }, 400);

    const { data: camp } = await admin.from('disparo_campanhas')
      .select('id, organizacao_id, canal_id, template_id, nome, status, teto_24h')
      .eq('id', campanhaId).maybeSingle();
    if (!camp) return json({ error: 'Campanha não encontrada.' }, 404);
    if (camp.status !== 'ativa') return json({ error: 'Campanha não está ativa.' }, 409);

    const { data: mem } = await admin.from('organizacao_usuarios').select('status')
      .eq('organizacao_id', camp.organizacao_id).eq('usuario_id', user.id).maybeSingle();
    if (!mem || mem.status !== 'ativo') return json({ error: 'Sem acesso a esta organização.' }, 403);

    const { data: canal } = await admin.from('canais')
      .select('id, nome_interno, transporte, cloud_phone_number_id, numero_conectado, status_integracao, envio_restrito, ativo')
      .eq('id', camp.canal_id).maybeSingle();
    if (!canal || canal.transporte !== 'cloud_api' || !canal.cloud_phone_number_id) return json({ error: 'Canal da campanha não é Cloud API.' }, 409);
    if (!canal.ativo || canal.status_integracao !== 'conectado') return json({ error: 'Canal da campanha não está conectado.' }, 409);
    if (canal.envio_restrito) return json({ error: 'Canal com restrição de envio no WhatsApp.', code: 'canal_restrito' }, 409);

    const { data: tpl } = await admin.from('wa_templates')
      .select('id, nome, idioma, corpo, variaveis, status, ativo, metadados')
      .eq('id', camp.template_id).maybeSingle();
    if (!tpl || !tpl.ativo || tpl.status !== 'aprovado') return json({ error: 'Template não está aprovado/ativo.', code: 'template_nao_aprovado' }, 409);

    // Sem janela de horário: decisão do dono (2026-08-02) — o disparo sai a qualquer
    // hora/dia. O ritmo é controlado pelo lote na tela + teto móvel de 24h abaixo.

    // ---- TETO MÓVEL 24h do canal: alvos enviados (todas as campanhas do canal) + remarketing ----
    const desde = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { count: env24 } = await admin.from('disparo_alvos')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'enviado').gte('enviado_em', desde)
      .in('campanha_id', (await admin.from('disparo_campanhas').select('id').eq('canal_id', camp.canal_id)).data?.map((c) => c.id) ?? [campanhaId]);
    const { count: rmkt24 } = await admin.from('bot_remarketing')
      .select('id', { count: 'exact', head: true }).gte('ultimo_toque_em', desde);
    const usados = (env24 ?? 0) + (rmkt24 ?? 0);
    const restanteTeto = Math.max(0, (camp.teto_24h ?? 200) - usados);
    if (restanteTeto <= 0) return json({ error: `Teto de ${camp.teto_24h}/24h do canal atingido (${usados} enviados).`, code: 'teto_atingido', usados }, 429);

    const efetivo = Math.min(lote, restanteTeto);
    const { data: alvos } = await admin.from('disparo_alvos')
      .select('id, contato_id, telefone')
      .eq('campanha_id', campanhaId).eq('status', 'pendente')
      .order('criado_em', { ascending: true }).limit(efetivo);
    if (!alvos?.length) return json({ ok: true, dry_run: dryRun, processados: 0, mensagem: 'Nenhum alvo pendente.', restante_teto: restanteTeto });

    const numeroCanal = String(canal.numero_conectado ?? '').replace(/\D/g, '');
    const tx = enviadorDe(canal as { transporte?: string | null; instancia_externa?: string | null; cloud_phone_number_id?: string | null });
    const resultados: Array<Record<string, unknown>> = [];
    let enviados = 0, falhas = 0, optouts = 0;

    for (const alvo of alvos) {
      // dados do contato (nome p/ variável, conversa mais recente p/ registrar a mensagem)
      const { data: contato } = await admin.from('contatos').select('id, nome').eq('id', alvo.contato_id).maybeSingle();
      const primeiro = primeiroNome(contato?.nome ?? '');
      const vars = varsDoTemplate(tpl.variaveis, primeiro);
      const textoFinal = preencherTemplate(tpl.corpo ?? '', vars);
      const destino = String(alvo.telefone ?? '').replace(/\D/g, '');

      // re-checagem de opt-out NO MOMENTO do envio (qualquer canal): pode ter pedido SAIR há 1 minuto
      const { data: opt } = await admin.from('wa_optout').select('contato_id').eq('contato_id', alvo.contato_id).limit(1);
      if (opt?.length) {
        if (!dryRun) await admin.from('disparo_alvos').update({ status: 'optout', erro: 'opt-out no momento do envio' }).eq('id', alvo.id).eq('status', 'pendente');
        optouts++; resultados.push({ contato: contato?.nome, status: 'optout' }); continue;
      }
      // DEDUP (pessoa, template): ninguém recebe o MESMO template 2x — checado no log de envios.
      // Roda no dry_run também, pra o Simular mostrar exatamente quem seria removido.
      const { data: jaTpl } = await admin.from('disparo_envios').select('id')
        .eq('contato_id', alvo.contato_id).eq('template_id', tpl.id).limit(1);
      if (jaTpl?.length) {
        if (!dryRun) await admin.from('disparo_alvos').update({ status: 'pulado', erro: 'ja_recebeu_template' }).eq('id', alvo.id).eq('status', 'pendente');
        falhas++; resultados.push({ contato: contato?.nome, status: 'pulado', erro: 'ja_recebeu_template' }); continue;
      }
      if (!destino || destino === numeroCanal) {
        if (!dryRun) await admin.from('disparo_alvos').update({ status: 'pulado', erro: !destino ? 'sem_telefone' : 'autoenvio' }).eq('id', alvo.id).eq('status', 'pendente');
        falhas++; resultados.push({ contato: contato?.nome, status: 'pulado' }); continue;
      }

      if (dryRun) { resultados.push({ contato: contato?.nome, telefone: destino, status: 'simulado', texto: textoFinal }); continue; }

      // trava anti-duplo-clique: só processa se AINDA está pendente (claim atômico por alvo)
      const { data: claim } = await admin.from('disparo_alvos')
        .update({ status: 'falhou', erro: 'processando' }).eq('id', alvo.id).eq('status', 'pendente').select('id');
      if (!claim?.length) { resultados.push({ contato: contato?.nome, status: 'ja_processado' }); continue; }

      let wamid: string | null = null; let erro: string | null = null;
      try {
        const headerImagem = (tpl.metadados as { header_imagem?: string | null } | null)?.header_imagem ?? null;
        const r = await tx.sendTemplate(destino, { nome: tpl.nome, idioma: tpl.idioma, variaveis: vars, headerImagem });
        wamid = r?.key?.id ?? null;
        if (!wamid) erro = 'sem_id_externo';
      } catch (e) { erro = ((e as Error)?.message ?? 'erro_cloud').slice(0, 300); }

      if (erro && codigoMeta(erro) === 131050) {
        await admin.rpc('wa_optout_registrar', { p_contato: alvo.contato_id, p_canal: canal.id, p_motivo: 'erro_131050', p_detalhe: erro });
        await admin.from('disparo_alvos').update({ status: 'optout', erro }).eq('id', alvo.id);
        optouts++; resultados.push({ contato: contato?.nome, status: 'optout_meta' });
      } else if (erro || !wamid) {
        await admin.from('disparo_alvos').update({ status: 'falhou', erro: erro ?? 'desconhecido' }).eq('id', alvo.id);
        falhas++; resultados.push({ contato: contato?.nome, status: 'falhou', erro });
      } else {
        const agoraEnvio = new Date().toISOString();
        await admin.from('disparo_alvos').update({ status: 'enviado', wamid, erro: null, enviado_em: agoraEnvio }).eq('id', alvo.id);
        // LOG append-only de envios (Fase 2b): imune ao re-arme da campanha; alimenta o resultado.
        const { error: eLog } = await admin.from('disparo_envios').insert({
          organizacao_id: camp.organizacao_id, campanha_id: camp.id, contato_id: alvo.contato_id,
          template_id: tpl.id, wamid, enviado_em: agoraEnvio,
        });
        if (eLog) console.error('disparo_envios insert falhou', eLog.message);
        enviados++; resultados.push({ contato: contato?.nome, status: 'enviado', wamid });
        // OUTBOX: registra na conversa mais recente do contato — o que o cliente leu tem que existir no painel
        const { data: conv } = await admin.from('conversas').select('id')
          .eq('contato_id', alvo.contato_id).order('criado_em', { ascending: false }).limit(1).maybeSingle();
        if (conv) {
          const { error: eMsg } = await admin.from('mensagens').insert({
            organizacao_id: camp.organizacao_id, conversa_id: conv.id,
            direcao: 'saida', tipo: 'texto', conteudo: textoFinal, autor_id: user.id, origem: 'bot',
            status: 'enviada', id_externo: wamid,
            metadados: { via: 'disparo', transporte: 'cloud_api', campanha_id: camp.id, campanha: camp.nome, template: tpl.nome, template_id: tpl.id, canal_disparo: canal.nome_interno },
          });
          if (!eMsg) await admin.from('conversas').update({ ultima_interacao_em: new Date().toISOString() }).eq('id', conv.id);
        }
      }
      await dormir(1500 + Math.floor(Math.random() * 1500));      // jitter 1,5–3s: nunca rajada
    }

    // campanha concluída quando não sobra pendente
    if (!dryRun) {
      const { count: pend } = await admin.from('disparo_alvos').select('id', { count: 'exact', head: true })
        .eq('campanha_id', campanhaId).eq('status', 'pendente');
      if ((pend ?? 0) === 0) await admin.from('disparo_campanhas').update({ status: 'concluida', atualizado_em: new Date().toISOString() }).eq('id', campanhaId);
    }

    try {
      await admin.from('audit_log').insert({
        usuario_id: user.id, acao: 'disparo_processar', entidade: 'disparo_campanhas', entidade_id: camp.id,
        organizacao_id: camp.organizacao_id,
        dados_depois: { dry_run: dryRun, lote, enviados, falhas, optouts, teto_24h: camp.teto_24h, usados_antes: usados },
      });
    } catch { /* audit best-effort */ }

    return json({ ok: true, dry_run: dryRun, processados: alvos.length, enviados, falhas, optouts, restante_teto: restanteTeto - enviados, resultados });
  } catch (e) { return json({ error: (e as Error)?.message ?? 'erro' }, 500); }
});
