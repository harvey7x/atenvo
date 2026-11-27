// reviza-wa-instancia (v13, dono 06/11: "qualquer um pode conectar o seu próprio WhatsApp, somente o
//  seu" — COMERCIAL entra pra criar/gerenciar, mas só o PRÓPRIO canal; definir_dono/remover continuam
//  cadastro/financeiro/gestor/admin) (v12: configuração inicial — cadastro/financeiro também conectam
//  números) (v11: verificar confere o segredo e relê; sem sinal = aviso; dono ativo) (v10: verificar
//  conexão+webhook, definir dono, não trava em 'conectando') — gerencia instâncias Evolution da Reviza
//  (verify_jwt=true).
// v2: UM CANAL POR ATENDENTE (como na demo): 'create' recebe o nome do atendente
// e cria/reaproveita o canal dele; 'qr'/'status'/'logout' recebem canal_id.
// Papéis: cadastro/financeiro/gestor/admin mexem em QUALQUER canal; comercial só no PRÓPRIO
// (dono_id = ele mesmo — nunca confia no que vier no corpo). definir_dono/remover continuam sem
// comercial (trocar dono ou apagar é decisão de quem configura a equipe). Webhook aponta pro
// Supabase da Reviza — dados isolados.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { evolution, evolutionConfigured, extractQr, WH_EVENTS } from './evolution.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const instanceNameOf = (canalId: string) => `reviza_${canalId.replace(/-/g, '')}`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    if (!evolutionConfigured()) return json({ error: 'Evolution não configurada (defina EVOLUTION_API_URL e EVOLUTION_API_KEY nos secrets).' }, 503);

    const url = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const secret = Deno.env.get('WA_WEBHOOK_SECRET') ?? '';
    const authHeader = req.headers.get('Authorization') ?? '';

    const asUser = createClient(url, anon, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });
    const { data: u } = await asUser.auth.getUser();
    const uid = u?.user?.id;
    if (!uid) return json({ error: 'não autenticado' }, 401);
    const { data: perfil } = await asUser.from('profiles').select('papel, ativo').eq('id', uid).maybeSingle();

    const body = await req.json().catch(() => ({}));
    const acao = body.acao;
    // v13 (dono 06/11): comercial entra na lista geral, mas 'definir_dono' e 'remover' (trocar o dono
    // de um número ou apagá-lo) continuam só de quem configura a equipe.
    const PAPEIS_GERAL = ['cadastro', 'financeiro', 'gestor', 'admin', 'comercial'];
    const SO_CONFIGURACAO = new Set(['definir_dono', 'remover']);
    if (!perfil || !perfil.ativo || !PAPEIS_GERAL.includes(perfil.papel)) return json({ error: 'sem permissão' }, 403);
    if (SO_CONFIGURACAO.has(acao) && perfil.papel === 'comercial') return json({ error: 'sem permissão' }, 403);
    // privilegiado = mexe em QUALQUER canal (como já era); comercial só no PRÓPRIO (dono_id = ele mesmo)
    const privilegiado = perfil.papel !== 'comercial';
    const admin = createClient(url, service, { auth: { persistSession: false } });
    const webhookUrl = `${url}/functions/v1/reviza-wa-webhook`;

    const porId = async (id: string) => (await admin.from('wa_canais').select('*').eq('id', id).maybeSingle()).data;

    if (acao === 'create') {
      const nome = String(body.nome ?? 'WhatsApp Reviza').trim() || 'WhatsApp Reviza';
      // dono do canal = o ATENDENTE (privacidade: só ele e gestor/admin veem as conversas).
      // comercial nunca escolhe o dono pelo corpo — é sempre ele mesmo, mesmo que mande outro id.
      const donoId = privilegiado ? (typeof body.dono_id === 'string' && body.dono_id ? body.dono_id : null) : uid;
      if (donoId) {
        const { data: p } = await admin.from('profiles').select('id').eq('id', donoId).maybeSingle();
        if (!p) return json({ error: 'atendente inválido' }, 400);
      }
      // reaproveita o canal deste atendente (por dono, senão por nome), senão cria
      const { data: porDono } = donoId
        ? await admin.from('wa_canais').select('*').eq('dono_id', donoId).limit(1).maybeSingle()
        : { data: null };
      // reaproveita pelo nome só um número SEM dono (ou do mesmo dono) — nunca o de outro atendente
      let qNome = admin.from('wa_canais').select('*').ilike('nome', nome.replace(/[%_\\]/g, (c) => `\\${c}`));   // nome exato (sem curinga)
      qNome = donoId ? qNome.or(`dono_id.is.null,dono_id.eq.${donoId}`) : qNome.is('dono_id', null);
      const { data: porNome } = porDono ? { data: null } : await qNome.limit(1).maybeSingle();
      let canal = porDono ?? porNome;
      if (!canal) {
        const ins = await admin.from('wa_canais').insert({ nome, dono_id: donoId, instancia: `pendente-${crypto.randomUUID()}`, criado_por: uid }).select().single();
        if (ins.error) return json({ error: ins.error.message }, 400);
        canal = ins.data;
      }
      const instancia = instanceNameOf(canal.id);
      await admin.from('wa_canais').update({ instancia, estado: 'conectando', qr: null, ultimo_erro: null, nome, ...(donoId ? { dono_id: donoId } : {}) }).eq('id', canal.id);
      let qr: string | null = null;
      try {
        const created = await evolution.createInstance(instancia, webhookUrl, secret);
        qr = extractQr(created);
      } catch (_e) { /* provavelmente já existe — segue pro connect */ }
      try { await evolution.setWebhook(instancia, webhookUrl, secret); } catch { /* tolerante */ }
      // já estava aberto (reconectar um número vivo)? grava conectado e não pede QR
      try {
        const st = await evolution.connectionState(instancia);
        if (st?.instance?.state === 'open') {
          await admin.from('wa_canais').update({ estado: 'conectado', qr: null, verificado_em: new Date().toISOString() }).eq('id', canal.id);
          return json({ canal_id: canal.id, instancia, qr: null, ja_conectado: true });
        }
      } catch { /* segue pro QR */ }
      if (!qr) { try { qr = extractQr(await evolution.connect(instancia)); } catch { /* pode já estar conectado */ } }
      if (qr) await admin.from('wa_canais').update({ qr }).eq('id', canal.id);
      return json({ canal_id: canal.id, instancia, qr });
    }

    const canalId = String(body.canal_id ?? '');

    // reaplica o webhook (ex.: lista de eventos mudou) sem mexer em mais nada
    if (acao === 'webhook') {
      const canal = canalId ? await porId(canalId) : null;
      if (!privilegiado && canal && canal.dono_id !== uid) return json({ error: 'este número não é seu' }, 403);
      if (!canal || canal.instancia.startsWith('pendente')) return json({ error: 'canal sem instância' }, 400);
      await evolution.setWebhook(canal.instancia, webhookUrl, secret);
      return json({ ok: true, instancia: canal.instancia });
    }

    if (acao === 'qr') {
      const canal = canalId ? await porId(canalId) : null;
      if (!canal || canal.instancia.startsWith('pendente')) return json({ error: 'nenhuma instância criada — use "conectar" primeiro.' }, 400);
      if (!privilegiado && canal.dono_id !== uid) return json({ error: 'este número não é seu' }, 403);
      // já está aberto? não derruba pra "conectando" (nenhum evento chegaria pra voltar)
      try {
        const st = await evolution.connectionState(canal.instancia);
        if (st?.instance?.state === 'open') {
          await admin.from('wa_canais').update({ estado: 'conectado', qr: null, verificado_em: new Date().toISOString() }).eq('id', canal.id);
          return json({ canal_id: canal.id, qr: null, ja_conectado: true });
        }
      } catch { /* segue pro QR */ }
      const qr = extractQr(await evolution.connect(canal.instancia));
      await admin.from('wa_canais').update({ qr, estado: 'conectando' }).eq('id', canal.id);
      return json({ canal_id: canal.id, qr });
    }

    // VERIFICAR: sessão aberta de verdade? webhook apontando pra cá com todos os eventos?
    // Se faltar algo no webhook, reaplica (sem mexer na conexão nem mandar mensagem).
    if (acao === 'verificar') {
      const canal = canalId ? await porId(canalId) : null;
      if (!canal) return json({ error: 'número não encontrado' }, 404);
      if (!privilegiado && canal.dono_id !== uid) return json({ error: 'este número não é seu' }, 403);
      if (canal.instancia.startsWith('pendente')) return json({ canal_id: canal.id, estado: 'desconectado', webhook_ok: false, detalhe: 'número ainda não foi conectado' });
      let estado = canal.estado as string;
      let detalhe = '';
      let sessaoOk = false;
      try {
        const st = await evolution.connectionState(canal.instancia);
        const s = st?.instance?.state;
        estado = s === 'open' ? 'conectado' : s === 'connecting' ? 'conectando' : 'desconectado';
        sessaoOk = true;
      } catch (e) { detalhe = `não deu pra consultar a sessão: ${String((e as Error)?.message ?? e)}`; }
      // webhook certo = ligado, apontando pra cá, com TODOS os eventos e o header do segredo
      const confere = (w: Awaited<ReturnType<typeof evolution.webhookFind>>) => {
        const cfgW = (w?.webhook ?? w) ?? {};
        const eventos = new Set((cfgW.events ?? []).map((x) => String(x).toUpperCase()));
        const hdr = (cfgW.headers ?? {}) as Record<string, string>;
        const segredoOk = !secret || !Object.keys(hdr).length || hdr['x-webhook-secret'] === secret;   // versões que não devolvem headers: não dá pra afirmar o contrário
        return !!cfgW.enabled && cfgW.url === webhookUrl && WH_EVENTS.every((e) => eventos.has(e)) && segredoOk;
      };
      let webhookOk = false, reaplicado = false;
      try {
        webhookOk = confere(await evolution.webhookFind(canal.instancia));
        if (!webhookOk) {
          await evolution.setWebhook(canal.instancia, webhookUrl, secret);
          reaplicado = true;
          webhookOk = confere(await evolution.webhookFind(canal.instancia));   // relê: confirma que ficou certo
          if (!webhookOk) detalhe = detalhe || 'o webhook não ficou configurado — reconecte o número (novo QR)';
        }
      } catch (e) { detalhe = detalhe || `não deu pra conferir o webhook: ${String((e as Error)?.message ?? e)}`; }
      const semSinal = !canal.ultimo_evento_em || Date.now() - new Date(canal.ultimo_evento_em).getTime() > 3 * 86_400_000;
      if (estado === 'conectado' && webhookOk && semSinal && !detalhe) {
        detalhe = 'nenhuma mensagem recebida recentemente — mande um "oi" de outro celular pra este número e veja se aparece em Conversas';
      }
      if (sessaoOk) {
        await admin.from('wa_canais').update({
          estado, verificado_em: new Date().toISOString(),
          ...(estado === 'conectado' ? { ultimo_erro: null, qr: null } : {}),
        }).eq('id', canal.id);
      }
      return json({ canal_id: canal.id, estado, numero: canal.numero, webhook_ok: webhookOk, webhook_reaplicado: reaplicado, sem_sinal: semSinal, ultimo_evento_em: canal.ultimo_evento_em ?? null, detalhe });
    }

    // DONO do número (o atendente): só ele e o admin veem as conversas; a régua casa
    // o comercial do cliente com o dono do número. NÃO mexe na conexão.
    if (acao === 'definir_dono') {
      const canal = canalId ? await porId(canalId) : null;
      if (!canal) return json({ error: 'número não encontrado' }, 404);
      const donoId = typeof body.dono_id === 'string' && body.dono_id ? body.dono_id : null;
      let nome = canal.nome;
      if (donoId) {
        const { data: p } = await admin.from('profiles').select('id, nome, ativo').eq('id', donoId).maybeSingle();
        if (!p) return json({ error: 'atendente inválido' }, 400);
        if (!p.ativo) return json({ error: 'este usuário está inativo — ative em Usuários antes' }, 400);
        const { data: outro } = await admin.from('wa_canais').select('id, nome').eq('dono_id', donoId).neq('id', canal.id).limit(1).maybeSingle();
        if (outro) return json({ error: `${p.nome ?? 'Este atendente'} já é dono do número "${outro.nome}"` }, 409);
        nome = String(p.nome ?? canal.nome).trim().toLowerCase() || canal.nome;
      }
      const { error } = await admin.from('wa_canais').update({ dono_id: donoId, nome }).eq('id', canal.id);
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true, canal_id: canal.id, dono_id: donoId, nome });
    }

    if (acao === 'status') {
      // comercial precisa dizer QUAL canal (nunca o "primeiro da tabela" — vazaria o de outro atendente)
      const canal = canalId ? await porId(canalId)
        : (privilegiado ? (await admin.from('wa_canais').select('*').order('created_at').limit(1).maybeSingle()).data : null);
      if (!privilegiado && canal && canal.dono_id !== uid) return json({ error: 'este número não é seu' }, 403);
      if (!canal || canal.instancia.startsWith('pendente')) return json({ estado: 'desconectado' });
      let estado = canal.estado;
      try {
        const st = await evolution.connectionState(canal.instancia);
        const s = st?.instance?.state;
        estado = s === 'open' ? 'conectado' : s === 'connecting' ? 'conectando' : 'desconectado';
        if (estado !== canal.estado) await admin.from('wa_canais').update({ estado }).eq('id', canal.id);
      } catch { /* usa o estado do banco (webhook mantém atualizado) */ }
      return json({ canal_id: canal.id, estado, numero: canal.numero });
    }

    if (acao === 'logout') {
      const canal = canalId ? await porId(canalId) : null;
      if (!privilegiado && canal && canal.dono_id !== uid) return json({ error: 'este número não é seu' }, 403);
      if (!canal || canal.instancia.startsWith('pendente')) return json({ ok: true });
      try { await evolution.logout(canal.instancia); } catch { /* tolerante */ }
      await admin.from('wa_canais').update({ estado: 'desconectado', qr: null, numero: null }).eq('id', canal.id);
      return json({ ok: true });
    }

    // remove o número: desconecta e apaga a instância na Evolution, depois o canal (conversas em cascata)
    if (acao === 'remover') {
      const canal = canalId ? await porId(canalId) : null;
      if (!canal) return json({ ok: true });
      if (!canal.instancia.startsWith('pendente')) {
        try { await evolution.logout(canal.instancia); } catch { /* tolerante */ }
        try { await evolution.remove(canal.instancia); } catch { /* tolerante */ }
      }
      const del = await admin.from('wa_canais').delete().eq('id', canal.id);
      if (del.error) return json({ error: del.error.message }, 400);
      return json({ ok: true });
    }

    return json({ error: 'ação desconhecida' }, 400);
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
