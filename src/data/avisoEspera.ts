import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useOrg } from '@/context/OrgContext';

/* ------------------------------------------------------------------
   AVISO DE CLIENTE ESPERANDO ALÉM DA META (25/11, "algo melhor que" o sistema que a Reviza usava antes: lá o
   tempo de resposta só aparecia no relatório, depois do fato). Aqui o sino avisa ENQUANTO o cliente espera:
   passou da meta → o responsável pela conversa; passou do segundo tempo → os gestores (administrador e gestor);
   conversa sem responsável → direto para os gestores. Resposta da equipe ou da IA encerra a espera.
   Servidor: migration 106 (atd_aviso_espera + o agendador a cada 2 min, atd_aviso_espera_tick). Os avisos
   caem em atd_notificacoes (tipos 'espera_meta' e 'espera_meta_gestor') e aparecem no sino do topo.
   Configurações › Atendimento › Aviso de espera (só administrador). Chega DESLIGADO.
   DEMO É O CONTRATO: sem backend os mesmos hooks guardam no navegador e a lista "agora" usa as conversas de exemplo.
   ------------------------------------------------------------------ */

export const AVISO_REAL: boolean = isSupabaseConfigured && !!supabase;

export type ModoEspera = 'uteis' | 'corrido';
export interface ConfigAvisoEspera {
  ativo: boolean;
  metaMin: number;
  gestorAposMin: number;
  modo: ModoEspera;
  avisarResponsavel: boolean;
  avisarGestores: boolean;
  ligadoEm: string | null;
}
export interface EsperandoAgora { conversaId: string; contato: string; responsavel: string | null; esperaMin: number; desde: string | null }

export const AVISO_PADRAO: ConfigAvisoEspera = { ativo: false, metaMin: 30, gestorAposMin: 60, modo: 'uteis', avisarResponsavel: true, avisarGestores: true, ligadoEm: null };
/* limites (os mesmos da migration 106) */
export const META_MIN = 5, META_MAX = 480, GESTOR_MAX = 1440;
export const OPCOES_META = [10, 15, 20, 30, 45, 60, 90, 120];
export const OPCOES_GESTOR = [30, 45, 60, 90, 120, 180, 240];

/** "1 h 05 min" — a mesma conta do servidor (private.atd_fmt_minutos) */
export function fmtMinutos(m: number): string {
  const v = Math.max(0, Math.round(m));
  if (v < 60) return `${v} min`;
  const h = Math.floor(v / 60), r = v % 60;
  return r === 0 ? `${h} h` : `${h} h ${String(r).padStart(2, '0')} min`;
}

export function validarAviso(c: ConfigAvisoEspera): string | null {
  if (!Number.isFinite(c.metaMin) || c.metaMin < META_MIN || c.metaMin > META_MAX) return `A meta vai de ${META_MIN} minutos a ${fmtMinutos(META_MAX)}.`;
  if (!Number.isFinite(c.gestorAposMin) || c.gestorAposMin > GESTOR_MAX) return `O aviso aos gestores vai até ${fmtMinutos(GESTOR_MAX)}.`;
  if (c.gestorAposMin < c.metaMin) return 'O aviso aos gestores precisa vir depois da meta (ou junto com ela).';
  if (c.ativo && !c.avisarResponsavel && !c.avisarGestores) return 'Escolha quem recebe o aviso: o responsável, os gestores ou os dois.';
  return null;
}

/** quem recebe e quando, numa frase (a tela e o teste usam) — a mesma regra do agendador da migration 106 */
export function quemRecebe(c: Pick<ConfigAvisoEspera, 'metaMin' | 'gestorAposMin' | 'avisarResponsavel' | 'avisarGestores'>): string {
  const r = c.avisarResponsavel ? `o responsável com ${fmtMinutos(c.metaMin)} sem resposta` : null;
  const g = !c.avisarGestores ? null : c.gestorAposMin > c.metaMin
    ? `os gestores com ${fmtMinutos(c.gestorAposMin)} (ou com ${fmtMinutos(c.metaMin)}, se a conversa não tiver responsável)`
    : `os gestores com ${fmtMinutos(c.metaMin)}`;
  if (r && g) return `Avisa ${r} e ${g}.`;
  if (r) return `Avisa ${r}.`;
  if (g) return `Avisa ${g}.`;
  return 'Ninguém recebe o aviso.';
}

