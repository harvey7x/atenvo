// Regressão do contrato de relatorio_equipe (ETAPA 2B): separar operacional (autor painel),
// carteira atual (responsavel_id) e resultado histórico (responsavel_no_fechamento_id), manter
// linha Sem atribuição e nunca fazer fallback do celular/criador para o responsável atual.
import { describe, it, expect } from 'vitest';
import src from './relatorios2b.ts?raw';

describe('relatorios2b — contrato de equipe v2', () => {
  it('EquipeUsuario separa operacional × comercial (sem campos planos antigos)', () => {
    expect(src).toContain('export interface EquipeOperacional');
    expect(src).toContain('export interface EquipeComercial');
    expect(src).toMatch(/EquipeUsuario\s*\{[^}]*vinculo: 'ativo' \| 'inativo';[^}]*operacional: EquipeOperacional;[^}]*comercial: EquipeComercial/s);
    // resultado histórico separado da carteira atual
    expect(src).toContain('carteira_atual:');
    expect(src).toContain('carteira_contratada_fechamentos:');
    expect(src).toContain('ticket_medio_fechamentos:');
    // primeira resposta com média e mediana
    expect(src).toContain('primeira_resposta_media_min');
    expect(src).toContain('primeira_resposta_mediana_min');
    // transferências/assunções
    expect(src).toContain('atendimentos_assumidos');
    expect(src).toContain('transferencias_recebidas');
    expect(src).toContain('transferencias_realizadas');
  });

  it('Sem atribuição concentra celular/sem autor/sem responsável/sem snapshot', () => {
    expect(src).toContain('export interface EquipeSemAtribuicao');
    for (const campo of ['mensagens_celular', 'primeiras_respostas_celular', 'outras_saidas_sem_autor', 'oportunidades_sem_responsavel', 'fechamentos_sem_snapshot', 'valor_contratado_sem_atribuicao', 'receita_recebida_sem_atribuicao']) {
      expect(src, `faltou ${campo} em Sem atribuição`).toContain(`${campo}:`);
    }
  });

  it('Cobertura (5), rankings e drill-down estão tipados', () => {
    expect(src).toContain('export interface EquipeCobertura');
    expect(src).toContain('export interface EquipeRanking');
    expect(src).toContain('qualidade:');
    expect(src).toContain('export function useRelDetalheEquipe');
    expect(src).toContain("relatorio_detalhe_equipe'");
    expect(src).toMatch(/EquipeDimensao = 'mensagens' \| 'primeiras_respostas' \| 'oportunidades' \| 'fechamentos' \| 'receitas'/);
    // não deve restar o contrato plano antigo
    expect(src).not.toMatch(/EquipeUsuario\s*\{[^}]*receita_contratada: number/s);
  });
});
