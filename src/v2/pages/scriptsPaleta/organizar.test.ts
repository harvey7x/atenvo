import { describe, expect, it } from 'vitest';
import type { Script, ScriptCategoria } from '@/data/scripts';
import { resumirEtapas, type ResumoEtapas } from '../../hooks/scriptsResumo';
import { casar, filtroVizinho, indexar, montarPaleta, type FiltroPaleta } from './organizar';
import { termosDaBusca } from './texto';

const mk = (id: string, titulo: string, extra: Partial<Script> = {}): Script => ({
  id, titulo, descricao: null, conteudo: '', categoriaId: null, canais: ['whatsapp'], favorito: false,
  ativo: true, tags: [], autorId: null, criadoEm: '', atualizadoEm: '', ...extra,
});

const CATS: ScriptCategoria[] = [
  { id: 'c2', nome: 'Contratos', ordem: 2 },
  { id: 'c1', nome: 'NECESSIDADES', ordem: 1 },
  { id: 'c3', nome: 'Vazia', ordem: 3 },
];
const SCRIPTS: Script[] = [
  mk('s1', 'Boas-vindas', { favorito: true, categoriaId: 'c1', conteudo: 'Olá {{nome_cliente}}' }),
  mk('s2', 'PEDIR CPF', { favorito: true, conteudo: 'Me envia seu CPF' }),
  mk('s3', 'GERAR CÓDIGO DE ACESSO GOV', { categoriaId: 'c1', tags: ['gov'] }),
  mk('s4', 'ASSINANDO PELO CELULAR', { categoriaId: 'c1', descricao: 'Como assinar pelo celular' }),
  mk('s5', 'CONTRATOS CREFISA', { categoriaId: 'c2', tags: ['contratos'] }),
  mk('s6', 'Agendar ligação', { conteudo: 'Qual o melhor horário?' }),
  mk('s7', 'Categoria apagada', { categoriaId: 'cat-que-sumiu', conteudo: 'x' }),
  mk('s8', 'PEGAR DOCS MEUS INSS', { categoriaId: 'c1', conteudo: 'Passo a passo' }),
];
const RESUMO: Record<string, ResumoEtapas> = {
  s3: resumirEtapas([{ tipo: 'texto', conteudo: 'Como gerar o código' }, { tipo: 'video', storagePath: 'p/v.mp4' }]),
  s8: resumirEtapas([
    { tipo: 'texto', conteudo: 'Passo a passo para o {{nome_cliente}}' },
    { tipo: 'imagem', storagePath: null, conteudo: 'legenda de imagem SEM arquivo (não vai)' },
    { tipo: 'video', storagePath: 'p/x.mp4' },
    { tipo: 'texto', conteudo: 'Entre no gov.br com seu CPF' },
  ]),
};
const indice = indexar(SCRIPTS, CATS, RESUMO);
const paleta = (filtro: FiltroPaleta = 'todos', q = '', recentes: string[] = []) =>
  montarPaleta({ indice, categorias: CATS, recentes, filtro, termos: termosDaBusca(q) });
const ids = (xs: { it: { s: Script } }[]) => xs.map((c) => c.it.s.id);

