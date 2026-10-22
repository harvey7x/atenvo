/* Sinais da LEITURA DO DIA para `vite --mode demo` (sem backend).

   DEMO É O CONTRATO: a mesma forma de SinaisV5 que a RPC devolve (depois do normalizador)
   e DERIVADA DO MESMO PLANO DE LEADS do demo do dashboard (dashboardV5.demo.ts): os
   achados batem com a tabela, os cartões e o mapa — o JUROS "parado" do cenário padrão
   não tem entrada no mesmo trecho em nenhum lugar da página.

   A taxa por hora sai do próprio plano (volume do número × peso da hora × tipo de dia),
   as entradas, o descarte, as respostas e os fechamentos saem dos leads. Só a fila da
   1ª mensagem, os "passados sem contato" e as fichas finalizadas são de mentira com
   proporções reais (o plano não guarda a passagem da IA para a pessoa).

   Cenários (?leitura=, só no demo): padrao · calmo · incidente · cheio (ver ajusteDemoV5). */

import {
  addDias, ajusteDemoV5, cenarioDemoV5, DEMO_ATENDENTES, DEMO_CANAIS, diaDe, DIA, dowDe, ganhoDe, HORA, horaDe, leadsDemoV5,
  mediana, MIN, msDe, MULT_DOW, PESO_HORA, PESO_HORA_TOT, rngDe, transferenciasDoDia,
  type AjusteDemoV5, type CanalCfg, type CenarioDemoV5, type LeadDemo,
} from '@/data/dashboardV5.demo';
import type {
  FechDiaV5, NumeroSinaisV5, PessoaSinaisV5, QualidadeV5, QuedaV5, RajadaV5, SemanaFechV5, SinaisV5,
} from '@/data/dashboardV5.sinais.tipos';

export { cenarioDemoV5, type CenarioDemoV5 };

/* !!! mesma lista de dash_v5s_feriados() e dash_v5s_feriados_uteis_antes() (SQL da migration
   20261022100000) — o teste "feriados: SQL e demo com a mesma lista" confere os três !!! */
export const FERIADOS_DEMO = new Set([
  '2026-01-01', '2026-02-16', '2026-02-17', '2026-04-03', '2026-04-21', '2026-05-01', '2026-06-04', '2026-09-07',
  '2026-09-20', '2026-10-12', '2026-11-02', '2026-11-15', '2026-11-20', '2026-12-25', '2027-01-01', '2027-02-08',
  '2027-02-09', '2027-03-26', '2027-04-21', '2027-05-01', '2027-05-27', '2027-09-07', '2027-09-20', '2027-10-12',
  '2027-11-02', '2027-11-15', '2027-11-20', '2027-12-25',
]);
const FERIADOS = FERIADOS_DEMO;
const diaUtil = (dia: string) => dowDe(dia) <= 5 && !FERIADOS.has(dia);

/* ============================== taxa por hora do plano ============================== */
/** mensagens recebidas (conversa × minuto) por cliente novo esperado, por número */
const MSG_POR_ENTRADA: Record<string, number> = { emp: 5, juros: 17, antonio: 4, murillo: 8, oficial: 0, emp_antigo: 0 };
/** parte das entradas que passa pela IA (o JUROS roda no robô, sem IA) */
const COBERTURA_IA: Record<string, number> = { emp: 0.92, juros: 0, antonio: 0.9, murillo: 0, oficial: 0, emp_antigo: 0 };

function taxa(c: CanalCfg, dia: string, h: number, msg: boolean): number {
  if (dia < c.desde || (c.ate && dia >= c.ate)) return 0;
  const dow = dowDe(dia);
  const tipo = dow >= 6 ? (MULT_DOW[6] + c.domingo) / 2 : (MULT_DOW[1] + MULT_DOW[2] + MULT_DOW[3] + MULT_DOW[4] + MULT_DOW[5]) / 5;
  const ent = (c.porDia * tipo * PESO_HORA[h]) / PESO_HORA_TOT;
  return msg ? ent * (MSG_POR_ENTRADA[c.chave] ?? 0) : ent;
}

/** esperado em [a, b) pela taxa por hora (fração de cada hora coberta) */
function esp(c: CanalCfg, a: number, b: number, msg = false): number {
  if (!(b > a)) return 0;
  let e = 0;
  for (let t = a; t < b;) {
    const hIni = Math.floor((t - msDe(diaDe(t))) / HORA) * HORA + msDe(diaDe(t));
    const fim = Math.min(hIni + HORA, b);
    e += (taxa(c, diaDe(t), horaDe(t), msg) * (fim - t)) / HORA;
    t = fim;
  }
  return e;
}

