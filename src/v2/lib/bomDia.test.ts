import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  acharPausas, agruparCampanhas, analisarVoz, aplicarGanho, blocosDaVoz, casosDoPainel, chaveTelaBomDia, criarGanho, criarMedidor,
  destinoDaCentral, detalheNaoElegiveis, deveMostrarBomDia, encaixarNasPausas, escalaU, falasDaTela, fraseComparacao, fraseIa,
  fraseNoTempo, hojeLocal, inicioPorPeso, juntarPcm, lideresCampanha, limiarPalavra, listaE, mapearFala, marcarBomDiaVisto,
  marcarMomentoVisto, MAX_CHARS_VOZ, medirPalavras, momentoAtual, momentoDevido, montarApresentacao, montarFala,
  msAteProximoBomDia, msAteProximoMomento, nomeCampanha, painelDaTela, PAUSA_ENTRE_PEDACOS_S, porExtenso, progressoFrase,
  proximaTelaBomDia, quadroLento, respiracaoCalma, resumoDaRpc, saudacaoDoDia, textoCorrido, textoFalado, textoResumo,
  textosDoPlay, vaoDaFita, vozAte,
  type ResumoGestor, type ResumoVendedor, type TelaBomDia, type Trecho,
} from './bomDia';
import { prepararBomDia, seedResumoBomDia } from '@/data/bomDia';

const dia = (h: number, m = 0) => new Date(2026, 9, 30, h, m); // sexta, 30/10/2026 (hora local)

describe('bom dia: quando abre', () => {
  beforeEach(() => {
    const m = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); } });
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('antes das 8h não abre; das 8h em diante abre uma vez por dia e por pessoa', () => {
    expect(deveMostrarBomDia('u1', dia(7, 59))).toBe(false);
    expect(deveMostrarBomDia('u1', dia(8, 0))).toBe(true);
    expect(deveMostrarBomDia('u1', dia(17, 30))).toBe(true);
    marcarBomDiaVisto('u1', dia(8, 0));
    expect(deveMostrarBomDia('u1', dia(9, 0))).toBe(false);
    expect(deveMostrarBomDia('u2', dia(9, 0))).toBe(true);
    expect(deveMostrarBomDia('u1', new Date(2026, 9, 31, 8, 0))).toBe(true); // virou o dia
  });

  it('storage quebrado: não insiste a cada load', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('negado'); }, setItem: () => { throw new Error('cheio'); } });
    expect(deveMostrarBomDia('u1', dia(9))).toBe(false);
    expect(() => marcarBomDiaVisto('u1', dia(9))).not.toThrow();
  });

  it('tempo até as próximas 8h', () => {
    expect(msAteProximoBomDia(dia(7, 0))).toBe(60 * 60_000);
    expect(msAteProximoBomDia(dia(8, 0))).toBe(24 * 60 * 60_000); // 8h em ponto: a de hoje já é agora
    expect(msAteProximoBomDia(dia(20, 0))).toBe(12 * 60 * 60_000);
  });
});

describe('bom dia: o que a IA fala (roteiro do dono)', () => {
  const atendente: ResumoVendedor = { modo: 'vendedor', novos: 12, semResposta: 8, passados: 3, presenciais: 2 };

  it('saudação pelo nome, números e informações importantes, na ordem do dono', () => {
    const f = montarFala('Juliana Souza', atendente);
    expect(f.map((t) => t.id)).toEqual(['saudacao', 'numeros', 'avisos', 'passados', 'presenciais', 'fecho']);
    expect(textoCorrido(f)).toBe(
      'Olá, Juliana! Seja bem-vinda ao Atenvo. Hoje você tem 12 novos clientes e 8 clientes sem resposta. '
      + 'Informações importantes: O robô passou 3 clientes para você. Eles estão esperando atendimento. '
      + 'Você tem 2 atendimentos presenciais hoje. Bom trabalho!',
    );
  });

  it('bem-vindo / bem-vinda pelo primeiro nome', () => {
    expect(montarFala('Matheus', atendente)[0].texto).toBe('Olá, Matheus! Seja bem-vindo ao Atenvo.');
    expect(montarFala('Giovana', atendente)[0].texto).toBe('Olá, Giovana! Seja bem-vinda ao Atenvo.');
    expect(montarFala('', atendente)[0].texto).toBe('Olá! Seja bem-vindo ao Atenvo.');
  });

  it('singular, zero e nada importante', () => {
    const f = montarFala('Luiz', { modo: 'vendedor', novos: 1, semResposta: 0, passados: 1, presenciais: 1 });
    expect(f[1].texto).toBe('Hoje você tem 1 novo cliente e 0 clientes sem resposta.');
    expect(f.find((t) => t.id === 'passados')?.texto).toBe('O robô passou 1 cliente para você. Ele está esperando atendimento.');
    expect(f.find((t) => t.id === 'presenciais')?.texto).toBe('Você tem 1 atendimento presencial hoje.');
    const calmo = montarFala('Luiz', { modo: 'vendedor', novos: 0, semResposta: 0, passados: 0, presenciais: 0 });
    expect(calmo.map((t) => t.id)).toEqual(['saudacao', 'numeros', 'avisos', 'nenhum', 'fecho']);
  });

  it('o admin Matheus ouve o de VENDEDOR: sem equipe e sem "sem dono" (decisão do dono 30/10)', () => {
    const f = montarFala('Matheus', { modo: 'vendedor', novos: 9, semResposta: 5, passados: 0, presenciais: 0 });
    expect(f.map((t) => t.id)).toEqual(['saudacao', 'numeros', 'avisos', 'nenhum', 'fecho']);
    expect(textoCorrido(f)).not.toMatch(/equipe|sem dono/);
  });

  it('o momento e a hora não mudam a fala do vendedor', () => {
    const manha = textoCorrido(montarFala('Juliana', atendente, { momento: 'manha', agora: dia(8) }));
    expect(textoCorrido(montarFala('Juliana', atendente, { momento: 'tarde', agora: dia(17) }))).toBe(manha);
  });
});

describe('bom dia: legenda no tempo da voz', () => {
  it('distribui as frases pela duração, proporcional ao tamanho', () => {
    const tr = montarFala('Juliana', { modo: 'vendedor', novos: 12, semResposta: 8, passados: 0, presenciais: 0 });
    const t = inicioPorPeso(tr, 20);
    expect(t[0]).toBe(0);
    for (let i = 1; i < t.length; i++) expect(t[i]).toBeGreaterThan(t[i - 1]);
    expect(t[t.length - 1]).toBeLessThan(20);
  });

  it('acha as pausas reais da onda e encaixa as fronteiras nelas', () => {
    const taxa = 1000;
    const onda = new Float32Array(6 * taxa);
    // fala em [0,1.5) [1.9,3.6) [4.1,6): pausas centradas em 1.7 e 3.85
    for (let i = 0; i < onda.length; i++) {
      const s = i / taxa;
      const falando = s < 1.5 || (s >= 1.9 && s < 3.6) || s >= 4.1;
      onda[i] = falando ? Math.sin(i * 0.7) * 0.5 : 0;
    }
    const pausas = acharPausas(onda, taxa);
    expect(pausas.length).toBe(2);
    expect(pausas[0]).toBeCloseTo(1.7, 1);
    expect(pausas[1]).toBeCloseTo(3.85, 1);
    expect(encaixarNasPausas([0, 1.4, 4.4], pausas)).toEqual([0, pausas[0], pausas[1]]);
    // sem pausa por perto, fica a estimativa
    expect(encaixarNasPausas([0, 5.5], [1.7])).toEqual([0, 5.5]);
  });
});

describe('bom dia: números como são falados', () => {
  it('por extenso até 99 (e além): o peso é o da fala', () => {
    expect(porExtenso(0)).toBe('zero');
    expect(porExtenso(1)).toBe('um');
    expect(porExtenso(12)).toBe('doze');
    expect(porExtenso(14)).toBe('catorze');
    expect(porExtenso(20)).toBe('vinte');
    expect(porExtenso(21)).toBe('vinte e um');
    expect(porExtenso(31)).toBe('trinta e um');
    expect(porExtenso(46)).toBe('quarenta e seis');
    expect(porExtenso(99)).toBe('noventa e nove');
    expect(porExtenso(100)).toBe('cem');
    expect(porExtenso(101)).toBe('cento e um');
    expect(porExtenso(146)).toBe('cento e quarenta e seis');
    expect(porExtenso(200)).toBe('duzentos');
    expect(porExtenso(1000)).toBe('mil');
    expect(porExtenso(1050)).toBe('mil e cinquenta');
    expect(porExtenso(2345)).toBe('dois mil trezentos e quarenta e cinco');
    expect(porExtenso(-1)).toBe('');
    expect(porExtenso(Number.NaN)).toBe('');
  });

  it('a frase do admin pesa "quarenta e seis", não "46"', () => {
    const f = 'Na equipe, são 46 novos clientes e 31 sem resposta.';
    expect(textoFalado(f)).toBe('Na equipe, são quarenta e seis novos clientes e trinta e um sem resposta.');
    const ps = medirPalavras(f);
    expect(ps.map((p) => p.texto)).toEqual(f.split(' '));
    const n46 = ps.find((p) => p.texto === '46')!;
    const sao = ps.find((p) => p.texto === 'são')!;
    expect(n46.numero).toBe(true);
    expect(sao.numero).toBe(false);
    expect(n46.len / sao.len).toBeCloseTo('quarenta e seis'.length / 3, 5);
    // cobre a frase inteira, em ordem
    const ult = ps[ps.length - 1];
    expect(ult.ini + ult.len).toBeCloseTo(1, 5);
    for (let i = 1; i < ps.length; i++) expect(ps[i].ini).toBeGreaterThan(ps[i - 1].ini);
    // a palavra acende quando começa a ser dita
    expect(limiarPalavra(n46)).toBeGreaterThan(n46.ini);
    expect(limiarPalavra(n46)).toBeLessThan(n46.ini + n46.len * 0.5);
  });

  it('o peso da frase (encaixe) também usa o número falado', () => {
    const tr: Trecho[] = [{ id: 'leads', texto: 'São 46.' }, { id: 'fecho', texto: 'São 4.' }];
    const t = inicioPorPeso(tr, 10);
    // "quarenta e seis" pesa mais que "quatro": a 1ª frase leva mais da metade do tempo
    expect(t[1]).toBeGreaterThan(5);
  });
});

