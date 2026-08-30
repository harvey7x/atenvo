// ia-agente-conversar — PLAYGROUND da IA configurável ("Experimentar"). PRIVADA (JWT).
// Conversa de TESTE com o atendente configurado, direto na página — sem WhatsApp,
// sem gravar nada no banco. Usa a chave do Vault, a persona/conhecimento salvos e
// passa a resposta pelo MESMO guardrail do motor (o cliente vê o filtro agindo).
// Stateless: o histórico vem do front a cada chamada (teto curto).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { chamarGeminiJson } from '../ia-sdr/gemini.ts';
import { PERSONA } from '../ia-sdr/prompts.ts';
import { saidaProibida } from '../ia-sdr/guardrail.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });
const admin = () => createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });

const SCHEMA = {
  type: 'object',
  properties: { mensagens: { type: 'array', items: { type: 'string' }, maxItems: 3 } },
  required: ['mensagens'],
} as Record<string, unknown>;

const _semAcento = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
function proibidoExtra(txt: string, termos: string[]): string | null {
  const t = _semAcento(txt ?? '');
  for (const termo of termos) {
    if (termo && t.includes(_semAcento(termo))) return `tema_proibido:${termo.slice(0, 30)}`;
  }
  return null;
}

const _cooldown = new Map<string, number>();

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    const agenteId = String(body.agente_id ?? '');
    const mensagem = String(body.mensagem ?? '').slice(0, 1000).trim();
    const historicoRaw = Array.isArray(body.historico) ? body.historico : [];
    if (!agenteId || !mensagem) return json({ ok: false, detalhe: 'agente_id/mensagem ausentes' }, 400);

    // mesmo portão do testar: enxergar o agente (RLS) + ser admin/supervisor da org
    const auth = req.headers.get('Authorization') ?? '';
    const uc = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
    const { data: ag, error } = await uc.from('ia_agentes')
      .select('id, organizacao_id, provedor, modelo, persona_prompt, conhecimento, comportamentos, chave_definida_em')
      .eq('id', agenteId).maybeSingle();
    if (error || !ag) return json({ ok: false, detalhe: 'Agente não encontrado.' }, 404);
    const { data: u } = await uc.auth.getUser();
    if (!u?.user) return json({ ok: false, detalhe: 'Sessão inválida.' }, 401);
    const { data: papel } = await admin().from('organizacao_usuarios')
      .select('papel').eq('usuario_id', u.user.id).eq('organizacao_id', ag.organizacao_id)
      .eq('status', 'ativo').in('papel', ['admin', 'supervisor']).maybeSingle();
    if (!papel) return json({ ok: false, detalhe: 'Só administradores podem experimentar o atendente.' }, 403);

    const antes = _cooldown.get(agenteId) ?? 0;
    if (Date.now() - antes < 2_000) return json({ ok: false, detalhe: 'Calma — uma mensagem por vez.' }, 429);
    _cooldown.set(agenteId, Date.now());

    if (ag.provedor !== 'gemini') return json({ ok: false, detalhe: 'Este provedor chega na próxima fase — troque para Gemini pra experimentar.' });
    if (!ag.chave_definida_em) return json({ ok: false, detalhe: 'Guarde a chave no cofre primeiro — o teste roda na SUA conta do provedor.' });
    const { data: chave } = await admin().rpc('ia_agente_chave', { p_agente: agenteId });
    if (typeof chave !== 'string' || !chave) return json({ ok: false, detalhe: 'Não consegui ler a chave do cofre. Guarde a chave de novo.' });

    // system = exatamente o que o canal rodaria: persona salva (ou fábrica) + conhecimento
    const persona = String(ag.persona_prompt ?? '').trim() || PERSONA;
    const conhecimento = String(ag.conhecimento ?? '').trim();
    const system = `${persona}${conhecimento ? `\n\nINFORMAÇÕES DA EMPRESA (fatos que você conhece; use quando o cliente perguntar — sem despejar tudo de uma vez):\n${conhecimento.slice(0, 8000)}` : ''}\n\nCONTEXTO: conversa de atendimento pelo WhatsApp. Responda em 1 a 3 bolhas curtas e humanas, uma pergunta por vez.`;

    // transcript curto (teto 16 trocas, 1000 chars cada) — histórico vem do front
    const historico = historicoRaw.slice(-16).map((m: Record<string, unknown>) => ({
      de: m.de === 'ia' ? 'você' : 'cliente',
      texto: String(m.texto ?? '').replace(/\s+/g, ' ').slice(0, 1000),
    }));
    const transcript = [...historico, { de: 'cliente', texto: mensagem.replace(/\s+/g, ' ') }]
      .map((m) => `[${m.de}] ${m.texto}`).join('\n');

    const modelo = String(ag.modelo ?? '').trim() || 'gemini-3.6-flash';
    const r = await chamarGeminiJson(modelo, {
      system,
      partes: [{ text: `CONVERSA ATÉ AQUI:\n${transcript}` }, { text: 'Responda no JSON pedido.' }],
      schema: SCHEMA, temperatura: 0.7, maxTokens: 2048, apiKey: chave,
    });

    // guardrail de fábrica + temas proibidos do agente — bloqueio VISÍVEL (é demonstração)
    const comp = (ag.comportamentos ?? {}) as Record<string, unknown>;
    const termos = (Array.isArray(comp.proibidos) ? comp.proibidos : [])
      .map((t: unknown) => String(t ?? '').trim()).filter((t: string) => t.length >= 3).slice(0, 40);
    const cruas = (Array.isArray((r.json as { mensagens?: unknown }).mensagens) ? (r.json as { mensagens: unknown[] }).mensagens : [])
      .map((m) => String(m).trim()).filter(Boolean).slice(0, 3);
    const mensagens = cruas.map((m) => {
      const v = saidaProibida(m) ?? proibidoExtra(m, termos);
      return v ? { texto: `🔒 Mensagem bloqueada pelo filtro de segurança (${v.split(':')[0].replaceAll('_', ' ')}).`, bloqueada: true } : { texto: m, bloqueada: false };
    });
    if (!mensagens.length) return json({ ok: false, detalhe: 'O modelo não respondeu — tente de novo.' });
    return json({ ok: true, mensagens, modelo });
  } catch (e) {
    const msg = String((e as Error)?.message ?? '');
    if (msg.includes('sem_api_key')) return json({ ok: false, detalhe: 'Guarde a chave no cofre primeiro.' });
    if (msg.includes('abort')) return json({ ok: false, detalhe: 'O provedor demorou demais. Tente de novo.' });
    return json({ ok: false, detalhe: `Falha no teste: ${msg.slice(0, 160)}` }, 500);
  }
});
