/* Lição 12 — Documentos pessoais. A documentação básica do próprio cliente:
   RG ou CNH (frente e verso), foto do rosto, comprovante de residência (do mês
   atual ou do mês passado; no nome de outra pessoa → documento com foto dela +
   declaração de residência) e e-mail (do uso do cliente; se não tiver, a gente
   cria). Como pedir, como orientar a foto, como conferir e como receber pelo
   WhatsApp, com mensagens prontas e checklist.
   Fatos da empresa: só os do brief (áudio do dono de 13/10 + processo oficial
   do robô). Mensagens do robô copiadas literalmente; as do atendente são
   sugestões de roteiro. Todo documento desenhado é fictício (dados de exemplo).
   Ilustrações e treinos próprios em 12-pessoais-figuras.tsx. */
import type { Licao } from '../tipos';
import { Aviso, Celular, Conversa, Fatos, Frase, Lista, Passos, Sanfona, Secao, Tabela, TesteRapido } from '../pecas';
import {
  AnatomiaEmail, ArvoreComprovante, CalendarioComprovante, ChecklistPessoais, ClassificaComprovante, ConferidorEmail,
  ContaIlustrada, GradeFotos, IdentidadeIlustrada, OutraPessoa, PacoteDocumentos, PedidosPorDocumento, PosicaoCelular,
  SelfieGuia,
} from './12-pessoais-figuras';
import './12-pessoais.css';

