import { useMemo } from 'react';
import type { WaMessage } from '@/data/whatsappDemo';
import { partesDaNota } from '@/data/notasInternas';
import './notaInterna.css';

/* NOTA INTERNA no fio da conversa (migration 99): um cartão no meio do fio, fora do lado do cliente e do lado
   das nossas mensagens — só a equipe vê, nunca foi enviada. Estilos (cartão, compositor em modo nota e lista do @) em notaInterna.css,
   carregados junto do cartão — valem no inbox e na conversa do celular. */

export const IcNota = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M5 4h14v10l-5 6H5z" />
    <path d="M14 20v-6h5" />
    <path d="M8.5 8.5h7M8.5 11.5h4" />
  </svg>
);

const SEM_NOMES: string[] = [];
export function NotaInterna({ m }: { m: WaMessage }) {
  const nomes = m.nota?.mencoesNomes ?? SEM_NOMES;
  const partes = useMemo(() => partesDaNota(m.text ?? '', nomes), [m.text, nomes]);
  const autor = m.nota?.autorNome || (m.nota?.automatica ? 'Automática' : 'Equipe');
  return (
    <div className="wa-nota" data-mid={m.id} role="note" aria-label={`Nota interna de ${autor}, só para a equipe`}
      title="Nota interna: só a equipe vê. Não foi enviada ao cliente.">
      <div className="wa-nota-cab">
        <span className="wa-nota-ic"><IcNota /></span>
        <span className="wa-nota-quem"><b>Nota interna</b> · {autor}{m.time ? <> · <span className="num">{m.time}</span></> : null}</span>
        <span className="wa-nota-so">Só a equipe vê</span>
      </div>
      <div className="wa-nota-tx">
        {partes.map((p, i) => (p.mencao ? <b key={i} className="wa-nota-men">{p.t}</b> : <span key={i}>{p.t}</span>))}
      </div>
    </div>
  );
}