const r1 = (n: number) => Math.round(n * 10) / 10;
/** dias decorridos do período (até agora) */
const fimJanelaDias = (ini: number, fim: number) => Math.max(0, (fim - ini) / DIA);
const iso = (ms: number) => new Date(ms).toISOString();
const minuto = (ms: number) => Math.floor(ms / MIN) * MIN;

/* ============================== sinais por número ============================== */
interface Ctx {
  ag: number; hoje: string; aj: AjusteDemoV5; leads: LeadDemo[];
  pIni: number; pFim: number;
}

function qualidade(ls: LeadDemo[], ag: number): QualidadeV5 {
  const q: QualidadeV5 = { n: ls.length, rs: 0, iaDesc: 0, motivos: {} };
  for (const l of ls) {
    if (!l.ne || l.ne.em > ag) continue;
    if (l.ne.quem === 'regra_rs') q.rs++;
    else if (l.ne.quem === 'ia' && l.ne.em - l.criado <= HORA) {
      q.iaDesc++;
      q.motivos[l.ne.motivo] = (q.motivos[l.ne.motivo] ?? 0) + 1;
    }
  }
  return q;
}

function quedasDe(c: CanalCfg, ents: number[], x: Ctx): QuedaV5[] {
  const fimJ = Math.min(x.pFim, x.ag);
  const gaps: { a: number; b: number; ia: number; ib: number; e: number }[] = [];
  for (let i = 1; i < ents.length; i++) {
    const a = ents[i - 1], b = ents[i];
    if (b - a < 45 * MIN || b <= x.pIni - 2 * DIA || b > fimJ) continue;
    const e = esp(c, a, b);
    if (e >= 8) gaps.push({ a, b, ia: i - 1, ib: i, e });
  }
  const juntos: typeof gaps = [];
  for (const g of gaps) {
    const ult = juntos[juntos.length - 1];
    if (ult && g.ia - ult.ib + 1 <= 2 && g.a - ult.b < 2 * HORA) { ult.b = g.b; ult.ib = g.ib; } else juntos.push({ ...g });
  }
  return juntos.filter((g) => g.b > x.pIni)
    .map((g) => ({
      inicio: iso(g.a), fim: iso(g.b), chegaram: g.ib - g.ia - 1, esperado: r1(esp(c, g.a, g.b)),
      depois: ents.filter((t) => t >= g.b && t < x.ag).length, espDepois: r1(esp(c, g.b, x.ag)),
    }));
}

function rajadasDe(ents: number[], x: Ctx): RajadaV5[] {
  const fimJ = Math.min(x.pFim, x.ag);
  const out: RajadaV5[] = [];
  let i = 0;
  while (i < ents.length) {
    const t = ents[i];
    let j = i;
    while (j + 1 < ents.length && ents[j + 1] <= t + 15 * MIN) j++;
    const n = j - i + 1;
    if (n >= 20 && t >= x.pIni && t < fimJ) {
      out.push({ inicio: iso(t), qtd: n, minutos: Math.max(1, Math.ceil((ents[j] - t) / MIN)),
        silencioAntesH: i > 0 ? r1((t - ents[i - 1]) / HORA) : null });
      i = j + 1;
    } else i++;
  }
  return out.slice(-3);
}

