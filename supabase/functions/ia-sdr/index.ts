// ia-sdr — worker da IA SDR (Gemini) do canal EMPRÉSTIMO. Cron a cada 1 minuto.
//
// A IA assume DEPOIS que o fluxo determinístico caf_emprestimo_v1 completa (o bot-runner cria a
// ia_sessao no fecho, gated por bot_canal_config.ia_enabled + ia_modo_teste/numeros_teste).
// Ela qualifica INSS, coleta e valida documentos com visão (RG/CNH, comprovante, extratos do
// Meu INSS), entende áudio nativo e entrega o lead pronto pro atendente humano.
//
// DESENHO (decisões amarradas no README.md desta pasta):
//  * Envio SEMPRE via fila bot_mensagens_saida, drenada EM PROCESSO (mesmo padrão do bot-runner):
//    o cron bot-fila-processar só toca status 'agendada' e o bot_pausar cancela pendentes — por
//    isso a IA enfileira 'pendente' e drena ela mesma, com presence "digitando" + jitter.
//  * Serial POR CANAL via lease ia_canal_lock (proteção do chip Evolution) + lock por conversa
//    reusando bot_claim_conversa (lease TTL — advisory lock puro não sobrevive ao PostgREST).
//  * Debounce de 15s re-agendável: o trigger trg_ia_sessao_mensagem empurra processar_apos a cada
//    inbound; cliente que manda 3 áudios seguidos é processado UMA vez, com tudo junto.
//  * Janela 07:30–21:30 (America/Sao_Paulo): fora dela nada sai; reagenda pra próxima 07:30 + jitter.
//  * Humano mandou mensagem => o trigger pausa a sessão sozinho; aqui só re-checamos antes do envio.
//  * Guardrail PÓS-Gemini em TODA mensagem ao cliente (guardrail.ts) — violou => resposta segura.
//  * Sem GEMINI_API_KEY: sessões são adiadas com evento 'sem_api_key' — nunca crash, nunca silêncio.
//
// Auth: x-ia-secret == webhook_config.ia_sdr (padrão dos crons). Deploy com verify_jwt=false.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { enviadorDe } from '../evolution-send/transporte.ts';
import { sendPresenceComposing } from './evolution.ts';
import { chamarGeminiJson, comRetry, temChaveGemini, modeloGemini, type ParteGemini } from './gemini.ts';
import { saidaProibida, perguntaDeValores, RESPOSTA_SEGURA } from './guardrail.ts';
import {
  PERSONA, INSTRUCAO_ETAPA, EXTRAS_ETAPA, esquemaChat,
  SCHEMA_DOC_PESSOAL, SCHEMA_COMPROVANTE, SCHEMA_EXTRATO, PROMPT_EXTRATO,
  SCHEMA_ANALISE_CONSIGNADO, PROMPT_ANALISE_CONSIGNADO,
  PASSO_A_PASSO_MEUINSS, CAPTION_VIDEO_MEUINSS, INSTRUCAO_DOCS_MEUINSS,
  FALLBACK_HANDOFF, FALLBACK_CONCLUSAO,
} from './prompts.ts';
import {
  nomesBatem, cpfsCompativeis, somenteDigitos, mesesComprovante,
  competParaIdx, ultimoMesFechadoIdx, calcularCobertura, formatarFaltas, bancoAlvoDe,
  spWallClock, spParaUtc, type Janela,
} from './validacao.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const BUCKET_MIDIA = 'script-midia';            // anexo_path dos inbounds mora aqui (prefixo {org}/wa-midia/)
const MAX_ARQUIVO = 15 * 1024 * 1024;           // >15MB: pedir reenvio menor
const MAX_SESSOES_POR_CANAL = 6;
const ORCAMENTO_MS = 100_000;                   // teto de parede por invocação (cron cobre o resto)

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type, x-ia-secret', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, Math.max(0, ms)));
const rand = (min: number, max: number) => min + Math.random() * (max - min);

function seguroIgual(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

function paraBase64(bytes: Uint8Array): string {
  let bin = ''; const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) bin += String.fromCharCode(...bytes.subarray(i, i + CH));
  return btoa(bin);
}

// deno-lint-ignore no-explicit-any
type Admin = any;

interface Sessao {
  id: string; organizacao_id: string; canal_id: string; conversa_id: string; contato_id: string;
  oportunidade_id: string | null; etapa: string; dados: Record<string, unknown>;
  docs: Record<string, unknown>; cobertura_extratos: Record<string, unknown>;
  tentativas_erro: number; ultima_msg_cliente_em: string | null; processar_apos: string | null;
  status: string; criado_em: string;
}
interface MsgNova { id: string; tipo: string; conteudo: string | null; criado_em: string; metadados: Record<string, unknown> | null }

// resultado de um turno da máquina de estados
interface Turno {
  bolhas: string[];                               // texto ao cliente (passa no guardrail)
  video?: { url: string; caption: string };
  etapaNova?: string;
  statusNovo?: 'handoff' | 'concluida' | 'encerrada';
  motivoHumano?: string;                          // conversas.precisa_humano_motivo (handoff/conclusão)
  notaInterna?: string;
  dadosPatch?: Record<string, unknown>;
  docsPatch?: Record<string, unknown>;
  coberturaNova?: Record<string, unknown>;
  etiquetaOpp?: string;                           // ex.: 'nao_elegivel'
  resetErros?: boolean;                           // progresso real => zera tentativas_erro
  incrementaErro?: boolean;
  __perguntouValores?: boolean;                   // passagem interna chat->turno
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

    const secretHeader = req.headers.get('x-ia-secret') ?? '';
    const { data: wc } = await admin.from('webhook_config').select('secret').eq('chave', 'ia_sdr').maybeSingle();
    if (!wc?.secret || !seguroIgual(secretHeader, wc.secret as string)) return json({ error: 'unauthorized' }, 401);

    const inicio = Date.now();
    const { data: cfgs } = await admin.from('bot_canal_config')
      .select('canal_id, ia_enabled, ia_modo_teste, ia_config, organizacao_id')
      .eq('ia_enabled', true);
    if (!cfgs?.length) return json({ ok: true, canais: 0 });

    const resultados: Array<Record<string, unknown>> = [];
    for (const cfg of cfgs) {
      if (Date.now() - inicio > ORCAMENTO_MS) break;
      const { data: canal } = await admin.from('canais')
        .select('id, nome_interno, transporte, instancia_externa, cloud_phone_number_id, numero_conectado')
        .eq('id', cfg.canal_id).maybeSingle();
      if (!canal) continue;
      resultados.push(await processarCanal(admin, canal, cfg.ia_config ?? {}, inicio));
    }
    return json({ ok: true, canais: cfgs.length, resultados });
  } catch (e) {
    return json({ error: (e as Error).message ?? 'erro' }, 500);
  }
});

// ======== canal: lease serial + janela + limite diário + sessões devidas ========
async function processarCanal(admin: Admin, canal: Record<string, unknown>, iaConfig: Record<string, unknown>, inicio: number): Promise<Record<string, unknown>> {
  const canalId = canal.id as string;
  const { data: lock } = await admin.rpc('ia_canal_lock', { p_canal: canalId, p_ttl_seg: 240 });
  if (!lock) return { canal: canalId, skipped: 'lock_canal' };
  try {
    const agoraIso = new Date().toISOString();
    const corte15s = new Date(Date.now() - 15_000).toISOString();
    const { data: due } = await admin.from('ia_sessoes').select('*')
      .eq('status', 'ativa').eq('canal_id', canalId)
      .not('processar_apos', 'is', null).lte('processar_apos', agoraIso)
      .order('processar_apos', { ascending: true }).limit(MAX_SESSOES_POR_CANAL);
    const sessoes = ((due ?? []) as Sessao[])
      .filter((s) => !s.ultima_msg_cliente_em || s.ultima_msg_cliente_em <= corte15s);
    if (!sessoes.length) return { canal: canalId, processadas: 0 };

    // ---- janela de operação (SP). Fora dela: nada sai; reagenda pra próxima 07:30 + jitter 0–45min ----
    if (!dentroDaJanela(iaConfig)) {
      for (const s of sessoes) {
        const alvo = proximaAbertura(iaConfig);
        await admin.from('ia_sessoes').update({ processar_apos: alvo, atualizado_em: new Date().toISOString() }).eq('id', s.id).eq('status', 'ativa');
        await evento(admin, s, 'fora_janela', { reagendado_para: alvo });
      }
      return { canal: canalId, reagendadas_fora_janela: sessoes.length };
    }

    // ---- sem chave: adia com evento, nunca crash (setar a secret resolve sozinho) ----
    if (!temChaveGemini()) {
      for (const s of sessoes) {
        await admin.from('ia_sessoes').update({ processar_apos: new Date(Date.now() + 30 * 60_000).toISOString() }).eq('id', s.id).eq('status', 'ativa');
        await evento(admin, s, 'sem_api_key', {});
      }
      return { canal: canalId, sem_api_key: sessoes.length };
    }

    // ---- limite diário de chamadas Gemini (por canal, dia de SP) ----
    const max = Number((iaConfig as { max_chamadas_dia?: number }).max_chamadas_dia) || 500;
    const meiaNoiteSp = inicioDoDiaSpUtcIso();
    const { count: chamadasHoje } = await admin.from('ia_eventos')
      .select('id', { count: 'exact', head: true })
      .eq('tipo', 'gemini_call').gte('criado_em', meiaNoiteSp).contains('detalhe', { canal_id: canalId });
    if ((chamadasHoje ?? 0) >= max) {
      const { data: jaLogado } = await admin.from('ia_eventos').select('id')
        .eq('tipo', 'limite_diario').gte('criado_em', meiaNoiteSp).contains('detalhe', { canal_id: canalId }).limit(1);
      for (const s of sessoes) {
        await admin.from('ia_sessoes').update({ processar_apos: new Date(Date.now() + 60 * 60_000).toISOString() }).eq('id', s.id).eq('status', 'ativa');
      }
      if (!jaLogado?.length) await evento(admin, sessoes[0], 'limite_diario', { canal_id: canalId, chamadas: chamadasHoje, max });
      return { canal: canalId, limite_diario: true };
    }

    // ---- processa SERIAL (nunca duas conversas do mesmo chip ao mesmo tempo) ----
    let processadas = 0;
    for (const s of sessoes) {
      if (Date.now() - inicio > ORCAMENTO_MS) break;
      await processarSessao(admin, s, canal, iaConfig);
      processadas++;
      await admin.rpc('ia_canal_lock', { p_canal: canalId, p_ttl_seg: 240 });  // renova a lease
    }
    return { canal: canalId, processadas };
  } finally {
    try { await admin.rpc('ia_canal_unlock', { p_canal: canalId }); } catch { /* lease expira sozinha */ }
  }
}

