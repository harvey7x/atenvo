import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import '../fontes';
import '../tokens.css';
import '../base.css';
import '../components/componentes.css';
import './login.css';
import { CamposNovaSenha } from './CamposNovaSenha';
import { useTrocaSenhaObrigatoria } from '../hooks/useTrocaSenhaObrigatoria';
import { DESTINO_PADRAO_V2 } from '../destino';

/**
 * Troca de senha OBRIGATÓRIA (primeiro acesso com senha temporária) — paridade
 * total com src/pages/AlterarSenha.tsx via useTrocaSenhaObrigatoria. Fica fora
 * do shell (sem navegação); o RequireAuthV2 força vir para cá enquanto
 * user.deveTrocarSenha for true. Nunca recebe/mostra a senha temporária.
 */
export default function AlterarSenhaV2() {
  const { user, mode } = useAuth();
  const { erro, busy, senhaTrocada, salvar, limparErro } =
    useTrocaSenhaObrigatoria({ destino: DESTINO_PADRAO_V2 });

  const [senha, setSenha] = useState('');
  const [conf, setConf] = useState('');

  if (mode === 'mock') return <Navigate to="/v2/login" replace />;
  if (!user) return <Navigate to="/v2/login" replace />;
  // já não precisa trocar -> não fica preso aqui
  if (!user.deveTrocarSenha) return <Navigate to={DESTINO_PADRAO_V2} replace />;

  function aoEnviar(e: FormEvent) {
    e.preventDefault();
    void salvar(senha, conf);
  }

  return (
    <div className="v2 tela-login">
      <div className="luz2" />
      <div className="grao" />
      <div className="lg-card vidro pg-entra">
        <div className="marca2">A</div>
        <div className="caps">Bem-vindo ao Atenvo</div>
        <h1 className="p-display">Defina sua nova senha.</h1>
        <div className="sub">
          {senhaTrocada
            ? 'Sua senha foi alterada. Falta só liberar o acesso.'
            : 'Por segurança, troque a senha temporária antes de acessar o sistema.'}
        </div>

        <div className={erro ? 'lg-banner show erro' : 'lg-banner'} role="alert">{erro}</div>

        <form onSubmit={aoEnviar} noValidate>
          {senhaTrocada ? (
            <button type="submit" className="entrar" disabled={busy}>
              {busy ? 'Concluindo…' : 'Concluir'}
            </button>
          ) : (
            <>
              <CamposNovaSenha
                senha={senha}
                conf={conf}
                aoMudarSenha={(v) => { setSenha(v); limparErro(); }}
                aoMudarConf={(v) => { setConf(v); limparErro(); }}
                rotuloConf="Confirmar nova senha"
              />
              <button type="submit" className="entrar" disabled={busy}>
                {busy ? 'Salvando…' : 'Salvar nova senha'}
              </button>
            </>
          )}
        </form>
      </div>
    </div>
  );
}
