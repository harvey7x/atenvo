// O pedido HTTP inteiro (servidor.ts) com dependências falsas: autenticação (S2), modo FERRAMENTA (a voz) e o
// modo pergunta (texto) — sem rede, sem banco e sem Gemini.
import { assert, assertEquals } from 'jsr:@std/assert@1';
import type { ChamarGemini, Contexto } from './logica.ts';
import { type LinhaLog, criarTratador } from './servidor.ts';

const ORG = 'de300000-0000-4000-8000-000000000001';
const JUL = 'd7e59652-d3eb-4d7d-8830-7fc780701a8e';
const MAT = '4ac197b4-9600-4756-81aa-1ac29280df09';
const MUR = 'f81fcc8a-07a7-436a-9224-34003b65fc67';
const FORA = '99999999-9999-4999-8999-999999999999';
const CHAVE = 'eyJhbGciOiJIUzI1NiJ9.chave-de-servico-de-teste.assinatura';
const CONV = '00000000-0000-4000-8000-0000000000c1';

const EQUIPE = [
  { id: JUL, nome: 'Juliana', papel: 'atendente' },
  { id: MAT, nome: 'Matheus', papel: 'admin' },
  { id: MUR, nome: 'Murilo', papel: 'admin' },
];

function contextoDe(ator: string): Contexto {
  const admin = ator !== JUL;
  return {
    ator: { id: ator, nome: ator === JUL ? 'Juliana' : ator === MAT ? 'Matheus' : 'Murilo', admin },
    hoje: '2026-10-30', agora: '21:50', dia_semana: 'sexta-feira', ultimo_dia_util: '2026-10-29',
    mes_caf: { inicio: '2026-10-11', fim: '2026-11-10' }, mes_caf_anterior: { inicio: '2026-09-11', fim: '2026-10-10' },
    equipe: admin ? EQUIPE : [],
  };
}

const b64url = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const JWT_FORJADO = `${b64url({ alg: 'none', typ: 'JWT' })}.${b64url({ role: 'service_role', iss: 'supabase' })}.`;

/** Um servidor com tudo falso e gravando: RPCs chamadas, getUser, Gemini e log. */
function montar(o: {
  uso?: number; gemini?: ChamarGemini | null; chave?: string; confirmar?: (token: string) => Promise<boolean>;
  /** resposta fixa de outras RPCs (os lembretes) */
  respostas?: Record<string, unknown>;
} = {}) {
  const rpcs: { nome: string; params: Record<string, unknown> }[] = [];
  const tokens: string[] = [];
  const logs: LinhaLog[] = [];
  let chamadasGemini = 0;
  const geminiPadrao: ChamarGemini = () => {
    chamadasGemini++;
    return Promise.resolve({ candidates: [{ content: { role: 'model', parts: [{ text: 'Você tem 8 sem resposta.' }] } }] });
  };
  const tratar = criarTratador({
    chaveServico: o.chave ?? CHAVE,
    confirmarServico: o.confirmar,
    getUser: (req) => {
      const t = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
      tokens.push(t);
      return Promise.resolve(t === 'token-juliana' ? { id: JUL } : t === 'token-murilo' ? { id: MUR } : null);
    },
    rpc: (nome, params) => {
      rpcs.push({ nome, params });
      if (nome === 'assistente_contexto') {
        if (params.p_ator === FORA) return Promise.reject({ code: '42501', message: 'sem_acesso' });
        return Promise.resolve(contextoDe(String(params.p_ator)));
      }
      if (nome === 'assistente_registrar_uso') return Promise.resolve(o.uso ?? 1);
      if (o.respostas && nome in o.respostas) return Promise.resolve(structuredClone(o.respostas[nome]));
      if (nome === 'assistente_pendentes') {
        return Promise.resolve({
          escopo: 'pessoa',
          pessoa: { id: params.p_alvo ?? params.p_ator, nome: 'Juliana' },
          sem_resposta: {
            total: 1,
            clientes: [{ conversa_id: CONV, cliente: 'Eva Pereira eva@gmail.com', responsavel: 'Juliana', ultima_msg: 'meu cpf 123,456,789,00' }],
          },
          passados: { total: 0, clientes: [] },
          presenciais_hoje: { total: 0, clientes: [] },
        });
      }
      return Promise.resolve({ ok: nome });
    },
    gemini: o.gemini === undefined ? geminiPadrao : o.gemini,
    gravarLog: (l) => logs.push(l),
    tetoDia: 60,
  });
  const pedir = (corpo: unknown, h: { bearer?: string; ator?: string; metodo?: string } = {}) => tratar(new Request('http://local/assistente', {
    method: h.metodo ?? 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(h.bearer !== undefined ? { Authorization: `Bearer ${h.bearer}` } : {}),
      ...(h.ator ? { 'x-assistente-ator': h.ator } : {}),
    },
    ...(h.metodo === 'GET' ? {} : { body: typeof corpo === 'string' ? corpo : JSON.stringify(corpo) }),
  }));
  return { pedir, rpcs, tokens, logs, gemini: () => chamadasGemini };
}

