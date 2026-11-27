/* Tipos da unificação de PDFs da Análise INSS (unificar.js — porte ESM). */

/** Item ordenável: `chave` = ano*100+mês da 1ª competência do PDF (null/undefined vai pro fim). */
export interface ItemOrdenavel {
  nome: string;
  chave?: number | null;
}

/** PDF a unificar, já na ordem final. */
export interface ArquivoUnificar {
  nome: string;
  dados: Uint8Array | ArrayBuffer;
}

export interface ResultadoUnificar {
  bytes: Uint8Array;
  /** Páginas no PDF final. */
  paginas: number;
  /** Nomes dos arquivos que o pdf-lib não abriu (ex.: protegido por senha) — ficaram de fora. */
  falhas: string[];
}

export interface AlfaUnificarApi {
  /** Cópia ordenada por `chave` e, no empate, por `nome` (extras preservados). */
  ordenarArquivos<T extends ItemOrdenavel>(itens: readonly T[]): T[];
  /** Junta os PDFs pulando as páginas marcadas em `removidas`
      ("índiceDoArquivo:índiceDaPágina", ambos a partir de 0). */
  unificarPdfs(
    PDFLib: typeof import('pdf-lib'),
    arquivos: readonly ArquivoUnificar[],
    removidas?: ReadonlySet<string> | null,
  ): Promise<ResultadoUnificar>;
  /** 'historico-creditos-unificado_<nome>_<carimbo>.pdf' */
  nomeArquivoUnificado(nomeTitular: string | null | undefined, carimboTempo?: string): string;
}

declare const AlfaUnificar: AlfaUnificarApi;
export default AlfaUnificar;