function numero(c: CanalCfg, x: Ctx): NumeroSinaisV5 {
  const { ag, hoje, aj } = x;
  const meus = x.leads.filter((l) => l.canalId === c.id && l.criado <= ag);
  const ents = meus.map((l) => l.criado);
  const nasc = c.desde;
  const hist = Math.round((Date.parse(`${hoje}T12:00:00Z`) - Date.parse(`${nasc}T12:00:00Z`)) / DIA);
  const porDia = (d: string) => meus.filter((l) => diaDe(l.criado) === d).length;
  const dias14 = Array.from({ length: 14 }, (_, i) => addDias(hoje, -1 - i)).filter((d) => d >= nasc);
  const med14 = mediana(dias14.map(porDia)) ?? 0;
  const trafego = c.chave !== 'murillo' && hist >= 7 && med14 >= 3;
  const ultima = ents.filter((t) => t > ag - 8 * DIA).pop() ?? null;
  const silMsg = aj.silencioMsg.find((s) => s.canalId === c.id && s.ini <= ag)?.ini ?? null;
  const msgsEm = (a: number, b: number) => {
    const fim = silMsg != null ? Math.min(b, silMsg) : b;
    return fim > a ? Math.round(esp(c, a, fim, true) * 0.96) : 0;
  };
  // última mensagem: no silêncio, logo antes dele; senão, ~1 mensagem atrás no ritmo da hora
  const lamMsgAgora = taxa(c, hoje, horaDe(ag), true);
  const ultimaMsg = silMsg != null ? minuto(silMsg - MIN)
    : lamMsgAgora > 0 ? minuto(ag - Math.min(3 * DIA, (60 / Math.max(lamMsgAgora, 0.2)) * MIN)) : null;
  const desdeDiag = Math.min(Math.max(ultima ?? ag - 6 * HORA, ag - 6 * HORA), ag - 2 * HORA);
  const lacEsp = silMsg != null ? esp(c, silMsg, ag, true) : 0;
  const clock = ag - msDe(hoje);
  const normal = dias14.length >= 5
    ? mediana(dias14.map((d) => meus.filter((l) => diaDe(l.criado) === d && l.criado - msDe(d) < clock).length)) : null;
  const ia3 = meus.filter((l) => l.criado >= ag - 3 * HORA && l.criado < ag - 30 * MIN).length;
  const ia7 = meus.filter((l) => l.criado >= msDe(hoje) - 7 * DIA && l.criado < msDe(hoje)).length;
  const cob = COBERTURA_IA[c.chave] ?? 0;
  const baseIni = Math.max(msDe(hoje) - 14 * DIA, msDe('2026-10-01'));
  const qb = qualidade(meus.filter((l) => l.criado >= baseIni && l.criado < msDe(hoje)), ag);
  return {
    canalId: c.id!,
    nome: c.nome,
    numero: c.numero,
    trafego,
    aprendendoAte: hist < 7 ? addDias(nasc, 7) : null,
    historiaDesde: nasc,
    ultimaEntrada: ultima != null ? iso(ultima) : null,
    esperadoDesdeUltima: r1(esp(c, Math.max(ultima ?? ag - 4 * DIA, ag - 4 * DIA), ag)),
    ent3h: { rec: ents.filter((t) => t >= ag - 3 * HORA).length, esp: r1(esp(c, ag - 3 * HORA, ag)) },
    ent3h15: { rec: ents.filter((t) => t >= ag - 195 * MIN && t < ag - 15 * MIN).length, esp: r1(esp(c, ag - 195 * MIN, ag - 15 * MIN)) },
    ent60: { rec: ents.filter((t) => t >= ag - HORA).length, esp: r1(esp(c, ag - HORA, ag)) },
    ultimaMsg: ultimaMsg != null ? iso(ultimaMsg) : null,
    msgsEsperadasDesdeUltimaMsg: r1(ultimaMsg != null ? esp(c, ultimaMsg, ag, true) : esp(c, ag - 3 * DIA, ag, true)),
    msgs60: { rec: msgsEm(ag - HORA, ag), esp: r1(esp(c, ag - HORA, ag, true)) },
    lacunasMsg: silMsg != null && ag - silMsg >= 75 * MIN && lacEsp >= 20
      ? [{ inicio: iso(silMsg - MIN), fim: null, esperado: r1(lacEsp), recDepois: null, espDepois: null }] : [],
    msgsDiag: { desde: iso(desdeDiag), rec: msgsEm(desdeDiag, ag), esp: r1(esp(c, desdeDiag, ag, true)) },
    hoje: { entradas: ents.filter((t) => t >= msDe(hoje)).length, normalAteAgora: normal },
    ia3h: { n: ia3, comIa: Math.round(ia3 * cob) },
    iaCob7d: { n: ia7, comIa: Math.round(ia7 * cob) },
    qual24h: qualidade(meus.filter((l) => l.criado >= ag - DIA && l.criado < ag - HORA), ag),
    qualBase: { ...qb, dias: Math.round((msDe(hoje) - baseIni) / DIA) },
    quedas: trafego ? quedasDe(c, ents, x) : [],
    rajadas: rajadasDe(ents, x),
  };
}

