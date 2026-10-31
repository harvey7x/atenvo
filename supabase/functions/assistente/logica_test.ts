import { assert, assertEquals, assertRejects } from 'jsr:@std/assert@1';
import {
  type ChamarGemini, type ConteudoGemini, type Contexto, type PedidoGemini, type RespostaGemini,
  ErroAssistente, MAX_ARGS_JSON, MAX_RODADAS, PERIODOS, RESPOSTA_VAZIA, autenticar, bearerDe, classificarErroGemini, papelDoJwt,
  criarGemini, declaracoes, diaIso, ehChaveDeServico, executarFerramenta, extrairLinks, higienizarResultado,
  linhaDaFolga, mascararNomeCliente, mascararTrecho, montarContents, normalizarNome, resolverPeriodo, resolverPessoa,
  responder, significadoDosNumeros, somarDias, systemPrompt, validarEntrada, validarPedidoFerramenta,
} from './logica.ts';

const ORG = 'de300000-0000-4000-8000-000000000001';
const JUL = 'd7e59652-d3eb-4d7d-8830-7fc780701a8e';
const MAT = '4ac197b4-9600-4756-81aa-1ac29280df09';
const MUR = 'f81fcc8a-07a7-436a-9224-34003b65fc67';
const EQUIPE = [
  { id: 'a31b5fcb-d378-4490-83fe-a47a7c1ee847', nome: 'Giovana', papel: 'atendente' },
  { id: '94f9343a-0a9f-4b4f-9bd3-804f5483170c', nome: 'Isadora', papel: 'atendente' },
  { id: JUL, nome: 'Juliana', papel: 'atendente' },
  { id: 'd189e143-6cab-49c0-98d3-b030453a3c86', nome: 'Luiz', papel: 'atendente' },
  { id: MAT, nome: 'Matheus', papel: 'admin' },
  { id: MUR, nome: 'Murilo', papel: 'admin' },
];

// sexta-feira 30/10/2026, mês do CAF 11/10 → 10/11
function ctxDe(o: Partial<Contexto> & { admin?: boolean; id?: string; nome?: string } = {}): Contexto {
  const admin = o.admin ?? false;
  return {
    ator: { id: o.id ?? (admin ? MUR : JUL), nome: o.nome ?? (admin ? 'Murilo' : 'Juliana'), admin },
    hoje: o.hoje ?? '2026-10-30',
    agora: o.agora ?? '18:20',
    dia_semana: o.dia_semana ?? 'sexta-feira',
    ultimo_dia_util: o.ultimo_dia_util ?? '2026-10-29',
    mes_caf: o.mes_caf ?? { inicio: '2026-10-11', fim: '2026-11-10' },
    mes_caf_anterior: o.mes_caf_anterior ?? { inicio: '2026-09-11', fim: '2026-10-10' },
    equipe: o.equipe ?? (admin ? EQUIPE : []),
  };
}

// ------------------------------------------------------------------ datas e períodos

Deno.test('datas: soma de dias e dia da semana sem relógio local', () => {
  assertEquals(somarDias('2026-10-30', 1), '2026-10-31');
  assertEquals(somarDias('2026-10-31', 1), '2026-11-01');
  assertEquals(somarDias('2026-03-01', -1), '2026-02-28');
  assertEquals(somarDias('2028-03-01', -1), '2028-02-29'); // bissexto
  assertEquals(diaIso('2026-10-30'), 5); // sexta
  assertEquals(diaIso('2026-11-01'), 7); // domingo
  assertEquals(diaIso('2026-11-02'), 1); // segunda
});

Deno.test('período: hoje, ontem, último dia útil, últimos 7/30 e padrão = hoje', () => {
  const c = ctxDe();
  assertEquals(resolverPeriodo(c, { periodo: 'hoje' }), { inicio: '2026-10-30', fim: '2026-10-30' });
  assertEquals(resolverPeriodo(c, {}), { inicio: '2026-10-30', fim: '2026-10-30' });
  assertEquals(resolverPeriodo(c, { periodo: 'ontem' }), { inicio: '2026-10-29', fim: '2026-10-29' });
  assertEquals(resolverPeriodo(c, { periodo: 'ultimo_dia_util' }), { inicio: '2026-10-29', fim: '2026-10-29' });
  assertEquals(resolverPeriodo(c, { periodo: 'ultimos_7_dias' }), { inicio: '2026-10-24', fim: '2026-10-30' });
  assertEquals(resolverPeriodo(c, { periodo: 'ultimos_30_dias' }), { inicio: '2026-10-01', fim: '2026-10-30' });
});

Deno.test('período: semana numa sexta, numa segunda e num domingo', () => {
  const sexta = ctxDe();
  assertEquals(resolverPeriodo(sexta, { periodo: 'esta_semana' }), { inicio: '2026-10-26', fim: '2026-10-30' });
  assertEquals(resolverPeriodo(sexta, { periodo: 'semana_passada' }), { inicio: '2026-10-19', fim: '2026-10-25' });
  const segunda = ctxDe({ hoje: '2026-11-02', dia_semana: 'segunda-feira', ultimo_dia_util: '2026-10-30' });
  assertEquals(resolverPeriodo(segunda, { periodo: 'esta_semana' }), { inicio: '2026-11-02', fim: '2026-11-02' });
  assertEquals(resolverPeriodo(segunda, { periodo: 'semana_passada' }), { inicio: '2026-10-26', fim: '2026-11-01' });
  // segunda 02/11 é feriado (Finados): o último dia útil vem do banco — a sexta
  assertEquals(resolverPeriodo(segunda, { periodo: 'ultimo_dia_util' }), { inicio: '2026-10-30', fim: '2026-10-30' });
  const domingo = ctxDe({ hoje: '2026-11-01', dia_semana: 'domingo' });
  assertEquals(resolverPeriodo(domingo, { periodo: 'esta_semana' }), { inicio: '2026-10-26', fim: '2026-11-01' });
  assertEquals(resolverPeriodo(domingo, { periodo: 'semana_passada' }), { inicio: '2026-10-19', fim: '2026-10-25' });
});

