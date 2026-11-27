import { describe, expect, it } from 'vitest';
import { bloqueioDesativar, bloqueioExclusao, loginValido, senhaFraca, type UsuarioRow } from './usuarios';

/* regras da tela Usuários (dono 28/09) — as MESMAS guardas da Edge Function reviza-admin */
const u = (id: string, papel: UsuarioRow['papel'], ativo = true): UsuarioRow =>
  ({ id, nome: id, email: `${id}@reviza.local`, usuario: id, papel, ativo, deve_trocar_senha: false, created_at: '2026-09-01T00:00:00Z' });

describe('usuários — senha escolhida pelo admin', () => {
  it('mínimo 8, com letras e números', () => {
    expect(senhaFraca('abc')).toMatch(/8 caracteres/);
    expect(senhaFraca('abcdefgh')).toMatch(/letras e números/);
    expect(senhaFraca('12345678')).toMatch(/letras e números/);
    expect(senhaFraca('Forte2026x')).toBe('');
  });
});

describe('usuários — login', () => {
  it('só letras minúsculas, números, ponto, hífen e _', () => {
    expect(loginValido(' Joana.Silva ')).toBe('joana.silva');
    expect(loginValido('joão')).toBe('joo');
    expect(loginValido('!!!')).toBe('');
  });
});

describe('usuários — proteções', () => {
  const todos = [u('eu', 'admin'), u('bia', 'admin', false), u('rui', 'comercial')];
  it('ninguém exclui ou desativa a si mesmo', () => {
    expect(bloqueioExclusao(todos[0], todos, 'eu')).toMatch(/própria conta/);
    expect(bloqueioDesativar(todos[0], todos, 'eu')).toMatch(/própria conta/);
  });
  it('não sobra sistema sem administrador ativo', () => {
    // outro admin olhando: "eu" é o ÚNICO admin ativo (bia está desativada)
    expect(bloqueioExclusao(todos[0], todos, 'rui')).toMatch(/último administrador/);
    expect(bloqueioDesativar(todos[0], todos, 'rui')).toMatch(/último administrador/);
    const comOutro = [...todos, u('ana', 'admin')];
    expect(bloqueioExclusao(todos[0], comOutro, 'ana')).toBe('');
  });
  it('comercial pode ser excluído/desativado pelo admin', () => {
    expect(bloqueioExclusao(todos[2], todos, 'eu')).toBe('');
    expect(bloqueioDesativar(todos[2], todos, 'eu')).toBe('');
  });
  it('quem já está desativado pode ser reativado sempre', () => {
    expect(bloqueioDesativar(todos[1], todos, 'eu')).toBe('');
  });
});
