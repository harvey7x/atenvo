// fluxo_botoes.ts — MOTOR do atendimento por BOTÕES no canal oficial (Cloud API).
// Determinístico, SEM IA. Puro (sem Deno/DB) — compartilhado com os testes vitest, igual ao fluxo.ts.
//
// O motor NÃO envia nada e NÃO toca no banco: dado (passo atual, entrada do lead, nº de tentativas),
// ele decide QUAIS balões mostrar, QUAL o próximo passo, o NOVO contador e AÇÕES (guardar nome,
// escalar pra humano, finalizar). Quem envia pela Cloud API e persiste é o bot-runner.
//
// FLUXO CRÉDITO-FIRST ENXUTO (2026-08-03/04): abertura (banner anteposto pelo bot-runner + 3 botões de
// serviço: reduzir juros / aumentar margem / fazer empréstimo) → NOME → CPF (com a explicação variando
// pelo serviço escolhido: consultar juros/margem/possibilidade de empréstimo) → entrega o cartão do
// atendente humano (chip MURILLO 5329) e FINALIZA, disparando a distribuição por rodízio (gênero
// inferido pelo nome; o bot-runner roteia/atribui). SEM advogado/bancos/preferência — o resto quem
// qualifica é o atendente. O SUPORTE (cliente que já tem dono e volta) segue à parte.
//
// TRAVAS DO TEXTO: nada de valor, %, prazo, "você tem direito" ou "foi vítima". (O bot-runner ainda
// passa cada balão pelo guardrail saidaSuja como defesa em profundidade.)
import { mascararCpf, primeiroNome } from './fluxo.ts';

export interface Botao { id: string; titulo: string }                 // reply button (máx 3/tela; título <=20)
export interface ItemLista { id: string; titulo: string; descricao?: string }
export interface SecaoLista { titulo?: string; itens: ItemLista[] }

/** Uma "tela" (um balão) que o bot mostra ao lead. */
export type Tela =
  | { tipo: 'botoes'; corpo: string; botoes: Botao[] }
  | { tipo: 'lista'; corpo: string; tituloBotao: string; secoes: SecaoLista[] }
  | { tipo: 'contato'; nome: string; telefone: string }   // vCard; `nome` é preenchido pelo bot-runner
  | { tipo: 'texto'; corpo: string };

/** O que chegou do lead: texto digitado, se foi áudio (fora do trilho nos passos de texto) e o id
 *  do botão tocado (quando veio de botão). */
export interface Entrada { texto: string; ehAudio: boolean; toqueId: string | null }

/** Ações de efeito colateral que o bot-runner executa (guardar dados / escalar).
 *  salvarQualificacao: pares chave→valor persistidos em dados_qualificacao via o MERGE que o
 *  bot_avancar_etapa já faz (não tem RPC dedicada — reusa o mecanismo existente). */
export interface Acoes {
  salvarNome?: string;
  /** CPF coletado: dígitos crus (o bot-runner grava em contatos.cpf via RPC) + mascarado (dados_qualificacao). */
  salvarCpf?: { digits: string; mascarado: string };
  salvarQualificacao?: Record<string, unknown>;
  /** FECHO: sinaliza ao bot-runner pra rotear/atribuir o consultor. O gênero é decidido aqui (puro,
   *  pelo nome); quem resolve o consultor + rodízio + atribuição + pausa (handoff) é o bot-runner. */
  finalizar?: { preferencia: 'mensagem' | 'ligacao' | 'presencial' | 'contato_murillo'; genero: 'homem' | 'mulher' | 'ambiguo' };
  /** SUPORTE: encerra o mini-fluxo de suporte -> o bot-runner pausa + precisa_humano (rótulo
   *  suporte_cliente) SEM re-rotear (mantém o responsavel_id atual = o dono do contato). */
  finalizarSuporte?: boolean;
}

/** Decisão do motor: envia balões e avança (com o novo contador), ou não faz nada. */
export type ResultadoPasso =
  | { acao: 'enviar'; telas: Tela[]; passoNovo: string; tentativas: number; encerra: boolean; escalarHumano?: boolean; acoes?: Acoes }
  | { acao: 'nada'; motivo: string };

