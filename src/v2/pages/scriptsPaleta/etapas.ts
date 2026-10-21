import type { EtapaItem, EtapaTipo } from '@/data/scripts';
import type { ResumoEtapas } from '../../hooks/scriptsResumo';

/* ------------------------------------------------------------------
   Etapas da PRÉVIA e composição da sequência — o MESMO critério do
   compositor (fetchEtapasParaEnvio com incluirMidia, que é como o
   inbox abre o ScriptSequenceModal): texto não vazio sempre; mídia só
   com arquivo; sem nenhuma etapa enviável, o script.conteudo vira a
   mensagem única. A prévia mostra exatamente o que o compositor abre.
   ------------------------------------------------------------------ */

const MIDIA: EtapaTipo[] = ['imagem', 'audio', 'video', 'documento'];

/** Etapa da prévia: + duração (s) de áudio/vídeo quando já conhecida (demo; no real é lida
 *  do arquivo sob demanda — ver Previa.tsx). Opcional: o compositor ignora o campo. */
export type EtapaPrevia = EtapaItem & { duracao?: number | null };

export function etapasParaPrevia(etapas: EtapaPrevia[], conteudoFallback: string): EtapaPrevia[] {
  const lista = etapas.filter((e) => (e.tipo === 'texto' ? (e.conteudo ?? '').trim().length > 0 : MIDIA.includes(e.tipo) && !!e.storagePath));
  if (lista.length === 0 && conteudoFallback.trim()) return [{ tipo: 'texto', conteudo: conteudoFallback }];
  return lista;
}

export interface Composicao { total: number; tipos: EtapaTipo[] }

/** Composição para a LISTA (sem buscar etapas): usa o resumo da org; script sem etapas = conteudo. */
export function composicaoDe(conteudo: string, r?: ResumoEtapas): Composicao {
  if (r && typeof r.enviaveis === 'number') {
    if (r.enviaveis > 0) return { total: r.enviaveis, tipos: r.tipos ?? [] };
    return conteudo.trim() ? { total: 1, tipos: ['texto'] } : { total: 0, tipos: [] };
  }
  // resumo antigo (sem os campos novos) ou ausente: contagem bruta, tipos desconhecidos
  if (r && r.total > 0) return { total: r.total, tipos: [] };
  return conteudo.trim() ? { total: 1, tipos: ['texto'] } : { total: 0, tipos: [] };
}

/** Composição de uma lista de etapas já filtrada (prévia). */
export function composicaoDasEtapas(etapas: EtapaItem[]): Composicao {
  const tipos: EtapaTipo[] = [];
  for (const e of etapas) if (!tipos.includes(e.tipo)) tipos.push(e.tipo);
  return { total: etapas.length, tipos };
}

/** Ordem fixa (texto → áudio → imagem → vídeo → documento) — rótulo genérico.
 *  A PALETA usa a ordem da SEQUÊNCIA (1ª aparição) nos ícones da lista E no cabeçalho
 *  da prévia (rotuloComposicaoNaOrdem): a mesma informação nunca aparece em duas ordens. */
export const ORDEM_TIPOS: EtapaTipo[] = ['texto', 'audio', 'imagem', 'video', 'documento'];
export function tiposOrdenados(tipos: EtapaTipo[]): EtapaTipo[] {
  return ORDEM_TIPOS.filter((t) => tipos.includes(t));
}

export const ROTULO_TIPO: Record<EtapaTipo, string> = {
  texto: 'texto', audio: 'áudio', imagem: 'imagem', video: 'vídeo', documento: 'documento',
};

export function rotuloMensagens(n: number): string {
  return n === 1 ? '1 mensagem' : `${n} mensagens`;
}

/** Forma curta para a LISTA ("1 msg", "3 msgs") — libera a linha para a descrição; o
 *  cabeçalho da prévia e o leitor de tela usam a forma longa (rotuloMensagens). */
export function rotuloMsgs(n: number): string {
  return n === 1 ? '1 msg' : `${n} msgs`;
}

/** Chave do cache das etapas de UM script — a mesma para a prévia e para o prefetch dos
 *  vizinhos (org na chave: trocar de organização nunca serve a sequência da anterior). */
