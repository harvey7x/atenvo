// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  AMOSTRAS_POR_PEDACO, ErroVoz, GRACA_FIM_MS, INICIO_DA_CONVERSA, LEGENDA_ADIANTE, MAX_ITENS_LISTA, MENSAGENS_ERRO_VOZ,
  SILENCIO_MAX_MS, WS_BASE,
  base64ParaBytes, bytesParaBase64, criarDecodificadorPcm, criarLegenda, criarReamostrador, cumprimentoReserva, duracaoMs,
  erroDoFechamento, erroDoMicrofone, floatParaPcm16, horarioFalado, lerMensagemServidor, limiteDaSessao, montarToolResponse,
  msgAudio, msgCumprimento, msgFimDoAudio, msgSetup, pcm16ParaBytes, pedacoParaEnvio, primeiroNomeDe, proximaFase,
  resultadoParaVoz, textoDaFase, textoDoFim, urlDoWebSocket, verificarFim,
  type CodigoErroVoz, type EventoFase, type FaseVoz,
} from './assistenteVoz';

/* A lógica pura do modo de voz (dono 30/10): PCM e reamostragem, a legenda que acende com a voz, a leitura
   das mensagens do Live API (todos os campos de cada mensagem), a resposta das ferramentas no formato da
   documentação, a máquina de estados, o relógio do fim e os erros. */

const seno = (n: number, taxa: number, hz: number, fase = 0) =>
  Float32Array.from({ length: n }, (_, i) => Math.sin(2 * Math.PI * hz * (i / taxa) + fase));
/** cruzamentos de zero subindo → frequência estimada */
const frequencia = (x: Float32Array, taxa: number) => {
  let n = 0;
  for (let i = 1; i < x.length; i++) if (x[i - 1] < 0 && x[i] >= 0) n++;
  return (n * taxa) / x.length;
};
/** passa o sinal pelo reamostrador em pedaços dos tamanhos dados (repetindo a lista) */
const emPedacos = (f: (x: Float32Array) => Float32Array, x: Float32Array, tamanhos: number[]) => {
  const out: number[] = [];
  for (let i = 0, k = 0; i < x.length; k++) {
    const t = tamanhos[k % tamanhos.length];
    out.push(...f(x.subarray(i, Math.min(x.length, i + t))));
    i += t;
  }
  return Float32Array.from(out);
};

describe('PCM: Float32 ↔ Int16 LE ↔ base64', () => {
  it('Float32 → Int16 com teto; −1 e 1 nas pontas; NaN vira silêncio', () => {
    expect(Array.from(floatParaPcm16(Float32Array.from([0, 1, -1, 2, -3, 0.5, Number.NaN])))).toEqual([0, 32767, -32768, 32767, -32768, 16384, 0]);
  });

  it('bytes sempre little-endian e base64 de ida e volta', () => {
    const b = pcm16ParaBytes(Int16Array.from([1, -2, 0x1234]));
    expect(Array.from(b)).toEqual([0x01, 0x00, 0xfe, 0xff, 0x34, 0x12]);
    expect(Array.from(base64ParaBytes(bytesParaBase64(b)))).toEqual(Array.from(b));
    const grande = Uint8Array.from({ length: 70_000 }, (_, i) => (i * 7) % 256);
    expect(base64ParaBytes(bytesParaBase64(grande))).toEqual(grande);
  });

  it('o pedaço do microfone (512 amostras = 32 ms) vira 1024 bytes em base64', () => {
    const b64 = pedacoParaEnvio(seno(AMOSTRAS_POR_PEDACO, 16000, 300));
    expect(base64ParaBytes(b64).length).toBe(1024);
  });

  it('a fala de 24 kHz volta a Float32 sem perder amostra, mesmo com o pedaço cortado no meio de uma amostra', () => {
    const x = seno(480, 24000, 220);
    const bytes = pcm16ParaBytes(floatParaPcm16(x));
    const dec = criarDecodificadorPcm();
    // corta em 333 bytes (ímpar): o byte que sobra espera o próximo pedaço
    const a = dec(bytesParaBase64(bytes.subarray(0, 333)));
    const b = dec(bytesParaBase64(bytes.subarray(333)));
    expect(a.length + b.length).toBe(480);
    const junto = Float32Array.from([...a, ...b]);
    for (let i = 0; i < x.length; i++) expect(Math.abs(junto[i] - x[i])).toBeLessThan(1 / 16000);
    expect(dec('@@não é base64@@').length).toBe(0);
  });
});

