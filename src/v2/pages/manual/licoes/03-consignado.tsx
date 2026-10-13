/* Lição 3 — Consignado × empréstimo pessoal. A aula da DIFERENÇA entre os dois
   empréstimos do aposentado. Correção do dono (13/10/2026): a revisão de juros
   abusivos da CAF é do EMPRÉSTIMO PESSOAL com as 5 financeiras, não do
   consignado. O consignado (margem 35% + 5% RMC + 5% RCC, extratos, sem margem,
   aumento de margem e portabilidade) é o assunto dos ganchos do canal de
   empréstimo. Fatos da empresa: só os do dono. Sem números de juros.
   Pessoas, valores e bancos genéricos (Banco A, Banco B) são EXEMPLO.
   Ilustrações: 03-consignado-visuais.tsx (consignado), 03-consignado-diferenca.tsx
   (a diferença) e 03-consignado-treino.tsx (atividade "Consignado ou pessoal?"). */
import type { Licao } from '../tipos';
import {
  Aviso, BomRuim, Celular, Conversa, Fatos, Frase, LinhaTempo, Lista, Passos, Sanfona, Secao, Tabela, TesteRapido,
} from '../pecas';
import {
  ArvoreSemMargem, BarraMargem, ExtratoInterativo, JurosRazoavelAbusivo, PortabilidadeAntesDepois, PrintMargem,
  SimuladorMargem,
} from './03-consignado-visuais';
import {
  CaminhoDoDinheiro, DoisCanais, ForaDaMargem, MapaDiferenca, OndeAparece, TetoJuros,
} from './03-consignado-diferenca';
import { ConsignadoOuPessoal } from './03-consignado-treino';

/** As 5 financeiras do processo; top 3 = as que mais chegam (fala do dono). */
const FINANCEIRAS: { nome: string; top: boolean }[] = [
  { nome: 'Agibank', top: true },
  { nome: 'BMG', top: true },
  { nome: 'Facta', top: false },
  { nome: 'Mercantil', top: true },
  { nome: 'Crefisa', top: false },
];

