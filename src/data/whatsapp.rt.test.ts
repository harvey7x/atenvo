import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryObserver, focusManager } from '@tanstack/react-query';
import type { WaContact, WaMessage } from '@/data/whatsappDemo';
import {
  aplicarEventoNoHistorico, criarMotorDaLista, gravarListaIncremental, mapMensagens, patchOtimistaLista, registrarCargaCompleta,
  type DbMsg,
} from './whatsapp';

/* Fios do realtime da lista com o react-query DE VERDADE (query-core 5.101), relógio falso.
   GOTCHA medido: todo setQueryData (1) grava dataUpdatedAt=agora e (2) reinicia o setInterval do
   refetchInterval do observer. Com o realtime fazendo patch a cada poucos segundos, o backstop de
   240 s e o refetchOnWindowFocus (staleTime 180 s) ficavam INERTES no horário comercial. */

const conv = (c: Partial<WaContact> & { id: string }): WaContact => ({
  name: 'X', phone: '', chip: '', time: '', unread: 0, tabs: [], status: '', last: '', email: '',
  stage: '', resp: '', origin: '', tags: [], lastInter: '', notes: '', doc: null, msgs: [], ...c,
});
function adiado<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((res) => { resolve = res; });
  return { promise, resolve };
}
let seqOrg = 0;
const novaOrg = () => `org-rt-${++seqOrg}`;

describe('lista do inbox: backstop e foco continuam vivos com patches frequentes', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { focusManager.setFocused(undefined); vi.useRealTimers(); });

  /** a query como useWaConversations a declara (mesmos tempos), com um queryFn falso */
  function montarLista(org: string) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.mount();   // como o QueryClientProvider: liga o focusManager (refetch ao focar)
    let cargas = 0;
    const obs = new QueryObserver<WaContact[]>(qc, {
      queryKey: ['wa-conversas', org], refetchInterval: 240_000, staleTime: 180_000, refetchOnWindowFocus: true,
      queryFn: async () => { cargas++; registrarCargaCompleta(org); return [conv({ id: 'a', unread: 0 })]; },
    });
    const sair = obs.subscribe(() => undefined);
    // nenhuma busca-alvo nem leitura de IA neste teste (sem banco)
    const motor = criarMotorDaLista(qc, org, { buscar: async () => [], buscarIa: undefined, aviso: () => undefined });
    return { qc, obs, motor, sair: () => { sair(); qc.unmount(); }, get cargas() { return cargas; } };
  }

  it('patch a cada 5 s (UPDATE de conversas) não impede a recarga completa em ≤ 255 s', async () => {
    const t = montarLista(novaOrg());
    await vi.advanceTimersByTimeAsync(0);
    expect(t.cargas).toBe(1);
    let segunda = -1;
    for (let s = 5; s <= 300; s += 5) {
      t.motor.evento('conversas', 'UPDATE', { id: 'a', nao_lidas: s }, null);
      await vi.advanceTimersByTimeAsync(5000);
      if (segunda < 0 && t.cargas >= 2) segunda = s;
    }
    expect(segunda).toBeGreaterThan(0);                // antes: 1 carga em 300 s (refetchInterval sempre reiniciado)
    expect(segunda).toBeLessThanOrEqual(255);
    expect(t.cargas).toBe(2);
    t.motor.parar(); t.sair();
  });

  it('escrita incremental preserva o dataUpdatedAt da carga completa: a lista fica velha e o FOCO recarrega', async () => {
    const org = novaOrg();
    const t = montarLista(org);
    await vi.advanceTimersByTimeAsync(0);
    const carga = t.qc.getQueryState(['wa-conversas', org])!.dataUpdatedAt;
    for (let s = 5; s <= 185; s += 5) {
      t.motor.evento('conversas', 'UPDATE', { id: 'a', nao_lidas: s }, null);
      await vi.advanceTimersByTimeAsync(5000);
    }
    expect(t.qc.getQueryData<WaContact[]>(['wa-conversas', org])![0].unread).toBe(185);   // patches aplicados
    expect(t.qc.getQueryState(['wa-conversas', org])!.dataUpdatedAt).toBe(carga);         // antes: "agora" a cada patch
    expect(t.obs.getCurrentResult().isStale).toBe(true);
    expect(t.cargas).toBe(1);
    focusManager.setFocused(false);
    focusManager.setFocused(true);                     // volta para a aba
    await vi.advanceTimersByTimeAsync(0);
    expect(t.cargas).toBe(2);
    t.motor.parar(); t.sair();
  });

  it('gravarListaIncremental: updater devolvendo undefined não grava; sem carga ainda, grava normal', () => {
    const qc = new QueryClient();
    const org = novaOrg();
    gravarListaIncremental(qc, org, () => undefined);
    expect(qc.getQueryState(['wa-conversas', org])).toBeUndefined();
    gravarListaIncremental(qc, org, () => [conv({ id: 'a' })]);
    expect(qc.getQueryData<WaContact[]>(['wa-conversas', org])!.map((c) => c.id)).toEqual(['a']);
  });
});

