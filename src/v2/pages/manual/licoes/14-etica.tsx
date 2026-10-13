/* Lição 14 — Segurança, ética e LGPD. Como trabalhar com dados e com pessoas
   vulneráveis: o escudo da confiança (senha, dados, dinheiro, respeito), as regras
   da senha do cliente, dados pessoais e LGPD em linguagem simples, o caminho do
   dado, prints e grupos (onde os dados vazam), golpes (por que o medo do cliente
   é legítimo e como a CAF se diferencia), os quatro "nunca", a ética de venda com
   pessoas idosas, as situações delicadas (chamar o gestor) e o combinado final.
   Fatos da empresa: só os do brief. Mensagens do robô copiadas literalmente; as
   do atendente são sugestões de roteiro. Ilustrações em 14-etica-figuras.tsx.
   Assuntos de outras lições só citados com referência: 30% e "não prometer" (L02),
   fluxo do robô e pré-aprovada (L05), objeções (L08), procedimento da senha (L10). */
import type { Licao } from '../tipos';
import {
  Aviso, Celular, Conversa, Fatos, Frase, Lista, Passos, Sanfona, Secao, Tabela, TesteRapido,
} from '../pecas';
import {
  CartazCompromisso, CicloDoDado, DetectorGolpe, EscudoConfianca, PodeOuNaoPode, PrintSeguro, QuaisSaoDados,
  QuatroNuncas, RegrasDaSenha, ReguaPersuasao, SemaforoDelicadas, SinaisGolpeConfianca,
} from './14-etica-figuras';
import './14-etica.css';

