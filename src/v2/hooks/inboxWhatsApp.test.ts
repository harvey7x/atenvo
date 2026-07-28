import { describe, expect, it } from 'vitest';
import type { WaContact, WaMessage } from '@/data/whatsappDemo';
import {
  aplicarEnvioOtimista, aplicarFalha, aplicarRetry, canalAutomatico, hidratarHistorico,
  montarCorpoAssinado, novoCid, reconciliarLista, removerMensagemLocal, selecaoValida,
} from './inboxWhatsApp';

/* Testes da máquina do inbox (funções puras extraídas de WhatsApp.tsx v1).
   Sem renderHook: o repositório não tem @testing-library/react — a parte
   com React fica coberta pela validação ao vivo (justificado no reporte). */

const msg = (m: Partial<WaMessage>): WaMessage => ({ dir: 'out', time: '10:00', ...m });
const conv = (c: Partial<WaContact> & { id: string }): WaContact => ({
  name: 'X', phone: '', chip: '', time: '', unread: 0, tabs: [], status: '', last: '', email: '',
  stage: '', resp: '', origin: '', tags: [], lastInter: '', notes: '', doc: null, msgs: [], ...c,
});

describe('máquina do inbox — reconciliação lista×histórico', () => {
  it('a lista substitui tudo, mas a conversa ABERTA recebe de volta o histórico completo', () => {
    const hist = [msg({ id: 'm1' }), msg({ id: 'm2' }), msg({ id: 'm3' })];
    const live = [conv({ id: 'a', msgs: [msg({ id: 'm3' })] }), conv({ id: 'b', msgs: [msg({ id: 'x' })] })];
    const out = reconciliarLista(live, 'a', hist);
    expect(out.find((c) => c.id === 'a')!.msgs).toBe(hist);
    expect(out.find((c) => c.id === 'b')!.msgs).toEqual([msg({ id: 'x' })]);
  });
  it('sem histórico carregado (ou sem conversa aberta) substitui tudo cru', () => {
    const live = [conv({ id: 'a', msgs: [msg({ id: 'm3' })] })];
    expect(reconciliarLista(live, 'a', undefined)).toBe(live);
    expect(reconciliarLista(live, 'a', [])).toBe(live);
    expect(reconciliarLista(live, null, [msg({})])).toBe(live);
  });
  it('hidratação substitui as msgs da conversa aberta por inteiro (bolha otimista morre por substituição)', () => {
    const cur = [conv({ id: 'a', msgs: [msg({ cid: 'tmp_x', status: 'pendente' })] })];
    const hist = [msg({ id: 'real-1', status: 'enviada' })];
    const out = hidratarHistorico(cur, 'a', hist);
    expect(out[0].msgs).toBe(hist);
    expect(out[0].msgs.some((m) => m.cid)).toBe(false);
  });
  it('seleção válida: mantém o id existente; senão cai para a primeira', () => {
    const lista = [conv({ id: 'a' }), conv({ id: 'b' })];
    expect(selecaoValida('b', lista)).toBe('b');
    expect(selecaoValida('sumiu', lista)).toBe('a');
    expect(selecaoValida('x', [])).toBe('');
  });
});

describe('máquina do inbox — ciclo otimista de envio', () => {
  it('cid tem o formato tmp_<ts36><rand> e é único por timestamp/aleatório', () => {
    const c1 = novoCid(1_753_000_000_000, 0.123456789);
    expect(c1.startsWith('tmp_')).toBe(true);
    expect(c1).toBe(novoCid(1_753_000_000_000, 0.123456789));
    expect(c1).not.toBe(novoCid(1_753_000_000_001, 0.123456789));
  });
  it('assinatura vira *Nome:*\\n<texto> só na bolha local', () => {
    expect(montarCorpoAssinado('oi', 'Juliana')).toBe('*Juliana:*\noi');
    expect(montarCorpoAssinado('oi', null)).toBe('oi');
    expect(montarCorpoAssinado('oi', '')).toBe('oi');
  });
  it('envio otimista: append da bolha + last, só na conversa alvo', () => {
    const cur = [conv({ id: 'a', msgs: [msg({ id: 'm1' })], last: 'antes' }), conv({ id: 'b' })];
    const bolha = msg({ cid: 'tmp_1', status: 'pendente', text: 'oi' });
    const out = aplicarEnvioOtimista(cur, 'a', bolha, 'oi');
    expect(out[0].msgs).toHaveLength(2);
    expect(out[0].last).toBe('oi');
    expect(out[1].msgs).toHaveLength(0);
  });
  it('marcarFalha: match por cid E status pendente — não sobrescreve bolha já reconciliada', () => {
    const cur = [conv({
      id: 'a',
      msgs: [msg({ cid: 'tmp_1', status: 'pendente' }), msg({ cid: 'tmp_2', status: 'enviada' })],
    })];
    const out = aplicarFalha(cur, 'a', 'tmp_1', 'erro X');
    expect(out[0].msgs[0]).toMatchObject({ status: 'falhou', erro: 'erro X' });
    expect(out[0].msgs[1].status).toBe('enviada');
    const out2 = aplicarFalha(cur, 'a', 'tmp_2', 'erro Y');
    expect(out2[0].msgs[1].status).toBe('enviada');
  });
  it('retry: a MESMA bolha (id real) volta a pendente e limpa o erro', () => {
    const cur = [conv({ id: 'a', msgs: [msg({ id: 'm9', status: 'falhou', erro: 'x' })] })];
    const out = aplicarRetry(cur, 'a', 'm9');
    expect(out[0].msgs[0]).toMatchObject({ status: 'pendente', erro: undefined });
    expect(out[0].msgs).toHaveLength(1);
  });
  it('remover falha: filtra a mensagem pelo id, só na conversa alvo', () => {
    const cur = [conv({ id: 'a', msgs: [msg({ id: 'm1' }), msg({ id: 'm2' })] })];
    const out = removerMensagemLocal(cur, 'a', 'm1');
    expect(out[0].msgs.map((m) => m.id)).toEqual(['m2']);
  });
});

describe('máquina do inbox — canal de resposta automático', () => {
  it('último canal recebido vence; senão canal de origem; senão vazio — sempre validado contra os canais reais', () => {
    expect(canalAutomatico('u1', 'o1', ['u1', 'o1'])).toBe('u1');
    expect(canalAutomatico('sumiu', 'o1', ['o1'])).toBe('o1');
    expect(canalAutomatico(null, 'o1', ['o1'])).toBe('o1');
    expect(canalAutomatico(null, null, ['o1'])).toBe('');
    expect(canalAutomatico('u1', 'o1', [])).toBe('');
  });
});