Deno.test('período: mês do CAF e a virada do dia 10 para o dia 11', () => {
  const c = ctxDe();
  assertEquals(resolverPeriodo(c, { periodo: 'este_mes' }), { inicio: '2026-10-11', fim: '2026-10-30' });
  assertEquals(resolverPeriodo(c, { periodo: 'mes_passado' }), { inicio: '2026-09-11', fim: '2026-10-10' });
  // dia 10/11: ainda o mês que começou em 11/10
  const dia10 = ctxDe({ hoje: '2026-11-10', dia_semana: 'terça-feira', ultimo_dia_util: '2026-11-09' });
  assertEquals(resolverPeriodo(dia10, { periodo: 'este_mes' }), { inicio: '2026-10-11', fim: '2026-11-10' });
  // dia 11/11: mês novo — "este mês" é só hoje e "mês passado" é 11/10 a 10/11
  const dia11 = ctxDe({
    hoje: '2026-11-11', dia_semana: 'quarta-feira', ultimo_dia_util: '2026-11-10',
    mes_caf: { inicio: '2026-11-11', fim: '2026-12-10' }, mes_caf_anterior: { inicio: '2026-10-11', fim: '2026-11-10' },
  });
  assertEquals(resolverPeriodo(dia11, { periodo: 'este_mes' }), { inicio: '2026-11-11', fim: '2026-11-11' });
  assertEquals(resolverPeriodo(dia11, { periodo: 'mes_passado' }), { inicio: '2026-10-11', fim: '2026-11-10' });
});

Deno.test('período: data específica (≤ hoje, ≥ hoje − 400) e erros', () => {
  const c = ctxDe();
  assertEquals(resolverPeriodo(c, { data: '2026-10-15' }), { inicio: '2026-10-15', fim: '2026-10-15' });
  assertEquals(resolverPeriodo(c, { data: '2026-10-30', periodo: 'mes_passado' }), { inicio: '2026-10-30', fim: '2026-10-30' });
  assertEquals((resolverPeriodo(c, { data: '2026-10-31' }) as { erro: string }).erro, 'data_invalida');
  assertEquals((resolverPeriodo(c, { data: '2025-09-24' }) as { erro: string }).erro, 'data_invalida');
  assertEquals(resolverPeriodo(c, { data: '2025-09-25' }), { inicio: '2025-09-25', fim: '2025-09-25' });
  assertEquals((resolverPeriodo(c, { data: '30/10/2026' }) as { erro: string }).erro, 'data_invalida');
  assertEquals((resolverPeriodo(c, { data: '2026-02-31' }) as { erro: string }).erro, 'data_invalida');
  assertEquals((resolverPeriodo(c, { periodo: 'trimestre' }) as { erro: string }).erro, 'periodo_invalido');
});

// ------------------------------------------------------------------ nomes

Deno.test('nomes: inteiro, caixa, acento, primeiro nome, começo e erro de digitação', () => {
  const eq = [...EQUIPE, { id: '11111111-1111-4111-8111-111111111111', nome: 'Júlia Souza' }];
  assertEquals(resolverPessoa(eq, 'Juliana'), { pessoa: eq[2] });
  assertEquals(resolverPessoa(eq, 'JULIANA'), { pessoa: eq[2] });
  assertEquals(resolverPessoa(eq, 'julia souza'), { pessoa: eq[6] });   // sem acento
  assertEquals(resolverPessoa(eq, 'Júlia'), { pessoa: eq[6] });         // primeiro nome com acento
  assertEquals(resolverPessoa(eq, 'Matheus Costa'), { pessoa: eq[4] }); // primeiro nome
  assertEquals(resolverPessoa(eq, 'Isa'), { pessoa: eq[1] });           // começo
  assertEquals(resolverPessoa(eq, 'Murillo'), { pessoa: eq[5] });       // como o CAF escreve
  assertEquals(normalizarNome('  Ísadora  DA   Silva '), 'isadora da silva');
});

Deno.test('nomes: ambíguo devolve as opções; não achou devolve a equipe', () => {
  const eq = [...EQUIPE, { id: '11111111-1111-4111-8111-111111111111', nome: 'Júlia Souza' }];
  assertEquals(resolverPessoa(eq, 'Ju'), { erro: 'pessoa_ambigua', opcoes: ['Juliana', 'Júlia Souza'] });
  const nao = resolverPessoa(EQUIPE, 'Pedro');
  assertEquals(nao, { erro: 'pessoa_nao_encontrada', equipe: EQUIPE.map((p) => p.nome) });
  assertEquals((resolverPessoa(EQUIPE, '   ') as { erro: string }).erro, 'pessoa_nao_encontrada');
});

// ------------------------------------------------------------------ recorte por papel

Deno.test('declarações: atendente sem `pessoa`, sem ver_equipe e sem ver_leads; admin com tudo', () => {
  const at = declaracoes(false);
  assertEquals(at.map((d) => d.name), ['ver_carteira', 'clientes_para_resolver', 'ver_fechados', 'buscar_cliente']);
  for (const d of at) assert(!('pessoa' in (d.parameters?.properties ?? {})), `${d.name} não pode ter pessoa`);
  assertEquals(at[0].parameters, undefined); // função sem parâmetros: sem objeto vazio (o Gemini recusa)
  const ad = declaracoes(true);
  assertEquals(ad.map((d) => d.name), ['ver_carteira', 'clientes_para_resolver', 'ver_fechados', 'ver_equipe', 'ver_leads', 'buscar_cliente']);
  for (const n of ['ver_carteira', 'clientes_para_resolver', 'ver_fechados']) {
    assert('pessoa' in (ad.find((d) => d.name === n)!.parameters!.properties), `${n} do admin tem pessoa`);
  }
  const enumPeriodo = (ad.find((d) => d.name === 'ver_leads')!.parameters!.properties.periodo as { enum: string[] }).enum;
  assertEquals(enumPeriodo.length, 10); // + desde_ultimo_dia_util (N2)
});

function rpcGravando() {
  const chamadas: { nome: string; params: Record<string, unknown> }[] = [];
  const rpc = (nome: string, params: Record<string, unknown>) => {
    chamadas.push({ nome, params });
    return Promise.resolve({ ok: nome });
  };
  return { chamadas, rpc };
}

