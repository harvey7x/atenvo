/* Login — primeira tela migrada para o Atenvo Obsidian (Fase 3.1, piloto).
 *
 * REGRA DE OURO: só o VISUAL mudou. Toda a lógica (validação, signIn, recuperação
 * de senha, redirecionamento pós-login, modo mock) está intacta e na mesma ordem.
 *
 * O que saiu do visual antigo, por decisão do ATENVO-DESIGN.md:
 * - o painel-hero com gradiente navy e a prévia decorativa de Kanban (gradiente
 *   decorativo e ilustração são anti-padrões da seção 9); o login vira um card
 *   único centrado sobre o canvas + orbs;
 * - o logo SVG com o verde antigo → wordmark provisório "atenvo" (seção 5);
 * - o alternador claro/escuro DESTA tela: a página agora é sempre obsidian
 *   (o alternador continua existindo dentro do app até o shell migrar). */
import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate, Navigate } from 'react-router-dom';
import { AlertTriangle, Eye, EyeOff, Lock } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/hooks/useToast';
import { AmbientOrbs, Button, Field, Input } from '@/components/ui';
import './Login.css';

interface LocState { from?: { pathname: string } }

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function Login() {
  const { user, loading, signIn, resetPassword, mode } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [eEmail, setEEmail] = useState<string | null>(null);
  const [ePass, setEPass] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [recuperando, setRecuperando] = useState(false);

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
    const { error, reason } = await signIn(ev, password);
    setBusy(false);
    if (error) {
      setBanner(
        reason === 'invalid' ? 'E-mail ou senha inválidos.'
        : reason === 'config' ? 'Servidor de autenticação não configurado. Avise o administrador.'
        : 'Não foi possível conectar ao servidor de autenticação. Tente novamente em instantes.',
      );
      return;
    }
    const to = (location.state as LocState | null)?.from?.pathname ?? '/';
    navigate(to, { replace: true });
  }

  async function onForgot() {
    if (recuperando) return;
    const ev = email.trim();
    if (!ev || !emailRe.test(ev)) {
      setEEmail('Informe seu e-mail para recuperar a senha.');
      return;
    }
    setRecuperando(true);
    const { error } = await resetPassword(ev);
    setRecuperando(false);
    // mensagem neutra (não revela se o e-mail existe) quando o envio é aceito
    if (error) toast(error, 'warn');
    else toast('Se este e-mail tiver cadastro, enviamos um link de recuperação.');
  }

  return (
    <main className="lgn">
      <AmbientOrbs />
      <div className="lgn__col">
        <div className="lgn__brand">atenvo</div>

        <section className="lgn__card">
          <h1 className="lgn__title">Acessar a plataforma</h1>
          <p className="lgn__sub">Entre com suas credenciais para continuar.</p>

          <form onSubmit={onSubmit} noValidate className="lgn__form">
            {banner && (
              <div className="lgn__banner" role="alert" aria-live="polite">
                <AlertTriangle size={16} strokeWidth={1.5} aria-hidden="true" />
                <span>{banner}</span>
              </div>
            )}

            <Field label="E-mail" error={eEmail ?? undefined}>
              <Input
                id="email" name="email" type="email" inputMode="email" autoComplete="username"
                placeholder="seu@email.com" aria-invalid={eEmail ? 'true' : undefined}
                value={email} onChange={(e) => { setEmail(e.target.value); setEEmail(null); }}
              />
            </Field>

            <Field label="Senha" error={ePass ?? undefined}>
              <span className="lgn__pw">
                <Input
                  id="password" name="password" type={showPw ? 'text' : 'password'} autoComplete="current-password"
                  placeholder="Sua senha" aria-invalid={ePass ? 'true' : undefined}
                  value={password} onChange={(e) => { setPassword(e.target.value); setEPass(null); }}
                />
                <button
                  type="button" className="lgn__pw-toggle"
                  aria-label={showPw ? 'Ocultar senha' : 'Mostrar senha'} aria-pressed={showPw}
                  onClick={() => setShowPw((s) => !s)}
                >
                  {showPw ? <EyeOff size={16} strokeWidth={1.5} /> : <Eye size={16} strokeWidth={1.5} />}
                </button>
              </span>
            </Field>

            <div className="lgn__row">
              <label className="lgn__check">
                <input type="checkbox" defaultChecked />
                Manter conectado
              </label>
              <button type="button" className="lgn__link" onClick={onForgot} disabled={recuperando}>
                {recuperando ? 'Enviando…' : 'Esqueci minha senha'}
              </button>
            </div>

            <Button type="submit" variant="primary" size="lg" loading={busy} style={{ width: '100%' }}>
              Entrar
            </Button>

            <div className="lgn__restricted">
              <Lock size={16} strokeWidth={1.5} aria-hidden="true" />
              Acesso restrito a colaboradores autorizados.
            </div>

            {mode === 'mock' && (
              <div className="lgn__mock">
                Modo de demonstração: sem backend, qualquer e-mail válido e senha (6+) entram.
                Configure <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_ANON_KEY</code> para usar o Supabase Auth real.
              </div>
            )}
          </form>
        </section>
      </div>
    </main>
  );
}
