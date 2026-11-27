// @vitest-environment node
/* Motor da Análise INSS (porte ESM do "ALFA Análise").
   1) Comportamento: textos SINTÉTICOS (sem PII — nomes/CPF/NB claramente
      fictícios) montados a partir dos regexes do motor, cobrindo as três
      estratégias de leitura, 2 benefícios, trocas, bancos de risco,
      cooperativa com praça, margem 40–45% e >45%, rubricas de consignado,
      associativa e cartão, competência sem pagamento, duplicata entre PDFs.
   2) Paridade: com ALFA_MOTOR_ORIGINAL apontando para o motor.js original do
      site (e, opcional, ALFA_UNIFICAR_ORIGINAL para o unificar.js), compara
      deep-equal original × porte em lerDeTexto + analisar + montarPlanilha.
      Ex.: ALFA_MOTOR_ORIGINAL=/caminho/motor.js npx vitest run src/v2/data/analise */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import * as XLSX from 'xlsx';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import AlfaMotor from './motor';
import AlfaUnificar from './unificar';
import type { AlfaMotorApi, Dossie, Leitura } from './motor';
import type { AlfaUnificarApi } from './unificar';
import { comDestroy } from './libs';

/* ------------------------------------------------------------- textos */
type Rub = [codigo: string, descricao: string, valor: string];
interface CompOficial {
  comp: string; // MM/AAAA
  valor: string; // líquido '1.700,00'
  meio: string; // 'CCF - CONTA CORRENTE'
  datas: string[]; // previsão / crédito (0, 1 ou 2)
  status?: string;
  banco: string; // '104 - CAIXA ECONOMICA FEDERAL OP: 1234 - CENTRO'
  rubricas: Rub[];
}

function linhaOficial(c: CompOficial): string[] {
  const [mm, aaaa] = c.comp.split('/');
  const cab = [`${c.comp}`, `01/${mm}/${aaaa}`, `R$ ${c.valor}`, c.meio, ...c.datas];
  if (c.status) cab.push(c.status);
  return [
    cab.join('  '),
    'a',
    `28/${mm}/${aaaa}`,
    `Banco: ${c.banco}`,
    ...c.rubricas.map(([cod, desc, v]) => `${cod}  ${desc}  R$ ${v}`),
  ];
}

const MR2000: Rub = ['101', 'VALOR TOTAL DE MR DO PERIODO', '2.000,00'];
const EMP300: Rub = ['216', 'CONSIGNACAO EMPRESTIMO BANCARIO', '300,00'];
const BMG_RUBS: Rub[] = [
  MR2000,
  EMP300,
  ['216', 'CONSIGNACAO EMPRESTIMO BANCARIO 2', '400,00'],
  ['217', 'EMPRESTIMO SOBRE A RMC', '100,00'],
  ['268', 'CONSIGNACAO CARTAO DE CREDITO', '100,00'],
  ['273', 'CARTAO BENEFICIO RCC', '100,00'],
  ['247', 'CONTRIB SINAB', '50,00'],
];
const BMG = '318 - BANCO BMG S.A. OP: 5678 - LOJA FICTICIA CENTRO';

