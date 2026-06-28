// Helpers puros e testáveis para o parser da ficha judicial. Sem rede, sem DOM, sem efeitos.

const COMBINING = /[\u0300-\u036f]/g;
// caracteres invisíveis perigosos (zero-width, BOM, separadores), preservando \n e \t
const INVISIVEIS = /[\u200B-\u200D\uFEFF\u2060\u00AD\u200E\u200F\u202A-\u202E]/g;

/** Remove acentos e baixa a caixa — apenas para comparação. */
export function normalizaComparacao(s: string): string {
  return (s || '').normalize('NFD').replace(COMBINING, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Só os dígitos de uma string. */
export function somenteDigitos(s: string): string {
  return (s || '').replace(/\D/g, '');
}

/** Valida CPF pelos dígitos verificadores (rejeita repetidos). */
export function cpfValido(s: string): boolean {
  const d = somenteDigitos(s);
  if (d.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(d)) return false;
  let soma = 0;
  for (let i = 0; i < 9; i++) soma += Number(d[i]) * (10 - i);
  let r = (soma * 10) % 11;
  if (r === 10) r = 0;
  if (r !== Number(d[9])) return false;
  soma = 0;
  for (let i = 0; i < 10; i++) soma += Number(d[i]) * (11 - i);
  r = (soma * 10) % 11;
  if (r === 10) r = 0;
  return r === Number(d[10]);
}

/** Formata CPF (11 dígitos) como 000.000.000-00; caso contrário devolve os dígitos. */
export function normalizaCpf(s: string): string {
  const d = somenteDigitos(s);
  if (d.length !== 11) return d;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

/** Normaliza telefone BR para 10/11 dígitos (remove DDI 55 quando aplicável). '' se inválido. */
export function normalizaTelefone(s: string): string {
  let d = somenteDigitos(s);
  if (d.length >= 12 && d.startsWith('55')) d = d.slice(2);
  if (d.length !== 10 && d.length !== 11) return '';
  return d;
}

/** Telefone BR com máscara a partir de 10/11 dígitos. */
export function formataTelefoneBR(s: string): string {
  const d = normalizaTelefone(s);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return somenteDigitos(s);
}

/** Converte "1.234,56" / "1234,56" / "1234.56" em number. undefined se não houver número. */
export function parseMoedaBRL(s: string): number | undefined {
  if (!s) return undefined;
  const m = s.match(/-?\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|-?\d+(?:[.,]\d{1,2})?/);
  if (!m) return undefined;
  let t = m[0];
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.'); // formato BR
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

/** Moeda BRL para exibição. */
export function formataMoedaBRL(n: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
}

/** "dd/mm/aaaa" → "yyyy-mm-dd" (validado, sem timezone). undefined se inválida. */
export function parseDataBR(s: string): string | undefined {
  const m = (s || '').match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return undefined;
  const dd = Number(m[1]), mm = Number(m[2]), yyyy = Number(m[3]);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31 || yyyy < 1900 || yyyy > 2200) return undefined;
  const diasNoMes = [31, (yyyy % 4 === 0 && (yyyy % 100 !== 0 || yyyy % 400 === 0)) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (dd > diasNoMes[mm - 1]) return undefined;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/** Idade em anos entre nascimento e referência (ambos "yyyy-mm-dd"). undefined se inválido. */
export function calculaIdade(nascimentoISO: string, refISO?: string): number | undefined {
  const n = (nascimentoISO || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!n) return undefined;
  let ry: number, rm: number, rd: number;
  const r = (refISO || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (r) { ry = Number(r[1]); rm = Number(r[2]); rd = Number(r[3]); }
  else { const hoje = new Date(); ry = hoje.getFullYear(); rm = hoje.getMonth() + 1; rd = hoje.getDate(); }
  const ny = Number(n[1]), nm = Number(n[2]), nd = Number(n[3]);
  let idade = ry - ny;
  if (rm < nm || (rm === nm && rd < nd)) idade--;
  return idade >= 0 && idade < 150 ? idade : undefined;
}

/** Linhas limpas: CRLF→\n, remove invisíveis, colapsa espaços intra-linha (preserva TAB), trim por linha, remove excesso de linhas vazias. */
export function linhasLimpas(raw: string): string {
  const semCR = (raw || '').replace(/\r\n?/g, '\n').replace(INVISIVEIS, '');
  const linhas = semCR.split('\n').map((l) => l.replace(/[^\S\t\n]+/g, ' ').replace(/ *\t */g, '\t').replace(/\s+$/g, ''));
  // colapsa 3+ linhas vazias em no máximo 1
  const out: string[] = [];
  let vazias = 0;
  for (const l of linhas) {
    if (l.trim() === '') { vazias++; if (vazias > 1) continue; } else vazias = 0;
    out.push(l);
  }
  return out.join('\n').replace(/^\n+|\n+$/g, '');
}

/** Valor após um rótulo: na mesma linha após ':' ou, se vazio, a próxima linha não-vazia. */
export function linhaAposRotulo(linhas: string[], rotuloNorm: string): string | undefined {
  for (let i = 0; i < linhas.length; i++) {
    const norm = normalizaComparacao(linhas[i]);
    if (!norm.startsWith(rotuloNorm)) continue;
    const idx = linhas[i].indexOf(':');
    if (idx >= 0) {
      const apos = linhas[i].slice(idx + 1).trim();
      if (apos) return apos;
    }
    for (let j = i + 1; j < linhas.length; j++) {
      if (linhas[j].trim()) return linhas[j].trim();
    }
  }
  return undefined;
}

/** Células de uma linha por TAB (trim em cada). */
export function celulasTab(linha: string): string[] {
  return (linha || '').split('\t').map((c) => c.trim());
}

/** Redige credenciais (Senha INSS / Meu INSS / gov.br / GOV / Senha:) preservando o rótulo. */
export function redigeCredenciais(texto: string): string {
  if (!texto) return texto;
  let t = texto.replace(/(senha(?:[ \t]+(?:meu[ \t]+inss|inss|gov\.?br|gov))?[ \t]*:)[^\n]*/gi, '$1 [REMOVIDA]');
  t = t.replace(/(senha[ \t]+(?:meu[ \t]+inss|inss|gov\.?br|gov))\b(?![ \t]*:)[^\n]*/gi, '$1: [REMOVIDA]');
  return t;
}
