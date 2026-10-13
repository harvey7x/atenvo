/* Lição 13 — Cadastro, procurações e assinatura (módulo Fechamento).
   O fechamento: cadastro no sistema admin (de propósito vago, como o dono
   pediu), o que é uma procuração, a assinatura digital pelo gov.br e os níveis
   bronze / prata / ouro (e como subir), o fluxo da assinatura em 4 passos, os
   problemas comuns (com diagnóstico clicável), o que dizer ao cliente depois
   de assinar e como manter o relacionamento. Fecha com o checklist.
   Fatos da empresa: só os do brief. As falas do atendente são sugestões de
   roteiro. Ilustrações e interativos em 13-assinatura-figuras.tsx. */
import type { Licao } from '../tipos';
import {
  Aviso, BomRuim, Celular, Conversa, Fatos, Frase, Lista, Passos, Sanfona, Secao, Tabela, TesteRapido,
} from '../pecas';
import {
  ChecklistFechamento, DiagnosticoAssinatura, EscadaNiveis, FluxoAssinatura, LinhaTempoPos, MapaFechamento,
  PilaresAssinatura, ProcuracaoIlustrada, TelasNivel,
} from './13-assinatura-figuras';
import './13-assinatura.css';

/* Mensagem de "próximos passos" (usada no roteiro e nas mensagens prontas). */
const PROXIMOS_PASSOS =
  '[nome], recebi as procurações assinadas e conferi: está tudo certo! Muito obrigado pela confiança.\n\n' +
  'Agora o nosso advogado, Dr. Rafael Menezes, entra com uma ação pedindo o ressarcimento do que foi descontado nos últimos 10 anos nos seus empréstimos pessoais com as financeiras: o processo é sobre os juros desses empréstimos. O resultado depende da análise. Em média, o processo leva de 6 a 12 meses.\n\n' +
  'Você não paga nada agora: os honorários do advogado são 30% e só saem no final, do valor que você receber. Se alguém pedir qualquer pagamento em nome do processo, não pague e me chame aqui.\n\n' +
  'Qualquer dúvida, é só me chamar!';