const corpo = (
  <>
    <p className="mv-lead">
      Neste trabalho você vai lidar, todos os dias, com coisas muito valiosas que não são suas: o CPF, os documentos,
      os extratos de 10 anos de benefício, o imposto de renda e, às vezes, até a senha do gov.br de pessoas que
      acabaram de te conhecer pelo WhatsApp. A maioria delas é aposentada ou pensionista, muitas são idosas, e quase
      todas já ouviram falar de golpe. Quando um cliente entrega tudo isso para a gente, ele está fazendo uma aposta de
      confiança. Esta lição ensina a merecer essa aposta: como cuidar da senha, o que é dado pessoal e o que a LGPD pede
      de você (em linguagem simples), onde os dados costumam vazar, como reconhecer um golpe e mostrar que a CAF é
      diferente, como vender com ética para pessoas idosas e o que fazer nas situações delicadas. No final, um
      combinado com o que você nunca faz e o que você sempre faz.
    </p>

    <Fatos itens={[
      { grande: '1 senha', texto: 'A senha do gov.br abre a vida do benefício do cliente. Ela serve só para pegar os documentos.' },
      { grande: 'R$ 0 antes', texto: 'A CAF nunca pede dinheiro adiantado. Os 30% saem só no final, do valor que o cliente receber.' },
      { grande: 'Só o necessário', texto: 'Pedir, abrir e guardar só o que o processo precisa. Nem um dado a mais.' },
      { grande: 'Não é não', texto: 'Quem diz não, ou não é elegível, recebe um obrigado com carinho e nenhuma insistência.' },
    ]} />

    {/* ------------------------------------------------------------------ 1. por quê */}
    <Secao titulo="1. Por que isso vem antes de tudo">
      <p>
        Pense em tudo o que um cliente nos entrega ao longo do atendimento: o nome e o CPF logo no começo (o robô já
        pede); os documentos do Meu INSS (a carta de concessão e os extratos de empréstimo e de pagamento dos últimos 10
        anos); o imposto de renda dos últimos 3 anos e a situação cadastral do CPF; e os documentos pessoais (identidade,
        comprovante de residência, foto do rosto e e-mail). Juntas, essas informações contam quem a pessoa é, onde mora,
        quanto recebe e quanto deve. Nas mãos certas, viram um processo. Nas mãos erradas, viram ferramenta de golpe.
      </p>
      <p>
        E tem um detalhe que pesa ainda mais: o nosso público. São pessoas que recebem benefício do INSS, em geral
        aposentados e pensionistas, muitas com pouca prática com celular e aplicativos. É um público muito visado por
        golpistas. Por isso o cliente chega desconfiado, e tem razão de estar. Cada atitude sua confirma
        essa desconfiança ou mostra que aqui é diferente. Não existe atitude neutra.
      </p>
      <p>
        Dá para resumir a lição inteira num escudo com quatro partes. No centro está o cliente. Em volta, as quatro coisas
        que você protege: a <b>senha</b>, os <b>dados</b>, o <b>dinheiro</b> e o <b>respeito</b>. Toque em cada parte
        para ver o que ela protege e a regra de ouro de cada uma.
      </p>
      <EscudoConfianca />
      <Frase>Confiança é o que a gente entrega antes de qualquer processo. Demora para ser conquistada e pode acabar numa única mensagem errada.</Frase>
      <Aviso tom="azul" titulo="Segurança também protege você">
        Seguir estas regras não é só cuidar do cliente: é a sua proteção também. Quem faz tudo do jeito certo nunca
        precisa se explicar depois. E, quando bater a dúvida, a resposta é sempre a mesma: pare e pergunte ao seu gestor.
      </Aviso>
    </Secao>

    {/* ------------------------------------------------------------------ 2. senha */}
    <Secao titulo="2. A senha do cliente: a chave da casa">
      <p>
        Imagine que uma vizinha idosa te entrega a chave da casa dela para você buscar um documento na gaveta. Você entra,
        pega o documento, sai, tranca a porta e devolve a chave. Você não abre a geladeira, não lê as cartas que estão em
        cima da mesa e não tira uma cópia da chave “por via das dúvidas”. E, se ela quiser, você ainda ajuda a trocar a
        fechadura. A senha do gov.br é exatamente essa chave.
      </p>
      <p>
        Com ela dá para entrar no Meu INSS e ver toda a história do benefício, entrar no Meu Imposto de Renda e até
        assinar documentos digitalmente. Por isso a senha é a coisa mais delicada que pode passar pela sua mão. A gente
        prefere sempre guiar o cliente para ele mesmo entrar; a senha só aparece quando ele não consegue, ou prefere, e
        decide passar. O procedimento (como entrar, o que baixar, como trocar a senha depois) está na lição 10. Aqui o
        assunto é outro: o que é certo fazer com essa chave. São quatro regras, sem exceção:
      </p>
      <RegrasDaSenha />
      <p>
        Repare que a regra 4 não é um detalhe: é ela que fecha o ciclo. Enquanto o cliente não troca a senha, uma pessoa
        de fora (você) ainda conhece a chave da casa dele. Ajudar a trocar é o que transforma o “pode confiar em mim” em
        “pode conferir: a chave voltou a ser só sua”.
      </p>
      <p>
        Muitos clientes fazem a pergunta certa antes de passar a senha. Quando isso acontecer, não se ofenda e não
        apresse: responda explicando os seus cuidados e lembrando que existe outra opção. (Se o cliente não quer passar
        a senha de jeito nenhum, isso é uma objeção, e a resposta está na lição 8.)
      </p>
      <Conversa
        titulo="O cliente tem medo de passar a senha"
        nota="sugestão de roteiro, adapte ao cliente"
        falas={[
          { quem: 'cliente', texto: 'Mas e se alguém usar a minha senha pra fazer empréstimo no meu nome?' },
          { quem: 'eu', texto: 'É muito certo a senhora pensar nisso. Por isso eu sigo três cuidados: uso a sua senha só para baixar os documentos do processo, não anoto em lugar nenhum e, assim que terminar, a gente troca a senha juntos. A senha nova só a senhora vai saber.' },
          { quem: 'cliente', texto: 'Ah, assim fico mais tranquila.' },
          { quem: 'eu', texto: 'E, se preferir, eu também posso te guiar para a senhora mesma baixar os documentos, um passo de cada vez. A escolha é sua.' },
        ]}
      />
      <Aviso tom="ambar" titulo="E se aparecer um código no celular do cliente?">
        Às vezes, ao entrar com a senha, o gov.br pede uma confirmação a mais, como um código enviado ao celular do dono da
        conta. Não improvise: pare e fale com o seu gestor antes de pedir qualquer coisa ao cliente. Fora disso, nunca peça
        código nenhum (você vai ver o porquê na seção 6). E a senha do banco do cliente você nunca pede: quando a conta
        gov.br precisa subir para prata pela conta bancária, é o próprio cliente quem faz essa validação.
      </Aviso>
      <TesteRapido
        pergunta="Você está no Meu INSS com a senha que o Seu Antônio passou e vê que dá para fazer um pedido que talvez ajude ele. O que você faz?"
        opcoes={[
          'Faz o pedido, já que é para o bem dele',
          'Faz o pedido e conta tudo para ele logo depois',
          'Fica só nos documentos e comenta com o gestor',
        ]}
        certa={2}
        explica="A senha foi confiada para buscar os documentos, e só isso. Boa intenção não muda a regra: usar a chave para outra coisa é usar sem permissão."
      />
    </Secao>

    {/* ------------------------------------------------------------------ 3. LGPD */}
    <Secao titulo="3. Dados pessoais e a LGPD, sem juridiquês">
      <p>
        A <b>LGPD</b> (Lei Geral de Proteção de Dados Pessoais) é a lei brasileira que diz como empresas, e as pessoas que
        trabalham nelas, podem coletar, usar, guardar e compartilhar informações sobre outras pessoas. Você não precisa
        decorar a lei. Precisa entender a ideia dela e transformar em hábito. A ideia cabe numa frase: <b>os dados são do
        cliente, e a empresa só pode usar o que precisa, para o motivo combinado, com cuidado</b>.
      </p>

      <h4 className="mv-et-h4">O que é dado pessoal</h4>
      <p>
        Dado pessoal é qualquer informação que identifica uma pessoa ou ajuda a identificá-la. Não é só o documento com
        foto. O nome é dado pessoal. O CPF também. O endereço, o telefone, o e-mail, a foto do rosto, o número do
        benefício, os extratos do INSS e a declaração de imposto de renda: tudo isso é dado pessoal. Teste o seu olho:
        marque o que você acha que é dado pessoal e depois confira.
      </p>
      <QuaisSaoDados />
      <p>
        Alguns dados pedem um cuidado ainda maior, e a lei dá a eles o nome de <b>dados sensíveis</b>: informações de
        saúde, biometria (como o rosto usado em reconhecimento facial), religião, entre outros. No nosso dia a dia isso
        aparece mais do que parece. A foto do rosto, por exemplo, serve para confirmar que é a própria pessoa fazendo, e
        não outra no nome dela; como mostra o rosto do cliente, trate-a sempre com cuidado extra. E um extrato pode mostrar que o cliente recebe um auxílio ligado a uma doença. Você vai
        ver essas informações porque elas estão nos documentos. O cuidado é não comentar, não expor e não usar para nada
        além do processo.
      </p>

      <h4 className="mv-et-h4">Quatro ideias da lei para o seu dia a dia</h4>
      <p>
        A LGPD tem vários princípios. Quatro deles aparecem o tempo todo no atendimento, e cada um vira uma atitude
        concreta:
      </p>
      <div className="mv-et-tab" data-t="lgpd">
      <Tabela
        colunas={['Ideia', 'Em uma frase', 'Na prática, no seu atendimento']}
        destaque={0}
        linhas={[
          ['Finalidade', 'O dado coletado para um motivo é usado só para esse motivo.', 'Os documentos servem à análise e ao processo. Não servem para curiosidade nem para nenhum outro uso.'],
          ['Necessidade', 'Pedir e acessar só o mínimo necessário.', 'Peça só o que está na lista de documentos. Na conta do cliente, abra só o que precisa.'],
          ['Segurança', 'Proteger o dado contra perda, vazamento e acesso de quem não devia.', 'Senha não se anota, tela não fica aberta, arquivo não vai para o lugar errado.'],
          ['Transparência', 'A pessoa tem o direito de saber o que é feito com os dados dela.', '“Por que tanto documento?” merece resposta com calma: é a documentação básica do procedimento, nada fora do normal.'],
        ]}
      />
      </div>

      <h4 className="mv-et-h4">O cliente é o dono dos dados</h4>
      <p>
        Pela LGPD, a pessoa a quem os dados se referem (a lei chama de <b>titular dos dados</b>) tem direitos sobre eles: pode
        perguntar quais dados a empresa tem e para que usa, pedir a correção do que estiver errado e fazer outros pedidos.
        Na rota do familiar, o titular dos dados é o familiar que recebe o benefício. Se alguém fizer um pedido
        assim, não improvise resposta e não prometa nada: anote o pedido do jeito que a pessoa fez e passe para o seu
        gestor. Quem responde por esses pedidos é a empresa.
      </p>

      <h4 className="mv-et-h4">O caminho do dado, do começo ao fim</h4>
      <p>
        Todo dado que entra pela conversa percorre um caminho. Em cada etapa existe um jeito certo de cuidar e um ponto
        onde ele pode escapar. Toque nas etapas e repare que o risco quase nunca é um hacker: quase sempre é uma
        distração nossa.
      </p>
      <CicloDoDado />
      <TesteRapido
        pergunta="Qual destes itens NÃO é dado pessoal?"
        opcoes={[
          'O número do benefício do cliente',
          'A lista das 5 financeiras da CAF',
          'A foto do rosto que o cliente mandou',
        ]}
        certa={1}
        explica="A lista das financeiras é informação sobre a empresa, não sobre uma pessoa. Número do benefício e foto do rosto identificam o cliente (e a foto ainda pede cuidado extra)."
      />
    </Secao>

    {/* ------------------------------------------------------------------ 4. vazamentos */}
    <Secao titulo="4. Prints, grupos e conversas: onde os dados vazam">
      <p>
        Quase nenhum vazamento acontece por maldade. Acontece por pressa: o arquivo vai para a conversa errada, o print
        sai com mais coisa do que devia, a tela fica aberta quando você levanta, o caso de um cliente vira assunto no
        almoço com os amigos. Por isso, mais importante do que saber a lei é criar hábitos que funcionem mesmo nos dias
        corridos.
      </p>

      <h4 className="mv-et-h4">O print que mostra demais</h4>
      <p>
        Imagine que você ficou em dúvida sobre uma linha do extrato de consignado da Dona Maria e quer perguntar ao seu
        gestor. Você tira um print da tela inteira. Agora olhe com atenção o que foi junto, e compare com o print
        recortado:
      </p>
      <PrintSeguro />
      <p>
        A regra é simples: antes de enviar qualquer print, olhe para ele como se fosse um estranho. Aparece nome, CPF,
        mensagem ou documento de outra pessoa? Recorte. Precisa mesmo do print, ou dá para descrever a dúvida em texto?
        Mande só o que responde a pergunta, e só para quem vai ajudar a resolver.
      </p>

      <h4 className="mv-et-h4">Antes de apertar “enviar”: três perguntas</h4>
      <Passos itens={[
        { titulo: 'Para quem?', texto: 'Confira o nome da conversa ou do grupo. Documento de cliente vai para o próprio cliente ou para quem trabalha no caso, nunca para um grupo pessoal.' },
        { titulo: 'O quê?', texto: 'Abra o arquivo ou o print e veja tudo o que aparece nele. Tem dado de outra pessoa? Recorte ou troque.' },
        { titulo: 'Precisa?', texto: 'Se dá para resolver sem mandar o dado, melhor. Menos dado circulando é menos risco.' },
      ]} />

      <h4 className="mv-et-h4">Os vazamentos mais comuns</h4>
      <div className="mv-et-tab" data-t="vaz">
      <Tabela
        colunas={['Situação', 'Por que é perigoso', 'Como evitar']}
        destaque={0}
        linhas={[
          ['Mandar documento na conversa ou no grupo errado', 'O dado chega a quem não devia, e não há garantia de que dá para desfazer.', 'Confira o nome da conversa antes de enviar. Errou? Avise o gestor na hora.'],
          ['Print com dados de outros clientes', 'Expõe pessoas que não têm nada a ver com a sua dúvida.', 'Recorte. Mostre só o necessário.'],
          ['Tela aberta ou celular desbloqueado', 'Qualquer pessoa que passar consegue ver.', 'Bloqueie a tela sempre que levantar.'],
          ['Comentar caso de cliente fora do trabalho', 'Quebra a confiança, mesmo “sem dizer o nome”: detalhes identificam.', 'Caso de cliente se discute só no trabalho, com quem precisa.'],
          ['Senha ou dado de cliente anotado em papel ou planilha por conta própria', 'Papel se perde e planilha pessoal circula.', 'Senha não se anota. Dado de cliente fica só onde a empresa define.'],
        ]}
      />
      </div>

      <h4 className="mv-et-h4">Errei: mandei para o lugar errado. E agora?</h4>
      <p>
        Pode acontecer com qualquer pessoa. O que não pode é esconder. Um erro avisado na hora quase sempre tem conserto;
        um erro escondido vira um problema muito maior, para o cliente e para a empresa.
      </p>
      <Passos itens={[
        { titulo: 'Pare e não esconda', texto: 'O impulso de fingir que nada aconteceu é o pior caminho.' },
        { titulo: 'Tente apagar para todos', texto: 'No WhatsApp, apague a mensagem para todos o quanto antes. Mesmo que dê certo, siga para o próximo passo.' },
        { titulo: 'Avise o gestor na hora', texto: 'Conte o que foi enviado, para quem e quando. Quanto antes ele souber, mais dá para fazer.' },
        { titulo: 'Siga a orientação', texto: 'É a empresa que decide os próximos passos, inclusive se e como falar com o cliente.' },
      ]} />
    </Secao>

    {/* ------------------------------------------------------------------ 5. golpes */}
    <Secao titulo="5. Golpes: o medo do cliente tem razão">
      <p>
        Quando o cliente pergunta “isso não é golpe?”, ele não está te ofendendo. Está se protegendo, e faz bem. Golpe
        pelo telefone e pelo WhatsApp existe e mira muito em aposentados e pensionistas: falsas centrais de banco,
        empréstimo falso com “taxa de liberação”, mensagens dizendo que o benefício vai ser bloqueado, gente que se passa
        por advogado dizendo que um processo “saiu” e que é preciso pagar para receber. Pode ser que o cliente já tenha
        caído em um, ou conheça alguém que caiu.
      </p>
      <p>
        Agora repare numa coisa incômoda: por fora, o nosso trabalho se parece com o que os golpistas fingem fazer. A
        gente fala de dinheiro a receber, de processo, de advogado, e pede documentos. Por isso não basta dizer “pode
        confiar”. <b>Confiança não se pede: se mostra</b>, com atitudes que o golpista nunca tem. Compare, linha por
        linha:
      </p>
      <SinaisGolpeConfianca />
      <p>
        Por isso o robô do canal de juros abusivos, no exato momento em que pede o CPF, já deixa um aviso por escrito (o
        fluxo completo do robô está na lição 5):
      </p>
      <Frase autor="Aviso do robô da CAF, copiado como ele é">Nunca pedimos senhas, códigos ou qualquer pagamento.</Frase>
      <p>
        Esse aviso é uma promessa da empresa, e quem cumpre a promessa é você. Senha, você não pede nem exige: oferece
        guiar o cliente e, se ele preferir passar, segue as quatro regras da seção 2. Código e pagamento, nunca, de jeito
        nenhum. Se um dia alguém te pedir para fazer diferente, a resposta é não, e o gestor precisa saber.
      </p>

      <h4 className="mv-et-h4">Quando o cliente encaminha uma mensagem suspeita</h4>
      <p>
        Às vezes o cliente recebe uma mensagem estranha e, antes de fazer qualquer coisa, encaminha para você perguntando
        se é da CAF. Esse cliente merece um elogio: fez exatamente o certo. Treine o seu olho com as mensagens abaixo e
        repare nos sinais que se repetem.
      </p>
      <DetectorGolpe />
      <Passos itens={[
        { titulo: 'Agradeça por ter perguntado', texto: '“Fez muito bem em me perguntar antes!” O cliente precisa sentir que perguntar é o caminho certo, para fazer de novo da próxima vez.' },
        { titulo: 'Seja claro', texto: 'A CAF nunca pede taxa, PIX, depósito ou código. Se a mensagem pede isso, não é nossa.' },
        { titulo: 'Oriente', texto: 'Não pagar, não clicar em link, não passar código nenhum, não mandar documento para aquele número.' },
        { titulo: 'Avise o gestor', texto: 'Golpe usando o nome da empresa é assunto sério. Passe para o gestor o que o cliente mostrou.' },
      ]} />
      <TesteRapido
        pergunta="A Dona Cida encaminha: “Seu processo saiu! Pague R$ 390 de taxa hoje para liberar.” e pergunta se é de vocês. O que você faz?"
        opcoes={[
          'Responde “pode ser, vou confirmar” e pede que ela espere',
          'Diz que não é da CAF, orienta a não pagar e avisa o gestor',
          'Pede o código que chegou no celular dela, para você conferir',
        ]}
        certa={1}
        explica="Pedido de pagamento antecipado é sinal de golpe, e a CAF nunca faz isso. Agradeça por ela ter perguntado. Responder com dúvida deixa a cliente exposta, e pedir código seria repetir o golpe."
      />
    </Secao>

    {/* ------------------------------------------------------------------ 6. nunca */}
    <Secao titulo="6. O que o atendente nunca faz">
      <p>
        Algumas atitudes não têm meio-termo. Não importa a pressa, o dia corrido ou o pedido de quem quer que seja: o
        atendente da CAF nunca faz estas quatro coisas. Cada uma tem um porquê, e entender o porquê é o que faz você não
        cair na tentação de “só dessa vez”.
      </p>
      <QuatroNuncas />
      <p>
        A mais traiçoeira é a promessa, porque ela parece gentileza. Dizer “a senhora vai receber uns 20 mil” deixa o
        cliente feliz na hora e decepcionado depois: o valor depende da análise e do processo, e ninguém sabe antes. Como
        responder ao “quanto eu vou receber?” sem prometer está na lição 2. O mesmo vale no canal de empréstimo: aumento
        de margem e portabilidade são possibilidades que dependem da análise, nunca uma garantia.
      </p>
      <Aviso tom="rubro" titulo="“Só dessa vez” não existe">
        Nenhum dos quatro “nunca” tem exceção: nem para fechar mais rápido, nem porque o cliente pediu, nem porque parece
        inofensivo. Se a situação parecer pedir uma exceção, é exatamente a hora de parar e falar com o gestor.
      </Aviso>
    </Secao>

    {/* ------------------------------------------------------------------ 7. ética com idosos */}
    <Secao titulo="7. Ética de venda com pessoas idosas">
      <p>
        O dono da empresa diz que a gente precisa “comprar” o cliente, convencer. E é verdade: muita gente que chega,
        principalmente pelo anúncio de empréstimo, nem sabia que o processo existia, e só vai entender o valor dele se
        alguém explicar bem. Convencer não tem nada de errado. O que separa a venda boa da venda abusiva é o jeito:
        <b> convencer é ajudar a pessoa a enxergar um benefício real, com informação verdadeira, e deixar a decisão com
        ela</b>. Pressionar é tirar dela essa decisão. Entre uma coisa e outra existe uma linha, e ela não se cruza.
      </p>
      <ReguaPersuasao />

      <h4 className="mv-et-h4">Respeito: o jeito de falar</h4>
      <Lista itens={[
        <>Trate pelo nome, com <b>“o senhor”</b> ou <b>“a senhora”</b>, ou com “você”, se a própria pessoa preferir.</>,
        <>Frases curtas, um assunto por vez. Palavra técnica (margem, portabilidade, honorários) só com explicação.</>,
        <>Paciência para repetir. Pergunta repetida não é chatice: é alguém querendo entender antes de confiar.</>,
        <>Nada de falar com o idoso como se ele fosse criança, nem de rir de quem não sabe mexer no celular.</>,
        <>Respeite o ritmo: tem gente que responde devagar, que prefere áudio, que precisa da ajuda de um filho.</>,
      ]} />

      <h4 className="mv-et-h4">Os 30%: a verdade inteira, desde o começo</h4>
      <p>
        Os honorários são o ponto em que mais dá para errar por omissão. Dizer só “é de graça” e deixar os 30% para depois
        é meia-verdade: o cliente precisa saber, <b>antes</b> de decidir seguir, que não paga nada para começar e que, no
        final, 30% do que receber ficam com o advogado. Quem descobre isso só no fim se sente enganado, e com razão. Como
        explicar, com exemplo de número e calculadora, está na lição 2.
      </p>

      <h4 className="mv-et-h4">O direito de dizer não</h4>
      <div className="mv-et-duas">
        <div>
          <p>
            Todo cliente tem o direito de dizer não, de pensar com calma e de conversar com a família antes de decidir. E
            quem disse não, ou não é elegível, recebe um agradecimento com carinho e nenhuma insistência. Essa é a regra da
            casa, e o próprio robô dá o exemplo no canal de juros abusivos, quando o cliente responde NÃO.
          </p>
          <p>
            Repare no que a resposta faz: aceita o não sem discutir, deixa a porta aberta e não pressiona. Siga o mesmo
            padrão. Um cliente que sumiu no meio da conversa pode receber um lembrete gentil (isso está na lição 9). Um
            cliente que disse claramente que não quer, não recebe insistência.
          </p>
        </div>
        <Celular
          contato="CAF"
          sub="mensagem automática do canal de juros"
          bolhas={[
            { de: 'robo', texto: 'Responda *SIM* ou *NÃO* 😊', hora: '15:10' },
            { de: 'cliente', texto: 'NÃO', hora: '15:12' },
            { de: 'robo', texto: 'Sem problema! 😊 Se mudar de ideia, é só mandar um *SIM* aqui a qualquer momento. A análise é gratuita e fica à sua disposição.', hora: '15:12' },
          ]}
          legenda="Trecho do robô, copiado como ele é: aceitar, agradecer, deixar a porta aberta."
        />
      </div>

      <h4 className="mv-et-h4">Honestidade no canal de empréstimo</h4>
      <p>
        No canal de empréstimo, o cliente chega querendo dinheiro rápido e com a mensagem da IA de que a análise foi
        “pré-aprovada”, que só quer dizer que a análise inicial passou nas perguntas, e não que há valor liberado (a
        explicação completa está na lição 5). Só que a maioria não tem margem disponível. Aqui a ética pede três cuidados:
        <b> verificar antes de falar</b> (os extratos do Meu INSS mostram a situação), <b>explicar com franqueza</b> quando
        não houver margem e <b>apresentar os caminhos</b> (a possibilidade de aumento de margem, a possibilidade de
        portabilidade, o processo) como possibilidades, nunca como garantia.
      </p>
      <p>
        E deixe sempre claro que o processo não é um empréstimo: o advogado entra com uma ação pedindo o ressarcimento do
        que foi descontado nos últimos 10 anos, o prazo médio é de 6 a 12 meses e o resultado depende da análise. Um
        cliente que topa o processo achando que vai sair dinheiro na semana que vem foi mal informado, e vai se sentir
        enganado.
      </p>
      <TesteRapido
        pergunta="A Dona Lurdes respondeu: “Não quero, obrigada.” Qual é a atitude certa?"
        opcoes={[
          'Mandar um áudio explicando tudo de novo, com calma',
          'Esperar uns dias e oferecer de novo, como “última chance”',
          'Agradecer com carinho e deixar a porta aberta',
        ]}
        certa={2}
        explica="Não é não. Agradecer e deixar a porta aberta é o padrão da casa, o mesmo que o robô usa. Insistir ou criar urgência falsa é pressão."
      />
    </Secao>

    {/* ------------------------------------------------------------------ 8. situações delicadas */}
    <Secao titulo="8. Situações delicadas: quando parar e chamar o gestor">
      <p>
        Algumas conversas fogem do normal. O cliente parece confuso, alguém da família fala por ele, aparece uma palavra
        como “interditado” ou “curador”, ou alguém parece querer se aproveitar do idoso. Nesses momentos, a vontade de
        fechar rápido é a pior conselheira. Use o semáforo: <b>verde</b>, segue com paciência; <b>amarelo</b>, desacelera
        e confirma; <b>vermelho</b>, para e chama o gestor.
      </p>
      <SemaforoDelicadas />

      <h4 className="mv-et-h4">Curatela e representação, em linhas gerais</h4>
      <p>
        <b>Curatela</b> é quando a Justiça nomeia uma pessoa, o curador, para cuidar de certos atos da vida de alguém que
        não consegue fazer isso sozinho. Também existem situações em que alguém age em nome do cliente por meio de uma
        procuração. Nesses casos muda quem pode decidir e assinar, e o caso precisa de uma análise que não cabe a você.
        Você não precisa entender as regras jurídicas: precisa <b>reconhecer o sinal e chamar o gestor</b> antes de pedir
        qualquer documento ou assinatura.
      </p>
      <Lista tom="nao" itens={[
        'Alguém diz que é curador, tutor ou procurador do cliente.',
        'Aparecem palavras como “interditado”, “interdição” ou “curatela”.',
        'O cliente não consegue entender o que é o processo, mesmo com explicações simples e repetidas.',
        'Outra pessoa responde no lugar do cliente o tempo todo e não deixa ele falar.',
        'Alguém pressiona para fazer rápido ou quer o dinheiro do cliente para si.',
      ]} />
      <Aviso tom="ambar" titulo="A rota do familiar é outra coisa, mas pede o mesmo cuidado">
        Quando o cliente não recebe benefício, mas um familiar recebe (pai, mãe, avó, avô, filho), a análise segue pelo
        benefício do familiar e os documentos passam a ser dele: Meu INSS, imposto de renda, CPF, identidade, foto do
        rosto, comprovante e e-mail. Por isso quem recebe o benefício precisa saber de tudo e estar de acordo. Seguir só com o parente, sem o titular saber, não está certo. Na dúvida, fale com o gestor.
      </Aviso>

      <h4 className="mv-et-h4">Perguntas que aparecem no dia a dia</h4>
      <Sanfona itens={[
        {
          titulo: '“O que vocês vão fazer com os meus dados?”',
          corpo: <p>Responda com tranquilidade: os dados são usados para a análise e para o processo, como o robô avisou no
            começo. Diga para que serve cada documento que você pedir. Se ele quiser saber mais do que você sabe responder,
            passe para o gestor. Pergunta assim é sinal de cuidado, não de desconfiança com você.</p>,
        },
        {
          titulo: '“Quero que vocês apaguem os meus dados.”',
          corpo: <p>A LGPD dá ao titular o direito de fazer pedidos sobre os próprios dados, inclusive de eliminação, com
            algumas exceções previstas na lei. Não prometa nem negue: anote o pedido do jeito que ele fez e passe para o
            gestor, que encaminha.</p>,
        },
        {
          titulo: 'Um parente pede informações do processo do cliente.',
          corpo: <p>Os dados são do cliente. Não passe informação a outra pessoa sem a autorização dele. Confirme com o
            próprio cliente e, na dúvida, fale com o gestor. Isso vale mesmo quando o parente é simpático e parece bem
            intencionado.</p>,
        },
        {
          titulo: 'O cliente mandou documento de outra pessoa sem explicar.',
          corpo: <p>Pergunte de quem é e por quê, com calma. Pode ser a rota do familiar, ou um comprovante de residência no
            nome de outra pessoa (nesse caso pede-se o documento com foto dessa pessoa e se faz a declaração de residência).
            Se não fizer parte do processo, não use o documento e explique isso ao cliente.</p>,
        },
        {
          titulo: 'Vi uma informação que não tem nada a ver com o processo.',
          corpo: <p>Um benefício ligado a uma doença, uma dívida, um problema de família. Não comente, não anote, não
            espalhe. Você viu porque estava no documento, e é lá que essa informação fica.</p>,
        },
      ]} />
    </Secao>

    {/* ------------------------------------------------------------------ 9. treino */}
    <Secao titulo="9. Treino: pode ou não pode?">
      <p>
        Hora de juntar tudo: senha, dados, golpe e respeito. Para cada situação, decida se pode ou não pode. A explicação
        aparece depois da resposta. Se errar alguma, volte à seção correspondente antes de seguir.
      </p>
      <PodeOuNaoPode />
    </Secao>

    {/* ------------------------------------------------------------------ 10. combinado */}
    <Secao titulo="10. Nunca faça × sempre faça">
      <p>
        Este é o resumo prático da lição, em forma de combinado. Leia cada linha e marque quando sentir que ela já é sua.
        Se um dia ficar em dúvida no meio de um atendimento, volte aqui: quase toda dúvida de ética se resolve com uma
        destas 20 linhas.
      </p>
      <CartazCompromisso />
      <Frase>Na dúvida entre fechar rápido e fazer certo, faça certo. Se a dúvida continuar, pergunte ao gestor.</Frase>
    </Secao>

    {/* ------------------------------------------------------------------ resumo */}
    <Secao titulo="Resumo da lição">
      <Lista itens={[
        <>A senha do gov.br é a <b>chave da casa</b> do cliente: só para pegar os documentos, nunca anotada, nunca usada para outra coisa, e trocada depois com a sua ajuda.</>,
        <><b>Dado pessoal</b> é tudo o que identifica o cliente (nome, CPF, documentos, extratos). Peça e acesse só o necessário, e nunca compartilhe fora do trabalho.</>,
        <>A maioria dos vazamentos vem da pressa: confira <b>para quem</b> vai, <b>recorte</b> o print e, se errar, <b>avise o gestor</b> na hora.</>,
        <>O medo de golpe é legítimo. A CAF mostra a diferença com atitudes: <b>nada pago antes</b> (30% só no final, do que o cliente receber), assinatura no gov.br oficial, sem promessas e sem pressão.</>,
        <>Venda com ética: os 30% explicados com clareza e exemplo, respeito ao tempo e à família do cliente, e <b>não é não</b>.</>,
        <>Cliente confuso, curatela, representação ou alguém se aproveitando? <b>Pare e chame o gestor.</b></>,
      ]} />
    </Secao>
  </>
);