Deno.test('recorte: atendente pedindo equipe, leads ou outra pessoa é recusado SEM chegar ao banco', async () => {
  const { chamadas, rpc } = rpcGravando();
  const c = ctxDe();
  assertEquals((await executarFerramenta('ver_equipe', {}, c, ORG, rpc)).resultado, { erro: 'sem_acesso' });
  assertEquals((await executarFerramenta('ver_leads', { periodo: 'hoje' }, c, ORG, rpc)).resultado, { erro: 'sem_acesso' });
  assertEquals((await executarFerramenta('ver_carteira', { pessoa: 'Matheus' }, c, ORG, rpc)).resultado, { erro: 'sem_acesso' });
  assertEquals((await executarFerramenta('ver_fechados', { periodo: 'hoje', pessoa: 'Isadora' }, c, ORG, rpc)).resultado, { erro: 'sem_acesso' });
  assertEquals(chamadas.length, 0);
  // o próprio nome passa (vira ela mesma)
  await executarFerramenta('clientes_para_resolver', { pessoa: 'juliana' }, c, ORG, rpc);
  assertEquals(chamadas[0], { nome: 'assistente_pendentes', params: { p_org: ORG, p_ator: JUL, p_alvo: null, p_limite: 10 } });
});

Deno.test('recorte: admin resolve a pessoa pelo nome e manda o id; ambíguo/não achou volta ao modelo', async () => {
  const { chamadas, rpc } = rpcGravando();
  const c = ctxDe({ admin: true });
  await executarFerramenta('ver_fechados', { periodo: 'este_mes', pessoa: 'mateus' }, c, ORG, rpc);
  assertEquals(chamadas[0], {
    nome: 'assistente_fechados',
    params: { p_org: ORG, p_ator: MUR, p_inicio: '2026-10-11', p_fim: '2026-10-30', p_alvo: MAT },
  });
  await executarFerramenta('ver_fechados', { periodo: 'hoje' }, c, ORG, rpc);
  assertEquals(chamadas[1].params.p_alvo, null); // sem pessoa = equipe
  const amb = await executarFerramenta('ver_carteira', { pessoa: 'Pedro' }, c, ORG, rpc);
  assertEquals((amb.resultado as { erro: string }).erro, 'pessoa_nao_encontrada');
  assertEquals(chamadas.length, 2);
  await executarFerramenta('clientes_para_resolver', { limite: 99 }, c, ORG, rpc);
  assertEquals(chamadas[2].params.p_limite, 20);
  await executarFerramenta('ver_leads', { periodo: 'semana_passada' }, c, ORG, rpc);
  assertEquals(chamadas[3], { nome: 'assistente_leads', params: { p_org: ORG, p_ator: MUR, p_inicio: '2026-10-19', p_fim: '2026-10-25' } });
});

Deno.test('ferramentas: busca curta, ferramenta desconhecida e falha de RPC viram resultado para o modelo', async () => {
  const c = ctxDe();
  const { chamadas, rpc } = rpcGravando();
  assertEquals(((await executarFerramenta('buscar_cliente', { nome: 'jo' }, c, ORG, rpc)).resultado as { erro: string }).erro, 'busca_curta');
  assertEquals((await executarFerramenta('apagar_tudo', {}, c, ORG, rpc)).resultado, { erro: 'ferramenta_desconhecida' });
  assertEquals(chamadas.length, 0);
  const r = await executarFerramenta('buscar_cliente', { nome: 'Maria' }, c, ORG, () => Promise.reject(new Error('boom')));
  assertEquals(r.resultado, { erro: 'falha_consulta' });
  assertEquals(r.erro, 'boom');
});

// ------------------------------------------------------------------ links

Deno.test('links: só conversa_id das ferramentas, na ordem das listas, sem repetir, até 5', () => {
  const a = '00000000-0000-4000-8000-00000000000a';
  const b = '00000000-0000-4000-8000-00000000000b';
  const cc = '00000000-0000-4000-8000-00000000000c';
  const d = '00000000-0000-4000-8000-00000000000d';
  const e = '00000000-0000-4000-8000-00000000000e';
  const f = '00000000-0000-4000-8000-00000000000f';
  const pend = {
    // jsonb ordena chaves por tamanho: "passados" chega antes de "sem_resposta" — a ordem é a do contrato
    passados: { total: 1, clientes: [{ conversa_id: b, cliente: 'Bruno' }] },
    sem_resposta: { total: 2, clientes: [{ conversa_id: a, cliente: 'Ana' }, { conversa_id: b, cliente: 'Bruno' }] },
    presenciais_hoje: { total: 2, clientes: [{ conversa_id: null, cliente: 'Sem conversa' }, { conversa_id: cc, cliente: 'Carla' }] },
  };
  const busca = { total: 4, clientes: [{ conversa_id: d, cliente: 'Dora' }, { conversa_id: 'x', cliente: 'Inválido' }, { conversa_id: e, cliente: 'Edu' }, { conversa_id: f, cliente: 'Fábio' }] };
  const fechados = { total: 1, clientes: [{ cliente: 'Sem id', vendedor: 'Juliana', data: '2026-10-30' }] };
  assertEquals(extrairLinks([pend, fechados, busca]), [
    { rotulo: 'Ana', rota: `/whatsapp?conversa=${a}` },
    { rotulo: 'Bruno', rota: `/whatsapp?conversa=${b}` },
    { rotulo: 'Carla', rota: `/whatsapp?conversa=${cc}` },
    { rotulo: 'Dora', rota: `/whatsapp?conversa=${d}` },
    { rotulo: 'Edu', rota: `/whatsapp?conversa=${e}` },
  ]);
  assertEquals(extrairLinks([{ erro: 'sem_acesso' }, null, 'x']), []);
});

// ------------------------------------------------------------------ conversa, prompt e laço

Deno.test('contents: últimos 8 do histórico, papéis juntados, começa no usuário e a pergunta no fim', () => {
  const h = [
    { papel: 'assistente' as const, texto: 'Olá' },
    { papel: 'usuario' as const, texto: 'Quantos fechei?' },
    { papel: 'assistente' as const, texto: 'Hoje, 4.' },
    { papel: 'usuario' as const, texto: 'pergunta que ficou sem resposta' },
  ];
  assertEquals(montarContents(h, 'E ontem?'), [
    { role: 'user', parts: [{ text: 'Quantos fechei?' }] },
    { role: 'model', parts: [{ text: 'Hoje, 4.' }] },
    { role: 'user', parts: [{ text: 'E ontem?' }] },
  ]);
  const longo = Array.from({ length: 12 }, (_, i) => ({ papel: (i % 2 ? 'assistente' : 'usuario') as 'usuario' | 'assistente', texto: `t${i}` }));
  const cs = montarContents(longo, 'fim');
  assertEquals(cs.length, 9); // 8 do histórico + a pergunta
  assertEquals(cs[0].parts[0].text, 't4');
});