export function chaveEtapas(orgId: string | null, s: { id: string; atualizadoEm?: string | null }) {
  return ['script-etapas', orgId, s.id, s.atualizadoEm ?? ''] as const;
}

/* PRÉVIA INSTANTÂNEA: a sequência desenhada na hora a partir do RESUMO da org (tipo e nome de
   cada mensagem enviável + os textos), enquanto fetchEtapas não chega — o tamanho, a duração e
   a miniatura entram quando as etapas completas chegam (mesmas posições, sem salto).
   null = o resumo não diz o suficiente (resumo antigo/ausente) → skeleton. */
export function etapasDoResumo(
  r: ResumoEtapas | undefined, conteudo: string, resumoPronto: boolean,
): EtapaPrevia[] | null {
  if (!r) {
    // resumo carregado e o script não tem etapa nenhuma: o compositor manda o conteudo
    if (!resumoPronto) return null;
    return conteudo.trim() ? [{ tipo: 'texto', conteudo }] : [];
  }
  if (typeof r.enviaveis !== 'number') return null;
  if (r.enviaveis === 0) return conteudo.trim() ? [{ tipo: 'texto', conteudo }] : [];
  if (!r.seq || r.seq.length !== r.enviaveis) return null;
  const porN = new Map((r.textos ?? []).map((t) => [t.n, t.texto]));
  return r.seq.map((e, i) => ({ tipo: e.tipo, nome: e.nome, conteudo: porN.get(i + 1) ?? '' }));
}

/** "texto + áudio + imagem" (ordem fixa dos ícones — lista) */
export function rotuloComposicao(tipos: EtapaTipo[]): string {
  return tiposOrdenados(tipos).map((t) => ROTULO_TIPO[t]).join(' + ');
}

/** "texto + vídeo + documento" na ORDEM DA SEQUÊNCIA (1ª aparição) — cabeçalho da prévia */
export function rotuloComposicaoNaOrdem(tipos: EtapaTipo[]): string {
  return [...new Set(tipos)].map((t) => ROTULO_TIPO[t]).join(' + ');
}

/* Tamanho em português ("6,9 MB", "60 KB"). Local da paleta de propósito: o
   formatarTamanho compartilhado também alimenta o compositor e a página /scripts. */
const KB = 1024, MB = 1024 * 1024;
export function tamanhoPt(bytes: number | null | undefined): string {
  if (!bytes || bytes < 0) return '';
  if (bytes < KB) return `${bytes} B`;
  if (bytes < MB) return `${Math.round(bytes / KB).toLocaleString('pt-BR')} KB`;
  return `${(bytes / MB).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} MB`;
}

/** Nome do arquivo em base + extensão: a base corta com reticências, a extensão fica ("nivel-gov-pr….mp4"). */
export function partesNome(nome: string): { base: string; ext: string } {
  const m = nome.match(/^(.+?)(\.[a-z0-9]{1,5})$/i);
  return m ? { base: m[1], ext: m[2] } : { base: nome, ext: '' };
}

/** Tipo HUMANO do documento para a meta do cartão ("Planilha · 209 KB"): a extensão
 *  fica só no tile ("XLSX"), sem repetir a mesma informação duas vezes. */
export function tipoDocumento(ext: string): string {
  const e = ext.toLowerCase();
  if (['xls', 'xlsx', 'xlsm', 'csv', 'ods'].includes(e)) return 'Planilha';
  if (['ppt', 'pptx', 'odp', 'key'].includes(e)) return 'Apresentação';
  if (['zip', 'rar', '7z'].includes(e)) return 'Arquivo compactado';
  return 'Documento';
}

/** Duração em m:ss ("0:42", "3:05"); vazio quando desconhecida. */
export function duracaoPt(seg: number | null | undefined): string {
  if (seg === null || seg === undefined || !Number.isFinite(seg) || seg <= 0) return '';
  const t = Math.max(1, Math.round(seg));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** Extensão em caixa alta para o cartão de documento ("PDF", "DOCX"); vazio se não houver. */
export function extensaoDe(nome: string | null | undefined, mime?: string | null): string {
  const m = (nome ?? '').match(/\.([a-z0-9]{1,5})$/i);
  if (m) return m[1].toUpperCase();
  if (mime?.includes('pdf')) return 'PDF';
  return '';
}
