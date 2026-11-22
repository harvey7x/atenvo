/* ÁREAS de cada pessoa (dono 22/11: "definir nos logins o que as pessoas vão poder fazer, quais
   áreas a pessoa vai poder acessar"). O PAPEL continua sendo o teto — é ele que o banco confere em
   cada dado; aqui o administrador escolhe, dentro do que o papel alcança, as telas que a pessoa vê.
   Gravado em profiles.areas (lista de slugs; null = todas as que o papel alcança).
   FONTE ÚNICA: o menu, a rota (AppShellV2) e a tela Usuários e acessos leem daqui. */
import type { Ambiente } from '../modulos';
import { secaoDoPapel, type PapelReviza } from '../cobranca/secoes';

export interface AreaDef { slug: string; rotulo: string; ambiente: Ambiente; grupo: string; soAdmin?: boolean }

/** as telas dos dois ambientes, na ordem do menu (as de Configurações não entram: têm regra própria) */
export const AREAS: readonly AreaDef[] = [
  { slug: 'cobrancas/painel', rotulo: 'Painel', ambiente: 'cobrancas', grupo: 'Visão geral' },
  { slug: 'cobrancas/atendentes', rotulo: 'Atendentes', ambiente: 'cobrancas', grupo: 'Visão geral' },
  { slug: 'cobrancas/planilha', rotulo: 'Gestão de cobranças', ambiente: 'cobrancas', grupo: 'Carteira' },
  { slug: 'cobrancas/novos', rotulo: 'Novos', ambiente: 'cobrancas', grupo: 'Carteira' },
  { slug: 'cobrancas/cancelados', rotulo: 'Cancelados', ambiente: 'cobrancas', grupo: 'Carteira' },
  { slug: 'cobrancas/financeiro', rotulo: 'Financeiro', ambiente: 'cobrancas', grupo: 'Carteira' },
  { slug: 'cobrancas/calendario', rotulo: 'Calendário', ambiente: 'cobrancas', grupo: 'Carteira' },
  { slug: 'cobrancas/regua', rotulo: 'Régua de mensagens', ambiente: 'cobrancas', grupo: 'WhatsApp' },
  { slug: 'cobrancas/conversas', rotulo: 'Conversas', ambiente: 'cobrancas', grupo: 'WhatsApp' },
  { slug: 'cobrancas/numeros', rotulo: 'Números', ambiente: 'cobrancas', grupo: 'WhatsApp' },
  { slug: 'cobrancas/envios', rotulo: 'Envios', ambiente: 'cobrancas', grupo: 'WhatsApp' },
  { slug: 'cobrancas/analise', rotulo: 'Análise INSS', ambiente: 'cobrancas', grupo: 'Ferramentas' },
  { slug: 'cobrancas/avisos', rotulo: 'Avisos', ambiente: 'cobrancas', grupo: 'Equipe' },
  { slug: 'whatsapp', rotulo: 'WhatsApp', ambiente: 'atendimento', grupo: 'Operação' },
  { slug: 'pos-venda', rotulo: 'Pós-venda', ambiente: 'atendimento', grupo: 'Operação' },
  { slug: 'presenciais', rotulo: 'Presenciais', ambiente: 'atendimento', grupo: 'Operação' },
  { slug: 'scripts', rotulo: 'Scripts', ambiente: 'atendimento', grupo: 'Operação' },
  { slug: 'kanban', rotulo: 'Kanban', ambiente: 'atendimento', grupo: 'Gestão' },
  { slug: 'dashboard', rotulo: 'Dashboard', ambiente: 'atendimento', grupo: 'Gestão', soAdmin: true },
  { slug: 'ferramentas/unificador', rotulo: 'Unificador de documentos', ambiente: 'atendimento', grupo: 'Ferramentas' },
  { slug: 'ferramentas/conversor', rotulo: 'Conversor de arquivos', ambiente: 'atendimento', grupo: 'Ferramentas' },
  { slug: 'ferramentas/coletor-inss', rotulo: 'Coletor INSS', ambiente: 'atendimento', grupo: 'Ferramentas' },
];

/** o papel alcança esta tela? (o teto — a mesma matriz do menu e do banco) */
export function papelAlcanca(papel: PapelReviza | null | undefined, a: AreaDef): boolean {
  if (papel === 'admin' || papel === 'gestor') return true;
  if (a.soAdmin) return false;
  if (a.ambiente === 'cobrancas') return secaoDoPapel(papel, a.slug.slice('cobrancas/'.length));
  return true;
}

/** as telas que o papel alcança dentro dos ambientes que a pessoa tem */
export const areasPossiveis = (papel: PapelReviza | null | undefined, ambientes: readonly Ambiente[]): AreaDef[] =>
  AREAS.filter((a) => ambientes.includes(a.ambiente) && papelAlcanca(papel, a));

/** a lista gravada, limpa: só slugs que existem; null quando não há restrição */
export function lerAreas(bruto: unknown): string[] | null {
  if (!Array.isArray(bruto)) return null;
  const validos = new Set(AREAS.map((a) => a.slug));
  return bruto.filter((s): s is string => typeof s === 'string' && validos.has(s));
}

/** a tela `slug` está liberada para a pessoa? (sem lista = tudo o que o papel alcança; o que não é
    uma ÁREA — Configurações, Integrações — não passa por aqui) */
export function areaLiberada(areas: readonly string[] | null | undefined, slug: string): boolean {
  if (!areas) return true;
  if (!AREAS.some((a) => a.slug === slug)) return true;
  return areas.includes(slug);
}

/** a área de uma rota ('/cobrancas/planilha' → 'cobrancas/planilha'; '/whatsapp/x' → 'whatsapp') */
export function areaDaRota(pathname: string): string | null {
  const p = pathname.replace(/^\/+|\/+$/g, '');
  const a = AREAS.filter((x) => p === x.slug || p.startsWith(x.slug + '/')).sort((x, y) => y.slug.length - x.slug.length)[0];
  return a ? a.slug : null;
}

/** resumo para a lista de usuários: "Tudo do papel" ou "5 de 11 telas" */
export function resumoAreas(papel: PapelReviza | null | undefined, ambientes: readonly Ambiente[], areas: readonly string[] | null | undefined): { texto: string; restrito: boolean } {
  if (papel === 'admin') return { texto: 'Acesso total', restrito: false };
  const possiveis = areasPossiveis(papel, ambientes);
  if (!areas) return { texto: `Todas as ${possiveis.length} telas do papel`, restrito: false };
  const n = possiveis.filter((a) => areas.includes(a.slug)).length;
  return n >= possiveis.length ? { texto: `Todas as ${possiveis.length} telas do papel`, restrito: false } : { texto: `${n} de ${possiveis.length} telas`, restrito: true };
}
