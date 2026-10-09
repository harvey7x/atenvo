import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  dataPrevista, estadoDemo, instanteLembrete, limiteDiaValido, ordenarPassos, pendAcoes, podeMandarAgora, podeMudarLembretes, preencher,
  previsaoSaida, proximaJanela, rotuloEnvio, travaEnvios, variavelSemDado, entregues, envioFalhou,
  chaveTelefone, contatoElegivel, iniciais, limparNome, mascaraTelefone, nomeClienteValido, normalizarTelefone, telefoneTela,
  celularSemNove, clienteCasaBusca, contatoSemNome, digitosAntes, digitosLocais, editarTelefone, posAposDigitos, primeiroNomeMsg,
  problemaNome, telefoneEstrangeiro, apagarSinal,
  type AjustesPendencias, type Pendencia, type PassoPendencia,
} from './pendencias';
import {
  ERROS, baseLembretesDe, detectarMotorNovo, entregaDoPasso, erroAmigavel, lerChecagem, montarPassos, permissoesPend, textoResposta, type LinhaFila,
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
    'sem_numero_pendencias', 'numero_pendencias_invalido', 'contato_sem_telefone', 'cliente_nao_fechado', 'nome_invalido', 'telefone_invalido', 'contato_mesclado'];
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

describe('cliente fora do sistema: telefone e nome (= pend_normalizar_telefone / pendencia_criar_numero)', () => {
  it('normaliza: só dígitos; 10/11 ganham o 55; 12/13 com 55 ficam; DDD 11..99', () => {
    expect(normalizarTelefone('(51) 99488-3071')).toBe('5551994883071');
    expect(normalizarTelefone('51 9948-8307')).toBe('555199488307');
    expect(normalizarTelefone('+55 51 99488-3071')).toBe('5551994883071');
    expect(normalizarTelefone('555199488307')).toBe('555199488307');
    expect(normalizarTelefone('(99) 3333-4444')).toBe('559933334444');
    expect(normalizarTelefone('(10) 99488-3071')).toBeNull();      // DDD 10 não existe
    expect(normalizarTelefone('(01) 99488-3071')).toBeNull();
    expect(normalizarTelefone('5199488307')).toBe('555199488307');
    expect(normalizarTelefone('99488-3071')).toBeNull();           // sem DDD
    expect(normalizarTelefone('4451994883071')).toBeNull();        // 13 dígitos sem 55
    expect(normalizarTelefone('55519948830712')).toBeNull();       // 14 dígitos
    expect(normalizarTelefone('')).toBeNull();
  });
  it('máscara do campo: celular 9XXXX-XXXX, fixo XXXX-XXXX, cola com +55 ou zero na frente', () => {
    expect(['', '5', '51', '519', '519948', '5199488', '51994883', '51994883071'].map((x) => mascaraTelefone(x)))
      .toEqual(['', '(5', '(51', '(51) 9', '(51) 9948', '(51) 99488', '(51) 99488-3', '(51) 99488-3071']);
    expect(mascaraTelefone('5133334444')).toBe('(51) 3333-4444');
    expect(mascaraTelefone('513333')).toBe('(51) 3333');
    expect(mascaraTelefone('51333344')).toBe('(51) 3333-44');
    expect(mascaraTelefone('+55 (51) 99488-3071')).toBe('(51) 99488-3071');
    expect(mascaraTelefone('051994883071')).toBe('(51) 99488-3071');
    expect(mascaraTelefone('519948830719999')).toBe('(51) 99488-3071');   // passa de 11: corta
    expect(mascaraTelefone('(51) 99488-3071a')).toBe('(51) 99488-3071');
    // apagar o hífen/parêntese não trava: a máscara sai dos dígitos
    expect(mascaraTelefone('(51) 99488-')).toBe('(51) 99488');
    expect(mascaraTelefone('(51) ')).toBe('(51');
    // o que a máscara entrega é o que a normalização aceita
    expect(normalizarTelefone(mascaraTelefone('+55 51 99488 3071'))).toBe('5551994883071');
  });
  it('chave canônica: com ou sem o nono dígito é o mesmo número (= chave_canonica_telefone)', () => {
    expect(chaveTelefone('5551994883071')).toBe('5194883071');
    expect(chaveTelefone('555194883071')).toBe('5194883071');
    expect(chaveTelefone('(51) 99488-3071')).toBe('5194883071');
    expect(chaveTelefone('(51) 9488-3071')).toBe('5194883071');
    expect(chaveTelefone('')).toBeNull();
  });
  it('telefone na tela', () => {
    expect(telefoneTela('5551994883071')).toBe('(51) 99488-3071');
    expect(telefoneTela('555133334444')).toBe('(51) 3333-4444');
    expect(telefoneTela('123')).toBe('123');
  });
  it('nome: 2 a 80 caracteres, com letra; espaços sobrando saem', () => {
    expect(['José da Silva', 'Zé', 'Ana Lúcia', 'Ç'.repeat(80)].map(nomeClienteValido)).toEqual([true, true, true, true]);
    expect(['', ' ', 'A', '  B  ', '1234', '(51) 99488-3071', '--', 'a'.repeat(81)].map(nomeClienteValido)).toEqual(Array(8).fill(false));
    expect(limparNome('  José   da  Silva ')).toBe('José da Silva');
    expect(nomeClienteValido(' A  ')).toBe(false);
  });
  it('avatar de nome curto não fica vazio', () => {
    expect(iniciais('ZÉ')).toBe('Z');
    expect(iniciais('JOSÉ DA SILVA')).toBe('JS');
  });
  it('resposta de pendencias_checar_numero → tela', () => {
    expect(lerChecagem({ valido: false, telefone: null, contato: null })).toEqual({ valido: false, telefone: null, contato: null });
    expect(lerChecagem({ valido: true, telefone: '5551994883071', contato: null })).toEqual({ valido: true, telefone: '5551994883071', contato: null });
    expect(lerChecagem({
      valido: true, telefone: '5551994883071',
      contato: { id: 'u1', nome: 'Maria Aparecida', telefone: '5551994883071', fechado: true, responsavel_nome: 'Juliana Souza', tem_pendencia: false },
    }).contato).toEqual({ id: 'u1', nome: 'MARIA APARECIDA', telefone: '(51) 99488-3071', fechado: true, responsavel: 'Juliana', temPendencia: false });
    // sem encarregado / sem nome
    expect(lerChecagem({ valido: true, telefone: '5551994883071', contato: { id: 'u2', nome: null, telefone: null, fechado: false, responsavel_nome: null, tem_pendencia: true } }).contato)
      .toMatchObject({ nome: '', responsavel: '', fechado: false, temPendencia: true });
    expect(lerChecagem(null)).toEqual({ valido: false, telefone: null, contato: null });
  });
  it('elegível para o jeito normal (pendencia_criar) = fechou ou já tem pendência', () => {
    const c = { id: 'x', nome: 'X', telefone: '', fechado: false, responsavel: '', temPendencia: false };
    expect(contatoElegivel(c)).toBe(false);
    expect(contatoElegivel({ ...c, fechado: true })).toBe(true);
    expect(contatoElegivel({ ...c, temPendencia: true })).toBe(true);
  });
});

