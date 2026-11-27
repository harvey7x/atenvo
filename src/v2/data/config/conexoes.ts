/* CONEXÕES DE WHATSAPP do ambiente Configurações (dono 22/11: "conectar o WhatsApp via QR Code e
   escolher para que é esse WhatsApp: se é para as pessoas do ambiente Cobranças ou do Atendimento").
   UMA lista com os números dos dois ambientes; por baixo cada ambiente continua no seu motor:
   - COBRANÇAS: wa_canais + edge function reviza-wa-instancia (data/wa/wa.ts) — um número por comercial
     dono; a régua e as Conversas de Cobranças saem por ele;
   - ATENDIMENTO: canais + evolution-manage (data/whatsapp.ts) — o número que recebe quem chama a
     empresa e alimenta o WhatsApp e o Kanban do Atendimento.
   Sem o banco do Atendimento (demonstração/prévia): os números dele ficam num armazém local desta aba.
   Nada aqui envia mensagem: só cria/renova a sessão (QR), desconecta e remove. */
import { temRecurso } from './recursos';
import { useMemo, useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useOrg } from '@/context/OrgContext';
import { isPrevia, isRevizaMode, supabase } from '@/lib/supabase';
import { WA_REAL, useWaCanais, waCreateInstance, waOcultar, waQr, waReconnect, waRemove, waStatus, type WaCanal } from '@/data/whatsapp';
import { useCanaisWA, type CanalWA } from '../wa/wa';
import { useUsuarios } from '../cobranca/usuarios';
import type { Ambiente } from '../modulos';

export type EstadoConexao = 'conectado' | 'conectando' | 'desconectado';
export interface ConexaoWA {
  /** único na lista dos dois ambientes */
  chave: string;
  /** id no motor do ambiente (wa_canais.id ou canais.id) */
  id: string;
  ambiente: Ambiente;
  /** Cobranças: o comercial dono (ou o nome do canal, sem dono); Atendimento: o nome do número */
  nome: string;
  numero: string | null;
  estado: EstadoConexao;
  donoId: string | null;
  semDono: boolean;
  ultimaAtividade: string | null;
  erro: string | null;
}

/* ---------------- Atendimento sem banco: armazém local da aba ---------------- */
interface CanalAtdLocal { id: string; alias: string; numero: string | null; status: EstadoConexao; em: string | null; qr: string | null }
const agora = () => new Date().toISOString();
let atdLocal: CanalAtdLocal[] = [
  { id: 'atd-principal', alias: 'Atendimento principal', numero: '5551988880001', status: 'conectado', em: new Date(Date.now() - 4 * 60_000).toISOString(), qr: null },
  { id: 'atd-campanha', alias: 'Campanha de novembro', numero: '5551977770002', status: 'conectado', em: new Date(Date.now() - 22 * 60_000).toISOString(), qr: null },
  { id: 'atd-recepcao', alias: 'Recepção', numero: '5551966660003', status: 'desconectado', em: new Date(Date.now() - 26 * 3600_000).toISOString(), qr: null },
];
const ouvintes = new Set<() => void>();
const assinar = (cb: () => void) => { ouvintes.add(cb); return () => { ouvintes.delete(cb); }; };
const lerLocal = () => atdLocal;
function mudarLocal(f: (l: CanalAtdLocal[]) => CanalAtdLocal[]) { atdLocal = f(atdLocal); ouvintes.forEach((cb) => cb()); }
/** QR de demonstração: quadriculado em SVG (nenhuma sessão de verdade envolvida) */
export function qrDemonstracao(): string {
  let cels = '';
  let x0 = 400 + Math.floor(Math.random() * 900);
  for (let y = 0; y < 21; y++) for (let x = 0; x < 21; x++) {
    x0 = (x0 * 16807) % 2147483647;
    if (x0 % 5 < 2) cels += `<rect x="${x * 10}" y="${y * 10}" width="10" height="10"/>`;
  }
  const olho = (x: number, y: number) => `<rect x="${x}" y="${y}" width="70" height="70" fill="#fff"/><rect x="${x + 5}" y="${y + 5}" width="60" height="60" fill="none" stroke="#000" stroke-width="10"/><rect x="${x + 20}" y="${y + 20}" width="30" height="30"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 210 210" fill="#000"><rect width="210" height="210" fill="#fff"/>${cels}${olho(0, 0)}${olho(140, 0)}${olho(0, 140)}</svg>`;
  return 'data:image/svg+xml;base64,' + btoa(svg);
}
const TEMPO_DEMO_MS = 8000;
function conectarLocalDepois(id: string) {
  window.setTimeout(() => {
    const c = atdLocal.find((x) => x.id === id);
    if (!c || c.status !== 'conectando') return;
    mudarLocal((l) => l.map((x) => (x.id === id ? { ...x, status: 'conectado', qr: null, em: agora(), numero: x.numero ?? `55519${String(Math.floor(80000000 + Math.random() * 19999999))}` } : x)));
    registrarNaPrevia('conectou', c.alias, 'WhatsApp do Atendimento conectado');
  }, TEMPO_DEMO_MS);
}
/** só na PRÉVIA: as ações nos números do Atendimento também aparecem nos Registros (no sistema de
    verdade quem grava o registro é o banco, por gatilho — o navegador nunca escreve nele) */