/** Formato oficial, 2 benefícios (esp. 41 e 21). */
const TEXTO_OFICIAL = [
  'INSS - INSTITUTO NACIONAL DO SEGURO SOCIAL',
  'Histórico de Créditos',
  '15/10/2026 10:00:00',
  'Identificação do Filiado',
  'Nome: MARIA EXEMPLO DA SILVA',
  'CPF: 000.000.000-00',
  'NIT: 000.00000.00-0',
  'Créditos do Benefício',
  'NB: 000.000.001-0',
  'Espécie: 41 - APOSENTADORIA POR IDADE',
  'Data de Início do Benefício (DIB): 01/01/2015',
  'APS: 00000000 - APS FICTICIA DE TESTE',
  'Competência  Período  Meio de Pagamento  Valor',
  ...linhaOficial({ comp: '01/2023', valor: '1.700,00', meio: 'CCF - CONTA CORRENTE',
    datas: ['02/02/2023', '02/02/2023'], status: 'Pago',
    banco: '104 - CAIXA ECONOMICA FEDERAL OP: 1234 - AGENCIA CENTRO', rubricas: [MR2000, EMP300] }),
  ...linhaOficial({ comp: '02/2023', valor: '1.700,00', meio: 'CCF - CONTA CORRENTE',
    datas: ['02/03/2023', '02/03/2023'], status: 'Pago',
    banco: '104 - CAIXA ECONOMICA FEDERAL OP: 1234 - AGENCIA CENTRO', rubricas: [MR2000, EMP300] }),
  'Página 1 de 2',
  ...linhaOficial({ comp: '03/2023', valor: '950,00', meio: 'CMG - CARTAO MAGNETICO',
    datas: ['03/04/2023', '03/04/2023'], status: 'Pago', banco: BMG, rubricas: BMG_RUBS }),
  ...linhaOficial({ comp: '04/2023', valor: '950,00', meio: 'CMG - CARTAO MAGNETICO',
    datas: ['03/05/2023'], status: 'Devolvido',
    banco: `${BMG} Ocorrência: CREDITO DEVOLVIDO AO INSS`, rubricas: BMG_RUBS }),
  ...linhaOficial({ comp: '05/2023', valor: '950,00', meio: 'CMG - CARTAO MAGNETICO',
    datas: ['05/06/2023'], banco: BMG, rubricas: BMG_RUBS }),
  ...linhaOficial({ comp: '07/2023', valor: '1.500,00', meio: 'CCF - CONTA CORRENTE',
    datas: ['03/08/2023', '03/08/2023'], status: 'Pago',
    banco: '748 - SICREDI COOPERATIVA OP: 0101 - CORRESPONDENTE AGIBANK',
    rubricas: [MR2000, ['216', 'CONSIGNACAO EMPRESTIMO BANCARIO', '-300,00']] }),
  'Consulte o "Extrato de Empréstimo Consignado" para detalhes',
  'Créditos do Benefício',
  'NB: 000.000.002-0',
  'Espécie: 21 - PENSAO POR MORTE PREVIDENCIARIA',
  'Data de Início do Benefício (DIB): 10/06/2018',
  'APS: 00000001 - APS FICTICIA DOIS',
  ...['01', '02'].flatMap((mm) => linhaOficial({ comp: `${mm}/2023`, valor: '580,00',
    meio: 'CCF - CONTA CORRENTE', datas: [`02/${mm}/2023`, `02/${mm}/2023`], status: 'Pago',
    banco: '001 - BANCO DO BRASIL',
    rubricas: [['101', 'VALOR TOTAL DE MR DO PERIODO', '1.000,00'],
      ['216', 'CONSIGNACAO EMPRESTIMO BANCARIO', '420,00']] })),
  ...linhaOficial({ comp: '03/2023', valor: '580,00', meio: 'CCF - CONTA CORRENTE',
    datas: ['02/04/2023', '02/04/2023'], status: 'Pago', banco: '237 - BRADESCO',
    rubricas: [['101', 'VALOR TOTAL DE MR DO PERIODO', '1.000,00'],
      ['216', 'CONSIGNACAO EMPRESTIMO BANCARIO', '420,00']] }),
  'O INSS poderá rever o pagamento a qualquer tempo',
  'Página 2 de 2',
].join('\n');

/** Estratégia 2 — blocos rotulados ("Competência: 01/2022"). */
const TEXTO_BLOCOS = [
  'Histórico de Créditos',
  'Nome: JOSE FICTICIO DE TESTE',
  'CPF: 000.000.000-00',
  'Benefício: 00.000.000-3',
  'Espécie: 42 - APOSENTADORIA POR TEMPO DE CONTRIBUICAO',
  'Competência: 01/2022',
  'Valor Líquido: R$ 1.100,00',
  'Meio de Pagamento: CCF - CONTA CORRENTE',
  'Data do Pagamento: 05/02/2022',
  'Status: Pago',
  'Banco Pagador: 237 - BRADESCO Agência: 0001 - CENTRO',
  '101 - VALOR TOTAL DE MR DO PERIODO R$ 1.500,00',
  '216 - CONSIGNACAO EMPRESTIMO R$ 400,00',
  'Competência: 02/2022',
  'Valor Líquido: R$ 1.050,00',
  'Meio de Pagamento: CPP - CONTA POUPANCA',
  'Data do Pagamento: 05/03/2022',
  'Status: Pago',
  'Ocorrência: NAO RECEBIDO PELO TITULAR',
  'Banco Pagador: 121 AGIBANK AG: 0002 - SHOPPING',
  '101 - VALOR TOTAL DE MR DO PERIODO R$ 1.500,00',
  '216 - CONSIGNACAO EMPRESTIMO R$ 400,00',
  '256 - CONTRIBUICAO AAPB R$ 50,00',
].join('\n');

/** Estratégia 3 — uma linha por competência. */
const TEXTO_LINHAS = [
  'EXTRATO SIMPLIFICADO FICTICIO',
  'Titular: ANA FICTICIA EXEMPLO',
  '03/2021 pago em 05/04/2021 banco 104 - CAIXA ECONOMICA 1.234,56',
  '04/2021 pago em 05/05/2021 banco 389 - MERCANTIL DO BRASIL 1.234,56',
  '06/2021 pago em 05/07/2021 banco 389 - MERCANTIL DO BRASIL 1.234,56',
].join('\n');

