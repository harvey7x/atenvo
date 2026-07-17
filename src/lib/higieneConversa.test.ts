import { describe, it, expect } from 'vitest';
import {
  analisarNome, nomeFraco, conversaAtiva, decidirDono, decidirNome, estadoHigiene, textoBloqueio,
} from './higieneConversa';
import { resolverCorte, resolverDiasAdaptacao, CORTE_PADRAO, DIAS_ADAPTACAO_PADRAO } from '@/config/higiene';

// A regra não tem data própria: o corte é sempre injetado. Aqui usamos o padrão versionado.
const HIGIENE_CORTE_ISO = CORTE_PADRAO;
const HIGIENE_DIAS_ADAPTACAO = DIAS_ADAPTACAO_PADRAO;
const cfg = { corteISO: HIGIENE_CORTE_ISO, diasAdaptacao: HIGIENE_DIAS_ADAPTACAO };
const CORTE = new Date(HIGIENE_CORTE_ISO).getTime();
const D = 86400000;
const antes = new Date(CORTE - 5 * D).toISOString();   // conversa que já existia
const depois = new Date(CORTE + 1 * D).toISOString();  // conversa nova
const durante = CORTE + 2 * D;                          // agora, dentro da adaptação
const passado = CORTE + (HIGIENE_DIAS_ADAPTACAO + 1) * D; // agora, adaptação encerrada

describe('analisarNome() — detecção de cadastro fraco', () => {
  it('vazio / só espaços / null / undefined', () => {
    for (const v of ['', '   ', null, undefined]) {
      const a = analisarNome(v);
      expect(a.fraco).toBe(true); expect(a.bloqueavel).toBe(true); expect(a.motivo).toBe('vazio');
    }
  });
  it('salvo como número de telefone', () => {
    for (const v of ['555181602825', '+55 51 98160-2825', '(51) 98160-2825', '51981602825']) {
      const a = analisarNome(v);
      expect(a.fraco).toBe(true); expect(a.motivo).toBe('numero');
    }
  });
  it('placeholder genérico', () => {
    for (const v of ['Cliente', 'cliente novo', 'LEAD', 'sem nome', 'Contato', 'não informado', 'Desconhecido']) {
      expect(analisarNome(v).fraco).toBe(true);
    }
  });
  it('pushName degenerado (., -, ?, emoji)', () => {
    for (const v of ['.', '-', '?', 'null', '😀']) {
      const a = analisarNome(v);
      expect(a.fraco).toBe(true); expect(a.motivo).toBe('placeholder');
    }
  });
  it('só o primeiro nome', () => {
    const a = analisarNome('Juliana');
    expect(a.fraco).toBe(true); expect(a.bloqueavel).toBe(true); expect(a.motivo).toBe('incompleto');
  });
  it('nome completo passa', () => {
    for (const v of ['Maria Silva', 'João Batista de Sá', 'ANA PAULA MOREIRA']) {
      const a = analisarNome(v);
      expect(a.fraco).toBe(false); expect(a.motivo).toBeNull();
    }
  });
  it('comércio: alerta mas NUNCA bloqueia', () => {
    for (const v of ['Cm Doces', 'Mercado Central', 'Auto Peças Silva', 'Salão da Ana']) {
      const a = analisarNome(v);
      expect(a.fraco).toBe(true);
      expect(a.bloqueavel).toBe(false);
      expect(a.motivo).toBe('comercio');
    }
  });
  it('nomeFraco() é atalho coerente', () => {
    expect(nomeFraco('Maria Silva')).toBe(false);
    expect(nomeFraco('555199999999')).toBe(true);
  });
});

describe('conversaAtiva() — bloqueio só vale em conversa ativa', () => {
  it('ativa: aberta / em_atendimento / pendente', () => {
    for (const s of ['aberta', 'em_atendimento', 'pendente']) expect(conversaAtiva({ status: s })).toBe(true);
  });
  it('NÃO ativa: fechada, resolvida ou arquivada', () => {
    expect(conversaAtiva({ status: 'fechada' })).toBe(false);
    expect(conversaAtiva({ status: 'resolvida' })).toBe(false);
    expect(conversaAtiva({ status: 'aberta', arquivada: true })).toBe(false);
  });
});

