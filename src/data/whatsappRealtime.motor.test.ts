import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WaContact, WaMessage } from '@/data/whatsappDemo';
import {
  CarimbosRealtime, criarFilaAlvos, criarMotorRealtime, pousarCargaCompleta, type CtxRoteamento, type DepsMotor, type IaEstadoLista, type LoteAlvos,
} from './whatsappRealtime';

/* O motor do realtime sem React: fila com throttle, busca-alvo, a corrida com a carga
   completa e os pisos (recarga completa) — com relógio falso. */

const conv = (c: Partial<WaContact> & { id: string }): WaContact => ({
  name: 'X', phone: '', chip: '', time: '', unread: 0, tabs: [], status: '', last: '', email: '',
  stage: '', resp: '', origin: '', tags: [], lastInter: '', notes: '', doc: null, msgs: [], ...c,
});
const ctx: CtxRoteamento = {
  mapMensagem: (r) => ({ id: r.id as string, dir: r.direcao === 'saida' ? 'out' : 'in', text: (r.conteudo as string) ?? '', time: '12:00', tipo: r.tipo as string, tsISO: r.enviada_em as string } as WaMessage),
};
const msgIn = (conversa: string, id = 'm' + Math.random().toString(36).slice(2, 7)) =>
  ({ id, conversa_id: conversa, direcao: 'entrada', conteudo: 'oi', tipo: 'texto', enviada_em: new Date().toISOString(), metadados: {} });

/** promessa controlável */
function adiado<T>() {
  let resolve!: (v: T) => void, reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe('criarFilaAlvos — throttle (não debounce)', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('1º pedido sai depois do atraso; pedidos seguidos NÃO adiam a busca agendada', async () => {
    const lotes: LoteAlvos[] = [];
    const fila = criarFilaAlvos({ executar: async (l) => { lotes.push(l); }, intervaloMs: 1000, atrasoMs: 150 });
    fila.pedir({ ids: ['a'] });
    await vi.advanceTimersByTimeAsync(100);
    fila.pedir({ ids: ['b'] });                 // um debounce reiniciaria aqui
    await vi.advanceTimersByTimeAsync(60);
    expect(lotes).toEqual([{ ids: ['a', 'b'], contatoIds: [] }]);
  });

  it('rajada contínua: no máximo 1 busca por segundo, nada perdido', async () => {
    const lotes: LoteAlvos[] = [];
    const fila = criarFilaAlvos({ executar: async (l) => { lotes.push(l); }, intervaloMs: 1000, atrasoMs: 150 });
    for (let i = 0; i < 30; i++) { fila.pedir({ ids: ['c' + i] }); await vi.advanceTimersByTimeAsync(100); }
    await vi.advanceTimersByTimeAsync(2000);
    const todos = lotes.flatMap((l) => l.ids);
    expect(new Set(todos).size).toBe(30);
    expect(lotes.length).toBeLessThanOrEqual(5);   // ~3 s de rajada → ≤ 4–5 buscas
  });

  it('pedidos durante uma busca vão no lote seguinte; erro do executar não trava a fila', async () => {
    const lotes: LoteAlvos[] = [];
    let primeira = true;
    const fila = criarFilaAlvos({
      executar: async (l) => { lotes.push(l); if (primeira) { primeira = false; throw new Error('x'); } },
      intervaloMs: 1000, atrasoMs: 150,
    });
    fila.pedir({ ids: ['a'] });
    await vi.advanceTimersByTimeAsync(150);
    fila.pedir({ contatoIds: ['k'] });
    await vi.advanceTimersByTimeAsync(1000);
    expect(lotes).toEqual([{ ids: ['a'], contatoIds: [] }, { ids: [], contatoIds: ['k'] }]);
  });

  it('retirar tira o que vai ser buscado por fora; parar descarta tudo', async () => {
    const lotes: LoteAlvos[] = [];
    const fila = criarFilaAlvos({ executar: async (l) => { lotes.push(l); }, atrasoMs: 150 });
    fila.pedir({ ids: ['a', 'b'] });
    fila.retirar({ ids: ['a'] });
    expect(fila.pendentes().ids).toEqual(['b']);
    fila.parar();
    await vi.advanceTimersByTimeAsync(2000);
    expect(lotes).toEqual([]);
  });
});

