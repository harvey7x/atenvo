import { Suspense, type ReactNode } from 'react';
// lazy com auto-recarga: chunk que sumiu após deploy novo força 1 reload (recargaChunk.ts)
import { lazyComRecarga as lazy } from '@/lib/recargaChunk';
import { createBrowserRouter, createHashRouter, RouterProvider, Navigate, useParams, type RouteObject } from 'react-router-dom';
// v1 — preservado APENAS em /v1/* como fallback técnico (sem link na interface). Nada é deletado.
import { AppShell } from '@/components/AppShell';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { RequireRole } from '@/components/RequireRole';
import { Login } from '@/pages/Login';
import { RedefinirSenha } from '@/pages/RedefinirSenha';
import { AlterarSenha } from '@/pages/AlterarSenha';
import { DefinirSenha } from '@/pages/DefinirSenha';
import { WhatsApp } from '@/pages/WhatsApp';
import { Facebook } from '@/pages/Facebook';
import { Kanban } from '@/pages/Kanban';
// Presencial preservado no código (src/pages/Agendamentos.tsx), fora da navegação — a rota
// /agendamentos foi reaproveitada para a central de Agendamentos de Mensagens (Fase 2B).
import { AgendamentosMensagens } from '@/pages/AgendamentosMensagens';
import { Relacionamento } from '@/pages/Relacionamento';
import { Scripts } from '@/pages/Scripts';
import { Cobrancas } from '@/pages/Cobrancas';
import { Integracoes } from '@/pages/Integracoes';
import { Relatorios } from '@/pages/Relatorios';
import { Configuracoes } from '@/pages/Configuracoes';
import { PlanoUso } from '@/pages/PlanoUso';
import { Maturacao } from '@/pages/Maturacao';

