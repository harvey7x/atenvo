/* ------------------------------------------------------------------
   Tempo real da Cobrança (dono 18/09). Um channel postgres_changes nas
   tabelas que alimentam painel/gestão/financeiro/ciclos (publicadas na
   mig 50) + um só da planilha (mig 57). Qualquer mudança — da própria sessão OU de outra pessoa (ex.:
   financeiro confirma uma entrada) — invalida a query e o número muda na
   hora, sem esperar o polling de 30s. Realtime respeita RLS: só chega evento
   de linha que o usuário já podia ler. SÓ na instância Reviza (Supabase real);
   demo/Atenvo seguem no polling. O selo "Ao vivo" lê o status daqui.
   ------------------------------------------------------------------ */
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { isRevizaMode, supabase } from '@/lib/supabase';
import { chavesCobranca } from './keys';
import { chavesPlanilha, ultimaEscritaPlanilha } from './planilha';

// entradas FICOU DE FORA de propósito (mig 51): ent_sel deixa qualquer autenticado
// ler todas → não pode virar push financeiro cross-comercial. Esta lista tem que
// bater com a publication supabase_realtime, senão o channel cai em silêncio.
const TABELAS = ['leads', 'pagamentos', 'mov_fin', 'ciclos_datas', 'ciclos_abertos', 'cobranca_prefs', 'ciclos'] as const;
// leads/pagamentos mudados FORA da planilha reescrevem células pelos gatilhos
// reversos (sem mexer na planilha_versao) → também releem a folha
const TABELAS_QUE_MEXEM_NA_PLANILHA: ReadonlySet<string> = new Set(['leads', 'pagamentos']);
// planilha "Excel 2.0" (mig 57): canal PRÓPRIO — se a publication ainda não tiver
// alguma destas, só ele cai; o 'reviza-cobranca' (e o selo "Ao vivo") seguem
// intactos. planilha_celulas NÃO é assinada (1 evento por célula: colar 5000 =
// 5000 checagens de RLS por assinante e 1 MB relido a cada uma); as RPCs que
// gravam célula sobem 1x a linha única planilha_versao no fim da chamada.
const TABELAS_PLANILHA = ['planilha_blocos', 'planilha_colunas', 'planilha_linhas', 'planilha_versao'] as const;
const PL_AGRUPA_MS = 1500;     // rajada agrupada numa releitura só…
const PL_ESPERA_MAX_MS = 5000; // …mas evento contínuo não segura a folha velha mais que isto
const PL_ECO_MS = 1500;        // eco da própria escrita: o onSuccess dos hooks já releu
// canal da planilha caiu (ex.: front publicado antes da migration): remove e religa
// depois de 30 s, 60 s, 60 s… (+ até 5 s de sorteio p/ as abas não voltarem juntas)
const PL_RELIGA_MS = [30_000, 60_000] as const;

/* store mínimo de status (useSyncExternalStore) — o selo "Ao vivo" assina isto.
   'conectando' = 1ª conexão em curso (nunca mostrar como falha); 'conectado' =
   ao vivo; 'reconectando' = caiu depois de já ter conectado. */
export type StatusRealtime = 'conectando' | 'conectado' | 'reconectando';
let _status: StatusRealtime = 'conectando';
const _ouvintes = new Set<() => void>();
function setStatus(s: StatusRealtime) { if (s !== _status) { _status = s; _ouvintes.forEach((f) => f()); } }
export function assinarStatusRealtime(f: () => void) { _ouvintes.add(f); return () => { _ouvintes.delete(f); }; }
export function lerStatusRealtime(): StatusRealtime { return _status; }

