import type { ReactNode } from 'react';

/** Quebra o texto em nós React, transformando *trechos* em <strong>.
 *  Só pares válidos de '*' (sem espaço junto ao asterisco e sem quebra de linha
 *  no meio) viram negrito; o resto fica literal. Nunca gera HTML bruto. */
function parse(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*([^*\n]+)\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text)) !== null) {
    const inner = m[1];
    if (/^\s|\s$/.test(inner)) continue; // "* x *" (espaço colado ao *) não é negrito no WhatsApp
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(<strong key={k++}>{inner}</strong>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Renderiza texto do WhatsApp com formatação básica e SEGURA:
 *  - *negrito* → <strong>;
 *  - quebras de linha preservadas (white-space: pre-wrap, via .wa-fmt);
 *  - React escapa o conteúdo: tags recebidas (ex.: <script>) viram texto literal (sem XSS).
 *  NÃO usa dangerouslySetInnerHTML e NÃO interpreta HTML. */
export function WhatsAppText({ text }: { text?: string | null }) {
  if (!text) return null;
  return <span className="wa-fmt">{parse(text)}</span>;
}