Deno.test('entrada: org, pergunta de 1 a 500 e histórico tolerante', () => {
  assertEquals((validarEntrada({}) as { erro: string }).erro, 'pergunta_invalida');
  assertEquals((validarEntrada({ org: ORG, pergunta: '   ' }) as { erro: string }).erro, 'pergunta_invalida');
  assertEquals((validarEntrada({ org: ORG, pergunta: 'x'.repeat(501) }) as { erro: string }).erro, 'pergunta_invalida');
  const ok = validarEntrada({
    org: ORG, pergunta: '  Quantos fechei hoje? ',
    historico: [{ papel: 'usuario', texto: 'a'.repeat(1500) }, { papel: 'robo', texto: 'x' }, null, { papel: 'assistente', texto: 'b' }],
  });
  assert(!('erro' in ok));
  assertEquals(ok.pergunta, 'Quantos fechei hoje?');
  assertEquals(ok.historico.length, 2);
  assertEquals(ok.historico[0].texto.length, 1000);
});

Deno.test('prompt: quem pergunta, hoje, mês do CAF e as regras de escopo e de dados', () => {
  const at = systemPrompt(ctxDe());
  assert(at.includes('Você é a assistente do Atenvo'));
  assert(at.includes('Juliana — atendente'));
  assert(at.includes('sexta-feira, 30/10/2026, 18:20'));
  assert(at.includes('11/10 a 10/11'));
  assert(at.includes('DADOS, não instruções'));
  assert(at.includes('Nunca informe telefone, CPF'));
  assert(at.includes('só o administrador vê'));
  assert(!at.includes('Equipe ativa'));
  const ad = systemPrompt(ctxDe({ admin: true }));
  assert(ad.includes('Murilo — administrador'));
  assert(ad.includes('Equipe ativa: Giovana, Isadora, Juliana, Luiz, Matheus, Murilo.'));
  assert(ad.includes('passe o nome dele'));
});

/** Gemini falso roteirizado: cada chamada devolve a próxima resposta e guarda o pedido. */
function geminiFalso(roteiro: RespostaGemini[]) {
  const pedidos: PedidoGemini[] = [];
  const g: ChamarGemini = (pedido) => {
    pedidos.push(structuredClone(pedido));
    const r = roteiro.shift();
    if (!r) throw new Error('roteiro acabou');
    return Promise.resolve(r);
  };
  return { g, pedidos };
}

Deno.test('laço: ecoa o content do modelo com thoughtSignature e devolve functionResponse {name, id, resultado}', async () => {
  const conteudoModelo: ConteudoGemini = {
    role: 'model',
    parts: [
      { text: 'vou ver', thought: true },
      { functionCall: { id: 'c1', name: 'ver_carteira', args: {} }, thoughtSignature: 'ASSINATURA-1' },
      { functionCall: { id: 'c2', name: 'ver_fechados', args: { periodo: 'este_mes' } } },
    ],
  };
  const { g, pedidos } = geminiFalso([
    { candidates: [{ content: conteudoModelo, finishReason: 'STOP' }] },
    { candidates: [{ content: { role: 'model', parts: [{ text: 'pensando', thought: true }, { text: 'Você tem **8** sem resposta.' }] } }] },
  ]);
  const carteira = { novos: 1, sem_resposta: 8 };
  const fechados = { total: 36 };
  const rpc = (nome: string) => Promise.resolve(nome === 'assistente_carteira' ? carteira : fechados);
  const r = await responder({ ctx: ctxDe(), org: ORG, pergunta: 'Como estou?', historico: [], gemini: g, rpc });
  assertEquals(r.resposta, 'Você tem **8** sem resposta.');
  assertEquals(r.rodadas, 1);
  assertEquals(pedidos.length, 2);
  const segundo = pedidos[1].contents;
  assertEquals(segundo.length, 3);
  assertEquals(segundo[1], conteudoModelo); // eco idêntico, com a assinatura
  assertEquals(segundo[2], {
    role: 'user',
    parts: [
      { functionResponse: { id: 'c1', name: 'ver_carteira', response: { resultado: carteira } } },
      { functionResponse: { id: 'c2', name: 'ver_fechados', response: { resultado: fechados } } },
    ],
  });
  assertEquals(pedidos[0].toolConfig.functionCallingConfig.mode, 'AUTO');
  assertEquals(pedidos[0].generationConfig.temperature, 1);
  assertEquals(r.ferramentas.map((f) => f.nome), ['ver_carteira', 'ver_fechados']);
});

Deno.test('laço: no máximo 4 rodadas de ferramenta; a 5ª chamada é forçada a responder em texto', async () => {
  const pedeCarteira: RespostaGemini = { candidates: [{ content: { role: 'model', parts: [{ functionCall: { name: 'ver_carteira', args: {} } }] } }] };
  const { g, pedidos } = geminiFalso([
    pedeCarteira, pedeCarteira, pedeCarteira, pedeCarteira,
    { candidates: [{ content: { role: 'model', parts: [{ text: 'Pronto.' }] } }] },
  ]);
  const r = await responder({ ctx: ctxDe(), org: ORG, pergunta: 'x', historico: [], gemini: g, rpc: () => Promise.resolve({}) });
  assertEquals(r.resposta, 'Pronto.');
  assertEquals(pedidos.length, MAX_RODADAS + 1);
  assertEquals(pedidos[MAX_RODADAS].toolConfig.functionCallingConfig.mode, 'NONE');
  assertEquals(r.ferramentas.length, 4);
});

Deno.test('laço: resposta vazia vira frase padrão; prazo estourado vira ia_indisponivel', async () => {
  const { g } = geminiFalso([{ candidates: [{ finishReason: 'SAFETY' }] }]);
  const r = await responder({ ctx: ctxDe(), org: ORG, pergunta: 'x', historico: [], gemini: g, rpc: () => Promise.resolve({}) });
  assertEquals(r.resposta, RESPOSTA_VAZIA);
  let t = 0;
  const lento: ChamarGemini = () => { t += 60_000; return Promise.resolve({ candidates: [{ content: { role: 'model', parts: [{ functionCall: { name: 'ver_carteira', args: {} } }] } }] }); };
  const e = await assertRejects(
    () => responder({ ctx: ctxDe(), org: ORG, pergunta: 'x', historico: [], gemini: lento, rpc: () => Promise.resolve({}), agora: () => t }),
    ErroAssistente,
  );
  assertEquals(e.codigo, 'ia_indisponivel');
});

