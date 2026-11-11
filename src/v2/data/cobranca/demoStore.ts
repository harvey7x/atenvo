/* =====================================================================
   Store do modo DEMO: seed sintético DETERMINÍSTICO + leitura/gravação em
   localStorage (chave alfa_gestao_v4). FONTE ÚNICA do blob da demo:
   cobrancaMotor.tsx e o repositório demo importam daqui (a cópia local que
   vivia lá divergiu do modelo v4 — pago = parcela/4 — e foi removida em
   30/09). Não importa nenhuma tela: evita ciclo de import.
   ===================================================================== */
import { seedClientes, CICLO_DIA, type ClienteAnalise } from '../../pages/cobrancaAnalytics';
import type { Dados, GLinha, Entrada, EntradaDecidida, MovFin } from './types';

const CLIENTES: ClienteAnalise[] = seedClientes();

export const GS_LS = 'alfa_gestao_v4';   // v4 (29/09): pagos semeados como LÍQUIDO do escritório (parcela/4)

function plHash(s: string): number { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }
const PL_BANCOS = ['AGIBANK', 'BMG', 'MERCANTIL', 'CREFISA', 'FACTA'];
const PL_RECEBE = ['CAIXA', 'BANCO DO BRASIL', 'BRADESCO', 'ITAÚ'];
interface PlCad { comercial: string; cicloCod: string; dia: number; banco: string; nb: string; cpf: string; fechamento: string; recebe: string }
function plCadastro(cl: ClienteAnalise): PlCad {
  const h = plHash(cl.id);
  return {
    comercial: cl.atendente, cicloCod: cl.ciclo, dia: CICLO_DIA[cl.ciclo] ?? 1,
    banco: PL_BANCOS[h % PL_BANCOS.length],
    nb: `${100 + (h % 900)}.${String(100 + (h % 900)).padStart(3, '0')}.${String(h % 1000).padStart(3, '0')}-${h % 10}`,
    cpf: `•••.•••.${String(100 + (h % 900))}-${String(10 + (h % 90))}`,
    fechamento: `2026-${String(1 + (h % 8)).padStart(2, '0')}-${String(1 + (h % 27)).padStart(2, '0')}`,
    recebe: PL_RECEBE[(h >> 3) % PL_RECEBE.length],
  };
}

function seedGestao(): { comps: string[]; linhas: GLinha[] } {
  const comps = (CLIENTES[0]?.meses ?? []).map((m) => m.competencia);
  const linhas: GLinha[] = CLIENTES.map((cl) => {
    const cad = plCadastro(cl);
    const h = plHash(cl.id + 'g');
    const canc = (h % 100) < 76;
    const dd = String(1 + (h % 27)).padStart(2, '0'); const mm = String(1 + (h % 12)).padStart(2, '0');
    const base = 100 + (cad.dia % 6) * 15;
    const valor = (h % 100) < 80 ? base : base + ((h % 3) + 1) * 10;
    return {
      id: cl.id, nome: cl.nome, comercial: cl.atendente, dia: cad.dia, banco: cad.banco,
      nb: cad.nb, cpf: cad.cpf, senha: '', reclameLogin: '', reclameSenha: '',
      valor, ultimoPgto: cad.fechamento,
      fechamento: cad.fechamento, recebe: cad.recebe, telefone: cl.whatsapp ?? '',
      situacao: canc ? 'cancelado' : 'ativo',
      dataReclamacao: `2026-${mm}-01`, dataParou: canc ? `2026-${mm}-${dd}` : '',
      parou: canc ? `débito cancelado ${dd}/${mm}` : '',
      // pago = LÍQUIDO DO ESCRITÓRIO (dono 29/09): com 50%, ¼ da parcela — igual aos dados reais
      celulas: cl.meses.map((_, k) => { const c = cl.celulas[k] ?? '-'; return /^\d+([.,]\d+)?$/.test(c.trim()) ? String(Math.round(valor / 4)) : c; }),
    };
  });
  return { comps, linhas };
}
function seedEntradas(comps: string[], linhas: GLinha[]): Entrada[] {
  const comp = comps[comps.length - 1] ?? '';
  const out: Entrada[] = [];
  ([[6, 'Augusto (comercial)', '13:22'], [10, 'Eduardo (comercial)', '12:05'], [15, 'Junior (comercial)', '11:40']] as const).forEach(([idx, por, hh], i) => {
    const l = linhas[idx]; if (!l) return;
    out.push({ id: `ent-seed-${i}`, leadId: l.id, leadNome: l.nome, comp, valor: Math.round(l.valor / 4), por, quando: `2026-09-09T${hh}:00.000Z` });
  });
  return out;
}
function seedHistorico(comps: string[], linhas: GLinha[]): MovFin[] {
  const comp = comps[comps.length - 1] ?? '';
  const out: MovFin[] = [];
  ([[3, 'Eduardo', 'confirmada', '08T16:40'], [5, 'Augusto', 'confirmada', '08T15:10'], [9, 'Paty', 'confirmada', '08T11:05'], [11, 'Junior', 'recusada', '08T09:30'], [14, 'Garcia', 'confirmada', '07T17:20']] as const).forEach(([idx, com, st, dd], i) => {
    const l = linhas[idx]; if (!l) return;
    out.push({ id: `mov-seed-${i}`, leadNome: l.nome, comercial: com, comp, valor: l.valor, status: st, quando: `2026-09-${dd}:00.000Z` });
  });
  return out;
}

