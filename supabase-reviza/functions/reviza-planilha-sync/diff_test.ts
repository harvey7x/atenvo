// deno test --node-modules-dir=none supabase-reviza/functions/reviza-planilha-sync/diff_test.ts
// Diff 3 vias (S×E×P), grupos, freio e espelho — fixtures 100% sintéticas.
import { assert, assertEquals } from 'jsr:@std/assert@1';
import { CAMPOS_SENHA, LeadCasar, mapaPadrao, marcaSenha } from './folha.ts';
import {
  ABA_CANCELADOS, ABA_MENSAL, EspelhoLinha, ItemAplicar, Sistema,
  blocosDoSistema, diffFolha, preparar,
} from './diff.ts';

const m = mapaPadrao();
const NCOL = m.ncol;

const row = (celulas: Record<number, string> = {}): string[] => {
  const r = new Array<string>(NCOL).fill('');
  for (const [pos, t] of Object.entries(celulas)) r[Number(pos)] = t;
  return r;
};
const cabecalho = (ultimoMes: string, primeiroMes: string): string[] =>
  row({ 0: 'DATA FECHAMENTO', 1: 'COMERCIAL', 2: 'CLIENTE', 3: 'NB', 4: 'BANCO', 5: 'CPF', 6: 'SENHA INSS', 7: 'PARCELA TOTAL', 8: 'RECLAME AQUI', 9: 'DATA QUE PAROU', 10: primeiroMes, 23: ultimoMes });
const rotuloNovos = (): string[] => row({ 2: 'NOVOS' });

/* ---------- cenário base: 2 blocos de ciclo + NOVOS, 2 clientes ---------- */
interface Cenario { sistema: Sistema; sheet: string[][]; espelho: EspelhoLinha[] }

function cenario(): Cenario {
  const cab24 = cabecalho('24/set', '24/ago');
  const rowA = row({ 0: '05/10', 1: 'TESTE COM', 2: 'TESTE ALFA SYNC', 3: '1000', 5: '111.111.111-11', 7: '193,00', 10: '58,00', 24: '51990000001' });
  const rowB = row({ 2: 'TESTE BETA SYNC', 3: '2000', 5: '222.222.222-22' });
  const cab01 = cabecalho('01/out', '01/set');
  const sheet = [cab24, rowA, rowB, row(), cab01, rotuloNovos()];

  const linhas = [
    { id: 'ln-cab24', ordem: 1000, tipo: 'cabecalho', bloco: 'D24', lead_id: null },
    { id: 'ln-a', ordem: 2000, tipo: 'cliente', bloco: 'D24', lead_id: 'lead-a' },
    { id: 'ln-b', ordem: 3000, tipo: 'cliente', bloco: 'D24', lead_id: 'lead-b' },
    { id: 'ln-v', ordem: 4000, tipo: 'vazia', bloco: null, lead_id: null },
    { id: 'ln-cab01', ordem: 5000, tipo: 'cabecalho', bloco: 'D01', lead_id: null },
    { id: 'ln-rot', ordem: 6000, tipo: 'rotulo', bloco: 'NOVOS', lead_id: null },
  ];
  const celulas = new Map<string, string>();
  const poe = (linhaId: string, r: string[], semSenha = false) => {
    r.forEach((t, pos) => {
      if (!t) return;
      const col = m.colunas[pos];
      if (semSenha && col.campo && CAMPOS_SENHA.has(col.campo)) return;   // senha nunca é texto de célula
      celulas.set(`${linhaId}\u0000${col.id}`, t);
    });
  };
  poe('ln-cab24', cab24);
  poe('ln-a', rowA, true);
  poe('ln-b', rowB, true);
  poe('ln-cab01', cab01);
  poe('ln-rot', rotuloNovos());

  const leads: LeadCasar[] = [
    { id: 'lead-a', nome: 'TESTE ALFA SYNC', cpf: '11111111111', nb: '1000', banco: null, dia: 24, situacao: 'cancelado' },
    { id: 'lead-b', nome: 'TESTE BETA SYNC', cpf: '22222222222', nb: '2000', banco: null, dia: 24, situacao: 'cancelado' },
  ];
  const sistema: Sistema = {
    mapa: m,
    blocos: [
      { id: 'D24', dia: 24, situacao: 'cancelado', comp_base: '2025-08' },
      { id: 'D01', dia: 1, situacao: 'cancelado', comp_base: '2025-09' },
      { id: 'NOVOS', dia: null, situacao: 'ativo', comp_base: null },
    ],
    linhas, celulas, leads, pags: new Map(), naoSair: new Set(),
  };
  // espelho coerente com a planilha atual: roda o diff uma vez sem espelho e usa o espelhoNovo
  const base = diffFolha({
    prep: preparar(sheet, sistema), cancelados: [], sistema, espelho: [],
    lixeira: new Map(), limites: { saidas: 1000, pct: 100000 },
  });
  assertEquals(base.itens, []);                    // o cenário nasce em dia
  assertEquals(base.mudancas, 0);
  return { sistema, sheet, espelho: base.espelhoNovo };
}

