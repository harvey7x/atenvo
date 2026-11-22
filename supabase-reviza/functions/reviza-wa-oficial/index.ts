// reviza-wa-oficial — WhatsApp pela API oficial da Meta, etapa 1 (22/11): conectar o número pelo código de
// acesso, saúde do número, modelos de mensagem e mensagem de teste. Só administrador ativo chama.
// O código de acesso fica no cofre (vault) e nunca volta para a tela. Contrato: src/v2/data/config/oficial.ts.
// As chamadas ao Graph seguem as que já rodam no Atenvo (cloud-manage). NÃO faz ainda: receber conversas,
// responder, nem enviar a régua (é a etapa do atendimento). "Entrar com o Facebook" só existe quando o
// aplicativo estiver aprovado na Meta e META_APP_ID / META_APP_SECRET estiverem definidos.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const GRAPH_V = () => Deno.env.get('META_GRAPH_VERSION') || 'v21.0';
const SEG_TOKEN = 'wa_oficial_token';

// deno-lint-ignore no-explicit-any
type Corpo = Record<string, any>;
async function graph(token: string, caminho: string, metodo = 'GET', corpo?: unknown): Promise<{ ok: boolean; status: number; body: Corpo }> {
  const r = await fetch(`https://graph.facebook.com/${GRAPH_V()}/${caminho}`, {
    method: metodo,
    headers: { Authorization: `Bearer ${token}`, ...(corpo !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  let body: Corpo = {};
  try { body = await r.json(); } catch { /* sem corpo */ }
  return { ok: r.ok, status: r.status, body };
}
const erroMeta = (b: Corpo) => String(b?.error?.error_user_msg || b?.error?.message || 'a Meta não respondeu');

const NOME: Record<string, string> = { APPROVED: 'aprovado', AVAILABLE_WITHOUT_REVIEW: 'aprovado', DECLINED: 'recusado', EXPIRED: 'recusado' };
const QUALIDADE: Record<string, string> = { GREEN: 'alta', YELLOW: 'media', RED: 'baixa' };
const SITUACAO: Record<string, string> = { APPROVED: 'aprovado', REJECTED: 'recusado', DISABLED: 'recusado' };
const LIMITE: Record<string, number | null> = { TIER_50: 50, TIER_250: 250, TIER_1K: 1000, TIER_2K: 2000, TIER_10K: 10000, TIER_100K: 100000, TIER_UNLIMITED: null };
const CAMPOS_NUMERO = 'id,display_phone_number,verified_name,name_status,quality_rating,status,messaging_limit_tier';
const lerNumero = (n: Corpo) => ({
  phone_number_id: String(n.id), numero: String(n.display_phone_number ?? '').replace(/\D/g, ''), nome_exibicao: String(n.verified_name ?? ''),
  nome_situacao: NOME[String(n.name_status)] ?? 'analise', qualidade: QUALIDADE[String(n.quality_rating)] ?? 'desconhecida',
  registrado: String(n.status ?? '') === 'CONNECTED', bloqueado: ['BANNED', 'RESTRICTED', 'FLAGGED'].includes(String(n.status ?? '')),
  limite: n.messaging_limit_tier in LIMITE ? LIMITE[n.messaging_limit_tier] : 0,
});

/* as variáveis do sistema ({nome}…) viram {{1}}, {{2}}… na ordem em que aparecem; a Meta exige um exemplo de cada */
const EXEMPLO: Record<string, string> = { 'nome': 'Maria', 'meia parcela': 'R$ 87,50', 'vencimento': 'dia 10', 'nome do atendente': 'Eduardo', 'link de pagamento': 'https://www.asaas.com/i/exemplo' };
function paraMeta(texto: string): { corpo: string; variaveis: string[] } {
  const variaveis: string[] = [];
  const corpo = texto.replace(/\{([^{}]+)\}/g, (_m, v: string) => {
    const k = v.trim().toLowerCase();
    let i = variaveis.indexOf(k); if (i < 0) { variaveis.push(k); i = variaveis.length - 1; }
    return `{{${i + 1}}}`;
  });
  return { corpo, variaveis };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const comoPessoa = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } }, auth: { persistSession: false } });
    const { data: u } = await comoPessoa.auth.getUser();
    const uid = u?.user?.id;
    if (!uid) return json({ error: 'nao autenticado' }, 401);
    const { data: perfil } = await comoPessoa.from('profiles').select('papel, ativo, nome').eq('id', uid).maybeSingle();
    if (!perfil || !perfil.ativo || perfil.papel !== 'admin') return json({ error: 'sem permissao' }, 403);

    const body: Corpo = await req.json().catch(() => ({}));
    const acao = String(body.acao ?? '');
    const db = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
    const registrar = (acaoReg: string, detalhe: string) => db.from('registros').insert({ ator_id: uid, ator_nome: perfil.nome || '—', ator_papel: 'admin', acao: acaoReg, entidade: 'integração', entidade_id: 'whatsapp-oficial', rotulo: 'WhatsApp oficial', detalhe });
    const segredo = async (nome: string) => { const { data } = await db.rpc('integracao_segredo_ler', { p_nome: nome }); return typeof data === 'string' && data ? data : null; };
    const { data: conta } = await db.from('wa_oficial_conta').select('*').maybeSingle();

    /** traz da Meta a situação de cada modelo e grava (o que foi criado aqui mantém o texto com as nossas variáveis) */
    const sincronizarModelos = async (token: string, waba: string): Promise<{ aprovados: number; analise: number; mudaram: number }> => {
      const r = await graph(token, `${waba}/message_templates?fields=name,language,category,status,components,id,rejected_reason&limit=200`);
      if (!r.ok) throw new Error(erroMeta(r.body));
      const { data: antes } = await db.from('wa_oficial_modelos').select('id, situacao, variaveis, texto');
      const de = new Map((antes ?? []).map((m) => [m.id, m]));
      let mudaram = 0, aprovados = 0, analise = 0;
      for (const t of (Array.isArray(r.body.data) ? r.body.data : []) as Corpo[]) {
        const situacao = SITUACAO[String(t.status)] ?? 'analise';
        if (situacao === 'aprovado') aprovados++; else if (situacao === 'analise') analise++;
        const velho = de.get(String(t.id));
        if (velho && velho.situacao !== situacao) mudaram++;
        const corpoMeta = String((t.components ?? []).find((c: Corpo) => c.type === 'BODY')?.text ?? '');
        const motivo = situacao === 'recusado' && t.rejected_reason && t.rejected_reason !== 'NONE' ? `A Meta recusou (${String(t.rejected_reason).toLowerCase().replace(/_/g, ' ')}). Reescreva e mande de novo.` : null;
        await db.from('wa_oficial_modelos').upsert({
          id: String(t.id), nome: String(t.name), categoria: String(t.category) === 'MARKETING' ? 'marketing' : 'utilidade', idioma: String(t.language ?? 'pt_BR'),
          situacao, texto: velho?.variaveis ? velho.texto : corpoMeta, variaveis: velho?.variaveis ?? null, motivo, atualizado_em: new Date().toISOString(),
        });
      }
      return { aprovados, analise, mudaram };
    };

    if (acao === 'situacao') {
      const [{ data: numeros }, { data: modelos }] = await Promise.all([
        db.from('wa_oficial_numeros').select('*').order('conectado_em'),
        db.from('wa_oficial_modelos').select('id, nome, categoria, idioma, situacao, texto, motivo').order('nome'),
      ]);
      return json({
        empresa: conta?.empresa_nome ? { nome: conta.empresa_nome, verificada: !!conta.empresa_verificada } : null,
        limite_dia: conta?.limite_dia ?? 0, pagamento: null,
        // a entrada pelo Facebook depende do aplicativo aprovado na Meta: desligada até lá
        facebook: false, numeros: numeros ?? [], modelos: modelos ?? [],
      });
    }

    if (acao === 'entrar_facebook') return json({ error: 'facebook_indisponivel' });

    if (acao === 'buscar_numeros') {
      const token = String(body.token ?? '').trim();
      if (token.length < 40 || /\s/.test(token)) return json({ error: 'token_invalido' });
      // de quais contas do WhatsApp este código cuida: a própria Meta diz (ou a pessoa informa o número da conta)
      let waba = String(body.waba_id ?? '').replace(/\D/g, '');
      if (!waba) {
        const d = await graph(token, `debug_token?input_token=${encodeURIComponent(token)}`);
        if (!d.ok) return json({ error: 'token_invalido' });
        const escopos = (Array.isArray(d.body?.data?.granular_scopes) ? d.body.data.granular_scopes : []) as Corpo[];
        waba = String((escopos.find((e) => e.scope === 'whatsapp_business_management')?.target_ids ?? [])[0] ?? '');
        if (!waba) return json({ error: 'informe_waba' });
      }
      const [c, n] = await Promise.all([graph(token, `${waba}?fields=name,business_verification_status`), graph(token, `${waba}/phone_numbers?fields=${CAMPOS_NUMERO}`)]);
      if (!c.ok || !n.ok) return json({ error: c.status === 401 || n.status === 401 ? 'token_invalido' : erroMeta(c.ok ? n.body : c.body) });
      const lista = ((Array.isArray(n.body.data) ? n.body.data : []) as Corpo[]).map(lerNumero);
      if (!lista.length) return json({ error: 'sem_numeros' });
      const { data: ja } = await db.from('wa_oficial_numeros').select('phone_number_id');
      const { data: sessao, error } = await db.from('wa_oficial_sessoes').insert({ waba_id: waba, criado_por: uid }).select('id').single();
      if (error || !sessao) return json({ error: error?.message ?? 'não foi possível abrir a conexão' }, 400);
      await db.rpc('integracao_segredo_gravar', { p_nome: `wa_oficial_pendente_${sessao.id}`, p_valor: token });
      return json({ sessao: sessao.id, empresa: String(c.body.name ?? 'Conta do WhatsApp'),
        numeros: lista.map((x) => ({ ...x, ja_conectado: (ja ?? []).some((j) => j.phone_number_id === x.phone_number_id) })) });
    }

    if (acao === 'conectar') {
      const { data: sessao } = await db.from('wa_oficial_sessoes').select('*').eq('id', String(body.sessao ?? '')).maybeSingle();
      const pendente = sessao ? await segredo(`wa_oficial_pendente_${sessao.id}`) : null;
      // a conexão em aberto vale 30 minutos
      if (!sessao || !pendente || Date.now() - new Date(sessao.criado_em).getTime() > 30 * 60_000) return json({ error: 'sessao_vencida' });
      const pnid = String(body.phone_number_id ?? '');
      const { data: existe } = await db.from('wa_oficial_numeros').select('id').eq('phone_number_id', pnid).maybeSingle();
      if (existe) return json({ error: 'ja_conectado' });
      const [n, c] = await Promise.all([graph(pendente, `${pnid}?fields=${CAMPOS_NUMERO}`), graph(pendente, `${sessao.waba_id}?fields=name,business_verification_status`)]);
      if (!n.ok) return json({ error: erroMeta(n.body) });
      const num = lerNumero(n.body);
      const verificada = String(c.body?.business_verification_status ?? '').toLowerCase() === 'verified';
      const ambiente = body.ambiente === 'atendimento' ? 'atendimento' : 'cobrancas';
      const nome = String(body.nome ?? '').trim().slice(0, 40) || num.nome_exibicao || 'Número oficial';
      // o código passa a ser o da instalação; o pendente sai do cofre
      await db.rpc('integracao_segredo_gravar', { p_nome: SEG_TOKEN, p_valor: pendente });
      await db.rpc('integracao_segredo_apagar', { p_nome: `wa_oficial_pendente_${sessao.id}` });
      await db.from('wa_oficial_sessoes').delete().eq('id', sessao.id);
      await db.from('wa_oficial_conta').upsert({ id: true, waba_id: sessao.waba_id, empresa_nome: String(c.body?.name ?? 'Conta do WhatsApp'), empresa_verificada: verificada, limite_dia: num.limite, atualizado_em: new Date().toISOString() });
      const { error } = await db.from('wa_oficial_numeros').insert({ phone_number_id: pnid, numero: num.numero, nome, nome_exibicao: num.nome_exibicao, nome_situacao: num.nome_situacao, qualidade: num.qualidade, ambiente, no_celular: false, recebimento: false, bloqueado: num.bloqueado, conectado_por: perfil.nome || '—' });
      if (error) return json({ error: error.message }, 400);
      let modelos = { aprovados: 0, analise: 0, mudaram: 0 }, modelosOk = true;
      try { modelos = await sincronizarModelos(pendente, sessao.waba_id); } catch { modelosOk = false; }
      await registrar('conectou', `número ${num.numero} conectado pela API oficial em ${ambiente === 'atendimento' ? 'Atendimento' : 'Cobranças'}`);
      return json({ conferencia: [
        { rotulo: 'Acesso à conta da Meta', ok: true, nota: String(c.body?.name ?? '') || null },
        { rotulo: 'Número registrado na API oficial', ok: num.registrado, nota: num.registrado ? num.numero : 'O número ainda não está ativo na API. Ative-o no Gerenciador do WhatsApp, na Meta.' },
        { rotulo: 'Modelos de mensagem trazidos da Meta', ok: modelosOk, nota: modelosOk ? `${modelos.aprovados} ${modelos.aprovados === 1 ? 'aprovado' : 'aprovados'}${modelos.analise ? `, ${modelos.analise} em análise` : ''}` : 'Não consegui trazer os modelos agora. Use "Atualizar situação" depois.' },
        { rotulo: 'Nome de exibição aprovado', ok: num.nome_situacao === 'aprovado', nota: num.nome_situacao === 'aprovado' ? num.nome_exibicao : 'A Meta ainda está analisando o nome. Até aprovar, o número envia com limite reduzido.' },
        { rotulo: 'Empresa verificada na Meta', ok: verificada, nota: verificada ? null : 'Sem a verificação, o limite é de 250 clientes diferentes por dia. Ela é feita no Gerenciador de Negócios da Meta.' },
        { rotulo: 'Recebimento das conversas', ok: false, nota: 'Receber e responder por este número entra na próxima etapa. Por enquanto ele envia mensagem de teste e cuida dos modelos.' },
      ] });
    }

    // daqui para baixo: precisa do código de acesso guardado
    const token = await segredo(SEG_TOKEN);
    if (!token || !conta?.waba_id) return json({ error: 'Nenhum número oficial conectado ainda.' });
    const numeroDe = async () => (await db.from('wa_oficial_numeros').select('*').eq('id', String(body.id ?? '')).maybeSingle()).data;

    if (acao === 'testar') {
      const n = await numeroDe(); if (!n) return json({ error: 'Número não encontrado.' });
      const r = await graph(token, `${n.phone_number_id}?fields=${CAMPOS_NUMERO}`);
      if (!r.ok) return json({ error: r.status === 401 ? 'token_invalido' : erroMeta(r.body) });
      const num = lerNumero(r.body);
      await db.from('wa_oficial_numeros').update({ nome_exibicao: num.nome_exibicao, nome_situacao: num.nome_situacao, qualidade: num.qualidade, bloqueado: num.bloqueado }).eq('id', n.id);
      await db.from('wa_oficial_conta').update({ limite_dia: num.limite, atualizado_em: new Date().toISOString() }).eq('id', true);
      return json({ ok: true });
    }
    if (acao === 'enviar_teste') {
      const n = await numeroDe(); if (!n) return json({ error: 'Número não encontrado.' });
      const para = String(body.para ?? '').replace(/\D/g, '');
      if (para.length < 12) return json({ error: 'Digite o número com DDD.' });
      const { data: m } = await db.from('wa_oficial_modelos').select('*').eq('nome', String(body.modelo ?? '')).eq('situacao', 'aprovado').maybeSingle();
      if (!m) return json({ error: 'Esse modelo não está aprovado.' });
      const vars = (Array.isArray(m.variaveis) ? m.variaveis : []) as string[];
      // modelo trazido da Meta sem as nossas variáveis: conta os {{n}} do texto e preenche com "exemplo"
      const total = vars.length || new Set(String(m.texto).match(/\{\{\d+\}\}/g) ?? []).size;
      const parametros = Array.from({ length: total }, (_x, i) => ({ type: 'text', text: EXEMPLO[vars[i]] ?? 'exemplo' }));
      const r = await graph(token, `${n.phone_number_id}/messages`, 'POST', {
        messaging_product: 'whatsapp', to: para, type: 'template',
        template: { name: m.nome, language: { code: m.idioma }, ...(parametros.length ? { components: [{ type: 'body', parameters: parametros }] } : {}) },
      });
      if (!r.ok) return json({ error: `A Meta recusou o envio: ${erroMeta(r.body)}` });
      await registrar('enviou', `mensagem de teste (modelo ${m.nome}) para ${para}`);
      return json({ ok: true });
    }
    if (acao === 'desconectar') {
      const n = await numeroDe(); if (!n) return json({ error: 'Número não encontrado.' });
      await db.from('wa_oficial_numeros').delete().eq('id', n.id);
      const { count } = await db.from('wa_oficial_numeros').select('id', { count: 'exact', head: true });
      if (!count) await db.rpc('integracao_segredo_apagar', { p_nome: SEG_TOKEN });   // último número: o código de acesso sai do cofre
      await registrar('desconectou', `número ${n.numero} desconectado da API oficial`);
      return json({ ok: true });
    }
    if (acao === 'modelos_sync') {
      try { const m = await sincronizarModelos(token, conta.waba_id); return json({ ok: true, mudaram: m.mudaram }); }
      catch (e) { return json({ error: (e as Error).message }); }
    }
    if (acao === 'modelo_criar') {
      const nome = String(body.nome ?? '').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 60);
      const texto = String(body.texto ?? '').trim();
      if (nome.length < 3 || texto.length < 10 || texto.length > 1024) return json({ error: 'Confira o nome e o texto do modelo.' });
      const { corpo, variaveis } = paraMeta(texto);
      const desconhecida = variaveis.find((v) => !(v in EXEMPLO));
      if (desconhecida) return json({ error: `O sistema não conhece a variável {${desconhecida}}.` });
      const r = await graph(token, `${conta.waba_id}/message_templates`, 'POST', {
        name: nome, language: 'pt_BR', category: body.categoria === 'marketing' ? 'MARKETING' : 'UTILITY',
        components: [{ type: 'BODY', text: corpo, ...(variaveis.length ? { example: { body_text: [variaveis.map((v) => EXEMPLO[v])] } } : {}) }],
      });
      if (!r.ok || !r.body.id) return json({ error: `A Meta não aceitou o modelo: ${erroMeta(r.body)}` });
      await db.from('wa_oficial_modelos').upsert({ id: String(r.body.id), nome, categoria: body.categoria === 'marketing' ? 'marketing' : 'utilidade', idioma: 'pt_BR', situacao: SITUACAO[String(r.body.status)] ?? 'analise', texto, variaveis, motivo: null, atualizado_em: new Date().toISOString() });
      await registrar('criou', `modelo de mensagem ${nome} enviado para a aprovação da Meta`);
      return json({ ok: true });
    }
    return json({ error: 'acao desconhecida' }, 400);
  } catch (e) {
    return json({ error: (e as Error)?.message || 'erro inesperado' }, 500);
  }
});
