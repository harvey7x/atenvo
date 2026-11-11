import { describe, expect, it } from 'vitest';
import { decidirConfiguracao, PAPEIS_ASSISTENTE, type EntradaDecisao } from './decidir';
import { apresentarMensalidade, ehContaSuporte, lerPreviaConfig } from '../../data/cobranca/configuracao';
import { apresentarLicenca } from '../../data/cobranca/licenca';

/* Configuração inicial obrigatória — quem vê o quê (decisão do dono):
   admin/gestor/cadastro/financeiro → assistente; comercial → espera;
   suporte → aviso discreto; erro/concluída/inativa → nada (fail-open). */

const base = (extra?: Partial<EntradaDecisao>): EntradaDecisao => ({
  modo: 'reviza', previa: false, status: 'pendente', erro: false, papel: 'admin', isento: false, ...extra,
});

describe('decidirConfiguracao: papel × estado × isento × erro × modo', () => {
  it('comercial → tela de espera', () => {
    expect(decidirConfiguracao(base({ papel: 'comercial' }))).toBe('espera');
  });

  it.each(['admin', 'gestor', 'cadastro', 'financeiro'] as const)('%s → assistente (faz todas as etapas)', (papel) => {
    expect(decidirConfiguracao(base({ papel }))).toBe('assistente');
  });

  it('a lista de quem vê o assistente é exatamente admin, gestor, cadastro e financeiro', () => {
    expect([...PAPEIS_ASSISTENTE].sort()).toEqual(['admin', 'cadastro', 'financeiro', 'gestor']);
  });

  it('conta de suporte isenta → aviso discreto (qualquer papel)', () => {
    expect(decidirConfiguracao(base({ isento: true }))).toBe('aviso-isento');
    expect(decidirConfiguracao(base({ isento: true, papel: 'comercial' }))).toBe('aviso-isento');
  });

  it('erro de leitura → nada (fail-open: nunca tranca o escritório)', () => {
    expect(decidirConfiguracao(base({ erro: true }))).toBe('nada');
    expect(decidirConfiguracao(base({ erro: true, papel: 'comercial' }))).toBe('nada');
    expect(decidirConfiguracao(base({ erro: true, isento: true }))).toBe('nada');
  });

  it('configuração concluída → nada (para todos)', () => {
    expect(decidirConfiguracao(base({ status: 'concluida' }))).toBe('nada');
    expect(decidirConfiguracao(base({ status: 'concluida', papel: 'comercial' }))).toBe('nada');
    expect(decidirConfiguracao(base({ status: 'concluida', isento: true }))).toBe('nada');
  });

  it('demo sem prévia → nada; demo COM prévia segue as regras', () => {
    expect(decidirConfiguracao(base({ modo: 'demo' }))).toBe('nada');
    expect(decidirConfiguracao(base({ modo: 'demo', previa: true }))).toBe('assistente');
    expect(decidirConfiguracao(base({ modo: 'demo', previa: true, papel: 'comercial' }))).toBe('espera');
  });

  it('Atenvo (outro) sem prévia → nada', () => {
    expect(decidirConfiguracao(base({ modo: 'outro' }))).toBe('nada');
  });

  it('reviza sem backend (estado inativo) → nada', () => {
    expect(decidirConfiguracao(base({ status: 'inativo' }))).toBe('nada');
    expect(decidirConfiguracao(base({ status: 'inativo', papel: 'comercial' }))).toBe('nada');
  });

  it('carregando (estado ou papel) → nada, sem piscar a tela de espera', () => {
    expect(decidirConfiguracao(base({ status: undefined }))).toBe('nada');
    expect(decidirConfiguracao(base({ papel: undefined }))).toBe('nada');
  });

  it('sem papel ativo → espera (não ganha o assistente)', () => {
    expect(decidirConfiguracao(base({ papel: null }))).toBe('espera');
  });
});

