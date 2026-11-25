/* O QUE HÁ DE NOVO nesta prévia (25/11, dono: "os HTML que tu tá mandando estão desatualizados, é o mesmo do sistema
   atual"). Lê a MESMA lista da página Atendimento › O que mudou (src/v2/data/novidades.ts): na prévia aparecem todas.
   A lista abre sozinha a cada versão nova (a versão é a lista de ids) e cada item leva direto ao lugar. */
import { NOVIDADES as LISTA } from '@/v2/data/novidades';

export interface Novidade { titulo: string; onde: string; texto: string; ir: string; quando: string }
export const NOVIDADES: Novidade[] = LISTA.map((n) => ({ titulo: n.titulo, onde: n.onde, texto: n.texto, quando: n.quando, ir: '#' + n.rota }));
export const NOVIDADES_VERSAO = LISTA.map((n) => n.id).join('|');