const licao: Licao = {
  id: 'etica',
  modulo: 'fechamento',
  titulo: 'Segurança, ética e LGPD',
  resumo: 'Como cuidar da senha e dos dados do cliente, reconhecer golpes, vender com ética para pessoas idosas e agir nas situações delicadas.',
  minutos: 35,
  corpo,
  questoes: [
    {
      p: 'O cliente passou a senha do gov.br. Para que você pode usá-la?',
      o: [
        'Para qualquer serviço do gov.br que ajude o cliente',
        'Só para buscar os documentos do processo, nada além',
        'Para guardar e reusar se faltar algum documento depois',
      ],
      c: 1,
      e: 'A senha foi confiada só para buscar os documentos. Não se anota, não se guarda e não se usa para mais nada; depois, o cliente troca a senha (o passo a passo está na lição 10).',
    },
    {
      p: 'Qual destas atitudes é sinal de golpe, e a CAF nunca tem?',
      o: [
        'Dizer o nome da empresa e do advogado do processo',
        'Pedir a assinatura das procurações pelo gov.br',
        'Pedir uma taxa ou um PIX para “liberar” o valor',
      ],
      c: 2,
      e: 'A CAF nunca pede dinheiro adiantado: os 30% de honorários saem só no final, do valor que o cliente receber. Dizer quem somos e assinar pelo gov.br fazem parte do jeito CAF.',
    },
    {
      p: 'Em linguagem simples, o que a LGPD chama de dado pessoal?',
      o: [
        'Tudo o que identifica uma pessoa ou ajuda a identificá-la',
        'Só os documentos oficiais com foto, como a identidade e a CNH',
        'Só as senhas e os números das contas bancárias do cliente',
      ],
      c: 0,
      e: 'Dado pessoal vai muito além do documento com foto: nome, CPF, endereço, telefone, e-mail, foto, número do benefício e extratos, tudo isso é dado pessoal.',
    },
    {
      p: 'A filha de uma cliente escreve: “Minha mãe é interditada, eu sou a curadora dela.” O que você faz?',
      o: [
        'Chama o gestor antes de pedir documento ou assinatura',
        'Segue normalmente com a filha, que manda os documentos',
        'Encerra a conversa, porque esse caso não pode ser atendido',
      ],
      c: 0,
      e: 'Curatela muda quem pode decidir e assinar pela pessoa. O atendente não decide sozinho, nem para seguir nem para encerrar: para e chama o gestor.',
    },
    {
      p: 'O que é um dado sensível?',
      o: [
        'Qualquer dado que o cliente pediu para não espalhar',
        'Dado pessoal de cuidado extra, como a biometria do rosto',
        'A senha do gov.br e os códigos que chegam por SMS',
      ],
      c: 1,
      e: 'É o dado pessoal que a LGPD manda tratar com cuidado ainda maior, como saúde e biometria (o rosto usado no reconhecimento facial). Senha e código são segredos que nunca se pedem, mas não é isso que a lei chama de dado sensível.',
    },
  ],
  glossario: [
    { termo: 'LGPD', def: 'Lei Geral de Proteção de Dados Pessoais. Lei brasileira que diz como empresas podem coletar, usar, guardar e compartilhar informações sobre pessoas.' },
    { termo: 'Dado pessoal', def: 'Qualquer informação que identifica uma pessoa ou ajuda a identificá-la: nome, CPF, RG, endereço, telefone, e-mail, foto, número do benefício, extratos.' },
    { termo: 'Dado sensível', def: 'Dado pessoal que pede cuidado ainda maior, como informações de saúde e biometria (o rosto usado em reconhecimento facial, por exemplo).' },
    { termo: 'Titular dos dados', def: 'Pela LGPD, a pessoa a quem os dados se referem, e que tem direitos sobre eles. Normalmente é o cliente; na rota do familiar, é o familiar que recebe o benefício.' },
    { termo: 'Finalidade e necessidade', def: 'Dois princípios da LGPD: usar o dado só para o motivo combinado e pedir ou acessar só o mínimo necessário.' },
    { termo: 'Vazamento', def: 'Quando um dado chega a quem não devia: documento na conversa errada, print com dados de outros clientes, papel perdido. Aconteceu? Avise o gestor na hora.' },
    { termo: 'Código de verificação', def: 'Número enviado por SMS ou aplicativo para confirmar que é o dono da conta. Quem pede esse código ao cliente, quase sempre, é golpista: com ele dá para tomar a conta.' },
    { termo: 'Golpe do pagamento antecipado', def: 'Golpe em que pedem taxa, PIX ou depósito para “liberar” um valor que nunca chega. A CAF nunca pede dinheiro adiantado.' },
    { termo: 'Curatela', def: 'Decisão da Justiça que nomeia uma pessoa (o curador) para cuidar de certos atos da vida de alguém que não consegue fazer isso sozinho. Caso assim: chame o gestor.' },
  ],
  mensagens: [
    {
      titulo: 'Mensagem suspeita em nome da CAF',
      quando: 'O cliente encaminha uma mensagem que pede taxa, PIX, depósito ou código e pergunta se é de vocês.',
      texto: 'Fez muito bem em me perguntar antes, [nome do cliente]! Essa mensagem não é nossa: a CAF nunca pede taxa, PIX, depósito ou código.\n\nPor favor, não pague, não clique em nenhum link e não passe nenhum código para esse número. Vou avisar a nossa equipe. Qualquer dúvida, é só falar comigo aqui.',
    },
    {
      titulo: 'Para que usamos os seus dados',
      quando: 'O cliente pergunta por que precisamos do CPF e dos documentos, ou o que vamos fazer com eles.',
      texto: 'Ótima pergunta, [nome do cliente]! Os seus dados e documentos são usados para a sua análise e para o seu processo. É a documentação básica do procedimento, nada fora do normal.\n\nSe quiser, eu te explico para que serve cada documento antes de você mandar.',
    },
    {
      titulo: 'Pedido sobre os dados (LGPD)',
      quando: 'O titular dos dados pede para saber quais dados a CAF tem, corrigir algum dado ou apagar os dados. Não prometa nem negue: registre e passe ao gestor.',
      texto: 'Recebi o seu pedido, [nome do cliente], e anotei do jeito que você me falou. Quem responde a esse tipo de pedido é a empresa, então já passei para o meu gestor.\n\nAssim que eu tiver o retorno, te aviso aqui mesmo. Qualquer dúvida, é só falar comigo.',
    },
  ],
};
export default licao;
