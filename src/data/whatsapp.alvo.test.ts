import { beforeEach, describe, expect, it, vi } from 'vitest';

/* Busca-alvo e satélites contra o postgrest-js DE VERDADE (fetch falso, sem rede): os mesmos
   filtros/embeds da carga completa, restritos ao lote; etapa com TODAS as opps do contato
   (ganho grudento); IA enxuta; satélite abortado REJEITA (nunca "mapa vazio aplicado"). */

const h = vi.hoisted(() => {
  type Resp = (url: URL) => unknown[] | { erro: string };
  const estado = {
    chamadas: [] as URL[],
    respostas: {} as Record<string, Resp>,
    /** aborta este controller logo depois de responder a N-ésima chamada (1-based) */
    abortarApos: null as null | { n: number; ctl: AbortController },
  };
  const fakeFetch = async (input: string, init?: { signal?: AbortSignal | null }) => {
    if (init?.signal?.aborted) { const e = new Error('The user aborted a request.'); e.name = 'AbortError'; throw e; }
    const url = new URL(input);
    estado.chamadas.push(url);
    const tabela = url.pathname.split('/').pop()!;
    const r = estado.respostas[tabela]?.(url) ?? [];
    if (estado.abortarApos && estado.chamadas.length === estado.abortarApos.n) estado.abortarApos.ctl.abort();
    if (!Array.isArray(r)) return new Response(JSON.stringify({ message: r.erro }), { status: 400, headers: { 'content-type': 'application/json' } });
    return new Response(JSON.stringify(r), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  return { estado, fakeFetch };
});

vi.mock('@/lib/supabase', async () => {
  const { PostgrestClient } = await import('@supabase/postgrest-js');
  const rest = new PostgrestClient('http://pgrst.test/rest/v1', { fetch: h.fakeFetch as unknown as typeof fetch });
  return {
    supabase: { from: (t: string) => rest.from(t) },
    isSupabaseConfigured: true,
    isDemoMode: false,
    isDemoModeEnabled: false,
    isMisconfigured: false,
    supabaseEnv: { hasUrl: true, hasKey: true },
  };
});

const { buscarConversasAlvo, etapasPorContato, iaSessoesPorConversa } = await import('./whatsapp');
const { ehAbortado } = await import('./paginacao');

const inLista = (url: URL, col: string) => (url.searchParams.get(col) ?? '').replace(/^in\.\(|\)$/g, '').split(',').filter(Boolean);
const conversaDb = (id: string, contato: string) => ({
  id, status: 'aberta', status_id: null, nao_lidas: 1, ultima_interacao_em: '2026-10-20T12:00:00Z', criado_em: '2026-10-20T11:00:00Z',
  precisa_humano: false, precisa_humano_motivo: null, precisa_humano_em: null, atendente_id: null, etiquetas: [],
  ultimo_canal_id: 'c1', ultimo_numero: '5551', ultimo_provider: 'evolution', ultima_msg_canal_em: null,
  arquivada_em: null, fixada_em: null, silenciada_ate: null,
  contatos: { id: contato, nome: 'Cliente ' + id, telefone: '5551999', email: null, etiquetas: null, origem: null, observacoes: null, responsavel_id: 'u1', contato_identidades: [{ tipo: 'whatsapp' }] },
  canais: { id: 'c1', nome_interno: 'ANDRIUS', tipo: 'whatsapp' },
  real: [{ id: 'm-' + id, direcao: 'entrada', conteudo: 'quero revisar', tipo: 'texto', enviada_em: '2026-10-20T12:00:00Z', recebida_em: '2026-10-20T12:00:00Z', criado_em: '2026-10-20T12:00:00Z', origem: null, status: 'recebida', erro_envio: null, metadados: {} }],
  ult: [],
});

beforeEach(() => {
  h.estado.chamadas = [];
  h.estado.respostas = {};
  h.estado.abortarApos = null;
});

describe('buscarConversasAlvo', () => {
  it('mesmo select/embeds da lista, recorte por id; etapa com TODAS as opps do contato; IA enxuta', async () => {
    h.estado.respostas = {
      conversas: (u) => inLista(u, 'id').map((id) => conversaDb(id, 'k-' + id)),
      oportunidades: () => [
        { id: 'o1', contato_id: 'k-a', status: 'ganho', responsavel_id: 'u1', atualizado_em: '2026-10-01T00:00:00Z', funil_colunas: { nome: 'Contrato', cor: '#0a0', entrada: false, resultado: 'ganho' } },
        { id: 'o2', contato_id: 'k-a', status: 'em_andamento', responsavel_id: 'u2', atualizado_em: '2026-10-19T00:00:00Z', funil_colunas: { nome: 'Proposta', cor: '#00a', entrada: false, resultado: null } },
      ],
      ia_sessoes: () => [{ conversa_id: 'a', status: 'ativa', desativado_manual: true }],
    };
    const out = await buscarConversasAlvo('org-1', { ids: ['a'], contatoIds: [] });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      id: 'a', name: 'Cliente a', contatoId: 'k-a', respId: 'u1', chip: 'ANDRIUS', canalId: 'c1', last: 'quero revisar',
      aguardando: true, unread: 1, etapa: 'Contrato', oppStatus: 'ganho', iaAtiva: false, iaStatus: 'ativa',
    });
    const [qConv, ...satelites] = h.estado.chamadas;
    expect(qConv.pathname).toBe('/rest/v1/conversas');
    expect(qConv.searchParams.get('id')).toBe('in.(a)');
    expect(qConv.searchParams.get('organizacao_id')).toBe('eq.org-1');
    expect(qConv.searchParams.get('canais.tipo')).toBe('eq.whatsapp');
    expect(qConv.searchParams.get('real.limit')).toBe('1');
    const opp = satelites.find((u) => u.pathname.endsWith('/oportunidades'))!;
    expect(opp.searchParams.get('contato_id')).toBe('in.(k-a)');
    expect(opp.searchParams.get('organizacao_id')).toBe('eq.org-1');
    const ia = satelites.find((u) => u.pathname.endsWith('/ia_sessoes'))!;
    expect(ia.searchParams.get('conversa_id')).toBe('in.(a)');
    expect(ia.searchParams.get('select')).toContain('desativado_manual:dados->desativado_manual');
    expect(ia.searchParams.get('select')).not.toMatch(/(^|,)dados(,|$)/);
  });

  it('lista leve: `ult` diferente da `real` vem inteira pelo id (só ela), em paralelo com os satélites', async () => {
    const nota = { id: 'n-b', direcao: 'saida', conteudo: 'ligar amanhã', tipo: 'nota_interna', enviada_em: '2026-10-20T12:05:00Z', recebida_em: null, criado_em: '2026-10-20T12:05:00Z', origem: null, status: 'enviada', erro_envio: null, metadados: {} };
    h.estado.respostas = {
      conversas: (u) => inLista(u, 'id').map((id) => ({ ...conversaDb(id, 'k-' + id), ult: [{ id: id === 'b' ? 'n-b' : 'm-' + id }] })),
      mensagens: (u) => (inLista(u, 'id').includes('n-b') ? [nota] : []),
    };
    const out = await buscarConversasAlvo('org-1', { ids: ['a', 'b'], contatoIds: [] });
    const msgs = h.estado.chamadas.filter((u) => u.pathname.endsWith('/mensagens'));
    expect(msgs).toHaveLength(1);
    expect(inLista(msgs[0], 'id')).toEqual(['n-b']);
    expect(msgs[0].searchParams.get('organizacao_id')).toBe('eq.org-1');
    expect(msgs[0].searchParams.get('select')).not.toContain('id_externo');
    const b = out.find((c) => c.id === 'b')!;
    expect(b.msgs.map((m) => m.id)).toEqual(['m-b', 'n-b']);   // 1ª pintura: a real e a nota
    expect(b.last).toBe('quero revisar');                       // preview segue a real
    expect(out.find((c) => c.id === 'a')!.msgs.map((m) => m.id)).toEqual(['m-a']);
  });

  it('lista leve: erro ao completar a `ult` rejeita (estrita, como as páginas)', async () => {
    h.estado.respostas = {
      conversas: (u) => inLista(u, 'id').map((id) => ({ ...conversaDb(id, 'k-' + id), ult: [{ id: 'outra' }] })),
      mensagens: () => ({ erro: 'permission denied' }),
    };
    await expect(buscarConversasAlvo('org-1', { ids: ['a'], contatoIds: [] })).rejects.toThrow();
  });

  it('recorte por contato e lotes de no máximo 100 ids', async () => {
    h.estado.respostas = { conversas: (u) => [...inLista(u, 'id'), ...inLista(u, 'contato_id')].map((x) => conversaDb('c' + x, x)) };
    const ids = Array.from({ length: 230 }, (_, i) => 'i' + i);
    await buscarConversasAlvo('org-1', { ids, contatoIds: ['k1'] });
    const conv = h.estado.chamadas.filter((u) => u.pathname.endsWith('/conversas'));
    expect(conv.map((u) => inLista(u, 'id').length || inLista(u, 'contato_id').length)).toEqual([100, 100, 30, 1]);
    expect(conv[3].searchParams.get('contato_id')).toBe('in.(k1)');
  });

  it('nada encontrado → [] sem consultar os satélites', async () => {
    expect(await buscarConversasAlvo('org-1', { ids: ['x'], contatoIds: [] })).toEqual([]);
    expect(h.estado.chamadas.map((u) => u.pathname)).toEqual(['/rest/v1/conversas']);
  });

  it('ESTRITA: erro num satélite rejeita (nunca devolve card sem etapa — ganho cairia em Todos)', async () => {
    h.estado.respostas = { conversas: (u) => inLista(u, 'id').map((id) => conversaDb(id, 'k-' + id)), oportunidades: () => ({ erro: 'permission denied' }) };
    await expect(buscarConversasAlvo('org-1', { ids: ['a'], contatoIds: [] })).rejects.toThrow();
  });

  it('abortada: rejeita com AbortError', async () => {
    const ctl = new AbortController();
    h.estado.respostas = { conversas: (u) => inLista(u, 'id').map((id) => conversaDb(id, 'k-' + id)) };
    h.estado.abortarApos = { n: 1, ctl };
    await expect(buscarConversasAlvo('org-1', { ids: ['a'], contatoIds: [] }, ctl.signal)).rejects.toSatisfy(ehAbortado);
  });
});

