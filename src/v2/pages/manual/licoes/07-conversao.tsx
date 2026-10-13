/* Lição 7 — Como converter o cliente. A estratégia de conversão: o que é
   converter (e o que não é), o mapa da venda, o funil em cinco degraus, a escada
   da confiança, os cinco princípios, a matriz canal × abordagem, a venda direta
   do canal de juros, o pivô honesto do canal de empréstimo, o momento dos 30%
   (a regra completa é da lição 2), o pedido de documentos sem susto, os gatilhos
   honestos, os sinais de compra e de dúvida e o fechamento (do "sim" à ação).
   Correção do dono (13/10): o processo revisa os juros do EMPRÉSTIMO PESSOAL
   (cobrado pela financeira, fora do INSS), não o consignado. O consignado é o
   assunto dos ganchos do canal de empréstimo (margem, aumento de margem,
   portabilidade). A aula completa da diferença é a lição 3.
   Fatos da empresa: só os do brief (áudio do dono de 13/10 + processo oficial do
   robô) e da correção. Roteiros do atendente = sugestões. Ilustrações em
   07-conversao-figuras.tsx. */
import type { Licao } from '../tipos';
import {
  Aviso, BomRuim, Celular, Conversa, Fatos, Frase, LinhaTempo, Lista, Passos, Sanfona, Secao, Tabela, TesteRapido,
} from '../pecas';
import { MapaMental } from '../ilustracoes';
import {
  BlocosDocumentos, ClassificarGatilhos, DezReais, DoisEmprestimos, EscadaConfianca, FechamentoAnotado, FunilVenda,
  GatilhosPainel, MatrizCanal, OrdenarPivo, PivoEmprestimo, Principios, QuatroFrases, TradutorSimples,
} from './07-conversao-figuras';
import './07-conversao.css';

/* Selo de sinal usado na tabela de sinais de compra e de dúvida. */
function Sinal({ tipo }: { tipo: 'compra' | 'duvida' }) {
  return <span className="mv-cv-sinal" data-tipo={tipo}>{tipo === 'compra' ? 'Compra' : 'Dúvida'}</span>;
}

