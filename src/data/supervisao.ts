import { useMemo, useSyncExternalStore } from 'react';
import { WA_REAL, useWaConversations, useWaMensagens } from '@/data/whatsapp';
import type { WaContact, WaMessage } from '@/data/whatsappDemo';
import { useOrgUsuarios } from '@/data/atendimento';
import { spHoje } from '@/data/relatorios';
import type { RadarItem } from '@/data/vacuo';
import { EQUIPE_DEMO, assinarDemo, lerDemo, type EstadoDemo } from '@/data/supervisao.demo';

/* ------------------------------------------------------------------
   Painel da Equipe (Gestão, 29/10) — dados da tela dos celulares.
   Pedido do dono: um celular por atendente, igual ao WhatsApp, para o
   gestor acompanhar cada um de perto, com as informações de cada pessoa.

   Nenhuma consulta nova no banco:
   - conversas = a MESMA lista do inbox (useWaConversations: o admin vê a
     carteira de todos e o realtime da lista mantém tudo ao vivo), separada
     pelo dono do cliente (contatos.responsavel_id);
   - mensagens = o histórico da conversa aberta (useWaMensagens), com o
     mesmo patch do realtime que o inbox usa;
   - números   = a RPC do Dashboard (dashboard_v5), os mesmos da tabela
     "Desempenho por atendente";
   - avisos    = os avisos ativos da Central de Avisos (radar_avisos).
   SOMENTE LEITURA: abrir uma conversa aqui não marca nada como lido e não
   envia nada para ninguém.
   Demo é o contrato: em `vite --mode demo` os mesmos hooks devolvem a
   fixture de supervisao.demo, com mensagens chegando ao vivo.
   ------------------------------------------------------------------ */

export const SUPERVISAO_REAL = WA_REAL;

export interface MembroEquipe { id: string; nome: string; papel: string }

const PAPEIS = new Set(['admin', 'gestor', 'atendente']);

/** Ordem do WhatsApp: fixadas no topo, depois a conversa mais recente primeiro. */
export function ordemDoWhatsApp(a: WaContact, b: WaContact): number {
  return Number(!!b.fixada) - Number(!!a.fixada) || (b.lastAtMs ?? 0) - (a.lastAtMs ?? 0);
}

/** A lista do inbox separada pelo dono do cliente (cliente sem dono não tem celular). */
export function agruparPorAtendente(lista: readonly WaContact[]): Map<string, WaContact[]> {
  const m = new Map<string, WaContact[]>();
  for (const c of lista) {
    if (!c.respId) continue;
    let doDono = m.get(c.respId);
    if (!doDono) { doDono = []; m.set(c.respId, doDono); }
    doDono.push(c);
  }
  for (const doDono of m.values()) doDono.sort(ordemDoWhatsApp);
  return m;
}