describe('criarMotorRealtime', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  function montar(inicial: WaContact[] | undefined, buscar: (l: LoteAlvos, s: AbortSignal) => Promise<WaContact[]>, extra: Partial<DepsMotor> = {}) {
    let cache = inicial;
    const recargas: string[] = [];
    const carimbos = new CarimbosRealtime();
    const motor = criarMotorRealtime({
      carimbos, ctx, buscar,
      ler: () => cache,
      gravar: (fn) => { const v = fn(cache); if (v !== undefined) cache = v; },
      recarregarTudo: (m) => { recargas.push(m); },
      ...extra,
    });
    return { motor, carimbos, recargas, get cache() { return cache; }, set cache(v) { cache = v; } };
  }

  it('CONVERSA NOVA aparece em bem menos de 2 s (INSERT de conversa + mensagem = 1 busca)', async () => {
    const buscas: LoteAlvos[] = [];
    const t = montar([conv({ id: 'a' })], async (l) => { buscas.push(l); return l.ids.includes('nova') ? [conv({ id: 'nova', last: 'oi' })] : []; });
    t.motor.evento('conversas', 'INSERT', { id: 'nova' }, null);
    t.motor.evento('mensagens', 'INSERT', msgIn('nova'), null);
    t.motor.evento('conversas', 'UPDATE', { id: 'nova', nao_lidas: 1 }, null);
    await vi.advanceTimersByTimeAsync(400);
    expect(t.cache!.map((c) => c.id)).toContain('nova');
    expect(buscas).toEqual([{ ids: ['nova'], contatoIds: [] }]);
    expect(t.recargas).toEqual([]);
  });

  it('ACK não gera busca nem recarga; mensagem nova da conversa da lista: patch já + 1 busca', async () => {
    const buscar = vi.fn(async () => [conv({ id: 'a', last: 'do banco' })]);
    const m1 = msgIn('a', 'm1');
    // o card já mostra m1 como a última (veio do INSERT/da carga): o ACK dela é só patch
    const t = montar([conv({ id: 'a', aberta: true, lastAtMs: 0, msgs: [ctx.mapMensagem(m1)!] })], buscar);
    t.motor.evento('mensagens', 'UPDATE', { ...m1, status: 'lida' }, null);
    await vi.advanceTimersByTimeAsync(2000);
    expect(buscar).not.toHaveBeenCalled();
    t.motor.evento('mensagens', 'INSERT', msgIn('a', 'm2'), null);
    expect(t.cache![0].unread).toBe(1);               // patch imediato, antes da busca
    await vi.advanceTimersByTimeAsync(200);
    expect(buscar).toHaveBeenCalledTimes(1);
    expect(t.cache![0].last).toBe('do banco');
    expect(t.recargas).toEqual([]);
  });

  it('CORRIDA: carga completa que partiu antes não apaga a conversa nova nem o patch; reaplica a busca', async () => {
    let versao = 1;
    const t = montar([conv({ id: 'a', last: 'velho' })], async (l) => l.ids.map((id) => conv({ id, last: `banco v${versao}` })));
    const marco = t.carimbos.abrir();                  // carga completa parte (lê as páginas)
    t.motor.evento('conversas', 'INSERT', { id: 'nova' }, null);
    await vi.advanceTimersByTimeAsync(200);            // busca-alvo pousa ANTES da carga
    expect(t.cache!.map((c) => c.id)).toEqual(['nova', 'a']);
    // a carga pousa com a foto antiga (sem 'nova')
    versao = 2;
    const { lista, tocados } = pousarCargaCompleta(t.cache, [conv({ id: 'a', last: 'velho' })], t.carimbos, marco);
    t.cache = lista;
    t.motor.pedir(tocados);
    t.carimbos.fechar(marco);
    expect(t.cache!.map((c) => c.id).sort()).toEqual(['a', 'nova']);   // não sumiu
    await vi.advanceTimersByTimeAsync(1200);
    expect(t.cache!.find((c) => c.id === 'nova')!.last).toBe('banco v2'); // e foi rebuscada
  });

  it('CORRIDA: evento durante a busca-alvo → o cache vence e a conversa é rebuscada', async () => {
    const pend = adiado<WaContact[]>();
    let chamadas = 0;
    const t = montar([conv({ id: 'a', unread: 0, lastAtMs: 0, aberta: true })], async () => { chamadas++; return chamadas === 1 ? pend.promise : [conv({ id: 'a', unread: 2 })]; });
    t.motor.evento('mensagens', 'INSERT', msgIn('a', 'm1'), null);
    await vi.advanceTimersByTimeAsync(200);            // busca 1 em voo
    t.motor.evento('mensagens', 'INSERT', msgIn('a', 'm2'), null);   // chega no meio
    expect(t.cache![0].unread).toBe(2);
    pend.resolve([conv({ id: 'a', unread: 1 })]);      // foto da busca 1: só a 1ª mensagem
    await vi.advanceTimersByTimeAsync(0);
    expect(t.cache![0].unread).toBe(2);                // não regrediu
    await vi.advanceTimersByTimeAsync(1200);
    expect(chamadas).toBe(2);                          // rebuscada
    expect(t.cache![0].unread).toBe(2);
  });

  it('PISO: busca-alvo falhando vira recarga completa — uma só, mesmo com vários erros', async () => {
    const t = montar([conv({ id: 'a' })], async () => { throw new Error('rede'); });
    t.motor.evento('conversas', 'INSERT', { id: 'n1' }, null);
    await vi.advanceTimersByTimeAsync(200);
    t.motor.evento('conversas', 'INSERT', { id: 'n2' }, null);
    await vi.advanceTimersByTimeAsync(1100);
    expect(t.recargas).toEqual([]);                    // timer do piso ainda correndo (não reinicia)
    await vi.advanceTimersByTimeAsync(400);
    expect(t.recargas).toEqual(['busca-alvo falhou']);
  });

  it('PISO: busca pendurada é abortada no timeout e vira recarga completa', async () => {
    const t = montar([conv({ id: 'a' })], (_l, signal) => new Promise((_res, rej) => {
      signal.addEventListener('abort', () => { const e = new Error('cancelada'); e.name = 'AbortError'; rej(e); });
    }));
    t.motor.evento('conversas', 'INSERT', { id: 'n1' }, null);
    await vi.advanceTimersByTimeAsync(15_200);
    await vi.advanceTimersByTimeAsync(1600);
    expect(t.recargas).toEqual(['busca-alvo falhou']);
  });

  it('PISO: evento que o caminho incremental não trata e patch que lança → recarga completa', async () => {
    const t = montar([conv({ id: 'a' })], async () => []);
    t.motor.evento('conversas', 'DELETE', null, { id: 'a' });
    await vi.advanceTimersByTimeAsync(1600);
    expect(t.recargas).toEqual(['conversa-excluida']);
    const quebra = criarMotorRealtime({
      carimbos: new CarimbosRealtime(), buscar: async () => [], ler: () => [conv({ id: 'a' })], gravar: () => undefined,
      recarregarTudo: (m) => t.recargas.push(m),
      ctx: { mapMensagem: () => { throw new Error('payload estranho'); } },
    });
    quebra.evento('mensagens', 'INSERT', msgIn('a'), null);
    await vi.advanceTimersByTimeAsync(1600);
    expect(t.recargas).toContain('erro no patch do realtime');
  });

  it('busca-alvo nunca remove conversa e conversa não encontrada não muda o cache', async () => {
    const t = montar([conv({ id: 'a' }), conv({ id: 'b' })], async () => []);
    const antes = t.cache;
    t.motor.evento('conversas', 'INSERT', { id: 'nao-whatsapp' }, null);
    await vi.advanceTimersByTimeAsync(300);
    expect(t.cache).toBe(antes);
  });

  it('agora(): busca imediata (deep-link/nova conversa) e sem duplicar o que já estava na fila', async () => {
    const buscar = vi.fn(async (l: LoteAlvos) => l.ids.map((id) => conv({ id })));
    const t = montar([conv({ id: 'a' })], buscar);
    t.motor.pedir({ ids: ['x'] });
    const ok = await t.motor.agora({ ids: ['x'] });
    expect(ok).toBe(true);
    expect(t.cache!.map((c) => c.id)).toEqual(['x', 'a']);
    await vi.advanceTimersByTimeAsync(2000);
    expect(buscar).toHaveBeenCalledTimes(1);
  });

  it('sem cache (carga completa em voo): a busca não grava; parar aborta e silencia tudo', async () => {
    const pend = adiado<WaContact[]>();
    let abortado = false;
    const t = montar(undefined, (_l, s) => { s.addEventListener('abort', () => { abortado = true; }); return pend.promise; });
    const emVoo = t.motor.agora({ ids: ['x'] });
    t.motor.evento('mensagens', 'INSERT', msgIn('x'), null);
    expect(t.cache).toBeUndefined();
    t.motor.parar();
    expect(abortado).toBe(true);
    pend.resolve([conv({ id: 'x' })]);
    expect(await emVoo).toBe(false);
    await vi.advanceTimersByTimeAsync(3000);
    expect(t.cache).toBeUndefined();
    expect(t.recargas).toEqual([]);
  });

  it('sem cache: a busca devolve false (não aplicou) e a carga completa que pousar depois reaplica', async () => {
    const t = montar(undefined, async (l) => l.ids.map((id) => conv({ id, last: 'banco' })));
    const marco = t.carimbos.abrir();                           // carga completa (partida a frio) em voo
    t.motor.evento('conversas', 'INSERT', { id: 'nova' }, null); // sem cache: só carimba
    expect(await t.motor.agora({ ids: ['outra'] })).toBe(false);
    const { lista, tocados } = pousarCargaCompleta(t.cache, [conv({ id: 'a' })], t.carimbos, marco);
    t.cache = lista;
    t.motor.pedir(tocados);
    t.carimbos.fechar(marco);
    await vi.advanceTimersByTimeAsync(1300);
    expect(t.cache!.map((c) => c.id).sort()).toEqual(['a', 'nova', 'outra']);
  });
});

