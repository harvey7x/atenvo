import { describe, it, expect } from 'vitest';
import { avaliarEnvioSaude } from './whatsapp';

// Saúde de envio do canal a partir dos status das últimas saídas (mais RECENTE primeiro).
// Baseada na taxa real de falha — nunca no state=open.
describe('avaliarEnvioSaude', () => {
  it('sem saídas → ok', () => {
    expect(avaliarEnvioSaude([]).estado).toBe('ok');
  });

  it('3+ falhas consecutivas mais recentes → indisponivel (o "0/N" do incidente)', () => {
    expect(avaliarEnvioSaude(['falhou', 'falhou', 'falhou']).estado).toBe('indisponivel');
    expect(avaliarEnvioSaude(['falhou', 'falhou', 'falhou', 'lida', 'entregue']).estado).toBe('indisponivel');
  });

  it('8 falhas seguidas → indisponivel', () => {
    expect(avaliarEnvioSaude(Array(8).fill('falhou')).estado).toBe('indisponivel');
  });

  it('última saída falhou mas houve sucesso logo antes → instavel (caso RMKT atual)', () => {
    // 17:21 falhou, 17:06 lida
    expect(avaliarEnvioSaude(['falhou', 'lida']).estado).toBe('instavel');
  });

  it('sucesso na frente tira o indisponivel (consecutivas), mas taxa alta mantém instavel', () => {
    expect(avaliarEnvioSaude(['lida', 'falhou', 'falhou']).estado).toBe('instavel'); // 67% falha
  });

  it('maioria de sucesso → ok (volta a saudável só com evidência)', () => {
    expect(avaliarEnvioSaude(['entregue', 'lida', 'entregue']).estado).toBe('ok');
    expect(avaliarEnvioSaude(['lida', 'lida', 'lida', 'falhou']).estado).toBe('ok'); // 25% falha, frente ok
  });

  it('>=40% de falha na janela (com algum sucesso, sem 3 consecutivas na frente) → instavel', () => {
    // recente primeiro: lida, falhou, falhou, lida, falhou  -> 3/5=60% falha, frente=lida (consec=0)
    expect(avaliarEnvioSaude(['lida', 'falhou', 'falhou', 'lida', 'falhou']).estado).toBe('instavel');
  });

  it('poucas saídas com sucesso na frente → ok (não alarmar à toa)', () => {
    expect(avaliarEnvioSaude(['entregue', 'falhou']).estado).toBe('ok');
  });

  it('reporta contadores (falhasConsecutivas/total/falhas)', () => {
    const r = avaliarEnvioSaude(['falhou', 'falhou', 'lida']);
    expect(r.falhasConsecutivas).toBe(2);
    expect(r.total).toBe(3);
    expect(r.falhas).toBe(2);
    expect(r.estado).toBe('instavel');
  });
});