// ---- helpers de tela ----
const T = (corpo: string): Tela => ({ tipo: 'texto', corpo });
const B = (corpo: string, botoes: Botao[]): Tela => ({ tipo: 'botoes', corpo, botoes });

// "Tem pelo menos uma LETRA?" — \p{L} é a classe Unicode de letra, de QUALQUER idioma, incluindo
// acentuadas (á é ê ã õ ç ñ…). Assim "José", "Ana-Maria", "Maria da Silva" passam (têm letra), e
// "??", "12", "!!" caem fora do trilho. Hífen/espaço não são letra, mas basta UMA letra pra valer.
const temLetra = (s: string) => /\p{L}/u.test(s);

// ---- Botões da abertura: os 3 SERVIÇOS de crédito (abertura crédito-first). Título ≤20 chars (Meta).
//      O toque em qualquer um cai no MESMO trilho (→ nome → handoff) guardando `servico_interesse` —
//      quem qualifica cada serviço é o atendente. Títulos de botão NÃO passam pelo saidaSuja (ele só
//      checa `corpo`), mas mantemos qualitativo por higiene. ----
const BTN_SVC_JUROS: Botao = { id: 'svc_juros', titulo: 'Reduzir juros' };              // 13
const BTN_SVC_MARGEM: Botao = { id: 'svc_margem', titulo: 'Aumentar margem' };          // 15
const BTN_SVC_EMPRESTIMO: Botao = { id: 'svc_emprestimo', titulo: 'Fazer empréstimo' }; // 16

// ---- Abertura profissional (4 balões): saudação + 3 pontos organizados + credencial OAB + botões.
//      O BANNER (imagem) é enviado pelo bot-runner na camada de ENTREGA (Cloud-only, via CREDITO_BANNER_URL)
//      usando o 1º balão (a saudação) como LEGENDA — imagem + saudação viram UMA mensagem. TRAVAS DO
//      TEXTO valem: nada de taxa/valor/%/prazo (o saidaSuja barra) — copy só qualitativa. ----
const ABERTURA: Tela[] = [
  T('Olá! Seja bem-vindo(a) à *CAF – Central de Assessoria Financeira*'),
  T('Ajudamos aposentados e pensionistas do INSS em três frentes:\n\n💰 *Empréstimo* — crédito do jeito justo, sem juros abusivos\n📉 *Reduzir juros* — revisar os juros dos seus contratos\n📈 *Aumentar margem* — mais espaço no seu benefício'),
  T('Dr. *Rafael Ribeiro de Menezes — OAB/RS 91.310*\n📍 *Rua Uruguai 287, Sala 32* — Centro Histórico, Porto Alegre'),
  B('Por onde você quer começar?', [BTN_SVC_JUROS, BTN_SVC_MARGEM, BTN_SVC_EMPRESTIMO]),
];

// ---- Handoff pro atendente humano no chip MURILLO (5329). O cartão é SEMPRE o 5329; o dono interno
//      (responsável) roda no rodízio via `finalizar` — o bot-runner resolve/atribui e preenche o NOME
//      exibido no cartão. Cloud-only. Coleta NOME + CPF (só isso); o resto quem qualifica é o atendente. ----
const CARD_MURILLO = '+55 51 9103-5329';   // exibido no vCard; os dígitos (555191035329) viram o wa_id no transporte

// Explicação do CPF muda pelo SERVIÇO escolhido na abertura (dados_qualificacao.servico_interesse):
// é o que dá sentido pra pessoa mandar o CPF ("serve pra consultar X"). Sempre qualitativo (nada de
// número/%/prazo → passa no saidaSuja). Fallback genérico quando não há serviço salvo.
function explicaServico(dados: Record<string, unknown>): string {
  switch (String(dados.servico_interesse ?? '')) {
    case 'reduzir_juros': return 'consulta os seus juros atuais';
    case 'aumentar_margem': return 'consulta a sua margem disponível';
    case 'fazer_emprestimo': return 'vê a sua possibilidade de empréstimo';
    default: return 'consulta a sua situação';
  }
}
// Fecho contextual: "entre em contato para ___" muda pelo serviço que a pessoa escolheu.
function fechoServico(dados: Record<string, unknown>): string {
  switch (String(dados.servico_interesse ?? '')) {
    case 'reduzir_juros': return 'reduzir os seus juros';
    case 'aumentar_margem': return 'aumentar a sua margem';
    case 'fazer_emprestimo': return 'realizar o seu empréstimo';
    default: return 'continuar o seu atendimento';
  }
}