const roda = (c: Cenario, extra: Partial<Parameters<typeof diffFolha>[0]> = {}) =>
  diffFolha({
    prep: preparar(c.sheet, c.sistema), cancelados: [], sistema: c.sistema, espelho: c.espelho,
    lixeira: new Map(), limites: { saidas: 10, pct: 2000 }, ...extra,
  });
const ops = (itens: ItemAplicar[]) => itens.map((i) => i.op);

/* ================= regras de 3 vias ================= */

Deno.test('sem mudanças: nada aplicado, espelho igual, sem freio', () => {
  const c = cenario();
  const r = roda(c);
  assertEquals(r.itens, []);
  assertEquals(r.senhas, []);
  assertEquals(r.conflitos, []);
  assertEquals(r.mudancas, 0);
  assertEquals(r.freio, null);
  assertEquals(r.espelhoNovo.map((l) => l.hash), c.espelho.map((l) => l.hash));
});

Deno.test('S≠E e S≠P com P==E: aplica sem conflito (só a planilha mudou)', () => {
  const c = cenario();
  c.sheet[1][24] = '51990000099';                 // telefone mudou NA planilha
  const r = roda(c);
  assertEquals(ops(r.itens), ['celula']);
  const it = r.itens[0] as { op: 'celula'; linha_id: string; coluna_id: string; texto: string };
  assertEquals(it.linha_id, 'ln-a');
  assertEquals(it.coluna_id, m.colunas[24].id);
  assertEquals(it.texto, '51990000099');
  assertEquals(r.conflitos, []);
  assertEquals(r.grupos.map((g) => [g.id, g.total]), [['telefones', 1]]);
  assertEquals(r.mudancas, 1);
});

Deno.test('os dois mudaram (P≠E e S≠P): a planilha manda e o conflito fica registrado', () => {
  const c = cenario();
  c.sheet[1][24] = '51990000099';                                       // planilha mudou
  c.sistema.celulas.set(`ln-a\u0000${m.colunas[24].id}`, '51991111111'); // sistema também
  const r = roda(c);
  assertEquals(ops(r.itens), ['celula']);
  assertEquals(r.conflitos, [{
    lead_id: 'lead-a', campo: 'Telefone', valor_planilha: '51990000099', valor_sistema: '51991111111',
  }]);
});

Deno.test('S≠E mas S==P: nada aplicado, só o espelho acompanha (push já tinha levado)', () => {
  const c = cenario();
  c.sheet[1][24] = '51993333333';
  c.sistema.celulas.set(`ln-a\u0000${m.colunas[24].id}`, '51993333333');
  const r = roda(c);
  assertEquals(r.itens, []);
  assertEquals(r.mudancas, 0);
  const espA = r.espelhoNovo.find((l) => l.lead_id === 'lead-a')!;
  assertEquals(espA.valores[24], '51993333333');
  assert(espA.hash !== c.espelho.find((l) => l.lead_id === 'lead-a')!.hash);
});

Deno.test('sem espelho (1ª rodada): S≠P aplica sem conflito; S==P só povoa o espelho', () => {
  const c = cenario();
  c.sheet[1][10] = '116,00';                      // pagamento diferente do sistema
  const r = roda(c, { espelho: [] });
  assertEquals(ops(r.itens), ['celula']);
  assertEquals(r.conflitos, []);
  assertEquals(r.grupos.map((g) => [g.id, g.total]), [['pagamentos', 1]]);
  const g = r.grupos[0];
  assertEquals(g.itens[0], { nome: 'TESTE ALFA SYNC', detalhe: 'ago/25 · 116,00 · D24' });
});

/* ================= estrutura: mover, sair, novo, restaurar ================= */

