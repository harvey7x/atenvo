import { describe, it, expect } from 'vitest';
import { classificarMovimento, traduzErroKanban } from './kanban';

// Decisão de movimento espelha o trigger opp_sync_fechamento (por RESULTADO, não pelo nome da coluna).
describe('classificarMovimento', () => {
  it('neutra → neutra: move direto (sem modal)', () => {
    expect(classificarMovimento('neutro', 'neutro')).toBe('neutro');
  });
  it('neutra → ganho: confirmação de fechamento', () => {
    expect(classificarMovimento('neutro', 'ganho')).toBe('ganho');
  });
  it('neutra → perdido: exige motivo de perda', () => {
    expect(classificarMovimento('neutro', 'perdido')).toBe('perdido');
  });
  it('ganho → neutra: reabertura (exige motivo)', () => {
    expect(classificarMovimento('ganho', 'neutro')).toBe('reabertura');
  });
  it('perdido → neutra: reabertura (exige motivo)', () => {
    expect(classificarMovimento('perdido', 'neutro')).toBe('reabertura');
  });
  it('ganho → perdido: exige motivo de perda (terminal → terminal)', () => {
    expect(classificarMovimento('ganho', 'perdido')).toBe('perdido');
  });
  it('perdido → ganho: confirmação de fechamento, sem reabertura intermediária', () => {
    expect(classificarMovimento('perdido', 'ganho')).toBe('ganho');
  });
});

describe('traduzErroKanban', () => {
  it('motivo_perda_obrigatorio → mensagem de perda', () => {
    expect(traduzErroKanban('motivo_perda_obrigatorio')).toMatch(/motivo da perda/i);
  });
  it('motivo_perda_desc_obrigatorio → mensagem de descrição', () => {
    expect(traduzErroKanban('motivo_perda_desc_obrigatorio')).toMatch(/descreva/i);
  });
  it('motivo_reabertura_obrigatorio → mensagem de reabertura', () => {
    expect(traduzErroKanban('motivo_reabertura_obrigatorio')).toMatch(/reabertura/i);
  });
  it('conflito otimista → atualize o Kanban', () => {
    expect(traduzErroKanban('conflito_otimista')).toMatch(/alterada por outra pessoa/i);
  });
  it('permissão → sem permissão', () => {
    expect(traduzErroKanban('sem_permissao')).toMatch(/permissão/i);
    expect(traduzErroKanban('permission denied')).toMatch(/permissão/i);
  });
  it('desconhecido → mensagem genérica (nunca SQL bruto)', () => {
    const m = traduzErroKanban('ERROR: some raw sql 42P01');
    expect(m).toMatch(/não foi possível/i);
    expect(m).not.toMatch(/42P01|ERROR:/);
  });
});