// ======== sessão: claim + lock de conversa + turno ========
async function processarSessao(admin: Admin, sessao: Sessao, canal: Record<string, unknown>, iaConfig: Record<string, unknown>): Promise<void> {
  // claim atômico (CAS em processar_apos): outra invocação não pega a mesma sessão
  const claimAte = new Date(Date.now() + 5 * 60_000).toISOString();
  const { data: claimed } = await admin.from('ia_sessoes')
    .update({ processar_apos: claimAte, atualizado_em: new Date().toISOString() })
    .eq('id', sessao.id).eq('status', 'ativa').lte('processar_apos', new Date().toISOString())
    .select('id');
  if (!claimed?.length) return;

  const { data: lockConv } = await admin.rpc('bot_claim_conversa', { p_conversa: sessao.conversa_id, p_ttl_seg: 240 });
  if (!lockConv) {
    await admin.from('ia_sessoes').update({ processar_apos: new Date(Date.now() + 2 * 60_000).toISOString() }).eq('id', sessao.id).eq('status', 'ativa');
    return;
  }
  try {
    await turno(admin, sessao, canal, iaConfig, claimAte);
  } catch (e) {
    const msg = String((e as Error)?.message ?? 'erro').slice(0, 300);
    await evento(admin, sessao, 'erro_turno', { erro: msg });
    const erros = (sessao.tentativas_erro ?? 0) + 1;
    if (erros >= 3) {
      await fazerHandoff(admin, sessao, canal, 'erro_interno', [FALLBACK_HANDOFF],
        `IA SDR: falha interna repetida (${msg}). Sessão entregue ao humano na etapa ${sessao.etapa}.`);
    } else {
      await admin.from('ia_sessoes').update({
        tentativas_erro: erros,
        processar_apos: new Date(Date.now() + 3 * 60_000).toISOString(),
        atualizado_em: new Date().toISOString(),
      }).eq('id', sessao.id).eq('status', 'ativa');
    }
  } finally {
    try { await admin.rpc('bot_release_conversa', { p_conversa: sessao.conversa_id }); } catch { /* lease expira */ }
  }
}