/** Quem ganha um celular: todo atendente ativo, e admin/gestor só quando tem carteira própria. */
export function membrosDaParede(usuarios: readonly MembroEquipe[], porAtendente: Map<string, WaContact[]>): MembroEquipe[] {
  return usuarios
    .filter((u) => PAPEIS.has(u.papel) && (u.papel === 'atendente' || (porAtendente.get(u.id)?.length ?? 0) > 0))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

/** 00:00 de hoje em São Paulo (sem horário de verão desde 2019: −03:00 o ano todo). */
export const inicioHojeSP = (): number => Date.parse(`${spHoje()}T00:00:00-03:00`);

/** "Esperando resposta" = a última mensagem da conversa é do cliente, nos últimos 7 dias
 *  (mais antigo que isso é conversa parada, assunto da Central de Avisos, não da tela ao vivo). */
export const JANELA_ESPERA_MS = 7 * 86_400_000;

/** Desde quando o cliente espera (ISO da última mensagem dele), ou null se não espera.
 *  Conversa arquivada não conta, salvo `mesmoArquivada` (a lista das arquivadas no celular). */
export function esperaDesde(c: WaContact, agora: number, mesmoArquivada = false): string | null {
  const desde = c.aguardando && (mesmoArquivada || !c.arquivada) ? c.aguardandoDesde ?? null : null;
  return desde && agora - Date.parse(desde) < JANELA_ESPERA_MS ? desde : null;
}

export interface ResumoCarteira {
  /** conversas na carteira, fora as arquivadas */
  total: number;
  arquivadas: number;
  /** conversas com alguma mensagem hoje */
  hoje: number;
  /** clientes esperando resposta (ver JANELA_ESPERA_MS) */
  aguardando: number;
  /** a espera mais antiga entre essas (ISO da última mensagem do cliente) */
  esperaMaisAntiga: string | null;
}

export function resumirCarteira(convs: readonly WaContact[], inicioHoje: number, agora: number): ResumoCarteira {
  const r: ResumoCarteira = { total: 0, arquivadas: 0, hoje: 0, aguardando: 0, esperaMaisAntiga: null };
  for (const c of convs) {
    if (c.arquivada) { r.arquivadas++; continue; }
    r.total++;
    if ((c.lastAtMs ?? 0) >= inicioHoje) r.hoje++;
    const desde = esperaDesde(c, agora);
    if (desde) {
      r.aguardando++;
      if (!r.esperaMaisAntiga || desde < r.esperaMaisAntiga) r.esperaMaisAntiga = desde;
    }
  }
  return r;
}

export interface RadarDoAtendente {
  /** clientes em aviso (negociação + fechados) */
  emAviso: number;
  /** desses, no último aviso */
  ultimoAviso: number;
  /** leads parados no robô para ligar */
  ligar: number;
  itens: RadarItem[];
}

const primeiroNome = (n: string | null | undefined) => (n ?? '').trim().split(/\s+/)[0]?.toLocaleLowerCase('pt-BR') ?? '';

/** O que uma pessoa tem na Central de Avisos (avisos ativos). Na demo as fixtures do Radar usam outros
 *  ids de usuário: casa pelo primeiro nome (só lá). */
export function radarDoAtendente(itens: readonly RadarItem[], m: MembroEquipe): RadarDoAtendente {
  const nome = primeiroNome(m.nome);
  const meus = itens.filter((i) => i.donoId === m.id || (!SUPERVISAO_REAL && !!nome && primeiroNome(i.donoNome) === nome));
  const avisos = meus.filter((i) => i.categoria === 'negociacao' || i.categoria === 'fechado');
  return {
    emAviso: avisos.length,
    ultimoAviso: avisos.filter((i) => i.estagio === 3).length,
    ligar: meus.filter((i) => i.categoria === 'ligar').length,
    itens: meus,
  };
}

/* ---------------- hooks ---------------- */

const semAssinatura = () => () => {};
const semDemo = (): EstadoDemo | null => null;
/** A fixture viva da demo (no real, nada: os hooks do inbox fazem o trabalho). */
function useDemo(): EstadoDemo | null {
  return useSyncExternalStore(SUPERVISAO_REAL ? semAssinatura : assinarDemo, SUPERVISAO_REAL ? semDemo : lerDemo);
}

export interface EquipeAoVivo {
  membros: MembroEquipe[];
  porAtendente: Map<string, WaContact[]>;
  carregando: boolean;
  erro: string | null;
  recarregar: () => void;
}

/** A equipe e a carteira de cada um, ao vivo. */
export function useEquipeAoVivo(): EquipeAoVivo {
  const qConv = useWaConversations();
  const qUsu = useOrgUsuarios();
  const demo = useDemo();
  const lista = SUPERVISAO_REAL ? qConv.data : demo?.conversas;
  const porAtendente = useMemo(() => agruparPorAtendente(lista ?? []), [lista]);
  const usuarios = SUPERVISAO_REAL ? qUsu.data : EQUIPE_DEMO;
  const membros = useMemo(() => membrosDaParede(usuarios ?? [], porAtendente), [usuarios, porAtendente]);
  const erro = SUPERVISAO_REAL ? ((qConv.error ?? qUsu.error) as Error | null)?.message ?? null : null;
  return {
    membros,
    porAtendente,
    carregando: SUPERVISAO_REAL ? (!qConv.data || !qUsu.data) && !erro : false,
    erro,
    recarregar: () => { void qConv.refetch(); void qUsu.refetch(); },
  };
}

/** Histórico completo de UMA conversa aberta num celular. */
export function useMensagensSupervisao(conversaId: string | null): { msgs: WaMessage[] | undefined; carregando: boolean; erro: string | null } {
  const q = useWaMensagens(SUPERVISAO_REAL ? conversaId : null);
  const demo = useDemo();
  if (!SUPERVISAO_REAL) return { msgs: conversaId ? demo?.mensagens.get(conversaId) ?? [] : undefined, carregando: false, erro: null };
  return { msgs: q.data, carregando: q.isLoading, erro: q.error ? (q.error as Error).message : null };
}
