import { lazy, Suspense } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { isDemoMode, isRevizaMode } from '@/lib/supabase';
import '../fontes';
import '../tokens.css';
import '../base.css';
import './login.css';
import { LogoAtenvo } from '../components/LogoAtenvo';
import { MolduraAcesso } from './MolduraAcesso';
import { DESTINO_PADRAO_V2 as INICIO } from '../destino';

/* ALFA: quem está logado vê a página não encontrada DENTRO da moldura (barra + topo), com o caminho
   de volta ao início do seu ambiente (crítica 12/11). Quem não está logado vê o cartão de acesso. */
const AppShellV2 = lazy(() => import('../shell/AppShellV2'));
const ALFA = isRevizaMode || isDemoMode;

/** 404 v2 — família visual do login (paridade com src/pages/NotFound.tsx). */
export default function NaoEncontrada() {
  const { user, loading } = useAuth();
  if (ALFA && loading) return <div className="v2 tela-login" aria-busy="true" />;
  if (ALFA && user && !user.deveTrocarSenha) {
    return (
      <Suspense fallback={<div className="v2 tela-login" aria-busy="true" />}>
        <AppShellV2 naoEncontrada />
      </Suspense>
    );
  }
  return (
    <MolduraAcesso>
      <div className="lg-card vidro pg-entra">
        <LogoAtenvo className="marca2" />
        <div className="caps">Reviza CRM</div>
        <h1 className="p-display">Página não encontrada.</h1>
        <div className="sub">O endereço acessado não existe ou foi movido.</div>
        <Link to={user ? INICIO : '/login'} className="entrar">
          {user ? 'Voltar ao início' : 'Ir para o login'}
        </Link>
      </div>
    </MolduraAcesso>
  );
}