const licao: Licao = {
  id: 'consignado',
  modulo: 'fundamentos',
  titulo: 'Consignado × empréstimo pessoal',
  resumo: 'A diferença entre os dois empréstimos do aposentado: o consignado, que o INSS desconta e que depende da margem, e o empréstimo pessoal, cobrado pela financeira, com juros livres. É no pessoal que estão os juros abusivos que a CAF revisa.',
  minutos: 40,
  corpo: (
    <>
      <p className="mv-lead">
        Quem recebe do INSS pode ter dois tipos de empréstimo bem diferentes: o <b>empréstimo consignado</b> e
        o <b>empréstimo pessoal</b>. Para o cliente, pode ser tudo “empréstimo”. Para você, não pode: <b>o processo da CAF
        revisa os juros do empréstimo pessoal</b>, e o consignado entra na conversa por outro motivo, a margem e os ganchos
        do canal de empréstimo. Esta lição explica os dois a fundo, mostra a diferença lado a lado e treina você para
        descobrir, com perguntas simples, qual é qual. Leia com calma, mexa nos simuladores e faça o treino no fim.
      </p>

      <div className="vidro mv-cartao" data-tom="azul">
        <h4>O que você vai aprender</h4>
        <Lista itens={[
          'A diferença entre consignado e empréstimo pessoal: quem cobra, como se paga, margem, juros e onde aparece.',
          'O que é margem consignável (35% + 5% RMC + 5% RCC) e o que quer dizer “não ter margem”.',
          'Como ler o extrato de pagamento e o extrato de consignado do INSS.',
          'Por que quem está sem margem muitas vezes acaba no empréstimo pessoal, que é mais caro.',
          'O que são juros abusivos e por que o nosso processo olha o empréstimo pessoal.',
          'Como descobrir com o cliente se o empréstimo dele é pessoal ou consignado.',
        ]} />
      </div>

      {/* ------------------------------------------------------------------ os dois empréstimos */}
      <Secao titulo="1. Os dois empréstimos do aposentado">
        <p>
          Empréstimo é simples: o banco ou a financeira empresta um dinheiro e a pessoa devolve aos poucos, em parcelas, com
          juros. Os dois tipos que você vai encontrar funcionam assim. O que muda é <b>quem cobra a parcela</b> e <b>em que
          momento</b>.
        </p>
        <p>
          No <b>empréstimo consignado</b>, a parcela é descontada <b>direto do benefício pelo INSS</b>, antes de o dinheiro
          cair na conta. O INSS separa o valor da parcela e manda para o banco; só o que sobra chega ao cliente. A palavra
          “consignado” vem daí: a parcela fica <i>consignada</i>, vinculada ao benefício.
        </p>
        <p>
          No <b>empréstimo pessoal</b>, a parcela <b>não passa pelo INSS</b>. É um contrato direto entre o cliente e a
          financeira. O benefício cai inteiro na conta e, depois, a financeira cobra a parcela: em geral, por débito automático
          na conta em que o benefício cai, ou por boleto ou carnê.
        </p>
        <CaminhoDoDinheiro />
        <Frase>O consignado é descontado pelo INSS; o empréstimo pessoal é cobrado pela financeira, fora do INSS.</Frase>
        <p><b>Por que essa diferença importa tanto para o seu trabalho?</b></p>
        <Lista itens={[
          <>O <b>processo da CAF</b> revisa os juros dos <b>empréstimos pessoais</b> feitos com as financeiras Agibank, BMG,
            Facta, Mercantil e Crefisa. Por isso a porta 3 da elegibilidade pergunta se o cliente tem <b>empréstimo
            pessoal</b> numa delas (lição 4).</>,
          <>O <b>consignado</b> é o assunto dos <b>ganchos do canal de empréstimo</b>: o cliente quer um consignado novo, mas
            está sem margem, e os caminhos são o aumento de margem e a portabilidade dos consignados.</>,
          <>O cliente nem sempre conhece esses nomes: para ele, pode ser tudo “empréstimo”. E a mesma pessoa pode ter os dois
            tipos ao mesmo tempo. Você vai aprender a separar um do outro com perguntas simples (seção 9).</>,
        ]} />
        <p>
          Vamos acompanhar um caso de exemplo do começo ao fim da lição: a <b>Dona Lúcia</b>, aposentada, com um benefício
          de R$ 2.000 (pessoa e valores fictícios). Ela tem os dois tipos de empréstimo.
        </p>
      </Secao>

      {/* ------------------------------------------------------------------ tabela */}
      <Secao titulo="2. A diferença lado a lado">
        <p>Esta tabela é o coração da lição. Leia linha por linha e volte a ela sempre que ficar em dúvida.</p>
        <Tabela
          colunas={['', 'Empréstimo consignado', 'Empréstimo pessoal']}
          destaque={0}
          linhas={[
            ['Quem cobra', 'O INSS, direto do benefício', 'A financeira, fora do INSS'],
            ['Quando sai', 'Antes de o dinheiro cair na conta', 'Depois: o benefício cai inteiro e a financeira cobra'],
            ['Como se paga', 'Desconto automático no benefício, todo mês', 'Em geral, débito automático na conta em que o benefício cai, ou boleto/carnê'],
            ['Usa margem?', 'Sim: precisa caber na margem, de até 45% do benefício (35% empréstimo + 5% RMC + 5% RCC)', 'Não: fica fora da margem do INSS'],
            ['Sem margem?', 'Não sai consignado novo', 'Ainda sai: por isso quem está sem margem muitas vezes recorre a ele'],
            ['Juros', 'Têm um teto definido para o consignado do INSS. Em geral, os mais baratos para o aposentado', 'Livres, sem o teto do consignado. Em geral, bem mais altos'],
            ['Onde aparece', 'No Extrato de Empréstimo Consignado e como desconto no extrato de pagamento do benefício', 'Não aparece como desconto do INSS: aparece na conta e no contrato da financeira. O cliente costuma lembrar pelo nome do banco e pelo débito na conta'],
            ['Na CAF', 'Ganchos do canal de empréstimo: aumento de margem e portabilidade dos consignados', 'É o objeto do processo: a revisão dos juros e o ressarcimento'],
          ]}
        />
        <p>
          Repare na última linha: os dois empréstimos aparecem no nosso trabalho, mas com papéis diferentes. O <b>consignado</b> é
          o assunto da margem e dos ganchos; o <b>empréstimo pessoal</b> é o que o processo revisa. Veja agora onde cada um
          aparece:
        </p>
        <OndeAparece />
        <p>
          Por isso, quando o cliente diz “o INSS já desconta do meu benefício”, ele está falando de consignado. Quando diz “sai
          da minha conta todo mês” ou “pago um boleto”, é sinal de empréstimo pessoal.
        </p>
        <TesteRapido
          pergunta="A Dona Lúcia conta: “Esse empréstimo o INSS já desconta do meu benefício, antes de cair na conta”. De qual empréstimo ela está falando?"
          opcoes={[
            'Do empréstimo pessoal, cobrado pela financeira',
            'Do empréstimo consignado, descontado pelo INSS',
            'Dos dois: todo empréstimo é descontado assim',
          ]}
          certa={1}
          explica="Desconto feito pelo INSS, antes de o dinheiro cair na conta, é consignado. O empréstimo pessoal não passa pelo INSS: a financeira cobra depois, na conta ou por boleto/carnê."
        />
      </Secao>

      {/* ------------------------------------------------------------------ consignado: margem */}
      <Secao titulo="3. O consignado a fundo: a margem consignável">
        <p>
          Agora, um empréstimo de cada vez, começando pelo consignado. Como a parcela sai direto do benefício, a lei põe um
          limite para o aposentado não ficar sem dinheiro para viver: só uma parte do benefício pode ir para descontos de
          consignado. Essa parte se chama <b>margem consignável</b>.
        </p>
        <p>
          Para quem recebe do INSS, a margem é de <b>até 45% do benefício</b>, dividida em três partes. O jeito mais fácil de
          entender é pensar em <b>gavetas</b>: cada gaveta tem um tamanho fixo e só aceita um tipo de desconto.
        </p>
        <Fatos itens={[
          { grande: '45%', texto: 'é o máximo do benefício que pode ir para descontos de consignado: a margem consignável.' },
          { grande: '35%', texto: 'é a gaveta dos empréstimos consignados. É a única que serve para empréstimo.' },
          { grande: '5% RMC', texto: 'é a gaveta do cartão de crédito consignado.' },
          { grande: '5% RCC', texto: 'é a gaveta do cartão consignado de benefício.' },
        ]} />
        <BarraMargem />
        <p>Repare em quatro coisas no desenho:</p>
        <Lista itens={[
          <>Os <b>55% restantes são protegidos</b>. Nenhum consignado pode avançar sobre eles: é o dinheiro do mês para viver.</>,
          <>A gaveta grande, dos <b>35%</b>, é a única que serve para <b>empréstimo consignado</b>. Quando alguém fala em “margem”
            no dia a dia, quase sempre é dela.</>,
          <>As duas gavetas pequenas, de <b>5% cada</b>, são só dos <b>cartões consignados</b> (RMC e RCC). Espaço sobrando numa
            gaveta de cartão não pode ser usado para empréstimo.</>,
          <>O <b>empréstimo pessoal não está em nenhuma gaveta</b>: ele não usa a margem. Você vai ver o que isso causa na seção 6.</>,
        ]} />
        <p><b>Fazendo a conta de cabeça.</b> Um truque simples para achar os 35% de qualquer benefício:</p>
        <Passos itens={[
          { titulo: 'Ache 10% do benefício', texto: 'É o mesmo que dividir por 10. Num benefício de R$ 2.000, 10% = R$ 200.' },
          { titulo: 'Multiplique por 3', texto: 'Isso dá 30%: R$ 200 × 3 = R$ 600.' },
          { titulo: 'Some a metade dos 10%', texto: 'A metade de R$ 200 é R$ 100 (são os 5%). R$ 600 + R$ 100 = R$ 700. Pronto: esses são os 35%.' },
        ]} />
        <Aviso tom="ambar" titulo="Você não precisa calcular a margem real na mão">
          O valor exato da margem do cliente aparece pronto no <b>Extrato de Empréstimo Consignado</b>, no Meu INSS (você vai
          ver um exemplo na seção 4). A conta serve para você <b>entender</b> o número e conseguir explicar para o cliente, não
          para substituir o extrato.
        </Aviso>
        <p>
          <b>Agora é com você.</b> Mexa no simulador: mude o valor do benefício, aumente as parcelas de consignado que o cliente
          já paga e ligue ou desligue os cartões. Veja o que acontece com a margem livre. Use os exemplos prontos para ver uma
          cliente sem margem e um cliente com folga.
        </p>
        <SimuladorMargem />
        <TesteRapido
          pergunta="O benefício de um cliente é de R$ 3.000 (exemplo). Somando as parcelas de empréstimo consignado, qual é o máximo que pode ser descontado por mês?"
          opcoes={['R$ 1.350 (45%)', 'R$ 1.050 (35%)', 'R$ 150 (5%)']}
          certa={1}
          explica="A gaveta dos empréstimos consignados é de 35%: 10% de R$ 3.000 = R$ 300; × 3 = R$ 900; + R$ 150 = R$ 1.050. Os outros 10% (até chegar aos 45%) são só dos cartões RMC e RCC."
        />
      </Secao>

      {/* ------------------------------------------------------------------ consignado: cartões e extratos */}
      <Secao titulo="4. O consignado a fundo: cartões RMC e RCC e os extratos do INSS">
        <p>
          Além do empréstimo, existem dois <b>cartões consignados</b>. Eles também são descontados direto do benefício pelo
          INSS, cada um na sua gaveta de 5%. Os nomes RMC e RCC aparecem muito nos extratos, então vale aprender bem.
        </p>
        <div className="mv-duas">
          <div className="vidro mv-cartao mv-csg-cartao" data-tom="azul">
            <span className="mv-csg-sigla">RMC · Reserva de Margem Consignável</span>
            <h4>Cartão de crédito consignado</h4>
            <p>
              Um cartão de crédito ligado ao benefício. Com ele dá para fazer compras e também sacar dinheiro (o “saque” do
              cartão). Todo mês, o INSS desconta do benefício uma parte da fatura e manda para o banco.
            </p>
            <Lista itens={['Gaveta própria: 5% do benefício.', 'Aparece no extrato com o nome do banco.', 'O desconto mensal é só uma parte da fatura, por isso pode durar bastante tempo.']} />
          </div>
          <div className="vidro mv-cartao mv-csg-cartao" data-tom="azul">
            <span className="mv-csg-sigla">RCC · Reserva de Cartão Consignado</span>
            <h4>Cartão consignado de benefício</h4>
            <p>
              Outro cartão ligado ao benefício, com a sua própria gaveta de 5%. Funciona de forma parecida: o desconto também
              sai direto do benefício, todo mês, antes de o dinheiro cair na conta.
            </p>
            <Lista itens={['Gaveta própria: mais 5% do benefício.', 'Também aparece no extrato com o nome do banco.', 'Não é o mesmo que o RMC: são duas reservas diferentes.']} />
          </div>
        </div>
        <p>
          Os dois cartões são <b>consignados</b>: descontados pelo INSS, dentro da margem. Não confunda com o empréstimo
          pessoal. E pode acontecer de o cliente nem lembrar que tem um cartão consignado; por isso, leia o extrato linha por
          linha, sem pular nada.
        </p>
        <p>
          <b>Como ler o extrato de pagamento.</b> O <b>Extrato de Pagamento de Benefício</b> (no Meu INSS ele também aparece
          como <b>Histórico de Créditos</b>) é o “contracheque” do aposentado: mostra, mês a mês, quanto o benefício vale, cada
          desconto feito pelo INSS e quanto sobrou para cair na conta. Ele faz parte da documentação do processo. Na lição 10
          você aprende a baixar; aqui, você aprende a <b>ler</b>. Clique em cada linha do extrato da Dona Lúcia (ou use os
          botões Anterior e Próximo) e, no fim, aperte “Somar só os empréstimos”.
        </p>
        <ExtratoInterativo />
        <p><b>Como ler qualquer extrato de pagamento em quatro olhadas:</b></p>
        <Passos itens={[
          { titulo: 'Ache o mês (competência)', texto: 'Cada bloco do extrato é um mês. Confira se está olhando o mês certo.' },
          { titulo: 'Veja o valor bruto', texto: 'É o benefício antes dos descontos, a base para entender a margem.' },
          { titulo: 'Liste os descontos de consignado, banco por banco', texto: 'Separe empréstimos, cartão RMC e cartão RCC. Podem aparecer também descontos que não são de consignado (por exemplo, imposto de renda retido): eles não entram na conta da margem.' },
          { titulo: 'Compare com o líquido', texto: 'O líquido é o que caiu na conta. A diferença entre bruto e líquido é o peso dos descontos do INSS no mês do cliente.' },
        ]} />
        <Aviso tom="ambar" titulo="O empréstimo pessoal não aparece como desconto do INSS">
          Os descontos de empréstimo e de cartão que você vê no extrato de pagamento são <b>consignados</b>. O empréstimo
          pessoal é cobrado pela financeira, fora do INSS. Para saber se o cliente tem um, você pergunta a ele (seção 9).
        </Aviso>
        <p>
          <b>E onde eu vejo a margem?</b> O extrato de pagamento mostra os <b>descontos</b>. Já o <b>Extrato de Empréstimo
          Consignado</b> mostra os <b>contratos consignados</b> e quanto ainda sobra de margem em cada gaveta. É nele que você
          confirma se o cliente tem ou não margem livre, e ele também faz parte da documentação do processo. Veja o da Dona
          Lúcia, numa versão simplificada:
        </p>
        <PrintMargem />
      </Secao>

      {/* ------------------------------------------------------------------ consignado: sem margem e ganchos */}
      <Secao titulo="5. O consignado a fundo: “sem margem” e os ganchos">
        <p>
          Estar <b>sem margem</b> (você também vai ouvir “margem zerada” ou “margem comprometida”) quer dizer uma coisa só: a
          gaveta dos 35% está cheia. As parcelas de consignado que o cliente já paga ocupam todo o espaço, e um consignado
          novo não cabe.
        </p>
        <p>
          É a situação da <b>maioria dos clientes do canal de empréstimo</b>: eles querem dinheiro rápido, mas não têm margem
          disponível. Veja como isso aconteceu com a Dona Lúcia, e o que ela fez depois:
        </p>
        <LinhaTempo itens={[
          { quando: 'Ano 1', titulo: 'Consignado no Banco A', texto: 'Parcela de R$ 310. Da gaveta de R$ 700, sobram R$ 390.' },
          { quando: 'Ano 3', titulo: 'Consignado no Banco B', texto: 'Parcela de R$ 240. Sobram R$ 150 na gaveta.' },
          { quando: 'Ano 4', titulo: 'Cartões consignados: RMC (BMG) e RCC (Banco A)', texto: 'Cada um usa a sua gaveta de 5% (R$ 100). Não mexem nos 35%.' },
          { quando: 'Ano 6', titulo: 'Consignado no BMG', texto: 'Parcela de R$ 150. A gaveta chega a R$ 700: está cheia. Agora ela está sem margem.' },
          { quando: 'Ano 7', titulo: 'Empréstimo pessoal na Agibank', texto: 'Sem margem para consignado, ela procura uma financeira. O empréstimo pessoal sai, porque não usa a margem. Neste exemplo, a parcela é cobrada em débito na conta.' },
          { quando: 'Hoje', titulo: 'Vê o anúncio e quer mais dinheiro', texto: 'Chega pelo canal de empréstimo: sem margem, com três consignados e um empréstimo pessoal. É aqui que você entra.' },
        ]} />
        <p>
          Repare: a Dona Lúcia tem os <b>dois tipos</b>. Os consignados (Banco A, Banco B e BMG) explicam por que ela está sem
          margem. O empréstimo pessoal da Agibank é o tipo de empréstimo que o nosso processo revisa.
        </p>
        <Frase>Margem é espaço. Quando a gaveta enche, consignado novo não cabe, mas ainda existem caminhos para analisar.</Frase>
        <p>
          Sem margem não é fim de conversa. No canal de empréstimo, depois de conferir os extratos, você apresenta os
          <b> ganchos do consignado</b> e pergunta pelo <b>empréstimo pessoal</b>. Use a árvore para não se perder:
        </p>
        <ArvoreSemMargem />
        <p>
          <b>Gancho 1: aumento de margem.</b> É ver se o cliente pode voltar a ter espaço livre na gaveta dos 35%. Em linhas
          gerais, o espaço só cresce quando uma parcela sai da gaveta (um contrato termina ou é quitado), quando o benefício
          aumenta (35% de um valor maior é um valor maior) ou quando uma parcela diminui. Se isso é possível para um cliente, e
          de que forma, é avaliado caso a caso; como a empresa trabalha o aumento de margem no dia a dia, combine com o seu
          gestor.
        </p>
        <p>
          <b>Gancho 2: portabilidade dos consignados.</b> Portabilidade é <b>mudar o consignado de banco</b>, como uma mudança
          de casa: o banco novo paga ao antigo o que ainda falta do contrato (o <b>saldo devedor</b>), e o cliente passa a pagar
          o banco novo, nas condições dele, sem tirar dinheiro do bolso. O contrato novo entra no mesmo espaço da margem e, em
          alguns casos, sobra um valor que é liberado ao cliente, o “troco” da portabilidade. Esse valor pode passar
          de <b>R$ 1.500</b>, mas isso não é regra: depende da análise de cada contrato.
        </p>
        <PortabilidadeAntesDepois />
        <p>
          <b>De onde vem o troco?</b> Em linhas gerais, o banco novo faz um contrato novo, com prazo e condições próprias, que
          precisa caber no mesmo espaço da margem. Quando esse contrato é maior do que o saldo devedor quitado, a diferença pode
          ser liberada. Se o prazo ficar maior, o cliente vai pagar por mais tempo, e isso também precisa ficar claro: ninguém
          deve aceitar sem entender.
        </p>
        <Aviso tom="rubro" titulo="Gancho é possibilidade, nunca promessa">
          Nunca diga “vai sair R$ 1.500”, “vou aumentar a sua margem” ou “com certeza a senhora volta a ter margem”. Diga
          “existe a possibilidade”, “em alguns casos libera um valor”, “vamos analisar o seu caso”. Como a portabilidade e o
          aumento de margem são encaminhados no dia a dia da empresa, combine com o seu gestor.
        </Aviso>
      </Secao>

      {/* ------------------------------------------------------------------ empréstimo pessoal */}
      <Secao titulo="6. O empréstimo pessoal a fundo">
        <p>
          Agora o outro lado. O <b>empréstimo pessoal</b> é um contrato <b>direto com a financeira</b>. O INSS não participa:
          a parcela não passa por ele. A financeira libera o dinheiro e, depois, cobra as parcelas do cliente, em geral
          por <b>débito automático na conta em que o benefício cai</b> ou por <b>boleto ou carnê</b>.
        </p>
        <p>Daí vêm as duas diferenças que mais importam:</p>
        <Lista itens={[
          <><b>Não usa a margem.</b> Como a parcela não é descontada pelo INSS, o empréstimo pessoal não ocupa nenhuma gaveta.
            Por isso a financeira consegue emprestar até para quem já está sem margem.</>,
          <><b>Tem juros livres.</b> O empréstimo pessoal não tem o teto de juros do consignado. Os juros são livres e, em
            geral, bem mais altos.</>,
        ]} />
        <ForaDaMargem />
        <Frase>Quem está sem margem para consignado muitas vezes recorre ao empréstimo pessoal, que é mais caro.</Frase>
        <p>
          <b>Por que o consignado é mais barato?</b> Existe um <b>teto de juros</b> definido para o consignado do INSS. No
          empréstimo pessoal não existe esse teto: os juros são livres. Você não precisa decorar número nenhum: os valores
          mudam com o tempo, e quem compara é a análise do caso.
        </p>
        <TetoJuros />
        <p>
          <b>As cinco financeiras.</b> O nosso processo trabalha com os empréstimos pessoais feitos com cinco financeiras. As
          três que mais chegam até a gente são Agibank, Mercantil e BMG.
        </p>
        <div className="mv-bancos">
          {FINANCEIRAS.map((f) => (
            <div key={f.nome} className="vidro mv-banco" data-top={f.top ? '' : undefined}>
              <span>{f.top ? 'Top 3' : 'Financeira'}</span>
              <b>{f.nome}</b>
            </div>
          ))}
        </div>
        <Aviso tom="ambar" titulo="O nome do banco não diz o tipo">
          Não conclua que um empréstimo é pessoal só porque é de uma dessas financeiras. A mesma instituição pode ter mais de
          um produto: o BMG, por exemplo, também tem consignado e cartão consignado. O que define o tipo é <b>como a parcela é
          paga</b>: descontada pelo INSS (consignado) ou cobrada pela financeira, fora do INSS (pessoal).
        </Aviso>
        <Aviso titulo="Nenhum dos dois é vilão">
          Consignado e empréstimo pessoal são produtos legais e podem ajudar muita gente. O problema não é o cliente ter
          empréstimo: são juros muito acima do razoável. Nunca fale mal do empréstimo do cliente nem o faça se sentir culpado
          por ter feito.
        </Aviso>
      </Secao>

      {/* ------------------------------------------------------------------ juros abusivos */}
      <Secao titulo="7. Juros abusivos: o que são e por que estão no empréstimo pessoal">
        <p>
          Juros são o <b>preço do dinheiro emprestado</b>. Quem pega R$ 1.000 emprestado devolve mais do que R$ 1.000, e isso é
          normal e justo: a financeira cobra pelo serviço e pelo tempo em que o dinheiro fica com o cliente.
        </p>
        <p>
          <b>Juros abusivos</b> são juros cobrados <b>muito acima do que é considerado razoável</b> para aquele tipo de
          empréstimo. Pense numa padaria: se todas do bairro vendem o pão por um preço parecido e uma cobra várias vezes mais de
          quem não tinha como comparar, tem algo errado. Com empréstimo é igual. Quem compara os juros de cada contrato com
          o que é considerado razoável é a análise do caso.
        </p>
        <JurosRazoavelAbusivo />
        <p>
          <b>E por que no empréstimo pessoal?</b> Junte o que você já viu. O consignado tem um teto de juros definido para o
          INSS. O empréstimo pessoal tem juros livres, sem esse teto, em geral bem mais altos, e muitas vezes é contratado por
          quem está sem margem e precisa de dinheiro. <b>É no empréstimo pessoal que aparecem os juros abusivos que a CAF
          revisa.</b>
        </p>
        <p>
          Quando um contrato cobra de forma abusiva, a pessoa pode pedir à Justiça o ressarcimento do que foi
          descontado a mais. Não é favor nem “jeitinho”: é um direito. É exatamente isso que a nossa empresa faz, e é
          o nosso carro-chefe: o nosso advogado, o <b>Dr. Rafael Menezes</b>, entra com uma ação pedindo o <b>ressarcimento do
          que foi descontado nos últimos 10 anos</b> nesses empréstimos pessoais. O resultado depende da análise. Como o
          processo funciona por dentro (as etapas, o prazo e os 30% no final) é o assunto da lição 2.
        </p>
        <Aviso titulo="Quem diz se houve abuso é a análise">
          Você nunca afirma “a senhora tem juros abusivos”. Você diz “vamos analisar se houve abuso”. Quem avalia é o
          advogado, com os documentos.
        </Aviso>
        <TesteRapido
          pergunta="Qual destas frases explica do jeito certo o que a CAF faz?"
          opcoes={[
            '“Os juros do seu consignado são abusivos, e a gente pede tudo de volta.”',
            '“Vamos analisar os juros do seu empréstimo pessoal. O resultado depende da análise.”',
            '“Todo empréstimo de financeira é abusivo, então o senhor com certeza vai receber.”',
          ]}
          certa={1}
          explica="O processo revisa os juros do empréstimo pessoal, não do consignado. E quem diz se houve abuso é a análise: nunca prometa resultado nem valor."
        />
        <p><b>Perguntas que o cliente costuma fazer:</b></p>
        <Sanfona itens={[
          {
            titulo: '“É o meu consignado que vocês vão revisar?”',
            corpo: <p>Não. A revisão é dos juros do <b>empréstimo pessoal</b> com as financeiras (Agibank, BMG, Facta, Mercantil ou Crefisa). O consignado entra na conversa por outro motivo: a margem, o aumento de margem e a portabilidade.</p>,
          },
          {
            titulo: '“Mas o consignado também não tem juros?”',
            corpo: <p>Tem. Só que o consignado tem um teto de juros definido para o INSS e, em geral, é o mais barato para o aposentado. O empréstimo pessoal tem juros livres, sem esse teto, e é neles que a nossa análise olha.</p>,
          },
          {
            titulo: '“Se eu assinei, o contrato não está certo?”',
            corpo: <p>Assinar não quer dizer que tudo no contrato é justo. Quem avalia se houve cobrança abusiva é o advogado, olhando os documentos. Você não precisa discutir o contrato com o cliente: explique que a análise é que vai mostrar.</p>,
          },
          {
            titulo: '“Meu empréstimo já acabou. Ainda conta?”',
            corpo: <p>O processo pede o ressarcimento do que foi descontado nos últimos 10 anos nos empréstimos pessoais. Se aquele contrato entra no caso do cliente é a análise que diz: não confirme sozinho e, na dúvida, pergunte ao seu gestor antes de responder.</p>,
          },
          {
            titulo: '“Como vocês sabem se os meus juros são abusivos?”',
            corpo: <p>Ainda não sabemos, e você não deve adivinhar. É a análise dos documentos que compara as condições de cada contrato com o que é considerado razoável. Quem avalia é o advogado.</p>,
          },
        ]} />
        <p>
          Perguntas sobre valor, prazo e custo (“quanto eu vou receber?”, “quanto tempo demora?”, “vou pagar alguma coisa?”)
          são do processo, e as respostas certas estão na lição 2.
        </p>
      </Secao>

      {/* ------------------------------------------------------------------ na venda */}
      <Secao titulo="8. Como isso aparece na venda">
        <p>
          Agora junte tudo com o seu dia a dia. Os dois canais de anúncio (lição 5) trazem clientes com expectativas
          diferentes, e a diferença entre consignado e empréstimo pessoal é o que organiza a conversa em cada um.
        </p>
        <DoisCanais />
        <div className="mv-duas">
          <div className="vidro mv-cartao mv-csg-cartao" data-tom="verde">
            <span className="mv-csg-sigla" data-tom="verde">Canal de juros abusivos (Andrius)</span>
            <h4>O cliente já quer a revisão</h4>
            <p>
              Quem chega por aqui já quer revisar os juros do empréstimo pessoal. É a venda mais direta. O seu trabalho é
              confirmar que é mesmo <b>empréstimo pessoal</b> numa das 5 financeiras (lição 4) e seguir para o processo
              (lição 7).
            </p>
          </div>
          <div className="vidro mv-cartao mv-csg-cartao" data-tom="azul">
            <span className="mv-csg-sigla">Canal de empréstimo</span>
            <h4>O cliente quer um consignado novo</h4>
            <p>
              Quem chega por aqui quer dinheiro rápido, mas a maioria não tem margem. Com os extratos conferidos, você explica a
              margem, apresenta os ganchos do consignado (aumento de margem e portabilidade) e pergunta pelo <b>empréstimo
              pessoal</b> que ele já tem: a revisão dos juros desse empréstimo é o nosso processo. Aqui é preciso convencer,
              sempre com honestidade.
            </p>
          </div>
        </div>
        <p>
          <b>O primeiro passo no canal de empréstimo.</b> O cliente chega com a mensagem da IA dizendo que a análise foi
          “pré-aprovada”. Quando você assume, siga sempre esta ordem (a lição 5 explica em detalhe):
        </p>
        <Passos itens={[
          { titulo: 'Apresente-se', texto: 'Com o seu nome e a CAF.' },
          { titulo: 'Explique a “pré-aprovada” com honestidade', texto: 'A análise inicial passou nas perguntas; não é valor liberado.' },
          { titulo: 'Faça uma pergunta aberta e curta', texto: 'Sobre o que a pessoa precisa.' },
          { titulo: 'Peça os extratos do Meu INSS', texto: 'Para conferir a situação.' },
        ]} />
        <p>Com os extratos conferidos, a conversa pode seguir mais ou menos assim:</p>
        <Conversa
          titulo="Do “sem margem” ao empréstimo pessoal"
          nota="Sugestão de roteiro, adapte ao cliente. Começa depois do primeiro passo, com os extratos já conferidos."
          falas={[
            { quem: 'eu', texto: 'Dona Lúcia, conferi os seus extratos. Vou explicar com calma: do benefício, a lei só deixa usar uma parte para pagar os empréstimos consignados, aqueles que o INSS desconta direto. Essa parte se chama margem.' },
            { quem: 'eu', texto: 'Hoje, as parcelas que a senhora já paga para o Banco A, o Banco B e o BMG ocupam toda essa parte. Por isso um consignado novo não cabe agora.' },
            { quem: 'cliente', texto: 'Então não tem jeito?' },
            { quem: 'eu', texto: 'Tem caminhos, sim, e eu vou ver com a senhora. Um é a possibilidade de aumento de margem. Outro é a portabilidade: levar os consignados para outro banco, o que em alguns casos libera um valor. Mas isso só a análise confirma, tá bom?' },
            { quem: 'eu', texto: 'E me conta uma coisa: a senhora tem algum empréstimo com Agibank, BMG, Facta, Mercantil ou Crefisa que é cobrado na sua conta ou por boleto, fora do INSS? Pergunto porque é nesse tipo, o empréstimo pessoal, que a nossa análise olha os juros.' },
          ]}
        />
        <p>
          Daqui em diante (como apresentar o processo, explicar os 30% e pedir os documentos), siga o roteiro completo da
          lição 7.
        </p>
        <TesteRapido
          pergunta="Canal de empréstimo: o Seu Raimundo (exemplo) quer um consignado novo, mas os extratos mostram que ele está sem margem. O que fazer?"
          opcoes={[
            'Encerrar com carinho: sem margem, não há o que oferecer',
            'Apresentar os ganchos e perguntar pelo empréstimo pessoal',
            'Indicar um empréstimo pessoal numa das 5 financeiras',
          ]}
          certa={1}
          explica="Sem margem não é fim de conversa: apresente o aumento de margem e a portabilidade como possibilidades e pergunte se ele tem empréstimo pessoal numa das 5 financeiras. O que você oferece é a revisão dos juros do pessoal que ele já tem, não um empréstimo novo."
        />
      </Secao>

      {/* ------------------------------------------------------------------ descobrir o tipo */}
      <Secao titulo="9. Como descobrir se o empréstimo é pessoal ou consignado">
        <p>
          Na conversa, o cliente nem sempre usa as palavras “consignado” ou “pessoal”. Ele fala “o empréstimo da Agibank”, “o
          desconto do banco”, “aquele que sai da conta”. O seu trabalho é descobrir o tipo com perguntas simples, sem jargão. O
          segredo é perguntar <b>como a parcela é paga</b>, e não o nome técnico.
        </p>
        <Passos itens={[
          { titulo: 'Pergunte com qual financeira é', texto: '“A senhora tem empréstimo com Agibank, BMG, Facta, Mercantil ou Crefisa?”' },
          { titulo: 'Pergunte como a parcela é paga', texto: '“O INSS já desconta direto do seu benefício, ou a parcela sai da sua conta, ou por boleto, depois que o dinheiro cai?”' },
          { titulo: 'Se ele não souber, explique e pergunte de novo uma vez', texto: '“É aquele empréstimo que a financeira cobra na sua conta, e não o que o INSS desconta direto do benefício.” Se continuar sem saber, siga em frente (lição 4).' },
          { titulo: 'Confirme com as palavras dele', texto: '“Então o do BMG o INSS desconta, e o da Agibank sai da sua conta, certo?” Repetir evita mal-entendido.' },
        ]} />
        <p><b>Pistas que o cliente dá</b> (e o que fazer com cada uma):</p>
        <Tabela
          colunas={['Se o cliente diz…', 'Aponta para', 'O próximo passo']}
          destaque={1}
          linhas={[
            ['“O INSS já desconta do meu benefício.”', 'Consignado', 'Ajuda a entender a margem. Pergunte se ele também tem algum empréstimo cobrado pela financeira.'],
            ['“Sai da minha conta todo mês.” ou “Pago boleto ou carnê.”', 'Empréstimo pessoal', 'Pergunte com qual das 5 financeiras é.'],
            ['“É um cartão; o INSS desconta uma parte da fatura.”', 'Cartão consignado (RMC ou RCC)', 'Faz parte do consignado. Pergunte também pelo empréstimo pessoal.'],
            ['“Tenho empréstimo no BMG.” (e só)', 'Ainda não dá para saber', 'Pergunte como a parcela é paga.'],
            ['“Não sei, é tudo empréstimo.”', 'Ainda não dá para saber', 'Explique a diferença com uma frase simples e pergunte de novo uma vez.'],
          ]}
        />
        <div className="mv-csg-cel">
          <Celular
            contato="CAF"
            bolhas={[
              { de: 'eu', texto: 'Dona Lúcia, para eu entender a sua situação: a senhora tem empréstimo com Agibank, BMG, Facta, Mercantil ou Crefisa?', hora: '10:20' },
              { de: 'cliente', texto: 'Tenho no BMG e na Agibank.', hora: '10:22' },
              { de: 'eu', texto: 'E como a senhora paga cada um? O INSS já desconta do benefício, ou a parcela sai da sua conta depois que o dinheiro cai?', hora: '10:22' },
              { de: 'cliente', texto: 'O do BMG já vem descontado no benefício. O da Agibank sai da minha conta todo mês.', hora: '10:25' },
              { de: 'eu', texto: 'Entendi! Então o do BMG é consignado, e o da Agibank é um empréstimo pessoal. É nos juros do empréstimo pessoal que a nossa análise olha.', hora: '10:26' },
            ]}
            legenda="Sugestão de roteiro, adapte ao cliente. A cliente e as respostas são exemplo."
          />
        </div>
        <BomRuim
          ruim={{
            corpo: (
              <Lista tom="nao" itens={[
                '“Aparece algum desconto da Agibank no seu benefício?” (essa pergunta aponta para o consignado)',
                'Concluir o tipo só pelo nome do banco (o BMG também tem consignado)',
                'Usar “consignado” e “pessoal” sem explicar o que cada palavra quer dizer',
              ]} />
            ),
          }}
          bom={{
            corpo: (
              <Lista tom="sim" itens={[
                'Perguntar como a parcela é paga: pelo INSS, direto do benefício, ou pela financeira, na conta ou por boleto/carnê',
                'Explicar com uma frase simples: “o consignado o INSS desconta; o pessoal a financeira cobra”',
                'Se o cliente não souber, perguntar de novo uma vez e, se continuar sem saber, seguir em frente',
              ]} />
            ),
          }}
        />
        <TesteRapido
          pergunta="Qual pergunta ajuda o cliente a dizer se o empréstimo dele é pessoal?"
          opcoes={[
            '“Aparece algum desconto da Agibank no seu benefício?”',
            '“A parcela sai da sua conta ou o INSS desconta direto?”',
            '“O senhor tem empréstimo consignado com a Agibank?”',
          ]}
          certa={1}
          explica="Perguntar como a parcela é paga separa os dois tipos. “Desconto no benefício” e “consignado” apontam para o consignado, que não é o que o processo revisa."
        />
      </Secao>

      {/* ------------------------------------------------------------------ treino */}
      <Secao titulo="10. Treino: consignado ou pessoal?">
        <p>
          Hora de praticar. Leia cada situação e decida: é <b>consignado</b>, é <b>empréstimo pessoal</b> ou ainda <b>precisa
          perguntar</b>? Depois de cada resposta aparece a explicação. Jogue até acertar todas.
        </p>
        <ConsignadoOuPessoal />
      </Secao>

      {/* ------------------------------------------------------------------ mapa */}
      <Secao titulo="11. Juntando tudo: o mapa da diferença">
        <p>
          Este mapa junta a lição inteira: os dois empréstimos lado a lado, linha por linha. Tente explicar cada linha em voz
          alta, como se estivesse falando com um cliente. Se conseguir, você entendeu a lição.
        </p>
        <MapaDiferenca />
      </Secao>

      <Secao titulo="Resumo da lição">
        <Lista itens={[
          <>No <b>consignado</b>, o INSS desconta a parcela direto do benefício, antes de o dinheiro cair na conta. Ele precisa
            de <b>margem</b> (até 45%: 35% para empréstimos, 5% RMC e 5% RCC) e tem um teto de juros.</>,
          <>O <b>empréstimo pessoal</b> é um contrato direto com a financeira, fora do INSS, cobrado em geral na conta ou por
            boleto/carnê. Não usa a margem e tem <b>juros livres</b>, em geral bem mais altos.</>,
          <>Os <b>juros abusivos</b> que a CAF revisa estão no <b>empréstimo pessoal</b> com Agibank, BMG, Facta, Mercantil ou
            Crefisa. O Dr. Rafael Menezes entra com uma ação pedindo o ressarcimento do que foi descontado nos últimos 10 anos;
            o resultado depende da análise.</>,
          <>No canal de empréstimo, o cliente sem margem ouve os <b>ganchos do consignado</b> (aumento de margem e portabilidade,
            que pode liberar um valor acima de R$ 1.500) e a <b>revisão do pessoal</b> que ele já tem. Tudo como possibilidade,
            nunca como promessa.</>,
          <>Para saber o tipo, pergunte <b>como a parcela é paga</b>. O nome do banco não basta: o BMG, por exemplo, também tem
            consignado.</>,
          <>No <b>extrato de pagamento</b> você lê o bruto, cada desconto de consignado com o nome do banco e o líquido. O
            empréstimo pessoal não aparece como desconto do INSS.</>,
        ]} />
      </Secao>
    </>
  ),
  questoes: [
    {
      p: 'Qual é a diferença principal entre o empréstimo consignado e o empréstimo pessoal?',
      o: [
        'No pessoal o INSS desconta; no consignado, a financeira cobra',
        'No consignado o INSS desconta; no pessoal, a financeira cobra',
        'Os dois são descontados pelo INSS; o que muda é só o nome do banco',
      ],
      c: 1,
      e: 'No consignado, o INSS desconta a parcela direto do benefício. No empréstimo pessoal, o benefício cai inteiro e a financeira cobra depois, na conta ou por boleto/carnê.',
    },
    {
      p: 'Em qual empréstimo estão os juros abusivos que o processo da CAF revisa?',
      o: [
        'No consignado, que o INSS desconta do benefício',
        'No empréstimo pessoal feito com as financeiras',
        'Nos cartões consignados RMC e RCC do benefício',
      ],
      c: 1,
      e: 'O processo revisa os juros dos empréstimos pessoais com Agibank, BMG, Facta, Mercantil ou Crefisa. O consignado e os cartões consignados entram como assunto da margem e dos ganchos.',
    },
    {
      p: 'Por que um cliente sem margem ainda consegue fazer um empréstimo pessoal?',
      o: [
        'Porque o pessoal não usa a margem consignável',
        'Porque o INSS libera mais 10% de margem para isso',
        'Porque a financeira aumenta a margem dele na hora',
      ],
      c: 0,
      e: 'O empréstimo pessoal não é descontado pelo INSS, então não ocupa a margem. Por isso quem está sem margem muitas vezes recorre a ele, que é mais caro.',
    },
    {
      p: 'Sobre os juros, qual frase está certa?',
      o: [
        'O pessoal tem teto; o consignado tem juros livres',
        'O consignado tem teto; o pessoal tem juros livres',
        'Os dois têm o mesmo teto de juros, definido pelo INSS',
      ],
      c: 1,
      e: 'O consignado do INSS tem um teto de juros e, em geral, é o mais barato. O empréstimo pessoal tem juros livres, em geral bem mais altos: é nele que aparecem os juros abusivos que revisamos.',
    },
    {
      p: 'No extrato de pagamento do INSS aparece um desconto do BMG. O que dá para concluir?',
      o: [
        'Que é um consignado ou cartão consignado do BMG',
        'Que é o empréstimo pessoal do BMG, o que revisamos',
        'Que o cliente não tem empréstimo nas 5 financeiras',
      ],
      c: 0,
      e: 'O que o INSS desconta é consignado (empréstimo ou cartão), e o BMG também tem consignado. O empréstimo pessoal não aparece como desconto do INSS: pergunte por ele à parte.',
    },
  ],
  glossario: [
    { termo: 'Empréstimo consignado', def: 'Empréstimo cuja parcela o INSS desconta direto do benefício, antes de o dinheiro cair na conta. Precisa de margem e tem teto de juros.' },
    { termo: 'Empréstimo pessoal', def: 'Empréstimo feito direto com a financeira, fora do INSS, cobrado em geral na conta do cliente ou por boleto/carnê. Não usa a margem e tem juros livres. É o que o nosso processo revisa.' },
    { termo: 'Margem consignável', def: 'A parte do benefício que pode ir para descontos de consignado: até 45% (35% para empréstimos, 5% para o cartão RMC e 5% para o cartão RCC).' },
    { termo: 'Sem margem', def: 'Quando as parcelas de consignado já ocupam toda a gaveta dos 35%: um consignado novo não sai. Não impede o empréstimo pessoal, que não usa a margem.' },
    { termo: 'RMC', def: 'Reserva de Margem Consignável: os 5% do benefício reservados ao cartão de crédito consignado. Todo mês, parte da fatura é descontada do benefício.' },
    { termo: 'RCC', def: 'Reserva de Cartão Consignado: os 5% do benefício reservados ao cartão consignado de benefício, outro cartão com desconto mensal direto no benefício.' },
    { termo: 'Portabilidade', def: 'Levar um empréstimo consignado para outro banco: o banco novo quita o saldo devedor no antigo e o cliente passa a pagar o novo. Em alguns casos libera um valor; é possibilidade, nunca garantia.' },
    { termo: 'Teto de juros do consignado', def: 'O limite de juros definido para o consignado do INSS. O empréstimo pessoal não tem esse teto: os juros dele são livres.' },
    { termo: 'Juros abusivos', def: 'Juros cobrados muito acima do que é considerado razoável para aquele tipo de empréstimo. No nosso trabalho, é o que se analisa nos empréstimos pessoais com as 5 financeiras.' },
    { termo: 'Valor bruto e valor líquido', def: 'Bruto é o valor do benefício antes dos descontos do INSS; líquido é o que sobra e cai na conta do cliente.' },
  ],
  mensagens: [
    {
      titulo: 'Explicar a diferença ao cliente',
      quando: 'Quando o cliente confunde os empréstimos ou pergunta qual deles a CAF revisa. Troque “você” por “o senhor/a senhora” se for o tom da conversa.',
      texto: [
        'Vou te explicar de um jeito simples. Quem recebe do INSS pode ter dois tipos de empréstimo:',
        '',
        '*Consignado*: o INSS desconta a parcela direto do seu benefício, antes de o dinheiro cair na conta.',
        '',
        '*Empréstimo pessoal*: não passa pelo INSS. O benefício cai inteiro e a financeira cobra depois, na sua conta ou por boleto/carnê. Os juros dele são livres e costumam ser bem mais altos.',
        '',
        'A nossa análise olha os juros do *empréstimo pessoal*. Ficou claro? Se quiser, te explico como funciona.',
      ].join('\n'),
    },
    {
      titulo: 'Perguntar se o empréstimo é pessoal',
      quando: 'Quando o cliente diz que tem empréstimo numa das 5 financeiras, mas não sabe dizer de que tipo. Troque [financeira] pelo nome que ele citou.',
      texto: [
        'Me ajuda a entender uma coisa: esse empréstimo com a [financeira], como você paga a parcela?',
        '',
        '1. O INSS já desconta direto do seu benefício; ou',
        '2. A parcela sai da sua conta depois que o benefício cai, ou você paga boleto/carnê.',
        '',
        'Pode responder só com o número, tá bom?',
      ].join('\n'),
    },
    {
      titulo: 'O que é margem (explicação simples)',
      quando: 'Quando o cliente pergunta por que o consignado não sai, e só depois de conferir no extrato de consignado que a margem para empréstimo está toda ocupada. Troque “você” por “o senhor/a senhora” se for o tom da conversa.',
      texto: [
        'Vou te explicar de um jeito simples.',
        '',
        'Do seu benefício, a lei só deixa usar uma parte para pagar empréstimos consignados, aqueles que o INSS desconta direto. Essa parte se chama *margem*.',
        '',
        'Hoje, as parcelas que você já paga ocupam toda essa parte. Por isso o banco não consegue liberar um consignado novo agora.',
        '',
        'Mas isso não quer dizer que não exista caminho. Posso te mostrar as possibilidades?',
      ].join('\n'),
    },
    {
      titulo: 'Explicar a portabilidade',
      quando: 'Quando o cliente pergunta o que é portabilidade.',
      texto: [
        'Portabilidade é levar o seu empréstimo consignado de um banco para outro.',
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
        'O problema é quando a financeira cobra muito acima do que seria razoável. A nossa análise olha os juros do *empréstimo pessoal*, aquele que a financeira cobra na sua conta ou por boleto/carnê, fora do INSS.',
        '',
        'Se houver juros abusivos, o nosso advogado, o Dr. Rafael Menezes, entra com uma ação pedindo o ressarcimento do que foi descontado nos últimos 10 anos. O resultado depende da análise.',
        '',
        'A análise é gratuita, e você não paga nada para começar. Quer que a gente analise o seu caso?',
      ].join('\n'),
    },
  ],
};
export default licao;
