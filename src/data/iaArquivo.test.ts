import { describe, expect, it } from 'vitest';
import { LIMITES_ARQUIVO, parseAgenteImportado, resumoDoArquivo } from './iaArquivo';

const base = { tipo: 'atendente-atenvo', versao: 1, nome: 'Iris', provedor: 'gemini', modelo: 'gemini-3.6-flash', personaPrompt: 'Você é a Iris.', conhecimento: 'Atendemos de segunda a sexta.',
  comportamentos: { horario: { ativo: true, inicio: '08:00', fim: '18:00' }, nudges_ativos: false, proibidos: ['política', '', 'x'.repeat(200)] } };

describe('arquivo da atendente de IA', () => {
  it('importa um arquivo completo sem cortar nada e resume o que veio', () => {
    const a = parseAgenteImportado(JSON.stringify({ ...base, comportamentos: { ...base.comportamentos, proibidos: ['política'] }, para: 'Cliente X', feitoEm: '22/11/2026', nota: 'Primeira versão' }));
    expect(a.cortes).toEqual([]);
    expect(a.info).toEqual({ para: 'Cliente X', feitoEm: '22/11/2026', nota: 'Primeira versão' });
    const r = Object.fromEntries(resumoDoArquivo(a).map((l) => [l.rotulo, l.valor]));
    expect(r['Horário de atendimento']).toBe('08:00 às 18:00');
    expect(r['Retorno automático']).toBe('Desligado');
    expect(r['Temas proibidos']).toBe('1 tema');
  });
  it('aceita o texto colado de uma mensagem, com cerca de código e espaços', () => {
    expect(parseAgenteImportado('\n```json\n' + JSON.stringify(base) + '\n```\n').nome).toBe('Iris');
  });
  it('avisa o que cortou: texto acima do limite e tema proibido vazio', () => {
    const a = parseAgenteImportado(JSON.stringify({ ...base, personaPrompt: 'a'.repeat(LIMITES_ARQUIVO.persona + 5) }));
    expect(a.personaPrompt.length).toBe(LIMITES_ARQUIVO.persona);
    expect(a.cortes.some((c) => c.includes('personalidade'))).toBe(true);
    expect(a.cortes.some((c) => c.includes('temas proibidos'))).toBe(true);
    expect(a.comportamentos.proibidos).toEqual(['política', 'x'.repeat(LIMITES_ARQUIVO.proibido)]);
  });
  it('recusa o que não é configuração de atendente e nunca devolve campo fora da lista', () => {
    expect(() => parseAgenteImportado('oi')).toThrow();
    expect(() => parseAgenteImportado(JSON.stringify({ tipo: 'fluxo-atenvo', passos: [] }))).toThrow();
    const a = parseAgenteImportado(JSON.stringify({ ...base, chave: 'segredo', comportamentos: { ...base.comportamentos, qualquer: 1 } })) as unknown as Record<string, unknown>;
    expect('chave' in a).toBe(false);
    expect('qualquer' in (a.comportamentos as object)).toBe(false);
  });
});
