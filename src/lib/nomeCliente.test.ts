import { describe, it, expect } from 'vitest';
import { formatarNomeCliente } from './nomeCliente';

describe('formatarNomeCliente — padronização visual (MAIÚSCULO)', () => {
  it('nome comum vira maiúsculo', () => {
    expect(formatarNomeCliente('Joao Marcos Ribeiro')).toBe('JOAO MARCOS RIBEIRO');
    expect(formatarNomeCliente('Giovana Caf')).toBe('GIOVANA CAF');
    expect(formatarNomeCliente('Cleber Ferreira Neto')).toBe('CLEBER FERREIRA NETO');
    expect(formatarNomeCliente('Bruna Rossi Flores')).toBe('BRUNA ROSSI FLORES');
  });
  it('acentos pt-BR', () => { expect(formatarNomeCliente('José Antônio')).toBe('JOSÉ ANTÔNIO'); });
  it('null/undefined/vazio → fallback vazio', () => {
    expect(formatarNomeCliente(null)).toBe('');
    expect(formatarNomeCliente(undefined)).toBe('');
    expect(formatarNomeCliente('   ')).toBe('');
  });
  it('telefone/número puro é preservado (não é nome)', () => {
    expect(formatarNomeCliente('555181580190')).toBe('555181580190');
    expect(formatarNomeCliente('+55 (51) 98158-0190')).toBe('+55 (51) 98158-0190');
  });
  it('já maiúsculo permanece', () => { expect(formatarNomeCliente('ANDRIUS')).toBe('ANDRIUS'); });
  it('apara espaços das bordas', () => { expect(formatarNomeCliente('  ana rita  ')).toBe('ANA RITA'); });
});
