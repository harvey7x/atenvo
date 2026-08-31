import type { ReactNode } from 'react';

/* Ícones da sidebar — os 10 do mockup, traço 1.7, viewBox 24.
   Facebook, Scripts e Maturação não existem no mockup (páginas órfãs):
   desenhados na MESMA família (stroke 1.7, geometria simples, sem fill). */

function Ic({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
      {children}
    </svg>
  );
}

export const ICONES: Record<string, ReactNode> = {
  dashboard: (
    <Ic><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></Ic>
  ),
  whatsapp: (
    <Ic><path d="M21 11.5a8.4 8.4 0 01-9 8.4 8.9 8.9 0 01-3.8-.8L3 20l1-4.9a8.3 8.3 0 01-1-4A8.4 8.4 0 0112 3a8.4 8.4 0 019 8.5z" /></Ic>
  ),
  facebook: (
    <Ic><path d="M12 3a8.5 8.5 0 00-6.4 14.1L5 20l3-.8A8.5 8.5 0 1012 3z" /><path d="M7.6 13.6l3.1-3.3 2.2 2.1 3.5-3.6" /></Ic>
  ),
  kanban: (
    <Ic><rect x="3" y="4" width="5" height="16" rx="1.3" /><rect x="10" y="4" width="5" height="11" rx="1.3" /><rect x="17" y="4" width="4" height="7" rx="1.3" /></Ic>
  ),
  agendamentos: (
    <Ic><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 10h18" /></Ic>
  ),
  disparo: (
    <Ic><path d="M21 3L10.5 13.5M21 3l-6.8 17.4a.35.35 0 01-.65.02L10.5 13.5 3.6 10.45a.35.35 0 01.02-.65L21 3z" /></Ic>
  ),
  contatos: (
    <Ic><circle cx="9" cy="8" r="3.4" /><path d="M3.5 20c.6-3.4 2.8-5 5.5-5s4.9 1.6 5.5 5M16 4.6a3.4 3.4 0 010 6.8" /></Ic>
  ),
  scripts: (
    <Ic><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M8 9h8M8 13h8M8 17h5" /></Ic>
  ),
  cobrancas: (
    <Ic><path d="M5 3h14v18l-2.3-1.5L14.4 21l-2.4-1.5L9.6 21l-2.3-1.5L5 21zM9 8h6M9 12h6" /></Ic>
  ),
  relatorios: (
    <Ic><path d="M4 20V10M10 20V4M16 20v-8M21 20H3" /></Ic>
  ),
  integracoes: (
    <Ic><path d="M9 7V3M15 7V3M7 7h10v5a5 5 0 01-10 0zM12 17v4" /></Ic>
  ),
  maturacao: (
    <Ic><path d="M12 21v-8" /><path d="M12 13c0-4 3-6.5 7.5-6.5 0 4.5-3 6.5-7.5 6.5z" /><path d="M12 13c0-4-3-6.5-7.5-6.5 0 4.5 3 6.5 7.5 6.5z" /></Ic>
  ),
  // Central de Remarketing: alvo com seta de retorno (recuperar quem escapou)
  remarketing: (
    <Ic><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3.2" /><path d="M21.5 2.5 15 9" /><path d="M15.5 4.5 15 9l4.5-.5" /></Ic>
  ),
  // Recuperação: setas de retomada (loop) recuperando o cliente
  recuperacao: (
    <Ic><path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" /><path d="M3 21v-5h5" /></Ic>
  ),
  // Simulador de Valores: calculadora (corpo + visor + teclas em pontos)
  simulador: (
    <Ic><rect x="5" y="3" width="14" height="18" rx="2.2" /><path d="M8.5 7.5h7" /><path strokeLinecap="round" d="M8.5 12h.01M12 12h.01M15.5 12h.01M8.5 15h.01M12 15h.01M15.5 15h.01M8.5 18h.01M12 18h.01M15.5 18h.01" /></Ic>
  ),
  // Atendente de IA: faísca de 4 pontas + brilho menor (família traço 1.7)
  ia: (
    <Ic><path d="M11 4c.7 3.4 2.3 5 5.7 5.7-3.4.7-5 2.3-5.7 5.7-.7-3.4-2.3-5-5.7-5.7C8.7 9 10.3 7.4 11 4z" /><path d="M17.8 14.6c.4 1.8 1.2 2.6 3 3-1.8.4-2.6 1.2-3 3-.4-1.8-1.2-2.6-3-3 1.8-.4 2.6-1.2 3-3z" /></Ic>
  ),
  // Fluxos do bot: nós ligados em sequência (trilho de passos)
  fluxos: (
    <Ic><circle cx="5" cy="6" r="2.4" /><circle cx="12" cy="12" r="2.4" /><circle cx="19" cy="18" r="2.4" /><path d="M6.8 7.6l3.4 2.8M13.8 13.6l3.4 2.8" /></Ic>
  ),
  configuracoes: (
    <Ic><circle cx="12" cy="12" r="3.2" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" /></Ic>
  ),
  'plano-uso': (
    <Ic><path d="M12 3l9 5-9 5-9-5zM3 13l9 5 9-5" /></Ic>
  ),
};