const corpo = (
  <>
    <p className="mv-lead">
      Chegou a hora de fechar. Até aqui você qualificou o cliente, explicou o processo, respondeu as dúvidas e juntou
      toda a documentação: Meu INSS, gov.br e documentos pessoais. Agora faltam três coisas: <b>cadastrar</b> o cliente
      no sistema admin, que gera as <b>procurações</b>; o cliente <b>assinar</b> essas procurações pelo <b>gov.br</b>; e
      você <b>explicar o que acontece depois</b>. Parece só burocracia, mas é aqui que a venda vira processo: sem a
      procuração assinada, o advogado não tem a autorização do cliente para entrar com a ação. Nesta lição você vai
      entender o que é uma procuração, por que a assinatura pelo gov.br é segura e oficial, o que são os níveis bronze,
      prata e ouro (e como subir de nível), como é a assinatura passo a passo, o que fazer quando algo trava e o que
      dizer ao cliente depois que ele assina.
    </p>

    <Fatos itens={[
      { grande: 'Prata ou ouro', texto: 'O nível que a conta gov.br precisa ter para assinar. Conta bronze não assina.' },
      { grande: 'Banco ou facial', texto: 'Os dois jeitos de sair do bronze: validar com o banco (prata) ou o reconhecimento facial (ouro).' },
      { grande: '4 passos', texto: 'Receber a procuração, entrar no gov.br, assinar e devolver o arquivo assinado.' },
      { grande: 'Só o titular', texto: 'Quem assina e quem faz a facial é sempre o dono da conta gov.br. Ninguém faz no lugar dele.' },
    ]} />

    <Secao titulo="Onde estamos na jornada">
      <p>
        O fechamento tem cinco etapas. A primeira você já cumpriu nas lições anteriores: a documentação completa. As três
        seguintes são o assunto desta lição e passam pelas suas mãos. A última é com o advogado.
      </p>
      <MapaFechamento />
      <p>
        Repare na ordem: cada etapa depende da anterior. Sem documentação completa, não tem cadastro. Sem cadastro, não
        tem procuração. Sem procuração assinada, o advogado não pode agir. Por isso não adianta pular etapa “para
        adiantar”: o que fica faltando volta depois e atrasa tudo.
      </p>
      <Aviso tom="verde" titulo="Por que o fechamento merece capricho">
        O cliente que chegou até aqui já confiou muito em você: mandou documentos, dados, às vezes passou a senha do
        gov.br, e dedicou tempo à conversa. Se o fechamento enrolar, ele esfria e pode desistir no último metro. Se for
        rápido, claro e acolhedor, ele sai seguro de que fez a escolha certa.
      </Aviso>
    </Secao>

    <Secao titulo="1. Cadastro no sistema admin">
      <p>
        Com a documentação completa, você <b>cadastra o cliente no sistema admin</b>, o sistema interno da empresa.
        Cadastrado o cliente, <b>o sistema fornece as procurações</b>. Você não precisa escrever procuração nenhuma: o
        documento sai pronto do cadastro.
      </p>
      <Passos itens={[
        { titulo: 'Confira se a documentação está completa', texto: 'Use o checklist no fim desta lição. Cadastrar com documento faltando só atrasa: a pendência volta depois.' },
        { titulo: 'Cadastre o cliente no admin', texto: 'O passo a passo das telas você aprende com o seu gestor, na prática. Ficou em dúvida em algum campo? Pergunte antes de salvar.' },
        { titulo: 'Pegue as procurações que o sistema gera', texto: 'São elas que vão para o cliente assinar pelo gov.br.' },
      ]} />
      <p>
        Por que tanto cuidado com os dados? Uma procuração identifica quem está dando a autorização: nome, CPF, endereço.
        Um dado errado no cadastro pode virar uma procuração errada, e aí o cliente teria que assinar tudo de novo. Para
        um idoso que acabou de aprender a assinar pelo gov.br, repetir é desgastante. Antes de cadastrar, confira com
        calma:
      </p>
      <Lista itens={[
        <><b>Nome completo</b> exatamente como está na identidade, sem abreviar.</>,
        <><b>CPF</b> conferido número por número.</>,
        <><b>Endereço</b> igual ao do comprovante de residência.</>,
        <><b>E-mail</b> que o cliente usa de verdade. O e-mail é muito importante: confirme letra por letra.</>,
        <><b>Rota do familiar:</b> se a análise segue pelo benefício de um familiar, os documentos (Meu INSS, imposto de
          renda, CPF, identidade, foto do rosto, comprovante e e-mail) são do familiar que recebe. Como fica o cadastro
          nesse caso, e quem assina, confirme com o seu gestor.</>,
      ]} />
      <Aviso titulo="Sobre as telas do admin">
        Este manual não mostra as telas do sistema admin. O jeito certo de preencher você aprende com o seu gestor, no dia
        a dia. Aqui o importante é saber <b>quando</b> cadastrar (com a documentação completa) e <b>o que sai</b> do
        cadastro (as procurações).
      </Aviso>
    </Secao>

    <Secao titulo="2. O que é uma procuração (em linguagem simples)">
      <p>
        Pense numa autorização por escrito. Quando uma pessoa não pode ir resolver algo e manda um parente no lugar dela
        com uma autorização assinada, o parente pode agir em nome dela naquilo que está escrito. A <b>procuração</b> é
        isso, só que formal: é o documento em que uma pessoa autoriza outra a agir em nome dela.
      </p>
      <p>
        No nosso caso: <b>o cliente autoriza o advogado a agir em nome dele no processo</b>. É o nosso advogado, o Dr.
        Rafael Menezes, quem entra com a ação sobre os juros dos <b>empréstimos pessoais</b> que o cliente fez com as
        financeiras (Agibank, BMG, Facta, Mercantil ou Crefisa). Só que ninguém pode entrar na Justiça em nome de outra
        pessoa sem autorização dela. A procuração assinada é essa autorização: sem ela, o processo não sai do lugar.
      </p>
      <ProcuracaoIlustrada />
      <p>Os termos do documento assustam, mas cada um tem um significado simples:</p>
      <Tabela
        colunas={['Palavra no documento', 'O que quer dizer', 'No nosso caso']}
        destaque={0}
        linhas={[
          ['Outorgante', 'Quem dá a autorização', 'O cliente'],
          ['Outorgado', 'Quem recebe a autorização', 'O advogado'],
          ['Poderes', 'O que o outorgado pode fazer', 'Agir em nome do cliente no processo'],
          ['Assinatura digital', 'A assinatura feita pela internet', 'Pelo gov.br, com conta prata ou ouro'],
        ]}
      />
      <p>E, para o cliente não confundir, vale dizer também o que a procuração <b>não</b> é:</p>
      <Lista tom="nao" itens={[
        <><b>Não é empréstimo.</b> Assinar não faz o cliente pegar dinheiro nem assumir parcela nova.</>,
        <><b>Não é cobrança.</b> Assinar não custa nada. Os 30% de honorários só existem no final, tirados do valor que o cliente receber.</>,
        <><b>Não é assinar “no escuro”.</b> O cliente pode e deve ler o documento antes, com calma, e tirar dúvidas com você.</>,
      ]} />
      <BomRuim
        ruim={{
          titulo: 'Assim gera desconfiança',
          corpo: (
            <div className="mv-as-br">
              <p>“Assina aí essa procuração, é só burocracia.”</p>
              <p className="mv-as-obs">O cliente não entende o que está assinando. Na primeira dúvida (ou no primeiro parente que perguntar), trava.</p>
            </div>
          ),
        }}
        bom={{
          titulo: 'Assim o cliente entende',
          corpo: (
            <div className="mv-as-br">
              <p>“Dona Maria, a procuração é a autorização para o nosso advogado entrar, em nome da senhora, com o processo sobre os juros do seu empréstimo pessoal. Sem ela, ele não pode agir. Assinar não tem custo nenhum, e a senhora pode ler com calma antes.”</p>
              <p className="mv-as-obs">Explica para que serve, tira o medo do custo e respeita o tempo do cliente.</p>
            </div>
          ),
        }}
      />
      <TesteRapido
        pergunta="Em linguagem simples, o que a procuração faz?"
        opcoes={[
          'Faz o cliente pagar os honorários antes do processo começar',
          'Autoriza o advogado a agir em nome do cliente no processo',
          'Transforma a análise em um empréstimo novo',
        ]}
        certa={1}
        explica="A procuração é uma autorização por escrito: o cliente (outorgante) autoriza o advogado (outorgado) a agir em nome dele no processo. Não tem pagamento antecipado nem empréstimo envolvido."
      />
    </Secao>

    <Secao titulo="3. Assinatura digital pelo gov.br: segura e oficial">
      <p>
        O <b>gov.br</b> é a conta única do governo federal: o mesmo login (CPF e senha) que o cliente usa no Meu INSS e
        no Meu Imposto de Renda. Além de dar acesso a esses serviços, ele tem um serviço gratuito de <b>assinatura de
        documentos pela internet</b>. É por ele que o cliente assina as procurações, do próprio celular.
      </p>
      <PilaresAssinatura />
      <p>
        Por que isso é seguro? Primeiro, só quem tem a conta (e a senha) consegue assinar, e, para assinar, a conta
        precisa estar num nível mais confiável (prata ou ouro, como você vai ver logo abaixo). Segundo, a assinatura fica gravada
        no próprio arquivo, com o nome de quem assinou e a data, e pode ser conferida num validador oficial do governo.
        Terceiro, se alguém mexer no documento depois de assinado, a conferência mostra que ele foi alterado.
      </p>
      <Aviso tom="verde" titulo="Use isso a seu favor">
        Muitos clientes têm medo de golpe, e com razão. Lembrar que a assinatura é feita <b>no gov.br, com a conta dele,
        sem ninguém assinar no lugar</b>, ajuda a tranquilizar. Uma frase que funciona bem: “É pelo gov.br, o mesmo login
        do Meu INSS. É do governo, é oficial, e só a senhora consegue assinar com a sua conta.”
      </Aviso>
    </Secao>

    <Secao titulo="4. O nível da conta: quem assina e quem precisa subir">
      <p>
        O que são os níveis bronze, prata e ouro você já viu na lição 11. Aqui vale uma regra só: assinar um documento
        é coisa séria (vale como a assinatura no papel), por isso o gov.br só deixa assinar quem está em <b>prata ou
        ouro</b>. Cliente no bronze precisa <b>subir de nível antes</b> de receber a procuração, e é você quem orienta
        esse caminho.
      </p>
      <p>
        Pense numa escada. Do <b>bronze</b> dá para subir de dois jeitos: com o <b>banco</b> (vai para prata) ou com o
        <b> rosto</b> (vai para ouro, em geral direto, sem passar pelo prata). Toque nos degraus para ver os detalhes:
      </p>
      <EscadaNiveis />
      <Frase>Bronze não assina. Prata ou ouro: qualquer um dos dois serve.</Frase>
      <p>
        <b>Como saber o nível da conta?</b> No aplicativo gov.br, o nível aparece na área da conta. Peça para o cliente
        olhar e te dizer (ou mandar um print da tela). Faça isso <b>antes</b> de mandar a procuração: descobrir que a
        conta está em bronze só na hora de assinar frustra o cliente e trava o fechamento.
      </p>
      <p>
        Lembra da lição 11? Se, para abrir o Meu Imposto de Renda, o cliente já precisou subir de nível, a conta
        provavelmente já está em prata ou ouro e assina sem problema. Mesmo assim, confira: é uma pergunta rápida que
        evita uma tentativa frustrada.
      </p>
    </Secao>

    <Secao titulo="5. Como subir para prata: validação pelo banco">
      <p>
        O caminho para o prata é <b>validar a conta com um banco</b>. Funciona assim: quando o cliente abriu a conta no
        banco, o banco já conferiu os documentos dele. Então, quando o cliente entra com o login do banco pelo app
        gov.br, o banco “confirma” para o governo que aquela pessoa é ela mesma, e a conta sobe para prata.
      </p>
      <TelasNivel caminho="prata" />
      <p>O que o cliente precisa ter para esse caminho dar certo:</p>
      <Lista itens={[
        <>Conta em um banco que apareça na lista do app gov.br (nem todo banco está na lista).</>,
        <>Acesso ao aplicativo ou ao site desse banco: o login e a senha que ele usa para ver o saldo.</>,
        <>O aplicativo gov.br no celular, para fazer a validação.</>,
      ]} />
      <Aviso tom="rubro" titulo="Senha do banco: nunca">
        Na validação pelo banco, quem digita a senha do banco é o cliente, no celular dele. Você <b>nunca pede, nunca
        anota e nunca digita senha de banco</b>. Se o cliente oferecer, agradeça e recuse com gentileza: explique o
        caminho e deixe que ele faça sozinho, com você orientando.
      </Aviso>
      <p>Veja como pode ser essa conversa com uma cliente que está no bronze e usa o app do banco:</p>
      <Celular
        contato="Dona Maria"
        sub="cliente"
        legenda="Sugestão de roteiro, adapte ao cliente: conta bronze → prata pelo banco."
        bolhas={[
          { de: 'eu', texto: 'Dona Maria, seu cadastro está feito! Para a senhora assinar a procuração pelo gov.br, a conta precisa estar no nível prata ou ouro. Pode abrir o aplicativo gov.br e me dizer qual nível aparece?', hora: '10:12' },
          { de: 'cliente', texto: 'Aqui ta escrito bronze', hora: '10:15' },
          { de: 'eu', texto: 'Certo! É rapidinho subir. A senhora usa o aplicativo do banco no celular, aquele de ver o saldo?', hora: '10:16' },
          { de: 'cliente', texto: 'Uso sim, do banco onde cai a minha aposentadoria', hora: '10:18' },
          { de: 'eu', texto: 'Ótimo! No gov.br, toque no nível da conta, escolha aumentar e depois a opção do banco. Se o seu banco aparecer na lista, é só escolher e entrar com o login do banco. A senha do banco a senhora digita sozinha, tá? Eu nunca peço senha de banco.', hora: '10:19' },
          { de: 'cliente', texto: 'Pronto! Apareceu prata', hora: '10:26' },
          { de: 'eu', texto: 'Perfeito, Dona Maria! Agora já dá para assinar. Vou te mandar a procuração e te explico cada passo.', hora: '10:27' },
        ]}
      />
    </Secao>

    <Secao titulo="6. Como subir para ouro: reconhecimento facial">
      <p>
        O caminho para o ouro é o <b>reconhecimento facial</b> (a “facial”). O app gov.br usa a câmera do celular para
        comparar o rosto do cliente com uma foto que o governo já tem dele em cadastros oficiais. Se bater, a conta sobe
        para ouro. É o caminho natural para quem <b>não usa aplicativo de
        banco</b>, e em geral dá para ir do bronze direto para o ouro.
      </p>
      <TelasNivel caminho="ouro" />
      <p>A facial costuma falhar por detalhes simples. Antes de o cliente tentar, passe estas dicas:</p>
      <Lista itens={[
        <>Lugar <b>bem iluminado</b>, de frente para a luz (não de costas para a janela).</>,
        <>Sem <b>óculos escuros, boné ou chapéu</b>.</>,
        <>Celular <b>parado, na altura do rosto</b>, com o rosto inteiro dentro da moldura.</>,
        <>Seguir com calma as instruções que aparecem na tela.</>,
        <>Não deu na primeira? Tente de novo com mais luz. Persistindo, vá pelo banco ou leve ao gestor.</>,
      ]} />
      <Aviso tom="ambar" titulo="A facial é do próprio titular da conta">
        Ninguém pode fazer a facial no lugar do dono da conta gov.br: é o rosto dele que confirma a conta dele. Um
        familiar pode ajudar a segurar o celular e ler as instruções, mas quem aparece na câmera é sempre o titular.
        Você também não faz a facial por ele, nem mesmo se ele tiver passado a senha do gov.br.
      </Aviso>
      <p>Prata ou ouro? Os dois assinam. A escolha depende só do que o cliente consegue fazer:</p>
      <Tabela
        colunas={['', 'Prata', 'Ouro']}
        destaque={0}
        linhas={[
          ['Como sobe', 'Validando com o banco', 'Reconhecimento facial'],
          ['O que o cliente precisa', 'Conta num banco da lista e acesso ao app ou site do banco', 'Celular com câmera e uma foto dele nas bases do governo'],
          ['Assina as procurações?', 'Sim', 'Sim'],
          ['Quando escolher', 'O cliente já usa o app do banco', 'O cliente não usa banco pelo celular'],
        ]}
      />
      <TesteRapido
        pergunta="A conta gov.br do Seu Antônio está no bronze e ele não usa aplicativo de banco. Qual é o caminho mais indicado?"
        opcoes={[
          'Mandar a procuração assim mesmo: bronze também assina',
          'Pedir a senha do banco dele para fazer a validação por ele',
          'Tentar a facial no app gov.br, que leva a conta ao ouro',
        ]}
        certa={2}
        explica="Bronze não assina. Sem acesso ao banco, o caminho é a facial (ouro). E senha de banco nunca se pede: a validação pelo banco é sempre feita pelo próprio cliente."
      />
    </Secao>

    <Secao titulo="7. O fluxo da assinatura, passo a passo">
      <p>
        Com a conta em prata ou ouro, a assinatura em si é fácil. São quatro passos: <b>receber</b> a procuração,
        <b> entrar</b> no gov.br, <b>assinar</b> e <b>devolver</b> o arquivo assinado. Toque em cada passo para ver a
        tela e o que cabe ao cliente e a você:
      </p>
      <FluxoAssinatura />
      <Aviso titulo="Quem assina é o cliente">
        Você orienta, explica e confere. Mas a assinatura é do cliente, feita com a conta dele. Se aparecer um código de
        confirmação, é ele quem digita. Vale também quando o cliente passou a senha do gov.br para você pegar os
        documentos: <b>a senha serviu para buscar documentos, nunca para assinar por ele</b>. Assinar no lugar de outra
        pessoa não é atalho: é errado e põe o processo em risco.
      </Aviso>
    </Secao>

    <Secao titulo="8. Problemas comuns (e quando levar ao gestor)">
      <p>
        Quase todo travamento nesta etapa tem a ver com o nível da conta. Use o diagnóstico abaixo com um caso
        imaginário (ou com o cliente que você está atendendo) para achar o caminho:
      </p>
      <DiagnosticoAssinatura />
      <p>E aqui estão os problemas mais comuns, com o que fazer em cada um:</p>
      <Sanfona itens={[
        {
          titulo: 'A conta está em bronze',
          corpo: <p>Bronze não assina. Suba o nível antes de mandar a procuração: validar com o banco (vai para prata) ou fazer a facial (vai para ouro). O diagnóstico acima ajuda a escolher.</p>,
        },
        {
          titulo: 'O cliente não tem banco cadastrado ou não consegue entrar no banco',
          corpo: <p>Tem cliente que recebe o benefício no banco mas nunca usou o aplicativo, ou não lembra a senha. Nesse caso, vá pela facial (ouro). Recuperar o acesso ao banco é assunto do cliente com o banco dele: você não mexe em conta de banco.</p>,
        },
        {
          titulo: 'O banco do cliente não aparece na lista do gov.br',
          corpo: <p>Nem todo banco valida conta gov.br. Se o banco dele não está na lista, o caminho é a facial.</p>,
        },
        {
          titulo: 'A facial não passa',
          corpo: <p>Repita com as dicas: lugar claro, sem óculos escuros nem boné, celular parado na altura do rosto. Se continuar falhando, pode ser que o governo não tenha uma foto dele cadastrada para comparar. Aí tente o banco; sem banco, leve ao gestor.</p>,
        },
        {
          titulo: 'O cliente esqueceu a senha do gov.br',
          corpo: <p>Na tela de entrada do gov.br existe a opção de recuperar a senha. Ajude o cliente a seguir os passos, com calma. Se não conseguir, leve ao gestor.</p>,
        },
        {
          titulo: 'O cliente tem medo de assinar',
          corpo: <p>Explique de novo o que é a procuração (a autorização para o advogado agir no processo), lembre que a assinatura é pelo gov.br, que assinar não custa nada e que os 30% só existem no final, sobre o valor recebido. Se ele quiser mostrar o documento a um filho ou parente antes, tudo bem: dê tempo, sem pressão.</p>,
        },
        {
          titulo: 'Voltou só parte das procurações (ou sem assinatura)',
          corpo: <p>Confira arquivo por arquivo e peça com calma o que faltou, dizendo exatamente qual é. Sem bronca: o cliente está aprendendo uma coisa nova.</p>,
        },
      ]} />
      <Aviso tom="ambar" titulo="Quando levar ao gestor">
        Leve o caso ao seu gestor quando: o cliente não consegue nem a facial nem o banco; não consegue recuperar a senha
        do gov.br; há dúvida no cadastro (dados que não batem, análise pelo benefício de um familiar); o cliente quer
        desistir depois de assinar; ou ele faz uma pergunta jurídica que você não sabe responder. Não invente solução,
        não use atalho e não prometa prazo. Anote o que já foi tentado e passe adiante.
      </Aviso>
    </Secao>

    <Secao titulo="9. Depois da assinatura: o que dizer ao cliente">
      <p>
        A assinatura não é o fim da conversa: é o começo do processo. Recebeu e conferiu as procurações? Agora o cliente
        precisa sair dessa etapa sabendo três coisas, ditas com clareza:
      </p>
      <Passos itens={[
        { titulo: 'O advogado entra com a ação', texto: 'O Dr. Rafael Menezes, o nosso advogado, entra com uma ação pedindo o ressarcimento do que foi descontado nos últimos 10 anos nos empréstimos pessoais que o cliente fez com as financeiras. Para o cliente, diga junto: o resultado depende da análise.' },
        { titulo: 'Leva, em média, de 6 a 12 meses', texto: 'É uma média: cada processo anda no seu ritmo. Nunca prometa data.' },
        { titulo: 'Nada é pago antes; os 30% só no final', texto: 'Os honorários do advogado são 30%, tirados do valor que o cliente receber, no final do processo. A conta com exemplo está na lição 2.' },
      ]} />
      <Aviso titulo="Use o nome certo: empréstimo pessoal, não consignado">
        O processo é sobre os juros do <b>empréstimo pessoal</b>, e é fácil o cliente confundir os dois. O <b>consignado</b> é
        descontado pelo INSS direto do benefício, antes de o dinheiro cair na conta. O <b>empréstimo pessoal</b> é um
        contrato direto com a financeira e é cobrado por ela, fora do INSS; tem juros livres, em geral bem mais altos, e
        é nele que aparecem os juros abusivos que a CAF revisa. Se o cliente perguntar, explique assim, em linguagem
        simples. A diferença completa está na lição 3.
      </Aviso>
      <LinhaTempoPos />
      <p>
        Repare no tom. O cliente está feliz e ansioso ao mesmo tempo, e vai querer saber “quanto” e “quando”. É aí que
        mora o perigo de prometer o que não depende de você:
      </p>
      <BomRuim
        ruim={{
          titulo: 'Assim promete o que não pode',
          corpo: (
            <div className="mv-as-br">
              <p>“Pronto! Agora é só esperar o dinheiro cair.”</p>
              <p>“Em 6 meses a senhora recebe uns 15 mil.”</p>
              <p className="mv-as-obs">Promete valor e data que ninguém sabe ainda. Se não acontecer, o cliente se sente enganado. E depois some da conversa.</p>
            </div>
          ),
        }}
        bom={{
          titulo: 'Assim informa com honestidade',
          corpo: (
            <Lista itens={[
              'Agradece e confirma que conferiu.',
              'Explica o próximo passo (a ação) e que o resultado depende da análise.',
              'Dá o prazo médio (6 a 12 meses), sem prometer data.',
              'Lembra: nada pago antes; 30% só no final, do valor recebido.',
              'Deixa o canal aberto para dúvidas.',
            ]} />
          ),
        }}
      />
      <Conversa
        titulo="Fechamento depois da assinatura"
        nota="Sugestão de roteiro, adapte ao cliente"
        falas={[
          { quem: 'eu', texto: 'Dona Maria, recebi as procurações assinadas e conferi: está tudo certo! Muito obrigado pela confiança.' },
          { quem: 'eu', texto: 'Agora o próximo passo é com o nosso advogado, o Dr. Rafael Menezes: ele entra com uma ação pedindo o ressarcimento do que foi descontado nos últimos 10 anos nos seus empréstimos pessoais. O resultado depende da análise.' },
          { quem: 'cliente', texto: 'É sobre aquele desconto que o INSS faz no meu benefício?' },
          { quem: 'eu', texto: 'Não, Dona Maria. O desconto que o INSS faz direto no benefício é o consignado. O processo é sobre os juros do empréstimo pessoal: o contrato que a senhora fez direto com a financeira, que ela cobra fora do INSS.' },
          { quem: 'cliente', texto: 'E demora muito?' },
          { quem: 'eu', texto: 'Em média, o processo leva de 6 a 12 meses. Cada processo anda no seu ritmo, então não dá para cravar uma data, mas eu sigo aqui com a senhora.' },
          { quem: 'cliente', texto: 'E eu tenho que pagar alguma coisa?' },
          { quem: 'eu', texto: 'Nada agora, Dona Maria. Os honorários do advogado são 30% e só saem no final, tirados do valor que a senhora receber. E atenção: se alguém pedir qualquer pagamento em nome do processo, não pague e me chame aqui.' },
          { quem: 'eu', texto: 'Qualquer dúvida, é só me chamar aqui. Estou à disposição.' },
        ]}
      />
      <Aviso tom="rubro" titulo="Na hora de fechar, avise sobre golpes">
        Depois da assinatura, deixe claro para o cliente: <b>o processo não tem nenhum pagamento antecipado</b>. Se
        alguém pedir dinheiro, Pix ou “taxa para liberar” em nome do processo, ele não paga e fala com você. Os golpes
        mais comuns e como proteger o cliente estão na lição 14.
      </Aviso>
      <TesteRapido
        pergunta="Dona Lúcia acabou de assinar e pergunta: “E agora, quanto eu vou receber e quando?”. Qual resposta está certa?"
        opcoes={[
          '“Fica tranquila, Dona Lúcia: em uns 6 meses cai por volta de 10 mil na sua conta, já descontada a parte do advogado.”',
          '“O advogado entra com a ação: leva em média de 6 a 12 meses. O resultado depende da análise e nada é pago antes.”',
          '“Isso eu não sei dizer, Dona Lúcia. Agora é tudo com o advogado, e qualquer novidade ele mesmo avisa a senhora.”',
        ]}
        certa={1}
        explica="Explique os próximos passos com honestidade: a ação, o prazo médio, que o resultado depende da análise e que nada é pago antes. Nunca prometa valor nem data, e não largue o cliente com um “não sei”."
      />
    </Secao>

    <Secao titulo="10. Como manter o relacionamento">
      <p>
        Depois de assinar, o cliente vai passar meses esperando. É nesse período que ele decide se confia na CAF de
        verdade. O cliente não pode sentir que você só queria a assinatura. Algumas atitudes fazem toda a diferença:
      </p>
      <Lista itens={[
        <><b>Agradeça.</b> O cliente confiou documentos, dados e tempo a você.</>,
        <><b>Combine como ele vai ter notícias.</b> Como e quando dar atualizações do processo, combine com o seu gestor e conte ao cliente, para ele não ficar no escuro. O jeito de retomar contato está na lição 9.</>,
        <><b>Responda com paciência.</b> Ele vai perguntar “e aí, saiu?” mais de uma vez. É normal: são meses de espera.</>,
        <><b>Nunca prometa valor nem data.</b> Fale em “média”, “análise” e “possibilidade”.</>,
        <><b>Reforce sempre:</b> nada é pago antes; os 30% só saem no final, do valor recebido.</>,
        <><b>Senha:</b> se o cliente passou a senha do gov.br para você, ajude-o a trocar (como fazer: lição 10).</>,
        <><b>Família:</b> se ele contar que um parente também recebe do INSS e tem empréstimo pessoal com uma das cinco financeiras (Agibank, BMG, Facta, Mercantil ou Crefisa), ofereça a análise gratuita para esse parente também.</>,
        <><b>Registre</b> o que foi feito e combinado na conversa, para qualquer colega conseguir continuar o atendimento.</>,
      ]} />
      <Frase>A assinatura fecha a venda. O jeito como você trata o cliente depois dela é o que constrói a confiança.</Frase>
    </Secao>

    <Secao titulo="Checklist de fechamento">
      <p>
        Use esta lista a cada cliente. Ela junta a documentação das lições anteriores com as etapas desta lição. A ordem
        dos documentos é só uma sugestão: o cliente pode mandar primeiro o que tiver. Na rota do familiar, os documentos
        são do familiar que recebe o benefício. Só dê o fechamento por concluído quando tudo estiver marcado.
      </p>
      <ChecklistFechamento />
    </Secao>

    <Secao titulo="Resumo da lição">
      <Lista itens={[
        <>Com a <b>documentação completa</b>, você cadastra o cliente no <b>sistema admin</b>; o cadastro gera as <b>procurações</b>. Confira os dados antes.</>,
        <><b>Procuração</b> é uma autorização por escrito: o cliente (outorgante) autoriza o advogado (outorgado) a agir em nome dele no processo.</>,
        <>A assinatura é <b>digital, pelo gov.br</b>: oficial, segura e sem sair de casa. Conta <b>bronze não assina</b>: precisa subir para <b>prata</b> (validação pelo banco) ou <b>ouro</b> (reconhecimento facial, feito só pelo titular da conta).</>,
        <>Assinar tem <b>4 passos</b>: receber, entrar no gov.br, assinar e devolver. Quem assina é o cliente; senha de banco você nunca pede. Na volta, confira arquivo por arquivo.</>,
        <>Travou (sem banco, facial não passa, senha perdida)? <b>Leve ao gestor</b>, sem atalhos.</>,
        <>Depois de assinar: o advogado entra com a ação sobre os juros dos <b>empréstimos pessoais</b> do cliente (não do consignado); em média, <b>6 a 12 meses</b>; nada pago antes, <b>30% só no final</b>. Agradeça, não prometa valor nem data e mantenha o contato.</>,
      ]} />
    </Secao>
  </>
);