/** Duas leituras com a MESMA competência em bancos diferentes (reemissão). */
const TEXTO_DUP_A = [
  'Nome: MARIA EXEMPLO DA SILVA',
  'NB: 000.000.001-0',
  'Espécie: 41 - APOSENTADORIA POR IDADE',
  ...linhaOficial({ comp: '12/2022', valor: '1.700,00', meio: 'CCF - CONTA CORRENTE',
    datas: ['02/01/2023', '02/01/2023'], status: 'Pago',
    banco: '104 - CAIXA ECONOMICA FEDERAL OP: 1234 - AGENCIA CENTRO', rubricas: [MR2000, EMP300] }),
  ...linhaOficial({ comp: '01/2023', valor: '1.700,00', meio: 'CCF - CONTA CORRENTE',
    datas: ['02/02/2023', '02/02/2023'], status: 'Pago',
    banco: '104 - CAIXA ECONOMICA FEDERAL OP: 1234 - AGENCIA CENTRO', rubricas: [MR2000] }),
].join('\n');
const TEXTO_DUP_B = [
  'NB: 000.000.001-0',
  'Espécie: 41 - APOSENTADORIA POR IDADE',
  ...linhaOficial({ comp: '01/2023', valor: '950,00', meio: 'CCF - CONTA CORRENTE',
    datas: ['02/02/2023', '02/02/2023'], status: 'Pago', banco: BMG, rubricas: BMG_RUBS }),
].join('\n');

/** Seis contratos no mesmo mês — pico de consignados. */
const TEXTO_CONTRATOS = [
  'NB: 000.000.009-0',
  'Espécie: 41 - APOSENTADORIA POR IDADE',
  ...linhaOficial({ comp: '08/2024', valor: '1.400,00', meio: 'CCF - CONTA CORRENTE',
    datas: ['02/09/2024', '02/09/2024'], status: 'Pago', banco: '001 - BANCO DO BRASIL',
    rubricas: [MR2000, ...[1, 2, 3, 4, 5, 6].map((n): Rub => ['216', `EMPRESTIMO CONTRATO ${n}`, '100,00'])] }),
].join('\n');

const CENARIOS: Array<[nome: string, textos: Array<[texto: string, arquivo: string]>]> = [
  ['oficial com 2 benefícios', [[TEXTO_OFICIAL, 'extrato-ficticio.pdf']]],
  ['por blocos', [[TEXTO_BLOCOS, 'blocos.pdf']]],
  ['por linhas', [[TEXTO_LINHAS, 'linhas.pdf']]],
  ['duplicata entre PDFs', [[TEXTO_DUP_A, 'a.pdf'], [TEXTO_DUP_B, 'b.pdf']]],
  ['pico de contratos', [[TEXTO_CONTRATOS, 'contratos.pdf']]],
  ['PDF sem texto', [['', 'escaneado.pdf']]],
  ['todos juntos', [[TEXTO_OFICIAL, 'x.pdf'], [TEXTO_BLOCOS, 'y.pdf'], [TEXTO_LINHAS, 'z.pdf'],
    [TEXTO_DUP_A, 'a.pdf'], [TEXTO_DUP_B, 'b.pdf']]],
];

function rodar(M: AlfaMotorApi, textos: Array<[string, string]>): { leituras: Leitura[]; dossies: Dossie[] } {
  const leituras = textos.map(([t, a]) => M.lerDeTexto(t, a));
  const copia = structuredClone(leituras); // analisar muta os registros
  return { leituras: copia, dossies: M.analisar(leituras) };
}

const porTitulo = (d: Dossie, trecho: string) => d.alertas.find((a) => a.titulo.includes(trecho));

afterEach(() => {
  vi.useRealTimers();
});

