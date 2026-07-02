import { describe, it, expect } from 'vitest';
import { parseFichaJudicial, PARSER_VERSION } from './fichaJudicialParser';

// ===== Fixtures 100% FICTÍCIOS (CPFs matematicamente válidos só para teste) =====
const CPF_A = '529.982.247-25'; // válido
const CPF_B = '111.444.777-35'; // válido
const CPF_BANCOIDE = '104.444.777-05'; // válido; grupo "104" parece código COMPE (Caixa)
const CPF_INVALIDO = '123.456.789-00';
const CPF_REPETIDO = '111.111.111-11';

const L = (linhas: string[]) => linhas.join('\n');

const FULL = L([
  'Resumo',
  'Nome: Joao Pedro da Silva Teste',
  'CPF / Benefício',
  `${CPF_A}\t1234567890`,
  'Data de nascimento: 20/08/1955',
  'Idade: 68 anos',
  'Endereço: Rua das Acacias, 123',
  'Porto Alegre - RS',
  'Telefones',
  '(51) 99123-4567',
  'Espécie: 41 - Aposentadoria por idade',
  'Recebe o benefício: 121 - AGIBANK',
  'Margem disponível: R$ 211,80',
  'Valor Benefício: R$ 1.412,00',
  'Data da consulta: 10/03/2024',
  'E-mail: cliente.teste@exemplo.com',
]);

const especie = (rotulo: string) => L(['Nome: Fulano Teste', `CPF: ${CPF_B}`, rotulo]);

