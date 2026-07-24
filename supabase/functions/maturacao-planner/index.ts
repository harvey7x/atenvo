// maturacao-planner — monta o plano do DIA para cada chip em aquecimento.
// Cron 1x/dia. Não envia nada: só popula `maturacao_agenda`, que o `maturacao-runner` consome.
//
// Planejar antes de executar torna a rampa determinística e auditável: dá para OLHAR o dia
// inteiro antes de ele acontecer, inclusive em dry_run.
//
// As quatro regras que fazem o aquecimento parecer humano estão aqui:
//   1. RAMPA — volume cresce devagar por semanas (curva em maturacao_config.rampa, editável).
//   2. TOPOLOGIA ROTATIVA — com 5 chips só existem 10 pares; sem rodízio o mesmo par é martelado.
//   3. SEMENTES — a partir de `dia_sementes`, parte do volume vai para números EXTERNOS ao pool.
//      É o que impede a assinatura de "cluster fechado", o padrão mais fácil de detectar.
//   4. RECIPROCIDADE — quem recebe responde depois de alguns minutos. Conversa de mão única
//      não aquece: o WhatsApp pontua a troca, não o disparo.
//
// Auth: x-maturacao-secret == webhook_config.maturacao. Deploy --no-verify-jwt.
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// fração do volume diário que o chip INICIA; o resto chega como resposta ao que ele recebeu
const FRACAO_ABERTURA = 0.6;
const GAP_MINIMO_MIN = 3;      // nunca dois envios do mesmo chip a menos disto
const RESPOSTA_MIN = 1;        // atraso mínimo de uma resposta (min)
const RESPOSTA_MAX = 8;        // atraso máximo de uma resposta (min)

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-maturacao-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

function safeEqual(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

const aleatorio = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1));
function embaralhar<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
const sorteia = <T,>(arr: T[]): T | null => (arr.length ? arr[Math.floor(Math.random() * arr.length)] : null);

// ── fuso: o dia e a janela horária são do escritório, não do servidor ────────
function offsetMinutos(d: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const p = dtf.formatToParts(d).reduce((a, x) => { a[x.type] = x.value; return a; }, {} as Record<string, string>);
  const comoUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  return (comoUtc - d.getTime()) / 60000;
}

function hojeLocal(agora: Date, tz: string): { ano: number; mes: number; dia: number; diaSemana: number } {
  const dtf = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
  const [ano, mes, dia] = dtf.format(agora).split('-').map(Number);
  const diaSemana = new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay();
  return { ano, mes, dia, diaSemana };
}

// instante UTC correspondente a HH:MM do dia local
function instanteLocal(d: { ano: number; mes: number; dia: number }, hora: number, minuto: number, tz: string): Date {
  const chute = Date.UTC(d.ano, d.mes - 1, d.dia, hora, minuto);
  const off = offsetMinutos(new Date(chute), tz);
  return new Date(chute - off * 60000);
}

interface Faixa { ate_dia: number; min: number; max: number; tipos: string[] }
interface Chip { id: string; apelido: string; numero_conectado: string | null; dia_rampa: number }
interface Semente { id: string; numero: string }
interface Conteudo { id: string; tipo: string; categoria: string; texto: string | null }

function faixaDoDia(rampa: Faixa[], dia: number): Faixa | null {
  const ordenada = [...rampa].sort((a, b) => a.ate_dia - b.ate_dia);
  return ordenada.find((f) => dia <= f.ate_dia) ?? ordenada[ordenada.length - 1] ?? null;
}

// Horários espalhados na janela com folga mínima entre envios do mesmo chip.
// Sem o gap, o sorteio uniforme junta dois envios em segundos — padrão de robô.
function horarios(qtd: number, hIni: number, hFim: number, dia: { ano: number; mes: number; dia: number }, tz: string): Date[] {
  if (qtd <= 0) return [];
  const janela = (hFim - hIni) * 60;
  const brutos = Array.from({ length: qtd }, () => aleatorio(0, Math.max(1, janela - 1))).sort((a, b) => a - b);
  const ajustados: number[] = [];
  let anterior = -Infinity;
  for (const m of brutos) {
    const v = Math.max(m, anterior + GAP_MINIMO_MIN);
    if (v >= janela) break;                 // estourou a janela: corta o excedente do dia
    ajustados.push(v);
    anterior = v;
  }
  return ajustados.map((m) => instanteLocal(dia, hIni + Math.floor(m / 60), m % 60, tz));
}

interface LinhaAgenda {
  organizacao_id: string; chip_origem_id: string; destino_tipo: 'chip' | 'semente';
  chip_destino_id: string | null; semente_id: string | null; numero_destino: string;
  executar_em: string; tipo: string; conteudo_id: string | null; texto_snapshot: string | null;
  metadados: Record<string, unknown>;
}

