/* Tipos da TELA da Análise INSS. Os tipos do motor vêm do contrato
   (src/v2/data/analise/motor.d.ts) — aqui só o que é da interface:
   o estado de uma análise em andamento e as telas. */
import type { carregarPdfjs } from '../../data/analise/libs';
import type { ArquivoDossie, Dossie } from '../../data/analise/motor';

export type { Alerta, ArquivoDossie, Dossie, Leitura, NivelAlerta, PeriodoBancario, RegistroLinhaDoTempo, ResumoDossie, Troca } from '../../data/analise/motor';

/* pdf.js derivado do contrato (sem importar o pacote direto na tela) */
export type Pdfjs = Awaited<ReturnType<typeof carregarPdfjs>>;
export type DocPdf = Awaited<ReturnType<Pdfjs['getDocument']>['promise']>;
export type PaginaPdf = Awaited<ReturnType<DocPdf['getPage']>>;
export type TarefaRender = ReturnType<PaginaPdf['render']>;

/** PDF guardado para a unificação: bytes (cópia, o pdf.js desanexa o original)
    + chave (ano*100+mês) da 1ª competência que o motor extraiu dele. */
export interface PdfGuardado {
  nome: string;
  dados: Uint8Array;
  chave: number | null;
}

/** Arquivo lido (para a tela "sem dados" quando nenhum dossiê tem arquivos). */
export interface ArquivoLido {
  arquivo: string;
  metodo_extracao: string;
  sem_texto: boolean;
}

/** Estado de UMA análise (equivale ao `estado` do app.js original).
    Os cachês (etiquetas/textosPaginas) são mutáveis de propósito, como no
    original: a tela de unificação os preenche e a reanálise os reaproveita. */
export interface EstadoAnalise {
  dossies: Dossie[];
  /** Falhas de leitura ("arquivo: motivo"), as mesmas em todos os dossiês. */
  falhas: string[];
  textos: { arquivo: string; texto: string }[];
  arquivosLidos: ArquivoLido[];
  /** Alinhados com as leituras — índice = posição original do arquivo. */
  pdfs: PdfGuardado[];
  /** índice do arquivo → competências de cada página (null = não deu para ler). */
  etiquetas: Map<number, string[][] | null>;
  /** índice do arquivo → texto de cada página do ARQUIVO COMPLETO. */
  textosPaginas: Map<number, string[]>;
  paginasTotal: number | null;
  reanalise: { paginas: number } | null;
  /** Carimbo AAAAMMDD-hhmmss dos nomes de arquivo exportados. */
  marca: string;
}

export type OrigemUnificar = { de: 'relatorio' | 'beneficios'; indice: number };

export type Tela =
  | { nome: 'inicio' }
  | { nome: 'beneficios' }
  | { nome: 'relatorio'; indice: number }
  | { nome: 'diagnostico'; indice: number }
  | { nome: 'unificar'; origem: OrigemUnificar }
  | { nome: 'semDados' }
  | { nome: 'erro'; titulo: string; mensagem: string; detalhe: string };

export type ArquivoDeTabela = ArquivoDossie | ArquivoLido;

/** Aviso de operação (substitui os alert() do original). */
export interface AvisoOperacao {
  tom: 'erro' | 'atencao' | 'ok';
  texto: string;
}
