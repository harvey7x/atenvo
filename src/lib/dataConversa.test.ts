import { describe, it, expect } from 'vitest';
import { chaveDiaSP, rotuloDia, precisaSeparador, construirItensConversa } from './dataConversa';

// "Agora" fixo para todos os testes relativos: 16/07/2026 (quinta) 15:00 em SP = 18:00 UTC.
const AGORA = new Date('2026-07-16T18:00:00Z');
// Helpers: ISO em UTC correspondente a um horário de SP (SP = UTC-3).
const spm = (dia: string, hhmmss = '12:00:00') => new Date(`${dia}T${hhmmss}-03:00`).toISOString();

describe('chaveDiaSP() — dia no fuso de São Paulo', () => {
  it('meio-dia é trivial', () => {
    expect(chaveDiaSP(spm('2026-07-16'))).toBe('2026-07-16');
  });
  it('21h de SP NÃO vira o dia seguinte (bug do slice UTC)', () => {
    // 21h SP = 00h UTC do dia 17. .slice(0,10) daria 2026-07-17; o correto é 2026-07-16.
    expect(chaveDiaSP('2026-07-17T00:00:00Z')).toBe('2026-07-16');
  });
  it('01h de SP continua no mesmo dia', () => {
    expect(chaveDiaSP(spm('2026-07-16', '01:00:00'))).toBe('2026-07-16');
  });
  it('ISO inválido/nulo → vazio', () => {
    expect(chaveDiaSP(null)).toBe('');
    expect(chaveDiaSP('lixo')).toBe('');
  });
});

describe('rotuloDia() — rótulos relativos', () => {
  it('mensagem de hoje → Hoje', () => {
    expect(rotuloDia(spm('2026-07-16', '09:00:00'), AGORA)).toBe('Hoje');
    expect(rotuloDia(spm('2026-07-16', '23:30:00'), AGORA)).toBe('Hoje'); // ainda hoje em SP
  });
  it('mensagem de ontem → Ontem', () => {
    expect(rotuloDia(spm('2026-07-15'), AGORA)).toBe('Ontem');
  });
  it('mesma semana → dia da semana', () => {
    expect(rotuloDia(spm('2026-07-14'), AGORA)).toBe('Terça-feira');   // 2 dias
    expect(rotuloDia(spm('2026-07-13'), AGORA)).toBe('Segunda-feira'); // 3 dias
    expect(rotuloDia(spm('2026-07-10'), AGORA)).toBe('Sexta-feira');   // 6 dias
  });
  it('7 dias ou mais → data completa DD/MM/AAAA', () => {
    expect(rotuloDia(spm('2026-07-09'), AGORA)).toBe('09/07/2026'); // 7 dias
    expect(rotuloDia(spm('2026-06-30'), AGORA)).toBe('30/06/2026');
  });
  it('virada de mês: ontem cai no mês anterior', () => {
    const agora1ago = new Date('2026-08-01T15:00:00-03:00');
    expect(rotuloDia(spm('2026-07-31'), agora1ago)).toBe('Ontem');
    expect(rotuloDia(spm('2026-08-01'), agora1ago)).toBe('Hoje');
  });
  it('virada de ano: 31/12 visto de 01/01', () => {
    const agora1jan = new Date('2027-01-01T15:00:00-03:00');
    expect(rotuloDia(spm('2026-12-31'), agora1jan)).toBe('Ontem');
    expect(rotuloDia(spm('2026-12-25'), agora1jan)).toBe('25/12/2026'); // 7 dias
  });
  it('data no futuro cai na data cheia (não inventa "Hoje")', () => {
    expect(rotuloDia(spm('2026-07-20'), AGORA)).toBe('20/07/2026');
  });
  it('ISO inválido → vazio', () => {
    expect(rotuloDia(null, AGORA)).toBe('');
  });
});

