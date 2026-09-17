/* ============================================================
   Sala SDR — Fase 2.0: dados REAIS (a FOTO do escritório)
   ------------------------------------------------------------
   Monta o contrato SalaState (v2/sala/tipos.ts) a partir do Supabase
   real, copiando o padrão da casa (src/data/*.ts): query escopada na
   org (organizacao_id), gated por SALA_REAL, react-query. Em DEMO o
   client é null → SALA_REAL=false → o hook fica desligado e o motor
   cai no mock (nada quebra).

   Fase 2.0 = FOTO ESTÁTICA: as oportunidades ABERTAS viram bonecos,
   posicionados na zona da etapa atual (coluna do funil). O MOVIMENTO
   ao vivo (realtime das transições) é a Fase 2.1; conversa/histórico
   e agregados ricos são 2.1/2.2. Aqui só a distribuição real.
   ============================================================ */
import { useQuery } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useOrg } from '@/context/OrgContext';
import type { SalaState, LeadView, AtendenteView, EtapaLead, OrigemLead } from '@/v2/sala/tipos';

/** true só quando há Supabase real configurado (null em demo). Espelha KANBAN_REAL/DASH_REAL. */
export const SALA_REAL = isSupabaseConfigured && !!supabase;

/** SDRs reais da CAF → mesas gi/ju/ma da cena (config.ts). Fase 2.3 generaliza. */
export const SDR_DESK: Record<string, { desk: string; nome: string }> = {
  'a31b5fcb-d378-4490-83fe-a47a7c1ee847': { desk: 'gi', nome: 'Giovana' },
  'd7e59652-d3eb-4d7d-8830-7fc780701a8e': { desk: 'ju', nome: 'Juliana' },
  '4ac197b4-9600-4756-81aa-1ac29280df09': { desk: 'ma', nome: 'Matheus' },
};

/** Teto de bonecos na cena (recorte pedido pelo dono); o excedente vira contagem no HUD. */
const TETO_BONECOS = 60;

interface Coluna { id: string; nome: string; ordem: number; resultado: string; papel: string | null; entrada: boolean }
interface OppRow {
  id: string; contato_nome: string | null; titulo: string | null; telefone: string | null;
  responsavel_id: string | null; coluna_id: string | null; status: string | null; origem: string | null;
  entrada_em: string | null; movimentado_em: string | null; fechado_em: string | null; motivo_nao_elegivel: string | null;
  contatos: { nome: string | null; telefone: string | null } | { nome: string | null; telefone: string | null }[] | null;
}
/** Embeds do PostgREST vêm como T | T[] | null — normaliza pra T | null (padrão kanban.ts). */
function one<T>(v: T | T[] | null | undefined): T | null { return Array.isArray(v) ? (v[0] ?? null) : (v ?? null); }

/** coluna do funil (+status) → etapa da sala. Fonte da verdade = resultado/papel/ordem, NÃO o nome cru. */
export function etapaDaOpp(col: Coluna | null, status: string | null, motivoNE: string | null): EtapaLead {
  if (status === 'ganho' || col?.resultado === 'ganho') return 'caso_aberto';
  if (status === 'perdido' || col?.resultado === 'perdido') return motivoNE ? 'nao_legivel' : 'perdido';
  const nome = (col?.nome || '').toLowerCase();
  if (nome.includes('remarketing')) return 'remarketing';
  if (nome.includes('assinar') || nome.includes('assinatura')) return 'assinatura';
  if (col?.papel === 'producao' || nome.includes('documento')) return 'documentacao';
  if (col?.papel === 'qualificado' || nome.includes('qualific') || nome.includes('reuni')) return 'na_mesa';
  if (col?.entrada || col?.ordem === 0 || nome.includes('lead novo')) return 'chegando';
  return 'na_mesa';
}

function atendentesBase(): AtendenteView[] {
  return Object.values(SDR_DESK).map((s) => ({ id: s.desk, nome: s.nome, online: true }));
}

