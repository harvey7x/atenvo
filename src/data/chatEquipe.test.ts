// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({ supabase: null, isSupabaseConfigured: false, isRevizaMode: true, isPrevia: true }));
vi.mock('@/context/OrgContext', () => ({ useOrg: () => ({ currentOrg: { id: 'o' } }) }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: null }) }));

const {
  agruparPorDia, contarNaoLidas, conversasNoTexto, demoChat, filtrarSalas, nomeDaSala, normalizarSalas, partesDoTexto,
  previaDoTexto, quandoNaLista, rotuloDia, situacaoDaMinhaUltima, totalNaoLidas, traduzErroChat, EU_DEMO,
} = await import('./chatEquipe');

const M = (id: string, autorId: string | null, criadoEm: string, extra: Record<string, unknown> = {}) =>
  ({ id, salaId: 's', autorId, texto: id, criadoEm, editadoEm: null, apagada: false, ...extra });

describe('chat da equipe: não lidas', () => {
  const msgs = [
    M('a', 'ana', '2026-11-25T12:00:00Z'), M('b', 'eu', '2026-11-25T12:01:00Z'),
    M('c', 'ana', '2026-11-25T12:02:00Z'), M('d', 'gina', '2026-11-25T12:03:00Z', { apagada: true }), M('e', 'gina', '2026-11-25T12:04:00Z'),
  ];
  it('conta só as dos outros, depois da minha leitura, sem as apagadas', () => {
    expect(contarNaoLidas(msgs, 'eu', '2026-11-25T12:01:30Z')).toBe(2); // c, e
    expect(contarNaoLidas(msgs, 'eu', '2026-11-25T12:04:00Z')).toBe(0); // leu até a última (a mesma hora já é lida)
    expect(contarNaoLidas(msgs, 'eu', null)).toBe(3); // nunca leu: todas dos outros
    expect(contarNaoLidas(msgs, 'eu', null, '2026-11-25T12:02:00Z')).toBe(2); // nunca leu: desde que entrou (inclusive)
  });
  it('o total do menu é a soma das conversas', () => {
    expect(totalNaoLidas([{ naoLidas: 2 }, { naoLidas: 0 }, { naoLidas: 5 }])).toBe(7);
  });
});

describe('chat da equipe: dias e blocos', () => {
  it('separa por dia no horário de Brasília e junta mensagens seguidas da mesma pessoa', () => {
    const dias = agruparPorDia([
      M('x3', 'ana', '2026-11-25T13:00:00Z'),
      M('x1', 'ana', '2026-11-24T02:30:00Z'), // 23h30 do dia 23 em Brasília
      M('x2', 'ana', '2026-11-24T12:00:00Z'),
      M('x4', 'ana', '2026-11-25T13:03:00Z'),
      M('x5', 'eu', '2026-11-25T13:04:00Z'),
      M('x6', 'ana', '2026-11-25T13:20:00Z'),
    ], '2026-11-25');
    expect(dias.map((d) => [d.dia, d.rotulo, d.msgs.map((m) => m.id)])).toEqual([
      ['2026-11-23', 'segunda-feira, 23 de novembro', ['x1']],
      ['2026-11-24', 'Ontem', ['x2']],
      ['2026-11-25', 'Hoje', ['x3', 'x4', 'x5', 'x6']],
    ]);
    expect(dias[2].msgs.map((m) => m.continua)).toEqual([false, true, false, false]); // x6: 16 min depois de x4, outra pessoa no meio
    expect(dias[1].msgs[0].continua).toBe(false); // dia novo sempre começa um bloco
  });
  it('rótulo do dia com o ano quando é outro', () => {
    expect(rotuloDia('2025-12-31', '2026-01-02')).toBe('quarta-feira, 31 de dezembro de 2025');
  });
  it('a hora da lista: hoje, ontem, dia da semana, data', () => {
    const agora = new Date('2026-11-25T18:00:00Z'); // quarta, 15h em Brasília
    expect(quandoNaLista('2026-11-25T12:05:00Z', agora)).toBe('09:05');
    expect(quandoNaLista('2026-11-24T20:00:00Z', agora)).toBe('Ontem');
    expect(quandoNaLista('2026-11-21T20:00:00Z', agora)).toBe('sáb');
    expect(quandoNaLista('2026-11-10T20:00:00Z', agora)).toBe('10/11');
    expect(quandoNaLista(null, agora)).toBe('');
  });
});

describe('chat da equipe: link de conversa de cliente', () => {
  it('acha o link do sistema, o da prévia e só o caminho', () => {
    expect(conversasNoTexto('olha https://app.reviza.com.br/whatsapp?conversa=9f1c2d3e-0000-4000-8000-000000000001 por favor')).toEqual(['9f1c2d3e-0000-4000-8000-000000000001']);
    expect(conversasNoTexto('file:///Users/x/index.html#/whatsapp?conversa=wa-maria')).toEqual(['wa-maria']);
    expect(conversasNoTexto('/whatsapp?filtro=meus&conversa=abc_1&midias=fotos e /whatsapp?conversa=abc_1')).toEqual(['abc_1']);
    expect(conversasNoTexto('/kanban?conversa=x e whatsapp sem link')).toEqual([]);
  });
  it('quebra o texto em texto + cartão, sem engolir a pontuação do fim', () => {
    expect(partesDoTexto('Atende ela: /whatsapp?conversa=wa-maria.')).toEqual([
      { tipo: 'texto', texto: 'Atende ela: ' },
      { tipo: 'conversa', id: 'wa-maria', link: '/whatsapp?conversa=wa-maria' },
      { tipo: 'texto', texto: '.' },
    ]);
    expect(partesDoTexto('sem link')).toEqual([{ tipo: 'texto', texto: 'sem link' }]);
  });
  it('a prévia da lista troca o link por "Conversa de cliente"', () => {
    expect(previaDoTexto('Deixei pronta: /whatsapp?conversa=wa-maria')).toBe('Deixei pronta: Conversa de cliente');
    expect(previaDoTexto('x', true)).toBe('Mensagem apagada');
  });
});

