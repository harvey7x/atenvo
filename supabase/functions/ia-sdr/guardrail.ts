// Guardrail PÓS-Gemini da IA SDR — trava de CÓDIGO (não depende do modelo se comportar).
// NENHUMA mensagem gerada por IA vai ao cliente sem passar por saidaProibida().
//
// Lista do contrato (inegociável): R$, %, "taxa", "juros", "margem", "aprovado", "reprovado" e
// nome de banco. Diferente do guardrail do bot-runner (saidaSuja), aqui NÃO barramos "senha" —
// a etapa do gov.br PERGUNTA se a pessoa tem a senha (nunca pede a senha); barrar a palavra
// mataria a etapa 5. Puro (sem Deno/DB).

// Nomes com palavra comum ("caixa", "master", "pan") exigem contexto de banco para não barrar
// conversa normal ("caixa de som"). Os distintivos entram sozinhos.
const BANCOS_DISTINTIVOS = [
  'agibank', 'bmg', 'crefisa', 'mercantil', 'facta', 'bradesco', 'itau', 'itaú', 'santander',
  'banrisul', 'daycoval', 'inbursa', 'sicoob', 'sicredi', 'safra', 'banco do brasil', 'c6',
  'ole consignado', 'olé consignado', 'banco pan', 'banco master', 'caixa economica', 'caixa econômica',
];

const REGRAS: Array<{ nome: string; re: RegExp }> = [
  { nome: 'valor_reais', re: /r\$/i },
  { nome: 'percentual', re: /\d+\s*(,\d+)?\s*%|\bpor\s*cento\b/i },
  { nome: 'taxa', re: /\btaxas?\b/i },
  { nome: 'juros', re: /\bjuros\b/i },
  { nome: 'margem', re: /\bmargem\b|\bmargens\b/i },
  { nome: 'aprovacao', re: /\baprovad[oa]s?\b|\breprovad[oa]s?\b/i },
];

/** Devolve o NOME da primeira violação (ou null se a saída está limpa). */
export function saidaProibida(txt: string): string | null {
  const t = txt ?? '';
  for (const r of REGRAS) if (r.re.test(t)) return r.nome;
  const norm = t.normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase();
  for (const b of BANCOS_DISTINTIVOS) {
    const bn = b.normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase();
    if (new RegExp(`(^|[^a-z0-9])${bn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z0-9])`).test(norm)) {
      return `banco:${bn}`;
    }
  }
  return null;
}

/** Resposta única e segura quando o guardrail barra (ou quando o cliente pergunta de valores). */
export const RESPOSTA_SEGURA =
  'Sobre valores e condições, quem vai trazer todos os detalhes é o nosso especialista, na análise final. Vamos só terminar essa parte dos documentos, tá bom? 😊';

/** O cliente está perguntando de valores/condições? (gatilho do contador de insistência) */
export function perguntaDeValores(txtCliente: string): boolean {
  const t = (txtCliente ?? '').toLowerCase();
  return /quanto\s+(eu\s+)?(consigo|recebo|sai|libera|vale)|qual\s+(o\s+)?valor|quanto\s+é|quanto\s+fica|\bjuros\b|\btaxa\b|quanto\s+tempo\s+(pra|para)\s+(sair|liberar|receber)|libera\s+quanto/i.test(t);
}