describe('ficha judicial parser', () => {
  it('1. input vazio', () => {
    const r = parseFichaJudicial('');
    expect(r.avisos.some((a) => a.codigo === 'TEXTO_VAZIO')).toBe(true);
    expect(r.parserVersion).toBe(PARSER_VERSION);
  });
  it('2. input malformado não lança', () => {
    expect(() => parseFichaJudicial('@@@\t\t\n\n%%%   ')).not.toThrow();
  });
  it('3. normaliza CRLF', () => {
    const r = parseFichaJudicial('Nome: Ana Teste\r\nCPF: ' + CPF_B + '\r\n');
    expect(r.textoSanitizado.includes('\r')).toBe(false);
    expect(r.nome).toBe('Ana Teste');
  });
  it('4. preserva TAB', () => {
    const r = parseFichaJudicial(L(['CPF / Benefício', `${CPF_A}\t1234567890`]));
    expect(r.textoSanitizado.includes('\t')).toBe(true);
  });
  it('5. remove caracteres invisíveis', () => {
    const r = parseFichaJudicial('Nome: Ze​ca Teste​');
    expect(r.textoSanitizado.includes('​')).toBe(false);
  });
  it('6. redige Senha INSS', () => {
    const r = parseFichaJudicial('Senha INSS: segredoX9\nNome: Ana');
    expect(r.textoSanitizado).toContain('[REMOVIDA]');
    expect(r.textoSanitizado).not.toContain('segredoX9');
  });
  it('7. redige Senha Meu INSS (sem dois-pontos)', () => {
    const r = parseFichaJudicial('Senha Meu INSS segredoY8');
    expect(r.textoSanitizado).not.toContain('segredoY8');
    expect(r.textoSanitizado).toContain('[REMOVIDA]');
  });
  it('8. redige Senha gov.br', () => {
    const r = parseFichaJudicial('Senha gov.br: segredoZ7');
    expect(r.textoSanitizado).not.toContain('segredoZ7');
  });
  it('9. CPF formatado válido', () => {
    const r = parseFichaJudicial(`CPF: ${CPF_A}`);
    expect(r.cpf).toBe(CPF_A);
  });
  it('10. CPF sem máscara válido', () => {
    const r = parseFichaJudicial('CPF: 52998224725');
    expect(r.cpf).toBe(CPF_A);
  });
  it('11. CPF inválido gera aviso', () => {
    const r = parseFichaJudicial(`CPF: ${CPF_INVALIDO}`);
    expect(r.cpf).toBeUndefined();
    expect(r.avisos.some((a) => a.codigo === 'CPF_INVALIDO')).toBe(true);
  });
  it('12. CPF repetido rejeitado', () => {
    const r = parseFichaJudicial(`CPF: ${CPF_REPETIDO}`);
    expect(r.cpf).toBeUndefined();
  });
  it('13. benefício no bloco CPF/Benefício', () => {
    const r = parseFichaJudicial(L(['CPF / Benefício', `${CPF_A}\t9988776655`]));
    expect(r.beneficioNumero).toBe('9988776655');
  });
  it('14. benefício em tabela (rótulo)', () => {
    const r = parseFichaJudicial(L([`CPF: ${CPF_A}`, 'Benefício: 7654321000']));
    expect(r.beneficioNumero).toBe('7654321000');
  });
  it('15. nome após rótulo (linha seguinte)', () => {
    const r = parseFichaJudicial(L(['Nome', 'Maria Aparecida Teste', `CPF: ${CPF_B}`]));
    expect(r.nome).toBe('Maria Aparecida Teste');
  });
  it('16. nome inline', () => {
    const r = parseFichaJudicial('Nome: Carlos Eduardo Teste');
    expect(r.nome).toBe('Carlos Eduardo Teste');
  });
  it('17. nascimento com idade calculada', () => {
    const r = parseFichaJudicial(L(['Data de nascimento: 20/08/1955', 'Data da consulta: 10/03/2024']));
    expect(r.nascimento).toBe('1955-08-20');
    expect(r.idadeCalculada).toBe(68);
  });
  it('18. idade divergente gera aviso', () => {
    const r = parseFichaJudicial(L(['Data de nascimento: 15/05/1960', 'Idade: 40 anos', 'Data da consulta: 10/03/2024']));
    expect(r.idadeInformada).toBe(40);
    expect(r.idadeCalculada).toBe(63);
    expect(r.avisos.some((a) => a.codigo === 'IDADE_DIVERGENTE')).toBe(true);
  });
  it('19. cidade com - RS', () => {
    const r = parseFichaJudicial(L(['Endereço: Rua X, 1', 'Pelotas - RS']));
    expect(r.cidade).toBe('Pelotas');
    expect(r.uf).toBe('RS');
  });
  it('20. cidade com / RS', () => {
    const r = parseFichaJudicial('Caxias do Sul / RS');
    expect(r.cidade).toBe('Caxias do Sul');
    expect(r.uf).toBe('RS');
  });
  it('21. telefone com máscara', () => {
    const r = parseFichaJudicial('Telefones\n(51) 99123-4567');
    expect(r.telefone).toBe('51991234567');
  });
  it('22. telefone sem máscara', () => {
    const r = parseFichaJudicial('Telefones\n51991234567');
    expect(r.telefone).toBe('51991234567');
  });
  it('23. múltiplos telefones gera aviso', () => {
    const r = parseFichaJudicial('Telefones\n(51) 99123-4567\n(51) 98888-1111');
    expect(r.avisos.some((a) => a.codigo === 'TELEFONES_CONCORRENTES')).toBe(true);
    expect(r.telefone).toBe('51991234567');
  });
  it('24. espécie 21 → pensao_por_morte', () => {
    const r = parseFichaJudicial(especie('Espécie: 21 - Pensão por morte'));
    expect(r.especieCodigo).toBe('21');
    expect(r.tipoBeneficio).toBe('pensao_por_morte');
  });
  it('25. espécie 32 → aposentadoria', () => {
    const r = parseFichaJudicial(especie('Espécie: 32 - Aposentadoria por invalidez previdenciária'));
    expect(r.tipoBeneficio).toBe('aposentadoria');
  });
  it('26. espécie 41 → aposentadoria', () => {
    expect(parseFichaJudicial(especie('Espécie: 41 - Aposentadoria por idade')).tipoBeneficio).toBe('aposentadoria');
  });
  it('27. espécie 42 → aposentadoria', () => {
    expect(parseFichaJudicial(especie('Espécie: 42 - Aposentadoria por tempo de contribuição')).tipoBeneficio).toBe('aposentadoria');
  });
  it('28. espécie 87 → bpc_loas (sem palavra previdenciária)', () => {
    const r = parseFichaJudicial(especie('Espécie: 87 - Amparo Social PcD'));
    expect(r.especieCodigo).toBe('87');
    expect(r.tipoBeneficio).toBe('bpc_loas');
  });
  it('29. espécie 88 → bpc_loas', () => {
    expect(parseFichaJudicial(especie('Espécie: 88 - Amparo Social ao Idoso')).tipoBeneficio).toBe('bpc_loas');
  });
  it('30. espécie 92 → aposentadoria', () => {
    expect(parseFichaJudicial(especie('Espécie: 92 - Aposentadoria por invalidez acidentária')).tipoBeneficio).toBe('aposentadoria');
  });
  it('31. espécie em linha tabulada', () => {
    const r = parseFichaJudicial(L(['Espécie', '41\tAposentadoria por idade']));
    expect(r.especieCodigo).toBe('41');
    expect(r.tipoBeneficio).toBe('aposentadoria');
  });
  it('32. banco com código e hífen', () => {
    const r = parseFichaJudicial('Banco: 121 - AGIBANK');
    expect(r.bancoCodigo).toBe('121');
    expect(r.bancoNome).toBe('Agibank');
  });
  it('33. banco com código sem hífen', () => {
    const r = parseFichaJudicial('Recebe o benefício: 623 BANCO PAN');
    expect(r.bancoCodigo).toBe('623');
    expect(r.bancoNome).toBe('Banco Pan');
  });
  it('34. banco somente por nome', () => {
    const r = parseFichaJudicial('Banco: Bradesco');
    expect(r.bancoCodigo).toBe('237');
  });
  it('35. CPF com grupos parecidos com código bancário não vira banco', () => {
    const r = parseFichaJudicial(`CPF: ${CPF_BANCOIDE}`);
    expect(r.cpf).toBe(CPF_BANCOIDE);
    expect(r.bancoCodigo).toBeUndefined();
    expect(r.avisos.some((a) => a.codigo === 'BANCO_NAO_ENCONTRADO')).toBe(true);
  });
  it('36. banco 121', () => {
    expect(parseFichaJudicial('Banco: 121 - Agibank').bancoNome).toBe('Agibank');
  });
  it('37. banco 756', () => {
    const r = parseFichaJudicial('Banco: 756 - SICOOB');
    expect(r.bancoCodigo).toBe('756');
    expect(r.bancoNome).toBe('Sicoob');
  });
  it('38. banco desconhecido contextual não é identificado', () => {
    const r = parseFichaJudicial('Banco: 999 - Banco Ficticio XYZ');
    expect(r.bancoCodigo).toBeUndefined();
    expect(r.avisos.some((a) => a.codigo === 'BANCO_NAO_ENCONTRADO')).toBe(true);
  });
  it('39. valor do benefício', () => {
    expect(parseFichaJudicial('Valor Benefício: R$ 1.412,00').valorBeneficio).toBe(1412);
  });
  it('40. valor próximo da margem não confunde', () => {
    const r = parseFichaJudicial(L(['Margem disponível: R$ 211,80', 'Valor Benefício: R$ 1.412,00']));
    expect(r.valorBeneficio).toBe(1412);
  });
  it('41. valor próximo da base de cálculo não confunde', () => {
    const r = parseFichaJudicial(L(['Base de cálculo: R$ 999,99', 'Valor Benefício: R$ 2.000,50']));
    expect(r.valorBeneficio).toBe(2000.5);
  });
  it('42. DDB não vira data da consulta', () => {
    const r = parseFichaJudicial('DDB: 01/02/2010');
    expect(r.dataConsulta).toBeUndefined();
    expect(r.avisos.some((a) => a.codigo === 'DATA_CONSULTA_NAO_ENCONTRADA')).toBe(true);
  });
  it('43. data explícita da consulta', () => {
    expect(parseFichaJudicial('Data da consulta: 10/03/2024').dataConsulta).toBe('2024-03-10');
  });
  it('44. REV AGIBANK explícita', () => {
    const r = parseFichaJudicial('REV AGIBANK');
    expect(r.revisoes.length).toBe(1);
    expect(r.revisoes[0].tipo).toBe('agibank');
    expect(r.revisoes[0].bancoNome).toBe('Agibank');
    expect(r.revisoes[0].requerConfirmacao).toBe(false);
  });
  it('45. RMC com banco', () => {
    const r = parseFichaJudicial('REV RMC - 318 - BANCO BMG S A');
    expect(r.revisoes[0].tipo).toBe('rmc');
    expect(r.revisoes[0].bancoCodigo).toBe('318');
    expect(r.revisoes[0].valor).toBeUndefined();
  });
  it('46. RCC com banco', () => {
    const r = parseFichaJudicial('REV RCC - 935 - FACTA FINANCEIRA S/A');
    expect(r.revisoes[0].tipo).toBe('rcc');
    expect(r.revisoes[0].bancoCodigo).toBe('935');
  });
  it('47. revisão com valor', () => {
    const r = parseFichaJudicial('REV RMC DAYCOVAL - R$ 66,00');
    expect(r.revisoes[0].tipo).toBe('rmc');
    expect(r.revisoes[0].valor).toBe(66);
    expect(r.revisoes[0].bancoCodigo).toBe('707');
  });
  it('48. banco pagador sem revisão não cria revisão', () => {
    const r = parseFichaJudicial('Recebe o benefício: 121 - AGIBANK');
    expect(r.revisoes.length).toBe(0);
  });
  it('49. múltiplas revisões', () => {
    const r = parseFichaJudicial(L(['REV RMC - 318 - BANCO BMG S A', 'REV RCC - 935 - FACTA FINANCEIRA S/A']));
    expect(r.revisoes.length).toBe(2);
  });
  it('50. deduplicação de revisões', () => {
    const r = parseFichaJudicial(L(['REV AGIBANK', 'REV AGIBANK']));
    expect(r.revisoes.length).toBe(1);
  });
  it('51. texto com lixo de interface', () => {
    const r = parseFichaJudicial(L(['Enviar', 'Confirmar telefone', 'Simulador', `CPF: ${CPF_A}`]));
    expect(r.cpf).toBe(CPF_A);
    expect(r.nome).toBeUndefined();
  });
  it('52. acentos corrompidos não quebram', () => {
    expect(() => parseFichaJudicial('Nome: Jo�o\nEsp�cie: 41 - Aposentadoria')).not.toThrow();
  });
  it('53. campos ausentes geram avisos', () => {
    const r = parseFichaJudicial('texto qualquer sem dados');
    expect(r.avisos.some((a) => a.codigo === 'CPF_NAO_ENCONTRADO')).toBe(true);
  });
  it('54. confiança por campo', () => {
    const r = parseFichaJudicial(FULL);
    expect(r.confiancaPorCampo.cpf).toBe('alta');
    expect(r.confiancaPorCampo.valorBeneficio).toBe('alta');
  });
  it('55. códigos de aviso estáveis', () => {
    const r = parseFichaJudicial('nada util aqui');
    for (const a of r.avisos) expect(a.codigo).toMatch(/^[A-Z_]+$/);
  });
  it('56. parser nunca retorna senha', () => {
    const r = parseFichaJudicial('Senha INSS: ultrasecreto42\n' + FULL);
    expect(JSON.stringify(r)).not.toContain('ultrasecreto42');
    expect(Object.keys(r)).not.toContain('senha');
  });
  it('57. não lança para entrada arbitrária', () => {
    expect(() => parseFichaJudicial(' \t\t\n'.repeat(50))).not.toThrow();
  });

  it('FULL: extração combinada coerente', () => {
    const r = parseFichaJudicial(FULL);
    expect(r.nome).toBe('Joao Pedro da Silva Teste');
    expect(r.cpf).toBe(CPF_A);
    expect(r.beneficioNumero).toBe('1234567890');
    expect(r.nascimento).toBe('1955-08-20');
    expect(r.cidade).toBe('Porto Alegre');
    expect(r.uf).toBe('RS');
    expect(r.telefone).toBe('51991234567');
    expect(r.especieCodigo).toBe('41');
    expect(r.tipoBeneficio).toBe('aposentadoria');
    expect(r.bancoCodigo).toBe('121');
    expect(r.bancoNome).toBe('Agibank');
    expect(r.valorBeneficio).toBe(1412);
    expect(r.dataConsulta).toBe('2024-03-10');
    expect(r.email).toBe('cliente.teste@exemplo.com');
  });
});