describe('precisaSeparador() — quando abrir um novo dia', () => {
  it('primeira mensagem da lista sempre abre', () => {
    expect(precisaSeparador(spm('2026-07-16'), null)).toBe(true);
    expect(precisaSeparador(spm('2026-07-16'), undefined)).toBe(true);
  });
  it('mesma data → NÃO repete o separador', () => {
    expect(precisaSeparador(spm('2026-07-16', '16:32:00'), spm('2026-07-16', '15:26:00'))).toBe(false);
  });
  it('mudou o dia → insere separador', () => {
    expect(precisaSeparador(spm('2026-07-16'), spm('2026-07-15'))).toBe(true);
  });
  it('cruza a meia-noite de SP no mesmo instante UTC-adjacente', () => {
    // 23h SP dia 15 (02h UTC 16) e 01h SP dia 16 (04h UTC 16): dias diferentes em SP.
    expect(precisaSeparador('2026-07-16T04:00:00Z', '2026-07-16T02:00:00Z')).toBe(true);
  });
  it('duas msgs à noite no MESMO dia de SP não duplicam', () => {
    // ambas 20h e 22h de SP do dia 16 (23h e 01hUTC): mesmo dia SP.
    expect(precisaSeparador('2026-07-17T01:00:00Z', '2026-07-16T23:00:00Z')).toBe(false);
  });
  it('sem data na atual → não quebra o fio', () => {
    expect(precisaSeparador(null, spm('2026-07-16'))).toBe(false);
  });
});

describe('construirItensConversa() — sequência renderizável (integração)', () => {
  const AG = new Date('2026-07-16T18:00:00Z'); // 15h SP
  const msg = (dia: string, hh: string) => ({ ts: new Date(`${dia}T${hh}-03:00`).toISOString(), t: `${dia} ${hh}` });
  const get = (m: { ts: string }) => m.ts;

  it('3 mensagens no MESMO dia (hoje) → 1 separador "Hoje" + 3 mensagens', () => {
    const msgs = [msg('2026-07-16','17:18'), msg('2026-07-16','17:19'), msg('2026-07-16','22:26')];
    const itens = construirItensConversa(msgs, get, AG);
    const seps = itens.filter((i) => i.tipo === 'sep');
    expect(seps).toHaveLength(1);
    expect(seps[0]).toMatchObject({ label: 'Hoje' });
    expect(itens.filter((i) => i.tipo === 'msg')).toHaveLength(3);
    expect(itens[0].tipo).toBe('sep'); // separador vem ANTES da 1ª msg
  });

  it('mensagens em DOIS dias → 2 separadores (Ontem, depois Hoje)', () => {
    const msgs = [msg('2026-07-15','18:10'), msg('2026-07-16','17:18'), msg('2026-07-16','17:19')];
    const itens = construirItensConversa(msgs, get, AG);
    const seps = itens.filter((i) => i.tipo === 'sep').map((i) => (i as { label: string }).label);
    expect(seps).toEqual(['Ontem', 'Hoje']);
  });

  it('chaves são estáveis e únicas', () => {
    const msgs = [msg('2026-07-15','18:10'), msg('2026-07-16','17:18')];
    const chaves = construirItensConversa(msgs, get, AG).map((i) => i.chave);
    expect(new Set(chaves).size).toBe(chaves.length);
    expect(chaves).toContain('sep-2026-07-15');
    expect(chaves).toContain('sep-2026-07-16');
  });

  it('mensagem sem tsISO não gera separador nem quebra a lista', () => {
    const msgs = [{ ts: '' }, msg('2026-07-16','17:18')];
    const itens = construirItensConversa(msgs, (m) => m.ts, AG);
    expect(itens.filter((i) => i.tipo === 'msg')).toHaveLength(2); // as 2 msgs continuam
    expect(itens.filter((i) => i.tipo === 'sep')).toHaveLength(1); // só a datada abre dia
  });

  it('lista vazia → nenhum item', () => {
    expect(construirItensConversa([], get, AG)).toEqual([]);
  });
});
