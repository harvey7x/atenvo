// mensagens-agendadas-processar — Fase 1 (texto).
// Cron a cada minuto. Reivindica as agendadas vencidas de forma ATÔMICA (RPC, no máx. 1 por
// canal por ciclo) e envia via `evolution-send` no MODO SERVICE (x-agendamento-secret) — que
// revalida canal/live-state e registra a mensagem na conversa. Nada depende de UI aberta.
//
// Auth: x-agendamento-secret == webhook_config.agendamento (padrão dos crons). Deploy --no-verify-jwt.
//
// As decisões puras (expiração, próximo status) espelham src/lib/agendamentoMensagem.ts (testado
// por vitest). Mantidas curtas e inline aqui porque o Edge roda em Deno e não importa de src/.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const EXPIRA_HORAS = 24;        // follow-up atrasado além disso não dispara surpresa: expira
const LIMITE_CICLO = 30;        // teto de linhas por execução (o throttle por canal é feito na RPC)

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type, x-agendamento-secret', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

// comparação de secret em tempo constante (não vaza tamanho/prefixo por timing)
function seguroIgual(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

interface Agendada {
  id: string; organizacao_id: string; conversa_id: string; canal_id: string;
  texto: string | null; executar_em: string; tentativas: number; max_tentativas: number;
  criado_por: string | null; metadados: Record<string, unknown> | null;
}

// espelha estaExpirada() de src/lib/agendamentoMensagem.ts
function expirada(executarEm: string, agoraMs: number): boolean {
  return agoraMs - new Date(executarEm).getTime() > EXPIRA_HORAS * 3_600_000;
}

// UPDATE com erro NÃO-silencioso: se falhar (ex.: permissão), loga e sinaliza. Sem isto, uma
// linha ficaria presa em 'processando' sem ninguém saber (era o bug do teste de falha segura).
// deno-lint-ignore no-explicit-any
async function marcar(admin: any, id: string, patch: Record<string, unknown>): Promise<boolean> {
  const { error } = await admin.from('mensagens_agendadas').update(patch).eq('id', id);
  if (error) { console.error(`[agendadas] FALHA ao gravar status de ${id}: ${error.message}`); return false; }
  return true;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

    // auth por secret (header, nunca query string)
    const secretHeader = req.headers.get('x-agendamento-secret') ?? '';
    const { data: wc } = await admin.from('webhook_config').select('secret').eq('chave', 'agendamento').maybeSingle();
    if (!wc?.secret || !seguroIgual(secretHeader, wc.secret as string)) return json({ error: 'unauthorized' }, 401);

    // reivindica o lote de forma atômica (RPC: distinct on canal + guarda status='agendada')
    const { data: lote, error: eLote } = await admin.rpc('mensagens_agendadas_reivindicar', { p_limite: LIMITE_CICLO });
    if (eLote) return json({ error: eLote.message }, 500);
    const linhas = (lote as Agendada[]) ?? [];
    if (!linhas.length) return json({ processadas: 0, resultados: [] });

    const agoraMs = Date.now();
    const resultados: Array<{ id: string; status: string; motivo?: string }> = [];

    for (const m of linhas) {
      const patch: Record<string, unknown> = { atualizado_em: new Date().toISOString() };

      // 1) expirada?
      if (expirada(m.executar_em, agoraMs)) {
        patch.status = 'expirada'; patch.motivo_bloqueio = 'follow-up expirado (atraso > 24h)';
        await marcar(admin, m.id, patch);
        resultados.push({ id: m.id, status: 'expirada' });
        continue;
      }

      // 2) revalida canal (pode ter caído entre agendar e enviar) — barreira além da do evolution-send
      const { data: canal } = await admin.from('canais')
        .select('id, ativo, status_integracao, envio_restrito, conflito_com')
        .eq('id', m.canal_id).eq('organizacao_id', m.organizacao_id).maybeSingle();
      const canalRuim =
        !canal ? 'canal não encontrado'
        : canal.ativo === false ? 'canal inativo'
        : (canal.status_integracao as string) === 'removido' ? 'canal removido'
        : (canal.status_integracao as string) !== 'conectado' ? 'canal desconectado'
        : canal.envio_restrito ? 'envio restrito'
        : canal.conflito_com ? 'canal em conflito'
        : null;
      if (canalRuim) {
        patch.status = 'bloqueada'; patch.motivo_bloqueio = canalRuim;
        await marcar(admin, m.id, patch);
        resultados.push({ id: m.id, status: 'bloqueada', motivo: canalRuim });
        continue;
      }

      // 3) envia via evolution-send (modo service). Ele revalida live-state e registra na conversa.
      let ok = false, problemaCanal = false, erro: string | null = null, mensagemId: string | null = null;
      try {
        const resp = await fetch(`${SUPABASE_URL}/functions/v1/evolution-send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-agendamento-secret': wc.secret as string },
          // agendamento_id = chave de idempotência: se o envio já ocorreu (resposta perdida), evolution-send não reenvia.
          body: JSON.stringify({ conversa_id: m.conversa_id, text: m.texto, canal_id: m.canal_id, ator_id: m.criado_por, agendamento_id: m.id }),
        });
        const body = await resp.json().catch(() => ({}));
        if (resp.ok && body?.ok) { ok = true; mensagemId = body?.mensagem?.id ?? null; }
        else { erro = (body?.error ?? `HTTP ${resp.status}`)?.toString?.().slice(0, 400) ?? 'erro'; problemaCanal = resp.status === 409; }
      } catch (e) { erro = (e as Error)?.message ?? 'network'; }

      // 4) próximo status (espelha proximoStatus() do lib testado)
      let novo: string;
      if (ok) { novo = 'enviada'; patch.enviada_em = new Date().toISOString(); patch.mensagem_id_enviada = mensagemId; }
      else if (problemaCanal) { novo = 'bloqueada'; patch.motivo_bloqueio = erro; }
      else { novo = m.tentativas >= m.max_tentativas ? 'falhou' : 'agendada'; patch.ultimo_erro = erro; }
      patch.status = novo;
      // registra no metadados o responsável atual no momento do envio (auditoria da decisão do dono)
      patch.metadados = { ...(m.metadados ?? {}), ultimo_ciclo_em: new Date().toISOString() };

      await marcar(admin, m.id, patch);
      resultados.push({ id: m.id, status: novo, ...(erro ? { motivo: erro } : {}) });
    }

    return json({ processadas: linhas.length, resultados });
  } catch (e) {
    return json({ error: (e as Error).message ?? 'erro' }, 500);
  }
});
