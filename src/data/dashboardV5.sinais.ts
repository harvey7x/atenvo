import { keepPreviousData, useQuery, type UseQueryResult } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useOrg } from '@/context/OrgContext';
import type { Periodo } from '@/data/relatorios';
import type { PresetDash } from '@/data/dashboard';
import { DASH_V5_REAL } from '@/data/dashboardV5';
import { cenarioDemoV5, demoSinaisV5 } from '@/data/dashboardV5.sinais.demo';
import type {
  ContagemEsperadaV5, FechDiaV5, LacunaMsgV5, LoteNeV5, NumeroSinaisV5, PessoaSinaisV5, QualidadeV5, QuedaV5,
  RajadaV5, SemanaFechV5, SinaisV5, TransferenciaLoteV5,
} from '@/data/dashboardV5.sinais.tipos';

/* ------------------------------------------------------------------
   Camada de dados da LEITURA DO DIA. Uma chamada independente da do
   dashboard (as duas correm em paralelo; a página nunca espera esta):
   public.dashboard_v5_sinais devolve os sinais crus e o motor
   (dashboardV5.inteligencia.ts) escreve a leitura.

   DEMO É O CONTRATO: sem backend (vite --mode demo) o MESMO hook devolve
   demoSinaisV5, derivado do mesmo plano de leads do demo do dashboard
   (os achados batem com as tabelas). O cenário vem de ?leitura= (só no demo).
   ------------------------------------------------------------------ */

type Bruto = Record<string, unknown>;
const obj = (v: unknown): Bruto => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Bruto) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : 0;
};
const numOuNulo = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};
const txt = (v: unknown, padrao = ''): string => (typeof v === 'string' ? v : v == null ? padrao : String(v));
const txtOuNulo = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const bool = (v: unknown): boolean => v === true || v === 'true';
/** instante válido em ISO; qualquer outra coisa vira null (nunca "Invalid Date" na frase) */
const instante = (v: unknown): string | null => {
  const s = txtOuNulo(v);
  return s && Number.isFinite(Date.parse(s)) ? s : null;
};
const dataOuNulo = (v: unknown): string | null => {
  const s = txtOuNulo(v);
  return s && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
};
const nums = (v: unknown): number[] => arr(v).map(num);
const pega = (b: Bruto, snake: string, camel: string): unknown => (b[snake] !== undefined ? b[snake] : b[camel]);

function contagem(v: unknown): ContagemEsperadaV5 {
  const o = obj(v);
  return { rec: num(o.rec), esp: num(o.esp) };
}

function motivos(v: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, q] of Object.entries(obj(v))) { const n = num(q); if (n > 0) out[k] = n; }
  return out;
}

function qualidade(v: unknown): QualidadeV5 {
  const o = obj(v);
  return { n: num(o.n), rs: num(o.rs), iaDesc: num(pega(o, 'ia_desc', 'iaDesc')), motivos: motivos(o.motivos) };
}

function lacuna(v: unknown): LacunaMsgV5 | null {
  const o = obj(v);
  const inicio = instante(o.inicio);
  if (!inicio) return null;
  return {
    inicio, fim: instante(o.fim), esperado: num(o.esperado),
    recDepois: numOuNulo(pega(o, 'rec_depois', 'recDepois')), espDepois: numOuNulo(pega(o, 'esp_depois', 'espDepois')),
  };
}

function queda(v: unknown): QuedaV5 | null {
  const o = obj(v);
  const inicio = instante(o.inicio), fim = instante(o.fim);
  if (!inicio || !fim) return null;
  return {
    inicio, fim, chegaram: num(o.chegaram), esperado: num(o.esperado),
    depois: num(o.depois), espDepois: num(pega(o, 'esp_depois', 'espDepois')),
  };
}

function rajada(v: unknown): RajadaV5 | null {
  const o = obj(v);
  const inicio = instante(o.inicio);
  if (!inicio) return null;
  return { inicio, qtd: num(o.qtd), minutos: num(o.minutos), silencioAntesH: numOuNulo(pega(o, 'silencio_antes_h', 'silencioAntesH')) };
}

