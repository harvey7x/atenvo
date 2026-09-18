import { describe, it, expect } from 'vitest';
import { montarResumoReal } from './salaDashboard';
import type { DashResumo } from './dashboard';
import type { SalaState, LeadView, EtapaLead } from '@/v2/sala/tipos';

/* lead mínimo só com o que o mapper lê (etapa + mesa) */
function lead(id: string, etapa: EtapaLead, atendenteId: string | null = null): LeadView {
  return {
    id, nome: id, telefone: '', cidade: '', origem: 'anuncio', etapa, atendenteId,
    semanaEntrada: 0, triagemPasso: 0, docsEnviados: 0, ultimaInteracaoEm: '2026-09-18T12:00:00-03:00',
    conversa: [], historico: [],
  };
}

const RESUMO: DashResumo = {
  periodo: { inicio: '2026-09-18T00:00:00-03:00', fim: '2026-09-19T00:00:00-03:00' },
  motivos_descarte: ['nao_elegivel'],
  kpis: { novos_leads: 28, conversas_ativas: 40, mediana_primeira_resposta_min: 4, ganhos_qtd: 3, ganhos_valor: 0, perdidos_qtd: 6, descartados_qtd: 2 },
  kpis_anterior: { novos_leads: 20, conversas_ativas: 30, mediana_primeira_resposta_min: 5, ganhos_qtd: 2, ganhos_valor: 0, perdidos_qtd: 4, descartados_qtd: 1 },
  leads_por_dia: [{ dia: '2026-09-18', qtd: 28 }],
  origem_trafego: [],
  funil: [
    { coluna: 'Lead Novo', ordem: 0, resultado: 'neutro', qtd: 12, qtd_perda: 0, qtd_descarte: 0 },
    { coluna: 'Qualificado', ordem: 1, resultado: 'neutro', qtd: 8, qtd_perda: 0, qtd_descarte: 0 },
    { coluna: 'Ganho', ordem: 5, resultado: 'ganho', qtd: 3, qtd_perda: 0, qtd_descarte: 0 },
  ],
  atendentes: [
    { nome: 'Giovana Alves', conversas_atribuidas: 9, msgs_enviadas: 40, mediana_resposta_min: 3, ganhos: 2, perdidos: 1, descartados: 0 },
    { nome: 'Juliana Souza', conversas_atribuidas: 5, msgs_enviadas: 22, mediana_resposta_min: 6, ganhos: 1, perdidos: 0, descartados: 0 },
    { nome: 'Sem Atividade', conversas_atribuidas: 0, msgs_enviadas: 0, mediana_resposta_min: null, ganhos: 0, perdidos: 0, descartados: 0 },
  ],
  picos_hora: Array.from({ length: 24 }, (_, h) => ({ hora: h, qtd: h === 8 ? 30 : h === 9 ? 18 : 0 })),
  motivos_perda: [],
  descarte_motivos: [{ motivo: 'sem_beneficio_inss', qtd: 1 }, { motivo: 'muitos_processos', qtd: 4 }],
  descarte_motivos_anterior: [],
  trafego: [],
  trafego_anterior: [],
  bancos: [],
};

const ESTADO: SalaState = {
  semanaAtual: 0,
  atendentes: [{ id: 'gi', nome: 'Giovana', online: true }],
  leads: [
    lead('a', 'na_mesa', 'gi'),
    lead('b', 'em_ligacao', 'gi'),
    lead('c', 'documentacao', 'gi'),
    lead('d', 'sem_resposta'),
    lead('e', 'nao_legivel'),
    lead('f', 'remarketing'),
  ],
};

describe('montarResumoReal', () => {
  const r = montarResumoReal(RESUMO, ESTADO);

  it('KPIs de topo vêm do RPC (leads hoje) e do estado vivo (qualificados/docs)', () => {
    expect(r.kpis[0]).toEqual({ n: '28', label: 'leads hoje' });
    expect(r.placar.producao).toBe(3);          // ganhos_qtd
    expect(r.placar.qualificados).toBe(2);       // na_mesa + em_ligacao
    expect(r.placar.docs).toBe(1);               // documentacao
  });

  it('1ª resposta usa a mediana do RPC (sem sla5)', () => {
    expect(r.primeira.media).toBe(4);
    expect(r.primeira.mediana).toBe(4);
    expect(r.primeira.sla5).toBeNull();
  });

  it('funil do dia sai das colunas reais, ordenado por ordem', () => {
    expect(r.funilDia.map((f) => f.rotulo)).toEqual(['Lead Novo', 'Qualificado', 'Ganho']);
    expect(r.funilDia[2]).toMatchObject({ n: 3, cls: 'ok' });
  });

  it('onde-agora conta os leads vivos por zona', () => {
    const zona = (rot: string) => r.ondeAgora.find((l) => l.rotulo === rot)?.n;
    expect(zona('com os SDRs')).toBe(2);
    expect(zona('documentação')).toBe(1);
    expect(zona('sem resposta')).toBe(1);
    expect(zona('remarketing')).toBe(1);
    expect(zona('não-trabalháveis')).toBe(1);
  });

  it('leads por hora vem de picos_hora (janela 8h–18h, 11 baldes)', () => {
    expect(r.leadsPorHora.horas).toHaveLength(11);
    expect(r.leadsPorHora.total[0]).toBe(30); // 8h
    expect(r.leadsPorHora.total[1]).toBe(18); // 9h
    expect(r.leadsPorHora.remarketing.every((n) => n === 0)).toBe(true);
  });

  it('motivos NE = descarte_motivos ordenado desc e rotulado', () => {
    expect(r.motivosNE.map((m) => m.n)).toEqual([4, 1]); // maior primeiro
    expect(typeof r.motivosNE[0].rotulo).toBe('string');
  });

  it('ranking/encaminhados por SDR saem de atendentes (sem atividade fora)', () => {
    expect(r.sdrs.map((s) => s.nome)).toEqual(['Giovana Alves', 'Juliana Souza']); // ordena por producao
    expect(r.sdrs[0].producao).toBe(2);
    expect(r.sdrs[0].conversasAtivas).toBe(2); // leads vivos na mesa gi (na_mesa+em_ligacao)
    expect(r.encaminhados.map((e) => e.n)).toEqual([9, 5]);
  });

  it('seções sem fonte real na 2.2 ficam vazias (layout real as omite)', () => {
    expect(r.botFunil).toEqual([]);
    expect(r.semanasSerie).toEqual([]);
    expect(r.primeiraPorFatia).toEqual([]);
  });

  it('ocupação das mesas reflete os leads vivos por mesa', () => {
    const gi = r.mesas.find((m) => m.id === 'gi');
    expect(gi?.estado).toBe('ativo');       // tem leads na mesa
    expect(gi?.desc).toContain('carteira'); // "N na carteira"
  });
});
