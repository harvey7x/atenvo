import { temRecurso } from '../data/config/recursos';
import type { ReactNode } from 'react';
import { IconeReviza } from '../components/LogoReviza';
import './login.css';

/* Moldura das telas de ACESSO (login, senha, convite, criar organização, configuração ausente e a
   página não encontrada de quem não está logado): a marca ALFA no canto, o cartão no centro e um
   rodapé discreto — a primeira tela da equipe todo dia não fica solta numa tela vazia (crítica 12/11).
   A marca do canto é a MESMA do topo da barra lateral: o triângulo em uma cor dentro do quadrado dourado. */
function MarcaQuadro() {
  return <span className="lg-topo-marca" aria-hidden><IconeReviza /></span>;
}

export function MolduraAcesso({ children }: { children: ReactNode }) {
  const versao = import.meta.env.VITE_BUILD_TS ? String(import.meta.env.VITE_BUILD_TS) : null;
  return (
    <div className="v2 tela-login">
      <div className="luz2" />
      <div className="grao" />
      <header className="lg-topo">
        <MarcaQuadro />
        <span className="lg-topo-nome">Reviza CRM</span>
      </header>
      {/* 21/11 — o acesso com a MESMA cara do sistema: à esquerda a marca sobre o preto (como a barra
          lateral), à direita o painel claro com o formulário (como o palco). Sem a moldura, o painel
          da marca não aparece e o palco não existe para o layout (display: contents). */}
      <aside className="lg-painel">
        <IconeReviza className="lg-painel-logo" />
        <div className="lg-painel-txt">
          <i className="lg-painel-fio" aria-hidden />
          <p className="lg-painel-tit">Plataforma de Atendimento e Gestão</p>
          {/* a linha dos ambientes só anuncia o que esta instalação tem (config/recursos.ts) */}
          {temRecurso('atendimento') && <p className="lg-painel-amb"><span>Cobranças</span><span>Atendimento</span></p>}
        </div>
      </aside>
      <main className="lg-palco">{children}</main>
      <footer className="lg-rodape">
        © {new Date().getFullYear()} Reviza CRM{versao ? <> · <span className="num">versão {versao}</span></> : null}
      </footer>
    </div>
  );
}
