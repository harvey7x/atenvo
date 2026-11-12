/* Fixtures das ABAS do Dashboard (12/11) para `vite --mode demo` — DEMO É O CONTRATO:
   mesma forma dos tipos de dashboardV5.abas.tipos.ts, agregada dos MESMOS leads da
   fixture do Dashboard (dashboardV5.demo.ts). Campanha do lead = campanha do número
   que o recebeu (diego · antonio · antonio2 · juros; MURILLO/OFICIAL = outros; os
   números antigos do EMPRÉSTIMO = diego, como no banco). O plano da Iris e o do
   parente são sorteios PRÓPRIOS e determinísticos por lead (nada muda entre duas
   leituras); o relógio só FILTRA o que já aconteceu. Totais fecham por construção
   (soma da série = tabela) — dashboardV5.abas.test.ts confere. */

import {
  DEMO_ATENDENTES, DEMO_CANAIS, DIA, HORA, MIN, addDias, ajusteDemoV5, diaDe, ganhoDe,
  leadsDemoV5, mediana, retornosDemoV5, rngDe,
  type CenarioDemoV5, type LeadDemo, type RetornoDemo,
} from './dashboardV5.demo';
import { mesCafDe, semanaDe } from './dashboardV5.series';
import type {
  AtendenteAbaV5, AtendentesAbaV5, CampanhaV5, CampanhasV5, IrisFunilV5, IrisV5,
  ParenteV5, PontoSerieV5, QuadroJanelaV5, ResumoCampanhaV5,
} from './dashboardV5.abas.tipos';

/* ============================== util ============================== */
const media = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);
const r1 = (n: number | null) => (n == null ? null : Math.round(n * 10) / 10);
const r3 = (n: number | null) => (n == null ? null : Math.round(n * 1000) / 1000);
function p90(v: number[]): number | null {
  if (!v.length) return null;
  const s = [...v].sort((a, b) => a - b);
  return s[Math.max(0, Math.ceil(s.length * 0.9) - 1)];
}
/** igual ao SQL: o relógio de qualidade começa em 01/08 (antes houve backfill) */
const CORTE_QUALIDADE = Date.parse('2026-08-01T00:00:00-03:00');

interface Janela { ini: number; fim: number }
const dentro = (t: number, j: Janela, ag: number) => t >= j.ini && t < j.fim && t <= ag;

/* ============================== campanha do lead ============================== */
const CAMPANHA_DO_CANAL: Record<string, string> = {
  'demo-canal-emprestimo': 'diego',
  'demo-canal-juros': 'juros',
  'demo-canal-antonio': 'antonio',
  'demo-canal-antonio2': 'antonio2',
  'demo-canal-murillo': 'outros',
  'demo-canal-oficial': 'outros',
};
/** null = números antigos do EMPRÉSTIMO (a família do Diego, como no banco) */
export const campanhaDoCanalDemo = (id: string | null): string =>
  (id == null ? 'diego' : CAMPANHA_DO_CANAL[id] ?? 'outros');

const CAMPANHA_DO_TRAFEGO: Record<string, string> = {
  'Empréstimo · Diego': 'diego',
  'Empréstimo · Antônio': 'antonio',
  'Empréstimo · Antônio 2.0': 'antonio2',
  'Juros abusivos · Andrius': 'juros',
};
const campanhaDoTrafego = (nome: string): string => CAMPANHA_DO_TRAFEGO[nome] ?? 'outros';

/* ============================== parente (plano por lead) ============================== */
interface ParenteLead { semBeneficio: boolean; fam: 'sim' | 'nao' | null; neTimer: boolean }
function parenteDoLead(l: LeadDemo): ParenteLead {
  const r = rngDe(`v5|parente|${l.id}`);
  const semBeneficio = r() < 0.42;
  if (!semBeneficio) return { semBeneficio: false, fam: null, neTimer: false };
  const u = r();
  const fam: ParenteLead['fam'] = u < 0.15 ? 'sim' : u < 0.72 ? 'nao' : null;
  return { semBeneficio: true, fam, neTimer: fam === null && r() < 0.45 };
}

