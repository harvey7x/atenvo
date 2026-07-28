import { lazy, Suspense } from 'react';
import { createBrowserRouter, createHashRouter, RouterProvider, Navigate, type RouteObject } from 'react-router-dom';
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
import { NotFound } from '@/pages/NotFound';

// Redesign Platina (design-ref/CONTRATO.md): tudo carregado sob demanda.
const VitrineV2 = lazy(() => import('@/v2/pages/Vitrine'));
const AppShellV2 = lazy(() => import('@/v2/shell/AppShellV2'));
const EmConstrucaoV2 = lazy(() => import('@/v2/pages/EmConstrucao'));
const LoginV2 = lazy(() => import('@/v2/pages/Login'));
const NaoEncontradaV2 = lazy(() => import('@/v2/pages/NaoEncontrada'));
const ErroConfiguracaoV2 = lazy(() => import('@/v2/pages/ErroConfiguracao'));
const RequireAuthV2 = lazy(() => import('@/v2/guards/RequireAuthV2'));
const RequireRoleV2 = lazy(() => import('@/v2/guards/RequireRoleV2'));
const PlanoUsoV2 = lazy(() => import('@/v2/pages/PlanoUso'));
const CobrancasV2 = lazy(() => import('@/v2/pages/Cobrancas'));
const AgendamentosV2 = lazy(() => import('@/v2/pages/Agendamentos'));
const ScriptsV2 = lazy(() => import('@/v2/pages/Scripts'));
const ConfiguracoesV2 = lazy(() => import('@/v2/pages/Configuracoes'));
const MaturacaoV2 = lazy(() => import('@/v2/pages/Maturacao'));
const RedefinirSenhaV2 = lazy(() => import('@/v2/pages/RedefinirSenha'));
const DefinirSenhaV2 = lazy(() => import('@/v2/pages/DefinirSenha'));
const AlterarSenhaV2 = lazy(() => import('@/v2/pages/AlterarSenha'));

/** Rota v2 ainda não recriada: marcador de posição dentro do shell. */
function emConstrucao(slug: string, titulo: string, subtitulo: string): RouteObject {
  return {
    path: slug,
    element: (
      <Suspense fallback={null}>
        <EmConstrucaoV2 titulo={titulo} subtitulo={subtitulo} />
      </Suspense>
    ),
  };
}

