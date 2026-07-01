import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, Navigate, Link } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/hooks/useToast';
import { useTheme } from '@/hooks/useTheme';
import { supabase } from '@/lib/supabase';
import './Login.css';

/** Destino do link de convite (Supabase Auth). O supabase-js processa o token do hash,
 *  estabelece a sessão do convidado; o usuário define a senha e o vínculo é ativado
 *  por `convite_aceitar()`. Sem token manual, sem senha provisória. */
export function DefinirSenha() {
  const { user, loading, recovery, updatePassword, mode } = useAuth();
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [senha, setSenha] = useState('');
  const [conf, setConf] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [grace, setGrace] = useState(true);

  const hasTokenInUrl = typeof window !== 'undefined' && /access_token=|type=invite|type=recovery|type=magiclink|code=/.test(window.location.hash + window.location.search);

  useEffect(() => { const t = window.setTimeout(() => setGrace(false), 2500); return () => window.clearTimeout(t); }, []);

  if (mode === 'mock') return <Navigate to="/login" replace />;

  const podeDefinir = recovery || !!user;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setErro(null);
    if (senha.length < 6) { setErro('A senha deve ter ao menos 6 caracteres.'); return; }
    if (senha !== conf) { setErro('As senhas não coincidem.'); return; }
    setBusy(true);
    // 1) define a senha da própria conta
    const { error } = await updatePassword(senha);
    if (error) {
      setBusy(false);
      setErro(/expired|invalid|token|otp|session/i.test(error)
        ? 'O link expirou ou já foi utilizado. Solicite um novo convite ao administrador.'
        : error);
      return;
    }
    // 2) ativa o vínculo com a organização e marca o convite como aceito
    const { data, error: e2 } = await supabase!.rpc('convite_aceitar');
    setBusy(false);
    if (e2) {
      const m = e2.message || '';
      setErro(m.includes('convite_expirado') ? 'Seu convite expirou. Solicite um novo ao administrador.'
        : m.includes('convite_inexistente') ? 'Convite não encontrado ou já utilizado/cancelado. Fale com o administrador.'
        : m.includes('limite_plano') ? 'A organização atingiu o limite de usuários. Fale com o administrador.'
        : 'Senha definida, mas não foi possível ativar o acesso. Fale com o administrador.');
      return;
    }
    toast('Bem-vindo(a)! Sua conta está ativa.');
    navigate('/', { replace: true });
    void data;
  }

  const aguardando = grace && !podeDefinir;
  const linkInvalido = !podeDefinir && !aguardando && !hasTokenInUrl && !loading;

  return (
    <main className="login-page" style={{ gridTemplateColumns: '1fr' }}>
      <section className="auth-panel">
        <div className="theme-toggle">
          <div className="pill">
            <button type="button" className={'tp-btn' + (theme === 'light' ? ' on' : '')} aria-label="Tema claro" aria-pressed={theme === 'light'} onClick={() => setTheme('light')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
            </button>
            <button type="button" className={'tp-btn' + (theme === 'dark' ? ' on' : '')} aria-label="Tema escuro" aria-pressed={theme === 'dark'} onClick={() => setTheme('dark')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>
            </button>
          </div>
        </div>

        <div className="auth-content">
          <h2 className="heading">Bem-vindo(a) à Atenvo</h2>

          {aguardando ? (
            <p className="subhead">Validando seu convite…</p>
          ) : linkInvalido ? (
            <>
              <p className="subhead">Convite inválido ou expirado.</p>
              <div style={{ marginTop: 18 }}><Link className="link" to="/login">Ir para o login</Link></div>
            </>
          ) : (
            <>
              <p className="subhead">Defina sua senha para acessar sua organização.</p>
              <form onSubmit={onSubmit} noValidate>
                <div className={'banner' + (erro ? ' show banner--error' : '')} role="alert" aria-live="polite">
                  <span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" /></svg></span>
                  <span>{erro}</span>
                </div>

                <div className="field">
                  <label htmlFor="nova">Senha</label>
                  <div className="control has-icon has-trailing">
                    <span className="icon-left" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="11" width="16" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg></span>
                    <input className="input" id="nova" name="nova" type={showPw ? 'text' : 'password'} autoComplete="new-password" placeholder="••••••••"
                      value={senha} onChange={(e) => { setSenha(e.target.value); setErro(null); }} />
                    <button type="button" className="pw-toggle" aria-label={showPw ? 'Ocultar senha' : 'Mostrar senha'} aria-pressed={showPw} onClick={() => setShowPw((s) => !s)}>
                      {showPw ? (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.7 6.2A9.8 9.8 0 0 1 12 5c6.5 0 10 7 10 7a16 16 0 0 1-3.2 3.9M6.1 7.1A16 16 0 0 0 2 12s3.5 7 10 7a9.8 9.8 0 0 0 4.3-1M3 3l18 18M9.9 9.9a3 3 0 0 0 4.2 4.2" /></svg>
                      ) : (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></svg>
                      )}
                    </button>
                  </div>
                </div>

                <div className="field">
                  <label htmlFor="conf">Confirmar senha</label>
                  <div className="control has-icon">
                    <span className="icon-left" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="11" width="16" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg></span>
                    <input className="input" id="conf" name="conf" type={showPw ? 'text' : 'password'} autoComplete="new-password" placeholder="••••••••"
                      value={conf} onChange={(e) => { setConf(e.target.value); setErro(null); }} />
                  </div>
                </div>

                <button type="submit" className="btn" disabled={busy}>
                  {busy ? <span className="spinner" aria-hidden="true" /> : <span>Definir senha e entrar</span>}
                </button>
              </form>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
