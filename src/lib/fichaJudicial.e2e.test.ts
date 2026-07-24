// Ponta a ponta: bloco colado do Promosys → parser → ficha judicial no padrão do escritório.
// A ficha DEVE sair exatamente igual ao modelo. Qualquer mudança de layout aqui é regressão.
import { describe, it, expect } from 'vitest';
import { parseFichaJudicial } from './fichaJudicialParser';
import { formatarFichaJudicial } from './fichaJudicialFormatter';
import { formataTelefoneBR, calculaIdade, hojeISOSaoPaulo, resolverTelefoneFicha } from './fichaJudicialNormalizers';

const DATA_FICHA = '2026-07-23'; // data fixa para o teste ser determinístico

/**
 * Monta a ficha exatamente como o modal monta (parser → resolver telefone do CONTATO → formatter).
 * O telefone da ficha vem do contato do Atenvo (contatoTelefone), NUNCA do Promosys (r.telefone).
 */
function gerar(bloco: string, contatoTelefone: string | null = null, gerente = 'Matheus', dataFicha = DATA_FICHA) {
  const r = parseFichaJudicial(bloco, { dataFicha });
  const tel = resolverTelefoneFicha(contatoTelefone, r.telefone);
  const texto = formatarFichaJudicial({
    gerenteNome: gerente,
    cidade: r.cidade, uf: r.uf, nome: r.nome,
    beneficioNumero: r.beneficioNumero, especieCodigo: r.especieCodigo, especieDescricao: r.especieDescricao,
    bancoCodigo: r.bancoCodigo, bancoNome: r.bancoNome, valorBeneficio: r.valorBeneficio ?? null,
    cpf: r.cpf, rg: '', nascimento: r.nascimento, idade: r.nascimento ? calculaIdade(r.nascimento, dataFicha) ?? null : null,
    telefone: formataTelefoneBR(tel.digitos), estadoCivil: '', email: r.email ?? '',
    dataConsulta: r.dataConsulta, revisoes: r.revisoes,
  });
  return { r, texto, tel };
}

// ---------------------------------------------------------------------------- Caso 3 — Maria Elisa
const BLOCO_MARIA = `CPF / Benefício
434.643.600-59 / 1564912601

Nome
MARIA ELISA RAUPP RIBEIRO

Nascimento
02/02/1951 · 75 Anos

Endereço
RUA VICTOR SILVA C 1 CAMAQUA
PORTO ALEGRE - RS
91910-171

TELEFONES
(51) 99941-6800

INFORMAÇÕES DO BENEFÍCIO
Benefício: 1564912601
Espécie: 41 - APOSENTADORIA POR IDADE
Banco: 756 BANCOOB
Valor Benefício: R$ 2.298,12

Integrações:
121 - BANCO AGIBANK SA
121 - BANCO AGIBANK SA
935 - FACTA FINANCEIRA S/A
33 - SANTANDER

Cartões:
Cartão RMC
41 - BANCO DO ESTADO DO RIO GRANDE DO SUL SA

Cartão RCC
935 - FACTA FINANCEIRA S/A`;

const FICHA_MARIA = `FICHA JUDICIAL

GERENTE: Matheus
CIDADE: PORTO ALEGRE / RS
NOME: MARIA ELISA RAUPP RIBEIRO
BENEFÍCIO: 1564912601
ESPÉCIE: 41 - APOSENTADORIA POR IDADE
RECEBE O BENEFICIO: 756 Sicoob
VALOR BENEFICIO: R$ 2.298,12
CPF: 434.643.600-59
RG:
IDADE: 02/02/1951 - 75 anos
TELEFONE: (51) 99941-6800
ESTADO CIVIL:
EMAIL:
INSS:
DATA: 23/07/2026

REV AGIBANK
REV RMC BANRISUL
REV RCC FACTA`;

// ---------------------------------------------------------------------------------- Caso 1 — Nelci
const BLOCO_NELCI = `CPF / Benefício
687.850.620-49 / 2089430421

Nome
NELCI GONCALVES

Nascimento
08/04/1970 · 56 Anos

Endereço
RUA SETE DE SETEMBRO 123
HUMAITA - RS
98670-000

TELEFONES
(55) 9623-5125

INFORMAÇÕES DO BENEFÍCIO
Benefício: 2089430421
Espécie: 42 - APOSENTADORIA POR TEMPO DE CONTRIBUICAO
Banco: 756 BANCOOB
Valor Benefício: R$ 1.621,00

Integrações:
121 - BANCO AGIBANK SA
121 - BANCO AGIBANK SA

Cartões:
Cartão RMC
623 - BANCO PAN S.A.

Cartão RCC
623 - BANCO PAN S.A.`;

