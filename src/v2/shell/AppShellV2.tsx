import { AtendimentoAguardando } from '../pages/AtendimentoAguardando';
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as RKeyboardEvent, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useOrg } from '@/context/OrgContext';
import { isDemoMode, isRevizaMode } from '@/lib/supabase';
import '../fontes';
import '../tokens.css';
import '../base.css';
import './shell.css';
import './paleta.css'; // paleta de busca global (⌘K)
import '../skinAurora.css'; // TESTE (branch teste/skin-aurora-azul): fundo bokeh + azul secundário
import { LogoAtenvo } from '../components/LogoAtenvo';
import { instalarSpotlight } from '../lib/spotlight';
import { instalarRolagemSemHover } from '../lib/rolagem';
import { criarRaizPortalV2 } from '../components/portal';
import { ICONES } from './icones';
import { ICONES_ALFA } from './iconesAlfa';
import { NotificacaoResposta, type DadosNotificacao } from './NotificacaoResposta';
import { useNotificacaoInbound } from '../hooks/useNotificacaoInbound';
import { aplicarTema, lerTema, salvarTema, type Tema } from '../lib/tema';
import { lerMoldura } from '../lib/molduraAlfa';
import { instalarNumerosSobem } from '../lib/numerosSobem';
import { AvisoAtualizacao } from '../components/AvisoAtualizacao';
import { LicencaGate } from '../components/LicencaGate';
import { ConfiguracaoGate } from '../pages/configuracao/ConfiguracaoGate';
import { useConfiguracaoPendente } from '../data/cobranca/configuracao';
import { useNotificacoes, useMarcarNotificacao, type Notificacao } from '@/data/remarketing';
import { useNotificacoesCob, useMarcarNotifCob } from '../data/cobranca/notificacoes';
import { PREFIXO_ATD, useMarcarNotificacaoAtendimento, useNotificacoesAtendimento } from '@/data/notificacoesAtendimento';
import { secaoDoPapel } from '../data/cobranca/secoes';
import { rotaAtendimentoPermitida } from '../data/modulos';
import { temRecurso, temCadastroAtendimento } from '../data/config/recursos';
import { areaDaRota, areaLiberada } from '../data/config/areas';
import { useConversasWA } from '../data/wa/wa';
import { chatEquipeLigado, useChatNaoLidas } from '@/data/chatEquipe';
import { idsVistos, naoVistas, novidadesPara } from '../data/novidades';
import { tempoRelativo } from '../lib/tempo';
import { usePapel } from '../data/cobranca/sessao';
import { useAvisosNaoLidos } from '../data/cobranca/avisos';
import { usePendentesAprovacao } from '../data/cobranca/hooks';
import { getCobrancaRepo } from '../data/cobranca/cobrancaRepo';
import { chavesCobranca } from '../data/cobranca/keys';
import type { Dados } from '../data/cobranca/types';
import { BotaoDesfazer } from './BotaoDesfazer';
import { EstadoVazio } from '../components/Estado';
import { BarraAlfa, TopoAlfa, IcFechar, IcSair, ICONE_AMBIENTE, rotuloAtalho, type AcaoTopoBarra, type GrupoBarra, type ItemBarra, type ModoBarra } from './BarraAlfa';
import { ModalV2 } from '../components/ModalV2';

/* ALFA (Reviza de verdade e a demo): barra lateral e topo no desenho da referência "Dashboard
   Sidebar" (dono 12/11) — BarraAlfa.tsx. O Atenvo (fora daqui) segue com a cápsula flutuante. */
const ALFA = isRevizaMode || isDemoMode;
/* preferência da barra (por aparelho): aberta (260px) ou recolhida (trilho de ícones) */
const CHAVE_BARRA = 'reviza.barra';
const lerPrefBarra = (): 'aberta' | 'trilho' | null => {
  try { const v = localStorage.getItem(CHAVE_BARRA); return v === 'aberta' || v === 'trilho' ? v : null; } catch { return null; }
};
/* zonas pela largura da tela: celular (≤760px) = gaveta; média (761–1439px, os notebooks da equipe) =
   trilho — encaixada ali a barra espremeria as telas, que foram feitas para o trilho de antes; o botão
   do topo abre por cima; larga (≥1440px) = a escolha da pessoa, aberta de saída */
const LARGURA_CELULAR = 760;
const LARGURA_ENCAIXE = 1440;
const LARGURA_FIXA = 1100; // com a barra fixa (moldura): aberta a partir daqui
const zonaDaLargura = (w: number): 'gaveta' | 'media' | 'larga' => (w <= LARGURA_CELULAR ? 'gaveta' : w < LARGURA_ENCAIXE ? 'media' : 'larga');
/* telas que precisam de toda a largura: a barra começa recolhida nelas em qualquer tela (crítica 12/11) */
const TELAS_DE_TRABALHO = /^\/(whatsapp|pos-venda|kanban|cobrancas\/planilha)(\/|$)/;
/* atalho de teclado não age com o foco num campo de texto (Ctrl+, apagava o rascunho do WhatsApp) */
const ehEditavel = (el: EventTarget | null) => el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

/* ícones do chrome da topbar (traço fino, como o resto do v2) */
const IconeSol = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
    <circle cx="12" cy="12" r="4.2" /><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19" />
  </svg>
);
const IconeLua = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M20 14.5A8 8 0 019.5 4 7 7 0 1020 14.5z" />
  </svg>
);

/* Navegação real do app (INVENTARIO.md + decisões aprovadas):
   Relacionamento fica fora (adiada); Facebook, Scripts e Maturação são
   órfãs do mockup e entram nos grupos pela função. Badges chegam com as
   páginas reais — por ora ficam zerados (nada de número inventado). */
type ItemNav = { slug: string; rotulo: string; admin?: boolean };
/* `fixo`: grupo preso ao pé da sidebar, sem rótulo, acima do usuário (como no Atenvo) */
type GrupoNav = { rotulo: string; itens: ItemNav[]; fixo?: boolean };
/* ATENDIMENTO dentro da Reviza (dono 11/11: "importar o Atenvo para dentro da Reviza"): o menu do
   Atenvo de hoje, SÓ com WhatsApp, Presenciais, Scripts, Kanban, Dashboard, Unificador de documentos,
   Conversor de arquivos e Coletor do INSS — sem Pendências, Painel da Equipe e Central de Avisos (fora
   do menu e da URL: data/modulos.ts). Configurações fica no pé, como no Atenvo, e ganhou os Usuários. */
const GRUPOS: GrupoNav[] = [
  {
    rotulo: 'Operação',
    itens: [
      { slug: 'whatsapp', rotulo: 'WhatsApp' }, // o nome que o dono usou ao pedir o Atendimento (11/11)
      // Pós-venda (dono 21/11): os clientes FECHADOS num atendimento próprio, fora da lista do WhatsApp
      { slug: 'pos-venda', rotulo: 'Pós-venda' },
      { slug: 'presenciais', rotulo: 'Presenciais' },
      // Tarefas da equipe (25/11): só com a peça do servidor (migration 101) nesta instalação
      ...(temRecurso('tarefas') ? [{ slug: 'tarefas', rotulo: 'Tarefas' }] : []),
      { slug: 'scripts', rotulo: 'Scripts' },
      // Chat da equipe (dono 25/11, como o "Chat Interno" do sistema de antes): conversa entre colegas, com o número
      // de não lidas no item — só onde o recurso está ligado (config/recursos.ts)
      ...(chatEquipeLigado() ? [{ slug: 'chat-equipe', rotulo: 'Chat da equipe' }] : []),
    ],
  },
  {
    rotulo: 'Gestão',
    itens: [
      // Kanban sem admin: a equipe vê o quadro (cada um os seus cards); Dashboard só o administrador (como no Atenvo)
      { slug: 'kanban', rotulo: 'Kanban' },
      { slug: 'dashboard', rotulo: 'Dashboard', admin: true },
    ],
  },
  {
    rotulo: 'Ferramentas',
    itens: [
      { slug: 'ferramentas/unificador', rotulo: 'Unificador de documentos' },
      { slug: 'ferramentas/conversor', rotulo: 'Conversor de arquivos' },
      { slug: 'ferramentas/coletor-inss', rotulo: 'Coletor INSS' },
      // O que mudou (25/11): as novidades, com o número das que esta pessoa ainda não viu
      { slug: 'novidades', rotulo: 'O que mudou' },
    ],
  },
  {
    rotulo: 'Sistema',
    fixo: true,
    itens: [{ slug: 'configuracoes', rotulo: 'Configurações' }],
  },
];

/* MÓDULOS do sistema (seletor do topo, 29/08): cada módulo troca o menu
   inteiro da esquerda. Atendimento = a operação de sempre; Cobranças = as
   seções do Modo Cobrança viram itens de menu. Novos módulos entram aqui. */
type ModuloId = 'atendimento' | 'cobrancas' | 'configuracoes';
type Modulo = { id: ModuloId; rotulo: string; home: string; grupos: GrupoNav[] };
const COB_SECOES_BASE: ItemNav[] = [
  { slug: 'cobrancas/painel', rotulo: 'Painel' },
  { slug: 'cobrancas/atendentes', rotulo: 'Atendentes' },
  { slug: 'cobrancas/clientes', rotulo: 'Clientes' },
  { slug: 'cobrancas/planilha', rotulo: 'Planilha de clientes' },
  { slug: 'cobrancas/ciclos', rotulo: 'Ciclos' },
  { slug: 'cobrancas/regua', rotulo: 'Régua de mensagens' },
  { slug: 'cobrancas/conversas', rotulo: 'Conversas' },
  { slug: 'cobrancas/numeros', rotulo: 'Números' },
  { slug: 'cobrancas/envios', rotulo: 'Envios' },
];
// No demo, "Clientes"/"Planilha"/"Clientes novos" viram uma tela só: "Gestão de cobranças".
// Na instância REVIZA (real) só entram as telas que falam com o banco dedicado.
const COB_SECOES_REVIZA: ItemNav[] = [
  { slug: 'cobrancas/painel', rotulo: 'Painel' },
  { slug: 'cobrancas/atendentes', rotulo: 'Atendentes' },
  { slug: 'cobrancas/planilha', rotulo: 'Gestão de cobranças' },
  { slug: 'cobrancas/novos', rotulo: 'Novos' },
  { slug: 'cobrancas/cancelados', rotulo: 'Cancelados' },
  { slug: 'cobrancas/financeiro', rotulo: 'Financeiro' },
  { slug: 'cobrancas/calendario', rotulo: 'Calendário' },
  { slug: 'cobrancas/avisos', rotulo: 'Avisos' },
  { slug: 'cobrancas/regua', rotulo: 'Régua de mensagens' },
  { slug: 'cobrancas/conversas', rotulo: 'Conversas' },
  { slug: 'cobrancas/numeros', rotulo: 'Números' },
  { slug: 'cobrancas/envios', rotulo: 'Envios' },
  { slug: 'cobrancas/analise', rotulo: 'Análise INSS' },
  // Registros e Usuários (só admin) foram para o ambiente Configurações (dono 22/11)
];
const COB_SECOES: ItemNav[] = isRevizaMode
  ? COB_SECOES_REVIZA
  : isDemoMode
  ? COB_SECOES_BASE
      .filter((s) => s.slug !== 'cobrancas/clientes' && s.slug !== 'cobrancas/ciclos')
      .flatMap((s) => (s.slug === 'cobrancas/planilha'
        ? [{ ...s, rotulo: 'Gestão de cobranças' }, { slug: 'cobrancas/novos', rotulo: 'Novos' }, { slug: 'cobrancas/cancelados', rotulo: 'Cancelados' }, { slug: 'cobrancas/financeiro', rotulo: 'Financeiro' }, { slug: 'cobrancas/calendario', rotulo: 'Calendário' }, { slug: 'cobrancas/avisos', rotulo: 'Avisos' }]
        : [s]))
      // demo = o contrato da Reviza: Análise INSS, Registros e Usuários (só admin) também existem aqui
      .concat([
        { slug: 'cobrancas/analise', rotulo: 'Análise INSS' },
        { slug: 'cobrancas/registros', rotulo: 'Registros', admin: true },
        { slug: 'cobrancas/usuarios', rotulo: 'Usuários', admin: true },
      ])
  : COB_SECOES_BASE;
