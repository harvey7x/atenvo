import { describe, it, expect } from 'vitest';
import { slotDoCanal, estaNaVez, pausaAte, temTestePendenteRecente, SLOTS, type RunResumo } from '../../supabase/functions/wa-health-check/agenda';

const A = '35014965-0e51-4c7e-aa12-627547f66374';
const B = 'a6bde9ea-16f6-41e8-bb7f-8c4de14467a5';
const C = '094fa2cc-549c-4c64-910c-b111eeb79a0f';
const AGORA = new Date('2026-07-16T18:00:00Z').getTime();
const run = (status: string, minAtras: number): RunResumo =>
  ({ status_resultado: status, executado_em: new Date(AGORA - minAtras * 60_000).toISOString() });

describe('slot/jitter — 5 testes por hora, sem rajada', () => {
  it('slot fica no intervalo e é DETERMINÍSTICO', () => {
    for (const id of [A, B, C]) {
      const s = slotDoCanal(id);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThan(SLOTS);
      expect(slotDoCanal(id)).toBe(s); // estável entre chamadas
    }
  });
  it('cada canal dispara EXATAMENTE 5x por hora', () => {
    for (const id of [A, B, C]) {
      const disparos = Array.from({ length: 60 }, (_, min) => min).filter((min) => estaNaVez(id, min));
      expect(disparos).toHaveLength(5);
      // sempre espaçados de 12 min
      expect(disparos.map((m, i) => (i === 0 ? 12 : m - disparos[i - 1]))).toEqual([12, 12, 12, 12, 12]);
    }
  });
  it('canais diferentes tendem a cair em minutos diferentes (espalhamento)', () => {
    const slots = new Set([slotDoCanal(A), slotDoCanal(B), slotDoCanal(C)]);
    expect(slots.size).toBeGreaterThan(1); // não colidem todos no mesmo minuto
  });
});

describe('pausa automática por restrição (calculada do histórico)', () => {
  it('sem histórico → não pausa', () => {
    expect(pausaAte([], AGORA)).toBeNull();
  });
  it('tudo entregue → não pausa', () => {
    expect(pausaAte([run('entregue', 1), run('lida', 13), run('entregue', 25)], AGORA)).toBeNull();
  });
  it('3 ERROR seguidos → pausa 1h a partir do último run', () => {
    const p = pausaAte([run('ERROR', 2), run('ERROR', 14), run('ERROR', 26), run('entregue', 38)], AGORA);
    expect(p).toBe(new Date(AGORA - 2 * 60_000 + 60 * 60_000).toISOString());
  });
  it('2 ERROR seguidos ainda NÃO pausa', () => {
    expect(pausaAte([run('ERROR', 2), run('ERROR', 14), run('entregue', 26)], AGORA)).toBeNull();
  });
  it('0 entregas nos últimos 5 → pausa (mesmo sem 3 ERROR seguidos)', () => {
    const runs = [run('timeout', 2), run('ERROR', 14), run('timeout', 26), run('ERROR', 38), run('timeout', 50)];
    expect(pausaAte(runs, AGORA)).not.toBeNull();
  });
  it('1 entrega nos últimos 5 → NÃO pausa', () => {
    const runs = [run('timeout', 2), run('ERROR', 14), run('entregue', 26), run('ERROR', 38), run('timeout', 50)];
    expect(pausaAte(runs, AGORA)).toBeNull();
  });
  it('pausa EXPIRA sozinha depois de 1h', () => {
    const antigos = [run('ERROR', 61), run('ERROR', 73), run('ERROR', 85)];
    expect(pausaAte(antigos, AGORA)).toBeNull(); // último erro > 1h atrás → volta a testar
  });
  it('run ainda aguardando ACK não conta para a decisão', () => {
    const runs = [run('aguardando_ack', 0), run('ERROR', 12), run('ERROR', 24), run('ERROR', 36)];
    expect(pausaAte(runs, AGORA)).not.toBeNull(); // os 3 ERROR concluídos mandam
  });
  it('3 TIMEOUTS seguidos também pausam (sem ACK final = provável sessão/rota)', () => {
    expect(pausaAte([run('timeout', 2), run('timeout', 14), run('timeout', 26)], AGORA)).not.toBeNull();
  });
  it('2 timeouts seguidos ainda NÃO pausam', () => {
    expect(pausaAte([run('timeout', 2), run('timeout', 14), run('entregue', 26)], AGORA)).toBeNull();
  });
  it('timeout + erro alternados não disparam a regra dos 3 seguidos (mas 0-em-5 sim)', () => {
    const misto = [run('timeout', 2), run('ERROR', 14), run('timeout', 26)];
    expect(pausaAte(misto, AGORA)).toBeNull();                       // só 3 concluídos, nenhum trio puro
    const cinco = [...misto, run('ERROR', 38), run('timeout', 50)];
    expect(pausaAte(cinco, AGORA)).not.toBeNull();                   // 5 sem nenhuma entrega
  });
});

describe('anti-rajada: não enviar teste novo enquanto o anterior aguarda ACK', () => {
  it('pendente RECENTE (<5min) bloqueia novo envio', () => {
    expect(temTestePendenteRecente([run('aguardando_ack', 2)], AGORA)).toBe(true);
  });
  it('pendente ANTIGO (>5min) NÃO bloqueia — será varrido p/ timeout', () => {
    expect(temTestePendenteRecente([run('aguardando_ack', 9)], AGORA)).toBe(false);
  });
  it('sem pendente, libera', () => {
    expect(temTestePendenteRecente([run('entregue', 1), run('ERROR', 13)], AGORA)).toBe(false);
  });
  it('exatamente no limite de 5min não bloqueia', () => {
    expect(temTestePendenteRecente([run('aguardando_ack', 5)], AGORA)).toBe(false);
  });
});
