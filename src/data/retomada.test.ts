// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({ supabase: null, isSupabaseConfigured: false }));
vi.mock('@/context/OrgContext', () => ({ useOrg: () => ({ currentOrg: { id: 'o' } }) }));

const {
  capacidadeDia, CONFIG_PADRAO, dentroDoHorario, diasTexto, duracaoTexto, esperaCurta, esperaLonga, historicoDemo, intervaloEfetivo,
  juntarEspera, nomeBonito, normalizarConfig, normalizarHistorico, normalizarPassos, numeroLivre, passoNovo, passosParaBanco, previaTexto,
  primeiroNome, proximoPasso, relogioSP, renderizarTexto, separarEspera, validarConfig, validarPassos,
} = await import('./retomada');

const servidor = await import('../../supabase-reviza/functions/retomada-processar/texto');

const H = 3_600_000;
const T0 = Date.parse('2026-11-25T12:00:00-03:00'); // quarta, meio-dia em São Paulo

describe('retomada: o texto', () => {
  it('troca as variáveis com o nome do jeito que gente escreve', () => {
    expect(renderizarTexto('Oi, {primeiro_nome}! Aqui é {atendente}.', { nome: 'MARIA DA SILVA', atendente: 'Ana Paula Souza' })).toBe('Oi, Maria! Aqui é Ana.');
    expect(renderizarTexto('{nome}', { nome: 'joão dos santos' })).toBe('João dos Santos');
    expect(renderizarTexto('{ NOME }', { nome: 'Ana McDonald' })).toBe('Ana McDonald'); // escrito misturado: fica como veio
    expect(previaTexto('Oi, {primeiro_nome}')).toBe('Oi, Maria');
  });
  it('sem o nome do cliente, a pontuação se ajeita e o resto do texto não muda', () => {
    expect(renderizarTexto('Oi, {primeiro_nome}! Tudo bem?', { nome: null })).toBe('Oi! Tudo bem?');
    expect(renderizarTexto('Olá {primeiro_nome}, tudo bem?', { nome: '' })).toBe('Olá, tudo bem?');
    expect(renderizarTexto('Bom dia {nome}.', { nome: '5551999990000' })).toBe('Bom dia.'); // só o número = sem nome
    expect(renderizarTexto('{primeiro_nome}, passando aqui', { nome: null })).toBe('passando aqui');
    expect(renderizarTexto('Oi {nome} tudo certo', { nome: null })).toBe('Oi tudo certo');
    expect(renderizarTexto('Obrigado, {primeiro_nome}\nAté logo', { nome: null })).toBe('Obrigado\nAté logo');
    // com nome, nada em volta é mexido (nem espaço antes de pontuação que o dono escreveu)
    expect(renderizarTexto('Valor : R$ 1.000 , {primeiro_nome} !', { nome: 'Rui' })).toBe('Valor : R$ 1.000 , Rui !');
  });
  it('sem atendente na conversa, {atendente} vira "nossa equipe"', () => {
    expect(renderizarTexto('Aqui é {atendente}.', { nome: 'Ana', atendente: null })).toBe('Aqui é nossa equipe.');
  });
  it('a cópia do servidor (retomada-processar/texto.ts) dá exatamente o mesmo texto', () => {
    const textos = ['Oi, {primeiro_nome}! Aqui é {atendente}.', 'Olá {primeiro_nome}, tudo bem?', '{nome}', '{primeiro_nome}, passando aqui',
      'Oi {nome} tudo certo', 'Obrigado, {primeiro_nome}\nAté logo', 'Valor : R$ 1.000 , {primeiro_nome} !', 'Sem variável nenhuma.  ', '{ATENDENTE} e {Nome}'];
    const pessoas = [{ nome: 'MARIA DA SILVA', atendente: 'Ana Paula' }, { nome: null, atendente: null }, { nome: '5551999990000', atendente: 'GUSTAVO' }, { nome: 'Ana McDonald', atendente: '' }];
    for (const tx of textos) for (const p of pessoas) expect(servidor.renderizarTexto(tx, p)).toBe(renderizarTexto(tx, p));
    for (const n of ['MARIA DE LOURDES', 'ana-clara e silva', 'Ana McDonald', '+55 51', '']) expect(servidor.nomeBonito(n)).toBe(nomeBonito(n));
  });
  it('nome bonito e primeiro nome', () => {
    expect(nomeBonito('  MARIA   DE  LOURDES ')).toBe('Maria de Lourdes');
    expect(nomeBonito('ANA-CLARA E SILVA')).toBe('Ana-Clara e Silva');
    expect(nomeBonito('+55 (51) 99999-0000')).toBe('');
    expect(primeiroNome('JOSÉ CARLOS')).toBe('José');
    expect(primeiroNome(undefined)).toBe('');
  });
});

