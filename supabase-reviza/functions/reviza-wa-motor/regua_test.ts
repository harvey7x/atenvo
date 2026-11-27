// deno test supabase-reviza/functions/reviza-wa-motor/regua_test.ts
import { assertEquals, assertThrows } from 'jsr:@std/assert@1';
import {
  aplicarVars, candidatosTel, chaveTel, comportamentoPor, dataDoCabecalho, dataDoPasso, datasDaGestao, devidosClienteNoDia, devidosNoDia,
  diaCobrado, marcarCobrado, aplicarVersao, versoesPor,
  diaPermitido, erroPassageiro, mensagemLegivel, nomeBonito, normNome, textoVencimento, vencPadrao,
  type LeadR, type MsgR,
} from './regua.ts';

const lead = (id: string, dia: number, extra: Partial<LeadR> = {}): LeadR =>
  ({ id, nome: `Cliente ${id}`, comercial: 'EDUARDO', dia, telefone: '51993227097', dia_alterado_em: null, valor: 354.52, ...extra });
const msg = (id: string, quando: number, extra: Partial<MsgR> = {}): MsgR =>
  ({ id, alvo: 'padrao', nome: id, quando, blocos: [{ tipo: 'texto', corpo: 'oi' }], criterio: null, cli_id: null, data_envio: null, ...extra });
const SEQ = [msg('lembrete', -3), msg('dia', 0), msg('atraso', 2), msg('retomada', 7)];
const semManual = new Map<number, Map<string, string>>();

Deno.test('telefone: todas as grafias viram a mesma chave (= wa_tel_chave do banco)', () => {
  for (const t of ['51993227097', '555193227097', '5551993227097', '(51) 99322-7097']) assertEquals(chaveTel(t), '5193227097');
  assertEquals(chaveTel('5599123456'), '5599123456');         // DDD 55, fixo
  assertEquals(chaveTel('555591234567'), '5591234567');       // DDD 55 via JID
  assertEquals(chaveTel('123'), null);
  assertEquals(chaveTel('(051) 99322-7097'), '5193227097');   // zero de tronco (mig 56)
  assertEquals(chaveTel('051993227097'), '5193227097');
  assertEquals(candidatosTel('51993227097'), ['5551993227097', '555193227097']);
  assertEquals(candidatosTel('5185858160'), ['555185858160', '5551985858160']);
});

Deno.test('dias: "todos" manda no dia exato; "úteis" segue o Calendário', () => {
  // D25 em outubro/26 cai num domingo
  assertEquals(vencPadrao(25, '2026-10', 'todos'), '2026-10-25');
  assertEquals(vencPadrao(25, '2026-10', 'uteis'), '2026-10-26');
  // D01 em novembro/26: domingo 01 + Finados 02 → terça 03
  assertEquals(vencPadrao(1, '2026-11', 'uteis'), '2026-11-03');
  // Natal
  assertEquals(vencPadrao(25, '2026-12', 'uteis'), '2026-12-28');
  // dia 31 em mês de 30
  assertEquals(vencPadrao(31, '2026-09', 'todos'), '2026-09-30');
  assertEquals(diaPermitido('2026-10-12', 'uteis'), false);   // Aparecida
  assertEquals(diaPermitido('2026-10-03', 'uteis_sabado'), true);
  // lembrete que cairia no sábado é ANTECIPADO; atraso que cairia no domingo é ADIADO
  assertEquals(dataDoPasso('2026-10-06', -3, 'uteis'), '2026-10-02');
  assertEquals(dataDoPasso('2026-10-02', 2, 'uteis'), '2026-10-05');
  assertEquals(dataDoPasso('2026-10-06', -3, 'todos'), '2026-10-03');
});

Deno.test('quem vence hoje: sequência padrão no dia certo (modo todos os dias)', () => {
  const leads = [lead('a', 28), lead('b', 25), lead('c', 23), lead('d', 18)];
  const hoje = '2026-09-25';
  const r = devidosNoDia(hoje, leads, SEQ, semManual, 'todos').map((x) => `${x.lead.id}:${x.msg.id}:${x.venc}`).sort();
  assertEquals(r, ['a:lembrete:2026-09-28', 'b:dia:2026-09-25', 'c:atraso:2026-09-23', 'd:retomada:2026-09-18']);
});

