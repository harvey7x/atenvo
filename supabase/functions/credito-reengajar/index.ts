// credito-reengajar — one-off: reenvia a ABERTURA nova (banner + 3 frentes + OAB + botões) pros leads
// do OFICIAL 1390 que NÃO terminaram o fluxo e ainda estão com a janela de 24h aberta. Reseta cada um
// pra 'aguardando_abertura' (ao tocar um botão, o fluxo segue normal). Reusa o MESMO motor/copy do bot.
//
// SEGURO: dry_run=true por DEFAULT (lista quem receberia, NÃO envia). Envio real só com dry_run:false.
// auth por x-bot-secret == webhook_config.credito_nudge. Respeita opt-out e janela de 24h.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { enviadorDe } from '../evolution-send/transporte.ts';
import { proximoPasso, opcoesDaTela } from '../bot-runner/fluxo_botoes.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const BANNER_URL = (Deno.env.get('CREDITO_BANNER_URL') ?? '').trim();
const CANAL_OFICIAL = '27f32142-3853-4316-9262-445c364cc0f0';
const CONTATO_TESTE = '1cfc7b68-d739-4163-a541-8ac6c30f22cc';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type, x-bot-secret', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const secretHeader = req.headers.get('x-bot-secret') ?? '';
    const { data: wc } = await admin.from('webhook_config').select('secret').eq('chave', 'credito_nudge').maybeSingle();
    if (!wc?.secret || secretHeader !== wc.secret) return json({ error: 'unauthorized' }, 401);

    const body = await req.json().catch(() => ({})) as { dry_run?: boolean; limit?: number };
    const dryRun = body.dry_run !== false;   // DEFAULT seguro
    const limite = Math.min(Math.max(1, body.limit ?? 50), 100);

    // canal OFICIAL (Cloud)
    const { data: canal } = await admin.from('canais')
      .select('id, organizacao_id, nome_interno, numero_conectado, transporte, cloud_phone_number_id, instancia_externa, envio_restrito, ativo')
      .eq('id', CANAL_OFICIAL).maybeSingle();
    if (!canal || canal.transporte !== 'cloud_api') return json({ error: 'canal_oficial_invalido' }, 400);

    // alvos: mid-fluxo (passo != ''/fim), não pausado, janela 24h aberta, sem opt-out, fora do contato de teste
    const desde24h = new Date(Date.now() - 24 * 3600e3).toISOString();
    const { data: estados } = await admin.from('bot_conversa_estado')
      .select('conversa_id, dados_qualificacao, pausado, conversas!inner(id, contato_id, status, organizacao_id, canal_id)')
      .eq('conversas.canal_id', CANAL_OFICIAL)
      .neq('conversas.status', 'fechada')
      .limit(300);

    const alvos: Array<{ conversa_id: string; contato_id: string; org: string }> = [];
    for (const e of (estados ?? []) as Array<any>) {
      const passo = String(e.dados_qualificacao?.passo_botoes ?? '');
      if (passo === '' || passo === 'fim') continue;
      if (e.pausado) continue;
      const cv = e.conversas;
      if (!cv?.contato_id || cv.contato_id === CONTATO_TESTE) continue;
      // opt-out?
      const { data: opt } = await admin.from('wa_optout').select('contato_id').eq('contato_id', cv.contato_id).limit(1);
      if (opt && opt.length) continue;
      // janela 24h: última mensagem de ENTRADA do contato nessa conversa
      const { data: ult } = await admin.from('mensagens').select('criado_em')
        .eq('conversa_id', cv.id).eq('direcao', 'entrada').order('criado_em', { ascending: false }).limit(1).maybeSingle();
      if (!ult?.criado_em || ult.criado_em < desde24h) continue;
      alvos.push({ conversa_id: cv.id, contato_id: cv.contato_id, org: cv.organizacao_id });
    }

    // abertura (mesma do bot): telas + ids dos botões
    const abertura = proximoPasso(null, { texto: '', ehAudio: false, toqueId: null }, 0);
    const telas = abertura.acao === 'enviar' ? abertura.telas : [];
    const opcoes = opcoesDaTela(telas as any);
    const tx = enviadorDe(canal as any);

    const resultados: any[] = [];
    let enviados = 0;
    for (const a of alvos.slice(0, limite)) {
      const { data: ident } = await admin.from('contato_identidades')
        .select('valor_normalizado').eq('contato_id', a.contato_id).eq('tipo', 'whatsapp')
        .not('valor_normalizado', 'is', null).order('principal', { ascending: false }).limit(1).maybeSingle();
      const destino = ident?.valor_normalizado ?? null;
      if (!destino) { resultados.push({ conversa_id: a.conversa_id, status: 'sem_destino' }); continue; }
      if (destino === (canal.numero_conectado ?? null)) { resultados.push({ conversa_id: a.conversa_id, status: 'autoenvio' }); continue; }

      if (dryRun) { resultados.push({ conversa_id: a.conversa_id, status: 'simulado', destino_fim: destino.slice(-4) }); continue; }

      try {
        // banner com a saudação (telas[0]) como legenda
        const legenda = (telas[0] && (telas[0] as any).tipo === 'texto') ? (telas[0] as any).corpo : undefined;
        let pulaPrimeiro = false;
        if (BANNER_URL) {
          const b = await tx.sendMedia(destino, 'image', 'image/jpeg', BANNER_URL, 'banner.jpg', legenda);
          if (b?.key?.id) {
            pulaPrimeiro = !!legenda;
            await admin.from('mensagens').insert({ organizacao_id: a.org, conversa_id: a.conversa_id, direcao: 'saida', tipo: 'imagem', conteudo: legenda ?? '📷', autor_id: null, origem: 'bot', status: 'enviada', id_externo: b.key.id, metadados: { fluxo: 'reengajar', etapa: 'banner' } });
          }
          await sleep(900);
        }
        for (let i = (pulaPrimeiro ? 1 : 0); i < telas.length; i++) {
          const t = telas[i] as any;
          if (i > (pulaPrimeiro ? 1 : 0)) await sleep(900);
          let sent: any;
          if (t.tipo === 'botoes') sent = await tx.sendBotoes(destino, t.corpo, t.botoes.map((b: any) => ({ id: b.id, titulo: b.titulo })));
          else sent = await tx.sendText(destino, t.corpo);
          const conteudo = t.tipo === 'botoes' ? `${t.corpo}` : t.corpo;
          await admin.from('mensagens').insert({ organizacao_id: a.org, conversa_id: a.conversa_id, direcao: 'saida', tipo: 'texto', conteudo, autor_id: null, origem: 'bot', status: 'enviada', id_externo: sent?.key?.id ?? null, metadados: { fluxo: 'reengajar', tela: t } });
        }
        // reseta o estado pro topo (ao tocar um botão, segue o fluxo)
        await admin.from('bot_conversa_estado').update({ pausado: false, dados_qualificacao: { passo_botoes: 'aguardando_abertura', tentativas: 0, ultimas_opcoes: opcoes } }).eq('conversa_id', a.conversa_id);
        await admin.from('conversas').update({ ultima_interacao_em: new Date().toISOString() }).eq('id', a.conversa_id);
        enviados++;
        resultados.push({ conversa_id: a.conversa_id, status: 'enviada', destino_fim: destino.slice(-4) });
      } catch (e) {
        resultados.push({ conversa_id: a.conversa_id, status: 'falhou', erro: String((e as Error)?.message ?? '').slice(0, 200) });
      }
      await sleep(1500);   // respiro entre contatos (saúde do número)
    }

    return json({ ok: true, dry_run: dryRun, candidatos: alvos.length, enviados, resultados });
  } catch (e) { return json({ error: (e as Error)?.message ?? 'erro' }, 500); }
});
