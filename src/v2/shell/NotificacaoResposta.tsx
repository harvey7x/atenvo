import { useEffect } from 'react';
import './shell.css';

export type DadosNotificacao = {
  iniciais: string;
  quem: string;
  mensagem: string;
  /** ex.: "WhatsApp · Canal 1390" */
  fonte: string;
  /** ex.: "agora" */
  quando?: string;
  /** Muda a cada disparo: reinicia timer e barra de progresso. */
  seq?: number;
};

type NotificacaoRespostaProps = {
  dados: DadosNotificacao | null;
  aoFechar: () => void;
  aoResponder?: () => void;
  aoVerConversa?: () => void;
};

/**
 * Toast de resposta de cliente (.notif do mockup) — SOMENTE o componente
 * visual, com auto-fechamento em 9,2s e barra de progresso de 9s.
 * A fiação realtime entra na sessão do WhatsApp (decisão aprovada, item 8).
 */
export function NotificacaoResposta({ dados, aoFechar, aoResponder, aoVerConversa }: NotificacaoRespostaProps) {
  const aberta = dados !== null;

  useEffect(() => {
    if (!aberta) return;
    const timer = window.setTimeout(aoFechar, 9200);
    return () => window.clearTimeout(timer);
  }, [aberta, dados, aoFechar]);

  return (
    <div className={aberta ? 'notif vidro show' : 'notif vidro'} role="status" aria-live="polite">
      {dados && (
        // key pela seq: re-disparo remonta corpo e barra, reiniciando a animação
        <div key={dados.seq ?? 0}>
          <button type="button" className="fechar" onClick={aoFechar} aria-label="Fechar notificação">×</button>
          <div className="corpo">
            <div className="av">{dados.iniciais}<i aria-hidden /></div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="l1">
                <span className="quem">{dados.quem}</span>
                <span className="qdo">{dados.quando ?? 'agora'}</span>
              </div>
              <div className="msg">{dados.mensagem}</div>
              <div className="fonte"><i aria-hidden />{dados.fonte}</div>
            </div>
          </div>
          <div className="acoes-n">
            <button type="button" className="bm claro" onClick={aoResponder}>Responder</button>
            <button type="button" className="bm fant" onClick={aoVerConversa}>Ver conversa</button>
          </div>
          <div className="prog" aria-hidden />
        </div>
      )}
    </div>
  );
}
