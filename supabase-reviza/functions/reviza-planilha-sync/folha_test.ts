// deno test --node-modules-dir=none supabase-reviza/functions/reviza-planilha-sync/folha_test.ts
// Fixtures 100% sintéticas (nomes/CPFs inventados) — nada de dado real no repo.
import { assert, assertEquals, assertThrows } from 'jsr:@std/assert@1';
import {
  ErroEstrutura, LeadCasar, Pags,
  arred2, btrim, casar, compSoma, cpfChave, dataCurta, ehCabecalho, ehNaoPagou, ehRotuloNovos, ehVazia,
  estadoMes, leadsSemLinha, letra, mapaPadrao, marcaSenha, mmmAa, montarFolha, nbChave, nomeChave,
  plTrim, sha256Hex, soDigitos, telefone, valorBr,
} from './folha.ts';

const m = mapaPadrao();
const NCOL = m.ncol;

/** linha de 25 textos a partir de {pos: texto} */
const row = (celulas: Record<number, string> = {}): string[] => {
  const r = new Array<string>(NCOL).fill('');
  for (const [pos, t] of Object.entries(celulas)) r[Number(pos)] = t;
  return r;
};
const cabecalho = (ultimoMes: string, primeiroMes = ''): string[] =>
  row({ 0: 'DATA FECHAMENTO', 1: 'COMERCIAL', 2: 'CLIENTE', 3: 'NB', 4: 'BANCO', 5: 'CPF', 6: 'SENHA INSS', 7: 'PARCELA TOTAL', 8: 'RECLAME AQUI', 9: 'DATA QUE PAROU', 10: primeiroMes, 23: ultimoMes });
const rotuloNovos = (): string[] => row({ 2: 'NOVOS' });

/* ================= sha256 ================= */

