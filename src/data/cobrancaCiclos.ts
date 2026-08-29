/* Ciclos de vencimento REAIS + clientes do Modo Cobrança (Fase C, 29/08).
   Regra do dono: cliente ENTRA NUM CICLO (turma do dia de vencimento),
   nunca numa data solta. Fundação da Fase 1 (ciclos_vencimento +
   ciclo_vencimento_competencias) ligada ao front. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, isDemoMode } from '@/lib/supabase';

export interface CicloReal {
  id: string;
  codigo: string;
  nome: string;
  grupo: 'inicio_mes' | 'fim_mes' | 'livre';
  ordem: number;
  clientes: number;
}
export interface ClienteCobranca {
  id: string;
  nome: string;
  telefone: string | null;
  valorMensal: number;
  status: string;
  atendente: string | null;
  ciclo: string | null;
}

/** dia de vencimento a partir do código D01..D31 (fallback: ordem) */
export function diaDoCiclo(c: { codigo: string; ordem: number }): number {
  const m = c.codigo.match(/^D(\d{1,2})$/i);
  return m ? Number(m[1]) : c.ordem || 1;
}

export function useCiclosReais(orgId?: string) {
  return useQuery({
    queryKey: ['cob-ciclos', orgId],
    enabled: !!orgId && !isDemoMode,
    queryFn: async () => {
      const { data, error } = await supabase!
        .from('ciclos_vencimento')
        .select('id, codigo, nome, grupo, ordem, cobrancas(count)')
        .eq('organizacao_id', orgId!)
        .order('ordem', { ascending: true });
      if (error) throw error;
      return (data ?? []).map((c) => ({
        id: c.id as string, codigo: c.codigo as string, nome: c.nome as string,
        grupo: c.grupo as CicloReal['grupo'], ordem: c.ordem as number,
        clientes: ((c.cobrancas as { count: number }[] | null)?.[0]?.count ?? 0),
      })) as CicloReal[];
    },
  });
}

/** cria a turma a partir do DIA e semeia as competências (atual + 3) */
export function useCriarCiclo(orgId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (dia: number) => {
      if (!orgId) throw new Error('Sem organização.');
      if (!Number.isInteger(dia) || dia < 1 || dia > 31) throw new Error('Dia inválido (1 a 31).');
      const codigo = `D${String(dia).padStart(2, '0')}`;
      const grupo = dia <= 10 ? 'inicio_mes' : dia >= 20 ? 'fim_mes' : 'livre';
      const { data, error } = await supabase!
        .from('ciclos_vencimento')
        .insert({ organizacao_id: orgId, codigo, nome: `Vence dia ${String(dia).padStart(2, '0')}`, grupo, ordem: dia })
        .select('id').single();
      if (error) throw new Error(/duplicate|unique/i.test(error.message) ? `O ciclo ${codigo} já existe.` : error.message);
      // competências: mês corrente + 3 (o cron garantir_competencias_futuras estende o padrão)
      const hoje = new Date();
      const comps = Array.from({ length: 4 }, (_, k) => {
        const base = new Date(hoje.getFullYear(), hoje.getMonth() + k, 1);
        const ultimo = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
        const venc = new Date(base.getFullYear(), base.getMonth(), Math.min(dia, ultimo));
        return {
          organizacao_id: orgId, ciclo_vencimento_id: data!.id as string,
          competencia: base.toISOString().slice(0, 10), vencimento: venc.toISOString().slice(0, 10),
        };
      });
      const { error: eComp } = await supabase!.from('ciclo_vencimento_competencias').insert(comps);
      if (eComp) throw new Error(`Ciclo criado, mas falhou ao semear competências: ${eComp.message}`);
      return data!.id as string;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['cob-ciclos', orgId] }); },
  });
}

export function useClientesCobranca(orgId?: string) {
  return useQuery({
    queryKey: ['cob-clientes', orgId],
    enabled: !!orgId && !isDemoMode,
    queryFn: async () => {
      const { data, error } = await supabase!
        .from('cobrancas')
        .select('id, valor_mensal, status, contato:contatos(nome, telefone), responsavel:usuarios(nome), ciclo:ciclos_vencimento(codigo)')
        .eq('organizacao_id', orgId!)
        .neq('status', 'cancelado')
        .order('criado_em', { ascending: false });
      if (error) throw error;
      return (data ?? []).map((r) => {
        const contato = r.contato as unknown as { nome: string | null; telefone: string | null } | null;
        return {
          id: r.id as string,
          nome: contato?.nome ?? 'Sem nome',
          telefone: contato?.telefone ?? null,
          valorMensal: Number(r.valor_mensal ?? 0),
          status: r.status as string,
          atendente: (r.responsavel as unknown as { nome: string | null } | null)?.nome ?? null,
          ciclo: (r.ciclo as unknown as { codigo: string | null } | null)?.codigo ?? null,
        } as ClienteCobranca;
      });
    },
  });
}

/** amarra a cobrança recém-criada à turma (o RPC de criação não conhece ciclo) */
export async function vincularCiclo(cobrancaId: string, cicloId: string): Promise<void> {
  const { error } = await supabase!.from('cobrancas').update({ ciclo_vencimento_id: cicloId }).eq('id', cobrancaId);
  if (error) throw new Error(error.message);
}

/** cria o CONTATO do cliente novo de cobrança (nome + WhatsApp) */
export async function criarContatoCobranca(orgId: string, nome: string, whatsapp: string): Promise<string> {
  const tel = whatsapp.replace(/\D/g, '');
  const { data, error } = await supabase!
    .from('contatos')
    .insert({ organizacao_id: orgId, nome: nome.trim(), telefone: tel || null })
    .select('id').single();
  if (error) throw new Error(error.message);
  return data!.id as string;
}
