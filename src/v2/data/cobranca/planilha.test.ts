import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// sem Supabase nos testes: a fábrica cai no repo demo e nada vai pra rede
vi.mock('@/lib/supabase', () => ({ isRevizaMode: false, supabase: null }));

import {
  valorBR, ehNaoPagou, estadoMes, dataCurta, dataNoTexto, extrairTelefone, fmtValorBR, fmtDataCurta,
  textoMes, textoEquivale, ehEstadoPagamento, plTrim, compSoma, mesesEntre, ordemEntre, ordemComFolga, letraColuna,
  normalizarEstilo, normalizarPatchColuna, prepararItens, normalizarDados,
  aplicarCamadas, PendentesPlanilha, estadoMesCelula, compDaCelula, normalizarEntradaCel, pendentesForaDosDados,
  type PlDados, type PlLinha, type PlColuna, type EntradaCel,
} from './planilha';
import { criarPlanilhaRepoDemo, PL_LS } from './planilha.demo';
import { criarRepoDemo } from './cobrancaRepo.demo';
import { gsCarregar, gsSalvar, decididasCarregar, GS_LS } from './demoStore';

// o ano das datas curtas depende de HOJE (regra do pl_data_partes): relógio fixo
// no dia da carga; testes que precisam de outro dia trocam dentro deles
beforeEach(() => { vi.setSystemTime('2026-09-25'); });
afterEach(() => { vi.useRealTimers(); });

/* ------------------------- parsers (§2.1) ------------------------- */

describe('valorBR — mesma regra do SQL (private.pl_valor)', () => {
  it('aceita os formatos do contrato', () => {
    expect(valorBR('263,81')).toBe(263.81);
    expect(valorBR('230,9')).toBe(230.9);
    expect(valorBR('224')).toBe(224);
    expect(valorBR('1.343,50')).toBe(1343.5);
    expect(valorBR('1343.50')).toBe(1343.5);
    expect(valorBR('R$ 1.343,50')).toBe(1343.5);
    expect(valorBR('r$230,90 ')).toBe(230.9);
    expect(valorBR('1.343')).toBe(1343);
    expect(valorBR('1.343.500')).toBe(1343500);
    expect(valorBR('1234.567')).toBe(1234567); // "." + 3 dígitos no fim = milhar
    expect(valorBR('0,50')).toBe(0.5);
    expect(valorBR('9999999,99')).toBe(9999999.99);
    expect(valorBR('0')).toBe(0);
  });
  it('não conserta: o que não parseia é texto (null)', () => {
    expect(valorBR('R$ 3,4O')).toBeNull();
    expect(valorBR('-')).toBeNull();
    expect(valorBR('--')).toBeNull();
    expect(valorBR('')).toBeNull();
    expect(valorBR(null)).toBeNull();
    expect(valorBR('263,')).toBeNull();
    expect(valorBR('(51) 99999-9999')).toBeNull();
    expect(valorBR('05/08/2026')).toBeNull();
    expect(valorBR('AUGUSTO ')).toBeNull();
    expect(valorBR('-150')).toBeNull();
    expect(valorBR('1.2.3,5')).toBeNull();       // vírgula só nos 2 formatos BR
    expect(valorBR('12.34,5')).toBeNull();
    expect(valorBR('51999999999')).toBeNull();   // telefone só com dígitos: ≥ 10 mi = não é valor
    expect(valorBR('10000000')).toBeNull();
  });
});

describe('NÃO PAGOU e estado do mês', () => {
  it('variantes de NÃO PAGOU', () => {
    expect(ehNaoPagou('NÃO PAGOU')).toBe(true);
    expect(ehNaoPagou('não pagou')).toBe(true);
    expect(ehNaoPagou('NAO PAGOU ')).toBe(true);
    expect(ehNaoPagou(' Não Pagou')).toBe(true);
    expect(ehNaoPagou('NÃO  PAGOU')).toBe(true);   // o SQL junta os espaços do miolo
    expect(ehNaoPagou('não\tpagou\n')).toBe(true);
    expect(ehNaoPagou('NAOPAGOU')).toBe(false);
    expect(ehNaoPagou('não pagou.')).toBe(false);
    expect(ehNaoPagou(null)).toBe(false);
  });
  it('mês → estado', () => {
    expect(estadoMes('150')).toEqual({ estado: 'pago', valor: 150 });
    expect(estadoMes('1.343,505')).toEqual({ estado: 'pago', valor: 1343.51 });
    expect(estadoMes('NÃO PAGOU')).toEqual({ estado: 'nao_pagou' });
    for (const t of ['', '-', '--', '0', '05/08/2026', 'AUGUSTO ', '(51) 99999-9999', null]) {
      expect(estadoMes(t)).toEqual({ estado: 'nada' });
    }
  });
});

describe('datas curtas', () => {
  it('dataCurta = texto INTEIRO (fechamento); sem ano, em 25/09/2026: out–dez 2025, jan–set 2026', () => {
    expect(dataCurta('15/jan')).toBe('2026-01-15');
    expect(dataCurta(' 03/dez. ')).toBe('2025-12-03');
    expect(dataCurta('5/out')).toBe('2025-10-05');
    expect(dataCurta('10/set')).toBe('2026-09-10');
    expect(dataCurta('15/Jan')).toBe('2026-01-15');
    expect(dataCurta('01/02/26')).toBe('2026-02-01');
    expect(dataCurta('29/02/2028')).toBe('2028-02-29');
    expect(dataCurta('SEM DEBITO 14/08/2025')).toBeNull(); // não é o texto inteiro
    expect(dataCurta('15/janeiro')).toBeNull();
    expect(dataCurta('31/04')).toBeNull();
    expect(dataCurta('30/fev')).toBeNull();
    expect(dataCurta('12/xyz')).toBeNull();
    expect(dataCurta('')).toBeNull();
    expect(dataCurta(null)).toBeNull();
  });
  it('dataNoTexto = 1ª data achada (reclame / parou)', () => {
    expect(dataNoTexto('SEM DEBITO 14/08/2025')).toBe('2025-08-14');
    expect(dataNoTexto('reclame aqui 15/10 - xyz')).toBe('2025-10-15');
    expect(dataNoTexto('débito cancelado 16/04')).toBe('2026-04-16');
    expect(dataNoTexto('aqui26/02')).toBe('2026-02-26');
    expect(dataNoTexto('RA 07/03- abc')).toBe('2026-03-07');
    expect(dataNoTexto('RA 07/mar. - abc')).toBe('2026-03-07');
    expect(dataNoTexto('data 31/04 e depois 02/05')).toBe('2026-05-02'); // 1ª inválida, vale a próxima
    expect(dataNoTexto('parou 14/08/202')).toBe('2026-08-14');
  });
  it('não inventa data', () => {
    expect(dataNoTexto('23/009')).toBeNull();
    expect(dataNoTexto('123/05')).toBeNull();
    expect(dataNoTexto('10/setembro')).toBeNull();
    expect(dataNoTexto('15/12x')).toBeNull();
    expect(dataNoTexto('sem data')).toBeNull();
    expect(dataNoTexto('00/10')).toBeNull();
    expect(dataNoTexto(null)).toBeNull();
  });
  it('ano sem texto = o corrente; depois de hoje+7 dias → o anterior (a partir de out/2026 "05/out" é 2026)', () => {
    vi.setSystemTime(new Date('2026-10-20T12:00:00-03:00'));
    expect(dataCurta('05/out')).toBe('2026-10-05');
    expect(dataCurta('27/out')).toBe('2026-10-27');   // hoje+7 ainda vale o ano corrente
    expect(dataCurta('28/out')).toBe('2025-10-28');
    expect(dataCurta('15/nov')).toBe('2025-11-15');
    expect(dataCurta('15/jan')).toBe('2026-01-15');
    expect(dataNoTexto('PAROU 15/10')).toBe('2026-10-15');
    expect(dataNoTexto('reclame aqui 03/12 - x')).toBe('2025-12-03');
    expect(dataCurta('06/10/25')).toBe('2025-10-06'); // com ano: vale o escrito
  });
  it('ref = 1º mês pago do cliente (pl_mes_ref): mês depois dele volta 1 ano, nunca antes de 2025', () => {
    expect(dataCurta('15/03', '2025-09')).toBe('2025-03-15');
    expect(dataCurta('15/03', '2026-01')).toBe('2025-03-15');
    expect(dataCurta('15/01', '2026-01')).toBe('2026-01-15');
    expect(dataCurta('15/12', '2025-09')).toBe('2025-12-15');
    expect(dataNoTexto('PAROU 20/08', '2025-09')).toBe('2025-08-20');
    expect(dataCurta('15/03/2026', '2025-09')).toBe('2026-03-15'); // com ano: vale o escrito
    expect(fmtDataCurta('2026-03-15', '2025-09')).toBe('15/03/2026');
    expect(fmtDataCurta('2025-03-15', '2025-09')).toBe('15/mar');
    expect(textoEquivale('fechamento', '15/mar', '2025-03-15', '2025-09')).toBe(true);
  });
  it('nunca antes de 2025 (a carteira começou em ago/2025)', () => {
    vi.setSystemTime(new Date('2025-09-01T12:00:00-03:00'));
    expect(dataCurta('15/dez')).toBe('2025-12-15');
    expect(dataCurta('10/ago')).toBe('2025-08-10');
  });
  it('"hoje" é o dia em São Paulo (igual ao now() at time zone do SQL), não o UTC', () => {
    vi.setSystemTime(new Date('2026-09-30T23:30:00-03:00')); // já é 01/10 em UTC
    expect(dataCurta('07/out')).toBe('2026-10-07');
    expect(dataCurta('08/out')).toBe('2025-10-08');
  });
});

