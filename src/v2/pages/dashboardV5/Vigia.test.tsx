// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';

const estado = vi.hoisted(() => ({ role: 'admin' as string, ok: true }));
vi.mock('@/context/OrgContext', () => ({ useOrg: () => ({ currentOrg: { id: 'org1', role: estado.role } }) }));
vi.mock('@/lib/supabase', () => ({ supabase: null, isSupabaseConfigured: false }));
vi.mock('@/data/vigiaRespostas', async (original) => {
  const m = await original<typeof import('@/data/vigiaRespostas')>();
  return {
    ...m,
    useVigiaRespostas: () => {
      const d = m.demoVigia();
      if (!estado.ok) d.saude = { ...d.saude, vigiaOk: false, ultimoMinutos: 12, ultimoErro: null };
      return { data: d, isError: false };
    },
  };
});

import { Vigia } from './Vigia';

const erroOriginal = console.error;
vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => {
  if (String(a[0]).includes('useLayoutEffect does nothing on the server')) return;
  erroOriginal(...a);
});
const abrir = () => renderToString(<MemoryRouter><Vigia /></MemoryRouter>).replace(/<!-- -->/g, '');

describe('Vigia (painel do dashboard)', () => {
  it('admin vê o batimento verde, os números e a lista', () => {
    estado.role = 'admin'; estado.ok = true;
    const h = abrir();
    expect(h).toContain('Rodou há 1 min');
    expect(h).toContain('José Carlos Pereira');       // espera de 1 h 35: aba "Agora"
    expect(h).not.toContain('Maria de Fátima Souza');  // 1 d 7 h: aba "Antigos"
    expect(h).toContain('Pedro Henrique Lima');
    expect(h).toContain('Iris');
    expect(h).toContain('/whatsapp?conversa=v2');
  });
  it('se o vigia parar, o painel avisa em vermelho', () => {
    estado.role = 'admin'; estado.ok = false;
    const h = abrir();
    expect(h).toContain('Vigia parado há 12 min');
    expect(h).toContain('data-ok="0"');
  });
  it('quem não é admin não vê nada', () => {
    estado.role = 'atendente'; estado.ok = true;
    expect(abrir()).toBe('');
  });
});