// ---- SUPORTE (cliente que já tem dono e volta numa conversa dormente) — títulos ≤20 chars ----
const BTN_SUP_ANDAMENTO: Botao = { id: 'sup_andamento', titulo: 'Andamento do caso' };   // 17
const BTN_SUP_DOCUMENTO: Botao = { id: 'sup_documento', titulo: 'Dúvida em documento' };  // 19
const BTN_SUP_OUTRO: Botao = { id: 'sup_outro', titulo: 'Outro assunto' };                // 13

// Régua de gênero pelo PRIMEIRO nome. CONSERVADORA: na dúvida devolve 'ambiguo' (humano decide).
// Nunca chuta — só automatiza quando a terminação -a/-o é clara ou o nome está numa lista curada.
const G_UNISSEX = new Set(['alex', 'ariel', 'cris', 'darci', 'dari', 'eli', 'remy', 'nikki', 'sasha', 'lea']);
// Inclui femininos em "-ção" (Conceição/Assunção/Encarnação): normalizam pra "-o" e cairiam
// erradamente em "homem" pelo sufixo, então entram explícitos aqui.
const G_FEM = new Set(['raquel', 'isabel', 'ester', 'esther', 'ines', 'beatriz', 'mercedes', 'ruth', 'carmem', 'carmen', 'noemi', 'miriam', 'conceicao', 'assuncao', 'encarnacao',
  'simone', 'ivone', 'ivete', 'eliane', 'viviane', 'rosane', 'cristiane', 'adriane', 'luciane', 'josiane', 'daiane', 'isabelle', 'gabrielle', 'elizabeth', 'edith', 'agnes', 'doris', 'lais', 'pilar']);
// Nomes masculinos comuns terminados em consoante/-e/-i (o sufixo -a/-o não pega): sem eles, nomes
// como "Matheus" caíam em ambíguo (foi o bug do cartão "CAF – Assessoria").
const G_MASC = new Set(['jose', 'luiz', 'luis', 'andre', 'felipe', 'henrique', 'jorge', 'vicente', 'davi', 'moises', 'israel', 'gabriel', 'rafael', 'daniel', 'manuel', 'joel', 'ismael', 'nicola', 'luca',
  'matheus', 'mateus', 'lucas', 'marcos', 'carlos', 'miguel', 'samuel', 'gael', 'heitor', 'arthur', 'anderson', 'wilson', 'edson', 'nelson', 'robson', 'emerson', 'everton', 'kevin', 'alan', 'cristian', 'raul', 'joaquim', 'benjamin']);
const G_MASC_TERMINA_A = new Set(['nicola', 'luca', 'juca', 'sena']);   // homens terminados em -a (exceção)
export function inferirGenero(nomeCompleto: string): 'homem' | 'mulher' | 'ambiguo' {
  const p = norm((nomeCompleto || '').trim().split(/\s+/)[0] ?? '');
  if (p.length < 2) return 'ambiguo';
  if (G_UNISSEX.has(p)) return 'ambiguo';
  if (G_FEM.has(p)) return 'mulher';
  if (G_MASC.has(p)) return 'homem';
  if (p.endsWith('a') && !G_MASC_TERMINA_A.has(p)) return 'mulher';
  if (p.endsWith('o')) return 'homem';
  return 'ambiguo';                                                     // consoante/-e/-i/-u sem lista = incerto
}

/** Motor puro. Dado (passo atual, entrada, tentativas, dados acumulados), decide balões + passo +
 *  contador. `dados` = dados_qualificacao atual (só o carrinho de bancos usa, pra saber o que já
 *  foi escolhido); os demais passos ignoram. */
