import { describe, expect, it } from 'vitest';
import type { WaContact, WaMessage } from '@/data/whatsappDemo';
import {
  aplicarEnvioOtimista, aplicarFalha, aplicarRetry, bolhaCoberta, canalAutomatico, hidratarHistorico,
  marcarIdReal, mesclarPendentes, montarCorpoAssinado, novoCid, patchBolha, reconciliarLista,
  removerMensagemLocal, selecaoValida,
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
    const atuais = [conv({ id: 'a' }), conv({ id: 'b' })];
    const live = [conv({ id: 'a', msgs: [msg({ id: 'm3' })] }), conv({ id: 'b', msgs: [msg({ id: 'x' })] })];
    const out = reconciliarLista(atuais, live, 'a', hist);
    expect(out.find((c) => c.id === 'a')!.msgs).toBe(hist);
    expect(out.find((c) => c.id === 'b')!.msgs).toEqual([msg({ id: 'x' })]);
  });
  it('sem histórico carregado (ou sem conversa aberta) substitui tudo cru', () => {
    const live = [conv({ id: 'a', msgs: [msg({ id: 'm3' })] })];
    expect(reconciliarLista([], live, 'a', undefined)[0]).toBe(live[0]);
    expect(reconciliarLista([], live, 'a', [])[0]).toBe(live[0]);
    expect(reconciliarLista([], live, null, [msg({})])[0]).toBe(live[0]);
  });
  it('bolha PENDENTE não coberta sobrevive à reconciliação — e o card local (preview/posição) fica com ela', () => {
    const pend = msg({ cid: 'tmp_x', status: 'pendente', text: 'oi', tsISO: '2026-08-24T12:00:00.000Z' });
    const atuais = [conv({ id: 'a', msgs: [pend], last: 'oi', time: '12:00', lastAtMs: 111, aguardando: false })];
    // refetch VELHO em voo: lista sem a mensagem nova e com o card antigo
    const live = [conv({ id: 'a', msgs: [msg({ id: 'antiga', tsISO: '2026-08-24T11:00:00.000Z' })], last: 'antiga', time: '11:00', lastAtMs: 55, aguardando: true })];
    const out = reconciliarLista(atuais, live, null, undefined);
    expect(out[0].msgs.map((m) => m.cid ?? m.id)).toEqual(['antiga', 'tmp_x']);
    expect(out[0]).toMatchObject({ last: 'oi', time: '12:00', lastAtMs: 111, aguardando: false });
  });
  it('bolha pendente COBERTA (linha real no payload) morre — jamais duplica', () => {
    const pend = msg({ cid: 'tmp_x', status: 'pendente', text: 'oi', tsISO: '2026-08-24T12:00:00.000Z' });
    const atuais = [conv({ id: 'a', msgs: [pend] })];
    const live = [conv({ id: 'a', msgs: [msg({ id: 'real-1', text: 'oi', tipo: 'texto', tsISO: '2026-08-24T12:00:01.000Z' })], last: 'oi' })];
    const out = reconciliarLista(atuais, live, null, undefined);
    expect(out[0].msgs.map((m) => m.id)).toEqual(['real-1']);
  });
  it('hidratação preserva bolha pendente não coberta e mata a coberta', () => {
    const cur = [conv({
      id: 'a',
      msgs: [
        msg({ cid: 'tmp_v', status: 'pendente', text: 'primeira', tsISO: '2026-08-24T12:00:00.000Z' }),
        msg({ cid: 'tmp_x', status: 'pendente', text: 'segunda', tsISO: '2026-08-24T12:00:05.000Z' }),
      ],
    })];
    const hist = [msg({ id: 'real-1', text: 'primeira', tipo: 'texto', status: 'enviada', tsISO: '2026-08-24T12:00:01.000Z' })];
    const out = hidratarHistorico(cur, 'a', hist);
    expect(out[0].msgs.map((m) => m.cid ?? m.id)).toEqual(['real-1', 'tmp_x']);
  });
  it('bolha FALHOU local não é preservada (some no refetch, como sempre)', () => {
    const cur = [conv({ id: 'a', msgs: [msg({ cid: 'tmp_x', status: 'falhou', text: 'oi' })] })];
    const hist = [msg({ id: 'real-1' })];
    expect(hidratarHistorico(cur, 'a', hist)[0].msgs).toBe(hist);
  });
  it('seleção válida: mantém o id existente; senão cai para a primeira', () => {
    const lista = [conv({ id: 'a' }), conv({ id: 'b' })];
    expect(selecaoValida('b', lista)).toBe('b');
    expect(selecaoValida('sumiu', lista)).toBe('a');
    expect(selecaoValida('x', [])).toBe('');
  });
});