describe('extrairTelefone', () => {
  it('1ª sequência de 10–13 dígitos', () => {
    expect(extrairTelefone('(51) 99999-9999')).toBe('51999999999');
    expect(extrairTelefone('51 99999-9999 - esposo')).toBe('51999999999');
    expect(extrairTelefone('51-99999-9999')).toBe('51999999999');
    expect(extrairTelefone('+55 51 99999-9999')).toBe('5551999999999');
    expect(extrairTelefone('51 99999–9999')).toBe('51999999999'); // travessão
  });
  it('sem telefone → null (não mexe no sistema)', () => {
    expect(extrairTelefone('756 - BANCO X OP: 1234 - PA 5')).toBeNull();
    expect(extrairTelefone('(51) 99999-9999 - (51) 98888-8888')).toBeNull(); // 22 dígitos juntos
    expect(extrairTelefone('')).toBeNull();
    expect(extrairTelefone(null)).toBeNull();
  });
});

describe('formatadores reversos', () => {
  it('valor', () => {
    expect(fmtValorBR(263.81)).toBe('263,81');
    expect(fmtValorBR(224)).toBe('224');
    expect(fmtValorBR(230.9)).toBe('230,9');
    expect(fmtValorBR(1343.5)).toBe('1343,5');
    expect(fmtValorBR(0.1 + 0.2)).toBe('0,3');
  });
  it('pagamento → texto (pl_mes_texto); mantém o que já diz o mesmo; nota nunca é apagada', () => {
    expect(textoMes('x', 'pago', 150.5)).toBe('150,5');
    expect(textoMes('R$ 150,50', 'pago', 150.5)).toBe('R$ 150,50');
    expect(textoMes(null, 'pago', 224)).toBe('224');
    expect(textoMes('', 'nao_pagou')).toBe('NÃO PAGOU');
    expect(textoMes('não pagou ', 'nao_pagou')).toBe('não pagou ');
    expect(textoMes('150', 'fora')).toBe('-');
    expect(textoMes(' - ', 'fora')).toBe(' - ');
    expect(textoMes('150', null)).toBeNull();
    expect(textoMes('NÃO PAGOU', null)).toBeNull();
    expect(textoMes('-', null)).toBeNull();
    expect(textoMes(null, null)).toBeNull();
    expect(textoMes('AUGUSTO ', null)).toBe('AUGUSTO ');
    expect(textoMes('05/08/2026', null)).toBe('05/08/2026');
    expect(ehEstadoPagamento('--')).toBe(false);
    expect(plTrim('\u00a0 x \t')).toBe('x');
  });
  it('equivalência (gatilho reverso não reescreve)', () => {
    expect(textoEquivale('valor', 'R$ 263,81', '263.81')).toBe(true);
    expect(textoEquivale('valor', '', '0.00')).toBe(true);
    expect(textoEquivale('valor', '263,81', '263.82')).toBe(false);
    expect(textoEquivale('fechamento', '15/jan', '2026-01-15')).toBe(true);
    expect(textoEquivale('fechamento', '15/jan', '2026-01-16')).toBe(false);
    expect(textoEquivale('telefone', '(51) 99999-9999', '51999999999')).toBe(true);
    expect(textoEquivale('nome', ' JOSE ', 'JOSE')).toBe(true);
    expect(textoEquivale('nome', 'JOSE', 'JOSÉ')).toBe(false);
  });
  it('fechamento ISO → DD/mmm', () => {
    expect(fmtDataCurta('2026-01-15')).toBe('15/jan');
    expect(fmtDataCurta('2025-12-03')).toBe('03/dez');
    expect(fmtDataCurta('15/01')).toBe('15/01');
    expect(fmtDataCurta('2026-13-01')).toBe('2026-13-01');
    expect(fmtDataCurta('')).toBe('');
  });
  it('fechamento ISO → DD/MM/AAAA quando o curto leria outro ano (ida e volta nunca perde o ano)', () => {
    expect(fmtDataCurta('2026-10-05')).toBe('05/10/2026'); // "05/out" hoje seria 2025
    expect(fmtDataCurta('2024-05-01')).toBe('01/05/2024');
    expect(fmtDataCurta('2026-02-30')).toBe('30/02/2026'); // não é data: nem o curto
    expect(textoEquivale('fechamento', fmtDataCurta('2026-10-05'), '2026-10-05')).toBe(true);
    for (let t = Date.UTC(2025, 7, 1); t <= Date.UTC(2027, 11, 31); t += 86_400_000) {
      const iso = new Date(t).toISOString().slice(0, 10);
      expect(dataCurta(fmtDataCurta(iso))).toBe(iso);
    }
  });
});