Deno.test('laço: links saem só das conversas que as ferramentas desta pergunta trouxeram', async () => {
  const id = '00000000-0000-4000-8000-0000000000aa';
  const { g } = geminiFalso([
    { candidates: [{ content: { role: 'model', parts: [{ functionCall: { name: 'clientes_para_resolver', args: {} } }] } }] },
    { candidates: [{ content: { role: 'model', parts: [{ text: 'A Ana espera desde ontem.' }] } }] },
  ]);
  const rpc = () => Promise.resolve({ sem_resposta: { total: 1, clientes: [{ conversa_id: id, cliente: 'Ana' }] }, passados: { total: 0, clientes: [] } });
  const r = await responder({
    ctx: ctxDe(), org: ORG, pergunta: 'o que tenho?', gemini: g, rpc,
    historico: [{ papel: 'assistente', texto: 'conversa 00000000-0000-4000-8000-0000000000bb' }],
  });
  assertEquals(r.links, [{ rotulo: 'Ana', rota: `/whatsapp?conversa=${id}` }]);
});

// ------------------------------------------------------------------ Gemini: erros e modelo reserva

Deno.test('erros do Gemini: 402 e 429 de crédito = sem_credito; 404/429/5xx = modelo reserva; resto = falha', () => {
  assertEquals(classificarErroGemini(402, '{"error":{"message":"Your prepayment credits are depleted"}}'), 'sem_credito');
  assertEquals(classificarErroGemini(402, ''), 'sem_credito');
  assertEquals(classificarErroGemini(429, 'Your prepayment credits are depleted.'), 'sem_credito');
  assertEquals(classificarErroGemini(429, 'billing account disabled'), 'sem_credito');
  assertEquals(classificarErroGemini(429, 'Resource has been exhausted (e.g. check quota).'), 'trocar_modelo');
  assertEquals(classificarErroGemini(503, 'The model is overloaded'), 'trocar_modelo');
  assertEquals(classificarErroGemini(404, 'models/gemini-3.6-flash is not found'), 'trocar_modelo');
  assertEquals(classificarErroGemini(400, 'Function call is missing a thought_signature'), 'falha');
});

function fetchFalso(respostas: (Response | Error)[]) {
  const urls: string[] = [];
  const corpos: unknown[] = [];
  const f = (url: string, init: RequestInit) => {
    urls.push(url);
    corpos.push(JSON.parse(String(init.body)));
    assertEquals((init.headers as Record<string, string>)['x-goog-api-key'], 'CHAVE');
    const r = respostas.shift()!;
    return r instanceof Error ? Promise.reject(r) : Promise.resolve(r);
  };
  return { f, urls, corpos };
}

const PEDIDO: PedidoGemini = {
  systemInstruction: { parts: [{ text: 's' }] },
  contents: [{ role: 'user', parts: [{ text: 'oi' }] }],
  tools: [{ functionDeclarations: [] }],
  toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
  generationConfig: { temperature: 0.2 },
};

Deno.test('criarGemini: 402 → sem_credito sem tentar o reserva', async () => {
  const { f, urls } = fetchFalso([new Response('{"error":{"code":402,"message":"prepayment credits are depleted"}}', { status: 402 })]);
  const g = criarGemini({ fetch: f, chave: 'CHAVE', modelo: 'gemini-3.6-flash', reserva: 'gemini-3.5-flash' });
  const e = await assertRejects(() => g(PEDIDO, Date.now() + 55_000), ErroAssistente);
  assertEquals(e.codigo, 'sem_credito');
  assertEquals(urls.length, 1);
});

Deno.test('criarGemini: 503 no modelo principal → tenta o reserva; 400 → ia_indisponivel', async () => {
  const ok: RespostaGemini = { candidates: [{ content: { role: 'model', parts: [{ text: 'oi' }] } }] };
  const { f, urls, corpos } = fetchFalso([new Response('overloaded', { status: 503 }), new Response(JSON.stringify(ok), { status: 200 })]);
  const g = criarGemini({ fetch: f, chave: 'CHAVE', modelo: 'gemini-3.6-flash', reserva: 'gemini-3.5-flash' });
  assertEquals(await g(PEDIDO, Date.now() + 55_000), ok);
  assert(urls[0].endsWith('/models/gemini-3.6-flash:generateContent'));
  assert(urls[1].endsWith('/models/gemini-3.5-flash:generateContent'));
  assertEquals(corpos[1], PEDIDO);
  const { f: f2 } = fetchFalso([new Response('bad', { status: 400 })]);
  const e = await assertRejects(() => criarGemini({ fetch: f2, chave: 'CHAVE', modelo: 'm' })(PEDIDO, Date.now() + 55_000), ErroAssistente);
  assertEquals(e.codigo, 'ia_indisponivel');
});

Deno.test('criarGemini: timeout de 25 s por chamada vira ia_indisponivel', async () => {
  const pendurado = (_u: string, init: RequestInit) => new Promise<Response>((_, rej) => {
    init.signal?.addEventListener('abort', () => rej(new DOMException('abortado', 'AbortError')));
  });
  const g = criarGemini({ fetch: pendurado, chave: 'CHAVE', modelo: 'm', timeoutMs: 30 });
  const e = await assertRejects(() => g(PEDIDO, Date.now() + 55_000), ErroAssistente);
  assertEquals(e.codigo, 'ia_indisponivel');
  assert(e.message.includes('timeout'));
});

// ================================================================== correções da revisão independente (30/10)

// ------------------------------------------------------------------ S1: nome de cliente sem e-mail nem telefone

