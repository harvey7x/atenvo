import { describe, it, expect } from 'vitest';
import { chaveDiaSP, rotuloDia, precisaSeparador } from './dataConversa';

// "Agora" fixo para todos os testes relativos: 16/07/2026 (quinta) 15:00 em SP = 18:00 UTC.
const AGORA = new Date('2026-07-16T18:00:00Z');
// Helpers: ISO em UTC correspondente a um horário de SP (SP = UTC-3).
const spm = (dia: string, hhmmss = '12:00:00') => new Date(`${dia}T${hhmmss}-03:00`).toISOString();

describe('chaveDiaSP() — dia no fuso de São Paulo', () => {
  it('meio-dia é trivial', () => {
    expect(chaveDiaSP(spm('2026-07-16'))).toBe('2026-07-16');
  });
  it('21h de SP NÃO vira o dia seguinte (bug do slice UTC)', () => {
    // 21h SP = 00h UTC do dia 17. .slice(0,10) daria 2026-07-17; o correto é 2026-07-16.
    expect(chaveDiaSP('2026-07-17T00:00:00Z')).toBe('2026-07-16');
  });
  it('01h de SP continua no mesmo dia', () => {
    expect(chaveDiaSP(spm('2026-07-16', '01:00:00'))).toBe('2026-07-16');
  });
  it('ISO inválido/nulo → vazio', () => {
    expect(chaveDiaSP(null)).toBe('');
    expect(chaveDiaSP('lixo')).toBe('');
  });
});

describe('rotuloDia() — rótulos relativos', () => {
  it('mensagem de hoje → Hoje', () => {
    expect(rotuloDia(spm('2026-07-16', '09:00:00'), AGORA)).toBe('Hoje');
    expect(rotuloDia(spm('2026-07-16', '23:30:00'), AGORA)).toBe('Hoje'); // ainda hoje em SP
  });
  it('mensagem de ontem → Ontem', () => {
    expect(rotuloDia(spm('2026-07-15'), AGORA)).toBe('Ontem');
  });
  it('mesma semana → dia da semana', () => {
    expect(rotuloDia(spm('2026-07-14'), AGORA)).toBe('Terça-feira');   // 2 dias
    expect(rotuloDia(spm('2026-07-13'), AGORA)).toBe('Segunda-feira'); // 3 dias
    expect(rotuloDia(spm('2026-07-10'), AGORA)).toBe('Sexta-feira');   // 6 dias
  });
  it('7 dias ou mais → data completa DD/MM/AAAA', () => {
    expect(rotuloDia(spm('2026-07-09'), AGORA)).toBe('09/07/2026'); // 7 dias
    expect(rotuloDia(spm('2026-06-30'), AGORA)).toBe('30/06/2026');
  });
  it('virada de mês: ontem cai no mês anterior', () => {
    const agora1ago = new Date('2026-08-01T15:00:00-03:00');
    expect(rotuloDia(spm('2026-07-31'), agora1ago)).toBe('Ontem');
    expect(rotuloDia(spm('2026-08-01'), agora1ago)).toBe('Hoje');
  });
  it('virada de ano: 31/12 visto de 01/01', () => {
    const agora1jan = new Date('2027-01-01T15:00:00-03:00');
    expect(rotuloDia(spm('2026-12-31'), agora1jan)).toBe('Ontem');
    expect(rotuloDia(spm('2026-12-25'), agora1jan)).toBe('25/12/2026'); // 7 dias
  });
  it('data no futuro cai na data cheia (não inventa "Hoje")', () => {
    expect(rotuloDia(spm('2026-07-20'), AGORA)).toBe('20/07/2026');
  });
  it('ISO inválido → vazio', () => {
    expect(rotuloDia(null, AGORA)).toBe('');
  });
});

describe('precisaSeparador() — quando abrir um novo dia', () => {
  it('primeira mensagem da lista sempre abre', () => {
    expect(precisaSeparador(spm('2026-07-16'), null)).toBe(true);
    expect(precisaSeparador(spm('2026-07-16'), undefined)).toBe(true);
  });
  it('mesma data → NÃO repete o separador', () => {
    expect(precisaSeparador(spm('2026-07-16', '16:32:00'), spm('2026-07-16', '15:26:00'))).toBe(false);
  });
  it('mudou o dia → insere separador', () => {
    expect(precisaSeparador(spm('2026-07-16'), spm('2026-07-15'))).toBe(true);
  });
  it('cruza a meia-noite de SP no mesmo instante UTC-adjacente', () => {
    // 23h SP dia 15 (02h UTC 16) e 01h SP dia 16 (04h UTC 16): dias diferentes em SP.
    expect(precisaSeparador('2026-07-16T04:00:00Z', '2026-07-16T02:00:00Z')).toBe(true);
  });
  it('duas msgs à noite no MESMO dia de SP não duplicam', () => {
    // ambas 20h e 22h de SP do dia 16 (23h e 01hUTC): mesmo dia SP.
    expect(precisaSeparador('2026-07-17T01:00:00Z', '2026-07-16T23:00:00Z')).toBe(false);
  });
  it('sem data na atual → não quebra o fio', () => {
    expect(precisaSeparador(null, spm('2026-07-16'))).toBe(false);
  });
});
