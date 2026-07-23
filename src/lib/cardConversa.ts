/** Regras puras do card compacto da inbox (Bloco 2).
 *  Ficam fora do JSX para poderem ser testadas — o card só desenha o que estas funções decidem. */

/** Sigla do canal para o micro-badge do avatar.
 *  O canal deixou de ser um chip de texto na fileira (ocupava uma vaga em TODO card), mas NÃO pode
 *  sumir: a casa tem vários números (URA, ANDRIUS, RMKT 4/5, OFICIAL) e saber por qual o cliente
 *  entrou decide por onde responder. Por isso sigla curta no avatar + nome completo no tooltip —
 *  compacto sem esconder. Quando há dígito no nome ele entra (RMKT 4 x RMKT 5 precisam se distinguir). */
export function siglaCanal(nome: string | null | undefined): string {
  const n = (nome ?? '').trim();
  if (!n) return '?';
  const letras = n.replace(/[^A-Za-zÀ-ÿ]/g, '');
  const digito = n.match(/\d/)?.[0];
  const inicial = (letras[0] ?? '?').toLocaleUpperCase('pt-BR');
  if (digito) return inicial + digito;
  return (letras.slice(0, 2) || inicial).toLocaleUpperCase('pt-BR');
}

export interface ChipCard {
  key: string;
  cls: string;
  txt: string;
  title: string;
}

/** Teto de chips VISÍVEIS no card. O excedente vira "+N" com tudo no tooltip — nada some do card,
 *  só deixa de gritar. */
export const MAX_CHIPS_VISIVEIS = 2;

/** Corta a fileira de chips por PRIORIDADE SEMÂNTICA, nunca por ordem de array.
 *  A situação é sempre emitida pelo modelo e é o que o atendente lê primeiro — se o corte fosse
 *  por posição, um SLA poderia empurrar a situação para fora. Ordem: situação > urgência > resto. */
export function dividirChips(chips: ChipCard[], max: number = MAX_CHIPS_VISIVEIS): { visiveis: ChipCard[]; ocultos: ChipCard[] } {
  if (chips.length <= max) return { visiveis: chips, ocultos: [] };
  return { visiveis: chips.slice(0, max), ocultos: chips.slice(max) };
}

/** Texto do "+N" (title): lista tudo que ficou oculto, para não esconder problema operacional. */
export function tituloOcultos(ocultos: ChipCard[]): string {
  return ocultos.map((c) => c.txt).join(' · ');
}
