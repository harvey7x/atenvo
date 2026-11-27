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
 * Aviso de mensagem nova de cliente. Dono 27/11 ("quando essas coisas estão abertas, a barra de
 * cima fica toda travada"): deixou de ser um cartão solto por cima da tela — cobria o período do
 * Dashboard e o topo do painel de dados — e virou uma PÍLULA dentro da barra do topo, ao lado do
 * sino: nunca por cima de botão nenhum. Uma linha: quem · trecho da mensagem · Responder · ×; a
 * origem (número) e o "agora" ficam na dica. Auto-fecha em 9,2 s (barra de progresso de 9 s).
 * A fiação realtime fica na casca (AppShellV2).
 */
export function NotificacaoResposta({ dados, aoFechar, aoResponder, aoVerConversa }: NotificacaoRespostaProps) {
  const aberta = dados !== null;

  useEffect(() => {
    if (!aberta) return;
    const timer = window.setTimeout(aoFechar, 9200);
    return () => window.clearTimeout(timer);
  }, [aberta, dados, aoFechar]);

  if (!dados) return null;
  const abrir = aoResponder ?? aoVerConversa;
  return (
    // key pela seq: re-disparo remonta a pílula, reiniciando a entrada e a barra de progresso
    <div key={dados.seq ?? 0} className="notif show" role="status" aria-live="polite" title={`${dados.fonte} · ${dados.quando ?? 'agora'}`}>
      <div className="p-av" aria-hidden>{dados.iniciais}<i /></div>
      <div className="nf-tx">
        <span className="nf-quem">{dados.quem}</span>
        <span className="nf-msg">{dados.mensagem}</span>
      </div>
      {abrir && (
        <div className="acoes-n">
          <button type="button" className="bm claro" onClick={abrir}>Responder</button>
        </div>
      )}
      <button type="button" className="fechar" onClick={aoFechar} aria-label="Fechar o aviso">×</button>
      <div className="prog" aria-hidden />
    </div>
  );
}
