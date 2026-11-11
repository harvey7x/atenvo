/* Cancelados (mig 79, dono 27/10): rótulos do status — o mesmo texto na aba, na conversa e nos avisos */
import type { StatusCancelamento } from './types';

export const ROTULO_CANCELAMENTO: Record<StatusCancelamento, string> = {
  cancelado: 'Cancelado',
  em_reativacao: 'Em processo de reativação',
  reativado: 'Desconto reativado',
};
/** cor do selo: cancelado = erro, reativando = atenção, reativado = ok */
export const TOM_CANCELAMENTO: Record<StatusCancelamento, 'erro' | 'atencao' | 'ok'> = {
  cancelado: 'erro',
  em_reativacao: 'atencao',
  reativado: 'ok',
};
export const STATUS_CANCELAMENTO: StatusCancelamento[] = ['cancelado', 'em_reativacao', 'reativado'];