function numero(v: unknown): NumeroSinaisV5 | null {
  const n = obj(v);
  const canalId = txt(pega(n, 'canal_id', 'canalId'));
  if (!canalId) return null;
  const hoje = obj(n.hoje);
  const diag = obj(pega(n, 'msgs_diag', 'msgsDiag'));
  const ia3 = obj(pega(n, 'ia_3h', 'ia3h'));
  const cob = obj(pega(n, 'ia_cob_7d', 'iaCob7d'));
  const qb = obj(pega(n, 'qual_base', 'qualBase'));
  return {
    canalId,
    nome: txt(n.nome, 'Sem nome') || 'Sem nome',
    numero: txtOuNulo(n.numero),
    trafego: bool(n.trafego),
    aprendendoAte: dataOuNulo(pega(n, 'aprendendo_ate', 'aprendendoAte')),
    historiaDesde: dataOuNulo(pega(n, 'historia_desde', 'historiaDesde')),
    ultimaEntrada: instante(pega(n, 'ultima_entrada', 'ultimaEntrada')),
    esperadoDesdeUltima: num(pega(n, 'esperado_desde_ultima', 'esperadoDesdeUltima')),
    ent3h: contagem(pega(n, 'ent_3h', 'ent3h')),
    ent3h15: contagem(pega(n, 'ent_3h_15', 'ent3h15')),
    ent60: contagem(pega(n, 'ent_60', 'ent60')),
    ultimaMsg: instante(pega(n, 'ultima_msg', 'ultimaMsg')),
    msgsEsperadasDesdeUltimaMsg: num(pega(n, 'msgs_esperadas_desde_ultima_msg', 'msgsEsperadasDesdeUltimaMsg')),
    msgs60: contagem(pega(n, 'msgs_60', 'msgs60')),
    lacunasMsg: arr(pega(n, 'lacunas_msg', 'lacunasMsg')).map(lacuna).filter((x): x is LacunaMsgV5 => x !== null),
    msgsDiag: { ...contagem(diag), desde: instante(diag.desde) ?? '' },
    hoje: { entradas: num(hoje.entradas), normalAteAgora: numOuNulo(pega(hoje, 'normal_ate_agora', 'normalAteAgora')) },
    ia3h: { n: num(ia3.n), comIa: num(pega(ia3, 'com_ia', 'comIa')) },
    iaCob7d: { n: num(cob.n), comIa: num(pega(cob, 'com_ia', 'comIa')) },
    qual24h: qualidade(pega(n, 'qual_24h', 'qual24h')),
    qualBase: { ...qualidade(qb), dias: num(qb.dias) },
    quedas: arr(n.quedas).map(queda).filter((x): x is QuedaV5 => x !== null),
    rajadas: arr(n.rajadas).map(rajada).filter((x): x is RajadaV5 => x !== null),
  };
}

function pessoa(v: unknown): PessoaSinaisV5 | null {
  const p = obj(v);
  const usuarioId = txt(pega(p, 'usuario_id', 'usuarioId'));
  if (!usuarioId) return null;
  const fila = obj(p.fila);
  const rh = pega(p, 'resp_hoje', 'respHoje');
  const pas = p.passados;
  const baseProx = pega(fila, 'base_prox', 'baseProx');
  return {
    usuarioId,
    nome: txt(p.nome, 'Sem nome') || 'Sem nome',
    parteRodizio14d: num(pega(p, 'parte_rodizio_14d', 'parteRodizio14d')),
    primeiraMsgHoje: instante(pega(p, 'primeira_msg_hoje', 'primeiraMsgHoje')),
    primeiraMsgMedianaMin: numOuNulo(pega(p, 'primeira_msg_mediana_min', 'primeiraMsgMedianaMin')),
    diasAtivos: arr(pega(p, 'dias_ativos', 'diasAtivos')).map(bool),
    fila: {
      agora: num(fila.agora),
      maisAntigo: instante(pega(fila, 'mais_antigo', 'maisAntigo')),
      base: nums(fila.base),
      baseProx: Array.isArray(baseProx) ? nums(baseProx) : null,
    },
    respHoje: rh && typeof rh === 'object'
      ? { n: num(obj(rh).n), medianaMin: numOuNulo(pega(obj(rh), 'mediana_min', 'medianaMin')) } : null,
    respRestoMedianaMin: numOuNulo(pega(p, 'resp_resto_mediana_min', 'respRestoMedianaMin')),
    respBase: arr(pega(p, 'resp_base', 'respBase')).map((x) => ({ n: num(obj(x).n), med: numOuNulo(obj(x).med) })),
    passados: pas && typeof pas === 'object'
      ? { n: num(obj(pas).n), semContato: num(pega(obj(pas), 'sem_contato', 'semContato')) } : null,
  };
}