describe('reamostragem (microfone fora de 16 kHz)', () => {
  it('48 → 16 kHz: um terço das amostras, constante continua constante, a frequência se mantém', () => {
    const r = criarReamostrador(48000, 16000);
    const x = seno(48000, 48000, 440);
    const y = emPedacos(r, x, [128]);
    expect(y.length).toBe(16000);
    expect(frequencia(y, 16000)).toBeCloseTo(440, -1);
    const c = criarReamostrador(48000, 16000)(new Float32Array(300).fill(0.25));
    expect(c.length).toBe(100);
    c.forEach((v) => expect(v).toBeCloseTo(0.25, 6));
  });

  it('o corte dos pedaços não muda o resultado (o estado passa de um pedaço para o outro)', () => {
    const x = seno(44100, 44100, 523);
    const inteiro = criarReamostrador(44100, 16000)(x);
    const picado = emPedacos(criarReamostrador(44100, 16000), x, [128, 7, 1000, 1, 333]);
    expect(picado.length).toBe(inteiro.length);
    expect(Math.abs(picado.length - 16000)).toBeLessThanOrEqual(1);
    for (let i = 0; i < inteiro.length; i++) expect(picado[i]).toBeCloseTo(inteiro[i], 6);
    // a média da janela tira o que passaria de 8 kHz (12 kHz a 48k quase some)
    const alto = criarReamostrador(48000, 16000)(seno(4800, 48000, 12000));
    expect(Math.max(...Array.from(alto, Math.abs))).toBeLessThan(0.35);
  });

  it('8 → 16 kHz: o dobro de amostras, com o ponto do meio interpolado; mesma taxa = cópia', () => {
    const r = criarReamostrador(8000, 16000);
    // a saída na posição da última amostra espera o próximo pedaço (a interpolação precisa do vizinho)
    expect(Array.from(r(Float32Array.from([0, 1, 0])))).toEqual([0, 0.5, 1, 0.5]);
    expect(Array.from(r(Float32Array.from([1])))).toEqual([0, 0.5]);
    const s = criarReamostrador(8000, 16000);
    const y = emPedacos(s, seno(8000, 8000, 300), [100, 3]);
    expect(Math.abs(y.length - 16000)).toBeLessThanOrEqual(2);
    const x = Float32Array.from([0.1, 0.2]);
    const copia = criarReamostrador(16000, 16000)(x);
    expect(Array.from(copia)).toEqual(Array.from(x));
    expect(copia).not.toBe(x);
    expect(() => criarReamostrador(0, 16000)).toThrow();
  });
});

