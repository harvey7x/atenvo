import { describe, it, expect } from 'vitest';
import { saidaSuja } from '../../supabase/functions/bot-runner/guardrail';
import { parseEstado, pareceDificil } from '../../supabase/functions/bot-runner/ia';

describe('guardrail — saidaSuja (trava de código)', () => {
  it('BARRA a frase do critério de aceite (promessa de valor)', () => {
    expect(saidaSuja('o senhor vai receber uns 5 mil reais')).not.toBeNull();
  });
  it('PASSA a frase honesta de verificação', () => {
    expect(saidaSuja('vale a pena verificar se há valores a recuperar')).toBeNull();
  });
  it('barra valor em reais / quantia / percentual', () => {
    expect(saidaSuja('fica em R$ 5.000')).toBe('valor_em_reais');
    expect(saidaSuja('dá uns 3000 reais')).toBe('quantia');
    expect(saidaSuja('uns 30% do total')).toBe('percentual');
  });
  it('barra garantia / promessa de resultado / prazo', () => {
    expect(saidaSuja('eu garanto que resolve')).toBe('garantia');
    expect(saidaSuja('você vai receber o dinheiro')).toBe('promessa_resultado');
    expect(saidaSuja('sai em até 30 dias')).toBe('promessa_prazo');
  });
  it('barra pedido de credencial e escassez falsa', () => {
    expect(saidaSuja('me manda a senha do gov.br')).toBe('credencial');
    expect(saidaSuja('é a última chance, só hoje')).toBe('escassez_falsa');
  });
  it('deixa passar mensagem normal do fluxo', () => {
    expect(saidaSuja('Oi, tudo bem? Me diz seu nome completo, por favor.')).toBeNull();
    expect(saidaSuja('A análise é gratuita e o senhor não paga nada adiantado.')).toBeNull();
  });
});

describe('parseEstado — separa texto humano do bloco <estado>', () => {
  it('extrai texto e faz o parse do JSON', () => {
    const r = 'Perfeito, João! || Me manda seu CPF, por favor.\n<estado>{"interesse":true,"nome_completo":"João Silva","cpf":"","desfecho":""}</estado>';
    const { texto, estado } = parseEstado(r);
    expect(texto).toBe('Perfeito, João! || Me manda seu CPF, por favor.');
    expect(estado?.nome_completo).toBe('João Silva');
    expect(estado?.interesse).toBe(true);
  });
  it('sem bloco de estado → estado null, texto preservado', () => {
    const { texto, estado } = parseEstado('Oi, tudo bem?');
    expect(estado).toBeNull(); expect(texto).toBe('Oi, tudo bem?');
  });
  it('JSON malformado → estado null, mas texto humano preservado (não vaza o bloco)', () => {
    const { texto, estado } = parseEstado('Certo. <estado>{quebrado}</estado>');
    expect(estado).toBeNull(); expect(texto).toBe('Certo.');
  });
  it('preserva os balões separados por || no texto', () => {
    const { texto } = parseEstado('Um || Dois || Três <estado>{}</estado>');
    expect(texto.split('||').length).toBe(3);
  });
});

describe('pareceDificil — roteador Gemini/Claude', () => {
  it('abertura (0–1 turno do lead) → difícil (Claude)', () => {
    expect(pareceDificil('oi', {}, [{ role: 'user' }])).toBe(true);
  });
  it('objeção e pergunta → difícil', () => {
    expect(pareceDificil('isso é golpe?', {}, [{ role: 'user' }, { role: 'assistant' }, { role: 'user' }])).toBe(true);
    expect(pareceDificil('quanto vou receber', {}, [{ role: 'user' }, { role: 'assistant' }, { role: 'user' }])).toBe(true);
  });
  it('fechamento (já tem cpf + banco) → difícil', () => {
    expect(pareceDificil('pode ser', { cpf_mascarado: '***', banco: 'caixa', cpf: true }, [{ role: 'user' }, { role: 'assistant' }, { role: 'user' }])).toBe(true);
  });
  it('resposta simples no meio do fluxo → Gemini (fácil)', () => {
    expect(pareceDificil('caixa', {}, [{ role: 'user' }, { role: 'assistant' }, { role: 'user' }])).toBe(false);
  });
});
