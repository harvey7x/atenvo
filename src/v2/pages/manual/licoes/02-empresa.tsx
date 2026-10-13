/* Lição 2 — O que a gente faz: a CAF e o carro-chefe (ressarcimento de juros
   abusivos), os 4 números, quem é quem, as etapas do caso, os 30%, por que não
   há risco de pagar antes, "quanto vou receber?" e os ganchos do canal de
   empréstimo. Esta lição é a DONA do processo, dos 10 anos, dos 6–12 meses, dos
   30% e do "não prometer valor". Canais e robô = lição 5; consignado e margem =
   lição 3; elegibilidade = lição 4 (aqui só 1–2 frases + referência).
   Fatos: só os do dono (13/10/2026) e do processo oficial (18/09).
   As ilustrações próprias ficam em 02-empresa-visuais.tsx. */
import type { Licao } from '../tipos';
import {
  Aviso, BomRuim, Celular, Figura, Frase, Lista, Passos, Sanfona, Secao, Tabela, TesteRapido,
} from '../pecas';
import { CalculadoraHonorarios } from '../ilustracoes';
import {
  CincoFinanceiras, DoDocumentoAoValor, Divisao7030, EtapasDoCaso, GanchosAteOProcesso, JanelaDezAnos,
  JurosSimplificado, MargemBeneficio, QuatroNumeros, QuemEQuem, VerdadeOuMito,
} from './02-empresa-visuais';