export interface SalaRealResult {
  estado: SalaState | null; // null quando desligado/carregando → motor usa mock
  total: number;            // total de oportunidades abertas (mesmo além do teto de bonecos)
  carregando: boolean;
  erro: Error | null;
}

/** Hook da FOTO real. Desligado em demo/sem-org (estado=null → motor mock). */
export function useSalaReal(): SalaRealResult {
  const { currentOrg } = useOrg();
  const org = currentOrg?.id ?? null;

  const q = useQuery({
    queryKey: ['sala-foto', org],
    enabled: SALA_REAL && !!org,
    refetchInterval: 20_000, // Fase 2.0: polling; realtime das transições entra na 2.1
    staleTime: 15_000,
    queryFn: async (): Promise<{ estado: SalaState; total: number }> => {
      // 1) funil PADRÃO da org + suas colunas (o de-para coluna→etapa)
      const { data: funis, error: eF } = await supabase!
        .from('funis').select('id').eq('organizacao_id', org!).eq('padrao', true).limit(1);
      if (eF) throw new Error(eF.message);
      const funilId = funis?.[0]?.id as string | undefined;
      if (!funilId) return { estado: { semanaAtual: 0, leads: [], atendentes: atendentesBase() }, total: 0 };

      const { data: cols, error: eC } = await supabase!
        .from('funil_colunas').select('id, nome, ordem, resultado, papel, entrada').eq('funil_id', funilId);
      if (eC) throw new Error(eC.message);
      const colMap = new Map<string, Coluna>();
      for (const c of (cols ?? []) as Coluna[]) colMap.set(c.id, c);

      // 2) oportunidades ABERTAS (recorte: mais recém-movimentadas primeiro) + total exato p/ o HUD
      const { data: opps, error: eO, count } = await supabase!
        .from('oportunidades')
        .select('id, contato_nome, titulo, telefone, responsavel_id, coluna_id, status, origem, entrada_em, movimentado_em, fechado_em, motivo_nao_elegivel, contatos(nome, telefone)', { count: 'exact' })
        .eq('organizacao_id', org!).eq('funil_id', funilId).eq('status', 'em_andamento')
        .order('movimentado_em', { ascending: false }).limit(TETO_BONECOS);
      if (eO) throw new Error(eO.message);

      const leads: LeadView[] = ((opps ?? []) as OppRow[]).map((o) => {
        const col = o.coluna_id ? colMap.get(o.coluna_id) ?? null : null;
        const etapa = etapaDaOpp(col, o.status, o.motivo_nao_elegivel);
        const ct = one(o.contatos);
        const origem: OrigemLead = etapa === 'remarketing' ? 'remarketing' : 'anuncio';
        const atendenteId = o.responsavel_id && SDR_DESK[o.responsavel_id] ? SDR_DESK[o.responsavel_id].desk : null;
        return {
          id: o.id,
          nome: o.contato_nome || ct?.nome || o.titulo || 'Lead',
          telefone: o.telefone || ct?.telefone || '',
          cidade: '', // contatos não tem cidade; enriquecimento fica p/ Fase 2 (ficha)
          origem,
          etapa,
          atendenteId,
          motivo: etapa === 'nao_legivel' ? o.motivo_nao_elegivel ?? undefined : undefined,
          semanaEntrada: 0,
          triagemPasso: 0,
          docsEnviados: 0,
          ultimaInteracaoEm: o.movimentado_em || o.entrada_em || new Date().toISOString(),
          conversa: [],
          historico: [],
        } satisfies LeadView;
      });

      return { estado: { semanaAtual: 0, leads, atendentes: atendentesBase() }, total: count ?? leads.length };
    },
  });

  return { estado: q.data?.estado ?? null, total: q.data?.total ?? 0, carregando: q.isLoading, erro: (q.error as Error) ?? null };
}
