import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as RKeyboardEvent, type ReactNode } from 'react';
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
import { NotificacaoResposta, type DadosNotificacao } from './NotificacaoResposta';
import { useNotificacaoInbound } from '../hooks/useNotificacaoInbound';
import { aplicarTema, lerTema, salvarTema, type Tema } from '../lib/tema';
import { AvisoAtualizacao } from '../components/AvisoAtualizacao';
import { LicencaGate } from '../components/LicencaGate';
import { ConfiguracaoGate } from '../pages/configuracao/ConfiguracaoGate';
import { useConfiguracaoPendente } from '../data/cobranca/configuracao';
import { useNotificacoes, useMarcarNotificacao, type Notificacao } from '@/data/remarketing';
import { useNotificacoesCob, useMarcarNotifCob } from '../data/cobranca/notificacoes';
import { secaoDoPapel } from '../data/cobranca/secoes';
import { rotaAtendimentoPermitida } from '../data/modulos';
import { useConversasWA } from '../data/wa/wa';
import { tempoRelativo } from '../lib/tempo';
import { usePapel } from '../data/cobranca/sessao';
import { useAvisosNaoLidos } from '../data/cobranca/avisos';
import { usePendentesAprovacao } from '../data/cobranca/hooks';
import { getCobrancaRepo } from '../data/cobranca/cobrancaRepo';
import { chavesCobranca } from '../data/cobranca/keys';
import type { Dados } from '../data/cobranca/types';
import { BotaoDesfazer } from './BotaoDesfazer';
import { BarraAlfa, TopoAlfa, IcFechar, type GrupoBarra, type ItemBarra, type ModoBarra } from './BarraAlfa';

/* ALFA (Reviza de verdade e a demo): barra lateral e topo no desenho da referência "Dashboard
   Sidebar" (dono 12/11) — BarraAlfa.tsx. O Atenvo (fora daqui) segue com a cápsula flutuante. */