describe('meses, ordem e letras', () => {
  it('compSoma / mesesEntre', () => {
    expect(compSoma('2025-08', 0)).toBe('2025-08');
    expect(compSoma('2025-08', 5)).toBe('2026-01');
    expect(compSoma('2025-09', 13)).toBe('2026-10');
    expect(compSoma('2026-01', -1)).toBe('2025-12');
    expect(mesesEntre('2025-08', '2026-01')).toBe(5);
    expect(mesesEntre('2025-09', '2025-08')).toBe(-1);
  });
  it('ordemEntre', () => {
    expect(ordemEntre(null, null)).toBe(1000);
    expect(ordemEntre(1000, 2000)).toBe(1500);
    expect(ordemEntre(null, 1000)).toBe(0);
    expect(ordemEntre(3000, null)).toBe(4000);
  });
  it('ordemComFolga: meio-termo; sem folga (< 1e-6) abre espaço como o banco', () => {
    const itens = [{ id: 'a', ordem: 1000 }, { id: 'b', ordem: 2000 }, { id: 'c', ordem: 3000 }];
    expect(ordemComFolga(itens, 1000, true)).toEqual({ ordem: 1500, empurrar: new Map() });
    expect(ordemComFolga(itens, 3000, true).ordem).toBe(4000);
    expect(ordemComFolga(itens, 1000, false).ordem).toBe(0);
    expect(ordemComFolga(itens, 1000, true, 'b').ordem).toBe(2000); // `sem` = quem está se mexendo
    const apertado = [{ id: 'a', ordem: 1000 }, { id: 'b', ordem: 1000 + 5e-7 }, { id: 'c', ordem: 3000 }];
    const depois = ordemComFolga(apertado, 1000, true);
    expect([...depois.empurrar]).toEqual([['b', apertado[1].ordem + 1000], ['c', 4000]]); // as de baixo +1000
    expect(depois.ordem).toBeCloseTo(1500, 6);
    const antes = ordemComFolga(apertado, 1000 + 5e-7, false);
    expect([...antes.empurrar]).toEqual([['a', 0]]);                        // as de cima −1000
    expect(antes.ordem).toBeCloseTo(500, 6);
  });
  it('200 inserções no fim do mesmo bloco: nenhuma colide nem passa da linha de baixo', () => {
    const itens = [{ id: 'ult', ordem: 5000 }, { id: 'branca', ordem: 6000 }, { id: 'cab', ordem: 7000 }];
    let ref = 5000;
    for (let i = 0; i < 200; i++) {
      const { ordem, empurrar } = ordemComFolga(itens, ref, true);
      for (const x of itens) { const o = empurrar.get(x.id); if (o !== undefined) x.ordem = o; }
      itens.push({ id: `n${i}`, ordem });
      ref = ordem;
    }
    const ids = [...itens].sort((a, b) => a.ordem - b.ordem).map((x) => x.id);
    expect(ids).toEqual(['ult', ...Array.from({ length: 200 }, (_, i) => `n${i}`), 'branca', 'cab']);
    expect(new Set(itens.map((x) => x.ordem)).size).toBe(itens.length);
  });
  it('letraColuna', () => {
    expect(letraColuna(0)).toBe('A');
    expect(letraColuna(24)).toBe('Y');
    expect(letraColuna(25)).toBe('Z');
    expect(letraColuna(26)).toBe('AA');
    expect(letraColuna(27)).toBe('AB');
    expect(letraColuna(701)).toBe('ZZ');
    expect(letraColuna(702)).toBe('AAA');
  });
});

describe('normalizações', () => {
  it('estilo', () => {
    expect(normalizarEstilo({ bg: '#00b050', b: true, i: false, al: 'x' })).toEqual({ bg: '#00B050', b: true });
    expect(normalizarEstilo({ fg: 'fff', al: 'c' })).toEqual({ fg: '#FFFFFF', al: 'c' });
    expect(normalizarEstilo({ bg: 'vermelho' })).toBeNull();
    expect(normalizarEstilo({})).toBeNull();
    expect(normalizarEstilo(null)).toBeNull();
  });
  it('patch de coluna (largura 30..900)', () => {
    expect(normalizarPatchColuna({ largura: 2000 })).toEqual({ largura: 900 });
    expect(normalizarPatchColuna({ largura: 10.4, titulo: '  X ' })).toEqual({ largura: 30, titulo: 'X' });
  });
  it('itens: "" vira null, repetidos viram 1 (a última vence), vazios saem', () => {
    const r = prepararItens([
      { l: 'a', c: '1', t: 'x' }, { l: 'a', c: '1', s: { b: true } }, { l: 'a', c: '1', t: '' },
      { l: 'b', c: '1' }, { l: '', c: '1', t: 'z' },
    ]);
    expect(r).toEqual([{ l: 'a', c: '1', t: null, s: { b: true } }]);
  });
  it('planilha_dados → PlDados (célula [t,s])', () => {
    const d = normalizarDados({
      blocos: [{ id: 'D24', dia: 24, situacao: 'cancelado', comp_base: '2025-08' }],
      colunas: [{ id: 'k2', ordem: 2000, titulo: 'B', tipo: 'livre', campo: null, mes_pos: null, largura: 90, oculta: false },
        { id: 'k1', ordem: 1000, titulo: 'A', tipo: 'mes', campo: null, mes_pos: 0, largura: 84, oculta: true }],
      linhas: [{ id: 'l1', ordem: 1000, tipo: 'cliente', bloco: 'D24', lead_id: 'x', altura: null, c: { k1: ['150 ', null], k2: [null, { bg: '#ff0000' }], k3: [null, null] } }],
    });
    expect(d.blocos[0]).toEqual({ id: 'D24', dia: 24, situacao: 'cancelado', compBase: '2025-08' });
    expect(d.colunas.map((c) => c.id)).toEqual(['k1', 'k2']);
    expect(d.colunas[0].mesPos).toBe(0);
    expect(d.linhas[0].leadId).toBe('x');
    expect(d.linhas[0].c).toEqual({ k1: { t: '150 ', s: null }, k2: { t: null, s: { bg: '#FF0000' } } });
  });
});

/* --------------- estado de pagamento da célula de mês --------------- */