/* ------------------------------------------------------- comportamento */
describe('motor — formato oficial com 2 benefícios', () => {
  const { leituras, dossies } = rodar(AlfaMotor, [[TEXTO_OFICIAL, 'extrato-ficticio.pdf']]);
  const leitura = leituras[0];
  const [pensao, apos] = dossies;

  it('lê cabeçalho, estratégia e competências', () => {
    expect(leitura.formato).toBe('formato_oficial');
    expect(leitura.cabecalho).toEqual({
      nome: 'MARIA EXEMPLO DA SILVA', cpf: '000.000.000-00', nit: '000.00000.00-0',
      beneficio: '000.000.001-0', especie: '41 - APOSENTADORIA POR IDADE',
      dib: '01/01/2015', aps: '00000000 - APS FICTICIA DE TESTE',
    });
    expect(leitura.competencias).toHaveLength(9);
    expect(leitura.paginas_texto_vazio).toBe(false);
  });

  it('separa um dossiê por benefício, ordenado por espécie', () => {
    expect(dossies).toHaveLength(2);
    expect(pensao.chave_beneficio).toEqual(['21', '000.000.002-0']);
    expect(apos.chave_beneficio).toEqual(['41', '000.000.001-0']);
    expect(apos.cabecalho.nome).toBe('MARIA EXEMPLO DA SILVA');
    expect(apos.cabecalho.dib).toBe('01/01/2015');
    expect(pensao.cabecalho.aps).toBe('00000001 - APS FICTICIA DOIS');
    expect(dossies.map((d) => [d.indice, d.total_beneficios])).toEqual([[0, 2], [1, 2]]);
  });

  it('lê pagamento, meio, status, ocorrência e rubricas', () => {
    const [jan, , mar, abr, mai, jul] = apos.linha_do_tempo;
    expect(jan).toMatchObject({
      competencia: '01/2023', rotulo: 'jan/2023', periodo_inicio: '01/01/2023',
      previsao_pagamento: '02/02/2023', data_pagamento: '02/02/2023', status: 'Pago',
      valor_liquido: 170000, valor_mr: 200000, banco_codigo: '104', op_codigo: '1234',
      op_nome: 'AGENCIA CENTRO', meio_pagamento_sigla: 'CCF', meio_pagamento: 'Conta corrente',
      total_consignado: 30000, total_descontos: 30000, margem_pct: 150, confere: true,
      formato: 'formato_oficial', arquivo: 'extrato-ficticio.pdf',
    });
    expect(mar.rubricas.map((r) => [r.codigo, r.categoria])).toEqual([
      ['101', 'credito'], ['216', 'consignado'], ['216', 'consignado'], ['217', 'consignado'],
      ['268', 'consignado'], ['273', 'consignado'], ['247', 'associativa'],
    ]);
    expect(mar).toMatchObject({ total_consignado: 100000, total_associativo: 5000,
      total_descontos: 105000, margem_pct: 500, contratos_consignado: 5, confere: true,
      meio_pagamento: 'Cartão magnético' });
    expect(abr).toMatchObject({ status: 'Devolvido', data_pagamento: '',
      previsao_pagamento: '03/05/2023', ocorrencia: 'CREDITO DEVOLVIDO AO INSS' });
    expect(mai).toMatchObject({ status: 'Aguardando pagamento', data_pagamento: '' });
    expect(jul).toMatchObject({ banco_codigo: '748', valor_liquido: 150000, confere: false });
    expect(jul.rubricas[1].valor).toBe(-30000);
  });

  it('detecta e classifica as trocas de banco', () => {
    expect(apos.trocas).toHaveLength(2);
    const [paraBmg, paraSicredi] = apos.trocas;
    expect(paraBmg).toMatchObject({ ordem: 1, nivel: 'alerta', icone: '🔴', meses_entre: 1,
      mudou_meio_pagamento: true, mudou_praca: true, cooperativa: false, banco_citado_na_praca: '' });
    expect(paraBmg.de).toMatchObject({ codigo: '104', competencia: '02/2023' });
    expect(paraBmg.para).toMatchObject({ codigo: '318', competencia: '03/2023' });
    expect(paraBmg.risco_destino).toMatchObject({ risco: true, nivel: 'alto', rotulo: 'Banco BMG' });
    expect(paraBmg.novas_rubricas.map((r) => r.codigo)).toEqual(['216', '217', '268', '273', '247']);
    expect(paraBmg.motivos.some((m) => m.includes('cartão magnético'))).toBe(true);
    expect(paraSicredi).toMatchObject({ nivel: 'alerta', meses_entre: 2, cooperativa: true,
      banco_citado_na_praca: 'Banco Agibank' });
    expect(paraSicredi.risco_destino).toMatchObject({ risco: true, nivel: 'medio', rotulo: 'Sicredi' });
    expect(paraSicredi.motivos.some((m) => m.includes('1 competência(s) sem registro'))).toBe(true);
  });

  it('resume bancos, margem e alertas', () => {
    expect(apos.bancos.map((b) => [b.codigo, b.inicio, b.fim, b.competencias, b.risco.nivel])).toEqual([
      ['104', '01/2023', '02/2023', 2, null],
      ['318', '03/2023', '05/2023', 3, 'alto'],
      ['748', '07/2023', '07/2023', 1, 'medio'],
    ]);
    expect(apos.resumo).toMatchObject({
      competencias: 6, periodo_inicio: '01/2023', periodo_fim: '07/2023',
      periodo_inicio_rotulo: 'jan/2023', periodo_fim_rotulo: 'jul/2023',
      margem_maxima: 500, margem_media: 325, competencias_acima_teto: 3, contratos_max: 5,
      bancos_distintos: 3, periodos_bancarios: 3, trocas: 2, trocas_alerta: 2,
      total_bruto: 1200000, total_liquido: 775000, total_consignado: 390000, total_associativo: 15000,
    });
    const titulos = apos.alertas.map((a) => `${a.nivel}|${a.titulo}`);
    expect(titulos).toEqual([
      'alerta|Possível troca indevida em mar/2023',
      'alerta|Possível troca indevida em jul/2023',
      'alerta|Margem consignável estourada em 3 competência(s)',
      'alerta|Conta do SICREDI COOPERATIVA aberta em loja do Banco Agibank',
      'atencao|Até 5 contratos de consignado descontados no mesmo mês',
      'atencao|Descontos de associação/sindicato no benefício',
      'atencao|Competências com crédito não confirmado',
      'normal|Competências que não fecham na conta',
      'normal|Meses faltando na sequência',
    ]);
    expect(porTitulo(apos, 'faltando')?.detalhe).toContain('06/2023');
    expect(porTitulo(apos, 'estourada')?.detalhe).toContain('máximo observado: 50,0%');
    expect(apos.resumo.alertas).toBe(9);
    expect(apos.resumo.alertas_criticos).toBe(4);
  });

  it('margem entre 40% e 45% vira atenção; troca sem sinal é normal', () => {
    expect(pensao.linha_do_tempo.map((r) => r.margem_pct)).toEqual([420, 420, 420]);
    expect(pensao.trocas).toHaveLength(1);
    expect(pensao.trocas[0]).toMatchObject({ nivel: 'normal', icone: '⚪', motivos: [] });
    expect(pensao.alertas.map((a) => a.titulo)).toEqual(['Margem consignável no limite em 3 competência(s)']);
    expect(pensao.resumo).toMatchObject({ trocas_normais: 1, margem_maxima: 420, competencias_acima_teto: 0 });
  });
});

