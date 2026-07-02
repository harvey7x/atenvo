import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';

export function ProtectedRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div className="center-screen">Carregando…</div>;
  }
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  // Troca de senha obrigatória: bloqueia TODO o app até a troca; só /alterar-senha é acessível.
  if (user.deveTrocarSenha && location.pathname !== '/alterar-senha') {
    return <Navigate to="/alterar-senha" replace />;
  }
  return <Outlet />;
}
