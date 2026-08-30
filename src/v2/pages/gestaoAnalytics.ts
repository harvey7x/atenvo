/* Módulo Gestão — motor de análise (demonstração determinística, 29/08).
   Fonte única = lista de CONVERSAS; tudo (atendentes, IA, funil) é
   agregado daí, pra ser internamente consistente (ferramenta de gestor
   não pode ter número que não fecha). mulberry32 = seed fixo → estável.
   Ligar dados reais é a fase seguinte (conversas/oportunidades/IA/SLA). */

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const ATENDENTES = ['Augusto', 'Eduardo', 'Junior', 'Garcia', 'Emillyn', 'Paty', 'Alexandra', 'Leandro', 'Marina', 'Rafael'];
export const ORIGENS = ['Oficial 1390', 'Chip LUIZA', 'Chip ANDRIUS', 'Instagram'];
export type Etapa = 'Lead novo' | 'Em atendimento' | 'Documentação' | 'Qualificado' | 'Fechado' | 'Perdido';
export const ETAPAS: Etapa[] = ['Lead novo', 'Em atendimento', 'Documentação', 'Qualificado', 'Fechado', 'Perdido'];
export type Resultado = 'aberto' | 'ganho' | 'perdido';
export const MOTIVOS_PERDA = ['Não elegível', 'Sem resposta humana', 'Sem interesse', 'Achou os juros altos', 'Fechou em outro número'];

const PRIMEIROS = ['Maria', 'José', 'Antônia', 'João', 'Ana', 'Francisco', 'Adriana', 'Carlos', 'Sônia', 'Cícero', 'Neusa', 'Marcos', 'Cláudia', 'Ivone', 'Sebastião', 'Terezinha', 'Geraldo', 'Luzia', 'Pedro', 'Rosa'];
const SOBRENOMES = ['Silva', 'Souza', 'Oliveira', 'Santos', 'Pereira', 'Lima', 'Carvalho', 'Ferreira', 'Rodrigues', 'Almeida', 'Nunes', 'Gomes', 'Ribeiro', 'Martins', 'Rocha'];

export interface Mensagem { de: 'cliente' | 'ia' | 'atendente'; texto: string; hora: string }
export interface Conversa {
  id: string;
  contato: string;
  atendente: string;
  origem: string;
  etapa: Etapa;
  resultado: Resultado;
  primeiraRespostaMin: number;      // tempo até a 1ª resposta humana
  iaParticipou: boolean;
  iaResolveu: boolean;              // IA fechou/qualificou sem humano
  valor: number;                   // se ganho
  motivoPerda: string | null;
  diasAtras: number;               // 0..29
  ultimaMsg: string;
  thread: Mensagem[];
}

const ULT_MSG: Record<Resultado, string[]> = {
  ganho: ['Perfeito, pode seguir então!', 'Fechado, muito obrigada!', 'Combinado, aguardo o contato.'],
  perdido: ['Vou pensar e retorno.', 'Por enquanto não tenho interesse.', 'Já resolvi por outro lugar.'],
  aberto: ['Pode me enviar os documentos?', 'Quanto fica pra mim?', 'Ainda estou com dúvida sobre isso.'],
};

function gerarThread(c: { contato: string; atendente: string; iaParticipou: boolean; resultado: Resultado }): Mensagem[] {
  const t: Mensagem[] = [];
  const nome = c.contato.split(' ')[0];
  t.push({ de: 'cliente', texto: 'Olá, vi o anúncio de vocês sobre o empréstimo.', hora: '09:12' });
  if (c.iaParticipou) {
    t.push({ de: 'ia', texto: `Oi, ${nome}! Que bom te ver por aqui 😊 Me diz: você já tem empréstimo consignado ativo?`, hora: '09:12' });
    t.push({ de: 'cliente', texto: 'Tenho sim, no Agibank.', hora: '09:15' });
  }
  t.push({ de: 'atendente', texto: `Oi ${nome}, aqui é ${c.atendente} da Central. Vou te ajudar a partir daqui.`, hora: '09:20' });
  if (c.resultado === 'ganho') t.push({ de: 'cliente', texto: 'Perfeito, pode seguir então!', hora: '09:41' });
  else if (c.resultado === 'perdido') t.push({ de: 'cliente', texto: 'Vou pensar e retorno depois.', hora: '10:02' });
  else t.push({ de: 'cliente', texto: 'Pode me enviar os documentos?', hora: '09:44' });
  return t;
}

