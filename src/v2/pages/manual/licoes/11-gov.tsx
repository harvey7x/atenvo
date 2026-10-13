/* Lição 11 — gov.br: imposto de renda e CPF. A conta gov.br e os níveis
   bronze/prata/ouro; o Meu Imposto de Renda dos últimos 3 anos (um print de
   cada ano; DEC e REC quando o cliente declara); exercício × ano-calendário;
   quem declara × quem não declara; erros comuns; a situação cadastral do CPF
   no site da Receita Federal (CPF + data de nascimento) e o comprovante;
   árvore "o cliente declara?" e checklist.
   Fatos da empresa: só os do dono (13/10/2026). Nomes, datas e números: EXEMPLO.
   As ilustrações próprias ficam em 11-gov-visuais.tsx. */
import type { Licao } from '../tipos';
import {
  Aviso, Celular, Conversa, Fatos, Frase, Lista, Passos, Sanfona, Secao, Tabela, TesteRapido,
} from '../pecas';
import { NiveisGov, PrintMeuIR, hojeMesAno } from '../ilustracoes';
import {
  ArvoreIR, ChecklistGov, ComprovanteCpf, ConfiraPasta, DecOuRec, DocumentosDecRec, DuasSituacoes, LinhaExercicio,
  MapaGovBr, MontePasta, OndeEstamos, PrintBomRuim, SemaforoCpf, TelaConsultaCpf, TelasPassoAPasso,
} from './11-gov-visuais';

/* Anos do exemplo de conversa: acompanham o ano atual, como as ilustrações. */
const ANO = hojeMesAno().ano;

