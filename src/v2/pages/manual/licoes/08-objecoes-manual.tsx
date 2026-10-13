/* Lição 8 — o manual de objeções (prefixo mv-ob-): as 5 famílias, as 18
   objeções com o que o cliente diz, o que pode estar por trás, a pergunta que
   descobre o motivo real, a resposta sugerida (pronta para copiar, com troca
   de tratamento: o senhor / a senhora / você) e o que NÃO dizer. Também a
   matriz-resumo em tabela. Fatos da empresa: só os do brief. Estilos em
   08-objecoes.css. */
import { useState, type ReactNode } from 'react';
import { Aviso, copiar, IcCheck, IcX, Sanfona, Tabela } from '../pecas';

/* ===================================================================== famílias */
export type FamiliaId = 'confianca' | 'dinheiro' | 'tempo' | 'expectativa' | 'pratica';
export type TomOb = 'azul' | 'verde' | 'ambar' | 'rubro' | 'neutro';
export type Familia = { id: FamiliaId; nome: string; tom: TomOb; sente: string; precisa: string };

export const FAMILIAS: Familia[] = [
  { id: 'confianca', nome: 'Confiança', tom: 'azul', sente: 'Medo de golpe, de expor dados, documentos ou senha.', precisa: 'Segurança: saber quem somos e que nada é pago antes.' },
  { id: 'dinheiro', nome: 'Dinheiro', tom: 'verde', sente: 'Medo de pagar do bolso, de perder ou de ser explorado.', precisa: 'Clareza: quanto paga, quando paga e de onde sai.' },
  { id: 'tempo', nome: 'Tempo e decisão', tom: 'ambar', sente: 'Pressa, insegurança ou vontade de decidir em família.', precisa: 'Respeito: decidir no tempo dele, com quem quiser.' },
  { id: 'expectativa', nome: 'Expectativa', tom: 'rubro', sente: 'Esperava outra coisa: o empréstimo, o “está tudo certo” do banco.', precisa: 'Honestidade: a verdade sobre o que é possível hoje.' },
  { id: 'pratica', nome: 'Praticidade', tom: 'neutro', sente: 'Não sabe mexer, não tem o documento, não tem e-mail.', precisa: 'Ajuda: “a gente resolve junto, um passo de cada vez”.' },
];
export const FAMILIA: Record<FamiliaId, Familia> = Object.fromEntries(FAMILIAS.map((f) => [f.id, f])) as Record<FamiliaId, Familia>;

/* ===================================================================== tratamento */
/** 0 = o senhor · 1 = a senhora · 2 = você */
export type Trat = 0 | 1 | 2;
const TRATAMENTOS: { rot: string }[] = [{ rot: 'O senhor' }, { rot: 'A senhora' }, { rot: 'Você' }];
/** Troca os trechos "[o senhor|a senhora|você]" pela forma escolhida. */
export function tratar(t: string, i: Trat): string {
  return t.replace(/\[([^\]|]*)\|([^\]|]*)\|([^\]|]*)\]/g, (_m, a: string, b: string, c: string) => [a, b, c][i]);
}

/* ===================================================================== as 18 objeções */
export type Objecao = {
  id: string;
  familia: FamiliaId;
  /** rótulo curto (cartões e tabela) */
  chip: string;
  /** o que o cliente diz */
  diz: string;
  /** outros jeitos de dizer a mesma coisa */
  variacoes: string[];
  porTras: string[];
  /** resumo do "por trás" para a matriz */
  curto: string;
  /** pergunta para descobrir o motivo real (aceita [senhor|senhora|você]) */
  pergunta: string;
  /** resposta sugerida, pronta para copiar (aceita [senhor|senhora|você]) */
  resposta: string;
  naoDizer: string[];
  /** fato-âncora da resposta, para a matriz */
  ancora: string;
  dica?: ReactNode;
};

const S = '[o senhor|a senhora|você]';
const SM = '[O senhor|A senhora|Você]';