const corpo = (
  <>
    <p className="mv-lead">
      Você já sabe quem é o nosso cliente, de onde ele vem e como fazer o primeiro contato. Agora vem a parte que
      transforma uma conversa em um processo de verdade: <b>converter</b>. Converter é levar o cliente da primeira
      mensagem até o “vamos fazer”, e do “vamos fazer” até a <b>ação</b>, que é o primeiro documento chegando. Nesta
      lição você vai aprender a estratégia inteira: o mapa da venda, os cinco degraus do funil, como construir confiança,
      qual empréstimo é assunto de quê na conversa (o consignado e o empréstimo pessoal), como a conversa muda em cada
      canal (com roteiros completos), a hora certa de falar dos 30%, como pedir os documentos sem assustar, o que é um
      gatilho honesto e como reconhecer a hora de fechar.
    </p>

    <Fatos itens={[
      { grande: '5 degraus', texto: 'Atenção, confiança, entendimento, decisão e documentos. Um de cada vez, nessa ordem.' },
      { grande: '2 abordagens', texto: 'Canal de juros abusivos: venda direta. Canal de empréstimo: o pivô honesto.' },
      { grande: '3 caminhos', texto: 'Aumento de margem e portabilidade (do consignado) e a revisão do empréstimo pessoal. Sempre como possibilidade.' },
      { grande: '1 regra', texto: 'Toda conversa termina com um próximo passo combinado.' },
    ]} />

    {/* ------------------------------------------------------------------ o que é converter */}
    <Secao titulo="O que é converter (e o que não é)">
      <p>
        Muita gente acha que vender é “empurrar” um produto. No nosso trabalho é o contrário. O cliente recebe benefício
        do INSS (na maioria, aposentado ou pensionista) e muitas vezes é uma pessoa idosa, desconfiada (com razão, porque
        golpe existe) e com pouca prática com aplicativo. Se você empurra, ele trava. Se você ajuda, ele anda.
      </p>
      <p>
        Converter, aqui, quer dizer três coisas ao mesmo tempo: <b>ajudar o cliente a entender</b> o que a CAF faz,
        <b> ajudar o cliente a decidir</b> com informação verdadeira e <b>tornar o primeiro passo fácil</b>. Quando as três
        acontecem, o “sim” vem naturalmente, e é um “sim” que dura até o fim do processo, que leva em média de 6 a 12 meses.
      </p>
      <BomRuim
        ruim={{
          titulo: 'Empurrar',
          corpo: (
            <Lista tom="nao" itens={[
              'Falar mais do que escutar',
              'Prometer valor para “animar” o cliente',
              'Inventar pressa: “é só até hoje”',
              'Esconder os 30% até o fim',
              'Pedir todos os documentos de uma vez e sumir',
            ]} />
          ),
        }}
        bom={{
          titulo: 'Converter',
          corpo: (
            <Lista tom="sim" itens={[
              'Escutar a dor antes de explicar',
              'Explicar simples, com a verdade inteira',
              'Mostrar o que o cliente ganha e por que é seguro',
              'Falar dos 30% cedo e com naturalidade',
              'Dar um primeiro passo pequeno e fazer junto',
            ]} />
          ),
        }}
      />
      <p>
        Por que isso importa tanto? Porque o “sim” do WhatsApp é só o começo. Depois dele o cliente ainda vai precisar
        buscar documentos no Meu INSS e no gov.br, mandar documentos pessoais e assinar as procurações. Cliente empurrado
        diz “sim” e some na primeira dificuldade. Cliente convencido com verdade vai até o fim, porque sabe o que está
        fazendo e confia em quem está do outro lado.
      </p>
      <Frase>Converter não é empurrar. É ajudar a pessoa a decidir com a verdade e tornar o primeiro passo fácil.</Frase>
    </Secao>

    {/* ------------------------------------------------------------------ mapa mental */}
    <Secao titulo="O mapa da venda">
      <p>
        Antes de entrar nos detalhes, olhe a venda inteira de cima. Este mapa mostra tudo o que gira em torno de uma
        conversa de venda. Volte nele sempre que se sentir perdido numa conversa: ele responde “onde eu estou?” e “o que
        vem agora?”.
      </p>
      <div className="mv-cv-mapa"><MapaMental /></div>
      <div className="mv-cv-mapa-leg">
        <div><b>Perfil</b><span>Quem a gente atende.</span></div>
        <div><b>Canal</b><span>De onde veio: muda a abordagem.</span></div>
        <div><b>Objeções</b><span>Dúvidas e medos do cliente.</span></div>
        <div><b>Ganchos</b><span>Saídas para quem está sem margem.</span></div>
        <div><b>Documentos</b><span>Onde o “sim” vira ação.</span></div>
        <div><b>Fechamento</b><span>Cadastro, procurações e assinatura.</span></div>
      </div>
      <p>
        Esta lição cuida do miolo do mapa: <b>canal</b>, <b>ganchos</b> e a passagem para os <b>documentos</b>. O perfil você
        viu na lição 4, as objeções ficam para a lição 8 e o fechamento burocrático (cadastro, procurações, assinatura)
        está na lição 13.
      </p>
    </Secao>

    {/* ------------------------------------------------------------------ funil */}
    <Secao titulo="O funil da venda: cinco degraus">
      <p>
        Toda conversa que termina em processo passa pelos mesmos cinco degraus. Chamamos de <b>funil</b> porque ele começa
        largo e vai afinando: muita gente presta atenção, menos gente confia, menos ainda entende e decide, e quem chega ao
        fim manda os documentos. Isso é normal. Nem todo mundo é elegível, e nem todo mundo quer, e tudo bem: quem não
        segue, a gente agradece com carinho e não insiste.
      </p>
      <FunilVenda />
      <p>
        <b>Por que a ordem importa?</b> Porque cada degrau só se sustenta em cima do anterior. Pedir documento (degrau 5)
        para quem ainda não confia (degrau 2) é o erro mais comum de quem está começando: o cliente sente que está sendo
        apressado e some. Da mesma forma, explicar o processo inteiro (degrau 3) antes de escutar a dor do cliente faz a
        explicação soar como propaganda.
      </p>
      <p>
        Uma dica prática: quando a conversa travar, pergunte a si mesmo <b>“em que degrau este cliente está?”</b>. Se ele
        pergunta “isso é golpe?”, ele está no degrau da confiança, e não adianta mandar a lista de documentos. Se ele
        pergunta “quanto tempo demora?”, ele está entendendo e já se imagina dentro do processo. Responda o degrau em que
        ele está, e não o degrau em que você gostaria que ele estivesse.
      </p>
      <TesteRapido
        pergunta="A cliente escreve: “Mas isso não é golpe, não?”. Em que degrau do funil ela está?"
        opcoes={['Confiança', 'Documentos', 'Atenção']}
        certa={0}
        explica="Desconfiança é sinal do degrau da confiança. Antes de seguir, mostre a segurança: nada é pago antes, quem cuida é o advogado e a assinatura é pelo gov.br."
      />
    </Secao>

    {/* ------------------------------------------------------------------ confiança */}
    <Secao titulo="A escada da confiança">
      <p>
        De todos os degraus, a confiança é o que mais pesa. O cliente vai falar dos empréstimos dele, mandar documentos e,
        às vezes, contar dificuldades da vida. Ninguém faz isso com quem não confia. E a confiança não nasce de uma frase
        bonita: ela é construída por <b>atitudes</b>, uma em cima da outra, como uma escada.
      </p>
      <EscadaConfianca />
      <p>
        Repare no último degrau: <b>cumprir o que diz</b>. Se você falou “volto em 10 minutos”, volte em 10 minutos. Se
        combinou de chamar amanhã cedo, chame amanhã cedo. Para o cliente, cada promessa pequena cumprida é a prova de que
        as promessas grandes (como “não precisa pagar nada para começar”) também são verdade.
      </p>
      <p>
        Existe uma palavra para a sensação de “essa pessoa está na mesma sintonia que eu”: <b>rapport</b> (lê-se
        “rapór”). É quando o cliente sente que fala com alguém que escuta, entende e respeita. Rapport se faz com coisas
        simples: chamar pelo nome, responder o que ele perguntou antes de fazer a sua pergunta, seguir o ritmo dele (se ele
        escreve curto, escreva curto; se ele manda áudio, um áudio curto de volta pode aproximar) e mostrar que você
        lembrou do que ele contou.
      </p>
      <Aviso tom="verde" titulo="Rapport não é intimidade">
        Seja caloroso sem ser íntimo demais. “O senhor” ou “a senhora” costuma soar respeitoso com o cliente mais velho; se
        ele preferir “você”, siga o jeito dele. Evite apelidos, gírias e brincadeiras que ele não começou.
      </Aviso>
    </Secao>

    {/* ------------------------------------------------------------------ princípios */}
    <Secao titulo="Os cinco princípios da conversão">
      <p>
        Tudo o que vem a seguir (roteiros, respostas, fechamento) sai destes cinco princípios. Se um dia você estiver numa
        situação que o manual não cobre, volte a eles: quase sempre a resposta certa respeita os cinco ao mesmo tempo.
      </p>
      <Principios />
      <p>
        O segundo princípio, <b>explicar simples</b>, merece um treino à parte. O nosso dia a dia é cheio de palavras
        técnicas (ressarcimento, margem consignável, portabilidade, procuração), e elas fazem o cliente se sentir de fora.
        A regra é: se a sua avó não entenderia, traduza. Treine com o tradutor abaixo.
      </p>
      <TradutorSimples />
    </Secao>

    {/* ------------------------------------------------------------------ consignado × pessoal */}
    <Secao titulo="Consignado ou empréstimo pessoal: quem é quem na venda">
      <p>
        Antes de ver os dois canais, acerte uma coisa que muda a conversa inteira: o aposentado pode ter <b>dois tipos de
        empréstimo</b>, e cada um tem um papel diferente na venda. O <b>consignado</b> é descontado pelo INSS direto do
        benefício e depende de margem. O <b>empréstimo pessoal</b> é um contrato direto com a financeira, cobrado fora do
        INSS. <b>O nosso processo olha os juros do empréstimo pessoal</b>, que o cliente fez com Agibank, BMG, Facta,
        Mercantil ou Crefisa. A aula completa da diferença está na lição 3; aqui, o que importa é onde cada um entra na
        conversa.
      </p>
      <DoisEmprestimos />
      <p>
        Na prática, é simples: quando o assunto é <b>margem</b>, <b>aumento de margem</b> ou <b>portabilidade</b>, você
        está falando do consignado. Quando o assunto é a <b>revisão dos juros</b> e o <b>ressarcimento</b>, você está
        falando do empréstimo pessoal. Misturar os dois (por exemplo, dizer “vamos revisar os juros do seu consignado”)
        confunde o cliente e passa uma informação errada. E cuidado com o nome do banco: o BMG, por exemplo, também tem
        consignado e cartão consignado. O que vale para o processo é o <b>empréstimo pessoal</b> com uma das cinco.
      </p>
      <TesteRapido
        pergunta="No canal de empréstimo, a Dona Lúcia está sem margem. Qual frase apresenta o processo do jeito certo?"
        opcoes={[
          '“Podemos revisar os juros dos seus consignados.”',
          '“Podemos ver os juros do seu empréstimo pessoal.”',
          '“O processo libera margem para um consignado novo.”',
        ]}
        certa={1}
        explica="O processo revisa os juros do empréstimo pessoal, que a financeira cobra fora do INSS. Os consignados são o assunto dos ganchos (margem e portabilidade), e o processo não libera margem."
      />
    </Secao>

    {/* ------------------------------------------------------------------ matriz */}
    <Secao titulo="Dois canais, duas abordagens">
      <p>
        O processo que a gente oferece é um só: o ressarcimento de juros abusivos dos <b>empréstimos pessoais</b> que o
        aposentado ou pensionista fez com as financeiras. É o carro-chefe da CAF. Mas o cliente chega por dois tráfegos
        pagos diferentes, e com intenções diferentes. Quem vem pelo <b>tráfego do Andrius</b>, o de juros abusivos,
        <b> já quer a revisão</b> dos juros do empréstimo pessoal: é um cliente mais nichado, e a venda é mais direta. Quem
        vem pelo <b>tráfego de empréstimo</b> quer <b>dinheiro rápido</b>, um consignado novo, mas a maioria <b>não tem
        margem disponível</b>. Com ele, é preciso convencer: entender o que ele quer, contar a verdade e mostrar os
        caminhos.
      </p>
      <MatrizCanal />
      <p>
        O erro mais caro é tratar os dois canais do mesmo jeito. Com o cliente de juros, enrolar demais faz ele perder o
        interesse: ele já veio querendo. Com o cliente de empréstimo, falar de processo logo de cara, sem escutar e sem
        verificar, parece que você está fugindo do que ele pediu.
      </p>
    </Secao>

    {/* ------------------------------------------------------------------ canal de juros */}
    <Secao titulo="Canal de juros abusivos: a venda direta">
      <p>
        O cliente viu o anúncio, assistiu ao vídeo do robô e respondeu <b>SIM</b> para a análise gratuita. Ele já chega
        sabendo mais ou menos o que quer: revisar os juros do empréstimo pessoal que tem com a financeira. O seu trabalho
        é <b>confirmar que ele pode</b>, <b>escutar</b>,
        <b> explicar com clareza</b> e <b>levar para os documentos</b>, sem rodeio e sem pressa. Venda direta não é venda
        apressada: é venda sem desvio.
      </p>
      <LinhaTempo itens={[
        { quando: 'Abertura', titulo: 'Assumir onde o robô parou', texto: 'Seu nome + CAF + “já recebi seus dados”. Nada de pedir nome e CPF de novo.' },
        { quando: 'Qualificação', titulo: 'Confirmar o perfil', texto: 'Recebe benefício do INSS (ou um familiar recebe)? Tem empréstimo pessoal com Agibank, BMG, Facta, Mercantil ou Crefisa?' },
        { quando: 'Escuta', titulo: 'Descobrir a dor', texto: 'O que pesa? Há quanto tempo paga? Anote com as palavras dele.' },
        { quando: 'Explicação', titulo: 'O processo em 4 frases', texto: 'O que é, quem faz, quanto tempo leva, quanto custa.' },
        { quando: 'Dúvidas', titulo: 'Conferir e dar segurança', texto: '“Ficou alguma dúvida?” Responda com calma, um ponto por vez.' },
        { quando: 'Fechamento', titulo: 'Primeiro passo agora', texto: 'Um documento pequeno, guiando junto. A ordem sugerida começa pelo Meu INSS.' },
      ]} />
      <p>
        O coração da venda direta é a <b>explicação</b>. Ela precisa caber em quatro frases, porque o cliente tem quatro
        perguntas na cabeça, mesmo quando não pergunta:
      </p>
      <QuatroFrases />
      <p>Veja o roteiro completo, do começo ao fim. Os textos do atendente têm botão de copiar:</p>
      <Conversa
        titulo="Roteiro completo · canal de juros abusivos"
        nota="Sugestão de roteiro, adapte ao cliente. A conversa começa logo depois que o robô confirma que recebeu o nome e o CPF."
        falas={[
          { quem: 'eu', texto: 'Olá, Dona Maria! Aqui é [seu nome], da CAF, a Central de Assessoria Financeira. Já recebi seu nome e seu CPF, não precisa mandar de novo. A partir de agora sou eu que cuido da sua análise.' },
          { quem: 'eu', texto: 'Pra começar, me conta: a senhora recebe algum benefício do INSS?' },
          { quem: 'cliente', texto: 'Recebo sim, sou aposentada.' },
          { quem: 'eu', texto: 'Que bom. E a senhora tem empréstimo pessoal com alguma destas financeiras: Agibank, BMG, Facta, Mercantil ou Crefisa? É aquele empréstimo que a financeira cobra na sua conta, e não o que o INSS desconta direto do benefício.' },
          { quem: 'cliente', texto: 'Tenho no BMG e no Agibank. A parcela pesa muito, viu. Vi o vídeo e achei que era o meu caso.' },
          { quem: 'eu', texto: 'Entendo, Dona Maria. Essas parcelas pesam no fim do mês, né? Faz muito tempo que a senhora paga esses empréstimos?' },
          { quem: 'cliente', texto: 'Uns seis anos, já nem sei mais.' },
          { quem: 'eu', texto: 'Obrigado por me contar. Vou te explicar como funciona, bem simples. Se os juros desses empréstimos pessoais forem abusivos, o nosso advogado, o Dr. Rafael Menezes, entra com uma ação pedindo o ressarcimento do que foi descontado nos últimos 10 anos nesses empréstimos, ou seja, pedindo esse dinheiro de volta. O resultado depende da análise.' },
          { quem: 'eu', texto: 'Leva em média de 6 a 12 meses. E a senhora não paga nada para começar: só no final, 30% do valor que a senhora receber ficam para o advogado. De cada R$ 10 que a senhora receber, R$ 7 são seus.' },
          { quem: 'eu', texto: 'Ficou alguma dúvida até aqui?' },
          { quem: 'cliente', texto: 'E é seguro? Tenho medo de golpe.' },
          { quem: 'eu', texto: 'É muito bom a senhora perguntar isso. A gente nunca pede pagamento adiantado, nada. Quem cuida do processo é o advogado, e as autorizações são assinadas pelo gov.br, o sistema oficial do governo. Se quiser, pode chamar um filho ou alguém de confiança para acompanhar a conversa.' },
          { quem: 'cliente', texto: 'Tá bom. E o que eu preciso fazer?' },
          { quem: 'eu', texto: 'Que ótimo! O primeiro passo é bem simples: pegar alguns documentos no aplicativo Meu INSS. A senhora tem o aplicativo no celular?' },
          { quem: 'cliente', texto: 'Tenho, mas não sei mexer direito.' },
          { quem: 'eu', texto: 'Sem problema, eu te guio passo a passo, a gente faz junto. Abre o Meu INSS aí e me avisa quando estiver na tela inicial?' },
        ]}
      />
      <p>Repare em seis detalhes deste roteiro, porque são eles que fazem a venda andar:</p>
      <Lista itens={[
        <><b>Uma pergunta por mensagem.</b> O cliente responde uma coisa de cada vez e não se perde.</>,
        <><b>A pergunta do empréstimo pessoal vem explicada.</b> “É aquele empréstimo que a financeira cobra na sua conta, e não o que o INSS desconta” evita que a cliente responda pensando no consignado.</>,
        <><b>A dor vem antes da explicação.</b> Quando a Dona Maria diz “a parcela pesa muito”, o atendente acolhe antes de explicar. A explicação passa a ser a resposta para um problema dela.</>,
        <><b>Os 30% aparecem cedo</b>, junto com o “não paga nada para começar”. Ela sabe da regra inteira antes de decidir.</>,
        <><b>A desconfiança é bem-vinda.</b> “É muito bom a senhora perguntar isso” transforma o medo em conversa, em vez de tratar como ofensa.</>,
        <><b>O “sim” vira ação na hora.</b> “O que eu preciso fazer?” é respondido com um passo pequeno e imediato, não com uma lista.</>,
      ]} />
      <Aviso tom="ambar" titulo="Nunca prometa valor, nem para “animar”">
        Mesmo no canal de juros, em que o cliente já está animado, não diga quanto ele vai receber. O valor depende da
        análise e do resultado do processo. Fale em <b>análise</b>, <b>possibilidade</b> e <b>em média</b>.
      </Aviso>
    </Secao>

    {/* ------------------------------------------------------------------ canal de empréstimo */}
    <Secao titulo="Canal de empréstimo: o pivô honesto">
      <p>
        Aqui a conversa é outra. O cliente viu um anúncio de empréstimo, o robô ofereceu “uma análise pra ver se é liberado
        algum valor”, a IA fez as perguntas de elegibilidade e mandou: <span className="mv-cv-cit">Boa notícia,
        {' {nome}'}! Sua análise foi *pré-aprovada*.</span> Ele chega até você querendo <b>dinheiro rápido</b>, um
        consignado novo. Mas a maioria dos clientes desse canal
        <b> não tem margem disponível</b>: a parte do benefício que o INSS pode descontar para consignado já está ocupada.
      </p>
      <p>
        É aqui que entra o <b>pivô</b>. Pivô é mudar a direção da conversa <b>sem mudar a verdade</b>: sair do que não é
        possível agora (um consignado novo) e ir para o que pode ser possível. Nas palavras do dono da empresa, com esse
        cliente “a gente tem que estar convencendo”. Convencer com verdade, e é isso que faz o pivô ser honesto.
      </p>
      <PivoEmprestimo />
      <p>
        <b>Por que a ordem importa tanto aqui?</b> Se você fala do processo antes de verificar, parece que está fugindo do
        que o cliente pediu, como quem troca o produto na prateleira. Quando você verifica primeiro e conta a verdade, o
        cliente percebe que você olhou o caso dele com cuidado. A notícia “hoje não há margem” é ruim, mas é uma
        <b> informação útil</b>: ele passa a entender por que o banco não libera, e passa a ouvir os caminhos com atenção.
      </p>
      <p>
        Os três caminhos são sempre apresentados como <b>possibilidade</b>, porque cada caso é analisado. Os dois
        primeiros são os <b>ganchos do consignado</b>; o terceiro é a revisão do <b>empréstimo pessoal</b> que ele já tem:
      </p>
      <div className="mv-ganchos">
        <div className="vidro mv-gancho"><span className="num">1</span><b>Aumento de margem</b><p>Do consignado. Ver se existe a possibilidade de o cliente voltar a ter espaço para um consignado. É avaliado caso a caso, e nunca se promete antes da análise.</p></div>
        <div className="vidro mv-gancho"><span className="num">2</span><b>Portabilidade dos consignados</b><p>Levar os consignados para outro banco. Em alguns casos libera um valor, que pode passar de R$ 1.500. Depende da análise.</p></div>
        <div className="vidro mv-gancho"><span className="num">3</span><b>Revisão do empréstimo pessoal</b><p>O processo. Se os juros do empréstimo pessoal que ele tem com a financeira forem abusivos, o advogado entra com uma ação pedindo o ressarcimento do que foi descontado nos últimos 10 anos. Nada se paga para começar.</p></div>
      </div>
      <p>
        Os dois ganchos do consignado respondem ao que ele pediu e abrem a conversa: mostram que você está
        procurando uma saída para ele. O terceiro caminho <b>muda de empréstimo</b>: é a revisão dos juros do empréstimo pessoal, o
        nosso carro-chefe. Faz sentido para esse cliente porque quem está sem margem para consignado muitas vezes recorre ao
        empréstimo pessoal, que é mais caro, e a IA já perguntou, na porta 3, se ele tem empréstimo pessoal numa das cinco
        financeiras.
      </p>
      <p>
        Mas atenção ao jeito de apresentá-lo: <b>o processo não é empréstimo</b>. Não é dinheiro novo e não é rápido (leva
        em média de 6 a 12 meses). É pedir de volta o que foi descontado nos últimos 10 anos no empréstimo pessoal, se os
        juros forem abusivos. Diga isso com todas as letras, e nunca diga que o processo revisa os consignados: eles
        ocupam a margem, mas o que o processo olha é o empréstimo pessoal. O cliente que entende a diferença decide com
        consciência e não se sente enganado lá na frente.
      </p>
      <Aviso tom="azul" titulo="E se o cliente tiver margem?">
        Aí o caminho é outro: combine o próximo passo com o seu gestor. E o processo continua valendo, porque ele não
        depende da margem: depende de o cliente (ou um familiar) receber benefício do INSS e ter empréstimo pessoal com uma
        das cinco financeiras.
      </Aviso>
      <p>
        Agora o roteiro completo, dividido nos três momentos da conversa. A Parte 1 é o primeiro passo de sempre no canal
        de empréstimo, nesta ordem: <b>apresentar-se</b> (nome + CAF), explicar com honestidade o que é a
        <b> “pré-aprovada”</b> (a análise inicial passou nas perguntas; não é valor liberado), fazer <b>uma pergunta
        aberta curta</b> sobre o que a pessoa precisa e <b>pedir os extratos do Meu INSS</b>. A lição 6 detalha essa
        abertura.
      </p>
      <Conversa
        titulo="Parte 1 · Apresentar-se e verificar"
        nota="Sugestão de roteiro, adapte ao cliente. A conversa começa quando a IA passa o atendimento para você."
        falas={[
          { quem: 'cliente', texto: 'Oi, a análise foi pré-aprovada, né? Quanto eu consigo pegar?' },
          { quem: 'eu', texto: 'Oi, Dona Lúcia! Aqui é [seu nome], da CAF, a Central de Assessoria Financeira. A partir de agora sou eu que cuido do seu atendimento.' },
          { quem: 'eu', texto: 'Sobre a pré-aprovada: ela quer dizer que a sua análise inicial passou nas primeiras perguntas. Ainda não é um valor liberado. Para saber o que é possível, eu preciso conferir a sua situação.' },
          { quem: 'eu', texto: 'Me conta: o que a senhora está precisando hoje?' },
          { quem: 'cliente', texto: 'Preciso pagar umas contas atrasadas. Tá tudo muito apertado.' },
          { quem: 'eu', texto: 'Entendo, Dona Lúcia. Para eu ver com segurança o que é possível no seu caso, preciso dos seus extratos do Meu INSS. A senhora consegue entrar no aplicativo?' },
          { quem: 'cliente', texto: 'Consigo, minha neta me ajuda. Vou mandar.' },
          { quem: 'cliente', texto: '(manda o extrato de empréstimo consignado em PDF)' },
        ]}
      />
      <Conversa
        titulo="Parte 2 · A verdade e os caminhos"
        nota="Sugestão de roteiro, adapte ao cliente. Só depois de conferir os extratos."
        falas={[
          { quem: 'eu', texto: 'Recebi, obrigado! Conferi com calma, Dona Lúcia, e vou ser bem sincero com a senhora: hoje a sua margem está toda ocupada pelos consignados que a senhora já tem, os empréstimos e cartões que o INSS desconta do benefício. Por isso não sai um consignado novo agora.' },
          { quem: 'cliente', texto: 'Ah, que pena. Eu precisava muito desse dinheiro.' },
          { quem: 'eu', texto: 'Eu entendo, de verdade. Mas não acabou aqui: existem alguns caminhos que podemos analisar. Posso te explicar rapidinho?' },
          { quem: 'cliente', texto: 'Pode.' },
          { quem: 'eu', texto: 'O primeiro é ver se existe a possibilidade de aumentar a sua margem. Isso é analisado caso a caso.' },
          { quem: 'eu', texto: 'O segundo é a portabilidade: levar os seus consignados para outro banco. Em alguns casos, essa troca libera um valor, que pode passar de R$ 1.500. Também depende da análise.' },
          { quem: 'eu', texto: 'E o terceiro é o que eu mais quero te mostrar. Vi aqui na conversa que a senhora tem empréstimo pessoal no Agibank, certo? Aquele que a financeira cobra na sua conta, e não o que o INSS desconta direto do benefício.' },
          { quem: 'cliente', texto: 'Tenho, sim. Faz uns anos já.' },
          { quem: 'eu', texto: 'Os juros desse empréstimo pessoal podem ser abusivos. Se forem, o nosso advogado, o Dr. Rafael Menezes, entra com uma ação pedindo o ressarcimento do que foi descontado nos últimos 10 anos nesse empréstimo. O resultado depende da análise.' },
        ]}
      />
      <Conversa
        titulo="Parte 3 · Do processo aos documentos"
        nota="Sugestão de roteiro, adapte ao cliente."
        falas={[
          { quem: 'cliente', texto: 'E quanto custa isso?' },
          { quem: 'eu', texto: 'Para começar, nada. Leva em média de 6 a 12 meses e, só no final, 30% do valor que a senhora receber ficam para o advogado. De cada R$ 10, R$ 7 são seus.' },
          { quem: 'eu', texto: 'Só para ficar bem claro: o processo é diferente do empréstimo que a senhora veio buscar. Não é um dinheiro novo e não é rápido. É pedir de volta o que foi descontado no seu empréstimo pessoal, se os juros forem abusivos. A senhora decide com calma.' },
          { quem: 'cliente', texto: 'Entendi. Quero fazer sim. E a portabilidade, dá pra ver também?' },
          { quem: 'eu', texto: 'Dá para analisar, sim. Vou ver com a equipe e te dou um retorno sobre isso.' },
          { quem: 'eu', texto: 'E para o processo a gente já pode começar agora: o extrato de empréstimo consignado a senhora já me mandou. Faltam a carta de concessão e os extratos de pagamento, também no Meu INSS. Vamos pegar a carta de concessão primeiro?' },
        ]}
      />
      <p>
        Repare como a Parte 2 começa: <b>“vou ser bem sincero com a senhora”</b>. É a frase que marca o pivô. Ela avisa
        que vem uma verdade, e o cliente agradece a sinceridade mesmo quando a notícia não é a que ele queria. Repare
        também na passagem do segundo para o terceiro caminho: os dois primeiros falam dos <b>consignados</b>; o terceiro
        fala de <b>outro empréstimo</b>, o pessoal, e o atendente diz qual é com uma frase simples, para a cliente não
        achar que o processo vai mexer nos consignados. E a portabilidade não fica sem resposta: “vou ver com a equipe e te
        dou um retorno” é um próximo passo combinado, e você precisa cumprir.
      </p>
      <TesteRapido
        pergunta="Depois de ouvir que está sem margem, a cliente pergunta: “Então não dá nada?”. Qual a melhor resposta?"
        opcoes={[
          '“Infelizmente, hoje não dá. Obrigado pelo contato, viu?”',
          '“Dá sim! Com a portabilidade a senhora pega R$ 1.500, certeza.”',
          '“Tem caminhos, sim: margem, portabilidade e o processo. Posso explicar?”',
        ]}
        certa={2}
        explica="Sem margem não é fim de conversa: é a hora dos caminhos. E todos eles são apresentados como possibilidade, nunca com valor garantido."
      />
      <OrdenarPivo />
    </Secao>

    {/* ------------------------------------------------------------------ 30% */}
    <Secao titulo="Os 30%: cedo e junto com o “não paga nada”">
      <p>
        A regra dos honorários está completa na lição 2, com a calculadora: para começar, o cliente não paga nada; no
        final, 30% do valor que ele receber ficam para o advogado. Para a conversão, o que importa é o <b>momento</b>: fale
        dos 30% <b>cedo</b>, na mesma mensagem do “para começar, não paga nada”. Dito assim, vira argumento a favor, porque
        o cliente percebe que não existe um momento em que ele pague do próprio bolso. Deixado para o fim, vira
        desconfiança: soa como “letra miúda”.
      </p>
      <DezReais />
      <p>
        A imagem das moedas é a tradução mais fácil: <b>“de cada R$ 10 que o senhor receber, R$ 7 são seus”</b>. Ela mostra
        o lado do cliente primeiro. Use sempre como exemplo, nunca como previsão de valor. As perguntas que o cliente faz
        sobre os 30%, com as respostas, também estão na lição 2.
      </p>
    </Secao>

    {/* ------------------------------------------------------------------ documentos */}
    <Secao titulo="Como pedir os documentos sem assustar">
      <p>
        O cliente disse “sim”. Agora vem o momento mais delicado da conversão: pedir documentos. Por que ele se assusta?
        Por três motivos. Primeiro, porque já ouviu falar de golpe com documento. Segundo, porque uma lista grande parece
        burocracia sem fim. Terceiro, porque muitos não sabem mexer no Meu INSS e têm vergonha de dizer. O seu pedido
        precisa resolver os três: <b>dar segurança</b>, <b>dividir em partes pequenas</b> e <b>oferecer ajuda</b>.
      </p>
      <BlocosDocumentos />
      <p>
        A ordem sugerida, a mesma do caminho do cliente: <b>Meu INSS</b>, <b>gov.br</b> e <b>documentos pessoais</b> — sem
        ser rígida. Se o cliente já tem um documento à mão, ele pode mandar primeiro, e você agradece e segue. Os
        documentos pessoais são uma lista curta e conhecida (RG, foto do rosto, comprovante, e-mail) e podem ir numa mensagem só. Os do
        Meu INSS e do gov.br, que dependem de aplicativo, você pede um bloco por vez e guia junto.
      </p>
      <p>Veja a diferença na prática:</p>
      <BomRuim
        ruim={{
          titulo: 'Assusta',
          corpo: (
            <Celular
              contato="Dona Cida"
              sub="cliente"
              bolhas={[
                { de: 'eu', texto: 'Para dar entrada preciso de: carta de concessão, extrato de empréstimo consignado, extratos de pagamento de 10 anos, imposto de renda dos últimos 3 anos com DEC e REC, situação cadastral do CPF, RG ou CNH frente e verso, foto do rosto, comprovante de residência e e-mail. Manda tudo o quanto antes.', hora: '15:10' },
                { de: 'cliente', texto: 'Nossa, é muita coisa. Depois eu vejo.', hora: '15:31' },
              ]}
            />
          ),
        }}
        bom={{
          titulo: 'Acolhe',
          corpo: (
            <Celular
              contato="Dona Cida"
              sub="cliente"
              bolhas={[
                { de: 'eu', texto: 'Agora vamos juntar os documentos. Fica tranquila: a gente faz junto, um de cada vez. 😊', hora: '15:10' },
                { de: 'eu', texto: 'O primeiro é a carta de concessão, no aplicativo Meu INSS. Ela mostra qual é o seu benefício. Quer que eu te guie?', hora: '15:10' },
                { de: 'cliente', texto: 'Quero sim! Tô com o celular aqui.', hora: '15:11' },
              ]}
            />
          ),
        }}
      />
      <p>As regras de ouro do pedido de documentos:</p>
      <Lista itens={[
        <><b>Peça na hora certa.</b> Documento vem depois da decisão. No canal de empréstimo, os extratos podem vir antes, mas com um motivo claro: “para eu conferir o que é possível no seu caso”.</>,
        <><b>Diga o porquê em uma frase.</b> “Ela mostra qual é o seu benefício” acalma mais do que qualquer “pode confiar”.</>,
        <><b>Um bloco por vez.</b> Na ordem sugerida (Meu INSS, gov.br, pessoais), sem rigidez. Cada bloco terminado é uma pequena vitória.</>,
        <><b>Ofereça ajuda antes que ele peça.</b> “Eu te guio passo a passo” tira a vergonha de não saber mexer.</>,
        <><b>Comemore cada entrega.</b> “Recebi, ficou certinho!” deixa o cliente com vontade de mandar o próximo.</>,
        <><b>Reforce a segurança.</b> Os dados servem só para o processo dele, e a CAF nunca pede pagamento adiantado.</>,
      ]} />
      <TesteRapido
        pergunta="A cliente escreve: “Já estou com a identidade aqui. Posso mandar ela primeiro?”. O que você responde?"
        opcoes={[
          '“Ainda não. A gente precisa começar pelo Meu INSS.”',
          '“Pode, sim! Depois a gente vai junto ao Meu INSS.”',
          '“Melhor não: a identidade é sempre a última a ir.”',
        ]}
        certa={1}
        explica="A ordem sugerida (Meu INSS, gov.br, pessoais) não é rígida. O cliente pode mandar o que já tem em mãos; você recebe, agradece e segue para o próximo bloco."
      />
      <Aviso tom="ambar" titulo="E se o cliente quiser passar a senha do gov.br?">
        Primeiro, ofereça guiar: muitas vezes, com calma, ele consegue. Se ele não conseguir e preferir passar a senha,
        siga o procedimento da lição 10: a gente entra com total segurança, só para buscar os documentos, e depois ajuda
        o cliente a trocar a senha. Na dúvida, fale com o seu gestor antes.
      </Aviso>
      <Aviso titulo="No canal de empréstimo, parte da lista já chegou">
        A IA já mandou a lista dos documentos pessoais (RG ou CNH, comprovante de residência, foto do rosto e e-mail).
        Antes de pedir, leia a conversa: o cliente pode já ter mandado alguma coisa. Pedir de novo o que ele já mandou
        passa a impressão de que ninguém leu.
      </Aviso>
    </Secao>

    {/* ------------------------------------------------------------------ gatilhos */}
    <Secao titulo="Gatilhos honestos: o que pode e o que não pode">
      <p>
        <b>Gatilho</b> é qualquer coisa que ajuda a pessoa a tomar uma decisão. Existe gatilho honesto e gatilho
        desonesto. O honesto ajuda o cliente a ver a verdade com mais clareza: segurança, facilidade, a prova de que não se
        paga nada para começar. O desonesto empurra o cliente com uma mentira ou com medo: pressa inventada, promessa de
        valor, pressão. Na CAF, só o honesto.
      </p>
      <GatilhosPainel />
      <p>
        Por que ser tão rígido? Por três razões. A primeira é ética: o nosso cliente é, muitas vezes, uma pessoa idosa, e
        pressionar quem tem menos defesa é errado. A segunda é prática: cliente pressionado diz “sim” e some na hora dos
        documentos, ou desiste no meio do processo. A terceira é a reputação: uma promessa quebrada vira reclamação, e uma
        reclamação afasta muitos outros clientes. O gatilho honesto converte menos depressa, mas converte de verdade.
      </p>
      <ClassificarGatilhos />
      <Frase>O melhor argumento de venda da CAF é a verdade dita com clareza: não paga nada para começar, e os 30% saem do que o cliente receber.</Frase>
    </Secao>

    {/* ------------------------------------------------------------------ sinais */}
    <Secao titulo="Sinais de compra e sinais de dúvida">
      <p>
        O cliente avisa quando está pronto, mesmo sem dizer “quero”. Um <b>sinal de compra</b> é uma fala que mostra que ele
        já está se imaginando dentro do processo. Um <b>sinal de dúvida</b> é uma fala que mostra que alguma coisa ainda não
        ficou clara ou segura. Saber a diferença evita os dois erros clássicos: continuar explicando para quem já decidiu
        (e cansar o cliente) e pedir documentos para quem ainda tem medo (e perder o cliente).
      </p>
      <Tabela
        colunas={['O cliente diz', 'Sinal', 'O que você faz']}
        linhas={[
          ['“E o que eu preciso fazer?”', <Sinal key="s1" tipo="compra" />, 'Pare de explicar e proponha o primeiro passo: o Meu INSS.'],
          ['“Quanto tempo demora?”', <Sinal key="s2" tipo="compra" />, 'Responda (em média de 6 a 12 meses) e emende o próximo passo.'],
          ['“Meu filho pode me ajudar a pegar os papéis?”', <Sinal key="s3" tipo="compra" />, 'Ótimo sinal: ele já está se organizando. Convide o filho para a conversa.'],
          ['“Então eu não pago nada antes, né?”', <Sinal key="s4" tipo="compra" />, 'Confirme com clareza e siga para os documentos.'],
          ['“Isso é golpe?”', <Sinal key="s5" tipo="duvida" />, 'Agradeça a pergunta e mostre a segurança: nada pago antes, advogado, gov.br.'],
          ['“Vou pensar.”', <Sinal key="s6" tipo="duvida" />, 'Pergunte com carinho o que ficou em dúvida e combine quando retomar.'],
          ['“Quanto eu vou receber?”', <Sinal key="s7" tipo="duvida" />, 'É interesse misturado com dúvida. Explique que depende da análise, sem prometer valor.'],
          ['“Mas eu queria o empréstimo…”', <Sinal key="s8" tipo="duvida" />, 'Volte ao pivô: a verdade sobre a margem e os caminhos.'],
        ]}
      />
      <p>
        Uma regra simples: <b>sinal de compra pede ação, sinal de dúvida pede escuta</b>. Diante de um sinal de compra,
        responda em uma frase e proponha o próximo passo. Diante de um sinal de dúvida, não empurre: pergunte, escute e
        esclareça. A lição 8 traz as respostas para cada objeção, e a lição 9 ensina a retomar quem ficou de pensar.
      </p>
      <TesteRapido
        pergunta="O cliente escreve: “Meu filho pode me ajudar a pegar esses papéis?”. Que sinal é esse?"
        opcoes={[
          'Dúvida: ele está tentando adiar',
          'Compra: ele já está se organizando para fazer',
          'Nenhum dos dois, é só uma pergunta',
        ]}
        certa={1}
        explica="Quem pergunta quem vai ajudar a pegar os documentos já decidiu fazer. Responda que sim e convide o filho para a conversa."
      />
    </Secao>

    {/* ------------------------------------------------------------------ fechamento */}
    <Secao titulo="O fechamento: transformar o “sim” em ação">
      <p>
        Muita gente acha que a venda termina no “sim”. Não termina. O “sim” no WhatsApp é uma intenção, e intenção esfria
        rápido: o cliente larga o celular, o dia passa e, no dia seguinte, a conversa precisa recomeçar. O
        <b> fechamento de verdade é o primeiro documento chegando</b>. Por isso, a regra do fechamento é: <b>o sim vira
        ação imediata, começando pelos documentos</b>.
      </p>
      <Passos itens={[
        { titulo: 'Comemore e resuma em uma frase', texto: '“Que ótimo! Então vamos dar entrada no seu processo.” O cliente precisa sentir que a decisão dele foi boa.' },
        { titulo: 'Proponha um primeiro passo pequeno, agora', texto: 'Não a lista inteira: um documento. “O primeiro é a carta de concessão, no Meu INSS. A senhora está com o celular aí?”' },
        { titulo: 'Faça junto', texto: 'Guie tela por tela: abrir o Meu INSS, entrar com a senha do gov.br, tocar na busca, digitar o nome do documento, baixar o PDF e mandar no WhatsApp.' },
        { titulo: 'Se não der agora, marque o momento', texto: 'Ofereça duas opções reais: “consegue agora ou prefere mais tarde, com a sua neta?”. E combine quando você vai chamar.' },
        { titulo: 'Cumpra o combinado', texto: 'Chame no momento combinado e continue de onde parou. É o último degrau da escada da confiança.' },
      ]} />
      <FechamentoAnotado />
      <p>
        Repare que o Seu Antônio não terminou tudo naquele dia, e está tudo bem. O que importa é que ele <b>começou</b>:
        um documento chegou, ele viu que é fácil e o próximo passo ficou marcado. Começar transforma o “vou fazer” em “estou
        fazendo”, e quem está fazendo tem muito mais chance de ir até o fim.
      </p>
      <Aviso tom="ambar" titulo="Duas opções reais, não uma armadilha">
        “Consegue agora ou prefere mais tarde?” é uma boa pergunta de fechamento porque respeita o tempo do cliente e já
        deixa um próximo passo no ar. Mas as duas opções precisam ser reais. Se ele disser “nenhuma das duas, quero
        pensar”, respeite e combine quando retomar.
      </Aviso>
    </Secao>

    {/* ------------------------------------------------------------------ situações */}
    <Secao titulo="Situações que vão aparecer">
      <Sanfona itens={[
        {
          titulo: 'O cliente disse “sim”, mas sumiu na hora dos documentos',
          corpo: (
            <p>
              Quase sempre é dificuldade, e não desistência. Retome com um passo ainda menor e com oferta de ajuda: “Seu
              Antônio, vamos pegar só a carta de concessão hoje? Eu te guio, leva poucos minutos.” A lição 9 ensina o ritmo
              certo para retomar sem incomodar.
            </p>
          ),
        },
        {
          titulo: 'O cliente quer só o empréstimo e não quer ouvir sobre o processo',
          corpo: (
            <p>
              Respeite. Conte a verdade sobre a margem, apresente os caminhos uma vez, com calma, e deixe a porta aberta: “Se
              mudar de ideia, é só me chamar aqui.” Insistir depois de um “não” claro quebra a confiança e contraria a
              nossa regra de convivência.
            </p>
          ),
        },
        {
          titulo: 'A família vai decidir junto',
          corpo: (
            <p>
              Ótimo sinal, não é obstáculo. Convide o filho ou a filha para a conversa e combine quando você volta a
              chamar. A lição 9 tem um resumo pronto para o cliente mostrar à família.
            </p>
          ),
        },
        {
          titulo: 'O cliente do empréstimo ficou chateado com a “pré-aprovada”',
          corpo: (
            <p>
              Acolha a frustração sem discutir (“Entendo, a senhora esperava outra notícia.”) e explique de novo que a
              pré-aprovada quer dizer que a análise inicial passou nas perguntas, e não que havia um valor liberado. Nunca
              culpe o robô ou a IA. A resposta completa para essa cena está na lição 8.
            </p>
          ),
        },
        {
          titulo: 'O cliente não recebe benefício, mas a mãe (ou outro familiar) recebe',
          corpo: (
            <p>
              Ainda pode seguir, pela rota do familiar (lição 4): se o pai, a mãe, a avó, o avô ou um filho recebe algum
              benefício do INSS, a análise segue pelo benefício dele. Aí os documentos (Meu INSS, imposto de renda, CPF,
              identidade, foto do rosto, comprovante e e-mail) são do familiar que recebe. Convide o familiar para a
              conversa e, na dúvida, pergunte ao seu gestor.
            </p>
          ),
        },
        {
          titulo: 'O cliente não sabe se tem empréstimo pessoal nas cinco financeiras',
          corpo: (
            <p>
              Pergunte de novo uma vez, citando as cinco e explicando a diferença numa frase: “É aquele empréstimo que a
              financeira cobra na sua conta, e não o que o INSS desconta direto do benefício. O senhor tem algum assim com
              Agibank, BMG, Facta, Mercantil ou Crefisa?”. O cliente costuma lembrar pelo nome do banco e pelo débito na
              conta. Se ele continuar sem saber, siga em frente. A regra completa está na lição 4.
            </p>
          ),
        },
        {
          titulo: 'O cliente não é elegível',
          corpo: (
            <p>
              Não force e não invente outro caminho: agradeça com carinho e encerre sem insistir, como ensina a lição 4
              (“Obrigado por conversar comigo, [nome]. Se a sua situação mudar, é só me chamar aqui.”). Encerrar bem também
              é parte do trabalho.
            </p>
          ),
        },
        {
          titulo: 'O cliente topou, mas a sua dúvida é sobre a portabilidade ou o aumento de margem',
          corpo: (
            <p>
              Não improvise. Diga ao cliente que vai verificar e dar um retorno, e leve a dúvida para o seu gestor. Uma
              resposta honesta (“vou confirmar e te retorno”) vale mais do que uma explicação inventada.
            </p>
          ),
        },
      ]} />
    </Secao>

    {/* ------------------------------------------------------------------ resumo */}
    <Secao titulo="Resumo da lição">
      <Lista itens={[
        <>Converter é <b>ajudar o cliente a entender, a decidir com a verdade e a dar o primeiro passo</b>, e não empurrar. O funil tem cinco degraus: <b>atenção → confiança → entendimento → decisão → documentos</b>. Responda o degrau em que o cliente está.</>,
        <>O <b>consignado</b> é descontado pelo INSS e depende de margem: é o assunto dos ganchos. O <b>empréstimo pessoal</b> é cobrado pela financeira, fora do INSS: <b>é ele que o processo revisa</b>.</>,
        <>Canal de juros: <b>venda direta</b> (confirmar, escutar, explicar em 4 frases, levar aos documentos). Canal de empréstimo: <b>pivô honesto</b> (apresentar-se, explicar a “pré-aprovada”, perguntar o que precisa, pedir os extratos, contar a verdade sobre a margem e apresentar os caminhos como possibilidade: aumento de margem e portabilidade dos consignados, e a revisão dos juros do empréstimo pessoal que ele já tem, deixando claro que o processo é outra coisa).</>,
        <>Os 30% vêm <b>cedo, junto com o “não paga nada para começar”</b>: de cada R$ 10, R$ 7 são do cliente. A regra completa está na lição 2.</>,
        <>Documentos <b>um bloco por vez</b>, na ordem sugerida (Meu INSS, gov.br, pessoais) sem rigidez, com o porquê de cada um e ajuda oferecida. Gatilho só o honesto: <b>nada de urgência falsa, promessa de valor ou pressão</b>.</>,
        <>Sinal de compra pede ação; sinal de dúvida pede escuta. O fechamento é o <b>primeiro documento chegando</b>, e toda conversa termina com um próximo passo combinado.</>,
      ]} />
    </Secao>
  </>
);

