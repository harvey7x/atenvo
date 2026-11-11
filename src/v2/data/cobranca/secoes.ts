/* MATRIZ de acesso às telas de Cobranças por papel (dono 14/09; 27/09: financeiro ganhou o
   Painel GERAL; "Atendentes não pode aparecer pro comercial"). FONTE ÚNICA: a rota
   (secaoLiberada em Cobrancas.tsx) e o menu (AppShellV2) leem daqui — antes eram duas
   listas "espelho" mantidas à mão. admin/gestor veem tudo (fora desta lista). */
// 06/11 (dono: "coloca essa tela para aparecer para todos"): Números entrou pra TODOS os papéis —
// cadastro e financeiro já podiam gerenciar qualquer número na edge function (v12), só não tinham
// como chegar na tela; comercial já estava aqui, mas só conectava o próprio WhatsApp a partir da
// mig 86 (antes a edge function nem deixava).
export const SECOES_FINANCEIRO = ['painel', 'novos', 'financeiro', 'planilha', 'cancelados', 'atendentes', 'avisos', 'numeros', 'analise'] as const;
/** comercial: Painel INDIVIDUAL (só os clientes dele) — NUNCA Atendentes, Financeiro, Usuários, Registros */
export const SECOES_COMERCIAL = ['painel', 'novos', 'planilha', 'cancelados', 'calendario', 'avisos', 'regua', 'conversas', 'numeros', 'envios', 'analise'] as const;
/** cadastro ("Administrador"/administrativo): Novos, Gestão e Avisos
    (+ Análise INSS para TODOS os papéis: roda só no navegador, não lê o banco) */
export const SECOES_CADASTRO = ['novos', 'planilha', 'cancelados', 'avisos', 'numeros', 'analise'] as const;

export type PapelReviza = 'admin' | 'gestor' | 'comercial' | 'financeiro' | 'cadastro' | 'atendente';

/** a seção `secao` de Cobranças pode aparecer para este papel? (admin/gestor: sim) */
export function secaoDoPapel(papel: PapelReviza | null | undefined, secao: string): boolean {
  if (papel === 'financeiro') return (SECOES_FINANCEIRO as readonly string[]).includes(secao);
  if (papel === 'comercial') return (SECOES_COMERCIAL as readonly string[]).includes(secao);
  if (papel === 'cadastro') return (SECOES_CADASTRO as readonly string[]).includes(secao);
  // atendente: só o Atendimento — nenhuma tela de Cobranças (o seletor do topo nem oferece o ambiente)
  if (papel === 'atendente') return false;
  return true;
}