// ======== o TURNO: lê o que chegou, roda a etapa, envia, persiste ========
async function turno(admin: Admin, sessao: Sessao, canal: Record<string, unknown>, iaConfig: Record<string, unknown>, claimAte: string): Promise<void> {
  const { data: conversa } = await admin.from('conversas')
    .select('id, organizacao_id, contato_id, precisa_humano').eq('id', sessao.conversa_id).maybeSingle();
  if (!conversa) { await encerrarSessao(admin, sessao, 'conversa_inexistente'); return; }
  if (conversa.precisa_humano) {
    await admin.from('ia_sessoes').update({ status: 'pausada', atualizado_em: new Date().toISOString() }).eq('id', sessao.id).eq('status', 'ativa');
    await evento(admin, sessao, 'pausada_precisa_humano', {});
    return;
  }
  const { data: opt } = await admin.from('wa_optout').select('contato_id').eq('contato_id', sessao.contato_id).limit(1);
  if (opt?.length) {
    await admin.from('ia_sessoes').update({ status: 'pausada', atualizado_em: new Date().toISOString() }).eq('id', sessao.id).eq('status', 'ativa');
    await evento(admin, sessao, 'optout', {});
    return;
  }

  const { data: contato } = await admin.from('contatos').select('nome, cpf').eq('id', sessao.contato_id).maybeSingle();
  const { data: ident } = await admin.from('contato_identidades')
    .select('valor_normalizado').eq('contato_id', sessao.contato_id).eq('tipo', 'whatsapp')
    .not('valor_normalizado', 'is', null).order('principal', { ascending: false }).limit(1).maybeSingle();
  const destino = ident?.valor_normalizado ?? null;
  if (!destino) {
    await admin.from('ia_sessoes').update({ processar_apos: new Date(Date.now() + 30 * 60_000).toISOString() }).eq('id', sessao.id).eq('status', 'ativa');
    await evento(admin, sessao, 'sem_destino', {});
    return;
  }

  const dados = (sessao.dados ?? {}) as Record<string, unknown>;
  const processadoAte = (dados.processado_ate as string) ?? sessao.criado_em;
  const { data: novasRaw } = await admin.from('mensagens')
    .select('id, tipo, conteudo, criado_em, metadados')
    .eq('conversa_id', sessao.conversa_id).eq('direcao', 'entrada')
    .gt('criado_em', processadoAte).order('criado_em', { ascending: true }).limit(20);
  const novas = (novasRaw ?? []) as MsgNova[];

  if (!novas.length && dados.abertura_enviada) {
    // acordou sem nada novo (claim antigo/reagendamento): volta a dormir até a próxima entrada
    await limparAgenda(admin, sessao.id, claimAte);
    return;
  }

  // histórico recente (contexto do chat): últimas 25 mensagens, viradas pra ordem cronológica
  const { data: histRaw } = await admin.from('mensagens')
    .select('direcao, tipo, conteudo, origem')
    .eq('conversa_id', sessao.conversa_id).order('criado_em', { ascending: false }).limit(25);
  const transcript = ((histRaw ?? []) as Array<{ direcao: string; tipo: string; conteudo: string | null; origem: string | null }>)
    .reverse()
    .filter((m) => m.tipo !== 'nota_interna' && m.tipo !== 'sistema')
    .map((m) => {
      const quem = m.direcao === 'entrada' ? '[cliente]' : '[atendente]';
      if (m.tipo === 'texto' && m.conteudo) return `${quem} ${m.conteudo}`;
      return `${quem} (${m.tipo}${m.conteudo ? `: ${m.conteudo.slice(0, 60)}` : ''})`;
    }).join('\n');

  const ctx: Ctx = {
    admin, sessao, canal, iaConfig, conversa, destino, transcript,
    contatoNome: (contato?.nome as string) ?? '', contatoCpf: (contato?.cpf as string) ?? '',
    dados, docs: (sessao.docs ?? {}) as Record<string, unknown>,
    cobertura: (sessao.cobertura_extratos ?? {}) as Record<string, unknown>,
    novas,
    textos: novas.filter((m) => m.tipo === 'texto' && m.conteudo).map((m) => m.conteudo as string),
    arquivos: novas.filter((m) => (m.tipo === 'imagem' || m.tipo === 'documento') && (m.metadados as Record<string, unknown>)?.anexo_path),
    audios: novas.filter((m) => m.tipo === 'audio' && (m.metadados as Record<string, unknown>)?.anexo_path),
    pendentes: novas.filter((m) => (m.metadados as Record<string, unknown>)?.midia_pendente).length,
  };

  // ---- roda a etapa ----
  let t: Turno;
  switch (sessao.etapa) {
    case 'qualificacao_inss': t = await etapaQualificacao(ctx); break;
    case 'docs_pessoais': t = await etapaDocsPessoais(ctx); break;
    case 'comprovante_residencia': t = await etapaComprovante(ctx); break;
    case 'declarante': t = await etapaDeclarante(ctx); break;
    case 'triagem_govbr': t = await etapaTriagem(ctx); break;
    case 'extratos': t = await etapaExtratos(ctx); break;
    default:
      await evento(admin, sessao, 'etapa_desconhecida', { etapa: sessao.etapa });
      t = { bolhas: [], incrementaErro: true };
  }

  // ---- insistência em valores: resposta segura; 2ª vez => handoff ----
  const perguntouValores = ctx.textos.some((x) => perguntaDeValores(x)) || t.__perguntouValores === true;
  if (perguntouValores && !t.statusNovo) {
    const n = (Number(dados.perguntas_valores ?? 0) || 0) + 1;
    t.dadosPatch = { ...(t.dadosPatch ?? {}), perguntas_valores: n };
    if (n >= 2) {
      t = {
        ...t, statusNovo: 'handoff', motivoHumano: 'quer_falar_valores',
        bolhas: ['Entendo perfeitamente! Vou passar o senhor para o nosso especialista, que é quem pode conversar sobre valores. Ele já vai falar com o senhor por aqui. 🙏'],
        notaInterna: t.notaInterna ?? notaContexto(ctx, 'quer_falar_valores'),
        dadosPatch: t.dadosPatch,
      };
    } else if (!t.etapaNova) {
      t.bolhas = [RESPOSTA_SEGURA];
    } else {
      t.bolhas = [RESPOSTA_SEGURA, ...t.bolhas].slice(0, 3);
    }
  }

  // ---- guardrail PÓS-Gemini em tudo que vai ao cliente ----
  const bolhasLimpa: string[] = [];
  for (const b of t.bolhas) {
    const v = saidaProibida(b);
    if (v) {
      await evento(admin, sessao, 'guardrail_bloqueou', { violacao: v, texto: b.slice(0, 180) });
      if (!bolhasLimpa.includes(RESPOSTA_SEGURA)) bolhasLimpa.push(RESPOSTA_SEGURA);
    } else bolhasLimpa.push(b);
  }

  // ---- humano entrou enquanto processávamos? (o trigger já pausou) => não envia nada ----
  const { data: fresca } = await admin.from('ia_sessoes').select('status').eq('id', sessao.id).maybeSingle();
  if (fresca?.status !== 'ativa') { await evento(admin, sessao, 'abortado_status', { status: fresca?.status ?? null }); return; }

  // ---- envia (fila bot_mensagens_saida drenada em processo, presence + jitter) ----
  if (bolhasLimpa.length || t.video) {
    await enviarBolhas(admin, ctx, bolhasLimpa.slice(0, 3), t.video ?? null);
  }

  // ---- persiste o desfecho do turno ----
  const ultimaNova = novas.length ? novas[novas.length - 1].criado_em : processadoAte;
  const patch: Record<string, unknown> = {
    dados: { ...dados, ...(t.dadosPatch ?? {}), processado_ate: ultimaNova, abertura_enviada: true },
    docs: { ...ctx.docs, ...(t.docsPatch ?? {}) },
    atualizado_em: new Date().toISOString(),
  };
  if (t.coberturaNova) patch.cobertura_extratos = t.coberturaNova;
  if (t.etapaNova) { patch.etapa = t.etapaNova; (patch.dados as Record<string, unknown>).tentativas_etapa = 0; }
  if (t.resetErros) patch.tentativas_erro = 0;
  else if (t.incrementaErro) patch.tentativas_erro = (sessao.tentativas_erro ?? 0) + 1;

  if (t.statusNovo === 'handoff') {
    await fazerHandoff(admin, sessao, canal, t.motivoHumano ?? 'handoff', [], t.notaInterna ?? notaContexto(ctx, t.motivoHumano ?? 'handoff'), patch);
    return;
  }
  if (t.statusNovo === 'concluida') {
    patch.status = 'concluida';
    await admin.from('conversas').update({
      precisa_humano: true, precisa_humano_motivo: t.motivoHumano ?? 'docs_completos_fechar', precisa_humano_em: new Date().toISOString(),
    }).eq('id', sessao.conversa_id);
    if (t.notaInterna) await criarNotaInterna(admin, sessao, t.notaInterna);
    await evento(admin, sessao, 'concluida', {});
  }
  if (t.statusNovo === 'encerrada') {
    patch.status = 'encerrada';
    if (t.etiquetaOpp) await etiquetarOportunidade(admin, sessao, t.etiquetaOpp);
    await evento(admin, sessao, 'encerrada', { motivo: t.etiquetaOpp ?? null });
  }

  // erro de entendimento acumulado => handoff educado (regra dura da etapa 6)
  const errosDepois = (patch.tentativas_erro as number | undefined) ?? sessao.tentativas_erro ?? 0;
  if (!t.statusNovo && errosDepois >= 2) {
    await fazerHandoff(admin, sessao, canal, 'nao_entendeu', [FALLBACK_HANDOFF], notaContexto(ctx, 'nao_entendeu'), patch);
    return;
  }

  await admin.from('ia_sessoes').update(patch).eq('id', sessao.id);
  if (!t.statusNovo) await limparAgenda(admin, sessao.id, claimAte);
}

interface Ctx {
  admin: Admin; sessao: Sessao; canal: Record<string, unknown>; iaConfig: Record<string, unknown>;
  conversa: Record<string, unknown>; destino: string; transcript: string;
  contatoNome: string; contatoCpf: string;
  dados: Record<string, unknown>; docs: Record<string, unknown>; cobertura: Record<string, unknown>;
  novas: MsgNova[]; textos: string[]; arquivos: MsgNova[]; audios: MsgNova[]; pendentes: number;
}

// ======== etapas ========
async function etapaQualificacao(ctx: Ctx): Promise<Turno> {
  if (!ctx.dados.abertura_enviada && !ctx.textos.length && !ctx.audios.length) {
    const r = await conversar(ctx, 'Abra a conversa desta etapa agora: cumprimente rapidamente e faça a pergunta do benefício do INSS.', [
      'O senhor é aposentado, pensionista ou recebe algum benefício do INSS?',
    ]);
    return { bolhas: r.mensagens, resetErros: true };
  }
  const r = await conversar(ctx, '', ['Só pra eu confirmar: o senhor recebe aposentadoria, pensão ou algum outro benefício do INSS?']);
  const recebe = String(r.dados.recebe_inss ?? 'incerto');
  if (recebe === 'sim') return { bolhas: r.mensagens, etapaNova: 'docs_pessoais', resetErros: true, __perguntouValores: r.perguntouValores };
  if (recebe === 'nao') {
    return {
      bolhas: r.mensagens.length ? r.mensagens : ['Entendi! Nesse caso a nossa análise não se aplica, mas agradeço demais o contato. Qualquer coisa, estamos por aqui. 🙏'],
      statusNovo: 'encerrada', etiquetaOpp: 'nao_elegivel', __perguntouValores: r.perguntouValores,
    };
  }
  return { bolhas: r.mensagens, incrementaErro: true, __perguntouValores: r.perguntouValores };
}

const PROMPT_DOC_PESSOAL = `Você é um extrator de dados de documento de identidade brasileiro (RG ou CNH). Analise a imagem/arquivo anexo e devolva o JSON pedido. "legivel"=false quando não dá para ler o nome com segurança (foto tremida, cortada, escura).`;