describe('prévia por querystring', () => {
  it('só liga em DEV/demo (liberada) e com cenário válido', () => {
    expect(lerPreviaConfig('?config=admin', false)).toBeNull();
    expect(lerPreviaConfig('?config=qualquer', true)).toBeNull();
    expect(lerPreviaConfig('', true)).toBeNull();
  });

  it('papel padrão: equipe → comercial; demais → admin; ?papel= força', () => {
    expect(lerPreviaConfig('?config=equipe', true)?.papel).toBe('comercial');
    expect(lerPreviaConfig('?config=admin-whats-ok', true)?.papel).toBe('admin');
    expect(lerPreviaConfig('?config=admin&papel=financeiro', true)?.papel).toBe('financeiro');
    expect(lerPreviaConfig('?config=admin&papel=chefe', true)?.papel).toBe('admin'); // papel inválido = padrão
  });

  it('isento, pix e wa', () => {
    const p = lerPreviaConfig('?config=admin&isento=1&pix=indisponivel&wa=erro', true);
    expect(p).toMatchObject({ cenario: 'admin', isento: true, pix: 'indisponivel', waErro: true });
    expect(lerPreviaConfig('?config=admin', true)).toMatchObject({ isento: false, pix: 'ok', waErro: false });
  });

  it('lê também a querystring dentro do hash (HashRouter)', () => {
    expect(lerPreviaConfig('#/cobrancas/painel?config=concluida', true)?.cenario).toBe('concluida');
  });
});

describe('contas de suporte', () => {
  it('Matheus e "Teste (verificação)" (sem acento/caixa) são isentos; o resto não', () => {
    expect(ehContaSuporte('Matheus')).toBe(true);
    expect(ehContaSuporte('Teste (verificação)')).toBe(true);
    expect(ehContaSuporte('  TESTE (VERIFICACAO) ')).toBe(true);
    expect(ehContaSuporte('Matheus Silva')).toBe(false);
    expect(ehContaSuporte(null)).toBe(false);
  });
});

describe('apresentarMensalidade (etapa 3)', () => {
  const lic = apresentarLicenca({
    estado: 'bloqueado', comp: '2026-10', valor_centavos: 10_000, vence_em: '2026-10-05',
    bloqueia_em: '2026-10-05T14:00:00-03:00', pix_copia_cola: '000201-exemplo', qr_base64: 'QUJD',
  }, new Date('2026-10-19T10:00:00-03:00'));

  it('vencida: referência, vencimento e próxima mensalidade', () => {
    const m = apresentarMensalidade(lic, new Date('2026-10-19T10:00:00-03:00'));
    expect(m).toMatchObject({
      disponivel: true, valor: 'R$ 100,00', referencia: 'outubro/2026', vencimento: '05/10/2026', vencida: true,
      proxima: { valor: 'R$ 100,00', data: '05/11/2026' }, pagoEm: null,
    });
  });

  it('no dia do vencimento ainda não está vencida; dezembro vira janeiro', () => {
    expect(apresentarMensalidade(lic, new Date('2026-10-05T09:00:00-03:00')).vencida).toBe(false);
    const dez = apresentarLicenca({ estado: 'aviso', comp: '2026-12', valor_centavos: 10_000, vence_em: '2026-12-05', pix_copia_cola: 'x' }, new Date('2026-12-01T09:00:00-03:00'));
    expect(apresentarMensalidade(dez, new Date('2026-12-01T09:00:00-03:00')).proxima?.data).toBe('05/01/2027');
  });

  it('sem Pix gerado → indisponível', () => {
    const semPix = apresentarLicenca({ estado: 'bloqueado', comp: '2026-10', valor_centavos: 10_000, vence_em: '2026-10-05' }, new Date());
    expect(apresentarMensalidade(semPix, new Date()).disponivel).toBe(false);
    expect(apresentarMensalidade(null, new Date()).disponivel).toBe(false);
  });
});