export const OBJECOES: Objecao[] = [
  {
    id: 'golpe', familia: 'confianca', chip: '“É golpe?”',
    diz: 'Isso não é golpe? Vejo tanta coisa assim na televisão.',
    variacoes: ['Como eu sei que vocês existem de verdade?', 'Daqui a pouco vão pedir dinheiro, né?'],
    porTras: [
      'Medo legítimo: golpe pelo telefone e pelo WhatsApp existe, e o cliente sabe disso.',
      'Ele, ou alguém próximo, já caiu num golpe parecido.',
      'Não entende como alguém trabalha sem cobrar nada antes.',
      'A família avisou para não confiar em ninguém pelo WhatsApp.',
    ],
    curto: 'Medo real de golpe; às vezes, um caso próximo.',
    pergunta: `Posso perguntar: aconteceu alguma coisa que deixou ${S} com o pé atrás?`,
    resposta: `Entendo a sua preocupação, e é muito bom ${S} desconfiar. Hoje todo cuidado é pouco. Por isso eu explico com calma: o nosso advogado, o Dr. Rafael Menezes, entra com uma ação pedindo o ressarcimento do que foi descontado nos últimos 10 anos. ${SM} não paga nada para começar: os honorários dele são 30% do valor que ${S} receber, só no final. O resultado depende da análise. As procurações são assinadas pelo gov.br, o sistema oficial do governo. Se quiser, pode chamar alguém da família para acompanhar a nossa conversa.`,
    naoDizer: [
      '“Pode confiar, golpe nenhum!” Confiança não se pede: se mostra com fatos.',
      '“Somos a maior empresa do ramo.” Não é um fato que você possa provar.',
      '“Se não confia, paciência.” Desconfiar é normal; discutir só afasta.',
    ],
    ancora: 'Nada é pago para começar · Dr. Rafael Menezes · procurações assinadas pelo gov.br.',
    dica: 'Se o cliente pedir dados da empresa ou do advogado (como CNPJ, registro na OAB ou endereço), não invente nem chute: pergunte ao seu gestor o que pode ser enviado. Os sinais de golpe e o que fazer quando alguém usa o nome da CAF estão na lição 14.',
  },
  {
    id: 'dinheiro', familia: 'dinheiro', chip: '“Não tenho dinheiro para advogado”',
    diz: 'Não tenho dinheiro para pagar advogado.',
    variacoes: ['Advogado é caro, não dá para mim.', 'Quanto eu tenho que pagar para entrar?'],
    porTras: [
      'Acha que vai ter que pagar do próprio bolso, adiantado.',
      'Já ouviu falar de advogado que cobra antes de começar.',
      'O dinheiro do mês já está todo comprometido.',
    ],
    curto: 'Acha que vai pagar do bolso, adiantado.',
    pergunta: `${SM} imaginou que teria que pagar alguma coisa agora, antes de começar?`,
    resposta: `${SM} não precisa ter dinheiro para isso. Não tem nada para pagar para começar. O advogado só recebe no final: os honorários dele são 30% do valor que ${S} receber, tirados desse valor. Por exemplo: se receber R$ 10.000, R$ 3.000 ficam para o advogado e R$ 7.000 ficam com ${S}. Esse número é só um exemplo, porque o resultado depende da análise. O percentual é fixo, sem surpresa.`,
    naoDizer: [
      '“É tudo de graça.” Não é: existem os 30% no final, e o cliente precisa saber disso desde o começo.',
      '“Depois a gente vê o pagamento.” Deixa a dúvida no ar e parece esconder alguma coisa.',
      'Citar um valor como se fosse o que ele vai receber.',
    ],
    ancora: 'Nada é pago antes · 30% do valor que o cliente receber, no final.',
    dica: 'Os R$ 10.000 são só um exemplo para mostrar a conta. Diga sempre “por exemplo” e nunca dê a entender que é quanto ele vai receber. Para fazer a conta com outros números, use a calculadora de honorários da lição 2.',
  },
  {
    id: 'emprestimo', familia: 'expectativa', chip: '“Só quero empréstimo”',
    diz: 'Eu só quero o empréstimo. Esse negócio de processo não me interessa.',
    variacoes: ['Quanto vocês liberam para mim?', 'Não quero saber de justiça, quero o dinheiro.'],
    porTras: [
      'Precisa de dinheiro agora, para uma conta ou uma emergência.',
      'Veio pelo anúncio de empréstimo e nem sabe o que é o processo.',
      'Acha que o processo é uma “enrolação” para não dar o empréstimo.',
    ],
    curto: 'Precisa de dinheiro rápido; não conhece o processo.',
    pergunta: `${SM} está precisando desse valor para alguma coisa específica?`,
    resposta: `Entendi, e eu vou olhar isso com toda a atenção. Conferi os seus extratos: hoje a sua margem está comprometida com os empréstimos que ${S} já tem, por isso um empréstimo novo não sai agora. Mas existem caminhos: posso ver a possibilidade de aumento de margem, ou de portabilidade dos seus consignados para outro banco, que pode liberar um valor acima de R$ 1.500. E tem mais uma coisa: o nosso advogado pode entrar com uma ação pedindo o ressarcimento do que foi descontado nos últimos 10 anos, sem ${S} pagar nada para começar. O resultado depende da análise. Posso explicar como funciona?`,
    naoDizer: [
      '“O empréstimo vai sair, é só mandar os documentos.” Promessa falsa: quando ele descobrir, você perdeu o cliente.',
      'Ignorar o pedido dele e falar só do processo. Ele precisa sentir que você ouviu.',
      'Inventar um valor de portabilidade ou de margem.',
    ],
    ancora: 'Sem margem hoje · possibilidade de aumento de margem e de portabilidade · ação dos últimos 10 anos.',
    dica: 'Só diga que não há margem depois de conferir os extratos: é um fato do caso dele, não uma frase de efeito. Se a conferência mostrar outra situação, pergunte ao seu gestor como seguir. O roteiro completo do “sem margem” está na lição 7; o que é margem e portabilidade, na lição 3.',
  },
  {
    id: 'demora', familia: 'tempo', chip: '“Demora muito”',
    diz: 'Demora muito. Até lá eu nem sei onde vou estar.',
    variacoes: ['Um ano? Não tenho essa paciência.', 'Eu precisava disso para agora.'],
    porTras: [
      'Precisa de dinheiro rápido (comum em quem veio pelo anúncio de empréstimo).',
      'Comparou com o empréstimo, que cai na conta em poucos dias.',
      'Tem receio de esperar tanto tempo por algo que não conhece.',
    ],
    curto: 'Pressa: precisa de dinheiro agora.',
    pergunta: `O que pesa mais para ${S}: o tempo de espera, ou precisar de um dinheiro agora?`,
    resposta: `Entendo. O processo costuma levar de 6 a 12 meses, e eu prefiro falar a verdade sobre isso. Enquanto ele anda, ${S} não paga nada. E quanto antes a gente começar, antes ele anda. Se ${S} também precisa de um valor mais rápido, eu posso ver a possibilidade de portabilidade ou de aumento de margem.`,
    naoDizer: [
      '“Que nada, em dois meses sai.” Prazo inventado: o cliente vai cobrar.',
      '“Tem gente que recebeu em um mês.” A exceção vira promessa.',
      '“É rapidinho.” De 6 a 12 meses não é rapidinho, e ele sabe disso.',
    ],
    ancora: 'Costuma levar de 6 a 12 meses · nada é pago enquanto isso.',
  },
  {
    id: 'meuinss', familia: 'pratica', chip: '“Não sei mexer no Meu INSS”',
    diz: 'Não sei mexer nesse Meu INSS. Não entendo nada de celular.',
    variacoes: ['Nem sei a minha senha do gov.br.', 'Eu não tenho esse aplicativo.'],
    porTras: [
      'Vergonha de não saber usar o celular.',
      'Medo de apertar alguma coisa errada e “estragar” o benefício.',
      'Não enxerga bem a tela, ou não tem o aplicativo instalado.',
      'Não lembra a senha do gov.br.',
    ],
    curto: 'Vergonha ou medo de errar no celular.',
    pergunta: `${SM} tem o aplicativo Meu INSS no celular, ou costuma entrar com a ajuda de alguém?`,
    resposta: `Não tem problema nenhum, muita gente não sabe, e eu estou aqui justamente para ajudar. A gente faz junto, um passo de cada vez: eu vou dizendo onde tocar e, se ficar em dúvida, ${S} me manda um print da tela. Se tiver alguém da família por perto, também pode ajudar. Vamos tentar agora?`,
    naoDizer: [
      '“É fácil, qualquer um faz.” Quem não sabe se sente diminuído.',
      '“Me passa a senha que eu resolvo”, como primeira opção. A senha é uma escolha do cliente, nunca o seu ponto de partida.',
      'Mandar um textão com todos os passos de uma vez.',
    ],
    ancora: 'A gente ajuda passo a passo · senha só se o cliente preferir, com troca depois.',
    dica: (
      <>
        <p>Guie um passo por mensagem, no tempo do cliente, e peça um print quando ele travar. O caminho no aplicativo, tela por tela, está na lição 10.</p>
        <p>Se o cliente não lembra a senha ou prefere passar a senha para você, siga a lição 10: lá está como a gente entra com total segurança, só para pegar os documentos, e como ajuda o cliente a trocar a senha depois.</p>
      </>
    ),
  },
  {
    id: 'senha', familia: 'confianca', chip: '“Não vou passar minha senha”',
    diz: 'Senha eu não passo para ninguém.',
    variacoes: ['Meu neto disse para eu nunca passar a senha.', 'Para que vocês querem a minha senha?'],
    porTras: [
      'Ouviu, com razão, que não se deve passar senha para ninguém.',
      'Já ouviu falar de golpe com a senha do gov.br.',
      'Acha que, com a senha, alguém pode mexer no benefício dele.',
    ],
    curto: 'Cuidado legítimo com a senha.',
    pergunta: `Prefere baixar os documentos no seu celular, com a minha ajuda, passo a passo?`,
    resposta: `${SM} faz muito bem em cuidar da sua senha. E não precisa passar. Eu explico passo a passo e ${S} baixa os documentos no seu próprio celular, no seu tempo. Depois é só me mandar os arquivos aqui pelo WhatsApp. Se tiver um filho ou neto por perto, ele também pode ajudar. Podemos começar?`,
    naoDizer: [
      '“Sem a senha não dá.” Não é verdade: o cliente pode baixar os documentos com a sua orientação.',
      'Insistir, ou pedir a senha de novo depois de um não.',
      '“Fica tranquilo, a gente nunca faz nada errado.” Frase vazia. O que tranquiliza é ele não precisar passar a senha.',
    ],
    ancora: 'Senha não é condição: o cliente baixa com a sua ajuda.',
    dica: (
      <>
        No canal de juros, quando pede o CPF, o robô avisa o cliente: “🔒 Seus dados são usados somente para a consulta.
        *Nunca pedimos senhas, códigos ou qualquer pagamento.*” Por isso nunca cobre a senha como condição. Se o próprio
        cliente preferir passar, aí sim: a gente entra com total segurança e depois ajuda a trocar a senha (o passo a
        passo está na lição 10; os cuidados de segurança, na lição 14).
      </>
    ),
  },
  {
    id: 'filho', familia: 'tempo', chip: '“Vou falar com meu filho”',
    diz: 'Vou falar com meu filho e depois te falo.',
    variacoes: ['Minha filha é que cuida dessas coisas.', 'Preciso ver com a minha esposa.'],
    porTras: [
      'Em muitas famílias, decisão sobre dinheiro é tomada junto.',
      'Sente insegurança e quer alguém de confiança do lado.',
      'Não entendeu tudo e tem vergonha de perguntar de novo.',
      'É um jeito educado de dizer não.',
    ],
    curto: 'Decide em família ou quer alguém de confiança do lado.',
    pergunta: 'Claro! Ficou alguma dúvida que eu possa já deixar explicada para ele?',
    resposta: `Ótima ideia, decisão assim é bom tomar em família. Para facilitar, eu posso mandar aqui um resumo por escrito, para ${S} mostrar a ele. E, se ele quiser, pode falar comigo direto, por aqui mesmo. Posso chamar de novo amanhã, no fim da tarde, para saber o que vocês decidiram?`,
    naoDizer: [
      '“Não precisa falar com ninguém, a decisão é sua.” Desrespeita a família e aumenta a desconfiança.',
      '“A análise só vale hoje.” Urgência falsa.',
      '“Tá bom”, e mais nada. A conversa morre sem próximo passo.',
    ],
    ancora: 'Resumo por escrito · convite para o filho · retorno combinado.',
    dica: 'O modelo de resumo para a família e o jeito de retomar a conversa no dia combinado estão na lição 9.',
  },
  {
    id: 'pensar', familia: 'tempo', chip: '“Vou pensar”',
    diz: 'Vou pensar e depois te respondo.',
    variacoes: ['Deixa eu ver isso com calma.', 'Agora não, outro dia a gente conversa.'],
    porTras: [
      'Ficou uma dúvida que ele não disse.',
      'Medo de golpe.',
      'Quer decidir com a família.',
      'Não tem interesse e prefere não dizer “não”.',
    ],
    curto: 'Dúvida não dita, medo, família ou um “não” educado.',
    pergunta: 'Claro, é bom pensar mesmo. Só para eu ajudar: ficou alguma parte que eu não expliquei bem?',
    resposta: `Claro, fique à vontade, é uma decisão importante. Só para eu ajudar no que ${S} for pensar: ficou alguma dúvida? Sobre como funciona, sobre os 30% ou sobre a segurança? Se quiser, mando aqui um resumo curtinho para ler com calma. Posso chamar de novo amanhã, para a gente conversar?`,
    naoDizer: [
      '“Mas pensar o quê? É só vantagem.” Desrespeita e soa como pressão.',
      '“As vagas acabam hoje.” Urgência falsa, proibida.',
      'Sumir sem combinar quando vocês voltam a falar.',
    ],
    ancora: 'Pergunte a dúvida · resumo por escrito · retorno combinado.',
  },
  {
    id: 'outra', familia: 'confianca', chip: '“Já fiz com outra empresa”',
    diz: 'Já fiz isso com outra empresa.',
    variacoes: ['Já me ligaram oferecendo isso.', 'Já tenho advogado cuidando disso.'],
    porTras: [
      'Teve uma experiência ruim: cobrança, sumiço ou golpe.',
      'Já existe um processo andando sobre o mesmo empréstimo.',
      'Quer comparar, ou está testando se você é sério.',
    ],
    curto: 'Experiência ruim, ou já existe um processo.',
    pergunta: 'Me conta como foi: era sobre o mesmo empréstimo? O processo ainda está andando?',
    resposta: `Que bom que ${S} me contou, isso é importante para eu entender o seu caso. Me conta como foi: era sobre o mesmo empréstimo? O processo ainda está andando, ou já terminou? Com essas informações eu verifico com a nossa equipe se dá para seguir no seu caso, e dou uma resposta honesta.`,
    naoDizer: [
      'Falar mal da outra empresa. Você não conhece o caso e passa insegurança.',
      '“Com a gente é diferente, vai dar certo.” Promessa.',
      'Seguir como se nada fosse, sem entender se já existe um processo.',
    ],
    ancora: 'Entender o que houve · se já existe processo, levar ao gestor.',
    dica: 'Se já existe um processo sobre o mesmo contrato, não decida sozinho: anote os detalhes e leve ao seu gestor antes de seguir.',
  },
  {
    id: 'banco', familia: 'expectativa', chip: '“O banco disse que está tudo certo”',
    diz: 'Eu fui no banco e o gerente disse que está tudo certo com o meu empréstimo.',
    variacoes: ['Meu contrato é normal, eu assinei.', 'Não quero confusão com o banco.'],
    porTras: [
      'Confia no gerente que conhece há anos.',
      'Tem medo de “brigar” com o banco.',
      'Não sabe que dá para conferir os descontos com calma.',
    ],
    curto: 'Confia no banco; medo de “brigar” com ele.',
    pergunta: 'O banco chegou a mostrar os contratos e os descontos, ou só falou que estava tudo certo?',
    resposta: `Que bom que ${S} já procurou o banco. A nossa análise é gratuita e serve justamente para conferir isso com calma: ela olha os empréstimos e os descontos que aparecem nos seus extratos do INSS, para descobrir se ${S} paga juros abusivos. Se estiver tudo certo, ${S} fica com a tranquilidade de ter conferido. Se não estiver, o nosso advogado pode entrar com uma ação pedindo o ressarcimento do que foi descontado nos últimos 10 anos. O resultado depende da análise.`,
    naoDizer: [
      '“O banco está mentindo.” Acusação que você não pode provar.',
      '“Todo banco rouba aposentado.” Generalização que só assusta.',
      '“Tenho certeza de que tem juros abusivos no seu contrato.” Só a análise pode dizer.',
    ],
    ancora: 'A análise gratuita confere, nos extratos do INSS, se o cliente paga juros abusivos.',
  },
  {
    id: 'perder', familia: 'dinheiro', chip: '“E se eu perder?”',
    diz: 'E se eu perder esse processo?',
    variacoes: ['E se não der em nada?', 'Vou ter que pagar alguma coisa se não der certo?'],
    porTras: [
      'Medo de ter que pagar alguma coisa no fim.',
      'Já ouviu histórias de processo que não deu em nada.',
      'Quer saber se vale o esforço de juntar os documentos.',
    ],
    curto: 'Medo de custo, ou de esforço à toa.',
    pergunta: `O que mais preocupa ${S}: ter algum custo, ou o trabalho de juntar os documentos?`,
    resposta: `É uma pergunta muito justa. Ninguém pode garantir o resultado de um processo, e eu não vou prometer o que não depende de mim. O que eu posso explicar é como funciona o pagamento: ${S} não paga nada para começar, e os honorários do advogado são 30% do valor que ${S} receber, tirados desse valor, no final. Se quiser mais detalhes sobre essa parte, eu confirmo com a nossa equipe e respondo por escrito.`,
    naoDizer: [
      '“Não tem como perder.” Ninguém pode garantir resultado.',
      '“Se perder, não paga nada, é garantido.” Não apresente isso como garantia. O que você pode dizer é que os 30% saem do valor que o cliente receber.',
      '“É causa ganha.” Promessa proibida.',
    ],
    ancora: 'Sem garantia de resultado · os 30% saem do valor que o cliente receber.',
  },
  {
    id: 'trinta', familia: 'dinheiro', chip: '“30% é muito”',
    diz: '30% é muito. O advogado vai ficar com quase tudo.',
    variacoes: ['Por que tanto?', 'Não dá para fazer por menos?'],
    porTras: [
      'Está olhando para o valor total, não para o que fica com ele.',
      'Acha que vai ter que tirar os 30% do próprio bolso.',
      'Está comparando com algo que ouviu falar.',
    ],
    curto: 'Olha o total, não o que fica com ele.',
    pergunta: `${SM} imaginou que os 30% saem do seu bolso, ou do valor que receber?`,
    resposta: `Entendo, é natural pensar assim. Deixa eu mostrar como fica na prática: ${S} não paga nada antes, e o advogado conduz o processo inteiro sem cobrar nada. Só no final, do valor que ${S} receber, 30% ficam para ele. Por exemplo: se receber R$ 10.000, R$ 7.000 ficam com ${S}. O número é só um exemplo, porque o resultado depende da análise. O percentual é fixo, sem surpresa.`,
    naoDizer: [
      '“Os outros cobram mais.” Comparação que você não pode provar.',
      '“Dá para baixar um pouquinho.” O custo é fixo: prometer desconto cria um problema.',
      '“Isso é pouco.” Para quem tem pouco, não é pouco. Respeite a percepção dele.',
    ],
    ancora: 'Percentual fixo · nada antes · 70% do valor recebido fica com o cliente.',
  },
  {
    id: 'documentos', familia: 'confianca', chip: '“Tanto documento? E a foto do rosto?”',
    diz: 'Por que precisa de tanto documento? E para que a foto do meu rosto?',
    variacoes: ['Isso é muita coisa.', 'Não gosto de mandar foto minha.'],
    porTras: [
      'Medo de que os documentos sejam usados num golpe.',
      'Cansaço: parece muita coisa para juntar.',
      'Não entende para que serve cada um.',
    ],
    curto: 'Medo de uso indevido; parece muita coisa.',
    pergunta: 'Ficou com receio de algum documento em especial?',
    resposta: `Entendo, parece bastante coisa mesmo. Mas é a documentação básica desse procedimento, nada fora do normal. Os documentos do INSS mostram os empréstimos e os descontos dos últimos anos, que é o que o advogado precisa para pedir o ressarcimento. E a foto do rosto serve para confirmar que é a própria pessoa fazendo, e não outra pessoa usando o seu nome. Eu ajudo a juntar tudo, um de cada vez.`,
    naoDizer: [
      '“É assim e pronto.” O cliente tem o direito de entender.',
      'Inventar para que serve um documento. Se não souber, pergunte ao gestor.',
      'Pedir tudo de uma vez, numa mensagem enorme.',
    ],
    ancora: 'Documentação básica do procedimento · foto do rosto confirma que é a própria pessoa.',
    dica: 'Para que serve cada documento e como pedir cada um: lição 10 (Meu INSS), lição 11 (gov.br e imposto de renda) e lição 12 (documentos pessoais).',
  },
  {
    id: 'comprovante', familia: 'pratica', chip: '“Comprovante não está no meu nome”',
    diz: 'Não tenho comprovante de residência no meu nome.',
    variacoes: ['A conta de luz é da minha filha.', 'Moro de aluguel, nada está no meu nome.'],
    porTras: [
      'Mora com filho ou outro parente, e as contas estão no nome dele.',
      'Acha que, sem comprovante no nome, não pode fazer o processo.',
      'Só tem contas antigas guardadas.',
    ],
    curto: 'As contas da casa estão no nome de um parente.',
    pergunta: 'Em nome de quem estão as contas da casa? Pode ser água, luz, internet, telefone ou TV.',
    resposta: `Sem problema, isso é bem comum. Pode ser uma conta no nome de outra pessoa da família, como pai, mãe ou filho. Nesse caso eu preciso também de um documento com foto dessa pessoa, para a gente fazer uma declaração de residência. Só um cuidado: a conta precisa ser do mês atual ou do mês passado.`,
    naoDizer: [
      '“Então não dá para seguir.” Existe o caminho da declaração.',
      '“Manda qualquer conta.” Precisa ser do mês atual ou do mês passado, com o documento da pessoa.',
      'Aceitar sem pedir o documento com foto do dono da conta.',
    ],
    ancora: 'Conta de outra pessoa + documento com foto dela + declaração de residência.',
    dica: 'Se a conta estiver no nome de alguém de fora da família (o dono do imóvel alugado, por exemplo), não decida sozinho: pergunte ao seu gestor. O passo a passo do comprovante e da declaração de residência está na lição 12.',
  },
  {
    id: 'email', familia: 'pratica', chip: '“Não tenho e-mail”',
    diz: 'Não tenho e-mail.',
    variacoes: ['Eu tinha, mas não lembro qual era.', 'Nunca usei essas coisas.'],
    porTras: [
      'Nunca precisou de e-mail.',
      'Tem, mas não lembra qual é nem a senha.',
      'Acha que vai ter que aprender a usar.',
    ],
    curto: 'Nunca precisou de e-mail.',
    pergunta: `${SM} lembra se alguém da família já criou um e-mail no seu nome?`,
    resposta: `Sem problema nenhum, a gente cria um e-mail [para o senhor|para a senhora|para você]. Eu cuido disso aqui e depois explico tudo direitinho.`,
    naoDizer: [
      '“Sem e-mail não dá.” Dá: a gente cria um.',
      'Pular o e-mail. Ele é um dado muito importante do cadastro.',
      'Criar o e-mail sem avisar o cliente.',
    ],
    ancora: 'Sem e-mail? A gente cria um.',
    dica: 'O e-mail é um dado muito importante. Combine com o seu gestor como fica o acesso ao e-mail criado. Mais detalhes na lição 12.',
  },
  {
    id: 'preaprovada', familia: 'expectativa', chip: '“Pré-aprovada, e o empréstimo?”',
    diz: 'O robô disse que estava pré-aprovada. Cadê o meu empréstimo?',
    variacoes: ['Vocês me enganaram.', 'Então para que mandaram “pré-aprovada”?'],
    porTras: [
      'Entendeu “pré-aprovada” como dinheiro garantido.',
      'Se sente enganado: a confiança está em risco.',
      'Precisa do dinheiro e já contava com ele.',
    ],
    curto: 'Entendeu “pré-aprovada” como dinheiro liberado.',
    pergunta: 'Posso mostrar o que eu encontrei nos seus extratos?',
    resposta: `Entendo, e peço desculpa pela confusão. “Pré-aprovada” quer dizer que a sua análise inicial passou nas primeiras perguntas, e por isso pôde seguir. Não quer dizer que já existe um valor liberado. Eu conferi os seus extratos: hoje a sua margem está comprometida, por isso um empréstimo novo não sai agora. Mas existem caminhos, e eu vou explicar cada um com sinceridade: a possibilidade de aumento de margem, a de portabilidade, que pode liberar um valor acima de R$ 1.500, e uma ação com o nosso advogado pedindo o ressarcimento do que foi descontado nos últimos 10 anos. O resultado depende da análise.`,
    naoDizer: [
      '“Foi erro do robô.” Joga a empresa contra ela mesma e não resolve.',
      '“Vai sair sim, só falta documento.” Promessa falsa.',
      'Fingir que não viu a reclamação e mudar de assunto.',
    ],
    ancora: '“Pré-aprovada” = a análise inicial passou nas perguntas; não é valor liberado.',
    dica: (
      <>
        A mensagem que o cliente recebeu da IA, no canal de empréstimo, é exatamente esta: “Boa notícia, {'{nome}'}! Sua
        análise foi *pré-aprovada*.” Ela vem depois das perguntas de elegibilidade. A explicação completa da
        “pré-aprovada” e do primeiro passo nesse canal está na lição 5.
      </>
    ),
  },
  {
    id: 'quanto', familia: 'dinheiro', chip: '“Quanto vou receber?”',
    diz: 'Quanto eu vou receber?',
    variacoes: ['Dá uns 10 mil?', 'Minha vizinha recebeu um dinheirão. Eu também vou?'],
    porTras: [
      'Quer saber se vale a pena.',
      'Precisa planejar uma dívida ou uma compra.',
      'Ouviu de alguém um valor alto.',
    ],
    curto: 'Quer saber se vale a pena.',
    pergunta: `${SM} ouviu falar de algum valor?`,
    resposta: `Essa é a pergunta que todo mundo faz, e a resposta honesta é: o resultado depende da análise. Depende dos contratos e dos descontos de cada pessoa. O que eu posso dizer é que o advogado entra com uma ação pedindo o ressarcimento do que foi descontado nos últimos 10 anos, e que os 30% dele saem do valor que ${S} receber. Para saber do seu caso, o primeiro passo são os extratos do Meu INSS.`,
    naoDizer: [
      'Qualquer número: “uns 10 mil”, “mais ou menos 5 mil”.',
      '“Muita gente recebe bastante.” Vira promessa.',
      '“Vai valer muito a pena, garanto.”',
    ],
    ancora: 'O resultado depende da análise · últimos 10 anos · 30% do valor recebido.',
    dica: 'Não prometer valor é regra da casa, explicada na lição 2.',
  },
  {
    id: 'qualbanco', familia: 'pratica', chip: '“Não sei qual é o banco”',
    diz: 'Não sei em qual banco é o meu empréstimo.',
    variacoes: ['Foi um rapaz que fez para mim, não lembro o banco.', 'Tenho vários, não sei quais.'],
    porTras: [
      'O empréstimo foi feito há muito tempo, e ele não guardou o nome do banco.',
      'Tem vários empréstimos e confunde.',
      'Tem vergonha de não saber.',
    ],
    curto: 'Não guardou o nome do banco.',
    pergunta: 'Aparece algum desconto de Agibank, BMG, Facta, Mercantil ou Crefisa no seu benefício?',
    resposta: `Sem problema, é muito comum não lembrar. Me ajuda só com uma coisa: aparece algum desconto de Agibank, BMG, Facta, Mercantil ou Crefisa no seu benefício? Se ${S} não souber, tudo bem: o Extrato de Empréstimo Consignado, do Meu INSS, mostra isso, e a gente confere lá.`,
    naoDizer: [
      'Encerrar porque ele não sabe. A regra é perguntar de novo uma vez e, se seguir sem saber, seguir em frente.',
      'Perguntar a mesma coisa várias vezes.',
      'Chutar o banco por ele.',
    ],
    ancora: 'Pergunte uma vez pelas 5 financeiras · se não souber, siga.',
    dica: 'Se ele souber, e o empréstimo for só em bancos fora das 5 financeiras, ele não é elegível: agradeça com carinho e encerre sem insistir. A CAF só trabalha com Agibank, BMG, Facta, Mercantil e Crefisa. As 3 portas da elegibilidade estão na lição 4.',
  },
];

