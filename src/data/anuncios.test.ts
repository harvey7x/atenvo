// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({ supabase: null, isSupabaseConfigured: false }));
vi.mock('@/context/OrgContext', () => ({ useOrg: () => ({ currentOrg: { id: 'o' } }) }));

const { custoPor, demoDashAnuncios, fmtReais, melhorCampanha, normalizarDashAnuncios, taxa } = await import('./anuncios');
const C = (id: string, investido: number, leads: number, fechados = 0) => ({ id, nome: id, situacao: 'ativa' as const, anuncios: 1, investido, impressoes: 0, cliques: 0, leads, fechados });

describe('anúncios: contas', () => {
  it('custo por lead e taxa sem dividir por zero', () => {
    expect(custoPor(100, 4)).toBe(25);
    expect(custoPor(100, 0)).toBeNull();
    expect(custoPor(0, 10)).toBeNull();
    expect(taxa(1, 4)).toBe(0.25);
    expect(taxa(1, 0)).toBeNull();
  });
  it('rodando melhor = menor custo por lead com pelo menos 10 leads; empate fica com quem fechou mais', () => {
    expect(melhorCampanha([C('barata-sorte', 10, 3), C('a', 300, 30, 2), C('b', 200, 10, 1)])?.id).toBe('a');
    expect(melhorCampanha([C('a', 100, 10, 1), C('b', 100, 10, 3)])?.id).toBe('b');
    expect(melhorCampanha([C('poucos', 10, 3)])).toBeNull();
    expect(melhorCampanha([{ ...C('pausada', 10, 40), situacao: 'pausada' as const }, C('ativa', 300, 30)])?.id).toBe('ativa');
  });
  it('reais no formato brasileiro', () => {
    expect(fmtReais(9.4)).toBe('R$ 9,40');
    expect(fmtReais(2840.5)).toBe('R$ 2.841');
    expect(fmtReais(null)).toBe('—');
  });
  it('lê a resposta do servidor com campos faltando sem quebrar', () => {
    const d = normalizarDashAnuncios({ conectado: true, conta: { id: 'act_1', nome: 'X' }, totais: { investido: '12.5', leads: 3 }, campanhas: [{ id: 'c', situacao: 'estranha', leads: 2 }], leads: [{ conversa_id: 'k', contato: 'Ana', fechado: 1 }] });
    expect(d.totais).toEqual({ investido: 12.5, impressoes: 0, cliques: 0, leads: 3, fechados: 0 });
    expect(d.campanhas[0]).toMatchObject({ situacao: 'ativa', nome: 'Campanha sem nome', leads: 2 });
    expect(d.leads[0]).toMatchObject({ conversaId: 'k', contato: 'Ana', fechado: true, campanha: null });
    expect(d.anterior).toBeNull();
  });
  it('demonstração: sem conta conectada não inventa dinheiro, mas mostra os leads', () => {
    const p = { iniDate: '2026-11-19', fimDate: '2026-11-26', iniISO: '', fimISO: '', prevIniDate: '2026-11-12', prevIniISO: '', dias: 7, label: '', prevLabel: '' };
    const sem = demoDashAnuncios(p, false, '2026-11-25');
    expect(sem.totais.investido).toBe(0);
    expect(sem.totais.leads).toBeGreaterThan(0);
    expect(sem.porDia).toHaveLength(7);
    // "Hoje": o gráfico mostra 7 dias, os totais só o dia de hoje
    const hoje = { ...p, iniDate: '2026-11-25', fimDate: '2026-11-26', dias: 1 };
    const h = demoDashAnuncios(hoje, true, '2026-11-25');
    expect(h.porDia).toHaveLength(7);
    expect(h.totais.leads).toBe(h.porDia[6].leads);
    const com = demoDashAnuncios(p, true, '2026-11-25');
    expect(com.totais.investido).toBeGreaterThan(0);
    expect(com.totais.leads).toBe(sem.totais.leads);
    expect(com.campanhas.reduce((s, c) => s + c.leads, 0)).toBe(com.totais.leads);
  });
});
