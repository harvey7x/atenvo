// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ADIAR_MIN, ASSENTAR_MS, CONFERE_ESPERA_DEPOIS_MS, ESPERA_VOZ_MS, EVENTO_LEMBRETES_MUDARAM, INTERVALO_BUSCA_MS, K_MUDARAM, NA_HORA_MS,
  PRE_VOZ_MS, RESERVA_FALA_MS, TRAVA_ESPERA, TRAVA_LEMBRETES, VOZ_TARDIA_MS, podeFalarDeReserva,
  acaoDoArmazenamento, anunciar, avisarLembretesMudaram, chaveBase, criarAgendaLembretes, disputarLideranca, esperaEmAlgumaAba,
  esquecerMarcasDaMemoria, falaDoLembrete,
  horaMarcada, jaFalado, lembretesDemo, lerDemoLembrete, lerRetrato, limparMarcasVelhas, marcarFalado, normalizarLembretes,
  podeAnunciar, precisaConferirEspera, primeiroNomeLembrete, segurarEspera, tamanhoDoTexto, textoDoCartao,
  type ArmazenamentoLike, type AvisoLembrete, type DepsAnuncio, type LembreteDevido, type RetratoLembretes, type SomLembrete,
  type TravasLike,
} from './lembretes';

/* LEMBRETES (dono 30/10 ~23h40: "na hora ela me lembra"): o relógio de cada lembrete, a conferência no servidor
   na hora (cancelado não toca), a fila (o da hora na frente, os atrasados atrás), o atrasado ao abrir, Ok e
   adiar (com e sem servidor, e entre abas), uma aba só fala (Web Locks), a fala sem voz (som curto), a voz
   atrasada, o som travado (fala no primeiro gesto) e os textos. Relógio e rede são falsos: nada sai daqui. */

const MIN = 60_000;
const H = 60 * MIN;
// sábado, 31/10/2026, 12:30 em Brasília (15:30 UTC)
const T0 = Date.UTC(2026, 9, 31, 15, 30);
const iso = (ms: number) => new Date(ms).toISOString();

function armazenamentoFalso(): ArmazenamentoLike & { dados: Map<string, string> } {
  const dados = new Map<string, string>();
  return {
    dados,
    getItem: (k) => dados.get(k) ?? null,
    setItem: (k, v) => { dados.set(k, String(v)); },
    removeItem: (k) => { dados.delete(k); },
    key: (i) => [...dados.keys()][i] ?? null,
    get length() { return dados.size; },
  };
}

const lembrete = (id: string, quando: number, texto = 'ligar para o João', status: LembreteDevido['status'] = 'pendente'): LembreteDevido =>
  ({ id, texto, quando: iso(quando), status });

type Resposta = LembreteDevido[] | RetratoLembretes;
type Fonte = Resposta | (() => Resposta | Promise<Resposta>);

function montar(fonte: Fonte, armazenamento: ArmazenamentoLike | null = armazenamentoFalso()) {
  const buscar = vi.fn(async () => (typeof fonte === 'function' ? fonte() : fonte));
  const confirmar = vi.fn(async (_id: string) => undefined);
  const adiar = vi.fn(async (_id: string, _min: number) => undefined);
  const preparados: string[] = [];
  const avisos: string[] = [];
  const ag = criarAgendaLembretes({
    agora: () => Date.now(),
    buscar, confirmar, adiar,
    relogio: { definir: (fn, ms) => setTimeout(fn, ms), limpar: (h) => clearTimeout(h as ReturnType<typeof setTimeout>) },
    armazenamento,
    aoMudar: () => undefined,
    aoPreparar: (i) => preparados.push(i.id),
    aviso: (m) => avisos.push(m),
  });
  return { ag, buscar, confirmar, adiar, preparados, avisos, armazenamento, ids: () => ag.fila().map((a) => a.id) };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  esquecerMarcasDaMemoria();
});
afterEach(() => {
  vi.useRealTimers();
});

/* ================================================================== agendamento */