const licao: Licao = {
  id: 'assinatura',
  modulo: 'fechamento',
  titulo: 'Cadastro, procurações e assinatura',
  resumo: 'Cadastrar no admin, entender a procuração, deixar o gov.br em prata ou ouro, assinar em 4 passos e explicar o que vem depois.',
  minutos: 28,
  corpo,
  questoes: [
    {
      p: 'Em qual nível a conta gov.br NÃO consegue assinar as procurações?',
      o: ['Ouro', 'Prata', 'Bronze'],
      c: 2,
      e: 'Bronze não assina. Para assinar, a conta precisa estar em prata (validação pelo banco) ou ouro (reconhecimento facial).',
    },
    {
      p: 'Como o cliente sobe a conta gov.br do bronze para o prata?',
      o: [
        'Validando a conta com o banco dele, no app gov.br',
        'Mandando foto da identidade para a CAF no WhatsApp',
        'Passando a senha do banco para o atendente validar',
      ],
      c: 0,
      e: 'Prata se consegue validando com o banco: o cliente entra com o login do banco dele pelo app gov.br. A senha do banco é só dele; você nunca pede.',
    },
    {
      p: 'O que é a procuração que o cliente assina pelo gov.br?',
      o: [
        'Um contrato de empréstimo com desconto no benefício',
        'A autorização para o advogado agir no processo',
        'O recibo do pagamento dos honorários do advogado',
      ],
      c: 1,
      e: 'A procuração é uma autorização por escrito: o cliente (outorgante) autoriza o advogado (outorgado) a agir em nome dele no processo. Não é empréstimo nem cobrança.',
    },
    {
      p: 'Em que momento você cadastra o cliente no sistema admin?',
      o: [
        'Logo no primeiro contato, para adiantar',
        'Depois que o cliente assinar a procuração',
        'Com a documentação completa',
      ],
      c: 2,
      e: 'Com a documentação completa, você cadastra o cliente no admin, e é o cadastro que gera as procurações. Por isso a assinatura vem depois do cadastro, não antes.',
    },
    {
      p: 'Quem pode fazer o reconhecimento facial que leva a conta gov.br ao nível ouro?',
      o: [
        'O filho que ajuda o cliente com o celular',
        'Só o próprio titular da conta gov.br',
        'O atendente, com a senha que o cliente passou',
      ],
      c: 1,
      e: 'A facial confirma que a conta é de quem aparece na câmera: só o titular pode fazer. Um familiar pode segurar o celular, mas o rosto tem que ser o do dono da conta.',
    },
  ],
  glossario: [
    { termo: 'Sistema admin', def: 'O sistema interno onde você cadastra o cliente depois que a documentação está completa. O cadastro gera as procurações.' },
    { termo: 'Procuração', def: 'Documento em que uma pessoa autoriza outra a agir em nome dela. Aqui, o cliente autoriza o advogado a agir no processo.' },
    { termo: 'Outorgante', def: 'Quem dá a autorização na procuração. No nosso caso, o cliente.' },
    { termo: 'Outorgado', def: 'Quem recebe a autorização na procuração. No nosso caso, o advogado.' },
    { termo: 'Assinatura digital gov.br', def: 'Assinatura feita pela internet com a conta gov.br, gratuita e oficial. Fica gravada no arquivo com nome e data de quem assinou. Só conta prata ou ouro assina.' },
    { termo: 'Validação pelo banco', def: 'Jeito de subir a conta gov.br para prata: o cliente entra com o login do banco dele pelo app gov.br, e o banco confirma que é ele.' },
    { termo: 'Reconhecimento facial', def: 'Jeito de subir a conta gov.br para ouro: a câmera do celular compara o rosto do titular da conta com uma foto que o governo já tem dele.' },
  ],
  mensagens: [
    {
      titulo: 'Descobrir o nível da conta gov.br',
      quando: 'Antes de mandar a procuração, para saber se a conta já assina.',
      texto: 'Oi, [nome]! Seu cadastro está feito. Antes de te mandar a procuração, uma pergunta rápida: abre o aplicativo gov.br no seu celular e me fala qual nível aparece na sua conta: bronze, prata ou ouro? Se preferir, me manda um print da tela.',
    },
    {
      titulo: 'Subir para prata pelo banco',
      quando: 'A conta está em bronze e o cliente usa aplicativo de banco.',
      texto: 'Para assinar, a sua conta gov.br precisa estar no nível prata ou ouro. Dá para subir rapidinho pelo banco:\n1. Abra o aplicativo gov.br\n2. Toque no nível da sua conta e escolha aumentar o nível\n3. Escolha validar com banco e procure o seu banco na lista\n4. Entre com o login do seu banco para confirmar\nA senha do banco é só sua: digite você mesmo(a), eu nunca vou pedir. Me avisa quando aparecer prata!',
    },
    {
      titulo: 'Subir para ouro pela facial',
      quando: 'A conta está em bronze e o cliente não usa banco pelo celular.',
      texto: 'Outro jeito de deixar a sua conta pronta para assinar é o reconhecimento facial, que leva a conta para o nível ouro:\n1. Abra o aplicativo gov.br\n2. Toque no nível da sua conta e escolha aumentar o nível\n3. Escolha o reconhecimento facial\n4. Siga as instruções da câmera\nQuem aparece na câmera tem que ser você, o dono da conta. Alguém da família pode segurar o celular para ajudar.\nDica: fique num lugar bem claro, sem óculos escuros nem boné, com o celular parado na altura do rosto. Se não der certo, me chama que a gente vê junto.',
    },
    {
      titulo: 'Enviar a procuração para assinar',
      quando: 'A conta já está em prata ou ouro e as procurações foram geradas.',
      texto: 'Oi, [nome]! Vou te mandar agora a procuração. Ela é a autorização para o nosso advogado entrar, em seu nome, com o processo sobre os juros do seu empréstimo pessoal. Assinar não tem custo nenhum, e é pelo gov.br, o mesmo login do Meu INSS. Pode ler com calma, e eu te ajudo em cada passo da assinatura.',
    },
    {
      titulo: 'Depois de assinar: próximos passos',
      quando: 'Assim que você receber e conferir as procurações assinadas.',
      texto: PROXIMOS_PASSOS,
    },
  ],
};
export default licao;