export function proximoPasso(passoAtual: string | null, entrada: Entrada, tentativas: number, dados: Record<string, unknown> = {}): ResultadoPasso {
  entrada = resolverNumero(entrada, dados);   // canal por texto: "1"/"2"/"1️⃣" viram o id da opção
  // início: abertura real.
  if (!passoAtual || passoAtual === 'inicio') {
    return { acao: 'enviar', telas: ABERTURA, passoNovo: 'aguardando_abertura', tentativas: 0, encerra: false };
  }

  // escolha da abertura: qual dos 3 SERVIÇOS de crédito. Qualquer um segue o MESMO trilho e guarda o
  // serviço em `servico_interesse` (chave NOVA — não reusa `interesse`, que o fluxo de IA já usa como
  // boolean). Sem "como funciona"/"agora não": a abertura virou crédito-first (decisão do dono, 2026-08-03).
  if (passoAtual === 'aguardando_abertura') {
    const svc = qualServico(entrada);
    if (svc) {
      return {
        acao: 'enviar', telas: [T('Ótimo! Para começar, como é o seu nome completo?')],
        passoNovo: 'ask_nome', tentativas: 0, encerra: false,
        acoes: { salvarQualificacao: { servico_interesse: svc } },
      };
    }
    // não entendeu: re-mostra os 3 botões de serviço, sem IA (a escalação pra humano é só do CPF).
    return { acao: 'enviar', telas: [B('É só tocar numa das opções abaixo. 🙂', [BTN_SVC_JUROS, BTN_SVC_MARGEM, BTN_SVC_EMPRESTIMO])], passoNovo: 'aguardando_abertura', tentativas: 0, encerra: false };
  }

  // NOME: válido = ≥2 chars E ≥1 LETRA (aceita acento/hífen/espaço; barra "??", "12", "!!"). Ao validar,
  // saúda e PEDE O CPF, explicando pra que serve conforme o SERVIÇO escolhido (juros/margem/empréstimo).
  if (passoAtual === 'ask_nome') {
    const nome = entrada.ehAudio ? '' : entrada.texto.trim();
    if (nome.length >= 2 && temLetra(nome)) {
      const primeiro = primeiroNome(nome) || nome;
      return {
        acao: 'enviar',
        telas: [
          T(`Prazer, ${primeiro}! 😊`),
          T('Agora me envia o seu *CPF* (só os números).'),
          T(`É com ele que a nossa equipe ${explicaServico(dados)} e já adianta o seu atendimento.`),
        ],
        passoNovo: 'ask_cpf', tentativas: 0, encerra: false,
        acoes: { salvarNome: nome },
      };
    }
    // SAIU DO TRILHO (vazio, 1 caractere ou áudio): 1ª re-pede, 2ª escala pra humano.
    const n = tentativas + 1;
    if (n < 2) {
      return { acao: 'enviar', telas: [T('Pode me confirmar seu nome completo? 🙂')], passoNovo: 'ask_nome', tentativas: n, encerra: false };
    }
    return { acao: 'enviar', telas: [T('Sem problema! Um de nossos atendentes vai te ajudar com isso pessoalmente. 🙏')], passoNovo: 'ask_nome', tentativas: n, encerra: false, escalarHumano: true };
  }

  // CPF: valida SÓ 11 dígitos (não checa DV, conforme combinado). Ao validar, FECHA o fluxo entregando o
  // cartão do atendente (5329) + dispara a distribuição (finalizar, roteada por gênero pelo nome já salvo).
  if (passoAtual === 'ask_cpf') {
    const digits = entrada.ehAudio ? '' : entrada.texto.replace(/\D/g, '');
    if (digits.length === 11) {
      const genero = inferirGenero(String(dados.nome_completo ?? ''));
      return {
        acao: 'enviar',
        telas: [
          T('Perfeito! ✅'),
          T(`Entre em contato com um dos nossos consultores abaixo, para ${fechoServico(dados)}.`),
          T('É só clicar em *Conversar* ↙️'),
          { tipo: 'contato', nome: '', telefone: CARD_MURILLO },   // nome preenchido pelo bot-runner (genérico "CAF Atendimento")
        ],
        passoNovo: 'fim', tentativas: 0, encerra: true,
        acoes: { salvarCpf: { digits, mascarado: mascararCpf(digits) }, finalizar: { preferencia: 'contato_murillo', genero } },
      };
    }
    // SAIU DO TRILHO (texto errado, número incompleto ou áudio): 1ª re-pede, 2ª escala pra humano.
    const n = tentativas + 1;
    if (n < 2) {
      return { acao: 'enviar', telas: [T('Hmm, esse CPF não parece completo. Pode me mandar os 11 números, sem pontos nem traços? 🙂')], passoNovo: 'ask_cpf', tentativas: n, encerra: false };
    }
    return { acao: 'enviar', telas: [T('Sem problema! Um de nossos atendentes vai te ajudar com isso pessoalmente. 🙏')], passoNovo: 'ask_cpf', tentativas: n, encerra: false, escalarHumano: true };
  }

  // 'fim' encerrado; qualquer outro é desconhecido.
  return { acao: 'nada', motivo: passoAtual === 'fim' ? 'fluxo_encerrado' : `passo_desconhecido:${passoAtual}` };
}