describe('entradas na célula de mês (pagamento informado → financeiro)', () => {
  const colMes: PlColuna = { id: 'm0', ordem: 1000, titulo: 'Mês 1', tipo: 'mes', campo: null, mesPos: 2, largura: 84, oculta: false };
  const colLivre: PlColuna = { id: 'lv', ordem: 2000, titulo: 'OBS', tipo: 'livre', campo: null, mesPos: null, largura: 90, oculta: false };
  const pend: EntradaCel = { st: 'pendente', id: 'e1', v: 150, por: 'Ana (comercial)', em: '2026-09-25T13:00:00.000Z', dec: null, mot: null, cp: true };
  const rec: EntradaCel = { st: 'recusada', id: 'e0', v: 140, por: 'Ana (comercial)', em: '2026-09-20T13:00:00.000Z', dec: '2026-09-21T10:00:00.000Z', mot: 'não caiu', cp: false };
  const linha = (t: string | null, e?: EntradaCel, tipo: PlLinha['tipo'] = 'cliente'): PlLinha => ({
    id: 'l1', ordem: 1000, tipo, bloco: 'D24', leadId: tipo === 'cliente' ? 'x' : null, altura: null,
    c: t == null ? {} : { m0: { t, s: { bg: '#FF0000' } } }, ...(e ? { e: { m0: e } } : {}),
  });
  const dd: Pick<PlDados, 'blocos'> = { blocos: [
    { id: 'D24', dia: 24, situacao: 'cancelado', compBase: '2025-11' },
    { id: 'NOVOS', dia: null, situacao: 'ativo', compBase: null },
  ] };

  it('prioridade: pendente > pago > não pagou > recusado', () => {
    expect(estadoMesCelula(linha('NÃO PAGOU', pend), colMes, dd)).toEqual({ tipo: 'pendente', valor: 150, entrada: pend });
    expect(estadoMesCelula(linha('263,81', pend), colMes, dd)).toEqual({ tipo: 'pendente', valor: 150, entrada: pend });
    expect(estadoMesCelula(linha(null, pend), colMes, dd).tipo).toBe('pendente');
    expect(estadoMesCelula(linha('263,81', rec), colMes, dd)).toEqual({ tipo: 'pago', valor: 263.81 });
    expect(estadoMesCelula(linha('263,81'), colMes, dd)).toEqual({ tipo: 'pago', valor: 263.81 });
    expect(estadoMesCelula(linha('não pagou ', rec), colMes, dd)).toEqual({ tipo: 'nao_pagou', valor: null });
    expect(estadoMesCelula(linha('-', rec), colMes, dd)).toEqual({ tipo: 'recusado', valor: 140, entrada: rec });
    expect(estadoMesCelula(linha(null, rec), colMes, dd)).toEqual({ tipo: 'recusado', valor: 140, entrada: rec });
    expect(estadoMesCelula(linha('nota', rec), colMes, dd).tipo).toBe('recusado');
  });
  it('sem estado: vazio, "-", "0", notas; coluna que não é de mês; linha que não é cliente', () => {
    for (const t of [null, '', '-', '--', '0', 'AUGUSTO ', '05/08/2026']) expect(estadoMesCelula(linha(t), colMes, dd)).toEqual({ tipo: null, valor: null });
    expect(estadoMesCelula({ ...linha('150', pend), c: { lv: { t: '150', s: null } }, e: { lv: pend } }, colLivre, dd)).toEqual({ tipo: null, valor: null });
    expect(estadoMesCelula(linha('150', pend, 'cabecalho'), colMes, dd)).toEqual({ tipo: null, valor: null });
  });
  it('sem estado quando a célula não liga a pagamento: NOVOS (sem mês-base), sem bloco, bloco que não existe', () => {
    // NOVOS: o mês é só texto — número não é "Pago", NÃO PAGOU não é "Não pago"
    for (const t of ['150', '263,81', 'NÃO PAGOU']) {
      expect(estadoMesCelula({ ...linha(t), bloco: 'NOVOS' }, colMes, dd)).toEqual({ tipo: null, valor: null });
    }
    expect(estadoMesCelula({ ...linha('150', pend), bloco: 'NOVOS' }, colMes, dd)).toEqual({ tipo: null, valor: null });
    expect(estadoMesCelula({ ...linha('150'), bloco: null }, colMes, dd)).toEqual({ tipo: null, valor: null });
    expect(estadoMesCelula({ ...linha('150'), bloco: 'D99' }, colMes, dd)).toEqual({ tipo: null, valor: null });
    expect(estadoMesCelula(linha('150'), { ...colMes, mesPos: null }, dd)).toEqual({ tipo: null, valor: null });
    // o mesmo texto num ciclo com mês-base é pago
    expect(estadoMesCelula(linha('150'), colMes, dd)).toEqual({ tipo: 'pago', valor: 150 });
  });
  it('pendentesForaDosDados: pendente da folha que os Dados ainda não têm (recusada não conta)', () => {
    const d: PlDados = { blocos: dd.blocos, colunas: [colMes], linhas: [
      linha('150', pend), { ...linha(null, rec), id: 'l2' }, { ...linha(null, { ...pend, id: 'e2' }), id: 'l3' },
    ] };
    expect(pendentesForaDosDados(d, [])).toEqual(['e1', 'e2']);
    expect(pendentesForaDosDados(d, [{ id: 'e1' }])).toEqual(['e2']);
    expect(pendentesForaDosDados(d, [{ id: 'e1' }, { id: 'e2' }])).toEqual([]);
  });
  it('compDaCelula = comp_base do bloco + mes_pos; NOVOS / sem bloco / não-mês → null', () => {
    const dados = { blocos: [
      { id: 'D24', dia: 24, situacao: 'cancelado' as const, compBase: '2025-11' },
      { id: 'NOVOS', dia: null, situacao: 'ativo' as const, compBase: null },
    ] };
    expect(compDaCelula(dados, linha('150'), colMes)).toBe('2026-01');
    expect(compDaCelula(dados, { ...linha('150'), bloco: 'NOVOS' }, colMes)).toBeNull();
    expect(compDaCelula(dados, { ...linha('150'), bloco: null }, colMes)).toBeNull();
    expect(compDaCelula(dados, { ...linha('150'), bloco: 'D99' }, colMes)).toBeNull();
    expect(compDaCelula(dados, linha('150'), colLivre)).toBeNull();
  });
  it('planilha_dados lê o "e" ({st,id,v,por,em,dec,mot,cp}); inválido sai', () => {
    const d = normalizarDados({
      blocos: [], colunas: [],
      linhas: [
        { id: 'l1', ordem: 1000, tipo: 'cliente', bloco: 'D24', lead_id: 'x', altura: null, c: {},
          e: {
            m0: { st: 'pendente', id: 'e1', v: '150.5', por: 'Ana (comercial)', em: '2026-09-25T13:00:00Z', dec: null, mot: null, cp: true },
            m1: { st: 'recusada', id: 'e0', v: 140, por: 'Ana (comercial)', em: '2026-09-20T13:00:00Z', dec: '2026-09-21T10:00:00Z', mot: 'não caiu', cp: false },
            m2: { st: 'confirmada', id: 'e9', v: 1 },
            m3: { st: 'pendente', v: 1 },
            m4: null,
          } },
        { id: 'l2', ordem: 2000, tipo: 'cliente', bloco: 'D24', lead_id: 'y', altura: null, c: {}, e: { m0: { st: 'x' } } },
        { id: 'l3', ordem: 3000, tipo: 'cliente', bloco: 'D24', lead_id: 'z', altura: null, c: {} },
      ],
    });
    expect(d.linhas[0].e).toEqual({
      m0: { st: 'pendente', id: 'e1', v: 150.5, por: 'Ana (comercial)', em: '2026-09-25T13:00:00Z', dec: null, mot: null, cp: true },
      m1: { st: 'recusada', id: 'e0', v: 140, por: 'Ana (comercial)', em: '2026-09-20T13:00:00Z', dec: '2026-09-21T10:00:00Z', mot: 'não caiu', cp: false },
    });
    expect(d.linhas[1].e).toBeUndefined();
    expect('e' in d.linhas[2]).toBe(false);
    expect(normalizarEntradaCel({ st: 'recusada', id: 7, v: 'x', mot: '' })).toEqual({ st: 'recusada', id: '7', v: 0, por: '', em: '', dec: null, mot: null, cp: false });
  });
  it('camadas (otimista) não perdem o "e" da linha', () => {
    const d: PlDados = { blocos: [], colunas: [colMes], linhas: [linha('150', pend)] };
    const r = aplicarCamadas(d, [{ k: 'cel', mut: 1, l: 'l1', c: 'm0', temT: true, t: 'NÃO PAGOU', temS: false, s: null }]);
    expect(r.linhas[0].e).toEqual({ m0: pend });
    expect(estadoMesCelula(r.linhas[0], colMes, dd).tipo).toBe('pendente');
  });
});

/* ---------------------- otimista em camadas ---------------------- */

const base = (t: string): PlDados => ({
  blocos: [], colunas: [{ id: 'c1', ordem: 1000, titulo: 'A', tipo: 'livre', campo: null, mesPos: null, largura: 90, oculta: false }],
  linhas: [{ id: 'l1', ordem: 1000, tipo: 'vazia', bloco: null, leadId: null, altura: null, c: { c1: { t, s: null } } },
    { id: 'l2', ordem: 2000, tipo: 'vazia', bloco: null, leadId: null, altura: null, c: {} }],
});

