import { useMemo, useState } from 'react';
import { slugify } from '@/lib/slug';
import '../fontes';
import '../tokens.css';
import '../base.css';
import '../components/componentes.css';
import './login.css';

/**
 * Onboarding v2 — paridade total com src/pages/Onboarding.tsx: usuário
 * autenticado sem organização informa o nome da empresa; slug seguro em
 * tempo real; provisionar_organizacao chega via prop (OrgProvider decide
 * quando renderizar e faz o redirect ao concluir).
 */
export default function OnboardingV2({ onProvision }: { onProvision: (nome: string) => Promise<void> }) {
  const [nome, setNome] = useState('');
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const slug = useMemo(() => slugify(nome), [nome]);
  const podeEnviar = nome.trim().length >= 2 && !busy;

  async function enviar() {
    if (!podeEnviar) return;
    setBusy(true);
    setErro(null);
    try {
      await onProvision(nome.trim());
      // sucesso: o pai troca o contexto e redireciona
    } catch (e) {
      setErro((e as Error).message || 'Não foi possível criar a organização.');
      setBusy(false);
    }
  }

  return (
    <div className="v2 tela-login">
      <div className="luz2" />
      <div className="grao" />
      <div className="lg-card vidro pg-entra">
        <div className="marca2">A</div>
        <div className="caps">Bem-vindo ao Atenvo</div>
        <h1>Crie sua organização.</h1>
        <div className="sub">Para começar, dê um nome à empresa que você vai gerenciar na Atenvo.</div>

        <div className={erro ? 'lg-banner show erro' : 'lg-banner'} role="alert">{erro}</div>

        <div className="campo">
          <label htmlFor="onb-nome">Nome da empresa</label>
          <input
            id="onb-nome"
            className="inp"
            type="text"
            autoFocus
            maxLength={80}
            placeholder="Ex.: Assessoria Silva"
            value={nome}
            onChange={(e) => { setNome(e.target.value); setErro(null); }}
            onKeyDown={(e) => { if (e.key === 'Enter') void enviar(); }}
          />
          <small style={{ display: 'block', fontSize: 11, color: 'var(--txt-3)', marginTop: 6 }}>
            Endereço: <code style={{ fontFamily: 'ui-monospace, monospace', fontSize: 10.5, background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.09)', borderRadius: 5, padding: '1px 5px' }}>{slug || 'empresa'}</code>
          </small>
        </div>

        <button type="button" className="entrar" disabled={!podeEnviar} onClick={() => void enviar()}>
          {busy ? 'Criando…' : 'Criar organização'}
        </button>
      </div>
    </div>
  );
}