function fechDia(v: unknown): FechDiaV5 | null {
  const o = obj(v);
  const dia = dataOuNulo(o.dia);
  if (!dia) return null;
  return { dia, ganhos: num(o.ganhos), fichas: num(o.fichas), entradas: num(o.entradas) };
}

function semana(v: unknown): SemanaFechV5 | null {
  const o = obj(v);
  const inicio = instante(o.inicio), fim = instante(o.fim);
  if (!inicio || !fim) return null;
  return { inicio, fim, ganhos: num(o.ganhos), fichas: num(o.fichas), entradas: num(o.entradas) };
}

function loteNe(v: unknown): LoteNeV5 | null {
  const o = obj(v);
  const minuto = instante(o.minuto);
  if (!minuto) return null;
  return {
    minuto, sistema: bool(o.sistema), quem: txtOuNulo(o.quem), qtd: num(o.qtd),
    retroativos: num(o.retroativos), antigos: num(o.antigos),
    dMin: dataOuNulo(pega(o, 'd_min', 'dMin')), dMax: dataOuNulo(pega(o, 'd_max', 'dMax')),
  };
}

function transferencia(v: unknown): TransferenciaLoteV5 | null {
  const o = obj(v);
  const minuto = instante(o.minuto);
  if (!minuto) return null;
  return {
    minuto, qtd: num(o.qtd), de: txtOuNulo(o.de),
    para: arr(o.para).map((x) => ({ nome: txt(obj(x).nome, 'Sem nome') || 'Sem nome', qtd: num(obj(x).qtd) })).filter((x) => x.qtd > 0),
  };
}

/** Normalização defensiva: bloco ausente vira neutro (lista vazia, 0, null); a leitura
 *  nunca quebra com uma RPC antiga ou um período sem nada. */
export function normalizarSinaisV5(bruto: unknown): SinaisV5 {
  const b = obj(bruto);
  const j = obj(b.janela);
  const t = obj(b.total);
  const ia = obj(b.ia);
  const cred = obj(ia.credito);
  const eq = b.equipe && typeof b.equipe === 'object' ? obj(b.equipe) : null;
  const notas = obj(b.notas);
  const fsf = obj(pega(notas, 'fichas_sem_fechado', 'fichasSemFechado'));
  const geradoEm = instante(pega(b, 'gerado_em', 'geradoEm')) ?? new Date().toISOString();
  const credIni = instante(cred.inicio), credFim = instante(cred.fim);
  const eqProx = eq ? pega(eq, 'fila_base_prox', 'filaBaseProx') : null;
  return {
    versao: num(b.versao) || 1,
    geradoEm,
    agora: instante(b.agora) ?? geradoEm,
    admin: bool(b.admin),
    baseCalculadaEm: instante(pega(b, 'base_calculada_em', 'baseCalculadaEm')),
    janela: { inicio: txt(j.inicio), fim: txt(j.fim), incluiAgora: bool(pega(j, 'inclui_agora', 'incluiAgora')) },
    diaUtil: bool(pega(b, 'dia_util', 'diaUtil')),
    feriadosNoPeriodo: arr(pega(b, 'feriados_no_periodo', 'feriadosNoPeriodo')).map(dataOuNulo).filter((x): x is string => x !== null),
    numeros: arr(b.numeros).map(numero).filter((x): x is NumeroSinaisV5 => x !== null),
    total: {
      hoje: num(t.hoje),
      normalAteAgora: numOuNulo(pega(t, 'normal_ate_agora', 'normalAteAgora')),
      rajadaHoje: bool(pega(t, 'rajada_hoje', 'rajadaHoje')),
    },
    ia: {
      credito: credIni && credFim ? {
        inicio: credIni, fim: credFim, erros: num(cred.erros), conversas: num(cred.conversas),
        okDepois: num(pega(cred, 'ok_depois', 'okDepois')),
      } : null,
      credito60: num(pega(ia, 'credito_60', 'credito60')),
      erros60: num(pega(ia, 'erros_60', 'erros60')),
      ok60: num(pega(ia, 'ok_60', 'ok60')),
    },
    equipe: eq ? {
      respHoje: {
        n: num(obj(pega(eq, 'resp_hoje', 'respHoje')).n),
        medianaMin: numOuNulo(pega(obj(pega(eq, 'resp_hoje', 'respHoje')), 'mediana_min', 'medianaMin')),
      },
      respBase: nums(pega(eq, 'resp_base', 'respBase')),
      filaAgora: num(pega(eq, 'fila_agora', 'filaAgora')),
      filaAntes: nums(pega(eq, 'fila_antes', 'filaAntes')),
      filaBase: nums(pega(eq, 'fila_base', 'filaBase')),
      filaBaseProx: Array.isArray(eqProx) ? nums(eqProx) : null,
    } : null,
    pessoas: arr(b.pessoas).map(pessoa).filter((x): x is PessoaSinaisV5 => x !== null),
    fechamentos: {
      diario: arr(obj(b.fechamentos).diario).map(fechDia).filter((x): x is FechDiaV5 => x !== null)
        .sort((x, y) => (x.dia < y.dia ? -1 : x.dia > y.dia ? 1 : 0)),
      // ordem do SQL: a 0 é a semana atual
      semanas: arr(obj(b.fechamentos).semanas).map(semana).filter((x): x is SemanaFechV5 => x !== null),
      semFechadoSemana: num(pega(obj(b.fechamentos), 'sem_fechado_semana', 'semFechadoSemana')),
    },
    notas: {
      lotesNe: arr(pega(notas, 'lotes_ne', 'lotesNe')).map(loteNe).filter((x): x is LoteNeV5 => x !== null),
      transferencias: arr(notas.transferencias).map(transferencia).filter((x): x is TransferenciaLoteV5 => x !== null),
      fichasSemFechado: {
        total: num(fsf.total),
        porPessoa: arr(pega(fsf, 'por_pessoa', 'porPessoa'))
          .map((x) => ({ nome: txt(obj(x).nome, 'Sem nome') || 'Sem nome', qtd: num(obj(x).qtd) }))
          .filter((x) => x.qtd > 0),
      },
    },
    demo: b.demo === true ? true : undefined,
  };
}

