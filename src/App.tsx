import { Suspense, type ReactNode } from 'react';
// lazy com auto-recarga: chunk que sumiu após deploy novo força 1 reload (recargaChunk.ts)
import { lazyComRecarga as lazy } from '@/lib/recargaChunk';
import { createBrowserRouter, createHashRouter, RouterProvider, Navigate, useParams, type RouteObject } from 'react-router-dom';
// v1 — preservado APENAS em /v1/* como fallback técnico (sem link na interface). Nada é deletado.
// Guardas do v1 ficam estáticas: são minúsculas e só usam os contextos que já estão no entry.
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { RequireRole } from '@/components/RequireRole';
// CSS dos componentes v1 REUSADOS dentro do v2 (Modal, MediaComposer, AudioRecorder, ficha
// judicial, RelacionamentoContatoBox): ficam no CSS de ENTRADA, nesta ordem, de propósito.
// Os overrides do v2 (componentes.css, o reset `.v2 *` do base.css) vencem por VIR DEPOIS
// com a mesma especificidade; se este CSS fosse junto com o chunk lazy, entraria no <head>
// DEPOIS do CSS do v2 e o v1 voltaria a ganhar (padding/hover do tema claro). NÃO remover.
import '@/components/Modal.css';
import '@/components/MediaComposer.css';
import '@/components/AudioRecorder.css';
import '@/components/FichaJudicialModal.css';
import '@/components/RelacionamentoContatoBox.css';
// Páginas e shell do v1 SOB DEMANDA (perf 20/10): antes eram import estático e arrastavam o v1
// inteiro (JS ~845 kB + ~340 kB de CSS de página) para o bundle de entrada de TODA rota. Agora
// o v1 é UM chunk (src/pages/rotasV1.ts) que só baixa ao abrir /v1/*; o import() é cacheado,
// então as várias rotas abaixo compartilham o mesmo download. O lazy precisa de { default }.
// ATENÇÃO: CSS de página do v1 (src/pages/*.css) não vem mais no entry — classe dele usada
// no v2 tem que morar no CSS do próprio componente (ex.: .atv-lightbox → MediaComposer.css).
const v1 = () => import('@/pages/rotasV1');
const AppShell = lazy(() => v1().then((m) => ({ default: m.AppShell })));
const Login = lazy(() => v1().then((m) => ({ default: m.Login })));
const RedefinirSenha = lazy(() => v1().then((m) => ({ default: m.RedefinirSenha })));
const AlterarSenha = lazy(() => v1().then((m) => ({ default: m.AlterarSenha })));
const DefinirSenha = lazy(() => v1().then((m) => ({ default: m.DefinirSenha })));
const WhatsApp = lazy(() => v1().then((m) => ({ default: m.WhatsApp })));
const Facebook = lazy(() => v1().then((m) => ({ default: m.Facebook })));
const Kanban = lazy(() => v1().then((m) => ({ default: m.Kanban })));
// Presencial preservado no código (src/pages/Agendamentos.tsx), fora da navegação — a rota
// /agendamentos foi reaproveitada para a central de Agendamentos de Mensagens (Fase 2B).
const AgendamentosMensagens = lazy(() => v1().then((m) => ({ default: m.AgendamentosMensagens })));
const Relacionamento = lazy(() => v1().then((m) => ({ default: m.Relacionamento })));
const Scripts = lazy(() => v1().then((m) => ({ default: m.Scripts })));
const Integracoes = lazy(() => v1().then((m) => ({ default: m.Integracoes })));
const Relatorios = lazy(() => v1().then((m) => ({ default: m.Relatorios })));
const Configuracoes = lazy(() => v1().then((m) => ({ default: m.Configuracoes })));
const PlanoUso = lazy(() => v1().then((m) => ({ default: m.PlanoUso })));
const Maturacao = lazy(() => v1().then((m) => ({ default: m.Maturacao })));