/* ============================== campanhas ============================== */
function resumoPorCampanha(leads: LeadDemo[], j: Janela, ag: number, aj: ReturnType<typeof ajusteDemoV5>): ResumoCampanhaV5[] {
  const m = new Map<string, ResumoCampanhaV5>();
  const de = (c: string) => {
    let x = m.get(c);
    if (!x) { x = { campanha: c, entradas: 0, ganhos: 0, ne: 0 }; m.set(c, x); }
    return x;
  };
  for (const l of leads) {
    const c = campanhaDoCanalDemo(l.canalId);
    if (dentro(l.criado, j, ag)) de(c).entradas++;
    if (l.ne && dentro(l.ne.em, j, ag)) de(c).ne++;
    const g = ganhoDe(l, aj);
    if (g && dentro(g.em, j, ag)) de(c).ganhos++;
  }
  return [...m.values()].sort((a, b) => b.entradas - a.entradas || a.campanha.localeCompare(b.campanha));
}

export function demoCampanhasV5(
  janela: { iniISO: string; fimISO: string; antIniISO: string; antFimISO: string },
  agora: Date, cenario?: CenarioDemoV5,
): CampanhasV5 {
  const aj = ajusteDemoV5(cenario, agora);
  const ag = agora.getTime();
  const per: Janela = { ini: Date.parse(janela.iniISO), fim: Date.parse(janela.fimISO) };
  const ant: Janela = { ini: Date.parse(janela.antIniISO), fim: Date.parse(janela.antFimISO) };
  const hoje = diaDe(ag);
  const diaIni = Date.parse(`${hoje}T00:00:00-03:00`);
  const semIni = Date.parse(`${semanaDe(hoje)}T00:00:00-03:00`);
  const mesIni = Date.parse(`${mesCafDe(hoje)}T00:00:00-03:00`);
  const mesAntIni = Date.parse(`${mesCafDe(addDias(diaDe(mesIni), -1))}T00:00:00-03:00`);

  const desde = Math.min(per.ini, ant.ini, mesAntIni) - 95 * DIA;
  const leads = leadsDemoV5(diaDe(desde), addDias(hoje, 1), aj);
  const rets = retornosDemoV5(diaDe(Math.min(per.ini, ant.ini)), addDias(hoje, 1), aj);

  /* ---- tabela por campanha (período escolhido) ---- */
  const porCamp = new Map<string, {
    entradas: number; ganhos: number; horas: number[]; ne: number;
    neMotivos: Record<string, number>; neQuem: { ia: number; regraRs: number; equipe: number };
    rets: RetornoDemo[]; parenteRec: number;
  }>();
  const de = (c: string) => {
    let x = porCamp.get(c);
    if (!x) {
      x = { entradas: 0, ganhos: 0, horas: [], ne: 0, neMotivos: {}, neQuem: { ia: 0, regraRs: 0, equipe: 0 }, rets: [], parenteRec: 0 };
      porCamp.set(c, x);
    }
    return x;
  };
  for (const l of leads) {
    const c = campanhaDoCanalDemo(l.canalId);
    if (dentro(l.criado, per, ag)) {
      de(c).entradas++;
      const p = parenteDoLead(l);
      if (p.fam === 'sim') de(c).parenteRec++;
    }
    if (l.ne && dentro(l.ne.em, per, ag)) {
      const x = de(c);
      x.ne++;
      x.neMotivos[l.ne.motivo] = (x.neMotivos[l.ne.motivo] ?? 0) + 1;
      if (l.ne.quem === 'ia') x.neQuem.ia++; else if (l.ne.quem === 'regra_rs') x.neQuem.regraRs++; else x.neQuem.equipe++;
    }
    const g = ganhoDe(l, aj);
    if (g && dentro(g.em, per, ag)) {
      const x = de(c);
      x.ganhos++;
      if (l.criado >= CORTE_QUALIDADE && g.em >= l.criado) x.horas.push((g.em - l.criado) / HORA);
    }
  }
  for (const x of rets) {
    if (dentro(x.em, per, ag)) de(campanhaDoCanalDemo(x.canalId)).rets.push(x);
  }

  const campanhas: CampanhaV5[] = [...porCamp.entries()].map(([slug, x]) => {
    const origem = new Map<string, number>();
    let mesma = 0;
    for (const r of x.rets) {
      const o = campanhaDoTrafego(r.origem);
      origem.set(o, (origem.get(o) ?? 0) + 1);
      if (o === slug) mesma++;
    }
    return {
      campanha: slug,
      canais: DEMO_CANAIS.filter((c) => c.id && campanhaDoCanalDemo(c.id) === slug)
        .map((c) => ({ id: c.id!, nome: c.nome, numero: c.numero })),
      entradas: x.entradas,
      ganhos: x.ganhos,
      fechMedianaH: r3(mediana(x.horas)),
      fechN: x.horas.length,
      ne: x.ne,
      neMotivos: x.neMotivos,
      neQuem: x.neQuem,
      peloAnuncio: x.entradas + x.rets.length,
      retornos: x.rets.length,
      retornosMesma: mesma,
      retornosOrigens: [...origem].map(([campanha, n]) => ({ campanha, n }))
        .sort((a, b) => b.n - a.n || a.campanha.localeCompare(b.campanha)),
      parenteRec: x.parenteRec,
    };
  }).filter((c) => !['outros', 'sem_campanha'].includes(c.campanha)
    || c.entradas + c.ganhos + c.ne + c.peloAnuncio > 0)
    .sort((a, b) => b.entradas - a.entradas || a.campanha.localeCompare(b.campanha));

  /* ---- série diária ---- */
  const pontos = new Map<string, PontoSerieV5>();
  const ponto = (dia: string, c: string) => {
    const k = `${dia}|${c}`;
    let x = pontos.get(k);
    if (!x) { x = { dia, campanha: c, entradas: 0, ganhos: 0, ne: 0 }; pontos.set(k, x); }
    return x;
  };
  for (const l of leads) {
    const c = campanhaDoCanalDemo(l.canalId);
    if (dentro(l.criado, per, ag)) ponto(diaDe(l.criado), c).entradas++;
    if (l.ne && dentro(l.ne.em, per, ag)) ponto(diaDe(l.ne.em), c).ne++;
    const g = ganhoDe(l, aj);
    if (g && dentro(g.em, per, ag)) ponto(diaDe(g.em), c).ganhos++;
  }
  const serie = [...pontos.values()].sort((a, b) => a.dia.localeCompare(b.dia) || a.campanha.localeCompare(b.campanha));

  /* ---- quadros fixos (hoje / semana / mês CAF), anterior no mesmo tempo decorrido ---- */
  const quadroDe = (ini: number, antIni: number): QuadroJanelaV5 => ({
    ini: new Date(ini).toISOString(),
    atual: resumoPorCampanha(leads, { ini, fim: ag + 1 }, ag, aj),
    anterior: resumoPorCampanha(leads, { ini: antIni, fim: antIni + (ag - ini) + 1 }, ag, aj),
  });

  /* ---- parente (janela escolhida) ---- */
  const funil = { semBeneficio: 0, familiarSim: 0, familiarNao: 0, semResposta: 0, neTimer: 0 };
  const desfecho = { ganho: 0, emAndamento: 0, perdido: 0, semOpp: 0, perdidoMotivos: {} as Record<string, number> };
  const serieParente = new Map<string, number>();
  let neDesfeito = 0;
  for (const l of leads) {
    if (!dentro(l.criado, per, ag)) continue;
    const p = parenteDoLead(l);
    if (!p.semBeneficio) continue;
    funil.semBeneficio++;
    if (p.fam === 'sim') {
      funil.familiarSim++;
      const dia = diaDe(l.criado);
      serieParente.set(dia, (serieParente.get(dia) ?? 0) + 1);
      const g = ganhoDe(l, aj);
      if (g && g.em <= ag) desfecho.ganho++;
      else if (l.ne && l.ne.em <= ag) {
        desfecho.perdido++;
        desfecho.perdidoMotivos[l.ne.motivo] = (desfecho.perdidoMotivos[l.ne.motivo] ?? 0) + 1;
      } else desfecho.emAndamento++;
    } else if (p.fam === 'nao') funil.familiarNao++;
    else {
      funil.semResposta++;
      if (p.neTimer) {
        funil.neTimer++;
        if (rngDe(`v5|parente-volta|${l.id}`)() < 0.08) neDesfeito++;
      }
    }
  }
  const parente: ParenteV5 = {
    total: funil.familiarSim,
    serie: [...serieParente].map(([dia, n]) => ({ dia, n })).sort((a, b) => a.dia.localeCompare(b.dia)),
    funil, desfecho, neDesfeito,
  };

  return {
    geradoEm: agora.toISOString(),
    periodo: { inicio: janela.iniISO, fim: janela.fimISO },
    campanhas, serie,
    anterior: resumoPorCampanha(leads, ant, ag, aj),
    quadro: {
      dia: quadroDe(diaIni, diaIni - DIA),
      semana: quadroDe(semIni, semIni - 7 * DIA),
      mes: quadroDe(mesIni, mesAntIni),
    },
    parente,
    retornosConfiavelDesde: diaDe(ag - 14 * DIA),
  };
}

