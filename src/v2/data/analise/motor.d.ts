/* Tipos do motor da Análise INSS (motor.js — porte ESM do "ALFA Análise").
   Derivados da leitura do código: dinheiro SEMPRE em CENTAVOS (inteiro) e
   margem consignável em DÉCIMOS de ponto percentual (inteiro: 435 = 43,5%).
   O .js fica intocado (lógica idêntica à do site); este arquivo só descreve. */
import type { WorkBook } from 'xlsx';

/* ------------------------------------------------------------------ níveis */
/** Nível de um alerta/troca (analise.py). Ordem de peso: normal < atencao < alerta. */
export type NivelAlerta = 'alerta' | 'atencao' | 'normal';
/** Nível de risco de um banco na lista de instituições sensíveis (bancos.py). */
export type NivelRiscoBanco = 'alto' | 'medio';
/** Categoria de uma rubrica (extrator.py). */
export type CategoriaRubrica = 'consignado' | 'associativa' | 'credito' | 'desconto' | 'outra';
/** Estratégia de leitura que casou com o texto do PDF. */
export type FormatoExtracao = 'formato_oficial' | 'por_blocos' | 'por_linhas';

/* ---------------------------------------------------------- pdf.js mínimo */
/** O que o motor usa do pdf.js — satisfeito pelo retorno de `carregarPdfjs()`. */
export interface PdfjsPaginaLike {
  getTextContent(): Promise<{ items: ReadonlyArray<unknown> }>;
}
export interface PdfjsDocumentoLike {
  readonly numPages: number;
  getPage(numero: number): Promise<PdfjsPaginaLike>;
  /** O motor chama `doc.destroy()` (pdf.js 3.11 do site). No pdfjs-dist 6 o
      método saiu do documento: use o pdf.js de `carregarPdfjs()` (libs.ts),
      que o devolve via `comDestroy` — exigido aqui de propósito, para não
      vazar um Web Worker por PDF lido. */
  destroy(): unknown;
}
export interface PdfjsLike {
  /** ATENÇÃO: o pdf.js TRANSFERE (desanexa) o ArrayBuffer recebido —
      passe sempre uma cópia (`dados.slice()`), como o app original faz. */
  getDocument(src: { data: Uint8Array | ArrayBuffer }): { promise: Promise<PdfjsDocumentoLike> };
}

/* ---------------------------------------------------------------- leitura */
/** Rubrica de uma competência (ex.: 216 - CONSIGNACAO EMPRESTIMO BANCARIO). */
export interface Rubrica {
  /** Código de 3 dígitos ('101', '216'…). */
  codigo: string;
  descricao: string;
  /** Centavos, com sinal como veio no PDF; `null` se o valor não pôde ser lido. */
  valor: number | null;
  categoria: CategoriaRubrica;
}

/** Rubrica que surgiu logo depois de uma troca de banco. */
export interface RubricaNova extends Rubrica {
  competencia: string;
}

/** Cabeçalho do extrato como lido do texto (extrairCabecalho). */
export interface CabecalhoExtrato {
  nome: string;
  cpf: string;
  nit: string;
  /** NB como aparece no PDF. */
  beneficio: string;
  especie: string;
  /** dd/mm/aaaa */
  dib: string;
  aps: string;
}

/** Uma competência (mês) lida do PDF — saída de extrairCompetencias/lerDeTexto. */
export interface Competencia {
  /** 'MM/AAAA' */
  competencia: string;
  mes: number;
  ano: number;
  /** ano*100+mês — chave de ordenação. */
  chave: number;
  nb: string;
  especie: string;
  /** Código da espécie com 2+ dígitos ('41', '32'…) ou ''. */
  especie_codigo: string;
  dib: string;
  aps: string;
  /** Código do banco normalizado (3 dígitos) ou ''. */
  banco_codigo: string;
  banco_nome: string;
  /** Agência/OP. */
  op_codigo: string;
  /** Praça/agência pagadora. */
  op_nome: string;
  /** Código do banco ou, sem código, nome normalizado (20 chars); '?' se nada. */
  banco_id: string;
  periodo_inicio: string;
  previsao_pagamento: string;
  data_pagamento: string;
  /** Centavos. */
  valor_liquido: number | null;
  /** Centavos — rubrica 101 (MR / bruto de referência). */
  valor_mr: number | null;
  meio_pagamento_bruto: string;
  /** 'CCF', 'CMG'… */
  meio_pagamento_sigla: string;
  /** Descrição legível do meio (ou o texto bruto). */
  meio_pagamento: string;
  status: string;
  ocorrencia: string;
  rubricas: Rubrica[];
  /** Centavos (valores absolutos). */
  total_consignado: number;
  total_associativo: number;
  /** consignado + associativo + outras deduções. */
  total_descontos: number;
  /** Créditos fora a MR. */
  total_creditos: number;
  /** MR + créditos − descontos ≈ líquido (±2 centavos); `null` se faltou MR ou líquido. */
  confere: boolean | null;
  /** Nome de exibição do arquivo de origem. */
  arquivo: string;
  formato: FormatoExtracao;
  texto_bruto: string;
}

