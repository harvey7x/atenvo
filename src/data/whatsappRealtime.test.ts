import { describe, expect, it } from 'vitest';
import type { WaContact, WaMessage } from '@/data/whatsappDemo';
import {
  aplicarPatchComDesfazer, contarDivergencias, mesclarConversas, msgsDoCard, patchContatoNoCard, patchConversaRow,
  patchListaConversa, patchListaMensagem, removerDoHistorico, upsertHistorico,
} from './whatsappRealtime';

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

/* ---------- patches estendidos (realtime sem recarga completa) ---------- */

const T = (s: string) => `2026-10-20T${s}.000Z`;

describe('patchListaConversa: canal atual e último canal', () => {
  const canais = { canalPorId: (id: string) => (id === 'c-novo' ? { alias: 'LUIZA' } : null) };
  it('canal_id trocado e achado no cache: canalId/chip/canalAtual', () => {
    const cur = [conv({ id: 'a', canalId: 'c-velho', chip: 'ANDRIUS', canalAtual: 'ANDRIUS' })];
    const out = patchListaConversa(cur, { id: 'a', canal_id: 'c-novo' }, canais);
    expect(out[0]).toMatchObject({ canalId: 'c-novo', chip: 'LUIZA', canalAtual: 'LUIZA' });
  });
  it('canal não achado (removido/fora do cache): mantém o valor antigo (mesma referência)', () => {
    const cur = [conv({ id: 'a', canalId: 'c-velho', chip: 'ANDRIUS', canalAtual: 'ANDRIUS' })];
    const out = patchListaConversa(cur, { id: 'a', canal_id: 'c-sumido' }, canais);
    expect(out).toBe(cur);
  });
  it('ultimo_canal_* monta o ultimoCanal na forma do mapConversa ("Responder por" automático)', () => {
    const cur = [conv({ id: 'a', ultimoCanal: null })];
    const out = patchListaConversa(cur, { id: 'a', ultimo_canal_id: 'c-novo', ultimo_numero: '5551999', ultimo_provider: 'evolution', ultima_msg_canal_em: T('12:00:00') });
    expect(out[0].ultimoCanal).toEqual({ canalId: 'c-novo', alias: null, numero: '5551999', provider: 'evolution', em: T('12:00:00') });
    const vazio = patchListaConversa(out, { id: 'a', ultimo_canal_id: null, ultimo_numero: null, ultimo_provider: null, ultima_msg_canal_em: null });
    expect(vazio[0].ultimoCanal).toBeNull();
  });
  it('UPDATE que não muda nada visível (ultima_entrada_em, SLA…) devolve a MESMA lista', () => {
    const cur = [conv({ id: 'a', unread: 2, arquivada: false, fixada: false })];
    expect(patchListaConversa(cur, { id: 'a', nao_lidas: 2, arquivada_em: null, fixada_em: null })).toBe(cur);
    expect(patchConversaRow(cur[0], { id: 'a' })).toBe(cur[0]);
  });
});

describe('patchListaMensagem: mensagens do card, duração do áudio, ACK', () => {
  const base = () => [conv({ id: 'a', lastAtMs: new Date(T('10:00:00')).getTime(), aberta: true, msgs: [msg({ id: 'm1', dir: 'in', tipo: 'texto', text: 'oi', tsISO: T('10:00:00') })] })];
  it('a mensagem nova entra nas mensagens do card (formato real + ult) — ACK não duplica', () => {
    const nova = msg({ id: 'm2', dir: 'out', tipo: 'texto', text: 'resp', tsISO: T('10:05:00') });
    const out = patchListaMensagem(base(), 'a', nova, true);
    expect(out[0].msgs.map((m) => m.id)).toEqual(['m2']);   // m2 é a última real e a última de qualquer tipo
    const ack = patchListaMensagem(out, 'a', { ...nova, status: 'entregue' }, false);
    expect(ack[0].msgs.map((m) => m.id)).toEqual(['m2']);
    expect(ack[0].msgs[0].status).toBe('entregue');
  });
  it('msgsDoCard: a última real + a última de qualquer tipo, sem repetir, em ordem', () => {
    const real = msg({ id: 'r', tipo: 'texto', text: 'x', tsISO: T('10:00:00') });
    const nota = msg({ id: 'n', tipo: 'nota_interna', text: 'y', tsISO: T('10:01:00') });
    expect(msgsDoCard([real], nota).map((m) => m.id)).toEqual(['r', 'n']);
    const nova = msg({ id: 'z', tipo: 'texto', text: 'z', tsISO: T('10:02:00') });
    expect(msgsDoCard([real, nota], nova).map((m) => m.id)).toEqual(['z']);
  });
  it('áudio: o preview leva a duração e respeita ptt (Áudio × Mensagem de voz)', () => {
    const voz = msg({ id: 'au', dir: 'in', tipo: 'audio', text: '', tsISO: T('10:06:00') });
    expect(patchListaMensagem(base(), 'a', voz, true, { seconds: 12, ptt: true })[0].last).toBe('Mensagem de voz (0:12)');
    expect(patchListaMensagem(base(), 'a', voz, true, { seconds: 65, ptt: false })[0].last).toBe('Áudio (1:05)');
  });
  it('evento atrasado (mais velho que o card) devolve a MESMA lista', () => {
    const cur = base();
    const velha = msg({ id: 'mv', dir: 'in', tipo: 'texto', text: 'velha', tsISO: T('09:00:00') });
    expect(patchListaMensagem(cur, 'a', velha, true)).toBe(cur);
  });
});

