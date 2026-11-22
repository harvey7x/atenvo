/* CONFIGURAÇÕES → INTEGRAÇÕES (dono 22/11): "vai ser uma tela, tem vários quadradinhos que pode
   integrar; um deles vai ser o Asaas".
   Cada quadradinho é um serviço de fora: o que é, para que serve, se está conectado e o botão.
   · Asaas     → /config/integracoes/asaas (conectar e configurar os pagamentos)
   · WhatsApp por QR Code → /config/whatsapp (os números já são conectados lá)
   · WhatsApp oficial     → /config/integracoes/whatsapp-oficial (a API oficial, da Meta)
   · "Em breve" são lugares guardados — sem botão, para ninguém achar que funciona.
   Sem logomarca de terceiros: cada serviço tem um ícone da família do sistema. */
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { BadgeStatus, BotaoPrimario, BotaoSec, CardVidro } from '../../components';
import { ROTULO_AMBIENTE_ASAAS, useAsaas } from '../../data/config/integracoes';
import { useConexoesWA } from '../../data/config/conexoes';
import { useOficial } from '../../data/config/oficial';
import '../painel/painel.css';

const Ic = ({ children }: { children: ReactNode }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{children}</svg>
);
export const IcPagamentos = () => <Ic><path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" /><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" /></Ic>;
const IcMensagem = () => <Ic><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" /></Ic>;
const IcAnuncio = () => <Ic><path d="m3 11 18-5v12L3 14v-3z" /><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" /></Ic>;
const IcOficial = () => <Ic><path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z" /><path d="m9 12 2 2 4-4" /></Ic>;
const IcPlanilha = () => <Ic><rect width="18" height="18" x="3" y="3" rx="2" /><path d="M3 9h18" /><path d="M3 15h18" /><path d="M9 9v12" /><path d="M15 9v12" /></Ic>;
const IcTomada = () => <Ic><path d="M12 22v-5" /><path d="M9 8V2" /><path d="M15 8V2" /><path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z" /></Ic>;

type Estado = 'conectado' | 'desconectado' | 'breve';
function Quadro({ icone, nome, categoria, descricao, estado, detalhe, acao, atraso }: {
  icone: ReactNode; nome: string; categoria: string; descricao: string; estado: Estado; detalhe?: string; acao?: ReactNode; atraso: number;
}) {
  return (
    <CardVidro spot className={`pn-card cfgi-quadro sobe${estado === 'breve' ? ' breve' : ''}`} style={{ animationDelay: `${atraso}s` }} data-servico={nome}>
      <div className="cfgi-topo">
        <span className={`cfgi-ic${estado === 'conectado' ? ' on' : ''}`}>{icone}</span>
        {estado === 'conectado' ? <BadgeStatus tom="ok">Conectado</BadgeStatus>
          : estado === 'breve' ? <span className="cfgi-breve">Em breve</span>
          : <BadgeStatus tom="neutro">Não conectado</BadgeStatus>}
      </div>
      <div className="cfgi-tx">
        <small>{categoria}</small>
        <h3>{nome}</h3>
        <p>{descricao}</p>
      </div>
      <div className="cfgi-pe">
        {detalhe && <span className="cfgi-det">{detalhe}</span>}
        {acao}
      </div>
    </CardVidro>
  );
}

export function ConfigIntegracoes() {
  const ir = useNavigate();
  const asaas = useAsaas();
  const wa = useConexoesWA();
  const oficial = useOficial();
  const ofN = oficial.dados.numeros.length;
  const ofModelos = oficial.dados.modelos.filter((m) => m.situacao === 'aprovado').length;
  const a = asaas.dados;
  const waOn = wa.lista.filter((c) => c.estado === 'conectado').length;
  const waTot = wa.lista.length;

  return (
    <div className="pn cfgi">
      <div className="cfgi-grade">
        <Quadro atraso={0} icone={<IcPagamentos />} nome="Asaas" categoria="Pagamentos"
          descricao="Gera a cobrança de cada parcela por Pix, boleto ou cartão e dá baixa sozinho quando o cliente paga."
          estado={a.conectado ? 'conectado' : 'desconectado'}
          detalhe={asaas.carregando ? 'Consultando…' : a.conectado ? `${a.conta?.nome ?? 'Conta conectada'} · ${ROTULO_AMBIENTE_ASAAS[a.ambiente ?? 'producao']}` : undefined}
          acao={a.conectado
            ? <BotaoSec mini onClick={() => ir('/config/integracoes/asaas')}>Configurar</BotaoSec>
            : <BotaoPrimario mini onClick={() => ir('/config/integracoes/asaas')}>Conectar</BotaoPrimario>} />
        <Quadro atraso={0.04} icone={<IcMensagem />} nome="WhatsApp por QR Code" categoria="Mensagens"
          descricao="Os números conectados por QR Code: os da régua de Cobranças e os que recebem o Atendimento."
          estado={waOn > 0 ? 'conectado' : 'desconectado'}
          detalhe={wa.carregando ? 'Consultando…' : waTot ? `${waOn} de ${waTot} ${waTot === 1 ? 'número conectado' : 'números conectados'}` : undefined}
          acao={waTot
            ? <BotaoSec mini onClick={() => ir('/config/whatsapp')}>Gerenciar</BotaoSec>
            : <BotaoPrimario mini onClick={() => ir('/config/whatsapp')}>Conectar</BotaoPrimario>} />
        <Quadro atraso={0.08} icone={<IcOficial />} nome="WhatsApp oficial" categoria="Mensagens"
          descricao="A API oficial do WhatsApp, da Meta: o número não depende de celular ligado e envia por modelos de mensagem aprovados."
          estado={ofN > 0 ? 'conectado' : 'desconectado'}
          detalhe={oficial.carregando ? 'Consultando…' : ofN ? `${ofN} ${ofN === 1 ? 'número conectado' : 'números conectados'} · ${ofModelos} ${ofModelos === 1 ? 'modelo aprovado' : 'modelos aprovados'}` : undefined}
          acao={ofN
            ? <BotaoSec mini onClick={() => ir('/config/integracoes/whatsapp-oficial')}>Configurar</BotaoSec>
            : <BotaoPrimario mini onClick={() => ir('/config/integracoes/whatsapp-oficial')}>Conectar</BotaoPrimario>} />
        <Quadro atraso={0.12} icone={<IcAnuncio />} nome="Facebook e Instagram" categoria="Mensagens" estado="breve"
          descricao="Receber no Atendimento as mensagens e os contatos que chegam pelos anúncios e pelas páginas." />
        <Quadro atraso={0.16} icone={<IcPlanilha />} nome="Google Planilhas" categoria="Dados" estado="breve"
          descricao="Levar a carteira e os pagamentos para uma planilha que se atualiza sozinha." />
        <Quadro atraso={0.2} icone={<IcTomada />} nome="Outros sistemas" categoria="Dados" estado="breve"
          descricao="Avisar outro sistema quando um pagamento entra ou quando um cliente muda." />
      </div>
    </div>
  );
}
