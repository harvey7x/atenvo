// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { NOVIDADES, naoVistas, novidadesPara } from './novidades';

describe('o que mudou', () => {
  it('ids únicos e rotas que começam com /', () => {
    expect(new Set(NOVIDADES.map((n) => n.id)).size).toBe(NOVIDADES.length);
    expect(NOVIDADES.every((n) => n.rota.startsWith('/'))).toBe(true);
  });
  it('atendente não vê as do administrador; recurso desligado some', () => {
    const tudo = () => true;
    const adm = novidadesPara(true, tudo); const at = novidadesPara(false, tudo);
    expect(adm.length).toBe(NOVIDADES.length);
    expect(at.some((n) => n.soAdmin)).toBe(false);
    expect(novidadesPara(true, (r) => r !== 'tarefas').some((n) => n.recurso === 'tarefas')).toBe(false);
  });
  it('conta só as que faltam ver', () => {
    const lista = novidadesPara(true, () => true);
    expect(naoVistas(lista, new Set())).toBe(lista.length);
    expect(naoVistas(lista, new Set(lista.map((n) => n.id)))).toBe(0);
  });
});
