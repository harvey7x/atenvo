/* Unificar PDFs: todas as páginas dos extratos, na ordem das competências,
   com miniatura por página (marcar/desmarcar para tirar do arquivo final),
   prévia ampliada com teclado, PDF unificado e "reanalisar só com as
   páginas mantidas". Tudo local (pdf.js desenha, pdf-lib monta). */
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import AlfaMotor from '../../data/analise/motor';
import AlfaUnificar from '../../data/analise/unificar';
import { carregarPdfjs, carregarPdfLib } from '../../data/analise/libs';
import { BotaoPrimario, BotaoSec, ModalV2 } from '../../components';
import { acharRolagem, baixarBlob, mensagemDe, nomeDoTitular, periodoDaAnalise } from './conteudo';
import { CabecalhoTela, IconeDocumento, IconeLupa, Rodape, Secao } from './comum';
import type { AvisoOperacao, DocPdf, EstadoAnalise, OrigemUnificar, Pdfjs, TarefaRender } from './tipos';

interface GrupoArquivo {
  estado: 'lendo' | 'pronto' | 'falhou';
  numPaginas: number;
  etiquetas: string[][] | null;
  doc: DocPdf | null;
}

interface ItemPagina {
  marca: string;          // "índiceDoArquivo:índiceDaPágina" (índice ORIGINAL do arquivo)
  nomeArquivo: string;
  pagina: number;         // 1..n
  etiqueta: string;
  doc: DocPdf | null;
}

const LENDO: GrupoArquivo = { estado: 'lendo', numPaginas: 0, etiquetas: null, doc: null };

