/* Pendências — helpers só de EXIBIÇÃO (não mudam dado nenhum). */
import { ROTULO_BLOCO, mmss, type Bloco, type TipoBloco } from '@/data/pendencias';

/** primeira letra maiúscula */
export const cap = (t: string) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);

const PLURAL: Record<TipoBloco, string> = { texto: 'textos', audio: 'áudios', imagem: 'imagens', documento: 'documentos', video: 'vídeos' };

/** resumo curto de um envio: "2 textos", "Áudio · 0:38", "Áudio · 0:31 + 1 texto", "Documento" */
export function resumoCurto(bs: Bloco[]): string {
  if (!bs.length) return 'Sem mensagem';
  const ordem: TipoBloco[] = [];
  const grupos = new Map<TipoBloco, Bloco[]>();
  for (const b of bs) {
    if (!grupos.has(b.tipo)) { grupos.set(b.tipo, []); ordem.push(b.tipo); }
    grupos.get(b.tipo)!.push(b);
  }
  return ordem.map((tipo, i) => {
    const g = grupos.get(tipo)!;
    const n = g.length;
    if (n > 1) return `${n} ${PLURAL[tipo]}`;
    const dur = (tipo === 'audio' || tipo === 'video') && g[0].duracaoSeg ? ` · ${mmss(g[0].duracaoSeg)}` : '';
    return (i === 0 ? ROTULO_BLOCO[tipo] : `1 ${ROTULO_BLOCO[tipo].toLowerCase()}`) + dur;
  }).join(' + ');
}

/** tipos distintos dos blocos, na ordem (para os ícones) */
export function tiposDe(bs: Bloco[]): TipoBloco[] {
  const out: TipoBloco[] = [];
  for (const b of bs) if (!out.includes(b.tipo)) out.push(b.tipo);
  return out;
}

/** alturas da "onda" do áudio (determinísticas pelo nome; não é o áudio real) */
export function barras(nome = '', n = 36, min = 4, max = 20): number[] {
  let h = 2166136261;
  for (let i = 0; i < nome.length; i++) { h ^= nome.charCodeAt(i); h = Math.imul(h, 16777619); }
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    h ^= h << 13; h ^= h >>> 17; h ^= h << 5;
    const r = ((h >>> 0) % 1000) / 1000;
    /* envelope suave: começa e termina mais baixo, como fala de verdade */
    const env = 0.45 + 0.55 * Math.sin(Math.PI * (i + 0.5) / n);
    out.push(Math.round(min + (max - min) * r * env));
  }
  return out;
}

export const hhmmAgora = () => new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
export const hhmmDe = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

/** "1,2 MB" */
export function tamanhoBR(bytes?: number) {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}

/* Variáveis: o banco e o motor usam a chave técnica ({primeiro_nome}); o atendente lê e escreve a
   forma do botão que clicou ({primeiro nome}). A troca acontece só na borda do campo de texto. */
const VAR_TELA: [banco: string, tela: string][] = [
  ['{primeiro_nome}', '{primeiro nome}'],
  ['{pendencia}', '{o que precisa}'],
  ['{prazo}', '{prazo}'],
  ['{processo}', '{nº do processo}'],
  ['{atendente}', '{seu nome}'],
];
/** texto do banco → como aparece no campo */
export const paraTela = (t: string) => VAR_TELA.reduce((s, [b, v]) => s.split(b).join(v), t);
/** texto do campo → como vai para o banco */
export const paraBanco = (t: string) => VAR_TELA.reduce((s, [b, v]) => s.split(v).join(b), t);
/** texto do campo partido em pedaços: as variáveis conhecidas (forma da tela) marcadas, para o realce do editor */
const RE_VAR = new RegExp(VAR_TELA.map(([, v]) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g');
export function pedacosComVariaveis(t: string): { tx: string; v: boolean }[] {
  const out: { tx: string; v: boolean }[] = [];
  let i = 0;
  for (const m of t.matchAll(RE_VAR)) {
    const at = m.index ?? 0;
    if (at > i) out.push({ tx: t.slice(i, at), v: false });
    out.push({ tx: m[0], v: true });
    i = at + m[0].length;
  }
  if (i < t.length) out.push({ tx: t.slice(i), v: false });
  return out;
}

/** "(51) 99488-3071" → "+55 51 99488-3071" (é assim que o número aparece no WhatsApp de quem recebe) */
export function telefoneIntl(t?: string): string {
  const d = (t ?? '').replace(/\D/g, '');
  if (!d) return '';
  const n = d.length >= 12 && d.startsWith('55') ? d.slice(2) : d;
  if (n.length === 11) return `+55 ${n.slice(0, 2)} ${n.slice(2, 7)}-${n.slice(7)}`;
  if (n.length === 10) return `+55 ${n.slice(0, 2)} ${n.slice(2, 6)}-${n.slice(6)}`;
  return t ?? '';
}