describe('legenda que acende com a voz', () => {
  const ditas = (l: ReturnType<typeof criarLegenda>, pos: number, adiante?: number) =>
    l.palavras(pos, adiante).map((p) => `${p.texto}${p.dita ? '' : '·'}`).join(' ');

  it('cada pedaço acende quando a reprodução passa pela marca dele; as próximas aparecem apagadas', () => {
    const l = criarLegenda();
    l.adicionar('Hoje você ', 0);
    l.adicionar('fechou cinco ', 24000);
    l.adicionar('clientes.', 60000);
    expect(ditas(l, 0, 0)).toBe('Hoje você');
    expect(ditas(l, 0, 30000)).toBe('Hoje você fechou· cinco·');
    expect(ditas(l, 24000, 0)).toBe('Hoje você fechou cinco');
    expect(ditas(l, 70000)).toBe('Hoje você fechou cinco clientes.');
    expect(l.texto()).toBe('Hoje você fechou cinco clientes.');
  });

  it('pedaço que corta a palavra no meio: a palavra acende com a última parte', () => {
    const l = criarLegenda();
    l.adicionar('Você fe', 0);
    l.adicionar('chou 4.', 9000);
    expect(ditas(l, 0, 0)).toBe('Você');
    expect(ditas(l, 9000, 0)).toBe('Você fechou 4.');
  });

  it('interrompida: fica só o que ela chegou a dizer; concluir acende tudo; definir/limpar', () => {
    const l = criarLegenda();
    l.adicionar('Você tem oito ', 0);
    l.adicionar('clientes sem resposta ', 30000);
    l.adicionar('e três passados.', 60000);
    l.cortar(30000);
    expect(ditas(l, 0, 0)).toBe('Você tem oito clientes sem resposta');
    const m = criarLegenda();
    m.adicionar('Tudo certo.', 999999);
    expect(m.palavras(0, 0)).toEqual([]);
    m.concluir();
    expect(ditas(m, 0, 0)).toBe('Tudo certo.');
    m.definir(cumprimentoReserva('Matheus'));
    expect(ditas(m, 0, 0)).toBe('Oi, Matheus. Pode perguntar.');
    m.limpar();
    expect(m.vazia()).toBe(true);
    expect(LEGENDA_ADIANTE).toBe(28800);
  });
});

describe('mensagens do servidor → eventos (todos os campos, nada de else-if)', () => {
  it('setupComplete', () => {
    expect(lerMensagemServidor({ setupComplete: {} })).toEqual([{ tipo: 'pronta' }]);
  });

  it('um serverContent com DUAS partes de áudio, a legenda e o turnComplete juntos', () => {
    const ev = lerMensagemServidor({
      serverContent: {
        modelTurn: { parts: [
          { inlineData: { mimeType: 'audio/pcm;rate=24000', data: 'AAAA' } },
          { inlineData: { mimeType: 'image/png', data: 'xxxx' } },
          { inlineData: { mimeType: 'audio/pcm;rate=24000', data: 'BBBB' } },
          { text: 'pensamento' },
        ] },
        outputTranscription: { text: 'Hoje você fechou ' },
        generationComplete: true,
        turnComplete: true,
        interactionStatus: 'IDLE',
        turnCompleteReason: 'NEED_MORE_INPUT',
      },
      usageMetadata: { totalTokenCount: 3530 },
    });
    expect(ev).toEqual([
      { tipo: 'audio', dados: 'AAAA' },
      { tipo: 'audio', dados: 'BBBB' },
      { tipo: 'fala', texto: 'Hoje você fechou ' },
      { tipo: 'geracao_fim' },
      { tipo: 'turno_fim', motivo: 'NEED_MORE_INPUT' },
    ]);
  });

  it('o que a pessoa disse (final e parcial), interrupção', () => {
    expect(lerMensagemServidor({ serverContent: { inputTranscription: { text: 'quantos clientes' }, interimInputTranscription: { text: 'quantos cli' } } }))
      .toEqual([{ tipo: 'ouvido', texto: 'quantos clientes' }, { tipo: 'ouvido_parcial', texto: 'quantos cli' }]);
    expect(lerMensagemServidor({ serverContent: { interrupted: true } })).toEqual([{ tipo: 'interrompida' }]);
    expect(lerMensagemServidor({ serverContent: { waitingForInput: true } })).toEqual([]);
  });

  it('chamada de ferramenta (id, nome, args; sem args = {}), cancelamento e goAway', () => {
    expect(lerMensagemServidor({ toolCall: { functionCalls: [
      { id: 'fc-1', name: 'ver_fechados', args: { periodo: 'hoje' } },
      { id: 'fc-2', name: 'ver_carteira' },
      { id: 'fc-3' },
    ] } })).toEqual([{ tipo: 'ferramentas', chamadas: [
      { id: 'fc-1', nome: 'ver_fechados', args: { periodo: 'hoje' } },
      { id: 'fc-2', nome: 'ver_carteira', args: {} },
    ] }]);
    expect(lerMensagemServidor({ toolCallCancellation: { ids: ['fc-1', 7] } })).toEqual([{ tipo: 'cancelar', ids: ['fc-1'] }]);
    expect(lerMensagemServidor({ goAway: { timeLeft: '10s' } })).toEqual([{ tipo: 'saindo', restanteMs: 10000 }]);
    expect(duracaoMs('9.5s')).toBe(9500);
    expect(duracaoMs('agora')).toBeNull();
    expect(lerMensagemServidor(null)).toEqual([]);
    expect(lerMensagemServidor('texto')).toEqual([]);
  });
});

