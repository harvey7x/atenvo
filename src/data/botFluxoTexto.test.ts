import { describe, it, expect } from 'vitest';
import { proximoPasso, proximoPassoSuporte, telaComoTexto, opcoesDaTela, type Entrada, type Tela } from '../../supabase/functions/bot-runner/fluxo_botoes';

// Campanha por TEXTO (número sem API oficial, ex.: LUIZA): o lead DIGITA em vez de tocar botão.
// O motor é o MESMO da campanha por botões — aqui provamos que as respostas em texto livre caem
// na MESMA decisão que o toque no botão daria, e que cada tela vira um balão de texto limpo.
const digitou = (texto: string): Entrada => ({ texto, ehAudio: false, toqueId: null });
const tocou = (id: string): Entrada => ({ texto: '', ehAudio: false, toqueId: id });

function passo(atual: string, e: Entrada, tentativas = 0, dados: Record<string, unknown> = {}) {
  const r = proximoPasso(atual, e, tentativas, dados);
  if (r.acao !== 'enviar') throw new Error(`esperava enviar, veio ${r.acao}`);
  return r;
}

describe('fluxo por texto — abertura (3 serviços de crédito por texto)', () => {
  for (const t of ['reduzir juros', 'quero reduzir os juros', 'juros mais baixos', 'baixar juros']) {
    it(`"${t}" abre a coleta de nome e guarda reduzir_juros`, () => {
      const r = passo('aguardando_abertura', digitou(t));
      expect(r.passoNovo).toBe('ask_nome');
      expect(r.acoes?.salvarQualificacao).toEqual({ servico_interesse: 'reduzir_juros' });
      expect(proximoPasso('aguardando_abertura', tocou('svc_juros'), 0).acao).toBe('enviar'); // paridade c/ botão
    });
  }
  for (const t of ['aumentar margem', 'aumento de margem', 'mais margem']) {
    it(`"${t}" abre a coleta de nome e guarda aumentar_margem`, () => {
      const r = passo('aguardando_abertura', digitou(t));
      expect(r.passoNovo).toBe('ask_nome');
      expect(r.acoes?.salvarQualificacao).toEqual({ servico_interesse: 'aumentar_margem' });
    });
  }
  for (const t of ['fazer empréstimo', 'quero empréstimo', 'pegar um empréstimo', 'crédito']) {
    it(`"${t}" abre a coleta de nome e guarda fazer_emprestimo`, () => {
      const r = passo('aguardando_abertura', digitou(t));
      expect(r.passoNovo).toBe('ask_nome');
      expect(r.acoes?.salvarQualificacao).toEqual({ servico_interesse: 'fazer_emprestimo' });
    });
  }
  it('texto irreconhecível re-mostra os 3 botões e fica em aguardando_abertura', () => {
    const r = passo('aguardando_abertura', digitou('asdf'));
    expect(r.passoNovo).toBe('aguardando_abertura');
    expect(r.telas[0].tipo).toBe('botoes');
  });
});

describe('fluxo por texto — nome → CPF → handoff (igual aos dois canais)', () => {
  it('nome válido salva e pede o CPF (com a explicação do serviço escolhido)', () => {
    const r = passo('ask_nome', digitou('José Carlos da Silva'), 0, { servico_interesse: 'reduzir_juros' });
    expect(r.passoNovo).toBe('ask_cpf');
    expect(r.acoes?.salvarNome).toBe('José Carlos da Silva');
    expect(r.telas.some((t) => t.tipo === 'texto' && t.corpo.includes('juros'))).toBe(true);
    expect(r.telas.some((t) => t.tipo === 'contato')).toBe(false);
  });
  it('CPF por texto (com pontuação) finaliza: cartão do atendente + roteia por gênero do nome salvo', () => {
    const r = passo('ask_cpf', digitou('529.982.247-25'), 0, { nome_completo: 'José Carlos da Silva' });
    expect(r.passoNovo).toBe('fim');
    expect(r.acoes?.salvarCpf?.digits).toBe('52998224725');
    expect(r.acoes?.finalizar).toEqual({ preferencia: 'contato_murillo', genero: 'homem' });
    expect(r.telas.some((t) => t.tipo === 'contato')).toBe(true);
  });
});

