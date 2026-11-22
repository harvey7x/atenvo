// reviza-asaas — integração de pagamentos, etapa 1 (22/11): conectar a conta do Asaas, testar, guardar as
// regras e desconectar. Só administrador ativo chama. A chave de API fica no cofre do banco (vault) e
// NUNCA volta para o navegador: a tela recebe só os 4 últimos caracteres.
// Contrato com a tela: src/v2/data/config/integracoes.ts. API do Asaas conferida na documentação em 22/11.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

type Ambiente = 'producao' | 'testes';
const BASE: Record<Ambiente, string> = { producao: 'https://api.asaas.com/v3', testes: 'https://api-sandbox.asaas.com/v3' };
// só os avisos de que a baixa precisa (o Asaas recomenda assinar apenas o necessário)
const EVENTOS = ['PAYMENT_CREATED', 'PAYMENT_UPDATED', 'PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED', 'PAYMENT_OVERDUE', 'PAYMENT_DELETED',
  'PAYMENT_RESTORED', 'PAYMENT_REFUNDED', 'PAYMENT_RECEIVED_IN_CASH_UNDONE', 'PAYMENT_CHARGEBACK_REQUESTED'];
const SEG = { chave: 'asaas_chave', token: 'asaas_retorno_token', webhook: 'asaas_retorno_id' };