/* fala sintética: voz (seno) e silêncio, a 1 kHz */
function falaSintetica(trechos: Array<[number, number]>, dur: number, taxa = 1000): Float32Array {
  const a = new Float32Array(Math.round(dur * taxa));
  for (let i = 0; i < a.length; i++) {
    const s = i / taxa;
    a[i] = trechos.some(([x, y]) => s >= x && s < y) ? Math.sin(i * 0.7) * 0.5 : 0;
  }
  return a;
}

describe('bom dia: legenda pela voz acumulada', () => {
  // 3 frases; a 1ª tem uma pausa interna depois da vírgula; o arquivo termina com 0,8 s de silêncio
  const voz = analisarVoz(falaSintetica([[0, 0.9], [1.2, 2.0], [2.6, 4.0], [4.6, 5.2]], 6), 1000);
  const trechos: Trecho[] = [
    { id: 'saudacao', texto: 'Olá, Juliana! Seja bem-vinda.' },
    { id: 'numeros', texto: 'Hoje você tem 12 novos clientes.' },
    { id: 'fecho', texto: 'Bom trabalho!' },
  ];

  it('acha pausas, o fim da voz (não o do arquivo) e a voz acumulada', () => {
    expect(voz.intervalos.length).toBe(3);
    expect(voz.intervalos[1][0]).toBeCloseTo(2.0, 1);
    expect(voz.intervalos[1][1]).toBeCloseTo(2.6, 1);
    expect(voz.fimVoz).toBeCloseTo(5.2, 1);
    expect(voz.duracao).toBeCloseTo(6, 5);
    // a pausa não acumula voz; a fala acumula
    expect(vozAte(voz, 2.5) - vozAte(voz, 2.05)).toBeCloseTo(0, 5);
    expect(vozAte(voz, 3.5)).toBeGreaterThan(vozAte(voz, 2.6));
    expect(vozAte(voz, -1)).toBe(0);
    expect(vozAte(voz, 99)).toBe(voz.cum[voz.cum.length - 1]);
  });

  it('a legenda troca no INÍCIO da pausa e a frase nova espera a voz', () => {
    const m = mapearFala(trechos, voz);
    // frase 2 começa (conta da voz) no meio da pausa 2,0–2,6; a legenda troca já em 2,0
    expect(m.inicios[1]).toBeCloseTo(2.3, 1);
    expect(m.trocas[1]).toBeCloseTo(2.0, 1);
    expect(m.trocas[2]).toBeCloseTo(4.0, 1);
    expect(fraseNoTempo(m, 1.99)).toBe(0);
    expect(fraseNoTempo(m, 2.02)).toBe(1);
    expect(fraseNoTempo(m, 4.1)).toBe(2);
    // na pausa: a frase velha está toda dita e a nova toda apagada
    expect(progressoFrase(m, 0, 2.1)).toBe(1);
    expect(progressoFrase(m, 1, 2.1)).toBe(0);
    expect(progressoFrase(m, 1, 2.55)).toBe(0);
    // e anda com a voz, sem voltar
    let antes = 0;
    for (let t = 2.6; t <= 4.0; t += 0.05) {
      const p = progressoFrase(m, 1, t);
      expect(p).toBeGreaterThanOrEqual(antes);
      antes = p;
    }
    expect(progressoFrase(m, 1, 4.0)).toBeCloseTo(1, 2);
  });

  it('a pausa interna prende a fronteira depois da pontuação ("Olá, Juliana!" | "Seja")', () => {
    const m = mapearFala(trechos, voz);
    const ps = medirPalavras(trechos[0].texto);
    const seja = ps.find((p) => p.texto === 'Seja')!;
    const juliana = ps.find((p) => p.texto === 'Juliana!')!;
    // durante a pausa interna (0,9–1,2): "Juliana!" dita, "Seja" ainda não
    const p = progressoFrase(m, 0, 1.05);
    expect(p).toBeGreaterThanOrEqual(limiarPalavra(juliana));
    expect(p).toBeLessThan(limiarPalavra(seja));
    expect(m.ancoras[0].length).toBe(3);
  });
});

describe('bom dia: ganho automático por banda', () => {
  // uma "voz" com a distribuição medida (grave): p95 ≈ ref
  const voz = (k: number, deslocar: number) => {
    const base = 0.48 + 0.12 * Math.sin(k * 0.37) * Math.abs(Math.sin(k * 0.05)) + 0.04 * Math.sin(k * 1.9);
    return Math.max(0, base + deslocar);
  };
  const p95 = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor((xs.length - 1) * 0.95)];
  const rodar = (deslocar: number, quadros = 400) => {
    const g = criarGanho(0.28, 0.66, 0.6);
    const out: number[] = [];
    for (let k = 0; k < quadros; k++) out.push(aplicarGanho(g, voz(k, deslocar), 1 / 60));
    return { g, fim: out.slice(-150) };
  };

  it('voz mais baixa não apaga a fita; mais alta não estoura', () => {
    const ref = rodar(0);
    const baixa = rodar(-0.14);
    const alta = rodar(0.1);
    expect(Math.abs(ref.g.desvio)).toBeLessThan(0.05);
    expect(baixa.g.desvio).toBeLessThan(-0.08);
    expect(alta.g.desvio).toBeGreaterThan(0.05);
    // depois de ~3 s, o pico das três fica parecido
    expect(Math.abs(p95(baixa.fim) - p95(ref.fim))).toBeLessThan(0.15);
    expect(Math.abs(p95(alta.fim) - p95(ref.fim))).toBeLessThan(0.15);
    // e nunca sai de 0..1
    for (const x of [...baixa.fim, ...alta.fim]) { expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThanOrEqual(1); }
  });

  it('o deslocamento tem teto (silêncio total não vira ganho infinito)', () => {
    const g = criarGanho(0.28, 0.66, 0.6);
    for (let k = 0; k < 600; k++) aplicarGanho(g, 0, 1 / 60);
    expect(g.desvio).toBeGreaterThanOrEqual(-0.3);
    expect(aplicarGanho(g, 0, 1 / 60)).toBe(0);
  });
});

describe('bom dia: a fita na tela', () => {
  it('a escala é calculada em JS com o mesmo clamp do CSS', () => {
    expect(escalaU(1366, 657)).toBe(1);
    expect(escalaU(1920, 1000)).toBeCloseTo(1920 / 1366, 5);
    expect(escalaU(1280, 600)).toBeCloseTo(600 / 657, 5);
    expect(escalaU(1000, 400)).toBe(0.8);
    expect(escalaU(3840, 2160)).toBe(1.42);
    expect(escalaU(800, 900)).toBe(1);
  });

  it('em repouso ~40% da tela (nunca uma reta longa); falando ~70%; pousada ~35%; abre do centro', () => {
    const w = 1366;
    const repouso = vaoDaFita(w, 1, { abre: 1, presenca: 0, recolhe: 0 });
    const fala = vaoDaFita(w, 1, { abre: 1, presenca: 1, recolhe: 0 });
    const pousada = vaoDaFita(w, 1, { abre: 1, presenca: 0, recolhe: 1 });
    expect(repouso / w).toBeCloseTo(0.4, 2);
    expect(fala / w).toBeCloseTo(0.7, 2);
    expect(pousada / w).toBeCloseTo(0.35, 2);
    expect(vaoDaFita(w, 1, { abre: 0, presenca: 0, recolhe: 0 })).toBeLessThan(repouso * 0.06);
    // tela muito larga: o teto em u segura a fita
    expect(vaoDaFita(3000, 1.42, { abre: 1, presenca: 1, recolhe: 0 })).toBeCloseTo(1120 * 1.42, 3);
  });

  it('máquina fraca: janelas de 1,5 s com média > 30 ms (o vigia do mock aprovado); um tranco isolado não conta', () => {
    // o que cada janela fechada disse (null = janela ainda aberta, não entra)
    const janelas = (dts: number[]) => {
      const m = criarMedidor();
      return dts.map((d) => quadroLento(m, d)).filter((x) => x !== null);
    };
    // 60 q/s: a janela só fecha em 1,5 s e é boa
    expect(janelas(Array.from({ length: 95 }, () => 16.7))).toEqual([false]);
    // 24 ms (o teto antigo travava aqui): passa
    expect(janelas(Array.from({ length: 70 }, () => 24))).toEqual([false]);
    // um tranco de 420 ms no meio de quadros bons conta só 50 ms
    expect(janelas(Array.from({ length: 80 }, (_, i) => (i === 30 ? 420 : 16.7)))).toEqual([false]);
    // 34 ms o tempo todo: janela lenta
    expect(janelas(Array.from({ length: 50 }, () => 34))).toEqual([true]);
    // quadro sem tempo não conta
    expect(quadroLento(criarMedidor(), 0)).toBeNull();
  });

  it('sem voz para medir, a fita respira devagar (nada de sílaba falsa)', () => {
    let maxPasso = 0;
    for (let t = 0; t < 30; t += 1 / 60) {
      const v = respiracaoCalma(t);
      expect(v).toBeGreaterThan(0.08);
      expect(v).toBeLessThan(0.4);
      maxPasso = Math.max(maxPasso, Math.abs(respiracaoCalma(t + 1 / 60) - v));
    }
    expect(maxPasso).toBeLessThan(0.005);
  });

  it('o leitor de tela ouve o resumo quando o painel sobe', () => {
    expect(textoResumo('Juliana Souza', { modo: 'vendedor', novos: 12, semResposta: 8, passados: 3, presenciais: 2 }))
      .toBe('Olá, Juliana. 12 novos clientes e 8 sem resposta. 3 clientes passados pelo robô. 2 atendimentos presenciais hoje.');
    expect(textoResumo('Matheus', { modo: 'vendedor', novos: 1, semResposta: 0, passados: 0, presenciais: 0 }))
      .toBe('Olá, Matheus. 1 novo cliente e 0 sem resposta.');
    // o gestor: o texto da fala inteiro
    const g = seedResumoBomDia(true);
    expect(textoResumo('Murilo', g, { momento: 'tarde', agora: dia(17) }))
      .toBe(textoCorrido(montarFala('Murilo', g, { momento: 'tarde', agora: dia(17) })));
  });
});

