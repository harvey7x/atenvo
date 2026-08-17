import { describe, it, expect } from 'vitest';
import {
  parseSimNao, extrairCpfDeTexto, validarNomeVideo, proximoPassoVideo, mensagensResultado,
  montarCopyVideo, DEFAULT_COPY_VIDEO, type CopyVideo, type EntradaVideo,
} from '../../supabase/functions/bot-runner/fluxo_video';
import { chaveTel } from '../../supabase/functions/bot-runner/fluxo_botoes';

// Atalhos de entrada
const digitou = (texto: string): EntradaVideo => ({ texto, ehAudio: false });
const audio = (): EntradaVideo => ({ texto: '', ehAudio: true });

// Copy de teste = default + vídeo apontando pra uma URL (no ar a URL vem do jsonb do canal)
const COPY: CopyVideo = { ...DEFAULT_COPY_VIDEO, video_url: 'https://exemplo.test/vsl.mp4' };

// CPF VÁLIDO clássico de teste (DV confere): 529.982.247-25
const CPF_OK = '52998224725';

describe('parseSimNao — SIM/NÃO case/acento-insensitive', () => {
  it.each(['sim', 'SIM', 'Sim!', 's', 'ss', 'si', 'quero', 'Claro', 'pode', 'ok', 'OK.', '*SIM*', 'sim quero', 'pode sim', 'ok claro'])(
    'reconhece SIM: %j', (t) => expect(parseSimNao(t)).toBe('sim'));
  it('reconhece 👍 (inclusive com tom de pele)', () => {
    expect(parseSimNao('👍')).toBe('sim');
    expect(parseSimNao('👍🏽')).toBe('sim');
  });
  it.each(['não', 'nao', 'NÃO', 'n', 'não quero', 'Não quero', 'agora não', 'Agora não!', 'Não.'])(
    'reconhece NÃO: %j', (t) => expect(parseSimNao(t)).toBe('nao'));
  it('NÃO vence quando a frase é de recusa, mesmo contendo "quero"', () => {
    expect(parseSimNao('não quero')).toBe('nao');
  });
  it.each(['', '   ', 'talvez', 'não sei', 'quero saber mais', 'o que é isso?', 'quanto custa', 'oi'])(
    'fora das listas → null (reprompt, nunca chute): %j', (t) => expect(parseSimNao(t)).toBe(null));
});

describe('extrairCpfDeTexto — primeira sequência de 11 dígitos + dígito verificador', () => {
  it('CPF puro', () => {
    expect(extrairCpfDeTexto(CPF_OK)).toMatchObject({ valido: true, digits: CPF_OK });
  });
  it('com pontuação padrão', () => {
    expect(extrairCpfDeTexto('529.982.247-25')).toMatchObject({ valido: true, digits: CPF_OK });
  });
  it('com espaços como separador', () => {
    expect(extrairCpfDeTexto('CPF: 529 982 247 25')).toMatchObject({ valido: true, digits: CPF_OK });
  });
  it('no meio de frase', () => {
    expect(extrairCpfDeTexto('meu cpf é 529.982.247-25, obrigado!')).toMatchObject({ valido: true, digits: CPF_OK });
  });
  it('com outros números na frase, a primeira sequência de 11 é a que vale', () => {
    expect(extrairCpfDeTexto('tenho 62 anos e meu cpf é 52998224725')).toMatchObject({ valido: true, digits: CPF_OK });
  });
  it('separador incomum (vírgula) ainda extrai — dígitos totais da mensagem = 11', () => {
    expect(extrairCpfDeTexto('529,982,247-25')).toMatchObject({ valido: true, digits: CPF_OK });
  });
  it('DV errado → inválido', () => {
    expect(extrairCpfDeTexto('52998224724').valido).toBe(false);
    expect(extrairCpfDeTexto('529.982.247-24').valido).toBe(false);
  });
  it('todos os dígitos iguais → inválido', () => {
    expect(extrairCpfDeTexto('111.111.111-11').valido).toBe(false);
  });
  it('curto/sem 11 dígitos contíguos → inválido', () => {
    expect(extrairCpfDeTexto('123').valido).toBe(false);
    expect(extrairCpfDeTexto('5299822472').valido).toBe(false);       // 10 dígitos
    expect(extrairCpfDeTexto('5299822472555').valido).toBe(false);    // 13 dígitos grudados ≠ CPF
    expect(extrairCpfDeTexto('sem número nenhum').valido).toBe(false);
  });
  it('mascarado só nos 2 finais quando válido', () => {
    expect(extrairCpfDeTexto(CPF_OK).mascarado).toBe('***.***.***-25');
  });
});

