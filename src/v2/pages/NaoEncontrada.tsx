import { Link } from 'react-router-dom';
import '../fontes';
import '../tokens.css';
import '../base.css';
import './login.css';
import { DESTINO_PADRAO_V2 as INICIO } from '../destino';

/** 404 v2 — família visual do login (paridade com src/pages/NotFound.tsx). */
export default function NaoEncontrada() {
  return (
    <div className="v2 tela-login">
      <div className="luz2" />
      <div className="grao" />
      <div className="lg-card vidro pg-entra">
        <div className="marca2">A</div>
        <div className="caps">Atenvo</div>
        <h1 className="p-display">Página não encontrada.</h1>
        <div className="sub">O endereço acessado não existe.</div>
        <Link to={INICIO} className="entrar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}>
          Voltar ao início
        </Link>
      </div>
    </div>
  );
}
