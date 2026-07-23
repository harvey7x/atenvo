import { describe, it, expect } from 'vitest';
import { siglaCanal, dividirChips, tituloOcultos, MAX_CHIPS_VISIVEIS, type ChipCard } from './cardConversa';

const chip = (key: string, txt: string): ChipCard => ({ key, cls: '', txt, title: txt });

describe('siglaCanal', () => {
  it('distingue os canais numerados da casa (é o caso que mais importa)', () => {
    expect(siglaCanal('RMKT 4')).toBe('R4');
    expect(siglaCanal('RMKT 5')).toBe('R5');
    expect(siglaCanal('RMKT 4')).not.toBe(siglaCanal('RMKT 5'));
  });
  it('usa as duas primeiras letras quando não há dígito', () => {
    expect(siglaCanal('URA')).toBe('UR');
    expect(siglaCanal('ANDRIUS')).toBe('AN');
    expect(siglaCanal('OFICIAL')).toBe('OF');
    expect(siglaCanal('LUIZA')).toBe('LU');
  });
  it('os canais reais da org não colidem entre si', () => {
    const nomes = ['URA', 'ANDRIUS', 'RMKT 4', 'RMKT 5', 'OFICIAL'];
    const siglas = nomes.map(siglaCanal);
    expect(new Set(siglas).size).toBe(nomes.length);
  });
  it('aceita nome com acento e minúsculas', () => {
    expect(siglaCanal('órion')).toBe('ÓR');
    expect(siglaCanal('canal 2')).toBe('C2');
  });
  it('não quebra com vazio/nulo', () => {
    expect(siglaCanal(null)).toBe('?');
    expect(siglaCanal(undefined)).toBe('?');
    expect(siglaCanal('   ')).toBe('?');
    expect(siglaCanal('123')).toBe('?1');
  });
});

describe('dividirChips', () => {
  it('não corta quando cabe', () => {
    const cs = [chip('a', 'LEAD NOVO')];
    expect(dividirChips(cs).visiveis).toHaveLength(1);
    expect(dividirChips(cs).ocultos).toHaveLength(0);
  });
  it('mantém os primeiros (prioridade semântica) e manda o resto para o +N', () => {
    const cs = [chip('sit', 'LEAD NOVO'), chip('atraso', 'Atrasado · 4 h'), chip('sla', 'Sem resposta'), chip('hig', 'Nome incompleto')];
    const { visiveis, ocultos } = dividirChips(cs);
    expect(visiveis.map((c) => c.key)).toEqual(['sit', 'atraso']);
    expect(ocultos.map((c) => c.key)).toEqual(['sla', 'hig']);
  });
  it('a situação NUNCA é cortada — ela é sempre o primeiro da fila', () => {
    const cs = [chip('sit', 'EM ATENDIMENTO'), chip('a', 'x'), chip('b', 'y'), chip('c', 'z')];
    expect(dividirChips(cs).visiveis[0].key).toBe('sit');
  });
  it('respeita o teto padrão', () => {
    const cs = Array.from({ length: 8 }, (_, i) => chip('k' + i, 'chip ' + i));
    expect(dividirChips(cs).visiveis).toHaveLength(MAX_CHIPS_VISIVEIS);
    expect(dividirChips(cs).ocultos).toHaveLength(8 - MAX_CHIPS_VISIVEIS);
  });
  it('lista vazia não quebra', () => {
    expect(dividirChips([])).toEqual({ visiveis: [], ocultos: [] });
  });
});

describe('tituloOcultos', () => {
  it('expõe TODOS os ocultos no tooltip (nada some do card)', () => {
    const ocultos = [chip('sla', 'Sem resposta'), chip('ph', 'Precisa humano')];
    expect(tituloOcultos(ocultos)).toBe('Sem resposta · Precisa humano');
  });
  it('vazio vira string vazia', () => {
    expect(tituloOcultos([])).toBe('');
  });
});