const FICHA_NELCI = `FICHA JUDICIAL

GERENTE: Matheus
CIDADE: HUMAITA / RS
NOME: NELCI GONCALVES
BENEFÍCIO: 2089430421
ESPÉCIE: 42 - APOSENTADORIA POR TEMPO DE CONTRIBUICAO
RECEBE O BENEFICIO: 756 Sicoob
VALOR BENEFICIO: R$ 1.621,00
CPF: 687.850.620-49
RG:
IDADE: 08/04/1970 - 56 anos
TELEFONE: (55) 9623-5125
ESTADO CIVIL:
EMAIL:
INSS:
DATA: 23/07/2026

REV AGIBANK
REV RMC PAN
REV RCC PAN`;

// ------------------------------------------------------------------------------- Caso 2 — Linequer
const BLOCO_LINEQUER = `CPF / Benefício
017.182.110-66 / 1999125360

Nome
LINEQUER IFRAN DA SILVEIRA

Nascimento
05/11/1991 · 35 Anos

Endereço
RUA DAS FLORES 45
SOL NASCENTEIJUI - RS
98700-000

TELEFONES
(55) 9199-5989

INFORMAÇÕES DO BENEFÍCIO
Benefício: 1999125360
Espécie: 21 - PENSAO POR MORTE PREVIDENCIARIA
Banco: 121 BANCO AGIBANK SA
Valor Benefício: R$ 1.080,66

Integrações:
121 - BANCO AGIBANK SA

Cartões:
Cartão RMC
318 - BANCO BMG S.A.`;

const FICHA_LINEQUER = `FICHA JUDICIAL

GERENTE: Matheus
CIDADE: SOL NASCENTEIJUI / RS
NOME: LINEQUER IFRAN DA SILVEIRA
BENEFÍCIO: 1999125360
ESPÉCIE: 21 - PENSAO POR MORTE PREVIDENCIARIA
RECEBE O BENEFICIO: 121 AGIBANK
VALOR BENEFICIO: R$ 1.080,66
CPF: 017.182.110-66
RG:
IDADE: 05/11/1991 - 34 anos
TELEFONE: (55) 9199-5989
ESTADO CIVIL:
EMAIL:
INSS:
DATA: 23/07/2026

REV AGIBANK
REV RMC BMG`;

describe('Caso 3 — Maria Elisa (bloco real do Promosys)', () => {
  // contato do Atenvo com o MESMO número da consulta → ficha mantém o telefone aprovado
  const { r, texto } = gerar(BLOCO_MARIA, '5551999416800');
  it('ficha idêntica ao padrão do escritório', () => { expect(texto).toBe(FICHA_MARIA); });
  it('benefício vem do bloco colado, não de ficha anterior', () => { expect(r.beneficioNumero).toBe('1564912601'); });
  it('espécie 41 - APOSENTADORIA POR IDADE', () => { expect(r.especieCodigo).toBe('41'); expect(r.especieDescricao).toBe('APOSENTADORIA POR IDADE'); });
  it('valor é o Valor Benefício, não margem nem contrato', () => { expect(r.valorBeneficio).toBe(2298.12); });
  it('banco pagador normalizado (756 BANCOOB → 756 Sicoob)', () => { expect(r.bancoCodigo).toBe('756'); expect(r.bancoNome).toBe('Sicoob'); });
  it('parser ainda extrai o telefone do Promosys (só para alerta, não para a ficha)', () => { expect(r.telefone).toBe('51999416800'); });
  it('dois contratos Agibank geram UMA REV', () => {
    expect(r.revisoes.filter((x) => x.tipo === 'emprestimo')).toHaveLength(1);
  });
  it('contrato de Facta/Santander não vira REV de empréstimo', () => {
    expect(texto).not.toContain('REV SANTANDER');
    expect(texto).not.toContain('REV FACTA');
  });
  it('sem razão social nas REVs', () => {
    expect(texto).not.toContain('BANCO DO ESTADO DO RIO GRANDE DO SUL');
    expect(texto).not.toContain('S/A');
    expect(texto).not.toContain('Cartão RMC');
  });
  it('sem alerta de campo obrigatório', () => {
    expect(r.avisos.filter((a) => a.mensagem.startsWith('ALERTA'))).toHaveLength(0);
  });
});

describe('Caso 1 — Nelci', () => {
  const { r, texto } = gerar(BLOCO_NELCI, '555596235125');
  it('ficha idêntica ao padrão', () => { expect(texto).toBe(FICHA_NELCI); });
  it('cartões PAN viram REV RMC PAN e REV RCC PAN', () => {
    expect(r.revisoes.map((x) => `${x.tipo}:${x.bancoNome}`)).toEqual(['emprestimo:AGIBANK', 'rmc:PAN', 'rcc:PAN']);
  });
  it('PAN não é usado como banco pagador', () => { expect(r.bancoNome).toBe('Sicoob'); });
  it('telefone fixo de 10 dígitos mantém o formato', () => { expect(texto).toContain('TELEFONE: (55) 9623-5125'); });
});