describe('propriedades defensivas', () => {
  const amostras = ['', '   ', 'abc', '\t\n\t', '12345678901', '@@@###', 'Senha INSS: x', 'R$ 1,00', FULL, '0'.repeat(500)];
  it('nunca lança e retorna estrutura completa', () => {
    for (const s of amostras) {
      const r = parseFichaJudicial(s);
      expect(Array.isArray(r.revisoes)).toBe(true);
      expect(Array.isArray(r.avisos)).toBe(true);
      expect(typeof r.confiancaPorCampo).toBe('object');
      expect(typeof r.origemPorCampo).toBe('object');
      expect(r.parserVersion).toBe(PARSER_VERSION);
    }
  });
  it('nenhum número vira NaN', () => {
    for (const s of amostras) {
      const r = parseFichaJudicial(s);
      for (const v of [r.valorBeneficio, r.idadeInformada, r.idadeCalculada]) {
        if (v !== undefined) expect(Number.isNaN(v)).toBe(false);
      }
    }
  });
  it('textoSanitizado nunca contém senha com valor', () => {
    const r = parseFichaJudicial('Senha INSS: top-secret-77\nSenha gov.br: outra-99');
    expect(/senha[^\n]*:\s*(?!\[REMOVIDA\])\S/i.test(r.textoSanitizado)).toBe(false);
  });
  it('strings devolvidas não contêm "undefined"/"null" textual', () => {
    const r = parseFichaJudicial(FULL);
    for (const v of [r.nome, r.cidade, r.bancoNome, r.especieDescricao]) {
      if (typeof v === 'string') { expect(v).not.toContain('undefined'); expect(v).not.toContain('null'); }
    }
  });
});

