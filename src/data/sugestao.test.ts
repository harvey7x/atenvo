// @vitest-environment node
// "Sugerir resposta": a limpeza do texto da IA e os scripts no pedido (supabase-reviza/functions/_shared/iaPropria.ts, lógica pura)
import { describe, expect, it } from 'vitest';
import { lerSugestao, montarTextoScripts } from '../../supabase-reviza/functions/_shared/iaPropria';

describe('sugerir resposta', () => {
  it('tira aspas e rótulo que a IA às vezes põe, e corta textos enormes', () => {
    expect(lerSugestao('"Perfeito, recebi o RG!"')).toBe('Perfeito, recebi o RG!');
    expect(lerSugestao('Resposta: Oi, tudo bem?')).toBe('Oi, tudo bem?');
    expect(lerSugestao('a'.repeat(5000))).toHaveLength(1200);
    expect(lerSugestao('   ')).toBe('');
  });
  it('scripts entram até o teto, um por linha', () => {
    const s = montarTextoScripts([{ titulo: 'Pedir RG', conteudo: 'Me manda o RG\nfrente e verso' }, { titulo: 'Longo', conteudo: 'x'.repeat(900) }], 300);
    expect(s).toBe('- Pedir RG: Me manda o RG frente e verso');
  });
});
