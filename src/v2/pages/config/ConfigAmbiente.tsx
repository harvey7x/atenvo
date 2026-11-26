/* AMBIENTE CONFIGURAÇÕES da Reviza (dono 22/11): "um ambiente de configuração — tudo que a gente for
   configurar precisa estar nesse ambiente". Uma rota (/config/<seção>) e o menu do ambiente no lugar
   das abas:
     whatsapp      conectar por QR Code e dizer se o número é das Cobranças ou do Atendimento   (admin)
     integracoes   os serviços de fora, um quadradinho cada; /config/integracoes/asaas configura
                   os pagamentos pelo Asaas e /config/integracoes/whatsapp-oficial a API oficial
                   do WhatsApp; /config/integracoes/ia a chave de IA da própria empresa (Resumo do
                   atendimento e Transcrever áudio no WhatsApp)                                 (admin)
     usuarios      logins: criar, papel, ambientes, telas liberadas, senha, desativar, excluir  (admin)
     equipes       as equipes do Atendimento: gerente, pessoas e o WhatsApp de cada uma         (admin)
     registros     tudo o que cada pessoa fez (a tela que ficava em Cobranças)                  (admin)
     iris          a atendente virtual: chave do Google, personalidade, conhecimento, canais    (admin)
     atendimento   regras e etiquetas do Atendimento                                            (admin)
     retomada      mensagens automáticas quando o cliente para de responder, por etapa do Kanban (admin)
     aviso-espera  o sino avisa quem está esperando além da meta: o responsável e depois os gestores (admin)
     campos        os campos do cliente que a equipe preenche (como o "Nome completo (RG)") e o cartão do Kanban (admin)
     motivos       os motivos do "Fechar conversa" e o histórico de quem fechou e por quê            (admin)
     venda         o nome do botão que marca a venda, o histórico de vendas e a venda na Meta          (admin)
     origens       de onde vieram os leads, as origens cadastradas e a origem de cada número          (admin)
     produtos      o catálogo de produtos e serviços, com o valor de cada um                           (admin)
     cofre         a senha do cofre e as conversas trancadas                                            (admin)
     avisos-equipe os avisos para a equipe no sino (quem recebe cada um) e o relatório                (admin)
     importacao    o que veio do sistema anterior (Kanban) e passar os cards para a equipe              (admin)
     webhooks      avisar outro sistema (POST assinado) nos momentos escolhidos                         (admin)
     conta · notificacoes · preferencias      o que é da própria pessoa                         (todos)
   As quatro últimas são as seções da tela de Configurações de antes, uma por vez (abaFixa). */
import { lazy, Suspense } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { useOrg } from '@/context/OrgContext';
import { isRevizaMode } from '@/lib/supabase';
import { temCadastroAtendimento, temRecurso } from '../../data/config/recursos';
import ConfiguracoesV2 from '../Configuracoes';
import { AbaUsuarios } from '../RevizaUsuarios';
import { RevizaRegistros } from '../RevizaRegistros';
import { ConfigWhatsApp } from './ConfigWhatsApp';
import { ConfigIntegracoes } from './ConfigIntegracoes';
import { ConfigEquipes } from './ConfigEquipes';
import { ConfigEntradas } from './ConfigEntradas';
import { ConfigAsaas } from './ConfigAsaas';
import { ConfigWhatsAppOficial } from './ConfigWhatsAppOficial';
import { ConfigAnuncios } from './ConfigAnuncios';
import { ConfigRetomada } from './ConfigRetomada';
import { ConfigAvisoEspera } from './ConfigAvisoEspera';
import { ConfigChaveIa } from './ConfigChaveIa';
import { ConfigCampos } from './ConfigCampos';
import { ConfigMotivos } from './ConfigMotivos';
import { ConfigVenda } from './ConfigVenda';
import { ConfigOrigens } from './ConfigOrigens';
import { ConfigProdutos } from './ConfigProdutos';
import { ConfigCofre } from './ConfigCofre';
import { ConfigAvisosEquipe } from './ConfigAvisosEquipe';
import { ConfigImportacao } from './ConfigImportacao';
import { ConfigWebhooks } from './ConfigWebhooks';
// a atendente virtual (Iris): a tela de sempre do Atendimento, agora dentro do ambiente Configurações
const Iris = lazy(() => import('./iris/ConfigIris'));
import '../cobrancas.css';
import './config.css';

