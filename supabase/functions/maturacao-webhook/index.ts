// maturacao-webhook — telemetria das instâncias de AQUECIMENTO ('aquec_*').
//
// ISOLAMENTO É O PONTO DESTA FUNÇÃO. Ela NUNCA escreve em contatos/conversas/mensagens/
// oportunidades e NUNCA chama garantir_oportunidade_lead_novo, bot_remarketing_inbound ou SLA.
// Se o tráfego de aquecimento passasse pelo evolution-webhook, cada chip viraria um "contato",
// cada troca abriria conversa, o Kanban ganharia oportunidades fantasma e os Relatórios
// ("pessoas que chamaram") seriam contaminados. Por isso instância separada + webhook separado.
//
// Só faz três coisas: registra conexão, registra ACK/leitura e confirma leitura do lado de quem
// recebeu (reciprocidade — mensagem que ninguém lê é sinal ruim para o WhatsApp).
//
// Auth: x-maturacao-secret == webhook_config.maturacao. Deploy --no-verify-jwt.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { evolution } from './evolution.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

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

const soDigitos = (v?: string | null) => (v ?? '').replace(/@.*/, '').replace(/\D/g, '') || null;
const aleatorio = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1));
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Executa depois de responder quando a runtime permite; senão espera inline.
function emSegundoPlano(p: Promise<unknown>): Promise<unknown> | void {
  const rt = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
  if (rt?.waitUntil) { rt.waitUntil(p.catch(() => null)); return; }
  return p.catch(() => null);
}

// ACK da Evolution → o que isso significa para a saúde do chip
function mapaAck(status: unknown): { tipo: 'ack' | 'leitura' | 'erro'; status: string } | null {
  const s = String(status ?? '').toUpperCase();
  if (s === 'DELIVERY_ACK' || s === 'DELIVERED') return { tipo: 'ack', status: 'entregue' };
  if (s === 'READ' || s === 'PLAYED') return { tipo: 'leitura', status: 'lida' };
  if (s === 'ERROR' || s === 'FAILED') return { tipo: 'erro', status: 'falhou' };
  if (s === 'SERVER_ACK' || s === 'SENT') return { tipo: 'ack', status: 'enviada' };
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

    const { data: wc } = await admin.from('webhook_config').select('secret').eq('chave', 'maturacao').maybeSingle();
    if (!wc?.secret || !safeEqual(req.headers.get('x-maturacao-secret') ?? '', wc.secret as string)) {
      return json({ error: 'unauthorized' }, 401);
    }

    const payload = await req.json().catch(() => ({}));
    const evento = String(payload?.event ?? '').toLowerCase();
    const instancia = String(payload?.instance ?? '');
    const data = payload?.data ?? {};

    // Cinto de segurança: esta função só atende instâncias de aquecimento.
    if (!instancia.startsWith('aquec_')) return json({ ignorado: 'instancia_nao_e_de_aquecimento' });

    const { data: chip } = await admin.from('maturacao_chips')
      .select('id, organizacao_id, instancia_externa, numero_conectado, status_maturacao')
      .eq('instancia_externa', instancia).maybeSingle();
    if (!chip) return json({ ignorado: 'chip_nao_mapeado' });

    const base = { organizacao_id: chip.organizacao_id, chip_id: chip.id };

    // ── conexão ───────────────────────────────────────────────────────────────
    if (evento === 'connection.update') {
      const estado = String(data?.state ?? '').toLowerCase();
      if (estado === 'open' || estado === 'close') {
        const conectado = estado === 'open';
        const patch: Record<string, unknown> = {
          status_integracao: conectado ? 'conectado' : 'desconectado',
          atualizado_em: new Date().toISOString(),
        };
        const numero = soDigitos(data?.wuid ?? data?.ownerJid ?? null);
        if (conectado && numero) patch.numero_conectado = numero;
        if (conectado && !chip.numero_conectado) patch.conectado_em = new Date().toISOString();
        await admin.from('maturacao_chips').update(patch).eq('id', chip.id);
        await admin.from('maturacao_eventos').insert({ ...base, tipo: 'conexao', status: estado, dados: { estado } });
      }
      return json({ ok: true });
    }

    // ── mensagem recebida: registra e confirma leitura com atraso humano ──────
    if (evento === 'messages.upsert') {
      const msgs = Array.isArray(data) ? data : [data];
      for (const m of msgs) {
        const key = m?.key ?? {};
        if (key?.fromMe) continue;                       // eco do que nós mesmos mandamos
        const remoteJid = String(key?.remoteJid ?? '');
        const idExterno = String(key?.id ?? '');
        if (!remoteJid || !idExterno) continue;

        await admin.from('maturacao_eventos').insert({
          ...base, tipo: 'recebimento', direcao: 'entrada',
          id_externo: idExterno, numero_contraparte: soDigitos(remoteJid),
        });

        // Ler na hora é robótico; nunca ler é pior ainda. 4–15s é o meio-termo humano.
        emSegundoPlano((async () => {
          await dormir(aleatorio(4000, 15000));
          await evolution.markMessageAsRead(instancia, remoteJid, idExterno, false).catch(() => null);
          await admin.from('maturacao_eventos').insert({
            ...base, tipo: 'leitura', direcao: 'entrada',
            id_externo: idExterno, numero_contraparte: soDigitos(remoteJid),
          });
        })());
      }
      return json({ ok: true });
    }

    // ── ACK das que nós enviamos ─────────────────────────────────────────────
    if (evento === 'messages.update') {
      const ups = Array.isArray(data) ? data : [data];
      for (const u of ups) {
        const idExterno = String(u?.keyId ?? u?.key?.id ?? u?.messageId ?? '');
        const mapeado = mapaAck(u?.status ?? u?.update?.status);
        if (!idExterno || !mapeado) continue;

        await admin.from('maturacao_eventos').insert({
          ...base, tipo: mapeado.tipo, direcao: 'saida', status: mapeado.status,
          id_externo: idExterno,
          numero_contraparte: soDigitos(u?.remoteJid ?? u?.key?.remoteJid ?? null),
          ...(mapeado.tipo === 'erro' ? { erro: String(u?.status ?? 'ERROR') } : {}),
        });

        // ERROR de envio foi o sinal precoce que antecipou a restrição da LUIZA: propaga
        // para a agenda para o painel mostrar sem depender de reconciliação posterior.
        if (mapeado.tipo === 'erro') {
          await admin.from('maturacao_agenda')
            .update({ status: 'falhou', ultimo_erro: 'ACK ERROR', atualizado_em: new Date().toISOString() })
            .eq('id_externo', idExterno);
        }
      }
      return json({ ok: true });
    }

    return json({ ignorado: evento });
  } catch (e) {
    return json({ error: (e as Error).message ?? 'erro' }, 500);
  }
});
