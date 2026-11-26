import { describe, expect, it } from 'vitest';
import { limparOpcoes, mostrarValor, validarCampo, validarValor, type Campo } from './camposPersonalizados';
import { opcoesDeFechamento, validarMotivo, type Motivo } from './motivosFechamento';
import { textoDoMotivo } from './fechamento';

const campo = (p: Partial<Campo>): Campo => ({ id: 'x', nome: 'Campo', tipo: 'texto', opcoes: [], ordem: 0, ativo: true, noCartao: false, ...p });

describe('campos do cliente', () => {
  it('limpa as opções da lista (espaços, vazias e repetidas sem olhar maiúsculas)', () => {
    expect(limparOpcoes([' Agibank ', '', 'BMG', 'bmg', 'Mercantil  Brasil'])).toEqual(['Agibank', 'BMG', 'Mercantil Brasil']);
  });
  it('recusa nome vazio, repetido e lista sem opção', () => {
    const outros = [campo({ id: 'a', nome: 'Nome completo (RG)' })];
    expect(validarCampo({ nome: '  ', tipo: 'texto', opcoes: [] })).toMatch(/nome/);
    expect(validarCampo({ nome: 'nome completo (rg)', tipo: 'texto', opcoes: [] }, outros)).toMatch(/Já existe/);
    expect(validarCampo({ nome: 'Nome completo (RG)', tipo: 'texto', opcoes: [] }, outros, 'a')).toBeNull();
    expect(validarCampo({ nome: 'Banco', tipo: 'lista', opcoes: ['', ' '] })).toMatch(/opção/);
  });
  it('confere o valor como o servidor (migration 110)', () => {
    expect(validarValor(campo({ tipo: 'numero' }), '3')).toEqual({ valor: '3' });
    expect(validarValor(campo({ tipo: 'numero' }), '2,5')).toEqual({ valor: '2,5' });
    expect(validarValor(campo({ tipo: 'numero' }), 'três')).toHaveProperty('erro');
    expect(validarValor(campo({ tipo: 'data' }), '2026-11-26')).toEqual({ valor: '2026-11-26' });
    expect(validarValor(campo({ tipo: 'data' }), '26/11/2026')).toHaveProperty('erro');
    expect(validarValor(campo({ tipo: 'sim_nao' }), 'sim')).toEqual({ valor: 'sim' });
    expect(validarValor(campo({ tipo: 'lista', opcoes: ['BMG'] }), 'Caixa')).toHaveProperty('erro');
    expect(validarValor(campo({ tipo: 'email' }), 'a@b')).toHaveProperty('erro');
    expect(validarValor(campo({ tipo: 'texto' }), '  MARIA  ')).toEqual({ valor: 'MARIA' });
  });
  it('mostra data em dd/mm/aaaa e sim/não por extenso', () => {
    expect(mostrarValor(campo({ tipo: 'data' }), '2026-11-26')).toBe('26/11/2026');
    expect(mostrarValor(campo({ tipo: 'sim_nao' }), 'nao')).toBe('Não');
    expect(mostrarValor(campo({ tipo: 'texto' }), '')).toBe('');
  });
});

describe('motivos de fechamento', () => {
  const lista: Motivo[] = [
    { id: '1', nome: 'Cliente descartado', ordem: 0, ativo: true },
    { id: '2', nome: 'Atendimento concluído', ordem: 1, ativo: false },
    { id: '3', nome: 'Fechou com outra empresa', ordem: 2, ativo: true },
  ];
  it('o Fechar conversa mostra os ligados, na ordem, e "Outro motivo" por último', () => {
    expect(opcoesDeFechamento(lista)).toEqual(['Cliente descartado', 'Fechou com outra empresa', 'Outro motivo']);
  });
  it('sem nenhum ligado, volta à lista de sempre (nunca fica só "Outro motivo")', () => {
    const r = opcoesDeFechamento(lista.map((m) => ({ ...m, ativo: false })));
    expect(r[0]).toBe('Cliente descartado'); expect(r.length).toBeGreaterThan(2); expect(r[r.length - 1]).toBe('Outro motivo');
  });
  it('recusa "Outro motivo", travessão e repetido', () => {
    expect(validarMotivo('outro motivo', lista)).toMatch(/Outro motivo/);
    expect(validarMotivo('A — B', lista)).toMatch(/travessão/);
    expect(validarMotivo('cliente descartado', lista)).toMatch(/já está/);
    expect(validarMotivo('Cliente descartado', lista, '1')).toBeNull();
  });
  it('o texto gravado junta motivo e detalhe (o histórico separa pelo " — ")', () => {
    expect(textoDoMotivo('Fechou com outra empresa', ' com a concorrente ')).toBe('Fechou com outra empresa — com a concorrente');
    expect(textoDoMotivo('Outro motivo', '')).toBeNull();
    expect(textoDoMotivo('Outro motivo', 'mudou de cidade')).toBe('mudou de cidade');
  });
});
