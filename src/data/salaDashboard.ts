/* ============================================================
   Sala SDR — Fase 2.2: DASHBOARD real (os números do dia)
   ------------------------------------------------------------
   Monta o DashboardView (contrato do painel de baixo, definido no
   motor) a partir de DUAS fontes REAIS, sem tocar no motor 60fps:

   • agregados do dia  → RPC `dashboard_resumo` (a MESMA fonte que o
     Dashboard da casa usa → os números BATEM com o que o cliente já
     confia): leads hoje, ganhos, 1ª resposta, funil, motivos NE,
     ranking/encaminhados por SDR, picos por hora.
   • estado ao vivo    → os leads posicionados na sala (useSalaReal):
     onde-agora, ocupação das mesas, qualificados/documentação AGORA.

   As seções puramente-mock da cena (funil por-pergunta do bot, donut
   de mensagens, arrasto de semanas, feed) NÃO têm fonte real na 2.2 —
   ficam vazias aqui e o layout real (salaDashboard.tsx) as omite. Elas
   entram nas Fases 2.1 (realtime/feed) e 2.3 (semanas).
   ============================================================ */
import type { DashResumo } from './dashboard';
import { rotuloMotivoNaoElegivel } from './kanban';
import { SDR_DESK } from './sala';
import type { SalaState, EtapaLead } from '@/v2/sala/tipos';
import type { DashboardView, FunilLinha, RankingSdr, KpiView } from '@/v2/sala/motor';

/* paleta estável para as barras/avatares do ranking (recharts/CSS não leem hash aqui) */
const CORES_SDR = ['#4C8DFF', '#4ABE8C', '#D9A44A', '#B57BE0', '#E5665C', '#3FB6C9'];

/** hora atual (0–23) no fuso de São Paulo — p/ o marcador "agora" do gráfico por hora. */
function horaAgoraSP(): number {
  try {
    const s = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone: 'America/Sao_Paulo' }).format(new Date());
    return Number(s.slice(0, 2));
  } catch {
    return new Date().getHours();
  }
}

/**
 * DashboardView real = agregados do RPC (`d`) + partes vivas do estado (`estado`).
 * Puro/determinístico: mesma entrada → mesma saída (fácil de testar/reusar).
 */