describe('PendentesPlanilha', () => {
  it('edição sobrevive a refetch até uma leitura DEPOIS da confirmação', () => {
    const p = new PendentesPlanilha();
    p.aoLer(p.iniciarLeitura(), base('velho'));
    const m = p.novoMut();
    p.empilhar([{ k: 'cel', mut: m, l: 'l1', c: 'c1', temT: true, t: 'novo', temS: false, s: null }]);
    // refetch antes do banco confirmar: continua "novo"
    const r1 = p.iniciarLeitura();
    expect(p.aoLer(r1, base('velho')).linhas[0].c.c1.t).toBe('novo');
    // leitura que saiu ANTES da confirmação e volta depois: ainda "novo"
    const r2 = p.iniciarLeitura();
    p.confirmar(m);
    expect(p.aoLer(r2, base('velho')).linhas[0].c.c1.t).toBe('novo');
    expect(p.quantas).toBe(1);
    // leitura que começou DEPOIS da confirmação: vale o servidor, camada sai
    const r3 = p.iniciarLeitura();
    expect(p.aoLer(r3, base('novo')).linhas[0].c.c1.t).toBe('novo');
    expect(p.quantas).toBe(0);
  });
  it('leitura atrasada (começou antes de outra já aplicada) não volta a folha pra trás', () => {
    const p = new PendentesPlanilha();
    const velha = p.iniciarLeitura();
    const nova = p.iniciarLeitura();
    expect(p.aoLer(nova, base('novo')).linhas[0].c.c1.t).toBe('novo');
    expect(p.aoLer(velha, base('velho')).linhas[0].c.c1.t).toBe('novo');
    // e um erro depois recalcula a partir da MAIS NOVA
    const m = p.novoMut();
    p.empilhar([{ k: 'cel', mut: m, l: 'l2', c: 'c1', temT: true, t: 'x', temS: false, s: null }]);
    expect(p.descartar([m])!.linhas[0].c.c1.t).toBe('novo');
  });
  it('erro tira só as camadas daquela mutação', () => {
    const p = new PendentesPlanilha();
    p.aoLer(p.iniciarLeitura(), base('velho'));
    const a = p.novoMut(); const b = p.novoMut();
    p.empilhar([{ k: 'cel', mut: a, l: 'l1', c: 'c1', temT: true, t: 'A', temS: false, s: null }]);
    p.empilhar([{ k: 'cel', mut: b, l: 'l2', c: 'c1', temT: true, t: 'B', temS: true, s: { b: true } }]);
    const volta = p.descartar([a])!;
    expect(volta.linhas[0].c.c1.t).toBe('velho');
    expect(volta.linhas[1].c.c1).toEqual({ t: 'B', s: { b: true } });
  });
  it('camadas: limpar célula, estilo só, mover linha e coluna', () => {
    const d = base('x');
    const r = aplicarCamadas(d, [
      { k: 'cel', mut: 1, l: 'l1', c: 'c1', temT: true, t: null, temS: false, s: null },
      { k: 'cel', mut: 1, l: 'l2', c: 'c1', temT: false, t: null, temS: true, s: { bg: '#FF0000' } },
      { k: 'lin', mut: 2, id: 'l2', ordem: 500 },
      { k: 'col', mut: 3, id: 'c1', patch: { largura: 200, oculta: true } },
    ]);
    expect(r.linhas.map((l) => l.id)).toEqual(['l2', 'l1']);
    expect(r.linhas[1].c).toEqual({});
    expect(r.linhas[0].c.c1).toEqual({ t: null, s: { bg: '#FF0000' } });
    expect(r.colunas[0]).toMatchObject({ largura: 200, oculta: true });
    expect(d.linhas[0].c.c1.t).toBe('x'); // original intacto
  });
});

/* ------------------ demo ligado ao store (§2.2) ------------------ */

function instalarLocalStorage() {
  const mem = new Map<string, string>();
  const ls = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => { mem.set(k, String(v)); },
    removeItem: (k: string) => { mem.delete(k); },
    clear: () => { mem.clear(); },
    key: (i: number) => [...mem.keys()][i] ?? null,
    get length() { return mem.size; },
  };
  Object.defineProperty(globalThis, 'localStorage', { value: ls, configurable: true, writable: true });
}

