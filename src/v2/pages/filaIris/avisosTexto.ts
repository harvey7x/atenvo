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
    curto: 'completo, falta fechar', prioridade: 'Prioridade 1 · Quentes',
  },
  documentacao: {
    faca: 'Faltou documentação e o cliente não respondeu. Ajude ele a resolver.',
    curto: 'faltou documentação', prioridade: 'Prioridade 2 · Documentação',
  },
  sem_resposta: {
    faca: 'O cliente ficou sem resposta. Faça um remarketing com ele.',
    curto: 'ficou sem resposta', prioridade: 'Prioridade 3 · Sem resposta',
  },
};