/* ============================== atendentes ============================== */
const FOTOS_DEMO: Record<string, { vac: number; cart: number; par7: number }> = {
  'demo-u-juliana': { vac: 98, cart: 2512, par7: 1954 },
  'demo-u-matheus': { vac: 77, cart: 2890, par7: 2503 },
  'demo-u-giovana': { vac: 56, cart: 601, par7: 322 },
  'demo-u-isadora': { vac: 36, cart: 540, par7: 271 },
  'demo-u-luiz': { vac: 30, cart: 305, par7: 159 },
};

export function demoAtendentesAbaV5(
  janela: { iniISO: string; fimISO: string; antIniISO: string; antFimISO: string },
  agora: Date, cenario?: CenarioDemoV5,
): AtendentesAbaV5 {
  const aj = ajusteDemoV5(cenario, agora);
  const ag = agora.getTime();
  const per: Janela = { ini: Date.parse(janela.iniISO), fim: Date.parse(janela.fimISO) };
  const ant: Janela = { ini: Date.parse(janela.antIniISO), fim: Date.parse(janela.antFimISO) };
  const leads = leadsDemoV5(diaDe(Math.min(per.ini, ant.ini) - 95 * DIA), addDias(diaDe(Math.min(per.fim, ag + DIA)), 1), aj);

  const serieMapa = new Map<string, number>();
  const atendentes: AtendenteAbaV5[] = DEMO_ATENDENTES.map((a) => {
    let recebidos = 0; let ganhos = 0; let ganhosAnt = 0; let neMarcados = 0;
    const resp: number[] = []; let cel = 0;
    const horasAt: number[] = []; const horasCli: number[] = [];
    const porCamp = new Map<string, number>();
    for (const l of leads) {
      if (l.dono !== a.id) continue;
      if (l.rotEm != null && dentro(l.rotEm, per, ag)) recebidos++;
      if (l.ne && l.ne.por === a.id && dentro(l.ne.em, per, ag)) neMarcados++;
      const g = ganhoDe(l, aj);
      if (g && g.credito === a.id) {
        if (dentro(g.em, ant, ag)) ganhosAnt++;
        if (dentro(g.em, per, ag)) {
          ganhos++;
          const c = campanhaDoCanalDemo(l.canalId);
          porCamp.set(c, (porCamp.get(c) ?? 0) + 1);
          const dia = diaDe(g.em);
          serieMapa.set(`${dia}|${a.id}`, (serieMapa.get(`${dia}|${a.id}`) ?? 0) + 1);
          if (l.criado >= CORTE_QUALIDADE && g.em >= l.criado) {
            horasCli.push((g.em - l.criado) / HORA);
            horasAt.push((g.em - Math.max(l.criado, l.rotEm ?? l.criado)) / HORA);
          }
        }
      }
      for (const v of l.vezes) {
        if (!dentro(v.t0, per, ag) || v.resp > ag || v.resp >= per.fim) continue;
        resp.push(v.min);
        if (v.cel) cel++;
      }
    }
    const fotos = FOTOS_DEMO[a.id] ?? { vac: 0, cart: 0, par7: 0 };
    return {
      usuarioId: a.id, nome: a.nome, recebidos, transferidos: 0, ganhos, ganhosAnt, neMarcados,
      respN: resp.length, respCelularN: cel, respMedianaMin: r1(mediana(resp)), respMediaMin: r1(media(resp)),
      fechN: horasAt.length, fechMedianaH: r3(mediana(horasAt)), fechMediaH: r3(media(horasAt)),
      fechSemRelogio: ganhos - horasAt.length,
      cliN: horasCli.length, cliMedianaH: r3(mediana(horasCli)), cliMediaH: r3(media(horasCli)),
      campanhas: [...porCamp].map(([campanha, g]) => ({ campanha, ganhos: g }))
        .sort((x, y) => y.ganhos - x.ganhos || x.campanha.localeCompare(y.campanha)),
      vacuo3o: fotos.vac, carteira: fotos.cart, parados7d: fotos.par7,
    };
  }).filter((a) => a.recebidos + a.ganhos + a.neMarcados + a.respN > 0)
    .sort((x, y) => y.ganhos - x.ganhos || y.recebidos - x.recebidos || x.nome.localeCompare(y.nome));

  return {
    geradoEm: agora.toISOString(),
    periodo: { inicio: janela.iniISO, fim: janela.fimISO },
    atendentes,
    serieGanhos: [...serieMapa].map(([k, ganhos]) => {
      const [dia, usuarioId] = k.split('|');
      return { dia, usuarioId, ganhos };
    }).sort((a, b) => a.dia.localeCompare(b.dia) || a.usuarioId.localeCompare(b.usuarioId)),
  };
}

