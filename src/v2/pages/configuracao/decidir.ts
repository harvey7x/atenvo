/* Configuração inicial — QUEM VÊ O QUÊ (decisão do dono). Função PURA:
   papel × estado × isento × erro × modo → o que o gate renderiza.
   · 'assistente'   admin, gestor, cadastro e financeiro: fazem TODAS as etapas
                    (pagar, cadastrar a planilha, conectar o WhatsApp);
   · 'espera'       comercial (e quem está sem papel ativo): tela de espera;
   · 'aviso-isento' contas de suporte: entram com aviso discreto;
   · 'nada'         configuração concluída / inativa / carregando / com erro
                    (FAIL-OPEN: falha nossa nunca tranca o escritório). */
import type { Papel } from '../../data/cobranca/types';
import type { StatusConfiguracao } from '../../data/cobranca/configuracao';

export type DecisaoConfiguracao = 'nada' | 'espera' | 'assistente' | 'aviso-isento';

/** papéis que veem o assistente e podem concluir as três etapas */
export const PAPEIS_ASSISTENTE: readonly Papel[] = ['admin', 'gestor', 'cadastro', 'financeiro'];

export interface EntradaDecisao {
  /** instância do build: reviza (real), demo (localStorage) ou outro (Atenvo) */
  modo: 'reviza' | 'demo' | 'outro';
  /** há cenário de prévia ativo na querystring (só DEV/demo) */
  previa: boolean;
  /** undefined = ainda carregando */
  status: StatusConfiguracao | undefined;
  /** erro ao ler o estado ou o papel */
  erro: boolean;
  /** undefined = carregando; null = sem papel ativo */
  papel: Papel | null | undefined;
  isento: boolean;
}

export function decidirConfiguracao(e: EntradaDecisao): DecisaoConfiguracao {
  if (e.erro) return 'nada';
  // sem prévia, só a instância Reviza tem configuração inicial (demo e Atenvo: nunca)
  if (!e.previa && e.modo !== 'reviza') return 'nada';
  if (e.status !== 'pendente') return 'nada'; // carregando, inativo (sem backend) ou concluída
  if (e.isento) return 'aviso-isento';
  if (e.papel === undefined) return 'nada'; // não pisca a tela de espera enquanto o papel carrega
  if (e.papel !== null && PAPEIS_ASSISTENTE.includes(e.papel)) return 'assistente';
  return 'espera';
}