describe('motor — outras estratégias e casos', () => {
  it('lê blocos rotulados', () => {
    const { leituras, dossies } = rodar(AlfaMotor, [[TEXTO_BLOCOS, 'blocos.pdf']]);
    expect(leituras[0].formato).toBe('por_blocos');
    expect(leituras[0].cabecalho.beneficio).toBe('00.000.000-3');
    const [d] = dossies;
    expect(d.linha_do_tempo.map((r) => [r.competencia, r.banco_codigo, r.banco_nome, r.valor_liquido,
      r.valor_mr, r.status, r.meio_pagamento])).toEqual([
      ['01/2022', '237', 'BRADESCO', 110000, 150000, 'Pago', 'Conta corrente'],
      ['02/2022', '121', 'Banco Agibank', 105000, 150000, 'Pago', 'Conta poupança'],
    ]);
    expect(d.linha_do_tempo[0]).toMatchObject({ op_codigo: '0001', op_nome: 'CENTRO' });
    expect(d.trocas[0]).toMatchObject({ nivel: 'alerta', mudou_meio_pagamento: true });
    expect(d.alertas.map((a) => a.titulo)).toContain('Competências com crédito não confirmado');
    expect(d.cabecalho).toMatchObject({ nome: 'JOSE FICTICIO DE TESTE', especie_codigo: '42' });
  });

  it('lê uma linha por competência', () => {
    const { leituras, dossies } = rodar(AlfaMotor, [[TEXTO_LINHAS, 'linhas.pdf']]);
    expect(leituras[0].formato).toBe('por_linhas');
    expect(leituras[0].cabecalho.nome).toBe('ANA FICTICIA EXEMPLO');
    const [d] = dossies;
    expect(d.linha_do_tempo.map((r) => [r.competencia, r.banco_codigo, r.valor_liquido])).toEqual([
      ['03/2021', '104', 123456], ['04/2021', '389', 123456], ['06/2021', '389', 123456],
    ]);
    expect(d.trocas[0]).toMatchObject({ nivel: 'alerta' });
    expect(d.resumo.margem_maxima).toBeNull();
    expect(porTitulo(d, 'faltando')?.detalhe).toContain('05/2021');
  });

  it('competência repetida entre PDFs: fica a mais completa e marca conflito', () => {
    const { dossies } = rodar(AlfaMotor, [[TEXTO_DUP_A, 'a.pdf'], [TEXTO_DUP_B, 'b.pdf']]);
    const [d] = dossies;
    expect(d.linha_do_tempo).toHaveLength(2);
    expect(d.linha_do_tempo[1]).toMatchObject({ banco_codigo: '318', duplicada: true, conflito: true, arquivo: 'b.pdf' });
    expect(d.arquivos).toEqual([
      { arquivo: 'a.pdf', metodo_extracao: 'pdf.js', competencias_lidas: 2, sem_texto: false },
      { arquivo: 'b.pdf', metodo_extracao: 'pdf.js', competencias_lidas: 1, sem_texto: false },
    ]);
    expect(d.alertas.map((a) => a.titulo)).toContain('Mesma competência com bancos diferentes em PDFs distintos');
  });

  it('pico de contratos e PDF sem texto', () => {
    const [d] = rodar(AlfaMotor, [[TEXTO_CONTRATOS, 'c.pdf']]).dossies;
    expect(d.resumo.contratos_max).toBe(6);
    expect(porTitulo(d, 'contratos de consignado')?.titulo).toBe('Até 6 contratos de consignado descontados no mesmo mês');
    const vazio = rodar(AlfaMotor, [['', 'escaneado.pdf']]);
    expect(vazio.leituras[0]).toMatchObject({ paginas_texto_vazio: true, competencias: [], formato: '' });
    expect(vazio.dossies).toEqual([]);
  });

  it('formatação, nomes de arquivo e competências por página', () => {
    expect(AlfaMotor.moeda(123456789)).toBe('R$ 1.234.567,89');
    expect(AlfaMotor.moeda(-5)).toBe('-R$ 0,05');
    expect(AlfaMotor.moeda(null)).toBe('—');
    expect(AlfaMotor.formatarPct(435)).toBe('43,5%');
    expect(AlfaMotor.percentual(null)).toBe('—');
    expect(AlfaMotor.pctPlanilha(435)).toBe('43.5%');
    expect(AlfaMotor.carimbo(new Date(2026, 9, 5, 8, 7))).toBe('05/10/2026 às 08:07');
    expect(AlfaMotor.rotuloRubrica('217')).toBe('Empréstimo sobre a RMC (cartão consignado)');
    expect(AlfaMotor.rotuloRubrica('999')).toBe('');
    const [, apos] = rodar(AlfaMotor, [[TEXTO_OFICIAL, 'x.pdf']]).dossies;
    expect(AlfaMotor.nomeArquivoBase(apos, '20261015-100000'))
      .toBe('analise-inss_MARIA-EXEMPLO-DA-SILVA_esp41_NB0000000010_20261015-100000');
    expect(AlfaMotor.competenciasDaPagina('01/2023 x\n  13/2023 y\n02/2023\n01/2023')).toEqual(['01/2023', '02/2023']);
    expect(AlfaMotor.competenciasDaPagina(null)).toEqual([]);
    expect(AlfaMotor.MARGEM_TETO_DECIMOS).toBe(450);
    expect(AlfaMotor.ICONES).toEqual({ alerta: '🔴', atencao: '🟡', normal: '⚪' });
  });

  it('monta a planilha com as 5 abas', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 15, 10, 0, 0));
    const [, apos] = rodar(AlfaMotor, [[TEXTO_OFICIAL, 'x.pdf']]).dossies;
    const livro = AlfaMotor.montarPlanilha(XLSX, apos);
    expect(livro.SheetNames).toEqual(['Resumo', 'Linha do Tempo', 'Trocas de Banco', 'Descontos', 'Alertas']);
    const resumo = XLSX.utils.sheet_to_json<unknown[]>(livro.Sheets.Resumo, { header: 1 });
    expect(resumo[1]).toEqual(['Gerado em 15/10/2026 às 10:00']);
    expect(resumo.find((l) => l[0] === 'Margem consignável máxima')).toEqual(['Margem consignável máxima', '50.0%']);
    const linha = XLSX.utils.sheet_to_json<unknown[]>(livro.Sheets['Linha do Tempo'], { header: 1 });
    expect(linha).toHaveLength(7);
    expect(linha[3][16]).toBe('SIM - ALERTA');
  });
});

