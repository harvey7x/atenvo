/* Lição 4 — Quem é o nosso cliente. Elegibilidade pelas 3 portas do processo
   oficial (benefício do INSS, rota do familiar, EMPRÉSTIMO PESSOAL numa das 5
   financeiras), a diferença entre empréstimo pessoal e consignado, os tipos de
   benefício, quem não serve e como encerrar, a persona do cliente e como falar
   com ele. Fonte: o dono (13/10/2026, inclusive a correção "a revisão é em
   empréstimo pessoal, não em consignado") e o processo oficial da IA (aprovado
   em 18/09). Ilustrações em 04-cliente-ilustracoes.tsx, peças interativas em
   04-cliente-interativos.tsx, estilos em 04-cliente.css. */
import type { Licao } from '../tipos';
import {
  Aviso, BomRuim, Celular, Conversa, Fatos, Figura, Frase, Lista, Passos, Sanfona, Secao, Tabela, TesteRapido,
} from '../pecas';
import {
  CaminhoParcela, ExtratoIlustrado, FamiliarDocs, Financeiras, NaoEInss, Pensamentos, Persona, PublicoAlvo,
  SeisAtitudes, TiposBeneficio, TresPortas,
} from './04-cliente-ilustracoes';
import { ArvorePortas, PessoalOuConsignado, TOTAL_CASOS, TradutorJargao, TriagemCasos } from './04-cliente-interativos';
import './04-cliente.css';

/* ---------------------------------------------------------------- as 3 portas, explicadas */
const PORTAS_TX = [
  {
    n: '1', tom: 'azul', quando: 'Sempre a primeira', titulo: 'Recebe algum benefício do INSS?',
    abre: <>Quando a pessoa recebe <b>qualquer</b> benefício do INSS: aposentadoria, pensão, auxílio ou BPC/LOAS.</>,
    porque: <>Os documentos que montam o processo saem do Meu INSS e estão ligados ao benefício.</>,
    cuidado: <>"Não sou aposentado" não é o mesmo que "não tenho benefício". Pergunte pelo <b>benefício</b>.</>,
  },
  {
    n: '2', tom: 'azul', quando: 'Só se a 1 fechar', titulo: 'Algum familiar recebe do INSS?',
    abre: <>Quando o <b>pai, a mãe, a avó, o avô ou um filho</b> recebe benefício do INSS.</>,
    porque: <>A análise segue pelo benefício do familiar. A partir daí, <b>os documentos passam a ser dele</b>.</>,
    cuidado: <>Ninguém na família recebe? Não é elegível: agradeça e encerre, <b>sem insistir</b>.</>,
  },
  {
    n: '3', tom: 'verde', quando: 'Vale para todos', titulo: 'Tem empréstimo pessoal numa das 5 financeiras?',
    abre: <>Quando há <b>empréstimo pessoal</b> no <b>Agibank, BMG, Facta, Mercantil ou Crefisa</b>. Só consignado não abre.</>,
    porque: <>É nos juros do empréstimo pessoal que o processo olha. E são as 5 financeiras com que a empresa trabalha.</>,
    cuidado: <>Não sabe? Pergunte de novo <b>uma vez</b>, citando as 5. Seguiu sem saber? Siga em frente.</>,
  },
] as const;