const ALFA = isRevizaMode || isDemoMode;
/* preferência da barra (por aparelho): aberta (260px) ou recolhida (trilho de ícones) */
const CHAVE_BARRA = 'reviza.barra';
const lerPrefBarra = (): 'aberta' | 'trilho' | null => {
  try { const v = localStorage.getItem(CHAVE_BARRA); return v === 'aberta' || v === 'trilho' ? v : null; } catch { return null; }
};
/* celular (gaveta): a barra some e abre por cima pelo botão do topo */
const MQ_CELULAR = '(max-width: 760px)';
const ehCelularAgora = () => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(MQ_CELULAR).matches;

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
      { slug: 'whatsapp', rotulo: 'WhatsApp' },
      { slug: 'presenciais', rotulo: 'Presenciais' },
      { slug: 'scripts', rotulo: 'Scripts' },
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
type ModuloId = 'atendimento' | 'cobrancas';
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
  { slug: 'cobrancas/registros', rotulo: 'Registros', admin: true },
  { slug: 'cobrancas/usuarios', rotulo: 'Usuários', admin: true },
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
const MOD_ATENDIMENTO: Modulo = { id: 'atendimento', rotulo: 'Atendimento', home: '/whatsapp', grupos: GRUPOS };
const MOD_COBRANCAS: Modulo = { id: 'cobrancas', rotulo: 'Cobranças', home: '/cobrancas/painel', grupos: COB_GRUPOS };
// Reviza: Cobranças vem primeiro — é o início de quem tem os dois ambientes (o coração da Reviza)
const MODULOS: Modulo[] = isRevizaMode ? [MOD_COBRANCAS, MOD_ATENDIMENTO] : [MOD_ATENDIMENTO, MOD_COBRANCAS];
/* o nome da página na trilha do topo ("Cobranças / Painel"): o do item do menu (o da instância ganha) */
const TITULOS_PAGINA: Record<string, string> = {
  integracoes: 'Integrações',
  ...Object.fromEntries([...COB_SECOES_BASE, ...COB_SECOES_REVIZA, ...GRUPOS.flatMap((g) => g.itens), ...COB_SECOES].map((i) => [i.slug, i.rotulo])),
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

/* ---------------- Paleta de busca global (⌘K) ----------------
   A barra do topo abre um spotlight de verdade: SEÇÕES do módulo ativo
   (mesmo filtro de papel do menu) e, na Reviza/demo, CLIENTES da Gestão
   por nome, CPF ou telefone. Enter/clique navega; escolher um cliente
   entrega a busca pronta pra Gestão via sessionStorage
   ('alfa_paleta_busca'). Monta só enquanto aberta — a query dos clientes
   não pesa o shell nas telas que não precisam dela. */
const semAcentoPal = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const soDigitos = (s: string) => s.replace(/\D/g, '');
const d2 = (n: number) => String(n).padStart(2, '0');
type SecaoPaleta = { slug: string; rotulo: string; grupo: string };
type ItemPaleta =
  | { tipo: 'secao'; slug: string; rotulo: string; grupo: string }
  | { tipo: 'cliente'; id: string; nome: string; comercial: string; dia: number };

function PaletaBusca({ secoes, raiz, aoFechar, comClientes, alfa = false }: { secoes: SecaoPaleta[]; raiz: HTMLElement; aoFechar: () => void; comClientes: boolean; alfa?: boolean }) {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [ativo, setAtivo] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listaRef = useRef<HTMLDivElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => { setAtivo(0); }, [q]);

  // clientes = a MESMA query da Gestão (chave compartilhada → cache aproveitado). Quem decide é o
  // shell (`comClientes`): só no ambiente Cobranças e só para quem tem Cobranças — no Atendimento a
  // paleta é a do Atenvo (só as seções) e quem é só do Atendimento nunca busca a carteira
  const clientesQ = useQuery<Dados>({
    queryKey: chavesCobranca.dados,
    queryFn: () => getCobrancaRepo().carregar(),
    enabled: comClientes,
  });

  const termo = q.trim();
  const tNorm = semAcentoPal(termo);
  const tDig = soDigitos(termo);
  const secoesVistas = termo ? secoes.filter((s) => semAcentoPal(s.rotulo).includes(tNorm)) : secoes;
  const clientes = useMemo<ItemPaleta[]>(() => {
    if (!comClientes || !termo) return [];
    const achados: ItemPaleta[] = [];
    for (const l of clientesQ.data?.linhas ?? []) {
      const porNome = semAcentoPal(l.nome).includes(tNorm);
      // CPF/telefone só por DÍGITOS (3+ pra não casar o mundo inteiro com "1")
      const porDigitos = tDig.length >= 3 && (soDigitos(l.cpf).includes(tDig) || soDigitos(l.telefone).includes(tDig));
      if (!porNome && !porDigitos) continue;
      achados.push({ tipo: 'cliente', id: l.id, nome: l.nome, comercial: l.comercial, dia: l.dia });
      if (achados.length >= 8) break;
    }
    return achados;
  }, [comClientes, termo, tNorm, tDig, clientesQ.data]);

  const itens: ItemPaleta[] = [
    ...secoesVistas.map((s) => ({ tipo: 'secao' as const, slug: s.slug, rotulo: s.rotulo, grupo: s.grupo })),
    ...clientes,
  ];
  const at = itens.length ? Math.min(ativo, itens.length - 1) : 0;
  useEffect(() => { listaRef.current?.querySelector('.pal-item.on')?.scrollIntoView({ block: 'nearest' }); }, [at]);

  const abrir = (it: ItemPaleta) => {
    aoFechar();
    if (it.tipo === 'secao') { navigate('/' + it.slug); return; }
    // handoff: a Gestão consome a chave no mount — ou pelo evento, se já estiver aberta
    try { sessionStorage.setItem('alfa_paleta_busca', it.nome); } catch { /* sem storage: só navega */ }
    navigate('/cobrancas/planilha');
    window.dispatchEvent(new Event('alfa_paleta_busca'));
  };
  const aoTeclar = (e: RKeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') { e.preventDefault(); aoFechar(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setAtivo(Math.min(at + 1, Math.max(0, itens.length - 1))); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); setAtivo(Math.max(at - 1, 0)); return; }
    if (e.key === 'Enter' && itens[at]) { e.preventDefault(); abrir(itens[at]); }
  };

  return createPortal(
    <div className="pal-veu" onMouseDown={(e) => { if (e.target === e.currentTarget) aoFechar(); }}>
      <div className="pal-caixa" role="dialog" aria-modal="true" aria-label="Busca global" onKeyDown={aoTeclar}>
        <div className="pal-topo">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" />
          </svg>
          <input ref={inputRef} className="pal-inp" type="text" value={q} onChange={(e) => setQ(e.target.value)}
            placeholder={comClientes ? 'Buscar cliente (nome, CPF, telefone) ou seção…' : 'Buscar seção…'}
            aria-label="Buscar" autoComplete="off" spellCheck={false} />
          {alfa ? (
            <>
              <kbd onClick={aoFechar} aria-hidden>ESC</kbd>
              <button type="button" className="pal-fechar" onClick={aoFechar} aria-label="Fechar a busca"><IcFechar /></button>
            </>
          ) : <kbd>Esc</kbd>}
        </div>
        <div className="pal-lista" ref={listaRef}>
          {itens.map((it, i) => {
            const cabecalho = i === 0 || itens[i - 1].tipo !== it.tipo;
            return (
              <Fragment key={it.tipo === 'secao' ? 's-' + it.slug : 'c-' + it.id}>
                {cabecalho && <div className="pal-glabel">{it.tipo === 'secao' ? 'Seções' : 'Clientes'}</div>}
                <button type="button" className={i === at ? 'pal-item on' : 'pal-item'}
                  onMouseEnter={() => setAtivo(i)} onClick={() => abrir(it)}>
                  <span className="pal-ico" aria-hidden>{it.tipo === 'secao' ? iconeDoItem(it.slug) : COB_ICONES.clientes}</span>
                  {it.tipo === 'secao' ? (
                    <>
                      <span className="pal-nome">{it.rotulo}</span>
                      <span className="pal-meta">{it.grupo}</span>
                    </>
                  ) : (
                    <>
                      <span className="pal-nome">{it.nome}</span>
                      <span className="pal-meta">{(it.comercial || '—') + ' · ' + (it.dia > 0 ? 'D' + d2(it.dia) : 'Sem ciclo')}</span>
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

/** Shell autenticado v2: sidebar em overlay (64→242 no hover), topbar e palco. */
export default function AppShellV2() {
  const { user, signOut } = useAuth();
  const { currentOrg } = useOrg();
  const location = useLocation();
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

  // Tema dual: escolha explícita do usuário, persistida por usuário; padrão dark.
  const escopoTema = user?.id ?? undefined;
  const [tema, setTema] = useState<Tema>(() => lerTema(escopoTema));
  useEffect(() => { setTema(lerTema(escopoTema)); }, [escopoTema]); // recarrega a preferência quando o usuário resolve

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
  const [notifPos, setNotifPos] = useState<{ top: number; right: number }>({ top: 60, right: 60 });
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
  const marcarNotif = fonteCob ? marcarCob : marcarAtenvo;
  // sintética de WhatsApp só pra quem TEM a seção Conversas na matriz (financeiro/cadastro ficam fora)
  const veConversas = isRevizaMode && temCob && papelSessao?.papel != null && papelSessao.papel !== 'financeiro' && papelSessao.papel !== 'cadastro';
  const conversasWa = useConversasWA(veConversas).data ?? [];
  const waNaoLidas = conversasWa.reduce((s, c) => s + (c.nao_lidas || 0), 0);
  const avisosNaoLidosSino = useAvisosNaoLidos(temCob).data ?? 0;
  const notifsBase: Notificacao[] = fonteCob ? (temCob ? (notifsCobQ.data ?? []) : []) : (notifsAtenvoQ.data ?? []);
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
    if (r) setNotifPos({ top: Math.round(r.bottom + 8), right: Math.round(window.innerWidth - r.right) });
    setSinoOn(false); setBadgePop(0); setPainelNotif((v) => !v);
  }, []);
  useEffect(() => { setPainelNotif(false); }, [location.pathname]);
  // avatar: menu de usuário real — Configurações (rota v2) + Sair (signOut do v1, como a Topbar antiga).
  const sair = useCallback(async () => { setMenuUsuario(false); await signOut(); navigate('/login', { replace: true }); }, [signOut, navigate]);
  // fecha o menu ao trocar de rota
  useEffect(() => { setMenuUsuario(false); }, [location.pathname]);

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
  const filtrarItensNav = (itens: ItemNav[]) => itens
    .filter((i) => !i.admin || admin)
    .filter((i) => !i.slug.startsWith('cobrancas/') || !semCobConfirmado)
    // Reviza: Financeiro é restrito — comercial não vê o item
    .filter((i) => i.slug !== 'cobrancas/financeiro' || podeVerFinanceiro)
    // Reviza: matriz do dono — financeiro, comercial e cadastro só veem as suas seções
    // (só nos itens de Cobranças: o comercial que também atende vê o menu do Atendimento inteiro)
    .filter((i) => !i.slug.startsWith('cobrancas/') || !(ehFinanceiroR || ehComercialR || soCadastro) || menuDoPapel(i.slug));
  // cargo exibido: na Reviza usa o papel REAL do banco (o role da org é só admin/gestor/atendente)
  const ROTULO_REVIZA: Record<string, string> = { admin: 'Administrador', gestor: 'Gestor', comercial: 'Comercial', financeiro: 'Financeiro', cadastro: 'Cadastro', atendente: 'Atendente' };
  const cargo = isRevizaMode && papelSessao?.papel ? (ROTULO_REVIZA[papelSessao.papel] ?? papelSessao.papel) : papel;

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
  const moduloAtivo: ModuloId = location.pathname.startsWith('/cobrancas') ? 'cobrancas' : 'atendimento';
  // DEMO da ALFA: Atendimento removido — só Cobranças.
  // AMBIENTES (dono 11/11): na Reviza o seletor mostra só os ambientes do perfil (admin = os dois; atendente =
  // só Atendimento; demais = o que o administrador marcou). Enquanto o perfil carrega, só o ambiente atual
  // (sem seta e sem redirecionar). Demo segue só Cobranças.
  // Perfil sem papel (falha ao ler o perfil, conta sem papel) = sem decisão de ambiente: fica como a
  // Reviza de antes (a página abre; os dados seguem protegidos pelo banco) — nunca uma tela em branco.
  const ambientesSessao = papelSessao?.papel != null ? papelSessao.ambientes : undefined;
  const modulosDisponiveis = isRevizaMode
    ? (ambientesSessao ? MODULOS.filter((m) => ambientesSessao.includes(m.id)) : MODULOS.filter((m) => m.id === moduloAtivo))
    : isDemoMode ? MODULOS.filter((m) => m.id !== 'atendimento') : MODULOS;
  // ambiente da rota que a pessoa NÃO tem → vai pro primeiro que ela tem (ex.: atendente que caiu em /cobrancas)
  const semAcessoAoAmbiente = isRevizaMode && !!ambientesSessao && !ambientesSessao.includes(moduloAtivo);
  const homeDaPessoa = modulosDisponiveis[0]?.home ?? '/cobrancas/painel';
  // enquanto o perfil (e com ele os ambientes) não chegou, a página NÃO monta: sem isso a tela do
  // ambiente proibido pintava os dados por um instante (atendente via a Gestão de cobranças)
  const acessoCarregando = isRevizaMode && papelQ.isPending;
  // a barra lateral desenha o ambiente para onde a pessoa VAI (sem piscar o menu do ambiente que ela não tem)
  const moduloDaBarra: ModuloId = semAcessoAoAmbiente ? (modulosDisponiveis[0]?.id ?? moduloAtivo) : moduloAtivo;
  const modulo = MODULOS.find((m) => m.id === moduloDaBarra) ?? MODULOS[0];
  // busca de CLIENTES na paleta ⌘K: só no ambiente Cobranças e só para quem tem Cobranças
  // (no Atendimento a busca é a do Atenvo: só as seções)
  const buscaClientes = (isRevizaMode || isDemoMode) && temCob && moduloAtivo === 'cobrancas';

  // BARRA DA ALFA: aberta (260px) ou recolhida (trilho) — preferência deste aparelho, e o padrão
  // segue a largura da tela; no celular vira gaveta (o botão do topo abre por cima)
  const [prefBarra, setPrefBarra] = useState<'aberta' | 'trilho'>(() => lerPrefBarra() ?? (typeof window !== 'undefined' && window.innerWidth < 1200 ? 'trilho' : 'aberta'));
  const [celular, setCelular] = useState(ehCelularAgora);
  const [gavetaAberta, setGavetaAberta] = useState(false);
  useEffect(() => {
    if (!ALFA || typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia(MQ_CELULAR);
    // o 'change' da media query não dispara em janela emulada: o resize cobre
    const ver = () => setCelular(mq.matches);
    mq.addEventListener?.('change', ver);
    window.addEventListener('resize', ver);
    return () => { mq.removeEventListener?.('change', ver); window.removeEventListener('resize', ver); };
  }, []);
  useEffect(() => { setGavetaAberta(false); }, [location.pathname, celular]);
  const modoBarra: ModoBarra = celular ? 'gaveta' : prefBarra;
  const alternarBarra = useCallback(() => {
    if (celular) { setGavetaAberta((v) => !v); return; }
    setPrefBarra((v) => {
      const prox = v === 'aberta' ? 'trilho' : 'aberta';
      try { localStorage.setItem(CHAVE_BARRA, prox); } catch { /* sem storage: vale só nesta aba */ }
      return prox;
    });
  }, [celular]);
  const fecharGaveta = useCallback(() => setGavetaAberta(false), []);
  // os itens da barra: os MESMOS do menu (mesmo filtro de papel), com o ícone e o contador de cada um
  const itemDaBarra = (i: ItemNav): ItemBarra => ({
    slug: i.slug, rotulo: i.rotulo, icone: iconeDoItem(i.slug),
    badge: i.slug === 'whatsapp' ? badgePop : i.slug === 'cobrancas/avisos' ? avisosNaoLidos : i.slug === 'cobrancas/novos' ? pendentesAprovacao : undefined,
    badgeTitulo: i.slug === 'whatsapp' ? plural(badgePop, 'mensagem nova', 'mensagens novas')
      : i.slug === 'cobrancas/avisos' ? plural(avisosNaoLidos, 'aviso não lido', 'avisos não lidos')
      : i.slug === 'cobrancas/novos' ? `${pendentesAprovacao} aguardando aprovação` : undefined,
    atalho: i.slug === 'configuracoes' ? ',' : undefined,
  });
  const gruposBarra: GrupoBarra[] = modulo.grupos.filter((g) => !g.fixo)
    .map((g) => ({ rotulo: g.rotulo, itens: filtrarItensNav(g.itens).map(itemDaBarra) }))
    .filter((g) => g.itens.length > 0);
  const rodapeBarra: ItemBarra[] = modulo.grupos.filter((g) => g.fixo).flatMap((g) => filtrarItensNav(g.itens)).map(itemDaBarra);
  // ⌘, (Ctrl+, no Windows) abre Configurações — só onde o item está no pé (Atendimento)
  const atalhoConfigRef = useRef(false);
  atalhoConfigRef.current = ALFA && !acessoCarregando && rodapeBarra.some((i) => i.slug === 'configuracoes');
  const trocarModulo = useCallback((m: Modulo) => {
    setMenuOrg(false);
    navigate(m.home);
  }, [navigate]);

  // Paleta de busca global: a barra do topo abre de verdade (clique ou ⌘K/Ctrl+K)
  const [paletaAberta, setPaletaAberta] = useState(false);
  const fecharPaleta = useCallback(() => setPaletaAberta(false), []);
  useEffect(() => {
    const aoTecla = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPaletaAberta((v) => !v); return; }
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key === ',' && atalhoConfigRef.current && !e.repeat) {
        e.preventDefault(); navigate('/configuracoes');
      }
    };
    window.addEventListener('keydown', aoTecla);
    return () => window.removeEventListener('keydown', aoTecla);
  }, []);
  // seções da paleta = o menu do módulo ativo, com o MESMO filtro de papel da sidebar
  const secoesPaleta: SecaoPaleta[] = modulo.grupos.flatMap((g) =>
    filtrarItensNav(g.itens).map((i) => ({ slug: i.slug, rotulo: i.rotulo, grupo: g.rotulo })));
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
      </NavLink>
  );

  return (
    <div className="v2 app-v2">
      <div className="luz" />
      <div className="grao" />
      <div className="p-app" data-barra={ALFA ? modoBarra : undefined} data-gaveta={ALFA && modoBarra === 'gaveta' && gavetaAberta ? '' : undefined}>
        {ALFA ? (
          <BarraAlfa
            modo={modoBarra} gavetaAberta={gavetaAberta} aoFecharGaveta={fecharGaveta}
            org={org}
            ambientes={modulosDisponiveis.map((m) => ({ id: m.id, rotulo: m.rotulo }))}
            ambienteAtual={acessoCarregando ? null : { id: modulo.id, rotulo: modulo.rotulo }}
            aoTrocarAmbiente={(id) => { const m = MODULOS.find((x) => x.id === id); if (m) trocarModulo(m); }}
            carregando={acessoCarregando}
            grupos={gruposBarra} rodape={rodapeBarra}
            aoBuscar={() => setPaletaAberta(true)} buscaAberta={paletaAberta}
            aoSair={sair}
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
              <TopoAlfa modo={modoBarra} gavetaAberta={gavetaAberta} aoAlternar={alternarBarra}
                ambiente={acessoCarregando ? '' : modulo.rotulo} pagina={tituloDaRota(location.pathname)} />
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
                  <div className="usuario-menu notif-panel" role="menu" aria-label="Notificações" style={{ top: notifPos.top, right: notifPos.right }}>
                    <div className="np-head">
                      <b>Notificações</b>
                      {naoLidasReais > 0 && (
                        <button type="button" className="np-todas" onClick={() => marcarNotif.mutate({ todas: true })}>Marcar todas como lidas</button>
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
                  <div className="usuario-menu" role="menu" aria-label="Menu do usuário" style={{ top: menuPos.top, right: menuPos.right }}>
                    <div className="um-head">
                      <div className="um-nome">{nome}</div>
                      <div className="um-cargo">{cargo}</div>
                    </div>
                    {!isRevizaMode && <button type="button" role="menuitem" className="um-item" onClick={() => { setMenuUsuario(false); navigate('/configuracoes'); }}>Configurações</button>}
                    <button type="button" role="menuitem" className="um-item perigo" onClick={sair}>Sair</button>
                  </div>
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
            <div className={/^\/(kanban|whatsapp)(\/|$)/.test(location.pathname) ? 'pagina pg-entra cheia' : 'pagina pg-entra'} key={location.pathname}>
              {isDemoMode && moduloAtivo === 'atendimento' ? <Navigate to="/cobrancas/painel" replace />
                : acessoCarregando ? <div className="acesso-carregando" role="status" aria-label="Carregando seu acesso" />
                : semAcessoAoAmbiente ? <Navigate to={homeDaPessoa} replace />
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
        {paletaAberta && <PaletaBusca secoes={secoesPaleta} raiz={raizMenu} aoFechar={fecharPaleta} comClientes={buscaClientes} alfa={ALFA} />}
        <AvisoAtualizacao />
      </div>

    </div>
  );
}
