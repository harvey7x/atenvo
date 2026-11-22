/* AMBIENTE CONFIGURAÇÕES da Reviza (dono 22/11): "um ambiente de configuração — tudo que a gente for
   configurar precisa estar nesse ambiente". Uma rota (/config/<seção>) e o menu do ambiente no lugar
   das abas:
     whatsapp      conectar por QR Code e dizer se o número é das Cobranças ou do Atendimento   (admin)
     usuarios      logins: criar, papel, ambientes, telas liberadas, senha, desativar, excluir  (admin)
     registros     tudo o que cada pessoa fez (a tela que ficava em Cobranças)                  (admin)
     atendimento   regras e etiquetas do Atendimento                                            (admin)
     conta · notificacoes · preferencias      o que é da própria pessoa                         (todos)
   As quatro últimas são as seções da tela de Configurações de antes, uma por vez (abaFixa). */
import { Navigate, useParams } from 'react-router-dom';
import { useOrg } from '@/context/OrgContext';
import { isRevizaMode } from '@/lib/supabase';
import ConfiguracoesV2 from '../Configuracoes';
import { AbaUsuarios } from '../RevizaUsuarios';
import { RevizaRegistros } from '../RevizaRegistros';
import { ConfigWhatsApp } from './ConfigWhatsApp';
import '../cobrancas.css';
import './config.css';

const SO_ADMIN = new Set(['whatsapp', 'usuarios', 'registros', 'atendimento']);
const ABA_FIXA: Record<string, string> = { conta: 'conta', atendimento: 'atendimento', notificacoes: 'notif', preferencias: 'prefs' };

function Cabecalho({ titulo, sub }: { titulo: string; sub?: string }) {
  return (
    <div className="ph sobe">
      <div>
        <div className="cob-migalha">Configurações</div>
        <h2>{titulo}</h2>
        {sub && <p className="cfga-sub">{sub}</p>}
      </div>
      <div className="acoes" />
    </div>
  );
}

export default function ConfigAmbiente() {
  const { secao } = useParams();
  const { currentOrg } = useOrg();
  const admin = currentOrg.role === 'admin';
  // o ambiente é da Reviza; fora dela este endereço não existe
  if (!isRevizaMode) return <Navigate to="/configuracoes" replace />;
  if (!secao) return <Navigate to={admin ? '/config/whatsapp' : '/config/conta'} replace />;
  if (SO_ADMIN.has(secao) && !admin) return <Navigate to="/config/conta" replace />;

  if (secao === 'whatsapp') return (<><Cabecalho titulo="WhatsApp" sub="Os números conectados ao sistema e para qual ambiente cada um trabalha." /><ConfigWhatsApp /></>);
  if (secao === 'usuarios') return (<><Cabecalho titulo="Usuários e acessos" sub="Quem entra no sistema, em quais ambientes e quais telas cada pessoa vê." /><AbaUsuarios demo={false} gestor={admin} /></>);
  if (secao === 'registros') return (<><Cabecalho titulo="Registros" sub="Tudo o que cada pessoa fez no sistema: quem, o quê, quando e o que mudou." /><RevizaRegistros /></>);
  if (ABA_FIXA[secao]) return <ConfiguracoesV2 abaFixa={ABA_FIXA[secao]} />;
  return <Navigate to={admin ? '/config/whatsapp' : '/config/conta'} replace />;
}