/* ---------- achados da revisão (21/10) ---------- */

describe('criarMotorRealtime — achados da revisão', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  function montar(inicial: WaContact[] | undefined, buscar: (l: LoteAlvos, s: AbortSignal) => Promise<WaContact[]>, extra: Partial<DepsMotor> = {}) {
    let cache = inicial;
    const recargas: string[] = [];
    const carimbos = new CarimbosRealtime();
    const motor = criarMotorRealtime({
      carimbos, ctx, buscar,
      ler: () => cache,
      gravar: (fn) => { const v = fn(cache); if (v !== undefined) cache = v; },
      recarregarTudo: (m) => { recargas.push(m); },
      ...extra,
    });
    return { motor, carimbos, recargas, get cache() { return cache; }, set cache(v) { cache = v; } };
  }
  const achar = (l: WaContact[] | undefined, id: string) => l?.find((c) => c.id === id);

  it('busca-alvo que FALHA volta para a fila com espera (a recarga completa pode falhar junto): a conversa nova aparece', async () => {
    let n = 0;
    // a recarga completa do piso "falha" (stub não faz nada): sem a repetição, X não estaria em fila nenhuma
    const t = montar([conv({ id: 'a' })], async (l) => { n++; if (n === 1) throw new Error('timeout'); return l.ids.map((id) => conv({ id })); });
    t.motor.evento('conversas', 'INSERT', { id: 'X' }, null);
    await vi.advanceTimersByTimeAsync(200);
    expect(n).toBe(1);
    await vi.advanceTimersByTimeAsync(2000);
    expect(t.recargas).toEqual(['busca-alvo falhou']);
    expect(achar(t.cache, 'X')).toBeUndefined();
    await vi.advanceTimersByTimeAsync(4000);              // 5 s depois da falha
    expect(n).toBe(2);
    expect(achar(t.cache, 'X')).toBeDefined();
  });

  it('repetição tem teto: falhando sempre, 1 + 3 tentativas (5 s, 10 s, 20 s) e para', async () => {
    let n = 0;
    const t = montar([conv({ id: 'a' })], async () => { n++; throw new Error('rede'); });
    t.motor.evento('conversas', 'INSERT', { id: 'X' }, null);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(n).toBe(4);
    t.motor.parar();
  });

  it('CORRIDA: a busca-alvo carimba o que aplicou — carga completa que partiu antes não volta a etapa velha', async () => {
    const t = montar([conv({ id: 'a', contatoId: 'k', etapa: 'Negociacao' })], async () => [conv({ id: 'a', contatoId: 'k', etapa: 'Fechado' })]);
    t.motor.evento('mensagens', 'INSERT', msgIn('a'), null);   // carimba 'a' e agenda a busca (150 ms)
    const marco = t.carimbos.abrir();                           // carga completa parte DEPOIS do evento (leu Negociacao)
    await vi.advanceTimersByTimeAsync(200);                     // a opp virou ganho; a busca-alvo lê Fechado e pousa
    expect(achar(t.cache, 'a')!.etapa).toBe('Fechado');
    const { lista, tocados } = pousarCargaCompleta(t.cache, [conv({ id: 'a', contatoId: 'k', etapa: 'Negociacao' })], t.carimbos, marco);
    t.cache = lista;
    t.carimbos.fechar(marco);
    expect(achar(t.cache, 'a')!.etapa).toBe('Fechado');        // antes: voltava para Negociacao (Todos em vez de Fechados)
    expect(tocados.ids).toContain('a');                         // e a carga pede nova busca-alvo dele
  });

  it('CORRIDA: patch otimista + busca que leu ANTES do commit + UPDATE que confirma sem mudança visível → não desfaz', async () => {
    const primeira = adiado<WaContact[]>();
    let n = 0;
    const t = montar([conv({ id: 'a', arquivada: false })], async () => { n++; return n === 1 ? primeira.promise : [conv({ id: 'a', arquivada: true })]; });
    // patch otimista (patchOtimistaLista): grava + carimba
    t.cache = [{ ...t.cache![0], arquivada: true }];
    t.carimbos.tocar({ ids: ['a'] });
    t.motor.pedir({ ids: ['a'] });                              // a mensagem de saída de antes pediu a busca
    await vi.advanceTimersByTimeAsync(200);                     // a busca ABRE depois do carimbo e lê o banco antes do commit
    t.motor.evento('conversas', 'UPDATE', { id: 'a', arquivada_em: '2026-10-21T12:00:00Z' }, null);   // confirma: igual ao cache
    primeira.resolve([conv({ id: 'a', arquivada: false })]);
    await vi.advanceTimersByTimeAsync(0);
    expect(achar(t.cache, 'a')!.arquivada).toBe(true);          // antes: voltava para false (card de volta em Todos)
    await vi.advanceTimersByTimeAsync(1200);
    expect(n).toBe(2);                                          // rebuscada
    expect(achar(t.cache, 'a')!.arquivada).toBe(true);
  });

  it('CORRIDA: UPDATE de contato da conversa nova durante a busca dela → rebusca (dono e nome certos)', async () => {
    const primeira = adiado<WaContact[]>();
    let n = 0;
    const t = montar([conv({ id: 'a', contatoId: 'k-a' })], async () => {
      n++;
      return n === 1 ? primeira.promise : [conv({ id: 'nova', contatoId: 'k-nova', name: 'Maria', respId: 'u-consultor' })];
    });
    t.motor.evento('conversas', 'INSERT', { id: 'nova' }, null);
    await vi.advanceTimersByTimeAsync(200);                     // busca em voo (leu o contato antes do roteamento)
    t.motor.evento('contatos', 'UPDATE', { id: 'k-nova', nome: 'Maria', telefone: '5551', email: null, observacoes: null, origem: null, responsavel_id: 'u-consultor' }, null);
    primeira.resolve([conv({ id: 'nova', contatoId: 'k-nova', name: 'Contato', respId: null })]);
    await vi.advanceTimersByTimeAsync(0);
    expect(achar(t.cache, 'nova')).toBeDefined();               // entra mesmo assim (melhor que nada)
    await vi.advanceTimersByTimeAsync(1200);
    expect(n).toBe(2);                                          // antes: 1 busca e o card ficava em "Não atribuídos"
    expect(achar(t.cache, 'nova')).toMatchObject({ respId: 'u-consultor', name: 'Maria' });
  });

  it('oportunidade movida (ganho no Kanban) → busca-alvo pelo contato', async () => {
    const buscar = vi.fn(async (_l: LoteAlvos) => [conv({ id: 'a', contatoId: 'k1', etapa: 'Fechado', oppStatus: 'ganho' as const })]);
    const t = montar([conv({ id: 'a', contatoId: 'k1', etapa: 'Proposta' })], buscar);
    t.motor.evento('oportunidades', 'UPDATE', { id: 'o1', contato_id: 'k1', status: 'ganho' }, null);
    await vi.advanceTimersByTimeAsync(200);
    expect(buscar).toHaveBeenCalledTimes(1);
    expect(buscar.mock.calls[0][0]).toEqual({ ids: [], contatoIds: ['k1'] });
    expect(achar(t.cache, 'a')).toMatchObject({ etapa: 'Fechado', oppStatus: 'ganho' });
  });

  it('BACKSTOP próprio: patches a cada 5 s NÃO impedem a recarga completa em 240 s; aba oculta não recarrega', async () => {
    let ultimaCarga = Date.now();
    let visivel = true;
    const t = montar([conv({ id: 'a', unread: 0 })], async () => [], {
      backstopMs: 240_000, ultimaCargaCompletaEm: () => ultimaCarga, visivel: () => visivel,
      recarregarTudo: (m) => { t.recargas.push(m); ultimaCarga = Date.now(); },
    });
    for (let s = 5; s <= 300; s += 5) {
      t.motor.evento('conversas', 'UPDATE', { id: 'a', nao_lidas: s }, null);
      await vi.advanceTimersByTimeAsync(5000);
      if (s === 255) expect(t.recargas).toEqual(['backstop']);
    }
    expect(t.recargas).toEqual(['backstop']);                   // 1 em 300 s (a próxima só em ~480 s)
    visivel = false;
    await vi.advanceTimersByTimeAsync(600_000);
    expect(t.recargas).toEqual(['backstop']);
    visivel = true;
    await vi.advanceTimersByTimeAsync(15_000);
    expect(t.recargas).toEqual(['backstop', 'backstop']);
    t.motor.parar();
  });

  it('REFRESH de IA (60 s, aba visível): aplica só a diferença e carimba; carga completa no meio descarta; oculta não lê', async () => {
    let ultimaCarga = Date.now();
    let visivel = true;
    let resposta: Promise<Map<string, IaEstadoLista>> | null = null;
    const buscarIa = vi.fn(async () => resposta ?? new Map([['a', { iaAtiva: false, iaStatus: 'pausada' }], ['b', { iaAtiva: true, iaStatus: 'ativa' }]]));
    const b = conv({ id: 'b', iaAtiva: true, iaStatus: 'ativa' });
    const t = montar([conv({ id: 'a', iaAtiva: true, iaStatus: 'ativa' }), b], async () => [], {
      buscarIa, iaIntervaloMs: 60_000, relogioMs: 15_000, ultimaCargaCompletaEm: () => ultimaCarga, visivel: () => visivel,
    });
    const marco = t.carimbos.abrir();                           // uma carga aberta segura o carimbo para conferir
    await vi.advanceTimersByTimeAsync(75_000);
    expect(buscarIa).toHaveBeenCalledTimes(1);
    expect(achar(t.cache, 'a')).toMatchObject({ iaAtiva: false, iaStatus: 'pausada' });
    expect(achar(t.cache, 'b')).toBe(b);
    expect(t.carimbos.tocadosDepois(marco).ids).toEqual(['a']);
    t.carimbos.fechar(marco);
    // carga completa partiu durante a leitura: ela traz IA tão nova quanto — o refresh não sobrescreve
    const pend = adiado<Map<string, IaEstadoLista>>();
    resposta = pend.promise;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(buscarIa).toHaveBeenCalledTimes(2);
    ultimaCarga = Date.now();
    pend.resolve(new Map([['a', { iaAtiva: true, iaStatus: 'ativa' }]]));
    await vi.advanceTimersByTimeAsync(0);
    expect(achar(t.cache, 'a')).toMatchObject({ iaAtiva: false, iaStatus: 'pausada' });
    resposta = null;
    visivel = false;
    await vi.advanceTimersByTimeAsync(600_000);
    expect(buscarIa).toHaveBeenCalledTimes(2);
    t.motor.parar();
  });

  it('REFRESH de IA que falha não mexe no cache; parar cancela o relógio', async () => {
    const buscarIa = vi.fn(async () => { throw new Error('rls'); });
    const lista = [conv({ id: 'a', iaAtiva: true, iaStatus: 'ativa' })];
    const t = montar(lista, async () => [], { buscarIa, iaIntervaloMs: 60_000 });
    await vi.advanceTimersByTimeAsync(80_000);
    expect(buscarIa).toHaveBeenCalled();
    expect(t.cache).toBe(lista);
    t.motor.parar();
    const n = buscarIa.mock.calls.length;
    await vi.advanceTimersByTimeAsync(600_000);
    expect(buscarIa.mock.calls.length).toBe(n);
  });
});