export function gsCarregar(): Dados {
  try {
    const raw = localStorage.getItem(GS_LS);
    if (raw) {
      const p = JSON.parse(raw);
      if (p && Array.isArray(p.linhas) && Array.isArray(p.comps)) {
        return {
          comps: p.comps, linhas: p.linhas,
          pendentes: Array.isArray(p.pendentes) ? p.pendentes : [],
          historico: Array.isArray(p.historico) ? p.historico : [],
          ciclosDatas: (p.ciclosDatas && typeof p.ciclosDatas === 'object') ? p.ciclosDatas : undefined,
          ciclosAbertos: Array.isArray(p.ciclosAbertos) ? p.ciclosAbertos.filter((x: unknown) => typeof x === 'number') : undefined,
          ciclosOrdem: Array.isArray(p.ciclosOrdem) ? p.ciclosOrdem.filter((x: unknown) => typeof x === 'number') : undefined,
        };
      }
    }
  } catch { /* ignore */ }
  const s = seedGestao();
  return { ...s, pendentes: seedEntradas(s.comps, s.linhas), historico: seedHistorico(s.comps, s.linhas) };
}
export function gsSalvar(d: Dados) { try { localStorage.setItem(GS_LS, JSON.stringify(d)); } catch { /* ignore */ } }

/** garante a competência na grade do store e devolve o índice dela. Coluna nova entra
    em ORDEM ('YYYY-MM' ordena cronológico — o insert em competencias do real) e as
    células de todo lead são realinhadas por nome do mês. MUTA no lugar (d.comps e o
    celulas de cada GLinha): quem já segura um lead de d.linhas continua valendo. */
export function garantirComp(d: Dados, comp: string): number {
  const i = d.comps.indexOf(comp);
  if (i >= 0) return i;
  const antigas = d.comps;
  const novas = [...antigas, comp].sort();
  for (const l of d.linhas) l.celulas = novas.map((c) => { const k = antigas.indexOf(c); return k >= 0 ? (l.celulas[k] ?? '-') : '-'; });
  d.comps = novas;
  return novas.indexOf(comp);
}

/* ---- entradas JÁ DECIDIDAS (confirmada/recusada) — espelho da tabela entradas ----
   Chave PRÓPRIA, fora do blob Dados: o admin apaga lançamento do histórico e outras
   telas regravam o blob só com os campos que conhecem — nada disso pode sumir com a
   decisão (no real, delete em mov_fin não toca entradas). Sem comprovante aqui (o data
   URL já está no histórico; guardar de novo estouraria o localStorage). */
export const ENT_LS = 'alfa_entradas_v1';
const MAX_DECIDIDAS = 500;
export function decididasCarregar(): EntradaDecidida[] {
  try {
    const raw = localStorage.getItem(ENT_LS);
    const p: unknown = raw ? JSON.parse(raw) : null;
    if (!Array.isArray(p)) return [];
    return p.filter((x): x is EntradaDecidida => !!x && typeof x === 'object'
      && typeof x.id === 'string' && typeof x.leadId === 'string' && typeof x.comp === 'string'
      && (x.estado === 'confirmada' || x.estado === 'recusada') && typeof x.resolvidoEm === 'string');
  } catch { return []; }
}
/** grava a decisão (a mais nova primeiro; a mesma entrada não duplica) */
export function decididaRegistrar(x: EntradaDecidida) {
  const xs = [x, ...decididasCarregar().filter((y) => y.id !== x.id)].slice(0, MAX_DECIDIDAS);
  try { localStorage.setItem(ENT_LS, JSON.stringify(xs)); } catch { /* ignore */ }
}