/* ============================================================
   Rodada do ADMINISTRADOR (dono 30/10): dois momentos, o roteiro
   do Murilo (manhã e 17h) e as campanhas.
   ============================================================ */

describe('bom dia: dois momentos (8h para todos, 17h só para o gestor)', () => {
  let mem: Map<string, string>;
  beforeEach(() => {
    mem = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v); } });
  });
  afterEach(() => { vi.unstubAllGlobals(); });
  const G = { gestor: true };
  const V = { gestor: false };

  it('vendedor: só a manhã, das 8h em diante (inclusive depois das 17h, se não viu)', () => {
    expect(momentoDevido('u1', dia(7, 59), V)).toBeNull();
    expect(momentoDevido('u1', dia(8), V)).toBe('manha');
    expect(momentoDevido('u1', dia(12), V)).toBe('manha');   // "não importa se ele logar meio-dia"
    expect(momentoDevido('u1', dia(18), V)).toBe('manha');
    marcarMomentoVisto('u1', 'manha', dia(8));
    expect(momentoDevido('u1', dia(18), V)).toBeNull();
    expect(mem.get('atenvo-bomdia:u1')).toBe('2026-10-30');   // a chave de sempre
  });

  it('gestor: manhã até as 17h; depois, a tarde (a manhã fica superada)', () => {
    expect(momentoDevido('m', dia(7), G)).toBeNull();
    expect(momentoDevido('m', dia(9), G)).toBe('manha');
    expect(momentoDevido('m', dia(16, 59), G)).toBe('manha');
    // não viu a manhã e entrou às 17h30: só a tarde
    expect(momentoDevido('m', dia(17, 30), G)).toBe('tarde');
    marcarMomentoVisto('m', 'tarde', dia(17, 30));
    expect(mem.get('atenvo-bomdia-tarde:m')).toBe('2026-10-30');
    expect(momentoDevido('m', dia(18), G)).toBeNull();   // nem volta para a manhã
    // dia seguinte: tudo de novo
    expect(momentoDevido('m', new Date(2026, 9, 31, 8), G)).toBe('manha');
  });

  it('gestor que viu a manhã ainda recebe a tarde', () => {
    marcarMomentoVisto('m', 'manha', dia(8));
    expect(momentoDevido('m', dia(12), G)).toBeNull();
    expect(momentoDevido('m', dia(17), G)).toBe('tarde');
  });

  it('storage quebrado: não insiste', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('negado'); }, setItem: () => { throw new Error('cheio'); } });
    expect(momentoDevido('m', dia(17, 30), G)).toBeNull();
    expect(() => marcarMomentoVisto('m', 'tarde', dia(17))).not.toThrow();
  });

  it('o momento atual ("Ouvir o bom dia" do menu)', () => {
    expect(momentoAtual(dia(16, 59), G)).toBe('manha');
    expect(momentoAtual(dia(17), G)).toBe('tarde');
    expect(momentoAtual(dia(19), V)).toBe('manha');
  });

  it('tempo até o próximo horário: 8h para todos; 8h ou 17h para o gestor', () => {
    expect(msAteProximoMomento(dia(7), V)).toBe(60 * 60_000);
    expect(msAteProximoMomento(dia(9), V)).toBe(23 * 60 * 60_000);
    expect(msAteProximoMomento(dia(9), G)).toBe(8 * 60 * 60_000);    // 17h
    expect(msAteProximoMomento(dia(17), G)).toBe(15 * 60 * 60_000);  // 17h em ponto: a de hoje já é agora → 8h de amanhã
    expect(msAteProximoMomento(dia(16, 58), G)).toBe(2 * 60_000);
  });
});

describe('bom dia: virada do dia com a tela ABERTA (dono: "às 8 horas tem que dar o reset")', () => {
  let mem: Map<string, string>;
  beforeEach(() => {
    mem = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v); } });
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
  const sabado = (h: number, m = 0) => new Date(2026, 9, 31, h, m);
  const segunda = (h: number, m = 0) => new Date(2026, 10, 2, h, m);

  it('nada aberto: abre a de hoje; a mesma tela de hoje fica a MESMA (nada remonta)', () => {
    const t = proximaTelaBomDia(null, 'manha', sabado(8, 5));
    expect(t).toEqual({ momento: 'manha', dia: '2026-10-31' });
    expect(proximaTelaBomDia(t as TelaBomDia, 'manha', sabado(9))).toBe(t);
  });

  it('o fluxo do shell: aberta no sábado 08h05 e esquecida; segunda 08h a tela vira OUTRA (key nova) e o dia novo é marcado', () => {
    // sábado: abre e marca na abertura
    expect(momentoDevido('u1', sabado(8, 5))).toBe('manha');
    const sab = proximaTelaBomDia(null, 'manha', sabado(8, 5)) as TelaBomDia;
    marcarMomentoVisto('u1', 'manha', sabado(8, 5));
    // segunda antes das 8h: nada devido, a tela fica como está
    expect(momentoDevido('u1', segunda(7, 59))).toBeNull();
    // segunda 08h: devido de novo → a tela de sábado dá lugar à de segunda (antes: ficava a de sábado, e a segunda era marcada como vista)
    expect(momentoDevido('u1', segunda(8, 5))).toBe('manha');
    const seg = proximaTelaBomDia(sab, 'manha', segunda(8, 5));
    expect(seg).toEqual({ momento: 'manha', dia: '2026-11-02' });
    expect(chaveTelaBomDia(seg as TelaBomDia)).toBe('manha-2026-11-02');
    expect(chaveTelaBomDia(seg as TelaBomDia)).not.toBe(chaveTelaBomDia(sab));   // o Hud remonta
    marcarMomentoVisto('u1', 'manha', segunda(8, 5));
    expect(momentoDevido('u1', segunda(8, 11))).toBeNull();                        // fechou: não volta
  });

  it('o diagnóstico das 17h esquecido aberto: às 8h do dia seguinte dá lugar ao bom dia (não espera fechar)', () => {
    expect(proximaTelaBomDia({ momento: 'tarde', dia: '2026-10-30' }, 'manha', sabado(8, 5))).toEqual({ momento: 'manha', dia: '2026-10-31' });
  });

  it('a manhã de HOJE esquecida aberta até as 17h: o diagnóstico espera ela fechar (como antes)', () => {
    expect(proximaTelaBomDia({ momento: 'manha', dia: '2026-10-30' }, 'tarde', dia(17, 1))).toBe('esperar');
  });

  it('o preparo (números + voz) é do DIA: a tela nova de segunda não recebe o de sábado', () => {
    vi.useFakeTimers();
    const p = { org: 'org-virada', uid: 'u-virada', nome: 'Juliana', momento: 'manha' as const };
    vi.setSystemTime(sabado(8, 5));
    const sab = prepararBomDia(p);
    vi.setSystemTime(sabado(8, 10));
    expect(prepararBomDia(p)).toBe(sab);              // o mesmo dia (e dentro da validade): o mesmo preparo
    vi.setSystemTime(segunda(8, 5));
    const seg = prepararBomDia(p);
    expect(seg).not.toBe(sab);                        // dia novo: RPC e voz de novo
    expect(hojeLocal(seg.agora)).toBe('2026-11-02');
  });
});

