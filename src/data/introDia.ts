import { useQuery } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useOrg } from '@/context/OrgContext';

/* ------------------------------------------------------------------
   Briefing da Intro do dia — 2 contagens head:true (0 bytes de payload),
   molde do pedQ de dashboard.ts. NÃO usar a lista do inbox como fonte:
   o fetch dela carrega todas as conversas com embeds (já chegou a 5,5 MB).
   Critérios espelham as abas do inbox:
   - "clientes pra atender" = aba Não atribuídos: conversa aberta, não
     arquivada, e o DONO é contatos.responsavel_id IS NULL (não
     conversas.atendente_id — usar atendente_id divergiria da aba).
   - "não lidas" = nao_lidas > 0 (a aba Pendentes exata não dá em SQL:
     `aguardando` é derivado client-side da última mensagem).
   ------------------------------------------------------------------ */

export const BRIEF_REAL = isSupabaseConfigured && !!supabase;

export interface BriefingDia {
  paraAtender: number;
  naoLidas: number;
  /** oportunidades status='ganho' fechadas nos últimos 7 dias — mesmo
      predicado do ganhos_qtd da RPC dashboard_resumo */
  fechadosSemana: number;
}

/** demo: números coerentes com o seed do inbox (Não atribuídos 2 · Não lidas 3) */
export const seedBriefingDia = (): BriefingDia => ({ paraAtender: 2, naoLidas: 3, fechadosSemana: 5 });

export function useBriefingDia(ativo: boolean) {
  const { currentOrg } = useOrg();
  const org = currentOrg?.id;
  return useQuery({
    queryKey: ['briefing-dia', org],
    enabled: BRIEF_REAL && !!org && ativo,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<BriefingDia> => {
      const semDonoQ = supabase!
        .from('conversas')
        .select('id, contatos!inner(responsavel_id)', { count: 'exact', head: true })
        .eq('organizacao_id', org!)
        .is('arquivada_em', null)
        .not('status', 'in', '("resolvida","fechada")')
        .is('contatos.responsavel_id', null);
      const naoLidasQ = supabase!
        .from('conversas')
        .select('id', { count: 'exact', head: true })
        .eq('organizacao_id', org!)
        .is('arquivada_em', null)
        .not('status', 'in', '("resolvida","fechada")')
        .gt('nao_lidas', 0);
      const seteDiasAtras = new Date(Date.now() - 7 * 86_400_000).toISOString();
      const fechadosQ = supabase!
        .from('oportunidades')
        .select('id', { count: 'exact', head: true })
        .eq('organizacao_id', org!)
        .eq('status', 'ganho')
        .gte('fechado_em', seteDiasAtras);
      const [semDono, naoLidas, fechados] = await Promise.all([semDonoQ, naoLidasQ, fechadosQ]);
      if (semDono.error) throw semDono.error;
      if (naoLidas.error) throw naoLidas.error;
      if (fechados.error) throw fechados.error;
      return {
        paraAtender: semDono.count ?? 0,
        naoLidas: naoLidas.count ?? 0,
        fechadosSemana: fechados.count ?? 0,
      };
    },
  });
}