/* ============================== Iris ============================== */
interface IrisLead {
  lead: LeadDemo;
  campanha: string;
  criado: number;
  respondeu: boolean;
  qual: { em: number; passa: boolean } | null;
  prop: number | null;
  aceite: { em: number; leitura: 'sim' | 'duvida' | 'nao' } | null;
  algumEm: number | null;
  conclusaoEm: number | null;
  estrito: boolean;
  /** bits de faltas de quem está em coleta sem completar */
  identOk: boolean; identAlgum: boolean; comprOk: boolean; emailOk: boolean;
  etapa: string;
}

/** A Iris no lead (sorteio próprio, determinístico). Só clientes das campanhas, da era
 *  da Iris no demo (últimos ~32 dias) — espelha o todos_desde real. */
function irisDoLead(l: LeadDemo, eraDesde: number): IrisLead | null {
  const campanha = campanhaDoCanalDemo(l.canalId);
  if (l.canalId == null || ['outros', 'sem_campanha'].includes(campanha)) return null;
  if (l.criado < eraDesde) return null;
  const r = rngDe(`v5|iris|${l.id}`);
  if (r() >= 0.52) return null;
  const respondeu = r() < 0.78;
  let qual: IrisLead['qual'] = null;
  let prop: number | null = null;
  let aceite: IrisLead['aceite'] = null;
  let algumEm: number | null = null;
  let conclusaoEm: number | null = null;
  let identOk = false; let identAlgum = false; let comprOk = false; let emailOk = false;
  let estrito = true;
  if (respondeu) {
    const passa = r() < 0.56;
    qual = { em: l.criado + Math.round((12 + r() * 25) * MIN), passa };
    if (passa && r() < 0.88) {
      prop = qual.em + Math.round((8 + r() * 20) * MIN);
      const u = r();
      if (u < 0.6) aceite = { em: prop + Math.round((10 + r() * 80) * MIN), leitura: 'sim' };
      else if (u < 0.8) aceite = { em: prop + Math.round((15 + r() * 120) * MIN), leitura: 'duvida' };
      else if (u < 0.86) aceite = { em: prop + Math.round((15 + r() * 120) * MIN), leitura: 'nao' };
      if (aceite?.leitura === 'sim' || (aceite == null && r() < 0.25)) {
        const base = (aceite?.em ?? prop) + Math.round((10 + r() * 40) * MIN);
        if (r() < 0.82) {
          algumEm = base;
          identAlgum = true;
          // sorteio das partes; completo quando as três fecham
          identOk = r() < 0.72;
          comprOk = r() < 0.68;
          emailOk = r() < 0.7;
          if (identOk && comprOk && emailOk) {
            let durMin = 20 + (-Math.log(1 - Math.min(0.999, r()))) * 45;
            if (r() < 0.12) durMin += 500 + r() * 1100; // cauda: quem some e volta de noite
            conclusaoEm = l.criado + Math.round(durMin * MIN);
            estrito = r() < 0.92;
          }
        } else if (r() < 0.3) { emailOk = true; }
      }
    }
  }
  const etapa = !respondeu ? 'triagem_govbr'
    : conclusaoEm != null ? 'conclusao'
      : prop != null || aceite != null || algumEm != null ? 'coleta_docs'
        : 'qualificacao_inss';
  return { lead: l, campanha, criado: l.criado, respondeu, qual, prop, aceite, algumEm, conclusaoEm, estrito, identOk, identAlgum, comprOk, emailOk, etapa };
}