async function etapaDocsPessoais(ctx: Ctx): Promise<Turno> {
  if (!ctx.arquivos.length) {
    if (ctx.pendentes) return { bolhas: ['Parece que o arquivo não chegou direitinho aqui. 😔 O senhor pode mandar a foto de novo, por favor?'] };
    const r = await conversar(ctx, '', ['Quando puder, me manda a foto do RG ou da CNH do senhor, frente e verso, bem legível. 😊']);
    return { bolhas: r.mensagens, __perguntouValores: r.perguntouValores };
  }
  const exts = await extrairDeArquivos(ctx, PROMPT_DOC_PESSOAL, SCHEMA_DOC_PESSOAL);
  if (exts.grandes) return { bolhas: ['O arquivo veio muito pesado e não consegui abrir. 😔 Pode mandar como foto normal, tirada da galeria mesmo?'] };
  const ok = exts.itens.find((d) => d.legivel && d.tipo_documento !== 'outro' && d.nome_completo && d.confianca !== 'baixa');
  const tent = (Number(ctx.dados.tentativas_etapa ?? 0) || 0) + 1;
  if (!ok) {
    if (tent > 2) return { bolhas: [FALLBACK_HANDOFF], statusNovo: 'handoff', motivoHumano: 'foto_ilegivel' };
    return { bolhas: ['A foto chegou, mas não consegui ler direitinho. 😅 Pode tirar outra, num lugar mais claro e com o documento inteiro aparecendo?'], dadosPatch: { tentativas_etapa: tent } };
  }
  const nomeDoc = String(ok.nome_completo);
  const bateNome = nomesBatem(nomeDoc, ctx.contatoNome) || nomesBatem(nomeDoc, String(ctx.dados.nome_confirmado ?? ''));
  const bateCpf = cpfsCompativeis(String(ok.cpf ?? ''), ctx.contatoCpf);
  if (!bateNome || !bateCpf) {
    if (tent > 2) return { bolhas: [FALLBACK_HANDOFF], statusNovo: 'handoff', motivoHumano: 'doc_divergente' };
    return {
      bolhas: [`Esse documento parece estar no nome de ${primeiroNome(nomeDoc)}. Eu preciso do documento do próprio titular do benefício. O senhor pode conferir e me mandar de novo?`],
      dadosPatch: { tentativas_etapa: tent },
    };
  }
  const meses = mesesComprovante();
  const r = await conversar(ctx,
    `O documento (${String(ok.tipo_documento).toUpperCase()}) foi recebido e validado com sucesso. Agradeça e peça agora o comprovante de residência: uma conta (luz, água, telefone) no nome do cliente, de ${meses[0].rotulo} ou ${meses[1].rotulo}. Foto ou PDF.`,
    ['Documento recebido, muito obrigada! 🙌', `Agora preciso de um comprovante de residência no nome do senhor: pode ser conta de luz, água ou telefone, de ${meses[0].rotulo} ou ${meses[1].rotulo}.`]);
  return {
    bolhas: r.mensagens, etapaNova: 'comprovante_residencia', resetErros: true,
    dadosPatch: { nome_confirmado: nomeDoc },
    docsPatch: { doc_pessoal: { tipo: ok.tipo_documento, nome: nomeDoc, cpf_mascarado: mascararCpf(String(ok.cpf ?? '')), anexos: ctx.arquivos.map((a) => (a.metadados as Record<string, unknown>)?.anexo_path), validado_em: new Date().toISOString() } },
  };
}

const PROMPT_COMPROVANTE = `Você é um extrator de dados de comprovante de residência brasileiro (conta de luz, água, telefone, internet, gás etc.). Analise o arquivo anexo e devolva o JSON pedido. mes_referencia/ano = mês de REFERÊNCIA da conta (ou do vencimento, se não houver referência).`;

async function etapaComprovante(ctx: Ctx): Promise<Turno> {
  const meses = mesesComprovante();
  if (!ctx.arquivos.length) {
    if (ctx.pendentes) return { bolhas: ['O arquivo não chegou direitinho aqui. 😔 Pode mandar de novo, por favor?'] };
    const r = await conversarComVars(ctx, { MESES_ACEITOS: `de ${meses[0].rotulo} ou ${meses[1].rotulo}` }, '',
      [`Quando puder, me manda o comprovante de residência no nome do senhor (conta de luz, água ou telefone), de ${meses[0].rotulo} ou ${meses[1].rotulo}. 😊`]);
    return { bolhas: r.mensagens, __perguntouValores: r.perguntouValores };
  }
  const exts = await extrairDeArquivos(ctx, PROMPT_COMPROVANTE, SCHEMA_COMPROVANTE);
  if (exts.grandes) return { bolhas: ['O arquivo veio muito pesado e não consegui abrir. 😔 Pode mandar como foto normal?'] };
  const ok = exts.itens.find((d) => d.legivel && d.nome_titular);
  const tent = (Number(ctx.dados.tentativas_etapa ?? 0) || 0) + 1;
  if (!ok) {
    if (tent > 2) return { bolhas: [FALLBACK_HANDOFF], statusNovo: 'handoff', motivoHumano: 'comprovante_ilegivel' };
    return { bolhas: ['Não consegui ler o comprovante direitinho. 😅 Pode tirar outra foto, com a parte de cima da conta aparecendo inteira?'], dadosPatch: { tentativas_etapa: tent } };
  }
  const mesOk = meses.some((m) => Number(ok.mes_referencia) === m.mes && Number(ok.ano) === m.ano);
  if (!mesOk) {
    if (tent > 2) return { bolhas: [FALLBACK_HANDOFF], statusNovo: 'handoff', motivoHumano: 'comprovante_fora_janela' };
    return {
      bolhas: [`Essa conta é de uma data mais antiga. Eu preciso de uma conta de ${meses[0].rotulo} ou de ${meses[1].rotulo}. O senhor tem uma mais recente aí?`],
      dadosPatch: { tentativas_etapa: tent },
    };
  }
  const titular = String(ok.nome_titular);
  const nomeLead = String(ctx.dados.nome_confirmado ?? ctx.contatoNome);
  const docBase = { tipo_conta: ok.tipo_conta, titular, mes: ok.mes_referencia, ano: ok.ano, anexos: ctx.arquivos.map((a) => (a.metadados as Record<string, unknown>)?.anexo_path), validado_em: new Date().toISOString() };
  if (!nomesBatem(titular, nomeLead)) {
    const r = await conversarComVars(ctx, { TITULAR: titular },
      `O comprovante veio no nome de outra pessoa (${titular}). Explique com naturalidade que, como a conta está no nome dela, precisamos também do RG ou CNH dessa pessoa (o declarante), frente e verso, foto legível.`,
      [`Vi aqui que a conta está no nome de ${primeiroNome(titular)}. Sem problema nenhum! 😊`, `Nesse caso, eu só preciso também do RG ou da CNH de ${primeiroNome(titular)}, frente e verso, pra constar como declarante. Pode me mandar a foto?`]);
    return { bolhas: r.mensagens, etapaNova: 'declarante', resetErros: true, dadosPatch: { titular_comprovante: titular }, docsPatch: { comprovante: docBase } };
  }
  const r = await conversar(ctx,
    'O comprovante foi recebido e validado. Agradeça e pergunte se o cliente tem a senha do gov.br e costuma usar o aplicativo Meu INSS (apenas pergunte SE tem — nunca peça a senha).',
    ['Comprovante recebido, obrigada! 🙌', 'Me diz uma coisa: o senhor tem a senha do gov.br e costuma usar o aplicativo Meu INSS?']);
  return { bolhas: r.mensagens, etapaNova: 'triagem_govbr', resetErros: true, docsPatch: { comprovante: docBase } };
}

async function etapaDeclarante(ctx: Ctx): Promise<Turno> {
  const titular = String(ctx.dados.titular_comprovante ?? '');
  if (!ctx.arquivos.length) {
    if (ctx.pendentes) return { bolhas: ['O arquivo não chegou direitinho aqui. 😔 Pode mandar de novo, por favor?'] };
    const r = await conversarComVars(ctx, { TITULAR: titular }, '',
      [`Quando puder, me manda a foto do RG ou da CNH de ${primeiroNome(titular)} (frente e verso, bem legível), pra constar como declarante. 😊`]);
    return { bolhas: r.mensagens, __perguntouValores: r.perguntouValores };
  }
  const exts = await extrairDeArquivos(ctx, PROMPT_DOC_PESSOAL, SCHEMA_DOC_PESSOAL);
  if (exts.grandes) return { bolhas: ['O arquivo veio muito pesado e não consegui abrir. 😔 Pode mandar como foto normal?'] };
  const ok = exts.itens.find((d) => d.legivel && d.tipo_documento !== 'outro' && d.nome_completo && d.confianca !== 'baixa');
  const tent = (Number(ctx.dados.tentativas_etapa ?? 0) || 0) + 1;
  if (!ok) {
    if (tent > 2) return { bolhas: [FALLBACK_HANDOFF], statusNovo: 'handoff', motivoHumano: 'foto_ilegivel' };
    return { bolhas: ['Não consegui ler direitinho. 😅 Pode tirar outra foto do documento, num lugar mais claro?'], dadosPatch: { tentativas_etapa: tent } };
  }
  const nomeDoc = String(ok.nome_completo);
  if (!nomesBatem(nomeDoc, titular)) {
    if (tent > 2) return { bolhas: [FALLBACK_HANDOFF], statusNovo: 'handoff', motivoHumano: 'declarante_divergente' };
    return {
      bolhas: [`Esse documento parece não ser de ${primeiroNome(titular)}, que é quem está na conta. Pode conferir e me mandar o documento dela(e)?`],
      dadosPatch: { tentativas_etapa: tent },
    };
  }
  const declarante = { nome: nomeDoc, cpf: somenteDigitos(String(ok.cpf ?? '')) || null, tipo_documento: ok.tipo_documento, validado_em: new Date().toISOString() };
  const r = await conversar(ctx,
    'O documento do declarante foi validado. Agradeça e pergunte se o cliente tem a senha do gov.br e costuma usar o aplicativo Meu INSS (apenas pergunte SE tem — nunca peça a senha).',
    ['Recebido, obrigada! 🙌', 'Me diz uma coisa: o senhor tem a senha do gov.br e costuma usar o aplicativo Meu INSS?']);
  return {
    bolhas: r.mensagens, etapaNova: 'triagem_govbr', resetErros: true,
    dadosPatch: { declarante },
    docsPatch: { declarante_doc: { ...declarante, anexos: ctx.arquivos.map((a) => (a.metadados as Record<string, unknown>)?.anexo_path) } },
  };
}

