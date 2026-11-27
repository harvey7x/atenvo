// regua.ts — regras PURAS da régua (sem banco, sem rede): datas, quem vence em
// cada dia, grupos, variáveis. O motor (index.ts) e a PRÉVIA usam exatamente
// estas funções — o que a tela mostra é o que o motor faz. Testes: regua_test.ts.

export const d2 = (n: number) => String(n).padStart(2, '0');
export type DiasEnvio = 'todos' | 'uteis' | 'uteis_sabado';

/* ---------- datas ISO 'YYYY-MM-DD' (aritmética em UTC puro, sem fuso) ---------- */
export const isoDe = (d: Date) => `${d.getUTCFullYear()}-${d2(d.getUTCMonth() + 1)}-${d2(d.getUTCDate())}`;
export const dataDe = (iso: string) => new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)));
export const somaDias = (iso: string, n: number) => { const d = dataDe(iso); d.setUTCDate(d.getUTCDate() + n); return isoDe(d); };
export const compDe = (iso: string) => iso.slice(0, 7);
export const compSoma = (comp: string, n: number) => {
  const [y, m] = comp.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${d2(d.getUTCMonth() + 1)}`;
};
/** horário do Brasil sem depender do fuso do servidor (o Brasil não tem mais horário de verão) */
export const BRT_MS = -3 * 3600_000;
export const agoraBRT = (agora = Date.now()) => new Date(agora + BRT_MS);   // ler com getUTC*
export const hojeBRT = (agora = Date.now()) => isoDe(agoraBRT(agora));
/** dia (BRT) de um timestamp — ex.: quando o cliente passou a ter o dia de vencimento atual */
export const diaBRTde = (ts: string | null) => (ts ? isoDe(new Date(new Date(ts).getTime() + BRT_MS)) : null);

/* ---------- feriados: a MESMA lista do Calendário (src/v2/pages/cicloCalendario.ts) ---------- */
function pascoa(y: number): { m: number; d: number } {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25),
    g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4,
    l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451),
    mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  return { m: mes, d: dia };
}
const _feriados = new Map<number, Set<string>>();
export function feriadosDoAno(y: number): Set<string> {
  const pronto = _feriados.get(y); if (pronto) return pronto;
  const p = pascoa(y);
  const base = `${y}-${d2(p.m)}-${d2(p.d)}`;
  const off = (n: number) => somaDias(base, n).slice(5);
  const s = new Set(['01-01', '04-21', '05-01', '09-07', '09-20', '10-12', '11-02', '11-15', '11-20', '12-25', off(-47), off(-2), off(60)]);
  _feriados.set(y, s);
  return s;
}
/** pode mandar mensagem nesse dia? ('todos' = qualquer dia — escolha do dono 24/09) */
export function diaPermitido(iso: string, dias: DiasEnvio): boolean {
  if (dias === 'todos') return true;
  const dow = dataDe(iso).getUTCDay();
  if (dow === 0) return false;
  if (dow === 6 && dias !== 'uteis_sabado') return false;
  return !feriadosDoAno(+iso.slice(0, 4)).has(iso.slice(5));
}
/** vencimento padrão do ciclo `dia` na competência `comp`: dia 31 num mês de 30 → 30;
    em "dias úteis", fim de semana/feriado empurra pro próximo dia permitido (= Calendário) */
export function vencPadrao(dia: number, comp: string, dias: DiasEnvio): string {
  const [y, m] = comp.split('-').map(Number);
  const teto = new Date(Date.UTC(y, m, 0)).getUTCDate();
  let iso = `${comp}-${d2(Math.min(dia, teto))}`;
  for (let i = 0; i < 15 && !diaPermitido(iso, dias); i++) iso = somaDias(iso, 1);
  return iso;
}
/** data de um passo: vencimento + quando. Em "dias úteis": lembrete (antes) ANTECIPA
    pro dia permitido anterior; no dia/depois ADIA pro próximo. */
export function dataDoPasso(venc: string, quando: number, dias: DiasEnvio): string {
  let iso = somaDias(venc, quando);
  const passo = quando < 0 ? -1 : 1;
  for (let i = 0; i < 15 && !diaPermitido(iso, dias); i++) iso = somaDias(iso, passo);
  return iso;
}

/* ---------- datas ESCRITAS na Gestão (dono 26/10: "o que tá lá é pra seguir") ----------
   O cabeçalho de cada mês de cada ciclo traz a data da cobrança que a equipe digita
   ("26/out", "03/nov", "26/10"). A régua segue essa data. Só vale se o mês escrito for o
   MESMO da coluna (competência) — data de outro mês na coluna é digitação errada e cai na
   regra seguinte (Calendário, depois o dia do ciclo). O ano vem da competência. */
const MESES_PT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export function dataDoCabecalho(texto: string | null | undefined, comp: string): string | null {
  if (!/^\d{4}-\d{2}$/.test(comp)) return null;
  const t = String(texto ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
  const m = t.match(/^(\d{1,2})\s*[/\-.]\s*([a-z]{3,}|\d{1,2})(?![\d])(?:\s*[/\-.]\s*(\d{2}|\d{4})(?![\d]))?/);
  if (!m) return null;
  const dd = Number(m[1]);
  const mes = /^\d/.test(m[2]) ? Number(m[2]) : MESES_PT.indexOf(m[2].slice(0, 3)) + 1;
  const [y, cm] = comp.split('-').map(Number);
  if (mes !== cm) return null;
  if (m[3] && Number(m[3]) !== (m[3].length === 2 ? y % 100 : y)) return null;   // ano escrito de outro ano
  const teto = new Date(Date.UTC(y, mes, 0)).getUTCDate();
  if (!(dd >= 1 && dd <= teto)) return null;
  return `${comp}-${d2(dd)}`;
}
export type CabecalhoMes = {
  dia: number | null; comp_base: string | null; mes_pos: number | null; texto: string | null;
  /** desempate (regra do banco): bloco mais antigo, depois o 1º cabeçalho na ordem da grade */
  bloco_criado?: string | null; ordem?: number | null;
};
/** dia do ciclo → competência → data escrita no cabeçalho do mês daquele ciclo na Gestão.
    A MESMA data numa competência em dois ciclos diferentes só vale pro ciclo mais antigo:
    ciclo novo criado ao mover turma copia o cabeçalho do D24/D01 (pl_bloco_para) — essa cópia
    não é a data dele, então ele cai no Calendário/dia do ciclo. */
export function datasDaGestao(cabs: CabecalhoMes[]): Map<number, Map<string, string>> {
  const out = new Map<number, Map<string, string>>();
  const dono = new Map<string, number>();   // comp|data → ciclo que ficou com ela
  // empate de criação (a recarga da planilha recria todos os blocos juntos): o modelo da cópia
  // (D24 pros ciclos ≥ 15, D01 pros < 15 — pl_bloco_para) vence antes de olhar o número do ciclo
  const modelo = (c: CabecalhoMes) => (Number(c.dia) === 24 || Number(c.dia) === 1 ? 0 : 1);
  const ord = [...cabs].sort((a, b) => String(a.bloco_criado ?? '').localeCompare(String(b.bloco_criado ?? ''))
    || modelo(a) - modelo(b) || Number(a.dia ?? 0) - Number(b.dia ?? 0) || Number(a.ordem ?? 0) - Number(b.ordem ?? 0));
  for (const c of ord) {
    const dia = Number(c.dia ?? 0), k = Number(c.mes_pos);
    if (c.mes_pos == null || !(dia >= 1 && dia <= 31) || !/^\d{4}-\d{2}$/.test(String(c.comp_base ?? '')) || !(k >= 0)) continue;
    const comp = compSoma(String(c.comp_base), k);
    const iso = dataDoCabecalho(c.texto, comp);
    if (!iso) continue;
    const porComp = out.get(dia) ?? out.set(dia, new Map()).get(dia)!;
    if (porComp.has(comp)) continue;
    const d0 = dono.get(`${comp}|${iso}`);
    if (d0 != null && d0 !== dia) continue;
    dono.set(`${comp}|${iso}`, dia);
    porComp.set(comp, iso);
  }
  return out;
}

/* ---------- régua própria do comercial (dono 26/10) ----------
   comercial (normNome) → passo da sequência padrão → blocos da versão dele. Só troca a MENSAGEM
   de passos 'padrao' (grupo e cliente específico ficam como estão); o passo (id, nome, dias)
   continua o da padrão — trava do mês, "cobrança primeiro" e Envios não mudam. */
export type Versoes = Map<string, Map<string, { id: string; blocos: unknown; excluida?: boolean; quando?: number | null }>>;
export function versoesPor(rows: { id: string; passo_id: string; comercial: string; blocos: unknown; excluida?: boolean | null; quando?: number | null }[]): Versoes {
  const out: Versoes = new Map();
  for (const r of rows) {
    const k = normNome(r.comercial); if (!k) continue;
    (out.get(k) ?? out.set(k, new Map()).get(k)!).set(r.passo_id, { id: r.id, blocos: r.blocos, excluida: r.excluida === true, quando: r.quando ?? null });
  }
  return out;
}
/** o comercial do cliente EXCLUIU este passo da régua dele (mig 75): o passo não sai pros clientes dele */
export function passoExcluido(versoes: Versoes | undefined, l: LeadR, m: MsgR): boolean {
  return !!versoes && m.alvo === 'padrao' && versoes.get(normNome(l.comercial))?.get(m.id)?.excluida === true;
}
/** a régua do comercial do cliente aplicada num passo da padrão: a MENSAGEM (se a dele tiver algo
    que sai; senão vale a da padrão) e o DIA (v20, mig 76: quando próprio; a Cobrança do dia nunca muda). */
export function aplicarVersao(versoes: Versoes | undefined, l: LeadR, m: MsgR): MsgR {
  if (!versoes || m.alvo !== 'padrao') return m;
  const v = versoes.get(normNome(l.comercial))?.get(m.id);
  if (!v || v.excluida) return m;   // excluída não chega aqui (devidosNoDia já tira o passo)
  const q0 = Number(m.quando ?? 0);
  // dia próprio só do mesmo lado do vencimento (o banco já garante; aqui por segurança) e nunca a Cobrança do dia
  const q = v.quando != null && q0 !== 0 && Math.sign(Number(v.quando)) === Math.sign(q0) ? Number(v.quando) : q0;
  const temMsg = partesEnviaveis(v.blocos).length > 0;
  if (!temMsg && q === q0) return m;
  return { ...m, quando: q, ...(temMsg ? { blocos: v.blocos } : {}), versao: v.id };
}

/* ---------- "cobrança primeiro": quando a Cobrança do dia já entrou ----------
   Mapa `lead|comp` e `tel:<chave>|comp|<ciclo>` → 1º dia (BRT) em que a Cobrança do dia daquela
   competência entrou na fila/saiu. O telefone vale só DENTRO do mesmo ciclo: 2 cadastros do
   mesmo ciclo no mesmo número são a mesma cobrança (recebe 1 vez); em ciclos diferentes cada
   um tem a sua Cobrança (contratos/pessoas diferentes no mesmo número). */
export function diaCobrado(cobradoEm: Map<string, string>, l: LeadR, comp: string): string | null {
  const a = cobradoEm.get(`${l.id}|${comp}`) ?? null;
  const ch = chaveTel(l.telefone);
  const b = ch && l.dia != null ? cobradoEm.get(`tel:${ch}|${comp}|${Number(l.dia)}`) ?? null : null;
  return a && b ? (a < b ? a : b) : (a ?? b);
}
export function marcarCobrado(cobradoEm: Map<string, string>, leadId: string | null, telefone: string | null, ciclo: number | null, comp: string, dia: string) {
  const ch = chaveTel(telefone);
  const ks = [leadId ? `${leadId}|${comp}` : null, ch && ciclo != null ? `tel:${ch}|${comp}|${Number(ciclo)}` : null];
  for (const k of ks) if (k) { const v = cobradoEm.get(k); if (!v || dia < v) cobradoEm.set(k, dia); }
}

/* ---------- população e mensagens ---------- */
export type LeadR = {
  id: string; nome: string; comercial: string | null; dia: number | null; telefone: string | null;
  dia_alterado_em: string | null; valor: number | null; situacao?: string | null;
};
export type MsgR = {
  id: string; alvo: 'padrao' | 'grupo' | 'cliente' | 'script'; nome: string; quando: number; blocos: unknown;
  criterio: string | null; cli_id: string | null; data_envio: string | null; grupo_nome?: string | null;
  /** régua do comercial (mig 74): id da versão cujos blocos substituíram os da padrão — o PASSO continua o mesmo */
  versao?: string | null;
};
export type Devido = {
  lead: LeadR; msg: MsgR; comp: string | null; venc: string | null; chave: string; data: string;
  /** "cobrança primeiro": id do passo de atraso que esta Cobrança do dia substituiu */
  substitui?: string | null;
};

/** nome normalizado pra comparar comercial × dono do número ("Emillyn" = "EMILLYN " = "émillyn") */
export const normNome = (s: string | null | undefined) =>
  String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().replace(/\s+/g, ' ').toUpperCase();
/** "eduardo" / "JUNIOR" → "Eduardo" / "Junior" (texto que o cliente lê) */
export const nomeBonito = (s: string | null | undefined) => String(s ?? '').trim().toLowerCase()
  .replace(/(^|[\s'-])(\p{L})/gu, (_m, a: string, b: string) => a + b.toUpperCase())
  .replace(/\b(De|Da|Do|Dos|Das|E)\b/g, (w) => w.toLowerCase());

/** chave do telefone = DDD + 8 últimos dígitos (a mesma do banco: public.wa_tel_chave) */
export function chaveTel(t: string | null | undefined): string | null {
  let d = String(t ?? '').replace(/\D/g, '').replace(/^0+/, '');   // "(051) 9…" = "51 9…" (igual ao banco)
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2);
  if (d.length < 10) return null;
  return d.slice(0, 2) + d.slice(-8);
}
/** candidatos pro WhatsApp (com e sem o 9), já com 55 — a Evolution confirma qual existe */
export function candidatosTel(t: string): string[] {
  let d = String(t ?? '').replace(/\D/g, '').replace(/^0+/, '');
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2);
  if (d.length === 11) return [`55${d}`, `55${d.slice(0, 2)}${d.slice(3)}`];
  if (d.length === 10) return [`55${d}`, `55${d.slice(0, 2)}9${d.slice(2)}`];
  return d ? [d] : [];
}

export type Comportamento = 'em_dia' | 'voltou' | 'faltou' | 'inadimplente';
export function casaCriterio(criterio: string | null, l: LeadR, comportamentoDe?: (id: string) => Comportamento): boolean {
  const c = String(criterio ?? 'todos');
  if (c === 'todos') return true;
  if (c.startsWith('atend:')) return normNome(l.comercial) === normNome(c.slice(6));
  if (c.startsWith('comp:')) return !!comportamentoDe && comportamentoDe(l.id) === c.slice(5);
  return false;
}

/** quem recebe o quê NESTE dia (antes de olhar pagamento/número/opt-out).
    · sequência padrão: vencimento EFETIVO (data ESCRITA na Gestão; senão a manual do Calendário;
      senão o dia do ciclo) + quando;
    · cobrança primeiro (dono 26/10): aviso de atraso/retomada só pra quem recebeu a Cobrança do
      dia (quando 0) daquela competência num dia ANTERIOR — senão sai a Cobrança no lugar, com trava
      própria do dia (`comp@data`), e os passos seguintes continuam a partir dela. A Cobrança que
      entrou HOJE segura o aviso o dia todo (mesmo se o passo da Cobrança for pausado no meio do dia).
      Sem `o.cobradoEm`, nada disso muda (comportamento antigo);
    · grupo: SUBSTITUI a mensagem padrão do MESMO "quando" pra quem está no grupo (contrato da demo);
    · mensagem de atraso (quando>0) nunca casa vencimento anterior à troca de dia do cliente;
    · 1 vez por cliente×mensagem no dia (datas manuais que coincidem não duplicam). */
export function devidosNoDia(
  hoje: string, leads: LeadR[], msgs: MsgR[], manual: Map<number, Map<string, string>>, dias: DiasEnvio,
  comportamentoDe?: (id: string) => Comportamento,
  o: { gestao?: Map<number, Map<string, string>>; cobradoEm?: (l: LeadR, comp: string) => string | null; versoes?: Versoes } = {},
): Devido[] {
  const padrao = msgs.filter((m) => m.alvo === 'padrao');
  const grupos = msgs.filter((m) => m.alvo === 'grupo');
  // ±2 meses: um dia próprio de até ±30 dias (mig 76) ainda casa com a competência certa
  const comps = [-2, -1, 0, 1, 2].map((n) => compSoma(compDe(hoje), n));
  const out: Devido[] = [];
  const visto = new Set<string>();
  for (const l of leads) {
    const doCliente: Devido[] = [];
    const dia = Number(l.dia ?? 0);
    if (!(dia >= 1 && dia <= 31)) continue;
    const desde = diaBRTde(l.dia_alterado_em);
    const dosGrupos = grupos.filter((g) => casaCriterio(g.criterio, l, comportamentoDe));
    const quandosGrupo = new Set(dosGrupos.map((g) => Number(g.quando ?? 0)));
    // passo excluído na régua do comercial do cliente some pra ele (e, se for a Cobrança do dia, não
    // existe "cobrança primeiro" pra ele: os avisos seguem como numa régua sem Cobrança)
    // o grupo substitui o passo da padrão pelo dia ORIGINAL dele; o que sobra já vem com a régua do
    // comercial aplicada (mensagem e dia próprios) — a conta de data abaixo usa o dia dele
    const doLead = [...dosGrupos, ...padrao.filter((p) => !quandosGrupo.has(Number(p.quando ?? 0)) && !passoExcluido(o.versoes, l, p))
      .map((p) => aplicarVersao(o.versoes, l, p))];
    const cobrancaDoDia = doLead.find((m) => Number(m.quando ?? 0) === 0) ?? null;
    for (const comp of comps) {
      const venc = o.gestao?.get(dia)?.get(comp) ?? manual.get(dia)?.get(comp) ?? vencPadrao(dia, comp, dias);
      for (const m of doLead) {
        const q = Number(m.quando ?? 0);
        if (dataDoPasso(venc, q, dias) !== hoje) continue;
        if (q > 0 && desde && venc < desde) continue;
        // a ordem nunca inverte nem encosta (dias úteis com data escrita num sábado: o aviso +2
        // cairia no mesmo dia da cobrança empurrada pra segunda)
        const diaD = dataDoPasso(venc, 0, dias);
        if ((q > 0 && hoje <= diaD) || (q < 0 && hoje >= diaD)) continue;
        const quando0 = o.cobradoEm ? o.cobradoEm(l, comp) : null;
        // a Cobrança desta competência já saiu num dia anterior (no lugar de um aviso, ou a data
        // mudou na Gestão / o cliente mudou de ciclo): não repete
        if (q === 0 && quando0 && quando0 < hoje) continue;
        // a Cobrança entrou HOJE e o passo dela não está mais na régua (pausado no meio do dia): o aviso espera
        if (q > 0 && quando0 === hoje && !cobrancaDoDia) continue;
        const troca = q > 0 && !!cobrancaDoDia && !!o.cobradoEm && !(quando0 && quando0 < hoje);
        const passo = troca ? cobrancaDoDia! : m;
        const k = `${l.id}|${passo.id}`;
        if (visto.has(k)) continue;
        visto.add(k);
        const msgFinal = passo;   // já com a régua do comercial do cliente aplicada (doLead)
        doCliente.push(troca
          ? { lead: l, msg: msgFinal, comp, venc, chave: `${comp}@${hoje}`, data: hoje, substitui: m.id }
          : { lead: l, msg: msgFinal, comp, venc, chave: comp, data: hoje });
      }
    }
    // NO MÁXIMO 1 mensagem da régua por cliente por dia (v21): dias próprios do comercial, a padrão
    // mudada depois ou um grupo podem fazer dois passos caírem juntos — vai o mais importante:
    // a Cobrança, depois o atraso mais perto do vencimento, depois o lembrete mais perto
    if (doCliente.length > 1) {
      const peso = (x: Devido) => { const q = Number(x.msg.quando ?? 0); return q === 0 ? 0 : q > 0 ? 1 + q / 1000 : 2 + Math.abs(q) / 1000; };
      doCliente.sort((a, b) => peso(a) - peso(b));
      out.push(doCliente[0]);
    } else out.push(...doCliente);
  }
  return out;
}
/** mensagens "cliente específico" do dia (o cliente pode estar em qualquer situação) */
export function devidosClienteNoDia(hoje: string, msgs: MsgR[], leadPorId: Map<string, LeadR>): Devido[] {
  const out: Devido[] = [];
  for (const m of msgs) {
    if (m.alvo !== 'cliente' || !m.cli_id || m.data_envio !== hoje) continue;
    const lead = leadPorId.get(m.cli_id);
    if (lead) out.push({ lead, msg: m, comp: null, venc: null, chave: `dia:${hoje}`, data: hoje });
  }
  return out;
}

/* ---------- comportamento (grupos 'comp:'): as 2 últimas células DEFINIDAS até o mês atual ---------- */
export function comportamentoPor(ordem: string[], celulas: Map<string, Map<string, string>>, compAtual: string) {
  const comps = ordem.filter((c) => c <= compAtual);   // competência futura (dado de teste) não conta
  return (id: string): Comportamento => {
    const cel = celulas.get(id);
    const def = comps.map((c) => cel?.get(c)).filter(Boolean) as string[];
    const ult = def[def.length - 1], ant = def[def.length - 2];
    if (!ult) return 'em_dia';
    if (ult === 'pago') return ant === 'nao_pagou' ? 'voltou' : 'em_dia';
    return ant === 'nao_pagou' ? 'inadimplente' : 'faltou';
  };
}

/* ---------- variáveis (os MESMOS números da Gestão) ----------
   DINHEIRO = SEMPRE A MEIA PARCELA (dono 27/10: "a gente só cobra o cliente a meia parcela… sempre que
   cobrar um cliente, vai ser a meia parcela"): {meia parcela} = {valor} = {parcela mensal} = parcela ÷ 2.
   {valor da parcela} saiu da tela; se ainda estiver escrito numa mensagem antiga, TAMBÉM vira a meia
   parcela — a parcela inteira nunca vai pro cliente
   {vencimento} = "dia DD" do vencimento efetivo ("dia DD/MM" se for de outro mês)
   {nome} = primeiro nome · {nome completo} · {atendente}/{nome do atendente}
   REGRA DURA: variável usada sem o dado no cadastro = erro explicado, nunca mensagem quebrada. */
export type DadosVars = { nome: string; valorParcela: number | null; atendente: string; venc: string | null; dia: number | null; hoje: string };
const fmtBRL = (v: number) => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const primeiroNome = (n: string) => {
  const p = (n || '').trim().split(/\s+/)[0] ?? '';
  return p ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : '';
};
export function textoVencimento(d: DadosVars): string {
  if (d.venc) {
    const dd = d.venc.slice(8, 10), mm = d.venc.slice(5, 7);
    return d.venc.slice(0, 7) === d.hoje.slice(0, 7) ? dd : `${dd}/${mm}`;
  }
  return d.dia != null && d.dia > 0 ? d2(d.dia) : '';
}
export function faltandoVars(texto: string, d: DadosVars): string[] {
  const f: string[] = [];
  if (/\{nome( completo)?\}/i.test(texto) && !(d.nome || '').trim()) f.push('nome do cliente');
  if (/\{(valor da parcela|parcela mensal|meia parcela|valor)\}/i.test(texto) && !(d.valorParcela != null && d.valorParcela > 0)) f.push('valor da parcela na Gestão');
  if (/\{vencimento\}/i.test(texto) && !textoVencimento(d)) f.push('ciclo/dia de vencimento');
  if (/\{(nome do atendente|atendente)\}/i.test(texto) && !(d.atendente || '').trim()) f.push('nome do atendente');
  return f;
}
export function aplicarVars(texto: string, d: DadosVars): string {
  const falta = faltandoVars(texto, d);
  if (falta.length) throw new Error(`sem ${falta.join(' e ')} — complete o cadastro na Gestão`);
  const venc = textoVencimento(d);
  return texto
    .replace(/\{nome completo\}/gi, (d.nome || '').trim())
    .replace(/\{nome\}/gi, primeiroNome(d.nome))
    .replace(/\{valor da parcela\}/gi, d.valorParcela != null ? fmtBRL(d.valorParcela / 2) : '')
    .replace(/\{parcela mensal\}/gi, d.valorParcela != null ? fmtBRL(d.valorParcela / 2) : '')
    .replace(/\{meia parcela\}/gi, d.valorParcela != null ? fmtBRL(d.valorParcela / 2) : '')
    .replace(/\{valor\}/gi, d.valorParcela != null ? fmtBRL(d.valorParcela / 2) : '')
    .replace(/dia \{vencimento\}/gi, venc ? `dia ${venc}` : '')
    .replace(/\{vencimento\}/gi, venc ? `dia ${venc}` : '')
    .replace(/\{nome do atendente\}/gi, d.atendente || '')
    .replace(/\{atendente\}/gi, d.atendente || '');
}

/* ---------- blocos da mensagem ---------- */
export type Parte = { tipo: string; corpo?: string; nome?: string; path?: string; espera?: number };
/** partes enviáveis: texto escrito OU arquivo persistido (path no bucket) */
export const partesEnviaveis = (blocos: unknown): Parte[] =>
  (Array.isArray(blocos) ? blocos as Parte[] : []).filter((b) => b && (b.tipo === 'texto' ? String(b.corpo ?? '').trim() : !!b.path));
const ROT_MIDIA: Record<string, string> = { imagem: 'Imagem', video: 'Vídeo', audio: 'Áudio', documento: 'Documento' };
/** a mensagem como o cliente lê (pra tela Envios e prévia): texto resolvido + marcadores de arquivo */
export function mensagemLegivel(partes: Parte[], d: DadosVars): string {
  return partes.map((b) => {
    const tx = String(b.corpo ?? '').trim() ? aplicarVars(String(b.corpo).trim(), d) : '';
    if (b.tipo === 'texto') return tx;
    const rot = `[${ROT_MIDIA[b.tipo] ?? 'Arquivo'}${b.nome ? `: ${b.nome}` : ''}]`;
    return tx ? `${rot} ${tx}` : rot;
  }).filter(Boolean).join('\n\n');
}

/* ---------- erros: passageiro (tenta de novo) × definitivo ---------- */
export function erroPassageiro(msg: string): boolean {
  const m = msg.toLowerCase();
  if (/sem .*(complete o cadastro|na gestão)|não tem whatsapp|nao tem whatsapp|not exist|invalid|inválid|arquivo da mensagem|mensagem vazia|telefone vazio/.test(m)) return false;
  return /timeout|timed out|econn|network|fetch failed|socket|connection|closed|503|502|500|504|429|rate|temporar|indispon|unavailable|gateway/.test(m);
}
