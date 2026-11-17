import { describe, expect, it } from 'vitest';
import { atalhosDoTipo, estadoPrazo, textoPrazo, vencidasDe, type Marca } from './dados';
import { ordemDasVencidas, PARA_SEMPRE, type AvisoVencida } from './avisosTexto';
import { leadDeLinha, type LinhaFila } from './lead';

const H = 3_600_000;
const agora = Date.parse('2026-11-16T13:00:00-03:00');
const m = (dt: number): Marca => ({ id: 'x', tipo: 'falta', em: agora - H, venceEm: agora + dt });

describe('prazo das marcações (dono 16/11: 36 h para atualizar)', () => {
  it('estado e texto', () => {
    expect(estadoPrazo({}, agora)).toBeNull();
    expect(textoPrazo({}, agora)).toBeNull();
    expect(estadoPrazo(m(36 * H), agora)).toBe('ok');
    expect(textoPrazo(m(36 * H), agora)).toBe('vence em 36h');
    expect(estadoPrazo(m(6 * H), agora)).toBe('perto');
    expect(estadoPrazo(m(6 * H + 1), agora)).toBe('ok');
    expect(textoPrazo(m(59.6 * 60_000), agora)).toBe('vence em 1h');
    expect(textoPrazo(m(59.4 * 60_000), agora)).toBe('vence em 1h');
    expect(textoPrazo(m(58.5 * 60_000), agora)).toBe('vence em 59 min');
    expect(textoPrazo(m(20_000), agora)).toBe('vence em 1 min');
    expect(textoPrazo(m(-20_000), agora)).toBe('venceu agora');
    expect(estadoPrazo(m(0), agora)).toBe('vencida');
    expect(textoPrazo(m(0), agora)).toBe('venceu agora');
    expect(textoPrazo(m(-3 * H), agora)).toBe('venceu há 3h');
    expect(textoPrazo(m(-50 * H), agora)).toBe('venceu há 2 dias');
    expect(textoPrazo(m(47.5 * H), agora)).toBe('vence em 47h');
    expect(textoPrazo(m(49 * H), agora)).toBe('vence em 2 dias');
    expect(vencidasDe([m(-1), m(5), m(-H)], agora)).toBe(2);
  });
  it('lê vence_em e ult da fila', () => {
    const r = {
      contato_id: 'c', conversa_id: null, oportunidade_id: null, dono_id: null, nome: 'A', telefone: '5551999999999', categoria: 'quente',
      aguardando: false, coluna: null, campanha: null, entrou_em: null, ult_cliente_em: null, ult_nossa_em: null, ult_doc_em: null,
      doc_pessoal: true, comprovante: true, falta: null, assinado_em: null, ult_cliente_texto: null,
      marcacoes: [
        { id: 'a', tipo: 'falta', texto: 'x', vezes: 1, em: '2026-11-16T10:00:00-03:00', vence_em: '2026-11-17T22:00:00-03:00', ult: { texto: 'Cobrei', por: null, em: '2026-11-16T10:00:00-03:00' } },
        { id: 'b', tipo: 'mandar_doc', texto: null, vezes: 1, em: '2026-11-16T10:00:00-03:00' },
        { id: 'c', tipo: 'nao_atendeu', texto: null, vezes: 2, em: '2026-11-16T10:00:00-03:00', vence_em: null, ult: null },
      ],
    } as unknown as LinhaFila;
    const l = leadDeLinha(r, 0);
    const a = l.marcas.find((x) => x.id === 'a')!;
    expect(a.venceEm).toBe(Date.parse('2026-11-17T22:00:00-03:00'));
    expect(a.ult).toEqual({ texto: 'Cobrei', por: undefined, porNome: undefined, em: Date.parse('2026-11-16T10:00:00-03:00') });
    expect(l.marcas.find((x) => x.id === 'b')!.venceEm).toBeUndefined();
    expect(l.marcas.find((x) => x.id === 'c')!.venceEm).toBeUndefined();
  });
});