const ferramenta = (nome: unknown, args?: unknown) => ({ org: ORG, ferramenta: { nome, ...(args !== undefined ? { args } : {}) } });

// ------------------------------------------------------------------ modo ferramenta

Deno.test('modo ferramenta: atendente — equipe, leads e outra pessoa voltam sem_acesso SEM tocar no banco', async () => {
  const s = montar();
  for (const [nome, args] of [['ver_equipe', {}], ['ver_leads', { periodo: 'hoje' }], ['ver_carteira', { pessoa: 'Matheus' }],
    ['ver_fechados', { periodo: 'este_mes', pessoa: 'Murilo' }], ['clientes_para_resolver', { pessoa: 'matheus' }]] as const) {
    const r = await s.pedir(ferramenta(nome, args), { bearer: 'token-juliana' });
    assertEquals(r.status, 200, nome);
    assertEquals(await r.json(), { resultado: { erro: 'sem_acesso' }, links: [] }, nome);
  }
  assertEquals(s.rpcs.map((c) => c.nome), Array(5).fill('assistente_contexto')); // só o contexto, nenhuma consulta
  assert(s.rpcs.every((c) => c.params.p_ator === JUL));
  assertEquals(s.gemini(), 0);
  assertEquals(s.logs.length, 5);
  assertEquals(s.logs[0].pergunta, 'ferramenta: ver_equipe');
});

Deno.test('modo ferramenta: a própria carteira — ator do JWT (nunca dos args), resultado higienizado, links, sem teto e sem Gemini', async () => {
  const s = montar();
  const r = await s.pedir(ferramenta('clientes_para_resolver', { limite: 3, p_ator: MAT, p_alvo: MAT, p_org: FORA }), { bearer: 'token-juliana' });
  assertEquals(r.status, 200);
  const corpo = await r.json();
  assertEquals(s.rpcs[1], { nome: 'assistente_pendentes', params: { p_org: ORG, p_ator: JUL, p_alvo: null, p_limite: 3 } });
  const item = corpo.resultado.sem_resposta.clientes[0];
  assertEquals(item.cliente, 'Eva Pereira ••••'); // S1 na saída
  assertEquals(item.ultima_msg, 'meu cpf ••••');  // S3 na saída
  assertEquals(corpo.links, [{ rotulo: 'Eva Pereira ••••', rota: `/whatsapp?conversa=${CONV}` }]);
  assert(!s.rpcs.some((c) => c.nome === 'assistente_registrar_uso')); // sem teto
  assertEquals(s.gemini(), 0); // sem Gemini
  assertEquals(s.logs.length, 1);
  assertEquals(s.logs[0].pergunta, 'ferramenta: clientes_para_resolver');
  assertEquals(s.logs[0].ferramentas?.[0].nome, 'clientes_para_resolver');
  assertEquals(s.logs[0].usuario_id, JUL);
});

Deno.test('modo ferramenta: admin pergunta de outra pessoa pelo nome', async () => {
  const s = montar();
  const r = await s.pedir(ferramenta('ver_fechados', { periodo: 'mes_passado', pessoa: 'Juliana' }), { bearer: 'token-murilo' });
  assertEquals(r.status, 200);
  assertEquals(s.rpcs[1], {
    nome: 'assistente_fechados',
    params: { p_org: ORG, p_ator: MUR, p_inicio: '2026-09-11', p_fim: '2026-10-10', p_alvo: JUL },
  });
  assertEquals((await r.json()).resultado, { ok: 'assistente_fechados' });
});

