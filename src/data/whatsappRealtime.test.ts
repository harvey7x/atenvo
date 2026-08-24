import { describe, expect, it } from 'vitest';
import type { WaContact, WaMessage } from '@/data/whatsappDemo';
import { patchListaConversa, patchListaMensagem, removerDoHistorico, upsertHistorico } from './whatsappRealtime';

/* Patches puros aplicados aos caches a partir do payload do Realtime —
   o atalho que faz a tela refletir a linha nova sem esperar refetch. */

const msg = (m: Partial<WaMessage>): WaMessage => ({ dir: 'out', time: '10:00', ...m });
const conv = (c: Partial<WaContact> & { id: string }): WaContact => ({
  name: 'X', phone: '', chip: '', time: '', unread: 0, tabs: [], status: '', last: '', email: '',
  stage: '', resp: '', origin: '', tags: [], lastInter: '', notes: '', doc: null, msgs: [], ...c,
});

describe('realtime → histórico (wa-msgs)', () => {
  it('INSERT entra na posição cronológica; UPDATE substitui por id (ACK ✓→✓✓ sem refetch)', () => {
    const hist = [
      msg({ id: 'a', tsISO: '2026-08-24T10:00:00.000Z' }),
      msg({ id: 'c', tsISO: '2026-08-24T12:00:00.000Z' }),
    ];
    const out = upsertHistorico(hist, msg({ id: 'b', tsISO: '2026-08-24T11:00:00.000Z' }));
    expect(out.map((m) => m.id)).toEqual(['a', 'b', 'c']);
    const out2 = upsertHistorico(out, msg({ id: 'b', status: 'entregue', tsISO: '2026-08-24T11:00:00.000Z' }));
    expect(out2.map((m) => m.id)).toEqual(['a', 'b', 'c']);
    expect(out2[1].status).toBe('entregue');
  });
  it('DELETE remove por id; id desconhecido devolve o mesmo array', () => {
    const hist = [msg({ id: 'a' }), msg({ id: 'b' })];
    expect(removerDoHistorico(hist, 'a').map((m) => m.id)).toEqual(['b']);
    expect(removerDoHistorico(hist, 'zz')).toBe(hist);
  });
});

describe('realtime → card da lista (wa-conversas)', () => {
  const base = () => [conv({ id: 'a', last: 'antes', time: '09:00', lastAtMs: 10, unread: 1, aberta: true, aguardando: false })];
  it('saída nova: preview/horário/posição e sai de aguardando; não-lidas intactas', () => {
    const out = patchListaMensagem(base(), 'a', msg({ dir: 'out', text: 'resp', tipo: 'texto', time: '12:00', tsISO: '2026-08-24T12:00:00.000Z' }), true);
    expect(out[0]).toMatchObject({ last: 'resp', time: '12:00', aguardando: false, aguardandoDesde: null, unread: 1 });
    expect(out[0].lastAtMs).toBe(new Date('2026-08-24T12:00:00.000Z').getTime());
  });
  it('entrada nova (INSERT): vira aguardando e soma não-lida; UPDATE não resoma', () => {
    const nova = msg({ dir: 'in', text: 'oi', tipo: 'texto', time: '12:00', tsISO: '2026-08-24T12:00:00.000Z' });
    const out = patchListaMensagem(base(), 'a', nova, true);
    expect(out[0]).toMatchObject({ unread: 2, aguardando: true, aguardandoDesde: '2026-08-24T12:00:00.000Z' });
    const out2 = patchListaMensagem(out, 'a', { ...nova, midiaPendente: false }, false);
    expect(out2[0].unread).toBe(2);
  });
  it('sistema/nota interna não mexem no card; evento atrasado não regride; conversa fora da lista é ignorada', () => {
    const cur = base();
    expect(patchListaMensagem(cur, 'a', msg({ tipo: 'sistema', text: 'x', tsISO: '2026-08-24T12:00:00.000Z' }), true)[0]).toBe(cur[0]);
    const atras = patchListaMensagem([conv({ id: 'a', lastAtMs: 9_999_999_999_999, last: 'novo' })], 'a', msg({ text: 'velho', tipo: 'texto', tsISO: '2026-08-24T12:00:00.000Z' }), true);
    expect(atras[0].last).toBe('novo');
    expect(patchListaMensagem(cur, 'nao-existe', msg({ text: 'x', tipo: 'texto' }), true)).toEqual(cur);
  });
  it('UPDATE de conversas: lida/arquivada/status refletem; encerrada derruba aguardando', () => {
    const cur = [conv({ id: 'a', unread: 3, aberta: true, aguardando: true, aguardandoDesde: 'x' })];
    const out = patchListaConversa(cur, { id: 'a', nao_lidas: 0, arquivada_em: null, status: 'resolvida' });
    expect(out[0]).toMatchObject({ unread: 0, arquivada: false, status: 'Resolvida', aberta: false, aguardando: false, aguardandoDesde: null });
  });
  it('UPDATE parcial não toca campos ausentes; ultima_interacao_em só avança', () => {
    const cur = [conv({ id: 'a', unread: 3, lastAtMs: new Date('2026-08-24T12:00:00.000Z').getTime(), time: '12:00' })];
    const out = patchListaConversa(cur, { id: 'a', ultima_interacao_em: '2026-08-24T11:00:00.000Z' });
    expect(out[0].time).toBe('12:00');
    expect(out[0].unread).toBe(3);
    const out2 = patchListaConversa(cur, { id: 'a', ultima_interacao_em: '2026-08-24T13:00:00.000Z' });
    expect(out2[0].lastAtMs).toBe(new Date('2026-08-24T13:00:00.000Z').getTime());
  });
});
