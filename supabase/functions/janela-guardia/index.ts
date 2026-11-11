// janela-guardia — ETAPA 2 do "não deixar a janela de 24h fechar". Dispara UM nudge contextual
// perto do fim da janela da Cloud API, pra tentar fazer o cliente responder (só a RESPOSTA DELE
// estende a janela — a nossa mensagem não estende; isto é uma aposta de reengajamento, não uma
// renovação). MODO SEGURO, igual ao bot-remarketing:
//   * JANELA_NUDGE_ATIVO=nao por DEFAULT → lista candidatos e loga, mas NÃO envia.
//   * dry_run=true por DEFAULT → mesmo com master on, simula; a Cloud API não é chamada.
//   * envio real SÓ com JANELA_NUDGE_ATIVO=sim E dry_run=false.
//   * auth por x-bot-secret == webhook_config.janela_guardia (padrão do cron). Deploy --no-verify-jwt.
//   * Guardas: janela seg-sáb 09-18 SP, teto diário (env), 1 nudge por janela (RPC/coluna nudge_em),
//     opt-out da Meta, autoenvio, canal cloud_api ativo/não-restrito.
//
// A fila (janela_guardia_due) já garante: conversa QUENTE, faltando ≤4h, NEGÓCIO esperando o
// cliente (última msg de saída — se é o cliente que está sem resposta, quem age é o humano pelo
// alerta do SLA, não este robô), destino WhatsApp presente e sem opt-out. Aqui é o disparo.
//
// O nudge sai pelo PRÓPRIO CANAL DA CONVERSA (onde a janela está aberta) — nunca pelo canal de
// disparo: mandar por outro número abriria OUTRA janela e não serviria de nada.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { enviadorDe } from '../evolution-send/transporte.ts';
import { gerarResposta, type Msg } from '../bot-runner/ia.ts';
import { saidaSuja } from '../bot-runner/guardrail.ts';
import { primeiroNome } from '../bot-runner/fluxo.ts';
import { preencherNome } from '../bot-runner/remarketing.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ATIVO = (Deno.env.get('JANELA_NUDGE_ATIVO') ?? 'nao').toLowerCase() === 'sim';
const TETO_DIA = Math.max(0, Number(Deno.env.get('JANELA_NUDGE_TETO_DIA')) || 20);

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type, x-bot-secret', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

// ---- janela SP (Brasil UTC-3 fixo desde 2019) — idêntica ao bot-remarketing ----
function agoraSP(): { weekday: string; hour: number; diaISO: string } {
  const now = new Date();
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', weekday: 'short', hour: '2-digit', hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  return { weekday: get('weekday'), hour: Number(get('hour')), diaISO: `${get('year')}-${get('month')}-${get('day')}` };
}
function dentroDaJanelaSP(s: { weekday: string; hour: number }): boolean {
  return s.weekday !== 'Sun' && s.hour >= 9 && s.hour < 18; // seg-sáb, 09:00-17:59
}

function codigoMeta(msg: string): number | undefined {
  const m = (msg || '').match(/\b(13\d{4})\b/);
  return m ? Number(m[1]) : undefined;
}

// System do nudge: conversa REAL esfriando dentro da janela, o negócio mandou a última mensagem e
// o cliente sumiu. Registro FORTE/APELATIVO — gancho + pegada emocional + chamada de um toque —
// mas dentro das travas que protegem o número (sem urgência/escassez falsa, sem promessa, sem CAPS
// gritado, sem menção a "janela/24h"). Apelativo é caloroso, não é pressão.
const SYSTEM_NUDGE = `Você é um atendente da Central de Assessoria Financeira (CAF) no WhatsApp. Uma conversa que estava em andamento esfriou: você mandou a última mensagem e o cliente sumiu. Escreva UMA retomada CALOROSA e BEM APELATIVA pra fazer ele voltar a responder agora.

REGISTRO (apelativo, mas humano — o cliente é aposentado/pensionista do INSS, muitas vezes 70+):
- "O senhor"/"a senhora". Frases curtas e quentes. Nunca diga que é robô ou IA.
- No máximo 2 balões separados por " || ": um GANCHO que prende no primeiro, a CHAMADA no segundo.
- Pegada emocional leve e VERDADEIRA: "não esqueci do senhor, viu?", "seria uma pena parar bem agora que a gente já começou", "fico aqui sem querer te deixar sem resposta".
- Retome o ASSUNTO que estava sendo tratado acima (use o histórico), não recomece do zero.
- Termine com uma CHAMADA DE AÇÃO de um toque: peça um "SIM" ou um "quero" — algo que a pessoa responde em 1 palavra.
- No máximo 1 emoji, pra dar calor (👊 💙 🙏 🙂). Nunca uma parede de emojis.

TRAVAS (NUNCA quebre — é o que protege o número da CAF):
- NUNCA prometa valor, percentual, prazo ou resultado. Fale em VERIFICAR/CONTINUAR/RETOMAR, nunca em "o senhor vai receber".
- NUNCA invente urgência ou escassez falsa: proibido "última chance", "só hoje", "vaga limitada", "acaba amanhã", contagem regressiva. O único convite é pra continuar de onde pararam.
- NUNCA mencione janela, 24h, prazo técnico ou qualquer coisa "de sistema".
- NUNCA peça senha do gov.br/Meu INSS, código, token ou 2FA.
- NUNCA use medo, culpa pesada, CAIXA ALTA gritada ou insistência agressiva.

Responda APENAS com a mensagem pronta pro WhatsApp (1 ou 2 balões com " || "). Sem aspas, sem explicação, sem assinatura.`;

