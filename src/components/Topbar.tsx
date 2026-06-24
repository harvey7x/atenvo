import { useMatches, useNavigate } from 'react-router-dom';
import { Icon } from './icons';
import { OrgSwitcher } from './OrgSwitcher';
import { useTheme } from '@/hooks/useTheme';
import { useAuth } from '@/context/AuthContext';

interface RouteMeta { title?: string; subtitle?: string }

export function Topbar() {
  const matches = useMatches();
  const { theme, setTheme } = useTheme();
  const { signOut } = useAuth();
  const navigate = useNavigate();

  const meta = [...matches].reverse().map((m) => m.handle as RouteMeta | undefined).find((h) => h && h.title);
  const title = meta?.title ?? 'Atenvo';
  const subtitle = meta?.subtitle;

  const onLogout = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  return (
    <div className="topbar">
      <div>
        <div className="page-title">{title}</div>
        {subtitle && <div className="page-sub">{subtitle}</div>}
      </div>
      <div className="utils">
        <OrgSwitcher />
        <span className="util-pill">
          <button className={theme === 'light' ? 'on' : ''} aria-label="Tema claro" onClick={() => setTheme('light')}><Icon name="sun" /></button>
          <button className={theme === 'dark' ? 'on' : ''} aria-label="Tema escuro" onClick={() => setTheme('dark')}><Icon name="moon" /></button>
        </span>
        <button className="icon-btn" title="Notificações"><Icon name="bell" /></button>
        <button className="icon-btn" title="Sair" onClick={onLogout}><Icon name="logout" /></button>
      </div>
    </div>
  );
}