describe('retomada: quando o passo vence', () => {
  const passos = [{ esperaMin: 6 * 60, texto: 'a' }, { esperaMin: 1440, texto: 'b' }];
  const base = { ultimaDoClienteEm: T0 - 8 * H, ultimaNossaEm: T0 - 7 * H, enviadosNoCiclo: 0, inicio: T0 - 48 * H };
  it('nossa mensagem há 7 h com passo de 6 h: vencido há 1 h', () => {
    expect(proximoPasso(passos, base, T0)).toEqual({ passo: 1, venceEm: T0 - H, vencido: true });
    expect(proximoPasso(passos, { ...base, ultimaNossaEm: T0 - 5 * H }, T0)?.vencido).toBe(false);
  });
  it('o 2º passo conta da última mensagem nossa (a do 1º passo), não do cliente', () => {
    const r = proximoPasso(passos, { ...base, ultimaNossaEm: T0 - 10 * 60_000, enviadosNoCiclo: 1 }, T0);
    expect(r).toEqual({ passo: 2, venceEm: T0 - 10 * 60_000 + 24 * H, vencido: false });
    expect(proximoPasso(passos, { ...base, enviadosNoCiclo: 2 }, T0)).toBeNull(); // acabou a sequência
  });
  it('não vai: cliente respondeu, nunca falou, parou antes de ligar, envio falhou, texto de exemplo', () => {
    expect(proximoPasso(passos, { ...base, ultimaDoClienteEm: T0 - H }, T0)).toBeNull();
    expect(proximoPasso(passos, { ...base, ultimaDoClienteEm: null }, T0)).toBeNull();
    expect(proximoPasso(passos, { ...base, inicio: T0 - 2 * H }, T0)).toBeNull();
    expect(proximoPasso(passos, { ...base, falhouNoCiclo: true }, T0)).toBeNull();
    expect(proximoPasso([{ ...passos[0], exemplo: true }, passos[1]], base, T0)).toBeNull();
  });
});

describe('retomada: dias e horário em São Paulo', () => {
  const cfg = { dias: [1, 2, 3, 4, 5], horaIni: '08:00', horaFim: '20:00' };
  it('lê o relógio de São Paulo, não o do computador', () => {
    expect(relogioSP(new Date('2026-11-25T15:00:00Z'))).toEqual({ dia: 3, minutos: 12 * 60 });
    expect(relogioSP(new Date('2026-11-29T02:30:00Z'))).toEqual({ dia: 6, minutos: 23 * 60 + 30 }); // sábado 23:30 em SP, já domingo em UTC
  });
  it('dentro e fora do horário', () => {
    expect(dentroDoHorario(new Date(T0), cfg)).toBe(true);
    expect(dentroDoHorario(new Date('2026-11-25T07:59:00-03:00'), cfg)).toBe(false);
    expect(dentroDoHorario(new Date('2026-11-25T08:00:00-03:00'), cfg)).toBe(true);
    expect(dentroDoHorario(new Date('2026-11-25T20:00:00-03:00'), cfg)).toBe(false); // o fim não entra
    expect(dentroDoHorario(new Date('2026-11-28T12:00:00-03:00'), cfg)).toBe(false); // sábado
    expect(dentroDoHorario(new Date('2026-11-29T23:59:00-03:00'), { dias: [0], horaIni: '00:00', horaFim: '24:00' })).toBe(true);
  });
  it('os dias por extenso', () => {
    expect(diasTexto([1, 2, 3, 4, 5])).toBe('Seg a Sex');
    expect(diasTexto([0, 1, 2, 3, 4, 5, 6])).toBe('Todos os dias');
    expect(diasTexto([1, 3, 5])).toBe('Seg, Qua e Sex');
    expect(diasTexto([6, 0])).toBe('Sáb e Dom');
  });
});