Deno.test('modo ferramenta: ferramenta desconhecida volta como erro de ferramenta (200), sem consulta', async () => {
  const s = montar();
  for (const nome of ['apagar_tudo', 'executar_sql', 'verCarteira']) {
    const r = await s.pedir(ferramenta(nome, { sql: 'select 1' }), { bearer: 'token-murilo' });
    assertEquals(r.status, 200);
    assertEquals(await r.json(), { resultado: { erro: 'ferramenta_desconhecida' }, links: [] });
  }
  assertEquals(s.rpcs.map((c) => c.nome), Array(3).fill('assistente_contexto'));
});

Deno.test('modo ferramenta: args inválidos — formato = 400; tipo/valor = erro de ferramenta, nada no banco', async () => {
  const s = montar();
  // formato errado: 400 antes de qualquer consulta
  for (const corpo of [
    ferramenta('ver_carteira', []), ferramenta('ver_carteira', 'hoje'), ferramenta(42), ferramenta(''),
    { org: ORG, ferramenta: 'ver_carteira' }, { org: 'nao-e-uuid', ferramenta: { nome: 'ver_carteira' } },
    ferramenta('buscar_cliente', { nome: 'a'.repeat(3000) }),
  ]) {
    const r = await s.pedir(corpo, { bearer: 'token-murilo' });
    assertEquals(r.status, 400, JSON.stringify(corpo).slice(0, 80));
    assertEquals((await r.json()).error, 'pergunta_invalida');
  }
  assertEquals(s.rpcs.length, 0);
  // formato certo, valor errado: o modelo recebe o erro e pode corrigir
  const casos: [unknown, string][] = [
    [ferramenta('ver_carteira', { pessoa: 7 }), 'args_invalidos'],
    [ferramenta('clientes_para_resolver', { limite: 'muitos' }), 'args_invalidos'],
    [ferramenta('ver_fechados', { periodo: 'trimestre' }), 'periodo_invalido'],
    [ferramenta('ver_fechados', { data: '2026-13-01' }), 'data_invalida'],
    [ferramenta('ver_fechados', { data: '2026-10-31' }), 'data_invalida'], // futuro
    [ferramenta('buscar_cliente', { nome: 'jo' }), 'busca_curta'],
    [ferramenta('ver_carteira', { pessoa: 'Pedro' }), 'pessoa_nao_encontrada'],
  ];
  for (const [corpo, codigo] of casos) {
    const r = await s.pedir(corpo, { bearer: 'token-murilo' });
    assertEquals(r.status, 200);
    assertEquals((await r.json()).resultado.erro, codigo);
  }
  assertEquals(s.rpcs.map((c) => c.nome), Array(casos.length).fill('assistente_contexto'));
});

Deno.test('modo ferramenta: sem vínculo na org = 403; sem login = 401', async () => {
  const s = montar();
  const fora = await s.pedir(ferramenta('ver_carteira'), { bearer: CHAVE, ator: FORA });
  assertEquals(fora.status, 403);
  assertEquals((await fora.json()).error, 'sem_acesso');
  const anonimo = await s.pedir(ferramenta('ver_carteira'));
  assertEquals(anonimo.status, 401);
  assertEquals((await anonimo.json()).error, 'nao_autenticado');
});

// ------------------------------------------------------------------ S2: atalho de QA