describe('mensagens do cliente (JSON exato da documentação)', () => {
  it('setup mínimo (o token trava o resto), cumprimento, áudio e fim do áudio', () => {
    expect(msgSetup('gemini-3.8-live')).toEqual({ setup: { model: 'models/gemini-3.8-live' } });
    expect(msgSetup('models/gemini-3.8-live')).toEqual({ setup: { model: 'models/gemini-3.8-live' } });
    expect(msgCumprimento()).toEqual({
      clientContent: { turns: [{ role: 'user', parts: [{ text: INICIO_DA_CONVERSA }] }], turnComplete: true },
    });
    expect(msgAudio('QUJD')).toEqual({ realtimeInput: { audio: { data: 'QUJD', mimeType: 'audio/pcm;rate=16000' } } });
    expect(msgFimDoAudio()).toEqual({ realtimeInput: { audioStreamEnd: true } });
  });

  it('toolResponse: UMA mensagem com todas as respostas; id e name em cada; sucesso em output, falha em error; sem scheduling', () => {
    const m = montarToolResponse([
      { id: 'fc-1', nome: 'ver_fechados', ok: true, resultado: { periodo: { inicio: '2026-10-30', fim: '2026-10-30' }, escopo: 'pessoa', total: 4 } },
      { id: 'fc-2', nome: 'buscar_cliente', ok: false, erro: 'falha_consulta' },
      { nome: 'ver_carteira', ok: true, resultado: { erro: 'sem_acesso' } },
    ]);
    expect(m).toEqual({ toolResponse: { functionResponses: [
      { id: 'fc-1', name: 'ver_fechados', response: { output: { periodo: { inicio: '2026-10-30', fim: '2026-10-30' }, escopo: 'pessoa', total: 4 } } },
      { id: 'fc-2', name: 'buscar_cliente', response: { error: 'falha_consulta' } },
      { name: 'ver_carteira', response: { output: { erro: 'sem_acesso' } } },
    ] } });
    expect(JSON.stringify(m)).not.toContain('scheduling');
  });

  it('o resultado que vai para o modelo é enxuto: sem ids, horário legível, listas em 5 (o total fica)', () => {
    const original = {
      escopo: 'pessoa', pessoa: { id: 'd7e5', nome: 'Juliana' },
      sem_resposta: {
        total: 81,
        clientes: Array.from({ length: 8 }, (_, i) => ({
          conversa_id: `0b72-${i}`, cliente: `Cliente ${i}`, responsavel: 'Juliana',
          esperando_desde: '2026-08-07T16:54:47-03:00', minutos: 121222 - i, ultima_msg: 'Olá!',
        })),
      },
    };
    const copia = JSON.parse(JSON.stringify(original));
    const v = resultadoParaVoz(original) as typeof original;
    expect(v.pessoa).toEqual({ nome: 'Juliana' });
    expect(v.sem_resposta.total).toBe(81);
    expect(v.sem_resposta.clientes).toHaveLength(5);
    expect(v.sem_resposta.clientes[0]).toEqual({
      cliente: 'Cliente 0', responsavel: 'Juliana', esperando_desde: '07/08/2026 16:54', minutos: 121222, ultima_msg: 'Olá!',
    });
    expect(JSON.stringify(v)).not.toMatch(/conversa_id|"id"/);
    expect(original).toEqual(copia); // não mexe no original
    expect(horarioFalado('ontem')).toBe('ontem');
    expect(resultadoParaVoz({ erro: 'pessoa_ambigua', opcoes: ['Ana', 'Ana Paula'] })).toEqual({ erro: 'pessoa_ambigua', opcoes: ['Ana', 'Ana Paula'] });
  });

  it('só as listas de CLIENTES são cortadas: a equipe, os vendedores e as campanhas vão inteiros (sem `total` ao lado)', () => {
    // ver_equipe do Murilo: 6 pessoas ativas; a 6ª (0 fechados, ordem por fechados) é a que mais tem sem resposta
    const nomes = ['Matheus', 'Juliana', 'Giovana', 'Isadora', 'Luiz', 'Murilo'];
    const equipe = {
      periodo: { inicio: '2026-10-30', fim: '2026-10-30' }, fonte: 'sistema',
      membros: nomes.map((nome, i) => ({ id: `u${i}`, nome, papel: 'atendente', fechados: 5 - i, sem_resposta: i === 5 ? 400 : 10, passados: 0, presenciais_hoje: 0, novos: 1 })),
    };
    const v = resultadoParaVoz(equipe) as { membros: { nome: string; sem_resposta: number }[] };
    expect(v.membros.map((x) => x.nome)).toEqual(nomes);
    expect(v.membros[5].sem_resposta).toBe(400);
    expect(JSON.stringify(v)).not.toContain('"id"');
    const fechados = resultadoParaVoz({
      escopo: 'equipe', total: 21, por_vendedor: nomes.map((nome, i) => ({ nome, n: 6 - i })),
      clientes: Array.from({ length: 20 }, (_, i) => ({ cliente: `C${i}`, vendedor: 'Juliana', data: '2026-10-30' })),
    }) as { por_vendedor: unknown[]; clientes: unknown[]; total: number };
    expect(fechados.por_vendedor).toHaveLength(6);
    expect(fechados.clientes).toHaveLength(5);
    expect(fechados.total).toBe(21);
    const camp = ['Antônio', 'Andrius', 'Diego', 'Juros', 'Empréstimo', 'Outros'].map((campanha, i) => ({ campanha, n: 10 - i }));
    expect((resultadoParaVoz({ entradas: 45, por_campanha: camp }) as { por_campanha: unknown[] }).por_campanha).toHaveLength(6);
    const equipeNomes = Array.from({ length: 7 }, (_, i) => `Pessoa ${i}`);
    expect(resultadoParaVoz({ erro: 'pessoa_nao_encontrada', equipe: equipeNomes })).toEqual({ erro: 'pessoa_nao_encontrada', equipe: equipeNomes });
    // o teto das outras listas só segura o custo
    expect((resultadoParaVoz({ membros: Array.from({ length: 60 }, (_, i) => ({ nome: `P${i}` })) }) as { membros: unknown[] }).membros).toHaveLength(MAX_ITENS_LISTA);
  });

  it('URL do WebSocket: endpoint Constrained v1beta com access_token (a "/" do token fica); ws_url só do Google', () => {
    expect(urlDoWebSocket('auth_tokens/abc-123_x')).toBe(`${WS_BASE}?access_token=auth_tokens/abc-123_x`);
    expect(WS_BASE).toBe('wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained');
    expect(urlDoWebSocket('auth_tokens/a+b=c&d')).toBe(`${WS_BASE}?access_token=auth_tokens/a%2Bb%3Dc%26d`);
    const doServidor = `${WS_BASE.replace('v1beta', 'v1alpha')}?access_token=auth_tokens/zz`;
    expect(urlDoWebSocket('auth_tokens/zz', doServidor)).toBe(doServidor);
    expect(urlDoWebSocket('auth_tokens/zz', 'wss://malicioso.exemplo/ws?access_token=auth_tokens/zz')).toBe(`${WS_BASE}?access_token=auth_tokens/zz`);
    expect(urlDoWebSocket('auth_tokens/zz', 42)).toBe(`${WS_BASE}?access_token=auth_tokens/zz`);
  });
});

