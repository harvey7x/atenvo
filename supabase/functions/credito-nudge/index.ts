// credito-nudge — cutuca lead do fluxo de CRÉDITO em DOIS momentos:
//  TRILHO handoff: recebeu o cartão do atendente (Murillo 5329) e não chamou → 3 msgs "chama o atendente".
//  TRILHO abertura: recebeu a abertura (banner+botões) e NÃO tocou nenhum botão → 3 msgs "escolhe uma opção".
// Até 3 cutucadas por trilho, em +PASSO_MIN/+2x/+3x (default 5/10/15). Para quando o lead avança/responde.
//
// MODO SEGURO (igual janela-guardia / bot-remarketing):
//   * CREDITO_NUDGE_ATIVO=nao por DEFAULT → lista quem receberia, NÃO envia.
//   * dry_run=true por DEFAULT → mesmo com ATIVO on, simula.
//   * envio real SÓ com CREDITO_NUDGE_ATIVO=sim E dry_run=false. Trava extra por allowlist.
//   * auth por x-bot-secret == webhook_config.credito_nudge. Deploy --no-verify-jwt.
//
// Estado por conversa em bot_conversa_estado.dados_qualificacao:
//   handoff_em/nudge_count/nudge_parou (trilho handoff), abertura_em/nudge_ab_count/nudge_ab_parou (trilho abertura).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { enviadorDe } from '../evolution-send/transporte.ts';
import { saidaSuja } from '../bot-runner/guardrail.ts';
import { chaveTel } from '../bot-runner/fluxo_botoes.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ATIVO = (Deno.env.get('CREDITO_NUDGE_ATIVO') ?? 'nao').toLowerCase() === 'sim';
const PASSO_MIN = Math.max(1, Number(Deno.env.get('CREDITO_NUDGE_PASSO_MIN')) || 5);   // +5/+10/+15
const MAX_NUDGES = 3;
const JANELA_HORAS = 24;
const ALLOWLIST = (Deno.env.get('CLOUD_BOT_ENVIO_REAL_ALLOWLIST') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const liberado = (destino: string | null) => !!destino && (ALLOWLIST.length === 0 || ALLOWLIST.some((a) => chaveTel(a) === chaveTel(destino)));

// TRILHO handoff (pós-cartão): "fale com o atendente".
const NUDGES = [
  Deno.env.get('CREDITO_NUDGE_1') ?? 'Oi {nome}! Vi que você ainda não falou com o nosso atendente. É só tocar no contato que te enviei e mandar um "oi" que já te atendemos. 😊',
  Deno.env.get('CREDITO_NUDGE_2') ?? '{nome}, seu atendimento está reservado! Chama a gente no contato acima pra não perder a vez. 💚',
  Deno.env.get('CREDITO_NUDGE_3') ?? 'Podemos continuar, {nome}? Se ainda tiver interesse em reduzir juros ou aumentar margem, é só mandar mensagem pro nosso atendente. Estamos te esperando! 🙌',
];
// TRILHO abertura (viu os botões, não escolheu): "toque numa opção".
const NUDGES_AB = [
  Deno.env.get('CREDITO_NUDGE_AB_1') ?? 'Oi {nome}! Vi que você ainda não escolheu. É só tocar numa opção — reduzir juros, aumentar margem ou fazer empréstimo — que a nossa equipe já cuida do resto.',
  Deno.env.get('CREDITO_NUDGE_AB_2') ?? '{nome}, é rapidinho: toque na opção que faz sentido pra você aqui em cima e a gente segue com o seu atendimento.',
  Deno.env.get('CREDITO_NUDGE_AB_3') ?? 'Última chamada, {nome}! Se ainda quiser reduzir juros, aumentar margem ou fazer um empréstimo, é só tocar numa opção. 🙌',
];

type Trilho = { key: string; anchor: string; countF: string; parouF: string; textos: string[]; tag: string; paraNoInbound: boolean; pulaSePausado: boolean };
const TRILHOS: Trilho[] = [
  { key: 'handoff', anchor: 'handoff_em', countF: 'nudge_count', parouF: 'nudge_parou', textos: NUDGES, tag: 'credito_nudge', paraNoInbound: true, pulaSePausado: false },
  { key: 'abertura', anchor: 'abertura_em', countF: 'nudge_ab_count', parouF: 'nudge_ab_parou', textos: NUDGES_AB, tag: 'credito_nudge_abertura', paraNoInbound: false, pulaSePausado: true },
];

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type, x-bot-secret', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

function preencherNome(texto: string, primeiro: string): string {
  if (primeiro) return texto.replaceAll('{nome}', primeiro);
  return texto.replaceAll('Oi {nome}! ', 'Oi! ').replaceAll('{nome}, ', '').replaceAll('{nome}', '').replace(/\s{2,}/g, ' ').trim();
}
function primeiroNome(nome: string): string {
  const cru = String(nome ?? '').trim();
  if (!cru || /^[\d\s()+\-]+$/.test(cru)) return '';
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
    const dryRun = body.dry_run !== false;
    const podeEnviar = ATIVO && !dryRun;
    const motivoSemEnvio = !ATIVO ? 'master_off' : dryRun ? 'dry_run' : null;

    const agora = new Date();
    const cutoff = new Date(agora.getTime() - JANELA_HORAS * 3600e3).toISOString();

    const resultados: any[] = [];
    let enviados = 0;

    for (const trilho of TRILHOS) {
      const { data: estados } = await admin.from('bot_conversa_estado')
        .select('conversa_id, dados_qualificacao, pausado')
        .not(`dados_qualificacao->>${trilho.anchor}`, 'is', null)
        .gte(`dados_qualificacao->>${trilho.anchor}`, cutoff)
        .limit(300);

      for (const est of (estados ?? []) as Array<any>) {
        const dq = (est.dados_qualificacao ?? {}) as Record<string, unknown>;
        // trilho abertura: só vale enquanto AINDA está em 'aguardando_abertura' (tocar um botão avança e sai)
        if (trilho.key === 'abertura' && String(dq.passo_botoes ?? '') !== 'aguardando_abertura') continue;
        if (trilho.pulaSePausado && est.pausado) continue;
        const count = Number(dq[trilho.countF] ?? 0) || 0;
        if (dq[trilho.parouF] || count >= MAX_NUDGES) continue;
        const anchorEm = String(dq[trilho.anchor] ?? '');
        const anchorMs = Date.parse(anchorEm);
        if (!anchorMs) continue;
        const n = count + 1;
        if (agora.getTime() < anchorMs + n * PASSO_MIN * 60e3) continue;

        const { data: conv } = await admin.from('conversas')
          .select('id, contato_id, canal_id, organizacao_id, contatos(nome)')
          .eq('id', est.conversa_id).maybeSingle();
        if (!conv?.contato_id) continue;

        // trilho handoff: qualquer inbound do contato após o anchor → parou (chamou/voltou a falar)
        if (trilho.paraNoInbound) {
          const { data: convsDoContato } = await admin.from('conversas').select('id').eq('contato_id', conv.contato_id);
          const ids = (convsDoContato ?? []).map((c: any) => c.id);
          let respondeu = false;
          if (ids.length) {
            const { data: inb } = await admin.from('mensagens').select('id')
              .in('conversa_id', ids).eq('direcao', 'entrada').gt('criado_em', anchorEm).limit(1);
            respondeu = !!(inb && inb.length);
          }
          if (respondeu) {
            await admin.from('bot_conversa_estado').update({ dados_qualificacao: { ...dq, [trilho.parouF]: true, [`${trilho.key}_parou_em`]: agora.toISOString() } }).eq('conversa_id', est.conversa_id);
            resultados.push({ conversa_id: est.conversa_id, trilho: trilho.key, status: 'parou_cliente_respondeu' });
            continue;
          }
        }

        const { data: opt } = await admin.from('wa_optout').select('contato_id').eq('contato_id', conv.contato_id).limit(1);
        if (opt && opt.length) { resultados.push({ conversa_id: est.conversa_id, trilho: trilho.key, status: 'optout' }); continue; }

        const { data: canal } = await admin.from('canais')
          .select('id, nome_interno, numero_conectado, transporte, cloud_phone_number_id, instancia_externa, envio_restrito, ativo')
          .eq('id', conv.canal_id).maybeSingle();
        const ehCloud = (canal?.transporte as string | null) === 'cloud_api';
        if (!canal || !ehCloud || canal.envio_restrito || canal.ativo === false) {
          resultados.push({ conversa_id: est.conversa_id, trilho: trilho.key, status: 'canal_invalido' }); continue;
        }

        const { data: ident } = await admin.from('contato_identidades')
          .select('valor_normalizado').eq('contato_id', conv.contato_id).eq('tipo', 'whatsapp')
          .not('valor_normalizado', 'is', null).order('principal', { ascending: false }).limit(1).maybeSingle();
        const destino = ident?.valor_normalizado ?? null;

        const primeiro = primeiroNome((conv as any).contatos?.nome ?? '');
        const texto = preencherNome(trilho.textos[count] ?? trilho.textos[trilho.textos.length - 1], primeiro);
        if (saidaSuja(texto)) { resultados.push({ conversa_id: est.conversa_id, trilho: trilho.key, status: 'guardrail_bloqueou', nudge: n }); continue; }

        const enviarReal = podeEnviar && liberado(destino);
        if (!enviarReal) {
          resultados.push({ conversa_id: est.conversa_id, trilho: trilho.key, status: podeEnviar ? 'simulado_fora_allowlist' : 'simulado', nudge: n, texto });
          continue;
        }
        if (!destino || !canal.cloud_phone_number_id) { resultados.push({ conversa_id: est.conversa_id, trilho: trilho.key, status: 'sem_destino', nudge: n }); continue; }
        if (destino === (canal.numero_conectado ?? null)) { resultados.push({ conversa_id: est.conversa_id, trilho: trilho.key, status: 'autoenvio', nudge: n }); continue; }

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
          await admin.from('bot_conversa_estado').update({ dados_qualificacao: { ...dq, [trilho.parouF]: true } }).eq('conversa_id', est.conversa_id);
          resultados.push({ conversa_id: est.conversa_id, trilho: trilho.key, status: 'optout_meta', nudge: n }); continue;
        }

        if (idExterno) {
          await admin.from('bot_conversa_estado').update({ dados_qualificacao: { ...dq, [trilho.countF]: n, [`${trilho.key}_ultima_em`]: agora.toISOString() } }).eq('conversa_id', est.conversa_id);
          await admin.from('mensagens').insert({
            organizacao_id: conv.organizacao_id ?? undefined, conversa_id: est.conversa_id, direcao: 'saida', tipo: 'texto',
            conteudo: texto, autor_id: null, origem: 'bot', status: 'enviada', id_externo: idExterno,
            metadados: { fluxo: trilho.tag, nudge: n, transporte: 'cloud_api' },
          });
          await admin.from('conversas').update({ ultima_interacao_em: agora.toISOString() }).eq('id', est.conversa_id);
          enviados++;
          resultados.push({ conversa_id: est.conversa_id, trilho: trilho.key, status: 'enviada', nudge: n });
        } else {
          resultados.push({ conversa_id: est.conversa_id, trilho: trilho.key, status: 'falhou', nudge: n, erro });
        }
      }
    }

    return json({ ok: true, ativo: ATIVO, dry_run: dryRun, pode_enviar: podeEnviar, motivo_sem_envio: motivoSemEnvio, passo_min: PASSO_MIN, enviados, resultados });
  } catch (e) { return json({ error: (e as Error)?.message ?? 'erro' }, 500); }
});
