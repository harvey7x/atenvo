// maturacao-runner — executa o que o planner agendou. Cron a cada 2 minutos.
//
// Reivindica de forma ATÔMICA (RPC com distinct on chip_origem_id → no máximo 1 envio por chip
// por ciclo, mesmo que o planner tenha concentrado horários). Envia direto na Evolution:
// NÃO passa pelo evolution-send de propósito, porque ele resolve destino por contato,
// valida onWhatsApp e bloqueia self-send — nada disso se aplica a aquecimento, e usá-lo
// gravaria mensagem em conversa de atendimento.
//
// DUAS TRAVAS INDEPENDENTES antes de qualquer envio real:
//   1. env MATURACAO_ATIVO precisa ser exatamente 'sim';
//   2. maturacao_config.modo precisa ser 'ativo'.
// Faltando qualquer uma, a linha é marcada 'pulada' e NADA sai. O sistema nasce inerte.
//
// Auth: x-maturacao-secret == webhook_config.maturacao. Deploy --no-verify-jwt.
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { evolution, evolutionConfigured } from './evolution.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ATIVO_GLOBAL = (Deno.env.get('MATURACAO_ATIVO') ?? 'nao').toLowerCase() === 'sim';

const LIMITE_CICLO = 20;
const ERROS_PARA_PAUSAR = 3;      // erros na última hora que derrubam o chip automaticamente

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-maturacao-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

function safeEqual(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

const aleatorio = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1));
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Tempo de "digitando…" proporcional ao texto. Enviar instantaneamente um parágrafo
// é justamente o que distingue bot de pessoa.
function tempoDigitando(texto: string | null): number {
  const n = (texto ?? '').length;
  return Math.min(9000, Math.max(2000, 1500 + n * 45)) + aleatorio(0, 800);
}

interface Linha {
  id: string; organizacao_id: string; chip_origem_id: string;
  destino_tipo: string; numero_destino: string; tipo: string;
  texto_snapshot: string | null; conteudo_id: string | null;
  tentativas: number; max_tentativas: number; metadados: Record<string, unknown> | null;
}

