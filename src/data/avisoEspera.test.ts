// @vitest-environment node
// Aviso de cliente esperando além da meta: as contas puras da tela (as mesmas do agendador da migration 106)
import { describe, expect, it } from 'vitest';
import { AVISO_PADRAO, fmtMinutos, quemRecebe, validarAviso } from './avisoEspera';

describe('aviso de espera', () => {
  it('escreve o tempo como o servidor', () => {
    expect(fmtMinutos(35)).toBe('35 min');
    expect(fmtMinutos(60)).toBe('1 h');
    expect(fmtMinutos(65)).toBe('1 h 05 min');
    expect(fmtMinutos(130)).toBe('2 h 10 min');
  });
  it('confere as regras antes de salvar', () => {
    expect(validarAviso(AVISO_PADRAO)).toBeNull();
    expect(validarAviso({ ...AVISO_PADRAO, metaMin: 2 })).toMatch(/meta/);
    expect(validarAviso({ ...AVISO_PADRAO, metaMin: 60, gestorAposMin: 30 })).toMatch(/depois da meta/);
    expect(validarAviso({ ...AVISO_PADRAO, ativo: true, avisarResponsavel: false, avisarGestores: false })).toMatch(/quem recebe/);
    expect(validarAviso({ ...AVISO_PADRAO, ativo: false, avisarResponsavel: false, avisarGestores: false })).toBeNull();
  });
  it('diz quem recebe e quando', () => {
    expect(quemRecebe(AVISO_PADRAO)).toBe('Avisa o responsável com 30 min sem resposta e os gestores com 1 h (ou com 30 min, se a conversa não tiver responsável).');
    expect(quemRecebe({ ...AVISO_PADRAO, gestorAposMin: 30 })).toBe('Avisa o responsável com 30 min sem resposta e os gestores com 30 min.');
    expect(quemRecebe({ ...AVISO_PADRAO, avisarGestores: false })).toBe('Avisa o responsável com 30 min sem resposta.');
    expect(quemRecebe({ ...AVISO_PADRAO, avisarResponsavel: false, avisarGestores: false })).toBe('Ninguém recebe o aviso.');
  });
});