const NAO_INSTALADA = 'Leitura ainda não instalada no servidor.';

/** Erro da RPC em português (nunca SQL cru na tela). */
export function traduzErroSinaisV5(e: unknown): string {
  const m = (e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : String(e ?? '')).toLowerCase();
  const codigo = typeof e === 'object' && e && 'code' in e ? String((e as { code: unknown }).code) : '';
  if (codigo === '57014' || m.includes('statement timeout') || m.includes('canceling statement')) return 'A leitura demorou demais.';
  if (codigo === 'PGRST202' || m.includes('could not find the function')) return NAO_INSTALADA;
  if (m.includes('sem_permissao')) return 'Sem acesso à leitura desta empresa.';
  if (m.includes('fetch') || m.includes('network')) return 'Sem conexão com o servidor.';
  return 'Leitura indisponível agora.';
}

const CINCO_MIN = 5 * 60_000;
const UMA_HORA = 60 * 60_000;

/** Sinais do período. No MESMO ritmo da foto do dashboard (5 min; o react-query pausa com a
 *  aba escondida), ao voltar para a aba e na virada da meia-noite (o período muda): a leitura
 *  e os cartões de baixo contam o mesmo instante. Ao trocar de período, a leitura anterior
 *  fica na tela (esmaecida) até a nova chegar — e continua lida com o preset DELA (o sinal
 *  carrega o preset com que foi buscado). Função ainda não instalada (front publicado antes
 *  da migration): não insiste a cada 5 min — tenta de novo a cada hora. */
export function useSinaisV5(periodo: Periodo, preset: PresetDash): UseQueryResult<SinaisV5> {
  const { currentOrg } = useOrg();
  const org = currentOrg.id;
  const admin = currentOrg.role !== 'atendente';
  return useQuery({
    queryKey: ['dashboard-v5-sinais', org, preset, periodo.iniISO, periodo.fimISO],
    enabled: !!org,
    staleTime: 60_000,
    refetchInterval: (q) => (q.state.error instanceof Error && q.state.error.message === NAO_INSTALADA ? UMA_HORA : CINCO_MIN),
    refetchOnWindowFocus: true,
    retry: (n, e) => !(e instanceof Error && e.message === NAO_INSTALADA) && n < 1,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<SinaisV5> => {
      const agora = new Date();
      if (!DASH_V5_REAL) {
        return { ...demoSinaisV5({ iniISO: periodo.iniISO, fimISO: periodo.fimISO }, agora, admin, cenarioDemoV5()), preset };
      }
      // POST (padrão do supabase-js): a RPC grava o cache diário das linhas de base
      const { data, error } = await supabase!.rpc('dashboard_v5_sinais', {
        p_inicio: periodo.iniISO,
        p_fim: periodo.fimISO,
        p_org: org,
      });
      if (error) throw new Error(traduzErroSinaisV5(error));
      return { ...normalizarSinaisV5(data), preset };
    },
  });
}
