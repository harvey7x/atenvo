/* Tipos do Manual de vendas. Cada lição (licoes/NN-id.tsx) exporta um `Licao`:
   o corpo da leitura + as perguntas que entram no banco da prova final + os
   termos do glossário + as mensagens prontas da consulta rápida. */
import type { ReactNode } from 'react';

export type ModuloId = 'fundamentos' | 'venda' | 'documentacao' | 'fechamento';
export const MODULOS: { id: ModuloId; titulo: string }[] = [
  { id: 'fundamentos', titulo: 'Fundamentos' },
  { id: 'venda', titulo: 'A venda' },
  { id: 'documentacao', titulo: 'Documentação' },
  { id: 'fechamento', titulo: 'Fechamento' },
];

/** Pergunta de múltipla escolha. `c` = índice da certa; `e` = explicação mostrada depois. */
export type Questao = { p: string; o: string[]; c: number; e: string };
export type Termo = { termo: string; def: string };
/** Mensagem pronta para copiar e colar no WhatsApp. */
export type MensagemPronta = { titulo: string; quando: string; texto: string };

export type Licao = {
  id: string;
  modulo: ModuloId;
  titulo: string;
  resumo: string;
  minutos: number;
  corpo: ReactNode;
  questoes: Questao[];
  glossario: Termo[];
  mensagens: MensagemPronta[];
};

/* Prova final: perguntas sorteadas por tentativa (limitadas ao tamanho do banco) e nota mínima. */
export const PERGUNTAS_POR_PROVA = 15;
export const NOTA_MINIMA_PCT = 80;
