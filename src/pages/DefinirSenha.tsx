import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, Navigate, Link } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/hooks/useToast';
import { useTheme } from '@/hooks/useTheme';
import { supabase } from '@/lib/supabase';
import './Login.css';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
type Fase = 'carregando' | 'senha' | 'pendente' | 'sucesso' | 'ja_ativo' | 'sem_sessao' | 'erro';

export interface EstadoConvite { sessao?: boolean; convite?: string | null; vinculo?: string | null; expirado?: boolean }

/** Decide a tela a partir do estado REAL do convite/vínculo (não de ?ativar=1 nem de tem_senha).
 *  Convidado que ainda não ativou -> SEMPRE o formulário de senha. Pura e testável. */
export function decidirFase(est: EstadoConvite | null | undefined): { fase: Fase; erro?: string } {
  if (!est || !est.sessao) return { fase: 'sem_sessao' };
  const convite = est.convite ?? null;
  const vinculo = est.vinculo ?? null;
  const expirado = Boolean(est.expirado);
  if (convite === 'cancelado') return { fase: 'erro', erro: 'Este convite foi cancelado. Fale com quem te convidou para receber um novo.' };
  if ((convite === 'expirado' || expirado) && vinculo !== 'ativo') return { fase: 'erro', erro: 'Este convite expirou. Peça um novo convite para concluir o acesso.' };
  if (vinculo === 'ativo' && convite !== 'pendente') return { fase: 'ja_ativo' };       // conta já ativada -> login
  if (convite === 'pendente' || vinculo === 'convidado') return { fase: 'senha' };       // convidado pendente -> formulário de senha
  return { fase: 'pendente' };                                                            // sessão válida, sem convite pendente claro
}

/** Fluxo de convite (Supabase Auth). Fonte da verdade = SESSÃO REAL do supabase-js + estado do
 *  convite/vínculo no banco (RPC convite_estado). NUNCA decide por ?ativar=1 nem por tem_senha
 *  (fantasma em usuários criados pelo convite). Regras: convidado que ainda não ativou SEMPRE vê o
 *  formulário de senha; senha salva nunca é pedida de novo; ao concluir, encerra a sessão e vai para
 *  /login. Suporta os formatos de link do Supabase (code, hash com access_token, invite, recovery) —
 *  o supabase-js estabelece a sessão a partir da URL. Sem senha/token/link em log. */
