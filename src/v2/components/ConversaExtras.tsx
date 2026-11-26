/* Peças da lista e da conversa do WhatsApp trazidas do sistema que a Reviza usava antes (26/11, "igual"):
   · BuscaNaConversa — a barra "Buscar na conversa" com anterior/próxima (rola até a bolha e acende);
   · BarraSelecao — várias conversas de uma vez: marcar como lida/não lida, fixar, arquivar;
   · DesempenhoChat — o dia do atendimento num quadro (os mesmos números do Dashboard › Resumo do dia).
   O modo privacidade (esconder telefones e mensagens) é só CSS: a classe .wa-privado na raiz da página. */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { WaMessage } from '@/data/whatsappDemo';
import { spHoje } from '@/data/relatorios';
import { fraseDoResumo, qtd, useResumoDia } from '@/data/resumoDia';
import { acharNaConversa } from '../lib/exportarConversa';
import { ModalV2 } from './ModalV2';
import { BotaoSec } from './Botao';
import { CartaoMetricaFixo, GradeMetricas } from './CartaoMetrica';
import './conversaExtras.css';

const IcCima = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m18 15-6-6-6 6" /></svg>;
const IcBaixo = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m6 9 6 6 6-6" /></svg>;
const IcX = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M18 6 6 18M6 6l12 12" /></svg>;

export function BuscaNaConversa({ msgs, aoIr, aoFechar }: { msgs: WaMessage[]; aoIr: (id: string) => void; aoFechar: () => void }) {
  const [termo, setTermo] = useState('');
  const [pos, setPos] = useState(0);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  const achados = useMemo(() => acharNaConversa(msgs, termo), [msgs, termo]);
  // a mais recente primeiro (como no WhatsApp): o índice 0 é a última que tem o termo
  const ordem = useMemo(() => [...achados].reverse(), [achados]);
  useEffect(() => { setPos(0); if (ordem[0]) aoIr(ordem[0]); }, [ordem.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps
  const ir = (d: number) => { if (!ordem.length) return; const n = (pos + d + ordem.length) % ordem.length; setPos(n); aoIr(ordem[n]); };
  return (
    <div className="wa-busca-conv" role="search">
      <input ref={ref} className="inp" placeholder="Buscar na conversa…" value={termo} onChange={(e) => setTermo(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Escape') aoFechar(); if (e.key === 'Enter') ir(e.shiftKey ? -1 : 1); }} aria-label="Buscar na conversa" />
      <span className="n num" aria-live="polite">{termo.trim().length < 2 ? '' : ordem.length ? `${pos + 1} de ${ordem.length}` : 'nada encontrado'}</span>
      <button type="button" className="ib2" title="Mais antiga" aria-label="Resultado anterior" disabled={!ordem.length} onClick={() => ir(1)}><IcCima /></button>
      <button type="button" className="ib2" title="Mais recente" aria-label="Próximo resultado" disabled={!ordem.length} onClick={() => ir(-1)}><IcBaixo /></button>
      <button type="button" className="ib2" title="Fechar a busca (Esc)" aria-label="Fechar a busca" onClick={aoFechar}><IcX /></button>
    </div>
  );
}

export function BarraSelecao({ n, ocupado, aoLida, aoNaoLida, aoFixar, aoArquivar, aoTodas, aoCancelar }: {
  n: number; ocupado: boolean; aoLida: () => void; aoNaoLida: () => void; aoFixar: () => void; aoArquivar: () => void; aoTodas: () => void; aoCancelar: () => void;
}) {
  return (
    <div className="wa-selecao" role="toolbar" aria-label="Ações para as conversas selecionadas">
      <div className="t"><b className="num">{n}</b> {n === 1 ? 'selecionada' : 'selecionadas'} <button type="button" className="lnk" onClick={aoTodas}>Selecionar as da aba</button></div>
      <div className="a">
        <BotaoSec mini disabled={!n || ocupado} onClick={aoLida}>Marcar lidas</BotaoSec>
        <BotaoSec mini disabled={!n || ocupado} onClick={aoNaoLida}>Não lidas</BotaoSec>
        <BotaoSec mini disabled={!n || ocupado} onClick={aoFixar}>Fixar</BotaoSec>
        <BotaoSec mini disabled={!n || ocupado} onClick={aoArquivar}>Arquivar</BotaoSec>
        <BotaoSec mini onClick={aoCancelar}>Cancelar</BotaoSec>
      </div>
    </div>
  );
}

export function DesempenhoChat({ aberto, aoFechar, aoAbrirResumo }: { aberto: boolean; aoFechar: () => void; aoAbrirResumo: () => void }) {
  const hoje = spHoje();
  const q = useResumoDia(hoje, aberto);
  const r = q.data;
  const int = (v: number) => v.toLocaleString('pt-BR');
  return (
    <ModalV2 aberto={aberto} aoFechar={aoFechar} titulo="Desempenho do chat — hoje" largura={880}
      rodape={<><BotaoSec onClick={aoAbrirResumo}>Abrir o resumo completo</BotaoSec><BotaoSec onClick={aoFechar}>Fechar</BotaoSec></>}>
      {q.isError ? <p className="wa-desemp-erro">{(q.error as Error).message}</p>
        : !r ? <p className="wa-desemp-erro">Carregando os números de hoje…</p>
        : (
          <div className="wa-desemp">
            <p className="frase">{fraseDoResumo(r)}</p>
            <GradeMetricas rotulo="Hoje no atendimento">
              <CartaoMetricaFixo icone="balao" titulo="Escreveram" valor={int(r.clientesEscreveram)} detalhe={<span>clientes · {qtd(r.conversasNovas, 'conversa nova', 'conversas novas')}</span>} />
              <CartaoMetricaFixo icone="pessoas" titulo="Atendidos" valor={int(r.atendidasEquipe)} detalhe={<span>pela equipe · {qtd(r.enviadasEquipe, 'mensagem', 'mensagens')}</span>} />
              <CartaoMetricaFixo icone="certo" titulo="Fechadas" valor={int(r.fechadas)} detalhe={<span>{qtd(r.leadsNovos, 'lead novo', 'leads novos')}</span>} />
              <CartaoMetricaFixo icone="alerta" titulo="Além da meta" valor={int(r.esperaramMeta)} detalhe={<span>{r.atendidasIa ? `IA atendeu ${int(r.atendidasIa)}` : 'IA não atendeu'}</span>} />
            </GradeMetricas>
            {r.atendentes.length > 0 && (
              <table className="wa-desemp-tab">
                <thead><tr><th scope="col">Por usuário</th><th scope="col">Conversas</th><th scope="col">Mensagens</th><th scope="col">Fechadas</th></tr></thead>
                <tbody>{r.atendentes.slice(0, 12).map((a) => <tr key={a.id}><td>{a.nome}</td><td className="num">{int(a.conversas)}</td><td className="num">{int(a.mensagens)}</td><td className="num">{int(a.fechadas)}</td></tr>)}</tbody>
              </table>
            )}
          </div>
        )}
    </ModalV2>
  );
}