export function TelaUnificar({
  estado, origem, removidas, aoAlternar, aoReanalisar, aoVoltar, aoNovaAnalise, estadoAtual,
}: {
  estado: EstadoAnalise;
  origem: OrigemUnificar;
  removidas: ReadonlySet<string>;
  aoAlternar: (marca: string) => void;
  /** Refaz a análise com as páginas mantidas; devolve a mensagem de erro (ou null). */
  aoReanalisar: () => Promise<string | null>;
  aoVoltar: () => void;
  aoNovaAnalise: () => void;
  /** Análise vigente agora (para descartar resultados de uma análise trocada no meio). */
  estadoAtual: () => EstadoAnalise | null;
}) {
  const raizRef = useRef<HTMLDivElement>(null);
  const ordem = useMemo(
    () => AlfaUnificar.ordenarArquivos(estado.pdfs.map((p, i) => ({ nome: p.nome, chave: p.chave, indice: i }))),
    [estado],
  );
  const titular = nomeDoTitular(estado);
  const [grupos, setGrupos] = useState<ReadonlyMap<number, GrupoArquivo>>(new Map());
  const [total, setTotal] = useState<number | null>(estado.paginasTotal);
  const [gerando, setGerando] = useState(false);
  const [reanalisando, setReanalisando] = useState(false);
  const [aviso, setAviso] = useState<AvisoOperacao | null>(null);
  const [previa, setPrevia] = useState<string | null>(null);

  /* ---- leitura dos arquivos: etiquetas de competência + documento p/ desenho ---- */
  useEffect(() => {
    let vivo = true;
    const docs: DocPdf[] = [];
    const meu = estado;
    setGrupos(new Map());
    (async () => {
      let pdfjs: Pdfjs | null = null;
      try { pdfjs = await carregarPdfjs(); } catch { pdfjs = null; }
      if (!vivo) return;
      let soma = 0;
      for (const o of ordem) {
        const pdf = meu.pdfs[o.indice];
        if (!meu.etiquetas.has(o.indice)) {
          try {
            if (!pdfjs) throw new Error('pdf.js indisponível');
            const textos = await AlfaMotor.extrairTextoPorPagina(pdfjs, pdf.dados.slice());
            meu.etiquetas.set(o.indice, textos.map((t) => AlfaMotor.competenciasDaPagina(t)));
            meu.textosPaginas.set(o.indice, textos);   // a reanálise usa isto
          } catch {
            meu.etiquetas.set(o.indice, null);
          }
          if (!vivo) return;
        }

        let doc: DocPdf | null = null;
        if (pdfjs) {
          try { doc = await pdfjs.getDocument({ data: pdf.dados.slice() }).promise; } catch { doc = null; }
          if (doc && !vivo) { doc.destroy().catch(() => undefined); return; }
          if (doc) docs.push(doc);
        }
        if (!vivo) return;

        // Sem o pdf.js, a contagem vem do pdf-lib (o mesmo que monta o arquivo
        // final): a página aparece sem desenho, mas continua contada e removível.
        let numPaginas: number | null = doc ? doc.numPages : null;
        if (numPaginas === null) {
          try {
            const PDFLib = await carregarPdfLib();
            const espelho = await PDFLib.PDFDocument.load(pdf.dados);
            numPaginas = espelho.getPageCount();
          } catch { numPaginas = null; }
          if (!vivo) return;
        }

        // Nem o pdf-lib abre: o arquivo também fica fora do PDF final
        // (unificarPdfs o reporta em `falhas`), então fica fora da conta.
        const grupo: GrupoArquivo = numPaginas === null
          ? { estado: 'falhou', numPaginas: 0, etiquetas: null, doc: null }
          : { estado: 'pronto', numPaginas, etiquetas: meu.etiquetas.get(o.indice) ?? null, doc };
        if (numPaginas !== null) soma += numPaginas;
        setGrupos((atual) => new Map(atual).set(o.indice, grupo));
      }
      meu.paginasTotal = soma;
      if (vivo) setTotal(soma);
    })();
    return () => {
      vivo = false;
      for (const d of docs) d.destroy().catch(() => undefined);
    };
  }, [estado, ordem]);

  /* ---- páginas em ordem (para a prévia navegar) ---- */
  const paginas = useMemo<ItemPagina[]>(() => {
    const lista: ItemPagina[] = [];
    for (const o of ordem) {
      const g = grupos.get(o.indice);
      if (!g || g.estado !== 'pronto') continue;
      for (let p = 0; p < g.numPaginas; p++) {
        const comp = g.etiquetas && g.etiquetas[p] ? g.etiquetas[p] : [];
        lista.push({
          marca: `${o.indice}:${p}`, nomeArquivo: o.nome, pagina: p + 1,
          etiqueta: comp.length ? comp.join(', ') : 'sem competência', doc: g.doc,
        });
      }
    }
    return lista;
  }, [ordem, grupos]);

  const observar = useFilaDesenho(raizRef);
  const muitas = useCallback(() => (estado.paginasTotal || 0) > 60, [estado]);

  /* ---- PDF unificado ---- */
  // Páginas mantidas nos arquivos legíveis (fora os nomes em `fora`).
  function contarMantidas(fora: ReadonlySet<string> = new Set()): number {
    let mantidas = 0;
    for (const o of ordem) {
      const g = grupos.get(o.indice);
      if (!g || g.estado !== 'pronto' || fora.has(o.nome)) continue;
      for (let p = 0; p < g.numPaginas; p++) if (!removidas.has(`${o.indice}:${p}`)) mantidas += 1;
    }
    return mantidas;
  }

  async function baixarUnificado() {
    if (gerando) return;
    const meu = estado;
    // O pdf-lib acrescenta uma página EM BRANCO ao salvar um documento vazio,
    // então `resultado.paginas` nunca chega a 0 e o aviso original não dispara
    // (o mesmo acontece no site). A conta das páginas mantidas é feita aqui.
    if (total !== null && !contarMantidas()) {
      setAviso({ tom: 'erro', texto: 'Nenhuma página restou para o PDF unificado — desfaça alguma remoção e tente de novo.' });
      return;
    }
    const arquivos = ordem.map((o) => ({ nome: o.nome, dados: meu.pdfs[o.indice].dados }));
    // As marcas de remoção usam o índice original do arquivo; a montagem
    // usa a posição na lista ordenada — aqui se traduz uma na outra.
    const marcadas = new Set<string>();
    ordem.forEach((o, pos) => {
      for (const marca of removidas) {
        const [arq, pag] = marca.split(':');
        if (parseInt(arq, 10) === o.indice) marcadas.add(`${pos}:${pag}`);
      }
    });
    setGerando(true);
    setAviso(null);
    try {
      const PDFLib = await carregarPdfLib();
      const resultado = await AlfaUnificar.unificarPdfs(PDFLib, arquivos, marcadas);
      // começou outra análise no meio da geração: não baixa nada
      if (estadoAtual() !== meu) return;
      let avisoFalhas: AvisoOperacao | null = null;
      if (resultado.falhas.length) {
        avisoFalhas = {
          tom: 'atencao',
          texto: 'Estes arquivos não puderam entrar no PDF unificado (protegidos por senha ou danificados): '
            + resultado.falhas.join(', ') + '. Baixe-os de novo do Meu INSS e refaça a análise para incluí-los.',
        };
      }
      // Tudo o que sobrou estava em arquivos que o pdf-lib não abriu: a única
      // "página" do resultado é a em branco do pdf-lib — não baixa.
      const soEmBranco = total !== null && resultado.falhas.length > 0 && resultado.paginas <= 1
        && !contarMantidas(new Set(resultado.falhas));
      if (!resultado.paginas || soEmBranco) {
        setAviso({ tom: 'erro', texto: (avisoFalhas ? avisoFalhas.texto + ' ' : '') + 'Nenhuma página restou para o PDF unificado — desfaça alguma remoção e tente de novo.' });
        return;
      }
      setAviso(avisoFalhas);
      baixarBlob(new Blob([resultado.bytes as BlobPart], { type: 'application/pdf' }),
        AlfaUnificar.nomeArquivoUnificado(nomeDoTitular(meu), meu.marca));
    } catch (erro) {
      setAviso({
        tom: 'erro',
        texto: 'Não foi possível gerar o PDF unificado. Tente de novo; se o problema continuar, baixe os extratos '
          + 'novamente do Meu INSS. Detalhe técnico: ' + mensagemDe(erro),
      });
    } finally {
      setGerando(false);
    }
  }

  async function reanalisar() {
    if (reanalisando) return;
    setReanalisando(true);
    setAviso(null);
    let msg: string | null = null;
    try {
      msg = await aoReanalisar();
    } finally {
      // sucesso troca de tela (este componente sai); erro fica aqui com o aviso
      if (raizRef.current) {
        setReanalisando(false);
        if (msg) setAviso({ tom: 'erro', texto: msg });
      }
    }
  }

  const voltarRotulo = origem.de === 'beneficios' ? 'Voltar aos benefícios' : 'Voltar ao relatório';

  return (
    <div className="an-tela" ref={raizRef}>
      <CabecalhoTela
        titulo="Unificar PDFs"
        sub="Todas as páginas dos extratos enviados, num único PDF, na ordem das competências. Clique numa página para removê-la do arquivo final (clique de novo para desfazer) e use a lupa para abrir a página em tamanho de leitura."
        ident={[
          { rotulo: 'Titular', valor: titular || 'não identificado no PDF' },
          { rotulo: 'Período analisado', valor: periodoDaAnalise(estado, origem) },
          { rotulo: 'Arquivos', valor: String(estado.pdfs.length) },
        ]}
      />

      <div className="an-acoes sobe">
        <BotaoPrimario disabled={gerando} onClick={() => void baixarUnificado()}>
          {gerando ? 'Gerando o PDF…' : 'Baixar PDF unificado'}
        </BotaoPrimario>
        <BotaoSec disabled={reanalisando} onClick={() => void reanalisar()}>
          {reanalisando ? 'Reanalisando…' : 'Reanalisar só com as páginas mantidas'}
        </BotaoSec>
        <BotaoSec onClick={aoVoltar}>{voltarRotulo}</BotaoSec>
        <BotaoSec onClick={aoNovaAnalise}>Nova análise</BotaoSec>
      </div>

      {aviso && (
        <div className={'aviso-inline' + (aviso.tom === 'erro' ? ' erro' : aviso.tom === 'atencao' ? ' an-aviso-inline-at' : '')} role={aviso.tom === 'erro' ? 'alert' : 'status'}>
          {aviso.texto}
          <button type="button" onClick={() => setAviso(null)} aria-label="Fechar aviso">×</button>
        </div>
      )}

      <Secao titulo={<>Páginas do arquivo final — <span className="an-contador num" aria-live="polite">{total === null ? 'lendo as páginas…' : `${total} páginas · ${removidas.size} removidas`}</span></>}>
        <div className="an-grupos">
          {ordem.map((o) => {
            const g = grupos.get(o.indice) ?? LENDO;
            return (
              <div className="an-grupo" key={o.indice}>
                <p className="an-grupo-cab">
                  <IconeDocumento />
                  <span className="an-grupo-nome">{o.nome}</span>
                  <span className="an-grupo-pags num">
                    {g.estado === 'lendo' && '· lendo…'}
                    {g.estado === 'pronto' && `· ${g.numPaginas} página(s)`}
                    {g.estado === 'falhou' && '— não foi possível reabrir este PDF; ele ficará fora do arquivo final'}
                  </span>
                </p>
                {g.estado === 'pronto' && (
                  <div className="an-paginas">
                    {Array.from({ length: g.numPaginas }, (_, p) => {
                      const marca = `${o.indice}:${p}`;
                      const comp = g.etiquetas && g.etiquetas[p] ? g.etiquetas[p] : [];
                      return (
                        <Miniatura
                          key={marca}
                          marca={marca}
                          pagina={p + 1}
                          nomeArquivo={o.nome}
                          etiqueta={comp.length ? comp.join(', ') : 'sem competência'}
                          doc={g.doc}
                          removida={removidas.has(marca)}
                          aoAlternar={aoAlternar}
                          aoAbrir={setPrevia}
                          observar={observar}
                          muitas={muitas}
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Secao>

      <Rodape>
        Os arquivos entram na ordem da primeira competência de cada um; dentro de cada arquivo, a ordem das
        páginas não muda. A montagem acontece no seu navegador — nenhum PDF é enviado a servidor.
      </Rodape>

      {previa !== null && (
        <PreviaPagina
          marca={previa}
          paginas={paginas}
          removidas={removidas}
          aoAlternar={aoAlternar}
          aoIr={setPrevia}
          aoFechar={() => setPrevia(null)}
        />
      )}
    </div>
  );
}

/* ======================================================================
   Desenho das miniaturas sob demanda: só as células que chegam perto da
   área visível entram na fila, desenhadas uma de cada vez.
   ====================================================================== */
type Observar = (el: Element, desenhar: () => Promise<void>) => () => void;

function useFilaDesenho(raizRef: RefObject<HTMLElement>): Observar {
  const fila = useRef<Array<() => Promise<void>>>([]);
  const ocupado = useRef(false);
  const vivo = useRef(true);
  const obs = useRef<IntersectionObserver | null>(null);
  const pendentes = useRef(new Map<Element, () => Promise<void>>());

  useEffect(() => {
    vivo.current = true;
    const mapa = pendentes.current;
    return () => {
      vivo.current = false;
      fila.current = [];
      obs.current?.disconnect();
      obs.current = null;
      mapa.clear();
    };
  }, []);

  const processar = useCallback(async () => {
    if (ocupado.current) return;
    ocupado.current = true;
    while (fila.current.length && vivo.current) {
      const job = fila.current.shift();
      if (!job) break;
      try { await job(); } catch { /* página que não desenha continua clicável */ }
    }
    ocupado.current = false;
  }, []);

  return useCallback<Observar>((el, desenhar) => {
    if (typeof IntersectionObserver === 'undefined') {
      fila.current.push(desenhar);
      void processar();
      return () => undefined;
    }
    if (!obs.current) {
      const observador = new IntersectionObserver((entradas) => {
        for (const en of entradas) {
          if (!en.isIntersecting) continue;
          observador.unobserve(en.target);
          const job = pendentes.current.get(en.target);
          pendentes.current.delete(en.target);
          if (job) fila.current.push(job);
        }
        void processar();
      }, { root: acharRolagem(raizRef.current), rootMargin: '300px' });
      obs.current = observador;
    }
    const atual = obs.current;
    pendentes.current.set(el, desenhar);
    atual.observe(el);
    return () => {
      pendentes.current.delete(el);
      atual.unobserve(el);
    };
  }, [processar, raizRef]);
}

/* ---------------------------------------------------------- miniatura */
function Miniatura({ marca, pagina, nomeArquivo, etiqueta, doc, removida, aoAlternar, aoAbrir, observar, muitas }: {
  marca: string;
  pagina: number;
  nomeArquivo: string;
  etiqueta: string;
  doc: DocPdf | null;
  removida: boolean;
  aoAlternar: (marca: string) => void;
  aoAbrir: (marca: string) => void;
  observar: Observar;
  muitas: () => boolean;
}) {
  const celulaRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const celula = celulaRef.current;
    if (!celula || !doc) return;
    return observar(celula, async () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = muitas() ? 1 : Math.min(window.devicePixelRatio || 1, 2);
      const pg = await doc.getPage(pagina);
      const base = pg.getViewport({ scale: 1 });
      const vista = pg.getViewport({ scale: (140 * dpr) / base.width });
      canvas.width = Math.ceil(vista.width);
      canvas.height = Math.ceil(vista.height);
      await pg.render({ canvas, viewport: vista }).promise;
    });
  }, [doc, pagina, observar, muitas]);

  return (
    <div className={'an-pg' + (removida ? ' an-removida' : '')} ref={celulaRef}>
      <button
        type="button"
        className="an-pg-alvo"
        aria-pressed={removida}
        aria-label={`Página ${pagina} de ${nomeArquivo} — clique para remover ou manter`}
        onClick={() => aoAlternar(marca)}
      >
        {doc ? <canvas ref={canvasRef} className="an-pg-canvas" /> : <span className="an-pg-vazia">sem miniatura</span>}
        <span className="an-pg-rot">pág. {pagina}</span>
        <span className="an-pg-etq num">{etiqueta}</span>
      </button>
      {removida && <span className="an-pg-x" aria-hidden>×</span>}
      <button type="button" className="an-pg-lupa" aria-label="Abrir esta página para leitura" title="Abrir para leitura" onClick={() => aoAbrir(marca)}>
        <IconeLupa />
      </button>
    </div>
  );
}

/* ---------------------------------------------------------- prévia de leitura */
function PreviaPagina({ marca, paginas, removidas, aoAlternar, aoIr, aoFechar }: {
  marca: string;
  paginas: ItemPagina[];
  removidas: ReadonlySet<string>;
  aoAlternar: (marca: string) => void;
  aoIr: (marca: string) => void;
  aoFechar: () => void;
}) {
  const posicao = paginas.findIndex((p) => p.marca === marca);
  const item = posicao >= 0 ? paginas[posicao] : null;
  const removida = removidas.has(marca);
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const [falhou, setFalhou] = useState(false);
  const tarefaRef = useRef<TarefaRender | null>(null);

  // devolve o foco a quem abriu a prévia
  useEffect(() => {
    const antes = document.activeElement as HTMLElement | null;
    return () => { if (antes && antes.isConnected) antes.focus(); };
  }, []);

  // setas navegam (Esc fecha — o ModalV2 cuida)
  const navegar = useCallback((passo: number) => {
    const proximo = posicao + passo;
    if (posicao < 0 || proximo < 0 || proximo >= paginas.length) return;
    aoIr(paginas[proximo].marca);
  }, [posicao, paginas, aoIr]);
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); navegar(-1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); navegar(1); }
    };
    document.addEventListener('keydown', aoTeclar);
    return () => document.removeEventListener('keydown', aoTeclar);
  }, [navegar]);

  // desenho em tamanho de leitura
  const doc = item ? item.doc : null;
  const pagina = item ? item.pagina : 0;
  useEffect(() => {
    if (!canvas) return;
    let atual = true;
    setFalhou(false);
    if (!doc) { setFalhou(true); return; }
    (async () => {
      try {
        tarefaRef.current?.cancel();
        const pg = await doc.getPage(pagina);
        if (!atual) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const larguraCss = Math.min(880, Math.max(320, (window.innerWidth || 900) - 72));
        const base = pg.getViewport({ scale: 1 });
        const vista = pg.getViewport({ scale: (larguraCss * dpr) / base.width });
        canvas.width = Math.ceil(vista.width);
        canvas.height = Math.ceil(vista.height);
        const tarefa = pg.render({ canvas, viewport: vista });
        tarefaRef.current = tarefa;
        await tarefa.promise;
      } catch {
        if (atual) setFalhou(true);
      }
    })();
    return () => { atual = false; };
  }, [canvas, doc, pagina]);
  useEffect(() => () => { tarefaRef.current?.cancel(); }, []);

  return (
    <ModalV2
      aberto
      aoFechar={aoFechar}
      largura={940}
      titulo={(
        <div className="an-previa-cab">
          <div className="an-previa-tit">
            <strong>{item ? item.nomeArquivo : ''}</strong>
            {item && <span className="an-previa-meta num">pág. {item.pagina} · {posicao + 1} de {paginas.length}</span>}
            {item && <span className="an-previa-meta num">{item.etiqueta}</span>}
          </div>
          <BotaoSec mini onClick={aoFechar}>Fechar</BotaoSec>
        </div>
      )}
      rodape={(
        <div className="an-previa-acoes">
          <BotaoSec disabled={posicao <= 0} onClick={() => navegar(-1)}>← Página anterior</BotaoSec>
          <BotaoPrimario onClick={() => aoAlternar(marca)}>
            {removida ? 'Manter esta página no PDF' : 'Remover esta página do PDF'}
          </BotaoPrimario>
          <BotaoSec disabled={posicao < 0 || posicao >= paginas.length - 1} onClick={() => navegar(1)}>Página seguinte →</BotaoSec>
        </div>
      )}
    >
      <div className={'an-previa-corpo' + (removida ? ' an-removida' : '')}>
        {removida && <span className="an-previa-selo">Fora do PDF final</span>}
        <canvas ref={setCanvas} className="an-previa-canvas" hidden={falhou} aria-label={item ? `Página ${item.pagina} de ${item.nomeArquivo}` : undefined} role="img" />
        {falhou && (
          <p className="an-previa-aviso">
            Não deu para desenhar esta página aqui — use a etiqueta de competências para se orientar.
          </p>
        )}
      </div>
    </ModalV2>
  );
}