function registrarNaPrevia(acao: string, rotulo: string, detalhe: string) {
  if (!isPrevia || !supabase) return;
  // (a consulta só roda quando alguém espera por ela — por isso o .then)
  void supabase.from('registros').insert({ acao, entidade: 'whatsapp', rotulo, detalhe, mudancas: [] }).then(() => undefined);
}

const estadoCob = (c: CanalWA): EstadoConexao => (c.estado === 'conectado' ? 'conectado' : c.estado === 'conectando' ? 'conectando' : 'desconectado');
const estadoAtd = (s: string): EstadoConexao => (s === 'conectado' ? 'conectado' : s === 'sincronizando' || s === 'conectando' || s === 'aguardando_qr' ? 'conectando' : 'desconectado');

/** os números dos dois ambientes numa lista só (problema primeiro: desconectado → conectando → conectado) */
const TEM_ATD = temRecurso('atendimento');
const SEM_ATD = { data: [] as WaCanal[], isLoading: false, isError: false, refetch: () => Promise.resolve() } as const;
export function useConexoesWA() {
  // 28/11: as Cobranças (wa_canais, profiles) só existem no Reviza — no Atenvo a lista é só dos números do Atendimento
  const cobQ = useCanaisWA(isRevizaMode);
  const usuariosQ = useUsuarios(isRevizaMode);
  // sem o Atendimento no servidor, a lista é só de Cobranças e a consulta dos números do Atendimento nem roda
  // (TEM_ATD é fixo da instalação: o ramo nunca muda entre renders)
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const atdQ = TEM_ATD ? useWaCanais() : SEM_ATD;
  const local = useSyncExternalStore(assinar, lerLocal, lerLocal);
  const lista = useMemo<ConexaoWA[]>(() => {
    const usuarios = usuariosQ.data ?? [];
    const cob: ConexaoWA[] = (cobQ.data ?? []).map((c) => {
      const dono = c.dono_id ? usuarios.find((u) => u.id === c.dono_id) : null;
      return {
        chave: `cobrancas:${c.id}`, id: c.id, ambiente: 'cobrancas', nome: dono?.nome || c.nome, numero: c.numero, estado: estadoCob(c),
        donoId: c.dono_id, semDono: !c.dono_id, ultimaAtividade: c.ultimo_evento_em ?? c.verificado_em, erro: c.ultimo_erro,
      };
    });
    const atd: ConexaoWA[] = !TEM_ATD ? [] : WA_REAL
      ? (atdQ.data ?? []).filter((c) => c.transporte !== 'cloud_api').map((c) => ({
        chave: `atendimento:${c.id}`, id: c.id, ambiente: 'atendimento', nome: c.alias, numero: c.numero, estado: estadoAtd(c.status),
        donoId: null, semDono: false, ultimaAtividade: c.conectadoEm, erro: null,
      }))
      : local.map((c) => ({
        chave: `atendimento:${c.id}`, id: c.id, ambiente: 'atendimento', nome: c.alias, numero: c.numero, estado: c.status,
        donoId: null, semDono: false, ultimaAtividade: c.em, erro: null,
      }));
    const ordem: Record<EstadoConexao, number> = { desconectado: 0, conectando: 1, conectado: 2 };
    return [...cob, ...atd].sort((a, b) => ordem[a.estado] - ordem[b.estado] || a.ambiente.localeCompare(b.ambiente) || a.nome.localeCompare(b.nome, 'pt-BR'));
  }, [cobQ.data, usuariosQ.data, atdQ.data, local]);
  return {
    lista,
    /** o canal de Cobranças de verdade (com o QR) — a janela de conexão lê dele */
    canaisCob: cobQ.data ?? [],
    usuarios: usuariosQ.data ?? [],
    carregando: cobQ.isLoading || usuariosQ.isLoading || (TEM_ATD && WA_REAL && atdQ.isLoading),
    falhou: cobQ.isError || (TEM_ATD && WA_REAL && atdQ.isError),
    recarregar: () => { void cobQ.refetch(); if (TEM_ATD && WA_REAL) void atdQ.refetch(); },
  };
}