const corpo = (
  <>
    <p className="mv-lead">
      Na ordem sugerida, depois dos documentos do Meu INSS e do gov.br, vem a parte que todo mundo acha fácil: os
      <b> documentos pessoais</b> do cliente. São quatro: o <b>RG ou a CNH</b> (frente e verso), uma <b>foto do rosto</b>, um
      <b> comprovante de residência</b> recente e o <b>e-mail</b>. Parece simples, mas é aqui que um detalhe faz você
      pedir tudo de novo: uma foto escura, uma conta antiga, um e-mail com uma letra trocada. E pedir de novo cansa o
      cliente, que muitas vezes é idoso e pouco acostumado com o celular. Nesta lição você vai ver cada documento
      desenhado, aprender a diferença entre uma foto boa e uma ruim, a regra do mês do comprovante, o que fazer quando a
      conta está no nome de outra pessoa e como pedir e conferir o e-mail. No fim, tem mensagens prontas e um checklist
      para usar no dia a dia.
    </p>

    <Fatos itens={[
      { grande: '4 documentos', texto: 'RG ou CNH, foto do rosto, comprovante de residência e e-mail.' },
      { grande: '2 fotos', texto: 'A identidade vai sempre em duas fotos: a frente e o verso.' },
      { grande: '2 meses', texto: 'O comprovante tem que ser do mês atual ou do mês passado. Atrasado não serve.' },
      { grande: '1 e-mail', texto: 'Do uso do próprio cliente. Não tem? A gente cria um para ele.' },
    ]} />

    <Secao titulo="Os quatro documentos e para onde eles vão">
      <p>
        Pense nos documentos pessoais como a identificação do cliente no processo: <b>quem ele é</b> (a identidade),
        <b> que é ele mesmo quem está pedindo</b> (a foto do rosto), <b>onde ele mora</b> (o comprovante) e um
        <b> e-mail</b> dele. Com os quatro conferidos, junto com os documentos do Meu INSS e do gov.br, o cliente pode
        ser cadastrado no sistema admin, que gera as procurações para ele assinar pelo gov.br.
      </p>
      <PacoteDocumentos />
      <Aviso tom="azul" titulo="Rota do familiar: os documentos são de quem recebe">
        Quando a análise segue pelo benefício de um familiar (a rota do familiar, da lição 4), os documentos pessoais
        também são <b>do familiar que recebe</b>: a identidade, a foto do rosto, o comprovante de residência e o e-mail
        são dele, mesmo que quem converse com você seja outra pessoa (o filho que procurou a CAF, por exemplo). Na
        dúvida, pergunte ao gestor.
      </Aviso>
      <p>
        <b>Em que momento pedir?</b> A ordem sugerida é Meu INSS, depois gov.br, depois os documentos pessoais. Mas ela
        não é rígida: o cliente pode mandar primeiro o que tiver em mãos. No canal de empréstimo, por exemplo, a IA já
        manda a lista de documentos logo no começo da conversa, junto com o aviso de que a análise foi pré-aprovada:
      </p>
      <Celular
        contato="Maria (exemplo)"
        sub="cliente · canal de empréstimo"
        legenda="Trecho da mensagem da IA (texto exato). A mensagem continua com um aviso sobre o comprovante e os tipos de conta aceitos."
        bolhas={[
          { de: 'robo', texto: 'Boa notícia, Maria! Sua análise foi *pré-aprovada*.', hora: '11:20' },
          { de: 'robo', texto: '*📁 | DOCUMENTAÇÃO NECESSÁRIA:*\n- RG OU CNH *(FRENTE/VERSO)*\n- COMPROVANTE DE RESIDÊNCIA\n- FOTO DO ROSTO\n- E-MAIL (DO SEU USO)', hora: '11:20' },
        ]}
      />
      <p>
        Por isso, no canal de empréstimo, às vezes o cliente já começou a mandar documentos antes de você assumir a
        conversa. Antes de pedir qualquer coisa, <b>role a conversa para cima e veja o que já chegou</b>: pedir de novo
        um documento que o cliente já mandou passa a impressão de que ninguém está prestando atenção. No canal de juros
        abusivos, o robô não pede documentos. Quem pede é você, quando o cliente já decidiu seguir com o processo.
      </p>
      <Aviso tom="ambar" titulo="“Pré-aprovada” não é valor liberado">
        Ao pedir os documentos no canal de empréstimo, <b>não reforce a expectativa de “pré-aprovada”</b>: ela quer
        dizer que a análise inicial passou nas primeiras perguntas, não que existe valor liberado (a explicação completa
        está na lição 5).
      </Aviso>
      <Aviso tom="azul" titulo="“Por que tanto documento?”">
        É uma pergunta comum, e a resposta oficial é simples: <b>é a documentação básica do procedimento, nada fora do
        normal</b>. Diga isso com tranquilidade e, se o cliente quiser, explique para que serve cada um. Nesta lição
        você vai aprender o motivo de cada documento, justamente para saber explicar.
      </Aviso>
    </Secao>

    <Secao titulo="Identidade: RG ou CNH, sempre frente e verso">
      <p>
        Vale o <b>RG</b> (a carteira de identidade) ou a <b>CNH</b> (a carteira de motorista). Um dos dois basta. O que
        não pode faltar é o detalhe que mais se esquece: <b>os dois lados</b>. Em qualquer um deles, as informações
        ficam espalhadas pela frente e pelo verso. Uma foto só, de um lado só, é um documento pela metade. Veja no
        desenho abaixo e troque entre RG e CNH:
      </p>
      <IdentidadeIlustrada />
      <p>Quando as fotos chegarem, confira uma por uma:</p>
      <Lista itens={[
        'Chegaram duas fotos: a frente e o verso.',
        'O documento aparece inteiro, com as quatro pontas dentro da foto.',
        'Dá para ler o nome, a data de nascimento e os números sem esforço.',
        'A foto da pessoa no documento está visível, sem brilho e sem dedo na frente.',
        'O nome é o mesmo que o cliente informou no começo da conversa (na rota do familiar, o do familiar que recebe).',
      ]} />
      <Aviso tom="ambar" titulo="Documento de outra pessoa por engano">
        Quando um filho ou um neto ajuda a mandar as fotos, às vezes chega o documento de quem está ajudando. Por isso,
        sempre compare o nome do documento com o nome do cliente. Se não bater, agradeça e peça o documento certo, sem
        constrangimento.
      </Aviso>
    </Secao>

    <Secao titulo="Foto boa × foto ruim">
      <p>
        Os problemas mais comuns numa foto de documento são cinco: <b>cortada</b>, <b>escura</b>, <b>com reflexo</b>,
        <b> tremida</b> e <b>de um lado só</b>. Conhecer cada um ajuda duas vezes: você reconhece o problema na hora e já
        sabe explicar ao cliente o que fazer diferente. Clique em cada foto:
      </p>
      <GradeFotos />
      <p>
        Repare que a mensagem para pedir de novo sempre faz três coisas: <b>agradece</b>, <b>diz o que aconteceu sem
        culpar ninguém</b> (“a foto ficou escura”, e não “o senhor tirou errado”) e <b>ensina exatamente o que fazer
        diferente</b>. Pedir de novo é normal. O que cansa o cliente é não entender o porquê, ou receber o pedido dias
        depois, quando ele achava que estava tudo certo.
      </p>
      <TesteRapido
        pergunta="A foto do RG chegou inteira e nítida, mas com uma mancha branca de brilho bem em cima do número do documento. O que você faz?"
        opcoes={['Aceita: o resto da foto está ótimo e dá para seguir', 'Pede outra foto, fora do plástico e sem flash', 'Pede a CNH no lugar do RG, para evitar o brilho']}
        certa={1}
        explica="Brilho esconde justamente a informação que está embaixo. A causa costuma ser o flash ou o plástico: peça outra foto sem os dois. Não precisa trocar de documento."
      />
    </Secao>

    <Secao titulo="Como ensinar o cliente a fotografar um documento">
      <p>
        Muitos clientes nunca fotografaram um documento. Em vez de esperar a foto ruim chegar, mande a dica junto com o
        pedido. A posição do celular e a luz resolvem quase tudo:
      </p>
      <PosicaoCelular />
      <Passos itens={[
        { titulo: 'Tirar o documento do plástico', texto: 'A capa plástica é uma das maiores causas de brilho na foto.' },
        { titulo: 'Colocar sobre uma mesa lisa', texto: 'De preferência escura: o contraste mostra bem onde o documento começa e termina.' },
        { titulo: 'Ir para perto de uma janela, de dia', texto: 'Luz natural é a melhor. Flash desligado.' },
        { titulo: 'Segurar o celular reto, bem em cima', texto: 'Paralelo à mesa, como quem olha o documento de cima. Cotovelos apoiados para não tremer.' },
        { titulo: 'Enquadrar o documento inteiro', texto: 'As quatro pontas aparecendo, com uma bordinha da mesa em volta.' },
        { titulo: 'Tocar na tela em cima do documento', texto: 'Na maioria dos celulares, isso ajuda a câmera a focar. Esperar um segundinho até a imagem ficar firme e então fotografar.' },
        { titulo: 'Virar e repetir para o verso', texto: 'São sempre duas fotos: frente e verso.' },
        { titulo: 'Olhar a foto antes de mandar', texto: 'Dá para ler tudo? Se não der, tira de novo ali mesmo.' },
      ]} />
      <Aviso tom="verde" titulo="Se o cliente tem dificuldade">
        Sugira que peça ajuda a alguém de casa (um filho, um neto). Explique um passo de cada vez e espere ele fazer
        antes de mandar o próximo. Às vezes um áudio curto e calmo funciona melhor do que um texto longo. E elogie cada
        acerto: quem tem pouca prática com o celular ganha confiança quando ouve “ficou ótima”.
      </Aviso>
    </Secao>

    <Secao titulo="Foto do rosto: para que serve e como orientar">
      <p>
        A foto do rosto é a que mais gera dúvida, e às vezes desconfiança. A razão é simples e você precisa saber
        explicar: ela serve para <b>confirmar que é a própria pessoa fazendo, e não outra pessoa no nome dela</b>. Junto
        com a foto do documento, ela mostra que quem está pedindo é mesmo o dono daquele RG ou daquela CNH. Ou seja: é
        uma proteção para o próprio cliente.
      </p>
      <p>
        Ela pode ser uma selfie ou tirada por alguém de casa. O importante é o rosto bem visível, para dar para comparar
        com a foto do documento. Os cinco pontos abaixo resolvem quase todos os problemas:
      </p>
      <SelfieGuia />
      <Conversa
        titulo="Quando o cliente estranha o pedido"
        nota="Sugestão de roteiro, adapte ao cliente"
        falas={[
          { quem: 'cliente', texto: 'Pra que vocês precisam de uma foto do meu rosto? Achei estranho.' },
          { quem: 'eu', texto: 'Entendo, Dona Maria, é bom perguntar mesmo! A foto do rosto serve para confirmar que é a senhora quem está fazendo o pedido, e não outra pessoa no seu nome. É uma proteção para a senhora.' },
          { quem: 'cliente', texto: 'Ah, entendi. E por que precisa de tanto documento?' },
          { quem: 'eu', texto: 'É a documentação básica do procedimento, nada fora do normal. A foto pode ser uma selfie mesmo: de frente, num lugar claro, sem óculos escuros. Se preferir, alguém de casa tira para a senhora.' },
        ]}
      />
    </Secao>

    <Secao titulo="Comprovante de residência: o que vale">
      <p>
        O comprovante mostra <b>onde o cliente mora hoje</b>. Por isso ele precisa ser uma conta da casa e precisa ser
        recente. Os tipos aceitos são os mesmos da lista que a IA manda no canal de empréstimo:
      </p>
      <Tabela
        colunas={['Tipo de conta', 'O que é', 'Observação']}
        linhas={[
          ['Água ou luz', 'A conta da companhia de água ou de energia', 'As mais comuns. Quase toda casa tem uma delas.'],
          ['Internet ou telefone', 'A conta do provedor de internet ou da linha de telefone', 'Muitas vezes chega por e-mail ou pelo aplicativo, em PDF.'],
          ['TV', 'A conta de TV por assinatura (TIM, Claro, Sky)', 'Vale do mesmo jeito que as outras.'],
        ]}
        destaque={0}
      />
      <p>
        Se o cliente oferecer outro tipo de papel (uma carta de banco, um boleto de loja), não aceite por conta própria:
        pergunte ao gestor antes. Em toda conta, procure quatro informações. Cada empresa organiza a conta do seu jeito,
        mas elas sempre estão lá:
      </p>
      <ContaIlustrada />
      <Aviso tom="ambar" titulo="Quando as datas da conta discordam">
        Às vezes o mês de referência fica fora da regra e o vencimento fica dentro (ou o contrário). Nesses casos, não
        decida sozinho: mostre a conta ao gestor antes de seguir.
      </Aviso>
    </Secao>

    <Secao titulo="A regra do mês: atual ou passado">
      <p>
        Esta é a regra que mais pede atenção: o comprovante tem que ser <b>do mês atual ou do mês passado</b>.
        Comprovante atrasado não serve. Por quê? Porque uma conta recente mostra onde a pessoa mora agora. Uma conta de
        muitos meses atrás pode ser de uma casa onde ela nem mora mais.
      </p>
      <p>
        Na prática: <b>estamos em outubro? Vale conta de outubro ou de setembro.</b> Agosto já está atrasado. E atenção
        à virada do ano: em janeiro, o mês passado é dezembro do ano anterior, então vale janeiro ou dezembro. Use a
        calculadora para treinar com qualquer mês:
      </p>
      <CalendarioComprovante />
      <Tabela
        colunas={['Estamos em', 'Vale', 'Não vale (exemplos)']}
        linhas={[
          ['Outubro de 2026', 'Outubro/2026 ou setembro/2026', 'Agosto/2026, julho/2026, outubro/2025'],
          ['Março de 2027', 'Março/2027 ou fevereiro/2027', 'Janeiro/2027, março/2026'],
          ['Janeiro de 2027', 'Janeiro/2027 ou dezembro/2026', 'Novembro/2026, janeiro/2026'],
        ]}
        destaque={1}
      />
      <Aviso tom="rubro" titulo="Confira o mês e o ano">
        Uma conta de outubro do ano passado tem o mesmo nome de mês que a de agora, mas está um ano atrasada. Olhe
        sempre os dois.
      </Aviso>
      <TesteRapido
        pergunta="Estamos em janeiro de 2027. O cliente mandou uma conta de luz de dezembro de 2026. Serve?"
        opcoes={['Não: é do ano passado', 'Só se mandar a de janeiro também', 'Sim: dezembro é o mês passado']}
        certa={2}
        explica="A regra é mês atual ou mês passado. Em janeiro, o mês passado é dezembro do ano anterior. A virada do ano não muda a regra."
      />
    </Secao>

    <Secao titulo="Treino: serve ou não serve?">
      <p>
        Agora junte tudo: o tipo da conta, o mês (e o ano) e o nome de quem está na conta. Para cada conta abaixo,
        decida o que fazer.
      </p>
      <ClassificaComprovante />
    </Secao>

    <Secao titulo="Comprovante no nome de outra pessoa">
      <p>
        Acontece bastante: o cliente mora com o filho e a conta de luz está no nome do filho, ou mora na casa da mãe e a
        conta está no nome dela. Isso não impede nada. Se o cliente não tem conta no nome dele, pode usar a de outra
        pessoa (pai, mãe, filho), com <b>dois complementos</b>: o <b>documento com foto dessa pessoa</b> e uma
        <b> declaração de residência</b>.
      </p>
      <OutraPessoa />
      <p>
        A declaração de residência é o documento que liga as duas coisas: ela confirma que o cliente mora no endereço
        daquela conta, que está no nome de outra pessoa. O documento com foto serve para identificar quem é o dono da
        conta. Como a declaração é feita na equipe (o modelo, quem preenche e quem assina), siga a orientação do seu
        gestor.
      </p>
      <p>
        Note que a <b>regra do mês continua valendo</b>: a conta no nome do filho também precisa ser do mês atual ou do
        mês passado. A declaração resolve o nome, não a data. Na dúvida sobre qualquer comprovante, siga este caminho,
        clicando nas respostas:
      </p>
      <ArvoreComprovante />
      <Conversa
        titulo="Conta no nome do filho"
        nota="Sugestão de roteiro, adapte ao cliente"
        falas={[
          { quem: 'cliente', texto: 'A conta de luz aqui de casa tá no nome do meu filho. Serve?' },
          { quem: 'eu', texto: 'Serve sim, Seu Antônio! Nesse caso eu só preciso de mais duas coisas: as fotos do RG ou da CNH do seu filho (frente e verso), e a gente faz uma declaração de residência.' },
          { quem: 'cliente', texto: 'Declaração? É complicado?' },
          { quem: 'eu', texto: 'Não é, pode ficar tranquilo. É um documento simples, que confirma que o senhor mora no endereço da conta. Eu vou explicando cada passo.' },
          { quem: 'eu', texto: 'Só um detalhe: a conta precisa ser deste mês ou do mês passado, tá bom?' },
        ]}
      />
      <TesteRapido
        pergunta="A conta de internet está no nome da mãe do cliente e é do mês passado. O que mais você precisa?"
        opcoes={['Documento com foto da mãe + declaração de residência', 'Nada a mais: conta no nome de familiar vale direto', 'Uma conta nova no nome do próprio cliente, sem exceção']}
        certa={0}
        explica="Conta de outra pessoa vale, com dois complementos: o documento com foto dessa pessoa e a declaração de residência. O mês já está certo."
      />
    </Secao>

    <Secao titulo="E-mail: pequeno, mas muito importante">
      <p>
        O e-mail parece o item mais fácil da lista, mas é o mais fácil de errar sem perceber: uma letra trocada e ele
        vira o endereço de outra pessoa, ou de ninguém. É como um endereço de casa com o número errado: o que for mandado
        para lá não chega.
      </p>
      <p>
        A IA pede um “E-MAIL (DO SEU USO)”: um e-mail que <b>o próprio cliente usa e consegue abrir</b>. Não serve o
        e-mail do vizinho, nem um que ele criou há anos e não sabe mais entrar. E se o cliente não tem e-mail, a resposta
        oficial é: <b>sem problema, a gente cria um e-mail para ele</b>.
      </p>
      <p>Antes de conferir um e-mail, entenda as partes dele:</p>
      <AnatomiaEmail />
      <Passos itens={[
        { titulo: 'Peça por escrito', texto: 'Por áudio, “m” vira “n”, o “ponto” some e número vira letra. Escrito, você copia sem erro.' },
        { titulo: 'Se veio por áudio, escreva e mostre', texto: 'Digite o e-mail e mande para o cliente confirmar: “É este aqui?”.' },
        { titulo: 'Confira o formato', texto: 'Um @ só, sem espaço, sem acento, com o final certo (quase sempre .com ou .com.br).' },
        { titulo: 'Leia de volta, letra por letra', texto: 'Principalmente os pontos, os números e o que vem depois do @.' },
        { titulo: 'Confirme que é do uso dele', texto: 'Pergunte se é o e-mail que ele usa e se consegue abrir no celular.' },
      ]} />
      <p>Treine com o conferidor. Ele aponta os erros de formato mais comuns e mostra como soletrar o e-mail para o cliente:</p>
      <ConferidorEmail />
      <Conversa
        titulo="Cliente sem e-mail"
        nota="Sugestão de roteiro, adapte ao cliente"
        falas={[
          { quem: 'eu', texto: 'Agora preciso de um e-mail que a senhora use. Pode me mandar escrito aqui?' },
          { quem: 'cliente', texto: 'Eu não tenho e-mail não. Nunca precisei.' },
          { quem: 'eu', texto: 'Sem problema, Dona Lúcia, a gente cria um e-mail pra senhora.' },
          { quem: 'eu', texto: 'Eu vou explicando o passo a passo para a senhora, tudo bem?' },
        ]}
      />
      <p>
        Para criar o e-mail, siga o procedimento da equipe: combine com o seu gestor como fazer e como o cliente vai
        acessar depois.
      </p>
      <TesteRapido
        pergunta="O cliente diz: “Eu não tenho e-mail.” Qual é a resposta certa?"
        opcoes={['“Então não vamos conseguir seguir com a análise.”', '“Sem problema, a gente cria um e-mail pra você.”', '“Pode ser o e-mail de um vizinho ou de um parente.”']}
        certa={1}
        explica="Essa é a resposta oficial. E o e-mail precisa ser do uso do cliente: o de outra pessoa não serve."
      />
    </Secao>

    <Secao titulo="Recebendo pelo WhatsApp: foto, PDF e nitidez">
      <p>
        Tudo chega pela conversa do WhatsApp, em dois formatos principais: <b>foto</b> (imagem) ou
        <b> arquivo</b> (quase sempre PDF). Cada um pede um cuidado diferente:
      </p>
      <Tabela
        colunas={['Como chega', 'Quando aparece', 'O que conferir']}
        linhas={[
          ['Foto (imagem)', 'Documentos de papel: RG, CNH, conta impressa. E a foto do rosto.', 'Abra em tela cheia e dê zoom. Está inteira, nítida, sem brilho? Dá para ler tudo?'],
          ['PDF (arquivo)', 'Conta digital, baixada do aplicativo ou do site da empresa, ou recebida por e-mail.', 'Abra o arquivo. É do cliente certo? De que mês é? O endereço aparece?'],
          ['Print da tela', 'Conta aberta no aplicativo da empresa, salva com um print (captura da tela).', 'Precisa mostrar nome, endereço e data. Na dúvida se serve, pergunte ao gestor e, se der, peça o PDF.'],
        ]}
        destaque={0}
      />
      <Celular
        contato="Maria (exemplo)"
        sub="cliente"
        legenda="Fotos chegam como imagem; contas digitais costumam chegar como arquivo PDF."
        bolhas={[
          { de: 'eu', texto: 'Pode mandar as fotos do documento, Dona Maria: a frente e o verso.', hora: '15:10' },
          { de: 'cliente', tipo: 'imagem', legenda: 'frente', hora: '15:14' },
          { de: 'cliente', tipo: 'imagem', legenda: 'verso', hora: '15:14' },
          { de: 'cliente', tipo: 'documento', legenda: 'conta-de-luz-setembro.pdf', hora: '15:16' },
          { de: 'eu', texto: 'Recebi as duas fotos e a conta, obrigado! Já abri e conferi: dá para ler tudo. Agora só falta a foto do rosto e o seu e-mail.', hora: '15:17' },
        ]}
      />
      <Aviso tom="azul" titulo="O WhatsApp diminui a qualidade das fotos">
        Ao enviar uma foto, o aplicativo comprime a imagem para ela ficar mais leve. Na maioria das vezes ainda dá para
        ler. Se ficar borrada, peça uma foto nova com mais luz e com o documento ocupando quase toda a tela. Quem souber
        pode mandar a foto como documento (arquivo), que chega sem perder qualidade.
      </Aviso>
      <Frase>
        Se você não consegue ler, ninguém mais vai conseguir. Confira na hora, enquanto o cliente ainda está na conversa.
      </Frase>
      <p>
        Conferir na hora faz diferença: pedir uma foto nova cinco minutos depois é natural; pedir dias depois, quando o
        cliente já acha que estava tudo certo, é bem mais difícil.
      </p>
      <Aviso tom="ambar" titulo="Documento é dado pessoal">
        RG, CNH, foto do rosto, conta e e-mail são dados pessoais do cliente, protegidos pela LGPD (a lei de proteção de
        dados). Use só para o processo dele, não encaminhe para quem não participa do atendimento e siga a orientação
        do gestor sobre onde guardar. O cuidado completo com dados está na lição 14.
      </Aviso>
    </Secao>

    <Secao titulo="Mensagens prontas para pedir cada documento">
      <p>
        Escolha o documento e o tratamento (você, o senhor, a senhora). As mensagens são sugestões de roteiro: adapte ao
        jeito do cliente e ao ponto da conversa. As principais também ficam na consulta rápida.
      </p>
      <PedidosPorDocumento />
    </Secao>

    <Secao titulo="Situações do dia a dia">
      <Sanfona itens={[
        {
          titulo: 'O RG do cliente é muito antigo e está gasto',
          corpo: <p>Se dá para ler tudo e reconhecer a pessoa na foto, siga normalmente. Se não dá, pergunte se ele tem a CNH (ou o RG, se mandou a CNH). Se nenhum estiver legível, leve o caso ao gestor.</p>,
        },
        {
          titulo: 'O cliente mandou um modelo de documento diferente do desenho',
          corpo: <p>Normal: o RG e a CNH mudam de modelo conforme o estado e o ano em que foram feitos, e existe também a carteira de identidade no modelo novo. O que importa é o mesmo de sempre: frente e verso, inteiros, legíveis e no nome do cliente. Se chegar a CNH digital (aberta no aplicativo do celular, em print ou PDF), pergunte ao gestor se pode aceitar antes de seguir.</p>,
        },
        {
          titulo: 'O cliente mudou de casa e a conta é do endereço antigo',
          corpo: <p>O comprovante precisa mostrar onde ele mora hoje. Peça uma conta do endereço novo. Se ela estiver no nome de outra pessoa, use a regra do documento com foto + declaração de residência.</p>,
        },
        {
          titulo: 'Posso aceitar o e-mail do filho do cliente?',
          corpo: <p>O pedido é um e-mail do uso do próprio cliente. Se ele não tem, a gente cria um para ele. Se aparecer um caso diferente, alinhe com o gestor.</p>,
        },
        {
          titulo: 'O cliente mandou um print da conta no aplicativo',
          corpo: <p>O print precisa mostrar nome, endereço e data. Se faltar alguma dessas informações, peça o PDF da conta ou uma foto da conta de papel. Na dúvida se o print serve, pergunte ao gestor.</p>,
        },
        {
          titulo: 'O cliente tem medo de mandar documento pelo WhatsApp',
          corpo: <p>É uma preocupação legítima. Explique com calma para que serve cada documento (você aprendeu nesta lição), sem pressionar, e deixe ele à vontade para mandar quando se sentir seguro. A lição “Objeções e como responder” traz mais caminhos para essa conversa.</p>,
        },
        {
          titulo: 'O cliente não sabe tirar foto nem mandar arquivo',
          corpo: <p>Sugira a ajuda de alguém de casa ou explique um passo de cada vez, com calma. Mande a dica de foto das mensagens prontas e confirme cada envio: “Chegou! Agora vamos para o próximo.”</p>,
        },
      ]} />
    </Secao>

    <Secao titulo="Checklist dos documentos pessoais">
      <p>
        Use antes de dar os documentos pessoais como completos. Marque item por item: se algum ficar sem marcar, ainda
        falta alguma coisa.
      </p>
      <ChecklistPessoais />
    </Secao>

    <Secao titulo="Resumo da lição">
      <Lista itens={[
        <>Quatro documentos: <b>RG ou CNH (frente e verso)</b>, <b>foto do rosto</b>, <b>comprovante de residência</b> e <b>e-mail</b>.</>,
        <>Foto boa é inteira, nítida, com luz e sem brilho. Se você não consegue ler, peça de novo na hora, com gentileza e explicando o que fazer diferente.</>,
        <>A foto do rosto serve para confirmar que é a própria pessoa fazendo, e não outra no nome dela.</>,
        <>Comprovante: água ou luz, internet ou telefone, ou TV, <b>do mês atual ou do mês passado</b>. Confira o mês e o ano. Atrasado não serve.</>,
        <>Conta no nome de outra pessoa (pai, mãe, filho): <b>documento com foto dessa pessoa + declaração de residência</b>.</>,
        <>E-mail do uso do cliente, pedido por escrito e conferido letra por letra. Não tem? <b>A gente cria.</b></>,
      ]} />
    </Secao>
  </>
);