describe('patch de contatos (nome, telefone, responsável)', () => {
  const row = (p: Record<string, unknown>) => ({ id: 'k', nome: 'Maria', telefone: '5551999990000', email: null, observacoes: null, origem: null, responsavel_id: null, ...p });
  it('aplica nome/telefone/e-mail/notas/origem/respId com os defaults do mapConversa', () => {
    const c = conv({ id: 'a', contatoId: 'k', name: 'Antigo', phone: '', semDestino: false });
    const n = patchContatoNoCard(c, row({ responsavel_id: 'u1', email: 'm@x.com', observacoes: 'vip', origem: 'Site' }))!;
    expect(n).toMatchObject({ name: 'Maria', phone: '5551999990000', respId: 'u1', email: 'm@x.com', notes: 'vip', origin: 'Site' });
    expect(patchContatoNoCard(c, row({}))!.origin).toBe('WhatsApp');
  });
  it('LID cru sem telefone e sem identidade PN nunca vira nome', () => {
    const c = conv({ id: 'a', contatoId: 'k', semDestino: true });
    expect(patchContatoNoCard(c, row({ nome: '123456789012345', telefone: null }))!.name).toBe('Identidade protegida');
  });
  it('payload sem algum campo → null (não patcha às cegas: vira busca-alvo)', () => {
    const c = conv({ id: 'a', contatoId: 'k' });
    expect(patchContatoNoCard(c, { id: 'k', nome: 'Maria' })).toBeNull();
  });
  it('nada visível mudou (cpf, canal_origem…) → o MESMO card', () => {
    const c = conv({ id: 'a', contatoId: 'k', name: 'Maria', phone: '5551999990000', email: '', notes: '', origin: 'WhatsApp', respId: null, semDestino: false });
    expect(patchContatoNoCard(c, row({}))).toBe(c);
  });
});

describe('mesclarConversas: upsert por id, nunca remove, preserva referência', () => {
  it('atualiza o que mudou, insere o novo no topo e não remove ninguém', () => {
    const a = conv({ id: 'a', unread: 1 }), b = conv({ id: 'b', unread: 0 });
    const out = mesclarConversas([a, b], [conv({ id: 'b', unread: 5 }), conv({ id: 'x', unread: 1 })]);
    expect(out.map((c) => c.id)).toEqual(['x', 'a', 'b']);
    expect(out[1]).toBe(a);
    expect(out[2].unread).toBe(5);
  });
  it('nada mudou → a MESMA lista (sem re-render)', () => {
    const lista = [conv({ id: 'a', unread: 1, msgs: [msg({ id: 'm', text: 'x' })] })];
    expect(mesclarConversas(lista, [conv({ id: 'a', unread: 1, msgs: [msg({ id: 'm', text: 'x' })] })])).toBe(lista);
    expect(mesclarConversas(lista, [])).toBe(lista);
  });
  it('lote vazio ou só com conversas ausentes nunca apaga as que existem', () => {
    const lista = [conv({ id: 'a' }), conv({ id: 'b' })];
    expect(mesclarConversas(lista, [conv({ id: 'c' })]).map((c) => c.id)).toEqual(['c', 'a', 'b']);
  });
});

describe('patch otimista com desfazer (marcar lida / arquivar / fixar)', () => {
  it('unread 0 e o desfazer devolve o valor anterior', () => {
    const lista = [conv({ id: 'a', unread: 4 }), conv({ id: 'b', unread: 1 })];
    const r = aplicarPatchComDesfazer(lista, 'a', { unread: 0 });
    expect(r.lista[0].unread).toBe(0);
    expect(r.lista[1]).toBe(lista[1]);
    expect(aplicarPatchComDesfazer(r.lista, 'a', r.desfazer!).lista[0].unread).toBe(4);
  });
  it('arquivada e fixada; conversa ausente não muda nada', () => {
    const lista = [conv({ id: 'a', arquivada: false, fixada: false })];
    const arq = aplicarPatchComDesfazer(lista, 'a', { arquivada: true });
    expect(arq.lista[0].arquivada).toBe(true);
    expect(aplicarPatchComDesfazer(arq.lista, 'a', arq.desfazer!).lista[0].arquivada).toBe(false);
    const fix = aplicarPatchComDesfazer(lista, 'a', { fixada: true });
    expect(fix.lista[0].fixada).toBe(true);
    expect(aplicarPatchComDesfazer(fix.lista, 'a', fix.desfazer!).lista[0].fixada).toBe(false);
    const fora = aplicarPatchComDesfazer(lista, 'zz', { unread: 0 });
    expect(fora.lista).toBe(lista);
    expect(fora.desfazer).toBeNull();
  });
});

describe('contarDivergencias (log [wa] reconciliação)', () => {
  it('conta campos divergentes, faltantes e sobrando; mesma referência não conta', () => {
    const a = conv({ id: 'a', unread: 1, respId: 'u1' });
    const cache = [a, conv({ id: 'b', etapa: 'X' }), conv({ id: 'velha' })];
    const carga = [a, conv({ id: 'b', etapa: 'Y' }), conv({ id: 'nova' })];
    const d = contarDivergencias(cache, carga);
    expect(d).toMatchObject({ faltam: 1, sobram: 1, campos: { etapa: 1 } });
    expect(d.total).toBe(3);
    expect(contarDivergencias(cache, cache).total).toBe(0);
  });
});
