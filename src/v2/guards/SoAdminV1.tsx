import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useVisibilidade } from '@/lib/visibilidade';

/**
 * Visibilidade (22/10): o app antigo em /v1/* não tem o recorte por responsável (inbox com
 * "Todos", Kanban, Relatórios…). Quem não vê a carteira de todos volta para o inbox oficial.
 */
export default function SoAdminV1({ children }: { children: ReactNode }) {
  const { veTodos } = useVisibilidade();
  if (!veTodos) return <Navigate to="/whatsapp" replace />;
  return <>{children}</>;
}
