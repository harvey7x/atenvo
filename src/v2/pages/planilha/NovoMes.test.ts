import { describe, expect, it } from 'vitest';
import type { PlColuna, PlDados, PlLinha } from '../../data/cobranca/planilha';
import { planoNovoMes, rotuloNovoMes } from './NovoMes';
import { cabecalhosNovoMes } from './PlanilhaExcel';

/* "Novo mês" (dono 28/09): abre o mês SEGUINTE em todos os ciclos — cada ciclo com o próprio mês
   e a data do cabeçalho pelo calendário do INSS. Retrato da planilha real em 28/09: 14 meses
   (mes_pos 0–13), fim do mês com base 2025-08 (último = 24/set) e início com base 2025-09 (último = 01/out). */
const col = (id: string, ordem: number, mesPos: number | null, tipo: PlColuna['tipo'] = mesPos == null ? 'campo' : 'mes'): PlColuna =>
  ({ id, ordem, titulo: mesPos == null ? id : `Mês ${mesPos + 1}`, tipo, campo: null, mesPos, largura: 96, oculta: false });
const cab = (id: string, bloco: string, textos: Record<string, string>): PlLinha =>
  ({ id, ordem: 0, tipo: 'cabecalho', bloco, leadId: null, altura: null, c: Object.fromEntries(Object.entries(textos).map(([k, t]) => [k, { t, s: null }])) });

function folha(): PlDados {
  const colunas: PlColuna[] = [col('cliente', 100, null)];
  for (let k = 0; k < 14; k++) colunas.push(col(`m${k}`, 1000 + k * 10, k));
  colunas.push(col('livre', 5000, null, 'livre'));   // a "Nova coluna" livre depois dos meses (existe em produção)
  return {
    blocos: [
      { id: 'D24', dia: 24, situacao: 'cancelado', compBase: '2025-08' },
      { id: 'D25', dia: 25, situacao: 'cancelado', compBase: '2025-08' },
      { id: 'D01', dia: 1, situacao: 'cancelado', compBase: '2025-09' },
      { id: 'D02', dia: 2, situacao: 'cancelado', compBase: '2025-09' },
      { id: 'NOVOS', dia: null, situacao: 'ativo', compBase: null },
    ],
    colunas,
    linhas: [
      cab('h24', 'D24', { m13: '24/set' }), cab('h25', 'D25', { m13: '25/set' }),
      cab('h01', 'D01', { m13: '01/out' }), cab('h02', 'D02', { m13: '02/out' }),
    ],
  };
}