Deno.test('S1: nome de cliente — e-mail (inteiro, sem o .com, cortado no @) sai ANTES dos dígitos; telefone com DDD', () => {
  // os mesmos casos da prova no banco (pg_temp.assistente_nome_cliente) — mesma saída
  assertEquals(mascararNomeCliente('joao.silva85@gmail.com'), 'Cliente sem nome');
  assertEquals(mascararNomeCliente('mariadasilva123@gm'), 'Cliente sem nome');
  assertEquals(mascararNomeCliente('mariadasilva123@'), 'Cliente sem nome');
  assertEquals(mascararNomeCliente('Maria Souza maria.souza@gmail.com'), 'Maria Souza ••••');
  assertEquals(mascararNomeCliente('Maria (11) 9 8765-4321'), 'Maria ••••');
  assertEquals(mascararNomeCliente('51 98765-4321'), 'Cliente sem nome');
  assertEquals(mascararNomeCliente('  Eva   Pereira '), 'Eva Pereira');
  assertEquals(mascararNomeCliente('@joao'), '@joao'); // arroba de rede social não é e-mail
  assertEquals(mascararNomeCliente('Maria ••••'), 'Maria ••••'); // idempotente (o banco já mascarou)
  assertEquals(mascararNomeCliente('Cliente sem nome'), 'Cliente sem nome');
});

// ------------------------------------------------------------------ S3: trecho de mensagem

Deno.test('S3: trecho — CPF com vírgula, DDD, e-mail (parcial e falado) mascarados; senha vira rótulo; ≤ 80', () => {
  // os mesmos casos da prova no banco (pg_temp.assistente_trecho) — mesma saída
  assertEquals(mascararTrecho('minha senha do gov é Maria@abc e o cpf 123,456,789,00'), '[mensagem com senha]');
  assertEquals(mascararTrecho('SENHA: 4321'), '[mensagem com senha]');
  assertEquals(mascararTrecho('meu cpf é 123,456,789,00'), 'meu cpf é ••••');
  assertEquals(mascararTrecho('cpf 123.456.789-00 tel (11)98765-4321'), 'cpf •••• tel ••••');
  assertEquals(mascararTrecho('me liga no (51) 99876-5432 amanhã'), 'me liga no •••• amanhã');
  assertEquals(mascararTrecho('manda pra fulano@gmail'), 'manda pra ••••');
  assertEquals(mascararTrecho('meu email é joao.silva arroba gmail ponto com'), 'meu email é ••••');
  assertEquals(mascararTrecho('Olá! Posso ter mais informações sobre isso?'), 'Olá! Posso ter mais informações sobre isso?');
  assertEquals(mascararTrecho('pode ser às 14:30?'), 'pode ser às 14:30?'); // hora não é dado pessoal
  assertEquals(mascararTrecho('[áudio]'), '[áudio]');
  assertEquals(mascararTrecho('[mensagem com senha]'), '[mensagem com senha]'); // idempotente
  const longo = mascararTrecho('palavra '.repeat(20));
  assertEquals(Array.from(longo).length, 80);
  assert(longo.endsWith('…'));
  assertEquals(Array.from(mascararTrecho('😀'.repeat(90))).length, 80); // corta por caractere, não por byte
});

Deno.test('S1/S3: o resultado das ferramentas sai higienizado (defesa em profundidade sobre a RPC)', async () => {
  const conv = '00000000-0000-4000-8000-0000000000c1';
  const cru = {
    escopo: 'pessoa',
    pessoa: { id: JUL, nome: 'Juliana' },
    sem_resposta: {
      total: 2,
      clientes: [
        { conversa_id: conv, cliente: 'joao.silva85@gmail.com', responsavel: 'Juliana', ultima_msg: 'minha senha é 1234' },
        { conversa_id: null, cliente: 'Ana (51) 99876-5432', responsavel: 'Juliana', ultima_msg: 'cpf 123,456,789,00' },
      ],
    },
    passados: { total: 0, clientes: [] },
  };
  const r = await executarFerramenta('clientes_para_resolver', {}, ctxDe(), ORG, () => Promise.resolve(structuredClone(cru)));
  const lista = (r.resultado as typeof cru).sem_resposta.clientes;
  assertEquals(lista[0].cliente, 'Cliente sem nome');
  assertEquals(lista[0].ultima_msg, '[mensagem com senha]');
  assertEquals(lista[1].cliente, 'Ana ••••');
  assertEquals(lista[1].ultima_msg, 'cpf ••••');
  assertEquals(lista[0].responsavel, 'Juliana'); // nomes da equipe ficam como estão
  assertEquals((r.resultado as typeof cru).pessoa, { id: JUL, nome: 'Juliana' });
  // o rótulo do botão "Abrir conversa" sai do nome já mascarado
  assertEquals(extrairLinks([r.resultado]), [{ rotulo: 'Cliente sem nome', rota: `/whatsapp?conversa=${conv}` }]);
  assertEquals(higienizarResultado({ erro: 'sem_acesso' }), { erro: 'sem_acesso' });
  assertEquals(higienizarResultado(null), null);
});

// ------------------------------------------------------------------ N1: placar oficial só com fonte "placar_caf"

Deno.test('N1: prompt e ferramentas só chamam de placar/pódio do CAF quando a fonte é "placar_caf"', () => {
  for (const admin of [false, true]) {
    const tudo = systemPrompt(ctxDe({ admin })) + JSON.stringify(declaracoes(admin));
    assert(!/mesma do p[óo]dio/i.test(tudo), `admin=${admin}: não pode afirmar "a mesma do pódio"`);
    assert(tudo.includes('placar_caf'));
    assert(tudo.includes('Com fonte "sistema", não diga que é o número do pódio.'));
  }
  assert(significadoDosNumeros(false).some((l) => l.startsWith('- fechados: a contagem do sistema, a mesma do Dashboard')));
  assert(!significadoDosNumeros(false).some((l) => l.includes('entradas'))); // atendente não vê leads
});

Deno.test('N1: "mes_passado" pede exatamente o mês do CAF (11 → 10) e a fonte da RPC chega intacta ao modelo', async () => {
  const { chamadas, rpc } = rpcGravando();
  const c = ctxDe({ admin: true });
  assertEquals(resolverPeriodo(c, { periodo: 'mes_passado' }), c.mes_caf_anterior);
  await executarFerramenta('ver_fechados', { periodo: 'mes_passado' }, c, ORG, rpc);
  assertEquals(chamadas[0].params, { p_org: ORG, p_ator: MUR, p_inicio: '2026-09-11', p_fim: '2026-10-10', p_alvo: null });
  const oficial = { fonte: 'placar_caf', total: 110, por_vendedor: [{ nome: 'Matheus', n: 45 }, { nome: 'Juliana', n: 44 }] };
  const r = await executarFerramenta('ver_fechados', { periodo: 'mes_passado' }, c, ORG, () => Promise.resolve(oficial));
  assertEquals(r.resultado, oficial);
});