describe('aviso da marcação vencida no meio da tela (dono 16/11: "obrigando a atualizar")', () => {
  it('mostra o cliente, a marcação e as saídas — e não tem Ok', async () => {
    const { renderToString } = await import('react-dom/server');
    const { createElement } = await import('react');
    const { CartaoMarcacaoVencida, anuncioDaVencida } = await import('../../components/CartaoMarcacaoVencida');
    const { curtoDaVencida } = await import('./avisosTexto');
    const a = { id: 'a', marcacaoId: 'm1', contatoId: 'c1', conversaId: 'v1', nome: 'Ana Lima', tipo: 'falta' as const,
      texto: 'comprovante', venceEm: Date.now() - 2 * H, criadoEm: Date.now() - 2 * H };
    const fn = async () => {};
    /* o React separa os pedaços de texto com <!-- --> no HTML do servidor */
    const limpo = (h: string) => h.replace(/<!-- -->/g, '');
    const html = limpo(renderToString(createElement(CartaoMarcacaoVencida, { aviso: a, total: 3, aoSalvar: fn, aoTirar: fn, aoAbrirConversa: () => {} })));
    for (const t of ['Marcação vencida', 'Ana Lima', 'Falta: comprovante', '1 de 3', 'venceu há 2h', 'O que foi feito?', 'Cobrei de novo',
      'Salvar', 'Já resolvi: tirar a marcação', 'Abrir a conversa', 'o prazo recomeça: mais 36 horas']) expect(html).toContain(t);
    expect(html).not.toMatch(/>Ok</);
    const sem = limpo(renderToString(createElement(CartaoMarcacaoVencida, { aviso: { ...a, conversaId: undefined }, total: 1, aoSalvar: fn, aoTirar: fn })));
    expect(sem).not.toContain('Abrir a conversa');
    expect(sem).not.toContain('1 de');
    expect(curtoDaVencida({ tipo: 'nao_atendeu', vezes: 2 })).toBe('Ligar de novo (2x)');
    expect(anuncioDaVencida(a, 3)).toBe('Marcação vencida, 1 de 3: Ana Lima, Falta: comprovante. '
      + 'Passou de 36 h sem atualizar. Para continuar, diga o que foi feito ou tire a marcação se já resolveu.');
    expect(anuncioDaVencida(undefined, 0)).toBe('');
  });

  it('os atalhos servem para a marcação; na ligação, "Liguei, não atendeu" aparece (é o +1) e os de documento não', async () => {
    expect(atalhosDoTipo('nao_atendeu')).toEqual(['Liguei, não atendeu', 'Mandei mensagem']);
    expect(atalhosDoTipo('falta')).toEqual(['Cobrei de novo', 'Liguei, não atendeu', 'Mandei mensagem', 'Cliente disse que vai mandar']);
    const { renderToString } = await import('react-dom/server');
    const { createElement } = await import('react');
    const { CartaoMarcacaoVencida } = await import('../../components/CartaoMarcacaoVencida');
    const fn = async () => {};
    const lig = { id: 'l', marcacaoId: 'm2', contatoId: 'c2', nome: 'Bruno', tipo: 'nao_atendeu' as const, vezes: 2,
      venceEm: Date.now() - H, criadoEm: Date.now() - H };
    const html = renderToString(createElement(CartaoMarcacaoVencida, { aviso: lig, total: 1, aoSalvar: fn, aoTirar: fn, aoVerNaFila: () => {}, rascunho: 'liguei às 10h' }))
      .replace(/<!-- -->/g, '');
    for (const t of ['Ligar de novo (2x)', 'Liguei, não atendeu', 'Mandei mensagem', 'Ver na fila', 'liguei às 10h']) expect(html).toContain(t);
    expect(html).not.toContain('Cobrei de novo');
    expect(html).not.toContain('Abrir a conversa');
  });

  it('o histórico: quando foi marcada e a última atualização (o nome só quando foi outra pessoa)', async () => {
    const { historicoDaVencida } = await import('../../components/CartaoMarcacaoVencida');
    const base = { id: 'a', marcacaoId: 'm', contatoId: 'c', nome: 'Ana', tipo: 'falta' as const, venceEm: agora, criadoEm: agora };
    expect(historicoDaVencida({ ...base, marcadaEm: agora - 3 * 24 * H }, agora)).toBe('Marcada há 3 dias');
    const ult = { texto: 'Cobrei de novo', por: 'u-murillo', porNome: 'Murillo Santos', em: agora - 37 * H };
    expect(historicoDaVencida({ ...base, marcadaEm: agora - 3 * 24 * H, ult }, agora, 'u-ana'))
      .toBe('Marcada há 3 dias · última atualização há 1 dia (Murillo): “Cobrei de novo”');
    expect(historicoDaVencida({ ...base, ult: { ...ult, por: 'u-ana' } }, agora, 'u-ana')).toBe('Última atualização há 1 dia: “Cobrei de novo”');
    expect(historicoDaVencida(base, agora)).toBe('');
  });
});