describe('máquina de estados (a linha de estado da tela)', () => {
  const corre = (eventos: EventoFase[], inicio: FaseVoz = 'conectando') => {
    const fases: FaseVoz[] = [];
    let f = inicio;
    for (const e of eventos) { f = proximaFase(f, e); fases.push(f); }
    return fases;
  };

  it('uma pergunta inteira: conectando → ouvindo → consultando → falando → ouvindo', () => {
    expect(corre([
      { tipo: 'audio' }, { tipo: 'pronta' }, { tipo: 'audio' }, { tipo: 'turno_fim', tocando: true }, { tipo: 'tocou_tudo' },
      { tipo: 'ferramenta' }, { tipo: 'audio' }, { tipo: 'turno_fim', tocando: false },
    ])).toEqual(['conectando', 'ouvindo', 'falando', 'falando', 'ouvindo', 'consultando', 'falando', 'ouvindo']);
  });

  it('interrupção volta a ouvir; turnComplete consultando espera a fala; ouvindo ignora tocou_tudo', () => {
    expect(proximaFase('falando', { tipo: 'interrompida' })).toBe('ouvindo');
    expect(proximaFase('consultando', { tipo: 'interrompida' })).toBe('ouvindo');
    expect(proximaFase('consultando', { tipo: 'turno_fim', tocando: false })).toBe('consultando');
    expect(proximaFase('ouvindo', { tipo: 'tocou_tudo' })).toBe('ouvindo');
    expect(proximaFase('conectando', { tipo: 'ferramenta' })).toBe('conectando');
  });

  it('encerrada e erro são finais', () => {
    for (const f of ['conectando', 'ouvindo', 'consultando', 'falando'] as FaseVoz[]) {
      expect(proximaFase(f, { tipo: 'encerrar' })).toBe('encerrada');
      expect(proximaFase(f, { tipo: 'erro' })).toBe('erro');
    }
    for (const e of [{ tipo: 'pronta' }, { tipo: 'audio' }, { tipo: 'erro' }, { tipo: 'encerrar' }] as EventoFase[]) {
      expect(proximaFase('encerrada', e)).toBe('encerrada');
      expect(proximaFase('erro', e)).toBe('erro');
    }
  });
});