describe('store da demonstração: cadastrar número (= pendencias_checar_numero + pendencia_criar_numero)', () => {
  const um = [{ id: 'a', dia: 0, hora: 'agora', blocos: [{ id: 'b', tipo: 'texto' as const, texto: 'Oi {primeiro_nome}' }] }];
  const base = { tipo: 'documento' as const, oQue: 'RG frente e verso', passos: um };
  const contar = () => ({ cli: estadoDemo().clientes.length, leads: estadoDemo().leads.length, pend: estadoDemo().pendencias.length });

  it('conferir: inválido, número novo, número de cliente fechado (com ou sem o nono dígito) e de lead', () => {
    expect(pendAcoes.checarNumero('(10) 99999-0000')).toEqual({ valido: false, telefone: null, contato: null });
    expect(pendAcoes.checarNumero('(51) 99777-1234')).toEqual({ valido: true, telefone: '5551997771234', contato: null });
    const maria = pendAcoes.checarNumero('(51) 99812-4471');
    expect(maria.contato).toMatchObject({ id: 'c1', fechado: true, temPendencia: true, responsavel: 'Matheus' });
    expect(pendAcoes.checarNumero('51 9812-4471').contato?.id).toBe('c1');
    expect(pendAcoes.checarNumero('(51) 98233-6150').contato).toMatchObject({ id: 'l1', fechado: false, temPendencia: false });
  });
  it('número novo: cadastra o cliente (nome digitado, encarregado = quem cadastrou) e abre a pendência', () => {
    const antes = contar();
    const p = pendAcoes.criarNumero({ nome: '  José   da Silva ', telefone: '(51) 99777-1234', ...base });
    const cli = estadoDemo().clientes.find((c) => c.id === p.clienteId)!;
    expect(cli).toMatchObject({ nome: 'JOSÉ DA SILVA', telefone: '(51) 99777-1234', fechadoEm: '', responsavel: 'Matheus' });
    expect(p).toMatchObject({ status: 'aguardando', responsavel: 'Matheus', oQue: 'RG frente e verso' });
    expect(contar()).toEqual({ cli: antes.cli + 1, leads: antes.leads, pend: antes.pend + 1 });
    // a prévia usa o nome digitado
    expect(preencher('Oi {primeiro_nome}', { cliente: cli, oQue: '', atendente: 'Ana' })).toBe('Oi José');
    // agora o número é dele e ele aparece como cliente com pendência
    expect(pendAcoes.checarNumero('5551997771234').contato).toMatchObject({ id: cli.id, fechado: false, temPendencia: true });
  });
  it('não duplica: o mesmo número de novo (com ou sem o 9, outro nome) usa o MESMO cliente, sem renomear', () => {
    const p1 = estadoDemo().pendencias.find((p) => estadoDemo().clientes.find((c) => c.id === p.clienteId)?.telefone === '(51) 99777-1234')!;
    const antes = contar();
    const p2 = pendAcoes.criarNumero({ nome: 'Outro Nome', telefone: '+55 51 9777-1234', ...base });
    expect(p2.clienteId).toBe(p1.clienteId);
    expect(contar()).toEqual({ cli: antes.cli, leads: antes.leads, pend: antes.pend + 1 });
    expect(estadoDemo().clientes.find((c) => c.id === p1.clienteId)!.nome).toBe('JOSÉ DA SILVA');
    // "Nova pendência para este cliente" (pendencia_criar) aceita quem foi cadastrado por número
    const p3 = pendAcoes.criar({ clienteId: p1.clienteId, ...base });
    expect(p3.clienteId).toBe(p1.clienteId);
  });
  it('número de cliente fechado: reaproveita o cliente da lista', () => {
    const antes = contar();
    const p = pendAcoes.criarNumero({ nome: 'Maria', telefone: '(51) 99812-4471', ...base });
    expect(p.clienteId).toBe('c1');
    expect(contar().cli).toBe(antes.cli);
    expect(estadoDemo().clientes.find((c) => c.id === 'c1')!.nome).toBe('MARIA APARECIDA DOS SANTOS');
  });
  it('lead (está no Atenvo, não fechou): pendencia_criar recusa; pelo número usa o lead, que passa para a lista', () => {
    expect(() => pendAcoes.criar({ clienteId: 'l2', ...base })).toThrow('cliente_nao_fechado');
    expect(() => pendAcoes.criar({ clienteId: 'nao-existe', ...base })).toThrow('contato_invalido');
    const antes = contar();
    const p = pendAcoes.criarNumero({ nome: 'Geralda Moura', telefone: '(54) 99104-7781', ...base });
    expect(p.clienteId).toBe('l2');
    expect(p.responsavel).toBe('Matheus');   // lead sem encarregado: fica com quem abriu
    expect(contar()).toEqual({ cli: antes.cli + 1, leads: antes.leads - 1, pend: antes.pend + 1 });
    expect(pendAcoes.criar({ clienteId: 'l2', ...base }).clienteId).toBe('l2');
  });
  it('lead com encarregado: a pendência vai para o encarregado', () => {
    expect(pendAcoes.criarNumero({ nome: 'Marcos', telefone: '(51) 98233-6150', ...base }).responsavel).toBe('Juliana');
  });
  it('recusa nome e número inválidos sem cadastrar nada; pendência com defeito não deixa cliente para trás', () => {
    const antes = contar();
    expect(() => pendAcoes.criarNumero({ nome: '1234', telefone: '(51) 99666-0001', ...base })).toThrow('nome_invalido');
    expect(() => pendAcoes.criarNumero({ nome: 'A', telefone: '(51) 99666-0001', ...base })).toThrow('nome_invalido');
    expect(() => pendAcoes.criarNumero({ nome: 'Ana Paula', telefone: '(10) 99666-0001', ...base })).toThrow('telefone_invalido');
    expect(() => pendAcoes.criarNumero({ nome: 'Ana Paula', telefone: '9666-0001', ...base })).toThrow('telefone_invalido');
    expect(() => pendAcoes.criarNumero({ nome: 'Ana Paula', telefone: '(51) 99666-0001', ...base, oQue: '  ' })).toThrow('o_que_vazio');
    expect(() => pendAcoes.criarNumero({ nome: 'Ana Paula', telefone: '(51) 99666-0001', ...base, passos: [] })).toThrow('sem_mensagem');
    expect(contar()).toEqual(antes);
    expect(pendAcoes.checarNumero('(51) 99666-0001').contato).toBeNull();
  });
  it('a busca da Nova pendência passa a achar quem foi cadastrado por número', () => {
    const achados = estadoDemo().clientes.filter((c) => c.telefone.replace(/\D/g, '').includes('997771234'));
    expect(achados).toHaveLength(1);
  });
});