describe('agenda: o relógio de cada lembrete', () => {
  it('daqui a 30 min: pede a voz 2 min antes e, na hora, confere no servidor e o aviso abre na frente', async () => {
    const m = montar([lembrete('a', T0 + 30 * MIN)]);
    m.ag.iniciar();
    await vi.advanceTimersByTimeAsync(0);
    expect(m.buscar).toHaveBeenCalledTimes(1);
    expect(m.ids()).toEqual([]);
    await vi.advanceTimersByTimeAsync(30 * MIN - PRE_VOZ_MS - 1_000);
    expect(m.preparados).toEqual([]);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(m.preparados).toEqual(['a']);
    const antes = m.buscar.mock.calls.length;
    await vi.advanceTimersByTimeAsync(PRE_VOZ_MS);
    expect(m.buscar.mock.calls.length).toBeGreaterThan(antes); // conferiu na hora
    expect(m.ag.fila()).toEqual([expect.objectContaining({ id: 'a', chave: chaveBase('a', iso(T0 + 30 * MIN)), atrasado: false })]);
    m.ag.parar();
  });

  it('cancelado (por voz) antes da hora: na hora o servidor já não devolve e nada abre', async () => {
    let lista = [lembrete('a', T0 + 10 * MIN)];
    const m = montar(() => lista);
    m.ag.iniciar();
    await vi.advanceTimersByTimeAsync(0);
    lista = [];
    await vi.advanceTimersByTimeAsync(10 * MIN + 1_000);
    expect(m.ids()).toEqual([]);
    m.ag.parar();
  });

  it('sem rede na hora: abre com o último retrato (melhor lembrar do que calar)', async () => {
    let falhar = false;
    const m = montar(() => {
      if (falhar) throw new Error('Failed to fetch');
      return [lembrete('a', T0 + 5 * MIN)];
    });
    m.ag.iniciar();
    await vi.advanceTimersByTimeAsync(0);
    falhar = true;
    await vi.advanceTimersByTimeAsync(5 * MIN);
    expect(m.ids()).toEqual(['a']);
    expect(m.avisos).toEqual(['lembretes: Failed to fetch']); // avisa uma vez, não a cada busca
    m.ag.parar();
  });

  it('a mais de 24 h: sem relógio; quando entra na janela, a busca de 2 em 2 min arma e ele abre na hora', async () => {
    const m = montar([lembrete('a', T0 + 25 * H)]);
    m.ag.iniciar();
    await vi.advanceTimersByTimeAsync(0);
    expect(m.preparados).toEqual([]);
    await vi.advanceTimersByTimeAsync(25 * H - MIN);
    expect(m.ids()).toEqual([]);
    expect(m.preparados).toEqual(['a']);
    await vi.advanceTimersByTimeAsync(MIN);
    expect(m.ids()).toEqual(['a']);
    m.ag.parar();
  });

  it('busca a cada 2 min; sem resposta do servidor, espera mais (2 → 4 → 8 min)', async () => {
    let falhar = false;
    const m = montar(() => { if (falhar) throw new Error('503'); return []; });
    m.ag.iniciar();
    await vi.advanceTimersByTimeAsync(0);
    expect(m.buscar).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(INTERVALO_BUSCA_MS);
    expect(m.buscar).toHaveBeenCalledTimes(2);
    falhar = true;
    await vi.advanceTimersByTimeAsync(INTERVALO_BUSCA_MS);
    expect(m.buscar).toHaveBeenCalledTimes(3); // falhou
    await vi.advanceTimersByTimeAsync(INTERVALO_BUSCA_MS);
    expect(m.buscar).toHaveBeenCalledTimes(3); // agora espera 4 min
    await vi.advanceTimersByTimeAsync(INTERVALO_BUSCA_MS);
    expect(m.buscar).toHaveBeenCalledTimes(4);
    falhar = false;
    await vi.advanceTimersByTimeAsync(8 * MIN);
    expect(m.buscar).toHaveBeenCalledTimes(5); // voltou: de novo a cada 2 min
    await vi.advanceTimersByTimeAsync(INTERVALO_BUSCA_MS);
    expect(m.buscar).toHaveBeenCalledTimes(6);
    m.ag.parar();
  });

  it('o relógio do notebook 5 min atrasado: avisa na hora do SERVIDOR (o "agora" da resposta)', async () => {
    vi.setSystemTime(T0 - 5 * MIN); // o notebook acha que são 12:25; o servidor diz 12:30
    const m = montar(() => ({ lembretes: [lembrete('a', T0 + 10 * MIN)], desvioMs: 5 * MIN }));
    m.ag.iniciar();
    await vi.advanceTimersByTimeAsync(10 * MIN - 1_000);
    expect(m.ids()).toEqual([]);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(m.ids()).toEqual(['a']);
    expect(m.ag.fila()[0].atrasado).toBe(false);
    m.ag.parar();
  });

  it('parar: nenhum relógio sobra', async () => {
    const m = montar([lembrete('a', T0 + 30 * MIN), lembrete('b', T0 + 2 * H)]);
    m.ag.iniciar();
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    m.ag.parar();
    expect(vi.getTimerCount()).toBe(0);
  });
});

/* ================================================================== fila */

describe('fila: vários lembretes', () => {
  it('dois na mesma hora: os dois na fila; Ok no da frente mostra o próximo', async () => {
    const m = montar([lembrete('a', T0 + MIN, 'ligar para o João'), lembrete('b', T0 + MIN, 'mandar o contrato')]);
    m.ag.iniciar();
    await vi.advanceTimersByTimeAsync(MIN);
    expect(m.ag.fila()).toHaveLength(2);
    const [frente, segundo] = m.ag.fila();
    expect(m.ag.resolver(frente.chave, 'ok')).toBe(true);
    expect(m.ag.fila().map((a) => a.chave)).toEqual([segundo.chave]);
    m.ag.parar();
  });

  it('o que chega na hora vai para a frente; os atrasados entram atrás, do mais antigo ao mais novo', async () => {
    const m = montar([
      lembrete('maria', T0 - 35 * MIN, 'contrato da Maria', 'avisado'),
      lembrete('joao', T0, 'ligar para o João', 'avisado'),
      lembrete('seb', T0 - 3 * H, 'documentos do Sebastião', 'avisado'),
      lembrete('novo', T0 + 5 * MIN, 'reunião'),
    ]);
    m.ag.iniciar();
    await vi.advanceTimersByTimeAsync(0);
    expect(m.ids()).toEqual(['joao', 'seb', 'maria']);
    expect(m.ag.fila().map((a) => a.atrasado)).toEqual([false, true, true]);
    await vi.advanceTimersByTimeAsync(5 * MIN);
    expect(m.ids()).toEqual(['novo', 'joao', 'seb', 'maria']);
    m.ag.parar();
  });

  it('a busca de 2 em 2 min não reordena nem duplica o que já está na tela', async () => {
    const m = montar([lembrete('a', T0 - 10 * MIN, 'a', 'avisado'), lembrete('b', T0 - 5 * MIN, 'b', 'avisado')]);
    m.ag.iniciar();
    await vi.advanceTimersByTimeAsync(0);
    const antes = m.ag.fila();
    await vi.advanceTimersByTimeAsync(3 * INTERVALO_BUSCA_MS);
    expect(m.ag.fila()).toBe(antes);
    m.ag.parar();
  });
});

/* ================================================================== atrasado */

describe('atrasado: o Atenvo fechado na hora', () => {
  it('avisado há 3 h sem confirmação aparece ao abrir (atrasado); o de 13 h atrás não', async () => {
    const m = montar([lembrete('a', T0 - 3 * H, 'x', 'avisado'), lembrete('b', T0 - 13 * H, 'y', 'avisado')]);
    m.ag.iniciar();
    await vi.advanceTimersByTimeAsync(0);
    expect(m.ag.fila()).toEqual([expect.objectContaining({ id: 'a', atrasado: true })]);
    m.ag.parar();
  });

  it('até 2 min depois da hora ainda é "na hora" (vai para a frente e fala)', async () => {
    const m = montar([lembrete('a', T0 - NA_HORA_MS + 1_000, 'x', 'avisado')]);
    m.ag.iniciar();
    await vi.advanceTimersByTimeAsync(0);
    expect(m.ag.fila()[0].atrasado).toBe(false);
    m.ag.parar();
  });

  it('o notebook dormiu na hora: ao acordar (relógio atrasado), a conferência local já abre', async () => {
    const m = montar([lembrete('a', T0 + 10 * MIN)]);
    m.ag.iniciar();
    await vi.advanceTimersByTimeAsync(0);
    // o relógio do sistema pula 1 h sem os timers rodarem (tampa fechada)
    vi.setSystemTime(T0 + H);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(m.ag.fila()).toEqual([expect.objectContaining({ id: 'a', atrasado: true })]);
    m.ag.parar();
  });

  it('na tela há quase 12 h: passou de 12 h, sai sozinho', async () => {
    const m = montar([lembrete('a', T0 - 12 * H + MIN, 'x', 'avisado')]);
    m.ag.iniciar();
    await vi.advanceTimersByTimeAsync(0);
    expect(m.ids()).toEqual(['a']);
    await vi.advanceTimersByTimeAsync(2 * MIN);
    expect(m.ids()).toEqual([]);
    m.ag.parar();
  });
});

