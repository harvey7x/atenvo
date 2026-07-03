// Regressão do contrato da camada de dados financeira v2 (ETAPA 2B).
// Varre o fonte (sem executar hooks/React) para garantir que a separação
// ESTOQUE × FLUXO × POSIÇÃO e a data de corte não regridam silenciosamente.
import { describe, it, expect } from 'vitest';
import src from './relatorios2b.ts?raw';

describe('relatorios2b — contrato financeiro v2', () => {
  it('hook useRelFinanceiro encaminha p_data_corte para a RPC', () => {
    expect(src).toMatch(/useRelFinanceiro\(inicio: string, fim: string, dataCorte\?: string \| null\)/);
    expect(src).toMatch(/relatorio_financeiro',\s*\{[^}]*p_data_corte:\s*dataCorte \?\? null/s);
    // a data de corte precisa fazer parte da queryKey (cache correto por corte)
    expect(src).toMatch(/'rel2b-fin',[^\]]*dataCorte \?\? null/);
  });

  it('RelFinanceiro separa estoque, fluxo e posição na data de corte', () => {
    // blocos obrigatórios
    for (const campo of ['data_corte', 'qualidade_posicao', 'modelo', 'estoque', 'fluxo', 'posicao', 'contratado', 'recebido']) {
      expect(src, `faltou o campo ${campo} em RelFinanceiro`).toContain(`${campo}:`);
    }
    // estoque = carteira viva (não "receita contratada no período")
    expect(src).toContain('carteira_contratada_ativa');
    expect(src).toContain('contratos_ativos');
    // fluxo por data de contratação (data_inicio)
    expect(src).toContain('novos_contratos_periodo');
    expect(src).toContain('valor_contratado_periodo');
    // posição na data de corte
    expect(src).toContain('saldo_a_vencer_data_corte');
    expect(src).toContain('saldo_vencido_data_corte');
    expect(src).toContain('inadimplencia_valor_data_corte_pct');
    // o campo ambíguo antigo (receita_contratada plana no financeiro) não deve ressurgir
    expect(src).not.toMatch(/RelFinanceiro[\s\S]*?receita_contratada:[\s\S]*?previsao_proximos_meses/);
  });

  it('separa agrupamentos CONTRATADO e RECEBIDO (não os mistura)', () => {
    expect(src).toContain('FinContratadoResp');
    expect(src).toContain('FinRecebidoResp');
    expect(src).toMatch(/contratado:\s*\{[^}]*por_responsavel_fechamento: FinContratadoResp\[\]/s);
    expect(src).toMatch(/recebido:\s*\{[^}]*por_responsavel_fechamento: FinRecebidoResp\[\]/s);
  });

  it('alerta de qualidade expõe detalhe de serviço não normalizado', () => {
    expect(src).toContain('ServicoVarianteGrupo');
    expect(src).toMatch(/detalhe: ServicoVarianteGrupo\[\] \| null/);
  });
});
