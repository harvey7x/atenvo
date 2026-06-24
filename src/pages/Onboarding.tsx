import { useMemo, useState } from 'react';
import { slugify } from '@/lib/slug';
import { Logo } from '@/components/Logo';
import './Onboarding.css';

/** Onboarding mínimo: usuário autenticado sem organização informa o nome da
 *  empresa; geramos um slug seguro e chamamos provisionar_organizacao (via prop).
 *  O redirecionamento para /whatsapp e a atualização do OrgContext são feitos pelo
 *  componente pai (OrgProvider) ao concluir. */
export function Onboarding({ onProvision }: { onProvision: (nome: string) => Promise<void> }) {
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
      // sucesso: o pai troca o contexto e leva para /whatsapp
    } catch (e) {
      setErro((e as Error).message || 'Não foi possível criar a organização.');
      setBusy(false);
    }
  }

  return (
    <div className="onb-screen">
      <div className="onb-card">
        <div className="onb-logo"><Logo /></div>
        <h1>Crie sua organização</h1>
        <p className="onb-sub">Para começar, dê um nome à empresa que você vai gerenciar na Atenvo.</p>

        <label className="onb-label" htmlFor="onb-nome">Nome da empresa</label>
        <input
          id="onb-nome"
          className="onb-input"
          type="text"
          autoFocus
          maxLength={80}
          placeholder="Ex.: Assessoria Silva"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') enviar(); }}
        />
        <div className="onb-slug">
          Endereço: <code>{slug}</code>
        </div>

        {erro && <div className="onb-erro" role="alert">{erro}</div>}

        <button className="onb-btn" disabled={!podeEnviar} onClick={enviar}>
          {busy ? 'Criando…' : 'Criar organização'}
        </button>
      </div>
    </div>
  );
}
