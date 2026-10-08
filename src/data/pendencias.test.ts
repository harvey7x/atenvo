import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  dataPrevista, estadoDemo, instanteLembrete, limiteDiaValido, ordenarPassos, pendAcoes, podeMandarAgora, podeMudarLembretes, preencher,
  previsaoSaida, proximaJanela, rotuloEnvio, travaEnvios, variavelSemDado, entregues, envioFalhou,
  type AjustesPendencias, type Pendencia, type PassoPendencia,
} from './pendencias';
import {
  ERROS, baseLembretesDe, detectarMotorNovo, entregaDoPasso, erroAmigavel, montarPassos, permissoesPend, textoResposta, type LinhaFila,
} from './pendenciasReal';

const J = { janelaIni: '09:00', janelaFim: '19:00', diasUteis: true };
const AJ: AjustesPendencias = { numero: { nome: 'MURILLO', telefone: '', conectado: true }, ativo: true, limiteDia: 40, avisarResponsavel: true, ...J };
// 08/10/2026 = quinta-feira
const local = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m, 0, 0);
const hm = (d: Date) => `${d.getDate()}/${d.getMonth() + 1} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

afterEach(() => { vi.useRealTimers(); });

describe('horário de envio (igual ao motor atual)', () => {
  it('dentro da janela sai na hora', () => {
    expect(hm(proximaJanela(local(8, 10, 30), J))).toBe('8/10 10:30');
  });
  it('quinta 20h → sexta 09:00; sexta 20h → segunda 09:00; sábado → segunda', () => {
    expect(hm(proximaJanela(local(8, 20), J))).toBe('9/10 09:00');
    expect(hm(proximaJanela(local(9, 20), J))).toBe('12/10 09:00');
    expect(hm(proximaJanela(local(10, 11), J))).toBe('12/10 09:00');
    expect(hm(proximaJanela(local(8, 7), J))).toBe('8/10 09:00');
  });
  it('sem "só dias úteis", sábado de manhã sai no sábado', () => {
    expect(hm(proximaJanela(local(10, 11), { ...J, diasUteis: false }))).toBe('10/10 11:00');
  });
  it('lembrete: dia N às HH:MM da data de início, fim de semana vai para a segunda', () => {
    expect(hm(new Date(instanteLembrete(local(8, 20), 1, '09:00', true)))).toBe('9/10 09:00');
    expect(hm(new Date(instanteLembrete(local(8, 20), 2, '14:00', true)))).toBe('12/10 14:00');
    expect(hm(new Date(instanteLembrete(local(8, 20), 2, '14:00', false)))).toBe('10/10 14:00');
  });
  it('previsão em palavras', () => {
    vi.useFakeTimers(); vi.setSystemTime(local(8, 20));
    expect(previsaoSaida(local(8, 20).toISOString(), AJ)).toBe('amanhã 09:00');
    expect(previsaoSaida(local(8, 20).toISOString(), { ...AJ, ativo: false })).toBe('quando os envios forem ligados');
    expect(previsaoSaida(local(8, 20).toISOString(), { ...AJ, numero: { ...AJ.numero, conectado: false } })).toBe('quando o número Murillo voltar a conectar');
    vi.setSystemTime(local(8, 10));
    expect(previsaoSaida(local(8, 10).toISOString(), AJ)).toBe('em instantes');
    expect(previsaoSaida(local(9, 10, 30).toISOString(), AJ)).toBe('amanhã 10:30');
  });
});

describe('variáveis (igual a pend_preencher)', () => {
  const cliente = { id: 'x', nome: 'MARIA APARECIDA', telefone: '', processo: '123', acao: '', responsavel: '', fechadoEm: '' };
  it('dado que falta vira vazio (não marcador)', () => {
    expect(preencher('{prazo}', { cliente, oQue: 'x', atendente: 'Ana' })).toBe('');
    expect(preencher('{processo}', { cliente, oQue: 'x', atendente: 'Ana' })).toBe('');
    expect(preencher('Oi {primeiro_nome}, {pendencia}', { cliente, oQue: 'assinar', atendente: 'Ana' })).toBe('Oi Maria, assinar');
  });
  it('avisa quando a mensagem usa prazo/processo sem o dado', () => {
    const passos = [{ id: 'p', dia: 0, hora: 'agora', blocos: [{ id: 'b', tipo: 'texto' as const, texto: 'Prazo {prazo}' }] }];
    expect(variavelSemDado(passos, {})).toMatch(/Sem prazo/);
    expect(variavelSemDado(passos, { prazo: '2026-10-20T12:00:00' })).toBe('');
  });
});

describe('entrega de verdade (mensagens_agendadas)', () => {
  const l = (id: string, status: string, extra: Partial<LinhaFila> = {}): LinhaFila => ({ id, status, enviada_em: null, motivo_bloqueio: null, ultimo_erro: null, ...extra });
  const m = (...ls: LinhaFila[]) => new Map(ls.map((x) => [x.id, x]));
  it('bloqueada → falhou com motivo legível', () => {
    expect(entregaDoPasso(['a', 'b'], m(l('a', 'enviada'), l('b', 'bloqueada', { motivo_bloqueio: 'canal desconectado' })))).toEqual({ entrega: 'falhou', motivoFalha: 'o número estava desconectado' });
  });
  it('expirada → falhou', () => {
    expect(entregaDoPasso(['a'], m(l('a', 'expirada'))).entrega).toBe('falhou');
  });
  it('agendada/processando → na fila', () => {
    expect(entregaDoPasso(['a', 'b'], m(l('a', 'enviada'), l('b', 'agendada')))).toEqual({ entrega: 'fila' });
  });
  it('tudo enviado → enviada com a hora real', () => {
    expect(entregaDoPasso(['a', 'b'], m(l('a', 'enviada', { enviada_em: '2026-10-08T13:00:00+00:00' }), l('b', 'enviada', { enviada_em: '2026-10-08T13:01:00+00:00' }))))
      .toEqual({ entrega: 'enviada', quando: '2026-10-08T13:01:00+00:00' });
  });
  it('tudo cancelado (cliente respondeu antes) → não saiu', () => {
    expect(entregaDoPasso(['a'], m(l('a', 'cancelada')))).toEqual({ entrega: 'falhou', motivoFalha: 'o cliente respondeu antes' });
  });
  it('sem linhas → sem informação', () => {
    expect(entregaDoPasso(['a'], m())).toEqual({});
  });
  it('contagem ignora fila e falha', () => {
    const p = { passos: [
      { id: '1', dia: 0, hora: 'agora', blocos: [], estado: 'enviado', quando: '', entrega: 'enviada' },
      { id: '2', dia: 1, hora: '09:00', blocos: [], estado: 'enviado', quando: '', entrega: 'falhou', motivoFalha: 'x' },
      { id: '3', dia: 3, hora: '09:00', blocos: [], estado: 'enviado', quando: '', entrega: 'fila' },
    ] as PassoPendencia[] } as Pendencia;
    expect(entregues(p)).toBe(1);
    expect(envioFalhou(p)?.id).toBe('2');
  });
});

describe('textos', () => {
  it('rótulo de mídia sem emoji', () => {
    expect(textoResposta('🎤 Áudio')).toBe('Áudio');
    expect(textoResposta('📷 Foto')).toBe('Imagem');
    expect(textoResposta('')).toBe('Mensagem');
    expect(textoResposta('Assinei 👍')).toBe('Assinei 👍');
  });
  it('erros do servidor em português', () => {
    expect(erroAmigavel(new Error('passos_demais'))).toBe('Máximo de 12 envios.');
    expect(erroAmigavel(new Error('canal_invalido'))).toMatch(/não pode ser usado/);
    expect(erroAmigavel(new Error('janela_invalida'))).toMatch(/horário final/);
  });
});

describe('store da demonstração = contrato do servidor', () => {
  it('criar: responsável é o encarregado do cliente', () => {
    const p = pendAcoes.criar({ clienteId: 'c3', tipo: 'outro', oQue: 'x', passos: [{ id: 'a', dia: 0, hora: 'agora', blocos: [{ id: 'b', tipo: 'texto', texto: 'oi' }] }] });
    expect(p.responsavel).toBe('Juliana');
  });
  it('voltar a lembrar zera a resposta e só agenda daqui para frente', () => {
    const resp = estadoDemo().pendencias.find((p) => p.status === 'respondeu')!;
    pendAcoes.retomar(resp.id, [{ id: 'n', dia: 1, hora: '09:00', blocos: [{ id: 'b', tipo: 'texto', texto: 'oi' }] }]);
    const depois = estadoDemo().pendencias.find((p) => p.id === resp.id)!;
    expect(depois.status).toBe('aguardando');
    expect(depois.resposta).toBeUndefined();
    expect(new Date(depois.passos.filter((x) => x.estado === 'agendado')[0].quando).getTime()).toBeGreaterThan(Date.now());
    // numeração continua depois dos cancelados (não intercala por data)
    expect(depois.passos.map((x) => rotuloEnvio(depois, x))).toEqual(['Primeira mensagem', 'Lembrete 1', 'Lembrete 2', 'Lembrete 3', 'Lembrete 4']);
  });
  it('voltar a lembrar mantém a mensagem avulsa que ainda não saiu (= delete ... and not avulso)', () => {
    pendAcoes.ajustar({ ativo: false });
    try {
      // pendência própria (não mexe na semente que os testes seguintes procuram)
      const sr = pendAcoes.criar({ clienteId: 'c11', tipo: 'outro', oQue: 'x', passos: [{ id: 'a', dia: 0, hora: 'agora', blocos: [{ id: 'b', tipo: 'texto', texto: 'oi' }] }] });
      pendAcoes.enviarAgora(sr.id, [{ id: 'av', tipo: 'texto', texto: 'oi de novo' }]);
      const avulsa = estadoDemo().pendencias.find((p) => p.id === sr.id)!.passos.find((x) => x.avulso && x.estado === 'agendado');
      expect(avulsa).toBeDefined();
      pendAcoes.retomar(sr.id, [{ id: 'n', dia: 1, hora: '09:00', blocos: [{ id: 'b', tipo: 'texto', texto: 'lembrete' }] }]);
      const d = estadoDemo().pendencias.find((p) => p.id === sr.id)!;
      expect(d.passos).toContainEqual(avulsa);
      expect(d.passos.filter((x) => x.estado === 'agendado' && !x.avulso)).toHaveLength(1);
      pendAcoes.resolver(sr.id);
    } finally { pendAcoes.ajustar({ ativo: true }); }
  });
  it('avulsa entra no ponto do tempo; lembretes ficam na ordem de gravação', () => {
    const pp = (id: string, quando: string, extra: Partial<PassoPendencia> = {}): PassoPendencia => ({ id, dia: 1, hora: '09:00', blocos: [], estado: 'enviado', quando, ...extra });
    const ps = ordenarPassos([
      pp('a', '2026-10-06T10:00:00Z', { hora: 'agora', dia: 0 }), pp('b', '2026-10-07T12:00:00Z'), pp('c', '2026-10-09T17:00:00Z', { estado: 'agendado' }),
      pp('v', '2026-10-08T15:00:00Z', { hora: 'agora', avulso: true }),
    ]);
    expect(ps.map((x) => x.id)).toEqual(['a', 'b', 'v', 'c']);
  });
  it('mudar lembretes mantém a 1ª e as avulsas', () => {
    const p = estadoDemo().pendencias.find((x) => x.id === 'pd2')!;
    const primeira = p.passos[0];
    pendAcoes.trocarLembretes(p.id, [{ id: 'z', dia: 5, hora: '10:00', blocos: [{ id: 'b', tipo: 'texto', texto: 'oi' }] }]);
    const d = estadoDemo().pendencias.find((x) => x.id === p.id)!;
    expect(d.passos[0]).toEqual(primeira);
    expect(d.passos.filter((x) => x.estado === 'agendado')).toHaveLength(1);
    expect(rotuloEnvio(d, d.passos[d.passos.length - 1])).toBe('Lembrete 2');
  });
  it('"Mudar lembretes" só depois que a 1ª saiu', () => {
    const base = estadoDemo().pendencias.find((x) => x.id === 'pd2')!;
    expect(podeMudarLembretes(base)).toBe(true);
    expect(podeMudarLembretes({ ...base, passos: [{ ...base.passos[0], estado: 'agendado' }, ...base.passos.slice(1)] })).toBe(false);
  });
  it('reabrir (= pendencia_reabrir): nada saiu → volta para aguardando com a 1ª na data marcada; idempotente', () => {
    vi.useFakeTimers(); vi.setSystemTime(local(8, 10));
    const ag = pendAcoes.criar({
      clienteId: 'c11', tipo: 'outro', oQue: 'x', agendarPara: local(13, 10).toISOString(),
      passos: [{ id: 'a', dia: 0, hora: 'agora', blocos: [{ id: 'b', tipo: 'texto', texto: 'oi' }] }, { id: 'l', dia: 2, hora: '09:00', blocos: [{ id: 'c', tipo: 'texto', texto: 'e aí' }] }],
    });
    pendAcoes.resolver(ag.id);
    pendAcoes.reabrir(ag.id);
    const d = estadoDemo().pendencias.find((x) => x.id === ag.id)!;
    expect(d.status).toBe('aguardando');
    expect(d.passos.map((x) => [x.estado, hm(new Date(x.quando))])).toEqual([['agendado', '13/10 10:00'], ['agendado', '15/10 09:00']]);
    pendAcoes.reabrir(ag.id);
    expect(estadoDemo().pendencias.find((x) => x.id === ag.id)).toBe(d);
    // algo saiu (a 1ª saiu na hora) → sem resposta, sem reagendar
    const sa = pendAcoes.criar({ clienteId: 'c11', tipo: 'outro', oQue: 'y', passos: [{ id: 'a', dia: 0, hora: 'agora', blocos: [{ id: 'b', tipo: 'texto', texto: 'oi' }] }, { id: 'l', dia: 2, hora: '09:00', blocos: [{ id: 'c', tipo: 'texto', texto: 'e aí' }] }] });
    expect(sa.passos[0].estado).toBe('enviado');
    pendAcoes.resolver(sa.id); pendAcoes.reabrir(sa.id);
    const s2 = estadoDemo().pendencias.find((x) => x.id === sa.id)!;
    expect(s2.status).toBe('sem_resposta');
    expect(s2.passos.filter((x) => x.estado === 'agendado')).toHaveLength(0);
    pendAcoes.resolver(sa.id); pendAcoes.resolver(ag.id); // não mexe nos testes seguintes (que procuram pela semente)
  });
  it('ajustes: janela invertida é recusada', () => {
    expect(() => pendAcoes.ajustar({ janelaIni: '20:00' })).toThrow('janela_invalida');
    expect(estadoDemo().ajustes.janelaIni).toBe('09:00');
  });
});

describe('leitura do banco (motor atual e motor novo)', () => {
  const linha = (id: string, ordem: number, estado: string, extra: Record<string, unknown> = {}) =>
    ({ id, ordem, dia: ordem, hora: ordem ? '09:00' : 'agora', blocos: [{ tipo: 'texto', texto: 'oi' }], quando: '2026-10-08T12:00:00+00:00', estado, avulso: false, enviado_em: null, msg_ids: [], ...extra });
  it('na_fila/falhou (motor novo) viram envio com entrega na fila/falhou', () => {
    const ps = montarPassos([linha('a', 0, 'na_fila', { enviado_em: '2026-10-08T12:01:00+00:00' }), linha('b', 1, 'falhou'), linha('c', 2, 'agendado')], new Map());
    expect(ps.map((x) => [x.estado, x.entrega ?? '-'])).toEqual([['enviado', 'fila'], ['enviado', 'falhou'], ['agendado', '-']]);
    expect(ps[1].motivoFalha).toBe('erro no envio');
  });
  it('base dos lembretes = a mesma do banco no ar', () => {
    const r = { criado_em: '2026-10-01T12:00:00Z', primeiro_envio_em: '2026-10-02T12:00:00Z', pendencias_passos: [] };
    expect(baseLembretesDe(r)).toBe('2026-10-02T12:00:00Z');                                    // motor atual
    expect(baseLembretesDe({ ...r, lembrar_desde: '2026-10-07T15:00:00Z' })).toBe('2026-10-07T15:00:00Z'); // novo, depois de "Voltar a lembrar"
    expect(baseLembretesDe({ ...r, primeiro_envio_em: null, lembrar_desde: null, pendencias_passos: [linha('a', 0, 'agendado', { quando: '2026-10-09T13:30:00Z' })] }))
      .toBe('2026-10-09T13:30:00Z');                                                            // novo, 1ª ainda não saiu
    expect(baseLembretesDe({ ...r, primeiro_envio_em: null })).toBe('2026-10-01T12:00:00Z');    // atual, nada saiu
  });
});

describe('erros das RPCs (migrations 20261008160000 + 20261008190000)', () => {
  const PADRAO = 'Não deu certo. Tente de novo.';
  const CODIGOS = ['limite_invalido', 'ligar_sem_numero', 'numero_desconectado', 'so_gestor_exclui', 'canal_invalido', 'cliente_respondeu',
    'pendencia_resolvida', 'modo_invalido', 'passos_invalidos', 'passos_demais', 'passo_muito_longo', 'texto_muito_longo', 'o_que_vazio',
    'sem_mensagem', 'contato_invalido', 'pendencia_nao_encontrada', 'tipo_invalido', 'so_admin', 'janela_invalida', 'passo_vazio',
    'passo_ficou_vazio', 'sem_acesso', 'hora_invalida', 'mime_incompativel', 'midia_path_invalido', 'arquivo_muito_grande', 'texto_vazio',
    'sem_numero_pendencias', 'numero_pendencias_invalido', 'contato_sem_telefone', 'cliente_nao_fechado'];
  it('todo código tem frase própria', () => {
    for (const c of CODIGOS) {
      expect(ERROS[c], c).toBeTruthy();
      expect(erroAmigavel(new Error(c)), c).toBe(ERROS[c]);
    }
  });
  it('frases combinadas com o dono', () => {
    expect(erroAmigavel(new Error('limite_invalido'))).toBe('O limite por dia tem que ser de 8 a 500.');
    expect(erroAmigavel(new Error('ligar_sem_numero'))).toBe('Escolha o número antes de ligar os envios.');
    expect(erroAmigavel(new Error('numero_desconectado'))).toBe('O número está desconectado. Reconecte em Integrações para ligar os envios.');
    expect(erroAmigavel(new Error('so_gestor_exclui'))).toBe('Só administrador ou supervisor pode excluir mensagem pronta.');
    expect(erroAmigavel(new Error('cliente_respondeu'))).toBe('O cliente acabou de responder. Atualize a pendência antes de programar.');
    expect(erroAmigavel(new Error('canal_invalido'))).toBe('Esse número não pode ser usado nas pendências.');
  });
  it('um código não casa dentro de outro', () => {
    expect(erroAmigavel(new Error('passo_muito_longo'))).toBe('Máximo de 8 itens por envio.');
    expect(erroAmigavel(new Error('passos_demais'))).toBe('Máximo de 12 envios.');
    expect(erroAmigavel(new Error('passo_ficou_vazio'))).toBe(ERROS.passo_ficou_vazio);
    expect(erroAmigavel(new Error('passo_vazio'))).toBe(ERROS.passo_vazio);
    expect(erroAmigavel(new Error('passos_invalidos'))).toBe(ERROS.passos_invalidos);
    expect(erroAmigavel(new Error('texto_muito_longo'))).toBe(ERROS.texto_muito_longo);
    expect(erroAmigavel(new Error('texto_vazio'))).toBe(ERROS.texto_vazio);
  });
  it('código com prefixo do Postgres, string solta e erro desconhecido', () => {
    expect(erroAmigavel(new Error('P0001: passos_demais'))).toBe('Máximo de 12 envios.');
    expect(erroAmigavel('numero_desconectado')).toBe(ERROS.numero_desconectado);
    expect(erroAmigavel(new Error('invalid input syntax for type time: ""'))).toBe('Preencha os dois horários.');
    expect(erroAmigavel(new Error('Failed to fetch'))).toBe(PADRAO);
    expect(erroAmigavel(new Error('passos_demais_x'))).toBe(PADRAO);
  });
});

describe('ajustes (pendencias_config_salvar)', () => {
  it('limite por dia de 8 a 500', () => {
    expect([7, 8, 40, 500, 501, 0, 8.5].map(limiteDiaValido)).toEqual([false, true, true, true, false, false, false]);
  });
  it('ligar exige número e número conectado; desligar sempre pode', () => {
    const b = { ativo: true, temNumero: true, conectado: true, jaLigado: false, mesmoNumero: true };
    expect(travaEnvios(b)).toBe('');
    expect(travaEnvios({ ...b, temNumero: false })).toBe('ligar_sem_numero');
    expect(travaEnvios({ ...b, conectado: false })).toBe('numero_desconectado');
    // já ligado no mesmo número que caiu: o servidor aceita salvar o resto
    expect(travaEnvios({ ...b, conectado: false, jaLigado: true })).toBe('');
    // trocar para um número desconectado com os envios ligados: recusa
    expect(travaEnvios({ ...b, conectado: false, jaLigado: true, mesmoNumero: false })).toBe('numero_desconectado');
    expect(travaEnvios({ ...b, ativo: false, temNumero: false, conectado: false })).toBe('');
  });
  it('demo recusa o mesmo que o servidor', () => {
    expect(() => pendAcoes.ajustar({ limiteDia: 7 })).toThrow('limite_invalido');
    expect(() => pendAcoes.ajustar({ limiteDia: 501 })).toThrow('limite_invalido');
    expect(estadoDemo().ajustes.limiteDia).toBe(40);
  });
});

describe('permissões e motor (real)', () => {
  it('papel da org ativa → admin / gestor', () => {
    expect(permissoesPend('admin')).toEqual({ admin: true, gestor: true });
    expect(permissoesPend('gestor')).toEqual({ admin: false, gestor: true });
    expect(permissoesPend('atendente')).toEqual({ admin: false, gestor: false });
    expect(permissoesPend(undefined)).toEqual({ admin: false, gestor: false });
  });
  it('motor novo: pela coluna nas linhas; sem linhas, pela sondagem da tabela', () => {
    expect(detectarMotorNovo([], true)).toBe(true);          // banco de hoje: 0 pendências, coluna existe
    expect(detectarMotorNovo([], false)).toBe(false);
    expect(detectarMotorNovo([{ id: 'x', lembrar_desde: null }], false)).toBe(true);
    expect(detectarMotorNovo([{ id: 'x' }], true)).toBe(false);
  });
});

describe('previsão de data: ligado ou desligado, a mesma data', () => {
  it('lembrete futuro mostra a mesma data com os envios ligados e desligados', () => {
    vi.useFakeTimers(); vi.setSystemTime(local(8, 20));
    for (const iso of [local(9, 10).toISOString(), local(10, 14).toISOString(), local(9, 21).toISOString()]) {
      const desligado: AjustesPendencias = { ...AJ, ativo: false };
      expect(dataPrevista(iso, AJ)).toBe(dataPrevista(iso, desligado, true));
      expect(previsaoSaida(iso, AJ)).toBe(dataPrevista(iso, AJ));
    }
    expect(dataPrevista(local(10, 14).toISOString(), AJ)).toBe('12/10 09:00');   // sábado → segunda, abertura da janela
  });
  it('o que já venceu: "em instantes" (ligado) × "em espera" (parado)', () => {
    vi.useFakeTimers(); vi.setSystemTime(local(8, 10));
    expect(dataPrevista(local(8, 9).toISOString(), AJ)).toBe('em instantes');
    expect(dataPrevista(local(8, 9).toISOString(), AJ, true)).toBe('em espera');
  });
});

describe('demonstração = motor novo', () => {
  it('lembretes da semente nunca caem no fim de semana (só dias úteis)', () => {
    const ag = estadoDemo().pendencias.flatMap((p) => p.passos.slice(1).filter((x) => x.estado === 'agendado' && !x.avulso));
    expect(ag.length).toBeGreaterThan(0);
    for (const x of ag) expect([0, 6]).not.toContain(new Date(x.quando).getDay());
  });
  it('mensagem avulsa sai também em "Sem resposta" e com lembretes pausados; resolvida recusa', () => {
    vi.useFakeTimers(); vi.setSystemTime(local(8, 10));
    const sem = estadoDemo().pendencias.find((p) => p.status === 'sem_resposta')!;
    expect(podeMandarAgora(sem, true)).toBe(true);
    pendAcoes.enviarAgora(sem.id, [{ id: 'b', tipo: 'texto', texto: 'oi' }]);
    const d = estadoDemo().pendencias.find((p) => p.id === sem.id)!;
    expect(d.passos[d.passos.length - 1]).toMatchObject({ avulso: true, estado: 'enviado' });
    const res = estadoDemo().pendencias.find((p) => p.status === 'resolvida')!;
    expect(() => pendAcoes.enviarAgora(res.id, [{ id: 'b', tipo: 'texto', texto: 'oi' }])).toThrow('pendencia_resolvida');
  });
});