/* ---------------- Atendimento: criar a sessão, ler o QR e a situação ---------------- */
export interface SessaoAtd { id: string; qr: string | null }
export function useAcoesAtendimento() {
  const { currentOrg } = useOrg();
  const qc = useQueryClient();
  const inv = () => { void qc.invalidateQueries({ queryKey: ['wa-canais', currentOrg.id] }); void qc.invalidateQueries({ queryKey: ['reviza', 'registros'] }); };
  const comPrefixo = (b: string | null) => (b ? `data:image/png;base64,${b.replace(/^data:image\/\w+;base64,/, '')}` : null);
  return {
    /** cria o número (ou reabre um que já existe) e devolve o QR */
    iniciar: async (a: { nome: string; reconectarId?: string }): Promise<SessaoAtd> => {
      if (!WA_REAL) {
        await new Promise((r) => setTimeout(r, 450));
        const qr = qrDemonstracao();
        const id = a.reconectarId ?? `atd-${Date.now().toString(36)}`;
        mudarLocal((l) => (a.reconectarId
          ? l.map((x) => (x.id === id ? { ...x, status: 'conectando', qr } : x))
          : [...l, { id, alias: a.nome.trim(), numero: null, status: 'conectando', em: null, qr }]));
        conectarLocalDepois(id);
        return { id, qr };
      }
      // 'trafego_1': a fonte padrão do Atendimento (a mesma da tela Integrações); dá para trocar depois lá
      const r = a.reconectarId ? await waReconnect(currentOrg.id, a.reconectarId) : await waCreateInstance(currentOrg.id, a.nome.trim(), 'trafego_1');
      inv();
      return { id: r.canal_id, qr: comPrefixo(r.qr_base64) };
    },
    novoQr: async (id: string): Promise<string | null> => {
      if (!WA_REAL) { const qr = qrDemonstracao(); mudarLocal((l) => l.map((x) => (x.id === id ? { ...x, status: 'conectando', qr } : x))); conectarLocalDepois(id); return qr; }
      return comPrefixo((await waQr(currentOrg.id, id)).qr_base64);
    },
    situacao: async (id: string): Promise<{ conectado: boolean; numero: string | null }> => {
      if (!WA_REAL) { const c = atdLocal.find((x) => x.id === id); return { conectado: c?.status === 'conectado', numero: c?.numero ?? null }; }
      const r = await waStatus(currentOrg.id, id);
      if (r.connected) inv();
      return { conectado: !!r.connected, numero: r.numero ?? null };
    },
    /** fechou a janela no meio do QR: a sessão que não chegou a conectar é encerrada, sem registro */
    cancelar: async (id: string, novo: boolean) => {
      if (!WA_REAL) { mudarLocal((l) => (novo ? l.filter((x) => x.id !== id) : l.map((x) => (x.id === id && x.status === 'conectando' ? { ...x, status: 'desconectado', qr: null } : x)))); return; }
      try { await waRemove(currentOrg.id, id); inv(); } catch { /* melhor esforço */ }
    },
    /** encerra a sessão; o número fica na lista como desconectado e o histórico é preservado */
    desconectar: async (id: string, nome: string) => {
      if (!WA_REAL) { mudarLocal((l) => l.map((x) => (x.id === id ? { ...x, status: 'desconectado', qr: null, em: agora() } : x))); registrarNaPrevia('desconectou', nome, 'WhatsApp do Atendimento desconectado'); inv(); return; }
      await waRemove(currentOrg.id, id); inv();
    },
    /** tira o número da lista (as conversas dele continuam no histórico) */
    remover: async (id: string, nome: string) => {
      if (!WA_REAL) { mudarLocal((l) => l.filter((x) => x.id !== id)); registrarNaPrevia('removeu', nome, 'WhatsApp do Atendimento removido da lista'); inv(); return; }
      await waOcultar(currentOrg.id, id); inv();
    },
  };
}
