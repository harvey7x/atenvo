// Gerador puro da ficha judicial (texto para WhatsApp). Sem efeitos; nunca imprime
// undefined/null/NaN nem R$ 0,00; mantém os labels do padrão do escritório.
import { formataMoedaBRL } from './fichaJudicialNormalizers';

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
  dataConsulta?: string; // ISO yyyy-mm-dd
  revisoes?: FichaRevisaoFmt[];
}

export interface FichaFmtOpcoes {
  incluirSenha?: boolean;
  senha?: string;
}

const lim = (s?: string | null) => (s ?? '').toString().trim();
const isoParaBR = (iso?: string) => {
  const m = lim(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : lim(iso);
};
const valorOk = (v?: number | null): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;

const ROTULO_REV: Record<FichaRevisaoFmt['tipo'], string> = {
  agibank: 'AGIBANK', rmc: 'Cartão RMC', rcc: 'Cartão RCC', emprestimo: 'Empréstimo', outro: 'Revisão',
};

// Monta a linha da revisão a partir do ESTADO ATUAL (tipo + banco + código + valor), refletindo edições do
// formulário. descricaoLivre só é usada quando não há banco/código/valor (revisão livre digitada à mão).
function linhaRevisao(r: FichaRevisaoFmt): string {
  const nome = lim(r.bancoNome);
  const cod = lim(r.bancoCodigo);
  const rotulo = ROTULO_REV[r.tipo] ?? 'Revisão';
  // sem nenhum dado estruturado: usa a descrição livre digitada; senão, ao menos o rótulo do tipo.
  if (!nome && !cod && !valorOk(r.valor)) return lim(r.descricaoLivre) || rotulo;

  let linha = rotulo;
  if (nome && cod) linha = `${rotulo}: ${nome} - Cód. ${cod}`;
  else if (nome) linha = `${rotulo}: ${nome}`;
  else if (cod) linha = `${rotulo}: Cód. ${cod}`;
  if (valorOk(r.valor)) linha += ` - Valor: ${formataMoedaBRL(r.valor)}`; // só quando valor válido; nunca "Valor:" vazio
  return linha;
}

/** Gera a ficha no padrão do escritório. Senha só quando opcoes.incluirSenha && opcoes.senha. */
export function formatarFichaJudicial(dados: FichaFmtDados, opcoes: FichaFmtOpcoes = {}): string {
  const cidade = lim(dados.cidade);
  const uf = lim(dados.uf);
  const cidadeLinha = cidade ? (uf ? `${cidade} / ${uf}` : cidade) : '';

  const especie = [lim(dados.especieCodigo), lim(dados.especieDescricao)].filter(Boolean).join(' - ');
  const banco = [lim(dados.bancoCodigo), lim(dados.bancoNome)].filter(Boolean).join(' ');
  const valor = valorOk(dados.valorBeneficio) ? formataMoedaBRL(dados.valorBeneficio) : '';
  const nasc = isoParaBR(dados.nascimento);
  const idadePart = typeof dados.idade === 'number' && Number.isFinite(dados.idade) && dados.idade >= 0 ? `${dados.idade} anos` : '';
  const idadeLinha = [nasc, idadePart].filter(Boolean).join(' - ');
  const data = isoParaBR(dados.dataConsulta);

  const linhas: string[] = [
    'FICHA JUDICIAL',
    '',
    `GERENTE: ${lim(dados.gerenteNome)}`,
    `CIDADE: ${cidadeLinha}`,
    `NOME: ${lim(dados.nome)}`,
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
  ];

  if (opcoes.incluirSenha && lim(opcoes.senha)) linhas.push(`Senha INSS: ${lim(opcoes.senha)}`);

  linhas.push(`DATA: ${data}`);

  const revs = (dados.revisoes ?? []).map(linhaRevisao).filter(Boolean);
  if (revs.length) { linhas.push('', ...revs); }

  return linhas.join('\n');
}