describe('satélites da carga completa (best-effort, mas o aborto vence)', () => {
  const opps = (n: number, ini = 0) => Array.from({ length: n }, (_, i) => ({ id: 'o' + String(99999 - ini - i), contato_id: 'k' + i, status: 'em_andamento', responsavel_id: null, atualizado_em: '2026-10-01', funil_colunas: { nome: 'E', cor: null, entrada: false, resultado: null } }));
  it('etapasPorContato abortado depois da 1ª página: REJEITA e não pede a 2ª', async () => {
    const ctl = new AbortController();
    h.estado.respostas = { oportunidades: (u) => (u.searchParams.get('id') ? opps(5, 1000) : opps(1000)) };
    h.estado.abortarApos = { n: 1, ctl };
    await expect(etapasPorContato('org-1', ctl.signal)).rejects.toSatisfy(ehAbortado);
    expect(h.estado.chamadas).toHaveLength(1);
  });
  it('etapasPorContato com erro comum segue best-effort (Map vazio, a lista vive)', async () => {
    h.estado.respostas = { oportunidades: () => ({ erro: 'permission denied' }) };
    expect((await etapasPorContato('org-1')).size).toBe(0);
  });
  it('iaSessoesPorConversa: select enxuto, true/false/null e aborto rejeita', async () => {
    h.estado.respostas = { ia_sessoes: () => [
      { conversa_id: 'a', status: 'ativa', desativado_manual: true },
      { conversa_id: 'b', status: 'ativa', desativado_manual: false },
      { conversa_id: 'c', status: 'ativa', desativado_manual: null },
    ] };
    const m = await iaSessoesPorConversa('org-1');
    expect(h.estado.chamadas[0].searchParams.get('select')).toBe('conversa_id,status,desativado_manual:dados->desativado_manual');
    expect([m.get('a')?.iaAtiva, m.get('b')?.iaAtiva, m.get('c')?.iaAtiva]).toEqual([false, true, true]);
    const ctl = new AbortController();
    ctl.abort();
    await expect(iaSessoesPorConversa('org-1', ctl.signal)).rejects.toSatisfy(ehAbortado);
  });
});