describe('patch otimista × busca que leu antes do commit (patchOtimistaLista + motor reais)', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  const montar = (org: string, buscar: () => Promise<WaContact[]>) => {
    const qc = new QueryClient();
    qc.setQueryData<WaContact[]>(['wa-conversas', org], [conv({ id: 'a', arquivada: false })]);
    const motor = criarMotorDaLista(qc, org, { buscar, buscarIa: undefined, backstopMs: undefined, aviso: () => undefined });
    const arquivada = () => qc.getQueryData<WaContact[]>(['wa-conversas', org])![0].arquivada;
    return { qc, motor, arquivada };
  };

  it('UPDATE de confirmação SEM mudança visível chega durante a busca: o arquivar não é desfeito', async () => {
    const org = novaOrg();
    const primeira = adiado<WaContact[]>();
    let n = 0;
    const t = montar(org, () => { n++; return n === 1 ? primeira.promise : Promise.resolve([conv({ id: 'a', arquivada: true })]); });
    patchOtimistaLista(t.qc, org, 'a', { arquivada: true });
    t.motor.pedir({ ids: ['a'] });
    await vi.advanceTimersByTimeAsync(200);            // a busca abre DEPOIS do patch e lê antes do commit
    t.motor.evento('conversas', 'UPDATE', { id: 'a', arquivada_em: '2026-10-21T12:00:00Z' }, null);
    primeira.resolve([conv({ id: 'a', arquivada: false })]);
    await vi.advanceTimersByTimeAsync(0);
    expect(t.arquivada()).toBe(true);
    await vi.advanceTimersByTimeAsync(1200);
    expect(n).toBe(2);
    expect(t.arquivada()).toBe(true);
    t.motor.parar();
  });

  it('UPDATE do realtime perdido: confirmar() no sucesso da RPC recarimba e a busca velha é desmentida', async () => {
    const org = novaOrg();
    const primeira = adiado<WaContact[]>();
    let n = 0;
    const t = montar(org, () => { n++; return n === 1 ? primeira.promise : Promise.resolve([conv({ id: 'a', arquivada: true })]); });
    const ot = patchOtimistaLista(t.qc, org, 'a', { arquivada: true });
    t.motor.pedir({ ids: ['a'] });
    await vi.advanceTimersByTimeAsync(200);
    ot.confirmar();                                    // a RPC resolveu (commit feito)
    primeira.resolve([conv({ id: 'a', arquivada: false })]);
    await vi.advanceTimersByTimeAsync(0);
    expect(t.arquivada()).toBe(true);
    await vi.advanceTimersByTimeAsync(1200);
    expect(n).toBe(2);
    t.motor.parar();
  });

  it('desfazer() volta o campo e pede a recarga completa', () => {
    const org = novaOrg();
    const t = montar(org, async () => []);
    const ot = patchOtimistaLista(t.qc, org, 'a', { arquivada: true });
    expect(t.arquivada()).toBe(true);
    ot.desfazer();
    expect(t.arquivada()).toBe(false);
    expect(t.qc.getQueryState(['wa-conversas', org])!.isInvalidated).toBe(true);   // piso: recarga completa
    t.motor.parar();
  });
});