async function planejarOrg(admin: SupabaseClient, cfg: Record<string, unknown>): Promise<Record<string, unknown>> {
  const org = cfg.organizacao_id as string;
  const tz = (cfg.timezone as string) ?? 'America/Sao_Paulo';
  const agora = new Date();
  const local = hojeLocal(agora, tz);

  const dias = (cfg.dias_semana as number[]) ?? [1, 2, 3, 4, 5, 6];
  if (!dias.includes(local.diaSemana)) return { org, pulado: 'dia_nao_util', dia_semana: local.diaSemana };

  const { data: chipsRaw } = await admin.from('maturacao_chips')
    .select('id, apelido, numero_conectado, dia_rampa')
    .eq('organizacao_id', org).eq('status_maturacao', 'aquecendo').eq('status_integracao', 'conectado');
  const chips = (chipsRaw ?? []).filter((c) => c.numero_conectado) as Chip[];
  if (chips.length < 2) return { org, pulado: 'menos_de_2_chips_conectados', chips: chips.length };

  const { data: sementesRaw } = await admin.from('maturacao_sementes')
    .select('id, numero').eq('organizacao_id', org).eq('ativo', true);
  const sementes = (sementesRaw ?? []) as Semente[];

  const { data: conteudoRaw } = await admin.from('maturacao_conteudo')
    .select('id, tipo, categoria, texto').eq('organizacao_id', org).eq('ativo', true);
  const conteudos = (conteudoRaw ?? []) as Conteudo[];
  if (!conteudos.length) return { org, pulado: 'biblioteca_de_conteudo_vazia' };

  // Idempotência: se o cron rodar duas vezes no mesmo dia, não duplica o plano.
  const inicioDia = instanteLocal(local, 0, 0, tz).toISOString();
  const fimDia = instanteLocal(local, 23, 59, tz).toISOString();
  const { data: jaPlanejado } = await admin.from('maturacao_agenda')
    .select('chip_origem_id').eq('organizacao_id', org)
    .gte('executar_em', inicioDia).lte('executar_em', fimDia);
  const comPlano = new Set((jaPlanejado ?? []).map((r) => r.chip_origem_id as string));

  const rampa = (cfg.rampa as Faixa[]) ?? [];
  const hIni = (cfg.hora_inicio as number) ?? 8;
  const hFim = (cfg.hora_fim as number) ?? 21;
  const diaSementes = (cfg.dia_sementes as number) ?? 15;
  const pctSementes = (cfg.pct_sementes as number) ?? 25;
  const diasParaMaduro = (cfg.dias_para_maduro as number) ?? 45;

  const orcamento = new Map<string, number>();   // quanto cada chip ainda pode enviar hoje
  const diaDoChip = new Map<string, number>();
  const maduros: string[] = [];
  const planejarPara: Chip[] = [];

  for (const c of chips) {
    if (comPlano.has(c.id)) continue;
    const dia = (c.dia_rampa ?? 0) + 1;
    if (dia > diasParaMaduro) { maduros.push(c.id); continue; }
    const faixa = faixaDoDia(rampa, dia);
    if (!faixa) continue;
    diaDoChip.set(c.id, dia);
    orcamento.set(c.id, aleatorio(faixa.min, faixa.max));
    planejarPara.push(c);
  }

  if (maduros.length) {
    await admin.from('maturacao_chips')
      .update({ status_maturacao: 'maduro', concluido_em: new Date().toISOString(), atualizado_em: new Date().toISOString() })
      .in('id', maduros);
  }
  if (!planejarPara.length) return { org, pulado: 'nada_a_planejar', maduros: maduros.length };

  const linhas: LinhaAgenda[] = [];
  // guarda quem abriu com quem, para gerar a resposta recíproca depois
  const aberturas: Array<{ de: Chip; para: Chip; quando: Date }> = [];

  for (const chip of planejarPara) {
    const dia = diaDoChip.get(chip.id)!;
    const faixa = faixaDoDia(rampa, dia)!;
    const volume = orcamento.get(chip.id) ?? 0;
    const qtdAbertura = Math.max(1, Math.round(volume * FRACAO_ABERTURA));

    // rodízio: parceiros embaralhados e percorridos em ciclo → distribuição uniforme entre os pares
    const parceiros = embaralhar(chips.filter((c) => c.id !== chip.id));
    const usaSementes = dia >= diaSementes && sementes.length > 0;
    const qtdSemente = usaSementes ? Math.round(qtdAbertura * (pctSementes / 100)) : 0;
    const filaSementes = embaralhar(sementes);

    const quandos = horarios(qtdAbertura, hIni, hFim, local, tz);

    quandos.forEach((quando, i) => {
      const paraSemente = i < qtdSemente;
      const tipo = sorteia(faixa.tipos) ?? 'texto';
      const cand = conteudos.filter((k) => k.tipo === tipo && (k.categoria === 'abertura' || k.categoria === 'conversa'));
      const conteudo = sorteia(cand.length ? cand : conteudos.filter((k) => k.tipo === 'texto'));
      if (!conteudo) return;

      if (paraSemente) {
        const s = filaSementes[i % filaSementes.length];
        linhas.push({
          organizacao_id: org, chip_origem_id: chip.id, destino_tipo: 'semente',
          chip_destino_id: null, semente_id: s.id, numero_destino: s.numero,
          executar_em: quando.toISOString(), tipo: conteudo.tipo,
          conteudo_id: conteudo.id, texto_snapshot: conteudo.texto,
          metadados: { dia_rampa: dia, papel: 'abertura' },
        });
      } else {
        const p = parceiros[i % parceiros.length];
        linhas.push({
          organizacao_id: org, chip_origem_id: chip.id, destino_tipo: 'chip',
          chip_destino_id: p.id, semente_id: null, numero_destino: p.numero_conectado!,
          executar_em: quando.toISOString(), tipo: conteudo.tipo,
          conteudo_id: conteudo.id, texto_snapshot: conteudo.texto,
          metadados: { dia_rampa: dia, papel: 'abertura' },
        });
        aberturas.push({ de: chip, para: p, quando });
      }
      orcamento.set(chip.id, (orcamento.get(chip.id) ?? 0) - 1);
    });
  }

  // ── reciprocidade: quem foi procurado responde, dentro do próprio orçamento ──
  for (const ab of aberturas) {
    const saldo = orcamento.get(ab.para.id) ?? 0;
    if (saldo <= 0) continue;                       // não estoura a rampa de quem responde
    const resp = conteudos.filter((k) => k.categoria === 'resposta' && k.tipo === 'texto');
    const conteudo = sorteia(resp.length ? resp : conteudos.filter((k) => k.tipo === 'texto'));
    if (!conteudo) continue;

    const quando = new Date(ab.quando.getTime() + aleatorio(RESPOSTA_MIN, RESPOSTA_MAX) * 60000);
    linhas.push({
      organizacao_id: org, chip_origem_id: ab.para.id, destino_tipo: 'chip',
      chip_destino_id: ab.de.id, semente_id: null, numero_destino: ab.de.numero_conectado!,
      executar_em: quando.toISOString(), tipo: conteudo.tipo,
      conteudo_id: conteudo.id, texto_snapshot: conteudo.texto,
      metadados: { dia_rampa: diaDoChip.get(ab.para.id) ?? null, papel: 'resposta' },
    });
    orcamento.set(ab.para.id, saldo - 1);
  }

  if (linhas.length) {
    const { error } = await admin.from('maturacao_agenda').insert(linhas);
    if (error) return { org, erro: error.message };
  }

  // avança o dia da rampa só de quem realmente foi planejado
  for (const [chipId, dia] of diaDoChip.entries()) {
    await admin.from('maturacao_chips')
      .update({ dia_rampa: dia, atualizado_em: new Date().toISOString() })
      .eq('id', chipId);
  }

  return {
    org, planejadas: linhas.length, chips: planejarPara.length, maduros: maduros.length,
    modo: cfg.modo, sementes_no_mix: sementes.length,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

    const { data: wc } = await admin.from('webhook_config').select('secret').eq('chave', 'maturacao').maybeSingle();
    if (!wc?.secret || !safeEqual(req.headers.get('x-maturacao-secret') ?? '', wc.secret as string)) {
      return json({ error: 'unauthorized' }, 401);
    }

    // Erro aqui NÃO pode ser silencioso: sem grant de service_role o select volta vazio e o
    // planner reportaria "orgs: 0" como se estivesse tudo bem, sem nunca planejar nada.
    const { data: configs, error: eCfg } = await admin.from('maturacao_config').select('*');
    if (eCfg) return json({ error: `falha ao ler maturacao_config: ${eCfg.message}` }, 500);
    if (!configs?.length) return json({ orgs: 0, aviso: 'nenhuma organizacao com maturacao configurada' });

    const resultados: unknown[] = [];
    for (const cfg of configs ?? []) {
      try { resultados.push(await planejarOrg(admin, cfg as Record<string, unknown>)); }
      catch (e) { resultados.push({ org: cfg.organizacao_id, erro: (e as Error).message }); }
    }

    return json({ orgs: resultados.length, resultados });
  } catch (e) {
    return json({ error: (e as Error).message ?? 'erro' }, 500);
  }
});
