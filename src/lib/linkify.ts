/** Tokenização de texto em trechos de texto e LINKS seguros — camada de render, NÃO altera o texto salvo.
 *  Reconhece http(s):// e www.; só http/https viram link (javascript:/data:/file: nunca). Pontuação final
 *  da frase não entra na URL. Reutilizável (sem regex duplicada) e testável sem React/DOM. */
export type LinkToken = { t: 'text'; s: string } | { t: 'link'; s: string; href: string };

const URL_RE = /(?:https?:\/\/|www\.)[^\s<>]+/gi;

/** Remove do FIM a pontuação que pertence à frase e fecha-parênteses/colchetes desbalanceados. */
function aparaPontuacao(raw: string): [string, string] {
  let url = raw; let sobra = '';
  for (let i = 0; i <= raw.length && url.length; i++) {
    const c = url[url.length - 1];
    if ('.,;:!?»”\'"'.includes(c)) { sobra = c + sobra; url = url.slice(0, -1); continue; }
    // remove o fecha só quando há MAIS fechados que abertos (desbalanceado); mantém pares balanceados.
    if ((c === ')' && url.split(')').length > url.split('(').length)
      || (c === ']' && url.split(']').length > url.split('[').length)
      || (c === '}' && url.split('}').length > url.split('{').length)) { sobra = c + sobra; url = url.slice(0, -1); continue; }
    break;
  }
  return [url, sobra];
}

/** href seguro (http/https) a partir do trecho casado, ou null se o protocolo não for permitido. */
export function hrefSeguro(url: string): string | null {
  const href = /^www\./i.test(url) ? 'https://' + url : url;
  try { const u = new URL(href); return (u.protocol === 'http:' || u.protocol === 'https:') ? href : null; }
  catch { return null; }
}

export function linkTokens(text: string): LinkToken[] {
  const out: LinkToken[] = [];
  let last = 0; let m: RegExpExecArray | null;
  URL_RE.lastIndex = 0;
  while ((m = URL_RE.exec(text)) !== null) {
    const [url, sobra] = aparaPontuacao(m[0]);
    if (!url) continue;
    const href = hrefSeguro(url);
    if (m.index > last) out.push({ t: 'text', s: text.slice(last, m.index) });
    if (href) out.push({ t: 'link', s: url, href });
    else out.push({ t: 'text', s: url }); // protocolo não permitido → texto literal
    if (sobra) out.push({ t: 'text', s: sobra });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ t: 'text', s: text.slice(last) });
  return out;
}
