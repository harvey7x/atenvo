// @vitest-environment node
// a origem do anúncio que o evolution-webhook grava (supabase-reviza/functions/evolution-webhook/anuncio.ts, lógica pura)
import { describe, expect, it } from 'vitest';
import { anuncioOf } from '../../supabase-reviza/functions/evolution-webhook/anuncio';

const AD = { title: 'Simulação grátis para aposentados', body: 'Fale com a gente', sourceType: 'ad', sourceId: '120212345678901234', sourceUrl: 'https://fb.me/abc', ctwaClid: 'Afx-clid-1' };

describe('anúncio de onde veio a mensagem', () => {
  it('lê o externalAdReply dentro do extendedTextMessage', () => {
    const r = anuncioOf({ message: { extendedTextMessage: { text: 'Olá! Quero saber mais', contextInfo: { externalAdReply: AD } } } });
    expect(r).toEqual({ source_id: '120212345678901234', title: AD.title, body: AD.body, source_url: AD.sourceUrl, ctwa_clid: 'Afx-clid-1', source_type: 'ad' });
  });
  it('também no contextInfo do evento e em mensagem embrulhada (temporária)', () => {
    expect(anuncioOf({ contextInfo: { externalAdReply: AD }, message: { conversation: 'Oi' } })?.source_id).toBe(AD.sourceId);
    expect(anuncioOf({ message: { ephemeralMessage: { message: { extendedTextMessage: { text: 'oi', contextInfo: { externalAdReply: AD } } } } } })?.title).toBe(AD.title);
  });
  it('link compartilhado não é anúncio; mensagem comum também não', () => {
    expect(anuncioOf({ message: { extendedTextMessage: { text: 'olha', contextInfo: { externalAdReply: { title: 'Notícia', sourceUrl: 'https://g1.globo.com', sourceType: 'url' } } } } })).toBeNull();
    expect(anuncioOf({ message: { conversation: 'Bom dia' } })).toBeNull();
    expect(anuncioOf(null)).toBeNull();
  });
  it('ID estranho não vira ID (fica só o título); ctwaClid sozinho já prova que é anúncio', () => {
    const r = anuncioOf({ message: { extendedTextMessage: { contextInfo: { externalAdReply: { title: 'X', sourceId: 'abc<script>', ctwaClid: 'c1' } } } } });
    expect(r).toMatchObject({ source_id: null, title: 'X', ctwa_clid: 'c1', source_type: 'ad' });
  });
});