Deno.test('S2: atalho de QA só com a service key IGUAL; JWT forjado com role service_role não passa', async () => {
  const s = montar();
  // a chave certa + x-assistente-ator: age como a Juliana (sem passar pelo Auth)
  const ok = await s.pedir(ferramenta('ver_carteira'), { bearer: CHAVE, ator: JUL });
  assertEquals(ok.status, 200);
  assertEquals(s.rpcs[0], { nome: 'assistente_contexto', params: { p_org: ORG, p_ator: JUL } });
  assertEquals(s.tokens.length, 0);
  // o token forjado (o que o atalho antigo aceitava, lendo só o payload) vira token de usuário → o Auth recusa
  const forjado = await s.pedir(ferramenta('ver_equipe'), { bearer: JWT_FORJADO, ator: MUR });
  assertEquals(forjado.status, 401);
  assertEquals(s.tokens, [JWT_FORJADO]);
  // quase a chave: também não
  for (const quase of [CHAVE + 'x', CHAVE.slice(0, -1), CHAVE.toUpperCase()]) {
    assertEquals((await s.pedir(ferramenta('ver_equipe'), { bearer: quase, ator: MUR })).status, 401);
  }
  // a chave sem dizer quem: 401 com a explicação
  const semAtor = await s.pedir(ferramenta('ver_carteira'), { bearer: CHAVE });
  assertEquals(semAtor.status, 401);
  assert((await semAtor.json()).mensagem.includes('x-assistente-ator'));
  // usuário comum mandando x-assistente-ator de outra pessoa continua sendo ele mesmo
  await s.pedir(ferramenta('ver_carteira'), { bearer: 'token-juliana', ator: MAT });
  assertEquals(s.rpcs[s.rpcs.length - 2], { nome: 'assistente_contexto', params: { p_org: ORG, p_ator: JUL } });
  assertEquals(s.rpcs.filter((c) => c.nome === 'assistente_contexto').length, 2); // só os dois pedidos válidos
});

Deno.test('S2: sem a service key no ambiente o atalho não existe', async () => {
  const s = montar({ chave: '' });
  assertEquals((await s.pedir(ferramenta('ver_carteira'), { bearer: '', ator: JUL })).status, 401);
  assertEquals((await s.pedir(ferramenta('ver_carteira'), { bearer: CHAVE, ator: JUL })).status, 401);
  assertEquals(s.rpcs.length, 0);
});

Deno.test('S2 caminho 2 (o que vale em produção): o modo ferramenta aceita o JWT service_role SÓ com o banco confirmando', async () => {
  // a service_role legada do CLI: outra string que a SUPABASE_SERVICE_ROLE_KEY do runtime (digests conferidos em 30/10)
  const jwtCli = `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ role: 'service_role', ref: 'x' })}.assinatura-boa`;
  const perguntados: string[] = [];
  const banco = (aceita: boolean) => (t: string) => { perguntados.push(t); return Promise.resolve(aceita); };
  const ok = montar({ confirmar: banco(true) });
  const r = await ok.pedir(ferramenta('ver_carteira'), { bearer: jwtCli, ator: JUL });
  assertEquals(r.status, 200);
  assertEquals(ok.rpcs[0], { nome: 'assistente_contexto', params: { p_org: ORG, p_ator: JUL } });
  assertEquals(ok.tokens.length, 0);
  assertEquals(perguntados, [jwtCli]);
  // o banco recusou (assinatura forjada) → cai no getUser → 401, sem nenhuma RPC
  const nao = montar({ confirmar: banco(false) });
  assertEquals((await nao.pedir(ferramenta('ver_equipe'), { bearer: JWT_FORJADO, ator: MUR })).status, 401);
  assertEquals(nao.rpcs.length, 0);
  // token de usuário nunca vai ao banco para isso, e o x-assistente-ator dele é ignorado
  perguntados.length = 0;
  await ok.pedir(ferramenta('ver_carteira'), { bearer: 'token-juliana', ator: MAT });
  assertEquals(perguntados, []);
  assertEquals(ok.rpcs[ok.rpcs.length - 2], { nome: 'assistente_contexto', params: { p_org: ORG, p_ator: JUL } });
});

// ------------------------------------------------------------------ modo pergunta (texto) segue igual