describe('retomada: ritmo por número', () => {
  it('o intervalo na prática segue a rodada de 1 minuto do agendador e nunca fica abaixo de 45 s', () => {
    expect(intervaloEfetivo(90)).toBe(120);
    expect(intervaloEfetivo(45)).toBe(60);
    expect(intervaloEfetivo(10)).toBe(60);
    expect(intervaloEfetivo(300)).toBe(300);
  });
  it('número livre, no intervalo ou no teto do dia', () => {
    const cfg = { intervaloS: 90, tetoDia: 80 };
    expect(numeroLivre({ ultimoEnvioEm: null, enviadosHoje: 0 }, T0, cfg)).toBe('livre');
    expect(numeroLivre({ ultimoEnvioEm: T0 - 89_000, enviadosHoje: 3 }, T0, cfg)).toBe('intervalo');
    expect(numeroLivre({ ultimoEnvioEm: T0 - 90_000, enviadosHoje: 3 }, T0, cfg)).toBe('livre');
    expect(numeroLivre({ ultimoEnvioEm: T0 - 3 * H, enviadosHoje: 80 }, T0, cfg)).toBe('teto');
    expect(numeroLivre({ ultimoEnvioEm: T0 - 50_000, enviadosHoje: 0 }, T0, { intervaloS: 10, tetoDia: 80 })).toBe('livre'); // 45 s mínimo
    expect(numeroLivre({ ultimoEnvioEm: T0 - 40_000, enviadosHoje: 0 }, T0, { intervaloS: 10, tetoDia: 80 })).toBe('intervalo');
  });
  it('quantas cabem num dia: o teto ou o que o horário comporta', () => {
    expect(capacidadeDia(CONFIG_PADRAO)).toBe(80); // 12 h a cada 2 min = 360, o teto é 80
    expect(capacidadeDia({ horaIni: '08:00', horaFim: '09:00', intervaloS: 90, tetoDia: 80 })).toBe(30);
    expect(capacidadeDia({ horaIni: '08:00', horaFim: '08:00', intervaloS: 90, tetoDia: 80 })).toBe(0);
  });
  it('durações por extenso', () => {
    expect(duracaoTexto(45)).toBe('45 s');
    expect(duracaoTexto(90)).toBe('1 min 30 s');
    expect(duracaoTexto(120)).toBe('2 min');
    expect(duracaoTexto(3600)).toBe('1 h');
  });
});

describe('retomada: espera, conferência e leitura do servidor', () => {
  it('espera em horas e dias', () => {
    expect(separarEspera(360)).toEqual({ valor: 6, unidade: 'horas' });
    expect(separarEspera(2880)).toEqual({ valor: 2, unidade: 'dias' });
    expect(separarEspera(1500)).toEqual({ valor: 25, unidade: 'horas' });
    expect(juntarEspera(3, 'dias')).toBe(4320);
    expect([360, 1440, 2880].map(esperaCurta)).toEqual(['6 h', '1 dia', '2 dias']);
    expect(esperaLonga(60)).toBe('1 hora');
  });
  it('confere a configuração e as mensagens antes de gravar', () => {
    expect(validarConfig(CONFIG_PADRAO)).toBeNull();
    expect(validarConfig({ ...CONFIG_PADRAO, intervaloS: 30 })).toMatch(/45 segundos/);
    expect(validarConfig({ ...CONFIG_PADRAO, dias: [] })).toMatch(/um dia/);
    expect(validarConfig({ ...CONFIG_PADRAO, horaIni: '20:00', horaFim: '08:00' })).toMatch(/depois do começo/);
    expect(validarConfig({ ...CONFIG_PADRAO, tetoDia: 0 })).toMatch(/1 a 500/);
    expect(validarPassos([passoNovo(0)])).toBeNull();
    expect(validarPassos([])).toMatch(/pelo menos uma/);
    expect(validarPassos(Array.from({ length: 13 }, (_, i) => passoNovo(i)))).toMatch(/12/);
    expect(validarPassos([{ esperaMin: 30, texto: 'x' }])).toMatch(/1 hora a 30 dias/);
    expect(validarPassos([{ esperaMin: 60, texto: '   ' }])).toMatch(/Escreva/);
  });
  it('o rascunho do editor vem marcado como exemplo e com esperas crescentes', () => {
    expect([0, 1, 2, 3, 4, 9].map((i) => passoNovo(i).esperaMin)).toEqual([360, 1440, 2880, 8640, 10080, 10080]);
    expect(passoNovo(0).exemplo).toBe(true);
    expect(passosParaBanco([{ esperaMin: 60, texto: ' oi ' }])).toEqual([{ espera_min: 60, texto: 'oi' }]);
    expect(normalizarPassos([{ espera_min: '120', texto: 'x', exemplo: true }, { texto: 3 }])).toEqual([{ esperaMin: 120, texto: 'x', exemplo: true }, { esperaMin: 60, texto: '3' }]);
  });
  it('lê o que vem do servidor sem quebrar', () => {
    expect(normalizarConfig(null)).toEqual(CONFIG_PADRAO);
    expect(normalizarConfig({ ativo: true, dias: [1, '2', 9], hora_ini: '8:30:00', hora_fim: '24:00:00', intervalo_s: 120, teto_dia: '40' }))
      .toMatchObject({ ativo: true, dias: [1, 2], horaIni: '08:30', horaFim: '24:00', intervaloS: 120, tetoDia: 40 });
    const h = normalizarHistorico([{ id: 'x', cliente: 'ZILDA ALVES', passo: 2, status: 'estranho' }]);
    expect(h[0]).toMatchObject({ cliente: 'Zilda Alves', passo: 2, status: 'falhou', etapa: '—', conversaId: null });
    expect(historicoDemo(T0).every((e) => Date.parse(e.quando) <= T0)).toBe(true);
  });
});
