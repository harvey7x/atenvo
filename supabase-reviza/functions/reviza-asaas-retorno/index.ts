// reviza-asaas-retorno — recebe os avisos de pagamento do Asaas (webhook). Etapa 1 (22/11): confere o
// segredo, guarda o aviso UMA vez (o Asaas pode repetir o mesmo aviso) e responde 200 na hora.
// A baixa no Financeiro é a etapa 2: ela vai ler public.asaas_eventos onde processado_em é nulo.
// Publicar com verify_jwt = false: quem chama é o Asaas, e a prova é o cabeçalho asaas-access-token.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const ok = (o: unknown = { ok: true }) => new Response(JSON.stringify(o), { status: 200, headers: { 'Content-Type': 'application/json' } });
/** comparação em tempo constante (não vaza o segredo pelo tempo de resposta) */
function igual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('metodo nao permitido', { status: 405 });
  try {
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
    const { data: esperado } = await db.rpc('integracao_segredo_ler', { p_nome: 'asaas_retorno_token' });
    const veio = req.headers.get('asaas-access-token') ?? '';
    if (typeof esperado !== 'string' || !esperado || !igual(veio, esperado)) return new Response('nao autorizado', { status: 401 });

    const corpo = await req.json().catch(() => null) as Record<string, unknown> | null;
    const id = corpo && typeof corpo.id === 'string' ? corpo.id : null;
    const tipo = corpo && typeof corpo.event === 'string' ? corpo.event : null;
    if (!id || !tipo) return ok({ ok: true, ignorado: 'sem id ou tipo' });   // 200: não adianta o Asaas repetir
    const pagamento = (corpo!.payment && typeof corpo!.payment === 'object' ? corpo!.payment : null) as Record<string, unknown> | null;
    // "uma vez só": aviso repetido bate na chave primária e é ignorado
    await db.from('asaas_eventos').upsert({ id, tipo, pagamento_id: pagamento?.id ? String(pagamento.id) : null, corpo }, { onConflict: 'id', ignoreDuplicates: true });
    await db.from('integracoes').update({ ultimo_retorno: new Date().toISOString(), retorno_ativo: true }).eq('servico', 'asaas');
    return ok();
  } catch (e) {
    // erro nosso: 500 faz o Asaas tentar de novo mais tarde
    return new Response(JSON.stringify({ error: (e as Error)?.message || 'erro' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});
