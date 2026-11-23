import { describe, expect, it } from 'vitest';
import {
  TEXTO_SENHA_OCULTA, docsCompletos, leadDeLinha, leadsFicticios, mensagemDoCliente, ordenarLeads, soPelaSenha, textosDoLead,
  ultimaMensagem, type Lead, type LinhaFila,
} from './lead';
import { comDocs, conversaDeExemplo } from './fonte';
import { CATEGORIAS, textosDaCategoria } from './dados';

/* dono 19/11: "para quem passou a senha do INSS… esses daí são prioridades para a gente já entrar no INSS e assinar" */
const agora = Date.now();
const iso = (minAtras: number) => new Date(agora - minAtras * 60_000).toISOString();
const linha = (p: Partial<LinhaFila>): LinhaFila => ({
  contato_id: 'c', conversa_id: null, oportunidade_id: null, dono_id: null, nome: 'Ana', telefone: '5551999999999',
  categoria: 'quente', aguardando: false, coluna: null, campanha: null, entrou_em: null, ult_cliente_em: iso(30),
  ult_nossa_em: iso(40), ult_doc_em: iso(30), doc_pessoal: false, comprovante: false, falta: null, assinado_em: null,
  marcacoes: [], ult_cliente_texto: 'oi', ...p,
});
const marca = (tipo: 'docs_completos' | 'docs_incompletos', minAtras = 5) =>
  [{ id: 'm1', tipo, texto: null, vezes: 1, em: iso(minAtras) }];

