// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { csvDe } from './planilha';

describe('planilha (CSV para o Excel em português)', () => {
  it('ponto e vírgula, BOM, CRLF e aspas só onde precisa', () => {
    const s = csvDe([['Cliente', 'Obs'], ['Maria; Souza', 'disse "sim"'], ['João', null]]);
    expect(s.startsWith('﻿')).toBe(true);
    expect(s).toBe('﻿Cliente;Obs\r\n"Maria; Souza";"disse ""sim"""\r\nJoão;\r\n');
  });
  it('número no formato brasileiro e fórmula não vira fórmula', () => {
    const s = csvDe([[1234.5, '=SOMA(A1)', '+5511999']]);
    expect(s).toBe("﻿1.234,5;'=SOMA(A1);'+5511999\r\n");
  });
});
