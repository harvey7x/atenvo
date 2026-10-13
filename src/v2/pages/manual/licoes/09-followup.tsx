/* Lição 9 — Follow-up: quando o cliente some. O que fazer quando o cliente
   para de responder, diz "vou pensar" ou trava nos documentos: por que ele
   some, por que o follow-up importa, a regra de respeito (insistir com
   educação e saber parar), o termômetro do lead, uma cadência SUGERIDA (não é
   regra da empresa), a anatomia da retomada, a mensagem certa para cada
   situação, áudio, família, registro do combinado e horários respeitosos.
   Fatos da empresa: só os do brief. Mensagens do robô copiadas literalmente;
   as do atendente são sugestões de roteiro. Ilustrações em 09-followup-figuras.tsx.
   Correção do dono (13/10): a revisão é dos juros do EMPRÉSTIMO PESSOAL, não do
   consignado; margem e portabilidade (consignado) são só gancho do canal de empréstimo. */
import type { Licao } from '../tipos';
import {
  Aviso, BomRuim, Celular, Conversa, Fatos, Frase, LinhaTempo, Lista, Passos, Sanfona, Secao, Tabela, TesteRapido,
} from '../pecas';
import {
  AnatomiaRetomada, ArvoreInsistir, CadenciaSugerida, ClassificarLead, FaixaHorarios, FichaCombinado, MapaSituacoes,
  PensamentosCliente, RoteiroAudio, TermometroLead, TrianguloFamilia, TrilhaTravas,
} from './09-followup-figuras';
import './09-followup.css';

/* Resumo que o cliente pode mostrar para a família (usado na conversa e nas mensagens prontas). */
const RESUMO_FAMILIA =
  'Resumo da análise (CAF – Central de Assessoria Financeira):\n\n' +
  '• É a revisão dos juros do empréstimo pessoal feito com as financeiras (Agibank, BMG, Facta, Mercantil ou Crefisa), para ver se há juros abusivos.\n' +
  '• Empréstimo pessoal não é o consignado: o consignado é descontado pelo INSS; o empréstimo pessoal é cobrado pela financeira, fora do INSS.\n' +
  '• Se houver juros abusivos, o advogado, Dr. Rafael Menezes, entra com uma ação pedindo o ressarcimento do que foi descontado nos últimos 10 anos nesses empréstimos pessoais.\n' +
  '• O resultado depende da análise de cada caso: ninguém pode garantir valor antes.\n' +
  '• Não se paga nada para começar. No final do processo, 30% do valor recebido ficam para o advogado, como honorários, tirados do próprio valor.\n' +
  '• Em média, o processo leva de 6 a 12 meses.\n' +
  '• As procurações são assinadas pelo gov.br, o sistema oficial do governo.\n' +
  '• Os documentos pedidos são a documentação básica do processo.\n\n' +
  'Se quiserem, posso explicar para vocês juntos. Qualquer dúvida, é só me chamar aqui.';

