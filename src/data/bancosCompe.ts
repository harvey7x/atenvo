// Mapa COMPE isolado e tipado (códigos usados pelo escritório + alguns conhecidos).
// Sem dados duvidosos; nomes canônicos e aliases para casamento por nome.
import { normalizaComparacao } from '@/lib/fichaJudicialNormalizers';

export interface BancoCompe {
  codigo: string;
  nome: string;
  aliases?: string[];
}

/** Códigos COMPE → banco. Chave = código de 3 dígitos. */
export const BANCOS_COMPE: Record<string, BancoCompe> = {
  '001': { codigo: '001', nome: 'Banco do Brasil', aliases: ['banco do brasil', 'bb'] },
  '033': { codigo: '033', nome: 'Santander', aliases: ['santander', 'banco santander'] },
  '041': { codigo: '041', nome: 'Banrisul', aliases: ['banrisul', 'banco do estado do rio grande do sul'] },
  '104': { codigo: '104', nome: 'Caixa Econômica Federal', aliases: ['caixa', 'cef', 'caixa economica federal'] },
  '121': { codigo: '121', nome: 'Agibank', aliases: ['agibank', 'agi', 'banco agibank'] },
  '237': { codigo: '237', nome: 'Bradesco', aliases: ['bradesco', 'banco bradesco'] },
  '318': { codigo: '318', nome: 'Banco BMG', aliases: ['bmg', 'banco bmg'] },
  '341': { codigo: '341', nome: 'Itaú', aliases: ['itau', 'banco itau'] },
  '623': { codigo: '623', nome: 'Banco Pan', aliases: ['pan', 'banco pan', 'panamericano'] },
  '707': { codigo: '707', nome: 'Banco Daycoval', aliases: ['daycoval', 'banco daycoval'] },
  '739': { codigo: '739', nome: 'Cetelem', aliases: ['cetelem', 'banco cetelem'] },
  '756': { codigo: '756', nome: 'Sicoob', aliases: ['sicoob', 'bancoob', 'banco cooperativo do brasil'] },
  '935': { codigo: '935', nome: 'Facta Financeira', aliases: ['facta', 'facta financeira'] },
};

/** Busca por código exato (3 dígitos). */
export function bancoPorCodigo(codigo: string): BancoCompe | undefined {
  return BANCOS_COMPE[(codigo || '').padStart(3, '0')];
}

/** Busca por nome/alias (comparação sem acento/caixa). Retorna o banco se o nome bater. */
export function bancoPorNome(nome: string): BancoCompe | undefined {
  const n = normalizaComparacao(nome);
  if (!n) return undefined;
  for (const b of Object.values(BANCOS_COMPE)) {
    if (normalizaComparacao(b.nome) === n) return b;
    if (b.aliases?.some((a) => a === n)) return b;
  }
  // casamento parcial por alias (ex.: "recebe no agibank" contém "agibank")
  for (const b of Object.values(BANCOS_COMPE)) {
    if (b.aliases?.some((a) => a.length >= 3 && n.includes(a))) return b;
  }
  return undefined;
}
