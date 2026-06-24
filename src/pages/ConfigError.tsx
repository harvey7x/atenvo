import { Logo } from '@/components/Logo';
import { supabaseEnv } from '@/lib/supabase';

/** Exibida quando faltam variáveis do Supabase e o modo demonstração não está
 *  habilitado. Bloqueia o acesso (login) até a configuração ser corrigida. */
export function ConfigError() {
  const faltando = [
    !supabaseEnv.hasUrl ? 'VITE_SUPABASE_URL' : null,
    !supabaseEnv.hasKey ? 'VITE_SUPABASE_ANON_KEY' : null,
  ].filter(Boolean) as string[];

  return (
    <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 24, background: 'var(--bg, #050607)', color: 'var(--text, #e7ecf2)' }}>
      <div style={{ maxWidth: 460, width: '100%', background: 'var(--surface, #0f1316)', border: '1px solid var(--border, #1d2329)', borderRadius: 16, padding: 32, boxShadow: '0 18px 48px rgba(0,0,0,.45)' }}>
        <div style={{ marginBottom: 20 }}><Logo /></div>
        <h1 style={{ fontSize: 20, margin: '0 0 8px' }}>Configuração ausente</h1>
        <p style={{ color: 'var(--text-muted, #8a97a6)', fontSize: 14, lineHeight: 1.55, margin: '0 0 16px' }}>
          O acesso está bloqueado porque o backend não está configurado. Defina as variáveis
          de ambiente do Supabase e publique novamente.
        </p>
        <ul style={{ margin: '0 0 16px', paddingLeft: 18, fontSize: 14, lineHeight: 1.8 }}>
          {faltando.map((v) => (
            <li key={v}><code style={{ color: '#ef6b7d', background: 'rgba(239,107,125,.10)', padding: '2px 7px', borderRadius: 6 }}>{v}</code></li>
          ))}
        </ul>
        <p style={{ color: 'var(--text-muted, #8a97a6)', fontSize: 13, lineHeight: 1.55, margin: 0 }}>
          Para um ambiente apenas de demonstração (sem backend), habilite explicitamente{' '}
          <code style={{ color: '#19c37d', background: 'rgba(25,195,125,.10)', padding: '2px 7px', borderRadius: 6 }}>VITE_ENABLE_DEMO_MODE=true</code>.
        </p>
      </div>
    </div>
  );
}
