// Gerador puro da ficha judicial (texto para WhatsApp). Sem efeitos; nunca imprime
// undefined/null/NaN nem R$ 0,00; layout FIXO — mesmas linhas, mesma ordem, sempre.
import { formataMoedaBRL } from './fichaJudicialNormalizers';
import { encurtarNomeBanco, resolverBancoFicha } from '@/data/bancosFicha';

export interface FichaRevisaoFmt {
  tipo: 'agibank' | 'rmc' | 'rcc' | 'emprestimo' | 'outro';
  bancoCodigo?: string;
  bancoNome?: string;
  valor?: number;
  descricaoLivre?: string;
}

export interface FichaFmtDados {
  gerenteNome?: string;
  cidade?: string;
  uf?: string;
  nome?: string;
  beneficioNumero?: string;
  especieCodigo?: string;
  especieDescricao?: string;
  bancoCodigo?: string;
  bancoNome?: string;
  valorBeneficio?: number | null;
  cpf?: string;
  rg?: string;
  nascimento?: string; // ISO yyyy-mm-dd
  idade?: number | null;
  telefone?: string;
  estadoCivil?: string;
  email?: string;
  dataConsulta?: string; // ISO yyyy-mm-dd — sai como DATA
  revisoes?: FichaRevisaoFmt[];
}

export interface FichaFmtOpcoes {
  /** Inclui a senha do INSS na linha "INSS:" (só na cópia; nunca é salva). */
  incluirSenha?: boolean;
  senha?: string;
}

const lim = (s?: string | null) => (s ?? '').toString().trim();
const isoParaBR = (iso?: string) => {
  const m = lim(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : lim(iso);
};
const valorOk = (v?: number | null): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;

/** Ordem fixa das REVs: empréstimos, depois RMC, depois RCC. */
const ORDEM: Record<FichaRevisaoFmt['tipo'], number> = { emprestimo: 0, agibank: 0, rmc: 1, rcc: 2, outro: 3 };
const PREFIXO: Record<FichaRevisaoFmt['tipo'], string> = { emprestimo: 'REV', agibank: 'REV', rmc: 'REV RMC', rcc: 'REV RCC', outro: 'REV' };

/**
 * Linha de revisão no padrão do escritório: "REV RMC BANRISUL" (nunca "Cartão RMC: <razão social>").
 * Sem banco identificado não há linha — melhor faltar do que sair "REV RMC" sozinho.
 * Valor entra só quando existir: "REV RMC BMG - R$ 55,00".
 */
function linhaRevisao(r: FichaRevisaoFmt): string {
  // banco conhecido → nome curto da tabela; desconhecido (digitado à mão) → encurta a razão social
  const conhecido = resolverBancoFicha(r.bancoCodigo, r.bancoNome);
  const nome = (conhecido?.conhecido ? conhecido.nomeCurto : encurtarNomeBanco(lim(r.bancoNome))).toUpperCase();
  if (!nome) return '';
  const base = `${PREFIXO[r.tipo] ?? 'REV'} ${nome}`;
  return valorOk(r.valor) ? `${base} - ${formataMoedaBRL(r.valor)}` : base;
}

/** Gera a ficha no padrão do escritório. Senha do INSS só quando opcoes.incluirSenha && opcoes.senha. */
export function formatarFichaJudicial(dados: FichaFmtDados, opcoes: FichaFmtOpcoes = {}): string {
  const cidade = lim(dados.cidade).toUpperCase();
  const uf = lim(dados.uf).toUpperCase();
  const cidadeLinha = cidade ? (uf ? `${cidade} / ${uf}` : cidade) : '';

  const especie = [lim(dados.especieCodigo), lim(dados.especieDescricao)].filter(Boolean).join(' - ');
  const banco = [lim(dados.bancoCodigo), lim(dados.bancoNome)].filter(Boolean).join(' ');
  const valor = valorOk(dados.valorBeneficio) ? formataMoedaBRL(dados.valorBeneficio) : '';
  const nasc = isoParaBR(dados.nascimento);
  const idadePart = typeof dados.idade === 'number' && Number.isFinite(dados.idade) && dados.idade >= 0 ? `${dados.idade} anos` : '';
  const idadeLinha = [nasc, idadePart].filter(Boolean).join(' - ');
  const inss = opcoes.incluirSenha ? lim(opcoes.senha) : '';

  const linhas: string[] = [
    'FICHA JUDICIAL',
    '',
    `GERENTE: ${lim(dados.gerenteNome)}`,
    `CIDADE: ${cidadeLinha}`,
    `NOME: ${lim(dados.nome).toUpperCase()}`,
    `BENEFÍCIO: ${lim(dados.beneficioNumero)}`,
    `ESPÉCIE: ${especie}`,
    `RECEBE O BENEFICIO: ${banco}`,
    `VALOR BENEFICIO: ${valor}`,
    `CPF: ${lim(dados.cpf)}`,
    `RG: ${lim(dados.rg)}`,
    `IDADE: ${idadeLinha}`,
    `TELEFONE: ${lim(dados.telefone)}`,
    `ESTADO CIVIL: ${lim(dados.estadoCivil)}`,
    `EMAIL: ${lim(dados.email)}`,
    `INSS: ${inss}`,
    `DATA: ${isoParaBR(dados.dataConsulta)}`,
  ];

  const revs = [...(dados.revisoes ?? [])]
    .sort((a, b) => (ORDEM[a.tipo] ?? 9) - (ORDEM[b.tipo] ?? 9))
    .map(linhaRevisao)
    .filter(Boolean);
  if (revs.length) linhas.push('', ...revs);

  // campo vazio sai como "RG:" (sem espaço solto no fim da linha)
  return linhas.map((l) => l.replace(/\s+$/, '')).join('\n');
}
