/* ------------------------------------------------------------------
   Instância Reviza — adaptador de análise: converte a base REAL
   (Dados: competências + linhas da planilha) para as MESMAS formas
   que a demo usa (ClienteAnalise / ResumoCarteira / MetricaCiclo /
   MetricaAtendente / LinhaAtendente). Assim o Painel e o Atendentes
   renderizam o MESMO markup da demo, só que com números reais.
   ------------------------------------------------------------------ */
import {
  estadoCelula,
  type ClienteAnalise, type Comportamento, type TipoMsg,
  type MetricaAtendente, type MetricaCiclo, type ResumoCarteira,
} from './cobrancaAnalytics';
import type { LinhaAtendente } from './cobrancaMotor';
import type { Dados, GLinha } from '../data/cobranca/types';
import { pctNoMes, type HistComissao } from '../data/cobranca/comissoes';

const TIPOS_MSG: TipoMsg[] = ['antes', 'cobranca', 'depois', 'remarketing'];
export const cicloDe = (dia: number) => `D${String(dia || 0).padStart(2, '0')}`;
const mensalidadeDe = (l: GLinha) => l.valor / 2;   // valor = parcela TOTAL; mensal = metade (regra da casa)

type Cel = 'pago' | 'nao_pagou' | 'outro';
const cel = (raw: string): Cel => {
  const e = estadoCelula(raw ?? '');
  return e.estado === 'pago' ? 'pago' : e.estado === 'nao_pagou' ? 'nao_pagou' : 'outro';
};
const valorPago = (raw: string): number => { const e = estadoCelula(raw ?? ''); return e.estado === 'pago' ? (e.valor ?? 0) : 0; };

/** comportamento real: olha as duas últimas células DEFINIDAS (pago/não pagou). */
function comportamentoDe(celulas: string[]): Comportamento {
  const def = celulas.map(cel).filter((c) => c !== 'outro');
  const ult = def[def.length - 1];
  const ant = def[def.length - 2];
  if (!ult) return 'em_dia';
  if (ult === 'pago') return ant === 'nao_pagou' ? 'voltou' : 'em_dia';
  return ant === 'nao_pagou' ? 'inadimplente' : 'faltou';
}

/** converte uma linha real da planilha pra forma de análise da demo. */
export function linhaParaCliente(l: GLinha, comps: string[]): ClienteAnalise {
  // só meses que já chegaram: coluna futura/lixo de teste não vira "faltou"/"voltou"
  const hoje = compHoje();
  const comportamento = comportamentoDe(l.celulas.filter((_, k) => (comps[k] ?? '') <= hoje));
  const meses = comps.map((competencia, k) => {
    const c = cel(l.celulas[k] ?? '');
    const status = c === 'pago' ? 'paga' as const : c === 'nao_pagou' ? 'nao_paga' as const
      : estadoCelula(l.celulas[k] ?? '').estado === 'aguardando_entrada' ? 'atraso' as const : 'prevista' as const;
    return { competencia, status };
  });
  return {
    id: l.id, nome: l.nome, ciclo: cicloDe(l.dia), atendente: l.comercial || '—',
    mensalidade: mensalidadeDe(l),
    comportamento, meses, celulas: l.celulas,
    // "ativo" = gera fluxo de cobrança AGORA. Neste produto situacao é o estado
    // do DÉBITO bancário: 'cancelado' = débito PAROU = cliente EM COBRANÇA (é a
    // carteira que paga mensalidade pela grade — a população da Gestão);
    // 'ativo' = débito ainda descontando = NOVOS (ainda nem entram na cobrança).
    // A leitura antiga (!== 'cancelado') media o painel sobre os Novos e
    // ignorava a carteira inteira — auditoria 17/09.
    // Cancelados (mig 79) não são carteira: ficam com o histórico (faturamento/comissões), fora do fluxo
    ativo: l.situacao === 'cancelado' && !l.cancelamento,
    cancelado: !!l.cancelamento,
    whatsapp: l.telefone || null,
    engajamento: [],                        // entra quando a régua/WhatsApp começar a rodar
    faturamentoTotal: l.celulas.reduce((s, c) => s + valorPago(c), 0),
    ultimaResposta: null,
  };
}

