// REVIZA (25/11): retomada-processar — o motor da RETOMADA AUTOMÁTICA do Atendimento (migration 103).
// Cron a cada minuto. Pede ao banco o que está na hora (atd_retomada_proximos: no máximo UMA conversa por número,
// já respeitando o intervalo mínimo e o teto do dia de cada número), monta o texto com o nome do cliente e do
// atendente e manda UMA DE CADA VEZ, em fila: antes de cada envio reserva o passo (atd_retomada_reservar confere tudo
// de novo para aquela conversa — o cliente pode ter respondido — e trava o número, então duas rodadas ao mesmo tempo
// não furam o intervalo). O envio vai pelo `evolution-send` no MODO SERVICE (x-agendamento-secret), que revalida o
// canal, grava a mensagem na conversa e usa o id da reserva como chave de idempotência (nunca manda duas vezes).
// Sem `ator_id`: a mensagem sai sem a assinatura de atendente e sem autor (é automática).
// A chave geral (atd_retomada_config.ativo) desligada = nada sai: o banco não devolve nada e a reserva recusa.
//
// Auth: x-retomada-secret == webhook_config.retomada (padrão dos crons). Deploy --no-verify-jwt.
// O texto ({nome}, {primeiro_nome}, {atendente}) vem de ./texto.ts, cópia de renderizarTexto() de src/data/retomada.ts
// (o vitest confere que as duas dão o mesmo resultado). Nenhum nome ou telefone vai para os logs — só ids.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { renderizarTexto } from './texto.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const LIMITE_RODADA = 20;       // conversas por rodada (uma por número)
const ORCAMENTO_MS = 40_000;    // não começa um envio novo depois disto: a rodada termina antes da próxima
const PAUSA_ENTRE_MS = 2_500;   // respiro entre um envio e o próximo (de números diferentes)

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type, x-retomada-secret', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });
const dormir = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

// comparação de secret em tempo constante (não vaza tamanho/prefixo por timing)
function seguroIgual(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

interface Item {
  organizacao_id: string; conversa_id: string; sequencia_id: string; passo: number; total_passos: number; ciclo: string;
  canal_id: string; texto: string; devido_em: string; contato_nome: string | null; atendente_nome: string | null; etapa_nome: string | null;
}

// erro do envio em português curto, para o Histórico (sem dado do cliente)
function motivoDoErro(status: number, corpo: Record<string, unknown> | null, erroRede: string | null): string {
  if (erroRede) return 'O servidor do WhatsApp não respondeu. A mensagem não foi tentada de novo.';
  const e = String(corpo?.error ?? '').slice(0, 300);
  if (status === 409) return e || 'O número deste canal não pode enviar agora (restrição ou fora da janela de 24 horas do WhatsApp oficial).';
  return e || `O WhatsApp não aceitou o envio (código ${status}).`;
}

// deno-lint-ignore no-explicit-any
async function marcar(admin: any, id: string, patch: Record<string, unknown>): Promise<void> {
  const { error } = await admin.from('atd_retomada_envios').update(patch).eq('id', id);
  if (error) console.error(`[retomada] FALHA ao gravar o resultado de ${id}: ${error.message}`);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const t0 = Date.now();
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

    // auth por secret (header, nunca query string)
    const { data: segredos } = await admin.from('webhook_config').select('chave, secret').in('chave', ['retomada', 'agendamento']);
    const segredo = (c: string) => ((segredos ?? []) as { chave: string; secret: string }[]).find((s) => s.chave === c)?.secret ?? '';
    const meu = segredo('retomada');
    if (!meu || !seguroIgual(req.headers.get('x-retomada-secret') ?? '', meu)) return json({ error: 'unauthorized' }, 401);
    const segredoEnvio = segredo('agendamento'); // o modo service do evolution-send
    if (!segredoEnvio) return json({ error: 'sem_segredo_envio' }, 500);

    // reserva que ficou presa numa rodada que caiu no meio: resolve antes de tudo (nunca reenvia)
    const { error: eArr } = await admin.rpc('atd_retomada_arrumar');
    if (eArr) console.error(`[retomada] arrumar: ${eArr.message}`);

    // chave geral desligada: nada a fazer (o banco também recusaria)
    const { data: ligadas } = await admin.from('atd_retomada_config').select('organizacao_id').eq('ativo', true).limit(1);
    if (!ligadas?.length) return json({ parado: 'desligada', enviadas: 0 });

    const { data: lote, error: eLote } = await admin.rpc('atd_retomada_proximos', { p_limite: LIMITE_RODADA });
    if (eLote) return json({ error: eLote.message }, 500);
    const itens = (lote as Item[]) ?? [];
    if (!itens.length) return json({ processadas: 0, enviadas: 0 });

    const resultados: Array<{ envio: string | null; conversa: string; status: string }> = [];
    let enviadas = 0;
    for (let i = 0; i < itens.length; i++) {
      const it = itens[i];
      if (Date.now() - t0 > ORCAMENTO_MS) break; // o resto fica para a próxima rodada
      if (i > 0) await dormir(PAUSA_ENTRE_MS);

      const texto = renderizarTexto(it.texto, { nome: it.contato_nome, atendente: it.atendente_nome });
      // reserva = confere de novo (respondeu? desligaram? IA entrou?) + trava o número + intervalo e teto
      const { data: envioId, error: eRes } = await admin.rpc('atd_retomada_reservar', {
        p_conversa: it.conversa_id, p_sequencia: it.sequencia_id, p_passo: it.passo, p_ciclo: it.ciclo, p_texto: texto,
      });
      if (eRes) { console.error(`[retomada] reservar ${it.conversa_id}: ${eRes.message}`); resultados.push({ envio: null, conversa: it.conversa_id, status: 'erro_reserva' }); continue; }
      if (!envioId) { resultados.push({ envio: null, conversa: it.conversa_id, status: 'nao_vale_mais' }); continue; }

      let status = 0; let corpo: Record<string, unknown> | null = null; let erroRede: string | null = null;
      try {
        const resp = await fetch(`${SUPABASE_URL}/functions/v1/evolution-send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-agendamento-secret': segredoEnvio },
          // agendamento_id = chave de idempotência: se o envio já ocorreu (resposta perdida), evolution-send não reenvia
          body: JSON.stringify({ conversa_id: it.conversa_id, canal_id: it.canal_id, text: texto, agendamento_id: envioId }),
        });
        status = resp.status;
        corpo = await resp.json().catch(() => null);
      } catch (e) { erroRede = (e as Error)?.message ?? 'rede'; }

      if (!erroRede && status >= 200 && status < 300 && corpo?.ok) {
        const msg = (corpo.mensagem ?? null) as { id?: string; enviada_em?: string } | null;
        await marcar(admin, envioId as string, { status: 'enviado', enviado_em: msg?.enviada_em ?? new Date().toISOString(), mensagem_id: msg?.id ?? null });
        enviadas++;
        resultados.push({ envio: envioId as string, conversa: it.conversa_id, status: 'enviado' });
      } else {
        // falhou = a sequência para nesta conversa até o cliente responder (nada de insistir sozinho)
        await marcar(admin, envioId as string, { status: 'falhou', motivo: motivoDoErro(status, corpo, erroRede) });
        console.log(`[retomada] envio ${envioId} falhou http=${status || '-'}`);
        resultados.push({ envio: envioId as string, conversa: it.conversa_id, status: 'falhou' });
      }
    }
    return json({ processadas: resultados.length, enviadas, resultados, ms: Date.now() - t0 });
  } catch (e) {
    return json({ error: (e as Error).message ?? 'erro' }, 500);
  }
});
