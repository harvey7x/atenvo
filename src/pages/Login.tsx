import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/hooks/useTheme';
import './Login.css';

interface LocState { from?: { pathname: string } }

/* Prévia decorativa do Kanban (idêntica ao protótipo 01_login) */
const COLS: { name: string; count: number; cards: [string | null, number][] }[] = [
  { name: 'Novos leads', count: 32, cards: [['#19c37d', 2], ['#19c37d', 1], [null, 2]] },
  { name: 'Em atendimento', count: 18, cards: [['#19c37d', 2], ['#f0a33d', 1], ['#19c37d', 2]] },
  { name: 'Proposta', count: 7, cards: [['#f0a33d', 2], ['#19c37d', 1], ['#f0a33d', 2]] },
  { name: 'Fechados', count: 12, cards: [['#19c37d', 2], ['#3b82f6', 1], ['#19c37d', 2]] },
];
const W = ['74%', '52%', '64%', '46%'];
const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function Login() {
  const { user, loading, signIn, mode } = useAuth();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('henrique@demo.atenvo.local');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [eEmail, setEEmail] = useState<string | null>(null);
  const [ePass, setEPass] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!loading && user) {
    const to = (location.state as LocState | null)?.from?.pathname ?? '/';
    return <Navigate to={to} replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBanner(null); setEEmail(null); setEPass(null);
    let ok = true;
    const ev = email.trim();
    if (!ev) { setEEmail('Informe seu e-mail.'); ok = false; }
    else if (!emailRe.test(ev)) { setEEmail('E-mail inválido.'); ok = false; }
    if (!password) { setEPass('Informe sua senha.'); ok = false; }
    else if (password.length < 6) { setEPass('A senha deve ter ao menos 6 caracteres.'); ok = false; }
    if (!ok) return;

    setBusy(true);
    const { error } = await signIn(ev, password);
    setBusy(false);
    if (error) { setBanner('E-mail ou senha incorretos. Verifique e tente novamente.'); return; }
    const to = (location.state as LocState | null)?.from?.pathname ?? '/';
    navigate(to, { replace: true });
  }

  return (
    <main className="login-page">
      {/* ESQUERDA — marca */}
      <section className="brand-panel">
        <div className="bg-lines" aria-hidden="true">
          <svg viewBox="0 0 600 820" preserveAspectRatio="xMidYMid slice" fill="none">
            <path d="M-40 120 C 200 50, 440 150, 720 60" stroke="rgba(255,255,255,.045)" strokeWidth="1.3" />
            <path d="M-40 188 C 220 128, 450 218, 720 140" stroke="rgba(255,255,255,.028)" strokeWidth="1.1" />
            <path d="M-30 706 C 150 770, 380 706, 680 520" stroke="rgba(25,195,125,.55)" strokeWidth="1.6" />
            <path d="M-30 770 C 180 812, 430 778, 700 648" stroke="rgba(25,195,125,.22)" strokeWidth="1.3" />
          </svg>
        </div>

        <div className="logo">
          <svg className="mark" viewBox="0 0 40 40" fill="none" role="img" aria-label="Atenvo">
            <circle cx="17" cy="21" r="12.8" fill="none" stroke="#19c37d" strokeWidth="3.7" strokeLinecap="round" strokeDasharray="72 9" transform="rotate(-52 17 21)" />
            <polygon points="30.5,4 32.3,9.2 37.5,11 32.3,12.8 30.5,18 28.7,12.8 23.5,11 28.7,9.2" fill="#19c37d" />
          </svg>
          <span className="logo-text">Atenvo</span>
        </div>

        <div className="brand-copy">
          <h1 className="hero-title">Atendimento, CRM<br />e funil <span className="accent">em um só lugar.</span></h1>
          <p className="hero-sub">Centralize conversas, leads e acompanhamento para <span className="em">vender mais</span> e <span className="em">atender melhor.</span></p>
        </div>

        <div className="kanban-row" aria-hidden="true">
          <div className="kanban">
            <div className="kanban-side">
              <svg className="kanban-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="8" /></svg>
              <svg className="kanban-ic active" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a8 8 0 0 1-11.5 7.2L4 21l1.8-5.5A8 8 0 1 1 21 12z" /></svg>
              <svg className="kanban-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="8" r="3" /><path d="M3 20a6 6 0 0 1 12 0M17 11a3 3 0 0 0 0-6M21 20a6 6 0 0 0-4-5.6" /></svg>
              <svg className="kanban-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 5h18l-7 8v6l-4-2v-4z" /></svg>
              <svg className="kanban-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19V5M4 15l4-4 4 3 8-8M20 9V5h-4" /></svg>
              <svg className="kanban-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 13a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V20a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 6.6 18l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 4 12.6H4a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 6 6.6l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 11 4.6V4a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8z" /></svg>
            </div>
            <div className="kanban-board">
              {COLS.map((col, ci) => (
                <div className="pv-col" key={ci}>
                  <div className="pv-col-head">
                    <span className="pv-col-title">{col.name}</span>
                    <span className="pv-count">{col.count}</span>
                  </div>
                  {col.cards.map((cd, ri) => (
                    <div className="pv-card" key={ri}>
                      <div className="pv-av" />
                      <div className="pv-lines">
                        {Array.from({ length: cd[1] + 1 }).map((_, k) => (
                          <div className="pv-l" key={k} style={{ width: W[(ci + ri + k) % W.length] }} />
                        ))}
                      </div>
                      {cd[0] && <div className="pv-dot" style={{ background: cd[0] }} />}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* DIREITA — auth */}
      <section className="auth-panel">
        <div className="theme-toggle">
          <div className="pill" role="group" aria-label="Tema">
            <button type="button" className={'tp-btn' + (theme === 'light' ? ' on' : '')} aria-label="Tema claro" aria-pressed={theme === 'light'} onClick={() => setTheme('light')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
            </button>
            <button type="button" className={'tp-btn' + (theme === 'dark' ? ' on' : '')} aria-label="Tema escuro" aria-pressed={theme === 'dark'} onClick={() => setTheme('dark')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>
            </button>
          </div>
        </div>

        <div className="auth-content">
          <h2 className="heading">Acessar a plataforma</h2>
          <p className="subhead">Entre com suas credenciais para continuar.</p>

          <form onSubmit={onSubmit} noValidate>
            <div className={'banner' + (banner ? ' show banner--error' : '')} role="alert" aria-live="polite">
              <span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" /></svg></span>
              <span>{banner}</span>
            </div>

            <div className={'field' + (eEmail ? ' is-invalid' : '')}>
              <label htmlFor="email">E-mail</label>
              <div className="control has-icon">
                <span className="icon-left" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg></span>
                <input className="input" id="email" name="email" type="email" inputMode="email" autoComplete="username" placeholder="seu@email.com"
                  value={email} onChange={(e) => { setEmail(e.target.value); setEEmail(null); }} />
              </div>
              <small className="hint">{eEmail}</small>
            </div>

            <div className={'field' + (ePass ? ' is-invalid' : '')}>
              <label htmlFor="password">Senha</label>
              <div className="control has-icon has-trailing">
                <span className="icon-left" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="11" width="16" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg></span>
                <input className="input" id="password" name="password" type={showPw ? 'text' : 'password'} autoComplete="current-password" placeholder="••••••••"
                  value={password} onChange={(e) => { setPassword(e.target.value); setEPass(null); }} />
                <button type="button" className="pw-toggle" aria-label={showPw ? 'Ocultar senha' : 'Mostrar senha'} aria-pressed={showPw} onClick={() => setShowPw((s) => !s)}>
                  {showPw ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.7 6.2A9.8 9.8 0 0 1 12 5c6.5 0 10 7 10 7a16 16 0 0 1-3.2 3.9M6.1 7.1A16 16 0 0 0 2 12s3.5 7 10 7a9.8 9.8 0 0 0 4.3-1M3 3l18 18M9.9 9.9a3 3 0 0 0 4.2 4.2" /></svg>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></svg>
                  )}
                </button>
              </div>
              <small className="hint">{ePass}</small>
            </div>

            <div className="row-between">
              <label className="check"><input type="checkbox" defaultChecked />Manter conectado</label>
              <button type="button" className="link" onClick={(e) => e.preventDefault()}>Esqueci minha senha</button>
            </div>

            <button type="submit" className="btn" disabled={busy}>
              {busy ? <span className="spinner" aria-hidden="true" /> : <span>Entrar</span>}
            </button>

            <div className="restricted">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="11" width="16" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
              Acesso restrito a colaboradores autorizados.
            </div>

            {mode === 'mock' && (
              <div className="mock-note">
                Modo de demonstração: sem backend, qualquer e-mail válido e senha (6+) entram.
                Configure <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_ANON_KEY</code> para usar o Supabase Auth real.
              </div>
            )}
          </form>
        </div>
      </section>
    </main>
  );
}