/* Menu de Cobranças em GRUPOS por assunto (dono 27/09: "quero essa parte mais organizada"
   — eram 11 itens numa lista só). Grupo vazio para o papel some sozinho (o filtro de
   papel roda por item no render). Seção sem grupo mapeado cai em "Equipe". */
const COB_GRUPO_DE: Record<string, string> = {
  painel: 'Visão geral', atendentes: 'Visão geral',
  planilha: 'Carteira', clientes: 'Carteira', novos: 'Carteira', cancelados: 'Carteira', financeiro: 'Carteira', calendario: 'Carteira', ciclos: 'Carteira',
  regua: 'WhatsApp', conversas: 'WhatsApp', numeros: 'WhatsApp', envios: 'WhatsApp',
  avisos: 'Equipe', registros: 'Equipe', usuarios: 'Equipe',
  analise: 'Ferramentas',
};
const COB_GRUPOS = ['Visão geral', 'Carteira', 'WhatsApp', 'Ferramentas', 'Equipe']
  .map((rotulo) => ({ rotulo, itens: COB_SECOES.filter((i) => (COB_GRUPO_DE[i.slug.replace('cobrancas/', '')] ?? 'Equipe') === rotulo) }))
  .filter((g) => g.itens.length > 0);
/* a linha de descrição de cada ambiente no menu de troca da barra */
const DESCRICAO_AMBIENTE: Record<ModuloId, string> = {
  cobrancas: 'Carteira e pagamentos',
  atendimento: 'Conversas e Kanban',
  configuracoes: 'WhatsApp, integrações e acessos',
};
/* AMBIENTE CONFIGURAÇÕES (dono 22/11: "um ambiente de configuração — tudo que a gente for configurar
   precisa estar nesse ambiente"): conectar o WhatsApp (e dizer se é das Cobranças ou do Atendimento),
   os logins e o que cada pessoa acessa, e os Registros (tudo o que cada pessoa faz). O que é da
   própria pessoa (conta, notificações, preferências) fica no grupo "Minha conta", para todos.
   Rotas em /config/* (o /configuracoes de antes leva para cá). */
// Iris e Regras do atendimento só entram quando a instalação tem essas peças no servidor (config/recursos.ts)
const CFG_GRUPOS: GrupoNav[] = [
  { rotulo: 'Conexões', itens: [{ slug: 'config/whatsapp', rotulo: 'WhatsApp', admin: true }, { slug: 'config/integracoes', rotulo: 'Integrações', admin: true }] },
  // Equipes (gerente, pessoas e WhatsApp de cada equipe) são do Atendimento: aparecem quando ele está no
  // servidor ou quando já dá para cadastrá-lo (recurso "acessos")
  { rotulo: 'Equipe', itens: [{ slug: 'config/usuarios', rotulo: 'Usuários e acessos', admin: true }, ...(temCadastroAtendimento() ? [{ slug: 'config/equipes', rotulo: 'Equipes', admin: true }] : []), { slug: 'config/registros', rotulo: 'Registros', admin: true }] },
  { rotulo: 'Atendimento', itens: [
    ...(temRecurso('iris') ? [{ slug: 'config/iris', rotulo: 'Atendentes de IA', admin: true }] : []),
    ...(temRecurso('atendimento') ? [{ slug: 'config/atendimento', rotulo: 'Regras do atendimento', admin: true }] : []),
    ...(temRecurso('atendimento') && temRecurso('retomada') ? [{ slug: 'config/retomada', rotulo: 'Retomada automática', admin: true }] : []),
    ...(temRecurso('atendimento') && temRecurso('aviso-espera') ? [{ slug: 'config/aviso-espera', rotulo: 'Aviso de espera', admin: true }] : []),
  ] },
  // "Minha conta" são telas do Atendimento (conta, notificações, preferências): só com ele no servidor
  { rotulo: 'Minha conta', itens: temRecurso('atendimento') ? [{ slug: 'config/conta', rotulo: 'Conta' }, { slug: 'config/notificacoes', rotulo: 'Notificações' }, { slug: 'config/preferencias', rotulo: 'Preferências' }] : [] },
].filter((g) => g.itens.length > 0);
// Reviza: "Configurações" sai do pé do menu do Atendimento — virou o ambiente
const MOD_ATENDIMENTO: Modulo = { id: 'atendimento', rotulo: 'Atendimento', home: '/whatsapp', grupos: isRevizaMode ? GRUPOS.filter((g) => !g.fixo) : GRUPOS };
const MOD_COBRANCAS: Modulo = { id: 'cobrancas', rotulo: 'Cobranças', home: '/cobrancas/painel', grupos: COB_GRUPOS };
const MOD_CONFIG: Modulo = { id: 'configuracoes', rotulo: 'Configurações', home: '/config', grupos: CFG_GRUPOS };
const ehRotaConfig = (pathname: string) => isRevizaMode && /^\/config(\/|$)/.test(pathname);
// Reviza: Cobranças vem primeiro — é o início de quem tem os dois ambientes (o coração da Reviza)
const MODULOS: Modulo[] = isRevizaMode ? [MOD_COBRANCAS, MOD_ATENDIMENTO, MOD_CONFIG] : [MOD_ATENDIMENTO, MOD_COBRANCAS];
/* o nome da página na trilha do topo ("Cobranças / Painel"): o do item do menu (o da instância ganha) */
const TITULOS_PAGINA: Record<string, string> = {
  integracoes: 'Integrações',
  'config/integracoes/asaas': 'Integrações',
  'config/integracoes/whatsapp-oficial': 'Integrações',
  'config/integracoes/anuncios': 'Integrações',
  'config/integracoes/ia': 'Integrações',
  ...Object.fromEntries([...COB_SECOES_BASE, ...COB_SECOES_REVIZA, ...GRUPOS.flatMap((g) => g.itens), ...COB_SECOES, ...CFG_GRUPOS.flatMap((g) => g.itens)].map((i) => [i.slug, i.rotulo])),
};
const tituloDaRota = (pathname: string) => TITULOS_PAGINA[pathname.replace(/^\/+|\/+$/g, '')] ?? '';
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
/* ícones das seções de cobrança (mesma família traço 1.7) */
const IcC = (d: string) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden><path d={d} /></svg>
);
const FERR_ICONES: Record<string, ReactNode> = {
  unificador: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden><path d="M8 3H5a2 2 0 0 0-2 2v5M16 3h3a2 2 0 0 1 2 2v5M8 21H5a2 2 0 0 1-2-2v-5M16 21h3a2 2 0 0 0 2-2v-5M9 12h6M12 9v6" /></svg>,
  // Conversor: dois arquivos com setas trocando (converter)
  conversor: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden><path d="M4 7h11M4 7l3-3M4 7l3 3M20 17H9M20 17l-3-3M20 17l-3 3" /></svg>,
  // Coletor INSS: documento com seta para baixo (o ícone do Atenvo)
  'coletor-inss': <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" /><path d="M12 11v6M9.5 14.5 12 17l2.5-2.5" /></svg>,
};
const COB_ICONES: Record<string, ReactNode> = {
  // Análise INSS: extrato (documento) com lupa
  analise: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M13 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h5M13 3l5 5M13 3v5h5M8 12h5M8 16h2" /><circle cx="16.5" cy="16.5" r="3" /><path d="M18.7 18.7 21 21" /></svg>,
  painel: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden><path d="M4 20V10M10 20V4M16 20v-8M21 20H3" /></svg>,
  atendentes: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden><circle cx="9" cy="8" r="3.4" /><path d="M3.5 20c.6-3.4 2.8-5 5.5-5s4.9 1.6 5.5 5M16 4.6a3.4 3.4 0 010 6.8" /></svg>,
  clientes: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden><circle cx="12" cy="8" r="3.6" /><path d="M5 20c.7-4 3.4-6 7-6s6.3 2 7 6" /></svg>,
  // Gestão de cobranças: grade/planilha
  planilha: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M3 15h18M9 3v18" /></svg>,
  // Financeiro: cédula/dinheiro
  financeiro: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden><rect x="2.5" y="6" width="19" height="12" rx="2" /><circle cx="12" cy="12" r="2.6" /><path d="M5.6 9.5h.01M18.4 14.5h.01" /></svg>,
  // Novos: débito ativo (seta descendo = descontando)
  novos: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5v6.5M9 11.5l3 3 3-3" /></svg>,
  // Cancelados: pessoa com um "x" (saiu da cobrança — dá pra reativar)
  cancelados: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden><circle cx="9" cy="8" r="3.4" /><path d="M3.5 20c.6-3.4 2.8-5 5.5-5 1.4 0 2.6.4 3.6 1.2M16 14l5 5M21 14l-5 5" /></svg>,
  // Usuários: pessoa com engrenagem/gestão
  usuarios: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden><circle cx="9" cy="8" r="3.2" /><path d="M3.5 20c.6-3.3 2.8-5 5.5-5s4.9 1.7 5.5 5M17 8h4M19 6v4" /></svg>,
  // Registros: histórico/auditoria (relógio com lista)
  registros: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden><path d="M3 5h11M3 10h11M3 15h6" /><circle cx="17.5" cy="15.5" r="4.5" /><path d="M17.5 13.5v2l1.3 1" /></svg>,
  // Avisos: megafone (comunicado do administrativo pro time)
  avisos: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" aria-hidden><path d="M3 10v4a1 1 0 001 1h2.5L13 19V5l-6.5 4H4a1 1 0 00-1 1z" /><path d="M16.5 9a5 5 0 010 6M19 6.5a9 9 0 010 11" /></svg>,
  // Calendário: mês com marcador de dia
  calendario: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden><rect x="3" y="4.5" width="18" height="16" rx="2" /><path d="M3 9h18M8 2.5v4M16 2.5v4" /><circle cx="12" cy="14.5" r="1.6" fill="currentColor" stroke="none" /></svg>,
  // Conversas: balão de conversa com reticências
  conversas: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden><path d="M4 5h16a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H9l-4 4v-4H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" /><circle cx="8.5" cy="10.8" r=".95" fill="currentColor" stroke="none" /><circle cx="12" cy="10.8" r=".95" fill="currentColor" stroke="none" /><circle cx="15.5" cy="10.8" r=".95" fill="currentColor" stroke="none" /></svg>,
  ciclos: IcC('M20 12a8 8 0 1 1-2.3-5.6M20 4v4h-4'),
  regua: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden><path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.9 8.9 0 0 1-3.8-.8L3 20l1-4.9a8.3 8.3 0 0 1-1-4A8.4 8.4 0 0 1 12 3a8.4 8.4 0 0 1 9 8.5z" /></svg>,
  numeros: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L20 13l-.5-.2 1 4.2A2 2 0 0 1 18.5 19 15 15 0 0 1 5 5.5 2 2 0 0 1 5 4z" /></svg>,
  envios: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden><path d="M21 3L10.5 13.5M21 3l-6.8 17.4a.35.35 0 0 1-.65.02L10.5 13.5 3.6 10.45a.35.35 0 0 1 .02-.65L21 3z" /></svg>,
};
function iconeDoItem(slug: string): ReactNode {
  // ALFA (21/11): a família nova, uma só para os dois ambientes; o que ela não cobre segue o de antes
  if (ALFA) { const novo = ICONES_ALFA[slug.split('/').pop() ?? slug]; if (novo) return novo; }
  if (slug.startsWith('cobrancas/')) return COB_ICONES[slug.split('/')[1]] ?? ICONES.cobrancas;
  if (slug.startsWith('ferramentas/')) return FERR_ICONES[slug.split('/')[1]] ?? FERR_ICONES.unificador;
  return ICONES[slug];
}

const PAPEL_ROTULO: Record<string, string> = {
  admin: 'Administrador',
  gestor: 'Gestor',
  atendente: 'Atendente',
};

function iniciaisDe(nome: string): string {
  // só a primeira LETRA de cada palavra — "Teste (verificação)" vira "TV", não "T("
  const letras = nome.trim().split(/\s+/)
    .map((p) => p.match(/\p{L}/u)?.[0] ?? '')
    .filter(Boolean);
  if (!letras.length) return 'A';
  return (letras[0] + (letras[1] ?? '')).toUpperCase();
}