const licao: Licao = {
  id: 'empresa',
  modulo: 'fundamentos',
  titulo: 'O que a gente faz',
  resumo: 'A CAF e o nosso carro-chefe, o ressarcimento de juros abusivos: os 4 números, quem faz cada parte, os 30% e como responder sem prometer.',
  minutos: 30, // ~2.170 palavras de texto ÷ 180 ≈ 12 min + 9 interativos/treinos × 2 min
  corpo: (
    <>
      <p className="mv-lead">
        Antes de aprender a atender, você precisa saber muito bem <b>o que a gente oferece</b>. Somos a{' '}
        <b>CAF, Central de Assessoria Financeira</b>. O nosso principal trabalho, o <b>carro-chefe</b> da empresa, são os{' '}
        <b>processos de ressarcimento de juros abusivos</b>: quem recebe benefício do INSS e tem empréstimo em certas
        financeiras pode pedir na Justiça, pelo nosso advogado, o ressarcimento do que foi descontado nos últimos 10 anos.
      </p>
      <p>Nesta lição você vai entender:</p>
      <Lista itens={[
        'O que é o processo, em linguagem simples, e por que ele existe.',
        'Os 4 números que aparecem em quase toda conversa.',
        'Quem faz o quê: o cliente, o robô, você e o advogado.',
        'As etapas do caso, do “sim” do cliente até o ressarcimento.',
        'Como explicar os 30% sem medo e como responder “quanto eu vou receber?” sem prometer nada.',
        'Onde entram o empréstimo, o aumento de margem e a portabilidade.',
      ]} />

      <Secao titulo="A CAF em uma frase">
        <Frase autor="Guarde esta frase. Ela é o resumo de tudo o que a gente faz.">
          A CAF ajuda quem recebe benefício do INSS a pedir na Justiça o ressarcimento dos juros abusivos cobrados nos
          empréstimos.
        </Frase>
        <p>
          <b>Carro-chefe</b> quer dizer produto principal. Tudo o que acontece no atendimento leva até ele. Empréstimo,
          aumento de margem e portabilidade também aparecem nas conversas, principalmente no canal de empréstimo, mas
          como <b>ganchos</b>: assuntos que abrem a conversa e levam o cliente até o processo. Você vai ver isso no fim
          desta lição.
        </p>
        <p>
          <b>Para quem é.</b> O nosso anúncio no Facebook fala com <b>aposentados e pensionistas do INSS</b>, e são eles
          que mais chegam. Mas qualquer benefício do INSS serve: aposentadoria, pensão, auxílio, BPC/LOAS. Se a pessoa não
          recebe nada, mas um familiar próximo (pai, mãe, avó, avô, filho) recebe, a análise pode seguir pelo benefício do
          familiar, e aí os documentos passam a ser os do familiar que recebe. Quem só trabalha de carteira assinada (CLT)
          e não tem ninguém na família recebendo do INSS não serve. As regras completas estão na lição 4.
        </p>
        <p>
          <b>Com quais empréstimos.</b> O processo é para empréstimos em <b>cinco financeiras</b>. As três que mais chegam
          até a gente são Agibank, Mercantil e BMG.
        </p>
        <CincoFinanceiras />
        <Aviso tom="ambar" titulo="Sem empréstimo em nenhuma das cinco?">
          Então a pessoa não é elegível: agradeça com carinho e encerre, sem insistir. A lição 4 mostra o que perguntar
          quando ela não sabe dizer e como encerrar com respeito.
        </Aviso>
      </Secao>

      <Secao titulo="Juros abusivos, em linguagem simples">
        <p>
          Quem pega um empréstimo devolve o dinheiro em parcelas. Cada parcela tem duas partes: um pedaço que{' '}
          <b>devolve o dinheiro emprestado</b> e um pedaço de <b>juros</b>, que é o “preço” do empréstimo. É assim que a
          financeira ganha dinheiro, e isso é normal.
        </p>
        <p>
          No <b>empréstimo consignado</b>, a parcela é descontada direto do benefício, todo mês, antes de o dinheiro cair
          na conta. O cliente quase nunca vê a conta sendo feita: ele só percebe que o benefício “chega menor”.
        </p>
        <p>
          <b>Juros abusivos</b> são juros cobrados bem acima do que deveriam ser para aquele empréstimo. Quando isso
          acontece, todo mês sai do benefício mais do que deveria sair, e isso pode durar anos sem ninguém perceber. A
          lição 3 explica o consignado e os juros com mais calma; aqui basta a ideia.
        </p>
        <Figura tag="Ideia simplificada" legenda="Sem valores reais. A parte listrada é o juro cobrado a mais, e ela se repete em cada parcela, todo mês.">
          <JurosSimplificado />
        </Figura>
        <Aviso tom="ambar" titulo="Não é você quem decide se é abusivo">
          Você não precisa (e não deve) calcular juros na conversa. Quem mostra se houve abuso é a análise dos documentos,
          principalmente dos extratos. O seu papel é explicar a ideia com calma e juntar a documentação.
        </Aviso>
      </Secao>

      <Secao titulo="O processo: pedir o ressarcimento de 10 anos">
        <p>
          Quando o cliente topa, a gente junta a documentação e o nosso advogado, o <b>Dr. Rafael Menezes</b>, entra com
          uma <b>ação</b> (um pedido formal na Justiça) pedindo o <b>ressarcimento do que foi descontado nos últimos 10
          anos</b>. Para o cliente, diga sempre junto: <b>o resultado depende da análise</b>.
        </p>
        <p>
          Pense assim: é como pedir de volta um valor cobrado a mais numa conta. A diferença é que aqui são até 10 anos de
          descontos, e quem faz o pedido é um advogado, do jeito certo, na Justiça.
        </p>
        <Figura tag="Diagrama" legenda="Cada bloco é um ano de descontos no benefício e é também um extrato que você vai baixar no Meu INSS. As datas acompanham o mês de hoje.">
          <JanelaDezAnos />
        </Figura>
        <p>
          Repare na ligação: o pedido olha para <b>10 anos</b>, por isso a gente precisa dos <b>extratos de pagamento dos
          últimos 10 anos</b>. Esse extrato mostra, mês a mês, o que foi pago e o que foi descontado do benefício. O Meu
          INSS só entrega 12 meses por vez, então são 10 consultas, uma por ano. O passo a passo está na lição 10; agora o
          importante é entender o porquê: <b>sem os extratos, não há como mostrar o que foi descontado</b>.
        </p>
      </Secao>

      <Secao titulo="Os 4 números que você vai repetir todos os dias">
        <p>
          Quase toda conversa passa por estes quatro números. Clique em cada um para ver o que ele significa, uma sugestão
          de como falar com o cliente e o cuidado que você precisa ter.
        </p>
        <QuatroNumeros />
        <TesteRapido
          pergunta="A cliente pergunta: “Quanto eu tenho que pagar para começar?”. O que você responde?"
          opcoes={[
            'Uma taxa pequena de abertura e o resto no final',
            'Nada, nunca: o processo é totalmente de graça',
            'Nada agora; no final, 30% do que ela receber',
          ]}
          certa={2}
          explica="Para começar, nada. Mas “totalmente de graça” também está errado: os honorários de 30% existem, e o cliente precisa saber disso desde o começo."
        />
      </Secao>

      <Secao titulo="Quem é quem no caso">
        <p>
          Num caso, quatro “personagens” aparecem. Saber quem faz o quê evita duas confusões comuns: o cliente achar que
          você é o advogado, e você prometer coisas que só o processo pode responder.
        </p>
        <figure className="mv-emp-fig">
          <QuemEQuem />
          <figcaption><span className="mv-tag">Diagrama</span>A ordem em que o cliente passa por cada um.</figcaption>
        </figure>
        <p>
          <b>O que acontece antes de você.</b> O robô já deu as boas-vindas, perguntou se a pessoa quer a análise e pegou
          o nome completo e o CPF: não peça esses dados de novo, continue de onde ele parou. As mensagens exatas de cada
          canal, uma por uma, estão na lição 5.
        </p>
        <p>
          <b>Sobre o Dr. Rafael Menezes</b>, o que você precisa saber e dizer é simples: ele é o nosso advogado e é quem
          entra com a ação. Se o cliente pedir outras informações sobre ele ou sobre o andamento jurídico, não invente:
          diga que vai confirmar e pergunte ao seu gestor.
        </p>
      </Secao>

      <Secao titulo="As etapas do caso">
        <p>
          Do “sim” do cliente até o dinheiro na conta, o caso passa por seis etapas. As três primeiras dependem muito de
          você: quanto mais rápido e bem feito, mais cedo o caso chega ao advogado. Clique em cada etapa.
        </p>
        <EtapasDoCaso />
        <Aviso titulo="O único prazo que a gente fala é o total">
          Em média, de <b>6 a 12 meses</b> até o ressarcimento. Não crie prazos para cada etapa: se você disser “em dois
          meses já tem novidade” e não tiver, o cliente perde a confiança em você e na CAF.
        </Aviso>
      </Secao>

      <Secao titulo="Os 30% sem mistério">
        <p>
          <b>Honorários</b> são o pagamento do advogado pelo trabalho dele. No nosso processo, a regra é sempre a mesma:
        </p>
        <Lista itens={[
          <>O percentual é <b>fixo: 30%</b>.</>,
          <>É cobrado <b>só no final</b> do processo.</>,
          <>Sai <b>do valor que o cliente receber</b>: ele não tira dinheiro do bolso.</>,
          <>Não existe taxa de entrada nem outra cobrança no caminho: é a <b>única</b>.</>,
        ]} />
        <Figura tag="Exemplo" legenda="Escolha um valor de exemplo. A divisão é sempre a mesma: 70% para o cliente, 30% de honorários.">
          <Divisao7030 />
        </Figura>
        <p>Os três exemplos que mais ajudam na conversa (quanto o cliente recebe e como fica a divisão):</p>
        <div className="mv-emp-tab">
          <Tabela
            colunas={['Recebido', 'Advogado 30%', 'Cliente 70%']}
            destaque={2}
            linhas={[
              ['R$ 5.000', 'R$ 1.500', 'R$ 3.500'],
              ['R$ 10.000', 'R$ 3.000', 'R$ 7.000'],
              ['R$ 20.000', 'R$ 6.000', 'R$ 14.000'],
            ]}
          />
        </div>
        <p className="mv-calc-nota">Valores de exemplo, só para explicar a conta. Não são promessa de quanto o cliente vai receber.</p>
        <p><b>Conta de cabeça.</b> Se o cliente der um valor e pedir a conta, faça assim:</p>
        <Passos itens={[
          { titulo: 'Tire um zero: isso dá 10%', texto: 'R$ 20.000 vira R$ 2.000.' },
          { titulo: 'Multiplique por 3: isso dá 30%', texto: 'R$ 2.000 × 3 = R$ 6.000. São os honorários.' },
          { titulo: 'O resto é do cliente: 70%', texto: 'R$ 20.000 − R$ 6.000 = R$ 14.000.' },
        ]} />
        <p>Para outros valores, use a calculadora:</p>
        <CalculadoraHonorarios />
        <BomRuim
          ruim={{
            titulo: 'Evite',
            corpo: (
              <Lista tom="nao" itens={[
                <>“A gente cobra 30%.” <small className="mv-emp-nota">Soa como cobrança agora.</small></>,
                <>“São só 30%, é baratinho.” <small className="mv-emp-nota">Diminui o assunto e parece que você esconde algo.</small></>,
                <>“É 30% do seu empréstimo.” <small className="mv-emp-nota">Errado: é do valor que ele receber.</small></>,
              ]} />
            ),
          }}
          bom={{
            titulo: 'Faça assim',
            corpo: (
              <>
                <p>
                  “Para começar, o senhor não paga nada. No final, do valor que o senhor receber, 30% ficam para o
                  advogado: é o pagamento do trabalho dele. De cada R$&nbsp;10 que o senhor receber, R$&nbsp;7 são seus.”
                </p>
                <p className="mv-emp-dica">Diga isso cedo e com naturalidade. Cliente que descobre os 30% só no fim se sente enganado.</p>
              </>
            ),
          }}
        />
        <p>
          Com cliente mais velho, “o senhor” ou “a senhora” costuma soar mais respeitoso. Se ele preferir “você”, siga o
          jeito dele.
        </p>
        <TesteRapido
          pergunta="Exemplo: uma cliente recebeu R$ 8.000 no final do processo. Quanto fica com ela?"
          opcoes={['R$ 5.600', 'R$ 2.400', 'R$ 8.000, porque o processo é gratuito']}
          certa={0}
          explica="30% de R$ 8.000 são R$ 2.400 de honorários. Ficam com a cliente R$ 5.600 (70%)."
        />
      </Secao>

      <Secao titulo="Por que o cliente não corre o risco de pagar antes">
        <p>
          Muita gente idosa já ouviu falar de golpe com “taxa para liberar dinheiro”. Por isso este ponto traz muita
          segurança, e você precisa explicá-lo bem.
        </p>
        <div className="mv-duas">
          <div className="vidro mv-cartao" data-tom="rubro">
            <h4>O que o cliente não paga</h4>
            <Lista tom="nao" itens={[
              'Taxa de entrada ou de abertura',
              'Parcela ou mensalidade durante o processo',
              'Qualquer valor antes de receber o ressarcimento',
            ]} />
          </div>
          <div className="vidro mv-cartao" data-tom="verde">
            <h4>O que existe</h4>
            <Lista tom="sim" itens={[
              '30% de honorários, fixos',
              'Cobrados só no final do processo',
              'Retirados do valor que o cliente receber',
            ]} />
          </div>
        </div>
        <p>
          Repare na lógica: como os honorários saem do valor que o cliente recebe, <b>não existe um momento em que ele
          precise pagar do próprio bolso</b> para o processo andar. Por isso dá para dizer, com tranquilidade: “para
          começar, você não paga nada”.
        </p>
        <Aviso tom="rubro" titulo="Sinal de alerta">
          A CAF não pede pagamento adiantado. Se alguém pedir dinheiro ao cliente “para liberar o processo” em nome da
          CAF, isso não é o nosso processo. Se um cliente contar algo assim, avise o seu gestor na hora.
        </Aviso>
        <Aviso titulo="E se ele perguntar “e se não der certo?”">
          Não improvise sobre resultado nem sobre regras jurídicas. Fale o que é certo: para começar ele não paga nada, e
          os 30% saem do valor que ele receber. Se ele quiser saber mais, diga que vai confirmar e pergunte ao seu gestor.
        </Aviso>
      </Secao>

      <Secao titulo="“Quanto eu vou receber?”">
        <p>
          É a pergunta que mais aparece, e a mais perigosa. A resposta honesta é: <b>depende da análise</b>. Não é
          desculpa, é a verdade. O valor depende do que aparece nos extratos (quais empréstimos, quanto foi descontado e
          por quanto tempo) e do resultado do processo. Dois clientes com o mesmo banco podem ter valores bem diferentes.
        </p>
        <p>
          <b>Por que prometer é tão grave:</b> o cliente guarda o número que você fala. Se o valor final for menor, ele vai
          achar que foi enganado, por você e pela CAF. E é uma questão de ética: o cliente decide entrar no processo, e ele
          precisa decidir com informação verdadeira.
        </p>
        <Figura tag="Diagrama" legenda="O valor só existe no fim do caminho. Quando o cliente pergunta, a conversa ainda está no começo.">
          <DoDocumentoAoValor />
        </Figura>
        <BomRuim
          ruim={{
            titulo: 'Evite',
            corpo: (
              <Lista tom="nao" itens={[
                '“Dá uns R$ 15 mil, fácil.”',
                '“Com certeza a senhora vai receber.”',
                '“Pelo seu caso, deve dar um bom dinheiro.”',
              ]} />
            ),
          }}
          bom={{
            titulo: 'Faça assim',
            corpo: (
              <>
                <p>
                  “Ainda não dá para saber, e eu não quero prometer um número que eu não sei. Quem vai mostrar é a análise
                  dos seus extratos dos últimos 10 anos. Por isso os documentos são tão importantes.”
                </p>
                <p className="mv-emp-dica">Depois, leve a conversa para o próximo passo: os documentos.</p>
              </>
            ),
          }}
        />
        <Celular
          contato="Neusa"
          legenda="Sugestão de roteiro: adapte ao cliente."
          bolhas={[
            { de: 'cliente', texto: 'E quanto eu vou receber?', hora: '10:02' },
            { de: 'eu', texto: 'Essa é a pergunta mais importante, né, Dona Neusa? Hoje eu ainda não consigo dizer um valor, e não quero prometer à senhora um número que eu não sei.', hora: '10:03' },
            { de: 'eu', texto: 'Quem mostra isso é a análise dos seus extratos do INSS dos últimos 10 anos. Por isso esses documentos são tão importantes.', hora: '10:03' },
            { de: 'cliente', texto: 'Entendi. E o que você precisa de mim?', hora: '10:05' },
            { de: 'eu', texto: 'Vamos começar pelo Meu INSS. A senhora consegue entrar no aplicativo ou prefere que eu ajude?', hora: '10:05' },
          ]}
        />
        <TesteRapido
          pergunta="O cliente insiste: “Só me diz um valor aproximado, pra eu ter uma ideia”. O que fazer?"
          opcoes={[
            'Dizer um valor baixo, para não decepcionar',
            'Dizer que depende da análise dos extratos',
            'Contar quanto outro cliente parecido recebeu',
          ]}
          certa={1}
          explica="Qualquer número vira promessa, até um “valor baixo” ou o caso de outra pessoa. O caminho é explicar que depende da análise e mostrar que os documentos são o próximo passo."
        />
      </Secao>

      <Secao titulo="As outras frentes: ganchos, não produtos">
        <p>
          A CAF tem dois tráfegos pagos no Facebook: no de <b>juros abusivos</b> (o tráfego do Andrius) o cliente já quer
          a revisão e a venda é mais direta; no de <b>empréstimo</b> ele quer dinheiro rápido, e é preciso convencer. Como
          reconhecer cada canal e o que o robô já disse em cada um, veja a lição 5.
        </p>
        <p>
          No canal de empréstimo, o cliente não pediu o processo. Só que, na maioria das vezes, ele <b>não tem margem</b>.
          A <b>margem consignável</b> é a parte do benefício que pode ficar comprometida com descontos de empréstimo e de
          cartão consignado. Quando essa parte já está tomada pelas parcelas que ele paga, não cabe empréstimo novo (a
          lição 3 explica a margem em detalhe).
        </p>
        <Figura tag="Ideia simplificada" legenda="Regra geral do consignado do INSS: até 45% do benefício (35% para empréstimos e 5% + 5% para os cartões consignados). Veja com calma na lição 3.">
          <MargemBeneficio />
        </Figura>
        <p>
          É aí que entram os <b>ganchos</b>. Eles não são produtos que a gente promete: são assuntos que abrem a conversa,
          mostram que você entende a situação do cliente e levam até o carro-chefe.
        </p>
        <figure className="mv-emp-fig">
          <GanchosAteOProcesso />
          <figcaption><span className="mv-tag">Diagrama</span>O caminho da conversa no canal de empréstimo.</figcaption>
        </figure>
        <Aviso tom="ambar" titulo="Gancho é possibilidade, não promessa">
          Fale sempre em “ver a possibilidade”. A portabilidade pode liberar um valor acima de R$&nbsp;1.500, mas isso depende de
          cada caso: nunca garanta que vai sair. O cliente desse canal chega com a mensagem de análise “pré-aprovada”, que
          não é valor liberado; a lição 5 explica como conduzir esse momento com honestidade.
        </Aviso>
        <TesteRapido
          pergunta="Um cliente do canal de empréstimo, sem margem, pergunta: “A portabilidade vai liberar os R$ 1.500?”. Qual a melhor resposta?"
          opcoes={[
            '“Vai sim, pode contar com esse dinheiro.”',
            '“É uma possibilidade, depende da análise.”',
            '“Sem margem não tem jeito, sinto muito.”',
          ]}
          certa={1}
          explica="Portabilidade é possibilidade, nunca garantia. E sem margem não é o fim da conversa: depois, apresente o processo de ressarcimento."
        />
      </Secao>

      <Secao titulo="Perguntas sobre a empresa que o cliente faz">
        <Sanfona itens={[
          {
            titulo: '“Vocês são do INSS?” ou “Vocês são do banco?”',
            corpo: <p>Não. Somos a CAF, Central de Assessoria Financeira. O Meu INSS e o gov.br são os sites oficiais onde a gente busca os documentos e onde o cliente assina. Nunca deixe o cliente achar que você fala em nome do INSS ou do banco.</p>,
          },
          {
            titulo: '“Quem é o advogado?”',
            corpo: <p>O Dr. Rafael Menezes, o nosso advogado. É ele quem entra com a ação. Se o cliente pedir outras informações sobre ele, diga que vai confirmar e pergunte ao seu gestor.</p>,
          },
          {
            titulo: '“Quanto custa?”',
            corpo: <p>Nada para começar. No final, 30% do valor que ele receber ficam para o advogado, como honorários. Use o exemplo de R$&nbsp;10 mil: R$&nbsp;7 mil ficam com ele.</p>,
          },
          {
            titulo: '“Quanto tempo demora?”',
            corpo: <p>Em média, de 6 a 12 meses até o ressarcimento. Cada processo tem o seu ritmo, por isso não existe data exata.</p>,
          },
          {
            titulo: '“Por que vocês precisam de tanto documento?”',
            corpo: <p>É a documentação básica do procedimento, nada fora do normal. E tem um porquê: os extratos de 10 anos mostram os descontos do período do pedido. Sem eles, não há o que analisar.</p>,
          },
          {
            titulo: '“Quanto eu vou receber?”',
            corpo: <p>Depende da análise dos extratos. Não prometa valor: explique o porquê e leve a conversa para os documentos.</p>,
          },
        ]} />
      </Secao>

      <Secao titulo="Exercício: verdade ou mito?">
        <p>Leia cada frase e decida. A explicação aparece logo depois da sua resposta.</p>
        <VerdadeOuMito />
      </Secao>

      <Secao titulo="Resumo da lição">
        <Lista itens={[
          <>A <b>CAF</b> (Central de Assessoria Financeira) tem como carro-chefe o <b>processo de ressarcimento de juros abusivos</b>, para quem recebe benefício do INSS e tem empréstimo em uma das 5 financeiras.</>,
          <>O <b>Dr. Rafael Menezes</b>, nosso advogado, entra com a ação pedindo o ressarcimento do que foi descontado nos <b>últimos 10 anos</b>. Em média, leva de <b>6 a 12 meses</b>.</>,
          <>Para começar, o cliente <b>não paga nada</b>. No final, <b>30% fixos</b> do valor que ele receber são os honorários; 70% ficam com ele.</>,
          <>O caso anda assim: documentos, cadastro, procurações assinadas, ação, acompanhamento e ressarcimento.</>,
          <>“Quanto vou receber?”: <b>depende da análise dos extratos</b>. Nunca prometa valor, data ou resultado.</>,
          <>Aumento de margem e portabilidade são <b>ganchos</b> do canal de empréstimo: possibilidades, não promessas. O destino da conversa é o processo.</>,
        ]} />
      </Secao>
    </>
  ),
  questoes: [
    {
      p: 'Qual é o carro-chefe da CAF, o produto principal da empresa?',
      o: [
        'Empréstimo consignado novo para quem tem margem',
        'Processo de ressarcimento de juros abusivos',
        'Portabilidade de consignado para outro banco',
      ],
      c: 1,
      e: 'O principal trabalho da CAF são os processos de ressarcimento de juros abusivos. Empréstimo e portabilidade aparecem como ganchos de conversa.',
    },
    {
      p: 'Exemplo: o cliente recebeu R$ 20.000 no final do processo. Como fica a divisão?',
      o: [
        'R$ 6.000 com o cliente e R$ 14.000 de honorários',
        'R$ 20.000 com o cliente e honorários pagos à parte',
        'R$ 14.000 com o cliente e R$ 6.000 de honorários',
      ],
      c: 2,
      e: 'Os honorários são 30% (R$ 6.000), retirados do valor recebido. O cliente fica com 70% (R$ 14.000).',
    },
    {
      p: 'Quando e como o cliente paga os honorários do advogado?',
      o: [
        'Só no final, retirados do valor que ele receber',
        'Uma entrada pequena no começo e o resto no final',
        'Em parcelas mensais, enquanto o processo corre',
      ],
      c: 0,
      e: 'Não há nada a pagar para começar nem durante o processo. Os 30% saem do valor recebido, no final.',
    },
    {
      p: 'O cliente pergunta: “Quanto eu vou receber?”. Qual é a resposta certa?',
      o: [
        'Um valor médio, só para o cliente ter uma ideia',
        'Que o valor depende da análise dos extratos',
        'Quanto recebeu outro cliente do mesmo banco',
      ],
      c: 1,
      e: 'O valor depende da análise dos extratos e do resultado do processo. Qualquer número dito antes, mesmo “médio” ou de outro cliente, vira promessa.',
    },
    {
      p: 'O que a ação do Dr. Rafael Menezes pede e quanto tempo o ressarcimento costuma levar, em média?',
      o: [
        'O que foi descontado nos últimos 5 anos; de 1 a 2 anos',
        'O que foi descontado nos últimos 10 anos; uns 30 dias',
        'O que foi descontado nos últimos 10 anos; 6 a 12 meses',
      ],
      c: 2,
      e: 'A ação pede o ressarcimento do que foi descontado nos últimos 10 anos, e o ressarcimento leva, em média, de 6 a 12 meses.',
    },
  ],
  glossario: [
    { termo: 'CAF', def: 'Central de Assessoria Financeira, a nossa empresa. O carro-chefe é o processo de ressarcimento de juros abusivos.' },
    { termo: 'Juros', def: 'O “preço” de um empréstimo: o que a financeira cobra, além do dinheiro emprestado, para emprestar.' },
    { termo: 'Ressarcimento', def: 'Devolução de um valor pago ou descontado. A nossa ação pede o ressarcimento do que foi descontado nos últimos 10 anos.' },
    { termo: 'Ação judicial', def: 'Pedido formal feito na Justiça por um advogado. Quem entra com a ação dos nossos clientes é o Dr. Rafael Menezes.' },
    { termo: 'Honorários', def: 'O pagamento do advogado pelo trabalho dele. No nosso processo: 30% fixos, só no final, retirados do valor que o cliente receber.' },
    { termo: 'Gancho', def: 'Assunto usado para abrir a conversa e levar o cliente até o processo, como o aumento de margem e a portabilidade no canal de empréstimo.' },
  ],
  mensagens: [
    {
      titulo: 'O processo em poucas palavras',
      quando: 'Quando o cliente pergunta “como funciona?”.',
      texto: [
        'Funciona assim: a gente junta os seus documentos e o nosso advogado, o Dr. Rafael Menezes, entra com uma ação pedindo o ressarcimento do que foi descontado nos últimos 10 anos. O resultado depende da análise.',
        '',
        'Para começar, você não paga nada. No final, do valor que você receber, 30% ficam para o advogado, como honorários.',
        '',
        'Em média, o processo leva de 6 a 12 meses.',
      ].join('\n'),
    },
    {
      titulo: 'Explicar os 30%',
      quando: 'Quando o cliente pergunta quanto custa ou se tem que pagar alguma coisa.',
      texto: [
        'Você não paga nada para começar e não tem nenhuma taxa no meio do caminho.',
        '',
        'Só no final, do valor que você receber, 30% ficam para o advogado. Por exemplo: se você receber R$ 10.000, R$ 7.000 ficam com você e R$ 3.000 são os honorários do advogado.',
        '',
        'Ou seja: de cada R$ 10 que você receber, R$ 7 são seus.',
      ].join('\n'),
    },
    {
      titulo: '“Quanto eu vou receber?”',
      quando: 'Quando o cliente pede um valor ou uma estimativa.',
      texto: [
        'Entendo, essa pergunta é muito importante! Mas eu ainda não consigo te dizer um valor, e não quero te prometer um número que eu não sei.',
        '',
        'Quem vai mostrar isso é a análise dos seus extratos do INSS dos últimos 10 anos. Por isso os documentos são tão importantes. Vamos começar por eles?',
      ].join('\n'),
    },
    {
      titulo: 'Quanto tempo demora',
      quando: 'Quando o cliente pergunta do prazo.',
      texto: [
        'Em média, o processo leva de 6 a 12 meses até o ressarcimento. Cada processo tem o seu ritmo, por isso eu não consigo te dar uma data exata.',
        '',
        'E enquanto isso você não paga nada: os honorários só aparecem no final, tirados do valor que você receber.',
      ].join('\n'),
    },
  ],
};
export default licao;