describe('bom dia: campanhas (nome falado e mostrado)', () => {
  it('mapa do dono', () => {
    expect(nomeCampanha('ANTONIO CAMPANHA')).toMatchObject({ rotulo: 'Campanha Antônio', de: 'da campanha Antônio', a: 'a campanha Antônio', em: 'na campanha Antônio' });
    expect(nomeCampanha('JUROS ABUSIVO (ANDRIUS)')).toMatchObject({ rotulo: 'Campanha Andrius', de: 'da campanha Andrius', a: 'a campanha Andrius' });
    expect(nomeCampanha('EMPRESTIMO')).toMatchObject({ rotulo: 'Empréstimo', de: 'do Empréstimo', a: 'a do Empréstimo', em: 'no Empréstimo', numero: 'número do Empréstimo' });
    expect(nomeCampanha('EMPRÉSTIMO').rotulo).toBe('Empréstimo');
    expect(nomeCampanha('OFICIAL')).toMatchObject({ rotulo: 'Número oficial', de: 'do número oficial', a: 'a do número oficial', numero: 'número oficial' });
    expect(nomeCampanha('MURILLO CHIP')).toMatchObject({ rotulo: 'Chip do Murillo', de: 'do chip do Murillo', a: 'a do chip do Murillo' });
    expect(nomeCampanha('Sem campanha')).toMatchObject({ rotulo: 'Sem campanha', de: 'sem campanha' });
    expect(nomeCampanha('DISPAROS')).toMatchObject({ rotulo: 'Disparos', de: 'do número Disparos', a: 'a do número Disparos', numero: 'número Disparos' });
    expect(nomeCampanha('JUROS (ANTONIO)').rotulo).toBe('Campanha Antônio');
  });

  it('AGRUPA pelo nome mapeado antes de contar e ordenar (EMPRESTIMO + EMPRÉSTIMO = Empréstimo)', () => {
    const g = agruparCampanhas([
      { canal: 'EMPRESTIMO', n: 6 }, { canal: 'ANTONIO CAMPANHA', n: 5 }, { canal: 'JUROS ABUSIVO (ANDRIUS)', n: 4 }, { canal: 'EMPRÉSTIMO', n: 1 },
    ]);
    expect(g.map((x) => [x.nome.rotulo, x.n])).toEqual([['Empréstimo', 7], ['Campanha Antônio', 5], ['Campanha Andrius', 4]]);
    // empate: a ordem em que chegaram (a RPC manda por n desc, nome); zero sai
    expect(agruparCampanhas([{ canal: 'ANTONIO CAMPANHA', n: 2 }, { canal: 'OFICIAL', n: 0 }, { canal: 'JUROS ABUSIVO (ANDRIUS)', n: 2 }])
      .map((x) => x.nome.rotulo)).toEqual(['Campanha Antônio', 'Campanha Andrius']);
  });

  it('a melhor campanha: empate vira lista; "Sem campanha" não concorre', () => {
    const l = lideresCampanha(agruparCampanhas([{ canal: 'Sem campanha', n: 9 }, { canal: 'ANTONIO CAMPANHA', n: 3 }, { canal: 'OFICIAL', n: 3 }]));
    expect(l?.n).toBe(3);
    expect(l?.nomes.map((x) => x.rotulo)).toEqual(['Campanha Antônio', 'Número oficial']);
    expect(lideresCampanha(agruparCampanhas([{ canal: 'Sem campanha', n: 4 }]))).toBeNull();
    expect(lideresCampanha([])).toBeNull();
    expect(listaE(['a'])).toBe('a');
    expect(listaE(['a', 'b', 'c'])).toBe('a, b e c');
  });
});

/* os números REAIS de hoje (30/10, ~14h) — para conferir a lógica */
const real: ResumoGestor = {
  modo: 'gestor',
  chegaram: 41,
  porCampanha: [{ canal: 'ANTONIO CAMPANHA', n: 29 }, { canal: 'JUROS ABUSIVO (ANDRIUS)', n: 12 }],
  naoElegiveis: 16,
  nePorCampanha: [{ canal: 'EMPRESTIMO', n: 6 }, { canal: 'ANTONIO CAMPANHA', n: 5 }, { canal: 'JUROS ABUSIVO (ANDRIUS)', n: 4 }, { canal: 'EMPRÉSTIMO', n: 1 }],
  fechadosHoje: 3,
  melhorOntem: { n: 5, nomes: ['Juliana'] },
  melhorHoje: { n: 2, nomes: ['Juliana'] },
  criticos: { desconectados: ['EMPRESTIMO'], iaSemCredito: false, semDono: 0 },
  leadsOntemMesmaHora: null,
  iaAtendeuHoje: null,
};
const com = (p: Partial<ResumoGestor>): ResumoGestor => ({ ...real, ...p });
const manha = (r: ResumoGestor, nome = 'Murilo', h = 8) => montarFala(nome, r, { momento: 'manha', agora: dia(h) });
const tarde = (r: ResumoGestor, nome = 'Murilo') => montarFala(nome, r, { momento: 'tarde', agora: dia(17) });
const trecho = (f: Trecho[], id: string) => f.filter((t) => t.id === id).map((t) => t.texto).join(' ');

describe('bom dia do ADMINISTRADOR: manhã (roteiro do dono, literal)', () => {
  it('com os números reais de hoje', () => {
    const f = manha(real);
    expect(f.map((t) => t.id)).toEqual([
      'saudacao', 'saudacao', 'leads', 'leads', 'melhor-campanha', 'nao-elegiveis', 'campanha-ne', 'melhor-ontem', 'fechados',
      'criticos', 'criticos', 'fecho',
    ]);
    expect(textoCorrido(f)).toBe(
      'Bom dia, Murilo, tudo bem? Seja bem-vindo ao seu acesso de administrador. Aqui você pode acompanhar o desempenho da sua equipe. '
      + 'Até o momento, entraram 41 leads no sistema: 29 da campanha Antônio e 12 da campanha Andrius. '
      + 'A melhor campanha até agora é a campanha Antônio, com 29 leads. '
      + '16 clientes foram marcados como não elegíveis. '
      + 'A campanha com mais não elegíveis é a do Empréstimo, com 7 clientes. '
      + 'A melhor vendedora de ontem foi a Juliana, com 5 contratos fechados. '
      + 'Hoje já foram fechados 3 contratos. '
      + 'Casos críticos: O número do Empréstimo está desconectado. '
      + 'Bom trabalho!',
    );
  });

  it('saudação pela hora e pelo gênero', () => {
    expect(manha(real, 'Murilo', 13)[0].texto).toBe('Boa tarde, Murilo, tudo bem? Seja bem-vindo ao seu acesso de administrador.');
    expect(manha(real, 'Murilo', 19)[0].texto).toBe('Boa noite, Murilo, tudo bem? Seja bem-vindo ao seu acesso de administrador.');
    expect(manha(real, 'Fernanda Lima', 8)[0].texto).toBe('Bom dia, Fernanda, tudo bem? Seja bem-vinda ao seu acesso de administrador.');
    expect(saudacaoDoDia(dia(4, 59))).toBe('Boa noite');
    expect(saudacaoDoDia(dia(5))).toBe('Bom dia');
    expect(saudacaoDoDia(dia(11, 59))).toBe('Bom dia');
    expect(saudacaoDoDia(dia(12))).toBe('Boa tarde');
    expect(saudacaoDoDia(dia(18))).toBe('Boa noite');
  });

  it('leads: uma campanha, um lead, nenhum (e então pula a melhor campanha)', () => {
    expect(trecho(manha(com({ chegaram: 12, porCampanha: [{ canal: 'ANTONIO CAMPANHA', n: 12 }] })), 'leads'))
      .toBe('Até o momento, entraram 12 leads no sistema, todos da campanha Antônio.');
    expect(trecho(manha(com({ chegaram: 1, porCampanha: [{ canal: 'ANTONIO CAMPANHA', n: 1 }] })), 'leads'))
      .toBe('Até o momento, entrou 1 lead no sistema, da campanha Antônio.');
    const zero = manha(com({ chegaram: 0, porCampanha: [] }));
    expect(trecho(zero, 'leads')).toBe('Até o momento, nenhum lead entrou no sistema hoje.');
    expect(zero.some((t) => t.id === 'melhor-campanha')).toBe(false);
    // três campanhas: vírgulas e "e" antes da última
    expect(trecho(manha(com({ chegaram: 20, porCampanha: [{ canal: 'OFICIAL', n: 6 }, { canal: 'ANTONIO CAMPANHA', n: 5 }, { canal: 'MURILLO CHIP', n: 9 }] })), 'leads'))
      .toBe('Até o momento, entraram 20 leads no sistema: 9 do chip do Murillo, 6 do número oficial e 5 da campanha Antônio.');
  });

  it('melhor campanha: empate e campanha sem nome próprio', () => {
    expect(trecho(manha(com({ chegaram: 24, porCampanha: [{ canal: 'ANTONIO CAMPANHA', n: 12 }, { canal: 'JUROS ABUSIVO (ANDRIUS)', n: 12 }] })), 'melhor-campanha'))
      .toBe('As melhores campanhas até agora são a campanha Antônio e a campanha Andrius, com 12 leads cada.');
    expect(trecho(manha(com({ chegaram: 3, porCampanha: [{ canal: 'EMPRÉSTIMO', n: 2 }, { canal: 'EMPRESTIMO', n: 1 }] })), 'melhor-campanha'))
      .toBe('A melhor campanha até agora é a do Empréstimo, com 3 leads.');
    expect(trecho(manha(com({ chegaram: 1, porCampanha: [{ canal: 'OFICIAL', n: 1 }] })), 'melhor-campanha'))
      .toBe('A melhor campanha até agora é a do número oficial, com 1 lead.');
  });

  it('não elegíveis: singular, zero (pula a campanha) e a campanha com mais (nome próprio, empate)', () => {
    expect(trecho(manha(com({ naoElegiveis: 1, nePorCampanha: [{ canal: 'OFICIAL', n: 1 }] })), 'nao-elegiveis')).toBe('1 cliente foi marcado como não elegível.');
    const zero = manha(com({ naoElegiveis: 0, nePorCampanha: [] }));
    expect(trecho(zero, 'nao-elegiveis')).toBe('Nenhum cliente foi marcado como não elegível.');
    expect(zero.some((t) => t.id === 'campanha-ne')).toBe(false);
    expect(trecho(manha(com({ naoElegiveis: 8, nePorCampanha: [{ canal: 'ANTONIO CAMPANHA', n: 5 }, { canal: 'OFICIAL', n: 3 }] })), 'campanha-ne'))
      .toBe('A campanha com mais não elegíveis é a campanha Antônio, com 5 clientes.');
    expect(trecho(manha(com({ naoElegiveis: 10, nePorCampanha: [{ canal: 'EMPRESTIMO', n: 4 }, { canal: 'ANTONIO CAMPANHA', n: 5 }, { canal: 'EMPRÉSTIMO', n: 1 }] })), 'campanha-ne'))
      .toBe('As campanhas com mais não elegíveis são a do Empréstimo e a campanha Antônio, com 5 clientes cada.');
  });

  it('melhor de ontem: gênero, singular, empate e ninguém', () => {
    const ontem = (m: ResumoGestor['melhorOntem']) => trecho(manha(com({ melhorOntem: m })), 'melhor-ontem');
    expect(ontem({ n: 1, nomes: ['Matheus'] })).toBe('O melhor vendedor de ontem foi o Matheus, com 1 contrato fechado.');
    expect(ontem({ n: 3, nomes: ['Juliana', 'Matheus'] })).toBe('Os melhores vendedores de ontem foram a Juliana e o Matheus, com 3 contratos cada.');
    expect(ontem({ n: 3, nomes: ['Juliana', 'Isadora'] })).toBe('As melhores vendedoras de ontem foram a Juliana e a Isadora, com 3 contratos cada.');
    expect(ontem(null)).toBe('Ontem não houve contratos fechados.');
  });

  it('fechados hoje: plural, singular e zero', () => {
    expect(trecho(manha(com({ fechadosHoje: 1 })), 'fechados')).toBe('Hoje já foi fechado 1 contrato.');
    expect(trecho(manha(com({ fechadosHoje: 0 })), 'fechados')).toBe('Hoje ainda não teve nenhum fechamento.');
  });

  it('casos críticos: um trecho por caso; nenhum = um trecho só', () => {
    const c = manha(com({ criticos: { desconectados: ['EMPRESTIMO', 'ANTONIO CAMPANHA', 'EMPRÉSTIMO'], iaSemCredito: true, semDono: 3 } }))
      .filter((t) => t.id === 'criticos').map((t) => t.texto);
    expect(c).toEqual([
      'Casos críticos:',
      'Os números do Empréstimo e da campanha Antônio estão desconectados.',
      'A IA está sem crédito e parou de responder os clientes.',
      '3 clientes novos estão sem dono.',
    ]);
    expect(trecho(manha(com({ criticos: { desconectados: [], iaSemCredito: false, semDono: 1 } })), 'criticos'))
      .toBe('Casos críticos: 1 cliente novo está sem dono.');
    expect(trecho(manha(com({ criticos: { desconectados: ['OFICIAL'], iaSemCredito: false, semDono: 0 } })), 'criticos'))
      .toBe('Casos críticos: O número oficial está desconectado.');
    expect(manha(com({ criticos: { desconectados: [], iaSemCredito: false, semDono: 0 } })).filter((t) => t.id === 'criticos'))
      .toEqual([{ id: 'criticos', texto: 'Nenhum caso crítico no momento.' }]);
  });
});

