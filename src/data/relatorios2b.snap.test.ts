// Regressão do contrato de relatorio_snapshot (ETAPA 2B): consumir Financeiro v2,
// separar fluxo/estoque/posicao, usar dois cortes explícitos, tratar % em p.p. e
// evitar infinito. Varre o fonte (sem executar hooks/React).
import { describe, it, expect } from 'vitest';
import src from './relatorios2b.ts?raw';

describe('relatorios2b — contrato do snapshot v2', () => {
  it('hook useRelSnapshot envia os 7 parâmetros com dois cortes explícitos', () => {
    expect(src).toMatch(/useRelSnapshot\(p: SnapshotPeriodos\)/);
    for (const arg of ['p_inicio_atual', 'p_fim_atual', 'p_corte_atual', 'p_inicio_anterior', 'p_fim_anterior', 'p_corte_anterior']) {
      expect(src, `faltou ${arg} na chamada da RPC`).toContain(`${arg}:`);
    }
    // não deve restar a assinatura antiga (sem cortes)
    expect(src).not.toContain('p_ini_atual');
    expect(src).not.toContain('p_fim_ant:');
  });

  it('SnapshotKpi declara tipo/unidade/sentido/direção e comparação completa', () => {
    expect(src).toContain('export type KpiTipo');
    expect(src).toContain('export type KpiUnidade');
    expect(src).toContain('export type KpiSentido');
    expect(src).toMatch(/aumento_sem_base/);
    for (const campo of ['valor_atual', 'valor_anterior', 'diferenca_absoluta', 'variacao_percentual', 'direcao', 'qualidade_atual', 'qualidade_anterior', 'cobertura_atual', 'cobertura_anterior']) {
      expect(src, `faltou ${campo} em SnapshotKpi`).toContain(`${campo}:`);
    }
    // grupos separam fluxo/estoque/posição financeiros
    expect(src).toContain("'financeiro_fluxo'");
    expect(src).toContain("'financeiro_estoque'");
    expect(src).toContain("'financeiro_posicao'");
  });

  it('RelSnapshot traz comparabilidade e qualidade financeira por período', () => {
    expect(src).toContain('comparabilidade:');
    expect(src).toContain('periodos_comparaveis');
    expect(src).toContain('aviso_periodo');
    expect(src).toContain('qualidade_financeira:');
    expect(src).toContain('data_corte:');
    // não deve ressurgir o KPI antigo ambíguo (valor único, cobertura como array)
    expect(src).not.toContain('export interface KpiSnapshot');
  });
});