describe('telaComoTexto — renderiza cada tela como UM balão de texto', () => {
  it('botões viram corpo + opções numeradas com emoji', () => {
    const abertura = passo('inicio', digitou('oi')); // último balão é a pergunta com botões
    const botoes = abertura.telas.find((t) => t.tipo === 'botoes')!;
    const txt = telaComoTexto(botoes);
    expect(txt).toContain('1️⃣ Reduzir juros');
    expect(txt).toContain('2️⃣ Aumentar margem');
    expect(txt).toContain('3️⃣ Fazer empréstimo');
    expect(txt).not.toContain('▶');
    expect(txt.startsWith((botoes as { corpo: string }).corpo)).toBe(true);
  });
  it('contato vira cartão em texto (nome + telefone)', () => {
    const tela: Tela = { tipo: 'contato', nome: 'Atendente Murillo', telefone: '+55 51 9103-5329' };
    expect(telaComoTexto(tela)).toBe('📇 *Atendente Murillo*\n📞 +55 51 9103-5329');
  });
  it('texto é devolvido como está', () => {
    expect(telaComoTexto({ tipo: 'texto', corpo: 'Olá!' })).toBe('Olá!');
  });
});

describe('resposta por NÚMERO (1/2/3/emoji) mapeia pela última tela mostrada', () => {
  const OP_ABERTURA = ['svc_juros', 'svc_margem', 'svc_emprestimo'];   // o que opcoesDaTela devolve pra ABERTURA
  it('opcoesDaTela devolve os ids da última tela interativa', () => {
    const abertura = passo('inicio', digitou('oi'));
    expect(opcoesDaTela(abertura.telas)).toEqual(OP_ABERTURA);
  });
  it('"1"/"3" mapeiam pros serviços da abertura (3 opções)', () => {
    expect(passo('aguardando_abertura', digitou('1'), 0, { ultimas_opcoes: OP_ABERTURA }).acoes?.salvarQualificacao).toEqual({ servico_interesse: 'reduzir_juros' });
    expect(passo('aguardando_abertura', digitou('3'), 0, { ultimas_opcoes: OP_ABERTURA }).acoes?.salvarQualificacao).toEqual({ servico_interesse: 'fazer_emprestimo' });
  });
  it('emoji "1️⃣" também resolve', () => {
    expect(passo('aguardando_abertura', digitou('1️⃣'), 0, { ultimas_opcoes: OP_ABERTURA }).passoNovo).toBe('ask_nome');
  });
  it('sem posição fixa: "2" numa tela de 2 opções vira a 2ª opção (não a 3ª)', () => {
    // ultimas_opcoes de 2 itens -> "2" tem que virar o 2º id (índice 1), não uma 3ª posição fixa
    const r = passo('aguardando_abertura', digitou('2'), 0, { ultimas_opcoes: ['svc_margem', 'svc_emprestimo'] });
    expect(r.acoes?.salvarQualificacao).toEqual({ servico_interesse: 'fazer_emprestimo' });
  });
  it('número fora do intervalo ou sem opções salvas → tratado como texto (re-pergunta)', () => {
    expect(passo('aguardando_abertura', digitou('9'), 0, { ultimas_opcoes: OP_ABERTURA }).passoNovo).toBe('aguardando_abertura');
    expect(passo('aguardando_abertura', digitou('1'), 0, {}).passoNovo).toBe('aguardando_abertura'); // sem ultimas_opcoes
  });
});

describe('regressão — o toque no botão continua resolvendo (campanha oficial intacta)', () => {
  it('tocar um serviço abre a coleta de nome mesmo sem texto', () => {
    expect(passo('aguardando_abertura', tocou('svc_juros')).passoNovo).toBe('ask_nome');
  });
  it('suporte: rótulo exato "Andamento do caso" casa o assunto; frase livre vira o resumo', () => {
    const rotulo = proximoPassoSuporte('suporte_menu', digitou('Andamento do caso'), { primeiroNome: 'Ana', consultor: 'Matheus' });
    if (rotulo.acao !== 'enviar') throw new Error('esperava enviar');
    expect(rotulo.acoes?.salvarQualificacao).toEqual({ suporte_assunto: 'andamento' });
    // frase natural (não é rótulo) → tratada como a própria descrição do cliente (finaliza direto)
    const livre = proximoPassoSuporte('suporte_menu', digitou('preciso de ajuda com meu processo'), { primeiroNome: 'Ana', consultor: 'Matheus' });
    if (livre.acao !== 'enviar') throw new Error('esperava enviar');
    expect(livre.passoNovo).toBe('suporte_fim');
  });
});
