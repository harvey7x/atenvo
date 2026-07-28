import { useQuery } from '@tanstack/react-query';
import { useOrg } from '@/context/OrgContext';
import { supabase } from '@/lib/supabase';
import { SCRIPTS_REAL, type EtapaTipo } from '@/data/scripts';

/* Resumo de etapas por script para os cards do arsenal (Scripts v2.1).
   ESPELHA a consulta do hook existente useScriptEtapaCounts (mesma tabela
   script_etapas, mesmo escopo por organização/RLS, mesmo custo), ampliando
   apenas as colunas lidas (posicao, nome_arquivo) para o card poder dizer
   "Sequência · N passos" e mostrar tipo+nome do anexo — nunca "—".
   Nenhuma mutação; apresentação de dados da própria página. */

export interface ResumoEtapas {
  total: number;
  /** primeira etapa na ordem (para o card de script só-mídia) */
  primeira?: { tipo: EtapaTipo; nome: string | null };
  temMidia: boolean;
}

export function useScriptsResumoEtapas() {
  const { currentOrg } = useOrg();
  return useQuery({
    queryKey: ['v2-scripts-resumo-etapas', currentOrg.id],
    enabled: SCRIPTS_REAL,
    queryFn: async (): Promise<Record<string, ResumoEtapas>> => {
      const { data, error } = await supabase!
        .from('script_etapas')
        .select('script_id, tipo, nome_arquivo, posicao')
        .eq('organizacao_id', currentOrg.id)
        .order('posicao', { ascending: true });
      if (error) throw new Error(error.message);
      const map: Record<string, ResumoEtapas> = {};
      for (const r of (data as { script_id: string; tipo: EtapaTipo; nome_arquivo: string | null }[]) ?? []) {
        const m = map[r.script_id] ?? (map[r.script_id] = { total: 0, temMidia: false });
        m.total += 1;
        if (!m.primeira) m.primeira = { tipo: r.tipo, nome: r.nome_arquivo };
        if (r.tipo !== 'texto') m.temMidia = true;
      }
      return map;
    },
  });
}