Deno.test('mudou de seção na planilha → mover (grupo "mudaram de ciclo")', () => {
  const c = cenario();
  const rowA = c.sheet[1];
  c.sheet.splice(1, 1);                           // tira do D24…
  c.sheet.splice(4, 0, rowA);                     // …e põe depois do cabeçalho do D01
  const r = roda(c);
  assertEquals(ops(r.itens), ['mover']);
  assertEquals(r.itens[0], { op: 'mover', lead_id: 'lead-a', bloco: 'D01' });
  assertEquals(r.grupos.map((g) => [g.id, g.total]), [['ciclo', 1]]);
  assertEquals(r.grupos[0].itens[0].detalhe, 'D24 → D01');
});

Deno.test('linha sumiu da MENSAL → sair (Lixeira preserva); pendente de outbox não sai', () => {
  const c = cenario();
  c.sheet.splice(2, 1);                           // some a linha do BETA
  const r = roda(c);
  assertEquals(ops(r.itens), ['sair']);
  assertEquals(r.itens[0], { op: 'sair', lead_id: 'lead-b' });
  assertEquals(r.saidas, 1);
  assertEquals(r.grupos.map((g) => [g.id, g.total]), [['saem', 1]]);
  // com cliente_novo pendente na outbox, o mesmo lead NÃO sai
  c.sistema.naoSair.add('lead-b');
  const r2 = roda(c);
  assertEquals(r2.itens, []);
  assertEquals(r2.saidas, 0);
});

Deno.test('linha nova sem par: com Lixeira → restaurar; sem → novo (com a linha inteira)', () => {
  const c = cenario();
  c.sheet.splice(3, 0, row({ 2: 'TESTE GAMA SYNC', 5: '333.333.333-33', 7: '120,00', 1: 'TESTE COM' }));
  const semLixeira = roda(c);
  assertEquals(ops(semLixeira.itens), ['novo']);
  const novo = semLixeira.itens[0] as { op: 'novo'; bloco: string; c: string[] };
  assertEquals(novo.bloco, 'D24');
  assertEquals(novo.c[2], 'TESTE GAMA SYNC');
  assertEquals(novo.c.length, NCOL);
  assertEquals(semLixeira.grupos[0].itens[0].detalhe, 'Entra no D24 · parcela 120,00 · comercial TESTE COM');
  // a linha nova fica FORA do espelho (na próxima rodada ela casa e se acerta)
  assertEquals(semLixeira.espelhoNovo.some((l) => l.valores[2] === 'TESTE GAMA SYNC'), false);

  const comLixeira = roda(c, { lixeira: new Map([[3, { trash_id: 'trash-1', lead_id: 'lead-velho' }]]) });
  assertEquals(ops(comLixeira.itens), ['restaurar']);
  assertEquals(comLixeira.itens[0], { op: 'restaurar', trash_id: 'trash-1' });
  assert(comLixeira.grupos[0].itens[0].detalhe.includes('Lixeira'));
});

Deno.test('bloco novo na planilha → bloco_novo (comp_base pelo modelo D24/D01) + clientes dele', () => {
  const c = cenario();
  c.sheet.splice(4, 0, cabecalho('05/out', '05/set'), row({ 2: 'TESTE DELTA SYNC', 5: '444.444.444-44' }));
  const r = roda(c);
  assertEquals(ops(r.itens), ['bloco_novo', 'novo']);
  assertEquals(r.itens[0], { op: 'bloco_novo', id: 'D05', dia: 5, situacao: 'cancelado', comp_base: '2025-09' });
  assertEquals((r.itens[1] as { bloco: string }).bloco, 'D05');
});

Deno.test('bloco do sistema sumiu da planilha → freio estrutural', () => {
  const c = cenario();
  c.sheet.splice(4, 1);                           // some o cabeçalho do D01
  const r = roda(c);
  assert(r.freio !== null);
  assert(r.freio!.motivo.includes('D01'));
});

Deno.test('folha ilegível (linha antes do 1º cabeçalho) → freio estrutural, nada aplicado', () => {
  const c = cenario();
  c.sheet.unshift(row({ 2: 'PERDIDO SEM CABECALHO' }));
  const prep = preparar(c.sheet, c.sistema);
  assert(prep.erroEstrutura !== null);
  const r = roda(c);
  assertEquals(r.itens, []);
  assert(r.freio !== null);
  assertEquals(r.espelhoNovo, []);                // espelho intocado quando a folha não parseia
});