describe('a ordem e o que já foi resolvido (dono 16/11)', () => {
  const av = (id: string, contatoId: string, h: number, marcacaoId = id): AvisoVencida =>
    ({ id, marcacaoId, contatoId, nome: contatoId, tipo: 'falta', venceEm: agora - h * H, criadoEm: agora });
  it('os do mesmo cliente juntos; o cliente que venceu primeiro na frente', () => {
    const lista = [av('a1', 'A', 1), av('b1', 'B', 5), av('a2', 'A', 9), av('c1', 'C', 3)];
    expect(ordemDasVencidas(lista).map((x) => x.id)).toEqual(['a2', 'a1', 'b1', 'c1']);
  });
  it('o resolvido sai na hora; um vencimento novo da mesma marcação continua valendo', async () => {
    const { semAsResolvidas } = await import('./avisosMarcacao');
    const velho = av('v', 'A', 2, 'mk');
    const novo = { ...av('n', 'A', 0, 'mk'), venceEm: agora + 36 * H };
    const outro = av('o', 'B', 1);
    expect(semAsResolvidas([velho, outro], new Map([['mk', velho.venceEm]])).map((x) => x.id)).toEqual(['o']);
    expect(semAsResolvidas([novo, outro], new Map([['mk', velho.venceEm]])).map((x) => x.id)).toEqual(['o', 'n']);
    expect(semAsResolvidas([velho, novo], new Map([['mk', PARA_SEMPRE]]))).toEqual([]);
    /* a lista vazia é sempre a mesma (sem laço de renders) */
    expect(semAsResolvidas([velho], new Map([['mk', PARA_SEMPRE]]))).toBe(semAsResolvidas([], new Map()));
  });
  it('o "até onde" nunca passa da hora da ação: o aviso do vencimento SEGUINTE nunca é escondido', async () => {
    const { limitar, semAsResolvidas } = await import('./avisosMarcacao');
    /* duas ações em menos de 1 min: a fila mandava o vencimento de 30 s antes (ainda no futuro) */
    const v0 = agora + 36 * H;
    const ate = limitar(v0, agora + 30_000);
    expect(ate).toBeLessThan(v0);
    const seguinte = { ...av('s', 'A', 0, 'mk'), venceEm: v0 + 30_000 };
    expect(semAsResolvidas([seguinte], new Map([['mk', ate]])).map((x) => x.id)).toEqual(['s']);
    /* o vencido de verdade (no passado) continua saindo; o "tirada" continua para sempre */
    expect(limitar(agora - H, agora)).toBe(agora - H);
    expect(limitar(PARA_SEMPRE, agora)).toBe(PARA_SEMPRE);
  });
  it('com o relógio do computador atrasado, o aviso resolvido sai mesmo assim (o teto é o vencimento que o banco mostrou)', async () => {
    const { limitar, semAsResolvidas } = await import('./avisosMarcacao');
    /* aviso vencido há 6 min na hora do BANCO; o computador está 1 h atrasado */
    const venceu = agora - 6 * 60_000;
    const pc = agora - H;
    const ate = limitar(venceu, pc, venceu);
    expect(ate).toBe(venceu);
    expect(semAsResolvidas([{ ...av('r', 'A', 0, 'mk'), venceEm: venceu }], new Map([['mk', ate]]))).toEqual([]);
    /* sem o que o banco mostrou, o teto seria a hora do computador + 30 min e o aviso voltaria */
    expect(limitar(venceu, pc)).toBeLessThan(venceu);
  });
  it('um pedido da fila em andamento segura os avisos daquela marcação até a resposta (e nunca para sempre)', async () => {
    const { semAsResolvidas } = await import('./avisosMarcacao');
    const a = av('a', 'A', 1, 'mk');
    const b = av('b', 'B', 2, 'mk2');
    expect(semAsResolvidas([a, b], new Map(), new Map([['mk', agora + 5_000]]), agora).map((x) => x.id)).toEqual(['b']);
    /* passou o prazo da espera (a resposta se perdeu): volta */
    expect(semAsResolvidas([a, b], new Map(), new Map([['mk', agora - 1]]), agora).map((x) => x.id)).toEqual(['b', 'a']);
  });
  it('dois pedidos na mesma marcação: a resposta do primeiro não solta a espera do segundo', async () => {
    const { contarPedidos } = await import('./avisosMarcacao');
    const espera = new Map<string, number>();
    const pedidos = new Map<string, number>();
    contarPedidos(espera, pedidos, ['mk'], false, agora);        /* +1 */
    contarPedidos(espera, pedidos, ['mk'], false, agora + 100);  /* × logo depois */
    contarPedidos(espera, pedidos, ['mk'], true, agora + 1_000); /* o +1 falhou */
    expect(espera.get('mk')! > agora + 1_000).toBe(true);
    contarPedidos(espera, pedidos, ['mk'], true, agora + 4_000); /* o × respondeu */
    expect(espera.has('mk')).toBe(false);
    /* uma espera vencida (resposta perdida) não deixa contagem velha: o próximo pedido conta do zero */
    contarPedidos(espera, pedidos, ['mk'], false, agora);
    contarPedidos(espera, pedidos, ['mk'], false, agora + 60_000);
    contarPedidos(espera, pedidos, ['mk'], true, agora + 61_000);
    expect(espera.has('mk')).toBe(false);
  });
});

