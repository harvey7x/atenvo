/* Carga PREGUIÇOSA das bibliotecas pesadas da Análise INSS (pdf.js, pdf-lib,
   SheetJS): só baixam quando a aba é usada, sem pesar o resto do sistema.
   Tudo roda no NAVEGADOR — os PDFs nunca saem da máquina.
   Worker do pdf.js: mesmo padrão do unificadorLib.ts (pdfjs-dist 6 + `?url`). */
type PdfjsDist = typeof import('pdfjs-dist');
type PdfLib = typeof import('pdf-lib');
type Xlsx = typeof import('xlsx');

/* O motor (e o app original, no pdf.js 3.11 do site) libera cada PDF com
   `doc.destroy()`. No pdfjs-dist 6 esse método SAIU do documento — ficou só na
   tarefa de carga — e o motor engole o erro: sem este ajuste, cada PDF lido
   deixaria um Web Worker vivo. `comDestroy` devolve o mesmo pdf.js com um
   getDocument cujo documento volta a ter `destroy()` (= tarefa.destroy()). */
type GetDocumentQualquer = (src: never) => { promise: Promise<object>; destroy(): Promise<void> };

export type ComDestroy<M extends { getDocument: GetDocumentQualquer }> = Omit<M, 'getDocument'> & {
  getDocument(src: Parameters<M['getDocument']>[0]): {
    readonly promise: Promise<Awaited<ReturnType<M['getDocument']>['promise']> & { destroy(): Promise<void> }>;
    destroy(): Promise<void>;
  };
};

export function comDestroy<M extends { getDocument: GetDocumentQualquer }>(pdfjs: M): ComDestroy<M> {
  const getDocument = (src: Parameters<M['getDocument']>[0]) => {
    const tarefa = pdfjs.getDocument(src as never);
    return {
      promise: tarefa.promise.then((doc) => Object.assign(doc, { destroy: () => tarefa.destroy() })),
      destroy: () => tarefa.destroy(),
    };
  };
  return { ...pdfjs, getDocument } as unknown as ComDestroy<M>;
}

/** pdf.js da aba: o módulo pdfjs-dist com `getDocument` ajustado (ver comDestroy). */
export type PdfjsAnalise = ComDestroy<PdfjsDist>;

let pdfjsP: Promise<PdfjsAnalise> | null = null;
let pdfLibP: Promise<PdfLib> | null = null;
let xlsxP: Promise<Xlsx> | null = null;

/** pdfjs-dist com o worker configurado (uma carga só; falha libera nova tentativa). */
export function carregarPdfjs(): Promise<PdfjsAnalise> {
  if (!pdfjsP) {
    pdfjsP = Promise.all([
      import('pdfjs-dist'),
      import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
    ])
      .then(([pdfjs, worker]) => {
        pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
        return comDestroy(pdfjs);
      })
      .catch((erro: unknown) => {
        pdfjsP = null;
        throw erro;
      });
  }
  return pdfjsP;
}

/** pdf-lib (unificar PDFs). */
export function carregarPdfLib(): Promise<PdfLib> {
  if (!pdfLibP) {
    pdfLibP = import('pdf-lib').catch((erro: unknown) => {
      pdfLibP = null;
      throw erro;
    });
  }
  return pdfLibP;
}

/** SheetJS (planilha .xlsx). */
export function carregarXlsx(): Promise<Xlsx> {
  if (!xlsxP) {
    xlsxP = import('xlsx').catch((erro: unknown) => {
      xlsxP = null;
      throw erro;
    });
  }
  return xlsxP;
}