describe('campo do WhatsApp: uma tecla nunca vira OUTRO número', () => {
  it('DDD 55 (RS): tecla a mais com o campo cheio é ignorada (não tira o 55 achando que é o país)', () => {
    expect(editarTelefone('55981112222')).toBe('(55) 98111-2222');
    expect(editarTelefone('(55) 98111-22223')).toBeNull();          // digitou um 3 a mais
    expect(editarTelefone('(55) 99123-45678')).toBeNull();
    expect(editarTelefone('(55) 991234567')).toBe('(55) 99123-4567');
    // digitar nunca tira o 55; só o "+" ou um número colado inteiro
    expect(mascaraTelefone('55981112222')).toBe('(55) 98111-2222');
    expect(mascaraTelefone('5551981112222')).toBe('(55) 51981-1122');   // sem "+" e sem colar: 55 é DDD (corta em 11)
    expect(mascaraTelefone('5551981112222', true)).toBe('(51) 98111-2222');
    expect(mascaraTelefone('+55 51 98111-2222')).toBe('(51) 98111-2222');
  });
  it('colar o número inteiro troca o campo: +55, formato do banco (sem o nono dígito) e com zero', () => {
    expect(editarTelefone('+55 51 99123-4567', true)).toBe('(51) 99123-4567');
    expect(editarTelefone('5551991234567', true)).toBe('(51) 99123-4567');
    expect(editarTelefone('555191234567', true)).toBe('(51) 9123-4567');   // 10 dígitos: (DD) XXXX-XXXX
    expect(editarTelefone('5191234567', true)).toBe('(51) 9123-4567');
    expect(editarTelefone('(55) 99123-4567', true)).toBe('(55) 99123-4567'); // DDD 55 colado continua 55
    expect(editarTelefone('5555991234567', true)).toBe('(55) 99123-4567');
    expect(editarTelefone('051991234567', true)).toBe('(51) 99123-4567');
  });
  it('"+" de outro país fica como veio (a tela recusa); +55 incompleto espera', () => {
    expect(editarTelefone('+1 415 555 2671', true)).toBe('+1 415 555 2671');
    expect(telefoneEstrangeiro('+1 415 555 2671')).toBe(true);
    expect(digitosLocais('+1 415 555 2671')).toBe('');
    expect(telefoneEstrangeiro('+55 51 9')).toBe(false);
    expect(telefoneEstrangeiro('+5')).toBe(false);
    expect(telefoneEstrangeiro('(51) 99123-4567')).toBe(false);
    expect(editarTelefone('+55 51 9912')).toBe('+55 51 9912');
    expect(digitosLocais('+55 51 9912')).toBe('519912');
    expect(editarTelefone('+55 51 99123-4567')).toBe('(51) 99123-4567');  // digitando com +55: completou, vira o local
    expect(editarTelefone('+55 51 99123-45678')).toBeNull();
  });
  it('cursor: volta para o mesmo dígito depois de formatar', () => {
    // "(51) 99123-4567", Backspace depois do "2" (posição 9) → o navegador manda "(51) 9913-4567" com o cursor em 8
    const bruto = '(51) 9913-4567';
    const v = editarTelefone(bruto)!;
    expect(v).toBe('(51) 99134-567');
    const pos = posAposDigitos(v, digitosAntes(bruto, 8));
    expect(pos).toBe(8);
    // digitar "2" ali devolve o número certo
    const bruto2 = v.slice(0, pos) + '2' + v.slice(pos);
    const v2 = editarTelefone(bruto2)!;
    expect(v2).toBe('(51) 99123-4567');
    expect(posAposDigitos(v2, digitosAntes(bruto2, pos + 1))).toBe(9);
    expect(posAposDigitos('(51) 9', 0)).toBe(0);
    expect(posAposDigitos('(51) 9', 9)).toBe(6);
  });
  it('Backspace/Delete em cima do hífen apaga o dígito vizinho (a máscara não devolve o hífen)', () => {
    // "(51) 99123-|4567": Backspace tira o hífen → o navegador manda "(51) 991234567" com o cursor em 10
    expect(apagarSinal('(51) 99123-4567', '(51) 991234567', 10, false)).toEqual({ valor: '(51) 99124-567', pos: 9 });
    // "(51) 99123|-4567": Delete tira o hífen → apaga o 4
    expect(apagarSinal('(51) 99123-4567', '(51) 991234567', 10, true)).toEqual({ valor: '(51) 99123-567', pos: 10 });
    // apagou um dígito de verdade: não é com ele
    expect(apagarSinal('(51) 99123-4567', '(51) 9913-4567', 8, false)).toBeNull();
    expect(apagarSinal('+55 51 9', '+55 519', 3, false)).toBeNull();
  });
  it('celular com 10 dígitos (sem o nono) é suspeito; fixo não', () => {
    expect(celularSemNove('5191234567')).toBe(true);
    expect(celularSemNove('5161234567')).toBe(true);
    expect(celularSemNove('5133334444')).toBe(false);
    expect(celularSemNove('51991234567')).toBe(false);
  });
});

