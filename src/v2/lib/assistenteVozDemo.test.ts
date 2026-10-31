// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EstadoVoz } from './assistenteVozSessao';
import {
  PERGUNTA_LEMBRETE_DEMO, amanhaFalado, confirmacaoLembreteDemo, criarSessaoDemo, ehRoteiroDemo,
} from './assistenteVozDemo';

/* A conversa SIMULADA da demo com o LEMBRETE (V1, dono 31/10: "só coloco os lembretes ali"): ela cumprimenta,
   você pede "me lembra amanhã à uma da tarde de ligar para o João", a linha de estado diz "Anotando o
   lembrete…" e ela confirma falando o dia relativo, o dia da semana, a data e a hora — o calendário de amanhã
   no fuso do CAF, como a RPC fala (assistente_lembrete_quando). */

const SP = (iso: string) => Date.parse(`${iso}-03:00`);

describe('amanhã por extenso (fuso do CAF)', () => {
  it('sábado 31/10/2026 → domingo, 1º de novembro; virada do ano com o ano; a data é a de Brasília, não a UTC', () => {
    expect(amanhaFalado(SP('2026-10-31T00:40'))).toEqual({ dia_semana: 'domingo', data_extenso: '1º de novembro' });
    expect(amanhaFalado(SP('2026-10-30T12:00'))).toEqual({ dia_semana: 'sábado', data_extenso: '31 de outubro' });
    expect(amanhaFalado(SP('2026-12-31T23:30'))).toEqual({ dia_semana: 'sexta-feira', data_extenso: '1º de janeiro de 2027' });
    // 21:30 de domingo em Brasília já é segunda em UTC: amanhã continua sendo segunda, 2 de novembro
    expect(amanhaFalado(SP('2026-11-01T21:30'))).toEqual({ dia_semana: 'segunda-feira', data_extenso: '2 de novembro' });
    expect(amanhaFalado(SP('2026-11-04T09:00'))).toEqual({ dia_semana: 'quinta-feira', data_extenso: '5 de novembro' });
  });

  it('a confirmação: o dia relativo, o dia da semana, a data, a hora e o texto; sem emoji', () => {
    const c = confirmacaoLembreteDemo(SP('2026-10-31T00:40'));
    expect(c).toBe('Combinado: amanhã, domingo, 1º de novembro, à uma da tarde, eu te lembro de ligar para o João.');
    expect(`${c}${PERGUNTA_LEMBRETE_DEMO}`).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});

describe('o roteiro "lembrete" da demo', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('cumprimenta → você pede o lembrete → "Anotando o lembrete…" → a confirmação falada → volta a ouvir', async () => {
    expect(ehRoteiroDemo('lembrete')).toBe(true);
    expect(ehRoteiroDemo('lembretes')).toBe(false);
    const estados: EstadoVoz[] = [];
    let ms = 0;
    const s = criarSessaoDemo({
      nome: 'Matheus', admin: true, roteiro: 'lembrete', aoMudar: (e) => estados.push(e),
      agora: () => ms, dataMs: () => SP('2026-10-31T00:40'),
    });
    const passa = async (n: number) => { for (let i = 0; i < n; i += 50) { ms += 50; await vi.advanceTimersByTimeAsync(50); } };
    s.iniciar();
    expect(estados[0].fase).toBe('conectando');
    await passa(2_000);
    expect(s.estado().fase).toBe('falando'); // o cumprimento
    await passa(3_000 + 1_300 + 2_600 + 450 + 200);
    const consultando = estados.find((e) => e.fase === 'consultando');
    expect(consultando?.consulta).toEqual(['criar_lembrete']);
    expect(consultando?.voce).toBe(PERGUNTA_LEMBRETE_DEMO);
    await passa(1_300 + 6_400 + 600);
    const fim = s.estado();
    expect(fim.fase).toBe('ouvindo');
    expect(fim.falaConcluida).toBe('Combinado: amanhã, domingo, 1º de novembro, à uma da tarde, eu te lembro de ligar para o João.');
    expect(fim.links).toEqual([]);
    s.encerrar();
    expect(s.estado().fase).toBe('encerrada');
  });

  it('a conversa padrão continua com "Consultando o sistema…" (sem ferramenta de lembrete)', async () => {
    const estados: EstadoVoz[] = [];
    let ms = 0;
    const s = criarSessaoDemo({ nome: 'Matheus', admin: true, aoMudar: (e) => estados.push(e), agora: () => ms });
    s.iniciar();
    for (let i = 0; i < 200 && !estados.some((e) => e.fase === 'consultando'); i++) { ms += 50; await vi.advanceTimersByTimeAsync(50); }
    expect(estados.find((e) => e.fase === 'consultando')?.consulta).toEqual([]);
    s.encerrar();
  });
});
