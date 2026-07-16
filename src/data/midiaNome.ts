/**
 * Lógica PURA do download de mídia recebida (nome do arquivo + rótulo do botão).
 * Sem dependência de Supabase/DOM → testável isoladamente (src/data/midiaNome.test.ts).
 */

export interface MidiaNomeParams {
  nome?: string;        // metadados.nome (nome original quando o WhatsApp manda)
  tipo?: string;        // imagem | audio | video | documento
  mime?: string;        // metadados.mime
  anexoPath?: string;   // {org}/wa-midia/{id}.{ext}
  dataISO?: string;     // AAAA-MM-DD
}

/** Rótulo do botão por tipo de mídia. */
export function rotuloBaixarMidia(tipo?: string): string {
  switch (tipo) {
    case 'imagem': return 'Baixar imagem';
    case 'audio': return 'Baixar áudio';
    case 'video': return 'Baixar vídeo';
    case 'documento': return 'Baixar documento';
    default: return 'Baixar arquivo';
  }
}

/** Nomes que o webhook gera quando o WhatsApp NÃO manda o nome real → usamos o padrão cliente-data-tipo. */
const NOMES_GENERICOS = new Set([
  'imagem.jpg', 'imagem.jpeg', 'imagem.png', 'audio.ogg', 'audio.mp3', 'audio.m4a',
  'video.mp4', 'documento.pdf', 'arquivo',
]);

const limpaExt = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5);

/**
 * Nome do arquivo baixado:
 *  - preserva o ORIGINAL sanitizado quando o WhatsApp mandou um nome real;
 *  - senão gera `cliente-AAAA-MM-DD-tipo.ext`.
 * Sanitização: sem acento, sem path traversal (../), sem caractere perigoso, sem nome oculto.
 */
export function nomeArquivoMidia(m: MidiaNomeParams): string {
  const ext = limpaExt(m.anexoPath?.split('.').pop() ?? '')
    || limpaExt((m.mime ?? '').split('/')[1] ?? '')
    || 'bin';
  const original = (m.nome ?? '').trim();
  if (original && !NOMES_GENERICOS.has(original.toLowerCase())) {
    const safe = original
      .normalize('NFD').replace(/[̀-ͯ]/g, '')   // tira acento
      .replace(/[^\w.\- ]+/g, '_')                        // só caractere seguro
      .replace(/\s+/g, '-')
      .replace(/_{2,}/g, '_')
      .replace(/\.{2,}/g, '.')                            // mata ".." (path traversal)
      .replace(/^[.\-_]+/, '')                            // nada de arquivo oculto / prefixo estranho
      .slice(0, 120);
    if (safe) return /\.[a-z0-9]{2,5}$/i.test(safe) ? safe : `${safe}.${ext}`;
  }
  const tipo = m.tipo && m.tipo !== 'texto' ? m.tipo : 'arquivo';
  return `cliente-${m.dataISO ?? 'sem-data'}-${tipo}.${ext}`;
}
