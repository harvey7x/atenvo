import type { EtapaTipo, Script, ScriptCategoria } from '@/data/scripts';
import type { ResumoEtapas } from '../../hooks/scriptsResumo';
import { composicaoDe } from './etapas';
import { dobrar, exibirTextoScript, semMarcacao, umaLinha } from './texto';

/* ------------------------------------------------------------------
   Organização da paleta (pura): índice de busca, casamento com
   ranking, grupos do "Todos", filtros por pílula e contagens.
   Regras:
   - "Todos" sem busca: cada script aparece UMA vez — Favoritos →
     Recentes SEM os favoritos → categorias (ordem do arsenal) → Outros,
     cada uma sem os já mostrados acima. O cabeçalho do grupo conta o que
     o grupo EXIBE; as pílulas seguem contando o filtro inteiro (a pílula
     Recentes lista todos os recentes, favoritos inclusive). A chave da
     OPÇÃO continua grupo|id (estável entre filtros e no aria).
   - "Todos" com busca: só as categorias (sem atalhos, sem repetição),
     cada uma do mais relevante para o menos (título > descrição/tag >
     texto da mensagem); o grupo com o melhor resultado vem primeiro —
     Enter usa o melhor resultado.
   - Dentro do grupo: alfabética (Recentes: do mais recente).
   - Pílulas contam o filtro inteiro (com busca: os que casam).
   ------------------------------------------------------------------ */

export type FiltroPaleta = 'todos' | 'favoritos' | 'recentes' | 'outros' | `cat:${string}`;

export interface ItemIndice {
  s: Script;
  /** título para exibir (caixa-alta → frase) */
  titulo: string;
  descricao: string | null;
  /** categoria VÁLIDA (existe na lista) ou null → "Outros" */
  catId: string | null;
  tags: string[];
  /** textos das mensagens (sem tokens de variável, uma linha) — só para busca */
  textos: string[];
  /** os mesmos textos crus (com variáveis), mesmo índice — linha de apoio da lista */
  brutos: string[];
  /** nº da mensagem no compositor de cada texto (mesmo índice) */
  nums: number[];
  total: number;
  tipos: EtapaTipo[];
  /** os mesmos campos JÁ dobrados (minúsculo, sem acento) — calculado uma vez no índice,
   *  para a busca não refazer a dobra caractere a caractere de 200 scripts a cada tecla */
  dobrado: { titulo: string; descricao: string; tags: string[]; textos: string[] };
}

export type Onde = 'titulo' | 'descricao' | 'tag' | 'texto';
export interface Casamento {
  it: ItemIndice;
  /** 0 = tudo no título · 1 = título/descrição/tags · 2 = precisou do texto das mensagens */
  rank: number;
  /** onde mostrar o porquê na linha de apoio (null = sem busca) */
  onde: Onde | null;
  /** índice do texto que casou (onde === 'texto') */
  textoIdx?: number;
  /** tag que casou (onde === 'tag') */
  tag?: string;
}

/** Uma linha da lista: o casamento + a chave ÚNICA da opção (grupo|id). */
export interface Opcao extends Casamento { chave: string }
export interface Grupo { chave: string; rotulo: string; tipo: 'fav' | 'rec' | 'cat' | 'outros' | 'lista'; itens: Opcao[] }
export interface Pilula { filtro: FiltroPaleta; rotulo: string; n: number; total: number }

const RE_TOKEN = /\{\{\s*[a-zA-Z_]+\s*\}\}/g;
const dobra = (t: string) => dobrar(t).s;
const cmpTitulo = (a: ItemIndice, b: ItemIndice) =>
  a.titulo.localeCompare(b.titulo, 'pt-BR', { sensitivity: 'base', numeric: true });

export function ordenarCategorias(categorias: ScriptCategoria[]): ScriptCategoria[] {
  return [...categorias].sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, 'pt-BR'));
}

