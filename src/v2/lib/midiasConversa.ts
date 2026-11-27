/* "Mídia, documentos e links" do painel do cliente (dono 25/11: "que nem no WhatsApp, quando tu abre o
   perfil da pessoa aparece as mídias e os documentos"). Lógica PURA: recebe as bolhas da conversa aberta
   (o mesmo histórico completo que o atendente lê) e separa o que foi trocado — nada de consulta nova. */
import type { WaMessage } from '@/data/whatsappDemo';

export type AbaMidia = 'fotos' | 'documentos' | 'audios' | 'links';
export interface ItemMidia { chave: string; ts: number; m: WaMessage }
export interface ItemLink { chave: string; ts: number; m: WaMessage; url: string; dominio: string }
export interface MidiasDaConversa { fotos: ItemMidia[]; documentos: ItemMidia[]; audios: ItemMidia[]; links: ItemLink[]; total: number }

const ts = (m: WaMessage, i: number) => {
  const t = m.tsISO ? Date.parse(m.tsISO) : NaN;
  return Number.isFinite(t) ? t : i; // sem data: mantém a ordem da conversa
};
/** tem arquivo de verdade para mostrar (falhou no envio ou nunca baixou = não entra) */
const temArquivo = (m: WaMessage) => !(m.dir === 'out' && m.status === 'falhou') && !m.midiaPendente && !!(m.localUrl || m.anexoPath || m.midiaUrl);

const RE_LINK = /\b(?:https?:\/\/|www\.)[^\s<>"']+/gi;
/** links de um texto, sem a pontuação que cola no fim ("…gov.br." / "(…gov.br)") */
export function extrairLinks(texto: string | undefined | null): string[] {
  if (!texto) return [];
  const achados = texto.match(RE_LINK) ?? [];
  return achados
    .map((u) => {
      let s = u.replace(/[.,;:!?…]+$/, '');
      if (s.endsWith(')') && !s.includes('(')) s = s.slice(0, -1);
      return s;
    })
    .filter((u) => u.length > 4);
}
/** endereço que abre: "www.x" ganha https:// */
export const urlAbrivel = (u: string) => (/^https?:\/\//i.test(u) ? u : 'https://' + u);
export function dominioDe(u: string): string {
  try { return new URL(urlAbrivel(u)).hostname.replace(/^www\./, ''); } catch { return u; }
}

export function midiasDaConversa(msgs: WaMessage[] | undefined | null): MidiasDaConversa {
  const r: MidiasDaConversa = { fotos: [], documentos: [], audios: [], links: [], total: 0 };
  (msgs ?? []).forEach((m, i) => {
    const t = ts(m, i);
    const chave = m.id ?? m.cid ?? 'i' + i;
    if ((m.tipo === 'imagem' || m.tipo === 'video') && temArquivo(m)) r.fotos.push({ chave, ts: t, m });
    else if (m.tipo === 'documento' && temArquivo(m)) r.documentos.push({ chave, ts: t, m });
    else if (m.tipo === 'documento' || m.pdf) r.documentos.push({ chave, ts: t, m }); // doc antigo sem arquivo: aparece, só não abre
    else if (m.tipo === 'audio' && temArquivo(m)) r.audios.push({ chave, ts: t, m });
    const vistos = new Set<string>();
    extrairLinks(m.text).forEach((url, j) => {
      if (vistos.has(url)) return; vistos.add(url);
      r.links.push({ chave: chave + ':l' + j, ts: t, m, url, dominio: dominioDe(url) });
    });
  });
  const desc = <T extends { ts: number }>(a: T, b: T) => b.ts - a.ts; // mais recente primeiro, como no WhatsApp
  r.fotos.sort(desc); r.documentos.sort(desc); r.audios.sort(desc); r.links.sort(desc);
  r.total = r.fotos.length + r.documentos.length + r.audios.length + r.links.length;
  return r;
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
/** grupos por mês no fuso de São Paulo: "Este mês", "Outubro", "Dezembro de 2025" */
export function agruparPorMes<T extends { ts: number }>(itens: T[], agoraMs: number = Date.now()): { rotulo: string; itens: T[] }[] {
  const chaveMes = (ms: number) => {
    const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' }).format(new Date(ms));
    return p.slice(0, 7); // AAAA-MM
  };
  const atual = chaveMes(agoraMs);
  const grupos: { rotulo: string; itens: T[] }[] = [];
  let ultima = '';
  for (const it of itens) {
    const k = it.ts > 10_000_000_000 ? chaveMes(it.ts) : atual; // sem data: junto do mês atual
    if (k !== ultima) {
      const [a, mm] = k.split('-');
      const nome = MESES[Number(mm) - 1] ?? '';
      const rotulo = k === atual ? 'Este mês' : (a === atual.slice(0, 4) ? nome : `${nome} de ${a}`);
      grupos.push({ rotulo: rotulo.charAt(0).toUpperCase() + rotulo.slice(1), itens: [] });
      ultima = k;
    }
    grupos[grupos.length - 1].itens.push(it);
  }
  return grupos;
}

export function tamanhoLegivel(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`;
}
/** "PDF", "DOCX", "JPG" — do nome ou do mime */
export function extensaoDe(m: Pick<WaMessage, 'nome' | 'mime' | 'pdf'>): string {
  const nome = m.nome || m.pdf?.name || '';
  const pelaPonta = /\.([a-z0-9]{2,5})$/i.exec(nome)?.[1];
  if (pelaPonta) return pelaPonta.toUpperCase();
  const sub = (m.mime || '').split('/')[1] || '';
  if (/pdf/i.test(sub)) return 'PDF';
  if (/word|msword/i.test(sub)) return 'DOC';
  if (/sheet|excel/i.test(sub)) return 'XLS';
  return 'ARQ';
}
export function dataCurta(ms: number): string {
  if (ms < 10_000_000_000) return '';
  return new Date(ms).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', timeZone: 'America/Sao_Paulo' });
}