Deno.test('virada de mês: lembrete de 03/10 sai em 30/09; retomada de agosto sai em setembro', () => {
  const r = devidosNoDia('2026-09-30', [lead('a', 3)], SEQ, semManual, 'todos');
  assertEquals(r.map((x) => [x.msg.id, x.comp, x.venc]), [['lembrete', '2026-10', '2026-10-03']]);
  const r2 = devidosNoDia('2026-09-04', [lead('b', 28)], SEQ, semManual, 'todos');
  assertEquals(r2.map((x) => [x.msg.id, x.comp]), [['retomada', '2026-08']]);
});

Deno.test('data MANUAL do Calendário manda em tudo (ciclo 7 cobrado em 02/09)', () => {
  const manual = new Map([[7, new Map([['2026-09', '2026-09-02']])]]);
  const r = devidosNoDia('2026-09-02', [lead('a', 7)], SEQ, manual, 'todos');
  assertEquals(r.map((x) => [x.msg.id, x.venc]), [['dia', '2026-09-02']]);
  assertEquals(devidosNoDia('2026-09-07', [lead('a', 7)], SEQ, manual, 'todos').length, 0);
});

Deno.test('atraso não é retroativo pra quem trocou de ciclo depois do vencimento', () => {
  // mudou pro dia 23 no dia 24/09 (BRT): o vencimento 23/09 nunca existiu pra ele
  const l = lead('a', 23, { dia_alterado_em: '2026-09-24T15:00:00Z' });
  assertEquals(devidosNoDia('2026-09-25', [l], SEQ, semManual, 'todos').length, 0);
  // o lembrete (antes) continua valendo pro próximo mês normalmente
  assertEquals(devidosNoDia('2026-10-20', [l], SEQ, semManual, 'todos').map((x) => x.msg.id), ['lembrete']);
});

Deno.test('grupo SUBSTITUI a mensagem padrão do mesmo "quando" (só pra quem está no grupo)', () => {
  const grupo = msg('g-eduardo', 0, { alvo: 'grupo', criterio: 'atend:Eduardo' });
  const leads = [lead('a', 25), lead('b', 25, { comercial: 'PATY' })];
  const r = devidosNoDia('2026-09-25', leads, [...SEQ, grupo], semManual, 'todos').map((x) => `${x.lead.id}:${x.msg.id}`).sort();
  assertEquals(r, ['a:g-eduardo', 'b:dia']);
});

Deno.test('cliente específico: só na data marcada', () => {
  const m = msg('esp', 0, { alvo: 'cliente', cli_id: 'x', data_envio: '2026-09-26' });
  const mapa = new Map([['x', lead('x', 5)]]);
  assertEquals(devidosClienteNoDia('2026-09-25', [m], mapa).length, 0);
  assertEquals(devidosClienteNoDia('2026-09-26', [m], mapa).map((x) => x.chave), ['dia:2026-09-26']);
});

Deno.test('comportamento ignora competência futura (dado de teste 2027-08)', () => {
  const cel = new Map([['a', new Map([['2026-08', 'nao_pagou'], ['2026-09', 'nao_pagou'], ['2027-08', 'pago']])]]);
  const f = comportamentoPor(['2026-08', '2026-09', '2027-08'], cel, '2026-09');
  assertEquals(f('a'), 'inadimplente');
});

Deno.test('variáveis = números da Gestão; faltando dado = erro, nunca mensagem quebrada', () => {
  const d = { nome: 'maria da silva', valorParcela: 354.52, atendente: nomeBonito('eduardo'), venc: '2026-09-25', dia: 25, hoje: '2026-09-22' };
  assertEquals(aplicarVars('Oi {nome}! Aqui é o {atendente}. Sua mensalidade de {valor} vence dia {vencimento}.', d),
    'Oi Maria! Aqui é o Eduardo. Sua mensalidade de R$ 177,26 vence dia 25.');
  assertEquals(aplicarVars('{valor da parcela}', d), aplicarVars('{meia parcela}', d));   // 27/10: só a meia parcela
  assertEquals(textoVencimento({ ...d, venc: '2026-10-03' }), '03/10');
  assertThrows(() => aplicarVars('valor {valor}', { ...d, valorParcela: null }));
  assertThrows(() => aplicarVars('aqui é {atendente}', { ...d, atendente: '' }));
  assertEquals(mensagemLegivel([{ tipo: 'texto', corpo: 'Oi {nome}' }, { tipo: 'audio', path: 'x', nome: 'a.ogg' }], d), 'Oi Maria\n\n[Áudio: a.ogg]');
});