/* ------------------------------------------------------------ unificar */
async function pdfFicticio(paginas: string[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setCreationDate(new Date(Date.UTC(2026, 0, 1)));
  doc.setModificationDate(new Date(Date.UTC(2026, 0, 1)));
  const fonte = await doc.embedFont(StandardFonts.Helvetica);
  for (const linhas of paginas) {
    const p = doc.addPage([400, 400]);
    linhas.split('\n').forEach((t, i) => p.drawText(t, { x: 30, y: 360 - i * 14, size: 9, font: fonte }));
  }
  return doc.save();
}

describe('unificar', () => {
  it('ordena por competência e, no empate, por nome', () => {
    const itens = [
      { nome: 'c.pdf', chave: null, extra: 1 },
      { nome: 'b.pdf', chave: 202301 },
      { nome: 'a.pdf', chave: 202301 },
      { nome: 'd.pdf', chave: 202210 },
    ];
    expect(AlfaUnificar.ordenarArquivos(itens).map((i) => i.nome)).toEqual(['d.pdf', 'a.pdf', 'b.pdf', 'c.pdf']);
    expect(itens[0].nome).toBe('c.pdf'); // não muta a entrada
    expect(AlfaUnificar.nomeArquivoUnificado('MARIA EXEMPLO DA SILVA', '20261015-100000'))
      .toBe('historico-creditos-unificado_MARIA-EXEMPLO-DA-SILVA_20261015-100000.pdf');
    expect(AlfaUnificar.nomeArquivoUnificado(null, 'x')).toBe('historico-creditos-unificado_extrato_x.pdf');
  });

  it('junta os PDFs pulando páginas marcadas e reporta falhas', async () => {
    const PDFLib = await import('pdf-lib');
    const a = await pdfFicticio(['10/2022', '11/2022', '12/2022']);
    const b = await pdfFicticio(['01/2023', '02/2023']);
    const quebrado = new TextEncoder().encode('isto não é um PDF');
    const r = await AlfaUnificar.unificarPdfs(PDFLib, [
      { nome: 'a.pdf', dados: a }, { nome: 'quebrado.pdf', dados: quebrado }, { nome: 'b.pdf', dados: b },
    ], new Set(['0:1', '2:0']));
    expect(r.paginas).toBe(3);
    expect(r.falhas).toEqual(['quebrado.pdf']);
    const final = await PDFLib.PDFDocument.load(r.bytes);
    expect(final.getPageCount()).toBe(3);
  });
});

/* ---------------------------------------------- leitura real via pdf.js */
describe('pdf.js de verdade (pdfjs-dist 6, build legacy para node)', () => {
  it('reconstrói as linhas e lê o PDF fictício', async () => {
    const pdfjs = comDestroy(await import('pdfjs-dist/legacy/build/pdf.mjs'));
    const linhas = [
      'Nome: MARIA EXEMPLO DA SILVA',
      'Créditos do Benefício',
      'NB: 000.000.001-0',
      'Espécie: 41 - APOSENTADORIA POR IDADE',
      '01/2023 01/01/2023 R$ 1.700,00 CCF - CONTA CORRENTE 02/02/2023 02/02/2023 Pago',
      'Banco: 104 - CAIXA ECONOMICA FEDERAL OP: 1234 - AGENCIA CENTRO',
      '101 VALOR TOTAL DE MR DO PERIODO R$ 2.000,00',
      '216 CONSIGNACAO EMPRESTIMO BANCARIO R$ 300,00',
    ];
    const pagina2 = [
      '02/2023 01/02/2023 R$ 950,00 CCF - CONTA CORRENTE 02/03/2023 02/03/2023 Pago',
      'Banco: 318 - BANCO BMG S.A. OP: 5678 - LOJA FICTICIA',
      ...BMG_RUBS.map(([c, d, v]) => `${c} ${d} R$ ${v}`),
    ];
    const bytes = await pdfFicticio([linhas.join('\n'), pagina2.join('\n')]);
    // pdf.js avisa no console que falta standardFontDataUrl (fonte padrão, sem efeito no texto)
    const silencio = [vi.spyOn(console, 'log'), vi.spyOn(console, 'warn')]
      .map((s) => s.mockImplementation(() => undefined));
    try {
      const porPagina = await AlfaMotor.extrairTextoPorPagina(pdfjs, bytes.slice());
      expect(porPagina.map((p) => AlfaMotor.competenciasDaPagina(p))).toEqual([['01/2023'], ['02/2023']]);
      const leitura = await AlfaMotor.lerPdf(pdfjs, bytes.slice(), 'ficticio.pdf');
      expect(leitura.formato).toBe('formato_oficial');
      expect(leitura.competencias.map((c) => [c.competencia, c.banco_codigo, c.valor_liquido, c.confere]))
        .toEqual([['01/2023', '104', 170000, true], ['02/2023', '318', 95000, true]]);
      const [d] = AlfaMotor.analisar([leitura]);
      expect(d.trocas).toHaveLength(1);
      expect(d.resumo.competencias_acima_teto).toBe(1);
      // pdfjs-dist 6 tirou destroy() do documento; comDestroy devolve (libera o worker)
      const doc = await pdfjs.getDocument({ data: bytes.slice() }).promise;
      expect(doc.numPages).toBe(2);
      await expect(doc.destroy()).resolves.toBeUndefined();
    } finally {
      silencio.forEach((s) => s.mockRestore());
    }
  });
});

/* ------------------------------------------------ paridade com o original */
const ORIGINAL_MOTOR = process.env.ALFA_MOTOR_ORIGINAL ?? '';
const ORIGINAL_UNIFICAR = process.env.ALFA_UNIFICAR_ORIGINAL ?? '';
const requerer = createRequire(import.meta.url);

describe.runIf(ORIGINAL_MOTOR !== '' && existsSync(ORIGINAL_MOTOR))('paridade: motor original × porte', () => {
  // o vitest executa o corpo do describe mesmo quando pulado — carregar só no beforeAll
  let original: AlfaMotorApi;
  beforeAll(() => {
    original = requerer(ORIGINAL_MOTOR) as AlfaMotorApi;
  });

  it('expõe exatamente as mesmas chaves e constantes', () => {
    expect(Object.keys(AlfaMotor)).toEqual(Object.keys(original));
    for (const k of Object.keys(original) as Array<keyof AlfaMotorApi>) {
      if (typeof original[k] !== 'function') expect(AlfaMotor[k]).toStrictEqual(original[k]);
    }
  });

  it.each(CENARIOS)('%s: lerDeTexto + analisar + montarPlanilha idênticos', (_nome, textos) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 15, 10, 0, 0));
    const o = rodar(original, textos);
    const p = rodar(AlfaMotor, textos);
    expect(p.leituras).toStrictEqual(o.leituras);
    expect(p.dossies).toStrictEqual(o.dossies);
    for (let i = 0; i < o.dossies.length; i++) {
      expect(AlfaMotor.montarPlanilha(XLSX, p.dossies[i])).toStrictEqual(original.montarPlanilha(XLSX, o.dossies[i]));
      expect(AlfaMotor.nomeArquivoBase(p.dossies[i])).toBe(original.nomeArquivoBase(o.dossies[i]));
    }
    for (const [texto] of textos) {
      expect(AlfaMotor.extrairCabecalho(texto)).toStrictEqual(original.extrairCabecalho(texto));
      expect(AlfaMotor.extrairCompetencias(texto, 'f.pdf')).toStrictEqual(original.extrairCompetencias(texto, 'f.pdf'));
      for (const pagina of texto.split('Página')) {
        expect(AlfaMotor.competenciasDaPagina(pagina)).toEqual(original.competenciasDaPagina(pagina));
      }
    }
  });

  it('formatação idêntica numa varredura de valores', () => {
    const valores = [null, undefined, 0, 1, -1, 5, 99, 100, 101, 450, 455, -455, 123456789, -98765];
    for (const v of valores) {
      expect(AlfaMotor.moeda(v)).toBe(original.moeda(v));
      expect(AlfaMotor.formatarPct(v)).toBe(original.formatarPct(v));
      expect(AlfaMotor.pctPlanilha(v)).toBe(original.pctPlanilha(v));
    }
    for (const c of ['101', '216', '247', '921', '000', '']) {
      expect(AlfaMotor.rotuloRubrica(c)).toBe(original.rotuloRubrica(c));
    }
    const d = new Date(2026, 0, 2, 3, 4);
    expect(AlfaMotor.carimbo(d)).toBe(original.carimbo(d));
  });
});