Deno.test('sha256Hex: vetores conhecidos (síncrono, sem WebCrypto)', () => {
  assertEquals(sha256Hex(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  assertEquals(sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  // mais de um bloco de 64 bytes + utf-8 com acento
  assertEquals(
    sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'),
    '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
  );
  assertEquals(sha256Hex('ação'), sha256Hex('ação'));
  assert(sha256Hex('ação') !== sha256Hex('acao'));
  assert(marcaSenha('x').startsWith('sha256:'));
});

/* ================= parsers §2.1 ================= */

Deno.test('valorBr: mesmas regras do Python (vírgula decimal, ponto milhar)', () => {
  assertEquals(valorBr('R$ 1.343,50'), 1343.5);
  assertEquals(valorBr('58,00'), 58);
  assertEquals(valorBr('1.343'), 1343);          // milhar
  assertEquals(valorBr('1343.50'), 1343.5);      // decimal (não casa o padrão de milhar)
  assertEquals(valorBr('1.343.500'), 1343500);
  assertEquals(valorBr(' 58 '), 58);
  assertEquals(valorBr('r$58'), 58);
  assertEquals(valorBr('58,5'), 58.5);
  assertEquals(valorBr('abc'), null);
  assertEquals(valorBr(''), null);
  assertEquals(valorBr('1,2,3'), null);
  assertEquals(valorBr('12.34.56'), null);
  assertEquals(valorBr(null), null);
});

Deno.test('estadoMes: pago / NÃO PAGOU / nada', () => {
  assertEquals(estadoMes('NÃO PAGOU'), ['nao_pagou', null]);
  assertEquals(estadoMes('  nao pagou '), ['nao_pagou', null]);
  assertEquals(estadoMes('58,00'), ['pago', 58]);
  assertEquals(estadoMes('R$ 116,00'), ['pago', 116]);
  assertEquals(estadoMes('0'), null);            // pago exige valor > 0
  assertEquals(estadoMes('-'), null);
  assertEquals(estadoMes('PAGO'), null);
  assertEquals(estadoMes(''), null);
  assert(ehNaoPagou('NÃO  PAGOU') === false);    // espaço duplo não é o rótulo exato
});

Deno.test('arred2: arredondamento do Python (meio para o par sobre o double)', () => {
  assertEquals(arred2(58), 58);
  assertEquals(arred2(116.005), 116.0);          // 116.005 em double fica abaixo do meio
  assertEquals(arred2(45.675), 45.67);
  assertEquals(arred2(1.015), 1.01);
});

Deno.test('dataCurta: DD/mmm, DD/MM, com e sem ano; inválida pula para a próxima', () => {
  assertEquals(dataCurta('05/10'), '2025-10-05');          // out-dez sem ano → 2025
  assertEquals(dataCurta('05/09'), '2026-09-05');          // jan-set sem ano → 2026
  assertEquals(dataCurta('12/mai.'), '2026-05-12');
  assertEquals(dataCurta('3/10/24'), '2024-10-03');
  assertEquals(dataCurta('10/abr/2025'), '2025-04-10');
  assertEquals(dataCurta('parou dia 7/8 e 9/10'), '2026-08-07');
  assertEquals(dataCurta('31/02'), null);                  // inválida e sem outra data
  assertEquals(dataCurta('31/02 ou 01/03'), '2026-03-01'); // pula a inválida
  assertEquals(dataCurta('105/10'), null);                 // (?<!\d) — 105 não é dia
  assertEquals(dataCurta(''), null);
});

Deno.test('telefone: 1ª sequência com 10-13 dígitos', () => {
  assertEquals(telefone('(51) 99322-7097'), '51993227097');
  assertEquals(telefone('ligar 5551993227097 amanhã'), '5551993227097');
  assertEquals(telefone('123456789'), null);
  assertEquals(telefone('sem número'), null);
  // 11 dígitos do CPF contam: é a 1ª sequência com 10-13 dígitos (igual ao Python)
  assertEquals(telefone('cpf 123.456.789-09 tel 5199322.7097'), '12345678909');
});

Deno.test('normalizações do casamento: cpfChave/nomeChave/nbChave', () => {
  assertEquals(cpfChave('123.456.789-09'), '12345678909');
  assertEquals(cpfChave('123'), '00000000123');            // zfill até 11
  assertEquals(cpfChave(''), null);
  assertEquals(nomeChave('  José  da-Silva Júnior '), 'JOSE DA SILVA JUNIOR');
  assertEquals(nbChave('000.123-4'), '1234');
  assertEquals(nbChave('000'), '0');
  assertEquals(nbChave('BANCO TAL'), 'BANCO TAL');
  assertEquals(soDigitos('a1b2'), '12');
  assertEquals(btrim(' x '), ' x');              // btrim só tira espaço comum
  assertEquals(plTrim(' x\t'), 'x');                  // pl_trim tira nbsp/tab/quebra
});

Deno.test('compSoma/mmmAa/letra', () => {
  assertEquals(compSoma('2025-08', 0), '2025-08');
  assertEquals(compSoma('2025-08', 5), '2026-01');
  assertEquals(compSoma('2025-09', 14), '2026-11');
  assertEquals(mmmAa('2026-09'), 'set/26');
  assertEquals(letra(0), 'A');
  assertEquals(letra(24), 'Y');
  assertEquals(letra(26), 'AA');
});

/* ================= folha ================= */

Deno.test('classificação de linhas: cabeçalho, vazia, rótulo NOVOS', () => {
  assert(ehCabecalho(cabecalho('24/set'), m));
  assert(!ehCabecalho(row({ 0: 'DATA FECHAMENTO' }), m));
  assert(ehVazia(row(), NCOL));
  assert(!ehVazia(row({ 24: 'x' }), NCOL));
  assert(ehRotuloNovos(rotuloNovos(), m));
  assert(ehRotuloNovos(row({ 2: 'novos', 24: '51993227097' }), m));   // telefone não desqualifica
  assert(!ehRotuloNovos(row({ 2: 'NOVOS', 5: '123' }), m));           // CPF preenchido desqualifica
});

Deno.test('montarFolha: blocos pelo último mês legível; vazias do fim fora; ordem 1000·i', () => {
  const rows = [
    cabecalho('24/set', '24/ago'),
    row({ 2: 'TESTE UM DA FOLHA', 5: '111.111.111-11', 10: '58,00' }),
    row(),
    cabecalho('01/out', '01/set'),
    row({ 2: 'TESTE DOIS DA FOLHA' }),
    rotuloNovos(),
    row({ 2: 'TESTE TRES DA FOLHA' }),
    row(), row(),                                   // vazias do fim: não entram
  ];
  const f = montarFolha(rows, m, []);
  assertEquals(f.blocos.map((b) => [b.id, b.dia, b.situacao, b.compBase]), [
    ['D24', 24, 'cancelado', '2025-08'],
    ['D01', 1, 'cancelado', '2025-09'],
    ['NOVOS', null, 'ativo', null],
  ]);
  assertEquals(f.linhas.map((l) => l.tipo), ['cabecalho', 'cliente', 'vazia', 'cabecalho', 'cliente', 'rotulo', 'cliente']);
  assertEquals(f.linhas.map((l) => l.bloco), ['D24', 'D24', null, 'D01', 'D01', 'NOVOS', 'NOVOS']);
  assertEquals(f.linhas.map((l) => l.ordem), [1000, 2000, 3000, 4000, 5000, 6000, 7000]);
  assertEquals(f.linhas[1].r, 1);
  assertEquals(f.avisos, []);
});

Deno.test('montarFolha: aviso quando a 1ª coluna de mês fala de outro mês', () => {
  const f = montarFolha([cabecalho('24/set', '24/jul')], m, []);
  assertEquals(f.avisos.length, 1);
  assert(f.avisos[0].includes('bloco D24'));
});

Deno.test('montarFolha: erros viram ErroEstrutura (freio)', () => {
  assertThrows(() => montarFolha([row({ 2: 'FULANO ANTES DO CABECALHO' })], m, []), ErroEstrutura);
  assertThrows(() => montarFolha([cabecalho('24/set'), cabecalho('24/out')], m, []), ErroEstrutura);     // bloco repetido
  assertThrows(() => montarFolha([cabecalho('sem data')], m, []), ErroEstrutura);                        // sem dia legível
  assertThrows(() => montarFolha([cabecalho('24/set'), rotuloNovos(), rotuloNovos()], m, []), ErroEstrutura);
});

Deno.test('montarFolha: aviso de estrutura quando a ordem difere do contrato', () => {
  const f = montarFolha([cabecalho('24/set'), rotuloNovos()], m, ['D24', 'D25', 'NOVOS']);
  assert(f.avisos.some((a) => a.startsWith('ESTRUTURA DIFERENTE')));
});

/* ================= casamento ================= */

const lead = (id: string, extra: Partial<LeadCasar> = {}): LeadCasar =>
  ({ id, nome: null, cpf: null, nb: null, banco: null, dia: null, situacao: 'cancelado', ...extra });

function folhaCasar(clientes: Record<number, string>[]): ReturnType<typeof montarFolha> {
  return montarFolha([cabecalho('24/set', '24/ago'), ...clientes.map(row), rotuloNovos()], m, []);
}

Deno.test('casar P1: CPF + bloco + NB (com o NB no campo banco do import trocado)', () => {
  const f = folhaCasar([{ 2: 'TESTE ALFA', 3: '123456', 5: '111.111.111-11' }]);
  // lead certo: mesmo cpf, dia 24, NB gravado em banco (import de 17/09)
  const leads = [
    lead('b', { cpf: '11111111111', dia: 24, nb: 'BANCO TAL', banco: '0123456' }),
    lead('a', { cpf: '11111111111', dia: 25, nb: '123456' }),                      // bloco errado: só entra na P2
  ];
  const r = casar(f.linhas, f.blocos, leads, new Map(), m);
  assertEquals(r.get(1)?.leadId, 'b');
  assertEquals(r.get(1)?.passada, 'P1');
});

Deno.test('casar P2: CPF + nome quando o bloco não bate', () => {
  const f = folhaCasar([{ 2: 'TESTE BETA DA SILVA', 5: '222.222.222-22' }]);
  const leads = [lead('a', { cpf: '22222222222', nome: 'Teste Beta da Silva', dia: 1 })];
  const r = casar(f.linhas, f.blocos, leads, new Map(), m);
  assertEquals(r.get(1)?.leadId, 'a');
  assertEquals(r.get(1)?.passada, 'P2');
});

Deno.test('casar P3: nome + bloco sem CPF; NOVOS casa por situacao=ativo', () => {
  const f = montarFolha([
    cabecalho('24/set', '24/ago'),
    row({ 2: 'TESTE GAMA' }),
    rotuloNovos(),
    row({ 2: 'TESTE DELTA' }),
  ], m, []);
  const leads = [
    lead('g', { nome: 'TESTE GAMA', dia: 24 }),
    lead('d', { nome: 'TESTE DELTA', situacao: 'ativo' }),
  ];
  const r = casar(f.linhas, f.blocos, leads, new Map(), m);
  assertEquals(r.get(1)?.leadId, 'g');
  assertEquals(r.get(1)?.passada, 'P3');
  assertEquals(r.get(3)?.leadId, 'd');
});

Deno.test('casar: 1 lead casa com no máximo 1 linha; a ordem da folha desempata', () => {
  const f = folhaCasar([
    { 2: 'TESTE REPETIDO', 5: '333.333.333-33' },
    { 2: 'TESTE REPETIDO', 5: '333.333.333-33' },
  ]);
  const leads = [lead('x', { cpf: '33333333333', nome: 'TESTE REPETIDO', dia: 24 })];
  const r = casar(f.linhas, f.blocos, leads, new Map(), m);
  assertEquals(r.get(1)?.leadId, 'x');       // a 1ª linha leva
  assertEquals(r.get(2), undefined);         // a 2ª fica sem par
});

Deno.test('casar: placar desempata (pagamentos que batem; depois o menor id)', () => {
  const f = folhaCasar([{ 2: 'TESTE PLACAR', 5: '444.444.444-44', 3: '999', 10: '58,00' }]);
  const leads = [
    lead('z2', { cpf: '44444444444', dia: 24, nb: '999' }),
    lead('z1', { cpf: '44444444444', dia: 24, nb: '999' }),
  ];
  // z2 tem o pagamento de 2025-08 batendo → vence apesar do id maior
  const pags: Pags = new Map([['z2', new Map([['2025-08', ['pago', 58] as const]])]]);
  const r1 = casar(f.linhas, f.blocos, leads, pags, m);
  assertEquals(r1.get(1)?.leadId, 'z2');
  assertEquals(r1.get(1)?.empate, false);
  // sem pagamentos, tudo empata → menor id (z1) e empate=true
  const r2 = casar(f.linhas, f.blocos, leads, new Map(), m);
  assertEquals(r2.get(1)?.leadId, 'z1');
  assertEquals(r2.get(1)?.empate, true);
});

Deno.test('leadsSemLinha: quem aguarda aprovação de débito parado sai na lista própria', () => {
  const f = folhaCasar([{ 2: 'TESTE FICA', 5: '555.555.555-55' }]);
  const leads = [
    lead('fica', { cpf: '55555555555', dia: 24 }),
    lead('sai', { dia: 24 }),
    lead('pend', { dia: 24, parado_pendente: true }),
  ];
  const r = casar(f.linhas, f.blocos, leads, new Map(), m);
  const { saem, pendentes } = leadsSemLinha(leads, r);
  assertEquals(saem.map((l) => l.id), ['sai']);
  assertEquals(pendentes.map((l) => l.id), ['pend']);
});