// ===== Redesign Platina (design-ref/CONTRATO.md): AGORA as rotas OFICIAIS. Tudo sob demanda. =====
const AppShellV2 = lazy(() => import('@/v2/shell/AppShellV2'));
const LoginV2 = lazy(() => import('@/v2/pages/Login'));
const NaoEncontradaV2 = lazy(() => import('@/v2/pages/NaoEncontrada'));
const RequireAuthV2 = lazy(() => import('@/v2/guards/RequireAuthV2'));
const RequireRoleV2 = lazy(() => import('@/v2/guards/RequireRoleV2'));
const PlanoUsoV2 = lazy(() => import('@/v2/pages/PlanoUso'));
const CobrancasV2 = lazy(() => import('@/v2/pages/Cobrancas'));
const AgendamentosV2 = lazy(() => import('@/v2/pages/Agendamentos'));
const ScriptsV2 = lazy(() => import('@/v2/pages/Scripts'));
const SimuladorV2 = lazy(() => import('@/v2/pages/Simulador'));
const DashboardV2 = lazy(() => import('@/v2/pages/Dashboard'));
const ConfiguracoesV2 = lazy(() => import('@/v2/pages/Configuracoes'));
const ContatosV2 = lazy(() => import('@/v2/pages/Contatos'));
const DisparoV2 = lazy(() => import('@/v2/pages/Disparo'));
const RelatoriosV2 = lazy(() => import('@/v2/pages/Relatorios'));
const IntegracoesV2 = lazy(() => import('@/v2/pages/Integracoes'));
const KanbanV2 = lazy(() => import('@/v2/pages/Kanban'));
// /whatsapp passa por um gate de viewport: celular → chat mobile (/m); desktop → inbox intocado.
const GateWhatsApp = lazy(() => import('@/v2/mobile/GateWhatsApp'));
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
        element: <Lz><AppShellV2 /></Lz>,
        children: [
          // Home: entra pelo WhatsApp (entrada do v1) — decisão de escopo do dono.
          { index: true, element: <Navigate to="/whatsapp" replace /> },
          { path: 'dashboard', element: <Lz><DashboardV2 /></Lz> },
          { path: 'whatsapp', element: <Lz><GateWhatsApp /></Lz> },
          { path: 'facebook', element: <Lz><ManutencaoV2 area="Facebook" /></Lz> },
          { path: 'relacionamento', element: <Lz><ManutencaoV2 area="Relacionamento" /></Lz> },
          { path: 'kanban', element: <Lz><KanbanV2 /></Lz> },
          // Remarketing fora do painel (aba removida a pedido do dono). Página Remarketing.tsx
          // preservada (não deletada), só fora do menu/rota — reversível. Link antigo cai no WhatsApp.
          { path: 'remarketing', element: <Navigate to="/whatsapp" replace /> },
          { path: 'agendamentos', element: <Lz><AgendamentosV2 /></Lz> },
          { path: 'disparo', element: <Lz><DisparoV2 /></Lz> },
          { path: 'contatos', element: <Lz><ContatosV2 /></Lz> },
          { path: 'scripts', element: <Lz><ScriptsV2 /></Lz> },
          { path: 'simulador', element: <Lz><SimuladorV2 /></Lz> },
          { path: 'cobrancas', element: <Lz><CobrancasV2 /></Lz> },
          { path: 'relatorios', element: <Lz><RelatoriosV2 /></Lz> },
          { path: 'integracoes', element: <Lz><IntegracoesV2 /></Lz> },
          // Maturação DESCONTINUADA (Evolution restrito pela Meta): rota → placeholder "descontinuada".
          // Página Maturacao.tsx preservada (não deletada), só fora do menu/rota — reversível.
          { path: 'maturacao', element: <Lz><ManutencaoV2 area="Maturação" descontinuada /></Lz> },
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
      { path: 'login', element: <Login /> },
      { path: 'redefinir-senha', element: <RedefinirSenha /> },
      { path: 'definir-senha', element: <DefinirSenha /> },
      {
        element: <ProtectedRoute />,
        children: [
          { path: 'alterar-senha', element: <AlterarSenha /> },
          {
            element: <AppShell />,
            children: [
              { index: true, element: <Navigate to="/v1/whatsapp" replace /> },
              { path: 'whatsapp', handle: { title: 'WhatsApp', subtitle: 'Caixa de atendimento do WhatsApp.', fullBleed: true }, element: <WhatsApp /> },
              { path: 'facebook', handle: { title: 'Facebook', subtitle: 'Caixa de atendimento do Messenger e Facebook.', fullBleed: true }, element: <Facebook /> },
              { path: 'kanban', handle: { title: 'Kanban', subtitle: 'Funil comercial em colunas.', fullBleed: true }, element: <Kanban /> },
              { path: 'agendamentos', handle: { title: 'Agendamentos de Mensagens', subtitle: 'Acompanhe mensagens programadas, enviadas, falhas e canceladas.', fullBleed: true }, element: <AgendamentosMensagens /> },
              { path: 'relacionamento', handle: { title: 'Relacionamento', subtitle: 'Réguas leves de relacionamento e nutrição — ativadas manualmente por cliente.', fullBleed: true }, element: <Relacionamento /> },
              { path: 'scripts', handle: { title: 'Scripts', subtitle: 'Biblioteca de scripts e mídias.', fullBleed: true }, element: <Scripts /> },
              { path: 'cobrancas', handle: { title: 'Cobranças', subtitle: 'Cobranças que sua organização faz aos próprios clientes.', fullBleed: true }, element: <Cobrancas /> },
              { path: 'integracoes', handle: { title: 'Integrações', subtitle: 'Conecte, configure e monitore os serviços externos utilizados pela sua operação.', fullBleed: true }, element: <Integracoes /> },
              { path: 'relatorios', handle: { title: 'Relatórios', subtitle: 'Desempenho do atendimento e das cobranças.', fullBleed: true }, element: <Relatorios /> },
              { path: 'configuracoes', handle: { title: 'Configurações', subtitle: 'Conta, equipe, notificações e canais já conectados.', fullBleed: true }, element: <Configuracoes /> },
              { path: 'maturacao', handle: { title: 'Maturação de Números', subtitle: 'Aquecimento de chips de WhatsApp — isolado do atendimento.' }, element: <RequireRole role="admin"><Maturacao /></RequireRole> },
              { path: 'plano-uso', handle: { title: 'Plano e uso', subtitle: 'Assinatura, consumo e contratação de adicionais da sua organização.' }, element: <RequireRole role="admin"><PlanoUso /></RequireRole> },
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
