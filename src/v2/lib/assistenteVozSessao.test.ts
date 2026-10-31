// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErroAssistente, type SessaoVozServidor } from '@/data/assistente';
import { WS_BASE, bytesParaBase64, floatParaPcm16, pcm16ParaBytes, base64ParaBytes } from './assistenteVoz';
import type { AudioVoz, EventoTocador } from './assistenteVozAudio';
import {
  ESPERA_CUMPRIMENTO_MS, PRAZO_SETUP_MS, criarSessaoVoz, juntarLinks,
  type DepsSessao, type EstadoVoz, type PermissaoMicrofone, type WsLike,
} from './assistenteVozSessao';

/* O protocolo inteiro da sessão de voz com falsos (WebSocket, áudio, servidor e relógio): a ordem
   setup → setupComplete → cumprimento → microfone; a fala na fila com a legenda; as ferramentas numa
   toolResponse só (as canceladas fora); interrupção; mudo; os fins (silêncio, tempo, goAway, Encerrar) e os
   erros (microfone, servidor, conexão, crédito). */

const ultimoDe = <T,>(xs: T[]): T => xs[xs.length - 1];
const ORG = 'de300000-0000-4000-8000-000000000001';
const SESSAO: SessaoVozServidor = { token: 'auth_tokens/tok-1', modelo: 'gemini-3.8-live', expira_em: null, limite_s: 600 };

class WsFalso implements WsLike {
  binaryType = 'blob';
  readyState = 0;
  enviados: Record<string, unknown>[] = [];
  fechadoCom: number | null = null;
  onopen: WsLike['onopen'] = null;
  onmessage: WsLike['onmessage'] = null;
  onclose: WsLike['onclose'] = null;
  onerror: WsLike['onerror'] = null;
  constructor(public url: string) {}
  send(d: string) { this.enviados.push(JSON.parse(d)); }
  close(c?: number) { this.fechadoCom = c ?? 1000; this.readyState = 3; }
  abrir() { this.readyState = 1; this.onopen?.({}); }
  /** o servidor manda frames BINÁRIOS (por padrão) */
  receber(m: unknown, binario = true) {
    const texto = JSON.stringify(m);
    this.onmessage?.({ data: binario ? new TextEncoder().encode(texto).buffer : texto });
  }
  cair(code: number, reason = '') { this.readyState = 3; this.onclose?.({ code, reason }); }
  tipos() { return this.enviados.map((m) => Object.keys(m)[0]); }
}

function montar(o: {
  permissao?: PermissaoMicrofone;
  falhaMic?: unknown;
  pedir?: () => Promise<SessaoVozServidor>;
  ferramenta?: DepsSessao['executarFerramenta'];
} = {}) {
  const a = {
    preparou: 0, tocados: [] as Float32Array[], fins: 0, interrupcoes: 0, mudo: false, fechado: false,
    captura: null as ((x: Float32Array) => void) | null, tocador: null as ((e: EventoTocador) => void) | null,
  };
  const ordem: string[] = [];
  const audio: AudioVoz = {
    async preparar() { ordem.push('microfone'); a.preparou++; if (o.falhaMic) throw o.falhaMic; },
    aoCapturar(fn) { a.captura = fn; },
    tocar(x) { a.tocados.push(x); },
    fimDaFala() { a.fins++; },
    interromper() { a.interrupcoes++; },
    aoTocar(fn) { a.tocador = fn; },
    mudo(m) { a.mudo = m; },
    bandas: () => ({ g: 0.5, m: 0.4, a: 0.2, entrada: 0.1 }),
    fechar() { a.fechado = true; },
  };
  const sockets: WsFalso[] = [];
  const avisos: string[] = [];
  const estados: EstadoVoz[] = [];
  const pedir = vi.fn(o.pedir ?? (async () => { ordem.push('token'); return SESSAO; }));
  const ferramenta = vi.fn(o.ferramenta ?? (async () => ({ resultado: { total: 4 }, links: [] })));
  const s = criarSessaoVoz({ org: ORG, nome: 'Matheus', aoMudar: (e) => estados.push(e) }, {
    audio,
    pedirSessao: pedir,
    executarFerramenta: ferramenta,
    criarWs: (url) => { const w = new WsFalso(url); sockets.push(w); return w; },
    permissaoMicrofone: async () => o.permissao ?? 'granted',
    aviso: (m) => avisos.push(m),
  });
  const ultimo = () => estados[estados.length - 1];
  const ws = () => sockets[sockets.length - 1];
  return { s, a, ordem, sockets, ws, avisos, estados, ultimo, pedir, ferramenta };
}

