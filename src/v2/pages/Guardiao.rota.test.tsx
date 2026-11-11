// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';

/* /radar (Central de Avisos) no perfil GESTOR do bom dia (o Murilo — dono 30/10: "a central de avisos não
   precisa aparecer por enquanto"): a rota acessada por URL vai para o Dashboard (Navigate replace). A página
   de verdade (GuardiaoV2), com o perfil mockado. O ramo vendedor (a Central inteira) é coberto pela regra
   destinoDaCentral em src/v2/lib/bomDia.test.ts. */

const estado = vi.hoisted(() => ({ modo: 'gestor' as 'gestor' | 'vendedor' | null }));
vi.mock('@/data/bomDia', () => ({ useModoBomDia: () => estado.modo }));
vi.mock('react-router-dom', async (original) => ({
  ...(await original<typeof import('react-router-dom')>()),
  // no render de servidor o <Navigate> não navega: aqui ele deixa a marca de para onde iria
  Navigate: ({ to, replace }: { to: string; replace?: boolean }) => <i data-navega={to} data-replace={String(!!replace)} />,
}));

import GuardiaoV2 from './Guardiao';

// o MemoryRouter usa useLayoutEffect: no render de servidor o React só avisa (ruído)
const erroOriginal = console.error;
vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => {
  if (String(a[0]).includes('useLayoutEffect does nothing on the server')) return;
  erroOriginal(...a);
});

const abrir = (modo: 'gestor' | null) => {
  estado.modo = modo;
  return renderToString(<MemoryRouter initialEntries={['/radar']}><GuardiaoV2 /></MemoryRouter>);
};

describe('/radar no perfil gestor', () => {
  it('gestor: vai para /dashboard (replace), sem desenhar a Central', () => {
    const html = abrir('gestor');
    expect(html).toContain('data-navega="/dashboard"');
    expect(html).toContain('data-replace="true"');
  });

  it('perfil ainda não lido: espera sem desenhar nada (a Central nunca pisca para o gestor)', () => {
    expect(abrir(null)).toBe('');
  });
});