/* ================================================================== Ok e adiar */

describe('Ok e "Lembrar em 10 min"', () => {
  it('Ok: sai da fila, confirma no servidor e não volta mesmo que o servidor ainda o devolva', async () => {
    const m = montar([lembrete('a', T0, 'x', 'avisado')]);
    m.ag.iniciar();
    await vi.advanceTimersByTimeAsync(0);
    m.ag.resolver(m.ag.fila()[0].chave, 'ok');
    expect(m.ids()).toEqual([]);
    await vi.advanceTimersByTimeAsync(0);
    expect(m.confirmar).toHaveBeenCalledWith('a');
    await vi.advanceTimersByTimeAsync(3 * INTERVALO_BUSCA_MS);
    expect(m.ids()).toEqual([]);
    m.ag.parar();
  });

  it('Ok sem rede: tenta de novo (agora, +3 s, +15 s) e para', async () => {
    const m = montar([lembrete('a', T0, 'x', 'avisado')]);
    m.confirmar.mockRejectedValue(new Error('Failed to fetch'));
    m.ag.iniciar();
    await vi.advanceTimersByTimeAsync(0);
    m.ag.resolver(m.ag.fila()[0].chave, 'ok');
    await vi.advanceTimersByTimeAsync(20_000);
    expect(m.confirmar).toHaveBeenCalledTimes(3);
    expect(m.avisos.some((a) => a.includes('o servidor não guardou'))).toBe(true);
    await vi.advanceTimersByTimeAsync(H);
    expect(m.confirmar).toHaveBeenCalledTimes(3);
    expect(m.ids()).toEqual([]);
    m.ag.parar();
  });

  it('adiar: lembrete_adiar(id, 10); o quando novo do servidor vira o relógio e volta como OUTRA ocorrência (fala de novo)', async () => {
    let lista = [lembrete('a', T0, 'x', 'avisado')];
    const m = montar(() => lista);
    m.adiar.mockImplementation(async () => { lista = [lembrete('a', Date.now() + ADIAR_MIN * MIN, 'x', 'pendente')]; });
    m.ag.iniciar();
    await vi.advanceTimersByTimeAsync(0);
    const primeira = m.ag.fila()[0].chave;
    m.ag.resolver(primeira, 'adiar');
    expect(m.ids()).toEqual([]);
    await vi.advanceTimersByTimeAsync(0);
    expect(m.adiar).toHaveBeenCalledWith('a', 10);
    await vi.advanceTimersByTimeAsync(ADIAR_MIN * MIN - 1_000);
    expect(m.ids()).toEqual([]);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(m.ids()).toEqual(['a']);
    expect(m.ag.fila()[0].chave).not.toBe(primeira);
    expect(m.ag.fila()[0].chave).toBe(chaveBase('a', iso(T0 + ADIAR_MIN * MIN)));
    m.ag.parar();
  });

  it('adiar sem servidor: volta sozinho em 10 min (a tela segura o adiamento)', async () => {
    const m = montar([lembrete('a', T0, 'x', 'avisado')]);
    m.adiar.mockRejectedValue(new Error('Failed to fetch'));
    m.ag.iniciar();
    await vi.advanceTimersByTimeAsync(0);
    const primeira = m.ag.fila()[0].chave;
    m.ag.resolver(primeira, 'adiar');
    await vi.advanceTimersByTimeAsync(ADIAR_MIN * MIN - 1_000);
    expect(m.ids()).toEqual([]);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(m.ids()).toEqual(['a']);
    expect(m.ag.fila()[0].chave).toBe(`${primeira}~${T0 + ADIAR_MIN * MIN}`);
    m.ag.parar();
  });

  it('Ok em outra aba (o mesmo localStorage): o evento storage tira o aviso desta', async () => {
    const compartilhado = armazenamentoFalso();
    const lista = [lembrete('a', T0, 'x', 'avisado')];
    const aba1 = montar(lista, compartilhado);
    const aba2 = montar(lista, compartilhado);
    aba1.ag.iniciar();
    aba2.ag.iniciar();
    await vi.advanceTimersByTimeAsync(0);
    expect(aba2.ids()).toEqual(['a']);
    aba1.ag.resolver(aba1.ag.fila()[0].chave, 'ok');
    const chaveGravada = [...compartilhado.dados.keys()].find((k) => k.startsWith('atenvo-lmb:r:'))!;
    aba2.ag.aoArmazenamento(chaveGravada);
    expect(aba2.ids()).toEqual([]);
    await vi.advanceTimersByTimeAsync(0);
    expect(aba1.confirmar).toHaveBeenCalledTimes(1);
    expect(aba2.confirmar).not.toHaveBeenCalled(); // só a aba do clique fala com o servidor
    aba1.ag.parar();
    aba2.ag.parar();
  });

  it('sem localStorage (aba anônima bloqueada): tudo funciona na memória da aba', async () => {
    const m = montar([lembrete('a', T0, 'x', 'avisado')], null);
    m.ag.iniciar();
    await vi.advanceTimersByTimeAsync(0);
    m.ag.resolver(m.ag.fila()[0].chave, 'ok');
    await vi.advanceTimersByTimeAsync(INTERVALO_BUSCA_MS);
    expect(m.ids()).toEqual([]);
    m.ag.parar();
  });

  it('a ocorrência que já saiu: resolver de novo não faz nada', async () => {
    const m = montar([lembrete('a', T0, 'x', 'avisado')]);
    m.ag.iniciar();
    await vi.advanceTimersByTimeAsync(0);
    const c = m.ag.fila()[0].chave;
    expect(m.ag.resolver(c, 'ok')).toBe(true);
    expect(m.ag.resolver(c, 'ok')).toBe(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(m.confirmar).toHaveBeenCalledTimes(1);
    m.ag.parar();
  });

  it('demo: os simulados entram na fila e nunca vão ao servidor', async () => {
    const m = montar([]);
    m.ag.iniciar();
    await vi.advanceTimersByTimeAsync(0);
    m.ag.injetar(lembretesDemo('fila', Date.now()));
    expect(m.ids()).toEqual(['demo-lembrete-joao', 'demo-lembrete-sebastiao', 'demo-lembrete-maria']);
    await vi.advanceTimersByTimeAsync(INTERVALO_BUSCA_MS); // a busca (vazia) não apaga os simulados
    expect(m.ids()).toHaveLength(3);
    m.ag.resolver(m.ag.fila()[0].chave, 'ok');
    m.ag.resolver(m.ag.fila()[0].chave, 'adiar');
    await vi.advanceTimersByTimeAsync(0);
    expect(m.confirmar).not.toHaveBeenCalled();
    expect(m.adiar).not.toHaveBeenCalled();
    expect(m.ids()).toEqual(['demo-lembrete-maria']);
    await vi.advanceTimersByTimeAsync(ADIAR_MIN * MIN);
    expect(m.ids()).toEqual(['demo-lembrete-sebastiao', 'demo-lembrete-maria']); // o adiado voltou, na hora
    m.ag.parar();
  });
});

/* ================================================================== uma aba só fala */

/** O Web Locks do navegador: exclusivo por nome, fila de pedidos, desistência pelo signal. */
function travasFalsas(): TravasLike {
  type Pedido = { cb: (t: unknown) => unknown; resolve: (v: unknown) => void; reject: (e: unknown) => void };
  const filas = new Map<string, Pedido[]>();
  const ocupadas = new Set<string>();
  const proxima = (nome: string) => {
    if (ocupadas.has(nome)) return;
    const pedido = filas.get(nome)?.shift();
    if (!pedido) return;
    ocupadas.add(nome);
    Promise.resolve().then(() => pedido.cb({ name: nome })).then(
      (v) => { ocupadas.delete(nome); pedido.resolve(v); proxima(nome); },
      (e) => { ocupadas.delete(nome); pedido.reject(e); proxima(nome); },
    );
  };
  return {
    request(nome, opcoes, cb) {
      return new Promise((resolve, reject) => {
        const pedido: Pedido = { cb, resolve, reject };
        filas.set(nome, [...(filas.get(nome) ?? []), pedido]);
        opcoes.signal?.addEventListener('abort', () => {
          const f = filas.get(nome) ?? [];
          const i = f.indexOf(pedido);
          if (i >= 0) { f.splice(i, 1); reject(new DOMException('desistiu', 'AbortError')); }
        });
        proxima(nome);
      });
    },
  };
}

describe('uma aba só fala (Web Locks)', () => {
  it('duas abas: a primeira fica com a trava; fechou, a segunda assume', async () => {
    const travas = travasFalsas();
    const estados: Array<[string, boolean]> = [];
    const sair1 = disputarLideranca(travas, (l) => estados.push(['aba1', l]));
    const sair2 = disputarLideranca(travas, (l) => estados.push(['aba2', l]));
    await vi.advanceTimersByTimeAsync(0);
    expect(estados).toEqual([['aba1', true]]);
    sair1();
    await vi.advanceTimersByTimeAsync(0);
    expect(estados).toEqual([['aba1', true], ['aba1', false], ['aba2', true]]);
    sair2();
    await vi.advanceTimersByTimeAsync(0);
    expect(estados[estados.length - 1]).toEqual(['aba2', false]);
  });

  it('a aba que sai antes de ganhar a trava desiste sem virar dona', async () => {
    const travas = travasFalsas();
    const estados: boolean[] = [];
    const sair1 = disputarLideranca(travas, () => undefined);
    const sair2 = disputarLideranca(travas, (l) => estados.push(l));
    sair2();
    sair1();
    await vi.advanceTimersByTimeAsync(0);
    expect(estados).toEqual([]);
  });

  it('navegador sem Web Locks: a aba fala sozinha', () => {
    const estados: boolean[] = [];
    const sair = disputarLideranca(null, (l) => estados.push(l));
    expect(estados).toEqual([true]);
    sair();
    expect(estados).toEqual([true, false]);
  });

  it('trava recusada pelo navegador (erro que não é desistência): a aba fala sozinha', async () => {
    const estados: boolean[] = [];
    const travas: TravasLike = { request: () => Promise.reject(new DOMException('negado', 'SecurityError')) };
    disputarLideranca(travas, (l) => estados.push(l));
    await vi.advanceTimersByTimeAsync(0);
    expect(estados).toEqual([true]);
  });

  it('fala só a dona da trava, sem nada por cima, e uma vez por ocorrência (a marca vale entre abas)', () => {
    const compartilhado = armazenamentoFalso();
    const aviso = { chave: 'a@x', id: 'a', texto: 't', quando: 'x', quandoMs: 0, atrasado: false, demo: false } satisfies AvisoLembrete;
    expect(podeAnunciar({ lider: true, oculto: false, aviso, armazenamento: compartilhado })).toBe(true);
    expect(podeAnunciar({ lider: false, oculto: false, aviso, armazenamento: compartilhado })).toBe(false);
    expect(podeAnunciar({ lider: true, oculto: true, aviso, armazenamento: compartilhado })).toBe(false);
    expect(podeAnunciar({ lider: true, oculto: false, aviso: null, armazenamento: compartilhado })).toBe(false);
    marcarFalado(compartilhado, 'a@x');
    expect(jaFalado(compartilhado, 'a@x')).toBe(true);
    expect(podeAnunciar({ lider: true, oculto: false, aviso, armazenamento: compartilhado })).toBe(false);
    // o adiado volta como outra ocorrência: fala de novo
    expect(podeAnunciar({ lider: true, oculto: false, aviso: { ...aviso, chave: 'a@y' }, armazenamento: compartilhado })).toBe(true);
  });
});

/** O Web Locks no modo COMPARTILHADO, com a consulta (query): várias abas seguram a mesma trava ao mesmo tempo. */
function travasCompartilhadas(): TravasLike {
  const seguradas = new Map<string, number>();
  const muda = (nome: string, d: number) => seguradas.set(nome, Math.max(0, (seguradas.get(nome) ?? 0) + d));
  return {
    request(nome, opcoes, cb) {
      expect(opcoes.mode).toBe('shared');
      return new Promise((resolve, reject) => {
        if (opcoes.signal?.aborted) { reject(new DOMException('desistiu', 'AbortError')); return; }
        muda(nome, 1);
        Promise.resolve().then(() => cb({ name: nome, mode: 'shared' })).then(
          (v) => { muda(nome, -1); resolve(v); },
          (e) => { muda(nome, -1); reject(e); },
        );
      });
    },
    async query() {
      return { held: [...seguradas.entries()].flatMap(([name, n]) => Array.from({ length: n }, () => ({ name }))) };
    },
  };
}

describe('a aba ocupada faz a que fala esperar (conversa de voz ou bom dia em OUTRA aba)', () => {
  it('a aba ocupada segura a espera e a que fala enxerga; duas ocupadas ao mesmo tempo; soltaram as duas, livre', async () => {
    const travas = travasCompartilhadas();
    expect(await esperaEmAlgumaAba(travas)).toBe(false);
    const soltarA = segurarEspera(travas);
    const soltarB = segurarEspera(travas);
    await vi.advanceTimersByTimeAsync(0);
    expect(await esperaEmAlgumaAba(travas)).toBe(true);
    soltarA();
    await vi.advanceTimersByTimeAsync(0);
    expect(await esperaEmAlgumaAba(travas)).toBe(true); // a outra ainda está ocupada
    soltarB();
    await vi.advanceTimersByTimeAsync(0);
    expect(await esperaEmAlgumaAba(travas)).toBe(false);
    // a trava de espera é outra que a da liderança: segurar a da liderança não faz ninguém esperar
    expect(TRAVA_ESPERA).not.toBe(TRAVA_LEMBRETES);
  });

  it('soltou antes de a trava chegar: não fica presa', async () => {
    const travas = travasCompartilhadas();
    segurarEspera(travas)();
    await vi.advanceTimersByTimeAsync(0);
    expect(await esperaEmAlgumaAba(travas)).toBe(false);
  });

  it('sem Web Locks, sem a consulta, consulta que falha ou trava recusada: nunca segura a fala nem quebra', async () => {
    expect(await esperaEmAlgumaAba(null)).toBe(false);
    expect(await esperaEmAlgumaAba({ request: () => Promise.resolve() })).toBe(false);
    expect(await esperaEmAlgumaAba({ request: () => Promise.resolve(), query: () => Promise.reject(new Error('x')) })).toBe(false);
    expect(await esperaEmAlgumaAba({ request: () => Promise.resolve(), query: async () => undefined })).toBe(false);
    expect(() => segurarEspera(null)()).not.toThrow();
    expect(() => segurarEspera({ request: () => { throw new Error('negado'); } })()).not.toThrow();
    const recusa: TravasLike = { request: () => Promise.reject(new DOMException('negado', 'SecurityError')) };
    const soltar = segurarEspera(recusa);
    await vi.advanceTimersByTimeAsync(0);
    expect(() => soltar()).not.toThrow();
  });

  it('a que fala confere enquanto não falou, falando e até 45 s depois de começar; falada há mais tempo e calada, não', () => {
    const a = armazenamentoFalso();
    expect(precisaConferirEspera(a, 'a@x', false)).toBe(true); // ainda não falou
    marcarFalado(a, 'a@x', T0);
    expect(precisaConferirEspera(a, 'a@x', false, T0 + 10_000)).toBe(true); // a voz atrasada ainda pode tocar
    expect(precisaConferirEspera(a, 'a@x', false, T0 + CONFERE_ESPERA_DEPOIS_MS + 1)).toBe(false);
    expect(precisaConferirEspera(a, 'a@x', true, T0 + 10 * MIN)).toBe(true); // falando
    expect(CONFERE_ESPERA_DEPOIS_MS).toBeGreaterThan(ESPERA_VOZ_MS + VOZ_TARDIA_MS);
  });
});

/* ================================================================== a fala (voz, som curto, gesto, notificação) */

function somFalso(liberado = true) {
  const ordem: string[] = [];
  let lib = liberado;
  const som: SomLembrete = {
    liberar: vi.fn(async () => { ordem.push('liberar'); return lib; }),
    tocarVoz: vi.fn(async () => { ordem.push('voz'); return true; }),
    tocarSino: vi.fn(async () => { ordem.push('sino'); return true; }),
    parar: vi.fn(),
    fechar: vi.fn(),
  };
  return { som, ordem, liberar: (v: boolean) => { lib = v; } };
}

const AVISO: AvisoLembrete = { chave: 'a@q', id: 'a', texto: 'ligar para o João', quando: 'q', quandoMs: T0, atrasado: false, demo: false };

function depsAnuncio(o: Partial<DepsAnuncio> & { som: SomLembrete }) {
  const notificacoes: boolean[] = [];
  const fechou = vi.fn();
  let gesto: (() => void) | null = null;
  const desarmou = vi.fn();
  const d: DepsAnuncio = {
    obterVoz: async () => null,
    esperar: (ms) => new Promise<void>((r) => { setTimeout(r, ms); }),
    emSegundoPlano: () => false,
    notificar: (_a, silenciosa) => { notificacoes.push(silenciosa); return fechou; },
    armarGesto: (fn) => { gesto = fn; return desarmou; },
    marcarFalado: vi.fn(),
    aoFalar: vi.fn(),
    ...o,
  };
  return { d, notificacoes, fechou, desarmou, gesto: () => gesto };
}

describe('a fala na hora', () => {
  it('com a voz pronta: ela fala (sem o som curto) e a ocorrência fica marcada', async () => {
    const s = somFalso();
    const wav = new ArrayBuffer(8);
    const x = depsAnuncio({ som: s.som, obterVoz: async () => wav });
    anunciar(AVISO, 'Matheus, seu lembrete: ligar para o João.', x.d);
    await vi.advanceTimersByTimeAsync(0);
    expect(s.som.tocarVoz).toHaveBeenCalledWith(wav, undefined);
    expect(s.som.tocarSino).not.toHaveBeenCalled();
    expect(x.d.marcarFalado).toHaveBeenCalledTimes(1);
    expect(x.d.aoFalar).toHaveBeenNthCalledWith(1, true);
    expect(x.d.aoFalar).toHaveBeenLastCalledWith(false);
    expect(s.som.fechar).toHaveBeenCalled(); // o som fecha no fim (nada fica preso)
  });

  it('sem voz (limite do dia, crédito, rede): o som curto, uma vez', async () => {
    const s = somFalso();
    const x = depsAnuncio({ som: s.som, obterVoz: async () => null });
    anunciar(AVISO, 'f', x.d);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(s.ordem).toEqual(['liberar', 'sino']);
    expect(x.d.marcarFalado).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(s.som.tocarSino).toHaveBeenCalledTimes(1);
  });

  it('a pedida da voz quebrou (erro): também cai no som curto', async () => {
    const s = somFalso();
    const x = depsAnuncio({ som: s.som, obterVoz: async () => { throw new Error('rede'); } });
    anunciar(AVISO, 'f', x.d);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(s.ordem).toEqual(['liberar', 'sino']);
  });

  it('a voz atrasou: o som curto em 4 s e, chegando logo depois, ela fala', async () => {
    const s = somFalso();
    const wav = new ArrayBuffer(8);
    const x = depsAnuncio({ som: s.som, obterVoz: () => new Promise((r) => { setTimeout(() => r(wav), 7_000); }) });
    anunciar(AVISO, 'f', x.d);
    await vi.advanceTimersByTimeAsync(ESPERA_VOZ_MS - 100);
    expect(s.ordem).toEqual(['liberar']);
    await vi.advanceTimersByTimeAsync(200);
    expect(s.ordem).toEqual(['liberar', 'sino']);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(s.ordem).toEqual(['liberar', 'sino', 'voz']);
  });

  it('a voz atrasou demais (mais de 25 s depois do som): fica só o som', async () => {
    const s = somFalso();
    const x = depsAnuncio({ som: s.som, obterVoz: () => new Promise((r) => { setTimeout(() => r(new ArrayBuffer(8)), 40_000); }) });
    anunciar(AVISO, 'f', x.d);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(s.ordem).toEqual(['liberar', 'sino']);
  });

  it('a voz não tocou (WAV ruim): cai no som curto', async () => {
    const s = somFalso();
    vi.mocked(s.som.tocarVoz).mockResolvedValue(false);
    const x = depsAnuncio({ som: s.som, obterVoz: async () => new ArrayBuffer(8) });
    anunciar(AVISO, 'f', x.d);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(s.som.tocarSino).toHaveBeenCalledTimes(1);
  });

  it('som travado (nenhum clique na página ainda): nada toca; no primeiro gesto da pessoa, ela fala', async () => {
    const s = somFalso(false);
    const wav = new ArrayBuffer(8);
    const x = depsAnuncio({ som: s.som, obterVoz: async () => wav });
    anunciar(AVISO, 'f', x.d);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(s.som.tocarVoz).not.toHaveBeenCalled();
    expect(s.som.tocarSino).not.toHaveBeenCalled();
    expect(x.d.marcarFalado).not.toHaveBeenCalled(); // não falou: outra abertura ainda pode falar
    expect(x.gesto()).not.toBeNull();
    s.liberar(true);
    x.gesto()!();
    await vi.advanceTimersByTimeAsync(0);
    expect(s.som.tocarVoz).toHaveBeenCalledWith(wav, undefined);
    expect(x.d.marcarFalado).toHaveBeenCalledTimes(1);
  });

  it('som travado e OUTRA aba já falou (a reserva à vista): o gesto que chega depois não repete a fala', async () => {
    const s = somFalso(false);
    const wav = new ArrayBuffer(8);
    let falado = false;
    const x = depsAnuncio({ som: s.som, obterVoz: async () => wav, jaFalado: () => falado });
    anunciar(AVISO, 'f', x.d);
    await vi.advanceTimersByTimeAsync(10_000);
    falado = true; // a aba à vista falou no lugar desta
    s.liberar(true);
    x.gesto()!();
    await vi.advanceTimersByTimeAsync(0);
    expect(s.som.tocarVoz).not.toHaveBeenCalled();
    expect(x.d.marcarFalado).not.toHaveBeenCalled();
  });

  it('reserva: só quem NÃO é a dona da trava, à vista, com clique, sem nada por cima e se ninguém falou', () => {
    const a = armazenamentoFalso();
    const base = { lider: false, oculto: false, aviso: AVISO, armazenamento: a, aVista: true, ativada: true };
    expect(podeFalarDeReserva(base)).toBe(true);
    expect(podeFalarDeReserva({ ...base, lider: true })).toBe(false); // a dona fala pelo caminho dela
    expect(podeFalarDeReserva({ ...base, oculto: true })).toBe(false); // bom dia / conversa de voz (aqui ou em outra aba)
    expect(podeFalarDeReserva({ ...base, aVista: false })).toBe(false); // a pessoa não está nesta aba
    expect(podeFalarDeReserva({ ...base, ativada: false })).toBe(false); // sem clique: o navegador não deixa tocar
    expect(podeFalarDeReserva({ ...base, aviso: null })).toBe(false);
    marcarFalado(a, AVISO.chave);
    expect(podeFalarDeReserva(base)).toBe(false); // a dona já falou
    // a dona fala em ≤ ~5 s (assentar 0,6 s + liberar o som + 4 s esperando a voz → o som curto; em segundo plano
    // cada relógio atrasa até ~1 s): a reserva vem bem depois
    expect(RESERVA_FALA_MS).toBeGreaterThanOrEqual(ASSENTAR_MS + 500 + ESPERA_VOZ_MS + 3 * 1_000 + 1_000);
  });

  it('aba em segundo plano com a permissão dada: notificação do sistema (silenciosa quando ela mesma toca o som)', async () => {
    const s = somFalso(true);
    const x = depsAnuncio({ som: s.som, emSegundoPlano: () => true });
    anunciar(AVISO, 'f', x.d);
    await vi.advanceTimersByTimeAsync(0);
    expect(x.notificacoes).toEqual([true]);
    const t = somFalso(false);
    const y = depsAnuncio({ som: t.som, emSegundoPlano: () => true });
    anunciar(AVISO, 'f', y.d);
    await vi.advanceTimersByTimeAsync(0);
    expect(y.notificacoes).toEqual([false]); // som travado: o sistema toca o dele
  });

  it('aba à vista: sem notificação do sistema (o cartão e a voz bastam)', async () => {
    const s = somFalso(true);
    const x = depsAnuncio({ som: s.som, emSegundoPlano: () => false });
    anunciar(AVISO, 'f', x.d);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(x.notificacoes).toEqual([]);
  });

  it('Ok no meio da fala: para o som, fecha a notificação e desarma o gesto', async () => {
    const s = somFalso(false);
    const x = depsAnuncio({ som: s.som, emSegundoPlano: () => true });
    const cancelar = anunciar(AVISO, 'f', x.d);
    await vi.advanceTimersByTimeAsync(0);
    cancelar();
    expect(s.som.fechar).toHaveBeenCalled();
    expect(x.fechou).toHaveBeenCalledTimes(1);
    expect(x.desarmou).toHaveBeenCalledTimes(1);
    cancelar(); // de novo: nada
    expect(x.fechou).toHaveBeenCalledTimes(1);
  });

  it('cancelado antes de o som liberar: nada toca nem marca', async () => {
    const s = somFalso(true);
    const x = depsAnuncio({ som: s.som, obterVoz: async () => new ArrayBuffer(8) });
    const cancelar = anunciar(AVISO, 'f', x.d);
    cancelar();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(s.som.tocarVoz).not.toHaveBeenCalled();
    expect(s.som.tocarSino).not.toHaveBeenCalled();
    expect(x.d.marcarFalado).not.toHaveBeenCalled();
  });
});

/* ================================================================== textos e dados */

describe('textos', () => {
  it('a fala: "{primeiro nome}, seu lembrete: {texto}."', () => {
    expect(falaDoLembrete('Matheus Ribeiro', 'ligar para o João')).toBe('Matheus, seu lembrete: ligar para o João.');
    expect(falaDoLembrete('Matheus', 'ligar para o João!')).toBe('Matheus, seu lembrete: ligar para o João!');
    expect(falaDoLembrete('JULIANA SOUZA', 'mandar o contrato,')).toBe('Juliana, seu lembrete: mandar o contrato.');
    expect(falaDoLembrete('', 'ligar para o João')).toBe('Seu lembrete: ligar para o João.');
    expect(falaDoLembrete(null, 'ligar no •••• do João')).toBe('Seu lembrete: ligar no do João.');
    expect(primeiroNomeLembrete('  murilo  ')).toBe('Murilo');
    expect(primeiroNomeLembrete('McArthur')).toBe('McArthur');
  });

  it('o cartão: a primeira letra em maiúscula; a letra diminui com o comprimento', () => {
    expect(textoDoCartao('  ligar   para o João ')).toBe('Ligar para o João');
    expect(textoDoCartao('étienne chegou')).toBe('Étienne chegou');
    expect(tamanhoDoTexto('x'.repeat(52))).toBe('g');
    expect(tamanhoDoTexto('x'.repeat(53))).toBe('m');
    expect(tamanhoDoTexto('x'.repeat(110))).toBe('m');
    expect(tamanhoDoTexto('x'.repeat(111))).toBe('p');
  });

  it('"Marcado para 13:00" no horário de Brasília (hoje, ontem, outro dia; 00:00 e 23:59)', () => {
    const agora = Date.UTC(2026, 9, 31, 17, 0); // 14:00 em Brasília
    expect(horaMarcada(Date.UTC(2026, 9, 31, 16, 0), agora)).toBe('Marcado para 13:00');
    expect(horaMarcada(Date.UTC(2026, 9, 31, 3, 0), agora)).toBe('Marcado para 00:00');
    // 23:59 de sábado, visto às 00:05 de domingo (a virada do dia é a de Brasília, não a do UTC)
    expect(horaMarcada(Date.UTC(2026, 10, 1, 2, 59), Date.UTC(2026, 10, 1, 3, 5))).toBe('Marcado para ontem, 23:59');
    expect(horaMarcada(Date.UTC(2026, 10, 1, 2, 59), Date.UTC(2026, 10, 1, 2, 59, 30))).toBe('Marcado para 23:59');
    expect(horaMarcada(Date.UTC(2026, 10, 1, 1, 0), Date.UTC(2026, 10, 1, 11, 0))).toBe('Marcado para ontem, 22:00');
    expect(horaMarcada(Date.UTC(2026, 9, 28, 16, 0), agora)).toBe('Marcado para 28/10, 13:00');
  });

  it('a resposta do banco: só linhas válidas, sem repetir (aceita também {lembretes: [...]})', () => {
    const ok = { id: 'a', texto: ' ligar  para o João ', quando: '2026-10-31T16:00:00+00:00', status: 'pendente' };
    expect(normalizarLembretes([
      ok,
      { ...ok }, // repetido
      { id: 'b', texto: '', quando: ok.quando, status: 'pendente' },
      { id: 'c', texto: 'x', quando: 'amanhã', status: 'pendente' },
      { id: 'd', texto: 'x', quando: ok.quando, status: 'ok' },
      null, 'lixo', 7,
      { id: 'e', texto: 'y', quando: ok.quando, status: 'avisado' },
    ])).toEqual([{ ...ok, texto: 'ligar para o João' }, { id: 'e', texto: 'y', quando: ok.quando, status: 'avisado' }]);
    expect(normalizarLembretes({ lembretes: [ok] })).toHaveLength(1);
    expect(normalizarLembretes(null)).toEqual([]);
    expect(normalizarLembretes({ erro: 'sem_acesso' })).toEqual([]);
  });

  it('a resposta REAL de meus_lembretes_devidos (migration 20261031000000): {agora, primeiro_nome, lembretes} → retrato com o desvio do relógio', () => {
    const resposta = {
      agora: '2026-10-31T12:30:00-03:00',
      primeiro_nome: 'Matheus',
      lembretes: [{
        id: '0b7f3c9e-1111-4a2b-9c3d-000000000001', texto: 'ligar para o João', quando: '2026-10-31T13:00:00-03:00',
        quando_local: '2026-10-31T13:00', hora: '13:00', hora_falada: 'à uma da tarde', dia_semana: 'sábado',
        data_extenso: '31 de outubro', dia_relativo: 'hoje', status: 'pendente', atrasado: false, faltam_ms: 1_800_000,
      }],
    };
    const ida = Date.parse('2026-10-31T12:30:00-03:00');
    const igual = lerRetrato(resposta, ida - 300, ida + 300);
    expect(igual.desvioMs).toBe(0);
    expect(igual.lembretes).toEqual([{ id: resposta.lembretes[0].id, texto: 'ligar para o João', quando: '2026-10-31T13:00:00-03:00', status: 'pendente' }]);
    expect(Date.parse(igual.lembretes[0].quando)).toBe(Date.UTC(2026, 9, 31, 16, 0));
    // o notebook 5 min atrasado (12:25 no relógio dele): +5 min
    expect(lerRetrato(resposta, ida - 5 * MIN - 200, ida - 5 * MIN + 200).desvioMs).toBe(5 * MIN);
    // menos de 2 s é o arredondamento do "agora" (segundos inteiros), não relógio errado
    expect(lerRetrato(resposta, ida + 1_200, ida + 1_400).desvioMs).toBe(0);
    // sem o "agora" (resposta antiga, lista pura): sem desvio conhecido
    expect(lerRetrato(resposta.lembretes, ida, ida).desvioMs).toBeNull();
  });

  it('a demo: ?lembrete-demo=1 | fila | longo | atrasado (o resto não vale)', () => {
    expect(lerDemoLembrete('?lembrete-demo=1')).toBe('um');
    expect(lerDemoLembrete('?x=2&lembrete-demo=fila')).toBe('fila');
    expect(lerDemoLembrete('?lembrete-demo=longo')).toBe('longo');
    expect(lerDemoLembrete('?lembrete-demo=atrasado')).toBe('atrasado');
    expect(lerDemoLembrete('?lembrete-demo=0')).toBeNull();
    expect(lerDemoLembrete('')).toBeNull();
    const longo = lembretesDemo('longo', T0)[0];
    expect(longo.texto.length).toBeLessThanOrEqual(200);
    expect(lembretesDemo('um', T0).every((l) => l.demo)).toBe(true);
  });

  it('marcas velhas saem do localStorage; as que ainda valem ficam', () => {
    const a = armazenamentoFalso();
    marcarFalado(a, 'velha', T0 - 40 * H);
    marcarFalado(a, 'nova', T0 - H);
    a.setItem('atenvo-lmb:r:ok-velho', JSON.stringify({ acao: 'ok', ate: T0 - 1 }));
    a.setItem('atenvo-lmb:r:ok-vale', JSON.stringify({ acao: 'ok', ate: T0 + H }));
    a.setItem('atenvo-lmb:r:adiado', JSON.stringify({ acao: 'adiar', ate: T0 - 2 * H }));
    a.setItem('atenvo-lmb:r:torto', '{');
    a.setItem('outra-coisa', '1');
    limparMarcasVelhas(a, T0);
    expect([...a.dados.keys()].sort()).toEqual(['atenvo-lmb:f:nova', 'atenvo-lmb:r:adiado', 'atenvo-lmb:r:ok-vale', 'outra-coisa']);
  });
});

/* ================================================================== a voz criou/cancelou (V1: os lembretes na conversa) */

describe('a voz criou ou cancelou um lembrete: a tela busca de novo na hora', () => {
  it('o sinal: o evento nesta aba e a marca no localStorage (o evento storage leva às outras abas — a que fala pode ser outra)', () => {
    const eventos: string[] = [];
    const a = armazenamentoFalso();
    avisarLembretesMudaram({ dispatchEvent: (e: Event) => { eventos.push(e.type); return true; } }, a, T0);
    expect(eventos).toEqual([EVENTO_LEMBRETES_MUDARAM]);
    expect(a.getItem(K_MUDARAM)).toBe(String(T0));
    // a marca é do prefixo, mas a limpeza das marcas velhas não mexe nela (não é "falado" nem "silêncio")
    limparMarcasVelhas(a, T0 + 40 * H);
    expect(a.getItem(K_MUDARAM)).toBe(String(T0));
    // fora do navegador, sem armazenamento, evento ou armazenamento quebrados: nada quebra (a busca de 2 em 2 min resolve)
    expect(() => avisarLembretesMudaram(null, null)).not.toThrow();
    const cheio: ArmazenamentoLike = { getItem: () => null, setItem: () => { throw new Error('QuotaExceeded'); }, removeItem: () => undefined };
    expect(() => avisarLembretesMudaram({ dispatchEvent: () => { throw new Error('x'); } }, cheio)).not.toThrow();
    const b = armazenamentoFalso();
    avisarLembretesMudaram({ dispatchEvent: () => { throw new Error('x'); } }, b, T0 + 1);
    expect(b.getItem(K_MUDARAM)).toBe(String(T0 + 1)); // o evento quebrado não impede as outras abas
  });

  it('a outra aba lê o evento storage: "mudaram" → busca no servidor; Ok/adiar (ou tudo limpo) → refaz a fila; o resto, nada', () => {
    expect(acaoDoArmazenamento(K_MUDARAM)).toBe('buscar');
    expect(acaoDoArmazenamento('atenvo-lmb:r:a@2026-10-31T16:00:00.000Z')).toBe('refazer');
    expect(acaoDoArmazenamento('atenvo-lmb:f:a@2026-10-31T16:00:00.000Z')).toBe('refazer');
    expect(acaoDoArmazenamento(null)).toBe('refazer');
    expect(acaoDoArmazenamento('atenvo-tema:u1')).toBeNull();
  });

  it('"daqui a 1 minuto" criado entre duas buscas: buscar de novo (o que o sinal faz) arma o relógio e o aviso abre NA HORA', async () => {
    // sem o sinal: só a busca de 2 em 2 min acha — o aviso sai 30 s atrasado
    let semSinal: LembreteDevido[] = [];
    const s = montar(() => semSinal);
    s.ag.iniciar();
    await vi.advanceTimersByTimeAsync(30_000);
    semSinal = [lembrete('agora', Date.now() + MIN, 'beber água')];
    await vi.advanceTimersByTimeAsync(MIN);
    expect(s.ids()).toEqual([]);
    await vi.advanceTimersByTimeAsync(INTERVALO_BUSCA_MS - 90_000);
    expect(s.ids()).toEqual(['agora']);
    s.ag.parar();

    // com o sinal: 30 s depois da última busca a voz cria o lembrete para daqui a 1 min e a agenda busca de novo
    vi.setSystemTime(T0);
    let lista: LembreteDevido[] = [];
    const m = montar(() => lista);
    m.ag.iniciar();
    await vi.advanceTimersByTimeAsync(30_000);
    lista = [lembrete('agora', Date.now() + MIN, 'beber água')];
    void m.ag.atualizar();
    await vi.advanceTimersByTimeAsync(0);
    expect(m.preparados).toEqual(['agora']); // faltando menos de 2 min: a voz já é pedida
    await vi.advanceTimersByTimeAsync(MIN - 1_000);
    expect(m.ids()).toEqual([]);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(m.ag.fila()).toEqual([expect.objectContaining({ id: 'agora', atrasado: false })]);
    m.ag.parar();
  });
});