describe('agrupamento e ordenação do "Todos"', () => {
  it('Favoritos → Recentes (sem favoritos) → categorias na ordem do arsenal → Outros; cada script UMA vez', () => {
    const p = paleta('todos', '', ['s6', 's3', 's1']);
    expect(p.grupos.map((g) => g.rotulo)).toEqual(['Favoritos', 'Recentes', 'Necessidades', 'Contratos', 'Outros']);
    expect(ids(p.grupos[0].itens)).toEqual(['s1', 's2']);
    expect(ids(p.grupos[1].itens)).toEqual(['s6', 's3']);           // do mais recente; o favorito s1 não repete
    expect(ids(p.grupos[2].itens)).toEqual(['s4', 's8']);           // s1 (favorito) e s3 (recente) já mostrados
    expect(ids(p.grupos[3].itens)).toEqual(['s5']);
    expect(ids(p.grupos[4].itens)).toEqual(['s7']);                 // s6 recente, s2 favorito; categoria inexistente → Outros
    // categoria cujo único script já subiu para um atalho não vira grupo
    expect(paleta('todos', '', ['s5']).grupos.map((g) => g.rotulo)).toEqual(['Favoritos', 'Recentes', 'Necessidades', 'Outros']);
    // nenhum script repete e a chave da OPÇÃO é única (aria-activedescendant)
    const todos = ids(p.flat);
    expect(new Set(todos).size).toBe(todos.length);
    expect(todos.length).toBe(SCRIPTS.length);
    const chaves = p.flat.map((o) => o.chave);
    expect(new Set(chaves).size).toBe(chaves.length);
    expect(p.flat.find((o) => o.chave === 'rec|s3')?.it.s.id).toBe('s3');
  });
  it('cabeçalho do grupo = itens EXIBIDOS; a pílula Recentes segue com todos os recentes', () => {
    const p = paleta('todos', '', ['s5', 's3', 's2']);
    const rec = p.grupos.find((g) => g.tipo === 'rec')!;
    expect(ids(rec.itens)).toEqual(['s5', 's3']);                    // s2 é favorito: só no grupo Favoritos
    expect(p.pilulas.find((x) => x.filtro === 'recentes')!.n).toBe(3); // a pílula conta os 3
    expect(paleta('recentes', '', ['s5', 's3', 's2']).flat.map((o) => o.it.s.id)).toEqual(['s5', 's3', 's2']);
    // categoria: o grupo mostra só o que sobrou; a pílula conta a categoria inteira
    const nec = p.grupos.find((g) => g.chave === 'cat:c1')!;
    expect(ids(nec.itens)).toEqual(['s4', 's8']);
    expect(p.pilulas.find((x) => x.filtro === 'cat:c1')!.n).toBe(4);
    // todos os recentes são favoritos: o grupo Recentes some do "Todos"
    expect(paleta('todos', '', ['s1', 's2']).grupos.map((g) => g.tipo)).not.toContain('rec');
    // com busca (sem atalhos) o cabeçalho de categoria volta a bater com a pílula
    for (const q of ['gov', 'c']) {
      const pb = paleta('todos', q, ['s5', 's3', 's2']);
      for (const g of pb.grupos) expect(g.itens.length, `${q}:${g.rotulo}`).toBe(pb.pilulas.find((x) => x.filtro === g.chave)!.n);
    }
  });
  it('com busca: sem atalhos nem repetição; o grupo do melhor resultado vem primeiro', () => {
    const p = paleta('todos', 'cpf', ['s2']);
    expect(p.grupos.map((g) => g.tipo)).not.toContain('fav');
    expect(p.grupos.map((g) => g.tipo)).not.toContain('rec');
    const todos = ids(p.flat);
    expect(new Set(todos).size).toBe(todos.length);
    // "cpf": s2 casa no título (Outros), s8 só no texto (Necessidades) → Outros sobe
    expect(p.grupos.map((g) => g.rotulo)).toEqual(['Outros', 'Necessidades']);
    expect(p.flat[0].it.s.id).toBe('s2');
  });
  it('categoria sem script não vira grupo nem pílula', () => {
    const p = paleta();
    expect(p.grupos.some((g) => g.rotulo === 'Vazia')).toBe(false);
    expect(p.pilulas.some((x) => x.rotulo === 'Vazia')).toBe(false);
  });
  it('títulos em caixa alta são exibidos como frase e ordenados por eles', () => {
    const p = paleta('cat:c1');
    expect(p.grupos[0].itens.map((c) => c.it.titulo)).toEqual(['Assinando pelo celular', 'Boas-vindas', 'Gerar código de acesso GOV', 'Pegar docs meus INSS']);
  });
});

describe('pílulas e contagens', () => {
  it('sem busca: totais por filtro, na ordem Todos · Favoritos · Recentes · categorias · Outros', () => {
    const p = paleta('todos', '', ['s5', 'nao-existe']);
    expect(p.pilulas.map((x) => [x.rotulo, x.n])).toEqual([
      ['Todos', 8], ['Favoritos', 2], ['Recentes', 1], ['Necessidades', 4], ['Contratos', 1], ['Outros', 3],
    ]);
    expect(p.total).toBe(8);
    expect(p.totalGeral).toBe(8);
    expect(paleta('cat:c2', '').totalGeral).toBe(8);
  });
  it('com busca: cada pílula conta só o que casa; total do filtro preservado', () => {
    const p = paleta('todos', 'gov');
    expect(p.pilulas.find((x) => x.filtro === 'todos')).toMatchObject({ n: 2, total: 8 });
    expect(p.pilulas.find((x) => x.filtro === 'cat:c1')).toMatchObject({ n: 2, total: 4 });
    expect(p.pilulas.find((x) => x.filtro === 'favoritos')).toMatchObject({ n: 0, total: 2 });
    expect(p.n).toBe(2);
  });
  it('filtro de categoria que sumiu cai em Todos', () => {
    expect(paleta('cat:fantasma').filtro).toBe('todos');
  });
  it('← → andam entre pílulas sem dar a volta', () => {
    const p = paleta();
    expect(filtroVizinho(p.pilulas, 'todos', -1)).toBe('todos');
    expect(filtroVizinho(p.pilulas, 'todos', 1)).toBe('favoritos');
    expect(filtroVizinho(p.pilulas, 'outros', 1)).toBe('outros');
  });
});

