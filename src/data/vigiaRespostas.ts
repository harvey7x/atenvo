import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useOrg } from '@/context/OrgContext';
import { demoVigia } from './vigiaRespostas.demo';

/* ------------------------------------------------------------------
   Vigia de respostas 24h (dono 12/11): "um sistema rodando que nunca vai deixar um cliente sem
   resposta, a cada 3 minutos, 24 horas por dia, no dashboard". O banco roda a varredura sozinho
   (cron guardiao_resposta, a cada 3 min); esta tela só LÊ: o batimento ("conferido há X min",
   rubro se parou) e a lista de quem ficou sem resposta, com o motivo e quem deve responder.
   A organização da lista (grupos por espera, filtros, ordem) fica em vigiaRespostas.vista.ts;
   a fixture do modo demo em vigiaRespostas.demo.ts (re-exportada daqui).
   Demo é o contrato: em `vite --mode demo` o mesmo hook devolve a fixture com os mesmos tipos.
   ------------------------------------------------------------------ */

export const VIGIA_REAL: boolean = isSupabaseConfigured && !!supabase;

export type QuemDeve = 'iris' | 'robo' | 'humano';
export type Severidade = 'atencao' | 'alta' | 'critica';
export type MotivoVigia =
  | 'iris_parada' | 'iris_travada' | 'iris_na_fila' | 'robo_fluxo' | 'humano_atrasado' | 'sem_dono' | 'canal_desconectado';

export interface VigiaSaude {
  vigiaOk: boolean;
  ultimoMinutos: number | null;
  ultimoErro: string | null;
  /** quando a última conferência rodou (ultimo_batimento.rodou_em) */
  ultimoEm: string | null;
  abertos: number;
  porSeveridade: Partial<Record<Severidade, number>>;
  resolvidos24h: number;
  curas24h: number;
  rodadas24h: number;
}
export interface VigiaCaso {
  casoId: string;
  conversaId: string;
  nome: string;
  telefone: string | null;
  canal: string | null;
  dono: string | null;
  quemDeve: QuemDeve;
  motivo: MotivoVigia;
  severidade: Severidade;
  esperaMin: number;
  tentativasCura: number;
  ultimaMsg: string | null;
  abertoEm: string | null;
}
export interface VigiaDados { saude: VigiaSaude; casos: VigiaCaso[]; lidoEm: string }

export const MOTIVO_ROTULO: Record<MotivoVigia, string> = {
  iris_parada: 'Iris parou de responder',
  iris_travada: 'Iris travada',
  iris_na_fila: 'Resposta da Iris atrasada',
  robo_fluxo: 'Robô não respondeu',
  humano_atrasado: 'Atendente ainda não respondeu',
  sem_dono: 'Sem atendente definido',
  canal_desconectado: 'Número desconectado',
};
/** a 2ª linha da coluna "Quem deve responder" (o rótulo longo fica no title) */
export const MOTIVO_CURTO: Record<MotivoVigia, string> = {
  iris_parada: 'parou de responder',
  iris_travada: 'travada',
  iris_na_fila: 'resposta atrasada',
  robo_fluxo: 'não respondeu',
  humano_atrasado: 'ainda não respondeu',
  sem_dono: 'cliente sem responsável',
  canal_desconectado: 'número desconectado',
};
export const QUEM_ROTULO: Record<QuemDeve, string> = { iris: 'Iris', robo: 'Robô', humano: 'Atendente' };

const num = (v: unknown, p = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : Number.isFinite(Number(v)) ? Number(v) : p);
const txt = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);
const SEV: Severidade[] = ['atencao', 'alta', 'critica'];
const QUEM: QuemDeve[] = ['iris', 'robo', 'humano'];