describe('Caso 2 — Linequer', () => {
  const { r, texto } = gerar(BLOCO_LINEQUER, '555591995989');
  it('ficha idêntica ao padrão', () => { expect(texto).toBe(FICHA_LINEQUER); });
  it('idade recalculada ignora a idade colada (aniversário ainda não fez)', () => {
    expect(r.idadeInformada).toBe(35);   // veio errado do Promosys
    expect(r.idadeCalculada).toBe(34);   // 05/11/1991 em 23/07/2026
    expect(texto).toContain('IDADE: 05/11/1991 - 34 anos');
  });
  it('avisa a divergência de idade', () => {
    expect(r.avisos.some((a) => a.codigo === 'IDADE_DIVERGENTE')).toBe(true);
  });
  it('banco pagador Agibank (121 AGIBANK)', () => { expect(texto).toContain('RECEBE O BENEFICIO: 121 AGIBANK'); });
});

describe('anti-contaminação: bloco novo apaga o anterior', () => {
  it('reanalisar com outro bloco troca todos os campos', () => {
    const a = gerar(BLOCO_MARIA, '5551999416800');
    const b = gerar(BLOCO_NELCI, '555596235125');
    expect(b.r.beneficioNumero).not.toBe(a.r.beneficioNumero);
    expect(b.r.telefone).not.toBe(a.r.telefone);
    expect(b.texto).not.toContain('1564912601');
    expect(b.texto).not.toContain('BANRISUL');
    expect(b.texto).not.toContain('APOSENTADORIA POR IDADE');
  });
});

describe('alertas quando o bloco não traz o dado (nunca inventa)', () => {
  const { r, texto } = gerar(`Nome
JOSE DA SILVA

Endereço
PELOTAS - RS`);
  it('alerta de benefício', () => { expect(r.avisos.map((a) => a.mensagem)).toContain('ALERTA: benefício não encontrado no texto colado.'); });
  it('alerta de nascimento', () => { expect(r.avisos.map((a) => a.mensagem)).toContain('ALERTA: nascimento não encontrado; idade não calculada.'); });
  it('alerta de valor', () => { expect(r.avisos.map((a) => a.mensagem)).toContain('ALERTA: valor do benefício não encontrado.'); });
  it('alerta de telefone', () => { expect(r.avisos.map((a) => a.mensagem)).toContain('ALERTA: telefone não encontrado.'); });
  it('campos ausentes ficam em branco, sem chute', () => {
    expect(texto).toContain('BENEFÍCIO:\n');
    expect(texto).toContain('IDADE:\n');
    expect(texto).toContain('TELEFONE:\n');
    expect(texto).toContain('VALOR BENEFICIO:\n');
  });
});

describe('TELEFONE vem do contato do Atenvo, NUNCA do Promosys', () => {
  it('divergência: Promosys (51) 99941-6800 × contato 555199465655 → ficha usa o contato', () => {
    const { texto, tel } = gerar(BLOCO_MARIA, '555199465655');
    // Promosys tem (51) 99941-6800; o contato tem outro número → a ficha usa o do contato (formato do sistema).
    expect(texto).toContain('TELEFONE: (51) 9946-5655');
    expect(texto).not.toContain('(51) 99941-6800'); // número do Promosys jamais aparece
    expect(tel.digitos).toBe('5199465655');
    expect(tel.alerta).toBe('Telefone do Promosys ignorado. Usando telefone do contato Atenvo: (51) 9946-5655.');
  });
  it('contato sem telefone → ficha em branco + alerta (Promosys não é fallback)', () => {
    const { texto, tel } = gerar(BLOCO_MARIA, null);
    expect(texto).toContain('TELEFONE:\n');
    expect(texto).not.toContain('99941-6800');
    expect(tel.digitos).toBe('');
    expect(tel.alerta).toBe('ALERTA: o contato do Atenvo não tem telefone. Preencha o telefone manualmente.');
  });
  it('telefones iguais (contato = Promosys) → sem alerta', () => {
    const { tel } = gerar(BLOCO_MARIA, '5551999416800');
    expect(tel.digitos).toBe('51999416800');
    expect(tel.alerta).toBeNull();
  });
});

describe('DATA da ficha', () => {
  it('usa a data atual de America/Sao_Paulo', () => {
    // NÃO usar gerar(): passar `undefined` ali dispara o parâmetro default (dataFicha = DATA_FICHA),
    // então o teste comparava a constante fixa com a data real e só passava no dia 2026-07-23.
    // Chamando o parser direto sem a opção, exercitamos de fato o fallback para hojeISOSaoPaulo().
    const r = parseFichaJudicial(BLOCO_MARIA, {});
    expect(r.dataConsulta).toBe(hojeISOSaoPaulo());
  });
  it('23h de 23/07 em SP ainda é 23/07 (UTC já virou o dia)', () => {
    expect(hojeISOSaoPaulo(new Date('2026-07-24T02:30:00Z'))).toBe('2026-07-23');
  });
});