describe('validarNomeVideo — ≥2 palavras, sem dígitos', () => {
  it.each(['José da Silva', 'Ana Li', 'Maria-Eduarda Souza', 'joão pedro'])('aceita %j', (n) =>
    expect(validarNomeVideo(n)).toBe(true));
  it.each(['Maria', 'José', '', '   ', 'José 123', '12 34', 'a b'])('recusa %j', (n) =>
    expect(validarNomeVideo(n)).toBe(false));
});

describe('matching do número de teste — chaveTel cobre o 9º dígito oscilante', () => {
  const NUMEROS_TESTE = ['555198872825', '5551998872825'];   // sem e com o 9
  it('as duas formas do MESMO número colapsam na mesma chave', () => {
    expect(chaveTel('555198872825')).toBe(chaveTel('5551998872825'));
    expect(chaveTel('555198872825')).toBe('5198872825');
  });
  it('contato SEM o 9 casa com a allowlist', () => {
    expect(NUMEROS_TESTE.some((n) => chaveTel(n) === chaveTel('555198872825'))).toBe(true);
  });
  it('contato COM o 9 casa com a allowlist', () => {
    expect(NUMEROS_TESTE.some((n) => chaveTel(n) === chaveTel('5551998872825'))).toBe(true);
  });
  it('número diferente NÃO casa (produção intocada)', () => {
    expect(NUMEROS_TESTE.some((n) => chaveTel(n) === chaveTel('5551999999999'))).toBe(false);
    expect(NUMEROS_TESTE.some((n) => chaveTel(n) === chaveTel('5551998872826'))).toBe(false);
  });
});

