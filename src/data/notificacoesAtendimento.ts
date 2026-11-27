import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useOrg } from '@/context/OrgContext';
import type { Notificacao } from '@/data/remarketing';
import { temRecurso } from '@/v2/data/config/recursos';

/* ------------------------------------------------------------------
   OS AVISOS DO ATENDIMENTO NO SINO DO TOPO (25/11). Na Reviza o sino mostrava só os avisos das Cobranças
   (tabela notificacoes); os do Atendimento (atd_notificacoes: alguém marcou você com @ numa nota, cliente
   esperando além da meta…) eram gravados e não apareciam em lugar nenhum. Agora entram no mesmo sino, com
   o id "atd:<id>" para saber onde marcar como lido. RLS: cada pessoa vê só as suas (e as da empresa toda).
   DEMO É O CONTRATO: sem backend, um aviso de exemplo de cada tipo.
   ------------------------------------------------------------------ */

const REAL: boolean = isSupabaseConfigured && !!supabase;
const K = ['atd-notificacoes'] as const;
export const PREFIXO_ATD = 'atd:';
const LS = 'previa-atd-notif-lidas';
const lerLidas = (): Record<string, string> => { try { const m = JSON.parse(localStorage.getItem(LS) ?? '{}'); return m && typeof m === 'object' ? m : {}; } catch { return {}; } };
const minAtras = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
const DEMO: Omit<Notificacao, 'lidaEm'>[] = [
  { id: PREFIXO_ATD + 'demo-espera', tipo: 'espera_meta_gestor', titulo: 'Cliente sem resposta há 58 min', corpo: 'José Carlos Ferreira · sem responsável. A meta da equipe é 30 min.', rota: '/whatsapp?conversa=wa-jose', criadoEm: minAtras(28) },
  { id: PREFIXO_ATD + 'demo-mencao', tipo: 'nota_mencao', titulo: 'Henrique marcou você numa nota', corpo: 'Ivone Castro dos Santos: consegue ligar para ela depois das 18h?', rota: '/whatsapp?conversa=wa-ivone', criadoEm: minAtras(95) },
];

export function useNotificacoesAtendimento(habilitado: boolean) {
  const { currentOrg } = useOrg();
  return useQuery<Notificacao[]>({
    queryKey: [...K, currentOrg.id],
    enabled: habilitado,
    staleTime: 10_000,
    refetchInterval: 30_000,
    queryFn: async () => {
      if (!REAL) {
        const l = lerLidas();
        return DEMO.filter((n) => (n.tipo === 'nota_mencao' ? temRecurso('notas') : temRecurso('aviso-espera'))).map((n) => ({ ...n, lidaEm: l[n.id] ?? null }));
      }
      // o que não foi lido + o que chegou nas últimas 24 h (como o sino do Atenvo)
      const desde = new Date(Date.now() - 24 * 3600_000).toISOString();
      const { data, error } = await supabase!.from('atd_notificacoes')
        .select('id, tipo, titulo, corpo, rota, lida_em, criado_em')
        .eq('organizacao_id', currentOrg.id)
        .or(`lida_em.is.null,criado_em.gte."${desde}"`) // a data entre aspas: tem ":" e "." (como o sino do Atenvo)
        .order('criado_em', { ascending: false }).limit(40);
      if (error) throw new Error(error.message);
      return (data ?? []).map((r) => ({
        id: PREFIXO_ATD + String(r.id), tipo: String(r.tipo), titulo: String(r.titulo),
        corpo: (r.corpo as string) || null, rota: (r.rota as string) || null,
        lidaEm: (r.lida_em as string) ?? null, criadoEm: String(r.criado_em),
      }));
    },
  });
}

export function useMarcarNotificacaoAtendimento() {
  const { currentOrg } = useOrg();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (a: { id?: string; todas?: boolean }) => {
      if (!REAL) {
        const l = lerLidas(); const agora = new Date().toISOString();
        if (a.todas) for (const n of DEMO) l[n.id] = l[n.id] ?? agora; else if (a.id) l[a.id] = agora;
        try { localStorage.setItem(LS, JSON.stringify(l)); } catch { /* privado */ }
        return;
      }
      const { error } = a.todas
        ? await supabase!.rpc('notificacoes_marcar_todas', { p_org: currentOrg.id })
        : await supabase!.rpc('notificacao_marcar_lida', { p_id: (a.id ?? '').replace(PREFIXO_ATD, '') });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: K }); },
  });
}
