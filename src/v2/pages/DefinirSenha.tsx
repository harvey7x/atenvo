import { useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import '../fontes';
import '../tokens.css';
import '../base.css';
import '../components/componentes.css';
import './login.css';
import { CamposNovaSenha } from './CamposNovaSenha';
import { useAtivacaoConvite } from '../hooks/useAtivacaoConvite';
import { BotaoSec } from '../components';

function BotaoIrParaLogin() {
  return (
    <Link to="/v2/login" className="entrar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}>
      Ir para o login
    </Link>
  );
}

/**
 * Fluxo de ativação por convite — paridade total com src/pages/DefinirSenha.tsx
 * via useAtivacaoConvite (7 fases decididas pela sessão real + convite_estado;
 * senha definida uma única vez; ativação com retomada; nunca "reabra o link").
 */
export default function DefinirSenhaV2() {
  const { mode } = useAuth();
  const { fase, erro, busy, senhaOk, definirEContinuar, concluirAtivacao, limparErro } =
    useAtivacaoConvite({ destinoLogin: '/v2/login' });

  const [senha, setSenha] = useState('');
  const [conf, setConf] = useState('');

  if (mode === 'mock') return <Navigate to="/v2/login" replace />;

  const bannerErro = <div className={erro ? 'lg-banner show erro' : 'lg-banner'} role="alert">{erro}</div>;

  return (
    <div className="v2 tela-login">
      <div className="luz2" />
      <div className="grao" />
      <div className="lg-card vidro pg-entra">
        <div className="marca2">A</div>
        <div className="caps">Bem-vindo ao Atenvo</div>
        <h1>Bem-vindo(a) à Atenvo.</h1>

        {fase === 'carregando' ? (
          <div className="sub">Validando seu convite…</div>

        ) : fase === 'sucesso' ? (
          <div className="lg-banner show aviso" role="status">
            Senha definida. Seu acesso foi ativado. Levando você ao login…
          </div>

        ) : fase === 'ja_ativo' ? (
          <>
            <div className="sub">Seu acesso já foi ativado. É só fazer login.</div>
            <BotaoIrParaLogin />
          </>

        ) : fase === 'erro' ? (
          <>
            {bannerErro}
            <BotaoIrParaLogin />
          </>

        ) : fase === 'sem_sessao' ? (
          <>
            <div className="sub">
              Não há uma sessão de convite ativa aqui. Se você já definiu sua senha, faça login normalmente.
            </div>
            <BotaoIrParaLogin />
          </>

        ) : fase === 'pendente' ? (
          <>
            <div className="sub">
              {senhaOk ? 'Sua senha foi definida. Falta só concluir a ativação do seu acesso.' : 'Conclua a ativação do seu acesso.'}
            </div>
            {bannerErro}
            <button type="button" className="entrar" disabled={busy} onClick={concluirAtivacao}>
              {busy ? 'Concluindo…' : 'Concluir ativação'}
            </button>
            <div style={{ marginTop: 12, display: 'flex', gap: 9, justifyContent: 'center' }}>
              <BotaoSec mini disabled={busy} onClick={concluirAtivacao}>Tentar novamente</BotaoSec>
              <Link to="/v2/login" style={{ alignSelf: 'center', fontSize: 11.5, color: 'var(--txt-2)', borderBottom: '1px solid rgba(255,255,255,.2)', textDecoration: 'none' }}>
                Ir para o login
              </Link>
            </div>
          </>

        ) : (
          <>
            <div className="sub">Defina sua senha para acessar sua organização.</div>
            {bannerErro}
            <form
              noValidate
              onSubmit={(e: FormEvent) => { e.preventDefault(); void definirEContinuar(senha, conf); }}
            >
              <CamposNovaSenha
                senha={senha}
                conf={conf}
                aoMudarSenha={(v) => { setSenha(v); limparErro(); }}
                aoMudarConf={(v) => { setConf(v); limparErro(); }}
                rotuloConf="Confirmar senha"
              />
              <button type="submit" className="entrar" disabled={busy}>
                {busy ? 'Definindo…' : 'Definir senha e continuar'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