async function etapaTriagem(ctx: Ctx): Promise<Turno> {
  const r = await conversar(ctx, '', ['O senhor tem a senha do gov.br e costuma usar o aplicativo Meu INSS?']);
  const tem = String(r.dados.tem_govbr ?? 'incerto');
  if (tem === 'sim') {
    const videoPath = String((ctx.iaConfig as { video_meuinss_path?: string }).video_meuinss_path ?? '').trim();
    if (videoPath) {
      const url = /^https?:\/\//i.test(videoPath) ? videoPath
        : `${SUPABASE_URL}/storage/v1/object/public/bot-midia/${videoPath.replace(/^\/+/, '')}`;
      return {
        bolhas: [INSTRUCAO_DOCS_MEUINSS], video: { url, caption: CAPTION_VIDEO_MEUINSS },
        etapaNova: 'extratos', resetErros: true, __perguntouValores: r.perguntouValores,
      };
    }
    return { bolhas: [...PASSO_A_PASSO_MEUINSS], etapaNova: 'extratos', resetErros: true, __perguntouValores: r.perguntouValores };
  }
  if (tem === 'nao' || tem === 'nao_sabe') {
    return {
      bolhas: r.mensagens.length ? r.mensagens : ['Sem problema nenhum, o senhor não se preocupe! 🙏 Um atendente da nossa equipe vai falar com o senhor aqui mesmo e baixar os documentos junto com o senhor, passo a passo.'],
      statusNovo: 'handoff', motivoHumano: 'sem_acesso_govbr', __perguntouValores: r.perguntouValores,
    };
  }
  return { bolhas: r.mensagens, incrementaErro: true, __perguntouValores: r.perguntouValores };
}

async function etapaExtratos(ctx: Ctx): Promise<Turno> {
  const cob = ctx.cobertura;
  const janelasRaw: Janela[] = Array.isArray(cob.janelas) ? (cob.janelas as Janela[]) : [];
  const bancosAlvo = new Set<string>(Array.isArray(cob.bancos_alvo) ? (cob.bancos_alvo as string[]) : []);
  let rubrica217 = cob.rubrica_217 === true;
  let cpfExtratos = (cob.cpf as string) ?? '';
  let consignado = (ctx.docs.consignado as Record<string, unknown> | undefined) ?? undefined;
  const alvoFim = ultimoMesFechadoIdx();
  const antes = calcularCobertura(janelasRaw, alvoFim);
  let progresso = false;

  if (ctx.arquivos.length) {
    const exts = await extrairDeArquivos(ctx, PROMPT_EXTRATO, SCHEMA_EXTRATO);
    if (exts.grandes) return { bolhas: ['Um dos arquivos veio muito pesado e não consegui abrir. 😔 Pode baixar de novo no aplicativo e me mandar o arquivo direto?'] };
    for (let i = 0; i < exts.itens.length; i++) {
      const d = exts.itens[i];
      const anexo = (ctx.arquivos[i]?.metadados as Record<string, unknown>)?.anexo_path as string | undefined;
      const cpfArq = somenteDigitos(String(d.cpf ?? ''));
      if (cpfArq.length === 11) {
        if ((cpfExtratos && cpfArq !== cpfExtratos) || !cpfsCompativeis(cpfArq, ctx.contatoCpf)) {
          return {
            bolhas: ['Percebi uma diferença nos documentos e, pra não ter erro, vou pedir ajuda de um atendente da equipe, tá bom? Ele já vai falar com o senhor. 🙏'],
            statusNovo: 'handoff', motivoHumano: 'cpf_divergente',
            notaInterna: notaContexto(ctx, `cpf_divergente: extrato ${mascararCpf(cpfArq)} x cadastro ${mascararCpf(ctx.contatoCpf)}`),
          };
        }
        cpfExtratos = cpfExtratos || cpfArq;
      }
      if (d.tipo === 'historico_emprestimo_consignado') {
        consignado = { anexo_path: anexo, mime: (ctx.arquivos[i]?.metadados as Record<string, unknown>)?.mime, nbs: d.nbs ?? [], recebido_em: new Date().toISOString() };
        progresso = true;
      } else if (d.tipo === 'historico_creditos') {
        const ini = competParaIdx(String(d.compet_inicial ?? ''));
        const fim = competParaIdx(String(d.compet_final ?? ''));
        if (ini != null && fim != null) { janelasRaw.push({ ini, fim }); progresso = true; }
        for (const b of (d.bancos_pagadores ?? []) as string[]) {
          const alvo = bancoAlvoDe(b);
          if (alvo) bancosAlvo.add(alvo);
        }
        if (d.tem_rubrica_217 === true) rubrica217 = true;
      }
    }
  }

  const depois = calcularCobertura(janelasRaw, alvoFim);
  if (depois.mesesCobertos > antes.mesesCobertos) progresso = true;
  const coberturaNova: Record<string, unknown> = {
    alvo_ini: depois.alvoIni, alvo_fim: depois.alvoFim,
    janelas: depois.janelas, faltando: depois.faltando,
    meses_cobertos: depois.mesesCobertos, completo: depois.completo,
    bancos_alvo: [...bancosAlvo], rubrica_217: rubrica217, cpf: cpfExtratos || undefined,
    atualizado_em: new Date().toISOString(),
  };

  // tudo em mãos => análise final (interna) + conclusão
  if (depois.completo && consignado?.anexo_path) {
    return await analiseFinal(ctx, consignado, coberturaNova);
  }

  // cliente com dificuldade (texto/áudio) ou 2 rodadas sem progresso => caminho ESPERADO: humano ajuda
  if (!ctx.arquivos.length && (ctx.textos.length || ctx.audios.length)) {
    const faltaTxt = montarFaltaTexto(depois, !!consignado);
    const r = await conversarComVars(ctx, { FALTA: faltaTxt }, '', [`Estou por aqui! ${faltaTxt}`]);
    if (r.dados.cliente_com_dificuldade === true || r.acao === 'handoff') {
      return {
        bolhas: ['Essa parte do aplicativo dá um trabalhinho mesmo! 😊 O senhor não se preocupe: um atendente da nossa equipe vai te ajudar pessoalmente com esses documentos, aqui mesmo. Já já ele fala com o senhor. 🙏'],
        statusNovo: 'handoff', motivoHumano: 'auxilio_extratos', coberturaNova,
      };
    }
    return { bolhas: r.mensagens, coberturaNova, __perguntouValores: r.perguntouValores };
  }

  const rodadas = progresso ? 0 : (Number(ctx.dados.rodadas_sem_progresso ?? 0) || 0) + 1;
  if (rodadas >= 2) {
    return {
      bolhas: ['Essa parte do aplicativo dá um trabalhinho mesmo! 😊 O senhor não se preocupe: um atendente da nossa equipe vai te ajudar pessoalmente com esses documentos, aqui mesmo. Já já ele fala com o senhor. 🙏'],
      statusNovo: 'handoff', motivoHumano: 'auxilio_extratos', coberturaNova,
      dadosPatch: { rodadas_sem_progresso: rodadas },
    };
  }

  // resposta com PRECISÃO do que falta (montada em código, nunca pelo modelo)
  const bolhas: string[] = [];
  if (progresso) bolhas.push('Recebi, muito obrigada! 🙌');
  bolhas.push(montarFaltaTexto(depois, !!consignado));
  return {
    bolhas: bolhas.slice(0, 3), coberturaNova, resetErros: progresso,
    dadosPatch: { rodadas_sem_progresso: rodadas },
    docsPatch: consignado ? { consignado } : undefined,
  };
}

function montarFaltaTexto(cob: ReturnType<typeof calcularCobertura>, temConsignado: boolean): string {
  const partes: string[] = [];
  if (!temConsignado) partes.push('falta o *Histórico de Empréstimo Consignado* (aquele arquivo único)');
  if (!cob.completo) {
    const faltas = formatarFaltas(cob.faltando);
    partes.push(cob.mesesCobertos === 0
      ? 'faltam os *Históricos de Créditos* (ano a ano, começando do mais recente)'
      : `dos Históricos de Créditos, só falta o período de ${faltas}`);
  }
  if (!partes.length) return 'Recebi tudo certinho! 🙌';
  return `Pra fechar, ${partes.join(' e ')}. Pode mandar aqui que eu confiro na hora. 😊`;
}