Deno.test('nomes', () => {
  assertEquals(normNome(' Émillyn '), 'EMILLYN');
  assertEquals(nomeBonito('JUNIOR'), 'Junior');
  assertEquals(nomeBonito('maria da silva'), 'Maria da Silva');
});

Deno.test('erro passageiro × definitivo', () => {
  assertEquals(erroPassageiro('Evolution HTTP 503'), true);
  assertEquals(erroPassageiro('fetch failed'), true);
  assertEquals(erroPassageiro('Este número não tem WhatsApp'), false);
  assertEquals(erroPassageiro('sem valor da parcela na Gestão — complete o cadastro na Gestão'), false);
});

/* ---------- v17 (26/10): data ESCRITA na Gestão + cobrança primeiro ---------- */
Deno.test('data escrita na Gestão: lê "26/out", "03/nov.", "26/10", "05/10/2025"; mês de outra coluna é ignorado', () => {
  assertEquals(dataDoCabecalho('26/out', '2026-10'), '2026-10-26');
  assertEquals(dataDoCabecalho(' 03/nov. ', '2026-11'), '2026-11-03');
  assertEquals(dataDoCabecalho('26/10', '2026-10'), '2026-10-26');
  assertEquals(dataDoCabecalho('05/10/2026', '2026-10'), '2026-10-05');
  assertEquals(dataDoCabecalho('05/10/26', '2026-10'), '2026-10-05');
  assertEquals(dataDoCabecalho('05/10/2025', '2026-10'), null);           // ano escrito de outro ano = digitado errado
  assertEquals(dataDoCabecalho('01/Dez', '2026-12'), '2026-12-01');
  assertEquals(dataDoCabecalho('26/10', '2026-11'), null);                // Mês 16 do D24 (novembro) com "26/10"
  assertEquals(dataDoCabecalho('31/set', '2026-09'), null);               // dia que não existe
  assertEquals(dataDoCabecalho('Mês 15', '2026-10'), null);
  assertEquals(dataDoCabecalho('', '2026-10'), null);
  assertEquals(dataDoCabecalho(null, '2026-10'), null);
});

Deno.test('datas da Gestão por ciclo × competência (comp = base + posição do mês)', () => {
  const g = datasDaGestao([
    { dia: 24, comp_base: '2025-08', mes_pos: 14, texto: '26/out' },
    { dia: 24, comp_base: '2025-08', mes_pos: 15, texto: '26/10' },     // digitado errado: ignorado
    { dia: 1, comp_base: '2025-09', mes_pos: 14, texto: '03/nov' },
    { dia: null, comp_base: null, mes_pos: 0, texto: '10/out' },          // bloco NOVOS
    { dia: 7, comp_base: '2025-09', mes_pos: null, texto: '09/nov' },     // coluna sem posição
  ]);
  assertEquals(g.get(24)?.get('2026-10'), '2026-10-26');
  assertEquals(g.get(24)?.has('2026-11'), false);
  assertEquals(g.get(1)?.get('2026-11'), '2026-11-03');
  assertEquals(g.has(7), false);
});

Deno.test('a data da Gestão manda: D24 cobra em 26/10 (não no sábado 24); sem data escrita vale o Calendário/dia do ciclo', () => {
  const gestao = new Map([[24, new Map([['2026-10', '2026-10-26']])]]);
  const manual = new Map([[24, new Map([['2026-10', '2026-10-23']])]]);
  const l = [lead('a', 24)];
  assertEquals(devidosNoDia('2026-10-26', l, SEQ, manual, 'todos', undefined, { gestao }).map((x) => [x.msg.id, x.venc]), [['dia', '2026-10-26']]);
  assertEquals(devidosNoDia('2026-10-23', l, SEQ, manual, 'todos', undefined, { gestao }).map((x) => x.msg.id), ['lembrete']);
  assertEquals(devidosNoDia('2026-10-28', l, SEQ, manual, 'todos', undefined, { gestao }).map((x) => x.msg.id), ['atraso']);
  // novembro sem data escrita: Calendário (se houver) e depois o dia do ciclo
  assertEquals(devidosNoDia('2026-11-24', l, SEQ, manual, 'todos', undefined, { gestao }).map((x) => [x.msg.id, x.venc]), [['dia', '2026-11-24']]);
  assertEquals(devidosNoDia('2026-10-23', l, SEQ, manual, 'todos').map((x) => [x.msg.id, x.venc]), [['dia', '2026-10-23']]);
});

