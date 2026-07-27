import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrg } from '@/context/OrgContext';
import type { OrgRole } from '@/types/org';
import { CardVidro, EstadoVazio } from '../components';
import { DESTINO_PADRAO_V2 } from '../destino';

/**
 * Porta v2 do RequireRole (src/components/RequireRole.tsx): mesma regra de
 * autorização (papel da organização atual). O estado negado é desenhado na
 * família Estado, dentro do shell, e é GENÉRICO de propósito — não revela
 * nome de organização nem o que existe atrás da porta.
 */
export default function RequireRoleV2({ role, children }: { role: OrgRole | OrgRole[]; children: ReactNode }) {
  const { currentOrg } = useOrg();
  const navigate = useNavigate();
  const papel = currentOrg?.role;
  const permitido = Array.isArray(role) ? !!papel && role.includes(papel) : papel === role;

  if (!permitido) {
    return (
      <>
        <div className="ph sobe">
          <div>
            <h2>Acesso restrito</h2>
          </div>
        </div>
        <CardVidro sobe atraso={0.08}>
          <EstadoVazio
            icone={
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
                <rect x="4" y="11" width="16" height="9" rx="2" />
                <path d="M8 11V8a4 4 0 0 1 8 0v3" />
              </svg>
            }
            titulo="Você não tem permissão para acessar esta área"
            descricao="Fale com um administrador da sua organização se precisar deste acesso."
            acao={{ rotulo: 'Voltar ao início', onClick: () => navigate(DESTINO_PADRAO_V2) }}
          />
        </CardVidro>
      </>
    );
  }
  return <>{children}</>;
}