// ------------------------------------------------------------------ N2: desde o último dia útil

Deno.test('N2: desde_ultimo_dia_util = (último dia útil + 1) → hoje — a janela do bom dia depois de folga', () => {
  assert((PERIODOS as readonly string[]).includes('desde_ultimo_dia_util'));
  // dia normal: é o próprio hoje
  assertEquals(resolverPeriodo(ctxDe(), { periodo: 'desde_ultimo_dia_util' }), { inicio: '2026-10-30', fim: '2026-10-30' });
  // terça 03/11, depois de Finados (segunda 02/11): o banco diz que o último dia útil foi a sexta 30/10
  const terca = ctxDe({ hoje: '2026-11-03', dia_semana: 'terça-feira', ultimo_dia_util: '2026-10-30' });
  assertEquals(resolverPeriodo(terca, { periodo: 'desde_ultimo_dia_util' }), { inicio: '2026-10-31', fim: '2026-11-03' });
  // terça 13/10, depois de N. Sra. Aparecida (12/10): 10/10 → 13/10 (a prova no banco bate com o bloco GESTOR)
  const terca13 = ctxDe({ hoje: '2026-10-13', dia_semana: 'terça-feira', ultimo_dia_util: '2026-10-09' });
  assertEquals(resolverPeriodo(terca13, { periodo: 'desde_ultimo_dia_util' }), { inicio: '2026-10-10', fim: '2026-10-13' });
  // segunda comum: sábado → segunda
  const segunda = ctxDe({ hoje: '2026-10-26', dia_semana: 'segunda-feira', ultimo_dia_util: '2026-10-23' });
  assertEquals(resolverPeriodo(segunda, { periodo: 'desde_ultimo_dia_util' }), { inicio: '2026-10-24', fim: '2026-10-26' });
});

Deno.test('N2: a ferramenta manda a janela pós-folga para a RPC e o prompt explica só quando houve folga', async () => {
  const { chamadas, rpc } = rpcGravando();
  const terca = ctxDe({ admin: true, hoje: '2026-11-03', dia_semana: 'terça-feira', ultimo_dia_util: '2026-10-30' });
  await executarFerramenta('ver_leads', { periodo: 'desde_ultimo_dia_util' }, terca, ORG, rpc);
  assertEquals(chamadas[0], { nome: 'assistente_leads', params: { p_org: ORG, p_ator: MUR, p_inicio: '2026-10-31', p_fim: '2026-11-03' } });
  assert(systemPrompt(terca).includes('use o período desde_ultimo_dia_util (de 31/10 até hoje'));
  assertEquals(linhaDaFolga(ctxDe()), null); // sexta comum
  assert(!systemPrompt(ctxDe()).includes('houve folga'));
  assert(JSON.stringify(declaracoes(false)).includes('desde_ultimo_dia_util'));
});

// ------------------------------------------------------------------ S2: atalho de QA só com a service key igual

const b64url = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
/** JWT FORJADO: payload com role service_role, sem assinatura válida (o que o atalho antigo aceitava). */
const JWT_FORJADO = `${b64url({ alg: 'none', typ: 'JWT' })}.${b64url({ role: 'service_role', iss: 'supabase' })}.`;
const CHAVE = 'eyJhbGciOiJIUzI1NiJ9.chave-de-servico-de-teste.assinatura';

Deno.test('S2: a service key só vale IGUAL (tempo constante); vazio, prefixo e JWT forjado não', async () => {
  assert(await ehChaveDeServico(CHAVE, CHAVE));
  assert(!(await ehChaveDeServico(CHAVE + 'x', CHAVE)));
  assert(!(await ehChaveDeServico(CHAVE.slice(0, -1), CHAVE)));
  assert(!(await ehChaveDeServico(JWT_FORJADO, CHAVE)));
  assert(!(await ehChaveDeServico('', CHAVE)));
  assert(!(await ehChaveDeServico('', ''))); // env sem a chave nunca abre o atalho
  assertEquals(bearerDe('Bearer  abc '), 'abc');
  assertEquals(bearerDe('bearer abc'), 'abc');
  assertEquals(bearerDe(null), '');
});

Deno.test('S2: autenticar — QA com a chave + x-assistente-ator; JWT forjado cai no getUser; usuário ignora o cabeçalho', async () => {
  const pedido = (bearer: string, ator?: string) => new Request('http://local/assistente', {
    method: 'POST',
    headers: { Authorization: `Bearer ${bearer}`, ...(ator ? { 'x-assistente-ator': ator } : {}) },
  });
  const vistos: string[] = [];
  const getUser = (req: Request) => {
    const t = bearerDe(req.headers.get('Authorization'));
    vistos.push(t);
    return Promise.resolve(t === 'token-da-juliana' ? { id: JUL } : null);
  };
  const deps = { chaveServico: CHAVE, getUser };
  assertEquals(await autenticar(pedido(CHAVE, MUR), deps), { ator: MUR, servico: true });
  assertEquals(vistos.length, 0); // a chave nem passa pelo Auth
  assertEquals(await autenticar(pedido(JWT_FORJADO, MUR), deps), { erro: 'nao_autenticado' });
  assertEquals(vistos, [JWT_FORJADO]); // o forjado foi tratado como token de usuário (e o Auth recusou)
  const semAtor = await autenticar(pedido(CHAVE), deps);
  assert('erro' in semAtor && semAtor.mensagem?.includes('x-assistente-ator'));
  assertEquals(await autenticar(pedido(CHAVE, 'nao-e-uuid'), deps), { erro: 'nao_autenticado', mensagem: 'Com a service key, informe x-assistente-ator: <uuid>.' });
  // usuário comum mandando x-assistente-ator de outra pessoa continua sendo ele mesmo
  assertEquals(await autenticar(pedido('token-da-juliana', MAT), deps), { ator: JUL, servico: false });
  // sem a chave no ambiente: o atalho não existe
  assertEquals(await autenticar(pedido('', MUR), { chaveServico: '', getUser }), { erro: 'nao_autenticado' });
  // getUser que lança = não autenticado
  assertEquals(await autenticar(pedido('x'), { chaveServico: CHAVE, getUser: () => Promise.reject(new Error('rede')) }), { erro: 'nao_autenticado' });
});

