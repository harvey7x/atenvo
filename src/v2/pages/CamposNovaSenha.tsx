import { useState } from 'react';

/* Par de campos nova/confirmar com o olho que afeta OS DOIS (como no v1),
   na família visual do login. Usado por Redefinir, Definir e Alterar. */
export function CamposNovaSenha({ senha, conf, aoMudarSenha, aoMudarConf, rotuloConf }: {
  senha: string;
  conf: string;
  aoMudarSenha: (v: string) => void;
  aoMudarConf: (v: string) => void;
  rotuloConf: string;
}) {
  const [ver, setVer] = useState(false);
  const tipo = ver ? 'text' : 'password';
  return (
    <>
      <div className="campo">
        <label htmlFor="ns-nova">Nova senha</label>
        <div className="controle">
          <input
            className="inp"
            id="ns-nova"
            name="nova"
            type={tipo}
            autoComplete="new-password"
            placeholder="••••••••"
            value={senha}
            onChange={(e) => aoMudarSenha(e.target.value)}
          />
          <button
            type="button"
            className="olho"
            aria-label={ver ? 'Ocultar senha' : 'Mostrar senha'}
            aria-pressed={ver}
            onClick={() => setVer((s) => !s)}
          >
            {ver ? (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M10.7 6.2A9.8 9.8 0 0 1 12 5c6.5 0 10 7 10 7a16 16 0 0 1-3.2 3.9M6.1 7.1A16 16 0 0 0 2 12s3.5 7 10 7a9.8 9.8 0 0 0 4.3-1M3 3l18 18M9.9 9.9a3 3 0 0 0 4.2 4.2" /></svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></svg>
            )}
          </button>
        </div>
      </div>
      <div className="campo">
        <label htmlFor="ns-conf">{rotuloConf}</label>
        <input
          className="inp"
          id="ns-conf"
          name="conf"
          type={tipo}
          autoComplete="new-password"
          placeholder="••••••••"
          value={conf}
          onChange={(e) => aoMudarConf(e.target.value)}
        />
      </div>
    </>
  );
}
