import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import '../tokens.css';
import '../base.css';

/**
 * Porta v2 do ProtectedRoute (src/components/ProtectedRoute.tsx), com o MESMO
 * comportamento: carregando → tela neutra; sem sessão → login com retorno via
 * state.from; deveTrocarSenha bloqueia tudo. Únicas diferenças: o login é o
 * /v2/login, a troca obrigatória é a /v2/alterar-senha e o visual do
 * "carregando" é Platina.
 */
export default function RequireAuthV2() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div
        className="v2"
        style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', fontSize: 12.5, color: 'var(--txt-3)' }}
      >
        Carregando…
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  if (user.deveTrocarSenha && location.pathname !== '/alterar-senha') {
    return <Navigate to="/alterar-senha" replace />;
  }
  return <Outlet />;
}
