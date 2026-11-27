import { describe, expect, it } from 'vitest';
import { deEstado, mesmoNome, nomeChave, SEM_RESPONSAVEL } from './importacaoAnterior';

describe('importação do sistema anterior', () => {
  it('acha a pessoa pelo nome sem acento e sem maiúscula', () => {
    expect(nomeChave('  JOÃO ')).toBe('joao');
    const equipe = [{ id: 'a', nome: 'João' }, { id: 'b', nome: 'Deise' }];
    expect(mesmoNome({ nome: 'JOAO', qtd: 3, abertos: 1, ligadoA: null, ligadoNome: null }, equipe)?.id).toBe('a');
    expect(mesmoNome({ nome: 'Deise do Prado', qtd: 3, abertos: 1, ligadoA: null, ligadoNome: null }, equipe)).toBeNull();
    expect(mesmoNome({ nome: SEM_RESPONSAVEL, qtd: 3, abertos: 1, ligadoA: null, ligadoNome: null }, [{ id: 'c', nome: SEM_RESPONSAVEL }])).toBeNull();
  });
  it('lê o resumo do servidor', () => {
    const e = deEstado({ linhas: 10, contatos: 9, por_status: { em_andamento: 7, ganho: 2, perdido: 1 }, por_etapa: [{ etapa: 'FECHADOS', qtd: 2 }],
      responsaveis: [{ nome: 'Raissa', qtd: 4, abertos: 3, ligado_a: null, ligado_nome: null }], equipe: [{ id: 'x', nome: '' }], mensagens: 0 });
    expect(e.porStatus).toEqual({ abertos: 7, vendas: 2, descartados: 1 });
    expect(e.responsaveis[0]).toEqual({ nome: 'Raissa', qtd: 4, abertos: 3, ligadoA: null, ligadoNome: null });
    expect(e.equipe[0].nome).toBe('Sem nome');
  });
});