Deno.test('modo pergunta: teto do dia (429), sem chave do Gemini (502) e a resposta {resposta, links}', async () => {
  const cheio = montar({ uso: -1 });
  const r429 = await cheio.pedir({ org: ORG, pergunta: 'Quantos fechei hoje?' }, { bearer: 'token-juliana' });
  assertEquals(r429.status, 429);
  assertEquals((await r429.json()).error, 'limite_dia');
  assertEquals(cheio.gemini(), 0);
  assertEquals(cheio.rpcs[1], { nome: 'assistente_registrar_uso', params: { p_org: ORG, p_usuario: JUL, p_limite: 60 } });

  const semChave = montar({ gemini: null });
  const r502 = await semChave.pedir({ org: ORG, pergunta: 'Quantos fechei hoje?' }, { bearer: 'token-juliana' });
  assertEquals(r502.status, 502);
  assertEquals(semChave.logs[0].erro, 'GEMINI_API_KEY ausente');

  const ok = montar();
  const r = await ok.pedir({ org: ORG, pergunta: 'Como estou?' }, { bearer: 'token-juliana' });
  assertEquals(r.status, 200);
  assertEquals(await r.json(), { resposta: 'Você tem 8 sem resposta.', links: [] });
  assertEquals(ok.logs[0].pergunta, 'Como estou?');
  assertEquals((await ok.pedir({ org: ORG, pergunta: '' }, { bearer: 'token-juliana' })).status, 400);
  assertEquals((await ok.pedir('não é json', { bearer: 'token-juliana' })).status, 400);
  assertEquals((await ok.pedir(null, { bearer: 'token-juliana', metodo: 'GET' })).status, 400);
});

// ------------------------------------------------------------------ lembretes (versão 1, 31/10) pelo modo ferramenta

// respostas REAIS das RPCs (prova pg_temp da migration 20261031000000)
const L_JOAO = {
  id: '2ab12b7b-7dd9-43bc-9d64-85910035f10a', hora: '13:00', texto: 'ligar para o João', quando: '2026-10-31T13:00:00-03:00',
  dia_semana: 'sábado', hora_falada: 'à uma da tarde', data_extenso: '31 de outubro', dia_relativo: 'amanhã', quando_local: '2026-10-31T13:00',
};
const L_JOAO_FALADO = {
  id: L_JOAO.id, texto: 'ligar para o João', dia_relativo: 'amanhã', dia_semana: 'sábado', data_extenso: '31 de outubro',
  hora_falada: 'à uma da tarde',
};

Deno.test('modo ferramenta: lembretes — criar/ver/cancelar com o ator do JWT, sem teto e sem Gemini; o resultado sem ISO', async () => {
  const s = montar({
    respostas: {
      assistente_lembrete_criar: L_JOAO,
      assistente_lembretes_listar: { total: 1, lembretes: [L_JOAO] },
      assistente_lembrete_cancelar: { ok: true, cancelado: L_JOAO },
    },
  });
  // a atendente marca o dela; p_ator/p_org forjados nos args não valem
  const r = await s.pedir(ferramenta('criar_lembrete', { texto: 'ligar para o João', quando_local: '2026-10-31T13:00', p_ator: MAT, p_org: FORA }),
    { bearer: 'token-juliana' });
  assertEquals(r.status, 200);
  assertEquals(await r.json(), { resultado: L_JOAO_FALADO, links: [] });
  assertEquals(s.rpcs[1], {
    nome: 'assistente_lembrete_criar',
    params: { p_org: ORG, p_ator: JUL, p_texto: 'ligar para o João', p_quando_local: '2026-10-31T13:00', p_em_minutos: null },
  });
  // o admin vê e cancela os DELE
  const ver = await s.pedir(ferramenta('ver_lembretes'), { bearer: 'token-murilo' });
  assertEquals(await ver.json(), { resultado: { total: 1, lembretes: [L_JOAO_FALADO] }, links: [] });
  const cancelar = await s.pedir(ferramenta('cancelar_lembrete', { busca: 'João' }), { bearer: 'token-murilo' });
  assertEquals(await cancelar.json(), { resultado: { ok: true, cancelado: L_JOAO_FALADO }, links: [] });
  assertEquals(s.rpcs.filter((c) => c.nome !== 'assistente_contexto'), [
    s.rpcs[1],
    { nome: 'assistente_lembretes_listar', params: { p_org: ORG, p_ator: MUR } },
    { nome: 'assistente_lembrete_cancelar', params: { p_org: ORG, p_ator: MUR, p_busca: 'João' } },
  ]);
  assert(!s.rpcs.some((c) => c.nome === 'assistente_registrar_uso')); // sem teto
  assertEquals(s.gemini(), 0);
  assertEquals(s.logs.map((l) => l.pergunta), ['ferramenta: criar_lembrete', 'ferramenta: ver_lembretes', 'ferramenta: cancelar_lembrete']);
});

