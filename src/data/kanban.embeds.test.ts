import { describe, it, expect } from 'vitest';
// Conteúdo do módulo como string (Vite ?raw), sem depender de node:fs.
import src from './kanban.ts?raw';

// Regressão: há MAIS DE UMA FK entre oportunidades↔usuarios (responsavel_id, fechado_por_id,
// responsavel_no_fechamento_id) e conversas↔usuarios (atendente_id, arquivada_por). Todo embed
// de usuarios nessas consultas DEVE indicar a constraint (usuarios!<fkey>), senão o PostgREST
// devolve "Could not embed because more than one relationship was found".

describe('kanban.ts — embeds de usuarios sem ambiguidade', () => {
  it('nenhum embed :usuarios( sem hint de constraint (!fkey)', () => {
    // captura "algo:usuarios(" que NÃO seja "algo:usuarios!"
    const ambiguos = src.match(/:usuarios\(/g) || [];
    expect(ambiguos, 'use usuarios!<constraint_fkey>(...) em vez de usuarios(...)').toHaveLength(0);
  });
  it('embeds de oportunidades usam a FK de responsavel_id', () => {
    expect(src).toContain('responsavel:usuarios!oportunidades_responsavel_id_fkey(nome)');
  });
  it('embed de conversas usa a FK de atendente_id', () => {
    expect(src).toContain('atendente:usuarios!conversas_atendente_id_fkey(nome)');
  });
  it('histórico usa as FKs de executado_por e responsavel_no_fechamento', () => {
    expect(src).toContain('oportunidade_eventos_executado_por_fkey');
    expect(src).toContain('oportunidade_eventos_resp_fech_fkey');
  });
});