const licao: Licao = {
  id: 'pessoais',
  modulo: 'documentacao',
  titulo: 'Documentos pessoais',
  resumo: 'RG ou CNH frente e verso, foto do rosto, comprovante de residência do mês atual ou passado e e-mail: o que pedir, como orientar e como conferir.',
  minutos: 30,
  corpo,
  questoes: [
    {
      p: 'Para que serve a foto do rosto que pedimos ao cliente?',
      o: ['Para substituir o RG ou a CNH, se o cliente não tiver um', 'Para confirmar que é a própria pessoa quem está pedindo', 'É uma formalidade: se o cliente não quiser, pode pular'],
      c: 1,
      e: 'A foto do rosto confirma que quem está pedindo é o próprio cliente, e não outra pessoa no nome dele. Ela faz parte da documentação básica e não substitui o RG ou a CNH.',
    },
    {
      p: 'Estamos em janeiro. De quais meses o comprovante de residência serve?',
      o: ['Só de janeiro: dezembro já é do ano passado', 'De janeiro, de dezembro ou de novembro', 'De janeiro ou de dezembro do ano anterior'],
      c: 2,
      e: 'A regra é mês atual ou mês passado. Em janeiro, o mês passado é dezembro do ano anterior: vale janeiro ou dezembro. Novembro já está atrasado.',
    },
    {
      p: 'A conta de luz está no nome do pai do cliente. O que mais é preciso?',
      o: ['O documento com foto do pai e a declaração de residência', 'Nada a mais: conta no nome de pai, mãe ou filho vale direto', 'Só a declaração de residência, assinada pelo próprio cliente'],
      c: 0,
      e: 'Conta no nome de outra pessoa vale, com dois complementos: o documento com foto dessa pessoa e a declaração de residência.',
    },
    {
      p: 'Como deve ser a identidade que o cliente manda?',
      o: ['Só a frente do RG ou da CNH, que é onde fica a foto', 'Uma foto só, desde que dê para ler o nome e o CPF', 'RG ou CNH, frente e verso, inteiros e legíveis'],
      c: 2,
      e: 'Vale RG ou CNH, sempre em duas fotos (frente e verso), com o documento inteiro e dando para ler tudo.',
    },
    {
      p: 'O cliente mandou o e-mail por áudio. Qual é o melhor caminho?',
      o: ['Escrever, mostrar ao cliente e confirmar letra por letra', 'Anotar do jeito que entendeu e corrigir depois, se der erro', 'Pedir o e-mail de um familiar que saiba escrever melhor'],
      c: 0,
      e: 'Por áudio é fácil errar uma letra. Escreva o e-mail, mostre ao cliente e confirme. E ele precisa ser do uso do próprio cliente.',
    },
  ],
  glossario: [
    { termo: 'Comprovante de residência', def: 'Conta da casa que mostra onde a pessoa mora: água, luz, internet, telefone ou TV. Para nós, precisa ser do mês atual ou do mês passado.' },
    { termo: 'Frente e verso', def: 'Os dois lados de um documento. A identidade vai sempre em duas fotos, uma de cada lado.' },
    { termo: 'Foto do rosto', def: 'Foto atual do cliente, de frente. Serve para confirmar que é a própria pessoa fazendo, e não outra no nome dela.' },
    { termo: 'Titular da conta', def: 'O dono da conta usada como comprovante: a pessoa em nome de quem está a conta de água, luz, internet, telefone ou TV.' },
    { termo: 'Declaração de residência', def: 'Documento que confirma que o cliente mora no endereço de uma conta que está no nome de outra pessoa. Vai junto com o documento com foto dessa pessoa.' },
    { termo: 'Mês de referência', def: 'O mês a que uma conta se refere. Aparece na conta junto com a data de vencimento.' },
    { termo: 'Reflexo', def: 'Mancha de brilho na foto, causada pelo flash ou pelo plástico do documento. Esconde a informação que está embaixo.' },
    { termo: 'Provedor de e-mail', def: 'A empresa que oferece o e-mail, como o Gmail ou o Outlook. É a parte que vem depois do @.' },
  ],
  mensagens: [
    {
      titulo: 'Pedir os documentos pessoais',
      quando: 'Quando o cliente já decidiu seguir e está pronto para mandar a documentação básica.',
      texto: 'Para seguir com o processo, vou precisar destes documentos:\n\n1. RG ou CNH (uma foto da frente e outra do verso)\n2. Uma foto do rosto (pode ser uma selfie)\n3. Comprovante de residência deste mês ou do mês passado (água, luz, internet, telefone ou TV)\n4. Um e-mail que você use\n\nPode mandar aos pouquinhos, por aqui mesmo. Qualquer dúvida, é só me chamar.',
    },
    {
      titulo: 'Pedir a foto do documento de novo',
      quando: 'A foto chegou cortada, escura, com brilho ou tremida.',
      texto: 'Obrigado por mandar! A foto ficou difícil de ler. Pode tirar de novo assim:\n\n1. Tire o documento do plástico\n2. Coloque em cima de uma mesa, perto de uma janela\n3. Desligue o flash\n4. Fotografe de cima, com o documento inteiro aparecendo\n\nE lembre: uma foto da frente e outra do verso.',
    },
    {
      titulo: 'Comprovante atrasado',
      quando: 'O comprovante chegou de um mês antigo.',
      texto: 'Obrigado! Essa conta é de [mês da conta], e o comprovante precisa ser deste mês ou do mês passado. Pode me mandar uma conta mais nova? Pode ser de água, luz, internet, telefone ou TV.',
    },
    {
      titulo: 'Comprovante no nome de outra pessoa',
      quando: 'A conta está no nome do pai, da mãe, do filho ou de outra pessoa.',
      texto: 'Tudo bem a conta estar no nome de [quem está na conta]! Nesse caso, preciso também das fotos do RG ou da CNH dessa pessoa (frente e verso), e a gente faz uma declaração de residência.\n\nSó um detalhe: a conta continua precisando ser deste mês ou do mês passado.',
    },
    {
      titulo: 'Pedir o e-mail',
      quando: 'Para pedir o e-mail por escrito, já com a saída para quem não tem.',
      texto: 'Agora preciso de um e-mail que você use. Pode me mandar escrito aqui, letra por letra? Assim não tem erro.\n\nSe você não tiver e-mail, sem problema: a gente cria um e-mail pra você.',
    },
  ],
};
export default licao;
