import { describe, it, expect } from 'vitest';
import { saidaSuja } from '../../supabase/functions/bot-runner/guardrail';
import { parseEstado, pareceDificil } from '../../supabase/functions/bot-runner/ia';

describe('guardrail — saidaSuja (trava de código)', () => {
  it('BARRA número (dígito e por extenso) sempre', () => {
    expect(saidaSuja('fica em R$ 5.000')).toBe('valor_em_reais');
    expect(saidaSuja('dá uns 3000 reais')).toBe('quantia');
    expect(saidaSuja('dá pra recuperar uns 3 mil')).toBe('quantia');
    expect(saidaSuja('o senhor vai receber uns cinco mil reais')).toBe('quantia_extenso');
    expect(saidaSuja('uns 30% do total')).toBe('percentual');
    expect(saidaSuja('trinta por cento do valor')).toBe('percentual');
    expect(saidaSuja('sai em uns quinze dias')).toBe('prazo');
    expect(saidaSuja('sai em até 30 dias')).toBe('prazo');
  });
  it('BARRA promessa/afirmação/credencial SEM negação', () => {
    expect(saidaSuja('você vai receber o dinheiro')).toBe('promessa_resultado');
    expect(saidaSuja('o senhor tem direito ao ressarcimento')).toBe('afirma_direito');
    expect(saidaSuja('a senhora foi vítima de juros abusivos')).toBe('afirma_vitima');
    expect(saidaSuja('eu garanto que resolve')).toBe('garantia');
    expect(saidaSuja('me manda sua senha do Meu INSS')).toBe('credencial');
    expect(saidaSuja('qual o código que chegou no seu celular?')).toBe('credencial');
  });
  it('PASSA as frases legítimas (negação desarma promessa/credencial)', () => {
    expect(saidaSuja('eu não peço senha, não peço código e não acesso o seu Meu INSS')).toBeNull();
    expect(saidaSuja('não dá pra dizer quanto o senhor vai receber sem analisar o caso')).toBeNull();
    expect(saidaSuja('o senhor não precisa saber pegar a senha, nosso consultor te orienta por telefone')).toBeNull();
  });
  it('PASSA o passo novo de ACESSO AO EXTRATO (orientação por telefone)', () => {
    expect(saidaSuja('um consultor liga e te ajuda a acessar o extrato passo a passo')).toBeNull();
    expect(saidaSuja('a senhora não precisa mexer em nada, a gente te acompanha na ligação')).toBeNull();
    expect(saidaSuja('me manda sua senha do Meu INSS que eu acesso pra você')).toBe('credencial'); // ainda BARRA
  });
  it('PASSA a linha de venda (juros acima do teto) e as frases honestas', () => {
    expect(saidaSuja('quem tem empréstimo nessas financeiras muitas vezes está pagando juros acima do que o INSS permite')).toBeNull();
    expect(saidaSuja('vale a pena verificar se há algo no seu nome')).toBeNull();
    expect(saidaSuja('a análise é gratuita e sai hoje')).toBeNull();
    expect(saidaSuja('Oi, tudo bem? Me diz seu nome completo, por favor.')).toBeNull();
    expect(saidaSuja('cada mês continua saindo desconto do seu benefício')).toBeNull();
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