/** Monta o índice (uma vez por mudança de dados). No demo o resumo vem das etapas de amostra. */
export function indexar(
  scripts: Script[], categorias: ScriptCategoria[], resumo: Record<string, ResumoEtapas | undefined>,
): ItemIndice[] {
  const validas = new Set(categorias.map((c) => c.id));
  return scripts.map((s) => {
    const r = resumo[s.id];
    // sem etapa enviável o compositor manda o conteudo como mensagem única (mesma regra aqui)
    const msgs = r?.textos?.length ? r.textos : (s.conteudo.trim() ? [{ n: 1, texto: s.conteudo }] : []);
    const brutos = msgs.map((m) => m.texto);
    const comp = composicaoDe(s.conteudo, r);
    const titulo = exibirTextoScript(s.titulo) || s.titulo;
    const descricao = s.descricao?.trim() ? exibirTextoScript(s.descricao) : null;
    const tags = (s.tags ?? []).filter((t) => t.trim());
    const textos = brutos.map((t) => umaLinha(semMarcacao(t.replace(RE_TOKEN, ' '))));
    return {
      s,
      titulo,
      descricao,
      catId: s.categoriaId && validas.has(s.categoriaId) ? s.categoriaId : null,
      tags,
      textos,
      brutos,
      nums: msgs.map((m) => m.n),
      total: comp.total,
      tipos: comp.tipos,
      dobrado: { titulo: dobra(titulo), descricao: descricao ? dobra(descricao) : '', tags: tags.map(dobra), textos: textos.map(dobra) },
    };
  });
}

/** Casa um item com os termos (TODOS precisam aparecer em algum campo). null = não casa. */
export function casar(it: ItemIndice, termos: string[]): Casamento | null {
  if (termos.length === 0) return { it, rank: 0, onde: null };
  const d = it.dobrado;
  let rank = 0;
  let onde: Onde = 'titulo';
  let textoIdx: number | undefined;
  let tag: string | undefined;
  const pesoOnde: Record<Onde, number> = { titulo: 0, descricao: 1, tag: 2, texto: 3 };
  for (const termo of termos) {
    let aqui: Onde | null = null;
    if (d.titulo.includes(termo)) aqui = 'titulo';
    else if (d.descricao && d.descricao.includes(termo)) aqui = 'descricao';
    else {
      const ti = d.tags.findIndex((x) => x.includes(termo));
      if (ti >= 0) { aqui = 'tag'; tag = tag ?? it.tags[ti]; }
      else {
        const k = d.textos.findIndex((x) => x.includes(termo));
        if (k >= 0) { aqui = 'texto'; textoIdx = textoIdx ?? k; }
      }
    }
    if (!aqui) return null;
    rank = Math.max(rank, aqui === 'titulo' ? 0 : aqui === 'texto' ? 2 : 1);
    if (pesoOnde[aqui] > pesoOnde[onde]) onde = aqui;
  }
  return { it, rank, onde, textoIdx: onde === 'texto' ? textoIdx : undefined, tag: onde === 'tag' ? tag : undefined };
}

/** Recentes válidos (existem na lista), na ordem de uso. */
export function recentesValidos(recentes: string[], indice: ItemIndice[]): string[] {
  const ids = new Set(indice.map((i) => i.s.id));
  return recentes.filter((id) => ids.has(id));
}

function pertence(f: FiltroPaleta, it: ItemIndice, rec: Set<string>): boolean {
  if (f === 'todos') return true;
  if (f === 'favoritos') return it.s.favorito;
  if (f === 'recentes') return rec.has(it.s.id);
  if (f === 'outros') return it.catId === null;
  return it.catId === f.slice(4);
}

export interface Paleta {
  /** filtro efetivo (um filtro que sumiu — categoria apagada — cai em Todos) */
  filtro: FiltroPaleta;
  grupos: Grupo[];
  /** ordem visual achatada (teclado ↑↓ casa com o que se vê) */
  flat: Opcao[];
  pilulas: Pilula[];
  /** quantos casam no filtro ativo / quantos o filtro tem sem busca */
  n: number;
  total: number;
  /** quantos scripts existem (pílula Todos, sem busca) — o T de "N de T" */
  totalGeral: number;
  /** quantos casam em QUALQUER filtro (para "ver em Todos") */
  nTodos: number;
}