const norm = (s: string) => s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Lacuna das 48h: lead que voltou depois de `bot_pode_atuar='conversa_antiga'` deve cair pra humano
 *  SÓ se estava NO MEIO do fluxo por botões (tem passo salvo e não terminou). Assim não pega quem
 *  completou (esse retorna 'bot_pausado'/'ja_tem_responsavel' antes da trava de 48h) nem quem nunca
 *  entrou (passo null). Puro pra ser testável. */
export function deveHandoff48h(motivoElegibilidade: string | null | undefined, passoBotoes: string | null | undefined): boolean {
  return motivoElegibilidade === 'conversa_antiga' && !!passoBotoes && passoBotoes !== 'fim';
}

/** Chave canônica de telefone: DDD + 8 finais (sem país 55, sem 9º dígito). Serve pra comparar
 *  números em formatos diferentes (ex.: allowlist de envio real) — se não casar, o chamador
 *  trata como "não liberado" (falha pro lado seguro = dry_run). */
export function chaveTel(num: string): string {
  let d = (num || '').replace(/\D/g, '');
  if (d.startsWith('55') && d.length >= 12) d = d.slice(2);   // tira o país 55
  if (d.length === 11) d = d.slice(0, 2) + d.slice(3);        // tira o 9º dígito -> DDD + 8 finais
  return d;
}