const licao: Licao = {
  id: 'gov',
  modulo: 'documentacao',
  titulo: 'gov.br: imposto de renda e CPF',
  resumo: 'A conta gov.br e os níveis bronze, prata e ouro; o imposto de renda dos últimos 3 anos no Meu Imposto de Renda (print de cada ano, DEC e REC); e a situação cadastral do CPF na Receita Federal.',
  minutos: 30,
  corpo: (
    <>
      <p className="mv-lead">
        Na lição 10 você viu os documentos do Meu INSS: a carta de concessão e os extratos. Agora vamos buscar dois
        documentos que vêm da <b>Receita Federal</b>: o <b>imposto de renda dos últimos 3 anos</b>, no serviço
        <b> Meu Imposto de Renda</b> (que fica dentro do <b>gov.br</b>), e a <b>situação cadastral do CPF</b>, numa consulta
        aberta no site da Receita. Parece muita coisa, mas a regra é curta e sempre igual: <b>três anos, um print por ano;
        declarou, pega a DEC e o REC; e o CPF consultado, com o comprovante salvo</b>. Nesta lição você entende o porquê de
        cada parte, vê as telas por dentro e treina nos exercícios até ficar automático.
      </p>

      <div className="vidro mv-cartao" data-tom="azul">
        <h4>O que você vai aprender</h4>
        <Lista itens={[
          'O que é o gov.br e o que querem dizer os níveis bronze, prata e ouro.',
          'O que é o Meu Imposto de Renda e a diferença entre exercício e ano-calendário.',
          'Como entrar, abrir cada um dos 3 anos e tirar um print que serve.',
          'O que juntar de quem declara e de quem não declara imposto de renda.',
          'O que são a DEC e o REC e como reconhecer cada um em segundos.',
          'Como consultar a situação cadastral do CPF e o que fazer com o resultado.',
        ]} />
      </div>

      <OndeEstamos />

      <Fatos itens={[
        { grande: '3 anos', texto: 'De imposto de renda: os 3 exercícios mais recentes, com um print de cada ano.' },
        { grande: 'DEC + REC', texto: 'Em cada ano em que o cliente declarou: a declaração e o recibo de entrega.' },
        { grande: '2 dados', texto: 'CPF e data de nascimento: é só o que a consulta da situação cadastral pede.' },
        { grande: '1 comprovante', texto: 'O comprovante da situação cadastral do CPF, salvo em PDF ou print.' },
      ]} />

      <Aviso tom="ambar" titulo="Rota do familiar: o imposto de renda e o CPF são do familiar que recebe">
        Quando a análise segue pelo <b>benefício de um familiar</b> (a rota do familiar, da lição 4), tudo desta lição é
        <b> do familiar que recebe o benefício</b>: o gov.br, os prints do imposto de renda, a DEC e o REC e a consulta da
        situação do CPF. Não é de quem está conversando com você. O mesmo vale para os outros documentos (Meu INSS,
        identidade, foto do rosto, comprovante e e-mail). Na dúvida sobre de quem é o documento, pergunte ao gestor.
      </Aviso>

      {/* ------------------------------------------------------------------ gov.br */}
      <Secao titulo="1. O gov.br: uma conta para quase tudo do governo">
        <p>
          O <b>gov.br</b> é a conta única do cidadão para os serviços digitais do governo federal. Com um login só (o
          <b> CPF</b> e uma <b>senha</b>), a pessoa entra no Meu INSS, no Meu Imposto de Renda, assina documentos de forma
          eletrônica e usa vários outros serviços. Não é um banco nem um aplicativo da CAF: é do governo, e é o mesmo para
          todo mundo.
        </p>
        <p>
          Para você, isso tem uma consequência prática muito boa: <b>se o cliente já entrou no Meu INSS na etapa anterior,
          ele já tem conta gov.br</b>. É o mesmo CPF e a mesma senha que abrem o Meu Imposto de Renda. Não existe outra conta
          nem outra senha para criar. Pense numa chave só que abre várias portas.
        </p>
        <MapaGovBr />
        <p>
          Repare no quadro de baixo, à esquerda do desenho: a consulta da <b>situação cadastral do CPF</b> não precisa de
          login. Ela fica num site aberto da Receita Federal e pede só o CPF e a data de nascimento. Você vai ver essa
          consulta no fim da lição.
        </p>
        <Aviso titulo="Site oficial termina em .gov.br">
          Os endereços oficiais do governo terminam em <b>.gov.br</b>. Desconfie de sites parecidos, principalmente os que
          pedem pagamento para “consultar CPF” ou “ver imposto de renda”: as consultas oficiais são gratuitas. Na dúvida,
          olhe o endereço antes de digitar qualquer dado do cliente.
        </Aviso>
      </Secao>

      {/* ------------------------------------------------------------------ níveis */}
      <Secao titulo="2. Os níveis da conta: bronze, prata e ouro">
        <p>
          Toda conta gov.br tem um <b>nível</b>. O nível diz o quanto o governo tem certeza de que aquela conta pertence mesmo
          àquela pessoa. Quanto mais alto, mais segura a conta e mais serviços ela abre. São três:
        </p>
        <NiveisGov />
        <p>
          <b>Bronze</b> é o nível de entrada: a conta foi criada só com os dados básicos e abre os serviços mais simples.
          <b> Prata</b> e <b>ouro</b> são contas confirmadas por um caminho mais seguro (o banco do cliente, no prata; o rosto
          dele, no ouro) e por isso abrem os serviços que lidam com informação pessoal e financeira.
        </p>
        <p>
          <b>Por que isso importa nesta lição?</b> Alguns serviços da Receita Federal podem pedir conta prata ou ouro. Se, ao
          abrir o Meu Imposto de Renda, aparecer um aviso pedindo para <b>aumentar o nível da conta</b>, é isso: a conta está
          no bronze e o serviço pede um nível acima. Não é problema com o imposto de renda do cliente. E o nível volta a
          importar lá na frente, na assinatura das procurações: <b>bronze não assina</b>.
        </p>
        <Aviso titulo="Como subir de nível: veja a lição 13">
          O passo a passo para o cliente subir a conta para prata ou ouro, e as mensagens prontas para orientar, estão na lição
          13. Aqui basta reconhecer o aviso e lembrar que quem sobe de nível é o próprio cliente, no celular dele.
        </Aviso>
        <TesteRapido
          pergunta="Ao abrir o Meu Imposto de Renda do cliente, aparece um aviso pedindo para aumentar o nível da conta. O que isso quer dizer?"
          opcoes={[
            'Que o cliente nunca declarou imposto de renda',
            'Que a conta está no bronze e o serviço pede mais',
            'Que o site da Receita está fora do ar agora',
          ]}
          certa={1}
          explica="O aviso é sobre a conta, não sobre o imposto: o serviço pede prata ou ouro. Como ajudar o cliente a subir de nível está na lição 13."
        />
      </Secao>

      {/* ------------------------------------------------------------------ Meu IR */}
      <Secao titulo="3. O Meu Imposto de Renda e o que é uma declaração">
        <p>
          Todo ano, muitas pessoas prestam contas à Receita Federal: informam quanto ganharam no ano anterior, quais bens
          têm (casa, carro, dinheiro guardado) e quais dívidas fizeram. Esse documento é a <b>declaração de imposto de
          renda</b>. Nem todo mundo é obrigado a declarar: a obrigação depende de regras da Receita, como o valor da renda e
          dos bens. Por isso, muitos clientes declaram e muitos não declaram, e as duas situações são normais.
        </p>
        <p>
          O <b>Meu Imposto de Renda</b> é o serviço da Receita Federal, dentro do gov.br, onde ficam as declarações da pessoa,
          <b> ano por ano</b>. Ali dá para ver se houve declaração em cada ano, abrir a declaração e baixar o recibo de
          entrega. É desse lugar que saem os prints e os documentos desta etapa.
        </p>

        <h4 className="mv-gov-h4">Exercício e ano-calendário: a confusão número 1</h4>
        <p>
          Na tela, os anos aparecem como <b>Exercício</b>. Exercício é o ano em que a declaração foi <b>entregue</b>. O
          dinheiro declarado é do ano anterior, que se chama <b>ano-calendário</b>. Exemplo: o <b>Exercício 2026</b> é a
          declaração entregue em 2026, sobre o que a pessoa recebeu em 2025 (o ano-calendário 2025).
        </p>
        <LinhaExercicio />
        <p>
          Quando a gente fala em “últimos 3 anos”, fala dos <b>3 exercícios mais recentes que aparecem na tela</b>. Em 2026,
          por exemplo: Exercícios 2026, 2025 e 2024. Fale sempre em exercício com o colega e com o gestor, para ninguém
          confundir um ano com o outro.
        </p>
        <Aviso tom="ambar" titulo="No começo do ano, confirme quais são os 3 anos">
          A declaração de cada ano é entregue dentro de um prazo da Receita, no primeiro semestre. Antes de esse prazo
          terminar, o exercício do ano atual pode ainda não ter declaração. Se você ficar em dúvida sobre quais 3 anos pegar,
          pergunte ao gestor <b>antes</b> de pedir os documentos ao cliente.
        </Aviso>

        <h4 className="mv-gov-h4">Por que 3 anos, e por que um print de cada</h4>
        <p>
          O imposto de renda é um registro oficial, feito na Receita Federal: mostra a renda e a situação financeira que o
          cliente informou ao governo, ou mostra que ele não declarou. Ele faz parte da <b>documentação básica do
          processo</b>, junto com os documentos do Meu INSS.
        </p>
        <p>
          A regra do processo é pegar os <b>3 anos</b>, e não só o último. Um ano só deixa a pasta incompleta, e aí alguém
          precisa voltar ao cliente para pedir de novo, o que cansa o cliente e atrasa tudo. Com os 3 anos, a pasta mostra
          alguns anos seguidos da vida do cliente, e não uma foto isolada.
        </p>
        <p>
          E por que <b>print</b>? Porque o print mostra a tela de cada ano do jeito que a Receita mostra: se tem declaração e
          em que situação ela está, ou que não houve declaração naquele ano. Para quem declara, o print vem junto com a DEC
          e o REC. Para quem não declara, o print é o próprio documento daquele ano.
        </p>
        <Aviso titulo="A sua parte e a parte jurídica">
          A análise jurídica desses documentos não é com você. O seu papel é entregar tudo <b>completo e legível</b>. Se
          quiser entender como os documentos são usados no processo, pergunte ao gestor.
        </Aviso>
      </Secao>

      {/* ------------------------------------------------------------------ passo a passo */}
      <Secao titulo="4. Passo a passo: entrar e abrir cada ano">
        <p>Esta etapa pode ser feita de dois jeitos, conforme o cliente:</p>
        <div className="mv-duas">
          <div className="vidro mv-cartao" data-tom="verde">
            <h4>O cliente faz, você guia</h4>
            <p>
              Quando o cliente tem facilidade com o celular, ele mesmo entra, tira os prints e manda no WhatsApp. Você guia
              passo a passo, um ano por vez, e confere cada arquivo que chega.
            </p>
          </div>
          <div className="vidro mv-cartao" data-tom="azul">
            <h4>Você faz, com o acesso que o cliente passou</h4>
            <p>
              A maioria não sabe entrar e às vezes passa a senha para a gente. Aí você entra com total segurança, só para
              pegar os documentos, e depois ajuda o cliente a trocar a senha. As regras são as mesmas do Meu INSS (lição 10).
            </p>
          </div>
        </div>
        <p>
          Nos dois casos, o caminho dentro do gov.br é o mesmo. Avance pelas telas abaixo com os botões e leia a dica de cada
          passo:
        </p>
        <TelasPassoAPasso />
        <p>O mesmo caminho, em forma de lista, para consultar no dia a dia:</p>
        <Passos itens={[
          { titulo: 'Entrar no gov.br com o CPF e a senha do cliente', texto: 'Site ou aplicativo gov.br. É o mesmo acesso do Meu INSS.' },
          { titulo: 'Procurar o Meu Imposto de Renda', texto: 'Pela busca do gov.br, pelo nome do serviço.' },
          { titulo: 'Abrir a área das declarações', texto: 'É onde aparecem os anos, como Exercício.' },
          { titulo: 'Abrir o exercício mais recente e tirar um print da tela inteira', texto: 'Com o ano e a situação aparecendo.' },
          { titulo: 'Se houver declaração, baixar a declaração (DEC) e o recibo (REC)', texto: 'Normalmente em PDF. São dois arquivos diferentes.' },
          { titulo: 'Voltar à lista e repetir com os outros dois exercícios', texto: 'Um ano de cada vez, sem pular.' },
          { titulo: 'Conferir antes de seguir', texto: '3 prints e, para cada ano com declaração, a DEC e o REC.' },
        ]} />
        <p>
          Quando você volta para a lista, o resultado fica parecido com o desenho abaixo. Nele, o cliente declarou em dois
          anos e não declarou no mais antigo:
        </p>
        <PrintMeuIR />

        <h4 className="mv-gov-h4">O print de cada ano: o que ele precisa mostrar</h4>
        <p>
          Um print bom se explica sozinho: quem abrir o arquivo meses depois sabe de qual ano ele é e o que aconteceu naquele
          ano, sem precisar perguntar a ninguém.
        </p>
        <Lista itens={[
          'O exercício (o ano) aparecendo na tela.',
          'A situação daquele ano: com declaração ou sem declaração.',
          'A tela inteira, nítida e sem cortes.',
          'Um print por ano: são 3 prints, mesmo quando não há declaração.',
        ]} />
        <PrintBomRuim />
        <p>
          <b>Print não é foto da tela.</b> O print é a captura de tela feita no próprio aparelho: no celular, em geral, é
          apertar dois botões ao mesmo tempo (a combinação muda de um modelo para outro); no computador, a tecla Print Screen
          ou a ferramenta de captura. Se o cliente não souber, ensine com calma. Foto tirada com outro celular sai torta, com
          reflexo e, muitas vezes, ilegível.
        </p>
        <Celular
          contato="Dona Maria"
          sub="cliente · exemplo"
          legenda="Exemplo de conversa: o cliente faz e você guia, um ano por vez, conferindo cada arquivo."
          bolhas={[
            { de: 'eu', texto: 'Agora vamos ao imposto de renda, Dona Maria. Preciso de um print de cada um dos últimos 3 anos. A senhora consegue entrar no gov.br pelo celular?', hora: '10:02' },
            { de: 'cliente', texto: 'Consigo sim. É a mesma senha do INSS né?', hora: '10:04' },
            { de: 'eu', texto: 'Isso mesmo! Procure por Meu Imposto de Renda e abra a parte das declarações. Vão aparecer os anos.', hora: '10:05' },
            { de: 'cliente', tipo: 'imagem', texto: 'Apareceu assim', hora: '10:08' },
            { de: 'eu', texto: `Perfeito! Toque no primeiro ano, o ${ANO}, e tire um print dessa tela.`, hora: '10:09' },
            { de: 'cliente', tipo: 'imagem', hora: '10:11' },
            { de: 'eu', texto: 'Recebi, ficou ótimo. Nesse ano tem declaração, então preciso também da declaração e do recibo. A senhora consegue baixar os dois e me mandar?', hora: '10:12' },
            { de: 'cliente', tipo: 'documento', legenda: `declaracao-${ANO}.pdf`, hora: '10:16' },
            { de: 'cliente', tipo: 'documento', legenda: `recibo-${ANO}.pdf`, hora: '10:16' },
            { de: 'eu', texto: `Prontinho, ${ANO} completo! Agora vamos fazer o mesmo com ${ANO - 1} e ${ANO - 2}.`, hora: '10:17' },
          ]}
        />
        <Aviso tom="ambar" titulo="Cuidado com os dados">
          Imposto de renda e CPF são dados pessoais e financeiros do cliente. Use só para o processo, não mande para ninguém
          de fora da equipe e guarde os arquivos onde o gestor orientar. Quando você entrou com a senha do cliente, entre só
          para pegar os documentos e, depois, ajude o cliente a trocar a senha.
        </Aviso>
        <TesteRapido
          pergunta="Estamos em 2026. O Exercício 2025 traz a declaração de qual dinheiro?"
          opcoes={['Do dinheiro recebido em 2025', 'Do dinheiro recebido em 2024', 'Do dinheiro recebido em 2026']}
          certa={1}
          explica="Exercício é o ano da entrega. O Exercício 2025 foi entregue em 2025 e fala do ano-calendário 2024."
        />
      </Secao>

      {/* ------------------------------------------------------------------ declara x não declara */}
      <Secao titulo="5. Quem declara e quem não declara">
        <p>
          Cada ano, na tela, tem só <b>duas situações possíveis</b>: tem declaração ou não tem. O que você junta depende só
          disso, ano por ano.
        </p>
        <DuasSituacoes />
        <p>
          <b>Quem declara:</b> de cada ano com declaração, você junta três arquivos: o print da tela do ano, a declaração
          (DEC) e o recibo (REC). Se o cliente declarou nos 3 anos, são 9 arquivos.
        </p>
        <p>
          <b>Quem não declara:</b> não existe DEC nem REC para baixar, e está tudo bem. Você junta só o print de cada ano
          mostrando que não há declaração: 3 prints. Esse print é importante: é ele que mostra que o cliente não declarou,
          em vez de deixar a pasta com um buraco.
        </p>
        <p>
          <b>E o caso misturado?</b> Pode acontecer: a pessoa declarou num ano e não no outro. A regra continua a mesma,
          <b> sempre por ano</b>: olhe um ano de cada vez e junte o que aquele ano pede. Teste no montador abaixo: escolha um
          exemplo ou marque ano por ano e veja como fica a pasta.
        </p>
        <MontePasta />
        <Aviso titulo="Não é papel nosso orientar sobre imposto de renda">
          Se o cliente perguntar se deveria ter declarado, se vai ter restituição ou se está devendo, não opine. Diga, com
          gentileza, que isso não faz parte do nosso processo e que ele pode tirar a dúvida com a Receita Federal ou com um
          contador. O nosso trabalho aqui é só juntar os documentos.
        </Aviso>
      </Secao>

      {/* ------------------------------------------------------------------ DEC e REC */}
      <Secao titulo="6. DEC e REC: o que são e como reconhecer">
        <p>Quando o cliente declarou num ano, existem dois documentos daquele ano, e você precisa dos dois:</p>
        <Lista itens={[
          <><b>DEC é a declaração</b>: o documento completo, com tudo o que o cliente informou à Receita naquele ano (rendimentos, bens e direitos, dívidas e o resumo do imposto).</>,
          <><b>REC é o recibo de entrega</b>: o comprovante de que a declaração foi entregue, com o número do recibo e a data e a hora da entrega.</>,
        ]} />
        <p>
          Os nomes vêm dos arquivos do programa de imposto de renda da Receita, que terminam em <b>.DEC</b> e <b>.REC</b>. No
          Meu Imposto de Renda, eles aparecem com os nomes de <b>declaração</b> e <b>recibo</b>, para baixar.
        </p>
        <p>
          <b>Por que os dois?</b> Porque um não substitui o outro: a DEC mostra o conteúdo; o REC prova que ela foi entregue.
          Uma declaração sem recibo é como uma carta sem o comprovante de que foi enviada. Veja os dois lado a lado e toque nos
          números para conhecer cada parte:
        </p>
        <DocumentosDecRec />
        <Tabela
          colunas={['', 'DEC (declaração)', 'REC (recibo)']}
          destaque={0}
          linhas={[
            ['O que é', 'A declaração completa do ano', 'O comprovante de que a declaração foi entregue'],
            ['Tamanho', 'Várias páginas', 'Curto, normalmente uma página'],
            ['Título', 'Declaração de Ajuste Anual', 'Recibo de entrega da Declaração de Ajuste Anual'],
            ['O que mostra', 'Rendimentos, bens e direitos, dívidas e o resumo do imposto', 'Número do recibo e a data e a hora da entrega'],
            ['Quando pegar', 'Em cada ano com declaração', 'Em cada ano com declaração'],
          ]}
        />
        <Aviso tom="ambar" titulo="A pegadinha do título">
          O título do recibo também fala em “Declaração de Ajuste Anual”. Não se guie só por essa expressão: olhe a
          <b> primeira palavra</b> (Recibo) e o <b>tamanho</b> do documento. Várias páginas com rendimentos e bens: DEC. Uma
          página com número do recibo e data da entrega: REC.
        </Aviso>
        <p>Agora treine. Para cada pista, diga se é da DEC ou do REC:</p>
        <DecOuRec />
      </Secao>

      {/* ------------------------------------------------------------------ erros */}
      <Secao titulo="7. Erros comuns (e como evitar)">
        <p>
          Quase todo erro desta etapa é de <b>falta</b>: falta um ano, falta um recibo, falta o print de quem não declara. E
          falta só aparece depois, quando alguém precisa voltar ao cliente para pedir de novo. Confira a pasta abaixo, montada
          por um colega, e descubra o que está faltando:
        </p>
        <ConfiraPasta />
        <Sanfona itens={[
          {
            titulo: 'Pegar só 1 ano',
            corpo: <p>O primeiro ano aberto parece “o imposto de renda”, e a pessoa para por ali. Mas são <b>3 exercícios</b>. Como evitar: antes de encerrar a etapa, conte os prints. Tem que dar 3.</p>,
          },
          {
            titulo: 'Esquecer o REC',
            corpo: <p>A DEC parece suficiente porque é o documento grande. Mas o recibo é a prova da entrega. Como evitar: para cada ano com declaração, conte <b>2 documentos</b>, DEC e REC, além do print.</p>,
          },
          {
            titulo: 'Achar que quem não declara não precisa de nada',
            corpo: <p>Precisa, sim: <b>um print de cada ano</b> mostrando que não há declaração. Sem eles, a pasta fica com um buraco e ninguém sabe se o cliente não declarou ou se você esqueceu de olhar.</p>,
          },
          {
            titulo: 'Confundir exercício com ano-calendário',
            corpo: <p>“Pega o de 2025” pode virar duas coisas diferentes. Como evitar: fale sempre em <b>exercício</b>, que é o ano que aparece na tela.</p>,
          },
          {
            titulo: 'Misturar os anos',
            corpo: <p>Baixar a DEC de um ano e o REC de outro acontece quando se faz tudo com pressa. Como evitar: confira o <b>exercício escrito em cada documento</b> e dê nome aos arquivos com o ano.</p>,
          },
          {
            titulo: 'Print cortado ou foto da tela',
            corpo: <p>Sem o ano aparecendo, o print não serve para nada. Como evitar: peça a <b>tela inteira</b>, confira assim que o arquivo chegar e, se precisar, peça de novo na hora, com gentileza.</p>,
          },
          {
            titulo: 'Escolher sozinho quando aparece mais de uma declaração no mesmo ano',
            corpo: <p>Às vezes o mesmo exercício mostra mais de uma declaração, por exemplo quando a pessoa corrigiu a declaração depois de entregar (a correção se chama <b>retificadora</b>). Como evitar: não escolha por conta própria. Tire o print mostrando todas e pergunte ao gestor quais DEC e REC baixar.</p>,
          },
        ]} />
        <TesteRapido
          pergunta="A cliente declarou imposto de renda nos 3 anos. Um colega mandou 3 prints e 3 DECs. Está completo?"
          opcoes={['Sim, está tudo certo', 'Não: faltam mais 3 prints', 'Não: faltam os 3 recibos (REC)']}
          certa={2}
          explica="Em cada ano com declaração são 3 arquivos: print, DEC e REC. Faltam os 3 recibos de entrega."
        />
      </Secao>

      {/* ------------------------------------------------------------------ CPF */}
      <Secao titulo="8. Situação cadastral do CPF">
        <p>
          O <b>CPF</b> é o número que identifica a pessoa na Receita Federal. A <b>situação cadastral</b> diz se esse cadastro
          está em ordem. É uma consulta rápida, aberta e gratuita, no site da Receita Federal. <b>Não precisa de login no
          gov.br</b>: pede só o <b>CPF</b> e a <b>data de nascimento</b> do cliente.
        </p>
        <p>
          A consulta pode trazer algumas respostas diferentes, mas você só precisa entender uma delas. Veja o que fazer em
          cada caso:
        </p>
        <SemaforoCpf />
        <p>
          <b>Regular</b> quer dizer que o CPF está em dia na Receita Federal. É o resultado esperado: salve o comprovante e
          siga. Se aparecer <b>qualquer outra palavra</b> (pendente de regularização, suspensa, cancelada, titular falecido,
          nula), não tente entender nem explicar ao cliente o que significa. Cada situação tem um motivo e um caminho
          diferentes, e quem decide o que fazer é o gestor. Salve o comprovante do jeito que veio e leve ao gestor antes de
          seguir.
        </p>

        <h4 className="mv-gov-h4">Como consultar</h4>
        <div className="mv-gov-lado">
          <TelaConsultaCpf />
          <Passos itens={[
            { titulo: 'Abrir a consulta no site da Receita Federal', texto: 'Procure por “situação cadastral CPF Receita Federal” e confira que o endereço termina em .gov.br.' },
            { titulo: 'Digitar o CPF do cliente', texto: 'O cliente já informou o CPF ao robô no começo da conversa. Confira os 11 números. Na rota do familiar, é o CPF do familiar que recebe.' },
            { titulo: 'Digitar a data de nascimento', texto: 'Está na identidade do cliente (na rota do familiar, na do familiar que recebe). Se você ainda não tem, pergunte.' },
            { titulo: 'Marcar a verificação', texto: 'O site pede para confirmar que quem está consultando é uma pessoa (uma caixinha de verificação).' },
            { titulo: 'Tocar em Consultar', texto: 'O resultado aparece na hora, como um comprovante.' },
            { titulo: 'Salvar o comprovante', texto: 'Em PDF (pela opção de imprimir do navegador) ou num print da tela inteira.' },
          ]} />
        </div>
        <Aviso tom="ambar" titulo="Se o site disser que a data não confere">
          Confira a digitação e o documento do cliente: um número trocado na data ou no CPF já basta para dar erro. Se
          continuar, não fique tentando: leve ao gestor.
        </Aviso>

        <h4 className="mv-gov-h4">O comprovante: o que conferir</h4>
        <p>
          O resultado da consulta é o <b>Comprovante de Situação Cadastral no CPF</b>. Antes de salvar, passe o olho em quatro
          pontos:
        </p>
        <ComprovanteCpf />
        <TesteRapido
          pergunta="Na consulta, a situação cadastral do CPF aparece como SUSPENSA. O que você faz?"
          opcoes={[
            'Explica ao cliente o que é e como resolver',
            'Salva o comprovante e leva ao gestor antes de seguir',
            'Ignora e segue, porque o CPF existe',
          ]}
          certa={1}
          explica="Só a situação REGULAR segue direto. Qualquer outra, como suspensa ou pendente de regularização, vai para o gestor, com o comprovante salvo."
        />
      </Secao>

      {/* ------------------------------------------------------------------ árvore */}
      <Secao titulo="9. Árvore de decisão: o cliente declara imposto de renda?">
        <p>
          Use esta árvore como guia no dia a dia. Responda como se estivesse atendendo um cliente e veja o caminho acender. Ela
          repete a regra da lição: <b>ano por ano, até completar os 3</b>. Tente parar antes do terceiro ano para ver o que
          acontece.
        </p>
        <ArvoreIR />
      </Secao>

      {/* ------------------------------------------------------------------ como falar */}
      <Secao titulo="10. Como explicar ao cliente">
        <p>
          O cliente pode estranhar: “para que vocês precisam do meu imposto de renda?”. É uma pergunta justa, e quem pergunta
          está se protegendo, o que é bom. Responda com simplicidade, sem juridiquês e sem pressa. Três ideias resolvem quase
          tudo: <b>faz parte da documentação básica</b>, <b>a gente só consulta e junta</b> (não muda nada) e <b>não declarar
          não é problema para juntar os documentos</b>.
        </p>
        <Conversa
          titulo="Explicando o imposto de renda e o CPF"
          nota="Sugestão de roteiro, adapte ao cliente"
          falas={[
            { quem: 'cliente', texto: 'Mas para que vocês precisam do meu imposto de renda?' },
            { quem: 'eu', texto: 'É uma dúvida muito justa! O imposto de renda faz parte da documentação básica do seu processo, junto com os documentos do INSS. A gente só consulta e junta os documentos. Não muda nada na sua declaração.' },
            { quem: 'cliente', texto: 'Eu nunca declarei imposto de renda. E agora?' },
            { quem: 'eu', texto: 'Sem problema nenhum! Muita gente não declara. Nesse caso, só preciso de um print de cada um dos últimos 3 anos mostrando que não tem declaração.' },
            { quem: 'eu', texto: 'Por último, vou consultar a situação do seu CPF no site da Receita Federal. Para isso, preciso só da sua data de nascimento. Pode me confirmar, por favor?' },
            { quem: 'cliente', texto: '15 de março de 1958' },
            { quem: 'eu', texto: 'Obrigado! Consultei aqui e está tudo certo com o seu CPF. Vamos para a próxima etapa.' },
          ]}
        />
        <p>Outras perguntas que aparecem nesta etapa, e um jeito de responder:</p>
        <Sanfona itens={[
          {
            titulo: '“Isso vai me dar problema com a Receita?”',
            corpo: <p>Explique que a gente só consulta e baixa o que já está lá: “consultar não muda nada na sua declaração nem no seu CPF”. Se o cliente quiser, ele pode acompanhar tudo pelo próprio celular.</p>,
          },
          {
            titulo: '“Não lembro a senha do gov.br.”',
            corpo: <p>O gov.br tem a opção de recuperar a senha na própria tela de entrada. Ajude o cliente a fazer isso pelo celular dele, com calma. Se não der certo, chame o gestor.</p>,
          },
          {
            titulo: '“Meu CPF deu pendente. O que é isso?”',
            corpo: <p>Não explique nem tente resolver. Diga que vai verificar com a equipe e que retorna em seguida, e leve o comprovante ao gestor. Nada de assustar o cliente.</p>,
          },
          {
            titulo: '“Por que três anos? Não basta o último?”',
            corpo: <p>“Os três anos fazem parte da documentação básica do processo. Pegando tudo de uma vez, a gente não precisa te incomodar de novo depois.”</p>,
          },
        ]} />
      </Secao>

      {/* ------------------------------------------------------------------ checklist */}
      <Secao titulo="11. Checklist final da etapa">
        <p>
          Antes de dar esta etapa por encerrada, confira item por item. Marque conforme for conferindo: no fim, a pasta do
          gov.br tem que estar completa.
        </p>
        <ChecklistGov />
        <Frase>Três anos, um print por ano. Declarou? DEC e REC. CPF regular, comprovante salvo.</Frase>
      </Secao>

      {/* ------------------------------------------------------------------ resumo */}
      <Secao titulo="Resumo da lição">
        <Lista itens={[
          'O gov.br é a conta única do cidadão (CPF + senha). O mesmo acesso do Meu INSS abre o Meu Imposto de Renda.',
          'Níveis: bronze é o básico; prata (validação pelo banco) e ouro (reconhecimento facial) abrem mais serviços e são os que assinam as procurações. Como subir de nível: lição 13.',
          'Imposto de renda: os 3 exercícios mais recentes, um print de cada ano. Exercício é o ano da entrega; o dinheiro é do ano anterior.',
          'Ano com declaração: print + DEC (a declaração completa) + REC (o recibo de entrega). Ano sem declaração: só o print.',
          'Situação cadastral do CPF: site da Receita, com CPF e data de nascimento. REGULAR segue; qualquer outra situação vai para o gestor.',
          'Antes de seguir, confira a pasta: 3 prints, DEC e REC de cada ano declarado e o comprovante do CPF. Na rota do familiar, tudo é do familiar que recebe.',
        ]} />
      </Secao>
    </>
  ),

  questoes: [
    {
      p: 'A cliente declarou imposto de renda só no exercício mais recente. O que você junta?',
      o: [
        'Os 3 prints e só a DEC do ano em que declarou',
        'O print, a DEC e o REC só do ano em que declarou',
        'Os 3 prints, mais DEC e REC do ano que declarou',
      ],
      c: 2,
      e: 'O print de cada um dos 3 anos entra sempre. DEC e REC só existem no ano em que ela declarou, e vão os dois.',
    },
    {
      p: 'No Meu Imposto de Renda, o Exercício 2026 traz a declaração de qual ano-calendário?',
      o: [
        'Do ano-calendário 2025',
        'Do ano-calendário 2026',
        'De 2024 a 2026, os três',
      ],
      c: 0,
      e: 'Exercício é o ano da entrega; o ano-calendário é o do dinheiro declarado, sempre o anterior. Exercício 2026 = ano-calendário 2025.',
    },
    {
      p: 'Qual é a diferença entre a DEC e o REC?',
      o: [
        'DEC é o recibo; REC é a declaração completa',
        'DEC é a declaração; REC é o recibo de entrega',
        'DEC é do ano atual; REC, dos anos anteriores',
      ],
      c: 1,
      e: 'DEC é a declaração (rendimentos, bens, dívidas). REC é o recibo de entrega, com o número do recibo e a data e a hora da entrega.',
    },
    {
      p: 'Para consultar a situação cadastral do CPF no site da Receita Federal, o que é preciso?',
      o: [
        'O CPF e a senha da conta gov.br',
        'O CPF e o número do recibo do IR',
        'O CPF e a data de nascimento',
      ],
      c: 2,
      e: 'A consulta é aberta, sem login: pede só o CPF e a data de nascimento.',
    },
    {
      p: 'A consulta do CPF mostra PENDENTE DE REGULARIZAÇÃO. O que você faz?',
      o: [
        'Salva o comprovante e leva ao gestor',
        'Explica ao cliente como regularizar',
        'Segue, porque só cancelado é problema',
      ],
      c: 0,
      e: 'Só REGULAR segue direto. Qualquer outra situação vai para o gestor, com o comprovante salvo. Não explique nem tente resolver.',
    },
  ],

  glossario: [
    { termo: 'gov.br', def: 'A conta única do cidadão para os serviços digitais do governo federal. Entra com CPF e senha e abre o Meu INSS, o Meu Imposto de Renda e a assinatura eletrônica.' },
    { termo: 'Nível da conta gov.br', def: 'O grau de segurança da conta: bronze (o básico), prata (validada pelo banco) e ouro (reconhecimento facial). Para assinar as procurações, só prata ou ouro.' },
    { termo: 'Meu Imposto de Renda', def: 'Serviço da Receita Federal, dentro do gov.br, onde ficam as declarações de imposto de renda da pessoa, ano por ano.' },
    { termo: 'Exercício', def: 'O ano em que a declaração de imposto de renda é entregue. É assim que os anos aparecem na tela do Meu Imposto de Renda.' },
    { termo: 'Ano-calendário', def: 'O ano do dinheiro declarado. É sempre o ano anterior ao exercício: o Exercício 2026 fala do ano-calendário 2025.' },
    { termo: 'DEC', def: 'A declaração de imposto de renda completa: rendimentos, bens e direitos, dívidas e o resumo do imposto. Pega-se em cada ano com declaração.' },
    { termo: 'REC', def: 'O recibo de entrega da declaração, com o número do recibo e a data e a hora da entrega. Prova que a declaração foi entregue.' },
    { termo: 'Situação cadastral do CPF', def: 'Diz se o CPF está em ordem na Receita Federal. REGULAR é o esperado; qualquer outra situação vai para o gestor.' },
    { termo: 'Comprovante de situação cadastral', def: 'A página com o resultado da consulta do CPF no site da Receita, salva em PDF ou print. Traz a data e a hora da emissão.' },
  ],

  mensagens: [
    {
      titulo: 'Pedir os prints do imposto de renda',
      quando: 'Quando o cliente consegue entrar no gov.br sozinho e você vai guiar.',
      texto: [
        'Agora vamos para o imposto de renda. Preciso de um print de cada um dos últimos 3 anos. É assim:',
        '',
        '1. Entre no gov.br com o seu CPF e a sua senha (a mesma do Meu INSS)',
        '2. Procure por *Meu Imposto de Renda*',
        '3. Abra a parte das declarações',
        '4. Toque em cada ano e tire um print da tela',
        '',
        'Se no ano aparecer a declaração, baixe também a *declaração* e o *recibo* e me mande.',
        'Qualquer dificuldade, me chame que eu te ajudo em cada passo.',
      ].join('\n'),
    },
    {
      titulo: 'Cliente que não declara',
      quando: 'Quando o cliente conta que não declara imposto de renda.',
      texto: [
        'Sem problema nenhum! Muita gente não declara imposto de renda.',
        'Nesse caso, só preciso de um print de cada um dos últimos 3 anos, mostrando que não tem declaração. É só para deixar a sua documentação completa.',
      ].join('\n'),
    },
    {
      titulo: 'Confirmar a data de nascimento',
      quando: 'Antes de consultar a situação cadastral do CPF, se você ainda não tem a data.',
      texto: 'Para consultar a situação do seu CPF no site da Receita Federal, preciso confirmar a sua data de nascimento. Pode me informar, por favor?',
    },
    {
      titulo: 'Por que precisamos do imposto de renda',
      quando: 'Quando o cliente estranha o pedido ou fica desconfiado.',
      texto: [
        'É uma dúvida muito justa! O imposto de renda faz parte da documentação básica do seu processo, junto com os documentos do INSS.',
        'A gente só consulta e junta os documentos. Não muda nada na sua declaração nem no seu CPF.',
      ].join('\n'),
    },
  ],
};
export default licao;