describe('bom dia do ADMINISTRADOR: 17h, o diagnóstico do dia', () => {
  it('com os números reais de hoje', () => {
    const f = tarde(real);
    expect(f.map((t) => t.id)).toEqual(['saudacao', 'fechados', 'melhor-vendedor', 'melhor-campanha', 'leads', 'criticos', 'criticos', 'fecho']);
    expect(textoCorrido(f)).toBe(
      'Olá, Murilo, seu diagnóstico do dia chegou. '
      + 'Até o momento, fechamos 3 clientes. '
      + 'Quem mais vendeu hoje foi a Juliana, com 2 contratos fechados. '
      + 'A melhor campanha até o momento é a campanha Antônio, com 29 leads. '
      + 'Hoje entraram 41 leads no sistema, e 16 foram marcados como não elegíveis. '
      + 'Casos críticos: O número do Empréstimo está desconectado. '
      + 'Bom fim de dia!',
    );
  });

  it('fechados e quem mais vendeu: singular, zero, empate, gênero', () => {
    expect(trecho(tarde(com({ fechadosHoje: 1 })), 'fechados')).toBe('Até o momento, fechamos 1 cliente.');
    expect(trecho(tarde(com({ fechadosHoje: 0 })), 'fechados')).toBe('Até o momento, ainda não fechamos nenhum cliente hoje.');
    const hoje = (m: ResumoGestor['melhorHoje']) => trecho(tarde(com({ melhorHoje: m })), 'melhor-vendedor');
    expect(hoje({ n: 2, nomes: ['Juliana', 'Isadora'] })).toBe('Quem mais vendeu hoje foram a Juliana e a Isadora, com 2 contratos cada.');
    expect(hoje({ n: 1, nomes: ['Matheus'] })).toBe('Quem mais vendeu hoje foi o Matheus, com 1 contrato fechado.');
    expect(hoje(null)).toBe('Hoje ninguém fechou contrato ainda.');
  });

  it('melhor campanha (empate) e leads: com e sem não elegíveis, um, nenhum (pula a melhor campanha)', () => {
    expect(trecho(tarde(com({ chegaram: 24, porCampanha: [{ canal: 'ANTONIO CAMPANHA', n: 12 }, { canal: 'JUROS ABUSIVO (ANDRIUS)', n: 12 }] })), 'melhor-campanha'))
      .toBe('As melhores campanhas até o momento são a campanha Antônio e a campanha Andrius, com 12 leads cada.');
    expect(trecho(tarde(com({ naoElegiveis: 0 })), 'leads')).toBe('Hoje entraram 41 leads no sistema.');
    expect(trecho(tarde(com({ naoElegiveis: 1 })), 'leads')).toBe('Hoje entraram 41 leads no sistema, e 1 foi marcado como não elegível.');
    expect(trecho(tarde(com({ chegaram: 1, porCampanha: [{ canal: 'OFICIAL', n: 1 }], naoElegiveis: 0 })), 'leads')).toBe('Hoje entrou 1 lead no sistema.');
    const zero = tarde(com({ chegaram: 0, porCampanha: [] }));
    expect(trecho(zero, 'leads')).toBe('Hoje nenhum lead entrou no sistema.');
    expect(zero.some((t) => t.id === 'melhor-campanha')).toBe(false);
  });

  it('o mesmo resumo fala diferente às 8h e às 17h', () => {
    expect(manha(real)[0].texto).not.toBe(tarde(real)[0].texto);
    const f = tarde(real);
    expect(f[f.length - 1].texto).toBe('Bom fim de dia!');
  });
});

describe('bom dia: o jsonb da RPC → a tela', () => {
  it('gestor (com ne_por_campanha e melhor_hoje) e vendedor', () => {
    const g = resumoDaRpc({
      modo: 'gestor', chegaram: 41, por_campanha: [{ canal: 'ANTONIO CAMPANHA', n: 29 }, { canal: null, n: 2 }], nao_elegiveis: 16,
      ne_por_campanha: [{ canal: 'EMPRESTIMO', n: 6 }], fechados_hoje: 3, melhor_ontem: { n: 5, nomes: ['Juliana'] }, melhor_hoje: null,
      criticos: { desconectados: ['EMPRESTIMO'], ia_sem_credito: false, sem_dono: 0 },
    });
    expect(g).toEqual({
      modo: 'gestor', chegaram: 41, porCampanha: [{ canal: 'ANTONIO CAMPANHA', n: 29 }, { canal: 'Sem campanha', n: 2 }], naoElegiveis: 16,
      nePorCampanha: [{ canal: 'EMPRESTIMO', n: 6 }], fechadosHoje: 3, melhorOntem: { n: 5, nomes: ['Juliana'] }, melhorHoje: null,
      criticos: { desconectados: ['EMPRESTIMO'], iaSemCredito: false, semDono: 0 },
      leadsOntemMesmaHora: null, iaAtendeuHoje: null,
    });
    // campo faltando (RPC antiga): não quebra
    const velho = resumoDaRpc({ modo: 'gestor', chegaram: 2 }) as ResumoGestor;
    expect(velho.nePorCampanha).toEqual([]);
    expect(velho.melhorHoje).toBeNull();
    expect(velho.criticos).toEqual({ desconectados: [], iaSemCredito: false, semDono: 0 });
    expect(resumoDaRpc({ modo: 'vendedor', novos: 3, sem_resposta: '2', passados: 0, presenciais: 1 }))
      .toEqual({ modo: 'vendedor', novos: 3, semResposta: 2, passados: 0, presenciais: 1 });
  });
});

