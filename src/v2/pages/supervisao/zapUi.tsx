import type { ReactNode } from 'react';
import { mascararNumero } from '@/data/whatsapp';

/* ------------------------------------------------------------------
   Peças do WhatsApp dentro do celular do Painel da Equipe: ícones (desenho
   próprio, traço iOS), horários do jeito do WhatsApp e nomes.
   Tudo puro — nada aqui lê dado.
   ------------------------------------------------------------------ */

const TZ = 'America/Sao_Paulo';
const fmtDia = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const fmtHora = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });

/** 'AAAA-MM-DD' em São Paulo. */
export const diaSP = (ms: number): string => fmtDia.format(new Date(ms));
/** 'HH:MM' em São Paulo. */
export const horaSP = (ms: number): string => fmtHora.format(new Date(ms));
const DIA_MS = 86_400_000;
const diasEntre = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / DIA_MS);
const SEMANA = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const semanaDe = (dia: string) => SEMANA[new Date(`${dia}T12:00:00Z`).getUTCDay()];

/** Horário da lista de conversas: hoje = 14:32 · ontem = Ontem · até 6 dias = dia da semana · depois 12/10/2026. */
export function rotuloHoraLista(ms: number, agora: number): string {
  if (!ms) return '';
  const d = diaSP(ms), h = diaSP(agora), n = diasEntre(d, h);
  if (n <= 0) return horaSP(ms);
  if (n === 1) return 'Ontem';
  if (n < 7) return semanaDe(d);
  return `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
}

/** Separador de dia do fio: Hoje · Ontem · dia da semana (até 6 dias) · 12 de outubro (de 2025). */
export function rotuloDiaFio(dia: string, agora: number): string {
  const h = diaSP(agora), n = diasEntre(dia, h);
  if (n <= 0) return 'Hoje';
  if (n === 1) return 'Ontem';
  if (n < 7) return semanaDe(dia).replace(/^./, (c) => c.toUpperCase());
  const txt = `${Number(dia.slice(8, 10))} de ${MESES[Number(dia.slice(5, 7)) - 1]}`;
  return dia.slice(0, 4) === h.slice(0, 4) ? txt : `${txt} de ${dia.slice(0, 4)}`;
}

/** "agora" · "há 12 min" · "há 1h20" · "há 5 h" · "há 2 d" */
export function fmtHa(desdeMs: number, agora: number): string {
  const min = Math.max(0, Math.floor((agora - desdeMs) / 60_000));
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  if (min < 600) { const h = Math.floor(min / 60), r = min % 60; return r ? `há ${h}h${String(r).padStart(2, '0')}` : `há ${h} h`; }
  if (min < 1440) return `há ${Math.floor(min / 60)} h`;
  return `há ${Math.floor(min / 1440)} d`;
}

/** Tom da espera (mesma régua do inbox): < 30 min neutro · < 2 h âmbar · depois rubro. */
export const tomEspera = (desdeMs: number, agora: number): 'neutro' | 'ambar' | 'rubro' => {
  const min = (agora - desdeMs) / 60_000;
  return min < 30 ? 'neutro' : min < 120 ? 'ambar' : 'rubro';
};

/** +55 51 98812-4407 */
export function telefoneBonito(tel: string | null | undefined): string {
  const d = (tel ?? '').replace(/\D/g, '');
  if (d.length === 13 && d.startsWith('55')) return `+55 ${d.slice(2, 4)} ${d.slice(4, 9)}-${d.slice(9)}`;
  if (d.length === 12 && d.startsWith('55')) return `+55 ${d.slice(2, 4)} ${d.slice(4, 8)}-${d.slice(8)}`;
  return d ? mascararNumero(d) : 'Sem número';
}

const MINUSCULAS = new Set(['da', 'de', 'do', 'das', 'dos', 'e']);
/** Nome como na agenda do celular: "MARIA DA SILVA" → "Maria da Silva"; número → telefone formatado. */
export function nomeAgenda(nome: string | null | undefined, tel: string | null | undefined): string {
  const n = (nome ?? '').trim();
  if (!n || /^[\d\s()+\-]+$/.test(n)) return telefoneBonito(tel || n);
  if (n !== n.toLocaleUpperCase('pt-BR') && n !== n.toLocaleLowerCase('pt-BR')) return n;
  return n.toLocaleLowerCase('pt-BR').split(/\s+/)
    .map((p, i) => (i > 0 && MINUSCULAS.has(p) ? p : p.charAt(0).toLocaleUpperCase('pt-BR') + p.slice(1)))
    .join(' ');
}

export function iniciaisDe(nome: string): string {
  const p = nome.replace(/[^\p{L}\s]/gu, ' ').trim().split(/\s+/).filter(Boolean);
  if (!p.length) return '';
  return ((p[0][0] ?? '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
}

/* paleta de avatar: tons médios que funcionam no claro e no escuro (texto branco ≥ 4,5:1) */
const PALETA = ['#3B6E8F', '#7A5A92', '#2F7D6A', '#9A5B3C', '#5862A8', '#8A4E6B', '#4F7A3A', '#A0613A', '#3F6FA0', '#6B6F2E'];
export function corDe(chave: string): string {
  let h = 0;
  for (let i = 0; i < chave.length; i++) h = (h * 31 + chave.charCodeAt(i)) | 0;
  return PALETA[Math.abs(h) % PALETA.length];
}

/** Barras da onda do áudio (fixas por mensagem, como o WhatsApp desenha). */
export function ondaDe(chave: string, n = 34): number[] {
  let s = 0;
  for (let i = 0; i < chave.length; i++) s = (s * 33 + chave.charCodeAt(i)) >>> 0;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    s = (s * 1103515245 + 12345) >>> 0;
    const r = (s >>> 16) / 65_536;
    const env = 0.45 + 0.55 * Math.sin(Math.PI * (i + 0.5) / n);   // abre e fecha como fala
    out.push(Math.max(0.12, Math.min(1, env * (0.35 + 0.65 * r))));
  }
  return out;
}

export const mmss = (s: number | null | undefined): string =>
  s == null || !Number.isFinite(s) ? '0:00' : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/* ============================== ícones ============================== */

const I = ({ children, w = 24, fill, sw = 1.8, cls }: { children: ReactNode; w?: number; fill?: boolean; sw?: number; cls?: string }) => (
  <svg className={cls} width={w} height={w} viewBox="0 0 24 24" fill={fill ? 'currentColor' : 'none'} stroke={fill ? 'none' : 'currentColor'}
    strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden>{children}</svg>
);

export const IcVoltar = () => <I w={26} sw={2.3}><path d="M15 4.5 7.5 12l7.5 7.5" /></I>;
export const IcVideo = () => <I><rect x="2.5" y="6" width="13" height="12" rx="3" /><path d="m15.5 10.5 5.2-3.1a.5.5 0 0 1 .8.4v8.4a.5.5 0 0 1-.8.4l-5.2-3.1" /></I>;
export const IcFone = () => <I><path d="M7.6 3.5H5.4A1.9 1.9 0 0 0 3.5 5.6c.6 8.2 6.7 14.3 14.9 14.9a1.9 1.9 0 0 0 2.1-1.9v-2.2a1.3 1.3 0 0 0-1-1.3l-3.2-.8a1.3 1.3 0 0 0-1.3.4l-1.3 1.4a12.1 12.1 0 0 1-5.8-5.8l1.4-1.3a1.3 1.3 0 0 0 .4-1.3L8.9 4.5a1.3 1.3 0 0 0-1.3-1z" /></I>;
export const IcCamera = () => <I><path d="M3 8.5A2.5 2.5 0 0 1 5.5 6h1.8l1.4-2h6.6l1.4 2h1.8A2.5 2.5 0 0 1 21 8.5v9a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z" /><circle cx="12" cy="12.7" r="3.7" /></I>;
export const IcMais = () => <I sw={2.4}><path d="M12 5v14M5 12h14" /></I>;
export const IcReticencias = () => <I fill><circle cx="6" cy="12" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="18" cy="12" r="1.7" /></I>;
export const IcBusca = () => <I w={16} sw={2.2}><circle cx="10.5" cy="10.5" r="6.5" /><path d="m20 20-4.5-4.5" /></I>;
export const IcArquivo = () => <I><rect x="3" y="4" width="18" height="5" rx="1.4" /><path d="M5 9v9.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V9M10 13h4" /></I>;
export const IcFixada = () => <I w={15} fill><path d="M14.6 2.8a1 1 0 0 1 1.5 0l5.1 5.1a1 1 0 0 1 0 1.5l-1.4 1.4-1.2-.4-3.3 3.3.3 3.4-1.6 1.6-4.4-4.4-5.2 5.2-1.1.1.1-1.1 5.2-5.2-4.4-4.4 1.6-1.6 3.4.3 3.3-3.3-.4-1.2z" /></I>;
export const IcMic = ({ w = 15 }: { w?: number }) => <I w={w} fill><path d="M12 2.5a3.5 3.5 0 0 0-3.5 3.5v6a3.5 3.5 0 0 0 7 0V6A3.5 3.5 0 0 0 12 2.5z" /><path d="M5.5 11a.9.9 0 0 1 1.8 0 4.7 4.7 0 0 0 9.4 0 .9.9 0 0 1 1.8 0 6.5 6.5 0 0 1-5.6 6.4V20h2.3a.9.9 0 0 1 0 1.8H8.8a.9.9 0 0 1 0-1.8h2.3v-2.6A6.5 6.5 0 0 1 5.5 11z" /></I>;
export const IcFotoMini = () => <I w={15} fill><path d="M4.5 6.5h2.2l1.3-1.9h8l1.3 1.9h2.2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-15a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2zm7.5 10.4a3.9 3.9 0 1 0 0-7.8 3.9 3.9 0 0 0 0 7.8z" /></I>;
export const IcVideoMini = () => <I w={15} fill><rect x="2" y="6" width="13.5" height="12" rx="2.5" /><path d="m16.5 10.2 4.6-2.7a.6.6 0 0 1 .9.5v8a.6.6 0 0 1-.9.5l-4.6-2.7z" /></I>;
export const IcDocMini = () => <I w={15} fill><path d="M6 2.5h7.5L19 8v12a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4.5 20V4A1.5 1.5 0 0 1 6 2.5zm7 1.2V8.5h4.8z" /></I>;
export const IcContatoMini = () => <I w={15} fill><circle cx="12" cy="8" r="4" /><path d="M4 20.5c.6-4 3.9-6.5 8-6.5s7.4 2.5 8 6.5z" /></I>;
export const IcCadeado = ({ w = 12 }: { w?: number }) => <I w={w} fill><path d="M7 10V7.5a5 5 0 0 1 10 0V10h.5A1.5 1.5 0 0 1 19 11.5v8a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19.5v-8A1.5 1.5 0 0 1 6.5 10zm2 0h6V7.5a3 3 0 0 0-6 0z" /></I>;
export const IcAbrir = () => <I sw={2.1}><path d="M14 4h6v6M20 4l-8.5 8.5M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10" /></I>;
export const IcFigurinha = () => <I><path d="M20.5 12.5V7.5a4 4 0 0 0-4-4h-9a4 4 0 0 0-4 4v9a4 4 0 0 0 4 4h5l8-8z" /><path d="M12.5 20.5v-4a4 4 0 0 1 4-4h4" /><circle cx="9" cy="10" r=".9" fill="currentColor" /><circle cx="14.5" cy="10" r=".9" fill="currentColor" /></I>;
export const IcPlay = () => <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M7 4.6v14.8a1 1 0 0 0 1.5.9l11.6-7.4a1 1 0 0 0 0-1.8L8.5 3.7A1 1 0 0 0 7 4.6z" /></svg>;
export const IcPausa = () => <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden><rect x="6" y="4.5" width="4" height="15" rx="1.2" /><rect x="14" y="4.5" width="4" height="15" rx="1.2" /></svg>;
export const IcBaixar = () => <I w={18} sw={2.1}><path d="M12 4v11M7.5 11 12 15.5 16.5 11M5 20h14" /></I>;

/* barra de abas do WhatsApp (iOS) */
export const IcAbaAtualizacoes = () => <I><circle cx="12" cy="12" r="8.5" strokeDasharray="4.6 2.1" /><circle cx="12" cy="12" r="4.4" /></I>;
export const IcAbaLigacoes = () => <IcFone />;
export const IcAbaComunidades = () => <I><circle cx="9" cy="9" r="3.2" /><circle cx="16.5" cy="10" r="2.6" /><path d="M3.5 19c.5-3.2 2.8-5.2 5.5-5.2s5 2 5.5 5.2M14.6 14.3c2.6-.4 5.2 1.2 5.9 4.7" /></I>;
export const IcAbaConversas = () => <I fill><path d="M12 3c5 0 9 3.6 9 8.1 0 4.5-4 8.1-9 8.1-1.2 0-2.3-.2-3.4-.6L4 20.3l1.3-3.9A7.7 7.7 0 0 1 3 11.1C3 6.6 7 3 12 3z" /></I>;
export const IcAbaConfig = () => <I><circle cx="12" cy="12" r="3.1" /><path d="M19.4 13.5a7.7 7.7 0 0 0 0-3l2-1.6-2-3.4-2.4.9a7.6 7.6 0 0 0-2.6-1.5L14 2.5h-4l-.4 2.4A7.6 7.6 0 0 0 7 6.4l-2.4-.9-2 3.4 2 1.6a7.7 7.7 0 0 0 0 3l-2 1.6 2 3.4 2.4-.9a7.6 7.6 0 0 0 2.6 1.5l.4 2.4h4l.4-2.4a7.6 7.6 0 0 0 2.6-1.5l2.4.9 2-3.4z" /></I>;

/* barra de status do iPhone */
export const IcSinal = () => (
  <svg width="18" height="12" viewBox="0 0 18 12" fill="currentColor" aria-hidden>
    <rect x="0" y="8" width="3" height="4" rx=".8" /><rect x="5" y="5.5" width="3" height="6.5" rx=".8" />
    <rect x="10" y="3" width="3" height="9" rx=".8" /><rect x="15" y="0" width="3" height="12" rx=".8" />
  </svg>
);
export const IcWifi = () => (
  <svg width="16" height="12" viewBox="0 0 16 12" fill="currentColor" aria-hidden>
    <path d="M8 2.2c2.4 0 4.6.9 6.3 2.5l1.2-1.3A10.6 10.6 0 0 0 8 .4 10.6 10.6 0 0 0 .5 3.4l1.2 1.3A9 9 0 0 1 8 2.2z" />
    <path d="M8 5.6c1.5 0 2.9.6 3.9 1.5l1.2-1.3A7.4 7.4 0 0 0 8 3.8a7.4 7.4 0 0 0-5.1 2l1.2 1.3c1-.9 2.4-1.5 3.9-1.5z" />
    <path d="M8 9c.6 0 1.1.2 1.5.6L8 11.3 6.5 9.6c.4-.4.9-.6 1.5-.6z" />
  </svg>
);
export const IcBateria = () => (
  <svg width="27" height="13" viewBox="0 0 27 13" aria-hidden>
    <rect x=".5" y=".5" width="23" height="12" rx="3.6" fill="none" stroke="currentColor" opacity=".38" />
    <rect x="2.2" y="2.2" width="19.6" height="8.6" rx="2.2" fill="currentColor" />
    <path d="M25 4.4v4.2a2.1 2.1 0 0 0 0-4.2z" fill="currentColor" opacity=".4" />
  </svg>
);

/* tiques de entrega (como no WhatsApp) */
export function Tiques({ status }: { status?: string }) {
  if (status === 'pendente') {
    return <svg className="zp-tq zp-tq-rel" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-label="Pendente"><circle cx="12" cy="12" r="8" /><path d="M12 7.5V12l3 2" /></svg>;
  }
  if (status === 'falhou') {
    return <svg className="zp-tq zp-tq-falha" width="15" height="15" viewBox="0 0 24 24" aria-label="Não enviada"><circle cx="12" cy="12" r="10" fill="currentColor" /><path d="M12 6.8v6.4M12 16.6v.4" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" /></svg>;
  }
  if (status === 'enviada') {
    return <svg className="zp-tq" width="16" height="11" viewBox="0 0 16 11" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-label="Enviada"><path d="M1.5 5.8 5 9.2l7-7.7" /></svg>;
  }
  if (status === 'entregue' || status === 'lida') {
    return (
      <svg className={status === 'lida' ? 'zp-tq zp-tq-lida' : 'zp-tq'} width="18" height="11" viewBox="0 0 18 11" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-label={status === 'lida' ? 'Lida' : 'Entregue'}>
        <path d="M1 5.8 4.4 9.2l7-7.7" /><path d="m7.4 8.4.8.8 7-7.7" />
      </svg>
    );
  }
  return null;
}
