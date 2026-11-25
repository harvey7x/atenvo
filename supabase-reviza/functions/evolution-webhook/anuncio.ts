// De qual ANÚNCIO veio esta mensagem (25/11, anúncios do Facebook no Atendimento). Quando o cliente toca no botão
// "Enviar mensagem" de um anúncio do Facebook/Instagram, o WhatsApp manda junto da 1ª mensagem o contextInfo.externalAdReply
// (sourceType 'ad', sourceId = ID do anúncio, título, texto, link e ctwaClid). A Evolution repassa isso dentro da mensagem
// (extendedTextMessage.contextInfo, imageMessage.contextInfo…) ou em data.contextInfo. Lógica PURA, sem Deno: testada no vitest.

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : null);
const txt = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : typeof v === 'number' ? String(v) : null);

export interface OrigemAnuncio { source_id: string | null; title: string | null; body: string | null; source_url: string | null; ctwa_clid: string | null; source_type: string | null }

/** todos os contextInfo que a mensagem carrega (o do próprio evento e o de cada tipo de mensagem, inclusive embrulhada) */
function contextos(data: Obj): Obj[] {
  const out: Obj[] = [];
  const visitar = (m: Obj | null, prof: number) => {
    if (!m || prof > 4) return;
    const ci = obj(m.contextInfo); if (ci) out.push(ci);
    for (const [k, v] of Object.entries(m)) {
      if (k === 'contextInfo') continue;
      const filho = obj(v);
      if (filho) visitar(filho.message ? obj(filho.message) ?? filho : filho, prof + 1);
    }
  };
  const ci = obj(data.contextInfo); if (ci) out.push(ci);
  visitar(obj(data.message), 0);
  return out;
}

/** a origem do anúncio, ou null quando a mensagem não veio de anúncio */
export function anuncioOf(data: Obj | null | undefined): OrigemAnuncio | null {
  if (!data) return null;
  for (const ci of contextos(data)) {
    const ad = obj(ci.externalAdReply);
    if (!ad) continue;
    const tipo = txt(ad.sourceType)?.toLowerCase() ?? null;
    const id = txt(ad.sourceId);
    const clid = txt(ad.ctwaClid) ?? txt(ci.ctwaClid);
    const vemDeAnuncio = tipo === 'ad' || !!clid || (txt(ci.conversionSource) ?? '').toLowerCase().includes('ad') || ad.showAdAttribution === true;
    if (!vemDeAnuncio) continue; // link de site/post compartilhado também traz externalAdReply: não é anúncio
    return {
      source_id: id && /^\d{5,30}$/.test(id) ? id : null,
      title: txt(ad.title),
      body: txt(ad.body),
      source_url: txt(ad.sourceUrl),
      ctwa_clid: clid,
      source_type: tipo ?? 'ad',
    };
  }
  return null;
}