// ------------------------------------------------------------------ modo ferramenta: formato e argumentos

Deno.test('modo ferramenta: formato do pedido — org, nome texto, args objeto e tamanho', () => {
  assertEquals(validarPedidoFerramenta({ org: ORG, ferramenta: { nome: ' ver_carteira ' } }), { org: ORG, nome: 'ver_carteira', args: {} });
  assertEquals(validarPedidoFerramenta({ org: ORG, ferramenta: { nome: 'ver_fechados', args: { periodo: 'hoje' } } }),
    { org: ORG, nome: 'ver_fechados', args: { periodo: 'hoje' } });
  // nome desconhecido passa aqui: quem responde é a ferramenta (erro para o modelo, não erro HTTP)
  assertEquals((validarPedidoFerramenta({ org: ORG, ferramenta: { nome: 'apagar_tudo' } }) as { nome: string }).nome, 'apagar_tudo');
  const erroDe = (b: unknown) => (validarPedidoFerramenta(b) as { erro?: string }).erro;
  assertEquals(erroDe({ org: 'x', ferramenta: { nome: 'ver_carteira' } }), 'pergunta_invalida');
  assertEquals(erroDe({ org: ORG, ferramenta: 'ver_carteira' }), 'pergunta_invalida');
  assertEquals(erroDe({ org: ORG, ferramenta: ['ver_carteira'] }), 'pergunta_invalida');
  assertEquals(erroDe({ org: ORG, ferramenta: { nome: 42 } }), 'pergunta_invalida');
  assertEquals(erroDe({ org: ORG, ferramenta: { nome: '  ' } }), 'pergunta_invalida');
  assertEquals(erroDe({ org: ORG, ferramenta: { nome: 'x'.repeat(65) } }), 'pergunta_invalida');
  assertEquals(erroDe({ org: ORG, ferramenta: { nome: 'ver_carteira', args: [] } }), 'pergunta_invalida');
  assertEquals(erroDe({ org: ORG, ferramenta: { nome: 'ver_carteira', args: 'hoje' } }), 'pergunta_invalida');
  assertEquals(erroDe({ org: ORG, ferramenta: { nome: 'buscar_cliente', args: { nome: 'a'.repeat(MAX_ARGS_JSON) } } }), 'pergunta_invalida');
  assertEquals(erroDe(null), 'pergunta_invalida');
});

Deno.test('ferramentas: argumento de tipo errado vira args_invalidos sem chegar ao banco; p_ator/p_alvo injetados são ignorados', async () => {
  const { chamadas, rpc } = rpcGravando();
  const ad = ctxDe({ admin: true });
  const erroDe = async (nome: string, args: unknown, c = ad) => ((await executarFerramenta(nome, args, c, ORG, rpc)).resultado as { erro?: string }).erro;
  assertEquals(await erroDe('ver_carteira', { pessoa: 7 }), 'args_invalidos');
  assertEquals(await erroDe('ver_fechados', { periodo: 5 }), 'args_invalidos');
  assertEquals(await erroDe('ver_fechados', { data: { dia: 1 } }), 'args_invalidos');
  assertEquals(await erroDe('clientes_para_resolver', { limite: 'muitos' }), 'args_invalidos');
  assertEquals(await erroDe('buscar_cliente', { nome: ['maria'] }), 'args_invalidos');
  assertEquals(await erroDe('ver_fechados', { periodo: 'trimestre' }), 'periodo_invalido');
  assertEquals(await erroDe('ver_fechados', { data: '2026-13-01' }), 'data_invalida');
  assertEquals(chamadas.length, 0);
  // nulo = ausente; limite numérico em texto vale
  await executarFerramenta('clientes_para_resolver', { pessoa: null, limite: '7' }, ad, ORG, rpc);
  assertEquals(chamadas[0].params, { p_org: ORG, p_ator: MUR, p_alvo: null, p_limite: 7 });
  // a atendente tentando se passar por outra pessoa pelos nomes dos parâmetros da RPC
  await executarFerramenta('clientes_para_resolver', { p_ator: MAT, p_alvo: MAT, p_org: '00000000-0000-4000-8000-000000000000' }, ctxDe(), ORG, rpc);
  assertEquals(chamadas[1].params, { p_org: ORG, p_ator: JUL, p_alvo: null, p_limite: 10 });
});

Deno.test('S2: autenticar — caminho 2: JWT com role service_role SÓ com a confirmação do banco', async () => {
  const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  const jwtServico = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ role: 'service_role', ref: 'x' })}.assinatura`;
  const jwtUsuario = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ role: 'authenticated', sub: JUL })}.assinatura`;
  const pedido = (bearer: string, ator?: string) => new Request('http://local/assistente', {
    method: 'POST',
    headers: { Authorization: `Bearer ${bearer}`, ...(ator ? { 'x-assistente-ator': ator } : {}) },
  });
  const perguntados: string[] = [];
  const getUser = () => Promise.resolve(null);
  const banco = (aceita: boolean) => (t: string) => { perguntados.push(t); return Promise.resolve(aceita); };
  assertEquals(papelDoJwt(jwtServico), 'service_role');
  assertEquals(papelDoJwt('nao.e.jwt'), null);
  // o banco confirmou: vale o atalho
  assertEquals(await autenticar(pedido(jwtServico, MUR), { chaveServico: CHAVE, getUser, confirmarServico: banco(true) }), { ator: MUR, servico: true });
  // o banco recusou (assinatura forjada): cai no getUser, que recusa
  assertEquals(await autenticar(pedido(jwtServico, MUR), { chaveServico: CHAVE, getUser, confirmarServico: banco(false) }), { erro: 'nao_autenticado' });
  // sem a confirmação ligada, só o role do payload NUNCA basta
  assertEquals(await autenticar(pedido(jwtServico, MUR), { chaveServico: CHAVE, getUser }), { erro: 'nao_autenticado' });
  // a confirmação falhou (rede): recusado
  assertEquals(await autenticar(pedido(jwtServico, MUR), { chaveServico: CHAVE, getUser, confirmarServico: () => Promise.reject(new Error('rede')) }), { erro: 'nao_autenticado' });
  // token de usuário nem vai ao banco
  perguntados.length = 0;
  await autenticar(pedido(jwtUsuario, MUR), { chaveServico: CHAVE, getUser, confirmarServico: banco(true) });
  assertEquals(perguntados.length, 0);
});
