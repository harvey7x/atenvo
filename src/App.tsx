import { createBrowserRouter, createHashRouter, RouterProvider, Navigate, type RouteObject } from 'react-router-dom';
import { AppShell } from '@/components/AppShell';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { RequireRole } from '@/components/RequireRole';
import { Login } from '@/pages/Login';
import { RedefinirSenha } from '@/pages/RedefinirSenha';
import { DefinirSenha } from '@/pages/DefinirSenha';
import { WhatsApp } from '@/pages/WhatsApp';
import { Facebook } from '@/pages/Facebook';
import { Kanban } from '@/pages/Kanban';
import { Contatos } from '@/pages/Contatos';
import { Agendamentos } from '@/pages/Agendamentos';
import { Scripts } from '@/pages/Scripts';
import { Cobrancas } from '@/pages/Cobrancas';
import { Integracoes } from '@/pages/Integracoes';
import { Relatorios } from '@/pages/Relatorios';
import { Configuracoes } from '@/pages/Configuracoes';
import { PlanoUso } from '@/pages/PlanoUso';
import { NotFound } from '@/pages/NotFound';

const routes: RouteObject[] = [
  { path: '/login', element: <Login /> },
  { path: '/redefinir-senha', element: <RedefinirSenha /> },
  { path: '/definir-senha', element: <DefinirSenha /> },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: <Navigate to="/whatsapp" replace /> },
          {
            path: 'whatsapp',
            handle: { title: 'WhatsApp', subtitle: 'Caixa de atendimento do WhatsApp.', fullBleed: true },
            element: <WhatsApp />,
          },
          {
            path: 'facebook',
            handle: { title: 'Facebook', subtitle: 'Caixa de atendimento do Messenger e Facebook.', fullBleed: true },
            element: <Facebook />,
          },
          {
            path: 'kanban',
            handle: { title: 'Kanban', subtitle: 'Funil comercial em colunas.', fullBleed: true },
            element: <Kanban />,
          },
          {
            path: 'contatos',
            handle: { title: 'Contatos', subtitle: 'Base de contatos e leads.', fullBleed: true },
            element: <Contatos />,
          },
          {
            path: 'agendamentos',
            handle: { title: 'Agendamentos', subtitle: 'Organize os atendimentos presenciais da equipe.', fullBleed: true },
            element: <Agendamentos />,
          },
          {
            path: 'scripts',
            handle: { title: 'Scripts', subtitle: 'Biblioteca de scripts e mídias.', fullBleed: true },
            element: <Scripts />,
          },
          {
            path: 'cobrancas',
            handle: { title: 'Cobranças', subtitle: 'Cobranças que sua organização faz aos próprios clientes.', fullBleed: true },
            element: <Cobrancas />,
          },
          {
            path: 'integracoes',
            handle: { title: 'Integrações', subtitle: 'Conecte, configure e monitore os serviços externos utilizados pela sua operação.', fullBleed: true },
            element: <Integracoes />,
          },
          {
            path: 'relatorios',
            handle: { title: 'Relatórios', subtitle: 'Desempenho do atendimento e das cobranças.', fullBleed: true },
            element: <Relatorios />,
          },
          {
            path: 'configuracoes',
            handle: { title: 'Configurações', subtitle: 'Conta, equipe, notificações e canais já conectados.', fullBleed: true },
            element: <Configuracoes />,
          },
          {
            path: 'plano-uso',
            handle: { title: 'Plano e uso', subtitle: 'Assinatura, consumo e contratação de adicionais da sua organização.' },
            element: <RequireRole role="admin"><PlanoUso /></RequireRole>,
          },
        ],
      },
    ],
  },
  { path: '*', element: <NotFound /> },
];

// Hash router quando aberto como arquivo local (file://); browser router quando hospedado.
const useHash = typeof window !== 'undefined' && window.location.protocol === 'file:';
const router = (useHash ? createHashRouter : createBrowserRouter)(routes);

export default function App() {
  return <RouterProvider router={router} />;
}