describe('o relógio do fim', () => {
  const base = { inicio: 0, limiteS: 600 };
  it('1 minuto OUVINDO sem fala nenhuma = silêncio; falando ou consultando não conta', () => {
    expect(verificarFim({ ...base, agora: SILENCIO_MAX_MS - 1, ultimaAtividade: 0, fase: 'ouvindo' })).toBeNull();
    expect(verificarFim({ ...base, agora: SILENCIO_MAX_MS, ultimaAtividade: 0, fase: 'ouvindo' })).toBe('silencio');
    expect(verificarFim({ ...base, agora: 90_000, ultimaAtividade: 0, fase: 'falando' })).toBeNull();
    expect(verificarFim({ ...base, agora: 90_000, ultimaAtividade: 0, fase: 'consultando' })).toBeNull();
    expect(verificarFim({ ...base, agora: 90_000, ultimaAtividade: 0, fase: 'conectando' })).toBeNull();
  });

  it('teto de tempo: ouvindo encerra na hora; falando termina a frase (até 20 s)', () => {
    expect(verificarFim({ ...base, agora: 600_000, ultimaAtividade: 599_000, fase: 'ouvindo' })).toBe('tempo');
    expect(verificarFim({ ...base, agora: 600_000, ultimaAtividade: 599_000, fase: 'falando' })).toBeNull();
    expect(verificarFim({ ...base, agora: 600_000 + GRACA_FIM_MS, ultimaAtividade: 599_000, fase: 'falando' })).toBe('tempo');
    expect(verificarFim({ inicio: 0, limiteS: 90, agora: 90_000, ultimaAtividade: 89_000, fase: 'ouvindo' })).toBe('tempo');
  });

  it('o teto do servidor nunca passa de 10 min nem fica abaixo de 30 s', () => {
    expect(limiteDaSessao(600)).toBe(600);
    expect(limiteDaSessao(3600)).toBe(600);
    expect(limiteDaSessao(5)).toBe(30);
    expect(limiteDaSessao('x')).toBe(600);
    expect(limiteDaSessao(undefined)).toBe(600);
  });
});

