/* Topbar — obsidian (Fase 3.2). Lógica preservada: o título continua vindo do
 * handle da rota; OrgSwitcher, SlaBell e o sair fazem exatamente o que faziam.
 *
 * O que mudou de estrutura, por decisão do ATENVO-DESIGN.md §7:
 * - o subtítulo saiu (barra fixa de 48px; o texto de apoio volta dentro de cada
 *   tela quando ela migrar, se fizer falta);
 * - o alternador claro/escuro saiu — o app é sempre obsidian (ver useTheme);
 * - o avatar do usuário veio da sidebar para a direita da topbar (doc §7), com o
 *   mesmo destino de sempre: /configuracoes. */
import { useMatches, useNavigate } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { OrgSwitcher } from './OrgSwitcher';
import { SlaBell } from './SlaBell';
import { useAuth } from '@/context/AuthContext';
import { useOrg } from '@/context/OrgContext';
import '@/styles/shell.css';

interface RouteMeta { title?: string; subtitle?: string }

const ROLE_LABEL: Record<string, string> = { admin: 'Administrador', gestor: 'Gestor', atendente: 'Atendente' };

function initials(name: string) {
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] ?? '') + (p[1]?.[0] ?? '')).toUpperCase();
}

export function Topbar() {
  const matches = useMatches();
  const { signOut, user } = useAuth();
  const { currentOrg } = useOrg();
  const navigate = useNavigate();

  const meta = [...matches].reverse().map((m) => m.handle as RouteMeta | undefined).find((h) => h && h.title);
  const title = meta?.title ?? 'Atenvo';
  const name = (user?.name || '').trim() || 'Usuário';

  const onLogout = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  return (
    <header className="shx-top">
      <div className="shx-title">{title}</div>
      <div className="shx-right">
        <OrgSwitcher />
        <SlaBell />
        <button
          type="button"
          className="shx-avatar"
          title={name}
          aria-label={`${name} — ${ROLE_LABEL[currentOrg.role] ?? ''}. Abrir configurações`}
          onClick={() => navigate('/configuracoes')}
        >
          {initials(name)}
        </button>
        <button type="button" className="shx-iconbtn" title="Sair" aria-label="Sair" onClick={onLogout}>
          <LogOut size={16} strokeWidth={1.5} aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}
