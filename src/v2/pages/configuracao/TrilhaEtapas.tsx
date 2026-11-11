/* ------------------------------------------------------------------
   Configuração inicial — TRILHA DAS TRÊS ETAPAS (stepper horizontal).
   · tamanho 'm' (assistente): cada etapa é um botão que troca o card
     aberto (aria-current="step" na atual, aria-controls no painel). O
     clique NÃO move o foco nem rola — quem faz isso é o "Próxima etapa".
   · tamanho 's' (espera): só leitura, centralizada, sem estado "atual".
   Marcador: número (pendente) · anel dourado (atual) · ✓ verde (feita).
   Também mora aqui o ícone de concluído (IcCheck) — o TelaEspera o
   reexporta, e assim os dois módulos não se importam em círculo.
   ------------------------------------------------------------------ */
import { forwardRef } from 'react';
import type { EtapaId } from '../../data/cobranca/configuracao';

/** ✓ de traço (concluído) — nunca o caractere/emoji */
export function IcCheck({ tam = 14 }: { tam?: number }) {
  return (
    <svg width={tam} height={tam} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false">
      <path d="M5 12.5l4.2 4.2L19 7" />
    </svg>
  );
}

/** nome das etapas (completo e curto) — fonte única p/ espera e assistente */
export const ROTULO_ETAPA: Record<EtapaId, { titulo: string; curto: string }> = {
  planilha: { titulo: 'Planilha de clientes', curto: 'Planilha' },
  whatsapp: { titulo: 'WhatsApp da cobrança', curto: 'WhatsApp' },
  mensalidade: { titulo: 'Mensalidade da plataforma', curto: 'Mensalidade' },
};

export interface ItemTrilha { id: EtapaId; titulo: string; curto: string; feita: boolean; meta?: string | null }

interface PropsTrilha {
  itens: ItemTrilha[];
  tamanho: 'm' | 's';
  aberta?: EtapaId | null;
  aoAbrir?: (e: EtapaId) => void;
  idPainel?: string;
  rotulo: string;
}

export const TrilhaEtapas = forwardRef<HTMLElement, PropsTrilha>(function TrilhaEtapas(
  { itens, tamanho, aberta, aoAbrir, idPainel, rotulo }, ref,
) {
  const feitas = itens.filter((it) => it.feita).length;
  const total = itens.length;
  return (
    <nav ref={ref} aria-label={rotulo} className={`cini-trilha cini-trilha-${tamanho}`}>
      <p className="cini-vh">{feitas} de {total} etapas concluídas</p>
      <ol>
        {itens.map((it, i) => {
          const atual = tamanho === 'm' && it.id === aberta;
          const cls = ['cini-tr-item', it.feita ? 'cini-tr-feita' : '', atual ? 'cini-tr-atual' : ''].filter(Boolean).join(' ');
          const miolo = (
            <>
              <span className="cini-tr-marca" aria-hidden>
                {it.feita ? <IcCheck tam={tamanho === 's' ? 14 : 16} /> : <span className="num">{i + 1}</span>}
              </span>
              <span className="cini-tr-tx">
                <span className="cini-tr-tit">
                  <span className="cini-tr-longo">{it.titulo}</span>
                  <span className="cini-tr-curto" aria-hidden>{it.curto}</span>
                </span>
                {tamanho === 'm' && it.feita && it.meta && <span className="cini-tr-meta">{it.meta}</span>}
              </span>
            </>
          );
          return (
            <li key={it.id} className={cls}>
              {aoAbrir ? (
                <button type="button" className="cini-tr-btn"
                  aria-current={atual ? 'step' : undefined}
                  aria-controls={idPainel}
                  aria-label={`Etapa ${i + 1} de ${total}: ${it.titulo} — ${it.feita ? 'Concluída' : atual ? 'Em andamento' : 'Pendente'}`}
                  onClick={() => aoAbrir(it.id)}>
                  {miolo}
                </button>
              ) : (
                <div className="cini-tr-btn">
                  {miolo}
                  <span className="cini-vh">, {it.feita ? 'concluída' : 'pendente'}</span>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
});