describe('chat da equipe: conversa', () => {
  const direta = { tipo: 'direta' as const, nome: null, membros: [{ id: 'eu', nome: 'Matheo', lidoAte: null }, { id: 'ana', nome: 'Ana', lidoAte: '2026-11-25T12:05:00Z' }] };
  it('nome da conversa: o colega na direta, o nome no grupo', () => {
    expect(nomeDaSala(direta, 'eu')).toBe('Ana');
    expect(nomeDaSala({ tipo: 'grupo', nome: ' Comercial ', membros: [] }, 'eu')).toBe('Comercial');
  });
  it('"Visto" só debaixo da minha última, quando ela é a última da conversa', () => {
    expect(situacaoDaMinhaUltima(direta, [M('a', 'ana', '2026-11-25T12:00:00Z'), M('b', 'eu', '2026-11-25T12:04:00Z')], 'eu')).toEqual({ msgId: 'b', visto: true });
    expect(situacaoDaMinhaUltima(direta, [M('b', 'eu', '2026-11-25T12:06:00Z')], 'eu')).toEqual({ msgId: 'b', visto: false });
    expect(situacaoDaMinhaUltima(direta, [M('b', 'eu', '2026-11-25T12:00:00Z'), M('c', 'ana', '2026-11-25T12:01:00Z')], 'eu')).toBeNull();
    expect(situacaoDaMinhaUltima({ ...direta, tipo: 'grupo' }, [M('b', 'eu', '2026-11-25T12:00:00Z')], 'eu')).toBeNull();
  });
  it('busca pelo nome da conversa ou de quem está nela, sem acento', () => {
    const salas = [{ ...direta, id: '1' }, { id: '2', tipo: 'grupo' as const, nome: 'Documentação', membros: [{ id: 'jul', nome: 'Juliano', lidoAte: null }] }];
    expect(filtrarSalas(salas, 'documentacao', 'eu').map((s) => s.id)).toEqual(['2']);
    expect(filtrarSalas(salas, 'juli', 'eu').map((s) => s.id)).toEqual(['2']);
    expect(filtrarSalas(salas, 'matheo', 'eu')).toEqual([]); // eu mesmo não conta
    expect(filtrarSalas(salas, '', 'eu')).toHaveLength(2);
  });
  it('lê a resposta do servidor com campos faltando sem quebrar', () => {
    const [s] = normalizarSalas([{ id: 'x', tipo: 'estranho', membros: [{ id: 'a' }], ultima: { texto: 'oi' }, nao_lidas: '3' }, { tipo: 'grupo' }]);
    expect(s).toMatchObject({ id: 'x', tipo: 'direta', nome: null, naoLidas: 3, ultima: null, membros: [{ id: 'a', nome: 'Colega', lidoAte: null }] });
    expect(normalizarSalas(null)).toEqual([]);
  });
  it('erros do banco em português', () => {
    expect(traduzErroChat(new Error('pessoa_fora_da_empresa'))).toMatch(/não está mais no Atendimento/);
    expect(traduzErroChat(new Error('Failed to fetch'))).toMatch(/internet/);
  });
});

describe('chat da equipe: demonstração', () => {
  it('começa com não lidas, ler zera a conversa e o colega responde uma vez', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-25T15:00:00Z'));
    demoChat.reiniciar();
    const antes = demoChat.naoLidas();
    expect(antes).toBeGreaterThan(0);
    const [primeira] = demoChat.salas().filter((s) => s.naoLidas > 0);
    demoChat.marcarLida(primeira.id);
    expect(demoChat.naoLidas()).toBe(antes - primeira.naoLidas);
    const ouvinte = vi.fn(); const sair = demoChat.ouvir(ouvinte);
    demoChat.enviar(primeira.id, 'Eu atendo');
    expect(demoChat.msgs(primeira.id).at(-1)).toMatchObject({ autorId: EU_DEMO, texto: 'Eu atendo' });
    await vi.advanceTimersByTimeAsync(4000);
    const ult = demoChat.msgs(primeira.id).at(-1)!;
    expect(ult.autorId).not.toBe(EU_DEMO);
    expect(demoChat.salas().find((s) => s.id === primeira.id)!.naoLidas).toBe(1); // a resposta chegou sem eu ler
    demoChat.enviar(primeira.id, 'Obrigado');
    await vi.advanceTimersByTimeAsync(4000);
    expect(demoChat.msgs(primeira.id).at(-1)!.texto).toBe('Obrigado'); // só uma resposta por conversa
    expect(ouvinte).toHaveBeenCalled();
    sair(); vi.useRealTimers();
  });
  it('abrir a conversa com quem já tem devolve a mesma; grupo novo entra na lista', () => {
    demoChat.reiniciar();
    expect(demoChat.abrirDireta('demo-alexandra')).toBe('sala-alexandra');
    const nova = demoChat.abrirDireta('demo-felipe');
    expect(demoChat.abrirDireta('demo-felipe')).toBe(nova);
    const g = demoChat.criarGrupo('Plantão sábado', ['demo-rafael', 'demo-raissa']);
    expect(demoChat.salas().find((s) => s.id === g)).toMatchObject({ tipo: 'grupo', nome: 'Plantão sábado', naoLidas: 0 });
    expect(() => demoChat.criarGrupo('  ', ['demo-rafael'])).toThrow('nome_invalido');
  });
});
