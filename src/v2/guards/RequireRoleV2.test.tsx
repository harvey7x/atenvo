// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import RequireRoleV2 from './RequireRoleV2';

/* Não existe usuário não-admin em produção para validar ao vivo (a equipe é
   só o dono, admin) — este teste cobre o ramo negado e o permitido. */

const estado = vi.hoisted(() => ({ papel: 'atendente' }));
vi.mock('@/context/OrgContext', () => ({
  useOrg: () => ({ currentOrg: { id: 'org1', name: 'Org Sigilosa', slug: 'org', role: estado.papel } }),
}));
// CSS importado pelos componentes não interessa ao teste
vi.mock('../components/componentes.css', () => ({}));

function render(papel: string) {
  estado.papel = papel;
  return renderToString(
    <MemoryRouter>
      <RequireRoleV2 role="admin">
        <div data-marca="conteudo-secreto">Página admin</div>
      </RequireRoleV2>
    </MemoryRouter>,
  );
}

describe('RequireRoleV2', () => {
  it('bloqueia papel sem permissão, sem renderizar o conteúdo nem vazar dados', () => {
    const html = render('atendente');
    expect(html).toContain('Acesso restrito');
    expect(html).toContain('Você não tem permissão');
    expect(html).not.toContain('conteudo-secreto');
    expect(html).not.toContain('Página admin');
    // genérico de propósito: nada de nome de organização nem da área
    expect(html).not.toContain('Org Sigilosa');
    expect(html).not.toContain('Plano e uso');
  });

  it('bloqueia gestor quando a exigência é admin (mesma regra do RequireRole v1)', () => {
    expect(render('gestor')).not.toContain('conteudo-secreto');
  });

  it('deixa admin passar', () => {
    const html = render('admin');
    expect(html).toContain('conteudo-secreto');
    expect(html).not.toContain('Acesso restrito');
  });
});
