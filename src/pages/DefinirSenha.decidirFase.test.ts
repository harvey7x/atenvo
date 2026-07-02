import { describe, it, expect } from 'vitest';
import { decidirFase } from './DefinirSenha';

// Decisão da tela de /definir-senha a partir do estado real do convite/vínculo (convite_estado).
// Nunca depende de ?ativar=1 nem de tem_senha (fantasma em usuários criados pelo convite).
describe('decidirFase', () => {
  it('sem sessão → sem_sessao (nunca "reabra o link")', () => {
    expect(decidirFase(null).fase).toBe('sem_sessao');
    expect(decidirFase({ sessao: false }).fase).toBe('sem_sessao');
  });

  it('usuário novo (convidado, convite pendente) → formulário de senha', () => {
    expect(decidirFase({ sessao: true, convite: 'pendente', vinculo: 'convidado', expirado: false }).fase).toBe('senha');
  });

  it('usuário sem senha real (caso Juliana: pendente + convidado) → formulário de senha', () => {
    // tem_senha=true no Auth é fantasma; o que decide é o vínculo/convite, não a senha.
    expect(decidirFase({ sessao: true, convite: 'pendente', vinculo: 'convidado' }).fase).toBe('senha');
  });

  it('convidado sem convite carregado ainda → formulário de senha', () => {
    expect(decidirFase({ sessao: true, convite: null, vinculo: 'convidado' }).fase).toBe('senha');
  });

  it('conta já ativada (vínculo ativo, convite aceito) → ja_ativo (ir ao login)', () => {
    expect(decidirFase({ sessao: true, convite: 'aceito', vinculo: 'ativo' }).fase).toBe('ja_ativo');
    expect(decidirFase({ sessao: true, convite: null, vinculo: 'ativo' }).fase).toBe('ja_ativo');
  });

  it('reabriu link com convite ainda pendente e vínculo já ativo → prioriza definir senha', () => {
    // se ainda há convite pendente, mesmo com vínculo ativo, permite concluir definindo a senha
    expect(decidirFase({ sessao: true, convite: 'pendente', vinculo: 'ativo' }).fase).toBe('senha');
  });

  it('convite cancelado → erro específico (não genérico)', () => {
    const r = decidirFase({ sessao: true, convite: 'cancelado', vinculo: 'convidado' });
    expect(r.fase).toBe('erro');
    expect(r.erro).toMatch(/cancelad/i);
  });

  it('convite expirado (status) → erro específico', () => {
    const r = decidirFase({ sessao: true, convite: 'expirado', vinculo: 'convidado' });
    expect(r.fase).toBe('erro');
    expect(r.erro).toMatch(/expir/i);
  });

  it('convite pendente porém já vencido (expirado=true) → erro específico', () => {
    const r = decidirFase({ sessao: true, convite: 'pendente', vinculo: 'convidado', expirado: true });
    expect(r.fase).toBe('erro');
    expect(r.erro).toMatch(/expir/i);
  });

  it('sessão sem convite pendente e sem vínculo claro → pendente (concluir ativação, #8)', () => {
    expect(decidirFase({ sessao: true, convite: null, vinculo: null }).fase).toBe('pendente');
  });

  it('nunca retorna a fase que pula o formulário por ativar=1 (fase inexistente aqui)', () => {
    // sanity: as fases possíveis são um conjunto fechado sem "ativar_somente"
    const fases = new Set(['carregando', 'senha', 'pendente', 'sucesso', 'ja_ativo', 'sem_sessao', 'erro']);
    for (const est of [null, { sessao: false }, { sessao: true, convite: 'pendente', vinculo: 'convidado' }, { sessao: true, convite: 'aceito', vinculo: 'ativo' }, { sessao: true, convite: 'cancelado' }]) {
      expect(fases.has(decidirFase(est as never).fase)).toBe(true);
    }
  });
});