export function montarPaleta(a: {
  indice: ItemIndice[];
  categorias: ScriptCategoria[];
  recentes: string[];
  filtro: FiltroPaleta;
  termos: string[];
}): Paleta {
  const { indice, termos } = a;
  const cats = ordenarCategorias(a.categorias);
  const recLista = recentesValidos(a.recentes, indice);
  const rec = new Set(recLista);
  const posRec = new Map(recLista.map((id, i) => [id, i]));
  const casados: Casamento[] = [];
  for (const it of indice) { const c = casar(it, termos); if (c) casados.push(c); }

  // ---- pílulas: Todos · Favoritos · Recentes · categorias (com script) · Outros (se houver)
  const conta = (f: FiltroPaleta) => ({
    n: casados.filter((c) => pertence(f, c.it, rec)).length,
    total: indice.filter((it) => pertence(f, it, rec)).length,
  });
  const pilulas: Pilula[] = [
    { filtro: 'todos', rotulo: 'Todos', ...conta('todos') },
    { filtro: 'favoritos', rotulo: 'Favoritos', ...conta('favoritos') },
    { filtro: 'recentes', rotulo: 'Recentes', ...conta('recentes') },
  ];
  for (const c of cats) {
    const k = conta(`cat:${c.id}`);
    if (k.total > 0) pilulas.push({ filtro: `cat:${c.id}`, rotulo: exibirTextoScript(c.nome) || c.nome, ...k });
  }
  const outros = conta('outros');
  if (outros.total > 0) pilulas.push({ filtro: 'outros', rotulo: 'Outros', ...outros });

  // filtro que deixou de existir (categoria sumiu) cai em Todos
  const filtro: FiltroPaleta = pilulas.some((p) => p.filtro === a.filtro) ? a.filtro : 'todos';
  const ativa = pilulas.find((p) => p.filtro === filtro)!;

  const busca = termos.length > 0;
  const ordAlfa = (x: Casamento, y: Casamento) => (busca ? x.rank - y.rank : 0) || cmpTitulo(x.it, y.it);
  const ordRec = (x: Casamento, y: Casamento) => (busca ? x.rank - y.rank : 0) || (posRec.get(x.it.s.id)! - posRec.get(y.it.s.id)!);

  const grupos: Grupo[] = [];
  const opcoes = (chaveGrupo: string, itens: Casamento[]): Opcao[] => itens.map((c) => ({ ...c, chave: `${chaveGrupo}|${c.it.s.id}` }));
  const push = (chave: string, rotulo: string, tipo: Grupo['tipo'], itens: Casamento[]) => {
    if (itens.length) grupos.push({ chave, rotulo, tipo, itens: opcoes(chave, itens) });
  };
  if (filtro === 'todos') {
    // sem busca, os atalhos do topo "tiram" o script dos grupos de baixo (cada um UMA vez)
    const mostrados = new Set<string>();
    const novos = (xs: Casamento[]) => xs.filter((c) => !mostrados.has(c.it.s.id));
    const marcar = (xs: Casamento[]) => { for (const c of xs) mostrados.add(c.it.s.id); return xs; };
    if (!busca) {
      push('fav', 'Favoritos', 'fav', marcar(casados.filter((c) => c.it.s.favorito).sort(ordAlfa)));
      push('rec', 'Recentes', 'rec', marcar(novos(casados.filter((c) => rec.has(c.it.s.id))).sort(ordRec)));
    }
    const porCat: Grupo[] = [];
    const antes = grupos.length;
    for (const c of cats) push('cat:' + c.id, exibirTextoScript(c.nome) || c.nome, 'cat', novos(casados.filter((x) => x.it.catId === c.id)).sort(ordAlfa));
    push('outros', 'Outros', 'outros', novos(casados.filter((x) => x.it.catId === null)).sort(ordAlfa));
    if (busca) {
      // com busca, o grupo do melhor resultado sobe (estável: empate mantém a ordem do arsenal)
      porCat.push(...grupos.splice(antes));
      const melhor = (g: Grupo) => Math.min(...g.itens.map((o) => o.rank));
      porCat.map((g, i) => ({ g, i, r: melhor(g) })).sort((a, b) => a.r - b.r || a.i - b.i).forEach(({ g }) => grupos.push(g));
    }
  } else {
    push(filtro, ativa.rotulo, 'lista', casados.filter((c) => pertence(filtro, c.it, rec)).sort(filtro === 'recentes' ? ordRec : ordAlfa));
  }

  return {
    filtro,
    grupos,
    flat: grupos.flatMap((g) => g.itens),
    pilulas,
    n: ativa.n,
    total: ativa.total,
    totalGeral: indice.length,
    nTodos: casados.length,
  };
}

/** Filtro vizinho (← →), sem dar a volta. */
export function filtroVizinho(pilulas: Pilula[], atual: FiltroPaleta, delta: 1 | -1): FiltroPaleta {
  const i = Math.max(0, pilulas.findIndex((p) => p.filtro === atual));
  return pilulas[Math.min(pilulas.length - 1, Math.max(0, i + delta))]?.filtro ?? atual;
}