// ===== Redesign Platina (design-ref/CONTRATO.md): AGORA as rotas OFICIAIS. Tudo sob demanda. =====
const AppShellV2 = lazy(() => import('@/v2/shell/AppShellV2'));
const LoginV2 = lazy(() => import('@/v2/pages/Login'));
const NaoEncontradaV2 = lazy(() => import('@/v2/pages/NaoEncontrada'));
const RequireAuthV2 = lazy(() => import('@/v2/guards/RequireAuthV2'));
const RequireRoleV2 = lazy(() => import('@/v2/guards/RequireRoleV2'));
const SoAdminV1 = lazy(() => import('@/v2/guards/SoAdminV1'));
const PlanoUsoV2 = lazy(() => import('@/v2/pages/PlanoUso'));
const FerramentasV2 = lazy(() => import('@/v2/pages/Ferramentas'));
const AgendamentosV2 = lazy(() => import('@/v2/pages/Agendamentos'));
const ScriptsV2 = lazy(() => import('@/v2/pages/Scripts'));
const SimuladorV2 = lazy(() => import('@/v2/pages/Simulador'));
const DashboardV2 = lazy(() => import('@/v2/pages/Dashboard'));
const ConfiguracoesV2 = lazy(() => import('@/v2/pages/Configuracoes'));
const IaV2 = lazy(() => import('@/v2/pages/Ia'));
const RecuperacaoV2 = lazy(() => import('@/v2/pages/Recuperacao'));
const PendenciasV2 = lazy(() => import('@/v2/pages/Pendencias'));
const PortabilidadesV2 = lazy(() => import('@/v2/pages/Portabilidades'));
const ManualV2 = lazy(() => import('@/v2/pages/Manual'));
const FluxosV2 = lazy(() => import('@/v2/pages/Fluxos'));
const ContatosV2 = lazy(() => import('@/v2/pages/Contatos'));
const DisparoV2 = lazy(() => import('@/v2/pages/Disparo'));
const RelatoriosV2 = lazy(() => import('@/v2/pages/Relatorios'));
const IntegracoesV2 = lazy(() => import('@/v2/pages/Integracoes'));
const KanbanV2 = lazy(() => import('@/v2/pages/Kanban'));
const PosVendaV2 = lazy(() => import('@/v2/pages/PosVenda'));
const GuardiaoV2 = lazy(() => import('@/v2/pages/Guardiao'));
// /whatsapp passa por um gate de viewport: celular → chat mobile (/m); desktop → inbox intocado.
const GateWhatsApp = lazy(() => import('@/v2/mobile/GateWhatsApp'));
const GateMobileApp = lazy(() => import('@/v2/mobile/GateMobileApp'));
const MobileShell = lazy(() => import('@/v2/mobile/MobileShell'));
const ListaConversasMobile = lazy(() => import('@/v2/mobile/ListaConversasMobile'));
const ConversaMobile = lazy(() => import('@/v2/mobile/ConversaMobile'));
const ManutencaoV2 = lazy(() => import('@/v2/pages/Manutencao'));
const VitrineV2 = lazy(() => import('@/v2/pages/Vitrine'));
const RedefinirSenhaV2 = lazy(() => import('@/v2/pages/RedefinirSenha'));
const CoexistenciaV2 = lazy(() => import('@/v2/pages/Coexistencia'));
const DefinirSenhaV2 = lazy(() => import('@/v2/pages/DefinirSenha'));
const AlterarSenhaV2 = lazy(() => import('@/v2/pages/AlterarSenha'));

function Lz({ children }: { children: ReactNode }) {
  return <Suspense fallback={null}>{children}</Suspense>;
}

// Compat: bookmarks do preview antigo (/v2/<x>) caem na rota oficial equivalente (/<x>).
function RedirDeV2() {
  const { '*': resto } = useParams();
  return <Navigate to={'/' + (resto ?? '')} replace />;
}