/* ============================== equipe ============================== */
/** fila da 1ª mensagem em cada um dos 10 dias úteis anteriores (proporções reais 7/7/3/3) */
const FILA_BASE: Record<string, number[]> = {
  'demo-u-juliana': [6, 5, 7, 4, 6, 5, 6, 7, 5, 6],
  'demo-u-matheus': [5, 4, 6, 5, 5, 4, 6, 5, 5, 6],
  'demo-u-isadora': [2, 1, 2, 1, 2, 2, 1, 2, 1, 2],
  'demo-u-luiz': [1, 1, 0, 1, 1, 1, 0, 1, 1, 1],
};
/** minuto do dia da 1ª mensagem (mediana) */
const COMECA: Record<string, number> = { 'demo-u-juliana': 598, 'demo-u-matheus': 592, 'demo-u-isadora': 556, 'demo-u-luiz': 801 };
/** leads passados pela IA/robô nos últimos 7 dias e quantos ficaram sem mensagem em 1 dia útil */
const PASSADOS: Record<string, [number, number]> = {
  'demo-u-juliana': [62, 9], 'demo-u-matheus': [60, 32], 'demo-u-isadora': [27, 4], 'demo-u-luiz': [26, 3],
};

function respostas(leads: LeadDemo[], dono: string | null, d0: number, corte: number, ag: number): number[] {
  const v: number[] = [];
  for (const l of leads) {
    if (dono && l.dono !== dono) continue;
    for (const z of l.vezes) if (z.t0 >= d0 && z.t0 < corte - HORA && z.resp <= corte && z.resp <= ag) v.push(z.min);
  }
  return v;
}

/* ============================== fichas finalizadas ============================== */
function fichasDoDia(dia: string, aj: AjusteDemoV5): number {
  if (!diaUtil(dia)) return 0;
  const r = rngDe(`v5|fichas|${dia}`);
  return Math.round(14 * (aj.fatorFichas[dia] ?? 1) * (0.85 + 0.3 * r()));
}