export function montarResumoReal(d: DashResumo, estado: SalaState): DashboardView {
  const leads = estado.leads;
  const conta = (...es: EtapaLead[]) => leads.filter((l) => es.includes(l.etapa)).length;
  const leadsDoDesk = (desk: string, ...es: EtapaLead[]) =>
    leads.filter((l) => l.atendenteId === desk && (es.length === 0 || es.includes(l.etapa))).length;

  // ---------- KPIs de topo (heros) ----------
  const qualificados = conta('na_mesa', 'em_ligacao');           // com os SDRs agora
  const docs = conta('documentacao');                             // em documentação agora
  const producao = d.kpis.ganhos_qtd;                             // ganhos no período (assinaram)
  const kpis: KpiView[] = [{ n: String(d.kpis.novos_leads), label: 'leads hoje' }];

  // ---------- Funil do dia (colunas reais do funil, na ordem) ----------
  const funilDia: FunilLinha[] = [...d.funil]
    .sort((a, b) => a.ordem - b.ordem)
    .map((f): FunilLinha => ({
      rotulo: f.coluna,
      n: f.qtd,
      total: 1,
      cls: f.resultado === 'ganho' ? 'ok' : f.resultado === 'perdido' ? 'rubro' : f.ordem <= 1 ? 'triagem' : 'ativo',
    }));

  // ---------- Onde estão AGORA (leads vivos por zona da sala) ----------
  const totZ = Math.max(1, leads.length);
  const ondeAgora: FunilLinha[] = [
    { rotulo: 'recepção · triagem', n: conta('chegando', 'triagem'), total: totZ, cls: 'triagem' },
    { rotulo: 'aguardando SDR', n: conta('aguardando_atendente'), total: totZ, cls: 'ativo' },
    { rotulo: 'com os SDRs', n: qualificados, total: totZ, cls: 'ativo' },
    { rotulo: 'aguardando cliente', n: conta('aguardando_cliente'), total: totZ, cls: '' },
    { rotulo: 'sem resposta', n: conta('sem_resposta'), total: totZ, cls: 'rubro' },
    { rotulo: 'remarketing', n: conta('remarketing'), total: totZ, cls: 'triagem' },
    { rotulo: 'documentação', n: docs, total: totZ, cls: 'ok' },
    { rotulo: 'aguardando assinatura', n: conta('assinatura'), total: totZ, cls: 'ok' },
    { rotulo: 'não-trabalháveis', n: conta('nao_legivel'), total: totZ, cls: '' },
  ];

  // ---------- Leads por hora (picos_hora = msgs de ENTRADA por hora, fuso SP) ----------
  const horas: string[] = [];
  const anuncio: number[] = [];
  for (let h = 8; h <= 18; h++) {
    horas.push(`${h}h`);
    anuncio.push(d.picos_hora.find((p) => p.hora === h)?.qtd ?? 0);
  }
  const remarketing = anuncio.map(() => 0); // RPC não separa anúncio×remarketing por hora
  const total = anuncio.slice();
  const leadsPorHora = { horas, anuncio, remarketing, total, agora: horaAgoraSP() - 8 };

  // ---------- 1ª resposta (o RPC dá só a mediana) ----------
  const med = d.kpis.mediana_primeira_resposta_min;
  const primeira = { media: med, mediana: med, sla5: null, histograma: [] as { faixa: string; n: number }[] };

  // ---------- Ranking por SDR (RPC atendentes × leads vivos na mesa) ----------
  const deskDeNome = (nome: string): string | null => {
    const alvo = nome.toLowerCase();
    const e = Object.values(SDR_DESK).find((s) => alvo.startsWith(s.nome.toLowerCase()) || alvo.includes(s.nome.toLowerCase()));
    return e ? e.desk : null;
  };
  const sdrs: RankingSdr[] = d.atendentes
    .filter((a) => a.conversas_atribuidas > 0 || a.msgs_enviadas > 0 || a.ganhos > 0)
    .map((a, i): RankingSdr => {
      const desk = deskDeNome(a.nome);
      return {
        id: a.nome,
        nome: a.nome,
        cor: CORES_SDR[i % CORES_SDR.length],
        conversasAtivas: desk ? leadsDoDesk(desk, 'na_mesa', 'em_ligacao') : 0,
        recebidos: a.conversas_atribuidas,
        qualificados: desk ? leadsDoDesk(desk, 'na_mesa', 'em_ligacao', 'documentacao', 'assinatura') : 0,
        producao: a.ganhos,
        primeiraMedia: a.mediana_resposta_min,
        respMediana: a.mediana_resposta_min,
        sla5: null,
        msgs: a.msgs_enviadas,
        ligacoes: 0,
        maxEspera: 0,
        spark: [],
      };
    })
    .sort((p, q) => q.producao - p.producao || q.msgs - p.msgs)
    .slice(0, 6);

  // ---------- Motivos de não-trabalhável (Pareto real) ----------
  const motivosNE: FunilLinha[] = [...d.descarte_motivos]
    .sort((a, b) => b.qtd - a.qtd)
    .filter((m) => m.qtd > 0)
    .map((m): FunilLinha => ({ rotulo: rotuloMotivoNaoElegivel(m.motivo) || m.motivo, n: m.qtd, total: 1, cls: '' }));

  // ---------- Encaminhados por SDR ----------
  const encaminhados: FunilLinha[] = d.atendentes
    .filter((a) => a.conversas_atribuidas > 0)
    .sort((a, b) => b.conversas_atribuidas - a.conversas_atribuidas)
    .map((a): FunilLinha => ({ rotulo: a.nome, n: a.conversas_atribuidas, total: 1, cls: '' }));

  // ---------- Ocupação das mesas (ao vivo) ----------
  const mesas = Object.values(SDR_DESK).map((s) => {
    const naCarteira = leadsDoDesk(s.desk);
    const ativos = leadsDoDesk(s.desk, 'na_mesa', 'em_ligacao');
    return {
      id: s.desk,
      nome: s.nome,
      estado: ativos ? 'ativo' : 'livre',
      cor: ativos ? 'var(--sala-ativo)' : 'var(--txt-3)',
      desc: naCarteira ? `${naCarteira} na carteira` : 'livre',
    };
  });

  // ---------- blocos sem fonte real na 2.2 (o layout real os omite) ----------
  const naCadencia = conta('remarketing');
  const bot = { triados: 0, conclusao: null, abandonos: 0, tempoMedio: null, tempos: [] as number[], msgs: 0, rmkMsgs: 0, rmkVoltas: 0, naCadencia };
  const remarketingBloco = { naCadencia, rmkVoltas: 0, rmkMsgs: 0, porHora: [] as number[] };

  return {
    kpis,
    placar: { qualificados, docs, producao },
    funilDia,
    ondeAgora,
    leadsPorHora,
    primeira,
    primeiraPorFatia: [],
    sdrs,
    botFunil: [],
    bot,
    remarketing: remarketingBloco,
    motivosNE,
    encaminhados,
    semanasSerie: [],
    mesas,
  };
}
