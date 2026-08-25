import { describe, expect, it } from 'vitest';
import { trafegoDoCanal, TRAFEGO_OPCOES } from './planilhaTrafego';

describe('trafegoDoCanal (sugestão pelo chip do atendimento)', () => {
  it('chips com nome de pessoa vencem qualquer fonte', () => {
    expect(trafegoDoCanal('JUROS ABUSIVO (ANDRIUS)', 'Tráfego 1')).toBe('ANDRIUS');
    expect(trafegoDoCanal('ANDRIUS', 'Tráfego 1')).toBe('ANDRIUS');
    expect(trafegoDoCanal('Simone 2', null)).toBe('SIMONE');
  });

  it('chips de disparo viram DISPARO', () => {
    expect(trafegoDoCanal('DISPARO', 'Tráfego 1')).toBe('DISPARO');
    expect(trafegoDoCanal('DISPAROS DBX', 'Tráfego 1')).toBe('DISPARO');
  });

  it('remarketing: só sugere quando o chip diz de quem é', () => {
    expect(trafegoDoCanal('RMKT CREFISA', 'Tráfego 1')).toBe('RMKT CREFISA');
    expect(trafegoDoCanal('rmkt bruno 2', 'Tráfego 1')).toBe('RMKT BRUNO');
    expect(trafegoDoCanal('REMARKETING', 'Tráfego 1')).toBe(''); // ambíguo: não chuta
    expect(trafegoDoCanal('RMKT 4', 'Tráfego 1')).toBe('');
  });

  it('canal de fonte Tráfego (campanha) vira CAMPANHA', () => {
    expect(trafegoDoCanal('EMPRÉSTIMO', 'Tráfego 1')).toBe('CAMPANHA');
    expect(trafegoDoCanal('MURILLO CHIP', 'Trafego Matheus')).toBe('CAMPANHA');
    expect(trafegoDoCanal('LUIZA', 'Tráfego 1')).toBe('CAMPANHA');
  });

  it('sem sinal claro fica vazio (atendente decide)', () => {
    expect(trafegoDoCanal('CAF', null)).toBe('');
    expect(trafegoDoCanal('OFICIAL', null)).toBe('');
    expect(trafegoDoCanal('URA', 'Sistema URA')).toBe('');
    expect(trafegoDoCanal(null, null)).toBe('');
  });

  it('toda sugestão devolvida é uma opção oficial da planilha', () => {
    const casos = [
      trafegoDoCanal('JUROS ABUSIVO (ANDRIUS)', null), trafegoDoCanal('DISPARO', null),
      trafegoDoCanal('RMKT CREFISA', null), trafegoDoCanal('X', 'Tráfego 1'),
    ];
    for (const c of casos) expect(TRAFEGO_OPCOES).toContain(c);
  });
});