/* ===================================================================== ficha de uma objeção */
const IcCopiar = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden><rect x="8.5" y="8.5" width="11.5" height="11.5" rx="2.2" /><path d="M15.5 8.5V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7.5a2 2 0 002 2h2.5" /></svg>
);

export function BotaoCopiar({ texto, rotulo = 'Copiar resposta' }: { texto: string; rotulo?: string }) {
  const [ok, setOk] = useState(false);
  async function aoCopiar() {
    if (await copiar(texto)) { setOk(true); window.setTimeout(() => setOk(false), 1600); }
  }
  return (
    <button type="button" className="mv-ob-copiar" onClick={aoCopiar} aria-label={rotulo}>
      {ok ? <><IcCheck />Copiado</> : <><IcCopiar />{rotulo}</>}
    </button>
  );
}

function Ficha({ o, trat }: { o: Objecao; trat: Trat }) {
  const fam = FAMILIA[o.familia];
  const resposta = tratar(o.resposta, trat);
  return (
    <div className="mv-ob-ficha">
      <span className="mv-ob-fam-tag" data-obtom={fam.tom}>{fam.nome}</span>
      <div className="mv-ob-ficha-grade">
        <section className="mv-ob-ficha-bl">
          <h4>O que o cliente diz</h4>
          <p className="mv-ob-ficha-diz">“{o.diz}”</p>
          <ul className="mv-ob-ficha-var" aria-label="Outros jeitos de dizer">
            {o.variacoes.map((v) => <li key={v}>“{v}”</li>)}
          </ul>
        </section>
        <section className="mv-ob-ficha-bl">
          <h4>O que pode estar por trás</h4>
          <ul className="mv-ob-ficha-tras">
            {o.porTras.map((t) => <li key={t}>{t}</li>)}
          </ul>
        </section>
      </div>
      <section className="mv-ob-ficha-bl" data-bl="pergunta">
        <h4>Pergunta para descobrir o motivo real</h4>
        <p className="mv-ob-ficha-perg">{tratar(o.pergunta, trat)}</p>
      </section>
      <section className="mv-ob-ficha-bl" data-bl="resposta">
        <div className="mv-ob-ficha-cab">
          <h4>Resposta sugerida</h4>
          <small>Sugestão de roteiro: adapte ao cliente</small>
        </div>
        <p className="mv-ob-ficha-resp">{resposta}</p>
        <BotaoCopiar texto={resposta} />
      </section>
      <section className="mv-ob-ficha-bl" data-bl="nao">
        <h4>O que NÃO dizer</h4>
        <ul className="mv-ob-ficha-nao">
          {o.naoDizer.map((n) => <li key={n}><span aria-hidden><IcX /></span><span>{n}</span></li>)}
        </ul>
      </section>
      {o.dica && <Aviso tom="azul" titulo="Bom saber">{o.dica}</Aviso>}
    </div>
  );
}