export function DefinirSenha() {
  const { updatePassword, mode } = useAuth();
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [senha, setSenha] = useState('');
  const [conf, setConf] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [senhaOk, setSenhaOk] = useState(false);
  const [fase, setFase] = useState<Fase>('carregando');

  // Descobre a fase inicial pela SESSÃO REAL + estado do convite (aguarda o supabase-js processar o
  // token da URL, em qualquer formato: code / hash access_token / invite / recovery).
  useEffect(() => {
    if (mode !== 'supabase' || !supabase) return;
    let vivo = true;
    (async () => {
      let session = null;
      for (let i = 0; i < 8 && vivo; i++) { // ~4s de janela (navegador in-app do WhatsApp é mais lento)
        const { data } = await supabase!.auth.getSession();
        session = data.session;
        if (session) break;
        await sleep(500);
      }
      if (!vivo) return;
      if (!session) {
        // Sem sessão: link consumido/expirado ou acesso direto. NUNCA "reabra o link" — se a conta já
        // existe, o caminho é o login normal.
        setFase('sem_sessao');
        return;
      }
      // Estado real do convite/vínculo deste usuário (independe do formato do link e de tem_senha).
      const { data: est, error } = await supabase!.rpc('convite_estado');
      if (!vivo) return;
      if (error) { setFase('senha'); return; } // falha ao consultar: há sessão de convite -> permite definir a senha
      const { fase: f, erro: e } = decidirFase({ sessao: true, ...(est as EstadoConvite) });
      if (e) setErro(e);
      setFase(f);
    })();
    return () => { vivo = false; };
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  if (mode === 'mock') return <Navigate to="/login" replace />;

  const transit = (m: string) => /autenticado|jwt|session|auth|network|fetch|timeout|429|502|503/i.test(m);

  // Ativação resiliente: garante a sessão real, confirma o usuário e chama convite_aceitar (retry 1x).
  async function ativar(): Promise<'ok' | 'ja_ativo' | 'expirado' | 'falha'> {
    let { data: { session } } = await supabase!.auth.getSession();
    if (!session) { const r = await supabase!.auth.refreshSession(); session = r.data.session; }
    await sleep(300);
    const { data: { user: u } } = await supabase!.auth.getUser();
    if (!u) return 'falha';
    let { error } = await supabase!.rpc('convite_aceitar');
    if (error && transit(error.message || '')) { await sleep(600); ({ error } = await supabase!.rpc('convite_aceitar')); }
    if (!error) return 'ok';
    const m = error.message || '';
    if (m.includes('convite_expirado')) return 'expirado';
    if (m.includes('convite_inexistente') || m.includes('vinculo_invalido')) return 'ja_ativo'; // já concluído/cancelado -> login
    return 'falha';
  }

  // Sucesso: mostra a confirmação, encerra a sessão do convite e vai para o login (entra com a nova senha).
  async function finalizar() {
    setFase('sucesso');
    toast('Senha definida. Seu acesso foi ativado.');
    await sleep(1500); // deixa a mensagem visível
    try { await supabase!.auth.signOut(); } catch { /* segue mesmo assim */ }
    navigate('/login', { replace: true });
  }

  async function concluirAtivacao() {
    if (busy) return;
    setBusy(true); setErro(null);
    const r = await ativar();
    setBusy(false);
    if (r === 'ok') { await finalizar(); return; }
    if (r === 'ja_ativo') { setFase('ja_ativo'); return; }
    if (r === 'expirado') { setErro('Este convite expirou ou não é mais válido.'); setFase('pendente'); return; }
    // senha já foi definida; a ativação falhou -> não pede senha de novo (#8)
    setErro('Sua senha foi definida, mas a ativação não foi concluída.'); setFase('pendente');
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setErro(null);
    if (!senhaOk) {
      if (senha.length < 6) { setErro('A senha deve ter ao menos 6 caracteres.'); return; }
      if (senha !== conf) { setErro('As senhas não coincidem.'); return; }
      setBusy(true);
      const { error } = await updatePassword(senha); // define a senha (uma única vez)
      if (error) {
        setBusy(false);
        setErro(/expired|invalid|token|otp|session/i.test(error) ? 'O link expirou ou já foi utilizado. Se você já definiu a senha, faça login.' : error);
        return;
      }
      setSenhaOk(true); setBusy(false);
    }
    // senha salva -> ativa (NUNCA pede senha de novo, NUNCA "reabra o link")
    await concluirAtivacao();
  }

  const bannerErro = (
    <div className={'banner' + (erro ? ' show banner--error' : '')} role="alert" aria-live="polite">
      <span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" /></svg></span>
      <span>{erro}</span>
    </div>
  );

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

          {fase === 'carregando' ? (
            <p className="subhead">Validando seu convite…</p>

          ) : fase === 'sucesso' ? (
            <p className="subhead">Senha definida. Seu acesso foi ativado. Levando você ao login…</p>

          ) : fase === 'ja_ativo' ? (
            <>
              <p className="subhead">Seu acesso já foi ativado. É só fazer login.</p>
              <div style={{ marginTop: 18 }}><Link className="btn" to="/login" style={{ display: 'inline-flex' }}>Ir para o login</Link></div>
            </>

          ) : fase === 'erro' ? (
            <>
              {bannerErro}
              <div style={{ marginTop: 18 }}><Link className="btn" to="/login" style={{ display: 'inline-flex' }}>Ir para o login</Link></div>
            </>

          ) : fase === 'sem_sessao' ? (
            <>
              <p className="subhead">Não há uma sessão de convite ativa aqui. Se você já definiu sua senha, faça login normalmente.</p>
              <div style={{ marginTop: 18 }}><Link className="btn" to="/login" style={{ display: 'inline-flex' }}>Ir para o login</Link></div>
            </>

          ) : fase === 'pendente' ? (
            <>
              <p className="subhead">{senhaOk ? 'Sua senha foi definida. Falta só concluir a ativação do seu acesso.' : 'Conclua a ativação do seu acesso.'}</p>
              {bannerErro}
              <button type="button" className="btn" disabled={busy} onClick={concluirAtivacao}>
                {busy ? <span className="spinner" aria-hidden="true" /> : <span>Concluir ativação</span>}
              </button>
              <div style={{ marginTop: 14, display: 'flex', gap: 16 }}>
                <button type="button" className="link" disabled={busy} onClick={concluirAtivacao}>Tentar novamente</button>
                <Link className="link" to="/login">Ir para o login</Link>
              </div>
            </>

          ) : (
            <>
              <p className="subhead">Defina sua senha para acessar sua organização.</p>
              <form onSubmit={onSubmit} noValidate>
                {bannerErro}
                <div className="field">
                  <label htmlFor="nova">Nova senha</label>
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
                  {busy ? <span className="spinner" aria-hidden="true" /> : <span>Definir senha e continuar</span>}
                </button>
              </form>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