export function seedConversas(): Conversa[] {
  const rnd = mulberry32(20260829);
  const out: Conversa[] = [];
  const N = 320;
  for (let i = 0; i < N; i++) {
    const contato = `${PRIMEIROS[Math.floor(rnd() * PRIMEIROS.length)]} ${SOBRENOMES[Math.floor(rnd() * SOBRENOMES.length)]} ${SOBRENOMES[Math.floor(rnd() * SOBRENOMES.length)]}`;
    const atendente = ATENDENTES[Math.floor(rnd() * ATENDENTES.length)];
    const origem = ORIGENS[Math.floor(rnd() * ORIGENS.length)];
    // etapa ponderada (funil realista)
    const re = rnd();
    const etapa: Etapa = re < 0.16 ? 'Lead novo' : re < 0.34 ? 'Em atendimento' : re < 0.5 ? 'Documentação'
      : re < 0.63 ? 'Qualificado' : re < 0.8 ? 'Fechado' : 'Perdido';
    const resultado: Resultado = etapa === 'Fechado' ? 'ganho' : etapa === 'Perdido' ? 'perdido' : 'aberto';
    const iaParticipou = rnd() < 0.58;
    const iaResolveu = iaParticipou && rnd() < 0.3;    // IA qualificou/fechou sozinha
    const primeiraRespostaMin = Math.max(1, Math.round((iaParticipou ? 2 : 6) + rnd() * (iaParticipou ? 12 : 40)));
    const valor = resultado === 'ganho' ? 1500 + Math.round(rnd() * 40) * 100 : 0;
    const motivoPerda = resultado === 'perdido' ? MOTIVOS_PERDA[Math.floor(rnd() * MOTIVOS_PERDA.length)] : null;
    const diasAtras = Math.floor(rnd() * 30);
    const ultimaMsg = ULT_MSG[resultado][Math.floor(rnd() * ULT_MSG[resultado].length)];
    out.push({
      id: `cv-${i}`, contato, atendente, origem, etapa, resultado, primeiraRespostaMin,
      iaParticipou, iaResolveu, valor, motivoPerda, diasAtras, ultimaMsg,
      thread: gerarThread({ contato, atendente, iaParticipou, resultado }),
    });
  }
  return out;
}

const mediana = (arr: number[]): number => {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};

export interface MetricaAtendente {
  nome: string;
  atendimentos: number;
  primeiraRespMediana: number;
  ganhos: number;
  perdidos: number;
  abertos: number;
  conversao: number;               // ganhos / (ganhos+perdidos)
  valorGanho: number;
  iaRecebidos: number;             // conversas que passaram pela IA antes
  porDia: number[];                // últimos 14 dias
}

export function metricasPorAtendente(convs: Conversa[]): MetricaAtendente[] {
  const map = new Map<string, Conversa[]>();
  for (const c of convs) { const a = map.get(c.atendente) ?? []; a.push(c); map.set(c.atendente, a); }
  return [...map.entries()].map(([nome, cs]) => {
    const ganhos = cs.filter((c) => c.resultado === 'ganho').length;
    const perdidos = cs.filter((c) => c.resultado === 'perdido').length;
    const abertos = cs.filter((c) => c.resultado === 'aberto').length;
    const porDia = Array.from({ length: 14 }, (_, d) => cs.filter((c) => c.diasAtras === 13 - d).length);
    return {
      nome, atendimentos: cs.length,
      primeiraRespMediana: mediana(cs.map((c) => c.primeiraRespostaMin)),
      ganhos, perdidos, abertos,
      conversao: ganhos + perdidos ? Math.round((ganhos / (ganhos + perdidos)) * 100) : 0,
      valorGanho: cs.reduce((s, c) => s + c.valor, 0),
      iaRecebidos: cs.filter((c) => c.iaParticipou).length,
      porDia,
    };
  }).sort((a, b) => b.atendimentos - a.atendimentos);
}

