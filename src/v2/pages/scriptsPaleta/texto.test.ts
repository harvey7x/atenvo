import { describe, expect, it } from 'vitest';
import { acharTrechos, destacar, dobrar, exibirTextoScript, recorte, semMarcacao, termosDaBusca } from './texto';

describe('exibirTextoScript (caixa-alta → frase, só exibição)', () => {
  it('converte título todo em maiúsculas preservando siglas e nomes do ramo', () => {
    expect(exibirTextoScript('PEGAR DOCS MEUS INSS')).toBe('Pegar docs meus INSS');
    expect(exibirTextoScript('CONTRATOS CREFISA')).toBe('Contratos Crefisa');
    expect(exibirTextoScript('GERAR CÓDIGO DE ACESSO GOV')).toBe('Gerar código de acesso GOV');
    expect(exibirTextoScript('DOCS (INSS) CPF/CNPJ')).toBe('Docs (INSS) CPF/CNPJ');
  });
  it('texto já misto passa reto (o dado do dono é literal)', () => {
    expect(exibirTextoScript('Boas-vindas ao cliente')).toBe('Boas-vindas ao cliente');
    expect(exibirTextoScript('  Pedir CPF ')).toBe('Pedir CPF');
  });
});

describe('busca sem acento/maiúscula com destaque no texto original', () => {
  it('termos: dobrados, sem vazios e sem repetição', () => {
    expect(termosDaBusca('  Gov  gov  INSS ')).toEqual(['gov', 'inss']);
    expect(termosDaBusca('   ')).toEqual([]);
    expect(termosDaBusca('Código')).toEqual(['codigo']);
  });
  it('acha "codigo" em "Código" e devolve o intervalo no ORIGINAL', () => {
    expect(acharTrechos('Gerar Código de acesso', ['codigo'])).toEqual([[6, 12]]);
  });
  it('mapeia certo com acento DECOMPOSTO (NFD)', () => {
    const t = 'Código GOV';
    const [[a, b]] = acharTrechos(t, ['codigo']);
    expect(t.slice(a, b)).toBe('Código');
    expect(dobrar(t).s).toBe('codigo gov');
  });
  it('várias ocorrências e termos sobrepostos são fundidos e ordenados', () => {
    expect(acharTrechos('gov.br e GOV', ['gov'])).toEqual([[0, 3], [9, 12]]);
    expect(acharTrechos('documentos', ['doc', 'cume'])).toEqual([[0, 6]]);
  });
  it('destacar devolve pedaços marcados — e nada marcado sem termos', () => {
    expect(destacar('Aumentar nivel GOV', ['gov'])).toEqual([{ t: 'Aumentar nivel ', m: false }, { t: 'GOV', m: true }]);
    expect(destacar('Pedir CPF', [])).toEqual([{ t: 'Pedir CPF', m: false }]);
  });
  it('recorte começa numa fronteira de palavra e mostra o trecho com contexto', () => {
    const p = recorte('1. Entre no Meu INSS com o CPF e a senha do gov.br', ['gov']);
    expect(p[0]).toEqual({ t: '…', m: false });
    const txt = p.map((x) => x.t).join('');
    expect(txt).toMatch(/^… ?[A-Za-zÀ-ú]/);
    expect(txt).toContain('senha do gov.br');
    expect(p.find((x) => x.m)?.t).toBe('gov');
  });
  it('recorte não corta quando o trecho já aparece no começo da linha', () => {
    expect(recorte('Como subir a conta gov.br para prata ou ouro', ['gov'])[0]).toEqual({ t: 'Como subir a conta ', m: false });
  });
  it('recorte sem corte quando o trecho está no começo; quebras viram espaço', () => {
    const p = recorte('Gov\nbr', ['gov']);
    expect(p).toEqual([{ t: 'Gov', m: true }, { t: ' br', m: false }]);
  });
  it('semMarcacao tira os asteriscos do *negrito* do WhatsApp', () => {
    expect(semMarcacao('nível *prata* ou *ouro*')).toBe('nível prata ou ouro');
  });
});