describe('máquina de passos — abertura, SIM/NÃO, nome, CPF, resultado', () => {
  it('abertura LITERAL: 4 saídas na ordem — boas-vindas, VÍDEO (2ª saída, caption curta), pergunta, SIM/NÃO', () => {
    const r = proximoPassoVideo(null, digitou('oi'), 0, 0, {}, COPY);
    if (r.acao !== 'enviar') throw new Error('esperava enviar');
    expect(r.telas).toHaveLength(4);
    expect(r.telas[0]).toEqual({ tipo: 'texto', corpo: 'Olá! 👋 Seja bem-vindo(a) à *CAF – Central de Assessoria Financeira*.' });
    expect(r.telas[1]).toEqual({ tipo: 'video', url: COPY.video_url, caption: 'Assista, leva só 30 segundos' });
    expect(r.telas[2]).toEqual({ tipo: 'texto', corpo: 'Quer fazer uma *análise gratuita* pra descobrir se você paga juros abusivos e tem valores a recuperar?' });
    expect(r.telas[3]).toEqual({ tipo: 'texto', corpo: 'Responda *SIM* ou *NÃO* 😊' });
    expect(r.passoNovo).toBe('aguardando_sim_nao');
  });

  it('sem video_url, a caption sai como TEXTO na mesma posição (2ª saída) — estrutura preservada', () => {
    const r = proximoPassoVideo(null, digitou('oi'), 0, 0, {}, DEFAULT_COPY_VIDEO);
    if (r.acao !== 'enviar') throw new Error('esperava enviar');
    expect(r.telas).toHaveLength(4);
    expect(r.telas[0]).toEqual({ tipo: 'texto', corpo: DEFAULT_COPY_VIDEO.abertura[0] });
    expect(r.telas[1]).toEqual({ tipo: 'texto', corpo: DEFAULT_COPY_VIDEO.video_caption });
    expect(r.telas.every((t) => t.tipo === 'texto')).toBe(true);
  });

  it('SIM → pede o nome', () => {
    const r = proximoPassoVideo('aguardando_sim_nao', digitou('SIM'), 0, 0, {}, COPY);
    if (r.acao !== 'enviar') throw new Error('esperava enviar');
    expect(r.telas).toEqual([{ tipo: 'texto', corpo: COPY.pede_nome }]);
    expect(r.passoNovo).toBe('aguardando_nome');
  });

  it('NÃO → recusa educada + registrarRecusa (etiqueta remarketing-bot fica com o runner)', () => {
    const r = proximoPassoVideo('aguardando_sim_nao', digitou('não quero'), 0, 0, {}, COPY);
    if (r.acao !== 'enviar') throw new Error('esperava enviar');
    expect(r.telas).toEqual([{ tipo: 'texto', corpo: COPY.recusa }]);
    expect(r.passoNovo).toBe('recusado');
    expect(r.acoes?.registrarRecusa).toBe(true);
  });

  it('depois da recusa, SIM reentra em pede_nome (limparRecusa); resto fica em silêncio', () => {
    const sim = proximoPassoVideo('recusado', digitou('sim'), 0, 0, {}, COPY);
    if (sim.acao !== 'enviar') throw new Error('esperava enviar');
    expect(sim.passoNovo).toBe('aguardando_nome');
    expect(sim.acoes?.limparRecusa).toBe(true);
    expect(proximoPassoVideo('recusado', digitou('oi de novo'), 0, 0, {}, COPY)).toEqual({ acao: 'nada', motivo: 'recusado_aguardando_sim' });
  });

  it('não reconhecido: 1º reprompt, 2ª falha escala pra humano (bot_nao_entendeu)', () => {
    const r1 = proximoPassoVideo('aguardando_sim_nao', digitou('talvez'), 0, 0, {}, COPY);
    if (r1.acao !== 'enviar') throw new Error('esperava enviar');
    expect(r1.telas).toEqual([{ tipo: 'texto', corpo: COPY.reprompt_sim_nao }]);
    expect(r1.tentativas).toBe(1);
    expect(r1.acoes?.escalarHumano).toBeUndefined();
    const r2 = proximoPassoVideo('aguardando_sim_nao', digitou('sei lá'), 1, 0, {}, COPY);
    if (r2.acao !== 'enviar') throw new Error('esperava enviar');
    expect(r2.telas).toEqual([{ tipo: 'texto', corpo: COPY.handoff_humano }]);
    expect(r2.acoes?.escalarHumano).toBe('bot_nao_entendeu');
  });

  it('nome válido → salva e pede o CPF (2 balões: pedido + promessa de sigilo)', () => {
    const r = proximoPassoVideo('aguardando_nome', digitou('José da Silva'), 0, 0, {}, COPY);
    if (r.acao !== 'enviar') throw new Error('esperava enviar');
    expect(r.acoes?.salvarNome).toBe('José da Silva');
    expect(r.telas).toEqual(COPY.pede_cpf.map((c) => ({ tipo: 'texto', corpo: c })));
    expect(r.telas).toHaveLength(2);
    expect(r.telas[0]).toEqual({ tipo: 'texto', corpo: 'Poderia me informar seu *CPF*?' });
    expect(r.telas[1].tipo === 'texto' && /Nunca pedimos senhas/.test(r.telas[1].corpo)).toBe(true);
    expect(r.passoNovo).toBe('aguardando_cpf');
  });

  it('nome inválido: 1º reprompt, 2ª falha escala (bot_nao_entendeu)', () => {
    const r1 = proximoPassoVideo('aguardando_nome', digitou('José'), 0, 0, {}, COPY);
    if (r1.acao !== 'enviar') throw new Error('esperava enviar');
    expect(r1.telas).toEqual([{ tipo: 'texto', corpo: COPY.reprompt_nome }]);
    const r2 = proximoPassoVideo('aguardando_nome', digitou('123'), 1, 0, {}, COPY);
    if (r2.acao !== 'enviar') throw new Error('esperava enviar');
    expect(r2.acoes?.escalarHumano).toBe('bot_nao_entendeu');
  });

  it('CPF válido → ack interpolado + salvarCpf + agendarResultado', () => {
    const dados = { nome_completo: 'José da Silva' };
    const r = proximoPassoVideo('aguardando_cpf', digitou('meu cpf é 529.982.247-25'), 0, 0, dados, COPY);
    if (r.acao !== 'enviar') throw new Error('esperava enviar');
    expect(r.telas).toEqual([{ tipo: 'texto', corpo: '✅ Recebido, José! Sua análise foi iniciada. Em alguns minutos retorno aqui com uma atualização. ⏳' }]);
    expect(r.acoes?.salvarCpf).toEqual({ digits: CPF_OK, mascarado: '***.***.***-25' });
    expect(r.acoes?.agendarResultado).toBe(true);
    expect(r.passoNovo).toBe('aguardando_resultado');
  });

  it('CPF inválido: 1º reprompt (copy exata), 2ª falha escala (cpf_invalido)', () => {
    const r1 = proximoPassoVideo('aguardando_cpf', digitou('1234'), 0, 0, {}, COPY);
    if (r1.acao !== 'enviar') throw new Error('esperava enviar');
    expect(r1.telas).toEqual([{ tipo: 'texto', corpo: 'Ops, esse CPF parece incompleto. Me envia de novo, por favor 😊' }]);
    const r2 = proximoPassoVideo('aguardando_cpf', digitou('52998224724'), 1, 0, {}, COPY);
    if (r2.acao !== 'enviar') throw new Error('esperava enviar');
    expect(r2.acoes?.escalarHumano).toBe('cpf_invalido');
  });

  it('áudio em etapa ativa: 1º pede texto e conta desvio; 2º desvio escala pra humano', () => {
    const r1 = proximoPassoVideo('aguardando_sim_nao', audio(), 0, 0, {}, COPY);
    if (r1.acao !== 'enviar') throw new Error('esperava enviar');
    expect(r1.telas).toEqual([{ tipo: 'texto', corpo: COPY.audio_desvio }]);
    expect(r1.desvios).toBe(1);
    expect(r1.acoes?.escalarHumano).toBeUndefined();
    const r2 = proximoPassoVideo('aguardando_nome', audio(), 0, 1, {}, COPY);   // desvio acumula ENTRE etapas
    if (r2.acao !== 'enviar') throw new Error('esperava enviar');
    expect(r2.desvios).toBe(2);
    expect(r2.acoes?.escalarHumano).toBe('bot_nao_entendeu');
    expect(r2.telas).toEqual([{ tipo: 'texto', corpo: COPY.handoff_humano }]);
  });

  it('aguardando o resultado diferido e fluxo encerrado: silêncio', () => {
    expect(proximoPassoVideo('aguardando_resultado', digitou('e aí?'), 0, 0, {}, COPY)).toEqual({ acao: 'nada', motivo: 'aguardando_resultado' });
    expect(proximoPassoVideo('fim', digitou('oi'), 0, 0, {}, COPY)).toEqual({ acao: 'nada', motivo: 'fluxo_encerrado' });
  });

  it('mensagensResultado: 3 balões com {primeiro_nome} interpolado (texto final vai pra fila)', () => {
    const baloes = mensagensResultado(COPY, 'José da Silva');
    expect(baloes).toHaveLength(3);
    expect(baloes[0]).toBe('José, atualização da sua análise 📋');
    expect(baloes[1]).toContain('a grande maioria dos contratos que analisamos tem juros acima do limite legal');
    expect(baloes[2]).toContain('ainda hoje');
  });

  it('montarCopyVideo: jsonb parcial sobrepõe o default; chave ausente cai no default', () => {
    const c = montarCopyVideo({ video_url: 'https://x.test/v.mp4', recusa: 'outra copy' });
    expect(c.video_url).toBe('https://x.test/v.mp4');
    expect(c.recusa).toBe('outra copy');
    expect(c.ack_cpf).toBe(DEFAULT_COPY_VIDEO.ack_cpf);
    expect(montarCopyVideo(undefined)).toEqual(DEFAULT_COPY_VIDEO);
  });
});