describe('bom dia do ADMINISTRADOR: o painel (o cartão nunca cresce com os dados)', () => {
  it('casos críticos: no máximo 3 itens — os números caídos viram UM só, como na fala (queda do servidor, 29/10)', () => {
    const servidor = { desconectados: ['EMPRESTIMO', 'ANTONIO CAMPANHA', 'JUROS ABUSIVO (ANDRIUS)', 'OFICIAL', 'MURILLO CHIP', 'EMPRÉSTIMO'], iaSemCredito: true, semDono: 3 };
    expect(casosDoPainel(servidor)).toEqual([
      { k: 'numeros', titulo: '5 números desconectados', sub: 'Empréstimo, Antônio, Andrius +2' },
      { k: 'ia', titulo: 'IA sem crédito', sub: 'parou de responder os clientes' },
      { k: 'dono', titulo: '3 clientes novos sem dono' },
    ]);
    expect(casosDoPainel({ desconectados: ['EMPRESTIMO', 'ANTONIO CAMPANHA'], iaSemCredito: false, semDono: 1 })).toEqual([
      { k: 'numeros', titulo: '2 números desconectados', sub: 'Empréstimo e Antônio' },
      { k: 'dono', titulo: '1 cliente novo sem dono' },
    ]);
    expect(casosDoPainel({ desconectados: ['ANTONIO CAMPANHA'], iaSemCredito: false, semDono: 0 }))
      .toEqual([{ k: 'numeros', titulo: 'Número desconectado', sub: 'Campanha Antônio' }]);
    expect(casosDoPainel({ desconectados: ['EMPRESTIMO', 'EMPRÉSTIMO'], iaSemCredito: false, semDono: 0 }))
      .toEqual([{ k: 'numeros', titulo: 'Número desconectado', sub: 'Empréstimo' }]);   // o mesmo número, grafado 2x
    expect(casosDoPainel({ desconectados: [], iaSemCredito: false, semDono: 0 })).toEqual([]);
    // 20 números caídos: ainda 1 item, e a 2ª linha não passa de 3 nomes
    const muitos = casosDoPainel({ desconectados: Array.from({ length: 20 }, (_, i) => `CHIP ${i}`), iaSemCredito: true, semDono: 40 });
    expect(muitos).toHaveLength(3);
    expect(muitos[0]).toEqual({ k: 'numeros', titulo: '20 números desconectados', sub: 'Chip 0, Chip 1, Chip 2 +17' });
  });

  it('não elegíveis: a campanha com mais numa linha; no empate, os nomes curtos (antes: "mais no Empréstimo e na campanha A…")', () => {
    expect(detalheNaoElegiveis(real)).toBe('mais no Empréstimo · 7');
    expect(detalheNaoElegiveis({ naoElegiveis: 5, nePorCampanha: [{ canal: 'ANTONIO CAMPANHA', n: 5 }] })).toBe('mais na campanha Antônio · 5');
    expect(detalheNaoElegiveis({ naoElegiveis: 10, nePorCampanha: [{ canal: 'EMPRESTIMO', n: 5 }, { canal: 'ANTONIO CAMPANHA', n: 5 }] }))
      .toBe('Empréstimo e Antônio · 5 cada');
    expect(detalheNaoElegiveis({ naoElegiveis: 15, nePorCampanha: [{ canal: 'EMPRESTIMO', n: 5 }, { canal: 'ANTONIO CAMPANHA', n: 5 }, { canal: 'JUROS ABUSIVO (ANDRIUS)', n: 5 }] }))
      .toBe('Empréstimo, Antônio e Andrius · 5 cada');
    expect(detalheNaoElegiveis({ naoElegiveis: 0, nePorCampanha: [] })).toBe('nenhum hoje');
    expect(detalheNaoElegiveis({ naoElegiveis: 2, nePorCampanha: [{ canal: 'Sem campanha', n: 2 }] })).toBe('marcados hoje');
  });

  it('o nome curto (lista apertada, empate, números caídos): o rótulo sem o "Campanha " da frente', () => {
    expect(['ANTONIO CAMPANHA', 'JUROS ABUSIVO (ANDRIUS)', 'EMPRESTIMO', 'EMPRÉSTIMO', 'OFICIAL', 'MURILLO CHIP', 'DISPAROS', 'Sem campanha']
      .map((c) => nomeCampanha(c).curto))
      .toEqual(['Antônio', 'Andrius', 'Empréstimo', 'Empréstimo', 'Número oficial', 'Chip do Murillo', 'Disparos', 'Sem campanha']);
    for (const c of ['ANTONIO CAMPANHA', 'JUROS ABUSIVO (ANDRIUS)', 'OFICIAL', 'DISPAROS']) {
      const n = nomeCampanha(c);
      expect(n.rotulo.endsWith(n.curto), c).toBe(true);   // a tela esconde só o prefixo
    }
  });
});

describe('bom dia: a prévia (os textos dos áudios da demo)', () => {
  // o seed do administrador; os áudios /demo-midia/bom-dia-gestor-{manha,tarde}-despina.wav e
  // /demo-midia/bom-dia-apresentacao-{1,2}-despina.wav saem DESTES textos
  const g = seedResumoBomDia(true) as ResumoGestor;

  it('o seed exercita o agrupamento, o empate, a comparação com ontem e a IA', () => {
    expect(agruparCampanhas(g.nePorCampanha).map((x) => [x.nome.rotulo, x.n])).toEqual([['Empréstimo', 3], ['Campanha Antônio', 1]]);
    expect(g.melhorHoje).toEqual({ n: 2, nomes: ['Juliana', 'Isadora'] });
    expect(g.fechadosHoje).toBeGreaterThanOrEqual(g.melhorHoje!.n * g.melhorHoje!.nomes.length); // a fala não se contradiz
    expect(g.porCampanha.reduce((a, x) => a + x.n, 0)).toBe(g.chegaram);
    expect(g.nePorCampanha.reduce((a, x) => a + x.n, 0)).toBe(g.naoElegiveis);
    expect([g.leadsOntemMesmaHora, g.iaAtendeuHoje]).toEqual([16, 12]);   // SINTESE-PUB2 §3
  });

  it('manhã, 08:00', () => {
    const f = montarFala('Murilo', g, { momento: 'manha', agora: dia(8) });
    // §8: a comparação logo depois dos leads; a IA depois da campanha com mais não elegíveis
    expect(f.map((t) => t.id)).toEqual([
      'saudacao', 'saudacao', 'leads', 'leads', 'comparacao', 'melhor-campanha', 'nao-elegiveis', 'campanha-ne', 'ia', 'melhor-ontem',
      'fechados', 'criticos', 'criticos', 'criticos', 'fecho',
    ]);
    expect(textoCorrido(f)).toBe(
      'Bom dia, Murilo, tudo bem? Seja bem-vindo ao seu acesso de administrador. Aqui você pode acompanhar o desempenho da sua equipe. '
      + 'Até o momento, entraram 20 leads no sistema: 6 do número oficial, 5 da campanha Antônio, 5 da campanha Andrius e 4 do chip do Murillo. '
      + 'São 4 a mais que ontem no mesmo horário, quando eram 16. '
      + 'A melhor campanha até agora é a do número oficial, com 6 leads. '
      + '4 clientes foram marcados como não elegíveis. '
      + 'A campanha com mais não elegíveis é a do Empréstimo, com 3 clientes. '
      + 'A IA atendeu 12 leads hoje. '
      + 'A melhor vendedora de ontem foi a Juliana, com 5 contratos fechados. '
      + 'Hoje já foram fechados 4 contratos. '
      + 'Casos críticos: O número do Empréstimo está desconectado. 3 clientes novos estão sem dono. '
      + 'Bom trabalho!',
    );
  });

  it('17h', () => {
    const f = montarFala('Murilo', g, { momento: 'tarde', agora: dia(17) });
    // §8: a comparação depois dos leads; a IA depois da comparação
    expect(f.map((t) => t.id)).toEqual([
      'saudacao', 'fechados', 'melhor-vendedor', 'melhor-campanha', 'leads', 'comparacao', 'ia', 'criticos', 'criticos', 'criticos', 'fecho',
    ]);
    expect(textoCorrido(f)).toBe(
      'Olá, Murilo, seu diagnóstico do dia chegou. '
      + 'Até o momento, fechamos 4 clientes. '
      + 'Quem mais vendeu hoje foram a Juliana e a Isadora, com 2 contratos cada. '
      + 'A melhor campanha até o momento é a do número oficial, com 6 leads. '
      + 'Hoje entraram 20 leads no sistema, e 4 foram marcados como não elegíveis. '
      + 'São 4 a mais que ontem no mesmo horário, quando eram 16. '
      + 'A IA atendeu 12 leads hoje. '
      + 'Casos críticos: O número do Empréstimo está desconectado. 3 clientes novos estão sem dono. '
      + 'Bom fim de dia!',
    );
  });

  it('apresentação: as duas falas (o roteiro, literal)', () => {
    // o texto não depende da hora: a parte das 8h diz "Bom dia" mesmo apresentada às 17h
    const [p1, p2] = falasDaTela('Murilo', g, 'apresentacao', dia(17));
    expect(textoCorrido(p1)).toBe(
      'Olá, Murilo! Eu sou a assistente do Atenvo. A partir de agora, todos os dias, eu vou te passar os números da sua equipe. '
      + 'Às oito da manhã, você recebe o resumo da manhã. Ele fica assim. '
      + textoCorrido(montarFala('Murilo', g, { momento: 'manha', agora: dia(8) })),
    );
    expect(textoCorrido(p2)).toBe(
      'E às cinco da tarde, eu te entrego o diagnóstico do dia. Fica assim. '
      + 'Olá, Murilo, seu diagnóstico do dia chegou. '
      + 'Até o momento, fechamos 4 clientes. '
      + 'Quem mais vendeu hoje foram a Juliana e a Isadora, com 2 contratos cada. '
      + 'A melhor campanha até o momento é a do número oficial, com 6 leads. '
      + 'Hoje entraram 20 leads no sistema, e 4 foram marcados como não elegíveis. '
      + 'São 4 a mais que ontem no mesmo horário, quando eram 16. '
      + 'A IA atendeu 12 leads hoje. '
      + 'Casos críticos: O número do Empréstimo está desconectado. 3 clientes novos estão sem dono. '
      + 'É isso, Murilo. Quando quiser me ouvir de novo, é só abrir o menu e clicar em Ouvir o bom dia. Seja bem-vindo ao Atenvo!',
    );
    expect(falasDaTela('Murilo', g, 'apresentacao', dia(8)).map(textoCorrido)).toEqual([p1, p2].map(textoCorrido));
    // cada fala da demo cabe num pedido só (um áudio por parte: bom-dia-apresentacao-1/-2)
    expect([p1, p2].map((f) => blocosDaVoz(f).length)).toEqual([1, 1]);
  });

  it('a atendente da prévia segue com o texto do áudio que já existe', () => {
    expect(textoCorrido(montarFala('Juliana', seedResumoBomDia(false)))).toBe(
      'Olá, Juliana! Seja bem-vinda ao Atenvo. Hoje você tem 12 novos clientes e 8 clientes sem resposta. '
      + 'Informações importantes: O robô passou 3 clientes para você. Eles estão esperando atendimento. '
      + 'Você tem 2 atendimentos presenciais hoje. Bom trabalho!',
    );
  });

  it('o texto mais longo do administrador cabe na voz (bom-dia-voz aceita até 1200 caracteres)', () => {
    const pesado = com({
      chegaram: 66,
      porCampanha: ['OFICIAL', 'ANTONIO CAMPANHA', 'JUROS ABUSIVO (ANDRIUS)', 'MURILLO CHIP', 'EMPRESTIMO', 'DISPAROS', 'Sem campanha']
        .map((canal, i) => ({ canal, n: i < 2 ? 12 : 9 - i })),
      naoElegiveis: 23,
      nePorCampanha: [{ canal: 'EMPRESTIMO', n: 8 }, { canal: 'ANTONIO CAMPANHA', n: 8 }, { canal: 'OFICIAL', n: 7 }],
      melhorOntem: { n: 3, nomes: ['Juliana', 'Isadora', 'Matheus'] },
      melhorHoje: { n: 3, nomes: ['Juliana', 'Isadora', 'Matheus'] },
      criticos: { desconectados: ['EMPRESTIMO', 'OFICIAL', 'MURILLO CHIP'], iaSemCredito: true, semDono: 12 },
    });
    for (const f of [manha(pesado, 'Maria Eduarda'), tarde(pesado, 'Maria Eduarda')]) {
      expect(textoCorrido(f).length).toBeLessThanOrEqual(1200);
      for (const t of f) expect(t.texto.length, t.texto).toBeLessThanOrEqual(150);
    }
    // a apresentação do mesmo dia: cada fala cabe ou sai em pedaços que cabem, o texto igual
    for (const f of montarApresentacao('Maria Eduarda', com({ ...pesado, leadsOntemMesmaHora: 125, iaAtendeuHoje: 37 }), dia(17))) {
      const pedacos = blocosDaVoz(f);
      for (const p of pedacos) expect(textoCorrido(p).length).toBeLessThanOrEqual(MAX_CHARS_VOZ);
      expect(pedacos.map(textoCorrido).join(' ')).toBe(textoCorrido(f));
    }
  });

  it('o pior dia na apresentação: a 1ª fala passa de 1.200 e vai em DOIS pedidos (antes: a função recusava e ficava sem voz)', () => {
    const pior = com({
      chegaram: 133,
      porCampanha: [
        { canal: 'ANTONIO CAMPANHA', n: 41 }, { canal: 'JUROS ABUSIVO (ANDRIUS)', n: 41 }, { canal: 'OFICIAL', n: 19 }, { canal: 'MURILLO CHIP', n: 12 },
        { canal: 'EMPRESTIMO', n: 8 }, { canal: 'EMPRESTIMO DIEGO', n: 8 }, { canal: 'Sem campanha', n: 4 },
      ],
      naoElegiveis: 18, nePorCampanha: [{ canal: 'EMPRESTIMO', n: 5 }, { canal: 'ANTONIO CAMPANHA', n: 5 }, { canal: 'OFICIAL', n: 4 }],
      fechadosHoje: 6, melhorOntem: { n: 3, nomes: ['Juliana', 'Gabriela', 'Isadora'] }, melhorHoje: { n: 2, nomes: ['Juliana', 'Gabriela', 'Isadora'] },
      criticos: { desconectados: ['EMPRESTIMO', 'ANTONIO CAMPANHA', 'JUROS ABUSIVO (ANDRIUS)', 'OFICIAL', 'MURILLO CHIP'], iaSemCredito: true, semDono: 12 },
      leadsOntemMesmaHora: 47, iaAtendeuHoje: 37,
    });
    const [p1, p2] = montarApresentacao('Maria Eduarda', pior, dia(17));
    expect(textoCorrido(p1).length).toBeGreaterThan(MAX_CHARS_VOZ);
    const pedacos = blocosDaVoz(p1);
    expect(pedacos).toHaveLength(2);
    for (const p of pedacos) expect(textoCorrido(p).length).toBeLessThanOrEqual(MAX_CHARS_VOZ);
    expect(pedacos.map(textoCorrido).join(' ')).toBe(textoCorrido(p1));      // sem mudar o texto
    expect(Math.abs(textoCorrido(pedacos[0]).length - textoCorrido(pedacos[1]).length)).toBeLessThan(250);   // equilibrados
    expect(blocosDaVoz(p2)).toHaveLength(1);
  });

  it('nenhuma "página" da legenda passa de ~2 linhas (≤ 110 caracteres)', () => {
    for (const f of [
      montarFala('Murilo', g, { momento: 'manha', agora: dia(8) }), montarFala('Murilo', g, { momento: 'tarde', agora: dia(17) }), manha(real), tarde(real),
      ...falasDaTela('Murilo', g, 'apresentacao', dia(17)),
    ]) {
      for (const t of f) expect(t.texto.length, t.texto).toBeLessThanOrEqual(110);
    }
  });
});