const audioB64 = (n: number, v = 0.1) => bytesParaBase64(pcm16ParaBytes(floatParaPcm16(new Float32Array(n).fill(v))));
const passa = (ms: number) => vi.advanceTimersByTimeAsync(ms);

/** abre a sessão até o setupComplete */
async function aberta(o: Parameters<typeof montar>[0] = {}) {
  const m = montar(o);
  m.s.iniciar();
  await passa(0);
  m.ws().abrir();
  m.ws().receber({ setupComplete: {} });
  return m;
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-30T22:00:00-03:00')); });
afterEach(() => { vi.useRealTimers(); });

describe('abertura', () => {
  it('permissão já dada: microfone e token em paralelo; WebSocket Constrained com o token; setup mínimo e ESPERA o setupComplete', async () => {
    const m = montar();
    m.s.iniciar();
    expect(m.ultimo().fase).toBe('conectando');
    await passa(0);
    expect(m.pedir).toHaveBeenCalledWith(ORG);
    expect(m.sockets).toHaveLength(1);
    expect(m.ws().url).toBe(`${WS_BASE}?access_token=auth_tokens/tok-1`);
    expect(m.ws().binaryType).toBe('arraybuffer');
    m.ws().abrir();
    expect(m.ws().enviados).toEqual([{ setup: { model: 'models/gemini-3.8-live' } }]);
    expect(m.a.captura).toBeNull(); // nada de áudio antes do setupComplete
    m.ws().receber({ setupComplete: {} });
    expect(m.ultimo().fase).toBe('ouvindo');
    expect(m.ws().enviados[1]).toEqual({
      clientContent: { turns: [{ role: 'user', parts: [{ text: '[início da conversa]' }] }], turnComplete: true },
    });
    // o microfone no ar: cada pedaço de 512 amostras vai como realtimeInput (PCM16 16 kHz em base64)
    m.a.captura!(new Float32Array(512).fill(0.2));
    const msg = m.ws().enviados[2] as { realtimeInput: { audio: { data: string; mimeType: string } } };
    expect(msg.realtimeInput.audio.mimeType).toBe('audio/pcm;rate=16000');
    expect(base64ParaBytes(msg.realtimeInput.audio.data).length).toBe(1024);
    expect(m.avisos.join(' ')).not.toMatch(/access_token|tok-1/);
  });

  it('permissão ainda não dada: o microfone primeiro (negado = nem pede token, não gasta conversa do dia)', async () => {
    const ok = montar({ permissao: 'prompt' });
    ok.s.iniciar();
    await passa(0);
    expect(ok.ordem).toEqual(['microfone', 'token']);
    const negado = montar({ permissao: 'prompt', falhaMic: Object.assign(new Error('x'), { name: 'NotAllowedError' }) });
    negado.s.iniciar();
    await passa(0);
    expect(negado.pedir).not.toHaveBeenCalled();
    expect(negado.ultimo()).toMatchObject({ fase: 'erro', erro: 'microfone_negado' });
    expect(negado.a.fechado).toBe(true);
  });

  it('erro do servidor vira o código da tela (limite do dia, sem crédito, rede)', async () => {
    for (const [e, cod] of [[new ErroAssistente('limite_dia'), 'limite_dia'], [new ErroAssistente('sem_credito'), 'sem_credito'], [new TypeError('x'), 'rede']] as const) {
      const m = montar({ pedir: async () => { throw e; } });
      m.s.iniciar();
      await passa(0);
      expect(m.ultimo()).toMatchObject({ fase: 'erro', erro: cod });
      expect(m.sockets).toHaveLength(0);
    }
  });

  it('fechou antes do setupComplete: UM token novo; caiu de novo = "não consegui conectar"; sem resposta em 15 s idem', async () => {
    const m = montar();
    m.s.iniciar();
    await passa(0);
    m.ws().abrir();
    m.ws().cair(1008, 'token expired');
    await passa(0);
    expect(m.pedir).toHaveBeenCalledTimes(2);
    expect(m.sockets).toHaveLength(2);
    m.ws().abrir();
    m.ws().cair(1007, 'Invalid value at setup');
    await passa(0);
    expect(m.ultimo()).toMatchObject({ fase: 'erro', erro: 'conexao' });
    expect(m.pedir).toHaveBeenCalledTimes(2);

    const mudo = montar();
    mudo.s.iniciar();
    await passa(0);
    mudo.ws().abrir();
    await passa(PRAZO_SETUP_MS);
    expect(mudo.ultimo()).toMatchObject({ fase: 'erro', erro: 'conexao' });
    expect(mudo.ws().fechadoCom).toBe(1000);
  });

  it('falta de crédito aparece no fechamento do WebSocket', async () => {
    const m = await aberta();
    m.ws().cair(1011, 'You exceeded your current quota, please check your plan and billing details');
    expect(m.ultimo()).toMatchObject({ fase: 'erro', erro: 'sem_credito' });
  });

  it('o servidor manda o gatilho e a saudação: o cumprimento e a legenda de reserva usam os dele', async () => {
    const m = await aberta({ pedir: async () => ({ ...SESSAO, gatilho_inicio: '[inicio]', saudacao: 'Oi, Matheus Ribeiro. Pode perguntar.' }) });
    expect(m.ws().enviados[1]).toEqual({ clientContent: { turns: [{ role: 'user', parts: [{ text: '[inicio]' }] }], turnComplete: true } });
    await passa(ESPERA_CUMPRIMENTO_MS);
    expect(m.ultimo().palavras.map((p) => p.texto).join(' ')).toBe('Oi, Matheus Ribeiro. Pode perguntar.');
  });

  it('o cumprimento não veio em 3,5 s: a frase aparece só na legenda (a tela nunca fica muda)', async () => {
    const m = await aberta();
    await passa(ESPERA_CUMPRIMENTO_MS);
    expect(m.ultimo().palavras.map((p) => p.texto).join(' ')).toBe('Oi, Matheus. Pode perguntar.');
    expect(m.ultimo().palavras.every((p) => p.dita)).toBe(true);
  });
});

describe('a fala dela', () => {
  it('áudio + legenda + turnComplete numa mensagem: toca, a legenda acende com a fila e volta a ouvir quando a fila esvazia', async () => {
    const m = await aberta();
    m.ws().receber({ serverContent: {
      modelTurn: { parts: [{ inlineData: { mimeType: 'audio/pcm;rate=24000', data: audioB64(4800) } }, { inlineData: { mimeType: 'audio/pcm;rate=24000', data: audioB64(4800) } }] },
      outputTranscription: { text: 'Oi, Matheus. ' },
    } });
    m.ws().receber({ serverContent: { outputTranscription: { text: 'Pode perguntar.' }, turnComplete: true } });
    expect(m.a.tocados.map((x) => x.length)).toEqual([4800, 4800]);
    expect(m.ultimo().fase).toBe('falando');
    expect(m.a.fins).toBe(1);
    // "Oi, Matheus." tem marca 0 (chegou com o 1º áudio); "Pode perguntar." acende quando a fila passar de 9600
    expect(m.ultimo().palavras.map((p) => `${p.texto}${p.dita ? '' : '·'}`).join(' ')).toBe('Oi, Matheus. Pode· perguntar.·');
    m.a.tocador!({ t: 'pos', pos: 9600 });
    expect(m.ultimo().palavras.every((p) => p.dita)).toBe(true);
    // um "vazio" atrasado (antes do fim da fila) não encerra a fala
    m.a.tocador!({ t: 'vazio', pos: 4800 });
    expect(m.ultimo().fase).toBe('falando');
    m.a.tocador!({ t: 'vazio', pos: 9600 });
    expect(m.ultimo().fase).toBe('ouvindo');
    expect(m.ultimo().falaConcluida).toBe('Oi, Matheus. Pode perguntar.');
  });

  it('transcrição ATRASADA (depois do turnComplete) se junta à fala que acabou; a resposta depois da ferramenta começa do zero', async () => {
    const m = await aberta();
    m.ws().receber({ serverContent: { modelTurn: { parts: [{ inlineData: { data: audioB64(4800) } }] }, outputTranscription: { text: 'Hoje você fechou ' } } });
    m.ws().receber({ serverContent: { turnComplete: true } });
    m.a.tocador!({ t: 'vazio', pos: 4800 });
    m.ws().receber({ serverContent: { outputTranscription: { text: '5 clientes.' } } });
    expect(m.ultimo().palavras.map((p) => `${p.texto}${p.dita ? '' : '·'}`).join(' ')).toBe('Hoje você fechou 5 clientes.');
    m.ws().receber({ toolCall: { functionCalls: [{ id: 'fc-1', name: 'ver_fechados', args: { periodo: 'este_mes' } }] } });
    await passa(0);
    expect(m.ultimo().palavras.map((p) => p.texto).join(' ')).toBe('Hoje você fechou 5 clientes.'); // até ela falar de novo
    m.ws().receber({ serverContent: { outputTranscription: { text: 'No mês, 32.' }, modelTurn: { parts: [{ inlineData: { data: audioB64(4800) } }] } } });
    expect(m.ultimo().palavras.map((p) => p.texto).join(' ')).toBe('No mês, 32.');
  });

  it('a voz do cumprimento chegou depois da frase de reserva: substitui, não duplica', async () => {
    const m = await aberta();
    await passa(ESPERA_CUMPRIMENTO_MS);
    m.ws().receber({ serverContent: { modelTurn: { parts: [{ inlineData: { data: audioB64(4800) } }] }, outputTranscription: { text: 'Oi, Matheus. Pode perguntar.' } } });
    expect(m.ultimo().palavras.map((p) => p.texto).join(' ')).toBe('Oi, Matheus. Pode perguntar.');
  });

  it('a transcrição da pergunta chega DEPOIS da fala dela começar: a resposta na tela não some', async () => {
    const m = await aberta();
    m.ws().receber({ serverContent: { modelTurn: { parts: [{ inlineData: { data: audioB64(4800) } }] }, outputTranscription: { text: 'Hoje, 5 clientes.' } } });
    m.ws().receber({ serverContent: { inputTranscription: { text: 'quantos eu fechei hoje' } } });
    expect(m.ultimo().voce).toBe('quantos eu fechei hoje');
    expect(m.ultimo().palavras.map((p) => p.texto).join(' ')).toBe('Hoje, 5 clientes.');
  });

  it('links: são da pergunta da vez (a próxima consulta depois do fim do turno recomeça a lista)', async () => {
    let n = 0;
    const m = await aberta({
      ferramenta: async () => {
        n++;
        return { resultado: { total: 1 }, links: [{ rotulo: `c${n}`, rota: `/whatsapp?conversa=c${n}` }] };
      },
    });
    m.ws().receber({ toolCall: { functionCalls: [{ id: 'a', name: 'clientes_para_resolver', args: {} }] } });
    await passa(0);
    m.ws().receber({ toolCall: { functionCalls: [{ id: 'b', name: 'buscar_cliente', args: { nome: 'Eva' } }] } });
    await passa(0);
    expect(m.ultimo().links.map((l) => l.rotulo)).toEqual(['c1', 'c2']); // a mesma pergunta: junta
    m.ws().receber({ serverContent: { modelTurn: { parts: [{ inlineData: { data: audioB64(2400) } }] }, turnComplete: true } });
    m.a.tocador!({ t: 'vazio', pos: 2400 });
    // a transcrição da pergunta seguinte atrasou: a consulta já começou; os links velhos não se misturam
    m.ws().receber({ toolCall: { functionCalls: [{ id: 'c', name: 'ver_carteira', args: {} }] } });
    await passa(0);
    expect(m.ultimo().links.map((l) => l.rotulo)).toEqual(['c3']);
  });

  it('interrupção: para e esvazia a fila NA HORA, a legenda fica só com o que foi dito', async () => {
    const m = await aberta();
    m.ws().receber({ serverContent: { modelTurn: { parts: [{ inlineData: { data: audioB64(24000) } }] }, outputTranscription: { text: 'Você tem oito ' } } });
    m.ws().receber({ serverContent: { modelTurn: { parts: [{ inlineData: { data: audioB64(24000) } }] }, outputTranscription: { text: 'clientes sem resposta.' } } });
    m.a.tocador!({ t: 'pos', pos: 12000 });
    m.ws().receber({ serverContent: { interrupted: true } });
    expect(m.a.interrupcoes).toBe(1);
    expect(m.ultimo().fase).toBe('ouvindo');
    expect(m.ultimo().palavras.map((p) => p.texto).join(' ')).toBe('Você tem oito');
  });

  it('a pergunta nova (transcrição de entrada) troca a linha cinza e limpa a legenda e os links da anterior', async () => {
    const m = await aberta();
    m.ws().receber({ serverContent: { inputTranscription: { text: 'quantos clientes ' } } });
    m.ws().receber({ serverContent: { inputTranscription: { text: 'eu fechei hoje' } } });
    expect(m.ultimo().voce).toBe('quantos clientes eu fechei hoje');
    m.ws().receber({ serverContent: { modelTurn: { parts: [{ inlineData: { data: audioB64(2400) } }] }, outputTranscription: { text: 'Hoje, 5.' }, turnComplete: true } });
    m.a.tocador!({ t: 'vazio', pos: 2400 });
    m.ws().receber({ serverContent: { interimInputTranscription: { text: 'e ontem' } } });
    expect(m.ultimo().voce).toBe('e ontem');
    expect(m.ultimo().palavras).toEqual([]);
  });
});

describe('ferramentas', () => {
  it('cada chamada vai ao servidor em paralelo e volta UMA toolResponse (id, name, output enxuto); falha = error', async () => {
    const m = await aberta({
      ferramenta: async ({ nome }) => {
        if (nome === 'buscar_cliente') throw new ErroAssistente('ia_indisponivel');
        return {
          resultado: { escopo: 'pessoa', pessoa: { id: 'u', nome: 'Matheus' }, sem_resposta: { total: 2, clientes: [{ conversa_id: 'c1', cliente: 'Eva', esperando_desde: '2026-10-30T09:15:00-03:00' }] } },
          links: [{ rotulo: 'Eva', rota: '/whatsapp?conversa=c1' }],
        };
      },
    });
    m.ws().receber({ toolCall: { functionCalls: [
      { id: 'fc-1', name: 'clientes_para_resolver', args: { limite: 5 } },
      { id: 'fc-2', name: 'buscar_cliente', args: { nome: 'Eva' } },
    ] } });
    expect(m.ultimo().fase).toBe('consultando');
    expect(m.ferramenta).toHaveBeenCalledTimes(2);
    expect(m.ferramenta.mock.calls[0][0]).toMatchObject({ org: ORG, nome: 'clientes_para_resolver', args: { limite: 5 } });
    await passa(0);
    const resp = m.ws().enviados.filter((x) => 'toolResponse' in x);
    expect(resp).toHaveLength(1);
    expect(resp[0]).toEqual({ toolResponse: { functionResponses: [
      { id: 'fc-1', name: 'clientes_para_resolver', response: { output: {
        escopo: 'pessoa', pessoa: { nome: 'Matheus' }, sem_resposta: { total: 2, clientes: [{ cliente: 'Eva', esperando_desde: '30/10/2026 09:15' }] },
      } } },
      { id: 'fc-2', name: 'buscar_cliente', response: { error: 'falha_consulta' } },
    ] } });
    expect(m.ultimo().links).toEqual([{ rotulo: 'Eva', rota: '/whatsapp?conversa=c1' }]);
    expect(m.ultimo().fase).toBe('consultando'); // até a fala dela chegar
    m.ws().receber({ serverContent: { modelTurn: { parts: [{ inlineData: { data: audioB64(2400) } }] } } });
    expect(m.ultimo().fase).toBe('falando');
  });

  it('cancelada (a pessoa falou por cima): aborta o pedido e NÃO responde esse id; tudo cancelado = nada enviado', async () => {
    let sinal: AbortSignal | null = null;
    const m = await aberta({
      ferramenta: ({ signal }) => new Promise((ok, falha) => {
        sinal = signal;
        signal.addEventListener('abort', () => falha(new Error('abortado')));
        setTimeout(() => ok({ resultado: { total: 1 }, links: [] }), 500);
      }),
    });
    m.ws().receber({ toolCall: { functionCalls: [{ id: 'fc-9', name: 'ver_carteira', args: {} }] } });
    m.ws().receber({ toolCallCancellation: { ids: ['fc-9'] } });
    await passa(600);
    expect(sinal!.aborted).toBe(true);
    expect(m.ws().tipos()).not.toContain('toolResponse');
    expect(m.ultimo().fase).toBe('ouvindo');
  });

  it('respondeu e ela não falou nada em 15 s: volta a ouvir (nunca fica preso em "Consultando")', async () => {
    const m = await aberta();
    m.ws().receber({ toolCall: { functionCalls: [{ id: 'fc-1', name: 'ver_carteira', args: {} }] } });
    await passa(0);
    expect(m.ultimo().fase).toBe('consultando');
    await passa(16_000);
    expect(m.ultimo().fase).toBe('ouvindo');
  });

  it('turno encerrado SEM voz depois da resposta (recusada, malformada…): volta a ouvir NA HORA, não em 15 s', async () => {
    const m = await aberta();
    m.ws().receber({ toolCall: { functionCalls: [{ id: 'fc-1', name: 'ver_carteira', args: {} }] } });
    await passa(0);
    expect(m.ws().tipos()).toContain('toolResponse');
    m.ws().receber({ serverContent: { turnComplete: true, turnCompleteReason: 'RESPONSE_REJECTED' } });
    expect(m.ultimo().fase).toBe('ouvindo');
    expect(m.avisos.join(' ')).toContain('RESPONSE_REJECTED');
    // e se a fala vier mesmo assim, ela fala
    m.ws().receber({ serverContent: { modelTurn: { parts: [{ inlineData: { data: audioB64(2400) } }] } } });
    expect(m.ultimo().fase).toBe('falando');
  });

  it('turnComplete com a ferramenta AINDA rodando: continua "Consultando" (a fala vem depois da resposta)', async () => {
    const m = await aberta({
      ferramenta: () => new Promise((ok) => { setTimeout(() => ok({ resultado: { total: 1 }, links: [] }), 800); }),
    });
    m.ws().receber({ toolCall: { functionCalls: [{ id: 'fc-1', name: 'ver_fechados', args: { periodo: 'hoje' } }] } });
    m.ws().receber({ serverContent: { turnComplete: true } });
    expect(m.ultimo().fase).toBe('consultando');
    await passa(900);
    expect(m.ws().tipos()).toContain('toolResponse');
    expect(m.ultimo().fase).toBe('consultando'); // respondeu; agora espera a fala (ou o turnComplete sem voz)
    // uma 2ª consulta zera a marca: o turnComplete dela, com a chamada rodando, não volta a ouvir
    m.ws().receber({ toolCall: { functionCalls: [{ id: 'fc-2', name: 'ver_carteira', args: {} }] } });
    m.ws().receber({ serverContent: { turnComplete: true } });
    expect(m.ultimo().fase).toBe('consultando');
  });

  it('links de várias ferramentas: sem repetir, até 5', () => {
    const l = (i: number) => ({ rotulo: `c${i}`, rota: `/whatsapp?conversa=c${i}` });
    expect(juntarLinks([l(1), l(2)], [l(2), l(3), l(4), l(5), l(6)])).toEqual([l(1), l(2), l(3), l(4), l(5)]);
  });
});

describe('mudo e fim', () => {
  it('mudo: para de mandar áudio e avisa o fim do áudio; desligar o mudo volta a mandar', async () => {
    const m = await aberta();
    m.s.alternarMudo();
    expect(m.ultimo().mudo).toBe(true);
    expect(m.a.mudo).toBe(true);
    expect(ultimoDe(m.ws().enviados)).toEqual({ realtimeInput: { audioStreamEnd: true } });
    const antes = m.ws().enviados.length;
    m.a.captura!(new Float32Array(512));
    expect(m.ws().enviados.length).toBe(antes);
    m.s.alternarMudo();
    m.a.captura!(new Float32Array(512));
    expect(ultimoDe(m.ws().tipos())).toBe('realtimeInput');
    expect(m.ws().enviados.length).toBe(antes + 1);
  });

  it('1 minuto ouvindo sem fala: encerra sozinha (fecha o WebSocket e o microfone); falar adia', async () => {
    const m = await aberta();
    await passa(50_000);
    m.ws().receber({ serverContent: { inputTranscription: { text: 'oi' } } });
    await passa(50_000);
    expect(m.ultimo().fase).toBe('ouvindo');
    await passa(11_000);
    expect(m.ultimo()).toMatchObject({ fase: 'encerrada', fim: 'silencio' });
    expect(m.sockets[0].fechadoCom).toBe(1000);
    expect(m.a.fechado).toBe(true);
  });

  it('teto de tempo do servidor (limite_s) e goAway', async () => {
    const m = await aberta({ pedir: async () => ({ ...SESSAO, limite_s: 90 }) });
    for (let i = 0; i < 8; i++) { await passa(11_000); m.ws().receber({ serverContent: { inputTranscription: { text: 'a' } } }); }
    await passa(4_000);
    expect(m.ultimo()).toMatchObject({ fase: 'encerrada', fim: 'tempo' });
    const g = await aberta();
    g.ws().receber({ goAway: { timeLeft: '10s' } });
    expect(g.ultimo()).toMatchObject({ fase: 'encerrada', fim: 'servidor' });
  });

  it('goAway com ela falando: termina a frase e encerra', async () => {
    const m = await aberta();
    m.ws().receber({ serverContent: { modelTurn: { parts: [{ inlineData: { data: audioB64(2400) } }] } } });
    m.ws().receber({ goAway: { timeLeft: '10s' } });
    expect(m.ultimo().fase).toBe('falando');
    m.ws().receber({ serverContent: { turnComplete: true } });
    m.a.tocador!({ t: 'vazio', pos: 2400 });
    expect(m.ultimo()).toMatchObject({ fase: 'encerrada', fim: 'servidor' });
  });

  it('Encerrar: fecha tudo, fim = null; mensagens atrasadas são ignoradas', async () => {
    const m = await aberta();
    const ws = m.ws();
    m.s.encerrar();
    expect(m.ultimo()).toMatchObject({ fase: 'encerrada', fim: null });
    expect(ws.fechadoCom).toBe(1000);
    expect(m.a.fechado).toBe(true);
    const n = m.estados.length;
    ws.receber({ serverContent: { modelTurn: { parts: [{ inlineData: { data: audioB64(2400) } }] } } });
    m.s.alternarMudo();
    expect(m.estados.length).toBe(n);
    expect(m.a.tocados).toHaveLength(0);
  });

  it('caiu no meio da conversa = "a conexão caiu"; o servidor fechou normal = fim', async () => {
    const m = await aberta();
    m.ws().cair(1006);
    expect(m.ultimo()).toMatchObject({ fase: 'erro', erro: 'queda' });
    const n = await aberta();
    n.ws().cair(1000);
    expect(n.ultimo()).toMatchObject({ fase: 'encerrada', fim: 'servidor' });
  });

  it('bandas para a esfera só com a conversa ativa', async () => {
    const m = montar();
    expect(m.s.bandas(0.016)).toEqual({ g: 0, m: 0, a: 0, entrada: 0 });
    const a = await aberta();
    expect(a.s.bandas(0.016)).toEqual({ g: 0.5, m: 0.4, a: 0.2, entrada: 0.1 });
  });
});