describe.runIf(ORIGINAL_UNIFICAR !== '' && existsSync(ORIGINAL_UNIFICAR))('paridade: unificar original × porte', () => {
  let original: AlfaUnificarApi;
  beforeAll(() => {
    original = requerer(ORIGINAL_UNIFICAR) as AlfaUnificarApi;
  });

  it('ordenação, nome e PDF final idênticos', async () => {
    const itens = [{ nome: 'z', chave: 202301 }, { nome: 'a', chave: undefined }, { nome: 'b', chave: 202212 },
      { nome: 'a', chave: 202301 }];
    expect(AlfaUnificar.ordenarArquivos(itens)).toStrictEqual(original.ordenarArquivos(itens));
    expect(AlfaUnificar.nomeArquivoUnificado('José da Silva!', 't')).toBe(original.nomeArquivoUnificado('José da Silva!', 't'));
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 15, 10, 0, 0));
    const PDFLib = await import('pdf-lib');
    const arquivos = [
      { nome: 'a.pdf', dados: await pdfFicticio(['p1', 'p2']) },
      { nome: 'x.pdf', dados: new Uint8Array([1, 2, 3]) },
      { nome: 'b.pdf', dados: await pdfFicticio(['q1']) },
    ];
    const removidas = new Set(['0:0']);
    const rp = await AlfaUnificar.unificarPdfs(PDFLib, arquivos, removidas);
    const ro = await original.unificarPdfs(PDFLib, arquivos, removidas);
    expect(rp.paginas).toBe(ro.paginas);
    expect(rp.falhas).toEqual(ro.falhas);
    expect(Buffer.from(rp.bytes).equals(Buffer.from(ro.bytes))).toBe(true);
  });
});