describe('decidirDono() — entrada progressiva', () => {
  const base = { ativa: true, temDono: false, agoraMs: durante, ...cfg };

  it('com dono efetivo → livre', () => {
    expect(decidirDono({ ...base, temDono: true, conversaCriadaEm: depois })).toBe('livre');
  });
  it('conversa NOVA sem dono → BLOQUEIA desde o dia 1', () => {
    expect(decidirDono({ ...base, conversaCriadaEm: depois })).toBe('bloqueia');
  });
  it('conversa ANTIGA sem dono → só alerta durante a adaptação', () => {
    expect(decidirDono({ ...base, conversaCriadaEm: antes })).toBe('alerta');
  });
  it('conversa ANTIGA sem dono → bloqueia depois da adaptação', () => {
    expect(decidirDono({ ...base, conversaCriadaEm: antes, agoraMs: passado })).toBe('bloqueia');
  });
  it('conversa fechada/arquivada nunca bloqueia', () => {
    expect(decidirDono({ ...base, ativa: false, conversaCriadaEm: depois })).toBe('livre');
  });
  it('sem data confiável → trata como antiga (não trava quem não sabemos datar)', () => {
    expect(decidirDono({ ...base, conversaCriadaEm: null })).toBe('alerta');
    expect(decidirDono({ ...base, conversaCriadaEm: 'xx' })).toBe('alerta');
  });
});

describe('decidirNome() — regra progressiva', () => {
  const base = { ativa: true, nome: 'Juliana', adiamentos: 0, agoraMs: durante };

  it('nome completo → livre', () => {
    expect(decidirNome({ ...base, nome: 'Juliana Souza' }).acao).toBe('livre');
  });
  it('1º e 2º contato: alerta e PODE adiar', () => {
    const a = decidirNome({ ...base, adiamentos: 0 });
    expect(a.acao).toBe('alerta'); expect(a.podeAdiar).toBe(true); expect(a.adiamentosRestantes).toBe(2);
    const b = decidirNome({ ...base, adiamentos: 1 });
    expect(b.acao).toBe('alerta'); expect(b.podeAdiar).toBe(true); expect(b.adiamentosRestantes).toBe(1);
  });
  it('após 2 adiamentos → BLOQUEIA e não pode mais adiar', () => {
    const d = decidirNome({ ...base, adiamentos: 2 });
    expect(d.acao).toBe('bloqueia'); expect(d.podeAdiar).toBe(false); expect(d.adiamentosRestantes).toBe(0);
  });
  it('adiamentos além do limite continuam bloqueando', () => {
    expect(decidirNome({ ...base, adiamentos: 9 }).acao).toBe('bloqueia');
  });
  it('"cliente ainda não informou" libera dentro da janela', () => {
    const d = decidirNome({ ...base, adiamentos: 5, liberadoAte: new Date(durante + 3600_000).toISOString() });
    expect(d.acao).toBe('livre'); expect(d.liberado).toBe(true);
  });
  it('e o alerta VOLTA quando a janela expira', () => {
    const d = decidirNome({ ...base, adiamentos: 5, liberadoAte: new Date(durante - 1000).toISOString() });
    expect(d.acao).toBe('bloqueia'); expect(d.liberado).toBe(false);
  });
  it('comércio alerta mas nunca bloqueia, mesmo com muitos adiamentos', () => {
    const d = decidirNome({ ...base, nome: 'Cm Doces Ltda', adiamentos: 9 });
    expect(d.acao).toBe('alerta'); expect(d.podeAdiar).toBe(false);
  });
  it('conversa fechada/arquivada não cobra nome', () => {
    expect(decidirNome({ ...base, ativa: false, adiamentos: 9 }).acao).toBe('livre');
  });
});

describe('estadoHigiene() — composição', () => {
  const nomeOk = decidirNome({ ativa: true, nome: 'Maria Silva', adiamentos: 0, agoraMs: durante });
  const nomeTrava = decidirNome({ ativa: true, nome: 'Maria', adiamentos: 2, agoraMs: durante });

  it('tudo certo → não bloqueia', () => {
    const e = estadoHigiene('livre', nomeOk);
    expect(e.bloqueiaEnvio).toBe(false); expect(e.motivoBloqueio).toBeNull(); expect(textoBloqueio(e)).toBeNull();
  });
  it('sem dono vence o nome (não cobra cadastro de quem não assumiu)', () => {
    const e = estadoHigiene('bloqueia', nomeTrava);
    expect(e.bloqueiaEnvio).toBe(true); expect(e.motivoBloqueio).toBe('dono');
    expect(textoBloqueio(e)).toMatch(/Assuma/);
  });
  it('com dono, nome travado bloqueia por nome', () => {
    const e = estadoHigiene('livre', nomeTrava);
    expect(e.bloqueiaEnvio).toBe(true); expect(e.motivoBloqueio).toBe('nome');
    expect(textoBloqueio(e)).toMatch(/nome completo/);
  });
  it('alerta de dono NÃO bloqueia (fase de adaptação)', () => {
    const e = estadoHigiene('alerta', nomeOk);
    expect(e.bloqueiaEnvio).toBe(false); expect(e.motivoBloqueio).toBeNull();
  });
});


