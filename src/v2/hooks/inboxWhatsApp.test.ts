import { describe, expect, it } from 'vitest';
import type { WaContact, WaMessage } from '@/data/whatsappDemo';
import { mapConversa, type DbConv, type DbMsg } from '@/data/whatsapp';
import {
  aplicarEnvioOtimista, aplicarFalha, aplicarRetry, bolhaCoberta, canalAutomatico, conversaAtual, deepLinkDeveSelecionar, hidratarHistorico,
  assinaturaAtendente, idExtDaResposta, marcarIdReal, mesclarPendentes, montarCorpoAssinado, novoCid, patchBolha, reconciliarLista,
  removerMensagemLocal, selecaoDescasada, selecaoValida,
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
  it('carimbo obrigatório da casa: Nome – MARCA (sem marca, só o nome; sem nome, vazio)', () => {
    expect(assinaturaAtendente('Matheus', 'Atendimento CAF')).toBe('Matheus – Atendimento CAF');
    expect(assinaturaAtendente('Matheus', null)).toBe('Matheus');
    expect(assinaturaAtendente('  Matheus  ', ' Atendimento CAF ')).toBe('Matheus – Atendimento CAF');
    expect(assinaturaAtendente('', 'Atendimento CAF')).toBe('');
    expect(assinaturaAtendente(undefined, 'Atendimento CAF')).toBe('');
    // ponta a ponta com a bolha otimista: mesmo corpo que o backend envia/grava
    expect(montarCorpoAssinado('Olá, boa tarde!', assinaturaAtendente('Matheus', 'Atendimento CAF')))
      .toBe('*Matheus – Atendimento CAF:*\nOlá, boa tarde!');
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

/* Lista enxuta (real+ult, 20/10): fora da conversa aberta a lista traz no máximo 2 linhas, então
   uma bolha otimista que não seja a última nunca é "coberta" pelo payload. Sem tratamento, o card
   ficava congelado no estado local e a RESPOSTA DO CLIENTE não aparecia (nem 'aguardando'). */
describe('máquina do inbox — lista enxuta × bolhas otimistas fora da conversa aberta', () => {
  const T = Date.parse('2026-10-20T15:00:00.000Z');
  const isoS = (s: number) => new Date(T + s * 1000).toISOString();
  const db = (id: string, s: number, m: Partial<DbMsg> = {}): DbMsg => {
    const direcao = m.direcao ?? 'saida';
    return {
      id, direcao, conteudo: m.conteudo ?? id, tipo: m.tipo ?? 'texto',
      enviada_em: isoS(s), recebida_em: direcao === 'entrada' ? isoS(s) : null, criado_em: isoS(s),
      origem: null, status: direcao === 'entrada' ? 'recebida' : 'enviada', erro_envio: null,
      id_externo: null, respondida_a_id: null, metadados: {},
    };
  };
  const dbConv = (id: string, ultimaEm: string, emb: Partial<DbConv>): DbConv => ({
    id, status: 'aberta', status_id: null, nao_lidas: 1, ultima_interacao_em: ultimaEm, criado_em: isoS(-9999),
    precisa_humano: false, precisa_humano_motivo: null, precisa_humano_em: null, atendente_id: null, etiquetas: null,
    ultimo_canal_id: null, ultimo_numero: null, ultimo_provider: null, ultima_msg_canal_em: null,
    arquivada_em: null, fixada_em: null, silenciada_ate: null,
    contatos: { id: 'k-' + id, nome: 'Maria', telefone: '5551999999999', email: null, etiquetas: null, origem: null, observacoes: null, responsavel_id: null, contato_identidades: [{ tipo: 'whatsapp' }] },
    canais: { id: 'ch1', nome_interno: 'ANDRIUS' },
    ...emb,
  });
  /** Estado local depois de disparar um script de N etapas em A (bolhas + marcarIdReal), já fora de A. */
  function scriptEmA(n: number, comIdReal = true): WaContact[] {
    let cur: WaContact[] = [mapConversa(dbConv('A', isoS(0), { real: [db('cli0', 0, { direcao: 'entrada', conteudo: 'oi' })], ult: [db('cli0', 0, { direcao: 'entrada', conteudo: 'oi' })] })), conv({ id: 'B' })];
    for (let i = 1; i <= n; i++) {
      const bolha = msg({ cid: `tmp_${i}`, status: 'pendente', text: `etapa${i}`, time: '15:00', tsISO: isoS(i) });
      cur = aplicarEnvioOtimista(cur, 'A', bolha, `etapa${i}`);
      if (comIdReal) cur = marcarIdReal(cur, 'A', `tmp_${i}`, `real-${i}`);
    }
    return cur;
  }
  const resposta = db('cli1', 60, { direcao: 'entrada', conteudo: 'quero sim' });

  it('script de 3 etapas em A (com idReal), atendente em B, cliente responde: o card mostra a RESPOSTA e volta a aguardar', () => {
    const cur = scriptEmA(3);
    const live = [mapConversa(dbConv('A', isoS(60), { real: [resposta], ult: [resposta] })), conv({ id: 'B' })];
    const a = reconciliarLista(cur, live, 'B', [msg({ id: 'b1' })]).find((c) => c.id === 'A')!;
    expect(a).toMatchObject({ last: 'quero sim', aguardando: true, aguardandoDesde: isoS(60), lastAtMs: T + 60_000 });
    // a linha das etapas já está no banco (idReal): nada fica preso como "pendente" no estado local
    expect(a.msgs.filter((m) => m.status === 'pendente')).toHaveLength(0);
    // e o mesmo resultado do formato antigo (10 últimas), onde as etapas vinham por id
    const dez = [resposta, db('real-3', 3), db('real-2', 2), db('real-1', 1), db('cli0', 0, { direcao: 'entrada', conteudo: 'oi' })];
    const aAntigo = reconciliarLista(cur, [mapConversa(dbConv('A', isoS(60), { mensagens: dez })), conv({ id: 'B' })], 'B', [msg({ id: 'b1' })]).find((c) => c.id === 'A')!;
    expect({ last: a.last, aguardando: a.aguardando, aguardandoDesde: a.aguardandoDesde, lastAtMs: a.lastAtMs })
      .toEqual({ last: aAntigo.last, aguardando: aAntigo.aguardando, aguardandoDesde: aAntigo.aguardandoDesde, lastAtMs: aAntigo.lastAtMs });
  });
  it('recargas seguintes e o patch do realtime continuam refletindo o cliente (não congela)', () => {
    let cur = scriptEmA(2);
    const live1 = [mapConversa(dbConv('A', isoS(60), { real: [resposta], ult: [resposta] }))];
    cur = reconciliarLista(cur, live1, 'B', undefined);
    const resp2 = db('cli2', 90, { direcao: 'entrada', conteudo: 'pode ligar?' });
    const live2 = [mapConversa(dbConv('A', isoS(90), { real: [resp2], ult: [resp2] }))];
    expect(reconciliarLista(cur, live2, 'B', undefined)[0]).toMatchObject({ last: 'pode ligar?', aguardando: true, lastAtMs: T + 90_000 });
  });
  it('envio ainda SEM idReal (em voo) e cliente responde: servidor à frente manda no card; a bolha não some', () => {
    const cur = scriptEmA(1, false);
    const live = [mapConversa(dbConv('A', isoS(60), { real: [resposta], ult: [resposta] }))];
    const a = reconciliarLista(cur, live, 'B', undefined)[0];
    expect(a).toMatchObject({ last: 'quero sim', aguardando: true, lastAtMs: T + 60_000 });
    expect(a.msgs.map((m) => m.cid ?? m.id)).toEqual(['cli1', 'tmp_1']);
  });
  it('refetch VELHO em voo (servidor atrás do envio) mantém o card local — com ou sem idReal', () => {
    for (const comId of [true, false]) {
      const cur = scriptEmA(2, comId);
      const velho = db('cli0', 0, { direcao: 'entrada', conteudo: 'oi' });
      const a = reconciliarLista(cur, [mapConversa(dbConv('A', isoS(0), { real: [velho], ult: [velho] }))], 'B', undefined)[0];
      expect(a).toMatchObject({ last: 'etapa2', aguardando: false, lastAtMs: T + 2_000 });
    }
  });
  it('conversa ABERTA: bolha com idReal ainda fora do histórico é preservada (a hidratação mata por id)', () => {
    const cur = scriptEmA(2);
    const hist = [msg({ id: 'cli0', dir: 'in', text: 'oi', tsISO: isoS(0) })];
    const live = [mapConversa(dbConv('A', isoS(2), { real: [db('real-2', 2)], ult: [db('real-2', 2)] }))];
    const a = reconciliarLista(cur, live, 'A', hist)[0];
    expect(a.msgs.map((m) => m.cid ?? m.id)).toEqual(['cli0', 'tmp_1', 'tmp_2']);
    const hidr = hidratarHistorico([a], 'A', [...hist, msg({ id: 'real-1', tsISO: isoS(1) }), msg({ id: 'real-2', tsISO: isoS(2) })]);
    expect(hidr[0].msgs.map((m) => m.cid ?? m.id)).toEqual(['cli0', 'real-1', 'real-2']);
  });
});

describe('seleção fora da lista (deep-link durante a busca-alvo dela)', () => {
  const lista = [conv({ id: 'Y', name: 'Outra', canalId: 'c-y', contatoId: 'k-y' }), conv({ id: 'Z' })];
  it('real: a conversa exibida NUNCA é a 1ª da lista enquanto a selecionada não chegou (envio iria para X com canal/travas de Y)', () => {
    expect(conversaAtual(lista, 'X', true)).toBeNull();           // antes: contacts[0] (Y)
    expect(conversaAtual(lista, 'Z', true)!.id).toBe('Z');
    expect(conversaAtual(lista, '', true)!.id).toBe('Y');          // sem seleção: como sempre
    expect(conversaAtual([], 'X', true)).toBeNull();
  });
  it('demo mantém o fallback da 1ª', () => {
    expect(conversaAtual(lista, 'X', false)!.id).toBe('Y');
  });
  it('envio recusado só quando a exibida não é a selecionada (no real)', () => {
    expect(selecaoDescasada(true, 'X', '')).toBe(true);
    expect(selecaoDescasada(true, 'X', 'Y')).toBe(true);
    expect(selecaoDescasada(true, 'X', 'X')).toBe(false);
    expect(selecaoDescasada(true, '', '')).toBe(false);
    expect(selecaoDescasada(false, 'X', 'Y')).toBe(false);
  });
  it('/m: deep-link seleciona UMA vez por conversa, mesmo ausente da lista (é o que dispara a busca-alvo)', () => {
    expect(deepLinkDeveSelecionar('X', null)).toBe(true);           // antes: só se X estivesse na lista (ou lista vazia)
    expect(deepLinkDeveSelecionar('X', 'X')).toBe(false);           // sem ping-pong
    expect(deepLinkDeveSelecionar('W', 'X')).toBe(true);
    expect(deepLinkDeveSelecionar(undefined, null)).toBe(false);
  });
});

describe('responder citando com a lista leve (sem id_externo na 1ª pintura)', () => {
  const hist: WaMessage[] = [
    { id: 'm1', dir: 'in', text: 'oi', time: '10:00', idExterno: 'wamid.AAA' },
    { id: 'm2', dir: 'out', text: 'olá', time: '10:01' },
  ];
  it('o idExt que veio na bolha vence', () => {
    expect(idExtDaResposta({ id: 'm1', idExt: 'wamid.BBB' }, hist)).toBe('wamid.BBB');
  });
  it('bolha da lista (sem idExt): sai do histórico já carregado', () => {
    expect(idExtDaResposta({ id: 'm1' }, hist)).toBe('wamid.AAA');
  });
  it('sem histórico, sem a mensagem nele ou sem id: undefined (vai sem citação, como antes)', () => {
    expect(idExtDaResposta({ id: 'm1' }, undefined)).toBeUndefined();
    expect(idExtDaResposta({ id: 'm2' }, hist)).toBeUndefined();
    expect(idExtDaResposta({ id: '' }, [{ id: '', dir: 'in', text: '', time: '', idExterno: 'x' }])).toBeUndefined();
  });
});