const routes: RouteObject[] = [
  { path: '/login', element: <Login /> },
  { path: '/redefinir-senha', element: <RedefinirSenha /> },
  { path: '/definir-senha', element: <DefinirSenha /> },
  {
    element: <ProtectedRoute />,
    children: [
      // Troca de senha obrigatória: fora do AppShell (sem navegação) e o guard força vir para cá.
      { path: 'alterar-senha', element: <AlterarSenha /> },
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
            path: 'agendamentos',
            handle: { title: 'Agendamentos de Mensagens', subtitle: 'Acompanhe mensagens programadas, enviadas, falhas e canceladas.', fullBleed: true },
            element: <AgendamentosMensagens />,
          },
          {
            path: 'relacionamento',
            handle: { title: 'Relacionamento', subtitle: 'Réguas leves de relacionamento e nutrição — ativadas manualmente por cliente.', fullBleed: true },
            element: <Relacionamento />,
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
            path: 'maturacao',
            handle: { title: 'Maturação de Números', subtitle: 'Aquecimento de chips de WhatsApp — isolado do atendimento.' },
            element: <RequireRole role="admin"><Maturacao /></RequireRole>,
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
  // Redesign v2 só no dev local: a branch gera preview público no CF Pages e o
  // trabalho não deve vazar antes do corte final. /v2 = vitrine (aprovação);
  // /v2/<página> = shell v2 com as páginas recriadas (ou marcador de posição).
  ...(import.meta.env.DEV
    ? [
        {
          path: '/v2',
          children: [
            {
              index: true,
              element: (
                <Suspense fallback={null}>
                  <VitrineV2 />
                </Suspense>
              ),
            },
            {
              path: 'login',
              element: (
                <Suspense fallback={null}>
                  <LoginV2 />
                </Suspense>
              ),
            },
            {
              // públicas: fluxos por token (recuperação e convite), como no v1
              path: 'redefinir-senha',
              element: (
                <Suspense fallback={null}>
                  <RedefinirSenhaV2 />
                </Suspense>
              ),
            },
            {
              path: 'definir-senha',
              element: (
                <Suspense fallback={null}>
                  <DefinirSenhaV2 />
                </Suspense>
              ),
            },
            {
              // prévia para aprovação — no corte final, main.tsx troca ConfigError
              path: 'config-error',
              element: (
                <Suspense fallback={null}>
                  <ErroConfiguracaoV2 />
                </Suspense>
              ),
            },
            {
              // 404 do mundo v2 — no corte final vira o catch-all '*' do app
              path: '*',
              element: (
                <Suspense fallback={null}>
                  <NaoEncontradaV2 />
                </Suspense>
              ),
            },
            {
              // Guard de auth do mundo v2: sem sessão → /v2/login com retorno.
              element: (
                <Suspense fallback={null}>
                  <RequireAuthV2 />
                </Suspense>
              ),
              children: [
                {
                  // troca obrigatória: fora do shell (sem navegação), como no v1
                  path: 'alterar-senha',
                  element: (
                    <Suspense fallback={null}>
                      <AlterarSenhaV2 />
                    </Suspense>
                  ),
                },
                {
                  element: (
                    <Suspense fallback={null}>
                      <AppShellV2 />
                    </Suspense>
                  ),
                  children: [
                    emConstrucao('dashboard', 'Dashboard', 'Sua operação, em ordem.'),
                    emConstrucao('whatsapp', 'WhatsApp', 'Caixa de atendimento do WhatsApp.'),
                    emConstrucao('facebook', 'Facebook', 'Caixa de atendimento do Messenger e Facebook.'),
                    emConstrucao('kanban', 'Kanban', 'Funil comercial em colunas.'),
                    {
                      path: 'agendamentos',
                      element: (
                        <Suspense fallback={null}>
                          <AgendamentosV2 />
                        </Suspense>
                      ),
                    },
                    emConstrucao('contatos', 'Contatos', 'Todos os contatos da organização.'),
                    {
                      path: 'scripts',
                      element: (
                        <Suspense fallback={null}>
                          <ScriptsV2 />
                        </Suspense>
                      ),
                    },
                    {
                      path: 'cobrancas',
                      element: (
                        <Suspense fallback={null}>
                          <CobrancasV2 />
                        </Suspense>
                      ),
                    },
                    emConstrucao('relatorios', 'Relatórios', 'Desempenho do atendimento e das cobranças.'),
                    emConstrucao('integracoes', 'Integrações', 'Conexões do canal e serviços do sistema.'),
                    {
                      // paridade: admin-only por URL, não só no menu
                      path: 'maturacao',
                      element: (
                        <Suspense fallback={null}>
                          <RequireRoleV2 role="admin">
                            <MaturacaoV2 />
                          </RequireRoleV2>
                        </Suspense>
                      ),
                    },
                    {
                      path: 'configuracoes',
                      element: (
                        <Suspense fallback={null}>
                          <ConfiguracoesV2 />
                        </Suspense>
                      ),
                    },
                    {
                      path: 'plano-uso',
                      element: (
                        <Suspense fallback={null}>
                          <RequireRoleV2 role="admin">
                            <PlanoUsoV2 />
                          </RequireRoleV2>
                        </Suspense>
                      ),
                    },
                  ],
                },
              ],
            },
          ],
        } satisfies RouteObject,
      ]
    : []),
  { path: '*', element: <NotFound /> },
];

// Hash router quando aberto como arquivo local (file://); browser router quando hospedado.
const useHash = typeof window !== 'undefined' && window.location.protocol === 'file:';
const router = (useHash ? createHashRouter : createBrowserRouter)(routes);

export default function App() {
  return <RouterProvider router={router} />;
}
