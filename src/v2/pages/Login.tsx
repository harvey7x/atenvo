import { useEffect, useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import '../fontes';
import '../tokens.css';
import '../base.css';
import '../components/componentes.css';
import './login.css';

import { DESTINO_PADRAO_V2 as DESTINO_PADRAO } from '../destino';
import { marcarIntroEntrada } from '../shell/intro';

interface LocState { from?: { pathname: string }; aviso?: string }

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Banner = { tom: 'erro' | 'aviso'; texto: string } | null;

/**
 * Login v2 — família visual do mockup (#login): cartão de vidro sobre a base
 * com luz própria. Lógica 100% do AuthContext (signIn/resetPassword/mode);
 * paridade com src/pages/Login.tsx (validações, erros por motivo, recuperação
 * pelo e-mail digitado, nota do modo demo).
 */
export default function LoginV2() {
  const { user, loading, signIn, resetPassword, mode } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [verSenha, setVerSenha] = useState(false);
  const [eEmail, setEEmail] = useState<string | null>(null);
  const [eSenha, setESenha] = useState<string | null>(null);
  // aviso vindo dos fluxos de senha (no v1 era toast; aqui chega por state) —
  // lido no mount E a cada navegação, para não depender de remontagem
  const avisoInicial = (location.state as LocState | null)?.aviso;
  const [banner, setBanner] = useState<Banner>(avisoInicial ? { tom: 'aviso', texto: avisoInicial } : null);
  useEffect(() => {
    const av = (location.state as LocState | null)?.aviso;
    if (av) setBanner({ tom: 'aviso', texto: av });
  }, [location.state]);
  const [busy, setBusy] = useState(false);
  const [recuperando, setRecuperando] = useState(false);

  if (!loading && user) {
    const to = (location.state as LocState | null)?.from?.pathname ?? DESTINO_PADRAO;
    return <Navigate to={to} replace />;
  }

  async function aoEntrar(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBanner(null); setEEmail(null); setESenha(null);
    let ok = true;
    const ev = email.trim();
    if (!ev) { setEEmail('Informe seu e-mail.'); ok = false; }
    else if (!emailRe.test(ev)) { setEEmail('E-mail inválido.'); ok = false; }
    if (!senha) { setESenha('Informe sua senha.'); ok = false; }
    else if (senha.length < 6) { setESenha('A senha deve ter ao menos 6 caracteres.'); ok = false; }
    if (!ok) return;

    setBusy(true);
    const { error, reason } = await signIn(ev, senha);
    setBusy(false);
    if (error) {
      setBanner({
        tom: 'erro',
        texto:
          reason === 'invalid' ? 'E-mail ou senha inválidos.'
          : reason === 'config' ? 'Servidor de autenticação não configurado. Avise o administrador.'
          : 'Não foi possível conectar ao servidor de autenticação. Tente novamente em instantes.',
      });
      return;
    }
    // ÚNICA origem da intro de entrada: o sucesso do signIn (nunca refresh/navegação)
    marcarIntroEntrada();
    const to = (location.state as LocState | null)?.from?.pathname ?? DESTINO_PADRAO;
    navigate(to, { replace: true });
  }

  async function aoEsquecer() {
    if (recuperando) return;
    setBanner(null);
    const ev = email.trim();
    if (!ev || !emailRe.test(ev)) {
      setEEmail('Informe seu e-mail para recuperar a senha.');
      return;
    }
    setRecuperando(true);
    const { error } = await resetPassword(ev);
    setRecuperando(false);
    // mensagem neutra (não revela se o e-mail existe) quando o envio é aceito
    if (error) setBanner({ tom: 'erro', texto: error });
    else setBanner({ tom: 'aviso', texto: 'Se este e-mail tiver cadastro, enviamos um link de recuperação.' });
  }

  return (
    <div className="v2 tela-login">
      <div className="luz2" />
      <div className="grao" />
      <div className="lg-card vidro pg-entra">
        <div className="marca2">A</div>
        <div className="caps">Bem-vindo ao Atenvo</div>
        <h1 className="p-display">Acesse sua operação.</h1>
        <div className="sub">Entre com suas credenciais para continuar.</div>

        {/* erro é assertivo (alert); aviso de recuperação é polido (status) */}
        <div
          className={banner ? `lg-banner show ${banner.tom}` : 'lg-banner'}
          role={banner?.tom === 'erro' ? 'alert' : 'status'}
        >
          {banner?.texto}
        </div>

        <form onSubmit={aoEntrar} noValidate>
          <div className={eEmail ? 'campo invalida' : 'campo'}>
            <label htmlFor="lg-email">E-mail</label>
            <input
              className="inp"
              id="lg-email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="username"
              placeholder="voce@empresa.com.br"
              value={email}
              aria-invalid={eEmail ? true : undefined}
              aria-describedby={eEmail ? 'lg-email-erro' : undefined}
              onChange={(e) => { setEmail(e.target.value); setEEmail(null); }}
            />
            {eEmail && <small className="hint" id="lg-email-erro">{eEmail}</small>}
          </div>

          <div className={eSenha ? 'campo invalida' : 'campo'}>
            <div className="lg-l">
              <label htmlFor="lg-senha">Senha</label>
              <button type="button" onClick={aoEsquecer} disabled={recuperando}>
                {recuperando ? 'Enviando…' : 'Esqueci minha senha'}
              </button>
            </div>
            <div className="controle">
              <input
                className="inp"
                id="lg-senha"
                name="password"
                type={verSenha ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="••••••••"
                value={senha}
                aria-invalid={eSenha ? true : undefined}
                aria-describedby={eSenha ? 'lg-senha-erro' : undefined}
                onChange={(e) => { setSenha(e.target.value); setESenha(null); }}
              />
              <button
                type="button"
                className="olho"
                aria-label={verSenha ? 'Ocultar senha' : 'Mostrar senha'}
                aria-pressed={verSenha}
                onClick={() => setVerSenha((s) => !s)}
              >
                {verSenha ? (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M10.7 6.2A9.8 9.8 0 0 1 12 5c6.5 0 10 7 10 7a16 16 0 0 1-3.2 3.9M6.1 7.1A16 16 0 0 0 2 12s3.5 7 10 7a9.8 9.8 0 0 0 4.3-1M3 3l18 18M9.9 9.9a3 3 0 0 0 4.2 4.2" /></svg>
                ) : (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></svg>
                )}
              </button>
            </div>
            {eSenha && <small className="hint" id="lg-senha-erro">{eSenha}</small>}
          </div>

          <button type="submit" className="entrar" disabled={busy}>
            {busy ? 'Entrando…' : 'Entrar'}
          </button>
        </form>

        <div className="lg-pe">
          Conexão protegida · dados hospedados no Brasil<br />
          Problemas para acessar? Fale com o <b>administrador da sua conta</b>.
          {mode === 'mock' && (
            <>
              <br />
              Modo de demonstração: sem backend, qualquer e-mail válido e senha (6+) entram.
              Configure <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_ANON_KEY</code> para
              usar o Supabase Auth real.
            </>
          )}
        </div>
      </div>
    </div>
  );
}