// ======== análise final (interna — nada disso vai ao cliente) ========
async function analiseFinal(ctx: Ctx, consignado: Record<string, unknown>, coberturaNova: Record<string, unknown>): Promise<Turno> {
  const arq = await baixarAnexo(ctx.admin, String(consignado.anexo_path), String(consignado.mime ?? 'application/pdf'));
  let analise: Record<string, unknown> = {};
  if (arq) {
    const r = await geminiComEvento(ctx, 'analise_consignado', {
      system: PROMPT_ANALISE_CONSIGNADO,
      partes: [{ inline_data: { mime_type: arq.mime, data: arq.b64 } }, { text: 'Extraia os dados no JSON pedido.' }],
      schema: SCHEMA_ANALISE_CONSIGNADO, temperatura: 0, maxTokens: 8192,
    });
    if (r) analise = r.json;
  }
  const cartoes = Array.isArray(analise.cartoes) ? (analise.cartoes as Array<Record<string, unknown>>) : [];
  const bancosAlvo = (coberturaNova.bancos_alvo as string[]) ?? [];
  const rubrica217 = coberturaNova.rubrica_217 === true;
  const cartaoAtivo = cartoes.length > 0;
  // rubrica 217 ("EMPRESTIMO SOBRE A RMC") é rastro direto de RMC — conta como cartão pro flag
  const potencial = cartaoAtivo || rubrica217 || bancosAlvo.length > 0;

  const analiseCompleta = {
    ...analise,
    bancos_alvo: bancosAlvo, rubrica_217: rubrica217,
    cobertura: { meses: coberturaNova.meses_cobertos, alvo_ini: coberturaNova.alvo_ini, alvo_fim: coberturaNova.alvo_fim },
    nbs_consignado: consignado.nbs ?? [],
    gerado_em: new Date().toISOString(), modelo: modeloGemini(),
  };

  // grava na oportunidade (metadados.analise_extratos + potencial_tese_juros)
  let oppId = ctx.sessao.oportunidade_id;
  if (!oppId) {
    const { data: o } = await ctx.admin.from('oportunidades').select('id')
      .eq('organizacao_id', ctx.sessao.organizacao_id).eq('contato_id', ctx.sessao.contato_id).eq('status', 'em_andamento')
      .order('criado_em', { ascending: false }).limit(1).maybeSingle();
    oppId = o?.id ?? null;
  }
  if (oppId) {
    const { data: opp } = await ctx.admin.from('oportunidades').select('metadados').eq('id', oppId).maybeSingle();
    await ctx.admin.from('oportunidades').update({
      metadados: { ...((opp?.metadados as Record<string, unknown>) ?? {}), analise_extratos: analiseCompleta, potencial_tese_juros: potencial },
    }).eq('id', oppId);
  }
  await evento(ctx.admin, ctx.sessao, 'analise_final', { oportunidade_id: oppId, potencial_tese_juros: potencial, bancos_alvo: bancosAlvo, cartoes: cartoes.length });

  return {
    bolhas: [FALLBACK_CONCLUSAO],
    statusNovo: 'concluida', motivoHumano: 'docs_completos_fechar',
    coberturaNova, docsPatch: { consignado },
    notaInterna: notaAnalise(ctx, analiseCompleta, potencial),
  };
}

function notaAnalise(ctx: Ctx, a: Record<string, unknown>, potencial: boolean): string {
  const linhas: string[] = ['🤖 IA SDR — documentação completa, resumo da análise dos extratos:'];
  const margens = Array.isArray(a.margens) ? (a.margens as Array<Record<string, unknown>>) : [];
  for (const m of margens) {
    linhas.push(`• Margem ${String(m.modalidade).toUpperCase()}: disponível ${fmtNum(m.disponivel)} | utilizada ${fmtNum(m.utilizada)} | reservada ${fmtNum(m.reservada)}${m.extrapolada ? ` | extrapolada ${fmtNum(m.extrapolada)}` : ''}`);
  }
  const bens = Array.isArray(a.beneficios) ? (a.beneficios as Array<Record<string, unknown>>) : [];
  for (const b of bens) linhas.push(`• NB ${b.nb ?? '?'}: ${b.situacao ?? 's/ situação'}${b.bloqueado ? ' (BLOQUEADO p/ empréstimo)' : (b.elegivel_emprestimo === false ? ' (não elegível)' : '')}`);
  const cts = Array.isArray(a.contratos_ativos) ? (a.contratos_ativos as Array<Record<string, unknown>>) : [];
  if (cts.length) {
    linhas.push(`• Contratos ativos (${cts.length}):`);
    for (const c of cts.slice(0, 12)) linhas.push(`   – ${c.banco ?? '?'} ${c.contrato ? `(${c.contrato})` : ''}: parcela ${fmtNum(c.parcela)}, emprestado ${fmtNum(c.valor_emprestado)}, taxa ${c.taxa_mensal ?? '?'}% a.m.`);
  }
  const cards = Array.isArray(a.cartoes) ? (a.cartoes as Array<Record<string, unknown>>) : [];
  for (const c of cards) linhas.push(`• Cartão ${String(c.tipo).toUpperCase()} ${c.banco ?? '?'}: limite ${fmtNum(c.limite)}, reservado ${fmtNum(c.reservado)}`);
  const bancos = Array.isArray(a.bancos_alvo) ? (a.bancos_alvo as string[]) : [];
  linhas.push(`• Bancos-alvo no histórico de créditos: ${bancos.length ? bancos.join(', ').toUpperCase() : 'nenhum'}${a.rubrica_217 ? ' | rubrica 217 (EMPRÉSTIMO SOBRE A RMC) presente' : ''}`);
  linhas.push(`• Cobertura: ${(a.cobertura as Record<string, unknown>)?.meses ?? '?'} de 120 meses`);
  linhas.push(`➡️ potencial_tese_juros: ${potencial ? 'SIM' : 'não'}`);
  if (ctx.dados.declarante) linhas.push(`• Declarante: ${(ctx.dados.declarante as Record<string, unknown>)?.nome ?? '?'}`);
  return linhas.join('\n');
}
function fmtNum(v: unknown): string { return typeof v === 'number' && Number.isFinite(v) ? v.toFixed(2) : '?'; }

// ======== conversa (chat com persona + instrução da etapa) ========
interface RespostaChat { mensagens: string[]; acao: string; dados: Record<string, unknown>; perguntouValores: boolean }

async function conversar(ctx: Ctx, instrucaoExtra: string, fallback: string[]): Promise<RespostaChat> {
  return conversarComVars(ctx, {}, instrucaoExtra, fallback);
}

async function conversarComVars(ctx: Ctx, vars: Record<string, string>, instrucaoExtra: string, fallback: string[]): Promise<RespostaChat> {
  let instrucao = INSTRUCAO_ETAPA[ctx.sessao.etapa] ?? '';
  const meses = mesesComprovante();
  const defaults: Record<string, string> = {
    MESES_ACEITOS: `de ${meses[0].rotulo} ou ${meses[1].rotulo}`,
    TITULAR: String(ctx.dados.titular_comprovante ?? 'a pessoa da conta'),
    FALTA: '',
  };
  for (const [k, v] of Object.entries({ ...defaults, ...vars })) {
    instrucao = instrucao.replaceAll(`{${k}}`, v);
  }
  const system = `${PERSONA}\n\n${instrucao}${instrucaoExtra ? `\n\nINSTRUÇÃO DESTE TURNO: ${instrucaoExtra}` : ''}`;

  const partes: ParteGemini[] = [{ text: montarContexto(ctx) }];
  for (const a of ctx.audios.slice(0, 3)) {
    const meta = (a.metadados ?? {}) as Record<string, unknown>;
    const arq = await baixarAnexo(ctx.admin, String(meta.anexo_path), String(meta.mime ?? 'audio/ogg'));
    if (arq) partes.push({ inline_data: { mime_type: arq.mime, data: arq.b64 } });
  }
  partes.push({ text: 'Responda no JSON pedido (mensagens curtas e calorosas; uma pergunta por vez).' });

  const r = await geminiComEvento(ctx, `chat_${ctx.sessao.etapa}`, {
    system, partes, schema: esquemaChat(EXTRAS_ETAPA[ctx.sessao.etapa] ?? {}), temperatura: 0.5, maxTokens: 1024,
  });
  if (!r) return { mensagens: fallback, acao: 'perguntar', dados: {}, perguntouValores: false };
  const j = r.json as { mensagens?: unknown; acao?: unknown; dados_extraidos?: unknown; perguntou_valores?: unknown };
  const mensagens = (Array.isArray(j.mensagens) ? j.mensagens : []).map((m) => String(m)).filter(Boolean).slice(0, 3);
  return {
    mensagens: mensagens.length ? mensagens : fallback,
    acao: String(j.acao ?? 'perguntar'),
    dados: (j.dados_extraidos && typeof j.dados_extraidos === 'object') ? j.dados_extraidos as Record<string, unknown> : {},
    perguntouValores: j.perguntou_valores === true,
  };
}

