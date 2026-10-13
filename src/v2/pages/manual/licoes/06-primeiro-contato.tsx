/* Lição 6 — Primeiro contato e qualificação. Os primeiros minutos depois que o
   estagiário assume a conversa: velocidade, apresentação nos dois canais (no de
   empréstimo, sempre na ordem: apresentar-se → explicar a pré-aprovada →
   pergunta aberta → pedir os extratos do Meu INSS), o roteiro de qualificação,
   perguntas abertas × fechadas, escuta ativa da dor, texto × áudio, situações
   comuns e erros clássicos. Esta lição é a DONA de "assumir a conversa"; os
   canais e o fluxo do robô estão na lição 5, a elegibilidade na lição 4.
   Fatos da empresa: só os do brief. Mensagens do atendente são sugestões de
   roteiro. Ilustrações próprias em 06-primeiro-contato-figuras.tsx. */
import type { Licao } from '../tipos';
import {
  Aviso, BomRuim, Celular, Conversa, Fatos, Frase, LinhaTempo, Lista, Passos, Sanfona, Secao, Tabela, TesteRapido,
} from '../pecas';
import {
  AbertaFechada, AnatomiaAudio, AnatomiaMensagem, AtitudesEscuta, ChecklistContato, ErrosClassicos, FichaAnotacao,
  FluxogramaRoteiro, FunilQualificacao, Iceberg, Passagem, PerguntasRoteiro, SimuladorRoteiro, Termometro,
} from './06-primeiro-contato-figuras';
import './06-primeiro-contato.css';

