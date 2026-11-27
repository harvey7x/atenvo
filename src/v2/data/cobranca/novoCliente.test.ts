import { describe, expect, it } from 'vitest';
import {
  cpfValido, finalNB, mascaraCPF, mascaraNB, mascaraTelefone, problemasNovo, sugerirCiclos, textoReclame,
  type CamposNovo,
} from './novoCliente';

const CICLOS = [24, 25, 28, 29, 30, 1, 2, 5, 6, 7];
// CPF sintético válido (dígitos verificadores calculados; não é de ninguém da base)
const CPF_OK = '529.982.247-25';

const cheio = (o: Partial<CamposNovo> = {}): CamposNovo => ({
  fechamento: '2026-09-25', comercial: 'PATY', nome: 'MARIA DA SILVA', nb: '123.456.789-0', banco: 'AGIBANK',
  cpf: CPF_OK, telefone: '(51) 99999-0000', senha: 'Senha@1', valor: 232, reclameData: '2026-09-20', reclameSenha: 'abc123',
  ...o,
});

describe('máscaras no formato da planilha', () => {
  it('CPF 000.000.000-00', () => {
    expect(mascaraCPF('52998224725')).toBe('529.982.247-25');
    expect(mascaraCPF('5299')).toBe('529.9');
    expect(mascaraCPF('529.982.247-2599')).toBe('529.982.247-25');
  });
  it('NB 000.000.000-0', () => {
    expect(mascaraNB('1234567890')).toBe('123.456.789-0');
    expect(mascaraNB('123456789')).toBe('123.456.789');
  });
  it('telefone (DD) 9xxxx-xxxx e fixo', () => {
    expect(mascaraTelefone('51999990000')).toBe('(51) 99999-0000');
    expect(mascaraTelefone('5133334444')).toBe('(51) 3333-4444');
    expect(mascaraTelefone('51')).toBe('(51');
    expect(mascaraTelefone('')).toBe('');
  });
});

describe('CPF', () => {
  it('confere os dígitos verificadores', () => {
    expect(cpfValido(CPF_OK)).toBe(true);
    expect(cpfValido('529.982.247-24')).toBe(false);
    expect(cpfValido('111.111.111-11')).toBe(false);
    expect(cpfValido('5299822472')).toBe(false);
  });
});

describe('RECLAME AQUI', () => {
  it('monta "reclame aqui DD/MM - senha"', () => {
    expect(textoReclame('2026-09-20', 'abc123')).toBe('reclame aqui 20/09 - abc123');
    expect(textoReclame('2026-01-05', ' x ')).toBe('reclame aqui 05/01 - x');
    expect(textoReclame('', 'abc')).toBe('reclame aqui - abc');
    expect(textoReclame('', '')).toBe('');
  });
});

describe('obrigatórios', () => {
  it('tudo preenchido = sem problemas', () => {
    expect(problemasNovo(cheio())).toEqual({});
  });
  it('cada coluna da planilha é obrigatória', () => {
    const p = problemasNovo(cheio({ fechamento: '', comercial: ' ', nome: '', nb: '', banco: '', cpf: '', telefone: '', senha: '', valor: 0, reclameData: '', reclameSenha: '' }));
    expect(Object.keys(p).sort()).toEqual(['banco', 'comercial', 'cpf', 'fechamento', 'nb', 'nome', 'reclameData', 'reclameSenha', 'senha', 'telefone', 'valor'].sort());
  });
  it('formatos', () => {
    expect(problemasNovo(cheio({ cpf: '529.982.247-24' })).cpf).toBe('CPF inválido');
    expect(problemasNovo(cheio({ cpf: '529.982' })).cpf).toBe('CPF tem 11 números');
    expect(problemasNovo(cheio({ telefone: '(51) 9999' })).telefone).toBe('DDD + número');
    expect(problemasNovo(cheio({ nb: '1234' })).nb).toBe('NB incompleto');
    expect(problemasNovo(cheio({ nome: 'AB' })).nome).toBe('Nome completo');
  });
});

describe('sugestão de ciclo (posição no calendário do INSS)', () => {
  it('final do NB: penúltimo com dígito verificador', () => {
    expect(finalNB('123.456.789-0')).toBe('9');
    expect(finalNB('123456783')).toBe('3');
    expect(finalNB('')).toBe('');
  });
  it('finais 6–0 → início do mês, igual nas duas faixas', () => {
    expect(sugerirCiclos('000.000.006-1', null, CICLOS)).toEqual([{ dia: 1, motivo: 'final 6 do NB' }]);
    expect(sugerirCiclos('000.000.000-1', 'acima_1sm', CICLOS).map((s) => s.dia)).toEqual([7]);
    expect(sugerirCiclos('000.000.008-1', 'ate_1sm', CICLOS).map((s) => s.dia)).toEqual([5]);
  });
  it('finais 1–5: até 1 SM → fim do mês; acima → início; sem faixa → as duas', () => {
    expect(sugerirCiclos('000.000.001-1', 'ate_1sm', CICLOS).map((s) => s.dia)).toEqual([24]);
    expect(sugerirCiclos('000.000.005-1', 'ate_1sm', CICLOS).map((s) => s.dia)).toEqual([30]);
    expect(sugerirCiclos('000.000.003-1', 'acima_1sm', CICLOS).map((s) => s.dia)).toEqual([5]);
    expect(sugerirCiclos('000.000.002-1', undefined, CICLOS).map((s) => s.dia)).toEqual([25, 2]);
  });
  it('posição que não existe na base não vira sugestão', () => {
    expect(sugerirCiclos('000.000.005-1', 'ate_1sm', [24, 25, 1])).toEqual([]);
    expect(sugerirCiclos('', 'ate_1sm', CICLOS)).toEqual([]);
  });
});
