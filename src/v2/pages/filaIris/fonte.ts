/* ============================================================================
   Fila da Iris — de onde vêm os dados. A mesma tela nos três jeitos:
   - local: demonstração (clientes fictícios) e prévia (foto dos dados de hoje); marcações na página;
   - real: o banco (fonteReal.ts). Este arquivo não fala com o banco (a prévia em HTML usa só ele).
   ============================================================================ */
import { useEffect, useMemo, useState } from 'react';
import type { Marca, TipoMarca } from './dados';
import { textosDoLead, type Lead } from './lead';
import { registrarFilaLocal, useDonosLocais } from './recados';

export type Periodo = 'hoje' | '7d' | 'mes' | 'mes_ant';
export interface NumeroAtendente { atendente: string; recebidos: number; fechados: number }

export interface FonteFila {
  modo: 'demo' | 'previa' | 'real';
  /** o que aparece ao lado do título ("Prévia · dados de hoje", "Demonstração"…) */
  rotulo: string;
  carregando: boolean;
  erro: string | null;
  leads: Lead[];
  marcar: (id: string, tipo: TipoMarca, texto?: string) => void;
  tirarMarca: (id: string, marcaId: string) => void;
  /** correção manual da leitura dos documentos (null = volta ao automático) */
  corrigirDocs: (id: string, estado: 'completos' | 'incompletos' | null) => void;
  tirarDaFila: (id: string) => void;
  numeros: (p: Periodo) => NumeroAtendente[] | null;
  /** relê a fila agora (o real; local não precisa) — o "Ver na fila" do aviso da Iris pede a fila fresca */
  recarregar?: () => Promise<void>;
}

/** começo do período (horário de Brasília). Mês = o mês da casa, do dia 11 ao dia 10 (regra do placar do CAF). */
export function inicioPeriodo(p: Periodo, agora = new Date()): Date {
  const d = new Date(agora);
  if (p === '7d') return new Date(agora.getTime() - 7 * 86_400_000);
  d.setHours(0, 0, 0, 0);
  if (p === 'hoje') return d;
  if (d.getDate() < 11) d.setMonth(d.getMonth() - 1);
  d.setDate(11);
  if (p === 'mes_ant') d.setMonth(d.getMonth() - 1);
  return d;
}

/** fim do período: agora; o mês passado termina onde o mês atual começa */
export function fimPeriodo(p: Periodo, agora = new Date()): Date {
  return p === 'mes_ant' ? inicioPeriodo('mes', agora) : new Date(agora.getTime() + 60_000);
}

/** "11/10 a 10/11", "11/11 até agora"… para a nota dos números */
export function textoPeriodo(p: Periodo, agora = new Date()): string {
  const dm = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
  if (p === 'hoje') return `hoje, ${dm(agora)}`;
  if (p === '7d') return 'últimos 7 dias';
  const ini = inicioPeriodo(p, agora);
  if (p === 'mes') return `mês da casa, ${dm(ini)} até hoje`;
  const fim = new Date(inicioPeriodo('mes', agora).getTime() - 86_400_000);
  return `mês da casa, ${dm(ini)} a ${dm(fim)}`;
}

/* recalcula a categoria e os textos quando o atendente corrige a documentação (só no modo local) */
function comDocs(l: Lead, estado: 'completos' | 'incompletos' | null): Lead {
  const docsManual = estado ?? undefined;
  const automatico = l.docPessoal && l.comprovante ? 'quente' : 'documentacao';
  const cat = l.cat === 'historico' || l.cat === 'sem_resposta' && !estado ? l.cat
    : docsManual === 'completos' ? 'quente' : docsManual === 'incompletos' ? 'documentacao' : automatico;
  const [situacao, curta] = textosDoLead({ ...l, cat, docsManual });
  return { ...l, cat, docsManual, lista: cat === 'quente' ? 1 : cat === 'documentacao' ? 3 : l.lista, situacao, curta };
}

/* ---------------------------------------------------------------- local (demonstração e prévia) */
export function useFonteLocal(inicial: Lead[], modo: 'demo' | 'previa', rotulo: string, numeros?: Partial<Record<Periodo, NumeroAtendente[]>>): FonteFila {
  const [leads, setLeads] = useState<Lead[]>(inicial);
  const mexer = (id: string, f: (l: Lead) => Lead | null) => setLeads((t) => t.flatMap((l) => {
    if (l.id !== id) return [l];
    const n = f(l);
    return n ? [n] : [];
  }));
  /* o recado do administrador da demonstração: o repasse troca o dono (a loja guarda; vale ao voltar para a página)
     e a loja consulta o dono/prioridade de agora — o último retrato fica valendo em qualquer página */
  const donos = useDonosLocais();
  const comDono = useMemo(() => (Object.keys(donos).length
    ? leads.map((l) => (donos[l.id] && donos[l.id] !== l.atendente ? { ...l, atendente: donos[l.id] } : l)) : leads), [leads, donos]);
  useEffect(() => {
    const retrato = new Map(comDono.map((l) => [l.id, { dono: l.atendente, cat: l.cat }]));
    registrarFilaLocal((id) => retrato.get(id) ?? null);
  }, [comDono]);
  return useMemo<FonteFila>(() => ({
    modo, rotulo, carregando: false, erro: null, leads: comDono,
    marcar: (id, tipo, texto) => mexer(id, (l) => {
      const agora = Date.now();
      if (tipo === 'nao_atendeu') {
        const ja = l.marcas.find((m) => m.tipo === 'nao_atendeu');
        const nova: Marca = ja ? { ...ja, vezes: (ja.vezes ?? 1) + 1, em: agora } : { id: `m${agora}`, tipo, vezes: 1, em: agora };
        return { ...l, marcas: [nova, ...l.marcas.filter((m) => m.tipo !== 'nao_atendeu')] };
      }
      if (tipo !== 'falta' && l.marcas.some((m) => m.tipo === tipo)) return l;
      return { ...l, marcas: [{ id: `m${agora}`, tipo, texto, em: agora }, ...l.marcas] };
    }),
    tirarMarca: (id, mid) => mexer(id, (l) => ({ ...l, marcas: l.marcas.filter((m) => m.id !== mid) })),
    corrigirDocs: (id, estado) => mexer(id, (l) => comDocs(l, estado)),
    tirarDaFila: (id) => mexer(id, () => null),
    numeros: (p) => numeros?.[p] ?? null,
  }), [comDono, modo, rotulo, numeros]);
}
