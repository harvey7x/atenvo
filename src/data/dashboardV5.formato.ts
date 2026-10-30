/* Formatação do Dashboard v5 — funções PURAS (sem React, sem rede), cobertas por
   dashboardV5.test.ts. Tudo em pt-BR; ausência de dado vira '—' (nunca 0 disfarçado). */

import { MOTIVOS_NAO_ELEGIVEL } from '@/data/kanban';

export const TRACO = '—';
const ok = (n: number | null | undefined): n is number => typeof n === 'number' && Number.isFinite(n);

/** Inteiro no padrão brasileiro: 1234 → '1.234'. Arredonda; null/NaN → '—'. */
export function fmtInt(n: number | null | undefined): string {
  if (!ok(n)) return TRACO;
  return Math.round(n).toLocaleString('pt-BR', { maximumFractionDigits: 0 });
}

/** Número com casas decimais: 2.94 → '2,9'. */
export function fmtDec(n: number | null | undefined, casas = 1): string {
  if (!ok(n)) return TRACO;
  return n.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

/** parte ÷ total em % (0–100). Sem base (total ≤ 0 ou inválido) → null, nunca 0 nem Infinity. */
export function pctDe(parte: number | null | undefined, total: number | null | undefined): number | null {
  if (!ok(parte) || !ok(total) || total <= 0) return null;
  return (parte / total) * 100;
}

/** Porcentagem já em 0–100, SEMPRE inteira (a mesma precisão em toda a página): 34% · 8% · 1%.
 *  Acima de 0 e abaixo de 1 vira '<1%' (não some num '0%'); acima de 99 e abaixo de 100,
 *  '>99%' (não vira um '100%' que não é). */
export function fmtPct(n: number | null | undefined): string {
  if (!ok(n)) return TRACO;
  if (n > 0 && n < 1) return '<1%';
  if (n > 99 && n < 100) return '>99%';
  return `${Math.round(n).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%`;
}

/** Duração em MINUTOS: < 1 min → '< 1 min'; < 60 → '4 min'; < 24 h → '3 h 20' (ou '3 h');
 *  ≥ 24 h → '1,4 dia' / '4,8 dias'. null → '—'. */
export function fmtDuracaoMin(min: number | null | undefined): string {
  if (!ok(min) || min < 0) return TRACO;
  const t = Math.round(min);
  if (min < 1) return '< 1 min';
  if (t < 60) return `${t} min`;
  if (t < 1440) {
    const h = Math.floor(t / 60), m = t % 60;
    return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
  }
  const d = Math.round((t / 1440) * 10) / 10;
  return `${fmtDec(d, 1)} ${d < 2 ? 'dia' : 'dias'}`;
}

/** Duração em SEGUNDOS (o robô trabalha em segundos e poucos minutos — a mesma régua do PDF
 *  diário): < 1 min → '45 s'; < 10 min → '1,9 min' (uma casa); depois, a de fmtDuracaoMin. */
export function fmtDuracaoS(s: number | null | undefined): string {
  if (!ok(s) || s < 0) return TRACO;
  const t = Math.round(s);
  if (t < 60) return `${t} s`;
  const min = t / 60;
  if (min < 10) {
    const m1 = Math.round(min * 10) / 10;
    return `${m1.toLocaleString('pt-BR', { minimumFractionDigits: Number.isInteger(m1) ? 0 : 1, maximumFractionDigits: 1 })} min`;
  }
  return fmtDuracaoMin(min);
}

/** Duração em HORAS, mesma régua de fmtDuracaoMin: 0,5 → '30 min'; 3,33 → '3 h 20'; 33,6 → '1,4 dia'. */
export function fmtDuracaoH(h: number | null | undefined): string {
  if (!ok(h)) return TRACO;
  return fmtDuracaoMin(h * 60);
}

/** '5551994266757' → '(51) 99426-6757'. Celular salvo sem o nono dígito (12 dígitos com 55,
 *  1º dígito local 6–9) ganha o 9 na exibição; fixo fica com 8. Formato desconhecido passa como veio. */
export function fmtTelefone(n: string | null | undefined): string {
  if (!n) return TRACO;
  const d = n.replace(/\D/g, '');
  const loc = d.length >= 12 && d.startsWith('55') ? d.slice(2) : d;
  if (loc.length === 11) return `(${loc.slice(0, 2)}) ${loc.slice(2, 7)}-${loc.slice(7)}`;
  if (loc.length === 10) {
    const ddd = loc.slice(0, 2), num = loc.slice(2);
    if (/[6-9]/.test(num[0])) return `(${ddd}) 9${num.slice(0, 4)}-${num.slice(4)}`;
    return `(${ddd}) ${num.slice(0, 4)}-${num.slice(4)}`;
  }
  return n;
}

/* Motivo de não elegível: os 5 motivos vivos REUSAM os rótulos do Kanban
   (MOTIVOS_NAO_ELEGIVEL — o mesmo texto que a equipe escolhe ao descartar); o
   dashboard só acrescenta 'Sem categoria' (motivo nulo, comum só antes de 10/2026). */
export const ROTULO_SEM_CATEGORIA = 'Sem categoria';

export function rotuloMotivoNe(motivo: string | null | undefined): string {
  if (!motivo || motivo === 'sem_categoria') return ROTULO_SEM_CATEGORIA;
  const doKanban = MOTIVOS_NAO_ELEGIVEL.find(([k]) => k === motivo)?.[1];
  if (doKanban) return doKanban;
  const s = motivo.replace(/_/g, ' ').trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : ROTULO_SEM_CATEGORIA;
}

/** Variação relativa de uma contagem vs o anterior. null quando não dá para comparar.
 *  Anterior 0 com atual > 0 → { abs } (mostra "+N", não "+100%" nem infinito). */
export function variacao(atual: number | null | undefined, anterior: number | null | undefined):
  { pct: number | null; abs: number } | null {
  if (!ok(atual) || !ok(anterior)) return null;
  const abs = atual - anterior;
  return { pct: anterior === 0 ? null : (abs / anterior) * 100, abs };
}

/** Texto da variação, inteira como as outras porcentagens: '+12%', '−4%', '+4' (anterior
 *  zero), 'estável' (nada mudou ou mudou menos de meio por cento). */
export function fmtVariacao(v: { pct: number | null; abs: number } | null): string {
  if (!v) return TRACO;
  if (Math.abs(v.abs) < 0.5) return 'estável';
  if (v.pct == null) return `+${fmtInt(v.abs)}`;
  const a = Math.round(Math.abs(v.pct));
  if (a === 0) return 'estável';
  return `${v.pct > 0 ? '+' : '−'}${a.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%`;
}

/* Mapa dia × hora: escala de 5 degraus (degrau = ⌈v / topo × 5⌉, limitado a 1–5). */

/** Faixa de valores de cada degrau, para a legenda. Degrau k cobre (k−1)/5·ref < v ≤ k/5·ref;
 *  o último também leva tudo acima do topo (os picos). Em contagens inteiras, um degrau que
 *  nenhum inteiro alcança some da legenda. */
export function faixasEscalaV5(ref: number, decimal: boolean): { q: number; rotulo: string }[] {
  if (ref <= 0) return [];
  const out: { q: number; rotulo: string }[] = [];
  for (let k = 1; k <= 5; k++) {
    if (decimal) {
      const a = ((k - 1) * ref) / 5, b = (k * ref) / 5;
      out.push({ q: k, rotulo: k === 1 ? `até ${fmtDec(b, 1)}` : k === 5 ? `> ${fmtDec(a, 1)}` : `${fmtDec(a, 1)}–${fmtDec(b, 1)}` });
      continue;
    }
    const lo = Math.floor(((k - 1) * ref) / 5) + 1;
    const hi = Math.floor((k * ref) / 5);
    if (k === 5) { out.push({ q: k, rotulo: `≥ ${fmtInt(lo)}` }); continue; }
    if (lo > hi) continue;
    out.push({ q: k, rotulo: lo === hi ? fmtInt(lo) : `${fmtInt(lo)}–${fmtInt(hi)}` });
  }
  return out;
}