interface Resposta { ok: boolean; status: number; dados: Record<string, unknown>; codigo: string | null }
async function asaas(amb: Ambiente, chave: string, metodo: string, caminho: string, corpo?: unknown): Promise<Resposta> {
  const r = await fetch(BASE[amb] + caminho, {
    method: metodo,
    // GET vai sem corpo (com corpo o Asaas responde 403); contas novas exigem o User-Agent
    headers: { access_token: chave, 'User-Agent': 'reviza-crm', ...(corpo !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  let dados: Record<string, unknown> = {};
  try { dados = await r.json(); } catch { /* resposta sem corpo */ }
  const erros = Array.isArray(dados.errors) ? (dados.errors as { code?: string }[]) : [];
  const codigo = r.ok ? null : (erros[0]?.code ?? (r.status === 403 ? 'forbidden' : `http_${r.status}`));
  return { ok: r.ok, status: r.status, dados, codigo };
}
const ERRO_DA_CHAVE: Record<string, string> = {
  invalid_access_token: 'invalid_access_token', invalid_access_token_format: 'invalid_access_token',
  invalid_environment: 'invalid_environment', access_token_not_found: 'access_token_not_found', forbidden: 'forbidden',
};

/* ---- as regras: só campos conhecidos, dentro dos limites (o que vier torto vira o padrão) ---- */
const FORMAS = ['escolhe', 'pix', 'boleto', 'cartao'];
function lerConfig(b: unknown) {
  const c = (b && typeof b === 'object' ? b : {}) as Record<string, unknown>;
  const liga = (k: string, padrao: boolean) => (typeof c[k] === 'boolean' ? (c[k] as boolean) : padrao);
  const pct = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? Math.min(10, Math.max(0, Math.round(n * 100) / 100)) : 0; };
  return {
    forma: FORMAS.includes(String(c.forma)) ? String(c.forma) : 'escolhe',
    gerarSozinho: liga('gerarSozinho', true), baixaAutomatica: liga('baixaAutomatica', true),
    baixaQuando: c.baixaQuando === 'disponivel' ? 'disponivel' : 'confirmado',
    avisarComercial: liga('avisarComercial', true), atraso: c.atraso === 'aqui' ? 'aqui' : 'asaas',
    multa: pct(c.multa), juros: pct(c.juros), avisosAsaas: liga('avisosAsaas', false),
  };
}
const ROT: Record<string, string> = { forma: 'forma', gerarSozinho: 'gerarSozinho', baixaAutomatica: 'baixaAutomatica', baixaQuando: 'baixaQuando',
  avisarComercial: 'avisarComercial', atraso: 'atraso', multa: 'multa', juros: 'juros', avisosAsaas: 'avisosAsaas' };
const txt = (v: unknown) => (typeof v === 'boolean' ? (v ? 'ligado' : 'desligado') : String(v));

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    // 1) quem chama tem que ser administrador ativo (confere com o JWT da própria pessoa)
    const comoPessoa = createClient(url, anon, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } }, auth: { persistSession: false } });
    const { data: u } = await comoPessoa.auth.getUser();
    const uid = u?.user?.id;
    if (!uid) return json({ error: 'nao autenticado' }, 401);
    const { data: perfil } = await comoPessoa.from('profiles').select('papel, ativo, nome').eq('id', uid).maybeSingle();
    if (!perfil || !perfil.ativo || perfil.papel !== 'admin') return json({ error: 'sem permissao' }, 403);

    const body = await req.json().catch(() => ({}));
    const acao = String(body.acao ?? '');
    const db = createClient(url, service, { auth: { persistSession: false } });
    const registrar = (acaoReg: string, detalhe: string, mudancas: unknown[] = []) =>
      db.from('registros').insert({ ator_id: uid, ator_nome: perfil.nome || '—', ator_papel: 'admin', acao: acaoReg, entidade: 'integração', entidade_id: 'asaas', rotulo: 'Asaas', detalhe, mudancas });
    const segredo = async (nome: string) => { const { data } = await db.rpc('integracao_segredo_ler', { p_nome: nome }); return typeof data === 'string' && data ? data : null; };
    const guardar = (nome: string, valor: string) => db.rpc('integracao_segredo_gravar', { p_nome: nome, p_valor: valor });
    const apagar = (nome: string) => db.rpc('integracao_segredo_apagar', { p_nome: nome });
    const { data: linha } = await db.from('integracoes').select('*').eq('servico', 'asaas').maybeSingle();

    /** dados da conta + se há chave Pix (a consulta do Pix é tolerante: se falhar, fica "não conferida") */
    const lerConta = async (amb: Ambiente, chave: string) => {
      const r = await asaas(amb, chave, 'GET', '/myAccount/commercialInfo/');
      if (!r.ok) return { erro: ERRO_DA_CHAVE[r.codigo ?? ''] ?? `O Asaas respondeu com erro (${r.codigo}).` };
      let chavePix: boolean | null = null;
      try {
        const p = await asaas(amb, chave, 'GET', '/pix/addressKeys?status=ACTIVE&limit=1');
        if (p.ok && Array.isArray(p.dados.data)) chavePix = (p.dados.data as unknown[]).length > 0;
      } catch { /* não conferida */ }
      const d = r.dados;
      return { conta: { nome: String(d.companyName || d.tradingName || d.name || 'Conta do Asaas'), documento: d.cpfCnpj ? String(d.cpfCnpj) : null, email: d.email ? String(d.email) : null, chave_pix: chavePix } };
    };
    /** tira o retorno antigo do Asaas (melhor esforço: a chave antiga pode já não valer) */
    const removerRetorno = async () => {
      const [idAntigo, chaveAntiga] = [await segredo(SEG.webhook), await segredo(SEG.chave)];
      if (idAntigo && chaveAntiga && linha?.ambiente) { try { await asaas(linha.ambiente as Ambiente, chaveAntiga, 'DELETE', `/webhooks/${idAntigo}`); } catch { /* segue */ } }
    };

    if (acao === 'conectar') {
      const amb: Ambiente = body.ambiente === 'testes' ? 'testes' : 'producao';
      const chave = String(body.chave ?? '').trim();
      if (!chave) return json({ error: 'access_token_not_found' });
      if (!chave.startsWith('$aact_') || chave.length < 24) return json({ error: 'invalid_access_token' });
      const c = await lerConta(amb, chave);
      if ('erro' in c) return json({ error: c.erro });
      // retorno dos pagamentos: tira o antigo e cadastra o novo, com um segredo só nosso
      await removerRetorno();
      const token = crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '');
      const w = await asaas(amb, chave, 'POST', '/webhooks', {
        name: 'Reviza CRM', url: `${url}/functions/v1/reviza-asaas-retorno`, email: c.conta.email ?? 'sem-email@reviza.local',
        enabled: true, interrupted: false, apiVersion: 3, authToken: token, sendType: 'SEQUENTIALLY', events: EVENTOS,
      });
      await guardar(SEG.chave, chave);
      if (w.ok && w.dados.id) { await guardar(SEG.token, token); await guardar(SEG.webhook, String(w.dados.id)); }
      const troca = !!linha?.conectado;
      const { error } = await db.from('integracoes').upsert({
        servico: 'asaas', conectado: true, ambiente: amb, conta: c.conta, chave_final: chave.slice(-4), conectado_em: new Date().toISOString(),
        conectado_por: perfil.nome || '—', retorno_ativo: !!(w.ok && w.dados.id), config: linha?.config ?? null, updated_at: new Date().toISOString(),
      });
      if (error) return json({ error: error.message }, 400);
      await registrar(troca ? 'alterou' : 'conectou', `${troca ? 'trocou a chave de API' : 'conta do Asaas conectada'} (ambiente de ${amb === 'testes' ? 'testes' : 'produção'})${w.ok ? '' : ' · o retorno dos pagamentos não foi cadastrado'}`);
      return json({ conta: c.conta, retorno: !!(w.ok && w.dados.id), aviso: w.ok ? null : `O retorno dos pagamentos não foi cadastrado (${w.codigo}).` });
    }

    if (!linha?.conectado) return json({ error: 'nao_conectado' });
    const chave = await segredo(SEG.chave);
    const amb = (linha.ambiente === 'testes' ? 'testes' : 'producao') as Ambiente;

    if (acao === 'testar') {
      if (!chave) return json({ error: 'nao_conectado' });
      const c = await lerConta(amb, chave);
      if ('erro' in c) return json({ error: c.erro });
      await db.from('integracoes').update({ conta: c.conta, updated_at: new Date().toISOString() }).eq('servico', 'asaas');
      return json({ conta: c.conta });
    }
    if (acao === 'salvar') {
      const de = lerConfig(linha.config) as Record<string, unknown>, para = lerConfig(body.config) as Record<string, unknown>;
      const mudancas = Object.keys(ROT).filter((k) => txt(de[k]) !== txt(para[k])).map((k) => ({ c: ROT[k], de: txt(de[k]), para: txt(para[k]) }));
      const { error } = await db.from('integracoes').update({ config: para, updated_at: new Date().toISOString() }).eq('servico', 'asaas');
      if (error) return json({ error: error.message }, 400);
      if (mudancas.length) await registrar('alterou', `regras de pagamento (${mudancas.length} ${mudancas.length === 1 ? 'mudança' : 'mudanças'})`, mudancas);
      return json({ ok: true });
    }
    if (acao === 'reativar_retorno') {
      const id = await segredo(SEG.webhook);
      if (!chave || !id) return json({ error: 'O retorno dos pagamentos não está cadastrado. Conecte de novo com a chave.' });
      const w = await asaas(amb, chave, 'PUT', `/webhooks/${id}`, { interrupted: false, enabled: true });
      if (!w.ok) return json({ error: `O Asaas não religou o retorno (${w.codigo}).` });
      await db.from('integracoes').update({ retorno_ativo: true, updated_at: new Date().toISOString() }).eq('servico', 'asaas');
      await registrar('alterou', 'religou o retorno dos pagamentos');
      return json({ ok: true });
    }
    if (acao === 'desconectar') {
      await removerRetorno();
      await apagar(SEG.chave); await apagar(SEG.token); await apagar(SEG.webhook);
      const { error } = await db.from('integracoes').update({ conectado: false, conta: null, chave_final: null, conectado_em: null, conectado_por: null, retorno_ativo: false, ultimo_retorno: null, updated_at: new Date().toISOString() }).eq('servico', 'asaas');
      if (error) return json({ error: error.message }, 400);
      await registrar('desconectou', 'conta do Asaas desconectada');
      return json({ ok: true });
    }
    return json({ error: 'acao desconhecida' }, 400);
  } catch (e) {
    return json({ error: (e as Error)?.message || 'erro inesperado' }, 500);
  }
});