// ---- INTERPRETAÇÃO DE TEXTO LIVRE (canais SEM botões, ex.: Evolution/LUIZA) ----
// No canal oficial o lead TOCA no botão → `toqueId` resolve antes e nada aqui roda: por isso ampliar
// os sinônimos NÃO muda o comportamento da campanha por botões. Nos canais de texto, é isto que
// traduz "sim/quero/verificar", "não tenho", "por ligação" etc. na MESMA decisão que o botão daria.
//
// `casa` normaliza (minúsculas, sem acento, sem pontuação) e casa por FRASE exata OU por PALAVRA
// solta. A ordem de chamada nos matchers importa: NEGAÇÃO e "não sei" são checados ANTES do "sim",
// senão "não tenho" cairia no ramo afirmativo por conter "tenho".
function casa(texto: string, exatas: string[], palavras: string[]): boolean {
  const p = norm(texto).replace(/[^\p{L}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
  if (!p) return false;
  if (exatas.includes(p)) return true;
  const ws = new Set(p.split(' '));
  return palavras.some((w) => ws.has(w));
}

/** Casa a escolha do SERVIÇO de crédito da abertura: por id (botão) ou por texto livre (canal sem
 *  botões). Ordem importa: 'margem' é checado ANTES de 'emprestimo' — frases de margem costumam citar
 *  "empréstimo" ("aumentar margem para novo empréstimo") e cairiam no ramo errado. */
function qualServico(entrada: Entrada): 'reduzir_juros' | 'aumentar_margem' | 'fazer_emprestimo' | null {
  if (entrada.toqueId === 'svc_juros') return 'reduzir_juros';
  if (entrada.toqueId === 'svc_margem') return 'aumentar_margem';
  if (entrada.toqueId === 'svc_emprestimo') return 'fazer_emprestimo';
  if (entrada.ehAudio) return null;
  const t = entrada.texto;
  if (casa(t, ['reduzir juros', 'reduzir os juros', 'baixar juros', 'diminuir juros', 'juros mais baixos', 'juros altos'], ['juros'])) return 'reduzir_juros';
  if (casa(t, ['aumentar margem', 'aumentar a margem', 'aumento de margem', 'mais margem'], ['margem'])) return 'aumentar_margem';
  if (casa(t, ['fazer emprestimo', 'fazer um emprestimo', 'quero emprestimo', 'pegar emprestimo', 'novo emprestimo', 'emprestimo', 'credito', 'emprestar'], ['emprestimo', 'credito', 'emprestar'])) return 'fazer_emprestimo';
  return null;
}

/** Motor puro do SUPORTE (cliente que já tem dono e volta). `ctx` traz o primeiro nome do cliente e
 *  o nome do consultor DONO (o bot-runner resolve; aqui só interpola). Áudio é BEM-VINDO (não é fora
 *  do trilho): no passo de resumo qualquer coisa vale; no menu, texto/áudio livre já vira o resumo. */
export function proximoPassoSuporte(passoAtual: string | null, entrada: Entrada, ctx: { primeiroNome: string; consultor: string }, dados: Record<string, unknown> = {}): ResultadoPasso {
  entrada = resolverNumero(entrada, dados);   // canal por texto: "1"/"2"/"1️⃣" viram o id da opção
  if (!passoAtual || passoAtual === 'inicio') {
    return {
      acao: 'enviar', passoNovo: 'suporte_menu', tentativas: 0, encerra: false,
      telas: [
        T(`Oi de novo, ${ctx.primeiroNome}! 👋 Que bom te ver por aqui.`),
        B('Como podemos te ajudar hoje?', [BTN_SUP_ANDAMENTO, BTN_SUP_DOCUMENTO, BTN_SUP_OUTRO]),
      ],
    };
  }
  if (passoAtual === 'suporte_menu') {
    const assunto = qualSuporteAssunto(entrada);
    if (assunto) {
      return {
        acao: 'enviar', passoNovo: 'suporte_resumo', tentativas: 0, encerra: false,
        telas: [T(`Entendi! 🙂 Me conta em uma mensagem ou áudio o que você precisa, que ${ctx.consultor} já vai te atender.`)],
        acoes: { salvarQualificacao: { suporte_assunto: assunto } },
      };
    }
    return finalizarSuporteResp(ctx, 'livre');   // não tocou botão: a msg/áudio já É o resumo (mais natural)
  }
  if (passoAtual === 'suporte_resumo') {
    return finalizarSuporteResp(ctx, 'ok');       // qualquer coisa (áudio/texto) é o resumo
  }
  return { acao: 'nada', motivo: passoAtual === 'suporte_fim' ? 'suporte_concluido' : `suporte_desconhecido:${passoAtual}` };
}

function finalizarSuporteResp(ctx: { consultor: string }, resumo: string): ResultadoPasso {
  return {
    acao: 'enviar', passoNovo: 'suporte_fim', tentativas: 0, encerra: true,
    telas: [T(`Prontinho! Sua mensagem já foi registrada. ${ctx.consultor} vai te responder aqui em breve. 🙏`)],
    acoes: { salvarQualificacao: { suporte_resumo: resumo }, finalizarSuporte: true },
  };
}

/** Casa o assunto do suporte por id do botão ou pelo RÓTULO exato digitado. Fica CONSERVADOR de
 *  propósito: no menu de suporte, qualquer texto livre que NÃO seja um rótulo de botão já vira o
 *  resumo do cliente (mais natural no canal por texto) — por isso não ampliamos por palavra solta,
 *  senão "preciso de ajuda com meu processo" seria classificado em vez de virar a mensagem dele. */
function qualSuporteAssunto(entrada: Entrada): 'andamento' | 'documento' | 'outro' | null {
  if (entrada.toqueId === 'sup_andamento') return 'andamento';
  if (entrada.toqueId === 'sup_documento') return 'documento';
  if (entrada.toqueId === 'sup_outro') return 'outro';
  const t = norm(entrada.ehAudio ? '' : entrada.texto);
  if (!t) return null;
  if (t === norm(BTN_SUP_ANDAMENTO.titulo)) return 'andamento';
  if (t === norm(BTN_SUP_DOCUMENTO.titulo)) return 'documento';
  if (t === norm(BTN_SUP_OUTRO.titulo)) return 'outro';
  return null;
}

// ---- RENDERIZAÇÃO EM TEXTO (transportes SEM interativos, ex.: Evolution/LUIZA) ----
// Converte uma Tela (botões/lista/contato/texto) em UM balão de texto puro, para o mesmo fluxo
// funcionar num número sem API oficial. O canal oficial NÃO usa isto (envia botões/lista/vCard de
// verdade). Assim as duas campanhas rodam o MESMO motor e mudam só a forma de exibir as opções.
// Opções numeradas com EMOJI de número (1️⃣ 2️⃣ 3️⃣…). O lead responde com o número OU com o texto;
// resolverNumero() converte o número na opção certa via dados.ultimas_opcoes (sem casar por posição fixa).
const NUM_EMOJI = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
const numerar = (titulos: string[]) => titulos.map((t, i) => `${NUM_EMOJI[i] ?? `${i + 1}.`} ${t}`).join('\n');
export function telaComoTexto(tela: Tela): string {
  if (tela.tipo === 'texto') return tela.corpo;
  if (tela.tipo === 'contato') return `📇 *${tela.nome}*\n📞 ${tela.telefone}`;
  if (tela.tipo === 'botoes') return `${tela.corpo}\n\n${numerar(tela.botoes.map((b) => b.titulo))}`;
  // lista (carrinho de bancos): corpo + itens; o "tituloBotao" da API oficial não faz sentido em texto.
  return `${tela.corpo}\n\n${numerar(tela.secoes.flatMap((s) => s.itens).map((it) => it.titulo))}`;
}

/** ids das opções da ÚLTIMA tela interativa de um burst (a que o lead vai responder). O bot-runner
 *  persiste em dados_qualificacao.ultimas_opcoes para o número digitado virar a opção certa depois. */
export function opcoesDaTela(telas: Tela[]): string[] {
  for (let i = telas.length - 1; i >= 0; i--) {
    const t = telas[i];
    if (t.tipo === 'botoes') return t.botoes.map((b) => b.id);
    if (t.tipo === 'lista') return t.secoes.flatMap((s) => s.itens).map((it) => it.id);
  }
  return [];
}

/** Canal por TEXTO: se o lead respondeu só um NÚMERO (1, 2, "1️⃣"…), converte no id da opção
 *  correspondente da última tela (dados.ultimas_opcoes). Assim o mesmo motor por toqueId vale para
 *  número digitado, SEM casar por posição fixa (que erraria telas com nº de opções diferente, como o
 *  "Como funciona?"). CPF (11 dígitos) e nome não são afetados: só bate em 1–2 dígitos isolados. */
function resolverNumero(entrada: Entrada, dados: Record<string, unknown>): Entrada {
  if (entrada.toqueId || entrada.ehAudio) return entrada;
  const bruto = (entrada.texto || '').replace(/[️⃣]/g, '').trim(); // tira o keycap do emoji (1keycap -> 1)
  if (!/^\d{1,2}$/.test(bruto)) return entrada;
  const ops = Array.isArray(dados.ultimas_opcoes) ? (dados.ultimas_opcoes as string[]) : null;
  if (!ops) return entrada;
  const idx = parseInt(bruto, 10) - 1;
  return idx >= 0 && idx < ops.length ? { ...entrada, toqueId: ops[idx] } : entrada;
}

