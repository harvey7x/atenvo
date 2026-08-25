import { assertEquals } from 'jsr:@std/assert';
import { normalizaCpfPlanilha, normalizaTelefonePlanilha } from './normaliza.ts';

Deno.test('CPF: 11 dígitos formata preservando zeros à esquerda', () => {
  assertEquals(normalizaCpfPlanilha('00280057030'), '002.800.570-30');
  assertEquals(normalizaCpfPlanilha('002.800.570-30'), '002.800.570-30');
  assertEquals(normalizaCpfPlanilha(' 528.658.750-96 '), '528.658.750-96');
});

Deno.test('CPF: fora de 11 dígitos é rejeitado (null)', () => {
  assertEquals(normalizaCpfPlanilha(''), null);
  assertEquals(normalizaCpfPlanilha('1234567890'), null); // 10
  assertEquals(normalizaCpfPlanilha('123456789012'), null); // 12
  assertEquals(normalizaCpfPlanilha('abc'), null);
});

Deno.test('telefone: remove 55 do país e formata celular (DD) 9XXXX-XXXX', () => {
  assertEquals(normalizaTelefonePlanilha('5551999884477'), '(51) 99988-4477');
  assertEquals(normalizaTelefonePlanilha('51999884477'), '(51) 99988-4477');
  assertEquals(normalizaTelefonePlanilha('+55 (51) 99988-4477'), '(51) 99988-4477');
});

Deno.test('telefone: fixo de 8 dígitos vira (DD) XXXX-XXXX', () => {
  assertEquals(normalizaTelefonePlanilha('555130104665'), '(51) 3010-4665');
  assertEquals(normalizaTelefonePlanilha('5130104665'), '(51) 3010-4665');
});

Deno.test('telefone: fora do padrão devolve só os dígitos, sem inventar DDD', () => {
  assertEquals(normalizaTelefonePlanilha('999884477'), '999884477'); // sem DDD
  assertEquals(normalizaTelefonePlanilha(''), '');
  assertEquals(normalizaTelefonePlanilha('55'), '55');
});