describe('bom dia do ADMINISTRADOR: comparação com ontem e o trabalho da IA (SINTESE-GESTOR-V2 §8)', () => {
  it('todas as faixas da comparação, nesta ordem', () => {
    expect(fraseComparacao(57, null)).toBeNull();                 // RPC antiga: pula (nunca "não tinha nenhum")
    expect(fraseComparacao(0, 0)).toBeNull();                     // hoje e ontem zero: pula
    expect(fraseComparacao(5, 0)).toBe('Ontem, no mesmo horário, ainda não tinha entrado nenhum lead.');
    expect(fraseComparacao(257, 125)).toBe('É mais que o dobro de ontem no mesmo horário, quando eram 125.');
    expect(fraseComparacao(250, 125)).toBe('São 125 a mais que ontem no mesmo horário, quando eram 125.');   // o dobro exato não é "mais que o dobro"
    expect(fraseComparacao(47, 35)).toBe('São 12 a mais que ontem no mesmo horário, quando eram 35.');
    expect(fraseComparacao(50, 47)).toBe('Praticamente o mesmo que ontem no mesmo horário, quando eram 47.');   // até 10%
    expect(fraseComparacao(52, 47)).toBe('São 5 a mais que ontem no mesmo horário, quando eram 47.');         // passou de 10%
    expect(fraseComparacao(47, 59)).toBe('São 12 a menos que ontem no mesmo horário, quando eram 59.');
    expect(fraseComparacao(60, 125)).toBe('É menos da metade de ontem no mesmo horário, quando eram 125.');
    expect(fraseComparacao(0, 125)).toBe('É menos da metade de ontem no mesmo horário, quando eram 125.');
    expect(fraseComparacao(20, 16)).toBe('São 4 a mais que ontem no mesmo horário, quando eram 16.');          // o seed da prévia
    expect(fraseComparacao(57, 125)).toBe('É menos da metade de ontem no mesmo horário, quando eram 125.');    // os números de hoje ~15h
    expect(fraseComparacao(3, 1)).toBe('É mais que o dobro de ontem no mesmo horário, quando era 1.');
    expect(fraseComparacao(12, 11)).toBe('Praticamente o mesmo que ontem no mesmo horário, quando eram 11.');
    expect(fraseComparacao(14, 12)).toBe('São 2 a mais que ontem no mesmo horário, quando eram 12.');
    expect(fraseComparacao(10, 11)).toBe('Praticamente o mesmo que ontem no mesmo horário, quando eram 11.');
    expect(fraseComparacao(30, 32)).toBe('Praticamente o mesmo que ontem no mesmo horário, quando eram 32.');
    expect(fraseComparacao(28, 32)).toBe('São 4 a menos que ontem no mesmo horário, quando eram 32.');
    expect(fraseComparacao(9, 20)).toBe('É menos da metade de ontem no mesmo horário, quando eram 20.');
    expect(fraseComparacao(10, 20)).toBe('São 10 a menos que ontem no mesmo horário, quando eram 20.');          // a metade exata
  });

  it('a IA: plural, singular, zero e campo ausente', () => {
    expect(fraseIa(37)).toBe('A IA atendeu 37 leads hoje.');
    expect(fraseIa(1)).toBe('A IA atendeu 1 lead hoje.');
    expect(fraseIa(0)).toBe('A IA ainda não atendeu nenhum lead hoje.');
    expect(fraseIa(null)).toBeNull();
    // RPC antiga (sem os campos): a fala segue sem os dois trechos
    const f = manha(com({ leadsOntemMesmaHora: null, iaAtendeuHoje: null }));
    expect(f.some((t) => t.id === 'comparacao' || t.id === 'ia')).toBe(false);
  });

  it('o lugar dos trechos: 8h depois dos leads / da campanha com mais NE; 17h depois dos leads / da comparação', () => {
    const r = com({ leadsOntemMesmaHora: 125, iaAtendeuHoje: 37 });
    const ids8 = manha(r).map((t) => t.id);
    expect(ids8.slice(ids8.lastIndexOf('leads') + 1, ids8.lastIndexOf('leads') + 2)).toEqual(['comparacao']);
    expect(ids8[ids8.indexOf('campanha-ne') + 1]).toBe('ia');
    const ids17 = tarde(r).map((t) => t.id);
    expect(ids17.slice(ids17.indexOf('leads') + 1, ids17.indexOf('leads') + 3)).toEqual(['comparacao', 'ia']);
    // sem não elegíveis (pula a campanha-ne): a IA vem depois de "nenhum não elegível"
    const ids0 = manha(com({ leadsOntemMesmaHora: 10, iaAtendeuHoje: 3, naoElegiveis: 0, nePorCampanha: [] })).map((t) => t.id);
    expect(ids0[ids0.indexOf('nao-elegiveis') + 1]).toBe('ia');
  });
});

