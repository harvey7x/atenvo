import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useOrg } from '@/context/OrgContext';

/* ------------------------------------------------------------------
   Checklist de documentos por oportunidade (card do Kanban).
   - checklist_modelo: 14 itens fixos, 3 seções, ordenados por `ordem`.
   - oportunidade_checklist: estado por card (upsert on conflict
     (oportunidade_id,item_slug)). feito_em/feito_por são carimbados
     por trigger no banco — o front NUNCA os escreve.
   O % de conclusão conta só itens obrigatorio=true (13); o item
   opcional 'documento_declarante' é marcável mas fica fora da conta.
   ------------------------------------------------------------------ */
export const CHECKLIST_REAL = isSupabaseConfigured && !!supabase;

export interface ChecklistSecao { key: string; titulo: string }
/** ordem de exibição + rótulo humano das seções (o banco guarda só o slug). */
export const CHECKLIST_SECOES: ChecklistSecao[] = [
  { key: 'meu_inss', titulo: 'Meu INSS' },
  { key: 'gov', titulo: 'GOV' },
  { key: 'documentos_cliente', titulo: 'Documentos do cliente' },
];

export interface ChecklistItem {
  slug: string; secao: string; rotulo: string; ordem: number; obrigatorio: boolean; feito: boolean;
}
interface ModeloItem { slug: string; secao: string; rotulo: string; ordem: number; obrigatorio: boolean }

/** Os 14 itens fixos. Global (não depende de org) e praticamente imutável → cache longo. */
function useChecklistModelo() {
  return useQuery({
    queryKey: ['checklist-modelo'],
    enabled: CHECKLIST_REAL,
    staleTime: 1000 * 60 * 60,
    queryFn: async (): Promise<ModeloItem[]> => {
      const { data, error } = await supabase!.from('checklist_modelo')
        .select('item_slug, secao, rotulo, ordem, obrigatorio')
        .order('ordem', { ascending: true });
      if (error) throw new Error(error.message);
      return (((data as unknown[]) ?? []) as Record<string, unknown>[]).map((r) => ({
        slug: r.item_slug as string, secao: r.secao as string, rotulo: r.rotulo as string,
        ordem: r.ordem as number, obrigatorio: r.obrigatorio as boolean,
      }));
    },
  });
}

/** Estado (feito) de cada item para UMA oportunidade → mapa slug→feito. */
function useChecklistEstado(oportunidadeId: string | null, org: string) {
  return useQuery({
    queryKey: ['opp-checklist', org, oportunidadeId],
    enabled: CHECKLIST_REAL && !!oportunidadeId,
    queryFn: async (): Promise<Record<string, boolean>> => {
      const { data, error } = await supabase!.from('oportunidade_checklist')
        .select('item_slug, feito').eq('oportunidade_id', oportunidadeId!);
      if (error) throw new Error(error.message);
      const m: Record<string, boolean> = {};
      for (const r of (((data as unknown[]) ?? []) as Record<string, unknown>[])) {
        m[r.item_slug as string] = r.feito === true;
      }
      return m;
    },
  });
}

export interface UseChecklist {
  itens: ChecklistItem[];
  secoes: ChecklistSecao[];
  loading: boolean;
  pct: number;           // obrigatórios marcados ÷ total de obrigatórios (0..100)
  obrFeitos: number;
  obrTotal: number;
  savingSlug: string | null;
  toggle: (slug: string, feito: boolean) => void;
}

export function useChecklist(oportunidadeId: string | null): UseChecklist {
  const { currentOrg } = useOrg();
  const org = currentOrg.id;
  const qc = useQueryClient();
  const modeloQ = useChecklistModelo();
  const estadoQ = useChecklistEstado(oportunidadeId, org);
  const chaveEstado = ['opp-checklist', org, oportunidadeId];

  const modelo = modeloQ.data ?? [];
  const estado = estadoQ.data ?? {};
  const itens: ChecklistItem[] = modelo.map((m) => ({ ...m, feito: estado[m.slug] === true }));

  const obrigatorios = itens.filter((i) => i.obrigatorio);
  const obrTotal = obrigatorios.length;
  const obrFeitos = obrigatorios.filter((i) => i.feito).length;
  const pct = obrTotal ? Math.round((obrFeitos / obrTotal) * 100) : 0;

  const mut = useMutation({
    mutationFn: async (v: { slug: string; feito: boolean }) => {
      if (!oportunidadeId) throw new Error('sem oportunidade');
      const { error } = await supabase!.from('oportunidade_checklist')
        .upsert(
          { organizacao_id: org, oportunidade_id: oportunidadeId, item_slug: v.slug, feito: v.feito },
          { onConflict: 'oportunidade_id,item_slug' },
        );
      if (error) throw new Error(error.message);
    },
    // otimista: a caixa responde na hora; reconcilia no fim.
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: chaveEstado });
      const anterior = qc.getQueryData<Record<string, boolean>>(chaveEstado);
      qc.setQueryData<Record<string, boolean>>(chaveEstado, { ...(anterior ?? {}), [v.slug]: v.feito });
      return { anterior };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.anterior) qc.setQueryData(chaveEstado, ctx.anterior);
    },
    onSettled: () => { qc.invalidateQueries({ queryKey: chaveEstado }); },
  });

  return {
    itens,
    secoes: CHECKLIST_SECOES,
    loading: modeloQ.isLoading || estadoQ.isLoading,
    pct, obrFeitos, obrTotal,
    savingSlug: mut.isPending ? (mut.variables?.slug ?? null) : null,
    toggle: (slug, feito) => mut.mutate({ slug, feito }),
  };
}