describe('config/higiene — resolução da data de corte (sem hardcode na regra)', () => {
  it('sem env → cai no padrão versionado, e isso é esperado', () => {
    for (const v of [undefined, null, '', '   ']) {
      const r = resolverCorte(v);
      expect(r.iso).toBe(CORTE_PADRAO); expect(r.origem).toBe('padrao'); expect(r.envValida).toBe(true);
    }
  });
  it('env válida vence o padrão', () => {
    const r = resolverCorte('2026-09-01T00:00:00-03:00');
    expect(r.origem).toBe('env');
    expect(new Date(r.iso).getTime()).toBe(new Date('2026-09-01T00:00:00-03:00').getTime());
  });
  it('env inválida NÃO quebra: cai no padrão e sinaliza', () => {
    for (const v of ['amanha', '2026-13-45', '', ' ']) {
      const r = resolverCorte(v || undefined);
      expect(r.iso).toBe(CORTE_PADRAO); expect(r.origem).toBe('padrao');
    }
  });
  it('ARMADILHA: data BR "01/09/2026" é rejeitada — new Date() a leria como 9 de JANEIRO', () => {
    // sem validação estrita, quem digitasse 1º de setembro moveria o corte 8 meses sem erro
    const r = resolverCorte('01/09/2026');
    expect(r.origem).toBe('padrao');
    expect(r.envValida).toBe(false);
    expect(r.iso).toBe(CORTE_PADRAO);
  });
  it('aceita ISO com e sem hora/fuso', () => {
    expect(resolverCorte('2026-08-01').origem).toBe('env');
    expect(resolverCorte('2026-08-01T00:00:00-03:00').origem).toBe('env');
    expect(resolverCorte('2026-08-01T03:00:00Z').origem).toBe('env');
  });
  it('dias de adaptação: env válida, inválida e negativa', () => {
    expect(resolverDiasAdaptacao('14')).toBe(14);
    expect(resolverDiasAdaptacao('0')).toBe(0);
    expect(resolverDiasAdaptacao(undefined)).toBe(DIAS_ADAPTACAO_PADRAO);
    expect(resolverDiasAdaptacao('abc')).toBe(DIAS_ADAPTACAO_PADRAO);
    expect(resolverDiasAdaptacao('-3')).toBe(DIAS_ADAPTACAO_PADRAO);
  });
  it('corte configurado move a fronteira nova/antiga de verdade', () => {
    const corteFuturo = '2026-12-01T00:00:00-03:00';
    const agora = new Date('2026-12-05T00:00:00-03:00').getTime();
    // criada antes do corte novo = ANTIGA → alerta (ainda dentro da adaptação)
    expect(decidirDono({ ativa: true, temDono: false, conversaCriadaEm: '2026-11-20T00:00:00-03:00',
      agoraMs: agora, corteISO: corteFuturo, diasAdaptacao: 7 })).toBe('alerta');
    // criada depois do corte novo = NOVA → bloqueia
    expect(decidirDono({ ativa: true, temDono: false, conversaCriadaEm: '2026-12-02T00:00:00-03:00',
      agoraMs: agora, corteISO: corteFuturo, diasAdaptacao: 7 })).toBe('bloqueia');
  });
  it('corte INVÁLIDO nunca trava a operação — só alerta', () => {
    expect(decidirDono({ ativa: true, temDono: false, conversaCriadaEm: depois,
      agoraMs: passado, corteISO: 'data-quebrada', diasAdaptacao: 7 })).toBe('alerta');
  });
  it('diasAdaptacao=0 → antiga bloqueia imediatamente (entrada sem adaptação)', () => {
    expect(decidirDono({ ativa: true, temDono: false, conversaCriadaEm: antes,
      agoraMs: durante, corteISO: HIGIENE_CORTE_ISO, diasAdaptacao: 0 })).toBe('bloqueia');
  });
});
