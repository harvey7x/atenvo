import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
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

const LS_KEY = 'atenvo.sidebar.expandida';
const NARROW = '(max-width:860px)';

function initials(name: string) {
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] ?? '') + (p[1]?.[0] ?? '')).toUpperCase();
}

/** Preferência do usuário (localStorage) — padrão: compacta. Em telas estreitas a
    preferência é ignorada e a barra fica sempre compacta (sem sobrescrever o valor salvo). */
function usePrefExpandida() {
  const [pref, setPref] = useState<boolean>(() => {
    try { return localStorage.getItem(LS_KEY) === '1'; } catch { return false; }
  });
  const [narrow, setNarrow] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.matchMedia(NARROW).matches : false);

  useEffect(() => {
    const mq = window.matchMedia(NARROW);
    const on = () => setNarrow(mq.matches);
    on(); // ressincroniza no mount (a largura pode ter mudado antes do listener existir)
    mq.addEventListener('change', on);
    // 'resize' é redundante na maioria dos casos, mas o evento 'change' da media query
    // não dispara em alguns cenários de viewport emulada — sem ele o botão sumia.
    window.addEventListener('resize', on);
    return () => { mq.removeEventListener('change', on); window.removeEventListener('resize', on); };
  }, []);

  const toggle = useCallback(() => {
    setPref((v) => {
      const n = !v;
      try { localStorage.setItem(LS_KEY, n ? '1' : '0'); } catch { /* ignora */ }
      return n;
    });
  }, []);

  return { expandida: pref && !narrow, narrow, toggle };
}

/** Tooltip do modo compacto: posicionado em `fixed` para não ser cortado
    pelo overflow da barra. Aparece no hover e no foco por teclado. */
interface TipState { label: string; top: number; left: number }

export function Sidebar() {
  const { theme, toggle: toggleTheme } = useTheme();
  const { user } = useAuth();
  const { currentOrg } = useOrg();
  const navigate = useNavigate();
  const { expandida, narrow, toggle } = usePrefExpandida();
  const compacta = !expandida;
  const name = (user?.name || '').trim() || 'Usuário';
  const asideRef = useRef<HTMLElement | null>(null);
  const [tip, setTip] = useState<TipState | null>(null);

  // classe no <body> para o restante do layout reagir à largura (mesmo padrão de body.wa-foco)
  useLayoutEffect(() => {
    document.body.classList.toggle('sb-expandida', expandida);
    return () => document.body.classList.remove('sb-expandida');
  }, [expandida]);

  const showTip = useCallback((label: string) => (ev: { currentTarget: HTMLElement }) => {
    if (!compacta) return;
    const r = ev.currentTarget.getBoundingClientRect();
    const side = asideRef.current?.getBoundingClientRect();
    setTip({ label, top: r.top + r.height / 2, left: (side ? side.right : r.right) + 8 });
  }, [compacta]);
  const hideTip = useCallback(() => setTip(null), []);
  useEffect(() => { if (!compacta) setTip(null); }, [compacta]);

  const item = (e: NavEntry) => (
    <NavLink
      key={e.to}
      to={e.to}
      className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}
      aria-label={e.label}
      title={compacta ? undefined : e.label}
      onMouseEnter={showTip(e.label)}
      onFocus={showTip(e.label)}
      onMouseLeave={hideTip}
      onBlur={hideTip}
    >
      <Icon name={e.icon} />
      <span className="nav-tx">{e.label}</span>
    </NavLink>
  );

  const labelTema = (t: string) => (t === 'dark' ? 'Mudar para tema claro' : 'Mudar para tema escuro');
  const temaLabel = labelTema(theme);
  // ao alternar o tema com o tooltip aberto, o texto precisa acompanhar o novo estado
  const onTema = () => {
    toggleTheme();
    setTip((t) => (t ? { ...t, label: labelTema(theme === 'dark' ? 'light' : 'dark') } : t));
  };

  return (
    <aside
      ref={asideRef}
      className={'sidebar' + (compacta ? ' compacta' : '')}
      aria-label="Navegação principal"
    >
      <div className="brand">
        <div className="brand-top">
          <Logo showText={!compacta} />
          {!narrow && (
            <button
              type="button"
              className="sb-toggle"
              aria-label={compacta ? 'Expandir menu lateral' : 'Recolher menu lateral'}
              aria-expanded={expandida}
              title={compacta ? 'Expandir menu' : 'Recolher menu'}
              onClick={toggle}
            >
              <Icon name="chevron-right" />
            </button>
          )}
        </div>
        {!compacta && <span className="brand-sub">Plataforma de Atendimento e Gestão</span>}
      </div>

      <nav className="nav">
        {MAIN.map(item)}
        {currentOrg.role === 'admin' && (
          <>
            {compacta ? <div className="nav-sep" role="separator" /> : <div className="nav-group-label">Administração</div>}
            {ADMIN.map(item)}
          </>
        )}
      </nav>

      <div className="side-foot">
        {compacta ? (
          <button
            type="button"
            className="foot-ic"
            aria-label={temaLabel}
            onClick={onTema}
            onMouseEnter={showTip(temaLabel)}
            onFocus={showTip(temaLabel)}
            onMouseLeave={hideTip}
            onBlur={hideTip}
          >
            <Icon name={theme === 'dark' ? 'moon' : 'sun'} />
          </button>
        ) : (
          <div className="theme-row">
            <span className="lbl">Tema</span>
            <span className="ic"><Icon name="sun" /></span>
            <button
              className="tswitch"
              aria-label="Alternar tema"
              aria-pressed={theme === 'dark'}
              onClick={toggleTheme}
            >
              <span className="knob" />
            </button>
            <span className="ic"><Icon name="moon" /></span>
          </div>
        )}

        <button
          className="user"
          onClick={() => navigate('/configuracoes')}
          aria-label={`${name} — ${ROLE_LABEL[currentOrg.role] ?? ''}. Abrir configurações`}
          onMouseEnter={showTip(name)}
          onFocus={showTip(name)}
          onMouseLeave={hideTip}
          onBlur={hideTip}
        >
          <span className="av lg" style={{ background: '#3f6f52' }}>{initials(name)}</span>
          <div className="meta">
            <div className="nm">{name}</div>
            <div className="role">{ROLE_LABEL[currentOrg.role]}</div>
          </div>
          <span className="chev"><Icon name="chevron-right" /></span>
        </button>
      </div>

      {tip && (
        <div className="sb-tip" role="tooltip" style={{ top: tip.top, left: tip.left }}>
          {tip.label}
        </div>
      )}
    </aside>
  );
}