/** Resultado de ler UM PDF (lerPdf / lerDeTexto). */
export interface Leitura {
  arquivo: string;
  /** 'pdf.js' por padrão. */
  metodo_extracao: string;
  formato: FormatoExtracao | '';
  cabecalho: CabecalhoExtrato;
  competencias: Competencia[];
  texto_completo: string;
  /** Texto com menos de 40 caracteres — provável PDF escaneado. */
  paginas_texto_vazio: boolean;
}

/* ----------------------------------------------------------------- análise */
/** Competência já na linha do tempo (analisar acrescenta estes campos). */
export interface RegistroLinhaDoTempo extends Competencia {
  /** Índice na linha do tempo (0..n-1). */
  ordem: number;
  /** 'jan/2023' */
  rotulo: string;
  /** Décimos de ponto percentual (consignado ÷ MR); `null` sem MR. */
  margem_pct: number | null;
  contratos_consignado: number;
  /** Mesma competência apareceu em mais de um PDF e esta venceu. */
  duplicada?: boolean;
  /** Mesma competência com bancos diferentes em PDFs distintos. */
  conflito?: boolean;
}

/** Avaliação de um banco contra a lista de risco. */
export interface RiscoBanco {
  risco: boolean;
  nivel: NivelRiscoBanco | null;
  rotulo: string;
  motivo: string;
}

/** Um lado (antes/depois) de uma troca de banco. */
export interface LadoTroca {
  codigo: string;
  nome: string;
  competencia: string;
  rotulo: string;
  data_pagamento: string;
  op_codigo: string;
  op_nome: string;
  meio_pagamento: string;
  meio_pagamento_sigla: string;
  valor_liquido: number | null;
}

/** Troca de banco pagador entre duas competências consecutivas com banco. */
export interface Troca {
  /** 1..n */
  ordem: number;
  de: LadoTroca;
  para: LadoTroca;
  /** `ordem` do registro antes/depois na linha do tempo. */
  indice_antes: number;
  indice_depois: number;
  meses_entre: number;
  /** Frases explicando por que a troca foi sinalizada. */
  motivos: string[];
  nivel: NivelAlerta;
  icone: string;
  risco_destino: RiscoBanco;
  mudou_meio_pagamento: boolean;
  mudou_praca: boolean;
  /** Rótulo do banco de risco citado no nome da praça ('' se nenhum). */
  banco_citado_na_praca: string;
  cooperativa: boolean;
  novas_rubricas: RubricaNova[];
}

/** Período contínuo num mesmo banco pagador. */
export interface PeriodoBancario {
  banco_id: string;
  codigo: string;
  nome: string;
  inicio: string;
  inicio_rotulo: string;
  fim: string;
  fim_rotulo: string;
  competencias: number;
  /** Centavos. */
  total_liquido: number;
  total_consignado: number;
  risco: RiscoBanco;
}

export interface Alerta {
  nivel: NivelAlerta;
  /** Emoji do nível (🔴 🟡 ⚪) ou 'ℹ️' nos informativos. */
  icone: string;
  titulo: string;
  detalhe: string;
  /** 'MM/AAAA' da primeira ocorrência. */
  competencia: string;
}

export interface ResumoDossie {
  /** Décimos de ponto percentual. */
  margem_maxima: number | null;
  margem_media: number | null;
  competencias_acima_teto: number;
  contratos_max: number;
  /** Centavos. */
  total_bruto: number;
  competencias: number;
  /** 'MM/AAAA' ou ''. */
  periodo_inicio: string;
  periodo_fim: string;
  periodo_inicio_rotulo: string;
  periodo_fim_rotulo: string;
  bancos_distintos: number;
  periodos_bancarios: number;
  trocas: number;
  trocas_alerta: number;
  trocas_atencao: number;
  trocas_normais: number;
  /** Centavos. */
  total_liquido: number;
  total_consignado: number;
  total_associativo: number;
  alertas: number;
  alertas_criticos: number;
}