/** Liga o realtime da cobrança. Chamar UMA vez, alto na árvore (Cobrancas.tsx). */
export function useRealtimeCobranca() {
  const qc = useQueryClient();
  useEffect(() => {
    if (!isRevizaMode || !supabase) return; // demo/Atenvo: o polling de 30s cobre
    const sb = supabase;
    let vivo = true;

    // releitura da planilha: agrupa 1,5 s (máx. 5 s desde o 1º evento) e ignora o eco
    let timerPl: ReturnType<typeof setTimeout> | undefined;
    let primeiroPl = 0;
    const lerPlanilhaAgora = () => {
      clearTimeout(timerPl); timerPl = undefined; primeiroPl = 0;
      void qc.invalidateQueries({ queryKey: chavesPlanilha.planilha });
      void qc.invalidateQueries({ queryKey: ['reviza', 'comissoes'] });   // mudar a % refaz valores: % e valores juntos
    };
    const invalidarPlanilha = () => {
      const agora = Date.now();
      if (agora - ultimaEscritaPlanilha() < PL_ECO_MS) return;
      if (!primeiroPl) primeiroPl = agora;
      clearTimeout(timerPl);
      timerPl = setTimeout(lerPlanilhaAgora, Math.max(0, Math.min(PL_AGRUPA_MS, primeiroPl + PL_ESPERA_MAX_MS - agora)));
    };

    let timer: ReturnType<typeof setTimeout> | undefined;
    const invalidar = () => {
      clearTimeout(timer);
      // coalesce uma rajada de eventos (ex.: import, esvaziar) numa refetch só
      timer = setTimeout(() => {
        void qc.invalidateQueries({ queryKey: chavesCobranca.dados });
        void qc.invalidateQueries({ queryKey: ['reviza', 'registros'] });
        void qc.invalidateQueries({ queryKey: ['reviza', 'comissoes'] });
      }, 350);
    };
    const invalidarComPlanilha = () => { invalidar(); invalidarPlanilha(); };
    let ch = sb.channel('reviza-cobranca');
    for (const t of TABELAS) {
      ch = ch.on('postgres_changes', { event: '*', schema: 'public', table: t }, TABELAS_QUE_MEXEM_NA_PLANILHA.has(t) ? invalidarComPlanilha : invalidar);
    }
    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') setStatus('conectado');
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        setStatus(_status === 'conectado' ? 'reconectando' : 'conectando');
      }
    });

    // canal da planilha com religação: em CHANNEL_ERROR/TIMED_OUT tira o canal (o
    // rejoin interno ficaria batendo num canal morto) e cria de novo com espera
    let chPl: RealtimeChannel | null = null;
    let timerReliga: ReturnType<typeof setTimeout> | undefined;
    let falhas = 0;
    const ligarPlanilha = () => {
      timerReliga = undefined;
      if (!vivo) return;
      let c = sb.channel('reviza-planilha');
      for (const t of TABELAS_PLANILHA) {
        c = c.on('postgres_changes', { event: '*', schema: 'public', table: t }, invalidarPlanilha);
      }
      chPl = c;
      c.subscribe((status) => {
        if (!vivo || chPl !== c) return; // canal velho (já trocado) ou efeito desmontado
        if (status === 'SUBSCRIBED') {
          // voltou depois de cair: o que mudou nesse meio-tempo não chegou por evento
          if (falhas > 0) invalidarPlanilha();
          falhas = 0;
          return;
        }
        if ((status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') && timerReliga === undefined) {
          chPl = null;
          void sb.removeChannel(c);
          const espera = PL_RELIGA_MS[Math.min(falhas, PL_RELIGA_MS.length - 1)] + Math.floor(Math.random() * 5000);
          falhas++;
          timerReliga = setTimeout(ligarPlanilha, espera);
        }
      });
    };
    ligarPlanilha();

    return () => {
      vivo = false;
      clearTimeout(timer); clearTimeout(timerPl); clearTimeout(timerReliga); setStatus('conectando');
      void sb.removeChannel(ch);
      if (chPl) void sb.removeChannel(chPl);
      chPl = null;
    };
  }, [qc]);
}