describe('bom dia: a APRESENTAÇÃO de lançamento (gestor, só pelo menu)', () => {
  const r = com({ leadsOntemMesmaHora: 125, iaAtendeuHoje: 37 });

  it('duas falas: a 1ª = quem ela é + o resumo das 8h inteiro; a 2ª = o das 17h SEM o "Bom fim de dia!" + o fecho', () => {
    const [p1, p2] = montarApresentacao('Murilo', r, dia(17, 40));
    expect(p1.slice(0, 3).map((t) => t.texto)).toEqual([
      'Olá, Murilo! Eu sou a assistente do Atenvo.',
      'A partir de agora, todos os dias, eu vou te passar os números da sua equipe.',
      'Às oito da manhã, você recebe o resumo da manhã. Ele fica assim.',
    ]);
    // o exemplo das 8h é o resumo de verdade (números de agora), com a saudação das 8h e o "Bom trabalho!"
    expect(textoCorrido(p1.slice(3))).toBe(textoCorrido(manha(r, 'Murilo', 8)));
    expect(p1[3].texto.startsWith('Bom dia, Murilo, tudo bem?')).toBe(true);
    expect(p2[0].texto).toBe('E às cinco da tarde, eu te entrego o diagnóstico do dia. Fica assim.');
    expect(textoCorrido(p2.slice(1, -3))).toBe(textoCorrido(tarde(r).slice(0, -1)));
    expect(p2.some((t) => t.texto === 'Bom fim de dia!')).toBe(false);
    expect(p2.slice(-3).map((t) => t.texto)).toEqual([
      'É isso, Murilo.',
      'Quando quiser me ouvir de novo, é só abrir o menu e clicar em Ouvir o bom dia.',
      'Seja bem-vindo ao Atenvo!',
    ]);
  });

  it('o nome vem do usuário; bem-vinda para nome feminino', () => {
    const [p1, p2] = montarApresentacao('Fernanda Lima', r, dia(10));
    expect(p1[0].texto).toBe('Olá, Fernanda! Eu sou a assistente do Atenvo.');
    expect(p1[3].texto).toBe('Bom dia, Fernanda, tudo bem? Seja bem-vinda ao seu acesso de administrador.');
    expect(p2.slice(-3).map((t) => t.texto)).toEqual([
      'É isso, Fernanda.',
      'Quando quiser me ouvir de novo, é só abrir o menu e clicar em Ouvir o bom dia.',
      'Seja bem-vinda ao Atenvo!',
    ]);
  });

  it('as falas da tela: o resumo = 1; a apresentação = 2 (de quem não é gestor, o resumo dele)', () => {
    expect(falasDaTela('Murilo', r, 'manha', dia(8)).map(textoCorrido)).toEqual([textoCorrido(manha(r))]);
    expect(falasDaTela('Murilo', r, 'tarde', dia(17)).map(textoCorrido)).toEqual([textoCorrido(tarde(r))]);
    expect(falasDaTela('Murilo', r, 'apresentacao', dia(17))).toHaveLength(2);
    const vend: ResumoVendedor = { modo: 'vendedor', novos: 2, semResposta: 1, passados: 0, presenciais: 0 };
    expect(falasDaTela('Juliana', vend, 'apresentacao', dia(17)).map(textoCorrido)).toEqual([textoCorrido(montarFala('Juliana', vend))]);
  });

  it('o painel de cada parte: selo, saudação, fecho, botão e se segue sozinho', () => {
    const p = (tipo: 'manha' | 'tarde' | 'apresentacao', parte = 0, nPartes = tipo === 'apresentacao' ? 2 : 1, gestor = true) =>
      painelDaTela({ tipo, parte, nPartes, gestor, nome: 'Murilo', agora: dia(17, 40) });
    expect(p('apresentacao', 0)).toEqual({
      tarde: false, selo: 'Resumo da manhã', saudacao: 'Bom dia', fecho: 'Bom trabalho!', comHora: false, cta: 'Continuar', avanca: true,
    });
    expect(p('apresentacao', 1)).toEqual({
      tarde: true, selo: 'Diagnóstico do dia', saudacao: 'Boa tarde', fecho: 'Seja bem-vindo ao Atenvo!', comHora: false, cta: 'Começar', avanca: false,
    });
    expect(painelDaTela({ tipo: 'apresentacao', parte: 1, nPartes: 2, gestor: true, nome: 'Fernanda', agora: dia(17) }).fecho).toBe('Seja bem-vinda ao Atenvo!');
    // o resumo de sempre (nada muda): 8h "Começar o dia"; 17h "Continuar" com "Bom fim de dia, Murilo!"
    expect(p('manha')).toEqual({ tarde: false, selo: null, saudacao: 'Boa tarde', fecho: 'Bom trabalho!', comHora: true, cta: 'Começar o dia', avanca: false });
    expect(p('tarde')).toEqual({ tarde: true, selo: null, saudacao: 'Boa tarde', fecho: 'Bom fim de dia, Murilo!', comHora: true, cta: 'Continuar', avanca: false });
    // vendedor nunca tem a tarde nem a apresentação
    expect(p('apresentacao', 0, 1, false)).toMatchObject({ tarde: false, selo: null, cta: 'Começar o dia', avanca: false });
    expect(p('tarde', 0, 1, false)).toMatchObject({ tarde: false, cta: 'Começar o dia' });
  });

  it('a tela do play', () => {
    expect(textosDoPlay('apresentacao', true)).toEqual({
      linha: 'A apresentação do bom dia está pronta.', preparando: 'Preparando a apresentação…', botao: 'Ouvir a apresentação',
    });
    expect(textosDoPlay('manha', true)).toEqual({ linha: 'Seu resumo da manhã está pronto.', preparando: 'Preparando o seu resumo…', botao: 'Ouvir o resumo' });
    expect(textosDoPlay('tarde', true).linha).toBe('O resumo do dia está pronto.');
    expect(textosDoPlay('manha', false).botao).toBe('Ouvir o resumo');
  });

  it('a tela da apresentação é OUTRA tela (o Hud remonta) e o resumo do momento espera ela fechar', () => {
    const ap: TelaBomDia = { momento: 'tarde', dia: '2026-10-30', apresentacao: true };
    expect(chaveTelaBomDia(ap)).toBe('apresentacao-2026-10-30');
    expect(chaveTelaBomDia({ momento: 'tarde', dia: '2026-10-30' })).toBe('tarde-2026-10-30');
    // aberta pelo menu às 16h59: às 17h o diagnóstico espera ela fechar (não toca os dois)
    expect(proximaTelaBomDia(ap, 'tarde', dia(17, 0))).toBe('esperar');
  });
});

describe('bom dia: a voz em pedaços (bom-dia-voz aceita até 1.200 caracteres por pedido)', () => {
  const tr = (n: number, tam: number): Trecho[] => Array.from({ length: n }, (_, i) => ({ id: 'leads', texto: `${String(i).padStart(3, '0')}${'x'.repeat(tam - 4)}.` }));

  it('cabe: um pedaço só, o MESMO texto (o cache da voz continua valendo)', () => {
    const f = tr(10, 100);   // 10 × 100 + 9 espaços = 1009
    expect(blocosDaVoz(f)).toEqual([f]);
    expect(blocosDaVoz([])).toEqual([]);
    expect(MAX_CHARS_VOZ).toBe(1200);
  });

  it('não cabe: o menor número de pedaços, equilibrados, cortados entre frases — juntos dão o texto inteiro', () => {
    const f = tr(15, 100);   // 1514 caracteres → 2 pedaços de ~750 (não 1200 + 314)
    const b = blocosDaVoz(f);
    expect(b).toHaveLength(2);
    expect(b.map((x) => x.length)).toEqual([8, 7]);
    for (const x of b) expect(textoCorrido(x).length).toBeLessThanOrEqual(1200);
    expect(b.map(textoCorrido).join(' ')).toBe(textoCorrido(f));
    expect(b.flat()).toEqual(f);
    // 3 pedaços quando 2 não cabem
    const g = tr(30, 100);
    const b3 = blocosDaVoz(g);
    expect(b3).toHaveLength(3);
    expect(b3.map((x) => x.length)).toEqual([10, 10, 10]);
    expect(b3.flat()).toEqual(g);
  });

  it('uma frase maior que o teto fica sozinha (nunca cortada no meio)', () => {
    const f = [...tr(2, 100), { id: 'leads' as const, texto: 'y'.repeat(1300) }, ...tr(2, 100)];
    const b = blocosDaVoz(f);
    expect(b.flat()).toEqual(f);
    expect(b.some((x) => x.length === 1 && x[0].texto.length === 1300)).toBe(true);
  });

  it('os pedaços tocam como UM áudio: juntos, com o respiro entre eles (vira pausa real)', () => {
    const a = new Float32Array([0.1, 0.2]);
    const b = new Float32Array([0.3]);
    expect(juntarPcm([a], 10)).toBe(a);
    const j = juntarPcm([a, b], 10, 0.3);
    expect(Array.from(j)).toEqual([a[0], a[1], 0, 0, 0, b[0]]);
    expect(juntarPcm([a, b, a], 10, 0.1)).toHaveLength(2 + 1 + 1 + 1 + 2);
    expect(PAUSA_ENTRE_PEDACOS_S).toBeGreaterThanOrEqual(0.16);   // ≥ a pausa mínima que a legenda reconhece
    // e o mapa da fala acha essa pausa: a frase do 2º pedaço começa nela
    const taxa = 8000;
    const voz = (s: number) => Float32Array.from({ length: Math.round(s * taxa) }, (_, i) => Math.sin(i / 3) * 0.5);
    const junto = juntarPcm([voz(2), voz(2)], taxa);
    const an = analisarVoz(junto, taxa);
    expect(an.pausas).toHaveLength(1);
    expect(an.pausas[0]).toBeCloseTo(2 + PAUSA_ENTRE_PEDACOS_S / 2, 1);
  });
});

describe('bom dia: a Central de Avisos fora do perfil gestor (dono 30/10)', () => {
  it('/radar: gestor → Dashboard; vendedor (Matheus, atendentes) → a Central; perfil ainda não lido → espera', () => {
    expect(destinoDaCentral('gestor')).toBe('dashboard');
    expect(destinoDaCentral('vendedor')).toBe('central');
    expect(destinoDaCentral(null)).toBe('esperar');
  });
});
