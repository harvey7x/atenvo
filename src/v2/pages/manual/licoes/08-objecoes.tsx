/* Lição 8 — Objeções e como responder. O que é uma objeção (e por que não é
   um "não"), o método de 6 passos (ouvir → acolher → entender o motivo real →
   responder com fato → confirmar → próximo passo), as cinco famílias, os fatos
   que respondem quase tudo, o manual das 20 objeções (sanfona com filtro e
   troca de tratamento), conversas encenadas por família, o "mas o meu é
   consignado", a árvore "até onde ir", a matriz-resumo e um treino.
   Correção do dono (13/10): o processo revisa os juros do EMPRÉSTIMO PESSOAL
   (cobrado pela financeira, fora do INSS), não do consignado. Margem e
   portabilidade dos consignados são só gancho do canal de empréstimo.
   Fatos da empresa: só os do brief (áudio do dono de 13/10 + processo oficial
   do robô). Mensagens do robô/IA: copiadas literalmente. Falas do atendente:
   sugestões de roteiro. Ilustrações em 08-objecoes-figuras.tsx; manual e
   matriz em 08-objecoes-manual.tsx; estilos em 08-objecoes.css.
   Assuntos de outras lições (30% e calculadora: L02; pré-aprovada: L05;
   roteiro do "sem margem": L07; resumo para a família: L09; senha: L10/L14;
   documentos: L10–L12) aparecem aqui só como objeção, com "veja a lição N". */
import type { Licao } from '../tipos';
import { Aviso, BomRuim, Fatos, Frase, Lista, Secao, TesteRapido } from '../pecas';
import {
  AnatomiaResposta, ArvoreConsignado, ArvoreInsistir, CaixaFatos, CaminhoParcela, CenaConsignado, CenaFilho, CenaGolpe,
  CenaPreAprovada, CenaSenha, FamiliasObjecao, FraseMotivos, LinhaDinheiro, MetodoResposta, SinaisSeguranca, TreinoRespostas,
} from './08-objecoes-figuras';
import { ManualObjecoes, MatrizObjecoes, OBJECOES, tratar } from './08-objecoes-manual';
import './08-objecoes.css';