Deno.test('modo ferramenta: lembrete de outra pessoa = so_para_voce e argumento errado = erro de ferramenta, sem consulta', async () => {
  const s = montar({ respostas: { assistente_lembrete_criar: L_JOAO } });
  const casos: [unknown, string][] = [
    [ferramenta('criar_lembrete', { texto: 'ligar para o João', quando_local: '2026-10-31T13:00', para: 'Juliana' }), 'so_para_voce'],
    [ferramenta('ver_lembretes', { pessoa: 'Juliana' }), 'so_para_voce'],
    [ferramenta('criar_lembrete', { texto: 'ligar para o João' }), 'sem_horario'],
    [ferramenta('criar_lembrete', { texto: 'ligar para o João', quando_local: 'amanhã 13h' }), 'quando_invalido'],
    [ferramenta('criar_lembrete', { texto: 'ligar para o João', em_minutos: 0 }), 'no_passado'],
    [ferramenta('cancelar_lembrete', { busca: 42 }), 'args_invalidos'],
    [ferramenta('criar_lembrete', { texto: 'ligar para o João', quando_local: '2026-11-01T13:00', para: 'Murilo e Juliana' }), 'so_para_voce'],
  ];
  for (const [corpo, codigo] of casos) {
    const r = await s.pedir(corpo, { bearer: 'token-murilo' });
    assertEquals(r.status, 200);
    const j = await r.json();
    assertEquals(j.resultado.erro, codigo, JSON.stringify(corpo));
    assert(typeof j.resultado.mensagem === 'string' && j.resultado.mensagem.length > 0, codigo);
  }
  assertEquals(s.rpcs.map((c) => c.nome), Array(casos.length).fill('assistente_contexto'));
});

Deno.test('modo ferramenta: o log dos lembretes não guarda telefone, CPF nem senha ditos no texto', async () => {
  const s = montar({ respostas: { assistente_lembrete_criar: L_JOAO, assistente_lembrete_cancelar: { erro: 'nao_encontrado' } } });
  await s.pedir(ferramenta('criar_lembrete', { texto: 'ligar para o João no (51) 99876-5432, cpf 123.456.789-00', em_minutos: 20 }),
    { bearer: 'token-juliana' });
  await s.pedir(ferramenta('criar_lembrete', { texto: 'entrar no gov do seu Antônio, senha: Antonio1952', em_minutos: 20 }),
    { bearer: 'token-juliana' });
  await s.pedir(ferramenta('cancelar_lembrete', { busca: 'o do joao@gmail.com' }), { bearer: 'token-juliana' });
  // quando_local fora do formato (pedido forjado ou o modelo pôs o texto ali): também mascarado; no formato, fica
  await s.pedir(ferramenta('criar_lembrete', { texto: 'ligar para o João', quando_local: 'ligar 51 98888-7777' }), { bearer: 'token-juliana' });
  await s.pedir(ferramenta('criar_lembrete', { texto: 'ligar para o João', quando_local: '2026-10-31 13:00' }), { bearer: 'token-juliana' });
  assertEquals(s.logs.map((l) => l.ferramentas?.[0].args), [
    { texto: 'ligar para o João no ••••, cpf ••••', em_minutos: 20 },
    { texto: '[texto com senha]', em_minutos: 20 },
    { busca: 'o do ••••' },
    { texto: 'ligar para o João', quando_local: 'ligar ••••' },
    { texto: 'ligar para o João', quando_local: '2026-10-31 13:00' },
  ]);
  const txt = JSON.stringify(s.logs);
  for (const segredo of ['99876', '123.456', 'Antonio1952', 'joao@gmail', '98888']) assert(!txt.includes(segredo), segredo);
  // a RPC recebe o texto como foi dito: é ela que higieniza antes de guardar (assistente_lembrete_texto)
  assertEquals(s.rpcs[1].params.p_texto, 'ligar para o João no (51) 99876-5432, cpf 123.456.789-00');
});
