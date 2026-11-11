import { describe, expect, it } from 'vitest';
import { demoVigia, fmtEspera, normalizarVigia } from './vigiaRespostas';

describe('vigia de respostas', () => {
  it('normaliza a resposta da RPC e tolera campos ausentes', () => {
    const d = normalizarVigia(
      { vigia_ok: true, ultimo_batimento: { minutos: 2, erro: null }, abertos: 2, por_severidade: { alta: 1, critica: 1 }, resolvidos_24h: 5, curas_24h: 3, rodadas_24h: 400 },
      [
        { caso_id: 'a', conversa_id: 'v1', nome: 'Maria', canal: 'JUROS', dono: 'Juliana', quem_deve: 'iris', motivo: 'iris_travada', severidade: 'critica', espera_min: 70, tentativas_cura: 2, ultima_msg: 'oi' },
        { caso_id: 'b', conversa_id: 'v2' },
      ],
    );
    expect(d.saude.vigiaOk).toBe(true);
    expect(d.saude.ultimoMinutos).toBe(2);
    expect(d.saude.porSeveridade.critica).toBe(1);
    expect(d.casos).toHaveLength(2);
    expect(d.casos[0].quemDeve).toBe('iris');
    expect(d.casos[1].nome).toBe('Cliente sem nome');
    expect(d.casos[1].quemDeve).toBe('humano');
    expect(d.casos[1].severidade).toBe('atencao');
    expect(d.casos[1].esperaMin).toBe(0);
  });
  it('lixo na resposta nunca derruba a tela (vigia fica "não ok", lista vazia)', () => {
    const d = normalizarVigia(null, 'lixo');
    expect(d.saude.vigiaOk).toBe(false);
    expect(d.saude.ultimoMinutos).toBeNull();
    expect(d.casos).toEqual([]);
  });
  it('formata a espera', () => {
    expect(fmtEspera(9)).toBe('9 min');
    expect(fmtEspera(95)).toBe('1 h 35');
    expect(fmtEspera(120)).toBe('2 h');
    expect(fmtEspera(2900)).toBe('2 d');
  });
  it('a fixture demo tem os mesmos tipos', () => {
    const d = demoVigia();
    expect(d.saude.vigiaOk).toBe(true);
    expect(d.casos.length).toBeGreaterThan(0);
  });
});