describe('demonstração: o aviso e a fila são a mesma loja (dono: "demo é o contrato")', () => {
  it('só as vencidas de quem está no "Ver como"; atualizar na loja tira o aviso', async () => {
    const { vencidasDaDemo } = await import('./avisosMarcacao');
    const { lerFilaDemo, mexerFilaDemo } = await import('./filaDemo');
    const { comMarcaAtualizada } = await import('./fonte');
    const leads = lerFilaDemo();
    const de = (eu: string) => vencidasDaDemo(lerFilaDemo(), eu, {}, Date.now());
    const doMatheus = de('matheus');
    expect(doMatheus.length).toBeGreaterThan(0);
    for (const a of doMatheus) expect(leads.find((l) => l.id === a.contatoId)?.atendente).toBe('matheus');
    expect(de('juliana').some((a) => doMatheus.some((x) => x.id === a.id))).toBe(false);
    /* o repasse muda quem recebe */
    const c = doMatheus[0].contatoId;
    expect(vencidasDaDemo(lerFilaDemo(), 'juliana', { [c]: 'juliana' }, Date.now()).some((a) => a.contatoId === c)).toBe(true);
    const alvo = doMatheus[0];
    mexerFilaDemo((ls) => ls.map((l) => (l.id === alvo.contatoId ? comMarcaAtualizada(l, alvo.marcacaoId, 'Cobrei de novo') : l)));
    expect(de('matheus').some((a) => a.marcacaoId === alvo.marcacaoId)).toBe(false);
  });
});