const corpo = (
  <>
    <p className="mv-lead">
      Todo atendente passa por isso: a conversa estava indo bem e, de repente, o cliente para de responder. Ou diz
      “vou pensar”. Ou empaca no aplicativo do Meu INSS e some. <b>Follow-up</b> (fala-se “fólou-âp”) é o nome que se dá
      a retomar esse contato. Feito do jeito certo, é um dos momentos mais importantes da venda: quem some nem sempre
      desistiu; muitas vezes só precisava de um lembrete, de uma ajuda ou de mais tempo. Feito do jeito errado, vira
      cobrança, irrita o cliente e queima a confiança na CAF. Nesta lição você vai aprender por que o cliente some,
      quando insistir e quando parar, um ritmo sugerido de mensagens, o que dizer em cada situação, como usar o áudio,
      como trazer a família para a conversa e como não perder o fio do que foi combinado.
    </p>

    <Fatos itens={[
      { grande: 'Sumir ≠ desistir', texto: 'O silêncio costuma ter um motivo simples: esqueceu, travou, ficou com dúvida ou foi falar com a família.' },
      { grande: 'Lembrar + ajudar', texto: 'Toda retomada lembra onde vocês pararam e oferece uma ajuda concreta. Nunca é cobrança.' },
      { grande: 'NÃO é NÃO', texto: 'Quem disse não, não é elegível ou pediu para parar: agradeça com carinho e não insista.' },
      { grande: '1 próximo passo', texto: 'Toda conversa, e toda retomada, termina com algo combinado: o quê, quando e como.' },
    ]} />

    <Secao titulo="O que é follow-up (e o que não é)">
      <p>
        <i>Follow-up</i> é uma expressão do inglês que quer dizer “acompanhamento”. Na prática, é cada mensagem que você
        manda para uma pessoa que parou no meio do caminho, com um único objetivo: <b>ajudar essa pessoa a dar o próximo
        passo</b>. E, se ela não quiser dar, encerrar com respeito.
      </p>
      <p>
        A diferença entre um follow-up que funciona e um que afasta está no tom. Compare as duas conversas abaixo. O
        cliente é o mesmo e parou no mesmo ponto: tinha topado a análise e ficou de mandar os documentos.
      </p>
      <BomRuim
        ruim={{
          titulo: 'Assim afasta',
          corpo: (
            <>
              <Celular contato="Seu Antônio" sub="cliente" bolhas={[
                { de: 'eu', texto: 'Oi', hora: '09:01' },
                { de: 'eu', texto: '??', hora: '09:15' },
                { de: 'eu', texto: 'Seu Antônio, o senhor sumiu. Cadê os documentos?', hora: '11:30' },
                { de: 'eu', texto: 'Última chance! Se não mandar hoje, perde a análise.', hora: '18:40' },
              ]} />
              <p className="mv-fu-obs">Cobra, põe culpa, inventa uma urgência que não existe e manda quatro mensagens seguidas sem resposta.</p>
            </>
          ),
        }}
        bom={{
          titulo: 'Assim ajuda',
          corpo: (
            <>
              <Celular contato="Seu Antônio" sub="cliente" bolhas={[
                { de: 'eu', texto: 'Oi, Seu Antônio! Aqui é [seu nome], da CAF. Passando pra lembrar da sua análise: pra gente seguir, falta a documentação. Não precisa mandar tudo de uma vez. Pode começar só pelo próximo documento que falta, que eu te guio no resto. Fica bom pra você?', hora: '10:05' },
                { de: 'cliente', texto: 'Desculpa, fiquei sem tempo. Mando hoje à noite', hora: '11:42' },
                { de: 'eu', texto: 'Sem problema nenhum! Fico no aguardo. Qualquer dúvida, me chama aqui.', hora: '11:44' },
              ]} />
              <p className="mv-fu-obs">Diz quem é, lembra onde pararam, pede um passo pequeno e termina com uma pergunta fácil. Sem culpa e sem pressa falsa.</p>
            </>
          ),
        }}
      />
      <Frase>Follow-up bom é um lembrete com ajuda dentro. Se a sua mensagem não ajuda em nada, ela é só cobrança.</Frase>
    </Secao>

    <Secao titulo="Por que o cliente some">
      <p>
        Antes de escrever qualquer retomada, tente entender o motivo do silêncio. O nosso cliente é, na maior parte, um
        aposentado ou pensionista do INSS. Muitos não têm intimidade com aplicativo, dividem o celular com alguém da casa,
        desconfiam (com razão) de qualquer contato sobre dinheiro e gostam de decidir junto com a família. O silêncio
        raramente é desfeita: é a vida acontecendo do outro lado da tela.
      </p>
      <p>
        Cada motivo pede uma resposta diferente. Mandar “e aí?” para quem travou no aplicativo não resolve nada; mandar o
        passo a passo, sim. Veja os pensamentos mais comuns por trás do silêncio e o que ajuda em cada um:
      </p>
      <PensamentosCliente />
      <p>
        O silêncio também costuma aparecer nos mesmos pontos do processo. Quanto melhor você conhecer o caminho que o
        cliente percorre na CAF, mais fácil fica prever onde ele pode parar e preparar a ajuda antes que ele trave.
      </p>
      <TrilhaTravas />
      <p>
        Repare que várias dessas paradas não são falta de interesse, são <b>trava</b>: o cliente quer seguir, mas esbarra
        numa dificuldade concreta. O aplicativo, a senha, a conta do gov.br no nível errado, um documento que não está à
        mão. O follow-up é a ferramenta para tirar essas travas do caminho.
      </p>
    </Secao>

    <Secao titulo="Por que o follow-up importa">
      <p>
        Pode parecer que o cliente que some “não queria tanto assim”. Não pense desse jeito. O follow-up é parte do
        trabalho, não um extra, por três motivos:
      </p>
      <Lista itens={[
        <><b>Pelo cliente.</b> Se ele paga juros abusivos num empréstimo pessoal com uma das financeiras, desistir no primeiro silêncio significa ele perder a chance de ter a análise e, se for o caso, de pedir o ressarcimento do que foi descontado nos últimos 10 anos. Retomar com educação é cuidar dele.</>,
        <><b>Pela CAF.</b> Cada contato chega pelos anúncios no Facebook, que são um investimento da empresa. Perder alguém por esquecimento, e não por decisão dele, é desperdício.</>,
        <><b>Por você.</b> Um cliente que trava e recebe ajuda passa a ver você como a pessoa que resolve. É assim que a confiança cresce, e cliente que confia vai até o fim.</>,
      ]} />
      <p>
        O processo da CAF tem várias etapas que dependem do cliente: responder às perguntas, decidir, entrar no Meu INSS,
        cuidar da conta gov.br, juntar os documentos, assinar as procurações. Em cada uma ele pode parar. Quem sabe fazer
        follow-up leva o cliente até o fim; quem não sabe vê as conversas morrerem pela metade.
      </p>
      <TesteRapido
        pergunta="Dona Rosa topou a análise ontem, ficou de mandar os documentos e não respondeu mais. Qual é a retomada mais útil?"
        opcoes={[
          '“Dona Rosa, a senhora sumiu! Cadê os documentos?”',
          'Lembrar onde pararam e pedir só o próximo documento',
          'Esperar ela voltar sozinha, sem mandar mensagem nenhuma',
        ]}
        certa={1}
        explica="Lembrar + ajudar + um passo pequeno (o próximo documento que falta, com a sua ajuda no resto). Cobrança afasta, e esperar parado deixa a conversa morrer."
      />
    </Secao>

    <Secao titulo="A regra de respeito: insistir com educação e saber parar">
      <p>
        Insistir não é feio. Feio é insistir do jeito errado, ou com a pessoa errada. A regra da CAF é clara:
        <b> quando o cliente diz NÃO, ou quando ele não é elegível, a gente agradece com carinho e não insiste.</b>
      </p>
      <p>
        <b>Insistir com educação</b> é lembrar sem cobrar, oferecer ajuda de verdade, espaçar as mensagens, variar o jeito
        (texto, áudio, resumo) e sempre deixar uma saída digna para o cliente. <b>Saber parar</b> é reconhecer os sinais de
        que a conversa acabou e encerrar bem. Use esta árvore antes de cada retomada:
      </p>
      <ArvoreInsistir />
      <p>
        O próprio robô da CAF já segue essa regra. No canal de juros abusivos, quando o cliente responde NÃO à pergunta da
        análise gratuita, o robô não insiste: deixa a porta aberta e encerra. É esse o comportamento que esperamos de você.
      </p>
      <Celular
        contato="Cliente"
        sub="canal de juros abusivos"
        legenda="O robô (texto exato) respeita o NÃO e deixa a porta aberta. Você não manda follow-up para esse cliente. O fluxo completo do robô está na lição 5."
        bolhas={[
          { de: 'robo', texto: 'Gostaria de fazer *análise gratuita* pra descobrir se você paga juros abusivos e recuperar valores?', hora: '15:20' },
          { de: 'robo', texto: 'Responda *SIM* ou *NÃO* 😊', hora: '15:20' },
          { de: 'cliente', texto: 'NÃO', hora: '15:31' },
          { de: 'robo', texto: 'Sem problema! 😊 Se mudar de ideia, é só mandar um *SIM* aqui a qualquer momento. A análise é gratuita e fica à sua disposição.', hora: '15:31' },
        ]}
      />
      <Aviso tom="rubro" titulo="Quando parar de vez">
        Pare quando o cliente: disse NÃO; não é elegível (não recebe benefício do INSS e ninguém da família recebe, ou não
        tem empréstimo pessoal em nenhuma das 5 financeiras: Agibank, BMG, Facta, Mercantil e Crefisa); pediu para não receber mais
        mensagens; ou respondeu irritado pedindo para parar. Nesses casos, a única mensagem que cabe é um agradecimento
        educado encerrando a conversa (se o robô ainda não encerrou), e mais nada. Se o cliente voltar por conta própria,
        atenda normalmente.
      </Aviso>
    </Secao>

    <Secao titulo="O termômetro do lead">
      <p>
        Nem todo cliente parado está no mesmo ponto. Para decidir o ritmo e o tipo de retomada, ajuda pensar num
        termômetro: o <b>lead</b> (a pessoa que chegou pelo anúncio e ainda está decidindo) pode estar <b>quente</b>,
        <b> morno</b> ou <b>frio</b>. E existe quem já está fora do termômetro: quem disse não ou não é elegível.
      </p>
      <TermometroLead />
      <p>
        O termômetro muda o tempo todo. Um lead frio que responde vira quente na hora; um quente que trava num aplicativo
        vira morno. Por isso, olhe a temperatura antes de cada toque, não só uma vez. Agora treine: classifique cada
        cliente abaixo.
      </p>
      <ClassificarLead />
    </Secao>

    <Secao titulo="Uma cadência sugerida">
      <Aviso tom="ambar" titulo="Isto é uma sugestão, não é regra da empresa">
        O ritmo abaixo serve para você entender a lógica do follow-up, por isso ele não tem número de dias.
        <b> Combine a cadência com o seu gestor</b>: é ele quem diz quantos toques, em que intervalo e em que horários a
        sua equipe trabalha. Uma regra vale sempre: <b>nunca mais de um toque por dia</b>.
      </Aviso>
      <p>
        <b>Cadência</b> é o ritmo dos contatos: quantos <b>toques</b> (tentativas) e com que intervalo. A lógica é simples:
        no começo, enquanto o assunto ainda está fresco na cabeça do cliente, os toques ficam mais próximos (logo depois,
        no dia seguinte); com o tempo, mais espaçados (alguns dias depois, mais adiante), até o último toque. E cada
        toque traz algo novo (um lembrete, uma ajuda, um áudio, um resumo), em vez de repetir a mesma mensagem. Repetir
        “oi, conseguiu?” cinco vezes não é cadência, é insistência vazia.
      </p>
      <CadenciaSugerida />
      <p>Antes de cada toque, qualquer que seja a cadência combinada, faça este checklist rápido:</p>
      <Passos itens={[
        { titulo: 'Leia a conversa inteira', texto: 'Veja onde vocês pararam, o que o cliente disse por último e se ele pediu algum prazo.' },
        { titulo: 'Confira se já saiu algum toque hoje', texto: 'Seu, de um colega ou automático. Nunca mais de um toque por dia: se já saiu um, o próximo fica para outro dia.' },
        { titulo: 'Veja o que foi combinado', texto: 'Se ficou combinado “segunda de manhã”, é segunda de manhã. Nem antes, nem depois.' },
        { titulo: 'Escolha o formato', texto: 'Texto para o que ele precisa reler; áudio para aproximar e explicar.' },
        { titulo: 'Confira o horário', texto: 'Se agora não é um bom horário para o cliente, deixe para o próximo horário bom.' },
      ]} />
    </Secao>

    <Secao titulo="A anatomia de uma boa retomada">
      <p>
        Uma retomada boa tem quatro partes, nesta ordem. Parece muita coisa, mas cabe em três ou quatro linhas. A parte
        mais esquecida é a terceira: pedir <b>um passo pequeno</b>. Quem recebe “manda os documentos” pensa na lista
        inteira e desanima; quem recebe “pode começar só pelo próximo documento que falta” consegue fazer agora.
      </p>
      <AnatomiaRetomada />
      <p>
        E qual é o “próximo documento”? A ordem sugerida é Meu INSS → gov.br → documentos pessoais (lições 10, 11 e 12),
        mas ela não é rígida: se o cliente tem outro documento à mão, ele pode mandar esse primeiro. O que importa é a
        conversa andar, um passo de cada vez.
      </p>
      <p>
        Sobre o tratamento: use o que o cliente usa. Muitos idosos gostam de “o senhor” e “a senhora”; outros preferem
        “você”. Se ficar em dúvida, comece com “o senhor” ou “a senhora” e acompanhe o jeito dele. As mensagens prontas desta
        lição usam “você”: troque quando fizer sentido.
      </p>
    </Secao>

    <Secao titulo="A mensagem certa para cada situação">
      <p>
        Cada trava pede uma retomada diferente. Escolha a situação abaixo para ver como você percebe o problema, o que
        costuma estar por trás, o objetivo da mensagem, uma sugestão de texto (com botão de copiar) e o que fazer se não
        vier resposta.
      </p>
      <MapaSituacoes />
      <p>Agora, duas retomadas dando certo, do começo ao fim. Repare como cada mensagem resolve uma coisa só.</p>
      <div className="mv-fu-duas">
        <Celular
          contato="Dona Lúcia"
          sub="travou no Meu INSS"
          legenda="Áudio para aproximar, pergunta para achar a trava e um combinado com data."
          bolhas={[
            { de: 'eu', texto: 'Oi, Dona Lúcia! Aqui é [seu nome], da CAF. Ontem a senhora estava tentando entrar no Meu INSS. Vou mandar um áudio explicando, bem rapidinho.', hora: '09:40' },
            { de: 'eu', tipo: 'audio', hora: '09:40' },
            { de: 'cliente', texto: 'Ouvi sim. Eu não lembro a senha do gov', hora: '10:15' },
            { de: 'eu', texto: 'Sem problema, isso acontece muito. Alguém aí da casa costuma ajudar a senhora com o celular?', hora: '10:17' },
            { de: 'cliente', texto: 'Meu neto vem no sábado', hora: '10:20' },
            { de: 'eu', texto: 'Ótimo! Então combinamos assim: no sábado vocês tentam juntos e, se ele quiser, pode me chamar aqui. Na segunda de manhã eu falo com a senhora de novo, tudo bem?', hora: '10:21' },
            { de: 'cliente', texto: 'Tá bom, obrigada', hora: '10:24' },
          ]}
        />
        <Celular
          contato="Seu Pedro"
          sub="canal de empréstimo · sem margem"
          legenda="Honestidade sobre a margem e os caminhos, sempre como possibilidade. Margem e portabilidade são do consignado; a revisão é do empréstimo pessoal."
          bolhas={[
            { de: 'eu', texto: 'Oi, Seu Pedro! Aqui é [seu nome], da CAF. Sei que o senhor queria um valor rápido e que hoje não há margem para um consignado novo. Mas não quero deixar o senhor sem caminho.', hora: '14:10' },
            { de: 'eu', texto: 'Dá pra ver a possibilidade de aumentar a margem, de fazer a portabilidade dos consignados pra outro banco, que pode liberar um valor acima de R$ 1.500, e a revisão dos juros do empréstimo pessoal que o senhor já tem. Tudo depende da análise do caso, mas quer que eu explique?', hora: '14:10' },
            { de: 'cliente', texto: 'Empréstimo pessoal não é a mesma coisa que consignado?', hora: '16:02' },
            { de: 'eu', texto: 'Não é, não. O consignado é descontado pelo INSS, direto do benefício. O empréstimo pessoal é cobrado pela financeira, fora do INSS, e em geral tem juros bem mais altos. A revisão olha os juros do empréstimo pessoal.', hora: '16:04' },
            { de: 'cliente', texto: 'E essa revisão é de graça mesmo?', hora: '16:06' },
            { de: 'eu', texto: 'O senhor não paga nada pra começar. A única coisa é no final do processo: 30% do valor que o senhor receber ficam pro advogado, como honorários, tirados do próprio valor.', hora: '16:08' },
            { de: 'cliente', texto: 'Entendi. Pode explicar sim', hora: '16:12' },
          ]}
        />
      </div>
      <Aviso tom="azul" titulo="Consignado ou empréstimo pessoal? Não confunda na retomada">
        O <b>consignado</b> é descontado pelo INSS, direto do benefício, e depende de margem: é dele que falam o “sem
        margem”, o aumento de margem e a portabilidade dos consignados. O <b>empréstimo pessoal</b> é cobrado pela
        financeira, fora do INSS, não usa a margem e em geral tem juros bem mais altos: <b>é nele que a CAF olha os juros
        abusivos</b>. Se o cliente não souber qual é qual, explique do jeito mais simples: “é aquele empréstimo que a
        financeira cobra na sua conta, e não o que o INSS desconta direto do benefício”. A diferença completa está na lição 3.
      </Aviso>
      <TesteRapido
        pergunta="Dona Cida tentou assinar as procurações e não conseguiu: a conta gov.br dela está no nível bronze. O que a sua retomada deve explicar?"
        opcoes={[
          'Que a conta precisa subir para prata ou ouro, com a sua ajuda',
          'Que ela precisa ir pessoalmente a uma agência do INSS para assinar',
          'Que, sem a assinatura de hoje, o processo dela já foi cancelado',
        ]}
        certa={0}
        explica="Conta bronze não assina. Para assinar pelo gov.br, a conta precisa ser prata (validação com conta bancária) ou ouro (reconhecimento facial). Ofereça o passo a passo da lição 13."
      />
    </Secao>

    <Secao titulo="O áudio no follow-up">
      <p>
        Para muitos clientes, principalmente os mais velhos, ouvir é mais fácil do que ler. E a voz faz uma coisa que o
        texto não faz: mostra que existe uma pessoa de verdade, com nome, do outro lado. Por isso o áudio é um ótimo
        recurso de retomada, especialmente para quem desconfia ou para quem travou num passo difícil.
      </p>
      <p>
        Mas áudio tem hora. O que o cliente vai precisar reler ou copiar (a lista de documentos, os passos do aplicativo,
        um e-mail) vai sempre por texto. Muitas vezes o ideal é a dupla: <b>um áudio curto explicando e, logo depois, um
        texto com os passos</b>.
      </p>
      <Tabela
        colunas={['', 'Texto', 'Áudio']}
        destaque={0}
        linhas={[
          ['Melhor para', 'Listas, passos, e-mail: tudo o que ele vai reler ou copiar', 'Aproximar, acalmar, explicar uma ideia, quebrar a desconfiança'],
          ['Tamanho', 'Três ou quatro linhas por mensagem', 'Curto: uns 30 segundos, um assunto só'],
          ['Cuidado', 'Paredão de texto cansa e assusta', 'Áudio longo não é ouvido até o fim; vários seguidos incomodam'],
          ['No follow-up', 'Primeiro toque, lembretes, passo a passo', 'Quando o texto não funcionou, ou para quem prefere ouvir'],
        ]}
      />
      <p>Um bom áudio de retomada segue a mesma anatomia da mensagem escrita, só que falada:</p>
      <RoteiroAudio />
      <Lista itens={[
        'Fale devagar, com calma, num lugar sem barulho.',
        'Diga seu nome e “da CAF” logo no começo, sempre.',
        'Um assunto por áudio. Se precisar explicar duas coisas, faça dois áudios curtos ou mande uma parte por texto.',
        'Ouça antes de mandar. Se ficou confuso, grave de novo.',
        'Termine com uma pergunta e mande os passos por texto em seguida.',
      ]} />
    </Secao>

    <Secao titulo="Quando a família entra na conversa">
      <p>
        É muito comum o cliente dizer “vou falar com meu filho” ou pedir para um neto ajudar com o celular. Isso é bom: um
        familiar de confiança pode tirar a desconfiança, ajudar no Meu INSS e no gov.br e dar segurança para o cliente
        decidir. O cuidado é um só: <b>o cliente é o dono da conversa</b>. O familiar entra com a permissão dele.
      </p>
      <TrianguloFamilia />
      <Lista itens={[
        <>Pergunte antes: “O senhor quer que eu explique para o seu filho também?”</>,
        <>Só fale de dados do cliente (CPF, benefício, empréstimos, documentos) com quem ele autorizou.</>,
        <>Mande um <b>resumo por escrito</b> que a família possa ler com calma.</>,
        <>Combine o próximo passo com o cliente, mesmo que o familiar esteja ajudando.</>,
        <>Se o familiar pedir para seguir só com ele, confirme com o cliente antes.</>,
      ]} />
      <div className="mv-fu-conv">
        <Conversa
          titulo="O cliente vai falar com o filho"
          nota="Sugestão de roteiro. Adapte ao cliente."
          falas={[
            { quem: 'cliente', texto: 'Gostei, mas vou falar com meu filho primeiro.' },
            { quem: 'eu', texto: 'Claro, Seu Antônio, conversar com a família é sempre bom. Vou mandar um resumo curtinho pro senhor mostrar pra ele.' },
            { quem: 'eu', texto: RESUMO_FAMILIA },
            { quem: 'eu', texto: 'E se o seu filho quiser, pode me chamar aqui, ou o senhor me passa o contato dele, que eu explico tudo pra ele também. Posso chamar o senhor na quinta pra saber o que vocês decidiram?' },
            { quem: 'cliente', texto: 'Pode sim. Vou mandar pra ele hoje.' },
          ]}
        />
      </div>
      <Aviso tom="azul" titulo="Não confunda: familiar que ajuda × familiar que recebe">
        Aqui o familiar é um <b>ajudante</b>. É outra situação quando quem recebe o benefício do INSS é o familiar, e não a
        pessoa que chamou: aí a análise segue pelo benefício do familiar, e os documentos (Meu INSS, imposto de renda, CPF,
        identidade, foto do rosto, comprovante, e-mail) são <b>do familiar que recebe</b>. Na dúvida, pergunte ao gestor.
        A rota do familiar está na lição 4.
      </Aviso>
    </Secao>

    <Secao titulo="Registrar o que foi combinado">
      <p>
        Follow-up sem anotação vira bagunça: você esquece o dia combinado, um colega manda a mesma mensagem, o cliente
        recebe duas cobranças e perde a confiança. Por isso, ao fim de cada conversa (e de cada toque), registre o que
        aconteceu. <b>Onde</b> registrar depende de como a sua equipe trabalha: o seu gestor vai te mostrar. O que importa
        aqui é <b>o que</b> anotar.
      </p>
      <FichaCombinado />
      <p>Com uma anotação assim, qualquer pessoa da equipe entende o caso em dez segundos. Veja como ela guiou o caso da Dona Lúcia (exemplo fictício):</p>
      <LinhaTempo itens={[
        { quando: 'Quarta, manhã', titulo: 'Travou no Meu INSS', texto: 'Topou a análise, tentou entrar no aplicativo, disse que “deu erro na senha” e parou de responder.' },
        { quando: 'Quarta, tarde', titulo: 'Toque 1: texto', texto: 'Logo depois: lembrete leve, com o caminho do aplicativo. Sem resposta. E mais nada nesse dia: um toque só.' },
        { quando: 'Quinta, manhã', titulo: 'Toque 2: áudio + passos', texto: 'Ela respondeu: não lembra a senha do gov.br; o neto vem no sábado. Combinado anotado.' },
        { quando: 'Sábado', titulo: 'Você não manda nada', texto: 'O dia é deles. Mensagem no meio do combinado atrapalha.' },
        { quando: 'Segunda, manhã', titulo: 'Retomada combinada', texto: '“Deu certo com o seu neto?” Com a ajuda dele, ela entrou no aplicativo e mandou o primeiro extrato.' },
        { quando: 'Depois', titulo: 'Volta a ser atendimento', texto: 'A conversa segue normalmente para o próximo documento.' },
      ]} />
      <Aviso tom="verde" titulo="Promessa sua também é combinado">
        Se você disse “segunda eu te chamo”, chame na segunda. Cliente que é esquecido por quem prometeu dificilmente
        volta a confiar.
      </Aviso>
    </Secao>

    <Secao titulo="Horários respeitosos">
      <p>
        Uma mensagem fora de hora pode estragar uma retomada perfeita. Pense no dia do cliente: muitos acordam cedo,
        descansam depois do almoço e dormem cedo. Notificação de madrugada ou tarde da noite assusta e irrita, e quem já
        desconfia de golpe desconfia ainda mais.
      </p>
      <FaixaHorarios />
      <Lista itens={[
        'Evite horários inconvenientes: madrugada, muito cedo, tarde da noite.',
        'Se o cliente disse um horário, vale o horário dele.',
        'Passou da hora? Deixe a mensagem para o próximo horário bom, em vez de mandar agora.',
        'Os horários de trabalho e de envio da sua equipe, combine com o seu gestor.',
      ]} />
      <TesteRapido
        pergunta="Na quarta, Seu Carlos disse: “me chama na segunda, que a minha filha vem aqui e me ajuda”. O que você faz?"
        opcoes={[
          'Manda mensagem na quinta e na sexta, para ele não esquecer',
          'Desiste: quem pede prazo não está interessado de verdade',
          'Anota o combinado e retoma na segunda, no horário dele',
        ]}
        certa={2}
        explica="Prazo pedido é combinado: respeite, no dia e no horário em que a filha estiver lá. Mandar antes parece que você não ouviu; desistir joga fora um lead morno que só precisava de tempo."
      />
    </Secao>

    <Secao titulo="Perguntas frequentes">
      <Sanfona itens={[
        {
          titulo: 'Ele visualizou e não respondeu. É falta de educação?',
          corpo: <p>Normalmente, não. Muita gente lê na hora, deixa para responder depois e esquece. Outros não sabem o que responder, ou estão esperando alguém da família. Não comente o “visualizou” (“vi que o senhor leu…”): isso soa como cobrança. Siga a cadência normalmente.</p>,
        },
        {
          titulo: 'O cliente respondeu irritado, pedindo para parar. E agora?',
          corpo: <p>Pare na hora. Se couber, mande uma única mensagem curta pedindo desculpas pelo incômodo e dizendo que não vai mais mandar mensagens. Registre o pedido para ninguém da equipe mandar de novo e avise o seu gestor se achar necessário. Insistir aqui só piora a imagem da CAF.</p>,
        },
        {
          titulo: 'Posso ligar para o cliente?',
          corpo: <p>Depende de como a sua equipe trabalha: pergunte ao seu gestor. Se for permitido, combine antes pelo WhatsApp (“posso te ligar dois minutinhos?”). Ligação de número desconhecido, sem aviso, assusta e parece golpe para muita gente.</p>,
        },
        {
          titulo: 'Quem respondeu foi outra pessoa (filho, vizinho) no número do cliente.',
          corpo: <p>Confirme com educação com quem você está falando. Dados do cliente (CPF, benefício, empréstimos, documentos) só com quem ele autorizou. Peça para falar com o cliente, ou para ele confirmar que essa pessoa pode ajudar.</p>,
        },
        {
          titulo: 'Um colega já mandou mensagem para esse cliente hoje. Mando também?',
          corpo: <p>Não. Nunca mais de um toque por dia, contando os de todo mundo. Leia a conversa inteira antes de cada toque: duas pessoas mandando retomada no mesmo dia parece descontrole e incomoda. Uma conversa, uma voz. Se não souber quem está cuidando do cliente, pergunte ao gestor.</p>,
        },
        {
          titulo: 'O cliente sumiu e voltou semanas depois. Começo do zero?',
          corpo: <p>Não. Leia o histórico, cumprimente com alegria (“que bom falar com o senhor de novo!”) e retome de onde parou, sem cobrança. Confira se algum documento precisa ser atualizado: o comprovante de residência, por exemplo, tem que ser do mês atual ou do mês passado. Na dúvida sobre outros documentos, pergunte ao gestor.</p>,
        },
        {
          titulo: 'Quantas vezes posso mandar mensagem?',
          corpo: <p>Não existe número mágico nesta lição. A cadência sugerida é um ponto de partida; o número de toques e o intervalo você combina com o seu gestor. Duas regras valem sempre: nunca mais de um toque por dia, e quem disse NÃO não recebe toque nenhum. Na dúvida, menos é mais: um toque útil vale mais que cinco lembretes vazios.</p>,
        },
      ]} />
    </Secao>

    <Secao titulo="Resumo da lição">
      <Lista itens={[
        <>Sumir não é desistir. Descubra a <b>trava</b> (dúvida, aplicativo, família, desconfiança) e responda a ela.</>,
        <>Toda retomada tem quatro partes: <b>quem é você, onde pararam, um passo pequeno com ajuda e uma pergunta fácil</b>.</>,
        <>Disse NÃO, não é elegível ou pediu para parar: <b>agradeça com carinho e não insista</b>.</>,
        <>A cadência desta lição é <b>sugestão</b>: combine a sua com o gestor, <b>nunca mais de um toque por dia</b>, respeite o prazo que o cliente pedir e feche com uma despedida com porta aberta.</>,
        <>Áudio curto aproxima; o que precisa ser relido vai por texto. A família entra só com a <b>permissão do cliente</b>.</>,
        <>Anote o que foi combinado, cumpra o que você prometeu e mande mensagens em <b>horários respeitosos</b>.</>,
      ]} />
    </Secao>
  </>
);