describe('repo demo — semeia e sincroniza com o store demo', () => {
  beforeEach(() => { instalarLocalStorage(); localStorage.removeItem(PL_LS); localStorage.removeItem(GS_LS); });

  const col = (d: PlDados, campo: string) => d.colunas.find((c) => c.campo === campo)!;
  const mes = (d: PlDados, k: number) => d.colunas.find((c) => c.tipo === 'mes' && c.mesPos === k)!;
  const clientes = (d: PlDados) => d.linhas.filter((l) => l.tipo === 'cliente');

  it('seed: um bloco por ciclo + NOVOS, cabeçalho por bloco, todos os clientes', async () => {
    const g = gsCarregar();
    const d = await criarPlanilhaRepoDemo().carregar();
    const dias = new Set(g.linhas.filter((l) => l.situacao === 'cancelado').map((l) => l.dia));
    expect(d.blocos.filter((b) => b.situacao === 'cancelado').length).toBe(dias.size);
    expect(d.blocos[d.blocos.length - 1]).toMatchObject({ id: 'NOVOS', compBase: null });
    expect(d.linhas.filter((l) => l.tipo === 'cabecalho').length).toBe(dias.size);
    expect(clientes(d).length).toBe(g.linhas.length);
    expect(d.colunas.filter((c) => c.tipo === 'mes').length).toBe(g.comps.length);
    const cab = d.linhas.find((l) => l.tipo === 'cabecalho')!;
    expect(cab.c[col(d, 'valor').id].t).toBe('PARCELA TOTAL');
  });

  it('célula ligada → store (valor, mês, nome, senha) com texto exato e avisos', async () => {
    const repo = criarPlanilhaRepoDemo();
    let d = await repo.carregar();
    const ln = clientes(d).find((l) => l.bloco !== 'NOVOS')!;
    const r = await repo.salvar([
      { l: ln.id, c: col(d, 'valor').id, t: 'R$ 1.343,50' },
      { l: ln.id, c: mes(d, 0).id, t: 'NÃO PAGOU' },
      { l: ln.id, c: mes(d, 1).id, t: '150,5' },
      { l: ln.id, c: mes(d, 2).id, t: 'AUGUSTO ' },
      { l: ln.id, c: col(d, 'nome').id, t: '  FULANO DE TAL  ' },
      { l: ln.id, c: col(d, 'senha_inss').id, t: 'segredo-demo' },
    ]);
    expect(r.avisos).toEqual([]);
    const lead = gsCarregar().linhas.find((g) => g.id === ln.leadId)!;
    expect(lead.valor).toBe(1343.5);
    expect(lead.celulas.slice(0, 3)).toEqual(['NÃO PAGOU', '150.5', '-']);
    expect(lead.nome).toBe('FULANO DE TAL');
    expect(lead.senha).toBe('segredo-demo');
    d = await repo.carregar();
    const l2 = d.linhas.find((x) => x.id === ln.id)!;
    expect(l2.c[col(d, 'valor').id].t).toBe('R$ 1.343,50');
    expect(l2.c[mes(d, 2).id].t).toBe('AUGUSTO ');
    expect(l2.c[col(d, 'nome').id].t).toBe('  FULANO DE TAL  ');
    expect(l2.c[col(d, 'senha_inss').id]).toBeUndefined(); // senha nunca vira texto de célula
    // valor que não parseia: texto muda, sistema não
    const r2 = await repo.salvar([{ l: ln.id, c: col(d, 'valor').id, t: 'R$ 3,4O' }]);
    expect(r2.avisos.length).toBe(1);
    expect(gsCarregar().linhas.find((g) => g.id === ln.leadId)!.valor).toBe(1343.5);
  });

  it('mudança FORA da planilha → texto da célula (e move de bloco)', async () => {
    const repo = criarPlanilhaRepoDemo();
    let d = await repo.carregar();
    const ln = clientes(d).find((l) => l.bloco !== 'NOVOS')!;
    const g = gsCarregar();
    const lead = g.linhas.find((x) => x.id === ln.leadId)!;
    lead.nome = 'NOME PELA FICHA';
    lead.valor = 230.9;
    lead.celulas = lead.celulas.map((c, i) => (i === 1 ? '99' : c));
    const outro = d.blocos.find((b) => b.situacao === 'cancelado' && b.id !== ln.bloco)!;
    lead.dia = outro.dia!;
    gsSalvar(g);
    d = await repo.carregar();
    const l2 = d.linhas.find((x) => x.id === ln.id)!;
    expect(l2.c[col(d, 'nome').id].t).toBe('NOME PELA FICHA');
    expect(l2.c[col(d, 'valor').id].t).toBe('230,9');
    expect(l2.c[mes(d, 1).id].t).toBe('99');
    expect(l2.bloco).toBe(outro.id);
    // ficou no FIM do bloco novo
    const doBloco = d.linhas.filter((x) => x.bloco === outro.id);
    expect(doBloco[doBloco.length - 1].id).toBe(ln.id);
  });

  it('inserir cliente, excluir (some) e restaurar (religa a mesma linha)', async () => {
    const repo = criarPlanilhaRepoDemo();
    let d = await repo.carregar();
    const ref = clientes(d).find((l) => l.bloco !== 'NOVOS')!;
    const bloco = d.blocos.find((b) => b.id === ref.bloco)!;
    const id = await repo.linhaInserir(ref.id, 'abaixo', 'cliente');
    d = await repo.carregar();
    const i = d.linhas.findIndex((x) => x.id === ref.id);
    expect(d.linhas[i + 1].id).toBe(id);
    const novo = d.linhas[i + 1];
    const lead = gsCarregar().linhas.find((g) => g.id === novo.leadId)!;
    expect(lead).toMatchObject({ dia: bloco.dia, situacao: 'cancelado', nome: '' });

    const cap = gsCarregar().linhas.find((g) => g.id === ref.leadId)!;
    await repo.salvar([{ l: ref.id, c: col(d, 'cpf').id, s: { bg: '#FFFF00' } }]);
    await repo.linhaExcluir(ref.id);
    expect(gsCarregar().linhas.some((g) => g.id === cap.id)).toBe(false);
    expect((await repo.carregar()).linhas.some((x) => x.id === ref.id)).toBe(false);
    // restaurar (igual ao desfazer do demo): o lead volta → a MESMA linha religa, com a cor
    const g = gsCarregar(); g.linhas = [cap, ...g.linhas]; gsSalvar(g);
    d = await repo.carregar();
    const volta = d.linhas.find((x) => x.id === ref.id)!;
    expect(volta.leadId).toBe(cap.id);
    expect(volta.c[col(d, 'cpf').id].s).toEqual({ bg: '#FFFF00' });
  });

  it('lead com ciclo novo cria o bloco no fim da folha', async () => {
    const repo = criarPlanilhaRepoDemo();
    await repo.carregar();
    const g = gsCarregar();
    const l = g.linhas.find((x) => x.situacao === 'cancelado')!;
    l.dia = 17;
    gsSalvar(g);
    const d = await repo.carregar();
    expect(d.blocos.some((b) => b.id === 'D17' && b.dia === 17)).toBe(true);
    const ult = d.linhas.slice(-2);
    expect(ult.map((x) => x.tipo)).toEqual(['cabecalho', 'cliente']);
    expect(ult[1].leadId).toBe(l.id);
  });

  it('colunas: livre cria/exclui; mês é o PRÓXIMO; mês não exclui', async () => {
    const repo = criarPlanilhaRepoDemo();
    let d = await repo.carregar();
    const nome = col(d, 'nome');
    const livre = await repo.colunaCriar({ ref: nome.id, lado: 'dir', tipo: 'livre', titulo: 'OBS' });
    const nMes = d.colunas.filter((c) => c.tipo === 'mes').length;
    const cabId = d.blocos[0].id;
    const m = await repo.colunaCriar({ ref: mes(d, nMes - 1).id, lado: 'dir', tipo: 'mes', titulo: '', cab: { [cabId]: '24/out' } });
    await repo.colunaAlterar(livre, { largura: 5000, oculta: true });
    d = await repo.carregar();
    const ids = d.colunas.map((c) => c.id);
    expect(ids.indexOf(livre)).toBe(ids.indexOf(nome.id) + 1);
    expect(d.colunas.find((c) => c.id === livre)).toMatchObject({ largura: 900, oculta: true });
    expect(d.colunas.find((c) => c.id === m)).toMatchObject({ tipo: 'mes', mesPos: nMes, titulo: `Mês ${nMes + 1}` });
    const cab = d.linhas.find((l) => l.tipo === 'cabecalho' && l.bloco === cabId)!;
    expect(cab.c[m].t).toBe('24/out');
    await expect(repo.colunaExcluir(m)).rejects.toThrow(/livre/);
    await repo.colunaExcluir(livre);
    expect((await repo.carregar()).colunas.some((c) => c.id === livre)).toBe(false);
  });

  it('60 clientes entrando no fim do mesmo bloco ficam no bloco (não passam da linha em branco)', async () => {
    const repo = criarPlanilhaRepoDemo();
    let d = await repo.carregar();
    const b0 = d.blocos.find((b) => b.situacao === 'cancelado')!;
    const g = gsCarregar();
    const modelo = g.linhas.find((x) => x.situacao === 'cancelado')!;
    for (let i = 0; i < 60; i++) g.linhas.push({ ...modelo, id: `novo-${i}`, nome: `N${i}`, dia: b0.dia! });
    gsSalvar(g);
    d = await repo.carregar();
    const idx = d.linhas.map((l, i) => (l.bloco === b0.id ? i : -1)).filter((i) => i >= 0);
    expect(idx[idx.length - 1] - idx[0] + 1).toBe(idx.length); // bloco contíguo
    const fim = d.linhas.slice(idx[idx.length - 1] - 59, idx[idx.length - 1] + 1).map((l) => l.leadId);
    expect(fim).toEqual(Array.from({ length: 60 }, (_, i) => `novo-${i}`));
    expect(new Set(d.linhas.map((l) => l.ordem)).size).toBe(d.linhas.length);
  });

  it('inserir cliente ACIMA de cabeçalho/rótulo é recusado; abaixo vira a 1ª linha do bloco', async () => {
    const repo = criarPlanilhaRepoDemo();
    let d = await repo.carregar();
    const cab = d.linhas.find((l) => l.tipo === 'cabecalho')!;
    const rot = d.linhas.find((l) => l.tipo === 'rotulo')!;
    await expect(repo.linhaInserir(cab.id, 'acima', 'cliente')).rejects.toThrow(/Inserir cliente abaixo/);
    await expect(repo.linhaInserir(rot.id, 'acima', 'cliente')).rejects.toThrow(/Inserir cliente abaixo/);
    const n = gsCarregar().linhas.length;
    const id = await repo.linhaInserir(cab.id, 'abaixo', 'cliente');
    d = await repo.carregar();
    expect(d.linhas[d.linhas.findIndex((x) => x.id === cab.id) + 1].id).toBe(id);
    expect(gsCarregar().linhas.length).toBe(n + 1);
    // linha em branco acima do cabeçalho continua valendo
    await expect(repo.linhaInserir(cab.id, 'acima', 'vazia')).resolves.toEqual(expect.any(String));
  });

  it('saindo de NOVOS pra um ciclo: o que foi digitado fica (só texto); pagamento real é escrito', async () => {
    const repo = criarPlanilhaRepoDemo();
    let d = await repo.carregar();
    const rot = d.linhas.find((l) => l.tipo === 'rotulo' && l.bloco === 'NOVOS')!;
    const id = await repo.linhaInserir(rot.id, 'abaixo', 'cliente');
    d = await repo.carregar();
    await repo.salvar([
      { l: id, c: mes(d, 0).id, t: '150' },
      { l: id, c: mes(d, 1).id, t: 'NÃO PAGOU', s: { bg: '#FF0000' } },
      { l: id, c: mes(d, 2).id, t: '-' },
      { l: id, c: mes(d, 4).id, t: 'nota' },
    ]);
    const leadId = d.linhas.find((x) => x.id === id)!.leadId!;
    const g = gsCarregar();
    const lead = g.linhas.find((x) => x.id === leadId)!;
    expect(lead.celulas.every((c) => c === '-')).toBe(true); // NOVOS: mês é só texto
    // pagamento de verdade (régua/Lançar) + aprovação pra um ciclo, FORA da planilha
    const ciclo = d.blocos.find((b) => b.situacao === 'cancelado' && b.compBase)!;
    const i2 = g.comps.indexOf(compSoma(ciclo.compBase!, 2));
    const i3 = g.comps.indexOf(compSoma(ciclo.compBase!, 3));
    const i4 = g.comps.indexOf(compSoma(ciclo.compBase!, 4));
    expect(Math.min(i2, i3, i4)).toBeGreaterThanOrEqual(0);
    lead.celulas = lead.celulas.map((c, i) => (i === i2 ? '80' : i === i3 ? '99' : i === i4 ? '77' : c));
    gsSalvar(g);
    d = await repo.carregar(); // ainda em NOVOS: o pagamento não escreve em mês sem base
    expect(d.linhas.find((x) => x.id === id)!.c[mes(d, 3).id]).toBeUndefined();
    const g2 = gsCarregar();
    const lead2 = g2.linhas.find((x) => x.id === leadId)!;
    lead2.situacao = 'cancelado'; lead2.dia = ciclo.dia!;
    gsSalvar(g2);
    d = await repo.carregar();
    const ln = d.linhas.find((x) => x.id === id)!;
    expect(ln.bloco).toBe(ciclo.id);
    expect(ln.c[mes(d, 0).id].t).toBe('150');
    expect(ln.c[mes(d, 1).id]).toEqual({ t: 'NÃO PAGOU', s: { bg: '#FF0000' } });
    expect(ln.c[mes(d, 2).id].t).toBe('80');   // estado com pagamento: segue o pagamento
    expect(ln.c[mes(d, 3).id].t).toBe('99');
    expect(ln.c[mes(d, 4).id].t).toBe('nota'); // nota nunca é sobrescrita
  });

  it('entre ciclos de mês-base diferente: texto e cor seguem o SEU mês; pagamento não muda', async () => {
    const repo = criarPlanilhaRepoDemo();
    let d = await repo.carregar();
    const [A, B] = d.blocos.filter((b) => b.situacao === 'cancelado' && b.compBase);
    // B passa a começar 1 mês depois de A (como D01..D07 × D24..D30 na planilha real)
    const folha = JSON.parse(localStorage.getItem(PL_LS)!) as { blocos: { id: string; compBase: string | null }[] };
    folha.blocos.find((b) => b.id === B.id)!.compBase = compSoma(A.compBase!, 1);
    localStorage.setItem(PL_LS, JSON.stringify(folha));
    d = await repo.carregar();
    const [ln, ln2] = clientes(d).filter((l) => l.bloco === A.id);
    const limpar = (id: string) => d.colunas.filter((c) => c.tipo === 'mes').map((c) => ({ l: id, c: c.id, t: null, s: null }));
    await repo.salvar([
      ...limpar(ln.id), ...limpar(ln2.id),
      { l: ln.id, c: mes(d, 0).id, t: 'AUGUSTO ' },                    // mês A+0: sem coluna em B
      { l: ln.id, c: mes(d, 2).id, t: '87', s: { b: true } },
      { l: ln.id, c: mes(d, 3).id, t: 'nota x', s: { bg: '#FFFF00' } },
      { l: ln2.id, c: mes(d, 0).id, t: '150' },                        // estado sem coluna em B
      { l: ln2.id, c: mes(d, 1).id, t: 'nota y' },
    ]);
    const cabB = d.linhas.find((l) => l.tipo === 'cabecalho' && l.bloco === B.id)!;
    await repo.linhaMover(ln.id, cabB.id, 'abaixo');
    await repo.linhaMover(ln2.id, cabB.id, 'abaixo');
    d = await repo.carregar();
    const l1 = d.linhas.find((x) => x.id === ln.id)!;
    expect(l1.bloco).toBe(B.id);
    expect(l1.c[mes(d, 0).id].t).toBe('AUGUSTO ');                         // nota sem coluna: fica (coluna livre)
    expect(l1.c[mes(d, 1).id]).toEqual({ t: '87', s: { b: true } });         // A+2 = 2º mês de B
    expect(l1.c[mes(d, 2).id]).toEqual({ t: 'nota x', s: { bg: '#FFFF00' } });
    expect(l1.c[mes(d, 3).id]).toBeUndefined();
    const l2 = d.linhas.find((x) => x.id === ln2.id)!;
    expect(l2.c[mes(d, 0).id].t).toBe('nota y');                            // o '150' (A+0) sai da grade…
    const g = gsCarregar();
    const lead = g.linhas.find((x) => x.id === ln.leadId)!;
    expect(lead.celulas[g.comps.indexOf(compSoma(A.compBase!, 2))]).toBe('87');
    expect(lead.dia).toBe(B.dia);
    const lead2 = g.linhas.find((x) => x.id === ln2.leadId)!;
    expect(lead2.celulas[g.comps.indexOf(compSoma(A.compBase!, 0))]).toBe('150'); // …e o pagamento continua
  });

  it('arrastar cliente dos NOVOS pra um ciclo só com "débito parado" pendente (aí aprova)', async () => {
    const repo = criarPlanilhaRepoDemo();
    let d = await repo.carregar();
    const rot = d.linhas.find((l) => l.tipo === 'rotulo' && l.bloco === 'NOVOS')!;
    const id = await repo.linhaInserir(rot.id, 'abaixo', 'cliente');
    d = await repo.carregar();
    const cab = d.linhas.find((l) => l.tipo === 'cabecalho')!;
    await expect(repo.linhaMover(id, cab.id, 'abaixo')).rejects.toThrow(/débito parado/);
    expect((await repo.carregar()).linhas.find((x) => x.id === id)!.bloco).toBe('NOVOS');
    const g = gsCarregar();
    const leadId = d.linhas.find((x) => x.id === id)!.leadId!;
    g.linhas.find((x) => x.id === leadId)!.paradoPendente = true;
    gsSalvar(g);
    await repo.linhaMover(id, cab.id, 'abaixo');
    const lead = gsCarregar().linhas.find((x) => x.id === leadId)!;
    expect(lead).toMatchObject({ situacao: 'cancelado', paradoPendente: false });
    expect(lead.paradoAprovadoEm).toBeTruthy();
  });

  // relógio parado no beforeEach: cada passo anda 1 min (recusa × mudança do pagamento é por horário)
  const passa = () => { vi.setSystemTime(new Date(Date.now() + 60_000)); };

  it('entradas: informar → amarelo; recusar → vermelho com motivo até o pagamento mudar; confirmar → verde', async () => {
    const repo = criarPlanilhaRepoDemo();
    const cob = criarRepoDemo();
    // semeia e grava o store sem as entradas do seed (o teste controla todas)
    const g0 = gsCarregar(); g0.pendentes = []; g0.historico = []; gsSalvar(g0);
    let d = await repo.carregar();
    expect(d.linhas.some((l) => l.e)).toBe(false);
    const ln = clientes(d).find((l) => l.bloco !== 'NOVOS')!;
    const bl = d.blocos.find((b) => b.id === ln.bloco)!;
    const c1 = mes(d, 1);
    const comp = compDaCelula(d, ln, c1)!;
    expect(comp).toBe(compSoma(bl.compBase!, 1));
    // célula sem pagamento pra começar
    await repo.salvar([{ l: ln.id, c: c1.id, t: null }]);

    // 1) comercial informa com comprovante → pendente (amarelo) só naquela coluna
    const ent = await cob.lancarPagamento({ leadId: ln.leadId!, comp, valor: 175.5, comprovante: { nome: 'c.png', url: 'data:image/png;base64,AA' } });
    d = await repo.carregar();
    let l = d.linhas.find((x) => x.id === ln.id)!;
    expect(Object.keys(l.e ?? {})).toEqual([c1.id]);
    expect(l.e![c1.id]).toMatchObject({ st: 'pendente', id: ent.id, v: 175.5, dec: null, mot: null, cp: true });
    expect(estadoMesCelula(l, c1, d)).toMatchObject({ tipo: 'pendente', valor: 175.5 });

    // 2) financeiro recusa com motivo → vermelho, valor recusado + motivo
    passa();
    await cob.recusarEntrada(ent.id, '  não caiu na conta ');
    d = await repo.carregar();
    l = d.linhas.find((x) => x.id === ln.id)!;
    expect(l.e![c1.id]).toMatchObject({ st: 'recusada', id: ent.id, v: 175.5, mot: 'não caiu na conta', cp: true });
    expect(l.e![c1.id].dec).toBeTruthy();
    expect(estadoMesCelula(l, c1, d)).toMatchObject({ tipo: 'recusado', valor: 175.5 });
    // a decisão fica FORA do histórico (espelho de entradas), sem o comprovante
    const dec = decididasCarregar().find((x) => x.id === ent.id)!;
    expect(dec).toMatchObject({ estado: 'recusada', leadId: ln.leadId, comp, motivo: 'não caiu na conta', temComprovante: true });
    expect(dec).not.toHaveProperty('comprovante');
    expect(gsCarregar().historico.find((m) => m.status === 'recusada')).not.toHaveProperty('entrada');

    // 3) informar de novo (com centavos) → a pendente vence a recusa
    passa();
    const ent2 = await cob.lancarPagamento({ leadId: ln.leadId!, comp, valor: 180.5 });
    d = await repo.carregar();
    l = d.linhas.find((x) => x.id === ln.id)!;
    expect(l.e![c1.id]).toMatchObject({ st: 'pendente', id: ent2.id, v: 180.5, cp: false });

    // 4) confirmar → sai a pendente; célula vira o valor COM os centavos (verde); a recusa antiga não volta
    passa();
    await cob.confirmarEntrada(ent2.id);
    d = await repo.carregar();
    l = d.linhas.find((x) => x.id === ln.id)!;
    expect(l.e).toBeUndefined();
    expect(l.c[c1.id].t).toBe('180,5');
    expect(estadoMesCelula(l, c1, d)).toEqual({ tipo: 'pago', valor: 180.5 });
    expect(decididasCarregar()[0]).toMatchObject({ id: ent2.id, estado: 'confirmada' });

    // 5) apagar o pagamento DEPOIS da recusa: a recusa (mais velha que a mudança) não volta
    passa();
    await repo.salvar([{ l: ln.id, c: c1.id, t: null }]);
    d = await repo.carregar();
    expect(d.linhas.find((x) => x.id === ln.id)!.e).toBeUndefined();
  });

  it('recusa some quando o pagamento do mês muda depois (NÃO PAGOU marcado e desfeito fora da planilha)', async () => {
    const repo = criarPlanilhaRepoDemo();
    const cob = criarRepoDemo();
    const g0 = gsCarregar(); g0.pendentes = []; g0.historico = []; gsSalvar(g0);
    let d = await repo.carregar();
    const ln = clientes(d).find((l) => l.bloco !== 'NOVOS')!;
    const c2 = mes(d, 2);
    const comp = compDaCelula(d, ln, c2)!;
    await repo.salvar([{ l: ln.id, c: c2.id, t: null }]);
    const ent = await cob.lancarPagamento({ leadId: ln.leadId!, comp, valor: 90 });
    passa();
    await cob.recusarEntrada(ent.id);
    d = await repo.carregar();
    expect(d.linhas.find((x) => x.id === ln.id)!.e![c2.id]).toMatchObject({ st: 'recusada', mot: null });
    // marcou NÃO PAGOU (fora da planilha) e depois limpou: a recusa não volta
    passa();
    await cob.marcarNaoPagou(ln.leadId!, comp);
    d = await repo.carregar();
    let l = d.linhas.find((x) => x.id === ln.id)!;
    expect(l.e).toBeUndefined();
    expect(estadoMesCelula(l, c2, d).tipo).toBe('nao_pagou');
    passa();
    await cob.limparCelula(ln.leadId!, comp);
    d = await repo.carregar();
    l = d.linhas.find((x) => x.id === ln.id)!;
    expect(l.e).toBeUndefined();
    expect(estadoMesCelula(l, c2, d).tipo).toBeNull();
    // ninguém mais pegou a entrada
    expect(d.linhas.filter((x) => x.e).length).toBe(0);
  });

  it('apagar o lançamento recusado do histórico NÃO tira o vermelho (a decisão vive fora do histórico, igual ao real)', async () => {
    const repo = criarPlanilhaRepoDemo();
    const cob = criarRepoDemo();
    const g0 = gsCarregar(); g0.pendentes = []; g0.historico = []; gsSalvar(g0);
    let d = await repo.carregar();
    const ln = clientes(d).find((l) => l.bloco !== 'NOVOS')!;
    const c1 = mes(d, 1);
    const comp = compDaCelula(d, ln, c1)!;
    await repo.salvar([{ l: ln.id, c: c1.id, t: null }]);
    const ent = await cob.lancarPagamento({ leadId: ln.leadId!, comp, valor: 120 });
    passa();
    await cob.recusarEntrada(ent.id, 'ilegível');
    const mv = gsCarregar().historico.find((m) => m.status === 'recusada')!;
    await cob.excluirMov(mv.id);
    expect(gsCarregar().historico.some((m) => m.id === mv.id)).toBe(false);
    d = await repo.carregar();
    const l = d.linhas.find((x) => x.id === ln.id)!;
    expect(l.e![c1.id]).toMatchObject({ st: 'recusada', id: ent.id, v: 120, mot: 'ilegível' });
    expect(estadoMesCelula(l, c1, d)).toMatchObject({ tipo: 'recusado', valor: 120 });
  });

  it('aprovar num mês cuja coluna foi criada na planilha: o mês entra no store e a célula fica verde', async () => {
    const repo = criarPlanilhaRepoDemo();
    const cob = criarRepoDemo();
    const g0 = gsCarregar(); g0.pendentes = []; g0.historico = []; gsSalvar(g0);
    let d = await repo.carregar();
    const nMes = d.colunas.filter((c) => c.tipo === 'mes').length;
    const m = await repo.colunaCriar({ ref: mes(d, nMes - 1).id, lado: 'dir', tipo: 'mes', titulo: '' });
    d = await repo.carregar();
    const ln = clientes(d).find((l) => l.bloco !== 'NOVOS')!;
    const cm = d.colunas.find((c) => c.id === m)!;
    const comp = compDaCelula(d, ln, cm)!;
    expect(gsCarregar().comps).not.toContain(comp); // o mês ainda não existe no store
    const ent = await cob.lancarPagamento({ leadId: ln.leadId!, comp, valor: 150 });
    d = await repo.carregar();
    let l = d.linhas.find((x) => x.id === ln.id)!;
    expect(estadoMesCelula(l, cm, d)).toMatchObject({ tipo: 'pendente', valor: 150 });
    passa();
    await cob.confirmarEntrada(ent.id);
    const g = gsCarregar();
    expect(g.comps).toContain(comp);
    expect(g.comps).toEqual([...g.comps].sort()); // entra em ordem, como o insert em competencias
    expect(g.linhas.every((x) => x.celulas.length === g.comps.length)).toBe(true);
    expect(g.linhas.find((x) => x.id === ln.leadId)!.celulas[g.comps.indexOf(comp)]).toBe('150');
    d = await repo.carregar();
    l = d.linhas.find((x) => x.id === ln.id)!;
    expect(l.e).toBeUndefined();
    expect(l.c[m].t).toBe('150');
    expect(estadoMesCelula(l, cm, d)).toEqual({ tipo: 'pago', valor: 150 });
  });

  it('seed: as entradas pendentes do demo aparecem na planilha (última competência)', async () => {
    const g = gsCarregar();
    const d = await criarPlanilhaRepoDemo().carregar();
    const pend = g.pendentes.filter((e) => g.linhas.some((x) => x.id === e.leadId && x.situacao === 'cancelado'));
    expect(pend.length).toBeGreaterThan(0);
    for (const e of pend) {
      const ln = d.linhas.find((x) => x.leadId === e.leadId)!;
      const col = d.colunas.find((c) => compDaCelula(d, ln, c) === e.comp)!;
      expect(ln.e?.[col.id]).toMatchObject({ st: 'pendente', id: e.id, v: e.valor });
    }
    // NOVOS (sem mês-base) nunca tem "e"
    expect(d.linhas.filter((x) => x.bloco === 'NOVOS').every((x) => !x.e)).toBe(true);
  });

  it('salvar é tudo-ou-nada', async () => {
    const repo = criarPlanilhaRepoDemo();
    const d = await repo.carregar();
    const ln = clientes(d)[0];
    await expect(repo.salvar([
      { l: ln.id, c: col(d, 'nome').id, t: 'NÃO DEVE GRAVAR' },
      { l: 'linha-que-nao-existe', c: col(d, 'nome').id, t: 'x' },
    ])).rejects.toThrow(/Linha não encontrada/);
    expect(gsCarregar().linhas.find((g) => g.id === ln.leadId)!.nome).not.toBe('NÃO DEVE GRAVAR');
  });
});
