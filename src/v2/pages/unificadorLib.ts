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
export interface ArquivoInfo { nome: string; paginas: number; bancos: string[]; textoLido: boolean }
export interface ResultadoUnificacao {
  pdf: Blob;
  totalPaginas: number;
  arquivos: ArquivoInfo[];
  bancos: BancoAchado[];            // só os ENCONTRADOS
  ausentes: { id: string; nome: string }[];
  falhas: { nome: string; motivo: string }[];   // não puderam ser juntados
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

  const falhas: { nome: string; motivo: string }[] = [];
  for (const f of files) {
    let buf: ArrayBuffer;
    try { buf = await f.arrayBuffer(); }
    catch { falhas.push({ nome: f.name, motivo: 'não foi possível ler o arquivo' }); continue; }

    // MERGE (obrigatório p/ o arquivo entrar). Falha aqui = pula o arquivo.
    let idxs: number[];
    try {
      const src = await PDFDocument.load(new Uint8Array(buf.slice(0)), { ignoreEncryption: true });
      idxs = src.getPageIndices();
      const paginasCopiadas = await merged.copyPages(src, idxs);
      paginasCopiadas.forEach((p) => merged.addPage(p));
    } catch (e) {
      const msg = /encrypt|password/i.test((e as Error).message) ? 'PDF protegido por senha' : 'PDF inválido ou corrompido';
      falhas.push({ nome: f.name, motivo: msg });
      continue;
    }

    // TEXTO (p/ detecção). Falha/ausência NÃO derruba o arquivo — só marca
    // que o texto não foi lido (protegido, escaneado sem OCR, etc.).
    const bancosNoArquivo = new Set<string>();
    let textoLido = false;
    try {
      const paginasTexto = await textoPorPagina(new Uint8Array(buf.slice(0)));
      const totalChars = paginasTexto.reduce((n, t) => n + t.trim().length, 0);
      textoLido = totalChars > 20;   // texto real (não PDF escaneado/vazio)
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
    } catch { textoLido = false; }

    arquivos.push({ nome: f.name, paginas: idxs.length, bancos: [...bancosNoArquivo], textoLido });
    paginaGlobal += idxs.length;
  }

  if (paginaGlobal === 0) {
    throw new Error(falhas.length ? `Nenhum arquivo pôde ser lido (${falhas[0].motivo}).` : 'Nenhuma página para unificar.');
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
    falhas,
  };
}