describe('erros e frases', () => {
  it('fechamento do WebSocket: crédito pelo motivo; antes do setup = conexão; 1000 depois do setup = fim normal', () => {
    expect(erroDoFechamento({ code: 1011, reason: 'Resource has been exhausted (e.g. check quota).' }, true)).toBe('sem_credito');
    expect(erroDoFechamento({ code: 1008, reason: 'Your prepayment credits are depleted' }, false)).toBe('sem_credito');
    expect(erroDoFechamento({ code: 1007, reason: 'Invalid JSON payload' }, false)).toBe('conexao');
    expect(erroDoFechamento({ code: 1000, reason: '' }, true)).toBeNull();
    expect(erroDoFechamento({ code: 1011, reason: 'Internal error' }, true)).toBe('queda');
    expect(erroDoFechamento({ code: 1006, reason: '' }, true)).toBe('queda');
  });

  it('microfone: negado, ausente, ocupado; sem mediaDevices = sem suporte', () => {
    const dom = (name: string) => Object.assign(new Error(name), { name });
    expect(erroDoMicrofone(dom('NotAllowedError'))).toBe('microfone_negado');
    expect(erroDoMicrofone(dom('SecurityError'))).toBe('microfone_negado');
    expect(erroDoMicrofone(dom('NotFoundError'))).toBe('microfone_ausente');
    expect(erroDoMicrofone(dom('OverconstrainedError'))).toBe('microfone_ausente');
    expect(erroDoMicrofone(dom('NotReadableError'))).toBe('microfone_falhou');
    expect(erroDoMicrofone(new TypeError('undefined is not a function'))).toBe('sem_suporte');
    expect(erroDoMicrofone(new ErroVoz('sem_suporte'))).toBe('sem_suporte');
  });

  it('cada código tem título e texto, sem emoji; as linhas de estado e os fins', () => {
    const codigos: CodigoErroVoz[] = [
      'pergunta_invalida', 'nao_autenticado', 'sem_acesso', 'limite_dia', 'sem_credito', 'ia_indisponivel', 'rede',
      'microfone_negado', 'microfone_ausente', 'microfone_falhou', 'sem_suporte', 'conexao', 'queda',
    ];
    for (const c of codigos) {
      const m = MENSAGENS_ERRO_VOZ[c];
      expect(m.titulo.length).toBeGreaterThan(4);
      expect(m.texto.length).toBeGreaterThan(15);
      expect(`${m.titulo}${m.texto}`).not.toMatch(/\p{Extended_Pictographic}/u);
    }
    expect(Object.keys(MENSAGENS_ERRO_VOZ).sort()).toEqual([...codigos].sort());
    expect(MENSAGENS_ERRO_VOZ.microfone_negado.texto).toContain('Permitir');
    expect(textoDaFase('conectando', false)).toBe('Conectando…');
    expect(textoDaFase('ouvindo', false)).toBe('Ouvindo');
    expect(textoDaFase('ouvindo', true)).toBe('Microfone desligado');
    expect(textoDaFase('consultando', false)).toBe('Consultando o sistema…');
    expect(textoDaFase('falando', false)).toBe('Falando');
    expect(textoDoFim('silencio', 600)).toBe('Encerrada depois de 1 minuto sem fala.');
    expect(textoDoFim('tempo', 600)).toBe('Encerrada no limite de 10 minutos por conversa.');
    expect(textoDoFim('servidor', 600)).toBe('A IA encerrou a sessão.');
    expect(primeiroNomeDe('  Matheus Ribeiro ')).toBe('Matheus');
    expect(cumprimentoReserva('')).toBe('Oi. Pode perguntar.');
  });
});