Deno.test('cobrança primeiro: quem não recebeu a Cobrança do dia recebe ela no lugar do aviso/retomada', () => {
  const gestao = new Map([[24, new Map([['2026-10', '2026-10-26']])]]);
  const l = [lead('a', 24)];
  const nunca = () => null, sempre = () => '2026-10-26';
  const r = devidosNoDia('2026-10-28', l, SEQ, semManual, 'todos', undefined, { gestao, cobradoEm: nunca });
  assertEquals(r.map((x) => [x.msg.id, x.substitui, x.chave, x.venc]), [['dia', 'atraso', '2026-10@2026-10-28', '2026-10-26']]);
  // retomada também
  const r7 = devidosNoDia('2026-11-02', l, SEQ, semManual, 'todos', undefined, { gestao, cobradoEm: nunca });
  assertEquals(r7.map((x) => [x.msg.id, x.substitui]), [['dia', 'retomada']]);
  // já recebeu a cobrança: segue o aviso normal
  assertEquals(devidosNoDia('2026-10-28', l, SEQ, semManual, 'todos', undefined, { gestao, cobradoEm: sempre }).map((x) => [x.msg.id, x.chave]), [['atraso', '2026-10']]);
  // lembrete (antes) e a própria cobrança não mudam
  assertEquals(devidosNoDia('2026-10-23', l, SEQ, semManual, 'todos', undefined, { gestao, cobradoEm: nunca }).map((x) => x.msg.id), ['lembrete']);
  assertEquals(devidosNoDia('2026-10-26', l, SEQ, semManual, 'todos', undefined, { gestao, cobradoEm: nunca }).map((x) => [x.msg.id, x.chave]), [['dia', '2026-10']]);
  // sem "cobrança do dia" na régua (pausada/excluída): o aviso sai como sempre
  const semDia = SEQ.filter((m) => m.id !== 'dia');
  assertEquals(devidosNoDia('2026-10-28', l, semDia, semManual, 'todos', undefined, { gestao, cobradoEm: nunca }).map((x) => x.msg.id), ['atraso']);
  // a verificação é por competência e pelo dia avaliado
  const visto: string[] = [];
  devidosNoDia('2026-10-28', l, SEQ, semManual, 'todos', undefined, { gestao, cobradoEm: (x, comp) => { visto.push(`${x.id}|${comp}`); return null; } });
  assertEquals(visto, ['a|2026-10']);
});

Deno.test('cobrança primeiro respeita o grupo: quem é do grupo recebe a Cobrança DO GRUPO no lugar do aviso', () => {
  const grupo = msg('g-dia', 0, { alvo: 'grupo', criterio: 'atend:Eduardo' });
  const r = devidosNoDia('2026-09-27', [lead('a', 25), lead('b', 25, { comercial: 'PATY' })], [...SEQ, grupo], semManual, 'todos', undefined, { cobradoEm: () => null })
    .map((x) => `${x.lead.id}:${x.msg.id}:${x.substitui}`).sort();
  assertEquals(r, ['a:g-dia:atraso', 'b:dia:atraso']);
});

Deno.test('sem as opções novas o comportamento antigo fica igual (prévia antiga, testes antigos)', () => {
  const r = devidosNoDia('2026-09-27', [lead('a', 25)], SEQ, semManual, 'todos').map((x) => [x.msg.id, x.chave, x.substitui ?? null]);
  assertEquals(r, [['atraso', '2026-09', null]]);
});

Deno.test('cobrança primeiro: a Cobrança que entrou HOJE não libera o aviso hoje (várias rodadas no mesmo dia)', () => {
  const gestao = new Map([[24, new Map([['2026-10', '2026-10-26']])]]);
  const l = [lead('a', 24)];
  const em = new Map<string, string>();
  const cobradoEm = (x: LeadR, comp: string) => diaCobrado(em, x, comp);
  // 09:00 de 28/10: troca o aviso pela Cobrança (trava do dia)
  const r1 = devidosNoDia('2026-10-28', l, SEQ, semManual, 'todos', undefined, { gestao, cobradoEm });
  assertEquals(r1.map((x) => [x.msg.id, x.chave]), [['dia', '2026-10@2026-10-28']]);
  // a Cobrança entrou na fila às 09:00 → na rodada das 09:05 a troca continua igual (mesma trava = "gerado")
  marcarCobrado(em, 'a', l[0].telefone, 24, '2026-10', '2026-10-28');
  const r2 = devidosNoDia('2026-10-28', l, SEQ, semManual, 'todos', undefined, { gestao, cobradoEm });
  assertEquals(r2.map((x) => [x.msg.id, x.chave]), [['dia', '2026-10@2026-10-28']]);
  // pausaram a Cobrança do dia às 10h: o aviso NÃO entra hoje
  const semDia = SEQ.filter((m) => m.id !== 'dia');
  assertEquals(devidosNoDia('2026-10-28', l, semDia, semManual, 'todos', undefined, { gestao, cobradoEm }).length, 0);
  // dias depois a Retomada segue normal
  assertEquals(devidosNoDia('2026-11-02', l, SEQ, semManual, 'todos', undefined, { gestao, cobradoEm }).map((x) => [x.msg.id, x.chave]), [['retomada', '2026-10']]);
});

