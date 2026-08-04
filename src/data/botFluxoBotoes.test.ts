import { describe, it, expect } from 'vitest';
import { proximoPasso, proximoPassoSuporte, inferirGenero, chaveTel, deveHandoff48h, type Entrada, type Tela } from '../../supabase/functions/bot-runner/fluxo_botoes';
import { saidaSuja } from '../../supabase/functions/bot-runner/guardrail';

// Atalhos de entrada
const digitou = (texto: string): Entrada => ({ texto, ehAudio: false, toqueId: null });
const tocou = (id: string): Entrada => ({ texto: '', ehAudio: false, toqueId: id });
const audio = (): Entrada => ({ texto: '', ehAudio: true, toqueId: null });

// Motor determinístico do fluxo CRÉDITO-FIRST enxuto: abertura (3 botões) → NOME → handoff (cartão 5329). Puro.
describe('fluxo_botoes — abertura de crédito, nome e handoff', () => {
  it('abre com 4 balões: saudação (vira legenda do banner) + 3 frentes + OAB + botões', () => {
    const r = proximoPasso(null, digitou('oi'), 0);
    if (r.acao !== 'enviar') throw new Error('esperava enviar');
    expect(r.telas).toHaveLength(4);
    // 1º balão = saudação (o bot-runner usa como legenda do banner)
    expect(r.telas[0]).toEqual({ tipo: 'texto', corpo: 'Olá! Seja bem-vindo(a) à *CAF – Central de Assessoria Financeira*' });
    // 2º = as 3 frentes organizadas
    const frentes = r.telas[1];
    expect(frentes.tipo === 'texto' && /Empréstimo/.test(frentes.corpo) && /Reduzir juros/.test(frentes.corpo) && /Aumentar margem/.test(frentes.corpo)).toBe(true);
    // 3º = credencial OAB
    expect(r.telas[2].tipo === 'texto' && /OAB\/RS 91\.310/.test(r.telas[2].corpo)).toBe(true);
    // 4º = os 3 botões de serviço
    const botoes = r.telas[3];
    expect(botoes.tipo).toBe('botoes');
    if (botoes.tipo === 'botoes') expect(botoes.botoes.map((b) => b.id)).toEqual(['svc_juros', 'svc_margem', 'svc_emprestimo']);
    expect(r.passoNovo).toBe('aguardando_abertura');
  });

  it('tocar um serviço pede o nome, vai para ask_nome e guarda o serviço escolhido', () => {
    const r = proximoPasso('aguardando_abertura', tocou('svc_juros'), 0);
    if (r.acao !== 'enviar') throw new Error('esperava enviar');
    expect(r.telas).toEqual([{ tipo: 'texto', corpo: 'Ótimo! Para começar, como é o seu nome completo?' }]);
    expect(r.passoNovo).toBe('ask_nome');
    expect(r.acoes?.salvarQualificacao).toEqual({ servico_interesse: 'reduzir_juros' });
  });

  it('cada botão de serviço grava o servico_interesse certo', () => {
    expect(proximoPasso('aguardando_abertura', tocou('svc_margem'), 0)).toMatchObject({ acoes: { salvarQualificacao: { servico_interesse: 'aumentar_margem' } } });
    expect(proximoPasso('aguardando_abertura', tocou('svc_emprestimo'), 0)).toMatchObject({ acoes: { salvarQualificacao: { servico_interesse: 'fazer_emprestimo' } } });
  });

  it('toque/texto desconhecido na abertura re-mostra os 3 serviços; fim não re-dispara', () => {
    const r = proximoPasso('aguardando_abertura', digitou('???'), 0);
    if (r.acao !== 'enviar') throw new Error('esperava enviar');
    expect(r.passoNovo).toBe('aguardando_abertura');
    expect(r.telas[0].tipo).toBe('botoes');
    if (r.telas[0].tipo === 'botoes') expect(r.telas[0].botoes.map((b) => b.id)).toEqual(['svc_juros', 'svc_margem', 'svc_emprestimo']);
    expect(proximoPasso('fim', digitou('x'), 0)).toEqual({ acao: 'nada', motivo: 'fluxo_encerrado' });
  });

  // ---- NOME → CPF → HANDOFF ----
  it('nome válido → saúda e pede o CPF em 2 partes (3 balões), guarda o nome, vai pra ask_cpf', () => {
    const r = proximoPasso('ask_nome', digitou('Maria Aparecida Souza'), 0, { servico_interesse: 'aumentar_margem' });
    if (r.acao !== 'enviar') throw new Error('esperava enviar');
    expect(r.passoNovo).toBe('ask_cpf');
    expect(r.encerra).toBe(false);
    expect(r.acoes?.salvarNome).toBe('Maria Aparecida Souza');
    expect(r.telas).toHaveLength(3);
    expect(r.telas[0]).toEqual({ tipo: 'texto', corpo: 'Prazer, Maria! 😊' });
    // pedido do CPF dividido: 1 balão curto pedindo, outro explicando (sem emoji de cadeado)
    expect(r.telas[1]).toEqual({ tipo: 'texto', corpo: 'Agora me envia o seu *CPF* (só os números).' });
    expect(r.telas[2].tipo === 'texto' && !/🔒/.test(r.telas[2].corpo)).toBe(true);
    // NÃO manda cartão nem finaliza ainda (isso é no CPF)
    expect(r.telas.some((t) => t.tipo === 'contato')).toBe(false);
    expect(r.acoes?.finalizar).toBeUndefined();
  });

  it('a explicação do CPF muda pelo SERVIÇO escolhido (juros/margem/empréstimo)', () => {
    const pega = (svc: string) => {
      const r = proximoPasso('ask_nome', digitou('Ana'), 0, { servico_interesse: svc });
      if (r.acao !== 'enviar') throw new Error('esperava enviar');
      const t = r.telas[2];   // a explicação é o 3º balão
      return t.tipo === 'texto' ? t.corpo : '';
    };
    expect(pega('reduzir_juros')).toContain('juros');
    expect(pega('aumentar_margem')).toContain('margem');
    expect(pega('fazer_emprestimo')).toContain('empréstimo');
    expect(pega('')).toContain('situação');   // fallback sem serviço salvo
  });

  it('CPF de 11 dígitos → entrega o cartão do MURILLO (5329), salva o CPF e finaliza (gênero pelo nome salvo)', () => {
    const r = proximoPasso('ask_cpf', digitou('529.982.247-25'), 0, { nome_completo: 'Maria Aparecida Souza' });
    if (r.acao !== 'enviar') throw new Error('esperava enviar');
    expect(r.passoNovo).toBe('fim');
    expect(r.encerra).toBe(true);
    expect(r.acoes?.salvarCpf?.digits).toBe('52998224725');
    expect(r.acoes?.salvarCpf?.mascarado).toBe('***.***.***-25');
    const contato = r.telas.find((t) => t.tipo === 'contato');
    expect(contato).toEqual({ tipo: 'contato', nome: '', telefone: '+55 51 9103-5329' });
    expect(r.acoes?.finalizar).toEqual({ preferencia: 'contato_murillo', genero: 'mulher' });
    // fecho profissional: "Perfeito! ✅" + "clique em Conversar" + cartão
    expect(r.telas[0]).toEqual({ tipo: 'texto', corpo: 'Perfeito! ✅' });
    expect(r.telas.some((t) => t.tipo === 'texto' && /Conversar/.test(t.corpo))).toBe(true);
  });

  it('o fecho (após CPF) é contextual pelo serviço escolhido', () => {
    const fecho = (svc: string) => {
      const r = proximoPasso('ask_cpf', digitou('52998224725'), 0, { nome_completo: 'Ana', servico_interesse: svc });
      if (r.acao !== 'enviar') throw new Error('esperava enviar');
      return r.telas.filter((t) => t.tipo === 'texto').map((t) => (t as { corpo: string }).corpo).join(' | ');
    };
    expect(fecho('reduzir_juros')).toContain('reduzir os seus juros');
    expect(fecho('aumentar_margem')).toContain('aumentar a sua margem');
    expect(fecho('fazer_emprestimo')).toContain('realizar o seu empréstimo');
  });

  it('gênero do handoff sai do nome salvo (homem → rodízio meninas no runner)', () => {
    const r = proximoPasso('ask_cpf', digitou('52998224725'), 0, { nome_completo: 'João Pedro' });
    expect((r as { acoes?: { finalizar?: { genero?: string } } }).acoes?.finalizar?.genero).toBe('homem');
  });

  it('CPF errado 1ª vez → re-pede (tentativas=1, sem escalar); 2ª vez seguida → escala pra humano', () => {
    const um = proximoPasso('ask_cpf', digitou('123'), 0);
    if (um.acao !== 'enviar') throw new Error('esperava enviar');
    expect(um.passoNovo).toBe('ask_cpf');
    expect(um.tentativas).toBe(1);
    expect(um.escalarHumano).toBeUndefined();
    const dois = proximoPasso('ask_cpf', audio(), 1);
    expect((dois as { escalarHumano?: boolean }).escalarHumano).toBe(true);
  });

  it('nome vazio/curto/áudio 1ª vez → re-pede com gentileza, tentativas=1, sem escalar', () => {
    const vazio = proximoPasso('ask_nome', digitou('  '), 0);
    const umChar = proximoPasso('ask_nome', digitou('J'), 0);
    const aud = proximoPasso('ask_nome', audio(), 0);
    for (const r of [vazio, umChar, aud]) {
      if (r.acao !== 'enviar') throw new Error('esperava enviar');
      expect(r.passoNovo).toBe('ask_nome');
      expect(r.tentativas).toBe(1);
      expect(r.telas[0]).toEqual({ tipo: 'texto', corpo: 'Pode me confirmar seu nome completo? 🙂' });
      expect(r.escalarHumano).toBeUndefined();
    }
  });

  it('nome fora do trilho 2ª vez seguida (tentativas=1) → escala pra humano', () => {
    const r = proximoPasso('ask_nome', digitou(''), 1);
    if (r.acao !== 'enviar') throw new Error('esperava enviar');
    expect(r.tentativas).toBe(2);
    expect(r.escalarHumano).toBe(true);
    expect(r.telas[0]).toEqual({ tipo: 'texto', corpo: 'Sem problema! Um de nossos atendentes vai te ajudar com isso pessoalmente. 🙏' });
  });

  it('áudio no passo do NOME também conta como fora do trilho (2ª vez escala)', () => {
    expect((proximoPasso('ask_nome', audio(), 0) as { tentativas: number }).tentativas).toBe(1);
    expect((proximoPasso('ask_nome', audio(), 1) as { escalarHumano?: boolean }).escalarHumano).toBe(true);
  });

  it('nome sem NENHUMA letra ("??","12","!!",".-") → fora do trilho (1ª re-pede, tentativas=1)', () => {
    for (const txt of ['??', '12', '!!', '.-', '  10  ']) {
      const r = proximoPasso('ask_nome', digitou(txt), 0);
      if (r.acao !== 'enviar') throw new Error('esperava enviar');
      expect(r.passoNovo).toBe('ask_nome');
      expect(r.tentativas).toBe(1);
      expect(r.escalarHumano).toBeUndefined();
      expect(r.telas[0]).toEqual({ tipo: 'texto', corpo: 'Pode me confirmar seu nome completo? 🙂' });
    }
  });

  it('nome sem letra 2ª vez seguida (tentativas=1) → escala pra humano', () => {
    const r = proximoPasso('ask_nome', digitou('12'), 1);
    if (r.acao !== 'enviar') throw new Error('esperava enviar');
    expect(r.tentativas).toBe(2);
    expect(r.escalarHumano).toBe(true);
  });

  it('nome legítimo com ACENTO / HÍFEN / COMPOSTO NÃO é barrado (avança pro CPF e salva igualzinho)', () => {
    for (const nome of ['José', 'Ana-Maria', 'Maria da Silva', 'João', 'Ândrius', 'Conceição', "D'Ávila"]) {
      const r = proximoPasso('ask_nome', digitou(nome), 0);
      if (r.acao !== 'enviar') throw new Error(`esperava enviar para "${nome}"`);
      expect(r.passoNovo).toBe('ask_cpf');            // avançou = foi aceito como nome válido
      expect(r.acoes?.salvarNome).toBe(nome);         // salvo exatamente como veio (acento preservado)
      expect(r.escalarHumano).toBeUndefined();
    }
  });

  // ---- gênero (usado na distribuição por rodízio no bot-runner) ----
  it('gênero: régua conservadora + nomes comuns em consoante (Matheus/Lucas… agora homem)', () => {
    for (const n of ['João Pedro', 'Marcelo', 'José da Silva', 'Luiz', 'André', 'Rafael', 'Matheus', 'Lucas', 'Marcos', 'Carlos', 'Miguel']) expect(inferirGenero(n)).toBe('homem');
    for (const n of ['Maria', 'Ana Paula', 'Juliana Alves', 'Raquel', 'Isabel', 'Conceição', 'Simone', 'Eliane']) expect(inferirGenero(n)).toBe('mulher');
    for (const n of ['Alex', 'Ariel', 'Wesley', 'Kariny', '', 'X']) expect(inferirGenero(n)).toBe('ambiguo');
    expect(inferirGenero('Nicola')).toBe('homem');   // exceção: -a masculino
  });

  // ---- SUPORTE (cliente que já tem dono e volta) ----
  const SUP = { primeiroNome: 'Maria', consultor: 'Giovana' };
  it('suporte: abre com saudação por nome + menu de 3 assuntos', () => {
    const r = proximoPassoSuporte(null, digitou('oi'), SUP);
    if (r.acao !== 'enviar') throw new Error('esperava enviar');
    expect(r.passoNovo).toBe('suporte_menu');
    expect(r.telas[0]).toEqual({ tipo: 'texto', corpo: 'Oi de novo, Maria! 👋 Que bom te ver por aqui.' });
    expect(r.telas[1].tipo).toBe('botoes');
    if (r.telas[1].tipo === 'botoes') expect(r.telas[1].botoes.map((b) => b.id)).toEqual(['sup_andamento', 'sup_documento', 'sup_outro']);
  });

  it('suporte: tocou um assunto → pede o resumo citando o consultor, guarda o assunto', () => {
    const r = proximoPassoSuporte('suporte_menu', tocou('sup_andamento'), SUP);
    if (r.acao !== 'enviar') throw new Error('esperava enviar');
    expect(r.passoNovo).toBe('suporte_resumo');
    expect(r.acoes?.salvarQualificacao).toEqual({ suporte_assunto: 'andamento' });
    expect(r.telas[0].tipo === 'texto' && r.telas[0].corpo.includes('Giovana')).toBe(true);
  });

  it('suporte: no menu, texto/áudio livre (sem botão) já vira o resumo e finaliza', () => {
    for (const e of [digitou('preciso de ajuda com meu processo'), audio()]) {
      const r = proximoPassoSuporte('suporte_menu', e, SUP);
      if (r.acao !== 'enviar') throw new Error('esperava enviar');
      expect(r.passoNovo).toBe('suporte_fim');
      expect(r.encerra).toBe(true);
      expect(r.acoes?.finalizarSuporte).toBe(true);
    }
  });

  it('suporte: no passo de resumo, qualquer coisa (áudio inclusive) finaliza + handoff', () => {
    const r = proximoPassoSuporte('suporte_resumo', audio(), SUP);
    if (r.acao !== 'enviar') throw new Error('esperava enviar');
    expect(r.passoNovo).toBe('suporte_fim');
    expect(r.acoes?.finalizarSuporte).toBe(true);
    expect(r.telas[0].tipo === 'texto' && r.telas[0].corpo.includes('Giovana')).toBe(true);
  });

  it('suporte: passo concluído não re-dispara', () => {
    expect(proximoPassoSuporte('suporte_fim', digitou('x'), SUP)).toEqual({ acao: 'nada', motivo: 'suporte_concluido' });
  });

  it('suporte: todos os balões passam no guardrail (nome de homem no consultor inclusive)', () => {
    const ramos = [
      proximoPassoSuporte(null, digitou('oi'), { primeiroNome: 'João', consultor: 'Matheus' }),
      proximoPassoSuporte('suporte_menu', tocou('sup_documento'), { primeiroNome: 'João', consultor: 'Matheus' }),
      proximoPassoSuporte('suporte_menu', digitou('livre'), { primeiroNome: 'João', consultor: 'Matheus' }),
      proximoPassoSuporte('suporte_resumo', digitou('resumo'), { primeiroNome: 'João', consultor: 'Matheus' }),
    ];
    for (const r of ramos) { if (r.acao !== 'enviar') continue; for (const t of r.telas as Tela[]) if (t.tipo !== 'contato') expect(saidaSuja(t.corpo)).toBeNull(); }
  });

  it('deveHandoff48h: só quando conversa_antiga E no meio do fluxo (tem passo, ≠ fim)', () => {
    expect(deveHandoff48h('conversa_antiga', 'ask_nome')).toBe(true);
    expect(deveHandoff48h('conversa_antiga', 'aguardando_abertura')).toBe(true);
    expect(deveHandoff48h('conversa_antiga', 'fim')).toBe(false);        // completou -> não
    expect(deveHandoff48h('conversa_antiga', null)).toBe(false);         // nunca entrou -> não
    expect(deveHandoff48h('conversa_antiga', undefined)).toBe(false);
    expect(deveHandoff48h('bot_pausado', 'ask_nome')).toBe(false);       // outro motivo (ex.: já pausado) -> não
    expect(deveHandoff48h('ok', 'ask_nome')).toBe(false);
  });

  it('mensagem tranquilizadora do retorno 48h passa no guardrail', () => {
    expect(saidaSuja('Oi! Um dos nossos atendentes já vai te atender. 🙂')).toBeNull();
  });

  it('chaveTel: mesmo número em formatos diferentes casa; números diferentes não', () => {
    // 555180300370 (sem 9º) e 5551980300370 (com 9º) e local -> mesma chave
    expect(chaveTel('555180300370')).toBe('5180300370');
    expect(chaveTel('5551980300370')).toBe(chaveTel('555180300370'));
    expect(chaveTel('51 98030-0370')).toBe(chaveTel('555180300370'));
    // número diferente NÃO casa (falha pro lado seguro = fica dry)
    expect(chaveTel('555193297508')).not.toBe(chaveTel('555180300370'));
  });

  it('TODO balão de TODOS os ramos respeita as travas (guardrail limpo)', () => {
    const ramos = [
      proximoPasso(null, digitou('oi'), 0),
      proximoPasso('aguardando_abertura', tocou('svc_juros'), 0),
      proximoPasso('aguardando_abertura', tocou('svc_margem'), 0),
      proximoPasso('aguardando_abertura', tocou('svc_emprestimo'), 0),
      proximoPasso('aguardando_abertura', digitou('???'), 0),
      proximoPasso('ask_nome', digitou('João da Silva'), 0, { servico_interesse: 'reduzir_juros' }),   // -> pede CPF (juros)
      proximoPasso('ask_nome', digitou('Ana'), 0, { servico_interesse: 'aumentar_margem' }),           // -> pede CPF (margem)
      proximoPasso('ask_nome', digitou('Ana'), 0, { servico_interesse: 'fazer_emprestimo' }),          // -> pede CPF (empréstimo)
      proximoPasso('ask_nome', digitou('Ana'), 0),             // -> pede CPF (fallback)
      proximoPasso('ask_nome', digitou(''), 0),                 // -> re-pede
      proximoPasso('ask_nome', digitou(''), 1),                 // -> escala
      proximoPasso('ask_cpf', digitou('52998224725'), 0, { nome_completo: 'João da Silva' }),  // -> handoff (cartão + finaliza)
      proximoPasso('ask_cpf', digitou('123'), 0),               // -> re-pede
      proximoPasso('ask_cpf', digitou('123'), 1),               // -> escala
    ];
    for (const r of ramos) {
      if (r.acao !== 'enviar') continue;
      for (const t of r.telas as Tela[]) if (t.tipo !== 'contato') expect(saidaSuja(t.corpo)).toBeNull();
    }
  });
});