describe('histórico da conversa aberta: UPDATE durante um refetch em voo', () => {
  const linha = (status: string, extra: Partial<DbMsg> = {}) => ({
    id: 'm1', conversa_id: 'c1', direcao: 'saida', conteudo: 'oi', tipo: 'texto', enviada_em: '2026-10-21T12:00:00Z', recebida_em: null,
    criado_em: '2026-10-21T12:00:00Z', origem: null, status, erro_envio: null, id_externo: null, respondida_a_id: null, metadados: {}, ...extra,
  });
  const montar = (org: string, segunda: () => WaMessage[]) => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const k = ['wa-msgs', org, 'c1'];
    qc.setQueryData<WaMessage[]>(k, mapMensagens([linha('enviada') as unknown as DbMsg]));
    const velho = adiado<WaMessage[]>();
    let n = 0;
    const obs = new QueryObserver<WaMessage[]>(qc, {
      queryKey: k, staleTime: 0,
      queryFn: () => { n++; return n === 1 ? velho.promise : Promise.resolve(segunda()); },
    });
    const sair = obs.subscribe(() => undefined);      // refetch ao montar: EM VOO (leu o banco antes do evento)
    return { qc, k, velho, sair, get n() { return n; } };
  };

  it('ACK que chega com o refetch em voo não é desfeito quando ele pousa (refaz a busca)', async () => {
    const org = novaOrg();
    const t = montar(org, () => mapMensagens([linha('lida') as unknown as DbMsg]));
    expect(t.qc.getQueryState(t.k)!.fetchStatus).toBe('fetching');
    aplicarEventoNoHistorico(t.qc, org, 'UPDATE', linha('lida'), null);
    expect(t.qc.getQueryData<WaMessage[]>(t.k)![0].status).toBe('lida');
    t.velho.resolve(mapMensagens([linha('enviada') as unknown as DbMsg]));   // foto de antes do UPDATE
    await new Promise((r) => setTimeout(r, 0));
    expect(t.n).toBe(2);
    expect(t.qc.getQueryData<WaMessage[]>(t.k)![0].status).toBe('lida');   // antes: voltava para 'enviada'
    t.sair();
  });

  it('mídia do cliente que ficou visível por UPDATE não SOME quando o refetch velho pousa', async () => {
    const org = novaOrg();
    const audio = (anexo: boolean) => linha('recebida', {
      id: 'm-audio', direcao: 'entrada', conteudo: '', tipo: 'audio', recebida_em: '2026-10-21T12:01:00Z', enviada_em: '2026-10-21T12:01:00Z',
      metadados: anexo ? { anexo_path: 'org/a.ogg', mime: 'audio/ogg', seconds: 12, ptt: true } : {},
    });
    const t = montar(org, () => mapMensagens([linha('enviada'), audio(true)] as unknown as DbMsg[]));
    aplicarEventoNoHistorico(t.qc, org, 'UPDATE', audio(true), null);      // webhook gravou o anexo
    expect(t.qc.getQueryData<WaMessage[]>(t.k)!.map((m) => m.id)).toEqual(['m1', 'm-audio']);
    t.velho.resolve(mapMensagens([linha('enviada'), audio(false)] as unknown as DbMsg[]));   // leu sem o anexo (filtrada)
    await new Promise((r) => setTimeout(r, 0));
    expect(t.qc.getQueryData<WaMessage[]>(t.k)!.map((m) => m.id)).toEqual(['m1', 'm-audio']);
    t.sair();
  });

  it('sem fetch em voo, o UPDATE é só patch (sem refetch extra)', async () => {
    const org = novaOrg();
    const t = montar(org, () => mapMensagens([linha('enviada') as unknown as DbMsg]));
    t.velho.resolve(mapMensagens([linha('enviada') as unknown as DbMsg]));
    await new Promise((r) => setTimeout(r, 0));
    expect(t.n).toBe(1);
    aplicarEventoNoHistorico(t.qc, org, 'UPDATE', linha('entregue'), null);
    await new Promise((r) => setTimeout(r, 0));
    expect(t.n).toBe(1);
    expect(t.qc.getQueryData<WaMessage[]>(t.k)![0].status).toBe('entregue');
    t.sair();
  });
});
