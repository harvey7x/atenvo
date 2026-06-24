import type { ReactNode } from 'react';
import { useOrg } from '@/context/OrgContext';
import type { OrgRole } from '@/types/org';

/** Restringe o conteúdo a determinados papéis na organização atual.
    Se o papel não for permitido, mostra um aviso de acesso restrito (dentro do shell). */
export function RequireRole({ role, children }: { role: OrgRole | OrgRole[]; children: ReactNode }) {
  const { currentOrg } = useOrg();
  const allowed = Array.isArray(role) ? role.includes(currentOrg.role) : currentOrg.role === role;

  if (!allowed) {
    return (
      <div className="denied">
        <div className="d-card">
          <span className="d-ic">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="11" width="16" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
          </span>
          <h2>Acesso restrito</h2>
          <p>Esta área é exclusiva para administradores. A organização atual ({currentOrg.name}) está com um papel sem permissão para acessar Plano e uso.</p>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