/** Arquivo que contribuiu para o dossiê. */
export interface ArquivoDossie {
  arquivo: string;
  metodo_extracao: string;
  competencias_lidas: number;
  sem_texto: boolean;
}

/** Cabeçalho consolidado do benefício. */
export interface CabecalhoDossie {
  nome: string;
  cpf: string;
  nit: string;
  beneficio: string;
  especie: string;
  especie_codigo: string;
  dib: string;
  aps: string;
}

/** Um dossiê por benefício (espécie + NB). */
export interface Dossie {
  arquivos: ArquivoDossie[];
  linha_do_tempo: RegistroLinhaDoTempo[];
  trocas: Troca[];
  bancos: PeriodoBancario[];
  /** Ordenados por peso: alerta → atencao → normal (estável). */
  alertas: Alerta[];
  resumo: ResumoDossie;
  cabecalho: CabecalhoDossie;
  /** Posição do benefício (0..total_beneficios-1). */
  indice: number;
  /** [especie_codigo, nb] */
  chave_beneficio: [string, string];
  total_beneficios: number;
}

/* --------------------------------------------------------------------- API */
export interface AlfaMotorApi {
  readonly VERSAO: string;

  // extração
  /** Texto do PDF inteiro (linhas reconstruídas por posição, como o pdfplumber). */
  extrairTextoPdf(pdfjsLib: PdfjsLike, dados: Uint8Array | ArrayBuffer): Promise<string>;
  /** Lê um PDF de Histórico de Créditos. */
  lerPdf(pdfjsLib: PdfjsLike, dados: Uint8Array | ArrayBuffer, nomeExibicao?: string): Promise<Leitura>;
  /** Mesma leitura, a partir do texto já extraído. */
  lerDeTexto(texto: string, nomeExibicao?: string, metodo?: string): Leitura;
  extrairCabecalho(texto: string): CabecalhoExtrato;
  extrairCompetencias(texto: string, arquivo: string): Competencia[];
  /** Texto de cada página (mesma reconstrução de extrairTextoPdf). */
  extrairTextoPorPagina(pdfjsLib: PdfjsLike, dados: Uint8Array | ArrayBuffer): Promise<string[]>;
  /** Competências 'MM/AAAA' no início de linha de uma página (na ordem em que aparecem). */
  competenciasDaPagina(textoPagina: string | null | undefined): string[];

  // análise
  /** Um dossiê por benefício. ATENÇÃO: muta os registros das leituras (margem_pct etc.). */
  analisar(leituras: Leitura[]): Dossie[];

  // formatação
  /** Centavos → 'R$ 1.234,56' ('—' para null). */
  moeda(centavos: number | null | undefined): string;
  /** Décimos → '43,5%' ('—' para null). */
  percentual(decimos: number | null | undefined): string;
  formatarPct(decimos: number | null | undefined): string;
  /** Décimos → '43.5%' (formato da planilha). */
  pctPlanilha(decimos: number | null | undefined): string;
  /** 'dd/mm/aaaa às hh:mm' (agora, se `data` faltar). */
  carimbo(data?: Date): string;
  /** 'analise-inss_<nome>_esp<cod>_NB<nb>_<carimbo>' (sem extensão). */
  nomeArquivoBase(dossie: Pick<Dossie, 'cabecalho'>, carimboTempo?: string): string;
  /** Nome oficial da rubrica pelo código ('' se desconhecida). */
  rotuloRubrica(codigo: string): string;
  readonly ROTULO_CATEGORIA: Readonly<Record<Exclude<CategoriaRubrica, 'outra'>, string>>;

  // planilha
  /** Workbook SheetJS com as abas Resumo, Linha do Tempo, Trocas de Banco, Descontos, Alertas. */
  montarPlanilha(XLSX: typeof import('xlsx'), dossie: Dossie): WorkBook;

  // constantes
  readonly NIVEL_ALERTA: 'alerta';
  readonly NIVEL_ATENCAO: 'atencao';
  readonly NIVEL_NORMAL: 'normal';
  readonly ICONES: Readonly<Record<NivelAlerta, string>>;
  /** 450 (= 45%). */
  readonly MARGEM_TETO_DECIMOS: number;
}

declare const AlfaMotor: AlfaMotorApi;
export default AlfaMotor;