const NOTIF_DEMO: DadosNotificacao = {
  iniciais: 'MA',
  quem: 'Maria Aparecida Souza',
  mensagem: '"Consegui a foto do documento, meu filho. Pode conferir se está boa assim?"',
  fonte: 'WhatsApp · Canal 1390',
};

/* MENUS DO TOPO (sino e conta): o mesmo comportamento do seletor de ambiente da barra — ao abrir, o foco
   vai ao primeiro item; setas, Home e End navegam; Esc e Tab fecham e devolvem o foco ao botão que abriu.
   O Esc escuta na captura: fecha o menu antes de qualquer outro ouvinte (a barra sobreposta, por exemplo). */
function useMenuTeclado(aberto: boolean, fechar: () => void, gatilho: RefObject<HTMLElement>, menu: RefObject<HTMLElement>) {
  const fecharRef = useRef(fechar); fecharRef.current = fechar;
  useEffect(() => {
    if (!aberto) return;
    const m = menu.current;
    const itens = () => Array.from(m?.querySelectorAll<HTMLElement>('[role^="menuitem"]:not([disabled])') ?? []);
    const primeiro = m?.querySelector<HTMLElement>('[role^="menuitem"]:not([disabled]):not(.np-todas)') ?? itens()[0] ?? m;
    primeiro?.focus({ preventScroll: true });
    const devolver = () => { fecharRef.current(); gatilho.current?.focus({ preventScroll: true }); };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { if (e.isComposing) return; e.preventDefault(); e.stopPropagation(); devolver(); return; }
      if (!m || !m.contains(document.activeElement)) return;
      if (e.key === 'Tab') { e.preventDefault(); devolver(); return; }
      const lista = itens(); if (!lista.length) return;
      const at = lista.indexOf(document.activeElement as HTMLElement);
      const prox = e.key === 'ArrowDown' ? (at + 1) % lista.length
        : e.key === 'ArrowUp' ? (at - 1 + lista.length) % lista.length
        : e.key === 'Home' ? 0 : e.key === 'End' ? lista.length - 1 : -1;
      if (prox >= 0) { e.preventDefault(); lista[prox]?.focus(); }
    };
    document.addEventListener('keydown', tecla, true);
    return () => document.removeEventListener('keydown', tecla, true);
  }, [aberto, gatilho, menu]);
}
const icMenu = (corpo: ReactNode) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false">{corpo}</svg>
);
const IcConta = () => icMenu(<><circle cx="12" cy="8.5" r="3.5" /><path d="M5.5 19.5c.8-3.3 3.3-5 6.5-5s5.7 1.7 6.5 5" /></>);
const IcTeclado = () => icMenu(<><rect x="2.5" y="6" width="19" height="12" rx="2" /><path d="M6.5 10h.01M10 10h.01M14 10h.01M17.5 10h.01M7.5 14h9" /></>);
const IcTemaClaro = () => icMenu(<><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19" /></>);
const IcTemaEscuro = () => icMenu(<path d="M20 14.5A8 8 0 0 1 9.5 4 7 7 0 1 0 20 14.5z" />);
const IcMais = () => icMenu(<path d="M12 5v14M5 12h14" />);

/* ---------------- Paleta de busca global (⌘K) ----------------
   A barra do topo abre um spotlight de verdade. Na ALFA (crítica 12/11) ela cobre o sistema da pessoa:
   as SEÇÕES dos ambientes que ela tem (agrupadas por ambiente, o atual primeiro — mesmo filtro de papel
   da barra), os CLIENTES da Gestão por nome, CPF ou telefone (só para quem tem Cobranças) e as AÇÕES
   (trocar de ambiente, tema, nova cobrança). Apelidos acham a seção pelo nome que a pessoa usa
   ("whatsapp" → Conversas, "usuários" → Configurações); quem começa pelo termo vem antes de quem só o
   contém; o trecho encontrado fica em destaque. Enter/clique abre; escolher um cliente entrega a busca
   pronta para a Gestão via sessionStorage ('alfa_paleta_busca'). Monta só enquanto aberta — a query dos
   clientes não pesa o shell nas telas que não precisam dela. */
const semAcentoPal = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const soDigitos = (s: string) => s.replace(/\D/g, '');
const d2 = (n: number) => String(n).padStart(2, '0');
type SecaoPaleta = { slug: string; rotulo: string; grupo: string };
type GrupoPaleta = { id: string; rotulo: string; secoes: SecaoPaleta[] };
type AcaoPaleta = { id: string; rotulo: string; meta?: string; icone: ReactNode; apelidos?: string[]; executar: () => void };
type ItemPaleta =
  | { tipo: 'secao'; grupoId: string; grupoRotulo: string; slug: string; rotulo: string; grupo: string; nota: number }
  | { tipo: 'cliente'; id: string; nome: string; comercial: string; dia: number; nota: number }
  | { tipo: 'acao'; acao: AcaoPaleta; nota: number };
/* apelidos: o nome que a pessoa digita para chegar a uma seção (sem acento, minúsculo) */
const APELIDOS: Record<string, string[]> = {
  'cobrancas/painel': ['inicio', 'resumo', 'visao geral', 'indicadores'],
  'cobrancas/atendentes': ['comerciais', 'equipe', 'vendedores'],
  'cobrancas/planilha': ['planilha', 'clientes', 'carteira', 'gestao'],
  'cobrancas/novos': ['novo cliente', 'debito', 'aprovacao', 'cadastro'],
  'cobrancas/cancelados': ['cancelamento', 'reativar'],
  'cobrancas/financeiro': ['pagamentos', 'comprovantes', 'confirmacao'],
  'cobrancas/calendario': ['agenda', 'vencimentos', 'ciclos'],
  'cobrancas/avisos': ['comunicados', 'recados'],
  'cobrancas/regua': ['mensagens automaticas', 'automacao', 'lembretes'],
  'cobrancas/conversas': ['whatsapp', 'mensagens', 'chat'],
  'cobrancas/numeros': ['chips', 'telefones', 'whatsapp', 'conexao'],
  'cobrancas/envios': ['disparos', 'fila', 'mensagens enviadas'],
  'cobrancas/analise': ['inss', 'extrato', 'margem'],
  'cobrancas/registros': ['auditoria', 'historico', 'log'],
  'cobrancas/usuarios': ['equipe', 'acessos', 'permissoes', 'senhas'],
  whatsapp: ['whatsapp', 'inbox', 'chat', 'mensagens', 'atendimento'],
  presenciais: ['agenda', 'visitas', 'atendimento presencial'],
  tarefas: ['afazeres', 'pendencias', 'lembretes', 'checklist', 'prazos'],
  scripts: ['respostas prontas', 'modelos', 'textos'],
  'chat-equipe': ['chat interno', 'equipe', 'colegas', 'recado', 'mensagem para colega', 'grupo'],
  kanban: ['funil', 'quadro', 'vendas', 'pipeline'],
  dashboard: ['indicadores', 'metricas', 'relatorios', 'campanhas'],
  'ferramentas/unificador': ['pdf', 'juntar', 'documentos'],
  'ferramentas/conversor': ['converter', 'arquivos', 'imagem'],
  'ferramentas/coletor-inss': ['inss', 'extrato', 'coletor'],
  configuracoes: ['usuarios', 'conta', 'preferencias', 'canais', 'notificacoes', 'ajustes', 'senha'],
};
/* nota de um texto para o termo (menor = melhor): 0 começa pelo termo · 1 uma palavra começa pelo termo ·
   2 contém · 3 só pelo apelido · -1 não casa */
function notaDoTexto(texto: string, t: string, apelidos?: string[]): number {
  const n = semAcentoPal(texto);
  if (n.startsWith(t)) return 0;
  if (n.includes(' ' + t)) return 1;
  if (n.includes(t)) return 2;
  if (apelidos?.some((a) => a.startsWith(t) || a.includes(' ' + t) || (t.length >= 3 && a.includes(t)))) return 3;
  return -1;
}
/* o trecho encontrado em destaque (o começo de palavra ganha do meio); o texto original segue intacto */
function destacar(texto: string, termo: string): ReactNode {
  const t = semAcentoPal(termo.trim());
  if (!t) return texto;
  const mapa: number[] = [];
  let norm = '';
  for (let i = 0; i < texto.length; i++) {
    const c = semAcentoPal(texto[i]);
    for (let k = 0; k < c.length; k++) mapa.push(i);
    norm += c;
  }
  let at = norm.startsWith(t) ? 0 : norm.indexOf(' ' + t);
  at = at > 0 ? at + 1 : at === 0 ? 0 : norm.indexOf(t);
  if (at < 0) return texto;
  const ini = mapa[at];
  const fim = mapa[at + t.length - 1] + 1;
  return <>{texto.slice(0, ini)}<b className="pal-hl">{texto.slice(ini, fim)}</b>{texto.slice(fim)}</>;
}

function PaletaBusca({ grupos, acoes, raiz, aoFechar, comClientes, alfa = false }: {
  grupos: GrupoPaleta[]; acoes: AcaoPaleta[]; raiz: HTMLElement; aoFechar: () => void; comClientes: boolean; alfa?: boolean;
}) {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [ativo, setAtivo] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listaRef = useRef<HTMLDivElement>(null);
  // ao abrir, o foco vai para o campo; ao fechar, volta para onde estava (o item Buscar, por exemplo)
  useEffect(() => {
    const antes = document.activeElement as HTMLElement | null;
    inputRef.current?.focus();
    return () => { if (antes && antes.isConnected && antes !== document.body) antes.focus({ preventScroll: true }); };
  }, []);
  useEffect(() => { setAtivo(0); }, [q]);

  // clientes = a MESMA query da Gestão (chave compartilhada → cache aproveitado). Quem decide é o
  // shell (`comClientes`): só para quem tem Cobranças — quem é só do Atendimento nunca busca a carteira
  const clientesQ = useQuery<Dados>({
    queryKey: chavesCobranca.dados,
    queryFn: () => getCobrancaRepo().carregar(),
    enabled: comClientes,
  });

  const termo = q.trim();
  const tNorm = semAcentoPal(termo);
  const tDig = soDigitos(termo);
  // seções: cada ambiente na sua ordem (o atual primeiro); com termo, as que casam, melhor nota primeiro
  const secoesVistas: ItemPaleta[] = grupos.flatMap((g) => {
    const itens = g.secoes.map((sc, i) => ({ sc, i, nota: termo ? notaDoTexto(sc.rotulo, tNorm, APELIDOS[sc.slug]) : 0 }))
      .filter((x) => x.nota >= 0)
      .sort((a, b) => a.nota - b.nota || a.i - b.i);
    return itens.map(({ sc, nota }) => ({ tipo: 'secao' as const, grupoId: g.id, grupoRotulo: g.rotulo, slug: sc.slug, rotulo: sc.rotulo, grupo: sc.grupo, nota }));
  });
  const clientes = useMemo<ItemPaleta[]>(() => {
    if (!comClientes || !termo) return [];
    const achados: { it: ItemPaleta; nome: string }[] = [];
    for (const l of clientesQ.data?.linhas ?? []) {
      let nota = notaDoTexto(l.nome, tNorm);
      if (nota === 3) nota = -1;
      // CPF/telefone só por DÍGITOS (3+ para não casar o mundo inteiro com "1")
      if (nota < 0 && tDig.length >= 3 && (soDigitos(l.cpf).includes(tDig) || soDigitos(l.telefone).includes(tDig))) nota = 3;
      if (nota < 0) continue;
      achados.push({ it: { tipo: 'cliente', id: l.id, nome: l.nome, comercial: l.comercial, dia: l.dia, nota }, nome: l.nome });
    }
    return achados.sort((a, b) => a.it.nota - b.it.nota || a.nome.localeCompare(b.nome, 'pt-BR')).slice(0, 8).map((a) => a.it);
  }, [comClientes, termo, tNorm, tDig, clientesQ.data]);
  const acoesVistas: ItemPaleta[] = acoes
    .map((a, i) => ({ a, i, nota: termo ? notaDoTexto(a.rotulo, tNorm, a.apelidos) : 0 }))
    .filter((x) => x.nota >= 0)
    .sort((x, y) => x.nota - y.nota || x.i - y.i)
    .map(({ a, nota }) => ({ tipo: 'acao' as const, acao: a, nota }));

  // blocos (cada ambiente, Clientes, Ações) na ordem de sempre; com termo, o bloco com o melhor acerto sobe
  // (quem digita "mar" quer o Marcelo antes de uma seção achada só pelo apelido)
  const blocos: ItemPaleta[][] = [];
  for (const it of [...secoesVistas, ...clientes, ...acoesVistas]) {
    const ult = blocos[blocos.length - 1];
    const chave = (x: ItemPaleta) => (x.tipo === 'secao' ? 's:' + x.grupoId : x.tipo);
    if (ult && chave(ult[0]) === chave(it)) ult.push(it); else blocos.push([it]);
  }
  const melhor = (b: ItemPaleta[]) => Math.min(...b.map((x) => x.nota));
  const itens: ItemPaleta[] = (termo ? blocos.map((b, i) => ({ b, i })).sort((x, y) => melhor(x.b) - melhor(y.b) || x.i - y.i).map((x) => x.b) : blocos).flat();
  const at = itens.length ? Math.min(ativo, itens.length - 1) : 0;
  useEffect(() => { listaRef.current?.querySelector('.pal-item.on')?.scrollIntoView({ block: 'nearest' }); }, [at]);

  const abrir = (it: ItemPaleta) => {
    aoFechar();
    if (it.tipo === 'secao') { navigate('/' + it.slug); return; }
    if (it.tipo === 'acao') { it.acao.executar(); return; }
    // handoff: a Gestão consome a chave no mount — ou pelo evento, se já estiver aberta
    try { sessionStorage.setItem('alfa_paleta_busca', it.nome); } catch { /* sem storage: só navega */ }
    navigate('/cobrancas/planilha');
    window.dispatchEvent(new Event('alfa_paleta_busca'));
  };
  const aoTeclar = (e: RKeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') { e.preventDefault(); aoFechar(); return; }
    // ALFA (como a referência): o Tab fica dentro da busca — o campo e o fechar; os resultados vão nas setas
    if (alfa && e.key === 'Tab') {
      const paradas = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('.pal-inp, .pal-fechar'));
      const at = paradas.indexOf(document.activeElement as HTMLElement);
      e.preventDefault();
      paradas[(at + (e.shiftKey ? -1 : 1) + paradas.length) % paradas.length]?.focus();
      return;
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); setAtivo(Math.min(at + 1, Math.max(0, itens.length - 1))); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); setAtivo(Math.max(at - 1, 0)); return; }
    if (e.key === 'Enter' && itens[at]) { e.preventDefault(); abrir(itens[at]); }
  };
  // o cabeçalho de cada bloco: o nome do ambiente (seções), "Clientes" ou "Ações"
  const chaveBloco = (it: ItemPaleta) => (it.tipo === 'secao' ? 's:' + it.grupoId : it.tipo);
  const rotuloBloco = (it: ItemPaleta) => (it.tipo === 'secao' ? (grupos.length > 1 || alfa ? it.grupoRotulo : 'Seções') : it.tipo === 'cliente' ? 'Clientes' : 'Ações');
  const marcador = comClientes
    ? (acoes.length ? 'Buscar seção, cliente (nome, CPF, telefone) ou ação…' : 'Buscar cliente (nome, CPF, telefone) ou seção…')
    : (acoes.length ? 'Buscar seção ou ação…' : 'Buscar seção…');

  return createPortal(
    <div className="pal-veu" onMouseDown={(e) => { if (e.target === e.currentTarget) aoFechar(); }}>
      <div className="pal-caixa" role="dialog" aria-modal="true" aria-label="Busca global" onKeyDown={aoTeclar}>
        <div className="pal-topo">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" />
          </svg>
          <input ref={inputRef} className="pal-inp" type="text" value={q} onChange={(e) => setQ(e.target.value)}
            placeholder={marcador} aria-label="Buscar" autoComplete="off" spellCheck={false} />
          {alfa ? (
            <>
              <kbd onClick={aoFechar} aria-hidden>ESC</kbd>
              <button type="button" className="pal-fechar" onClick={aoFechar} aria-label="Fechar a busca"><IcFechar /></button>
            </>
          ) : <kbd>Esc</kbd>}
        </div>
        <div className="pal-lista" ref={listaRef}>
          {itens.map((it, i) => {
            const cabecalho = i === 0 || chaveBloco(itens[i - 1]) !== chaveBloco(it);
            const chave = it.tipo === 'secao' ? 's-' + it.slug : it.tipo === 'cliente' ? 'c-' + it.id : 'a-' + it.acao.id;
            return (
              <Fragment key={chave}>
                {cabecalho && <div className="pal-glabel">{rotuloBloco(it)}</div>}
                <button type="button" className={i === at ? 'pal-item on' : 'pal-item'} tabIndex={alfa ? -1 : undefined}
                  onMouseEnter={() => setAtivo(i)} onClick={() => abrir(it)}>
                  <span className="pal-ico" aria-hidden>{it.tipo === 'secao' ? iconeDoItem(it.slug) : it.tipo === 'cliente' ? COB_ICONES.clientes : it.acao.icone}</span>
                  {it.tipo === 'secao' ? (
                    <>
                      <span className="pal-nome">{destacar(it.rotulo, termo)}</span>
                      <span className="pal-meta">{it.grupo}</span>
                    </>
                  ) : it.tipo === 'cliente' ? (
                    <>
                      <span className="pal-nome">{destacar(it.nome, termo)}</span>
                      <span className="pal-meta">{(it.comercial || '—') + ' · ' + (it.dia > 0 ? 'D' + d2(it.dia) : 'Sem ciclo')}</span>
                    </>
                  ) : (
                    <>
                      <span className="pal-nome">{destacar(it.acao.rotulo, termo)}</span>
                      {it.acao.meta && <span className="pal-meta">{it.acao.meta}</span>}
                    </>
                  )}
                </button>
              </Fragment>
            );
          })}
          {comClientes && termo !== '' && clientesQ.isLoading && <div className="pal-vazio">Carregando clientes…</div>}
          {itens.length === 0 && !(comClientes && termo !== '' && clientesQ.isLoading) && (
            <div className="pal-vazio">Nada encontrado para “{termo}”.</div>
          )}
        </div>
        <div className="pal-rodape">↑ ↓ navegam · Enter abre · Esc fecha</div>
      </div>
    </div>,
    raiz,
  );
}