describe('nome digitado e contato sem nome', () => {
  it('o que falta no nome', () => {
    expect(['', '   ', '12345', 'A', 'José', 'Zé', `${'a'.repeat(81)}`].map(problemaNome)).toEqual(['vazio', 'vazio', 'sem_letra', 'curto', '', '', 'longo']);
  });
  it('contato sem nome = sem letra (o nome é o telefone, vazio)', () => {
    expect(contatoSemNome({ nome: '555191035329' })).toBe(true);
    expect(contatoSemNome({ nome: '' })).toBe(true);
    expect(contatoSemNome({ nome: 'ADAOROSAGARCIA05' })).toBe(false);
  });
});

describe('{primeiro_nome} igual ao servidor (pend_preencher)', () => {
  const cli = (nome: string) => ({ id: 'x', nome, telefone: '', processo: '', acao: '', responsavel: '', fechadoEm: '' });
  const ctx = (nome: string) => ({ cliente: cli(nome), oQue: 'RG', atendente: 'Ana' });
  it('nome de verdade: initcap da 1ª palavra (hífen separa; apóstrofo não)', () => {
    expect(primeiroNomeMsg('MARIA APARECIDA')).toBe('Maria');
    expect(primeiroNomeMsg('ANA-PAULA SOUZA')).toBe('Ana-Paula');
    expect(primeiroNomeMsg("D'ÁVILA")).toBe("D'ávila");
    expect(primeiroNomeMsg('élcio')).toBe('Élcio');
  });
  it('sem nome usável, o nome sai da frase (como o cliente recebe)', () => {
    expect(primeiroNomeMsg('Dr. João Silva')).toBe('');
    expect(primeiroNomeMsg('555191035329')).toBe('');
    expect(primeiroNomeMsg('Zé2')).toBe('');
    expect(preencher('Olá, {primeiro_nome}! Tudo bem?', ctx('Dr. João Silva'))).toBe('Olá! Tudo bem?');
    expect(preencher('{primeiro_nome}, conseguiu o {pendencia}?', ctx('555191035329'))).toBe('Conseguiu o RG?');
    expect(preencher('Oi {primeiro_nome}', ctx('5551'))).toBe('Oi');
    expect(preencher('Olá, {primeiro_nome}! Aqui é {atendente}.', ctx('JOSÉ DA SILVA'))).toBe('Olá, José! Aqui é Ana.');
  });
});

