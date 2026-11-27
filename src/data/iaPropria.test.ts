// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({ supabase: null, isSupabaseConfigured: false }));
vi.mock('@/context/OrgContext', () => ({ useOrg: () => ({ currentOrg: { id: 'o' } }) }));

const {
  CHAVE_EXEMPLO, conferirChaveIa, estadoDemo, explicarUltimoErro, IA_REAL, MSG_IA, normalizarEstadoIa, normalizarResumo,
  quandoFoiGerado, resumoDemo, textoChaveConfigurada, TRANSCRICOES_DEMO, traduzErroIa,
} = await import('./iaPropria');
const { seedWa } = await import('@/v2/pages/whatsappSeed');

describe('IA própria: a chave', () => {
  it('sem backend é demonstração', () => { expect(IA_REAL).toBe(false); });
  it('confere o jeito da chave antes de mandar (e percebe o provedor trocado)', () => {
    expect(conferirChaveIa('gemini', CHAVE_EXEMPLO.gemini)).toBeNull();
    expect(conferirChaveIa('openai', CHAVE_EXEMPLO.openai)).toBeNull();
    expect(conferirChaveIa('gemini', 'curta')).toBe('formato_chave');
    expect(conferirChaveIa('gemini', 'AIza com espaço 00000000000000000000')).toBe('formato_chave');
    expect(conferirChaveIa('gemini', CHAVE_EXEMPLO.openai)).toBe('parece_openai');
    expect(conferirChaveIa('openai', CHAVE_EXEMPLO.gemini)).toBe('parece_gemini');
  });
  it('a tela vê só provedor, quem, quando e os 4 últimos caracteres', () => {
    const e = normalizarEstadoIa({ configurada: true, provedor: 'gemini', final: 'abcd1234', configurada_em: '2026-11-25T13:00:00Z', configurada_por: 'Ana', chave: 'NUNCA-DEVE-APARECER' });
    expect(e).toEqual({ configurada: true, provedor: 'gemini', final: '1234', configuradaEm: '2026-11-25T13:00:00Z', configuradaPor: 'Ana', ultimoTesteEm: null, ultimoErro: null });
    expect(JSON.stringify(e)).not.toContain('NUNCA');
    expect(textoChaveConfigurada(e)).toBe('configurada em 25/11 por Ana · termina em …1234');
    expect(textoChaveConfigurada({ configuradaEm: null, configuradaPor: null, final: null })).toBe('configurada');
    expect(normalizarEstadoIa({ configurada: false, provedor: 'gemini' }).configurada).toBe(false);
    expect(normalizarEstadoIa({ configurada: true, provedor: 'claude' }).provedor).toBeNull();
  });
  it('erros do servidor em português; código desconhecido não vaza', () => {
    expect(traduzErroIa(new Error('chave_invalida'))).toBe(MSG_IA.chave_invalida);
    expect(traduzErroIa(new Error(MSG_IA.audio_longo))).toBe(MSG_IA.audio_longo);
    expect(traduzErroIa(new Error('TypeError: fetch failed at x.y'))).toBe('Não foi possível falar com a IA agora. Tente de novo.');
    expect(explicarUltimoErro('sem_credito_ou_limite')).toBe(MSG_IA.sem_credito_ou_limite);
    expect(explicarUltimoErro(null)).toBeNull();
  });
  it('a demonstração nunca guarda a chave, só o estado', () => {
    expect(estadoDemo().configurada).toBe(false); // node: sem localStorage, começa sem chave
  });
});

describe('IA própria: resumo e transcrição', () => {
  it('lê o resumo do servidor com campos faltando sem quebrar; sem conteúdo = sem resumo', () => {
    const r = normalizarResumo({ resumo: { quer: ' Revisar descontos ', documentos_recebidos: ['RG', '', 3], proximo_passo: 'Pedir extrato' }, gerado_em: '2026-11-25T17:40:00Z', mensagens: '12', desatualizado: 1 });
    expect(r).toMatchObject({ quer: 'Revisar descontos', recebidos: ['RG', '3'], faltando: [], proximoPasso: 'Pedir extrato', humor: '', geradoPor: null, mensagens: 12, desatualizado: true });
    expect(normalizarResumo({ resumo: null })).toBeNull();
    expect(normalizarResumo({ resumo: { humor: 'bom' } })).toBeNull();
  });
  it('"gerado às" no horário de Brasília: hoje, ontem ou a data', () => {
    const agora = new Date('2026-11-25T18:00:00Z'); // 15:00 em Brasília
    expect(quandoFoiGerado('2026-11-25T17:40:00Z', agora)).toBe('gerado às 14:40');
    expect(quandoFoiGerado('2026-11-24T12:05:00Z', agora)).toBe('gerado ontem às 09:05');
    expect(quandoFoiGerado('2026-11-20T12:05:00Z', agora)).toBe('gerado em 20/11 às 09:05');
    expect(quandoFoiGerado('2026-11-25T02:30:00Z', agora)).toBe('gerado ontem às 23:30'); // ainda 24/11 em Brasília
    expect(quandoFoiGerado(null, agora)).toBe('');
  });
  it('demonstração: o resumo da Maria é o inventado e não repete a senha da conversa', () => {
    const maria = seedWa().find((c) => c.id === 'wa-maria')!;
    const r = resumoDemo('wa-maria', maria.msgs);
    expect(r.quer).toMatch(/descontos/);
    expect(r.recebidos).toContain('RG (frente e verso)');
    expect(r.faltando).toEqual(['Procuração assinada']);
    expect(JSON.stringify(r)).not.toContain('Maria@2019');
  });
  it('demonstração: nas outras conversas o resumo sai das mensagens, com os documentos recebidos', () => {
    const antonio = seedWa().find((c) => c.id === 'wa-antonio')!;
    const r = resumoDemo('wa-antonio', antonio.msgs);
    expect(r.quer).toContain('Recebi a carta do banco');
    expect(r.recebidos).toEqual(['Contrato Emprestimo']);
    expect(r.proximoPasso).toMatch(/Esperar/);
  });
  it('demonstração: a conversa da Maria tem um áudio sem transcrição, com o texto inventado pronto', () => {
    const maria = seedWa().find((c) => c.id === 'wa-maria')!;
    const semTexto = maria.msgs.filter((m) => m.tipo === 'audio' && !m.transcricao);
    expect(semTexto.map((m) => m.id)).toEqual(['wm-a6']);
    expect(TRANSCRICOES_DEMO['wm-a6']).toMatch(/depois das seis/);
  });
});