function PortasExplicadas() {
  return (
    <div className="mv-cli-pcs">
      {PORTAS_TX.map((p) => (
        <div key={p.n} className="vidro mv-cli-pc" data-tom={p.tom}>
          <div className="mv-cli-pc-cab">
            <span className="mv-cli-pc-n">{p.n}</span>
            <div><small>Porta {p.n} · {p.quando}</small><b>{p.titulo}</b></div>
          </div>
          <div className="mv-cli-pc-it"><span>Abre quando</span><p>{p.abre}</p></div>
          <div className="mv-cli-pc-it"><span>Por quê</span><p>{p.porque}</p></div>
          <div className="mv-cli-pc-it"><span>Cuidado</span><p>{p.cuidado}</p></div>
        </div>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------- a lição */
const licao: Licao = {
  id: 'cliente',
  modulo: 'fundamentos',
  titulo: 'Quem é o nosso cliente',
  resumo: 'As 3 portas que dizem quem pode ser cliente, os benefícios do INSS, o empréstimo pessoal nas 5 financeiras (e a diferença para o consignado), a rota do familiar, quem não serve e como falar com o nosso público.',
  minutos: 35,
  corpo: (
    <>
      <p className="mv-lead">
        Antes de falar de juros, de documentos ou de processo, toda conversa começa com uma pergunta que precisa de resposta antes de
        tudo: <b>essa pessoa pode ser nossa cliente?</b> Nesta lição você aprende a responder isso em poucos minutos,
        usando as <b>3 portas</b> do processo oficial, e conhece a pessoa que está do outro lado da tela: quem ela é,
        do que tem medo e como falar com ela do jeito certo.
      </p>

      <Fatos itens={[
        { grande: '3 portas', texto: 'Três perguntas dizem se a pessoa pode ser cliente. Você vai usá-las em toda conversa.' },
        { grande: 'Todo benefício', texto: 'Aposentadoria, pensão, auxílio ou BPC/LOAS: qualquer benefício do INSS abre a porta 1.' },
        { grande: '5 financeiras', texto: 'Empréstimo pessoal no Agibank, BMG, Facta, Mercantil ou Crefisa. É ele que a porta 3 procura, não o consignado.' },
        { grande: 'Sem insistir', texto: 'Quem não é elegível recebe um agradecimento carinhoso, e a conversa termina ali.' },
      ]} />

      {/* ------------------------------------------------------------ por quê */}
      <Secao titulo="Por que começar pelo perfil">
        <p>
          O nosso processo é sobre os <b>juros dos empréstimos pessoais</b> que o aposentado ou pensionista fez com as
          financeiras. O nosso advogado, o Dr. Rafael Menezes, entra com uma ação pedindo o ressarcimento do que foi
          descontado nos últimos 10 anos nesses empréstimos pessoais (o processo inteiro está na lição 2).
        </p>
        <p>
          E a documentação desse processo começa no INSS: a <b>carta de concessão</b>, o <b>extrato de empréstimo
          consignado</b> e o <b>extrato de pagamento do benefício</b> dos últimos 10 anos, todos tirados do Meu INSS.
          Se a pessoa não tem benefício do INSS (nem ela, nem um familiar), esses documentos simplesmente não existem, e
          não há o que analisar. E se ela não tem empréstimo pessoal com as financeiras com que a gente trabalha, não há
          o que revisar.
        </p>
        <p>Por isso, conferir o perfil logo no começo protege os três lados da conversa:</p>
        <Lista itens={[
          <><b>O cliente</b> não perde tempo juntando documentos e não cria uma esperança que depois vira frustração.</>,
          <><b>Você</b> não gasta meia hora num atendimento que não tem como seguir, e sobra tempo para quem pode ser atendido.</>,
          <><b>A empresa</b> mantém a confiança: a gente só oferece o que de fato consegue fazer.</>,
        ]} />
        <Frase>Perfil primeiro, conversa depois. Saber quem pode ser cliente é o que deixa você livre para ajudar de verdade.</Frase>
      </Secao>

      {/* ------------------------------------------------------------ público */}
      <Secao titulo="Para quem o anúncio fala">
        <p>
          O nosso tráfego pago anuncia no <b>Facebook</b> para <b>aposentados e pensionistas do INSS</b>. Por isso, esse
          é o perfil que você mais vai encontrar: é o nosso <b>público principal</b>. Mas "principal" não quer dizer
          "único". O processo oficial aceita <b>qualquer benefício do INSS</b> e ainda tem uma rota para quem não recebe
          nada, mas tem um familiar que recebe.
        </p>
        <Figura legenda="Do centro para fora: o público principal, quem também serve e a rota do familiar.">
          <PublicoAlvo />
        </Figura>
        <p>
          Repare na frase verde da figura: ela vale para os três anéis. Não importa por qual caminho a pessoa entrou,
          ela também precisa ter <b>empréstimo pessoal</b> numa das 5 financeiras com que a empresa trabalha. É isso que
          as 3 portas organizam.
        </p>
      </Secao>

      {/* ------------------------------------------------------------ 3 portas */}
      <Secao titulo="As 3 portas">
        <p>
          O processo oficial (o mesmo que o nosso robô segue) usa três perguntas para saber se a pessoa
          é <b>elegível</b>, ou seja, se pode seguir para a análise. Pense em três portas: a pessoa precisa passar pela
          porta 1 <b>ou</b> pela porta 2, <b>e</b>, em qualquer caso, pela porta 3.
        </p>
        <Figura legenda="A regra das portas: uma das duas primeiras e, sempre, a terceira.">
          <TresPortas />
        </Figura>
        <PortasExplicadas />
        <Aviso tom="ambar" titulo="Os dois erros mais comuns">
          <div className="mv-cli-aviso-par">
            <p>
              <b>Na porta 1:</b> descartar quem recebe BPC/LOAS ou auxílio porque "não é aposentado nem pensionista". O
              anúncio fala com aposentados e pensionistas, mas a porta 1 abre para <b>qualquer</b> benefício do INSS.
              Pergunte sempre pelo benefício, com os exemplos: "aposentadoria, pensão, auxílio ou BPC/LOAS".
            </p>
            <p>
              <b>Na porta 3:</b> abrir a porta só porque o cliente tem <b>consignado</b> num desses bancos. A porta 3
              pergunta do <b>empréstimo pessoal</b>, que a financeira cobra fora do INSS. A diferença entre os dois está
              explicada mais abaixo, na seção "Porta 3: empréstimo pessoal, não consignado".
            </p>
          </div>
        </Aviso>
      </Secao>

      {/* ------------------------------------------------------------ árvore */}
      <Secao titulo="A árvore de decisão: clique e teste">
        <p>
          Agora junte as portas numa árvore. Escolha no painel a resposta do cliente e veja o caminho acender. Faça
          todos os caminhos pelo menos uma vez: o do cliente que recebe, o do familiar, o do "não sei o banco" e os dois
          finais de não elegível. Em cada pergunta há uma sugestão de como perguntar, pronta para copiar.
        </p>
        <ArvorePortas />
        <Aviso titulo="Uma pergunta por vez, na ordem da árvore">
          Na conversa, as portas não viram um questionário. Faça uma pergunta, espere a resposta e só então faça a
          próxima. A porta 2 só aparece se a porta 1 fechar: se a pessoa já disse que é aposentada, não pergunte da
          família.
        </Aviso>
      </Secao>

      <TesteRapido
        pergunta={'Dona Aurora escreve: "Aposentada eu não sou. Recebo o LOAS." Ela tem um empréstimo pessoal no BMG. E agora?'}
        opcoes={[
          'Não elegível: ela não é aposentada nem pensionista',
          'Elegível: o LOAS é do INSS e o BMG está entre as 5',
          'Só segue se algum familiar dela for aposentado do INSS',
        ]}
        certa={1}
        explica="Qualquer benefício do INSS abre a porta 1, e o BPC/LOAS é pago pelo INSS. Com empréstimo pessoal no BMG, a porta 3 também está aberta."
      />

      {/* ------------------------------------------------------------ quando conferir */}
      <Secao titulo="Em que momento você confere as portas">
        <p>
          Quase sempre, você não pega a conversa do zero: o robô atende primeiro. O cliente chega por um de dois canais
          (a lição 5 mostra os dois e o que o robô faz em cada um), e, para as portas, a diferença é uma só: no <b>canal
          de juros abusivos</b> as portas ficam com você; no <b>canal de empréstimo</b>, a IA já perguntou antes de passar
          a conversa.
        </p>
        <div className="mv-cli-lado">
          <Celular
            contato="Maria"
            legenda="Canal de juros abusivos: o robô entrega nome e CPF, as portas ficam com você."
            bolhas={[
              { de: 'robo', texto: '✅ Recebido, Maria!', hora: '14:02' },
              { de: 'robo', texto: 'Sua análise foi iniciada. Em alguns minutos retorno aqui com uma atualização.', hora: '14:02' },
              { de: 'eu', texto: 'Oi, Dona Maria! Aqui é [seu nome], da CAF. Vou continuar a sua análise. 😊', hora: '14:05' },
              { de: 'eu', texto: 'Uma pergunta rápida: a senhora recebe algum benefício do INSS? Pode ser aposentadoria, pensão, auxílio ou BPC/LOAS.', hora: '14:05' },
              { de: 'cliente', texto: 'Recebo a pensão do meu marido', hora: '14:09' },
              { de: 'eu', texto: 'Entendi. E a senhora tem algum empréstimo pessoal com Agibank, BMG, Facta, Mercantil ou Crefisa?', hora: '14:10' },
              { de: 'cliente', texto: 'Empréstimo pessoal? Não sei se é esse', hora: '14:11' },
              { de: 'eu', texto: 'É aquele empréstimo que a financeira cobra na sua conta, e não o que o INSS desconta direto do benefício.', hora: '14:12' },
              { de: 'cliente', texto: 'Ah, esse eu tenho sim, do Agibank', hora: '14:14' },
            ]}
          />
          <div>
            <p>Leia a conversa ao lado e repare em quatro detalhes (as mensagens do atendente são sugestão de roteiro):</p>
            <Passos itens={[
              { titulo: 'Diga quem você é', texto: 'O cliente acabou de falar com um robô. Seu nome e "da CAF" mostram que agora tem uma pessoa ali.' },
              { titulo: 'Porta 1 com exemplos', texto: 'Citar "aposentadoria, pensão, auxílio ou BPC/LOAS" evita que quem recebe BPC ou auxílio diga "não" por engano.' },
              { titulo: 'Porta 2 só se precisar', texto: 'Ela é pensionista: a porta 1 abriu, então não há por que perguntar da família.' },
              { titulo: 'Porta 3: empréstimo pessoal', texto: 'Diga "empréstimo pessoal" e cite as 5. Se o cliente não entender, explique numa frase: é o que a financeira cobra na conta, não o que o INSS desconta. Agibank: porta 3 aberta.' },
            ]} />
          </div>
        </div>
        <Aviso titulo="No canal de empréstimo">
          Ali a IA já passou pelas portas com o cliente antes de chamar você. Mesmo assim, fique atento: se no meio da
          conversa aparecer algo que não bate (por exemplo, "na verdade eu trabalho de carteira assinada"), volte à árvore
          e confira de novo. Esse cliente também chega tendo lido que a análise foi "pré-aprovada": o que isso quer dizer, e
          como explicar com honestidade, está na lição 5. E repare: ele chega pensando num consignado novo, mas a porta 3
          é sobre o <b>empréstimo pessoal</b> que ele já tem numa das 5. Como conduzir essa virada na conversa está na
          lição 7.
        </Aviso>
      </Secao>

      {/* ------------------------------------------------------------ benefícios */}
      <Secao titulo="Os benefícios do INSS, em linguagem simples">
        <p>
          Para a porta 1, você precisa reconhecer um benefício do INSS quando o cliente fala dele, e ele quase nunca usa o
          nome oficial. Veja os quatro tipos, o que cada um é e como o cliente costuma se referir a ele. <b>Todos
          servem.</b>
        </p>
        <TiposBeneficio />
        <p>
          O cuidado agora é o contrário: algumas coisas <b>parecem</b> benefício, mas não são pagas pelo INSS. Se a pessoa
          só tem uma delas, e ninguém da família recebe do INSS, as portas 1 e 2 ficam fechadas.
        </p>
        <NaoEInss />
        <Aviso titulo="Na dúvida, pergunte de outro jeito">
          Se não ficou claro, pergunte: "Esse pagamento que o(a) senhor(a) recebe todo mês vem do INSS?". Quando chegar a
          hora dos documentos, a carta de concessão do Meu INSS mostra qual é o benefício e tira qualquer dúvida.
        </Aviso>
      </Secao>

      {/* ------------------------------------------------------------ pessoal × consignado */}
      <Secao titulo="Porta 3: empréstimo pessoal, não consignado">
        <p>
          A porta 3 não pergunta de qualquer empréstimo. Ela pergunta do <b>empréstimo pessoal</b>, porque é nos juros
          dele que aparecem os juros abusivos que a CAF revisa. Só que existem dois tipos de empréstimo muito comuns para
          quem recebe do INSS, e o cliente quase sempre chama os dois só de "empréstimo". Antes de abrir a porta 3, você
          precisa saber de qual dos dois ele está falando.
        </p>
        <Figura legenda="Por onde a parcela passa: no consignado, o INSS desconta do benefício e repassa ao banco; no empréstimo pessoal, a financeira cobra fora do INSS.">
          <CaminhoParcela />
        </Figura>
        <Frase>O consignado é descontado pelo INSS; o empréstimo pessoal é cobrado pela financeira, fora do INSS.</Frase>
        <p>
          A diferença não é só de caminho. O consignado só sai quando há <b>margem consignável</b> e tem um <b>teto de
          juros</b>: é o empréstimo mais barato para o aposentado. O empréstimo pessoal <b>não usa a margem</b> do INSS,
          então a financeira consegue emprestar mesmo para quem já está sem margem, e os juros são <b>livres</b>, em geral
          bem mais altos. Por isso, quem está sem margem para consignado muitas vezes recorre ao empréstimo pessoal, que é
          mais caro. O nosso processo olha os juros do empréstimo pessoal. (Margem, cartões consignados e portabilidade
          estão explicados por inteiro na lição 3.)
        </p>
        <Tabela
          colunas={['', 'Consignado', 'Empréstimo pessoal']}
          destaque={2}
          linhas={[
            ['Quem cobra a parcela', 'O INSS desconta direto do benefício.', 'A financeira, fora do INSS: em geral na conta do cliente ou por boleto/carnê.'],
            ['Margem consignável', 'Precisa. Sem margem, não sai consignado novo.', 'Não usa.'],
            ['Juros', 'Têm teto. São os mais baratos para o aposentado.', 'Livres, em geral bem mais altos.'],
            ['Para a porta 3', 'Não abre a porta.', 'Abre, se for numa das 5 financeiras.'],
            ['Na CAF', 'Tema dos ganchos do canal de empréstimo (margem, portabilidade).', 'Objeto do processo: a revisão dos juros e o ressarcimento.'],
          ]}
        />
        <h4 className="mv-cli-sub">O mesmo banco pode ter os dois</h4>
        <p>
          O nome do banco, sozinho, não responde à porta 3. O BMG, por exemplo, também trabalha com consignado e com
          cartão consignado. Quando o cliente diz "tenho empréstimo no BMG", ainda falta saber de qual tipo. E cuidado na
          hora dos documentos: o <b>Extrato de Empréstimo Consignado</b>, um dos documentos do Meu INSS que fazem parte da
          documentação do processo, mostra os <b>consignados</b>.
        </p>
        <ExtratoIlustrado />
        <Aviso tom="ambar" titulo="Achou o banco no extrato do INSS? Isso é consignado">
          Ver BMG ou Agibank no Extrato de Empréstimo Consignado não abre a porta 3: tudo o que esse extrato lista é
          descontado pelo INSS. A porta 3 continua sendo a pergunta ao cliente: ele tem empréstimo pessoal com alguma das
          5 financeiras?
        </Aviso>
        <h4 className="mv-cli-sub">Como perguntar sem confundir</h4>
        <BomRuim
          ruim={{
            titulo: 'Leva ao consignado',
            corpo: (
              <Lista tom="nao" itens={[
                '"Aparece algum desconto de banco no seu benefício?" (desconto no benefício é consignado)',
                '"Tem empréstimo no BMG?" (não diz de qual tipo)',
                'Abrir a porta 3 só porque o banco está na lista',
              ]} />
            ),
          }}
          bom={{
            titulo: 'Leva ao empréstimo pessoal',
            corpo: (
              <Lista tom="sim" itens={[
                '"O(a) senhor(a) tem algum empréstimo pessoal com Agibank, BMG, Facta, Mercantil ou Crefisa?"',
                'Se ele não entender: "É aquele empréstimo que a financeira cobra na sua conta, e não o que o INSS desconta direto do benefício."',
                'Falou só o banco? Confirme o tipo antes de abrir a porta.',
              ]} />
            ),
          }}
        />
        <p>
          Agora treine o ouvido. Para cada fala, decida se é consignado, empréstimo pessoal ou se ainda não dá para saber
          (e você precisa perguntar):
        </p>
        <PessoalOuConsignado />
        <TesteRapido
          pergunta="Dona Célia é aposentada e tem dois consignados, do BMG e do Agibank, descontados pelo INSS. Empréstimo pessoal, nenhum. E a porta 3?"
          opcoes={[
            'Aberta: o BMG e o Agibank estão entre as 5',
            'Fechada: ela não tem empréstimo pessoal',
            'Aberta, se ela estiver sem margem hoje',
          ]}
          certa={1}
          explica="A porta 3 pede empréstimo pessoal numa das 5 financeiras. Consignado, mesmo de um banco da lista, não abre a porta. Sem nenhum empréstimo pessoal nas 5, ela não é elegível: agradeça e encerre com carinho."
        />
      </Secao>

      {/* ------------------------------------------------------------ financeiras */}
      <Secao titulo="As 5 financeiras">
        <p>
          Hoje a empresa trabalha com o empréstimo pessoal de <b>cinco financeiras</b>. As <b>top 3</b> (Agibank,
          Mercantil e BMG) são as que mais chegam até a gente, então são os nomes que você mais vai ouvir.
          Facta e Crefisa completam a lista.
        </p>
        <Financeiras />
        <p>
          Vale decorar os cinco nomes. Você vai perguntar por eles várias vezes por dia, e falar com segurança passa
          confiança ao cliente. Empréstimo pessoal fora dessas cinco? A resposta é sempre a mesma, sem rodeio e com
          gentileza: só trabalhamos com essas.
        </p>
        <h4 className="mv-cli-sub">Quando o cliente não sabe o banco (ou o tipo)</h4>
        <p>
          Isso acontece: o empréstimo foi feito há anos, foi o filho que contratou pelo celular, ou a pessoa não sabe se
          o empréstimo dela é pessoal ou consignado. Não trave a conversa por isso. A regra é simples:
        </p>
        <Passos itens={[
          { titulo: 'Pergunte de novo, uma vez só', texto: 'Cite as 5 pelo nome e explique numa frase: "É aquele empréstimo que a financeira cobra na sua conta, e não o que o INSS desconta direto do benefício."' },
          { titulo: 'Lembrou? Siga a árvore', texto: 'Tem empréstimo pessoal numa das 5? A porta 3 está aberta. Lembrou e não tem (ou só tem consignado)? Não é elegível.' },
          { titulo: 'Continuou sem saber? Siga em frente', texto: 'Não insista na pergunta: siga com o atendimento. Muitas vezes o cliente lembra depois, pelo débito na conta ou com a ajuda da família. Na dúvida, fale com o seu gestor.' },
        ]} />
        <TesteRapido
          pergunta="Seu Gilberto é aposentado, mas não lembra o banco do empréstimo. Você já perguntou de novo, citando as 5, e ele continua sem saber. O que fazer?"
          opcoes={[
            'Encerrar: sem saber o banco, não dá para seguir com ele',
            'Pedir que ele descubra o nome do banco e volte outro dia',
            'Seguir com o atendimento, sem insistir na pergunta',
          ]}
          certa={2}
          explica="A regra é perguntar de novo uma vez. Se ele seguir sem saber, siga em frente, sem travar a conversa. A porta 3 continua valendo se depois ficar claro que não há empréstimo pessoal nas 5."
        />
      </Secao>

      {/* ------------------------------------------------------------ familiar */}
      <Secao titulo="O caso do familiar">
        <p>
          Às vezes quem escreve não recebe nada do INSS, mas a mãe, o pai, a avó, o avô ou um filho recebe. É a porta 2,
          a <b>rota do familiar</b>. Nesse caso, a análise segue pelo benefício do familiar, e isso muda uma coisa
          importante: <b>os documentos passam a ser do familiar</b>, que é o titular do benefício. Quem conversa com você
          pode continuar sendo o filho ou a filha, ajudando; mas o benefício, os empréstimos e os documentos são do
          familiar.
        </p>
        <Figura legenda="A conversa pode ser com quem ajuda. A análise e os documentos são do titular do benefício.">
          <FamiliarDocs />
        </Figura>
        <div className="mv-cli-lado">
          <Celular
            contato="Cláudio"
            legenda="Rota do familiar: quem escreve não recebe, o pai recebe."
            bolhas={[
              { de: 'cliente', texto: 'Boa tarde. Eu não sou aposentado não, sou servidor da prefeitura. Mas o meu pai é aposentado do INSS e tem um empréstimo pessoal no Mercantil', hora: '15:20' },
              { de: 'eu', texto: 'Boa tarde, Cláudio! Obrigado por explicar. 😊 Nesse caso, a análise pode ser feita pelo benefício do seu pai.', hora: '15:22' },
              { de: 'eu', texto: 'Ele sabe que você está falando com a gente? Os documentos vão ser todos dele, então ele precisa estar de acordo.', hora: '15:22' },
              { de: 'cliente', texto: 'Sabe sim, ele que pediu pra eu ver. Ele não mexe muito no celular', hora: '15:25' },
              { de: 'eu', texto: 'Perfeito! Então me passa, por favor, o nome completo e o CPF do seu pai.', hora: '15:26' },
            ]}
          />
          <div>
            <p>O que fazer na rota do familiar (as mensagens ao lado são sugestão de roteiro):</p>
            <Lista itens={[
              <>Explique que a análise pode seguir <b>pelo benefício do familiar</b>.</>,
              <>Confirme que o familiar <b>sabe e está de acordo</b>: o benefício e os dados são dele.</>,
              <>Peça o <b>nome completo e o CPF do familiar</b>. O nome e o CPF que chegaram pelo robô são de quem estava conversando.</>,
              <>Na porta 3, pergunte pelo <b>empréstimo pessoal do familiar</b>. Aqui o filho já disse que é pessoal, no Mercantil; se ele não souber o tipo, use a mesma explicação de antes.</>,
              <>Daqui em diante, <b>todo documento é do familiar</b>: os do Meu INSS, o imposto de renda, a situação do CPF, a identidade, a foto do rosto, o comprovante de residência e o e-mail. Na dúvida sobre algum deles, pergunte ao seu gestor antes de pedir.</>,
            ]} />
          </div>
        </div>
        <Aviso tom="ambar" titulo="Quem digita nem sempre é o cliente">
          Muitas vezes o neto ou a filha só está segurando o celular para a avó ou a mãe, que é aposentada. Na prática dá
          no mesmo: o cliente é sempre <b>quem recebe o benefício</b>. A análise e os documentos são dele, não de quem
          está digitando.
        </Aviso>
        <TesteRapido
          pergunta="Na rota do familiar, de quem são os documentos?"
          opcoes={[
            'Do familiar que recebe o benefício do INSS',
            'De quem está conversando com você no WhatsApp',
            'Os do Meu INSS são do familiar; o resto, de quem conversa',
          ]}
          certa={0}
          explica="A análise segue pelo benefício do familiar, e todos os documentos passam a ser dele: Meu INSS, imposto de renda, identidade, foto do rosto, comprovante e e-mail. Quem conversa só ajuda."
        />
      </Secao>

      {/* ------------------------------------------------------------ quem não serve */}
      <Secao titulo="Quem não serve, e como encerrar com carinho">
        <div className="mv-duas">
          <div className="vidro mv-cartao" data-tom="verde">
            <h4>Pode seguir para a análise</h4>
            <Lista tom="sim" itens={[
              'Recebe qualquer benefício do INSS (aposentadoria, pensão, auxílio, BPC/LOAS)',
              'Ou tem pai, mãe, avó, avô ou filho que recebe do INSS',
              'E tem empréstimo pessoal no Agibank, BMG, Facta, Mercantil ou Crefisa (ou não sabe, e segue em frente)',
            ]} />
          </div>
          <div className="vidro mv-cartao" data-tom="rubro">
            <h4>Não é elegível</h4>
            <Lista tom="nao" itens={[
              'CLT ou servidor sem benefício do INSS e sem familiar que receba',
              'Quem só tem "pensão" alimentícia, Bolsa Família ou aposentadoria fora do INSS, e ninguém da família recebe',
              'Quem não tem empréstimo pessoal em nenhuma das 5 financeiras (por exemplo, só tem consignado)',
            ]} />
          </div>
        </div>
        <Aviso titulo="Ser CLT não fecha a porta sozinho">
          O que fecha as portas 1 e 2 é <b>não ter benefício do INSS</b>, nem próprio nem na família. Uma pessoa que
          trabalha de carteira assinada e também recebe pensão do INSS passa pela porta 1. E um CLT cujo pai é aposentado
          do INSS pode seguir pela rota do familiar. Sempre pergunte antes de descartar.
        </Aviso>
        <p>
          Quando a pessoa não é elegível, o atendimento não acabou: falta encerrar bem. Ela procurou a gente com uma
          esperança e merece uma resposta clara e gentil. Encerrar com carinho também protege o nome da empresa: quem foi
          bem tratado fala bem, mesmo sem ter virado cliente.
        </p>
        <Frase autor="Regra do processo oficial">Quando a pessoa não é elegível, ou diz não, agradeça com carinho e não insista.</Frase>
        <Passos itens={[
          { titulo: 'Agradeça', texto: 'Pelo contato e pelo tempo dela. Use o nome.' },
          { titulo: 'Explique o motivo em uma frase', texto: 'Sem jargão e sem culpar a pessoa: "hoje o nosso trabalho é só para...".' },
          { titulo: 'Não insista', texto: 'Nada de "mas e se...", nada de oferecer o que a gente não faz, nada de voltar a chamar depois.' },
          { titulo: 'Encerre com a porta aberta', texto: '"Se precisar, é só chamar aqui." Simples assim. Registre o encerramento do jeito que o seu gestor orientar.' },
        ]} />
        <Conversa
          titulo="Encerrando com carinho"
          nota="Sugestão de roteiro: adapte ao cliente"
          falas={[
            { quem: 'cliente', texto: 'Não, ninguém lá em casa recebe do INSS. Eu e meu marido trabalhamos registrados.' },
            { quem: 'eu', texto: 'Entendi, Sandra. Muito obrigado por explicar tudo com tanta paciência! 😊' },
            { quem: 'eu', texto: 'Hoje o nosso trabalho é só para quem recebe algum benefício do INSS, ou tem um familiar que recebe. Por isso, neste caso, não temos como fazer a análise.' },
            { quem: 'eu', texto: 'Agradeço muito a sua confiança. Se precisar, é só chamar aqui. Um abraço!' },
          ]}
        />
        <BomRuim
          ruim={{
            titulo: 'Seco ou insistente',
            corpo: (
              <Lista tom="nao" itens={[
                '"Não atendemos CLT." (e mais nada)',
                '"Tem certeza que ninguém recebe? Pensa bem... uma tia, um primo?"',
                '"Mas e se a gente fizesse de outro jeito?"',
                'Deixar a pessoa sem resposta, esperando.',
              ]} />
            ),
          }}
          bom={{
            titulo: 'Com carinho',
            corpo: (
              <Lista tom="sim" itens={[
                'Agradece e chama pelo nome.',
                'Explica o motivo numa frase simples.',
                'Pergunta da família uma vez só, como manda a porta 2.',
                'Encerra logo, sem deixar a pessoa esperando, e deixa a porta aberta.',
              ]} />
            ),
          }}
        />
        <h4 className="mv-cli-sub">Casos que confundem</h4>
        <Sanfona itens={[
          {
            titulo: 'Recebe dois benefícios (por exemplo, aposentadoria e pensão)',
            corpo: <p>Serve: basta um benefício do INSS para a porta 1 abrir. Conte ao seu gestor que são dois, para ele orientar por qual benefício seguir.</p>,
          },
          {
            titulo: 'Trabalha de carteira assinada, mas também recebe pensão do INSS',
            corpo: <p>Serve. Ser CLT não fecha porta nenhuma: o que importa é receber benefício do INSS. Com empréstimo pessoal numa das 5, é elegível.</p>,
          },
          {
            titulo: 'Tem empréstimo pessoal numa das 5 e também em outro banco',
            corpo: <p>Serve. A porta 3 pede empréstimo pessoal em pelo menos uma das 5 financeiras. Ter consignado em qualquer banco, ou outro empréstimo fora da lista, não atrapalha.</p>,
          },
          {
            titulo: 'Só tem consignado, mesmo que seja do BMG ou do Agibank',
            corpo: <p>Não abre a porta 3. O consignado é descontado pelo INSS; a porta 3 pergunta do empréstimo pessoal, que a financeira cobra fora do INSS. Confirme uma vez, com a explicação simples. Se não houver empréstimo pessoal numa das 5, não é elegível: agradeça e encerre com carinho.</p>,
          },
          {
            titulo: '"É muito novo para ser aposentado"',
            corpo: <p>Não existe porta de idade. Quem recebe pensão por morte, auxílio ou BPC/LOAS pode ter bem menos de 60 anos. O que conta é o benefício do INSS e o empréstimo pessoal numa das 5.</p>,
          },
          {
            titulo: '"Sou aposentado pela prefeitura" (ou pelo Estado)',
            corpo: <p>Depende de quem paga. Muitos servidores se aposentam por um regime próprio, que não é o INSS. Pergunte: "A sua aposentadoria é paga pelo INSS?". Se não for, siga para a porta 2.</p>,
          },
        ]} />
      </Secao>

      {/* ------------------------------------------------------------ persona */}
      <Secao titulo="O retrato do nosso cliente">
        <p>
          Agora que você sabe <b>quem pode</b> ser cliente, conheça <b>quem ele costuma ser</b>. A personagem abaixo é
          inventada, mas junta traços que você vai reconhecer muitas vezes nas conversas. Entender essa pessoa é o que faz
          você escrever do jeito certo.
        </p>
        <Persona />
        <p>
          Uma dessas dificuldades pesa muito no dia a dia: a maioria dos clientes <b>não sabe entrar no Meu INSS</b> sozinha.
          Não é falta de vontade, é falta de prática com aplicativo, senha e PDF. Por isso o nosso atendimento é feito de
          passos pequenos, com paciência, e muitas vezes com a ajuda da família.
        </p>
        <p>
          A desconfiança também tem motivo: pessoas mais velhas são alvo frequente de golpes pelo celular. Quando o cliente
          chega desconfiado, ele não está sendo difícil, está se protegendo. O seu trabalho é mostrar, com calma e
          transparência, que do outro lado tem gente séria.
        </p>
        <Figura legenda="O que costuma passar pela cabeça do cliente nos primeiros minutos da conversa.">
          <Pensamentos />
        </Figura>
        <Tabela
          colunas={['O que ele pensa', 'O que ajuda']}
          destaque={0}
          linhas={[
            ['"Será que é golpe?"', 'Diga seu nome e que fala da CAF. Explique o que é a análise com calma, sem pressa e sem promessa. Desconfiança diminui com transparência, não com pressão.'],
            ['"Vou ter que pagar alguma coisa?"', 'Para começar, não: o processo é gratuito, e os honorários do advogado só saem no final, do valor que ele ganhar. Como explicar os 30% sem esconder nada está na lição 2.'],
            ['"Não sei mexer nisso."', 'Um passo de cada vez. Mande um áudio curto, espere ele fazer e só então peça o próximo passo.'],
            ['"Vou perguntar pro meu filho."', 'Ótimo sinal. Incentive: "Pode chamar ele, sim! Se quiser, eu explico para os dois."'],
            ['"Quero falar com gente de verdade."', 'Responda exatamente o que ele perguntou, chame pelo nome e, se ajudar, mande um áudio com a sua voz.'],
          ]}
        />
      </Secao>

      {/* ------------------------------------------------------------ como falar */}
      <Secao titulo="Como falar com ele">
        <p>
          Falar com um cliente idoso não é falar "mais devagar" nem tratar como criança. É <b>tirar os obstáculos</b> do
          caminho: menos texto, menos termo técnico, menos coisas ao mesmo tempo, e mais paciência. Seis atitudes resumem
          o jeito certo:
        </p>
        <SeisAtitudes />
        <p>Veja a diferença na prática. As duas mensagens querem saber a mesma coisa:</p>
        <BomRuim
          ruim={{
            titulo: 'Texto longo e técnico',
            corpo: (
              <Celular
                contato="Dona Zilda"
                bolhas={[
                  { de: 'eu', texto: 'Prezada cliente, para darmos prosseguimento à sua análise de elegibilidade, informe a espécie do seu benefício previdenciário, as instituições financeiras credoras e se possui margem consignável disponível, bem como se algum dependente é beneficiário.', hora: '09:10' },
                  { de: 'cliente', texto: 'Não entendi nada...', hora: '09:31' },
                ]}
              />
            ),
          }}
          bom={{
            titulo: 'Curto, simples, uma pergunta',
            corpo: (
              <Celular
                contato="Dona Zilda"
                bolhas={[
                  { de: 'eu', texto: 'Bom dia, Dona Zilda! Tudo bem? 😊', hora: '09:10' },
                  { de: 'eu', texto: 'Vou ajudar a senhora com calma, um passo de cada vez.', hora: '09:10' },
                  { de: 'eu', texto: 'Primeiro, uma pergunta simples: a senhora recebe algum benefício do INSS? Aposentadoria ou pensão, por exemplo?', hora: '09:11' },
                  { de: 'cliente', texto: 'Bom dia! Sou aposentada sim', hora: '09:14' },
                ]}
              />
            ),
          }}
        />
        <h4 className="mv-cli-sub">O áudio é seu aliado</h4>
        <div className="mv-cli-lado">
          <Celular
            contato="Dona Zilda"
            legenda="Áudio curto e, logo embaixo, o resumo por escrito."
            bolhas={[
              { de: 'cliente', texto: 'Não entendi direito essa parte do benefício', hora: '10:02' },
              { de: 'eu', tipo: 'audio', hora: '10:04' },
              { de: 'eu', texto: 'Mandei um áudio explicando. Resumindo: eu só preciso saber se a senhora recebe algum pagamento do INSS todo mês. 😊', hora: '10:04' },
              { de: 'cliente', tipo: 'audio', hora: '10:07' },
            ]}
          />
          <div>
            <p>
              Para muita gente, ouvir é mais fácil do que ler. Se o cliente manda áudio, é sinal de que ele prefere assim.
              Algumas regras para o áudio funcionar:
            </p>
            <Lista itens={[
              <><b>Curto e com uma ideia só.</b> Áudio longo cansa e ninguém ouve até o fim.</>,
              <><b>Voz calma, como numa ligação.</b> Diga o nome do cliente: soa pessoal.</>,
              <><b>Sempre com um resumo escrito embaixo.</b> Ele pode reler depois ou mostrar para o filho.</>,
              <><b>Ouça os áudios dele até o fim</b> antes de responder. A informação que falta costuma estar no final.</>,
            ]} />
          </div>
        </div>
        <h4 className="mv-cli-sub">Repetir sem impaciência</h4>
        <p>
          O cliente vai perguntar a mesma coisa duas, três vezes. Isso é normal: é muita informação nova para ele. Cada
          repetição é uma chance de explicar de um jeito mais simples.
        </p>
        <BomRuim
          ruim={{
            titulo: 'Soa impaciente',
            corpo: (
              <Lista tom="nao" itens={[
                '"Como eu já falei antes..."',
                '"É só ler ali em cima."',
                '"É fácil, qualquer um consegue."',
                'Responder só "?" ou mandar o mesmo texto de novo.',
              ]} />
            ),
          }}
          bom={{
            titulo: 'Soa acolhedor',
            corpo: (
              <Lista tom="sim" itens={[
                '"Claro! Explico de novo, sem problema."',
                '"Vou falar de um jeito mais simples."',
                '"Pode perguntar quantas vezes precisar."',
                '"Ficou claro agora? Se não, eu explico de outro jeito."',
              ]} />
            ),
          }}
        />
        <h4 className="mv-cli-sub">Tradutor: do jargão para a conversa</h4>
        <p>
          Dentro da empresa a gente fala "margem", "consignado", "elegível". O cliente não. Clique em cada palavra e veja
          como dizer a mesma coisa do jeito dele:
        </p>
        <TradutorJargao />
        <Aviso titulo="O senhor, a senhora ou você?">
          Comece com "o senhor" ou "a senhora": para quem é mais velho, costuma soar respeitoso. Se o cliente escrever de
          um jeito mais solto ou pedir "pode me chamar de você", acompanhe. Algumas mensagens prontas desta lição trazem
          "o(a) senhor(a)": troque pelo que combinar com o cliente antes de enviar.
        </Aviso>
        <TesteRapido
          pergunta={'Dona Zilda pergunta pela terceira vez o que é a tal "análise". Qual é a melhor resposta?'}
          opcoes={[
            '"Como eu já expliquei antes, é a análise dos juros."',
            'Explicar de novo, mais simples, com áudio se ajudar',
            'Mandar o mesmo texto de novo, para ela ler com calma',
          ]}
          certa={1}
          explica="Repetir faz parte do atendimento. Explique de novo, de um jeito mais simples, com a mesma gentileza da primeira vez."
        />
      </Secao>

      {/* ------------------------------------------------------------ treino */}
      <Secao titulo="Treino: atende ou descarta?">
        <p>
          Hora de praticar com {TOTAL_CASOS} casos fictícios, um por vez. Leia o que a pessoa escreveu e as informações do caso e
          decida: <b>atende</b>, <b>atende pelo familiar</b> ou <b>não elegível</b>. Depois de cada resposta você vê qual
          porta decidiu e por quê.
        </p>
        <TriagemCasos />
      </Secao>

      {/* ------------------------------------------------------------ resumo */}
      <Secao titulo="Resumo da lição">
        <Lista itens={[
          <>Toda conversa começa pelo <b>perfil</b>, com <b>as 3 portas</b>: porta 1 (qualquer benefício do INSS) <b>ou</b> porta 2 (um familiar que recebe), <b>e</b> sempre a porta 3 (empréstimo pessoal numa das 5 financeiras).</>,
          <><b>Pessoal, não consignado:</b> o consignado é descontado pelo INSS; o empréstimo pessoal é cobrado pela financeira, fora do INSS, com juros livres. O processo revisa os juros do empréstimo pessoal, e só ter consignado não abre a porta 3.</>,
          <><b>As 5 financeiras:</b> Agibank, BMG, Facta, Mercantil e Crefisa; as top 3 são Agibank, Mercantil e BMG. Não sabe o banco ou o tipo? Pergunte de novo uma vez; seguiu sem saber, siga em frente.</>,
          <><b>Rota do familiar:</b> a análise segue pelo benefício do familiar, e todos os documentos passam a ser dele, do Meu INSS ao e-mail.</>,
          <><b>Não elegível:</b> agradeça com carinho, explique o motivo em uma frase e encerre, sem insistir.</>,
          <>O nosso cliente costuma ser <b>idoso, desconfiado e apoiado pela família</b>: frases curtas, uma pergunta por vez, áudio quando ajudar e paciência para repetir.</>,
        ]} />
      </Secao>
    </>
  ),

  questoes: [
    {
      p: 'Qual destas pessoas NÃO é elegível?',
      o: [
        'Pensionista do INSS com empréstimo pessoal no Agibank',
        'CLT sem benefício do INSS e sem familiar que receba',
        'Quem recebe BPC/LOAS e tem empréstimo pessoal no BMG',
      ],
      c: 1,
      e: 'Sem benefício do INSS, nem próprio nem de um familiar, as portas 1 e 2 ficam fechadas. BPC/LOAS serve, e empréstimo pessoal no Agibank ou no BMG abre a porta 3.',
    },
    {
      p: 'Em quais financeiras o empréstimo pessoal abre a porta 3?',
      o: [
        'Agibank, BMG, Facta, Mercantil e Crefisa',
        'Agibank, BMG, Facta, Mercantil, Crefisa e Caixa',
        'Só as top 3: Agibank, Mercantil e BMG',
      ],
      c: 0,
      e: 'São cinco: Agibank, BMG, Facta, Mercantil e Crefisa. Agibank, Mercantil e BMG são as top 3 (as que mais chegam), mas não as únicas.',
    },
    {
      p: 'Quem escreveu não recebe nada do INSS, mas a mãe é pensionista e tem empréstimo pessoal no Mercantil. O que acontece?',
      o: [
        'Não é elegível, porque quem escreveu não recebe do INSS',
        'Segue normalmente, com os documentos de quem escreveu',
        'Segue pelo benefício da mãe, e os documentos são dela',
      ],
      c: 2,
      e: 'É a porta 2: um familiar recebe do INSS. A análise segue pelo benefício da mãe, e os documentos passam a ser dela.',
    },
    {
      p: 'O que a porta 3 pergunta sobre o empréstimo do cliente?',
      o: [
        'Se tem empréstimo pessoal numa das 5 financeiras',
        'Se tem consignado descontado num dos 5 bancos',
        'Se tem algum empréstimo, em qualquer banco ou financeira',
      ],
      c: 0,
      e: 'A porta 3 pede empréstimo pessoal, que a financeira cobra fora do INSS, numa das 5. Consignado, que o INSS desconta do benefício, não abre a porta, mesmo que seja de um banco da lista.',
    },
    {
      p: 'Qual é o jeito certo de falar com um cliente idoso que tem dificuldade com o celular?',
      o: [
        'Uma mensagem longa e completa, para não incomodar várias vezes',
        'Frases curtas, uma pergunta por vez e paciência para repetir',
        'Linguagem formal e termos técnicos, para passar mais seriedade',
      ],
      c: 1,
      e: 'Menos texto, menos jargão, uma coisa de cada vez e paciência. Um áudio curto, com resumo escrito, também ajuda.',
    },
  ],

  glossario: [
    { termo: 'Elegível', def: 'Quem passa pelas 3 portas e pode seguir para a análise. É palavra de uso interno: com o cliente, diga "o senhor pode fazer a análise".' },
    { termo: '3 portas', def: 'As três perguntas do processo oficial: recebe benefício do INSS? Se não, algum familiar recebe? E tem empréstimo pessoal numa das 5 financeiras?' },
    { termo: 'Benefício do INSS', def: 'Pagamento mensal feito pelo INSS: aposentadoria, pensão, auxílio ou BPC/LOAS. Qualquer um deles abre a porta 1.' },
    { termo: 'Pensão por morte', def: 'Benefício pago pelo INSS à família de quem contribuía ou era aposentado e faleceu. Quem recebe é o pensionista.' },
    { termo: 'Auxílio', def: 'Benefício do INSS pago em situações como doença ou acidente. O cliente costuma dizer que está "encostado".' },
    { termo: 'BPC/LOAS', def: 'Benefício de um salário mínimo por mês, pago pelo INSS a idosos de 65 anos ou mais e a pessoas com deficiência, de família de baixa renda. Não é aposentadoria, mas serve.' },
    { termo: 'Rota do familiar', def: 'Quando quem procura a gente não recebe do INSS, mas pai, mãe, avó, avô ou filho recebe. A análise segue pelo benefício do familiar.' },
    { termo: 'Titular do benefício', def: 'A pessoa que recebe o benefício do INSS. Na rota do familiar, o titular é o familiar, e os documentos passam a ser dele.' },
    { termo: 'Top 3', def: 'Agibank, Mercantil e BMG: as financeiras de empréstimo pessoal que mais chegam até a gente. A lista completa tem também Facta e Crefisa.' },
    { termo: 'Regime próprio', def: 'Sistema de aposentadoria de muitos servidores públicos (do Estado, da prefeitura ou da União). Quem se aposenta por ele não recebe do INSS.' },
  ],

  mensagens: [
    {
      titulo: 'Confirmar o benefício (porta 1)',
      quando: 'Logo no começo, quando você ainda não sabe se a pessoa recebe do INSS.',
      texto: 'Uma pergunta rápida: o(a) senhor(a) recebe algum benefício do INSS? Pode ser aposentadoria, pensão, auxílio ou BPC/LOAS.',
    },
    {
      titulo: 'Perguntar pelo familiar (porta 2)',
      quando: 'Só quando a pessoa disse que não recebe nada do INSS.',
      texto: 'Entendi! E alguém da sua família recebe benefício do INSS? Pai, mãe, avô, avó ou filho? Se sim, a análise pode ser feita pelo benefício dessa pessoa.',
    },
    {
      titulo: 'Perguntar de novo pela financeira (porta 3)',
      quando: 'Quando o cliente não soube dizer o banco, ou se o empréstimo é pessoal, na primeira vez. Use uma vez só.',
      texto: 'Sem problema! Me ajuda com uma coisa: o(a) senhor(a) tem algum empréstimo pessoal com Agibank, BMG, Facta, Mercantil ou Crefisa? É aquele empréstimo que a financeira cobra na sua conta, e não o que o INSS desconta direto do benefício. Se não lembrar agora, tudo bem, a gente segue.',
    },
    {
      titulo: 'Encerrar: sem benefício do INSS',
      quando: 'Quando nem a pessoa nem ninguém da família recebe do INSS.',
      texto: 'Muito obrigado por conversar com a gente! 😊\nHoje o nosso trabalho é só para quem recebe algum benefício do INSS, ou tem um familiar que recebe. Por isso, neste caso, não temos como fazer a análise.\nAgradeço muito a sua confiança. Se precisar, é só chamar aqui.',
    },
    {
      titulo: 'Encerrar: sem empréstimo pessoal nas 5 financeiras',
      quando: 'Quando a pessoa confirmou que não tem empréstimo pessoal com nenhuma das 5 (por exemplo, só tem consignado).',
      texto: 'Obrigado pelas informações! 😊\nHoje a gente trabalha só com empréstimos pessoais do Agibank, BMG, Facta, Mercantil e Crefisa. Como o(a) senhor(a) não tem empréstimo pessoal com nenhum deles, não temos como seguir com a análise.\nAgradeço muito a sua confiança. Fico à disposição!',
    },
  ],
};
export default licao;