describe('busca de clientes (= pendencias_clientes_fechados com a chave canônica)', () => {
  const sandra = { nome: 'SANDRA REGINA COSTA', telefone: '(51) 8455-2209' };   // gravada sem o nono dígito
  it('o celular inteiro acha quem foi gravado sem o nono dígito (e com +55)', () => {
    expect(clienteCasaBusca(sandra, '(51) 98455-2209')).toBe(true);
    expect(clienteCasaBusca(sandra, '51984552209')).toBe(true);
    expect(clienteCasaBusca(sandra, '+55 51 98455-2209')).toBe(true);
    expect(clienteCasaBusca(sandra, '5184552209')).toBe(true);
  });
  it('pedaço do número gravado e nome', () => {
    expect(clienteCasaBusca(sandra, '8455')).toBe(true);
    expect(clienteCasaBusca(sandra, '5551')).toBe(true);
    expect(clienteCasaBusca(sandra, 'regina')).toBe(true);
    expect(clienteCasaBusca(sandra, '845')).toBe(false);
    expect(clienteCasaBusca(sandra, '(51) 98455-2208')).toBe(false);
    expect(clienteCasaBusca(sandra, '')).toBe(true);
  });
});

describe('store da demonstração: contato sem nome ganha o nome digitado (= pendencia_criar_numero)', () => {
  const um = [{ id: 'a', dia: 0, hora: 'agora', blocos: [{ id: 'b', tipo: 'texto' as const, texto: 'Olá, {primeiro_nome}!' }] }];
  it('lead com o telefone no lugar do nome: usa o MESMO contato e grava o nome; quem tem nome não muda', () => {
    const ch = pendAcoes.checarNumero('(51) 99330-7712');
    expect(ch.contato).toMatchObject({ id: 'l3', fechado: false, temPendencia: false });
    expect(contatoSemNome(ch.contato!)).toBe(true);
    const p = pendAcoes.criarNumero({ nome: 'Maria Teste', telefone: '(51) 99330-7712', tipo: 'outro', oQue: 'x', passos: um });
    expect(p.clienteId).toBe('l3');
    const cli = estadoDemo().clientes.find((c) => c.id === 'l3')!;
    expect(cli.nome).toBe('MARIA TESTE');
    expect(preencher(um[0].blocos[0].texto, { cliente: cli, oQue: 'x', atendente: 'Ana' })).toBe('Olá, Maria!');
    expect(estadoDemo().leads.some((l) => l.id === 'l3')).toBe(false);
    // de novo, com outro nome: agora ele TEM nome, não muda
    pendAcoes.criarNumero({ nome: 'Outra Pessoa', telefone: '(51) 9330-7712', tipo: 'outro', oQue: 'y', passos: um });
    expect(estadoDemo().clientes.find((c) => c.id === 'l3')!.nome).toBe('MARIA TESTE');
  });
});
