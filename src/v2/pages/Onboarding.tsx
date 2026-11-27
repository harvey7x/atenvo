import { useMemo, useState } from 'react';
import { slugify } from '@/lib/slug';
import '../fontes';
import '../tokens.css';
import '../base.css';
import '../components/componentes.css';
import './login.css';
import { LogoAtenvo } from '../components/LogoAtenvo';
import { MolduraAcesso } from './MolduraAcesso';

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
    <MolduraAcesso>
      <div className="lg-card vidro pg-entra">
        <LogoAtenvo className="marca2" />
        <div className="caps">Bem-vindo ao Reviza CRM</div>
        <h1 className="p-display">Crie sua organização.</h1>
        <div className="sub">Para começar, informe o nome da empresa que você vai gerenciar.</div>

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
          <small className="lg-slug">
            Endereço: <code>{slug || 'empresa'}</code>
          </small>
        </div>

        <button type="button" className="entrar" disabled={!podeEnviar} onClick={() => void enviar()}>
          {busy ? 'Criando…' : 'Criar organização'}
        </button>
      </div>
    </MolduraAcesso>
  );
}