describe('máquina do inbox — cobertura da bolha otimista', () => {
  const pendTexto = msg({ cid: 'tmp_1', status: 'pendente', text: '*Ana:*\noi', tsISO: '2026-08-24T12:00:00.000Z' });
  it('cobre por idReal, independente de conteúdo e janela', () => {
    expect(bolhaCoberta([msg({ id: 'r1', text: 'outro' })], { ...pendTexto, idReal: 'r1' })).toBe(true);
    expect(bolhaCoberta([msg({ id: 'r2' })], { ...pendTexto, idReal: 'r1' })).toBe(false);
  });
  it('cobre por anexoPath (único por upload) — mídia nunca casa por texto', () => {
    const pendMidia = msg({ cid: 'tmp_2', status: 'pendente', tipo: 'audio', anexoPath: 'org/wa-midia/u1-a.ogg', tsISO: '2026-08-24T12:00:00.000Z' });
    expect(bolhaCoberta([msg({ id: 'r1', tipo: 'audio', anexoPath: 'org/wa-midia/u1-a.ogg', tsISO: '2026-08-24T12:00:02.000Z' })], pendMidia)).toBe(true);
    expect(bolhaCoberta([msg({ id: 'r1', tipo: 'audio', anexoPath: 'org/wa-midia/OUTRO.ogg', tsISO: '2026-08-24T12:00:02.000Z' })], pendMidia)).toBe(false);
  });
  it('cobre por texto idêntico DENTRO da janela; fora dela não (texto repetido ontem não mata a bolha)', () => {
    expect(bolhaCoberta([msg({ id: 'r1', tipo: 'texto', text: '*Ana:*\noi', tsISO: '2026-08-24T12:00:30.000Z' })], pendTexto)).toBe(true);
    expect(bolhaCoberta([msg({ id: 'r1', tipo: 'texto', text: '*Ana:*\noi', tsISO: '2026-08-24T11:00:00.000Z' })], pendTexto)).toBe(false);
    expect(bolhaCoberta([msg({ id: 'r1', tipo: 'texto', text: 'diferente', tsISO: '2026-08-24T12:00:30.000Z' })], pendTexto)).toBe(false);
  });
  it('mensagem de ENTRADA nunca cobre; cartão de contato casa pelo telefone', () => {
    expect(bolhaCoberta([msg({ id: 'r1', dir: 'in', text: '*Ana:*\noi', tsISO: '2026-08-24T12:00:10.000Z' })], pendTexto)).toBe(false);
    const pendCt = msg({ cid: 'tmp_3', status: 'pendente', text: '📇 Zé · +5551999', contato: { nome: 'Zé', telefone: '5551999' }, tsISO: '2026-08-24T12:00:00.000Z' });
    expect(bolhaCoberta([msg({ id: 'r1', contato: { nome: 'Zé', telefone: '5551999' }, tsISO: '2026-08-24T12:00:05.000Z' })], pendCt)).toBe(true);
  });
  it('mesclarPendentes: pendentes não cobertas vão ao FIM; nada pendente devolve o próprio array', () => {
    const serv = [msg({ id: 'r1' })];
    expect(mesclarPendentes(serv, [msg({ id: 'r1' })])).toBe(serv);
    const pend = msg({ cid: 'tmp_9', status: 'pendente', text: 'x', tsISO: '2026-08-24T12:00:00.000Z' });
    expect(mesclarPendentes(serv, [pend]).map((m) => m.cid ?? m.id)).toEqual(['r1', 'tmp_9']);
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
  it('envio otimista: append da bolha + card completo (last/time/posição/sai de aguardando), só na conversa alvo', () => {
    const cur = [conv({ id: 'a', msgs: [msg({ id: 'm1' })], last: 'antes', time: '09:00', lastAtMs: 1, aguardando: true, aguardandoDesde: '2026-08-24T09:00:00.000Z' }), conv({ id: 'b' })];
    const bolha = msg({ cid: 'tmp_1', status: 'pendente', text: 'oi', time: '12:00', tsISO: '2026-08-24T12:00:00.000Z' });
    const out = aplicarEnvioOtimista(cur, 'a', bolha, 'oi');
    expect(out[0].msgs).toHaveLength(2);
    expect(out[0]).toMatchObject({ last: 'oi', time: '12:00', lastAtMs: new Date('2026-08-24T12:00:00.000Z').getTime(), aguardando: false, aguardandoDesde: null });
    expect(out[1].msgs).toHaveLength(0);
    expect(out[1].aguardando).toBeUndefined();
  });
  it('marcarIdReal grava o id na bolha certa; patchBolha aplica patch raso por cid', () => {
    const cur = [conv({ id: 'a', msgs: [msg({ cid: 'tmp_1', status: 'pendente' }), msg({ id: 'm2' })] })];
    const out = marcarIdReal(cur, 'a', 'tmp_1', 'real-9');
    expect(out[0].msgs[0].idReal).toBe('real-9');
    expect(marcarIdReal(cur, 'a', 'tmp_1', null)).toBe(cur);
    const out2 = patchBolha(cur, 'a', 'tmp_1', { anexoPath: 'p/x.ogg' });
    expect(out2[0].msgs[0].anexoPath).toBe('p/x.ogg');
    expect(out2[0].msgs[1].anexoPath).toBeUndefined();
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
