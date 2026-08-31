/* Conversor de arquivos — núcleo (31/08). TUDO no NAVEGADOR (nada sai da
   máquina): pdf-lib (monta PDF), pdfjs (rasteriza páginas), xlsx/SheetJS
   (planilha↔csv), jszip (empacota várias saídas). Conversões fiéis de Office
   (Word/Excel → PDF com layout) NÃO cabem aqui — exigem servidor. */
import { PDFDocument } from 'pdf-lib';
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export type SaidaArquivo = { nome: string; blob: Blob };

const semExt = (nome: string) => nome.replace(/\.[^.]+$/, '');

/** imagem (qualquer formato que o browser abre) → bytes PNG, via canvas.
    Usado quando o pdf-lib não embute o formato direto (webp/gif) ou o arquivo
    é um JP/PNG que ele recusa (CMYK, progressivo raro, etc.). */
async function imgParaPngBytes(file: File): Promise<Uint8Array> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error(`não consegui abrir a imagem "${file.name}"`));
      i.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || 1;
    canvas.height = img.naturalHeight || 1;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas indisponível neste navegador');
    ctx.drawImage(img, 0, 0);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
    if (!blob) throw new Error('falha ao converter a imagem');
    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Imagens → 1 PDF (cada imagem vira uma página no tamanho dela) */
export async function imagensParaPdf(files: File[]): Promise<Blob> {
  if (!files.length) throw new Error('Nenhuma imagem selecionada.');
  const pdf = await PDFDocument.create();
  for (const f of files) {
    const bytes = new Uint8Array(await f.arrayBuffer());
    const tipo = f.type.toLowerCase();
    const ehJpg = tipo.includes('jpeg') || tipo.includes('jpg') || /\.jpe?g$/i.test(f.name);
    const ehPng = tipo.includes('png') || /\.png$/i.test(f.name);
    let img;
    try {
      if (ehJpg) img = await pdf.embedJpg(bytes);
      else if (ehPng) img = await pdf.embedPng(bytes);
      else img = await pdf.embedPng(await imgParaPngBytes(f));   // webp/gif/heic-que-o-browser-abre…
    } catch {
      img = await pdf.embedPng(await imgParaPngBytes(f));         // fallback universal via canvas
    }
    const page = pdf.addPage([img.width, img.height]);
    page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
  }
  const out = await pdf.save();
  return new Blob([out as BlobPart], { type: 'application/pdf' });
}

/** PDF → 1 imagem por página. escala = resolução (2 ≈ boa; 3 = alta/pesada). */
export async function pdfParaImagens(file: File, formato: 'png' | 'jpg' = 'png', escala = 2): Promise<SaidaArquivo[]> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data: bytes }).promise;
  const mime = formato === 'jpg' ? 'image/jpeg' : 'image/png';
  const ext = formato === 'jpg' ? 'jpg' : 'png';
  const base = semExt(file.name);
  const largura = String(doc.numPages).length;   // zero-pad
  const saidas: SaidaArquivo[] = [];
  try {
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const viewport = page.getViewport({ scale: escala });
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('canvas indisponível neste navegador');
      if (formato === 'jpg') { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height); }  // jpg não tem transparência
      await page.render({ canvasContext: ctx, viewport, canvas }).promise;
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, mime, 0.92));
      if (blob) saidas.push({ nome: `${base}-pag${String(p).padStart(largura, '0')}.${ext}`, blob });
    }
  } finally {
    await doc.cleanup();
  }
  if (!saidas.length) throw new Error('Não consegui rasterizar as páginas (PDF vazio ou protegido).');
  return saidas;
}

/** Excel (.xlsx/.xls) → 1 CSV por aba (BOM p/ o Excel abrir acento certo) */
export async function planilhaParaCsv(file: File): Promise<SaidaArquivo[]> {
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const base = semExt(file.name);
  const saidas: SaidaArquivo[] = [];
  for (const aba of wb.SheetNames) {
    const csv = XLSX.utils.sheet_to_csv(wb.Sheets[aba]);
    const nome = wb.SheetNames.length > 1 ? `${base}-${aba}.csv` : `${base}.csv`;
    saidas.push({ nome, blob: new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }) });
  }
  if (!saidas.length) throw new Error('Planilha sem abas.');
  return saidas;
}

/** CSV → Excel (.xlsx). O SheetJS autodetecta o separador (vírgula/;/tab). */
export async function csvParaPlanilha(file: File): Promise<Blob> {
  const wb = XLSX.read(await file.text(), { type: 'string' });
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  return new Blob([out as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

/** empacota várias saídas num .zip */
export async function ziparArquivos(arquivos: SaidaArquivo[], nomeZip = 'convertidos.zip'): Promise<SaidaArquivo> {
  const zip = new JSZip();
  for (const a of arquivos) zip.file(a.nome, a.blob);
  const blob = await zip.generateAsync({ type: 'blob' });
  return { nome: nomeZip, blob };
}