function montarContexto(ctx: Ctx): string {
  const linhas: string[] = [];
  linhas.push(`DADOS DO ATENDIMENTO (não repita à toa; use para não perguntar o que já sabe):`);
  linhas.push(`- Nome no cadastro: ${ctx.contatoNome || '(desconhecido)'}`);
  if (ctx.dados.nome_confirmado) linhas.push(`- Nome confirmado no documento: ${ctx.dados.nome_confirmado}`);
  if (ctx.dados.titular_comprovante) linhas.push(`- Titular do comprovante: ${ctx.dados.titular_comprovante}`);
  linhas.push(`- Documentos já recebidos: ${['doc_pessoal', 'comprovante', 'declarante_doc', 'consignado'].filter((k) => ctx.docs[k]).join(', ') || 'nenhum'}`);
  linhas.push('');
  linhas.push('HISTÓRICO RECENTE DA CONVERSA:');
  linhas.push(ctx.transcript || '(vazio)');
  linhas.push('');
  if (ctx.textos.length || ctx.audios.length || ctx.arquivos.length) {
    linhas.push('NOVAS MENSAGENS DO CLIENTE (responda a elas):');
    for (const m of ctx.novas) {
      if (m.tipo === 'texto' && m.conteudo) linhas.push(`- "${m.conteudo}"`);
      else if (m.tipo === 'audio') linhas.push('- [áudio do cliente — anexo nesta chamada]');
      else linhas.push(`- [cliente enviou ${m.tipo}]`);
    }
  } else {
    linhas.push('(não há mensagem nova do cliente neste turno — é a abertura da etapa)');
  }
  return linhas.join('\n');
}

// ======== extração de documentos (visão, temperatura 0) ========
interface ExtracaoDocs { itens: Array<Record<string, unknown>>; grandes: boolean }

async function extrairDeArquivos(ctx: Ctx, prompt: string, schema: Record<string, unknown>): Promise<ExtracaoDocs> {
  const itens: Array<Record<string, unknown>> = [];
  let grandes = false;
  for (const m of ctx.arquivos.slice(0, 8)) {
    const meta = (m.metadados ?? {}) as Record<string, unknown>;
    const tamanho = Number(meta.tamanho ?? 0) || 0;
    if (tamanho > MAX_ARQUIVO) { grandes = true; await evento(ctx.admin, ctx.sessao, 'midia_grande', { tamanho, anexo: meta.anexo_path }); continue; }
    const arq = await baixarAnexo(ctx.admin, String(meta.anexo_path), String(meta.mime ?? 'application/octet-stream'));
    if (!arq) { itens.push({ legivel: false, tipo: 'outro', tipo_documento: 'outro' }); continue; }
    const r = await geminiComEvento(ctx, 'extracao_doc', {
      system: prompt,
      partes: [{ inline_data: { mime_type: arq.mime, data: arq.b64 } }, { text: 'Extraia os dados no JSON pedido.' }],
      schema, temperatura: 0, maxTokens: 2048,
    });
    itens.push(r ? r.json : { legivel: false, tipo: 'outro', tipo_documento: 'outro' });
  }
  return { itens, grandes };
}

async function baixarAnexo(admin: Admin, path: string, mime: string): Promise<{ b64: string; mime: string } | null> {
  try {
    if (!path) return null;
    const { data, error } = await admin.storage.from(BUCKET_MIDIA).download(path);
    if (error || !data) return null;
    const bytes = new Uint8Array(await data.arrayBuffer());
    if (!bytes.length || bytes.length > MAX_ARQUIVO) return null;
    return { b64: paraBase64(bytes), mime: mime || 'application/octet-stream' };
  } catch { return null; }
}

// ======== Gemini com evento de custo/auditoria (1 retry de parse; falha => null) ========
async function geminiComEvento(ctx: Ctx, finalidade: string, p: {
  system: string; partes: ParteGemini[]; schema: Record<string, unknown>; temperatura: number; maxTokens: number;
}): Promise<{ json: Record<string, unknown> } | null> {
  for (let tentativa = 1; tentativa <= 2; tentativa++) {
    try {
      const r = await comRetry(() => chamarGeminiJson(p), 2);
      await evento(ctx.admin, ctx.sessao, 'gemini_call', { canal_id: ctx.sessao.canal_id, finalidade, tentativa }, r.tokensIn, r.tokensOut);
      return { json: r.json };
    } catch (e) {
      const msg = String((e as Error)?.message ?? '');
      if (msg.includes('sem_api_key')) throw e;
      await evento(ctx.admin, ctx.sessao, 'gemini_erro', { canal_id: ctx.sessao.canal_id, finalidade, tentativa, erro: msg.slice(0, 200) });
      if (!msg.includes('parse_falhou') || tentativa === 2) return null;
    }
  }
  return null;
}

// ======== envio: fila bot_mensagens_saida + drain em processo (presence + jitter) ========
async function enviarBolhas(admin: Admin, ctx: Ctx, bolhas: string[], video: { url: string; caption: string } | null): Promise<void> {
  const sessao = ctx.sessao;
  const canal = ctx.canal;
  // delay base humano: 8–20s + proporcional ao volume recebido (texto e áudio)
  const charsIn = ctx.textos.join(' ').length;
  const baseMs = rand(8_000, 20_000) + Math.min(15_000, charsIn * 25 + ctx.audios.length * 4_000);
  const tag = `ia_${sessao.etapa}_${Date.now().toString(36)}`;

  // monta as linhas da fila (vídeo entra na posição 0 quando existir)
  const linhas: Array<{ ordem: number; tipo: string; texto: string; media_url: string | null; media_caption: string | null; enviar_apos: string }> = [];
  let cursor = Date.now() + baseMs;
  let ordem = 0;
  if (video) {
    linhas.push({ ordem: ordem++, tipo: 'video', texto: video.caption, media_url: video.url, media_caption: video.caption, enviar_apos: new Date(cursor).toISOString() });
    cursor += rand(2_000, 6_000);
  }
  for (const b of bolhas) {
    // presence proporcional (2–8s) entra ANTES da bolha, no drain; o jitter 2–6s fica no escalonamento
    cursor += Math.min(8_000, Math.max(2_000, b.length * 60));
    linhas.push({ ordem: ordem++, tipo: 'texto', texto: b, media_url: null, media_caption: null, enviar_apos: new Date(cursor).toISOString() });
    cursor += rand(2_000, 6_000);
  }
  if (!linhas.length) return;

  const { data: rows, error } = await admin.from('bot_mensagens_saida').insert(linhas.map((l) => ({
    organizacao_id: sessao.organizacao_id, conversa_id: sessao.conversa_id, canal_id: sessao.canal_id,
    etapa: tag, ordem: l.ordem, texto: l.texto, tipo: l.tipo, media_url: l.media_url, media_caption: l.media_caption,
    enviar_apos: l.enviar_apos, status: 'pendente',
  }))).select('id, ordem, tipo, texto, media_url, media_caption, enviar_apos');
  if (error || !rows?.length) { await evento(admin, sessao, 'enfileirar_falhou', { erro: error?.message?.slice(0, 200) }); return; }

  const tx = enviadorDe(canal as { transporte?: string; instancia_externa?: string; cloud_phone_number_id?: string });
  const instancia = String(canal.instancia_externa ?? '');
  const ordenadas = [...rows].sort((a: { ordem: number }, b: { ordem: number }) => a.ordem - b.ordem);
  for (const row of ordenadas) {
    // re-checa a sessão a cada bolha: humano pode ter entrado no meio do burst
    const { data: st } = await admin.from('ia_sessoes').select('status').eq('id', sessao.id).maybeSingle();
    const statusOk = st?.status === 'ativa' || ['handoff', 'concluida', 'encerrada'].includes(st?.status ?? '');
    if (!statusOk) {
      await admin.rpc('bot_registrar_envio', { p_saida: row.id, p_status: 'cancelada', p_erro: `sessao_${st?.status ?? 'sumiu'}` });
      continue;
    }
    await sleep(new Date(row.enviar_apos).getTime() - Date.now());
    try {
      if (row.tipo === 'texto') {
        const dur = Math.min(8_000, Math.max(2_000, row.texto.length * 60));
        await sendPresenceComposing(instancia, ctx.destino, dur);
        await sleep(dur);
      }
      const sent = (row.tipo === 'video' && row.media_url)
        ? await tx.sendMedia(ctx.destino, 'video', 'video/mp4', row.media_url, 'meu-inss.mp4', row.media_caption ?? undefined)
        : await tx.sendText(ctx.destino, row.texto);
      const idExterno = sent?.key?.id ?? null;
      if (!idExterno) throw new Error('sem_id_retorno');
      const { data: msg } = await admin.from('mensagens').insert({
        organizacao_id: sessao.organizacao_id, conversa_id: sessao.conversa_id, direcao: 'saida',
        tipo: row.tipo === 'video' ? 'video' : 'texto', conteudo: row.texto,
        autor_id: null, origem: 'bot', status: 'enviada', id_externo: idExterno,
        metadados: { fluxo: 'ia_sdr', etapa: sessao.etapa, sessao_id: sessao.id, ...(row.media_url ? { media_url: row.media_url } : {}) },
      }).select('id').maybeSingle();
      await admin.rpc('bot_registrar_envio', { p_saida: row.id, p_status: 'enviada', p_mensagem: msg?.id ?? null, p_id_externo: idExterno });
    } catch (e) {
      const erro = String((e as Error)?.message ?? 'falha_envio').slice(0, 300);
      await admin.rpc('bot_registrar_envio', { p_saida: row.id, p_status: 'falhou', p_erro: erro });
      await evento(admin, sessao, 'envio_falhou', { ordem: row.ordem, erro });
      break;   // sequência quebrada não continua pela metade
    }
  }
}

