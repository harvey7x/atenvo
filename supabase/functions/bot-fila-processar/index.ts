// bot-fila-processar — worker da fila bot_mensagens_saida (mensagens DIFERIDAS do bot).
//
// Cron a cada minuto. Só toca linhas com status 'agendada' (claim atômico via RPC
// bot_fila_reivindicar → 'enviando'); o status 'pendente' segue sendo drenado EM-PROCESSO pelo
// próprio bot-runner — a separação de status é o que impede este cron de duplicar um burst que
// o runner está drenando naquele segundo.
//
// Uso hoje: a etapa 'resultado' do fluxo caf_video_juros_v1 (3 balões, +8 min após o CPF).
// GUARDAS re-checadas NA HORA do envio (o mundo muda em 8 minutos), por conversa:
//   * bot pausado (humano assumiu / escalação / opt-out via bot_pausar já cancela, mas re-checa);
//   * atendente mandou mensagem DEPOIS do agendamento (painel ou celular) → o humano assumiu o
//     timing; o bot não atropela;
//   * opt-out registrado (wa_optout) → não envia.
//   Qualquer guarda → cancela TODAS as linhas do grupo e loga o motivo (nunca silêncio).
//
// Ao concluir o ÚLTIMO balão do 'resultado':
//   * move a oportunidade para a coluna papel='qualificado' (Lead Qualificado) e registra
//     oportunidade_eventos evento='qualificado' (padrão da casa);
//   * etiqueta 'bot-video-v1' no contato;
//   * conversas.precisa_humano=true motivo 'analise_pronta_contatar_hoje';
//   * alertas_lead_quente (tipo 'concluido', passo 'resultado') pros atendentes verem na hora;
//   * bot_conversa_estado.etapa='concluido' (o trigger trg_opp_move_qualificado vira no-op
//     porque a coluna já mudou — e serve de rede de segurança se o move explícito falhar).
//
// Auth: x-bot-secret == webhook_config.bot_fila (padrão dos crons). Deploy --no-verify-jwt.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { enviadorDe } from '../evolution-send/transporte.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const LIMITE_CICLO = 30;
const MAX_TENTATIVAS = 3;

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type, x-bot-secret', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, Math.max(0, ms)));

