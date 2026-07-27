import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import '../fontes';
import '../tokens.css';
import '../base.css';
import '../components/componentes.css';
import './login.css';
import { CamposNovaSenha } from './CamposNovaSenha';
import { erroDeLinkUsado } from '../hooks/useAtivacaoConvite';

/**
 * Destino do link de recuperação (redirectTo do Supabase) — paridade total com
 * src/pages/RedefinirSenha.tsx: o supabase-js processa o token do hash de forma
 * assíncrona e dispara PASSWORD_RECOVERY (flag `recovery` do AuthContext); só
 * então updatePassword é permitido. O tratamento de token/hash é EXATAMENTE o
 * do v1 — nada foi "melhorado" aqui de propósito.
 */
export default function RedefinirSenhaV2() {
  const { user, loading, recovery, updatePassword, signOut, mode } = useAuth();
  const navigate = useNavigate();

  const [senha, setSenha] = useState('');
  const [conf, setConf] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [grace, setGrace] = useState(true); // janela até o supabase-js processar o token do hash

  // token presente na URL (hash) — indica que viemos de um link de recuperação válido.
  const hasTokenInUrl =
    typeof window !== 'undefined' && /access_token=|type=recovery|code=/.test(window.location.hash + window.location.search);

  useEffect(() => {
    const t = window.setTimeout(() => setGrace(false), 2000);
    return () => window.clearTimeout(t);
  }, []);

  // sem backend real não há recuperação
  if (mode === 'mock') return <Navigate to="/v2/login" replace />;

  // sessão de recuperação (ou já logado) habilita o formulário
  const podeDefinir = recovery || !!user;

  async function aoSalvar(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setErro(null);
    if (senha.length < 6) { setErro('A senha deve ter ao menos 6 caracteres.'); return; }
    if (senha !== conf) { setErro('As senhas não coincidem.'); return; }
    setBusy(true);
    const { error } = await updatePassword(senha);
    setBusy(false);
    if (error) {
      setErro(erroDeLinkUsado(error)
        ? 'O link expirou ou já foi utilizado. Solicite um novo na tela de login.'
        : error);
      return;
    }
    await signOut();
    navigate('/v2/login', { replace: true, state: { aviso: 'Senha redefinida. Entre com a nova senha.' } });
  }

  const aguardando = grace && !podeDefinir; // ainda processando o token
  const linkInvalido = !podeDefinir && !aguardando && !hasTokenInUrl && !loading;

  return (
    <div className="v2 tela-login">
      <div className="luz2" />
      <div className="grao" />
      <div className="lg-card vidro pg-entra">
        <div className="marca2">A</div>
        <div className="caps">Bem-vindo ao Atenvo</div>
        <h1 className="p-display">Defina uma nova senha.</h1>

        {aguardando ? (
          <div className="sub">Validando o link de recuperação…</div>
        ) : linkInvalido ? (
          <>
            <div className="lg-banner show erro" role="alert">
              Link de recuperação inválido ou expirado. Solicite um novo na tela de login.
            </div>
            <Link to="/v2/login" className="entrar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}>
              Voltar ao login
            </Link>
          </>
        ) : (
          <>
            <div className="sub">Escolha uma nova senha para sua conta.</div>
            <div className={erro ? 'lg-banner show erro' : 'lg-banner'} role="alert">{erro}</div>
            <form onSubmit={aoSalvar} noValidate>
              <CamposNovaSenha
                senha={senha}
                conf={conf}
                aoMudarSenha={(v) => { setSenha(v); setErro(null); }}
                aoMudarConf={(v) => { setConf(v); setErro(null); }}
                rotuloConf="Confirmar nova senha"
              />
              <button type="submit" className="entrar" disabled={busy}>
                {busy ? 'Salvando…' : 'Salvar nova senha'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
