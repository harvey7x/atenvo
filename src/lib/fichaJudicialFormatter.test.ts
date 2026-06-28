import { describe, it, expect } from 'vitest';
import { formatarFichaJudicial, type FichaFmtDados } from './fichaJudicialFormatter';

const completa: FichaFmtDados = {
  gerenteNome: 'Matheus Teste',
  cidade: 'Porto Alegre', uf: 'RS',
  nome: 'Joao Pedro Teste',
  beneficioNumero: '1234567890',
  especieCodigo: '41', especieDescricao: 'Aposentadoria por idade',
  bancoCodigo: '121', bancoNome: 'Agibank',
  valorBeneficio: 1412,
  cpf: '529.982.247-25', rg: '1234567',
  nascimento: '1955-08-20', idade: 68,
  telefone: '(51) 99123-4567', estadoCivil: 'Casado(a)', email: 'cliente@exemplo.com',
  dataConsulta: '2024-03-10',
  revisoes: [{ tipo: 'rmc', descricaoLivre: 'REV RMC DAYCOVAL - R$ 66,00' }],
};

describe('formatarFichaJudicial', () => {
  it('1. ficha completa', () => {
    const t = formatarFichaJudicial(completa);
    expect(t).toContain('FICHA JUDICIAL');
    expect(t).toContain('GERENTE: Matheus Teste');
    expect(t).toContain('CIDADE: Porto Alegre / RS');
    expect(t).toContain('ESPÉCIE: 41 - Aposentadoria por idade');
    expect(t).toContain('RECEBE O BENEFICIO: 121 Agibank');
    expect(t).toContain('VALOR BENEFICIO: R$');
    expect(t).toContain('IDADE: 20/08/1955 - 68 anos');
    expect(t).toContain('DATA: 10/03/2024');
    expect(t).toContain('REV RMC DAYCOVAL - R$ 66,00');
  });
  it('2. campos vazios mantêm labels sem lixo', () => {
    const t = formatarFichaJudicial({});
    expect(t).toContain('GERENTE: ');
    expect(t).toContain('CIDADE: ');
    expect(t).not.toContain('undefined');
    expect(t).not.toContain('null');
    expect(t).not.toContain('NaN');
    expect(t).not.toContain('R$ 0,00');
  });
  it('3a. cidade sem UF não recebe barra', () => {
    expect(formatarFichaJudicial({ cidade: 'Pelotas' })).toContain('CIDADE: Pelotas\n');
  });
  it('3b. cidade com UF', () => {
    expect(formatarFichaJudicial({ cidade: 'Pelotas', uf: 'RS' })).toContain('CIDADE: Pelotas / RS');
  });
  it('4. espécie incompleta sem hífen sobrando', () => {
    expect(formatarFichaJudicial({ especieCodigo: '41' })).toContain('ESPÉCIE: 41\n');
    expect(formatarFichaJudicial({ especieDescricao: 'Aposentadoria' })).toContain('ESPÉCIE: Aposentadoria');
  });
  it('5. banco incompleto sem espaço/hífen sobrando', () => {
    expect(formatarFichaJudicial({ bancoNome: 'Agibank' })).toContain('RECEBE O BENEFICIO: Agibank');
    expect(formatarFichaJudicial({ bancoCodigo: '121' })).toContain('RECEBE O BENEFICIO: 121\n');
  });
  it('6. valor ausente não imprime R$ 0,00', () => {
    const t = formatarFichaJudicial({ valorBeneficio: 0 });
    expect(t).toContain('VALOR BENEFICIO: \n');
    expect(t).not.toContain('R$');
  });
  it('7. revisões múltiplas, uma por linha', () => {
    const t = formatarFichaJudicial({ revisoes: [{ tipo: 'rmc', bancoCodigo: '318', bancoNome: 'Banco BMG' }, { tipo: 'rcc', bancoCodigo: '935', bancoNome: 'Facta Financeira', valor: 66 }] });
    expect(t).toContain('REV RMC 318 - Banco BMG');
    expect(t).toContain('REV RCC 935 - Facta Financeira - R$');
  });
  it('8. ficha sem senha por padrão', () => {
    const t = formatarFichaJudicial(completa);
    expect(t).not.toContain('Senha INSS:');
  });
  it('9. cópia temporária com senha quando ativada', () => {
    const t = formatarFichaJudicial(completa, { incluirSenha: true, senha: 'segredo-temp' });
    expect(t).toContain('Senha INSS: segredo-temp');
  });
  it('10. senha não aparece se toggle ativo mas senha vazia', () => {
    const t = formatarFichaJudicial(completa, { incluirSenha: true, senha: '' });
    expect(t).not.toContain('Senha INSS:');
  });
  it('11. idade sem nascimento', () => {
    expect(formatarFichaJudicial({ idade: 70 })).toContain('IDADE: 70 anos');
  });
  it('12. nascimento sem idade', () => {
    expect(formatarFichaJudicial({ nascimento: '1950-01-02' })).toContain('IDADE: 02/01/1950\n');
  });
  it('13. nunca imprime undefined/null/NaN', () => {
    const t = formatarFichaJudicial({ valorBeneficio: NaN, idade: NaN, nome: undefined });
    expect(t).not.toContain('undefined');
    expect(t).not.toContain('NaN');
    expect(t).not.toContain('R$');
  });
  it('14. revisão manual sem descrição livre é construída', () => {
    expect(formatarFichaJudicial({ revisoes: [{ tipo: 'agibank' }] })).toContain('REV AGIBANK');
  });
  it('15. dados opcionais ausentes não quebram', () => {
    expect(() => formatarFichaJudicial({ nome: 'X' })).not.toThrow();
  });
  it('16. texto pronto para WhatsApp (sem markdown)', () => {
    const t = formatarFichaJudicial(completa);
    expect(t).not.toMatch(/[*_`#]/);
  });
});