Deno.test('cobrança primeiro: telefone repetido conta só DENTRO do mesmo ciclo; a data mais antiga vale', () => {
  const em = new Map<string, string>();
  marcarCobrado(em, 'x', '(51) 99322-7097', 28, '2026-10', '2026-10-29');
  marcarCobrado(em, 'x', '51993227097', 28, '2026-10', '2026-10-28');
  assertEquals(em.get('x|2026-10'), '2026-10-28');
  assertEquals(diaCobrado(em, lead('outro', 28), '2026-10'), '2026-10-28');                    // mesmo número, mesmo ciclo
  assertEquals(diaCobrado(em, lead('outro', 29), '2026-10'), null);                            // mesmo número, OUTRO ciclo: tem a sua
  assertEquals(diaCobrado(em, lead('outro', 28, { telefone: '51999990000' }), '2026-10'), null);
  assertEquals(diaCobrado(em, lead('x', 28), '2026-11'), null);                                // outra competência
  // NANCI D28 + D29 no mesmo número: a Cobrança do D29 sai no dia dela
  const gestao = new Map([[28, new Map([['2026-10', '2026-10-28']])], [29, new Map([['2026-10', '2026-10-29']])]]);
  const r = devidosNoDia('2026-10-29', [lead('d29', 29)], SEQ, semManual, 'todos', undefined, { gestao, cobradoEm: (x, c) => diaCobrado(em, x, c) });
  assertEquals(r.map((x) => x.msg.id), ['dia']);
});

Deno.test('a Cobrança não se repete na competência: já saiu no lugar do aviso e depois a data mudou na Gestão', () => {
  // saiu em 28/10 (no lugar do aviso); a equipe corrigiu o D24 para 30/out
  const gestao = new Map([[24, new Map([['2026-10', '2026-10-30']])]]);
  const em = new Map<string, string>([['a|2026-10', '2026-10-28']]);
  const cobradoEm = (x: LeadR, comp: string) => diaCobrado(em, x, comp);
  assertEquals(devidosNoDia('2026-10-30', [lead('a', 24)], SEQ, semManual, 'todos', undefined, { gestao, cobradoEm }).length, 0);
  // e o aviso de 01/11 segue normal (já recebeu a cobrança)
  assertEquals(devidosNoDia('2026-11-01', [lead('a', 24)], SEQ, semManual, 'todos', undefined, { gestao, cobradoEm }).map((x) => x.msg.id), ['atraso']);
});

Deno.test('dias úteis com data escrita num sábado: o aviso nunca cai no mesmo dia da cobrança', () => {
  const gestao = new Map([[24, new Map([['2026-10', '2026-10-24']])]]);   // sábado
  const r = devidosNoDia('2026-10-26', [lead('a', 24)], SEQ, semManual, 'uteis', undefined, { gestao, cobradoEm: () => null });
  assertEquals(r.map((x) => [x.msg.id, x.chave]), [['dia', '2026-10']]);
});