const corpo = (
  <>
    <p className="mv-lead">
      Quando a conversa chega até você, o robô já fez a recepção: deu as boas-vindas, perguntou se a pessoa quer a
      análise e pegou o nome e o CPF. <b>Agora a conversa é sua.</b> Os primeiros minutos depois que você assume decidem
      muita coisa: se o cliente confia em você, se ele continua respondendo e se você descobre, logo cedo, se a gente
      pode ajudar e do que ele realmente precisa. Nesta lição você vai aprender a entrar na conversa sem repetir nada, a
      se apresentar do jeito certo em cada canal, a fazer as perguntas certas na ordem certa (isso se chama
      <b> qualificar</b>), a escutar de verdade, a escolher entre texto e áudio e a fugir dos erros que mais afastam o
      cliente.
    </p>

    <Fatos itens={[
      { grande: '1ª mensagem', texto: 'Seu nome + CAF + uma pergunta. Nada de repetir o que o robô já perguntou.' },
      { grande: '4 perguntas', texto: 'O roteiro: benefício do INSS, qual benefício, financeira e o que ele quer.' },
      { grande: '1 por vez', texto: 'Uma pergunta por mensagem. Várias juntas viram formulário.' },
      { grande: '1 dor', texto: 'Descobrir o problema real do cliente e anotar com as palavras dele.' },
    ]} />

    <Secao titulo="O primeiro contato em cinco momentos">
      <p>Guarde esta sequência. O resto da lição explica cada momento em detalhe, com exemplos.</p>
      <LinhaTempo itens={[
        { quando: 'Antes de digitar', titulo: 'Ler a conversa inteira', texto: 'O que o robô (e, no canal de empréstimo, a IA) já perguntou e o que o cliente respondeu.' },
        { quando: '1ª mensagem', titulo: 'Apresentar-se e fazer a ponte', texto: 'Nome do cliente, seu nome, CAF, “já recebi seus dados” e uma pergunta.' },
        { quando: 'Qualificação', titulo: 'As perguntas do roteiro', texto: 'Benefício do INSS, qual benefício, financeira, o que ele quer. Uma por mensagem.' },
        { quando: 'Escuta', titulo: 'Descobrir a dor', texto: 'Perguntas abertas, deixar falar, repetir o que entendeu e anotar.' },
        { quando: 'Saída', titulo: 'Próximo passo combinado', texto: 'Segue para a conversa de venda (lição 7), ou encerra com carinho quem não é elegível (lição 4).' },
      ]} />
    </Secao>

    <Secao titulo="Onde você entra: o robô já começou a conversa">
      <p>
        Você nunca começa uma conversa do zero. Quando ela chega até você, <b>o robô já pediu o nome e o CPF</b>. No canal
        de empréstimo, a IA também já fez as perguntas das 3 portas, avisou que a análise foi “pré-aprovada” e mandou a
        lista de documentos. Como cada canal funciona, com as mensagens exatas do robô, você viu na lição 5.
      </p>
      <p>
        Aqui o que importa é o resultado: o que já chega na sua mão (e você não pergunta de novo) e o que fica com você.
      </p>
      <Passagem />
    </Secao>

    <Secao titulo="Por que os primeiros minutos valem tanto">
      <p>
        No momento em que você assume, o cliente acabou de fazer três coisas: viu o anúncio, respondeu SIM e mandou o
        CPF. O interesse dele está no ponto mais alto. Só que esse interesse não fica parado esperando: ele vai esfriando
        com o tempo. Em vendas, chamamos isso de <b>lead esfriando</b> (lead é a pessoa interessada que ainda não virou
        cliente).
      </p>
      <Termometro />
      <p>
        Repare também na promessa que o robô acabou de fazer: “Em alguns minutos retorno aqui com uma atualização” (canal
        de juros) ou “Em instantes um analista vai falar com você aqui mesmo” (canal de empréstimo). <b>Quem cumpre essa
        promessa é você.</b> Cumprir é a primeira prova de que a CAF é séria. Demorar atrapalha por quatro motivos:
      </p>
      <Lista itens={[
        <><b>Ele está com o celular na mão agora.</b> Daqui a pouco vai fazer o almoço, cuidar do neto, sair de casa ou dormir.</>,
        <><b>O assunto está fresco.</b> Ele lembra do anúncio, do vídeo e do que respondeu. No dia seguinte, talvez nem lembre por que mandou o CPF.</>,
        <><b>Silêncio gera desconfiança.</b> Aposentados recebem muitas mensagens de golpe. Uma empresa que pede o CPF e depois some parece suspeita.</>,
        <><b>Promessa cumprida gera confiança.</b> Se o robô disse “em instantes”, a sua resposta rápida confirma que tem gente séria do outro lado.</>,
      ]} />
      <Frase>Rápido para responder. Calmo para conversar.</Frase>
      <Aviso titulo="Rápido não é apressado">
        Velocidade é na sua resposta, não no ritmo do cliente. Responda logo, mas deixe a pessoa no tempo dela: muitos
        clientes leem devagar, digitam devagar e às vezes pedem ajuda para alguém da casa. Nunca apresse e nunca cobre
        resposta com “e aí?” ou “??”.
      </Aviso>
    </Secao>

    <Secao titulo="Como se apresentar no canal de juros abusivos">
      <p>
        A sua primeira mensagem tem um trabalho só: mostrar que agora existe <b>uma pessoa de verdade, da CAF</b>, cuidando
        do cliente, e que ninguém esqueceu o que ele já disse. No canal de juros abusivos, ela tem quatro partes:
      </p>
      <AnatomiaMensagem />
      <p>
        <b>Por que dizer o seu nome?</b> Até aqui o cliente só falou com mensagens automáticas. Quando você diz “aqui é
        [seu nome]”, ele passa a ter alguém a quem se referir (“falei com o fulano da CAF”). Gente confia em gente.
        <b> Por que dizer “CAF”?</b> Porque foi o nome que ele viu nas boas-vindas do robô (“Seja bem-vindo(a) à CAF!”).
        Se você não disser de onde fala, ele pode achar que é outra empresa, ou um golpe.
      </p>
      <p>
        <b>Senhor, senhora ou você?</b> Muitos clientes mais velhos se sentem respeitados com “o senhor” e “a senhora”.
        Comece assim e acompanhe o cliente: se ele escreve de um jeito mais solto, ou pede para ser tratado por “você”,
        siga o jeito dele. Nos exemplos desta lição você vai ver os dois.
      </p>
      <p>Antes de digitar a primeira mensagem, em qualquer canal, siga estes cinco passos:</p>
      <Passos itens={[
        { titulo: 'Leia a conversa inteira, de cima a baixo', texto: 'Inclusive as mensagens automáticas. Às vezes o cliente já contou o banco, mandou um áudio ou fez uma pergunta que ficou sem resposta.' },
        { titulo: 'Veja por qual canal ele veio', texto: 'Juros abusivos ou empréstimo. A lição 5 mostra como reconhecer cada um pelas primeiras mensagens.' },
        { titulo: 'Separe o que você já sabe', texto: 'Nome, CPF e, no canal de empréstimo, as respostas que ele deu à IA. Isso você não pergunta de novo.' },
        { titulo: 'Veja o que falta', texto: 'Das perguntas do roteiro, quais ainda estão sem resposta? É por elas que você começa.' },
        { titulo: 'Só então escreva', texto: 'No canal de juros: nome do cliente + seu nome + CAF + a ponte com o robô + uma pergunta. No de empréstimo, siga a ordem da próxima seção.' },
      ]} />
      <BomRuim
        ruim={{
          titulo: 'Repetir o que o robô já perguntou',
          corpo: (
            <div className="mv-pc-pilha">
              <div className="mv-pc-cit">“Olá! Para começar, qual é o seu nome completo? E me passa o seu CPF, por favor.”</div>
              <span className="mv-pc-obs">
                O cliente pensa: “ninguém leu o que eu mandei”. E pedir o CPF de novo, logo depois de ele mandar, pode
                parecer golpe.
              </span>
            </div>
          ),
        }}
        bom={{
          titulo: 'Continuar de onde parou',
          corpo: (
            <div className="mv-pc-pilha">
              <div className="mv-pc-cit">“Olá, Dona Maria! Aqui é [seu nome], da CAF. Já recebi seu nome e seu CPF. Pra começar: a senhora recebe algum benefício do INSS?”</div>
              <span className="mv-pc-obs">
                O cliente sente que a conversa andou. Você economiza o tempo dele e já entra na qualificação.
              </span>
            </div>
          ),
        }}
      />
      <TesteRapido
        pergunta="No canal de juros abusivos, o robô já recebeu o nome e o CPF da Dona Rosa. Qual é a melhor primeira mensagem sua?"
        opcoes={[
          '“Olá! Pra gente começar a sua análise, me diga o seu nome completo e o seu CPF.”',
          '“Dona Rosa, aqui é [seu nome], da CAF. Já recebi seus dados. A senhora recebe benefício do INSS?”',
          '“Olá, aqui é da CAF! Já pode me mandar a foto do RG e do comprovante de residência?”',
        ]}
        certa={1}
        explica="Ela já mandou nome e CPF: repetir dá a impressão de que ninguém leu. Pedir documento logo de cara é pressa. A boa primeira mensagem se apresenta, faz a ponte e começa a qualificação com uma pergunta."
      />
    </Secao>

    <Secao titulo="Como se apresentar no canal de empréstimo">
      <p>
        No canal de empréstimo o ponto de partida é outro. O cliente quer dinheiro rápido e acabou de ler, da IA, que a
        análise dele foi <b>“pré-aprovada”</b>. As perguntas das 3 portas já foram feitas: leia as respostas e não repita.
        O seu primeiro passo tem quatro partes, <b>sempre nesta ordem</b>:
      </p>
      <Passos itens={[
        { titulo: 'Apresente-se', texto: 'Seu nome + CAF. Ele acabou de falar com a IA; agora tem uma pessoa cuidando dele.' },
        { titulo: 'Explique com honestidade o que é a “pré-aprovada”', texto: 'A análise inicial passou nas primeiras perguntas; não é valor liberado. A explicação completa está na lição 5.' },
        { titulo: 'Faça uma pergunta aberta e curta', texto: '“Me conta: o que você está precisando hoje?” A resposta já começa a mostrar a dor.' },
        { titulo: 'Peça os extratos do Meu INSS', texto: 'São eles que mostram a situação de verdade. Como pegar cada extrato está na lição 10.' },
      ]} />
      <p>
        E vale a regra de sempre: <b>uma pergunta por mensagem</b>. Mande as partes em mensagens curtas e espere a resposta
        da pergunta antes de pedir os extratos. Veja como fica:
      </p>
      <Conversa
        titulo="Primeiro contato no canal de empréstimo"
        nota="Sugestão de roteiro. Adapte ao cliente."
        falas={[
          { quem: 'eu', texto: 'Olá, José! Aqui é [seu nome], da CAF, a Central de Assessoria Financeira. A partir de agora sou eu que cuido da sua análise.' },
          { quem: 'eu', texto: 'Você recebeu a mensagem de que a sua análise foi pré-aprovada. Isso quer dizer que você passou nas primeiras perguntas da análise. Ainda não é um valor liberado: para isso, eu preciso conferir a sua situação.' },
          { quem: 'eu', texto: 'Me conta: o que você está precisando hoje?' },
          { quem: 'cliente', texto: 'Preciso de um dinheiro pra pagar umas contas. As coisas tão apertadas.' },
          { quem: 'eu', texto: 'Entendi, José. Pra eu ver com segurança o que é possível no seu caso, preciso dos seus extratos do Meu INSS. Vi que você já respondeu sobre o gov.br: eu te ajudo a pegar, passo a passo. Podemos começar?' },
          { quem: 'cliente', texto: 'Pode sim.' },
        ]}
      />
      <p>
        Repare: nenhuma pergunta da IA foi repetida (nem a do gov.br), nenhum valor foi prometido, cada mensagem tem no
        máximo uma pergunta, e a resposta do José (“as coisas tão apertadas”) já é uma pista da dor, que você anota.
      </p>
      <Aviso tom="ambar" titulo="“Pré-aprovada” não é dinheiro liberado">
        Nunca confirme valor nem prometa que o dinheiro vai sair. Se os extratos mostrarem que hoje não há margem, a
        lição 7 mostra como apresentar os caminhos, sempre como possibilidade. Se o cliente reclamar do “pré-aprovada”,
        a resposta está na lição 8.
      </Aviso>
    </Secao>

    <Secao titulo="O roteiro de qualificação">
      <p>
        Qualificar é descobrir, logo no começo, duas coisas: <b>se a gente pode ajudar</b> essa pessoa (ela é elegível?) e
        <b> do que ela precisa</b>. São poucas perguntas, sempre na mesma ordem e uma de cada vez. A ordem não é por acaso:
        primeiro vêm as que decidem se dá para seguir (assim ninguém perde tempo), depois as que mostram o caminho da
        conversa. As regras de quem é elegível (as 3 portas) estão na lição 4; aqui você aprende a perguntar.
      </p>
      <p>Pense num funil: entra todo mundo que chamou, e a cada pergunta fica mais claro quem pode seguir e o que cada um precisa.</p>
      <FunilQualificacao />
      <p>Agora, as perguntas uma por uma, com o porquê de cada uma e o que fazer quando a resposta é “não”:</p>
      <PerguntasRoteiro />
      <p>
        <b>A rota do familiar.</b> Se a pessoa não recebe nenhum benefício, pergunte se alguém da família recebe (pai, mãe,
        avó, avô ou filho). Se recebe, a análise segue pelo benefício do familiar, e os documentos (Meu INSS, imposto de
        renda, CPF, identidade, foto do rosto, comprovante e e-mail) passam a ser dele; na dúvida, pergunte ao gestor. Os
        detalhes estão na lição 4.
      </p>
      <p>
        Abaixo, o roteiro inteiro como um mapa. É o mesmo caminho que a IA segue no canal de empréstimo; por isso, quando
        a conversa vem de lá, as perguntas de elegibilidade já estão respondidas.
      </p>
      <FluxogramaRoteiro />
      <p>
        Agora treine. No simulador, você escolhe o que o cliente respondeu e vê o próximo passo, a sugestão do que
        escrever e a sua anotação sendo preenchida ao lado.
      </p>
      <SimuladorRoteiro />
      <Aviso tom="rubro" titulo="Não elegível: agradeça e não insista">
        Se ninguém recebe do INSS (nem a pessoa nem um familiar), ou se o empréstimo não é em nenhuma das 5 financeiras,
        agradeça com carinho e encerre, sem insistir. Como encerrar bem, com a mensagem pronta, está na lição 4.
      </Aviso>
      <TesteRapido
        pergunta="Dona Neusa respondeu de uma vez: “Sou pensionista e tenho empréstimo no BMG e no Agibank.” Qual é a sua próxima pergunta?"
        opcoes={[
          '“A senhora recebe algum benefício do INSS?”',
          '“E qual é o banco do seu empréstimo consignado?”',
          '“E o que a senhora está buscando hoje?”',
        ]}
        certa={2}
        explica="Ela já respondeu as perguntas 1, 2 e 3 numa mensagem só. Perguntar de novo mostra que você não leu. Siga o roteiro a partir do que falta: o que ela quer."
      />
    </Secao>

    <Secao titulo="Perguntas fechadas e perguntas abertas">
      <p>
        Repare que as perguntas do roteiro têm dois formatos. Saber a diferença é o que separa um interrogatório de uma
        boa conversa.
      </p>
      <AbertaFechada />
      <Frase>Pergunta fechada confirma fatos. Pergunta aberta descobre a dor.</Frase>
      <p>
        Na prática: use <b>fechadas</b> nas portas do roteiro (benefício, financeira), porque ali você precisa de uma
        resposta clara. E use <b>abertas</b> assim que as portas estiverem abertas, para a pessoa contar a história dela.
        Uma conversa só de fechadas parece um formulário; uma conversa só de abertas não anda, e você não confirma o que
        precisa. Mais uma dica: pergunta aberta boa é <b>curta</b>. “Me conta como está?” funciona muito melhor do que
        “O senhor poderia me descrever detalhadamente a sua situação financeira atual?”.
      </p>
    </Secao>

    <Secao titulo="Escuta ativa: descobrir a dor">
      <p>
        Até aqui você descobriu <b>se</b> pode ajudar. Agora vem a parte que faz a venda acontecer depois: descobrir
        <b> por que</b> o cliente quer ajuda. A gente chama isso de <b>dor</b>.
      </p>
      <p>
        Ninguém procura revisão de juros porque acha juros um assunto interessante. A pessoa procura porque o desconto
        está alto, porque o dinheiro não sobra no fim do mês, porque está com dívidas. O que ela fala primeiro (“quero
        revisar”, “quero um empréstimo”) é só a ponta do iceberg.
      </p>
      <Iceberg />
      <p>
        Quando você sabe qual é a dor, a sua explicação deixa de ser genérica. Em vez de “a gente faz revisão de juros”,
        você diz: “a senhora me contou que no fim do mês não sobra nada; é justamente por isso que vale a pena olhar esses
        descontos com calma”. O cliente sente que foi ouvido, e quem se sente ouvido confia. Escutar bem tem quatro
        atitudes:
      </p>
      <AtitudesEscuta />
      <Conversa
        titulo="Escuta ativa na prática"
        nota="Repare: o atendente deixa falar, repete, valida e só depois pergunta."
        falas={[
          { quem: 'cliente', texto: 'Olha, eu tenho uns três empréstimos, nem sei mais direito. Todo mês vem menos e eu tô devendo a farmácia.' },
          { quem: 'eu', texto: 'Entendi, Dona Cida. Então hoje o benefício chega bem menor por causa dos descontos, e isso está fazendo falta até para a farmácia. É isso?' },
          { quem: 'cliente', texto: 'É isso mesmo, minha filha.' },
          { quem: 'eu', texto: 'Imagino como isso aperta. Pode ficar tranquila: eu vou olhar tudo com calma junto com a senhora.' },
          { quem: 'eu', texto: 'A senhora lembra em quais bancos são esses empréstimos?' },
          { quem: 'cliente', texto: 'Um é do BMG, o outro do Agibank. O terceiro eu não lembro.' },
        ]}
      />
      <p>
        E tudo isso vai para a anotação. Uma boa anotação responde às perguntas do roteiro e guarda a dor com as palavras
        do próprio cliente:
      </p>
      <FichaAnotacao />
      <Aviso tom="ambar" titulo="Escutar é para ajudar, não para pressionar">
        Nunca aumente o problema do cliente para assustar, nem diga que o processo resolve tudo. Use a dor para explicar
        com clareza por que a análise faz sentido para ele. Prometer resultado é proibido: fale sempre em possibilidade e
        em análise.
      </Aviso>
    </Secao>

    <Secao titulo="Texto ou áudio?">
      <p>
        No WhatsApp você pode escrever ou gravar. Os dois funcionam; o segredo é usar cada um na hora certa. <b>O áudio
        aproxima:</b> o cliente ouve uma voz calma, de gente de verdade, e muitos preferem ouvir a ler. <b>O texto
        organiza:</b> fica guardado, dá para reler, copiar e mostrar para a família.
      </p>
      <Tabela
        colunas={['Situação', 'Melhor usar', 'Por quê']}
        destaque={1}
        linhas={[
          ['O cliente mandou áudio', 'Áudio', 'Ele mostrou que prefere falar. Responder do mesmo jeito aproxima.'],
          ['O cliente tem dificuldade para ler ou escrever', 'Áudio', 'Ouvir é mais fácil do que ler um texto comprido.'],
          ['Explicar algo que ficaria longo por escrito', 'Áudio + resumo escrito', 'A voz explica com calma; o resumo fica guardado para ele reler.'],
          ['Lista de documentos, nomes de bancos, datas', 'Texto', 'É informação que ele vai consultar depois. Áudio não dá para copiar.'],
          ['A primeira mensagem, quando você assume', 'Texto', 'É rápida de ler e deixa o seu nome e a CAF por escrito.'],
          ['O cliente avisou que não pode ouvir agora', 'Texto', 'No trabalho, no ônibus, na igreja: respeite e deixe o áudio para depois.'],
        ]}
      />
      <p>Quando for gravar, um bom áudio tem quatro partes, nesta ordem:</p>
      <AnatomiaAudio />
      <p>E alguns cuidados com a voz:</p>
      <Lista itens={[
        'Grave num lugar silencioso, sem barulho de fundo nem conversa de colegas.',
        'Fale devagar, com frases curtas, como numa conversa. Não leia um texto com voz de robô.',
        'Uma ideia por áudio. Se o assunto é grande, divida em partes e confira se ele entendeu.',
        'Sem jargão: use as mesmas palavras simples que você usaria por escrito.',
        'Termine com uma pergunta, para o cliente saber o que responder.',
        'Ouça antes de enviar. Saiu ruim? Apague e grave de novo.',
      ]} />
      <Aviso tom="verde" titulo="Depois do áudio, o resumo por escrito">
        Falou de algo que o cliente vai precisar lembrar (um nome de documento, um próximo passo, um horário combinado)?
        Mande logo depois uma mensagem curta por escrito. Ele ouve uma vez e consulta quantas vezes quiser.
      </Aviso>
      <TesteRapido
        pergunta="A cliente mandou um áudio comprido contando que tem empréstimos no BMG e no Mercantil e que o dinheiro não está dando. O que você faz?"
        opcoes={[
          'Responde com a primeira pergunta do roteiro, como faz com qualquer cliente',
          'Pede para ela mandar por escrito, porque texto é mais fácil de conferir',
          'Ouve tudo, resume o que ela contou e pergunta só o que ainda falta',
        ]}
        certa={2}
        explica="Ouvir tudo e devolver um resumo mostra respeito e evita perguntar o que ela já contou. Depois você segue o roteiro só com o que falta (por exemplo, confirmar o benefício)."
      />
    </Secao>

    <Secao titulo="Situações que vão aparecer">
      <p>Algumas situações se repetem muito no primeiro contato. Toque em cada uma para ver como conduzir.</p>
      <Sanfona itens={[
        {
          titulo: 'O cliente mandou um áudio longo',
          corpo: (
            <div className="mv-pc-pilha">
              <p>
                Áudio longo é um ótimo sinal: o cliente está confiando em você e contando a história dele. O erro é
                responder sem ouvir até o fim, ou responder com o roteiro como se ele não tivesse falado nada.
              </p>
              <Lista itens={[
                'Ouça até o fim, de preferência de fone. A informação mais importante às vezes está no final.',
                'Anote enquanto ouve: benefício, bancos, o que ele quer e, principalmente, a dor.',
                'Responda primeiro ao que ele perguntou. Depois volte ao roteiro.',
                'Mostre que ouviu: resuma em uma ou duas frases e pergunte “é isso mesmo?”.',
                'Não pergunte o que ele já contou. Se ele disse que é aposentado, não pergunte se recebe benefício.',
              ]} />
            </div>
          ),
        },
        {
          titulo: 'O cliente não sabe o nome do banco',
          corpo: (
            <div className="mv-pc-pilha">
              <p>
                É muito comum: às vezes foi um filho ou neto que fez o empréstimo, ou foram vários ao longo dos anos. Não
                trate isso como problema, nem como um “não”.
              </p>
              <Passos itens={[
                { titulo: 'Pergunte de novo, uma vez só, citando as 5', texto: '“Aparece algum desconto de Agibank, BMG, Facta, Mercantil ou Crefisa no benefício?” Ouvir os nomes ajuda a lembrar.' },
                { titulo: 'Sugira onde olhar', texto: 'Se ele tiver por perto o papel do contrato ou o extrato do benefício (o “contracheque” do INSS), às vezes o nome do banco aparece ali.' },
                { titulo: 'Continuou sem saber? Siga em frente', texto: 'Mais adiante, o Extrato de Empréstimo Consignado, que você vai pegar no Meu INSS, mostra cada contrato com o nome do banco.' },
              ]} />
              <Celular
                contato="Seu Antônio"
                sub="cliente · exemplo"
                legenda="Não saber o banco não é um “não”."
                bolhas={[
                  { de: 'eu', texto: 'E o senhor tem empréstimo em algum destes bancos: Agibank, BMG, Facta, Mercantil ou Crefisa?', hora: '10:12' },
                  { de: 'cliente', texto: 'Ih, não sei não. Foi meu neto que fez pra mim.', hora: '10:15' },
                  { de: 'eu', texto: 'Sem problema, isso é bem comum! Aparece algum desconto de Agibank, BMG, Facta, Mercantil ou Crefisa no benefício?', hora: '10:15' },
                  { de: 'cliente', texto: 'Acho que tem um do Mercantil… mas não tenho certeza.', hora: '10:18' },
                  { de: 'eu', texto: 'Já ajuda muito! Quando a gente pegar o extrato de empréstimos no Meu INSS, lá aparece cada contrato com o nome do banco. Vamos seguir?', hora: '10:19' },
                ]}
              />
            </div>
          ),
        },
        {
          titulo: 'O cliente está com a família (ou é um familiar quem escreve)',
          corpo: (
            <div className="mv-pc-pilha">
              <p>
                Família por perto costuma ajudar: alguém mais jovem ajuda com o celular, com o Meu INSS e com os
                documentos. Trate todos com o mesmo carinho e descubra logo de quem é o benefício.
              </p>
              <Lista itens={[
                'Pergunte com calma: “O benefício é seu ou de quem você está ajudando?”',
                'Se o benefício é do pai, da mãe ou da avó, a análise segue pelo benefício dele(a). Os documentos (Meu INSS, imposto de renda, CPF, identidade, foto do rosto, comprovante e e-mail) passam a ser dele(a). Na dúvida, pergunte ao gestor.',
                'A decisão e os dados são de quem recebe o benefício. Se ele estiver por perto, convide: “Pode mostrar esta mensagem para a sua mãe?”',
                'Família junto na hora? Aproveite: explique com calma para todos. Quem ajuda com o celular pode ser um grande aliado nos próximos passos.',
                'Se o cliente diz “vou ver com o meu filho”, isso é bom: ofereça explicar para os dois juntos e combine quando retomar.',
              ]} />
            </div>
          ),
        },
        {
          titulo: 'O cliente responde só “sim”, “ok” ou com uma figurinha',
          corpo: (
            <div className="mv-pc-pilha">
              <p>Quase nunca é falta de interesse: muita gente tem dificuldade para digitar. Facilite.</p>
              <Lista itens={[
                'Faça perguntas fáceis de responder, uma de cada vez.',
                'Ofereça opções curtas: “É aposentadoria ou pensão?”',
                'Se ele já mandou áudio antes, responda em áudio: talvez seja mais fácil para ele.',
                'Nunca mande um textão para compensar.',
              ]} />
            </div>
          ),
        },
        {
          titulo: 'O cliente desconfia (“isso é golpe?”)',
          corpo: (
            <p>
              Desconfiar é saudável: mostra que ele se cuida. Não se ofenda e não fique na defensiva. Reforce quem você é
              (o seu nome e a CAF), lembre que ele não paga nada para começar e convide alguém de confiança da família para
              acompanhar a conversa. A lição 8, de objeções, aprofunda esse assunto.
            </p>
          ),
        },
        {
          titulo: 'A pessoa não é elegível',
          corpo: (
            <p>
              Ninguém recebe do INSS (nem um familiar), ou o empréstimo não é em nenhuma das 5 financeiras. Agradeça com
              carinho, explique em uma frase e encerre, sem insistir. A lição 4 mostra como, com a mensagem pronta.
            </p>
          ),
        },
      ]} />
    </Secao>

    <Secao titulo="Os erros clássicos">
      <p>
        Quatro erros aparecem o tempo todo com quem está começando. Todos têm a mesma raiz: pensar mais no roteiro do que
        na pessoa do outro lado. Toque em cada um para ver o erro e o conserto, lado a lado.
      </p>
      <ErrosClassicos />
      <p>
        O jargão merece atenção a mais: são palavras que a gente usa todo dia aqui dentro e que o cliente não conhece. Use
        este “tradutor”:
      </p>
      <Tabela
        colunas={['Evite dizer', 'Diga assim']}
        linhas={[
          ['Margem consignável', '“A parte do seu benefício que pode ser usada para descontar empréstimo e cartão consignado.”'],
          ['RMC / RCC', '“Cartão consignado, aquele que desconta direto no benefício.”'],
          ['Portabilidade', '“Levar o seu empréstimo para outro banco.”'],
          ['Espécie do benefício', '“Qual é o seu benefício: aposentadoria, pensão…?”'],
          ['Contrato averbado', '“O empréstimo que aparece descontando no seu benefício.”'],
          ['Honorários', '“A parte do advogado, que só sai no final.”'],
          ['Histórico de Créditos (HISCRE)', '“O extrato que mostra quanto o INSS te pagou, mês a mês.”'],
          ['Lead, qualificar, elegível', 'Palavras de dentro da empresa: nunca use com o cliente.'],
        ]}
      />
    </Secao>

    <Secao titulo="Checklist do primeiro contato">
      <p>
        Use nas suas primeiras conversas: marque cada item conforme for fazendo. Com o tempo, tudo isso vira hábito e você
        nem vai precisar mais da lista.
      </p>
      <ChecklistContato />
    </Secao>

    <Secao titulo="Resumo da lição">
      <Lista itens={[
        <>Você entra <b>onde o robô parou</b>: leia a conversa inteira e não repita o que já foi perguntado. Responda <b>rápido</b>, porque o interesse esfria; depois, calma para conversar.</>,
        <>No canal de juros: <b>o seu nome + CAF</b>, a ponte com o robô (“já recebi seus dados”) e uma pergunta só.</>,
        <>No canal de empréstimo, sempre nesta ordem: <b>apresentar-se</b> → explicar que <b>“pré-aprovada” não é valor liberado</b> → <b>uma pergunta aberta curta</b> → <b>pedir os extratos do Meu INSS</b>.</>,
        <>Roteiro: <b>benefício do INSS</b> (ou de um familiar) → <b>qual benefício</b> → empréstimo em <b>Agibank, BMG, Facta, Mercantil ou Crefisa</b> → <b>o que ele quer</b>. Uma pergunta por mensagem.</>,
        <>Perguntas fechadas confirmam fatos; abertas descobrem a <b>dor</b>. Deixe terminar, repita, valide e anote.</>,
        <>Texto para o que precisa ficar guardado; áudio curto para aproximar. Fuja da <b>pressa</b>, do <b>jargão</b>, da <b>mensagem gigante</b> e de <b>perguntar tudo de uma vez</b>.</>,
      ]} />
    </Secao>
  </>
);