const corpo = (
  <div className="mv-ob">
    <p className="mv-lead">
      <b>Objeção</b> é qualquer coisa que o cliente coloca entre ele e o “vamos fazer”: uma dúvida (“e se eu perder?”), um medo
      (“isso não é golpe?”), um obstáculo prático (“não tenho e-mail”) ou uma expectativa diferente (“só quero o
      empréstimo”). Ela vai aparecer em quase toda conversa, e isso não é mau sinal: quem não tem interesse nenhum
      costuma simplesmente parar de responder. Quem pergunta está pensando no assunto. Nesta lição você vai aprender um
      método de seis passos que serve para <b>qualquer</b> objeção, vai conhecer as {OBJECOES.length} que mais aparecem (cada uma com o
      que pode estar por trás, uma resposta pronta e o que nunca dizer), vai ver conversas encenadas do começo ao fim e
      vai treinar.
    </p>

    <Fatos itens={[
      { grande: '6 passos', texto: 'Ouvir, acolher, entender o motivo real, responder com fato, confirmar e combinar o próximo passo.' },
      { grande: `${OBJECOES.length} objeções`, texto: 'As mais comuns, com resposta pronta para copiar e o que não dizer.' },
      { grande: '1 pergunta', texto: 'Antes de responder, descubra o motivo real com uma pergunta simples.' },
      { grande: '0 promessas', texto: 'Responda com fatos. Nunca garanta valor, prazo ou resultado.' },
    ]} />

    <Secao titulo="Objeção não é um “não”">
      <p>
        Pense em quem é o nosso cliente: na maioria das vezes, uma pessoa mais velha, que recebe um benefício do INSS,
        que muitas vezes já recebeu muita oferta de empréstimo e já ouviu falar de golpe pelo WhatsApp. Agora ela está
        conversando com um desconhecido, pelo celular, sobre dinheiro. É natural que pergunte, desconfie e queira pensar.
        A objeção é o jeito que ela tem de <b>se proteger</b>.
      </p>
      <p>
        Por isso, o seu trabalho não é “vencer” a objeção, como numa discussão. É ajudar o cliente a enxergar com clareza
        para que ele decida com segurança. Às vezes a decisão vai ser “sim”. Às vezes vai ser “não”, e tudo bem: quando o
        cliente diz não, ou não é elegível, a regra da casa é <b>agradecer com carinho e não insistir</b>.
      </p>
      <Frase>Objeção é pedido de clareza. Responda com respeito e com fatos, nunca com pressão.</Frase>
      <p>
        Um detalhe muda tudo: <b>a frase que o cliente diz nem sempre é o motivo real.</b> “Vou pensar” pode querer dizer
        “não entendi os 30%”, “tenho medo de golpe” ou “quero falar com a minha filha”. Se você responder ao motivo
        errado, a resposta não serve para nada, por melhor que seja. Veja:
      </p>
      <FraseMotivos />
      <p>
        É por isso que o método a seguir tem um passo inteiro só para descobrir o motivo real <b>antes</b> de responder.
      </p>
    </Secao>

    <Secao titulo="O método: seis passos para qualquer objeção">
      <p>
        Você não precisa decorar {OBJECOES.length} respostas. Precisa de um caminho que funcione para qualquer objeção, inclusive para
        as que não estão neste manual. O caminho tem seis passos, sempre na mesma ordem. Toque em cada passo para ver o
        que fazer, por que funciona, uma frase de exemplo e o erro mais comum.
      </p>
      <MetodoResposta />
      <p>Repare em três detalhes do diagrama:</p>
      <Lista itens={[
        <><b>Os dois primeiros passos não respondem nada.</b> Eles criam conexão. Sem eles, até a melhor resposta soa como discussão.</>,
        <><b>O passo 3 é o que mais se pula, e o que mais faz diferença.</b> Uma pergunta de diagnóstico, simples (“o que deixou o senhor com essa dúvida?”), mostra qual resposta usar.</>,
        <><b>O passo 5 pode mandar você de volta ao 3.</b> Se o cliente não ficou convencido, provavelmente existe outro motivo por trás. Pergunte de novo, com calma.</>,
      ]} />
      <Aviso tom="ambar" titulo="Método não é pressão">
        Os seis passos servem para tirar dúvidas, não para encurralar o cliente. Se, depois de tudo, ele disser que não
        quer, agradeça com carinho e encerre sem insistir. Cliente bem tratado guarda uma boa lembrança da CAF.
      </Aviso>
      <TesteRapido
        pergunta="O cliente escreve: “vou pensar”. Qual deve ser o seu próximo movimento?"
        opcoes={[
          'Mandar na hora a resposta pronta de “vou pensar”.',
          'Acolher e perguntar, com calma, o que ficou de dúvida.',
          'Respeitar e combinar de chamar de novo no dia seguinte.',
        ]}
        certa={1}
        explica="Primeiro acolha (passo 2) e descubra o motivo real (passo 3). “Vou pensar” pode esconder uma dúvida, um medo ou a vontade de falar com a família. Combinar o retorno é bom, mas vem depois de entender o motivo."
      />
    </Secao>

    <Secao titulo="Anatomia de uma boa resposta">
      <p>
        Agora veja o método funcionando numa conversa. A cliente diz “vou pensar”. Em vez de mandar uma resposta pronta,
        a atendente acolhe e pergunta, e descobre que a dúvida verdadeira era sobre os 30%. Toque nos passos para
        destacar cada parte.
      </p>
      <AnatomiaResposta />
      <p>
        Percebeu? A explicação sobre os 30% só funcionou porque veio <b>depois</b> da pergunta. Se a atendente tivesse
        respondido “não é golpe, pode confiar”, teria falado do assunto errado, e a cliente continuaria com a mesma dúvida,
        agora achando que não foi ouvida.
      </p>
    </Secao>

    <Secao titulo="As cinco famílias de objeção">
      <p>
        As objeções parecem muitas, mas quase todas cabem em cinco famílias. Cada família nasce de um sentimento
        diferente e pede um remédio diferente. Quando aparecer uma objeção que não está no manual, pergunte a si mesmo:
        de que família ela é? Isso já mostra o caminho.
      </p>
      <FamiliasObjecao />
      <p>
        Repare na última linha de cada cartão: é o que o cliente <b>precisa sentir</b> para seguir. Objeção de confiança
        não se resolve falando de prazo; objeção de praticidade não se resolve com discurso sobre segurança. Para cada
        família, um remédio.
      </p>
    </Secao>

    <Secao titulo="Os fatos que respondem quase tudo">
      <p>
        No passo 4 você responde com fato. Mas quais fatos? Estes são os <b>fatos-âncora</b> do nosso processo: você pode
        usá-los com tranquilidade, porque são verdadeiros e confirmados pela empresa, e eles “seguram” a resposta no lugar
        certo. Embaixo, o que <b>nunca</b> é fato: frases que parecem ajudar na hora, mas viram problema depois.
      </p>
      <CaixaFatos />
      <Aviso tom="rubro" titulo="Nunca prometa resultado">
        Antes da análise e do processo, ninguém sabe quanto o cliente vai receber, nem se vai ganhar. Promessa feita para
        fechar uma venda vira cobrança depois, quebra a confiança do cliente e expõe a empresa. Se tiver dúvida sobre
        algum fato, não chute: pergunte ao seu gestor e responda o cliente depois.
      </Aviso>
    </Secao>

    <Secao titulo={`Manual de objeções: as ${OBJECOES.length} mais comuns`}>
      <p>
        Esta é a sua consulta rápida. Cada objeção traz: <b>o que o cliente diz</b> (e outros jeitos de dizer a mesma
        coisa), <b>o que pode estar por trás</b>, a <b>pergunta</b> que ajuda a descobrir o motivo real, a <b>resposta
        sugerida</b>, pronta para copiar, e <b>o que não dizer</b>. Use os filtros para ver uma família só e escolha o
        tratamento: as respostas mudam para “o senhor”, “a senhora” ou “você”.
      </p>
      <Aviso tom="azul" titulo="Como usar as respostas prontas">
        Elas são <b>sugestões de roteiro</b>: adapte ao cliente, ao jeito dele falar e ao que ele já contou. Nunca cole a
        resposta antes de passar pelos passos 1 a 3 do método. Se a resposta ficar longa, mande em partes: duas ou três
        mensagens curtas são mais fáceis de ler do que um bloco só.
      </Aviso>
      <ManualObjecoes />
    </Secao>

    <Secao titulo="Confiança na prática: “é golpe?” e “não vou passar a senha”">
      <p>
        As objeções de confiança são as mais delicadas, porque o medo do cliente é legítimo: golpe pelo telefone e pelo
        WhatsApp existe, e muita gente já ouviu falar de um caso próximo. Você não vence esse medo dizendo “pode
        confiar”. Vence mostrando sinais concretos e deixando o cliente no controle.
      </p>
      <SinaisSeguranca />
      <p>
        Veja uma conversa inteira com um cliente desconfiado. Ao lado, o que cada mensagem da atendente está fazendo no
        método.
      </p>
      <CenaGolpe />
      <p>
        Agora a senha. No canal de juros, quando pede o CPF, o robô avisa o cliente com todas as letras: “🔒 Seus dados
        são usados somente para a consulta. *Nunca pedimos senhas, códigos ou qualquer pagamento.*” Se você exigir a
        senha, contradiz o que o cliente acabou de ler. Por isso a senha <b>nunca é condição</b>: o caminho é guiar o
        cliente para ele mesmo baixar os documentos. Se ele <b>preferir</b> passar a senha, aí a gente entra com total
        segurança e depois ajuda a trocar: o passo a passo está na lição 10, e os cuidados de segurança, na lição 14.
      </p>
      <CenaSenha />
    </Secao>

    <Secao titulo="Dinheiro na prática: os 30% e o “e se eu perder?”">
      <p>
        Quase toda objeção de dinheiro nasce do mesmo mal-entendido: o cliente acha que vai ter que tirar dinheiro do
        bolso. Desenhe para ele a linha do tempo do pagamento:
      </p>
      <LinhaDinheiro />
      <p>
        Para mostrar a conta com outros números durante a conversa, use a calculadora de honorários (veja a lição 2), e
        diga sempre que é um exemplo: o resultado depende da análise.
      </p>
      <p>
        Duas objeções de dinheiro pedem atenção especial, porque é muito fácil escorregar numa promessa sem perceber:
      </p>
      <BomRuim
        ruim={{
          titulo: '“30% é muito”: evite',
          corpo: (
            <div className="mv-ob-pilha">
              <p className="mv-ob-cit">“Os outros cobram muito mais. 30% é pouco.”</p>
              <p className="mv-ob-obs">Comparação que você não pode provar, e que diminui a preocupação do cliente.</p>
              <p className="mv-ob-cit">“Dá para baixar um pouquinho.”</p>
              <p className="mv-ob-obs">O custo é fixo. Prometer desconto cria um problema para a empresa e para você.</p>
            </div>
          ),
        }}
        bom={{
          titulo: '“30% é muito”: faça assim',
          corpo: (
            <div className="mv-ob-pilha">
              <p className="mv-ob-cit">
                “Entendo, é natural pensar assim. O senhor não paga nada antes, e o advogado conduz o processo inteiro sem
                cobrar nada. Só no final, do valor que o senhor receber, 30% ficam para ele. Se receber R$ 10.000, por
                exemplo, R$ 7.000 ficam com o senhor. O percentual é fixo, sem surpresa.”
              </p>
              <p className="mv-ob-obs">Mostra de onde sai o dinheiro (do valor recebido), quando (no final) e quanto fica com ele. O número é marcado como exemplo.</p>
            </div>
          ),
        }}
      />
      <BomRuim
        ruim={{
          titulo: '“E se eu perder?”: evite',
          corpo: (
            <div className="mv-ob-pilha">
              <p className="mv-ob-cit">“Não tem como perder, pode ficar tranquilo.”</p>
              <p className="mv-ob-cit">“Se perder, o senhor não paga nada, é garantido.”</p>
              <p className="mv-ob-obs">As duas soam como garantia. Ninguém pode garantir o resultado de um processo, e uma garantia que não se cumpre destrói a confiança.</p>
            </div>
          ),
        }}
        bom={{
          titulo: '“E se eu perder?”: faça assim',
          corpo: (
            <div className="mv-ob-pilha">
              <p className="mv-ob-cit">
                “É uma pergunta muito justa. Ninguém pode garantir o resultado de um processo, e eu não vou prometer o que
                não depende de mim. O que eu posso explicar é como funciona o pagamento: o senhor não paga nada para
                começar, e os 30% do advogado saem do valor que o senhor receber, no final.”
              </p>
              <p className="mv-ob-obs">Honesta sobre o risco, clara sobre o pagamento. Se o cliente quiser mais detalhes, confirme com o gestor e responda por escrito.</p>
            </div>
          ),
        }}
      />
      <TesteRapido
        pergunta="Qual destas frases sobre o pagamento você pode dizer ao cliente?"
        opcoes={[
          '“Se perder, o senhor não paga nada: isso é garantido.”',
          '“O senhor paga uma parte agora e o resto no final.”',
          '“Nada antes; no final, 30% do que o senhor receber.”',
        ]}
        certa={2}
        explica="É a regra: nada antes, 30% do valor recebido, no final, percentual fixo. A primeira frase soa como garantia de resultado, e a segunda está errada: não existe pagamento adiantado."
      />
    </Secao>

    <Secao titulo="Expectativa na prática: “mas não estava pré-aprovada?”">
      <p>
        Quem chega pelo tráfego de empréstimo quer dinheiro rápido. Antes de você assumir, a IA faz as perguntas de
        elegibilidade e manda a mensagem “Boa notícia, {'{nome}'}! Sua análise foi *pré-aprovada*.” Muita gente entende
        isso como “o dinheiro está liberado”. Por isso, ao assumir a conversa, você segue sempre a mesma ordem:
        <b> apresenta-se</b> (seu nome e a CAF), <b>explica com honestidade a “pré-aprovada”</b> (a análise inicial passou
        nas perguntas; não é valor liberado), faz <b>uma pergunta aberta curta</b> sobre o que a pessoa precisa e
        <b> pede os extratos do Meu INSS</b> para conferir a situação. A explicação completa desse momento está na lição 5.
      </p>
      <p>
        Mesmo bem explicada, a objeção costuma voltar mais tarde: quando você confere os extratos e a margem para um
        consignado novo está comprometida, o que acontece com a maioria, vem o “mas não estava pré-aprovada?”. A
        frustração cai em você. O jeito certo é acolher sem culpar ninguém, repetir com calma o que “pré-aprovada” quer
        dizer e mostrar os caminhos que existem, sempre como <b>possibilidade</b>. Compare duas respostas para a mesma cliente, depois da conferência:
      </p>
      <CenaPreAprovada />
      <Lista itens={[
        <><b>Acolha e peça desculpa pela confusão</b>, sem dizer que “o robô errou”. Para o cliente, a CAF é uma só.</>,
        <><b>Repita o que é “pré-aprovada”</b>: a análise inicial passou nas perguntas; não é valor liberado.</>,
        <><b>Diga a verdade sobre a margem</b>, sempre depois de conferir os extratos.</>,
        <><b>Mostre os caminhos como possibilidade</b>: do lado do consignado, o aumento de margem e a portabilidade dos consignados (que pode liberar um valor acima de R$ 1.500); e a <b>revisão dos juros do empréstimo pessoal</b> que a pessoa já tem, em que o advogado pede o ressarcimento do que foi descontado nos últimos 10 anos. O resultado depende da análise. O roteiro completo do “sem margem” está na lição 7.</>,
      ]} />
      <p>
        O mesmo vale para “o banco disse que está tudo certo”: não discuta com o banco nem acuse ninguém. Apresente a
        análise gratuita como um jeito de <b>conferir</b> com calma se o cliente paga juros abusivos no empréstimo
        pessoal. Se estiver tudo certo, o cliente fica tranquilo; se não estiver, o nosso advogado pode entrar com uma
        ação pedindo o ressarcimento do que foi descontado nos últimos 10 anos. E, como sempre, o resultado depende da análise.
      </p>
      <TesteRapido
        pergunta="Uma cliente do canal de empréstimo reclama: “disseram que estava pré-aprovado!”. O que você explica?"
        opcoes={[
          'Que a análise inicial passou; não é valor liberado.',
          'Que o empréstimo sai assim que ela mandar os documentos.',
          'Que foi um erro do robô e a mensagem pode ser ignorada.',
        ]}
        certa={0}
        explica="A IA manda “pré-aprovada” depois das perguntas de elegibilidade: a análise inicial passou e pôde seguir. Prometer o empréstimo é mentir, e culpar o robô joga a empresa contra ela mesma."
      />
    </Secao>

    <Secao titulo="Expectativa na prática: “mas o meu empréstimo é consignado”">
      <p>
        Esta objeção nasce de uma confusão muito comum: para o cliente, empréstimo é tudo igual. Para o nosso processo,
        não é. A CAF revisa os juros do <b>empréstimo pessoal</b> que a pessoa fez com Agibank, BMG, Facta, Mercantil ou
        Crefisa, e não do consignado. Quando o cliente diz “o meu é consignado”, ele pode estar certo, pode ter os dois
        tipos ou pode estar chamando de consignado um empréstimo que é pessoal. Por isso, antes de concluir qualquer
        coisa, ajude a descobrir.
      </p>
      <p>
        A diferença cabe numa frase e está em <b>quem cobra a parcela</b>. O consignado, o INSS desconta direto do
        benefício, antes de o dinheiro cair na conta. O empréstimo pessoal não passa pelo INSS: é um contrato direto com
        a financeira, cobrado em geral na conta do cliente ou por boleto/carnê. Veja o caminho do dinheiro:
      </p>
      <CaminhoParcela />
      <p>
        Dois cuidados. Primeiro: o nome do banco não basta para saber o tipo. O BMG, por exemplo, também faz consignado
        e cartão consignado. Segundo: com o cliente, não use “margem consignável” nem “juros livres”. Pergunte pelo que
        ele vê no dia a dia: a parcela sai da conta, ou o INSS desconta do benefício? A explicação completa, com margem e
        teto de juros, está na lição 3.
      </p>
      <Frase>O consignado é descontado pelo INSS; o empréstimo pessoal é cobrado pela financeira, fora do INSS. O nosso processo olha os juros do empréstimo pessoal.</Frase>
      <p>Depois da pergunta, a conversa segue por um destes três caminhos:</p>
      <ArvoreConsignado />
      <p>
        Veja uma conversa inteira. A cliente achava que só tinha consignado, mas, com uma pergunta simples, lembrou de um
        empréstimo que a financeira cobra na conta:
      </p>
      <CenaConsignado />
      <Aviso tom="ambar" titulo="No canal de empréstimo, o consignado é gancho">
        Lá o cliente quer um consignado novo e, na maioria das vezes, está sem margem. O aumento de margem e a
        portabilidade dos consignados são os caminhos para esse pedido. A revisão de juros é outra coisa: é do
        empréstimo pessoal que ele já tem com as financeiras. Não misture os dois na hora de explicar.
      </Aviso>
      <TesteRapido
        pergunta="O cliente não sabe se o empréstimo dele é pessoal ou consignado. Qual pergunta ajuda mais?"
        opcoes={[
          'O seu empréstimo tem juros livres, ou ele tem um teto de juros?',
          'A financeira cobra na sua conta, ou o INSS desconta do benefício?',
          'O seu empréstimo é com o BMG? Se for, então ele é pessoal, certo?',
        ]}
        certa={1}
        explica="Pergunte pelo que o cliente vê no dia a dia: quem cobra a parcela. O consignado, o INSS desconta direto do benefício; o pessoal, a financeira cobra, em geral na conta ou por boleto. “Juros livres” e “teto” são termos difíceis, e o nome do banco não basta: o BMG, por exemplo, também faz consignado."
      />
    </Secao>

    <Secao titulo="Tempo e decisão: “vou falar com meu filho”, “vou pensar” e a hora de parar">
      <p>
        Nessas objeções o cliente não está dizendo não: está pedindo tempo ou companhia. O seu papel é facilitar a
        decisão (um resumo por escrito, um convite para o filho participar) e <b>combinar quando vocês voltam a
        falar</b>. O que esfria a venda aqui não é o “vou pensar”: é a conversa que termina sem combinado. O modelo de
        resumo para a família está na lição 9.
      </p>
      <CenaFilho />
      <p>E até onde ir? Use esta árvore. Ela vale para qualquer objeção:</p>
      <ArvoreInsistir />
      <p>
        O caminho da esquerda (porta aberta) não é insistência: é respeito com organização. O da direita (agradecer e não
        insistir) também vale para quem não é elegível, por exemplo, quem não recebe nenhum benefício do INSS nem tem um
        familiar que receba, ou quem não tem empréstimo pessoal em nenhuma das 5 financeiras, como quem só tem
        consignado (veja a lição 4). Como fazer o
        retorno no dia combinado, sem nunca passar de um toque por dia, é assunto da lição 9.
      </p>
    </Secao>

    <Secao titulo={`Matriz-resumo: as ${OBJECOES.length} objeções numa tabela`}>
      <p>Para revisar tudo de uma vez: a família, o que pode estar por trás e o fato que ajuda a responder.</p>
      <MatrizObjecoes />
    </Secao>

    <Secao titulo="Treino: escolha a melhor resposta">
      <p>
        Seis situações com clientes de exemplo. Escolha a resposta que você mandaria e leia o porquê de cada opção,
        inclusive das erradas: é nelas que estão as armadilhas.
      </p>
      <TreinoRespostas />
    </Secao>

    <Secao titulo="Resumo da lição">
      <Lista itens={[
        <>Objeção é <b>pedido de clareza</b>, não um “não”. Quem pergunta está pensando no assunto.</>,
        <>Use sempre o método: <b>ouvir, acolher, entender o motivo real, responder com fato, confirmar e combinar o próximo passo</b>. A frase nem sempre é o motivo: <b>antes de responder, pergunte.</b></>,
        <>O processo revisa os juros do <b>empréstimo pessoal</b> (cobrado pela financeira, fora do INSS), não do consignado (descontado pelo INSS). Quem só tem consignado não passa na porta 3; quem não sabe, você ajuda a descobrir.</>,
        <>Responda com os fatos-âncora: nada pago para começar, 30% do valor que o cliente receber no final, Dr. Rafael Menezes, últimos 10 anos, de 6 a 12 meses, procurações no gov.br. E lembre: o resultado depende da análise.</>,
        <><b>Nunca</b> prometa valor, prazo ou resultado, nunca use urgência falsa e nunca exija a senha.</>,
        <>Cliente que diz não, ou que não é elegível: <b>agradeça com carinho e não insista</b>.</>,
      ]} />
    </Secao>
  </div>
);