const normalizar = (r: Record<string, unknown> | null | undefined): ConfigAvisoEspera => (!r ? AVISO_PADRAO : {
  ativo: r.ativo === true,
  metaMin: Number(r.meta_min) || AVISO_PADRAO.metaMin,
  gestorAposMin: Number(r.gestor_apos_min) || AVISO_PADRAO.gestorAposMin,
  modo: r.modo === 'corrido' ? 'corrido' : 'uteis',
  avisarResponsavel: r.avisar_responsavel !== false,
  avisarGestores: r.avisar_gestores !== false,
  ligadoEm: typeof r.ligado_em === 'string' ? r.ligado_em : null,
});

/* ---------------- demonstração ---------------- */
const GUARDA = 'previa-aviso-espera';
const lerDemo = (): ConfigAvisoEspera => { try { const v = JSON.parse(localStorage.getItem(GUARDA) ?? 'null'); return v ? { ...AVISO_PADRAO, ...v } : AVISO_PADRAO; } catch { return AVISO_PADRAO; } };
const gravarDemo = (c: ConfigAvisoEspera) => { try { localStorage.setItem(GUARDA, JSON.stringify(c)); } catch { /* privado */ } };
const espera = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
/** as conversas de exemplo que estão esperando (os mesmos tempos da lista do WhatsApp de demonstração) */
export const ESPERANDO_DEMO: EsperandoAgora[] = [
  { conversaId: 'wa-jose', contato: 'José Carlos Ferreira', responsavel: null, esperaMin: 58, desde: null },
  { conversaId: 'wa-ivone', contato: 'Ivone Castro dos Santos', responsavel: 'Henrique', esperaMin: 18, desde: null },
  { conversaId: 'wa-maria', contato: 'Maria Aparecida Souza', responsavel: 'Matheo', esperaMin: 4, desde: null },
];

const CHAVE = 'aviso-espera';
export function useAvisoEsperaConfig() {
  const { currentOrg } = useOrg();
  return useQuery({
    queryKey: [CHAVE, 'config', currentOrg.id],
    queryFn: async (): Promise<ConfigAvisoEspera> => {
      if (!AVISO_REAL) return lerDemo();
      const { data, error } = await supabase!.from('atd_aviso_espera')
        .select('ativo, meta_min, gestor_apos_min, modo, avisar_responsavel, avisar_gestores, ligado_em').eq('organizacao_id', currentOrg.id).maybeSingle();
      if (error) throw new Error(error.message);
      return normalizar(data as Record<string, unknown> | null);
    },
  });
}
export function useSalvarAvisoEspera() {
  const { currentOrg } = useOrg();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (c: ConfigAvisoEspera) => {
      const erro = validarAviso(c); if (erro) throw new Error(erro);
      if (!AVISO_REAL) {
        await espera(400);
        const g = lerDemo();
        gravarDemo({ ...c, ligadoEm: c.ativo && !g.ativo ? new Date().toISOString() : c.ativo ? g.ligadoEm : null });
        return;
      }
      const { error } = await supabase!.from('atd_aviso_espera').upsert({
        organizacao_id: currentOrg.id, ativo: c.ativo, meta_min: Math.round(c.metaMin), gestor_apos_min: Math.round(c.gestorAposMin), modo: c.modo,
        avisar_responsavel: c.avisarResponsavel, avisar_gestores: c.avisarGestores,
      }, { onConflict: 'organizacao_id' });
      if (error) throw new Error(/permission|policy|row-level/i.test(error.message) ? 'Só o administrador muda o aviso de espera.' : 'Não deu para salvar agora. Tente de novo.');
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [CHAVE] }),
  });
}
/** quem passou da meta AGORA (com a meta e o modo que estão na tela, antes de salvar) */
export function useEsperandoAgora(metaMin: number, modo: ModoEspera, ativo = true) {
  const { currentOrg } = useOrg();
  return useQuery({
    queryKey: [CHAVE, 'agora', currentOrg.id, metaMin, modo],
    enabled: ativo,
    refetchInterval: 60_000,
    queryFn: async (): Promise<EsperandoAgora[]> => {
      if (!AVISO_REAL) { await espera(250); return ESPERANDO_DEMO.filter((e) => e.esperaMin >= metaMin); }
      const { data, error } = await supabase!.rpc('atd_aviso_espera_previa', { p_meta_min: metaMin, p_modo: modo });
      if (error) throw new Error(error.message);
      return (Array.isArray(data) ? data : []).map((x: Record<string, unknown>) => ({
        conversaId: String(x.conversa_id ?? ''), contato: String(x.contato ?? 'Cliente sem nome'),
        responsavel: typeof x.responsavel === 'string' && x.responsavel ? x.responsavel : null,
        esperaMin: Number(x.espera_min) || 0, desde: typeof x.desde === 'string' ? x.desde : null,
      })).filter((x) => x.conversaId);
    },
  });
}