Deno.test('datas da Gestão: ciclo novo com cabeçalho COPIADO do D24 não herda a data; empate pela ordem do banco', () => {
  const g = datasDaGestao([
    { dia: 27, comp_base: '2025-08', mes_pos: 14, texto: '26/out', bloco_criado: '2026-10-29T10:00:00Z', ordem: 9000 },   // D27 novo (cópia)
    { dia: 24, comp_base: '2025-08', mes_pos: 14, texto: '26/out', bloco_criado: '2026-10-20T15:17:00Z', ordem: 1000 },
    { dia: 25, comp_base: '2025-08', mes_pos: 14, texto: '28/out', bloco_criado: '2026-10-20T15:17:00Z', ordem: 3000 },   // 2º cabeçalho do D25
    { dia: 25, comp_base: '2025-08', mes_pos: 14, texto: '27/out', bloco_criado: '2026-10-20T15:17:00Z', ordem: 2000 },
  ]);
  assertEquals(g.get(24)?.get('2026-10'), '2026-10-26');
  assertEquals(g.get(27)?.has('2026-10') ?? false, false);
  assertEquals(g.get(25)?.get('2026-10'), '2026-10-27');
  // depois de uma recarga todos os blocos nascem juntos: D18 (cópia do D24) não rouba a data do D24
  const g2 = datasDaGestao([
    { dia: 18, comp_base: '2025-08', mes_pos: 14, texto: '26/out', bloco_criado: '2026-11-01T10:00:00Z', ordem: 500 },
    { dia: 24, comp_base: '2025-08', mes_pos: 14, texto: '26/out', bloco_criado: '2026-11-01T10:00:00Z', ordem: 1000 },
  ]);
  assertEquals(g2.get(24)?.get('2026-10'), '2026-10-26');
  assertEquals(g2.get(18)?.has('2026-10') ?? false, false);
});

/* ---------- v18 (26/10): régua própria de cada comercial ---------- */
Deno.test('régua do comercial: o cliente recebe a mensagem do SEU comercial; sem versão = a padrão', () => {
  const versoes = versoesPor([
    { id: 'v-edu-dia', passo_id: 'dia', comercial: 'Eduardo', blocos: [{ tipo: 'texto', corpo: 'oi do Eduardo' }] },
    { id: 'v-pat-dia', passo_id: 'dia', comercial: 'PATY', blocos: [{ tipo: 'texto', corpo: 'oi da Paty' }] },
  ]);
  const leads = [lead('a', 25), lead('b', 25, { comercial: 'paty ' }), lead('c', 25, { comercial: 'JUNIOR' })];
  const r = devidosNoDia('2026-09-25', leads, SEQ, semManual, 'todos', undefined, { versoes })
    .map((x) => `${x.lead.id}:${x.msg.id}:${x.msg.versao ?? '-'}:${(x.msg.blocos as { corpo: string }[])[0].corpo}`).sort();
  assertEquals(r, ['a:dia:v-edu-dia:oi do Eduardo', 'b:dia:v-pat-dia:oi da Paty', 'c:dia:-:oi']);
  // os outros passos do Eduardo continuam os da padrão
  assertEquals(devidosNoDia('2026-09-22', [lead('a', 25)], SEQ, semManual, 'todos', undefined, { versoes }).map((x) => [x.msg.id, x.msg.versao ?? null]), [['lembrete', null]]);
});

Deno.test('régua do comercial: só troca passo da padrão (grupo fica) e vale na Cobrança que entra no lugar do aviso', () => {
  const versoes = versoesPor([{ id: 'v1', passo_id: 'dia', comercial: 'EDUARDO', blocos: [{ tipo: 'texto', corpo: 'x' }] },
                              { id: 'v2', passo_id: 'g-dia', comercial: 'EDUARDO', blocos: [] }]);
  const grupo = msg('g-dia', 0, { alvo: 'grupo', criterio: 'comp:inadimplente' });
  assertEquals(aplicarVersao(versoes, lead('a', 25), grupo), grupo);
  const r = devidosNoDia('2026-09-27', [lead('a', 25)], SEQ, semManual, 'todos', undefined, { versoes, cobradoEm: () => null });
  assertEquals(r.map((x) => [x.msg.id, x.msg.versao, x.substitui]), [['dia', 'v1', 'atraso']]);
});

Deno.test('régua do comercial: versão sem nada que saia (vazia / anexo sem arquivo) não cala o passo — vale a padrão', () => {
  const versoes = versoesPor([
    { id: 'v-vazia', passo_id: 'dia', comercial: 'EDUARDO', blocos: [] },
    { id: 'v-sem-arq', passo_id: 'dia', comercial: 'GARCIA', blocos: [{ tipo: 'audio', nome: 'a.ogg' }] },
    { id: 'v-texto-branco', passo_id: 'dia', comercial: 'PATY', blocos: [{ tipo: 'texto', corpo: '   ' }] },
  ]);
  for (const c of ['EDUARDO', 'GARCIA', 'PATY']) {
    const m = aplicarVersao(versoes, lead('a', 25, { comercial: c }), SEQ[1]);
    assertEquals([m.versao ?? null, (m.blocos as { corpo: string }[])[0].corpo], [null, 'oi']);
  }
});