/** Normaliza o que a RPC devolve (tolerante: campo ausente vira zero/nulo, nunca derruba a tela). */
export function normalizarVigia(saudeBruta: unknown, listaBruta: unknown, lidoEm = new Date().toISOString()): VigiaDados {
  const s = (saudeBruta && typeof saudeBruta === 'object' ? saudeBruta : {}) as Record<string, unknown>;
  const ub = (s.ultimo_batimento && typeof s.ultimo_batimento === 'object' ? s.ultimo_batimento : null) as Record<string, unknown> | null;
  const sev = (s.por_severidade && typeof s.por_severidade === 'object' ? s.por_severidade : {}) as Record<string, unknown>;
  const lista = Array.isArray(listaBruta) ? listaBruta : [];
  return {
    lidoEm,
    saude: {
      vigiaOk: s.vigia_ok === true,
      ultimoMinutos: ub ? num(ub.minutos, 0) : null,
      ultimoErro: ub ? txt(ub.erro) : null,
      ultimoEm: ub ? txt(ub.rodou_em) : null,
      abertos: num(s.abertos),
      porSeveridade: Object.fromEntries(SEV.map((k) => [k, num(sev[k])])) as Partial<Record<Severidade, number>>,
      resolvidos24h: num(s.resolvidos_24h),
      curas24h: num(s.curas_24h),
      rodadas24h: num(s.rodadas_24h),
    },
    casos: lista.map((r) => {
      const x = (r ?? {}) as Record<string, unknown>;
      const quem = QUEM.includes(x.quem_deve as QuemDeve) ? (x.quem_deve as QuemDeve) : 'humano';
      const sv = SEV.includes(x.severidade as Severidade) ? (x.severidade as Severidade) : 'atencao';
      return {
        casoId: String(x.caso_id ?? ''), conversaId: String(x.conversa_id ?? ''),
        nome: txt(x.nome) ?? 'Cliente sem nome', telefone: txt(x.telefone), canal: txt(x.canal), dono: txt(x.dono),
        quemDeve: quem, motivo: (txt(x.motivo) ?? 'humano_atrasado') as MotivoVigia, severidade: sv,
        esperaMin: Math.max(0, num(x.espera_min)), tentativasCura: num(x.tentativas_cura), ultimaMsg: txt(x.ultima_msg),
        abertoEm: txt(x.aberto_em),
      };
    }),
  };
}

/** Fixture do modo demo (vigiaRespostas.demo.ts) — re-exportada para o mock dos testes. */
export { demoVigia };

const TRINTA_S = 30_000;

/** Painel do vigia: só o gestor (admin) tem a leitura (a RPC recusa os demais). Recarrega a cada 30 s. */
export function useVigiaRespostas(ativo: boolean): UseQueryResult<VigiaDados> {
  const { currentOrg } = useOrg();
  const org = currentOrg.id;
  return useQuery({
    queryKey: ['vigia-respostas', org],
    enabled: !!org && ativo,
    staleTime: 15_000,
    refetchInterval: TRINTA_S,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<VigiaDados> => {
      if (!VIGIA_REAL) {
        // só no demo: ?vigia=parado|erro|vazio|cortada troca a variante da fixture
        return demoVigia({ variante: typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('vigia') });
      }
      const [s, l] = await Promise.all([
        supabase!.rpc('guardiao_resposta_saude', { p_org: org }),
        supabase!.rpc('guardiao_resposta_lista', { p_org: org }),
      ]);
      if (s.error) throw new Error(s.error.message?.includes('so_gestor') ? 'Só o gestor vê o vigia de respostas.' : 'Não foi possível ler o vigia agora.');
      if (l.error) throw new Error('Não foi possível ler a lista agora.');
      return normalizarVigia(s.data, l.data);
    },
  });
}

/** Rótulo curto da espera: "9 min", "1 h 35", "1 d 7 h", "12 d" (de 3 dias em diante, só os dias). */
export function fmtEspera(min: number): string {
  if (min < 60) return `${min} min`;
  if (min < 1440) return `${Math.floor(min / 60)} h${min % 60 ? ` ${String(min % 60).padStart(2, '0')}` : ''}`;
  const d = Math.floor(min / 1440);
  if (d >= 3) return `${d} d`;
  const h = Math.floor((min % 1440) / 60);
  return h ? `${d} d ${h} h` : `${d} d`;
}
