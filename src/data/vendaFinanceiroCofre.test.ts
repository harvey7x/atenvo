import { describe, expect, it } from 'vitest';
import { lerValor, validarLancamento, validarProduto } from './financeiro';
import { rotuloBotao, slugOrigem, validarNomeBotao, validarOrigem } from './vendaOrigem';
import { validarSenhaCofre } from './cofre';
import { mostrarValor, validarValor, type Campo } from './camposPersonalizados';

describe('valores em reais', () => {
  it('lê o jeito brasileiro sem confundir o ponto de milhar', () => {
    expect(lerValor('1.300')).toBe(1300);
    expect(lerValor('1.300,50')).toBe(1300.5);
    expect(lerValor('R$ 2.600,00')).toBe(2600);
    expect(lerValor('150')).toBe(150);
    expect(lerValor('1300.5')).toBe(1300.5);
    expect(lerValor('12.345.678,9')).toBe(12345678.9);
    expect(lerValor('')).toBeNull();
    expect(lerValor('abc')).toBeNull();
    expect(lerValor('-5')).toBeNull();
  });
  it('confere produto e lançamento', () => {
    expect(validarProduto({ nome: '', valor: '10' }, [])).toMatch(/nome/);
    expect(validarProduto({ nome: 'Revisão', valor: 'x' }, [])).toMatch(/valor/);
    expect(validarProduto({ nome: 'revisão', valor: '10' }, [{ id: 'a', nome: 'Revisão', descricao: null, valor: 1, ativo: true }])).toMatch(/Já existe/);
    expect(validarLancamento({ descricao: '', produtoId: null, quantidade: '1', valor: '10', data: '2026-11-26' })).toMatch(/produto/);
    expect(validarLancamento({ descricao: '', produtoId: 'p', quantidade: '0', valor: '10', data: '2026-11-26' })).toMatch(/quantidade/);
    expect(validarLancamento({ descricao: 'Honorário', produtoId: null, quantidade: '2', valor: '650,00', data: '2026-11-26' })).toBeNull();
  });
});

describe('botão de venda e origem', () => {
  it('o botão tem nome padrão e até 24 letras', () => {
    expect(rotuloBotao(null)).toBe('Contrato fechado');
    expect(rotuloBotao({ nomeBotao: '  ', metaEventoAtivo: false, metaEvento: 'Purchase' })).toBe('Contrato fechado');
    expect(rotuloBotao({ nomeBotao: 'Venda fechada', metaEventoAtivo: false, metaEvento: 'Purchase' })).toBe('Venda fechada');
    expect(validarNomeBotao('x'.repeat(25))).toMatch(/24/);
  });
  it('a origem não repete, não usa os nomes do sistema e o código é simples', () => {
    expect(slugOrigem('Indicação de Cliente!')).toBe('indicacao-de-cliente');
    expect(validarOrigem({ nome: 'Indefinida', slug: null }, [])).toMatch(/sistema/);
    expect(validarOrigem({ nome: 'URA', slug: 'URA X' }, [])).toMatch(/código/);
    expect(validarOrigem({ nome: 'ura', slug: null }, [{ id: '1', nome: 'URA', slug: 'ura', descricao: null, ativo: true }])).toMatch(/Já existe/);
    expect(validarOrigem({ nome: 'URA', slug: 'ura' }, [{ id: '1', nome: 'URA', slug: 'ura', descricao: null, ativo: true }], '1')).toBeNull();
  });
});

describe('cofre e tipos novos de campo', () => {
  it('a senha do cofre tem de 6 a 72 e as duas iguais', () => {
    expect(validarSenhaCofre('12345', '12345')).toMatch(/6/);
    expect(validarSenhaCofre('123456', '123457')).toMatch(/iguais/);
    expect(validarSenhaCofre('123456', '123456')).toBeNull();
  });
  it('inteiro e data e hora como o servidor (migration 111)', () => {
    const c = (tipo: Campo['tipo']): Campo => ({ id: 'x', nome: 'x', tipo, opcoes: [], ordem: 0, ativo: true, noCartao: false });
    expect(validarValor(c('inteiro'), '4')).toEqual({ valor: '4' });
    expect(validarValor(c('inteiro'), '2,5')).toHaveProperty('erro');
    expect(validarValor(c('data_hora'), '2026-11-27T14:30')).toEqual({ valor: '2026-11-27T14:30' });
    expect(validarValor(c('data_hora'), '2026-11-27')).toHaveProperty('erro');
    expect(mostrarValor(c('data_hora'), '2026-11-27T14:30')).toBe('27/11/2026 14:30');
  });
});
