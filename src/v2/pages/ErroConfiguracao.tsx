import { supabaseEnv } from '@/lib/supabase';
import '../fontes';
import '../tokens.css';
import '../base.css';
import './login.css';
import { LogoAtenvo } from '../components/LogoAtenvo';
import { MolduraAcesso } from './MolduraAcesso';

/**
 * Configuração ausente v2 — família visual do login (paridade com
 * src/pages/ConfigError.tsx: lista dinamicamente APENAS as variáveis que
 * faltam e a dica do modo demonstração). No corte final, o main.tsx troca
 * ConfigError por este componente.
 */
export default function ErroConfiguracao() {
  const faltando = [
    !supabaseEnv.hasUrl ? 'VITE_SUPABASE_URL' : null,
    !supabaseEnv.hasKey ? 'VITE_SUPABASE_ANON_KEY' : null,
  ].filter(Boolean) as string[];

  return (
    <MolduraAcesso>
      <div className="lg-card vidro pg-entra">
        <LogoAtenvo className="marca2" />
        <div className="caps">Atenvo</div>
        <h1 className="p-display">Configuração ausente.</h1>
        <div className="sub">
          O acesso está indisponível porque a configuração do servidor está incompleta.
          Avise o administrador do sistema.
        </div>
        {faltando.length > 0 ? (
          <ul className="lg-vars">
            {faltando.map((v) => (
              <li key={v}><code>{v}</code></li>
            ))}
          </ul>
        ) : (
          <div className="sub" style={{ marginBottom: 14 }}>
            Neste ambiente nada está faltando — esta tela só aparece em produção
            quando a configuração está incompleta.
          </div>
        )}
        <div className="lg-pe">
          Para um ambiente apenas de demonstração (sem backend), habilite
          explicitamente <code className="ok">VITE_ENABLE_DEMO_MODE=true</code>.
        </div>
      </div>
    </MolduraAcesso>
  );
}