const licao: Licao = {
  id: 'followup',
  modulo: 'venda',
  titulo: 'Follow-up: quando o cliente some',
  resumo: 'O que fazer quando o cliente para de responder, diz “vou pensar” ou trava nos documentos: insistir com educação, saber parar e a mensagem certa para cada situação.',
  minutos: 25,
  corpo,
  questoes: [
    {
      p: 'Você mandou uma retomada para Dona Neusa hoje de manhã e ela não respondeu. O que fazer à tarde?',
      o: [
        'Mandar um áudio à tarde, já que o texto não funcionou',
        'Esperar outro dia: nunca mais de um toque por dia',
        'Pedir a um colega que mande, para variar a voz',
      ],
      c: 1,
      e: 'Nunca mais de um toque por dia, contando o seu, o de colegas e o automático. O próximo toque fica para outro dia, num horário bom.',
    },
    {
      p: 'Sobre a cadência de follow-up apresentada nesta lição, o que é correto?',
      o: [
        'É sugestão: a de verdade você combina com o gestor',
        'É regra fixa da empresa: cinco toques, em dias fixos',
        'Não há cadência: manda mensagem sempre que lembrar',
      ],
      c: 0,
      e: 'A lição traz um ritmo sugerido, sem número de dias. Quantos toques e em que intervalo, você combina com o seu gestor.',
    },
    {
      p: 'Seu Antônio topou a análise, recebeu a lista de documentos e parou de responder. Qual retomada ajuda mais?',
      o: [
        'Reenviar a lista inteira e pedir tudo até o fim do dia',
        'Avisar que, sem os documentos hoje, a análise é cancelada',
        'Lembrar onde pararam e pedir só o próximo documento',
      ],
      c: 2,
      e: 'Lembrar + ajudar + um passo pequeno: o próximo documento que falta, com a sua ajuda no resto. Lista inteira desanima e pressa falsa afasta.',
    },
    {
      p: 'Seu Antônio disse: “vou falar com meu filho”. Qual é a melhor resposta?',
      o: [
        'Dizer que a análise só vale até hoje, para ele decidir logo',
        'Mandar um resumo para mostrar ao filho e combinar a retomada',
        'Pedir o número do filho e mandar os dados do pai direto a ele',
      ],
      c: 1,
      e: 'Decidir em família é legítimo. Resumo por escrito e data combinada; dados do cliente só com quem ele autorizar. Nada de urgência falsa.',
    },
    {
      p: 'Qual é o melhor uso do áudio no follow-up?',
      o: [
        'Áudio curto e calmo, com os passos depois por texto',
        'A lista de documentos num áudio de uns três minutos',
        'Vários áudios seguidos, para mostrar que você se empenha',
      ],
      c: 0,
      e: 'Áudio curto aproxima e explica; o que o cliente precisa reler ou copiar (passos, lista, e-mail) vai por texto.',
    },
  ],
  glossario: [
    { termo: 'Follow-up', def: 'Retomar o contato com um cliente que parou de responder ou ficou de dar uma resposta. É lembrar e ajudar, nunca cobrar.' },
    { termo: 'Retomada', def: 'A mensagem (ou áudio) que você manda para reabrir uma conversa parada, sempre com um próximo passo fácil.' },
    { termo: 'Toque', def: 'Cada tentativa de retomar o contato no follow-up: um texto, um áudio, ou um áudio curto com os passos por texto mandados juntos. Nunca mais de um toque por dia.' },
    { termo: 'Cadência', def: 'O ritmo dos toques: quantos e com que intervalo. A desta lição é sugestão; a de verdade você combina com o seu gestor. Nunca mais de um toque por dia.' },
    { termo: 'Termômetro do lead', def: 'Jeito de classificar o interesse do cliente em quente, morno ou frio, para decidir o ritmo e o tipo de retomada.' },
    { termo: 'Trava', def: 'O ponto em que o cliente empacou: o aplicativo do Meu INSS, a conta gov.br, um documento, a decisão em família. A retomada tenta tirar a trava do caminho.' },
    { termo: 'Despedida com porta aberta', def: 'A última mensagem da cadência: avisa, com carinho, que você não vai mais insistir e que o cliente pode chamar quando quiser.' },
  ],
  mensagens: [
    {
      titulo: 'Retomada leve (parou nas perguntas)',
      quando: 'O cliente parou de responder no meio da qualificação.',
      texto: 'Oi, [nome]! Aqui é [seu nome], da CAF. A nossa conversa parou ali no meio, sem problema nenhum. Pra eu seguir com a sua análise gratuita, só preciso de uma resposta: você recebe algum benefício do INSS?',
    },
    {
      titulo: 'Lembrete dos documentos',
      quando: 'O cliente topou, mas não mandou os documentos.',
      texto: 'Oi, [nome]! Aqui é [seu nome], da CAF. Passando pra lembrar da sua análise: pra gente seguir, falta a documentação. Não precisa mandar tudo de uma vez. Pode começar só pelo próximo documento que falta, que eu te guio no resto. Combinado?',
    },
    {
      titulo: 'Ajuda com o Meu INSS',
      quando: 'O cliente travou no aplicativo do Meu INSS.',
      texto: 'Oi, [nome]! O aplicativo do Meu INSS confunde mesmo, fica tranquilo(a). Vamos devagar, um passo de cada vez:\n1. Abra o aplicativo Meu INSS\n2. Entre com a sua senha do gov.br\n3. Toque na busca “Do que você precisa?”\n4. Digite: extrato de empréstimo\nMe conta em qual desses passos parou, que eu te ajudo dali. Se preferir, te mando um áudio explicando.',
    },
    {
      titulo: 'Resumo para mostrar à família',
      quando: 'O cliente vai conversar com o filho ou outro familiar antes de decidir.',
      texto: RESUMO_FAMILIA,
    },
    {
      titulo: 'Despedida com porta aberta',
      quando: 'Último toque da cadência, depois de várias tentativas sem resposta.',
      texto: 'Oi, [nome]! Aqui é [seu nome], da CAF. Tentei falar com você nos últimos dias e imagino que a rotina esteja corrida. Não vou mais te incomodar com mensagens sobre a análise. Quando quiser retomar, é só me mandar um oi aqui que eu continuo de onde paramos. Um abraço!',
    },
  ],
};
export default licao;