/** todos os clientes com histórico: os da Gestão/Novos + os Cancelados (que já pagaram meses que contam) */
export const linhasComCancelados = (dados: Dados): GLinha[] => (dados.cancelados?.length ? [...dados.linhas, ...dados.cancelados] : dados.linhas);
export function clientesReais(dados: Dados): ClienteAnalise[] {
  return linhasComCancelados(dados).map((l) => linhaParaCliente(l, dados.comps));
}

/** competência 'YYYY-MM' de hoje (corte de mês futuro nos KPIs) */
export function compHoje(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function resumoCarteiraReal(dados: Dados): ResumoCarteira {
  const cs = clientesReais(dados);
  // recorrência/atraso/adimplência/saúde = quem está EM COBRANÇA (c.ativo, ver
  // linhaParaCliente); Novos ainda não pagam pela grade. Faturamento é histórico.
  const at = cs.filter((c) => c.ativo !== false);
  const comps: Comportamento[] = ['em_dia', 'voltou', 'faltou', 'inadimplente'];
  const porComportamento = comps.map((comp) => {
    const l = at.filter((c) => c.comportamento === comp);
    return { comp, n: l.length, valor: l.reduce((s, c) => s + c.mensalidade, 0) };
  });
  // faturamento por mês = soma REAL das células pagas de cada competência
  const faturamentoMensal = dados.comps.map((competencia, k) => ({
    competencia,
    valor: linhasComCancelados(dados).reduce((s, l) => s + valorPago(l.celulas[k] ?? ''), 0),
  }));
  const respostaPorTipo = TIPOS_MSG.map((tipo) => ({ tipo, enviadas: 0, respostas: 0 }));
  const emDia = at.filter((c) => c.comportamento === 'em_dia' || c.comportamento === 'voltou').length;
  // "recebido no mês" = a competência do MÊS CORRENTE (não a última coluna da
  // grade — com a coluna do mês seguinte aberta, o KPI mostrava o futuro vazio);
  // sem coluna do mês ainda, cai no último mês NÃO-futuro com coluna.
  const hoje = compHoje();
  const recebidoMes = (faturamentoMensal.find((f) => f.competencia === hoje)
    ?? [...faturamentoMensal].reverse().find((f) => f.competencia < hoje))?.valor ?? 0;
  return {
    faturamentoTotal: cs.reduce((s, c) => s + c.faturamentoTotal, 0),
    recorrencia: at.reduce((s, c) => s + c.mensalidade, 0),
    recebidoMes,
    emAtrasoValor: at.filter((c) => c.comportamento === 'faltou' || c.comportamento === 'inadimplente').reduce((s, c) => s + c.mensalidade, 0),
    adimplencia: at.length ? Math.round((emDia / at.length) * 100) : 0,
    porComportamento, faturamentoMensal, respostaPorTipo,
  };
}

export function ciclosReaisMetrica(dados: Dados): MetricaCiclo[] {
  const map = new Map<string, ClienteAnalise[]>();
  for (const c of clientesReais(dados)) { const a = map.get(c.ciclo) ?? []; a.push(c); map.set(c.ciclo, a); }
  return [...map.entries()].map(([codigo, lista]) => ({
    codigo, clientes: lista.filter((c) => !c.cancelado).length,
    faturamento: lista.reduce((s, c) => s + c.faturamentoTotal, 0),
    recorrencia: lista.filter((c) => !c.cancelado).reduce((s, c) => s + c.mensalidade, 0),
  })).sort((a, b) => a.codigo.localeCompare(b.codigo));
}

export function atendentesReais(dados: Dados): LinhaAtendente[] {
  // agrupa por nome NORMALIZADO (trim + caixa alta): 'EMILLYN' e 'emillyn' são a
  // mesma pessoa — a tabela de Comissões na mesma tela já junta; aqui dividia em duas.
  const map = new Map<string, { nome: string; lista: ClienteAnalise[] }>();
  for (const c of clientesReais(dados)) {
    const chave = c.atendente.trim().toUpperCase();
    const g = map.get(chave) ?? { nome: c.atendente.trim(), lista: [] };
    g.lista.push(c); map.set(chave, g);
  }
  const base: (MetricaAtendente & { lista: ClienteAnalise[] })[] = [...map.values()].map(({ nome, lista }) => {
    // métricas de fluxo (recorrência/atraso/adimplência) sobre a carteira EM
    // COBRANÇA (c.ativo); faturamento é histórico (todos)
    const av = lista.filter((c) => c.ativo !== false);
    const emDia = av.filter((c) => c.comportamento === 'em_dia' || c.comportamento === 'voltou').length;
    return {
      nome, clientes: lista.filter((c) => !c.cancelado).length, lista,
      faturamento: lista.reduce((s, c) => s + c.faturamentoTotal, 0),
      recorrencia: av.reduce((s, c) => s + c.mensalidade, 0),
      emAtraso: av.filter((c) => c.comportamento === 'faltou' || c.comportamento === 'inadimplente').length,
      adimplencia: av.length ? Math.round((emDia / av.length) * 100) : 0,
      taxaResposta: 0,                       // entra quando o WhatsApp começar a medir respostas
    };
  }).sort((a, b) => b.faturamento - a.faturamento);
  return base.map(({ lista, ...m }) => {
    // o quebra-por-comportamento do modal usa a MESMA população do 'Em atraso'
    // (carteira em cobrança) — antes contava os Novos como 'em dia' e distorcia
    const av = lista.filter((c) => c.ativo !== false);
    return {
      ...m, cs: lista,
      semWa: av.filter((c) => !c.whatsapp).length,
      ticket: av.length ? Math.round(m.recorrencia / av.length) : 0,
      brk: {
        emDia: av.filter((c) => c.comportamento === 'em_dia').length,
        voltou: av.filter((c) => c.comportamento === 'voltou').length,
        faltou: av.filter((c) => c.comportamento === 'faltou').length,
        inad: av.filter((c) => c.comportamento === 'inadimplente').length,
      },
    };
  });
}

/** previsão de 6 meses sobre a carteira EM COBRANÇA (quem paga pela grade —
    auditoria 17/09: a versão anterior media sobre os Novos, população invertida).
    O atraso do MÊS CORRENTE é sensível ao DIA do ciclo — vencimento já passou e a
    célula não está paga → conta como atraso — e respeita a DATA MANUAL do
    Calendário (ciclos_datas.cobranca), igual ao motor: cobrança adiada à mão não
    conta como atraso antes da data escolhida. */
/* previsto e atraso em LÍQUIDO DO ESCRITÓRIO (mensalidade × (100 − % do comercial)) — a mesma base do
   Recebido, que soma as células (áudio do dono 29/09: na planilha entra o líquido). Sem `pcts` = 50%. */
export function previsaoReal(dados: Dados, pcts?: Record<string, number>, hist?: HistComissao): { mes: string; previsto: number; recebido: number; atraso: number; qtd: number }[] {
  const carteira = dados.linhas.filter((l) => l.situacao === 'cancelado');
  // a % de CADA mês (histórico): mudança agendada pra out/26 não muda a previsão de set/26
  const liquidoDe = (l: GLinha, mes: string) => mensalidadeDe(l) * (100 - Math.min(100, Math.max(0, pctNoMes(hist, pcts, l.comercial || '', mes)))) / 100;
  const qtd = carteira.length;
  const hoje = new Date();
  const hojeIso = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() + i, 1);
    const mes = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const recorrencia = carteira.reduce((s, l) => s + liquidoDe(l, mes), 0);
    const k = dados.comps.indexOf(mes);
    // recebido conta TODO pagamento do mês (Novos e carteira — histórico é histórico)
    const recebido = k >= 0 ? linhasComCancelados(dados).reduce((s, l) => s + valorPago(l.celulas[k] ?? ''), 0) : 0;
    let atraso = 0;
    if (i === 0) { // mês corrente SEM coluna aberta ainda (k=-1): célula inexistente = não pago
      const teto = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate(); // dia 31 num mês de 30 → 30
      for (const l of carteira) {
        if (!(l.dia > 0)) continue; // sem ciclo definido não conta atraso
        const celMes = k >= 0 ? (l.celulas[k] ?? '') : '';
        if (cel(celMes) === 'pago') continue;
        // vencimento efetivo: data manual do calendário pro ciclo neste mês, se houver
        const manual = dados.ciclosDatas?.[String(l.dia)]?.[mes]?.cobranca || '';
        const venceu = manual ? manual < hojeIso : Math.min(l.dia, teto) < hoje.getDate();
        if (venceu) atraso += liquidoDe(l, mes);
      }
    }
    return { mes, previsto: Math.round(recorrencia * 100) / 100, recebido, atraso: Math.round(atraso * 100) / 100, qtd };
  });
}
