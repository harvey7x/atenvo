import { describe, expect, it } from 'vitest';
import { resolverComFaltas, type VarCtx } from '@/data/scripts';
import { faltasDoTexto, linhaDeApoio, montarTrechos, rotuloVariavel, segmentarVariaveis, variaveisCruas } from './variaveis';

const CTX: VarCtx = { cliente: 'MARIA APARECIDA SOUZA', atendente: 'Henrique', emailAtendente: 'h@caf.com', empresa: 'CAF', telefone: '5551988124407' };
const SEM_TEL: VarCtx = { ...CTX, telefone: '' };

describe('variáveis da prévia = o que o compositor envia', () => {
  it('preenche com o MESMO ctx do compositor, inclusive os aliases do editor', () => {
    const r = segmentarVariaveis('Olá {{primeiro_nome_cliente}}! Aqui é {{nome_atendente}}, da {{nome_empresa}}.', CTX);
    expect(r.final).toBe('Olá MARIA! Aqui é Henrique, da CAF.');
    expect(r.faltando).toEqual([]);
    expect(r.segs.filter((s) => s.k === 'var').map((s) => s.v)).toEqual(['MARIA', 'Henrique', 'CAF']);
  });
  it('variável sem valor vira o aviso do compositor e entra em "faltando"', () => {
    const r = segmentarVariaveis('Te ligo no {{telefone}}, {{nome_cliente}}.', SEM_TEL);
    expect(r.faltando).toEqual(['Telefone']);
    expect(r.segs.find((s) => s.k === 'falta')).toMatchObject({ v: '[Telefone não informado]', nome: 'telefone' });
  });
  it('variável desconhecida segue CRUA (o compositor trava até editar)', () => {
    const r = segmentarVariaveis('Valor: {{valor_parcela}}', CTX);
    expect(r.final).toBe('Valor: {{valor_parcela}}');
    expect(variaveisCruas(r.segs)).toEqual(['valor_parcela']);
  });
  it('PARIDADE: a concatenação é idêntica ao resolverComFaltas do compositor', () => {
    const textos = [
      'Olá {{nome_cliente}}! Aqui é {{seu_nome}}, da {{empresa}}. Como posso ajudar?',
      '{{ primeiro_nome_cliente }}, ligo no {{telefone}} em {{data_atual}} — {{email_atendente}} {{x}}',
      'sem variável nenhuma',
      '{{NOME_CLIENTE}}{{cliente}}{{atendente}}',
    ];
    for (const ctx of [CTX, SEM_TEL, {}]) {
      for (const t of textos) {
        const r = segmentarVariaveis(t, ctx);
        const ref = resolverComFaltas(t, ctx);
        expect(r.final).toBe(ref.texto);
        expect([...r.faltando].sort()).toEqual([...ref.faltando].sort());
      }
    }
  });
});

describe('texto rico da bolha', () => {
  it('*negrito* perde os asteriscos (como no inbox) e mantém as marcas de variável e busca', () => {
    const { segs } = segmentarVariaveis('Conta *prata* do {{nome_cliente}} no gov.br', CTX);
    const tr = montarTrechos(segs, ['gov']);
    expect(tr.map((t) => t.t).join('')).toBe('Conta prata do MARIA APARECIDA SOUZA no gov.br');
    expect(tr.find((t) => t.b)?.t).toBe('prata');
    expect(tr.find((t) => t.v === 'var')).toMatchObject({ t: 'MARIA APARECIDA SOUZA', nome: 'nome_cliente' });
    expect(tr.find((t) => t.m)?.t).toBe('gov');
  });
  it('variável sem valor = UM chip com o nome humano; a busca marca o chip inteiro', () => {
    const tr = montarTrechos(segmentarVariaveis('Parcela: {{valor_parcela}}. Ligo no {{telefone}}.', SEM_TEL).segs, ['parcela']);
    const crua = tr.filter((t) => t.v === 'crua');
    expect(crua).toEqual([{ t: 'valor da parcela', v: 'crua', nome: 'valor_parcela', m: true }]);
    expect(tr.find((t) => t.v === 'falta')).toMatchObject({ t: 'telefone', nome: 'telefone' });
    expect(tr.map((t) => t.t).join('')).not.toContain('{{');
    expect(rotuloVariavel('codigo_acesso_gov')).toBe('codigo acesso gov');
  });
  it('links ficam marcados (sem virar âncora clicável na prévia)', () => {
    const tr = montarTrechos(segmentarVariaveis('Acesse https://meu.inss.gov.br agora', CTX).segs);
    expect(tr.find((t) => t.link)?.t).toBe('https://meu.inss.gov.br');
  });
});

describe('linha de apoio da lista', () => {
  it('nunca mostra {{token}}: sem valor vira rótulo humano, preenchida vira o valor', () => {
    const tr = linhaDeApoio('Na ligação eu confirmo   com você\no valor: {{valor_parcela}}. Ligo no {{telefone}}, {{primeiro_nome_cliente}}!', SEM_TEL);
    const txt = tr.map((t) => t.t).join('');
    expect(txt).toBe('Na ligação eu confirmo com você o valor: valor da parcela. Ligo no telefone, MARIA!');
    expect(txt).not.toContain('{{');
    expect(tr.find((t) => t.v === 'crua')).toMatchObject({ t: 'valor da parcela' });
    expect(tr.find((t) => t.v === 'falta')).toMatchObject({ t: 'telefone' });
    expect(tr.find((t) => t.v === 'var')).toMatchObject({ t: 'MARIA' });
  });
  it('com busca recorta em volta do trecho, sem partir palavra nem rótulo', () => {
    const tr = linhaDeApoio('Posso te ligar para explicar melhor e depois confirmar a parcela: {{valor_parcela}}', CTX, ['parcela']);
    const txt = tr.map((t) => t.t).join('');
    expect(txt.startsWith('…')).toBe(true);
    expect(txt).toContain('confirmar a parcela: valor da parcela');
    expect(tr.filter((t) => t.m).length).toBeGreaterThan(0);
  });
  it('faltasDoTexto junta sem valor e desconhecida em nome humano', () => {
    expect(faltasDoTexto('Ligo no {{telefone}}: {{valor_parcela}}', SEM_TEL)).toEqual(['telefone', 'valor da parcela']);
    expect(faltasDoTexto('Olá {{nome_cliente}}', CTX)).toEqual([]);
  });
});
