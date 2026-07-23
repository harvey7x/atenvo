// Normalização de bancos PARA A FICHA JUDICIAL (nome curto do escritório).
// Fonte única do "RECEBE O BENEFICIO: 756 Sicoob" e do "REV RMC BANRISUL".
// Nunca sai nome jurídico ("BANCO DO ESTADO DO RIO GRANDE DO SUL SA", "FACTA FINANCEIRA S/A").
import { normalizaComparacao } from '@/lib/fichaJudicialNormalizers';

export interface BancoFicha {
  /** Código como deve SAIR na ficha (33, não 033; 41, não 041). */
  codigo: string;
  /** Códigos aceitos na ENTRADA (com/sem zero à esquerda; comparados sem zeros). */
  codigosEntrada: string[];
  /** Nome curto como deve SAIR na ficha e nas REVs. */
  nomeCurto: string;
  /** Padrões que casam o NOME do banco no texto colado (texto já normalizado). */
  padroes: RegExp[];
}

/** Tabela do escritório. Ordem = prioridade de casamento por nome (primeiro que casa vence). */
export const BANCOS_FICHA: BancoFicha[] = [
  { codigo: '756', codigosEntrada: ['756'], nomeCurto: 'Sicoob', padroes: [/\bsicoob\b/, /\bbancoob\b/, /\bbanco cooperativo\b/] },
  { codigo: '121', codigosEntrada: ['121'], nomeCurto: 'AGIBANK', padroes: [/\bagibank\b/] },
  // 934/AGIPLAN é o nome anterior do Agibank — mesma instituição, mesma REV.
  { codigo: '934', codigosEntrada: ['934'], nomeCurto: 'AGIBANK', padroes: [/\bagiplan\b/] },
  { codigo: '318', codigosEntrada: ['318'], nomeCurto: 'BMG', padroes: [/\bbmg\b/] },
  { codigo: '623', codigosEntrada: ['623'], nomeCurto: 'PAN', padroes: [/\bpan\b/, /\bpanamericano\b/] },
  { codigo: '935', codigosEntrada: ['935'], nomeCurto: 'FACTA', padroes: [/\bfacta\b/] },
  { codigo: '41', codigosEntrada: ['041', '41'], nomeCurto: 'BANRISUL', padroes: [/\bbanrisul\b/, /banco do estado do rio grande do sul/] },
  { codigo: '33', codigosEntrada: ['033', '33'], nomeCurto: 'SANTANDER', padroes: [/\bsantander\b/] },
  { codigo: '104', codigosEntrada: ['104'], nomeCurto: 'CAIXA', padroes: [/\bcaixa\b/, /\bcef\b/] },
  { codigo: '237', codigosEntrada: ['237'], nomeCurto: 'BRADESCO', padroes: [/\bbradesco\b/] },
  { codigo: '341', codigosEntrada: ['341'], nomeCurto: 'ITAÚ', padroes: [/\bitau\b/] },
  { codigo: '389', codigosEntrada: ['389'], nomeCurto: 'MERCANTIL', padroes: [/\bmercantil\b/] },
  { codigo: '336', codigosEntrada: ['336', '626'], nomeCurto: 'C6', padroes: [/\bc6\b/] },
  { codigo: '001', codigosEntrada: ['001', '1'], nomeCurto: 'BANCO DO BRASIL', padroes: [/\bbanco do brasil\b/] },
  { codigo: '069', codigosEntrada: ['069', '69'], nomeCurto: 'CREFISA', padroes: [/\bcrefisa\b/] },
  { codigo: '707', codigosEntrada: ['707'], nomeCurto: 'DAYCOVAL', padroes: [/\bdaycoval\b/] },
  { codigo: '739', codigosEntrada: ['739'], nomeCurto: 'CETELEM', padroes: [/\bcetelem\b/] },
  { codigo: '029', codigosEntrada: ['029', '29'], nomeCurto: 'ITAÚ CONSIGNADO', padroes: [/\bitau consignado\b/] },
  { codigo: '012', codigosEntrada: ['012', '12'], nomeCurto: 'INBURSA', padroes: [/\binbursa\b/] },
  // "BANCO P" aparece assim no Promosys; sai apenas como "P".
  { codigo: '', codigosEntrada: [], nomeCurto: 'P', padroes: [/^banco p$/] },
];

const semZeros = (c: string) => (c || '').replace(/\D/g, '').replace(/^0+/, '') || '';

/** Busca pelo código (aceita 033/33/41/041). */
export function bancoFichaPorCodigo(codigo?: string | null): BancoFicha | undefined {
  const alvo = semZeros(codigo ?? '');
  if (!alvo) return undefined;
  return BANCOS_FICHA.find((b) => b.codigosEntrada.some((c) => semZeros(c) === alvo));
}

/** Busca pelo nome/razão social (comparação sem acento/caixa, por padrão da tabela). */
export function bancoFichaPorNome(nome?: string | null): BancoFicha | undefined {
  const n = normalizaComparacao(nome ?? '');
  if (!n) return undefined;
  return BANCOS_FICHA.find((b) => b.padroes.some((p) => p.test(n)));
}

// Sufixos/termos jurídicos removidos quando o banco NÃO está na tabela.
const LIXO_RAZAO_SOCIAL = /\b(s\/?\.?a\.?|ltda\.?|me|epp|cia\.?|companhia|financeira|de credito financiamento e investimento|credito financiamento e investimento|c\.?f\.?i\.?|banco multiplo|sociedade de credito|instituicao de pagamento)\b/gi;

/** Encurta um nome desconhecido: tira "BANCO ", sufixos societários e pontuação sobrando. */
export function encurtarNomeBanco(nome?: string | null): string {
  let s = (nome ?? '').replace(/\s+/g, ' ').trim();
  if (!s) return '';
  s = s.replace(LIXO_RAZAO_SOCIAL, ' ');
  s = s.replace(/^\s*banco(?:\s+do|\s+de|\s+da)?\s+/i, '');
  s = s.replace(/[\s.,;:/–—-]+$/g, '').replace(/\s+/g, ' ').trim();
  return s.toUpperCase();
}

export interface BancoResolvido { codigo: string; nomeCurto: string; conhecido: boolean }

/**
 * Resolve um banco a partir do que veio no texto (código e/ou nome).
 * Nome tem prioridade sobre código (o Promosys às vezes traz código do consignado, não COMPE).
 * Banco fora da tabela: mantém o código como veio e encurta o nome — nunca a razão social inteira.
 */
export function resolverBancoFicha(codigo?: string | null, nome?: string | null): BancoResolvido | undefined {
  const porNome = bancoFichaPorNome(nome);
  if (porNome) return { codigo: porNome.codigo, nomeCurto: porNome.nomeCurto, conhecido: true };
  const porCodigo = bancoFichaPorCodigo(codigo);
  if (porCodigo) return { codigo: porCodigo.codigo, nomeCurto: porCodigo.nomeCurto, conhecido: true };
  const curto = encurtarNomeBanco(nome);
  const cod = (codigo ?? '').replace(/\D/g, ''); // banco fora da tabela: código sai como veio (007 continua 007)
  if (!curto && !cod) return undefined;
  return { codigo: cod, nomeCurto: curto, conhecido: false };
}

/**
 * Bancos cujo EMPRÉSTIMO/contrato vira REV (linha "REV <banco>").
 * Contrato de outro banco (Santander, Facta, …) NÃO gera REV de empréstimo — só cartão gera RMC/RCC.
 */
export const BANCOS_REV_EMPRESTIMO = new Set(['AGIBANK', 'BMG']);
