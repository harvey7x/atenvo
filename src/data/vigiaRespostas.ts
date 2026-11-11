import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useOrg } from '@/context/OrgContext';

/* ------------------------------------------------------------------
   Vigia de respostas 24h (dono 12/11): "um sistema rodando que nunca vai deixar um cliente sem
   resposta, a cada 3 minutos, 24 horas por dia, no dashboard". O banco roda a varredura sozinho
   (cron guardiao_resposta, a cada 3 min); esta tela só LÊ: o batimento ("rodou há X min", vermelho
   se parou) e a lista de quem ficou sem resposta, com o motivo e quem deve responder.
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
  canal: string | null;
  dono: string | null;
  quemDeve: QuemDeve;
  motivo: MotivoVigia;
  severidade: Severidade;
  esperaMin: number;
  tentativasCura: number;
  ultimaMsg: string | null;
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
        nome: txt(x.nome) ?? 'Cliente sem nome', canal: txt(x.canal), dono: txt(x.dono),
        quemDeve: quem, motivo: (txt(x.motivo) ?? 'humano_atrasado') as MotivoVigia, severidade: sv,
        esperaMin: Math.max(0, num(x.espera_min)), tentativasCura: num(x.tentativas_cura), ultimaMsg: txt(x.ultima_msg),
      };
    }),
  };
}

/** Fixture do modo demo (mesmos tipos). */
export function demoVigia(): VigiaDados {
  const c = (i: number, nome: string, canal: string, dono: string, quemDeve: QuemDeve, motivo: MotivoVigia, severidade: Severidade, esperaMin: number, ultimaMsg: string): VigiaCaso =>
    ({ casoId: `c${i}`, conversaId: `v${i}`, nome, canal, dono, quemDeve, motivo, severidade, esperaMin, tentativasCura: 0, ultimaMsg });
  return {
    lidoEm: new Date().toISOString(),
    saude: { vigiaOk: true, ultimoMinutos: 1, ultimoErro: null, abertos: 4, porSeveridade: { atencao: 1, alta: 2, critica: 1 }, resolvidos24h: 37, curas24h: 5, rodadas24h: 480 },
    casos: [
      c(1, 'Maria de Fátima Souza', 'JUROS ABUSIVO', 'Juliana', 'humano', 'humano_atrasado', 'critica', 1900, 'Bom dia, alguma novidade?'),
      c(2, 'José Carlos Pereira', 'EMPRESTIMO DIEGO', 'Luiz', 'humano', 'humano_atrasado', 'alta', 95, 'Já mandei os documentos'),
      c(3, 'Ana Lúcia Ferreira', 'ANTONIO 2.0', 'Giovana', 'iris', 'iris_na_fila', 'alta', 62, 'Pode me ligar à tarde?'),
      c(4, 'Pedro Henrique Lima', 'JUROS ABUSIVO', 'Isadora', 'robo', 'robo_fluxo', 'atencao', 9, 'Tenho sim'),
    ],
  };
}

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
      if (!VIGIA_REAL) return demoVigia();
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

/** Rótulo curto da espera: "9 min", "1 h 35", "2 d". */
export function fmtEspera(min: number): string {
  if (min < 60) return `${min} min`;
  if (min < 1440) return `${Math.floor(min / 60)} h${min % 60 ? ` ${String(min % 60).padStart(2, '0')}` : ''}`;
  return `${Math.floor(min / 1440)} d`;
}
