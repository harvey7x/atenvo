import { describe, it, expect } from 'vitest';
import { chaveCanonicaTelefone, apenasDigitosJid, mesmoNumero } from './waNumero';

// ─────────────────────────────────────────────────────────────────────────────
// PARIDADE TS ≡ SQL
// A coluna `sql` NÃO foi escrita à mão: é a saída literal de
//   select v, chave_canonica_telefone(v) from unnest(array[...]) v;
// rodado no banco de produção (afmzuoavvnpfossiiypz) em 23/07/2026.
// Para regerar depois de mexer na SQL, rode a mesma query e cole o resultado aqui.
// Enquanto os dois lados baterem, front e webhook agrupam idêntico.
// ─────────────────────────────────────────────────────────────────────────────
const PARIDADE_SQL: Array<[entrada: string, sql: string | null]> = [
  ['5551981602825', '5181602825'],
  ['555181602825', '5181602825'],
  ['5551981602825@s.whatsapp.net', '5181602825'],
  ['+55 (51) 98160-2825', '5181602825'],
  ['  55 51 98160 2825  ', '5181602825'],
  ['5555991431623', '5591431623'],
  ['555591431623', '5591431623'],
  ['5551983259844', '5183259844'],
  ['555183259844', '5183259844'],
  ['5554981296309', '5481296309'],
  ['555481296309', '5481296309'],
  ['5551994099393', '5194099393'],
  ['5554994099393', '5494099393'],
  ['555133334444', '5133334444'],
  ['5551983334444', '5183334444'],
  ['5511987654321', '1187654321'],
  ['551133334444', '1133334444'],
  ['351912345678', '351912345678'],
  ['19998887777', '1998887777'],
  ['274692938473827', '274692938473827'],
  ['5551', '5551'],
  ['', null],
  ['abc', null],
  ['005551981602825', '005551981602825'],
  ['5551981602825:12@s.whatsapp.net', '555198160282512'],
  ['5599999999999999', '5599999999999999'],
];

describe('paridade TS ≡ SQL (chave_canonica_telefone)', () => {
  it.each(PARIDADE_SQL)('%s → SQL devolve %s e o TS tem que devolver o mesmo', (entrada, sql) => {
    expect(chaveCanonicaTelefone(entrada)).toBe(sql);
  });
});

describe('chaveCanonicaTelefone — comportamento', () => {
  it('colapsa as duas formas do celular brasileiro (o bug do nono dígito)', () => {
    expect(chaveCanonicaTelefone('5551981602825')).toBe('5181602825'); // com o 9
    expect(chaveCanonicaTelefone('555181602825')).toBe('5181602825'); // sem o 9
  });
  it('não confunde DDDs diferentes com os mesmos 8 finais', () => {
    // MARLENE (51) e MARLENE (54) compartilham 94099393 e NÃO podem virar a mesma pessoa
    expect(chaveCanonicaTelefone('5551994099393')).not.toBe(chaveCanonicaTelefone('5554994099393'));
  });
  it('não confunde celular com fixo do mesmo DDD (fixo começa 2-5, celular 8-9)', () => {
    expect(chaveCanonicaTelefone('555133334444')).toBe('5133334444');
    expect(chaveCanonicaTelefone('5551983334444')).toBe('5183334444');
  });
  it('preserva DDD 11, onde o nono dígito é antigo e real', () => {
    expect(chaveCanonicaTelefone('5511987654321')).toBe('1187654321');
  });
  it('11 dígitos sem DDI é tratado como brasileiro (todo cliente da casa é BR)', () => {
    expect(chaveCanonicaTelefone('19998887777')).toBe('1998887777');
  });
  it('número claramente internacional passa intacto', () => {
    expect(chaveCanonicaTelefone('351912345678')).toBe('351912345678');
  });
  it('devolve null para vazio/lixo', () => {
    expect(chaveCanonicaTelefone(null)).toBeNull();
    expect(chaveCanonicaTelefone(undefined)).toBeNull();
    expect(chaveCanonicaTelefone('')).toBeNull();
    expect(chaveCanonicaTelefone('abc')).toBeNull();
  });
  it('LID não é telefone e nunca casa com um', () => {
    expect(mesmoNumero('274692938473827', '5551981602825')).toBe(false);
  });
});

describe('apenasDigitosJid — a armadilha do sufixo de dispositivo', () => {
  it('JID simples: só tirar não-dígitos já bastaria', () => {
    expect(apenasDigitosJid('5551981602825@s.whatsapp.net')).toBe('5551981602825');
  });
  it('JID com dispositivo: sem limpar, a chave sai ERRADA', () => {
    // documenta o perigo — vale para a SQL também
    expect(chaveCanonicaTelefone('5551981602825:12@s.whatsapp.net')).toBe('555198160282512');
    // com a limpeza correta, volta ao normal
    expect(chaveCanonicaTelefone(apenasDigitosJid('5551981602825:12@s.whatsapp.net'))).toBe('5181602825');
  });
  it('@lid não tem dígito no domínio e passa direto', () => {
    expect(apenasDigitosJid('274692938473827@lid')).toBe('274692938473827');
  });
  it('devolve null para vazio', () => {
    expect(apenasDigitosJid(null)).toBeNull();
    expect(apenasDigitosJid('@s.whatsapp.net')).toBeNull();
  });
});

describe('cruzamento Evolution × Meta (o caso que motiva o Bloco 0)', () => {
  const casos: Array<[meta: string, evolution: string]> = [
    ['5551981602825', '555181602825'], // número interno 2825
    ['5555991431623', '555591431623'], // BRUNA ROSSI
    ['5551983259844', '555183259844'], // MARISA
    ['5554981296309', '555481296309'], // DENICE AIMI
  ];
  it.each(casos)('wa_id %s (Meta) resolve para o mesmo contato que %s (Evolution)', (meta, evo) => {
    expect(mesmoNumero(meta, evo)).toBe(true);
  });
});
