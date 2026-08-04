// credito-nudge — cutuca o lead do fluxo de CRÉDITO que recebeu o cartão do atendente (Murillo 5329)
// e NÃO respondeu. Manda até 3 mensagens em 15 min (padrão +5/+10/+15) na conversa do 1390. PARA no
// instante em que o cliente age (qualquer inbound do contato após o handoff — chamou o Murillo OU
// voltou a falar aqui). Depois disso, o atendente humano assume (a conversa já foi atribuída no rodízio).
//
// MODO SEGURO (igual janela-guardia / bot-remarketing):
//   * CREDITO_NUDGE_ATIVO=nao por DEFAULT → lista quem receberia e loga, mas NÃO envia.
//   * dry_run=true por DEFAULT → mesmo com ATIVO on, simula.
//   * envio real SÓ com CREDITO_NUDGE_ATIVO=sim E dry_run=false.
//   * auth por x-bot-secret == webhook_config.credito_nudge. Deploy --no-verify-jwt.
//
// Estado por conversa vive em bot_conversa_estado.dados_qualificacao:
//   handoff_em (gravado pelo bot-runner no fecho 'contato_murillo'), nudge_count, nudge_ultima_em,
//   nudge_parou (setado quando o cliente responde → não cutuca mais).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { enviadorDe } from '../evolution-send/transporte.ts';
import { saidaSuja } from '../bot-runner/guardrail.ts';
import { chaveTel } from '../bot-runner/fluxo_botoes.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ATIVO = (Deno.env.get('CREDITO_NUDGE_ATIVO') ?? 'nao').toLowerCase() === 'sim';
const PASSO_MIN = Math.max(1, Number(Deno.env.get('CREDITO_NUDGE_PASSO_MIN')) || 5);   // +5/+10/+15
const MAX_NUDGES = 3;
const JANELA_HORAS = 24;   // só handoffs recentes entram (dentro da janela de serviço da Cloud)
// Mesma allowlist do bot (CLOUD_BOT_ENVIO_REAL_ALLOWLIST): VAZIA = todos liberados (produção); com
// números = SÓ eles recebem nudge real (o resto simula). É a trava de teste — sem ela, ligar a função
// cutucaria qualquer handoff real das últimas 24h.
const ALLOWLIST = (Deno.env.get('CLOUD_BOT_ENVIO_REAL_ALLOWLIST') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const liberado = (destino: string | null) => !!destino && (ALLOWLIST.length === 0 || ALLOWLIST.some((a) => chaveTel(a) === chaveTel(destino)));

const NUDGES = [
  Deno.env.get('CREDITO_NUDGE_1') ?? 'Oi {nome}! Vi que você ainda não falou com o nosso atendente. É só tocar no contato que te enviei e mandar um "oi" que já te atendemos. 😊',
  Deno.env.get('CREDITO_NUDGE_2') ?? '{nome}, seu atendimento está reservado! Chama a gente no contato acima pra não perder a vez. 💚',
  Deno.env.get('CREDITO_NUDGE_3') ?? 'Podemos continuar, {nome}? Se ainda tiver interesse em reduzir juros ou aumentar margem, é só mandar mensagem pro nosso atendente. Estamos te esperando! 🙌',
];

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type, x-bot-secret', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

function preencherNome(texto: string, primeiro: string): string {
  // {nome} vira o primeiro nome; sem nome real, remove o vocativo sem deixar vírgula solta.
  if (primeiro) return texto.replaceAll('{nome}', primeiro);
  return texto.replaceAll('Oi {nome}! ', 'Oi! ').replaceAll('{nome}, ', '').replaceAll('{nome}', '').replace(/\s{2,}/g, ' ').trim();
}
function primeiroNome(nome: string): string {
  const cru = String(nome ?? '').trim();
  if (!cru || /^[\d\s()+\-]+$/.test(cru)) return '';   // telefone puro não vira vocativo
  return cru.split(/\s+/)[0] ?? '';
}
function codigoMeta(msg: string): number | undefined {
  const m = (msg || '').match(/\b(13\d{4})\b/);
  return m ? Number(m[1]) : undefined;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const secretHeader = req.headers.get('x-bot-secret') ?? '';
    const { data: wc } = await admin.from('webhook_config').select('secret').eq('chave', 'credito_nudge').maybeSingle();
    if (!wc?.secret || secretHeader !== wc.secret) return json({ error: 'unauthorized' }, 401);

    const body = await req.json().catch(() => ({})) as { dry_run?: boolean };
    const dryRun = body.dry_run !== false;   // DEFAULT seguro
    const podeEnviar = ATIVO && !dryRun;
    const motivoSemEnvio = !ATIVO ? 'master_off' : dryRun ? 'dry_run' : null;

    const agora = new Date();
    const cutoff = new Date(agora.getTime() - JANELA_HORAS * 3600e3).toISOString();

    // candidatos: fecho de crédito ('contato_murillo') com handoff_em recente. nudge_count/parou/timing
    // são filtrados em JS (jsonb text). Limite generoso — o cron roda por minuto.
    const { data: estados } = await admin.from('bot_conversa_estado')
      .select('conversa_id, dados_qualificacao')
      .eq('dados_qualificacao->>preferencia', 'contato_murillo')
      .not('dados_qualificacao->>handoff_em', 'is', null)
      .gte('dados_qualificacao->>handoff_em', cutoff)
      .limit(300);

    const resultados: any[] = [];
    let enviados = 0;
    for (const est of (estados ?? []) as Array<any>) {
      const dq = (est.dados_qualificacao ?? {}) as Record<string, unknown>;
      const nudgeCount = Number(dq.nudge_count ?? 0) || 0;
      if (dq.nudge_parou || nudgeCount >= MAX_NUDGES) continue;
      const handoffEm = String(dq.handoff_em ?? '');
      const handoffMs = Date.parse(handoffEm);
      if (!handoffMs) continue;

      // o nudge DEVIDO agora é o (nudgeCount+1)-ésimo, liberado em handoff + n*PASSO_MIN.
      const n = nudgeCount + 1;
      const dueMs = handoffMs + n * PASSO_MIN * 60e3;
      if (agora.getTime() < dueMs) continue;   // ainda não é hora deste nudge

      // dados da conversa + contato + canal
      const { data: conv } = await admin.from('conversas')
        .select('id, contato_id, canal_id, organizacao_id, contatos(nome)')
        .eq('id', est.conversa_id).maybeSingle();
      if (!conv?.contato_id) continue;

      // CLIENTE AGIU? qualquer inbound do contato (em QUALQUER conversa) após o handoff → para de cutucar.
      const { data: convsDoContato } = await admin.from('conversas').select('id').eq('contato_id', conv.contato_id);
      const idsConversas = (convsDoContato ?? []).map((c: any) => c.id);
      let respondeu = false;
      if (idsConversas.length) {
        const { data: inb } = await admin.from('mensagens').select('id')
          .in('conversa_id', idsConversas).eq('direcao', 'entrada').gt('criado_em', handoffEm).limit(1);
        respondeu = !!(inb && inb.length);
      }
      if (respondeu) {
        await admin.from('bot_conversa_estado').update({ dados_qualificacao: { ...dq, nudge_parou: true, nudge_parou_em: agora.toISOString() } }).eq('conversa_id', est.conversa_id);
        resultados.push({ conversa_id: est.conversa_id, status: 'parou_cliente_respondeu' });
        continue;
      }

      // opt-out da Meta → nunca cutuca
      const { data: opt } = await admin.from('wa_optout').select('contato_id').eq('contato_id', conv.contato_id).limit(1);
      if (opt && opt.length) { resultados.push({ conversa_id: est.conversa_id, status: 'optout' }); continue; }

      const { data: canal } = await admin.from('canais')
        .select('id, nome_interno, numero_conectado, transporte, cloud_phone_number_id, instancia_externa, envio_restrito, ativo')
        .eq('id', conv.canal_id).maybeSingle();
      const ehCloud = (canal?.transporte as string | null) === 'cloud_api';
      if (!canal || !ehCloud || canal.envio_restrito || canal.ativo === false) {
        resultados.push({ conversa_id: est.conversa_id, status: 'canal_invalido' }); continue;
      }

      const { data: ident } = await admin.from('contato_identidades')
        .select('valor_normalizado').eq('contato_id', conv.contato_id).eq('tipo', 'whatsapp')
        .not('valor_normalizado', 'is', null).order('principal', { ascending: false }).limit(1).maybeSingle();
      const destino = ident?.valor_normalizado ?? null;

      const primeiro = primeiroNome((conv as any).contatos?.nome ?? '');
      const texto = preencherNome(NUDGES[nudgeCount] ?? NUDGES[NUDGES.length - 1], primeiro);
      if (saidaSuja(texto)) { resultados.push({ conversa_id: est.conversa_id, status: 'guardrail_bloqueou', nudge: n }); continue; }

      // envio real exige: master on + não-dry + número liberado na allowlist (trava de teste).
      const enviarReal = podeEnviar && liberado(destino);
      if (!enviarReal) {
        resultados.push({ conversa_id: est.conversa_id, status: podeEnviar ? 'simulado_fora_allowlist' : 'simulado', nudge: n, texto });
        continue;
      }
      if (!destino || !canal.cloud_phone_number_id) {
        resultados.push({ conversa_id: est.conversa_id, status: 'sem_destino', nudge: n }); continue;
      }
      if (destino === (canal.numero_conectado ?? null)) {
        resultados.push({ conversa_id: est.conversa_id, status: 'autoenvio', nudge: n }); continue;
      }

      const tx = enviadorDe(canal as { transporte?: string | null; instancia_externa?: string | null; cloud_phone_number_id?: string | null });
      let idExterno: string | null = null; let erro: string | null = null; let codigo: number | undefined;
      try {
        const sent = await tx.sendText(destino, texto);
        idExterno = sent?.key?.id ?? null;
        if (!idExterno) erro = 'sem_id_externo';
      } catch (e) {
        const msg = (e as Error)?.message ?? 'erro_cloud';
        erro = msg.slice(0, 300); codigo = codigoMeta(msg);
      }

      if (codigo === 131050) {
        await admin.rpc('wa_optout_registrar', { p_contato: conv.contato_id, p_canal: canal.id, p_motivo: 'erro_131050', p_detalhe: erro ?? null });
        await admin.from('bot_conversa_estado').update({ dados_qualificacao: { ...dq, nudge_parou: true } }).eq('conversa_id', est.conversa_id);
        resultados.push({ conversa_id: est.conversa_id, status: 'optout_meta', nudge: n }); continue;
      }

      if (idExterno) {
        // marca o contador ANTES de qualquer coisa poder falhar (a msg já saiu; reenviar é o que queima o número)
        await admin.from('bot_conversa_estado').update({ dados_qualificacao: { ...dq, nudge_count: n, nudge_ultima_em: agora.toISOString() } }).eq('conversa_id', est.conversa_id);
        await admin.from('mensagens').insert({
          organizacao_id: conv.organizacao_id ?? undefined, conversa_id: est.conversa_id, direcao: 'saida', tipo: 'texto',
          conteudo: texto, autor_id: null, origem: 'bot', status: 'enviada', id_externo: idExterno,
          metadados: { fluxo: 'credito_nudge', nudge: n, transporte: 'cloud_api' },
        });
        await admin.from('conversas').update({ ultima_interacao_em: agora.toISOString() }).eq('id', est.conversa_id);
        enviados++;
        resultados.push({ conversa_id: est.conversa_id, status: 'enviada', nudge: n });
      } else {
        resultados.push({ conversa_id: est.conversa_id, status: 'falhou', nudge: n, erro });
      }
    }

    return json({ ok: true, ativo: ATIVO, dry_run: dryRun, pode_enviar: podeEnviar, motivo_sem_envio: motivoSemEnvio,
      passo_min: PASSO_MIN, candidatos: (estados ?? []).length, enviados, resultados });
  } catch (e) { return json({ error: (e as Error)?.message ?? 'erro' }, 500); }
});