describe('busca: título, descrição, tags e TEXTO das mensagens', () => {
  it('título casa antes de texto de mensagem (rank) dentro do grupo', () => {
    const p = paleta('cat:c1', 'gov');
    expect(ids(p.flat)).toEqual(['s3', 's8']);
    expect(p.flat[0]).toMatchObject({ rank: 0, onde: 'titulo' });
    expect(p.flat[1]).toMatchObject({ rank: 2, onde: 'texto' });
  });
  it('casou no texto: guarda o índice e o nº da mensagem NO COMPOSITOR (pula mídia sem arquivo)', () => {
    const c = casar(indice.find((i) => i.s.id === 's8')!, termosDaBusca('gov'))!;
    expect(c.onde).toBe('texto');
    expect(indice.find((i) => i.s.id === 's8')!.nums[c.textoIdx!]).toBe(3);
  });
  it('mídia sem arquivo não entra na busca (o compositor não envia)', () => {
    expect(paleta('todos', 'legenda').n).toBe(0);
  });
  it('descrição e tag também casam, sem acento', () => {
    expect(casar(indice.find((i) => i.s.id === 's4')!, termosDaBusca('assinar'))).toMatchObject({ onde: 'descricao', rank: 1 });
    expect(casar(indice.find((i) => i.s.id === 's5')!, termosDaBusca('contratos crefisa'))).toMatchObject({ onde: 'titulo' });
    expect(casar(indice.find((i) => i.s.id === 's3')!, termosDaBusca('codigo'))).toMatchObject({ onde: 'titulo' });
  });
  it('sem acento e sem caixa nos dois sentidos: "credito" acha "CRÉDITO" no título e "crédito" na mensagem', () => {
    const ix = indexar([
      mk('a', 'CARTÃO DE CRÉDITO'),
      mk('b', 'Outro', { conteudo: 'Seu crédito foi liberado' }),
      mk('c', 'Tag', { tags: ['Crédito'] }),
    ], [], {});
    const p = montarPaleta({ indice: ix, categorias: [], recentes: [], filtro: 'todos', termos: termosDaBusca('credito') });
    expect(ids(p.flat).sort()).toEqual(['a', 'b', 'c']);
    expect(montarPaleta({ indice: ix, categorias: [], recentes: [], filtro: 'todos', termos: termosDaBusca('CRÉDITO') }).n).toBe(3);
    expect(casar(ix[2], termosDaBusca('credito'))).toMatchObject({ onde: 'tag', tag: 'Crédito' });
  });
  it('vários termos = TODOS precisam aparecer (em qualquer campo)', () => {
    expect(ids(paleta('todos', 'pegar gov').flat)).toEqual(['s8']);
    expect(paleta('todos', 'pegar crefisa').n).toBe(0);
  });
  it('nome de variável não é texto pesquisável', () => {
    expect(paleta('todos', 'nome_cliente').n).toBe(0);
  });
  it('composição da lista segue o compositor (enviáveis) e cai no conteudo sem etapas', () => {
    const s8 = indice.find((i) => i.s.id === 's8')!;
    expect([s8.total, s8.tipos]).toEqual([3, ['texto', 'video']]);
    const s6 = indice.find((i) => i.s.id === 's6')!;
    expect([s6.total, s6.tipos]).toEqual([1, ['texto']]);
    const s4 = indice.find((i) => i.s.id === 's4')!; // sem etapas e sem conteudo
    expect([s4.total, s4.tipos]).toEqual([0, []]);
  });
  it('Recentes filtrado mantém a ordem de uso', () => {
    expect(ids(paleta('recentes', '', ['s8', 's2', 's3']).flat)).toEqual(['s8', 's2', 's3']);
  });
});
