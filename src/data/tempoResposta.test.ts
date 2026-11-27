// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({ supabase: null, isSupabaseConfigured: false }));
vi.mock('@/context/OrgContext', () => ({ useOrg: () => ({ currentOrg: { id: 'o' } }) }));

const { demoDashTempo, fmtMin, normalizarDashTempo, pctDentro } = await import('./tempoResposta');
const P = { iniDate: '2026-11-19', fimDate: '2026-11-26', iniISO: '', fimISO: '', prevIniDate: '2026-11-12', prevIniISO: '', dias: 7, label: '', prevLabel: '' };

describe('tempo de resposta', () => {
  it('minutos legíveis', () => {
    expect(fmtMin(0.4)).toBe('< 1 min');
    expect(fmtMin(12.4)).toBe('12 min');
    expect(fmtMin(100)).toBe('1 h 40');
    expect(fmtMin(120)).toBe('2 h');
    expect(fmtMin(60 * 24 * 2.3)).toBe('2,3 dias');
    expect(fmtMin(null)).toBe('—');
  });
  it('% dentro da meta sem dividir por zero', () => {
    expect(pctDentro({ respondidos: 4, dentroMeta: 3 })).toBe(75);
    expect(pctDentro({ respondidos: 0, dentroMeta: 0 })).toBeNull();
  });
  it('lê a resposta do servidor (a da migration 97)', () => {
    const d = normalizarDashTempo({ meta_min: 30, modo: 'uteis', totais: { respondidos: 2, dentro_meta: 1, mediana_min: 35, media_min: 35, p90_min: 47, pior_min: 50 }, anterior: null,
      atendentes: [{ id: 'u', nome: 'Ana', respondidos: 1, dentro_meta: 0, mediana_min: 50 }], aguardando: 1,
      fila: [{ conversa_id: 'c', contato: 'B', desde: '2026-11-25T12:59:10Z', espera_min: 60, responsavel: null }], pela_ia: 1 });
    expect(d.totais).toEqual({ respondidos: 2, dentroMeta: 1, medianaMin: 35, mediaMin: 35, p90Min: 47, piorMin: 50 });
    expect(d.atendentes[0]).toMatchObject({ nome: 'Ana', medianaMin: 50, mediaMin: null });
    expect(d.fila[0]).toMatchObject({ conversaId: 'c', esperaMin: 60, responsavel: null });
    expect(d.pelaIa).toBe(1);
  });
  it('demonstração: tempo corrido é maior que o comercial; a meta muda o "dentro"; do mais lento ao mais rápido', () => {
    const u = demoDashTempo(P, 30, 'uteis', '2026-11-25');
    const c = demoDashTempo(P, 30, 'corrido', '2026-11-25');
    expect(c.totais.medianaMin!).toBeGreaterThan(u.totais.medianaMin!);
    expect(demoDashTempo(P, 120, 'uteis', '2026-11-25').totais.dentroMeta).toBeGreaterThan(u.totais.dentroMeta);
    const meds = u.atendentes.map((x) => x.medianaMin ?? 0);
    expect(meds).toEqual([...meds].sort((a, b) => b - a));
    expect(u.porDia).toHaveLength(7);
  });
});