function seguroIgual(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

interface Linha {
  id: string; organizacao_id: string; conversa_id: string; canal_id: string | null;
  etapa: string | null; ordem: number; texto: string; tipo: string;
  media_url: string | null; media_caption: string | null;
  enviar_apos: string; status: string; tentativas: number; criado_em: string;
}

// Etiqueta no padrão do painel (espelho do aplicarEtiquetaBot do bot-runner — duplicado de
// propósito: Edge Functions não compartilham módulo sem acoplar deploys).
// deno-lint-ignore no-explicit-any
async function aplicarEtiquetaBot(admin: any, orgId: string, nome: string, contatoId: string): Promise<void> {
  try {
    const { data: ex } = await admin.from('etiquetas').select('id').eq('organizacao_id', orgId).eq('nome', nome).maybeSingle();
    if (!ex?.id) {
      const { data: maxRow } = await admin.from('etiquetas').select('ordem').eq('organizacao_id', orgId).order('ordem', { ascending: false }).limit(1).maybeSingle();
      await admin.from('etiquetas').insert({ organizacao_id: orgId, nome, cor: '#7c6df2', descricao: 'Aplicada pelo bot (fluxo de vídeo)', ordem: ((maxRow?.ordem as number) ?? 0) + 1, ativo: true });
    }
  } catch { /* catálogo é cosmético */ }
  try {
    const { data: ct } = await admin.from('contatos').select('etiquetas').eq('id', contatoId).maybeSingle();
    const atuais = (ct?.etiquetas ?? []) as string[];
    if (!atuais.includes(nome)) await admin.from('contatos').update({ etiquetas: [...atuais, nome] }).eq('id', contatoId);
  } catch { /* best-effort */ }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

    const secretHeader = req.headers.get('x-bot-secret') ?? '';
    const { data: wc } = await admin.from('webhook_config').select('secret').eq('chave', 'bot_fila').maybeSingle();
    if (!wc?.secret || !seguroIgual(secretHeader, wc.secret as string)) return json({ error: 'unauthorized' }, 401);

    const { data: lote, error: eLote } = await admin.rpc('bot_fila_reivindicar', { p_limite: LIMITE_CICLO });
    if (eLote) return json({ error: eLote.message }, 500);
    const linhas = (lote as Linha[]) ?? [];
    if (!linhas.length) return json({ processadas: 0, resultados: [] });

    // agrupa por conversa e ordena por ordem — a sequência dos balões é sagrada
    const grupos = new Map<string, Linha[]>();
    for (const l of linhas) {
      const g = grupos.get(l.conversa_id) ?? [];
      g.push(l); grupos.set(l.conversa_id, g);
    }
    const resultados: Array<{ conversa_id: string; enviados: number; desfecho: string; motivo?: string }> = [];

    for (const [conversaId, grupo] of grupos) {
      grupo.sort((a, b) => a.ordem - b.ordem);
      const org = grupo[0].organizacao_id;
      const logFluxo = async (evento: string, extra: Record<string, unknown> = {}) => {
        try {
          await admin.from('audit_log').insert({
            usuario_id: null, acao: 'fluxo_video', entidade: 'conversas', entidade_id: conversaId,
            dados_depois: { evento, via: 'bot-fila-processar', ...extra }, organizacao_id: org,
          });
        } catch { /* best-effort */ }
      };
      const cancelarGrupo = async (ids: string[], motivo: string) => {
        for (const id of ids) {
          try { await admin.rpc('bot_registrar_envio', { p_saida: id, p_status: 'cancelada', p_erro: motivo }); } catch { /* best-effort */ }
        }
        await logFluxo('resultado_cancelado', { motivo, linhas: ids.length });
      };

      const { data: conv } = await admin.from('conversas')
        .select('id, organizacao_id, contato_id, canal_id, precisa_humano').eq('id', conversaId).maybeSingle();
      if (!conv) { await cancelarGrupo(grupo.map((g) => g.id), 'conversa_inexistente'); resultados.push({ conversa_id: conversaId, enviados: 0, desfecho: 'cancelado', motivo: 'conversa_inexistente' }); continue; }

      const { data: est } = await admin.from('bot_conversa_estado')
        .select('pausado, motivo_pausa, etapa, dados_qualificacao, oportunidade_id').eq('conversa_id', conversaId).maybeSingle();

      // ---- GUARDA 1: bot pausado (humano assumiu, escalação, áudio…) ----
      if (est?.pausado) {
        await cancelarGrupo(grupo.map((g) => g.id), `bot_pausado:${est.motivo_pausa ?? ''}`);
        resultados.push({ conversa_id: conversaId, enviados: 0, desfecho: 'cancelado', motivo: 'bot_pausado' }); continue;
      }
      // ---- GUARDA 2: opt-out registrado depois do agendamento (ou antes — tanto faz: não envia) ----
      const { data: opt } = await admin.from('wa_optout').select('contato_id').eq('contato_id', conv.contato_id).limit(1);
      if (opt?.length) {
        await cancelarGrupo(grupo.map((g) => g.id), 'optout');
        resultados.push({ conversa_id: conversaId, enviados: 0, desfecho: 'cancelado', motivo: 'optout' }); continue;
      }
      // ---- GUARDA 3: atendente mandou mensagem DEPOIS do agendamento (painel: autor_id;
      //      celular: origem='telefone') — o humano já está conduzindo; o bot não atropela. ----
      const agendadoEm = grupo.reduce((min, g) => (g.criado_em < min ? g.criado_em : min), grupo[0].criado_em);
      const { data: humano } = await admin.from('mensagens')
        .select('id, autor_id, origem, tipo').eq('conversa_id', conversaId).eq('direcao', 'saida')
        .gt('criado_em', agendadoEm).limit(50);
      const atendenteRespondeu = (humano ?? []).some((m: { autor_id: string | null; origem: string | null; tipo: string }) =>
        (m.autor_id != null && !['sistema', 'nota_interna'].includes(m.tipo)) || (m.autor_id == null && m.origem === 'telefone'));
      if (atendenteRespondeu) {
        await cancelarGrupo(grupo.map((g) => g.id), 'atendente_respondeu');
        resultados.push({ conversa_id: conversaId, enviados: 0, desfecho: 'cancelado', motivo: 'atendente_respondeu' }); continue;
      }

      // ---- destino + transporte (mesma régua do bot-runner) ----
      const { data: canal } = await admin.from('canais')
        .select('id, transporte, instancia_externa, cloud_phone_number_id').eq('id', conv.canal_id).maybeSingle();
      const { data: ident } = await admin.from('contato_identidades')
        .select('valor_normalizado').eq('contato_id', conv.contato_id).eq('tipo', 'whatsapp')
        .not('valor_normalizado', 'is', null).order('principal', { ascending: false }).limit(1).maybeSingle();
      const destino = ident?.valor_normalizado ?? null;
      const transporte = (canal?.transporte ?? 'evolution') as string;
      const bloqueio = !destino ? 'sem_destino'
        : (transporte === 'cloud_api' && !canal?.cloud_phone_number_id) ? 'sem_phone_number_id'
        : (transporte === 'evolution' && !canal?.instancia_externa) ? 'sem_instancia'
        : (transporte !== 'cloud_api' && transporte !== 'evolution') ? `transporte_nao_suportado:${transporte}`
        : null;
      if (bloqueio) {
        await cancelarGrupo(grupo.map((g) => g.id), bloqueio);
        resultados.push({ conversa_id: conversaId, enviados: 0, desfecho: 'cancelado', motivo: bloqueio }); continue;
      }

      // ---- envia na ordem, 2–3s entre balões. Falha no meio: reverte o resto p/ 'agendada'
      //      (retry no próximo ciclo, do ponto onde parou); estourou MAX_TENTATIVAS → 'falhou'
      //      e cancela o resto (sequência quebrada não continua pela metade). ----
      const tx = enviadorDe(canal!);   // bloqueio acima garante canal com transporte válido
      let enviados = 0; let falhouDeVez = false; let erro: string | null = null;
      for (let i = 0; i < grupo.length; i++) {
        const row = grupo[i];
        if (i > 0) await sleep(2000 + Math.round(Math.random() * 1000));
        try {
          const sent = (row.tipo === 'video' && row.media_url)
            ? await tx.sendMedia(destino!, 'video', 'video/mp4', row.media_url, 'video.mp4', row.media_caption ?? undefined)
            : await tx.sendText(destino!, row.texto);
          const idExterno = sent?.key?.id ?? null;
          if (!idExterno) throw new Error('sem_id_retorno');
          const { data: msg } = await admin.from('mensagens').insert({
            organizacao_id: org, conversa_id: conversaId, direcao: 'saida',
            tipo: row.tipo === 'video' ? 'video' : 'texto', conteudo: row.texto,
            autor_id: null, origem: 'bot', status: 'enviada', id_externo: idExterno,
            metadados: { fluxo: 'video_juros', etapa: row.etapa, ordem: row.ordem, via: 'bot-fila-processar' },
          }).select('id').maybeSingle();
          await admin.rpc('bot_registrar_envio', { p_saida: row.id, p_status: 'enviada', p_mensagem: msg?.id ?? null, p_id_externo: idExterno });
          enviados++;
          await logFluxo('resultado_enviado', { ordem: row.ordem, id_externo: idExterno });
        } catch (e) {
          erro = String((e as Error)?.message ?? 'falha_envio').slice(0, 300);
          const restantes = grupo.slice(i + 1).map((g) => g.id);
          if (row.tentativas >= MAX_TENTATIVAS) {
            falhouDeVez = true;
            try { await admin.rpc('bot_registrar_envio', { p_saida: row.id, p_status: 'falhou', p_erro: erro }); } catch { /* best-effort */ }
            if (restantes.length) await cancelarGrupo(restantes, 'bolha_anterior_falhou');
          } else {
            // volta pra 'agendada' (o claim já contou a tentativa via atualizado_em; tentativas
            // incrementa no bot_registrar_envio do próximo desfecho definitivo)
            try { await admin.rpc('bot_registrar_envio', { p_saida: row.id, p_status: 'agendada', p_erro: erro }); } catch { /* best-effort */ }
            if (restantes.length) await admin.from('bot_mensagens_saida').update({ status: 'agendada' }).in('id', restantes);
          }
          await logFluxo('resultado_falhou', { ordem: row.ordem, erro, definitivo: falhouDeVez });
          break;
        }
      }

      const completou = enviados === grupo.length;
      // grupo pode ter vindo quebrado em 2 ciclos (retry): só conclui quando NÃO resta nada
      // agendado/enviando desta etapa nesta conversa.
      let restamPendentes = false;
      if (completou && grupo[0].etapa === 'resultado') {
        const { data: resto } = await admin.from('bot_mensagens_saida')
          .select('id').eq('conversa_id', conversaId).eq('etapa', 'resultado').in('status', ['agendada', 'enviando']).limit(1);
        restamPendentes = !!resto?.length;
      }

      if (completou && grupo[0].etapa === 'resultado' && !restamPendentes) {
        // ---- FECHO do fluxo de vídeo: qualifica a oportunidade + chama o humano ----
        // 1) alerta pros atendentes (tipo 'concluido' = "aguardando ligação"; passo 'resultado').
        //    on conflict (conversa_id, tipo): se já existir um concluido desta conversa, mantém.
        try {
          await admin.from('alertas_lead_quente').upsert({
            organizacao_id: org, conversa_id: conversaId, contato_id: conv.contato_id,
            passo: 'resultado', abandonado_em: new Date().toISOString(), tipo: 'concluido',
          }, { onConflict: 'conversa_id,tipo', ignoreDuplicates: true });
        } catch (e) { await logFluxo('alerta_falhou', { erro: String((e as Error)?.message ?? '').slice(0, 200) }); }

        // 2) etiqueta no contato
        await aplicarEtiquetaBot(admin, org, 'bot-video-v1', conv.contato_id);

        // 3) o painel acende "precisa de humano" com o motivo combinado
        try {
          await admin.from('conversas').update({
            precisa_humano: true, precisa_humano_motivo: 'analise_pronta_contatar_hoje', precisa_humano_em: new Date().toISOString(),
          }).eq('id', conversaId);
        } catch { /* best-effort */ }

        // 4) move a oportunidade pra coluna papel='qualificado' + evento 'qualificado' (padrão
        //    oportunidade_eventos). Resolve a opp como o trigger: estado.oportunidade_id, senão a
        //    em_andamento mais recente do contato.
        try {
          let oppId = (est?.oportunidade_id as string | null) ?? null;
          if (!oppId) {
            const { data: o } = await admin.from('oportunidades').select('id')
              .eq('organizacao_id', org).eq('contato_id', conv.contato_id).eq('status', 'em_andamento')
              .order('criado_em', { ascending: false }).limit(1).maybeSingle();
            oppId = o?.id ?? null;
          }
          if (oppId) {
            const { data: opp } = await admin.from('oportunidades').select('id, funil_id, coluna_id, status').eq('id', oppId).maybeSingle();
            if (opp?.status === 'em_andamento') {
              const { data: colQ } = await admin.from('funil_colunas').select('id')
                .eq('funil_id', opp.funil_id).eq('papel', 'qualificado').eq('arquivada', false).limit(1).maybeSingle();
              if (colQ?.id && colQ.id !== opp.coluna_id) {
                await admin.from('oportunidades').update({ coluna_id: colQ.id }).eq('id', oppId).eq('status', 'em_andamento');
                await admin.from('oportunidade_eventos').insert({
                  organizacao_id: org, oportunidade_id: oppId, evento: 'qualificado',
                  coluna_anterior_id: opp.coluna_id, coluna_nova_id: colQ.id, executado_por: null,
                });
                await logFluxo('opp_qualificada', { oportunidade_id: oppId, coluna_anterior: opp.coluna_id, coluna_nova: colQ.id });
              }
            }
          } else {
            await logFluxo('opp_nao_encontrada');
          }
        } catch (e) { await logFluxo('opp_qualificar_falhou', { erro: String((e as Error)?.message ?? '').slice(0, 200) }); }

        // 5) estado: concluído (o trigger de qualificado vira no-op — a coluna já mudou acima —
        //    e fica de rede de segurança caso o move explícito tenha falhado).
        try { await admin.rpc('bot_avancar_etapa', { p_conversa: conversaId, p_etapa: 'concluido', p_dados: { passo_video: 'fim' }, p_reprompts: 0, p_inbound_msg: null }); } catch { /* best-effort */ }
        try { await admin.from('bot_conversa_estado').update({ concluido_em: new Date().toISOString() }).eq('conversa_id', conversaId); } catch { /* best-effort */ }

        await logFluxo('resultado_entregue', { baloes: enviados });
        resultados.push({ conversa_id: conversaId, enviados, desfecho: 'entregue' });
      } else {
        resultados.push({ conversa_id: conversaId, enviados, desfecho: completou ? 'parcial_ok' : (falhouDeVez ? 'falhou' : 'retry'), ...(erro ? { motivo: erro } : {}) });
      }
    }

    return json({ processadas: linhas.length, resultados });
  } catch (e) {
    return json({ error: (e as Error).message ?? 'erro' }, 500);
  }
});
