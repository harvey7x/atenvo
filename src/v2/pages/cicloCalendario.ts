/* ------------------------------------------------------------------
   Calendário de COBRANÇA dos ciclos — módulo puro, sem imports de telas
   (Painel, Comissões e a Gestão usam a MESMA conta; antes cada tela
   reimplementava "próxima cobrança" e dava datas diferentes pro mesmo
   cliente — auditoria 17/09).
   Regras: o dia do ciclo é a âncora; fim de semana/feriado empurra pro
   próximo dia útil; a data MANUAL do Calendário (ciclos_datas.cobranca)
   vence tudo — igual ao motor da régua.
   ------------------------------------------------------------------ */
import type { Dados } from '../data/cobranca/types';

const d2 = (n: number) => String(n).padStart(2, '0');

/* feriados nacionais (fixos + móveis por Páscoa) + RS (20/09) */
function pascoa(y: number): Date { const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451), mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1; return new Date(y, mes - 1, dia); }
export function feriadosDoAno(y: number): Record<string, string> {
  const p = pascoa(y); const off = (n: number) => { const d = new Date(p); d.setDate(p.getDate() + n); return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  return { '01-01': 'Confraternização', '04-21': 'Tiradentes', '05-01': 'Dia do Trabalho', '09-07': 'Independência', '09-20': 'Revolução Farroupilha (RS)', '10-12': 'N. Sra. Aparecida', '11-02': 'Finados', '11-15': 'Proclamação da República', '11-20': 'Consciência Negra', '12-25': 'Natal', [off(-47)]: 'Carnaval', [off(-2)]: 'Sexta-feira Santa', [off(60)]: 'Corpus Christi' };
}

/* auto-detector: o dia do ciclo (recebimento no INSS) é a âncora; se cair em fim de
   semana ou feriado, a cobrança é empurrada para o PRÓXIMO dia útil — sem edição manual */
export interface CobDia { base: string; iso: string; deslocado: boolean; motivo: string }
export function cobrancaDoCiclo(comp: string, dia: number): CobDia {
  const [y, m] = comp.split('-').map(Number);
  const ult = new Date(y, m, 0).getDate();
  const d0 = Math.min(dia, ult);
  const base = `${comp}-${d2(d0)}`;
  const baseDow = new Date(y, m - 1, d0).getDay();
  const motivo = feriadosDoAno(y)[`${d2(m)}-${d2(d0)}`] || (baseDow === 0 ? 'domingo' : baseDow === 6 ? 'sábado' : '');
  const dt = new Date(y, m - 1, d0);
  for (let i = 0; i < 60; i++) {
    const yy = dt.getFullYear(), mm = dt.getMonth() + 1, dd = dt.getDate();
    if (dt.getDay() !== 0 && dt.getDay() !== 6 && !feriadosDoAno(yy)[`${d2(mm)}-${d2(dd)}`]) {
      const iso = `${yy}-${d2(mm)}-${d2(dd)}`;
      return { base, iso, deslocado: iso !== base, motivo: iso !== base ? motivo : '' };
    }
    dt.setDate(dt.getDate() + 1);
  }
  return { base, iso: base, deslocado: false, motivo: '' };
}

/** próxima data de COBRANÇA do ciclo (hoje ou depois), em ISO: respeita a data
    manual do Calendário quando existir e desloca fds/feriado quando não. */
export function proximaCobrancaDoCiclo(dia: number, ciclosDatas?: Dados['ciclosDatas']): string {
  if (!(dia >= 1 && dia <= 31)) return '';
  const agora = new Date();
  const hojeIso = `${agora.getFullYear()}-${d2(agora.getMonth() + 1)}-${d2(agora.getDate())}`;
  for (let k = 0; k < 3; k++) {
    const d = new Date(agora.getFullYear(), agora.getMonth() + k, 1);
    const comp = `${d.getFullYear()}-${d2(d.getMonth() + 1)}`;
    const manual = ciclosDatas?.[String(dia)]?.[comp]?.cobranca || '';
    const iso = manual || cobrancaDoCiclo(comp, dia).iso;
    if (iso >= hojeIso) return iso;
  }
  return hojeIso;
}

/** a mesma data, já em pt-BR curto (dd/mm) — atalho pros painéis */
export function proximaCobrancaBR(dia: number, ciclosDatas?: Dados['ciclosDatas']): string {
  const iso = proximaCobrancaDoCiclo(dia, ciclosDatas);
  if (!iso) return '—';
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}