const licao: Licao = {
  id: 'primeiro-contato',
  modulo: 'venda',
  titulo: 'Primeiro contato e qualificação',
  resumo: 'Os primeiros minutos depois que você assume: a apresentação em cada canal, o roteiro de qualificação, a escuta da dor, texto ou áudio e os erros que afastam o cliente.',
  minutos: 35,
  corpo,
  questoes: [
    {
      p: 'Você assumiu uma conversa do canal de juros abusivos. Por que não pedir de novo o nome e o CPF?',
      o: [
        'Porque o robô já pegou, e repetir faz parecer que ninguém leu',
        'Porque pedir o CPF pelo WhatsApp é proibido pela LGPD',
        'Porque você confere nome e CPF sozinho, no extrato do Meu INSS',
      ],
      c: 0,
      e: 'O robô já pegou nome e CPF. Repetir faz parecer que ninguém leu a conversa e, logo depois de o cliente mandar o CPF, pode até parecer golpe.',
    },
    {
      p: 'A IA do canal de empréstimo passou a conversa para você. Qual é a ordem certa do seu primeiro passo?',
      o: [
        'Pedir os extratos do Meu INSS, apresentar-se e só depois perguntar o que ele quer',
        'Apresentar-se, confirmar o valor pré-aprovado e pedir os documentos pessoais',
        'Apresentar-se, explicar a pré-aprovada, perguntar o que precisa e pedir os extratos',
      ],
      c: 2,
      e: 'Apresente-se, explique que “pré-aprovada” não é valor liberado, faça uma pergunta aberta curta e então peça os extratos do Meu INSS. Nunca confirme valor.',
    },
    {
      p: 'Qual destas é uma pergunta aberta, boa para descobrir a dor do cliente?',
      o: [
        '“O senhor é aposentado ou pensionista?”',
        '“Como os descontos pesam no seu mês?”',
        '“O seu empréstimo é no BMG ou no Agibank?”',
      ],
      c: 1,
      e: 'Pergunta aberta convida a pessoa a contar com as palavras dela. As outras duas são fechadas: servem para confirmar fatos.',
    },
    {
      p: 'Você precisa saber o benefício, o banco e o que o cliente quer. Como fazer essas perguntas?',
      o: [
        'Uma pergunta por mensagem, e a próxima só depois da resposta',
        'Tudo numa mensagem só, numerado, para ele responder de uma vez',
        'Num áudio só, com as três perguntas de uma vez',
      ],
      c: 0,
      e: 'Várias perguntas juntas, por escrito ou em áudio, fazem o cliente responder só uma, e as outras se perdem. Uma pergunta por mensagem vira conversa.',
    },
    {
      p: 'O cliente não sabe dizer em qual banco é o empréstimo. Pelo roteiro, o que fazer?',
      o: [
        'Encerrar como não elegível, com carinho e sem insistir',
        'Perguntar de novo uma vez, citando as 5, e depois seguir',
        'Pedir que ele ligue para o banco e volte com o nome certo',
      ],
      c: 1,
      e: 'Não saber o banco não é um “não”. Pergunte mais uma vez citando Agibank, BMG, Facta, Mercantil e Crefisa; se seguir sem saber, siga em frente: o Meu INSS vai mostrar os contratos.',
    },
  ],
  glossario: [
    { termo: 'Qualificação', def: 'As perguntas do começo do atendimento que mostram se a pessoa pode ser atendida e do que ela precisa: benefício do INSS, qual benefício, financeira e o que ela quer. Uma pergunta por mensagem.' },
    { termo: 'Pergunta fechada', def: 'Pergunta com resposta curta: sim, não ou uma escolha entre opções. Boa para confirmar fatos.' },
    { termo: 'Pergunta aberta', def: 'Pergunta que convida a pessoa a contar com as palavras dela. Boa para descobrir a dor e o que ela quer.' },
    { termo: 'Escuta ativa', def: 'Ouvir com atenção: deixar a pessoa terminar, repetir o que entendeu, validar o que ela sente e anotar. Mostra que ela foi ouvida e evita perguntar de novo.' },
    { termo: 'Dor do cliente', def: 'O problema real que faz a pessoa querer ajuda, como desconto alto, dinheiro que não sobra no fim do mês ou dívidas.' },
    { termo: 'Jargão', def: 'Palavra técnica da nossa área (margem consignável, RMC, portabilidade, averbação). Com o cliente, troque por palavras simples.' },
  ],
  mensagens: [
    {
      titulo: 'Apresentação no canal de juros abusivos',
      quando: 'Assim que você assumir a conversa, depois do “Recebido” do robô.',
      texto: 'Olá, [nome do cliente]! Aqui é [seu nome], da CAF, a Central de Assessoria Financeira. 😊\n\nJá recebi seu nome e seu CPF, não precisa mandar de novo. A partir de agora sou eu que vou acompanhar a sua análise.\n\nPra começar, me conta: você recebe algum benefício do INSS? Pode ser aposentadoria, pensão, auxílio ou BPC/LOAS.',
    },
    {
      titulo: 'Apresentação no canal de empréstimo',
      quando: 'Quando a IA passar a conversa para você, depois da “pré-aprovada” e da lista de documentos. Tem uma pergunta só. Se preferir, mande em partes, como no exemplo da lição 6, e peça os extratos depois da resposta.',
      texto: 'Olá, [nome do cliente]! Aqui é [seu nome], da CAF, a Central de Assessoria Financeira. A partir de agora sou eu que cuido da sua análise.\n\nSobre a mensagem de “pré-aprovada”: ela quer dizer que você passou nas primeiras perguntas da análise. Ainda não é um valor liberado.\n\nMe conta: o que você está precisando hoje?\n\nPara conferir a sua situação com segurança, vou precisar dos seus extratos do Meu INSS. Pode deixar que eu te ajudo a pegar, passo a passo.',
    },
    {
      titulo: 'Depois de um áudio longo',
      quando: 'O cliente contou a história dele num áudio comprido. Ouça tudo antes.',
      texto: 'Ouvi seu áudio todinho, [nome do cliente], obrigado(a) por me explicar com calma.\n\nDeixa eu ver se entendi: [resuma em uma ou duas frases o que ele contou].\n\nÉ isso mesmo?',
    },
  ],
};
export default licao;