const FALLBACK_NUDGE = 'Oi, {nome}! Não esqueci do senhor, viu? 💙 || Seria uma pena parar bem agora que a gente já começou. Me responde só um "SIM" que eu retomo tudo pro senhor.';

function limparSaida(s: string): string { return (s ?? '').replace(/<estado>[\s\S]*/i, '').trim(); }

// Monta o contexto (últimas mensagens de texto) e gera o nudge: IA → guardrail → fallback fixo.
async function gerarNudge(admin: any, conversaId: string, primeiro: string): Promise<{ texto: string; via: 'ia' | 'fallback' }> {
  const fallback = preencherNome(FALLBACK_NUDGE, primeiro);
  const messages: Msg[] = [];
  try {
    const { data: hist } = await admin.from('mensagens')
      .select('direcao, tipo, conteudo, criado_em')
      .eq('conversa_id', conversaId).eq('tipo', 'texto')
      .order('criado_em', { ascending: false }).limit(6);
    for (const m of (hist ?? []).reverse()) {
      const c = String(m.conteudo ?? '').trim();
      if (!c) continue;
      messages.push({ role: m.direcao === 'entrada' ? 'user' : 'assistant', content: c });
    }
  } catch { /* sem histórico → só o fallback contextualiza pelo nome */ }
  // turno final de instrução (não vai pro cliente; orienta a geração)
  messages.push({ role: 'user', content: '[interno] O cliente parou de responder. Escreva a retomada agora, curta, retomando o assunto acima.' });

  try {
    let saida = await gerarResposta({ messages, system: SYSTEM_NUDGE, dificil: true });
    let texto = limparSaida(saida);
    if (saidaSuja(texto)) {
      saida = await gerarResposta({ messages, system: SYSTEM_NUDGE + '\n\n⚠️ Não cite valores, percentuais, prazos, garantias nem credenciais. Reescreva limpo.', dificil: true });
      texto = limparSaida(saida);
      if (saidaSuja(texto)) return { texto: fallback, via: 'fallback' };
    }
    texto = preencherNome(texto, primeiro);
    return texto ? { texto, via: 'ia' } : { texto: fallback, via: 'fallback' };
  } catch { return { texto: fallback, via: 'fallback' }; }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const secretHeader = req.headers.get('x-bot-secret') ?? '';
    const { data: wc } = await admin.from('webhook_config').select('secret').eq('chave', 'janela_guardia').maybeSingle();
    if (!wc?.secret || secretHeader !== wc.secret) return json({ error: 'unauthorized' }, 401);

    const body = await req.json().catch(() => ({})) as { dry_run?: boolean; force?: boolean };
    const dryRun = body.dry_run !== false;   // DEFAULT seguro
    const force = body.force === true;        // testes: fura janela SP + master off (mas nunca envia se !ATIVO)

    const sp = agoraSP();

    // teto do dia (conta nudges já disparados hoje, SP) — nudge_em é marcado só em envio real.
    const inicioDiaSP = new Date(`${sp.diaISO}T00:00:00-03:00`).toISOString();
    const { count: hoje } = await admin.from('canal_janela')
      .select('canal_id', { count: 'exact', head: true }).gte('nudge_em', inicioDiaSP);
    const restante = Math.max(0, TETO_DIA - (hoje ?? 0));

    // fila (read-only): sempre calculada, mesmo inerte, pra o painel ver QUEM receberia.
    const { data: due } = await admin.rpc('janela_guardia_due', { p_limit: Math.max(restante, 1) });
    const fila = (due ?? []) as Array<any>;

    // Decisão de ENVIO (nunca a de listar): master on + fora do dry_run + horário SP + teto.
    const podeEnviar = ATIVO && !dryRun && (dentroDaJanelaSP(sp) || force) && restante > 0;
    const motivoSemEnvio = !ATIVO ? 'master_off' : dryRun ? 'dry_run'
      : (!dentroDaJanelaSP(sp) && !force) ? 'fora_janela_sp' : restante <= 0 ? 'teto_diario' : null;

    const resultados: any[] = [];
    let enviados = 0;
    for (const row of fila) {
      if (enviados >= restante && podeEnviar) break;

      // canal da CONVERSA (onde a janela está aberta) — cinto-e-suspensório sobre a RPC.
      const { data: canal } = await admin.from('canais')
        .select('id, organizacao_id, nome_interno, numero_conectado, transporte, cloud_phone_number_id, envio_restrito, ativo')
        .eq('id', row.canal_id).maybeSingle();
      const ehCloud = (canal?.transporte as string | null) === 'cloud_api';
      if (!canal || !ehCloud || canal.envio_restrito || canal.ativo === false) {
        resultados.push({ conversa_id: row.conversa_id, status_envio: 'canal_invalido' });
        continue;
      }

      // nome cru pode ser o próprio telefone (contato sem nome real) — não vira vocativo.
      const nomeCru = String(row.contato_nome ?? '').trim();
      const primeiro = /^[\d\s()+\-]+$/.test(nomeCru) ? '' : primeiroNome(nomeCru);
      const destino = (row.destino as string | null) ?? null;
      const ehProprioNumero = !!destino && destino === (canal.numero_conectado ?? null);

      // gera a copy sempre (serve de histórico mesmo em dry_run/simulação)
      const { texto, via } = await gerarNudge(admin, row.conversa_id, primeiro);

      let statusEnvio = 'simulada';
      let outboxErro: string | null = null;
      let envio: { ok: boolean; id?: string; erro?: string; codigo?: number } = { ok: true };

      if (podeEnviar) {
        if (!canal.cloud_phone_number_id || !destino) {
          envio = { ok: false, erro: !destino ? 'sem_destino' : 'sem_phone_number_id' }; statusEnvio = 'falhou';
        } else if (ehProprioNumero) {
          envio = { ok: false, erro: 'autoenvio' }; statusEnvio = 'falhou';
        } else {
          const tx = enviadorDe(canal as { transporte?: string | null; instancia_externa?: string | null; cloud_phone_number_id?: string | null });
          try {
            const enviado = await tx.sendText(destino, texto);
            envio = { ok: !!enviado?.key?.id, id: enviado?.key?.id, erro: enviado?.key?.id ? undefined : 'sem_id_externo' };
          } catch (e) {
            const msg = (e as Error)?.message ?? 'erro_cloud';
            envio = { ok: false, erro: msg.slice(0, 300), codigo: codigoMeta(msg) };
          }
          statusEnvio = envio.ok ? 'enviada' : 'falhou';

          // 131050 = a pessoa pediu à Meta pra parar. Vira ESTADO (opt-out), não tentativa perdida.
          if (envio.codigo === 131050) {
            await admin.rpc('wa_optout_registrar', {
              p_contato: row.contato_id, p_canal: canal.id, p_motivo: 'erro_131050', p_detalhe: envio.erro ?? null,
            });
            statusEnvio = 'optout_meta';
          }

          if (envio.ok) {
            // marca o nudge da janela ANTES de qualquer coisa poder falhar — a mensagem já saiu e a
            // Meta já contou; reenviar por causa de erro de persistência é o que derruba o número.
            await admin.rpc('janela_guardia_marcar_nudge', { p_canal: canal.id, p_contato: row.contato_id });
            const nowIso = new Date().toISOString();
            const { error: eMsg } = await admin.from('mensagens').insert({
              organizacao_id: row.organizacao_id ?? undefined, conversa_id: row.conversa_id,
              direcao: 'saida', tipo: 'texto', conteudo: texto, autor_id: null, origem: 'bot',
              status: 'enviada', id_externo: envio.id ?? null,
              metadados: { via: 'janela_guardia', transporte: 'cloud_api', canal: canal.nome_interno },
            });
            if (eMsg) outboxErro = (eMsg.message ?? 'insert_falhou').slice(0, 200);
            await admin.from('conversas').update({ ultima_interacao_em: nowIso }).eq('id', row.conversa_id);
            enviados++;
          }
        }
      }

      try {
        await admin.from('audit_log').insert({
          usuario_id: null, acao: 'janela_guardia', entidade: 'conversas', entidade_id: row.conversa_id,
          organizacao_id: row.organizacao_id ?? null,
          dados_depois: { via, status_envio: statusEnvio, erro: envio.erro ?? null, dry_run: dryRun,
            horas_restantes: row.horas_restantes, wamid: envio.id ?? null, outbox_erro: outboxErro,
            motivo_sem_envio: podeEnviar ? null : motivoSemEnvio },
        });
      } catch { /* audit best-effort */ }

      resultados.push({ conversa_id: row.conversa_id, via, status_envio: statusEnvio,
        horas_restantes: row.horas_restantes, texto: dryRun ? texto : undefined,
        ...(outboxErro ? { outbox_erro: outboxErro } : {}) });
    }

    return json({ ok: true, ativo: ATIVO, dry_run: dryRun, sp, teto: TETO_DIA, hoje, restante,
      pode_enviar: podeEnviar, motivo_sem_envio: motivoSemEnvio, candidatos: fila.length, enviados, resultados });
  } catch (e) { return json({ error: (e as Error)?.message ?? 'erro' }, 500); }
});
