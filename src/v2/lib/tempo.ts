/* Régua do tempo do v2 (Adendo nº 2 do contrato):
   - horizonte CURTO (< LIMIAR_RELATIVO_MS = 48h): fala o RELATIVO primeiro
     ("em 3h", "há 45min") e a data absoluta é a linha de apoio;
   - horizonte LONGO (≥ 48h): fala a DATA primeiro ("01/08/26, 11:00") e o
     relativo humanizado vira apoio — dias até 30, meses depois.
   "em 156d" não existe. Datas sempre em America/Sao_Paulo, tabular-nums. */

export const LIMIAR_RELATIVO_MS = 48 * 3_600_000;

/** Data+hora curtas em SP (dd/mm/aa, hh:mm). */
export const dataHoraSP = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });

/** Relativo humanizado: agora → min → h → dias (até 30) → meses. */
export function tempoRelativo(iso: string, agoraMs: number): string {
  const dif = new Date(iso).getTime() - agoraMs;
  const mag = Math.abs(dif);
  const pref = (t: string) => (dif > 0 ? `em ${t}` : `há ${t}`);
  if (mag < 60_000) return 'agora';
  if (mag < 3_600_000) return pref(`${Math.round(mag / 60_000)}min`);
  if (mag < 86_400_000) return pref(`${Math.round(mag / 3_600_000)}h`);
  const dias = Math.round(mag / 86_400_000);
  if (dias <= 30) return pref(`${dias} dia${dias === 1 ? '' : 's'}`);
  const meses = Math.round(dias / 30);
  return pref(`${meses} ${meses === 1 ? 'mês' : 'meses'}`);
}

/** Par {principal, apoio} para células de tempo, conforme o horizonte. */
export function tempoCelula(iso: string, agoraMs: number): { principal: string; apoio: string } {
  const mag = Math.abs(new Date(iso).getTime() - agoraMs);
  const abs = dataHoraSP(iso);
  const rel = tempoRelativo(iso, agoraMs);
  return mag < LIMIAR_RELATIVO_MS ? { principal: rel, apoio: abs } : { principal: abs, apoio: rel };
}
