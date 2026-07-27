// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { decidirFase } from '@/pages/DefinirSenha';
import {
  aguardarSessao,
  erroDeLinkUsado,
  erroTransitorio,
  executarAtivacao,
  type DepsAtivacao,
} from './useAtivacaoConvite';
import { executarLiberacao, MSG_LIBERACAO_FALHOU, senhaForte } from './useTrocaSenhaObrigatoria';

const semEspera = async () => {};

function depsAtivacao(sobrescreve: Partial<DepsAtivacao>): DepsAtivacao {
  return {
    getSession: async () => ({ user: {} }),
    refreshSession: async () => null,
    getUser: async () => ({ id: 'u1' }),
    aceitarConvite: async () => ({ error: null }),
    dormir: semEspera,
    ...sobrescreve,
  };
}

describe('decidirFase (regra do v1, travada por teste)', () => {
  it('sem sessão → sem_sessao', () => {
    expect(decidirFase(null).fase).toBe('sem_sessao');
    expect(decidirFase({ sessao: false }).fase).toBe('sem_sessao');
  });
  it('convite cancelado → erro com texto do v1', () => {
    const r = decidirFase({ sessao: true, convite: 'cancelado' });
    expect(r.fase).toBe('erro');
    expect(r.erro).toContain('cancelado');
  });
  it('expirado sem vínculo ativo → erro; com vínculo ativo → ja_ativo', () => {
    expect(decidirFase({ sessao: true, convite: 'expirado' }).fase).toBe('erro');
    expect(decidirFase({ sessao: true, convite: 'expirado', vinculo: 'ativo' }).fase).toBe('ja_ativo');
  });
  it('convidado pendente → SEMPRE formulário de senha', () => {
    expect(decidirFase({ sessao: true, convite: 'pendente' }).fase).toBe('senha');
    expect(decidirFase({ sessao: true, vinculo: 'convidado' }).fase).toBe('senha');
  });
  it('sessão válida sem convite claro → pendente', () => {
    expect(decidirFase({ sessao: true }).fase).toBe('pendente');
  });
});

describe('aguardarSessao (polling 8×)', () => {
  it('retorna assim que a sessão aparece', async () => {
    let chamadas = 0;
    const s = await aguardarSessao({
      getSession: async () => (++chamadas >= 3 ? { user: {} } : null),
      dormir: semEspera,
    });
    expect(s).not.toBeNull();
    expect(chamadas).toBe(3);
  });
  it('desiste após 8 tentativas', async () => {
    let chamadas = 0;
    const s = await aguardarSessao({ getSession: async () => { chamadas++; return null; }, dormir: semEspera });
    expect(s).toBeNull();
    expect(chamadas).toBe(8);
  });
  it('para quando o efeito morre (aindaVivo=false)', async () => {
    let chamadas = 0;
    await aguardarSessao(
      { getSession: async () => { chamadas++; return null; }, dormir: semEspera },
      () => chamadas < 2,
    );
    expect(chamadas).toBeLessThan(8);
  });
});

describe('executarAtivacao (retry e mapeamento de erro do v1)', () => {
  it('sucesso direto', async () => {
    expect(await executarAtivacao(depsAtivacao({}))).toBe('ok');
  });
  it('sem usuário → falha (sem chamar a RPC)', async () => {
    const aceitar = vi.fn(async () => ({ error: null }));
    const r = await executarAtivacao(depsAtivacao({ getUser: async () => null, aceitarConvite: aceitar }));
    expect(r).toBe('falha');
    expect(aceitar).not.toHaveBeenCalled();
  });
  it('erro transitório → exatamente 1 retry, e sucesso na segunda', async () => {
    const aceitar = vi.fn()
      .mockResolvedValueOnce({ error: { message: 'network timeout' } })
      .mockResolvedValueOnce({ error: null });
    expect(await executarAtivacao(depsAtivacao({ aceitarConvite: aceitar }))).toBe('ok');
    expect(aceitar).toHaveBeenCalledTimes(2);
  });
  it('erro NÃO transitório → sem retry', async () => {
    const aceitar = vi.fn(async () => ({ error: { message: 'convite_expirado' } }));
    expect(await executarAtivacao(depsAtivacao({ aceitarConvite: aceitar }))).toBe('expirado');
    expect(aceitar).toHaveBeenCalledTimes(1);
  });
  it('convite_inexistente/vinculo_invalido → ja_ativo (vai pro login, não pro erro)', async () => {
    expect(await executarAtivacao(depsAtivacao({ aceitarConvite: async () => ({ error: { message: 'convite_inexistente' } }) }))).toBe('ja_ativo');
    expect(await executarAtivacao(depsAtivacao({ aceitarConvite: async () => ({ error: { message: 'vinculo_invalido' } }) }))).toBe('ja_ativo');
  });
  it('sem sessão → tenta refreshSession antes de seguir', async () => {
    const refresh = vi.fn(async () => ({ user: {} }));
    await executarAtivacao(depsAtivacao({ getSession: async () => null, refreshSession: refresh }));
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});

describe('executarLiberacao (ordem e resiliência do v1)', () => {
  it('RPC falhou → mensagem de retomada, sem tocar sessões/perfil', async () => {
    const encerrar = vi.fn();
    const atualizar = vi.fn();
    const r = await executarLiberacao({
      baixarFlag: async () => ({ error: { message: 'boom' } }),
      encerrarOutrasSessoes: encerrar,
      atualizarPerfil: atualizar,
    });
    expect(r).toEqual({ ok: false, erro: MSG_LIBERACAO_FALHOU });
    expect(encerrar).not.toHaveBeenCalled();
    expect(atualizar).not.toHaveBeenCalled();
  });
  it('signOut de outras sessões é best-effort (falha não bloqueia)', async () => {
    const atualizar = vi.fn();
    const r = await executarLiberacao({
      baixarFlag: async () => ({ error: null }),
      encerrarOutrasSessoes: async () => { throw new Error('sem rede'); },
      atualizarPerfil: atualizar,
    });
    expect(r.ok).toBe(true);
    expect(atualizar).toHaveBeenCalledTimes(1);
  });
});

describe('regexes do v1, travadas por teste', () => {
  it('senhaForte: 8+ com letra (acentuada vale) e número', () => {
    expect(senhaForte('abcdefg1')).toBe(true);
    expect(senhaForte('ábcdefg1')).toBe(true);
    expect(senhaForte('abcdefgh')).toBe(false);
    expect(senhaForte('12345678')).toBe(false);
    expect(senhaForte('abc1')).toBe(false);
  });
  it('erroTransitorio e erroDeLinkUsado', () => {
    expect(erroTransitorio('fetch failed')).toBe(true);
    expect(erroTransitorio('HTTP 502')).toBe(true);
    expect(erroTransitorio('convite_expirado')).toBe(false);
    expect(erroDeLinkUsado('Token has expired')).toBe(true);
    expect(erroDeLinkUsado('otp_expired')).toBe(true);
    expect(erroDeLinkUsado('senha fraca')).toBe(false);
  });
});