describe('revisões RMC/RCC: código e banco da consulta (não-COMPE)', () => {
  const acha = (t: string, tipo: string) => parseFichaJudicial(t).revisoes.find((r) => r.tipo === tipo);

  it('extrai código e banco de "Cartão RMC — 934 - AGIPLAN FINANCEIRA S/A"', () => {
    const r = acha('Cartão RMC — 934 - AGIPLAN FINANCEIRA S/A', 'rmc');
    expect(r).toBeDefined();
    expect(r!.bancoCodigo).toBe('934');
    expect(r!.bancoNome).toBe('AGIPLAN FINANCEIRA S/A');
  });

  it('extrai código e banco de "Cartão RCC — 935 - FACTA FINANCEIRA S/A"', () => {
    const r = acha('Cartão RCC — 935 - FACTA FINANCEIRA S/A', 'rcc');
    expect(r).toBeDefined();
    expect(r!.bancoCodigo).toBe('935');
    expect(r!.bancoNome).toBe('FACTA FINANCEIRA S/A');
  });

  it('reconhece "Reserva de Margem Consignável" como RMC e "Reserva de Cartão Consignado" como RCC', () => {
    expect(acha('Reserva de Margem Consignável 934 - AGIPLAN FINANCEIRA S/A', 'rmc')?.bancoCodigo).toBe('934');
    expect(acha('Reserva de Cartão Consignado - 935 - FACTA FINANCEIRA S/A', 'rcc')?.bancoCodigo).toBe('935');
  });

  it('preserva zeros à esquerda e ignora o valor R$ no nome do banco', () => {
    const r = acha('Cartão RMC — 007 - BANCO EXEMPLO S/A - R$ 1.234,56', 'rmc');
    expect(r!.bancoCodigo).toBe('007');
    expect(r!.bancoNome).toBe('BANCO EXEMPLO S/A');
    expect(r!.valor).toBe(1234.56);
  });

  it('não mistura os dois tipos na mesma consulta', () => {
    const revs = parseFichaJudicial(L(['Cartão RMC — 934 - AGIPLAN FINANCEIRA S/A', 'Cartão RCC — 935 - FACTA FINANCEIRA S/A'])).revisoes;
    const rmc = revs.filter((r) => r.tipo === 'rmc');
    const rcc = revs.filter((r) => r.tipo === 'rcc');
    expect(rmc).toHaveLength(1); expect(rcc).toHaveLength(1);
    expect(rmc[0].bancoNome).toBe('AGIPLAN FINANCEIRA S/A');
    expect(rcc[0].bancoNome).toBe('FACTA FINANCEIRA S/A');
  });
});