/* ============================== sinais ============================== */
export function demoSinaisV5(janela: { iniISO: string; fimISO: string }, agora: Date, admin: boolean, cenario: CenarioDemoV5): SinaisV5 {
  const ag = agora.getTime();
  const hoje = diaDe(ag);
  const aj = ajusteDemoV5(cenario, agora);
  const pIni = Date.parse(janela.iniISO), pFim = Date.parse(janela.fimISO);
  // fechamentos de hoje podem vir de leads de até ~90 dias antes (o mesmo corte do demo do
  // dashboard): sem isso a semana da leitura não bateria com o KPI "Fechados"
  const desde = Math.min(pIni - 4 * DIA, msDe(hoje) - 130 * DIA);
  const leads = leadsDemoV5(diaDe(desde), addDias(hoje, 1), aj);
  const x: Ctx = { ag, hoje, aj, leads, pIni, pFim };
  const incluiAgora = pFim >= ag;
  const hora = horaDe(ag);

  const numeros = DEMO_CANAIS.filter((c) => c.id && (!c.ate || c.chave === 'oficial')).map((c) => numero(c, x))
    .sort((a, b) => Number(b.trafego) - Number(a.trafego) || a.nome.localeCompare(b.nome));

  // total: todas as entradas de hoje contra o mesmo horário dos 14 dias anteriores
  const clock = ag - msDe(hoje);
  const todos = leads.filter((l) => l.criado <= ag);
  const totalHoje = todos.filter((l) => l.criado >= msDe(hoje)).length;
  const normalTotal = mediana(Array.from({ length: 14 }, (_, i) => addDias(hoje, -1 - i))
    .map((d) => todos.filter((l) => diaDe(l.criado) === d && l.criado - msDe(d) < clock).length));

  // equipe e pessoas: dia útil, 11:00–19:59, período chegando a agora
  const util = diaUtil(hoje);
  const aoVivo = incluiAgora && util && hora >= 11 && hora <= 19;
  const uteis: string[] = [];
  for (let d = addDias(hoje, -1); uteis.length < 10; d = addDias(d, -1)) if (diaUtil(d)) uteis.unshift(d);
  const corteDe = (d: string) => msDe(d, hora * 60);
  const filaAgora = (uid: string) => (aj.filaMatheus && uid === 'demo-u-matheus' ? 12 : FILA_BASE[uid][9]);
  // a resposta de hoje só conta vez do cliente com mais de 1 h (o mesmo corte do SQL)
  const respHoje = aoVivo ? respostas(leads, null, msDe(hoje), ag, ag) : [];

  const equipe = aoVivo ? {
    respHoje: { n: respHoje.length, medianaMin: respHoje.length ? r1(mediana(respHoje)!) : null },
    respBase: uteis.map((d) => respostas(leads, null, msDe(d), corteDe(d), ag)).filter((v) => v.length >= 20).map((v) => r1(mediana(v)!)),
    filaAgora: DEMO_ATENDENTES.reduce((a, p) => a + filaAgora(p.id), 0),
    filaAntes: [0, 0].map(() => DEMO_ATENDENTES.reduce((a, p) => a + filaAgora(p.id), 0)),
    filaBase: uteis.map((_, i) => DEMO_ATENDENTES.reduce((a, p) => a + FILA_BASE[p.id][i], 0)),
    filaBaseProx: hora <= 18 ? uteis.map((_, i) => DEMO_ATENDENTES.reduce((a, p) => a + FILA_BASE[p.id][i], 0)) : null,
  } : null;

  const dias = (pFim - pIni) / DIA;
  const pessoas: PessoaSinaisV5[] = admin ? DEMO_ATENDENTES.map((p) => {
    const rh = aoVivo ? respostas(leads, p.id, msDe(hoje), ag, ag) : [];
    const resto: number[] = [];
    if (aoVivo) {
      for (const l of leads) {
        if (l.dono === p.id) continue;
        for (const z of l.vezes) if (z.t0 >= msDe(hoje) && z.t0 < ag - HORA && z.resp <= ag) resto.push(z.min);
      }
    }
    const comeca = COMECA[p.id];
    const fila = filaAgora(p.id);
    return {
      usuarioId: p.id,
      nome: p.nome,
      parteRodizio14d: p.peso / DEMO_ATENDENTES.reduce((a, q) => a + q.peso, 0),
      primeiraMsgHoje: util && ag >= msDe(hoje, comeca) ? iso(msDe(hoje, comeca)) : null,
      primeiraMsgMedianaMin: comeca,
      diasAtivos: aoVivo ? FILA_BASE[p.id].map(() => true) : [],
      fila: {
        agora: aoVivo ? fila : 0,
        maisAntigo: aoVivo && fila > 0 ? iso(ag - (p.id === 'demo-u-matheus' && aj.filaMatheus ? 5 : 3) * HORA) : null,
        base: aoVivo ? FILA_BASE[p.id] : [],
        baseProx: aoVivo && hora <= 18 ? FILA_BASE[p.id] : null,
      },
      respHoje: aoVivo ? { n: rh.length, medianaMin: rh.length ? r1(mediana(rh)!) : null } : null,
      respRestoMedianaMin: resto.length ? r1(mediana(resto)!) : null,
      respBase: aoVivo ? uteis.map((d) => {
        const v = respostas(leads, p.id, msDe(d), corteDe(d), ag);
        return { n: v.length, med: v.length ? r1(mediana(v)!) : null };
      }) : [],
      // as proporções reais de 7 dias, escaladas pelo tamanho do período (o mês não repete a semana)
      passados: dias >= 6.5 ? (() => {
        const [n7, s7] = PASSADOS[p.id];
        const f = Math.min(fimJanelaDias(pIni, Math.min(pFim, ag)), 45) / 7;
        const n = Math.round(n7 * f);
        return { n, semContato: Math.round((cenario === 'calmo' && p.id === 'demo-u-matheus' ? 10 : s7) * f) };
      })() : null,
    };
  }) : [];

  // fechamentos, fichas e entradas por dia (42 dias até ontem)
  const diario: FechDiaV5[] = [];
  const gPorDia = new Map<string, number>();
  for (const l of leads) { const g = ganhoDe(l, aj); if (g) gPorDia.set(diaDe(g.em), (gPorDia.get(diaDe(g.em)) ?? 0) + 1); }
  for (let i = 42; i >= 1; i--) {
    const d = addDias(hoje, -i);
    diario.push({ dia: d, ganhos: gPorDia.get(d) ?? 0, fichas: fichasDoDia(d, aj), entradas: leads.filter((l) => diaDe(l.criado) === d).length });
  }

  // observações: o lote de transferências do demo (21/10 13:06) e fichas sem "fechado"
  const fimJ = Math.min(pFim, ag);
  const transf = [];
  for (let d = diaDe(pIni); d <= diaDe(fimJ - 1); d = addDias(d, 1)) {
    const lote = transferenciasDoDia(d).filter((t) => t.contato.startsWith('lote:') && t.em >= pIni && t.em < fimJ);
    if (lote.length >= 20) {
      const para = new Map<string, number>();
      for (const t of lote) para.set(t.para, (para.get(t.para) ?? 0) + 1);
      transf.push({
        minuto: iso(lote[0].em), qtd: lote.length, de: admin ? 'Luiz' : null,
        para: admin ? [...para].map(([uid, q]) => ({ nome: DEMO_ATENDENTES.find((a) => a.id === uid)?.nome ?? 'Sem nome', qtd: q }))
          .sort((a, b) => b.qtd - a.qtd) : [],
      });
    }
  }
  let fichasPer = 0;
  for (let d = diaDe(pIni); d <= diaDe(fimJ - 1); d = addDias(d, 1)) {
    const f = fichasDoDia(d, aj);
    fichasPer += d === hoje ? Math.round(f * Math.min(1, Math.max(0, (ag - msDe(hoje, 540)) / (10 * HORA)))) : f;
  }
  const semFechado = Math.round(fichasPer * 0.74);

  // a semana da leitura: a MESMA janela do "7 dias" (hoje e os 6 anteriores, até agora) e as
  // 4 de antes no mesmo relógio — o cartão bate com o KPI "Fechados" do 7 dias
  const fichasEntre = (a: number, b: number) => {
    let f = 0;
    for (let d = diaDe(a); d <= diaDe(b - 1); d = addDias(d, 1)) {
      const tot = fichasDoDia(d, aj);
      const ini = Math.max(a, msDe(d)), fim = Math.min(b, msDe(addDias(d, 1)));
      const corte = (t: number) => Math.min(1, Math.max(0, (t - msDe(d, 540)) / (10 * HORA)));
      f += Math.round(tot * corte(fim)) - Math.round(tot * corte(ini));
    }
    return f;
  };
  const semanas: SemanaFechV5[] = [0, 1, 2, 3, 4].map((k) => {
    const ini = msDe(addDias(hoje, -6 - 7 * k)), fim = ag - 7 * k * DIA;
    let ganhos = 0;
    for (const l of leads) { const g = ganhoDe(l, aj); if (g && g.em >= ini && g.em < fim) ganhos++; }
    return {
      inicio: iso(ini), fim: iso(fim), ganhos, fichas: fichasEntre(ini, fim),
      entradas: leads.filter((l) => l.criado >= ini && l.criado < fim).length,
    };
  });
  const semFechadoSemana = Math.round(semanas[0].fichas * 0.74);
  const parte: [string, number][] = [['Juliana', 0.62], ['Isadora', 0.24], ['Luiz', 0.09], ['Matheus', 0.05]];

  const feriados: string[] = [];
  for (let d = diaDe(pIni); d <= diaDe(fimJ - 1); d = addDias(d, 1)) if (FERIADOS.has(d) && dowDe(d) <= 5) feriados.push(d);

  return {
    versao: 1,
    geradoEm: iso(ag),
    agora: iso(ag),
    admin,
    baseCalculadaEm: iso(msDe(hoje, 1)),
    janela: { inicio: janela.iniISO, fim: janela.fimISO, incluiAgora },
    diaUtil: util,
    feriadosNoPeriodo: feriados,
    numeros,
    total: { hoje: totalHoje, normalAteAgora: normalTotal, rajadaHoje: numeros.some((n) => n.trafego && n.rajadas.some((r) => r.inicio >= iso(msDe(hoje)))) },
    ia: aj.creditoIni != null
      ? { credito: { inicio: iso(aj.creditoIni), fim: iso(ag - MIN), erros: 31, conversas: 11, okDepois: 0 }, credito60: 31, erros60: 0, ok60: 0 }
      : { credito: null, credito60: 0, erros60: 0, ok60: Math.round(esp(DEMO_CANAIS[0], ag - HORA, ag) * 6) },
    equipe,
    pessoas,
    fechamentos: { diario, semanas, semFechadoSemana },
    notas: {
      lotesNe: [],
      transferencias: transf,
      fichasSemFechado: {
        total: semFechado,
        porPessoa: admin ? parte.map(([nome, f]) => ({ nome, qtd: Math.round(semFechado * f) })).filter((p) => p.qtd > 0) : [],
      },
    },
    demo: true,
  };
}
