import { describe, it, expect } from 'vitest';
import { resolverContextoInicial, type EntradaContexto } from './resolverContexto';

const base: EntradaContexto = { habilitado: true, carregando: false, erro: false, deveTrocarSenha: false, vinculos: [], orgsAtivasComDados: 0 };
const ativo = { status: 'ativo' };
const convidado = { status: 'convidado' };
const inativo = { status: 'inativo' };

describe('resolverContextoInicial', () => {
  it('1. Juliana: vínculo ativo (+deve_trocar) → trocar_senha (prioridade), nunca onboarding', () => {
    expect(resolverContextoInicial({ ...base, deveTrocarSenha: true, vinculos: [ativo], orgsAtivasComDados: 1 })).toBe('trocar_senha');
  });

  it('2. atendente com uma organização ativa → com_organizacao', () => {
    expect(resolverContextoInicial({ ...base, vinculos: [ativo], orgsAtivasComDados: 1 })).toBe('com_organizacao');
  });

  it('3. supervisor com uma organização → com_organizacao', () => {
    expect(resolverContextoInicial({ ...base, vinculos: [ativo], orgsAtivasComDados: 1 })).toBe('com_organizacao');
  });

  it('4. admin com uma organização → com_organizacao', () => {
    expect(resolverContextoInicial({ ...base, vinculos: [ativo], orgsAtivasComDados: 1 })).toBe('com_organizacao');
  });

  it('5. usuário com duas organizações ativas → com_organizacao', () => {
    expect(resolverContextoInicial({ ...base, vinculos: [ativo, ativo], orgsAtivasComDados: 2 })).toBe('com_organizacao');
  });

  it('6. usuário realmente sem organização → sem_organizacao (onboarding)', () => {
    expect(resolverContextoInicial({ ...base, vinculos: [], orgsAtivasComDados: 0 })).toBe('sem_organizacao');
  });

  it('7. memberships ainda carregando → carregando (NUNCA sem_organizacao)', () => {
    expect(resolverContextoInicial({ ...base, carregando: true, vinculos: [], orgsAtivasComDados: 0 })).toBe('carregando');
  });

  it('8. vínculo convidado (sem ativo) → convite_pendente, nunca onboarding', () => {
    expect(resolverContextoInicial({ ...base, vinculos: [convidado], orgsAtivasComDados: 0 })).toBe('convite_pendente');
  });

  it('9. vínculo inativo (sem ativo) → acesso_inativo, nunca onboarding', () => {
    expect(resolverContextoInicial({ ...base, vinculos: [inativo], orgsAtivasComDados: 0 })).toBe('acesso_inativo');
  });

  it('10. deve trocar senha (mesmo sem org carregada) → trocar_senha', () => {
    expect(resolverContextoInicial({ ...base, deveTrocarSenha: true, vinculos: [ativo], orgsAtivasComDados: 0 })).toBe('trocar_senha');
  });

  it('erro ao carregar contexto → erro (nunca sem_organizacao)', () => {
    expect(resolverContextoInicial({ ...base, erro: true, vinculos: [], orgsAtivasComDados: 0 })).toBe('erro');
  });

  it('vínculo ativo mas org não carregou → erro (nunca onboarding)', () => {
    expect(resolverContextoInicial({ ...base, vinculos: [ativo], orgsAtivasComDados: 0 })).toBe('erro');
  });

  it('mock/sem backend (não habilitado) → com_organizacao (fluxo demo)', () => {
    expect(resolverContextoInicial({ ...base, habilitado: false })).toBe('com_organizacao');
  });

  it('prioridade: carregando vence deve_trocar_senha e vínculos', () => {
    expect(resolverContextoInicial({ ...base, carregando: true, deveTrocarSenha: true, vinculos: [ativo], orgsAtivasComDados: 1 })).toBe('carregando');
  });

  it('convidado + inativo (sem ativo) → convite_pendente (convidado tem precedência)', () => {
    expect(resolverContextoInicial({ ...base, vinculos: [convidado, inativo], orgsAtivasComDados: 0 })).toBe('convite_pendente');
  });
});
