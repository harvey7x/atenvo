/* Lição 3 — Consignado e juros abusivos. Aula de base para quem nunca viu um
   consignado: desconto direto no benefício, margem consignável (35% + 5% RMC +
   5% RCC), "não ter margem", cartões RMC e RCC, como ler o extrato de pagamento
   do INSS, portabilidade, aumento de margem e juros abusivos.
   Fatos da empresa: só os do dono (13/10/2026). Valores e pessoas: EXEMPLO.
   As ilustrações próprias ficam em 03-consignado-visuais.tsx. */
import type { Licao } from '../tipos';
import {
  Aviso, BomRuim, Celular, Conversa, Fatos, Frase, LinhaTempo, Lista, Passos, Sanfona, Secao, Tabela, TesteRapido,
} from '../pecas';
import {
  ArvoreSemMargem, BarraMargem, CicloRmc, ExtratoInterativo, FluxoDinheiro, JurosRazoavelAbusivo, MapaConsignado,
  PortabilidadeAntesDepois, PrintMargem, SimuladorMargem,
} from './03-consignado-visuais';

const licao: Licao = {
  id: 'consignado',
  modulo: 'fundamentos',
  titulo: 'Consignado e juros abusivos',
  resumo: 'O que é consignado, margem, cartões RMC e RCC, portabilidade e juros abusivos, e como ler o extrato do INSS. A base de toda conversa com o cliente.',
  minutos: 30,
  corpo: (
    <>
      <p className="mv-lead">
        Os clientes que chegam até a gente costumam ter uma coisa em comum: um <b>empréstimo consignado</b> descontado do
        benefício do INSS. Antes de conversar com qualquer cliente, você precisa entender esse mundo melhor do que ele:
        o que é consignado, o que é margem, por que ele “não tem margem”, o que são os cartões RMC e RCC, o que é
        portabilidade e o que quer dizer <b>juros abusivos</b>. Esta lição é a base de todas as outras. Leia com calma,
        mexa nos simuladores e só avance quando conseguir explicar cada ideia com as suas próprias palavras.
      </p>

      <div className="vidro mv-cartao" data-tom="azul">
        <h4>O que você vai aprender</h4>
        <Lista itens={[
          'O que é um empréstimo consignado e por que o desconto sai antes de o dinheiro cair na conta.',
          'O que é margem consignável e como fazer a conta de cabeça.',
          'O que são os cartões consignados RMC e RCC.',
          'Como ler o extrato de pagamento do INSS, linha por linha.',
          'O que significa “não ter margem” e quais caminhos existem.',
          'O que são juros abusivos e por que dá para pedir de volta.',
        ]} />
      </div>

      {/* ------------------------------------------------------------------ consignado */}
      <Secao titulo="1. O que é um empréstimo consignado">
        <p>
          Empréstimo é simples: o banco empresta um dinheiro e a pessoa devolve aos poucos, em parcelas, com juros. O que
          muda no consignado é <b>como a parcela é paga</b>.
        </p>
        <p>
          No consignado, a parcela é <b>descontada direto do benefício</b>. Antes de pagar o aposentado ou o pensionista,
          o INSS separa o valor da parcela e manda para o banco. Só o que sobra cai na conta do cliente. Ele não precisa
          lembrar de pagar nada: o desconto acontece sozinho, todo mês, até o contrato acabar. A palavra “consignado” vem
          daí: a parcela fica <i>consignada</i>, vinculada ao benefício.
        </p>
        <FluxoDinheiro />
        <p>
          Para o banco, isso é bem mais seguro: a parcela chega direto do INSS, e o risco de atraso é muito baixo. É por isso
          que os bancos oferecem tanto consignado para quem recebe do INSS. E é por isso também que o cliente às vezes nem percebe
          quanto já está pagando: o dinheiro da parcela nunca passa pela mão dele.
        </p>
        <Tabela
          colunas={['', 'Empréstimo comum', 'Consignado do INSS']}
          destaque={0}
          linhas={[
            ['Como a parcela é paga', 'O cliente paga (boleto ou débito na conta)', 'O INSS desconta direto do benefício'],
            ['Quando a parcela sai', 'Depois que o dinheiro cai na conta', 'Antes de o dinheiro cair na conta'],
            ['Risco de atraso para o banco', 'Existe: o cliente pode esquecer ou ficar sem saldo', 'Muito baixo: o desconto é automático'],
            ['Limite de desconto', 'Depende do banco', 'A lei limita: é a margem consignável'],
            ['Juros, em geral', 'Mais altos', 'Mais baixos, porque o risco do banco é menor'],
          ]}
        />
        <Aviso titulo="O consignado não é o vilão">
          Consignado é um produto legal e pode ajudar muita gente. O problema não é o cliente ter consignado: é pagar juros
          muito acima do razoável. Nunca fale mal do empréstimo do cliente nem o faça se sentir culpado por ter feito.
          Explique, com respeito.
        </Aviso>
      </Secao>

      {/* ------------------------------------------------------------------ margem */}
      <Secao titulo="2. Margem consignável: o limite do que pode ser descontado">
        <p>
          Se o banco pudesse descontar quanto quisesse, o aposentado poderia ficar sem dinheiro para comer. Para proteger
          o cliente, a lei põe um limite: só uma parte do benefício pode ir para descontos de consignado. Essa parte se
          chama <b>margem consignável</b>.
        </p>
        <p>
          Para quem recebe do INSS, a margem é de <b>até 45% do benefício</b>, dividida em três partes. O jeito mais fácil
          de entender é pensar em <b>gavetas</b>: cada gaveta tem um tamanho fixo e só aceita um tipo de desconto.
        </p>
        <Fatos itens={[
          { grande: '45%', texto: 'é o máximo do benefício que pode ir para descontos de consignado: a margem consignável.' },
          { grande: '35%', texto: 'é a gaveta dos empréstimos consignados. É a única que serve para empréstimo.' },
          { grande: '5% RMC', texto: 'é a gaveta do cartão de crédito consignado.' },
          { grande: '5% RCC', texto: 'é a gaveta do cartão consignado de benefício.' },
        ]} />
        <BarraMargem />
        <p>Repare em três coisas no desenho:</p>
        <Lista itens={[
          <>Os <b>55% restantes são protegidos</b>. Nenhum consignado pode avançar sobre eles: é o dinheiro do mês para viver.</>,
          <>A gaveta grande, dos <b>35%</b>, é a única que serve para <b>empréstimo</b>. Quando falamos em “margem” no dia a dia, quase sempre é dela que estamos falando.</>,
          <>As duas gavetas pequenas, de <b>5% cada</b>, são só dos <b>cartões consignados</b> (RMC e RCC). Espaço sobrando numa gaveta de cartão não pode ser usado para empréstimo.</>,
        ]} />

        <p><b>Fazendo a conta de cabeça.</b> Você vai precisar entender números de margem o tempo todo. Um truque simples para achar os 35% de qualquer benefício:</p>
        <Passos itens={[
          { titulo: 'Ache 10% do benefício', texto: 'É o mesmo que dividir por 10. Num benefício de R$ 2.000, 10% = R$ 200.' },
          { titulo: 'Multiplique por 3', texto: 'Isso dá 30%: R$ 200 × 3 = R$ 600.' },
          { titulo: 'Some a metade dos 10%', texto: 'A metade de R$ 200 é R$ 100 (são os 5%). R$ 600 + R$ 100 = R$ 700. Pronto: esses são os 35%.' },
        ]} />
        <Aviso tom="ambar" titulo="Você não precisa calcular a margem real na mão">
          O valor exato da margem do cliente aparece pronto no <b>Extrato de Empréstimo Consignado</b>, no Meu INSS (você
          vai ver um exemplo mais abaixo). A conta serve para você <b>entender</b> o número e conseguir explicar para o
          cliente, não para substituir o extrato.
        </Aviso>

        <p>
          <b>Agora é com você.</b> Mexa no simulador: mude o valor do benefício, aumente as parcelas que o cliente já paga e
          ligue ou desligue os cartões. Veja o que acontece com a margem livre. Use os exemplos prontos para ver um cliente
          sem margem e outro com folga.
        </p>
        <SimuladorMargem />
        <TesteRapido
          pergunta="O benefício de um cliente é de R$ 3.000 (exemplo). Somando todas as parcelas de empréstimo, qual é o máximo que pode ser descontado por mês?"
          opcoes={['R$ 1.350 (45%)', 'R$ 1.050 (35%)', 'R$ 150 (5%)']}
          certa={1}
          explica="A gaveta dos empréstimos é de 35%: 10% de R$ 3.000 = R$ 300; × 3 = R$ 900; + R$ 150 = R$ 1.050. Os outros 10% (até chegar aos 45%) são só dos cartões RMC e RCC."
        />
      </Secao>

      {/* ------------------------------------------------------------------ RMC e RCC */}
      <Secao titulo="3. Os cartões consignados: RMC e RCC">
        <p>
          Além do empréstimo, existem dois tipos de <b>cartão</b> que também são descontados direto do benefício. Cada um
          tem a sua gaveta de 5%. Os nomes RMC e RCC aparecem muito nos extratos, então vale aprender bem.
        </p>
        <div className="mv-duas">
          <div className="vidro mv-cartao mv-csg-cartao" data-tom="ambar">
            <span className="mv-csg-sigla">RMC · Reserva de Margem Consignável</span>
            <h4>Cartão de crédito consignado</h4>
            <p>
              Um cartão de crédito ligado ao benefício. Com ele dá para fazer compras e também sacar dinheiro (o “saque” do
              cartão). Todo mês, o INSS desconta do benefício uma parte da fatura e manda para o banco.
            </p>
            <Lista itens={['Gaveta própria: 5% do benefício.', 'Aparece no extrato com o nome do banco.', 'Ponto de atenção: o desconto pode se arrastar por muito tempo.']} />
          </div>
          <div className="vidro mv-cartao mv-csg-cartao" data-tom="ambar">
            <span className="mv-csg-sigla">RCC · Reserva de Cartão Consignado</span>
            <h4>Cartão consignado de benefício</h4>
            <p>
              Outro cartão ligado ao benefício, com a sua própria gaveta de 5%. Funciona de forma parecida: o desconto
              também sai direto do benefício, todo mês, antes de o dinheiro cair na conta.
            </p>
            <Lista itens={['Gaveta própria: mais 5% do benefício.', 'Também aparece no extrato com o nome do banco.', 'Não é o mesmo que o RMC: são duas reservas diferentes.']} />
          </div>
        </div>
        <p>
          <b>Por que o RMC merece atenção?</b> Porque, em linhas gerais, o desconto mensal paga só uma parte da fatura (o
          mínimo). Se o restante não for pago à parte, ele continua rendendo juros de cartão, e no mês seguinte o ciclo se
          repete. Resultado: o desconto pode durar muito tempo, sem o cliente entender por quê.
        </p>
        <CicloRmc />
        <p>
          Pode acontecer, também, de o cliente <b>nem saber que tem um cartão consignado</b>: ele lembra de ter “pegado um
          dinheiro” no banco e acha que foi um empréstimo comum. Por isso, quando você estiver com o extrato em mãos, leia
          linha por linha, sem pular nada.
        </p>
        <Tabela
          colunas={['', 'Empréstimo consignado', 'Cartão RMC', 'Cartão RCC']}
          destaque={0}
          linhas={[
            ['O que é', 'Dinheiro emprestado, devolvido em parcelas', 'Cartão de crédito consignado', 'Cartão consignado de benefício'],
            ['Gaveta da margem', '35%', '5%', '5%'],
            ['O desconto no benefício', 'Parcela fixa, até o contrato acabar', 'Uma parte da fatura (o mínimo), todo mês', 'Desconto mensal ligado ao cartão'],
            ['Nome da reserva', '—', 'Reserva de Margem Consignável', 'Reserva de Cartão Consignado'],
          ]}
        />
        <Aviso tom="ambar" titulo="Explique, não acuse">
          Ao encontrar RMC ou RCC no extrato, não diga que é golpe nem que o banco enganou o cliente. Explique o que é, com
          calma, e deixe a análise mostrar se houve abuso.
        </Aviso>
        <TesteRapido
          pergunta="No extrato aparece: “Cartão de crédito consignado (RMC) · BMG”. O que isso quer dizer?"
          opcoes={[
            'Que o cliente tem mais um empréstimo consignado comum no BMG',
            'Que tem um cartão de crédito consignado do BMG, com desconto mensal',
            'Que o BMG cobra do cliente uma taxa fixa todo mês pelo benefício do INSS',
          ]}
          certa={1}
          explica="RMC é o cartão de crédito consignado. Usa uma gaveta própria de 5%, e o desconto mensal é uma parte da fatura do cartão."
        />
      </Secao>

      {/* ------------------------------------------------------------------ extrato */}
      <Secao titulo="4. Como ler o extrato de pagamento do INSS">
        <p>
          O <b>Extrato de Pagamento de Benefício</b> (no Meu INSS ele também aparece como <b>Histórico de Créditos</b>) é o
          “contracheque” do aposentado. Ele mostra, mês a mês, quanto o benefício vale, cada desconto que foi feito e quanto
          sobrou para cair na conta. É um dos documentos que pegamos do cliente, cobrindo os últimos 10 anos. Na lição 10,
          “Documentos do Meu INSS”, você aprende a baixar; aqui, você aprende a <b>ler</b>.
        </p>
        <p>
          Vamos acompanhar um caso de exemplo até o fim da lição: a <b>Dona Lúcia</b>, aposentada, que veio pelo anúncio de
          empréstimo. Clique em cada linha do extrato dela (ou use os botões Anterior e Próximo) para entender o que cada
          uma quer dizer. No fim, aperte “Somar só os empréstimos”.
        </p>
        <ExtratoInterativo />
        <p><b>Como ler qualquer extrato em quatro olhadas:</b></p>
        <Passos itens={[
          { titulo: 'Ache o mês (competência)', texto: 'Cada bloco do extrato é um mês. Confira se está olhando o mês certo.' },
          { titulo: 'Veja o valor bruto', texto: 'É o benefício antes dos descontos, a base para entender a margem.' },
          { titulo: 'Liste os descontos de consignado, banco por banco', texto: 'Separe empréstimos, cartão RMC e cartão RCC. Anote se aparece Agibank, BMG, Facta, Mercantil ou Crefisa. Podem aparecer também descontos que não são de consignado (por exemplo, imposto de renda retido): eles não entram na conta da margem.' },
          { titulo: 'Compare com o líquido', texto: 'O líquido é o que caiu na conta. A diferença entre bruto e líquido é o peso dos descontos no mês do cliente.' },
        ]} />
        <p>
          <b>E onde eu vejo a margem?</b> O extrato de pagamento mostra os <b>descontos</b>. Já o <b>Extrato de Empréstimo
          Consignado</b> mostra os <b>contratos</b> e quanto ainda sobra de margem em cada gaveta. É nele que você confirma
          se o cliente tem ou não margem livre. Veja o da Dona Lúcia, numa versão simplificada:
        </p>
        <PrintMargem />
        <p>
          Os dois documentos contam a mesma história por ângulos diferentes: o extrato de pagamento mostra o dinheiro saindo
          mês a mês; o extrato de consignado mostra os contratos que causam esses descontos e o espaço que sobrou.
        </p>
      </Secao>

      {/* ------------------------------------------------------------------ sem margem */}
      <Secao titulo="5. O que é “não ter margem”">
        <p>
          Estar <b>sem margem</b> (você também vai ouvir “margem zerada” ou “margem comprometida”) quer dizer uma coisa só: a
          gaveta dos empréstimos está cheia. As parcelas que o cliente já paga ocupam todos os 35% e não cabe parcela nova.
          Sem espaço na gaveta, o banco não consegue liberar um consignado novo.
        </p>
        <p>
          E aqui está a parte mais importante para o canal de empréstimo: <b>a maioria dos clientes que chegam por esse canal
          não tem margem disponível</b>. Faz sentido: quem procura empréstimo, muitas vezes, já pegou outros antes, e cada
          contrato foi ocupando um pedaço da gaveta. Veja como isso aconteceu com a Dona Lúcia (exemplo fictício, valores
          simplificados, com o benefício de R$ 2.000 e a gaveta de R$ 700):
        </p>
        <LinhaTempo itens={[
          { quando: 'Ano 1', titulo: 'Primeiro empréstimo (Agibank)', texto: 'Parcela de R$ 310. Da gaveta de R$ 700, sobram R$ 390.' },
          { quando: 'Ano 3', titulo: 'Segundo empréstimo (Mercantil)', texto: 'Parcela de R$ 240. Sobram R$ 150 na gaveta.' },
          { quando: 'Ano 4', titulo: 'Cartão consignado RMC (BMG)', texto: 'Usa a gaveta própria de 5% (R$ 100). Não mexe nos 35%.' },
          { quando: 'Ano 5', titulo: 'Cartão de benefício RCC (Agibank)', texto: 'Mais uma gaveta de 5% (R$ 100) ocupada.' },
          { quando: 'Ano 6', titulo: 'Terceiro empréstimo (BMG)', texto: 'Parcela de R$ 150. A gaveta dos empréstimos chega a R$ 700: está cheia.' },
          { quando: 'Hoje', titulo: 'Vê o anúncio e quer mais um empréstimo', texto: 'Não cabe parcela nova: a Dona Lúcia está sem margem. É aqui que você entra.' },
        ]} />
        <Frase>Margem é espaço. Quando a gaveta enche, empréstimo novo não cabe, mas ainda existem caminhos para analisar.</Frase>
        <p>
          Lembre também de <b>como o cliente chega</b>. No canal de empréstimo, antes de você assumir, o robô e a IA fazem a
          primeira conversa, confirmam os dados, e a IA manda esta mensagem:
        </p>
        <div className="mv-csg-cel">
          <Celular
            contato="CAF"
            bolhas={[
              { de: 'robo', texto: 'Boa notícia, Lúcia! Sua análise foi *pré-aprovada*.', hora: '10:14' },
              { de: 'cliente', texto: 'Graças a Deus! Quanto vai cair pra mim?', hora: '10:15' },
            ]}
            legenda="Trecho. A mensagem automática é a real do canal de empréstimo; a resposta da cliente é exemplo."
          />
        </div>
        <p>
          A cliente lê “pré-aprovada” e fica animada, o que é natural. Por isso, quando você assume, o primeiro passo segue
          sempre a mesma ordem: <b>(1)</b> apresentar-se, com o seu nome e a CAF; <b>(2)</b> explicar com honestidade o que é a
          “pré-aprovada”: a análise inicial passou nas perguntas, mas não é valor liberado; <b>(3)</b> fazer uma pergunta
          aberta e curta sobre o que a pessoa precisa; <b>(4)</b> pedir os extratos do Meu INSS para conferir a situação. Esse
          momento é explicado em detalhe na lição 5.
        </p>
        <p>
          Com os extratos em mãos, o seu papel é <b>conduzir com honestidade</b>: conferir a margem, explicar com calma quando
          a gaveta estiver cheia e apresentar os caminhos. Nunca esconda a situação e nunca prometa o que depende de análise.
        </p>
        <BomRuim
          ruim={{
            corpo: (
              <Lista tom="nao" itens={[
                '“Infelizmente a senhora está sem margem. Não tem o que fazer.” (fecha a porta)',
                '“Fica tranquila, pela portabilidade eu consigo R$ 1.500 pra senhora.” (promessa)',
                'Dizer “sem margem” sem ter conferido o extrato de consignado.',
              ]} />
            ),
          }}
          bom={{
            corpo: (
              <Lista tom="sim" itens={[
                'Conferir o extrato de consignado antes de afirmar qualquer coisa.',
                'Explicar o que é margem com o exemplo das gavetas.',
                'Apresentar os caminhos como possibilidades que serão analisadas.',
                'Apresentar o processo: o advogado pede o ressarcimento do que foi descontado nos últimos 10 anos, e o resultado depende da análise.',
              ]} />
            ),
          }}
        />
        <Conversa
          titulo="Explicando “sem margem” para a cliente"
          nota="Sugestão de roteiro, adapte ao cliente. Começa depois do primeiro passo, com os extratos já conferidos."
          falas={[
            { quem: 'eu', texto: 'Dona Lúcia, conferi os seus extratos. Vou explicar com calma: do benefício, a lei só deixa usar uma parte para pagar empréstimos consignados. Essa parte se chama margem.' },
            { quem: 'eu', texto: 'Hoje, as parcelas que a senhora já paga para o Agibank, o Mercantil e o BMG ocupam toda essa parte. Por isso um empréstimo novo não cabe agora.' },
            { quem: 'cliente', texto: 'Então não tem jeito?' },
            { quem: 'eu', texto: 'Tem caminhos, sim, e eu vou ver com a senhora. Um deles é a possibilidade de aumento de margem. Outro é a portabilidade: levar os empréstimos para outro banco, o que em alguns casos libera um valor. Mas isso só a análise confirma, tá bom?' },
            { quem: 'eu', texto: 'E vale analisar os juros desses empréstimos. Se houver juros abusivos, dá para pedir de volta o que foi descontado nos últimos 10 anos. O resultado depende da análise. Posso te explicar como funciona?' },
          ]}
        />
        <p>
          Daqui em diante (como apresentar o processo, explicar os 30% e pedir os documentos), siga o roteiro completo da
          lição 7. Aqui, o importante é você saber explicar a margem com as suas palavras.
        </p>
        <TesteRapido
          pergunta="No extrato da Dona Lúcia, os três empréstimos somam R$ 700 num benefício de R$ 2.000. O que isso quer dizer?"
          opcoes={[
            'A gaveta dos empréstimos (35%) está cheia: um empréstimo novo não cabe',
            'Ela ainda pode pegar mais R$ 200 de empréstimo, até chegar ao limite de 45%',
            'Ela está com parcelas atrasadas e deve ao INSS e aos bancos',
          ]}
          certa={0}
          explica="35% de R$ 2.000 = R$ 700. A gaveta dos empréstimos está cheia. Os outros 10% são só dos cartões e não viram empréstimo."
        />
      </Secao>

      {/* ------------------------------------------------------------------ caminhos */}
      <Secao titulo="6. Os caminhos para quem está sem margem">
        <p>
          Sem margem não é fim de conversa. Existem caminhos que a gente apresenta, sempre como <b>possibilidade</b>, porque
          cada caso é analisado. Use esta árvore para não se perder:
        </p>
        <ArvoreSemMargem />
        <p>
          Repare no fim da árvore: o <b>processo de juros abusivos</b> vale tanto para quem tem margem quanto para quem não
          tem. Para o processo, além de o cliente (ou um familiar) receber benefício do INSS, o que importa é haver desconto de
          uma das cinco financeiras com que trabalhamos (Agibank, BMG, Facta, Mercantil ou Crefisa). Se o cliente não sabe
          dizer, pergunte de novo uma vez (“aparece algum desconto de Agibank, BMG, Facta, Mercantil ou Crefisa no
          benefício?”); se ele continuar sem saber, siga em frente, porque o extrato vai mostrar. E se o cliente não se
          encaixa, a regra é agradecer com carinho e encerrar, sem insistir. As três portas da elegibilidade, inclusive a
          rota do familiar, estão na lição 4.
        </p>
      </Secao>

      <Secao titulo="7. Portabilidade: levar o contrato para outro banco">
        <p>
          Portabilidade é <b>mudar o empréstimo de banco</b>. Funciona como uma mudança de casa: o banco novo paga ao banco
          antigo o que ainda falta do contrato (o <b>saldo devedor</b>), e o cliente passa a pagar o banco novo, nas
          condições dele. O cliente não precisa tirar dinheiro do bolso para essa troca.
        </p>
        <PortabilidadeAntesDepois />
        <p>
          Por que isso interessa a quem está sem margem? Porque o contrato novo <b>entra no lugar do antigo</b>, dentro do
          espaço da gaveta que já estava ocupado. E, em alguns casos, nessa troca <b>sobra um valor que é liberado para o
          cliente</b>: é o que se costuma chamar de “troco” da portabilidade. Esse valor pode passar de <b>R$ 1.500</b>, mas
          isso não é regra: se existe troco, e de quanto, depende da análise de cada contrato.
        </p>
        <p>
          <b>De onde vem esse troco?</b> Em linhas gerais, o banco novo não só quita o contrato antigo: ele faz
          um <b>contrato novo</b>, com prazo e condições próprias, que precisa caber no mesmo espaço da margem. Quando esse
          contrato novo é maior do que o saldo devedor que foi quitado, a diferença pode ser liberada ao cliente. Isso costuma
          acontecer quando o banco novo cobra juros menores ou dá um prazo maior: com uma parcela parecida, cabe um contrato
          de valor maior. Por isso o troco depende de cada caso: do quanto ainda falta pagar, do prazo e das condições que o
          banco novo aceita.
        </p>
        <Aviso titulo="O cliente precisa entender o contrato novo">
          Portabilidade com troco é um contrato novo. Explique isso com clareza: o cliente continua com uma parcela descontada
          do benefício, agora no banco novo, e as condições (prazo e parcela) são apresentadas na análise. Se o prazo ficar
          maior, ele vai pagar por mais tempo, e isso também precisa ficar claro. Ninguém deve aceitar sem entender.
        </Aviso>
        <Aviso tom="rubro" titulo="Troco é possibilidade, nunca promessa">
          Nunca diga “vai sair R$ 1.500” nem “eu consigo tanto para você”. Diga “existe a possibilidade”, “em alguns casos
          libera um valor”, “vamos analisar o seu caso”. Como a portabilidade é encaminhada no dia a dia da empresa, combine
          com o seu gestor.
        </Aviso>
      </Secao>

      <Secao titulo="8. Aumento de margem">
        <p>
          O outro gancho é a <b>possibilidade de aumento de margem</b>: ver se o cliente pode voltar a ter espaço livre na
          gaveta dos empréstimos. Se isso é possível, e de que forma, depende da situação de cada cliente e é <b>avaliado
          caso a caso</b>. Não é algo que você confirma no WhatsApp.
        </p>
        <p>
          Para você entender a ideia, lembre que a margem é uma <b>porcentagem do benefício</b> menos as parcelas que já
          ocupam a gaveta. Então, em linhas gerais, o espaço livre só cresce quando um dos dois lados muda:
        </p>
        <Lista itens={[
          <><b>Uma parcela sai da gaveta:</b> quando um contrato termina ou é quitado, o espaço que a parcela ocupava volta a ficar livre.</>,
          <><b>O benefício aumenta:</b> 35% de um valor maior é um valor maior. Se o benefício sobe, a gaveta cresce um pouco junto.</>,
          <><b>A parcela diminui:</b> se um contrato é renegociado ou levado para outro banco com parcela menor, sobra espaço.</>,
        ]} />
        <p>
          Qual desses caminhos existe para um cliente específico, e como a empresa trabalha o aumento de margem no dia a dia,
          é algo para combinar com o seu gestor. O seu papel na conversa é apresentar como <b>possibilidade</b> e deixar a
          análise responder.
        </p>
        <BomRuim
          ruim={{
            corpo: (
              <Lista tom="nao" itens={[
                '“Vou aumentar a sua margem.”',
                '“Com certeza a senhora volta a ter margem.”',
                'Inventar uma explicação técnica para parecer seguro.',
              ]} />
            ),
          }}
          bom={{
            corpo: (
              <Lista tom="sim" itens={[
                '“Vamos verificar se existe a possibilidade de aumentar a sua margem.”',
                '“Isso é analisado caso a caso. Assim que eu tiver a resposta, te aviso.”',
                'Se a dúvida for sua, perguntar ao seu gestor antes de responder.',
              ]} />
            ),
          }}
        />
        <p>
          Se o cliente pedir detalhes, diga que a equipe vai analisar o caso dele. Uma resposta honesta (“vou confirmar e te
          retorno”) vale mais do que uma explicação inventada.
        </p>
      </Secao>

      {/* ------------------------------------------------------------------ juros abusivos */}
      <Secao titulo="9. Juros abusivos, em palavras simples">
        <p>
          Juros são o <b>preço do dinheiro emprestado</b>. Quem pega R$ 1.000 emprestado devolve mais do que R$ 1.000, e
          isso é normal e justo: o banco cobra pelo serviço e pelo tempo em que o dinheiro fica com o cliente.
        </p>
        <p>
          <b>Juros abusivos</b> são juros cobrados <b>muito acima do que é considerado razoável</b> para aquele tipo de
          empréstimo. Pense numa padaria: se todas do bairro vendem o pão por um preço parecido e uma cobra várias vezes mais
          de quem não tinha como comparar, tem algo errado. Com empréstimo é igual.
        </p>
        <JurosRazoavelAbusivo />
        <p>
          Como se sabe o que é “razoável”? Uma referência comum é a <b>taxa média</b> que os bancos cobram em cada tipo de
          crédito, que o Banco Central divulga. Para o consignado do INSS existe, ainda, um <b>teto de juros</b> definido pelo
          governo e revisto de tempos em tempos. Você não precisa decorar número nenhum: esses valores mudam com o tempo, e quem faz a comparação é a
          análise do caso.
        </p>
        <p>
          Lembre do que você viu no começo: no consignado, o banco corre pouco risco, porque recebe direto do INSS. Por isso,
          em geral, os juros do consignado são <b>menores</b> que os de outros empréstimos, e um contrato muito acima do
          razoável chama ainda mais atenção.
        </p>
        <p>
          Para o cliente, o abuso aparece como <b>desconto que pesa</b>: todo mês sai do benefício mais do que deveria, e
          sobra menos para comida, remédio e contas. Lembra da Dona Lúcia? Quase metade do benefício dela sai em descontos
          antes de chegar na conta. Se parte desses descontos vier de juros abusivos, é dinheiro que fez falta todo mês, e é
          isso que a análise vai verificar.
        </p>
        <Aviso titulo="Quem diz se houve abuso é a análise">
          Você nunca afirma “a senhora tem juros abusivos”. Você diz “vamos analisar se houve abuso”. Quem avalia é o
          advogado, com os documentos.
        </Aviso>
        <TesteRapido
          pergunta="Qual destas frases explica juros abusivos do jeito certo para o cliente?"
          opcoes={[
            '“O banco roubou o senhor. Com certeza o senhor vai receber de volta.”',
            '“Abusivo é cobrar muito acima do razoável. A análise mostra se foi o seu caso.”',
            '“Todo juro de consignado é abusivo, então dá para pedir tudo de volta na Justiça.”',
          ]}
          certa={1}
          explica="Juros em si são normais. Abuso é cobrar muito acima do razoável, e quem confirma é a análise. Nunca prometa resultado nem valor."
        />
        <p><b>Perguntas que o cliente costuma fazer:</b></p>
        <Sanfona itens={[
          {
            titulo: '“Se eu assinei, o contrato não está certo?”',
            corpo: <p>Assinar não quer dizer que tudo no contrato é justo. Quem avalia se houve cobrança abusiva é o advogado, olhando os documentos. Você não precisa discutir o contrato com o cliente: explique que a análise é que vai mostrar.</p>,
          },
          {
            titulo: '“Os juros do consignado não são baixos?”',
            corpo: <p>Em geral, sim: o consignado costuma ter juros menores que outros empréstimos, porque o banco recebe direto do INSS e corre pouco risco. Justamente por isso, um contrato muito acima do razoável chama atenção.</p>,
          },
          {
            titulo: '“Meu empréstimo já acabou. Ainda conta?”',
            corpo: <p>O processo pede o ressarcimento do que foi descontado nos últimos 10 anos, e é por isso que pedimos 10 anos de extrato de pagamento. Os descontos de contratos que já terminaram também aparecem nesses extratos, mês a mês. Se aquele contrato entra no caso do cliente é a análise que diz: não confirme sozinho, e na dúvida pergunte ao seu gestor antes de responder.</p>,
          },
          {
            titulo: '“Como vocês sabem se os meus juros são abusivos?”',
            corpo: <p>Ainda não sabemos, e você não deve adivinhar. É a análise dos documentos que compara as condições de cada contrato com o que é considerado razoável. É por isso que pedimos os extratos: sem eles, ninguém consegue dizer se houve abuso.</p>,
          },
        ]} />
        <p>
          Perguntas sobre valor, prazo e custo (“quanto eu vou receber?”, “quanto tempo demora?”, “vou pagar alguma coisa?”)
          são do processo, e as respostas certas estão na lição 2.
        </p>
      </Secao>

      <Secao titulo="10. Por que isso dá direito a pedir de volta">
        <p>
          Em linhas gerais: quem pega um empréstimo é um consumidor, e os bancos também precisam seguir as regras de defesa do
          consumidor. Quando um contrato cobra de forma abusiva, a pessoa pode pedir à Justiça que o contrato seja revisto e
          que o que foi cobrado indevidamente seja devolvido. Não é favor do banco nem “jeitinho”: é um direito.
        </p>
        <p>
          É exatamente isso que a nossa empresa faz, e é o nosso carro-chefe. O nosso advogado, o <b>Dr. Rafael Menezes</b>,
          entra com uma ação pedindo o <b>ressarcimento do que foi descontado nos últimos 10 anos</b>. Como o processo funciona
          por dentro (as etapas, o prazo médio e os 30% de honorários no final) é o assunto da lição 2.
        </p>
        <p>
          Agora você entende <b>por que pedimos 10 anos de extrato de pagamento</b>: cada desconto que aparece ali, mês a mês,
          é a base do pedido. Sem os extratos, não há como mostrar o que foi descontado.
        </p>
        <Frase>Cada desconto no extrato é um pedaço da história do cliente, e a base do processo.</Frase>
        <Aviso tom="rubro" titulo="Nunca prometa valor nem resultado">
          Nem do processo, nem da portabilidade, nem do aumento de margem. Fale em análise, em possibilidade e em prazo médio.
          Promessa que não se cumpre destrói a confiança do cliente e o nome da empresa.
        </Aviso>
      </Secao>

      {/* ------------------------------------------------------------------ fechamento */}
      <Secao titulo="11. Juntando tudo: o mapa do consignado">
        <p>
          Este mapa junta tudo o que você viu. Comece pelo centro e desça por cada coluna: <b>como funciona</b> (o desconto e
          o extrato), <b>o limite</b> (a margem, as gavetas e os caminhos para quem está sem margem) e <b>o problema</b> (os
          juros abusivos e o processo). Se conseguir explicar o mapa em voz alta, você entendeu a lição.
        </p>
        <MapaConsignado />
      </Secao>

      <Secao titulo="Resumo da lição">
        <Lista itens={[
          <>No <b>consignado</b>, a parcela é descontada direto do benefício, antes de o dinheiro cair na conta.</>,
          <>A <b>margem consignável</b> é de até 45% do benefício: 35% para empréstimos, 5% para o cartão RMC e 5% para o cartão RCC. Cada gaveta só aceita o seu tipo de desconto.</>,
          <><b>Sem margem</b> quer dizer que a gaveta dos 35% está cheia. Só afirme isso depois de conferir o extrato de consignado. A maioria dos clientes do canal de empréstimo está nessa situação.</>,
          <><b>Portabilidade</b> leva o contrato para outro banco e, em alguns casos, libera um valor (pode passar de R$ 1.500). <b>Aumento de margem</b> é avaliado caso a caso. Os dois são possibilidade, nunca promessa.</>,
          <><b>Juros abusivos</b> são juros muito acima do razoável. Se houver abuso, o Dr. Rafael Menezes entra com uma ação pedindo o ressarcimento do que foi descontado nos últimos 10 anos. Quem diz se houve abuso é a análise.</>,
          <>No <b>extrato de pagamento</b> você lê o valor bruto, cada desconto com o nome do banco e o líquido. Cada desconto é a base do processo.</>,
        ]} />
      </Secao>
    </>
  ),
  questoes: [
    {
      p: 'O que é um empréstimo consignado?',
      o: [
        'Um empréstimo que o cliente paga por boleto depois que o benefício cai',
        'Um empréstimo cuja parcela o INSS desconta direto do benefício, todo mês',
        'Um adiantamento do benefício que o INSS desconta no ano seguinte',
      ],
      c: 1,
      e: 'No consignado, o INSS desconta a parcela do benefício e manda direto para o banco. Só o que sobra cai na conta. Não é boleto nem adiantamento.',
    },
    {
      p: 'Como se divide a margem consignável do benefício do INSS?',
      o: [
        '45% só para empréstimos; os cartões usam o que sobrar',
        '35% para empréstimos e 10% livres para qualquer tipo de desconto',
        '35% para empréstimos, 5% para o cartão RMC e 5% para o RCC',
      ],
      c: 2,
      e: 'São até 45% no total: 35% para empréstimos, 5% para o cartão RMC e 5% para o cartão RCC. Cada gaveta só aceita o seu tipo de desconto.',
    },
    {
      p: 'O que quer dizer “o cliente está sem margem”?',
      o: [
        'Que as parcelas que já paga enchem os 35% dos empréstimos',
        'Que ele tem parcelas atrasadas e o banco bloqueou o benefício',
        'Que ele não pode ser atendido pela CAF e a conversa termina',
      ],
      c: 0,
      e: 'Sem margem = gaveta dos 35% cheia: um empréstimo novo não cabe. Não tem a ver com atraso, e a conversa continua: há caminhos para analisar e o processo.',
    },
    {
      p: 'Como falar da portabilidade com o cliente?',
      o: [
        'Garantindo o troco de R$ 1.500 para ele se animar a seguir',
        'Não falar dela: quem está sem margem não consegue fazer portabilidade',
        'Como possibilidade: pode liberar um valor, se a análise confirmar',
      ],
      c: 2,
      e: 'Portabilidade é levar o contrato para outro banco e é um dos caminhos para quem está sem margem. O troco é possibilidade, nunca garantia: depende da análise.',
    },
    {
      p: 'O que são juros abusivos?',
      o: [
        'Qualquer juro cobrado num empréstimo consignado do INSS',
        'Juros muito acima do razoável para aquele tipo de empréstimo',
        'Juros que o banco continua cobrando depois que o contrato terminou',
      ],
      c: 1,
      e: 'Juros em si são normais. Abusivo é a cobrança muito acima do razoável para aquele tipo de empréstimo. Quem diz se houve abuso é a análise.',
    },
  ],
  glossario: [
    { termo: 'Empréstimo consignado', def: 'Empréstimo cuja parcela é descontada direto do benefício do INSS, antes de o dinheiro cair na conta do cliente.' },
    { termo: 'Margem consignável', def: 'A parte do benefício que pode ir para descontos de consignado: até 45% (35% para empréstimos, 5% para o cartão RMC e 5% para o cartão RCC).' },
    { termo: 'Margem livre', def: 'O espaço que ainda sobra na margem. Quando é zero, o cliente está “sem margem” e um empréstimo novo não cabe.' },
    { termo: 'RMC', def: 'Reserva de Margem Consignável: os 5% do benefício reservados ao cartão de crédito consignado. Todo mês, parte da fatura é descontada do benefício.' },
    { termo: 'RCC', def: 'Reserva de Cartão Consignado: os 5% do benefício reservados ao cartão consignado de benefício, outro cartão com desconto mensal direto no benefício.' },
    { termo: 'Portabilidade', def: 'Levar um contrato de empréstimo para outro banco: o banco novo quita o saldo devedor no antigo e o cliente passa a pagar o novo.' },
    { termo: 'Troco da portabilidade', def: 'Valor que, em alguns casos, é liberado ao cliente quando o contrato vai para outro banco. É possibilidade, nunca garantia.' },
    { termo: 'Saldo devedor', def: 'Quanto ainda falta pagar de um contrato de empréstimo.' },
    { termo: 'Juros abusivos', def: 'Juros cobrados muito acima do que é considerado razoável para aquele tipo de empréstimo. É o que o nosso processo questiona.' },
    { termo: 'Valor bruto e valor líquido', def: 'Bruto é o valor do benefício antes dos descontos; líquido é o que sobra e cai na conta do cliente.' },
  ],
  mensagens: [
    {
      titulo: 'O que é margem (explicação simples)',
      quando: 'Quando o cliente pergunta por que o empréstimo não sai, e só depois de conferir no extrato de consignado que a margem para empréstimo está toda ocupada. Troque “você” por “o senhor/a senhora” se for o tom da conversa.',
      texto: [
        'Vou te explicar de um jeito simples.',
        '',
        'Do seu benefício, a lei só deixa usar uma parte para pagar empréstimos consignados. Essa parte se chama *margem*.',
        '',
        'Hoje, as parcelas que você já paga ocupam toda essa parte. Por isso o banco não consegue liberar um empréstimo novo agora.',
        '',
        'Mas isso não quer dizer que não exista caminho. Posso te mostrar as possibilidades?',
      ].join('\n'),
    },
    {
      titulo: 'Explicar a portabilidade',
      quando: 'Quando o cliente pergunta o que é portabilidade.',
      texto: [
        'Portabilidade é levar o seu empréstimo de um banco para outro.',
        '',
        'Funciona assim: o banco novo paga o que ainda falta no banco antigo, e você passa a pagar o banco novo, nas condições dele. Você não precisa tirar dinheiro do bolso para essa troca.',
        '',
        'Em alguns casos, nessa troca, sobra um valor que é liberado para você. Se isso é possível no seu caso, e quanto seria, só a análise mostra. Quer que a gente verifique?',
      ].join('\n'),
    },
    {
      titulo: 'Juros abusivos em palavras simples',
      quando: 'Quando o cliente pergunta o que são juros abusivos. Para explicar como o processo funciona, os 30% e o prazo, use as mensagens da lição 2.',
      texto: [
        'Todo empréstimo tem juros, e isso é normal: é o preço de pegar o dinheiro emprestado.',
        '',
        'O problema é quando o banco cobra muito acima do que seria razoável. Aí o desconto pesa no seu benefício todo mês, e você acaba pagando mais do que deveria. Se isso aconteceu com você, a análise vai mostrar.',
        '',
        'Se houver juros abusivos, dá para pedir de volta o que foi descontado nos últimos 10 anos. Quem entra com a ação é o nosso advogado, o Dr. Rafael Menezes. O resultado depende da análise.',
        '',
        'A análise é gratuita, e você não paga nada para começar. Quer que a gente analise o seu caso?',
      ].join('\n'),
    },
  ],
};
export default licao;
