import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useOrg } from '@/context/OrgContext';

export const COB_REAL = isSupabaseConfigured && !!supabase;

export type ParcelaStatus = 'prevista' | 'paga' | 'nao_paga' | 'cancelada';

export interface CobrancaParcela {
  id: string; ciclo: number; valor: number; valorPago: number | null;
  dataPrevista: string | null; dataPagamento: string | null; status: ParcelaStatus; observacoes: string;
  atrasada: boolean;
}
export interface CobrancaEvento { id: string; tipo: string; descricao: string; dados: Record<string, unknown>; autorNome: string; criadoEm: string; }
export interface Cobranca {
  id: string; contatoId: string; contatoNome: string; contatoTelefone: string; contatoCpf: string;
  responsavelId: string | null; responsavelNome: string; servico: string;
  valorMensal: number; ciclosTotais: number; ciclosPagos: number; ciclosRestantes: number;
  proximaCobranca: string | null; status: string; dataInicio: string | null; observacoes: string; criadoEm: string;
}
export interface CobrancaDetalhe extends Cobranca { parcelas: CobrancaParcela[]; eventos: CobrancaEvento[]; }

const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);
const hoje = () => new Date().toISOString().slice(0, 10);

function mapParcela(r: Record<string, unknown>): CobrancaParcela {
  const status = (r.status as ParcelaStatus) ?? 'prevista';
  const dp = (r.data_prevista as string) ?? null;
  return {
    id: r.id as string, ciclo: (r.ciclo as number) ?? 0, valor: Number(r.valor ?? 0), valorPago: r.valor_pago != null ? Number(r.valor_pago) : null,
    dataPrevista: dp, dataPagamento: (r.data_pagamento as string) ?? null, status, observacoes: (r.observacoes as string) || '',
    atrasada: status === 'prevista' && !!dp && dp < hoje(),
  };
}
function mapCobranca(r: Record<string, unknown>): Cobranca {
  const ct = one(r.contatos as Record<string, unknown> | Record<string, unknown>[] | null);
  const rp = one(r.responsavel as { nome: string } | { nome: string }[] | null);
  return {
    id: r.id as string, contatoId: r.contato_id as string,
    contatoNome: (ct?.nome as string) || 'Cliente', contatoTelefone: (ct?.telefone as string) || '', contatoCpf: (ct?.cpf as string) || '',
    responsavelId: (r.responsavel_id as string) ?? null, responsavelNome: rp?.nome || '',
    servico: (r.servico as string) || '', valorMensal: Number(r.valor_mensal ?? 0),
    ciclosTotais: (r.ciclos_totais as number) ?? 0, ciclosPagos: (r.ciclos_pagos as number) ?? 0, ciclosRestantes: (r.ciclos_restantes as number) ?? 0,
    proximaCobranca: (r.proxima_cobranca as string) ?? null, status: (r.status as string) || 'ativo',
    dataInicio: (r.data_inicio as string) ?? null, observacoes: (r.observacoes as string) || '', criadoEm: (r.criado_em as string) || '',
  };
}

const SEL_COB = 'id, contato_id, responsavel_id, servico, valor_mensal, ciclos_totais, ciclos_pagos, ciclos_restantes, proxima_cobranca, status, data_inicio, observacoes, criado_em, contatos(nome, telefone, cpf), responsavel:usuarios!cobrancas_responsavel_id_fkey(nome)';

export function useCobrancas() {
  const { currentOrg } = useOrg();
  const org = currentOrg.id;
  return useQuery({
    queryKey: ['cobrancas', org],
    enabled: COB_REAL,
    queryFn: async (): Promise<Cobranca[]> => {
      const { data, error } = await supabase!.from('cobrancas').select(SEL_COB)
        .eq('organizacao_id', org).order('criado_em', { ascending: false });
      if (error) throw new Error(error.message);
      return ((data as unknown[]) ?? []).map((r) => mapCobranca(r as Record<string, unknown>));
    },
  });
}

export function useCobranca(id: string | null) {
  const { currentOrg } = useOrg();
  const org = currentOrg.id;
  return useQuery({
    queryKey: ['cobranca', org, id],
    enabled: COB_REAL && !!id,
    queryFn: async (): Promise<CobrancaDetalhe | null> => {
      const { data, error } = await supabase!.from('cobrancas')
        .select(SEL_COB + ', cobranca_pagamentos(*), cobranca_eventos(id, tipo, descricao, dados, criado_em, usuarios(nome))')
        .eq('id', id!).maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return null;
      const r = data as unknown as Record<string, unknown>;
      const parcelas = (((r.cobranca_pagamentos as unknown[]) ?? []) as Record<string, unknown>[]).map(mapParcela).sort((a, b) => a.ciclo - b.ciclo);
      const eventos = (((r.cobranca_eventos as unknown[]) ?? []) as Record<string, unknown>[])
        .map((e) => ({ id: e.id as string, tipo: e.tipo as string, descricao: (e.descricao as string) || '', dados: (e.dados as Record<string, unknown>) || {}, autorNome: (one(e.usuarios as { nome: string } | { nome: string }[] | null)?.nome) || '', criadoEm: (e.criado_em as string) || '' }))
        .sort((a, b) => (a.criadoEm < b.criadoEm ? 1 : -1));
      return { ...mapCobranca(r), parcelas, eventos };
    },
  });
}