const routes: RouteObject[] = [
  // ============ ROTAS OFICIAIS = Platina (o corte) ============
  { path: '/login', element: <Lz><LoginV2 /></Lz> },
  { path: '/redefinir-senha', element: <Lz><RedefinirSenhaV2 /></Lz> },
  { path: '/definir-senha', element: <Lz><DefinirSenhaV2 /></Lz> },
  {
    element: <Lz><RequireAuthV2 /></Lz>,
    children: [
      // troca de senha obrigatória: fora do shell (sem navegação); o guard força vir para cá.
      { path: 'alterar-senha', element: <Lz><AlterarSenhaV2 /></Lz> },
      // chat MOBILE (/m): fora do shell (sem sidebar/topbar); layout route mantém o inbox
      // montado (realtime + otimista sobrevivem à navegação lista ↔ conversa).
      {
        path: 'm',
        element: <Lz><MobileShell /></Lz>,
        children: [
          { index: true, element: <Lz><ListaConversasMobile /></Lz> },
          { path: ':conversaId', element: <Lz><ConversaMobile /></Lz> },
        ],
      },
      {
        // celular → SÓ o chat: o GateMobileApp intercepta TODAS as rotas de módulo
        // e manda pra /m (preservando ?conversa=); no desktop é pass-through.
        element: <Lz><GateMobileApp><AppShellV2 /></GateMobileApp></Lz>,
        children: [
          // Home: entra pelo WhatsApp (entrada do v1) — decisão de escopo do dono.
          { index: true, element: <Navigate to="/whatsapp" replace /> },
          // Visibilidade (22/10, pedido do dono): só o admin vê a carteira de todos — as telas de
          // GESTÃO (visão da equipe inteira) ficam só para ele: Dashboard, Relatórios, Recuperação,
          // Disparo e Cobranças. As de trabalho (inbox, Kanban, Contatos…) mostram só os clientes de cada um.
          { path: 'dashboard', element: <Lz><RequireRoleV2 role="admin"><DashboardV2 /></RequireRoleV2></Lz> },
          { path: 'whatsapp', element: <Lz><GateWhatsApp /></Lz> },
          { path: 'facebook', element: <Lz><ManutencaoV2 area="Facebook" /></Lz> },
          { path: 'relacionamento', element: <Lz><ManutencaoV2 area="Relacionamento" /></Lz> },
          { path: 'kanban', element: <Lz><KanbanV2 /></Lz> },
          // Pós-venda: acompanhamento dos clientes fechados (ganho) — pedido do dono 15/10.
          { path: 'pos-venda', element: <Lz><PosVendaV2 /></Lz> },
          // Remarketing fora do painel (aba removida a pedido do dono). Página Remarketing.tsx
          // preservada (não deletada), só fora do menu/rota — reversível. Link antigo cai no WhatsApp.
          { path: 'remarketing', element: <Navigate to="/whatsapp" replace /> },
          { path: 'agendamentos', element: <Lz><AgendamentosV2 /></Lz> },
          { path: 'recuperacao', element: <Lz><RequireRoleV2 role="admin"><RecuperacaoV2 /></RequireRoleV2></Lz> },
          { path: 'pendencias', element: <Lz><PendenciasV2 /></Lz> },
          { path: 'portabilidades', element: <Lz><PortabilidadesV2 /></Lz> },
          { path: 'manual', element: <Lz><ManualV2 /></Lz> },
          { path: 'disparo', element: <Lz><RequireRoleV2 role="admin"><DisparoV2 /></RequireRoleV2></Lz> },
          { path: 'contatos', element: <Lz><ContatosV2 /></Lz> },
          { path: 'scripts', element: <Lz><ScriptsV2 /></Lz> },
          { path: 'simulador', element: <Lz><SimuladorV2 /></Lz> },
          // Cobranças saiu do sistema (dono 22/10) — links antigos caem no inbox (o Dashboard
          // é só do admin desde a visibilidade de 22/10; o inbox todo mundo vê)
          { path: 'cobrancas', element: <Navigate to="/whatsapp" replace /> },
          { path: 'cobrancas/:secao', element: <Navigate to="/whatsapp" replace /> },
          { path: 'ferramentas', element: <Navigate to="/ferramentas/unificador" replace /> },
          { path: 'ferramentas/:tool', element: <Lz><FerramentasV2 /></Lz> },
          { path: 'relatorios', element: <Lz><RequireRoleV2 role="admin"><RelatoriosV2 /></RequireRoleV2></Lz> },
          { path: 'integracoes', element: <Lz><IntegracoesV2 /></Lz> },
          // Maturação DESCONTINUADA (Evolution restrito pela Meta): rota → placeholder "descontinuada".
          // Página Maturacao.tsx preservada (não deletada), só fora do menu/rota — reversível.
          { path: 'maturacao', element: <Lz><ManutencaoV2 area="Maturação" descontinuada /></Lz> },
          // Radar de Atendimento: nenhum cliente esquecido — risco ao vivo, punições e repasses (só admin)
          { path: 'radar', element: <Lz><RequireRoleV2 role="admin"><GuardiaoV2 /></RequireRoleV2></Lz> },
          { path: 'ia', element: <Lz><RequireRoleV2 role="admin"><IaV2 /></RequireRoleV2></Lz> },
          { path: 'fluxos', element: <Lz><RequireRoleV2 role="admin"><FluxosV2 /></RequireRoleV2></Lz> },
          { path: 'configuracoes', element: <Lz><ConfiguracoesV2 /></Lz> },
          { path: 'plano-uso', element: <Lz><RequireRoleV2 role="admin"><PlanoUsoV2 /></RequireRoleV2></Lz> },
          // Coexistência (Embedded Signup da Meta): rota escondida, sem link no menu.
          { path: 'coexistencia', element: <Lz><RequireRoleV2 role="admin"><CoexistenciaV2 /></RequireRoleV2></Lz> },
        ],
      },
    ],
  },

  // ============ v1 preservado em /v1/* (fallback técnico, sem link; nada deletado) ============
  {
    path: '/v1',
    children: [
      { path: 'login', element: <Lz><Login /></Lz> },
      { path: 'redefinir-senha', element: <Lz><RedefinirSenha /></Lz> },
      { path: 'definir-senha', element: <Lz><DefinirSenha /></Lz> },
      {
        element: <ProtectedRoute />,
        children: [
          { path: 'alterar-senha', element: <Lz><AlterarSenha /></Lz> },
          {
            // visibilidade (22/10): o v1 não tem o recorte por responsável — só o admin entra
            element: <Lz><SoAdminV1><AppShell /></SoAdminV1></Lz>,
            children: [
              { index: true, element: <Navigate to="/v1/whatsapp" replace /> },
              { path: 'whatsapp', handle: { title: 'WhatsApp', subtitle: 'Caixa de atendimento do WhatsApp.', fullBleed: true }, element: <Lz><WhatsApp /></Lz> },
              { path: 'facebook', handle: { title: 'Facebook', subtitle: 'Caixa de atendimento do Messenger e Facebook.', fullBleed: true }, element: <Lz><Facebook /></Lz> },
              { path: 'kanban', handle: { title: 'Kanban', subtitle: 'Funil comercial em colunas.', fullBleed: true }, element: <Lz><Kanban /></Lz> },
              { path: 'agendamentos', handle: { title: 'Agendamentos de Mensagens', subtitle: 'Acompanhe mensagens programadas, enviadas, falhas e canceladas.', fullBleed: true }, element: <Lz><AgendamentosMensagens /></Lz> },
              { path: 'relacionamento', handle: { title: 'Relacionamento', subtitle: 'Réguas leves de relacionamento e nutrição — ativadas manualmente por cliente.', fullBleed: true }, element: <Lz><Relacionamento /></Lz> },
              { path: 'scripts', handle: { title: 'Scripts', subtitle: 'Biblioteca de scripts e mídias.', fullBleed: true }, element: <Lz><Scripts /></Lz> },
              { path: 'cobrancas', element: <Navigate to="/whatsapp" replace /> },
              { path: 'integracoes', handle: { title: 'Integrações', subtitle: 'Conecte, configure e monitore os serviços externos utilizados pela sua operação.', fullBleed: true }, element: <Lz><Integracoes /></Lz> },
              { path: 'relatorios', handle: { title: 'Relatórios', subtitle: 'Desempenho do atendimento e das cobranças.', fullBleed: true }, element: <Lz><Relatorios /></Lz> },
              { path: 'configuracoes', handle: { title: 'Configurações', subtitle: 'Conta, equipe, notificações e canais já conectados.', fullBleed: true }, element: <Lz><Configuracoes /></Lz> },
              { path: 'maturacao', handle: { title: 'Maturação de Números', subtitle: 'Aquecimento de chips de WhatsApp — isolado do atendimento.' }, element: <Lz><RequireRole role="admin"><Maturacao /></RequireRole></Lz> },
              { path: 'plano-uso', handle: { title: 'Plano e uso', subtitle: 'Assinatura, consumo e contratação de adicionais da sua organização.' }, element: <Lz><RequireRole role="admin"><PlanoUso /></RequireRole></Lz> },
            ],
          },
        ],
      },
    ],
  },

  // Vitrine dos componentes (aprovação da tradução dark/light) — standalone, sem shell
  { path: '/v2/vitrine', element: <Lz><VitrineV2 /></Lz> },

  // compat de bookmarks do preview antigo
  { path: '/v2/*', element: <RedirDeV2 /> },

  // 404 — o mundo Platina é o oficial
  { path: '*', element: <Lz><NaoEncontradaV2 /></Lz> },
];

// Hash router quando aberto como arquivo local (file://); browser router quando hospedado.
const useHash = typeof window !== 'undefined' && window.location.protocol === 'file:';
const router = (useHash ? createHashRouter : createBrowserRouter)(routes);

export default function App() {
  return <RouterProvider router={router} />;
}