const SO_ADMIN = new Set(['whatsapp', 'integracoes', 'usuarios', 'equipes', 'registros', 'atendimento', 'iris', 'retomada', 'aviso-espera', 'campos', 'motivos', 'venda', 'origens', 'produtos', 'cofre', 'avisos-equipe', 'importacao', 'webhooks']);
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
  // "Minha conta" (conta, notificações, preferências) são telas do Atendimento: sem ele no servidor, quem
  // não é administrador não tem o que fazer neste ambiente e volta para o trabalho
  const temConta = temRecurso('atendimento');
  const foraDaqui = admin ? '/config/whatsapp' : temConta ? '/config/conta' : '/cobrancas/painel';
  if (!secao) return <Navigate to={foraDaqui} replace />;
  if (SO_ADMIN.has(secao) && !admin) return <Navigate to={foraDaqui} replace />;
  if (ABA_FIXA[secao] && secao !== 'atendimento' && !temConta) return <Navigate to={foraDaqui} replace />;
  // o que ainda não existe no servidor desta instalação não abre (nem pelo endereço)
  if ((secao === 'iris' && !temRecurso('iris')) || (secao === 'atendimento' && !temRecurso('atendimento')) || (secao === 'retomada' && !(temRecurso('retomada') && temRecurso('atendimento'))) || (secao === 'aviso-espera' && !(temRecurso('aviso-espera') && temRecurso('atendimento'))) || ((secao === 'campos' || secao === 'motivos') && !(temRecurso('campos') && temRecurso('atendimento'))) || ((secao === 'venda' || secao === 'origens') && !(temRecurso('venda-origem') && temRecurso('atendimento'))) || (secao === 'produtos' && !(temRecurso('financeiro') && temRecurso('atendimento'))) || (secao === 'cofre' && !(temRecurso('cofre') && temRecurso('atendimento'))) || (secao === 'avisos-equipe' && !(temRecurso('avisos-equipe') && temRecurso('atendimento'))) || (secao === 'importacao' && !(temRecurso('importacao') && temRecurso('atendimento'))) || (secao === 'webhooks' && !(temRecurso('webhooks') && temRecurso('atendimento'))) || (secao === 'equipes' && !temCadastroAtendimento())) return <Navigate to="/config/whatsapp" replace />;
  if (secao === 'integracoes' && ((servico === 'asaas' && !temRecurso('asaas')) || (servico === 'whatsapp-oficial' && !temRecurso('wa-oficial')) || (servico === 'anuncios' && !(temRecurso('anuncios') && temRecurso('atendimento'))) || (servico === 'ia' && !(temRecurso('ia-propria') && temRecurso('atendimento'))))) return <Navigate to="/config/integracoes" replace />;

  if (secao === 'whatsapp') return (<><Cabecalho titulo="WhatsApp" sub={temRecurso('atendimento') ? 'Os números conectados ao sistema e para qual ambiente cada um trabalha.' : 'Os números de WhatsApp da régua de cobrança, um para cada comercial.'} /><ConfigWhatsApp /></>);
  if (secao === 'integracoes') {
    if (servico === 'asaas') return (<><Cabecalho titulo="Asaas" sub="Pagamentos por Pix, boleto e cartão, com baixa das parcelas quando o cliente paga." voltar={{ rotulo: 'Integrações', para: '/config/integracoes' }} /><ConfigAsaas /></>);
    if (servico === 'whatsapp-oficial') return (<><Cabecalho titulo="WhatsApp oficial" sub="A API oficial do WhatsApp, da Meta: conectar o número, acompanhar a saúde dele e cuidar dos modelos de mensagem." voltar={{ rotulo: 'Integrações', para: '/config/integracoes' }} /><ConfigWhatsAppOficial /></>);
    if (servico === 'ia') return (<><Cabecalho titulo="Inteligência artificial" sub="A chave de IA da própria empresa, no Google Gemini ou na OpenAI: com ela, o WhatsApp faz o resumo do atendimento e transcreve os áudios. O custo é da sua conta." voltar={{ rotulo: 'Integrações', para: '/config/integracoes' }} /><ConfigChaveIa /></>);
    if (servico === 'anuncios') return (<><Cabecalho titulo="Anúncios do Facebook" sub="A conta de anúncios da Meta: o Dashboard mostra quanto foi investido, o custo de cada lead e qual campanha está rodando melhor." voltar={{ rotulo: 'Integrações', para: '/config/integracoes' }} /><ConfigAnuncios /></>);
    if (servico === 'receber' && temRecurso('atendimento')) return (<><Cabecalho titulo="Receber de outros sistemas" sub="Um endereço para cada sistema de fora (como a URA): o que ele mandar vira conversa no WhatsApp do Atendimento e lead no Kanban." voltar={{ rotulo: 'Integrações', para: '/config/integracoes' }} /><ConfigEntradas /></>);
    if (servico) return <Navigate to="/config/integracoes" replace />;
    return (<><Cabecalho titulo="Integrações" sub="Os serviços de fora que trabalham junto com o sistema. Conecte e configure cada um aqui." /><ConfigIntegracoes /></>);
  }
  if (secao === 'usuarios') return (<><Cabecalho titulo="Usuários e acessos" sub="Quem entra no sistema, em quais ambientes e quais telas cada pessoa vê." /><AbaUsuarios demo={false} gestor={admin} /></>);
  if (secao === 'equipes') return (<><Cabecalho titulo="Equipes" sub="As equipes do Atendimento: quem é o gerente, quem faz parte e qual é o WhatsApp de cada uma." /><ConfigEquipes /></>);
  if (secao === 'registros') return (<><Cabecalho titulo="Registros" sub="Tudo o que cada pessoa fez no sistema: quem, o quê, quando e o que mudou." /><RevizaRegistros /></>);
  if (secao === 'iris') return (<><Cabecalho titulo="Atendentes de IA" sub="A Iris e as outras IAs do Atendimento: o que cada uma sabe e faz, e em quais números atende." /><Suspense fallback={null}><Iris /></Suspense></>);
  if (secao === 'retomada') return (<><Cabecalho titulo="Retomada automática" sub="Mensagens que vão sozinhas quando o cliente para de responder, uma sequência por etapa do Kanban. Se ele responder, a sequência para." /><ConfigRetomada /></>);
  if (secao === 'aviso-espera') return (<><Cabecalho titulo="Aviso de espera" sub="O sino avisa quando um cliente passa da meta sem resposta: primeiro o responsável pela conversa, depois os gestores." /><ConfigAvisoEspera /></>);
  if (secao === 'campos') return (<><Cabecalho titulo="Campos do cliente" sub="O que a equipe preenche sobre cada cliente no painel do WhatsApp, e o que aparece no cartão do Kanban." /><ConfigCampos /></>);
  if (secao === 'motivos') return (<><Cabecalho titulo="Motivos de fechamento" sub="As opções que aparecem ao fechar uma conversa, e o histórico de quem fechou e por quê." /><ConfigMotivos /></>);
  if (secao === 'venda') return (<><Cabecalho titulo="Botão de venda" sub="O nome do botão que marca a venda como fechada, no WhatsApp e no Kanban, e quem marcou cada venda." /><ConfigVenda /></>);
  if (secao === 'origens') return (<><Cabecalho titulo="Origem do lead" sub="De onde cada lead veio. O sistema reconhece o anúncio sozinho; sem origem, o lead aparece como Indefinida." /><ConfigOrigens /></>);
  if (secao === 'produtos') return (<><Cabecalho titulo="Produtos e serviços" sub="O catálogo do que a empresa vende, com o valor de cada item, para lançar no Financeiro do cliente." /><ConfigProdutos /></>);
  if (secao === 'cofre') return (<><Cabecalho titulo="Cofre de conversas" sub="Uma senha única esconde o conteúdo das conversas trancadas. Só quem tem a senha abre." /><ConfigCofre /></>);
  if (secao === 'webhooks') return (<><Cabecalho titulo="Webhooks" sub="Avise outro sistema na hora: lead novo, mudança de etapa, venda, descarte, reunião marcada e formulário." /><ConfigWebhooks /></>);
  if (secao === 'importacao') return (<><Cabecalho titulo="Importação do sistema anterior" sub="O Kanban que veio do sistema que vocês usavam antes, e para quem vão os cards de cada responsável de lá." /><ConfigImportacao /></>);
  if (secao === 'avisos-equipe') return (<><Cabecalho titulo="Avisos para a equipe" sub="Avisos automáticos no sino de quem você escolher, quando o cliente chega num momento que importa." /><ConfigAvisosEquipe /></>);
  if (ABA_FIXA[secao]) return <ConfiguracoesV2 abaFixa={ABA_FIXA[secao]} />;
  return <Navigate to={foraDaqui} replace />;
}
