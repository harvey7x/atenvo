import { useEffect, useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import '../fontes';
import '../tokens.css';
import '../base.css';
import '../components/componentes.css';
import './login.css';
import { LogoAtenvo } from '../components/LogoAtenvo';
import { MolduraAcesso } from './MolduraAcesso';
import { isRevizaMode } from '@/lib/supabase';

import { DESTINO_PADRAO_V2 as DESTINO_PADRAO } from '../destino';

interface LocState { from?: { pathname: string }; aviso?: string }

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Login de teste da DEMONSTRAÇÃO (modo mock): já vem preenchido para o visitante
// entrar em 1 clique. Em produção (Supabase real) nada disso aparece.
const DEMO_EMAIL = 'demo@alfagroup.com.br';
const DEMO_SENHA = 'demo1234';

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

  // demo: deixa o login de teste pronto para entrar em 1 clique (só no mock)
  useEffect(() => {
    if (mode === 'mock') {
      setEmail((e) => e || DEMO_EMAIL);
      setSenha((s) => s || DEMO_SENHA);
    }
  }, [mode]);

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
    if (!ev) { setEEmail(isRevizaMode ? 'Informe seu usuário.' : 'Informe seu e-mail.'); ok = false; }
    else if (!isRevizaMode && !emailRe.test(ev)) { setEEmail('E-mail inválido.'); ok = false; }
    if (!senha) { setESenha('Informe sua senha.'); ok = false; }
    else if (senha.length < (isRevizaMode ? 8 : 6)) { setESenha(`A senha deve ter ao menos ${isRevizaMode ? 8 : 6} caracteres.`); ok = false; }
    if (!ok) return;

    setBusy(true);
    // instância Reviza: login por USUÁRIO — vira o e-mail interno usuario@reviza.local
    const credencial = isRevizaMode && !ev.includes('@') ? `${ev.toLowerCase()}@reviza.local` : ev;
    const { error, reason } = await signIn(credencial, senha);
    setBusy(false);
    if (error) {
      setBanner({
        tom: 'erro',
        texto:
          reason === 'invalid' ? (isRevizaMode ? 'Usuário ou senha inválidos.' : 'E-mail ou senha inválidos.')
          : reason === 'config' ? 'Servidor de autenticação não configurado. Avise o administrador.'
          : 'Não foi possível conectar ao servidor de autenticação. Tente novamente em instantes.',
      });
      return;
    }
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
    <MolduraAcesso>
      <div className="lg-card vidro pg-entra">
        <LogoAtenvo className="marca2" />
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
            <label htmlFor="lg-email">{isRevizaMode ? 'Usuário' : 'E-mail'}</label>
            <input
              className="inp"
              id="lg-email"
              name="email"
              type={isRevizaMode ? 'text' : 'email'}
              inputMode={isRevizaMode ? 'text' : 'email'}
              autoComplete="username"
              placeholder={isRevizaMode ? 'Seu usuário' : 'voce@empresa.com.br'}
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
              {!isRevizaMode && <button type="button" onClick={aoEsquecer} disabled={recuperando}>
                {recuperando ? 'Enviando…' : 'Esqueci minha senha'}
              </button>}
            </div>
            <div className="controle">
              <input
                className="inp"
                id="lg-senha"
                name="password"
                type={verSenha ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="Sua senha"
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
            <svg className="entrar-seta" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12h14M13 6l6 6-6 6" /></svg>
          </button>
        </form>

        <div className="lg-pe">
          Conexão protegida · dados hospedados no Brasil<br />
          Problemas para acessar? Fale com o <b>administrador da sua conta</b>.
          {mode === 'mock' && (
            <>
              <br />
              <b>Demonstração</b> · login de teste já preenchido:<br />
              <code>{DEMO_EMAIL}</code> · senha <code>{DEMO_SENHA}</code> — é só clicar <b>Entrar</b>.
            </>
          )}
        </div>
      </div>
    </MolduraAcesso>
  );
}
