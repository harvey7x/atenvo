import { describe, expect, it, vi } from 'vitest';

/* A URL que a lista do inbox manda ao PostgREST, montada pelo postgrest-js de verdade (sem rede).
   Trava os parâmetros dos embeds `real`/`ult`: filtro de tipo SÓ no `real`, os dois ordenados por
   enviada_em desc com LIMIT 1 — e nada de `mensagens.limit=10`. */
vi.mock('@/lib/supabase', async () => {
  const { PostgrestClient } = await import('@supabase/postgrest-js');
  const rest = new PostgrestClient('http://pgrst.test/rest/v1');
  return {
    supabase: { from: (t: string) => rest.from(t) },
    isSupabaseConfigured: true,
    isDemoMode: false,
    isDemoModeEnabled: false,
    isMisconfigured: false,
    supabaseEnv: { hasUrl: true, hasKey: true },
  };
});

describe('consultaListaConversas → URL do PostgREST', () => {
  it('embeds real/ult com filtro, ordem e limite próprios; recorte keyset por cima', async () => {
    const { consultaListaConversas } = await import('./whatsapp');
    const q = consultaListaConversas('org-1').order('id', { ascending: false }).limit(1000).lt('id', 'zzz');
    const url = (q as unknown as { url: URL }).url;
    const p = url.searchParams;
    expect(url.pathname).toBe('/rest/v1/conversas');
    expect(p.get('organizacao_id')).toBe('eq.org-1');
    expect(p.get('canais.tipo')).toBe('eq.whatsapp');
    expect(p.get('real.tipo')).toBe('not.in.(sistema,nota_interna)');
    expect(p.get('real.order')).toBe('enviada_em.desc');
    expect(p.get('real.limit')).toBe('1');
    expect(p.get('ult.order')).toBe('enviada_em.desc');
    expect(p.get('ult.limit')).toBe('1');
    expect(p.has('ult.tipo')).toBe(false);                // `ult` é a última de QUALQUER tipo
    expect(p.has('mensagens.limit')).toBe(false);         // acabou o embed das 10
    expect(p.get('order')).toBe('id.desc');
    expect(p.get('limit')).toBe('1000');
    expect(p.get('id')).toBe('lt.zzz');
    const select = p.get('select') ?? '';
    expect(select).toContain('real:mensagens(');
    expect(select).toContain('ult:mensagens(');
  });

  it('busca pontual (ids) usa o MESMO select e os mesmos embeds', async () => {
    const { consultaListaConversas, SELECT_CONVERSAS } = await import('./whatsapp');
    const url = (consultaListaConversas('org-1').in('id', ['a', 'b']) as unknown as { url: URL }).url;
    expect(url.searchParams.get('id')).toBe('in.(a,b)');
    expect(url.searchParams.get('real.limit')).toBe('1');
    expect(url.searchParams.get('select')).toBe(SELECT_CONVERSAS.replace(/\s/g, ''));
  });

  it('visibilidade (22/10): sem escopo não recorta; com escopo só o responsável — inclusive na busca pontual', async () => {
    const { consultaListaConversas } = await import('./whatsapp');
    const { definirEscopoLista } = await import('@/lib/visibilidade');
    const semEscopo = (consultaListaConversas('org-1') as unknown as { url: URL }).url;
    expect(semEscopo.searchParams.has('contatos.responsavel_id')).toBe(false);
    definirEscopoLista('org-2', 'u-1');
    const carga = (consultaListaConversas('org-2').order('id', { ascending: false }).limit(1000) as unknown as { url: URL }).url;
    expect(carga.searchParams.get('contatos.responsavel_id')).toBe('eq.u-1');
    const alvo = (consultaListaConversas('org-2').in('id', ['a']) as unknown as { url: URL }).url;
    expect(alvo.searchParams.get('contatos.responsavel_id')).toBe('eq.u-1');
    expect(alvo.searchParams.get('real.limit')).toBe('1');
    // outra org da mesma aba não herda o recorte; voltar a null tira o filtro
    expect((consultaListaConversas('org-1') as unknown as { url: URL }).url.searchParams.has('contatos.responsavel_id')).toBe(false);
    // recorte SEM usuário conhecido ('') nunca vira "sem filtro": não casa com ninguém
    definirEscopoLista('org-2', '');
    expect((consultaListaConversas('org-2') as unknown as { url: URL }).url.searchParams.get('contatos.responsavel_id'))
      .toBe('eq.00000000-0000-0000-0000-000000000000');
    definirEscopoLista('org-2', null);
    expect((consultaListaConversas('org-2') as unknown as { url: URL }).url.searchParams.has('contatos.responsavel_id')).toBe(false);
  });
});