describe('revisões RMC/RCC: layout de TABELA real (uma célula por linha, com linhas em branco)', () => {
  // Reproduz fielmente o bloco "Cartões" da consulta real (rótulo, banco e valor em linhas separadas).
  const CARTOES = L([
    ' Cartões',
    'Tipo\tBanco\tContrato\tAverbação\tSituação\tValor do Contrato\tValor da Parcela\tTaxa',
    'Cartão RMC', '', '934 - AGIPLAN FINANCEIRA S/A', '', '123456789', '', '06/06/2022', '', 'Ativo', '',
    'R$ 2.815,00', '', 'R$ 121,92', '', '2,46%', '',
    'Cartão RCC', '', '935 - FACTA FINANCEIRA S/A', '', '52705939', '', '19/09/2022', '', 'Ativo', '',
    'R$ 3.124,00', '', 'R$ 121,92', '',
  ]);

  it('preenche banco/código/valor do RMC e RCC mesmo em linhas separadas', () => {
    const revs = parseFichaJudicial(CARTOES).revisoes;
    const rmc = revs.find((r) => r.tipo === 'rmc');
    const rcc = revs.find((r) => r.tipo === 'rcc');
    expect(rmc).toBeDefined(); expect(rcc).toBeDefined();
    expect(rmc!.bancoCodigo).toBe('934'); expect(rmc!.bancoNome).toBe('AGIPLAN FINANCEIRA S/A'); expect(rmc!.valor).toBe(2815);
    expect(rcc!.bancoCodigo).toBe('935'); expect(rcc!.bancoNome).toBe('FACTA FINANCEIRA S/A'); expect(rcc!.valor).toBe(3124);
  });

  it('as revisões ficam com confiança alta (não "Confirmar") e sem duplicar', () => {
    const revs = parseFichaJudicial(CARTOES).revisoes;
    expect(revs.filter((r) => r.tipo === 'rmc')).toHaveLength(1);
    expect(revs.filter((r) => r.tipo === 'rcc')).toHaveLength(1);
    expect(revs.find((r) => r.tipo === 'rmc')!.requerConfirmacao).toBe(false);
    expect(revs.find((r) => r.tipo === 'rcc')!.requerConfirmacao).toBe(false);
  });
});
