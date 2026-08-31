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
export interface ArquivoInfo {
  nome: string; paginas: number; bancos: string[]; textoLido: boolean;
  beneficiario: string | null; nb: string | null; cpf: string | null; especie: string | null;
  consignadoMes: number | null; competenciaMes: string | null; periodo: string | null;
}
export interface ResultadoUnificacao {
  pdf: Blob;
  identificarBancos: boolean;       // liga a análise de bancos + beneficiário (só faz sentido em Histórico de Créditos)
  totalPaginas: number;
  arquivos: ArquivoInfo[];
  bancos: BancoAchado[];            // só os ENCONTRADOS
  ausentes: { id: string; nome: string }[];
  falhas: { nome: string; motivo: string }[];   // não puderam ser juntados
  beneficiarios: number;            // NBs distintos
  consignadoTotalMes: number;       // soma do consignado do mês mais recente de cada arquivo
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

const parseBRL = (v: string) => Number(v.replace(/\./g, '').replace(',', '.'));

/* dados do beneficiário + consignado do MÊS MAIS RECENTE (do Histórico
   de Créditos do INSS). NB/CPF/espécie são padrões estáveis; o nome é
   saneado (corta rótulos vizinhos). O consignado é por competência —
   somar todas as páginas inflaria (cada mês repete), então pega a
   competência (AAAAMM) mais nova. */
function extrairDados(paginas: string[]): Pick<ArquivoInfo, 'beneficiario' | 'nb' | 'cpf' | 'especie' | 'consignadoMes' | 'competenciaMes' | 'periodo'> {
  const full = paginas.join('\n');
  const nb = full.match(/NB:\s*([\d.\-]{6,20})/)?.[1] ?? null;
  const cpf = full.match(/CPF:\s*([\d.\-]{11,18})/)?.[1] ?? null;
  const especie = full.match(/Esp[eé]cie:\s*(\d{1,3}\s*-\s*[A-ZÀ-Ú][A-ZÀ-Ú ]{5,60})/)?.[1]?.replace(/\s+/g, ' ').trim() ?? null;
  const pIni = full.match(/Compet\.?\s*Inicial:\s*(\d{2}\/\d{4})/)?.[1] ?? null;
  const pFim = full.match(/Compet\.?\s*Final:\s*(\d{2}\/\d{4})/)?.[1] ?? null;
  const periodo = pIni && pFim ? `${pIni} – ${pFim}` : (pIni ?? pFim);
  let beneficiario: string | null = full.match(/Nome:\s*([A-ZÀ-Ú][A-ZÀ-Ú '.]{3,58})/)?.[1] ?? null;
  if (beneficiario) {
    beneficiario = beneficiario.split(/\bNOME DA\b|\bM[ÃA]E\b/i)[0].replace(/\s+/g, ' ').trim();
    if (beneficiario.length < 5) beneficiario = null;
  }
  let melhorComp: string | null = null; let melhorValor: number | null = null;
  for (const pg of paginas) {
    const cm = pg.match(/(\d{2})\/(\d{4})\s+R\$/);
    if (!cm) continue;
    const cons = [...pg.matchAll(/CONSIGNACAO[^\n]*?R\$\s*([\d.]+,\d{2})/g)];
    if (!cons.length) continue;
    const chave = cm[2] + cm[1];              // AAAAMM
    if (!melhorComp || chave > melhorComp) { melhorComp = chave; melhorValor = cons.reduce((a, m) => a + parseBRL(m[1]), 0); }
  }
  return {
    beneficiario, nb, cpf, especie,
    consignadoMes: melhorValor,
    competenciaMes: melhorComp ? `${melhorComp.slice(4)}/${melhorComp.slice(0, 4)}` : null,
    periodo,
  };
}

/** texto por página de um PDF (pdfjs) */
async function textoPorPagina(bytes: Uint8Array): Promise<string[]> {
  const doc = await pdfjs.getDocument({ data: bytes }).promise;
  const paginas: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    let t = '';
    for (const it of content.items as { str?: string; hasEOL?: boolean }[]) {
      t += it.str ?? '';
      t += it.hasEOL ? '\n' : ' ';   // recupera as quebras de linha (separa nome × nome da mãe)
    }
    paginas.push(t);
  }
  await doc.cleanup();
  return paginas;
}

const DADOS_VAZIOS = { beneficiario: null, nb: null, cpf: null, especie: null, consignadoMes: null, competenciaMes: null, periodo: null };

/** junta os PDFs na ORDEM recebida. Por padrão só UNE (qualquer tipo de documento).
    Com identificarBancos=true (ligar só quando forem Históricos de Créditos do INSS),
    além de unir ele LÊ o texto pra detectar os bancos-alvo e extrair beneficiário/consignado. */
export async function unificar(files: File[], identificarBancos = false): Promise<ResultadoUnificacao> {
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

    // Sem "identificar bancos": só une (não lê o texto) — rápido e serve pra qualquer documento.
    if (!identificarBancos) {
      arquivos.push({ nome: f.name, paginas: idxs.length, bancos: [], textoLido: false, ...DADOS_VAZIOS });
      paginaGlobal += idxs.length;
      continue;
    }

    // TEXTO (p/ detecção). Falha/ausência NÃO derruba o arquivo — só marca
    // que o texto não foi lido (protegido, escaneado sem OCR, etc.).
    const bancosNoArquivo = new Set<string>();
    let textoLido = false;
    let paginasTextoRef: string[] = [];
    try {
      const paginasTexto = await textoPorPagina(new Uint8Array(buf.slice(0)));
      paginasTextoRef = paginasTexto;
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

    const dados = extrairDados(paginasTextoRef);
    arquivos.push({ nome: f.name, paginas: idxs.length, bancos: [...bancosNoArquivo], textoLido, ...dados });
    paginaGlobal += idxs.length;
  }

  if (paginaGlobal === 0) {
    throw new Error(falhas.length ? `Nenhum arquivo pôde ser lido (${falhas[0].motivo}).` : 'Nenhuma página para unificar.');
  }

  const bytes = await merged.save();
  const bancos: BancoAchado[] = BANCOS_ALVO
    .filter((b) => acc.has(b.id))
    .map((b) => ({ id: b.id, nome: b.nome, ocorrencias: acc.get(b.id)!.ocorrencias, paginas: [...acc.get(b.id)!.paginas].sort((x, y) => x - y) }));
  const nbsDistintos = new Set(arquivos.map((a) => a.nb).filter(Boolean));
  const consignadoTotalMes = arquivos.reduce((sum, a) => sum + (a.consignadoMes ?? 0), 0);
  const achadosIds = new Set(bancos.map((b) => b.id));
  const ausentes = identificarBancos ? BANCOS_ALVO.filter((b) => !achadosIds.has(b.id)).map((b) => ({ id: b.id, nome: b.nome })) : [];

  return {
    pdf: new Blob([bytes as BlobPart], { type: 'application/pdf' }),
    identificarBancos,
    totalPaginas: paginaGlobal,
    arquivos,
    bancos,
    ausentes,
    falhas,
    beneficiarios: nbsDistintos.size || arquivos.length,
    consignadoTotalMes,
  };
}
