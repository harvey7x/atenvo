// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import type { Dados, GLinha } from '../data/cobranca/types';

/* Dono 27/09: "pro comercial, esse dashboard deve aparecer de forma individual de seus
   clientes, e pro financeiro, administrador deve aparecer geral". Não há login de comercial
   para validar ao vivo sem senha — este teste monta o painel nos dois papéis. */

const estado = vi.hoisted(() => ({ papel: 'financeiro', nome: 'Bruna' as string | null }));
vi.mock('../data/cobranca/sessao', () => ({
  usePapel: () => ({ data: { papel: estado.papel, nome: estado.nome, gestor: estado.papel === 'admin' || estado.papel === 'gestor', podeRevelar: true, podeAprovar: true, id: 'u1' } }),
}));
const COMPS = ['2026-07', '2026-08', '2026-09'];
const lead = (id: string, nome: string, comercial: string, dia: number, celulas: string[], situacao: 'ativo' | 'cancelado' = 'cancelado'): GLinha => ({
  id, nome, comercial, dia, banco: 'AGIBANK', nb: '', cpf: '', senha: '', reclameLogin: '', reclameSenha: '', valor: 400,
  ultimoPgto: '', fechamento: '', recebe: '', telefone: '', situacao, dataReclamacao: '', dataParou: '', parou: '', celulas,
});
const DADOS: Dados = {
  comps: COMPS,
  linhas: [
    lead('a', 'CLIENTE DA PATY', 'PATY', 5, ['100', '100', '100']),
    lead('b', 'OUTRA DA PATY', 'Paty ', 28, ['100', '100', '']),
    lead('c', 'CLIENTE DO GARCIA', 'GARCIA', 5, ['150', 'NÃO PAGOU', '150']),
    lead('d', 'NOVO DO GARCIA', 'GARCIA', 0, ['-', '-', '-'], 'ativo'),
  ],
  pendentes: [], historico: [],
};
vi.mock('../data/cobranca/hooks', () => ({ useDadosCobranca: () => ({ data: DADOS }) }));
vi.mock('../data/cobranca/comissoes', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../data/cobranca/comissoes')>()),
  useComissoes: () => ({ data: {} }),
  useComissoesHist: () => ({ data: {} }),
  useSalvarComissao: () => ({ mutate: () => {}, isPending: false }),
}));
vi.mock('../components/SeloAoVivo', () => ({ SeloAoVivo: () => null }));

const { PainelReviza, AtendentesReviza } = await import('./RevizaPainel');
const { secaoDoPapel, SECOES_COMERCIAL } = await import('../data/cobranca/secoes');

function render(papel: string, nome: string | null) {
  estado.papel = papel; estado.nome = nome;
  // o SSR separa textos adjacentes com <!-- -->
  return renderToString(<PainelReviza />).split('<!-- -->').join('');
}

beforeAll(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-09-27T12:00:00')); });
afterAll(() => { vi.useRealTimers(); });

function renderAtendentes(papel: string, nome: string | null) {
  estado.papel = papel; estado.nome = nome;
  return renderToString(<AtendentesReviza />).split('<!-- -->').join('');
}

describe('Atendentes — não aparece pro comercial (dono 27/09)', () => {
  it('menu e rota: comercial e cadastro não têm a seção Atendentes; financeiro, admin e gestor têm', () => {
    expect(SECOES_COMERCIAL).not.toContain('atendentes');
    expect(secaoDoPapel('comercial', 'atendentes')).toBe(false);
    expect(secaoDoPapel('cadastro', 'atendentes')).toBe(false);
    expect(secaoDoPapel('financeiro', 'atendentes')).toBe(true);
    expect(secaoDoPapel('admin', 'atendentes')).toBe(true);
    expect(secaoDoPapel('gestor', 'atendentes')).toBe(true);
    // Painel: comercial (individual), financeiro (geral) — cadastro segue sem
    expect(secaoDoPapel('comercial', 'painel')).toBe(true);
    expect(secaoDoPapel('financeiro', 'painel')).toBe(true);
    expect(secaoDoPapel('cadastro', 'painel')).toBe(false);
  });
  it('mesmo chegando pela URL, a tela não monta nada para comercial nem cadastro', () => {
    expect(renderAtendentes('comercial', 'Paty')).toBe('');
    expect(renderAtendentes('cadastro', 'Administrador')).toBe('');
  });
  it('financeiro vê a equipe, mas não edita a % de comissão', () => {
    const html = renderAtendentes('financeiro', 'Bruna');
    expect(html).toContain('Desempenho da equipe');
    expect(html).toContain('GARCIA');
    expect(html).not.toContain('aria-label="Comissão de');
  });
  it('admin vê a equipe e edita a % de comissão', () => {
    const html = renderAtendentes('admin', 'Matheus');
    expect(html).toContain('Desempenho da equipe');
    expect(html).toContain('aria-label="Comissão de');
  });
});

describe('Painel — quem vê o quê', () => {
  it('comercial vê SÓ os clientes dele (mesmo com grafia diferente do nome), sem a tabela de atendentes', () => {
    const html = render('comercial', 'Paty');
    expect(html).toContain('Carteira de Paty');
    expect(html).toContain('CLIENTE DA PATY');
    expect(html).toContain('OUTRA DA PATY');
    expect(html).not.toContain('CLIENTE DO GARCIA');
    expect(html).not.toContain('NOVO DO GARCIA');
    expect(html).not.toContain('Desempenho por atendente');
    expect(html).toContain('Minha comissão');
    // topo: 2 em cobrança (os dois da Paty)
    expect(html).toMatch(/<b>2<\/b> em cobrança/);
  });

  it('comercial sem nome no perfil não vê a carteira de ninguém', () => {
    const html = render('comercial', null);
    expect(html).toContain('Sua carteira ainda não tem clientes');
    expect(html).not.toContain('CLIENTE DA PATY');
    expect(html).not.toContain('CLIENTE DO GARCIA');
  });

  it('financeiro vê o painel GERAL (todos os comerciais + desempenho por atendente)', () => {
    const html = render('financeiro', 'Bruna');
    expect(html).not.toContain('Carteira de');
    expect(html).toContain('Desempenho por atendente');
    expect(html).toContain('CLIENTE DA PATY');
    expect(html).toContain('CLIENTE DO GARCIA');
    expect(html).toMatch(/<b>3<\/b> em cobrança/);
    expect(html).toMatch(/<b>1<\/b> nos Novos/);
  });

  it('admin vê o painel GERAL', () => {
    const html = render('admin', 'Matheus');
    expect(html).toContain('Desempenho por atendente');
    expect(html).toContain('CLIENTE DO GARCIA');
  });
});