// ======== desfechos ========
async function fazerHandoff(admin: Admin, sessao: Sessao, canal: Record<string, unknown>, motivo: string, bolhasFallback: string[], nota: string, patchExtra?: Record<string, unknown>): Promise<void> {
  // bolhas do handoff (quando o turno não mandou nada, garante 1 balão educado)
  if (bolhasFallback.length) {
    try {
      const { data: ident } = await admin.from('contato_identidades')
        .select('valor_normalizado').eq('contato_id', sessao.contato_id).eq('tipo', 'whatsapp')
        .not('valor_normalizado', 'is', null).order('principal', { ascending: false }).limit(1).maybeSingle();
      const destino = ident?.valor_normalizado ?? null;
      if (destino) {
        const tx = enviadorDe(canal as { transporte?: string; instancia_externa?: string });
        const sent = await tx.sendText(destino, bolhasFallback[0]);
        if (sent?.key?.id) {
          await admin.from('mensagens').insert({
            organizacao_id: sessao.organizacao_id, conversa_id: sessao.conversa_id, direcao: 'saida', tipo: 'texto',
            conteudo: bolhasFallback[0], autor_id: null, origem: 'bot', status: 'enviada', id_externo: sent.key.id,
            metadados: { fluxo: 'ia_sdr', etapa: sessao.etapa, sessao_id: sessao.id, handoff: motivo },
          });
        }
      }
    } catch { /* handoff nunca falha por causa do balão */ }
  }
  await criarNotaInterna(admin, sessao, nota);
  await admin.from('conversas').update({
    precisa_humano: true, precisa_humano_motivo: motivo, precisa_humano_em: new Date().toISOString(),
  }).eq('id', sessao.conversa_id);
  await admin.from('ia_sessoes').update({ ...(patchExtra ?? {}), status: 'handoff', atualizado_em: new Date().toISOString() }).eq('id', sessao.id);
  await evento(admin, sessao, 'handoff', { motivo });
}

async function encerrarSessao(admin: Admin, sessao: Sessao, motivo: string): Promise<void> {
  await admin.from('ia_sessoes').update({ status: 'encerrada', atualizado_em: new Date().toISOString() }).eq('id', sessao.id);
  await evento(admin, sessao, 'encerrada', { motivo });
}

async function criarNotaInterna(admin: Admin, sessao: Sessao, texto: string): Promise<void> {
  try {
    await admin.from('mensagens').insert({
      organizacao_id: sessao.organizacao_id, conversa_id: sessao.conversa_id, direcao: 'saida',
      tipo: 'nota_interna', conteudo: texto, autor_id: null, origem: 'bot', status: 'enviada',
      metadados: { fluxo: 'ia_sdr', sessao_id: sessao.id },
    });
  } catch { /* nota é best-effort */ }
}

async function etiquetarOportunidade(admin: Admin, sessao: Sessao, etiqueta: string): Promise<void> {
  try {
    let oppId = sessao.oportunidade_id;
    if (!oppId) {
      const { data: o } = await admin.from('oportunidades').select('id')
        .eq('organizacao_id', sessao.organizacao_id).eq('contato_id', sessao.contato_id).eq('status', 'em_andamento')
        .order('criado_em', { ascending: false }).limit(1).maybeSingle();
      oppId = o?.id ?? null;
    }
    if (!oppId) return;
    const { data: opp } = await admin.from('oportunidades').select('etiquetas').eq('id', oppId).maybeSingle();
    const atuais = (opp?.etiquetas ?? []) as string[];
    if (!atuais.includes(etiqueta)) await admin.from('oportunidades').update({ etiquetas: [...atuais, etiqueta] }).eq('id', oppId);
  } catch { /* best-effort */ }
}

function notaContexto(ctx: Ctx, motivo: string): string {
  const d = ctx.dados;
  const docs = ['doc_pessoal', 'comprovante', 'declarante_doc', 'consignado'].filter((k) => ctx.docs[k]);
  const cob = ctx.cobertura;
  return [
    `🤖 IA SDR — atendimento entregue ao humano (motivo: ${motivo}).`,
    `• Etapa: ${ctx.sessao.etapa}`,
    `• Nome: ${d.nome_confirmado ?? ctx.contatoNome ?? '?'}`,
    d.titular_comprovante ? `• Titular do comprovante: ${d.titular_comprovante}` : null,
    d.declarante ? `• Declarante: ${(d.declarante as Record<string, unknown>)?.nome ?? '?'}` : null,
    `• Documentos recebidos: ${docs.length ? docs.join(', ') : 'nenhum'}`,
    cob.meses_cobertos != null ? `• Extratos: ${cob.meses_cobertos} de 120 meses cobertos${cob.completo ? ' (completo)' : ''}` : null,
    `• Últimas mensagens do cliente: ${ctx.textos.slice(-2).map((t) => `"${t.slice(0, 80)}"`).join(' | ') || '(mídia/áudio)'}`,
  ].filter(Boolean).join('\n');
}

// ======== util ========
async function evento(admin: Admin, sessao: Sessao, tipo: string, detalhe: Record<string, unknown>, tokensIn?: number, tokensOut?: number): Promise<void> {
  try {
    await admin.from('ia_eventos').insert({
      sessao_id: sessao.id, conversa_id: sessao.conversa_id, organizacao_id: sessao.organizacao_id,
      tipo, detalhe, tokens_in: tokensIn ?? null, tokens_out: tokensOut ?? null,
    });
  } catch { /* auditoria é best-effort */ }
}

/** Volta a dormir: só zera processar_apos se NINGUÉM (trigger) mexeu nele durante o processamento. */
async function limparAgenda(admin: Admin, sessaoId: string, claimAte: string): Promise<void> {
  await admin.from('ia_sessoes').update({ processar_apos: null, atualizado_em: new Date().toISOString() })
    .eq('id', sessaoId).eq('processar_apos', claimAte).eq('status', 'ativa');
}

function dentroDaJanela(iaConfig: Record<string, unknown>): boolean {
  const ini = parseHora(String((iaConfig as { janela_inicio?: string }).janela_inicio ?? '07:30'), 7 * 60 + 30);
  const fim = parseHora(String((iaConfig as { janela_fim?: string }).janela_fim ?? '21:30'), 21 * 60 + 30);
  const sp = spWallClock();
  const min = sp.getUTCHours() * 60 + sp.getUTCMinutes();
  return min >= ini && min <= fim;
}
function parseHora(s: string, fallback: number): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return fallback;
  return Number(m[1]) * 60 + Number(m[2]);
}
/** Próxima abertura da janela (hoje se ainda não abriu, senão amanhã) + jitter 0–45 min. */
function proximaAbertura(iaConfig: Record<string, unknown>): string {
  const ini = parseHora(String((iaConfig as { janela_inicio?: string }).janela_inicio ?? '07:30'), 7 * 60 + 30);
  const sp = spWallClock();
  const minAgora = sp.getUTCHours() * 60 + sp.getUTCMinutes();
  let ano = sp.getUTCFullYear(), mes = sp.getUTCMonth() + 1, dia = sp.getUTCDate();
  if (minAgora >= ini) {
    const amanha = new Date(Date.UTC(ano, mes - 1, dia) + 24 * 3600 * 1000);
    ano = amanha.getUTCFullYear(); mes = amanha.getUTCMonth() + 1; dia = amanha.getUTCDate();
  }
  const base = spParaUtc(ano, mes, dia, Math.floor(ini / 60), ini % 60);
  return new Date(base.getTime() + rand(0, 45 * 60_000)).toISOString();
}
function inicioDoDiaSpUtcIso(): string {
  const sp = spWallClock();
  return spParaUtc(sp.getUTCFullYear(), sp.getUTCMonth() + 1, sp.getUTCDate(), 0, 0).toISOString();
}

function primeiroNome(n: string): string {
  const p = (n ?? '').trim().split(/\s+/)[0] ?? '';
  return p ? p[0].toUpperCase() + p.slice(1).toLowerCase() : 'a pessoa';
}
function mascararCpf(cpf: string): string {
  const d = somenteDigitos(cpf);
  return d.length === 11 ? `***.***.${d.slice(6, 9)}-${d.slice(9)}` : '***';
}