async function marcar(admin: SupabaseClient, id: string, patch: Record<string, unknown>): Promise<void> {
  const { error } = await admin.from('maturacao_agenda')
    .update({ ...patch, atualizado_em: new Date().toISOString() }).eq('id', id);
  // erro silencioso deixaria a linha presa em 'processando' para sempre
  if (error) console.error(`[maturacao] falha ao gravar status de ${id}: ${error.message}`);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

    const { data: wc } = await admin.from('webhook_config').select('secret').eq('chave', 'maturacao').maybeSingle();
    if (!wc?.secret || !safeEqual(req.headers.get('x-maturacao-secret') ?? '', wc.secret as string)) {
      return json({ error: 'unauthorized' }, 401);
    }
    if (!evolutionConfigured()) return json({ error: 'Evolution não configurada' }, 503);

    const { data: lote, error: eLote } = await admin.rpc('maturacao_agenda_reivindicar', { p_limite: LIMITE_CICLO });
    if (eLote) return json({ error: eLote.message }, 500);
    const linhas = (lote as Linha[]) ?? [];
    if (!linhas.length) return json({ processadas: 0, ativo_global: ATIVO_GLOBAL, resultados: [] });

    // config por org (define se o envio é real) e instância de cada chip de origem
    const orgs = [...new Set(linhas.map((l) => l.organizacao_id))];
    const { data: cfgs } = await admin.from('maturacao_config').select('organizacao_id, modo').in('organizacao_id', orgs);
    const modoPorOrg = new Map((cfgs ?? []).map((c) => [c.organizacao_id as string, c.modo as string]));

    const chipIds = [...new Set(linhas.map((l) => l.chip_origem_id))];
    const { data: chipsRaw } = await admin.from('maturacao_chips')
      .select('id, instancia_externa, apelido').in('id', chipIds);
    const chipPorId = new Map((chipsRaw ?? []).map((c) => [c.id as string, c]));

    // chips diferentes = instâncias diferentes: podem sair em paralelo sem risco de rajada,
    // já que a RPC garantiu no máximo 1 linha por chip neste ciclo.
    const resultados = await Promise.all(linhas.map(async (m) => {
      const chip = chipPorId.get(m.chip_origem_id);
      const instancia = chip?.instancia_externa as string | undefined;

      if (!instancia) {
        await marcar(admin, m.id, { status: 'falhou', ultimo_erro: 'chip sem instância' });
        return { id: m.id, status: 'falhou', motivo: 'sem_instancia' };
      }

      const real = ATIVO_GLOBAL && modoPorOrg.get(m.organizacao_id) === 'ativo';
      if (!real) {
        await marcar(admin, m.id, {
          status: 'pulada',
          metadados: { ...(m.metadados ?? {}), dry_run: true, motivo: ATIVO_GLOBAL ? 'config_dry_run' : 'env_desligado' },
        });
        return { id: m.id, status: 'pulada', motivo: 'dry_run' };
      }

      try {
        // 1) "digitando…" com duração proporcional ao texto, e espera de verdade
        const espera = tempoDigitando(m.texto_snapshot);
        await evolution.sendPresence(instancia, m.numero_destino, 'composing', espera).catch(() => null);
        await dormir(espera);

        // 2) envio de fato
        let enviado: { key?: { id?: string } };
        if (m.tipo === 'texto') {
          enviado = await evolution.sendText(instancia, m.numero_destino, m.texto_snapshot ?? '');
        } else if (m.tipo === 'figurinha') {
          enviado = await evolution.sendSticker(instancia, m.numero_destino, m.texto_snapshot ?? '');
        } else if (m.tipo === 'audio') {
          enviado = await evolution.sendWhatsAppAudio(instancia, m.numero_destino, m.texto_snapshot ?? '');
        } else {
          enviado = await evolution.sendMedia(instancia, m.numero_destino, 'image', m.texto_snapshot ?? '');
        }

        const idExterno = enviado?.key?.id ?? null;
        if (!idExterno) throw new Error('Evolution não retornou id da mensagem');

        await marcar(admin, m.id, { status: 'enviada', id_externo: idExterno, enviada_em: new Date().toISOString() });
        await admin.from('maturacao_eventos').insert({
          organizacao_id: m.organizacao_id, chip_id: m.chip_origem_id, agenda_id: m.id,
          tipo: 'envio', direcao: 'saida', status: 'enviada',
          id_externo: idExterno, numero_contraparte: m.numero_destino,
        });
        return { id: m.id, status: 'enviada' };
      } catch (e) {
        const erro = ((e as Error)?.message ?? 'erro').slice(0, 400);
        const esgotou = m.tentativas >= m.max_tentativas;
        await marcar(admin, m.id, { status: esgotou ? 'falhou' : 'agendada', ultimo_erro: erro });
        await admin.from('maturacao_eventos').insert({
          organizacao_id: m.organizacao_id, chip_id: m.chip_origem_id, agenda_id: m.id,
          tipo: 'erro', direcao: 'saida', status: 'falhou', erro,
          numero_contraparte: m.numero_destino,
        });
        return { id: m.id, status: esgotou ? 'falhou' : 'reagendada', motivo: erro };
      }
    }));

    // ── proteção automática: chip errando em série é chip sendo restringido ───
    // Melhor perder algumas horas de aquecimento do que insistir e queimar o número.
    const umaHoraAtras = new Date(Date.now() - 3600_000).toISOString();
    for (const chipId of chipIds) {
      const { count } = await admin.from('maturacao_eventos')
        .select('id', { count: 'exact', head: true })
        .eq('chip_id', chipId).eq('tipo', 'erro').gte('ocorrido_em', umaHoraAtras);
      if ((count ?? 0) >= ERROS_PARA_PAUSAR) {
        await admin.from('maturacao_chips').update({
          status_maturacao: 'erro',
          pausado_motivo: `pausa automática: ${count} erros de envio na última hora`,
          atualizado_em: new Date().toISOString(),
        }).eq('id', chipId).eq('status_maturacao', 'aquecendo');
        await admin.from('maturacao_agenda')
          .update({ status: 'cancelada', atualizado_em: new Date().toISOString() })
          .eq('chip_origem_id', chipId).eq('status', 'agendada');
      }
    }

    return json({ processadas: linhas.length, ativo_global: ATIVO_GLOBAL, resultados });
  } catch (e) {
    return json({ error: (e as Error).message ?? 'erro' }, 500);
  }
});
