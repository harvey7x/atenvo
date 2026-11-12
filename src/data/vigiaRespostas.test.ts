import { describe, expect, it } from 'vitest';
import { demoVigia, fmtEspera, normalizarVigia } from './vigiaRespostas';

describe('vigia de respostas', () => {
  it('normaliza a resposta da RPC e tolera campos ausentes', () => {
    const d = normalizarVigia(
      {
        vigia_ok: true,
        ultimo_batimento: { rodou_em: '2026-11-12T17:59:00Z', minutos: 2, erro: null },
        abertos: 2, por_severidade: { alta: 1, critica: 1 }, resolvidos_24h: 5, curas_24h: 3, rodadas_24h: 400,
      },
      [
        {
          caso_id: 'a', conversa_id: 'v1', nome: 'Maria', telefone: '5551994261234', canal: 'JUROS', dono: 'Juliana',
          quem_deve: 'iris', motivo: 'iris_travada', severidade: 'critica', espera_min: 70, tentativas_cura: 2,
          ultima_msg: 'oi', aberto_em: '2026-11-12T16:00:00Z',
        },
        { caso_id: 'b', conversa_id: 'v2' },
      ],
    );
    expect(d.saude.vigiaOk).toBe(true);
    expect(d.saude.ultimoMinutos).toBe(2);
    expect(d.saude.ultimoEm).toBe('2026-11-12T17:59:00Z');
    expect(d.saude.porSeveridade.critica).toBe(1);
    expect(d.casos).toHaveLength(2);
    expect(d.casos[0].quemDeve).toBe('iris');
    expect(d.casos[0].telefone).toBe('5551994261234');
    expect(d.casos[0].abertoEm).toBe('2026-11-12T16:00:00Z');
    expect(d.casos[1].nome).toBe('Cliente sem nome');
    expect(d.casos[1].telefone).toBeNull();
    expect(d.casos[1].abertoEm).toBeNull();
    expect(d.casos[1].quemDeve).toBe('humano');
    expect(d.casos[1].severidade).toBe('atencao');
    expect(d.casos[1].esperaMin).toBe(0);
  });

  it('lixo na resposta nunca derruba a tela (vigia fica "não ok", lista vazia)', () => {
    const d = normalizarVigia(null, 'lixo');
    expect(d.saude.vigiaOk).toBe(false);
    expect(d.saude.ultimoMinutos).toBeNull();
    expect(d.saude.ultimoEm).toBeNull();
    expect(d.casos).toEqual([]);
  });

  it('formata a espera', () => {
    expect(fmtEspera(9)).toBe('9 min');
    expect(fmtEspera(95)).toBe('1 h 35');
    expect(fmtEspera(120)).toBe('2 h');
    expect(fmtEspera(1900)).toBe('1 d 7 h');
    expect(fmtEspera(2900)).toBe('2 d');
    expect(fmtEspera(17280)).toBe('12 d');
  });

  it('a demo tem 9 casos da Iris (o painel é só deles) e mantém os demais para provar o filtro', () => {
    const d = demoVigia();
    expect(d.casos).toHaveLength(236);
    const por = (q: string) => d.casos.filter((c) => c.quemDeve === q).length;
    expect(por('iris')).toBe(9);
    expect(por('robo')).toBe(29);
    expect(por('humano')).toBe(198);
    const iris = d.casos.filter((c) => c.quemDeve === 'iris');
    expect(iris.filter((c) => c.esperaMin < 60)).toHaveLength(3);
    expect(iris.filter((c) => c.esperaMin >= 60 && c.esperaMin < 1440)).toHaveLength(4);
    expect(iris.filter((c) => c.esperaMin >= 1440)).toHaveLength(2);
    // uma Iris com a cura esgotada (crítica, 2 tentativas, antes das 24 h) e um número desconectado dela
    const esgotada = iris.filter((c) => c.severidade === 'critica' && c.esperaMin < 1440);
    expect(esgotada).toHaveLength(1);
    expect(esgotada[0].tentativasCura).toBe(2);
    expect(iris.filter((c) => c.motivo === 'canal_desconectado')).toHaveLength(1);
    // por_severidade bate com a contagem da própria lista
    const conta = (s: string) => d.casos.filter((c) => c.severidade === s).length;
    expect(d.saude.porSeveridade).toEqual({ atencao: conta('atencao'), alta: conta('alta'), critica: conta('critica') });
    expect(d.saude.abertos).toBe(236);
    // a mesma semente gera a mesma lista
    expect(demoVigia().casos.map((c) => c.nome)).toEqual(d.casos.map((c) => c.nome));
  });

  it('variantes do demo: parado, erro, vazio e cortada', () => {
    const parado = demoVigia({ variante: 'parado' });
    expect(parado.saude.vigiaOk).toBe(false);
    expect(parado.saude.ultimoMinutos).toBe(12);
    expect(demoVigia({ variante: 'erro' }).saude.ultimoErro).toBeTruthy();
    expect(demoVigia({ variante: 'vazio' }).casos).toHaveLength(0);
    const cortada = demoVigia({ variante: 'cortada' });
    expect(cortada.casos).toHaveLength(300);
    expect(cortada.casos.every((c) => c.quemDeve === 'iris')).toBe(true);
    expect(cortada.saude.abertos).toBe(412);
  });
});