/* Página não encontrada DENTRO da moldura (ALFA, pessoa logada — crítica 12/11): a barra e o topo
   continuam, o palco diz o que houve e leva de volta ao início do ambiente da pessoa */
const IcBussola = () => (
  <svg className="ic-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="12" cy="12" r="8.5" /><path d="m15.2 8.8-1.9 4.5-4.5 1.9 1.9-4.5z" />
  </svg>
);
function PaginaNaoEncontrada({ home, rotuloHome }: { home: string; rotuloHome: string }) {
  const navigate = useNavigate();
  return (
    <div className="ba-404">
      <EstadoVazio icone={<IcBussola />} titulo="Página não encontrada"
        descricao="O endereço acessado não existe ou foi movido."
        acao={{ rotulo: rotuloHome, onClick: () => navigate(home) }} />
    </div>
  );
}

/** Shell autenticado v2: barra lateral (ALFA: BarraAlfa — aberta/trilho/gaveta; Atenvo: cápsula em overlay 64→242 no hover), topbar e palco.
 *  `naoEncontrada`: a rota não existe — a NaoEncontrada monta o shell assim para quem está logado (ALFA). */
export default function AppShellV2({ naoEncontrada = false }: { naoEncontrada?: boolean } = {}) {
  const { user, signOut } = useAuth();
  const { currentOrg } = useOrg();
  const location = useLocation();
  // NÚMEROS QUE SOBEM ao entrar em cada tela (dono 21/11: "faz em tudo que tenha número") — antes de pintar,
  // para o valor final não piscar; a peça ignora telefone, data, planilha e conversas (lib/numerosSobem.ts)
  const numerosRef = useRef<ReturnType<typeof instalarNumerosSobem> | null>(null);
  useLayoutEffect(() => {
    if (!ALFA || typeof document === 'undefined') return;
    if (!numerosRef.current) {
      const palco = document.querySelector<HTMLElement>('.v2 .palco');
      if (palco) numerosRef.current = instalarNumerosSobem(palco);
    }
    numerosRef.current?.navegou(location.pathname);
  }, [location.pathname, location.search]);
  useEffect(() => () => { numerosRef.current?.parar(); numerosRef.current = null; }, []);
  const navigate = useNavigate();

  useEffect(() => instalarSpotlight(), []);
  useEffect(() => instalarRolagemSemHover(), []); // movimento.css: lista rolando = hover seco

  /* Trava o scroll da JANELA sob o shell (bug do dono: deep-links conversa↔kanban
     disparavam scrollIntoView que rolava o body — topbar sumia, o toast de
     notificação aparecia cortado e sobrava faixa branca embaixo). O app é um
     layout fixo de 100vh; a janela nunca deve rolar. */
  useEffect(() => {
    const html = document.documentElement, body = document.body;
    const prev = [html.style.overflow, body.style.overflow] as const;
    html.style.overflow = 'hidden'; body.style.overflow = 'hidden';
    window.scrollTo(0, 0);
    return () => { html.style.overflow = prev[0]; body.style.overflow = prev[1]; };
  }, []);

  const [notif, setNotif] = useState<(DadosNotificacao & { conversaId?: string }) | null>(null);
  const [sinoOn, setSinoOn] = useState(false);
  const [badgePop, setBadgePop] = useState(0);
  const [menuUsuario, setMenuUsuario] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number }>({ top: 60, right: 20 });
  const menuUsuarioRef = useRef<HTMLDivElement>(null);
  const painelNotifRef = useRef<HTMLDivElement>(null);
  const [atalhosAbertos, setAtalhosAbertos] = useState(false);

  // Tema dual: escolha explícita do usuário, persistida por usuário; padrão dark.
  const escopoTema = user?.id ?? undefined;
  // moldura preta (dono 19/11): quem ainda não escolheu o tema abre no CLARO (o conteúdo branco da referência)
  // 21/11: a referência nova é escura (preto + cinza grafite) — quem ainda não escolheu abre no escuro; o claro
  // (branco + branco mais escuro) fica a um clique, e a escolha gravada continua valendo
  const temaPadrao: Tema = 'dark';
  const [tema, setTema] = useState<Tema>(() => lerTema(escopoTema, temaPadrao));
  useEffect(() => { setTema(lerTema(escopoTema, temaPadrao)); }, [escopoTema]); // eslint-disable-line react-hooks/exhaustive-deps // recarrega a preferência quando o usuário resolve

  useEffect(() => { aplicarTema(tema); }, [tema]);
  // valor explícito (a intro do dia escolhe direto); o toggle da topbar cicla por cima
  const definirTema = useCallback((novo: Tema) => {
    setTema(novo);
    salvarTema(novo, escopoTema);
  }, [escopoTema]);
  const alternarTema = useCallback(() => {
    definirTema(tema === 'dark' ? 'light' : 'dark');
  }, [definirTema, tema]);
  const seqRef = useRef(0);
  const avatarRef = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const fundoRef = useRef<HTMLDivElement>(null);
  // will-change com disciplina (Modo de Performance): promove camada SÓ enquanto
  // a transição de abrir/fechar roda (clip-path no host, transform no fundo) e
  // remove ao terminar — camada permanente custa memória de GPU justo nas
  // máquinas fracas. (No Modo Leve transition:none → nunca liga, e está certo.)
  useEffect(() => {
    const instala = (el: HTMLElement | null, prop: string) => {
      if (!el) return () => {};
      const liga = (e: TransitionEvent) => { if (e.target === el && e.propertyName === prop) el.style.willChange = prop; };
      const desliga = (e: TransitionEvent) => { if (e.target === el && e.propertyName === prop) el.style.willChange = ''; };
      el.addEventListener('transitionrun', liga);
      el.addEventListener('transitionend', desliga);
      el.addEventListener('transitioncancel', desliga);
      return () => {
        el.removeEventListener('transitionrun', liga);
        el.removeEventListener('transitionend', desliga);
        el.removeEventListener('transitioncancel', desliga);
      };
    };
    const desinstalar = [instala(sidebarRef.current, 'clip-path'), instala(fundoRef.current, 'transform')];
    return () => { desinstalar.forEach((d) => d()); };
  }, []);
  // A lista da sidebar rola em telas baixas. Recolhida (rail de ícones) ela não deve
  // ficar parada onde o mouse a deixou: volta ao topo, ou só o necessário para o
  // item ativo aparecer. Calculado à mão — scrollIntoView rolaria também a página.
  const navRef = useRef<HTMLElement>(null);
  const alinharNav = useCallback(() => {
    const n = navRef.current;
    if (!n) return;
    const ativo = n.querySelector<HTMLElement>('.item.on');
    const fimAtivo = ativo ? ativo.offsetTop - n.offsetTop + ativo.offsetHeight : 0;
    n.scrollTop = Math.max(0, fimAtivo - n.clientHeight + 24);
  }, []);
  // (o efeito que chama o alinharNav fica depois do filtro dos itens — ver chaveNav)
  const fecharNotif = useCallback(() => setNotif(null), []);
  // raiz de portal (regra 10): o menu monta no body, fora do stacking context da topbar
  // (que tem backdrop-filter) — senão o conteúdo do palco pinta por cima dele. Shell monta 1×.
  const raizMenu = useMemo(() => criarRaizPortalV2(document) as unknown as HTMLElement, []);
  const abrirMenuUsuario = useCallback(() => {
    const r = avatarRef.current?.getBoundingClientRect();
    if (r) setMenuPos({ top: Math.round(r.bottom + 8), right: Math.round(window.innerWidth - r.right) });
    setMenuUsuario((v) => !v);
  }, []);
  // sino: central de notificações PERSISTIDA (tabela notificacoes, F2 do remarketing).
  // O clique abre o painel; o pulso/contador de inbound segue sendo zerado aqui.
  const [painelNotif, setPainelNotif] = useState(false);
  // no celular (≤760px) o painel ocupa a largura da tela com 12px de cada lado (ancorado no sino, saía pela borda esquerda)
  const [notifPos, setNotifPos] = useState<{ top: number; right: number; left?: number }>({ top: 60, right: 60 });
  const sinoRef = useRef<HTMLButtonElement>(null);
  const papelQ = usePapel();
  const papelSessao = papelQ.data;
  // AMBIENTES (dono 11/11): "nem todo mundo do atendimento vai ter acesso a cobranças".
  // `temCob` = a pessoa CONFIRMADAMENTE tem Cobranças (perfil carregado). Enquanto o perfil não
  // chega, é false: nada da Cobrança (clientes na busca, sino, conversas) é buscado para quem
  // talvez seja só do Atendimento. Fora da Reviza (demo ALFA/Atenvo) vale sempre.
  const temCob = !isRevizaMode || !!papelSessao?.ambientes.includes('cobrancas');
  // configuração inicial pendente: o assistente cobra a mensalidade — o LicencaGate fica desmontado
  const configPendente = useConfiguracaoPendente();
  // fonte do sino: Cobranças (Reviza real + demo ALFA) usa a central própria —
  // confirmações do financeiro, avisos e mensagens; Atenvo segue no remarketing.
  // Quem é só do Atendimento não recebe nada da Cobrança (o sino do Atenvo segue desligado na Reviza).
  const fonteCob = isRevizaMode || isDemoMode;
  const notifsAtenvoQ = useNotificacoes();
  const notifsCobQ = useNotificacoesCob(fonteCob && temCob);
  const marcarAtenvo = useMarcarNotificacao();
  const marcarCob = useMarcarNotifCob();
  // os avisos do Atendimento (atd_notificacoes: @ numa nota, cliente esperando além da meta) no mesmo sino (25/11)
  const temAtdSino = isRevizaMode && temRecurso('atendimento') && !!papelSessao?.ambientes.includes('atendimento');
  const notifsAtdQ = useNotificacoesAtendimento(temAtdSino);
  const marcarAtd = useMarcarNotificacaoAtendimento();
  const marcarNotif = fonteCob ? {
    mutate: (a: { id?: string; todas?: boolean }) => {
      if (a.todas) { if (temCob) marcarCob.mutate(a); if (temAtdSino) marcarAtd.mutate(a); return; }
      if (a.id?.startsWith(PREFIXO_ATD)) marcarAtd.mutate(a); else marcarCob.mutate(a);
    },
  } : marcarAtenvo;
  // sintética de WhatsApp só pra quem TEM a seção Conversas na matriz (financeiro/cadastro ficam fora)
  const veConversas = isRevizaMode && temCob && papelSessao?.papel != null && papelSessao.papel !== 'financeiro' && papelSessao.papel !== 'cadastro';
  const conversasWa = useConversasWA(veConversas).data ?? [];
  const waNaoLidas = conversasWa.reduce((s, c) => s + (c.nao_lidas || 0), 0);
  const avisosNaoLidosSino = useAvisosNaoLidos(temCob).data ?? 0;
  const notifsBase: Notificacao[] = fonteCob
    ? [...(temCob ? (notifsCobQ.data ?? []) : []), ...(temAtdSino ? (notifsAtdQ.data ?? []) : [])].sort((a, b) => (b.criadoEm || '').localeCompare(a.criadoEm || ''))
    : (notifsAtenvoQ.data ?? []);
  // linhas agregadas (não são "marcáveis" — somem quando lidas na origem)
  const sinteticas: Notificacao[] = fonteCob && temCob ? [
    ...(avisosNaoLidosSino > 0 ? [{ id: 'sn-avisos', tipo: 'avisos', titulo: `${avisosNaoLidosSino} aviso${avisosNaoLidosSino === 1 ? '' : 's'} do administrativo`, corpo: 'Clique para abrir os Avisos.', rota: '/cobrancas/avisos', lidaEm: null, criadoEm: new Date().toISOString() }] : []),
    ...(waNaoLidas > 0 ? [{ id: 'sn-wa', tipo: 'mensagens', titulo: `${waNaoLidas} mensage${waNaoLidas === 1 ? 'm' : 'ns'} não lida${waNaoLidas === 1 ? '' : 's'} no WhatsApp`, corpo: 'Clique para abrir as Conversas.', rota: '/cobrancas/conversas', lidaEm: null, criadoEm: new Date().toISOString() }] : []),
  ] : [];
  const notifsLista: Notificacao[] = [...sinteticas, ...notifsBase];
  const naoLidas = notifsLista.filter((n) => !n.lidaEm).length;
  // "Marcar todas" só quando há não lida REAL — as agregadas somem lendo na origem
  const naoLidasReais = notifsBase.filter((n) => !n.lidaEm).length;
  const abrirNotificacoes = useCallback(() => {
    const r = sinoRef.current?.getBoundingClientRect();
    if (r) setNotifPos(window.innerWidth <= LARGURA_CELULAR
      ? { top: Math.round(r.bottom + 8), right: 12, left: 12 }
      : { top: Math.round(r.bottom + 8), right: Math.round(window.innerWidth - r.right) });
    setSinoOn(false); setBadgePop(0); setPainelNotif((v) => !v);
  }, []);
  useEffect(() => { setPainelNotif(false); }, [location.pathname]);
  // avatar: menu de usuário real — Configurações (rota v2) + Sair (signOut do v1, como a Topbar antiga).
  const sair = useCallback(async () => { setMenuUsuario(false); await signOut(); navigate('/login', { replace: true }); }, [signOut, navigate]);
  // fecha o menu ao trocar de rota
  useEffect(() => { setMenuUsuario(false); }, [location.pathname]);
  const fecharMenuUsuario = useCallback(() => setMenuUsuario(false), []);
  const fecharPainelNotif = useCallback(() => setPainelNotif(false), []);
  useMenuTeclado(menuUsuario, fecharMenuUsuario, avatarRef, menuUsuarioRef);
  useMenuTeclado(painelNotif, fecharPainelNotif, sinoRef, painelNotifRef);

  // Fiação realtime (dívida da 1b, quitada na sessão do WhatsApp): o feed
  // postgres_changes já usado pelo app alimenta o toast — só mensagem de
  // cliente, nunca com a conversa aberta e focada; badge pulsa a cada inbound.
  useNotificacaoInbound({
    aoBadge: useCallback(() => { setBadgePop((n) => n + 1); setSinoOn(true); }, []),
    aoNotificar: useCallback((d) => {
      seqRef.current += 1;
      setNotif({ ...d, seq: seqRef.current });
    }, []),
  });
  // ao abrir o Inbox, o não-visto foi visto: zera o contador e apaga o pulso do sino
  useEffect(() => {
    if (location.pathname.startsWith('/whatsapp')) { setBadgePop(0); setSinoOn(false); }
  }, [location.pathname]);

  // Botão de simulação (DEV): segue como fallback de demonstração do visual.
  function simularResposta() {
    seqRef.current += 1;
    setNotif({ ...NOTIF_DEMO, seq: seqRef.current });
    setBadgePop((n) => n + 1);
    setSinoOn(true);
  }

  // Reviza: mostra o NOME do usuário logado (do perfil), não o genérico "Equipe" (dono 15/09)
  const nome = (isRevizaMode ? papelSessao?.nome?.trim() : '') || user?.name?.trim() || 'Equipe';
  const papel = currentOrg ? (PAPEL_ROTULO[currentOrg.role] ?? currentOrg.role) : '—';
  const org = currentOrg?.name ?? 'ALFA GROUP';
  const admin = !currentOrg || currentOrg.role === 'admin';
  // Reviza: papel real decide quem vê o Financeiro (comercial não vê; fora da instância, todos);
  // papel "cadastro" só vê a tela Novos
  // Avisos do administrativo: contador de não lidos no item do menu (reviza real; demo usa a persona)
  const avisosNaoLidos = useAvisosNaoLidos(temCob).data ?? 0;
  // débito parado aguardando aprovação (dono 24/09): selo no "Novos" só pra quem aprova
  const pendentesAprovacao = usePendentesAprovacao(location.pathname.startsWith('/cobrancas') && !!papelSessao?.podeAprovar).data ?? 0;
  const podeVerFinanceiro = !isRevizaMode || papelSessao?.gestor || papelSessao?.papel === 'financeiro';
  const soCadastro = isRevizaMode && papelSessao?.papel === 'cadastro';
  // MATRIZ do dono (14/09; 27/09) — MESMA fonte do secaoLiberada de Cobrancas.tsx (data/cobranca/secoes.ts)
  const ehComercialR = isRevizaMode && papelSessao?.papel === 'comercial';
  const ehFinanceiroR = isRevizaMode && papelSessao?.papel === 'financeiro';
  const menuDoPapel = (slug: string) => slug.startsWith('cobrancas/') && secaoDoPapel(papelSessao?.papel, slug.slice('cobrancas/'.length));
  // filtro de papel dos itens do menu — FONTE ÚNICA também da paleta ⌘K
  // (a paleta nunca lista uma seção que o papel não veria na sidebar)
  // itens "admin" = só o administrador, nos dois ambientes — no Atendimento é o Dashboard, como no
  // Atenvo (visibilidade 22/10: as telas da equipe inteira são só do admin) e igual à rota (RequireRoleV2)
  // quem a Reviza sabe que NÃO tem Cobranças (perfil já carregado) não vê nenhum item da Cobrança
  const semCobConfirmado = isRevizaMode && papelSessao?.papel != null && !papelSessao.ambientes.includes('cobrancas');
  // ÁREAS da pessoa (22/11): dentro do que o papel alcança, o administrador escolhe as telas — menu e rota
  const areasSessao = isRevizaMode && papelSessao?.papel != null && papelSessao.papel !== 'admin' ? (papelSessao.areas ?? null) : null;
  const filtrarItensNav = (itens: ItemNav[]) => itens
    .filter((i) => !i.admin || admin)
    .filter((i) => areaLiberada(areasSessao, i.slug))
    .filter((i) => !i.slug.startsWith('cobrancas/') || !semCobConfirmado)
    // Reviza: Financeiro é restrito — comercial não vê o item
    .filter((i) => i.slug !== 'cobrancas/financeiro' || podeVerFinanceiro)
    // Reviza: matriz do dono — financeiro, comercial e cadastro só veem as suas seções
    // (só nos itens de Cobranças: o comercial que também atende vê o menu do Atendimento inteiro)
    .filter((i) => !i.slug.startsWith('cobrancas/') || !(ehFinanceiroR || ehComercialR || soCadastro) || menuDoPapel(i.slug));
  // cargo exibido: na Reviza usa o papel REAL do banco (o role da org é só admin/gestor/atendente)
  const ROTULO_REVIZA: Record<string, string> = { admin: 'Administrador', gestor: 'Gestor', comercial: 'Comercial', financeiro: 'Financeiro', cadastro: 'Cadastro', atendente: 'Atendente' };
  const cargo = isRevizaMode && papelSessao?.papel ? (ROTULO_REVIZA[papelSessao.papel] ?? papelSessao.papel) : papel;
  // o login como a pessoa digita na entrada (na Reviza: o usuário, sem o @reviza.local interno)
  const loginConta = (user?.email ?? '').replace(/@reviza\.local$/i, '');

  // Fase 2.0: troca de organização — só EXISTE para quem tem mais de um vínculo
  const [menuOrg, setMenuOrg] = useState(false);
  const [orgMenuPos, setOrgMenuPos] = useState({ top: 0, left: 0 });
  const tenantRef = useRef<HTMLButtonElement>(null);
  const abrirMenuOrg = useCallback(() => {
    const r = tenantRef.current?.getBoundingClientRect();
    if (r) setOrgMenuPos({ top: r.bottom + 6, left: r.left });
    // sempre TRUE (fechar é papel do backdrop/seleção): toggle com updater
    // (v => !v) morre no StrictMode dev, que invoca o updater 2× — !!v = v
    setMenuOrg(true);
  }, []);

  // MÓDULO ativo derivado da rota: /cobrancas* = Cobranças, senão Atendimento.
  // Trocar de módulo navega pra home do módulo (o menu da esquerda se refaz).
  // página não encontrada: o ambiente é o de início da pessoa (o primeiro que ela tem), não o da rota
  const ambientesPerfil = papelSessao?.papel != null ? papelSessao.ambientes : undefined;
  const moduloAtivo: ModuloId = naoEncontrada
    ? (isRevizaMode ? (MODULOS.find((m) => !ambientesPerfil || (ambientesPerfil as string[]).includes(m.id))?.id ?? 'cobrancas') : isDemoMode ? 'cobrancas' : MODULOS[0].id)
    : location.pathname.startsWith('/cobrancas') ? 'cobrancas' : ehRotaConfig(location.pathname) ? 'configuracoes' : 'atendimento';
  // DEMO da ALFA: Atendimento removido — só Cobranças.
  // AMBIENTES (dono 11/11): na Reviza o seletor mostra só os ambientes do perfil (admin = os dois; atendente =
  // só Atendimento; demais = o que o administrador marcou). Enquanto o perfil carrega, só o ambiente atual
  // (sem seta e sem redirecionar). Demo segue só Cobranças.
  // Perfil sem papel (falha ao ler o perfil, conta sem papel) = sem decisão de ambiente: fica como a
  // Reviza de antes (a página abre; os dados seguem protegidos pelo banco) — nunca uma tela em branco.
  const ambientesSessao = papelSessao?.papel != null ? papelSessao.ambientes : undefined;
  const modulosDisponiveis = isRevizaMode
    // Configurações é de todos (cada um vê nela o que é seu; o resto é só do administrador)
    // (se nesta instalação não sobra nada dela para a pessoa — ver config/recursos.ts —, o ambiente nem aparece)
    ? (ambientesSessao ? MODULOS.filter((m) => (m.id === 'configuracoes' ? m.grupos.some((g) => filtrarItensNav(g.itens).length > 0) : (ambientesSessao as string[]).includes(m.id))) : MODULOS.filter((m) => m.id === moduloAtivo))
    : isDemoMode ? MODULOS.filter((m) => m.id !== 'atendimento') : MODULOS;
  // ambiente da rota que a pessoa NÃO tem → vai pro primeiro que ela tem (ex.: atendente que caiu em /cobrancas)
  const semAcessoAoAmbiente = isRevizaMode && !!ambientesSessao && moduloAtivo !== 'configuracoes' && !(ambientesSessao as string[]).includes(moduloAtivo);
  // o início de um ambiente para ESTA pessoa: a home dele se ela a vê; senão, a primeira tela liberada
  const inicioDoModulo = (m: Modulo): string => {
    const itens = m.grupos.flatMap((g) => filtrarItensNav(g.itens));
    return itens.some((i) => `/${i.slug}` === m.home) ? m.home : itens[0] ? `/${itens[0].slug}` : m.home;
  };
  const moduloInicial = modulosDisponiveis.find((m) => m.id !== 'configuracoes' && m.grupos.some((g) => filtrarItensNav(g.itens).length > 0));
  const homeDaPessoa = moduloInicial ? inicioDoModulo(moduloInicial) : isRevizaMode && papelSessao?.papel != null && temRecurso('atendimento') ? '/config/conta' : '/cobrancas/painel';
  // a tela da rota foi tirada das áreas desta pessoa → volta ao início dela
  const areaBloqueada = !!areasSessao && !areaLiberada(areasSessao, areaDaRota(location.pathname) ?? '');
  // a conta e as preferências: na Reviza moram no ambiente Configurações (todos têm); no Atenvo, nas Configurações do Atendimento
  // ("Minha conta" é uma tela do Atendimento: sem ele no servidor desta instalação o menu fica como o Reviza de
  // sempre, só com Sair — a tela de trocar senha do Atenvo chama uma função que o banco do Reviza não tem)
  const temContaAtendimento = isRevizaMode ? temRecurso('atendimento') : modulosDisponiveis.some((m) => m.id === 'atendimento');
  const rotaDaConta = isRevizaMode ? '/config/conta' : '/configuracoes?tab=conta';
  // enquanto o perfil (e com ele os ambientes) não chegou, a página NÃO monta: sem isso a tela do
  // ambiente proibido pintava os dados por um instante (atendente via a Gestão de cobranças)
  const acessoCarregando = isRevizaMode && papelQ.isPending;
  // (23/11) a pessoa só tem o Atendimento e ele ainda não foi ligado nesta instalação: o aviso, nunca as Cobranças
  const aguardaAtendimento = isRevizaMode && !papelQ.isPending && papelSessao?.papel != null && !temRecurso('atendimento')
    && !!papelSessao.ambientesCadastro && !papelSessao.ambientesCadastro.includes('cobrancas');
  // a barra lateral desenha o ambiente para onde a pessoa VAI (sem piscar o menu do ambiente que ela não tem)
  const moduloDaBarra: ModuloId = semAcessoAoAmbiente ? (modulosDisponiveis[0]?.id ?? moduloAtivo) : moduloAtivo;
  const modulo = MODULOS.find((m) => m.id === moduloDaBarra) ?? MODULOS[0];
  // CHAT DA EQUIPE: o número de não lidas no item do menu — uma contagem leve + o tempo real (sem ele, a cada 30 s);
  // só para quem tem o Atendimento (quem é só das Cobranças nem consulta)
  const chatAtivo = chatEquipeLigado() && !acessoCarregando && modulosDisponiveis.some((m) => m.id === 'atendimento');
  const chatNaoLidas = useChatNaoLidas(chatAtivo).data ?? 0;
  // O QUE MUDOU: quantas novidades esta pessoa ainda não abriu (neste navegador); a página marca como vistas
  const [vistasTique, setVistasTique] = useState(0);
  useEffect(() => { const f = () => setVistasTique((x) => x + 1); window.addEventListener('reviza-novidades', f); return () => window.removeEventListener('reviza-novidades', f); }, []);
  const novidadesNovas = useMemo(() => naoVistas(novidadesPara(currentOrg?.role === 'admin', temRecurso), idsVistos()), [currentOrg?.role, vistasTique]); // eslint-disable-line react-hooks/exhaustive-deps
  // busca de CLIENTES na paleta ⌘K: só para quem tem Cobranças — na ALFA, de qualquer ambiente (a paleta cobre
  // o sistema da pessoa); quem é só do Atendimento nunca busca a carteira
  const buscaClientes = (isRevizaMode || isDemoMode) && temCob && !acessoCarregando && modulosDisponiveis.some((m) => m.id === 'cobrancas');

  // BARRA DA ALFA: aberta (260px) ou recolhida (trilho) — preferência deste aparelho, e o padrão
  // segue a largura da tela; no celular vira gaveta (o botão do topo abre por cima)
  const [prefBarra, setPrefBarra] = useState<'aberta' | 'trilho'>(() => lerPrefBarra() ?? 'aberta');
  const [largura, setLargura] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : LARGURA_ENCAIXE));
  useEffect(() => {
    if (!ALFA || typeof window === 'undefined') return;
    const ver = () => setLargura(window.innerWidth);
    window.addEventListener('resize', ver);
    return () => window.removeEventListener('resize', ver);
  }, []);
  // TELAS DE TRABALHO largas (WhatsApp, Kanban e Gestão de cobranças): mesmo na tela larga a barra começa
  // recolhida (trilho), como na tela média — a tela precisa da largura; a preferência salva não muda e vale
  // nas outras telas. O botão do topo abre a barra por cima do conteúdo.
  const telaDeTrabalho = TELAS_DE_TRABALHO.test(location.pathname);
  // BARRA FIXA (dono 21/11: "agora a barra do lado vai ser fixa"): com a moldura ela fica sempre aberta a partir
  // de 1100px, em todas as telas (inclusive WhatsApp, Kanban e Gestão); abaixo disso segue o trilho de ícones e,
  // no celular, a gaveta
  const barraFixa = ALFA && lerMoldura();
  const zonaTela = barraFixa
    ? (largura <= LARGURA_CELULAR ? 'gaveta' : largura < LARGURA_FIXA ? 'media' : 'larga')
    : zonaDaLargura(largura);
  const zonaBarra = !barraFixa && zonaTela === 'larga' && telaDeTrabalho ? 'media' : zonaTela;
  // por cima do conteúdo: a gaveta do celular ou o trilho aberto pelo botão (tela média). Fecha ao navegar.
  const [sobreposta, setSobreposta] = useState(false);
  useEffect(() => { setSobreposta(false); }, [location.pathname, zonaBarra]);
  const modoBarra: ModoBarra = zonaBarra === 'gaveta' ? 'gaveta' : zonaBarra === 'media' ? 'trilho' : barraFixa ? 'aberta' : prefBarra;
  const guardarPref = useCallback((prox: 'aberta' | 'trilho') => {
    setPrefBarra(prox);
    try { localStorage.setItem(CHAVE_BARRA, prox); } catch { /* sem storage: vale só nesta aba */ }
  }, []);
  const alternarBarra = useCallback(() => {
    if (zonaBarra !== 'larga') { setSobreposta((v) => !v); return; }
    guardarPref(prefBarra === 'aberta' ? 'trilho' : 'aberta');
  }, [zonaBarra, prefBarra, guardarPref]);
  const fecharSobreposta = useCallback(() => setSobreposta(false), []);
  // o botão do canto da barra quando ela está por cima: no trilho da tela larga, "manter aberta" (o botão do
  // topo fica coberto pela barra aberta pelo mouse); na tela média, recolher; no celular, fechar
  const acaoTopo: AcaoTopoBarra | null = modoBarra === 'gaveta'
    ? { rotulo: 'Fechar o menu', tipo: 'fechar', aoClicar: fecharSobreposta }
    : modoBarra === 'trilho' && zonaBarra === 'media'
      ? (sobreposta ? { rotulo: 'Recolher a barra lateral', tipo: 'recolher', aoClicar: fecharSobreposta } : null)
      : modoBarra === 'trilho' ? { rotulo: 'Manter a barra aberta', tipo: 'fixar', aoClicar: () => guardarPref('aberta') } : null;
  // os itens da barra: os MESMOS do menu (mesmo filtro de papel), com o ícone e o contador de cada um
  const itemDaBarra = (i: ItemNav): ItemBarra => ({
    slug: i.slug, rotulo: i.rotulo, icone: iconeDoItem(i.slug),
    // contador onde há trabalho: Conversas de Cobranças = mensagens não lidas (o mesmo número do sino)
    badge: i.slug === 'whatsapp' ? badgePop : i.slug === 'cobrancas/conversas' ? waNaoLidas : i.slug === 'cobrancas/avisos' ? avisosNaoLidos : i.slug === 'cobrancas/novos' ? pendentesAprovacao : i.slug === 'chat-equipe' ? chatNaoLidas : i.slug === 'novidades' ? novidadesNovas : undefined,
    badgeTitulo: i.slug === 'whatsapp' ? plural(badgePop, 'mensagem nova', 'mensagens novas')
      : i.slug === 'chat-equipe' ? plural(chatNaoLidas, 'mensagem da equipe não lida', 'mensagens da equipe não lidas')
      : i.slug === 'cobrancas/conversas' ? plural(waNaoLidas, 'mensagem não lida', 'mensagens não lidas')
      : i.slug === 'cobrancas/avisos' ? plural(avisosNaoLidos, 'aviso não lido', 'avisos não lidos')
      : i.slug === 'cobrancas/novos' ? `${pendentesAprovacao} aguardando aprovação` : undefined,
    atalho: i.slug === 'configuracoes' ? ',' : undefined,
  });
  const gruposBarra: GrupoBarra[] = modulo.grupos.filter((g) => !g.fixo)
    .map((g) => ({ rotulo: g.rotulo, itens: filtrarItensNav(g.itens).map(itemDaBarra) }))
    .filter((g) => g.itens.length > 0);
  const rodapeBarra: ItemBarra[] = modulo.grupos.filter((g) => g.fixo).flatMap((g) => filtrarItensNav(g.itens)).map(itemDaBarra);
  // ⌘, (Ctrl+, no Windows) abre Configurações — só onde o item está no pé (Atendimento), nunca digitando
  // num campo nem com a busca aberta
  const atalhoConfigRef = useRef(false);
  atalhoConfigRef.current = ALFA && !acessoCarregando && (isRevizaMode || rodapeBarra.some((i) => i.slug === 'configuracoes'));
  const inicioRef = useRef(inicioDoModulo);
  inicioRef.current = inicioDoModulo;
  const trocarModulo = useCallback((m: Modulo) => {
    setMenuOrg(false);
    navigate(inicioRef.current(m));
  }, [navigate]);

  // Paleta de busca global: a barra do topo abre de verdade (clique ou ⌘K/Ctrl+K)
  const [paletaAberta, setPaletaAberta] = useState(false);
  if (paletaAberta) atalhoConfigRef.current = false; // busca aberta: o Ctrl+, não troca a página por baixo dela
  const fecharPaleta = useCallback(() => setPaletaAberta(false), []);
  useEffect(() => {
    const aoTecla = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault(); setMenuUsuario(false); setPainelNotif(false); setPaletaAberta((v) => !v); return;
      }
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key === ',' && atalhoConfigRef.current && !e.repeat && !ehEditavel(e.target)) {
        e.preventDefault(); navigate(isRevizaMode ? inicioRef.current(MOD_CONFIG) : '/configuracoes');
      }
    };
    window.addEventListener('keydown', aoTecla);
    return () => window.removeEventListener('keydown', aoTecla);
  }, []);
  // seções da paleta = o menu de cada ambiente, com o MESMO filtro de papel da barra
  const secoesDoModulo = (m: Modulo): SecaoPaleta[] => m.grupos.flatMap((g) =>
    filtrarItensNav(g.itens).map((i) => ({ slug: i.slug, rotulo: i.rotulo, grupo: g.rotulo })));
  const secoesPaleta = secoesDoModulo(modulo);
  // ALFA: os ambientes que a pessoa TEM (o atual primeiro); Atenvo: só o do módulo ativo, como sempre
  const gruposPaleta: GrupoPaleta[] = (ALFA && !acessoCarregando ? [modulo, ...modulosDisponiveis.filter((m) => m.id !== modulo.id)] : [modulo])
    .map((m) => ({ id: m.id, rotulo: m.rotulo, secoes: secoesDoModulo(m) }))
    .filter((g) => g.secoes.length > 0);
  // AÇÕES (ALFA): nova cobrança (quem a vê no Painel), trocar de ambiente (quem tem os dois) e o tema
  const gestorOrg = currentOrg?.role === 'admin' || currentOrg?.role === 'gestor';
  const acoesPaleta: AcaoPaleta[] = !ALFA || acessoCarregando ? [] : [
    ...(gestorOrg && gruposPaleta.some((g) => g.secoes.some((sc) => sc.slug === 'cobrancas/novos'))
      ? [{ id: 'nova-cobranca', rotulo: 'Nova cobrança', meta: 'Cobranças', icone: <IcMais />, apelidos: ['novo cliente', 'cadastrar cliente', 'adicionar cliente'], executar: () => navigate('/cobrancas/novos') }]
      : []),
    ...modulosDisponiveis.filter((m) => m.id !== modulo.id).map((m) => ({
      id: 'amb-' + m.id, rotulo: `Trocar para ${m.rotulo}`, meta: 'Ambiente', icone: ICONE_AMBIENTE[m.id],
      apelidos: ['trocar de ambiente', 'mudar de ambiente', 'ambiente'], executar: () => trocarModulo(m),
    })),
    { id: 'tema', rotulo: tema === 'dark' ? 'Usar o tema claro' : 'Usar o tema escuro', meta: 'Aparência',
      icone: tema === 'dark' ? <IcTemaClaro /> : <IcTemaEscuro />, apelidos: ['tema', 'modo claro', 'modo escuro', 'aparencia', 'cores'], executar: alternarTema },
  ];
  // alinha a lista da sidebar ao trocar de rota E quando a lista muda: os itens do papel chegam
  // depois da 1ª pintura (ex.: Financeiro entra quando o papel carrega) e empurram o item ativo pra
  // baixo — em 1280×720 Avisos/Registros/Usuários ficavam escondidos no pé da cápsula
  const chaveNav = secoesPaleta.map((s) => s.slug).join('|');
  useEffect(() => {
    // clique num item com a sidebar aberta: não puxa a lista debaixo do mouse
    if (!sidebarRef.current?.matches(':hover')) alinharNav();
  }, [location.pathname, chaveNav, alinharNav]);

  // um item do menu (o mesmo render nos grupos da lista e no grupo fixo do pé)
  const itemNav = (i: ItemNav) => (
      <NavLink
        key={i.slug}
        to={`/${i.slug}`}
        className={({ isActive }) => (isActive ? 'item on' : 'item')}
        title={i.rotulo}
      >
        {iconeDoItem(i.slug)}
        <span className="lab">{i.rotulo}</span>
        {i.slug === 'whatsapp' && badgePop > 0 && (
          <span key={badgePop} className="badge-n lab pop num">{badgePop}</span>
        )}
        {i.slug === 'cobrancas/avisos' && avisosNaoLidos > 0 && (
          <span className="badge-n lab num">{avisosNaoLidos}</span>
        )}
        {i.slug === 'cobrancas/novos' && pendentesAprovacao > 0 && (
          <span className="badge-n lab num" title={`${pendentesAprovacao} aguardando aprovação`}>{pendentesAprovacao}</span>
        )}
        {i.slug === 'novidades' && novidadesNovas > 0 && (
          <span className="badge-n lab num" title={plural(novidadesNovas, 'novidade que você ainda não viu', 'novidades que você ainda não viu')}>{novidadesNovas}</span>
        )}
        {i.slug === 'chat-equipe' && chatNaoLidas > 0 && (
          <span className="badge-n lab num" title={plural(chatNaoLidas, 'mensagem da equipe não lida', 'mensagens da equipe não lidas')}>{chatNaoLidas}</span>
        )}
      </NavLink>
  );

  if (aguardaAtendimento) return <AtendimentoAguardando nome={papelSessao?.nome ?? null} aoSair={() => void sair()} />;

  return (
    <div className="v2 app-v2">
      <div className="luz" />
      <div className="grao" />
      <div className="p-app" data-barra={ALFA ? modoBarra : undefined} data-sobre={ALFA && sobreposta ? '' : undefined}>
        {ALFA ? (
          <BarraAlfa
            modo={modoBarra} sobreposta={sobreposta} aoFecharSobreposta={fecharSobreposta} acaoTopo={acaoTopo}
            org="Reviza CRM"
            ambientes={modulosDisponiveis.map((m) => ({ id: m.id, rotulo: m.rotulo, descricao: m.id === 'configuracoes' && !admin ? 'Sua conta e preferências' : DESCRICAO_AMBIENTE[m.id] }))}
            ambienteAtual={acessoCarregando ? null : { id: modulo.id, rotulo: modulo.rotulo }}
            aoTrocarAmbiente={(id) => { const m = MODULOS.find((x) => x.id === id); if (m) trocarModulo(m); }}
            carregando={acessoCarregando}
            grupos={gruposBarra} rodape={rodapeBarra}
            aoBuscar={() => setPaletaAberta(true)} buscaAberta={paletaAberta}
            aoSair={sair}
            conta={acessoCarregando ? null : { nome, cargo, iniciais: iniciaisDe(nome) }}
            versao={isRevizaMode && import.meta.env.VITE_BUILD_TS ? String(import.meta.env.VITE_BUILD_TS) : null}
          />
        ) : (<>
        <aside className="p-sidebar" ref={sidebarRef} onMouseLeave={alinharNav}>
          {/* marca + seletor de módulo numa linha só, como no Atenvo: recolhida, sobra
              só a marca no rail; aberta, módulo + organização ao lado */}
          <button ref={tenantRef} type="button" className="sb-topo" title={modulosDisponiveis.length > 1 ? `Módulo: ${modulo.rotulo} — clique para trocar` : modulo.rotulo}
            aria-haspopup={modulosDisponiveis.length > 1 ? 'menu' : undefined} aria-expanded={modulosDisponiveis.length > 1 ? menuOrg : undefined}
            onClick={modulosDisponiveis.length > 1 ? abrirMenuOrg : undefined} style={modulosDisponiveis.length > 1 ? undefined : { cursor: 'default' }}>
            <LogoAtenvo className="marca" />
            <span className="sb-topo-txt lab"><b>{acessoCarregando ? '\u00a0' : modulo.rotulo}</b><i>{org}</i></span>
            {modulosDisponiveis.length > 1 && (
              <svg className="sb-topo-seta lab" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M8 15l4 4 4-4M8 9l4-4 4 4" />
              </svg>
            )}
          </button>
          {menuOrg && createPortal(
            <>
              <div className="um-backdrop" onClick={() => setMenuOrg(false)} aria-hidden />
              <div className="usuario-menu org-troca" role="menu" aria-label="Trocar de módulo" style={{ top: orgMenuPos.top, left: orgMenuPos.left }}>
                <div className="um-head"><div className="um-cargo">Ir para</div></div>
                {modulosDisponiveis.map((m) => (
                  <button key={m.id} type="button" role="menuitemradio" aria-checked={m.id === moduloAtivo}
                    className={m.id === moduloAtivo ? 'um-item om-item on' : 'um-item om-item'}
                    onClick={() => trocarModulo(m)}>
                    <span className="om-dot" aria-hidden />
                    <span className="om-nome">{m.rotulo}</span>
                  </button>
                ))}
              </div>
            </>,
            raizMenu,
          )}
          <nav className="sb-nav" ref={navRef} aria-label="Navegação principal">
            {/* enquanto o perfil carrega, sem itens: o menu do ambiente da rota não pisca para quem não o tem */}
            {!acessoCarregando && modulo.grupos.filter((g) => !g.fixo).map((g) => {
              const itens = filtrarItensNav(g.itens);
              if (!itens.length) return null;
              return (
                <div className="grupo" key={g.rotulo}>
                  <div className="glabel lab">{g.rotulo}</div>
                  {itens.map(itemNav)}
                </div>
              );
            })}
          </nav>
          {!acessoCarregando && modulo.grupos.filter((g) => g.fixo).map((g) => {
            const itens = filtrarItensNav(g.itens);
            if (!itens.length) return null;
            return (
              <nav className="sb-fixo" key={g.rotulo} aria-label={g.rotulo}>
                {itens.map(itemNav)}
              </nav>
            );
          })}
          {import.meta.env.DEV && (
            <div className="dev-ferramentas">
              <button type="button" className="p-btn btn-sec btn-mini" onClick={simularResposta}>
                Simular resposta
              </button>
            </div>
          )}
          <div className="rodape-sb">
            <div className="avatar" title="Online">{iniciaisDe(nome)}<i className="avatar-on" aria-hidden /></div>
            <div className="rodape-txt lab">
              <div className="nome">{nome}</div>
              <div className="cargo">{cargo}</div>
            </div>
          </div>
          {isRevizaMode && import.meta.env.VITE_BUILD_TS && (
            <div className="sb-versao num" title="Versão do painel que você está usando agora. Se estiver diferente da mais nova, atualize a página.">
              Painel v{String(import.meta.env.VITE_BUILD_TS)}
            </div>
          )}
        </aside>
        {/* fundos do flutuante (como no Atenvo): .sb-rail = cápsula do estado recolhido;
            .sb-fundo = painel aberto em vidro (.vidro-pro); .sb-sombra = sombra da expansão.
            Irmãos do aside — fora do clip-path (que criaria um backdrop root sem blur). */}
        <div className="sb-rail" aria-hidden />
        <div className="sb-fundo vidro-pro" aria-hidden ref={fundoRef} />
        <div className="sb-sombra" aria-hidden />
        </>)}

        <main className="principal">
          <div className="p-topbar">
            {ALFA ? (
              <TopoAlfa modo={modoBarra} sobreposta={sobreposta} aoAlternar={alternarBarra}
                ambiente={acessoCarregando || semAcessoAoAmbiente ? '' : modulo.rotulo}
                inicioAmbiente={naoEncontrada || location.pathname !== modulo.home ? modulo.home : undefined}
                pagina={acessoCarregando || semAcessoAoAmbiente ? '' : naoEncontrada ? 'Página não encontrada' : tituloDaRota(location.pathname)} />
            ) : (
            /* barra de busca REAL: abre a paleta ⌘K (era um div decorativo) */
            <button type="button" className="busca" title="Buscar (⌘K)" aria-haspopup="dialog" aria-expanded={paletaAberta}
              onClick={() => setPaletaAberta(true)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" />
              </svg>
              <span className="busca-texto">{buscaClientes ? 'Buscar clientes e seções…' : 'Buscar seções do sistema…'}</span><kbd>⌘K</kbd>
            </button>
            )}
            <div className="top-dir">
              {(isRevizaMode || isDemoMode) && <BotaoDesfazer />}
              <button
                type="button" className="ib"
                aria-label={tema === 'dark' ? 'Mudar para o tema claro' : 'Mudar para o tema escuro'}
                title={tema === 'dark' ? 'Tema claro' : 'Tema escuro'}
                onClick={alternarTema}
              >
                {tema === 'dark' ? <IconeSol /> : <IconeLua />}
              </button>
              <button ref={sinoRef} type="button" className="ib" aria-label="Notificações" title="Notificações" aria-haspopup="menu" aria-expanded={painelNotif} onClick={abrirNotificacoes}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                  <path d="M18 9a6 6 0 10-12 0c0 6-2.5 7-2.5 7h17S18 15 18 9zM10 20a2.2 2.2 0 004 0" />
                </svg>
                <span className={sinoOn || naoLidas > 0 ? 'pt on' : 'pt'} aria-hidden />
              </button>
              {painelNotif && createPortal(
                <>
                  <div className="um-backdrop" onClick={() => setPainelNotif(false)} aria-hidden />
                  <div ref={painelNotifRef} tabIndex={-1} className={notifPos.left != null ? 'usuario-menu notif-panel cel' : 'usuario-menu notif-panel'} role="menu" aria-label="Notificações"
                    style={{ top: notifPos.top, right: notifPos.right, left: notifPos.left }}>
                    <div className="np-head">
                      <b>Notificações</b>
                      {naoLidasReais > 0 && (
                        <button type="button" role="menuitem" className="np-todas" onClick={() => marcarNotif.mutate({ todas: true })}>Marcar todas como lidas</button>
                      )}
                    </div>
                    {notifsLista.length === 0 ? (
                      <div className="np-vazio">{fonteCob
                        ? (temCob ? 'Nenhuma notificação ainda. Confirmações do financeiro, avisos do administrativo e mensagens aparecem aqui.' : 'Nenhuma notificação ainda.')
                        : 'Nenhuma notificação ainda. Quando a Central de Remarketing identificar algo, aparece aqui.'}</div>
                    ) : notifsLista.slice(0, 20).map((n) => (
                      <button key={n.id} type="button" role="menuitem" className={'np-item' + (n.lidaEm ? '' : ' nova')}
                        onClick={() => { setPainelNotif(false); if (!n.lidaEm && !n.id.startsWith('sn-')) marcarNotif.mutate({ id: n.id }); if (n.rota) navigate(n.rota); }}>
                        <span className="np-dot" aria-hidden />
                        <span className="np-tx">
                          <span className="np-t">{n.titulo}</span>
                          {n.corpo && <span className="np-c">{n.corpo}</span>}
                        </span>
                        <span className="np-h num">{tempoRelativo(n.criadoEm, Date.now())}</span>
                      </button>
                    ))}
                  </div>
                </>,
                raizMenu,
              )}
              <div className="top-usuario">
                <button ref={avatarRef} type="button" className="avatar avatar-btn" aria-label="Menu do usuário" aria-haspopup="menu"
                  aria-expanded={menuUsuario} title={nome} style={ALFA ? undefined : { width: 33, height: 33 }}
                  onClick={abrirMenuUsuario}>{iniciaisDe(nome)}</button>
              </div>
              {menuUsuario && createPortal(
                <>
                  <div className="um-backdrop" onClick={() => setMenuUsuario(false)} aria-hidden />
                  {ALFA ? (
                    /* ALFA: o menu da conta de verdade — quem é, a conta (onde existe), o tema, os atalhos e o Sair */
                    <div ref={menuUsuarioRef} tabIndex={-1} className="usuario-menu um-conta" role="menu" aria-label="Menu da conta" style={{ top: menuPos.top, right: menuPos.right }}>
                      <div className="um-head">
                        <span className="avatar um-av" aria-hidden>{iniciaisDe(nome)}</span>
                        <span className="um-id">
                          <span className="um-nome">{nome}</span>
                          <span className="um-cargo">{loginConta ? `${loginConta} · ${cargo}` : cargo}</span>
                        </span>
                      </div>
                      {temContaAtendimento && (
                        <button type="button" role="menuitem" className="um-item" onClick={() => { setMenuUsuario(false); navigate(rotaDaConta); }}>
                          <IcConta /><span>Minha conta</span>
                        </button>
                      )}
                      <button type="button" role="menuitem" className="um-item" onClick={() => { setMenuUsuario(false); alternarTema(); }}>
                        {tema === 'dark' ? <IcTemaClaro /> : <IcTemaEscuro />}<span>{tema === 'dark' ? 'Usar o tema claro' : 'Usar o tema escuro'}</span>
                      </button>
                      <button type="button" role="menuitem" className="um-item" onClick={() => { setMenuUsuario(false); setAtalhosAbertos(true); }}>
                        <IcTeclado /><span>Atalhos do teclado</span>
                      </button>
                      <div className="um-sep" role="separator" />
                      <button type="button" role="menuitem" className="um-item" onClick={sair}>
                        <IcSair /><span>Sair</span>
                      </button>
                    </div>
                  ) : (
                  <div ref={menuUsuarioRef} tabIndex={-1} className="usuario-menu" role="menu" aria-label="Menu do usuário" style={{ top: menuPos.top, right: menuPos.right }}>
                    <div className="um-head">
                      <div className="um-nome">{nome}</div>
                      <div className="um-cargo">{cargo}</div>
                    </div>
                    {!isRevizaMode && <button type="button" role="menuitem" className="um-item" onClick={() => { setMenuUsuario(false); navigate('/configuracoes'); }}>Configurações</button>}
                    <button type="button" role="menuitem" className="um-item perigo" onClick={sair}>Sair</button>
                  </div>
                  )}
                </>,
                raizMenu,
              )}
            </div>
          </div>

          {/* mensalidade da plataforma (Reviza): faixa de aviso p/ admins + takeover
              de bloqueio — 'ok' não renderiza nada; fora do modo reviza nem monta.
              Em DEV também monta só p/ a prévia ?licenca=aviso|bloqueado (código
              morto no build de produção; o gate interno segue exigindo reviza). */}
          {(isRevizaMode || import.meta.env.DEV) && !configPendente && <LicencaGate />}
          {/* configuração inicial obrigatória (Reviza): assistente p/ admin/gestor/cadastro/
              financeiro, tela de espera p/ o comercial, faixa p/ suporte. Sem backend ainda:
              inativo na Reviza; prévia só em DEV/demo (?config=…). */}
          {(isRevizaMode || isDemoMode || import.meta.env.DEV) && <ConfiguracaoGate />}

          <div className="palco">
            {/* key por caminho + geração: re-executa a entrada (pg-entra + cascata)
                a cada troca de rota e quando a intro abre o palco */}
            {/* páginas cheias (kanban, inbox) gerenciam a própria altura — shell.css .pagina.cheia.
                Rotas OFICIAIS estão na RAIZ desde o CORTE (/whatsapp, /kanban) — não mais em /v2/*. */}
            <div className={/^\/(kanban|whatsapp|pos-venda|chat-equipe)(\/|$)/.test(location.pathname) ? 'pagina pg-entra cheia' : 'pagina pg-entra'} key={location.pathname}>
              {acessoCarregando ? <div className="acesso-carregando" role="status" aria-label="Carregando seu acesso" />
                : naoEncontrada ? <PaginaNaoEncontrada home={homeDaPessoa} rotuloHome={homeDaPessoa.startsWith('/cobrancas') ? 'Voltar ao Painel' : 'Voltar ao WhatsApp'} />
                : isDemoMode && moduloAtivo === 'atendimento' ? <Navigate to="/cobrancas/painel" replace />
                : semAcessoAoAmbiente ? <Navigate to={homeDaPessoa} replace />
                : areaBloqueada ? <Navigate to={homeDaPessoa} replace />
                /* Registros e Usuários mudaram de endereço: o link antigo leva ao ambiente Configurações */
                : isRevizaMode && /^\/ia\/?$/.test(location.pathname) ? <Navigate to="/config/iris" replace />
                : isRevizaMode && /^\/cobrancas\/(registros|usuarios)\/?$/.test(location.pathname) ? <Navigate to={`/config/${location.pathname.split('/')[2]}`} replace />
                : moduloAtivo === 'configuracoes' && !MOD_CONFIG.grupos.some((g) => filtrarItensNav(g.itens).length > 0) ? <Navigate to={homeDaPessoa} replace />
                : moduloAtivo === 'configuracoes' && /^\/config\/?$/.test(location.pathname) ? <Navigate to={inicioDoModulo(MOD_CONFIG)} replace />
                : isRevizaMode && moduloAtivo === 'atendimento' && !rotaAtendimentoPermitida(location.pathname) ? <Navigate to="/whatsapp" replace />
                : <Outlet />}
            </div>
          </div>

          <NotificacaoResposta
            dados={notif}
            aoFechar={fecharNotif}
            aoVerConversa={() => {
              const alvo = notif?.conversaId;
              fecharNotif();
              navigate(alvo ? `/whatsapp?conversa=${encodeURIComponent(alvo)}` : '/whatsapp');
            }}
          />
        </main>

        {/* portais soltos: intro do dia + aviso de deploy (dono 28/08) + paleta ⌘K */}
        {paletaAberta && <PaletaBusca grupos={gruposPaleta} acoes={acoesPaleta} raiz={raizMenu} aoFechar={fecharPaleta} comClientes={buscaClientes} alfa={ALFA} />}
        <AvisoAtualizacao />
        {ALFA && (
          <ModalV2 aberto={atalhosAbertos} aoFechar={() => setAtalhosAbertos(false)} titulo="Atalhos do teclado" largura={420}>
            <dl className="ba-atalhos">
              <div><dt>Buscar seções, clientes e ações</dt><dd><kbd>{rotuloAtalho('K')}</kbd></dd></div>
              {temContaAtendimento && <div><dt>Abrir as Configurações</dt><dd><kbd>{rotuloAtalho(',')}</kbd></dd></div>}
              <div><dt>Navegar nos menus e na busca</dt><dd><kbd>↑</kbd><kbd>↓</kbd></dd></div>
              <div><dt>Abrir o item escolhido</dt><dd><kbd>Enter</kbd></dd></div>
              <div><dt>Fechar menus, busca e janelas</dt><dd><kbd>Esc</kbd></dd></div>
            </dl>
          </ModalV2>
        )}
      </div>

    </div>
  );
}
