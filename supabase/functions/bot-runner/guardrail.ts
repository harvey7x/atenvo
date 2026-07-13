// Guardrail de saída — trava de CÓDIGO (não depende do modelo se comportar).
// Nenhuma mensagem gerada por IA vai ao cliente sem passar por saidaSuja().
// Puro (sem Deno/DB) → compartilhado com os testes vitest.

// Cada padrão é uma promessa/violação que o Matheo NUNCA pode cometer.
// Obs.: 'quantia' e 'promessa_resultado' foram REFORÇADOS além das regexes-base do brief,
// pra o guardrail barrar a frase do critério de aceite ("o senhor vai receber uns 5 mil reais"):
// as versões originais (\d{2,}; "você vai receber") deixavam essa promessa passar. Barrar
// promessa é sempre o lado seguro — no pior caso cai no copy determinístico.
export const PROIBIDO: { nome: string; re: RegExp }[] = [
  { nome: 'valor_em_reais',    re: /r\$\s*\d/i },                                       // "R$ 5.000"
  { nome: 'quantia',           re: /\b\d+\s*(mil|reais)\b/i },                          // "5 mil", "3000 reais"
  { nome: 'percentual',        re: /\b\d{1,3}\s*%/ },                                   // "30%"
  { nome: 'garantia',          re: /\b(garanto|garantido|garantia de|com certeza voc[êe] (vai|recebe))\b/i },
  { nome: 'promessa_resultado', re: /\b(voc[êe]|o\s+senhor|a\s+senhora)\s+(vai|ir[áa])\s+receber\b/i },
  { nome: 'promessa_prazo',    re: /\bem at[ée]\s*\d+\s*(dias?|semanas?|meses?)\b/i },  // "em até 30 dias"
  { nome: 'credencial',        re: /\b(senha|c[óo]digo de verifica|token)\b/i },        // NUNCA pedir credencial
  { nome: 'escassez_falsa',    re: /\b(última chance|ultima chance|vaga limitada|s[óo] hoje|promo[çc][ãa]o acaba)\b/i },
];

/** Devolve o NOME do primeiro padrão violado (ou null se a saída está limpa). */
export function saidaSuja(txt: string): string | null {
  const t = txt ?? '';
  for (const p of PROIBIDO) if (p.re.test(t)) return p.nome;
  return null;
}
