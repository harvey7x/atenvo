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
  // valor por extenso ("mil reais", "quinhentos reais", "5 mil reais") — falso-positivo só custa
  // 1 reescrita, então barramos "reais" em qualquer forma (direção segura p/ compliance)
  { nome: 'valor_extenso', re: /\breais\b|\bconto[s]?\b|\bpila[s]?\b/i },
  // promessa de liberação / prazo ("cai amanhã", "libera hoje", "está garantido")
  { nome: 'liberacao', re: /\b(cai|sai|libera(d[oa]s?)?|deposita(d[oa]s?)?)\s+(em|at[ée]|hoje|amanh[ãa]|na\s+conta)\b/i },
  { nome: 'garantia', re: /\bgarantid[oa]s?\b/i },
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

// Fase 1.1: NÃO existe mais "resposta segura" estática — violação do guardrail pede REESCRITA ao
// modelo (1x); se persistir, a bolha é descartada. Frases fixas no caminho de conversa são
// proibidas (a única permitida é MSG_HANDOFF_FINAL, em prompts.ts).

/** O cliente está perguntando de valores/condições? (gatilho do contador de insistência) */
export function perguntaDeValores(txtCliente: string): boolean {
  const t = (txtCliente ?? '').toLowerCase();
  return /quanto\s+(eu\s+)?(consigo|recebo|sai|libera|vale)|qual\s+(o\s+)?valor|quanto\s+é|quanto\s+fica|\bjuros\b|\btaxa\b|quanto\s+tempo\s+(pra|para)\s+(sair|liberar|receber)|libera\s+quanto/i.test(t);
}
