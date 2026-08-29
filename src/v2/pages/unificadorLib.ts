/* Unificador de documentos — núcleo (Fase 1, 29/08).
   Junta vários Históricos de Créditos do INSS num PDF só e detecta,
   no texto, quais bancos-alvo aparecem. Tudo no NAVEGADOR (pdf-lib
   junta; pdfjs lê o texto) — os PDFs nunca saem da máquina. */
import { PDFDocument } from 'pdf-lib';
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

/* bancos-alvo (pedido do dono). `re` casa o nome no texto normalizado
   (maiúsculo, sem acento) com fronteira de palavra — evita falso
   positivo em tokens curtos como BMG. */
export const BANCOS_ALVO = [
  { id: 'agibank', nome: 'Agibank', re: /\bAGIBANK\b/g },
  { id: 'sicoob', nome: 'Sicoob', re: /\bSICOOB\b/g },
  { id: 'bancoob', nome: 'Bancoob', re: /\bBANCOOB\b/g },
  { id: 'mercantil', nome: 'Mercantil', re: /\bMERCANTIL\b/g },
  { id: 'bmg', nome: 'BMG', re: /\bBMG\b/g },
  { id: 'crefisa', nome: 'Crefisa', re: /\bCREFISA\b/g },
] as const;

export interface BancoAchado { id: string; nome: string; ocorrencias: number; paginas: number[] }
export interface ArquivoInfo { nome: string; paginas: number; bancos: string[] }
export interface ResultadoUnificacao {
  pdf: Blob;
  totalPaginas: number;
  arquivos: ArquivoInfo[];
  bancos: BancoAchado[];            // só os ENCONTRADOS
  ausentes: { id: string; nome: string }[];
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

/** texto por página de um PDF (pdfjs) */
async function textoPorPagina(bytes: Uint8Array): Promise<string[]> {
  const doc = await pdfjs.getDocument({ data: bytes }).promise;
  const paginas: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    paginas.push((content.items as { str?: string }[]).map((i) => i.str ?? '').join(' '));
  }
  await doc.cleanup();
  return paginas;
}

/** junta os PDFs na ORDEM recebida e detecta os bancos-alvo */
export async function unificar(files: File[]): Promise<ResultadoUnificacao> {
  if (!files.length) throw new Error('Nenhum arquivo selecionado.');
  const merged = await PDFDocument.create();
  const arquivos: ArquivoInfo[] = [];
  // acumulador por banco: ocorrências totais + páginas GLOBAIS (na ordem juntada)
  const acc = new Map<string, { ocorrencias: number; paginas: Set<number> }>();
  let paginaGlobal = 0;

  for (const f of files) {
    const buf = await f.arrayBuffer();
    // cópias independentes: pdfjs transfere o buffer p/ o worker (detacha)
    const src = await PDFDocument.load(new Uint8Array(buf.slice(0)), { ignoreEncryption: true });
    const idxs = src.getPageIndices();
    const paginasCopiadas = await merged.copyPages(src, idxs);
    paginasCopiadas.forEach((p) => merged.addPage(p));

    const paginasTexto = await textoPorPagina(new Uint8Array(buf.slice(0)));
    const bancosNoArquivo = new Set<string>();
    paginasTexto.forEach((txt, i) => {
      const N = norm(txt);
      const pg = paginaGlobal + i + 1;
      for (const b of BANCOS_ALVO) {
        const m = N.match(b.re);
        if (m && m.length) {
          bancosNoArquivo.add(b.nome);
          const a = acc.get(b.id) ?? { ocorrencias: 0, paginas: new Set<number>() };
          a.ocorrencias += m.length;
          a.paginas.add(pg);
          acc.set(b.id, a);
        }
      }
    });
    arquivos.push({ nome: f.name, paginas: idxs.length, bancos: [...bancosNoArquivo] });
    paginaGlobal += idxs.length;
  }

  const bytes = await merged.save();
  const bancos: BancoAchado[] = BANCOS_ALVO
    .filter((b) => acc.has(b.id))
    .map((b) => ({ id: b.id, nome: b.nome, ocorrencias: acc.get(b.id)!.ocorrencias, paginas: [...acc.get(b.id)!.paginas].sort((x, y) => x - y) }));
  const achadosIds = new Set(bancos.map((b) => b.id));
  const ausentes = BANCOS_ALVO.filter((b) => !achadosIds.has(b.id)).map((b) => ({ id: b.id, nome: b.nome }));

  return {
    pdf: new Blob([bytes as BlobPart], { type: 'application/pdf' }),
    totalPaginas: paginaGlobal,
    arquivos,
    bancos,
    ausentes,
  };
}