export interface CobMetrica { previstoMes: number; recebidoMes: number; emAtraso: number; aReceber: number; }
export interface PrevisaoMes { mes: string; previsto: number; recebido: number; atraso: number; qtd: number; }

export function useCobrancasMetricas() {
  const { currentOrg } = useOrg();
  const org = currentOrg.id;
  return useQuery({
    queryKey: ['cobrancas-metricas', org],
    enabled: COB_REAL,
    queryFn: async (): Promise<{ m: CobMetrica; previsao: PrevisaoMes[] }> => {
      const { data, error } = await supabase!.from('cobranca_pagamentos').select('status, valor, valor_pago, data_prevista, data_pagamento').eq('organizacao_id', org);
      if (error) throw new Error(error.message);
      const ps = (((data as unknown[]) ?? []) as Record<string, unknown>[]).map(mapParcela);
      const h = hoje(); const mesAtual = h.slice(0, 7);
      const m: CobMetrica = { previstoMes: 0, recebidoMes: 0, emAtraso: 0, aReceber: 0 };
      const prevMap = new Map<string, PrevisaoMes>();
      const refs: string[] = [];
      const d0 = new Date(h + 'T00:00:00');
      for (let i = 0; i < 6; i++) { const d = new Date(d0.getFullYear(), d0.getMonth() + i, 1); const k = d.toISOString().slice(0, 7); refs.push(k); prevMap.set(k, { mes: k, previsto: 0, recebido: 0, atraso: 0, qtd: 0 }); }
      for (const p of ps) {
        if (p.status === 'cancelada') continue;
        const mesVenc = (p.dataPrevista || '').slice(0, 7);
        if (mesVenc === mesAtual) m.previstoMes += p.valor;
        if (p.status === 'paga' && (p.dataPagamento || '').slice(0, 7) === mesAtual) m.recebidoMes += p.valorPago ?? 0;
        if (p.atrasada) m.emAtraso += p.valor;
        if (p.status === 'prevista' || p.status === 'nao_paga') m.aReceber += p.valor;
        const pm = prevMap.get(mesVenc);
        if (pm) { pm.previsto += p.valor; pm.qtd += 1; if (p.status === 'paga') pm.recebido += p.valorPago ?? 0; if (p.atrasada || p.status === 'nao_paga') pm.atraso += p.valor; }
      }
      return { m, previsao: refs.map((k) => prevMap.get(k)!) };
    },
  });
}

function useInvalidar() {
  const qc = useQueryClient();
  const { currentOrg } = useOrg();
  return (id?: string | null) => {
    qc.invalidateQueries({ queryKey: ['cobrancas', currentOrg.id] });
    qc.invalidateQueries({ queryKey: ['cobrancas-metricas', currentOrg.id] });
    if (id) qc.invalidateQueries({ queryKey: ['cobranca', currentOrg.id, id] });
  };
}

export function useCriarCobranca() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async (p: { contatoId: string; valor: number; dataPrimeira: string; ciclos: number; responsavelId?: string | null; servico?: string | null; observacoes?: string | null }): Promise<string> => {
      const { data, error } = await supabase!.rpc('criar_cobranca_com_parcelas', {
        p_contato: p.contatoId, p_valor: p.valor, p_data_primeira: p.dataPrimeira, p_ciclos: p.ciclos,
        p_responsavel: p.responsavelId ?? null, p_servico: p.servico ?? null, p_observacoes: p.observacoes ?? null,
      });
      if (error) throw new Error(error.message);
      return data as string;
    },
    onSuccess: () => invalidar(),
  });
}

export function useRegistrarBaixa() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async (p: { parcelaId: string; cobrancaId: string; data?: string; obs?: string | null }) => {
      const { error } = await supabase!.rpc('registrar_baixa_parcela', { p_parcela: p.parcelaId, p_data: p.data ?? hoje(), p_obs: p.obs ?? null });
      if (error) throw new Error(error.message);
    },
    onSuccess: (_d, v) => invalidar(v.cobrancaId),
  });
}

export function useAlterarStatusParcela() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async (p: { parcelaId: string; cobrancaId: string; novo: ParcelaStatus; obs?: string | null }) => {
      const { error } = await supabase!.rpc('alterar_status_parcela', { p_parcela: p.parcelaId, p_novo: p.novo, p_obs: p.obs ?? null });
      if (error) throw new Error(error.message);
    },
    onSuccess: (_d, v) => invalidar(v.cobrancaId),
  });
}

export function useCancelarCobranca() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async (p: { cobrancaId: string; obs?: string | null }) => {
      const { error } = await supabase!.rpc('cancelar_cobranca', { p_cobranca: p.cobrancaId, p_obs: p.obs ?? null });
      if (error) throw new Error(error.message);
    },
    onSuccess: (_d, v) => invalidar(v.cobrancaId),
  });
}

// rótulos/UI
export const statusCobrancaLabel = (s: string) => (s === 'finalizado' ? 'Concluída' : s === 'cancelado' ? 'Cancelada' : 'Ativa');
export const statusParcelaLabel: Record<ParcelaStatus, string> = { prevista: 'Prevista', paga: 'Paga', nao_paga: 'Não paga', cancelada: 'Cancelada' };