export interface ResumoIA {
  sessoes: number;                 // conversas que a IA tocou
  participacao: number;            // % do total
  resolvidasSozinha: number;       // IA qualificou/fechou sem humano
  taxaResolucao: number;           // % das sessões da IA
  handoffs: number;                // passou pro humano
  conversaoIA: number;             // conversão quando a IA participou
  conversaoHumano: number;         // conversão quando foi só humano
  tempoRespIA: number;             // 1ª resposta mediana com IA
  tempoRespHumano: number;         // sem IA
}

export function resumoIA(convs: Conversa[]): ResumoIA {
  const comIA = convs.filter((c) => c.iaParticipou);
  const semIA = convs.filter((c) => !c.iaParticipou);
  const conv = (cs: Conversa[]) => {
    const g = cs.filter((c) => c.resultado === 'ganho').length;
    const p = cs.filter((c) => c.resultado === 'perdido').length;
    return g + p ? Math.round((g / (g + p)) * 100) : 0;
  };
  const resolvidas = comIA.filter((c) => c.iaResolveu).length;
  return {
    sessoes: comIA.length,
    participacao: convs.length ? Math.round((comIA.length / convs.length) * 100) : 0,
    resolvidasSozinha: resolvidas,
    taxaResolucao: comIA.length ? Math.round((resolvidas / comIA.length) * 100) : 0,
    handoffs: comIA.length - resolvidas,
    conversaoIA: conv(comIA),
    conversaoHumano: conv(semIA),
    tempoRespIA: mediana(comIA.map((c) => c.primeiraRespostaMin)),
    tempoRespHumano: mediana(semIA.map((c) => c.primeiraRespostaMin)),
  };
}

export interface ResumoGeral {
  atendimentos: number;
  ganhos: number;
  perdidos: number;
  abertos: number;
  conversao: number;
  valorGanho: number;
  primeiraRespMediana: number;
  porDia: number[];                // últimos 14 dias
  porEtapa: { etapa: Etapa; n: number }[];
  porOrigem: { origem: string; n: number; ganhos: number }[];
  motivos: { motivo: string; n: number }[];
}

export function resumoGeral(convs: Conversa[]): ResumoGeral {
  const ganhos = convs.filter((c) => c.resultado === 'ganho').length;
  const perdidos = convs.filter((c) => c.resultado === 'perdido').length;
  const abertos = convs.filter((c) => c.resultado === 'aberto').length;
  const porEtapa = ETAPAS.map((etapa) => ({ etapa, n: convs.filter((c) => c.etapa === etapa).length }));
  const porOrigem = ORIGENS.map((origem) => {
    const cs = convs.filter((c) => c.origem === origem);
    return { origem, n: cs.length, ganhos: cs.filter((c) => c.resultado === 'ganho').length };
  }).sort((a, b) => b.n - a.n);
  const motivos = MOTIVOS_PERDA.map((motivo) => ({ motivo, n: convs.filter((c) => c.motivoPerda === motivo).length }))
    .filter((m) => m.n > 0).sort((a, b) => b.n - a.n);
  return {
    atendimentos: convs.length, ganhos, perdidos, abertos,
    conversao: ganhos + perdidos ? Math.round((ganhos / (ganhos + perdidos)) * 100) : 0,
    valorGanho: convs.reduce((s, c) => s + c.valor, 0),
    primeiraRespMediana: mediana(convs.map((c) => c.primeiraRespostaMin)),
    porDia: Array.from({ length: 14 }, (_, d) => convs.filter((c) => c.diasAtras === 13 - d).length),
    porEtapa, porOrigem, motivos,
  };
}

export const TOM_ETAPA: Record<Etapa, 'ok' | 'atencao' | 'erro' | 'neutro'> = {
  'Lead novo': 'neutro', 'Em atendimento': 'atencao', 'Documentação': 'atencao',
  Qualificado: 'atencao', Fechado: 'ok', Perdido: 'erro',
};