Deno.test('linha vazia removida na planilha → linha_sumiu (pela âncora anterior)', () => {
  const c = cenario();
  c.sheet.splice(3, 1);                           // some a vazia entre BETA e o cabeçalho do D01
  const r = roda(c);
  assertEquals(ops(r.itens), ['linha_sumiu']);
  assertEquals(r.itens[0], { op: 'linha_sumiu', linha_id: 'ln-v' });
});

/* ================= senhas ================= */

Deno.test('senha: hash no espelho; mudança vira pendência (conta) e o texto só vai no item', () => {
  const c = cenario();
  c.sheet[1][6] = 'senha-nova-123';
  const r = roda(c);
  assertEquals(r.itens, []);                      // senha não entra direto: o index decide
  assertEquals(r.senhas.length, 1);
  const s = r.senhas[0];
  assertEquals(s.tipo, 'inss');
  assertEquals(s.lead_id, 'lead-a');
  assertEquals(s.conta, true);
  assertEquals(s.item.texto, 'senha-nova-123');
  assertEquals(s.sHash, marcaSenha('senha-nova-123'));
  assertEquals(r.mudancas, 1);
  // no espelho novo, NUNCA o texto: sempre sha256:
  const espA = r.espelhoNovo.find((l) => l.lead_id === 'lead-a')!;
  assertEquals(espA.valores[6], marcaSenha('senha-nova-123'));
  assert(!JSON.stringify(r.espelhoNovo).includes('senha-nova-123'));
});

Deno.test('senha sem espelho (1ª rodada): pendência cega (não conta como mudança)', () => {
  const c = cenario();
  c.sheet[1][6] = 'senha-qualquer';
  const r = roda(c, { espelho: [] });
  const s = r.senhas.find((x) => x.lead_id === 'lead-a' && x.tipo === 'inss')!;
  assertEquals(s.conta, false);
  assertEquals(r.mudancas, 0);
});

/* ================= colunas novas e freio ================= */

Deno.test('coluna nova no FIM: mês quando todos os cabeçalhos trazem dd/…; senão livre', () => {
  const c = cenario();
  for (const r of c.sheet) while (r.length < 27) r.push('');
  c.sheet[0][25] = '26/out'; c.sheet[4][25] = '27/out';   // os 2 cabeçalhos → mês
  c.sheet[0][26] = 'OBS';                                  // só um cabeçalho → livre
  c.sheet[1][26] = 'cliente com obs';
  const prep = preparar(c.sheet, c.sistema);
  assertEquals(prep.colunasNovas, [
    { tipo: 'mes', mesPos: 14, titulo: 'Mês 15' },
    { tipo: 'livre', mesPos: null, titulo: 'OBS' },
  ]);
  const r = roda(c);
  assertEquals(ops(r.itens), ['coluna_mes_nova', 'coluna_livre_nova']);
});

Deno.test('freio: saídas demais OU mudança em massa param a rodada', () => {
  const c = cenario();
  c.sheet.splice(2, 1);                           // 1 saída
  const r = roda(c, { limites: { saidas: 0, pct: 2000 } });
  assert(r.freio !== null);
  assert(r.freio!.motivo.includes('1 clientes'));
  const c2 = cenario();
  c2.sheet[1][24] = '51994444444';                // 1 mudança com pct=10 e 2 clientes → 100*1 > 2*10
  const r2 = roda(c2, { limites: { saidas: 10, pct: 10 } });
  assert(r2.freio !== null);
  assert(r2.freio!.motivo.includes('limite de segurança'));
});

/* ================= espelho ================= */

Deno.test('espelho cobre as 2 abas; cancelados entra só no espelho (sem itens)', () => {
  const c = cenario();
  const cancelados = [cabecalho('24/set', '24/ago'), row({ 2: 'TESTE CANCELADO SYNC', 6: 'senha-x' })];
  const r = roda(c, { cancelados });
  assertEquals(r.itens, []);
  const doCanc = r.espelhoNovo.filter((l) => l.aba === ABA_CANCELADOS);
  assertEquals(doCanc.map((l) => l.tipo), ['cabecalho', 'cliente']);
  assertEquals(doCanc[1].valores[6], marcaSenha('senha-x'));
  assertEquals(r.espelhoNovo.filter((l) => l.aba === ABA_MENSAL).length, c.sheet.length);
});

Deno.test('blocosDoSistema: ordem dos cabeçalhos/rótulo', () => {
  const c = cenario();
  assertEquals(blocosDoSistema(c.sistema.linhas), ['D24', 'D01', 'NOVOS']);
});