describe('Novo mês na Gestão', () => {
  it('é o mês 15, entra depois do ÚLTIMO mês (antes da coluna livre)', () => {
    const p = planoNovoMes(folha());
    expect(p.k).toBe(14);
    expect(p.titulo).toBe('Mês 15');
    expect(p.ref).toBe('m13');
  });
  it('cada grupo de ciclos abre o próprio mês: fim do mês = out/26, início = nov/26', () => {
    const p = planoNovoMes(folha());
    expect(p.comps).toEqual(['2026-10', '2026-11']);
    expect(rotuloNovoMes(p)).toBe('out/26 · nov/26');
    expect(p.ciclos.map((c) => c.id)).toEqual(['D24', 'D25', 'D01', 'D02']);   // ordem do seletor
  });
  it('cabeçalho pelo calendário do INSS: mesma posição nos dias úteis, pulando feriado', () => {
    const cabs = Object.fromEntries(planoNovoMes(folha()).ciclos.map((c) => [c.id, c.cab]));
    // out/2026: últimos 5 dias úteis = 26–30 → D24 (1º) = 26/out, D25 = 27/out
    expect(cabs.D24).toBe('26/out');
    expect(cabs.D25).toBe('27/out');
    // nov/2026: 1º é domingo e 2 é Finados → 1º dia útil = 03/nov
    expect(cabs.D01).toBe('03/nov');
    expect(cabs.D02).toBe('04/nov');
  });
  it('bloco sem mês-base (Novos) não entra na lista, mas é avisado', () => {
    const p = planoNovoMes(folha());
    expect(p.ciclos.some((c) => c.id === 'NOVOS')).toBe(false);
    expect(p.temNovos).toBe(true);
  });
  it('planilha sem nenhum mês: começa no mês 1, depois da última coluna', () => {
    const d = folha();
    d.colunas = d.colunas.filter((c) => c.tipo !== 'mes');
    const p = planoNovoMes(d);
    expect(p.k).toBe(0);
    expect(p.ref).toBe('livre');
  });
  it('dezembro: o INSS não paga em 24 e 31/12 (sem expediente bancário); janeiro pula o feriado do dia 1º', () => {
    const d = folha();
    d.colunas.splice(d.colunas.length - 1, 0, col('m14', 1140, 14), col('m15', 1150, 15));
    const cabs = Object.fromEntries(planoNovoMes(d).ciclos.map((c) => [c.id, c.cab]));
    expect(planoNovoMes(d).comps).toEqual(['2026-12', '2027-01']);
    expect(cabs.D24).toBe('22/dez');
    expect(cabs.D25).toBe('23/dez');
    expect(cabs.D01).toBe('04/jan');
    expect(cabs.D02).toBe('05/jan');
  });
  it('correção manual num mês não contamina o seguinte (a posição é a ordem do ciclo)', () => {
    const d = folha();
    d.linhas = [cab('h24', 'D24', { m13: '22/set' }), cab('h25', 'D25', { m13: '25/set' }), cab('h01', 'D01', { m13: '01/out' }), cab('h02', 'D02', { m13: '02/out' })];
    const cabs = cabecalhosNovoMes(d, d.colunas, 14);
    expect(cabs.D24).toBe('26/out');
  });
  it('demo: cabeçalho anterior "DD/MM/AAAA" (dia do ciclo) continua no mesmo formato, sem repetir data', () => {
    const d: PlDados = {
      blocos: [
        { id: 'D01', dia: 1, situacao: 'cancelado', compBase: '2026-03' },
        { id: 'D03', dia: 3, situacao: 'cancelado', compBase: '2026-03' },
        { id: 'D28', dia: 28, situacao: 'cancelado', compBase: '2026-03' },
        { id: 'D29', dia: 29, situacao: 'cancelado', compBase: '2026-03' },
      ],
      colunas: [col('m5', 1050, 5)],
      linhas: [cab('a', 'D01', { m5: '01/08/2026' }), cab('b', 'D03', { m5: '03/08/2026' }), cab('c', 'D28', { m5: '28/08/2026' }), cab('e', 'D29', { m5: '29/08/2026' })],
    };
    expect(cabecalhosNovoMes(d, d.colunas, 6)).toEqual({ D01: '01/09/2026', D03: '03/09/2026', D28: '28/09/2026', D29: '29/09/2026' });
  });
  it('mais de 5 ciclos no mesmo lado (ciclo aberto depois): o ciclo novo não herda a data copiada do D24', () => {
    const d = folha();
    d.blocos.push({ id: 'D27', dia: 27, situacao: 'cancelado', compBase: '2025-08' },
      { id: 'D28', dia: 28, situacao: 'cancelado', compBase: '2025-08' }, { id: 'D29', dia: 29, situacao: 'cancelado', compBase: '2025-08' },
      { id: 'D30', dia: 30, situacao: 'cancelado', compBase: '2025-08' });
    // o D27 nasceu copiando o cabeçalho do D24 (24/set)
    d.linhas.push(cab('h27', 'D27', { m13: '24/set' }), cab('h28', 'D28', { m13: '28/set' }), cab('h29', 'D29', { m13: '29/set' }), cab('h30', 'D30', { m13: '30/set' }));
    const cabs = cabecalhosNovoMes(d, d.colunas, 14);
    expect(cabs.D24).toBe('26/out');
    expect(cabs.D27).toBe('27/out');   // repetiria o 26/out do D24 → vira o dia do próprio ciclo
    expect(cabs.D30).toBe('30/out');   // (6 ciclos em 5 dias do INSS: dois podem mesmo cair no mesmo dia)
  });
});
