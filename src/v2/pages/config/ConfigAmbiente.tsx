/* AMBIENTE CONFIGURAÇÕES da Reviza (dono 22/11): "um ambiente de configuração — tudo que a gente for
   configurar precisa estar nesse ambiente". Uma rota (/config/<seção>) e o menu do ambiente no lugar
   das abas:
     whatsapp      conectar por QR Code e dizer se o número é das Cobranças ou do Atendimento   (admin)
     integracoes   os serviços de fora, um quadradinho cada; /config/integracoes/asaas configura
                   os pagamentos pelo Asaas                                                     (admin)
     usuarios      logins: criar, papel, ambientes, telas liberadas, senha, desativar, excluir  (admin)
     registros     tudo o que cada pessoa fez (a tela que ficava em Cobranças)                  (admin)
     atendimento   regras e etiquetas do Atendimento                                            (admin)
     conta · notificacoes · preferencias      o que é da própria pessoa                         (todos)
   As quatro últimas são as seções da tela de Configurações de antes, uma por vez (abaFixa). */
import { Link, Navigate, useParams } from 'react-router-dom';
import { useOrg } from '@/context/OrgContext';
import { isRevizaMode } from '@/lib/supabase';
import ConfiguracoesV2 from '../Configuracoes';
import { AbaUsuarios } from '../RevizaUsuarios';
import { RevizaRegistros } from '../RevizaRegistros';
import { ConfigWhatsApp } from './ConfigWhatsApp';
import { ConfigIntegracoes } from './ConfigIntegracoes';
import { ConfigAsaas } from './ConfigAsaas';
import '../cobrancas.css';
import './config.css';

const SO_ADMIN = new Set(['whatsapp', 'integracoes', 'usuarios', 'registros', 'atendimento']);
const ABA_FIXA: Record<string, string> = { conta: 'conta', atendimento: 'atendimento', notificacoes: 'notif', preferencias: 'prefs' };

function Cabecalho({ titulo, sub, voltar }: { titulo: string; sub?: string; voltar?: { rotulo: string; para: string } }) {
  return (
    <div className="ph sobe">
      <div>
        {voltar
          ? <Link className="cfga-volta" to={voltar.para}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m15 18-6-6 6-6" /></svg>{voltar.rotulo}</Link>
          : <div className="cob-migalha">Configurações</div>}
        <h2>{titulo}</h2>
        {sub && <p className="cfga-sub">{sub}</p>}
      </div>
      <div className="acoes" />
    </div>
  );
}

export default function ConfigAmbiente() {
  const { secao, servico } = useParams();
  const { currentOrg } = useOrg();
  const admin = currentOrg.role === 'admin';
  // o ambiente é da Reviza; fora dela este endereço não existe
  if (!isRevizaMode) return <Navigate to="/configuracoes" replace />;
  if (!secao) return <Navigate to={admin ? '/config/whatsapp' : '/config/conta'} replace />;
  if (SO_ADMIN.has(secao) && !admin) return <Navigate to="/config/conta" replace />;

  if (secao === 'whatsapp') return (<><Cabecalho titulo="WhatsApp" sub="Os números conectados ao sistema e para qual ambiente cada um trabalha." /><ConfigWhatsApp /></>);
  if (secao === 'integracoes') {
    if (servico === 'asaas') return (<><Cabecalho titulo="Asaas" sub="Pagamentos por Pix, boleto e cartão, com baixa das parcelas quando o cliente paga." voltar={{ rotulo: 'Integrações', para: '/config/integracoes' }} /><ConfigAsaas /></>);
    if (servico) return <Navigate to="/config/integracoes" replace />;
    return (<><Cabecalho titulo="Integrações" sub="Os serviços de fora que trabalham junto com o sistema. Conecte e configure cada um aqui." /><ConfigIntegracoes /></>);
  }
  if (secao === 'usuarios') return (<><Cabecalho titulo="Usuários e acessos" sub="Quem entra no sistema, em quais ambientes e quais telas cada pessoa vê." /><AbaUsuarios demo={false} gestor={admin} /></>);
  if (secao === 'registros') return (<><Cabecalho titulo="Registros" sub="Tudo o que cada pessoa fez no sistema: quem, o quê, quando e o que mudou." /><RevizaRegistros /></>);
  if (ABA_FIXA[secao]) return <ConfiguracoesV2 abaFixa={ABA_FIXA[secao]} />;
  return <Navigate to={admin ? '/config/whatsapp' : '/config/conta'} replace />;
}
