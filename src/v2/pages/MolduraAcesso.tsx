import type { ReactNode } from 'react';
import './login.css';

/* Moldura das telas de ACESSO (login, senha, convite, criar organização, configuração ausente e a
   página não encontrada de quem não está logado): a marca ALFA no canto, o cartão no centro e um
   rodapé discreto — a primeira tela da equipe todo dia não fica solta numa tela vazia (crítica 12/11).
   A marca do canto é a MESMA do topo da barra lateral: o triângulo em uma cor dentro do quadrado dourado. */
function MarcaQuadro() {
  return (
    <span className="lg-topo-marca" aria-hidden>
      <svg viewBox="0 0 256 256" width="18" height="18" fill="none" focusable="false">
        <path d="M128 30 L228 216 L28 216 Z" stroke="currentColor" strokeWidth="20" strokeLinejoin="round" />
        <path d="M128 82 L184 202 L112 202 L144 142 L106 142 L72 202" stroke="currentColor" strokeWidth="17" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
    </span>
  );
}

export function MolduraAcesso({ children }: { children: ReactNode }) {
  const versao = import.meta.env.VITE_BUILD_TS ? String(import.meta.env.VITE_BUILD_TS) : null;
  return (
    <div className="v2 tela-login">
      <div className="luz2" />
      <div className="grao" />
      <header className="lg-topo">
        <MarcaQuadro />
        <span className="lg-topo-nome">ALFA GROUP</span>
      </header>
      {children}
      <footer className="lg-rodape">
        © {new Date().getFullYear()} ALFA GROUP{versao ? <> · <span className="num">versão {versao}</span></> : null}
      </footer>
    </div>
  );
}
