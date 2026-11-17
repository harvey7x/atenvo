/* Fila da Iris — os textos e o formato do AVISO DA IRIS (sem dependências: a prévia usa só isto). */
export type CategoriaAviso = 'quente' | 'documentacao' | 'sem_resposta';
export interface AvisoIris {
  id: string;
  contatoId: string;
  conversaId?: string;
  categoria: CategoriaAviso;
  nome: string;
  passouEm: number;
  criadoEm: number;
}

/** os textos do aviso, nas palavras do dono (12/11) */
export const TEXTO_AVISO: Record<CategoriaAviso, { faca: string; curto: string; prioridade: string }> = {
  quente: {
    faca: 'A Iris atendeu completo: o cliente mandou toda a documentação. Falta você fechar.',
    curto: 'completo, falta fechar', prioridade: 'Prioridade',
  },
  documentacao: {
    faca: 'Faltou documentação e o cliente não respondeu. Ajude ele a resolver.',
    curto: 'faltou documentação', prioridade: 'Documentação faltando',
  },
  sem_resposta: {
    faca: 'O cliente ficou sem resposta. Faça um remarketing com ele.',
    curto: 'ficou sem resposta', prioridade: 'Cliente sem resposta',
  },
};

/* ---------------------------------------------------------------- o AVISO DA MARCAÇÃO VENCIDA
   (dono 16/11: "quando o prazo terminar tem que enviar uma notificação pro atendente") */
export type TipoMarcaAviso = 'nao_atendeu' | 'recuperar_senha' | 'mandar_senha' | 'mandar_doc' | 'falta';
/** um aviso por marcação vencida (os do mesmo cliente vêm um atrás do outro) */
export interface AvisoVencida {
  id: string;
  marcacaoId: string;
  contatoId: string;
  conversaId?: string;
  nome: string;
  tipo: TipoMarcaAviso;
  texto?: string;
  vezes?: number;
  venceEm: number;
  criadoEm: number;
  /** quando a marcação foi feita */
  marcadaEm?: number;
  /** a última atualização ("o que foi feito"), se houve */
  ult?: { texto: string; por?: string; porNome?: string; em: number };
}
/** a ordem do meio da tela (a mesma do banco): os do mesmo cliente juntos, o cliente que venceu primeiro na frente */
export function ordemDasVencidas<T extends Pick<AvisoVencida, 'id' | 'contatoId' | 'venceEm'>>(lista: T[]): T[] {
  const primeiro = new Map<string, number>();
  for (const a of lista) primeiro.set(a.contatoId, Math.min(primeiro.get(a.contatoId) ?? Infinity, a.venceEm));
  return [...lista].sort((x, y) => (primeiro.get(x.contatoId)! - primeiro.get(y.contatoId)!)
    || (x.contatoId < y.contatoId ? -1 : x.contatoId > y.contatoId ? 1 : 0)
    || x.venceEm - y.venceEm || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
}
/** a fila (ficha, +1, tirar, tirar da fila) mexeu numa marcação: o aviso dela que já estava na tela sai na hora (sem
    esperar a próxima leitura). `ate` = o vencimento de antes (o aviso de um vencimento NOVO, mais tarde, vale) */
export const EVENTO_MARCACAO_MEXIDA = 'atenvo:fila-iris-marcacao-mexida';
export interface MarcacaoMexida { marcacaoId: string; ate: number }
export function avisarMarcacaoMexida(lista: MarcacaoMexida[]): void {
  if (!lista.length || typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<MarcacaoMexida[]>(EVENTO_MARCACAO_MEXIDA, { detail: lista }));
}
/** a fila começou a mexer nessas marcações (o pedido está indo ao banco): os avisos delas esperam a resposta, mesmo
    com a rede lenta — deu certo, vem a mexida; `fim` solta (deu errado: o aviso volta, se ainda valer). Nunca fica
    preso: o aviso solta sozinho depois de um tempo */
export const EVENTO_MARCACAO_EM_ANDAMENTO = 'atenvo:fila-iris-marcacao-em-andamento';
export interface MarcacaoEmAndamento { ids: string[]; fim: boolean }
export function avisarMarcacaoEmAndamento(ids: string[], fim = false): void {
  if (!ids.length || typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<MarcacaoEmAndamento>(EVENTO_MARCACAO_EM_ANDAMENTO, { detail: { ids, fim } }));
}
/** "tirada": não há vencimento novo depois */
export const PARA_SEMPRE = Number.MAX_SAFE_INTEGER;
/** como cada saída do aviso terminou (o cartão diz a frase: FRASE_DO_RESULTADO) */
export type ResultadoAviso = 'atualizada' | 'ligacao' | 'tirada' | 'ja_tirada' | 'outro_dono';
/** o nome curto da marcação (o mesmo da coluna Marcações da fila — curtoMarca, em dados.ts) */
export function curtoDaVencida(a: Pick<AvisoVencida, 'tipo' | 'texto' | 'vezes'>): string {
  if (a.tipo === 'nao_atendeu') return (a.vezes ?? 1) > 1 ? `Ligar de novo (${a.vezes}x)` : 'Ligar de novo';
  if (a.tipo === 'recuperar_senha') return 'Recuperar senha do INSS';
  if (a.tipo === 'mandar_senha') return 'Vai mandar a senha do INSS';
  if (a.tipo === 'mandar_doc') return 'Vai mandar documento';
  return `Falta: ${a.texto ?? ''}`;
}
/** os textos do aviso no meio da tela (as 36 h são as de HORAS_MARCACAO, em dados.ts) */
export const TEXTO_VENCIDA = {
  marca: 'Marcação vencida',
  faca: 'Passou de 36 h sem atualizar. Para continuar, diga o que foi feito ou tire a marcação se já resolveu.',
};