Deno.test('régua do comercial: grupo do mesmo "quando" vence a versão (regra documentada)', () => {
  const versoes = versoesPor([{ id: 'v1', passo_id: 'dia', comercial: 'EDUARDO', blocos: [{ tipo: 'texto', corpo: 'x' }] }]);
  const grupo = msg('g-edu', 0, { alvo: 'grupo', criterio: 'atend:Eduardo' });
  const r = devidosNoDia('2026-09-25', [lead('a', 25)], [...SEQ, grupo], semManual, 'todos', undefined, { versoes });
  assertEquals(r.map((x) => [x.msg.id, x.msg.versao ?? null]), [['g-edu', null]]);
});

Deno.test('nomes do comercial: a chave do motor é a mesma do banco (wa_nome_chave) e da tela', () => {
  for (const [a, b] of [[' Émillyn ', 'EMILLYN'], ['paty', 'PATY'], ['Júnior', 'JUNIOR'], ['eduardo  souza', 'EDUARDO SOUZA']]) assertEquals(normNome(a), b);
});

/* ---------- v19 (26/10): excluir passo na régua do comercial ---------- */
Deno.test('régua do comercial: passo EXCLUÍDO não sai pros clientes dele; os outros comerciais seguem a padrão', () => {
  const versoes = versoesPor([{ id: 'x1', passo_id: 'lembrete', comercial: 'EDUARDO', blocos: [], excluida: true }]);
  const r = devidosNoDia('2026-09-22', [lead('a', 25), lead('b', 25, { comercial: 'PATY' })], SEQ, semManual, 'todos', undefined, { versoes })
    .map((x) => `${x.lead.id}:${x.msg.id}`);
  assertEquals(r, ['b:lembrete']);
});

Deno.test('régua do comercial: Cobrança do dia excluída = sem "cobrança primeiro" pra ele (o aviso sai normal)', () => {
  const versoes = versoesPor([{ id: 'x2', passo_id: 'dia', comercial: 'EDUARDO', blocos: [], excluida: true }]);
  assertEquals(devidosNoDia('2026-09-25', [lead('a', 25)], SEQ, semManual, 'todos', undefined, { versoes }).length, 0);
  const r = devidosNoDia('2026-09-27', [lead('a', 25)], SEQ, semManual, 'todos', undefined, { versoes, cobradoEm: () => null });
  assertEquals(r.map((x) => [x.msg.id, x.substitui ?? null]), [['atraso', null]]);
  // pra Paty (sem exclusão) a troca continua
  const p = devidosNoDia('2026-09-27', [lead('b', 25, { comercial: 'PATY' })], SEQ, semManual, 'todos', undefined, { versoes, cobradoEm: () => null });
  assertEquals(p.map((x) => [x.msg.id, x.substitui ?? null]), [['dia', 'atraso']]);
});

/* ---------- v20 (26/10): dia próprio na régua do comercial ---------- */
Deno.test('régua do comercial: dia próprio — lembrete 5 dias antes e aviso +3 só pros clientes dele', () => {
  const versoes = versoesPor([
    { id: 'd1', passo_id: 'lembrete', comercial: 'EDUARDO', blocos: [], quando: -5 },
    { id: 'd2', passo_id: 'atraso', comercial: 'EDUARDO', blocos: [{ tipo: 'texto', corpo: 'aviso do Edu' }], quando: 3 },
  ]);
  const leads = [lead('a', 25), lead('b', 25, { comercial: 'PATY' })];
  const em = (d: string) => devidosNoDia(d, leads, SEQ, semManual, 'todos', undefined, { versoes })
    .map((x) => `${x.lead.id}:${x.msg.id}:${x.msg.quando}:${(x.msg.blocos as { corpo: string }[])[0].corpo}`).sort();
  assertEquals(em('2026-09-20'), ['a:lembrete:-5:oi']);          // 25 − 5 (mensagem da padrão, dia dele)
  assertEquals(em('2026-09-22'), ['b:lembrete:-3:oi']);          // Paty segue a padrão
  assertEquals(em('2026-09-27'), ['b:atraso:2:oi']);
  assertEquals(em('2026-09-28'), ['a:atraso:3:aviso do Edu']);   // +3 com a mensagem dele
});

