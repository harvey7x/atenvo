// cobranca-processar — motor de envio do Modo Cobrança (v4, 29/08).
// A CHAVE: cobranca_config.envio_real (default FALSE). Desligada, todo
// enfileiramento nasce dry_run=true e vira 'simulada'. LIGADA (ato do
// gestor na aba Envios, dupla confirmação), os enfileiramentos novos
// nascem dry_run=false e o motor ENVIA DE VERDADE pela instância
// Evolution do atendente do cliente — bolha a bolha (texto/imagem/
// documento/áudio), com pacing anti-ban e cap por rodada.
// Cadência configurável por mensagem (offset_dias/hora; padrão por tipo).
// Auth dual: cron (x-cobranca-secret) ou JWT de gestor (própria org).
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cobranca-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

const OFFSETS: Record<string, number> = { antes: -3, cobranca: 0, depois: 2, remarketing: 7 };
const CAP_REAIS_POR_RODADA = 25;   // cron */10min → ~150 envios reais/h no máximo

const EVO_BASE = (Deno.env.get('EVOLUTION_API_URL') ?? '').replace(/\/+$/, '');
const EVO_KEY = Deno.env.get('EVOLUTION_API_KEY') ?? '';
async function evo(path: string, body: unknown) {
  const res = await fetch(`${EVO_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: EVO_KEY },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!res.ok) {
    const msg = (data as { message?: string })?.message ?? (data as { error?: string })?.error ?? `Evolution HTTP ${res.status}`;
    throw new Error(typeof msg === 'string' ? msg : `Evolution HTTP ${res.status}`);
  }
  return data;
}
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));
const entre = (a: number, b: number) => a + Math.floor(Math.random() * (b - a));

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
function agoraBRT(): Date { return new Date(Date.now() - 3 * 3600_000); }
function hojeBRT(): string { return agoraBRT().toISOString().slice(0, 10); }
function somaDias(iso: string, dias: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}
const brl = (v: number) => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dataBR = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/** executar_em UTC a partir da hora BRT configurada (padrão 09:00; trava 8h-20h BRT) */
function horaExecUTC(diaISO: string, horaBRT: string | null): string {
  const m = /^(\d{2}):(\d{2})/.exec(horaBRT ?? '');
  let hh = m ? Number(m[1]) : 9;
  const mm = m ? m[2] : '00';
  if (hh < 8) hh = 8;
  if (hh > 19) hh = 19;
  return `${diaISO}T${String(hh + 3).padStart(2, '0')}:${mm}:00Z`;
}

function render(tpl: string, ctx: Record<string, string>): string {
  return tpl.replace(/\{(nome|valor|vencimento|atendente)\}/g, (_, k) => ctx[k] ?? '');
}

type Bolha = { tipo: string; corpo: string | null; midia_url: string | null; midia_nome: string | null };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const admin: SupabaseClient = createClient(
      Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
    const body = await req.json().catch(() => ({}));
    const acao: string = body.acao ?? '';

    // ---- auth dual: secret do cron OU JWT de gestor (restrito à própria org) ----
    let orgFiltro: string | null = null;
    let viaJwt = false;
    const { data: wc } = await admin.from('webhook_config').select('secret').eq('chave', 'cobranca').maybeSingle();
    const secretOk = !!wc?.secret && safeEqual(req.headers.get('x-cobranca-secret') ?? '', wc.secret as string);
    if (!secretOk) {
      const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
        global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } }, auth: { persistSession: false },
      });
      const { data: au } = await userClient.auth.getUser();
      if (!au?.user) return json({ error: 'unauthorized' }, 401);
      const orgId: string = body.organizacao_id;
      if (!orgId) return json({ error: 'organizacao_id é obrigatório.' }, 400);
      const { data: memb } = await admin.from('organizacao_usuarios')
        .select('papel, status').eq('organizacao_id', orgId).eq('usuario_id', au.user.id).maybeSingle();
      if (!memb || memb.status !== 'ativo' || (memb.papel !== 'admin' && memb.papel !== 'supervisor')) {
        return json({ error: 'Apenas administradores ou supervisores.' }, 403);
      }
      orgFiltro = orgId;
      viaJwt = true;
    }

    async function envioRealLigado(orgId: string): Promise<boolean> {
      const { data } = await admin.from('cobranca_config').select('envio_real').eq('organizacao_id', orgId).maybeSingle();
      return data?.envio_real === true;
    }

    // =================== ENFILEIRAR ===================
    async function enfileirar(): Promise<Record<string, unknown>> {
      const hoje = hojeBRT();
      const erros: string[] = [];
      let qMsg = admin.from('cobranca_mensagens')
        .select('id, organizacao_id, tipo, nome, ordem, offset_dias, hora').eq('ativo', true).order('ordem').order('criado_em');
      if (orgFiltro) qMsg = qMsg.eq('organizacao_id', orgFiltro);
      const { data: msgs, error: eMsg } = await qMsg;
      if (eMsg) erros.push(`mensagens: ${eMsg.message}`);
      type Msg = { id: string; organizacao_id: string; tipo: string; offset_dias: number | null; hora: string | null };
      const porOrgTipo = new Map<string, Msg>();
      for (const m of msgs ?? []) {
        const k = `${m.organizacao_id}:${m.tipo}`;
        if (!porOrgTipo.has(k)) porOrgTipo.set(k, m as Msg);
      }
      const realPorOrg = new Map<string, boolean>();
      let criadas = 0, semTelefone = 0, semAtendente = 0, duplicadas = 0, jaPagoOuSemParcela = 0, nascemReais = 0;
      for (const msg of porOrgTipo.values()) {
        if (!realPorOrg.has(msg.organizacao_id)) realPorOrg.set(msg.organizacao_id, await envioRealLigado(msg.organizacao_id));
        const chaveOn = realPorOrg.get(msg.organizacao_id) === true;
        const off = msg.offset_dias ?? OFFSETS[msg.tipo] ?? 0;
        const alvo = somaDias(hoje, -off);
        const { data: comps, error: eComp } = await admin.from('ciclo_vencimento_competencias')
          .select('ciclo_vencimento_id').eq('organizacao_id', msg.organizacao_id).eq('vencimento', alvo);
        if (eComp) { erros.push(`competencias: ${eComp.message}`); continue; }
        const ciclos = [...new Set((comps ?? []).map((c) => c.ciclo_vencimento_id as string))];
        if (!ciclos.length) continue;
        const { data: cobs, error: eCob } = await admin.from('cobrancas')
          .select('id, contato_id, responsavel_id, valor_mensal, contato:contatos(nome, telefone)')
          .eq('organizacao_id', msg.organizacao_id).eq('status', 'ativo').in('ciclo_vencimento_id', ciclos);
        if (eCob) { erros.push(`cobrancas: ${eCob.message}`); continue; }
        if (!cobs?.length) continue;
        // REGRA DE OURO: só cobra quem tem parcela ABERTA na competência do alvo
        const alvoComp = alvo.slice(0, 7) + '-01';
        const { data: pags } = await admin.from('cobranca_pagamentos')
          .select('cobranca_id').eq('organizacao_id', msg.organizacao_id)
          .eq('competencia', alvoComp).in('status', ['prevista', 'nao_paga'])
          .in('cobranca_id', cobs.map((c) => c.id));
        const emAberto = new Set((pags ?? []).map((pg) => pg.cobranca_id as string));
        const { data: itens } = await admin.from('cobranca_mensagem_itens')
          .select('ordem, tipo, corpo, midia_url, midia_nome').eq('mensagem_id', msg.id).order('ordem');
        const { data: nums } = await admin.from('cobranca_numeros')
          .select('atendente_id, estado').eq('organizacao_id', msg.organizacao_id).eq('estado', 'conectado');
        const conectados = new Set((nums ?? []).map((n) => n.atendente_id as string));
        const respIds = [...new Set(cobs.map((c) => c.responsavel_id).filter(Boolean))] as string[];
        const { data: us } = respIds.length
          ? await admin.from('usuarios').select('id, nome').in('id', respIds)
          : { data: [] };
        const nomeAt = new Map((us ?? []).map((u) => [u.id as string, u.nome as string]));

        for (const c of cobs) {
          if (!emAberto.has(c.id as string)) { jaPagoOuSemParcela++; continue; }
          const ct = c.contato as unknown as { nome: string | null; telefone: string | null } | null;
          if (!ct?.telefone) { semTelefone++; continue; }
          const ctx = {
            nome: (ct.nome ?? 'cliente').split(' ')[0],
            valor: brl(Number(c.valor_mensal ?? 0)),
            vencimento: dataBR(alvo),
            atendente: (c.responsavel_id && nomeAt.get(c.responsavel_id as string)) || 'nossa equipe',
          };
          const bolhas: Bolha[] = (itens ?? []).map((i) => ({
            tipo: i.tipo as string,
            corpo: i.corpo ? render(i.corpo as string, ctx) : null,
            midia_url: (i.midia_url as string | null) ?? null,
            midia_nome: (i.midia_nome as string | null) ?? null,
          }));
          const corpo = bolhas.map((b) =>
            b.tipo === 'texto' ? (b.corpo ?? '') : `[${b.tipo}: ${b.midia_nome ?? 'arquivo'}]${b.corpo ? ' ' + b.corpo : ''}`,
          ).join('\n— · —\n');
          const temNumero = !!c.responsavel_id && conectados.has(c.responsavel_id as string);
          if (!temNumero) semAtendente++;
          const nasceReal = chaveOn && temNumero;
          if (nasceReal) nascemReais++;
          const { error } = await admin.from('cobranca_fila').insert({
            organizacao_id: msg.organizacao_id, cobranca_id: c.id, contato_id: c.contato_id,
            mensagem_id: msg.id, tipo: msg.tipo,
            executar_em: horaExecUTC(hoje, msg.hora),
            status: 'pendente',
            dry_run: !nasceReal,                       // chave OFF (ou sem número) → simula
            corpo_final: corpo, payload: bolhas,
            ultimo_erro: temNumero ? null : 'sem_numero_atendente',
          });
          if (error) { if (/duplicate|unique/i.test(error.message)) duplicadas++; else erros.push(`fila: ${error.message}`); }
          else criadas++;
        }
      }
      return { criadas, nascem_reais: nascemReais, duplicadas, sem_telefone: semTelefone, sem_numero_atendente: semAtendente, ja_pago_ou_sem_parcela: jaPagoOuSemParcela, ...(erros.length ? { erros: erros.slice(0, 5) } : {}) };
    }

    // =================== ENVIO REAL DE UMA LINHA ===================
    async function enviarReal(f: { id: string; organizacao_id: string; cobranca_id: string; contato_id: string; payload: Bolha[] | null; tentativas: number }): Promise<{ ok: boolean; erro?: string }> {
      // resolve telefone + instância do atendente NO MOMENTO do envio
      const { data: ct } = await admin.from('contatos').select('telefone').eq('id', f.contato_id).maybeSingle();
      const tel = (ct?.telefone ?? '').replace(/\D/g, '');
      if (!tel) return { ok: false, erro: 'sem_telefone' };
      const { data: cob } = await admin.from('cobrancas').select('responsavel_id').eq('id', f.cobranca_id).maybeSingle();
      if (!cob?.responsavel_id) return { ok: false, erro: 'sem_atendente' };
      const { data: numRow } = await admin.from('cobranca_numeros')
        .select('instancia, estado').eq('organizacao_id', f.organizacao_id)
        .eq('atendente_id', cob.responsavel_id).maybeSingle();
      if (!numRow?.instancia || numRow.estado !== 'conectado') return { ok: false, erro: 'numero_desconectado' };
      const bolhas = f.payload ?? [];
      if (!bolhas.length) return { ok: false, erro: 'mensagem_vazia' };
      const numero = tel.startsWith('55') ? tel : '55' + tel;
      for (const b of bolhas) {
        if (b.tipo === 'texto') {
          if (!b.corpo) continue;
          await evo(`/message/sendText/${numRow.instancia}`, { number: numero, text: b.corpo });
        } else if (b.tipo === 'audio') {
          if (!b.midia_url) return { ok: false, erro: 'audio_sem_midia' };
          await evo(`/message/sendWhatsAppAudio/${numRow.instancia}`, { number: numero, audio: b.midia_url });
        } else {
          if (!b.midia_url) return { ok: false, erro: `${b.tipo}_sem_midia` };
          await evo(`/message/sendMedia/${numRow.instancia}`, {
            number: numero, mediatype: b.tipo === 'imagem' ? 'image' : 'document',
            media: b.midia_url, caption: b.corpo ?? undefined, fileName: b.midia_nome ?? undefined,
          });
        }
        await dormir(entre(1500, 3200));               // pacing entre bolhas
      }
      return { ok: true };
    }

    // =================== PROCESSAR ===================
    async function processar(): Promise<Record<string, number>> {
      const h = agoraBRT().getUTCHours();
      if (h < 8 || h >= 20) return { fora_da_janela: 1, simuladas: 0 };
      // auto-cura: lote preso em 'processando' volta pra fila após 15min
      let rq = admin.from('cobranca_fila').update({ status: 'pendente' })
        .eq('status', 'processando')
        .lt('atualizado_em', new Date(Date.now() - 15 * 60_000).toISOString());
      if (orgFiltro) rq = rq.eq('organizacao_id', orgFiltro);
      await rq;
      let q = admin.from('cobranca_fila').select('id')
        .eq('status', 'pendente').lte('executar_em', new Date().toISOString()).limit(200);
      if (orgFiltro) q = q.eq('organizacao_id', orgFiltro);
      const { data: cand } = await q;
      if (!cand?.length) return { simuladas: 0, enviadas: 0, bloqueadas_optout: 0, falhas: 0 };
      // claim GUARDADO: só quem transiciona pendente→processando é processado
      const { data: fila } = await admin.from('cobranca_fila')
        .update({ status: 'processando' })
        .in('id', cand.map((c) => c.id as string)).eq('status', 'pendente')
        .select('id, organizacao_id, cobranca_id, contato_id, dry_run, payload, tentativas');
      if (!fila?.length) return { simuladas: 0, enviadas: 0, bloqueadas_optout: 0, falhas: 0 };
      const chavePorOrg = new Map<string, boolean>();
      let simuladas = 0, enviadas = 0, bloqueadas = 0, falhas = 0, devolvidas = 0;
      for (const f of fila) {
        // opt-out CONSERVADOR
        const { data: opt } = await admin.from('wa_optout').select('contato_id').eq('contato_id', f.contato_id).limit(1);
        if (opt?.length) {
          await admin.from('cobranca_fila').update({ status: 'bloqueada_optout' }).eq('id', f.id);
          bloqueadas++; continue;
        }
        if (f.dry_run) {
          await admin.from('cobranca_fila').update({ status: 'simulada' }).eq('id', f.id);
          simuladas++; continue;
        }
        // linha REAL: revalida a chave (pode ter sido desligada depois do enfileiramento)
        const org = f.organizacao_id as string;
        if (!chavePorOrg.has(org)) chavePorOrg.set(org, await envioRealLigado(org));
        if (chavePorOrg.get(org) !== true) {
          await admin.from('cobranca_fila').update({ status: 'simulada', ultimo_erro: 'chave_desligada_no_processamento' }).eq('id', f.id);
          simuladas++; continue;
        }
        if (enviadas >= CAP_REAIS_POR_RODADA) {
          await admin.from('cobranca_fila').update({ status: 'pendente' }).eq('id', f.id);
          devolvidas++; continue;
        }
        try {
          const r = await enviarReal(f as { id: string; organizacao_id: string; cobranca_id: string; contato_id: string; payload: Bolha[] | null; tentativas: number });
          if (r.ok) {
            await admin.from('cobranca_fila').update({ status: 'enviada', tentativas: (f.tentativas ?? 0) + 1, ultimo_erro: null }).eq('id', f.id);
            enviadas++;
            await dormir(entre(2500, 5000));           // pacing entre clientes
          } else {
            await admin.from('cobranca_fila').update({ status: 'falhou', tentativas: (f.tentativas ?? 0) + 1, ultimo_erro: r.erro ?? 'erro' }).eq('id', f.id);
            falhas++;
          }
        } catch (e) {
          await admin.from('cobranca_fila').update({ status: 'falhou', tentativas: (f.tentativas ?? 0) + 1, ultimo_erro: (e as Error).message.slice(0, 300) }).eq('id', f.id);
          falhas++;
        }
      }
      return { simuladas, enviadas, bloqueadas_optout: bloqueadas, falhas, devolvidas_cap: devolvidas };
    }

    // =================== CONVERTER HOJE (gestor, chave ON) ===================
    async function converterHoje(): Promise<Record<string, number>> {
      if (!viaJwt || !orgFiltro) return { erro_apenas_gestor: 1 };
      if (!(await envioRealLigado(orgFiltro))) return { chave_desligada: 1 };
      const hoje = hojeBRT();
      const ini = `${hoje}T03:00:00Z`;                          // 00:00 BRT
      const fim = `${somaDias(hoje, 1)}T03:00:00Z`;
      const { data } = await admin.from('cobranca_fila')
        .update({ dry_run: false })
        .eq('organizacao_id', orgFiltro).eq('status', 'pendente').eq('dry_run', true)
        .gte('executar_em', ini).lt('executar_em', fim)
        .select('id');
      return { convertidas: data?.length ?? 0 };
    }

    if (acao === 'enfileirar') return json({ ok: true, ...(await enfileirar()) });
    if (acao === 'processar') return json({ ok: true, ...(await processar()) });
    if (acao === 'converter_hoje') return json({ ok: true, ...(await converterHoje()) });
    if (acao === 'ciclo') {
      const e = await enfileirar();
      const p = await processar();
      return json({ ok: true, enfileirar: e, processar: p });
    }
    return json({ error: 'Ação inválida.' }, 400);
  } catch (e) {
    return json({ error: (e as Error).message ?? 'Erro inesperado.' }, 500);
  }
});