/** Mensagens prontas = as mesmas respostas sugeridas do manual, no tratamento “você”. */
const resposta = (id: string): string => tratar(OBJECOES.find((o) => o.id === id)?.resposta ?? '', 2);

const licao: Licao = {
  id: 'objecoes',
  modulo: 'venda',
  titulo: 'Objeções e como responder',
  resumo: `Um método de 6 passos para qualquer objeção e o manual das ${OBJECOES.length} mais comuns: o que está por trás, a resposta pronta e o que não dizer.`,
  minutos: 40,
  corpo,
  questoes: [
    {
      p: 'Qual é a ordem do método para responder uma objeção?',
      o: [
        'Ouvir, responder com fato, acolher, entender o motivo real, confirmar e combinar o próximo passo.',
        'Acolher, ouvir, responder com fato, confirmar, entender o motivo real e combinar o próximo passo.',
        'Ouvir, acolher, entender o motivo real, responder com fato, confirmar e combinar o próximo passo.',
      ],
      c: 2,
      e: 'Primeiro conexão (ouvir e acolher), depois diagnóstico (entender o motivo real), depois resposta com fato e confirmação, e por fim um próximo passo combinado.',
    },
    {
      p: 'O cliente pergunta: “e se eu perder?”. O que você pode dizer?',
      o: [
        'Que ninguém garante o resultado, e que os 30% saem do valor que ele receber.',
        'Que não tem como perder, porque o advogado cuida do caso com muita experiência.',
        'Que, se ele perder, não paga nada, e que isso é garantido pela empresa.',
      ],
      c: 0,
      e: 'Ninguém pode garantir o resultado de um processo. O que é fato: nada é pago para começar e os 30% saem do valor que o cliente receber, no final.',
    },
    {
      p: 'Qual passo do método é o que mais se pula, e o que mais faz diferença?',
      o: [
        'Acolher, mostrando que a preocupação do cliente faz sentido.',
        'Entender o motivo real, com uma pergunta simples.',
        'Confirmar, perguntando se a explicação ficou clara.',
      ],
      c: 1,
      e: 'É o passo 3. Uma pergunta simples (“o que deixou o senhor com essa dúvida?”) mostra qual resposta usar. Sem ela, você corre o risco de responder ao motivo errado.',
    },
    {
      p: 'A cliente diz: “mas o meu empréstimo é consignado, o INSS desconta direto”. O que você faz?',
      o: [
        'Pergunta se, além dele, ela tem empréstimo pessoal nas 5 financeiras.',
        'Explica que o consignado também entra na revisão dos juros abusivos.',
        'Agradece e encerra na hora, porque quem tem consignado não é elegível.',
      ],
      c: 0,
      e: 'O processo revisa os juros do empréstimo pessoal (cobrado pela financeira, fora do INSS), não do consignado. Ter consignado não impede ter também um pessoal: pergunte. Só quem tem apenas consignado não passa na porta 3, e aí você agradece sem insistir.',
    },
    {
      p: 'Você ouviu, acolheu e explicou, e o cliente diz com clareza que não quer. O que fazer?',
      o: [
        'Combinar de chamar de novo amanhã, para ver se ele mudou de ideia.',
        'Agradecer com carinho e encerrar, sem insistir.',
        'Explicar mais uma vez, com outras palavras, até ele entender.',
      ],
      c: 1,
      e: 'Quando o cliente diz não, ou não é elegível, a regra é agradecer com carinho e não insistir. Retorno combinado é para quem vai pensar, não para quem já disse não.',
    },
  ],
  glossario: [
    { termo: 'Objeção', def: 'Dúvida, medo ou obstáculo que o cliente apresenta antes de decidir. Não é um “não”: é um pedido de mais clareza.' },
    { termo: 'Motivo real', def: 'O que está por trás da frase do cliente. “Vou pensar” pode esconder uma dúvida sobre os 30%, medo de golpe ou vontade de decidir em família.' },
    { termo: 'Método dos seis passos', def: 'O caminho para responder qualquer objeção, sempre na mesma ordem: ouvir, acolher, entender o motivo real, responder com fato, confirmar e combinar o próximo passo.' },
    { termo: 'Acolher', def: 'Mostrar que você entendeu e que a preocupação do cliente faz sentido, antes de responder. Acolher não é concordar com tudo.' },
    { termo: 'Pergunta de diagnóstico', def: 'A pergunta simples do passo 3, feita antes de responder, para descobrir o motivo real. Ex.: “o que deixou o senhor com essa dúvida?”.' },
    { termo: 'Fato-âncora', def: 'Uma informação verdadeira e confirmada do processo, usada para responder uma objeção. Ex.: os 30% saem do valor que o cliente receber, no final.' },
    { termo: 'Família de objeção', def: 'Grupo de objeções que nascem do mesmo sentimento: confiança, dinheiro, tempo e decisão, expectativa ou praticidade. Cada família pede um remédio diferente.' },
    { termo: 'Sinais de seriedade', def: 'Fatos concretos que tranquilizam o cliente desconfiado: nada é pago antes, advogado com nome, assinatura no gov.br, família por perto e tudo por escrito.' },
  ],
  mensagens: [
    {
      titulo: 'Objeção: “isso é golpe?”',
      quando: 'Depois de acolher e perguntar o que deixou o cliente com o pé atrás. Troque “você” por “o senhor/a senhora” se for o jeito da conversa.',
      texto: resposta('golpe'),
    },
    {
      titulo: 'Objeção: “não tenho dinheiro para advogado”',
      quando: 'Quando o cliente acha que vai ter que pagar do bolso. Deixe claro que o número é só um exemplo.',
      texto: resposta('dinheiro'),
    },
    {
      titulo: 'Objeção: “não vou passar minha senha”',
      quando: 'Quando o cliente não quer passar a senha do gov.br. A senha nunca é condição.',
      texto: resposta('senha'),
    },
    {
      titulo: 'Objeção: “mas o meu empréstimo é consignado”',
      quando: 'Quando o cliente acha que o processo é do consignado. Se ele confirmar que só tem consignado, agradeça e encerre sem insistir.',
      texto: resposta('consignado'),
    },
  ],
};
export default licao;