Deno.test('régua do comercial: dia próprio não cruza o vencimento nem mexe na Cobrança do dia', () => {
  const versoes = versoesPor([
    { id: 'x', passo_id: 'dia', comercial: 'EDUARDO', blocos: [], quando: 2 },
    { id: 'y', passo_id: 'lembrete', comercial: 'EDUARDO', blocos: [], quando: 4 },
  ]);
  const r = (d: string) => devidosNoDia(d, [lead('a', 25)], SEQ, semManual, 'todos', undefined, { versoes }).map((x) => [x.msg.id, x.msg.quando]);
  assertEquals(r('2026-09-25'), [['dia', 0]]);
  assertEquals(r('2026-09-22'), [['lembrete', -3]]);
});

Deno.test('régua do comercial: aviso com dia próprio também troca pela Cobrança se ela não saiu (cobrança primeiro)', () => {
  const versoes = versoesPor([{ id: 'd2', passo_id: 'atraso', comercial: 'EDUARDO', blocos: [], quando: 4 }]);
  const r = devidosNoDia('2026-09-29', [lead('a', 25)], SEQ, semManual, 'todos', undefined, { versoes, cobradoEm: () => null });
  assertEquals(r.map((x) => [x.msg.id, x.substitui ?? null]), [['dia', 'atraso']]);
});

/* ---------- v21 (26/10): no máximo 1 mensagem por cliente por dia; dia próprio de ±30 ---------- */
Deno.test('1 por dia: dois passos que caem juntos pro mesmo cliente — vai o mais importante', () => {
  // Eduardo moveu a Retomada pra +2 (mesmo dia do Aviso, que voltou pra padrão): só o Aviso sai
  const versoes = versoesPor([{ id: 'r', passo_id: 'retomada', comercial: 'EDUARDO', blocos: [], quando: 2 }]);
  const r = devidosNoDia('2026-09-27', [lead('a', 25)], SEQ, semManual, 'todos', undefined, { versoes });
  assertEquals(r.map((x) => x.msg.id), ['atraso']);
  // lembrete movido pro dia de um atraso de outro mês: vai o atraso
  const v2 = versoesPor([{ id: 'l', passo_id: 'lembrete', comercial: 'EDUARDO', blocos: [], quando: -28 }]);
  const r2 = devidosNoDia('2026-09-27', [lead('a', 25)], SEQ, semManual, 'todos', undefined, { versoes: v2 });
  assertEquals(r2.map((x) => [x.msg.id, x.comp]), [['atraso', '2026-09']]);
});

Deno.test('dia próprio de ±30 casa a competência certa (janela ±2 meses)', () => {
  // 31/01 + 29 = 01/03 (competência 2 meses antes de hoje)
  const v = versoesPor([{ id: 'x', passo_id: 'retomada', comercial: 'EDUARDO', blocos: [], quando: 29 }]);
  const r = devidosNoDia('2027-03-01', [lead('a', 31)], SEQ, semManual, 'todos', undefined, { versoes: v });
  assertEquals(r.map((x) => [x.msg.id, x.comp, x.venc]), [['retomada', '2027-01', '2027-01-31']]);
  // e no dia em que ela cai junto com o aviso de fevereiro (28/02 + 2), vai só o aviso
  const v30 = versoesPor([{ id: 'x', passo_id: 'retomada', comercial: 'EDUARDO', blocos: [], quando: 30 }]);
  assertEquals(devidosNoDia('2027-03-02', [lead('a', 31)], SEQ, semManual, 'todos', undefined, { versoes: v30 }).map((x) => x.msg.id), ['atraso']);
  const v2 = versoesPor([{ id: 'y', passo_id: 'lembrete', comercial: 'EDUARDO', blocos: [], quando: -30 }]);
  const r2 = devidosNoDia('2027-01-30', [lead('a', 1)], SEQ, semManual, 'todos', undefined, { versoes: v2 });
  assertEquals(r2.map((x) => [x.msg.id, x.comp]), [['lembrete', '2027-03']]);
});

Deno.test('{meia parcela} = {valor} = {parcela mensal} (parcela total ÷ 2, a "meia parcela" da ficha)', () => {
  const d = { nome: 'clair', valorParcela: 263.81, atendente: 'Augusto', venc: '2026-10-26', dia: 24, hoje: '2026-10-26' };
  // dono 27/10: dinheiro é SEMPRE a meia parcela — {valor da parcela} (texto antigo) também
  assertEquals(aplicarVars('{meia parcela} | {valor} | {parcela mensal} | {valor da parcela}', d), 'R$ 131,91 | R$ 131,91 | R$ 131,91 | R$ 131,91');
  assertThrows(() => aplicarVars('{meia parcela}', { ...d, valorParcela: null }));
});