describe('senha do INSS na fila (dono 19/11)', () => {
  it('só pela senha: Prioridade, a marca, o que falta e sem "A Iris passou"', () => {
    const l = leadDeLinha(linha({ senha_inss: true, senha_em: iso(10), senha_na_ficha: false, doc_pessoal: true }), 0);
    expect(l.cat).toBe('quente');
    expect(l.senha).toBe(true);
    expect(l.senhaEm).toBe(Date.parse(iso(10)));
    expect(l.senhaNaFicha).toBe(false);
    expect(l.curta).toBe('Senha do INSS');
    expect(l.situacao).toBe('Passou a senha do INSS · falta comprovante de residência');
    expect(soPelaSenha(l)).toBe(true);
    expect(l.novo).toBeUndefined();
    expect(l.passouEm).toBeUndefined();
    /* a lista segue a documentação: documento pessoal sem comprovante = "Só falta o comprovante" */
    expect(l.lista).toBe(2);
  });
  it('senha e documentação completa: continua com o "A Iris passou" (como antes)', () => {
    const l = leadDeLinha(linha({ senha_inss: true, senha_em: iso(10), senha_na_ficha: true, doc_pessoal: true, comprovante: true }), 0);
    expect(l.situacao).toBe('Passou a senha do INSS · documentação completa');
    expect(soPelaSenha(l)).toBe(false);
    expect(l.lista).toBe(1);
    expect(l.novo).toBe(true);
    expect(l.senhaNaFicha).toBe(true);
  });
  it('senha + documentação marcada à mão (o banco já manda os dois documentos como a marcação diz)', () => {
    const c = leadDeLinha(linha({ senha_inss: true, senha_em: iso(10), doc_pessoal: true, comprovante: true, marcacoes: marca('docs_completos') }), 0);
    expect(c.situacao).toBe('Passou a senha do INSS · documentação completa, marcada pelo atendente');
    expect(c.lista).toBe(1);
    expect(c.novo).toBe(true);
    const i = leadDeLinha(linha({ senha_inss: true, senha_em: iso(10), marcacoes: marca('docs_incompletos') }), 0);
    expect(i.cat).toBe('quente');
    expect(i.situacao).toBe('Passou a senha do INSS · documentação incompleta, marcada pelo atendente');
    expect(i.lista).toBe(3);
    expect(i.novo).toBeUndefined();
  });
  it('o banco antigo (sem as colunas) fica como antes', () => {
    const l = leadDeLinha(linha({ doc_pessoal: true, comprovante: true }), 0);
    expect(l.senha).toBeUndefined();
    expect(l.senhaEm).toBeUndefined();
    expect(l.curta).toBe('Documentação completa');
    expect(l.lista).toBe(1);
    const d = leadDeLinha(linha({ categoria: 'documentacao', doc_pessoal: true }), 0);
    expect(d.senha).toBeUndefined();
    expect(d.curta).toBe('Falta comprovante');
    /* a chave desligada manda a coluna sem valor: também como antes */
    const n = leadDeLinha(linha({ doc_pessoal: true, comprovante: true, senha_inss: null, senha_em: null, senha_na_ficha: null }), 0);
    expect(n.senha).toBeUndefined();
    expect(n.curta).toBe('Documentação completa');
  });
  it('a correção à mão vale mais que a leitura', () => {
    expect(docsCompletos({ docPessoal: false, comprovante: false, docsManual: 'completos' })).toBe(true);
    expect(docsCompletos({ docPessoal: true, comprovante: true, docsManual: 'incompletos' })).toBe(false);
    expect(textosDoLead({ cat: 'quente', senha: true, docsManual: 'incompletos', falta: '' })[0])
      .toBe('Passou a senha do INSS · documentação incompleta, marcada pelo atendente');
  });
  it('a ordem: quem passou a senha no topo (aguardando primeiro, depois a senha mais recente)', () => {
    const l = (id: string, p: Partial<Lead>): Lead => ({ ...leadDeLinha(linha({ doc_pessoal: true, comprovante: true }), 0), id, ...p });
    const fila = ordenarLeads([
      l('novo', { novo: true, passouEm: agora - 60_000 }),
      l('senhaVelha', { senha: true, senhaEm: agora - 5 * 3_600_000, novo: false }),
      l('esperando', { esperandoEm: agora - 60_000, novo: false }),
      l('senhaNova', { senha: true, senhaEm: agora - 60_000, novo: false }),
      l('senhaEsperando', { senha: true, senhaEm: agora - 9 * 3_600_000, esperandoEm: agora - 120_000, novo: false }),
    ]);
    expect(fila.map((x) => x.id)).toEqual(['senhaEsperando', 'senhaNova', 'senhaVelha', 'novo', 'esperando']);
  });
  it('a mensagem que parece senha aparece como aviso, sem aspas', () => {
    expect(mensagemDoCliente(TEXTO_SENHA_OCULTA)).toEqual({ texto: TEXTO_SENHA_OCULTA, midia: true });
    const u = ultimaMensagem({ ud: agora - 60_000, nu: agora - 120_000, disse: TEXTO_SENHA_OCULTA });
    expect(u).toMatchObject({ de: 'cliente', texto: TEXTO_SENHA_OCULTA, midia: true });
    const n = ultimaMensagem({ ud: agora - 120_000, nu: agora - 60_000, disse: 'oi', nossaTexto: TEXTO_SENHA_OCULTA, nossaOrigem: 'atenvo' });
    expect(n).toMatchObject({ de: 'nos', texto: TEXTO_SENHA_OCULTA, midia: true });
  });
  it('a demonstração tem quem passou a senha, no topo da Prioridade (um aguardando resposta)', () => {
    const demo = leadsFicticios();
    const comSenha = demo.filter((x) => x.senha);
    expect(comSenha.length).toBe(3);
    expect(comSenha.every((x) => x.cat === 'quente' && x.curta === 'Senha do INSS')).toBe(true);
    expect(comSenha.filter((x) => soPelaSenha(x)).length).toBe(2);
    expect(comSenha.some((x) => x.esperandoEm)).toBe(true);
    /* e um com a última mensagem escondida (a fila mostra o aviso, sem aspas) */
    expect(comSenha.some((x) => x.disse === TEXTO_SENHA_OCULTA)).toBe(true);
    const quentes = ordenarLeads(demo.filter((x) => x.cat === 'quente'));
    expect(quentes.slice(0, 3).every((x) => x.senha)).toBe(true);
  });
  it('a correção à mão na demonstração faz o que o banco faz', () => {
    const base = leadDeLinha(linha({ senha_inss: true, senha_em: iso(10), doc_pessoal: true }), 0);
    const c = comDocs(base, 'completos', agora);
    expect([c.cat, c.docPessoal, c.comprovante, c.lista, c.novo]).toEqual(['quente', true, true, 1, true]);
    const i = comDocs(c, 'incompletos', agora);
    expect([i.cat, i.docPessoal, i.comprovante, i.lista, i.novo]).toEqual(['quente', false, false, 3, undefined]);
    const a = comDocs(i, null, agora);
    expect([a.cat, a.docPessoal, a.comprovante, a.lista, a.novo, a.docsAuto]).toEqual(['quente', true, false, 2, undefined, undefined]);
    /* sem a senha, como antes: completa sobe para Prioridade */
    const d = comDocs(leadDeLinha(linha({ categoria: 'documentacao', doc_pessoal: true }), 0), 'completos', agora);
    expect([d.cat, d.lista]).toEqual(['quente', 1]);
  });
  it('a conversa de exemplo da demonstração conta a senha (e a mensagem oculta vira aviso)', () => {
    const so = leadDeLinha(linha({ senha_inss: true, senha_em: iso(10), doc_pessoal: true, ult_cliente_texto: TEXTO_SENHA_OCULTA }), 0);
    const msgs = conversaDeExemplo(so, 'demo').mensagens ?? [];
    expect(msgs.filter((m) => m.tipo === 'imagem').length).toBe(1);
    expect(msgs.some((m) => /Recebi a sua senha do gov\.br/.test(m.texto))).toBe(true);
    expect(msgs.some((m) => /Recebi tudo/.test(m.texto))).toBe(false);
    expect(msgs[msgs.length - 1]).toMatchObject({ dir: 'in', tipo: 'oculta' });
  });
  it('os textos da Prioridade mudam só com a senha ligada no banco', () => {
    const q = CATEGORIAS.find((c) => c.id === 'quente')!;
    expect(textosDaCategoria(q, false).resumo).toBe('Mandou toda a documentação. Falta você fechar.');
    expect(textosDaCategoria(q).resumo).toBe('Mandou toda a documentação. Falta você fechar.');
    expect(textosDaCategoria(q, true).resumo).toBe('Passou a senha do INSS ou mandou toda a documentação. Falta você fechar.');
    const d = CATEGORIAS.find((c) => c.id === 'documentacao')!;
    expect(textosDaCategoria(d, true)).toBe(d);
  });
});
