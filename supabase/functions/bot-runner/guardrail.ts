// Guardrail de saída — trava de CÓDIGO (não depende do modelo se comportar).
// Nenhuma mensagem gerada por IA vai ao cliente sem passar por saidaSuja().
// Puro (sem Deno/DB) → compartilhado com os testes vitest.
//
// REGRA POR TIPO:
//  - NÚMERO (quantia/percentual/prazo/valor): barra SEMPRE, mesmo em negação — não se cita número.
//  - PROMESSA/AFIRMAÇÃO/CREDENCIAL: barra só se a FRASE não tiver negação (não|nunca|jamais|sem).
//    Motivo: "eu NÃO peço senha, não acesso seu Meu INSS" e "NÃO dá pra dizer quanto o senhor
//    vai receber sem analisar" são as frases que DESARMAM o golpe / respondem a objeção —
//    barrá-las mata a venda. A negação torna a frase segura.

// número por extenso (escapa de \d+): "cinco mil reais", "quinze dias"
const NUM_EXTENSO = 'um|uma|dois|duas|tr[êe]s|quatro|cinco|seis|sete|oito|nove|dez|quinze|vinte|trinta|quarenta|cinquenta|cem|cento|duzentos|trezentos|quatrocentos|quinhentos|mil|milh[ãa]o|milh[õo]es';

// Barra SEMPRE (mesmo com negação) — citar número é proibido em qualquer contexto.
const SEMPRE: { nome: string; re: RegExp }[] = [
  { nome: 'valor_em_reais',  re: /r\$\s*\d/i },                                             // "R$ 5.000"
  { nome: 'quantia',         re: /\b\d+\s*(mil|reais)\b/i },                                // "5 mil", "3000 reais"
  { nome: 'quantia_extenso', re: new RegExp(`\\b(${NUM_EXTENSO})\\s+(mil|reais)\\b`, 'i') }, // "cinco mil reais"
  { nome: 'percentual',      re: /\b\d{1,3}\s*%|\bpor\s*cento\b/i },                        // "30%", "trinta por cento"
  { nome: 'prazo',           re: new RegExp(`\\b(\\d+|${NUM_EXTENSO}|alguns|algumas|poucos|poucas)\\s+(dias?|semanas?|meses?|m[êe]s)\\b`, 'i') },
];

// Barra SÓ SEM negação na frase — promessa/afirmação/credencial.
const SEM_NEGACAO: { nome: string; re: RegExp }[] = [
  { nome: 'garantia',           re: /\b(garanto|garantido|garantia de|com certeza voc[êe] (vai|recebe))\b/i },
  { nome: 'promessa_resultado', re: /\b(voc[êe]|o\s+senhor|a\s+senhora)\s+(vai|ir[áa])\s+receber\b/i },
  { nome: 'afirma_direito',     re: /\b(tem|teria|possui)\s+direito\s+(a|ao|à|de\s+receber)\b/i },
  { nome: 'afirma_vitima',      re: /\b(voc[êe]|o\s+senhor|a\s+senhora)\s+(foi|[ée])\s+v[íi]tima\b/i },
  { nome: 'credencial',         re: /\b(senha|c[óo]digo|token|2fa)\b/i },
];

// Uma frase é "segura" pra promessa/credencial se contém negação.
const NEGACAO = /\b(n[ãa]o|nunca|jamais|sem)\b/i;
const frasesDe = (txt: string): string[] => (txt ?? '').split(/[.!?|\n]+/).map((s) => s.trim()).filter(Boolean);

/** Devolve o NOME do primeiro padrão violado (ou null se a saída está limpa). */
export function saidaSuja(txt: string): string | null {
  const t = txt ?? '';
  // 1) número → barra no texto inteiro, com ou sem negação
  for (const p of SEMPRE) if (p.re.test(t)) return p.nome;
  // 2) promessa/credencial → por frase; ignora a frase que tem negação (é a que desarma o golpe)
  for (const frase of frasesDe(t)) {
    if (NEGACAO.test(frase)) continue;
    for (const p of SEM_NEGACAO) if (p.re.test(frase)) return p.nome;
  }
  return null;
}
