import { NavLink, useNavigate } from 'react-router-dom';
import { Logo } from './Logo';
import { Icon, type IconName } from './icons';
import { useTheme } from '@/hooks/useTheme';
import { useAuth } from '@/context/AuthContext';
import { useOrg } from '@/context/OrgContext';

interface NavEntry { to: string; label: string; icon: IconName; }

const MAIN: NavEntry[] = [
  { to: '/whatsapp', label: 'WhatsApp', icon: 'whatsapp' },
  { to: '/facebook', label: 'Facebook', icon: 'facebook' },
  { to: '/kanban', label: 'Kanban', icon: 'kanban' },
  { to: '/contatos', label: 'Contatos', icon: 'contatos' },
  { to: '/agendamentos', label: 'Agendamentos', icon: 'agendamentos' },
  { to: '/scripts', label: 'Scripts', icon: 'scripts' },
  { to: '/cobrancas', label: 'Cobranças', icon: 'cobrancas' },
  { to: '/integracoes', label: 'Integrações', icon: 'integracoes' },
  { to: '/relatorios', label: 'Relatórios', icon: 'relatorios' },
  { to: '/configuracoes', label: 'Configurações', icon: 'configuracoes' },
];
const ADMIN: NavEntry[] = [{ to: '/plano-uso', label: 'Plano e uso', icon: 'plano' }];

const ROLE_LABEL: Record<string, string> = { admin: 'Administrador', gestor: 'Gestor', atendente: 'Atendente' };

function initials(name: string) {
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] ?? '') + (p[1]?.[0] ?? '')).toUpperCase();
}

export function Sidebar() {
  const { theme, toggle } = useTheme();
  const { user } = useAuth();
  const { currentOrg } = useOrg();
  const navigate = useNavigate();
  const name = (user?.name || '').trim() || 'Usuário';

  return (
    <aside className="sidebar">
      <div className="brand">
        <Logo />
        <span className="brand-sub">Plataforma de Atendimento e Gestão</span>
      </div>

      <nav className="nav">
        {MAIN.map((e) => (
          <NavLink key={e.to} to={e.to} className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
            <Icon name={e.icon} />
            <span>{e.label}</span>
          </NavLink>
        ))}
        {currentOrg.role === 'admin' && (
          <>
            <div className="nav-group-label">Administração</div>
            {ADMIN.map((e) => (
              <NavLink key={e.to} to={e.to} className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
                <Icon name={e.icon} />
                <span>{e.label}</span>
              </NavLink>
            ))}
          </>
        )}
      </nav>

      <div className="side-foot">
        <div className="theme-row">
          <span className="lbl">Tema</span>
          <span className="ic"><Icon name="sun" /></span>
          <button
            className="tswitch"
            aria-label="Alternar tema"
            aria-pressed={theme === 'dark'}
            onClick={toggle}
          >
            <span className="knob" />
          </button>
          <span className="ic"><Icon name="moon" /></span>
        </div>
        <button className="user" onClick={() => navigate('/configuracoes')}>
          <span className="av lg" style={{ background: '#3f6f52' }}>{initials(name)}</span>
          <div className="meta">
            <div className="nm">{name}</div>
            <div className="role">{ROLE_LABEL[currentOrg.role]}</div>
          </div>
          <span className="chev"><Icon name="chevron-right" /></span>
        </button>
      </div>
    </aside>
  );
}