/* ===================================================================== o manual (filtro + tratamento + sanfona) */
export function ManualObjecoes() {
  const [fam, setFam] = useState<FamiliaId | 'todas'>('todas');
  const [trat, setTrat] = useState<Trat>(0);
  const lista = OBJECOES.map((o, i) => ({ o, n: i + 1 })).filter(({ o }) => fam === 'todas' || o.familia === fam);
  return (
    <div className="mv-ob-man">
      <div className="vidro mv-ob-man-cfg">
        <div className="mv-ob-man-grupo">
          <span className="mv-ob-man-rot">Família</span>
          <div className="mv-ob-seg" role="group" aria-label="Filtrar objeções por família">
            <button type="button" aria-pressed={fam === 'todas'} onClick={() => setFam('todas')}>
              Todas <small className="num">{OBJECOES.length}</small>
            </button>
            {FAMILIAS.map((f) => (
              <button key={f.id} type="button" aria-pressed={fam === f.id} data-obtom={f.tom} onClick={() => setFam(f.id)}>
                <i aria-hidden />{f.nome} <small className="num">{OBJECOES.filter((o) => o.familia === f.id).length}</small>
              </button>
            ))}
          </div>
        </div>
        <div className="mv-ob-man-grupo">
          <span className="mv-ob-man-rot">Tratamento nas respostas</span>
          <div className="mv-ob-seg" role="group" aria-label="Tratamento usado nas respostas">
            {TRATAMENTOS.map((t, i) => (
              <button key={t.rot} type="button" aria-pressed={trat === i} onClick={() => setTrat(i as Trat)}>{t.rot}</button>
            ))}
          </div>
        </div>
      </div>
      <Sanfona key={fam} itens={lista.map(({ o, n }) => ({
        titulo: `${String(n).padStart(2, '0')} · ${o.chip}`,
        corpo: <Ficha o={o} trat={trat} />,
      }))} />
    </div>
  );
}

/* ===================================================================== matriz-resumo */
/** Na coluna estreita da tabela, "e-mail" não deve quebrar no hífen. */
function semQuebra(t: string): ReactNode {
  return t.split(/(e-mail)/).map((p, i) => (p === 'e-mail' ? <span key={i} className="mv-ob-nq">{p}</span> : p));
}

export function MatrizObjecoes() {
  return (
    <Tabela
      colunas={['Objeção', 'Família', 'O que pode estar por trás', 'Fato que ajuda a responder']}
      destaque={0}
      linhas={OBJECOES.map((o, i) => {
        const f = FAMILIA[o.familia];
        return [
          <span key="o" className="mv-ob-mz-obj"><small className="num">{String(i + 1).padStart(2, '0')}</small><span>{semQuebra(o.chip)}</span></span>,
          <span key="f" className="mv-ob-fam-tag" data-obtom={f.tom}>{f.nome}</span>,
          o.curto,
          o.ancora,
        ];
      })}
    />
  );
}
