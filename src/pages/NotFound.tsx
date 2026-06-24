import { Link } from 'react-router-dom';
import { Logo } from '@/components/Logo';

export function NotFound() {
  return (
    <div className="login">
      <div className="login-card" style={{ textAlign: 'center' }}>
        <div className="logo" style={{ justifyContent: 'center', marginBottom: 14 }}><Logo /></div>
        <h1>Página não encontrada</h1>
        <p className="sub" style={{ marginBottom: 18 }}>O endereço acessado não existe.</p>
        <Link to="/" className="btn btn-primary btn-block">Voltar ao início</Link>
      </div>
    </div>
  );
}