const licao: Licao = {
  id: 'conversao',
  modulo: 'venda',
  titulo: 'Como converter o cliente',
  resumo: 'A estratégia de conversão: o funil em cinco degraus, a confiança, o papel do consignado e do empréstimo pessoal na conversa, a venda direta do canal de juros, o pivô honesto do canal de empréstimo, a hora certa dos 30%, o pedido de documentos sem susto, os gatilhos honestos e o fechamento.',
  minutos: 35,
  corpo,
  questoes: [
    {
      p: 'Segundo o funil da venda, qual é o erro mais comum de quem está começando?',
      o: [
        'Falar dos 30% logo no começo da conversa',
        'Perguntar ao cliente o que mais pesa no mês',
        'Pedir documento antes de o cliente confiar',
      ],
      c: 2,
      e: 'Cada degrau se apoia no anterior: documento (degrau 5) pedido para quem ainda desconfia (degrau 2) faz o cliente se sentir apressado e sumir. Falar dos 30% cedo e escutar a dor são acertos.',
    },
    {
      p: 'Qual destas frases é um gatilho HONESTO?',
      o: [
        '“Nada se paga antes; os 30% saem no final.”',
        '“Essa condição especial vale só até hoje, viu?”',
        '“Uma cliente como a senhora recebeu R$ 15 mil.”',
      ],
      c: 0,
      e: 'A prova de que não se paga nada para começar é verdade e ajuda a decidir. Prazo inventado é urgência falsa, e a história da outra cliente é promessa de valor disfarçada.',
    },
    {
      p: 'Por que deixar claro que o processo não é empréstimo?',
      o: [
        'Porque quem está sem margem não pode entrar com o processo',
        'Para ele decidir sabendo que não é dinheiro novo nem rápido',
        'Para o cliente esquecer o empréstimo e pensar só no processo',
      ],
      c: 1,
      e: 'O processo pede o ressarcimento do que foi descontado no empréstimo pessoal nos últimos 10 anos e leva em média de 6 a 12 meses. Quem entende a diferença decide com consciência e não se sente enganado depois. E o processo não depende da margem.',
    },
    {
      p: 'Na conversa de venda, em que momento você fala dos 30% de honorários?',
      o: [
        'Cedo e com clareza, antes de o cliente decidir',
        'Só no fim, depois de o cliente mandar os documentos',
        'Só se o cliente perguntar quanto custa o processo',
      ],
      c: 0,
      e: 'Os 30% entram cedo, na mesma mensagem do “para começar, não paga nada”. Dito assim, vira argumento a favor: o cliente decide sabendo a regra inteira e não se sente enganado depois.',
    },
    {
      p: 'O cliente topou o processo. Qual é a melhor forma de transformar esse “sim” em ação?',
      o: [
        'Mandar a lista completa para ele enviar quando puder',
        'Explicar tudo de novo, para ele ter certeza da decisão',
        'Propor um passo pequeno agora e fazer junto com o cliente',
      ],
      c: 2,
      e: 'O fechamento de verdade é o primeiro documento chegando: um passo pequeno (a carta de concessão, por exemplo), feito junto. A lista inteira assusta, e explicar de novo cansa quem já decidiu.',
    },
  ],
  glossario: [
    { termo: 'Conversão', def: 'Levar o cliente da primeira mensagem até a decisão de seguir com o processo, e dessa decisão até a ação: os documentos chegando.' },
    { termo: 'Funil da venda', def: 'O caminho em cinco degraus que o cliente percorre: atenção, confiança, entendimento, decisão e documentos. Nem todos passam de um degrau para o outro, e tudo bem.' },
    { termo: 'Rapport', def: 'Palavra de origem francesa (lê-se “rapór”) que quer dizer sintonia: o cliente sentir que conversa com alguém que escuta, entende e respeita. É a base da confiança.' },
    { termo: 'Pivô honesto', def: 'No canal de empréstimo, mudar a direção da conversa do consignado novo (que não cabe na margem) para os caminhos possíveis: aumento de margem, portabilidade dos consignados e a revisão dos juros do empréstimo pessoal, contando a verdade e sem disfarçar que o processo é outra coisa.' },
    { termo: 'Gatilho honesto', def: 'Algo verdadeiro que ajuda o cliente a decidir: clareza, segurança, facilidade e a prova de que não se paga nada para começar.' },
    { termo: 'Urgência falsa', def: 'Pressa inventada para empurrar o cliente, como “só até hoje” ou “últimas vagas”. Não usamos, nunca.' },
    { termo: 'Sinal de compra', def: 'Fala que mostra que o cliente está pronto para seguir, como “o que eu preciso fazer?”. É a hora de propor o primeiro passo.' },
    { termo: 'Sinal de dúvida', def: 'Fala que mostra que algo ainda não ficou claro ou seguro, como “isso é golpe?” ou “vou pensar”. É a hora de escutar e esclarecer, não de empurrar.' },
    { termo: 'Fechamento', def: 'O momento de transformar o “sim” em ação imediata, começando pelos documentos. A venda só fecha de verdade quando o primeiro documento chega.' },
    { termo: 'Próximo passo combinado', def: 'O que o cliente vai fazer e quando, acertado com ele no fim de cada conversa. Conversa sem próximo passo esfria.' },
  ],
  mensagens: [
    {
      titulo: 'Explicar o processo em 4 frases',
      quando: 'Canal de juros, depois de confirmar o perfil e escutar a dor do cliente.',
      texto: 'Vou te explicar de um jeito simples, [nome do cliente]:\n\n1) Se os juros do seu empréstimo pessoal com a financeira forem abusivos, o nosso advogado, o Dr. Rafael Menezes, entra com uma ação pedindo o ressarcimento do que foi descontado nos últimos 10 anos nesse empréstimo. O resultado depende da análise.\n2) Leva em média de 6 a 12 meses.\n3) Para começar, você não paga nada.\n4) Só no final, 30% do valor que você receber ficam para o advogado. De cada R$ 10 que você receber, R$ 7 são seus.\n\nFicou alguma dúvida?',
    },
    {
      titulo: 'Processo não é empréstimo',
      quando: 'Canal de empréstimo, depois de contar que não há margem e apresentar os caminhos.',
      texto: '[nome do cliente], só para ficar bem claro: o processo é diferente do empréstimo que você veio buscar. Não é um dinheiro novo que o banco empresta, e não é rápido: leva em média de 6 a 12 meses. É a revisão dos juros do empréstimo pessoal que você já tem com a financeira: se os juros forem abusivos, o advogado entra com uma ação pedindo o ressarcimento do que foi descontado nos últimos 10 anos nesse empréstimo. O resultado depende da análise.\n\nPara começar, você não paga nada. No final, 30% do valor que você receber ficam para o advogado.\n\nQuer seguir com a análise?',
    },
    {
      titulo: 'Do sim ao primeiro passo',
      quando: 'Logo depois que o cliente topa o processo.',
      texto: 'Que ótimo, [nome do cliente]! Então vamos dar entrada no seu processo. 😊\n\nO primeiro passo é bem simples: pegar a sua carta de concessão no aplicativo Meu INSS. Eu te guio passo a passo, a gente faz junto.\n\nVocê consegue agora ou prefere que a gente combine um horário mais tarde?',
    },
    {
      titulo: 'Pedir os documentos do Meu INSS sem assustar',
      quando: 'Ao começar o primeiro bloco de documentos.',
      texto: 'Agora vamos ao primeiro bloco, [nome do cliente]: três documentos do aplicativo Meu INSS.\n\n• Carta de concessão: mostra qual é o seu benefício.\n• Extrato de empréstimo consignado: mostra os seus empréstimos consignados.\n• Extratos de pagamento: mostram, mês a mês, o que o benefício pagou e o que foi descontado.\n\nOs três fazem parte da documentação do seu processo. Fica tranquilo(a): eu te guio tela por tela, sem pressa. Seus dados são usados só para o seu processo. Pode abrir o aplicativo?',
    },
  ],
};
export default licao;
