import type { ReactNode } from 'react';
import { linkTokens } from '@/lib/linkify';

/** Quebra um trecho de texto em nós React, transformando URLs http(s)/www em <a> seguros. */
function linkify(text: string, ctr: { n: number }): ReactNode[] {
  return linkTokens(text).map((tk) => tk.t === 'link'
    // stopPropagation: clicar no link não seleciona a bolha nem dispara ação da conversa.
    ? <a key={'l' + ctr.n++} className="wa-link" href={tk.href} target="_blank" rel="noopener noreferrer nofollow" onClick={(e) => e.stopPropagation()}>{tk.s}</a>
    : <span key={'t' + ctr.n++}>{tk.s}</span>);
}

/** Quebra o texto em nós React: *trechos* → <strong> e URLs → <a> seguros.
 *  Só pares válidos de '*' viram negrito; o resto fica literal. Nunca gera HTML bruto. */
function parse(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const ctr = { n: 0 };
  const re = /\*([^*\n]+)\*/g;
  let last = 0; let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const inner = m[1];
    if (/^\s|\s$/.test(inner)) continue; // "* x *" (espaço colado ao *) não é negrito no WhatsApp
    if (m.index > last) out.push(...linkify(text.slice(last, m.index), ctr));
    out.push(<strong key={'b' + ctr.n++}>{linkify(inner, ctr)}</strong>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(...linkify(text.slice(last), ctr));
  return out;
}

/** Renderiza texto do WhatsApp com formatação básica e SEGURA:
 *  - *negrito* → <strong>;
 *  - URLs http(s)://, www. → <a target="_blank" rel="noopener noreferrer nofollow"> (camada de render,
 *    não altera o texto salvo; mensagens antigas viram clicáveis automaticamente);
 *  - quebras de linha preservadas (white-space: pre-wrap, via .wa-fmt);
 *  - React escapa o conteúdo: tags recebidas (ex.: <script>) viram texto literal (sem XSS).
 *  NÃO usa dangerouslySetInnerHTML e NÃO interpreta HTML. */
export function WhatsAppText({ text }: { text?: string | null }) {
  if (!text) return null;
  return <span className="wa-fmt">{parse(text)}</span>;
}