export function demoIrisV5(
  janela: { iniISO: string; fimISO: string; antIniISO: string; antFimISO: string },
  agora: Date, cenario?: CenarioDemoV5,
): IrisV5 {
  const aj = ajusteDemoV5(cenario, agora);
  const ag = agora.getTime();
  const per: Janela = { ini: Date.parse(janela.iniISO), fim: Date.parse(janela.fimISO) };
  const ant: Janela = { ini: Date.parse(janela.antIniISO), fim: Date.parse(janela.antFimISO) };
  const eraDesde = Date.parse(`${addDias(diaDe(ag), -32)}T00:00:00-03:00`);
  const leads = leadsDemoV5(diaDe(Math.max(eraDesde, Math.min(per.ini, ant.ini) - 10 * DIA)), addDias(diaDe(ag), 1), aj);
  const sessoes = leads.map((l) => irisDoLead(l, eraDesde)).filter((s): s is IrisLead => s !== null);

  const funilDe = (j: Janela): IrisFunilV5 => {
    let atendidas = 0; let coorte = 0; let qualificadas = 0; let reprovadas = 0; let propostas = 0;
    let sim = 0; let duvida = 0; let nao = 0; let algum = 0; let completos = 0; let estritos = 0; let fechouAceite = 0;
    for (const s of sessoes) {
      const falou = dentro(s.criado + 2 * MIN, j, ag)
        || (s.qual != null && dentro(s.qual.em, j, ag))
        || (s.prop != null && dentro(s.prop, j, ag))
        || (s.conclusaoEm != null && dentro(s.conclusaoEm, j, ag));
      if (falou) atendidas++;
      if (dentro(s.criado, j, ag)) coorte++;
      if (s.qual && dentro(s.qual.em, j, ag)) { if (s.qual.passa) qualificadas++; else reprovadas++; }
      if (s.prop != null && dentro(s.prop, j, ag)) propostas++;
      if (s.aceite && dentro(s.aceite.em, j, ag)) {
        if (s.aceite.leitura === 'sim') sim++; else if (s.aceite.leitura === 'duvida') duvida++; else nao++;
      }
      if (s.algumEm != null && dentro(s.algumEm, j, ag)) algum++;
      if (s.conclusaoEm != null && dentro(s.conclusaoEm, j, ag)) {
        completos++;
        if (s.estrito) estritos++;
        if (s.aceite?.leitura === 'sim') fechouAceite++;
      }
    }
    return {
      atendidasSessoes: atendidas, atendidasContatos: atendidas, coorteNovas: coorte,
      qualificadas, reprovadas, propostasPortab: propostas,
      aceiteSim: sim, aceiteDuvida: duvida, aceiteNao: nao,
      docsAlgum: algum, docsCompletos: completos, docsCompletosEstrito: estritos, fechouAceite,
    };
  };

  /* faltas: foto do agora (em coleta sem completar) */
  const faltas = { universo: 0, comprovante: 0, email: 0, identidade: 0, soOutroLado: 0, nadaDos3: 0, comprPendenteAnalista: 0 };
  for (const s of sessoes) {
    if (s.prop == null || s.conclusaoEm != null || s.prop > ag) continue;
    faltas.universo++;
    if (!s.comprOk) faltas.comprovante++;
    if (!s.emailOk) faltas.email++;
    if (!s.identOk) faltas.identidade++;
    if (!s.identOk && s.identAlgum && s.comprOk && s.emailOk) faltas.soOutroLado++;
    if (!s.identAlgum && !s.comprOk && !s.emailOk) faltas.nadaDos3++;
    if (s.comprOk && !s.estrito) faltas.comprPendenteAnalista++;
  }

  /* tempo (sessões concluídas na janela) */
  const minutos = sessoes
    .filter((s) => s.conclusaoEm != null && dentro(s.conclusaoEm, per, ag))
    .map((s) => (s.conclusaoEm! - s.criado) / MIN);

  /* etapas (estado) e por campanha */
  const etapas: Record<string, number> = {};
  const porCampMapa = new Map<string, { sessoes: number; docs: number }>();
  for (const s of sessoes) {
    etapas[s.etapa] = (etapas[s.etapa] ?? 0) + 1;
    let x = porCampMapa.get(s.campanha);
    if (!x) { x = { sessoes: 0, docs: 0 }; porCampMapa.set(s.campanha, x); }
    if (dentro(s.criado, per, ag)) x.sessoes++;
    if (s.conclusaoEm != null && dentro(s.conclusaoEm, per, ag)) x.docs++;
  }

  /* série diária */
  const dias = new Map<string, { atendidas: number; qualificadas: number; docsCompletos: number }>();
  const diaRec = (d: string) => {
    let x = dias.get(d);
    if (!x) { x = { atendidas: 0, qualificadas: 0, docsCompletos: 0 }; dias.set(d, x); }
    return x;
  };
  for (const s of sessoes) {
    const ativos = new Set<string>();
    for (const t of [s.criado + 2 * MIN, s.qual?.em, s.prop ?? undefined, s.conclusaoEm ?? undefined]) {
      if (t != null && dentro(t, per, ag)) ativos.add(diaDe(t));
    }
    for (const d of ativos) diaRec(d).atendidas++;
    if (s.qual?.passa && dentro(s.qual.em, per, ag)) diaRec(diaDe(s.qual.em)).qualificadas++;
    if (s.conclusaoEm != null && dentro(s.conclusaoEm, per, ag)) diaRec(diaDe(s.conclusaoEm)).docsCompletos++;
  }

  return {
    geradoEm: agora.toISOString(),
    periodo: { inicio: janela.iniISO, fim: janela.fimISO },
    exatidaoAtendidas: 'banda_5pct',
    funil: funilDe(per),
    funilAnt: funilDe(ant),
    faltas,
    tempo: { n: minutos.length, medianaMin: r1(mediana(minutos)), p90H: r1(p90(minutos) == null ? null : p90(minutos)! / 60) },
    etapas,
    porCampanha: [...porCampMapa].map(([campanha, x]) => ({ campanha, sessoes: x.sessoes, docsCompletos: x.docs }))
      .filter((x) => x.sessoes + x.docsCompletos > 0)
      .sort((a, b) => b.sessoes - a.sessoes || a.campanha.localeCompare(b.campanha)),
    serie: [...dias].map(([dia, x]) => ({ dia, ...x })).sort((a, b) => a.dia.localeCompare(b.dia)),
  };
}
